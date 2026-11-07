"""Audit packaged wallet assets: source-only, exact bytes, no profile/data copy."""
import importlib.util
from pathlib import Path
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('preview', root / 'scripts/serve.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)
apk = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'android/app/build/outputs/apk/liveTest/app-liveTest.apk'
assert (root / 'www/assets/safecore.LICENSE').read_bytes() == (root.parent / 'LICENSE').read_bytes(), 'Stale first-party MIT notice'
with zipfile.ZipFile(apk) as package:
    expected = {'assets/wallet/' + name for name in preview.FILES}
    assets = {name for name in package.namelist() if name.startswith('assets/') and not name.endswith('/')}
    # ART startup profiles contain compiled-code metadata, not wallet state.
    profiles = {'assets/dexopt/baseline.prof', 'assets/dexopt/baseline.profm'}
    assert assets - profiles == expected, 'Unexpected or missing APK assets'
    for name in preview.FILES:
        assert package.read('assets/wallet/' + name) == (root / 'www' / name).read_bytes(), 'Stale packaged source: ' + name
    assert not any(name.endswith(('.db', '.sqlite', '.sqlite3', '.keystore', '.jks')) for name in package.namelist()), 'Unexpected data file'
print('PASS: APK contains exactly allowlisted wallet source/assets; no browser profile, wallet database or backups; all bundled bytes match current source.')
