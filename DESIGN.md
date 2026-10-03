# Elusive Muse — design

One click, one card from the deck.

Elusive Muse puts Brian Eno and Peter Schmidt's *Oblique Strategies* on the
Move's screen. Click the jog wheel and the cards run past with a wooden
clatter that slows down with them, then stop on one with a single knock.
The card fills the screen, centred, all of it. Click again for another.

**Status:** design only, nothing built yet. The screen is chosen (Static);
its sound is not: four candidates are mocked up live (see *Sound*). Written against
Schwung **v1.6.3** (`upstream/main`, fetched 2026-10-02).

**Module ID:** `elusive-muse` · **component_type:** `audio_fx`

## Lineage

- **Eno & Schmidt, *Oblique Strategies*** (1975; editions in 1978, 1979, 1996).
  A deck of over 100 cards, each with a short instruction or cryptic remark.
  You draw one when you are stuck. The cards don't solve the problem. They
  send you looking somewhere you hadn't thought to look.
- **The source text** is [zzkt/oblique-strategies](https://github.com/zzkt/oblique-strategies)
  (commit `8d9f634`). It holds each edition as a plain text file with one card
  per line.
- **The name.** A muse is where ideas come from, and an elusive one is one you
  can't summon on demand. The module doesn't summon her either: it draws a
  card and leaves you to find the way.

## Which deck

The **Condensed Edition** (`oblique-strategies-condensed.txt`, 195 cards). It
merges all four published editions, adds entries from Eno's published diary,
and removes duplicates.

*Rejected for now:* choosing the edition. You asked for one page with one
control. The cards live in a plain text file next to the code, so you can swap
the edition by replacing that file.

## Why an audio effect, and what that means

It goes in one of the slot's **audio effect positions**, after the synth.
That keeps it one page away while you play, instead of in the Tools menu,
which takes over the whole Move.

*Changed from the first draft, which made it a MIDI effect at the front of
the chain.* A MIDI effect cannot make sound: its API (`midi_fx_api_v1.h`) has
no audio output, so the ticks would have had to go through the host's
sample-preview player, which is an untested route. An audio effect renders
audio itself, so the ticks are mixed in by the module, sample-accurately,
with the exact recipe from the mockups.

**What it does to the slot's audio: nothing, apart from the ticks.** The
incoming audio passes through untouched. The ticks are *added* to the slot's
output, which has three consequences worth knowing:

- they go through any effects after it in the slot, and follow the track's
  volume (put it last in the slot if you want the ticks dry);
- they are part of the track's sound, so resampling the track records them;
- the slot must keep rendering through silence, or a tick with nothing else
  playing would never sound. `capabilities.requires_continuous_processing`
  does exactly that.

**Its one page is a screen the module draws.** Schwung calls this a *canvas*
page (`docs/CANVAS_PAGES.md`, `docs/MODULES.md` § `canvas`). Declared as
`as_page` + `page_first` + `enterable` with `show_footer: false`, it is the
page you land on, the host draws nothing over it, and the jog wheel and click
go to the module. The only things on screen are the words. Canvas pages on an
audio effect are already proven upstream: `src/modules/audio_fx/widget-test`
has one.

**Screen and sound share one schedule.** On a click, the screen script works
out the spin (the dealt card, how many steps, the time of each step) and sends
the step times to the DSP once, as a parameter (`spin`). The DSP plays a tick
at each time and the knock at the end, counting samples. The screen follows
the same timestamps on its own clock. Both start within one parameter
round-trip of each other, a few milliseconds. *To verify:* that a canvas
script can set a parameter on its own module, and how quickly it arrives.

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
   shuffled deck: you see every one of the 195 cards before any card repeats,
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

128×64 pixels, one colour. **Each card is centred and shown whole, with no
scrolling.** That works because the type size follows the card: the module
uses the largest font in which the whole card fits.

The fonts are Tamzen bitmap fonts (free licence, already in
`schwung/fonts/tamzen`) at 10×20, 8×16, 7×14, 6×12 and 5×9. Measured against
all 195 cards with a 4-pixel margin:

| Font | Cards | Example |
|---|---|---|
| 10×20 | 68 | *Abandon desire* |
| 8×16 | 75 | |
| 7×14 | 43 | |
| 6×12 | 5 | |
| 5×9 | 4 | *Short circuit (example; …)*, 127 characters |

Every card fits. A canvas script only gets the host's 5×7 font through
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

**Chosen: E · Static.** The sound is being reconsidered to match it (see
*Sound*).

## Sound

A **woody tick for every step of the spin**, so the sound speeds up and slows
down exactly as the screen does. Each tick is a little brighter when fast and
a little louder as it slows, with a few percent of random pitch so the clatter
doesn't sound like a machine gun. On landing there is one fuller, lower knock.
The approved sound is the one in the design mockups.

It is synthesised, not sampled. Each hit is a 6 ms noise burst through three
or four resonant band-pass filters, plus a short sine thump that drops in
pitch. That is how a struck block of wood behaves, and it ports directly from
the mockups' Web Audio graph to C biquads:

| Hit | Resonances (Hz, Q) | Decay | Body |
|---|---|---|---|
| tick | 1180/14, 2650/11, 520/8, all ×(0.82 + 0.3·speed) | 50 ms | 210 Hz, 30 ms |
| knock | 640/10, 1490/9, 300/7, 3100/12 | 200 ms | 120 Hz, 130 ms |

*Rejected:* WAV files through `host_preview_play`. That was the only way a MIDI
effect could make sound, and the reason this is no longer a MIDI effect.
*Rejected:* playing the ticks as MIDI notes into the slot's synth. The sound
would depend on whatever synth is loaded and wouldn't be wooden.

**Sound for Static: four candidates**, live on the design canvas (E1–E4),
because a wooden clatter doesn't fit pixels clearing. Each follows the same
schedule, and each step also knows how far the static has cleared, using the
same curve as the screen:

- **E1 · Crackle.** Every step is a spray of tiny electric clicks that thins
  as the static thins. It lands on a clean sine chime.
- **E2 · Tuning.** A radio between stations: hiss for the whole spin, fading
  as the static clears, while a tone drifts into tune underneath. Landing cuts
  the hiss and leaves the tone ringing.
- **E3 · Chatter.** A computer decoding: a short blip at a random pitch on
  every step. The pitches narrow onto one note, and the card lands on it.
- **E4 · Shimmer.** Small glassy notes from a wide pentatonic cloud that
  gathers toward the middle, landing on a soft chord.

All four use only noise, biquad filters, sine and triangle oscillators and
envelopes, so they port to C like the wood. *Decision pending.*

## Control surface

One page, one control. No `ui_hierarchy` knobs, no parameters.

| Control | Behaviour |
|---|---|
| Jog click | First click enters the page. After that: spin and land on a new card, ignored while spinning. |
| Back | Leaves the page (the host's door behaviour). |
| Shift+jog | Pages out (the host's escape, not the module's). |

## Implementation notes

```
elusive-muse/
  src/
    module.json        component_type "audio_fx"; requires_continuous_processing;
                       one canvas param: as_page, page_first, enterable, show_footer false
    dsp/muse.c         audio pass-through + tick/knock synth, audio_fx_api_v2; param "spin"
    canvas.js          canvas_overlay: onMidi / tick / draw / handleBack
    fonts.js           Tamzen glyph tables (5 sizes, ASCII only)
    strategies.txt     one card per line, copied verbatim from zzkt
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
- **The legal question, plainly.** The card texts are © Brian Eno and Peter
  Schmidt. The zzkt repo publishes them with no licence. Using them on your own
  Move is fine. Publishing the module to the public Schwung catalog would
  redistribute copyrighted text, which is your decision to make before any
  release. The GitHub repo is **private** until you decide.

## Build order

1. Choose the screen design.
2. **Device spike:** an audio effect whose canvas page sends a parameter on
   each jog click, and a DSP that answers with a tick. This answers the one
   open question (can a canvas set its own module's parameter, and how fast)
   and checks the canvas frame rate on device.
3. Audio pass-through, `module.json` with the canvas page, continuous
   processing. Check the slot sounds exactly as without it.
4. Tick and knock synthesis in C, compared by ear with the mockups.
5. Fonts, fit and centring, with tests against all 195 cards.
6. Deal and spin schedule, with tests; the `spin` parameter carrying it.
7. The chosen spin animation.
8. `help.json`, README, catalog entry (see the legal note).

## Testing

`tests/run.sh`:

- the audio pass-through is bit-identical when no spin is running (compiled
  with `-Wall -Wextra -Werror`, driven through the v2 API);
- after a `spin`, a tick starts at every step time, to the sample, and the
  knock at the end; the output never clips;
- every card fits the screen at some font size, and is centred to the pixel;
- the reel always lands on the dealt card;
- no card repeats within a lap of the deck, over many laps, and a reshuffle
  never deals the card on screen;
- the gaps between cards never shrink, and a spin lasts 2–3 s;
- a click during a spin changes nothing.

On hardware: put it in a slot after a synth and check the sound is unchanged
until you draw. Enter the page, draw ten cards, click during a
spin, and listen for whether the ticks keep up at full speed.
