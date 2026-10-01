"""colour_words.py -- is a line ONE colour, or one colour per word?

    py scripts/colour_words.py <video> <t1> <t2> ...

WHY
---
The instruction is "do not use colours in entire lines" -- a line must not come out
a single colour, because a coloured sentence is not an accent inside a lyric, it is
the lyric wearing a paint. The repo has had this fault twice: lineColor() gave
every word of a phrase presentation the same hue, and --color-gradient gave a whole
line one gradient.

The only way to know which happened is to count colours PER WORD inside a single
frame, so this segments the ink on column gaps -- a space between two words is a
vertical run of empty columns, and no Devanagari glyph has a column gap inside
itself except at a break, so the segmentation is reliable -- and reports the
distinct hues per line.

A line with ONE distinct hue is the fault. A line with several is correct, and the
number is worth seeing because a two-word line legitimately has two.
"""
import subprocess
import sys

from PIL import Image

FF = r"node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe"


def hue_of(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    if mx == mn:
        return None                      # achromatic -- white, not a hue
    d = mx - mn
    if mx == r:
        h = 60 * (((g - b) / d) % 6)
    elif mx == g:
        h = 60 * ((b - r) / d + 2)
    else:
        h = 60 * ((r - g) / d + 4)
    return round(((h % 360) + 360) % 360)


def main():
    video = sys.argv[1]
    times = sys.argv[2:]
    worst = []
    all_white = []
    print("")
    print("  %-9s %6s %8s  %s" % ("t", "words", "colours", "per-word hue"))
    print("  " + "-" * 74)
    for t in times:
        out = "out/diag/cw_%s.png" % t.replace(".", "_")
        subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-ss", t,
                        "-i", video, "-frames:v", "1", out, "-y"], check=False)
        im = Image.open(out).convert("RGB")
        px = im.load()
        w, h = im.size

        # ink columns
        cols = []
        for x in range(w):
            n = 0
            for y in range(0, h, 2):
                r, g, b = px[x, y]
                if r > 60 and (r + g + b) > 200:
                    n += 1
            cols.append(n)

        # split on runs of >=18 empty columns (a space at 105px type)
        words = []
        gap = 0
        start = None
        for x, n in enumerate(cols):
            if n > 0:
                if start is None:
                    start = x
                gap = 0
            else:
                if start is not None:
                    gap += 1
                    if gap >= 18:
                        words.append((start, x - gap))
                        start = None
        if start is not None:
            words.append((start, w - 1))

        hues = []
        for (a, b) in words:
            acc = [0, 0, 0]
            for x in range(a, b + 1):
                for y in range(0, h, 2):
                    r, g, bl = px[x, y]
                    if r > 60 and (r + g + bl) > 200:
                        acc[0] += r
                        acc[1] += g
                        acc[2] += bl
            n = max(1, (b - a + 1) * (h // 2))
            hh = hue_of(acc[0] // n, acc[1] // n, acc[2] // n)
            hues.append("white" if hh is None else str(hh))

        distinct = sorted(set(h for h in hues if h != "white"))
        if hues and all(h == "white" for h in hues):
            all_white.append(t)
        print("  %-9s %6d %8d  %s" % (t + "s", len(words), len(distinct),
                                      " ".join(hues)))
        # A FAULT is every word carrying the SAME chroma -- no white anywhere. One
        # accent among white words is the design, not the fault, and the first
        # version of this flagged it because it counted hues without counting
        # whites, so "one accent in a white line" read as "one colour".
        if len(words) >= 2 and len(distinct) == 1 and len(distinct) == len(hues):
            worst.append((t, len(words)))

    print("")
    if worst:
        print("  LINES THAT CAME OUT A SINGLE CHROMA HUE (the fault):")
        for t, n in worst:
            print("    t=%ss  %d words, 1 hue" % (t, n))
        print("")
        print("  A coloured line is a coloured sentence, not an accent inside a lyric.")
    else:
        print("  no sampled line is entirely one chroma colour.")
    # A line that is entirely WHITE is the CORRECT result and used to be reported as
    # the fault by this script, which was correct at the time and is wrong now. The
    # unit of colour is the syllable and most syllables are white by design, so
    # "one colour" and "one HUE" stopped being the same measurement when
    # syllableAccent() landed. Reporting a white line as a fault would send the next
    # person to add colour back to fix a complaint about too much colour.
    allwhite = [t for t in times
                if t in all_white]
    if allwhite:
        print("  lines that are entirely white (CORRECT -- colour is an accent): %s"
              % ", ".join(allwhite))
    print("")


if __name__ == "__main__":
    main()
