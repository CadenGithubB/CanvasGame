"""Statistics and temporary-global/cancellation safety for browser profiling."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

PASS_COUNT = 40


class BrowserProfileTests(unittest.TestCase):
    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_profile_statistics_and_cleanup(self) -> None:
        result = run_js(Path(__file__).with_name("browser_profile.js"), timeout=20)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        lines = result.stdout.splitlines()
        # 32 before the unified effects; S3 added 4 fxState swap checks (the
        # engine path primes and restores its own pinned pool, deterministic
        # priming, cancel after regeneration) and 2 canonical-input checks
        # (the Particles setting and live particle count, with and without
        # the engine). 39 with the merge fix that records the render preset
        # and switches in the canonical inputs. 40 with the merge fix that
        # keeps profile frames out of the live Perf HUD (the job's own sinks).
        self.assertIn(f"BROWSER_PROFILE_RESULT PASS {PASS_COUNT}", lines, result.stdout + result.stderr)
        self.assertEqual(PASS_COUNT, sum(line.startswith("PASS ") for line in lines))


if __name__ == "__main__":
    unittest.main()
