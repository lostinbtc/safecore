"""Offline publication guards: no actual GitHub submissions or real credentials."""
import contextlib
import copy
import base64
import hashlib
import importlib.util
import io
import json
import os
import subprocess
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
                             certificate_sha256='b' * 64, debug_tools=False, version_code=9,
                             changes=['Public fixture change summary.'])
        self.environment = dict(GITHUB_REPOSITORY='example/safecore',
                                GITHUB_REF='refs/tags/v0.1.0-test.9', GITHUB_TOKEN='public-test-token',
                                GITHUB_SHA='c' * 40)
        self.release = dict(id=123, draft=True, assets=[],
                            upload_url='https://uploads.github.com/repos/example/safecore/releases/123/assets{?name}')
        self.requests = []
        self.check_requests = []
        self.checks = {}
        for number, (workflow, name) in enumerate((('tests.yml', 'wallet'),
                ('android-security.yml', 'Native storage and authentication (Android 35)')), 1):
            self.checks[workflow] = dict(total_count=1, workflow_runs=[dict(
                id=number, run_number=number, run_attempt=1, head_sha='c' * 40,
                head_branch='main', event='push', path='.github/workflows/' + workflow,
                status='completed', conclusion='success')])
            self.checks[str(number)] = dict(total_count=1, jobs=[dict(name=name,
                head_sha='c' * 40, status='completed', conclusion='success')])
        self.notice = (Path(__file__).resolve().parents[2] / 'RISK_NOTICE.md').read_text(encoding='utf-8')

    def check_response(self, url):
        self.check_requests.append(url)
        if '/actions/workflows/' in url:
            self.assertIn('head_sha=' + 'c' * 40, url)
            self.assertIn('branch=main&event=push', url)
            return self.checks[url.split('/workflows/')[1].split('/')[0]]
        self.assertIn('/attempts/1/jobs?', url)
        return self.checks[url.split('/runs/')[1].split('/')[0]]

    def run_publish(self, *, existing=None, bad_bytes=False, verification_failure=False):
        def request(req, **kwargs):
            if '/actions/' in req.full_url:
                self.assertEqual(req.method, 'GET')
                return io.BytesIO(json.dumps(self.check_response(req.full_url)).encode())
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

        def run_command(args, **kwargs):
            if verification_failure and 'scripts/verify-apk.py' in args:
                raise subprocess.CalledProcessError(1, args)

        with patch.dict(os.environ, self.environment, clear=True), \
             patch.object(publisher.Path, 'read_text', side_effect=[json.dumps(self.manifest), self.notice]), \
             patch.object(publisher.subprocess, 'run', side_effect=run_command) as run, \
             patch.object(publisher.subprocess, 'check_output', side_effect=[
                 'a' * 40 + '\n', b'changed' if bad_bytes else self.apk, 'c' * 40 + '\n']), \
             patch.object(publisher.urllib.request, 'urlopen', side_effect=request), \
             contextlib.redirect_stdout(io.StringIO()):
            publisher.main()
        return run

    def test_draft_upload_then_publish(self):
        run = self.run_publish()
        self.assertEqual(len(self.check_requests), 4)
        self.assertIn('scripts/verify-apk.py', run.call_args_list[1].args[0])
        self.assertNotIn('--local', run.call_args_list[1].args[0])
        self.assertIn('whippet/tests/android_bundle.py', run.call_args_list[2].args[0])
        self.assertEqual([r.method for r in self.requests], ['GET','POST','POST','POST','PATCH'])
        self.assertTrue(json.loads(self.requests[1].data)['draft'])
        self.assertIn(self.notice, json.loads(self.requests[1].data)['body'])
        self.assertIn('Public fixture change summary.', json.loads(self.requests[1].data)['body'])
        self.assertEqual(json.loads(self.requests[-1].data),
                         {'draft':False, 'prerelease':True, 'make_latest':'false'})

    def test_bad_hash_stops_before_network(self):
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.run_publish(bad_bytes=True)
        self.assertEqual(self.requests, [])

    def test_binary_verification_failure_stops_before_any_release_api(self):
        with self.assertRaises(subprocess.CalledProcessError):
            self.run_publish(verification_failure=True)
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

    def test_check_failures_never_reach_release_api(self):
        original = copy.deepcopy(self.checks)
        mutations = [
            ('head_sha', 'd' * 40), ('head_branch', 'feature'),
            ('event', 'pull_request'), ('path', '.github/workflows/other.yml'),
            ('status', 'queued'), ('status', 'in_progress'),
            *[('conclusion', value) for value in ['failure', 'cancelled', 'skipped', 'neutral', 'timed_out', None]],
        ]
        for workflow in ('tests.yml', 'android-security.yml'):
            for field, value in mutations:
                with self.subTest(workflow=workflow, field=field, value=value):
                    self.checks = copy.deepcopy(original)
                    self.checks[workflow]['workflow_runs'][0][field] = value
                    with self.assertRaises(RuntimeError):
                        self.run_publish()
                    self.assertEqual(self.requests, [])

    def test_missing_truncated_and_newer_failed_run_block(self):
        original = copy.deepcopy(self.checks)
        for case in ('missing', 'truncated', 'newer-failed'):
            with self.subTest(case=case):
                self.checks = copy.deepcopy(original)
                result = self.checks['tests.yml']
                if case == 'missing':
                    result.update(total_count=0, workflow_runs=[])
                elif case == 'truncated':
                    result['total_count'] = 101
                else:
                    result['workflow_runs'].append({**result['workflow_runs'][0],
                        'id': 3, 'run_number': 3, 'conclusion': 'failure'})
                    result['total_count'] = 2
                with self.assertRaises(RuntimeError):
                    self.run_publish()
                self.assertEqual(self.requests, [])

    def test_required_jobs_must_really_run_and_pass(self):
        original = copy.deepcopy(self.checks)
        for job_id in ('1', '2'):
            for case in ('skipped', 'failed', 'pending', 'missing', 'wrong-sha', 'duplicate'):
                with self.subTest(job=job_id, case=case):
                    self.checks = copy.deepcopy(original)
                    result = self.checks[job_id]
                    job = result['jobs'][0]
                    if case == 'missing':
                        result.update(total_count=0, jobs=[])
                    elif case == 'duplicate':
                        result['jobs'].append(dict(job)); result['total_count'] = 2
                    elif case == 'wrong-sha':
                        job['head_sha'] = 'd' * 40
                    elif case == 'pending':
                        job['status'] = 'in_progress'
                    else:
                        job['conclusion'] = case
                    with self.assertRaises(RuntimeError):
                        self.run_publish()
                    self.assertEqual(self.requests, [])

    def test_checkout_must_match_tag_event(self):
        self.environment['GITHUB_SHA'] = 'd' * 40
        with self.assertRaisesRegex(ValueError, 'tag event'):
            self.run_publish()
        self.assertEqual(self.check_requests, [])
        self.assertEqual(self.requests, [])


if __name__ == '__main__':
    unittest.main()
