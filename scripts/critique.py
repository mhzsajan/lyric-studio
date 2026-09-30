"""critique.py -- the feedback loop: verify the RENDERED FILE, not the exit code.

    py scripts/critique.py out/song.mp4 --lrc song.lrc --mode overlay
    py scripts/critique.py out/song.mp4 --lrc song.lrc --mode styled --expect-audio
    py scripts/critique.py out/song.mp4 --lrc song.lrc --no-audio --audio-seconds 417.10

Exit 0 = every check passed. Exit 1 = at least one FAILED (the output names the
check, the timestamp, and the command to look at the frame yourself).

WHY THIS EXISTS
---------------
"A render that finishes is not a render that is correct" (renderer gotcha 15).
Every failure this project has shipped -- silent roam renders, wrong text at
t=145s, wrong fonts, clipped lines -- exited 0 and passed the container checks.
critique.py extends check_output.py from the container to the PICTURE: it
samples frames at the times the .lrc says words are on screen and asks whether
there are words on screen.

WHAT IT PROVES AND WHAT IT DOES NOT
-----------------------------------
Proves, per sampled frame:
  streams      one video stream; audio present/absent as expected
  duration     video length against the audio or --audio-seconds
  presence     text is actually drawn at every sampled cue midpoint
  purity       (overlay mode) the plate corners are pure black, so Add/Screen
               blending keys cleanly
  edges        no text ink in the outer 2% margin anywhere sampled (gotcha 16:
               latent edge-clips survive spot checks; this scans the file)

Does NOT prove glyph IDENTITY -- that द is not ध, that the layout encoded the
right word. Nothing pixel-statistical can (that is the whole lesson of the
font repo's verify-vs-check_song split). Identity is what the --prepare-only
still and the font gate are for; --ocr prints where that automation would go.

Checks use ffmpeg/ffprobe (system, or --ffmpeg/--ffprobe, or the Remotion
compositor binaries) and Pillow for the pixel statistics.
"""
import argparse
import json
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
META = re.compile(r"^\[(ti|ar|al|au|by|re|ve|length|offset|ti-font|ti-fontfile):",
                  re.I)

LIT = 40       # overlay: a pixel brighter than this is "text"
BRIGHT = 180   # styled: the lyric is white+halo; the background may be lit
MARGIN = 0.02  # outer 2% of each edge


def read_cues(path, ends_path=None):
    """(start_seconds, text, end_seconds) per lyric line.

    The end is needed because a line is on screen only for [start, end) -- the
    window the ends file was tapped to define (gotcha 31) -- so every presence
    sample has to land inside it. `end_seconds` is the guessed next-start when
    there is no companion, which is the old behaviour.

    NOTE the third element: read_cues used to return pairs and every caller
    unpacked two values. The end is appended rather than derived inside the
    checker so that one place owns "when is a line on screen".
    """
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
                cues.append([int(m) * 60 + float(s.replace(":", ".")), text, None])
    cues.sort(key=lambda c: c[0])

    ends = {}
    if ends_path and os.path.exists(ends_path):
        with open(ends_path, encoding="utf-8-sig") as f:
            for raw in f:
                raw = raw.strip()
                if not raw or raw.startswith("#"):
                    continue
                parts = [p.strip() for p in raw.split("|")]
                if len(parts) < 2:
                    continue
                a = _secs(parts[0])
                b = _secs(parts[1])
                if a is not None and b is not None:
                    ends[round(a, 2)] = b

    for i, c in enumerate(cues):
        nxt = cues[i + 1][0] if i + 1 < len(cues) else c[0] + 8
        real = ends.get(round(c[0], 2))
        # A tapped end past the next line's start is the singer's tail; the
        # renderer clamps it, so clamp it here too or the two disagree.
        c[2] = min(real, nxt) if real is not None and real > c[0] else min(max(c[0], nxt), c[0] + 8)
    return cues


def _secs(t):
    m = re.match(r"^(\d{1,3}):([0-5]?\d)(?:[.:](\d{1,3}))?$", t.strip())
    if not m:
        return None
    frac = m.group(3) or "0"
    return int(m.group(1)) * 60 + int(m.group(2)) + int(frac) / 10 ** len(frac)


def find_tools(explicit_ffmpeg, explicit_ffprobe):
    ffmpeg, ffprobe = explicit_ffmpeg, explicit_ffprobe
    if not ffmpeg:
        ffmpeg = shutil.which("ffmpeg")
    if not ffprobe:
        ffprobe = shutil.which("ffprobe")
    if not (ffmpeg and ffprobe):
        here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        comp = os.path.join(here, "node_modules", "@remotion")
        if os.path.isdir(comp):
            for d in sorted(os.listdir(comp)):
                if d.startswith("compositor-"):
                    ext = ".exe" if os.name == "nt" else ""
                    ffmpeg = ffmpeg or (os.path.join(comp, d, "ffmpeg" + ext)
                                        if os.path.exists(os.path.join(comp, d, "ffmpeg" + ext)) else None)
                    ffprobe = ffprobe or (os.path.join(comp, d, "ffprobe" + ext)
                                          if os.path.exists(os.path.join(comp, d, "ffprobe" + ext)) else None)
    return ffmpeg, ffprobe


