"""Staff casting rig: held staff contact, attachment, reach-and-point and view."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

CHECK_COUNT = 28
PASS_RESULT = f"STAFF_RIG_RESULT PASS {CHECK_COUNT}"
HARNESS = Path(__file__).with_name("staff_rig.js")


class StaffRigTests(unittest.TestCase):
    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_geometry_motion_and_canvas_contracts(self) -> None:
        result = run_js(HARNESS, timeout=40)
        lines = result.stdout.splitlines()
        self.assertIn(PASS_RESULT, lines, result.stdout + result.stderr)
        self.assertEqual(CHECK_COUNT, sum(line.startswith("PASS ") for line in lines))

    def assert_rejected(self, flag: str, message: str) -> None:
        result = run_js(HARNESS, [flag], timeout=40)
        self.assertNotIn(PASS_RESULT, result.stdout.splitlines())
        self.assertIn(f"Error: {message}", result.stdout + result.stderr)

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_staff_following_the_sleeve(self) -> None:
        self.assert_rejected("--staff-follows-forearm",
                             "staff stays rigidly locked to the palm through the cast and inspection views")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_fingers_floating_off_the_shaft(self) -> None:
        self.assert_rejected("--loosen-staff-grip", "every finger phalanx rests on the shaft without entering it")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_inward_staff_winding(self) -> None:
        self.assert_rejected("--invert-staff-winding", "staff shaft and crystal facets wind outward for back-face culling")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_staff_blocking_the_view(self) -> None:
        self.assert_rejected("--center-staff",
                             "resting staff and hand stay in the right side of the view, clear of the crosshair")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_arm_entering_from_the_side(self) -> None:
        self.assert_rejected("--arm-from-side",
                             "sleeve rises from the bottom edge, never the side, in every phase")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_cast_without_pointing(self) -> None:
        self.assert_rejected("--no-staff-point", "cast tips the staff head forward into the scene")


if __name__ == "__main__":
    unittest.main()
