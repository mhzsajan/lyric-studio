"""font_gate.py -- prove the chosen font can write THIS song before rendering.

    py scripts/font_gate.py --lrc song.lrc --slug ams-manthan [--fonts-repo DIR]
    py scripts/font_gate.py --lrc song.lrc --layout path/to/layout.json
    py scripts/font_gate.py --lrc song.lrc --font-file path/to/font.ttf

Exit 0 = safe to render with this font.
Exit 1 = NOT safe; the output names the characters/words that fail and what to
         use instead.
Exit 2 = the gate itself could not run (missing file, bad arguments).

WHY THIS EXISTS
---------------
Two videos shipped with wrong text because nothing between "pick a font" and
"encode the mp4" looked at whether the font could write the lyrics:

  - a legacy layout that cannot encode a song changes WORDS mid-render
    (फर्केर -> फरकर when the virama has no key) while every output check passes,
    because those checks look at the container, the timing and the pixels
    BEHIND the text;
  - a legacy .ttf handed to --font-file -- or any .ttf missing glyphs the song
    uses -- makes Chromium substitute a different typeface per character, so a
    word renders in two faces with no error anywhere.

The gate runs in render.mjs before any transcoding or encoding, so the failure
costs seconds and names the affected words.

WHAT IT DOES
------------
Legacy paths (--slug / --layout) delegate to the font repo's check_song.py,
which is the authority on "can this layout write these words" -- a copy of
that logic here would be a vendored copy, and vendored copies go stale (the
renderer's stale ams-manthan layout is the incident that proved it).

The Unicode path (--font-file) inspects the .ttf directly with fontTools:
every Devanagari code point in the .lrc must exist in the font's cmap. Zero
Devanagari code points means the file is a legacy ASCII-mapped font, which is
a hard fail with an explanation rather than a coverage report.
"""
import argparse
import collections
import json
import os
import re
import subprocess
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

STAMP = re.compile(r"\[(\d{1,3}):[0-5]?\d(?:[.:]\d{1,3})?\]")
META = re.compile(r"^\[(ti|ar|al|au|by|re|ve|length|offset|ti-font|ti-fontfile):",
                  re.I)

# The Tier A shortlist suggested when a gate fails: display faces that carry a
# "look" without an encoding, plus the zero-install default. Names are ASCII on
# purpose -- Windows consoles mangle Devanagari, and a suggestion you cannot
# read is not a suggestion. Full list: the font repo README, 58 fonts.
TIER_A_SUGGESTIONS = [
    "Yantramanav Black (display; the house pick)",
    "Khand, Teko, Halant (display)",
    "Rozha One, Gajraj One (high-contrast display)",
    "Arya, Kalam, Mukta (text faces)",
    "Noto Sans Devanagari / Noto Serif Devanagari",
    'Nirmala UI  (ships with Windows 11; --font "Nirmala UI", no file needed)',
]


def read_lines(path):
    """Lyric text of an .lrc, stamps and metadata removed (same rules as the
    font repo's check_song.py, kept small rather than imported across repos)."""
    out = []
    with open(path, encoding="utf-8-sig") as f:
        for raw in f:
            raw = raw.strip()
            if not raw or META.match(raw):
                continue
            text = STAMP.sub("", raw).strip()
            if text:
                out.append(text)
    return out


def suggest_tier_a():
    print("\n  Use a Tier A Unicode font instead -- no transcoding, so no")
    print("  layout that can be wrong:")
    for s in TIER_A_SUGGESTIONS:
        print("      " + s)
    print("  (58 total; the font repo README lists them. --font-file <ttf>,")
    print("   or --font \"Nirmala UI\" with nothing installed.)")


