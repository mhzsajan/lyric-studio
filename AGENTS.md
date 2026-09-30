# AGENTS.md — lyric-studio

**Read this file first. It is deliberately short.** If you only read one thing,
read this. Everything historical lives in `docs/GOTCHAS.md` and is linked at the
bottom.

## What this is

Turns `song.mp3` + a Song-Timer `.lrc` (+ an optional `.ends.txt`) into a
**1920×1080 @ 30 fps H.264 lyric overlay** — white text on pure black, blended
Add/Screen over a Videosync2 camera feed in Ableton Live. One command, and it
refuses to hand you a file that did not pass its own checks.

```powershell
node scripts\make_video.mjs "song.mp3" "song.lrc" --length 417.10
```

That is beats → render → critique. It exits 0 **only** if the finished file
passed. Two products come out of the same codebase:

| | flag | what it is |
|---|---|---|
| **Overlay** (default) | — | the proven deliverable: text-only layer for Videosync2 |
| **Styled** | `--styled` | the full-frame video: painted background, title cards, mix placement |

## The three rules that outrank everything here

1. **Verify the FILE, never the exit code.** Every gate in this repo exists
   because something shipped looking fine and was wrong. A render that finishes
   is not a render that is correct (gotcha 15).
2. **A check that cannot fail is not a check.** Prove your instrument catches the
   bug it was written for before you trust it to clear one (gotcha 32).
3. **A data channel that reaches the report has not reached the render.** If the
   video needs a value, the value must be asserted *inside the composition*, not
   logged next to it (gotcha 31 — this has now happened four times).

## The pipeline, stage by stage

`make_video.mjs` is the entry point. Full contract with flags, exit codes and
failure modes: **[docs/PIPELINE.md](docs/PIPELINE.md)**.

| stage | script | fails the run when |
|---|---|---|
| 1. beats (optional) | `scripts/detect_beats.py` | tempo is untrustworthy → grid is **refused**, not guessed |
| 2. render | `render.mjs` | the font gate rejects the font; no `.ends.txt` and none possible |
| 3. critique | `scripts/critique.py` | streams, duration, text present, pure plate, edge-clip |
| 4. **every-frame scan** | `scripts/scan_visibility.py` | any lyric is visible **outside its own `[start, end]`** |

Stage 4 is the one people forget. `critique.py` samples; the scan decodes
**every frame** and proves no word outlives its tapped end. Skip it with
`--skip-scan`, never by accident.

## Making a song — the whole procedure

```powershell
cd C:\Users\o0o\Documents\Default Project\lyric-studio

# 1. is this font proven on THIS song?  (not a catalogue — a song test)
#    the font repo OWNS the verdicts; read them from the sibling repo:
#    ..\nepali-legacy-fonts\verdicts.json   (4 states: working / untested /
#    broken / failed — broken and failed are always refused)

# 2. dry run: cue count, ends wired, mix plan, no render
node render.mjs "G:\Lyrical Video\<Song>\<audio>.mp3" `
               "G:\Lyrical Video\<Song>\<Song>.lrc" --report-only

# 3. the real thing — --loudest is every layer at once
node scripts\make_video.mjs "G:\Lyrical Video\<Song>\<audio>.mp3" `
               "G:\Lyrical Video\<Song>\<Song>.lrc" `
  --no-audio --length 417.10 --loudest `
  --font-file "..\nepali-legacy-fonts\fonts\yantramanav\Yantramanav-Black.ttf" `
  --out "out\<Song>.mp4"
