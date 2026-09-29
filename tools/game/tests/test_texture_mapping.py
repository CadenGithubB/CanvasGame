"""Shipped texture mapper (src/12-texture-mapping.js) contracts; no stub-Canvas performance claims."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class TextureMappingTests(unittest.TestCase):
    script = Path(__file__).with_name("texture_mapping.js")

    def test_perspective_clipping_budgets_and_material_preparation(self):
        result = run_js(self.script, timeout=30)
        output = result.stdout + result.stderr
        self.assertIn("TEXTURE_MAPPING_RESULT PASS 35", output.splitlines())
        self.assertEqual(35, sum(line.startswith("PASS ") for line in output.splitlines()))
        self.assertNotIn("FAIL ", output)
        self.assertNotIn("Error:", output)
        self.assertNotIn("Exception:", output)

    def test_targeted_mapping_faults_fail_the_intended_contracts(self):
        mutations = {
            "--affine-uv": "receding surface samples perspective UV rather than sliding affine UV",
            "--drop-near-uv": "near clipping interpolates material coordinates along the actual cut edge",
            "--wrong-near-plane": "texture pilot projects exactly the same clipped footprint as the game",
            "--affine-viewport-uv": "viewport clipping preserves perspective material coordinates",
            "--unbounded-triangles": "hard triangle budget preserves whole visible face without exceeding the cap",
            "--global-random": "material baking never consumes gameplay random state",
            "--transpose-material-transform": "actual Canvas material transform maps authored tile coordinates to all screen corners",
            "--leak-canvas-state": "material drawing restores caller Canvas color alpha and state stack",
            "--strict-split-edge": "exactly tied split edges choose the same edge under sub-nanopixel camera noise",
            "--flag-viewport-cuts": "viewport cut edges are not flagged as face outline while real outline edges are",
            "--flag-by-fan-index": "a skipped degenerate end root does not hide its collinear outline edge",
            "--owned-before-validation": "owner-masked drawing rejects a missing vertex instead of throwing",
        }
        for flag, assertion in mutations.items():
            with self.subTest(mutation=flag):
                result = run_js(self.script, [flag], timeout=30)
                output = result.stdout + result.stderr
                self.assertIn("PASS equal depth control agrees with affine texture coordinates", output)
                self.assertIn("FAIL " + assertion, output)
                self.assertRegex(output, r"TEXTURE_MAPPING_RESULT FAIL \d+/35")
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("Error:", output)
                self.assertNotIn("Exception:", output)
                self.assertNotIn("SETUP ", output)


if __name__ == "__main__":
    unittest.main()
