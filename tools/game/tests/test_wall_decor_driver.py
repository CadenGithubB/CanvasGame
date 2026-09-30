"""drawWallDecorations(phase) with wall-prop models (integration stages F1, F2).

Risk: the flat wall-torch sprite is painted as one constant-depth quad, so at
grazing angles half of it is clipped by its own wall, and its anchor is
clamped onto the screen (renderX), so a torch at the left edge is drawn
shifted. The modelled torch must be depth-correct at the attachment frame,
keep its flame a billboard in the overlay phase and keep the point lights,
and cost fewer depth-tested pixels than the quad. The variant (heraldry and
flame sway) must not re-roll when the Endless window re-centres.

Oracles (wall_decor_driver.js, real MAIN manifest through render_host.js):
the torch authored from the F1 spec in the test and projected with the
camera's pinhole formula (exact painted-pixel sets at anchor x = -20 and
-45); an authored wall plane and nearer occluders written with
writeSceneDepthPolygon (both halves >= 99% visible from 56 to 80 degrees; the
sprite control loses more than half a side; an occluder hides torch and
flame); the unchanged point lights; counted depth-test pixels against the
24 x size_px^2 flat-quad baseline and the measured sprite; synthetic chunk
records at window slots 0-2, the pre-F1 key at window origin 0, and a real
Endless window re-centred by one chunk. Headless depth and commands, not
browser pixels or timing: the render lab (render-lab/30-wall-props.js) runs
the grazing captures and A/B/B/A timing.

Fixes round 1 (F1 verifier): the flame's body must stay >= 95% visible in
each half from 56 to 80 degrees against its own wall (it was about 25-30% on
the wall side: the flame is ~0.6 S wide but hangs 2.2 out), without a real
nearer occluder showing it: a panel 1.0 out on the camera side hides the
folded half (one 0.3 out does not) and a camera-facing occluder hides it
all. Cave shading, the distance fade and the behind-the-wall-plane skip now
have checks of their own, so removing any of them fails a named check.

Fixes round 2 (F1 verifier): the absolute-cell variant key adds the window
origin only in Endless mode. The origin is not reset when a normal level
starts, so after an Endless session every fixed-level decoration re-rolled
(Legacy too). The origin-0 reference is joined by a stale-origin check and by
the real sequence (Endless, then ENDLESS_MODE false and resetLevel(1)), both
against the pre-F1 key. The model cull's flame term now follows the live
projection (the billboard's world width scales with projScale / (0.5 w
invTanHalf)): a torch swept across the right screen edge at 4:3, 1:1,
portrait 240x400 and dash FOV is never culled while any of its flame
billboard is on screen.

Stage F2 (sconce, shield and banner models; wallPropModels default ON).
Restated contracts: the spec check "registered default OFF (stage F1) and OFF
in Legacy; only torches have a model yet" is now "default ON (stage F2) and
OFF in Legacy; all four types have models" (the default flip); the lab smoke's
"30 faces per modelled torch" is now "faces = the drawn models' face counts"
(other types are modelled now); the edge, oblique, phase, flame and work
checks now cover every modelled type (the torch-only rows are kept inside).
The old risk stays covered: Legacy draws the sprite path (render_parity pins
unchanged), and the sconce sprite's commands equal the pre-F2 inline recipe.
New risks: the shield/banner layout drifting from the sprite (the parts are
built from the sprite's own recorded fills and paths); heraldry painted over
by its own face (the decal is 0.1 proud, inside the 0.15 depth bias, so it
must be drawn after the face: per-pixel last-painter ownership); the wrong
heraldry family; the sconce drawing the torch's flame; and a banner cloth
inside a farther torch flame's fold plane (0.5 out plus the 0.15 bias), which
is why the cloth stands 0.7 out instead of the spec's 0.4.

Merge with the unified effects system (codex/particle-system): its torch glow
fades by a five-sample corona depth test at the point light, which stays 0.5
out at flameZ, while the modelled shaft top spans 0.8-3.6 out just 1.3 below
it. From in front and below the torch's own fixture hid the light (1-3 of 5
samples passed, the centre never). With wallPropModels on the corona now
tests the visible flame (2 out, 2 up of the light, where embers leave it).
The glow section checks that point by the harness's own projection and by
segment tests against the authored part boxes, a camera-facing occluder as a
negative control, and that sprite torches keep the test at the light. 38 ->
41 checks: the three glow checks.

Merge fix (sconce glow): sconce lights share the torch's kind, so the point
applied to them too, but a sconce's light is 1 above its bowl rim and the
bowl hides the flame's base from below: from the lower poses (the flat-floor
eye is about 78 below the light) the torch's point was behind the rim, and
the glow faded to 1-3 of 5 samples while most of the flame showed. Lights
now carry their own test point (glowOut, glowUp); a sconce tests its flame
body's centre (bowl axis, 0.19 S above the rim). Two sconce checks over 27
poses: segment tests against the authored sconceParts(), the sprite control
and the occluder. 41 -> 43 checks.
"""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("wall_decor_driver.js")
EXPECTED = 43
# flag -> (sections to run, check-name prefixes that must FAIL)
MUTATIONS = {
    "--clamp-model": ("edge", ("edge: anchor near x = -20: painted pixels are exactly",)),
    "--anchor-cull": ("edge", ("edge: anchor at x = -45",)),
    "--window-key": ("variant", ("variant: the same chunk record at window slots 0, 1 and 2",
                                 "variant: re-centring a real Endless window")),
    "--flame-in-opaque": ("phase", ("phase: the opaque phase writes the model parts to depth and draws no flame",)),
    "--no-flame-fold": ("oblique", ("oblique: the flame keeps both halves of its body",)),
    "--fold-at-anchor": ("oblique", ("oblique: negative control, a panel standing 1.0 out",)),
    "--flame-bias": ("oblique", ("oblique: negative control, a camera-facing occluder",)),
    "--no-cave": ("model", ("model: cave shading",)),
    "--no-fade": ("model", ("model: distance fade",)),
    "--draw-behind": ("model", ("model: not drawn from behind its wall plane",)),
    "--no-endless-gate": ("variant", ("variant: on a fixed level (ENDLESS_MODE false) a stale Endless window origin",
                                      "variant: a normal level started after an Endless session")),
    "--fixed-flame-cull": ("edge", ("edge: the model cull keeps every on-screen part of the flame billboard",)),
    # Stage F2
    "--decal-first": ("decal", ("decal: the heraldry is drawn after its face",)),
    "--heraldry-fixed": ("spec", ("spec: wallPropModels is default ON (stage F2)",
                                  "spec: shields and banners are the sprite's own recorded layout")),
    "--sconce-torch-flame": ("phase", ("phase: each flame-bearing model draws its own sprite recipe",)),
    "--cloth-at-0.4": ("oblique", ("oblique: a nearer banner's cloth (0.7 out) hides a farther torch's folded flame",)),
    # Merge with the unified effects system
    "--glow-at-light": ("glow", ("glow: with wall prop models on, the unified torch glow's corona tests the visible flame",)),
    "--glow-flame-always": ("glow", ("glow: with wall prop models off (sprite torch, no prop depth) the corona still tests the light itself",)),
    "--glow-sconce-torch-point": ("glow", ("glow: a modelled sconce's corona tests its flame body's centre",)),
    "--glow-flame-depth-distance": ("glow", ("glow: with wall prop models on, the unified torch glow's corona tests the visible flame",)),
}


