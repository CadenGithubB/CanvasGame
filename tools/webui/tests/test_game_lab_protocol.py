"""A mutation must detect its intended defect, not earn credit for broken setup."""
from concurrent.futures import Future
import os
import unittest
from unittest.mock import patch

from tools.webui import game_lab


class MutationVerdictTests(unittest.TestCase):
    def grade(self, checks, want="FAIL"):
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
                ("BREAK contact", "fixture", "mutated", {"contact": want})])
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

    def test_precondition_expectation_accepts_a_voided_check(self):
        # A GUARD probe that removes a check's subjects declares "PRECONDITION".
        result = self.grade([game_lab.Check("contact", False, "PRECONDITION: no projectile spawned")],
                            want="PRECONDITION")
        self.assertTrue(result.wasSuccessful(), result.failures + result.errors)

    def test_precondition_expectation_rejects_a_detected_defect(self):
        result = self.grade([game_lab.Check("contact", False, "projectile crossed the wall")],
                            want="PRECONDITION")
        self.assertEqual(1, len(result.failures))
        self.assertIn("detected without a PRECONDITION", result.failures[0][1])

    def test_precondition_expectation_rejects_a_pass(self):
        result = self.grade([game_lab.Check("contact", True, "PRECONDITION: no projectile spawned")],
                            want="PRECONDITION")
        self.assertEqual(1, len(result.failures))
        self.assertIn("expected a FAIL on its PRECONDITION, got PASS", result.failures[0][1])

    def test_crashed_scenario_cannot_masquerade_as_detection(self):
        result = self.grade([game_lab.Check("contact", False, "projectile crossed the wall"),
                            game_lab.Check("movement: scenario ran to completion", False, "TypeError")])
        self.assertEqual(1, len(result.failures))
        self.assertIn("crashed scenario", result.failures[0][1])

    def test_missing_target_check_cannot_masquerade_as_detection(self):
        result = self.grade([game_lab.Check("unrelated", False, "a different bug")])
        self.assertEqual(1, len(result.failures))
        self.assertIn("got MISSING", result.failures[0][1])

    def test_detail_regex_expectation_accepts_the_stated_witness(self):
        result = self.grade([game_lab.Check("contact", False, "1/3 stuck: brute@1,2")],
                            want=("FAIL", r"^1/3 stuck: brute@1,2$"))
        self.assertTrue(result.wasSuccessful(), result.failures + result.errors)

    def test_detail_regex_expectation_rejects_the_same_verdict_with_another_witness(self):
        # A partial-fix witness FAILs exactly like the baseline; only the detail
        # can show it left the subjects stuck that its description names.
        result = self.grade([game_lab.Check("contact", False, "2/3 stuck: brute@1,2; scout@5,6")],
                            want=("FAIL", r"^1/3 stuck: brute@1,2$"))
        self.assertEqual(1, len(result.failures))
        self.assertIn("detail does not match", result.failures[0][1])

    def test_detail_regex_expectation_still_requires_the_verdict(self):
        result = self.grade([game_lab.Check("contact", True, "1/3 stuck: brute@1,2")],
                            want=("FAIL", r"^1/3 stuck: brute@1,2$"))
        self.assertEqual(1, len(result.failures))
        self.assertIn("expected FAIL, got PASS", result.failures[0][1])

    def test_malformed_expectation_is_rejected(self):
        with self.assertRaises(game_lab.GameLabError):
            game_lab.probe_expectation(("FAIL",))
        with self.assertRaises(game_lab.GameLabError):
            game_lab.probe_expectation("FIAL")
