"""Generated layered and legacy terrain must both remain drawable in 2D."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class Platforms2DTests(unittest.TestCase):
    script = Path(__file__).with_name("platforms_2d.js")

    def test_real_generated_and_authored_top_down_terrain(self):
        result = run_js(self.script, timeout=60)
        output = result.stdout + result.stderr
        self.assertIn("PLATFORMS_2D_RESULT PASS 15", output)
        self.assertNotIn("Error:", output)

    def test_missing_geometry_and_layer_selection_defects_are_detected(self):
        mutations = {
            "--legacy-heights": "generated layered platform draw completes without missing-height crash",
            "--skip-layered": "generated cap contributes its actual authored floor color",
            "--ceiling-as-floor": "top-down terrain selects cap beneath ceiling instead of cave floor or ceiling",
            "--unbounded-alpha": "generated heights always produce finite valid nonzero alpha",
            "--floor-after-actors": "real top-down frame paints terrain before player rather than covering actors",
        }
        for flag, assertion in mutations.items():
            with self.subTest(mutation=flag):
                result = run_js(self.script, [flag], timeout=60)
                output = result.stdout + result.stderr
                self.assertIn("PASS generated cave fixture contains layered cap but no legacy height array", output)
                self.assertIn("FAIL " + assertion, output)
                self.assertIn("PLATFORMS_2D_RESULT FAIL 15", output)
                self.assertIn("PASS legacy pool and stream overlays retain their distinct colors", output)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("PLATFORMS_2D_RESULT PASS", output)


if __name__ == "__main__":
    unittest.main()
