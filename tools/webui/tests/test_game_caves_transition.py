"""Endless crawler: DYNAMIC surface <-> cave transitions (WebPage_Games.h).

The harness (tools/webui/harness/game_caves_transition_harness.js) drives the
shipping game through its real input path -- kbState -> handleInput ->
gameUpdate -> step, via LAB.walkTo / LAB.tick -- and reads back only what the
game itself computes: pos.floorZ, getWalkableLayerTopAt, the floorMesh layer
stacks, playerUnderground, ambientLight, jumpAirborne.

Worlds: Cave Test seeds 12345, 31337 and 98765 (every entrance; --seeds
overrides) plus normal Endless seed 424242 at its nearest cave network
(--endless-seeds overrides). The added Cave Test seeds retain the seed-specific
N3/N4 landing and N14 corridor-depth failures. Per entrance it runs:

  - an axis walk IN from the open surface (along +470, or the nearest start
    with no surface rock in the way) to 150 u inside, then back OUT;
  - two lateral walks, 600 u each side of the corridor axis 150 u inside;
and, in Cave Test worlds, a mouth-lateral walk, a surface cap walk, natural and
raised-impulse vertical jumps, chained corridor walks, a 30 fps real-loop
chunk-line crossing, and a chunk-boundary dither. Separate fixtures exercise
open-ground entrance lighting, restart-while-airborne state, Cave Test spawn,
and the day/night-disabled path.

Thresholds, and why ANY correct implementation meets them:

  0.35 h/tick   height change per tick. The game's own walkable step is STEP_UP
                1.0 h (L7844) eased 30%/tick (L10277) = 0.30 h/tick; a free fall
                through a whole cave (~11 h at gravity 15 h/s^2) peaks at ~0.30
                h/tick. Only a snap or teleport exceeds 0.35.
  0 airborne    walking an entrance RAMP (the code calls it one, L7838-7839) is
                walking, not falling.
  1 flip        playerUnderground turns on once going in, off once coming out.
  0.02 / 0.2    ambient must dim (brighten) monotonically within 0.02 and never
                jump more than 0.2 in one 60 Hz tick; the cave must be >= 0.1
                darker than the surface or the check fails as vacuous.
  EYE_H 2.4 h   the camera eye is 60 render units above the feet (getCam3D
                cameraZ = 60 + 25h, L454; layers render at 25z), so a ceiling
                less than 2.4 h above the feet is behind the eye.
  rock          the volume between a cave ceiling and the surface cap above it
                is rock; the player must never be in it (0.05 h tolerance).
  1.0 h         never more than STEP_UP below every floor of the cell (sunk
                into the ground), never more than STEP_UP gained in one tick
                sideways.
  0.1 h         Cave Test spawn stands on a walkable layer; a vertical jump
                lands back on the floor it left.
  0.05 h        even a raised-impulse jump stays under the ceiling above the
                takeoff floor; natural jumps land back on their takeoff floor.
  window shift  re-centring the chunk window (assembleWindow) must not change
                the layer stack under the player, move the player in world
                space beyond its walking step (+1 u), change h by more than
                0.35 h, or flip playerUnderground twice within +-6 ticks.
                Motion checks use pre-shift stack copies and level ground so a
                D1/D14 jolt is never blamed on the shift. A 30 fps crossing
                covers two physics steps per rendered frame; a mouth dither
                requires rebuild hysteresis.

Every check aggregates over seeds and entrances and FAILS with a PRECONDITION
detail if its scenario never reached the state it tests (walk did not reach the
cave floor, no ceiling overhead, no jump started, no level re-centre, ...).

Run:
    python3 -m unittest tools.webui.tests.test_game_caves_transition -v
    HW1_GAME_PROBES=1 python3 -m unittest tools.webui.tests.test_game_caves_transition -v
    python3 -m tools.webui.game_lab caves_transition -v
    python3 -m tools.webui.game_lab caves_transition --seeds 12345,1,777,424242
"""

from __future__ import annotations

import unittest

from tools.webui.game_lab import probe_testcase, suite_testcase

_P = "caves_transition: "

