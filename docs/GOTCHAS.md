# Gotchas

Every mistake this repository has actually made, numbered. The numbers are
stable and are cited from code comments across `src/` and `scripts/` — so
they are never renumbered, only moved. If a comment says "gotcha 31", the entry
numbered 31 is below.

**These are not trivia.** Every one of them shipped as a file that looked fine.
Read this file before changing anything that measures, measures timing, or
chooses a font.

> **On a gate and a font.** A passing gate proves a font *can* be used, never
> that it should be. The evidence is uncomfortable: 29 AMS layouts are
> gate-rejected in seconds; 5 fonts that *declare* PREETI print raw ASCII with
> exit 0; and 2 genuine PREETI fonts (`deepankar`, `abhinav`) spell individual
> words wrong **at the glyph level while every automated check stays green** —
> correct class, clean round-trip, full cmap coverage, correct frame checks, wrong
> letters. So the list of fonts to actually use is
> [FONTS-VERIFIED.md](FONTS-VERIFIED.md), and `abhinav` is on its *failed* list.
> That is gotcha 38.

## Index

 1. **process.env in components is statically replaced at build time.**
 2. **Global /g regex + string slicing bug in parse-lrc**
 3. **Hand-timed LRCs have huge unstamped gaps**
 4. **remotion.config.js must not pin codec/ProRes profile**
 7. **Nepali `01 Fonts` (AMS/Ananda/Abhinav) are legacy ASCII-mapped fonts**
 8. **Random size is per WORD by default, never per letter.**
 9. **Measuring the shirorekha by top-of-glyph is invalid.**
10. **`--hardware-acceleration` is ignored whenever `--crf` is set.**
11. **Remotion's bundled ffmpeg is not system ffmpeg**
12. **CSS `transform` is one property — the last write wins.**
16. **Verify the finished video, not the stills you grabbed while building.**
18. **`gh repo create --source . --push` fails if the remote already exists**
22. **A module-level throw beats a subtly worse video**
24. **Do not let an error handler print advice that hides the error**
26. **A comparison has to isolate the one variable it is comparing**
28. **`Number(null)` IS `0`, NOT `NaN`**
29. **"WINS" AND "FLOOR" CANNOT BOTH BE TRUE, AND `Math.max()` IS THE FLOOR**
30. **A FEATURE THAT CAN BE WRONG MUST BE OFF BY DEFAULT, NOT ON**
31. **THE ENDS FILE HAS TO REACH THE COMPOSITION, NOT JUST THE REPORT**

---

## The full list

1. **process.env in components is statically replaced at build time.** An
   unset var becomes the literal string `"undefined"` (truthy!) — style props
   must arrive as composition PROPS. Only plain numbers are safe from env.
2. **Global /g regex + string slicing bug in parse-lrc**: a `TIME_RE.exec`
   loop kept `lastIndex` in the original string's coordinates, so every
   timestamp after the first was glued to the visible text and dropped.
   Current parser slices `rest` and re-matches an anchored regex per stamp.
3. **Hand-timed LRCs have huge unstamped gaps** (instrumentals). Cues are
   capped at HOLD_SECONDS (8s) so lines don't freeze on screen for a minute.
4. **remotion.config.js must not pin codec/ProRes profile** — the composition
   declares defaults and render.mjs passes per-mode flags; pinning globally
   breaks `--codec=h264` previews with a conflict error.
5. **The `--preview` length cap lives in `calculateMetadata`, not on the
   command line.** It used to be `--frames=0-<lastCue+2s>`, computed from a
   different number than the composition's own duration
   (`max(audio, lastCue)`), so on any song whose audio is shorter than its
   last cue plus 2s the range ran past the end and Remotion refused:
   *"durationInFrames ... 6257, but frame range 0-6259"*. Allare is exactly
   that case (417.0 s audio, 415.3 s last cue). One place now owns the
   length, via the `preview` prop. **Never reintroduce a `--frames` range
   for preview** — it will disagree again.
6. **`--legacy-font` needs `npttf2utf` installed, and without it the failure
   is a bare `FileNotFoundError` on `map.json`.** `scripts/layout_encoder.py`
   loads its five layouts from that file. `pip install npttf2utf` is not
   optional; every real render goes through it. Check with
   `py -c "import npttf2utf"`.
7. **Nepali `01 Fonts` (AMS/Ananda/Abhinav) are legacy ASCII-mapped fonts** —
   0 Devanagari codepoints, no GSUB/GPOS, so `--font "AMS Manthan"` alone does
   NOTHING: Chromium falls back per character. The working path is
   `--legacy-font <file>`, which transcodes the lyrics into the font's own key
   layout and registers the .ttf through FontFace.
   **But prefer a Unicode font.** `--font "Nirmala UI"` has none of these
   problems and needs nothing installed. Track B is only for a specific
   classic look, and it does not work for most lyrics: measured on two songs,
   **34 of 110 words** need a character (`्` virama, `ँ` candrabindu, `ञ`)
   that a generated layout cannot encode, and those characters reach the font
   unmapped so Chromium draws them in a *different* font — which is what makes
   a word look like it has a stray `0` or `O` in it.
   Never assume Abhinav's Preeti layout generalises: it is a property of the
   layout that `npttf2utf` covers, not of the renderer. See **docs/FONTS.md**
   and `scripts/passthrough.py`.
