"""Routes and memory must change actual behavior under authored obstacles."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class NpcNavigationTests(unittest.TestCase):
    script = Path(__file__).with_name("npc_navigation.js")

    def test_real_navigation_and_lost_target_memory(self):
        result = run_js(self.script, timeout=90)
        output = result.stdout + result.stderr
        self.assertIn("NPC_NAVIGATION_RESULT PASS 46", output)
        self.assertNotIn("FAIL ", output)
        self.assertNotIn("Error:", output)

    def test_plausible_route_and_memory_faults_fail_intended_contracts(self):
        mutations = {
            "--no-route-request": "blocked navigator actually routes around the wall and reaches its goal",
            "--probe-short-body": "seventy unit navigator detours around sixty two unit roof clearance",
            "--unbounded-search": "all actors share one forty eight probe budget per simulation tick",
            "--starve-later-jobs": "round robin planning gives every queued actor real search work",
            "--ignore-goal-storey": "same horizontal goal on disconnected storey cannot complete a false route",
            "--ignore-world-revision": "explicit in place geometry revision discards cached route advice",
            "--ignore-map-replacement": "map replacement discards stale detour and immediately uses newly open direct motion",
            "--omniscient-memory": "hidden target relocation cannot rewrite last seen coordinates or steer pursuit",
            "--endless-memory": "lost target memory expires at its simulation deadline",
            "--window-local-memory": "last seen world waypoint survives a loaded window origin shift",
            "--keep-dead-memory": "dead remembered recipient cannot remain a pursuit goal",
            "--orphan-disabled-job": "disabling a pending navigator without a movement call cannot orphan its future route",
            "--nearby-storey-is-arrival": "short body below a real cap does not call the nearby upper storey reached",
            "--ignore-active-waypoint-storey": "in place height change at current waypoint replans instead of freezing forever",
            "--arrive-through-wall": "close remembered point behind a thin wall is not falsely considered searched",
            "--arrive-on-other-floor": "nearby remembered point on a different floor does not end lower floor search",
            "--slime-xy-only-follow": "slime follows same XY upstairs owner by walking the authored stairs",
            "--garrison-xy-only-follow": "garrison follows same XY upstairs owner by walking the authored stairs",
            "--follow-jump-height": "slime owner jump on same ground does not create unreachable height searches",
            "--diagonal-height-shortcut": "slime follows same XY upstairs owner by walking the authored stairs",
        }
        for flag, assertion in mutations.items():
            with self.subTest(mutation=flag):
                result = run_js(self.script, [flag], timeout=90)
                output = result.stdout + result.stderr
                self.assertIn("PASS authored route fixture has clear supported start and actually moves", output)
                self.assertIn("FAIL " + assertion, output)
                self.assertRegex(output, r"NPC_NAVIGATION_RESULT FAIL \d+/46")
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("Error:", output)
                self.assertNotIn("Exception:", output)
                self.assertNotIn("SETUP ", output)


if __name__ == "__main__":
    unittest.main()
