#!/usr/bin/env python3
"""Generate display-sized WebP variants without changing source media.

Requires Pillow with WebP support. To regenerate the video poster, install ffmpeg
or pass --poster-frame with a previously extracted video frame.
"""
import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile
from PIL import Image, ImageOps

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--poster-frame', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1] / 'web' / 'public' / 'images'


def convert(source, target, size, quality=84):
    with Image.open(source) as original:
        image = ImageOps.exif_transpose(original).convert('RGB')
        image.thumbnail(size, Image.Resampling.LANCZOS)
        image.save(target, 'WEBP', quality=quality, method=6)
    print(f'{target.name}: {source.stat().st_size:,} → {target.stat().st_size:,} bytes')


for index in range(1, 6):
    convert(root / f'artist_{index}.png', root / f'artist_{index}.webp', (720, 720))
convert(root / 'user_profile.png', root / 'user_profile.webp', (320, 320))
convert(root / 'friends_bg.png', root / 'friends_bg.webp', (1600, 1600))
if args.poster_frame:
    convert(args.poster_frame, root / 'background-poster.webp', (1280, 720), 80)
elif shutil.which('ffmpeg'):
    with tempfile.TemporaryDirectory() as directory:
        frame = Path(directory) / 'poster.png'
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(root / 'background.mp4'),
                        '-frames:v', '1', str(frame)], check=True)
        convert(frame, root / 'background-poster.webp', (1280, 720), 80)
else:
    print('Poster unchanged: install ffmpeg or supply --poster-frame to regenerate it.')
