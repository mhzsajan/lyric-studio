# Animations — what we built, what works, what to use when

All animation is a **pure function of the frame**: `cueStyle(style, p, q, j)`
where `p` = progress through the entrance (0..1), `q` = progress through the
exit, `j` = a deterministic jitter value per cue. No randomness anywhere that
isn't seeded — a re-render of the same song must be byte-identical, because
the video has to keep matching the live show file forever.

```js
const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);   // cubic
const easeIn  = (t) => Math.pow(clamp01(t), 3);
const ENTER = 0.34;  // seconds
const EXIT  = 0.28;
```

Opacity is `min(inEase, outEase)` so a line can be entering and exiting at
once (fast lyrics) without flicker.

## The catalog (all implemented in src/animations.js + LyricOverlay.jsx)

| Style | Entrance | Exit feel | Use for |
|---|---|---|---|
| `fade` | opacity only | gentle | The safe default; ballads, emotional lines. |
| `rise` | translateY 44px → 0 + fade | line drifts up | Versatile workhorse; reads "current" without shouting. |
| `pop` | scale 0.86 → 1 + fade | snappy | Short punchy lines, beats ("आहा.."). |
| `slide-left` / `slide-right` | translateX ±(90+j·50)px + fade | directional | Alternate directions across sections; jitter varies distance so repeats don't look cloned. |
| `typewriter` | `clip-path: inset(0 X% 0 0)` wipe L→R | reveals then cuts | Spoken-word feel; good for slow, short lines. |
| `blur-in` | blur (10+j·8)px → 0 + tiny scale | dreamy | Atmospheric/ambient passages ("हावा सँगै"). |
| `zoom-through` | scale 1.18 → 1 + opacity 0.65 → 1 | camera-like | Big chorus entries; strongest of the set. |

Plus a persistent "previous line" treatment: the outgoing line shrinks to
62% size and drifts up, fading — this gives continuity without a karaoke
highlight, and it is what makes fast sections legible.

## Which to actually use

- **Default: mix** (`--style` omitted). `styleFor(seed, cueIndex)` rotates
  through the catalog deterministically per line. This is what shipped for
  Allare and it reads well across a 7-minute song — repetition would be
  noticeable with any single style.
- **Pin one style** (`--style rise`) when: the song is a ballad (fade/rise),
  the video must feel "calm" on camera (fade), or you're testing timings and
  want zero visual variables.
- **Do not** use `typewriter` on lines shorter than ~8 characters — the wipe
  is unreadable. `zoom-through` every line gets exhausting by minute 3.
- Entrance ≤ 0.35s. Lyric videos live or die on the text being there *when
  sung*; anything slower lags the vocal. Exits can be slightly faster than
  entrances.

## Seeding

`styleFor(seed, index)` hashes the seed (song title by default) + cue index to
pick the style and jitter. Change `--seed` to change the *look* without
touching timings. Same seed + same LRC = same video, always — this is a
hard requirement for live use and worth preserving in any reimplementation.

## The "random places" style (reverse-engineered from the reference video)

The user's favourite reference (`ritu-whisper.mp4`, h264 1080p30) places each
line at a **different position** — not a fixed slot. Measured by 3x3-zone
brightness analysis of frames at 9 timestamps:

- t=130/150s: text upper-center, AND the previous line still visible,
  faded, at a different spot (left side)
- t=178s: top-left; t=220s: spread across upper half; t=270s: dead center
- the bottom third of the frame is never used

Implemented as **`--mode roam`**:
- `positionFor(seed, cueIndex)` → deterministic (x, y) per line: x = 12–52%
  from left, y = 8–66% from top (upper-2/3 bias, seeded, reproducible)
- the outgoing line **fades in place** at its own position instead of
  drifting to a fixed slot — old and new text briefly coexist at different
  locations, which is the signature of the reference look
- paired with the **`glow` style**: white core + soft bloom via layered
  text-shadow (`0 0 18px rgba(255,255,255,0.95), 0 0 60px …0.55`), tiny
  scale settle 1.04 → 1.0
- Roam caps text width (60vw) and centers each block on its (x, y).

Frame-rate finding: the reference is **30fps**, and 30fps is now the mp4
default (`--fps=60` optional for high-quality animation). FPS travels via
composition props — see bugs doc for why the CLI `--fps` flag must not be
used.

## What we'd try next

- Per-cue style override in the LRC (e.g. `[00:12.3]{zoom}line`) for
  hand-tuning chorus moments.
- A subtle scale "breathe" (0.995→1.005) on long-held lines so 6–8s holds
  don't feel frozen.
- Position drift per section (center for verses, slightly higher for
  choruses) — but never animate position mid-line.
