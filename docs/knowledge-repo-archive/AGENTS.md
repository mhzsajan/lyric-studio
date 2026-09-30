# AGENTS.md — Lyric Video Generator (knowledge repo)

You are probably an AI agent asked to build, fix, or extend a lyric-video
pipeline. This repo is the accumulated playbook. Read this first; it saves you
from re-learning everything the hard way.

> **SUCCESSOR (2026-09-29):** the pipeline now lives at
> [github.com/mhzsajan/lyric-studio](https://github.com/mhzsajan/lyric-studio) —
> lyric-video-remotion absorbed whole, plus beat sync, a hard font gate
> (fail in seconds, not after a 4-minute render), and `critique.py`, which
> verifies the rendered FILE (streams, duration, text presence, plate
> purity, edge-clip scan) before the command exits 0. Fonts come from the
> sibling [nepali-legacy-fonts](https://github.com/mhzsajan/nepali-legacy-fonts)
> repo. **New work should happen there.** This repo's knowledge (bugs,
> toolchain reasoning, font history) still applies; its "Working
> implementation" section below describes the predecessor.

## The 60-second version

- **Tool: Remotion** (programmatic video in React, rendered by headless
  Chromium). It won. Alternatives considered and rejected: canvas/ffmpeg
  frame-by-frame, After Effects scripting, plain HTML+screen-capture.
  Reasoning in [docs/toolchain.md](docs/toolchain.md).
- **Input contract: one `.lrc` file** exported by Song Timer
  (https://github.com/mhzsajan/songtimer). Timing is authored once and
  consumed by Ableton/AbleSet *and* the video, so they can never disagree.
- **Output: .mp4 by default** — 1920x1080@**30** H.264 (crf 17, yuv420p,
  JPEG frames), white text on BLACK background, no audio stream with
  `--no-audio`. mp4 cannot hold an alpha channel, so the consumer keys it:
  in Videosync2 set the layer blend to **Add** (or Screen) and black
  disappears — exactly how the user's beloved reference
  (`Perfect Example/ritu-whisper.mp4`) was mixed. `--fps=60` optional for
  high-quality animation; `--format mov` renders ProRes 4444 true alpha for
  alpha-aware hosts (~3.2 GB per 7-min song vs ~150 MB mp4).
- **Look:** `--mode roam --style glow` reproduces the reference video — each
  line at its own seeded position (upper-2/3 bias), outgoing line fading in
  place, soft white bloom. See docs/animations.md.
- **GPU:** the AMD RX 9060 XT cannot accelerate any stage of this pipeline
  (browser stage is CPU-parallel anyway — measured identical with --gl=angle
  vs swiftshader; encoder stage is NVENC-only in Remotion). Do not chase GPU
  offload here; use JPEG frames + 30fps for speed.
- **Fonts:** the Nepali `01 Fonts` (AMS/Ananda/Abhinav) are legacy Preeti-era
  fonts. For real Unicode they silently fall back to Nirmala UI — but they
  DO work when the lyrics are transcoded to their Preeti key layout first:
  `node render.mjs song.mp3 song.lrc --legacy-font ams.manthan.ttf` (port of
  the user's proven nepali-lyric-video-maker pipeline; includes the `km`=फ
  map-gap fix). Full story in [docs/fonts.md](docs/fonts.md).

## Working implementation

**Current: [lyric-studio](https://github.com/mhzsajan/lyric-studio)** — one
command, gated end to end (only exits 0 when the rendered file passed
critique):

```bash
node scripts/make_video.mjs song.mp3 song.lrc            # overlay mp4
node scripts/make_video.mjs song.mp3 song.lrc --styled   # full-frame look
py scripts/font_gate.py --lrc song.lrc --font-file <ttf> # standalone gate
```

Predecessor (stable, shipped the three delivered songs):
[github.com/mhzsajan/lyric-video-remotion](https://github.com/mhzsajan/lyric-video-remotion)
— clone it, `npm install`, and:

```bash
node render.mjs <audio.mp3> <lyrics.lrc> --report-only   # cue list, no render
node render.mjs <audio.mp3> <lyrics.lrc> --preview       # fast, no alpha
node render.mjs <audio.mp3> <lyrics.lrc> --no-audio      # final, text-only
node render.mjs --batch <dir>                            # whole folder
```

Source media layout: `D:\DB Project\Text Only Lyric Video Final\Final\<Song>\`
containing `<Song>.mp3` + `<Song> Timmed.lrc`, with `..\01 Fonts\` alongside.

## Architecture (5 files, no magic)

```
render.mjs            CLI: parse args, print cue report, write generated
                      module (LRC text + audio name), copy audio to public/,
                      shell out to the Remotion CLI with codec/props flags.
src/Root.jsx          <Composition id="LyricOverlay">; duration = max(audio
                      length, last cue); style knobs as PROPS (never env).
src/LyricOverlay.jsx  frame -> text state; pure cueStyle() is exported and
                      testable without React.
src/animations.js     styleFor(seed, cueIndex, pin): deterministic animation
                      selection so re-renders are reproducible.
src/parse-lrc.mjs     LRC -> cues; expands chorus repeats
                      ([01:37][04:01][06:06] same line -> 3 cues).
```

## Bugs that already cost us time — do not rediscover

Full write-ups in [docs/bugs-and-findings.md](docs/bugs-and-findings.md);
short list:

1. `process.env.X` inside a Remotion component is statically replaced at
   build time; unset becomes the literal string `"undefined"` (truthy!).
   Pass style knobs as composition PROPS.
2. Global `/g` regex + `String.slice` loops break LRC multi-stamp parsing
   (`lastIndex` keeps original-string coordinates). Slice and re-match an
   anchored regex instead.
3. Hand-timed LRCs leave 40-65s unstamped gaps; cap cue hold (~8s) or lines
   freeze on screen through instrumentals.
4. `--image-format=jpeg` destroys alpha; PNG only. Do not pin codec/ProRes in
   remotion.config.js — per-mode flags conflict with it.
5. Preview without a frame cap renders 25k frames; cap at last cue + tail.
6. `npm notice` lines land on stderr of `npx remotion` — do not parse stdout
   with `2>/dev/null` and expect the notice gone, and do not parse either
   stream for success; check the output file.
7. Windows console + box-drawing chars = mojibake; keep CLI output ASCII.
8. `gh repo create --source . --push` fails if the repo name already exists;
   `git remote -v` first, then plain `git push`.
9. CLI `--fps` on `remotion render` CLAMPS the frame count (30s song → 900
   frames at 60fps). FPS must go via composition props → calculateMetadata.
10. Wrapper arg parsers must accept BOTH `--name value` and `--name=value`;
    the missing equals-form silently rendered 30fps instead of 60. Add a
    `--debug-args` print of the exact child argv to any wrapper that shells
    out — it turns "impossible" bugs into one-line findings.
11. Roam anchors must sit inside a width-safe band: the block is centered
    on the anchor with maxWidth 60vw, so x below 32% clips long lines off
    the left edge, and y below ~24% pushes a wrapped 2-line block through
    the top. Safe band: x 32-68%, y 24-66% (animations.js positionFor).

## State

- Shipped: **Allare** (2026-09-28, ProRes alpha .mov, Nirmala UI),
  **Kali Kali** (2026-09-29 re-render, mp4 30fps, roam+glow, **AMS Manthan
  via legacy transcoding**) and **Ritu** (2026-09-29, same pipeline) — all
  three songs delivered. The 09-29 renders include the roam anchor fix
  (bug 20) after an edge-scan of the finished files found long lines
  clipping at the frame edge.
- Resolved: the "custom fonts don't work" mystery — legacy key transcoding
  (see docs/fonts.md); no font-file conversion needed.
