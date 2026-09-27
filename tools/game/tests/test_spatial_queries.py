"""Real 2.5D queries with analytic fixtures and causal mutation controls."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class SpatialQueryTests(unittest.TestCase):
    script = Path(__file__).with_name("spatial_queries.js")

    def test_authored_geometry_and_invalidation_contracts(self) -> None:
        result = run_js(self.script, timeout=30)
        output = result.stdout + result.stderr
        self.assertIn("SPATIAL_QUERY_RESULT PASS 50", result.stdout.splitlines(), output)
        self.assertNotIn("FAIL ", output)

    def assert_mutation_detected(self, flag: str, assertion: str) -> None:
        result = run_js(self.script, [flag], timeout=30)
        output = result.stdout + result.stderr
        self.assertIn("FAIL " + assertion, output, output)
        self.assertIn("SPATIAL_QUERY_RESULT FAIL ", output, output)
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertNotIn("SPATIAL_QUERY_RESULT PASS", output)
        # Completing the fixture distinguishes an assertion failure from a crash.
        self.assertIn("PASS flat_query_triangle_budget_is_linear", output, output)

    def test_roof_omission_is_detected_by_cross_storey_ray(self) -> None:
        self.assert_mutation_detected("--omit-roofs", "roof_crossing_up_hits_ceiling_first")

    def test_corner_supercover_omission_is_detected(self) -> None:
        self.assert_mutation_detected("--omit-corner-walls", "thin_corner_wall_is_not_skipped")

    def test_window_local_identity_regression_is_detected(self) -> None:
        self.assert_mutation_detected("--local-hit-id", "window_translation_preserves_world_surface_id")

    def test_cached_wall_floor_regression_is_detected(self) -> None:
        self.assert_mutation_detected("--stale-wall-floor", "in_place_support_edit_moves_wall_span_without_render_tick")

    def test_flattened_triangle_regression_is_detected(self) -> None:
        self.assert_mutation_detected("--flatten-triangles", "nonplanar_northeast_triangle_hits_analytic_height")

    def test_distant_roof_cap_cannot_swallow_upper_passage(self) -> None:
        self.assert_mutation_detected("--distant-roof-cap", "stacked_upper_passage_not_swallowed_by_lower_roof")

    def test_wall_ceiling_closure_omission_is_detected(self) -> None:
        self.assert_mutation_detected("--omit-wall-closure", "wall_ceiling_closure_blocks_above_regular_wall_top")

    def test_parallel_boundary_omission_is_detected(self) -> None:
        self.assert_mutation_detected("--omit-parallel-boundary", "parallel_grid_boundary_touches_adjacent_wall")

    def test_final_endpoint_omission_is_detected(self) -> None:
        self.assert_mutation_detected("--omit-final-boundary", "final_endpoint_on_wall_is_blocked")

    def test_initial_endpoint_moving_away_omission_is_detected(self) -> None:
        self.assert_mutation_detected("--omit-initial-boundary", "initial_endpoint_moving_away_still_touches_wall")


if __name__ == "__main__":
    unittest.main()
