"""Endless crawler: do the game's OWN in-page debug tools tell the truth?

Every future cave fix will be judged with these tools, so a tool that
misreports is a bug in its own right. The harness
(tools/webui/harness/game_tools_harness.js) runs the shipping tools in
components/hardwareone/WebPage_Games.h against a headless Cave Test world and
compares what each one REPORTS with what the game itself holds: pos.floorZ (the
height physics put the player at), the floorMesh layer stacks, wallFaceBase,
__caveStats, and what the draw functions actually submit to their canvases (a
local recording 2D context is installed on the stub #caveProfileCanvas and
#controlMapCanvas elements; the LAB recorder only sees the main canvas).

Tools covered (header lines):
  window.caveCapture  L1592   floor/ceiling height under the player, the data
                              needed to reproduce a state (seed, world position
                              or window origin, player height, camera yaw)
  window.caveDiag     L1418   live floor/ceiling height; lastTransitionSnapshot
                              after a rendered walk into the cave
  window.caveGaps     L1476   sensitivity to an injected raised wall base and to
                              a floor drop at each face's far vertex (W/E/N/S)
  window.debugCaveAt  L4796   floor/ceiling vs the assembled mesh at every core
                              cave cell (seed 1 is always included, even when
                              --seeds supplies a custom sweep)
  window.caveTest     L1720   the legacy async test runs to a returned report
  drawCaveProfileChart L21340 ceiling line; floor line through the player's feet
  drawCaveControlMap  L21582  cells painted as cave floor must have one
  __caveStats         L1398   outsideBlend liveness, histogram buckets vs total,
                              ceiling pipeline with no ceilings in the window
  debug checkboxes    L22239- 'Floor debug', 'Floor LINE debug', 'Texture debug'
                      22262   must change the frame or the log (control: 'Poly
                              types' must)

Worlds: Cave Test seed 12345 (every entrance; --seeds overrides); the
debugCaveAt check also runs seed 1, where the real smoothed surface falls below
the 2.0 the tool hard-codes.

Thresholds, and why ANY correct implementation meets them:

  0.05 h     a reported floor/ceiling height must match the layer the player is
             standing on (caveCapture/caveDiag print 3 decimals).
  none       on the open surface cap there is no ceiling above the feet: null,
             NaN or the tool's own 0 sentinel all count as "none".
  0.5 h      the profile chart must draw SOME floor polyline within half a height
             unit of its own player marker at the player's x (read through the
             chart's own labelled grid lines); any chart that shows where the
             player stands meets it, whether it draws one line or several.
  90 %       of the chart's 60 documented profile samples (L21362-21370) that lie
             under a ceiling layer must get a ceiling vertex (>= 10 such samples
             required, else PRECONDITION).
  0 cells    the control map may paint a cell with its underground palette only
             if the cell has a walkable layer below -0.1 (the map's own
             threshold, L21649).
  0.25 h     debugCaveAt at a cell's stamping point with fade 1 must give the
             stamped floor and ceiling (the stamper writes exactly those there,
             L5618/L5621); feather cells are metrics only (debugCaveAt reports the
             blend TARGET plus fade there, by design).
  found      caveGaps must list a face whose base is raised 1 h above the floor
             it samples (control), and a face whose floor at either vertex is
             dropped 2 h below its base (a floor quad's corner (x*gs, y*gs)
             carries cell (x,y)'s height, L12752-12761).
  > 0        a counter the capture prints must change at least once on a walk
             from the open surface onto the cave floor (1 walk, ~250 frames).
  <= 100 %   the panel's FLOOR REJECTION rows are percentages of 'total visited'
             (L21262-21269); their displayed sum may not exceed 100%. A valid
             label-side fix may remove per-layer stitch counters from that table.
  0          with no ceiling layer in the whole window, the ceiling pipeline may
             not report ceilings skipped/collected/rendered.
  any diff   a debug checkbox must change at least one of two scenes (surface and
             underground) in path fills, fillRects, strokes, text, ctx call
             counts or the monotonic log; it must not cause a render error, and
             must reproduce its baseline afterwards. 'Poly types' and the
             underground-only 'Ceiling wireframe' are positive controls.

Every "X never happens" check also proves its scenario reached the state where X
could happen (stood on the cap / the cave floor, walk reached the cave floor,
window truly holds no ceiling, map cells mapped back to grid cells, ...) and
FAILS with a PRECONDITION detail if not.

Run:
    python3 -m unittest tools.webui.tests.test_game_tools -v
    HW1_GAME_PROBES=1 python3 -m unittest tools.webui.tests.test_game_tools -v
    python3 -m tools.webui.game_lab tools -v
    python3 -m tools.webui.game_lab tools --seeds 12345,1,777,424242
"""

