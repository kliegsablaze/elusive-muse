# Elusive Muse

A Schwung audio effect for Ableton Move that draws a card from a deck of 500
prompts, written in the spirit of Brian Eno and Peter Schmidt's *Oblique
Strategies* (none of their cards are used). Click the jog wheel and the
screen fills with pixel static and scattered glassy notes. The static clears into one card,
shown whole and centred on the screen, and lands on a soft chord.

It is an audio effect: put it in a slot after a synth, and the slot's audio
passes through untouched. Only its own notes are added, and a tap on Shift
mutes them.

Status: 0.1.0, built and tested on a computer, not yet run on a Move. See
[DESIGN.md](DESIGN.md).

## Build and install

```bash
bash tests/run.sh
```

```bash
docker build -t elusive-muse-builder -f scripts/Dockerfile .
```

```bash
docker run --rm -v "$PWD:/build" -w /build elusive-muse-builder ./scripts/build.sh
```

```bash
scripts/install.sh
```

`install.sh` copies the build to `ableton@move.local` (or `$MOVE_HOST`) and
restarts Move's audio process so the new code is the one running.

After editing `page/canvas.src.js` or the cards, regenerate the page:

```bash
python3 scripts/gen_canvas.py
```

The fonts are Tamzen (see `fonts/tamzen/LICENSE`).
