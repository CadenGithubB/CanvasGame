"""Deterministic performance budgets for the Endless crawler (WebPage_Games.h).

What this suite covers (harness: tools/webui/harness/game_perf_harness.js):

  - floor render buffer capacity (D25): cells the floor pass REALLY writes into
    _drawFloorCellBuf (40,000 cells, L786; unguarded write L12643), counted from
    a NaN-filled buffer and re-measured with a 4x scratch buffer when the pass
    fills it -- at every quality preset in Endless and across fixed Level 4, at
    pitch 0 / pitchMax, base / dash FOV and a full heading sweep;
  - window-rebuild budgets (G3), counted with LAB.countCalls("assembleWindow"):
    once per chunk-window change from the settings overlay's own Apply click
    through the rAF and two more frames, none while walking inside one chunk,
    at most two for 2 u of jitter across a chunk line (each crossing one real
    loop() frame), and at most 2 console lines per re-centre;
  - steady-state play (N17, G6): console lines AND console.errors, and
    _rgbCache growth against a generous bound, over real loop() play at one
    near and two far sites, render errors a precondition;
  - frame-rate independence (G7/N1; this suite owns it): arrow-key yaw, WASD
    walking, gamepad stick yaw and gamepad X walking, the real loop() driven at
    60 fps vs 30 fps for one second of game time;
  - fullscreen honouring the resolution setting (G4);
  - per-frame work that should not be per-frame: parseInt per floor quad (G1),
    biome noise per wall cell (G2), the overview map's per-frame redraw (G5);
  - the first frame on a fresh page toggling the control mode (N11), gamepad
    polling without an in-flight guard (E6), the Perf HUD fps formula (G8).

Not here, by ownership: whether a fixed level's floor pass completes (D24 --
render suite), Apply duplicating enemies (D23 -- persistence), chunk-state
growth (H8 -- persistence). A same-size-rebuild buffer-reuse verdict (G3
allocation) is deliberately NOT a check: caves_transition detects window shifts
by floorMesh identity, so demanding reuse would push a fix that blinds it; the
typed-array bytes stay a METRIC.

Pass/fail is decided only by counts (cells written, rebuilds, calls, console
lines, cache entries, fills, radians, world units, the HUD's own text).
Wall-clock time is reported as METRIC ids ending in _ms and never decides a
verdict; so are per-pass fills, window typed-array bytes and the
buffered-but-unfilled floor ratio.

Run:
    python3 -m unittest tools.webui.tests.test_game_perf -v
    python3 -m tools.webui.game_lab perf -v                       # readable report + metrics
    python3 -m tools.webui.game_lab perf --endless-seeds 424242,2,31337
    HW1_GAME_PROBES=1 python3 -m unittest tools.webui.tests.test_game_perf   # mutation probes

Line numbers are WebPage_Games.h header lines.
"""

from __future__ import annotations

import unittest

from tools.webui.game_lab import probe_testcase, suite_testcase

_LOAD = "perf: game script evaluates without throwing"
_ENDLESS_BUF = "perf: Endless floor render buffer never overflows at any quality preset, pitch, dash FOV or heading"
_PRESET = "perf: applying a quality preset rebuilds the window once when the chunk window changes and never otherwise"
_L4 = "perf: fixed Level 4 floor render buffer never overflows at any camera position, pitch, dash FOV or heading"
_JITTER = "perf: jittering 2 u across a chunk line 10 times rebuilds the window at most twice"
_SPAM = "perf: steady-state play writes nothing to the console"
_NO_REBUILD = "perf: walking inside one chunk triggers no window rebuild"
_RGB = "perf: colour-string cache stays bounded (at most 8,192 entries) during play"
_TURN = "perf: arrow-key turn rate is the same at 30 fps and 60 fps (within 5%)"
_WALK = "perf: walking speed is the same at 30 fps and 60 fps (within 5%)"
_GPTURN = "perf: gamepad stick turn rate is the same at 30 fps and 60 fps (within 5%)"
_GPWALK = "perf: gamepad X-button walking speed is the same at 30 fps and 60 fps (within 5%)"
_FS = "perf: entering fullscreen sizes the canvas by the resolution setting"
_N11 = "perf: the first frame on a freshly loaded page does not toggle the control mode"
_E6 = "perf: gamepad polling keeps at most one request in flight"
_OVERVIEW = "perf: a frame with the overview map open costs no more fills than a normal 3D frame"
_G1 = "perf: a repeated floor pass parses no colour strings per quad"
_G2 = "perf: a repeated walls pass samples no biome noise"
_G3LINES = "perf: a window re-centre writes at most 2 console lines"
_HUD = "perf: the Perf HUD fps readout matches the rate the loop runs at"

