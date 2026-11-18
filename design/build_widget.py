"""Builds plugins/ooze-gauge/hooks/widget-svg.ts: the V10 widget as one SVG
string, with its artwork as vector paths (the approved "A2" route from issue #1).
The SVG lives in a module of its own because mod tests can't read files, and
the size tests must measure exactly what ships.

Why vector: the Claude desktop app draws a mod's SVG but leaves embedded
pictures (data: URIs, <image>) blank, so V10's JPEG can't ship as-is.

A2, selective trace with native glow:
- The background outside the canisters is masked to a flat dark and replaced
  by native radial-gradient haze and floor glow.
- The glass windows are smoothed so the live liquid reads cleanly over them.
- The canisters, caps, rims, bases and puddles are traced at 400 px.
- The bright neon paths are reused (<use href="#n..">) through a blur with
  screen blending: a soft bloom without copying path data.
- A 0.3 blur softens the polygon edges.

Size: the app caps a drawn tree at 100,000 characters *serialized* (quotes
become \\"), so the build fails if the filled widget could pass 95,000.

Run: python design/build_widget.py   (needs: pip install -r design/requirements.txt)
"""
import json
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFilter

from trace_lib import SCENE_H, SCENE_W, compact_d, short_color, source, trace
from v10_template import base_template

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'plugins', 'ooze-gauge', 'hooks', 'widget-svg.ts')
PREVIEW = os.path.join(HERE, 'widget-template.svg')

SRC_W, SRC_H = 1227, 905
BG = (5, 7, 11)
SERIALIZED_BUDGET = 95_000
# Room for the longest values the mod fills in (tooltips with reset times, the
# reset label) beyond the placeholders' own length.
FILL_ALLOWANCE = 400

# Regions in source pixels, read off the V10 artwork.
CANISTERS = [
    dict(cap=(205, 25, 545, 222), glass=(222, 200, 530, 745), base=(205, 712, 550, 865),
         puddle=(40, 780, 640, 905), vial=(249, 258, 492, 720), color='#ff36d7'),
    dict(cap=(705, 25, 1055, 222), glass=(725, 200, 1035, 745), base=(710, 712, 1055, 865),
         puddle=(610, 780, 1190, 905), vial=(737, 258, 980, 720), color='#a8ff35'),
]

# The approved A2 settings.
TRACE_WIDTH = 400
FILTER_SPECKLE = 5
LAYER_DIFFERENCE = 16
VIAL_BLUR = 5
SOFTEN = 0.3


def masked_source() -> Image.Image:
    img = source()
    mask = Image.new('L', img.size, 0)
    d = ImageDraw.Draw(mask)
    for c in CANISTERS:
        for k in ('cap', 'glass', 'base'):
            d.rounded_rectangle(c[k], radius=24, fill=255)
        d.ellipse(c['puddle'], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(6))
    out = Image.composite(img, Image.new('RGB', img.size, BG), mask)
    for c in CANISTERS:
        box = c['vial']
        out.paste(out.crop(box).filter(ImageFilter.GaussianBlur(VIAL_BLUR)), box[:2])
    return out


def native_back() -> str:
    """Native haze and floor glow, under the traced canisters."""
    sx, sy = SCENE_W / SRC_W, SCENE_H / SRC_H
    defs, layers = [], []
    for n, c in enumerate(CANISTERS):
        col = c['color']
        x0, y0, x1, y1 = c['glass']
        cx, cy = (x0 + x1) / 2 * sx, (y0 + y1) / 2 * sy
        defs.append(f'<radialGradient id="hz{n}" cx="{cx:.1f}" cy="{cy:.1f}" r="{(x1 - x0) * sx * 0.95:.1f}" '
                    f'gradientTransform="translate({cx:.1f} {cy:.1f}) scale(1 1.45) translate({-cx:.1f} {-cy:.1f})" '
                    f'gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="{col}" stop-opacity=".42"/>'
                    f'<stop offset=".55" stop-color="{col}" stop-opacity=".14"/><stop offset="1" stop-color="{col}" stop-opacity="0"/></radialGradient>')
        px0, py0, px1, py1 = c['puddle']
        pcx, pcy = (px0 + px1) / 2 * sx, (py0 + py1) / 2 * sy + 4
        defs.append(f'<radialGradient id="fl{n}" cx="{pcx:.1f}" cy="{pcy:.1f}" r="{(px1 - px0) * sx * 0.6:.1f}" '
                    f'gradientTransform="translate({pcx:.1f} {pcy:.1f}) scale(1 .28) translate({-pcx:.1f} {-pcy:.1f})" '
                    f'gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="{col}" stop-opacity=".7"/>'
                    f'<stop offset="1" stop-color="{col}" stop-opacity="0"/></radialGradient>')
        layers.append(f'<rect width="{SCENE_W}" height="{SCENE_H}" fill="url(#hz{n})"/>'
                      f'<rect width="{SCENE_W}" height="{SCENE_H}" fill="url(#fl{n})"/>')
    return (f'<rect width="{SCENE_W}" height="{SCENE_H}" fill="rgb{BG}"/>'
            '<defs>' + ''.join(defs) + '</defs>' + ''.join(layers))


