"""Opt-in real Android tools with temporary APKs/keys, never user signing material.

Run with SAFECORE_APK_INTEGRATION=1 and ANDROID_HOME set. No devices or network.
"""
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest
import zipfile
from scripts import apk_security as security


@unittest.skipUnless(os.environ.get('SAFECORE_APK_INTEGRATION') == '1', 'Opt-in Android tool fixtures')
class RealApkSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix='safecore-signing-fixtures-')
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.root = Path(cls.temporary.name)
        cls.policy = dict(channel='development', application_id='org.example.wallet.testing',
                          certificate_sha256='b' * 64, min_sdk=26, target_sdk=35, build_tools='35.0.1')
        cls.tools = security.sdk_tools(cls.policy)
        cls.sdk = Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
        cls.keystore = cls.root / 'throwaway.p12'
        # Public fixture password; this temporary key is not a release identity.
        cls.password = 'public-fixture-only'
        cls.run_tool(['keytool', '-genkeypair', '-keystore', cls.keystore, '-storetype', 'PKCS12',
                      '-alias', 'fixture', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '1',
                      '-dname', 'CN=Disposable verification fixture', '-storepass', cls.password,
                      '-keypass', cls.password, '-noprompt'])
        cls.good = cls.make_apk('good')
        output = cls.run_tool([cls.tools['apksigner'], 'verify', '--print-certs', cls.good])
        cls.policy['certificate_sha256'] = re.search(r'certificate SHA-256 digest: ([0-9a-f]{64})', output)[1]

    @staticmethod
    def run_tool(args):
        return subprocess.run([str(arg) for arg in args], check=True, capture_output=True,
                              text=True, timeout=60).stdout

    @classmethod
    def make_apk(cls, name, debuggable=False, signed=True):
        folder = cls.root / name
        folder.mkdir()
        xml = folder / 'AndroidManifest.xml'
        xml.write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android" '
                       'package="org.example.wallet.testing" android:versionCode="16" '
                       'android:versionName="0.1.0-test.16">'
                       '<uses-sdk android:minSdkVersion="26" android:targetSdkVersion="35"/>'
                       '<application android:label="Disposable fixture" android:allowBackup="false" '
                       'android:fullBackupContent="false" android:usesCleartextTraffic="false" '
                       'android:debuggable="' + str(debuggable).lower() + '"/></manifest>')
        unsigned = folder / 'unsigned.apk'
        cls.run_tool([cls.tools['aapt'], 'package', '-f', '-M', xml,
                      '-I', cls.sdk / 'platforms/android-35/android.jar', '-F', unsigned])
        if not signed:
            return unsigned
        result = folder / 'fixture.apk'
        cls.run_tool([cls.tools['apksigner'], 'sign', '--ks', cls.keystore,
                      '--ks-pass', 'pass:' + cls.password, '--ks-key-alias', 'fixture',
                      '--v1-signing-enabled', 'false', '--v2-signing-enabled', 'true',
                      '--out', result, unsigned])
        return result

    def manifest(self, apk, certificate=None):
        return dict(tag='v0.1.0-test.16', filename='SafeCore-0.1.0-test.16.apk',
                    sha256=hashlib.sha256(apk.read_bytes()).hexdigest(), version_code=16,
                    certificate_sha256=certificate or self.policy['certificate_sha256'], debug_tools=False)

    def test_real_signed_apk_passes(self):
        self.assertTrue(security.verify_apk(self.good, self.manifest(self.good), self.policy)['publication_check'])

    def test_real_wrong_signer_fails_even_with_matching_hash(self):
        policy = {**self.policy, 'certificate_sha256': 'a' * 64}
        with self.assertRaisesRegex(ValueError, 'signer'):
            security.verify_apk(self.good, self.manifest(self.good, 'a' * 64), policy)

    def test_real_debuggable_apk_fails_even_with_manifest_claiming_false(self):
        apk = self.make_apk('debuggable', debuggable=True)
        with self.assertRaisesRegex(ValueError, 'debuggable'):
            security.verify_apk(apk, self.manifest(apk), self.policy)

    def test_real_unsigned_apk_fails(self):
        apk = self.make_apk('unsigned', signed=False)
        with self.assertRaisesRegex(ValueError, 'verification tool failed'):
            security.verify_apk(apk, self.manifest(apk), self.policy)

    def test_real_tampered_apk_fails_even_after_rehashing(self):
        apk = self.root / 'tampered.apk'
        shutil.copyfile(self.good, apk)
        with zipfile.ZipFile(apk, 'a') as archive:
            archive.writestr('tampered.txt', 'public tamper fixture')
        with self.assertRaisesRegex(ValueError, 'verification tool failed'):
            security.verify_apk(apk, self.manifest(apk), self.policy)


if __name__ == '__main__':
    unittest.main()
