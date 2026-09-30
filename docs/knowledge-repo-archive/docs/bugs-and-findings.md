# Bugs and findings — every failure, root cause, and fix

Ordered roughly by how expensive each one was. All were hit and fixed in the
shipped pipeline ([lyric-video-remotion](https://github.com/mhzsajan/lyric-video-remotion)).

## 1. `process.env` inside Remotion components is a trap (showstopper)

**Symptom:** text rendered black and browser-default sized; no error anywhere.

**Root cause:** Remotion **statically replaces `process.env.X` at build time**.
An unset variable becomes the *literal string* `"undefined"` — which is
truthy — so `process.env.LYRIC_COLOR || "#ffffff"` evaluates to
`"undefined"`, an invalid CSS colour (renders black), and
`Number(process.env.LYRIC_SIZE)` is NaN (collapses to default size).

**Fix:** pass style knobs as **composition props** via `--props='{...}}'`,
with sane `defaultProps`. Only plain numbers are tolerable from env vars
(`Number()` of a missing numeric env is NaN, at least detectable).

## 2. Global-regex `lastIndex` + slicing = dropped chorus repeats (showstopper)

**Symptom:** multi-stamp LRC lines like
`[01:37.88][04:01.50][06:06.95]जाऊ,` rendered as literal text
`[04:01.50][06:06.95]जाऊ,` and only fired at 1:37 — every chorus repeat lost.

**Root cause:** `TIME_RE.exec()` in a loop with `String.slice()`: a `/g` regex
keeps `lastIndex` in the **original string's** coordinates, so after the first
slice the next exec starts past the second timestamp, `m.index !== 0`, loop
breaks. One-character class of bug, very easy to reintroduce.

**Fix:** anchored regex, no `/g`, slice off `"["` + match + `"]"` each pass:

```js
while (rest.startsWith("[") && (m = rest.slice(1).match(TIME_RE))) {
  stamps.push(...);
  rest = rest.slice(2 + m[0].length);   // "[" + match + "]"
}
```

## 3. Hand-timed LRCs hold lines for 40–65 seconds

**Symptom:** a line frozen on screen through a whole instrumental break —
reads as a freeze-frame, not a lyric video.

**Root cause:** LRC cue `end` is derived from the *next* stamp; gaps between
sections are minutes long.

**Fix:** cap every cue's hold (`HOLD_SECONDS = 8`), keep a minimum display of
1s, and keep the 4s tail on the final line. Instant section-break detection
as a side effect: empty screen where nothing is sung.

## 4. JPEG image format silently destroys alpha

JPEG has no alpha channel; `--image-format=jpeg` (or a config that pins it)
flattens the overlay to black. Always PNG (`Config.setVideoImageFormat("png")`).

## 5. Pinning codec/ProRes in remotion.config.js breaks previews

`Config.set...` codec + profile globally conflicts with per-mode CLI flags:
`--codec=h264 --preview` fails with "you have set a ProRes profile but the
codec is h264". Declare `defaultCodec`/`defaultProResProfile` on the
Composition instead; leave the config free.

## 6. Preview of a 7-minute song renders 25k frames by default

`calculateMetadata` sizes the composition from the audio length (417s), so a
"quick preview" at 15 fps is a 27-minute job mostly encoding silence. Cap
preview renders: `--frames=0-<round((lastCue.end + 2) * previewFps)>`.

## 7. Remotion CLI single-frame render wants a directory

`--frames=10480` with `out/x.png` errors: "The output directory of the image
sequence cannot have an extension." Pass `--frames=10480-10480` **and** a
directory (`out/stills/`); it writes a single-frame video there. To get a
still PNG for inspection, extract from that with ffmpeg.

## 8. `npx remotion` prints npm notices to stderr

`npm notice` lines pollute stderr even on success. Don't parse either stream
for success/failure — check the output file's existence/size. And `2>/dev/null`
hides real errors; prefer redirecting to a log file.

## 9. Windows console mojibake

Box-drawing characters in CLI output render as garbage on Windows consoles.
Keep wrapper-script output ASCII-only.

## 10. BOM in the LRC silently eats the first cue

A leading UTF-8 BOM makes the first line `[ti:...]` fail the metadata regex,
and `[feet:...]`-style garbage can leak into the first cue's text. The
source .lrc happened to be clean; strip `\uFEFF` defensively when reading.

## 11. `gh repo create --source . --push` fails when the repo exists

`GraphQL: Name already exists on this account`. Check
`gh repo view <name> --json url,isEmpty` and `git remote -v` first; usually
the remote is already wired and a plain `git push` is the move. Also seen
twice this project: transient `Failed to connect to github.com:443` — just
retry the push.

## 12. Nepali AMS fonts are legacy ASCII fonts (the big one — SOLVED)

**Symptom:** `--font "AMS Manthan"` changed nothing for Devanagari — frames
pixel-identical to Nirmala UI.

**Root cause:** the fonts' Unicode cmap maps only U+0020–U+007E + ~30
symbols, no Devanagari codepoints, no GSUB/GPOS. Chromium falls back
per-character, silently. Full forensics in [fonts.md](fonts.md).

**SOLUTION: render the lyrics as Preeti key sequences through the legacy
font** (the glyphs sit on ASCII slots — that is the whole design of these
fonts). The user's own "Perfect Example" video did exactly this. Implemented
as `--legacy-font ams.manthan.ttf` in lyric-video-remotion (port of the
npttf2utf-based converter from the user's nepali-lyric-video-maker repo,
plus the `km`=फ map-gap fix). Converting the FONT to Unicode was the wrong
fix; converting the TEXT to the font's native encoding is the right one.

## 12b. roam + transform on the same element = clipped text

**Symptom:** in roam mode, text blocks hung off the right edge of frame at
high x positions.

**Root cause:** the entrance/exit transform (`scale()` for glow) was applied
to the same div that carried the position `translate(-50%,-50%)` — the
animation's transform **replaced** the positioning transform (CSS transform
is one property; the last write wins).

**Fix:** outer div owns position (`left/top` + `translate(-50%,-50%)`), inner
inline-block div owns the animation state.

## 13. Remotion's bundled ffmpeg is not system ffmpeg

`npx remotion ffmpeg` is a limited build: no `rawvideo` muxer, no
`signalstats`. Use system ffmpeg for verification tricks (`alphaextract`,
raw gray dumps); use Remotion's only when system ffmpeg is absent.

## 14. Dual-pane preview services the whole folder, not just one file

Registering an HTML preview that references `out/xxx.png` by relative path
only works if the server root contains those files — we moved/copy check
images into the served folder, or embed them base64 into a self-contained
HTML check page (chosen approach; zero moving parts).

## 15. The CLI `--fps` flag clamps frames instead of recomputing (showstopper)

**Symptom:** passing `--fps=60` to `npx remotion render` produced a 30s song
as 900 frames — **half the song** — because the flag overrides fps AFTER
calculateMetadata resolved the duration in 30fps frames, without recomputing.
No warning is printed.

**Fix:** never pass the CLI `--fps`. Set fps via composition **props** and
resolve it inside `calculateMetadata` (`fps = Number(props.fps) || 30`,
returning `{ fps, durationInFrames: seconds * fps }`). Verified: props-only
→ correct 1800/60fps; props+CLI → also correct (props win); CLI-only →
broken. So: props always, CLI never.

## 16. Arg parsers that only accept `--name value` silently drop `--name=value`

Our wrapper's `flag()` used `argv.indexOf(name)` only, so a user's
`--fps=60` returned null and the 30 default rendered instead — with zero
error. Diagnosed by adding a `--debug-args` mode that prints the exact child
argv. The fix accepts both forms. Lesson: when a wrapper shells out to a
CLI, print the final argv in a debug mode; it turns "impossible" bugs into
one-line findings.

## 17. Hardware-acceleration is silently skipped with --crf

Remotion logs `Hardware accelerated encoding disabled - "crf" option is not
supported with hardware acceleration` and proceeds in software. On NVENC
machines you must switch from crf to `--video-bitrate` (≈8M ≈ crf-17 quality
at 1080p) to actually get the GPU encoder. On AMD this is all moot (NVENC
only) — see the toolchain doc's GPU section.

## 18. GPU offload is a dead end for text-only renders — measured

The intuition "CPU 100%, GPU idle → something is wrong" is wrong for this
pipeline. Measured A/B: `--gl=angle` (GPU) vs `--gl=swiftshader` (software)
rendered 1000 text frames in identical time; concurrency beyond ~8 changed
nothing on 20 CPU threads. The stages that would benefit (NVENC encode,
WebGL-heavy content) either don't apply on AMD or don't exist in this
content. Stop optimizing there; JPEG frames + 30fps are the real wins.

## 19. Preview frame cap off-by-one

`--frames=0-N` against a composition of `durationInFrames = N` errors with
"frame range 0-N is not inbetween 0-(N-1)": frame indexes are 0-based.
Subtract 1 from any computed end frame.

## 20. Roam anchors can push text past the frame edge (x AND y)

The roam layout centers the text block on a seeded anchor with
`translate(-50%, -50%)` and `maxWidth: 60vw`. The first anchor range
(x 12-52%, y 8-66%) was chosen by eyeballing the reference video, not from
geometry, and it shipped a latent bug: Kali Kali rendered "clean" because
its seed got lucky, then Ritu's long chorus lines clipped 100-145 px off
the left edge (anchor x=20-24% with a full-width 60vw block) and one held
2-line block poked 1000+ px of glow through the top (anchor y=19.6%).

Two lessons. First, verify the FINISHED video, not just the stills you
extracted while building: scan sampled frames for bright pixels in the
outer 3 rows/columns (`ffmpeg fps=1/6` to pngs + a numpy edge count finds
every instance in seconds). Second, when a positioned block is centered on
a randomized anchor, the safe band is a function of the block's maximum
size, not of taste: x must be within [maxW/2, 100-maxW/2], y within
[maxH/2, 100-maxH/2]. Fix: x 32-68%, y 24-66% — covers the 60vw / 2-line
worst case with glow margin. Re-render both songs after the fix; both
rescanned 100% clean.
