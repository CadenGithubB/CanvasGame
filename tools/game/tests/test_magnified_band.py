"""The magnified-band motion case (stage L), headless contract only.

Risk: prop textures (propTextures) ship ON only because the chest at
production size shows no shimmer in the magnified band, 20 to 90 units, which
the structure motion suite never covered (its cases start at about 62 units
on 32-unit tiles). StructureMotion.runMagnified (tools/game/structure-motion.js)
is that native check, run with the 'Test prop magnified band' button on
/structures.html (it passed 16/16 in Chromium before the flip). A case
that silently used other chest dimensions or tile length, skipped the near
distances, or could not find a visible region of interest at the far ones
would report a PASS that says nothing about chests.

Oracles (magnified_band.js): CHEST_MODEL_DIMS read from
src/12-prop-models.js as text; the texel footprint from the study camera
written out in the harness; stand-in hooks whose renderer is the analytic
coverage oracle (exact: must PASS every case with the stationary and uniform
controls), a 32-unit tile (must be a spatial QUALITY_FAILURE) or a frozen
camera (must not PASS). Not native pixels: the real mapper and Canvas are
exercised only in the browser.
"""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("magnified_band.js")
EXPECTED = 7
MUTATIONS = {
    "--wrong-panel-scale": ("fixture: the study chest is the game's CHEST_MODEL_DIMS",),
    "--no-magnified-front": ("fixture: the study chest is the game's CHEST_MODEL_DIMS",
                             "footprint: at 20 units a 128 px texel spans more than 1.2 screen pixels"),
    "--roi-default": ("exact renderer: all 16 cases",),
}


def run(*flags):
    result = run_js(SCRIPT, list(flags), timeout=300)
    output = result.stdout + result.stderr
    return output, output.splitlines()


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class MagnifiedBandTests(unittest.TestCase):
    def test_magnified_band_case_contract(self) -> None:
        output, lines = run()
        self.assertIn(f"MAGNIFIED_BAND_RESULT PASS {EXPECTED}", lines, output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in lines), output)
        self.assertNotIn("Error:", output)

    def test_each_mutation_fails_its_named_check(self) -> None:
        for flag, names in MUTATIONS.items():
            with self.subTest(mutation=flag):
                output, lines = run(flag)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertTrue(any(line.startswith("MAGNIFIED_BAND_RESULT FAIL") for line in lines), output)
                failures = [line for line in lines if line.startswith("FAIL ")]
                for name in names:
                    self.assertTrue(any(line.startswith("FAIL " + name) for line in failures),
                                    f"{flag} did not fail '{name}':\n{output}")


if __name__ == "__main__":
    unittest.main()
