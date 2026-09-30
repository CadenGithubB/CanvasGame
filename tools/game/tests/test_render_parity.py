"""Legacy recording reference for the 3D integration.

Risk: every integration stage must leave the Legacy preset drawing exactly what
the game drew before integration, so pressing G compares against the real
reference. render_parity.js hashes every 2D-context call and state set of one
renderFrame() under Legacy (coordinates rounded to 1e-3) at three seeded scenes:
Cave Test 12345's entrance view, an Endless seed whose spawn window holds a
fortress (proposed by the region rule, confirmed by generation), and seed
2024's market with its nearest ruin.

The pins were recorded on the Stage B sources and are identical to the
pre-registry (Stage A) sources run through the same harness. A stage that
changes Legacy drawing on purpose re-pins here, naming the reason.

Re-pinned in Stage F1 for one named reason: getWallDecorationVariant now keys
on the absolute supporting cell (window-local worldX/Y plus windowOrigin)
instead of window-relative gridX/Y, a bug fix that stops Endless heraldry and
torch/sconce flame sway re-rolling when the window re-centres. All three
scenes are Endless windows with wall props in view, so shield/banner colours
and motifs and the flame phase change once. test_old_variant_key_reproduces_
the_stage_b_pins restores the old key in a copy and must reproduce the Stage B
pins exactly, proving the re-key is the only Legacy change.

Re-pinned at the held-staff merge for one named reason: the spell HUD fade
(15-render-hud-menu.js) draws the lower-right spell panel at spellHudAlpha and
then resets globalAlpha to 1. All three scenes record inside the fade's 2.5 s
hold, so the panel draws exactly as before plus that one reset (one more entry
per scene). test_pre_fade_spell_panel_reproduces_the_f1_pins drops the reset in
a copy and must reproduce the F1 pins exactly, proving the fade is the only
Legacy change; the Stage B check drops it too, so its pins stay Stage B's.
Re-pinned at the water-system merge for one named reason: the water system
(06-water.js, 13-render-water.js) is world data plus a water3D pass. It solves
lakes and rivers once per window build, carves river channels into the ground,
recolours the ground under and beside the water, and draws the translucent
surfaces in water3D; all three scenes are Endless windows with water in them.
It is not a render feature, so Legacy draws it too. test_water_off_reproduces_
the_held_staff_pins starts the same scenes with the system switched off
(--water-off) and must reproduce the held-staff pins exactly, proving the water
system is the only Legacy change; the F1 and Stage B checks run with it off too.
Floating-point libm results can differ between engines, so pins are per engine;
an engine without pins skips only the pin comparison, not the other checks.
Commands, not pixels: this is not browser evidence.
"""
from pathlib import Path
import re
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("render_parity.js")
SCENES = ("cave-12345-entrance", "endless-fortress-window", "endless-2024-market-ruin")
# engine -> scene -> (seed, hash, entries). Re-pinned at the water-system
# merge (lakes, carved rivers and the water3D pass; see the module docstring).
PINNED = {
    "jsc": {
        "cave-12345-entrance": (12345, "8afd10d0b6544016", 47297),
        "endless-fortress-window": (10, "64fa8e6fdf06080f", 38402),
        "endless-2024-market-ruin": (2024, "e449ccdbde250d16", 41921),
    },
}
# The held-staff pins (spell HUD fade's trailing globalAlpha reset): what the
# sources draw with the water system switched off (--water-off).
PINNED_STAFF = {
    "jsc": {
        "cave-12345-entrance": (12345, "a2846b6639f29d55", 45457),
        "endless-fortress-window": (10, "59b005323245c01d", 38400),
        "endless-2024-market-ruin": (2024, "69d42ca9feffe42b", 41815),
    },
}
# The F1 pins, recorded 2026-09-27 (absolute-cell wall-decoration variant key):
# what the sources draw without the spell HUD fade's trailing reset (and with
# the water system off).
PINNED_F1 = {
    "jsc": {
        "cave-12345-entrance": (12345, "dcae7150a4f55ab8", 45456),
        "endless-fortress-window": (10, "406730de668112dd", 38399),
        "endless-2024-market-ruin": (2024, "35d427a7a77d8b55", 41814),
    },
}
# The Stage B pins: what the sources draw with the pre-F1 window-relative key
# (and without the spell HUD fade's trailing reset).
PINNED_STAGE_B = {
    "jsc": {
        "cave-12345-entrance": (12345, "c74f660959f29773", 45456),
        "endless-fortress-window": (10, "f3cf5ecbe3449030", 38401),
        "endless-2024-market-ruin": (2024, "87fdbe9153f30bf2", 41793),
    },
}
SCENE_LINE = re.compile(r"^SCENE (\S+) seed (\d+) hash ([0-9a-f]{16}) entries (\d+)$")


