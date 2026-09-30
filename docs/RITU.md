# ऋतु / RITU — the full-frame piece

**Status: design locked, build starting.** This is the first deliverable that is
not the text-only overlay. Everything the batch of fourteen overlay videos is,
and everything this one is, is written down here so the settings cannot drift
while it is being built.

Read this before changing a flag on either kind of render.

---

## 1. What the song says

The design comes from the words, not from a mood board. So: the words.

**ऋतु** means *season*. The singer is not a song about a lost lover in the
ordinary sense — it is a **season refusing to be a season.** She is the one thing
that does not turn, does not return, and cannot be waited for.

Four stanzas and two refrains. The refrain — **बित्ला है तिम्रो जिन्दगी** —
closes every stanza, and the plea to the listener — **मेरो भावलाई बुझ** —
arrives immediately before it every time. The whole song is built on that order:
*understand me, then let your life pass.*

| | |
|---|---|
| फर्केर आउने छैन | you will not come back |
| म कुनै ऋतु होइन | I am no season |
| मेरो आश नगर | do not hope for me |
| माया दुईतर्फी हुन्छ | love runs both ways |
| एकोहोरो हुँदैन | never one-sided |
| कसैको माया पाउन, अति नै गाह्रो हुन्छ | to be loved by anyone is very hard |
| सजिलै माया पाउन, कहिल्यै सकिँदैनँ | to be loved easily — never happens |
| मेरो भावलाई बुझ | understand my feeling |
| **बित्ला है तिम्रो जिन्दगी** | **may your life pass** |

### Structure, and it is not decorative

Probed from the `.remotion_start.lrc` / `.remotion_end.lrc` pair. 42 cues.

| | | |
|---|---|---|
| **0.0 → 66.4s** | 66 seconds | instrumental. **No lyric at all.** |
| 66.4 → 117.6s | cues 0–15 | stanzas 1 and 2 |
| 117.6 → 139.6s | 22 seconds | instrumental break |
| 139.6 → 159.0s | cues 16–21 | verse |
| 159.0 → 213.8s | cues 22–35 | stanzas 3, 4, 5 |
| 213.8 → 235.6s | 22 seconds | instrumental break |
| 235.6 → 251.0s | cues 36–41 | verse again |

Two 22-second breaks with no lyric, and a 66-second cold open. That is a third of
the song with nothing to read, and it is the reason the piece is built on a
**camera move that needs no words to work.** The zoom carries those 110 seconds
on its own.

---

## 2. The visual system

### The infinity zoom is the concept, not an effect

Everything else in this lyric **resolves**: a stanza ends, a refrain returns, a
verse closes. The one thing that does not resolve is a season, and the entire
song is about excluding herself from that. So the camera falls forward forever and
never arrives.

That is also why it fits the structure: a move that cannot end is the only thing
that can hold 66 seconds of silence without the screen being dead.

- **Constant fall.** Scale grows every frame. There is no cut back, no reset, and
  no establishing shot — a cut would be a resolution, which is the thing being
  refused.
- **Never a still frame.** Every frame differs from the last. A pause would read
  as an ending.
- **The zoom accelerates at the refrains** and eases back in the breaks, so the
  song's shape is felt rather than announced.
- **Type comes into focus as the camera passes it** and dissolves behind. A line
  is read while it is *being reached*, not while it sits still.

### Newari and Nepali material, drawn — not stock

Every motif is **procedural SVG in the repo**, no image assets. Reasons: it scales
infinitely without resampling, every curve stays crisp at any zoom, and the
palette stays controllable per element rather than being baked into a PNG.

### A NOTE ON DRAWING A GOD, AND WHAT IS ACTUALLY BEING DRAWN

The brief asks for gods and deities. That needs saying plainly rather than
discovered later in a render: **a recognisable Newar deity figure — Taleju's
face, Bhairav's crown, Machhendranth's hair — cannot be drawn procedurally.** It
has to be *drawn*, by someone who knows the iconography, or it comes out a
smiley blob, and a wrong-faced deity is worse than no deity.

So the piece does not attempt portraiture. What it draws instead is the material
that actually surrounds those figures in a Newar temple, which is *made of the
same geometry*:

