# Fonts: what is actually verified, and how to check a new one

The list of fonts in `nepali-legacy-fonts` is a catalogue. This file is the
short list of **fonts verified to write a given song correctly**, and the
procedure for adding to it.

The distinction matters because "the font repo says the font's keys verify" and
"this font can write these lyrics" are different claims, and only the second one
decides what the audience sees. See AGENTS.md gotcha 23 and gotcha 34.

---

## The rule that decides everything

A font's entry in `../nepali-legacy-fonts/sweep.json` has a **`class`**:

| class | what it means | how to use it |
|---|---|---|
| **`PREETI`** | the font uses `npttf2utf`'s built-in Preeti mapping | `--legacy-font <ttf> --layout Preeti` is safe. There is no generated map to be wrong. |
| **`GENERATED`** | the keys came from a sweep, and the sweep **dropped slots it could not classify** | plain `--legacy-font` can render the wrong glyph. Use `--font-slug` (layout + hard gate), or verify a still by eye. |

`why` says it in the font's own words, e.g. `"mapping dropped 3 slot(s)"`.

```powershell
py -c "import json;d=json.load(open(r'..\nepali-legacy-fonts\sweep.json',encoding='utf-8'));print([(e['slug'],e['class']) for e in d if e['slug']=='abhinav'])"
```

**Abhinav is `PREETI`.** That is the good case, and it is why it is verified
below.

---

## Verified working

### Yantramanav Black — the default choice

```
..\nepali-legacy-fonts\fonts\yantramanav\Yantramanav-Black.ttf
```

**The font to reach for when nothing else has been asked for.** It is a Unicode
face, so it is used with `--font-file` and the lyrics are handed over
**unchanged**:

```powershell
node render.mjs <audio> <lrc> --no-audio --length 417.10 --size 128 --mode mix --mix-block 8 --word-anim karaoke --letter-anim pop --letter-var 0.03 --font-file "..\nepali-legacy-fonts\fonts\yantramanav\Yantramanav-Black.ttf" --shadow "0 3px 14px rgba(0,0,0,0.8)" --out "out\<Song>.mp4"
```

Why it is the default and not merely a preference:

- **Zero transcoding**, so there is no layout that *can* be wrong. That is the
  whole argument. A legacy font's failure mode is a wrong letter on screen with
  exit 0; a Unicode font does not have that failure mode.
- **A hard gate applies and passes** (`scripts/font_gate.py`, fontTools cmap
  coverage): Yantramanav carries 128 Devanagari codepoints, and the gate checks
  the song's actual characters against the font's cmap.
- **Verified end to end on Allare**: 109/109 cues, candrabindu in `सँगै` /
  `आउँछु`, `ै` in `नै`, shirorekha unbroken, 1920x1080@30 `yuvj420p`, pure black
  plate, 0/109 lines lingering past their tapped end.

Six weights ship (Thin → Black). Only the family name differs between them, so
`--font-file` plus the path is all that changes.

### Abhinav — legacy, and it passes anyway

```
..\nepali-legacy-fonts\fonts\abhinav\Abhinav.TTF     class: PREETI
```

```powershell
node render.mjs <audio> <lrc> --no-audio --length 417.10 --size 128 --mode mix --motion wild --word-anim karaoke --letter-anim pop --letter-var 0.03 --legacy-font "..\nepali-legacy-fonts\fonts\abhinav\Abhinav.TTF" --layout Preeti --font-family Abhinav --out "out\<Song>.mp4"
```

Checked on **Allare**, the hardest song in the working folder:

| check | result |
|---|---|
| words round-tripped through the Preeti mapping | **54 / 54** |
| distinct keys the song emits | 45 |
| keys with **no glyph** in `Abhinav.TTF` | **0** (cmap holds 180 codepoints) |
| still at full resolution | text correct |

This is worth recording because it **corrects gotcha 23**, which said all 79
generated layouts fail this song. That is true of the *generated* layouts —
their `map.json` has no key for `U+094D` virama or `U+0901` candrabindu. It is
**not** true of Preeti itself, whose built-in map has both. So:

> Allare is not an unwritable song. It is unwritable **in a generated layout**.
> A `PREETI`-class font can write it.

The two characters that break generated layouts, and the words they touch:

| character | meaning | what it does to a word without a key |
|---|---|---|
| `U+094D` virama | fuses a conjunct | **splits one letter into two** — `फर्केर` becomes `फरकर`, a different word |
| `U+0901` candrabindu | the crescent above a letter | usually only changes the spelling — `सँगै` → `संगै` |

---

## Checking a font before you render

Two commands, both about a second, then one still to look at.

```powershell
# 1. does the song's text survive the transformation?  (per word)
py scripts/show_transform.py "<song>.lrc" --font <slug>

# 2. does the FONT have a glyph for every key that transformation emits?
py scripts/check_font_cmap.py "<path>\<Font>.TTF" "<song>.lrc"
```

`show_transform.py` prints every distinct word beside the keys it becomes, so it
can be reviewed by eye without rendering. It exits 1 if any word does not
round-trip.

`check_font_cmap.py` is the second, separate question: a round-trip only proves
the **encoder and decoder agree**, which says nothing about whether the `.ttf`
has ink. It prints each key with `has glyph` / `NO GLYPH` and exits 1 on a miss.
A missing key is not a crash — Chromium draws that one character in a different
font, mid-word, which is the "stray letter" symptom.

Then the only check that settles glyph **identity**, which no script can do:

```powershell
node render.mjs <audio> <lrc> --prepare-only --legacy-font "<Font>.TTF" --layout Preeti --font-family <Family>
npx remotion still src/index.js LyricOverlay out/check.png --frame=<n> --props=out\props.json
```

**Read the still against the `.lrc`.** `द` and `ध` differ by one stroke and no
pixel statistic separates them.

> When judging a still, read the WORD, not the glyph. Abhinav is a calligraphic
> face and its े / ो marks read very differently from Yantramanav's — `मेरो`
> can look like `मरा` at a glance. Check the word against the source before
> calling a font wrong; the key sequence round-tripping is the objective part.

---

## Not verified

Everything else in the catalogue, including the AMS/Ananda/Abhinav display
families used for the earlier `Allare - Motion - *.mp4` renders. Those are
`GENERATED` class unless `sweep.json` says `PREETI`, and a `GENERATED` class
means plain `--legacy-font` may render the wrong glyph with no error. Run the
three steps above before shipping any of them.