```

Then **look at a frame**. No script can tell `द` from `ध`; only a human can.

## The house style

```powershell
--loudest         # ALL of it: depth, motion, word+letter anim, size, colour
--size-preset medium   # 105 / 0.08 / 0.05  <- the house size (see below)
--motion wild        # per-line choreography from a seeded deck
--style  (unset)     # line entrances dealt from the 22-style pool
--word-anim karaoke  # newest word brightest
--letter-anim pop --letter-var 0.03
--mode mix --mix-block 8
--size-mode word
--color-mode wild --color-hue 210 --color-scheme analogous
--cut word           # the newspaper look: every word a clipping
--type letter        # the typed-on reveal
--font-file ...\Yantramanav-Black.ttf
--shadow "0 3px 14px rgba(0,0,0,0.8)"
```

All of it is in **[docs/ANIMATION.md](docs/ANIMATION.md)** — every layer, every
value, and the two hard rules motion must obey (finish inside the cue's own end;
never travel past the frame margin).

### The three sizes, and why `medium` is the default

Chosen by rendering the same 130 seconds of Kali Kali at each and looking at
them. `--size` is a **floor**, not a peak — two multipliers stack on it:

```
peak = size * (1 + size-var) * (1 + size-drift)
```

| preset | size / var / drift | peak | frame width | verdict |
|---|---|---|---|---|
| `large` | 120 / 0.10 / 0.06 | ~140px | ~62% | still reads dominant over video |
| `medium` | **105 / 0.08 / 0.05** | ~119px | ~53% | **the house size** |
| `small` | 90 / 0.06 / 0.04 | ~99px | ~45% | starts to look small for a lyric video |

The original 150 / 0.20 / 0.18 reached **212px** and filled ~90% of a 1080p frame.
That was the complaint that started this: too much of the live screen covered by
text. `--size-preset` is a preset, not an override — an explicit `--size`,
`--size-var` or `--size-drift` always wins.

### Colour, and why the ranges are bounded

`--color-mode calm|vivid|wild` paints a seeded colour **per word**, and from
`vivid` up **per letter** as well. It takes **no frame time at all** — a word's
colour is drawn from the seed and stays — so colour cannot put a word on screen
after its line ended. The hue *steps* across a word rather than scattering, so a
conjunct stays one coloured object.

The ranges are bounded on purpose. This deliverable is blended Add/Screen over a
camera feed, so it is judged as light added to a picture: a dark word adds
nothing and is simply absent from the composite, and full-spectrum saturation
fights the footage. Each level floors its own lightness, and
`scripts/check_color.mjs` asserts that floor for every word and every letter.
See **src/color.js** for the numbers.

### `--cut` and `--type`, and what each is allowed to touch

`--cut off|word|letter` is the newspaper look — every word a clipping at its own
angle, height and torn edge. `--type off|line|word|letter` is the typed-on reveal:
letters arrive left to right and stay.

Both are bounded by the same rule the whole repo lives under — Devanagari's
shirorekha is continuous across a word, so anything that moves or clips a letter
relative to its neighbours snaps the headline (gotcha 8):

- **word level** may rotate, lift, scale and tear freely — the bar already breaks
  at word boundaries
- **letter level** may take colour and a *bounded* rotation (`LETTER_ANGLE_CAP`,
  deliberately conservative, not yet measured against pixels)
- **letter level may not lift or clip at all.** Not capped — refused. There is no
  safe amount of either, and `check_cut.mjs` asserts their absence so a future
  change cannot quietly add them.

`--type` is the one effect that must finish inside the cue's end, because it is
nothing but letters arriving late. Its chain is fitted to the span and compresses
rather than overrunning, like `--depth`'s sequenced reveal.

## Map of the repo

| I want to… | read |
|---|---|
| understand the pipeline / what fails it | [docs/PIPELINE.md](docs/PIPELINE.md) |
| animate text — every layer and value | [docs/ANIMATION.md](docs/ANIMATION.md) |
| pick a font that is **proven** on this song | `..\nepali-legacy-fonts\verdicts.json` — **the font repo owns this.** This repo holds no font facts and must never grow a copy; read it through `scripts/font_ref.mjs` |
| know what went wrong here, 37 times | [docs/GOTCHAS.md](docs/GOTCHAS.md) |
| match the reference video's look | [docs/REFERENCE.md](docs/REFERENCE.md) |
| why Remotion, and its traps | [docs/PLAYBOOK.md](docs/PLAYBOOK.md) |
| motion recipes / the five-font work | [docs/MOTIONS.md](docs/MOTIONS.md) |
| why the GPU is idle | [docs/GPU.md](docs/GPU.md) |
| the legacy font forensics | `..\nepali-legacy-fonts\` — the font repo, including its `docs/knowledge-repo-archive/` |

## Layout

```
render.mjs              CLI: parses flags, prints the cue report, runs Remotion
scripts/make_video.mjs  the one command: beats -> render -> critique -> scan
scripts/critique.py     verifies the FILE (samples)
scripts/scan_visibility.py  verifies EVERY FRAME against the cue windows
scripts/lingering.py    after-end sampling (found gotcha 31)
scripts/font_ref.mjs    the ONLY path to the font repo: verdicts, families, ends
scripts/render_batch.mjs    a named list of song/font renders, each gated
scripts/size_ladder.cjs     one song at several sizes, for choosing a size
scripts/only_line.mjs       ONE lyric line, full size, in seconds -- judge here first
src/cut.js            --cut: the newspaper / cut-paper look, per word
src/typing.js         --type: the typed-on reveal, chain fitted to the cue span
scripts/check_*.mjs     regression tests -- run them all, they are fast
src/LyricOverlay.jsx    pure function of frame -> text state
src/motion.js           --motion layer: 21 choreographies, frame-clocked
src/depth.js            --depth layer: the seven COMPOSITION layers
src/color.js            --color-mode: per-word and per-letter colour, no frame time
src/animations.js       STYLES pool, seeded size and position
src/word-timing.js      .lrc -> per-word times (the beat-sync seam)
src/parse-lrc.mjs       .lrc (+ .ends.txt) -> cues {time, end, text}
src/Root.jsx            compositions; duration and fps resolve here
styles/house.md         the look, in prose
```

Two tools moved out to the font repo when it took ownership of the font facts —
`nepali-legacy-fonts/scripts/show_transform.py` (word → legacy keys) and
`nepali-legacy-fonts/scripts/check_font_cmap.py` (does the font have ink for
every key). Do not re-add copies here; a second copy of a font verdict is a
second thing to be wrong.

## Before you change anything

```powershell
node scripts\check_all.mjs      # every self-contained suite. This is the command.
node scripts\check_all.mjs --song "G:\...\song.lrc"   # also the two song tools
```

There are **22** check scripts, in three kinds. Only the first kind must be
green before you commit, and `check_all.mjs` runs all of it:

**1. Self-contained suites (17)** — pure functions of the source; no render, no
font, no audio. Seconds each, and every one has caught a real bug here.

| | guards |
|---|---|
| `check_flag_defaults.mjs` | a numeric flag read with `Number(null)` → 0 (gotcha 28) |
| `check_ends_wire.mjs` | the `.ends.txt` reaches the **composition**, not just the report (gotcha 31) |
| `check_motion.mjs` | motion pool: seeded, no repeats, finished inside each cue's end |
| `check_depth.mjs` | the seven composition layers; above all that the **sequenced reveal fits inside the cue's span**, the shirorekha rule, tracking as a gap and not letter-spacing, determinism |
| `check_color.mjs` | per-word/per-letter colour: the **lightness floor** every level must clear (a dark word is invisible once Add/Screen blended over footage), a stepped hue rather than a scatter, `off` returns null, and — because a colour check that passes while the video is broken is exactly its own failure mode — the assertions are run against a deliberately broken implementation and must reject it |
| `check_cut.mjs` | the cut-paper layer: word geometry stays finite, no per-letter rotate exceeds `LETTER_ANGLE_CAP`, and **no per-letter lift or clip exists at all** — those two cut the shirorekha irreversibly, so they are refused rather than capped. Asserts `letter` genuinely inherits `word`'s geometry |
| `check_typing.mjs` | the typed-on reveal: **the delay chain finishes inside every cue's span**, including the pathological ones (a 40-letter line in 0.5 s). A typing reveal is nothing but letters arriving late, which is the exact shape of the lingering-lyric bug |
| `check_animation.mjs` | word/letter pools, **the shirorekha rule**, size-drift bounds |
| `check_parse.mjs` | the `.lrc` + `.ends.txt` parse |
| `check_beats.mjs` | beat anchoring and the "untrusted grid is refused" rule |
| `check_pairing.mjs` | the `.lrc` and ends file must find each other by name |
| `check_letters.mjs` | grapheme splitting, letter sizing on real lyric text |
| `check_mix.mjs` | the mix-mode placement plan, and the arithmetic covering every cue |
| `check_width_model.mjs` | the width model, its classifier, its coefficients |
| `check_word_timing.mjs` | derived word timings against a real song's cues |
| `check_opener.mjs` | title-card window, asserted rather than eyeballed |
| `check_doc_refs.mjs` | the docs cite files that exist, and the check list is not stale |

**2. Song tools (2)** — take a `.lrc` and report about *that* song. Not gates: a
song's result is not a repo state. `check_song.mjs` (cue order, positive spans,
title/band) and `check_timing.mjs` (opener timings worked out from the song).

**3. File checks (3, one of them next door)** — need a render or a font.
`check_ends.py` and `check_output.py` live here. `check_font_cmap.py` moved to the
**font repo** with the fonts it checks, and is named here only so the count adds
up and the split is visible. Two more live in the pipeline instead:
`critique.py` and `scan_visibility.py` are stages 3 and 4, run on every render.

If you add a check, **prove it fails on a known-bad input first** — that is the
habit that keeps them worth running, and `check_doc_refs.mjs` will now tell you
if you forget to list it.

Two machine-specific traps, both of which have cost real time:
- Renders **share `src/lyrics.generated.js`** — two at once in one tree and the
  last-prepared font wins. Queue them, or use a worktree.
- **Never** round-trip a non-ASCII file through PowerShell
  `Get-Content`/`Set-Content`. It double-encodes UTF-8 and turns Devanagari into
  mojibake — which once made three *correct* words look broken.

## Hygiene

- Never commit `out/`, `public/`, `src/lyrics.generated.js`, or the calib
  samples — all derived, all gitignored.
- `docs/knowledge-repo-archive/` is a verbatim archive of a deleted repo. Read
  it for the font forensics; do not edit it.
- Console output stays ASCII-only (Windows mojibake).
