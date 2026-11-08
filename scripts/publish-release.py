"""Publish a locally verified APK; never handles Android signing private keys."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request


def main():
    manifest = json.loads(Path('release/manifest.json').read_text())
    tag = manifest['tag']
    filename = manifest['filename']
    commit = manifest['artifact_commit']
    digest = manifest['sha256']
    repository = os.environ['GITHUB_REPOSITORY']
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
        raise ValueError('Invalid repository')
    if not re.fullmatch(r'v[0-9.]+-test\.[0-9]+', tag):
        raise ValueError('Invalid prerelease tag')
    if os.environ['GITHUB_REF'] != 'refs/tags/' + tag:
        raise ValueError('Tag does not match reviewed manifest')
    if not re.fullmatch(r'[0-9a-f]{40}', commit) or not re.fullmatch(r'[0-9a-f]{64}', digest):
        raise ValueError('Invalid pinned artifact identity')
    if not re.fullmatch(r'SafeCore-[0-9.]+-test\.[0-9]+\.apk', filename):
        raise ValueError('Invalid artifact name')
    if manifest['debug_tools'] is not False:
        raise ValueError('Refusing a debugging-enabled release')
    token = os.environ['GITHUB_TOKEN']
    # Private repositories need authentication for the separate artifact fetch.
    # Scope the short-lived token to this subprocess and GitHub HTTPS only;
    # never put credentials in a remote URL, command arguments or Git config.
    git_environment = os.environ.copy()
    git_environment.update({
        'GIT_CONFIG_COUNT': '1',
        'GIT_CONFIG_KEY_0': 'http.https://github.com/.extraheader',
        'GIT_CONFIG_VALUE_0': 'AUTHORIZATION: basic ' + base64.b64encode(
            ('x-access-token:' + token).encode()).decode(),
        'GIT_TERMINAL_PROMPT': '0',
    })
    branch = 'refs/heads/release-artifacts/' + tag
    subprocess.run(['git', '-c', 'credential.helper=', 'fetch', '--depth=1',
                    'https://github.com/' + repository + '.git', branch],
                   check=True, env=git_environment)
    actual = subprocess.check_output(['git', 'rev-parse', 'FETCH_HEAD'], text=True).strip()
    if actual != commit:
        raise ValueError('Artifact branch differs from the reviewed commit')
    apk = subprocess.check_output(['git', 'show', commit + ':' + filename])
    if hashlib.sha256(apk).hexdigest() != digest:
        raise ValueError('APK checksum mismatch')
    with tempfile.TemporaryDirectory(prefix='safecore-release-') as directory:
        target = Path(directory) / filename
        target.write_bytes(apk)
        # Check the actual signed binary, not only manifest claims. No local bypass.
        subprocess.run(['python3', 'scripts/verify-apk.py', str(target)], check=True)
        subprocess.run(['python3', 'whippet/tests/android_bundle.py', str(target)], check=True)
    checksum = (digest + '  ' + filename + '\n').encode()
    base = 'https://api.github.com/repos/' + repository

    def api(url, method='GET', data=None, content_type='application/json'):
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != 'https' or parsed.hostname not in {'api.github.com', 'uploads.github.com'}:
            raise ValueError('Unexpected API destination')
        request = urllib.request.Request(url, data=data, method=method, headers={
            'Authorization': 'Bearer ' + token,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': content_type,
            'User-Agent': 'SafeCore-release-publisher',
        })
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.load(response)

    try:
        release = api(base + '/releases/tags/' + tag)
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        body = (
            Path('RISK_NOTICE.md').read_text(encoding='utf-8') + '\n\n' +
            'Development prerelease for expendable amounts; not independently audited.\n\n'
            'Android 8.0+. Debugging disabled; screenshots blocked by default. Fresh installs contain no wallets.\n\n'
            'Uses the existing development signing identity, not production release signing. '
            'Back up before changing installations; do not uninstall to bypass signature errors.\n\n'
            'APK SHA-256: `' + digest + '`\n\n'
            'Signing certificate SHA-256: `' + manifest['certificate_sha256'] + '`\n\n'
            + ('What changed:\n\n' + '\n'.join('- ' + change for change in manifest.get('changes', [])) + '\n\n' if manifest.get('changes') else '') +
            'See docs/RELEASES.md and whippet/README.md in the tagged source for limitations.'
        )
        release = api(base + '/releases', 'POST', json.dumps({
            'tag_name': tag, 'name': 'SafeCore ' + tag + ' — Android prerelease',
            'body': body, 'draft': True, 'prerelease': True,
        }).encode())
    if not release['draft']:
        raise RuntimeError('Release is already published; refusing to replace its assets')
    upload = release['upload_url'].split('{', 1)[0]
    if not upload.startswith('https://uploads.github.com/repos/' + repository + '/releases/'):
        raise ValueError('Unexpected upload destination')
    assets = {asset['name']: asset for asset in release['assets']}
    for name, payload, content_type in [
        (filename, apk, 'application/vnd.android.package-archive'),
        ('SHA256SUMS.txt', checksum, 'text/plain'),
    ]:
        if name in assets:
            expected = 'sha256:' + hashlib.sha256(payload).hexdigest()
            if assets[name].get('digest') != expected or assets[name].get('state') != 'uploaded':
                raise RuntimeError('Existing draft asset differs; manual review required')
            continue
        api(upload + '?name=' + urllib.parse.quote(name), 'POST', payload, content_type)
    result = api(base + '/releases/' + str(release['id']), 'PATCH', json.dumps({
        'draft': False, 'prerelease': True, 'make_latest': 'false',
    }).encode())
    print('Published:', result['html_url'])


if __name__ == '__main__':
    main()
