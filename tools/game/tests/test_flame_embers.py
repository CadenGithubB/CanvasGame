"""Flame stream embers on the unified particle engine (slice S8): the flameStream anchor (the floor under each ember, motion, width, walls, caves), the A/B guard of the legacy ember loops, the gameplay streams."""

from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

HARNESS = Path(__file__).with_name("flame_embers.js")
# Load, F1 3 (fixture, beam, release), F1b 2 (fixture, per-point arc), F1c 2
# (fixture, inherited motion), F1d 2 (fixture, tier-2 width), F1e 2 (fixture,
# wall), F2 4 (fixture, New 3D, New 2D, Legacy), F3 2 (fixture, streams), F4
# 3 (fixture, per-point arc, UNDER), F5 2 (fixture, occlusion cost), runtime
# failures and stage/console errors.
PASS_COUNT = 25
SENTINEL = f"FLAME_EMBERS_RESULT PASS {PASS_COUNT}"

F1 = "flame embers spawn along the beam from the casting hand, on its arc, fanning with it"
F1B = "on raised, stepped and layered ground ending in a wall, embers follow the beam arc over the floor under each one"
F4 = "in the Cave Test chamber flame embers follow the beam's arc over the floor under each one"
# Each mutation must fail its named check; setup failures and crashes do not count.
MUTATIONS = {
    "--flame-from-feet": F1,
    "--flame-linear-height": F1,
    "--flame-narrow": F1,
    "--flame-after-release": "flame embers stop with the beam: none born once it is no longer drawn",
    "--ember-3d-unguarded": "New mode draws flame embers as particles only, with no shadowBlur in 3D",
    "--ember-2d-unguarded": "New mode draws flame embers as particles only in 2D",
    "--ember-math-random": "flame embers never draw from the gameplay random stream or change gameplay",
    # S8 review fixes: the floor under each ember, the hand height, the
    # layer of a stack, the player's motion, the stream width, the wall, UNDER.
    "--flame-end-floor": F1B,
    "--flame-floor-at-feet": F1B,
    "--flame-absolute-height": F1B,
    "--flame-top-layer": F1B,
    "--flame-no-inherit": "flame embers carry the player's motion: each one's velocity is the player's plus the recipe's along-beam cone",
    "--flame-fixed-width": "flame embers fan to the tier-2 beam's half width",
    "--ember-no-wall": "no flame ember lives inside the wall the beam ends in",
    "--flame-no-under": "flame embers born underground carry the UNDER flag",
    "--ember-auto-occlusion": "the flame ember pass reads five corona samples per ember at any canvas size: no tiles, footprints or mask pixels",
}
# Checks a mutation must fail as well as its named one.
ALSO_FAILS = {
    "--flame-end-floor": [F4],
    "--flame-linear-height": [F1B],
}
# The failure detail must also show the intended cause (the first miss's
# "why": u, lateral, belowArc, aboveArc or noFloor).
CAUSES = {
    # Born at the feet: 14 u behind the hand along the aim.
    "--flame-from-feet": r'"off":\[\{"why":"u","u":-',
    # Linear in height: below the beam's arc band.
    "--flame-linear-height": r'"off":\[\{"why":"belowArc",',
    # On the axis only: the far embers use a few % of the beam's half width.
    "--flame-narrow": r'"off":\[\],"bands":\[\d+,\d+,\d+\],"sides":\{"left":\d+,"right":\d+\},"farWidthShare":0\.0',
    "--flame-after-release": r'"lateBirths":[1-9]\d*,',
    # Both sources in New 3D: legacy billboards with shadowBlur beside the particles.
    "--ember-3d-unguarded": r'"stage3D":\{"legacy":[1-9]\d*,"blur":[1-9]',
    "--ember-2d-unguarded": r'"stage2D":\{"legacy":[1-9]\d*,',
    "--ember-math-random": r'"thrown":[1-9]\d*,',
    # The wall top 75 u above the feet at the segment's end lifts every ember.
    "--flame-end-floor": r'"off":\[\{"why":"aboveArc",',
    # The 20 u step ignored: embers below the arc over it.
    "--flame-floor-at-feet": r'"off":\[\{"why":"belowArc",',
    # The hand 50 u too low on raised ground: embers born near 55 u.
    "--flame-absolute-height": r'"off":\[\{"why":"belowArc","u":[\d.]+,"lat":-?[\d.]+,"half":[\d.]+,"z":5\d\.',
    # The stack's 140 u roof taken for the 70 u floor.
    "--flame-top-layer": r'"off":\[\{"why":"aboveArc",',
    # Strafing at ~145 u/s: the embers' lateral velocity stays near 0.
    "--flame-no-inherit": r'"emberLateralMean":-?\d\.\d+,"playerLateralMean":1\d\d',
    # A tier-2 beam filled only to its 0.4 rad width.
    "--flame-fixed-width": r'"farWidthShare":0\.[0-7]\d*,',
    "--ember-no-wall": r'"count":[1-9]\d*\}',
    "--flame-no-under": r'"flagged":0\}',
    # Footprint scans at 360 x 240 and tile summaries at 1920 x 1080.
    "--ember-auto-occlusion": r'"size":"1920x1080","live":\d+,"considered":\d+,"drawn":\d+,"occ":\{"point":\d+,"footprint":\d+,"tiles":[1-9]',
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
class FlameEmbersTests(unittest.TestCase):
    def test_flame_embers(self) -> None:
        output, lines = _run()
        self.assertIn(SENTINEL, lines, output)
        self.assertFalse([line for line in lines if line.startswith("SKIP ")], output)
        self.assertEqual(PASS_COUNT, sum(line.startswith("PASS ") for line in lines), output)
        self.assertFalse([line for line in lines if line.startswith("FAIL ")], output)

    def test_mutations_fail_their_named_checks(self) -> None:
        with ThreadPoolExecutor(max_workers=_jobs()) as pool:
            results = dict(zip(MUTATIONS, pool.map(lambda flag: _run([flag]), MUTATIONS)))
        for flag, check in MUTATIONS.items():
            output, lines = results[flag]
            with self.subTest(mutation=flag):
                self.assertNotIn(SENTINEL, lines, output)
                failing = [line for line in lines if line.startswith("FAIL " + check + " ")]
                self.assertTrue(failing, output)
                self.assertTrue(any(line.startswith("FLAME_EMBERS_RESULT FAIL ") for line in lines), output)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP ", output)
                self.assertNotIn("ran without an exception", output)
                if flag in CAUSES:
                    self.assertRegex(failing[0], CAUSES[flag], output)
                for also in ALSO_FAILS.get(flag, []):
                    self.assertTrue([line for line in lines if line.startswith("FAIL " + also + " ")], output)


if __name__ == "__main__":
    unittest.main()
