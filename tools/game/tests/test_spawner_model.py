"""The spawner obelisk model and drawEnemySpawners3D's model path (integration stage H).

Risk: the legacy spawner is a flat camera-facing trapezoid inside one
billboard depth test at its anchor: it writes no depth, is 40-100%
see-through in fog, and every Endless window copy drops pulsePhase, so all
Endless spawners pulse in phase. The model must be an opaque, depth-writing
obelisk that stays inside the projectile hit volume (r 25, h 90; the plan's
base half-width 18 would put its corners at 25.46), with a stateless yaw,
the runes as emissive decal strips carrying the pulse, and the eye, glow and
HP bar as billboards in the overlay phase. Fix round 1: spawners have no
movement collision, so the camera can stand in the obelisk, where its inside
faces filled the view and hid everything drawn later; such a spawner now
draws the legacy billboard. The eye and bar were tested 25.5 before their
anchor (an occluder in that band let them through) and the glow 25.5 behind
it (a wall just behind hid it); both are now tested against the body's
analytic depth range under their own rect. pulsePhase reaches the window
copies only while spawnerModel is on, so Legacy stays byte-identical
(render_parity pins unchanged). spawnerModel was registered default OFF,
checked, then flipped default ON in this stage.

Oracles (spawner_model.js, real MAIN manifest through render_host.js): the H
spec written out in the test (corners, rune bands) and as nine half-spaces
for ray intersection through pixel centres (the camera's clearance, and the
body depth under each overlay rect); the production projectile query
(projectileFirstHit) fired at every emitted vertex; propInstanceKey of the
world cell; the chunk records and a Legacy assembly of an Endless window
(seed 7). Headless depth and commands, not browser pixels or timing: the
render lab (render-lab/60-spawners.js) runs the visual checks.
"""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("spawner_model.js")
EXPECTED = 37
# flag -> (sections to run, check-name prefixes that must FAIL)
MUTATIONS = {
    "--wide-base": ("extent", ("extent: at 12 yaws every emitted body and rune vertex lies inside the projectile hit cylinder",)),
    "--window-relative-yaw": ("yaw", ("yaw: an Endless window shift keeps each obelisk's yaw",)),
    "--drop-pulse-copy": ("pulse", ("pulse: with spawnerModel on every Endless window spawner carries its chunk's pulsePhase",)),
    "--glow-at-centre": ("overlay", ("overlay: the glow is centred on the glow anchor",)),
    "--glow-fixed-reach": ("overlay", ("overlay: facing a side squarely, a wall directly behind the obelisk",)),
    "--overlay-front-reach": ("overlay", ("overlay: an occluder 2 in front of the obelisk under the eye and the HP bar",
                                          "overlay: facing a side squarely, a full-screen occluder 20 in front of the centre")),
    "--no-inside-skip": ("inside,lab", ("inside: 4-18 units from the centre", "lab: walkIn() centres an obelisk")),
    "--see-through-fog": ("fade", ("fade: inside the range every opaque fill is at globalAlpha 1",)),
    "--overlay-in-opaque": ("phase", ("phase: the opaque phase writes the obelisk to depth and draws no billboard",)),
}


def run(*flags):
    result = run_js(SCRIPT, list(flags), timeout=180)
    output = result.stdout + result.stderr
    return output, output.splitlines()


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class SpawnerModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output, cls.lines = run()

    def test_every_spawner_model_check_passes(self) -> None:
        self.assertIn(f"SPAWNER_MODEL_RESULT PASS {EXPECTED} failed 0", self.lines, self.output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in self.lines), self.output)
        self.assertNotIn("SETUP", self.output)
        self.assertTrue(any(line.startswith("NOTE depth ") for line in self.lines), self.output)

    def test_each_mutation_fails_its_named_check(self) -> None:
        for flag, (sections, names) in MUTATIONS.items():
            with self.subTest(mutation=flag):
                output, lines = run(flag, "--sections", sections)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP", output)
                self.assertTrue(any(line.startswith("SPAWNER_MODEL_RESULT FAIL") for line in lines), output)
                failures = [line for line in lines if line.startswith("FAIL ")]
                for name in names:
                    self.assertTrue(any(line.startswith("FAIL " + name) for line in failures),
                                    f"{flag} did not fail '{name}':\n{output}")
                self.assertTrue(any(line.startswith("PASS real manifest loads") for line in lines), output)
                self.assertFalse(any(line.startswith("FAIL no console errors") for line in lines), output)


if __name__ == "__main__":
    unittest.main()
