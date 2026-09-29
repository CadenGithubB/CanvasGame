"""The treasure-chest model and drawTreasureChests3D's model path (integration stage G1).

Risk: the legacy chest is painter-ordered box faces that neither write nor
test depth against each other, its lid a sheared quad hinged at the lid's top
(the "floating lid"), and it is see-through in fog. The model must be an
opaque, depth-writing chest in the legacy frame (lock side = facing) with an
open-top body, a rigid lid hinged at the body's back top edge (0..100
degrees), trim, strap and lock plate proud on the lock side, and it must keep
the glow, sparkle, epic particles and loot label as billboards at anchors in
the overlay phase. chestModel was registered default OFF in G1; stage G2
(pass_order.js) made sceneEntities opaque-first and flipped it default ON.

Oracles (chest_model.js, real MAIN manifest through render_host.js): the
legacy chest frame and the G1 part extents written out in the test; Newell
normals recomputed from the emitted world vertices; ray/plane and ray/box
intersections through the lock plate's pixel centre at azimuths 22.5 + k x 45
degrees (lid shut and open, back-face cull on and off); the recorded commands
of the split and unsplit calls and of the legacy path. Headless depth and
commands, not browser pixels or timing: the render lab
(render-lab/40-chests.js) runs the visual checks.
"""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("chest_model.js")
EXPECTED = 30   # Stage K: the overlay occluder check split by modelEarlyReject (off: per-face; on: early reject)
# flag -> (sections to run, check-name prefixes that must FAIL)
MUTATIONS = {
    "--swap-right-out": ("spec,depth", ("spec: the body footprint is the legacy chest",
                                        "depth: from the lock side")),
    "--flip-normal": ("normals,depth", ("normals: every emitted normal is the Newell normal",
                                        "depth: from the lock side")),
    "--hinge-at-lid-top": ("joints", ("joints: the hinge edge is fixed",)),
    "--lid-shear": ("joints", ("joints: lid and lid-trim edge lengths are invariant",)),
    "--halo-at-centre": ("overlay", ("overlay: the glow halo is centred on the glow anchor and depth-tested behind",)),
    "--see-through-fog": ("fade", ("fade: inside the range every opaque fill is at globalAlpha 1",)),
    "--overlay-in-opaque": ("phase", ("phase: the opaque phase writes the chest to depth and draws no billboard",)),
}


def run(*flags):
    result = run_js(SCRIPT, list(flags), timeout=180)
    output = result.stdout + result.stderr
    return output, output.splitlines()


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class ChestModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output, cls.lines = run()

    def test_every_chest_model_check_passes(self) -> None:
        self.assertIn(f"CHEST_MODEL_RESULT PASS {EXPECTED} failed 0", self.lines, self.output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in self.lines), self.output)
        self.assertNotIn("SETUP", self.output)
        self.assertTrue(any(line.startswith("NOTE depth lock side ") for line in self.lines), self.output)

    def test_each_mutation_fails_its_named_check(self) -> None:
        for flag, (sections, names) in MUTATIONS.items():
            with self.subTest(mutation=flag):
                output, lines = run(flag, "--sections", sections)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP", output)
                self.assertTrue(any(line.startswith("CHEST_MODEL_RESULT FAIL") for line in lines), output)
                failures = [line for line in lines if line.startswith("FAIL ")]
                for name in names:
                    self.assertTrue(any(line.startswith("FAIL " + name) for line in failures),
                                    f"{flag} did not fail '{name}':\n{output}")
                self.assertTrue(any(line.startswith("PASS real manifest loads") for line in lines), output)
                self.assertFalse(any(line.startswith("FAIL no console errors") for line in lines), output)


if __name__ == "__main__":
    unittest.main()
