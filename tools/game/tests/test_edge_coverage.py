"""Edge-coverage oracle and fail-closed reporting on non-rasterizing hosts.

These contracts run the production scene-depth mask and TexturePilot, but the
Canvas host never rasterizes. They are not browser pixel evidence; the native
result comes only from the structure study's "Test edge coverage" button.
"""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class EdgeCoverageTests(unittest.TestCase):
    script = Path(__file__).with_name("edge_coverage.js")

    def run_contract(self, *flags):
        result = run_js(self.script, list(flags), timeout=120)
        output = result.stdout + result.stderr
        self.assertEqual(0, result.returncode, output)
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertNotIn("Error:", output)
        self.assertNotIn("Exception:", output)
        self.assertNotIn("SETUP ", output)
        return output

    def test_geometry_oracle_controls_and_vacuous_hosts_never_pass(self):
        output = self.run_contract()
        self.assertIn("EDGE_COVERAGE_RESULT PASS 16", output.splitlines())
        self.assertEqual(16, sum(line.startswith("PASS ") for line in output.splitlines()))
        self.assertNotIn("FAIL ", output)

    def test_plausible_oracle_and_gate_faults_fail_the_intended_contract(self):
        mutations = {
            ("--measure-red-only", "none"):
                "synthetic ideal image measures clean and each single injected defect is found",
            ("--ignore-exterior-leaks", "none"):
                "synthetic ideal image measures clean and each single injected defect is found",
            ("--ignore-occluder-green", "none"):
                "synthetic ideal image measures clean and each single injected defect is found",
            ("--sample-pixel-corners", "none"):
                "sliver owns pixel centres only at the hand derived phases and rows",
            ("--drop-sensitivity-gate", "mask-white"):
                "perfect non antialiased host passes owner-mask cases yet fails sensitivity so the run cannot pass",
            ("--skip-black-base-control", "mask-white"):
                "mask-white host fails the black base control on region colour alone",
            ("--flat-ignores-leaks", "white"):
                "uniform white host fails flat controls through leaked exterior pixels",
        }
        for (flag, host), assertion in mutations.items():
            with self.subTest(mutation=flag):
                output = self.run_contract(flag, "--only-host=" + host)
                self.assertIn("PASS case matrix pairs every owner-mask case with its mask-off twin across both mapping paths", output)
                self.assertIn("FAIL " + assertion, output)
                self.assertRegex(output, r"EDGE_COVERAGE_RESULT FAIL \d+/\d+")


if __name__ == "__main__":
    unittest.main()
