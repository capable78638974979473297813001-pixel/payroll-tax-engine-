#!/usr/bin/env python3
"""Build the brand icons and the social-share image from the landing-page wordmark.

The wordmark is "Omnia", a raised accent dot, "tax" (site/assets/v5.css, .mark): Archivo at
weight 640, letter-spacing -0.02em, ink #16181A, accent #C8442A. This script draws it from the
font's own outlines, so the SVG needs no font on the viewer's machine, and renders the PNGs from
that SVG so every file shows the same shapes.

    pip install fonttools pillow
    python3 scripts/build-brand-assets.py

Writes site/logo/{wordmark.svg,favicon.svg,favicon-48.png,favicon-96.png,favicon-192.png,
favicon-512.png,apple-touch-icon.png,favicon.ico,og-image.png} and site/site.webmanifest.
The PNGs need node with playwright (Chromium).
"""
import json
import subprocess
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "site" / "logo"
FONT = ROOT / "site" / "assets" / "fonts" / "v5" / "Archivo[wdth,wght].ttf"
INK, ACCENT, PAPER = "#16181A", "#C8442A", "#FBFBF9"  # --ink, --accent, --bg in site/assets/v5.css

font = instantiateVariableFont(TTFont(str(FONT)), {"wght": 640, "wdth": 100})
UPM = font["head"].unitsPerEm
cmap = font.getBestCmap()
glyphs = font.getGlyphSet()
hmtx = font["hmtx"]
CAP = getattr(font["OS/2"], "sCapHeight", 0) or int(UPM * 0.7)
XH = getattr(font["OS/2"], "sxHeight", 0) or int(UPM * 0.5)


def run(text, x, scale, tracking=-0.02):
    """SVG path data for `text` starting at x (font units already scaled), baseline at y=0, y down."""
    d, pen_x = [], x
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, pen_x, 0)))
        d.append(pen.getCommands())
        pen_x += hmtx[name][0] * scale + tracking * UPM * scale
    return " ".join(d), pen_x


def wordmark_svg(height_em=1.0):
    """'Omnia' + raised dot + 'tax', exactly the spacing of .mark in v5.css (font-size 21px)."""
    s = 1.0 / UPM * 100  # 100 units per em
    omnia, x = run("Omnia", 0, s)
    dot_d, gap = 21.9, 14.3  # 4.6px and 3px at a 21px em, scaled to 100 per em
    cx = x + gap + dot_d / 2
    cy = -(CAP * s) - 1.0  # the dot rides at cap height, above the word, between the two halves (align-self: flex-start)
    tax, end = run("tax", x + gap * 2 + dot_d, s)
    pad = 12
    top = -(CAP * s) - pad
    w, h = end + pad * 2, (CAP * s) + pad * 2 + 22
    body = (
        f'<g transform="translate({pad} 0)"><path fill="{INK}" d="{omnia}"/>'
        f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{dot_d / 2:.2f}" fill="{ACCENT}"/>'
        f'<path fill="{INK}" d="{tax}"/></g>'
    )
    return w, h, top, body


def write(path, text):
    path.write_text(text, encoding="utf-8")
    print("wrote", path.relative_to(ROOT))


# --- wordmark.svg (transparent) ---------------------------------------------------------------
w, h, top, body = wordmark_svg()
write(
    LOGO / "wordmark.svg",
    f'<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Omnia.tax" viewBox="0 {top:.2f} {w:.2f} {h:.2f}" '
    f'width="{w * 3:.0f}" height="{h * 3:.0f}">{body}</svg>\n',
)

# --- icon: a bold "O" with the brand dot, on paper, for 16px to 512px ------------------------
s = 1.0 / UPM * 100
o_name = cmap[ord("O")]
o_pen = SVGPathPen(glyphs)
glyphs[o_name].draw(TransformPen(o_pen, (s, 0, 0, -s, 0, 0)))
o_adv = hmtx[o_name][0] * s
# O at ~50% of the box height, with the raised dot to its upper right, the pair centred. The dot keeps
# the wordmark's proportions (diameter 0.219em, grown 35% so it survives 16px; the gap is tighter than the wordmark's) and everything stays inside the central
# circle, because Google crops a favicon to one.
def layout(box):
    fit = box / (CAP * s)
    o_w = o_adv * fit
    em = 100.0 * fit  # one em, in icon units, at this scale
    gap, dot_r = 0.06 * em, 0.219 * em / 2 * 1.35
    ox = (100 - (o_w + gap + 2 * dot_r)) / 2
    oy = 50 + (CAP * s * fit) / 2
    cx, cy = ox + o_w + gap + dot_r, oy - CAP * s * fit + dot_r * 0.15
    far = ((cx - 50) ** 2 + (cy - 50) ** 2) ** 0.5 + dot_r  # farthest edge of the dot from the centre
    return fit, o_w, gap, dot_r, ox, oy, far


