"""Run native security tests ONLY in a new, disposable emulator owned by this run.

No device selector is accepted. Never attaches to an existing emulator or phone.
Requires prebuilt debug/QA APKs and the Android 35 Google APIs x86_64 image.
"""
import argparse
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = 'org.pepecoinservice.safecore.testing.qa'
NAMESPACE = 'org.pepecoinservice.safecore'
PIN = '24682468'  # Public, disposable emulator fixture; never a user's credential.
IMAGE = 'system-images;android-35;google_apis;x86_64'
PORT = 5580


def require_pass(output, expected):
    """adb/am can return zero on test failure; demand the runner's full result."""
    if (re.search(r'^OK \(' + str(expected) + r' tests?\)\s*$', output, re.M) is None
            or re.search(r'FAILURES!!!|INSTRUMENTATION_FAILED|INSTRUMENTATION_ABORTED|'
                         r'INSTRUMENTATION_STATUS_CODE: -[1-9]|Process crashed', output)):
        # Only source locations, never assertion payloads or captured UI/secret data.
        frames = re.findall(r'^\s*at org\.pepecoinservice\.safecore\.[A-Za-z0-9_.$]+'
                            r'\([A-Za-z0-9_.]+:\d+\)', output, re.M)
        detail = '; '.join(frame.strip() for frame in frames[:4])
        raise RuntimeError('Instrumentation did not report the expected passing test count'
                           + (': ' + detail if detail else ''))


def require_owned(serial, name, actual_name, hardware):
    if (serial != f'emulator-{PORT}' or not name.startswith('safecore-security-')
            or actual_name.splitlines()[:1] != [name]
            or hardware.strip() not in {'ranchu', 'goldfish'}):
        raise RuntimeError('Refusing commands: not this run\'s disposable emulator')