LOAD = _P + "game script evaluates without throwing"
WALK_REACH = _P + "walk-in: the walk reaches the cave floor 150 u inside and returns to the open surface"
WALK_DH = _P + "walk-in: height never changes by more than 0.35 h in one tick walking in or out"
WALK_AIR = _P + "walk-in: the player never goes airborne walking the entrance ramp"
WALK_UG = _P + "walk-in: playerUnderground changes exactly once going in and once coming out"
WALK_AMB = _P + "walk-in: ambient light dims monotonically going in and brightens monotonically coming out"
WALK_AMB_STEP = _P + "walk-in: ambient light never changes by more than 0.2 in one tick"
WALK_SUN_FOG = _P + "walk-in: sunlight and fog change by at most 0.2 and 0.05 in one tick walking in or out"
WALK_HEAD = _P + "walk-in: wherever a cave ceiling is above the player's floor, the eye (h + 2.4) stays below it"
WALK_ROCK = _P + "walk-in: the player is never inside rock between a cave ceiling and the surface cap above it"
WALK_SUNK = _P + "walk-in: the player never sinks more than a step height below every floor of its cell"
ENTRANCE_LIGHT = _P + "entrance light: open ground retains exterior daylight even near a cave entrance"
LAT_ROCK = _P + "lateral: walking sideways inside the corridor never puts the player inside rock between ceiling and cap"
LAT_SUNK = _P + "lateral: walking sideways inside the corridor never sinks the player below every floor"
LAT_RAISE = _P + "lateral: walking sideways inside the corridor never raises the player more than a step height (1.0 h) in one tick"
LAT_ROOF = _P + "lateral: walking sideways the player stays under the cave roof (stopped by a wall or still on the cave floor)"
MOUTH_SUNK = _P + "mouth: walking sideways in the uncapped cave mouth never sinks the player below every floor"
CAP_DROP = _P + "cap walk: walking on the surface across a roofed corridor never drops the player more than a step below the top walkable layer"
CAP_UG = _P + "cap walk: playerUnderground is never true while no cave ceiling is above the player"
SPAWN_LAYER = _P + "spawn: Cave Test puts the player on a walkable layer of the spawn cell"
SPAWN_AIR = _P + "spawn: the Cave Test spawn is not airborne after one tick"
RESTART_AIR = _P + "restart: a world started while the previous one is mid-jump behaves like one started from a fresh page"
DAYNIGHT = _P + "dayNight off: playerUnderground is false on the surface and true deep in the cave"
DITHER = _P + "window shift: dithering 20 u back and forth across a chunk line at a cave mouth re-centres the window at most once"
SHIFT_STACK = _P + "window shift: re-centring the window keeps the layer stack under the player unchanged"
SHIFT_POS = _P + "window shift: the player's world position stays continuous across a window re-centre"
SHIFT_H = _P + "window shift: crossing a chunk line near or inside a cave does not jolt the player's height"
SHIFT_UG = _P + "window shift: playerUnderground does not flicker across a window re-centre"
FPS_ERRORS = _P + "30 fps: every real-loop frame of the 30 fps cave walks runs without a render, update or console error"
NET_DH = _P + "network: walking each corridor end to end, height never changes by more than 0.35 h in one tick"
NET_SUNK = _P + "network: walking each corridor end to end, the player never sinks more than a step height below every floor"
JUMP_SOLID = _P + "jump: a jump that would carry the player above the cave ceiling is stopped by it"
JUMP_LAND = _P + "jump: a vertical jump inside the cave lands back on the cave floor it left"

