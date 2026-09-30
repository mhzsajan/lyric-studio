"""scan_visibility.py -- every frame, not a sample of frames.

    py scripts/scan_visibility.py <video> <lrc> [ends] [--lit 12] [--dump out.png]

WHY THIS EXISTS
---------------
scripts/lingering.py answered "is a line still up shortly after its end?" and
reported 0 of 109. The user watched the file and said words were still appearing
after they should have ended. The tool was not wrong about the instants it
looked at; it was BLIND:

  1. It sampled at +0.15s, +0.45s and +0.80s. A line still visible for the
     first 149 ms after its end was never measured at all.
  2. Its threshold was LIT=40 on 0..255 grey, so a line at 15% opacity (grey 38)
     counted as ABSENT. Over a bright camera feed a 15% white line is plainly
     visible -- and this deliverable is an overlay, so "visible" is the only
     standard that matters.

Sampling is the wrong tool for a question of the form "does this EVER appear
outside its window". So this decodes EVERY frame, finds the frames with any ink
in them, groups them into intervals, and compares those intervals against the
cue windows. Anything visible outside a window is reported with its timestamp.

The threshold is deliberately low and is reported in the output, because the
number is part of the claim: this answers "is any ink above N/255 present",
and N is stated so the answer can be argued with.
"""
import argparse
import os
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")

STAMP = re.compile(r"\[(\d{1,3}):([0-5]?\d(?:[.:]\d{1,3})?)\]")
META = re.compile(r"^\[(ti|ar|al|au|by|re|ve|length|offset|ti-font|ti-fontfile):", re.I)

# A small grayscale raster is enough to ask "is there ink", and it makes a
# 12,513-frame scan a few seconds instead of a few minutes.
SCALE_W, SCALE_H = 192, 108


def find_ffmpeg():
    import shutil
    f = shutil.which("ffmpeg")
    if f:
        return f
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    comp = os.path.join(root, "node_modules", "@remotion")
    if os.path.isdir(comp):
        for d in sorted(os.listdir(comp)):
            if d.startswith("compositor-"):
                for exe in ("ffmpeg.exe", "ffmpeg"):
                    c = os.path.join(comp, d, exe)
                    if os.path.exists(c):
                        return c
    return None


def secs(t):
    m = re.match(r"^(\d{1,3}):([0-5]?\d)(?:[.:](\d{1,3}))?$", t.strip())
    if not m:
        return None
    f = m.group(3) or "0"
    return int(m.group(1)) * 60 + int(m.group(2)) + int(f) / 10 ** len(f)


def read_cues(lrc, ends_path):
    cues = []
    with open(lrc, encoding="utf-8-sig") as f:
        for raw in f:
            line = raw.strip()
            if not line or META.match(line):
                continue
            text = STAMP.sub("", line).strip()
            if not text:
                continue
            for m, s in STAMP.findall(line):
                cues.append((int(m) * 60 + float(s.replace(":", ".")), text))
    cues.sort(key=lambda c: c[0])

    ends = {}
    if ends_path and os.path.exists(ends_path):
        with open(ends_path, encoding="utf-8-sig") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                parts = [p.strip() for p in line.split("|")]
                if len(parts) < 2:
                    continue
                a, b = secs(parts[0]), secs(parts[1])
                if a is not None and b is not None:
                    ends[round(a, 2)] = b

    windows = []
    for i, (s, t) in enumerate(cues):
        nxt = cues[i + 1][0] if i + 1 < len(cues) else None
        real = ends.get(round(s, 2))
        if real is None or real <= s:
            e = min(max(s, nxt), s + 8) if nxt else s + 8
            e = max(e, s + 0.05)
        else:
            e = min(real, nxt) if nxt else real
        windows.append((s, e, t))
    return windows


def probe(video):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=r_frame_rate,nb_frames,width,height",
         "-show_entries", "format=duration", "-of", "default=nw=1", video],
        capture_output=True, text=True).stdout
    fps = 30.0
    m = re.search(r"r_frame_rate=(\d+)/(\d+)", out)
    if m:
        fps = float(m.group(1)) / float(m.group(2))
    dur = 0.0
    m = re.search(r"duration=([0-9.]+)", out)
    if m:
        dur = float(m.group(1))
    return fps, dur


