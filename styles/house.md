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

- Default face: **Yantramanav Black** via `--font-file` (the current pick
  from the contact sheet; Modak was rejected — too heavy at 128px).
- Nepali lyrics always ship through a **Tier A Unicode font**. Legacy fonts
  are a deliberate, gated exception (`--font-slug` + the font gate), never a
  default. See the font repo's README for the tier table.
- Size ~128 for 1080p (REFERENCE.md: the target's line height is 1.20–1.29×
  the old 104 default).
- Per-word size variation ON (`--size-mode word --size-var 0.15`), per-letter
  size capped at 0.03 — the shirorekha rule, measured, non-negotiable.

## Structure

- Head title card and tail card ON in styled mode (from the `.lrc`'s
  `[ti:]`/`[ar:]`, windowed by `src/opener.js` — derived from the song's own
  first lyric, never hand-set).
- `--mode mix --mix-block 8` is the house placement plan; a whole song in one
  placement is monotonous by measurement (109 cues of horizontal = legible
  and dead).
- Word animation: karaoke. Letter animation: pop at the 0.03 cap.
