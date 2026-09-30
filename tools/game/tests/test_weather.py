"""Weather (rain, snow, ash) on the unified particle engine (slice S7)."""

from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

HARNESS = Path(__file__).with_name("weather.js")
# H1 roofs, capless roofs, wall tops and sideways drift (7), H1 on a classic
# Expanse level (2) and on the generated Cave Test world (2), H2 underground,
# the cave mouth and the rock around it (8), H3 snow line with its
# prerequisite, live densities and the biome kinds (5), H4 schedule,
# crossfades, biome chances (8) and the wind across a front (1), B15 (2),
# the box, splashes, prewarm and refill burst (4), wall sides (1), wraps
# (1), H5 slopes (2), H6 switch, state and dev force (5), H7 populations by
# Particles and intensity (3), H8 2D (7) and the 3D edge fade (1), wind (2),
# day, night and torch lighting with ash's missing night boost (5), the
# chunk crossing (1), profile and studio weather (2), the B1, B3 (2) and C9
# (2) re-runs on shipping weather, a bad step (1), plus load, runtime
# failures and console/stage errors: 78 at the S7 fix. S9: a refill at the
# full budget spends no draw on a refused member (1). The water system
# merge: rain and snow on a lake's surface (2), and the generated check
# restated to land on water standing over a column: 81.
PASS_COUNT = 81
SENTINEL = f"WEATHER_RESULT PASS {PASS_COUNT}"

ROOF = "rain never falls through a roof"
CAPLESS = "rain ends on a capless cave roof (floor and ceiling layers only), never inside the cave"
CLASSIC = "weather never falls into a classic cave (its capless roof ends the sky)"
SETTLE = "snow settles on the open sky of its column: floors, caps, capless roofs and wall tops"
SPAWN = "rain spawns 70-150 u above its own column's open sky"
GENERATED = "generated rain lands on the open sky of its column (on the water standing over it), never under a roof"
VISIBILITY = "weather population follows the cave-mouth visibility"
DEEP = "weather is gone within a second deep underground (blend 1)"
ROCK = "no rain seen through a cave mouth is drawn over the rock around it"
PEAKS = "the peaks snow at forced snow's density (live members)"
VALLEYS = "valleys keep rain's density where peaks snow (live members)"
PURE = "weather is a pure function of seed and sim time"
CROSSFADE = "a front change crossfades each level over 8 s and eases the wind over 10 s"
BIOME_FADE = "a biome change crossfades the kinds over 8 s"
CHANCE = "auto weather follows each biome's chance"
WIND_FRONT = "falling snow follows the wind through drag across a front change"
SPLASH = "rain splashes with chance 0.45, only within 120 u of the camera"
WRAP = "a wrapped member keeps its height above its new column; a settled one leaves"
FORCED = "each forced kind shows only that kind"
OFF = "switching the weather off clears it within the cull fade and calms the wind"
FORCE_RESET = "a dev weather force outlives a world reset"
INTENSITY = "weather populations follow the intensity (a dev force, an auto front)"
MEDIUM = "steady Medium rain reaches 95% of its population within 2 s"
SETTING = "weather populations follow the Particles setting"
SPLASH_2D = "2D rain draws splashes across the view at T / meanLife a second"
FADE_2D = "2D snow is fully shown over the view and fades over its margin"
FULLSCREEN = "fullscreen 2D weather covers the view (snow and splashes by ninths)"
TORCH = "rain near torches catches their light at night (lightGrid)"
WATER_RAIN = ("rain over a lake splashes on its surface and never falls below it; beside it, and under it with the water "
              "system off, rain lands on the ground")
WATER_SNOW = "snow settles on a lake's surface, 0.3 u over it, and on the ground beside it"

