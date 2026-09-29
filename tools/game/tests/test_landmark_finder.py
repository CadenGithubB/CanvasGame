"""The "Go to nearest landmark" developer action lands safely and loads the
same world a walk-in would.

Risk (critique blocking item 5): landmarks are usually outside the loaded
window, so a naive teleport leaves the player outside the grid and floor mesh,
inside a wall or the structure, over a cave, still moving, next to a spawner or
an enemy, or with a different set of enemies and chests than walking there
would load.

Oracles, on seeds 424242, 777000, 31337, 12345, 2024 and 555 with the real
generator, window assembly and physics: the landing cell against the grid, the
floor-support query and 120 fixed ticks (no fall, push, damage, underground
state or re-centre); the nearest structure face within viewDist and the camera
facing its centre; the window records (including the biome preset) against a
fresh world entered by moving the player there and calling updateChunks(); no
window assembly inside the finder's own updateChunks(); the region rule against
generated region-centre chunks. Authored fixtures put each hazard next to one
landed cell (enemy, spawner, cave roof, slope, water, entrance, stall, wall)
and require rejection, then acceptance once removed. A fault injection vetoes
the chosen cell after the re-centre (no sampled seed reaches that branch) and
requires another cell in the new centre chunk, outside the footprint. Enemy
`npc` runtime identity is excluded from the record comparison: ids are
assigned per window load, so any different route (not only this teleport)
numbers them differently. The harness prints that as a NOTE.

The separate seed sweep (TESTING.md) runs the default search on seeds 1-40
plus preserved failures of earlier versions: seeds 1, 22, 27 and 30 landed in
a spawner's waking range, 87 within a wolf's reach, 96 (arena) inside the
ring through a gate, and 37 (watchtower) has no calm cell and must say so.
Each landing must be outside the footprint (grid ray casts) on open support,
and quiet for 240 ticks (the finder's four-second enemy margin) unless the
finder reports it unsafe.
"""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("landmark_finder.js")
SEEDS = (424242, 777000, 31337, 12345, 2024, 555)
EXPECTED = 59
SWEEP_CASES = tuple((seed, "any") for seed in range(1, 41)) + ((87, "any"), (96, "arena"), (37, "watchtower"))
SWEEP_EXPECTED = len(SWEEP_CASES) + 3   # two rate checks and the console check
NARROW = ("--seeds", "12345", "--skip-sweep", "--skip-extras", "--skip-fixtures")
FIXTURES = ("--seeds", "12345", "--skip-sweep", "--skip-extras")


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class LandmarkFinderTests(unittest.TestCase):
    def run_harness(self, *flags):
        result = run_js(SCRIPT, list(flags), timeout=300)
        return result.stdout + result.stderr, result.stdout.splitlines()

    def test_six_seeds_land_safely_and_match_a_walk_in(self) -> None:
        output, lines = self.run_harness()
        self.assertIn(f"LANDMARK_FINDER_RESULT PASS {EXPECTED} failed 0", lines, output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in lines), output)
        for seed in SEEDS:
            with self.subTest(seed=seed):
                self.assertIn(f"PASS seed {seed}: 120 ticks after landing: no fall, push, damage, underground state or window re-centre", lines)
                self.assertIn(f"PASS seed {seed}: a fresh run's first press repeats the landing, and its records equal a walk-in "
                              "(enemies, chests, spawners, landmarks, biome)", lines)
        for guard in ("an enemy within 36 u", "a live spawner within waking range", "a cave roof over the surface",
                      "a neighbour 0.5 higher", "water in the cell", "a cave entrance reserve", "a market stall within 48 u",
                      "a solid cell two cells away"):
            with self.subTest(guard=guard):
                self.assertTrue(any(line.startswith("PASS fixture: " + guard) for line in lines), output)

    def test_seed_sweep_lands_outside_and_quietly_unless_reported_unsafe(self) -> None:
        output, lines = self.run_harness("--sweep")
        self.assertIn(f"LANDMARK_FINDER_RESULT PASS {SWEEP_EXPECTED} failed 0", lines, output)
        for seed, kind in SWEEP_CASES:
            with self.subTest(seed=seed, kind=kind):
                self.assertIn(f"PASS sweep seed {seed} {kind}: lands outside the footprint on open support, "
                              "quiet for 240 ticks unless reported unsafe", lines)
        self.assertIn(f"PASS sweep: every default-search landing is reported safe ({len(SWEEP_CASES) - 2} cases)", lines)
        self.assertIn("PASS sweep: the no-calm-cell regression (37 watchtower) is reported unsafe", lines)

    def assertMutantFails(self, flag, *checks, narrow=NARROW):
        output, lines = self.run_harness(flag, *narrow)
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertNotIn("Exception:", output, output)
        self.assertTrue(any(line.startswith("LANDMARK_FINDER_RESULT FAIL") for line in lines), output)
        for name in checks:
            self.assertTrue(any(line.startswith("FAIL ") and name in line for line in lines), f"{flag} should fail: {name}\n{output}")

    # Mutation runs use seed 12345 (its landing needs the second assembly, so
    # the stale-origin and re-centre mutants bite) and skip unrelated sections.
    def test_skipping_the_support_settle_is_detected(self) -> None:
        self.assertMutantFails("--finder-no-settle", "on a walkable roofless dry surface", "120 ticks after landing")

    def test_keeping_the_old_velocity_is_detected(self) -> None:
        self.assertMutantFails("--finder-keep-velocity", "velocity and jump state are clear", "120 ticks after landing")

    def test_placing_with_the_stale_window_origin_is_detected(self) -> None:
        self.assertMutantFails("--finder-stale-origin", "the structure is inside viewDist")

    def test_a_wrong_presence_threshold_is_detected(self) -> None:
        self.assertMutantFails("--finder-threshold", "the finder region rule matches generated region-centre chunks",
                               "the finder reaches a generated structure of the predicted type",
                               narrow=("--seeds", "424242", "--skip-extras", "--skip-fixtures"))

    def test_a_missing_interpolation_reset_is_detected(self) -> None:
        self.assertMutantFails("--finder-no-interp-reset", "render interpolation is reset for the teleport")

    def test_leaving_the_re_centre_to_update_chunks_is_detected(self) -> None:
        self.assertMutantFails("--finder-no-recentre", "updateChunks() inside the finder assembles nothing")

    def test_skipping_the_walk_in_biome_bookkeeping_is_detected(self) -> None:
        self.assertMutantFails("--finder-no-updatechunks", "records equal a walk-in")

    def test_keeping_the_visited_list_across_runs_is_detected(self) -> None:
        self.assertMutantFails("--finder-no-run-reset", "a fresh run's first press repeats the landing")

    def test_retrying_an_unreachable_landmark_is_detected(self) -> None:
        self.assertMutantFails("--finder-no-failed-skip", "an unreachable landmark is skipped by the next press",
                               narrow=("--seeds", "12345", "--skip-sweep", "--skip-fixtures"))

    def test_re_choosing_against_a_stale_hull_is_detected(self) -> None:
        self.assertMutantFails("--finder-rechoose-unshifted", "a cell vetoed after the re-centre is replaced by another",
                               narrow=("--seeds", "12345", "--skip-sweep", "--skip-fixtures"))

    def test_each_landing_guard_is_exercised_by_its_fixture(self) -> None:
        for flag, name in (("--finder-no-underground", "a cave roof over the surface rejects the cell"),
                           ("--finder-no-flat", "a neighbour 0.5 higher (a slope) rejects the cell"),
                           ("--finder-no-enemy-gap", "an enemy within 36 u rejects the cell"),
                           ("--finder-no-spawner-gap", "a live spawner within waking range")):
            with self.subTest(flag=flag):
                self.assertMutantFails(flag, name, narrow=FIXTURES)

    def test_landing_in_a_spawner_waking_range_is_detected_by_the_sweep(self) -> None:
        self.assertMutantFails("--finder-no-spawner-gap", "sweep seed 1 any: lands outside the footprint",
                               narrow=("--sweep", "--cases", "1"))

    def test_ignoring_enemy_walk_time_is_detected_by_the_sweep(self) -> None:
        self.assertMutantFails("--finder-no-enemy-safety", "sweep: every default-search landing is reported safe",
                               narrow=("--sweep", "--cases", "87"))

    def test_a_hull_that_counts_its_interior_as_outside_is_detected(self) -> None:
        self.assertMutantFails("--finder-hull-no-inside", "sweep seed 96 arena: lands outside the footprint",
                               narrow=("--sweep", "--cases", "96:arena"))

    def test_reporting_every_landing_safe_is_detected(self) -> None:
        self.assertMutantFails("--finder-always-safe", "sweep seed 37 watchtower: lands outside the footprint",
                               "the no-calm-cell regression (37 watchtower) is reported unsafe",
                               narrow=("--sweep", "--cases", "37:watchtower"))


if __name__ == "__main__":
    unittest.main()
