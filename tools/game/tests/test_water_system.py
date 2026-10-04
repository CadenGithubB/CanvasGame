"""Water system: solver contracts on authored terrain, the real Endless window and structure floors."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

CHECK_COUNT = 29
PASS_RESULT = f"WATER_SYSTEM_RESULT PASS {CHECK_COUNT}"
HARNESS = Path(__file__).with_name("water_system.js")


class WaterSystemTests(unittest.TestCase):
    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_solver_and_window_contracts(self) -> None:
        result = run_js(HARNESS, timeout=180)
        lines = result.stdout.splitlines()
        self.assertIn(PASS_RESULT, lines, result.stdout + result.stderr)
        self.assertEqual(CHECK_COUNT, sum(line.startswith("PASS ") for line in lines))

    def assert_rejected(self, flag: str, message: str) -> None:
        result = run_js(HARNESS, [flag], timeout=180)
        self.assertNotIn(PASS_RESULT, result.stdout.splitlines())
        self.assertIn(f"Error: {message}", result.stdout + result.stderr)

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_uphill_rivers(self) -> None:
        self.assert_rejected("--uphill-descent", "a river on a slope only ever flows downhill")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_spilling_back_into_own_basin(self) -> None:
        self.assert_rejected("--spill-into-own",
                             "rough terrain: every source ends on a known outcome, uncapped, with water only on open ground")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_spilling_below_the_true_rim(self) -> None:
        self.assert_rejected("--early-spill", "a filled basin has one flat surface at its spill height")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_rivers_without_channels(self) -> None:
        self.assert_rejected("--no-carve",
                             "rivers run in carved channels: the bed dips below the water and dry banks stand above it")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_banks_below_the_water(self) -> None:
        self.assert_rejected("--perched-bank",
                             "rivers run in carved channels: the bed dips below the water and dry banks stand above it")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_basins_standing_above_reserved_ground(self) -> None:
        self.assert_rejected("--no-basin-drain", "a basin beside reserved ground fills only to that ground and drains into it")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_a_basin_drain_below_the_reserved_ground(self) -> None:
        self.assert_rejected("--no-drain-level", "a basin beside reserved ground fills only to that ground and drains into it")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_rivers_running_past_lower_reserved_ground(self) -> None:
        self.assert_rejected("--no-river-drain", "a river passing lower reserved ground drains into it there")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_a_drain_that_ignores_the_river_width(self) -> None:
        self.assert_rejected("--no-drain-reach", "a river drains where its width reaches lower reserved ground beside its course")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_wall_cells_looked_up_off_their_floor_square(self) -> None:
        self.assert_rejected("--wall-cell-nw", "no water on walls, cave interiors or carved ground in the real window")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_rivers_through_structure_floors(self) -> None:
        self.assert_rejected("--no-reserve", "keep props, structure floors and structure models stand the same with water on and off")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_a_reserve_read_from_the_stale_structure_list(self) -> None:
        # Seed 11's fortress is not yet in largeStructures when a walk-in solves its water.
        self.assert_rejected("--stale-structures",
                             "keep props, structure floors and structure models stand the same with water on and off")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_a_reserve_without_its_margin(self) -> None:
        self.assert_rejected("--no-margin", "water keeps off the levelled floor, footprint and margin of a fortress, arena "
                             "or watchtower: no new water, reshaped ground, spring or river surface there")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_carved_water_standing_above_reserved_ground(self) -> None:
        # Seed 14: the solver's width estimate stops short; the carved water does not.
        self.assert_rejected("--no-keep-off", "water that reaches reserved ground drains into it and never stands above it")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_drained_rivers_ending_above_their_ground(self) -> None:
        self.assert_rejected("--no-drain-fall", "a river that drains falls to the ground where it ends, its tail neither "
                             "standing above it nor running dry")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_drained_rivers_falling_below_the_land(self) -> None:
        self.assert_rejected("--drain-below-ground", "a river that drains falls to the ground where it ends, its tail neither "
                             "standing above it nor running dry")


    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_unbounded_levees(self) -> None:
        self.assert_rejected("--no-fill-cap", "carving never moves ground more than WATER_MAX_FILL above or "
                             "WATER_MAX_CUT below its natural height")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_unbounded_channel_cuts(self) -> None:
        self.assert_rejected("--no-cut-cap", "carving never moves ground more than WATER_MAX_FILL above or "
                             "WATER_MAX_CUT below its natural height")

    @unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
    def test_regression_rejects_a_reserve_that_depends_on_the_window(self) -> None:
        self.assert_rejected("--reserve-window-regions", "a point is reserved the same way in every window that holds it")


if __name__ == "__main__":
    unittest.main()
