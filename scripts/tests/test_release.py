"""Offline publication guards: no actual GitHub submissions or real credentials."""
import contextlib
import base64
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).resolve().parents[1] / 'publish-release.py')
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.apk = b'public fake APK fixture'
        self.manifest = dict(tag='v0.1.0-test.9', filename='SafeCore-0.1.0-test.9.apk',
                             artifact_commit='a' * 40, sha256=hashlib.sha256(self.apk).hexdigest(),
                             certificate_sha256='b' * 64, debug_tools=False)
        self.environment = dict(GITHUB_REPOSITORY='example/safecore',
                                GITHUB_REF='refs/tags/v0.1.0-test.9', GITHUB_TOKEN='public-test-token')
        self.release = dict(id=123, draft=True, assets=[],
                            upload_url='https://uploads.github.com/repos/example/safecore/releases/123/assets{?name}')
        self.requests = []
        self.notice = (Path(__file__).resolve().parents[2] / 'RISK_NOTICE.md').read_text(encoding='utf-8')

    def run_publish(self, *, existing=None, bad_bytes=False):
        def request(req, **kwargs):
            self.requests.append(req)
            if '/releases/tags/' in req.full_url:
                if existing is None:
                    raise urllib.error.HTTPError(req.full_url, 404, 'not found', {}, None)
                result = existing
            elif req.method == 'POST' and req.full_url.endswith('/releases'):
                result = self.release
            elif req.method == 'PATCH':
                result = {'html_url':'https://github.com/example/safecore/releases/tag/v0.1.0-test.9'}
            else:
                result = {'state':'uploaded'}
            return io.BytesIO(json.dumps(result).encode())

        with patch.dict(os.environ, self.environment, clear=True), \
             patch.object(publisher.Path, 'read_text', side_effect=[json.dumps(self.manifest), self.notice]), \
             patch.object(publisher.subprocess, 'run') as run, \
             patch.object(publisher.subprocess, 'check_output', side_effect=[
                 'a' * 40 + '\n', b'changed' if bad_bytes else self.apk]), \
             patch.object(publisher.urllib.request, 'urlopen', side_effect=request), \
             contextlib.redirect_stdout(io.StringIO()):
            publisher.main()
        return run

    def test_draft_upload_then_publish(self):
        run = self.run_publish()
        self.assertIn('whippet/tests/android_bundle.py', run.call_args_list[1].args[0])
        self.assertEqual([r.method for r in self.requests], ['GET','POST','POST','POST','PATCH'])
        self.assertTrue(json.loads(self.requests[1].data)['draft'])
        self.assertIn(self.notice, json.loads(self.requests[1].data)['body'])
        self.assertEqual(json.loads(self.requests[-1].data),
                         {'draft':False, 'prerelease':True, 'make_latest':'false'})

    def test_bad_hash_stops_before_network(self):
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.run_publish(bad_bytes=True)
        self.assertEqual(self.requests, [])

    def test_private_artifact_fetch_uses_ephemeral_scoped_credentials(self):
        run = self.run_publish()
        fetch = run.call_args_list[0]
        self.assertEqual(fetch.args[0], ['git', '-c', 'credential.helper=',
                         'fetch', '--depth=1', 'https://github.com/example/safecore.git',
                         'refs/heads/release-artifacts/v0.1.0-test.9'])
        environment = fetch.kwargs['env']
        self.assertEqual(environment['GIT_CONFIG_COUNT'], '1')
        self.assertEqual(environment['GIT_CONFIG_KEY_0'], 'http.https://github.com/.extraheader')
        expected = base64.b64encode(b'x-access-token:public-test-token').decode()
        self.assertEqual(environment['GIT_CONFIG_VALUE_0'], 'AUTHORIZATION: basic ' + expected)
        self.assertEqual(environment['GIT_TERMINAL_PROMPT'], '0')
        self.assertNotIn(self.environment['GITHUB_TOKEN'], ' '.join(fetch.args[0]))
        self.assertNotIn('env', run.call_args_list[1].kwargs)

    def test_bad_tag_stops_before_network(self):
        self.environment['GITHUB_REF'] = 'refs/heads/main'
        with self.assertRaisesRegex(ValueError, 'Tag'):
            self.run_publish()
        self.assertEqual(self.requests, [])

    def test_debug_build_stops_before_network(self):
        self.manifest['debug_tools'] = True
        with self.assertRaisesRegex(ValueError, 'debugging'):
            self.run_publish()
        self.assertEqual(self.requests, [])

    def test_never_overwrite_published_release(self):
        with self.assertRaisesRegex(RuntimeError, 'already published'):
            self.run_publish(existing={**self.release, 'draft':False})
        self.assertEqual(len(self.requests), 1)

    def test_bad_upload_host_stops_before_token_send(self):
        self.release['upload_url'] = 'https://attacker.example/upload'
        with self.assertRaisesRegex(ValueError, 'upload destination'):
            self.run_publish(existing=self.release)
        self.assertEqual(len(self.requests), 1)

    def test_conflicting_draft_asset_requires_review(self):
        self.release['assets'] = [{'name':self.manifest['filename'], 'digest':'different', 'state':'uploaded'}]
        with self.assertRaisesRegex(RuntimeError, 'manual review'):
            self.run_publish(existing=self.release)
        self.assertEqual(len(self.requests), 1)


if __name__ == '__main__':
    unittest.main()