from __future__ import annotations

import unittest

from tools.webui.game_lab import probe_testcase, suite_testcase

_P = "tools: "

_LOAD = _P + "game script evaluates without throwing"
_C1 = _P + "caveCapture reports the floor height of the layer the player is standing on (surface cap and cave floor)"
_C2 = _P + "caveCapture reports the ceiling above the player's standing layer (none on the open surface cap)"
_D2 = _P + "caveDiag reports the floor height of the layer the player is standing on"
_D3 = _P + "caveDiag reports the ceiling above the player's standing layer (none on the open surface cap)"
_P1 = _P + "the cave profile chart draws the cave ceiling where its profile crosses ceilinged cells"
_P2 = _P + "the cave profile chart draws a floor line through the player's feet (on the surface cap and on the cave floor)"
_SEED = _P + "caveCapture records the world seed"
_XY = _P + "caveCapture records where the player is in world space (world position or window origin)"
_HEIGHT = _P + "caveCapture records the player's own height (pos.floorZ), not just the mesh under them"
_YAW = _P + "caveCapture records the camera yaw"
_SNAP = _P + "caveDiag().lastTransitionSnapshot is populated after walking from the surface into the cave"
_OUTSIDE = _P + "caveCapture's outsideBlend counter changes somewhere on a walk from the surface into the cave"
_HIST = _P + "the floor-rejection histogram's buckets never add up to more than its total"
_NO_CEIL = _P + "with no ceiling anywhere in the window, caveCapture's ceiling pipeline reports no ceilings skipped, collected or rendered"
_MAP = _P + "the control map paints a cell as cave floor only if the cell has a walkable floor below the surface"
_DCA = _P + "debugCaveAt reports the assembled mesh's cave floor and ceiling wherever it reports full cave influence"
_GAP_VERT = _P + "caveGaps reports a wall face when the floor at either of its vertices drops below the wall base"
_GAP_RAISED = _P + "caveGaps reports a wall face whose base is raised above the floor beside it"
_POLY = _P + "the frame comparison detects a checkbox that is wired (Poly types, DEBUG_POLY_TYPES)"
_WIRE = _P + "the frame comparison detects an underground-only checkbox that is wired (Ceiling wireframe, DEBUG_CEIL_WIRE)"
_FLOOR = _P + "ticking 'Floor debug' (DEBUG_FLOOR) changes what the game draws or logs"
_FLOOR_LINE = _P + "ticking 'Floor LINE debug' (DEBUG_FLOOR_LINE) changes what the game draws or logs"
_TEXTURE = _P + "ticking 'Texture debug' (DEBUG_TEXTURE) changes what the game draws or logs"
_I4 = _P + "window.caveTest runs to completion and returns a report"

