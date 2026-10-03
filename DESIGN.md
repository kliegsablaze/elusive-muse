# Elusive Muse — design

One click, one card from the deck.

Elusive Muse puts a deck of 500 short prompts on the Move's screen, written
for it in the spirit of Brian Eno and Peter Schmidt's *Oblique Strategies*.
Click the jog wheel and the screen fills with pixel static
while small glassy notes scatter and gather. The static thins letter by
letter until one card shows through, and it lands on a soft chord. The card
fills the screen, centred, all of it. Click again for another.

**Status:** design only, nothing built yet. Screen and sound are chosen
(*Static* with the *Shimmer* sound, in Schwung's page bars with a small M for
mute; see *Screen* and *Sound*). Written against
Schwung **v1.6.3** (`upstream/main`, fetched 2026-10-02).

**Module ID:** `elusive-muse` · **component_type:** `audio_fx`

## Lineage

- **Eno & Schmidt, *Oblique Strategies*** (1975; editions in 1978, 1979, 1996)
  is the inspiration. A deck of over 100 cards, each with a short instruction
  or cryptic remark. You draw one when you are stuck. The cards don't solve the
  problem. They send you looking somewhere you hadn't thought to look.
  **None of their cards are used here**: the idea is theirs, the 500 texts are
  new.
- **The name.** A muse is where ideas come from, and an elusive one is one you
  can't summon on demand. The module doesn't summon her either: it draws a
  card and leaves you to find the way.

## Which deck

**Our own 500 cards**, in `cards/elusive-muse.txt`, one per line. Written for
this module in the spirit of the originals: short, open, sideways, and a
little more about making music than Eno and Schmidt's are, with room for the
body, the room and the day as well as the mix.

How they were checked:

- **Not the originals.** Every card was compared with all 195 cards of the
  Condensed Edition (via [zzkt/oblique-strategies](https://github.com/zzkt/oblique-strategies),
  commit `8d9f634`); one that came close ("Who is this for?") was rewritten.
  The comparison is the only use of that text; none of it ships.
- **No repeats.** No two cards are the same, and near-mirrored pairs ("Rest,
  then decide" / "Decide, then rest") were cut to one.
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
the same timestamps on its own clock. Both start within one parameter
round-trip of each other, a few milliseconds. A page's hooks get
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
   shuffled deck: you see every one of the 500 cards before any card repeats,
   and a reshuffle never deals the card already on screen.
   *Rejected:* letting the reel stop wherever its friction runs out. It looks
   the same, but the odds would follow the animation curve, and it can't
   promise no repeats.
2. **The reel is built backwards to land on it.** It is the current card,
   then 24–32 random cards, then the winner. The gap between cards grows from
   30 ms to 380 ms along a steep curve, so the reel races and then crawls
   through the last three or four cards. A spin takes about 2.5–3 s.
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
all 500 cards in the 128×48 band, with 2 pixels at the sides and 1 at top
and bottom, keeping the mute mark's corner clear:

| Font | Cards |
|---|---|
| 10×20 | 113 |
| 8×16 | 159 |
| 7×14 | 224 |
| 6×12 | 4 |

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
Shift doesn't arrive as an event either, but `ctx.shiftHeld()` can be asked on
every frame. A *tap* is a press and release seen by the page with no jog turn
or click in between, so the Shift+jog and Shift+click gestures pass untouched.
The mute is a module parameter (`mute`) the page sets with `ctx.setParam`, so
the DSP silences its notes and the setting is saved with the set.

## Implementation notes

```
elusive-muse/
  src/
    module.json        component_type "audio_fx"; requires_continuous_processing;
                       one canvas param: as_page, page_first, enterable
    dsp/muse.c         audio pass-through + note/chord synth, audio_fx_api_v2; params "spin", "mute"
    canvas.js          canvas_overlay: onMidi / tick / draw / handleBack
    fonts.js           Tamzen glyph tables (5 sizes, ASCII only)
    cards.txt          the 500 cards (copied from cards/elusive-muse.txt)
    help.json
  tests/run.sh
  scripts/build.sh, scripts/install.sh
```

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

1. Choose the screen design.
2. **Device spike:** an audio effect whose canvas page sends a parameter on
   each jog click, and a DSP that answers with a note. This answers the one
   open question (can a canvas set its own module's parameter, and how fast)
   and checks the canvas frame rate on device.
3. Audio pass-through, `module.json` with the canvas page, continuous
   processing. Check the slot sounds exactly as without it.
4. Note and chord synthesis in C, compared by ear with the mockups.
5. Fonts, fit and centring, with tests against all 500 cards.
6. Deal and spin schedule, with tests; the `spin` parameter carrying it.
7. The chosen spin animation.
8. `help.json`, README, catalog entry (see the legal note).

## Testing

`tests/run.sh`:

- the audio pass-through is bit-identical when no spin is running (compiled
  with `-Wall -Wextra -Werror`, driven through the v2 API);
- after a `spin`, a note starts at every step time, to the sample, and the
  chord at the end; the output never clips;
- every card fits the screen at some font size, and is centred to the pixel;
- the reel always lands on the dealt card;
- no card repeats within a lap of the deck, over many laps, and a reshuffle
  never deals the card on screen;
- the gaps between cards never shrink, and a spin lasts 2–3 s;
- a click during a spin changes nothing.

On hardware: put it in a slot after a synth and check the sound is unchanged
until you draw. Enter the page, draw ten cards, click during a
spin, and listen for whether the notes keep up at full speed.
