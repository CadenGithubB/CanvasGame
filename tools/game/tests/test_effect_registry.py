"""Effect registry: every effect family stays wired through shifts, resets, prunes and the studio."""

from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import sys
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

HARNESS = Path(__file__).with_name("effect_registry.js")
# 72 after S2b; S3 added "resetLevel clears soul orbs, tomes and stat
# pickups from the previous map" (S1b; it replaced the S1 control that
# required them to survive) and "every reset primes the New-mode ambient
# field" (A11's New half). S4 added A14's real enemy death in the crossing
# tick; A4, R3 and I1 changed in place (bones in both modes, the migrated
# set, the producers' events). S5 added A13's contact reader isolation; I1
# also requires a real projectile contact. The S5 fixes added A13's check of
# where a generated-world wall hit starts its debris.
PASS_COUNT = 76
SENTINEL = f"EFFECT_REGISTRY_RESULT PASS {PASS_COUNT}"
SOURCE_ROOT = Path(__file__).resolve().parents[3] / "assets" / "games" / "src"

# Code size (unified effects spec, section 14.3 as amended by Revision 3, the
# user's Q11 answer: size is not a constraint). The per-slice budgets are
# reported, not enforced: the test prints the raw bytes of the unified-effects
# files (the header embeds them byte for byte) plus a fixed allowance for hook
# lines in existing files against the latest slice's reference, and fails only
# above a runaway cap.
EFFECT_FILES = ("02-effect-registry.js", "11-fx-recipes.js", "11-fx-engine.js", "14-fx-render.js")
HOOK_ALLOWANCE_BYTES = 3_000
# The reference printed is the spec's own budget for the latest slice (S8:
# 128 KB; S7's was 125 KB, S6's 118 KB, S5's 112 KB, S4's 106 KB, S3's 96 KB, S2's 84 KB), so the report
# shows the real overrun instead of a reference equal to the measurement. The
# gate stopped being a stop condition with Revision 3 (the user's Q11 answer);
# that decision, not this file, is what waives it. S2's measured size is kept
# separately as the baseline for later slices (section 14.3: "its measured
# size re-baselines the later gates, keeping their increments": S3 +12 KB,
# S4 +10, S5 +6, S6 +6, S7 +7, S8 +3), measured after the S2b review fixes
# (renderer 45,115 B; 39,009 B before them).
SLICE_REFERENCE = ("S8 spec budget", 128_000)
S2_MEASURED_BYTES = 149_994
RUNAWAY_CAP_BYTES = 400_000

