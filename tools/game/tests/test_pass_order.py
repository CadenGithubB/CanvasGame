"""Opaque-first pass order (integration stage G2).

Risk: billboards and sprites do not write depth, so any opaque part painted
after them paints over them wherever it passes the depth test, even when it
is farther. Before G2 the late ruins3D and structures3D stages (after the
enemies, shrines and pickups) drew the ruins' faces and the structure shells,
and sceneEntities drew each family's model faces after the previous family's
sprites. landmarkOpaqueEarly moves the ruin faces and structure shells into
draw()'s new landmarkOpaque3D stage (after caveEntrance3D), leaving the late
stages only their labels, interactables, prompts and sealed ring,
depth-clipped; sceneEntities draws every family's opaque phase before any
overlay phase. Legacy keeps the old order byte for byte.

Oracles (pass_order.js, real MAIN manifest through render_host.js, one real
renderFrame() per scene on an authored flat world): the recorded command
stream interpreted per pixel (the paint log of structure_model_draw.js) and
the depth-tested pixel masks of withSceneDepthClip; a farther part
"overpaints" a nearer pixel when it fills it after the nearer thing did. The
depth order is authored in the scene. Each positive check has a control (the
late order, or the legacy chest) that does overpaint, and a negative control
(the same things moved aside) that shares no pixel. Headless commands and
scene depth, not browser pixels or timing.

Merge of codex/water-system: the water system's water3D stage (translucent,
no depth writes) runs between sceneEntities' two phases: after every opaque
part, so a model standing in water is tinted below the surface instead of
painting over it, and before every billboard and sprite, which it would
otherwise paint over. The "water" section drives the real drawWater3D on an
authored lake with a model chest standing in it and a sprite on its shore.
That order times sceneEntities in two _pt calls (one name) around water3D;
the "timer" section checks, with authored stage costs on the host clock,
that the Perf HUD's stage table still counts it as one call a frame (its
average and max are per frame, as the ring's are), not two half-calls.
Merge fix (frame serial): "same frame" was first keyed on the ring slot,
which only the game loop advances, so every frame the casting studio or the
cave profile drew with the loop stopped merged into one growing call (its
sum became the Perf HUD's all-time max). It is now the rendered frame's
serial. Two more timer checks: three frames drawn without advancing the ring
are three calls, and a frame's simulation ticks (two authored gameUpdate
ticks before each frame) are one call a frame.

Merge fix (dump after a clock that ran ahead): renderFrame's 5 s Perf HUD
breakdown dump compared Date.now() with the last dump time, and a frame drawn
on a clock that ran ahead (the render lab freezes Date.now at 2e12) or a clock
set back left that time in the future, so the live dump never ran again in
the session. renderFrame now pulls a last-dump time that is ahead of the clock
back to it. The "dump" section draws live frames 16 ms and 5.1 s after one
render lab frame, after a clock set back 60 s, and with nothing between (the
control); the dump must run 5.1 s later in each. One check, one mutation.

Merge fix (depth before fx): the unified fx stages depth-test particles
against scene depth, so every pass that writes it must run before them. The
"depth" section counts the scene-depth pixels each top-level stage changes in
Recommended, Legacy and a Custom combination (landmarkOpaqueEarly off): only
draw() writes in Recommended, the late landmark stages also write in the
other two, and no stage from fxCombat3D on writes in any of them.

Restated in stage H: the spawner has a model (spawnerModel, default ON), so
the "calls" check that model-less families record nothing in the opaque
phase runs the spawner's legacy path (spawnerModel off) and is renamed; its
opaque/overlay split is covered by spawner_model.js.
"""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("pass_order.js")
EXPECTED = 36  # Restated in Stage J2: +1 ruin check with the J2 defaults (landmark models, bounds gate); water merge: +3 water checks; merge fixes: +1 timer, +1 depth check; frame serial: +2 timer checks; dump after a clock that ran ahead: +1
# flag -> (sections to run, check-name prefixes that must FAIL)
MUTATIONS = {
    "--late-landmarks": ("ruin,lintel,overlays", (
        "ruin: with landmarkOpaqueEarly the farther ruin post overpaints 0 nearer pixels",
        "lintel: with landmarkOpaqueEarly the legacy shell draws in landmarkOpaque3D",
        "overlays: with landmarkOpaqueEarly, overlays behind a wall are hidden")),
    "--family-order": ("entities", (
        "entities: sceneEntities draws every family's opaque phase before any overlay phase",
        "entities: opaque first, the farther torch model overpaints 0 of the nearer chest overlays")),
    "--overlay-unclipped": ("overlays", ("overlays: with landmarkOpaqueEarly, overlays behind a wall are hidden",)),
    "--water-before-props": ("water", (
        "water: the water3D stage runs after every family's opaque phase and before any overlay phase",
        "water: a model chest standing in the lake writes depth before the water")),
    "--water-after-props": ("water", (
        "water: the water3D stage runs after every family's opaque phase and before any overlay phase",
        "water: a sprite on the near shore draws after the water")),
    "--timer-per-call": ("timer", (
        "timer: the Perf HUD times sceneEntities' two halves (opaque 3 ms, overlay 5 ms) as one 8 ms call a frame",)),
    "--timer-ring-frame": ("timer", (
        "timer: frames drawn while the loop is stopped (casting studio, cave profile: the ring never advances) are one sceneEntities call each",
        "timer: a frame's simulation ticks are one call a frame")),
    "--timer-tick-serial": ("timer", (
        "timer: a frame's simulation ticks are one call a frame",)),
    "--dump-future": ("dump", (
        "dump: after a frame on a clock that ran ahead (the render lab's frozen 2e12) or a clock set back 60 s, the live 5 s breakdown dump still runs",)),
    "--fx-before-late-landmarks": ("depth", (
        "depth: every depth-writing pass runs before fxCombat3D",)),
}


