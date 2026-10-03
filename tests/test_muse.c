/*
 * test_muse.c — the DSP, driven black-box through the v2 API (plus one
 * test-build hook, muse_test_log, for onsets the audio cannot show).
 *
 *   ./test_muse          run the checks
 *   ./test_muse --dump   print chain_params and ui_hierarchy, one per line,
 *                        for tests/page.test.mjs to compare with module.json
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdint.h>

#include "host/plugin_api_v1.h"
#include "host/audio_fx_api_v2.h"

audio_fx_api_v2_t *move_audio_fx_init_v2(const host_api_v1_t *host);
int muse_test_log(void *inst, int *out, int max);

#define SR 44100
#define BLOCK 128

static audio_fx_api_v2_t *api;
static int failures, checks;

#define CHECK(cond, ...) do { checks++; if (!(cond)) { failures++; \
    printf("FAIL %s:%d: ", __FILE__, __LINE__); printf(__VA_ARGS__); printf("\n"); } } while (0)

static uint32_t lcg = 12345;
static int16_t rnd16(void) { lcg = lcg * 1664525u + 1013904223u; return (int16_t)(lcg >> 16); }

/* Run `ms` of audio through, input `in` (NULL = silence), output to `out`. */
static void run(void *s, int16_t *buf, int frames) {
    for (int f = 0; f < frames; f += BLOCK) {
        int n = frames - f < BLOCK ? frames - f : BLOCK;
        api->process_block(s, buf + 2 * f, n);
    }
}

static int ms2f(int ms) { return (int)((long)ms * SR / 1000); }

static void test_passthrough(void) {
    void *s = api->create_instance(".", NULL);
    int frames = SR * 2;
    int16_t *in = malloc(sizeof(int16_t) * 2 * frames), *io = malloc(sizeof(int16_t) * 2 * frames);
    for (int i = 0; i < 2 * frames; i++) in[i] = rnd16();
    memcpy(io, in, sizeof(int16_t) * 2 * frames);
    run(s, io, frames);
    CHECK(!memcmp(in, io, sizeof(int16_t) * 2 * frames), "pass-through is not bit-identical with no spin");

    /* A spin, then wait it out: identical again once everything has rung out. */
    api->set_param(s, "spin", "1 0 50 100 150");
    int16_t *tmp = malloc(sizeof(int16_t) * 2 * SR * 4);
    memset(tmp, 0, sizeof(int16_t) * 2 * SR * 4);
    run(s, tmp, SR * 4);
    memcpy(io, in, sizeof(int16_t) * 2 * frames);
    run(s, io, frames);
    CHECK(!memcmp(in, io, sizeof(int16_t) * 2 * frames), "pass-through not bit-identical after a spin rang out");
    free(in); free(io); free(tmp);
    api->destroy_instance(s);
}

/* Every event fires at its sample, the notes sound, and nothing sounds before. */
static void test_schedule(void) {
    void *s = api->create_instance(".", NULL);
    const int t[] = { 0, 1000, 2000, 3000 };       /* 3 notes, chord at 3000 */
    api->set_param(s, "spin", "42 0 1000 2000 3000");
    int frames = ms2f(6000);
    int16_t *io = calloc(2 * frames, sizeof(int16_t));
    run(s, io, frames);
    int log[80], n = muse_test_log(s, log, 80);
    CHECK(n == 4, "expected 4 events, got %d", n);
    for (int i = 0; i < n && i < 4; i++)
        CHECK(log[i] == ms2f(t[i]), "event %d at sample %d, expected %d", i, log[i], ms2f(t[i]));
    /* Something audible within 10 ms of each event, and the second note
     * is preceded by silence (the first has rung out by then). */
    for (int i = 0; i < 4; i++) {
        int a = ms2f(t[i]), loud = 0;
        for (int f = a; f < a + ms2f(10); f++) if (abs(io[2 * f]) > 50) loud = 1;
        CHECK(loud, "event %d at %d ms is not audible", i, t[i]);
    }
    int quiet = 1;
    for (int f = ms2f(t[1]) - ms2f(30); f < ms2f(t[1]); f++) if (io[2 * f] != 0) quiet = 0;
    CHECK(quiet, "not silent before the second note");
    int same = 1;
    for (int f = 0; f < frames; f++) if (io[2 * f] != io[2 * f + 1]) same = 0;
    CHECK(same, "left and right differ");
    free(io);
    api->destroy_instance(s);
}

/* A realistic spin as the page sends it, and a pile-up: never clips. */
static void test_level(void) {
    void *s = api->create_instance(".", NULL);
    const char *spin =
        "7 0 30 61 91 122 153 184 215 247 279 312 346 382 420 461 506 556 611 "
        "674 745 826 918 1023 1143 1279 1434 1611 1811 2038 2295 2584 2908";
    int frames = ms2f(6000), peak = 0;
    int16_t *io = calloc(2 * frames, sizeof(int16_t));
    api->set_param(s, "spin", spin);
    run(s, io, frames);
    for (int f = 0; f < 2 * frames; f++) if (abs(io[f]) > peak) peak = abs(io[f]);
    printf("  one spin: peak %d (%.1f dBFS)\n", peak, 20 * log10(peak / 32767.0));
    CHECK(peak > 1000 && peak < 16000, "one spin peaks at %d", peak);

    /* Clicking again the moment each card lands, eight times: every chord
     * is still ringing under the next spin's fast notes, which is the most
     * the page can ask for (a click mid-spin is ignored there). */
    peak = 0;
    enum { GAP = 2950 * SR / 1000 };
    static int16_t blk[2 * GAP];
    for (int k = 0; k < 8; k++) {
        api->set_param(s, "spin", spin);
        memset(blk, 0, sizeof(blk));
        run(s, blk, GAP);
        for (int f = 0; f < 2 * GAP; f++) if (abs(blk[f]) > peak) peak = abs(blk[f]);
    }
    printf("  pile-up: peak %d (%.1f dBFS)\n", peak, 20 * log10(peak / 32767.0));
    CHECK(peak < 32767, "pile-up clips");
    free(io);
    api->destroy_instance(s);
}

