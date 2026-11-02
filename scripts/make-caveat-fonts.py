"""Generate the static Caveat faces the app serves, from Caveat's variable font.

1. Regular (wght 400) and Bold (wght 700) static TTFs, instanced from the
   variable font so they keep its full character set (latin-ext included).
   jsPDF can only embed static TrueType, so these are what PDF export uses.
2. Synthetic oblique Italic and Bold Italic: Caveat ships no italic, so the
   outlines are skewed 12 degrees and marked italic, giving canvas, SVG and
   PDF the same slanted face. Each is written as a full TTF (for jsPDF) and
   as latin / latin-ext woff2 subsets (for the browser).

The variable font is downloaded from a pinned google/fonts commit and checked
against a SHA-256, so reruns produce byte-identical files. All outputs are
Modified Versions of Caveat under the SIL OFL 1.1 (Caveat declares no Reserved
Font Name; see apps/web/public/fonts/Caveat-OFL.txt and NOTICE.txt).

Run from the repo root:
  uv run --with fonttools==4.55.3 --with brotli==1.1.0 python scripts/make-caveat-fonts.py
"""

import hashlib
import io
import math
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SOURCE_URL = (
    "https://raw.githubusercontent.com/google/fonts/"
    "a85fc09e44c70c7159761adfdc9d5dd007792c15/ofl/caveat/Caveat%5Bwght%5D.ttf"
)
SOURCE_SHA256 = "0bdb6b660482d31531b3945849fba5916b3ef8695da7024a9e6b9ee3c4157988"

FONTS = Path(__file__).resolve().parent.parent / "apps/web/public/fonts"
ANGLE = 12.0
SLANT = math.tan(math.radians(ANGLE))

# Same unicode-range subsets as the upright Google Fonts woff2 files (and the
# @font-face rules in apps/web/src/app/globals.css).
SUBSETS = {
    "latin": "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    "latin-ext": "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
}


def codepoints(ranges: str) -> list[int]:
    out: list[int] = []
    for part in ranges.split(","):
        lo, _, hi = part.strip().removeprefix("U+").partition("-")
        out.extend(range(int(lo, 16), int(hi or lo, 16) + 1))
    return out


def write_woff2_subsets(ttf: Path, stem: str) -> None:
    """One woff2 per unicode-range subset, for the browser (the full TTF stays for jsPDF)."""
    for subset_name, ranges in SUBSETS.items():
        options = subset.Options()
        options.flavor = "woff2"
        options.layout_features = ["*"]
        options.name_IDs = ["*"]
        options.name_languages = ["*"]
        options.notdef_outline = True
        options.recalc_timestamp = False
        font = TTFont(ttf, recalcTimestamp=False)
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=codepoints(ranges))
        subsetter.subset(font)
        subset.save_font(font, FONTS / f"{stem}-{subset_name}.woff2", options)


def skew(x: float, y: float) -> tuple[int, int]:
    return round(x + y * SLANT), round(y)


def set_names(font: TTFont, style: str, ps_name: str) -> None:
    names = font["name"]
    family = "Caveat"
    names.removeNames(nameID=25)  # variations PostScript name prefix
    for rec_id, value in (
        (1, family),
        (2, style),
        (3, f"{ps_name};generated"),
        (4, f"{family} {style}"),
        (6, ps_name),
        (16, family),
        (17, style),
    ):
        names.setName(value, rec_id, 3, 1, 0x409)
        names.setName(value, rec_id, 1, 0, 0)


def load_variable_font() -> bytes:
    data = urllib.request.urlopen(SOURCE_URL, timeout=60).read()
    digest = hashlib.sha256(data).hexdigest()
    if digest != SOURCE_SHA256:
        raise SystemExit(f"Caveat variable font checksum mismatch: {digest}")
    return data


def make_static(vf_data: bytes, weight: int, dst: str, style: str, ps_name: str) -> None:
    # Keep the source timestamp so reruns produce byte-identical files.
    vf = TTFont(io.BytesIO(vf_data), recalcTimestamp=False)
    font = instancer.instantiateVariableFont(vf, {"wght": weight})
    font.recalcTimestamp = False
    bold = weight >= 700
    font["OS/2"].usWeightClass = weight
    os2 = font["OS/2"]
    os2.fsSelection = (os2.fsSelection & ~0b1100001) | ((1 << 5) if bold else (1 << 6))
    font["head"].macStyle = 0b01 if bold else 0
    set_names(font, style, ps_name)
    font.save(FONTS / dst)


def make_oblique(src: str, dst_stem: str, style: str, ps_name: str, bold: bool) -> None:
    font = TTFont(FONTS / src, recalcTimestamp=False)
    glyf = font["glyf"]
    for name in font.getGlyphOrder():
        glyph = glyf[name]
        if glyph.isComposite():
            # Components are already skewed; only their offsets need the shear.
            for comp in glyph.components:
                comp.x, comp.y = skew(comp.x, comp.y)
        elif glyph.numberOfContours > 0:
            coords = glyph.coordinates
            for i in range(len(coords)):
                coords[i] = skew(*coords[i])
        glyph.recalcBounds(glyf)
    # Hinting was made for upright outlines.
    for tag in ("fpgm", "prep", "cvt ", "hdmx"):
        if tag in font:
            del font[tag]
    for name in font.getGlyphOrder():
        glyf[name].removeHinting()

    font["post"].italicAngle = -ANGLE
    font["hhea"].caretSlopeRise = 1000
    font["hhea"].caretSlopeRun = round(1000 * SLANT)
    font["head"].macStyle = (0b01 if bold else 0) | 0b10
    os2 = font["OS/2"]
    os2.fsSelection = (os2.fsSelection & ~(1 << 6)) | 1 | ((1 << 5) if bold else 0)

    set_names(font, style, ps_name)
    font["name"].setName(
        "Synthetic oblique of Caveat, generated by scripts/make-caveat-fonts.py; "
        "a Modified Version under the SIL Open Font License 1.1.",
        10,
        3,
        1,
        0x409,
    )

    font.save(FONTS / f"{dst_stem}.ttf")
    write_woff2_subsets(FONTS / f"{dst_stem}.ttf", dst_stem)


vf_data = load_variable_font()
make_static(vf_data, 400, "caveat-regular.ttf", "Regular", "Caveat-Regular")
make_static(vf_data, 700, "caveat-bold.ttf", "Bold", "Caveat-Bold")
make_oblique("caveat-regular.ttf", "caveat-italic", "Italic", "Caveat-Italic", bold=False)
make_oblique("caveat-bold.ttf", "caveat-bolditalic", "Bold Italic", "Caveat-BoldItalic", bold=True)
