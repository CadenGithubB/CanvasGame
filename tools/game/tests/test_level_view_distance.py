"""A classic level keeps its map-size view distance when settings are applied.

Risk: resetLevel gives a classic level the Render Distance setting but at
least 0.8 of the map's shorter side (Level 4, the Expanse: 2304 u; Level 1:
768 u). The settings panel's Apply ran applySettings, which assigned the raw
setting, so choosing Ultra (1800) mid-level cut the Expanse's draw distance,
and every radius scaled from viewDist, from 2304 to 1800 until the next level,
and 400 cut it to 400. Nothing was logged. resetLevel and applySettings now
share classicLevelViewDist(); Endless keeps the setting itself.

Oracles (level_view_distance.js, real MAIN manifest through render_host.js,
every Apply through the O key, canvas clicks on the drawn panel and the rAF it
schedules): 0.8 x the authored level's shorter side (2304, 768), a setting
above it taken (Ultra on Level 1), the same level restarted at the same
committed settings, and the floor quads a real Level 4 frame submits at a
fixed pose, before and after each Apply, with ground beyond 1800 u in view.
Endless at Medium over a 5-chunk window (0.8 x 2400 = 1920 u) takes Low, 400
and Ultra as set.

Mutation controls (evaluated copies only): --raw-setting restores the raw
assignment, --classic-everywhere applies the classic rule in Endless too.
Each must fail exactly its named checks while every setup check still passes.
"""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("level_view_distance.js")
EXPECTED = 10
SETUP = (
    "PASS setup: real manifest loads with no console errors",
    "PASS setup: Level 4 (4320x2880 Expanse) starts at Low with 2304 u (0.8 x 2880) and Level 1 (1440x960) at 400 "
    "with 768 u (0.8 x 960)",
    "PASS setup: every Apply went through the panel (O key, preset or slider click, Apply click) and committed its "
    "setting",
    "PASS setup: the Level 4 pose sees ground beyond 2200 u (no farther than 2304 u), outside walls, with the same "
    "quads on two frames",
    "PASS setup: Endless starts at Medium (900 u) over a 5-chunk window whose 0.8 x shorter side (1920 u) exceeds "
    "Low and 400",
)
LEVEL4 = "Level 4 keeps its 2304 u view distance when Ultra (1800) or 400 is applied mid-level"
LEVEL1 = ("Level 1 takes an applied setting above its 768 u floor (Ultra: 1800) and keeps the floor when 400 is "
          "applied")
RESTART = "applying settings mid-level gives each classic level the view distance a restart at the same settings gives"
FRAME = ("after Ultra or 400 is applied, Level 4 draws the same floor quads at the pose as before, ground beyond "
         "1800 u included")
ENDLESS = ("Endless views at the applied setting itself, at the Apply and after the window rebuild (Low 500, 400, "
           "Ultra 1800)")
# flag -> the checks that must FAIL (and no others)
MUTATIONS = {
    "--raw-setting": (LEVEL4, LEVEL1, RESTART, FRAME),
    "--classic-everywhere": (ENDLESS,),
}


def run(*flags):
    result = run_js(SCRIPT, list(flags), timeout=300)
    output = result.stdout + result.stderr
    return output, result.stdout.splitlines()


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class LevelViewDistanceTests(unittest.TestCase):
    def test_apply_keeps_the_classic_level_view_distance(self) -> None:
        output, lines = run()
        self.assertIn(f"LEVEL_VIEW_DISTANCE_RESULT PASS {EXPECTED}", lines, output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in lines), output)
        for line in SETUP:
            self.assertIn(line, lines, output)
        for name in (LEVEL4, LEVEL1, RESTART, FRAME, ENDLESS):
            self.assertIn("PASS " + name, lines, output)
        self.assertTrue(any(line.startswith("NOTE ") for line in lines), output)
        self.assertNotIn("SETUP", output)

    def test_each_mutation_fails_its_named_checks(self) -> None:
        for flag, names in MUTATIONS.items():
            with self.subTest(mutation=flag):
                output, lines = run(flag)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP", output)
                for line in SETUP:
                    self.assertIn(line, lines, f"{flag}: setup must still hold\n{output}")
                failing = sorted(line[5:] for line in lines if line.startswith("FAIL "))
                self.assertEqual(len(names), len(failing), f"{flag}:\n{output}")
                for name in names:
                    self.assertTrue(any(line.startswith(name) for line in failing), f"{flag} did not fail '{name}'\n{output}")
                self.assertIn(f"LEVEL_VIEW_DISTANCE_RESULT FAIL {len(names)}", lines, output)


if __name__ == "__main__":
    unittest.main()
