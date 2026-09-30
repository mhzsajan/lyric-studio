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
#    read docs/FONTS-VERIFIED.md and pick from the WORKING table

# 2. dry run: cue count, ends wired, mix plan, no render
node render.mjs "G:\Lyrical Video\<Song>\<audio>.mp3" `
               "G:\Lyrical Video\<Song>\<Song>.lrc" --report-only

# 3. the real thing
node scripts\make_video.mjs "G:\Lyrical Video\<Song>\<audio>.mp3" `
               "G:\Lyrical Video\<Song>\<Song>.lrc" `
  --no-audio --length 417.10 --size 128 --mode mix --mix-block 8 `
  --motion wild --word-anim karaoke --letter-anim pop --letter-var 0.03 `
  --font-file "..\nepali-legacy-fonts\fonts\yantramanav\Yantramanav-Black.ttf" `
  --out "out\<Song>.mp4"
```

Then **look at a frame**. No script can tell `द` from `ध`; only a human can.

## The house style

```powershell
--motion wild        # per-line choreography from a seeded deck
--style  (unset)     # line entrances dealt from the 22-style pool
--word-anim karaoke  # newest word brightest
--letter-anim pop --letter-var 0.03
--mode mix --mix-block 8
--size-mode word
--font-file ...\Yantramanav-Black.ttf
--shadow "0 3px 14px rgba(0,0,0,0.8)"
```

All of it is in **[docs/ANIMATION.md](docs/ANIMATION.md)** — every layer, every
value, and the two hard rules motion must obey (finish inside the cue's own end;
never travel past the frame margin).

## Map of the repo

| I want to… | read |
|---|---|
| understand the pipeline / what fails it | [docs/PIPELINE.md](docs/PIPELINE.md) |
| animate text — every layer and value | [docs/ANIMATION.md](docs/ANIMATION.md) |
| pick a font that is **proven** on this song | [docs/FONTS-VERIFIED.md](docs/FONTS-VERIFIED.md) |
| know what went wrong here, 37 times | [docs/GOTCHAS.md](docs/GOTCHAS.md) |
| match the reference video's look | [docs/REFERENCE.md](docs/REFERENCE.md) |
| why Remotion, and its traps | [docs/PLAYBOOK.md](docs/PLAYBOOK.md) |
| motion recipes / the five-font work | [docs/MOTIONS.md](docs/MOTIONS.md) |
| why the GPU is idle | [docs/GPU.md](docs/GPU.md) |
| the legacy font forensics | [docs/FONTS.md](docs/FONTS.md) |

## Layout

```
render.mjs              CLI: parses flags, prints the cue report, runs Remotion
scripts/make_video.mjs  the one command: beats -> render -> critique -> scan
scripts/critique.py     verifies the FILE (samples)
scripts/scan_visibility.py  verifies EVERY FRAME against the cue windows
scripts/lingering.py    after-end sampling (found gotcha 31)
scripts/show_transform.py   word -> legacy keys, for review before rendering
scripts/check_font_cmap.py  does the FONT have ink for every key
scripts/check_*.mjs     regression tests -- run them all, they are fast
src/LyricOverlay.jsx    pure function of frame -> text state
src/motion.js           --motion layer: 21 choreographies, frame-clocked
src/animations.js       STYLES pool, seeded size and position
src/word-timing.js      .lrc -> per-word times (the beat-sync seam)
src/parse-lrc.mjs       .lrc (+ .ends.txt) -> cues {time, end, text}
src/Root.jsx            compositions; duration and fps resolve here
styles/house.md         the look, in prose
```

## Before you change anything

```powershell
node scripts\check_all.mjs      # every self-contained suite. This is the command.
node scripts\check_all.mjs --song "G:\...\song.lrc"   # also the two song tools
```

There are **18** check scripts, in three kinds. Only the first kind must be
green before you commit, and `check_all.mjs` runs all of it:

**1. Self-contained suites (13)** — pure functions of the source; no render, no
font, no audio. Seconds each, and every one has caught a real bug here.

| | guards |
|---|---|
| `check_flag_defaults.mjs` | a numeric flag read with `Number(null)` → 0 (gotcha 28) |
| `check_ends_wire.mjs` | the `.ends.txt` reaches the **composition**, not just the report (gotcha 31) |
| `check_motion.mjs` | motion pool: seeded, no repeats, finished inside each cue's end |
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

**3. File checks (3)** — need a render or a font. `check_ends.py`,
`check_output.py`, `check_font_cmap.py`. Two more live in the pipeline instead:
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
