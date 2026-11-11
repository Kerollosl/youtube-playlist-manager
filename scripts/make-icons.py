#!/usr/bin/env python3
"""Regenerates icons/icon16.png, icon48.png, icon128.png and icons/icon.svg.

Design: a flat dark rounded square with a checklist glyph: two ticked rows and one empty row, which is
what multiselect is. The two ticked boxes use a single teal accent. No gradients, no YouTube red or play
triangle (the extension is unofficial). Needs Pillow:  python3 scripts/make-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BG = (17, 24, 39, 255)          # #111827
ACCENT = (45, 212, 191, 255)    # #2DD4BF
INK = (241, 245, 249, 255)      # #F1F5F9
MUTED = (148, 163, 184, 255)    # #94A3B8


def draw(size, rows):
    s = 1024                                  # draw big, then downsample for clean edges
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.22), fill=BG)
    pad = s * (0.17 if rows == 3 else 0.16)
    inner = s - 2 * pad
    row_h = inner / rows
    box = row_h * (0.62 if rows == 3 else 0.7)
    stroke = max(int(s * (0.045 if rows == 3 else 0.06)), 1)
    for i in range(rows):
        cy = pad + row_h * (i + 0.5)
        x0, y0 = pad, cy - box / 2
        checked = i < rows - 1 if rows == 3 else i == 0
        r = box * 0.24
        if checked:
            d.rounded_rectangle((x0, y0, x0 + box, y0 + box), radius=r, fill=ACCENT)
            c = (BG[0], BG[1], BG[2], 255)
            pts = [(x0 + box * 0.24, y0 + box * 0.54), (x0 + box * 0.44, y0 + box * 0.73), (x0 + box * 0.78, y0 + box * 0.31)]
            d.line(pts, fill=c, width=stroke, joint='curve')
            for p in (pts[0], pts[-1]):
                d.ellipse((p[0] - stroke / 2, p[1] - stroke / 2, p[0] + stroke / 2, p[1] + stroke / 2), fill=c)
        else:
            d.rounded_rectangle((x0, y0, x0 + box, y0 + box), radius=r, outline=MUTED, width=stroke)
        bar_x0 = x0 + box + inner * 0.07
        bar_h = box * (0.3 if rows == 3 else 0.34)
        bar_w = (pad + inner) - bar_x0 - (inner * (0.0 if i != rows - 1 else 0.14))
        d.rounded_rectangle((bar_x0, cy - bar_h / 2, bar_x0 + bar_w, cy + bar_h / 2), radius=bar_h / 2, fill=INK if checked else MUTED)
    return img


def main():
    out = ROOT / 'icons'
    out.mkdir(exist_ok=True)
    for size, rows in ((128, 3), (48, 3), (16, 2)):
        draw(size, rows).resize((size, size), Image.LANCZOS).save(out / f'icon{size}.png')
    (out / 'icon.svg').write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">'
        '<rect width="128" height="128" rx="28" fill="#111827"/>'
        '<rect x="22" y="22" width="26" height="26" rx="6" fill="#2DD4BF"/>'
        '<path d="M28 36l5 5 9-11" fill="none" stroke="#111827" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>'
        '<rect x="56" y="31" width="50" height="8" rx="4" fill="#F1F5F9"/>'
        '<rect x="22" y="51" width="26" height="26" rx="6" fill="#2DD4BF"/>'
        '<path d="M28 65l5 5 9-11" fill="none" stroke="#111827" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>'
        '<rect x="56" y="60" width="50" height="8" rx="4" fill="#F1F5F9"/>'
        '<rect x="24" y="82" width="22" height="22" rx="5" fill="none" stroke="#94A3B8" stroke-width="5"/>'
        '<rect x="56" y="89" width="36" height="8" rx="4" fill="#94A3B8"/></svg>\n')
    print('icons written:', ', '.join(sorted(p.name for p in out.iterdir())))


if __name__ == '__main__':
    main()
