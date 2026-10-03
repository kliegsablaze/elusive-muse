/*
 * Elusive Muse — the page.
 *
 * ⚠ SOURCE. The module ships src/canvas.js, which scripts/gen_canvas.py
 * builds from this file plus the fonts and the cards. Edit here, then run
 * the generator (tests/run.sh fails while the two disagree).
 *
 * One `as_page` + `enterable` canvas page (a door). Schwung draws its own
 * header and hint bar; this script draws the 128x48 band between them.
 *
 *   click    deal a card, spin, land on it; ignored while spinning
 *   Shift    a tap (press and release, nothing else in between) mutes or
 *            unmutes the module's own notes, and shows a small M
 *
 * HOW THE HOST REACHES US (Schwung 1.6.3, read from the source):
 *
 *   onMidi(ctx, { data })   only while the door is entered, and only CC 14
 *                           (jog) and CC 3 (click). ctx has setParam, now,
 *                           random, shiftHeld; it is a fresh object each call.
 *   drawPage(ctx, payload)  every host tick, entered or not. ctx can DRAW and
 *                           nothing else: no setParam, no shiftHeld. payload
 *                           carries values (our extra_keys: mute), nowMs and
 *                           `state`, the same per-slot object hooks see as
 *                           ctx.state.
 *
 * Two consequences shape the mute:
 *   - Shift arrives as no event at all, so it is polled on every frame
 *     through the host's own global (shadow_get_shift_held, which is what
 *     ctx.shiftHeld calls).
 *   - The draw path cannot set a param, so the page keeps the setParam of
 *     the last hook it was handed (state.set) and uses that. Before the first
 *     click there is none; a tap then is remembered and sent with the first
 *     click, before the spin, which is also the first moment a note could
 *     sound.
 *
 * TIME. Everything runs on wall-clock milliseconds: the spin is a list of
 * timestamps and a frame only asks where in it we are. A slow frame rate
 * makes the static look choppier, never the spin slower.
 */
