"""Structure render models, draw pass (src/12-structure-models.js, stage D2).

Risk: the merged structure model replaces walls3D's per-cell structure walls
and the late shell. Drawn in the wrong slot, a farther structure wall paints
over nearer chests and wall props (the late slot) or over nearer forest
canopies, which walls3D paints inline as depth-less arcs, and faded natural
walls in the fade band write depth before the structure behind them, hiding
it instead of showing it through (the after-walls3D slot). drawWalls3D resets
the legacy column depthBuffer, so a model that does not merge its column depth
lets shrines and structure labels show through walls. A model pass that throws
while walls3D skips the owned cells makes walls that still collide invisible.
The far-band shell (beyond viewDist) must stay fogged in colour. Legacy must
not change (render_parity pins it).

Oracles (structure_model_draw.js, real MAIN manifest through render_host.js
on real fortress windows, seeds 31337 and 777000): a paint log that
interprets the recorded 2D-context stream per pixel (rect, arc and polygon
paths, clip, save/restore, globalAlpha) with the draw functions tagged by
stage, so paint order is observed; the Legacy frame (flag off) for walls3D's
command stream, the depthBuffer and the late shell's colours; the production
visibility gates (chest scene-depth clips, the shrine renderEntities3D gate)
with positive controls after removing the wall cells in front. Fixtures clear
natural cells on the outside corridor or add one natural cell where a line of
sight needs it, and print the counts. Headless: commands and a pixel-centre
interpretation, not browser pixels.
"""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("structure_model_draw.js")
EXPECTED = 32  # Restated in Stage J2: +1 shrine-model check behind a structure wall
# flag -> (extra arguments, check-name prefixes that must FAIL)
MUTATIONS = {
    "--late-slot": (("--sections", "depth,canopy"),
                    ("depth: a chest in front of the curtain wall paints over the model",
                     "canopy: tree canopies in front of a forest fortress wall")),
    "--after-walls-slot": (("--sections", "canopy,fade"),
                           ("canopy: tree canopies in front of a forest fortress wall",
                            "fade: a natural wall in the fade band paints translucently")),
    "--canopy-unclipped": (("--sections", "canopy"), ("canopy: from the courtyard, canopies behind the curtain",)),
    "--no-column-merge": (("--sections", "gate"), ("legacy gate: a shrine behind a structure wall stays hidden",
                                                   "column depth: the depthBuffer after draw()")),
    "--no-fail-open": (("--sections", "failopen"), ("fail-open: a throwing projector is counted once",)),
    "--far-shell-unfogged": (("--sections", "shell"), ("shell: beyond viewDist the late pass draws the legacy shell once, fogged",)),
    # Fixes round 1 (verifier findings on D2).
    "--backface-cull": (("--sections", "coverage"),
                        ("coverage: from near-wall views beside natural cells",
                         "coverage: from player-height rings around a watchtower")),
    "--canopy-no-bias": (("--sections", "bias"), ("canopy: walls3D's own faces never clip a canopy",)),
    "--shell-range-half": (("--sections", "shell"), ("shell: between 0.5 and 1.0 x viewDist the model still draws the shell",)),
    "--far-shell-unguarded": (("--sections", "shell"), ("shell fail-open: a far-band shell exception is counted once",)),
}


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class StructureModelDrawTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output, cls.lines = cls.run_harness()

    @classmethod
    def run_harness(cls, *flags):
        result = run_js(SCRIPT, list(flags), timeout=300)
        output = result.stdout + result.stderr
        return output, output.splitlines()

    def test_every_draw_check_passes(self) -> None:
        self.assertIn(f"STRUCTURE_MODEL_DRAW_RESULT PASS {EXPECTED} failed 0", self.lines, self.output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in self.lines), self.output)
        self.assertNotIn("SETUP", self.output)

    def test_fixtures_are_real_windows(self) -> None:
        notes = [line for line in self.lines if line.startswith("NOTE ")]
        self.assertTrue(any(line.startswith("NOTE depth fixture seed 31337") for line in notes), notes)
        canopy = next(line for line in notes if line.startswith("NOTE canopy fixture seed 777000"))
        self.assertIn(" tree {", canopy)

    def test_each_mutation_fails_its_named_check(self) -> None:
        for flag, (extra, names) in MUTATIONS.items():
            with self.subTest(mutation=flag):
                output, lines = self.run_harness(flag, *extra)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP", output)
                self.assertTrue(any(line.startswith("STRUCTURE_MODEL_DRAW_RESULT FAIL") for line in lines), output)
                failures = [line for line in lines if line.startswith("FAIL ")]
                for name in names:
                    self.assertTrue(any(line.startswith("FAIL " + name) for line in failures),
                                    f"{flag} did not fail '{name}':\n{output}")
                self.assertTrue(any(line.startswith("PASS real manifest loads") for line in lines), output)
                self.assertFalse(any(line.startswith("FAIL no console errors") for line in lines), output)

    def test_sections_flag_selects_only_the_named_sections(self) -> None:
        output, lines = self.run_harness("--sections", "load")
        self.assertIn("STRUCTURE_MODEL_DRAW_RESULT PASS 4 failed 0", lines, output)
        self.assertFalse(any("canopy:" in line for line in lines), output)


if __name__ == "__main__":
    unittest.main()
