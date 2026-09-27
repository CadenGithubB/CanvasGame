"""Profiler accounting contracts; controlled clock values are not benchmarks."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class PhysicsProfileTests(unittest.TestCase):
    script = Path(__file__).with_name("physics_profile.js")

    def test_bounded_opt_in_stage_profiling(self) -> None:
        result = run_js(self.script, timeout=30)
        output = result.stdout + result.stderr
        self.assertIn("PHYSICS_PROFILE_RESULT PASS 19", result.stdout.splitlines(), output)
        self.assertEqual(19, sum(line.startswith("PASS ") for line in result.stdout.splitlines()), output)
        self.assertNotIn("FAIL ", output)

    def test_profiler_regressions_are_detected(self) -> None:
        cases = {
            "--time-when-disabled": "disabled_profiling_reads_no_clock",
            "--record-when-disabled": "disabled_profiling_allocates_no_stage_buffers",
            "--broken-ring-wrap": "wrapped_ring_keeps_latest_outlier_samples",
            "--misattribute-player-stage": "game_update_profiles_actual_named_stages",
        }
        for flag, assertion in cases.items():
            with self.subTest(mutation=flag):
                result = run_js(self.script, [flag], timeout=30)
                output = result.stdout + result.stderr
                self.assertIn("FAIL " + assertion, output, output)
                self.assertIn("PHYSICS_PROFILE_RESULT FAIL ", output)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("PHYSICS_PROFILE_RESULT PASS", output)
                self.assertIn("PASS fixture_reaches_final_independent_control", output)


if __name__ == "__main__":
    unittest.main()
