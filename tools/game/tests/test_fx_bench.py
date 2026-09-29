"""fxBench tooling (unified effects S9): tools/game/fx-bench.js, the browser measurement protocol, run headlessly beside the real shipping game: the visibility gate, restoring every global it changes (after a completed, failed or aborted run), the _pt ring and profiler plumbing, flushed batches, A/B modes and arithmetic, each target's workload, time-based targets, mid-run guards and the report's JSON shape.

The harness loads the game through the optional local audit lab (tools/webui/game_lab.py and tools/webui/harness/_game_env.js: the extracted header, a stub DOM and Canvas, a virtual clock and captured requestAnimationFrame). Without the lab these tests skip, as the core workflow does not require it."""

from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, REPO_ROOT, run_js

HARNESS = Path(__file__).with_name("fx_bench.js")
LAB_FILES = (REPO_ROOT / "tools/webui/game_lab.py", REPO_ROOT / "tools/webui/harness/_game_env.js")
# Load, the visibility gate (refusal, abort control, hidden mid-run),
# restoration after a completed run, the report shape, stage and sim timings,
# flushed batches, the suppressed dump, A/B modes, the random stream, the
# torch scene, the governor's raster input, no allocating stats while
# measuring, the workload counters, the stress and flame scenes (19 at the
# first S9 cut, 26 here); the weather scenes, percentiles of 40 known costs,
# A/B arithmetic, the combat scene, the 2 s governor snapshot, the T10 hold,
# camera drift, menus and resizes mid-run, a second injection, restoration
# after a failed run, a world reset and a chunk crossing mid-run, stage names
# and bodies, the source scan, leaks and errors.
PASS_COUNT = 33
SENTINEL = f"FX_BENCH_RESULT PASS {PASS_COUNT}"

