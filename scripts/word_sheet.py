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
LABEL_W = 150
COL_W = 460
ROW_H = 150
COLS = 3
LIT = 40


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


def crop_lit(png, height):
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
    scale = min(COL_W / w, (height - 2 * PAD) / h)
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

    tmp = tempfile.mkdtemp(prefix="wordsheet-")
    try:
        from PIL import Image, ImageDraw
        print("  extracting %d frames from each render..." % len(words))
        A = grab_midframes(ffmpeg, a.test, len(words), a.slot, tmp, "A")
        B = grab_midframes(ffmpeg, a.reference, len(words), a.slot, tmp, "B")

        rows = (len(words) + COLS - 1) // COLS
        W = COLS * (LABEL_W + 2 * COL_W)
        H = rows * ROW_H
        sheet = Image.new("RGB", (W, H), (255, 255, 255))
        draw = ImageDraw.Draw(sheet)
        missing = 0

        for i in range(len(words)):
            r, c = divmod(i, COLS)
            x0 = c * (LABEL_W + 2 * COL_W)
            y0 = r * ROW_H

            # ASCII label: index + the key sequence it becomes.
            draw.text((x0 + 4, y0 + 4), "%03d" % i, fill=(120, 120, 120))
            k = labels.get(i, "")
            if k:
                # Keys are ASCII, so this needs no shaping.
                draw.text((x0 + 4, y0 + 24), k[:22], fill=(0, 90, 170))
            draw.rectangle([x0 + LABEL_W + COL_W, y0, x0 + LABEL_W + 2 * COL_W, y0 + ROW_H],
                           outline=(220, 220, 220))

            for k2, path in enumerate((A[i], B[i])):
                if not path:
                    missing += 1
                    continue
                im = crop_lit(path, ROW_H)
                if im is None:
                    missing += 1
                    continue
                x = x0 + LABEL_W + k2 * COL_W + (COL_W - im.width) // 2
                y = y0 + (ROW_H - im.height) // 2
                sheet.paste(im, (x, y))

        # Column headers drawn last so they are not overwritten.
        for c, name in enumerate((os.path.basename(a.test),
                                  os.path.basename(a.reference))):
            x = c * (LABEL_W + 2 * COL_W) + LABEL_W
            draw.rectangle([x, 0, x + COL_W, 26], fill=(240, 240, 240))
            draw.text((x + 6, 7), name[:60], fill=(20, 20, 20))
        sheet = sheet.crop((0, 0, W, H - 26))
        sheet.save(a.out)
        print("  wrote %s  (%dx%d, %d rows of %d)" % (a.out, sheet.width, sheet.height, rows, COLS))
        if missing:
            print("  %d blank cells -- a word had no lit pixels in one column" % missing)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
