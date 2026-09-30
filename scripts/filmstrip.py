"""filmstrip.py -- frames from a finished video, spread across it, in a grid.

    py scripts/filmstrip.py <video> <out.png> [--n 24] [--cols 4] [--start 90]

"See the video" is not a thing a screenshot does, so this shows the next best
thing: a sample of frames across the whole song, each labelled with its
timestamp, so the placements, the motion and the pacing are all visible at once.
It is the same idea as a contact sheet (gotcha 26) applied to a finished render:
one variable per row, nothing else in the frame.

Labels are ASCII (a timestamp), so no shaping is needed and nothing depends on
PIL having Raqm -- which it does not on this machine, and which would make any
Devanagari drawn here a lie.
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")

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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("out")
    ap.add_argument("--n", type=int, default=24)
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--start", type=float, default=90.0,
                    help="first timestamp; the opening is often a title card")
    ap.add_argument("--end", type=float, default=0.0, help="0 = video length")
    a = ap.parse_args()

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        sys.exit("no ffmpeg found")

    dur = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", a.video], capture_output=True, text=True
    ).stdout.strip() or 0)
    if not dur:
        sys.exit("could not read the duration")
    end = a.end or dur
    if a.start >= end:
        a.start = 0.0

    # Evenly spaced samples, the first one nudged off the title card.
    step = (end - a.start) / max(1, a.n - 1)
    times = [a.start + i * step for i in range(a.n)]

    tmp = tempfile.mkdtemp(prefix="strip-")
    try:
        from PIL import Image, ImageDraw
        frames = []
        for i, t in enumerate(times):
            png = os.path.join(tmp, "f%03d.png" % i)
            r = subprocess.run(
                [ffmpeg, "-v", "error", "-ss", "%.3f" % t, "-i", a.video,
                 "-frames:v", "1", "-y", png], capture_output=True)
            if r.returncode != 0 or not os.path.exists(png):
                continue
            im = Image.open(png).convert("RGB")
            # Crop the black plate away so the tile is mostly text, but keep a
            # margin so a line near an edge still shows its whole block.
            g = im.convert("L").point(lambda v: 255 if v > LIT else 0)
            box = g.getbbox()
            if box:
                pad = 60
                box = (max(0, box[0] - pad), max(0, box[1] - pad),
                       min(im.width, box[2] + pad), min(im.height, box[3] + pad))
                im = im.crop(box)
            frames.append((t, im))

        if not frames:
            sys.exit("no frames extracted")

        TW = 420
        TH = max(1, int(TW * frames[0][1].height / frames[0][1].width))
        rows = (len(frames) + a.cols - 1) // a.cols
        W, H = a.cols * TW, rows * (TH + 18)
        sheet = Image.new("RGB", (W, H), (18, 18, 18))
        draw = ImageDraw.Draw(sheet)
        for i, (t, im) in enumerate(frames):
            r, c = divmod(i, a.cols)
            im2 = im.resize((TW, TH), Image.LANCZOS)
            x, y = c * TW, r * (TH + 18)
            sheet.paste(im2, (x, y + 18))
            draw.text((x + 5, y + 4), "%d:%05.1f" % (int(t // 60), t % 60),
                      fill=(140, 200, 140))
        sheet.save(a.out)
        print("  wrote %s  (%dx%d, %d frames from %s to %s of %ds)"
              % (a.out, sheet.width, sheet.height, len(frames),
                 times[0], times[-1], dur))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
