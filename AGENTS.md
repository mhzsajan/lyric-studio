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

This is the configuration the seven delivered videos were rendered with. It is
`scripts/render_all.mjs` verbatim — one value per flag there, and a duplicate flag
in that file is invisible in a diff and decisive at render time, which is how the
batch once shipped a colour density nobody had approved.

```powershell
--loudest            # depth, motion, word+letter anim, size, mix placement
--size-preset medium # 105 / 0.08 / 0.05  <- the house size (see below)
--letter-var 0.12    # PER-LETTER SIZE, and see the cap below before changing it
--color-scheme warm  # the warm ramp: gold -> orange -> red -> crimson
--color-hue 0
--color-accent 0.12  # ~1 word in 8 is accented; the rest stay WHITE
--color-mode calm    # per word. vivid+ steps hue ACROSS a word = "fading"
--cut word           # the newspaper look, every word a clipping
--wrap rows          # long lines become rows at full size
--mode mix --mix-block 8
--scanlines 40 --scanline-alpha 0.06
--shadow "0 3px 16px rgba(0,0,0,0.85)"
--font-file ...\arya\Arya-Bold.ttf     # ONE OF THE FOUR UNICODE FACES
```

`--type letter` is **off** in the delivered files and that is deliberate — see
`--cut and --type` below. `--x-pos` is **off**: it moved a settled line sideways
between cues, which with the motion layers on was redundant as well as jittery.

All of it is in **[docs/ANIMATION.md](docs/ANIMATION.md)** — every layer, every
value, and the two hard rules motion must obey (finish inside the cue's own end;
never travel past the frame margin).

### Where the text sits, and why

**Upper-mid, 30/40/50 of frame height.** This is a delivery constraint, not a
composition one: the material is played on a stage screen that sits **high**, so the
bottom of the frame is where the audience cannot see, and the top is lost to whatever
is above the screen. The usable area is a band, not an edge.

Three things enforce it, and all three exist because one of them alone did not work:

| | what it does | why it was not enough alone |
|---|---|---|
| `geometry()` 30/40/50 | where a block **begins** | a block grows *downward*, so a many-row line walks straight back out of the band |
| `MAX_BOTTOM = 0.72` | caps where a block may **end** | without it, 3:09 reached 94% of the frame |
| `SIDE_SAFE_VW = 4` | 4vw clear on **both** sides | a band's `left` may be 0vw, and at 1:53 the ink began at exactly x=0 |

`scripts/band_report.py` checks sampled cues against both edges. "Is it centred"
would pass a block hanging off the bottom of the visible area.

### How a line is TYPESET, not shrunk

`--wrap rows` breaks a long line into **rows at full size**. Wrapping happens
**first**; shrinking only if the rows still overflow. Rows are **balanced**, not
greedy, and a boundary is **always a space** — see `check_wrap.mjs`.

**TWO HARD RULES, both learned the expensive way.**

**The row count is decided at the FULL requested size, never at the fitted one.**
It used to scale the wrap budget by the ratio of the size that was finally chosen to
the size that was asked for, which is a feedback loop with positive gain: shrink the
type, measure a narrower band in em, fit fewer words per row, make the block taller,
shrink further. It produced **8px type at 3:00** across twelve rows.

**The shrink has a hard floor: `MIN_FRACTION = 0.78` of the house size.** A line
that will not fit at 82px is a wrapping problem, not a sizing one. "Don't lower the
font size too low" is a standing instruction and this is where it is enforced.

`LINE_HEIGHT` is **1.55**, and it is **one constant**. It was the literal `1.32` in
five places, two of which decide whether a line may be the size it asked for — so a
disagreement between the copies looks like random shrinkage rather than a layout
bug. 1.32 was shorter than the faces are tall (1.6–1.8em from an above-matra down to
a ु), so glyphs overflowed their own line box and the crop landed on the descender:
"the last छु word is cut to the bottom". `paddingBottom: 0.22em` under the last row
is the margin of safety for a taller face.

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

**The unit is the SYLLABLE, not the word and not the sentence.** Three attempts in
one session, in order, and each was wrong for a reason worth recording:

1. **per word, at accent 1.0** — "too colourful, don't use colours everywhere". A
   coloured word in a one-syllable lyric is a coloured *line*, and a line of those is
   a video that is coloured all the way through.
