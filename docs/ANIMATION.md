# ANIMATION.md — every motion layer, every value

Five independent layers. They compose, and each one has a different safety rule.

```
line  ──  --motion / --style        the whole line arriving
  └── word  ──  --word-anim       each word as it is sung
        └── letter  ──  --letter-anim / --letter-var    each grapheme
```

---

## The two rules motion must obey

Everything below is subject to these. They are not style preferences; they are
the two ways motion has broken this project.

**1. A motion must be FINISHED inside the cue's own end.** A cue carries a
tapped `end` — the moment the singer finished the word. A line still travelling
at that moment is the bug the ends file exists to prevent. So durations are
fractions of the cue's **own span**, then capped:

```
enter = min(0.55s, span * 0.42)
exit  = min(0.30s, span * 0.28)     ->  enter + exit <= 0.70 * span
```

A 0.28 s interjection and a 2.6 s chorus line both animate fully inside their own
time. Enforced by `scripts/check_motion.mjs` and `scripts/scan_visibility.py`.

**2. A motion must not push text off the frame.** Travel is **clamped to the
placement's real margin**, computed per cue from the geometry — not a taste
constant. Roam is the placement that can genuinely run out of room (a 60vw block
centred on a seeded anchor); when it does, travel collapses to ~0 and the motion
degrades to scale/opacity/filter rather than clipping (gotchas 13, 17).

---

## 1. `--motion` — per-line choreography (21)

One choreography per line, dealt from a **seeded deck** so no two neighbouring
lines share one and no two cues are *identical* (each cue draws its own
direction, distance, rotation, spring constants and glow).

```bash
--motion off      # default
--motion calm     # small pool, gentle
--motion vivid    # most of the pool
--motion wild     # the whole pool, used hard
--motion-block 7  # cues before the deck reshuffles
```

| | | | |
|---|---|---|---|
| `lift` | `dive` | `slideIn` | `slideOut` |
| `orbit` | `pop` | `punch` | `zoomThrough` |
| `squash` | `swing` | `tilt` | `flip` |
| `skew` | `wipe` | `unblur` | `scrambleWipe` |
| `flare` | `shimmer` | `spiral` | `snap` |
| `breathe` | | | |

Plus **per-word stagger**, layered on automatically.

**Off by default, deliberately.** It is the one feature here whose absence is
the safer default, because motion displaces text and displacement is the shape
of bug that has shipped twice (gotcha 33).

## 2. `--style` — the line entrance (22)

```bash
--style swing     # pin ONE for every line
--style           # unset: a seeded deck deals them out
```

| original nine | choreographed entrances | persistent-life |
|---|---|---|
| `fade` `rise` `pop` | `spring` `swing` `flip-in` `float-up` | `breathe` |
| `slide-left` `slide-right` | `drop-bounce` `scale-up` `letter-spread` | `glow-pulse` |
| `typewriter` `blur-in` | `line-wipe` `roll-in` `zoom-fade` | `pendulum` |
| `zoom-through` `glow` | | |

`persistent-life` styles keep moving while a line is **held** — for a line
sitting on screen 2.6 s that is the difference between a caption and a lyric
video.

**`--motion` replaces this layer's transform when both are on.** They are both
line-level entrances, and two writes to `transform` on one box fight (gotcha 12).

## 3. `--word-anim` — per word (13 + `mix`)

| | | | |
|---|---|---|---|
| `off` | `reveal` | `karaoke` | `pulse` |
| `flip` | `swing` | `drop` | `zoom` |
| `spin` | `cascade` | `glow` | `wobble` |
| `slide-left` | `slide-right` | **`mix`** | |

`--word-anim mix` deals a **different effect to each word**. This is the single
biggest cure for a monotonous-looking line, and the reason is worth stating: a
karaoke line is dull not because of the effect but because **every word does the
same thing** — five words rising together is one gesture repeated five times.
Dealing per word makes it five gestures in sequence, which reads as *performed*
rather than *typeset*.

A word effect is a **whole-word** transform, so every letter moves together and
the shirorekha stays continuous. That is why this pool may scale, rotate and
swing freely and the letter pool may not.

## 4. `--letter-anim` / `--letter-var` — per grapheme (13)

```bash
--letter-anim drop|tumble|glow-in|unfurl|blur-in|tilt|slide-left|slide-right|...
--letter-var 0..0.03      # per-letter SIZE, capped hard
```

Letters are **grapheme clusters**, not codepoints: `क्ष` is three codepoints
forming one glyph, and `नि` stores its pre-base matra *after* the consonant
though it draws to the left. Splitting on codepoints mangles both.

**The rule: a letter effect may touch opacity, translate, rotate, blur, clipPath
and glow. It may not scale, and may not change size past 0.03.**

| `--letter-var` | what `हावा` looks like |
|---|---|
| `0` | one continuous bar (control) |
| **`0.03`** | **bar continuous, letters differ subtly** — the cap |
| `0.05` | bar starts to separate |
| `0.08` | clearly broken, the word reads as *damaged* |

> **`pop` is the one exception, and it is per-letter scale.** It is the shipped
> house style and matches the reference video, so it is not changed — but by the
> measurement above it does step the headline. If the typesetting matters more
> than the impact, use `--letter-var` instead of `--letter-anim pop`.
> `check_animation.mjs` reports this rather than silently allowing it.

## 5. Sizing

```bash
--size-mode word      # each word a different size (default)
--size-mode phrase    # the whole line once
--size-mode off       # flat
--size-var 0..0.45    # how far (default 0.15 = ±15%)
--size-drift 0..0.35  # a word GROWS as it is sung, then settles
```

`--size-var` varies each word **statically** — and after two lines the eye
learns that and stops seeing it. `--size-drift` is the second axis that actually
carries rhythm: a whole-word scale that rises and falls with the word's own
slot, tapering to **zero at the slot end** so a word can never be caught
mid-grow by the line's fade-out. Off by default, like `--motion`.

---

## The house style

```powershell
--motion wild --word-anim mix --letter-anim pop --letter-var 0.03 `
--mode mix --mix-block 8 --size-mode word --size-var 0.15
```

Louder, if you want it:

```powershell
--motion wild --word-anim mix --letter-anim tumble --size-var 0.22 --size-drift 0.18
```

## Verify before shipping

```powershell
node scripts\check_motion.mjs        # deck, no repeats, ends, no first-frame pop
node scripts\check_animation.mjs     # pools, the shirorekha rule, drift bounds
py   scripts\scan_visibility.py out\<song>.mp4 <song>.lrc <song>.ends.txt
```

The last one is the one that answers *"is any word visible after it should have
ended"*, by decoding every frame rather than sampling.

## One more thing before you judge motion

**Judge one variable at a time.** A contact sheet with karaoke words, per-letter
pop and a 60px glow all running together is a grid of featureless white blobs —
the shirorekha bars merge through the glow and the heavy weights fill what is
left. Fifteen fonts, none of them comparable, and the same is true of fifteen
motions (gotcha 26). `scripts/contact_sheet.mjs` exists for this: no word
animation, no letter animation, a tight shadow, a size inside the band.

Everything here is **seeded**. Same command, same file, every time — the video is
rendered once and then used live, so a re-render that does not match the show file
is worse than an ugly frame.