static void test_mute(void) {
    void *s = api->create_instance(".", NULL);
    int frames = ms2f(4000);
    int16_t *in = malloc(sizeof(int16_t) * 2 * frames), *io = malloc(sizeof(int16_t) * 2 * frames);
    for (int i = 0; i < 2 * frames; i++) in[i] = rnd16() / 4;

    /* Muted: a spin changes nothing at all. */
    api->set_param(s, "mute", "1");
    memcpy(io, in, sizeof(int16_t) * 2 * frames);
    api->set_param(s, "spin", "1 0 100 200 300");
    run(s, io, frames);
    CHECK(!memcmp(in, io, sizeof(int16_t) * 2 * frames), "a muted spin changed the audio");

    char buf[64];
    api->get_param(s, "mute", buf, sizeof buf);
    CHECK(!strcmp(buf, "1"), "mute reads back %s", buf);
    api->get_param(s, "state", buf, sizeof buf);
    CHECK(!strcmp(buf, "{\"mute\":1}"), "state is %s", buf);

    /* Muting mid-chord: silent (exact pass-through) within 6 ms. */
    api->set_param(s, "mute", "0");
    api->set_param(s, "spin", "2 0 100");
    int16_t *z = calloc(2 * frames, sizeof(int16_t));
    run(s, z, ms2f(300));                        /* the chord is ringing */
    int ringing = 0;
    for (int f = ms2f(250); f < ms2f(300); f++) if (z[2 * f]) ringing = 1;
    CHECK(ringing, "the chord is not ringing before the mute");
    api->set_param(s, "mute", "on");
    memset(z, 0, sizeof(int16_t) * 2 * frames);
    run(s, z, ms2f(100));
    int late = 0;
    for (int f = ms2f(6); f < ms2f(100); f++) if (z[2 * f]) late = 1;
    CHECK(!late, "still sounding 6 ms after mute");

    /* Unmuting mid-spin picks up at the next step. */
    api->set_param(s, "mute", "1");
    api->set_param(s, "spin", "3 0 500 1000 1500");
    memset(z, 0, sizeof(int16_t) * 2 * frames);
    run(s, z, ms2f(700));
    api->set_param(s, "mute", "0");
    memset(z, 0, sizeof(int16_t) * 2 * frames);
    run(s, z, ms2f(1000));                       /* covers the step at 1000 ms */
    int back = 0;
    for (int f = ms2f(300); f < ms2f(320); f++) if (abs(z[2 * f]) > 50) back = 1;
    CHECK(back, "no note after unmuting mid-spin");

    /* State restores into a new instance. */
    void *s2 = api->create_instance(".", NULL);
    api->set_param(s2, "state", "{\"mute\":1}");
    api->get_param(s2, "mute", buf, sizeof buf);
    CHECK(!strcmp(buf, "1"), "state did not restore mute (%s)", buf);
    api->destroy_instance(s2);
    free(in); free(io); free(z);
    api->destroy_instance(s);
}

/* Malformed spins are ignored rather than half-played. */
static void test_bad_spins(void) {
    const char *bad[] = { "", "abc", "1", "1 5", "1 0 200 100", "1 -5 10", "1 0 999999" };
    for (unsigned k = 0; k < sizeof bad / sizeof *bad; k++) {
        void *s = api->create_instance(".", NULL);
        api->set_param(s, "spin", bad[k]);
        int16_t io[2 * 4410];
        memset(io, 0, sizeof io);
        run(s, io, 4410);
        int any = 0;
        for (int i = 0; i < 2 * 4410; i++) if (io[i]) any = 1;
        CHECK(!any, "malformed spin \"%s\" made sound", bad[k]);
        api->destroy_instance(s);
    }
}

static void test_params(void) {
    void *s = api->create_instance(".", NULL);
    char buf[2048];
    CHECK(api->get_param(s, "chain_params", buf, sizeof buf) > 0, "no chain_params");
    CHECK(api->get_param(s, "ui_hierarchy", buf, sizeof buf) > 0, "no ui_hierarchy");
    CHECK(api->get_param(s, "chain_params", buf, 8) == -1, "chain_params truncated silently");
    CHECK(api->get_param(s, "nonsense", buf, sizeof buf) == 0 && !buf[0], "unknown key is not an empty answer");
    api->destroy_instance(s);
}

int main(int argc, char **argv) {
    host_api_v1_t host;
    memset(&host, 0, sizeof host);
    host.sample_rate = SR;
    host.frames_per_block = BLOCK;
    api = move_audio_fx_init_v2(&host);

    if (argc > 1 && !strcmp(argv[1], "--dump")) {
        void *s = api->create_instance(".", NULL);
        char buf[4096];
        api->get_param(s, "chain_params", buf, sizeof buf); printf("%s\n", buf);
        api->get_param(s, "ui_hierarchy", buf, sizeof buf); printf("%s\n", buf);
        api->destroy_instance(s);
        return 0;
    }

    test_passthrough();
    test_schedule();
    test_level();
    test_mute();
    test_bad_spins();
    test_params();
    printf("dsp: %d checks, %d failed\n", checks, failures);
    return failures ? 1 : 0;
}
