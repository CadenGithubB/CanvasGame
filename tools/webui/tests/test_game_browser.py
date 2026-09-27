"""Rendered-pixel checks for the Endless crawler: the browser suite.

The other game suites run the game against a stub canvas and count which
polygons a draw pass SUBMITS. This suite looks at what actually lands on
screen, in two halves:

IN A REAL BROWSER  (tools/webui/harness/game_browser_driver.js)
    tools/webui/game_page.py builds a standalone copy of the Games page (the
    real CSS/HTML/JS blocks of WebPage_Games.h + a stub window.hw + the driver).
    The driver starts Cave Test through the page's own terrain dropdown,
    freezes time, places the player at seven views per cave entrance (inside
    the tunnel looking in and out, in the arch, on the open ramp at +260/+232 on
    seed 12345, on the cap above the tunnel, far out on open ground), calls
    the page's draw() with DEBUG_POLY_TYPES on and with each render pass
    skipped in turn (the game's own DEBUG_HIDE_* toggles), draws the entrance
    arch just as renderFrame does, reads the canvas
    back, attributes every pixel to the pass that painted it, classifies floor
    pixels by hue, and grades the class fractions (whole frame / top half /
    bottom half). It reports PASS/FAIL lines like the headless harnesses, plus
    screenshots and a text class map per view. BROWSER_KNOWN_BUGS below lists
    what fails today and why. BROWSER_PROBES preserves the inherited real-
    browser mutation evidence and the phase-2 additions that must be rerun
    before completion; FIX entries test the stated cause and BREAK entries test
    that a passing gate can actually detect damage.

        python3 -m tools.webui.game_page --out /tmp/gv          # build
        open file:///tmp/gv/game_visual.html?autorun=1            # any browser
        # default seeds: 12345,424242; optional overrides are provenance-checked
        # for grading: &seeds=1,777  &views=inside_in,arch_in  &shots=0
        # grade a run: "save results" on the page (or copy the results <pre>), then
        HW1_GAME_BROWSER_RESULTS=/path/results.txt python3 -m unittest tools.webui.tests.test_game_browser

HEADLESS  (tools/webui/harness/game_browser_harness.js, run by unittest)
    The same driver file loaded into the LAB stub environment next to the real
    game, testing everything that does not need pixels: its entrance frame is
    tied to queryCaveGeometry's real approach/corridor convention; every view
    lands where it says on the layer it names and reaches a scene independently
    confirmed by LAB; its hue classifier agrees with LAB.polyClass on every
    colour the floor and ceiling passes submit (124,944 fills) and on the palette at every
    light level; its pass attribution and top/bottom split are exact on a
    synthetic frame set; its check logic passes an ideal scene, fails audit D5's
    scene and fails any view that never reached its scene; and a whole driver
    run headless reports every frame blank (no pixel check can pass without a
    real canvas).

        python3 -m unittest tools.webui.tests.test_game_browser -v
        HW1_GAME_PROBES=1 python3 -m unittest tools.webui.tests.test_game_browser     # + mutation probes
        python3 -m tools.webui.game_lab browser -v

What is NOT automated: nothing here launches a browser. The pixel half runs
when someone opens the page (or when Claude drives the built-in browser pane);
its output is then graded by BrowserResultsGrading below.

Ownership: render owns the automated D4/D5/N13 and E8 verdicts; these browser
checks are opt-in confirmation of the final composited pixels and retain the
otherwise-missing looking-out direction. caves_transition owns D3/D9 lighting
transitions. The endpoint darkness check remains a browser baseline because a
16-entrance review sweep found no false verdict; it is not treated as a D9
transition check. Dirt-skirt occlusion remains diagnostic only (<=1.53% of the
reviewed lower frame), not a verdict without a reproduced user-visible defect.
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import types
import unittest

from tools.webui import game_lab, game_page
from tools.webui.game_lab import probe_testcase, suite_testcase

DRIVER = game_page.DRIVER

# ── the headless half ────────────────────────────────────────────────────────
# Every headless check passes today: they test the driver, not the game.
KNOWN_BUGS: dict[str, tuple[str, str]] = {}

_CLASSIFY = "browser: the driver's hue classifier agrees with LAB.polyClass on every colour the floor and ceiling passes submit"
_SCENES = "browser: every driver view reaches its scene on the default Cave Test seeds"
_LAB_SCENES = "browser: LAB independently confirms every driver view's scene on the default Cave Test seeds"
_PLACED = "browser: every driver view places the player where it says, on the layer it names"
_HEADLESS = "browser: a headless driver run completes, renders every view without exceptions, and reports every frame blank"

PROBES: list[tuple] = [
    ("BREAK: the floor pass paints tilted quads orange-yellow (#ffb000, g/r 0.69) -- a palette the "
     "classifier cannot follow must be caught, not silently re-labelled",
     "else if (_ptMaxDz >= 2.0) baseCol = '#ffdc00';",
     "else if (_ptMaxDz >= 2.0) baseCol = '#ffb000';",
     {_CLASSIFY: "FAIL", _PLACED: "PASS"}),
    ("BREAK: no surface caps anywhere (CAP_EXCL_SQ huge, 6647) -- the inside and cap views no longer "
     "reach a buried tunnel, so the browser checks there would be vacuous",
     "var CAP_EXCL_SQ = 30 * 30;",
     "var CAP_EXCL_SQ = 1e12;",
     {_SCENES: "FAIL", _LAB_SCENES: "FAIL", _PLACED: "PASS"}),
    ("BREAK: the walkable-layer picker returns the walk target 0.5 h too high",
     "if (best_idx >= 0) return {topH: best_topH, idx: best_idx, type: best_type, action: 'walk'};",
     "if (best_idx >= 0) return {topH: best_topH + 0.5, idx: best_idx, type: best_type, action: 'walk'};",
     {_PLACED: "FAIL", _SCENES: "FAIL", _LAB_SCENES: "FAIL"}),
    ("BREAK: drawFloorScatter3D throws while the player is underground",
     "function drawFloorScatter3D() {",
     "function drawFloorScatter3D() { if (playerUnderground) throw new Error('probe');",
     {_HEADLESS: "FAIL"}),
    ("BREAK: the DEBUG_POLY_TYPES floor palette is disabled",
     "        if (DEBUG_POLY_TYPES) {\n          var _ptMaxDz",
     "        if (false) {\n          var _ptMaxDz",
     {_CLASSIFY: "FAIL"}),
]

BrowserSuite = suite_testcase("browser", KNOWN_BUGS, min_checks=10)
BrowserProbes = probe_testcase("browser", PROBES)

# ── the in-browser half ──────────────────────────────────────────────────────
_RENDER = "browser: every view renders through the page's renderFrame() without render-pass exceptions"
_PAINTED = "browser: every view's frame is painted (the canvas is not blank)"
_REDRAW = "browser: redrawing the same view paints identical pixels"
_CEIL = "browser: inside the tunnel the upper half of the view shows the tunnel ceiling"
_OVER = "browser: inside the tunnel no sky, grass or surface cap is visible overhead"
_INFLOOR = "browser: inside the tunnel the lower half of the view shows the cave floor"
_OUTCEIL = "browser: looking back out from inside the tunnel the ceiling is visible overhead"
_OUTOVER = "browser: looking out from inside and standing in the archway show no grass or surface cap overhead"
_ARCHMESH = "browser: looking back out from inside the tunnel includes the cave entrance arch"
_ARCH = "browser: standing in the archway the tunnel floor ahead is visible below the horizon"
_RAMP = "browser: from the open approach ramp the cave floor ahead is visible below the horizon"
_BLEED = "browser: from the cap above the tunnel no cave floor, cave ceiling or cave wall shows through"
_FAR = "browser: far from the cave the view is sky above and grass below, with no cave surfaces"
_DARK = "browser: 150 u inside the tunnel the scene is darker than open ground at noon"

# The seed-12345 baselines were measured in Chrome 152 (the Claude desktop
# browser pane), 2026-09-18. The seed-424242 N13 entry comes from the phase-2
# render/browser review evidence and must be confirmed by the revised default
# browser run. Header lines are WebPage_Games.h.
BROWSER_KNOWN_BUGS: dict[str, tuple[str, str]] = {
    _CEIL: (
        "audit D5; drawLayersCeiling3D skips every ceiling quad with a walkable layer above it (13045-13050) and "
        "every tunnel ceiling has the surface cap above it: 0.00% ceiling pixels in the upper half (43.52% cap + "
        "7.44% grass instead). Render owns the automated D5 verdict; this is its opt-in pixel confirmation.",
        r"BAD s12345e0 inside_in .*top ceiling=0\.00%"),
    _OVER: (
        "audit D5; drawLayersFloor3D (12680-12694) never culls walkable layers above an underground camera, so the "
        "cap and grass over the tunnel are painted overhead: 43.52% cap + 7.44% grass. After the main D5 fix, "
        "ceiling-stitch holes (_ctol 0.8, 13027-13034) account for about 7 percentage points of sky and the rest "
        "is missing lateral rock (D14/N15). Render owns D5; the browser uniquely confirms final pixels.",
        r"BAD s12345e0 inside_in .*top sky\+surface\+cap=[1-9]\d*(?:\.\d+)?%"),
    _OUTCEIL: (
        "audit D5 (as above), looking back out from along -60: the pre-arch baseline had 0.00% ceiling and visible "
        "grass/cap overhead. This revised check grades the player-visible pixels after the entrance arch; its exact "
        "fractions must be refreshed by the revised default browser run.",
        r"BAD s12345e0 inside_out .*top ceiling=0\.00%"),
    _OUTOVER: (
        "audit D5/U5 outside-facing companion: looking out from the tunnel and standing in the archway show the "
        "surface/cap overhead in the inherited pre-arch baseline. Sky ahead is allowed. The revised exact fractions "
        "must be refreshed after the entrance mesh is composited. Render owns D5; this preserves the missing "
        "pixel-facing direction.",
        r"BAD s12345e0 inside_out .*top surface\+cap=[1-9]\d*(?:\.\d+)?%"),
    _ARCH: (
        "audit D4; the arch cell is uncapped (CAP_EXCL 30 u, 6647/6670) so updateDayNight says playerUnderground="
        "false, and drawLayersFloor3D 12691-12692 then skips every capped tunnel-floor cell: the lower half is 94.53% "
        "the floor pass's empty ground-plane fill (12474-12482), 0.00% cave floor. Render owns D4.",
        r"BAD s12345e0 arch_in .*bottom caveFloor=0\.00%"),
    _RAMP: (
        "audit D4 + roof misplacement (C table); from the open ramp at +260/+232 (the roof starts at +225) the same "
        "12691-12692 skip hides the buried tunnel floor: 0.00% cave floor, 64.08%/68.38% empty ground plane in the "
        "lower half. Render owns the automated D4/D2 coupling verdict.",
        r"BAD s12345e0 ramp_(?:far|near)_in .*bottom caveFloor=0\.00%"),
    _BLEED: (
        "audit N13 pixel confirmation on default seed 424242: a cap camera sees 1.70% buried cave-wall pixels. "
        "Render owns the automated N13 verdict and identifies the cause: capped walls under a higher neighbouring "
        "hill are not culled for a surface camera (12052; wallCapZ uses the highest 3x3 cap at 6944-6957).",
        r"BAD s424242e0 cap_along .*caveFloor\+ceiling\+caveWall=[1-9]\d*(?:\.\d+)?%"),
}

# (description, [(anchor, replacement), ...], {check_id: expected}). The
# inherited probes were run in Chrome 152 on 2026-09-18, but the revised
# two-seed/arch-composited driver changes their protocol: every page below must
# be rerun before completion. Pages are built from an in-memory game copy.
# Unittest cannot launch a browser, so BrowserContractTests only keeps anchors,
# ids and each page's targeted seed/view metadata honest.
_D5_CEIL = ("if (hasCapAbove) continue;", "if (false && hasCapAbove) continue;")
_D5_FLOOR = (
    "var L0 = layerAt(idx0, li); if (!L0 || (L0[1] !== 1 && L0[1] !== 3 && L0[1] !== 4)) continue;",
    "var L0 = layerAt(idx0, li); if (!L0 || (L0[1] !== 1 && L0[1] !== 3 && L0[1] !== 4)) continue; "
    "if (playerUnderground && L0[0] * 25 > cameraZ) continue;",
)
_D3_ARCH_CAP = ("var CAP_EXCL_SQ = 30 * 30;", "var CAP_EXCL_SQ = 0;")

# Current renderer mutations. Historical D4/D5 FIX snippets targeted culls
# removed by the scene-depth renderer; retaining them tests obsolete code.
# These pages must also be exercised in a real browser before claiming pixel
# regression coverage. The contract tests below only validate their construction.
BROWSER_PROBES: list[tuple[str, list[tuple[str, str]], dict[str, str]]] = [
    ("BREAK: tunnel ceiling pass is missing",
     [("function drawLayersCeiling3D() {", "function drawLayersCeiling3D() { return;")],
     {_CEIL: "FAIL"}),
    ("BREAK: all floor geometry is missing",
     [("function drawLayersFloor3D() {", "function drawLayersFloor3D() { return;")],
     {_INFLOOR: "FAIL", _FAR: "FAIL"}),
    ("BREAK: a draw pass throws underground",
     [("function drawFloorScatter3D() {",
       "function drawFloorScatter3D() { if (playerUnderground) throw new Error('probe');")],
     {_RENDER: "FAIL", _REDRAW: "PASS"}),
    ("BREAK: repeated draw paints a different colour",
     [("_pt('goalMarker3D', function(){ drawGoalMarker3D(); });",
       "_pt('goalMarker3D', function(){ drawGoalMarker3D(); }); "
       "window.__probeN = (window.__probeN || 0) + 1; "
       "ctx.fillStyle = 'rgb(' + (window.__probeN % 200 + 50) + ',0,0)'; ctx.fillRect(0, 0, 4, 4);")],
     {_REDRAW: "FAIL", _RENDER: "PASS"}),
    ("BREAK painted gate: draw returns without painting",
     [("function draw() {\n  if (calibrating) { drawCalibration(); return; }",
       "function draw() { return;\n  if (calibrating) { drawCalibration(); return; }")],
     {_PAINTED: "FAIL", _OVER: "FAIL", _BLEED: "FAIL"}),
    ("BREAK: portal geometry is missing",
     [("function drawCaveEntrance3D() {", "function drawCaveEntrance3D() { return;")],
     {_ARCHMESH: "FAIL", _RENDER: "PASS"}),
]

BROWSER_PROBE_RUNS: list[dict[str, object]] = [
    {"seeds": [12345], "views": ["inside_in"]},
    {"seeds": [12345], "views": ["inside_in", "far_surface"]},
    {"seeds": [12345], "views": ["inside_in"]},
    {"seeds": [12345], "views": ["inside_in"]},
    {"seeds": [12345], "views": ["inside_in", "cap_along"]},
    {"seeds": [12345], "views": ["inside_out"]},
]


def browser_probe_page_kwargs(index: int) -> dict[str, object]:
    """Arguments for game_page.build_page for one causal mutation page."""
    _desc, mutations, _expect = BROWSER_PROBES[index]
    meta = BROWSER_PROBE_RUNS[index]
    return {"autorun": True, "seeds": list(meta["seeds"]), "mutations": mutations}


def browser_probe_query(index: int) -> str:
    """Query string for the canonical targeted run of a mutation page."""
    return "shots=0&views=" + ",".join(BROWSER_PROBE_RUNS[index]["views"])


def driver_check_ids() -> set[str]:
    """Every check id game_browser_driver.js can emit (read from its source)."""
    src = DRIVER.read_text(encoding="utf-8")
    return set(re.findall(r'\bid: "(browser: [^"]+)"', src)) | set(re.findall(r'\bpush\("(browser: [^"]+)"', src))


def driver_view_ids() -> set[str]:
    """Every view id in the driver's VIEWS table."""
    src = DRIVER.read_text(encoding="utf-8")
    block = src.split("var VIEWS = [", 1)[1].split("];", 1)[0]
    return set(re.findall(r'\bid: "([a-z0-9_]+)"', block))


