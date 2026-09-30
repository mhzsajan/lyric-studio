"""measure_legacy_width.py -- how wide is a PREETI face's key stream, in em?

    py scripts/measure_legacy_width.py --font-file X.TTF --lrc song.lrc \\
                                        --layout Preeti --name PawanG \\
                                        [--cache scripts/width.json]

WHY A SEPARATE TOOL
-------------------
`calibrate_width.mjs` measures in the BROWSER, which is the right ground truth,
and it is what the Unicode faces use. It cannot be used here without rendering a
transcoded song first, and the transcode is render.mjs's job -- so a Preeti font
had no way to be measured at all.

That is not a small gap. scripts/width.json held FOUR entries and none of them was
a Preeti face, so all seven of them fell back to the per-class defaults. Those
defaults classify the ASCII key stream as `other` at 0.5em per character, and the
real faces advance 0.22-0.25em. The model therefore predicted TWICE the true
width, the wrapper broke every line roughly twice as early, the block took twice
the rows, and the auto-fit shrank the type to fit them. That is the "the fonts are
so small" report, and it was in seven fonts at once.

WHAT IT MEASURES
----------------
The sum of the font's own advance widths for the characters the encoder actually
emits, over the real lyric text, divided by unitsPerEm and by the character count.
A single scalar is the honest shape for this class: a Preeti face is ASCII-mapped,
so every glyph is an ASCII glyph and a per-class model has nothing to classify --
which is exactly why `widthEm` already accepts `perChar` and prefers it.

It reports a WORST ERROR across the real lines too, so a table that is accurate on
average and wrong on the longest line is visible rather than buried. That is the
case that matters, because the longest line is the one that gets shrunk.
"""
import argparse
import json
import os
import re
import sys

try:
    from fontTools.ttLib import TTFont
except ImportError:
    sys.stderr.write("fontTools is required: py -m pip install fonttools\n")
    sys.exit(2)

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

TAG = re.compile(r"\[[A-Za-z]{2}:[^\]]*\]")
TS = re.compile(r"^\s*(?:\[\d{1,2}:\d{2}(?:\.\d{1,3})?\])+\s*")


def lyric_words(path):
    out = []
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            s = line.strip()
            if TAG.fullmatch(s):
                continue
            s = TS.sub("", s)
            out += [w for w in s.split() if w]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--font-file", required=True)
    ap.add_argument("--lrc", required=True)
    ap.add_argument("--layout", default="Preeti")
    ap.add_argument("--name", required=True, help="the key to write in width.json")
    ap.add_argument("--cache", default=os.path.join(HERE, "width.json"))
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()

    if not os.path.exists(a.font_file):
        sys.stderr.write("no font at %s\n" % a.font_file)
        return 2

    import layout_encoder

    words = lyric_words(a.lrc)
    if not words:
        sys.stderr.write("no lyric words in %s\n" % a.lrc)
        return 2

    try:
        font = TTFont(a.font_file, fontNumber=0, lazy=True)
    except Exception as exc:
        sys.stderr.write("cannot read %s: %s\n" % (a.font_file, exc))
        return 2
    upem = font["head"].unitsPerEm
    hmtx = font["hmtx"]
    try:
        glyph_order = font.getGlyphOrder()
    except Exception:
        glyph_order = []
    font.close()

    advances = {}
    missing = 0
    total = 0
    chars = 0
    worst = 0.0
    worst_text = ""

    for w in words:
        enc = layout_encoder.encode(w, a.layout)
        if isinstance(enc, tuple):
            enc = enc[0]
        line_total = 0
        line_chars = 0
        for ch in str(enc):
            chars += 1
            line_chars += 1
            adv = advances.get(ch)
            if adv is None:
                try:
                    adv = hmtx[ch][0] / upem
                except KeyError:
                    missing += 1
                    adv = 0.0
                advances[ch] = adv
            line_total += adv
        if line_chars:
            # The error that matters is per-LINE, not per-character: one long line
            # being 30% over is what forces the shrink, and averaging it away
            # across 500 short ones would hide exactly the number that counts.
            model = line_chars * 0.5        # the per-class default, for comparison
            if model > 0:
                err = abs(line_total - model) / model
                if err > worst:
                    worst = err
                    worst_text = w
        total += line_total

    if not chars:
        sys.stderr.write("nothing measurable\n")
        return 2

    per_char = total / chars

    cache = {}
    if os.path.exists(a.cache):
        try:
            with open(a.cache, encoding="utf-8") as fh:
                cache = json.load(fh)
        except Exception:
            cache = {}

    # How far the new table is from the default it replaces. Printed, because a
    # number that halves every width in the piece is worth seeing before it is
    # used rather than after.
    delta = per_char / 0.5

    table = {
        "perChar": round(per_char, 5),
        "model": "per-char",
        "unitsPerEm": upem,
        "sampleChars": chars,
        "sampleWords": len(words),
        "noGlyphChars": missing,
        "defaultDelta": round(delta, 3),
        "calibratedOn": os.path.basename(a.lrc),
        "worstWordVsDefault": round(worst, 3),
        "worstWord": worst_text,
    }
    cache[a.name + " +song"] = table

    with open(a.cache, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(cache, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write("\n")

    print("perChar %.4f em  (default 0.5000, x%.2f)  %d chars, %d with no glyph"
          % (per_char, delta, chars, missing))
    if missing:
        print("  note: %d emitted chars have no glyph; they measure 0 here and the"
              % missing)
        print("  font gate is what catches them.")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
