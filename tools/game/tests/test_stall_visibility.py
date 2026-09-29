"""Market stalls and the guard tower stay visible on real terrain and hide behind opaque depth.

Restated in stage J1: the same checks run on the legacy painters (no flag;
landmarkModels off, explicitly) and on the landmark models (--models), whose
contract is depth-tested model faces standing on getEntityRenderFloorZ.
--literal-zero-tower restores only the tower's historical world-Z 0 call:
the audit lab's _SHOP_ZERO reintroduction probe, which both paths detect.
"""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("stall_visibility.js")


def run(*flags):
    result = run_js(SCRIPT, list(flags), timeout=60)
    return result.stdout + result.stderr, result.stdout.splitlines()


class StallVisibilityTests(unittest.TestCase):
    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_market_visible_at_every_terrain_height_and_occluded_per_pixel(self) -> None:
        for flags in ((), ("--models",)):
            with self.subTest(path="models" if flags else "legacy"):
                output, lines = run(*flags)
                self.assertIn("STALL_VISIBILITY_RESULT PASS 10", lines, output)
                self.assertEqual(10, sum(line.startswith("PASS ") for line in lines))

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_literal_zero_market_visibility_is_detected(self) -> None:
        # Restores both historical literal world-Z 0 calls in the evaluated copy only.
        for flags in ((), ("--models",)):
            with self.subTest(path="models" if flags else "legacy"):
                output, lines = run(*flags, "--literal-zero-market")
                self.assertNotIn("STALL_VISIBILITY_RESULT PASS 10", lines)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertIn("PASS a market stall on ordinary terrain is drawn for a shopper facing it", lines)
                self.assertIn("Error: a market stall on low terrain is drawn for a shopper facing it", output)

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_literal_zero_tower_probe_is_detected(self) -> None:
        # The _SHOP_ZERO reintroduction: only the tower's call reverts; the stalls still pass.
        for flags in ((), ("--models",)):
            with self.subTest(path="models" if flags else "legacy"):
                output, lines = run(*flags, "--literal-zero-tower")
                self.assertNotIn("STALL_VISIBILITY_RESULT PASS 10", lines)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertIn("PASS a market stall on high terrain is drawn for a shopper facing it", lines)
                self.assertIn("Error: the guard tower is drawn on low, ordinary and high terrain", output)


if __name__ == "__main__":
    unittest.main()
