"""Shared actor controller regressions with independent geometric oracles."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class SpatialMotionTests(unittest.TestCase):
    script = Path(__file__).with_name("spatial_motion.js")

    def test_support_body_collision_and_bounded_motion(self) -> None:
        result = run_js(self.script, timeout=30)
        output = result.stdout + result.stderr
        self.assertIn("SPATIAL_MOTION_RESULT PASS 74", result.stdout.splitlines(), output)
        self.assertEqual(74, sum(line.startswith("PASS ") for line in result.stdout.splitlines()), output)
        self.assertNotIn("FAIL ", output)
        self.assertIn("PASS fixture_reaches_final_independent_control", output)

    def assert_mutation_detected(self, flag: str, assertion: str) -> str:
        result = run_js(self.script, [flag], timeout=30)
        output = result.stdout + result.stderr
        self.assertIn("FAIL " + assertion, output, output)
        self.assertIn("SPATIAL_MOTION_RESULT FAIL ", output, output)
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertNotIn("SPATIAL_MOTION_RESULT PASS", output)
        # A mutation must fail the outcome assertion, not prevent setup or crash.
        self.assertIn("PASS fixture_reaches_final_independent_control", output, output)
        self.assertNotIn("Exception:", output)
        self.assertNotIn("Error:", output)
        return output

    def test_single_endpoint_wall_tunneling_is_detected(self) -> None:
        self.assert_mutation_detected("--single-endpoint", "fast_actor_cannot_tunnel_through_wall")

    def test_duplicate_support_query_work_is_detected(self) -> None:
        self.assert_mutation_detected("--repeat-support-cell", "one_cell_footprint_performs_one_real_support_query")

    def test_stale_actor_support_height_is_detected(self) -> None:
        self.assert_mutation_detected("--freeze-support-height", "authored_ramp_cells_raise_support_by_fifteen_units")

    def test_omitted_body_headroom_is_detected(self) -> None:
        self.assert_mutation_detected("--omit-body-headroom", "seventy_unit_body_cannot_enter_sixty_two_unit_headroom")

    def test_heightless_wall_collision_is_detected(self) -> None:
        self.assert_mutation_detected("--omit-wall-height", "same_buried_wall_does_not_block_surface_actor")

    def test_cross_storey_enemy_separation_is_detected(self) -> None:
        self.assert_mutation_detected("--cross-storey-separation", "2D_roof_separated_enemies_do_not_push_each_other")

    def test_coincident_spawn_freeze_is_detected(self) -> None:
        self.assert_mutation_detected("--coincident-separation", "2D_coincident_enemy_spawns_separate_without_nan")

    def test_player_consumer_bypassing_controller_is_detected(self) -> None:
        self.assert_mutation_detected("--player-bypass-controller", "2D_actual_player_step_cannot_skip_intermediate_wall")

    def test_patrol_consumer_bypassing_controller_is_detected(self) -> None:
        output = self.assert_mutation_detected("--patrol-bypass-controller", "2D_actual_enemy_patrol_cannot_skip_intermediate_wall")
        self.assertIn("FAIL 3D_actual_enemy_patrol_cannot_skip_intermediate_wall", output)
        self.assertIn("PASS 2D_same_enemy_patrol_moves_without_wall", output)
        self.assertIn("PASS 3D_same_enemy_patrol_moves_without_wall", output)


if __name__ == "__main__":
    unittest.main()