2. **per word, at accent 0.12** — one word in eight picked out. Better, but the
   request was "per **letter**… 2 3 letters only".
3. **`syllableAccent()`** — what ships. About one word in eight is accented, and
   within it a **run of two or three consecutive syllables**. A *run* and not a
   scatter, because a syllable is the unit the shirorekha is drawn across: two
   non-adjacent syllables in one word puts two colours inside one headline, which is
   the gotcha-8 damage in colour form.

`--color-mode vivid` and above step the hue **across** a word, letter by letter.
That is the "fading" that was rejected by name, so the house style is `calm`.

**A NAMED PALETTE IS EXACT, and a generated one is not.** `NAMED_PALETTES` holds
real hex values — `reds` (the twenty from a reference), `materials` (those plus
thirteen metals and earths), and `warm`, the shipped one: gold, yellow, amber,
orange, orange-red, vermilion, red, coral red, crimson, carmine. "Mahogany" is
`#420D09` and not "a dark red near hue 0".

**THE FLOOR IS A GUARD AGAINST A VANISHING COLOUR, NOT A TARGET.** This is the
most-repeated mistake in the file's history, and the number moved 40 → 158 → 115 →
0.20 (51/255) as it became clear the accent was solving lightness *from* it. A
saturated hue cannot be brightened by scaling: red is already 255 in its own channel
and carries only 0.2126 of the luminance budget, so the only lever is
desaturation. Chasing a bright red is what produced `rgb(255,132,132)` — rejected as
"fading colours" — and then `rgb(255,77,77)`, rejected as "not vibrant red". The
accent now states a **saturation and a lightness directly**; the floor only rejects a
colour that would disappear.

Seven of the twenty named reds measure below luma 51 — mahogany at 24, maroon at 27.
They are **lifted to the floor** by `ensureReadable()`, which raises lightness while
holding hue and saturation, and the lifts are **enumerated by the check** rather than
hidden. Dropping them would have honoured the names and lost the words.

Colour takes **no frame time at all**, so it cannot put a word on screen after its
line ended. `scripts/check_color.mjs` asserts the floor for every word **and every
letter** — it walked words only for most of its life, and a `wild` letter at hue 210
was sitting at luma 145 while its own word was at 160.

`scripts/colour_words.py` measures the real thing: it segments a frame on column gaps
and counts hues per word. **It reported an all-white line as "the fault" once** —
white is the goal — and flagged "one accent among whites", which is the design. A
fault is every word carrying the same chroma with no white anywhere.

### The title-word highlight

When a word of the song's own title appears in a lyric line, that word is marked —
colour, a glow, and a size bump — **every time it appears**. `--title-word` sets
what it matches on; otherwise the `.lrc`'s `[ti:]` tag is used.

**Exact whole-word match, never substring.** The lyric contains `तिमीलाई` and the
Timilai title is `तिमीलाई भुलेको`; a substring test would mark every `तिमीलाई` in
the song, which is a word that merely appears in the title rather than the title.
Punctuation is stripped from both sides first, because the title carries a comma the
lyric does not — and without stripping the feature matches nothing and looks like
nobody implemented it.

**The glow is a `textShadow`, with no filter and no transform**, and
`check_title.mjs` asserts both absences. Every bug this project lost a day to was a
per-*syllable* transform detaching a matra; an effect that only adds **paint** cannot
reintroduce it. The one geometric property set is a per-**word** font-size, which is
safe because a word is a single span.

**IT IS APPLIED IN `animatedWords()`, AND THAT IS THE WHOLE LESSON.** The highlight
was written into `wordSpans()` and `colorSpans()` — the `spans === false` branches.
Every render in this batch goes through `animatedWords()`, the `spans === true` one,
because `spans` is true whenever word **or** letter animation is on and `--loudest`
turns both on. So the feature was **dead in all seven delivered videos** while
`check_title.mjs` was green and the report said *"fires on 96 words across 32 of 74
cues"*. Both were true: the matcher is a pure function and it was correct; the bug
was in which caller ran.

`check_title_render.mjs` exists for this and only this: it renders the same frame
twice and requires the pixels to differ. **Proven able to fail** — with the threading
removed it reports *"the two stills are BYTE-IDENTICAL"* and `check_title.mjs` still
passes. See gotcha 49.

