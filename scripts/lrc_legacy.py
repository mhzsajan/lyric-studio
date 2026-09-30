#!/usr/bin/env python
"""
lrc_legacy.py -- convert a Unicode .lrc into a LEGACY-RENDER .lrc.

Why: the Nepali "AMS"/Ananda/Abhinav fonts in `01 Fonts` are pre-Unicode
Preeti-era fonts -- their Devanagari glyphs sit on ASCII codepoints. Chromium
(and therefore Remotion) cannot use them for real Unicode text and silently
falls back to Nirmala UI. But feed them the right ASCII KEY SEQUENCES and the
exact classic glyphs come out -- this is how the user's beloved
"Perfect Example" video (Abhinav.ttf, legacy mode) was made.

The recipe (proven across the nepali-lyric-video-maker pipeline, round-trip
verified word-by-word):
    Unicode lyrics --npttf2utf--> Preeti key sequences --legacy font--> glyphs

Usage:
    python scripts/lrc_legacy.py "Allare Timmed.lrc" "Allare legacy.lrc" \
        --font-family "AMS Manthan" --font-file "ams.manthan.ttf"

Options:
    --layout <name>     Preeti (default) | Sagarmatha | Kantipur | PCS NEPALI |
                        FONTASY_HIMALI_TT
    --font-family <n>   value written into [ti-font:...] metadata
    --font-file <name>  value written into [ti-fontfile:...] metadata

Output .lrc extras:
    [ti-font:<family>]      the CSS font-family to render with
    [ti-fontfile:<file>]    reminder: which .ttf to load
Timing rows are byte-identical to the input except the text is key-encoded.
The original Unicode text is preserved as a [raw:...] comment per line so the
conversion is auditable and reversible.
"""
import argparse
import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from layout_encoder import encode as layout_encode, NAMES as LAYOUT_NAMES, RS

TIME_ROW = re.compile(r"^((\[\d{1,3}:[0-5]?\d(?:[.:]\d{1,3})?\])+)(.*)$")
META_RE = re.compile(r"^\[(ti|ar|al|au|by|re|ve|length|offset|ti-font|ti-fontfile):(.*)\]$", re.I)

# npttf2utf's Preeti map has no key for फ (the library's known gap). The
# reference video itself uses "km" for फ (verified: km->फ in the map's own
# decoder, and the Perfect Example renders फर्केर as kms]{/). The encoder
# never emits "km" for anything else, so this substitution is unambiguous.
KEY_FIXES = {"फ": "km"}


def _preeti_library(word):
    """Canonical Preeti keys from npttf2utf's own preetimapper, or None.

    Why the library converter must go FIRST for Preeti: layout_encoder's
    candidates encode by table lookup plus DECOMPOSITION (ऊ -> उू, ो -> ेा).
    Those decomposed sequences decode back cleanly through map.json, so the
    round-trip check passes -- but a Preeti-era font draws the parts as
    separate glyphs: जाऊ came out as जाउू (उ plus a detached hook) and हो as
    हेो, frame-verified in Abhinav and four more fonts. npttf2utf's converter
    emits what a Preeti typist actually types -- the composite `m` for ऊ,
    ो as `f]`, फ as `km`, rakar as `|` -- which is what these fonts were DRAWN
    for. The old nepali-lyric-video-maker pipeline fed exactly these keys.

    Returns None whenever the library cannot cleanly handle the word, so the
    caller falls back to the table encoder with its loud warnings.
    """
    try:
        from npttf2utf.base.preetimapper import convert as preeti_convert
    except ImportError:
        return None
    try:
        keys = preeti_convert(word).replace(RS, "C")  # ऋ has no key slot; C is its Preeti seat
    except Exception:
        return None
    if not keys or any("\u0900" <= ch <= "\u097f" for ch in keys):
        return None  # Devanagari in keys = the font has no glyph for it
    # The lyricist's '..' marks must key as '=' (the PERIOD glyph slot), not
    # as '.' -- in the Preeti layout the '.' key sits on the DANDA glyph, so
    # 'xf]..' draws two vertical bars where every reference video shows two
    # dots. Key '=' decodes back to '.', so verification is unaffected. Only
    # applied when the source word itself has no '।', which is the one
    # character that legitimately keys as '.'.
    if "\u0964" not in word and "\u0965" not in word:
        keys = keys.replace(".", "=")
    return keys


