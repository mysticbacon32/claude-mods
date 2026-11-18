"""V10's markup and CSS converted to one SVG (everything but the artwork).

Laid out as claude_usage_cinematic_v10_polished.html measures at 320 CSS px wide.
The liquid, bubbles, glass, readouts and bars are V10's own, with V10's timings.
{{PLACEHOLDERS}} are filled by the mod with real usage; {{IMG}} marks where the
artwork goes (build_widget.py replaces it with the vector art).
"""
VW, SCENE_H, READ_Y, READ_H = 320, 236.02, 236.02, 112.97
H = round(READ_Y + READ_H, 2)
VY, VWID, VH = 67.25, 63.36, 120.59
VB = round(VY + VH, 2)
SIDES = [
    dict(key='WEEK', cls='wk', x=64.95, c='#ff36d7', light='#ffb3f4', bub='#ffc6f7', mix='#ff90e9', rgb='255,54,215', rx=82.5, tx=13.41, title='WEEKLY LIMIT'),
    dict(key='FIVE', cls='fv', x=192.31, c='#a8ff35', light='#d7ff83', bub='#e1ffa2', mix='#cfff90', rgb='168,255,53', rx=237.5, tx=168.41, title='5-HOUR LIMIT'),
]
BUBBLES = [(18, 3, 8.2, -1.2), (47, 5, 10.8, -6.3), (72, 3, 7.7, -3.8), (33, 2, 12.3, -9.1), (83, 4, 11.6, -4.2)]
WAVE = ('M0 12 C65 1 115 2 180 12 S310 20 400 12', 'M0 12 C65 19 115 21 180 12 S310 2 400 12', 'M0 12 C65 6 115 3 180 12 S310 18 400 12')
CLOSE = ' L400 400 L0 400Z'
SPL = 'calcMode="spline" keyTimes="0;0.33;0.66;1" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1"'


def vals(close):
    return ';'.join(w + close for w in WAVE + WAVE[:1])


def r(n):
    return f'{n:.2f}'.rstrip('0').rstrip('.')


def ph(name):
    return '{{' + name + '}}'


def clip(x):
    w, h = VWID, VH
    tx, ty, bx, by = .08 * w, .08 * h, .09 * w, .09 * h
    return (f'M{r(x+tx)} {r(VY)}H{r(x+w-tx)}A{r(tx)} {r(ty)} 0 0 1 {r(x+w)} {r(VY+ty)}V{r(VB-by)}'
            f'A{r(bx)} {r(by)} 0 0 1 {r(x+w-bx)} {r(VB)}H{r(x+bx)}A{r(bx)} {r(by)} 0 0 1 {r(x)} {r(VB-by)}'
            f'V{r(VY+ty)}A{r(tx)} {r(ty)} 0 0 1 {r(x+tx)} {r(VY)}Z')


o = []
o.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VW} {H}" width="{VW}" height="{H}" font-family="system-ui, -apple-system, Arial, sans-serif">')
o.append('<!-- Claude Capacity V10 converted from claude_usage_cinematic_v10_polished.html -->')
css = [
    '.lvl,.fclip{animation-duration:.45s;animation-timing-function:cubic-bezier(.2,.7,.2,1);animation-fill-mode:both}',
    '.bar{animation-duration:.28s;animation-timing-function:cubic-bezier(.22,.68,0,1);animation-fill-mode:both}',
    '.liquid-shape{fill-opacity:.76}',
    '.liquid-surface{fill:none;stroke-width:1.3;opacity:.42;vector-effect:non-scaling-stroke}',
    '.bubble{opacity:0;transform-box:fill-box;transform-origin:center;animation:bubbleRise linear infinite}',
    '@keyframes bubbleRise{0%{transform:translate(0,0) scale(.8);opacity:0}14%{opacity:.55}82%{opacity:.35}100%{transform:translate(9px,-350px) scale(1.2);opacity:0}}',
]
for s in SIDES:
    k, c = s['key'], s['cls']
    css.append(f'.{c} .lvl,.{c} .fclip{{animation-name:{c}Lvl}}@keyframes {c}Lvl{{from{{y:{ph(k+"_FY0")}px;height:{ph(k+"_FH0")}px}}}}')
    css.append(f'.{c} .bar{{animation-name:{c}Bar}}@keyframes {c}Bar{{from{{width:{ph(k+"_BARW0")}px}}}}')
    css.append(f'.{c} .fluid{{filter:drop-shadow(0 0 8px rgba({s["rgb"]},.55))}}.{c} .liquid-surface{{filter:drop-shadow(0 0 2px {s["c"]})}}')
    css.append(f'.{c} .title{{filter:drop-shadow(0 0 10px {s["c"]})}}.{c} .value{{filter:drop-shadow(0 0 16px rgba({s["rgb"]},.75))}}.{c} .track{{filter:drop-shadow(0 0 10px rgba({s["rgb"]},.34))}}')
    css.append(f'.{c} .bubble{{filter:drop-shadow(0 0 2px {s["c"]})}}')
