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
            # Only the probe's own test: the stub hands the baseline the same
            # run, which BaselineVacuityTests covers.
            unittest.TestSuite([cls("test_probe_00")]).run(result)
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


class BaselineVerdictDeclarationTests(unittest.TestCase):
    """A probe that declares FAIL on a check already in its suite's KNOWN_BUGS must pin a detail regex.

    The verdict alone equals the baseline there, so a probe whose mutation
    changed nothing would satisfy it. A partial fix or a BREAK on top of a FIX
    pins the witness its baseline detail lacks; a non-flip declaration beside a
    flip pins the mechanism the check still fails for (the suite's _still).
    """

    def test_every_baseline_equal_fail_declaration_pins_a_detail_regex(self):
        import importlib
        import pkgutil

        import tools.webui.tests as suite_tests

        bare, seen = [], 0
        for info in pkgutil.iter_modules(suite_tests.__path__):
            if not info.name.startswith("test_game_"):
                continue
            mod = importlib.import_module(f"{suite_tests.__name__}.{info.name}")
            known = getattr(mod, "KNOWN_BUGS", None)
            if not known:
                continue
            for attr in ("PROBES", "MOTION_PROBES"):
                for desc, _anchor, _replacement, expect in getattr(mod, attr, None) or []:
                    for cid, spec in expect.items():
                        verdict, regex = game_lab.probe_expectation(spec)
                        if cid in known and verdict == "FAIL":
                            seen += 1
                            if regex is None:
                                bare.append(f"{info.name}.{attr}: {desc[:80]!r} -> {cid[:80]}")
        self.assertGreater(seen, 0, "no suite declares FAIL on a known bug; the scan found nothing to check")
        self.assertEqual([], bare, "FAIL declared on a KNOWN_BUGS check without a detail regex:\n  " + "\n  ".join(bare))


class BaselineVacuityTests(unittest.TestCase):
    """A probe the unmutated game already satisfies proves nothing about its mutation.

    The probe class grades the unmutated suite's run against every probe that
    is not a GUARD or CONTROL; one that run satisfies is reported. The cases
    are the two the fifth October 2026 review found: a FIX of a repair that
    had already shipped (perf's old FIX G6) and a partial-fix witness regex
    that the baseline detail also matched (enemies' old R2-only probe).
    """

    BASE_DETAIL = "42/44 returned; stuck: brute (route failed 93% / pending 2%); scout (route failed 41% / pending 41%)"

    def vacuity(self, probes, baseline_checks, mutated_checks=None):
        def future_of(checks):
            future = Future()
            future.set_result(game_lab.HarnessRun("protocol", [], 0, 0, checks=checks,
                                                  verdicts=["HARNESS_RESULT FAIL 1"]))
            return future
        base, mutated = future_of(baseline_checks), future_of(mutated_checks or baseline_checks)
        calls = []

        def submit(name, args=None, *, js_text=None, timeout=900):
            calls.append(js_text)
            return base if js_text is None else mutated
        with patch.dict(os.environ, {"HW1_GAME_PROBES": "1"}), \
                patch.object(game_lab, "JS_ENGINE", ("test-engine",)), \
                patch.object(game_lab, "game_js", return_value="fixture"), \
                patch.object(game_lab, "submit", side_effect=submit):
            cls = game_lab.probe_testcase("protocol", probes)
            result = unittest.TestResult()
            unittest.TestSuite([cls("test_no_probe_is_satisfied_by_the_unmutated_game")]).run(result)
        self.assertEqual(1, result.testsRun)
        self.assertEqual([], result.skipped)
        self.assertIn(None, calls, "the unmutated suite was never submitted")
        return result

    def test_a_fix_of_a_shipped_repair_is_reported(self):
        result = self.vacuity([("FIX cache: bound the colour cache", "fixture", "mutated", {"cache bounded": "PASS"})],
                              [game_lab.Check("cache bounded", True, "final 2115 <= bound 8192")])
        self.assertEqual(1, len(result.failures))
        self.assertIn("test_probe_00: FIX cache", result.failures[0][1])

    def test_a_witness_regex_the_baseline_matches_is_reported(self):
        probe = ("PARTIAL FIX R2 only", "fixture", "mutated", {"return": ("FAIL", r"stuck: brute [^;]+; scout")})
        result = self.vacuity([probe], [game_lab.Check("return", False, self.BASE_DETAIL)])
        self.assertEqual(1, len(result.failures))
        self.assertIn("already satisfies every declaration", result.failures[0][1])

    def test_a_witness_regex_the_baseline_lacks_is_accepted(self):
        probe = ("PARTIAL FIX R2 only", "fixture", "mutated",
                 {"return": ("FAIL", r"stuck: brute \(route failed \d+% / pending (?:[2-9]\d|100)%")})
        result = self.vacuity([probe], [game_lab.Check("return", False, self.BASE_DETAIL)])
        self.assertTrue(result.wasSuccessful(), result.failures + result.errors)

    def test_one_changed_declaration_is_enough(self):
        # A non-flip declaration beside a flip (the suites' _still) is fine.
        probe = ("FIX hysteresis", "fixture", "mutated",
                 {"jitter": "PASS", "log lines": ("FAIL", r"max \d+ lines")})
        result = self.vacuity([probe], [game_lab.Check("jitter", False, "10 rebuilds"),
                                        game_lab.Check("log lines", False, "max 26 lines")])
        self.assertTrue(result.wasSuccessful(), result.failures + result.errors)

    def test_guard_and_control_probes_may_leave_every_verdict_alone(self):
        checks = [game_lab.Check("jitter", False, "10 rebuilds"), game_lab.Check("walk", True, "0 rebuilds")]
        probes = [("GUARD G3: moved updateChunks, still no hysteresis", "fixture", "mutated",
                   {"jitter": ("FAIL", r"\d+ rebuilds"), "walk": "PASS"}),
                  ("CONTROL: the same offset inside the tolerance", "fixture", "mutated", {"walk": "PASS"})]
        result = self.vacuity(probes, checks)
        self.assertTrue(result.wasSuccessful(), result.failures + result.errors)

    def test_an_unlabelled_control_is_reported(self):
        result = self.vacuity([("Re-centre hysteresis alone: the check stays PASS", "fixture", "mutated",
                                {"walk": "PASS"})], [game_lab.Check("walk", True, "0 rebuilds")])
        self.assertEqual(1, len(result.failures))

    def test_a_precondition_void_is_a_change_from_a_passing_baseline(self):
        result = self.vacuity([("BREAK gate: no subjects", "fixture", "mutated", {"walk": "PRECONDITION"})],
                              [game_lab.Check("walk", True, "0 rebuilds")])
        self.assertTrue(result.wasSuccessful(), result.failures + result.errors)
