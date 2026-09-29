"""The shipped texture mapper is inert when the game script loads.

Risk: src/12-texture-mapping.js now ships in MAIN. A load-time catalog build
(canvases, pixel readback, mip preparation) would run on every page load and in
every headless host that evaluates the manifest, and a leaked global could
collide with game code. The oracle is the host's own record of side effects
with the fragment omitted, not the mapper's code. Stub host, no pixel claims.
"""

from pathlib import Path
import tempfile
import unittest

from tools.game import dev
from tools.webui.js_engine import JS_ENGINE, run_js

MAPPING = "src/12-texture-mapping.js"
API = ("STRUCTURE_TESSELLATION,clipNear,createCatalog,drawPlanarFace,drawTriangle,expandTriangle,"
       "footprintLOD,ownedClip,perspectiveUV,planarFootprint,prefilterMipPixels,prepareMaterial,tessellate")


def parse(output):
    lines = output.splitlines()
    counts = {}
    for line in lines:
        if line.startswith("COUNT "):
            _, key, value = line.split(" ")
            counts[key] = int(value)
    fields = {}
    for line in lines:
        for prefix in ("LOADED ", "LOAD_ERROR ", "FRAGMENT_DELTA_TOTAL ", "FRAGMENT_GLOBALS ",
                       "TEXTURE_PILOT ", "API ", "CONTROL_CANVASES ", "CONTROL_ERROR ", "SETUP "):
            if line.startswith(prefix):
                fields[prefix.strip()] = line[len(prefix):]
    deltas = {line.split(" ")[1]: int(line.split(" ")[2]) for line in lines
              if line.startswith("FRAGMENT_DELTA ")}
    return counts, fields, deltas


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class TextureFragmentLoadTests(unittest.TestCase):
    script = Path(__file__).with_name("texture_fragment_load.js")

    @classmethod
    def run_harness(cls, *flags):
        result = run_js(cls.script, list(flags), timeout=120)
        output = result.stdout + result.stderr
        return output, parse(output)

    @classmethod
    def setUpClass(cls):
        cls.shipped_output, cls.shipped = cls.run_harness()
        cls.omitted_output, cls.omitted = cls.run_harness("--omit-mapping")

    def assertCompleted(self, output, fields):
        self.assertIn("TEXTURE_FRAGMENT_LOAD_RESULT DONE", output.splitlines(), output)
        self.assertNotIn("LOAD_ERROR", fields, output)
        self.assertNotIn("SETUP", fields, output)
        self.assertNotIn("Error:", output)
        self.assertNotIn("Exception:", output)

    def mutant(self, suffix):
        """A temporary copy of the shipped fragment with code appended after the IIFE."""
        source = (dev.SOURCE_ROOT / MAPPING).read_text(encoding="utf-8")
        anchor = "\n}());\n"
        self.assertEqual(1, source.count(anchor), "MUTATION_ANCHOR end of TexturePilot IIFE")
        self.assertTrue(source.endswith(anchor), "MUTATION_ANCHOR end of TexturePilot IIFE")
        directory = tempfile.TemporaryDirectory(prefix="hw1_texture_fragment_")
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "12-texture-mapping.js"
        path.write_text(source + suffix, encoding="utf-8")
        return self.run_harness("--mapping-source", str(path), "--no-control")

    def test_both_runs_load_the_real_manifest_and_differ_only_by_the_fragment(self):
        output, (counts, fields, _) = self.shipped_output, self.shipped
        self.assertCompleted(output, fields)
        self.assertCompleted(self.omitted_output, self.omitted[1])
        self.assertTrue(fields["LOADED"].endswith("mapping=shipped"), fields["LOADED"])
        self.assertTrue(self.omitted[1]["LOADED"].endswith("mapping=omitted"), self.omitted[1]["LOADED"])
        loaded, total = (int(n) for n in fields["LOADED"].split(" ")[0:3:2])
        self.assertEqual(loaded, total, "every MAIN fragment must load")
        # Negative control: the comparison run really lacks the mapper.
        self.assertEqual("undefined", self.omitted[1]["TEXTURE_PILOT"])
        self.assertEqual("object", fields["TEXTURE_PILOT"])
        self.assertEqual(API, fields["API"])
        # Non-vacuous host: it records the game's own load-time canvas and DOM work.
        self.assertGreater(counts.get("canvas.created", 0), 0)
        self.assertGreater(counts.get("document.getElementById", 0), 0)

    def test_loading_the_mapper_has_no_host_side_effects_and_adds_one_global(self):
        counts, fields, deltas = self.shipped
        self.assertEqual({}, deltas, "the fragment's own evaluation touched the host")
        self.assertEqual("0", fields["FRAGMENT_DELTA_TOTAL"])
        self.assertEqual("TexturePilot", fields["FRAGMENT_GLOBALS"])
        # Nothing later in MAIN builds a catalog or otherwise uses the mapper at load.
        self.assertEqual(self.omitted[0], counts, "host side effects differ with the mapper shipped")

    def test_control_catalog_build_is_visible_to_the_host(self):
        """Positive control: a real catalog build creates canvases this host counts."""
        fields = self.shipped[1]
        self.assertNotIn("CONTROL_ERROR", fields, fields.get("CONTROL_ERROR"))
        canvases, materials = fields["CONTROL_CANVASES"].split(" ")
        self.assertGreater(int(canvases), 0)
        self.assertEqual("materials=4", materials)

    def test_top_level_catalog_build_or_leaked_global_fails_the_inert_contract(self):
        output, (counts, fields, deltas) = self.mutant("TexturePilot.createCatalog(64);\n")
        self.assertCompleted(output, fields)
        # Fails for the intended reason: the host saw canvases, not a crash.
        self.assertGreater(deltas.get("canvas.created", 0), 0, output)
        self.assertNotEqual("0", fields["FRAGMENT_DELTA_TOTAL"])
        self.assertNotEqual(self.omitted[0], counts)
        output, (counts, fields, deltas) = self.mutant("var textureScratch = [];\n")
        self.assertCompleted(output, fields)
        self.assertEqual({}, deltas)
        self.assertEqual("TexturePilot,textureScratch", fields["FRAGMENT_GLOBALS"])


if __name__ == "__main__":
    unittest.main()
