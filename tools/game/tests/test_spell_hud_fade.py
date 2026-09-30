"""The spell HUD panel fades when idle and returns when it matters."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

CHECK_COUNT = 10
PASS_RESULT = f"SPELL_HUD_RESULT PASS {CHECK_COUNT}"
HARNESS = Path(__file__).with_name("spell_hud_fade.js")


class SpellHudFadeTests(unittest.TestCase):
    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_panel_visibility_follows_spell_activity(self) -> None:
        result = run_js(HARNESS, timeout=120)
        lines = result.stdout.splitlines()
        self.assertIn(PASS_RESULT, lines, result.stdout + result.stderr)
        self.assertEqual(CHECK_COUNT, sum(line.startswith("PASS ") for line in lines))

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_permanent_spell_panel(self) -> None:
        result = run_js(HARNESS, ["--always-show-spell"], timeout=120)
        self.assertNotIn(PASS_RESULT, result.stdout.splitlines())
        self.assertIn("Error: idle panel fades after its hold instead of staying on screen", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
