"""make_test_assets.py -- synthesize the pipeline's test song and its .lrc.

    py scripts/make_test_assets.py [outdir]        # default: test-assets/

Writes:
    test-song.wav   32 s, exactly 120.00 bpm: a click on every beat (accented
                    downbeat each bar), a bass note per bar, a soft pad. The
                    tempo is exact BY CONSTRUCTION, which is what makes it a
                    test: detect_beats.py must report 120 +- 1 and a grid at
                    0.5 s spacing, or the detector (not the song) is wrong.
    test-song.lrc   13 Nepali cues on the 2 s grid (every bar), starting at
                    4.0 s so the opening title card has room, using exactly the
                    words documented as the legacy-layout killers: the virama
                    conjuncts (फर्केर, सम्हाल्ने), the candrabindu (सँगै, आउँछु,
                    हराउँछु, आँखा, हिस्सी) and ञ्/ज्ञ-class clusters. A song the
                    79 generated layouts cannot write, on purpose: the font gate
                    must FAIL on a legacy slug and PASS on a Tier A .ttf.

Ground truth for the detector (printed at the end):
    beats at k * 0.5 s, k = 0..63;  bars at k * 2.0 s.

Only numpy + the stdlib `wave` module -- no ffmpeg needed to WRITE the assets.
"""
import os
import sys
import wave

import numpy as np

try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

SR = 44100
BPM = 120.0
BEAT = 60.0 / BPM          # 0.5 s
BARS = 16                  # 4 beats/bar * 0.5 s = 2 s per bar -> 32 s total
DURATION = BEAT * 4 * BARS # 32.0 s
FIRST_LYRIC = 4.0          # leaves room for the title card window

# 13 cues, one per bar from 4.0 s. The words are the documented failure set of
# the legacy layouts (font repo docs/SONG-CHECK.md), so this file doubles as
# the font gate's failing input.
LINES = [
    "फर्केर हेर्दा तिमी सँगै",
    "प्रीति को कुरा आउँछु",
    "हराउँछु म झुट्टो भीडमा",
    "सम्हाल्ने कोसिस परेँ",
    "आँखा बन्द गरेर हेर्छु",
    "हिस्सी हावा चल्छ बिस्तारै",
    "फर्केर आउँछु सँगै",
    "प्रेती जस्तै हराउँछु",
    "सम्हाल्ने हात खोज्छु",
    "झुट्टो मुस्कान परेँ",
    "आँखा को आँसु हिस्सी",
    "सँगै हिँड्ने बाटो",
    "फर्केर प्रीति आउँछु",
]


def env_decay(n, tau):
    t = np.arange(n) / SR
    return np.exp(-t / tau)


def build():
    n = int(DURATION * SR)
    left = np.zeros(n, dtype=np.float64)

    # Metronome clicks: 1 kHz on every beat; downbeats are 2 kHz, louder, and
    # a little longer, so a tracker that only finds half the beats still has a
    # 2-bar-period signal to latch onto (and one that latches onto 60 bpm is
    # visibly wrong rather than subtly wrong).
    for b in range(int(DURATION / BEAT)):
        t0 = int(b * BEAT * SR)
        downbeat = b % 4 == 0
        freq = 2000.0 if downbeat else 1000.0
        ln = int((0.015 if downbeat else 0.008) * SR)
        amp = 0.55 if downbeat else 0.3
        seg = amp * np.sin(2 * np.pi * freq * np.arange(ln) / SR) * env_decay(ln, 0.004)
        left[t0:t0 + ln] += seg

    # Bass: one note per bar, alternating A2/D3, plucked decay.
    for bar in range(BARS):
        t0 = int(bar * 4 * BEAT * SR)
        freq = 110.0 if bar % 2 == 0 else 146.83
        ln = int(1.6 * SR)
        t = np.arange(ln) / SR
        seg = 0.22 * np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.5)
        left[t0:t0 + ln] += seg[:ln]

    # Pad: A-minor triad, quiet, with a slow amplitude LFO so the spectral
    # flux is not dominated by a perfectly static background.
    t = np.arange(n) / SR
    pad = (np.sin(2 * np.pi * 220.0 * t)
           + 0.8 * np.sin(2 * np.pi * 261.63 * t)
           + 0.7 * np.sin(2 * np.pi * 329.63 * t))
    pad *= 0.035 * (1.0 + 0.3 * np.sin(2 * np.pi * 0.1 * t))
    left += pad

    left = np.clip(left, -0.95, 0.95)
    # Slight stereo width: the pad only on the right channel.
    right = np.clip(left * 0.9 + pad * 0.5, -0.95, 0.95)
    return left, right


def write_wav(path, left, right):
    data = np.empty(left.size * 2, dtype=np.int16)
    data[0::2] = (left * 32767).astype(np.int16)
    data[1::2] = (right * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def write_lrc(path):
    lines = [
        "[ti:Beat Test]",
        "[ar:Lyric Studio]",
        "[al:synthetic]",
        "[re:make_test_assets.py]",
        "",
    ]
    t = FIRST_LYRIC
    for text in LINES:
        m, s = int(t // 60), t % 60
        lines.append("[%02d:%05.2f]%s" % (m, s, text))
        t += 4 * BEAT  # one bar per cue
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "test-assets")
    os.makedirs(outdir, exist_ok=True)
    wav = os.path.join(outdir, "test-song.wav")
    lrc = os.path.join(outdir, "test-song.lrc")

    left, right = build()
    write_wav(wav, left, right)
    write_lrc(lrc)

    print("  wrote %s (%.1f s, %.0f bpm exact)" % (wav, DURATION, BPM))
    print("  wrote %s (%d cues, first at %.1fs)" % (lrc, len(LINES), FIRST_LYRIC))
    print("")
    print("  ground truth for detect_beats.py:")
    print("    beats on k * %.3f s, k = 0..%d" % (BEAT, int(DURATION / BEAT) - 1))
    print("    expect: py scripts/detect_beats.py \"%s\" out/beats.json --expect-bpm 120" % wav)
    return 0


if __name__ == "__main__":
    sys.exit(main())