# Each mutation must fail its named check; setup failures and crashes do not count.
MUTATIONS = {
    "--registry-skip-chain": "chain arcs keep their world position across a chunk shift",
    "--stat-rebase-xy": "stat pickups stay on their ruin across a chunk shift",
    "--skip-lob-target": "the lob reticle stays on its landing point across a chunk shift",
    "--no-level-reset-bones": "resetLevel clears bone debris from the previous map",
    "--render-prune-only": "chain arcs and novas expire in the simulation with no render",
    "--prune-le-impacts": "registry prune keeps today's exact predicates",
    "--drop-studio-key": "every family is a studio key",
    "--drop-draw2d-decision": "every family states a 2D and a 3D draw decision",
    "--declare-future-stage": "every declared stage exists in renderFrame",
    "--no-malformed-count": "malformed impact records are counted, not silently dropped",
    "--reset-without-prime": "legacy ambient motes survive every reset",
    "--reset-after-assembly": "the world reset never erases what assembly built",
    "--prime-before-assembly": "legacy ambient motes are spawned around the placed player",
    "--drop-pose-coins": "render interpolation groups are the legacy list minus impacts, in order",
    "--chain-no-shape-check": "malformed chain records are counted and left in place at a shift",
    "--late-family-no-studio-key": "every family is a studio key",
    "--unguarded-rebase": "a cosmetic rebase failure never reaches gameplay code",
    # S2a: registry services and the engine's gameplay boundary.
    "--legacy-prime-gameplay-stream": "the legacy ambient init no longer draws from the gameplay random stream",
    "--toggle-no-generation": "a preset switched off fades its particles and refuses new ones in the next tick",
    "--budget-ignores-reserve": "the live budget follows the section 6.1 table",
    "--family-ignores-unified": "a migrated family follows the Unified effects switch",
    "--legacy-rng-per-call": "two legacy calls in one tick draw different values",
    "--unguarded-entry": "a cosmetic tick failure never skips updateExplored",
    "--unguarded-emit": "a throwing fxEmit argument is counted and never aborts its producer",
    "--no-ring-rebase": "effects queued before a window shift land where their event happened",
    "--no-pool-rebase": "live particles and point anchors keep their world position across a shift",
    "--cosmetic-math-random": "particle density, fx toggles and Legacy/New never shift gameplay",
    "--toggle-init-redefines": "re-running the toggle init keeps the registry path and its values",
    "--toggle-listener-twice": "re-running the toggle init keeps the registry path and its values",
    "--gameplay-reads-fx": "no gameplay fragment reads fxState",
    # S3: S1b (the user's Q1 answer) and the engine's New-mode prime.
    "--orbs-survive-level": "resetLevel clears soul orbs, tomes and stat pickups from the previous map",
    "--pickups-survive-level": "resetLevel clears soul orbs, tomes and stat pickups from the previous map",
    "--engine-reset-without-prime": "every reset primes the New-mode ambient field",
    # S4 review: A4's pool half (bones live in the engine pool since S4).
    "--engine-no-level-reset": "resetLevel clears bone debris from the previous map",
    # S5: a projectile contact reader's throw escapes fxEvent into updateProjectiles.
    "--throwing-reader": "a throwing contact reader never reaches gameplay code",
    # S5 fixes: debris placement against a generated world's wall (not the authored grid).
    "--debris-far-side": "a generated-world wall hit starts its debris on the shooter's side of the struck face",
}
# Further checks a mutation must also fail (S4: A14's real enemy death is
# queued before the shift exactly like the S2 test burst).
ALSO_FAILS = {
    "--no-ring-rebase": ["a real enemy death in the crossing tick throws its bones where the enemy died"],
}
# The failure detail must also show the intended cause, not merely the check name.
CAUSES = {
    "--drop-draw2d-decision": "Effect family impacts: missing draw2D decision",
    "--drop-studio-key": '"missing":["a7ProbeFlag","fxState"]',
    "--late-family-no-studio-key": '"missing":["a7LateFlag"]',
    "--legacy-prime-gameplay-stream": '"endless":{"init":',
    "--budget-ignores-reserve": '"B":2880',
    "--unguarded-entry": '"threw":"a13 integrate"',
    "--unguarded-emit": '"threw":"a13 emit option"',
    "--legacy-rng-per-call": '"a":[',
    "--no-pool-rebase": '"particle":480',
    "--toggle-init-redefines": '"failures":1,',
    "--toggle-listener-twice": '"listeners":2,',
    "--gameplay-reads-fx": '"hits":["src/10-combat.js"]',
    # Two real orbs (S4's A4 kills twice: bones in both modes) plus the sentinel.
    "--orbs-survive-level": '"orbs":3,"tomes":0,"stats":0',
    "--pickups-survive-level": '"orbs":0,"tomes":2,"stats":1',
    # The Endless leg specifically: a clean precondition (no pending prewarm)
    # and no prewarm after the world reset.
    "--engine-reset-without-prime": '{"reset":"resetEndlessMode","cleanBefore":true,"prewarm":false',
    # The legacy array is cleared; the seven pool bones of the killed enemy survive.
    "--engine-no-level-reset": '{"bones":0,"poolBones":7}',
    # The contact tick aborts: the shot is never consumed, gameplay differs.
    "--throwing-reader": '"sameHash":false,"reassigned":false,',
    # The point 0.75 u inside the struck cell: no distance to its solid box.
    "--debris-far-side": '"off":0,"towardShooter":false,',
}


def _run(args=()):
    result = run_js(HARNESS, list(args), timeout=120)
    return result.stdout + result.stderr, result.stdout.splitlines()