def run(*flags):
    result = run_js(SCRIPT, list(flags), timeout=240)
    output = result.stdout + result.stderr
    return output, output.splitlines()


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class PassOrderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output, cls.lines = run()

    def test_every_pass_order_check_passes(self) -> None:
        self.assertIn(f"PASS_ORDER_RESULT PASS {EXPECTED} failed 0", self.lines, self.output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in self.lines), self.output)
        self.assertNotIn("SETUP", self.output)
        for note in ("NOTE ruin early ", "NOTE lintel early ", "NOTE entities flame: ", "NOTE overlays early ", "NOTE water chest ", "NOTE timer ", "NOTE timer stopped ", "NOTE dump ", "NOTE depth "):
            self.assertTrue(any(line.startswith(note) for line in self.lines), note)

    def test_each_mutation_fails_its_named_check(self) -> None:
        for flag, (sections, names) in MUTATIONS.items():
            with self.subTest(mutation=flag):
                output, lines = run(flag, "--sections", sections)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP", output)
                self.assertTrue(any(line.startswith("PASS_ORDER_RESULT FAIL") for line in lines), output)
                failures = [line for line in lines if line.startswith("FAIL ")]
                for name in names:
                    self.assertTrue(any(line.startswith("FAIL " + name) for line in failures),
                                    f"{flag} did not fail '{name}':\n{output}")
                self.assertTrue(any(line.startswith("PASS real manifest loads") for line in lines), output)
                self.assertFalse(any(line.startswith("FAIL no console errors") for line in lines), output)

    def test_sections_flag_selects_only_the_named_sections(self) -> None:
        output, lines = run("--sections", "calls")
        self.assertTrue(any(line.startswith("PASS calls: ") for line in lines), output)
        self.assertFalse(any(line.startswith(("PASS ruin: ", "PASS lintel: ", "PASS entities: ")) for line in lines), output)
        self.assertTrue(any(line.startswith("PASS_ORDER_RESULT PASS") for line in lines), output)


if __name__ == "__main__":
    unittest.main()