_FPS_WHY = ("loop() calls handleInput(FIXED_DT) once per RENDER frame (L21910) while gameUpdate runs once per "
            "physics step (L21916-21920), so at 30 fps every per-handleInput quantity accrues half as fast per second")

# check id -> (why it fails today, regex its FAIL detail must match). The regex
# pins the mechanism: a known bug that starts failing for another reason (a
# PRECONDITION, a different count) stops being "expected".
KNOWN_BUGS: dict[str, tuple[str, str]] = {
    _L4: (
        "audit D25: _drawFloorCellBuf holds 40,000 cells (L786) and the write at L12643-12646 is unguarded; "
        "Level 4 viewDist is 2304 (L7677), so the pass wants up to 46,596 cells at (2160,480) pitch 1.4 + dash, "
        "heading 90deg -- and 43,290 already at pitch 0, so a fix aimed only at the high-pitch under-foot skirt "
        "(L12630-12641) is not enough. Typed-array writes past the end are silently dropped. (Invisible today only "
        "because D24 -- render suite -- makes every fixed-level floor pass throw at L12788 after buffering.)",
        r"demand \d+\+? > capacity 40000 \(over by \d+\)"),
    _JITTER: (
        "audit G3: updateChunks (L7474-7501) re-centres whenever the player's chunk differs from the window "
        "centre (L7483, no hysteresis), so 10 one-frame crossings of a chunk line = 10 assembleWindow calls "
        "(~20 console lines each)",
        r"10/10 crossings, (?:[3-9]|\d\d+) rebuilds"),
    _SPAM: (
        "N17: loop() (L21953-21966) console.warns a [STATE] line on ~0.5% of frames once the player is >1500 u "
        "from the origin (or after any render error); seed 424242, reseeded windows: 0 lines near spawn, "
        "4 + 8 in 900 frames at each far site (~2,520 and ~2,260 u out)",
        r"\[STATE @"),
    _TURN: (
        "audit G7: " + _FPS_WHY + "; arrow yaw adds 2.0*dt per call (L19080): 2.000 rad at 60 fps vs 1.000 at 30",
        r"30 fps [\d.]+ rad \(ratio 0\.[3-6]\d*\)"),
    _WALK: (
        "N1 (owned here; physics dropped its 20 fps duplicate): " + _FPS_WHY + "; applyGamepad adds a velocity "
        "impulse per call (L9822-9841) while damping runs per physics step (L10195): 61.5 u vs 31.1 u in 1 s",
        r"30 fps [\d.]+ u \(ratio 0\.[3-6]\d*\)"),
    _GPTURN: (
        "G7/N1, gamepad path: " + _FPS_WHY + "; Stick Aim yaw adds x*STICK_CAM_YAW_SPEED*dt per call (L19173): "
        "1.800 rad vs 0.900 in 1 s -- a fix that only rescales the arrow-key yaw (L19080) leaves this",
        r"30 fps [\d.]+ rad \(ratio 0\.[3-6]\d*\)"),
    _GPWALK: (
        "G7/N1, gamepad path: " + _FPS_WHY + "; Stick Aim X adds a velocity impulse per call (L19180-19185), "
        "a separate code path from applyGamepad: 41.0 u vs 20.7 u in 1 s",
        r"30 fps [\d.]+ u \(ratio 0\.[3-6]\d*\)"),
    _FS: (
        "audit G4: onFullscreenChange's rAF (L690-693) sets the canvas to innerWidth x innerHeight and ignores "
        "settings.resolution, which only applySettings honours (L17773-17777)",
        r"resolution 0\.5: canvas 1280x720, want 640x360"),
    _N11: (
        "N11: gpLast starts {buttons:0, valid:false} (L998); buttons are active-low, so handleInput reads SELECT "
        "as held (L19000) without checking gpLast.valid, and the first loop() frame for a keyboard player toggles "
        "CONTROL_MODE from Stick Aim (2) to Gyro Aim (1) and logs '[CTRL] toggled' (L19001-19007)",
        r"CONTROL_MODE 2 -> 1 on the first frame"),
    _E6: (
        "audit E6: startGamepadPolling (L9772-9800) calls hw.fetchJSON every 16 ms with no in-flight guard, so a "
        "device slower than 16 ms per request accumulates requests on its single httpd task: 10 in 160 ms",
        r"(?:[2-9]|\d\d+) requests in flight"),
    _OVERVIEW: (
        "audit G5: drawDebugOverview (L18285) redraws one fillRect per grid cell every frame (L18305-18333): "
        "78,484 fills per overview frame vs 6,164 for a whole 3D frame; resetEndlessMode opens it by itself 100 ms "
        "after every Endless start (L7648)",
        r"overview frame \d{5,} fills vs normal 3D frame \d+"),
    _G1: (
        "audit G1: drawLayersFloor3D parses the '#rrggbb' layer colour with parseInt for EVERY quad (L12856) and "
        "builds a fresh 'rgb()' string per quad (L12872): 5,138 parseInt calls for 5,138 fills, on every frame",
        r"parseInt calls [1-9]\d* for \d+ floor fills"),
    _G2: (
        "audit G2: drawWalls3D samples getWallBiomeRGB (L12083) and getBiomeAt (L12100) -- smoothNoise underneath "
        "-- for every wall cell on every frame (wallColorR/G/B only hold structure overrides): 1,067 / 1,067 / "
        "2,134 calls for one repeat of the same view",
        r"getBiomeAt [1-9]\d*, getWallBiomeRGB [1-9]\d*"),
    _G3LINES: (
        "audit G3: besides updateChunks' two lines (L7484, L7493) every re-centre runs ~18-24 diagnostic "
        "console.logs inside assembleWindow and chunk generation (L6793-L7385): 26/26/19/19/26 lines",
        r"max (?:[3-9]|\d\d+) lines per re-centre"),
}