class SecurityRun:
    def __init__(self, sdk, directory):
        self.sdk = sdk
        self.directory = Path(directory)
        self.name = 'safecore-security-' + uuid.uuid4().hex
        self.serial = f'emulator-{PORT}'
        self.environment = {**os.environ, 'ANDROID_HOME': str(sdk),
                            'ANDROID_AVD_HOME': str(self.directory / 'avd')}
        Path(self.environment['ANDROID_AVD_HOME']).mkdir()
        self.process = None

    def command(self, args, timeout=60, input=None):
        result = subprocess.run([str(a) for a in args], env=self.environment,
                                capture_output=True, text=True, timeout=timeout, input=input)
        if result.returncode:
            # Don't dump instrumentation payloads, vaults, or UI state into CI logs.
            raise RuntimeError(f'Tool failed ({Path(args[0]).name}, exit {result.returncode})')
        return result.stdout

    def adb(self, *args, timeout=60):
        return self.command([self.sdk / 'platform-tools/adb', '-s', self.serial, *args], timeout)

    def owned(self):
        require_owned(self.serial, self.name, self.adb('emu', 'avd', 'name'),
                      self.adb('shell', 'getprop', 'ro.hardware'))

    def boot(self):
        # Refuse occupied ports, even if adb hasn't discovered that emulator yet.
        for port in (PORT, PORT + 1):
            with socket.socket() as probe:
                probe.bind(('127.0.0.1', port))
        devices = self.command([self.sdk / 'platform-tools/adb', 'devices'])
        if self.serial in devices:
            raise RuntimeError('Reserved emulator serial is already in use')
        print('Creating a fresh disposable Android 35 emulator', flush=True)
        self.command([self.sdk / 'cmdline-tools/latest/bin/avdmanager', 'create', 'avd',
                      '--name', self.name, '--package', IMAGE, '--device', 'pixel_2'],
                     timeout=120, input='no\n')
        # Runtime logs stay in the temporary directory and are never uploaded.
        with (self.directory / 'emulator.log').open('w') as log:
            self.process = subprocess.Popen([
                str(self.sdk / 'emulator/emulator'), '-avd', self.name, '-port', str(PORT),
                '-no-window', '-no-audio', '-no-snapshot', '-no-boot-anim',
                '-gpu', 'swiftshader_indirect', '-no-metrics',
                '-camera-back', 'none', '-camera-front', 'none'],
                env=self.environment, stdout=log, stderr=log, start_new_session=True)
        deadline = time.monotonic() + 240
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                raise RuntimeError('Disposable emulator exited before boot completed')
            try:
                if self.adb('shell', 'getprop', 'sys.boot_completed', timeout=10).strip() == '1':
                    self.owned()
                    break
            except (RuntimeError, subprocess.TimeoutExpired):
                pass
            time.sleep(2)
        else:
            raise RuntimeError('Disposable emulator boot timed out')
        self.owned()
        self.adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
        self.adb('shell', 'wm', 'dismiss-keyguard')
        self.adb('shell', 'svc', 'wifi', 'disable')
        self.adb('shell', 'svc', 'data', 'disable')
        self.adb('shell', 'settings', 'put', 'system', 'screen_off_timeout', '1800000')
        self.adb('shell', 'svc', 'power', 'stayon', 'true')
        for setting in ('window_animation_scale', 'transition_animation_scale', 'animator_duration_scale'):
            self.adb('shell', 'settings', 'put', 'global', setting, '0')

    def reset_qa(self):
        self.owned()
        if self.adb('shell', 'pm', 'clear', PACKAGE).strip() != 'Success':
            raise RuntimeError('Could not reset disposable QA package')

    def test(self, selector, expected=1):
        self.owned()
        print('RUN: ' + selector, flush=True)
        output = self.adb('shell', 'am', 'instrument', '-w', '-e', 'class',
                          NAMESPACE + '.' + selector,
                          PACKAGE + '.test/android.test.InstrumentationTestRunner', timeout=240)
        require_pass(output, expected)
        print(f'PASS: {selector} ({expected})', flush=True)

    def run(self):
        self.boot()
        for apk in ('debug/app-debug.apk', 'androidTest/debug/app-debug-androidTest.apk'):
            self.owned()
            self.adb('install', '-t', str(ROOT / 'whippet/android/app/build/outputs/apk' / apk), timeout=120)
        self.test('DeviceWalletStoreTest', 3)
        self.reset_qa()
        self.test('DeviceAuthenticationTest#testFirstWalletWithoutScreenLock')
        self.reset_qa()
        self.test('DeviceStorageUiTest#testMigrationCreateReloadAndProtection')
        self.test('DeviceAuthenticationTest#testNoScreenLock')
        self.owned()
        result = self.adb('shell', 'locksettings', 'set-pin', PIN)
        if 'Pin set' not in result:
            raise RuntimeError('Could not set disposable emulator PIN')
        # Test fresh-install defaults separately, then reseed the legacy-wallet fixture.
        self.reset_qa()
        self.test('DeviceAuthenticationTest#testFirstWalletDefault')
        self.reset_qa()
        self.test('DeviceStorageUiTest#testMigrationCreateReloadAndProtection')
        self.test('DeviceAuthenticationTest#testAuthenticationLifecycle')
        self.test('DeviceAuthenticationTest#testProtectedExportAndImportReturn')
        self.test('DeviceAuthenticationTest#testExpiredAuthorizationCannotDecrypt')
        self.owned()
        result = self.adb('shell', 'locksettings', 'clear', '--old', PIN)
        if 'Lock credential cleared' not in result:
            raise RuntimeError('Could not clear disposable emulator PIN')
        self.test('DeviceAuthenticationTest#testCredentialRemovedFailsClosed')
        print('PASS: all 12 native security test executions', flush=True)

    def close(self):
        # Kill only the process group we launched, never adb's shared server/devices.
        if self.process is not None and self.process.poll() is None:
            os.killpg(self.process.pid, signal.SIGTERM)
            try:
                self.process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                os.killpg(self.process.pid, signal.SIGKILL)
                self.process.wait(timeout=10)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk', default=os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT'))
    args = parser.parse_args()
    if not args.sdk:
        parser.error('Set ANDROID_HOME or pass --sdk')
    def cancelled(signum, frame):
        raise SystemExit('Cancelled; stopping the disposable emulator')
    signal.signal(signal.SIGTERM, cancelled)
    with tempfile.TemporaryDirectory(prefix='safecore-security-') as directory:
        run = SecurityRun(Path(args.sdk).resolve(), directory)
        try:
            run.run()
        finally:
            run.close()


if __name__ == '__main__':
    main()
