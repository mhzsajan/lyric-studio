# Toolchain — why Remotion and how to implement it

## Requirements that shaped the choice

1. **True alpha channel** in the output (text-only overlay over a camera feed,
   no keying, no green screen).
2. **Programmatic timing** driven by an `.lrc` file — hundreds of cues, chorus
   repeats, frame-accurate, re-renderable and reproducible.
3. **Proper Devanagari rendering** (complex text shaping) — rules out every
   "simple text draw" approach.
4. Runs on Windows, from CLI, unattended.

## Alternatives considered and rejected

| Approach | Why rejected |
|---|---|
| ffmpeg `drawtext` per cue | drawtext does no complex shaping (Devanagari conjuncts/matras break); filters get insane with 100+ timed cues; animation is painful. |
| Python (PIL/Pycairo) frame painter | Same shaping problem — Pango helps but the whole render/encode/preview loop must be hand-built. |
| After Effects scripting | GUI-bound, licensing, not scriptable headless on CI; overkill per song. |
| HTML page + screen capture | No frame accuracy, no alpha. |
| **Remotion** | React components → frames via headless Chromium (full HarfBuzz shaping), first-class alpha (PNG frames + ProRes 4444), deterministic re-renders, CLI + Studio preview. |

## The recipe that works (verified end-to-end)

Project skeleton (`package.json` with `"type": "module"` is required, or every
`import` fails with "may appear only with sourceType: module"):

```jsonc
{
  "type": "module",
  "dependencies": {
    "@remotion/cli": "4.0.529",
    "@remotion/media-utils": "4.0.529",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "remotion": "4.0.529"
  }
}
```

Entry point:

```js
// src/index.js
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root.jsx";
registerRoot(RemotionRoot);
```

Composition — the parts that matter for alpha and duration:

```jsx
<Composition
  id="LyricOverlay"
  component={LyricOverlay}
  durationInFrames={Math.round(seconds * 60)}   // probed from audio
  fps={60}
  width={1920}
  height={1080}
  defaultCodec="prores"
  defaultProResProfile="4444"      // 4444 is what carries the alpha
  calculateMetadata={async ({ props }) => {
    // probe real audio length; clamp to >= last cue end + tail
    // return { durationInFrames, props: { ...props, cues } }
  }}
  defaultProps={{ cues, fontSize: 104, color: "#ffffff", position: "center",
                  shadow: "0 3px 18px rgba(0,0,0,0.55), 0 0 60px rgba(0,0,0,0.35)" }}
/>
```

The component itself: an `AbsoluteFill` with `backgroundColor: "transparent"`,
the active cue chosen as *the last cue whose `time` <= t*, entrance/exit
easing, and **no background anywhere**.

### Render commands (alpha-critical flags)

```bash
# FINAL — mp4 default: white-on-black for Add/Screen blend keying
npx remotion render src/index.js LyricOverlay out/Song.mp4 \
  --codec=h264 --crf=17 --pixel-format=yuv420p --image-format=jpeg

# FINAL — alpha variant for hosts that read the alpha channel directly
npx remotion render src/index.js LyricOverlay out/Song.mov \
  --codec=prores --prores-profile=4444 --pixel-format=yuva444p10le

# PREVIEW — fast, small, no alpha, capped to the lyric content
npx remotion render src/index.js LyricOverlay out/Song.mp4 \
  --scale=0.25 --fps=15 --codec=h264 --crf=30 --frames=0-<lastCueFrame>

# SINGLE STILL (note: output must be a DIRECTORY, Remotion appends .mp4/png)
npx remotion render src/index.js LyricOverlay out/stilldir \
  --frames=10480-10480 --image-format=png
```

`remotion.config.js`: set `setVideoImageFormat("png")` (JPEG has no alpha)
and `setChromiumOpenGlRenderer("angle")` on Windows. **Do not** pin codec or
ProRes profile there — per-mode CLI flags then conflict and the render dies
with "you have set a ProRes profile but the codec is h264".

### Why a wrapper script (render.mjs) instead of raw CLI

- Writes the LRC + audio name into a generated module the bundle imports
  (`src/lyrics.generated.js`, gitignored).
- Copies the audio into `public/` (where `staticFile()` resolves).
- Passes style knobs as **composition props** (`--props='{...}'`).
- Prints a human cue report with the exact same parser the component uses.
- `--report-only` mode for instant timing checks without any render.

### Audio in or out

- Default: `<Audio src={staticFile(AUDIO_FILE)} />` inside the composition →
  self-contained .mov that syncs against itself.
- `--no-audio`: skip the copy, write `AUDIO_FILE = ""`, pass `--muted` as
  belt-and-braces → **no audio stream in the container** (verified via
  ffprobe: exactly one stream).

### GPU vs CPU: what actually happens (measured on AMD RX 9060 XT 16GB)

Two separate stages, two separate answers:

1. **Browser rendering stage** — headless Chromium **disables the GPU by
   default** (remotion.dev/docs/gpu). The `--gl` flag picks the backend:
   `angle` (real GPU), `swiftshader` (software). Measured A/B on a
   text+shadow composition: **identical render time** (31s vs 31s per 1000
   frames at 1080p). Text/shadow content does not stress the GPU path; the
   GPU only pays off for WebGL/ThreeJS/blur-heavy content. Conclusion: not
   worth chasing for this pipeline — CPU parallelism across browser tabs is
   the real engine, and `--concurrency` beyond ~8 gained nothing on a
   20-thread CPU.
2. **Encoding stage** — Remotion's `--hardware-acceleration=if-possible`
   supports **NVENC only (NVIDIA)** on Windows/Linux per the docs. On AMD
   (RX 9060 XT) it silently falls back to software x264. We pass the flag
   anyway: free speedup on NVIDIA machines, no-op here. Note: the flag is
   ignored when `--crf` is set ("crf option is not supported with hardware
   acceleration") — bitrate mode (`--video-bitrate=8M`) + the flag is the
   combo for NVENC machines.

Faster finals that actually worked: **JPEG frames instead of PNG for the mp4
path** (26s vs 31s per 1000 frames, ~15%; PNG stays mandatory for alpha mov)
and **30fps output** (halves frame count vs 60; `--fps=60` remains available
for high-quality animation).

```bash
ffprobe -show_entries stream=codec_type,codec_name,pix_fmt out/Song.mp4
#   expect: one video stream, h264 High, yuv420p — NO audio stream

# alpha check applies to the mov variant only:
ffmpeg -ss <t_in_silent_gap> -i out/Song.mov -frames:v 1 \
  -vf alphaextract -f rawvideo -pix_fmt gray - | python -c "..."
#   expect mean alpha 0.0 in gaps, max 255 where text shows

ffmpeg -ss <t> -i out/Song.mp4 -frames:v 1 out/check.png   # eyeball shaping
#   mp4 check: black background (mean ~0-3), text pixels near 255
```

Real timings from this machine (Ryzen laptop, 8 concurrent browser tabs):
- Preview (6261 frames @ 480x270p15): ~2 min.
- Final 1080p60 ProRes 4444 (25042 frames, 417s song): ~17 min total,
  ~3.2 GB file. The mp4 default at 30fps is roughly 4x faster and ~20x
  smaller. Budget accordingly; always preview first.