# Shared probe texts.
_BUF = "var _drawFloorCellBuf = new Float32Array(120000);"
_LOD_ANCHOR = ("      if (distSq > viewDistSq) { __caveStats.floorDistCull++; continue; }\n"
               "      // \"Under-foot skirt\"")


def _lod(dist: int) -> str:
    return ("      if (distSq > viewDistSq) { __caveStats.floorDistCull++; continue; }\n"
            f"      if (distSq > {dist} * {dist}) {{ __caveStats.floorLodCull = (__caveStats.floorLodCull || 0) + 1; continue; }}\n"
            "      // \"Under-foot skirt\"")


_SKIP_FIXED_FLOOR = ("function drawLayersFloor3D() {\n  if (!floorMesh || !floorMesh.layerCount) return;",
                     "function drawLayersFloor3D() {\n  if (!floorMesh || !floorMesh.layerCount) return;\n  if (!ENDLESS_MODE) return;")
_STATE = "if (ENDLESS_MODE && Math.random() < 0.005) {"
_STATE_OFF = (_STATE, "if (ENDLESS_MODE && Math.random() < 0.005 && false) {")
_WALLS_THROW = ("function drawWalls3D() {", "function drawWalls3D() {\n  if (ENDLESS_MODE) throw new Error('probe walls crash');")
_RGB_CAP_4096 = ("  _rgbCache[key] = s;\n",
                 "  if (_cacheStats.rgbQ.size >= 4096) { _rgbCache = {}; _cacheStats.rgbQ.size = 0; }\n  _rgbCache[key] = s;\n")
_HYSTERESIS = ("  if (pcx !== centerCX || pcy !== centerCY) {",
               "  var _hyX = trueX - (centerCX + 0.5) * CHUNK_SIZE, _hyY = trueY - (centerCY + 0.5) * CHUNK_SIZE;\n"
               "  if (Math.abs(_hyX) > CHUNK_SIZE / 2 + 24 || Math.abs(_hyY) > CHUNK_SIZE / 2 + 24) {")
_HANDLE_INPUT = "_pt('handleInput', function(){ handleInput(FIXED_DT); });"
_N11_FIX = ("  var selectDown = ((btn & BTN_SELECT) === 0);",
            "  var selectDown = !!(gpLast && gpLast.valid) && ((btn & BTN_SELECT) === 0);")
_E6_FIX = [
    ("    if (now < gpBackoffUntil) return;\n    hw.fetchJSON('/api/sensors?sensor=input&ts=' + now)",
     "    if (now < gpBackoffUntil || tick._busy) return;\n    tick._busy = true;\n"
     "    hw.fetchJSON('/api/sensors?sensor=input&ts=' + now)"),
    ("      }).catch(function(_) { gpLast.valid = false; gpBackoffUntil = Date.now() + 200; });",
     "      }).catch(function(_) { gpLast.valid = false; gpBackoffUntil = Date.now() + 200; })\n"
     "      .then(function() { tick._busy = false; });"),
]

