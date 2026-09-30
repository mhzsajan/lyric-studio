"""Does the FONT have a glyph for every key the transformation emits?

A layout round-tripping is a statement about the ENCODER and DECODER agreeing.
It says nothing about whether the .ttf has ink for those keys. Those are two
different questions and only the second one decides what the audience sees
(gotcha 23's whole point: "usable" means every key reaches a real glyph).

So this takes every distinct key character the song's transformation emits and
asks the font's own cmap. A key with no glyph is not a crash -- Chromium falls
through to another font for that character, which is what produces a word with
a stray letter in the middle of it.

    py scripts/check_font_cmap.py <font.ttf> <lrc> [--layout Preeti]
"""
import argparse
import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")

from lrc_legacy import convert_line
from fontTools.ttLib import TTFont

STAMP = re.compile(r"\[(\d{1,3}):([0-5]?\d(?:[.:]\d{1,3})?)\]")
META = re.compile(r"^\[(ti|ar|al|au|by|re|ve|length|offset|ti-font|ti-fontfile):", re.I)


def words_of(path):
    seen = []
    seen_set = set()
    with open(path, encoding="utf-8-sig") as f:
        for raw in f:
            raw = raw.strip()
            if not raw or META.match(raw):
                continue
            text = STAMP.sub("", raw).strip()
            if not text:
                continue
            for w in text.split():
                core = w.strip(".,!?;:।॥…-")
                if core and core not in seen_set:
                    seen_set.add(core)
                    seen.append(core)
    return seen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ttf")
    ap.add_argument("lrc")
    ap.add_argument("--layout", default="Preeti")
    a = ap.parse_args()

    font = TTFont(a.ttf, fontNumber=0)
    cmap = set()
    for table in font["cmap"].tables:
        cmap |= set(table.cmap.keys())
    name = a.ttf

    used = Counter()
    for w in words_of(a.lrc):
        for ch in convert_line(w, a.layout):
            if not ch.isspace():
                used[ch] += 1

    missing = [(c, n) for c, n in sorted(used.items(), key=lambda kv: -kv[1]) if ord(c) not in cmap]

    print("=" * 78)
    print("  %s" % name)
    print("  cmap holds %d codepoints | song needs %d distinct keys"
          % (len(cmap), len(used)))
    print("=" * 78)

    # Show a few real keys so the numbers are auditable by eye.
    shown = 0
    for c, n in sorted(used.items(), key=lambda kv: -kv[1]):
        if shown >= 14:
            break
        print("    %-4r  U+%04X  x%-4d %s"
              % (c, ord(c), n, "has glyph" if ord(c) in cmap else "NO GLYPH"))
        shown += 1

    if not used:
        print("\n  (no keys emitted -- the layout produced nothing?)")
    if missing:
        print("\n  %d of %d keys have NO GLYPH in this font:" % (len(missing), len(used)))
        for c, n in missing:
            print("    %-4r  U+%04X  used %d times" % (c, ord(c), n))
        print("\n  Chromium has no glyph for these, so it draws them in a")
        print("  DIFFERENT font mid-word. That is a visible wrong letter, not a")
        print("  missing one -- and no check in the pipeline can see it, because")
        print("  it is a question about glyph identity.")
        return 1

    print("\n  Every key the song emits has a real glyph in this font.")
    print("  (Still not proof of the RIGHT glyph -- only a human looking at a")
    print("  still can settle that. See --prepare-only.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
