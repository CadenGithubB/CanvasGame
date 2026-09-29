"""Guaranteed-market stalls reach the stall renderer and collision with usable facings."""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


class MarketStallTests(unittest.TestCase):
    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_guaranteed_market_stalls_render_and_face_centre(self) -> None:
        result = run_js(Path(__file__).with_name("market_stalls.js"), timeout=60)
        lines = result.stdout.splitlines()
        self.assertIn("MARKET_STALLS_RESULT PASS 14", lines, result.stdout + result.stderr)
        self.assertEqual(14, sum(line.startswith("PASS ") for line in lines))

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_legacy_injected_market_is_detected(self) -> None:
        # Restores the historical compass-string injection in the evaluated copy only.
        result = run_js(Path(__file__).with_name("market_stalls.js"), ["--legacy-injected-market"], timeout=60)
        output = result.stdout + result.stderr
        self.assertNotIn("MARKET_STALLS_RESULT PASS 14", result.stdout.splitlines())
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertIn("PASS markets-disabled world receives exactly one guaranteed four-stall market", result.stdout.splitlines())
        self.assertIn("Error: guaranteed market chunk records store finite world-angle facings", output)


if __name__ == "__main__":
    unittest.main()