RESTORED = "every global the bench changes is restored after a completed run, and the live pool sat out"
REPORT = "the report is plain JSON: environment metadata, every planned run, stage p50/p95/mean, effectsSim, cadence, workload and A/B pairs"
ABORT = "a visible page is accepted and fxBench.abort() restores it at once"
SOURCE = "fx-bench source never blurs, reloads or navigates, and names no random stream"
WORLD = "a world reset mid-run ends the run, clears and primes the live pool, keeps the fresh lists and gives back the rest"
CROSSING = "the live pool and lists set aside during a run follow a chunk crossing that happened meanwhile"
TIMING = "stage p50/p95/mean come from the _pt ring of each measured frame, per-frame sums and frame totals from the same frame"
FLUSHED = "flushed timings use a willReadFrequently:false scratch canvas with exactly one 1-pixel readback per batch, against a clear-only floor"
STAGES = "every stage the bench times or flushes is a _pt stage of the frame loop, and each flushed stage makes the calls of its loop body"
RASTER = "every unpinned run starts its governor with no raster from earlier runs or flushed batches"
STATS = "getEffectStats (which allocates in fx functions) is never called while a run warms up or measures, only once as each run ends"
WORKLOAD = "the workload counters are the means of the game's own per-frame counters over exactly the measured frames"
WEATHER = "rain targets measure forced rain in New and none in Legacy; clear targets stay clear whatever the Weather switch asks"
STRESS = "T3 measures the stress count: that many live dots in New and that many legacy motes in Legacy"
FLAME = "T7 holds the flame beam: its presentation state is refreshed at the current game time on every step"
PERCENTILES = "stage p50/p95/p99/max/mean over 40 frames are the nearest-rank values of costs known by construction"
AB = "A/B medians over even repeats are the mean of the middle two, deltas are New minus Legacy per quantile, and runs alternate ABBA"
COMBAT = "T6 produces wall or floor hits at 20/s and enemy deaths at 3/s of frame time, and New queues every hit"
GOVERNOR = "T9 records the governor at the first frame at least 2000 ms after its reset, with the elapsed time"
HOLD = "T10 holds its scene for holdMs of measured time, not a frame count, and reports the time"
DRIFT = "a run whose camera turned while measuring is reported invalid, with the drift; unmoved runs stay valid"
GUARDS = "a menu opened or the canvas resized during a run ends it with a message and restores the page"
REINJECT = "injecting the bench again while a run is active keeps the running copy, which still refuses a second run and aborts"
# Each mutation must fail its named check; setup failures and crashes do not count.
MUTATIONS = {
    "--no-restore": RESTORED,
    "--no-visibility-gate": "a page that is not visible is refused with a message naming visibilityState and allowHidden; nothing changes and no frame is requested",
    "--no-hidden-guard": "a tab hidden mid-run ends the run, discards its results and restores the page",
    "--ring-off-by-one": TIMING,
    "--sim-all-ticks": "effectsSim p50/p95/mean come from the physics profiler samples of the measured ticks only",
    "--readback-per-frame": FLUSHED,
    "--will-read-frequently": FLUSHED,
    "--no-suppress-dump": "dumpPerfBreakdown is suppressed during the run and restored after",
    "--ab-single-mode": "each A/B run measures its own mode: Unified effects on for New, off for Legacy",
    "--bench-random": "the bench never draws from the gameplay random stream",
    "--no-face-torch": "T8 faces the nearest torch and records its distance",
    "--stage-typo": STAGES,
    "--bench-reload": SOURCE,
    "--shared-step": ABORT,
    "--restore-stale-world": WORLD,
    "--no-live-reset": WORLD,
    "--no-live-rebase": CROSSING,
    "--no-list-rebase": CROSSING,
    "--no-raster-reset": RASTER,
    "--no-raster-restore": RESTORED,
    "--weather-on-live": RESTORED,
    "--stats-poll": STATS,
    "--workload-once": WORKLOAD,
    "--frame-total-wrong-slot": TIMING,
    "--no-scratch-release": FLUSHED,
    "--rain-never-forced": WEATHER,
    "--no-weather-toggle": WEATHER,
    "--clear-not-forced": WEATHER,
    "--no-stress-fill": STRESS,
    "--stress-no-scale": STRESS,
    "--legacy-stress-P": STRESS,
    "--no-flame-refresh": FLAME,
    "--no-combat": COMBAT,
    "--hits-rate-x10": COMBAT,
    "--no-debris-toggle": COMBAT,
    "--p95-is-max": PERCENTILES,
    "--p50-is-p60": PERCENTILES,
    "--delta-sign": AB,
    "--delta-wrong-quantile": AB,
    "--median-even-upper": AB,
    "--no-abba": AB,
    "--gov-2s-frames": GOVERNOR,
    "--hold-frames": HOLD,
    "--no-hold-buffer-check": HOLD,
    "--stress-count-smoke-exempt": STRESS,
    "--drift-check-off": DRIFT,
    "--no-menu-guard": GUARDS,
    "--no-size-guard": GUARDS,
    "--replace-active": REINJECT,
    "--flush-stage-drift": STAGES,
}
# Checks a mutation must fail as well as its named one.
ALSO_FAILS = {
    "--no-restore": [ABORT, "a tab hidden mid-run ends the run, discards its results and restores the page",
                     "every global the bench changes is restored after a run that fails mid-way"],
    "--bench-random": [SOURCE],
    "--no-face-torch": [RESTORED],
    "--stage-typo": [REPORT],
    # A per-run quantile error moves the A/B medians built on it.
    "--p95-is-max": [AB],
    "--p50-is-p60": [AB],
}
# The failure detail must also show the intended cause.
CAUSES = {
    "--no-restore": r'"notRestored":\["fxState",',
    "--no-visibility-gate": r'"message":null,',
    "--no-hidden-guard": r'"stopped":false,"error":null,',
    # The previous frame's slot: the combat costs of other frames.
    "--ring-off-by-one": r'"want":\{"combat":\[',
    # Earlier runs' ticks stay in the samples.
    "--sim-all-ticks": r'"ticks":(\d+),"got":\{"n":(?!\1,)\d+',
    "--readback-per-frame": r'"readbacks":80,"expected":40,',
    "--will-read-frequently": r'"willReadFrequently":true',
    "--no-suppress-dump": r'"callsDuringRun":[1-9]',
    "--ab-single-mode": r'"mode":"legacy","target":"T\d+","unified":true',
    "--bench-random": r'"benchDraws":[1-9]',
    "--no-face-torch": r'"off":\[\{"ang":',
    "--stage-typo": r'"absent":\["fxOverlays"\]',
    "--bench-reload": r'"matched":\["',
    # The aborted run's pending frame also steps the next run.
    "--shared-step": r'"benchCallbacksPerFrameOfTheNextRun":2,',
    "--restore-stale-world": r'"staleAmbient":true,"staleDeaths":true',
    "--no-live-reset": r'"livePool":\{"reinstated":true,"count":[1-9]\d*,',
    # The pool (and the bone) one chunk off in world coordinates.
    "--no-live-rebase": r'"offWorld":[1-9]\d*,"boneOffWorld":\[0,0\]',
    "--no-list-rebase": r'"offWorld":0,"boneOffWorld":\[480,0\]',
    # The first unpinned run already steps on raster it never painted (the
    # live game's leftover, then the New run's flush).
    "--no-raster-reset": r'"warm":0,"rasterMs":(?!0,)[0-9.e-]+,',
    "--no-raster-restore": r'"notRestored":\["_fxRender\.rasterAcc","_fxRender\.rasterMs","_fxRender\.input"\]',
    # The first run's clear force lands on the live pool (it had none).
    "--weather-on-live": r'"before":\{[^}]*"force":\[-9,1\][^}]*\},"after":\{[^}]*"force":\[-1,1\]',
    "--stats-poll": r'"callsWhileMeasuring":[1-9]\d*,',
    "--workload-once": r'"sampledFrames 1 of 3"',
    "--frame-total-wrong-slot": r'"bad":\[\],"frameTotals":\[\{',
    "--no-scratch-release": r'"scratchAfter":\[400,270\]',
    # New T4 measured clear skies.
    "--rain-never-forced": r'"target":"T4","mode":"new","frame":\d+,"kind":null,"weatherLive":0',
    "--no-weather-toggle": r'"target":"T4","mode":"new","frame":\d+,"kind":null,"weatherLive":0',
    "--clear-not-forced": r'"leg":"A/B","target":"T6","mode":"new","frame":\d+,"kind":"snow","weatherLive":[1-9]',
    "--no-stress-fill": r'"mode":"new","valid":false,"frames":3,"live":\[0,0,0\]',
    "--stress-no-scale": r'"mode":"new","valid":true,"frames":3,"live":\[(?!300,)\d+,',
    "--legacy-stress-P": r'"mode":"legacy","valid":true,"frames":3,"live":\[0,0,0\],"motes":\[60,60,60\]',
    "--no-flame-refresh": r'"stale":\[\{"index":\d+,"phase":"warmup"',
    "--no-combat": r'"hits":0,"wantHits":1\d\.\d+,"deaths":0,',
    "--hits-rate-x10": r'"hits":1\d\d,"wantHits":1\d\.\d+,',
    "--no-debris-toggle": r'"mode":"new","seconds":[0-9.]+,"hits":1\d,"wantHits":[0-9.]+,"deaths":\d,"wantDeaths":[0-9.]+,"queuedHits":0,',
    "--p95-is-max": r'"got":\{"n":40,"p50":1\.25,"p95":2\.5,',
    "--p50-is-p60": r'"got":\{"n":40,"p50":1\.5,',
    "--delta-sign": r'"got":\{.*"delta":\{"p50":1\.4375,"p95":2\.5625',
    "--delta-wrong-quantile": r'"got":\{.*"delta":\{"p50":-1\.4375,"p95":-1\.4375',
    "--median-even-upper": r'"got":\{"deltaIs":"[^"]*","newP50":\{"n":2,"median":1\.4375,',
    "--no-abba": r'"order":\["new#0","legacy#0","new#1","legacy#1"\]',
    # 120 measured frames after a 20-frame warm-up: 140 frames, not 120.
    "--gov-2s-frames": r'"snapshot":\{"elapsedMs":23\d\d\.',
    "--hold-frames": r'"measuredFrames":125,',
    # At 1000 Hz the 125-frame buffer is full after 125 ms; the run went on.
    "--no-hold-buffer-check": r'"fast":\{"measured":250,',
    # A 1000-dot fill that one warm-up tick cannot reach stays valid.
    "--stress-count-smoke-exempt": r'"short":\{"valid":true,"liveAtFirstFrame":\d+,',
    "--drift-check-off": r'"scene":\{"valid":true,[^}]*"drift":\{"x":0,"y":0,"ang":0\.05,',
    "--no-menu-guard": r'"change":"settingsOpen","measuring":true,"stopped":false,',
    "--no-size-guard": r'"change":"canvas","measuring":true,"stopped":false,',
    "--replace-active": r'"kept":false,',
    "--flush-stage-drift": r'"drift":\{"coneFX3D":\{"loop":\["drawConeEffects3D\(\)","drawFlameStream3D\(\)"\],"bench":\["drawConeEffects3D\(\)"\]',
}


