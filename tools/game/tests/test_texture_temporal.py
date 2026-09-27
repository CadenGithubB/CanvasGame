"""Temporal quality mathematics and classification, not browser rasterization."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class TextureTemporalTests(unittest.TestCase):
    script = Path(__file__).with_name("texture_temporal.js")

    def test_analytic_motion_oracle_and_nonvacuous_quality_classification(self):
        result = run_js(self.script, timeout=30)
        output = result.stdout + result.stderr
        self.assertEqual(0, result.returncode, output)
        self.assertIn("TEXTURE_TEMPORAL_RESULT PASS 39", output.splitlines())
        self.assertEqual(39, sum(line.startswith("PASS ") for line in output.splitlines()))
        self.assertNotIn("FAIL ", output)
        self.assertNotIn("Error:", output)
        self.assertNotIn("Exception:", output)

    def test_plausible_temporal_measurement_faults_fail_intended_contracts(self):
        mutations = {
            "--count-expected-motion": "expected camera motion is subtracted before measuring shimmer",
            "--wrong-normalization": "temporal residual reports independently calculated channel units",
            "--hide-invalid-workload": "missing rendered subjects cannot be classified as a known quality defect",
            "--reverse-oracle-phase": "analytic reference integrates fractional camera phase with correct sign",
            "--ignore-temporal-threshold": "temporal quality threshold admits equality and rejects a genuine excess",
            "--misclassify-setup-error": "missing malformed and nonfinite captures are setup failures not quality defects",
            "--lose-projected-line-slope": "perspective line oracle integrates the authored three quarter pixel wedge",
            "--double-pixel-coverage": "perspective line oracle integrates the authored three quarter pixel wedge",
            "--ignore-local-threshold": "localized long line pulse fails even when whole image RMS passes",
            "--disjoint-local-windows": "localized long line pulse fails even when whole image RMS passes",
            "--local-count-expected-motion": "local windows subtract expected motion before claiming flicker",
            "--ignore-worst-frame": "rare full frame flicker cannot hide inside an otherwise calm replay",
            "--clamp-quantization-error": "one byte Canvas quantization remains in long line error metrics rather than being clamped",
        }
        for flag, assertion in mutations.items():
            with self.subTest(mutation=flag):
                result = run_js(self.script, [flag], timeout=30)
                output = result.stdout + result.stderr
                self.assertEqual(0, result.returncode, output)
                self.assertIn("PASS stationary uniform control has no temporal shimmer", output)
                self.assertIn("FAIL " + assertion, output)
                self.assertRegex(output, r"TEXTURE_TEMPORAL_RESULT FAIL \d+/39")
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("Error:", output)
                self.assertNotIn("Exception:", output)
                self.assertNotIn("SETUP ", output)


if __name__ == "__main__":
    unittest.main()
