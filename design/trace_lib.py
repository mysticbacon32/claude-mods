"""Traces V10's artwork into compact SVG paths.

The artwork is read straight out of claude_usage_cinematic_v10_polished.html
(its one embedded JPEG, 1227 x 905), so the approved design file stays the
single source. Coordinates come back in V10's scene units: 320 x 236.02, the
area the artwork covers in the widget.
"""
import base64
import io
import os
import re

import vtracer
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
V10_HTML = os.path.join(HERE, 'claude_usage_cinematic_v10_polished.html')

SCENE_W, SCENE_H = 320, 236.02


def source() -> Image.Image:
    html = open(V10_HTML, encoding='utf-8').read()
    data = re.search(r'data:image/jpeg;base64,([A-Za-z0-9+/=]+)', html).group(1)
    return Image.open(io.BytesIO(base64.b64decode(data))).convert('RGB')


def trace(img: Image.Image, **kw):
    """Traces a picture; returns (d, fill, tx, ty) per path, in its pixel units."""
    buf = io.BytesIO()
    img.save(buf, 'PNG')
    opts = dict(colormode='color', hierarchical='stacked', mode='polygon', filter_speckle=4,
                color_precision=6, layer_difference=16, corner_threshold=60, length_threshold=4.0,
                max_iterations=10, splice_threshold=45, path_precision=1)
    opts.update(kw)
    svg = vtracer.convert_raw_image_to_svg(buf.getvalue(), img_format='png', **opts)
    out = []
    pattern = r'<path d="([^"]+)" fill="(#[0-9A-Fa-f]{6})" transform="translate\(([-\d.]+),([-\d.]+)\)"/>'
    for m in re.finditer(pattern, svg):
        out.append((m.group(1), m.group(2).lower(), float(m.group(3)), float(m.group(4))))
    return out


def _fmt(nums) -> str:
    s = ''
    for n in nums:
        t = str(int(n)) if n == int(n) else f'{n:g}'
        s += t if (not s or t.startswith('-')) else ' ' + t
    return s


def compact_d(d: str, tx: float = 0.0, ty: float = 0.0, q: float = 1.0) -> str:
    """Rewrites absolute M/L/C/Z path data as relative steps rounded to q, with
    the translate folded in. Steps come from rounded absolutes, so no drift."""
    toks = re.findall(r'[MLCZmlcz]|-?\d*\.?\d+', d)
    out, i, cmd = [], 0, None
    cur = start = (0.0, 0.0)

    def r(v):
        return round(v / q) * q

    while i < len(toks):
        t = toks[i]
        if t in 'MLCZ':
            cmd = t
            i += 1
            if t == 'Z':
                out.append('z')
                cur = start
            continue
        n = {'M': 2, 'L': 2, 'C': 6}[cmd]
        vals = [float(v) for v in toks[i:i + n]]
        i += n
        pts = [(r(vals[k] + tx), r(vals[k + 1] + ty)) for k in range(0, n, 2)]
        if cmd == 'M':
            out.append('M' + _fmt(pts[0]))
            cur = start = pts[0]
            continue
        rel = []
        for p in pts:
            rel += [round(p[0] - cur[0], 3), round(p[1] - cur[1], 3)]
        if all(v == 0 for v in rel):
            continue
        out.append(('c' if cmd == 'C' else 'l') + _fmt(rel))
        cur = pts[-1]
    return ''.join(out)


def short_color(c: str) -> str:
    if c[1] == c[2] and c[3] == c[4] and c[5] == c[6]:
        return '#' + c[1] + c[3] + c[5]
    return c