def _game() -> str:
    from tools.webui.game_lab import extracted_path
    return str(extracted_path())


def _run(args=()):
    result = run_js(HARNESS, [_game(), *args], timeout=300)
    return result.stdout + result.stderr, result.stdout.splitlines()


def _jobs() -> int:
    # dev.py test sets HW1_GAME_JOBS=1: full-game harnesses run one at a time.
    try:
        return max(1, int(os.environ.get("HW1_GAME_JOBS", "1")))
    except ValueError:
        return 1


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
@unittest.skipUnless(all(path.exists() for path in LAB_FILES),
                     "the optional local game audit lab (tools/webui/game_lab.py, tools/webui/harness/_game_env.js) is absent")
class FxBenchTests(unittest.TestCase):
    def test_fx_bench(self) -> None:
        output, lines = _run()
        self.assertIn(SENTINEL, lines, output)
        self.assertFalse([line for line in lines if line.startswith("SKIP ")], output)
        self.assertEqual(PASS_COUNT, sum(line.startswith("PASS ") for line in lines), output)
        self.assertFalse([line for line in lines if line.startswith("FAIL ")], output)

    def test_mutations_fail_their_named_checks(self) -> None:
        _game()                               # extract once, before the workers
        with ThreadPoolExecutor(max_workers=_jobs()) as pool:
            results = dict(zip(MUTATIONS, pool.map(lambda flag: _run([flag]), MUTATIONS)))
        for flag, check in MUTATIONS.items():
            output, lines = results[flag]
            with self.subTest(mutation=flag):
                self.assertNotIn(SENTINEL, lines, output)
                failing = [line for line in lines if line.startswith("FAIL " + check + " ")]
                self.assertTrue(failing, output)
                self.assertTrue(any(line.startswith("FX_BENCH_RESULT FAIL ") for line in lines), output)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP ", output)
                self.assertNotIn("ran without an exception", output)
                if flag in CAUSES:
                    self.assertRegex(failing[0], CAUSES[flag], output)
                for also in ALSO_FAILS.get(flag, []):
                    self.assertTrue([line for line in lines if line.startswith("FAIL " + also + " ")], output)


if __name__ == "__main__":
    unittest.main()