8. **Random size is per WORD by default, never per letter.** Devanagari's
   shirorekha (the headline bar) is continuous inside a word — two letters at
   different sizes snap it in half. Word boundaries are already gaps, so they
   are safe. The `--letter-var` layer can only reach **0.03** for exactly this
   reason; see "Per-letter animation and size" above for the measured table.
9. **Measuring the shirorekha by top-of-glyph is invalid.** Comparing the
   topmost lit row per column looks like it measures headline flatness, but
   Devanagari matras (`ि`, `ँ`, `ौ`) legitimately rise *above* the headline,
   so the metric reports "stepped" even at `--letter-var 0` where the bar is
   provably intact. It was used to produce a wrong conclusion here. Judge the
   headline by eye at 3× zoom, or measure a region with no matras.
10. **`--hardware-acceleration` is ignored whenever `--crf` is set.** Remotion
   prints `"crf" option is not supported with hardware acceleration` and
   encodes in software. The flag was on every render here until this was
   found; it did nothing on any hardware. Removed. It is also NVENC-only, so
   it would not help on AMD regardless.
11. **Remotion's bundled ffmpeg is not system ffmpeg** — no `rawvideo` muxer,
    no `signalstats`. Verification tricks against the bundled binary silently
    produce nothing. Use system ffmpeg to measure.
12. **CSS `transform` is one property — the last write wins.** In roam mode the
    entrance/exit animation (a `scale()` for glow) was applied to the same div
    carrying the position `translate(-50%,-50%)`, so the animation *replaced*
    the positioning and the block hung off the frame edge. Fixed by splitting
    them: outer div owns position, inner `inline-block` div owns the animation.
    Easy to reintroduce whenever a new style adds a transform.
13. **A randomized position needs a safe band derived from block size, not
    taste.** Roam centers a block on a seeded anchor with `maxWidth: 60vw`, so
    the anchor must sit within `[maxW/2, 100-maxW/2]` horizontally and
    `[maxH/2, 100-maxH/2]` vertically, or a full-width block clips. That is why
    the bands are **x 32–68 %, y 24–66 %** (`positionFor`). The first range
    (x 12–52 %, y 8–66 %) was chosen by eyeballing the reference and shipped a
    latent bug that only showed on one song: Ritu's long chorus lines lost
    100–145 px off the left edge, and a held two-line block pushed 1000+ px of
    glow through the top. Kali Kali had rendered "clean" purely because its seed
    got lucky.
14. **A `--no-audio` render with no `--length` ends where the last LYRIC ends,
    not where the song does.** The composition cannot probe an audio it does
    not have, so the length falls back to the last cue — and a `.lrc` records
    only when a line *begins*, so that end is an estimate from the next line.
    Measured: Kali Kali is 6:49.1 of audio, its last lyric ends at 5:47.5, and
    the render stopped at 5:49.5 — the overlay ended while the song was still
    playing. Pass `--length <seconds>` for every `--no-audio` render.
15. **A render that finishes is not a render that is correct — verify the
    file, not the exit code.** `--mode roam` dropped the `<Audio>` element
    entirely: the component's early return for roam had no `<Audio>`, only the
    centre path did. So *every* roam render came out **silent** while exiting
    0, printing `OK`, at the right length, the right size, with a
    plausible-looking picture. Nothing in the output says "no audio", and
    `--mode roam` is the recommended style, so this was the default path.

    Caught only by looking at the stream list:

    ```
    ffprobe -v error -show_entries stream=codec_type -of csv=p=0 out/x.mp4
    roam   -> 0,h264,video
    centre -> 0,h264,video
              1,aac,audio
    ```

    `scripts/check_output.py` does that plus the length and the black-plate
    check, and fails loudly:

    ```bash
    py scripts/check_output.py out/"<song>.mp4"
    py scripts/check_output.py --no-audio --audio-seconds 409.13 out/"<song>.mp4"
    ```

    It needs `pillow` for the background-purity sample. Run it before
    delivering anything. **Any new early return in a component has to carry
    every side element the other paths carry** — an `<Audio>`, a `<Sequence>`,
    a provider. That is the shape of this bug.
16. **Verify the finished video, not the stills you grabbed while building.**
    A latent edge-clip can survive every spot check. Scan the whole file for
    content in the outer rows/columns —
    `ffmpeg -i out/X.mp4 -vf "fps=1/6,cropdetect=limit=0.04" -f null -` finds
    every instance in seconds. Both songs rescanned 100 % clean after the
    anchor fix.
17. **A wrapped lyric block grows DOWNWARD from a fixed top, so it runs off
    the bottom of the frame — and `--mode horizontal` has to auto-fit.**
    Allare's longest cue is 50 characters; at `--size 128` in a 64vw band it
    wraps to three lines and the third is clipped off the bottom of the
    screen, silently. The renderer cannot measure text, so `fit()` estimates
    the wrap from character count and average Devanagari advance (~0.55em),
    then scales the line into a 34%-of-frame budget covering the current line
    and the outgoing one.

    **The estimate is only as good as its arithmetic, and a CSS string broke
    it silently.** `H_BAND.width` was `"64vw"`, so `width * (W_FRAME / 100)`
    was `NaN`; every comparison against `NaN` is false, the fit never fired,
    and the clipped line stayed clipped with no error. Geometry constants
    that participate in arithmetic are stored as **numbers**, with the unit
    added at the point of use.

    This is roam's clipping bug in a new place. Roam bounds its anchor
    (gotcha 13); horizontal bounds its block height. Neither can see the other.
