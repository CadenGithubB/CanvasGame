"""Analytic visual poses and actual game replays must not alter simulation."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class RenderInterpolationTests(unittest.TestCase):
    script = Path(__file__).with_name("render_interpolation.js")

    def test_visual_intermediates_do_not_change_authoritative_gameplay(self):
        result = run_js(self.script, timeout=90)
        output = result.stdout + result.stderr
        self.assertIn("RENDER_INTERPOLATION_RESULT PASS", output)
        self.assertNotIn("FAIL ", output)
        self.assertNotIn("Error:", output)

    def test_realistic_interpolation_regressions_fail_their_intended_contracts(self):
        mutations = {
            "--no-blend": "quarter tick blends player and both camera translations analytically",
            "--long-angle": "camera enemy and missile angles cross the pi seam by the shortest arc",
            "--restore-reference-leak": "throwing render restores every authoritative global and body reference",
            "--draw-mutates-original": "draw transaction exposes intermediate values without writing original bodies",
            "--teleport-streak": "large actor relocation snaps while ordinarily moving player still interpolates",
            "--origin-streak": "origin-only world rebuild cannot reuse old local-coordinate movement history",
            "--despawn-ghost": "despawn removes the departed enemy instead of drawing a cached ghost",
            "--allocate-every-frame": "unchanged live actors reuse pose records proxies and scratch arrays over 240 frames",
            "--bypass-interpolated-loop": "120 Hz no-tick frame submits an actual halfway player pose to Canvas",
            "--reset-keeps-history": "frame reset discards previous poses before rendering resumed or restarted world",
        }
        for flag, assertion in mutations.items():
            with self.subTest(mutation=flag):
                result = run_js(self.script, [flag], timeout=90)
                output = result.stdout + result.stderr
                self.assertIn("PASS authored fixture has distinct finite player camera enemy and missile endpoints", output)
                self.assertIn("FAIL " + assertion, output)
                self.assertRegex(output, r"RENDER_INTERPOLATION_RESULT FAIL \d+/66")
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("Error:", output)
                self.assertNotIn("SETUP ", output)


if __name__ == "__main__":
    unittest.main()