class BrowserContractTests(unittest.TestCase):
    """Keeps the in-browser bookkeeping honest without a browser."""

    def test_driver_ids_are_parsed(self) -> None:
        ids = driver_check_ids()
        self.assertGreaterEqual(len(ids), 14, sorted(ids))
        self.assertTrue(all(i.startswith("browser: ") for i in ids))
        self.assertEqual(7, len(driver_view_ids()), sorted(driver_view_ids()))

    def test_known_bugs_and_probe_expectations_name_driver_checks(self) -> None:
        ids = driver_check_ids()
        named = set(BROWSER_KNOWN_BUGS)
        for _, _, expect in BROWSER_PROBES:
            named |= set(expect)
        self.assertEqual([], sorted(named - ids), "names checks the driver does not emit (renamed?)")
        for cid, value in BROWSER_KNOWN_BUGS.items():
            self.assertEqual(2, len(value), cid)
            self.assertTrue(value[0], cid)
            re.compile(value[1])

    def test_fix_probes_only_flip_known_bugs(self) -> None:
        for desc, _, expect in BROWSER_PROBES:
            if desc.startswith("FIX"):
                flips = [cid for cid, want in expect.items() if want == "PASS" and cid in BROWSER_KNOWN_BUGS]
                self.assertTrue(flips, f"FIX probe flips no known bug: {desc}")

    def test_probe_anchors_occur_exactly_once_and_build(self) -> None:
        js = game_lab.game_js()
        self.assertEqual(len(BROWSER_PROBES), len(BROWSER_PROBE_RUNS))
        view_ids = driver_view_ids()
        for index, (desc, mutations, _) in enumerate(BROWSER_PROBES):
            meta = BROWSER_PROBE_RUNS[index]
            self.assertTrue(meta["seeds"], desc)
            self.assertTrue(meta["views"], desc)
            self.assertEqual([], sorted(set(meta["views"]) - view_ids), desc)
            for anchor, _ in mutations:
                with self.subTest(probe=desc[:50], anchor=anchor[:50]):
                    self.assertEqual(1, js.count(anchor))
            game_page.page_html(**browser_probe_page_kwargs(index))  # anchors exactly once; embeds causal seed set


