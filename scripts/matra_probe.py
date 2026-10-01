"""matra_probe.py -- does the text block lose its matras, and how many pixels?

    py scripts/matra_probe.py

WHY
---
Reported: "all the upper section of this text, तिमीले becomes तमाला", and "texts
that have lower characters, मायालु becomes mayal".

Those are the two vertical extremes of Devanagari: the ABOVE-matras (ी े ै ो ौ)
and the BELOW-matras (ु ू ृ). Both being lost is not two bugs, it is one: the
vertical extent of the text is being clipped, and the matras are what stick out
past it. Colour and font are irrelevant to that, which is why it showed up in
every font and on white words as well as red ones.

THE MEASUREMENT
---------------
For the exact string, at the exact size, ask the font how tall its ink is, and
compare that with how tall the ink actually is in a rendered frame. If the font
needs 1.59em and the frame shows 1.25em, then roughly 0.34em of glyph -- which is
exactly where the matras live -- is being cut off by something.

There is no third possibility worth considering. Either the font's own ink is
short (and the matras are simply absent from the face, which is a font defect and
would be visible in any editor), or the render is shorter than the font (and
something is clipping). This script answers which.
"""
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FONT = os.path.join(ROOT, "..", "nepali-legacy-fonts", "fonts", "kalam", "Kalam-Bold.ttf")

# The two strings the report names, plus the song's own opening line.
STRINGS = [
    u"तिमीलाई भुलेको,",
    u"मायालु",
    u"होइन",
]

SIZE = 105.0     # --size-preset medium


def ink_extent(font, upem, text):
    """(top above baseline, bottom below baseline) in em, over the real glyphs."""
    from fontTools.ttLib import TTFont
    cmap = font.getBestCmap()
    order = font.getGlyphOrder()
    glyf = font["glyf"]
    top = None
    bot = None
    for ch in text:
        if ch == " ":
            continue
        gname = cmap.get(ord(ch))
        if gname is None or gname not in order:
            continue
        g = glyf[gname]
        if g.numberOfContours == 0:
            continue
        if top is None or g.yMax > top:
            top = g.yMax
        if bot is None or g.yMin < bot:
            bot = g.yMin
    if top is None:
        return None
    return (top / float(upem), -bot / float(upem))


def main():
    from fontTools.ttLib import TTFont
    font = TTFont(FONT, fontNumber=0, lazy=True)
    upem = font["head"].unitsPerEm
    os2 = font["OS/2"]
    typo_asc = os2.sTypoAscender / float(upem)
    typo_desc = abs(os2.sTypoDescender) / float(upem)
    hhea_asc = font["hhea"].ascent / float(upem)
    hhea_desc = abs(font["hhea"].descender) / float(upem)
    font.close()

    linebox = 1.32          # the lineHeight in LyricOverlay.jsx
    print("")
    print("  Kalam-Bold, upem %d, at %.0fpx" % (upem, SIZE))
    print("  OS/2 typo  ascent %.3f  descent %.3f  -> %.0fpx tall" % (
        typo_asc, typo_desc, (typo_asc + typo_desc) * SIZE))
    print("  hhea       ascent %.3f  descent %.3f  -> %.0fpx tall" % (
        hhea_asc, hhea_desc, (hhea_asc + hhea_desc) * SIZE))
    print("  line-height 1.32em          -> %.0fpx" % (linebox * SIZE))
    print("")
    print("  %-22s %10s %10s %12s" % ("string", "ink top", "ink bottom", "ink height"))
    print("  " + "-" * 58)
    worst = 0.0
    for s in STRINGS:
        e = ink_extent(TTFont(FONT, fontNumber=0, lazy=True), upem, s)
        if e is None:
            print("  %-22s (no ink)" % s.encode("ascii", "replace").decode())
            continue
        top, bot = e
        h = top + bot
        worst = max(worst, h)
        name = s.encode("unicode_escape").decode()
        print("  %-22s %9.3fem %9.3fem %9.0fpx" % (
            name[:22], top, bot, h * SIZE))
    print("")

    need = worst * SIZE
    have = linebox * SIZE
    print("  The tallest of these needs %.0fpx of ink." % need)
    print("  The line box the renderer gives it is %.0fpx." % have)
    if need > have:
        print("")
        print("  NEEDED > AVAILABLE by %.0fpx (%.2fem)." % (need - have, (need - have) / SIZE))
        print("  That is the matras. The above-matras live in the ascent and the")
        print("  below-matras in the descent, so a block sized to the line box")
        print("  removes exactly the parts a reader needs to tell तिमीले from तमल")
        print("  and मायालु from मायाल -- which is what was reported.")
    else:
        print("")
        print("  The line box is tall enough, so nothing is clipping in height and")
        print("  the matras must be missing from the face itself. Check the font.")
    print("")


if __name__ == "__main__":
    main()
