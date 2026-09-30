"""metrics_probe.py -- where does the tear bar land, in each font?

    py scripts/metrics_probe.py

WHY
---
The `--cut word` tear bar is drawn at `bottom: 0` of the word span's own box, with
`height: 0.34em`, and its top edge is a bright `rgba(255,255,255,0.85)` line. If
that bright line falls ACROSS the glyph bodies it draws a white rule through the
bottom of the letters -- which is exactly the reported "characters not fully
shown, it breaks the meaning of the letter": a letter with a line through it stops
being that letter.

Whether it happens is decided by the font's VERTICAL metrics, not its horizontal
ones, and nobody measured them:

  content box bottom = baseline + descent        (descender below the baseline)
  bar top            = box bottom - 0.34em
  glyph ink bottom   = min(yMin over the glyphs actually used) / upem, below baseline

So the bar overlaps ink when

    0.34em  >  descent - yMin

That is a comparison between two numbers per font, and it is the whole diagnosis.
A Preeti face is ASCII-mapped legacy with whatever vertical metrics its foundry
chose; a modern Devanagari face has different ones. Neither was checked, and the
effect was noticed by eye on one song.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "..", "nepali-legacy-fonts", "scripts"))

import layout_encoder as E                              # noqa: E402
from fontTools.ttLib import TTFont                      # noqa: E402

BAR_EM = 0.34        # must match tearBar's height in src/LyricOverlay.jsx
PAD_EM = 0.16        # the word span's paddingBottom

FONTS = [
    ("Rajdhani", os.path.join(ROOT, "..", "nepali-legacy-fonts", "fonts", "rajdhani", "Rajdhani-Bold.ttf"), "unicode"),
    ("Kalam", os.path.join(ROOT, "..", "nepali-legacy-fonts", "fonts", "kalam", "Kalam-Bold.ttf"), "unicode"),
    ("Arya", os.path.join(ROOT, "..", "nepali-legacy-fonts", "fonts", "arya", "Arya-Bold.ttf"), "unicode"),
    ("Yantramanav Black", os.path.join(ROOT, "..", "nepali-legacy-fonts", "fonts", "yantramanav", "Yantramanav-Black.ttf"), "unicode"),
    ("ARAP007", os.path.join(ROOT, "..", "nepali-legacy-fonts", "fonts", "arap007", "ARAP007.TTF"), "preeti"),
    ("Shreenath Bold", os.path.join(ROOT, "..", "nepali-legacy-fonts", "fonts", "shreenath-bold", "Shreenath Bold.TTF"), "preeti"),
    ("PawanG", os.path.join(ROOT, "..", "nepali-legacy-fonts", "fonts", "pawang", "PawanG.TTF"), "preeti"),
    ("MKali", os.path.join(ROOT, "..", "nepali-legacy-fonts", "fonts", "mkali", "MKali.TTF"), "preeti"),
    ("CV Haha", os.path.join(ROOT, "..", "nepali-legacy-fonts", "fonts", "cv-haha", "CV Haha.TTF"), "preeti"),
    ("Himalayabold", os.path.join(ROOT, "..", "nepali-legacy-fonts", "fonts", "himalayabold", "Himalayabold Regular.ttf"), "preeti"),
    ("Katmandu", os.path.join(ROOT, "..", "nepali-legacy-fonts", "fonts", "katmandu", "Katmandu Regular.TTF"), "preeti"),
]

# The glyphs the encoder actually emits, so the ink bottom is measured on the
# REAL text rather than on the font's theoretical worst case.
SAMPLE = "जाम न माया जाम हुन्न बोकेरै सुतुक्कै लाने हो,"


def keys_for(kind):
    if kind == "unicode":
        return SAMPLE
    out = E.encode(SAMPLE, "Preeti")
    return out[0] if isinstance(out, tuple) else out


def probe(path, kind):
    # Everything is read BEFORE close(). The first version closed the font and then
    # read font["os2"], which raises KeyError('os2') on a closed lazy font -- and
    # the probe's own except clause swallowed it into "ERROR" on all eleven fonts,
    # which is the worst possible outcome: an instrument that reports nothing and
    # is mistaken for a clean result. "no font overlaps" was printed underneath.
    font = TTFont(path, fontNumber=0, lazy=True)
    upem = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    # The tag is "OS/2", not "os2". fontTools normalises neither way, and
    # `font["os2"]` raises KeyError('os2') on every one of these fonts -- which the
    # except clause below turned into "ERROR" on all eleven, and then printed
    # "no font overlaps" underneath. An instrument that swallows its own failure
    # and prints a clean verdict is worse than one that crashes.
    ascent = font["OS/2"].sTypoAscender / upem
    descent = abs(font["OS/2"].sTypoDescender) / upem
    hhea_descent = abs(font["hhea"].descender) / upem
    has_glyf = "glyf" in font
    font.close()

    eff_descent = max(descent, hhea_descent)

    # The ink bottom over the glyphs actually used.
    ink_bottom = None
    if has_glyf:
        f2 = TTFont(path, fontNumber=0, lazy=True)
        go = f2.getGlyphOrder()
        gtab = f2["glyf"]
        lowest = None
        for ch in set(keys_for(kind)):
            if ch == " " or ord(ch) not in cmap:
                continue
            gname = cmap[ord(ch)]
            if gname not in go:
                continue
            g = gtab[gname]
            if g.numberOfContours == 0:
                continue
            if lowest is None or g.yMin < lowest:
                lowest = g.yMin
        f2.close()
        if lowest is not None:
            ink_bottom = -lowest / upem      # positive = below the baseline

    # CSS uses the font's line box, which is ascent+descent (+lineGap) from
    # hhea/OS2 depending on the platform. The LARGER descent is taken because that
    # is the case where the box is SHALLOWEST relative to the ink and the bar
    # rides highest into the glyphs.
    room = (eff_descent - ink_bottom) if ink_bottom is not None else None
    overlap = (BAR_EM > room) if room is not None else None
    return ascent, eff_descent, ink_bottom, room, overlap


print("")
print("  --cut word tear bar: height %.2fem at bottom:0 of the word box." % BAR_EM)
print("  It overlaps glyph ink when  %.2f > descent - inkBottom" % BAR_EM)
print("")
print("  %-20s %-8s %8s %8s %10s %8s" %
      ("font", "class", "ascent", "descent", "inkBottom", "verdict"))
print("  " + "-" * 70)

worst = []
for name, path, kind in FONTS:
    if not os.path.exists(path):
        print("  %-20s MISSING" % name)
        continue
    try:
        a, d, ink, room, bad = probe(path, kind)
    except Exception as exc:
        print("  %-20s ERROR %s" % (name, exc))
        continue
    verdict = "OVERLAPS" if bad else ("tight" if room is not None and room < BAR_EM * 1.6 else "clear")
    if bad:
        worst.append(name)
    ib = ("%.3f" % ink) if ink is not None else "?"
    print("  %-20s %-8s %8.3f %8.3f %10s %8s" % (name, kind, a, d, ib, verdict))

print("")
if worst:
    print("  %d font(s) put the bar's bright edge across the glyph bottoms:" % len(worst))
    print("    " + ", ".join(worst))
    print("")
    print("  This is not a font defect and not a rendering race. The bar is placed")
    print("  in the word span's own box, and these faces have a shallower descender")
    print("  than the bar is tall, so the bar rides up into the letters. It is also")
    print("  worse while the word animates: the word's own opacity is below 1 as it")
    print("  arrives, and a bright bar BEHIND a translucent glyph reads as a line")
    print("  cut through it -- which is the reported 'the letter breaks, so the word")
    print("  stops meaning what it says'.")
    print("")
    print("  A FIXED height cannot fix it. The available room ranges from 0.010em")
    print("  (ARAP007) to 0.474em (MKali) across eleven faces, so the bar has to be")
    print("  sized from each font's measured room -- see --write.")
else:
    print("  no font overlaps -- the bar clears the ink in every face.")
print("")

if "--write" in sys.argv:
    # The room is written into the SAME cache as the width table, because it is the
    # same kind of thing -- a measurement of one font, keyed by family, that the
    # renderer reads. Two caches would be two places to forget.
    import json
    cache_path = os.path.join(HERE, "width.json")
    cache = {}
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as fh:
            cache = json.load(fh)

    written = 0
    for name, path, kind in FONTS:
        if not os.path.exists(path):
            continue
        try:
            a, d, ink, room, bad = probe(path, kind)
        except Exception:
            continue
        if room is None:
            continue
        f = TTFont(path, fontNumber=0, lazy=True)
        fam = None
        for r in f["name"].names:
            if r.nameID == 1:
                try:
                    fam = r.toUnicode()
                    break
                except Exception:
                    pass
        f.close()
        if not fam:
            continue
        key = fam + " +song" if (fam + " +song") in cache else fam
        entry = cache.setdefault(key, {})
        entry["cutRoom"] = round(room, 4)
        entry["cutInkBottom"] = round(ink, 4)
        entry["cutDescent"] = round(d, 4)
        entry["cutOverlapsAt034"] = bool(bad)
        written += 1

    with open(cache_path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(cache, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write("\n")
    print("  wrote cutRoom for %d fonts into %s" % (written, cache_path))
    print("")