(function () {
    "use strict";

    var FONT_SRC = /*@FONTS@*/null;
    var CARDS = /*@CARDS@*/null;

    var W = 128, H = 48;                 /* the band Schwung hands a page */
    var MX = 2, MY = 1;                  /* margin inside it */
    var KEEP = [121, 0, 7, 7];           /* the M's corner, always kept clear */
    var ORDER = ["10x20", "8x16", "7x14", "6x12", "5x9"];

    var DMIN = 30, DMAX = 380, CURVE = 3.4;   /* gap between steps, ms */
    var STEPS_MIN = 24, STEPS_SPREAD = 9;      /* 24..32 steps */
    var NOISE_MS = 33;                   /* the static changes this often */
    var TAP_MAX_MS = 600;                /* longer is a hold, not a tap */
    var GAP_MS = 250;                    /* frames this far apart: we were away */
    var ADOPT_MS = 1500;                 /* trust the DSP's mute after this */

    /* Schwung's own 4x5 M (font4x5), for the mute mark. */
    var M_GLYPH = ["#...#", "##.##", "#.#.#", "#...#", "#...#"];
    var M_X = 122, M_Y = 1;

    /* ------------------------------------------------------------ fonts -- */

    /* Each glyph becomes a flat list of lit pixels [x, y, x, y, ...] relative
     * to its cell's left edge and its line's top. */
    var FONTS = {};
    (function decode() {
        for (var name in FONT_SRC) {
            var f = FONT_SRC[name], g = {};
            for (var ch in f.g) {
                var d = f.g[ch], left = d[0], top = d[1], w = d[2], px = [];
                for (var r = 3; r < d.length; r++)
                    for (var c = 0; c < w; c++)
                        if ((d[r] >> (w - 1 - c)) & 1) px.push(left + c, top + r - 3);
                g[ch] = px;
            }
            FONTS[name] = { name: name, dw: f.dw, asc: f.asc, desc: f.desc, g: g };
        }
    })();

    function glyphOf(f, ch) { return f.g[ch] || f.g["?"]; }

    /* ----------------------------------------------------------- layout -- */

    function wrap(t, cols) {
        var words = t.split(/\s+/), L = [], c = "";
        for (var i = 0; i < words.length; i++) {
            var x = words[i];
            if (!x) continue;
            if (x.length > cols) return null;
            if (!c) c = x;
            else if (c.length + 1 + x.length <= cols) c += " " + x;
            else { L.push(c); c = x; }
        }
        if (c) L.push(c);
        return L;
    }

    function touchesKeep(f, lines, dw) {
        for (var i = 0; i < lines.length; i++) {
            var ln = lines[i];
            for (var k = 0; k < ln.s.length; k++) {
                var px = glyphOf(f, ln.s[k]);
                for (var p = 0; p < px.length; p += 2) {
                    var X = ln.x + k * dw + px[p], Y = ln.y + px[p + 1];
                    if (X >= KEEP[0] && X < KEEP[0] + KEEP[2] &&
                        Y >= KEEP[1] && Y < KEEP[1] + KEEP[3]) return true;
                }
            }
        }
        return false;
    }

    /* The largest font in which the whole card fits, centred. The smallest
     * font may close its lines up by one, then two rows, so a longer card
     * added later still fits. Null only if nothing does. */
    var layoutCache = {};
    function layout(text) {
        if (layoutCache[text]) return layoutCache[text];
        var tries = [];
        for (var o = 0; o < ORDER.length; o++) tries.push([ORDER[o], 0]);
        tries.push([ORDER[ORDER.length - 1], 1], [ORDER[ORDER.length - 1], 2]);
        for (var i = 0; i < tries.length; i++) {
            var f = FONTS[tries[i][0]], dw = f.dw, lh = f.asc + f.desc - tries[i][1];
            var L = wrap(text, Math.floor((W - 2 * MX) / dw));
            if (!L || L.length * lh > H - 2 * MY) continue;
            var top = Math.round((H - L.length * lh) / 2), lines = [];
            for (var k = 0; k < L.length; k++)
                lines.push({ s: L[k], x: Math.round((W - L[k].length * dw) / 2), y: top + k * lh });
            if (touchesKeep(f, lines, dw)) continue;
            return (layoutCache[text] = { f: f, dw: dw, lh: lh, lines: lines, top: top, h: L.length * lh });
        }
        return null;
    }

    /* ------------------------------------------------- deal and schedule -- */

    function shuffled(n, rng) {
        var a = [];
        for (var i = 0; i < n; i++) a.push(i);
        for (var j = n - 1; j > 0; j--) {
            var k = Math.floor(rng() * (j + 1)), t = a[j];
            a[j] = a[k]; a[k] = t;
        }
        return a;
    }

    /* Dealt like a real shuffled deck: every card once per lap, and a fresh
     * shuffle never starts with the card already on screen (`not`). */
    function deal(deck, not, n, rng) {
        if (!deck.bag || !deck.bag.length) deck.bag = shuffled(n, rng);
        var v = deck.bag.pop();
        if (v === not && n > 1) {
            if (!deck.bag.length) deck.bag = shuffled(n, rng).filter(function (x) { return x !== v; });
            var w = deck.bag.pop();
            deck.bag.unshift(v);
            v = w;
        }
        return v;
    }

    /* The gaps grow from DMIN to DMAX along a steep curve: the spin races,
     * then crawls through its last few steps. Returns the time each step
     * ends, in ms from the click; the last one is the landing. */
    function schedule(rng) {
        var n = STEPS_MIN + Math.floor(rng() * STEPS_SPREAD);
        var t = 0, at = [];
        for (var s = 1; s <= n; s++) {
            t += DMIN + (DMAX - DMIN) * Math.pow((s - 1) / (n - 1), CURVE);
            at.push(Math.round(t));
        }
        return at;
    }

    /* How far the static has cleared after step i of n (0..0.9). The DSP's
     * `cleared()` is this divided by 0.9; the two must agree. */
    function resolved(i, n) {
        var q = i / n;
        return q < 0.35 ? 0 : Math.pow((q - 0.35) / 0.65, 1.5) * 0.9;
    }

    /* The `spin` param: note i sounds when step i begins (the first on the
     * click itself), and the chord at the landing. */
    function spinParam(serial, at) {
        var t = [0];
        for (var i = 0; i < at.length; i++) t.push(at[i]);
        return serial + " " + t.join(" ");
    }

    function stepAt(spin, t) {
        var i = 0;
        while (i < spin.at.length && t >= spin.at[i]) i++;
        return i;
    }

    /* ---------------------------------------------------------- drawing -- */

    function hash(x, y, s) {
        var h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    var bm = new Uint8Array(W * H);

    function set(x, y) { if (x >= 0 && y >= 0 && x < W && y < H) bm[y * W + x] = 1; }

    function plotGlyph(f, ch, x, y, keepP, seed) {
        var px = glyphOf(f, ch);
        for (var p = 0; p < px.length; p += 2) {
            var X = x + px[p], Y = y + px[p + 1];
            if (keepP === undefined || hash(X, Y, seed) < keepP) set(X, Y);
        }
    }

    function plotCard(lay) {
        for (var i = 0; i < lay.lines.length; i++) {
            var ln = lay.lines[i];
            for (var k = 0; k < ln.s.length; k++)
                if (ln.s[k] !== " ") plotGlyph(lay.f, ln.s[k], ln.x + k * lay.dw, ln.y);
        }
    }

    /* E · Static: each letter is a cell of live pixel static that thins out
     * until the letter shows through, each at its own moment. */
    function plotStatic(lay, i, n, seed, frame) {
        var f = lay.f, h = f.asc + f.desc, base = resolved(i, n) / 0.9, idx = 0;
        for (var li = 0; li < lay.lines.length; li++) {
            var ln = lay.lines[li];
            for (var k = 0; k < ln.s.length; k++, idx++) {
                var ch = ln.s[k];
                if (ch === " ") continue;
                var x0 = ln.x + k * lay.dw, y0 = ln.y;
                var p = Math.max(0, Math.min(1, (base - hash(idx, 9, seed) * 0.8) / 0.2));
                if (p >= 1) { plotGlyph(f, ch, x0, y0); continue; }
                plotGlyph(f, ch, x0, y0, p, frame);
                var dens = 0.42 * (1 - p), s2 = i * 31 + frame;
                for (var yy = 1; yy < h - 1; yy++)
                    for (var xx = 0; xx < lay.dw - 1; xx++)
                        if (hash(x0 + xx, y0 + yy, s2) < dens) set(x0 + xx, y0 + yy);
            }
            idx++;
        }
    }

    function plotMute() {
        for (var y = 0; y < M_GLYPH.length; y++)
            for (var x = 0; x < M_GLYPH[y].length; x++)
                if (M_GLYPH[y][x] === "#") set(M_X + x, M_Y + y);
    }

    /* One fillRect per horizontal run, not per pixel: each call crosses into
     * the host and through frameCtx's clipping. */
    function blit(ctx) {
        var calls = 0;
        for (var y = 0; y < H; y++) {
            var row = y * W, x = 0;
            while (x < W) {
                if (!bm[row + x]) { x++; continue; }
                var s = x;
                while (x < W && bm[row + x]) x++;
                ctx.fillRect(s, y, x - s, 1, 1);
                calls++;
            }
        }
        return calls;
    }

    /* ------------------------------------------------------------ state -- */

    /* ctx.state is per slot and lives as long as the loaded script, so the
     * deck carries on where it was when you leave and come back. */
    function init(st, rng) {
        if (st.deck) return;
        st.deck = { bag: null };
        st.current = deal(st.deck, -1, CARDS.length, rng);
        st.spin = null;
        st.serial = 0;
        st.mute = null;            /* our intent; null until known */
        st.muteDirty = false;      /* intent not yet sent */
        st.muteSentAt = -1e12;
        st.set = null;             /* setParam of the last hook we were handed */
        st.sh = { down: false, since: 0, spoiled: false };
        st.lastFrame = -1e12;
    }

    function hostShift() {
        try {
            return typeof shadow_get_shift_held === "function" && shadow_get_shift_held() !== 0;
        } catch (e) { return false; }
    }

    function flushMute(st, now) {
        if (!st.muteDirty || typeof st.set !== "function") return;
        if (st.set("mute", st.mute ? "1" : "0") !== false) {
            st.muteDirty = false;
            st.muteSentAt = now;
        }
    }

    /* A tap is a press and a release seen here with nothing in between: no
     * jog or click (onMidi spoils it), no gap in the frames (the host took
     * the screen: Shift+jog paged away, Shift+click opened the picker), and
     * not held longer than a tap. */
    function trackShift(st, down, now) {
        var sh = st.sh;
        if (now - st.lastFrame > GAP_MS) { sh.down = down; sh.spoiled = down; sh.since = now; }
        else if (down && !sh.down) { sh.down = true; sh.spoiled = false; sh.since = now; }
        else if (!down && sh.down) {
            sh.down = false;
            if (!sh.spoiled && now - sh.since <= TAP_MAX_MS) {
                st.mute = st.mute ? 0 : 1;
                st.muteDirty = true;
                flushMute(st, now);
            }
        }
        st.lastFrame = now;
    }

    function syncMute(st, values, now) {
        var v = values && values.mute;
        if (v === undefined || v === null || v === "") return;
        var dsp = Number(v) >= 0.5 ? 1 : 0;
        if (st.mute === null) { st.mute = dsp; return; }
        /* Our own write takes a moment to come back through the read rotation;
         * after that, the DSP is the truth (a set loaded, an undo). */
        if (!st.muteDirty && dsp !== st.mute && now - st.muteSentAt > ADOPT_MS) st.mute = dsp;
    }

    function click(st, ctx) {
        var now = ctx.now();
        if (st.spin && now - st.spin.start < st.spin.at[st.spin.at.length - 1]) return false;
        var rng = ctx.random;
        var target = deal(st.deck, st.current, CARDS.length, rng);
        var at = schedule(rng);
        st.serial = (st.serial + 1) % 1000000;
        flushMute(st, now);
        ctx.setParam("spin", spinParam(st.serial, at));
        /* Started AFTER the param went, so the screen and the notes leave
         * together: the DSP starts counting when the value arrives. */
        st.spin = { start: ctx.now(), at: at, target: target,
                    seed: Math.floor(rng() * 1e6), n: at.length };
        return true;
    }

    /* ---------------------------------------------------------- overlay -- */

    var overlay = {
        onMidi: function (ctx, msg) {
            var st = ctx.state;
            init(st, ctx.random);
            st.set = ctx.setParam;
            st.sh.spoiled = true;          /* a gesture while Shift is down */
            var d = msg && msg.data;
            if (!d || (d[0] & 0xF0) !== 0xB0) return;
            if (d[1] === 3 && d[2] > 0) click(st, ctx);
            else flushMute(st, ctx.now());
        },

        handleBack: function (ctx) {
            var st = ctx.state;
            init(st, ctx.random);
            st.set = ctx.setParam;
            flushMute(st, ctx.now());
            return false;                  /* one level: Back leaves the door */
        },

        drawPage: function (ctx, p) {
            var st = p.state, now = p.nowMs;
            init(st, Math.random);
            syncMute(st, p.values, now);
            trackShift(st, hostShift(), now);

            bm.fill(0);
            var sp = st.spin;
            if (sp && now - sp.start >= sp.at[sp.n - 1]) { st.current = sp.target; st.spin = sp = null; }
            if (sp) {
                var i = stepAt(sp, now - sp.start);
                plotStatic(layout(CARDS[sp.target]), i, sp.n, sp.seed, Math.floor(now / NOISE_MS));
            } else {
                plotCard(layout(CARDS[st.current]));
            }
            if (st.mute) plotMute();
            return blit(ctx);
        },
    };

    overlay._test = {
        CARDS: CARDS, FONTS: FONTS, W: W, H: H, MX: MX, MY: MY, KEEP: KEEP,
        layout: layout, deal: deal, schedule: schedule, resolved: resolved,
        spinParam: spinParam, stepAt: stepAt, init: init, bitmap: bm,
        TAP_MAX_MS: TAP_MAX_MS, GAP_MS: GAP_MS,
    };

    globalThis.canvas_overlay = overlay;
})();
