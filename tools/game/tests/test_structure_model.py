"""Actual structure recipes adapted to local meshes; not browser pixel evidence."""

from pathlib import Path
import re
import shutil
import tempfile
import unittest

from tools.game import dev
from tools.webui.js_engine import JS_ENGINE, run_js


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class StructureModelTests(unittest.TestCase):
    script = Path(__file__).with_name("structure_model.js")

    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="hw1_structure_model_")
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.production = Path(cls.temporary.name) / "production.js"
        cls.production.write_text(dev.structure_production_js(), encoding="utf-8")

    def run_contract(self, *flags):
        result = run_js(self.script, [str(self.production), *flags], timeout=45)
        output = result.stdout + result.stderr
        self.assertEqual(0, result.returncode, output)
        self.assertNotIn("Error:", output)
        self.assertNotIn("Exception:", output)
        self.assertNotIn("MUTATION_ANCHOR", output)
        self.assertNotIn("SETUP ", output)
        return output

    def test_real_structure_grid_mesh_and_texture_contracts(self):
        output = self.run_contract()
        self.assertIn("STRUCTURE_MODEL_RESULT PASS 51", output.splitlines())
        self.assertEqual(51, sum(line.startswith("PASS ") for line in output.splitlines()))
        self.assertNotIn("FAIL ", output)

    def test_plausible_geometry_faults_fail_independent_contracts(self):
        mutations = {
            "--clear-untouched-grid": "fortress injected stamp preserves original clean and prefilled chunk semantics",
            "--drop-west-boundaries": "fortress merged surfaces exactly cover original solid boundary without internal faces or lost steps",
            "--hide-height-steps": "authored adjacent heights expose only the upper riser and retain cavity walls",
            "--shift-chunk-cell": "fortress local grid preserves all original occupancy across positive and negative chunks",
            "--lose-local-origin": "fortress merged surfaces exactly cover original solid boundary without internal faces or lost steps",
            "--stretch-textures": "fortress body and ground keep thirty two world units per texture repeat",
            "--reset-wall-phase": "fortress texture phase is continuous across merged faces and chunk boundaries",
            "--drop-shell": "fortress roofs lintels and standards match the original floor anchored shell geometry",
            "--merge-across-colors": "adjacent equal height different materials retain their authored top colors",
            "--bridge-hollow-top": "cleared cell with stale height metadata cannot receive a bridged top",
            "--wrong-world-height": "authored upper riser has independent one hundred twenty to two hundred forty height endpoints",
        }
        for flag, assertion in mutations.items():
            with self.subTest(mutation=flag):
                output = self.run_contract(flag)
                self.assertIn("PASS injected production constants retain source unit conversions", output)
                self.assertIn("PASS unsupported recipes and invalid source parameter ranges reject explicitly", output)
                self.assertIn("FAIL " + assertion, output)
                self.assertRegex(output, r"STRUCTURE_MODEL_RESULT FAIL \d+/51")


