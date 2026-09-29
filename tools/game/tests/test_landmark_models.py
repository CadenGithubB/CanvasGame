"""Landmark models: shrines, market stalls, the guard tower and the keep props (integration stage J1).

Risk: the legacy landmark painters draw directly in the late marketStalls3D,
shrines3D and structures3D stages. They write no depth and stand on
getFloorHeightAt, the lowest layer, so a landmark over a cave is drawn down
at the cave floor (the Stage 1(c) leftover). Their see-through billboard
clips let a farther landmark paint over nearer sprites. The models must be
opaque and depth-writing, stand on getEntityRenderFloorZ (the surface
support), and draw in the landmark opaque pass. The glows, labels and
'Press E' prompts become depth-clipped billboards that the landmark's own
model never hides. The stall model's footprint must stay equal to the
collision box in 09-physics.js; physics is unchanged. The shop stands at
the guard tower, which has no movement collision, so a camera in or at the
tower keeps the legacy painter, as the spawner does. The legacy gates stay
until stage J2. landmarkModels was registered default OFF in J1; stage J2
flips it ON (Legacy stays OFF) and replaces the gates (test_landmark_bounds).

Oracles (landmark_models.js, real MAIN manifest through render_host.js):
- the J1 spec written out: the pedestal, the octahedron, the merlon spans
  and the keep offsets;
- repelFromStalls' collision box, probed by bisection, and the legacy
  painter's own drawn table corners;
- an authored two-layer site, with a cave floor at 0 under a surface at 50;
- analytic depths of faces square to the view;
- the legacy painter's command stream for the tower-reach and fallback
  cases.
Headless depth and commands, not browser pixels or timing: the render lab
(render-lab/70-landmarks.js) runs the visual A/B checks.
"""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("landmark_models.js")
EXPECTED = 43
# flag -> (sections to run, check-name prefixes that must FAIL)
MUTATIONS = {
    "--stall-width": ("footprint", ("footprint: at five facings the stall model's standing parts",)),
    "--legacy-stall-width": ("footprint", ("footprint: the model slab's corners are the legacy painter's drawn table corners",)),
    "--lowest-floor": ("anchor", ("anchor: over a cave, the shrine, stall, goods, guard tower, forge, lectern and banner models stand on the surface",)),
    "--no-tower-reach": ("reach", ("reach: a camera inside the tower",)),
    "--overlay-at-near-plane": ("overlay", ("overlay: the glow, label and prompt are tested at the pedestal's nearest depth",
                                            "overlay: a wall between the camera and the shrine (depth 30) hides")),
    "--late-landmarks": ("frame", ("frame: with the landmark opaque pass, every stall, tower, shrine and keep model draws once",
                                   "frame: the late marketStalls3D and shrines3D stages then draw only overlays")),
}


def run(*flags):
    result = run_js(SCRIPT, list(flags), timeout=240)
    output = result.stdout + result.stderr
    return output, output.splitlines()


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class LandmarkModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output, cls.lines = run()

    def test_every_landmark_model_check_passes(self) -> None:
        self.assertIn(f"LANDMARK_MODELS_RESULT PASS {EXPECTED} failed 0", self.lines, self.output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in self.lines), self.output)
        self.assertNotIn("SETUP", self.output)
        for note in ("NOTE footprint ", "NOTE anchor ", "NOTE depth ", "NOTE reach ", "NOTE frame "):
            self.assertTrue(any(line.startswith(note) for line in self.lines), note)

    def test_each_mutation_fails_its_named_check(self) -> None:
        for flag, (sections, names) in MUTATIONS.items():
            with self.subTest(mutation=flag):
                output, lines = run(flag, "--sections", sections)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP", output)
                self.assertTrue(any(line.startswith("LANDMARK_MODELS_RESULT FAIL") for line in lines), output)
                failures = [line for line in lines if line.startswith("FAIL ")]
                for name in names:
                    self.assertTrue(any(line.startswith("FAIL " + name) for line in failures),
                                    f"{flag} did not fail '{name}':\n{output}")
                self.assertTrue(any(line.startswith("PASS real manifest loads") for line in lines), output)
                self.assertFalse(any(line.startswith("FAIL no console errors") for line in lines), output)


if __name__ == "__main__":
    unittest.main()
