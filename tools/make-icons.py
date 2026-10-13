"""Draws the app icons. Needs Pillow.
   python3 tools/make-icons.py                    -> editor icons (dark) into ../icons
   python3 tools/make-icons.py band <folder>      -> band app icons (light) into <folder>"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

BAND = len(sys.argv) > 1 and sys.argv[1] == "band"
OUT = Path(sys.argv[2]) if BAND else Path(__file__).resolve().parent.parent / "icons"
# Band app: light; David's editor: dark, so the two are easy to tell apart on a home screen.
BG = (241, 240, 236) if BAND else (30, 27, 24)
INK = (30, 27, 24) if BAND else (241, 240, 236)
ORANGE = (212, 123, 34)    # accent


def draw(size: int) -> Image.Image:
    s = 1024  # draw large, then shrink for smooth edges
    img = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(img)
    # A little stage: floor, and three player boxes like the stage plot
    d.rounded_rectangle([170, 560, 854, 800], radius=40, outline=INK, width=26)
    for x, c in ((300, ORANGE), (512, INK), (724, ORANGE)):
        d.rounded_rectangle([x - 70, 610, x + 70, 740], radius=18, fill=c)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Impact.ttf", 300)
    except OSError:
        font = ImageFont.load_default()
    d.text((512, 360), "SOS", font=font, fill=INK, anchor="mm")
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
    draw(size).save(OUT / name, optimize=True)
    print("wrote", OUT / name)