# check id -> (documented current mechanism, regex the FAIL detail must match).
# PRECONDITION failures are rejected centrally by game_lab.suite_testcase.
KNOWN_BUGS: dict[str, tuple[str, str]] = {
    WALK_DH: ("D1/N4 -- the approach trench uses a fixed depth and the landing branch may snap upward; "
              "the no-candidate sentinel can also produce multi-height jumps on the expanded seeds",
              r"(?:no-candidate fallback|airborne landing)"),
    WALK_AIR: ("D12 -- the 0.075 h edge-fall threshold starts micro-falls even when a walkable layer is in range",
               r"[1-9]\d* D12 micro-fall"),
    WALK_UG: ("D3 -- the uncapped 30 u mouth reads outdoors between roofed stretches, producing three transitions",
              r"flips \[[^]]*T>F@[^]]*F>T@"),
    WALK_AMB: ("D3/D9 -- the mouth becomes outdoor and the entrance-centred blend is inverted",
               r"rises [\d.]+->[\d.]+ at along"),
    WALK_AMB_STEP: ("D3 -- entering underground clamps ambient to 0.45 in a single update",
                    r"max step 0\.45"),
    WALK_SUN_FOG: ("U6/D3 -- the same flag switch sets sun to zero and fog to 0.15 in one tick",
                   r"sun max step 0\.60 .*fog max step 0\.15"),
    WALK_HEAD: ("D1/D2 -- the feather roof is stamped at full height while the floor is lerped, and the fixed-depth trench passes under it",
                r"[1-9]\d*/\d+ roofed ticks with headroom"),
    WALK_ROCK: ("D2/D14 -- the player can stand above a low ceiling but below its cap",
                r"[1-9]\d* tick\(s\) between ceiling and cap"),
    WALK_SUNK: ("N14/D11 -- the seed-98765 corridor/chamber depth join starts a fall that passes more than one step below the next floor",
                r"ct98765/E0: [1-9]\d* tick\(s\) sunk"),
    ENTRANCE_LIGHT: ("D9 -- on open ground the distance blend becomes brighter, not darker, toward the entrance",
                     r"brightens [\d.]+->[\d.]+.*entrance is not darker"),
    LAT_ROCK: ("D14 -- the open corridor feather lets the player climb between the cave ceiling and cap",
               r"[1-9]\d* tick\(s\) between ceiling and cap"),
    LAT_SUNK: ("D11/D14 -- outside the open side the picker returns h=0 and can leave the player below the surface",
               r"[1-9]\d* tick\(s\) sunk"),
    LAT_RAISE: ("D11/D14 -- easing toward the h=0 sentinel can raise a deep-cave player by more than STEP_UP in one tick",
                r"max gain (?:1\.[0-9]|[2-9])"),
    LAT_ROOF: ("D14/F6 -- the lateral cave edge is neither a containing wall nor a continuous roof",
               r"[1-9]\d* tick\(s\) with no ceiling overhead"),
    MOUTH_SUNK: ("D3/F6/D11/D14 -- in the outdoor-classified mouth cave walls are skipped and the open side reaches the h=0 fallback",
                 r"[1-9]\d* tick\(s\) sunk"),
    CAP_DROP: ("U2/N14 -- over the seed-98765 roof the nearest-layer picker transfers a surface walk down into the cave",
               r"ct98765/E1 capwalk\+: [1-9]\d* tick\(s\) more than 1 h below"),
    CAP_UG: ("D3/E4 -- a cap above a feather floor can classify a surface walker underground even with no ceiling overhead",
             r"[1-9]\d* tick\(s\) underground with no ceiling above"),
    SPAWN_LAYER: ("D13 -- Cave Test moves the player after resetting height to h=0 and does not place it on the destination stack",
                  r"nearest walkable (?!0\.00)"),
    SPAWN_AIR: ("D13 -- the off-layer Cave Test spawn starts an edge fall on the first tick",
                r"airborne true"),
    RESTART_AIR: ("N5 -- resetEndlessMode resets neither jumpAirborne nor jumpVelZ",
                  r"jumpAirborne true jumpVelZ (?!0\.00)"),
    DAYNIGHT: ("D10 -- updateDayNight returns before recomputing playerUnderground when the cycle is disabled",
               r"surface F, deep .* F, back on surface F"),
    DITHER: ("G3 -- updateChunks synchronously rebuilds on every chunk change with no hysteresis",
             r"[2-9]\d*? re-centre\(s\).*for [2-9]\d*? crossings"),
    JUMP_SOLID: ("N3 -- the airborne integrator and floor picker do not treat ceilings as solid",
                 r"[1-9]\d*/\d+ jumps pass the ceiling"),
    JUMP_LAND: ("N3/N4 -- a natural jump through a thin ceiling can snap onto the cap above it",
                r"ct31337/E0: [1-9]\d*/\d+ bad landings"),
}

