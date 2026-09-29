# lyric-studio

Song Timer `.lrc` + audio → **finished lyric video**, through gates that make
wrong-text renders fail in seconds instead of shipping. Successor to
[`lyric-video-remotion`](https://github.com/mhzsajan/lyric-video-remotion)
(absorbed whole) with the workflow layer added: **beat sync, a font gate, and a
render-critique loop.** Fonts come from the sibling
[`nepali-legacy-fonts`](https://github.com/mhzsajan/nepali-legacy-fonts) repo —
referenced, never vendored.

Two products, one codebase:

| | composition | what it is |
|---|---|---|
| **Overlay** (default) | `LyricOverlay` | the proven deliverable: H.264 mp4, white text on pure black, ~12 KB/s, blended **Add/Screen** over a Videosync2 camera feed in Ableton Live |
| **Styled** (`--styled`) | `LyricStyled` | the full-frame video: painted background (aurora/particles/gradient), beat-reactive pulse, head + tail title cards, white halo on every line, mix placement |

## The one command

```powershell
node scripts/make_video.mjs song.mp3 song.lrc --styled
```

runs the whole pipeline and only exits 0 when the rendered FILE passed
critique:

```
1/3  beats      song.mp3 -> out/beats-song.json      (word starts quantize to the grid;
                                                       the styled background pulses on it)
2/3  render     render.mjs with your flags           (the FONT GATE runs inside, before
                                                       any work: a font that cannot write
                                                       the song fails here, naming words)
3/3  critique   verifies the rendered file           (streams, duration, text present at
                                                       sampled cues, pure plate, no clip)
```

Flags `make_video` consumes: `--no-beats`, `--skip-critique`, `--bpm <f>`.
**Everything else passes through to `render.mjs`** — `--styled`, `--font-file`,
`--font-slug`, `--mode`, `--size`, `--length`, `--no-audio`, `--preview`, ...

## Try it in two minutes (no song needed)

```powershell
npm install
py scripts/make_test_assets.py        # synthesizes a 32 s, exactly-120-BPM
                                      # track + a Nepali .lrc of the words that
                                      # break legacy layouts (फर्केर, सँगै, आउँछु...)
node scripts/make_video.mjs test-assets/test-song.wav test-assets/test-song.lrc --no-audio --length 32 --font-file ..\nepali-legacy-fonts\fonts\yantramanav\Yantramanav-Black.ttf --styled
# -> out/test-song-styled.mp4, beat-synced and critique-passed
```

## Fonts: the gate decides, not you

The renderer asks [`nepali-legacy-fonts`](https://github.com/mhzsajan/nepali-legacy-fonts)
whether a font can write the song **before** rendering, every time:

- `--font-file <ttf>` (Tier A Unicode — the house default, Yantramanav Black):
  the gate checks the font's cmap covers every Devanagari character of the
  lyrics, and catches a legacy `.ttf` handed to `--font-file` by mistake (zero
  Devanagari code points → hard fail with an explanation).
- `--font-slug <slug>` (legacy + generated layout): the gate delegates to the
  font repo's `check_song.py`. On lyrics with virama/candrabindu conjuncts all
  79 generated layouts fail — that is a property of the published key tables,
  and the gate says so in seconds instead of after a four-minute render of
  `फर्केर` as `फरकर`.
- `--skip-font-gate` exists for emergencies. Using it means **you** are the
  gate: inspect frames before shipping.

Standalone: `py scripts/font_gate.py --lrc song.lrc --font-file <ttf>|--slug <slug>`.

## Beat sync

```powershell
py scripts/detect_beats.py song.mp3 out/beats.json     # numpy onset+comb tracker
py scripts/detect_beats.py song.mp3 out/beats.json --bpm 92   # force the tempo
```

`render.mjs --beats out/beats.json` makes word starts **quantize** to the grid
(`--beat-tol`, default 0.4 s): a word only moves to a beat that is close to
where the `.lrc` phrasing already put it — the tapped timings stay the ground
truth, the grid sharpens them. In styled mode the same grid drives the
background pulse (amplitude ≤ 0.05 by default — felt, not seen). `librosa` is
used automatically when installed; the builtin tracker is validated against
the synthetic click track (`--expect-bpm 120`).

## The look

`styles/house.md` is the style contract (banned-generic list included);
`styles/default.json` is the machine-readable profile `--styled` loads
(`--style-profile <json>` for others). The lyric is the picture; everything
else sits one step above "barely noticeable".

## Verification (why this repo exists)

> A render that finishes is not a render that is correct.

`scripts/critique.py` extends the container checks (`check_output.py`) to the
picture: samples frames at cue midpoints across the whole file and asserts
text is present, the overlay plate is pure black, and nothing is clipped at
the margins. Glyph *identity* (द vs ध) is no script's job — that is the
`--prepare-only` still and the font gate's job, and the critique says so
rather than pretending.

All the inherited verification scripts came along: `check_output.py`,
`check_pairing.mjs`, `check_word_timing.mjs`, `check_letters.mjs`,
`check_width_model.mjs`, `check_mix.mjs`, `calibrate_width.mjs`,
`contact_sheet.mjs`, plus the new `check_beats.mjs`.

## Documentation

| | |
|---|---|
| [`AGENTS.md`](AGENTS.md) | orientation + the 29 gotchas (26 inherited, 3 found by running this) + the new layer. **Read before changing anything.** |
| [`docs/PIPELINE.md`](docs/PIPELINE.md) | what each stage proves, and what it cannot |
| [`styles/house.md`](styles/house.md) | the Look contract |
| [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md) | why Remotion; what made rendering fast |
| [`docs/REFERENCE.md`](docs/REFERENCE.md) | measurements of the target video |
| [`docs/FONTS.md`](docs/FONTS.md) | render-time font notes (authority: the font repo) |
| [font repo README](https://github.com/mhzsajan/nepali-legacy-fonts) | the 214-font catalogue, tiers, layouts, `check_song.py` |

## Requirements

- Node 16+ (tested on 24.18), Windows-first
- Python 3 on PATH (`py` is fine) — beats, gates, critique, legacy transcoding
- `numpy` + `pillow` + `fonttools` + `npttf2utf` (`py -m pip install numpy pillow fonttools npttf2utf`)
- `ffmpeg`/`ffprobe` on PATH for beats + critique (the Remotion bundle is a
  fallback for critique only — it cannot mux s16le, which beats needs)
- The font repo as a sibling directory (or `--fonts-repo <dir>`)
