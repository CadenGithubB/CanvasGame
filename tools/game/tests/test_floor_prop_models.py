"""Floor-prop models and drawFloorScatter3D's per-type dispatch (integration stages I1, I2).

Risk: every floor-scatter item is a flat billboard at its centre depth (one
withSceneDepthBillboard per item), so the high-value props (crates, barrels,
boulders, stone columns, sand pillars, mesa boulders) have no volume, no
depth and a contact-shadow ellipse. Their models must stand on the terrain
without floating on a slope (the centre-only support leaves crates up to 3
units in the air on real Endless terrain), turn by a stateless key that no
window shift changes (the sprite's r0..r2 have ten values for integer
Endless seeds, and seed x 2pi is one direction for all of them), write
depth so a wall hides them, and leave the sprite path (no paintFloorItem or
contact shadow) while every other type's sprites stay exactly as they were.
floorPropModels was registered default OFF in I1; I2 adds the remaining
types (stalagmite, tree_stump, fallen_log, rock_spire, cave_rubble_pile,
rock_arch; Tier-7 scatter such as rock_pile, skull and crystal stays
sprites) and flips it ON after its checks pass with it OFF, so the model
loop's support queries must also come after its range and view cull.

Oracles (floor_prop_models.js, real MAIN manifest through render_host.js):
the recipe dimensions of s = 1500 x tierScale / 180 written out in the test;
built faces in absolute coordinates across real assembleWindow calls with
the item's chunk at window slots 0, 1 and 2; yaw measured from the built
crate body's face normals; an analytic planar slope mesh; a real wall
(drawWalls3D); the legacy sprite bounds arithmetic and vertex projections;
paintFloorItem and contact-shadow spies. Headless commands and depth, not
browser pixels or timing: the render lab (render-lab/60-floor-props.js)
runs the visual and timing checks.
"""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("floor_prop_models.js")
EXPECTED = 33
# flag -> (sections to run, check-name prefixes that must FAIL)
MUTATIONS = {
    "--seed-2pi": ("yaw", ("yaw: 100 Endless crates (seed 2024) turn into at least 8 of 16 buckets",)),
    "--window-relative": ("slots", ("slots: a chunk's modelled props build identical world faces",)),
    "--centre-support": ("support", ("support: on a slope (ground z = 0.25 x + 0.1 y)",)),
    "--no-sink": ("support", ("support: on flat ground every modelled prop's base is exactly 0.15 under the ground",)),
    "--sprites-too": ("sprites,phase", ("sprites: with it on the modelled types make zero paintFloorItem and contact-shadow calls",
                                        "phase: the overlay phase draws only the unmodelled sprites")),
    "--see-through-fog": ("fade", ("fade: inside the range every model fill is at globalAlpha 1",)),
    "--tight-cull": ("cull", ("cull: every modelled prop in range with a vertex projecting on screen",)),
    "--i2-sprites": ("spec,sprites,phase", ("spec: the I2 types have ready closed models",
                                           "spec: the I2 models keep the recipe proportions",
                                           "sprites: with it on the modelled types make zero paintFloorItem and contact-shadow calls",
                                           "phase: with floorPropModels on the opaque phase draws the four modelled props")),
    "--log-tilted": ("spec", ("spec: the I2 models keep the recipe proportions",)),
    "--support-first": ("cache", ("cache: range and view come before any support query",)),
}


def run(*flags):
    result = run_js(SCRIPT, list(flags), timeout=300)
    output = result.stdout + result.stderr
    return output, output.splitlines()


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class FloorPropModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output, cls.lines = run()

    def test_every_floor_prop_check_passes(self) -> None:
        self.assertIn(f"FLOOR_PROP_MODELS_RESULT PASS {EXPECTED} failed 0", self.lines, self.output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in self.lines), self.output)
        self.assertNotIn("SETUP", self.output)
        self.assertTrue(any(line.startswith("NOTE slots ") for line in self.lines), self.output)

    def test_each_mutation_fails_its_named_check(self) -> None:
        for flag, (sections, names) in MUTATIONS.items():
            with self.subTest(mutation=flag):
                output, lines = run(flag, "--sections", sections)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP", output)
                self.assertTrue(any(line.startswith("FLOOR_PROP_MODELS_RESULT FAIL") for line in lines), output)
                failures = [line for line in lines if line.startswith("FAIL ")]
                for name in names:
                    self.assertTrue(any(line.startswith("FAIL " + name) for line in failures),
                                    f"{flag} did not fail '{name}':\n{output}")
                self.assertTrue(any(line.startswith("PASS real manifest loads") for line in lines), output)
                self.assertFalse(any(line.startswith("FAIL no console errors") for line in lines), output)


if __name__ == "__main__":
    unittest.main()