# (description, anchor, replacement, {check id: "PASS" | "FAIL"}). Anchors occur
# exactly once in game_lab.game_js(); every probe was run and seen to flip.
_CEIL_CLAMP = (
    "    var _pz0 = pos.floorZ || 60;\n"
    "    pos.floorZ = (pos.floorZ || 60) + jumpVelZ * dt;\n"
    "    if (floorMesh && floorMesh.layerCount && jumpVelZ > 0) { var _m = floorMesh, "
    "_gx = Math.floor(pos.x / _m.gridSize), _gy = Math.floor(pos.y / _m.gridSize);\n"
    "      if (_gx >= 0 && _gy >= 0 && _gx < _m.w && _gy < _m.h) { var _i = _gy * _m.w + _gx, "
    "_Z = [_m.l0TopZ, _m.l1TopZ, _m.l2TopZ, _m.l3TopZ, _m.l4TopZ], "
    "_T = [_m.l0Type, _m.l1Type, _m.l2Type, _m.l3Type, _m.l4Type], _h0 = (_pz0 - 60) / 40;\n"
    "        for (var _li = 0; _li < _m.layerCount[_i]; _li++) if (_T[_li][_i] === 2 && _Z[_li][_i] > _h0) { "
    "var _cz = 60 + 40 * (_Z[_li][_i] - 0.1); if (pos.floorZ > _cz) { pos.floorZ = Math.max(_pz0, _cz); "
    "jumpVelZ = 0; } break; } } }")

_D1_DEPTH_FIX = (
    "            approachDepth = e.depth || (function () { for (var _q = 0; "
    "_q < net.corridors.length; _q++) { var _cq = net.corridors[_q]; if "
    "(Math.abs(_cq.x1 - e.x) < 1 && Math.abs(_cq.y1 - e.y) < 1) return "
    "_cq.depth; } return 5; })();")

_CONTAIN_FIX = (
    "  // PROBE: roof + cliff containment\n"
    "  if (!NOCLIP && floorMesh && floorMesh.layerCount && !jumpAirborne) {\n"
    "    var __roofAt = function (x, y, h) {\n"
    "      var m = floorMesh, gx = Math.floor(x / m.gridSize), gy = Math.floor(y / m.gridSize);\n"
    "      if (gx < 0 || gy < 0 || gx >= m.w || gy >= m.h) return false;\n"
    "      var i = gy * m.w + gx, Z = [m.l0TopZ, m.l1TopZ, m.l2TopZ, m.l3TopZ, m.l4TopZ], T = [m.l0Type, m.l1Type, m.l2Type, m.l3Type, m.l4Type];\n"
    "      var s = getWalkableLayerTopAt(x, y, h), ref = (s.idx >= 0) ? s.topH : h;\n"
    "      for (var li = 0; li < m.layerCount[i]; li++) if (T[li][i] === 2 && Z[li][i] > ref + 1e-4) return true;\n"
    "      return false;\n"
    "    };\n"
    "    var __h = ((pos.floorZ || 60) - 60) / 40, __blk = false;\n"
    "    var __pk = getWalkableLayerTopAt(pos.x, pos.y, __h);\n"
    "    if (__pk.idx < 0 && __pk.type === 0) __blk = true;\n"
    "    if (!__blk && __roofAt(oldX, oldY, __h) && !__roofAt(pos.x, pos.y, __h)) {\n"
    "      var __exit = false;\n"
    "      for (var __q = 0; __q < deepCaveEntrances.length; __q++) {\n"
    "        var __E = deepCaveEntrances[__q], __ox = -Math.cos(__E.angle), __oy = -Math.sin(__E.angle);\n"
    "        var __dx = pos.x - __E.x, __dy = pos.y - __E.y, __al = __dx * __ox + __dy * __oy, __pp = Math.abs(-__dx * __oy + __dy * __ox);\n"
    "        if (__al > -60 && __al < 520 && __pp < 60) { __exit = true; break; }\n"
    "      }\n"
    "      if (!__exit) __blk = true;\n"
    "    }\n"
    "    if (__blk) { pos.x = oldX; pos.y = oldY; vel.x = 0; vel.y = 0; }\n"
    "  }\n"
    "  // DEBUG: log wall collision details periodically")

