"""Prop textures (integration stage L, src/12-world-textures.js and the
drawWorldModel sink call in src/12-prop-models.js), propTextures default ON
(flipped after the native magnified-band case passed; OFF in Legacy).

Risk: texturing the chest body and lid (wood, uvScale 14) and the spawner
obelisk's body (stone, uvScale 32, dark wash) must stay a pure colour change,
as the structure textures are (stage E). A prop sink that calls
withSceneDepthClip with other options changes which pixels a face owns and so
the depth every later billboard is tested against; pattern fills not clipped
to the face's integer mask leak onto neighbouring pixels. Props must never
use planar strips (the plan's triangles-only rule), whatever textureMapping
says. They share the frame's primitive budget and counters with the
structure pass: the structure pass draws first, the props continue from the
primitives it used, texBudget is published once, and the flat reason is
counted once per frame. Only the brief's faces are textured (chest wall
slabs' body faces, the lid's lid faces, the obelisk body), never trim,
strap, lock, interior, runes or the translucent mouth, at the brief's tile
lengths (the obelisk's own model UVs are authored at 24, so they are
rescaled). A face drawn at a fade alpha below 1 (the chest and obelisk
range fade) cannot composite its wash and light fills, so it paints the
prepared mean. With propTextures OFF (its default until the flip) every prop
draw must record exactly as on the stage-K tree. With Texture debug on, each
prop face that owns pixels must end with exactly one translucent tint over
its own mask in its path's colour (triangle or mean; a prop is never
tinted as a strip), and no tint may land on a flat prop face or outside the
prop masks.

Oracles (prop_textures.js, real MAIN manifest through render_host.js, an
empty flat world with chests of every tier at magnified-band distances
(25-90 units), a row of four chests and the obelisk at 60 and 150 units, plus
one real Endless draw()): the scene-depth masks themselves and the final
_sceneDepthInv; the recorded 2D-context stream interpreted for clips and
pattern fills; part and role by matching each filled face's world vertices
against faces built with buildModelFaces, with the textured set written out
in the harness; UV scale from geometry (world distance = uvScale x UV
distance); spies on the mapper entry points; the tint path from the sink
spy's outcome and strip count (the debug section, run on every scene plus a
40-primitive budget row, a chest in its range fade band and the obelisk in
its range fade band, with Texture debug off as the control; chest and
obelisk faces must each take both the triangle and the mean path); and
hashes of the prop draws pinned from the stage-K tree before stage L edited
any source.

Headless note: sections that need a catalog give new canvases an opaque
deterministic pixel store, as world_textures.js does. The render-lab module
(tools/game/render-lab/45-prop-textures.js) is smoke-tested: on this host it
must report its pixel checks as SKIP (never a vacuous PASS), pass the depth
and counter checks, and restore everything it touched. The magnified-band
motion case (StructureMotion.runMagnified, tools/game/structure-motion.js) is
a native browser check; its headless contract is in structure_temporal.js.
"""
from pathlib import Path
import re
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("prop_textures.js")
EXPECTED = 42
SCENES = ("common25", "uncommon45open", "rare70", "epic90", "row", "obelisk60", "obelisk150")
# engine -> (kind, scene) -> hash, recorded on the stage-K tree (before stage L
# edited any source) by the same harness: off = Recommended (propTextures did
# not exist; the fixture switches it OFF explicitly, so the flip to default ON
# leaves these pins unchanged), the opaque phase of the chest and spawner models;
# legacy = the Legacy preset's chest and spawner billboards (both phases).
PINNED = {
    "jsc": {
        ("off", "common25"): "c1ca38ba0bcd28a1", ("legacy", "common25"): "8fd9b54afd5eefb0",
        ("off", "uncommon45open"): "5de01b11f1e32965", ("legacy", "uncommon45open"): "2da6895c83b5f018",
        ("off", "rare70"): "20dc7ab068433f81", ("legacy", "rare70"): "ea29325db40941c2",
        ("off", "epic90"): "0295cda2bb1eb906", ("legacy", "epic90"): "bc13579d6b761fe1",
        ("off", "row"): "691b4dbc83dc326f", ("legacy", "row"): "e36845600218a8d5",
        ("off", "obelisk60"): "3f0791a72a88247b", ("legacy", "obelisk60"): "53424fb7ecc4c597",
        ("off", "obelisk150"): "c05d54e6af83c799", ("legacy", "obelisk150"): "9635b3c1c4984c0b",
    },
}
HASH_LINE = re.compile(r"^HASH (off|legacy) (\S+) ([0-9a-f]{16})$")
# flag -> (sections, check-name prefixes that must FAIL)
MUTATIONS = {
    "--props-planar": ("triangles", ("triangles: in hybrid, planar and triangles modes",)),
    "--props-own-budget": ("budget", ("budget: props alone at budget 40", "budget: shared with the structure pass")),
    "--props-any-role": ("faces", ("faces: exactly the chest wall slabs",)),
    "--props-model-uv": ("uv", ("uv: every textured chest face",)),
    # Also the debug check: the obelisk in its fade band is its only mean-path
    # obelisk face, so texturing faded faces leaves the obelisk no mean tint.
    "--props-fade-textured": ("fade,debug", ("fade: a chest inside its range",
                                              "debug: Texture debug on with prop textures on:")),
    "--props-budget-twice": ("counters", ("counters: two prop passes",)),
    "--skip-mask-clip": ("containment", tuple(f"containment: {s}:" for s in SCENES)),
    "--clip-bias-zero": ("coverage", tuple(f"coverage: {s}:" for s in SCENES)),
    "--props-tint-strip": ("debug", ("debug: Texture debug on with prop textures on:",)),
    "--props-no-tint": ("debug", ("debug: Texture debug on with prop textures on:",)),
}


