"""Disposable, offline fixtures; these tests never sign, install, or publish."""
import hashlib
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from scripts import apk_security as security


class ApkSecurityTests(unittest.TestCase):
    def setUp(self):
        self.policy = dict(channel='development', application_id='org.example.wallet.testing',
                           certificate_sha256='b' * 64, min_sdk=26, target_sdk=35, build_tools='35.0.1')
        self.manifest = dict(tag='v0.1.0-test.16', filename='SafeCore-0.1.0-test.16.apk',
                             sha256=hashlib.sha256(b'fixture').hexdigest(), version_code=16,
                             certificate_sha256='b' * 64, debug_tools=False)
        self.signature = ('Verifies\nVerified using v2 scheme (APK Signature Scheme v2): true\n'
                          'Number of signers: 1\nSigner #1 certificate SHA-256 digest: ' + 'b' * 64 + '\n')
        self.badging = ("package: name='org.example.wallet.testing' versionCode='16' versionName='0.1.0-test.16' platformBuildVersionName='15'\n"
                        "sdkVersion:'26'\ntargetSdkVersion:'35'\n")
        self.xml = ('  E: manifest (line=2)\n'
                    '    E: application (line=9)\n'
                    '      A: android:allowBackup(0x01010280)=(type 0x12)0x0\n'
                    '      A: android:fullBackupContent(0x010104eb)=(type 0x12)0x0\n'
                    '      A: android:usesCleartextTraffic(0x010104ec)=(type 0x12)0x0\n'
                    '      E: activity (line=15)\n')

    def test_valid_reviewed_metadata(self):
        security.validate_manifest(self.manifest, self.policy)
        security.check_signature(self.signature, self.policy['certificate_sha256'])
        self.assertEqual(security.check_badging(self.badging, self.manifest, self.policy), '0.1.0-test.16')
        security.check_application(self.xml)

    def test_manifest_cannot_repin_certificate_or_claim_debug_safe(self):
        for field, value in [('certificate_sha256', 'c' * 64), ('debug_tools', True), ('debug_tools', 0),
                             ('version_code', True), ('version_code', 0), ('version_code', '16'),
                             ('tag', 'v0.1.0-test.16-local.auth'), ('filename', 'different.apk'), ('sha256', 'bad')]:
            with self.subTest(field=field, value=value):
                changed = {**self.manifest, field: value}
                with self.assertRaises(ValueError):
                    security.validate_manifest(changed, self.policy)

    def test_unreviewed_policy_rejected(self):
        for field, value in [('channel', 'production'), ('application_id', ''), ('build_tools', '../35'),
                             ('min_sdk', True), ('min_sdk', 25), ('target_sdk', 25)]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                security.validate_manifest(self.manifest, {**self.policy, field: value})

    def test_wrong_missing_duplicate_and_weak_signer_rejected(self):
        for output in [self.signature.replace('b' * 64, 'c' * 64), '', self.signature * 2,
                       self.signature.replace('Number of signers: 1', 'Number of signers: 2'),
                       self.signature.replace(': true', ': false')]:
            with self.subTest(output=output), self.assertRaises(ValueError):
                security.check_signature(output, self.policy['certificate_sha256'])

    def test_actual_package_version_sdk_and_debug_flags(self):
        for output in [self.badging.replace('wallet.testing', 'wallet.testing.qa'),
                       self.badging.replace("versionCode='16'", "versionCode='15'"),
                       self.badging.replace('0.1.0-test.16', '0.1.0-test.16-local.auth'),
                       self.badging.replace("sdkVersion:'26'", "sdkVersion:'25'"),
                       self.badging.replace("targetSdkVersion:'35'", "targetSdkVersion:'34'"),
                       self.badging + 'application-debuggable\n', self.badging * 2, '']:
            with self.subTest(output=output), self.assertRaises(ValueError):
                security.check_badging(output, self.manifest, self.policy)

    def test_local_mode_still_enforces_identity_and_non_debuggable(self):
        local = self.badging.replace('0.1.0-test.16', '0.1.0-test.16-local.auth')
        security.check_badging(local, self.manifest, self.policy, local=True)
        for output in [local + 'application-debuggable\n', local.replace('wallet.testing', 'wallet.qa'),
                       local.replace('test.16', 'test.17')]:
            with self.assertRaises(ValueError):
                security.check_badging(output, self.manifest, self.policy, local=True)

    def test_application_security_defaults_and_scope(self):
        for name in ['allowBackup', 'fullBackupContent', 'usesCleartextTraffic']:
            lines = self.xml.splitlines(True)
            changed = ''.join(line.replace('0x0\n', '0xffffffff\n') if 'android:' + name in line else line for line in lines)
            missing = ''.join(line for line in lines if 'android:' + name not in line)
            for xml in [changed, missing]:
                with self.subTest(name=name), self.assertRaises(ValueError):
                    security.check_application(xml)
        for name in ['debuggable', 'testOnly']:
            bad = self.xml.replace('      E: activity', '      A: android:' + name + '(0x01010000)=(type 0x12)0xffffffff\n      E: activity')
            with self.assertRaises(ValueError):
                security.check_application(bad)
        for xml in ['', self.xml * 2, self.xml.replace('      A:', '        A:')]:
            with self.assertRaises(ValueError):
                security.check_application(xml)

    def test_tools_missing_fails_closed(self):
        with tempfile.TemporaryDirectory() as root, self.assertRaises(ValueError):
            security.sdk_tools(self.policy, root)

    def test_tool_failure_and_timeout_are_not_accepted_or_echoed(self):
        for error in [subprocess.CalledProcessError(1, ['fixture'], output='untrusted output'),
                      subprocess.TimeoutExpired(['fixture'], 60), FileNotFoundError('fixture')]:
            with patch.object(security.subprocess, 'run', side_effect=error):
                with self.assertRaisesRegex(ValueError, '^Android APK verification tool failed; refusing artifact$'):
                    security.command(['fixture'])

    def test_exact_bytes_verified_before_tools_and_all_checks_run(self):
        with tempfile.TemporaryDirectory() as root:
            apk = Path(root) / 'fixture.apk'
            apk.write_bytes(b'fixture')
            with patch.object(security, 'sdk_tools', return_value={'apksigner': 'apksigner', 'aapt': 'aapt'}), \
                 patch.object(security, 'command', side_effect=[self.signature, self.badging, self.xml]) as run:
                result = security.verify_apk(apk, self.manifest, self.policy)
                self.assertTrue(result['publication_check'])
                self.assertEqual(run.call_count, 3)
            apk.write_bytes(b'changed')
            with patch.object(security, 'sdk_tools') as tools, self.assertRaisesRegex(ValueError, 'checksum'):
                security.verify_apk(apk, self.manifest, self.policy)
            tools.assert_not_called()


if __name__ == '__main__':
    unittest.main()
