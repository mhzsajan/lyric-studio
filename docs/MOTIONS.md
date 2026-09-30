# Motions & animations — how Allare's video was made

The full story of the first song rendered with the motion pack
(`Allare - Motion.mp4`, 2026-09-30), including the font failure that the
critique gate correctly refused to catch and the human correctly caught.

## What was added (commit 87e0dd7)

`src/animations.js` + `src/LyricOverlay.jsx`, replacing the 9-style catalog
with 22 styles in three families:

**One-shot entrances** — play once over ENTER (0.34s), then the line holds:

| style | motion |
|---|---|
| `spring` | starts small, overshoots ~8%, settles back (exponential envelope + decaying sine) |
| `swing` | drops in from above while rotating home like a released pendulum sign, one counter-swing baked into the tail |
| `flip-in` | 3D `perspective(900px) rotateX(-80deg -> 0)` |
| `float-up` | soft rise with a defocus blur that resolves |
| `drop-bounce` | falls 74px and lands on a standard easeOutBounce |
| `scale-up` | grows from 55% with easeOutQuart |
| `letter-spread` | arrives stretched (scaleX 1.38) and tightens into place |
| `line-wipe` | a rising bottom edge uncovers the line (`clip-path` inset) |
| `roll-in` | spins in like a wheel (-170deg) while scaling up |
| `zoom-fade` | dolly-in: starts at 1.3x and near, recedes to rest while fading up |

**Persistent life** — keep moving for the whole hold (driven by
seconds-since-cue, so stills freeze them mid-air harmlessly):

| style | motion |
|---|---|
| `breathe` | slow scale oscillation, 3.2s period, ±2.5% |
| `glow-pulse` | the bloom itself breathes, 2.8s period (amplitude jitters per cue) |
| `pendulum` | ±1.3deg continuous sway, 4.6s period, phase-jittered |

Plus the original nine (`fade rise pop slide-left slide-right typewriter
blur-in zoom-through glow`) unchanged.

### The no-repeat rule: deck shuffle

`styleFor()` used to be `hash(seed) + index * constant -> pick one of N`,
which could deal the same style twice in a row. It now deals a **shuffled
deck per song**: the 22 styles are Fisher-Yates-shuffled with a seed
derived from the song seed, dealt in order, and the shoe is reshuffled
when exhausted. Consequences:

- no style repeats until all 22 have appeared (Allare: 109 cues -> each
  motion seen ~5 times, never twice running)
- adjacent repeats are impossible by construction
- deterministic: same `--seed` replays the same choreography on re-render
- `--style <name>` still pins every cue to one style and bypasses the deck

Allare's deck (first 22): `pendulum pop swing roll-in slide-left
zoom-through scale-up zoom-fade spring flip-in glow breathe fade
glow-pulse line-wipe float-up blur-in drop-bounce letter-spread typewriter
slide-right rise` — verified 0 adjacent repeats, 22/22 unique.

### Where motion attaches

`cueStyle(style, p, q, j, life)` remains the single exported motion engine
(p = entrance 0..1, q = exit 0..1, j = seeded jitter, life = seconds since
cue start). It runs on the INNER inline-block div (the roam-overflow lesson:
never on the positioned box, whose translate(-50%,-50%) a scale would
clobber). Word/letter animations layer inside spans on top of the cue motion.

## The recipe that produced Allare - Motion.mp4

```bash
# 1. beat grid -- the tracker said 123.05; the song is 120. FORCED:
py scripts/detect_beats.py "G:/Lyrical Video/Allare/Allare.mp3" \
    out/beats-allare.json --bpm 120

# 2. render: motion deck (no --style => shuffle), roam placement, legacy font,
#    ends file auto-detected as "Allare Remotion.ends.txt" for cue ends
node render.mjs "G:/Lyrical Video/Allare/Allare.mp3" \
    "G:/Lyrical Video/Allare/Allare Remotion.lrc" --no-audio \
    --legacy-font "../nepali-legacy-fonts/fonts/abhinav/Abhinav.ttf" \
    --mode roam --beats out/beats-allare.json --out "out/Allare - Motion.mp4"

# 3. verify the rendered FILE
py scripts/critique.py "out/Allare - Motion.mp4" \
    --lrc "G:/Lyrical Video/Allare/Allare Remotion.lrc" --no-audio \
    --audio-seconds 418.1 --max-samples 30
