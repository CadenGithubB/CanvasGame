"""Water rendering geometry: covered lakes and rivers, unfolded ribbons, no floating edges or caps, held drained ends, lit beds."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

CHECK_COUNT = 55
PASS_RESULT = f"WATER_RENDER_RESULT PASS {CHECK_COUNT}"
HARNESS = Path(__file__).with_name("water_render.js")
DRAINED_END = ("a river that drains into reserved ground ends where the land holds its water: "
               "no ground within 12 units past its drawn end lies below it")


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
    def test_regression_rejects_drained_ends_cut_off_at_a_straight_edge(self) -> None:
        # The historical defect: no rounded end and no cap past a drained river's last point.
        self.assert_rejected("--uncapped-drained-ends", "world 6 at 36,26: " + DRAINED_END)

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_drained_ends_left_above_the_land(self) -> None:
        self.assert_rejected("--no-drain-fall", "world 6 at 36,26: " + DRAINED_END)

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_drained_ends_the_land_cannot_hold(self) -> None:
        self.assert_rejected("--no-hold", "world 8 at -15,102: " + DRAINED_END)

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_drained_end_caps_that_stop_at_the_channel_edge(self) -> None:
        self.assert_rejected("--short-caps", "world 3 at 6,46: " + DRAINED_END)

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_spring_caps_reaching_over_the_bank(self) -> None:
        # Every cap reaching on into the bank: a spring head's cap corner by a watchtower step hung 0.46 over it.
        self.assert_rejected("--long-caps", "world 10 at 17,12: river ribbon edges never hang above dry open ground")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_tributary_caps_over_a_drained_river_tail(self) -> None:
        self.assert_rejected("--joined-caps", "world 1 at 31,-1: river ribbon edges never hang above dry open ground")


if __name__ == "__main__":
    unittest.main()