- the **kīrtimukha** — the "face of glory", the monster-mask that sits on every
  torana, beam-end and eave in the valley. This is the signature Newar motif and
  it **is** a face, so it carries the register honestly.
- the **chaitya arch**, **śikhara**, **amalaka** and **kalasha** finial — the
  body the deity sits in
- the **cakra**, **vajra**, **triśūla**, **padma**, **nāga hood**, **śvasti**
  — the emblems in hand
- **Lakhey** and **Charya** mask forms — stylised, which is the correct register:
  these are *already* stylised, worn and carved

That is a deliberate substitution and it is the right one: the piece is about a
temple and a season, not about an icon. If a specific deity must be identifiable,
that is an illustration job with reference photographs, and it belongs in a
different file.

### THE TAXONOMY

**Temples and architecture** — the primary material, and all geometric.

| | |
|---|---|
| **नयापान** Nayapāṇa | Nyatapola, Bhaktapur — five-storey pagoda, the tallest in Nepal |
| **पाँचतो** Pāñcatō | the five-tier roof, tiered and shrinking, eave over eave |
| **चैत्य** chaitya | the stupa form: dome, harmika, square canopy, spire |
| **स्वयम्भू** Swayambhū | the hill stupa, gilded spire |
| **बौद्ध** Bauddha | Boudhanāth — the great bell dome, eyes on the harmika |
| **ज्ञान** Jñāna | Kōpan, the Tibetan-turned-Newar monastery dome |
| **बहल** bahal | the monastery quadrangle; Chhusya Bahal, Hiranya Varna, Itum, Hiranya |
| **तोर** tora | the torana — a two-storey gate, stepped or arched |
| **पीयल** pīyal | the plinth, tiered and moulded |
| **बज्र** bajra | the cornice under the eave |
| **जुया** juyā | the window — wooden, latticed, in a timber frame |
| **मेवा** mewa | the carved wooden eaves, deep, casting the shadow that makes it read |
| **छाप्र** chhapra | the struts under the eave |
| **सुरसिंह** sūrasiṃha | the horse-and-rider bracket, ubiquitous on Newar timber |
| **सिरी** sīrī | the beam-end bracket, a lion at rest |
| **विमान** vimāna | the tiered roof tower over the sanctum |
| **अमलक** amalaka | the ribbed disc crowning the spire |
| **कलश** kalasha | the finial pot on top — the last thing to be gilded |
| **नरी-कुना** nari-kuna | ornamental fired-brick filigree, the lattice built in brick |
| **पाना** pānā | the timber lattice screen, *kāf* carving in the joints |
| **हंस** haṃsa | the swan bracket, and the kalasha bird |

**Gods and deities** — as emblems, masks and seats. Not portraiture.

| | |
|---|---|
| **सेतो मच्छिन्द्रनाथ** Seto Machindranāth | the great protector deity of the valley; white, paired at the temple in Kathmandu |
| **मच्छिन्द्रनाथ** Machindranāth | the tantric protector, at Kīrtipur, City of the Fish |
| **कुमारी** Kumārī | the Living Goddess; the Kumari Ghar, and Taleju's swing at Bhaktapur |
| **तालेजु** Taleju | Bhaktapur's Bhairavī; the temple whose swing Kumāri rides |
| **भैरव** Bhairav | the gate-guardian; Bhairavnath at the Bhaktapur gate, Akshobhya Bhairav in the valley |
| **पशुपतिनाथ** Pashupatināth | the national shrine; the lintel of every nārī-kāṇḍa |
| **काल पाण्डे** Kāla Pāṇḍe | the tantric god who destroyed the demon Kālī |
| **अक्षोभ्य** Akṣobhya | the immovable one; the temple that guarded the valley after the earthquake |
| **क्रोध** Kra-dha | wrathful protectors at the threshold, in brass |
| **दुर्गा / महिषासुर** | Durga, buffalo-slayer |
| **शिवलिङ्ग** śivaliṅga | the aniconic form — the presence without a likeness |
| **पद्म** padma | the lotus the deity is seated on, and the vāmana stupa's bloom |
| **चक्र** cakra | the wheel of law on the spire and the Dharmachakra puns |
| **वज्र** vajra | the thunderbolt, double-ended, on the finial |
| **तिर** triśūla | the trident |
| **नाग** nāga | the serpent hood — the umbrella over the Buddha, and the Nag Pokhari |
| **लक्ष्मी** Lakṣmī | the goddess of the doorway, in the Torana's centre |
| **सरस्वती** Sarasvatī | Itum Bahal, the valley's music |

