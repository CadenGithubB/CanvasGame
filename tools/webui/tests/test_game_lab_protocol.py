"""A mutation must detect its intended defect, not earn credit for broken setup."""
from concurrent.futures import Future
import os
import unittest
from unittest.mock import patch

from tools.webui import game_lab


class MutationVerdictTests(unittest.TestCase):
    def grade(self, checks):
        run = game_lab.HarnessRun("protocol", [], 0, 0, checks=checks,
                                  verdicts=["HARNESS_RESULT FAIL 1"])
        future = Future()
        future.set_result(run)
        # Only the process boundary is stubbed. Run the real generated unittest
        # class, source-anchor replacement and protocol validation.
        with patch.dict(os.environ, {"HW1_GAME_PROBES": "1"}), \
                patch.object(game_lab, "JS_ENGINE", ("test-engine",)), \
                patch.object(game_lab, "game_js", return_value="fixture"), \
                patch.object(game_lab, "submit", return_value=future):
            cls = game_lab.probe_testcase("protocol", [
                ("BREAK contact", "fixture", "mutated", {"contact": "FAIL"})])
            result = unittest.TestResult()
            unittest.defaultTestLoader.loadTestsFromTestCase(cls).run(result)
        self.assertEqual(1, result.testsRun)
        self.assertEqual([], result.skipped)
        return result

    def test_actual_behavior_failure_is_accepted(self):
        result = self.grade([game_lab.Check("contact", False, "projectile crossed the wall")])
        self.assertTrue(result.wasSuccessful(), result.failures + result.errors)

    def test_missing_subjects_cannot_masquerade_as_detection(self):
        result = self.grade([game_lab.Check("contact", False, "PRECONDITION: no projectile spawned")])
        self.assertEqual(1, len(result.failures))
        self.assertIn("setup failed", result.failures[0][1])

    def test_crashed_scenario_cannot_masquerade_as_detection(self):
        result = self.grade([game_lab.Check("contact", False, "projectile crossed the wall"),
                            game_lab.Check("movement: scenario ran to completion", False, "TypeError")])
        self.assertEqual(1, len(result.failures))
        self.assertIn("crashed scenario", result.failures[0][1])

    def test_missing_target_check_cannot_masquerade_as_detection(self):
        result = self.grade([game_lab.Check("unrelated", False, "a different bug")])
        self.assertEqual(1, len(result.failures))
        self.assertIn("got MISSING", result.failures[0][1])
