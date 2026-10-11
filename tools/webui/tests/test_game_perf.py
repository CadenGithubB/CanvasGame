"""Deterministic performance budgets for the Endless crawler (WebPage_Games.h).

What this suite covers (harness: tools/webui/harness/game_perf_harness.js):

  - floor render buffer capacity (D25, repaired): cells the floor pass REALLY
    writes into _drawFloorCellBuf (a 40,000-cell start buffer that
    drawLayersFloor3D grows to the largest scan rectangle its view distance and
    mesh allow; the write itself has no bounds check), counted from a
    NaN-filled buffer, re-read after a pass that grows it (whose growing frame
    must leave the buffer it replaced untouched: a cell collected there kept
    the old capacity), and re-measured with a 4x scratch buffer when the pass
    fills it -- at every quality preset in Endless and across fixed Level 4
    from a fresh page's start buffer, at pitch 0 / pitchMax, base / dash FOV
    and a full heading sweep;
  - window-rebuild budgets (G3), counted with LAB.countCalls("assembleWindow"):
    once per chunk-window change from the settings overlay's own Apply click
    through the rAF and two more frames, none while walking inside one chunk,
    at most two for 2 u of jitter across a chunk line (each crossing one real
    loop() frame), and at most 2 console lines per re-centre;
  - steady-state play (N17, G6): console lines AND console.errors, and
    _rgbCache growth against a generous bound, over real loop() play at one
    near and two far sites, render errors a precondition (G6, an unbounded
    colour cache, is repaired: rgbQ starts a fresh generation at
    RGB_CACHE_LIMIT; a BREAK probe takes that reset out again);
  - frame-rate independence (G7/N1, repaired; this suite owns it): arrow-key yaw, WASD
    walking, gamepad stick yaw and gamepad X walking, the real loop() driven at
    60 fps vs 30 fps for one second of game time;
  - fullscreen honouring the resolution setting (G4);
  - per-frame work that should not be per-frame: parseInt per floor quad (G1),
    biome noise per wall cell (G2), the overview map's per-frame redraw (G5);
  - the first frame on a fresh page toggling the control mode (N11, repaired),
    gamepad polling without an in-flight guard (E6), the Perf HUD fps formula
    (G8, repaired).

Not here, by ownership: whether a fixed level's floor pass completes (D24,
repaired -- render suite), Apply duplicating enemies (D23 -- persistence), chunk-state
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

# check id -> (why it fails today, regex its FAIL detail must match). The regex
# pins the mechanism: a known bug that starts failing for another reason (a
# PRECONDITION, a different count) stops being "expected".
KNOWN_BUGS: dict[str, tuple[str, str]] = {
    # _L4 (audit D25: Level 4's 2304 u view wanted up to 46,596 floor cells at
    # (2160,480) pitch 1.4 + dash, heading 90deg, and 43,290 at pitch 0, from a
    # fixed 40,000-cell buffer whose write is unchecked, so typed-array writes
    # past the end were silently dropped) was repaired by codex/floor-cell-buffer:
    # drawLayersFloor3D grows _drawFloorCellBuf to the largest scan rectangle its
    # view distance and mesh allow before collecting cells. Its BREAK probes
    # below remove that growth, or reach it only in Endless, again.
    _JITTER: (
        "audit G3: updateChunks (L7474-7501) re-centres whenever the player's chunk differs from the window "
        "centre (L7483, no hysteresis), so 10 one-frame crossings of a chunk line = 10 assembleWindow calls "
        "(~20 console lines each)",
        r"10/10 crossings, (?:[3-9]|\d\d+) rebuilds"),
    _SPAM: (
        "N17: loop() (21-frame-loop.js) console.warns a [STATE] line every 3 s of loop time once the player is "
        ">1500 u from the origin (or after any render error); seed 424242: 0 lines near spawn, 5 at each far site "
        "(~2,517 and ~2,264 u out)",
        r"\[STATE @"),
    # _TURN/_WALK/_GPTURN/_GPWALK (audit G7/N1: handleInput(FIXED_DT) ran once
    # per RENDER frame while gameUpdate ran per physics step: 2.000 vs 1.000
    # rad, 61.5 vs 31.1 u, 1.800 vs 0.900 rad, 41.0 vs 20.7 u in 1 s at 30 fps)
    # were repaired before the 0.0 snapshot: runSimulationTick
    # (02-simulation-clock.js) consumes input once per fixed tick. Their FIX
    # probes became the BREAK probes below, in the same slots.
    # _FS (audit G4, V01) was repaired by the 3D-integration Stage B: entering
    # fullscreen now sizes the canvas with fullscreenCanvasSize (Resolution,
    # then the fullscreen row cap). Its FIX probe became the BREAK probe below.
    # _N11 (gpLast starts {buttons:0, valid:false}; buttons are active-low, so
    # SELECT read as held and the first loop() frame toggled CONTROL_MODE 2 ->
    # 1) was repaired before the 0.0 snapshot: pollInputControls requires
    # gpLast.valid. Its FIX probe became the BREAK probe below.
    _E6: (
        "audit E6: startGamepadPolling (L9772-9800) calls hw.fetchJSON every 16 ms with no in-flight guard, so a "
        "device slower than 16 ms per request accumulates requests on its single httpd task: 10 in 160 ms",
        r"(?:[2-9]|\d\d+) requests in flight"),
    _OVERVIEW: (
        "audit G5: drawDebugOverview (L18285) redraws one fillRect per grid cell every frame (L18305-18333): "
        "78,484 fills per overview frame vs 5,091 for a whole 3D frame; resetEndlessMode opens it by itself 100 ms "
        "after an Endless start while 'Auto overview on load' is checked (the page default; the headless stub "
        "leaves it unchecked, so the harness opens it)",
        r"overview frame \d{5,} fills vs normal 3D frame \d+"),
    _G1: (
        "audit G1: drawLayersFloor3D parses the '#rrggbb' layer colour with parseInt for EVERY quad (L12856) and "
        "builds a fresh 'rgb()' string per quad (L12872): 5,229 parseInt calls for 3,973 fills, on every frame",
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



def _still(cid: str) -> tuple[str, str]:
    """A non-flip declaration: the known bug still FAILs for its documented reason."""
    return ("FAIL", KNOWN_BUGS[cid][1])


# Shared probe texts.
_BUF = "var _drawFloorCellBuf = new Float32Array(120000);"
_BUF_20K = (_BUF, "var _drawFloorCellBuf = new Float32Array(60000);")
# drawLayersFloor3D's growth step (audit D25's repair); the same block
# tools/game/tests/floor_cell_buffer.js --fixed-capacity removes.
_GROW_IF = "  if (_drawFloorCellBuf.length < _scanCells * 3) {\n"
_NO_GROW = (_GROW_IF +
            "    var _scanSpan = Math.ceil(2 * viewRad) + 2;\n"
            "    _drawFloorCellBuf = new Float32Array(3 * Math.max(_scanCells,\n"
            "      Math.min(_scanSpan, mesh.w - 1) * Math.min(_scanSpan, mesh.h - 1)));\n"
            "  }\n", "")
# The pass reads the buffer into its local after that growth; the --stale-local
# mutation of floor_cell_buffer.js reads it before, so the growing frame still
# collects into the buffer it replaces.
_READ = "  var _cellBuf = _drawFloorCellBuf;\n"
_STALE_LOCAL = [("  var _scanCells = ", _READ + "  var _scanCells = "), (_NO_GROW[0] + _READ, _NO_GROW[0])]
_LOD_ANCHOR = ("      if (distSq > viewDistSq) { __caveStats.floorDistCull++; continue; }\n"
               "      // \"Under-foot skirt\"")


def _lod(dist: int) -> str:
    return ("      if (distSq > viewDistSq) { __caveStats.floorDistCull++; continue; }\n"
            f"      if (distSq > {dist} * {dist}) {{ __caveStats.floorLodCull = (__caveStats.floorLodCull || 0) + 1; continue; }}\n"
            "      // \"Under-foot skirt\"")


_SKIP_FIXED_FLOOR = ("function drawLayersFloor3D() {\n  if (!floorMesh || !floorMesh.layerCount) return;",
                     "function drawLayersFloor3D() {\n  if (!floorMesh || !floorMesh.layerCount) return;\n  if (!ENDLESS_MODE) return;")
_STATE = "  if (ENDLESS_MODE && loopStart - _stateDumpAt >= 3000) {"
_STATE_OFF = (_STATE, "  if (ENDLESS_MODE && loopStart - _stateDumpAt >= 3000 && false) {")
# loop()'s render call, followed by its performance-logging block.
_RENDER = "  renderInterpolatedFrame(_physicsAccum / FIXED_DT_MS);\n\n  // Performance logging"
_WALLS_THROW = ("function drawWalls3D() {", "function drawWalls3D() {\n  if (ENDLESS_MODE) throw new Error('probe walls crash');")
# G6's repair (01-config-state.js): rgbQ starts a fresh generation when a new
# colour arrives at RGB_CACHE_LIMIT entries. Without it the cache memoises
# every exact lit/fogged RGB triple ever drawn and never evicts.
_RGB_RESET = ("  if (_cacheStats.rgbQ.size >= RGB_CACHE_LIMIT) {\n"
              "    if (_cacheStats.rgbQ.size > _cacheStats.rgbQ.peakSize) {\n"
              "      _cacheStats.rgbQ.peakSize = _cacheStats.rgbQ.size;\n"
              "    }\n"
              "    _rgbCache = {};\n"
              "    _cacheStats.rgbQ.size = 0;\n"
              "  }\n")
_HYSTERESIS = ("  if (pcx !== centerCX || pcy !== centerCY) {",
               "  var _hyX = trueX - (centerCX + 0.5) * CHUNK_SIZE, _hyY = trueY - (centerCY + 0.5) * CHUNK_SIZE;\n"
               "  if (Math.abs(_hyX) > CHUNK_SIZE / 2 + 24 || Math.abs(_hyY) > CHUNK_SIZE / 2 + 24) {")
# runSimulationTick consumes input once per fixed tick (G7/N1's repair), and
# loop()'s fixed-step block that runs those ticks.
_TICK_INPUT = "  _pt('handleInput', function(){ updateInputCamera(dt); handleInput(dt); });\n"
_PHYS = "  // Physics runs at fixed timestep for determinism\n  if (!paused) {\n    _physicsAccum += elapsed;"
# N11's repair: pollInputControls ignores a pad that has not answered.
_N11_BREAK = ("  if (!USE_GAMEPAD || USE_MOUSE || !gpLast || !gpLast.valid) {\n    lastSelectDown = false; lastStartMenuDown = false;",
              "  if (!USE_GAMEPAD || USE_MOUSE || !gpLast) {\n    lastSelectDown = false; lastStartMenuDown = false;")
_NO_POLL = ("  pollInputControls();\n  var elapsed = ", "  /* no input poll */\n  var elapsed = ")
_E6_FIX = [
    ("    if (now < gpBackoffUntil) return;\n    var sampleGeneration = _gameRunGeneration;\n"
     "    hw.fetchJSON('/api/sensors?sensor=input&ts=' + now)",
     "    if (now < gpBackoffUntil || tick._busy) return;\n    tick._busy = true;\n"
     "    var sampleGeneration = _gameRunGeneration;\n    hw.fetchJSON('/api/sensors?sensor=input&ts=' + now)"),
    ("        gpLast.valid = false; gpBackoffUntil = Date.now() + 200;\n      });\n  }\n  gpPoll = setInterval(tick, 16);",
     "        gpLast.valid = false; gpBackoffUntil = Date.now() + 200;\n      })\n"
     "      .then(function() { tick._busy = false; });\n  }\n  gpPoll = setInterval(tick, 16);"),
]

# (description, anchor, replacement, {check_id: "PASS" | "FAIL" | "PRECONDITION" | (verdict, r"detail regex")})
# (description, [(anchor, replacement), ...], None, {check_id: ...})   multi-site
# A FAIL declared on a check that already fails at baseline carries a detail
# regex: _still (the documented mechanism) for a non-flip beside a flip or in a
# GUARD, the BREAK's own witness for a BREAK on top of a FIX.
PROBES: list = [
    # ── FIX probes: remove a known bug's cause, its check must go PASS ──
    # D25 is repaired; its two FIX probes became the BREAK probe and the
    # measurement GUARD below, in the same slots.
    ("BREAK D25 (repaired): the floor pass no longer grows _drawFloorCellBuf, so Level 4 is back to the "
     "40,000-cell start buffer (demand 46,596); every Endless preset still fits in it",
     _NO_GROW[0], _NO_GROW[1],
     {_L4: "FAIL", _ENDLESS_BUF: "PASS"}),
    ("GUARD D25: with the growth removed, culling harder beyond 2000 u, counted in a NEW __caveStats counter, "
     "brings Level 4 back under 40,000 cells (the demand really drops to ~36k; a cull-counter formula would "
     "still read ~50k)",
     [_NO_GROW, (_LOD_ANCHOR, _lod(2000))], None,
     {_L4: "PASS", _ENDLESS_BUF: "PASS"}),
    ("FIX G3: 24 u of hysteresis before re-centring the window",
     _HYSTERESIS[0], _HYSTERESIS[1],
     {_JITTER: "PASS", _NO_REBUILD: "PASS", _G3LINES: _still(_G3LINES)}),
    ("FIX N17: silence loop()'s periodic [STATE] dump",
     _STATE_OFF[0], _STATE_OFF[1],
     {_SPAM: "PASS"}),
    # G7/N1 is repaired; its two FIX probes became these BREAK probes, in the
    # same slots.
    ("BREAK G7/N1 (repaired): handleInput(FIXED_DT) runs once per RENDER frame again, outside runSimulationTick",
     [(_TICK_INPUT, ""),
      (_PHYS, "  if (!paused) _pt('handleInput', function(){ updateInputCamera(FIXED_DT); handleInput(FIXED_DT); });\n"
       + _PHYS)], None,
     {_TURN: "FAIL", _WALK: "FAIL", _GPTURN: "FAIL", _GPWALK: "FAIL"}),
    ("BREAK G7/N1, a structurally different regression: input is consumed only on a frame's first physics step",
     [(_TICK_INPUT, "  if (typeof _probeFirstStep === 'undefined' || _probeFirstStep) "
                    "_pt('handleInput', function(){ updateInputCamera(dt); handleInput(dt); });\n"),
      ("      runSimulationTick(FIXED_DT);\n      steps++;",
       "      _probeFirstStep = steps === 0;\n      runSimulationTick(FIXED_DT);\n      steps++;")], None,
     {_TURN: "FAIL", _WALK: "FAIL", _GPTURN: "FAIL", _GPWALK: "FAIL"}),
    ("BREAK G4 (repaired): the fullscreen rAF goes back to innerWidth x innerHeight, ignoring Resolution",
     "    requestAnimationFrame(function() { applyFullscreenCanvasSize(); });",
     "    requestAnimationFrame(function() {\n"
     "      canvas.width  = window.innerWidth  || screen.width;\n"
     "      canvas.height = window.innerHeight || screen.height;\n"
     "    });",
     {_FS: "FAIL"}),
    # G6 was repaired before the 0.0 snapshot (RGB_CACHE_LIMIT and the
    # generation reset in rgbQ); its FIX probe added a second 4,096 cap and
    # passed whether or not it was applied, so it became this BREAK.
    ("BREAK G6 (repaired): rgbQ never starts a fresh generation, so _rgbCache keeps every colour it has drawn",
     _RGB_RESET, "",
     {_RGB: "FAIL"}),
    ("BREAK N11 (repaired): pollInputControls reads SELECT from a pad that has not answered yet (gpLast.valid "
     "unchecked)",
     _N11_BREAK[0], _N11_BREAK[1],
     {_N11: "FAIL"}),
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
     {_G3LINES: "PASS", _JITTER: _still(_JITTER)}),
    # G8 was repaired before the 0.0 snapshot: drawPerfHud reads
    # getPerfFrameCadence's rAF intervals. Its FIX probe became this BREAK.
    ("BREAK G8 (repaired): drawPerfHud derives fps from the average JS time per frame again",
     "  var avgFt = cnt > 0 ? sumFt / cnt : 0;\n  var fps = getPerfFrameCadence().fps;\n  var TARGET_MS = 16.67;",
     "  var avgFt = cnt > 0 ? sumFt / cnt : 0;\n  var fps = avgFt > 0 ? (1000 / avgFt) : 0;\n  var TARGET_MS = 16.67;",
     {_HUD: "FAIL"}),

    # ── BREAK probes: inject a bug, a passing check must go FAIL ──
    ("BREAK: the page script throws at load (and the FAIL line must still parse under the real id)",
     _BUF, _BUF + "\nthrow new Error('probe: page script throws at load');",
     {_LOAD: "FAIL"}),
    ("BREAK: without the growth, a 20,000-cell start buffer overflows at the ultra preset",
     [_NO_GROW, _BUF_20K], None,
     {_ENDLESS_BUF: "FAIL", _L4: "FAIL"}),
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
      (_RENDER, "  renderInterpolatedFrame(_physicsAccum / FIXED_DT_MS);\n"
                "  console.error('[probe] per-frame console.error');\n\n  // Performance logging")], None,
     # On top of the N17 FIX: the near-spawn site, silent at baseline, now
     # fails on console.errors alone.
     {_SPAM: ("FAIL", r"near chunk \(0,0\)[^;]*: 0 lines \+ [1-9]\d* console\.errors in \d+/\d+ frames in-chunk, "
                      r"e\.g\. error '\[probe\] per-frame console\.error'")}),
    ("BREAK: [STATE] silenced, and the walls pass throws on every Endless frame (render errors void steady state: "
     "both checks must FAIL on their PRECONDITION)",
     [_STATE_OFF, _WALLS_THROW], None,
     {_SPAM: "PRECONDITION", _NO_REBUILD: "PRECONDITION"}),

    # ── GUARD probes: a plausible change that must NOT turn a check green / red ──
    ("GUARD D25: with the growth fix, fixed levels that skip the floor pass must FAIL on the precondition (pass "
     "wrote no cells), not read an earlier pass's counters",
     _SKIP_FIXED_FLOOR[0], _SKIP_FIXED_FLOOR[1],
     {_L4: "PRECONDITION", _ENDLESS_BUF: "PASS"}),
    ("GUARD D25: with the growth removed and a 20,000-cell start buffer, culling harder beyond 1200 u, counted in "
     "a NEW counter, brings the Endless check back to PASS (the cells written really drop under 20,000 at ultra; "
     "a cull-counter formula would still read more than 20,000)",
     [_NO_GROW, _BUF_20K, (_LOD_ANCHOR, _lod(1200))], None,
     {_ENDLESS_BUF: "PASS"}),
    ("GUARD G3: updateChunks moved from gameUpdate into loop() -- still no hysteresis, so jitter must still FAIL",
     [("  if (ENDLESS_MODE) updateChunks();\n\n  // Wall collision", "  /* moved to loop() */\n\n  // Wall collision"),
      (_RENDER, "  if (ENDLESS_MODE) updateChunks();\n" + _RENDER)], None,
     {_JITTER: _still(_JITTER), _NO_REBUILD: "PASS", _G3LINES: _still(_G3LINES)}),
    ("GUARD G6: with the shipped generation reset, a walls pass that throws every frame must void the cache "
     "check (its PRECONDITION: render errors during play), not pass on the few colours drawn",
     _WALLS_THROW[0], _WALLS_THROW[1],
     {_RGB: "PRECONDITION"}),
    ("GUARD N11: a loop that never polls the pad's UI controls must FAIL the precondition, not pass vacuously",
     _NO_POLL[0], _NO_POLL[1],
     {_N11: "PRECONDITION"}),
    ("GUARD E6: with the in-flight fix, polling that never starts must FAIL the precondition",
     _E6_FIX + [("function startGamepadPolling() {\n  if (gpPoll) return;",
                 "function startGamepadPolling() {\n  if (gpPoll) return;\n  return;")], None,
     {_E6: "PRECONDITION"}),

    # ── D25, repaired: appended so the slots above keep their test_probe_NN ──
    ("BREAK D25: the growth is reached only in Endless (as if moved into the Endless window rebuild), so Level 4 "
     "on a fresh page keeps the 40,000-cell start buffer",
     _GROW_IF, "  if (ENDLESS_MODE && _drawFloorCellBuf.length < _scanCells * 3) {\n",
     {_L4: "FAIL", _ENDLESS_BUF: "PASS"}),
    ("GUARD D25: a 20,000-cell start buffer is grown by the pass, so every view still fits (the harness re-reads "
     "the grown buffer instead of counting the one it filled with NaN, and a pass that grows before collecting "
     "leaves the buffer it replaced untouched)",
     _BUF_20K[0], _BUF_20K[1],
     {_ENDLESS_BUF: "PASS", _L4: "PASS"}),
    ("BREAK D25: the pass reads _drawFloorCellBuf into its local before growing it (floor_cell_buffer.js "
     "--stale-local), so Level 4's growing frame collects into the 40,000-cell buffer it replaces; Endless's "
     "presets grow the buffer in their own frames and every Endless view fits the start buffer, so it still passes",
     _STALE_LOCAL, None,
     {_L4: "FAIL", _ENDLESS_BUF: "PASS"}),
]

# Checks whose ONLY flipping probe is a FIX of the known bug (no BREAK possible
# while the bug is present), for the record:
#   _E6, _OVERVIEW, _G1, _G2, _G3LINES, _JITTER, _SPAM
# each has a FIX above (plus a GUARD where a vacuous pass was possible). The
# repaired checks have BREAK probes that reintroduce their defect by its own
# mechanism: _TURN/_WALK/_GPTURN/_GPWALK (G7/N1: input once per render frame,
# or only on a frame's first physics step), _N11 (an unanswered pad's SELECT),
# _HUD (G8: fps from JS time), _FS (G4: the viewport size), _RGB (G6: no
# generation reset, plus a GUARD that render errors void it), and _L4 (D25: no
# buffer growth, growth only in Endless, or collecting before it, plus a GUARD
# that it measures real writes, not culls). A GUARD that voids its check
# declares "PRECONDITION": the check must FAIL on its precondition.

PerfSuite = suite_testcase("perf", KNOWN_BUGS, min_checks=20)
PerfProbes = probe_testcase("perf", PROBES)

if __name__ == "__main__":
    unittest.main()