def _norm_punct(s):
    """Fold danda variants so '..' vs '।।' compares equal.

    Preeti typists (and npttf2utf, and the predecessor pipeline) key the
    lyricist's trailing '..' as '=' -- the font's danda glyph -- which decodes
    back as '।'. Same marks, different codepoints; without this fold every
    dotted word falsely fails verification and falls back to table keys.
    """
    return s.replace("\u0965", "..").replace("\u0964", ".")


def convert_line(text, layout):
    """Unicode text -> Preeti-layout key text, word by word (keeps spaces)."""
    from layout_encoder import _decode, _canon, _fold_ligs
    out = []
    for word in text.split(" "):
        if not word.strip():
            out.append(word)
            continue
        keys, exact = None, False
        if layout == "Preeti":
            lib = _preeti_library(word)
            if lib is not None:
                try:
                    back = _decode(lib, layout)
                    if _norm_punct(_fold_ligs(_canon(back))) == _norm_punct(_fold_ligs(_canon(word))):
                        keys, exact = lib, True
                    else:
                        print(f"  .. library keys did not verify for {word!r} "
                              f"(decoded {back!r}); using the table encoder",
                              file=sys.stderr)
                except Exception as err:
                    print(f"  .. library decode failed for {word!r}: {err}",
                          file=sys.stderr)
        if keys is None:
            keys, exact = layout_encode(word, layout)
            for uni, key in KEY_FIXES.items():
                keys = keys.replace(uni, key)
            if not exact:
                # after KEY_FIXES, re-verify by decoding
                back = _decode(keys, layout)
                for a, b in (("उू", "ऊ"), ("इी", "ई")):
                    back = back.replace(a, b)
                if _norm_punct(_fold_ligs(_canon(back))) == _norm_punct(_fold_ligs(_canon(word))):
                    exact = True
        if not exact:
            print(f"  !! not round-trip exact: {word!r} -> {keys!r}", file=sys.stderr)
        out.append(keys)
    return " ".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--layout", default="Preeti")
    ap.add_argument("--layout-file", default=None,
                    help="generated layout JSON (from the font repo) "
                         "for a font outside npttf2utf's five")
    ap.add_argument("--font-family", default=None)
    ap.add_argument("--font-file", default=None)
    a = ap.parse_args()

    if a.layout_file:
        from layout_encoder import load_extra_layouts
        merged = load_extra_layouts(a.layout_file)
        if a.layout == "Preeti" and merged != "Preeti":
            # A single generated layout file is almost always meant to be
            # used; defaulting to Preeti alongside it would silently produce
            # the exact wrong-glyph output this tool exists to prevent.
            a.layout = merged
    from layout_encoder import NAMES as AVAILABLE
    if a.layout not in AVAILABLE:
        ap.error(f"layout {a.layout!r} not available. Have: {', '.join(AVAILABLE)}")

    lines = open(a.src, encoding="utf-8-sig").read().splitlines()
    out = []
    n_conv = 0
    for line in lines:
        line = line.rstrip()
        if not line.strip():
            continue
        m = META_RE.match(line)
        if m:
            # keep title metadata, drop nothing else
            if m.group(1).lower() == "ti":
                out.append(line)
            continue
        m = TIME_ROW.match(line)
        if not m:
            continue
        stamps, text = m.group(1), m.group(3).strip()
        if not text:
            out.append(line)
            continue
        legacy = convert_line(text, a.layout)
        n_conv += 1
        out.append(f"{stamps}{legacy}")
        # keep the original Unicode for audit next to the line it belongs to
        out.append(f"[raw:{text}]")

    header = []
    if a.font_family:
        header.append(f"[ti-font:{a.font_family}]")
    if a.font_file:
        header.append(f"[ti-fontfile:{a.font_file}]")

    open(a.dst, "w", encoding="utf-8").write(
        "\n".join(header + out) + "\n"
    )
    print(f"OK {a.dst}: {n_conv} lines encoded with layout {a.layout}")


if __name__ == "__main__":
    main()
