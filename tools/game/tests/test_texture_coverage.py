"""Owner-mask edge coverage of submitted texture clips; recorded paths, not pixels."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

CHECKS = 28
RESULT = "TEXTURE_COVERAGE_RESULT"


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class TextureCoverageTests(unittest.TestCase):
    script = Path(__file__).with_name("texture_coverage.js")

    def run_script(self, *flags):
        result = run_js(self.script, list(flags), timeout=300)
        output = result.stdout + result.stderr
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertNotIn("SETUP ", output)
        self.assertNotIn("Error:", output)
        self.assertNotIn("Exception:", output)
        return output

    def test_owned_edge_pixels_are_fully_inside_issued_texture_clips(self):
        output = self.run_script()
        lines = output.splitlines()
        self.assertIn(f"{RESULT} PASS {CHECKS}", lines)
        self.assertEqual(CHECKS, sum(line.startswith("PASS ") for line in lines))
        self.assertNotIn("FAIL ", output)

    def test_reintroduced_edge_coverage_faults_fail_their_intended_contracts(self):
        mutations = {
            "--old-clip": (
                "codex vertical join triangles cover every owned pixel point in both face orders at all 17 phases",
                "codex horizontal join triangles cover every owned pixel point in both face orders at all 17 phases",
                "long thin triangle with capped miters covers every owned pixel point at all 17 phases",
                "owned sliver pixels are fully covered by triangle textures at every phase that owns them",
                "outline triangles keep the unowned expanded triangle first and add one skirt per outline edge on every pass",
            ),
            "--keep-face-clip": (
                "planar ownedPixels issues no face outline clip only one pixel band rectangles",
                "planar ownedPixels paints every owned pixel point with an opaque band pass",
            ),
            "--drop-outline-flags": (
                "tessellate boundary flags mark exactly the face outline edges and never viewport cuts",
                "codex vertical join triangles cover every owned pixel point in both face orders at all 17 phases",
            ),
            "--reverse-skirt": (
                "codex vertical join triangles cover every owned pixel point in both face orders at all 17 phases",
                "skirts share their triangle winding so the nonzero clip is a union",
            ),
        }
        # Fixture preconditions and oracle controls must survive every mutant,
        # so each failure above is a contract failure, not a broken scenario.
        preserved = (
            "recording canvas resolves nonzero unions opposite winding holes transforms and clip save restore",
            "coverage oracle rejects bare subpixel strips cancelled windings and translucent passes but accepts full cover",
            "codex join fixtures own pixels whose centers are inside but whose squares cross the join at every fractional phase",
            "long thin triangle fixture is emitted whole with outline miters capped to under 0.4 px",
            "sliver owns pixel centers exactly at the analytically predicted phases and nowhere else",
            "without ownedPixels the same oracle finds bare owned edge area at the join thin corners and sliver",
        )
        for flag, assertions in mutations.items():
            with self.subTest(mutation=flag):
                output = self.run_script(flag)
                for assertion in assertions:
                    self.assertIn("FAIL " + assertion, output)
                for assertion in preserved:
                    self.assertIn("PASS " + assertion, output.splitlines())
                self.assertRegex(output, rf"{RESULT} FAIL \d+/{CHECKS}")


if __name__ == "__main__":
    unittest.main()
