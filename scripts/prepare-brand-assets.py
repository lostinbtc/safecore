#!/usr/bin/env python3
"""Resample supplied artwork for packaging; requires Pillow, no network access."""
import argparse
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
with Image.open(args.source) as supplied:
    artwork = supplied.convert('RGBA')
    if artwork.width != artwork.height:
        raise SystemExit('Use square source artwork; no automatic cropping.')
    artwork = artwork.resize((512, 512), Image.Resampling.LANCZOS)
    for relative in ('whippet/www/assets/safecore.png', 'recovery/assets/safecore.png',
                     'whippet/android/app/src/main/res/drawable-nodpi/safecore_logo.png'):
        destination = root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        artwork.save(destination, optimize=True)