18. **`gh repo create --source . --push` fails if the remote already exists**
    (`GraphQL: Name already exists`). Check `git remote -v` first and just
    push. Transient `Failed to connect to github.com:443` also happens here —
    retry.
19. **The ends file is found by NAME, so renaming one half of the pair is
    silent** (gotcha 19). `Song.remotion_start.lrc` looks for
    `Song.remotion_end.lrc`; a miss falls back to estimating every end, and
    a video whose lyrics linger for a median of 22s comes out of it. That
    used to **exit 0** while it happened; it now stops — gotcha 37 for why
    naming the path was not enough. This is
    not hypothetical: the first version of the lookup appended the end suffix
    without stripping the start infix, producing
    `Song.remotion_start.remotion_end.lrc`, missing the file that Song Timer
    actually writes.

    Two rules follow. Derive the end name by **stripping then appending** —
    `pairBase = base.replace(/[._-](?:remotion_)?start$/i, "")` — and require a
    separator before `start`, or a song called `Restart` becomes
    `Re.remotion_end.lrc`. And when a `.lrc` that is clearly half a pair has no
    partner, **name the path that was looked for** — "none found" alone is
    indistinguishable from never having tapped ends, and the two need
    different fixes — **and stop**. The naming is the diagnosis; the exit code
    is the gate (gotcha 37).

    `node scripts/check_pairing.mjs` asserts the whole matrix (new name, old
    name, mixed, `Restart`, missing partner, `--ends`) and fails if the pairing
    regresses. It asserts on the line the render *prints*, because that is the
    only thing that proves the ends reached the timeline.

20. **A width model is a guess until it is measured, and a plausible-looking
    wrong number is the worst outcome** (gotcha 20). The auto-fit has to decide
    a font size *before* anything renders, so it predicts a line's width. Three
    estimates were shipped and all three were wrong in the same direction --
    over-predicting, so the text was shrunk for a wrap that never happened:

    | Estimate | Nirmala UI | Error |
    |---|---|---|
    | `0.55em` per code point | — | A Preeti face is ~0.48em, so every legacy line lost ~28% of its size. |
    | mean of the font's `hmtx` advances | 0.7153em | Counts a pre-base matra as full width; shaping reorders `ि` into its consonant's cell, so the truth is ~0.33em per code point. Predicted **three** lines for a line the browser draws on **one**, and shrank it to 75%. |
    | mean over consonants only | 0.7480em | Still averages narrow spaces with wide consonants. |

    The fix is to measure the **browser**, not the font file: the browser is
    what does the shaping. `scripts/calibrate_width.mjs` renders sample lines
    through the same engine that will render the video, measures the ink with
    Pillow, and fits one coefficient per class. Three things to not re-learn:

    - **One sample per IMAGE.** The first version put all ten samples in one
      tall frame and scanned 220px bands. A Devanagari matra at 200px extends
      well outside its line box, so every band included its neighbours' ink --
      five digits "measured" 1782px. There is no band boundary to get wrong if
      there is only one line in the frame.
    - **Pass the sample as an INDEX, never as text.** A Devanagari string in
      Remotion `inputProps` came back empty. An empty frame measures as zero
      width rather than as an error, so the fit happily produced coefficients
      from nothing. The list goes in a GENERATED module, the way
      `lyrics.generated.js` does, and it has to be written **before** the
      bundle is built or the composition holds the previous run's list.
    - **Do NOT short-sample the fit.** A one-character sample measures wider per
      character than the same character in a run, because a lone glyph carries
      its full side bearing. Fitting on them biased every coefficient upward --
      reintroducing the original bug through the calibration. And report
      leave-one-out error, not in-sample: a 3-coefficient model always looks
      perfect on its own training data.

    Coefficients are constrained to `>= 0`. Two of them fitted *negative*
    (`conj` -0.077em, `matra` -0.108em) because those classes are collinear
    with `cons` -- a conjunct always replaces a consonant -- and the solve was
    free to make one negative to pay for the other. It predicted its own
    training set to 0.0% and was 43% out one line away. There is deliberately
    **no separate conjunct coefficient**: a conjunct is counted as one
    consonant, which costs ~9% on a pure-conjunct line and removes the
    degeneracy entirely.

    Current numbers on Allare: `cons 0.6287em`, `matra 0`, `space 0.4470em`;
    **2.0% leave-one-out on the lines that wrap, 0 of 12 wrap/no-wrap
    disagreements.** `matra` being 0 is correct, not a degenerate fit -- a
    pre-base matra really is free in this font.

21. **`classifyText()` must look FORWARD FROM THE CONSONANT, not from the
    virama** (gotcha 21). `क्ष` is ka + virama + ssa and draws as one glyph. The
    conjunct rule started at the virama, so the leading consonant was counted
    on its own and the virama then began a second count: `क्ष` came out as TWO
    consonants, exactly the error the rule exists to prevent, and a calibration
    passed with it in place. The cell belongs to the ka, so the ka is where the
    test starts.

    The class ranges are `\u` escapes on purpose. Written as literal Devanagari
    in a regex the boundaries are invisible in a diff — and "space" was once
    `U+0020..U+207F`, which **contains the whole Devanagari block**, so every
    character classified as a space, one column of the design matrix was ever
    non-zero, and the fit came back singular with a message blaming the samples.
    `scripts/check_width_model.mjs` asserts disjointness, that nothing
    width-carrying falls into `other`, and that `widthEm()` is monotonic.

