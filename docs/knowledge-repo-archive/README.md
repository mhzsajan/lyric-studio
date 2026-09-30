# Lyric Video Generator

The **playbook** for generating text-only lyric videos from timed lyrics —
collected while building and shipping this exact pipeline for real songs
(Nepali/Devanagari lyrics, mixed live in Ableton with Videosync2).

This repo does not contain the code. It contains everything an AI (or human)
needs to rebuild, extend, or debug it:

| Doc | Read it for |
|---|---|
| [AGENTS.md](AGENTS.md) | Start here. Tool choice, decisions, current state, "do not rediscover" list. |
| [docs/toolchain.md](docs/toolchain.md) | Why Remotion, the exact working recipe, render modes, verification. |
| [docs/animations.md](docs/animations.md) | Every animation implemented, which to use when, what worked and what didn't. |
| [docs/bugs-and-findings.md](docs/bugs-and-findings.md) | Every bug hit, its root cause, and the fix. The expensive lessons. |
| [docs/fonts.md](docs/fonts.md) | Why legacy Nepali fonts silently fail in browsers and what to do about it. |

## The pipeline in one line

```
Song Timer (.lrc)  +  song.mp3  ──►  Remotion  ──►  .mp4 H.264 (white on black, text-only)
                                                     └─Videosync2: blend Add/Screen = transparent
                                        (optionally .mov ProRes 4444 with true alpha)
```

## Working code

The live implementation is at
[github.com/mhzsajan/lyric-video-remotion](https://github.com/mhzsajan/lyric-video-remotion)
— its own [AGENTS.md](https://github.com/mhzsajan/lyric-video-remotion/blob/main/AGENTS.md)
mirrors the architecture. Timing is authored in
[Song Timer](https://github.com/mhzsajan/songtimer); the `.lrc` file is the
single contract between Ableton, AbleSet, and the video.

## Shipped so far

- 2026-09-28 — **Allare** (text-only, no audio track, alpha verified)
- Pending — Kali Kali, Ritu (same folder layout, one command each)