**Kirtimukha**, called out because it is the one motif that must be right: the
"face of glory" on every Newar beam-end, over every door, on the Keśhav Narayan's
torana. Drawn as a stylised lion-kirti face — wide jaw, curling tongue, flanked by
scrolls — because that is what it is.

**Culture and festival** — the calendrical register, since the song is about *ritu*.

| | |
|---|---|
| **ऋतु** ritu | the seasons — the word of the song |
| **इन्द्रजात्रा** Indrajātrā | Kathmandu's great festival; the chariot, the forge, the masked dancers |
| **बिस्केत** Bisket | Bhaktapur; the newakwor who may take the city, and the unsheathed sword |
| **जयबागेश्वर** Jayabhageśvara | the temple whose festival draws the whole valley |
| **हाती** hātī | the elephant dance at Indrajātrā |
| **लाखे** lākhe | the Lakhey dancer — a masked figure, and the only one here that is deliberately comic-frightening |
| **छिउ** chhiu | the hide-and-seek festival, dusk, played by children |
| **सिरी** sirī | the rice-planting song of the field, and of the bride |
| **यहूकुंडा** yahūkuṇḍā | the Newar spiral doughnut, ring-shaped, offered at festivals |
| **सेल रोटी** sel rotī | the ring bread |
| **बाँटी** bāṇṭī | the rice flour offering |
| **पोथ** poṭha | the Newar coin — a small square punch of silver |
| **पट** paṭa / dhaka | the woven cloth, ikat, in the festival colour of the season |
| **चार्या** cāryā | the Charya ritual dance, and the Charyāgita songs |
| **मारुनी** mārunī | the Patan jāta dance — the best-known of them |

**Gosain.** The brief said "nepali arts, gos, newari cultures". Read as the
**Gosain** — the Newar landlord-patron class who endowed the chaityas and the
bahal monasteries of the valley. So the *patron* register carries the piece: the
temple elevation, the endowed lattice, the kalasha a donor gilded. If "gos" meant
something else, this section is the one to correct and the code is organised so
that swapping one motif module changes nothing else.

### Palette — dark, damped, one accent

Brief: *not so bright*. The overlay deliverable's red-and-white is a constraint
that exists because it is blended Add/Screen over a **camera feed** and must not
fight it. This piece has no camera feed under it, so that constraint does not
apply here, and holding it would fight the brief.

| role | value | note |
|---|---|---|
| ground | `#0B0C10` | near-black with a blue cast, not pure black |
| deep field | `#151A22` | behind the motifs, gives depth without brightness |
| motif ink | `#2A3038` → `#4A4038` | cool-to-warm as the zoom goes deeper |
| oxblood | `#6E1F26` | Newari lacquer red, muted hard |
| ochre | `#8A6A3A` | aged brass, never gold |
| bone | `#E8E2D6` | the type. Warm white, never `#FFFFFF` |

The saturated red stays **one accent only**, on the same 0.35 probability as the
overlay, so a line is normally bone with one word lifted. Nothing glows, nothing
blooms, nothing is allowed to reach full chroma.

### Type

Not the overlay's block. Here the lyric **is** the typography:

- the refrain **बित्ला है तिम्रो जिन्दगी** is set at a larger scale and holds
  longer than any other line, because it is the thing the song repeats
- **मेरो भावलाई बुझ** — the plea — is the only line allowed to be centred
- stanza lines drift off-axis in opposite directions, for **दुईतर्फी** (both ways)
- the season word **ऋतु** is set as a wordmark, once, and never repeated as a
  normal line

---

## 3. Beat sync — how it is measured

Beat sync is **off for the overlay batch** and **on for this piece**, and the
reason is the opposite in each case.

