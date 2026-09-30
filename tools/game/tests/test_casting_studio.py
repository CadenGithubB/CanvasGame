"""Studio uses actual combat and restores the real world after each draw."""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


class CastingStudioTests(unittest.TestCase):
    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_actual_hit_and_state_restoration(self) -> None:
        result = run_js(Path(__file__).with_name("casting_studio.js"), timeout=120)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        # 89 after S2b; S3 added "studio cycles replay the same New ambient
        # field" (each cycle's fresh pool primes its own field and embers).
        self.assertIn("CASTING_STUDIO_RESULT PASS 90", result.stdout.splitlines())

    def _assert_mutation_fails(self, flag: str, check: str, cause: str = "") -> None:
        result = run_js(Path(__file__).with_name("casting_studio.js"), [flag], timeout=120)
        output = result.stdout + result.stderr
        self.assertNotIn("CASTING_STUDIO_RESULT PASS", output)
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertIn("Error: " + check, output)
        if cause:
            self.assertIn(cause, output)

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_studio_sharing_the_live_effect_pool(self) -> None:
        self._assert_mutation_fails("--studio-shares-pool", "studio installs a fresh pinned effect pool ticked on the studio step")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_studio_pool_that_never_integrates(self) -> None:
        # Every studio step's integration throws and is counted: the tick
        # counter still advances, so only the particle ages reveal it.
        self._assert_mutation_fails("--studio-integrate-throws", "studio particles age on every studio step", '"minAge":0,')

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_studio_motes_drifting_across_cycles(self) -> None:
        # Review S2a: without the per-cycle restore each reset continued from
        # the previous cycle's motes, so casting A/B frames differed.
        self._assert_mutation_fails("--studio-ambient-drift", "studio cycles replay the same legacy ambient motes", '"startSame":false')

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_studio_field_drifting_across_cycles(self) -> None:
        # S3: the ambient field's column draws must come from the pool's own
        # serial; a session-wide serial makes every studio cycle differ.
        self._assert_mutation_fails("--field-global-serial", "studio cycles replay the same New ambient field", '"fieldSame":false')

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_studio_frames_thinned_by_the_governor(self) -> None:
        # T21 render side: a governor that ignores the studio pool's pin would thin
        # studio A/B frames by the live frame time, so they would depend on the machine.
        # The studio pool, relabelled as ambient class, is thinned. S5: the pool
        # also holds 2 impact sparks from the practice cast's contact, and their
        # burst reserves serials, so the 12-particle burst's hashes moved too:
        # 12 of 14 are thinned (S4: 8 of 12).
        self._assert_mutation_fails("--governor-ignores-pinned",
                                    "a studio frame draws the studio pool through the fx stages and the governor never thins it",
                                    '"considered":14,"thinned":12,')

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_studio_thinning_reads_the_raw_governor(self) -> None:
        # Review S2b: thinning must use the frame's pinned governor, not the live one.
        self._assert_mutation_fails("--thin-ignores-pin",
                                    "a studio frame draws the studio pool through the fx stages and the governor never thins it",
                                    '"considered":14,"thinned":12,')   # S5 re-pin: see the test above


if __name__ == "__main__":
    unittest.main()
