# GPU encoding and the AMD RX 9060 XT — measured, not assumed

**Short answer: this repo's renders are CPU-bound, and both halves of the GPU are
unavailable or slower here. Remotion is not the problem, and replacing it would
not help.** All numbers below are from this machine on 2026-09-30.

## The two halves of "use the GPU"

A render has two separate stages, and they fail independently:

| stage | what does it | GPU available? |
|---|---|---|
| **draw** the 12,513 frames | headless Chromium | yes, via `--gl=angle` |
| **encode** them to H.264 | the ffmpeg Remotion bundles | **no** — no VA-API, no AMF |

## Why the encode cannot be hardware

Remotion ships its own ffmpeg. That build contains:

```
libx264       software
h264_nvenc    NVIDIA
libx265 / hevc_nvenc
```

There is **no `h264_vaapi` and no `h264_amf`**. The system ffmpeg on this machine
has all three (`h264_amf`, `h264_vaapi`, `h264_qsv`), so the AMD hardware
encoder *exists* — just not in the binary Remotion uses. Nothing in this repo can
reach it; the encoder is chosen inside Remotion's ffmpeg.

## What `--gpu` actually does here: it breaks

`--gpu` (already in `render.mjs`) sets `--hardware-acceleration=if-possible` and
`--gl=angle`. Isolated by changing one flag at a time:

| run | flags | result |
|---|---|---|
| A | `--gpu --gl=swiftshader` | **`Error: write EPIPE`** — render dies |
| B | `--gl=angle` + `--crf` | **OK** |
| C | `--gl=angle`, no `--gpu` | **OK** |
| D | default (no `--gl`) | **OK** |

So `--gl` is not the problem; the `if-possible` encoder probe is. On a machine
whose only hardware H.264 encoder is `h264_nvenc` and whose GPU is AMD, the
probe finds an encoder that then fails to initialise, and the child process dies.
That is the failure `if-possible` is supposed to prevent, so **on this box the
flag is a trap** — it is documented in `render.mjs` as the way to use the GPU,
and it cannot work here.

## The GPU rasteriser is slower, not faster

6 seconds of video, Yantramanav, `--mode center`, animations off:

| | wall clock |
|---|---|
| default (software raster) | **401.7 s** |
| `--gl=angle` (AMD GPU raster) | **456.5 s** |

ANGLE is **14% slower** on this machine. Both produce the same 7.2 MB file. The
work is not raster-bound: each frame is mostly empty black with a few hundred
glyphs, so there is almost nothing for a GPU to do, while the per-frame overhead
of talking to the driver is real. The cost is elsewhere — font loading, the
React tree, and the encode.

## Where the time actually goes

- **12,513 frames at 1080p**, `--size 128`, no audio
- ~6 min per full song ⇒ ~33 ms per frame ⇒ ~30 fps of throughput
- the encode is 417 s of H.264 at crf 17, which on this CPU is not the bulk
- each frame re-evaluates the full React component tree, and `fit()` re-runs a
  bisection per cue

## What was ruled out

- **A second GPU, or forcing nvenc** — pointless on AMD; the encoder does not
  exist for this card in that binary.
- **`--crf` vs `--video-bitrate`** — `--crf` is *required* for hardware accel to
  be ignored cleanly (gotcha 10); using bitrate mode is what makes the probe run
  and die. Not a way to make it work.
- **Replacing Remotion** — would have to reproduce deterministic, frame-addressed
  rendering (the property the whole repo depends on, see `animations.js`) and
  would still encode with the same ffmpeg builds, or a new one that has the same
  GPU limitation. Strictly worse.

## If GPU encoding is genuinely wanted

The only real path is to **render frames with Remotion, then encode them with the
system ffmpeg** and its `h264_amf` / `h264_vaapi`:

```powershell
# 1. render lossless frames (already fast enough)
node render.mjs <audio> <lrc> --codec=png --out "out\frames"

# 2. encode on the AMD hardware encoder
ffmpeg -framerate 30 -i "out\frames\element-%06d.png" ^
       -c:v h264_amf -quality quality -b:v 8M -pix_fmt yuv420p ^
       -movflags +faststart out\song.mp4
```

That is worth doing **only if encoding is measured to be the bottleneck**, which
the numbers above do not yet establish. It is a small script, not a rewrite, and
it leaves the renderer alone.

## The honest summary

The renders are slow because they are **CPU-bound on a lot of small frames**, not
because the GPU is idle. The GPU cannot help: the encoder is not in Remotion's
ffmpeg, and the rasteriser is slower than software on this workload. The lever
that would actually work is **doing less per frame** — fewer React evaluations,
a cheaper auto-fit, or rendering at a lower internal resolution and upscaling —
not a different renderer and not a hardware encoder.
