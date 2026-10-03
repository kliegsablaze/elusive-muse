/*
 * page.test.mjs — src/canvas.js on a computer, driven the way Schwung 1.6.3
 * drives a canvas page: drawPage(ctx, payload) every tick with a draw-only,
 * band-sized ctx, and onMidi(ctx, { data }) with a fresh hook ctx per call.
 *
 *   node tests/page.test.mjs [dsp_contract.txt]
 *
 * With the file (written by `test_muse --dump`), also checks that the DSP's
 * chain_params and ui_hierarchy say what src/module.json says.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(join(root, "src", "canvas.js"), "utf8");

let checks = 0, failures = 0;
function check(cond, msg) { checks++; if (!cond) { failures++; console.log("FAIL: " + msg); } }

/* A seeded random source, so a failure can be re-run. */
function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* A fresh page: its own copy of the script, its own Shift. */
function load() {
    const env = { shift: 0 };
    const sandbox = { shadow_get_shift_held: () => env.shift, Math, Date, console };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(SRC, sandbox, { filename: "canvas.js" });
    return { ov: sandbox.canvas_overlay, env };
}

/* The host's frameCtx, reduced to what matters: band-sized, strict. */
function frame() {
    const px = new Uint8Array(128 * 48);
    const f = { calls: 0, bad: 0, px,
        fillRect(x, y, w, h, c) {
            f.calls++;
            if (x < 0 || y < 0 || x + w > 128 || y + h > 48 || c !== 1 ||
                ![x, y, w, h].every(Number.isInteger)) { f.bad++; return; }
            for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px[j * 128 + i] = 1;
        } };
    return f;
}

/* One page in a slot, with a clock. */
function page(seed = 1) {
    const { ov, env } = load();
    const state = {}, sets = [];
    let now = 1_000_000;
    const r = rng(seed);
    const hookCtx = () => ({ state, now: () => now, random: r, shiftHeld: () => !!env.shift,
        setParam: (k, v) => { sets.push([k, String(v), now]); return true; } });
    const P = {
        ov, env, state, sets, T: ov._test,
        get now() { return now; },
        advance(ms) { now += ms; },
        draw(values = {}) {
            const f = frame();
            ov.drawPage(f, { state, values, nowMs: now, width: 128, height: 48, keys: [], base: values });
            return f;
        },
        click() { ov.onMidi(hookCtx(), { source: "internal", data: [0xB0, 3, 127] }); },
        jog(d) { ov.onMidi(hookCtx(), { source: "internal", data: [0xB0, 14, d & 127] }); },
        back() { return ov.handleBack(hookCtx(), {}); },
        /* Run frames every `step` ms for `ms`. */
        run(ms, step = 33, values) { let f; for (let t = 0; t < ms; t += step) { now += step; f = P.draw(values); } return f; },
    };
    return P;
}

const base = load().ov._test;
const { CARDS, W, H, MX, MY, KEEP } = base;

/* --------------------------------------------------------------- cards -- */
{
    check(CARDS.length === 500, `500 cards, found ${CARDS.length}`);
    check(new Set(CARDS).size === CARDS.length, "a card is repeated");
    const sizes = {};
    let worst = null;
    for (const c of CARDS) {
        const L = base.layout(c);
        if (!L) { check(false, `does not fit: ${c}`); continue; }
        sizes[L.f.name] = (sizes[L.f.name] || 0) + 1;
        /* Centred to the pixel: the side margins of each line, and the space
         * above and below the block, differ by at most one. */
        for (const ln of L.lines) {
            const left = ln.x, right = W - (ln.x + ln.s.length * L.dw);
            check(Math.abs(left - right) <= 1, `"${c}" line "${ln.s}" off centre (${left}/${right})`);
        }
        const above = L.top, below = H - (L.top + L.h);
        check(Math.abs(above - below) <= 1, `"${c}" off centre vertically (${above}/${below})`);
        if (!worst || L.lines.length * 100 - L.f.dw > worst.score) worst = { c, score: L.lines.length * 100 - L.f.dw };
    }
    console.log("  fonts:", Object.entries(sizes).map(([k, v]) => `${k} ${v}`).join(", "));

    /* What actually lands on screen: inside the margins, never in the M's
     * corner, every line's pixels in the band. */
    const p = page(7);
    for (let i = 0; i < CARDS.length; i++) {
        p.state.current = i;
        p.state.spin = null;
        const f = p.draw();
        let inMargin = true, inKeep = false, lit = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (!f.px[y * W + x]) continue;
            lit++;
            if (x < MX || x >= W - MX || y < MY || y >= H - MY) inMargin = false;
            if (x >= KEEP[0] && x < KEEP[0] + KEEP[2] && y >= KEEP[1] && y < KEEP[1] + KEEP[3]) inKeep = true;
        }
        check(lit > 20, `"${CARDS[i]}" drew almost nothing`);
        check(inMargin, `"${CARDS[i]}" draws in the margin`);
        check(!inKeep, `"${CARDS[i]}" draws in the M's corner`);
        check(f.bad === 0, `"${CARDS[i]}" made ${f.bad} bad fillRect calls`);
    }
}

