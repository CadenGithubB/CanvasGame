"""Opaque-first pass order (integration stage G2).

Risk: billboards and sprites do not write depth, so any opaque part painted
after them paints over them wherever it passes the depth test, even when it
is farther. Before G2 the late ruins3D and structures3D stages (after the
enemies, shrines and pickups) drew the ruins' faces and the structure shells,
and sceneEntities drew each family's model faces after the previous family's
sprites. landmarkOpaqueEarly moves the ruin faces and structure shells into
draw()'s new landmarkOpaque3D stage (after caveEntrance3D), leaving the late
stages only their labels, interactables, prompts and sealed ring,
depth-clipped; sceneEntities draws every family's opaque phase before any
overlay phase. Legacy keeps the old order byte for byte.

Oracles (pass_order.js, real MAIN manifest through render_host.js, one real
renderFrame() per scene on an authored flat world): the recorded command
stream interpreted per pixel (the paint log of structure_model_draw.js) and
the depth-tested pixel masks of withSceneDepthClip; a farther part
"overpaints" a nearer pixel when it fills it after the nearer thing did. The
depth order is authored in the scene. Each positive check has a control (the
late order, or the legacy chest) that does overpaint, and a negative control
(the same things moved aside) that shares no pixel. Headless commands and
scene depth, not browser pixels or timing.

Restated in stage H: the spawner has a model (spawnerModel, default ON), so
the "calls" check that model-less families record nothing in the opaque
phase runs the spawner's legacy path (spawnerModel off) and is renamed; its
opaque/overlay split is covered by spawner_model.js.
"""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("pass_order.js")
EXPECTED = 28  # Restated in Stage J2: +1 ruin check with the J2 defaults (landmark models, bounds gate)
# flag -> (sections to run, check-name prefixes that must FAIL)
MUTATIONS = {
    "--late-landmarks": ("ruin,lintel,overlays", (
        "ruin: with landmarkOpaqueEarly the farther ruin post overpaints 0 nearer pixels",
        "lintel: with landmarkOpaqueEarly the legacy shell draws in landmarkOpaque3D",
        "overlays: with landmarkOpaqueEarly, overlays behind a wall are hidden")),
    "--family-order": ("entities", (
        "entities: sceneEntities draws every family's opaque phase before any overlay phase",
        "entities: opaque first, the farther torch model overpaints 0 of the nearer chest overlays")),
    "--overlay-unclipped": ("overlays", ("overlays: with landmarkOpaqueEarly, overlays behind a wall are hidden",)),
}


def run(*flags):
    result = run_js(SCRIPT, list(flags), timeout=240)
    output = result.stdout + result.stderr
    return output, output.splitlines()


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class PassOrderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output, cls.lines = run()

    def test_every_pass_order_check_passes(self) -> None:
        self.assertIn(f"PASS_ORDER_RESULT PASS {EXPECTED} failed 0", self.lines, self.output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in self.lines), self.output)
        self.assertNotIn("SETUP", self.output)
        for note in ("NOTE ruin early ", "NOTE lintel early ", "NOTE entities flame: ", "NOTE overlays early "):
            self.assertTrue(any(line.startswith(note) for line in self.lines), note)

    def test_each_mutation_fails_its_named_check(self) -> None:
        for flag, (sections, names) in MUTATIONS.items():
            with self.subTest(mutation=flag):
                output, lines = run(flag, "--sections", sections)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP", output)
                self.assertTrue(any(line.startswith("PASS_ORDER_RESULT FAIL") for line in lines), output)
                failures = [line for line in lines if line.startswith("FAIL ")]
                for name in names:
                    self.assertTrue(any(line.startswith("FAIL " + name) for line in failures),
                                    f"{flag} did not fail '{name}':\n{output}")
                self.assertTrue(any(line.startswith("PASS real manifest loads") for line in lines), output)
                self.assertFalse(any(line.startswith("FAIL no console errors") for line in lines), output)

    def test_sections_flag_selects_only_the_named_sections(self) -> None:
        output, lines = run("--sections", "calls")
        self.assertTrue(any(line.startswith("PASS calls: ") for line in lines), output)
        self.assertFalse(any(line.startswith(("PASS ruin: ", "PASS lintel: ", "PASS entities: ")) for line in lines), output)
        self.assertTrue(any(line.startswith("PASS_ORDER_RESULT PASS") for line in lines), output)


if __name__ == "__main__":
    unittest.main()
