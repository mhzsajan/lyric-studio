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
--letter-var 0..0.12      # per-letter SIZE, clamped by LETTER_SIZE_CAP
```

Letters are **grapheme clusters**, not codepoints: `क्ष` is three codepoints
forming one glyph, and `नि` stores its pre-base matra *after* the consonant
though it draws to the left. Splitting on codepoints mangles both.

**The rule: a letter effect may touch opacity, translate, rotate, blur, clipPath
and glow. It may not scale, and may not change size past `LETTER_SIZE_CAP`.**

| `--letter-var` | what `हावा` looks like |
|---|---|
| `0` | one continuous bar (control) |
| `0.03` | bar continuous, letters differ subtly |
| `0.06` | a visible step; the bar notches but stays legible |
| **`0.12`** | **the cap — a syllable can be 112% beside one at 88%, and the notch is obvious** |

### `LETTER_SIZE_CAP` was 0.03, and it silently deleted the feature

`src/letters.js` clamps `--letter-var` to `LETTER_SIZE_CAP`. That cap was **0.03**
for most of the file's life, so `--letter-var 0.07`, `0.12`, `0.18` and `0.25` all
produced **byte-identical output**. The flag was documented, wired, checked, and
did nothing at any value a user would actually try — and it looked exactly like a
feature nobody implemented, which is the failure mode that is hardest to notice.

**A cap that is not mentioned at the call site is a feature that has been switched
off without saying so.** The cap is now **0.12** and the house style asks for all
of it, so the per-letter size difference is finally visible — which was the ask:
"per letter size, must be visible".

**The trade, stated plainly, because the table above is the argument against it.**
At 0.12 the shirorekha takes a visible notch, and the own table in `letters.js`
calls 0.12 "badly broken". It is wanted, so it is asked for. **0.06 is the number
to drop to** if the stepping reads as damage rather than as character. That is a
value that can be changed, not a ceiling that cannot.

Per-word `size` has the same shape and its own floor: **`MIN_FRACTION = 0.78`** of
the house size. `size` is a *floor*, not a peak, so a word may be 78% of 105px and
never less. "Never shrink the type too low" is a standing instruction and this is
where it is enforced.

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
--color-accent 0..1                # how much of a line is coloured at all
```

`calm` paints each **word**; `vivid` and `wild` paint each **letter** as well,
stepping the hue across the word so a conjunct stays one coloured object rather
than two clashing dots. The glow is tinted to the word's own colour, because a
white halo around a coloured word reads as a printing misregistration.

**But the unit the deliverable actually uses is the SYLLABLE, and `--color-accent`
is what makes white the default rather than the exception.** Three settings, in the
order they were tried:

| | `--color-accent` | what came out | verdict |
|---|---|---|---|
| 1 | `1.0` | every word coloured | "too colourful, don't use colours everywhere" |
| 2 | `0.12` | ~1 word in 8 coloured, the **whole word** | better, but the ask was "per letter… 2 3 letters only" |
| 3 | `0.12` | ~1 word in 8, and within it a **run of 2–3 syllables** | **ships** |

A coloured word in a one-syllable lyric is a coloured *line*, and a line of those
is a video that is coloured all the way through — which is what setting 1 was.
`syllableAccent()` in `src/color.js` does setting 3, and it accents a **run** of
consecutive syllables rather than a scatter, because a syllable is the unit the
shirorekha is drawn across: two non-adjacent syllables inside one word put two
colours inside one headline, which is gotcha 8 in colour form. It returns `null` for
a white syllable so the caller leaves the style key off entirely and the word
inherits the line's colour.

`vivid` and above step hue **across** a word, letter by letter. That is the
"fading" that was rejected by name, so the house style is `calm`.

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

| level | hue span | saturation | lightness band | per letter |
|---|---|---|---|---|
| `calm` | ±18° | 0.10–0.34 | 0.87–0.98 | no |
| `vivid` | ±62° | 0.38–0.70 | 0.80–0.95 | yes, 8–18°/letter |
| `wild` | ±180° | 0.55–0.95 | 0.73–0.93 | yes, 22–48°/letter |

