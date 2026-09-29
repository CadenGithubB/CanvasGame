"""Shipping depth/anchor regressions for the actual loot draw paths.

Restated in stage G1 (chest model): the pinned PASS count is 61 (was 56).
The seven chest painter-order checks and --invert-chest-side now run the
legacy chest path explicitly (chestModel off) and are renamed "legacy chest
painter order: ..."; their contract is unchanged. The legacy hidden, doorway,
slope and near-plane chest checks also run with chestModel off, unchanged.
Five model-path cases were added: the hidden chest is restated from "paints
nothing and clips >= 12" to "every emitted face (those surviving the back-face
cull) and billboard (halo, sparkle, 4 epic particles, label) is rejected and
nothing paints"; the doorway keeps the chest and its two-line label; faces
have distinct corner depths and write depth; the foreground slope; and the
near-plane chest still draws. --omit-loot-depth is unchanged.

Restated in stage H (spawner model): the pinned PASS count is 65 (was 61).
Restated in stage K (modelEarlyReject, default ON): 67. The hidden chest and
hidden obelisk checks run their per-face rejection with the switch off
(contracts unchanged, renamed) and gain an on case: the hidden model builds no
faces (counted early rejects) while its billboards are still depth-tested.
The generic loop's spawner case runs the legacy spawner path explicitly
(spawnerModel off) and is renamed "legacy spawners ..."; its contracts,
including "transparent bounds do not write opaque depth" at (180,150), are
unchanged. Four model-path cases were added: the hidden obelisk rejects every
emitted face and its glow, eye and HP bar; the doorway keeps it; the bounds
check is restated at a pixel analytically outside the obelisk (every obelisk
point lies inside the r = 25 hit cylinder) that lies in the glow's painted
bounds and keeps no depth; and the body now writes depth at (180,150).
In H fix round 1 the glow's test depth became the deepest body point under
it + 0.4 (not a fixed centre + 25.5), so that check finds the glow clip as
the first of the three overlay billboards instead of by 'depth > 145'; the
count and the contract are unchanged.
"""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


class LootVisibilityTests(unittest.TestCase):
    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_loot_depth_support_and_partial_chests(self) -> None:
        result = run_js(Path(__file__).with_name("loot_visibility.js"), timeout=40)
        self.assertIn("LOOT_VISIBILITY_RESULT PASS 67", result.stdout.splitlines(), result.stdout + result.stderr)
        self.assertEqual(67, sum(line.startswith("PASS ") for line in result.stdout.splitlines()))

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_visibility_mutation_is_detected(self) -> None:
        result = run_js(Path(__file__).with_name("loot_visibility.js"), ["--omit-loot-depth"], timeout=40)
        self.assertNotIn("LOOT_VISIBILITY_RESULT PASS 67", result.stdout.splitlines())
        self.assertIn("Error: coins including glow and label cannot paint through solid roof", result.stdout + result.stderr)


    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_inverted_chest_side_is_detected(self) -> None:
        # Restores the historical chest-minus-camera vector in the evaluated copy only.
        result = run_js(Path(__file__).with_name("loot_visibility.js"), ["--invert-chest-side"], timeout=40)
        output = result.stdout + result.stderr
        self.assertNotIn("LOOT_VISIBILITY_RESULT PASS 67", result.stdout.splitlines())
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertIn("PASS near-plane chest keeps clipped faces when back corners are behind camera", result.stdout.splitlines())
        self.assertIn("Error: legacy chest painter order: chest viewed from its lock side paints the far back face before the near front face", output)


if __name__ == "__main__":
    unittest.main()
