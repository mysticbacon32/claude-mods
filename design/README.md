# ooze-gauge design

The source of the ooze-gauge widget's look, and the scripts that turn it into what the mod ships.

| File | What it is |
| --- | --- |
| `claude_usage_cinematic_v10_polished.html` | **Claude Capacity V10**, the approved design: an HTML mock-up with the canister artwork embedded as a JPEG and sliders standing in for real usage. The reference for everything else here. |
| `v10_template.py` | V10's markup and CSS converted to one SVG, laid out as V10 measures at 320 px wide: liquid, surface wave, bubbles, glass, readouts and bars, with V10's timings. `{{PLACEHOLDERS}}` mark what the mod fills in. |
| `trace_lib.py` | Reads the artwork out of the V10 HTML and traces it into compact SVG paths. |
| `build_widget.py` | Builds the widget: V10's template with the artwork as vector paths (the "A2" route). Writes `plugins/ooze-gauge/hooks/widget-svg.ts` and a copy here, `widget-template.svg`, to open in a browser. |
| `requirements.txt` | What the scripts need. |

## Rebuilding

```
pip install -r design/requirements.txt
python design/build_widget.py
```

Then run the mod's tests (`claude plugin test plugins/ooze-gauge`).

## Why it is built this way

These came out of live testing in the Claude desktop app ([issue #1](https://github.com/mysticbacon32/claude-mods/issues/1)):

- **Mods draw SVG, not HTML.** A mod has no HTML or JavaScript, so V10's markup and CSS were converted to one SVG.
- **Embedded pictures don't draw.** `<image>` with a `data:` URI renders blank, so V10's JPEG can't ship. The artwork is traced to paths instead.
- **Size is capped.** The app refuses a drawn tree past **100,000 characters serialized**, where every `"` becomes `\"`. The mod keeps the whole tree under 95,000, and both the build and the tests enforce it.
- **Animation works.** SVG's own animation (SMIL, for the surface wave), CSS keyframes (bubbles, level changes), filters and blend modes all run in the app.

The A2 route spends the budget where it shows:
- **Canisters:** the canisters, caps, rims, bases and puddles are traced at 400 px.
- **Background:** native gradients replace it.
- **Glass:** the windows are smoothed, so the live liquid reads cleanly.
- **Neon:** the bright paths are reused through a blur for a soft bloom.

At 240 px it reads as V10. Fine metal scratches, glossy puddle reflections and the misty background texture are simplified.