`duo` is not on that ladder — it has its own `DUO_CHROMA` band, and it is
**narrow on purpose**: sat 0.90–1.0, light **0.48–0.54**. A wide band is what makes
one word in a line paler than its neighbour, which is legal in isolation and a
visible fade in a row.

### `LUMA_FLOOR` is a GUARD, not a target — and it is hue-aware

`LUMA_FLOOR = 0.20` (51/255). The number moved **40 → 158 → 115 → 0.20** and the
reason it had to move is the single most instructive thing in this file.

**A saturated hue cannot be brightened by scaling.** Red is already 255 in its own
channel and carries only 0.2126 of the luminance budget, so the only lever left is
*desaturation* — which is what "fading colours" is. Chasing a bright red took the
value through `rgb(255,132,132)` (rejected: "fading colours") and then
`rgb(255,77,77)` (rejected: "not vibrant red"). Both attempts were **solving
lightness from a luminance target**, and that solving is what desaturated the red.

So the accent now states a **saturation and a lightness directly**, and the floor's
only job is to reject a colour that would **disappear**.

**`luma()` must be hue-aware, and was not.** Pure red is luma 54, pure blue is 38,
pure blue-violet is 18 — blue carries 0.0722 of the luminance against red's 0.2126,
so identical HSL differs by 7× in brightness. The old `luma()` reported one number
for all three, which meant the `LUMA_FLOOR` assertion in `check_color.mjs` was
**measuring pure red's brightness while looking at a blue swatch** — it cleared
invisible colours, and `--color-hue 210`, the house style's own value, produced
words ~40% darker than the check believed. A green tick on unreadable words is the
rule-2 failure in its purest form.

`ensureReadable()` applies the floor to **every** colour the file emits, raising
lightness while holding hue and saturation. Seven of the twenty named reds measure
below 51 — mahogany at 24, maroon at 27 — and they are **lifted**, with the lifts
enumerated by `check_color.mjs` rather than hidden. Dropping them would have
honoured the names and lost the words.

`lightForLuma()` returns `hi`, not `(lo+hi)/2`, from its bisection: the loop
maintains `luma(lo) < want ≤ luma(hi)`, so `hi` is the only value guaranteed to
**meet** the target. The midpoint returned a hair under often enough that every dark
hue in a batch came out at 158/255 against a floor of 0.62 (=158.1) and the floor
assertion failed **on its own output** by three hundredths of a level. A solver that
returns less than the number it was asked for will eventually be blamed for the
caller's arithmetic.

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
| `duo:N` | anchor **and** `hue+180-N`, given as a numeric parameter |

Hues are dealt as a seeded **permutation**, not `slot = wordIndex % slots.length`.
The modulo version puts words 1 and 4 on the same hue in a four-word line, so the
line reads a-b-a-b; a permutation gives every neighbouring pair a different
colour. `rainbow` is kept rather than deleted because it reproduces a look you
have already seen.

### Named palettes — `warm`, `reds`, `materials`

**A named palette is EXACT, and a generated one is not.** These are real hex
values, not hues reconstructed from an anchor:

| palette | n | what it is |
|---|---|---|
| `warm` | 10 | **the shipped one.** GOLD `#FFC300`, YELLOW `#FFD400`, AMBER `#FFB000`, ORANGE `#FF8A00`, ORANGE RED `#FF5A00`, VERMILION `#FF3B00`, RED `#F01A00`, CORAL RED `#E0305A`, CRIMSON `#DC143C`, CARMINE `#B00040` |
| `reds` | 20 | the twenty reds from a supplied reference |
| `materials` | 33 | `reds` plus thirteen metals and earths |

`reds` is kept as its own palette rather than folded into `materials`, because a
user who asked for twenty specific names should be able to return to **exactly
those twenty** with one flag.

The reason this exists at all: "mahogany" is `#420D09`, and reconstructing that as
"a dark red near hue 0" is a different colour that happens to sort near the same
place. Names are data.