# Each mutation must fail every named check; setup failures and crashes do not count.
MUTATIONS = {
    "--weather-lowest-layer": [ROOF, CAPLESS, SPAWN, SETTLE, CLASSIC, GENERATED],
    "--walkable-only-sky": [CAPLESS, ROOF, SPAWN, SETTLE, CLASSIC],
    "--cave-wall-as-wall": [GENERATED],
    "--side-entry-climbs": ["snow blown sideways into a higher column never climbs onto it"],
    "--ignore-underground": [DEEP, "the deep chamber has no weather", VISIBILITY],
    "--weather-zero-underground": ["weather at the cave-mouth blend 0.5 keeps at least 80% of the surface population", VISIBILITY,
                                   "the view from 1 cell inside a cave mouth draws the rain outside"],
    "--no-excess-cull": [VISIBILITY, "weather population follows a lower Particles setting within the cull fade", DEEP],
    "--weather-unoccluded": [ROCK],
    "--no-snowline": ["peaks snow while valleys rain", PEAKS],
    "--swap-fills-rain-set": [VALLEYS, PEAKS],
    "--swap-always": [PEAKS],
    "--weather-wall-clock": [PURE, CROSSFADE, CHANCE],
    "--tick-keyed-weather": [PURE, "the weather schedule does not depend on the step size", CHANCE],
    "--no-crossfade": [CROSSFADE, BIOME_FADE],
    "--crossfade-rate": [CROSSFADE, BIOME_FADE],
    "--no-wind-ease": [CROSSFADE, WIND_FRONT],
    "--chance-const": [CHANCE],
    "--refill-per-tick-ceil": ["refill per second does not depend on the step size (within 1 spawn)"],
    "--no-child-near": [SPLASH],
    "--bias-zero": ["rain spawns in the box 90 u ahead of the camera"],
    "--splash-chance-1": [SPLASH],
    "--prewarm-no-fall": ["a prewarm spreads rain over its fall"],
    "--acc-uncapped": ["a held-back refill does not burst when the sky returns"],
    "--wall-side-splash": ["rain against a wall side dies there; rain onto its top splashes"],
    "--wrap-keep-z": [WRAP],
    "--wrap-rest": [WRAP],
    "--splash-cell-constant": ["splashes lie on the terrain slope"],
    "--toggle-ignored": [FORCED, OFF],
    "--kind-first": [FORCED, FORCE_RESET],
    "--off-keeps-wind": [OFF],
    "--reset-drops-force": [FORCE_RESET],
    "--refill-seconds-cap": [MEDIUM, SETTING, INTENSITY],
    "--no-intensity-scale": [INTENSITY],
    "--force-ignores-intensity": [INTENSITY],
    "--simulate-2d-rain": ["no rain drops are simulated in the 2D view", SPLASH_2D, FULLSCREEN],
    "--2d-view-box": [FULLSCREEN, FADE_2D],
    "--2d-no-snowline": ["2D rain above the snow line is simulated snow, below it splashes"],
    "--2d-splash-rate-x3": [SPLASH_2D],
    "--fade-no-mask": ["weather fades over the edge of its box", FADE_2D],
    "--wind-at-rest": ["rain and snow start at the wind speed and follow it", WIND_FRONT],
    "--wall-top-kills-rest": [SETTLE],
    "--rain-emissive": ["rain darkens at night (spriteLight of the surface ambient)", TORCH],
    "--rain-ambient-light": [TORCH],
    "--snow-no-night-boost": ["snow gains its night boost"],
    "--ash-night-boost": ["ash does not brighten at night"],
    "--no-fx-rebase": ["weather members keep their world position across a chunk crossing"],
    "--weather-math-random": ["cosmetic weather never reads Math.random or presentationRandom"],
    "--no-reserve": ["B3a on shipping rain: rain fills B and three pickups take the reserve without stealing"],
    "--no-steal": ["B3b on shipping rain: with no reserve the pickups steal from the weather class"],
    "--weather-refill-steals": ["a weather refill at the full budget spends no draw on a refused member"],
    "--per-particle-billboard": ["count-based performance gates hold under Ultra rain"],
    "--profile-weather-unforced": ["a browser profile primes clear weather unless its job names it"],
    "--studio-weather-unforced": ["a casting-studio pool stays clear under any Weather switch"],
    "--no-dt-guard": ["a step outside (0, 1] s is a counted failure and the next tick runs"],
    "--rain-through-water": [WATER_RAIN, WATER_SNOW, GENERATED],
}
# The first named check's failure detail must also show the intended cause.
CAUSES = {
    # Historical defect (the ambient lowest-layer rule): rain splashes on the cave floor under the 35 u cap.
    "--weather-lowest-layer": r'"bad":[1-9]\d*,"first":\[\{"x":[\d.]+,"y":[\d.]+,"z":0\}',
    # The S7 first cut: under a classic capless roof (ceiling 30 u) rain lands on the cave floor.
    "--walkable-only-sky": r'"roof":30,"splashes":[1-9]\d*,"bad":[1-9]\d*,"first":\[\{"x":[\d.]+,"y":[\d.]+,"z":0\}',
    # Splashes on a cave wall's top over the approach, where a falling body lands lower (outside any roof).
    "--cave-wall-as-wall": r'"bad":[1-9]\d*,"first":\[\{"view":"\w+","x":[\d.]+,"y":[\d.]+,"z":-?[\d.]+,"landing":-?[\d.]+,"under":false,"buried":false\}',
    # Flakes from low in the open column rest on the 35 u cap.
    "--side-entry-climbs": r'"climbs":[1-9]\d*,"first":\[\{"x":36\d\.\d+,"from":[\d.]+,"to":35\.3,"rest":true\}',
    "--ignore-underground": r'"rain":\{"blend":1,"P":25,"target":600,"pool":600,',
    "--weather-zero-underground": r'"rain":\{"blend":0\.5,"P":25,"target":0,"pool":0,',
    # Rain dies on its own; snow's excess outlives the cut (448 against 225).
    "--no-excess-cull": r'"snow":\{"blend":0\.75,"P":25,"target":225,"pool":(2[3-9]\d|[3-9]\d\d),',
    "--weather-unoccluded": r'"overRock":[1-9]\d*,',
    "--no-snowline": r'"snow":0,"rainAboveLine":\[\d',
    # The S7 first cut: long-lived snow fills the rain set, the valleys keep about a sixth of their rain.
    "--swap-fills-rain-set": r'"share":0\.[0-4]\d*\}',
    "--swap-always": r'"ratio":(1\.[3-9]|[2-9])',
    # The front depends on the clock origin (a later front under a later origin).
    "--weather-wall-clock": r'"otherClockOrigin":\{"second":1,"field":0,',
    # At 120 Hz the tick-keyed schedule runs twice as fast: another front.
    "--tick-keyed-weather": r'"at120Hz":\{"second":\d+,"field":0,',
    "--no-crossfade": r'"fasterThanAnEighthASecond":\[\{"t":[\d.]+,"from":[\d.]+,"to":[\d.]+\}',
    # Reaches a 0.77 goal in 6.2 s instead of 8: past the midpoint at 4 s.
    "--crossfade-rate": r'"at4":\{"level":[\d.]+,"want":[\d.]+,"ok":false\}',
    "--no-wind-ease": r'"winds":\[\{"front":1,"wind":\[[-\d.]+,[-\d.]+\],"mid":\[[-\d.]+,[-\d.]+\],"ok":false\}',
    # Forest (chance 0.6) is clear at a roll of 0.54.
    "--chance-const": r'"bad":\[\{"biome":"forest","front":\d+,"roll":0\.5\d*,"active":false\}',
    "--refill-per-tick-ceil": r'"bad":\[\{"t":0\.05,',
    "--no-child-near": r'"beyond120":[1-9]\d*,',
    # With no bias the box reaches 200 u behind the camera.
    "--bias-zero": r'"outsideBox":[1-9]\d*,"behind110":[1-9]\d*,',
    "--splash-chance-1": r'"share":0\.9\d*\}',
    "--prewarm-no-fall": r'"belowSpawnHeight":0\}',
    "--acc-uncapped": r'"firstTick":(9[7-9]|[1-9]\d\d),',
    "--wall-side-splash": r'"onTop":4,"fromSides":[1-9]',
    # Uphill wraps keep their height, so they land below (and settle on) the new ground.
    "--wrap-keep-z": r'"bad":[1-9]\d*,',
    "--wrap-rest": r'"settledWrapped":[1-9]\d*,',
    "--splash-cell-constant": r'"bad":[1-9]\d{2,},',
    # Forced snow shows the auto weather (rain in the plains) instead.
    "--toggle-ignored": r'"snow":\{"live":\{"weather\.rain"',
    "--kind-first": r'"snow":\{"live":\{"weather\.snow":\d+\},"spawned":\d+,"kind":"rain"\}',
    "--off-keeps-wind": r'"after":0,"windBefore":[\d.]+,"windAfter":\[-?[1-9]',
    "--reset-drops-force": r'"force":null,',
    # Perf's rule settles near 70% (the judge's finding).
    "--refill-seconds-cap": r'"share":0\.[67]\d*,',
    "--no-intensity-scale": r'"force":\{"kind":"rain","P":25,"intensity":0\.5,"target":600,',
    "--force-ignores-intensity": r'"force":\{"kind":"rain","P":25,"intensity":0\.5,"target":600,',
    "--simulate-2d-rain": r'"drops2D":[1-9]\d*,"rainBirths2D":[1-9]',
    # The S7 first cut: 3D's 400 u box in the middle of a fullscreen view.
    "--2d-view-box": r'"ninths":\[0,',
    "--2d-no-snowline": r'"snow":0,.*"splashesAboveLine":[1-9]',
    "--2d-splash-rate-x3": r'"splashes":4\d{3},',
    "--fade-no-mask": r'"fade":1,"want":0\.',
    "--wind-at-rest": r'"first":\[\{"vx":0,"vy":0,',
    "--wall-top-kills-rest": r'"wall":0,',
    "--rain-emissive": r'"ratio":1,',
    "--rain-ambient-light": r'"ratio":1\}',
    "--snow-no-night-boost": r'"alphaRatio":1,',
    "--ash-night-boost": r'"alphaRatio":1\.(0[4-9]|1)',
    # Every tracked member lands 480 u off and wraps back 400: 80 u jumps.
    "--no-fx-rebase": r'"jumped":[1-9]\d*,"first":\[\[80\.',
    "--weather-math-random": r'"random":[1-9]',
    "--no-reserve": r'"aboveB":0,"stolen":[1-9]',
    "--no-steal": r'"feedback":([0-3]?\d|4[01]),',
    # Draws go on after the pool reaches B, each refused.
    "--weather-refill-steals": r'"atBudget":[1-9]\d*,',
    "--per-particle-billboard": r'"clipShare":0\.([1-9]|0[3-9])',
    # The plain profile follows the Weather switch (rain) instead of clear.
    "--profile-weather-unforced": r'^FAIL [^\[]*\[\{"weather":null,"live":[1-9]\d*,"mode":"rain"\}',
    "--studio-weather-unforced": r'"live":[1-9]\d*,"spawned":[1-9]',
    # A NaN step reaches the sim time: nothing is counted and the time stays NaN.
    "--no-dt-guard": r'"counted":0,"simTimeAfterBadSteps":null,',
    # Water surfaces ignored: splashes on the ground under the lake.
    "--rain-through-water": r'"offSurface":\[\{"x":[\d.]+,"y":[\d.]+,"z":0\}',
}