@unittest.skipUnless(os.environ.get("HW1_GAME_BROWSER_RESULTS"),
                     "grading a browser run is opt-in: HW1_GAME_BROWSER_RESULTS=<saved results text>")
class BrowserResultsGrading(unittest.TestCase):
    """Grade a saved in-browser run the way suite_testcase grades a headless one."""

    @classmethod
    def setUpClass(cls) -> None:
        path = pathlib.Path(os.environ["HW1_GAME_BROWSER_RESULTS"])
        text = path.read_text(encoding="utf-8")
        proc = types.SimpleNamespace(stdout=text, stderr="", returncode=0)
        cls.run_ = game_lab.parse("browser-page", [str(path)], proc, 0.0)
        cls.provenance_lines_ = re.findall(r"^NOTE browser\.provenance (\{.*\})$", text, re.MULTILINE)
        cls.provenance_ = None
        if len(cls.provenance_lines_) == 1:
            try:
                cls.provenance_ = json.loads(cls.provenance_lines_[0])
            except json.JSONDecodeError:
                pass

    def test_result_provenance_is_an_unmutated_complete_page_run(self) -> None:
        self.assertEqual(1, len(self.provenance_lines_), "saved results need exactly one structured provenance NOTE")
        self.assertIsInstance(self.provenance_, dict, "browser provenance NOTE is not valid JSON")
        p = self.provenance_ or {}
        self.assertEqual(2, p.get("protocol"))
        self.assertEqual([12345, 424242], p.get("seeds"), "grade only the complete default seed set")
        self.assertEqual(sorted(driver_view_ids()), sorted(p.get("views") or []), "grade only a run containing every view")
        self.assertTrue(p.get("userAgent"), "real-browser results must identify the browser")
        self.assertEqual("page", p.get("start"), "the graded run must start Cave Test through the page handler")
        self.assertIs(False, p.get("mutated"), "refusing results from a mutation-probe page")
        self.assertEqual(0, p.get("mutationCount"))

    def test_run_completed(self) -> None:
        self.assertEqual(1, len(self.run_.verdicts), "expected exactly one HARNESS_RESULT line")
        self.assertNotIn("browser: visual run completed", {c.id for c in self.run_.checks}, "the driver run crashed")
        self.assertEqual(sorted(driver_check_ids() - {"browser: visual run completed"}),
                         sorted({c.id for c in self.run_.checks}), "the run did not report every driver check")

    def test_no_unexpected_failures(self) -> None:
        new = [f"{c.id}\n      {c.detail}" for c in self.run_.checks if not c.ok and c.id not in BROWSER_KNOWN_BUGS]
        self.assertEqual([], new, "in-browser checks FAIL that are not in BROWSER_KNOWN_BUGS:\n  " + "\n  ".join(new))

    def test_known_bugs_still_fail(self) -> None:
        by_id = self.run_.by_id()
        fixed = [k for k in BROWSER_KNOWN_BUGS if k in by_id and by_id[k].ok]
        self.assertEqual([], fixed, "these BROWSER_KNOWN_BUGS now PASS -- if that is a real fix, delete their entries")
        wrong = []
        for cid, (_reason, pattern) in BROWSER_KNOWN_BUGS.items():
            c = by_id.get(cid)
            if c is None:
                wrong.append(f"{cid}: missing")
            elif not c.ok and ("PRECONDITION" in c.detail or re.search(pattern, c.detail) is None):
                wrong.append(f"{cid}: failure does not match documented mechanism: {c.detail}")
        self.assertEqual([], wrong)


if __name__ == "__main__":
    unittest.main()