- **Overlay:** the `.lrc` is ground truth. Beat sync would move a line off the tap
  the ends file proves, so it stays off. See `docs/PIPELINE.md`.
- **Ritu:** the lyric is already locked to the audio. What the grid is *for* is
  **not** moving text — it is quantising the **camera**. Every motif ring, every
  lattice subdivision, and every zoom pulse lands on a beat, so the motion is
  felt as musical even when there is no lyric on screen for 66 seconds.

So: `detect_beats.py` runs once, `--beats` carries the grid into the composition,
and the grid drives **motion only**. A text-timing assertion still holds — every
cue clears at its tapped end, checked by `scan_visibility.py` over every frame.

**This is the first project where beat sync is allowed to exist, and it is still
not allowed to touch a lyric's timing.**

---

## 4. Settings that must not drift

These are the agreed look for **both** deliverables. A render that differs from
this table is wrong, and the reason each value is that value is recorded so it can
be argued with rather than re-guessed.

### The fourteen overlays

| setting | value | why |
|---|---|---|
| size | `--size-preset medium` (105 / 0.08 / 0.05) | house size, judged on Kali Kali |
| colour | `--color-scheme duo --color-hue 0 --color-accent 0.35` | red and white only |
| accent rate | `0.35` | ~15% of words red; 1.0 is a coloured sentence |
| motion | `--loudest` on fast songs | every layer, including dancing |
| colour grain | **per word** on fast songs | |
| colour grain | **per letter** on slow songs | a slow line holds long enough to read it |
| `--cut word` | fast songs only | torn clippings read playful |
| `--type letter` | both | the typed-on reveal |
| `--word-fill 0.78` | both | the hold before the next line |
| `--wrap rows` | both | long lines typeset, not shrunk |
| `--x-pos` | both | per-cue horizontal placement |

### The slow songs — Ritu and Timilai Bhuleko, and nothing else

No dancing, no torn paper. Concretely:

| | fast | **slow** |
|---|---|---|
| `--loudest` | yes | **no** |
| `--cut` | `word` | **off** |
| `--word-anim` | `mix` | **`reveal`** — a rise into place |
| `--motion` | `wild` | **`calm`** |
| `--depth` | `wild` | **`calm`** |
| colour | `calm` (per word) | **`vivid` (per letter)** |

`--motion calm` is not automatically gentle, and this was checked rather than
assumed. Its pool is 9 of 21: `lift dive slideIn slideOut orbit pop punch
zoomThrough squash`. It **excludes** `swing tilt flip skew wipe unblur
scrambleWipe flare shimmer spiral snap breathe`. The line entrance is kept at
`calm` deliberately — `lift` and `dive` are gestures, not dances — while the
**per-word** animation, which is the layer that actually bounces, is pinned to
`reveal`.

### Slow treatment for the Ritu piece itself

Stricter than the Ritu **overlay**, because there is no camera feed to protect and
the song is the quietest of the seven. **No dancing and no cut at all**, on any
layer, including the line entrance: `--motion` and `--depth` are restrained to
the gentlest settings and the zoom carries the motion instead.

---

## 5. What is settled and what is still open

**Settled.** Palette direction (dark, oxblood single accent, bone type). The
infinity-zoom concept and why. Procedural SVG over image assets. Beat sync
drives motion, never text. Every `.lrc` end stays exact. The Gosain reading.

**Open — needs the user.** Nothing blocks the build; these change what gets
tuned once there is something to look at:

- how deep the zoom goes per stanza, and whether the accelerates align to the
  refrain or lead it
- whether the type leads the camera or arrives with it
- ambient sound: this piece is meant to carry the audio, and whether a room tone
  is wanted under the 66-second cold open

---

## 6. Where the code is

| | |
|---|---|
| `src/ritu/` | the piece: motifs, palette, camera, composition |
| `docs/RITU.md` | this file |
| `scripts/render_ritu.mjs` | the one command |

**The one constraint that is not negotiable while anything else renders:** every
render writes `src/lyrics.generated.js`, and two at once in one tree means the
last-prepared font wins. The batch of fourteen holds that file. **Ritu renders
only after it is free** — which is why the build here is code, not output.