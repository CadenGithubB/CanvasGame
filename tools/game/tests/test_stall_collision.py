"""Market stall collision matches the drawn stall, and ordinary stalls face the centre."""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


class StallCollisionTests(unittest.TestCase):
    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_collision_matches_drawn_stall_and_generator_faces_centre(self) -> None:
        result = run_js(Path(__file__).with_name("stall_collision.js"), timeout=60)
        lines = result.stdout.splitlines()
        self.assertIn("STALL_COLLISION_RESULT PASS 11", lines, result.stdout + result.stderr)
        self.assertEqual(11, sum(line.startswith("PASS ") for line in lines))

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_swapped_stall_extents_are_detected(self) -> None:
        # Restores the historical swapped half-extents in the evaluated copy only.
        result = run_js(Path(__file__).with_name("stall_collision.js"), ["--swap-stall-extents"], timeout=60)
        output = result.stdout + result.stderr
        self.assertNotIn("STALL_COLLISION_RESULT PASS 11", result.stdout.splitlines())
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertIn("PASS stall renderer paints a table whose leg feet lie under its top at every tested facing", result.stdout.splitlines())
        self.assertIn("Error: a player just inside any edge of the drawn table is pushed out at every facing", output)


if __name__ == "__main__":
    unittest.main()
