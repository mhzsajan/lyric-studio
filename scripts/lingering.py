"""Measure whether a lyric line is still on screen AFTER its tapped end.

The critique samples cue MIDPOINTS (is there text when a line should be there).
It never samples just after a cue's END -- so a line that lingers past its own
tapped end is invisible to it. This measures exactly that.

    py scripts/lingering.py <video> --lrc song.lrc [--limit N] [--ffmpeg PATH]

For every cue: sample a few frames after `end` and report the lit fraction.
Overlay mode is black plate + white text, so any ink after the end is a line
that has not cleared. A transition may still be fading, so the window is
configurable and the report separates "still fully lit" from "fading out".
"""
import argparse
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile

try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

STAMP = re.compile(r"\[(\d{1,3}):([0-5]?\d(?:[.:]\d{1,3})?)\]")
META = re.compile(r"^\[(ti|ar|al|au|by|re|ve|length|offset|ti-font|ti-fontfile):", re.I)
LIT = 40


def read_cues(path):
    cues = []
    with open(path, encoding="utf-8-sig") as f:
        for raw in f:
            raw = raw.strip()
            if not raw or META.match(raw):
                continue
            stamps = STAMP.findall(raw)
            text = STAMP.sub("", raw).strip()
            if not text:
                continue
            for m, s in stamps:
                cues.append((int(m) * 60 + float(s.replace(":", ".")), text))
    cues.sort(key=lambda c: c[0])
    return cues


def read_ends(path):
    """start|end|text lines, in seconds."""
    out = {}
    with open(path, encoding="utf-8-sig") as f:
        for raw in f:
            raw = raw.strip()
            if not raw or raw.startswith("#"):
                continue
            parts = [p.strip() for p in raw.split("|")]
            if len(parts) < 2:
                continue
            def sec(t):
                m = re.match(r"^(\d{1,3}):([0-5]?\d)(?:[.:](\d{1,3}))?$", t)
                if not m:
                    return None
                f3 = m.group(3) or "0"
                return int(m.group(1)) * 60 + int(m.group(2)) + int(f3) / 10 ** len(f3)
            a, b = sec(parts[0]), sec(parts[1])
            if a is not None and b is not None:
                out[round(a, 2)] = b
    return out


def find_ffmpeg(explicit):
    if explicit:
        return explicit
    f = shutil.which("ffmpeg")
    if f:
        return f
    comp = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "node_modules", "@remotion")
    ext = ".exe" if os.name == "nt" else ""
    if os.path.isdir(comp):
        for d in sorted(os.listdir(comp)):
            if d.startswith("compositor-"):
                c = os.path.join(comp, d, "ffmpeg" + ext)
                if os.path.exists(c):
                    return c
    return None


def video_fps(video):
    """The real frame rate, because the frame grid decides what is measurable.

    A video has no frame at an arbitrary timestamp. At 15 fps the grid is 0.067s
    apart, so asking for t=237.47 returns the frame at t=237.5333 -- which on
    Allare is already inside the NEXT line. A tool that checks the requested
    time but is handed a later frame measures the wrong line, and reports a line
    as lingering when the frame is the next line's entrance.
    """
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "stream=r_frame_rate", "-of",
                        "csv=p=0", video], capture_output=True, text=True)
    try:
        num, den = r.stdout.strip().split("/")
        return float(num) / float(den)
    except Exception:
        return 30.0


def frame_at(t, fps):
    """The index of the frame that is ON SCREEN at time t.

    ffmpeg's -ss does not land on a time; it returns a FRAME, and which one is
    decided by the frame grid plus float rounding. Measured on Allare: a sample
    requested at t=219.2667s came back as the frame at 219.3333s, because
    219.2667 is the boundary of that frame and the comparison went the other
    way. That frame was the next line's first 30 ms, so the previous line got
    reported as still lit when its opacity was provably 0.0000 (scripts/_probe40
    style reasoning, and reproducible in check_motion's terms).

    So the sample is specified as a FRAME INDEX and converted to a seek time
    that is unambiguously inside that frame: index/fps + half a frame. Nothing
    here rounds to a boundary, so there is no boundary case left to get wrong.
    """
    return int(math.floor(t * fps + 1e-9))


def seek_time(frame, fps):
    """Half a frame into `frame` -- safely inside it, never on its edge."""
    return (frame + 0.5) / fps


