"""The standalone Games page that the real-browser checks run in.

tools/webui/game_page.py builds one HTML file from the CSS, HTML and JS
raw-string blocks of components/hardwareone/WebPage_Games.h, a stub window.hw,
and the pixel-check driver tools/webui/harness/game_browser_driver.js. This
module checks the BUILD -- what a browser will be handed -- without a browser:

  - the page builds into a temp dir, and never into components/;
  - it is self-contained: no external URL, no <script src>, no stylesheet
    link, no @import -- it must open from disk with no network and no device;
  - it carries the game JS verbatim, starting on the same line as in the
    header (a browser error "line N" is header line N), the injected driver,
    the hw stub and the run config;
  - every <script> region of the built page parses in the classic-script goal
    (tools/webui/harness/syntax_check.js, as test_embedded_js_syntax.py uses
    it) -- the game's own regions included, so the page as assembled parses,
    not just its parts;
  - every element id the driver reads exists in the page;
  - probe builds apply only exactly-once anchors, to an in-memory copy.

What the page then MEASURES in a browser is tools/webui/tests/test_game_browser.py.

    python3 -m unittest tools.webui.tests.test_game_page -v
    python3 -m tools.webui.game_page --out /tmp/gv --autorun     # build one by hand
"""

from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys
import tempfile
import unittest

from tools.webui import extract_js, game_page
from tools.webui.js_engine import JS_ENGINE, run_js

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
CHECKER = REPO_ROOT / "tools" / "webui" / "harness" / "syntax_check.js"

# stub + config (head), window.onerror + game (the R"JS( block), driver.
EXPECTED_SCRIPT_REGIONS = 5

# Every id game_browser_driver.js looks up: its own page chrome (game_page.py)
# and the game controls it drives (the R"HTML( block).
DRIVER_IDS = ["gvBar", "gvRun", "gvStatus", "gameVisualResults", "gameVisualShots", "terrainSelect", "maze",
              "ctSurfaceEnemies", "ctStructures", "ctMarkets", "ctShrines", "ctSpawners", "ctSurfaceChests",
              "ctCaveEnemies", "ctCaveChests"]


class GamePageBuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory(prefix="hw1_game_page_test_")
        cls.path = game_page.build_page(cls.tmp.name)
        cls.html = cls.path.read_text(encoding="utf-8")
        cls.css, cls.body_html, cls.js = game_page._blocks()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def test_builds_into_the_requested_dir(self) -> None:
        self.assertEqual(pathlib.Path(self.tmp.name).resolve() / game_page.PAGE_NAME, self.path)
        self.assertGreater(len(self.html), 900_000, "the page is far smaller than the ~1 MB game")

    def test_refuses_to_write_into_components(self) -> None:
        with self.assertRaises(game_page.GamePageError):
            game_page.build_page(REPO_ROOT / "components" / "hardwareone" / "gv_should_not_exist")
        self.assertFalse((REPO_ROOT / "components" / "hardwareone" / "gv_should_not_exist").exists())

    def test_self_contained(self) -> None:
        self.assertEqual([], re.findall(r"(?i)\b(?:https?|wss?|ftp):", self.html), "external URL in the page")
        self.assertIsNone(re.search(r"(?i)<script\b[^>]*\bsrc\s*=", self.html), "external <script src>")
        self.assertIsNone(re.search(r"(?i)<link\b", self.html), "stylesheet/preload <link> in the page")
        self.assertIsNone(re.search(r"(?i)@import", self.html), "CSS @import in the page")
        # CSS only: <style> blocks and style="" attributes (JS toDataURL()/createObjectURL() are not CSS).
        styles = re.findall(r"(?is)<style\b[^>]*>(.*?)</style>", self.html)
        attrs = ["".join(m) for m in re.findall(r"""(?i)\bstyle=(?:'([^']*)'|"([^"]*)")""", self.html)]
        css = "\n".join(styles + attrs)
        self.assertGreater(len(css), 1000, "found no CSS to check -- the regexes above are wrong")
        urls = re.findall(r"(?i)url\(\s*['\"]?([^'\")]*)", css)
        self.assertEqual([], [u for u in urls if u and not u.startswith("data:")], "CSS url() to a resource")

    def test_contains_the_game_js_verbatim_on_header_lines(self) -> None:
        self.assertIn(self.js.body, self.html)
        page_lines = self.html.split("\n")
        header_lines = game_page.PAGE.read_text(encoding="utf-8").split("\n")
        query_line = next(n for n, line in enumerate(header_lines, 1)
                          if line.startswith("function getWalkableLayerTopAt("))
        for n in (self.js.start_line + 1, query_line, self.js.start_line + len(self.js.body.splitlines()) - 1):
            self.assertEqual(header_lines[n - 1], page_lines[n - 1], f"page line {n} is not header line {n}")
        self.assertTrue(page_lines[query_line - 1].startswith("function getWalkableLayerTopAt("))

    def test_contains_css_html_driver_stub_and_config(self) -> None:
        self.assertIn(self.css.body, self.html)
        self.assertIn(self.body_html.body, self.html)
        self.assertIn(game_page.driver_js(), self.html)
        self.assertIn(game_page.HW_STUB, self.html)
        self.assertIn("window.__GAME_VISUAL_CONFIG__ = {\"autorun\": false};", self.html)
        # The driver runs after the game (it reads game globals at load).
        self.assertLess(self.html.index("function resetEndlessMode"), self.html.index(game_page.driver_js()[:400]))

    def test_every_id_the_driver_reads_exists(self) -> None:
        declared = set(re.findall(r"""\bid=['"]([A-Za-z0-9_-]+)['"]""", self.html))
        self.assertEqual([], [i for i in DRIVER_IDS if i not in declared])
        driver_ids = set(re.findall(r"""(?:getElementById|el)\(\s*["']([A-Za-z0-9_-]+)["']\s*\)""", game_page.driver_js()))
        self.assertEqual([], sorted(i for i in driver_ids if i not in declared and i != "gameVisualDone" and i != "gvSave"),
                         "the driver looks up ids the page does not declare (it creates only gameVisualDone and gvSave)")

    def test_autorun_seeds_and_config_escape(self) -> None:
        html = game_page.page_html(autorun=True, seeds=[1, 777])
        self.assertIn('window.__GAME_VISUAL_CONFIG__ = {"autorun": true, "seeds": [1, 777]};', html)
        anchor = "for (var si3 = 0; si3 < grid.length; si3++)"      # a probe anchor with a '<' in it
        html2 = game_page.page_html(mutations=[(anchor, anchor)])
        cfg = re.search(r"window\.__GAME_VISUAL_CONFIG__ = (.*);</script>", html2).group(1)
        self.assertNotIn("<", cfg, "config JSON must not carry a raw '<' into a <script>")
        self.assertEqual(anchor, json.loads(cfg)["mutated"][0])

    def test_mutations_need_exactly_once_anchors_and_touch_only_a_copy(self) -> None:
        with self.assertRaises(game_page.GamePageError):
            game_page.page_html(mutations=[("function ", "function ")])
        with self.assertRaises(game_page.GamePageError):
            game_page.page_html(mutations=[("no such anchor in the game", "")])
        before = game_page.PAGE.read_bytes()
        anchor = "function drawLayersCeiling3D() {"
        replacement = anchor + " return; /* mutation: missing ceiling */"
        html = game_page.page_html(mutations=[(anchor, replacement)])
        self.assertIn(replacement, html)
        self.assertEqual(before, game_page.PAGE.read_bytes(), "a probe build modified the header")

    def test_cli_builds_a_page(self) -> None:
        with tempfile.TemporaryDirectory() as out:
            proc = subprocess.run([sys.executable, "-m", "tools.webui.game_page", "--out", out, "--autorun", "--seeds", "12345"],
                                  cwd=REPO_ROOT, capture_output=True, text=True, timeout=120)
            self.assertEqual(0, proc.returncode, proc.stderr)
            self.assertIn("wrote ", proc.stdout)
            built = pathlib.Path(out) / game_page.PAGE_NAME
            self.assertTrue(built.exists())
            self.assertIn('{"autorun": true, "seeds": [12345]}', built.read_text(encoding="utf-8"))


@unittest.skipUnless(JS_ENGINE, "a JavaScript engine (node/deno/bun/qjs/jsc/osascript) is required")
class GamePageScriptsParseTests(unittest.TestCase):
    """Every <script> region of the built page parses as a classic script."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory(prefix="hw1_game_page_syntax_")
        work = pathlib.Path(cls.tmp.name)
        html = game_page.page_html(autorun=True, seeds=[12345])
        spans = extract_js._script_spans(html)
        cls.names = []
        lines = []
        for k, (a, b) in enumerate(spans):
            region = html[a:b]
            name = ("driver" if "GameVisual" in region and "function resetEndlessMode" not in region
                    else "hw-stub" if "__HW_STUB__" in region
                    else "config" if "__GAME_VISUAL_CONFIG__" in region
                    else "game" if "function resetEndlessMode" in region
                    else f"region{k}")
            f = work / f"page_{k}.js"
            f.write_text(region, encoding="utf-8")
            cls.names.append(name)
            lines.append(json.dumps({"name": name, "file": str(f)}))
        manifest = work / "manifest.jsonl"
        manifest.write_text("\n".join(lines) + "\n", encoding="utf-8")
        cls.result = run_js(CHECKER, [str(manifest)])
        cls.out = cls.result.stdout.splitlines()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def test_expected_regions(self) -> None:
        self.assertEqual(EXPECTED_SCRIPT_REGIONS, len(self.names), self.names)
        for want in ("hw-stub", "config", "game", "driver"):
            self.assertIn(want, self.names)

    def test_every_region_parses(self) -> None:
        verdicts = [l for l in self.out if l.startswith("SYNTAX_RESULT")]
        self.assertEqual(["SYNTAX_RESULT PASS"], verdicts,
                         "\n".join(l for l in self.out if l.startswith("SYNTAX FAIL")) + "\n" + self.result.stderr[-2000:])
        ok = [l.split(" ", 2)[2] for l in self.out if l.startswith("SYNTAX OK ")]
        self.assertEqual(sorted(self.names), sorted(ok))


if __name__ == "__main__":
    unittest.main()
