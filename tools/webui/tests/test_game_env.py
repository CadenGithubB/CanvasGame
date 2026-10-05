"""The audit host must preserve Canvas state and fresh per-pass scene depth."""
import re
import unittest

from tools.webui.game_lab import run_harness, suite_testcase
from tools.webui.js_engine import JS_ENGINE

EnvironmentSuite = suite_testcase("env", {}, min_checks=5)


@unittest.skipUnless(JS_ENGINE, "a JavaScript engine is required")
class EnvironmentSensitivityTests(unittest.TestCase):
    def test_missing_canvas_restore_is_detected(self):
        run = run_harness("env", ["--break-canvas-restore"])
        self.assertEqual("HARNESS_RESULT FAIL 1", run.verdict, run.stdout + run.stderr)
        self.assertFalse(run.by_id()["env: nested canvas restore preserves material and alpha"].ok)

    def test_missing_depth_initialization_is_detected(self):
        run = run_harness("env", ["--break-depth-reset"])
        self.assertEqual("HARNESS_RESULT FAIL 3", run.verdict, run.stdout + run.stderr)
        self.assertFalse(run.by_id()["env: prepared pass writes real scene depth"].ok)

    def test_syntax_error_is_not_blamed_on_the_wrong_header_line(self):
        # LAB.load evaluates the page with an indirect eval. For a SyntaxError
        # in the evaluated text jsc reports e.line as the line of that eval
        # call in _game_env.js, not the line of the error, so a load failure
        # used to name a header line that has nothing to do with the error.
        # The load diagnostic may name the error's real line or none at all.
        bad_line = 41
        text = "var probeOk = 1;\n" * (bad_line - 1) + "var probeBroken = ;\n" + "var probeAfter = 2;\n"
        run = run_harness("env", js_text=text)
        self.assertEqual("HARNESS_RESULT FAIL 1", run.verdict, run.stdout + run.stderr)
        self.assertIn("SyntaxError", run.stdout, run.stdout + run.stderr)
        named = [int(n) for n in re.findall(r"header line (\d+)", run.stdout)]
        self.assertTrue(all(n == bad_line for n in named),
                        f"load diagnostic names header line(s) {named}, the error is on line {bad_line}:\n{run.stdout}")

    def test_runtime_error_names_its_header_line(self):
        # Control for the test above: an error THROWN by the page carries its
        # line in the evaluated text, and on jsc the diagnostic must name it.
        throw_line = 23
        text = "var probeOk = 1;\n" * (throw_line - 1) + "throw new Error('probe: page throws');\n"
        run = run_harness("env", js_text=text)
        self.assertEqual("HARNESS_RESULT FAIL 1", run.verdict, run.stdout + run.stderr)
        self.assertIn("probe: page throws", run.stdout, run.stdout + run.stderr)
        named = [int(n) for n in re.findall(r"header line (\d+)", run.stdout)]
        if JS_ENGINE[0] == "jsc":
            self.assertEqual([throw_line], named, run.stdout)
        else:
            self.assertTrue(all(n == throw_line for n in named), run.stdout)
