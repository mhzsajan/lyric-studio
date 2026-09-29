# Pipeline

`make_video.mjs` is three steps, and the order is the point: each step can
stop the pipeline before the next one burns time on a doomed render.

```
make_video.mjs <audio> <lrc> [--styled] [render flags...]
   |
   +-- 1/3  beats      detect_beats.py  -> out/beats-<song>.json
   |                     failure = warn and continue (an enhancement, not a gate)
   |
   +-- 2/3  render     render.mjs, with the FONT GATE inside it
   |                     gate failure = HARD STOP, nothing encoded
   |                     - LyricOverlay  (default) keyable overlay
   |                     - LyricStyled   (--styled) full-frame video
   |
   +-- 3/3  critique   critique.py verifies the rendered FILE
                         failure = file exists, exit 1, "do not ship as-is"
```

`make_video` exits 0 **only** when the render succeeded AND the critique
passed. That is the whole design: the exit code is a claim about the video, not
about a process.

## What each stage can and cannot prove

| | proves | cannot prove |
|---|---|---|
| `font_gate.py` | the font can write every Devanagari character of the song | that the transcode is right (`diag_encode.py` and the render log's round-trip warning cover that) |
| `detect_beats.py` | a tempo and a beat grid, and its own confidence | that words are *sung* on those beats — hence `--beat-tol` quantizes around the tapped `.lrc` rather than retiming |
| `critique.py` | text present at sampled cues, plate purity, no edge-clip, streams, duration | **glyph identity** (द vs ध) — pixel statistics cannot; use `--prepare-only`'s still |

The row that matters is the last one. Every failure this project ever shipped
passed every automated check that existed at the time, because the checks
looked at the container, the timing, and the pixels *behind* the text.

## Why the gate is inside render.mjs and not in make_video

Because `render.mjs` is also the standalone entry point (`npm run render`, the
long one-line production commands in AGENTS.md). A gate that only exists in the
orchestrator protects exactly the one path people use least — and the failure it
prevents has shipped three times.

## The font gate in detail

```
--font-file <ttf>   -> fontTools: every Devanagari codepoint in the .lrc must be
                       in the font's cmap. Zero Devanagari codepoints = the file
                       is a legacy ASCII-mapped font -> hard fail.
--font-slug <slug>  -> font repo's check_song.py (the authority; not vendored).
--layout <json>     -> same, for the hand-wired legacy path.
--skip-font-gate    -> renders anyway. You are the gate now.
```

Measured on the test song: AMS Manthan (`--font-slug`) fails on 21 of 13 cues'
words — `U+094D` virama ×23, `U+0901` candrabindu ×14 — in **seconds**, with
the Tier A alternatives printed. Without the gate that is a four-minute render
of `फर्केर` as `फरकर` (a different word) that passes every output check.

## The overlays on the house style

`--styled` applies house defaults (title cards, `mix` placement, karaoke words,
letter pop at the 0.03 shirorekha cap, size 128, white halo). **Every one
yields to an explicit flag.** They are defaults, not overrides — check
`styles/house.md` for the rules and the banned-generic list.

## Passing flags through

`make_video` consumes only `--no-beats`, `--skip-critique`, `--bpm`. Everything
else — including `--styled`, `--font-file`, `--font-slug`, `--mode`, `--size`,
`--mode`, `--length`, `--no-audio`, `--preview`, `--out` — goes to
`render.mjs` untouched. It also pins `--out` so step 3 critiques the exact file
step 2 wrote.
