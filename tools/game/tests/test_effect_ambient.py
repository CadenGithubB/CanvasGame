"""Ambient motes and torch embers on the unified particle engine (slice S3)."""

from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

HARNESS = Path(__file__).with_name("effect_ambient.js")
# 41 at the S3 build; the S3 review fixes added 14: D1 stratum change (3),
# D1 wraps (3), the D4 2D idle, stratum-flag and ember A/B checks (3), D6
# blown sand, D8's weight-transfer mechanism, and D10 composition and
# prewarm (4). D4's selection and fade checks were rewritten in place.
PASS_COUNT = 55
SENTINEL = f"EFFECT_AMBIENT_RESULT PASS {PASS_COUNT}"

# Each mutation must fail every named check; setup failures and crashes do not count.
MUTATIONS = {
    "--lowest-layer-support": ["surface motes above a cave rest on its cap"],
    "--viewer-nearest-only": ["cave motes stay under the cave roof"],
    "--nearest-reference": ["drips end on the cave floor, never on the cap"],
    "--keep-other-stratum": ["members of the other stratum leave within the cull fade when the viewer enters or leaves a cave"],
    "--wrap-under-roof": ["a wrapped cave member stays under the roof of its new column"],
    "--wrap-snap-cleared": ["a wrapped member keeps its height and presents its wrapped position"],
    "--no-fx-rebase": ["the ambient field survives a chunk crossing without mass respawn"],
    "--stale-ambient-max": ["startup population matches the preset"],
    "--budget-at-init-only": ["the ambient field follows the Particles slider live"],
    "--simulate-2d-ambient": ["the ambient field is not simulated in the 2D view"],
    "--ember-first-light": ["embers leave only the flames of the four nearest torches on the viewer floor"],
    "--ember-list-order": ["embers leave only the flames of the four nearest torches on the viewer floor"],
    "--ember-2d-distance": ["embers leave only the flames of the four nearest torches on the viewer floor"],
    "--ember-no-height-window": ["embers leave only the flames of the four nearest torches on the viewer floor"],
    "--ember-two-draws": ["ember alpha fades in from zero at birth over the first 15% of life",
                          "embers are born at age 0 with one life draw"],
    "--embers-in-2d": ["torch embers idle in the 2D view, where they have no form"],
    "--stale-torch-stratum": ["embers take the viewer's stratum from their own tick"],
    "--split-ember-mode": ["every ember A/B shows exactly one ember source"],
    "--ambient-math-random": ["ambient never consumes the gameplay stream"],
    "--dust-life-drift": ["compiled ambient ranges equal the legacy literals"],
    "--double-size-tier": ["the drawn mote radius equals the legacy radius (size tier applied once)",
                           "compiled ambient ranges equal the legacy literals"],
    "--tier-twice-at-draw": ["the drawn mote radius equals the legacy radius (size tier applied once)"],
    "--soft-pulse": ["compiled ambient ranges equal the legacy literals"],
    "--sand-random-direction": ["blown sand drifts one way as legacy sand did (+x, 8-20 u/s)"],
    "--profile-shares-pool": ["the profile primes a fresh pinned pool, never the live one"],
    "--field-global-serial": ["profile priming is deterministic and follows the profile seed"],
    "--profile-seed-ignored": ["profile priming is deterministic and follows the profile seed"],
    "--no-visibility-gate": ["fireflies only at night, sparkle and shimmer only by day"],
    "--gated-drop": ["a hidden member's weight goes to the set's shown members"],
    "--suppress-any-weather": ["fireflies hide in weather above the suppression intensity"],
    "--annulus-spawn": ["the field puts motes in view"],
    "--member-shares-column-noise": ["the field member is independent of where its column landed"],
    "--prewarm-spawn-weights": ["a prewarm starts in the steady-state mix"],
    "--prewarm-drips-at-ceiling": ["prewarmed drips fall from spread heights and land on the cave floor"],
}
# The first named check's failure detail must also show the intended cause.
CAUSES = {
    # Historical defect ambient-4: surface motes buried on the cave floor under the cap.
    "--lowest-layer-support": r'"bad":[1-9]\d*,"first":\[\{[^}]*"id":"ambient\.',
    "--viewer-nearest-only": r'"view":"back spawn"',
    # Ripples land exactly on the cap, not on the cave floor (18 of 19 at seed 12345).
    "--nearest-reference": r'"bad":[1-9]\d+,"first":\[\{"x":[\d.-]+,"y":[\d.-]+,"z":([\d.-]+),"id":"ambient\.dripRipple","floor":[\d.-]+,"cap":\1\}',
    # Old-stratum members still live a cull fade after the flip.
    "--keep-other-stratum": r'"afterFade":\{"same":\d+,"other":[1-9]',
    # Spores wrapped above the authored 30 u roof.
    "--wrap-under-roof": r'"bad":[1-9]\d*,"first":\[\{"id":"ambient\.spore",[^}]*"roof":30,',
    # Every wrap loses its SNAP; the wrap itself is still right.
    "--wrap-snap-cleared": r'"wraps":(\d+),"noSnap":\1,"heightChanged":0,',
    "--no-fx-rebase": r'"kills":([3-9]|\d{2,}),',
    "--stale-ambient-max": r'"target":35,',
    "--budget-at-init-only": r'"at60":25,',
    "--simulate-2d-ambient": r'"members":[1-9]',
    # Only the first eligible light in list order (H) emits.
    "--ember-first-light": r'"perTorch":\{"T1":0,"T2":0,"T3":0,"T4":0,"T5":0,"T6":0,"H":[1-9]',
    # The first four eligible lights in list order: H, T6, T5, T4.
    "--ember-list-order": r'"perTorch":\{"T1":0,"T2":0,"T3":0,"T4":[1-9]\d*,"T5":[1-9]\d*,"T6":[1-9]\d*,"H":[1-9]',
    # 2D distance: the ledge torch H (40 u in 2D) takes T4's slot.
    "--ember-2d-distance": r'"T4":0,"T5":0,"T6":0,"H":[1-9]\d*,"E":0,',
    # No height window: the cave torch E below the floor takes T4's slot.
    "--ember-no-height-window": r'"T4":0,"T5":0,"T6":0,"H":0,"E":[1-9]',
    # Historical defect ambient-7: embers born part-way through their life pop in.
    "--ember-two-draws": r'"poppedIn":[1-9]\d*,',
    "--embers-in-2d": r'"spawnedIn2D":[1-9]',
    "--stale-torch-stratum": r'"flagged":\{"under":0,"surface":[1-9]',
    # Ambient held on Legacy while embers stay New: both sources at once; the lone override is accepted.
    "--split-ember-mode": r'"ab":"ambient held on Legacy","emberMode":"new","engineSamples":[1-9]\d*,"legacySamples":[1-9]\d*\}.*"loneOverride":null',
    "--ambient-math-random": r'"P":0,"draws":(\d+),.*"P":25,"draws":(?!\1,)',
    "--dust-life-drift": r'"id":"ambient\.dust","key":"life","legacy":\[3,7\],"compiled":\[3,8\]',
    # The tier applied to radii that already contain it: drawn at 0.75 of legacy.
    "--double-size-tier": r'"fwd":15,[^}]*"ratio":0\.75\}',
    "--tier-twice-at-draw": r'"fwd":15,[^}]*"ratio":0\.75\}',
    "--soft-pulse": r'"id":"ambient\.firefly","key":"pulse","legacy":\[0,5\],"compiled":\[0\.5,',
    "--sand-random-direction": r'"coherence":0\.[0-7]',
    "--profile-shares-pool": r'"fresh":false,',
    "--field-global-serial": r'"same":false',
    "--profile-seed-ignored": r'"same":true,"otherSeedDiffers":false',
    "--no-visibility-gate": r'"ambient":0\.9,"weather":0,"min":\d+,"max":\d+,"by":\{[^}]*"ambient\.firefly":[1-9]',
    "--gated-drop": r'"wrong":[1-9]',
    # The 0.2 drizzle hides fireflies too.
    "--suppress-any-weather": r'"storm":0,"drizzle":0,',
    "--annulus-spawn": r'"field":\{"share":0\.[0-3]',
    # Spawns on a 4th column always pick sparkle (u is the column's y noise).
    "--member-shares-column-noise": r'"sparkle":0\.(4[4-9]|[5-9])',
    # Spawn weights put drips at 0.45 of a prewarm against about 0.11 live.
    "--prewarm-spawn-weights": r'"prewarmDripShare":0\.[3-5]',
    "--prewarm-drips-at-ceiling": r'"midAir":[1-9]',
}