# (description, anchor, replacement, {check_id: "PASS" | "FAIL"})
# (description, [(anchor, replacement), ...], None, {check_id: ...})   multi-site
PROBES: list = [
    # ── FIX probes: remove a known bug's cause, its check must go PASS ──
    ("FIX D25: a 60,000-cell floor buffer holds Level 4's worst view",
     _BUF, "var _drawFloorCellBuf = new Float32Array(180000);",
     {_L4: "PASS", _ENDLESS_BUF: "PASS"}),
    ("FIX D25 by culling harder, counted in a NEW __caveStats counter: floor cells beyond 2000 u are skipped "
     "(the demand really drops to ~36k; a cull-counter formula would have read ~50k)",
     _LOD_ANCHOR, _lod(2000),
     {_L4: "PASS", _ENDLESS_BUF: "PASS"}),
    ("FIX G3: 24 u of hysteresis before re-centring the window",
     _HYSTERESIS[0], _HYSTERESIS[1],
     {_JITTER: "PASS", _NO_REBUILD: "PASS", _G3LINES: "FAIL"}),
    ("FIX N17: silence loop()'s random [STATE] dump (Math.random still consumed)",
     _STATE_OFF[0], _STATE_OFF[1],
     {_SPAM: "PASS"}),
    ("FIX G7/N1: handleInput gets the real frame interval instead of FIXED_DT",
     _HANDLE_INPUT, "_pt('handleInput', function(){ handleInput(Math.min(elapsed, 100) / 1000); });",
     {_TURN: "PASS", _WALK: "PASS", _GPTURN: "PASS", _GPWALK: "PASS"}),
    ("FIX G7/N1, a structurally different fix: sample input once per PHYSICS step",
     [(_HANDLE_INPUT, "/* input moved into the fixed step */"),
      ("      _pt('gameUpdate', function(){ gameUpdate(FIXED_DT); });",
       "      _pt('handleInput', function(){ handleInput(FIXED_DT); });\n"
       "      _pt('gameUpdate', function(){ gameUpdate(FIXED_DT); });")], None,
     {_TURN: "PASS", _WALK: "PASS", _GPTURN: "PASS", _GPWALK: "PASS"}),
    ("FIX G4: fullscreen rAF scales by settings.resolution",
     "      canvas.width  = window.innerWidth  || screen.width;\n"
     "      canvas.height = window.innerHeight || screen.height;",
     "      canvas.width  = Math.floor((window.innerWidth  || screen.width) * settings.resolution);\n"
     "      canvas.height = Math.floor((window.innerHeight || screen.height) * settings.resolution);",
     {_FS: "PASS"}),
    ("FIX G6: _rgbCache bounded at 4,096 entries (not the comment's 3,000)",
     _RGB_CAP_4096[0], _RGB_CAP_4096[1],
     {_RGB: "PASS"}),
    ("FIX N11: SELECT counts only from a connected pad",
     _N11_FIX[0], _N11_FIX[1],
     {_N11: "PASS"}),
    ("FIX E6: at most one gamepad request in flight",
     _E6_FIX, None,
     {_E6: "PASS"}),
    ("FIX G5: the overview's grid layer is drawn once into an offscreen canvas and blitted per frame",
     [("  // --- 1. Grid cells: wall vs floor, height-tinted ---\n  var cellS = ws(cell);",
       "  // --- 1. Grid cells: wall vs floor, height-tinted ---\n"
       "  var _ovKey = gridW + 'x' + gridH + '@' + windowOriginX + ',' + windowOriginY + ':' + cw + 'x' + ch;\n"
       "  var _ovBuild = drawDebugOverview._key !== _ovKey || drawDebugOverview._grid !== grid;\n"
       "  if (_ovBuild) { drawDebugOverview._c = document.createElement('canvas'); drawDebugOverview._c.width = cw;"
       " drawDebugOverview._c.height = ch; drawDebugOverview._key = _ovKey; drawDebugOverview._grid = grid; }\n"
       "  var _ovMain = ctx; ctx = drawDebugOverview._c.getContext('2d');\n"
       "  var cellS = ws(cell);"),
      ("  for (var gy = 0; gy < gridH; gy++) {\n    for (var gx = 0; gx < gridW; gx++) {\n"
       "      var isWall = grid[gy * gridW + gx];",
       "  if (_ovBuild) for (var gy = 0; gy < gridH; gy++) {\n    for (var gx = 0; gx < gridW; gx++) {\n"
       "      var isWall = grid[gy * gridW + gx];"),
      ("      ctx.fillRect(wx(gx * cell), wy(gy * cell), Math.max(1, cellS), Math.max(1, cellS));\n    }\n  }\n",
       "      ctx.fillRect(wx(gx * cell), wy(gy * cell), Math.max(1, cellS), Math.max(1, cellS));\n    }\n  }\n"
       "  ctx = _ovMain; ctx.drawImage(drawDebugOverview._c, 0, 0);\n")], None,
     {_OVERVIEW: "PASS"}),
    ("FIX G1: each floor colour string is parsed once and remembered",
     "        var _fc = parseInt(baseCol.slice(1), 16);",
     "        var _fcm = drawLayersFloor3D._fcm || (drawLayersFloor3D._fcm = {});\n"
     "        var _fc = _fcm[baseCol];\n"
     "        if (_fc === undefined) _fc = _fcm[baseCol] = parseInt(baseCol.slice(1), 16);",
     {_G1: "PASS"}),
    ("FIX G2: the walls pass caches each window cell's biome colour and biome until the window is rebuilt",
     [("function drawWalls3D() {\n  if (!grid) return;",
       "function drawWalls3D() {\n  if (!grid) return;\n"
       "  if (drawWalls3D._g !== grid) { drawWalls3D._g = grid; drawWalls3D._rgb = new Int32Array(grid.length).fill(-1);"
       " drawWalls3D._bio = new Array(grid.length); }"),
      ("          var packed = getWallBiomeRGB(worldCX, worldCY);",
       "          var packed = drawWalls3D._rgb[_wcIdx];\n"
       "          if (packed < 0) packed = drawWalls3D._rgb[_wcIdx] = getWallBiomeRGB(worldCX, worldCY);"),
      ("      var cellBiome = ENDLESS_MODE ? getBiomeAt(centerX + windowOriginX, centerY + windowOriginY)"
       " : (GAME_CONFIG.terrain || 'ground');",
       "      var cellBiome = ENDLESS_MODE ? (drawWalls3D._bio[gy * gridW + gx] || (drawWalls3D._bio[gy * gridW + gx]"
       " = getBiomeAt(centerX + windowOriginX, centerY + windowOriginY))) : (GAME_CONFIG.terrain || 'ground');")],
     None,
     {_G2: "PASS"}),
    ("FIX G3 log volume: assembleWindow (and the chunk generation it runs) stops writing diagnostics",
     "function assembleWindow(centerCX, centerCY) {",
     "function assembleWindow(centerCX, centerCY) {\n"
     "  var _awl = console.log, _aww = console.warn;\n"
     "  console.log = console.warn = function () {};\n"
     "  try { return _assembleWindowQuiet(centerCX, centerCY); } finally { console.log = _awl; console.warn = _aww; }\n"
     "}\n"
     "function _assembleWindowQuiet(centerCX, centerCY) {",
     {_G3LINES: "PASS", _JITTER: "FAIL"}),
    ("FIX G8: the Perf HUD derives fps from the interval between its own draws",
     "  var avgFt = cnt > 0 ? sumFt / cnt : 0;\n  var fps = avgFt > 0 ? (1000 / avgFt) : 0;\n  var TARGET_MS = 16.67;",
     "  var avgFt = cnt > 0 ? sumFt / cnt : 0;\n"
     "  var _hudNow = performance.now(), _hudIv = drawPerfHud._t ? _hudNow - drawPerfHud._t : 0;\n"
     "  drawPerfHud._t = _hudNow;\n"
     "  if (_hudIv > 0) drawPerfHud._iv = drawPerfHud._iv ? drawPerfHud._iv * 0.9 + _hudIv * 0.1 : _hudIv;\n"
     "  var fps = drawPerfHud._iv > 0 ? (1000 / drawPerfHud._iv) : 0;\n  var TARGET_MS = 16.67;",
     {_HUD: "PASS"}),

    # ── BREAK probes: inject a bug, a passing check must go FAIL ──
    ("BREAK: the page script throws at load (and the FAIL line must still parse under the real id)",
     _BUF, _BUF + "\nthrow new Error('probe: page script throws at load');",
     {_LOAD: "FAIL"}),
    ("BREAK: a 20,000-cell floor buffer overflows at the ultra preset",
     _BUF, "var _drawFloorCellBuf = new Float32Array(60000);",
     {_ENDLESS_BUF: "FAIL"}),
    ("BREAK: Apply's rAF rebuild is centred one chunk off, so the next frame's updateChunks rebuilds again",
     "requestAnimationFrame(function() { assembleWindow(_rebuildPcx, _rebuildPcy); });",
     "requestAnimationFrame(function() { assembleWindow(_rebuildPcx + 1, _rebuildPcy); });",
     {_PRESET: "FAIL"}),
    ("BREAK: Apply never changes WINDOW_CHUNKS (the rAF rebuilds at the old size)",
     "    WINDOW_CHUNKS = settings.chunkWindow;",
     "    /* WINDOW_CHUNKS not updated */",
     {_PRESET: "FAIL", _ENDLESS_BUF: "FAIL"}),
    ("BREAK: re-centre the window on every half-chunk line too",
     "  if (pcx !== centerCX || pcy !== centerCY) {",
     "  var _hh = Math.floor(trueX / 240), _hc = (_hh !== updateChunks._h); updateChunks._h = _hh;\n"
     "  if (pcx !== centerCX || pcy !== centerCY || _hc) {",
     {_NO_REBUILD: "FAIL"}),
    ("BREAK: [STATE] silenced, but every loop() frame writes a console.error (console.error counts as output)",
     [_STATE_OFF,
      ("  renderFrame();\n\n  // Performance logging",
       "  renderFrame();\n  console.error('[probe] per-frame console.error');\n\n  // Performance logging")], None,
     {_SPAM: "FAIL"}),
    ("BREAK: [STATE] silenced, and the walls pass throws on every Endless frame (render errors void steady state)",
     [_STATE_OFF, _WALLS_THROW], None,
     {_SPAM: "FAIL", _NO_REBUILD: "FAIL"}),

    # ── GUARD probes: a plausible change that must NOT turn a check green / red ──
    ("GUARD D25: with the buffer FIX, fixed levels that skip the floor pass must FAIL (pass wrote no cells), "
     "not read an earlier pass's counters",
     [(_BUF, "var _drawFloorCellBuf = new Float32Array(180000);"), _SKIP_FIXED_FLOOR], None,
     {_L4: "FAIL", _ENDLESS_BUF: "PASS"}),
    ("GUARD D25: culling harder beyond 1200 u, counted in a NEW counter, keeps the Endless check PASS",
     _LOD_ANCHOR, _lod(1200),
     {_ENDLESS_BUF: "PASS"}),
    ("GUARD G3: updateChunks moved from gameUpdate into loop() -- still no hysteresis, so jitter must still FAIL",
     [("  if (ENDLESS_MODE) updateChunks();\n\n  // Wall collision", "  /* moved to loop() */\n\n  // Wall collision"),
      ("  renderFrame();\n\n  // Performance logging",
       "  if (ENDLESS_MODE) updateChunks();\n  renderFrame();\n\n  // Performance logging")], None,
     {_JITTER: "FAIL", _NO_REBUILD: "PASS", _G3LINES: "FAIL"}),
    ("GUARD G6: with the 4,096 cap, a walls pass that throws every frame must void the cache check (fewer colours seen)",
     [_RGB_CAP_4096, _WALLS_THROW], None,
     {_RGB: "FAIL"}),
    ("GUARD N11: with the SELECT fix, a loop that never calls handleInput must FAIL the precondition",
     [_N11_FIX, (_HANDLE_INPUT, "/* no input */")], None,
     {_N11: "FAIL"}),
    ("GUARD E6: with the in-flight fix, polling that never starts must FAIL the precondition",
     _E6_FIX + [("function startGamepadPolling() {\n  if (gpPoll) return;",
                 "function startGamepadPolling() {\n  if (gpPoll) return;\n  return;")], None,
     {_E6: "FAIL"}),
]

# Checks whose ONLY flipping probe is a FIX of the known bug (no BREAK possible
# while the bug is present), for the record:
#   _FS, _TURN/_WALK/_GPTURN/_GPWALK, _N11, _E6, _OVERVIEW, _G1, _G2, _G3LINES, _HUD, _L4, _JITTER, _SPAM, _RGB
# each has a FIX above (plus a GUARD where a vacuous pass was possible).

PerfSuite = suite_testcase("perf", KNOWN_BUGS, min_checks=20)
PerfProbes = probe_testcase("perf", PROBES)

if __name__ == "__main__":
    unittest.main()
