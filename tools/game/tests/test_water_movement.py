"""Water and movement: real player step and NPC locomotion in seeded windows."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

CHECK_COUNT = 9
PASS_RESULT = f"WATER_MOVEMENT_RESULT PASS {CHECK_COUNT}"
HARNESS = Path(__file__).with_name("water_movement.js")


class WaterMovementTests(unittest.TestCase):
    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_currents_wading_and_enemies(self) -> None:
        result = run_js(HARNESS, timeout=240)
        lines = result.stdout.splitlines()
        self.assertIn(PASS_RESULT, lines, result.stdout + result.stderr)
        self.assertEqual(CHECK_COUNT, sum(line.startswith("PASS ") for line in lines))

    def assert_rejected(self, flag: str, message: str) -> None:
        result = run_js(HARNESS, [flag], timeout=240)
        self.assertNotIn(PASS_RESULT, result.stdout.splitlines())
        self.assertIn(f"Error: {message}", result.stdout + result.stderr)

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_rivers_without_current(self) -> None:
        self.assert_rejected("--no-current", "an idle player standing in a river drifts downstream with the current")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_water_without_drag(self) -> None:
        self.assert_rejected("--no-wade", "deep water slows the same input to the wading factor")


if __name__ == "__main__":
    unittest.main()
