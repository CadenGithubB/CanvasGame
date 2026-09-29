"""Shipping depth/anchor regressions for the actual loot draw paths."""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


class LootVisibilityTests(unittest.TestCase):
    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_loot_depth_support_and_partial_chests(self) -> None:
        result = run_js(Path(__file__).with_name("loot_visibility.js"), timeout=40)
        self.assertIn("LOOT_VISIBILITY_RESULT PASS 56", result.stdout.splitlines(), result.stdout + result.stderr)
        self.assertEqual(56, sum(line.startswith("PASS ") for line in result.stdout.splitlines()))

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_visibility_mutation_is_detected(self) -> None:
        result = run_js(Path(__file__).with_name("loot_visibility.js"), ["--omit-loot-depth"], timeout=40)
        self.assertNotIn("LOOT_VISIBILITY_RESULT PASS 56", result.stdout.splitlines())
        self.assertIn("Error: coins including glow and label cannot paint through solid roof", result.stdout + result.stderr)


    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_inverted_chest_side_is_detected(self) -> None:
        # Restores the historical chest-minus-camera vector in the evaluated copy only.
        result = run_js(Path(__file__).with_name("loot_visibility.js"), ["--invert-chest-side"], timeout=40)
        output = result.stdout + result.stderr
        self.assertNotIn("LOOT_VISIBILITY_RESULT PASS 56", result.stdout.splitlines())
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertIn("PASS near-plane chest keeps clipped faces when back corners are behind camera", result.stdout.splitlines())
        self.assertIn("Error: chest viewed from its lock side paints the far back face before the near front face", output)


if __name__ == "__main__":
    unittest.main()
