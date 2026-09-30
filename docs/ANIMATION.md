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
--size-preset small|medium|large
```

`--size-var` varies each word **statically** — and after two lines the eye
learns that and stops seeing it. `--size-drift` is the second axis that actually
carries rhythm: a whole-word scale that rises and falls with the word's own
slot, tapering to **zero at the slot end** so a word can never be caught
mid-grow by the line's fade-out. Off by default, like `--motion`.

### `--size` is a floor, not a peak — so read the PRODUCT

Two multipliers stack on the base, and it is the product that reaches the screen:

```
peak = --size * (1 + --size-var) * (1 + --size-drift)
```

This is why "drop the size 5pt" barely moves anything: at the original
150 / 0.20 / 0.18 the biggest word was **212px**, about 90% of a 1080p frame's
width, and taking the base to 145 changed it by 3%. The complaint that started
this was *"the whole live screen is covered by text"*, and `--size` was never the
control for it.

### The three presets, and how they were chosen

Same 130 seconds of Kali Kali rendered at each and looked at. All three keep the
per-word variation; they differ only in how far it goes.

| preset | `--size` / var / drift | peak | frame width | verdict |
|---|---|---|---|---|
| `large` | 120 / 0.10 / 0.06 | ~140px | ~62% | still reads dominant over video |
| **`medium`** | **105 / 0.08 / 0.05** | **~119px** | **~53%** | **the house size** |
| `small` | 90 / 0.06 / 0.04 | ~99px | ~45% | starts to look small for a lyric video |

`medium` is the default. A preset never overrides an explicit number: an
explicit `--size`, `--size-var` or `--size-drift` wins, always.

---

## 6. `--depth` — the seven composition layers

Separate from `--motion`, which varies how a line **arrives**. These change how
the words are **composed** relative to each other. `off | calm | vivid | wild`.

| layer | what it does | level |
|---|---|---|
| tracking | words spread and settle — **the gap between words only** | word |
| baseline | the line rides up and down over its slot | line |
| arc | words travel along a curve, not a straight line | word |
| depth | blur + scale + opacity **coupled**, so a word comes forward | word |
| **sequence** | each word's entrance triggers the next | word |
| chromatic | sub-pixel red/cyan separation during fast motion | word |
| glow | keyed to the line's own audio amplitude | line |

**`sequence` is the one that can break a deliverable.** It deliberately *delays*
each word until the previous one has begun — that is the effect — and a delayed
word still arriving at the line's end is the lingering-lyric bug reached through a
new door. So the delay chain is fitted to each cue's own span and *compresses*
rather than overrunning. `scripts/check_depth.mjs` asserts the chain fits; the
only proof is the every-frame scan on the finished file.

Tracking is applied to the gap **between** words and never inside one. Letter
spacing within a word separates the letters of a syllable and snaps the
shirorekha. That is a real limitation, stated rather than hidden.

---

## 7. `--color-mode` — per word and per letter colour

```bash
--color-mode off|calm|vivid|wild    # default off
--color-hue 0..359                 # palette anchor, default 210 (cool blue)
```

`calm` paints each **word**; `vivid` and `wild` paint each **letter** as well,
stepping the hue across the word so a conjunct stays one coloured object rather
than two clashing dots. The glow is tinted to the word's own colour, because a
white halo around a coloured word reads as a printing misregistration.

### Why the ranges are bounded, and this is the whole design

This deliverable is **not watched as a picture**. It is blended Add/Screen over a
Videosync2 camera feed in Ableton Live, so the file is judged as *light added to
a picture*. Two rules follow, and both rule out "random RGB per letter":

1. **A dark pixel adds nothing.** Under Add blending, lightness is the channel
   that carries the blend. A word drawn at L=0.25 does not show up on the
   footage — that is not a look, it is a word that vanished. Every level floors
   its own lightness, and `check_color.mjs` asserts the floor for every word *and*
   every letter.
2. **Full-spectrum saturation fights the footage** rather than sitting on top of
   it. The ranges are wide enough to be obviously coloured and narrow enough to
   still read as a lyric overlay.

A wider range is not bolder. It is a file that does not composite.

| level | hue span | saturation | lightness floor | per letter |
|---|---|---|---|---|
| `calm` | ±18° | 0.10–0.34 | 0.87 | no |
| `vivid` | ±62° | 0.38–0.70 | 0.80 | yes, 8–18°/letter |
| `wild` | ±180° | 0.55–0.95 | 0.73 | yes, 22–48°/letter |

### Why colour takes no frame time

Nothing in `src/color.js` receives a time argument. A word's colour is drawn from
the seed and **stays**. Every other layer is a function of `t`, which means it
must be finished by the cue's end or a word outlives its note — the worst bug in
this project. Colour structurally cannot introduce that failure, so there is
nothing for the every-frame scan to catch. That is the point.

### `--color-scheme` — which colours go together

The level says **how much** colour; the scheme says **what is allowed to sit next
to what**. Without it, every word drew its hue independently and a four-word line
came out with four unrelated hues — randomised in the literal sense, and it read
as noise rather than as a palette.

| scheme | hues available to a line |
|---|---|
| `mono` | one hue; only lightness and saturation vary |
| `analogous` | ±30° of the anchor — tonal *(default)* |
| `triad` | the anchor and two hues 120° away |
| `split` | the anchor and two hues 150°/210° away |
| `complement` | the anchor and its opposite, alternating |
| `rainbow` | no relationship — the pre-scheme behaviour |

Hues are dealt as a seeded **permutation**, not `slot = wordIndex % slots.length`.
The modulo version puts words 1 and 4 on the same hue in a four-word line, so the
line reads a-b-a-b; a permutation gives every neighbouring pair a different
colour. `rainbow` is kept rather than deleted because it reproduces a look you
have already seen.

### `--color-gradient` — a gradient across a phrase line

`background-clip: text` with a transparent fill paints a gradient *through* the
glyphs without touching their geometry — so unlike a per-letter size it cannot
step the shirorekha, and it needs no span per letter at all. One property on the
line element: the cheapest colour effect here.

---

## 8. `--cut` — the newspaper / cut-paper look

```bash
--cut off|word|letter    # default off
```

Every word becomes a separate clipping: its own angle, its own height, its own
scale, and a torn edge along its bottom. `letter` adds a per-letter rotation on
top. This is deliberately the **opposite** instinct to `--depth`, which keeps the
words in formation — it takes the formation apart, and it is allowed to look
irregular.

| | safe? | why |
|---|---|---|
| word rotate / lift / scale | ✅ | the shirorekha already breaks at word boundaries |
| word torn edge | ✅ | cuts only the word's own ends, where the bar ends anyway |
| letter colour, letter rotation | ✅ / ⚠️ | colour is safe; rotation displaces the bar |
| letter lift, letter clip | ❌ | **not offered** — both cut the bar, and there is no safe amount |

### The one number in it that is NOT measured

`LETTER_ANGLE_CAP = 2.0°`. This is a deliberately conservative first estimate,
and it is the one value here I would not trust without looking. To measure it:
render one word at 2, 4, 6 and 10 degrees, crop the headline, and look at the
boundary between each rotated letter and its neighbour. At 2° the step should be
sub-pixel at 1080p. If it looks too timid, raise it.

The torn edge is drawn on a **sibling element behind the text**, never as a
`clip-path` on the word. That is not a style preference: `clip-path` removes ink,
and the ink at the bottom of a word *is* the shirorekha.

---

## 9. `--type` — the typed-on reveal

```bash
--type off|line|word|letter    # default off
```

Letters arrive left to right and **stay** — cumulative, which is what separates
it from the existing `wipe` letter effect and the `typewriter` line style. Both of
those play once and are gone.

It is the one effect here that **must finish inside the cue's end**: a typing
reveal is nothing but letters arriving late, and a letter still arriving when the
line fades out is the lingering-lyric bug. So the delay chain is fitted to the
cue's own span and *compresses* rather than overrunning — the same guarantee
`sequence()` gives in `--depth`, for the same reason. Compression is floored at
0.28 so the **stagger** always survives; if it compressed to zero the letters
would land on one frame and the effect would be gone while still costing risk.

The shirorekha is not at risk: a letter that *appears* does not move. That is why
this can run at full strength where per-letter size cannot.

---

## 10. `--stroke` and the blend warning you will need

```bash
--stroke <px>            # 0..8, hairline on the glyph outline
--stroke-color <#hex>    # default #000000
```

A thin outline is what keeps white text legible over a bright pool of light on
stage. It changes no metric, so the shirorekha is untouched.

**But which blend you use decides whether it does anything at all:**

| blend | formula | a DARK stroke |
|---|---|---|
| **Add** | `base + overlay` | adds nothing → **invisible** |
| **Screen** | `1-(1-base)(1-overlay)` | darkens the footage → works |

Under pure Add, use `--stroke-color #ffffff` for a glow rim instead. This repo's
output is blended "Add/Screen", so which one you actually use in Ableton is the
answer. Same reason `--scanlines` is bright: a dark band adds nothing under Add.