def run(*flags):
    result = run_js(SCRIPT, list(flags), timeout=180)
    output = result.stdout + result.stderr
    return output, output.splitlines()


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class WallDecorDriverTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output, cls.lines = run()

    def test_every_driver_check_passes(self) -> None:
        self.assertIn(f"WALL_DECOR_DRIVER_RESULT PASS {EXPECTED} failed 0", self.lines, self.output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in self.lines), self.output)
        self.assertNotIn("SETUP", self.output)

    def test_fixtures_are_substantial(self) -> None:
        notes = [line for line in self.lines if line.startswith("NOTE ")]
        for prefix in ("NOTE edge -20 ", "NOTE edge -45 ", "NOTE edge cull ", "NOTE oblique model halves ", "NOTE oblique sprite quad ",
                       "NOTE oblique flame halves ", "NOTE oblique flame panel ",
                       "NOTE work ", "NOTE lab ", "NOTE edge -20 sconce ", "NOTE edge -20 shield ", "NOTE edge -20 banner ",
                       "NOTE spec heraldic ", "NOTE oblique banner fold ", "NOTE phase four props ", "NOTE phase recipes ",
                       "NOTE decal ", "NOTE glow ", "NOTE glow sconce "):
            self.assertTrue(any(line.startswith(prefix) for line in notes), (prefix, notes))

    def test_each_mutation_fails_its_named_check(self) -> None:
        for flag, (sections, names) in MUTATIONS.items():
            with self.subTest(mutation=flag):
                output, lines = run(flag, "--sections", sections)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP", output)
                self.assertTrue(any(line.startswith("WALL_DECOR_DRIVER_RESULT FAIL") for line in lines), output)
                failures = [line for line in lines if line.startswith("FAIL ")]
                for name in names:
                    self.assertTrue(any(line.startswith("FAIL " + name) for line in failures),
                                    f"{flag} did not fail '{name}':\n{output}")
                self.assertTrue(any(line.startswith("PASS real manifest loads") for line in lines), output)
                self.assertFalse(any(line.startswith("FAIL no console errors") for line in lines), output)


if __name__ == "__main__":
    unittest.main()
