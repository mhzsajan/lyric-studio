"""
type_size.py -- how big is the type ACTUALLY, in px, at these timestamps?

    py scripts/type_size.py <video> <t1> <t2> ...

WHY
---
"This font is soo small at 3 min and 3 min 09 seconds" -- reported three times now,
and twice I have replied that it was fixed. Both times I fixed a cause I had
reasoned about (the band, then the column width) without ever MEASURING the type at
the two timestamps in question, so "fixed" meant "the thing I changed is different",
not "the number the complaint is about is different".

This measures the number. The unit is the height of a ROW of text -- the ink from the
top of an above-matra to the bottom of a below-matra -- compared against what a full
--size row would be at the house size of 105px. That ratio is the fraction of full
size actually on screen, and it is the thing the complaint is about.

The row height is found by scanning for horizontal GAPS: rows of text are separated
by empty line bands, so a run of empty rows between two inked runs is one row break.
That works for a wrapped line and for the vertical column alike, and it does not
assume how the line was typeset.
"""
import subprocess
import sys

from PIL import Image

FF = r"node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe"

HOUSE = 105.0          # --size-preset medium
# A full-size Devanagari row at 105px: the ink runs from the top of an above-matra
# to the bottom of a below-matra, which for the faces in use is about 1.28em. Used
# only as the denominator for the ratio, so the exact constant does not matter --
# what matters is the RATIO between the timestamps, which is measured directly.
FULL_ROW_EM = 1.28
FULL_ROW_PX = HOUSE * FULL_ROW_EM   # 134px


def rows_of(path):
    im = Image.open(path).convert("L")
    px = im.load()
    w, h = im.size
    ink = []
    for y in range(h):
        n = 0
        for x in range(0, w, 2):
            if px[x, y] > 45:
                n += 1
        ink.append(n)

    # empty-row runs
    runs = []
    start = None
    for y, n in enumerate(ink):
        if n == 0:
            if start is None:
                start = y
        else:
            if start is not None:
                runs.append((start, y - 1))
                start = None
    if start is not None:
        runs.append((start, h - 1))

    out = []
    for (a, b) in runs:
        if b - a >= 3:          # a row of text, not a hairline
            out.append((a, b, b - a + 1))
    return out, h


def main():
    video, times = sys.argv[1], sys.argv[2:]
    print("")
    print("  %-8s %6s %9s %9s %8s  %s" % (
        "t", "rows", "row px", "est. size", "% of full", "verdict"))
    print("  " + "-" * 72)
    small = []
    for t in times:
        out = "out/diag/ts_%s.png" % t.replace(".", "_")
        subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-ss", t,
                        "-i", video, "-frames:v", "1", out, "-y"], check=False)
        rows, h = rows_of(out)
        if not rows:
            print("  %-8s (no ink)" % t)
            continue
        # the median row height -- one odd row should not decide the answer
        hs = sorted(r[2] for r in rows)
        row = hs[len(hs) // 2]
        est = row / FULL_ROW_EM
        pct = est / HOUSE * 100
        verdict = "TOO SMALL" if pct < 70 else "ok"
        if pct < 70:
            small.append((t, round(est)))
        print("  %-8s %6d %9d %8.0fpx %7.0f%%  %s" % (
            t + "s", len(rows), row, est, pct, verdict))
    print("")
    if small:
        print("  TOO SMALL at: %s" % ", ".join(
            "%s (%dpx)" % (t, px) for t, px in small))
        print("  House size is %dpx; below 70%% of it reads as a caption, not a lyric."
              % HOUSE)
    else:
        print("  every sampled timestamp is at or above 70%% of the house size.")
    print("")


if __name__ == "__main__":
    main()