---

## 11. `--scanlines`

```bash
--scanlines <n>        # bright bands across the whole overlay
--scanline-alpha <f>  # default 0.10
```

One `repeating-linear-gradient` on the root, deliberately not applied to the
words — a scanline that rotated with the text would be a scanline no longer.

---

## Judging a change in seconds, not minutes

```powershell
node scripts\only_line.mjs "G:\Lyrical Video\Kali Kali" 26 `
  --loudest --color-mode wild --cut word --type letter
```

Renders **one line**, full frame size, with every flag the real render would use.
A quarter-resolution preview is worse than none: it changes how a glow reads and
how a 2° letter rotation reads, which are exactly the things being judged.

`--presentation r-word` (the default) **pins the layout**, and the tool prints it.
That is a correctness fix, not a convenience: the preview writes a one-cue `.lrc`,
so the mix plan would otherwise deal cue 0 as `c-phrase` — a phrase unit, which
has no word spans, so `--cut` and `--type` would correctly do nothing and the
preview would teach you that a working feature is broken.

---

## The house style

```powershell
--loudest
```

That is now the short answer. It sets every layer at once — `--depth wild`,
`--motion wild`, `--word-anim mix`, `--letter-anim pop` at 0.03, `--size-mode
word`, `--mode mix` (block 8), `--color-mode wild` at 210°, size 105 — and
**every one of them yields to an explicit flag**. `--loudest --size 90` is the
full treatment at a smaller size, not a fight between two settings.

Spelled out, the house style is:

```powershell
--motion wild --word-anim mix --letter-anim pop --letter-var 0.03 `
--mode mix --mix-block 8 --size-mode word --size-preset medium `
--depth wild --color-mode wild --color-hue 210 --color-scheme analogous
```

Louder still — the cut-paper look:

```powershell
--loudest --cut word --type letter --color-mode wild --color-scheme split
```

Louder still, if you want it:

```powershell
--loudest --size-preset large --letter-anim tumble --size-var 0.22 --size-drift 0.18
```

## Verify before shipping

```powershell
node scripts\check_all.mjs          # every fast suite, 15 of them
node scripts\check_motion.mjs        # deck, no repeats, ends, no first-frame pop
node scripts\check_animation.mjs     # pools, the shirorekha rule, drift bounds
node scripts\check_depth.mjs         # sequence fits the span; tracking is a gap
node scripts\check_color.mjs         # the lightness floor, and a broken impl
node scripts\check_cut.mjs           # the angle cap; no letter lift or clip
node scripts\check_typing.mjs        # the typing chain fits every cue span
py   scripts\scan_visibility.py out\<song>.mp4 <song>.lrc <song>.ends.txt
```

The last one is the one that answers *"is any word visible after it should have
ended"*, by decoding every frame rather than sampling.

`check_color.mjs` is the one to read before trusting: it runs its own assertions
against a deliberately broken implementation and requires them to fail. A colour
check that passes while the video is broken is exactly its own failure mode.

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
