"""Structure render models, builder (src/12-structure-models.js, stage D1).

Risk: stage D2 replaces walls3D's per-cell structure walls and the late
structure shell with these models. A wrong ownership rule takes natural rock,
ruin huts or cave walls into a sun-lit surface model (wrong material, missing
ceiling closures, tops over caves) or leaves structure cells drawn twice; a
missing riser leaves a hole above a lower neighbour; a merged run that spans
different tops, bases or colours, or longer than 48 units, misplaces faces or
coarsens torch light; window-relative UVs make textures jump when the window
re-centres; a builder that touches world data changes collision; a build
outside Endless claims classic cells from the stale Endless window state
(resetLevel keeps largeStructures, chunks and the colour arrays). Stage D1
built only; stage D2 draws the models (structure_model_draw.js) and flipped
the feature default ON, so the one-frame check is restated: the flag-on frame
now differs and switching off restores the flag-off frame exactly.

Oracles (structure_models.js, real MAIN manifest through render_host.js, six
fixed seeds x fortress, arena and watchtower, plus seed 7919's watchtower,
whose ownership scan range holds a real ruin hut): ownership recomputed from
the window chunks' .structure regions and colour arrays; every face drawWalls3D
submits from four views (projectSceneWorldPolygon inputs, cave faces marked by
walls3D's own getCaveRenderLightAt call); StructureModel.meshGrid and
StructureModel.build on StructureProduction.stamp grids (dev.py's import of
the production stamp and shell); world arrays, spatial wall spans, collision
and ray queries and the RNG counter; one recorded frame with the flag off and
on. The cave overlap fixture is authored on a real fortress window because the
generator never lets a cave reach a structure (the harness's generator note
scans 1,500 seeds). A hand-computed 4x5 mesher fixture pins merge keys,
per-side face bases and natural occluders. Headless: geometry and commands,
not browser pixels; the build-time bound is a real-clock jsc ratio of the
first build after a window assembly to that assembly.
"""
from pathlib import Path
import tempfile
import unittest

from tools.game import dev
from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("structure_models.js")
EXPECTED = 37
# flag -> (extra arguments, check-name prefixes that must FAIL)
MUTATIONS = {
    "--ignore-natural-neighbours": (("--sections", "coverage", "--seeds", "2024"),
                                    ("model walls are exactly merged walls3D faces",
                                     "risers sit above a lower solid neighbour")),
    "--drop-owned-mask": (("--sections", "coverage", "--seeds", "2024"), ("natural cells emit no model face",)),
    "--window-relative-uv": (("--sections", "rebase", "--seeds", "2024"), ("rebase: window origins shifted",)),
    "--drop-risers": (("--sections", "parity"), ("study parity: the production mesher",)),
    "--include-cave-cells": (("--sections", "cave", "--seeds", "2024"), ("cave-touched cells stay with walls3D",
                                                                         "overlap fixture: every walls3D face")),
    # Fixes round 1 (verifier findings): each rule below survived a mutation before.
    "--colour-only": (("--sections", "coverage", "--seeds", "2024"), ("ownership: exactly", "natural cells emit no model face")),
    "--no-endless-build": (("--sections", "presentation", "--seeds", "2024"), ("classic levels:",)),
    "--no-endless-current": (("--sections", "presentation", "--seeds", "2024"), ("classic levels:",)),
    "--stale-always-current": (("--sections", "presentation", "--seeds", "2024"), ("staleness:",)),
    "--merge-ignores-colour": (("--sections", "mesher"), ("mesher fixture: equal top and base but different colours",
                                                         "mesher fixture: faces equal the hand-built list")),
    "--swap-we-base": (("--sections", "mesher"), ("mesher fixture: faces equal the hand-built list",)),
    "--no-maxtop-clamp": (("--sections", "cave", "--seeds", "2024"), ("cave fixture: risers start at the neighbour walls3D top",)),
    "--no-cave-neighbour": (("--sections", "cave", "--seeds", "2024"), ("cave-touched cells stay with walls3D",)),
}


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class StructureModelBuilderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="hw1_structure_models_")
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.production = Path(cls.temporary.name) / "production.js"
        cls.production.write_text(dev.structure_production_js(), encoding="utf-8")
        cls.output, cls.lines = cls.run_harness()

    @classmethod
    def run_harness(cls, *flags):
        result = run_js(SCRIPT, ["--production", str(cls.production), *flags], timeout=300)
        output = result.stdout + result.stderr
        return output, output.splitlines()

    def test_every_builder_check_passes(self) -> None:
        self.assertIn(f"STRUCTURE_MODELS_RESULT PASS {EXPECTED} failed 0", self.lines, self.output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in self.lines), self.output)
        self.assertNotIn("SETUP", self.output)

    def test_fixtures_are_substantial(self) -> None:
        notes = [line for line in self.lines if line.startswith("NOTE ")]
        # 19 = the six seeds' 18 structures plus the seed 7919 hut fixture.
        coverage = next(line for line in notes if line.startswith("NOTE coverage 19 structures"))
        self.assertGreater(int(coverage.split("coloured non-structure cells in scan ranges ")[1].split(",")[0]), 0, coverage)
        self.assertGreater(int(coverage.split("(owned cells ")[1].split(")")[0]), 10000, coverage)
        self.assertGreater(int(coverage.split(" above natural cells")[0].split("(")[-1]), 20, coverage)
        self.assertGreater(int(coverage.split("unowned coloured cells ")[1].split(",")[0]), 0, coverage)
        cave = next(line for line in notes if line.startswith("NOTE cave fixture "))
        self.assertGreaterEqual(int(cave.split("cave faces ")[1].split(",")[0]), 2, cave)
        self.assertTrue(any(line.startswith("NOTE generator sample:") for line in notes), notes)

    def test_each_mutation_fails_its_named_check(self) -> None:
        for flag, (extra, names) in MUTATIONS.items():
            with self.subTest(mutation=flag):
                output, lines = self.run_harness(flag, *extra)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP", output)
                self.assertTrue(any(line.startswith("STRUCTURE_MODELS_RESULT FAIL") for line in lines), output)
                failures = [line for line in lines if line.startswith("FAIL ")]
                for name in names:
                    self.assertTrue(any(line.startswith("FAIL " + name) for line in failures),
                                    f"{flag} did not fail '{name}':\n{output}")
                self.assertTrue(any(line.startswith("PASS real manifest loads") for line in lines), output)
                self.assertFalse(any(line.startswith("FAIL no console errors") for line in lines), output)

    def test_sections_flag_selects_only_the_named_sections(self) -> None:
        output, lines = self.run_harness("--sections", "load")
        self.assertIn("STRUCTURE_MODELS_RESULT PASS 4 failed 0", lines, output)
        self.assertFalse(any("coverage:" in line for line in lines), output)


if __name__ == "__main__":
    unittest.main()
