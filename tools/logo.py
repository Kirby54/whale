"""Whale logo options: the whale tail, one simple and readable shape.
Run: python tools/logo.py  -> assets/concepts/*.svg
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "assets" / "concepts"

# Tail points (512 box): tips, leading edge, notch, stem
L1, Lt, L2, L4, L3 = (64, 160), (172, 212), (116, 256), (190, 302), (238, 332)
R1, Rt, R2, R4, R3 = (448, 160), (340, 212), (396, 256), (322, 302), (274, 332)
N, C, S = (256, 258), (256, 332), (256, 434)

FLUKE = ("M256 434C246 402 240 362 238 330C200 312 150 292 112 252C86 224 72 196 64 160"
         "C96 186 132 204 172 212C206 219 236 232 256 258C276 232 306 219 340 212"
         "C380 204 416 186 448 160C440 196 426 224 400 252C362 292 312 312 274 330"
         "C272 362 266 402 256 434Z")


def poly(pts, fill):
    return f'<polygon points="{" ".join(f"{x},{y}" for x, y in pts)}" fill="{fill}"/>'


def facets(left, right):
    """Tail cut like a gem: 6 facets per side, light coming from the left."""
    lf = [(L1, Lt, L2), (L2, Lt, L4), (Lt, N, L4), (L4, N, L3), (L3, N, C), (L3, C, S)]
    rf = [(R1, Rt, R2), (R2, Rt, R4), (Rt, N, R4), (R4, N, R3), (R3, N, C), (R3, C, S)]
    return "".join(poly(p, c) for p, c in zip(lf, left)) + "".join(poly(p, c) for p, c in zip(rf, right))


OCEAN = (["#e0e7ff", "#a5b4fc", "#c7d2fe", "#818cf8", "#6366f1", "#4f46e5"],
         ["#67e8f9", "#0891b2", "#22d3ee", "#06b6d4", "#0e7490", "#155e75"])
VIOLET = (["#ede9fe", "#c4b5fd", "#ddd6fe", "#a78bfa", "#8b5cf6", "#7c3aed"],
          ["#a78bfa", "#6d28d9", "#8b5cf6", "#7c3aed", "#5b21b6", "#4c1d95"])


def squircle(fill):
    return f'<rect width="1024" height="1024" rx="232" fill="{fill}"/>'


def place(inner, scale=1.8, dy=10):
    # centers the tail (box 64..448 x 160..434) in the 1024 icon
    tx = 512 - 256 * scale
    ty = 512 - 297 * scale + dy
    return f'<g transform="translate({tx:.1f} {ty:.1f}) scale({scale})">{inner}</g>'


def water(color, opacity):
    return (f'<path d="M150 470C210 448 302 448 362 470" fill="none" stroke="{color}" stroke-opacity="{opacity}" stroke-width="14" stroke-linecap="round"/>'
            f'<path d="M196 500C236 488 276 488 316 500" fill="none" stroke="{color}" stroke-opacity="{opacity * 0.6}" stroke-width="12" stroke-linecap="round"/>')


def svg(body, view):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}">{body}</svg>\n'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    grad = ('<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">'
            '<stop offset="0" stop-color="#4338ca"/><stop offset=".55" stop-color="#2563eb"/><stop offset="1" stop-color="#06b6d4"/>'
            '</linearGradient></defs>')
    concepts = {
        # A: ocean gem (indigo on the left, turquoise on the right)
        "a-ocean-gem": (facets(*OCEAN), "#0a0a12"),
        # B: violet gem, monochrome
        "b-violet-gem": (facets(*VIOLET), "#0c0a14"),
        # C: solid white tail on a gradient, modern app-icon style
        "c-gradient": (f'<path d="{FLUKE}" fill="#fff"/>{water("#fff", 0.55)}', "url(#bg)"),
    }
    for name, (mark, bg) in concepts.items():
        defs = grad if bg.startswith("url") else ""
        (OUT / f"{name}-mark.svg").write_text(svg(mark, "40 140 432 380"), encoding="utf-8")
        (OUT / f"{name}-app.svg").write_text(svg(defs + squircle(bg) + place(mark), "0 0 1024 1024"), encoding="utf-8")
    print("logo options written to", OUT)


if __name__ == "__main__":
    main()
