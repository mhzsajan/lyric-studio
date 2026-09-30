# Fonts: what is actually verified, and how to check a new one

The list of fonts in `nepali-legacy-fonts` is a catalogue. This file is the
short list of **fonts verified to write a given song correctly** — meaning a
full render that a human watched and approved — and the procedure for adding
to it.

The distinction matters because "the font repo says the font's keys verify"
and "this font can write these lyrics" are different claims, and only the
second one decides what the audience sees. See AGENTS.md gotchas 23, 34,
35 and 38.

**Authority note:** this list and the font repo's
[`docs/RENDER-TESTED.md`](../../nepali-legacy-fonts/docs/RENDER-TESTED.md)
are mirrors of the same verdicts. Update both when a font is added.

---

## The rule that decides everything

A font's entry in `../nepali-legacy-fonts/sweep.json` has a **`class`**:

| class | what it means | how to use it |
|---|---|---|
| **`UNICODE`** | native codepoints, Chromium renders them directly | `--font-file <ttf>`. No transcoding, no legacy failure modes. |
| **`PREETI`** | the font uses `npttf2utf`'s built-in Preeti mapping | `--legacy-font <ttf>` is the right *approach* — but see the failed list: a class is a claim, not a proof. |
| **`GENERATED`** | keys came from a sweep of the aNepali table | cannot write real songs — no candrabindu `ँ` or virama `्` slots (gotcha 34, `docs/SONG-CHECK.md` in the font repo). |

```powershell
py -c "import json;d=json.load(open(r'..\nepali-legacy-fonts\sweep.json',encoding='utf-8'));print([(e['slug'],e['class']) for e in d if e['slug']=='abhinav'])"
```

---

## Song-tested WORKING — human eye-check, Allare, 2026-09-30

Every font below rendered the **full Allare video** (35 lines, 6:54,
candrabindu + virama + punctuation-heavy, strict end timings) on the fixed
pipeline (gotcha 35, library-first Preeti keys) and passed the user's
eye-check of the known-hard window (1:37–2:25: जाऊ, फर्केर जाऊ, नलाऊ,
प्रीति, हो.. म त हावा सँगै आउँछु, झुट्टो, सोझो). **Make lyric videos from
this list only.**

### Legacy / PREETI class — `--legacy-font`

| Font | Slug | File | Look |
|---|---|---|---|
| ARAP007 | `arap007` | `fonts/arap007/` | brush-stroke bold |
| CV Haha | `cv-haha` | `fonts/cv-haha/` | rounded soft |
| Katmandu | `katmandu` | `fonts/katmandu/` | thin classic serif-like |
| MKali | `mkali` | `fonts/mkali/` | thin, light |
| PawanG | `pawang` | `fonts/pawang/` | clean bold |
| Shreenath Bold | `shreenath-bold` | `fonts/shreenath-bold/` | condensed tall display |
| Himalayabold | `himalayabold` | `fonts/himalayabold/` | soft rounded classic |
| Ananda Lipi Bold BT | `ananda-lipi-bold-bt` | `fonts/ananda-lipi-bold-bt/` | heavy traditional headline |

```powershell
node render.mjs <audio> <lrc> --no-audio --mode roam --beats out/beats-allare.json `
  --legacy-font "..\nepali-legacy-fonts\fonts\<slug>\<Font>.ttf" `
  --font-family <Family> --out "out\<Song> - <Font>.mp4"
```

