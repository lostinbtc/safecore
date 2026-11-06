#!/usr/bin/env python3
"""Package only the self-contained offline recovery tool."""
import argparse
from pathlib import Path
import zipfile

FILES = ('index.html', 'app.js', 'wallet.js', 'wallet-format.js', 'formats.js',
         'recovery.js', 'styles.css', 'assets/ethers.umd.min.js',
         'assets/ethers.LICENSE', 'README.md')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in FILES:
            archive.write(root / name, 'whippet-recovery/' + name)
    print(args.output.resolve())


if __name__ == '__main__':
    main()
