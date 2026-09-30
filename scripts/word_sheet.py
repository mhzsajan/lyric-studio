"""word_sheet.py -- stitch two word-sheet renders into one side-by-side review.

    py scripts/word_sheet.py <test.mp4> <reference.mp4> <lrc> <out.png> [--slot 1.0]

Both inputs are the SAME word list rendered through the SAME engine (Remotion /
Chromium): the left column is the font under test, the right is a known-good
Unicode font. That is the whole point of the comparison and why neither column
is drawn here:

  - PIL has no Raqm on this machine, so Devanagari conjuncts would not fuse and
    the reference column would be a lie;
  - a codes table proves the ENCODER and DECODER agree, which is not the same
    question as whether the FONT draws the right glyph (gotcha 23).

So this only measures and pastes: it finds each word's lit bounding box, crops
the two columns to the same height, and stacks them in a grid. Row labels are
ASCII (the index and the key sequence) so they need no shaping either.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")

STAMP = re.compile(r"\[(\d{1,3}):([0-5]?\d(?:[.:]\d{1,3})?)\]")
META = re.compile(r"^\[(ti|ar|al|au|by|re|ve|length|offset|ti-font|ti-fontfile):", re.I)
PAD = 10
LIT = 40

# Cell geometry. Tuned by hand because a word sheet is only useful if the words
# are BIG enough to actually read -- a 54-word grid at thumbnail size is the same
# as no sheet at all, since a reader cannot tell a wrong glyph from a right one
# at 40 px. Fewer columns, taller rows, and each cell holds the two renders side
# by side so they are compared in one glance.
LABEL_W = 170
COL_W = 620
ROW_H = 210
COLS = 2


def find_ffmpeg():
    f = shutil.which("ffmpeg")
    if f:
        return f
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    comp = os.path.join(root, "node_modules", "@remotion")
    if os.path.isdir(comp):
        for d in sorted(os.listdir(comp)):
            if d.startswith("compositor-"):
                c = os.path.join(comp, d, "ffmpeg.exe")
                if os.path.exists(c):
                    return c
    return None


def words_of(path):
    out = []
    for raw in open(path, encoding="utf-8-sig"):
        line = raw.strip()
        if not line or META.match(line):
            continue
        t = STAMP.sub("", line).strip()
        if t:
            out.append(t)
    return out


def grab_midframes(ffmpeg, video, n, slot, tmp, tag):
    """One frame per word: the middle of its 1s slot.

    `-ss 0.5 -vf fps=1` puts frame i exactly at 0.5 + i*slot, which is the
    middle of word i -- so no frame arithmetic is done here and the sample is
    unambiguous. (After gotcha 32, an approximate sample is not acceptable.)
    """
    out = []
    for i in range(n):
        png = os.path.join(tmp, "%s-%03d.png" % (tag, i))
        t = i * slot + slot / 2
        r = subprocess.run(
            [ffmpeg, "-v", "error", "-ss", "%.4f" % t, "-i", video,
             "-frames:v", "1", "-y", png],
            capture_output=True,
        )
        if r.returncode != 0 or not os.path.exists(png):
            out.append(None)
            continue
        out.append(png)
    return out


def crop_lit(png, height, col_w):
    """Crop to the lit bounding box, then scale to a common row height."""
    from PIL import Image
    im = Image.open(png).convert("L")
    mask = im.point(lambda v: 255 if v > LIT else 0)
    box = mask.getbbox()
    if not box:
        return None
    im2 = Image.open(png).convert("RGB").crop(box)
    w, h = im2.size
    if h == 0:
        return None
    scale = min(col_w / w, (height - 2 * PAD) / h)
    return im2.resize((max(1, int(w * scale)), max(1, int(h * scale))),
                      Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("test")
    ap.add_argument("reference")
    ap.add_argument("lrc")
    ap.add_argument("out")
    ap.add_argument("--slot", type=float, default=1.0)
    ap.add_argument("--labels", help="file with one 'index<TAB>keys' per line")
    ap.add_argument("--cols", type=int, default=COLS, help="cells per row")
    ap.add_argument("--row-h", type=int, default=ROW_H)
    ap.add_argument("--first", type=int, default=0, help="first word index")
    ap.add_argument("--count", type=int, default=0, help="how many (0 = all)")
    a = ap.parse_args()

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        sys.exit("no ffmpeg found")

    words = words_of(a.lrc)
    labels = {}
    if a.labels and os.path.exists(a.labels):
        for raw in open(a.labels, encoding="utf-8"):
            if "\t" in raw:
                i, k = raw.rstrip("\n").split("\t", 1)
                labels[int(i)] = k

    # A slice of the word list, so a 54-word sheet can be shown in three parts
    # at a readable size instead of one grid too dense to judge a glyph in.
    all_words = words
    lo = max(0, a.first)
    hi = lo + a.count if a.count else len(words)
    words = all_words[lo:hi]
    idx_of = {i: lo + i for i in range(len(words))}

    tmp = tempfile.mkdtemp(prefix="wordsheet-")
    try:
        from PIL import Image, ImageDraw
        print("  extracting %d frames from each render..." % len(words))
        A = grab_midframes(ffmpeg, a.test, hi, a.slot, tmp, "A")[lo:hi]
        B = grab_midframes(ffmpeg, a.reference, hi, a.slot, tmp, "B")[lo:hi]

        cols, row_h = max(1, a.cols), max(40, a.row_h)
        rows = (len(words) + cols - 1) // cols
        W = cols * (LABEL_W + 2 * COL_W)
        H = rows * row_h
        sheet = Image.new("RGB", (W, H), (255, 255, 255))
        draw = ImageDraw.Draw(sheet)
        missing = 0

        for i in range(len(words)):
            r, c = divmod(i, cols)
            x0 = c * (LABEL_W + 2 * COL_W)
            y0 = r * row_h

            # ASCII label: index + the key sequence it becomes. Both are ASCII,
            # so nothing here needs shaping.
            gi = idx_of[i]
            draw.text((x0 + 6, y0 + 10), "%03d" % gi, fill=(120, 120, 120))
            k = labels.get(gi, "")
            if k:
                draw.text((x0 + 6, y0 + 34), k[:24], fill=(0, 90, 170))
            draw.rectangle([x0 + LABEL_W + COL_W, y0, x0 + LABEL_W + 2 * COL_W, y0 + row_h],
                           outline=(225, 225, 225))
            draw.rectangle([x0, y0, x0 + LABEL_W + 2 * COL_W, y0 + row_h],
                           outline=(240, 240, 240))

            for k2, path in enumerate((A[i], B[i])):
                if not path:
                    missing += 1
                    continue
                im = crop_lit(path, row_h, COL_W)
                if im is None:
                    missing += 1
                    continue
                x = x0 + LABEL_W + k2 * COL_W + (COL_W - im.width) // 2
                y = y0 + (row_h - im.height) // 2
                sheet.paste(im, (x, y))

        # Column headers drawn last so they are not overwritten by a paste.
        for c, name in enumerate((os.path.basename(a.test),
                                  os.path.basename(a.reference))):
            x = c * (LABEL_W + 2 * COL_W) + LABEL_W
            draw.rectangle([x, 0, x + COL_W, 30], fill=(238, 238, 238))
            draw.text((x + 8, 9), name[:70], fill=(20, 20, 20))
        sheet = sheet.crop((0, 0, W, H - 30))
        sheet.save(a.out)
        print("  wrote %s  (%dx%d, %d words in %d rows of %d)"
              % (a.out, sheet.width, sheet.height, len(words), rows, cols))
        if missing:
            print("  %d blank cells -- a word had no lit pixels in one column" % missing)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
