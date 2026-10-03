# Elusive Muse — design

One click, one card from the deck.

Elusive Muse puts a deck of 1,000 short prompts on the Move's screen, written
for it in the spirit of Brian Eno and Peter Schmidt's *Oblique Strategies*.
Click the jog wheel and the screen fills with pixel static
while small glassy notes scatter and gather. The static thins letter by
letter until one card shows through, and it lands on a soft chord. The card
fills the screen, centred, all of it. Click again for another.

**Status:** 0.2.0, released 2026-10-03 (catalog entry in
[charlesvestal/schwung#608](https://github.com/charlesvestal/schwung/pull/608),
not yet merged). 0.1.0 ran on a Move and worked as designed; 0.2.0 adds 500
cards and is installed on the same Move. *Static* screen, *Shimmer* sound, Schwung's
page bars with a small M for mute. Needs Schwung 1.6.2 or later. Written against
Schwung **v1.6.3** (`upstream/main`, fetched 2026-10-02).

**Module ID:** `elusive-muse` · **component_type:** `audio_fx`

## Lineage

- **Eno & Schmidt, *Oblique Strategies*** (1975; editions in 1978, 1979, 1996)
  is the inspiration. A deck of over 100 cards, each with a short instruction
  or cryptic remark. You draw one when you are stuck. The cards don't solve the
  problem. They send you looking somewhere you hadn't thought to look.
  **None of their cards are used here**: the idea is theirs, the 1,000 texts are
  new.
- **The name.** A muse is where ideas come from, and an elusive one is one you
  can't summon on demand. The module doesn't summon her either: it draws a
  card and leaves you to find the way.

## Which deck

**Our own 1,000 cards**, in `cards/elusive-muse.txt`, one per line, written
for this module in the spirit of the originals in two batches:

- **Lines 1–500, the working deck.** Short, open, sideways, and a little
  more about making music than Eno and Schmidt's are: the mix, the
  arrangement, the habits, with room for the body, the room and the day.
- **Lines 501–1,000, the imagination deck** (0.2.0). Deliberately a
  different register, so the second half is not more of the first: small
  scenes ("A launderette at midnight"), stories ("Something terrible
  happens in bar 17"), impossible materials ("The chord is made of glass.
  Carry it carefully"), games and chance ("Open a book at random. Use the
  first verb"), theatre, cinema, the sea, space, myth, physics, food and
  play. Fewer instructions about the mix, more pictures to make one from.

The two halves are shuffled together; the deck doesn't know which is which.

How they were checked:

- **Not the originals.** Every card was compared with the Eno and Schmidt
  cards (via [zzkt/oblique-strategies](https://github.com/zzkt/oblique-strategies),
  commit `8d9f634`): the Condensed Edition for the first batch, all five
  editions (239 distinct cards) for the second. Cards that came close ("Who
  is this for?"; "A photo finish" against "Is it finished?"; "Make the
  obvious impossible" against "Into the impossible") were rewritten or
  cut. The comparison is the only use of that text; none of it ships.
- **No repeats.** No two cards are the same, and near-mirrored pairs ("Rest,
  then decide" / "Decide, then rest") were cut to one.
- **The second batch is not the first again.** Each of its cards was
  compared by shared words with all 500 of the first, then read: 673 were
  written, and 173 cut for saying what a first-batch card already says
  ("Slow a second down until it becomes a song" beside "Slow a sound until
  it becomes a texture") or for crowding one picture (too many clocks,
  teacups and hats), or simply for being the weaker of two.
- **Every card points at the music.** After a read-through on 2026-10-03,
  85 second-batch cards were replaced: images with nothing to act on ("The
  silence wears a hat"), smells and tastes, chores ("Water a plant"), and
  cards that assume a lyric or a singer. Each replacement names something
  to change (a sound, a rhythm, a part, the arrangement) and passed the same
  checks against the other 915 and the Eno editions.
- **Every card fits the page whole** (see *Screen*). The longest is 57
  characters.

*Changed:* the first draft used the Condensed Edition itself. *Rejected*
because the texts are © Eno and Schmidt and published without a licence, so
the module could never be shared.

## Why an audio effect, and what that means

It goes in one of the slot's **audio effect positions**, after the synth.
That keeps it one page away while you play, instead of in the Tools menu,
which takes over the whole Move.

*Changed from the first draft, which made it a MIDI effect at the front of
the chain.* A MIDI effect cannot make sound: its API (`midi_fx_api_v1.h`) has
no audio output, so the sound would have had to go through the host's
sample-preview player, which is an untested route. An audio effect renders
audio itself, so the notes are mixed in by the module, sample-accurately,
with the exact recipe from the mockups.

**What it does to the slot's audio: nothing, apart from the notes.** The
incoming audio passes through untouched. The notes are *added* to the slot's
output, which has three consequences worth knowing:

- they go through any effects after it in the slot, and follow the track's
  volume (put it last in the slot if you want the notes dry);
- they are part of the track's sound, so resampling the track records them;
- the slot must keep rendering through silence, or a note with nothing else
  playing would never sound. `capabilities.requires_continuous_processing`
  does exactly that.

**Its one page is a screen the module draws.** Schwung calls this a *canvas*
page (`docs/CANVAS_PAGES.md`, `docs/MODULES.md` § `canvas`). Declared as
`as_page` + `page_first` + `enterable`, it is the page you land on, and once
entered the jog wheel and click go to the module. **Schwung keeps its own top
and bottom bars on a page** (`render_page_movy.mjs`: the module draws only the
band between them, rows 9–56); `show_footer: false` only applies to a
full-screen canvas. So the card gets 128×48 pixels, with Schwung's header
(module name, page name) above and its hint bar below. Canvas pages on an
audio effect are already proven upstream: `src/modules/audio_fx/widget-test`
has one.

**Screen and sound share one schedule.** On a click, the screen script works
out the spin (the dealt card, how many steps, the time of each step) and sends
the step times to the DSP once, as a parameter (`spin`). The DSP plays a note
at each time and the chord at the end, counting samples. The screen follows
the same timestamps on its own clock, started *after* the parameter call
returns, so the two start within one parameter round-trip of each other. A page's hooks get
`ctx.setParam`, scoped to the module's own slot (`shadow_ui.js`,
`canvasPageHook`), so the route exists. *To verify on device:* how quickly
the value arrives.

**One extra click, and why.** An `enterable` page is a *door*: you land on it,
and the **first click enters it**. After that, every click draws a card. Back
leaves the door. While entered, Shift+jog still pages out; the host keeps that
gesture so nobody can get stuck. *Rejected:* a fullscreen canvas you open from
a parameter cell, which needs the same extra click and also hides the page
behind a menu.

The idle screen before entering is the last card you drew, so landing on the
page still shows a card rather than a prompt.

## What a click does

1. **The winner is dealt before the reel starts**, like dealing from a real
   shuffled deck: you see every one of the 1,000 cards before any card repeats,
   and a reshuffle never deals the card already on screen.
   *Rejected:* letting the reel stop wherever its friction runs out. It looks
   the same, but the odds would follow the animation curve, and it can't
   promise no repeats.
2. **The spin is a list of 24–32 steps.** The gap between steps grows from
   30 ms to 380 ms along a steep curve, so it races and then crawls through
   the last three or four. A spin takes 2.7–3.6 s (measured over 2,000
   spins). With *Static* chosen no other card is ever shown, so the steps
   are only timing: the screen shows the winner's own letters as static from
   the first step. *Changed:* the mockups built a reel of filler cards
   backwards from the winner; the module doesn't need them.
3. **It lands.** The winning card fills the screen.

A **click during a spin is ignored.** *Rejected:* letting a click stop the
reel early. That would make the stopping point yours rather than the deck's,
and the cards only work if you didn't choose them.

## Screen

The card area is 128×48 pixels (rows 9–56; see above), one colour. **Each
card is centred and shown whole, with no scrolling.** That works because the type size follows the card: the module
uses the largest font in which the whole card fits.

The fonts are Tamzen bitmap fonts (free licence, already in
`schwung/fonts/tamzen`) at 10×20, 8×16, 7×14, 6×12 and 5×9. Measured against
all 1,000 cards in the 128×48 band, with 2 pixels at the sides and 1 at top
and bottom, keeping the mute mark's corner clear:

| Font | Cards |
|---|---|
| 10×20 | 155 |
| 8×16 | 244 |
| 7×14 | 588 |
| 6×12 | 13 |

Every card fits. The layout still falls back to 5×9, and then to 5×9 with
lines up to 2 pixels closer, so a longer card added later fits too. A canvas script only gets the host's 5×7 font through
`ctx.print`, so Elusive Muse **carries its own fonts as data** and draws them
with `fillRect`. That is the route the docs recommend, and `schwung-dr32`'s
`browser.js` does the same.

**Five candidate designs**, live and with sound, on the design canvas
(<https://claude.ai/artifact/Eu6oLKjkukhdE53gDjN1Jz>). All five land on the
same centred, whole-card layout. What differs is how the spin looks:

1. **Still.** Only the words. Cards slide upward like a vertical reel.
2. **Card.** A thin rounded outline, like the edge of the physical card.
   Cards are dealt sideways, and the last one settles with a small wobble.
3. **Cipher.** The text churns into random letters while the reel is fast.
   The churn calms as it slows, and the winner decodes left to right.
4. **Dial.** A reel of first lines passes two small marks, with the rows
   fading away from the middle. On landing, the marks part and the full card
   opens like a shutter.
5. **Dust.** At speed, cards are only a scatter of lit pixels. The winner
   condenses out of the scatter.

**Second round: Cipher without the reel.** You liked Cipher but not the
other cards flashing past. In these five, no other card ever appears: the
winner's own text is scrambled from the first tick and resolves as the reel
slows. The ticks still follow the same schedule.

- **A · Decode.** Letters lock in reading order, left to right, line by line.
- **B · Crack.** Letters lock in a random order, like a password being
  cracked.
- **C · Shapeshift.** The scramble keeps changing shape and size, borrowing
  the shapes of other cards, so you can't guess the length. It snaps to the
  winner's shape for the last four ticks.
- **D · Flap.** A split-flap departure board: each letter flips through the
  alphabet to its target, finishing left to right.
- **E · Static.** Each letter is a cell of live pixel static that thins out
  until the letter shows through.

**Chosen: E · Static.** No other card ever appears, so the spin's filler
cards only exist as timing; the screen shows the winner from the first step.

**Chosen: Schwung's bars as they are, with a small M** (board *Small M* on
the design canvas). The header reads ELUSIVE MUSE and the page name; the hint
bar says JOG PAGE · CLK ENTER outside and Schwung's own hints inside. While the
module's sound is muted, a small **M** in Schwung's own 4×5 lettering sits in
the card area's top-right corner (x 122–126, y 10–14) with one clear pixel
around it. The corner is kept clear whether muted or not, so a card never
moves when you mute: the two cards that would touch it drop one font size.
*Rejected:* a module-written header (M on the right) and hint bar (CLK DRAW ·
SHFT MUTE). Mocked up as *Wanted*; Schwung gives a page no way to write in
either bar, so it needed a host change and a fork.
*Rejected:* the full-screen canvas, which gets the whole screen and the Mute
button but shows a single cell until clicked.

## Sound

**Chosen: Shimmer** (board E4 on the design canvas). One small glassy note
for **every step of the spin**, so the notes speed up and slow down exactly
as the screen does. Each note is picked at random from a pentatonic scale on
D. While the static is thick the notes are scattered over nearly three
octaves; as it clears, the range gathers toward the middle and the notes get
a little louder and ring a little longer. While the static is thick, about
half the steps also get a faint breath of high noise. On landing, a soft
four-note chord (D, A, D, F♯) rolls in over 90 ms and rings out.

Each step knows how far the static has cleared using the **same curve as the
screen** (`resolved(i, n)`), so the sound and the pixels thin out together.

It is synthesised, using only sine oscillators, a noise burst through one
band-pass filter, and attack-decay envelopes. It ports directly from the
mockups' Web Audio graph to C:

| Event | Recipe |
|---|---|
| step note | sine at a pentatonic degree k above/below D5 (587.3 Hz), k uniform in ±(4 + 10·(1−r)); attack 3 ms, level 0.07 + 0.05·r, decay 0.12 + 0.35·r s |
| step breath | with probability 0.5·(1−r): 10 ms noise, band-pass 6 kHz Q 2, level 0.05 |
| landing chord | sines 293.7, 440, 587.3, 740 Hz at levels 0.14, 0.10, 0.08, 0.05; 30 ms apart; attack 6 ms; decays 2.4, 2.1, 1.8, 1.5 s |

*r* is how far the static has cleared, 0 to 1. Master level 0.55.

*Rejected, first:* a **woody tick** per step and a knock on landing
(resonant band-pass filters struck by a noise burst). It fitted a reel of
cards sliding past, but not pixels clearing.
*Rejected, second round* (all heard on the design canvas):
- **Crackle:** a spray of tiny electric clicks that thins with the static,
  landing on a sine chime.
- **Tuning:** radio hiss fading while a tone drifts into tune.
- **Chatter:** blips at random pitches narrowing onto one note.

*Rejected:* WAV files through `host_preview_play`. That was the only way a MIDI
effect could make sound, and the reason this is no longer a MIDI effect.
*Rejected:* playing the notes as MIDI into the slot's synth. The sound would
depend on whatever synth is loaded.

## Control surface

One page. No `ui_hierarchy` knobs.

| Control | Behaviour |
|---|---|
| Jog click | First click enters the page. After that: spin and land on a new card, ignored while spinning. |
| Shift tap | Mutes or unmutes the module's own sound (never the audio passing through). Shows the M. |
| Back | Leaves the page (the host's door behaviour). |
| Shift+jog | Pages out (the host's escape, not the module's). Not a tap, so it never toggles mute. |

**Why Shift and not Mute.** On a page, Schwung hands the module only the jog
turn and click (`page_controller.mjs`, `canvasPageMidi`); Mute never arrives.

**How the Shift tap actually works** (corrected while building; the first
draft assumed the draw path had `ctx.shiftHeld()` and `ctx.setParam`):

- Shift arrives as no event. The page's draw function, `drawPage`, runs every
  host tick, but its ctx can only draw (`frame_ctx.mjs`): no `shiftHeld`, no
  `setParam`. So the page polls **`shadow_get_shift_held()`**, the host
  global that `ctx.shiftHeld` itself calls. *Risk:* that global is the host's
  internal, not a documented page API. If a later Schwung hides it, the tap
  does nothing and everything else still works.
- A *tap* is a press and release with nothing in between: no jog turn or
  click (those reach `onMidi`, which spoils the tap), no gap in the frames
  (Shift+jog paging away and Shift+click opening the picker both take the
  screen), and no longer than 600 ms.
- The draw path can't set a parameter, so the page keeps the `setParam` of
  the last hook it was handed (`onMidi`, `handleBack`) and calls that.
  Before the first click in a session there is none: the tap is remembered,
  the M shows, and the `mute` goes out just ahead of the first `spin`, which
  is the first moment a note could sound anyway.
- `mute` is a module parameter, so it is saved with the set. The page reads
  it back through `extra_keys`; its own tap wins for 1.5 s while the read
  catches up, after which the DSP's value is the truth (a set was loaded).

## Implementation notes

```
elusive-muse/
  cards/elusive-muse.txt   the 1,000 cards, one per line
  fonts/tamzen/            the five Tamzen BDFs and their licence
  page/canvas.src.js       the page: onMidi / handleBack / drawPage
  src/
    module.json            audio_fx; requires_continuous_processing; params
                           `mute` (int 0..1) and `card` (canvas: as_page,
                           page_first, enterable, extra_keys [mute])
    dsp/muse.c             pass-through + Shimmer synth, audio_fx_api_v2
    canvas.js              GENERATED: the page with fonts and cards inside
    help.json
  scripts/gen_canvas.py    builds src/canvas.js (--check: is it current?)
  scripts/build.sh         arm64 .so + tarball (inside scripts/Dockerfile)
  scripts/install.sh       stage, rename, restart, prove the new .so is mapped
  tests/run.sh             test_muse.c, page.test.mjs, help_lint.mjs
```

The device loads one script, so the fonts and cards travel inside
`canvas.js` as data. `spin` is not declared as a parameter: declared ones
are saved with the set, and a restored `spin` would play a spin on load.
The DSP answers `chain_params` and `ui_hierarchy` with the same JSON as
`module.json`; a test compares them.

- **Timing uses elapsed time, not frame counts.** The reel is a list of
  timestamps, and each frame only asks which card is current. A slow frame
  rate makes the reel look choppier, never slower.
- **The deal and the schedule are pure functions**, so the tests can run them
  on a computer with a fixed random source.
- **The deck position survives** closing and reopening the page, kept in the
  overlay's per-slot `state`, so the shuffled deck carries on where it was.
- **Every text is original**, so nothing stops the module being published.
  The repo is still private; making it public is your call.

## Build order

1. ~~Choose the screen design.~~
2. **Device spike:** an audio effect whose canvas page sends a parameter on
   each jog click, and a DSP that answers with a note. This answers the one
   open question (can a canvas set its own module's parameter, and how fast)
   and checks the canvas frame rate on device.
3. ~~Audio pass-through, `module.json` with the canvas page, continuous
   processing.~~ Bit-identical in the tests; still to hear on the Move.
4. ~~Note and chord synthesis in C~~, still to compare by ear with the
   mockups.
5. ~~Fonts, fit and centring, with tests against every card.~~
6. ~~Deal and spin schedule, with tests; the `spin` parameter carrying it.~~
7. ~~The chosen spin animation.~~
8. ~~`help.json`, README~~, catalog entry (see *Releasing*).
9. ~~500 more cards (0.2.0).~~

Steps 3–8 were built before step 2 because the Move was not on the network
that day. ~~Step 2~~ then ran the whole module, 0.1.0, which worked as
designed.

## Testing

`tests/run.sh` (all passing at 0.1.0):

- **DSP** (`test_muse.c`, `-Wall -Wextra -Werror`, through the v2 API):
  pass-through bit-identical with no spin and again after one has rung out;
  every event fires at its sample (a test-build log, since a note starting at
  1e-4 of its level rounds to silence for a while); muted, a spin changes
  nothing; a mute silences within 6 ms; unmuting mid-spin resumes at the next
  step; `state` restores; malformed spins are ignored. Peaks: one spin
  about −17 dBFS, eight spins back to back with the chords overlapping about
  −15 dBFS (the notes are random, so it varies a little).
- **Page** (`page.test.mjs`, the real `src/canvas.js` driven the way the
  host drives a page): all 1,000 cards fit and are centred to within a
  pixel, stay inside the margins and out of the M's corner; 20 laps of the
  deck each hold every card, and the card on screen is never dealt again; gaps never
  shrink; a spin lands on the dealt card and draws exactly the plain card; a
  click or jog mid-spin sends nothing; the Shift tap, and the three things
  that are not taps (a hold, Shift across a page change, Shift with a jog);
  the M follows the DSP's saved mute.
- **Contract:** the DSP's `chain_params` and `ui_hierarchy` equal
  `module.json`'s; `src/canvas.js` is current with its sources; help lines fit
  20 characters.

**Frame cost**, the number to watch on the Move: the static draws at most
994 `fillRect` calls in a frame (one per horizontal run, not per pixel), and
the page's own work takes about 60 µs per static frame in node. QuickJS on
the Move's CPU will be many times slower; if the spin stutters, thin the
static first.

**On the Move** (step 2), in order:

1. Put it in a slot after a synth: the sound is unchanged until you draw.
2. Land on the page: the last card shows, header ELUSIVE MUSE / Card.
3. Click to enter, click to draw: static, notes, the card, the chord. Do
   the notes and pixels move together? (This answers how fast `setParam`
   arrives.)
4. Draw ten cards, clicking during a spin too.
5. Tap Shift: the M shows and the next spin is silent. Tap again. Then
   Shift+jog out and back in: no toggle.
6. Save the set muted, reload it: still muted.
7. Note what the hint bar says inside the door.

## Releasing

Same two tracks as the rest of the fleet: `scripts/install.sh` puts a dev
build on your Move and touches nothing else; `scripts/release.sh` is the only
thing that reaches anyone else.

`release.sh` refuses a dirty tree, an existing tag and a private repo, runs
the suite, pushes `main`, then tags `v<version>` from `src/module.json`.
The tag starts `.github/workflows/release.yml`, which checks the tag matches
the version, runs the suite again, builds in `scripts/Dockerfile`, attaches
`elusive-muse-module.tar.gz` to a GitHub release and commits `release.json`
to `main`. Schwung Manager reads that file.

**Once only**, the module needs an entry in Schwung's `module-catalog.json`
(a pull request to `charlesvestal/schwung`):

```json
{
  "id": "elusive-muse",
  "name": "Elusive Muse",
  "description": "Click the jog wheel and one of 1,000 original prompts, in the spirit of Oblique Strategies, comes out of pixel static with a few glassy notes. Audio passes through untouched",
  "author": "kliegsablaze",
  "component_type": "audio_fx",
  "subcategory": "utility",
  "github_repo": "kliegsablaze/elusive-muse",
  "default_branch": "main",
  "asset_name": "elusive-muse-module.tar.gz",
  "min_host_version": "1.6.2"
}
```

- **`min_host_version` 1.6.2:** `page_first`, and `extra_keys` on a page
  with no knobs, both arrived in 1.6.2 (`page_plan.mjs`; `docs/MODULES.md`).
  Enterable canvas pages arrived in 1.5.0.
- **`subcategory` utility:** none of the audio-effect subcategories
  describes a deck of prompts; Utility is the least wrong.
- **The repo must be public:** Schwung Manager downloads anonymously.
  Every card is original, so nothing stands in the way.
