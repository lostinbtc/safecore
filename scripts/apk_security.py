"""Read-only APK publication checks. No signing keys, devices or network calls."""
import hashlib
import os
from pathlib import Path
import re
import subprocess


def validate_manifest(manifest, policy):
    if policy.get('channel') != 'development':
        raise ValueError('Signing-channel migration requires an explicit policy review')
    if not re.fullmatch(r'[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+', policy.get('application_id', '')):
        raise ValueError('Invalid approved application ID')
    certificate = policy.get('certificate_sha256', '')
    if not re.fullmatch(r'[0-9a-f]{64}', certificate) or manifest.get('certificate_sha256') != certificate:
        raise ValueError('Manifest certificate differs from approved signing policy')
    if not re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+-test\.[1-9][0-9]*', manifest.get('tag', '')):
        raise ValueError('Invalid prerelease tag')
    if manifest.get('filename') != 'SafeCore-' + manifest['tag'][1:] + '.apk':
        raise ValueError('APK filename differs from reviewed version')
    if not re.fullmatch(r'[0-9a-f]{64}', manifest.get('sha256', '')):
        raise ValueError('Invalid APK checksum')
    if type(manifest.get('version_code')) is not int or not 0 < manifest['version_code'] <= 2100000000:
        raise ValueError('Invalid Android version code')
    if manifest.get('debug_tools') is not False:
        raise ValueError('Refusing a debugging-enabled release')
    if (type(policy.get('min_sdk')) is not int or type(policy.get('target_sdk')) is not int
            or not 26 <= policy['min_sdk'] <= policy['target_sdk']
            or not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', policy.get('build_tools', ''))):
        raise ValueError('Invalid reviewed Android SDK policy')


def sdk_tools(policy, sdk=None):
    root = sdk or os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT')
    if not root:
        raise ValueError('Set ANDROID_HOME to an Android SDK with the reviewed build-tools version')
    directory = Path(root) / 'build-tools' / policy['build_tools']
    tools = {name: directory / name for name in ('apksigner', 'aapt')}
    if any(not p.is_file() or not os.access(p, os.X_OK) for p in tools.values()):
        raise ValueError('Required Android build tools are unavailable; verification cannot be skipped')
    return tools


def command(args):
    # Do not echo tool output on failure: only approved metadata is reported.
    try:
        return subprocess.run([str(arg) for arg in args], check=True, capture_output=True,
                              text=True, timeout=60).stdout
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as error:
        raise ValueError('Android APK verification tool failed; refusing artifact') from error


def check_signature(output, expected):
    digests = re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]{64})$', output, re.M)
    signers = re.findall(r'^Number of signers: (\d+)$', output, re.M)
    if signers != ['1'] or len(digests) != 1 or digests[0].lower() != expected:
        raise ValueError('APK signer does not match the approved certificate')
    if not re.search(r'^Verified using v2 scheme \(APK Signature Scheme v2\): true$', output, re.M):
        raise ValueError('APK must verify with v2 signing for the supported Android versions')


def check_badging(output, manifest, policy, local=False):
    packages = re.findall(r"^package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'", output, re.M)
    if len(packages) != 1:
        raise ValueError('APK package metadata is missing or ambiguous')
    package, code, version = packages[0]
    if package != policy['application_id'] or int(code) != manifest['version_code']:
        raise ValueError('APK package or version code differs from reviewed identity')
    expected = manifest['tag'][1:]
    if version != expected and not (local and re.fullmatch(re.escape(expected) + r'-local\.[a-z0-9-]{1,32}', version)):
        raise ValueError('APK version name differs from reviewed release; local builds cannot be published')
    for label, expected_sdk in [('sdkVersion', policy['min_sdk']), ('targetSdkVersion', policy['target_sdk'])]:
        if re.findall(r"^" + label + r":'([0-9]+)'$", output, re.M) != [str(expected_sdk)]:
            raise ValueError('APK Android SDK range differs from reviewed policy')
    if re.search(r'^application-debuggable(?:\s|$)', output, re.M):
        raise ValueError('APK is actually debuggable, regardless of release manifest claims')
    return version


def check_application(output):
    # Inspect only direct attributes on <application>, not similarly named child attributes.
    attributes, found, depth = {}, False, None
    for line in output.splitlines():
        stripped = line.lstrip()
        indent = len(line) - len(stripped)
        if re.match(r'E: application(?:\s|$)', stripped):
            if found:
                raise ValueError('Duplicate APK application metadata')
            found, depth = True, indent
            continue
        if depth is not None:
            if stripped.startswith('E:') and indent <= depth:
                depth = None
            elif indent == depth + 2 and stripped.startswith('A: android:'):
                match = re.match(r'A: android:([A-Za-z]+)\(0x[0-9a-f]+\)=(.*)', stripped)
                if match:
                    name, value = match.groups()
                    if name in attributes:
                        raise ValueError('Duplicate application attribute')
                    attributes[name] = value
    if not found:
        raise ValueError('Missing APK application metadata')
    false = '(type 0x12)0x0'
    for name in ('allowBackup', 'fullBackupContent', 'usesCleartextTraffic'):
        if attributes.get(name) != false:
            raise ValueError('APK must explicitly disable ' + name)
    for name in ('debuggable', 'testOnly'):
        if name in attributes and attributes[name] != false:
            raise ValueError('APK must not enable ' + name)


def verify_apk(apk, manifest, policy, *, local=False, sdk=None):
    validate_manifest(manifest, policy)
    apk = Path(apk).resolve(strict=True)
    hasher = hashlib.sha256()
    with apk.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            hasher.update(chunk)
    digest = hasher.hexdigest()
    if not local and digest != manifest['sha256']:
        raise ValueError('APK checksum mismatch')
    tools = sdk_tools(policy, sdk)
    check_signature(command([tools['apksigner'], 'verify', '--verbose', '--print-certs', apk]), policy['certificate_sha256'])
    version = check_badging(command([tools['aapt'], 'dump', 'badging', apk]), manifest, policy, local)
    check_application(command([tools['aapt'], 'dump', 'xmltree', apk, 'AndroidManifest.xml']))
    return {'sha256': digest, 'certificate_sha256': policy['certificate_sha256'],
            'application_id': policy['application_id'], 'version_name': version,
            'version_code': manifest['version_code'], 'publication_check': not local}