# Same semantic probe as the review's first draft, but scans the five layer
# slots directly. Calling getWalkableLayerTopAt twice inside every physics step
# made the expanded seven-entrance fixture take more than a minute.
_CONTAIN_FAST_FIX = (
    "  // PROBE: roof + cliff containment\n"
    "  if (!NOCLIP && floorMesh && floorMesh.layerCount && !jumpAirborne) {\n"
    "    var __scan = function (x, y, h) {\n"
    "      var m = floorMesh, gx = Math.floor(x / m.gridSize), gy = Math.floor(y / m.gridSize);\n"
    "      if (gx < 0 || gy < 0 || gx >= m.w || gy >= m.h) return 0;\n"
    "      var i = gy * m.w + gx, bits = 0;\n"
    "      for (var li = 0; li < m.layerCount[i]; li++) {\n"
    "        var t = li === 0 ? m.l0Type[i] : li === 1 ? m.l1Type[i] : li === 2 ? m.l2Type[i] : li === 3 ? m.l3Type[i] : m.l4Type[i];\n"
    "        var z = li === 0 ? m.l0TopZ[i] : li === 1 ? m.l1TopZ[i] : li === 2 ? m.l2TopZ[i] : li === 3 ? m.l3TopZ[i] : m.l4TopZ[i];\n"
    "        if (t === 2 && z > h + 1e-4) bits |= 1;\n"
    "        if ((t === 1 || t === 3 || t === 4) && z >= h - 1 && z <= h + 1) bits |= 2;\n"
    "      }\n"
    "      return bits;\n"
    "    };\n"
    "    var __h = ((pos.floorZ || 60) - 60) / 40, __old = __scan(oldX, oldY, __h), __next = __scan(pos.x, pos.y, __h), __blk = !(__next & 2);\n"
    "    if (!__blk && (__old & 1) && !(__next & 1)) {\n"
    "      var __exit = false;\n"
    "      for (var __q = 0; __q < deepCaveEntrances.length; __q++) {\n"
    "        var __E = deepCaveEntrances[__q], __ox = -Math.cos(__E.angle), __oy = -Math.sin(__E.angle);\n"
    "        var __dx = pos.x - __E.x, __dy = pos.y - __E.y, __al = __dx * __ox + __dy * __oy, __pp = Math.abs(-__dx * __oy + __dy * __ox);\n"
    "        if (__al > -60 && __al < 520 && __pp < 60) { __exit = true; break; }\n"
    "      }\n"
    "      if (!__exit) __blk = true;\n"
    "    }\n"
    "    if (__blk) { pos.x = oldX; pos.y = oldY; vel.x = 0; vel.y = 0; }\n"
    "  }\n"
    "  // DEBUG: log wall collision details periodically")

