"""Spell visual archetypes: recipes, glow cache and painters obey depth and state contracts."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

HARNESS = Path(__file__).with_name("spell_visuals.js")
SENTINEL = "SPELL_VISUALS_RESULT PASS 58"


class SpellVisualTests(unittest.TestCase):
    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_archetype_contracts(self) -> None:
        result = run_js(HARNESS, timeout=60)
        lines = result.stdout.splitlines()
        self.assertIn(SENTINEL, lines, result.stdout + result.stderr)
        self.assertEqual(58, sum(line.startswith("PASS ") for line in lines))

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_unclipped_bolts(self) -> None:
        result = run_js(HARNESS, ["--bypass-spell-depth"], timeout=60)
        self.assertNotIn(SENTINEL, result.stdout.splitlines())
        self.assertIn("Error: ice bolt cannot paint through opaque terrain", result.stdout + result.stderr)

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_a_missing_recipe(self) -> None:
        result = run_js(HARNESS, ["--drop-recipe", "ice"], timeout=60)
        self.assertNotIn(SENTINEL, result.stdout.splitlines())
        self.assertIn("Error: every projectile or lob spell, tower and companion bolt has bolt and burst recipes",
                      result.stdout + result.stderr)

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_immortal_bursts(self) -> None:
        result = run_js(HARNESS, ["--burst-ignores-lifetime"], timeout=60)
        self.assertNotIn(SENTINEL, result.stdout.splitlines())
        self.assertIn("Error: ice burst ends at its lifetime and stays deterministic", result.stdout + result.stderr)

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_glow_falls_back_without_a_document(self) -> None:
        result = run_js(HARNESS, ["--glow-no-document"], timeout=60)
        lines = result.stdout.splitlines()
        self.assertIn("PASS glow falls back to flat discs without a document", lines, result.stdout + result.stderr)
        self.assertIn("SPELL_VISUALS_RESULT PASS 55", lines, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
