/*
 * Elusive Muse — the sound half.
 *
 * An audio effect that leaves the slot's audio alone and adds a few notes of
 * its own. The page (canvas.js) does all the deciding: on a click it works out
 * the spin and sends the time of every step here once, as the `spin` param.
 * This file only plays what it is told, counting samples:
 *
 *   one small glassy note per step (the Shimmer recipe, DESIGN.md § Sound),
 *   with a faint breath of high noise on some of the early ones, and
 *   a soft four-note chord when the card lands.
 *
 * PASS-THROUGH IS BIT-IDENTICAL. When nothing is sounding, process_block
 * returns without touching the buffer. When something is, the notes are
 * rounded to integers and ADDED, so the input survives exactly apart from
 * that sum (and the clamp at full scale, which only a near-full-scale input
 * can reach).
 *
 * `mute` silences this module's own notes, never the audio passing through.
 * Notes already ringing fade out over 5 ms rather than stopping dead, and a
 * spin carries on counting while muted, so unmuting mid-spin picks up at the
 * next step.
 *
 * Params:
 *   spin   (set only) "<serial> <t0> <t1> ... <tN>": N notes at t0..t(N-1) ms
 *          after arrival, then the chord at tN. The serial makes two equal
 *          schedules distinct strings. A new spin replaces one in progress.
 *   mute   "0" / "1". Saved with the set.
 *   state  {"mute":0|1}, the per-component snapshot the host saves.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdint.h>

#include "host/plugin_api_v1.h"
#include "host/audio_fx_api_v2.h"

#define SR            44100
#define MAX_VOICES    32
#define MAX_BURSTS    8
#define MAX_TIMES     72        /* the page sends at most 33 steps + 1 */
#define SINE_N        2048
#define MASTER        0.55f
#define ENV_FLOOR     0.0001f   /* Web Audio's exponential ramps start and end here */
#define MUTE_FADE_S   0.005f

/* Shimmer (DESIGN.md § Sound). The page's mockup is the reference; these are
 * its numbers, named. */
#define NOTE_ROOT_HZ  587.3f    /* D5 */
#define NOTE_ATTACK_S 0.003f
#define BREATH_HZ     6000.0f
#define BREATH_Q      2.0f
#define BREATH_LEVEL  0.05f
#define BREATH_LEN_S  0.010f
#define CHORD_GAP_S   0.030f
#define CHORD_ATTACK_S 0.006f

static const float CHORD_HZ[4]    = { 293.7f, 440.0f, 587.3f, 740.0f };
static const float CHORD_LEVEL[4] = { 0.14f, 0.10f, 0.08f, 0.05f };
static const float CHORD_DECAY[4] = { 2.4f, 2.1f, 1.8f, 1.5f };
static const int   PENTA[5] = { 0, 2, 4, 7, 9 };

static float g_sine[SINE_N + 1];

typedef struct {
    int      on;
    int      wait;              /* samples before it starts (chord roll) */
    uint32_t phase, inc;        /* 32-bit phase accumulator */
    float    g;                 /* envelope gain */
    float    peak;
    int      left;              /* samples left in this stage */
    int      stage;             /* 0 attack, 1 decay */
    float    att_mul, dec_mul;
    int      dec_len;
} voice_t;

typedef struct {
    int   on;
    int   left;
    float g, mul;
    float b0, b2, a1, a2;       /* RBJ band-pass, constant 0 dB peak (b1 = 0) */
    float x1, x2, y1, y2;
} burst_t;

typedef struct {
    voice_t  v[MAX_VOICES];
    burst_t  b[MAX_BURSTS];
    int      times[MAX_TIMES];  /* in samples from the spin's arrival */
    int      ntimes;            /* notes + 1 (the chord) */
    int      next;              /* next event index */
    int      pos;               /* samples since the spin arrived */
    int      spinning;
    int      mute;
    float    mute_gain;         /* 1 -> 0 over MUTE_FADE_S after a mute */
    uint32_t rng;
    unsigned spin_serial;
#ifdef MUSE_TEST
    /* Where each event fired, in samples since the spin arrived. Test builds
     * only: the audio cannot show an onset to the sample, because a note
     * starts at 1e-4 of its level and rounds to silence for a while. */
    int log_at[MAX_TIMES];
    int nlog;
#endif
} inst_t;