def run(*flags):
    result = run_js(SCRIPT, list(flags), timeout=180)
    lines = result.stdout.splitlines()
    scenes = {}
    for line in lines:
        match = SCENE_LINE.match(line)
        if match:
            scenes[match.group(1)] = (int(match.group(2)), match.group(3), int(match.group(4)))
    return result.stdout + result.stderr, lines, scenes


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class RenderParityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output, cls.lines, cls.scenes = run()

    def test_scenes_have_prerequisites_and_record_deterministically(self) -> None:
        self.assertTrue(any(line.startswith("RENDER_PARITY_RESULT PASS 10 failed 0") for line in self.lines), self.output)
        self.assertEqual(set(SCENES), set(self.scenes), self.output)
        self.assertFalse([line for line in self.lines if line.startswith("FAIL ")], self.output)

    def test_legacy_recordings_match_the_pinned_reference(self) -> None:
        engine = JS_ENGINE[0]
        if engine not in PINNED:
            self.skipTest(f"no pinned Legacy hashes for {engine}; recorded here: {self.scenes}")
        for scene in SCENES:
            with self.subTest(scene=scene):
                self.assertEqual(PINNED[engine][scene], self.scenes.get(scene),
                                 f"Legacy drawing changed at {scene}. If intended, re-pin with the reason.")

    def test_water_off_reproduces_the_held_staff_pins(self) -> None:
        engine = JS_ENGINE[0]
        if engine not in PINNED_STAFF:
            self.skipTest(f"no held-staff pins for {engine}")
        output, lines, dry = run("--water-off")
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertTrue(any(line.startswith("RENDER_PARITY_RESULT PASS 10 failed 0") for line in lines), output)
        for scene in SCENES:
            with self.subTest(scene=scene):
                self.assertEqual(PINNED_STAFF[engine][scene], dry.get(scene), output)
                self.assertNotEqual(dry[scene][1], self.scenes[scene][1], "the water system must change this scene")

    def test_pre_fade_spell_panel_reproduces_the_f1_pins(self) -> None:
        engine = JS_ENGINE[0]
        if engine not in PINNED_F1:
            self.skipTest(f"no F1 pins for {engine}")
        # The F1 pins predate the water system too, so it is switched off.
        output, lines, pre_fade = run("--pre-fade-spell-panel", "--water-off")
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertTrue(any(line.startswith("RENDER_PARITY_RESULT PASS 10 failed 0") for line in lines), output)
        for scene in SCENES:
            with self.subTest(scene=scene):
                self.assertEqual(PINNED_F1[engine][scene], pre_fade.get(scene), output)
                self.assertNotEqual(pre_fade[scene][1], PINNED_STAFF[engine][scene][1], "the spell HUD fade must change this scene")

    def test_old_variant_key_reproduces_the_stage_b_pins(self) -> None:
        engine = JS_ENGINE[0]
        if engine not in PINNED_STAGE_B:
            self.skipTest(f"no Stage B pins for {engine}")
        # Stage B predates the spell HUD fade and the water system, so its
        # trailing reset is dropped and the water system is off too; the re-key
        # is then compared with the F1 pins, which also lack both.
        output, lines, old = run("--window-relative-variant", "--pre-fade-spell-panel", "--water-off")
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertTrue(any(line.startswith("RENDER_PARITY_RESULT PASS 10 failed 0") for line in lines), output)
        for scene in SCENES:
            with self.subTest(scene=scene):
                self.assertEqual(PINNED_STAGE_B[engine][scene], old.get(scene), output)
                self.assertNotEqual(old[scene][1], PINNED_F1[engine][scene][1], "the re-key must change this scene")
                self.assertNotEqual(old[scene][1], PINNED_STAFF[engine][scene][1], "the re-key must change this scene")

    def test_one_changed_wall_colour_changes_every_scene_hash(self) -> None:
        output, lines, mutated = run("--wall-colour-plus-one")
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertEqual(set(SCENES), set(mutated), output)
        for scene in SCENES:
            with self.subTest(scene=scene):
                self.assertEqual(self.scenes[scene][0], mutated[scene][0], "same scene seed")
                self.assertNotEqual(self.scenes[scene][1], mutated[scene][1], output)


if __name__ == "__main__":
    unittest.main()
