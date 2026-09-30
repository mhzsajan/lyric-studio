# Fonts — why the Nepali fonts fail in browsers, and how they were made to work

**RESOLUTION (2026-09-28): the legacy fonts ARE usable — by transcoding the
lyrics to their key layout.** See "The working solution" below. The forensics
stay because they explain why the obvious approaches all fail.

The `01 Fonts` Nepali fonts (AMS Manthan, AMS Aakash, Ananda Fanko 2, AMS
Manoja, Abhinav, …) are **legacy Encoded-Nepali fonts**: their character map
covers ASCII only. Chromium (and therefore Remotion, which renders through
headless Chromium) cannot use them for Devanagari Unicode text and
**silently falls back** to another font per character. Nothing errors; your
text just isn't in the font you asked for.

## The working solution: render key sequences, not Unicode

The user's "Perfect Example" video (`ritu-whisper.mp4`, made by their
private `nepali-lyric-video-maker` repo) held the answer all along: its
timings file carried BOTH strings per line —

```js
FONT_FILE  = "Abhinav.ttf",  FONT_MODE = "legacy"
text:    "kms]{/ cfpg] 5}g,"   // ASCII key sequence rendered on screen
unicode: "फर्केर आउने छैन,"     // real Unicode kept for logic/timing
```

The old tool renders the ASCII key sequence THROUGH the legacy font: the
glyphs sitting on those ASCII slots ARE the Devanagari letterforms. The
Unicode↔keys conversion is the [npttf2utf](https://pypi.org/project/npttf2utf/)
library (Preeti layout and 4 others), with per-word round-trip verification
— all ported into the lyric-video-remotion repo as `scripts/layout_encoder.py`
+ `scripts/lrc_legacy.py`.

```bash
# one command; render.mjs runs the conversion and loads the font itself:
node render.mjs song.mp3 song.lrc --legacy-font ams.manthan.ttf
```

Hard-won details baked in:
- **All the AMS/Ananda/Abhinav fonts are Preeti-layout** (glyph-verified,
  see the old repo's `docs/FONTS.md`). Kantipur/PCS/Fontasy layouts exist in
  the library but have map gaps.
- **The फ gap:** npttf2utf's Preeti map has no key for फ. The reference
  video itself writes it as `km` (क्ष-series fix verified against its own
  keys: `kms]{/` = फर्केर). `KEY_FIXES` in lrc_legacy.py applies it, then
  re-verifies by decoding.
- **Ligature folding:** ई renders as इ+ी, ऊ as उ+ू in these fonts — the
  decode check folds those pairs before comparing.
- **The `.` key draws a danda (।)** — `..` renders as `॥`. Traditional, not
  a bug.
- **Weight 400, no synthetic bold:** legacy text is visual-order ASCII;
  Chromium's fake-bold double-draws and smears it.
- **Load via FontFace API** (delayRender/continueRender) — a bare CSS
  font-family name doesn't reliably register these fonts in the sandbox.
- AMS Calligraphy 9, Chandrakant, Dipanshu and Handwriting 3 **lack the `{
  reph key** — words with र् show a gap; prefer other AMS cuts for reph-heavy
  lyrics.

## The forensics (from parsing the sfnt tables directly)

For every .ttf in `01 Fonts`:

| Finding | Value | Why it matters |
|---|---|---|
| Unicode cmap subtable | format 4, maps **U+0020–U+007E** + ~30 symbol codepoints (♥, ☺, arrows) | The cmap is how a browser asks "do you have क (U+0915)?" — the answer here is always no. |
| Devanagari block (U+0900–U+097F) | **not mapped, in any subtable** | Chromium skips the font entirely for Devanagari runs. |
| Mac Roman cmap subtable | format 6, 203 glyphs at ASCII slots | The giveaway of the legacy era: Devanagari glyphs exist in the font but sit at ASCII codepoints (Preeti-style encoding). |
| GSUB / GPOS tables | **absent** | No substitution/positioning rules → even mapped text can't form conjuncts (आउँछु), reorder matras (फर्केर), or attach chandrabindu (जान्दिनँ) correctly. |
| OS/2 | weight 400, Regular bit set; usWeightClass clean | Fine — irrelevant to the failure. |

## The proof

Rendered the same composition frame (cue: `हाल..`) three ways:

1. `--font "AMS Manthan"` (only)
2. `"Nirmala UI"` (only)
3. `"Mangal"` (only)

**All three pixel-identical.** Chromium asked AMS Manthan for ह, ा, ल —
got nothing for each — and drew them from the same fallback every time.
Conclusion: the Allare video shipped as Nirmala UI regardless of the flag.
(ASCII text *would* pick up AMS Manthan — the Latin "..." in `हाल..` is the
only part truly in the requested font.)

## Why the fonts are like this (history)

They were built for **legacy Encoded-Nepali** workflows (Preeti and friends):
Nepali text typed as ASCII bytes, with Devanagari shapes occupying ASCII
codepoints. Legacy Windows text stacks (GDI, font-linking, ANSI codepage
CP1250-era tricks) render them; the modern web stack (HarfBuzz shaping +
strict Unicode cmaps) refuses by design. This is why they "look fine in the
old editor but do nothing in the browser."

## Options, ranked

1. **Accept Nirmala UI** (current state). Correct shaping, clean look, zero
   work. The shipped Allare video uses it and reads well.
2. **Find a real Unicode Devanagari display font** with the same character
   (search "AMS font Unicode version", check Mukta/Rozha One/Tiro Devanagari
   Sanskrit on Google Fonts for display-weight alternatives). This is the
   best path if the AMS look isn't strictly required.
3. **Convert the legacy font with fonttools**: read the Mac Roman/ASCII cmap,
   build a proper Unicode cmap mapping Devanagari codepoints → the glyphs
   sitting at ASCII slots. Letters will then render in the right face, BUT:
   - true conjunct shaping still needs GSUB rules that don't exist —
     conversion quality is per-font luck (many legacy fonts precomposed the
     common conjuncts as ASCII-slot glyphs, which a smart remap can exploit);
   - it's mechanical work (~100 lines of Python with fontTools) and an
     A/B render to validate.
   Do this only if a specific AMS face is non-negotiable.

## Rule for any AI working on this

Before trusting any custom font in a Remotion/browser render, check its cmap
coverage for the actual codepoints in the lyrics. Silent per-character
fallback means *wrong output with no error* — always verify with the
identical-frame A/B test (pin the candidate vs pin the known fallback; if
identical, the candidate did nothing).