/* ---------------------------------------------------------------- utils -- */

static uint32_t rnd_u32(inst_t *s) {
    uint32_t x = s->rng;
    x ^= x << 13; x ^= x >> 17; x ^= x << 5;
    return s->rng = x;
}
static float rnd01(inst_t *s) { return (rnd_u32(s) >> 8) * (1.0f / 16777216.0f); }

static uint32_t hz_to_inc(float hz) {
    return (uint32_t)((double)hz / SR * 4294967296.0);
}

/* The page's curve: how far the static has cleared after step i of n, 0..1.
 * canvas.js `resolved(i, n) / 0.9`; the two must agree or the notes and the
 * pixels thin out at different rates. */
static float cleared(int i, int n) {
    if (n <= 0) return 0.0f;
    float q = (float)i / (float)n;
    if (q < 0.35f) return 0.0f;
    return powf((q - 0.35f) / 0.65f, 1.5f);
}

static float penta_hz(float root, int k) {
    int oct = (int)floorf(k / 5.0f);
    int st = PENTA[((k % 5) + 5) % 5] + 12 * oct;
    return root * powf(2.0f, st / 12.0f);
}

/* ------------------------------------------------------------- voices -- */

static void voice_start(inst_t *s, float hz, float attack_s, float peak,
                        float decay_s, int wait) {
    voice_t *v = NULL;
    for (int i = 0; i < MAX_VOICES; i++) if (!s->v[i].on) { v = &s->v[i]; break; }
    if (!v) {
        /* All busy: take the quietest. Only reachable if spins pile up. */
        v = &s->v[0];
        for (int i = 1; i < MAX_VOICES; i++) if (s->v[i].g < v->g) v = &s->v[i];
    }
    int a = (int)(attack_s * SR); if (a < 1) a = 1;
    int d = (int)(decay_s * SR);  if (d < 1) d = 1;
    v->on = 1;
    v->wait = wait;
    v->phase = 0;
    v->inc = hz_to_inc(hz);
    v->g = ENV_FLOOR;
    v->peak = peak;
    v->stage = 0;
    v->left = a;
    v->att_mul = powf(peak / ENV_FLOOR, 1.0f / a);
    v->dec_mul = powf(ENV_FLOOR / peak, 1.0f / d);
    v->dec_len = d;
}

static void burst_start(inst_t *s) {
    burst_t *b = NULL;
    for (int i = 0; i < MAX_BURSTS; i++) if (!s->b[i].on) { b = &s->b[i]; break; }
    if (!b) return;
    float w0 = 2.0f * (float)M_PI * BREATH_HZ / SR;
    float alpha = sinf(w0) / (2.0f * BREATH_Q);
    float a0 = 1.0f + alpha;
    b->b0 = alpha / a0;
    b->b2 = -alpha / a0;
    b->a1 = -2.0f * cosf(w0) / a0;
    b->a2 = (1.0f - alpha) / a0;
    b->x1 = b->x2 = b->y1 = b->y2 = 0.0f;
    b->left = (int)(BREATH_LEN_S * SR);
    b->g = BREATH_LEVEL;
    b->mul = powf(ENV_FLOOR / BREATH_LEVEL, 1.0f / b->left);
    b->on = 1;
}

/* One step of the spin: note i of n. */
static void play_step(inst_t *s, int i, int n) {
    float r = i == 0 ? 0.0f : cleared(i, n);
    int span = (int)lrintf(4.0f + 10.0f * (1.0f - r));
    int k = (int)(rnd_u32(s) % (uint32_t)(2 * span + 1)) - span;
    voice_start(s, penta_hz(NOTE_ROOT_HZ, k), NOTE_ATTACK_S,
                0.07f + 0.05f * r, 0.12f + 0.35f * r, 0);
    if (rnd01(s) < 0.5f * (1.0f - r)) burst_start(s);
}

static void play_chord(inst_t *s) {
    for (int i = 0; i < 4; i++)
        voice_start(s, CHORD_HZ[i], CHORD_ATTACK_S, CHORD_LEVEL[i], CHORD_DECAY[i],
                    (int)(i * CHORD_GAP_S * SR));
}

static int anything_sounding(const inst_t *s) {
    for (int i = 0; i < MAX_VOICES; i++) if (s->v[i].on) return 1;
    for (int i = 0; i < MAX_BURSTS; i++) if (s->b[i].on) return 1;
    return 0;
}