```

Result: 12524 frames (6:58 @ 30fps), 109 cues, critique PASS (streams,
duration -0.63s, text-present 30/30, black-plate 30/30, no-edge-clip 30/30).
Abhinav font, deck order as above. Delivered to `G:/Lyrical Video/Allare/`.

## The font failure — and why the pipeline let it through

The first cut used **AMS Cinema** (`--legacy-font` with the Preeti map
fallback). The user caught broken glyphs immediately: Allare's extension
marks (`..`, `==`, `=:`) rendered as wrong glyphs. Diagnosis, from the font
repo's own `sweep.json`:

- **AMS Cinema is class GENERATED, mapping "ams"** — its glyph table is
  NOT Preeti-layout, and the sweep already recorded `"dropped 3 slot(s)"`
  problems for it. Feeding it Preeti key sequences lands every key whose
  slot diverges on the wrong glyph. Allare is punctuation-heavy (`==` is
  the extension-mark run in almost every line), so it lit up everywhere.
- **Abhinav is class PREETI** — npttf2utf's Preeti map IS its layout, so
  `--legacy-font` + Preeti is correct by construction. It is also the font
  of the original Perfect Example video.
- **AMS Manthan worked twice (Kali Kali, Ritu) by agreement, not by
  class**: its generated table happens to coincide with Preeti on the
  slots those two songs' lyrics touched. A song with different punctuation
  could break it the same way Cinema broke Allare.

Why no gate caught it: `critique.py` explicitly does NOT prove glyph
identity (द vs ध is no pixel-statistical script's job) — that is the
`--prepare-only` still's job, and *that still must be looked at by a
human before shipping*. The render also printed the warning
("--legacy-font with no --layout-file falls back to the Preeti map... If
this font is not Preeti-layout the words render wrong with no error")
which was correct and was the exact failure that followed.

### Rule going forward

Before any `--legacy-font` render: check the font's class in the font
repo's sweep.json. **PREETI class -> safe with plain `--legacy-font`.
GENERATED class -> either provide the font repo's generated layout via
`--font-slug`/`--layout-file` (which also runs the hard gate), or expect
wrong glyphs — and if you must, verify a punctuation-heavy cue's still at
full resolution, in the Preview tab, before rendering.** "It worked on the
last song" is not evidence; slot agreement is per-song luck.

## The five-font lineup (2026-09-30, same song, same motion deck)

**The first delivery of this lineup was WRONG — every font drew जाउू for
जाऊ and हेो for हो (gotcha 35) — and was re-delivered after the converter
fix (3825634). The procedure below now includes step 4, which is what
actually catches this class of bug; steps 1-3 passed while the glyphs were
wrong.**

Five PREETI-class fonts were verified and rendered end to end for Allare,
all delivered to `G:/Lyrical Video/Allare/`:

| Video | Font | Character | Eye-check verdict (2026-09-30) |
|---|---|---|---|
| `Allare - Motion - Abhinav.mp4` | Abhinav | the Perfect Example font; classic calligraphic bold | ❌ user still caught a wrong spelling — glyph-level defect, gotcha 37 |
| `Allare - Motion - Ananda Lipi.mp4` | Ananda Lipi Bold BT | heavy traditional headline | ✅ confirmed |
| `Allare - Motion - Himalaya.mp4` | Himalayabold | soft rounded classic | ✅ confirmed |
| `Allare - Motion - Shreenath.mp4` | Shreenath Bold | condensed tall display | ✅ confirmed |
| `Allare - Motion - Katmandu.mp4` | Katmandu Regular | thin classic serif-like | ✅ confirmed |

The 42-font batch that followed added 7 more eye-confirmed fonts
(arap007, cv-haha, mkali, pawang + Unicode arya/kalam/rajdhani) and moved
deepankar to the failed column alongside abhinav. The authoritative list:
docs/FONTS-VERIFIED.md (and the font repo's docs/RENDER-TESTED.md).

Verification chain per font (the procedure to repeat):

1. **Class check** — `sweep.json` class must be PREETI (gotcha 34).
2. **Round-trip** — `py scripts/lrc_legacy.py song.lrc out/_rt.lrc` must
   report zero "not round-trip" lines for the song. NOTE: a clean
   round-trip proves only that the keys decode back through the SAME
   table that generated them; it cannot catch a table that disagrees with
   the font. That is why step 4 exists.
3. **Glyph still at 3x** — render one punctuation-heavy cue
   (`--prepare-only` + `npx remotion still`), crop the first word, zoom,
   LOOK at it. Ten candidates were screened this way; meghubold failed
   visually (सो wrong) despite passing the class and round-trip checks,
   which is exactly why step 3 exists.
4. **Library-first keys** — for Preeti, the keys MUST come from
   npttf2utf's preetimapper (lrc_legacy.py now enforces this). If you are
   ever tempted to hand-build a Preeti key sequence, don't: the table
   decomposition path is what shipped जाउू/हेो in five fonts at once,
   with green checks. For a NEW layout (non-Preeti), encode one song both
   through the generated layout and through the Preeti library and diff —
   divergences need visual proof, not trust.
5. **Render + critique** — all five videos critique PASS (20-30/30 text
   present, no-edge-clip, duration).

Parallel-render note: a render writes `src/lyrics.generated.js` and
`public/` in ITS OWN tree, so four fonts can render at once only from
separate `git worktree add --detach` clones sharing one `node_modules`
junction (`mklink /J`). In one tree, renders must be sequential or the
last-prepared font wins (stills come out byte-identical — the
identical-stills lesson, now with its cause named).

Also measured: **five concurrent renders is too many on this machine —
Chrome page-crashes (OOM) killed all five mid-render** around the 40%
mark, silently (exit 1, logs ending in a CDP stack). Two at a time is
safe and barely slower in wall-clock terms; queue them.
