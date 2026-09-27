"""Perspective strip commands and independent ray-plane expectations, not pixels."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class TexturePlanarTests(unittest.TestCase):
    script = Path(__file__).with_name("texture_planar.js")

    def test_planar_strips_preserve_perspective_phase_and_bounded_draw_work(self):
        result = run_js(self.script, timeout=30)
        output = result.stdout + result.stderr
        self.assertEqual(0, result.returncode, output)
        self.assertIn("TEXTURE_PLANAR_RESULT PASS 51", output.splitlines())
        self.assertEqual(51, sum(line.startswith("PASS ") for line in output.splitlines()))
        self.assertNotIn("FAIL ", output)
        self.assertNotIn("Error:", output)
        self.assertNotIn("Exception:", output)

    def test_plausible_strip_mapping_faults_fail_their_intended_contracts(self):
        mutations = {
            "--omit-perspective-division": "floor strip centers retain exact perspective UV from independent camera rays",
            "--shift-strip-phase": "floor strip centers retain exact perspective UV from independent camera rays",
            "--skip-strip-rows": "row bands cover every visible pixel row once without gaps or two pixel strides",
            "--ignore-strip-budget": "insufficient strip budget declines the complete face before any painting",
            "--ignore-plane-consistency": "inconsistent reciprocal depth at a fourth vertex declines before painting",
            "--accept-general-depth-gradient": "general reciprocal depth gradients fall back instead of taking a false axis shortcut",
            "--ignore-convex-halfplanes": "concave and self crossing inputs cannot masquerade as a convex strip surface",
            "--stretch-filter-repeat-size": "floor strip centers retain exact perspective UV from independent camera rays",
            "--double-weight-strip-opacity": "blended strips preserve one logical draw opacity instead of leaking their base",
            "--disable-directional-filter": "directional rendering actually submits displaced taps instead of only reporting a helper result",
            "--use-screen-space-tap-axis": "directional offsets follow the source covariance not the screen rotation",
            "--omit-tap-variance": "directional footprint retains cross axis detail while matching major axis second moment",
            "--unstable-endpoint-tap-axis": "changing the winning endpoint cannot rotate or flip a stationary center sampling kernel",
            "--ignore-isotropic-axis-fade": "undefined isotropic center orientation fades tap displacement continuously to zero",
            "--tap-offset-in-mip-pixels": "each mip keeps symmetric tap offsets in original source texels rather than physical mip pixels",
            "--omit-offset-fill-bounds": "displaced sample fill rectangles cover every corner of their clipped pixel strip",
            "--ignore-virtual-planar-levels": "subtexel planar footprints actually draw both virtual levels with unchanged material phase",
            "--leave-virtual-offset-unscaled": "each mip keeps symmetric tap offsets in original source texels rather than physical mip pixels",
            "--ignore-visible-bounds": "inclusive depth visibility bounds budget only the five retained floor rows",
            "--exclude-last-visible-band": "inclusive depth visibility bounds budget only the five retained floor rows",
            "--occluder-changes-footprint": "occluder bounds cannot change UV phase footprint mip levels or tap commands on retained rows",
            "--accept-invalid-visible-bounds": "malformed empty inverted or out of viewport depth bounds decline before paint",
        }
        for flag, assertion in mutations.items():
            with self.subTest(mutation=flag):
                result = run_js(self.script, [flag], timeout=30)
                output = result.stdout + result.stderr
                self.assertEqual(0, result.returncode, output)
                self.assertIn("PASS authored floor and wall fixtures reach genuine varying forward depth", output)
                self.assertIn("PASS already affine constant depth faces remain with the ordinary mapper", output)
                self.assertIn("FAIL " + assertion, output)
                self.assertRegex(output, r"TEXTURE_PLANAR_RESULT FAIL \d+/51")
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("Error:", output)
                self.assertNotIn("Exception:", output)
                self.assertNotIn("SETUP ", output)


if __name__ == "__main__":
    unittest.main()