/* ---------------------------------------------------------------- deal -- */
{
    const r = rng(99), deck = { bag: null };
    let cur = base.deal(deck, -1, 500, r), dealt = [cur];
    for (let i = 0; i < 500 * 20 - 1; i++) {
        const v = base.deal(deck, cur, 500, r);
        check(v !== cur, "dealt the card already on screen");
        dealt.push(v); cur = v;
    }
    let laps = 0;
    for (let l = 0; l < 20; l++) {
        const lap = new Set(dealt.slice(l * 500, (l + 1) * 500));
        if (lap.size === 500) laps++;
    }
    check(laps === 20, `every lap of 500 holds all 500 cards (${laps}/20 did)`);

    /* A card on screen that did not come from the bag (restored, say). */
    const d2 = { bag: [3] };
    check(base.deal(d2, 3, 500, rng(1)) !== 3, "re-dealt the card on screen from a one-card bag");
}

/* ------------------------------------------------------------ schedule -- */
{
    const r = rng(5);
    let lo = Infinity, hi = 0, nlo = Infinity, nhi = 0;
    for (let k = 0; k < 2000; k++) {
        const at = base.schedule(r);
        nlo = Math.min(nlo, at.length); nhi = Math.max(nhi, at.length);
        let prev = 0, gap = 0, ok = true;
        for (const t of at) { const g = t - prev; if (g < gap - 1) ok = false; gap = g; prev = t; }
        check(ok, "a gap between steps shrank");
        lo = Math.min(lo, at[at.length - 1]); hi = Math.max(hi, at[at.length - 1]);
    }
    console.log(`  spins: ${nlo}-${nhi} steps, ${(lo / 1000).toFixed(2)}-${(hi / 1000).toFixed(2)} s`);
    check(nlo === 24 && nhi === 32, `24-32 steps (got ${nlo}-${nhi})`);
    check(lo >= 2000 && hi <= 4000, `a spin lasts 2-4 s (got ${lo}-${hi} ms)`);

    const sp = base.spinParam(12, [30, 61, 2900]).split(" ").map(Number);
    check(sp.join() === "12,0,30,61,2900", `spin param: ${sp}`);
}

/* ---------------------------------------------------------------- spin -- */
{
    const p = page(3);
    p.draw();
    const before = p.state.current;
    p.click();
    check(p.sets.length === 1 && p.sets[0][0] === "spin", "a click sends one spin");
    const at = p.sets[0][1].split(" ").slice(1).map(Number);
    check(at[0] === 0 && at.length >= 25, "the spin starts with a note on the click");
    const target = p.state.spin.target;
    check(target !== before, "the spin is for a new card");

    /* Mid-spin: static, and a click changes nothing. */
    p.run(500);
    const f = p.draw();
    let lit = 0; for (const v of f.px) lit += v;
    check(lit > 0, "nothing on screen mid-spin");
    p.click(); p.jog(1); p.jog(127);
    check(p.sets.length === 1, "a click or jog mid-spin sent something");
    check(p.state.spin && p.state.spin.target === target, "a click mid-spin changed the card");

    /* Landing: exactly the target card, drawn plain. */
    p.run(at[at.length - 1]);
    const landed = p.draw();
    check(p.state.spin === null && p.state.current === target, "did not land on the dealt card");
    const ref = page(3);
    ref.draw(); ref.state.current = target; ref.state.mute = 0;
    const want = ref.draw();
    check(Buffer.compare(Buffer.from(landed.px), Buffer.from(want.px)) === 0, "the landed screen is not the plain card");

    /* And the next click works. */
    p.click();
    check(p.sets.length === 2, "a click after landing did nothing");

    /* Frame cost: fillRect calls per frame, over a whole spin for the
     * densest cards. Each call is a crossing into the host. */
    let worst = 0, worstCard = "";
    for (let i = 0; i < CARDS.length; i += 1) {
        const q = page(i + 11);
        q.draw(); q.state.current = (i + 1) % CARDS.length;
        q.click();
        q.state.spin.target = i;
        const end = q.state.spin.at[q.state.spin.n - 1];
        for (let t = 0; t < end; t += 97) { q.advance(97); const fr = q.draw(); if (fr.calls > worst) { worst = fr.calls; worstCard = CARDS[i]; } }
    }
    console.log(`  frame cost: at most ${worst} fillRect calls ("${worstCard}")`);
    check(worst < 1500, `a frame needs ${worst} fillRect calls`);
}

