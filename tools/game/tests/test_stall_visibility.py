"""Market stalls and the guard tower stay visible on real terrain and hide behind opaque depth."""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


class StallVisibilityTests(unittest.TestCase):
    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_market_visible_at_every_terrain_height_and_occluded_per_pixel(self) -> None:
        result = run_js(Path(__file__).with_name("stall_visibility.js"), timeout=60)
        lines = result.stdout.splitlines()
        self.assertIn("STALL_VISIBILITY_RESULT PASS 10", lines, result.stdout + result.stderr)
        self.assertEqual(10, sum(line.startswith("PASS ") for line in lines))

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_literal_zero_market_visibility_is_detected(self) -> None:
        # Restores both historical literal world-Z 0 calls in the evaluated copy only.
        result = run_js(Path(__file__).with_name("stall_visibility.js"), ["--literal-zero-market"], timeout=60)
        output = result.stdout + result.stderr
        lines = result.stdout.splitlines()
        self.assertNotIn("STALL_VISIBILITY_RESULT PASS 10", lines)
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertIn("PASS a market stall on ordinary terrain is drawn for a shopper facing it", lines)
        self.assertIn("Error: a market stall on low terrain is drawn for a shopper facing it", output)


if __name__ == "__main__":
    unittest.main()
