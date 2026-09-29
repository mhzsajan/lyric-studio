"""detect_beats.py -- mp3/wav -> beats.json for the word quantizer and pulse.

    py scripts/detect_beats.py song.mp3 out/beats-song.json
    py scripts/detect_beats.py song.mp3 out/beats.json --bpm 120   # force tempo
    py scripts/detect_beats.py song.mp3 out/beats.json --expect-bpm 120 --tol 2

Output JSON:
    {"bpm": 120.0, "beats": [0.0, 0.5, 1.0, ...], "method": "builtin",
     "confidence": 4.2, "duration": 417.1}

`beats` is ascending seconds -- exactly what render.mjs --beats passes to the
composition as props (plain numbers, so they survive every layer; see the
gotcha #1 note in render.mjs). src/beats.js quantizes word starts to this grid
and Styled.jsx pulses the background on it. Both are pure functions of the
grid, so a render is reproducible from the same beats.json.

METHOD
------
--method auto (default) uses librosa's beat tracker when it is importable and
falls back to the builtin numpy tracker otherwise. The builtin is deliberately
simple and honest about it:

  1. ffmpeg decodes to mono 22.05 kHz s16le (the bundled Remotion ffmpeg or a
     system one; --ffmpeg to point at it).
  2. Spectral-flux onset envelope: 1024-sample Hann frames, 256 hop, sum of
     positive magnitude differences, median-normalised.
  3. Tempo: a comb filter over the envelope -- for each candidate period, the
     best phase maximises the summed onset strength on the grid -- weighted by
     a log-Gaussian prior around 110 bpm so half/double tempo loses unless the
     evidence is clearly there.
  4. Each grid beat snaps to the nearest local onset peak within +-120 ms (or
     a fifth of the period), which is what keeps beats on transients in real
     music rather than on the mathematical grid.

--bpm forces step 3 (phase search only) -- the escape hatch when the detector
picks half time on a slow song and you know the truth. --expect-bpm/--tol turn
the script into its own test: exit 1 when the detected tempo is off, which is
how the synthetic click-track asset validates the whole chain.

Dependencies: numpy (required), librosa (optional, better on real music).
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

import numpy as np

try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

SR = 22050
HOP = 256
WIN = 1024
FRAME_FPS = SR / HOP  # ~86.13 envelope frames per second


def find_ffmpeg(explicit=None):
    if explicit:
        return explicit
    # SYSTEM ffmpeg first. The Remotion compositor binary is a minimal build:
    # it cannot mux s16le to a pipe (same class as the renderer's gotcha 11 --
    # no rawvideo muxer, no signalstats). It is only a fallback for machines
    # with no system ffmpeg, and decoding there may fail; the error says so.
    for name in ("ffmpeg", "ffmpeg.exe"):
        found = shutil.which(name)
        if found:
            return found
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    comp = os.path.join(here, "node_modules", "@remotion")
    if os.path.isdir(comp):
        for d in sorted(os.listdir(comp)):
            if d.startswith("compositor-"):
                cand = os.path.join(comp, d, "ffmpeg.exe" if os.name == "nt" else "ffmpeg")
                if os.path.exists(cand):
                    return cand
    return None


def decode(audio, ffmpeg):
    cmd = [ffmpeg, "-v", "error", "-i", audio,
           "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"]
    res = subprocess.run(cmd, capture_output=True)
    if res.returncode != 0 or not res.stdout:
        sys.stderr.write(res.stderr.decode("utf-8", "replace")[:2000] + "\n")
        raise SystemExit("  detect_beats: ffmpeg could not decode " + audio)
    return np.frombuffer(res.stdout, dtype=np.int16).astype(np.float32) / 32768.0


def onset_envelope(x):
    frames = np.lib.stride_tricks.sliding_window_view(x, WIN)[::HOP]
    if frames.shape[0] < 4:
        raise SystemExit("  detect_beats: audio too short to analyse")
    spec = np.abs(np.fft.rfft(frames * np.hanning(WIN), axis=1))
    diff = np.diff(spec, axis=0)
    flux = np.maximum(diff, 0).sum(axis=1)
    flux = np.maximum(flux - np.median(flux), 0)
    std = flux.std()
    return flux / std if std > 0 else flux


def comb_search(flux, bpm_lo=60.0, bpm_hi=200.0, prior_bpm=110.0, prior_sigma=0.65):
    """Best (period, phase) by comb-filtered onset strength with a tempo prior.

    The prior is a log-Gaussian around prior_bpm: it costs a factor to claim
    55 or 220 where 110 explains the same peaks, which is the standard defence
    against the octave ambiguity that makes beat trackers report half time.
    """
    p_lo = int(max(2, np.floor(FRAME_FPS * 60.0 / bpm_hi)))
    p_hi = int(np.ceil(FRAME_FPS * 60.0 / bpm_lo))
    best = None
    for period in range(p_lo, p_hi + 1):
        bpm = FRAME_FPS * 60.0 / period
        prior = np.exp(-0.5 * (np.log2(bpm / prior_bpm) / prior_sigma) ** 2)
        # Sum the envelope at every phase offset of this grid.
        n_beats = max(1, len(flux) // period)
        folded = np.array([flux[o::period][:n_beats].sum() for o in range(period)])
        score = (folded.max() / n_beats) * prior
        if best is None or score > best[0]:
            best = (score, period, int(folded.argmax()))
    return best[1], best[2]


def snap_beats(flux, phase, period, n):
    """Grid times, each snapped to the nearest local onset peak."""
    max_shift = int(min(0.12 * FRAME_FPS, period / 5.0))
    beats = []
    for k in range(n):
        i = phase + k * period
        if i >= len(flux):
            break
        lo, hi = max(0, i - max_shift), min(len(flux) - 1, i + max_shift)
        j = lo + int(np.argmax(flux[lo:hi + 1]))
        # Only snap toward a peak that is actually stronger than the grid spot,
        # otherwise a flat envelope section drifts beats onto noise.
        if flux[j] < flux[i]:
            j = i
        beats.append(j / FRAME_FPS)
    return beats


def builtin_track(x, forced_bpm=None):
    flux = onset_envelope(x)
    if forced_bpm:
        period = FRAME_FPS * 60.0 / forced_bpm
        # Phase search at the forced tempo.
        iperiod = int(round(period))
        n_beats = max(1, len(flux) // iperiod)
        folded = np.array([flux[o::iperiod][:n_beats].sum() for o in range(iperiod)])
        phase = int(folded.argmax())
        bpm = forced_bpm
    else:
        iperiod, phase = comb_search(flux)
        bpm = FRAME_FPS * 60.0 / iperiod
        period = iperiod
    n = int(len(flux) / max(1, period)) + 1
    beats = snap_beats(flux, phase, int(round(period)), n)
    confidence = float(np.mean([flux[min(len(flux) - 1, int(b * FRAME_FPS))] for b in beats])) if beats else 0.0
    return bpm, beats, confidence


def librosa_track(x):
    import librosa  # optional dependency; ImportError falls back to builtin
    tempo, frames = librosa.beat.beat_track(y=x, sr=SR, hop_length=HOP)
    times = librosa.frames_to_time(frames, sr=SR, hop_length=HOP)
    tempo = float(np.atleast_1d(tempo)[0])
    return tempo, [float(t) for t in times], None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("out")
    ap.add_argument("--bpm", type=float, help="force the tempo (phase search only)")
    ap.add_argument("--method", choices=["auto", "builtin", "librosa"], default="auto")
    ap.add_argument("--ffmpeg", help="path to an ffmpeg binary")
    ap.add_argument("--expect-bpm", type=float, help="self-test: fail if detected tempo is off")
    ap.add_argument("--tol", type=float, default=2.0, help="bpm tolerance for --expect-bpm")
    ap.add_argument("--min-confidence", type=float, default=3.0,
                    help="below this the grid is marked usable:false and the "
                         "summary tells you to render with --no-beats. The "
                         "synthetic click track scores ~5.0; Allare (real pop) "
                         "scored 2.6-2.8 at every forced tempo, i.e. guessing.")
    a = ap.parse_args()

    if not os.path.exists(a.audio):
        sys.exit("  detect_beats: no such audio file: " + a.audio)
    ffmpeg = find_ffmpeg(a.ffmpeg)
    if not ffmpeg:
        sys.exit("  detect_beats: no ffmpeg found (install it, or pass --ffmpeg <path>;\n"
                 "                 an installed Remotion project bundles one)")

    x = decode(a.audio, ffmpeg)
    duration = len(x) / SR

    method = a.method
    tempo = beats = conf = None
    if method in ("auto", "librosa"):
        try:
            tempo, beats, conf = librosa_track(x)
            method = "librosa"
        except ImportError:
            if method == "librosa":
                sys.exit("  detect_beats: --method librosa but librosa is not installed")
    if tempo is None:
        tempo, beats, conf = builtin_track(x, forced_bpm=a.bpm)
        method = "builtin"
    elif a.bpm:
        # Forced tempo always goes through the builtin phase search.
        tempo, beats, conf = builtin_track(x, forced_bpm=a.bpm)
        method = "builtin(forced)"

    beats = [round(float(b), 4) for b in beats if 0 <= b <= duration]

    # A TRUSTWORTHINESS CHECK, NOT A CONFIDENCE NUMBER
    # -------------------------------------------------
    # The synthetic click track is 120.00 exactly and this reports it. Real
    # music is a different question, and on Allare (a Nepali pop track) the
    # answer turned out to be "don't". Three measurements forced that call:
    #
    #   bpm 123.05, confidence 2.64      confidence at FORCED 120: 2.59
    #   confidence at FORCED 123: 2.64   confidence at FORCED  60: 2.79
    #   inter-beat sd 0.0696s on a 0.4874s mean (14% jitter -- a real grid is
    #   near-uniform; this much spread means the snap step is chasing onsets
    #   that are not the beat)
    #   median distance from a cue start to the nearest beat: 0.143s, and only
    #   13 of 35 cues within 0.1s
    #
    # When the confidence at a forced tempo barely moves, the comb filter is
    # not discriminating between tempi, so its answer is not evidence. And when
    # the grid sits a median 0.143s from the SUNG cue times, snapping pulls
    # words OFF the hand-tapped timings toward a grid that may not be the song's
    # -- strictly worse than the even distribution, which at least stays inside
    # the phrase.
    #
    # So: below --min-confidence the file is written (it is still useful to
    # look at) but marked "usable": false, and the summary says to render with
    # --no-beats. make_video.mjs and render.mjs read that flag; nobody has to
    # remember this paragraph.
    usable = True
    if conf is not None and not a.bpm and conf < a.min_confidence:
        usable = False

    doc = {
        "bpm": round(float(tempo), 2),
        "beats": beats,
        "method": method,
        "confidence": None if conf is None else round(float(conf), 3),
        "duration": round(duration, 3),
        "usable": usable,
    }
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(doc, f)

    print("  detect_beats: %s" % os.path.basename(a.audio))
    print("    bpm        : %.2f  (%s)" % (doc["bpm"], method))
    print("    beats      : %d over %.1fs  (first %s, last %s)"
          % (len(beats), duration,
             beats[0] if beats else "-", beats[-1] if beats else "-"))
    if conf is not None:
        print("    confidence : %.2f (mean onset strength on beats)" % conf)
    if not usable:
        print("")
        print("    NOT USABLE for snapping. Confidence below %.1f means this grid"
              % a.min_confidence)
        print("    is not evidence of the song's tempo (check it against a forced")
        print("    --bpm: if the number barely moves, the tracker is guessing).")
        print("    A wrong grid pulls words OFF your hand-tapped .lrc times, which")
        print("    is worse than the even distribution. Render with --no-beats.")
        print("    " + a.out)
    else:
        print("    wrote      : %s" % a.out)

    if a.expect_bpm is not None:
        if abs(doc["bpm"] - a.expect_bpm) > a.tol:
            print("  FAIL: expected %.1f bpm (+-%.1f), detected %.2f"
                  % (a.expect_bpm, a.tol, doc["bpm"]))
            return 1
        print("  OK: tempo within %.1f bpm of %.1f" % (a.tol, a.expect_bpm))
    return 0


if __name__ == "__main__":
    sys.exit(main())