class StructurePreviewAssemblyTests(unittest.TestCase):
    """Reject stale/unsafe imports instead of serving a misleading partial scene.

    The mapper ships as src/12-texture-mapping.js and is copied from the
    source root. Each negative case starts from a fixture that builds and
    requires the SourceError to name the injected defect, so a missing import
    cannot satisfy an unrelated failure check.
    """

    MARKER_ERROR = ("structure preview must contain each production, mapping, model, temporal, "
                    "and edge-coverage marker exactly once")
    TOOLING = ("structure-preview.html", "structure-model.js", "texture-temporal.js",
               "structure-temporal.js", "structure-motion.js", "edge-coverage.js")

    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="hw1_structure_source_")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.source = self.root / "game"
        self.tooling = self.root / "tooling"
        (self.source / "src").mkdir(parents=True)
        self.tooling.mkdir()
        for name in ("01-config-state.js", "01-materials.js", "05-endless-world.js",
                     "12-scene-depth.js", "12-texture-mapping.js", "15-render-hud-menu.js"):
            shutil.copyfile(dev.SOURCE_ROOT / "src" / name, self.source / "src" / name)
        shutil.copyfile(dev.SOURCE_ROOT / "page.html", self.source / "page.html")
        for name in self.TOOLING:
            shutil.copyfile(dev.REPO_ROOT / "tools/game" / name, self.tooling / name)
        # Precondition for every negative case below: the unmodified fixture builds.
        self.good = self.preview()

    def preview(self):
        return dev.structure_preview_html(self.source, self.tooling).decode("utf-8")

    def assertPreviewFails(self, message):
        with self.assertRaisesRegex(dev.SourceError, re.escape(message)):
            self.preview()

    def replace_once(self, path, before, after):
        text = path.read_text(encoding="utf-8")
        self.assertEqual(1, text.count(before), before)
        path.write_text(text.replace(before, after), encoding="utf-8")

    def test_imported_recipes_use_real_units_without_starting_game_or_device_code(self):
        script = dev.structure_production_js(self.source)
        for expected in ('"cell": 12', '"chunkSize": 480', '"chunkCells": 40', '"canvasBaseH": 240',
                         "function drawStructureShellWorld(", "function stamp(", "function captureShell("):
            self.assertIn(expected, script)
        for forbidden in ("function generateChunk(", "requestAnimationFrame", "document.", "hw.fetchJSON",
                          "function resetEndlessMode(", "function loop("):
            self.assertNotIn(forbidden, script)
        page = self.good
        for expected in ("var StructureProduction =", "var StructureModel =", "var TexturePilot =",
                         "function getCam3D()", "function beginSceneDepthFrame("):
            self.assertIn(expected, page)
        for name in ("TextureTemporal", "StructureTemporal", "StructureMotion", "EdgeCoverage"):
            self.assertRegex(page, rf"\bvar\s+{name}\s*=")
        self.assertNotRegex(page, r"@[A-Za-z_][A-Za-z_0-9]*@")
        self.assertNotIn("function resetEndlessMode(", page)
        self.assertNotIn("function generateChunk(", page)

    def test_mapper_is_read_from_the_shipping_source_not_a_tooling_copy(self):
        """Contract since the mapper shipped: /structures.html injects src/12-texture-mapping.js."""
        mapping = (self.source / "src/12-texture-mapping.js").read_text(encoding="utf-8")
        (self.tooling / "texture-mapping.js").write_text("var TexturePilot = {staleToolingCopy: true};\n",
                                                         encoding="utf-8")
        page = self.preview()
        self.assertEqual(1, page.count(mapping))
        self.assertNotIn("staleToolingCopy", page)
        (self.source / "src/12-texture-mapping.js").unlink()
        self.assertPreviewFails("cannot read src/12-texture-mapping.js")

    def test_missing_duplicate_and_unknown_page_markers_fail_closed(self):
        path = self.tooling / "structure-preview.html"
        original = path.read_text(encoding="utf-8")
        markers = re.findall(r"/\*\s*@[A-Za-z_][A-Za-z_0-9]*@\s*\*/", original)
        self.assertEqual(9, len(markers))
        for marker in markers:
            for replacement in ("", marker + marker):
                with self.subTest(marker=marker, replacement=replacement):
                    path.write_text(original.replace(marker, replacement), encoding="utf-8")
                    self.assertPreviewFails(self.MARKER_ERROR)
        path.write_text(original + "/* @UNKNOWN_SOURCE@ */", encoding="utf-8")
        self.assertPreviewFails(self.MARKER_ERROR)

    def test_changed_missing_or_duplicated_production_extraction_anchors_fail_closed(self):
        camera = "structure preview camera anchors must be unique and ordered"
        stamp = ("  if (cStructure) {\n    var sWX = cStructure.centerWX", "  // ── Underground cave network carving")
        palette = ("      var sPalette;", "      // Layout variations")
        box = ("function drawRuinDecorBox(", "function drawRuins3D()")
        shell = ("function getStructureShellMetrics(", "function drawStructures3D()")

        def section(pair):
            return f"structure preview requires unique ordered source anchors: {pair[0]!r}, {pair[1]!r}"

        anchors = {
            "01-config-state.js": {"function getCam3D() {": camera,
                                   "// Projects a world point to screen coordinates.": camera},
            "05-endless-world.js": {stamp[0]: section(stamp), stamp[1]: section(stamp),
                                    palette[0]: section(palette), palette[1]: section(palette)},
            "15-render-hud-menu.js": {box[0]: section(box), box[1]: section(box),
                                      shell[0]: section(shell), shell[1]: section(shell)},
        }
        for filename, candidates in anchors.items():
            path = self.source / "src" / filename
            original = path.read_text(encoding="utf-8")
            for anchor, message in candidates.items():
                self.assertEqual(1, original.count(anchor))
                for altered in (original.replace(anchor, "/* missing original anchor */"), original + "\n" + anchor):
                    with self.subTest(file=filename, anchor=anchor):
                        path.write_text(altered, encoding="utf-8")
                        self.assertPreviewFails(message)
            path.write_text(original, encoding="utf-8")

    def test_mismatched_duplicate_and_nonpositive_dimensions_fail_closed(self):
        config = self.source / "src/01-config-state.js"
        original = config.read_text(encoding="utf-8")
        field = re.search(r"^\s*cellSize:\s*12\s*,", original, re.M).group()
        variants = [(original.replace(field, field.replace("12", "13")),
                     "structure preview requires matching production cell/chunk dimensions"),
                    (original.replace(field, field.replace("12", "0")),
                     "structure preview requires one positive production cellSize"),
                    (original + "\ncellSize: 12,\n", "structure preview requires one positive production cellSize")]
        for variant, message in variants:
            with self.subTest(message=message):
                config.write_text(variant, encoding="utf-8")
                self.assertPreviewFails(message)
        config.write_text(original, encoding="utf-8")
        html = self.source / "page.html"
        page = html.read_text(encoding="utf-8")
        canvas = re.search(r"<canvas\s+id=['\"]maze['\"]\s+width=['\"]\d+['\"]\s+height=['\"]\d+['\"]", page).group()
        zero_canvas = re.sub(r"height=['\"]\d+['\"]", 'height="0"', canvas)
        self.assertNotEqual(canvas, zero_canvas)
        for variant in (page.replace(canvas, zero_canvas),
                        page + canvas + "></canvas>"):
            html.write_text(variant, encoding="utf-8")
            self.assertPreviewFails("structure preview requires the unique authored maze canvas height")

    def test_script_terminators_and_leftover_injection_tokens_fail_closed(self):
        markers = {"structure-model.js": "/* @STRUCTURE_MODEL@ */",
                   "src/12-texture-mapping.js": "/* @TEXTURE_MAPPING@ */",
                   "texture-temporal.js": "/* @TEXTURE_TEMPORAL@ */",
                   "structure-temporal.js": "/* @STRUCTURE_TEMPORAL@ */",
                   "structure-motion.js": "/* @STRUCTURE_MOTION@ */",
                   "edge-coverage.js": "/* @EDGE_COVERAGE@ */"}
        for name, marker in markers.items():
            path = self.source / name if name.startswith("src/") else self.tooling / name
            original = path.read_text(encoding="utf-8")
            for suffix in ("\n</ScRiPt>", "\n/* @UNRESOLVED_FRAGMENT@ */"):
                with self.subTest(name=name, suffix=suffix):
                    path.write_text(original + suffix, encoding="utf-8")
                    self.assertPreviewFails(f"structure preview {marker}: unsafe script or unresolved injection marker")
            path.write_text(original, encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
