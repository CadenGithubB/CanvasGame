"""Structure textures in production (src/12-world-textures.js, stages E1 and E2).

Risk: texturing the merged structure model is meant to be a pure colour
change. A textured sink that calls withSceneDepthClip with other options
(the study's depthBias 0) changes which pixels a face owns and so the depth
every later billboard is tested against. Pattern fills that are not clipped to
the face's integer mask leak the owner-mask skirts (2 px) onto neighbouring
pixels. The pass must stay flat, with the reason counted, whenever the canvas
could not texture honestly (texture master off, a debug palette, more rows
than textureMaxRows, a transform, composite, filter or shadow, no catalog).
The primitive budget must never be exceeded and must go to the nearest faces
first. A mapper exception must repaint the face's mean inside the same
callback, keep save/restore balanced and write depth once. The colour must
stay the flat model's brightness. Legacy and the flat model (structureTextures
OFF) must record exactly as before E1.

Stage E2 (restated contract): structureTextures now ships ON in Recommended
(OFF in Legacy), so the load check that pinned it OFF in both presets is
restated; the old risk (the flat model changing) stays covered by the pinned
flat-model and Legacy hashes. E2 also registers the parameters (mapping, tile,
owned edges, budget, max rows, min pixels), which must really drive the pass
from the Graphics row; makes the Texture debug checkbox a per-face path tint
(strip, triangle, mean) that changes colour only; puts the pass's counters on
the HUD render line; and defaults the fullscreen row cap to 360. The
render-lab module (tools/game/render-lab/20-textures.js) that runs the
browser checks S1-S7 is smoke-tested here: on this host it must report the
pixel checks as SKIP (never a vacuous PASS), pass the depth, counter and
control checks, and restore everything it touched.

Stage L flip (restated contract): propTextures ships ON in Recommended, and
prop faces share the frame's counters, the sink and the catalog-retry
listener. The mask-log containment check, the catalog-retry check and the
debug section check the structure pass alone (their face oracle is the
structure pass's mask log), so they switch propTextures OFF and back ON;
the prop faces' containment, tints and budget are prop_textures.js's. Two
names were restated after the flip, with the contract unchanged: the
face-span containment check (it had claimed to cover prop fills too; its
wrapper marks face spans only inside drawStructureModels3D, so it covers the
structure pass, and its pose textures no prop face) and the debug tint check
("every visible face" became "every visible structure face").

Oracles (world_textures.js, real MAIN manifest through render_host.js on the
seed-31337 fortress, four poses): the scene-depth masks themselves (a wrapper
on withSceneDepthClip records every mask's pixel set, count and options, plus
the final _sceneDepthInv), the recorded 2D-context stream interpreted for
clips and pattern fills, spies on the mapper entry points, face geometry
(horizontality from the vertices' z), the flat frame's own fill colours, and
hashes of the flat-model and Legacy frames pinned from the Stage D tree before
E1 edited any source. E2 adds the brief's toggle list written out in the
harness, spies on the mapper options (ownedPixels), a path oracle for the
debug tint (the planar spy's strips and the sink outcome) and HUD lines rebuilt
from the sink spies' per-face outcomes.

Headless note: the host's getImageData returns alpha 0, as in the tools/webui
audit lab, so a real catalog build fails there (counted once per session) and
the audit lab never exercises the textured path. Sections that need a catalog
give new canvases an opaque deterministic pixel store. Commands and pixel
sets, not browser pixels: the browser checks (S1-S7, brightness, timing) run
in the render lab.
"""
from pathlib import Path
import re
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("world_textures.js")
EXPECTED = 69
POSES = ("exterior", "near", "inside")
# engine -> (kind, pose) -> hash. flat = Recommended, structureTextures OFF
# and (restated in Stage F2, when it became default ON) wallPropModels OFF:
# the flat frames pin the structure-model path, unchanged by F2; the modelled
# wall props are covered by wall_decor_driver.js. Restated in Stage G2:
# chestModel and landmarkOpaqueEarly (default ON since G2) are OFF there too,
# so the pins are unchanged; the chest and the pass order are covered by
# chest_model.js and pass_order.js. Restated in Stage H: spawnerModel (default
# ON since H) is OFF there too (the fortress window holds spawners; switching
# it off also strips the window copies' pulsePhase), so the pins are
# unchanged; the obelisk is covered by spawner_model.js.
# Re-pinned in Stage F1 for one named reason: the wall-decoration variant key
# is now the absolute supporting cell, so the fortress window's shields,
# banners and flame sway change once. PINNED_STAGE_D holds the hashes recorded
# on the Stage D tree (before E1 touched 12-structure-models.js); the harness
# reproduces them exactly with --window-relative-variant (the old key restored
# in a copy), so the re-key is the only change.
# Re-pinned at the water-system merge for one named reason: the water system
# (06-water.js, 13-render-water.js; world data plus the water3D pass, not a
# render feature) puts lakes and carved rivers in the fortress window, so
# every flat and Legacy frame changes. PINNED_F1 holds the F1 pins; the
# harness reproduces them exactly with --water-off (the system switched off
# in a copy), so the water system is the only change.
PINNED = {
    "jsc": {
        ("flat", "exterior"): "f0837cf9791adffc", ("legacy", "exterior"): "3249d9b1dcd78aef",
        ("flat", "near"): "d5b3a4c482437104", ("legacy", "near"): "7e56644114e45597",
        ("flat", "inside"): "8aec65d7dac79063", ("legacy", "inside"): "7f5733ab75e78880",
    },
}
PINNED_F1 = {
    "jsc": {
        ("flat", "exterior"): "def546bebcf302a4", ("legacy", "exterior"): "6f478636fd6383a1",
        ("flat", "near"): "7b45d709f38c935b", ("legacy", "near"): "63059ca4b2d3f86b",
        ("flat", "inside"): "c740b084e3e9753d", ("legacy", "inside"): "ebe076600adef801",
    },
}
PINNED_STAGE_D = {
    "jsc": {
        ("flat", "exterior"): "6e820160147d97ad", ("legacy", "exterior"): "4e4e0f28022b5947",
        ("flat", "near"): "c9687148e85334e5", ("legacy", "near"): "bb5f4c09518fdea3",
        ("flat", "inside"): "dc9b5573fed6fa42", ("legacy", "inside"): "e076b7430a8aaf4a",
    },
}
HASH_LINE = re.compile(r"^HASH (flat|legacy) (\S+) ([0-9a-f]{16})$")
# flag -> (sections, check-name prefixes that must FAIL)
MUTATIONS = {
    "--clip-bias-zero": ("coverage", ("coverage: exterior:", "coverage: near:", "coverage: inside:", "coverage: high:")),
    "--skip-mask-clip": ("containment", ("containment: exterior:", "containment: high:")),
    "--ignore-debug-poly": ("engage", ("engage: DEBUG_POLY_TYPES",)),
    "--far-first": ("budget", ("budget exterior 64:", "budget high 64:", "budget high 256:")),
    "--no-fade": ("fade", ("fade: faces at or beyond 0.82 x viewDist",)),
    "--strips-everywhere": ("strips", ("strips: hybrid issues planar strips only on horizontal faces",)),
    "--no-restore-guard": ("failure", ("failure: depth is written once per face",)),
    "--no-luma-norm": ("colour", ("colour: exterior:", "colour: high:")),
    "--ignore-registry": ("registry", ("registry: textureMapping", "registry: textureTile", "registry: textureOwnedEdges",
                                       "registry: textureBudget", "registry: textureMaxRows", "registry: textureMinPixels")),
    "--tint-one-colour": ("debug", ("debug: Texture debug on: every visible structure face",)),
    "--hud-no-counters": ("hud", ("hud: an engaged frame's render line",)),
}


