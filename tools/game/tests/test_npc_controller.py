"""NPC behavior contracts use real consumers, geometry, and fixed-clock loops."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class NpcControllerTests(unittest.TestCase):
    script = Path(__file__).with_name("npc_controller.js")

    def test_unified_npc_behavior_and_real_loop_replays(self):
        result = run_js(self.script, timeout=90)
        output = result.stdout + result.stderr
        self.assertIn("NPC_CONTROLLER_RESULT PASS 64", output)
        self.assertNotIn("FAIL ", output)
        self.assertNotIn("Error:", output)

    def test_plausible_npc_defects_fail_the_intended_behavior_contracts(self):
        mutations = {
            "--cooldown-stuck": "enemy repeatedly leaves cooldown and lands multiple melee attacks without target leaving range",
            "--stun-can-strike": "stun applied during windup cancels the pending strike",
            "--remote-melee-hit": "remembered ally range cancels impact instead of damaging remote ally or transferring to player",
            "--transfer-windup": "remembered ally range cancels impact instead of damaging remote ally or transferring to player",
            "--removed-target-present": "removed live ally reference immediately loses target eligibility",
            "--list-order-target": "nearest eligible target is independent of friendly array order",
            "--ignore-occlusion": "solid wall prevents target acquisition and attack eligibility",
            "--eighty-ms-movement": "twelve fixed ticks at sixty units per second move exactly twelve units",
            "--think-every-tick": "subsequent perception is bounded and staggered while locomotion stays sixty Hz",
            "--ignore-trait-overrides": "per-creature trait overrides actually suppress movement and melee consumers",
            "--slime-bypasses-solids": "wall inserted after slime launch absorbs swept bolt before enemy",
            "--npc-player-buff-leak": "NPC projectile damage ignores player robes boosts relic rewards and knockback",
            "--tower-legacy-feet": "raised tower aims at body center rather than legacy zero feet field",
            "--lose-streamed-npc-state": "chunk reconstruction preserves stun windup recipient deadline health and spawn flags",
            "--unreachable-melee": "real player collision separation still permits multiple correctly ranged enemy strikes",
        }
        for flag, assertion in mutations.items():
            with self.subTest(mutation=flag):
                result = run_js(self.script, [flag], timeout=90)
                output = result.stdout + result.stderr
                self.assertIn("PASS authored combat fixture has live adjacent opponent and no solid geometry", output)
                self.assertIn("FAIL " + assertion, output)
                self.assertRegex(output, r"NPC_CONTROLLER_RESULT FAIL \d+/64")
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("Error:", output)
                self.assertNotIn("Exception:", output)
                self.assertNotIn("SETUP ", output)


if __name__ == "__main__":
    unittest.main()