23. **A legacy font whose layout VERIFIES is not a legacy font whose LYRICS
    survive** (gotcha 23). This is the distinction that matters and the one
    that is easiest to miss, because everything upstream of it looks healthy.

    > The full write-up, the tool, and the Allare measurement live in the **font
    > repo** at `nepali-legacy-fonts/docs/SONG-CHECK.md`. It is summarised here
    > because the failure happens during a render in *this* repo, and an agent
    > working here should not have to go looking to find out.

    `nepali-legacy-fonts` reports a font as *usable* when every key in its
    layout reaches a real glyph in its `.ttf`. That is a statement about the
    font. It says nothing about whether the song's words can be written in that
    font's keys — and for Allare they cannot:

    ```
    15 of 35 lines (43%) contain a character with no key
    U+094D virama       x14     U+0901 candrabindu  x13
    16 distinct words affected
    ```

    Measured on AMS Manthan, the one font the font repo calls *proven*. The
    converter says so itself, once per affected line:

    ```
    !! not round-trip exact: 'फर्केर' -> 'fker'
    !! not round-trip exact: 'हो.. खोला वारि म कहिले' -> 'hea.. Kaealaa vaair ma kihlae'
    ```

    `फर्केर` becomes `फरकर` on screen — a **different word** — and the reason is
    worth being precise about, because it looks like a missing diacritic and is
    not: the virama is the instruction that *fuses* a conjunct, so dropping it
    splits one character into two letters. The candrabindu is the gentler
    failure — `सँगै` → `संगै` changes the spelling, usually not the word.

    **All 79 GENERATED layouts fail this song**, confirmed across every layout
    rather than just the one: aNepali publishes neither character as a key, so
    no *generated* layout can contain them. No different generated layout helps.

    **CORRECTION, added later (gotcha 23, erratum). "All layouts" was too strong
    and it cost an hour of avoidable work.** The measurement above covers the
    layouts in `../nepali-legacy-fonts/layouts/`, which are all *generated*. It
    says nothing about `npttf2utf`'s **built-in Preeti map**, which has keys for
    both characters. So a font whose `sweep.json` class is **`PREETI`** — like
    **Abhinav** — *can* write Allare, and does:

    ```
    words round-tripped through Preeti      54 / 54
    distinct keys the song emits            45
    keys with no glyph in Abhinav.TTF       0   (cmap holds 180 codepoints)
    ```

    The correct statement of the failure is therefore **"Allare is unwritable
    in a GENERATED layout"**, not "in any legacy font". The deciding property is
    the font's `class`, not the fact that it is legacy — which is gotcha 34's
    point arriving from the other direction. Verified fonts and the procedure
    for checking a new one: **docs/FONTS-VERIFIED.md**.

    The render exits 0, the file is the right length, the plate is pure black,
    and `check_output.py` passes every check, because every check looks at the
    container, the timing or the pixels *behind* the text, and none of them look
    at the text.

    So before choosing a legacy font for a song, run the song check in the font
    repo — it exits non-zero, so it gates a render:

    ```
    py ..\nepali-legacy-fonts\scripts\check_song.py --font ams-manthan song.lrc
    ```

    A **Unicode font has no equivalent failure**: nothing is transcoded, so
    there is no layout that can be wrong. That is the whole argument for **Tier
    A** — the 58 Unicode faces — when anyone asks for a font that works without
    issue, and why "zero transcoding" beats "a nicer typeface" when the letters
    have to be right.

    Note also that a legacy font needs a different width model: the text handed
    to it is ASCII key sequences, so every character classifies as `space` and
    the per-class model collapses. It gets one measured number instead —
    `per code point` — see `widthEm()` in src/width-model.mjs.

25. **A calibration that measures the wrong font is worse than none, and it
    looks exactly like a good one** (gotcha 25). `WidthCalib` did not register
    the `--font-file` face, because the registration lived at the top of
    `LyricOverlay.jsx` and the calibration renders a *different composition* that
    does not import it. The stack fell through to Nirmala UI.

    The tell was in the numbers, and it was only noticed by looking:
    **Yantramanav Black came out bit-identical to Nirmala UI** — `cons 0.6287,
    matra 0, space 0.4470` for both, to four decimals. Two different typefaces
    cannot have the same measured advance.

    So:
    - every composition that draws text registers the font it was asked for;
    - the calibration **verifies** the face after preparing it, by reading the
      family name back out of `src/lyrics.generated.js` and failing if it is not
      the one asked for;
    - and the render log prints which table it used, with the coefficients, so a
      duplicate is visible without reading the JSON.

    The general rule: a measurement step that cannot report *what it measured* is
    a measurement step you have to take on faith, and this project has already
    been bitten three ways by that — a file that was never written, a font that
    was never loaded, and a layout that verified its own keys instead of the
    song's words.

26. **A comparison has to isolate the one variable it is comparing**
    (gotcha 26). The first contact sheet rendered the fifteen candidate faces
    exactly as a video render does: karaoke word animation, per-letter pop, a
    60px glow. Every row came out as a featureless white blob — the shirorekha
    bars of adjacent glyphs merged through the glow and the heavy display
    weights filled what was left. Fifteen different fonts, none of them
    comparable.

    `scripts/contact_sheet.mjs` now uses no word animation, no per-letter
    animation, a tight shadow and a size chosen to sit in the band. Same lesson
    as the width model: the point of a sheet is to see the one thing, so nothing
    else may be in it.