def _run(args=()):
    result = run_js(HARNESS, list(args), timeout=300)
    return result.stdout + result.stderr, result.stdout.splitlines()


def _jobs() -> int:
    # dev.py test sets HW1_GAME_JOBS=1: full-game harnesses run one at a time.
    try:
        return max(1, int(os.environ.get("HW1_GAME_JOBS", "1")))
    except ValueError:
        return 1


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class WeatherTests(unittest.TestCase):
    def test_weather_contracts(self) -> None:
        output, lines = _run()
        self.assertIn(SENTINEL, lines, output)
        self.assertFalse([line for line in lines if line.startswith("SKIP ")], output)
        self.assertEqual(PASS_COUNT, sum(line.startswith("PASS ") for line in lines), output)
        self.assertFalse([line for line in lines if line.startswith("FAIL ")], output)

    def test_mutations_fail_their_named_checks(self) -> None:
        self.assertEqual(set(MUTATIONS), set(CAUSES))
        with ThreadPoolExecutor(max_workers=_jobs()) as pool:
            results = dict(zip(MUTATIONS, pool.map(lambda flag: _run([flag]), MUTATIONS)))
        for flag, checks in MUTATIONS.items():
            output, lines = results[flag]
            with self.subTest(mutation=flag):
                self.assertNotIn(SENTINEL, lines, output)
                self.assertTrue(any(line.startswith("WEATHER_RESULT FAIL ") for line in lines), output)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP ", output)
                self.assertNotIn("ran without an exception", output)
                for check in checks:
                    self.assertTrue([line for line in lines if line.startswith("FAIL " + check + " ")], output)
                first = next(line for line in lines if line.startswith("FAIL " + checks[0] + " "))
                self.assertRegex(first, CAUSES[flag], output)


if __name__ == "__main__":
    unittest.main()