# check id -> (why it fails today, regex its FAIL detail must match). The regex
# pins the mechanism so a precondition or an unrelated new failure cannot remain
# hidden behind the expected-failure list.
KNOWN_BUGS: dict[str, tuple[str, str]] = {
    _C1: (
        "audit I/D6: caveCapture takes floorH from getFloorHeightAt (L1600 -> L7816), which blindly "
        "returns l0TopZ; on the grass cap over the corridor it reports the buried cave floor",
        r"on cap: standing h [^,]+, caveCapture floorH -"),
    _C2: (
        "audit I/D6: L1601-1607 take the first l1/l2 type-2 layer regardless of which layer the player "
        "stands on, so the open cap reports the buried ceiling (and a ceiling sorted into l0 is missed)",
        r"on cap: ceiling above the feet none, caveCapture ceilH -"),
    _D2: (
        "audit I/D6: caveDiag live.player.floorH is getFloorHeightAt (L1422-1423), so it reports the "
        "buried l0 floor while the player stands on the cap",
        r"on cap: standing h [^,]+, caveDiag floorH -"),
    _D3: (
        "audit I/D6: caveDiag L1430-1431 has the same l1/l2-only, standing-layer-blind ceiling lookup "
        "as caveCapture",
        r"on cap: ceiling above the feet none, caveDiag ceilH -"),
    _P1: (
        "audit I6: drawCaveProfileChart draws a ceiling only when its height is >0.1 (L21449/L21476), "
        "while Cave Test ceilings are negative; the oracle matches both chart x and chart height",
        r"matched 0/\d+ ceiling samples by x and height"),
    _P2: (
        "audit D6: the chart samples getFloorHeightAt (L21371), so on the cap its only floor line is the "
        "buried cave floor while the chart's own player marker is at the feet",
        r"on cap: player marker at h [^,]+, nearest drawn floor line at"),
    _XY: (
        "audit I3: snap.player.x/y are window-local and the capture records neither a world position nor "
        "windowOriginX/Y (L1647-1673)",
        r"no distinct numeric paths tracked both world x/y or origin x/y"),
    _HEIGHT: (
        "audit I3: the capture has mesh floorH/ceilH but never pos.floorZ; the differential fixture holds "
        "x/y fixed and raises the airborne player between layers",
        r"no numeric path tracked player h"),
    _YAW: (
        "audit I3: the snapshot has no cam.ang; two otherwise identical captures use distinct yaws to "
        "exclude coincidental entrance angles and counters",
        r"no numeric path tracked yaw 2\.2 -> 0\.9"),
    _SNAP: (
        "audit I3: caveDiag reads window.__caveDebugLast (L1419), but the page never writes it; the harness "
        "requires a non-null JSON value different from the pre-walk snapshot",
        r"left lastTransitionSnapshot null or unchanged"),
    _HIST: (
        "audit I5: the panel presents per-layer floorBlendRange as a percentage of per-cell floorTotal "
        "(L21262-21269), so its displayed FLOOR REJECTION percentages exceed 100%",
        r"displayed rejection percentages total (?:1\d\d|[2-9]\d\d)"),
    _NO_CEIL: (
        "audit I5: ceilSkipLowCeil increments for every non-ceiling layer (L13021), so a window with zero "
        "type-2 layers still reports thousands of skipped ceilings",
        r'"skipLowCeil":[1-9]\d*'),
    _GAP_VERT: (
        "audit I2: W/N samples sit 1 u beyond the face (L1549-1554), past the far vertex, so a real 2 h "
        "drop at that vertex is missed while E/S are found",
        r"(?:W|N) face[^;]*NOT reported"),
    _FLOOR: (
        "audit I7: DEBUG_FLOOR is declared (L1369) and set by its checkbox (L22241), but never read",
        r"DEBUG_FLOOR surface .*identical.*underground .*identical"),
    _FLOOR_LINE: (
        "audit I7: DEBUG_FLOOR_LINE is declared (L1370) and set by its checkbox (L22242), but never read",
        r"DEBUG_FLOOR_LINE surface .*identical.*underground .*identical"),
    _TEXTURE: (
        "audit I7: DEBUG_TEXTURE is declared (L1368), set by its checkbox (L22240), forced true at load "
        "(L22497), and never read",
        r"DEBUG_TEXTURE surface .*identical.*underground .*identical"),
}

# (description, anchor, replacement, {check id: "PASS" | "FAIL"}). Anchors occur
# exactly once in game_lab.game_js(); every probe was run and seen to flip.
_WALKABLE_FH = (
    "      var fh = floorMesh.l0TopZ[idx];\n"
    "      for (var _q = 0; _q < floorMesh.layerCount[idx]; _q++) { "
    "var _qt = [floorMesh.l0Type, floorMesh.l1Type, floorMesh.l2Type, floorMesh.l3Type, floorMesh.l4Type][_q][idx]; "
    "if (_qt === 1 || _qt === 3 || _qt === 4) { "
    "fh = [floorMesh.l0TopZ, floorMesh.l1TopZ, floorMesh.l2TopZ, floorMesh.l3TopZ, floorMesh.l4TopZ][_q][idx]; break; } }\n"
    "      var _ovmLc")