PROBES: list[tuple[str, str, str, dict[str, str]]] = [
    # ── FIX probes: remove the audited cause, the check must go PASS ──
    ("FIX D10: run the underground test even with the day/night cycle disabled",
     "  if (!settings.dayNight) {\n    // Cycle disabled",
     "  if (false) {\n    // Cycle disabled",
     {DAYNIGHT: "PASS"}),
    ("FIX D13: stand the Cave Test spawn on the top walkable layer of its cell",
     "      cam.ang = _ctE.angle; // face into the cave",
     "      cam.ang = _ctE.angle; // face into the cave\n"
     "      pos.floorZ = 60 + 40 * getWalkableLayerTopAt(pos.x, pos.y, 1e6).topH;",
     {SPAWN_LAYER: "PASS", SPAWN_AIR: "PASS"}),
    ("FIX D12: start an edge-fall only when the picker found no walkable layer in step range",
     "    if (pos.floorZ > groundZ2 + 3) {",
     "    if ((!walk_e || walk_e.idx < 0) && pos.floorZ > groundZ2 + 3) {",
     {WALK_AIR: "PASS"}),
    ("FIX D3: cap the entrance mouth too (no CAP_EXCL hole), so 'underground' has no gap",
     "  var CAP_EXCL_SQ = 30 * 30;",
     "  var CAP_EXCL_SQ = 0;",
     {WALK_UG: "PASS", WALK_AMB: "PASS", CAP_DROP: "PASS"}),
    ("FIX U6/D3 (step): rate-limit ambient, sun and fog instead of switching them in one tick",
     "  // Pre-compute shade per wall normal direction (4 values, reused for all faces)",
     "  if (typeof __hw1pa === 'number') {\n"
     "    ambientLight = Math.max(__hw1pa - 0.1, Math.min(__hw1pa + 0.1, ambientLight));\n"
     "    sunIntensity = Math.max(__hw1ps - 0.1, Math.min(__hw1ps + 0.1, sunIntensity));\n"
     "    fogFloor = Math.max(__hw1pf - 0.025, Math.min(__hw1pf + 0.025, fogFloor));\n"
     "  }\n"
     "  __hw1pa = ambientLight; __hw1ps = sunIntensity; __hw1pf = fogFloor;\n"
     "  // Pre-compute shade per wall normal direction (4 values, reused for all faces)",
     {WALK_AMB_STEP: "PASS", WALK_SUN_FOG: "PASS"}),
    ("FIX N3: make ceilings solid to both the rising integrator and the landing/floor picker",
     [("    pos.floorZ = (pos.floorZ || 60) + jumpVelZ * dt;", _CEIL_CLAMP),
      ("    if (t !== 1 && t !== 3 && t !== 4) continue;\n    // No ceiling-reachability check",
       "    if (t === 2 && z > playerH) break;\n"
       "    if (t !== 1 && t !== 3 && t !== 4) continue;\n    // No ceiling-reachability check")],
     None,
     {JUMP_SOLID: "PASS", JUMP_LAND: "PASS"}),
    # ── BREAK probes: inject a bug, a passing check must go FAIL ──
    ("BREAK: land every jump on the highest walkable layer below h+50 (the cap)",
     "      var walk_j = getWalkableLayerTopAt(pos.x, pos.y, playerH_j);",
     "      var walk_j = getWalkableLayerTopAt(pos.x, pos.y, playerH_j + 50);",
     {JUMP_LAND: "FAIL", WALK_REACH: "FAIL"}),
    ("BREAK: rebase pos.x by 99% of the window shift (player skips ~5 u forward)",
     "    pos.x -= shiftX;",
     "    pos.x -= shiftX * 0.99;",
     {SHIFT_POS: "FAIL"}),
    ("BREAK: reset the player's height to h=0 on every window re-centre",
     "    pos.x -= shiftX;",
     "    pos.x -= shiftX; pos.floorZ = 60;",
     {SHIFT_H: "FAIL"}),
    ("BREAK: toggle playerUnderground inside assembleWindow's rebase",
     "    pos.x -= shiftX;",
     "    pos.x -= shiftX; playerUnderground = !playerUnderground;",
     {SHIFT_UG: "FAIL"}),
    ("BREAK: make the surface-cap height depend on the window origin",
     "    capH[iN] = needsCap[iN] ? floorMesh.surfaceH[iN] : fhN;",
     "    capH[iN] = needsCap[iN] ? floorMesh.surfaceH[iN] + (windowOriginX + windowOriginY) / 480 : fhN;",
     {SHIFT_STACK: "FAIL", WALK_SUNK: "FAIL"}),
    ("BREAK: make resetEndlessMode a syntax error (load diagnostics stay one line)",
     "function resetEndlessMode() {\n  ENDLESS_MODE = true;",
     "function resetEndlessMode() {\n  ENDLESS_MODE = true; )",
     {LOAD: "FAIL"}),
    ("BREAK: land a short edge-fall 1.25 h inside its floor",
     "pos.floorZ = groundZ;",
     "pos.floorZ = groundZ - (jumpVelZ > -200 ? 50 : 0);",
     {WALK_SUNK: "FAIL"}),
    ("BREAK re-centre: lift every layer by 3 h in odd-X windows",
     "          floorMesh.l4TopZ[ti] = cmesh.l4TopZ[si]; floorMesh.l4Type[ti] = cmesh.l4Type[si]; floorMesh.l4Color[ti] = cmesh.l4Color[si];",
     "          floorMesh.l4TopZ[ti] = cmesh.l4TopZ[si]; floorMesh.l4Type[ti] = cmesh.l4Type[si]; floorMesh.l4Color[ti] = cmesh.l4Color[si];\n"
     "          if (Math.round(windowOriginX / CHUNK_SIZE) & 1) { floorMesh.l0TopZ[ti] += 3; floorMesh.l1TopZ[ti] += 3; floorMesh.l2TopZ[ti] += 3; floorMesh.l3TopZ[ti] += 3; floorMesh.l4TopZ[ti] += 3; floorMesh.surfaceH[ti] += 3; }",
     {SHIFT_STACK: "FAIL", SHIFT_H: "FAIL", SHIFT_UG: "FAIL"}),
    ("FIX N5: reset airborne state when a new Endless world starts",
     "  // Clear all state\n  walls = [];",
     "  // Clear all state\n  jumpAirborne = false; jumpVelZ = 0; jumpPressed = false;\n  walls = [];",
     {RESTART_AIR: "PASS"}),
    ("FIX D9: weight cave ambient by closeness to the entrance, not distance from it",
     "ambientLight = ambientLight + ((_caveAmbient - ambientLight) * (1.0 - _entrBlend));",
     "ambientLight = ambientLight + ((_caveAmbient - ambientLight) * _entrBlend);",
     {ENTRANCE_LIGHT: "PASS"}),
    ("FIX G3: require 48 u of chunk-boundary hysteresis before re-centring",
     "  if (pcx !== centerCX || pcy !== centerCY) {",
     "  if ((pcx !== centerCX || pcy !== centerCY) &&\n"
     "      (Math.abs(trueX - (centerCX + 0.5) * CHUNK_SIZE) > CHUNK_SIZE * 0.5 + 48 ||\n"
     "       Math.abs(trueY - (centerCY + 0.5) * CHUNK_SIZE) > CHUNK_SIZE * 0.5 + 48)) {",
     {DITHER: "PASS"}),
    ("FIX D3/E4: require a real ceiling and update the flag after player movement",
     [("    // Still compute entrance distance for ambient lighting blend below",
       "    if (playerUnderground) {\n"
       "      var __mi = _pgy * floorMesh.w + _pgx, __ceil = false;\n"
       "      var __Z = [floorMesh.l0TopZ, floorMesh.l1TopZ, floorMesh.l2TopZ, floorMesh.l3TopZ, floorMesh.l4TopZ];\n"
       "      var __T = [floorMesh.l0Type, floorMesh.l1Type, floorMesh.l2Type, floorMesh.l3Type, floorMesh.l4Type];\n"
       "      var __ref = _walk_u.idx >= 0 ? _walk_u.topH : _playerH_u;\n"
       "      for (var __li = 0; __li < floorMesh.layerCount[__mi]; __li++) if (__T[__li][__mi] === 2 && __Z[__li][__mi] > __ref) { __ceil = true; break; }\n"
       "      playerUnderground = __ceil;\n"
       "    }\n"
       "    // Still compute entrance distance for ambient lighting blend below"),
      ("  updateDayNight(dt);\n  updateViewCamera();",
       "  updateViewCamera();"),
      ("  step(dt);            // player movement → repelFromWalls → repelFromEnemies (push only)\n  updateTreasureChests();",
       "  step(dt);            // player movement → repelFromWalls → repelFromEnemies (push only)\n"
       "  updateDayNight(dt);   // classify and light the position produced by this step\n"
       "  updateTreasureChests();")],
     None,
     {CAP_UG: "PASS"}),
    ("BREAK network height: make the selected walkable height alternate by 2 h between mesh cells",
     "  if (best_idx >= 0) return {topH: best_topH, idx: best_idx, type: best_type, action: 'walk'};",
     "  if (best_idx >= 0) return {topH: best_topH + (((Math.floor(x / 12) + Math.floor(y / 12)) & 1) ? 2 : 0), idx: best_idx, type: best_type, action: 'walk'};",
     {NET_DH: "FAIL"}),
    ("BREAK network support: report every selected walkable layer 2 h below its real height",
     "  if (best_idx >= 0) return {topH: best_topH, idx: best_idx, type: best_type, action: 'walk'};",
     "  if (best_idx >= 0) return {topH: best_topH - 2, idx: best_idx, type: best_type, action: 'walk'};",
     {NET_SUNK: "FAIL"}),
    ("BREAK real-loop coverage: throw at the start of every draw",
     "function draw() {",
     "function draw() { throw new Error('probe draw failure');",
     {FPS_ERRORS: "FAIL"}),
]

# Historical explanations/probes above document the frozen audit. The first
# playable cave milestone repaired these contracts; only chunk hysteresis is
# still a known baseline failure. Do not silently accept a repaired regression.
KNOWN_BUGS = {DITHER: KNOWN_BUGS[DITHER]}
CavesTransitionSuite = suite_testcase("caves_transition", KNOWN_BUGS, min_checks=33)
CavesTransitionProbes = probe_testcase("caves_transition", PROBES)

if __name__ == "__main__":
    unittest.main()
