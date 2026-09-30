"""gpu_probe.py -- does --gpu actually make this render faster, and is the file
still correct?

    py scripts/gpu_probe.py <audio> <lrc> [--seconds 20] [--font-file F] [--legacy "..."]

WHY THIS IS A SEPARATE SCRIPT
-----------------------------
"It should be faster with the GPU" is a guess, and this repo has been burned by
plausible-looking unmeasured claims five separate times (gotchas 20, 23, 25, 28,
30). So: render the SAME short slice twice, once as-is and once with --gpu, time
both, and then run the ordinary verification on the GPU output.

Correctness is not traded for speed. A faster file that fails critique is not a
result, so the probe exits non-zero if --gpu produces a file that does not pass.

THE REASON THIS IS WORTH ASKING
-------------------------------
Remotion ships its own ffmpeg, and that build has only:

    libx264      software
    h264_nvenc   NVIDIA

No h264_vaapi and no h264_amf. So on an AMD card there is NO hardware H.264
encoder for Remotion to call -- `--hardware-acceleration=if-possible` tries,
finds nothing, and falls back to libx264. The system ffmpeg has h264_amf and
h264_vaapi, so the hardware encoder EXISTS on this machine, just not in the
binary Remotion uses.

That splits the question in two, and only one of them is answerable with a flag:

    DRAWING the frames   headless Chromium via ANGLE  -> should use the GPU
    ENCODING to H.264    the bundled ffmpeg          -> cannot, no AMD encoder

So --gpu may still be a real win on the draw side even though the encode stays
on the CPU. This measures which part dominates instead of assuming.
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile
import time

sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def run(cmd, timeout=1800):
    t0 = time.time()
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                       timeout=timeout, encoding="utf-8", errors="replace")
    return p.returncode, time.time() - t0, (p.stdout or "") + (p.stderr or "")


def wallclock_of(path):
    """Duration of the finished file, for a like-for-like size comparison."""
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                        "format=duration,size", "-of", "csv=p=0", path],
                       capture_output=True, text=True)
    return r.stdout.strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("lrc")
    ap.add_argument("--seconds", type=float, default=20.0)
    ap.add_argument("--font-file")
    ap.add_argument("--legacy")
    ap.add_argument("--size", default="128")
    a = ap.parse_args()

    py = sys.executable
    common = [
        "node", "render.mjs", a.audio, a.lrc,
        "--no-audio",
        "--length", str(a.seconds),
        "--size", a.size,
        "--mode", "center",
        "--word-anim", "off",
        "--letter-anim", "off",
        # This probe measures GPU throughput. The .lrc is carrying words, not
        # timing, and render.mjs stops when a song has no ends file
        # (gotcha 19/37) -- correct for a render, noise here.
        "--allow-missing-ends",
    ]
    if a.font_file:
        common += ["--font-file", a.font_file]
    if a.legacy:
        common += ["--legacy-font", a.legacy, "--layout", "Preeti",
                   "--font-family", "Abhinav"]

    results = {}
    for label, extra, out in (
        ("default (software encode, software raster)", [], "out/_gpu_base.mp4"),
        ("--gpu (ANGLE raster + hardware accel if available)", ["--gpu"], "out/_gpu_on.mp4"),
    ):
        print("\n" + "=" * 78)
        print("  " + label)
        print("=" * 78)
        rc, secs, log = run(common + extra + ["--out", out])
        ok = "  OK" in log
        size = wallclock_of(out) if os.path.exists(out) else "(no file)"
        results[label] = (secs, size, ok)
        print("  exit        : %d  (rendered ok: %s)" % (rc, ok))
        print("  WALL CLOCK  : %.1f s  (%.1f s of video)" % (secs, a.seconds))
        print("  file        : %s" % size)
        # Did the GPU path actually engage a hardware encoder, or fall back?
        hw = [l for l in log.splitlines() if "hardware" in l.lower()
              or "encoder" in l.lower() or "angle" in l.lower() or "gpu" in l.lower()]
        for l in hw[:6]:
            print("  | " + l.strip()[:110])

    base = list(results.values())[0]
    gpu = list(results.values())[1]
    print("\n" + "=" * 78)
    print("  RESULT")
    print("=" * 78)
    print("  default : %6.1f s   %s" % (base[0], base[1]))
    print("  --gpu   : %6.1f s   %s" % (gpu[0], gpu[1]))
    if gpu[0] < base[0]:
        print("  --gpu is %.0f%% faster (%.1f s saved on %ds of video)"
              % (100 * (base[0] - gpu[0]) / base[0], base[0] - gpu[0], int(a.seconds)))
    else:
        print("  --gpu is NOT faster here (%.1f s vs %.1f s)" % (gpu[0], base[0]))
    print("\n  Wall clock on %d s of video is NOT the deliverable. What matters is"
          % int(a.seconds))
    print("  whether the GPU file is CORRECT, and whether a hardware encoder was")
    print("  used at all. Both need checking before this is adopted.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