`warm` is a **ramp**, not a scatter — ten steps that run gold → yellow → amber →
orange → orange-red → vermilion → red → coral red → crimson → carmine. Ordered, it
reads as one heat. Shuffled at random, it reads as a bag of swatches, which is why
the palette is kept in ramp order and dealt by permutation rather than sampled
blindly.

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

### The tear bar is measured per font, and it used not to be

**The bar's height is `descent − inkBottom` for whatever face is in use**, not a
constant. The bar sits at `bottom: 0` of the word box, so the only space it may
occupy is between the glyph **ink** and the box's lower edge.

That space varies **79×** across this batch's fonts: **0.006em** for Himalayabold,
**0.474em** for MKali. The bar was a hardcoded `0.34em` with a
`rgba(255,255,255,0.85)` top edge, which means for a 0.006em face it was roughly
**fifty times taller than the room available** and it drew a bright horizontal edge
straight **across the bottom of every letter in ten of the eleven fonts**. The
report was "the bottom of the text is cut" — and it was, by the effect intended to
decorate it.

`scripts/metrics_probe.py --write` measures each font's room and caches it in
`width.json`; `check_cut.mjs` asserts the bar never reaches the ink. **This is the
reason a constant is suspect here in general:** a torn edge that clips is not a
subtle effect, it is a defect that looks like one.

### The one number in it that is still NOT measured

`LETTER_ANGLE_CAP = 2.0°`. This is a deliberately conservative first estimate, and
it is the one value here I would not trust without looking. To measure it: render
one word at 2, 4, 6 and 10 degrees, crop the headline, and look at the boundary
between each rotated letter and its neighbour. At 2° the step should be sub-pixel
at 1080p. If it looks too timid, raise it.

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

### But `--type letter` is OFF in the delivered files, and that is a correctness call

The fitting above guarantees the chain finishes in time. It does **not** remove the
reveal, and the reveal is the problem: a syllable is revealed by clipping it with
`inset(0 X% 0 0)`, so **mid-reveal a syllable is half-drawn** — and a half-drawn
Devanagari syllable is a *different letter*.

On a white word that is a soft entrance and nobody mentions it. On **the one word
in the line that is coloured** it is glaring, because that is the word the eye goes
to: the report was "the red word makes the sentence incorrect", and then, on the
accented frame of Jam Na Maya, "some issue with jam na maya".

So `--type` is off in the delivered batch, and the honest cost is on the record:
**you lose the typed-on reveal.** The other motion layers are untouched — depth,
`--motion`, word and letter animation all still run, so the line still moves. Given
a choice between an effect and a letter that reads as a different letter, the letter
wins. It is a flag; `--type letter` restores it in one place.

Worth separating two things that were confused here: "the word was still arriving
past the end of its cue" is a **timing** fault and the chain fitting fixes it.
"the word was half-drawn *during* its cue" is a **legibility** fault and no amount
of fitting touches it. Both reports arrived as "the text breaks the meaning of the
letter", which is why it is written down as two.

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
  --loudest --color-scheme warm --color-accent 0.12 --cut word
