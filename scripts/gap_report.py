"""gap_report.py -- how much of the song actually has text on screen, and why.

    py scripts/gap_report.py <lrc> [ends] [--duration 417.1]

Reads the TAPPED ends (gotcha 31) and reports where the screen is legitimately
black. This exists because the corrected end timing makes the gaps real and
visible, and that is an EDITORIAL decision, not a bug:

  - every gap listed here is a place the singer is not singing, so a blank
    frame there is the correct picture;
  - but if the result is 42% coverage, the video may feel empty, and the fix
    for that is a creative one (hold the line, a title card, an instrumental
    beat) rather than a timing one.

The earlier inline version of this analysis was run through a PowerShell
here-string and a stray backslash in the regex stopped the ends file from
parsing, so it silently fell back to guessed ends and reported "0 short gaps".
That is the same class of error as gotcha 31 itself, committed to in a throwaway
one-liner: the number looked fine and was measuring the old behaviour.
"""
import argparse
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

STAMP = re.compile(r"\[(\d{1,3}):([0-5]?\d(?:[.:]\d{1,3})?)\]")
META = re.compile(r"^\[(ti|ar|al|au|by|re|ve|length|offset):", re.I)


def secs(t):
    m = re.match(r"^(\d{1,3}):([0-5]?\d)(?:[.:](\d{1,3}))?$", t.strip())
    if not m:
        return None
    frac = m.group(3) or "0"
    return int(m.group(1)) * 60 + int(m.group(2)) + int(frac) / 10 ** len(frac)


def read_lrc(path):
    cues = []
    with open(path, encoding="utf-8-sig") as f:
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
    return cues


def read_ends(path):
    out = {}
    if not path or not os.path.exists(path):
        return out
    with open(path, encoding="utf-8-sig") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) < 2:
                continue
            a, b = secs(parts[0]), secs(parts[1])
            if a is not None and b is not None:
                out[round(a, 2)] = b
    return out


def fmt(t):
    return "%d:%05.1f" % (int(t // 60), t % 60)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("lrc")
    ap.add_argument("ends", nargs="?", default="")
    ap.add_argument("--duration", type=float, default=0.0)
    a = ap.parse_args()

    cues = read_lrc(a.lrc)
    if not cues:
        sys.exit("no cues in " + a.lrc)
    ends = read_ends(a.ends)
    if not ends:
        print("  NOTE: no ends file parsed; falling back to the NEXT LINE'S START.\n"
              "        That is the pre-gotcha-31 behaviour and it FILLS every gap,\n"
              "        so the coverage below would be wrong.")

    spans = []
    for i, (s, _t) in enumerate(cues):
        nxt = cues[i + 1][0] if i + 1 < len(cues) else None
        real = ends.get(round(s, 2))
        if real is None or real <= s:
            e = min(max(s, nxt), s + 8) if nxt else s + 8
        else:
            # A tapped end past the next line's start is the singer's tail; the
            # renderer clamps it, so clamp it here too (parse-lrc does the same).
            e = min(real, nxt) if nxt else real
        spans.append([s, e])

    merged = []
    for s, e in spans:
        if merged and s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])

    dur = a.duration or (merged[-1][1] if merged else 0)
    covered = sum(e - s for s, e in merged)
    gaps = [(merged[i][1], merged[i + 1][0], merged[i + 1][0] - merged[i][1])
            for i in range(len(merged) - 1) if merged[i + 1][0] - merged[i][1] > 0.05]

    breath = [g for g in gaps if g[2] <= 2.0]
    longg = [g for g in gaps if g[2] > 2.0]
    head = merged[0][0]
    tail = dur - merged[-1][1]

    print("=" * 74)
    print("  %d cues | first lyric %s | last lyric %s" % (len(cues), fmt(head), fmt(merged[-1][1])))
    print("  text on screen : %6.1fs  = %4.1f%% of the %ds file"
          % (covered, 100 * covered / dur, dur))
    print("  before the first line / after the last : %4.1fs / %4.1fs" % (head, max(0, tail)))
    print("  between lines: %d gaps, %6.1fs total" % (len(gaps), sum(g[2] for g in gaps)))
    print("     breath (<=2s, between phrases) : %3d gaps, %5.1fs" % (len(breath), sum(g[2] for g in breath)))
    print("     long    (>2s)                  : %3d gaps, %5.1fs" % (len(longg), sum(g[2] for g in longg)))
    print("=" * 74)

    if longg:
        print("\n  the long black stretches (instrumentals / pauses):\n")
        for a_, b_, d in sorted(longg, key=lambda x: -x[2]):
            print("    %6.1fs   %s  ->  %s" % (d, fmt(a_), fmt(b_)))

    if breath:
        print("\n  the breath gaps (each is a real pause between two lines):\n")
        for a_, b_, d in breath[:12]:
            print("    %4.1fs   %s  ->  %s" % (d, fmt(a_), fmt(b_)))
        if len(breath) > 12:
            print("    ... and %d more" % (len(breath) - 12))

    if covered / dur < 0.75 and breath:
        print("\n  NOTE: %d of those gaps are under 2s. A line that clears exactly on\n"
              % len(breath))
        print("  its tapped end leaves a blink between every pair of lines. That is\n"
              "  what the ends file asks for; if it reads as flickery, a hold of a\n"
              "  fraction of a second past the end is an EDITORIAL choice, not a fix.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