def _jobs() -> int:
    # dev.py test sets HW1_GAME_JOBS=1: full-game harnesses run one at a time.
    try:
        return max(1, int(os.environ.get("HW1_GAME_JOBS", "1")))
    except ValueError:
        return 1


def _detail(lines, check):
    prefix = "FAIL " + check + " "
    return next(json.loads(line[len(prefix):]) for line in lines if line.startswith(prefix))


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class EffectRegistryTests(unittest.TestCase):
    def test_lifecycle_contracts(self) -> None:
        output, lines = _run()
        self.assertIn(SENTINEL, lines, output)
        self.assertFalse([line for line in lines if line.startswith("SKIP ")], output)
        self.assertEqual(PASS_COUNT, sum(line.startswith("PASS ") for line in lines), output)
        self.assertFalse([line for line in lines if line.startswith("FAIL ")], output)

    def test_mutations_fail_their_named_checks(self) -> None:
        with ThreadPoolExecutor(max_workers=_jobs()) as pool:
            results = dict(zip(MUTATIONS, pool.map(lambda flag: _run([flag]), MUTATIONS)))
        for flag, check in MUTATIONS.items():
            output, lines = results[flag]
            with self.subTest(mutation=flag):
                self.assertNotIn(SENTINEL, lines, output)
                self.assertTrue(any(line.startswith("FAIL " + check) for line in lines), output)
                self.assertTrue(any(line.startswith("EFFECT_REGISTRY_RESULT FAIL ") for line in lines), output)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP ", output)
                self.assertNotIn("ran without an exception", output)
                for other in ALSO_FAILS.get(flag, []):
                    self.assertTrue(any(line.startswith("FAIL " + other) for line in lines), output)
                if flag in CAUSES:
                    self.assertIn(CAUSES[flag], next(line for line in lines if line.startswith("FAIL " + check)), output)
                if flag == "--no-ring-rebase":
                    # Historical defect (review M3): events queued before step() land exactly one shift away.
                    detail = _detail(lines, check)
                    self.assertTrue(detail["crossing"] and all(abs(d - 480) <= 3 for d in detail["crossing"]), output)
                    self.assertTrue(all(d <= 3 for d in detail["still"]), output)
                    # The real death's bones: one shift away when crossing (fewer of
                    # them: 480 u from the camera the distance LOD keeps 0.6), at the
                    # corpse otherwise.
                    death = _detail(lines, ALSO_FAILS[flag][0])
                    self.assertTrue(death["crossing"]["dist"] and all(abs(d - 480) <= 6 for d in death["crossing"]["dist"]), output)
                    self.assertTrue(len(death["still"]["dist"]) == 7 and all(d <= 6 for d in death["still"]["dist"]), output)
                if flag == "--stat-rebase-xy":
                    # Historical defect D20: every crossing, A1's included, leaves each pickup exactly [-480,0] off.
                    detail = _detail(lines, check)
                    self.assertEqual([[-480, 0]], detail["distinct"], output)
                    self.assertIn(0, detail["crossings"], output)

    def test_code_size_report(self) -> None:
        sizes = {name: (SOURCE_ROOT / name).stat().st_size for name in EFFECT_FILES if (SOURCE_ROOT / name).exists()}
        self.assertIn("02-effect-registry.js", sizes)
        total = sum(sizes.values()) + HOOK_ALLOWANCE_BYTES
        name, reference = SLICE_REFERENCE
        verdict = "within" if total <= reference else f"over by {total - reference} B"
        print(f"\nunified effects code: {total} B = {sizes} + {HOOK_ALLOWANCE_BYTES} B hook allowance; "
              f"{name} {reference} B: {verdict}; S2 measured baseline {S2_MEASURED_BYTES} B "
              f"(informational, Revision 3 Q11; fails only above {RUNAWAY_CAP_BYTES} B)", file=sys.stderr)
        self.assertLessEqual(total, RUNAWAY_CAP_BYTES, f"effect code {sizes} + {HOOK_ALLOWANCE_BYTES} B hooks exceeds the runaway cap")


if __name__ == "__main__":
    unittest.main()
