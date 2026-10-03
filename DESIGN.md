# Elusive Muse — design

One click, one card from the deck.

Elusive Muse puts Brian Eno and Peter Schmidt's *Oblique Strategies* on the
Move's screen. Click the jog wheel and the cards run past with a wooden
clatter that slows down with them, then stop on one with a single knock.
The card fills the screen, centred, all of it. Click again for another.

**Status:** design only, nothing built yet. The screen design is not chosen
yet: five candidates are mocked up live (see *Screen*). Written against
Schwung **v1.6.3** (`upstream/main`, fetched 2026-10-02).

**Module ID:** `elusive-muse` · **component_type:** `midi_fx` (first in the
slot's chain)

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

## Why a MIDI effect, and what that means

It sits at the **front of the slot's chain**, as you asked. That way it is
always one page away while you play, instead of in the Tools menu, which
takes over the whole Move.

**MIDI passes through untouched.** A MIDI effect has to forward the notes it
receives, and this one forwards every note unchanged, with nothing added and
nothing removed. Putting it in a slot changes nothing about how that slot
sounds or plays. That takes a tiny C pass-through (`dsp.so`), because the
chain loads a MIDI effect's binary by that name (`chain_midi.c`).

**Its one page is a screen the module draws.** Schwung calls this a *canvas*
page (`docs/CANVAS_PAGES.md`, `docs/MODULES.md` § `canvas`). Declared as
`as_page` + `page_first` + `enterable` with `show_footer: false`, it is the
page you land on, the host draws nothing over it, and the jog wheel and click
go to the module. The only things on screen are the words.

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

*Decision pending:* which design.

## Sound

A **woody tick for every card that passes the window**, so the sound speeds
up and slows down exactly as the reel does. Each tick is a little brighter
when fast and a little louder as it slows. On landing there is one fuller,
lower knock.

**A MIDI effect cannot make sound.** Its API (`midi_fx_api_v1.h`) has no audio
output. So the sound does not come from the module's DSP. The screen script
plays short pre-rendered WAV files through the host's preview player,
`host_preview_play(path)` (`docs/API.md`). That player auditions samples in
the file browser, and it plays through the Move's speakers and outputs. The
module ships:

- `sounds/tick-1.wav` … `tick-4.wav`: four slightly different wood ticks, used
  in rotation so the clatter doesn't sound like a machine gun;
- `sounds/land.wav`: the landing knock.

They are synthesised, not sampled: a short noise burst through three or four
resonant band-pass filters, which is how a struck block of wood behaves. The
design canvas plays the same recipe live in the browser.

*To verify on device*, before anything else is built:

- that a canvas script can call `host_preview_play`;
- how quickly a play starts, and whether a new play cuts the previous one off
  (wanted) or is refused while one is playing (would break the fast ticks);
- that the preview level is sensible next to the music.

*If it doesn't work:* drop to fewer ticks (only the last eight or so, when the
reel is slow enough), or accept silence. *Rejected:* playing the ticks as MIDI
notes into the slot's synth. The sound would depend on whatever synth is
loaded, wouldn't be wooden, and would be heard as part of your music.

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
    module.json        component_type "midi_fx"; one canvas param: as_page, page_first, enterable, show_footer false
    dsp/muse.c         MIDI pass-through, plugin API v2 (midi_fx_api_v1)
    canvas.js          canvas_overlay: onMidi / tick / draw / handleBack
    fonts.js           Tamzen glyph tables (5 sizes, ASCII only)
    strategies.txt     one card per line, copied verbatim from zzkt
    sounds/*.wav       generated by scripts/make_sounds.py, committed
    help.json
  tests/run.sh
  scripts/build.sh, scripts/install.sh, scripts/make_sounds.py
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
2. **Device spike:** a throwaway canvas page that plays one WAV per jog click
   and per jog turn, to answer the three sound questions above. Also check the
   canvas frame rate on device.
3. MIDI pass-through `dsp.so` and `module.json` with the canvas page, checking
   the slot behaves exactly as without it.
4. Fonts, fit and centring, with tests against all 195 cards.
5. Deal and spin schedule, with tests.
6. The chosen spin animation.
7. Sounds (`make_sounds.py`) and their timing.
8. `help.json`, README, catalog entry (see the legal note).

## Testing

`tests/run.sh`:

- the MIDI pass-through returns every input message unchanged (compiled with
  `-Wall -Wextra -Werror`, driven through the v2 API);
- every card fits the screen at some font size, and is centred to the pixel;
- the reel always lands on the dealt card;
- no card repeats within a lap of the deck, over many laps, and a reshuffle
  never deals the card on screen;
- the gaps between cards never shrink, and a spin lasts 2–3 s;
- a click during a spin changes nothing.

On hardware: put it first in a slot with a synth after it, and check the notes
still play exactly as before. Enter the page, draw ten cards, click during a
spin, and listen for whether the ticks keep up at full speed.
