# PIPELINE.md — the contract

What `node scripts/make_video.mjs` does, what each stage can refuse, and what
each failure means. This is the file to read when deciding whether a change is
safe.

```
make_video.mjs
   |
   +-- 1. detect_beats.py     optional; a grid it cannot vouch for is NOT used
   |
   +-- 2. render.mjs          font gate -> encode -> Remotion -> mp4
   |        |
   |        +-- lrc_legacy.py      Unicode -> Preeti keys, per word, verified
   |        +-- widthTableFor()    measured auto-fit, per font
   |
   +-- 3. critique.py         samples the file: streams, duration, text, plate
   |
   +-- 4. scan_visibility.py  EVERY frame against each cue's [start, end]
   |
   exit 0 only if 2, 3 and 4 all pass
```

## Stage 1 — beats (optional, and it declines)

`--no-beats` skips it. Otherwise `detect_beats.py` estimates tempo and writes a
confidence.

**A low-confidence grid is refused, not applied.** Measured on Allare: the
detector reported 123.05 when the true tempo is 120 — a 2.5% error that
accumulates to ~10 s of drift over 7 minutes, and its confidence did not
discriminate between forced 120/123/60. So the detector marks such a grid
`usable: false` and `make_video.mjs` does not pass it on. Snapping words to a
grid that is not the song's tempo pulls them *away* from the hand-tapped `.lrc`,
which is worse than the even distribution. **Gotcha 30.**

`--bpm <tempo>` is how you override it, for a song whose tempo you know.

## Stage 2 — render

`render.mjs` parses flags, runs the checks below, writes
`src/lyrics.generated.js` + `public/`, and shells out to the Remotion CLI.

### What can refuse to render

| condition | what happens | why |
|---|---|---|
| **no `.ends.txt` and none can be found** | **hard stop, exit 1** | an estimated end is the *next line's start*, so a line sung before an instrumental stays up for the whole gap. A fallback that produces a plausible wrong deliverable is a failure, not a convenience (gotcha 19, closed properly late) |
| font gate rejects the font | exit 1 | a legacy `.ttf` with 0 Devanagari codepoints, or a layout that cannot write this song |
| no Python and `--legacy-font` | exit 1 with an explanation | the transcoder is Python, by design |
| `--motion <unknown>` | exit 1 | "you asked for motion and got none", silently, is the gotcha-31 shape |
| `--frames N` | **ignored** | it renders the whole composition. Use `npx remotion still` for one frame |

### What the report prints (and what it does not promise)

The cue report shows cue count, the last end, where each end came from
(`timed` / `timed-clamped` / `estimated`), the mix plan and the width model.

**`timed-clamped` means** the tapped end ran past the next line's start — the
singer's tail — so it was trimmed to the next line. 10 of Allare's 109 cues are
like this. It is not a failure and it is not a guess; it is the tapped data.

**The report is not a delivery.** It reports on *render.mjs's* parse. The video
renders from the composition's parse, and for a long time those were two
different parses — the report said `109/109 timed` while every cue in the video
used an estimated end. `scripts/check_ends_wire.mjs` exists to keep them
identical, and it is the check that would have caught it (gotcha 31).

## Stage 3 — critique (samples)

`critique.py` checks the **finished file**, not the renderer's intentions:

- `streams` — exactly one video, zero audio when `--no-audio`
- `duration` — equals the audio length to within tolerance
- `text-present` — sampled cue frames actually carry text
- `black-plate` — corners are pure `#000000`, so Add/Screen keys cleanly
- `no-edge-clip` — no ink in the outer 2% of the frame

Presence is sampled **inside each cue's own `[start, end]`** (it needs `--ends`,
which `make_video` resolves and passes). Sampling used to measure from the
*next* line's start, which on short cues landed in the silent gap after the line
had ended — so it reported "no lit text" on a correct render and passed a broken
one. It was only ever right by accident (gotcha 32).

## Stage 4 — every frame, no sampling

`scan_visibility.py` decodes **every frame**, groups the frames with ink into
intervals, and compares them to the cue windows. Any ink outside
`[start, end]` fails the run.

This is a separate gate because it answers a different question from critique.
Sampling cannot answer *"does this word EVER appear too late"* — and the person
watching the file asked exactly that after every sampled check said 0/109.

Its threshold is **12/255**, far lower than critique's 40, because this is an
overlay: a line at 15% opacity is invisible on black alone and plainly visible
over a camera feed. `lingering.py`'s blind spots were a 150 ms sampling floor and
a 40/255 threshold (gotcha 31, closed).

