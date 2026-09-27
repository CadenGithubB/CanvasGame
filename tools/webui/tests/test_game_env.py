"""The audit host must preserve Canvas state and fresh per-pass scene depth."""
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