def _run(args=()):
    result = run_js(HARNESS, list(args), timeout=240)
    return result.stdout + result.stderr, result.stdout.splitlines()


def _jobs() -> int:
    # dev.py test sets HW1_GAME_JOBS=1: full-game harnesses run one at a time.
    try:
        return max(1, int(os.environ.get("HW1_GAME_JOBS", "1")))
    except ValueError:
        return 1


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class EffectAmbientTests(unittest.TestCase):
    def test_ambient_contracts(self) -> None:
        output, lines = _run()
        self.assertIn(SENTINEL, lines, output)
        self.assertFalse([line for line in lines if line.startswith("SKIP ")], output)
        self.assertEqual(PASS_COUNT, sum(line.startswith("PASS ") for line in lines), output)
        self.assertFalse([line for line in lines if line.startswith("FAIL ")], output)

    def test_mutations_fail_their_named_checks(self) -> None:
        self.assertEqual(set(MUTATIONS), set(CAUSES))
        with ThreadPoolExecutor(max_workers=_jobs()) as pool:
            results = dict(zip(MUTATIONS, pool.map(lambda flag: _run([flag]), MUTATIONS)))
        for flag, checks in MUTATIONS.items():
            output, lines = results[flag]
            with self.subTest(mutation=flag):
                self.assertNotIn(SENTINEL, lines, output)
                self.assertTrue(any(line.startswith("EFFECT_AMBIENT_RESULT FAIL ") for line in lines), output)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP ", output)
                self.assertNotIn("ran without an exception", output)
                for check in checks:
                    self.assertTrue([line for line in lines if line.startswith("FAIL " + check + " ")], output)
                first = next(line for line in lines if line.startswith("FAIL " + checks[0] + " "))
                self.assertRegex(first, CAUSES[flag], output)


if __name__ == "__main__":
    unittest.main()
