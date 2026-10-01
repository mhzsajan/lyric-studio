"""
bbox_report.py -- where does the text block actually sit, and is it inside the frame?

    py scripts/bbox_report.py out/diag/s_78.png [...]

WHY THIS INSTRUMENT
-------------------
Reported: the matras are lost, but only in CERTAIN sections of a song -- "half way
correct and half way not". That rules out the font (it would be wrong everywhere)
and rules out a global clip (same). What changes between sections is POSITION:
`--mode mix --mix-block 8` deals a band shape per block of eight cues, and
`--x-pos` moves each line horizontally. So the failure is a line placed where the
frame, or the height budget, cuts it.

THE TWO NUMBERS
----------------
For each still: the ink bounding box, and therefore

    top    = distance from the frame's top edge to the top of the ink
    bottom = distance from the bottom of the ink to the frame's bottom edge

A Devanagari line's ink sits inside its line box with the above-matras in the
ascent and the below-matras in the descent. If the block's top or bottom reaches
the frame edge, the matras at that end are gone, and the word reads as a different
word -- तिमीले without its ी and े is तमल, मायालु without its ु is मायाल.

So the test is not "is the text visible" but "is there room for the matras", and
the threshold is the matra height itself, not zero. A line whose ink comes within
a few pixels of the edge has already lost something.
"""
import os
import sys

from PIL import Image

FRAME_W, FRAME_H = 1920, 1080

# The reported failures, for the log line.
CASES = {
    u"तिमीले": "तमल",
    u"मायालु": "मायाल",
}


def ink_bbox(path, thresh=40):
    im = Image.open(path).convert("L")
    px = im.load()
    w, h = im.size
    mnx, mny, mxx, mxy = w, h, -1, -1
    area = 0
    for y in range(h):
        for x in range(w):
            if px[x, y] > thresh:
                area += 1
                if x < mnx:
                    mnx = x
                if x > mxx:
                    mxx = x
                if y < mny:
                    mny = y
                if y > mxy:
                    mxy = y
    if mxx < 0:
        return None
    return mnx, mny, mxx, mxy, area, w, h


def main():
    paths = sys.argv[1:]
    if not paths:
        print("give me some pngs")
        return
    print("")
    print("  %-22s %6s %6s %6s %6s %6s  %s" % (
        "file", "top", "bottom", "left", "right", "rows", "verdict"))
    print("  " + "-" * 74)
    bad = []
    for p in sorted(paths):
        r = ink_bbox(p)
        if r is None:
            print("  %-22s (no ink -- empty frame)" % os.path.basename(p))
            continue
        mnx, mny, mxx, mxy, area, w, h = r
        top, bot = mny, h - 1 - mxy
        left, right = mnx, w - 1 - mxx
        rows = mxy - mny + 1
        # 12px is roughly the height of a matra at this size. Inside that, the
        # matra at that end of the block is already gone.
        why = []
        if top < 12:
            why.append("TOP matra cut")
        if bot < 12:
            why.append("BOTTOM matra cut")
        verdict = ", ".join(why) if why else "clear"
        if why:
            bad.append((os.path.basename(p), verdict))
        print("  %-22s %6d %6d %6d %6d %6d  %s" % (
            os.path.basename(p), top, bot, left, right, rows, verdict))
    print("")
    if bad:
        print("  %d of %d frames have a matra at a frame edge:" % (len(bad), len(paths)))
        for n, v in bad:
            print("    %-22s %s" % (n, v))
        print("")
        print("  That is the reported failure exactly: a word loses its above-matra")
        print("  (तिमीले -> तमल) or its below-matra (मायालु -> मायाल) depending on")
        print("  which band the mix block dealt it. The fix is in the block's height")
        print("  budget and its vertical placement, not in the font and not in the")
        print("  colour.")
    else:
        print("  every sampled frame keeps its matras clear of the frame edge.")
    print("")


if __name__ == "__main__":
    main()
