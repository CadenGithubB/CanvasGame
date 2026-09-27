"""Player-visible chest and enemy regressions using production subsystems."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class SpatialConsumerTests(unittest.TestCase):
    def test_authored_and_seeded_consumers_in_both_views(self) -> None:
        result = run_js(Path(__file__).with_name("spatial_consumers.js"), timeout=120)
        lines = result.stdout.splitlines()
        self.assertIn("SPATIAL_CONSUMERS_RESULT PASS 75", lines, result.stdout + result.stderr)
        self.assertEqual(75, sum(line.startswith("PASS ") for line in lines))

    def test_historical_consumer_defects_are_detected(self) -> None:
        cases = {
            "--legacy-chest-offer": "2D roof-separated chest is not offered",
            "--legacy-chest-collect": "2D stale chest target cannot pay after player moves",
            "--stale-window-chest": "2D obsolete window chest cannot pay at identical local coordinates",
            "--legacy-enemy-chase": "2D cave enemy does not chase through roof",
            "--legacy-enemy-melee": "2D roof blocks melee despite close XY",
            "--stale-strike-recipient": "2D new closer ally cannot authorize stored player strike through roof",
            "--omit-wall-closure": "seed 5668 2D generated wall closure blocks at the actual face",
        }
        for flag, assertion in cases.items():
            with self.subTest(mutation=flag):
                result = run_js(Path(__file__).with_name("spatial_consumers.js"), [flag], timeout=120)
                output = result.stdout + result.stderr
                self.assertNotIn("SPATIAL_CONSUMERS_RESULT PASS ", output)
                self.assertNotIn("MUTATION ANCHOR", output)
                self.assertIn("Error: " + assertion, output)


if __name__ == "__main__":
    unittest.main()
