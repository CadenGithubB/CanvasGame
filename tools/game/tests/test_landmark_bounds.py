"""Landmark bounds gate: landmarks are culled by their world bounds (integration stage J2).

Risk: shrines, market stalls, the guard tower, structures, ruins and cave
portals were culled by their centre point. A camera past a landmark's centre
(a watchtower arm, a ruin's open face) or a portal mouth seen sideways lost
the whole landmark although its faces were in view, and the legacy column,
hill, below-floor and surface/underground tests culled landmarks whose faces
were on screen. The bounds gate (entityVisible3D's worldRadius, scene-depth
callers only) rejects only bounds wholly behind the depth-1 near plane or
wholly out of range, marks a centre behind the camera as having no screen
point, and keeps the structures' hill test only beyond viewDist. The stall
and guard tower keep their audited centre gates (the audit lab's _SHOP_ZERO
probe replaces the tower's line); a rescue re-asks only a centre behind the
camera or out of range. landmarkModels and landmarkBoundsGate are default ON
since J2 and OFF in Legacy.

Oracles (landmark_bounds.js, real MAIN manifest through render_host.js):
- each subject's authored world faces, captured with entityVisible3D
  stubbed open, clipped at depth 1 and projected by the test's own camera
  formulas: a subject must draw exactly when a face lands on screen;
- the legacy options written out, for each row's reason;
- analytic entityVisible3D cases (bounds behind or out of range, the hill
  test, minDist, the rescue);
- the captured faces' reach against each family's bounds radius;
- (fixes round 1) opaque ruin dressing whose centre is past viewDist draws
  nothing, as the legacy centre limit did (the bounds extend only its
  near-plane test); from a seed-555 cave floor with head room under a
  surface shrine, full G.draw() frames hide the shrine model behind the
  roof's scene depth, with the surface, cleared-depth and skipped-ceiling
  frames as controls.
Headless depth and commands, not browser pixels or timing: the render lab
(render-lab/70-landmarks.js) runs the visual A/B checks.
"""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("landmark_bounds.js")
EXPECTED = 27
# flag -> (extra arguments, check-name prefixes that must FAIL)
MUTATIONS = {
    "--legacy-gates": (("--sections", "sweep,probe", "--seeds", "2024,555"),
                       ("sweep: every subject over the six seeds draws exactly when its authored faces land on screen",
                        "probe: at the portal mouth facing sideways",
                        "probe: a camera past the watchtower centre",
                        "probe: a camera past the ruin centre")),
    "--centre-gate": (("--sections", "gate,probe"),
                      ("gate: a centre 5 behind the camera is kept",
                       "probe: at the portal mouth facing sideways",
                       "probe: a camera past the ruin centre")),
    "--centre-screen-point": (("--sections", "gate"), ("gate: a centre 5 behind the camera is kept",)),
    "--no-rescue": (("--sections", "gate,sweep", "--seeds", "2024"),
                    ("gate: the stall/tower rescue re-asks only",
                     "sweep: every subject over the six seeds draws exactly when its authored faces land on screen")),
    "--portal-centre-gate": (("--sections", "probe"), ("probe: at the portal mouth facing sideways",)),
    "--short-fortress-radius": (("--sections", "sweep", "--seeds", "2024"),
                                ("sweep: every captured authored face lies inside its family's bounds radius",)),
    "--draw-faded": (("--sections", "gate"), ("gate: a shrine just past its range, reached only through its bounds",)),
    # Fixes round 1: opaque ruin dressing keeps the centre limit at viewDist.
    "--ruin-far-bounds": (("--sections", "gate"), ("gate: a ruin whose centre is past viewDist, reached only through its bounds",)),
    # Fixes round 1: from a cave only the roof's scene depth hides a surface shrine.
    "--ceiling-no-depth": (("--sections", "cave"), ("cave: from the cave floor under a surface shrine the roof hides the shrine model",)),
}


def run(*flags):
    result = run_js(SCRIPT, list(flags), timeout=600)
    output = result.stdout + result.stderr
    return output, output.splitlines()


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class LandmarkBoundsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output, cls.lines = run()

    def test_every_landmark_bounds_check_passes(self) -> None:
        self.assertIn(f"LANDMARK_BOUNDS_RESULT PASS {EXPECTED} failed 0", self.lines, self.output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in self.lines), self.output)
        self.assertNotIn("SETUP", self.output)
        # A reason per row: the legacy gate's verdict is printed for every subject and pose.
        rows = [line for line in self.lines if line.startswith("NOTE row ")]
        self.assertGreater(len(rows), 100, self.output)
        self.assertTrue(all(" legacy " in line for line in rows))
        for family in ("shrine", "stall", "tower", "fortress", "arena", "watchtower", "portal", "ruin", "chest"):
            self.assertTrue(any(f" {family} " in line for line in rows), family)
        for note in ("NOTE sweep legacy culls ", "NOTE probe ", "NOTE lab "):
            self.assertTrue(any(line.startswith(note) for line in self.lines), note)

    def test_each_mutation_fails_its_named_check(self) -> None:
        for flag, (extra, names) in MUTATIONS.items():
            with self.subTest(mutation=flag):
                output, lines = run(flag, *extra)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP", output)
                self.assertTrue(any(line.startswith("LANDMARK_BOUNDS_RESULT FAIL") for line in lines), output)
                failures = [line for line in lines if line.startswith("FAIL ")]
                for name in names:
                    self.assertTrue(any(line.startswith("FAIL " + name) for line in failures),
                                    f"{flag} did not fail '{name}':\n{output}")
                self.assertTrue(any(line.startswith("PASS real manifest loads") for line in lines), output)
                self.assertFalse(any(line.startswith("FAIL no console errors") for line in lines), output)


if __name__ == "__main__":
    unittest.main()