def probe(ffprobe, video):
    cmd = [ffprobe, "-v", "error", "-print_format", "json",
           "-show_format", "-show_streams", video]
    res = subprocess.run(cmd, capture_output=True)
    if res.returncode != 0:
        raise SystemExit("  critique: ffprobe failed on " + video + "\n" +
                         res.stderr.decode("utf-8", "replace")[:500])
    return json.loads(res.stdout.decode("utf-8", "replace"))


def grab(ffmpeg, video, t, out_png):
    cmd = [ffmpeg, "-v", "error", "-ss", "%.3f" % t, "-i", video,
           "-frames:v", "1", "-y", out_png]
    res = subprocess.run(cmd, capture_output=True)
    return res.returncode == 0 and os.path.exists(out_png)


def frame_stats(png):
    """(lit_frac, bright_frac, std, corner_sum, margin_bright_frac) via Pillow.

    One IMAGE per sample and statistics computed on the whole frame -- the
    lesson from calibrate_width's band-scanning bug: shared context produces
    confidently wrong numbers.
    """
    from PIL import Image
    import numpy as np
    img = np.asarray(Image.open(png).convert("L"), dtype=np.float32)
    h, w = img.shape
    lit = float((img > LIT).mean())
    bright = float((img > BRIGHT).mean())
    std = float(img.std())
    c = max(8, min(h, w) // 34)  # ~32px at 1080p
    corners = np.concatenate([
        img[:c, :c].ravel(), img[:c, -c:].ravel(),
        img[-c:, :c].ravel(), img[-c:, -c:].ravel(),
    ])
    corner_sum = float(corners.sum())
    mx, my = int(w * MARGIN), int(h * MARGIN)
    margin = np.concatenate([
        img[:my, :].ravel(), img[-my:, :].ravel(),
        img[:, :mx].ravel(), img[:, -mx:].ravel(),
    ])
    margin_bright = float((margin > BRIGHT).mean())
    return lit, bright, std, corner_sum, margin_bright


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--lrc", required=True)
    ap.add_argument("--ends", help="the .ends.txt companion, so presence is "
                    "sampled inside each line's real on-screen window")
    ap.add_argument("--mode", choices=["overlay", "styled"], default="overlay")
    ap.add_argument("--expect-audio", action="store_true")
    ap.add_argument("--no-audio", action="store_true")
    ap.add_argument("--audio-seconds", type=float, default=0.0)
    ap.add_argument("--max-samples", type=int, default=24)
    ap.add_argument("--ffmpeg")
    ap.add_argument("--ffprobe")
    ap.add_argument("--ocr", action="store_true")
    a = ap.parse_args()

    if not os.path.exists(a.video):
        sys.exit("  critique: no such file: " + a.video)
    if a.expect_audio and a.no_audio:
        sys.exit("  critique: --expect-audio and --no-audio contradict")

    ffmpeg, ffprobe = find_tools(a.ffmpeg, a.ffprobe)
    if not (ffmpeg and ffprobe):
        sys.exit("  critique: no ffmpeg/ffprobe (install, or pass --ffmpeg/--ffprobe;\n"
                 "             an installed Remotion project bundles both)")

    if a.ocr:
        print("  note: --ocr is the roadmap slot for glyph-identity checking")
        print("        (tesseract + Devanagari traineddata vs the .lrc text).")
        print("        v1 proves presence/timing/purity/edges; identity stays")
        print("        the --prepare-only still + font gate's job.")

    info = probe(ffprobe, a.video)
    streams = info.get("streams", [])
    vstreams = [s for s in streams if s.get("codec_type") == "video"]
    astreams = [s for s in streams if s.get("codec_type") == "audio"]
    duration = float(info.get("format", {}).get("duration", 0) or 0)

    results = []   # (name, ok, detail)

    # -- streams --
    results.append(("streams", len(vstreams) == 1,
                    "%d video, %d audio" % (len(vstreams), len(astreams))))
    if a.expect_audio:
        results.append(("audio-present", len(astreams) == 1,
                        "expected an audio track" if not astreams else "ok"))
    if a.no_audio:
        results.append(("audio-absent", len(astreams) == 0,
                        "expected NO audio track" if astreams else "ok"))

    # -- duration --
    expect = 0.0
    if a.audio_seconds:
        expect = a.audio_seconds
    elif a.expect_audio and astreams:
        expect = float(astreams[0].get("duration", 0) or 0)
    if expect:
        delta = duration - expect
        ok = abs(delta) <= 1.0
        # The direction matters and is stated, because the two failures are not
        # the same problem: too SHORT means lyrics were cut off (gotcha 14's
        # failure), too LONG means the clip lingers past the song or the
        # caller asked for a length the length-ownership rule overrode.
        which = "" if abs(delta) <= 1.0 else ("TOO SHORT, lyrics cut" if delta < 0 else "longer than asked")
        results.append(("duration", ok,
                        "video %.2fs vs expected %.2fs  (%+.2fs)%s"
                        % (duration, expect, delta, "  " + which if which else "")))
    else:
        results.append(("duration", duration > 0, "%.2fs (nothing to compare)" % duration))

    cues = read_cues(a.lrc, a.ends)
    cue_ends = [c[2] for c in cues]
    if not cues:
        results.append(("cues", False, "no cues parsed from " + a.lrc))
    else:
        # -- presence at cue midpoints --
        # Sampling is spread across the song: a head-only sample is how the
        # Ritu failure (wrong text at t=145s in a 6-minute file) survives
        # spot checks. Midpoints, not starts: the entrance animation owns the
        # first ~0.34s of a cue, so a midpoint is settled text.
        #
        # THE SAMPLE MUST LAND INSIDE THE CUE'S OWN SPAN. It used to be
        #     mid = start + min(1.5, max(0.3, (nxt - start) * 0.55))
        # which measures forward from the NEXT line's start with no idea how
        # long this cue is, and on a short cue the 1.5 s cap lands past its own
        # end. Four of 24 samples on Allare fell into the silent gap AFTER the
        # line had finished and BEFORE the next one began -- where nothing is
        # scheduled to be drawn at all -- and were reported as "no lit text".
        #
        # That check passed the broken file and failed the fixed one, which is
        # the signature of a test measuring the wrong thing: it was only ever
        # right by accident. The old renderer kept a line up to the next line's
        # start, so the overshoot happened to land on text; once end timing
        # actually works (gotcha 31), a blank gap is the CORRECT picture and
        # this rule reports it as a defect.
        #
        # So: sample the midpoint of the cue's OWN [time, end), and count a cue
        # with no usable interior as a skip rather than a failure.
        n = min(len(cues), max(1, a.max_samples))
        step = len(cues) / n
        samples = []
        for i in range(n):
            idx = min(len(cues) - 1, int(i * step))
            start, text, _end = cues[idx]
            end = cue_ends[idx]
            span = end - start
            if span <= 0.05:
                continue                      # nothing scheduled on screen
            # A hair past the midpoint, so the sample is clear of the entrance
            # fade even on a cue only a few frames longer than the fade itself.
            lead = min(0.34 + 0.06, span * 0.45)
            mid = start + min(max(lead, span * 0.55), span - 0.04)
            if mid < duration - 0.05:
                samples.append((idx, mid, text))

        tmp = tempfile.mkdtemp(prefix="critique-")
        missing, clipped, impure = [], [], []
        styled_blank = []
        try:
            for k, (idx, mid, _text) in enumerate(samples):
                png = os.path.join(tmp, "f%03d.png" % k)
                if not grab(ffmpeg, a.video, mid, png):
                    missing.append((idx, mid, "frame extraction failed"))
                    continue
                lit, bright, std, corner_sum, margin_bright = frame_stats(png)
                if a.mode == "overlay":
                    if lit < 2e-4:
                        missing.append((idx, mid, "no lit text (lit=%.5f)" % lit))
                    if corner_sum > 0:
                        impure.append((idx, mid, "corner sum %.0f" % corner_sum))
                    if margin_bright > 1e-4:
                        clipped.append((idx, mid, "ink>40 in margin %.5f" % margin_bright))
                else:  # styled
                    if bright < 1e-4 or std < 5:
                        styled_blank.append((idx, mid,
                                             "bright=%.5f std=%.1f" % (bright, std)))
                    mb = float(margin_bright)
                    if mb > 1e-4:
                        clipped.append((idx, mid, "bright text in margin %.5f" % mb))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

        results.append(("text-present", not missing and not styled_blank,
                        "%d/%d sampled cue frames carry text"
                        % (len(samples) - len(missing) - len(styled_blank), len(samples))))
        if a.mode == "overlay":
            results.append(("black-plate", not impure,
                            "%d/%d samples pure-black corners"
                            % (len(samples) - len(impure), len(samples))))
        results.append(("no-edge-clip", not clipped,
                        "%d/%d samples clear of the margins"
                        % (len(samples) - len(clipped), len(samples))))

        for label, items in (("missing", missing + styled_blank),
                             ("impure", impure), ("clipped", clipped)):
            for idx, mid, why in items[:6]:
                print("    !! cue %d @ %.2fs: %s (%s)" % (idx + 1, mid, why, label))
                print("       look: ffmpeg -ss %.2f -i \"%s\" -frames:v 1 cue%d.png"
                      % (mid, a.video, idx + 1))
            if len(items) > 6:
                print("    ... and %d more %s" % (len(items) - 6, label))

    # -- report --
    print("\n  critique: %s  (%s mode)" % (os.path.basename(a.video), a.mode))
    print("    %-14s %-6s %s" % ("check", "result", "detail"))
    failed = 0
    for name, ok, detail in results:
        print("    %-14s %-6s %s" % (name, "PASS" if ok else "FAIL", detail))
        if not ok:
            failed += 1
    if failed:
        print("\n  VERDICT: %d check(s) FAILED -- do not ship this file." % failed)
        return 1
    print("\n  VERDICT: every check passed.")
    print("  (Glyph identity is NOT proven here -- inspect one still before")
    print("   shipping: render.mjs --prepare-only prints the exact command.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