box = 56.0
while layout(box)[-1] > 45.0:  # Google crops a favicon to a circle: keep the dot inside it
    box -= 1.0
fit, o_w, gap, dot_r, ox, oy, _ = layout(box)
icon_body = (
    f'<rect width="100" height="100" fill="{PAPER}"/>'
    f'<path fill="{INK}" transform="translate({ox:.2f} {oy:.2f}) scale({fit:.4f})" d="{o_pen.getCommands()}"/>'
    f'<circle cx="{ox + o_w + gap + dot_r:.2f}" cy="{oy - CAP * s * fit + dot_r * 0.15:.2f}" r="{dot_r:.2f}" fill="{ACCENT}"/>'
)
favicon = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="48" height="48">{icon_body}</svg>\n'
write(LOGO / "favicon.svg", favicon)

# --- PNGs from the SVGs, via Chromium (node + playwright) so there is no extra renderer to trust ---
import base64  # noqa: E402

FONT_B64 = base64.b64encode(FONT.read_bytes()).decode()
ww, wh, wtop, wbody = wordmark_svg()
PADPX = 12 * 760 / ww  # the wordmark's own padding, so its edge lines up with the text under it
mark = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {wtop:.2f} {ww:.2f} {wh:.2f}" style="width:760px;height:auto">{wbody}</svg>'
og_html = f"""<body style="margin:0;width:1200px;height:630px;background:{PAPER};display:flex;flex-direction:column;justify-content:center;padding:0 90px;box-sizing:border-box;font-family:Archivo,Arial,sans-serif;color:{INK}">
  <style>@font-face{{font-family:Archivo;src:url(data:font/ttf;base64,{FONT_B64}) format('truetype');font-weight:100 900;font-stretch:75% 125%}}</style>
  <div style="margin-left:-{PADPX}px">{mark}</div>
  <div style="font-size:54px;line-height:1.12;font-weight:600;letter-spacing:-0.02em;margin-top:34px;max-width:980px">Payroll tax calculation, as an API.</div>
  <div style="font-size:28px;margin-top:22px;color:#5B6066;max-width:1020px">Federal, state and local withholding, line by line. $0.08 per paycheck.</div>
  <div style="position:absolute;left:0;bottom:0;width:1200px;height:14px;background:{ACCENT}"></div></body>"""
job = {
    "favicon": favicon,
    "paper": PAPER,
    "icons": [[48, "favicon-48.png"], [96, "favicon-96.png"], [192, "favicon-192.png"], [512, "favicon-512.png"], [180, "apple-touch-icon.png"]],
    "og": og_html,
    "out": str(LOGO),
}
NODE = r"""
const { chromium } = require('playwright');
const job = JSON.parse(require('fs').readFileSync(0, 'utf8'));
(async () => {
  const browser = await chromium.launch();
  for (const [size, name] of job.icons) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<body style="margin:0;background:${job.paper}"><img style="width:${size}px;height:${size}px;display:block" src="data:image/svg+xml;base64,${Buffer.from(job.favicon).toString('base64')}"></body>`);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${job.out}/${name}` });
  }
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(job.og);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${job.out}/og-image.png` });
  await browser.close();
})();
"""
subprocess.run(["node", "-e", NODE], input=json.dumps(job).encode(), check=True, cwd=str(ROOT))
for _, name in job["icons"]:
    print("wrote", (LOGO / name).relative_to(ROOT))
print("wrote", (LOGO / "og-image.png").relative_to(ROOT))

# --- favicon.ico (16, 32, 48) from the 48px render ---------------------------------------------
from PIL import Image  # noqa: E402

big = Image.open(LOGO / "favicon-192.png").convert("RGBA")
big.save(LOGO / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
print("wrote", (LOGO / "favicon.ico").relative_to(ROOT))

# --- web app manifest --------------------------------------------------------------------------
write(
    ROOT / "site" / "site.webmanifest",
    json.dumps(
        {
            "name": "Omnia.tax",
            "short_name": "Omnia.tax",
            "description": "Payroll tax calculation API",
            "start_url": "/",
            "display": "browser",
            "background_color": PAPER,
            "theme_color": PAPER,
            "icons": [
                {"src": "/logo/favicon-192.png", "sizes": "192x192", "type": "image/png"},
                {"src": "/logo/favicon-512.png", "sizes": "512x512", "type": "image/png"},
            ],
        },
        indent=2,
    )
    + "\n",
)