**This detector was validated against a deliberately broken build**
(`scripts/_break_ends.mjs`): it reports 86 intervals outside the windows and
+7.1 s of overshoot on a render built without ends, and clean on a correct one.
A detector that never fails is not a detector.

## Exit codes

| code | meaning |
|---|---|
| 0 | rendered **and** verified |
| 1 | stopped. Read the message — every failure here names the file and what to do |

## The flags that matter most

| flag | default | note |
|---|---|---|
| `--length <s>` | — | **required for `--no-audio`.** Without it the video ends where the last lyric ends, which is an estimate (gotcha 14) |
| `--no-audio` | off | text-only overlay; no audio stream in the container |
| `--motion <level>` | `off` | off by default *deliberately* — motion displaces text (gotcha 33) |
| `--font-file` / `--font-slug` / `--legacy-font` | — | risk order in [FONTS-VERIFIED.md](FONTS-VERIFIED.md). Prefer `--font-file` |
| `--beats <file>` / `--no-beats` / `--bpm <n>` | beats on | an untrusted grid is refused automatically |
| `--title-word <w>` | the `.lrc`'s `[ti:]` | comma-separated for a two-word title: `--title-word "जाम,माया"`. See below |
| `--skip-critique` / `--skip-scan` | off | independent: critique is "is the file well-formed", the scan is "is any lyric outside its window" |
| `--preview` | off | quarter-size look check. **Not the deliverable** |

## `--title-word`, and the warning that means someone has to answer

The title-word highlight is supposed to be automatic. It reads the `.lrc`'s `[ti:]`
tag, and **three of the seven delivered songs have an English title over a Nepali
lyric** — `Jaam na Maya`, `Kali Kali`, `Wora Para` — so the matcher finds nothing.

That is why `render.mjs` prints a loud warning rather than staying quiet:

```
title  : Jaam na Maya
         WARNING: that title word is in NO cue. The highlight will
         --title-word "<the word as it appears in the lyric>"
```

**A feature that silently matches nothing looks exactly like a feature nobody
implemented, which is worse than a crash** — you cannot tell from the video whether
it is off, broken, or waiting on a word. So the report fires on every run and the
warning names the flag.

`scripts/title_probe.mjs` answers this for a whole folder tree without rendering
anything, and `scripts/check_title.mjs` asserts the matcher fires on the title and
on **nothing else**.

**The report reads `parsed.cues` directly, not `props.cues`.** `Root.jsx` fills
`props.cues` at *render* time, so at report time it is empty — which made the
report say "in NO cue" about `अल्लारे`, a title word that fires correctly at 2:56.
The same bug made `props.title` print "(none found in the .lrc)". A report that
reads the object the *renderer* will fill, rather than the one the *report* can
see, will always be wrong in the same direction: it says a working thing is broken.

## Ordering rules this machine forces

- Renders **share `src/lyrics.generated.js`**. Two at once in one tree and the
  last-prepared font wins — silently, as identical stills. Queue them, or use
  `git worktree add --detach` clones sharing a `node_modules` junction.
- **Five concurrent renders OOM-crash Chrome** on this box (exit 1, logs ending
  in a CDP stack, around 40% through). Two at a time is safe.
- The GPU is not usable for encoding: Remotion's bundled ffmpeg has no
  `h264_vaapi`/`h264_amf`. `--gpu` **fails the render here** and `--gl=angle` is
  *slower* than software. Measured in [GPU.md](GPU.md). Do not reach for it.

## What still needs a human

1. **Glyph identity.** `द` vs `ध` is one stroke. The font gate proves the font
   *has* the characters; nothing proves it draws the *right* one. Read a still.
2. **Whether it looks good.** "Proven working" means it renders correct text —
   not that you like it. Both are worth checking; only one is automatable.
3. **The Nepali spelling of a title.** Three songs' `.lrc` titles are English over
   Nepali lyrics, so `--title-word` has to be supplied by someone who knows the
   song. **No amount of checking can guess it**, and the warning on every run is the
   prompt for it.

## The delivered batch, and where it came from

Seven videos in `H:\Lyric Video Making Folder\RENDERED\`, all rendered from
`scripts/render_all.mjs` and all passing every gate. The font table there maps the
seven songs onto **four Unicode faces** (`arya`, `kalam`, `yantramanav`,
`rajdhani`); the Preeti fonts are excluded outright, because they carry **zero
Devanagari cmap** and no script can prove a glyph *shape* is right, only that
something was drawn.

Read the flags out of that one file rather than from a doc, and watch for
**duplicate flags in it**: a repeated flag is invisible in a diff and the last one
wins at render time, which is how a batch once shipped a colour density nobody had
approved.