22. **A module-level throw beats a subtly worse video** (gotcha 22). `mix.js`
    asserts at import time that its presentation list alternates placements,
    including last-to-first, because the deck depends on it. Adding a ninth
    presentation with a repeated placement would otherwise produce a plan that
    stutters at every cycle seam with no error.

    Related, and found the hard way: the first version picked presentations
    with a **strided walk** and nudged colliding neighbours forward. That fixed
    the local stutter and broke the global guarantee -- the nudged slot was then
    never dealt, so `r-word` and `c-word` were missing from the entire 109-cue
    video with no error and no visible cause. A **shuffled deck** gives coverage
    and no-stutter by construction instead of by repair.

24. **Do not let an error handler print advice that hides the error**
    (gotcha 24). The `--mix-plan` catch block printed "the eight presentations
    are: ..." under whatever went wrong. For several turns that buried a real
    `Cannot access 'seed' before initialization` -- a temporal dead zone from
    moving the block above where `seed` is declared -- under a paragraph about
    presentation names, so the symptom looked like a bad `--mix-plan` and the
    fix looked like editing the plan.

    Two rules from that. An error handler must **print the error first and
    unconditionally**; advice goes after it and only when it applies. And
    anything referenced from a `catch` has to be declared **outside** the
    `try`: a `const` in the `try` is in its temporal dead zone in the `catch`,
    so the handler throws a `ReferenceError` while reporting the original
    problem.

27. **A GITIGNORED FILE AT THE TOP OF THE IMPORT GRAPH BREAKS EVERY RENDER ON
    A FRESH CLONE** (found by the first lyric-studio render, on a machine
    where the file was missing). `src/WidthCalib.jsx` imports
    `src/calib-samples.generated.js` at module level — the calibration has to
    render sample lines as bare text — and that module is generated by
    `scripts/calibrate_width.mjs`, so it is in `.gitignore`. The first render
    after `git clone` therefore died in webpack with four lines naming
    `.jsx` / `.mjs` / `.cjs` / "as directory" aliases, none of which is the
    actual cause. It never happened on the machine that built this, because
    that machine had run a calibration and the file was always there.
    `ensureCalibSamples()` in render.mjs now writes a default **before**
    bundling, from the same `SAMPLES` in `src/width-model.mjs` the calibrator
    uses — not by un-ignoring the file (it genuinely is derived data) and not
    by hard-coding a list here (that would be a second copy, which is the
    vendored-copy mistake in a new dress). Asserted by
    `scripts/check_flag_defaults.mjs`.

