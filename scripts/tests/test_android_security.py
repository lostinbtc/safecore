import unittest
from scripts.android_security import require_owned, require_pass


class AndroidSecurityRunnerTests(unittest.TestCase):
    def test_requires_exact_test_count(self):
        require_pass('INSTRUMENTATION_STATUS_CODE: 0\nOK (3 tests)\n', 3)
        require_pass('OK (1 test)\n', 1)
        for output in ('', 'OK (0 tests)', 'OK (2 tests)', 'FAILURES!!!',
                       'OK (3 tests)\nINSTRUMENTATION_FAILED: crashed',
                       'OK (3 tests)\nINSTRUMENTATION_STATUS_CODE: -2'):
            with self.assertRaises(RuntimeError):
                require_pass(output, 3)

    def test_refuses_other_devices_even_if_emulated(self):
        name = 'safecore-security-fixture'
        require_owned('emulator-5580', name, name + '\nOK\n', 'ranchu\n')
        for serial, actual, hardware in (
                ('physical-phone', name, 'ranchu'),
                ('emulator-5554', name, 'ranchu'),
                ('emulator-5580', 'personal-avd', 'ranchu'),
                ('emulator-5580', name, 'real-hardware')):
            with self.assertRaises(RuntimeError):
                require_owned(serial, name, actual, hardware)

    def test_failure_reports_location_not_assertion_payload(self):
        output = ('junit.framework.AssertionFailedError: PRIVATE-FIXTURE\n'
                  ' at org.pepecoinservice.safecore.DeviceWalletStoreTest.testRead(DeviceWalletStoreTest.java:42)\n')
        with self.assertRaises(RuntimeError) as caught:
            require_pass(output, 1)
        self.assertIn('DeviceWalletStoreTest.java:42', str(caught.exception))
        self.assertNotIn('PRIVATE-FIXTURE', str(caught.exception))


if __name__ == '__main__':
    unittest.main()