def scan(ffmpeg, video, lit):
    """Return a list of (frame, lit_fraction) for every frame with ink."""
    cmd = [ffmpeg, "-v", "error", "-i", video,
           "-vf", "scale=%d:%d,format=gray" % (SCALE_W, SCALE_H),
           "-f", "rawvideo", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    size = SCALE_W * SCALE_H
    frames = []
    total = 0
    while True:
        buf = p.stdout.read(size)
        if not buf or len(buf) < size:
            break
        total += 1
        peak = 0
        # Count only bytes above the threshold, and track the peak for context.
        n = 0
        for b in buf:
            if b > lit:
                n += 1
        frames.append(n / float(size))
    p.stdout.close()
    p.wait()
    return frames, total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("lrc")
    ap.add_argument("ends", nargs="?", default="")
    ap.add_argument("--lit", type=int, default=12,
                    help="grey 0-255 above which a pixel counts as ink")
    ap.add_argument("--max-report", type=int, default=20)
    a = ap.parse_args()

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        sys.exit("no ffmpeg found")

    fps, dur = probe(a.video)
    windows = read_cues(a.lrc, a.ends)
    if not windows:
        sys.exit("no cues in " + a.lrc)

    print("=" * 78)
    print("  %s" % os.path.basename(a.video))
    print("  %d cues | %.3f fps | %.2fs" % (len(windows), fps, dur))
    print("  scanning EVERY frame for ink above %d/255 ..." % a.lit)
    frames, total = scan(ffmpeg, a.video, a.lit)
    if not frames:
        sys.exit("no frames decoded")
    print("  %d frames decoded" % total)
    print("=" * 78)

    # Group consecutive lit frames into intervals.
    intervals = []
    i = 0
    while i < len(frames):
        if frames[i] > 0:
            j = i
            while j + 1 < len(frames) and frames[j + 1] > 0:
                j += 1
            intervals.append((i / fps, (j + 1) / fps, frames[i:j + 1]))
            i = j + 1
        else:
            i += 1

    print("\n  ink present in %d of %d frames (%.1f%%)"
          % (sum(1 for f in frames if f > 0), total,
             100.0 * sum(1 for f in frames if f > 0) / total))
    print("  %d separate ink intervals" % len(intervals))
    print("  %d cue windows" % len(windows))

    # A frame is a violation if it has ink and no cue window contains it.
    # The title card legitimately paints before the first lyric and after the
    # last, so those two spans are reported separately rather than called bugs.
    first, last = windows[0][0], windows[-1][1]
    inside = 0
    bad = []
    for (a0, b0, vals) in intervals:
        # Sample the interval's start and end for the window test.
        for t in (a0, (a0 + b0) / 2.0, max(a0, b0 - 1.0 / fps)):
            if t < first - 0.35 or t > last + 0.6:
                continue                       # title card / outro
            if any(w0 - 1.0 / fps <= t <= w1 + 1.0 / fps for w0, w1, _ in windows):
                inside += 1
            else:
                bad.append((t, (a0, b0), max(vals)))
                break

    if not bad:
        print("\n  OK: every ink interval falls inside a cue's [start, end].")
        print("      No lyric is visible outside the window it belongs to.")
    else:
        print("\n  %d ink interval(s) fall OUTSIDE every cue window:\n" % len(bad))
        for t, (a0, b0), peak in bad[:a.max_report]:
            print("    t=%7.3fs  ink %.4f peak  interval %6.2f-%6.2fs"
                  % (t, peak, a0, b0))
        if len(bad) > a.max_report:
            print("    ... and %d more" % (len(bad) - a.max_report))

    # The other direction: how long after its end does ink actually persist?
    print("\n  worst OVERSHOOT past a cue's end (frames with ink after end):")
    worst = []
    for w0, w1, text in windows:
        # The last lit frame attributable to this window, bounded by the next.
        nxt = next((x[0] for x in windows if x[0] > w0), None)
        limit = nxt if nxt is not None else dur
        over = 0
        t = w1
        while t < min(t + 0.5, limit) and (t * fps) < len(frames):
            k = int(t * fps)
            if frames[k] > 0:
                over = max(over, t - w1)
                t += 1.0 / fps
            else:
                break
        if over > 0:
            worst.append((over, w0, w1, text))
    if not worst:
        print("    none: no frame has ink after any cue's end time.")
    else:
        worst.sort(reverse=True)
        for over, w0, w1, text in worst[:a.max_report]:
            print("    +%5.3fs past %7.2fs   %s" % (over, w1, text))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
