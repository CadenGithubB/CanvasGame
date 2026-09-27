"""Real input events must be latched once and consumed only on game ticks."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class InputTimingTests(unittest.TestCase):
    script = Path(__file__).with_name("input_timing.js")

    def test_real_events_sensors_camera_and_pause_controls(self):
        result = run_js(self.script, timeout=60)
        output = result.stdout + result.stderr
        self.assertIn("INPUT_TIMING_RESULT PASS", output)
        self.assertNotIn("FAIL ", output)
        self.assertNotIn("Error:", output)

    def test_input_timing_regressions_fail_the_intended_contract(self):
        mutations = {
            "--immediate-click": "quick click queues input without charging mana or reserving a cast between ticks",
            "--release-discards-tap": "rapid jump and dash releases retain both edges before a simulation tick",
            "--render-steers-camera": "actual 2D and 3D draws leave authoritative camera unchanged",
            "--unscaled-tilt": "fixed tick applies latest IMU tilt with legacy sixty-millisecond impulse scale",
            "--stale-imu-force": "hung sensor request expires prior tilt instead of applying force forever",
        }
        for flag, assertion in mutations.items():
            with self.subTest(mutation=flag):
                result = run_js(self.script, [flag], timeout=60)
                output = result.stdout + result.stderr
                self.assertIn("PASS real event fixture registers keyboard mouse and pointer-lock handlers", output)
                self.assertIn("FAIL " + assertion, output)
                self.assertIn("PASS released and repressed Start resumes while simulation was paused", output)
                self.assertIn("INPUT_TIMING_RESULT FAIL", output)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("Error:", output)


if __name__ == "__main__":
    unittest.main()