def gate_legacy(lrc, slug, layout, fonts_repo):
    """Delegate to the font repo's check_song.py -- the single source of truth
    for 'can this layout write these words'."""
    repo = fonts_repo or os.path.join(os.path.dirname(ROOT), "nepali-legacy-fonts")
    checker = os.path.join(repo, "scripts", "check_song.py")
    if not os.path.exists(checker):
        print("  font gate: no check_song.py at " + checker)
        print("  Clone the font repo beside this one, or pass --fonts-repo:")
        print("      git clone https://github.com/mhzsajan/nepali-legacy-fonts")
        return 2
    args = [sys.executable, checker]
    if slug:
        args += ["--font", slug]
    else:
        args += ["--layout", layout]
    args.append(lrc)
    print("  font gate: check_song.py " + ("--font " + slug if slug else "--layout " + os.path.basename(layout)))
    res = subprocess.run(args, cwd=repo)
    if res.returncode != 0:
        suggest_tier_a()
        return 1
    return 0


def gate_font_file(lrc, ttf):
    """cmap coverage: every Devanagari character of the song must exist in the
    font. Zero Devanagari code points means the file is legacy ASCII-mapped."""
    if not os.path.exists(ttf):
        print("  font gate: no such font file: " + ttf)
        return 2
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        print("  font gate: fontTools is not installed (py -m pip install fonttools)")
        return 2

    font = TTFont(ttf, fontNumber=0, lazy=True)
    cmap = font.getBestCmap() or {}
    dev_in_font = {cp for cp in cmap if 0x0900 <= cp <= 0x097F}

    if not dev_in_font:
        print("  font gate: FAIL -- " + os.path.basename(ttf) + " has ZERO")
        print("  Devanagari code points in its cmap. This is a legacy")
        print("  ASCII-mapped font: --font-file renders it with a per-character")
        print("  fallback to a DIFFERENT typeface (words drawn in two faces,")
        print("  no error). Legacy faces need the transcode path:")
        print("      --font-slug <slug>     (font repo resolves the layout and")
        print("                             gates the song), or")
        print("      --legacy-font <ttf> --layout-file <json>")
        print("  If this font is in the font repo, its slug is its directory:")
        print("      py ..\\nepali-legacy-fonts\\scripts\\which_fonts.py <folder>")
        suggest_tier_a()
        return 1

    lines = read_lines(lrc)
    used = collections.Counter()
    for line in lines:
        for ch in line:
            if 0x0900 <= ord(ch) <= 0x097F:
                used[ch] += 1

    missing = {ch: n for ch, n in used.items() if ord(ch) not in cmap}
    print("  font gate: %s" % os.path.basename(ttf))
    print("    Devanagari code points in font : %d" % len(dev_in_font))
    print("    distinct Devanagari in song    : %d" % len(used))
    if not missing:
        print("    missing                        : none -- SAFE to render")
        return 0

    print("    missing                        : %d" % len(missing))
    for ch, n in sorted(missing.items(), key=lambda kv: -kv[1]):
        print("      U+%04X %s x%d" % (ord(ch), ch, n))
    words = collections.OrderedDict()
    for line in lines:
        for w in re.split(r"\s+", line):
            w = w.strip(" ,.:;!?।॥")
            if w and any(c in w for c in missing):
                words.setdefault(w, w)
    print("    words affected                 : %d" % len(words))
    for w in list(words)[:10]:
        print("      %s" % w)
    print("\n  VERDICT: this font cannot write this song. Characters would")
    print("  render in a fallback typeface mid-word.")
    suggest_tier_a()
    return 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lrc", required=True, help="the song's .lrc (Unicode)")
    ap.add_argument("--slug", help="a legacy font slug from the font repo")
    ap.add_argument("--layout", help="a layout .json (hand-wired legacy path)")
    ap.add_argument("--font-file", help="a Unicode .ttf to coverage-check")
    ap.add_argument("--fonts-repo", help="where the font repo is (default: sibling)")
    a = ap.parse_args()

    if not os.path.exists(a.lrc):
        print("  font gate: no such .lrc: " + a.lrc)
        return 2
    picks = [bool(a.slug), bool(a.layout), bool(a.font_file)]
    if sum(picks) != 1:
        print("  font gate: pass exactly one of --slug, --layout, --font-file")
        return 2

    if a.slug or a.layout:
        return gate_legacy(a.lrc, a.slug, a.layout, a.fonts_repo)
    return gate_font_file(a.lrc, a.font_file)


if __name__ == "__main__":
    sys.exit(main())