**The report is on every run and it fails loudly.** A matcher that finds nothing looks
exactly like a feature nobody implemented, which is worse than a crash:

```
title  : अल्लारे
         fires on 1 word(s) across 1 of 109 cues
```

or the warning, with the exact flag to add. **Watch for the warning** — three of the
seven songs have an English `.lrc` title over a Nepali lyric (Jam Na Maya, Kali Kali,
Wora Para) and need `--title-word` from a human. `scripts/title_probe.mjs` answers it
for a whole folder tree without rendering.

### `--cut` and `--type`, and what each is allowed to touch

`--cut off|word|letter` is the newspaper look — every word a clipping at its own
angle, height and torn edge. `--type off|line|word|letter` is the typed-on reveal:
letters arrive left to right and stay.

Both are bounded by the same rule the whole repo lives under — Devanagari's
shirorekha is continuous across a word, so anything that moves or clips a letter
relative to its neighbours snaps the headline (gotcha 8):

- **word level** may rotate, lift, scale and tear freely — the bar already breaks
  at word boundaries
- **letter level** may take colour and a *bounded* rotation (`LETTER_ANGLE_CAP`)
- **letter level may not lift or clip at all.** Not capped — refused.

**`--cut`'s tear bar is sized from the font's own measured ink room.** The bar sits
at `bottom: 0` of the word box, so the only space it may occupy is between the glyph
**ink** and the box's lower edge, and that is `descent − inkBottom` for whatever face
is in use. It varies **79×** across this batch's fonts (0.006em Himalayabold to
0.474em MKali), so a constant `0.34em` bar put a bright `rgba(255,255,255,0.85)` edge
**across the bottom of every letter in ten of the eleven**. `scripts/metrics_probe.py
--write` measures the room and caches it in `width.json`; `check_cut.mjs` asserts the
bar never reaches the ink.

**`--type letter` is OFF in the delivered files, and that is a correctness
decision.** The reveal clips each syllable with `inset(0 X% 0 0)`, so **mid-reveal a
syllable is half-drawn** — and a half-drawn Devanagari syllable is a *different
letter*. On a white word that is a soft entrance. On **the one word in the line that
is coloured**, it is glaring, because that is the word the eye goes to. That was
reported as "the red word makes the sentence incorrect" and as "some issue with jam
na maya", and the honest cost of turning it on is a legible word.

### Per-letter size, and a cap that was hiding it

`--letter-var` asks for per-letter size. **`LETTER_SIZE_CAP` in `src/letters.js`
clamps it**, and for most of its life that cap was 0.03 — so `--letter-var 0.07`,
`0.12`, `0.18` and `0.25` all produced **byte-identical** output, and the feature
looked like it did not exist. A cap that is not mentioned at the call site is a
feature that has been switched off without saying so.

The cap is now **0.12**, and the house style asks for all of it. **The trade, stated
plainly:** at 0.12 a syllable can be 112% beside one at 88%, which puts a visible
notch in the shirorekha — the table in `letters.js` calls 0.12 "badly broken". It is
wanted, so it is asked for; **0.06** is the value to drop to if the stepping reads as
damage. The trade is a number that can be changed, not a ceiling that cannot.

## Map of the repo