def is_neon(hexcol: str) -> bool:
    r, g, b = (int(hexcol[i:i + 2], 16) for i in (1, 3, 5))
    hi, lo = max(r, g, b), min(r, g, b)
    return hi >= 150 and (hi - lo) >= 90 and (r > 150 and b > 110 and g < 120 or g > 150 and r < 200 and b < 120)


def artwork() -> str:
    img = masked_source()
    h = round(SRC_H * TRACE_WIDTH / SRC_W)
    traced = trace(img.resize((TRACE_WIDTH, h), Image.LANCZOS), mode='polygon',
                   filter_speckle=FILTER_SPECKLE, layer_difference=LAYER_DIFFERENCE)[1:]
    sx, sy = SCENE_W / TRACE_WIDTH, SCENE_H / h
    body, neon = [], 0
    for d, fill, tx, ty in traced:
        cd = compact_d(d, tx, ty)
        if cd.count('c') + cd.count('l') < 2:
            continue
        pid = ''
        if is_neon(fill):
            pid = f' id="n{neon}"'
            neon += 1
        body.append(f'<path{pid} d="{cd}" fill="{short_color(fill)}"/>')
    t = f'transform="scale({sx:.5f} {sy:.5f})"'
    defs = ('<defs><filter id="soft" x="0" y="0" width="1" height="1">'
            f'<feGaussianBlur stdDeviation="{SOFTEN}"/></filter>'
            '<filter id="bloom" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">'
            '<feGaussianBlur stdDeviation="4"/></filter></defs>')
    art = f'<g {t} filter="url(#soft)">' + ''.join(body) + '</g>'
    uses = ''.join(f'<use href="#n{i}"/>' for i in range(neon))
    glow = f'<g {t} filter="url(#bloom)" style="mix-blend-mode:screen" opacity=".85">{uses}</g>'
    return defs + native_back() + art + glow


def main() -> int:
    template, n = re.subn(r'<image href="\{\{IMG\}\}"[^>]*/>', lambda m: artwork(), base_template())
    assert n == 1, 'the base template should hold exactly one artwork <image>'
    for bad in ('data:', '<image', 'feImage', 'foreignObject', 'base64'):
        assert bad not in template, f'the widget must be pure vector; found {bad!r}'
    assert not re.search(r'href="(?!#)|url\((?!#)', template), 'only #fragment references are allowed'
    serialized = len(json.dumps(template)) + FILL_ALLOWANCE
    print(f'template: {len(template):,} chars; serialized with fill allowance: {serialized:,} '
          f'(budget {SERIALIZED_BUDGET:,})')
    if serialized > SERIALIZED_BUDGET:
        print('over budget: lower TRACE_WIDTH or raise FILTER_SPECKLE', file=sys.stderr)
        return 1
    module = (
        '// Generated by design/build_widget.py from design/claude_usage_cinematic_v10_polished.html.\n'
        '// Do not edit by hand: change the design scripts and rebuild.\n'
        '//\n'
        '// The approved Claude Capacity V10 widget as one pure-vector SVG: the artwork\n'
        '// traced to paths, V10\'s liquid, bubbles, glass, readouts and bars on top.\n'
        '// {{PLACEHOLDERS}} are filled with real usage by fillCapacity in register.tsx.\n'
        f'export const WIDGET_SVG = {json.dumps(template, ensure_ascii=False)}\n'
    )
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(module)
    with open(PREVIEW, 'w', encoding='utf-8', newline='\n') as f:
        f.write(template)
    for path in (OUT, PREVIEW):
        print('wrote', os.path.relpath(path, os.path.join(HERE, '..')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
