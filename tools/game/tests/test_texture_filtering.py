"""Deterministic mip data, projected footprints and bounded filtering commands."""

from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class TextureFilteringTests(unittest.TestCase):
    script = Path(__file__).with_name("texture_filtering.js")

    def test_mip_reduction_projected_lod_phase_and_cache_bounds(self):
        result = run_js(self.script, timeout=30)
        output = result.stdout + result.stderr
        self.assertIn("TEXTURE_FILTERING_RESULT PASS 38", output.splitlines())
        self.assertEqual(38, sum(line.startswith("PASS ") for line in output.splitlines()))
        self.assertNotIn("FAIL ", output)
        self.assertNotIn("Error:", output)
        self.assertNotIn("Exception:", output)

    def test_plausible_filtering_faults_fail_intended_contracts(self):
        mutations = {
            "--nearest-mip-texel": "mip texel averages every source RGBA sample instead of selecting one",
            "--wrong-row-pitch": "reduction uses source row pitch for separate horizontal output texels",
            "--disable-lod": "minified material selects the independently expected mip level",
            "--rebuild-prepared": "prepared material reuse never rebuilds or rereads its pixel sources",
            "--stretch-mip-coordinates": "selected mip transform preserves material phase at every screen vertex",
            "--ignore-anisotropy": "anisotropic minification is not hidden by an unchanged triangle area",
            "--disable-level-blend": "between octave footprints blend continuously instead of popping to one level",
            "--shift-filter-center": "centered footprint preserves an authored feature instead of shifting its phase",
            "--clamp-repeat-boundary": "periodic filtering carries a border feature across both repeat seams",
            "--discard-fractional-coverage": "fractional footprint boundaries keep exact two dimensional overlap weights",
            "--decimate-filter-phase": "prepared levels retain four phase samples per filter footprint",
            "--cap-phase-at-source": "small materials retain four footprint phases without changing their original crisp base",
            "--shift-virtual-base-texel": "virtual planar base exactly duplicates original piecewise constant texels without shifting artwork",
            "--skip-virtual-unit-filter": "virtual unit filter integrates quarter texel boundary areas rather than repeating its sharp base",
            "--wrong-virtual-level-reuse": "virtual planar chain shares all existing coarse levels and leaves triangle base identity unchanged",
        }
        for flag, assertion in mutations.items():
            with self.subTest(mutation=flag):
                result = run_js(self.script, [flag], timeout=30)
                output = result.stdout + result.stderr
                self.assertIn("PASS magnified surface remains at the original material level", output)
                self.assertIn("FAIL " + assertion, output)
                self.assertRegex(output, r"TEXTURE_FILTERING_RESULT FAIL \d+/38")
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("Error:", output)
                self.assertNotIn("Exception:", output)
                self.assertNotIn("SETUP ", output)


if __name__ == "__main__":
    unittest.main()