static void silence(inst_t *s) {
    for (int i = 0; i < MAX_VOICES; i++) s->v[i].on = 0;
    for (int i = 0; i < MAX_BURSTS; i++) s->b[i].on = 0;
}

/* Fire every event due at the current sample. */
static void run_events(inst_t *s) {
    while (s->spinning && s->next < s->ntimes && s->times[s->next] <= s->pos) {
        int i = s->next++;
        int notes = s->ntimes - 1;
#ifdef MUSE_TEST
        if (s->nlog < MAX_TIMES) s->log_at[s->nlog++] = s->pos;
#endif
        if (!s->mute) {
            if (i < notes) play_step(s, i, notes);
            else play_chord(s);
        }
        if (s->next >= s->ntimes) s->spinning = 0;
    }
}

static float render_sample(inst_t *s) {
    float sum = 0.0f;
    for (int i = 0; i < MAX_VOICES; i++) {
        voice_t *v = &s->v[i];
        if (!v->on) continue;
        if (v->wait > 0) { v->wait--; continue; }
        uint32_t idx = v->phase >> (32 - 11);
        float frac = (v->phase & ((1u << 21) - 1)) * (1.0f / (1u << 21));
        float x = g_sine[idx] + (g_sine[idx + 1] - g_sine[idx]) * frac;
        sum += x * v->g;
        v->phase += v->inc;
        if (v->stage == 0) {
            v->g *= v->att_mul;
            if (--v->left <= 0) { v->g = v->peak; v->stage = 1; v->left = v->dec_len; }
        } else {
            v->g *= v->dec_mul;
            if (--v->left <= 0) v->on = 0;
        }
    }
    for (int i = 0; i < MAX_BURSTS; i++) {
        burst_t *b = &s->b[i];
        if (!b->on) continue;
        float x = rnd01(s) * 2.0f - 1.0f;
        float y = b->b0 * x + b->b2 * b->x2 - b->a1 * b->y1 - b->a2 * b->y2;
        b->x2 = b->x1; b->x1 = x; b->y2 = b->y1; b->y1 = y;
        sum += y * b->g;
        b->g *= b->mul;
        if (--b->left <= 0) b->on = 0;
    }
    return sum;
}

/* -------------------------------------------------------------- v2 API -- */

static void *v2_create_instance(const char *dir, const char *cfg) {
    (void)dir; (void)cfg;
    inst_t *s = (inst_t *)calloc(1, sizeof(inst_t));
    if (!s) return NULL;
    s->mute_gain = 1.0f;
    s->rng = 0x9E3779B9u ^ (uint32_t)(uintptr_t)s;
    if (!s->rng) s->rng = 1;
    return s;
}

static void v2_destroy_instance(void *inst) { free(inst); }

static void v2_process_block(void *inst, int16_t *io, int frames) {
    inst_t *s = (inst_t *)inst;
    if (!s || !io) return;
    if (!s->spinning && !anything_sounding(s)) return;   /* untouched */

    const float fade_step = 1.0f / (MUTE_FADE_S * SR);
    for (int f = 0; f < frames; f++) {
        run_events(s);
        s->pos++;
        float x = render_sample(s);
        if (s->mute) {
            s->mute_gain -= fade_step;
            if (s->mute_gain <= 0.0f) { s->mute_gain = 0.0f; silence(s); }
            x *= s->mute_gain;
        }
        int add = (int)lrintf(x * MASTER * 32767.0f);
        if (add == 0) continue;
        for (int c = 0; c < 2; c++) {
            int y = io[2 * f + c] + add;
            if (y > 32767) y = 32767;
            if (y < -32768) y = -32768;
            io[2 * f + c] = (int16_t)y;
        }
    }
}

static void set_mute(inst_t *s, int m) {
    m = m ? 1 : 0;
    if (m == s->mute) return;
    s->mute = m;
    if (!m) { silence(s); s->mute_gain = 1.0f; }   /* anything left was fading */
}

static int parse_mute(const char *val) {
    while (*val == ' ' || *val == '"') val++;
    if (!strncmp(val, "on", 2) || !strncmp(val, "On", 2) || !strncmp(val, "true", 4)) return 1;
    return atof(val) >= 0.5;
}