css.append('@media (prefers-reduced-motion:reduce){.bubble{animation:none}.liquid-body animate{display:none}.lvl,.fclip,.bar{animation:none}}')
o.append('<style>' + ''.join(css) + '</style>')
o.append('<defs>')
o.append('<linearGradient id="sheen" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".067"/><stop offset=".18" stop-color="#fff" stop-opacity="0"/><stop offset=".82" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".133"/></linearGradient>')
o.append('<linearGradient id="glass" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".133"/><stop offset=".14" stop-color="#fff" stop-opacity="0"/><stop offset=".82" stop-color="#fff" stop-opacity="0"/><stop offset=".96" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>')
o.append(f'<linearGradient id="readbg" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="{READ_Y}" y2="{H}"><stop offset="0" stop-color="#06070d"/><stop offset="1" stop-color="#080a12"/></linearGradient>')
o.append('<linearGradient id="inset" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".8"/><stop offset=".6" stop-color="#000" stop-opacity="0"/></linearGradient>')
for s in SIDES:
    c, k, tx = s['cls'], s['key'], s['tx']
    o.append(f'<clipPath id="{c}Vial"><path d="{clip(s["x"])}"/></clipPath>')
    o.append(f'<clipPath id="{c}Fluid" class="{c}"><rect class="fclip" x="{s["x"]}" y="{ph(k+"_FY")}" width="{VWID}" height="{ph(k+"_FH")}"/></clipPath>')
    o.append(f'<clipPath id="{c}Inner"><rect x="{r(tx+2)}" y="326.98" width="134.17" height="5" rx="2.5"/></clipPath>')
    o.append(f'<linearGradient id="{c}BarFill" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="{s["c"]}"/><stop offset="1" stop-color="{s["mix"]}"/></linearGradient>')
o.append('</defs>')
o.append(f'<rect width="{VW}" height="{H}" fill="#020409"/>')
o.append(f'<image href="{ph("IMG")}" x="0" y="0" width="{VW}" height="{SCENE_H}" preserveAspectRatio="none"/>')
for s in SIDES:
    c, k, x = s['cls'], s['key'], s['x']
    o.append(f'<g class="{c}" clip-path="url(#{c}Vial)" style="mix-blend-mode:screen">')
    o.append('<g class="fluid" opacity=".87">')
    o.append(f'<svg class="liquid-body lvl" x="{x}" y="{ph(k+"_FY")}" width="{VWID}" height="{ph(k+"_FH")}" viewBox="0 0 400 400" preserveAspectRatio="none" overflow="hidden">')
    o.append(f'<path class="liquid-shape" fill="{s["c"]}" d="{WAVE[0]+CLOSE}"><animate attributeName="d" dur="7.5s" repeatCount="indefinite" {SPL} values="{vals(CLOSE)}"/></path>')
    o.append(f'<path class="liquid-surface" stroke="{s["light"]}" d="{WAVE[0]}"><animate attributeName="d" dur="7.5s" repeatCount="indefinite" {SPL} values="{vals("")}"/></path>')
    o.append('</svg>')
    o.append(f'<g clip-path="url(#{c}Fluid)">')
    o.append(f'<rect x="{x}" y="{VY}" width="{VWID}" height="{VH}" fill="url(#sheen)" style="mix-blend-mode:screen"/>')
    for (bx, sz, dur, delay) in BUBBLES:
        cx = x + VWID * bx / 100 + sz / 2
        cy = VB + 12 - sz / 2
        o.append(f'<circle class="bubble" cx="{r(cx)}" cy="{r(cy)}" r="{r(sz/2-.5)}" fill="{s["c"]}" fill-opacity=".25" stroke="{s["bub"]}" stroke-width="1" style="animation-duration:{dur}s;animation-delay:{delay}s"/>')
    o.append('</g></g>')
    o.append(f'<rect x="{x}" y="{VY}" width="{VWID}" height="{VH}" fill="url(#glass)" opacity=".45"/>')
    o.append('</g>')
o.append(f'<rect x="0" y="{READ_Y}" width="{VW}" height="{READ_H}" fill="url(#readbg)"/>')
for s in SIDES:
    c, k, cx, tx = s['cls'], s['key'], s['rx'], s['tx']
    o.append(f'<g class="{c}" text-anchor="middle">')
    o.append(f'<text class="title" x="{cx}" y="249.9" dominant-baseline="central" font-size="11" font-weight="850" letter-spacing=".605" fill="{s["c"]}">{s["title"]}</text>')
    o.append(f'<text class="value" x="{cx}" y="280.31" dominant-baseline="central" font-size="36" font-weight="900" letter-spacing="-1.26" style="font-variant-numeric:tabular-nums" fill="{s["c"]}">{ph(k+"_VALUE")}</text>')
    o.append(f'<text class="remaining" x="{cx}" y="307.91" dominant-baseline="central" font-size="9" font-weight="750" letter-spacing=".225" fill="#bfc4d6">{ph(k+"_REMAIN")}</text>')
    o.append(f'<rect class="track" x="{tx}" y="324.98" width="138.17" height="9" rx="4.5" fill="#05050c"/>')
    o.append(f'<rect x="{r(tx+2)}" y="326.98" width="134.17" height="5" fill="url(#inset)" clip-path="url(#{c}Inner)"/>')
    o.append(f'<g clip-path="url(#{c}Inner)"><rect class="bar" x="{r(tx+2)}" y="326.98" width="{ph(k+"_BARW")}" height="5" fill="url(#{c}BarFill)"/></g>')
    o.append(f'<rect x="{r(tx+1)}" y="325.98" width="136.17" height="7" rx="3.5" fill="none" stroke="{s["c"]}" stroke-width="2"/>')
    o.append('</g>')
for s in SIDES:
    k, x = s['key'], s['x']
    o.append(f'<g fill="transparent"><title>{ph(k+"_TIP")}</title><rect x="{x}" y="{VY}" width="{VWID}" height="{VH}"/><rect x="{r(s["rx"]-73.5)}" y="{READ_Y}" width="147" height="{READ_H}"/></g>')
o.append('</svg>')


def base_template() -> str:
    """The template as one string, with the {{IMG}} <image> still in place."""
    return '\n'.join(o) + '\n'
