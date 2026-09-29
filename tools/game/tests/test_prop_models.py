"""Shared model core for props and landmarks (src/12-prop-models.js, stage C).

Risk: every later model port (structures, wall props, chests, spawners, floor
props, landmarks) draws through this one record format and draw path. A wrong
basis puts parts on the wrong side of a ruin or chest; a missing or inward
face lets a player see into a prop; world-anchored UVs make textures crawl
as a prop moves or a lid opens; an inexact back-face cull removes visible
faces; a sink that drops faces would silently lose ruin or structure decor
when those draws are rerouted. Stage C must not change any current pixel.

Oracles (prop_models.js, real MAIN manifest through render_host.js):
hand-written quarter-turn corner tables and hinge positions; authored face
counts; the manifold and outward-winding invariants in world space on both
bases; ruinLocalToWorld/getRuinPostWorld; the chest corner lines of
07-decorations-lighting.js evaluated from source; drawStructureBoxWorld's
captured faces; the production shade globals after updateDayNight at noon,
dusk and night and shadeCaveSurfaceColor; production scene depth with culling
on and off at 8 azimuths x 2 heights (both runs write depth; a camera inside a
hull and cameras within depth 1 of a closed part, front, turned, above and at
a corner, are the exemption controls; gap 3 is culled); the recorded overlay
commands with culling on and off (translucent parts are never culled); every
fill's colour and alpha in one drawWorldModel call against per-face oracles
(material or tint, fog, fade band, base alpha, restore); the wall top pass
formula for up-facing faces; and the recorded fillSceneDepthPolygon inputs
of drawRuins3D (seed 2024's nearest ruin) and drawStructureShellWorld
(fortress, arena, watchtower) against the capture sink. Legacy pixels are
covered by test_render_parity's unchanged pins. Headless: depth and commands,
not browser pixels or timing.
"""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("prop_models.js")
EXPECTED = 34
# flag -> (sections to run, check-name prefixes that must FAIL)
MUTATIONS = {
    "--swap-right-out": ("geometry", ("box corners match the hand-written quarter-turn tables",
                                      "chest adapter (yaw = facing) reproduces")),
    "--drop-face": ("geometry", ("closed parts are manifold",)),
    "--flip-handedness": ("geometry", ("every face winds outward in world space",
                                       "structure adapter (mirrored basis) reproduces")),
    "--world-uv": ("geometry", ("UVs are part-local",)),
    "--invert-cull": ("culling", ("culling on and off leave _sceneDepthInv identical",)),
    "--sink-drops-triangles": ("world", ("sink parity, drawStructureShellWorld",)),
    "--ignore-near": ("culling", ("near plane: a closed part within depth 1",)),
    "--cull-translucent": ("culling", ("translucent closed parts are never culled",)),
    "--shared-anchors": ("culling", ("drawWorldModel returns only the drawn model",)),
    "--clamp-tops": ("world", ("up-facing faces take the wall top pass",)),
    "--no-fade": ("world", ("drawWorldModel paints each face",)),
    "--no-fog": ("world", ("drawWorldModel paints each face",)),
    "--no-tint": ("world", ("drawWorldModel paints each face",)),
    "--wrong-normal-shade": ("world", ("drawWorldModel paints each face",)),
    "--no-alpha-restore": ("world", ("drawWorldModel paints each face",)),
    "--uv-scale-ignored": ("geometry", ("U runs horizontally",)),
}


def run(*flags):
    result = run_js(SCRIPT, list(flags), timeout=180)
    output = result.stdout + result.stderr
    return output, output.splitlines()


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class PropModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output, cls.lines = run()

    def test_every_model_core_check_passes(self) -> None:
        self.assertIn(f"PROP_MODELS_RESULT PASS {EXPECTED} failed 0", self.lines, self.output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in self.lines), self.output)
        self.assertNotIn("SETUP", self.output)

    def test_fixtures_are_substantial(self) -> None:
        notes = [line for line in self.lines if line.startswith("NOTE ")]
        ruin = next(line for line in notes if line.startswith("NOTE ruin view "))
        shells = next(line for line in notes if line.startswith("NOTE shells recorded "))
        self.assertGreaterEqual(int(ruin.split(" recorded ")[1].split()[0]), 30, ruin)
        self.assertGreaterEqual(int(shells.split()[3]), 100, shells)
        self.assertTrue(any(line.startswith("NOTE culling views covered ") for line in notes), notes)

    def test_each_mutation_fails_its_named_check(self) -> None:
        for flag, (sections, names) in MUTATIONS.items():
            with self.subTest(mutation=flag):
                output, lines = run(flag, "--sections", sections)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP", output)
                self.assertTrue(any(line.startswith("PROP_MODELS_RESULT FAIL") for line in lines), output)
                failures = [line for line in lines if line.startswith("FAIL ")]
                for name in names:
                    self.assertTrue(any(line.startswith("FAIL " + name) for line in failures),
                                    f"{flag} did not fail '{name}':\n{output}")
                # The mutation must not crash the harness or break loading.
                self.assertTrue(any(line.startswith("PASS real manifest loads") for line in lines), output)
                self.assertFalse(any(line.startswith("FAIL no console errors") for line in lines), output)

    def test_sections_flag_selects_only_the_named_sections(self) -> None:
        output, lines = run("--sections", "load")
        # Restated in Stage G1: the fragment also registers chestModel (default OFF in G1).
        # Restated in Stage G2: chestModel is default ON and landmarkOpaqueEarly is registered (default ON).
        # Restated in Stage H: spawnerModel is registered (default ON) with one registry listener.
        # Restated in Stage K: modelEarlyReject and decorAnchorCache are registered (default ON; exact switches).
        # Restated in Stage I1: floorPropModels is registered (default OFF in I1; I2 flips it).
        # Restated in Stage I2: floorPropModels is default ON (flipped after the I2 checks).
        # Restated in Stage J1: landmarkModels is registered (default OFF in J1; J2 flips it).
        # Restated in Stage J2: landmarkModels is default ON and landmarkBoundsGate is registered (default ON).
        self.assertIn("PASS the fragment has no load-time DOM, canvas, storage, material or RNG use; "
                      "it only registers modelBackfaceCull, wallPropModels (default ON since F2), "
                      "chestModel and landmarkOpaqueEarly (default ON since G2), spawnerModel (default ON since H), "
                      "modelEarlyReject and decorAnchorCache (default ON since K), floorPropModels (default ON since I2), "
                      "landmarkModels and landmarkBoundsGate (default ON since J2) "
                      "and one registry listener",
                      lines, output)
        self.assertFalse(any("culling on and off" in line for line in lines), output)


if __name__ == "__main__":
    unittest.main()