| I want to… | read |
|---|---|
| understand the pipeline / what fails it | [docs/PIPELINE.md](docs/PIPELINE.md) |
| animate text — every layer and value | [docs/ANIMATION.md](docs/ANIMATION.md) |
| pick a font that is **proven** on this song | `..\nepali-legacy-fonts\verdicts.json` — **the font repo owns this.** This repo holds no font facts and must never grow a copy; read it through `scripts/font_ref.mjs` |
| know what went wrong here, 49 times | [docs/GOTCHAS.md](docs/GOTCHAS.md) |
| match the reference video's look | [docs/REFERENCE.md](docs/REFERENCE.md) |
| build the ṚITU full-frame piece | [docs/RITU.md](docs/RITU.md) — the design, the lyric analysis, and the locked settings |
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
src/word-timing.js      .lrc -> per-word times (the beat-sync seam), and WORD_FILL
src/wrap.js             --wrap: a long line -> balanced rows, never splitting a word
scripts/probe_words.mjs  how long each word is actually ON SCREEN (the gate's blind spot)
scripts/probe_typing.mjs  whether a letter lands before its own word or after the cue
scripts/interval_math.mjs whether a low ink-interval count is a bug or arithmetic
scripts/gate_case.mjs   run render.mjs on a song whose FILENAME is Nepali
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

There are **29** check scripts, in three kinds. Only the first kind must be
green before you commit, and `check_all.mjs` runs all of it:

**1. Self-contained suites (23 + smoke)** — pure functions of the source; no render, no
font, no audio. Seconds each, and every one has caught a real bug here.

| | guards |
|---|---|
| `check_flag_defaults.mjs` | a numeric flag read with `Number(null)` → 0 (gotcha 28) |
| `check_ends_wire.mjs` | the `.ends.txt` reaches the **composition**, not just the report (gotcha 31) |
| `check_motion.mjs` | motion pool: seeded, no repeats, finished inside each cue's end |
| `check_depth.mjs` | the seven composition layers; above all that the **sequenced reveal fits inside the cue's span**, the shirorekha rule, tracking as a gap and not letter-spacing, determinism |
| `check_color.mjs` | per-word/per-letter colour: the **lightness floor** every level must clear (a dark word is invisible once Add/Screen blended over footage), a stepped hue rather than a scatter, `off` returns null, and — because a colour check that passes while the video is broken is exactly its own failure mode — the assertions are run against a deliberately broken implementation and must reject it |
| `check_cut.mjs` | the cut-paper layer: word geometry stays finite, no per-letter rotate exceeds `LETTER_ANGLE_CAP`, and **no per-letter lift or clip exists at all** — those two cut the shirorekha irreversibly, so they are refused rather than capped. Asserts `letter` genuinely inherits `word`'s geometry |
| `check_typing.mjs` | the typed-on reveal: **the delay chain finishes inside every cue's span**, including the pathological ones (a 40-letter line in 0.5 s). A typing reveal is nothing but letters arriving late, which is the exact shape of the lingering-lyric bug. Also walks the **real** word layer rather than a copied model of it |
| `check_wrap.mjs` | a long lyric line becomes **rows at full size**, not one shrunken row: balanced rather than greedy, and **never split inside a word** — Devanagari's shirorekha is continuous across a word, so a break inside one snaps the headline (gotcha 8). Runs a deliberately greedy and a deliberately word-splitting breaker and requires the assertions to reject both |
| `check_camera.mjs` | the ṚITU piece's fall is **monotonic across all 7530 frames**. It is invisible in any single frame and load-bearing across four minutes: the frame where the scale decreases is the frame where the camera has arrived, which is the one thing the song refuses. Also that the instrumental breaks fall *faster* than the sung stanzas, and that the beat grid moves the **camera only** |
| `check_title.mjs` | the **title-word highlight**: that it fires on the title and on NOTHING else, which is the assertion that has value — a substring match would light up every word that merely *contains* the title word. Also that the title's punctuation is stripped (`"अल्लारे,"` has a comma the lyric does not, and without stripping the feature silently matches nothing and looks unimplemented), that both scripts can be supplied at once, and that the glow is a `textShadow` with **no filter and no transform** — every bug this project lost a day to was a per-syllable *transform* detaching a matra, so the highlight is deliberately paint-only |\n| `check_title_render.mjs` | **that `--title-word` changes the RENDER.** This is the check that would have caught the highlight being dead in all seven delivered videos while `check_title.mjs` stayed green. The cause: the highlight was implemented in `wordSpans()` and `colorSpans()`, the `spans === false` branches, while every render in this batch goes through `animatedWords()` — the `spans === true` one, because `spans` is true whenever word or letter animation is on and `--loudest` turns both on. The matcher was correct, the report was correct, and the feature was absent from the output. Renders the same frame twice and requires the two PNGs to differ. **Proven able to fail:** with the threading removed it reports "the two stills are BYTE-IDENTICAL", and `check_title.mjs` still passes on the same break |
| `check_typo.mjs` | the five advanced-typography techniques (`src/typo/`): **finite** across 825 calls including `q = NaN` — a NaN transform does not draw the character, which is the disappearing-word bug through a new door; **deterministic**; **inside a declared travel contract** the code is actually held to; **readable through the body of a cue** (a technique that fades a glyph past 0.25 is deleting a letter); and **no technique owns timing** — asserted by reading the signatures, because a technique that could delay a character pushes ink past the cue's end |
| `check_smoke.mjs` | **renders one real frame of every composition**, with every layer on. This is the only instrument that sees a **missing binding**: `typeLag` and `cutRoom` were both destructured on `LyricOverlay` and read inside `animatedWords()`, and neither was passed to it — the module *parses*, all 21 other suites pass, and Remotion reports a bare frame number with no file and no stack. `cutRoom` cost five renders. Also asserts that the in-cue frame and the empty frame are **different pictures**, because a frame at the wrong time is byte-identical to a blank plate and no size threshold can tell them apart |
| `check_bundle.mjs` | **the tree compiles.** One missing space in a leaf of `src/ritu/` killed nine renders in a row — every render bundles `src/index.js`, so a typo in one file takes out the whole pipeline, and all 19 other suites stayed green throughout because a file that cannot *parse* is not a function anybody can call. Bundles the graph with Remotion's own loaders, so it catches what a per-file parse cannot: `RituPiece.jsx` imported `FONT_FAMILY` from a module exporting `FONT_FAMILY_NAME`, and every file parsed fine |
| `check_animation.mjs` | word/letter pools, **the shirorekha rule**, size-drift bounds |
| `check_parse.mjs` | the `.lrc` + `.ends.txt` parse |
| `check_beats.mjs` | beat anchoring and the "untrusted grid is refused" rule |
| `check_pairing.mjs` | the `.lrc` and ends file must find each other by name |
| `check_letters.mjs` | grapheme splitting, letter sizing on real lyric text, and that `LETTER_SIZE_CAP` clamps rather than silently swallows a value |
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

## The measuring instruments, and why they exist

Every one of these was written because a claim was being made from reading the
source instead of from the pixels, and the claim was wrong.

| | what it measures | the mistake it caught |
|---|---|---|
| `scripts/check_title_render.mjs` | **the same frame rendered with and without `--title-word`**, and requires the pixels to differ | the highlight firing in **none** of the seven videos while the matcher suite was green. A pure-function test cannot see which caller runs — gotcha 49 |
| `scripts/colour_words.py` | distinct hues **per word**, by segmenting a frame on column gaps | "whole lines came out white" — the unit was the word, so a coloured word in a one-syllable lyric was a coloured line. Also caught itself calling an all-white line "the fault" |
| `scripts/band_report.py` | every sampled cue against **both** frame edges | 3:09 reached 94% of the frame after the band had been raised. "Is it centred" would have passed it |
| `scripts/title_probe.mjs` | title-word matches for a whole folder tree, no render | three songs have an English `.lrc` title over a Nepali lyric and need `--title-word` |
| `scripts/metrics_probe.py --write` | each font's ink room below the baseline | the tear bar was drawing a bright edge through the bottom of every letter in **10 of 11** fonts |
| `scripts/matra_probe.py` | the ink a string needs vs what a frame shows | whether a missing matra is a font defect or a crop. It is neither here: it is `LINE_HEIGHT` |
| `scripts/bbox_report.py` | a frame's ink box against the frame edges | distinguishing "text touching the edge" from "text clipped" |
| `scripts/probe_words.mjs`, `probe_typing.mjs`, `interval_math.mjs` | how long a word is on screen, whether a letter lands late, whether a low interval count is arithmetic | the gate's blind spots, per `AGENTS.md` |

**Four of these have misled me and are labelled accordingly.** Two report the wrong
quantity; two were used with two variables at once.

- `type_size.py` counts empty rows to find row breaks, and `--scanlines` puts ink in
  every row, so it reported 1080px rows; it also samples single frames, and with
  `--motion` a frame mid-entrance is scaled down. It said 8px where the picture
  shows readable type.
- `colour_words.py` called an all-white line "the fault". White **is** the goal; a
  fault is every word carrying the same chroma with no white anywhere.
- Comparing the old video against the new one to check the title highlight **changed
  `--type` and the title wiring at once**, so a difference was unassignable and a
  confident per-song answer came out of it. One variable, or no answer.
- A frame picked by eye, and a Devanagari argument passed through PowerShell, both
  produced a **measurement that answered a different question** — a blank plate reads
  as a dead feature, and `????` is not the title word.

**When the instrument and the picture disagree, the picture wins** — and the right
response is to fix the instrument, not to believe it.

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