```

Renders **one line**, full frame size, with every flag the real render would use.
A quarter-resolution preview is worse than none: it changes how a glow reads and
how a 2° letter rotation reads, which are exactly the things being judged.

**Judge with the house flags, not with the loudest ones you can find.** The first
version of that command here was `--color-mode wild --cut word --type letter`,
which is three flags the delivered batch does not use — `vivid`+ for the
"fading", `--type letter` for the half-drawn syllable (§9). A preview built from
flags the real render does not use will disagree with the real render, and you
will spend the afternoon fixing the preview.

`--presentation r-word` (the default) **pins the layout**, and the tool prints it.
That is a correctness fix, not a convenience: the preview writes a one-cue `.lrc`,
so the mix plan would otherwise deal cue 0 as `c-phrase` — a phrase unit, which
has no word spans, so `--cut` and `--type` would correctly do nothing and the
preview would teach you that a working feature is broken.

---

## The house style

This is what the seven delivered videos were rendered with. It is
`scripts/render_all.mjs` verbatim — and note that it is **not** `--loudest` alone.
`--loudest` sets the motion layers; the delivered look overrides four of them.

```powershell
--loudest            # depth, motion, word+letter anim, size, mix placement
--size-preset medium # 105 / 0.08 / 0.05  <- the house size
--letter-var 0.12    # the full cap, so per-letter size is actually visible
--color-scheme warm  # the ten-step warm ramp
--color-hue 0
--color-accent 0.12  # ~1 word in 8 coloured; the rest stay WHITE
--color-mode calm    # per word. vivid+ steps hue ACROSS a word = "fading"
--cut word           # the newspaper look, every word a clipping
--wrap rows          # long lines become rows at full size, not one shrunken row
--mode mix --mix-block 8
--scanlines 40 --scanline-alpha 0.06
--shadow "0 3px 16px rgba(0,0,0,0.85)"
```

Three flags the house style deliberately does **not** set:

| | why not |
|---|---|
| `--type letter` | half-drawn syllables read as different letters — see §9 |
| `--x-pos` | moved a settled line sideways between cues; with the motion layers on it read as jitter, not variety |
| `--color-mode vivid`+ | steps hue across a word, which is the "fading" that was rejected |

**Every one of `--loudest`'s layers yields to an explicit flag.** `--loudest --size
90` is the full treatment at a smaller size, not a fight between two settings.

### Where the text sits, and why

**Upper-mid, 30/40/50 of frame height** — a delivery constraint, not a composition
one. The material plays on a stage screen that sits **high**, so the bottom of the
frame is where the audience cannot see and the top is lost to whatever is above the
screen. The usable area is a **band**, not an edge.

Three things enforce it, and all three exist because one alone did not work:

| | what it does | why it was not enough alone |
|---|---|---|
| `geometry()` 30/40/50 | where a block **begins** | a block grows *downward*, so a many-row line walks straight back out of the band |
| `MAX_BOTTOM = 0.72` | caps where a block may **end** | without it, one cue reached **94% of the frame** |
| `SIDE_SAFE_VW = 4` | 4vw clear on **both** sides | a band's `left` may be 0vw, and at 1:53 the ink began at exactly x=0 |

`scripts/band_report.py` checks sampled cues against both edges. "Is it centred"
would pass a block hanging off the bottom of the visible area.

## Verify before shipping

```powershell
node scripts\check_all.mjs          # every fast suite -- 23 of them
node scripts\check_motion.mjs        # deck, no repeats, ends, no first-frame pop
node scripts\check_animation.mjs     # pools, the shirorekha rule, drift bounds
node scripts\check_depth.mjs         # sequence fits the span; tracking is a gap
node scripts\check_color.mjs         # the luma floor, hue-aware, and a broken impl
node scripts\check_cut.mjs           # the angle cap; the bar never reaches the ink
node scripts\check_typing.mjs        # the typing chain fits every cue span
node scripts\check_title.mjs         # the title word fires on the title and NOTHING else
node scripts\check_smoke.mjs         # renders a real frame -- catches a missing binding
py   scripts\scan_visibility.py out\<song>.mp4 <song>.lrc <song>.ends.txt
```

The last one is the one that answers *"is any word visible after it should have
ended"*, by decoding every frame rather than sampling.

Two of these are worth reading before trusting them, because each runs its own
assertions against a deliberately broken implementation and requires them to fail:

- **`check_color.mjs`** — a colour check that passes while the video is broken is
  exactly its own failure mode.
- **`check_title.mjs`** — the assertion with value is that the highlight fires on
  the title and on **nothing else**. A substring match would light up every word
  that merely *contains* the title word, and that is the bug that looks like a
  feature working.

`check_smoke.mjs` exists because of a class no other suite can see: **a prop
accepted on a composition but never passed to the function that reads it**.
`cutRoom` and `typeLag` were both destructured and both used, neither passed, and
the module *parsed* — all 22 other suites stayed green and Remotion reported a bare
frame number with no file and no stack. One of them cost five renders.

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
