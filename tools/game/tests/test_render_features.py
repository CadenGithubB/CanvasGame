"""Render-feature registry, G hotkey, texture master, fullscreen sizing and counters.

Risk: the in-game A/B surfaces (Graphics row, G, console, Perf HUD, FPS line)
must switch presentation only. A switch that reassembles the window, draws
from Math.random or changes resolution would make an A/B comparison compare
different worlds. Fullscreen must honour the Resolution setting (V01).

Oracle: render_features.js drives the real MAIN manifest through its real
listeners (render_host.js). Registry validation, the fullscreen size rule
(1920x1080 at 0.75: 640x360 capped to 360 rows, 1440x810 native, 360x240 on
exit) and a 240-tick replay compared with and without G every 30 ticks
(pos, cam, enemies, seed, Math.random draws, chest/spawner records, object
identity, window assemblies). Each mutation below must fail its named check.
Not browser evidence: the lab page's timing and pixel checks run in a browser.
"""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("render_features.js")
EXPECTED = 38


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class RenderFeatureTests(unittest.TestCase):
    def run_harness(self, *flags):
        result = run_js(SCRIPT, list(flags), timeout=240)
        return result.stdout + result.stderr, result.stdout.splitlines()

    def test_registry_surfaces_fullscreen_counters_and_presentation_only_replay(self) -> None:
        output, lines = self.run_harness()
        self.assertIn(f"RENDER_FEATURES_RESULT PASS {EXPECTED} failed 0", lines, output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in lines), output)
        self.assertFalse([line for line in lines if line.startswith("FAIL ")], output)

    def assertMutantFails(self, flag, *checks, replay=False):
        # Mutation runs skip the sections they do not target, to keep the gate short.
        output, lines = self.run_harness(flag, "--skip-lab", *([] if replay else ["--skip-replay"]))
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertNotIn("Exception:", output, output)
        self.assertTrue(any(line.startswith("RENDER_FEATURES_RESULT FAIL") for line in lines), output)
        for name in checks:
            self.assertTrue(any(line.startswith("FAIL " + name) for line in lines), f"{flag} should fail: {name}\n{output}")

    def test_controls_that_keep_keyboard_focus_are_detected(self) -> None:
        self.assertMutantFails("--keep-control-focus",
                               "Graphics row controls release keyboard focus after use")

    def test_g_without_its_page_control_guard_is_detected(self) -> None:
        self.assertMutantFails("--g-ignores-page-controls",
                               "G is ignored when the target is a page control")

    def test_fullscreen_at_viewport_size_is_detected(self) -> None:
        # The pre-fix rule: innerWidth x innerHeight regardless of Resolution.
        self.assertMutantFails("--legacy-fullscreen-size",
                               "entering fullscreen honours resolution and the row cap through the real listener")

    def test_a_preset_switch_that_reassembles_the_window_is_detected(self) -> None:
        self.assertMutantFails("--preset-reassembles",
                               "presentation only: 240 ticks with preset flips",
                               "G never changes resolution, world data or position", replay=True)

    def test_a_preset_switch_that_draws_random_numbers_is_detected(self) -> None:
        self.assertMutantFails("--preset-draws-rng", "presentation only: 240 ticks with preset flips", replay=True)

    def test_counters_that_are_not_reset_each_frame_are_detected(self) -> None:
        self.assertMutantFails("--no-frame-stats-reset",
                               "draw() resets the per-frame counters right after beginSceneDepthFrame")

    def test_a_texture_button_that_only_relabels_is_detected(self) -> None:
        self.assertMutantFails("--texture-button-inert", "Toggle Textures flips USE_TEXTURES and its label")


if __name__ == "__main__":
    unittest.main()
