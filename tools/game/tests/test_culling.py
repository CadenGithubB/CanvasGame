"""Culling, early reject and counters for props (integration stage K).

Risk: per-frame prop work grows with the whole window, not the view. The
wall-decoration and ore loops attached every record (two getFloorHeightAt
queries and a cave-ceiling query each) before their distance test, and every
floor-scatter item paid a support query before entityVisible3D rejected it by
distance; a model fully behind nearer geometry still built and depth-tested
every face. Stage K adds two exact switches, both default ON (Legacy OFF):
decorAnchorCache (reject by distance and view first, in the loops' own
arithmetic, then read terrain from a per-record cache that a new floorMesh
object, every window assembly and noteWorldGeometryEdit() drop) and
modelEarlyReject (a read-only test of the model's reach bounds against scene
depth at their nearest depth; a hidden model builds no faces). The hazards are
a pre-check that rejects a record the loop would keep, a stale cached anchor
after an in-place geometry edit, and an early reject that drops a partly
visible model. Per-family depth-clip counters (clip<Family>, from the
clip-generation delta in the callers; 12-scene-depth.js is untouched) and
mdl<Family>Rejected report the work in the Perf HUD.

Oracles (culling.js, real MAIN manifest through render_host.js): the
switches' off path recorded call for call and depth pixel for pixel at 8 yaws
of 4 Endless windows (seed 259 from its fortress courtyard, 7, 2024, 12345,
with ore placed on real wall faces); for the early reject, the paint-effective
stream (each paint call with the state it paints with and its path) and the
depth buffer, since a rejected model skips only fillStyle/globalAlpha sets;
record coordinates and entityVisible3D's documented distance/forward contract
for the within-radius query counts; authored occluder quads and chest poses
(closed, cut by a wall through its centre, lid opened 100 degrees over a low
wall); live terrain queries after an in-place mesh edit. Commands and scene
depth, not browser pixels or timing: the render-lab module
(render-lab/70-culling.js: courtyard(), counts(), timeView()) is smoke-tested
here and drives the browser A/B/B/A timing in a fortress courtyard.
"""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("culling.js")
EXPECTED = 28
# flag -> (sections to run, check-name prefixes that must FAIL)
MUTATIONS = {
    "--reject-farthest": ("reject", ("reject: a chest cut by a wall through its centre",)),
    "--no-hinge-reach": ("reject", ("reject: an open lid showing over a low wall",)),
    "--no-epoch-bump": ("invalidate", ("invalidate: after noteWorldGeometryEdit() the drawn prop uses the edited terrain",
                                       "invalidate: a scatter item's cached support refreshes")),
    "--no-mesh-key": ("invalidate", ("invalidate: a new floorMesh object refreshes the anchors",)),
    "--short-decor-radius": ("parity,counts", ("parity: decorAnchorCache on with live terrain",
                                               "counts: wall decorations, with the switch on")),
    "--scatter-radius": ("parity,counts", ("parity: decorAnchorCache on with the cache, cold and warm",
                                           "counts: floor scatter, off queries support for every item")),
}


def run(*flags):
    result = run_js(SCRIPT, list(flags), timeout=300)
    output = result.stdout + result.stderr
    return output, output.splitlines()


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class CullingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output, cls.lines = run()

    def test_every_culling_check_passes(self) -> None:
        self.assertIn(f"CULLING_RESULT PASS {EXPECTED} failed 0", self.lines, self.output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in self.lines), self.output)
        self.assertNotIn("SETUP", self.output)
        for note in ("NOTE parity ", "NOTE counts decor ", "NOTE counts scatter ", "NOTE counts ore ", "NOTE counters "):
            self.assertTrue(any(line.startswith(note) for line in self.lines), note)

    def test_each_mutation_fails_its_named_check(self) -> None:
        for flag, (sections, names) in MUTATIONS.items():
            with self.subTest(mutation=flag):
                output, lines = run(flag, "--sections", sections)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP", output)
                self.assertTrue(any(line.startswith("CULLING_RESULT FAIL") for line in lines), output)
                failures = [line for line in lines if line.startswith("FAIL ")]
                for name in names:
                    self.assertTrue(any(line.startswith("FAIL " + name) for line in failures),
                                    f"{flag} did not fail '{name}':\n{output}")
                self.assertTrue(any(line.startswith("PASS real manifest loads") for line in lines), output)
                self.assertFalse(any(line.startswith("FAIL no console errors") for line in lines), output)


if __name__ == "__main__":
    unittest.main()
