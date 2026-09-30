"""Water system: solver contracts on authored terrain and the real Endless window."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

CHECK_COUNT = 20
PASS_RESULT = f"WATER_SYSTEM_RESULT PASS {CHECK_COUNT}"
HARNESS = Path(__file__).with_name("water_system.js")


class WaterSystemTests(unittest.TestCase):
    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_solver_and_window_contracts(self) -> None:
        result = run_js(HARNESS, timeout=180)
        lines = result.stdout.splitlines()
        self.assertIn(PASS_RESULT, lines, result.stdout + result.stderr)
        self.assertEqual(CHECK_COUNT, sum(line.startswith("PASS ") for line in lines))

    def assert_rejected(self, flag: str, message: str) -> None:
        result = run_js(HARNESS, [flag], timeout=180)
        self.assertNotIn(PASS_RESULT, result.stdout.splitlines())
        self.assertIn(f"Error: {message}", result.stdout + result.stderr)

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_uphill_rivers(self) -> None:
        self.assert_rejected("--uphill-descent", "a river on a slope only ever flows downhill")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_spilling_back_into_own_basin(self) -> None:
        self.assert_rejected("--spill-into-own",
                             "rough terrain: every source ends on a known outcome, uncapped, with water only on open ground")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_spilling_below_the_true_rim(self) -> None:
        self.assert_rejected("--early-spill", "a filled basin has one flat surface at its spill height")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_rivers_without_channels(self) -> None:
        self.assert_rejected("--no-carve",
                             "rivers run in carved channels: the bed dips below the water and dry banks stand above it")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_banks_below_the_water(self) -> None:
        self.assert_rejected("--perched-bank",
                             "rivers run in carved channels: the bed dips below the water and dry banks stand above it")


if __name__ == "__main__":
    unittest.main()
