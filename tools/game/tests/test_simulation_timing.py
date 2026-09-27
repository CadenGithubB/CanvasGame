"""Real-loop cadence, suspension, cooldown, and causal regression replays."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class SimulationTimingTests(unittest.TestCase):
    script = Path(__file__).with_name("simulation_timing.js")

    def test_real_gameplay_is_independent_of_display_cadence(self):
        result = run_js(self.script, timeout=60)
        output = result.stdout + result.stderr
        self.assertIn("SIMULATION_TIMING_RESULT PASS 81", output)
        self.assertNotIn("FAIL ", output)
        self.assertNotIn("Error:", output)

    def test_realistic_timing_regressions_fail_their_intended_contracts(self):
        mutations = {
            "--render-rate-input": (
                "2D 120Hz applies input exactly once for each of 240 simulation ticks",
                "2D 120Hz fixture moves turns and releases real held attacks",
            ),
            "--wall-clock-cast": (
                "resume advances one tick without expiring projectile or bypassing attack cooldown",
                "active-shot pause fixture has a live released missile and cooldown",
            ),
            "--wall-clock-enemy": (
                "resume cannot land enemy windup or expire burning with paused wall time",
                "melee and burn fixture reaches genuine unfinished enemy deadlines",
            ),
            "--unbounded-catchup": (
                "one-second stall has bounded catchup and explicit dropped-time accounting",
                "stall recovery actual loop has no swallowed errors",
            ),
            "--resume-wall-gap": (
                "first visible frame reanchors without a hidden-time burst",
                "hidden return actual loop has no swallowed errors",
            ),
            "--settings-keeps-frame-anchor": (
                "settings closed before next RAF still reanchors without simulation",
                "settings opening refunds pending missile immediately before any RAF",
            ),
            "--overview-keeps-frame-anchor": (
                "overview closed before next RAF still reanchors without simulation",
                "overview opening refunds pending missile immediately before any RAF",
            ),
        }
        for flag, (assertion, prerequisite) in mutations.items():
            with self.subTest(mutation=flag):
                result = run_js(self.script, [flag], timeout=60)
                output = result.stdout + result.stderr
                self.assertIn("FAIL " + assertion, output)
                self.assertIn("PASS " + prerequisite, output)
                self.assertRegex(output, r"SIMULATION_TIMING_RESULT FAIL \d+/81")
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("Error:", output)
                self.assertNotIn("SETUP ", output)


if __name__ == "__main__":
    unittest.main()
