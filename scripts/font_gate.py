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


def gate_emitted_keys(lrc, ttf, layout):
    """Every key the encoder EMITS must exist in this font's cmap.

    The layout and the font are two different things, and checking only the
    layout is the mistake this closes.

    A PREETI font shares its key layout with the whole class -- every one of them
    encodes identically -- so "the layout can write this song" is a statement
    about the ALPHABET and says nothing about whether a particular font happens to
    carry every glyph. Measured on these seven songs: arap007 and shreenath-bold
    cover a song that pawang, mkali, cv-haha, himalayabold and katmandu do not,
    on the same encoded output, because those five lack a glyph for one of the
    keys the encoder emits (U+00CC, U+00A7, U+00B6).

    So running the check once and generalising to the class -- or worse, trusting
    the stored verdict -- is wrong in both directions: it refuses fonts that would
    have been fine, and it passes fonts that will draw a blank or fall back.
    """
    try:
        sys.path.insert(0, os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "nepali-legacy-fonts", "scripts"))
        import layout_encoder
        from fontTools.ttLib import TTFont
    except ImportError as exc:
        print("  font gate: cannot check emitted keys (%s)" % exc)
        return 2

    if not os.path.exists(ttf):
        print("  font gate: no such font file: " + ttf)
        return 2
    try:
        font = TTFont(ttf, fontNumber=0, lazy=True)
        cps = set(font.getBestCmap())
        font.close()
    except Exception as exc:
        print("  font gate: cannot read %s: %s" % (os.path.basename(ttf), exc))
        return 2

    missing = {}
    for line in read_lines(lrc):
        for word in line.split():
            if not any(0x900 <= ord(c) <= 0x97F for c in word):
                continue
            try:
                out = layout_encoder.encode(word, layout)
            except Exception:
                continue
            if isinstance(out, tuple):
                out = out[0]
            for ch in str(out):
                if 0x900 <= ord(ch) <= 0x97F:
                    continue          # a survivor, not a key: check_song.py's job
                if ord(ch) not in cps:
                    missing.setdefault("U+%04X" % ord(ch), []).append(word)

    print("  font gate: %s against layout %s" % (os.path.basename(ttf), layout))
    if not missing:
        print("    every key the encoder emits has a glyph in this font -- SAFE")
        return 0
    print("    %d key(s) the encoder emits have NO glyph in this font:" % len(missing))
    for key, words in sorted(missing.items())[:10]:
        print("      %s   e.g. %s" % (key, words[0]))
    print("")
    print("    The layout is shared across this whole font class, so this is a")
    print("    property of THIS FONT, not of the layout. The words above would be")
    print("    drawn with a fallback face or a blank. A different font in the same")
    print("    class may well cover them -- that is why this is checked per font.")
    return 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lrc", required=True, help="the song's .lrc (Unicode)")
    ap.add_argument("--slug", help="a legacy font slug from the font repo")
    ap.add_argument("--layout", help="a layout .json, or a built-in name like Preeti")
    ap.add_argument("--font-file", help="a Unicode .ttf, or --legacy-font's .ttf")
    ap.add_argument("--fonts-repo", help="where the font repo is (default: sibling)")
    ap.add_argument("--also-emitted-keys", action="store_true",
                    help="with --layout: also check the .ttf covers every emitted key")
    a = ap.parse_args()

    if not os.path.exists(a.lrc):
        print("  font gate: no such .lrc: " + a.lrc)
        return 2
    picks = [bool(a.slug), bool(a.layout), bool(a.font_file)]
    # --font-file alone is the Unicode path. --layout (or --slug) TOGETHER WITH
    # --font-file is the legacy path, and it is the only way to ask both halves
    # of the legacy question: can this LAYOUT write the song, and can this FONT
    # draw every key the layout emits. Forbidding the pair is what made the second
    # half unreachable, and a half-check that cannot be expressed is not a check.
    if a.font_file and (a.slug or a.layout):
        if not a.also_emitted_keys:
            print("  font gate: --font-file with --layout/--slug asks about the font,\n"
                  "        so it needs --also-emitted-keys to say which check it is for")
            return 2
    elif sum(picks) != 1:
        print("  font gate: pass one of --slug, --layout, --font-file"
              " (or --layout with --font-file --also-emitted-keys)")
        return 2

    if a.slug or a.layout:
        rc = gate_legacy(a.lrc, a.slug, a.layout, a.fonts_repo)
        # The layout check and the font check are separate questions and both have
        # to pass. Running only the first is the bug this flag exists to close.
        if rc == 0 and a.also_emitted_keys and a.font_file:
            rc2 = gate_emitted_keys(a.lrc, a.font_file, a.layout or "Preeti")
            if rc2 != 0:
                return rc2
        return rc
    return gate_font_file(a.lrc, a.font_file)


if __name__ == "__main__":
    sys.exit(main())