static void set_spin(inst_t *s, const char *val) {
    char *end;
    unsigned long serial = strtoul(val, &end, 10);
    if (end == val) return;
    int t[MAX_TIMES], n = 0;
    const char *p = end;
    while (n < MAX_TIMES) {
        long ms = strtol(p, &end, 10);
        if (end == p) break;
        if (ms < 0 || ms > 60000) return;           /* not a schedule */
        int at = (int)(ms * SR / 1000);
        if (n > 0 && at < t[n - 1]) return;          /* must not go backwards */
        t[n++] = at;
        p = end;
    }
    if (n < 2) return;                               /* at least one note and the chord */
    s->spin_serial = (unsigned)serial;
    memcpy(s->times, t, sizeof(int) * n);
    s->ntimes = n;
    s->next = 0;
    s->pos = 0;
    s->spinning = 1;
#ifdef MUSE_TEST
    s->nlog = 0;
#endif
}

static void v2_set_param(void *inst, const char *key, const char *val) {
    inst_t *s = (inst_t *)inst;
    if (!s || !key || !val) return;
    if (!strcmp(key, "spin")) { set_spin(s, val); return; }
    if (!strcmp(key, "mute")) { set_mute(s, parse_mute(val)); return; }
    if (!strcmp(key, "state")) {
        const char *p = strstr(val, "\"mute\"");
        if (p && (p = strchr(p, ':'))) set_mute(s, parse_mute(p + 1));
        return;
    }
}

static const char *CHAIN_PARAMS =
    "["
      "{\"key\":\"mute\",\"name\":\"Mute\",\"type\":\"int\",\"min\":0,\"max\":1,\"default\":0},"
      "{\"key\":\"card\",\"name\":\"Card\",\"type\":\"canvas\",\"canvas_script\":\"canvas.js\","
       "\"as_page\":true,\"page_first\":true,\"enterable\":true,\"show_value\":false,"
       "\"extra_keys\":[\"mute\"]}"
    "]";

static const char *UI_HIERARCHY =
    "{\"levels\":{\"root\":{\"label\":\"Elusive Muse\",\"knobs\":[],"
    "\"params\":[{\"key\":\"card\"}]}}}";

static int copy_out(char *buf, int len, const char *str) {
    int n = (int)strlen(str);
    if (n >= len) return -1;
    memcpy(buf, str, (size_t)n + 1);
    return n;
}

static int v2_get_param(void *inst, const char *key, char *buf, int len) {
    inst_t *s = (inst_t *)inst;
    if (!s || !key || !buf || len <= 0) return -1;
    if (!strcmp(key, "name"))  return snprintf(buf, len, "Elusive Muse");
    if (!strcmp(key, "mute"))  return snprintf(buf, len, "%d", s->mute);
    if (!strcmp(key, "state")) return snprintf(buf, len, "{\"mute\":%d}", s->mute);
    if (!strcmp(key, "chain_params")) return copy_out(buf, len, CHAIN_PARAMS);
    if (!strcmp(key, "ui_hierarchy")) return copy_out(buf, len, UI_HIERARCHY);
    /* Anything else (the canvas key `card`, `spin`) has no value to show: an
     * empty answer, not a failed read, so the host does not retry it. */
    buf[0] = '\0';
    return 0;
}

#ifdef MUSE_TEST
int muse_test_log(void *inst, int *out, int max) {
    inst_t *s = (inst_t *)inst;
    int n = s->nlog < max ? s->nlog : max;
    memcpy(out, s->log_at, sizeof(int) * n);
    return n;
}
#endif

static audio_fx_api_v2_t g_api;

audio_fx_api_v2_t *move_audio_fx_init_v2(const host_api_v1_t *host) {
    (void)host;
    for (int i = 0; i <= SINE_N; i++)
        g_sine[i] = (float)sin(2.0 * M_PI * i / SINE_N);
    memset(&g_api, 0, sizeof(g_api));
    g_api.api_version      = AUDIO_FX_API_VERSION_2;
    g_api.create_instance  = v2_create_instance;
    g_api.destroy_instance = v2_destroy_instance;
    g_api.process_block    = v2_process_block;
    g_api.set_param        = v2_set_param;
    g_api.get_param        = v2_get_param;
    return &g_api;
}
