"""Independent projected stripe math and shared classification, not native pixels."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class StructureTemporalTests(unittest.TestCase):
    script = Path(__file__).with_name("structure_temporal.js")

    def run_contract(self, *flags):
        result = run_js(self.script, list(flags), timeout=30)
        output = result.stdout + result.stderr
        self.assertEqual(0, result.returncode, output)
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertNotIn("Error:", output)
        self.assertNotIn("Exception:", output)
        self.assertNotIn("SETUP ", output)
        return output

    def test_independent_projective_coverage_and_motion_classification(self):
        output = self.run_contract()
        self.assertIn("STRUCTURE_TEMPORAL_RESULT PASS 41", output.splitlines())
        self.assertEqual(41, sum(line.startswith("PASS ") for line in output.splitlines()))
        self.assertNotIn("FAIL ", output)

    def test_plausible_oracle_and_measurement_faults_fail_the_intended_contract(self):
        mutations = {
            "--lose-denominator-slope": "perspective denominator slope integrates a three quarter pixel trapezoid",
            "--ignore-lower-band-edge": "both projected band edges bound the authored diagonal strip",
            "--double-coverage-area": "oblique affine stripe integrates a one eighth pixel triangle",
            "--truncate-negative-period": "negative texture periods keep the authored three quarter dark overlap",
            "--accept-backward-plane": "horizon crossings zero denominators and backward planes reject instead of becoming quality failures",
            "--unbounded-band-work": "oversized footprint fails explicitly rather than sampling or silently truncating bands",
            "--cancel-all-observed-motion": "unexplained intensity pulse remains a real quality failure with independent residual units",
            "--relax-global-threshold": "structure diagnostics cannot relax established temporal and spatial quality gates",
            "--ignore-local-shimmer": "localized line pulse cannot hide behind a passing whole image average",
            "--wrong-legacy-camera-height": "floor reference converts legacy camera height and quantized horizon into authored forward depth",
            "--wrong-denominator-sign": "visible floor coefficient denominator stays positive for either face winding",
            "--omit-horizontal-uv-gradient": "axis wall coefficients retain horizontal UV gradient and forward rather than Euclidean depth",
        }
        for flag, assertion in mutations.items():
            with self.subTest(mutation=flag):
                output = self.run_contract(flag)
                self.assertIn("PASS stationary uniform control reaches the shared analyzer without invented shimmer", output)
                self.assertIn("FAIL " + assertion, output)
                self.assertRegex(output, r"STRUCTURE_TEMPORAL_RESULT FAIL \d+/41")


if __name__ == "__main__":
    unittest.main()