def run(*flags):
    result = run_js(SCRIPT, list(flags), timeout=300)
    output = result.stdout + result.stderr
    return output, output.splitlines()


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class PropTextureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output, cls.lines = run()

    def test_every_prop_texture_check_passes(self) -> None:
        self.assertIn(f"PROP_TEXTURES_RESULT PASS {EXPECTED} failed 0", self.lines, self.output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in self.lines), self.output)
        self.assertNotIn("SETUP", self.output)

    def test_prop_draws_with_prop_textures_off_match_the_stage_k_pins(self) -> None:
        engine = JS_ENGINE[0]
        hashes = {(m.group(1), m.group(2)): m.group(3) for m in map(HASH_LINE.match, self.lines) if m}
        self.assertEqual({(k, s) for k in ("off", "legacy") for s in SCENES}, set(hashes), self.output)
        for scene in SCENES:
            # Non-vacuous: the model path and the Legacy billboards differ.
            self.assertNotEqual(hashes[("off", scene)], hashes[("legacy", scene)], scene)
        if engine not in PINNED:
            self.skipTest(f"no pinned hashes for {engine}; recorded here: {hashes}")
        for key, value in PINNED[engine].items():
            with self.subTest(frame=key):
                self.assertEqual(value, hashes.get(key), f"{key} prop drawing changed. If intended, re-pin with the reason.")

    def test_each_mutation_fails_its_named_check(self) -> None:
        for flag, (sections, names) in MUTATIONS.items():
            with self.subTest(mutation=flag):
                output, lines = run(flag, "--sections", "load," + sections)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP", output)
                self.assertTrue(any(line.startswith("PROP_TEXTURES_RESULT FAIL") for line in lines), output)
                failures = [line for line in lines if line.startswith("FAIL ")]
                for name in names:
                    self.assertTrue(any(line.startswith("FAIL " + name) for line in failures),
                                    f"{flag} did not fail '{name}':\n{output}")
                self.assertTrue(any(line.startswith("PASS load: the real manifest loads") for line in lines), output)

    def test_sections_flag_selects_only_the_named_sections(self) -> None:
        output, lines = run("--sections", "load")
        self.assertIn("PROP_TEXTURES_RESULT PASS 3 failed 0", lines, output)
        self.assertFalse(any("coverage:" in line for line in lines), output)


if __name__ == "__main__":
    unittest.main()