PROBES: list = [
    # ── FIX probes: remove the cause, the check must go PASS ──
    ("FIX: caveCapture takes floorH from the walkable layer at the player's height",
     "var pFloorH = (typeof getFloorHeightAt === 'function') ? getFloorHeightAt(pos.x, pos.y) : 0;",
     "var pFloorH = getWalkableLayerTopAt(pos.x, pos.y, (pos.floorZ - 60) / 40).topH;",
     {_C1: "PASS", _HEIGHT: "FAIL"}),
    ("FIX: caveCapture reports the lowest ceiling layer ABOVE the player's height (none on the cap)",
     "    if (_plc >= 2 && floorMesh.l1Type[_pidx] === 2) pCeilH = floorMesh.l1TopZ[_pidx];\n"
     "    else if (_plc >= 3 && floorMesh.l2Type[_pidx] === 2) pCeilH = floorMesh.l2TopZ[_pidx];",
     "    var _ph = (pos.floorZ - 60) / 40, "
     "_pZ = [floorMesh.l0TopZ, floorMesh.l1TopZ, floorMesh.l2TopZ, floorMesh.l3TopZ, floorMesh.l4TopZ], "
     "_pT = [floorMesh.l0Type, floorMesh.l1Type, floorMesh.l2Type, floorMesh.l3Type, floorMesh.l4Type];\n"
     "    for (var _pl = 0; _pl < _plc; _pl++) if (_pT[_pl][_pidx] === 2 && _pZ[_pl][_pidx] > _ph) { pCeilH = _pZ[_pl][_pidx]; break; }",
     {_C2: "PASS"}),
    ("FIX: caveDiag takes floorH from the walkable layer at the player's height",
     "var _dPF = (typeof getFloorHeightAt === 'function' && typeof pos !== 'undefined') ?\n"
     "      getFloorHeightAt(pos.x, pos.y) : null;",
     "var _dPF = getWalkableLayerTopAt(pos.x, pos.y, (pos.floorZ - 60) / 40).topH;",
     {_D2: "PASS"}),
    ("FIX: caveDiag reports the lowest ceiling layer above the player's height",
     "        if (_dlc >= 2 && floorMesh.l1Type[_didx] === 2) _dPC = floorMesh.l1TopZ[_didx];\n"
     "        else if (_dlc >= 3 && floorMesh.l2Type[_didx] === 2) _dPC = floorMesh.l2TopZ[_didx];",
     "        var _dh = (pos.floorZ - 60) / 40, "
     "_dZ = [floorMesh.l0TopZ, floorMesh.l1TopZ, floorMesh.l2TopZ, floorMesh.l3TopZ, floorMesh.l4TopZ], "
     "_dT = [floorMesh.l0Type, floorMesh.l1Type, floorMesh.l2Type, floorMesh.l3Type, floorMesh.l4Type];\n"
     "        for (var _dl = 0; _dl < _dlc; _dl++) if (_dT[_dl][_didx] === 2 && _dZ[_dl][_didx] > _dh) { _dPC = _dZ[_dl][_didx]; break; }",
     {_D3: "PASS"}),
    ("FIX: the profile chart draws every ceiling, not only those > 0.1",
     "if (_ceils[_ci4] > 0.1) {",
     "if (_ceils[_ci4] !== 0) {",
     {_P1: "PASS"}),
    ("BREAK: the profile draws every ceiling at the right x but six height units too high",
     [("if (_ceils[_ci4] > 0.1) {", "if (_ceils[_ci4] !== 0) {"),
      ("_ceils.push(_sch);", "_ceils.push(_sch ? _sch + 6 : 0);")],
     None,
     {_P1: "FAIL"}),
    ("FIX: the profile chart samples the walkable layer nearest the player's height",
     "var _sfh = getFloorHeightAt(_sx2, _sy3);",
     "var _sfh = getWalkableLayerTopAt(_sx2, _sy3, (pos.floorZ - 60) / 40).topH;",
     {_P2: "PASS"}),
    ("FIX: caveCapture records the window origin, pos.floorZ and cam.ang",
     "    seed: (typeof WORLD_SEED !== 'undefined') ? WORLD_SEED : null,",
     "    seed: (typeof WORLD_SEED !== 'undefined') ? WORLD_SEED : null,\n"
     "    originX: windowOriginX, originY: windowOriginY, playerFloorZ: pos.floorZ, camAng: cam.ang,",
     {_XY: "PASS", _HEIGHT: "PASS", _YAW: "PASS"}),
    ("FIX: every frame writes window.__caveDebugLast",
     "  if (CAVE_TEST_MODE) drawCaveControlMap();",
     "  if (CAVE_TEST_MODE) drawCaveControlMap();\n"
     "  window.__caveDebugLast = { x: pos.x, y: pos.y, floorZ: pos.floorZ, underground: playerUnderground };",
     {_SNAP: "PASS"}),
    ("FIX: count floor layer-stitch misses in floorOutsideBlend",
     "if (_z1 !== _z1) _z1 = _clampNeighborZ(idx1, _z0);",
     "if (_z1 !== _z1) { __caveStats.floorOutsideBlend++; _z1 = _clampNeighborZ(idx1, _z0); }",
     {_OUTSIDE: "PASS"}),
    ("FIX: count blendRange at most once per cell",
     "__caveStats.floorBlendRange++;",
     "if (li === 0) __caveStats.floorBlendRange++;",
     {_HIST: "PASS"}),
    ("FIX I5 at the label side: stop presenting per-layer stitch counters as percentages of per-cell visits",
     [("    sLines.push('blendRange   ' + bar(cs.floorBlendRange, ft, 20)   + ' ' + pct(cs.floorBlendRange, ft)   + ' (' + cs.floorBlendRange + ')');",
       "    sLines.push('(layer stitches, not a rejection) ok ' + cs.floorBlendRange);"),
      ("    sLines.push('outsideBlend ' + bar(cs.floorOutsideBlend, ft, 20) + ' ' + pct(cs.floorOutsideBlend, ft) + ' (' + cs.floorOutsideBlend + ')');",
       "    sLines.push('(layer stitches, not a rejection) miss ' + cs.floorOutsideBlend);")],
     None,
     {_HIST: "PASS"}),
    ("FIX: do not count non-ceiling layers as skipped low ceilings",
     "if (!L0 || L0[1] !== 2) { __caveStats.ceilSkipLowCeil++; continue; }",
     "if (!L0 || L0[1] !== 2) { continue; }",
     {_NO_CEIL: "PASS"}),
    ("FIX: the control map colours each cell by its lowest walkable layer",
     "      var fh = floorMesh.l0TopZ[idx];\n      var _ovmLc",
     _WALKABLE_FH,
     {_MAP: "PASS"}),
    ("FIX: debugCaveAt passes the stamper's chunk-clipped 21x21 smoothed-surface maximum",
     "    var r = queryCaveGeometry(wx, wy, nets, 2.0);",
     "    var _ss = 2.0;\n"
     "    if (typeof floorMesh !== 'undefined' && floorMesh && floorMesh.surfaceH) {\n"
     "      var _g = floorMesh.gridSize, _cw = Math.ceil(CHUNK_SIZE / _g);\n"
     "      var _gx = Math.round((wx - windowOriginX) / _g), _gy = Math.round((wy - windowOriginY) / _g);\n"
     "      var _x0 = Math.floor(_gx / _cw) * _cw, _y0 = Math.floor(_gy / _cw) * _cw, _m = -Infinity;\n"
     "      for (var _dy = -10; _dy <= 10; _dy++) for (var _dx = -10; _dx <= 10; _dx++) {\n"
     "        var _nx = _gx + _dx, _ny = _gy + _dy;\n"
     "        if (_nx < _x0 || _nx >= _x0 + _cw || _ny < _y0 || _ny >= _y0 + _cw) continue;\n"
     "        if (_nx < 0 || _ny < 0 || _nx >= floorMesh.w || _ny >= floorMesh.h) continue;\n"
     "        var _v = floorMesh.surfaceH[_ny * floorMesh.w + _nx]; if (_v > _m) _m = _v;\n"
     "      }\n"
     "      if (_m !== -Infinity) _ss = _m < 1.0 ? 1.0 : _m;\n"
     "    }\n"
     "    var r = queryCaveGeometry(wx, wy, nets, _ss);",
     {_DCA: "PASS"}),
    ("FIX: caveGaps samples the face vertices themselves (no 1 u offset past the face)",
     "var off = 1.0;",
     "var off = 0.0;",
     {_GAP_VERT: "PASS", _GAP_RAISED: "PASS"}),
    ("FIX: the three dead debug flags each do something observable",
     "  if (DEBUG_CAVE) drawCaveDebug();",
     "  if (DEBUG_FLOOR) console.log('[FLOOR-DBG]');\n"
     "  if (DEBUG_FLOOR_LINE) { ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 1, 1); }\n"
     "  if (!DEBUG_TEXTURE) console.log('[TEX-DBG off]');\n"
     "  if (DEBUG_CAVE) drawCaveDebug();",
     {_FLOOR: "PASS", _FLOOR_LINE: "PASS", _TEXTURE: "PASS"}),
    ("FIX: implement Floor LINE debug as its declaration promises, by painting the ground plane red",
     "ctx.fillStyle = rgbQ(_gr, _gg, _gb);",
     "ctx.fillStyle = DEBUG_FLOOR_LINE ? '#ff0000' : rgbQ(_gr, _gg, _gb);",
     {_FLOOR_LINE: "PASS"}),
    # ── BREAK probes: inject a bug, a passing check must go FAIL ──
    ("BREAK: the page script throws at load (the detail must stay on one parseable line)",
     "var __caveStats = {",
     "throw new Error('probe: page script throws at load');\nvar __caveStats = {",
     {_LOAD: "FAIL"}),
    ("BREAK: caveGaps ignores wallFaceBase and uses the legacy neighbour-centre min",
     "baseFh = wallFaceBase[(gy * gridW + gx) * 4 + fi];",
     "baseFh = Math.min(fh, nfh);",
     {_GAP_RAISED: "FAIL"}),
    ("BREAK: caveCapture drops the seed",
     "    seed: (typeof WORLD_SEED !== 'undefined') ? WORLD_SEED : null,",
     "    seed: null,",
     {_SEED: "FAIL"}),
    ("BREAK: the 'Poly types' checkbox goes dead (DEBUG_POLY_TYPES pinned false)",
     "var DEBUG_POLY_TYPES = false;",
     "Object.defineProperty(window, 'DEBUG_POLY_TYPES', { get: function () { return false; }, "
     "set: function () {}, configurable: true });",
     {_POLY: "FAIL"}),
    ("BREAK: lastTransitionSnapshot is a stale object written once at page load",
     "var __caveStats = {",
     "window.__caveDebugLast = { stale: true };\nvar __caveStats = {",
     {_SNAP: "FAIL"}),
    ("BREAK: remove floorOutsideBlend while leaving the per-layer blendRange over-count",
     [("  floorBlendRange: 0, floorOutsideBlend: 0,", "  floorBlendRange: 0,"),
      ("  __caveStats.floorOutsideBlend = 0; // repurposed: layer-stitch misses\n", "")],
     None,
     {_OUTSIDE: "FAIL", _HIST: "FAIL"}),
    ("BREAK: rename skipLowCeil while it still reports non-zero work in a ceiling-free window",
     "      visited: ct, skipLowCeil: cs.ceilSkipLowCeil, skipEntrRange: cs.ceilSkipEntrRange,",
     "      visited: ct, skipLowCeiling: cs.ceilSkipLowCeil, skipEntrRange: cs.ceilSkipEntrRange,",
     {_NO_CEIL: "FAIL"}),
    ("BREAK: caveCapture records only originX, so the world y coordinate cannot be recovered",
     "    seed: (typeof WORLD_SEED !== 'undefined') ? WORLD_SEED : null,",
     "    seed: (typeof WORLD_SEED !== 'undefined') ? WORLD_SEED : null,\n    originX: windowOriginX,",
     {_XY: "FAIL"}),
    ("BREAK: ticking Floor debug crashes the floor pass; a crash is not a working checkbox",
     "  // Reset debug stats for this frame",
     "  if (DEBUG_FLOOR) __noSuchFloorDebugFn();\n  // Reset debug stats for this frame",
     {_FLOOR: "FAIL"}),
    ("BREAK: the underground-only Ceiling wireframe checkbox goes dead",
     "var DEBUG_CEIL_WIRE = false;",
     "Object.defineProperty(window, 'DEBUG_CEIL_WIRE', { get: function () { return false; }, "
     "set: function () {}, configurable: true });",
     {_WIRE: "FAIL"}),
    ("BREAK: legacy caveTest rejects instead of returning its report",
     "window.caveTest = async function() {",
     "window.caveTest = async function() {\n  throw new Error('probe caveTest rejection');",
     {_I4: "FAIL"}),
]

ToolsSuite = suite_testcase("tools", KNOWN_BUGS, min_checks=25)
ToolsProbes = probe_testcase("tools", PROBES)

if __name__ == "__main__":
    unittest.main()