28. **`Number(null)` IS `0`, NOT `NaN`** — so an absent numeric flag read as
    `Number(flag("--x"))` yields 0, and `Number.isFinite(0)` is **true**, which
    means "flag not given → use my default" never fires. The flag silently
    takes its own minimum. Two live examples, both found by reading a render
    log:

    - `--beat-tol` absent → 0 → which **disables** beat snapping entirely. The
      beats file was read, validated, counted and printed ("64 beats, snap tol
      0.4s" — the *default*, not the value in props) and then thrown away by
      `anchorsForCue`. The log even announced a feature that was not running.
    - `--size-var` absent → 0 → per-word size variation silently **off**,
      while this file and the README both document 0.15 as the default.

    Numeric flags are read through `numFlag()`, which returns `NaN` for
    absent and a real number otherwise, so `0` stays available as an explicit
    value and every documented default actually applies. Asserted by
    `scripts/check_flag_defaults.mjs`, which also greps render.mjs so a
    reintroduced `Number(flag(...))` fails the test rather than the render.
    The same trap already exists in gotcha 1's family: an unset env var is the
    *string* `"undefined"`, which is truthy.

29. **"WINS" AND "FLOOR" CANNOT BOTH BE TRUE, AND `Math.max()` IS THE FLOOR**
    (found by `critique.py` on the first end-to-end run, which is exactly what
    it is for). The length resolver read "an explicit duration from render.mjs
    **wins**. … It is also the floor that keeps a slightly long clip" and
    implemented the second half: `max(seconds, tail, AUDIO_SECONDS)`, where
    `seconds` is `FALLBACK_SECONDS = max(30, tail + 2)`. So `--no-audio
    --length 32` on a song whose last lyric ends at 32.0 s produced **34 s**:
    the fallback's own 2 s safety margin beat the explicit length. The margin
    exists so a clip never *cuts* the last line — a caller who states the
    length has stated it, and protecting a number that is being replaced is
    not a safety margin. Now: the explicit value is used when it still covers
    `tail`, and the max applies otherwise, with critique.py's symmetric
    duration check reporting the disagreement rather than hiding it. Note the
    direction is named in that check: too short = lyrics cut off (gotcha 14),
    too long = the clip lingers or a stated length was overridden.

    The general lesson, and the third time this repo has paid it (a file never
    written, a font never loaded, a layout that verified its own keys instead
    of the song's words): **when a comment and a line of code disagree about
    which of them wins, the code is the behaviour and the comment is a
    promise nobody kept.** Resolve it in favour of the caller, and make the
    verification asymmetric enough that it notices.

30. **A FEATURE THAT CAN BE WRONG MUST BE OFF BY DEFAULT, NOT ON** (gotcha 30,
    found by running the pipeline on the first real song). Beat sync shipped
    "on unless you pass `--no-beats`", and on Allare it was actively harmful:

    ```
    detected bpm          123.05   (true tempo: 120)
    confidence, forced    120 -> 2.59    123 -> 2.64    60 -> 2.79
    inter-beat sd         0.0696 s on a 0.4874 s mean  (14% jitter)
    median cue-to-beat    0.143 s;  13/35 cues within 0.1 s
    same, at the TRUE 120 median 0.159 s  -- no better
    ```

    Three separate things are wrong there, and the last one is the real reason
    to distrust the whole feature on this song:

    - **123.05 vs 120 is 2.5%, and that accumulates.** A beat grid that is
      0.0124 s long accumulates to ~10 s of drift over a 7-minute song. The
      last word would be snapped to a beat 10 seconds from where the beat is.
    - **The confidence number does not discriminate.** Forced 120 and forced 60
      score within 0.2 of each other, so a comb filter reporting 123 has not
      demonstrated anything about 123.
    - **Even at the true tempo the grid does not fit the lyrics** (0.159 s
      median, worse than the wrong one). Allare's vocal is phrased against the
      melody, not a metronome, so cue starts do not sit on the click. A perfect
      beat grid still cannot be the authority on when a word is sung.

    Which is why `beatTol` quantizes rather than retimes (see src/beats.js) and
    why the `.lrc` stays the ground truth. But quantization bounds the damage
    only if the grid is *trustworthy*, and nothing checked that. So now:

    - `detect_beats.py` writes `"usable": false` below `--min-confidence`
      (default 3.0; the synthetic click track scores 5.04, Allare 2.64) and
      prints why, in the terms of the failure;
    - `make_video.mjs` does not pass on a grid the detector marked unusable, so
      the safe behaviour needs no flag;
    - `--bpm <tempo>` is how you OVERRIDE it, for a song whose tempo you know.
      Forcing 120 on Allare is one flag and produces a grid aligned to the song.

    The lesson generalises past beats: every optional enhancement in this
    pipeline that consumes a *measurement* of something outside the `.lrc` must
    carry its own evidence threshold, because a plausible-looking wrong number
    is the failure mode this repository has now paid for in four different
    places (gotchas 20, 25, 28, 30).

31. **THE ENDS FILE HAS TO REACH THE COMPOSITION, NOT JUST THE REPORT**
    (gotcha 31, found because the user watched the video and said "some words
    don't end even after their end timing ended").

    This is the fifth time this repo has paid the same bill, and it is worth
    stating as a rule: **a data channel that exists in the CLI and is consumed
    by the report has not been delivered to the thing that is actually
    rendered.** Only wiring it into the log is not wiring it in.

    What happened. `render.mjs` read `Allare Remotion.ends.txt`, matched 109/109
    cues and printed:

    ```
    ends : 109/109 timed from Allare Remotion.ends.txt (100%)  [10 clamped]
    ```

    That was all true. But `writeGenerated()` passed only `LRC_TEXT` into
    `src/lyrics.generated.js`, and `Root.jsx` called `parseLrc(LRC_TEXT)` — no
    ends. So **the composition re-derived every end from the next line's start**,
    and every line stayed on screen until the *following* line arrived rather
    than stopping when the singer stopped. Measured on the shipped file:

    ```
    11 of the first 12 cues still had ink 0.15 s past their own tapped end
    cue 1   reported end 98.61 (timed)     vs rendered 99.05 (estimated)
    ```

    Two parses of the same file disagreed, and the one that was printed was not
    the one that was rendered. Nothing compared them, so nothing errored, the
    critique passed every check, and the file was 6.4 MB of correct video with
    the timings quietly wrong throughout. Same shape as gotcha 25 (a calibration
    that measured a font the render never loaded) and gotcha 14 (a length the
    composition never saw).

    Two lessons, and the second one is the one that actually generalises:

    - **A report is not a delivery.** If a fact has to be in the video, the
      channel into the video is the thing to assert. `scripts/check_ends_wire.mjs`
      now checks all four links: render.mjs emits `ENDS_TEXT`; every
      `writeGenerated()` call site passes it; `Root.jsx` parses with it (and no
      bare `parseLrc(LRC_TEXT)` survives); and the module on disk parses to the
      same ends as the source. It deliberately compares the *generated module*
      against the *source files* — comparing a parse to the same parse proves
      nothing, which is the mistake that made the first version of this test
      pass while the bug was still live.
    - **A check that cannot fail is not a check.** `critique.py` sampled cue
      MIDPOINTS — "is there text when a line should be there" — and had no
      equivalent for "is the text GONE when it should be gone". So the one
      question the user was actually asking was never asked by anything.
      `scripts/lingering.py` asks it, over every cue, and it found this bug in
      about a minute. The gap was not the parser; it was that the test suite had
      a shape that made the failure invisible.

32. **A MEASUREMENT TOOL THAT REPORTS A DIFFERENT SAMPLE THAN IT MEASURED
    INVENTS BUGS, AND THEN THE FIX STARTS WITH THE TOOL** (found while chasing
    gotcha 31, and it cost more time than the bug did).

    Fixing lingering text made `lingering.py` report 2 remaining offenders. Both
    were false positives, and neither was the render's fault:

    - **It sampled a time, but read a frame.** A video has no frame at an
      arbitrary timestamp. At 15 fps the grid is 67 ms apart, so a request for
      t=237.47 s is served with the frame at t=237.5333 s — which on Allare is
      already the *next* line's first frame. The tool guarded the *requested*
      time against the next line's start while being *handed* a later frame.
    - **Worse, float rounding decided it.** A sample at t=219.2667 s landed on
      a frame boundary, and the comparison went the wrong way by 3e-5, so a line
      whose opacity was provably `0.0000` was reported as still lit.
    - **The first version was also wrong twice more**: it counted the *next*
      line's entrance as the previous line lingering (11 of 12 "offenders" on the
      broken file included 2 that were never a problem at all), and it reported
      a three-decimal `lit fraction` with no idea of what the number meant.

    What fixed it was not a tolerance; it was making the measurement
    unambiguous. Samples are specified as a **frame index**, converted to a seek
    time half a frame inside it, and the next line's first **frame** is what
    bounds the window. There is no boundary case left to round the wrong way.

    The general rule, and this repo's fifth and sixth instances of it: **when a
    check reports a bug, first prove the bug is in the product.** A measuring
    instrument that is approximate, unspecified or boundary-riddled will
    manufacture failures that are indistinguishable from real ones — and the
    instinct to "fix" those is how a correct renderer gets broken. Concretely:
    say what the number means, make the sample unambiguous, and confirm the
    finding against an independent source (`scripts/_probe40.mjs`-style: print
    the opacity the renderer computes for that exact frame) **before** changing
    render code. Here the render was right three times in a row and the tool was
    wrong twice.

33. **A MOTION THAT CAN DISPLACE TEXT MUST BE OFF BY DEFAULT, AND EVERY
    ANIMATION MUST FINISH INSIDE THE CUE'S OWN END** (gotcha 33, from the
    `--motion` feature).

    `--motion off|calm|vivid|wild` gives each line one of 21 choreographies
    (springs with real overshoot, arcs, rotations, wipes, blur, glow, per-word
    stagger) from a seeded deck, so no two neighbouring lines share a motion and
    no two cues are *identical* even when they share an id — each cue gets its
    own seeded direction, distance, rotation, spring constants and glow.

    The design note worth keeping: **this is not the `motion` package
    (Framer Motion), on purpose.** Framer Motion animates from wall-clock time
    and mount/unmount lifecycle; Remotion renders arbitrary frame indices out
    of order and must be able to re-render frame 7,000 as frame 7,000 tomorrow.
    Ask Framer Motion for frame 7,000 first and it draws frame 0's pose, and
    `AnimatePresence`'s exit animation can never fire in a renderer that jumps
    to arbitrary frames. So the vocabulary is rebuilt on the frame clock, which
    also preserves the "seeded, byte-identical re-render" rule the whole repo
    depends on. See the header of `src/motion.js`.

    Two rules fell out of building it, both enforced by
    `scripts/check_motion.mjs`:

    - **Durations are fractions of the cue's own span, then capped** —
      `enter = min(0.55s, span*0.42)`, `exit = min(0.30s, span*0.28)`, so
      `enter + exit <= 0.70 * span` always. A 0.28 s interjection and a 2.6 s
      chorus line both animate fully inside their own time and neither can
      outlive the word it belongs to. This is gotcha 31's contract extended to
      animation: a line must be *finished* at its end, not merely on screen.
    - **Travel is clamped to the placement's real margin**, computed per cue from
      the geometry, not a taste constant. Roam is the placement that can
      genuinely run out of room (a 60vw block centred on a seeded anchor), and
      when it does the travel collapses to ~0 and the motion degrades to
      scale/opacity/filter. This is gotchas 13 and 17 — both "text silently left
      the frame" — re-derived for a new mechanism, because a transform is
      exactly as capable of doing that as a bad anchor is.

    The first build also had the same bug class as everything above it, which is
    the seventh time and the reason this entry exists: a motion that set no
    opacity of its own defaulted to **full opacity on its first frame**, so lines
    popped in instead of fading in. `lingering.py` found it, by reporting the
    *next* line's first frame as the previous line lingering. So every motion is
    now wrapped in a multiplicative `fadeIn * fadeOut` envelope, and two checks
    exist because one was not enough: a line's first frame must be invisible, and
    opacity must not dip during its entrance (a spring's own overshoot is
    allowed; a strobe is not).

34. **LEGACY FONT CLASS DECIDES CORRECTNESS — CHECK sweep.json BEFORE
    RENDERING.** The first motion render of Allare shipped broken glyphs
    because AMS Cinema was fed Preeti key sequences: its sweep.json class is
    GENERATED (mapping "ams", "dropped 3 slot(s)"), not PREETI, so every
    divergent slot rendered the wrong glyph — and Allare's extension marks
    (`..`, `==`, `=:` in almost every line) hit exactly those slots. The
    user caught it in seconds; no gate did, because glyph identity is
    explicitly outside critique.py's reach and the `--prepare-only` still
    was not inspected. AMS Manthan had worked on two songs by slot
    agreement, which was luck, not evidence. Rule: **PREETI class -> plain
    `--legacy-font` is safe; GENERATED class -> use `--font-slug` (layout +
    hard gate) or verify a punctuation-heavy cue's still at full resolution
    before rendering.** Full story: docs/MOTIONS.md.

35. **ROUND-TRIP SUCCESS IS NOT GLYPH CORRECTNESS — THE PREETI LIBRARY
    CONVERTER MUST ENCODE, NOT JUST VERIFY.** All five delivered Allare
    fonts drew जाउू for जाऊ and हेो for हो, and every automated check was
    green: layout_encoder decomposes (ऊ -> उू, ो -> ेा), the map.json
    decoder accepts both matra orders, so keys it generated round-trip
    perfectly through its own table while real fonts drew the parts as
    separate glyphs. Worse, the predecessor's own `_legacy-*.lrc` files
    used the SAME decomposed keys — the old .mov shipped the same bugs,
    reading as correct only because Chromium shaped the hook faintly.
    Symmetric verification can never catch a table that disagrees with the
    font; only looking at pixels can. Fix (3825634): npttf2utf's
    preetimapper — what Preeti typists actually type, the sequences the
    fonts were DRAWN for — now encodes first for Preeti (`hfpm` for जाऊ,
    `f]` for ो, `k|` for प्र, `km` for फ), the table encoder is fallback
    only, and trailing dots key as '=' (period glyph) not '.' (danda slot).
    Rule: **Preeti encoding = library converter first; a homebrew candidate
    generator may never be the primary encoder for a layout the library
    knows. And for any new layout, diff its keys for one song against the
    Preeti library output before trusting it.**

36. **ARCHIVED: the deleted knowledge repo lives in
    `docs/knowledge-repo-archive/`** (verbatim at its last commit 3f485cb,
    with a provenance README). GitHub repo
    Lyric-Video-Generator-By-Remotion-AI-Engine was deleted upstream
    2026-09-30; local clone `C:/Users/o0o/tools/lyric-video-generator`
    remains as a git fossil but is no longer the reference. Cite the
    archive, not the clone.
38. **RECOMMEND FONTS ONLY FROM `docs/FONTS-VERIFIED.md` — the song-tested,
    human-verified list.** Gates cannot certify a font: all 29 AMS layouts
    lack candrabindu+virama (gate-rejected in seconds on Allare), 5 fonts
    that *declare* PREETI print raw ASCII with exit 0 (0012-arap, 0017-arap,
    ananda-fanko-2, arap-010, ganga-1 — caught by pixel test, not by any
    gate), and 2 genuine PREETI fonts (deepankar, abhinav) spell individual
    words wrong at the glyph level while every automated check stays green.
    7 of the 42 handpicked preferred fonts survived a full render + human
    eye-check of the same song (2026-09-30): arap007, cv-haha, mkali,
    pawang (PREETI, `--legacy-font`); arya, kalam, rajdhani (UNICODE,
    `--font-file`). Four more working legacy fonts are NOT on the handpicked
    list — ananda-lipi-bold-bt, himalayabold, shreenath-bold, katmandu (the
    original five minus abhinav) — nor is yantramanav (the Unicode default).
    The font repo's `docs/RENDER-TESTED.md` mirrors this list.

37. **A FALLBACK THAT PRODUCES A PLAUSIBLE WRONG DELIVERABLE IS A FAILURE,
    NOT A DEFAULT** (gotcha 37 — the other half of gotcha 19, and the
    seventh time this repo has paid the same bill).

    Gotcha 19 was "fixed" once. The lookup was corrected, and then the report
    was taught to name the exact paths it had looked for:

    ```
    ends       : none found, estimating from the next line
                 looked for Song.remotion_end.lrc and Song.ends.txt beside the .lrc
    ```

    That is a good message, and it changed nothing. The render still exited
    **0** and still produced a video. An estimated end is the NEXT line's
    start, so a line sung before an instrumental sits on screen for a median
    of 22 s on Allare — a wrong file that looks right, at full length, with
    the only evidence in a line that prints once between the cue list and a
    four-minute encode and then scrolls away. No script could see it either,
    because the exit code said everything was fine.

    So the report was never the gate. It was the diagnosis, arriving after the
    decision. A missing ends file now **stops** the render:

    ```
      ends       : NONE -- every line would be ESTIMATED from the next
                   line's start instead of using your tapped ends.
                   looked for Song.remotion_end.lrc and Song.ends.txt beside the .lrc

      Re-export both halves from Song Timer, point --ends at the
      file, or pass --allow-missing-ends to render with the
      estimates anyway.
    ```

    `process.exitCode = 1` is the part that matters, because it is the part a
    script can act on and the part `make_video.mjs` inherits. Two smaller
    fixes came with it. `--ends` pointing at a path that does not exist is
    reported as *that* — a typo in a long path is invisible in a message that
    only lists what it looked for beside the `.lrc` — and a file that is there
    but unreadable says so instead of being lumped in with "not found".

    **`--allow-missing-ends` is the opt-out, so proceeding is always one flag
    away and never the default.** Three tools pass it deliberately:
    `calibrate_width.mjs`, `contact_sheet.mjs` and `gpu_probe.py` all hand
    `render.mjs` a `.lrc` as a vehicle for *words*, not for timing. A gate
    that cannot tell the difference between "this render's timing is the
    deliverable" and "this `.lrc` is carrying lyrics into a width
    measurement" is a gate that gets disabled everywhere — which is exactly
    how gotcha 30's beat sync ended up announcing itself in the log while
    doing nothing.

    The general rule, stated once: **every "it is fine to continue without X"
    branch in this pipeline is a decision the operator makes out loud.** A
    default that yields a plausible artifact is worse than an error, because
    the error would have been found.