/* ---------------------------------------------------------------- mute -- */
function hasM(f) {
    /* The M: font4x5 at x 122-126, y 1-5 of the band. */
    return f.px[1 * W + 122] && f.px[1 * W + 126] && f.px[3 * W + 124] && f.px[5 * W + 122];
}
function tap(p, holdMs = 100, values) {
    p.env.shift = 1; p.run(holdMs, 33, values);
    p.env.shift = 0; return p.run(66, 33, values);
}
{
    /* The DSP says muted: the M shows without anyone touching anything. */
    const p0 = page(1);
    check(hasM(p0.draw({ mute: "1" })), "no M when the DSP reports mute");
    check(!hasM(page(1).draw({ mute: "0" })), "an M while not muted");

    /* A tap before any hook: remembered, M shown, sent ahead of the first spin. */
    const p = page(2);
    p.run(100, 33, { mute: 0 });
    let f = tap(p, 100, { mute: 0 });
    check(hasM(f), "a Shift tap did not show the M");
    check(p.sets.length === 0, "something was sent with no setter yet");
    p.click();
    check(p.sets.length === 2 && p.sets[0][0] === "mute" && p.sets[0][1] === "1" && p.sets[1][0] === "spin",
          `the pending mute did not go out before the spin: ${JSON.stringify(p.sets)}`);

    /* With a setter: a tap goes out at once; a second tap unmutes. */
    p.run(4000, 33, { mute: 1 });
    f = tap(p, 80, { mute: 1 });
    check(!hasM(f), "a second tap did not unmute");
    check(p.sets.at(-1)[0] === "mute" && p.sets.at(-1)[1] === "0", "unmute not sent");

    /* The DSP catching up late does not undo the tap... */
    f = p.run(500, 33, { mute: 1 });
    check(!hasM(f), "a stale read flipped the mute back");
    /* ...but a lasting difference is the DSP's truth (a set was loaded). */
    f = p.run(2000, 33, { mute: 1 });
    check(hasM(f), "the DSP's mute was never adopted");

    /* Not taps: */
    const n0 = p.sets.length;
    const muted = p.state.mute;
    tap(p, 900, { mute: muted });                       /* a hold */
    check(p.state.mute === muted, "a long hold toggled mute");
    p.env.shift = 1; p.run(100, 33, { mute: muted });   /* Shift+jog: the host pages away */
    p.advance(800);                                     /* no frames while away */
    p.env.shift = 0; p.run(100, 33, { mute: muted });
    check(p.state.mute === muted, "Shift held across a page change toggled mute");
    p.env.shift = 1; p.run(66, 33, { mute: muted });
    p.jog(1);                                           /* a gesture during the press */
    p.env.shift = 0; p.run(66, 33, { mute: muted });
    check(p.state.mute === muted, "Shift + a jog turn toggled mute");
    check(p.sets.length === n0, "something was sent for a non-tap");

    /* Back leaves the door, and never claims the press. */
    check(p.back() === false, "handleBack claimed Back");
}

/* ----------------------------------------------------- DSP vs module.json -- */
if (process.argv[2]) {
    const [cp, uh] = readFileSync(process.argv[2], "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const mj = JSON.parse(readFileSync(join(root, "src", "module.json"), "utf8"));
    check(JSON.stringify(cp) === JSON.stringify(mj.capabilities.chain_params),
          "the DSP's chain_params differ from module.json");
    check(JSON.stringify(uh) === JSON.stringify(mj.ui_hierarchy),
          "the DSP's ui_hierarchy differs from module.json");
}

console.log(`page: ${checks} checks, ${failures} failed`);
process.exit(failures ? 1 : 0);
