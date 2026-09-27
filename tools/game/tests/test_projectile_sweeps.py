"""Swept projectile geometry, damage ordering, and causal defect controls."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class ProjectileSweepTests(unittest.TestCase):
    script = Path(__file__).with_name("projectile_sweeps.js")

    def test_world_and_body_sweeps_in_both_views(self):
        result = run_js(self.script, timeout=60)
        output = result.stdout + result.stderr
        self.assertIn("PROJECTILE_SWEEPS_RESULT PASS 44", output)
        self.assertNotIn("FAIL ", output)

    def test_plausible_projectile_defects_trigger_targeted_assertions(self):
        mutations = {
            "--endpoint-only": "2D fast shot stops at near wall face before protected enemy",
            "--ignore-world": "2D fast shot stops at near wall face before protected enemy",
            "--ignore-radius": "2D projectile radius catches wall edge missed by center ray",
            "--ignore-height": "2D surface shot cannot damage cave body at same XY",
            "--freeze-target": "2D moving target crossing shot is hit between endpoint positions",
            "--full-target-history": "2D late release cannot hit earlier target motion before shot existed",
            "--last-body-wins": "2D nearest body wins independent of array order false",
        }
        for flag, assertion in mutations.items():
            with self.subTest(mutation=flag):
                result = run_js(self.script, [flag], timeout=60)
                output = result.stdout + result.stderr
                self.assertIn("FAIL " + assertion, output)
                self.assertIn("PROJECTILE_SWEEPS_RESULT FAIL 44", output)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("Error:", output)


if __name__ == "__main__":
    unittest.main()
