"""Verify an APK against the reviewed public signing policy; never signs or installs."""
import argparse
import json
from pathlib import Path
from apk_security import verify_apk


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('apk', type=Path)
    parser.add_argument('--local', action='store_true', help='Permit a local version suffix and skip published-byte hash matching; NOT publication approval')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    try:
        manifest = json.loads((root / 'release/manifest.json').read_text())
        policy = json.loads((root / 'release/signing-policy.json').read_text())
        result = verify_apk(args.apk, manifest, policy, local=args.local)
    except (ValueError, OSError, KeyError) as error:
        parser.exit(1, 'FAIL: ' + str(error) + '\n')
    print(('PASS: local compatibility check (not publication approval)' if args.local else 'PASS: APK publication identity verified'))
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
