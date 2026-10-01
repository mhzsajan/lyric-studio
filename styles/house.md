# House style — the "Look" contract

Prose companion to `styles/default.json`. The profile is what the renderer
reads; this file is why it says what it says. A new profile should be a new
JSON file plus a section here, not an edit of the defaults: two songs sharing
a look must share a file, so the look has one name and one definition.

## Rules

1. **The lyric is the picture.** Everything else — background, pulse,
   particles — sits at most one step above "barely noticeable". If a viewer
   watches the background instead of reading the line, the profile is wrong.
2. **Banned, as generic AI-video tells:**
   - purple/indigo gradient washes on black
   - rainbow or hue-cycling text
   - text with more than one family on screen at a time
   - lens flares, bokeh overlays, film-grain stickers
   - bounce/elastic motion on the lyric itself (the overlay's measured
     ENTER/EXIT curves are the motion grammar; ease-out in, ease-in out)
3. **Deep ink, not pure black, in styled mode** (`#0a0a12` class colours).
   Pure black stays the rule for **overlay mode only**, where the plate is
   keyed away by Add/Screen blend and any lift leaves a grey rectangle over
   the camera feed.
4. **Warm metal + one cool contrast.** The default palette is gold
   (`accent1`) and rose (`accent2`) over ink, with a warm-white glow. One
   accent may dominate a song's profile; two shouting is a circus.
5. **White halo on every line.** REFERENCE.md measured this as the thing
   separating the target look from a plain lyric video: styled mode defaults
   `shadow` to a white bloom plus a small dark core for legibility over
   bright pools. Overlay mode keeps the dark halo (it is keyed, not watched).
6. **Motion is slow where it is ambient, sharp where it is the lyric.**
   Background pools cross the frame in minutes (ω ≈ 0.02–0.07 rev/s);
   gradient angle turns 1.5°/s; word entrances stay at the overlay's 0.34s.
   Nothing ambient may move faster than the lyric's own entrance, or the
   hierarchy inverts.
7. **The beat pulse is felt, not seen.** Amplitude ≤ 0.05 by default
   (profile cap 0.25), exponential decay at 5/s. It exists so a chorus hit
   lands in the body; if you can point at it, it is too big.
8. **Seeded or it does not exist.** Every ambient choice (pool phases,
   particle field, gradient start angle) derives from the song seed through
   `seededRandom`. Re-rendering the same song is byte-identical — the show
   file depends on it.

## Typography

- **Four Unicode faces only** for this work: `arya`, `kalam`, `yantramanav`,
  `rajdhani`. The **Preeti legacy fonts are excluded outright** — they carry
  **zero Devanagari cmap**, so nothing can prove they draw the right *shape*; a
  font gate can only prove that *something* was drawn. Face is a per-song choice
  in `scripts/render_all.mjs`, not a global.
- Size **105** for 1080p (`--size-preset medium`, which is 105 / 0.08 / 0.05).
  REFERENCE.md's 128 is the styled-mode number; the overlay is keyed and must stay
  out of the way of the camera feed.
- `LINE_HEIGHT` is **1.55**, and it is **one constant**. It was the literal `1.32`
  in five places, two of which decide whether a line may be the size it asked for
  — so a disagreement between the copies presents as random shrinkage rather than
  as a layout bug. 1.32 is shorter than the faces are tall (1.6–1.8em, above-matra
  down to a ु), so glyphs overflowed their own box and the crop landed on the
  descender.
- Per-word size variation ON (`--size-mode word`), with a **hard floor of
  `MIN_FRACTION = 0.78`** — "never shrink the type too low" is enforced here, not
  by eye. Per-letter size is asked for at **`--letter-var 0.12`**, the full
  `LETTER_SIZE_CAP`. It was 0.03 for most of the file's life, which silently made
  every larger value byte-identical to 0.03. **The shirorekha takes a visible
  notch at 0.12 and that is the trade**; 0.06 is the value to drop to if it reads
  as damage rather than as character.

## Where the type sits, and why

**Upper-mid: 30/40/50 of frame height, `MAX_BOTTOM = 0.72`, `SIDE_SAFE_VW = 4` on
both edges.** The material plays on a **stage screen that sits high**, so the bottom
of the frame is where the audience cannot see and the top is lost to whatever is
above the screen. The usable area is a band, not an edge — and all three limits
exist because one alone did not hold: raising the start let a many-row line grow
straight back out, and a band's `left` may legitimately be 0vw.

`--x-pos` is **off**. It moved a settled line sideways between cues, which with the
motion layers already on read as jitter rather than as variety.

## Colour

- **Red family, warm ramp** (`--color-scheme warm`): ten steps from GOLD
  `#FFC300` through ORANGE `#FF8A00` and RED `#F01A00` to CARMINE `#B00040`.
- **Mostly white.** `--color-accent 0.12` — about **one word in eight** is
  coloured. A coloured word in a one-syllable lyric is a coloured *line*.
- The coloured unit is a **run of two or three consecutive syllables**, not a word
  and never a phrase. A *run*, because a syllable is what the shirorekha is drawn
  across — two non-adjacent syllables in one word puts two colours inside one
  headline.
- `--color-mode calm`. `vivid` and above step hue **across** a word, letter by
  letter, which is the "fading" that was rejected by name.
- `LUMA_FLOOR = 0.20` is a **guard against a colour that would disappear**, not a
  target to solve lightness from. Red is already 255 in its own channel and carries
  0.2126 of the luminance budget, so the only lever for "brighter" is
  desaturation — which is what "fading colours" means. The accent states a
  saturation and a lightness directly.
- **The title word is highlighted every time it appears** — colour, a `textShadow`
  glow, a per-word size bump. Exact whole-word match, punctuation stripped, and
  **no `filter` and no `transform`**, because every bug this project lost a day to
  was a per-*syllable* transform detaching a matra. An effect that only adds
  **paint** cannot reintroduce it.

## Structure

- Head title card and tail card ON in styled mode (from the `.lrc`'s
  `[ti:]`/`[ar:]`, windowed by `src/opener.js` — derived from the song's own
  first lyric, never hand-set).
- `--mode mix --mix-block 8` is the house placement plan; a whole song in one
  placement is monotonous by measurement (109 cues of horizontal = legible
  and dead).
- Word animation: karaoke. Letter animation: pop at the full 0.12 cap.
- `--cut word` is ON — the newspaper look, every word a clipping. The tear bar's
  height is **`descent − inkBottom` measured per font**, not a constant: that
  space varies 79× across this batch's faces, and a fixed `0.34em` bar drew a
  bright edge across the bottom of every letter in ten of the eleven fonts.
- **`--type` is OFF**, deliberately. A typing reveal clips each syllable, so
  mid-reveal a syllable is **half-drawn** — and a half-drawn Devanagari syllable is
  a *different letter*. On the one accented word in a line that is glaring. The
  other motion layers all still run.