def lit_fraction(ffmpeg, video, frame, fps, png):
    r = subprocess.run([ffmpeg, "-v", "error", "-ss", "%.6f" % seek_time(frame, fps),
                        "-i", video, "-frames:v", "1", "-y", png], capture_output=True)
    if r.returncode != 0 or not os.path.exists(png):
        return None
    from PIL import Image
    import numpy as np
    a = np.asarray(Image.open(png).convert("L"), dtype=np.float32)
    return float((a > LIT).mean())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--lrc", required=True)
    ap.add_argument("--ends", help="the .ends.txt, for the TRUE ends")
    ap.add_argument("--limit", type=int, default=0, help="only the first N cues")
    ap.add_argument("--ffmpeg")
    a = ap.parse_args()

    ffmpeg = find_ffmpeg(a.ffmpeg)
    if not ffmpeg:
        sys.exit("  no ffmpeg found")
    cues = read_cues(a.lrc)
    ends = read_ends(a.ends) if a.ends and os.path.exists(a.ends) else {}
    if a.limit:
        cues = cues[:a.limit]

    fps = video_fps(a.video)
    tmp = tempfile.mkdtemp(prefix="linger-")
    print("\n  %s at %.3f fps -- frames are %.0f ms apart\n"
          % (os.path.basename(a.video), fps, 1000.0 / fps))
    print("  cue   start     end    +0.15s  +0.45s  +0.80s   text")
    print("  " + "-" * 74)
    worst = []
    try:
        for i, (start, text) in enumerate(cues):
            true_end = ends.get(round(start, 2))
            end = true_end if true_end is not None else None
            if end is None:
                continue

            # THE NEXT LINE'S START BOUNDS THE WINDOW.
            #
            # This tool answers "is THIS line still on screen after ITS end". A
            # sample that lands after the following cue has started measures the
            # FOLLOWING cue, and calling that lingering is a false positive --
            # on Allare, cues 9 and 10 were reported as lingering at 0.02 lit
            # purely because the next line began 0.04 s after they ended. Any
            # sample that overlaps the next line is therefore recorded as
            # "next" and never counted, so the number means one thing only.
            nxt = cues[i + 1][0] if i + 1 < len(cues) else None
            # The next line's FIRST FRAME. A sample at or past this belongs to
            # the next line, whatever timestamp it was requested under.
            nxt_frame = frame_at(nxt, fps) if nxt is not None else None
            end_frame = frame_at(end, fps)

            vals = []
            for off in (0.15, 0.45, 0.80):
                f = frame_at(end + off, fps)
                if f <= end_frame:
                    # The frame is still inside this line's own span: no room to
                    # test "after the end" at this frame rate.
                    vals.append(None)
                    continue
                if nxt_frame is not None and f >= nxt_frame:
                    vals.append(None)          # the frame belongs to the next line
                    continue
                png = os.path.join(tmp, "f%d_%d.png" % (i, int(off * 100)))
                vals.append(lit_fraction(ffmpeg, a.video, f, fps, png))

            valid = [v for v in vals if v is not None]
            if not valid:
                def fmt(t):
                    return "%d:%05.2f" % (int(t // 60), t % 60)
                print("  %-4d %-8s %-6s %7s  %7s  %7s  %s"
                      % (i + 1, fmt(start), fmt(end), "-", "-", "-",
                         text + "   (next line starts inside the window)"))
                continue

            v15, v45, v80 = vals
            v15 = 0.0 if v15 is None else v15
            v45 = 0.0 if v45 is None else v45
            v80 = 0.0 if v80 is None else v80
            flag = ""
            if v15 > 5e-4:
                flag = "  <-- STILL LIT after its end"
                worst.append((i + 1, start, end, v15, text))
            elif v45 > 5e-4:
                flag = "  <- fading at +0.45s"
            def fmt(t):
                return "%d:%05.2f" % (int(t // 60), t % 60)
            print("  %-4d %-8s %-6s %7.4f  %7.4f  %7.4f  %s%s" % (
                i + 1, fmt(start), fmt(end), v15, v45, v80, text, flag))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print("\n  %d of %d cues are still lit 0.15s AFTER their own end time"
          % (len(worst), len(cues)))
    print("  (a sample landing inside the following line's span measures THAT")
    print("   line, so it is excluded rather than counted as lingering)")
    if not worst:
        print("  -> every line clears on its own tapped end time.")
    for i, s, e, v, t in worst[:14]:
        print("    cue %d  end %d:%05.2f  lit %.4f  %s"
              % (i, int(e // 60), e % 60, v, t))
    if len(worst) > 14:
        print("    ... and %d more" % (len(worst) - 14))
    return 1 if worst else 0


if __name__ == "__main__":
    sys.exit(main())