def run(*flags):
    result = run_js(SCRIPT, list(flags), timeout=300)
    output = result.stdout + result.stderr
    return output, output.splitlines()


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class WorldTextureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output, cls.lines = run()

    def test_every_texture_check_passes(self) -> None:
        self.assertIn(f"WORLD_TEXTURES_RESULT PASS {EXPECTED} failed 0", self.lines, self.output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in self.lines), self.output)
        self.assertNotIn("SETUP", self.output)

    def test_fixture_is_the_real_fortress_window_with_four_poses(self) -> None:
        note = next(line for line in self.lines if line.startswith("NOTE fixture seed 31337 fortress"))
        for tag in POSES + ("high",):
            self.assertIn(f'"{tag}@', note)

    def test_flat_model_and_legacy_recordings_match_the_water_merge_pins(self) -> None:
        engine = JS_ENGINE[0]
        hashes = {}
        for line in self.lines:
            match = HASH_LINE.match(line)
            if match:
                hashes[(match.group(1), match.group(2))] = match.group(3)
        self.assertEqual({(k, p) for k in ("flat", "legacy") for p in POSES}, set(hashes), self.output)
        for pose in POSES:
            # Non-vacuous: the flat frame includes the structure model pass.
            self.assertNotEqual(hashes[("flat", pose)], hashes[("legacy", pose)], pose)
        if engine not in PINNED:
            self.skipTest(f"no pinned hashes for {engine}; recorded here: {hashes}")
        for key, value in PINNED[engine].items():
            with self.subTest(frame=key):
                self.assertEqual(value, hashes.get(key), f"{key} drawing changed. If intended, re-pin with the reason.")

    def test_water_off_reproduces_the_stage_f1_pins(self) -> None:
        engine = JS_ENGINE[0]
        if engine not in PINNED_F1:
            self.skipTest(f"no F1 pins for {engine}")
        output, lines = run("--water-off", "--sections", "load,parity")
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertTrue(any(line.startswith("WORLD_TEXTURES_RESULT PASS") for line in lines), output)
        hashes = {(m.group(1), m.group(2)): m.group(3) for m in map(HASH_LINE.match, lines) if m}
        self.assertEqual(PINNED_F1[engine], hashes, output)
        self.assertTrue(all(PINNED[engine][key] != value for key, value in hashes.items()),
                        "the water system must change every pinned frame")

    def test_old_variant_key_reproduces_the_stage_d_pins(self) -> None:
        engine = JS_ENGINE[0]
        if engine not in PINNED_STAGE_D:
            self.skipTest(f"no Stage D pins for {engine}")
        # Stage D predates the water system, so it is switched off too.
        output, lines = run("--window-relative-variant", "--water-off", "--sections", "load,parity")
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertTrue(any(line.startswith("WORLD_TEXTURES_RESULT PASS") for line in lines), output)
        hashes = {(m.group(1), m.group(2)): m.group(3) for m in map(HASH_LINE.match, lines) if m}
        self.assertEqual(PINNED_STAGE_D[engine], hashes, output)
        self.assertTrue(all(PINNED_F1[engine][key] != value for key, value in hashes.items()),
                        "the re-key must change every pinned frame")

    def test_each_mutation_fails_its_named_check(self) -> None:
        for flag, (sections, names) in MUTATIONS.items():
            with self.subTest(mutation=flag):
                output, lines = run(flag, "--sections", "load," + sections)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP", output)
                self.assertTrue(any(line.startswith("WORLD_TEXTURES_RESULT FAIL") for line in lines), output)
                failures = [line for line in lines if line.startswith("FAIL ")]
                for name in names:
                    self.assertTrue(any(line.startswith("FAIL " + name) for line in failures),
                                    f"{flag} did not fail '{name}':\n{output}")
                self.assertTrue(any(line.startswith("PASS load: the real manifest loads") for line in lines), output)

    def test_sections_flag_selects_only_the_named_sections(self) -> None:
        output, lines = run("--sections", "load")
        self.assertIn("WORLD_TEXTURES_RESULT PASS 7 failed 0", lines, output)
        self.assertFalse(any("coverage:" in line for line in lines), output)


if __name__ == "__main__":
    unittest.main()
