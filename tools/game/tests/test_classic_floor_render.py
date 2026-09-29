"""Classic levels in 3D: the layered floor pass must not crash on classic meshes."""
from pathlib import Path
import re
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

HARNESS = Path(__file__).with_name("classic_floor_render.js")
PASS_LINE = "CLASSIC_FLOOR_RESULT PASS 10"
PREREQUISITES = (
    "PASS the Start path builds a layered classic floor mesh for every level",
    "PASS the classic Expanse level has deep caves under a ceiling layer",
    "PASS classic levels have pools and streams painted by the water pass",
    "PASS a classic floor without layer colours is reported as a platforms3D crash",
)


class ClassicFloorRenderTests(unittest.TestCase):
    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_classic_levels_draw_their_3d_floor(self) -> None:
        result = run_js(HARNESS, timeout=300)
        lines = result.stdout.splitlines()
        self.assertIn(PASS_LINE, lines, result.stdout + result.stderr)
        self.assertEqual(10, sum(line.startswith("PASS ") for line in lines))
        self.assertFalse(any(line.startswith("SKIP ") for line in lines), result.stdout)

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_missing_layer_colours_are_detected(self) -> None:
        result = run_js(HARNESS, ["--skip-classic-layer-colors"], timeout=300)
        text = result.stdout + result.stderr
        lines = result.stdout.splitlines()
        for line in PREREQUISITES:
            self.assertIn(line, lines, text)
        for name in ("the Start button in 3D draws its first frame without a render crash",
                     "every classic level draws its layered 3D floor without a render crash",
                     "every walkable classic layer has a floor colour",
                     "3D water shows the water pass palette (pools and streams)"):
            self.assertTrue(any(line.startswith("FAIL " + name) for line in lines), name + "\n" + text)
        self.assertIn("CLASSIC_FLOOR_RESULT FAIL 4", lines, text)
        self.assertIn("RENDER CRASH in platforms3D", text)
        self.assertNotIn("MUTATION_ANCHOR", text)

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_colours_taken_before_water_are_detected(self) -> None:
        result = run_js(HARNESS, ["--colors-before-water"], timeout=300)
        text = result.stdout + result.stderr
        lines = result.stdout.splitlines()
        for line in PREREQUISITES:
            self.assertIn(line, lines, text)
        self.assertIn("PASS every classic level draws its layered 3D floor without a render crash", lines, text)
        self.assertIn("CLASSIC_FLOOR_RESULT FAIL 1", lines, text)
        failing = [line for line in lines if line.startswith("FAIL 3D water shows the water pass palette (pools and streams)")]
        self.assertEqual(1, len(failing), text)
        self.assertRegex(failing[0], re.compile(r'"water":[12],"l0Color":"#[0-9a-f]{6}"'))
        self.assertNotIn("MUTATION_ANCHOR", text)


if __name__ == "__main__":
    unittest.main()