(Resolve the exact .ttf filename with
`py ..\nepali-legacy-fonts\scripts\which_fonts.py ..\nepali-legacy-fonts\fonts\<slug>\`.)

### Unicode — `--font-file`

| Font | Slug | Look |
|---|---|---|
| Arya Bold | `arya` | modern serif-bold |
| Kalam Bold | `kalam` | handwritten bold |
| Rajdhani Bold | `rajdhani` | condensed display |

```powershell
node render.mjs <audio> <lrc> --no-audio --mode roam --beats out/beats-allare.json `
  --font-file "..\nepali-legacy-fonts\fonts\<slug>\<Font>.ttf" `
  --out "out\<Song> - <Font>.mp4"
```

### Yantramanav Black — still the default

`--font-file ..\nepali-legacy-fonts\fonts\yantramanav\Yantramanav-Black.ttf`.
Unicode, gate-passed, verified end to end on this song earlier (109/109
cues, strict ends) — it simply was not part of the 42-font eye-check batch.
Zero-transcoding remains the safest class; the 3 Unicode winners above share
that property.

---

## Failed the same song — do not use for lyric videos

All 42 preferred fonts were rendered or gate-checked on Allare (2026-09-30).
34 failed:

- **29 AMS/GENERATED fonts** — gate-rejected in seconds: their layouts have
  no candrabindu `ँ` or virama `्` slots and the song needs both
  (`सँगै`, `आउँछु`, `फर्केर`). AMS 1/2/4/5/7, Aaditya, Aakash, Aasmi,
  Aakul 4/5, Barakhadi 1, Chandrakant, Chhatrapati, Darshana, Diya, Ganesha,
  Gourav Bold, Harshdeep, Hastkala, Hastkala 1, Jiwan, Kartik, Karuna,
  Kasturi 1, Lekhan 1/1 Bold/4/5, Manoja.
- **5 declared-PREETI fonts that print raw ASCII** — `0012-arap`,
  `0017-arap`, `ananda-fanko-2`, `arap-010`, `ganga-1`. Their binaries have
  no ink on the Preeti key slots, so the video shows `hfpm,` where the lyrics
  say जाऊ, — with exit 0 and no error from any gate. Caught only by a pixel
  test (top-22%-band ink ratio ≈0.089 = raw ASCII vs >0.10 = real
  Devanagari shirorekha). **`sweep.json` "class: PREETI" is a claim, not a
  proof.**
- **2 genuine PREETI fonts that spell words wrong at the glyph level** —
  **`deepankar`** and **`abhinav`**. These are the instructive failures:
  the converter hands them byte-identical keys to the 8 working PREETI
  fonts, their cmaps cover every key, frame-checks of the known-hard words
  are correct — and the human still caught wrong spellings elsewhere. The
  defect is inside the font's own glyph drawing (some key combination it
  was drawn to render incorrectly), unreachable by any converter fix. Until
  the exact words are catalogued, treat both as do-not-use.

This corrects the earlier note in this file that treated Abhinav as the
example of a verified legacy font: its class, round-trip and cmap all pass,
and that was never sufficient (gotchas 35 and 37).

---

## Checking a font before you render

Two commands, both about a second, then one still to look at.

```powershell
# 1. does the song's text survive the transformation?  (per word)
py scripts/show_transform.py "<song>.lrc" --font <slug>

# 2. does the FONT have a glyph for every key that transformation emits?
py scripts/check_font_cmap.py "<path>\<Font>.TTF" "<song>.lrc"
```

`show_transform.py` prints every distinct word beside the keys it becomes,
so it can be reviewed by eye without rendering. It exits 1 if any word does
not round-trip.

`check_font_cmap.py` is the second, separate question: a round-trip only
proves the **encoder and decoder agree**, which says nothing about whether
the `.ttf` has ink. It prints each key with `has glyph` / `NO GLYPH` and
exits 1 on a miss. A missing key is not a crash — Chromium draws that one
character in a different font, mid-word, which is the "stray letter"
symptom.

Then the only check that settles glyph **identity**, which no script can do:

```powershell
node render.mjs <audio> <lrc> --prepare-only --legacy-font "<Font>.TTF" --layout Preeti --font-family <Family>
npx remotion still src/index.js LyricOverlay out/check.png --frame=<n> --props=out\props.json
```

**Read the still against the `.lrc`.** `द` and `ध` differ by one stroke and
no pixel statistic separates them.

> When judging a still, read the WORD, not the glyph. Calligraphic faces
> draw े / ो very differently from a geometric face — `मेरो` can look like
> `मरा` at a glance. Check the word against the source before calling a
> font wrong; the key sequence round-tripping is the objective part.
>
> And remember: even all of the above passed for deepankar and abhinav. The
> final acceptance test is a full render watched by a human — budget for it.
