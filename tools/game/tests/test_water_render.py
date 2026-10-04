"""Water rendering geometry: covered lakes and rivers, unfolded ribbons, no floating edges, lit beds."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

CHECK_COUNT = 20
PASS_RESULT = f"WATER_RENDER_RESULT PASS {CHECK_COUNT}"
HARNESS = Path(__file__).with_name("water_render.js")


class WaterRenderTests(unittest.TestCase):
    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_shoreline_coverage_edges_and_beds(self) -> None:
        result = run_js(HARNESS, timeout=240)
        lines = result.stdout.splitlines()
        self.assertIn(PASS_RESULT, lines, result.stdout + result.stderr)
        self.assertEqual(CHECK_COUNT, sum(line.startswith("PASS ") for line in lines))

    def assert_rejected(self, flag: str, message: str) -> None:
        result = run_js(HARNESS, [flag], timeout=240)
        self.assertNotIn(PASS_RESULT, result.stdout.splitlines())
        self.assertIn(f"Error: {message}", result.stdout + result.stderr)

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_uncovered_shoreline_squares(self) -> None:
        self.assert_rejected("--nw-corner-coverage", "world 11: every floor square touching lake water carries a lake surface")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_water_floating_over_drops(self) -> None:
        self.assert_rejected("--floating-edges", "world 11: lake water never hangs above lower dry ground at the shoreline")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_black_beds_under_water(self) -> None:
        self.assert_rejected("--dark-beds", "world 11: ground under water is a lit lakebed, never near-black")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_ribbons_narrower_than_their_channel(self) -> None:
        self.assert_rejected("--narrow-ribbon", "world 11: every point of river water lies under a water surface")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_unrelaxed_river_courses(self) -> None:
        self.assert_rejected("--no-relax", "world 11: every point of river water lies under a water surface")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_ribbons_folding_at_tight_bends(self) -> None:
        self.assert_rejected("--no-fan", "world 33: river ribbons do not fold over themselves at bends")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_ribbon_edges_over_perched_banks(self) -> None:
        self.assert_rejected("--perched-bank", "world 11: river ribbon edges never hang above dry open ground")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_water_left_past_a_drained_river_end(self) -> None:
        self.assert_rejected("--water-past-drains", "world 6 at 36,26: every point of river water lies under a water surface")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_an_end_cap_past_a_drained_river_end(self) -> None:
        self.assert_rejected("--cap-past-drains",
                             "world 6 at 36,26: rivers that drain into reserved ground draw and leave no water past their end")


if __name__ == "__main__":
    unittest.main()
