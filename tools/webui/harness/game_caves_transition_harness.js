(0, eval)(slurp("tools/webui/harness/_game_env.js"));
LAB.init(__out, slurp, __engine, __argv);
// One line only: loadError carries a stack, and a newline inside a verdict
// detail makes game_lab fold the detail into the check id.
LAB.check("caves_transition: game script evaluates without throwing", LAB.load(__argv[0]), (LAB.loadError || "").split("\n")[0]);

// game_caves_transition_harness.js -- DYNAMIC surface <-> cave transitions in the
// Endless crawler (WebPage_Games.h), driven through the real input path
// (kbState -> handleInput -> gameUpdate -> step) with LAB.walkTo / LAB.tick, and
// for the 30 fps walks through the real loop() (LAB.walkTo {fps: 30}).
//
// Worlds: Cave Test seeds (--seeds, default below), every entrance of each, plus
// normal Endless (--endless-seeds, default 424242) at its nearest cave network.
//
// Every per-tick quantity below is READ from the game: h from pos.floorZ, the
// support layer from getWalkableLayerTopAt (L7831), the layer stack from
// floorMesh, playerUnderground / ambientLight / sunIntensity / fogFloor /
// jumpAirborne from the globals updateDayNight (L19293) and step (L10085)
// write. Nothing re-derives them.
//
// Scenario fixtures (not game logic), each stated where it is set up:
//   - enemies / spawners / projectiles are cleared before every walk and right
//     after EVERY assembleWindow call (a wrapper installed below), so combat
//     cannot push or kill the player mid-walk -- not even inside the step() that
//     re-centred the window (repelFromEnemies L10329 runs after updateChunks
//     L10306). This suite is about terrain transitions.
//   - every world starts from LAB.freshPage() (page-lifetime state as loaded)
//     with the pad released; the N5 restart scenario deliberately does NOT.
//   - Cave Test does not reseed Math.random (normal Endless does, in
//     LAB.startEndless); each Cave Test world reseeds it with its own seed so a
//     world's result never depends on the worlds run before it.
//   - the high-jump pass raises GAME_CONFIG.player.jumpImpulse for one jump so
//     its apex would clear the ceiling by 1 h (restored after each jump).
//   - the entrance-light scenario pushes one extra entry onto
//     deepCaveEntrances (removed in a finally).
//
// usage (via tools/webui/game_lab.py):
//   <extracted game js> [--seeds 12345,424242,...] [--endless-seeds 424242]

if (LAB.loaded) {
    var P = "caves_transition: ";
    var G = (0, eval)("this");
    var T0_ALL = LAB.realNow();

    // ── thresholds (rationale in tools/webui/tests/test_game_caves_transition.py) ──
    var MAX_DH = 0.35;        // h per physics step: > STEP_UP(1.0, L7844) x 30% ease (L10277) and > free-fall speed over a full cave depth
    var STEP_H = 1.0;         // the game's own STEP_UP (L7844): the tallest step it calls walkable
    var AMB_TOL = 0.02;       // ambient monotonicity tolerance
    var AMB_STEP = 0.2;       // max ambient change in one tick
    var AMB_MIN_SWING = 0.1;  // precondition: the cave must actually be darker than the surface
    var SUN_STEP = 0.2;       // max sunIntensity change in one tick: a third of the 0.6 noon sun
    var FOG_STEP = 0.05;      // max fogFloor change in one tick: a third of the 0.3 -> 0.15 swing
    var SUN_MIN = 0.3;        // precondition: the surface start is in daylight
    var EYE_H = LAB.EYE_H;    // 2.4 h: getCam3D cameraZ = 60 + 25*h (L454) vs layer render Z 25*z
    var ROCK_EPS = 0.05;      // h tolerance for "between ceiling and cap"
    var CEIL_MARGIN = 0.05;   // jump apex must stay this far under the ceiling
    var HIGH_CLEAR = 1.0;     // high-jump pass: impulse chosen so the free apex clears the ceiling by this much
    var LAND_TOL = 0.1;       // a vertical jump lands within this of its takeoff floor
    var REACH_TOL = 0.5;      // walk endpoints: h within this of the expected layer
    var SETTLE_TOL = 0.05;    // settled = not airborne and within this of the lowest walkable layer
    var INSIDE_ALONG = -150;  // "150 u inside" the entrance
    var MOUTH_ALONG = 10;     // the uncapped mouth: within CAP_EXCL 30 u of the entrance point (L6647)
    var MOUTH_SCAN_END = 40;  // single-roof scan of an approach stops outside that hole
    var LATERAL_LEN = 600;    // lateral walk length each side
    var MOUTH_LEN = 300;      // mouth lateral walk length each side
    var CAPWALK_PERP = 300;   // cap walk: from about this far one side of the corridor axis to the other
    var NEAR_ENTRANCE = 300;  // a window shift within this of an entrance counts as "near the cave"
    var MAX_NET_WALKS = 16;   // corridors walked end to end per Cave Test world, in chains (segments are ~50 u)
    var MAX_FPS_WORLDS = 2;   // worlds that also run the 30 fps real-loop crossing (each frame renders)
    var JUMP_EVERY = 24;      // natural jumps every 24 u of along
    var HIGH_EVERY = 48;      // high-jump spots every 48 u of along
    var FPS = 30;             // the real-loop frame rate for the 30 fps walks (2 physics steps per frame)
    var FPS_HALF = 60;        // the 30 fps crossing runs from this far before a chunk line to this far past it
    var SNAP_R = 3;           // pre-shift stack snapshot radius in cells (+-36 u)
    var SNAP_NEAR = 60;       // take snapshots only within this of a chunk line (where a re-centre can happen)
    var LIGHT_D = [130, 120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0];   // entrance-light sample distances
    var DITHER_D = 20;        // G3 dither: stand this far either side of a chunk line
    var DITHER_N = 3;         // round trips across it
    var DITHER_REACH = 120;   // the line must cross the entrance axis within this of the entrance point
    var DITHER_MAX = 1;       // re-centres allowed for 2*DITHER_N crossings: one is the move into the new chunk
    var N5_TICKS = 20;        // restart comparison length
    var N5_TOL = 0.01;        // h tolerance between a fresh start and a restart

    var CT_SEEDS = LAB.seeds([12345, 31337, 98765]);
    var END_SEEDS = LAB.seeds([424242], "endless-seeds");

    // ── small formatting helpers ────────────────────────────────────────────
    function f2(x) { return LAB.fx(x, 2); }
    function f3(x) { return LAB.fx(x, 3); }
    function sg(a) { var r = Math.round(a); return (r >= 0 ? "+" : "") + r; }
    function wxy(x, y) { return "(" + Math.round(x) + "," + Math.round(y) + ")"; }
    function tf(b) { return b ? "T" : "F"; }
    function mname(label) { return "caves_transition." + label.replace(/\+/g, "p").replace(/-/g, "m").replace(/[^A-Za-z0-9]+/g, "_"); }

    // ── reading the layer stack (floorMesh data, not logic) ─────────────────
    // Lowest ceiling strictly above z.
    function ceilAbove(ls, z) {
        var best = null;
        ls.forEach(function (l) { if (l.t === 2 && l.z > z + 1e-4 && (!best || l.z < best.z)) best = l; });
        return best;
    }
    // Inside rock: above a cave ceiling and below the surface cap that covers it.
    function rockBetween(ls, h) {
        var cs = ls.filter(function (l) { return l.t === 2; });
        for (var i = 0; i < cs.length; i++) {
            var c = cs[i], k = null;
            ls.forEach(function (l) { if (l.t === 4 && l.z > c.z && (!k || l.z < k.z)) k = l; });
            if (k && h > c.z + ROCK_EPS && h < k.z - ROCK_EPS) return { c: c.z, k: k.z };
        }
        return null;
    }
    // Sunk: more than a step height below EVERY walkable layer of the cell.
    function sunk(ls, h) {
        var w = LAB.lowestWalkable(ls);
        return (w && h < w.z - STEP_H) ? w.z : null;
    }
    function roofed(ls) { return !!(LAB.ceilingOf(ls) || LAB.capOf(ls)); }
    function sameStack(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        for (var i = 0; i < a.length; i++) if (a[i].t !== b[i].t || Math.abs(a[i].z - b[i].z) > 1e-6) return false;
        return true;
    }
    // Copies of the stacks around the player keyed by WORLD cell. A copy (not a
    // reference to floorMesh) so a re-centre that reuses the window's arrays in
    // place (a G3 fix) cannot turn the old-vs-new comparison into new-vs-new.
    function worldKey(wx, wy) { var g = floorMesh.gridSize; return Math.floor(wx / g) + "," + Math.floor(wy / g); }
    function nearChunkLine() {
        var w = LAB.worldPos(), CS = CHUNK_SIZE;
        var mx = ((w.x % CS) + CS) % CS, my = ((w.y % CS) + CS) % CS;
        return mx < SNAP_NEAR || mx > CS - SNAP_NEAR || my < SNAP_NEAR || my > CS - SNAP_NEAR;
    }
    function snapAround() {
        var m = floorMesh, g = m.gridSize, out = {};
        var gx0 = Math.floor(pos.x / g), gy0 = Math.floor(pos.y / g);
        var ox = Math.round(windowOriginX / g), oy = Math.round(windowOriginY / g);
        for (var dy = -SNAP_R; dy <= SNAP_R; dy++) for (var dx = -SNAP_R; dx <= SNAP_R; dx++) {
            var gx = gx0 + dx, gy = gy0 + dy;
            if (gx < 0 || gy < 0 || gx >= m.w || gy >= m.h) continue;
            out[(gx + ox) + "," + (gy + oy)] = LAB.layers(gy * m.w + gx);
        }
        return out;
    }

    // ── fixtures ────────────────────────────────────────────────────────────
    function quiet() {
        if (enemies) enemies.length = 0;
        if (enemySpawners) enemySpawners.length = 0;
        if (projectiles) projectiles.length = 0;
    }
    // Cleared right after every re-centre too (see the header). Also counts calls.
    var AW = { calls: 0, orig: G.assembleWindow };
    G.assembleWindow = function () { AW.calls++; try { return AW.orig.apply(this, arguments); } finally { quiet(); } };
    // A network's entrance in the frame LAB.entrances() uses. Local copy: after
    // LAB.findCaveNetworks every generated network sits in endlessCaveNetworks,
    // so LAB.entrances() would list far more than the one network chosen here.
    // Make sure every WORLD point in pts lies inside the loaded window (24 u
    // margin), re-centring on the first one only if one does not. Scans read
    // floorMesh / grid at those points; a re-centre costs a whole
    // assembleWindow (the dominant cost of this suite), and the layer stacks do
    // not depend on where the window sits (the window-shift stack check).
    function ensureWindow(pts) {
        var m = floorMesh, W_ = m ? m.w * m.gridSize : 0, H_ = m ? m.h * m.gridSize : 0;
        for (var i = 0; i < pts.length; i++) {
            var l = LAB.toLocal(pts[i].x, pts[i].y);
            if (!m || l.x < 24 || l.y < 24 || l.x > W_ - 24 || l.y > H_ - 24) { LAB.placeWorld(pts[0].x, pts[0].y, "top"); return true; }
        }
        return false;
    }
    function frameOf(key, net, i) {
        var e = net.entrances[i];
        return { key: key, index: i, net: net, x: e.x, y: e.y, angle: e.angle,
                 outX: -Math.cos(e.angle), outY: -Math.sin(e.angle) };
    }
    // As if the page had been rendering at the frame rate all along: without
    // this the first frame of a walk sees the time since whatever set
    // lastUpdate last and runs MAX_PHYSICS_STEPS catch-up steps (loop L21905).
    function primeLoop() { lastUpdate = LAB.clock; _physicsAccum = 0; }

    // ── one walk, traced tick (or frame) by tick ────────────────────────────
    // Every value in a trace record is read back from the game after a real
    // tick / frame. A window re-centre is detected from windowOriginX/Y (never
    // from floorMesh identity), and the stack at the player's WORLD cell before
    // the re-centre comes from the copy taken after the previous tick.
    var SHIFTS = [];
    var RECORD_SHIFTS = true;   // off for the dayNight-off walk: its playerUnderground is frozen by design of that scenario
    function tracer(E, spr) {
        var T = { tr: [], prevH: LAB.h(), prevAir: jumpAirborne, ox: windowOriginX, oy: windowOriginY,
                  prevX: LAB.worldPos().x, prevY: LAB.worldPos().y, prevLX: pos.x, prevLY: pos.y,
                  pre: nearChunkLine() ? snapAround() : null, shifts: [], spr: spr || 1,
                  base: { h: LAB.h(), ug: playerUnderground, amb: ambientLight, sun: sunIntensity, fog: fogFloor, air: jumpAirborne } };
        T.rec = function (st) {
            var ls = LAB.layers(st.cell);
            var sup = getWalkableLayerTopAt(pos.x, pos.y, st.h);
            // What step() itself saw for the floor ease this tick: the moved
            // position with the PRE-tick height (L10269-10277). type 0 = no
            // layer at all -> topH 0 (L7901).
            var pick = getWalkableLayerTopAt(pos.x, pos.y, T.prevH);
            var shifted = windowOriginX !== T.ox || windowOriginY !== T.oy;
            var r = { t: st.t, x: st.x, y: st.y, h: st.h, dh: st.h - T.prevH, air: st.air, ug: st.ug, amb: st.amb,
                      sun: sunIntensity, fog: fogFloor, step: Math.hypot(st.x - T.prevX, st.y - T.prevY),
                      along: E ? LAB.alongOf(E) : 0, perp: E ? LAB.perpOf(E) : 0, ls: ls, sup: sup, pick: pick, prevAir: T.prevAir };
            // An edge-fall starts in step()'s walk-off branch, which asks the
            // picker at the PRE-move position with the pre-tick height
            // (L10172-10176). Same query here; unknown if the window moved.
            if (st.air && !T.prevAir && T.spr === 1 && !shifted) r.fallPick = getWalkableLayerTopAt(T.prevLX, T.prevLY, T.prevH);
            if (shifted) {
                var w = LAB.worldPos(), k = worldKey(w.x, w.y);
                r.shift = { pre: T.pre, oldS: T.pre ? (T.pre[k] || null) : null, newS: ls,
                            from: T.ox + "," + T.oy, to: windowOriginX + "," + windowOriginY };
                T.shifts.push(T.tr.length);
                T.ox = windowOriginX; T.oy = windowOriginY;
            }
            T.prevH = st.h; T.prevAir = st.air; T.prevX = st.x; T.prevY = st.y; T.prevLX = pos.x; T.prevLY = pos.y;
            T.pre = nearChunkLine() ? snapAround() : null;
            T.tr.push(r);
        };
        return T;
    }
    function stNow(t) {
        var w = LAB.worldPos();
        return { t: t, x: w.x, y: w.y, h: LAB.h(), air: jumpAirborne, ug: playerUnderground, amb: ambientLight, cell: LAB.meshIndex(pos.x, pos.y) };
    }
    // --trace <label prefix>: NOTE one line per record of matching walks (debugging aid, never a verdict).
    var TRACE = LAB.opt("trace", null);
    function traceOut(tag, r) {
        LAB.note("trace " + tag + " t" + r.t + " world " + wxy(r.x, r.y) + " along " + sg(r.along) + " perp " + sg(r.perp) + " h " + f3(r.h) +
                 " dh " + f3(r.dh) + " air " + tf(r.air) + " ug " + tf(r.ug) + " amb " + f2(r.amb) + " pick " + r.pick.idx + "/" + f2(r.pick.topH) +
                 " cell " + LAB.fmtLayers(r.ls) + (r.shift ? " SHIFT " + r.shift.from + "->" + r.shift.to : ""));
    }
    // tx may be a list of WORLD waypoints [[x, y], ...] (ty ignored): one trace,
    // one tracer, the keys held from one waypoint to the next; maxTicks is then
    // per waypoint and `missed` is the worst arrival distance over them.
    function walk(W, E, tx, ty, maxTicks, tag, opts) {
        opts = opts || {};
        var spr = opts.fps ? Math.round(60 / opts.fps) : 1;
        var T = tracer(E, spr);
        var errMark = LAB.renderErrorMark(), err0 = LAB.errorCount;
        if (opts.fps) primeLoop();
        var wps = Array.isArray(tx) ? tx : [[tx, ty]], missed = 0, wp, dist = 0;
        wps.forEach(function (p) {
            LAB.walkTo(p[0], p[1], { maxTicks: maxTicks, arrive: 4, fps: opts.fps || undefined, onTick: T.rec });
            wp = LAB.worldPos(); dist = Math.hypot(wp.x - p[0], wp.y - p[1]);   // arrival, before any settling
            missed = Math.max(missed, dist);
        });
        // Settle: keys released, ticks until standing on the lowest layer (in)
        // or not airborne (out). The ticks join the trace so every per-tick
        // check sees them. The player coasts on its own momentum meanwhile
        // (damping, step L10190), up to ~30 u -- the game's inertia, kept.
        if (opts.settle) {
            for (var s = 0; s < 60; s++) {
                var low = LAB.lowestWalkable(LAB.layersAt(pos.x, pos.y));
                if (!jumpAirborne && (opts.settle !== "floor" || (low && Math.abs(LAB.h() - low.z) <= SETTLE_TOL))) break;
                LAB.tick(1);
                T.rec(stNow(T.tr.length));
            }
        }
        if (TRACE && TRACE !== true && tag.indexOf(TRACE) === 0) T.tr.forEach(function (r) { traceOut(tag, r); });
        var res = { tag: tag, base: T.base, trace: T.tr, dist: dist, missed: missed, end: LAB.worldPos(), spr: spr,
                    renderErrors: LAB.renderErrorsSince(errMark), consoleErrors: LAB.errorCount - err0 };
        if (RECORD_SHIFTS) T.shifts.forEach(function (k) { SHIFTS.push(shiftRecord(W, tag, T.tr, T.base, k, spr, res)); });
        return res;
    }
    function shiftRecord(W, tag, tr, base, k, spr, res) {
        var r = tr[k];
        var nearE = 1e9;
        (W.ents || []).forEach(function (e) { nearE = Math.min(nearE, Math.hypot(r.x - e.x, r.y - e.y)); });
        var underRoof = !!ceilAbove(r.ls, -1e9);
        // Level ground: for records k-6..k-1 the player stood (not airborne) on
        // one layer height z0 (+-0.05), and every cell it walks through up to
        // k+6 has a walkable layer at z0 IN THE PRE-SHIFT WINDOW. Judged from
        // pre-shift data only -- never from the post-shift stack or height,
        // which are the things under test (a re-centre that moves the layers
        // must not drop its own shift from the sample).
        var pre = r.shift.pre, lo = k - 6, hi = Math.min(tr.length - 1, k + 6), level = !!pre && lo >= 0 && (hi - k) >= 4, z0 = null;
        for (var i = Math.max(0, lo); level && i < k; i++) {
            if (tr[i].air || tr[i].sup.idx < 0) { level = false; break; }
            if (z0 === null) z0 = tr[i].sup.topH;
            else if (Math.abs(tr[i].sup.topH - z0) > 0.05) level = false;
        }
        for (var j = k; level && j <= hi; j++) {
            var old = pre[worldKey(tr[j].x, tr[j].y)];
            if (!old || !old.some(function (l) { return LAB.walkable(l.t) && Math.abs(l.z - z0) <= 0.05; })) level = false;
        }
        return { w: W.label, walk: tag, trace: tr, base: base, k: k, x: r.x, y: r.y, level: level, spr: spr, res: res,
                 near: nearE <= NEAR_ENTRANCE || underRoof, nearE: nearE, underRoof: underRoof,
                 dh: r.dh, dh2: (k + 1 < tr.length) ? tr[k + 1].dh : 0,
                 move: r.step, move0: k > 0 ? tr[k - 1].step : r.step,
                 hasOld: !!r.shift.oldS, stackSame: sameStack(r.shift.oldS, r.shift.newS),
                 oldS: r.shift.oldS ? LAB.fmtLayers(r.shift.oldS) : "(no pre-shift copy)", newS: LAB.fmtLayers(r.shift.newS),
                 from: r.shift.from, to: r.shift.to };
    }

    // First along in +470, +458 .. +250, then +482 .. +698, whose cell is open
    // surface (no ceiling, no cap), from which the straight path to the
    // entrance crosses no SURFACE wall cell (grid && !gridCave: cave-biome rock
    // the player cannot walk through), and whose approach is ONE roofed run:
    // scanning inward to along +40 (outside the CAP_EXCL mouth hole), once the
    // roof starts it never opens again. A branch corridor that roofs part of an
    // approach (Cave Test 31337 E1: roofed +472..+419, open, roofed from +344)
    // would otherwise make a correct game flip playerUnderground three times.
    function chooseStart(E) {
        ensureWindow([LAB.axisWorld(E, 470, 0), LAB.axisWorld(E, 698, 0), LAB.axisWorld(E, 0, 0)]);
        var cands = [], why = { roofed: 0, wall: 0, reopens: 0 };
        for (var a0 = 470; a0 >= 250; a0 -= 12) cands.push(a0);
        for (var a1 = 482; a1 <= 698; a1 += 12) cands.push(a1);
        for (var ci = 0; ci < cands.length; ci++) {
            var a = cands[ci];
            var w = LAB.axisWorld(E, a, 0), l = LAB.toLocal(w.x, w.y);
            var ls = LAB.layersAt(l.x, l.y);
            if (!ls.length || roofed(ls)) { why.roofed++; continue; }
            var blocked = false;
            for (var b = a; b >= 0 && !blocked; b -= 4) {
                for (var p = -7; p <= 7 && !blocked; p += 7) {
                    var q = LAB.toLocal(LAB.axisWorld(E, b, p).x, LAB.axisWorld(E, b, p).y);
                    var gx = Math.floor(q.x / cell), gy = Math.floor(q.y / cell);
                    if (gx < 0 || gy < 0 || gx >= gridW || gy >= gridH) { blocked = true; break; }
                    var gi = gy * gridW + gx;
                    if (grid[gi] && !(gridCave && gridCave[gi])) blocked = true;
                }
            }
            if (blocked) { why.wall++; continue; }
            var inRoof = false, reopens = false;
            for (var c = a; c >= MOUTH_SCAN_END; c -= 4) {
                var cw = LAB.axisWorld(E, c, 0), cl = LAB.toLocal(cw.x, cw.y), r = roofed(LAB.layersAt(cl.x, cl.y));
                if (r) inRoof = true; else if (inRoof) { reopens = true; break; }
            }
            if (reopens) { why.reopens++; continue; }
            return { along: a, why: why };
        }
        return { along: null, why: why };
    }
    var START_RANGE = "along +250..+698";

    // Walk IN along the entrance axis to along=-150, settle, then back OUT.
    function axisWalk(W, E, label) {
        var R = { label: label, pre: [], E: E };
        var cs = chooseStart(E);
        R.rejected = cs.why;
        if (cs.along === null) {
            R.pre.push("no open, wall-free start on the axis in " + START_RANGE + " whose approach is one roofed run " +
                       "(rejected: " + cs.why.roofed + " roofed, " + cs.why.wall + " behind surface rock, " + cs.why.reopens + " approach roofed by another corridor)");
            return R;
        }
        var sa = cs.along;
        R.startAlong = sa;
        LAB.note(label + ": walk starts at along " + sg(sa) + " (candidates rejected: " + cs.why.roofed + " roofed, " + cs.why.wall +
                 " behind surface rock, " + cs.why.reopens + " approach roofed by another corridor)");
        var s = LAB.axisWorld(E, sa, 0);
        LAB.placeWorld(s.x, s.y, "top");
        quiet();
        LAB.tick(3);                       // settle: ug / ambient now describe the start cell
        var sls = LAB.layersAt(pos.x, pos.y);
        R.startWorld = LAB.worldPos();
        if (roofed(sls)) R.pre.push("start cell is roofed: " + LAB.fmtLayers(sls));
        var tin = LAB.axisWorld(E, INSIDE_ALONG, 0);
        R.inW = walk(W, E, tin.x, tin.y, 1500, label + " in", { settle: "floor" });
        var dls = LAB.layersAt(pos.x, pos.y), dlow = LAB.lowestWalkable(dls);
        R.deepH = LAB.h(); R.deepFloor = dlow ? dlow.z : null;
        R.reachedIn = R.inW.dist < 8 && dlow && Math.abs(R.deepH - dlow.z) <= REACH_TOL && !jumpAirborne;
        if (!R.reachedIn) R.pre.push("in-walk did not reach the cave floor at along " + INSIDE_ALONG + ": dist " + f2(R.inW.dist) +
            " h " + f2(R.deepH) + " lowest walkable " + (dlow ? f2(dlow.z) : "none") + " air " + jumpAirborne + " at " + wxy(R.inW.end.x, R.inW.end.y));
        R.outW = walk(W, E, s.x, s.y, 1500, label + " out", { settle: "air" });
        var ols = LAB.layersAt(pos.x, pos.y), otop = LAB.topWalkable(ols);
        R.reachedOut = R.outW.dist < 8 && otop && Math.abs(LAB.h() - otop.z) <= REACH_TOL && !LAB.ceilingOf(ols);
        if (!R.reachedOut) R.pre.push("out-walk did not return to the open surface at along " + sg(sa) + ": dist " + f2(R.outW.dist) +
            " h " + f2(LAB.h()) + " layers " + LAB.fmtLayers(ols));
        return R;
    }

    // From the corridor axis at `along` walk perpendicular `len` u.
    function lateralWalk(W, E, along, side, len, maxTicks, label) {
        var R = { label: label, pre: [], others: (W.ents || []).filter(function (e) { return e !== E; }) };
        var s = LAB.axisWorld(E, along, 0);
        LAB.placeWorld(s.x, s.y, "bottom");
        quiet();
        LAB.tick(10);
        var ls = LAB.layersAt(pos.x, pos.y), low = LAB.lowestWalkable(ls);
        R.startWorld = LAB.worldPos();
        R.startUg = playerUnderground;
        // The revised mouth is genuinely open sky on its outward side. Only
        // the interior lateral scenario requires a ceiling at its start.
        if (!low || Math.abs(LAB.h() - low.z) > 0.1 || jumpAirborne || (along < 0 && !ceilAbove(ls, LAB.h())))
            R.pre.push("start is not on its intended support/roof: h " + f2(LAB.h()) + " layers " + LAB.fmtLayers(ls) + " air " + jumpAirborne);
        var t = LAB.axisWorld(E, along, side * len);
        R.w = walk(W, E, t.x, t.y, maxTicks, label);
        var maxPerp = 0;
        R.w.trace.forEach(function (r) { maxPerp = Math.max(maxPerp, Math.abs(r.perp)); });
        R.maxPerp = maxPerp;
        if (maxPerp < 24) R.pre.push("the player never moved sideways (max |perp| " + f2(maxPerp) + " u)");
        return R;
    }

    // On the surface at along -150: from the first open, wall-free spot
    // CAPWALK_PERP..150 u to one side of the corridor axis, walk straight
    // across the capped corridor to the same distance on the other side.
    function capWalk(W, E, side, label) {
        var R = { label: label, pre: [] };
        var sp = null;
        ensureWindow([LAB.axisWorld(E, INSIDE_ALONG, 0), LAB.axisWorld(E, INSIDE_ALONG, -CAPWALK_PERP), LAB.axisWorld(E, INSIDE_ALONG, CAPWALK_PERP)]);
        // Small caves can have real surface walls outside the cap. Accept a
        // closer real start, still requiring the walk to cross the capped axis.
        for (var p = CAPWALK_PERP; p >= 48 && sp === null; p -= 12) {
            var w = LAB.axisWorld(E, INSIDE_ALONG, -side * p), l = LAB.toLocal(w.x, w.y);
            var ls = LAB.layersAt(l.x, l.y), top = LAB.topWalkable(ls);
            if (!top || ceilAbove(ls, top.z)) continue;
            var blocked = false;
            for (var b = p; b >= 0 && !blocked; b -= 4) {
                var q = LAB.toLocal(LAB.axisWorld(E, INSIDE_ALONG, -side * b).x, LAB.axisWorld(E, INSIDE_ALONG, -side * b).y);
                var gx = Math.floor(q.x / cell), gy = Math.floor(q.y / cell);
                if (gx < 0 || gy < 0 || gx >= gridW || gy >= gridH) { blocked = true; break; }
                var gi = gy * gridW + gx;
                if (grid[gi] && !(gridCave && gridCave[gi])) blocked = true;
            }
            if (!blocked) sp = p;
        }
        if (sp === null) { R.pre.push("no open, wall-free surface start 48..300 u beside the corridor"); return R; }
        var s = LAB.axisWorld(E, INSIDE_ALONG, -side * sp);
        LAB.placeWorld(s.x, s.y, "top");
        quiet();
        LAB.tick(10);
        var sls = LAB.layersAt(pos.x, pos.y), stop = LAB.topWalkable(sls);
        R.startPerp = -side * sp;
        if (!stop || Math.abs(LAB.h() - stop.z) > 0.1 || jumpAirborne) R.pre.push("start is not standing on the top layer: h " + f2(LAB.h()) + " " + LAB.fmtLayers(sls));
        var t = LAB.axisWorld(E, INSIDE_ALONG, side * sp);
        R.w = walk(W, E, t.x, t.y, 600, label);
        var capT = 0, crossed = false;
        R.w.trace.forEach(function (r) { if (LAB.capOf(r.ls)) capT++; if (r.perp * side > 0) crossed = true; });
        R.capTicks = capT;
        if (capT < 20 || !crossed) R.pre.push("the walk did not cross the capped corridor (" + capT + " ticks over a cap, crossed the axis " + crossed + ")");
        return R;
    }

    // Vertical jumps on every roofed axis cell from +300 to -150 whose stack is
    // floor < ceiling. boots {canJump} + jumpPressed is the Space path (L22397
    // -> L10113). Each spot is jumped twice: with the game's own impulse, and
    // with the impulse raised so the free apex would clear the ceiling by
    // HIGH_CLEAR -- that pass tests whether the ceiling stops a jump whatever
    // the geometry (the natural 1.81 h jump reaches only low ceilings).
    function jumpOnce(w, f0z, high) {
        LAB.placeWorld(w.x, w.y, f0z);
        quiet();
        LAB.tick(10);
        var ls = LAB.layersAt(pos.x, pos.y), h0 = LAB.h();
        var c = ceilAbove(ls, h0);
        var J = { h0: h0, ceil: c ? c.z : null, stack: LAB.fmtLayers(ls), pre: [] };
        if (jumpAirborne || !c || Math.abs(h0 - f0z) > 0.05) J.pre.push("did not settle on the floor under a ceiling (h " + f2(h0) + ", " + J.stack + ")");
        var imp0 = GAME_CONFIG.player.jumpImpulse, g = GAME_CONFIG.player.gravity;
        J.impulse = imp0;
        if (high && c) J.impulse = Math.max(imp0, Math.sqrt(2 * g * (c.z - h0 + HIGH_CLEAR) * 40));
        GAME_CONFIG.player.jumpImpulse = J.impulse;
        var maxH = h0, landed = false, took = false;
        try {
            equipment.boots = { canJump: true, canDash: false };
            jumpPressed = true;
            for (var t = 0; t < 200; t++) {
                LAB.tick(1);
                if (t === 0) { took = (jumpPressed === false); J.v0 = jumpVelZ + g * LAB.FIXED_DT; }   // step() consumes the press only when it starts a jump (L10113-10116)
                if (LAB.h() > maxH) maxH = LAB.h();
                if (t > 2 && !jumpAirborne) { landed = true; break; }
            }
        } finally { GAME_CONFIG.player.jumpImpulse = imp0; }
        LAB.tick(10);
        equipment.boots = null; jumpPressed = false;
        J.maxH = maxH; J.rise = maxH - h0; J.hEnd = LAB.h(); J.airEnd = jumpAirborne; J.landed = landed;
        J.endStack = LAB.fmtLayers(LAB.layersAt(pos.x, pos.y));
        if (!took) J.pre.push("the game never started the jump (jumpPressed not consumed by step())");
        else if (Math.abs(J.v0 - J.impulse) > 1) J.pre.push("step() did not use the configured impulse (v0 " + f2(J.v0) + " vs " + f2(J.impulse) + ")");
        return J;
    }
    function jumpSweep(W, E, label) {
        var nat = [], high = [];
        for (var a = 300; a >= INSIDE_ALONG; a -= JUMP_EVERY) {
            var w = LAB.axisWorld(E, a, 0), l = LAB.toLocal(w.x, w.y);
            var ls0 = LAB.layersAt(l.x, l.y);
            var c0 = LAB.ceilingOf(ls0), f0 = LAB.lowestWalkable(ls0);
            if (!c0 || !f0 || !(f0.z < c0.z - 0.25)) continue;
            [[nat, false], [high, true]].forEach(function (p) {
                if (p[1] && (300 - a) % HIGH_EVERY !== 0) return;
                var J = jumpOnce(w, f0.z, p[1]);
                J.label = label; J.along = a; J.x = w.x; J.y = w.y;
                p[0].push(J);
            });
        }
        return { nat: nat, high: high };
    }

    // One straight 30 fps walk through the real loop across a chunk line inside
    // a corridor, +-FPS_HALF u around the line (>= 6 frames either side at ~1.6
    // u/frame for the level filter, and past any re-centre hysteresis a G3 fix
    // might add, e.g. the 48 u of this suite's FIX probe). The 60 Hz re-centres come from the other
    // walks, which cross chunk lines on their own (METRIC window_shifts_level).
    function fpsCrossing(W, net, label) {
        var CS = CHUNK_SIZE;
        for (var ci = 0; ci < net.corridors.length; ci++) {
            var c = net.corridors[ci];
            var dx = c.x2 - c.x1, dy = c.y2 - c.y1, L = Math.hypot(dx, dy);
            if (L < 1) continue;
            var tcs = [];
            var ax = Math.floor(c.x1 / CS), bx = Math.floor(c.x2 / CS), ay = Math.floor(c.y1 / CS), by = Math.floor(c.y2 / CS);
            if (ax !== bx) tcs.push((Math.max(ax, bx) * CS - c.x1) / dx);
            if (ay !== by) tcs.push((Math.max(ay, by) * CS - c.y1) / dy);
            if (!tcs.length) continue;
            var tc = Math.min.apply(null, tcs);
            var cx = c.x1 + dx * tc, cy = c.y1 + dy * tc, ux = dx / L, uy = dy / L;
            LAB.placeWorld(cx - ux * FPS_HALF, cy - uy * FPS_HALF, "bottom"); quiet(); LAB.tick(10);
            if (jumpAirborne || !ceilAbove(LAB.layersAt(pos.x, pos.y), LAB.h())) continue;   // not a roofed corridor floor here
            return [walk(W, null, cx + ux * FPS_HALF, cy + uy * FPS_HALF, 120, label + " corridor" + ci + " across " + wxy(cx, cy) + " @" + FPS + "fps", { fps: FPS })];
        }
        return [];
    }

    // The network's corridors walked end to end on the cave floor, one walk per
    // CHAIN of consecutive corridors (corridor i+1 starts where i ends), so a
    // walk also crosses every corridor -> corridor and corridor -> chamber join
    // on it (N14: independent depths meet in cliffs). Up to MAX_NET_WALKS
    // corridors per world.
    function networkWalks(W, net, label) {
        var chains = [], cur = null, out = [], used = 0;
        net.corridors.forEach(function (c, ci) {
            var L = Math.hypot(c.x2 - c.x1, c.y2 - c.y1);
            if (cur && Math.hypot(c.x1 - cur.end[0], c.y1 - cur.end[1]) < 1) { cur.pts.push([c.x2, c.y2]); cur.ids.push(ci); cur.len += L; }
            else { cur = { start: [c.x1, c.y1], pts: [[c.x2, c.y2]], ids: [ci], len: L }; chains.push(cur); }
            cur.end = [c.x2, c.y2];
        });
        chains.forEach(function (ch) {
            if (used >= MAX_NET_WALKS) return;
            // Start on the first roofed cave floor of the chain (an entrance
            // tree starts in the uncapped mouth).
            var start = ch.start, pts = ch.pts.slice(), ids = ch.ids.slice();
            for (;;) {
                LAB.placeWorld(start[0], start[1], "bottom"); quiet(); LAB.tick(10);
                var ls = LAB.layersAt(pos.x, pos.y), low = LAB.lowestWalkable(ls);
                if (low && Math.abs(LAB.h() - low.z) <= 0.1 && !jumpAirborne && ceilAbove(ls, LAB.h())) break;
                if (pts.length < 2) return;
                start = pts.shift(); ids.shift();
            }
            if (used + ids.length > MAX_NET_WALKS) { pts = pts.slice(0, MAX_NET_WALKS - used); ids = ids.slice(0, pts.length); }
            used += ids.length;
            var R = { label: label + " corridors " + ids[0] + "-" + ids[ids.length - 1] + " " + wxy(start[0], start[1]) + "->" + wxy(pts[pts.length - 1][0], pts[pts.length - 1][1]), pre: [] };
            R.n = ids.length;
            R.w = walk(W, null, pts, null, 150, R.label, { settle: "air" });
            out.push(R);
        });
        return out;
    }

    // G3: dithering across a chunk line at a cave mouth. On the first entrance
    // axis that crosses a chunk line within DITHER_REACH u of the entrance
    // point: stand DITHER_D u on one side, walk to DITHER_D u on the other side
    // and back, DITHER_N round trips, and count assembleWindow calls.
    var DITHER = { pre: [], done: false, found: false };
    function ditherScenario(W) {
        var CS = CHUNK_SIZE;
        function chunkOf(p) { return Math.floor(p.x / CS) + "," + Math.floor(p.y / CS); }
        for (var ei = 0; ei < W.ents.length; ei++) {
            var E = W.ents[ei], a0 = null;
            for (var a = -DITHER_REACH; a < DITHER_REACH && a0 === null; a += 2)
                if (chunkOf(LAB.axisWorld(E, a, 0)) !== chunkOf(LAB.axisWorld(E, a + 2, 0))) a0 = a + 1;
            if (a0 === null) continue;
            DITHER.found = true;
            DITHER.label = W.label + "/E" + E.index + " line at along " + sg(a0);
            var A = LAB.axisWorld(E, a0 + DITHER_D, 0), B = LAB.axisWorld(E, a0 - DITHER_D, 0);
            LAB.placeWorld(A.x, A.y, "bottom"); quiet(); LAB.tick(10);
            var c0 = AW.calls, side = LAB.alongOf(E) > a0, crossings = 0;
            var onTick = function () { var s2 = LAB.alongOf(E) > a0; if (s2 !== side) { crossings++; side = s2; } };
            for (var i = 0; i < DITHER_N; i++) {
                LAB.walkTo(B.x, B.y, { maxTicks: 150, arrive: 3, onTick: onTick });
                LAB.walkTo(A.x, A.y, { maxTicks: 150, arrive: 3, onTick: onTick });
            }
            DITHER.calls = AW.calls - c0; DITHER.crossings = crossings;
            if (crossings < 2 * DITHER_N) DITHER.pre.push("the player crossed the chunk line only " + crossings + " of " + (2 * DITHER_N) + " times");
            DITHER.done = true;
            return;
        }
    }

    // ── per-world driver ────────────────────────────────────────────────────
    var WORLDS = [], DN_RUN = false, FPS_RUNS = 0;
    function runWorld(W) {
        var t0 = LAB.realNow();
        W.start();
        LAB.freezeDay(0.5);
        LAB.metric("caves_transition." + W.label + ".build_ms", LAB.realNow() - t0, "ms");
        W.ents = W.entrances();
        W.axis = []; W.lateral = []; W.mouth = []; W.cap = []; W.jumps = []; W.high = []; W.crossFps = []; W.net = [];
        var PH = {}, PA = {};
        function timed(name, fn) {
            var t = LAB.realNow(), a = AW.calls;
            try { return fn(); } finally { PH[name] = (PH[name] || 0) + LAB.realNow() - t; PA[name] = (PA[name] || 0) + AW.calls - a; }
        }
        W.ents.forEach(function (E) {
            var lab = W.label + "/E" + E.index;
            timed("axis", function () { W.axis.push(axisWalk(W, E, lab)); });
            // Normal Endless re-centres cost about twice a Cave Test one, so there
            // only the entrance walks run (the three Cave Test worlds cover the rest).
            if (W.kind === "endless") {
                timed("lateral", function () {
                    W.lateral.push(lateralWalk(W, E, INSIDE_ALONG, -1, LATERAL_LEN, 520, lab + " lateral-"));
                    W.lateral.push(lateralWalk(W, E, INSIDE_ALONG, +1, LATERAL_LEN, 520, lab + " lateral+"));
                });
                return;
            }
            // Ordered so consecutive scenarios start near each other: the jump
            // sweep ends at along -150, where the lateral and cap walks start.
            timed("jumps", function () {
                var js = jumpSweep(W, E, lab);
                W.jumps = W.jumps.concat(js.nat); W.high = W.high.concat(js.high);
            });
            timed("lateral", function () {
                W.lateral.push(lateralWalk(W, E, INSIDE_ALONG, -1, LATERAL_LEN, 520, lab + " lateral-"));
                W.lateral.push(lateralWalk(W, E, INSIDE_ALONG, +1, LATERAL_LEN, 520, lab + " lateral+"));
            });
            timed("capwalk", function () { W.cap.push(capWalk(W, E, +1, lab + " capwalk+")); });
            timed("mouth", function () { W.mouth.push(lateralWalk(W, E, MOUTH_ALONG, +1, MOUTH_LEN, 400, lab + " mouth+")); });
        });
        if (W.ents.length && W.kind !== "endless") {
            if (FPS_RUNS < MAX_FPS_WORLDS) timed("crossings", function () { W.crossFps = fpsCrossing(W, W.ents[0].net, W.label); if (W.crossFps.length) FPS_RUNS++; });
            timed("network", function () { W.net = networkWalks(W, W.ents[0].net, W.label); });
        }
        if (W.ents.length && W.kind !== "endless" && !DITHER.found) timed("dither", function () { ditherScenario(W); });
        // Day/night cycle disabled (settings menu): updateDayNight returns at
        // L19294. World-independent, so once (the first world with an entrance).
        if (W.ents.length && !DN_RUN) {
            DN_RUN = true;
            settings.dayNight = false; RECORD_SHIFTS = false;
            try { timed("daynight", function () { W.nodn = axisWalk(W, W.ents[0], W.label + "/E0 dayNight-off"); }); }
            finally { LAB.freezeDay(0.5); RECORD_SHIFTS = true; }
        }
        for (var ph in PH) { LAB.metric("caves_transition." + W.label + "." + ph + "_ms", PH[ph], "ms"); LAB.metric("caves_transition." + W.label + "." + ph + ".assembles", PA[ph]); }
        LAB.metric("caves_transition." + W.label + ".scenario_ms", LAB.realNow() - t0, "ms");
    }

    // Cave Test worlds (terrain 'cavetest'); spawn state is measured first.
    var SPAWNS = [];
    CT_SEEDS.forEach(function (seed) {
        var W = { label: "ct" + seed, kind: "cavetest", seed: seed, done: false };
        W.start = function () {
            LAB.freshPage(); LAB.releasePad();
            var c0 = AW.calls;
            LAB.startCaveTest(seed);
            LAB.seedRandom(seed);
            var ls = LAB.layersAt(pos.x, pos.y), h = LAB.h(), best = null;
            ls.forEach(function (l) { if (LAB.walkable(l.t) && (best === null || Math.abs(h - l.z) < Math.abs(h - best.z))) best = l; });
            var sp = { label: W.label, world: LAB.worldPos(), h: h, stack: LAB.fmtLayers(ls), nearest: best, rock: rockBetween(ls, h) };
            var c1 = AW.calls;
            LAB.tick(1);
            sp.air1 = jumpAirborne; sp.h1 = LAB.h();
            // N6: the spawn teleport (L7612-7617) is not followed by updateChunks,
            // so the first tick re-centres. Its consequence (D19, enemy flags
            // across a re-centre) is the persistence suite's; METRIC only here.
            LAB.metric("caves_transition." + W.label + ".first_tick_recentres", AW.calls - c1);
            LAB.metric("caves_transition." + W.label + ".start_assembles", c1 - c0);
            SPAWNS.push(sp);
        };
        W.entrances = function () { return LAB.entrances(); };
        WORLDS.push(W);
    });
    // Normal Endless: nearest cave network to spawn (networks only in 'cave'
    // biome regions, ~30% of them -- 4460-4469).
    END_SEEDS.forEach(function (seed) {
        var W = { label: "end" + seed, kind: "endless", seed: seed, done: false };
        W.start = function () {
            LAB.freshPage(); LAB.releasePad();
            LAB.startEndless(seed);
            quiet();
            var nets = LAB.findCaveNetworks(12);
            W.network = nets.length ? nets[0] : null;
            if (W.network) LAB.note(W.label + ": nearest cave network region " + W.network.rx + "," + W.network.ry + " entrance " +
                Math.round(W.network.dist) + " u from spawn, " + W.network.net.entrances.length + " entrance(s)");
        };
        W.entrances = function () {
            if (!W.network) return [];
            var out = [];
            for (var i = 0; i < W.network.net.entrances.length; i++) out.push(frameOf(W.network.rx + "," + W.network.ry, W.network.net, i));
            return out;
        };
        WORLDS.push(W);
    });

    WORLDS.forEach(function (W) {
        LAB.scenario(P + "world " + W.label, function () { runWorld(W); W.done = true; });
    });

    // N5: a new world started while the previous one is mid-jump, compared with
    // the same world started from a fresh page. Normal Endless, so the Cave Test
    // spawn height bug (D13) cannot mask or mimic it.
    var N5 = { pre: [], done: false };
    LAB.scenario(P + "restart while airborne", function () {
        var seed = END_SEEDS[0];
        function run20() {
            var o = [];
            for (var i = 0; i < N5_TICKS; i++) { LAB.tick(1); o.push({ h: LAB.h(), air: jumpAirborne }); }
            return o;
        }
        LAB.freshPage(); LAB.releasePad();
        LAB.startEndless(seed); quiet();
        N5.fresh0 = { air: jumpAirborne, v: jumpVelZ };
        N5.fresh = run20();
        equipment.boots = { canJump: true, canDash: false };
        jumpPressed = true;
        LAB.tick(5);
        N5.before = { air: jumpAirborne, v: jumpVelZ };
        if (!jumpAirborne || jumpVelZ === 0) N5.pre.push("the previous world was not mid-jump at the restart (air " + jumpAirborne + ", jumpVelZ " + f2(jumpVelZ) + ")");
        jumpPressed = false;
        LAB.startEndless(seed); quiet();
        N5.after0 = { air: jumpAirborne, v: jumpVelZ };
        N5.again = run20();
        if (N5.fresh0.air) N5.pre.push("a fresh-page start is itself airborne");
        N5.done = true;
    });

    // D9 in isolation: ambient light approaching a cave entrance on OPEN ground.
    // With D2's far-out roof every real approach turns playerUnderground on
    // long before the 120 u blend (L19380-19384), so a real entrance cannot
    // show the blend. Fixture: one extra deepCaveEntrances entry on open
    // ground at the normal-Endless spawn; the player is placed at distances
    // 130..0 on the top layer and the game's own updateDayNight runs.
    var LIGHT = { pre: [], samples: [], done: false };
    LAB.scenario(P + "entrance light fixture", function () {
        LAB.freshPage(); LAB.releasePad();
        LAB.startEndless(END_SEEDS[0]); quiet();
        LAB.freezeDay(0.5);
        var O = LAB.worldPos();
        LAB.entrances().forEach(function (E) { if (Math.hypot(E.x - O.x, E.y - O.y) < 300) LIGHT.pre.push("a real entrance is within 300 u of the fixture"); });
        LAB.placeWorld(O.x + LIGHT_D[0], O.y, "top");
        updateDayNight(LAB.FIXED_DT);
        LIGHT.noFixture = ambientLight;
        var lo = LAB.toLocal(O.x, O.y), fake = { x: lo.x, y: lo.y, angle: 0 };
        deepCaveEntrances.push(fake);
        try {
            LIGHT_D.forEach(function (d) {
                LAB.placeWorld(O.x + d, O.y, "top");
                updateDayNight(LAB.FIXED_DT);
                var ls = LAB.layersAt(pos.x, pos.y);
                LIGHT.samples.push({ d: d, amb: ambientLight, ug: playerUnderground, roof: roofed(ls) });
            });
        } finally { var ix = deepCaveEntrances.indexOf(fake); if (ix >= 0) deepCaveEntrances.splice(ix, 1); }
        LIGHT.done = true;
    });
    G.assembleWindow = AW.orig;
    LAB.metric("caves_transition.total_ms", LAB.realNow() - T0_ALL, "ms");

    // ── aggregation helpers ─────────────────────────────────────────────────
    function collect(key) { var o = []; WORLDS.forEach(function (W) { (W[key] || []).forEach(function (R) { o.push(R); }); }); return o; }
    function worldGaps() {
        var g = [];
        WORLDS.forEach(function (W) {
            if (!W.done) g.push(W.label + ": world scenario did not complete");
            else if (!W.ents || !W.ents.length) g.push(W.label + ": no cave entrance found");
        });
        return g;
    }
    // Emit one aggregated check. `items` each carry .pre (precondition
    // failures, reported as a FAIL). fn(item) -> {bad, msg}. A world that did
    // not complete fails every check that draws on worlds (own = true skips
    // that for checks whose items were measured outside the worlds).
    function aggCheck(id, items, what, fn, tail, own) {
        var gaps = own ? [] : worldGaps(), bad = [], okd = [];
        if (!items.length) gaps.push("no " + what + " ran");
        items.forEach(function (it) {
            if (it.pre && it.pre.length) { gaps.push(it.label + ": precondition failed -- " + it.pre.join("; ")); return; }
            var v = fn(it);
            if (v && v.bad) bad.push(it.label + ": " + v.msg); else if (v) okd.push(it.label + ": " + v.msg);
        });
        var ok = !gaps.length && !bad.length;
        var detail = (gaps.length ? "PRECONDITION " + gaps.join(" | ") + " || " : "") +
                     (bad.length ? bad.join(" | ") : "") + (bad.length && okd.length ? " || ok: " : "") + okd.join(" | ") +
                     (tail ? " || " + tail : "");
        return LAB.check(P + id, ok, detail);
    }
    function both(R) { return (R.inW ? R.inW.trace : []).concat(R.outW ? R.outW.trace : []); }

    // ── METRICs (informative, never verdicts) ───────────────────────────────
    collect("axis").forEach(function (R) {
        if (!R.inW || !R.outW) return;
        var m = mname(R.label);
        [["in", R.inW], ["out", R.outW]].forEach(function (p) {
            var tr = p[1].trace, flips = 0, air = 0, maxdh = 0, pu = p[1].base.ug, pa = p[1].base.air, nocand = 0;
            tr.forEach(function (r) {
                if (r.ug !== pu) flips++; pu = r.ug;
                if (r.air && !pa) air++; pa = r.air;
                maxdh = Math.max(maxdh, Math.abs(r.dh));
                if (r.pick.idx < 0 && r.pick.type === 0 && !r.prevAir) nocand++;
            });
            LAB.metric(m + "." + p[0] + ".ug_flips", flips);
            LAB.metric(m + "." + p[0] + ".airborne_episodes", air);
            LAB.metric(m + "." + p[0] + ".max_abs_dh", maxdh, "h");
            LAB.metric(m + "." + p[0] + ".no_candidate_ticks", nocand);
            LAB.metric(m + "." + p[0] + ".ticks", tr.length);
        });
        LAB.metric(m + ".start_along", R.startAlong);
    });
    collect("lateral").concat(collect("mouth")).forEach(function (R) {
        if (!R.w) return;
        var m = mname(R.label), gain = 0;
        R.w.trace.forEach(function (r) { gain = Math.max(gain, r.dh); });
        LAB.metric(m + ".max_gain", gain, "h");
        LAB.metric(m + ".max_perp", R.maxPerp);
    });

    // ════════════════════════════════════════════════════════════════════════
    // Walking IN along the entrance axis and back OUT.
    // ════════════════════════════════════════════════════════════════════════
    var AX = collect("axis");

    // The exact-one-flip and monotonic-light checks need a single transition
    // into the entrance being exercised.  An overlapping corridor can turn
    // playerUnderground on and back off well before the mouth; that is a real
    // piece of cave geometry, not the D3 mouth gap these two verdicts isolate.
    // Detect the confound from the game's actual flag during the real walk
    // (rather than guessing from static roof layers, which missed ct31337/E1
    // while its player was between picker ranges).  Other axis checks still
    // exercise the entrance.  Require at least one eligible entrance per world
    // so the exclusion cannot make either verdict vacuous.
    function hasEarlyReopen(R) {
        if (!R.inW) return false;
        var pu = R.inW.base.ug, early = false;
        R.inW.trace.forEach(function (r) {
            if (pu && !r.ug && r.along > MOUTH_SCAN_END) early = true;
            pu = r.ug;
        });
        return early;
    }
    var AX_TRANSITION = AX.filter(function (R) {
        var eligible = !hasEarlyReopen(R);
        if (!eligible) LAB.note(R.label + ": excluded from single-transition lighting/flag verdicts: playerUnderground reopened before the mouth (overlapping corridor)");
        return eligible;
    });
    WORLDS.forEach(function (W) {
        if (W.done && !AX_TRANSITION.some(function (R) { return R.label.indexOf(W.label + "/") === 0; }))
            AX_TRANSITION.push({ label: W.label + " coverage", pre: ["no entrance has a single underground transition before the mouth"] });
    });
    LAB.metric("caves_transition.axis_transition_eligible", AX_TRANSITION.filter(function (R) { return !R.pre || !R.pre.length; }).length);
    LAB.metric("caves_transition.axis_transition_excluded", AX.length - AX_TRANSITION.filter(function (R) { return R.inW; }).length);

    // (a) the precondition itself, as its own check.
    aggCheck("walk-in: the walk reaches the cave floor 150 u inside and returns to the open surface", AX, "axis walk",
        function (R) { return { bad: false, msg: "start along " + sg(R.startAlong) + " world " + wxy(R.startWorld.x, R.startWorld.y) +
            ", deep h " + f2(R.deepH) + " on floor " + f2(R.deepFloor) + ", " + R.inW.trace.length + "+" + R.outW.trace.length + " ticks" }; });

    // (b) height continuity.
    // Which branch of step() produced a tick's height change, read from the
    // game's own picker result for that tick (rec.pick) and airborne flags.
    function cause(r) {
        var noCand = r.pick.idx < 0 && r.pick.type === 0;
        if (noCand && !r.prevAir) return "no-candidate fallback to topH 0 (L7901) eased 30% (L10277)";
        if (noCand && r.prevAir && r.dh > 0) return "airborne landing takes the no-candidate topH 0 (L7901) as the floor (L10146-10159)";
        if (r.prevAir && !r.air && r.dh > 0) return "airborne landing snaps UP onto a floor above (L10146-10159)";
        if (r.air && !r.prevAir) return "edge-fall start (L10179)";
        if (r.air) return "free fall (L10138)";
        return "walk ease (L10277)";
    }
    function worstDh(tr) { var w = null; tr.forEach(function (r) { if (!w || Math.abs(r.dh) > Math.abs(w.dh)) w = r; }); return w; }
    function dhMsg(w) { return w ? f3(w.dh) + " at along " + sg(w.along) + " world " + wxy(w.x, w.y) + " cell " + LAB.fmtLayers(w.ls) + " [" + cause(w) + "]" : "none"; }
    aggCheck("walk-in: height never changes by more than 0.35 h in one tick walking in or out", AX, "axis walk",
        function (R) {
            var wi = worstDh(R.inW.trace), wo = worstDh(R.outW.trace);
            var bad = (wi && Math.abs(wi.dh) > MAX_DH) || (wo && Math.abs(wo.dh) > MAX_DH);
            return { bad: bad, msg: "in " + dhMsg(wi) + "; out " + dhMsg(wo) };
        }, "limit " + MAX_DH + " h/tick (audit D1: +0.74/tick; N4 landing snap)");

    // (c) no airborne episodes on the ramp. Each episode is classified by the
    // picker query step()'s walk-off branch made (L10172-10176): a walkable
    // layer in step range means a micro-fall off a cell edge (D12); none
    // means a real edge (a cliff, e.g. the D1 trench step).
    aggCheck("walk-in: the player never goes airborne walking the entrance ramp", AX, "axis walk",
        function (R) {
            var n = 0, micro = 0, cliff = 0, unk = 0, first = null, pa = R.inW.base.air;
            both(R).forEach(function (r) {
                if (r.air && !pa) {
                    n++; if (!first) first = r;
                    if (!r.fallPick) unk++; else if (r.fallPick.idx >= 0) micro++; else cliff++;
                }
                pa = r.air;
            });
            return { bad: n > 0, msg: n + " airborne episode(s): " + micro + " D12 micro-fall(s) with a walkable layer in step range, " + cliff +
                " off an edge with none" + (unk ? ", " + unk + " unclassified" : "") + (first ? "; first at along " + sg(first.along) + " world " + wxy(first.x, first.y) : "") };
        }, "edge-fall threshold pos.floorZ > groundZ2 + 3 (= 0.075 h) at step L10179 (audit D12, physics suite)");

    // (d) playerUnderground flips exactly once each way.
    function flipList(W0, tr) {
        var pu = W0.base.ug, out = [];
        tr.forEach(function (r) { if (r.ug !== pu) out.push(tf(pu) + ">" + tf(r.ug) + "@" + sg(r.along)); pu = r.ug; });
        return out;
    }
    aggCheck("walk-in: playerUnderground changes exactly once going in and once coming out", AX_TRANSITION, "single-transition axis walk",
        function (R) {
            var fi = flipList(R.inW, R.inW.trace), fo = flipList(R.outW, R.outW.trace);
            var endIn = R.inW.trace.length ? R.inW.trace[R.inW.trace.length - 1].ug : R.inW.base.ug;
            var endOut = R.outW.trace.length ? R.outW.trace[R.outW.trace.length - 1].ug : R.outW.base.ug;
            var good = !R.inW.base.ug && endIn && fi.length === 1 && R.outW.base.ug && !endOut && fo.length === 1;
            return { bad: !good, msg: "in " + tf(R.inW.base.ug) + "->" + tf(endIn) + " flips [" + fi.join(" ") + "]; out " +
                tf(R.outW.base.ug) + "->" + tf(endOut) + " flips [" + fo.join(" ") + "]" };
        }, "playerUnderground = 'a walkable layer is above mine' L19342-19360; the cap hole within CAP_EXCL 30 u of the entrance (L6647) reads as outdoors (audit D3)");

    // (e) ambient light monotonic.
    aggCheck("walk-in: ambient light dims monotonically going in and brightens monotonically coming out", AX_TRANSITION, "single-transition axis walk",
        function (R) {
            var a0 = R.inW.base.amb, runMin = a0, worstIn = null, inEnd = a0;
            R.inW.trace.forEach(function (r) {
                if (r.amb > runMin + AMB_TOL && (!worstIn || r.amb - runMin > worstIn.d)) worstIn = { d: r.amb - runMin, r: r, from: runMin };
                runMin = Math.min(runMin, r.amb); inEnd = r.amb;
            });
            var b0 = R.outW.base.amb, runMax = b0, worstOut = null, outEnd = b0;
            R.outW.trace.forEach(function (r) {
                if (r.amb < runMax - AMB_TOL && (!worstOut || runMax - r.amb > worstOut.d)) worstOut = { d: runMax - r.amb, r: r, from: runMax };
                runMax = Math.max(runMax, r.amb); outEnd = r.amb;
            });
            var swingOk = (a0 - inEnd) >= AMB_MIN_SWING && (outEnd - b0) >= AMB_MIN_SWING;
            var msg = "in " + f2(a0) + "->" + f2(inEnd) + (worstIn ? " rises " + f2(worstIn.from) + "->" + f2(worstIn.from + worstIn.d) + " at along " + sg(worstIn.r.along) : " monotonic") +
                "; out " + f2(b0) + "->" + f2(outEnd) + (worstOut ? " drops " + f2(worstOut.from) + "->" + f2(worstOut.from - worstOut.d) + " at along " + sg(worstOut.r.along) : " monotonic") +
                (swingOk ? "" : " [the cave is not >= " + AMB_MIN_SWING + " darker than the surface: PRECONDITION]");
            return { bad: !!worstIn || !!worstOut || !swingOk, msg: msg };
        }, "tolerance " + AMB_TOL + "; the uncapped mouth reads as outdoors (D3) and the entrance blend L19380-19384 is brightest AT the entrance point (D9)");

    aggCheck("walk-in: ambient light never changes by more than 0.2 in one tick", AX, "axis walk",
        function (R) {
            var prev = R.inW.base.amb, worst = null;
            both(R).forEach(function (r) { var d = Math.abs(r.amb - prev); if (!worst || d > worst.d) worst = { d: d, r: r, a: prev }; prev = r.amb; });
            var inEnd = R.inW.trace.length ? R.inW.trace[R.inW.trace.length - 1].amb : R.inW.base.amb;
            var swing = R.inW.base.amb - inEnd;
            return { bad: (worst && worst.d > AMB_STEP) || swing < AMB_MIN_SWING,
                msg: "max step " + f2(worst ? worst.d : 0) + (worst ? " (" + f2(worst.a) + "->" + f2(worst.r.amb) + ") at along " + sg(worst.r.along) + " world " + wxy(worst.r.x, worst.r.y) : "") +
                    (swing < AMB_MIN_SWING ? " [ambient only fell " + f2(swing) + " going in -- no transition to be smooth about: PRECONDITION]" : "") };
        }, "limit " + AMB_STEP + "/tick; underground clamps ambient to min(amb,0.45) in one tick at L19372-19376 (audit D3)");

    // (e2) the other two lighting switches on the same flip (U6).
    var AXS = AX.map(function (R) {
        var pre = R.pre.slice();
        if (!pre.length && R.inW.base.sun < SUN_MIN) pre.push("the surface start is not in daylight (sunIntensity " + f2(R.inW.base.sun) + ")");
        return { label: R.label, pre: pre, R: R };
    });
    aggCheck("walk-in: sunlight and fog change by at most 0.2 and 0.05 in one tick walking in or out", AXS, "axis walk",
        function (it) {
            var R = it.R, ps = R.inW.base.sun, pf = R.inW.base.fog, ws = null, wf = null;
            both(R).forEach(function (r) {
                var ds = Math.abs(r.sun - ps), df = Math.abs(r.fog - pf);
                if (!ws || ds > ws.d) ws = { d: ds, r: r, a: ps };
                if (!wf || df > wf.d) wf = { d: df, r: r, a: pf };
                ps = r.sun; pf = r.fog;
            });
            return { bad: ws.d > SUN_STEP || wf.d > FOG_STEP,
                msg: "sun max step " + f2(ws.d) + " (" + f2(ws.a) + "->" + f2(ws.r.sun) + ") at along " + sg(ws.r.along) +
                     "; fog max step " + f2(wf.d) + " (" + f2(wf.a) + "->" + f2(wf.r.fog) + ") at along " + sg(wf.r.along) };
        }, "limits " + SUN_STEP + " sun / " + FOG_STEP + " fog per tick (a third of each swing); the underground branch sets sunIntensity = 0 and fogFloor = 0.15 in one tick (L19377-19378)");

    // (f) headroom under a ceiling.
    aggCheck("walk-in: wherever a cave ceiling is above the player's floor, the eye (h + 2.4) stays below it", AX, "axis walk",
        function (R) {
            var n = 0, bad = 0, worst = null;
            both(R).forEach(function (r) {
                var ref = (r.sup.idx >= 0 || r.sup.type !== 0) ? r.sup.topH : r.h;
                var c = ceilAbove(r.ls, ref);
                if (!c) return;
                n++;
                var head = c.z - r.h;
                if (head < EYE_H) { bad++; if (!worst || head < worst.head) worst = { head: head, r: r, c: c.z }; }
            });
            if (n < 20) return { bad: true, msg: "only " + n + " ticks under a ceiling [PRECONDITION: the walk never went under the roof]" };
            return { bad: bad > 0, msg: bad + "/" + n + " roofed ticks with headroom < " + EYE_H + (worst ? ", worst " + f2(worst.head) + " (ceiling " + f2(worst.c) +
                " h " + f2(worst.r.h) + ") at along " + sg(worst.r.along) + " world " + wxy(worst.r.x, worst.r.y) + " cell " + LAB.fmtLayers(worst.r.ls) : "") };
        }, "eye = h + 2.4 (getCam3D cameraZ L454); the roof reaches far outside the arch with the ceiling below the outside floor (D2, caves_geometry) and the player walks the 5 h trench under it (D1)");

    // (g) never inside rock.
    function rockScan(trace) {
        var n = 0, first = null;
        trace.forEach(function (r) { var k = rockBetween(r.ls, r.h); if (k) { n++; if (!first) first = { r: r, k: k }; } });
        return { n: n, first: first };
    }
    function rockMsg(s) {
        return s.n + " tick(s) between ceiling and cap" + (s.first ? ", first h " + f2(s.first.r.h) + " between ceiling " + f2(s.first.k.c) +
            " and cap " + f2(s.first.k.k) + " at along " + sg(s.first.r.along) + " perp " + sg(s.first.r.perp) + " world " + wxy(s.first.r.x, s.first.r.y) : "");
    }
    aggCheck("walk-in: the player is never inside rock between a cave ceiling and the surface cap above it", AX, "axis walk",
        function (R) { var s = rockScan(both(R)); return { bad: s.n > 0, msg: rockMsg(s) }; },
        "cap (type 4) over every ceilinged cell (assembleWindow L6647-6693); the ceiling is stamped at full value (L5621) below the lerped floor (L5618) (audit D2/D14)");

    function sunkScan(trace) {
        var n = 0, first = null;
        trace.forEach(function (r) { var z = sunk(r.ls, r.h); if (z !== null) { n++; if (!first) first = { r: r, z: z }; } });
        return { n: n, first: first };
    }
    function sunkMsg(s) {
        return s.n + " tick(s) sunk > " + STEP_H + " h below every floor" + (s.first ? ", first h " + f2(s.first.r.h) + " under lowest floor " + f2(s.first.z) +
            " at along " + sg(s.first.r.along) + " perp " + sg(s.first.r.perp) + " world " + wxy(s.first.r.x, s.first.r.y) + " [" + cause(s.first.r) + "]" : "");
    }
    aggCheck("walk-in: the player never sinks more than a step height below every floor of its cell", AX, "axis walk",
        function (R) { var s = sunkScan(both(R)); return { bad: s.n > 0, msg: sunkMsg(s) }; },
        "step height = STEP_UP 1.0 (L7844)");

    // ════════════════════════════════════════════════════════════════════════
    // Entrance light (D9) on open ground, fixture entrance.
    // ════════════════════════════════════════════════════════════════════════
    (function () {
        var it = { label: "end" + END_SEEDS[0] + " open ground", pre: LIGHT.pre.slice() };
        if (!LIGHT.done) it.pre.push("the fixture scenario did not complete");
        LIGHT.samples.forEach(function (s) { if (s.ug || s.roof) it.pre.push("sample at " + s.d + " u is not open ground (ug " + s.ug + ", roofed " + s.roof + ")"); });
        if (LIGHT.samples.length && Math.abs(LIGHT.samples[0].amb - LIGHT.noFixture) > 1e-9)
            it.pre.push("the fixture changes ambient " + LIGHT_D[0] + " u out (" + f2(LIGHT.samples[0].amb) + " vs " + f2(LIGHT.noFixture) + ")");
        aggCheck("entrance light: open ground retains exterior daylight even near a cave entrance",
            [it], "entrance-light sample", function () {
                var seq = LIGHT.samples.map(function (s) { return s.d + ":" + f2(s.amb); }).join(" ");
                var unchanged = LIGHT.samples.every(function (s) { return Math.abs(s.amb - LIGHT.noFixture) < 1e-9; });
                return { bad: !unchanged, msg: "exterior ambient=" + f2(LIGHT.noFixture) + " [" + seq + "]" };
            }, "The portal now fades light inside actual cover; an entrance marker alone must not darken open terrain. Covered monotonicity is tested by the real in/out walks.", true);
    })();

    // ════════════════════════════════════════════════════════════════════════
    // Lateral containment: 150 u inside, walk perpendicular ~600 u each side.
    // ════════════════════════════════════════════════════════════════════════
    var LT = collect("lateral");
    aggCheck("lateral: walking sideways inside the corridor never puts the player inside rock between ceiling and cap", LT, "lateral walk",
        function (R) { var s = rockScan(R.w.trace); return { bad: s.n > 0, msg: rockMsg(s) + "; max |perp| " + Math.round(R.maxPerp) }; },
        "corridor feather hw+108 (queryCaveGeometry L4684) with walls only where fade>0.3 (L4773) (audit D14)");
    aggCheck("lateral: walking sideways inside the corridor never sinks the player below every floor", LT, "lateral walk",
        function (R) { var s = sunkScan(R.w.trace); return { bad: s.n > 0, msg: sunkMsg(s) }; },
        "no-candidate fallback returns topH 0 (L7901, audit D11, physics suite) and step() eases to h=0 (L10277) past the open corridor edge (audit D14)");
    aggCheck("lateral: walking sideways inside the corridor never raises the player more than a step height (1.0 h) in one tick", LT, "lateral walk",
        function (R) {
            var worst = null;
            R.w.trace.forEach(function (r) { if (!worst || r.dh > worst.dh) worst = r; });
            return { bad: worst && worst.dh > STEP_H, msg: "max gain " + f2(worst ? worst.dh : 0) + (worst ? " at perp " + sg(worst.perp) + " world " + wxy(worst.x, worst.y) + " cell " + LAB.fmtLayers(worst.ls) + " [" + cause(worst) + "]" : "") };
        }, "limit = STEP_UP 1.0 (L7844) (audit D14: +1.70 h/tick via the D11 fallback, physics suite)");
    // A tick on ANOTHER entrance's approach (along -60..+520, |perp| < 60 of
    // it) may legitimately be out from under the roof: that is a way out.
    function onOtherApproach(R, r) {
        return R.others.some(function (E2) {
            var dx = r.x - E2.x, dy = r.y - E2.y, al = dx * E2.outX + dy * E2.outY, pp = dx * (-E2.outY) + dy * E2.outX;
            return al > -60 && al < 520 && Math.abs(pp) < 60;
        });
    }
    aggCheck("lateral: walking sideways the player stays under the cave roof (stopped by a wall or still on the cave floor)", LT, "lateral walk",
        function (R) {
            var n = 0, first = null, excused = 0;
            R.w.trace.forEach(function (r) { if (!ceilAbove(r.ls, r.h)) { if (onOtherApproach(R, r)) { excused++; return; } n++; if (!first) first = r; } });
            var last = R.w.trace.length ? R.w.trace[R.w.trace.length - 1] : null;
            return { bad: n > 0, msg: n + " tick(s) with no ceiling overhead" + (excused ? " (+" + excused + " on another entrance's approach, allowed)" : "") + (first ? ", first at perp " + sg(first.perp) + " h " + f2(first.h) + " world " + wxy(first.x, first.y) + " cell " + LAB.fmtLayers(first.ls) : "") +
                (last ? "; ended perp " + sg(last.perp) + " h " + f2(last.h) + " cell " + LAB.fmtLayers(last.ls) : "") };
        }, "cave walls are skipped for non-underground players (isInGridWall L9999) and carved only where fade>0.3 (L4773) (audit D14)");

    // Lateral walks in the uncapped mouth (along +10): there playerUnderground
    // is false (D3), so isInGridWall skips cave walls (F6, L9999).
    var MO = collect("mouth");
    aggCheck("mouth: walking sideways in the uncapped cave mouth never sinks the player below every floor", MO, "mouth lateral walk",
        function (R) {
            var s = sunkScan(R.w.trace), last = R.w.trace.length ? R.w.trace[R.w.trace.length - 1] : null;
            return { bad: s.n > 0, msg: sunkMsg(s) + "; start ug " + tf(R.startUg) + (last ? ", ended perp " + sg(last.perp) + " h " + f2(last.h) + " cell " + LAB.fmtLayers(last.ls) : "") };
        }, "the mouth reads as outdoors (D3), so cave walls are skipped (F6, isInGridWall L9999); past the open corridor edge (D14) the picker falls back to topH 0 (D11, physics suite)");

    // ════════════════════════════════════════════════════════════════════════
    // Walking on the surface across a capped corridor (U2 guard, E4).
    // ════════════════════════════════════════════════════════════════════════
    var CW = collect("cap");
    aggCheck("cap walk: walking on the surface across a roofed corridor never drops the player more than a step below the top walkable layer", CW, "cap walk",
        function (R) {
            var n = 0, first = null, worst = null;
            R.w.trace.forEach(function (r) {
                var top = LAB.topWalkable(r.ls);
                if (top && r.h < top.z - STEP_H) { n++; if (!first) first = r; if (!worst || r.h - top.z < worst.d) worst = { d: r.h - top.z, r: r }; }
            });
            return { bad: n > 0, msg: n + " tick(s) more than " + STEP_H + " h below the top walkable layer" +
                (first ? ", first at perp " + sg(first.perp) + " h " + f2(first.h) + " cell " + LAB.fmtLayers(first.ls) + " [" + cause(first) + "]" +
                         "; deepest " + f2(worst.r.h) + " in " + LAB.fmtLayers(worst.r.ls) : "") + "; " + R.capTicks + " ticks over a cap" };
        }, "the surface over a cave is the cap (type 4, L6680) and the picker prefers the layer nearest the feet (L7877-7890)");
    aggCheck("cap walk: playerUnderground is never true while no cave ceiling is above the player", CW, "cap walk",
        function (R) {
            var n = 0, first = null;
            R.w.trace.forEach(function (r) {
                var ref = (r.sup.idx >= 0) ? r.sup.topH : r.h;
                if (r.ug && !ceilAbove(r.ls, ref)) { n++; if (!first) first = r; }
            });
            return { bad: n > 0, msg: n + " tick(s) underground with no ceiling above" + (first ? ", first at perp " + sg(first.perp) + " h " + f2(first.h) + " cell " + LAB.fmtLayers(first.ls) : "") };
        }, "playerUnderground = 'a walkable layer is above mine' (L19355-19360, D3): a cap just above a feather floor that rose over the ceiling (D2/D14, E4) reads as a roof");

    // ════════════════════════════════════════════════════════════════════════
    // Cave Test spawn (resetEndlessMode L7600 pos.floorZ = 60, L7612-7617 move).
    // ════════════════════════════════════════════════════════════════════════
    SPAWNS.forEach(function (sp) { sp.pre = []; });
    aggCheck("spawn: Cave Test puts the player on a walkable layer of the spawn cell", SPAWNS, "Cave Test start",
        function (sp) {
            var d = sp.nearest ? Math.abs(sp.h - sp.nearest.z) : Infinity;
            return { bad: !(d <= 0.1), msg: "h " + f2(sp.h) + " at world " + wxy(sp.world.x, sp.world.y) + " cell " + sp.stack + ", nearest walkable " +
                (sp.nearest ? f2(sp.nearest.z) : "none") + (sp.rock ? " (inside rock between ceiling " + f2(sp.rock.c) + " and cap " + f2(sp.rock.k) + ")" : "") };
        }, "tolerance 0.1 h; spawn keeps pos.floorZ = 60 (h=0) from L7600 after moving 60 u outside the entrance at L7612-7617 (audit D13)", true);
    aggCheck("spawn: the Cave Test spawn is not airborne after one tick", SPAWNS, "Cave Test start",
        function (sp) { return { bad: !!sp.air1, msg: "airborne " + sp.air1 + ", h " + f2(sp.h) + " -> " + f2(sp.h1) }; },
        "audit D13", true);

    // N5: restart while airborne.
    (function () {
        var it = { label: "end" + END_SEEDS[0], pre: N5.pre.slice() };
        if (!N5.done) it.pre.push("the restart scenario did not complete");
        aggCheck("restart: a world started while the previous one is mid-jump behaves like one started from a fresh page", [it], "restart",
            function () {
                var worst = 0, at = -1, airDiff = -1;
                for (var i = 0; i < N5_TICKS; i++) {
                    var d = Math.abs(N5.again[i].h - N5.fresh[i].h);
                    if (d > worst) { worst = d; at = i; }
                    if (airDiff < 0 && N5.again[i].air !== N5.fresh[i].air) airDiff = i;
                }
                var bad = worst > N5_TOL || airDiff >= 0 || N5.after0.air !== N5.fresh0.air;
                return { bad: bad, msg: "at the restart jumpAirborne " + N5.after0.air + " jumpVelZ " + f2(N5.after0.v) + " (fresh page: " + N5.fresh0.air + ", " + f2(N5.fresh0.v) +
                    "); first " + N5_TICKS + " ticks max |dh| vs fresh " + f3(worst) + (at >= 0 ? " at tick " + (at + 1) + " (" + f3(N5.fresh[at].h) + " vs " + f3(N5.again[at].h) + ")" : "") +
                    (airDiff >= 0 ? ", airborne differs from tick " + (airDiff + 1) : "") };
            }, "previous world left mid-jump (air " + (N5.before ? N5.before.air : "?") + ", jumpVelZ " + (N5.before ? f2(N5.before.v) : "?") +
               "); resetEndlessMode (L7511) resets neither jumpAirborne nor jumpVelZ (audit N5)", true);
    })();

    // ════════════════════════════════════════════════════════════════════════
    // Day/night disabled (settings.dayNight=false).
    // ════════════════════════════════════════════════════════════════════════
    var DN = [];
    WORLDS.forEach(function (W) { if (W.nodn) DN.push(W.nodn); });
    aggCheck("dayNight off: playerUnderground is false on the surface and true deep in the cave", DN, "dayNight-off walk",
        function (R) {
            var startUg = R.inW.base.ug;
            var deepUg = R.inW.trace.length ? R.inW.trace[R.inW.trace.length - 1].ug : null;
            var endUg = R.outW.trace.length ? R.outW.trace[R.outW.trace.length - 1].ug : null;
            return { bad: !(startUg === false && deepUg === true && endUg === false),
                msg: "surface " + tf(startUg) + ", deep (along " + INSIDE_ALONG + ") " + tf(deepUg) + ", back on surface " + tf(endUg) };
        }, "updateDayNight returns at L19294 before the underground test at L19342, so playerUnderground keeps its last value (audit D10)");

    // ════════════════════════════════════════════════════════════════════════
    // Window re-centre (assembleWindow on a chunk-line crossing, updateChunks L7474).
    // Items from 60 Hz walks and from the 30 fps real-loop crossings (2 physics
    // steps and one floor-cache bump per frame, L18967/L21916).
    // ════════════════════════════════════════════════════════════════════════
    var NEAR = SHIFTS.filter(function (s) { return s.near; });
    function shiftItem(s) {
        var it = { label: s.walk + " @" + wxy(s.x, s.y) + " origin " + s.from + "->" + s.to, s: s, pre: [] };
        if (s.spr > 1 && (s.res.renderErrors || s.res.consoleErrors)) it.pre.push("the real loop reported " + s.res.renderErrors + " render/update error(s) and " + s.res.consoleErrors + " console error(s) during this walk");
        return it;
    }
    var shiftItems = NEAR.map(shiftItem);
    var noCopy = NEAR.filter(function (s) { return !s.hasOld; });
    if (noCopy.length) shiftItems.push({ label: "coverage", s: null, pre: [noCopy.length + " re-centre(s) with no pre-shift stack copy (the snapshot gate missed a chunk line)"] });
    // Motion checks use only re-centres on level ground (see shiftRecord): a
    // shift that lands on a D1/D14 jolt would otherwise be blamed for it.
    var LEVEL = NEAR.filter(function (s) { return s.level; });
    var levelItems = LEVEL.map(shiftItem);
    var levelGaps = [];
    WORLDS.forEach(function (W) {
        if (!LEVEL.some(function (s) { return s.w === W.label && s.spr === 1; })) levelGaps.push(W.label + ": no 60 Hz window re-centre on level ground near or inside a cave");
    });
    if (!LEVEL.some(function (s) { return s.nearE <= NEAR_ENTRANCE; })) levelGaps.push("no level-ground re-centre within " + NEAR_ENTRANCE + " u of an entrance");
    if (!LEVEL.some(function (s) { return s.spr > 1; })) levelGaps.push("no level-ground re-centre in a " + FPS + " fps real-loop walk");
    if (levelGaps.length) levelItems.push({ label: "coverage", s: null, pre: levelGaps });
    LAB.metric("caves_transition.window_shifts_total", SHIFTS.length);
    LAB.metric("caves_transition.window_shifts_near_cave", NEAR.length);
    LAB.metric("caves_transition.window_shifts_level", LEVEL.length);
    LAB.metric("caves_transition.window_shifts_level_fps", LEVEL.filter(function (s) { return s.spr > 1; }).length);
    aggCheck("window shift: re-centring the window keeps the layer stack under the player unchanged", shiftItems, "window shift near a cave",
        function (it) { var s = it.s; return { bad: !s.stackSame, msg: s.stackSame ? "same " + s.newS : "old " + s.oldS + " new " + s.newS }; });
    // Walking speed is ~1.5-2 u per 60 Hz tick; a re-centre must not add to it.
    aggCheck("window shift: the player's world position stays continuous across a window re-centre", levelItems, "level-ground window shift near a cave",
        function (it) {
            var s = it.s;
            return { bad: s.move > s.move0 + 1.0, msg: "moved " + f2(s.move) + " u on the shift " + (s.spr > 1 ? "frame" : "tick") + " vs " + f2(s.move0) + " u the one before" };
        }, "rebase pos -= shift at assembleWindow L7289-7291; allowance +1.0 u over the previous tick's/frame's travel");
    aggCheck("window shift: crossing a chunk line near or inside a cave does not jolt the player's height", levelItems, "level-ground window shift near a cave",
        function (it) {
            var s = it.s, d = Math.max(Math.abs(s.dh), Math.abs(s.dh2));
            return { bad: d > MAX_DH * s.spr, msg: "|dh| " + f3(d) + (s.spr > 1 ? " per frame" : "") + (s.underRoof ? " under roof" : " " + Math.round(s.nearE) + " u from entrance") };
        }, "limit " + MAX_DH + " h per physics step (" + (MAX_DH * 60 / FPS) + " per " + FPS + " fps frame)");
    // A one-tick blip: two changes within records k-2..k+3. One change is a
    // legitimate transition; the D3 mouth flips are >= 50 u (25 ticks) apart.
    aggCheck("window shift: playerUnderground does not flicker across a window re-centre", levelItems, "level-ground window shift near a cave",
        function (it) {
            var s = it.s, tr = s.trace, lo = Math.max(0, s.k - 2), hi = Math.min(tr.length - 1, s.k + 3);
            var prev = lo > 0 ? tr[lo - 1].ug : s.base.ug, n = 0, seq = "";
            for (var i = lo; i <= hi; i++) { if (tr[i].ug !== prev) n++; prev = tr[i].ug; seq += tf(tr[i].ug); }
            return { bad: n >= 2, msg: n + " change(s) in records k-2..k+3 [" + seq + "]" };
        });

    // G3: no hysteresis on the re-centre (updateChunks L7483 re-centres as soon
    // as the player's chunk differs from the window centre).
    (function () {
        var it = { label: DITHER.label || "dither", pre: DITHER.pre.slice() };
        if (!DITHER.found) it.pre.push("no entrance axis crosses a chunk line within " + DITHER_REACH + " u of its entrance point");
        else if (!DITHER.done) it.pre.push("the dither scenario did not complete");
        aggCheck("window shift: dithering " + DITHER_D + " u back and forth across a chunk line at a cave mouth re-centres the window at most once", [it], "dither",
            function () { return { bad: DITHER.calls > DITHER_MAX, msg: DITHER.calls + " re-centre(s) (assembleWindow calls) for " + DITHER.crossings + " crossings" }; },
            "each re-centre is a synchronous assembleWindow (METRIC build_ms); updateChunks re-centres on any chunk change with no hysteresis (L7483, audit G3)");
    })();

    // Every real-loop frame must have run: gameUpdate and every draw pass sit
    // inside _pt (L20576-20585), which swallows a throw and carries on.
    var FW = collect("crossFps");
    FW.forEach(function (R) { R.label = R.tag; R.pre = []; if (R.trace.length < 10) R.pre.push("only " + R.trace.length + " frames ran"); });
    aggCheck(FPS + " fps: every real-loop frame of the " + FPS + " fps cave walks runs without a render, update or console error", FW, FPS + " fps walk",
        function (R) { return { bad: R.renderErrors > 0 || R.consoleErrors > 0, msg: R.trace.length + " frames, " + R.renderErrors + " _pt/loop error(s), " + R.consoleErrors + " console.error line(s)" }; },
        "LAB.frameAt -> LAB.renderErrorsSince (loop crashes + _ptErrors) and LAB.errorCount");

    // ════════════════════════════════════════════════════════════════════════
    // Inside the network: every corridor walked end to end (N14).
    // ════════════════════════════════════════════════════════════════════════
    var NW = collect("net");
    var netGaps = [];
    WORLDS.forEach(function (W) {
        var n = 0; (W.net || []).forEach(function (R) { n += R.n; });
        // Normal Endless deliberately runs only entrance and lateral walks: a
        // re-centre there costs about twice a Cave Test rebuild.  The three
        // Cave Test networks own this exhaustive corridor coverage.
        if (W.kind !== "endless" && W.done && W.ents && W.ents.length && n < 6)
            netGaps.push(W.label + ": only " + n + " corridor(s) walked on a roofed floor");
    });
    NW.forEach(function (R) { if (R.w && R.w.missed > 24) R.pre.push("stopped " + f2(R.w.missed) + " u short of a corridor end"); });
    if (netGaps.length) NW.push({ label: "coverage", pre: netGaps });
    aggCheck("network: walking each corridor end to end, height never changes by more than 0.35 h in one tick", NW, "corridor walk",
        function (R) { var w = worstDh(R.w.trace); return { bad: w && Math.abs(w.dh) > MAX_DH, msg: "worst " + (w ? f3(w.dh) + " at world " + wxy(w.x, w.y) + " cell " + LAB.fmtLayers(w.ls) + " [" + cause(w) + "]" : "none") }; },
        "limit " + MAX_DH + " h/tick; two entrance trees of one network get independent depths (N14)");
    aggCheck("network: walking each corridor end to end, the player never sinks more than a step height below every floor", NW, "corridor walk",
        function (R) { var s = sunkScan(R.w.trace); return { bad: s.n > 0, msg: sunkMsg(s) }; },
        "step height = STEP_UP 1.0 (L7844)");

    // ════════════════════════════════════════════════════════════════════════
    // Jumping inside the cave (boots canJump; ceilings not solid in the picker L7877).
    // ════════════════════════════════════════════════════════════════════════
    function jumpAgg(id, list, needRise, fn, tail) {
        // one item per world/entrance so the detail stays readable
        var groups = {}, order = [];
        list.forEach(function (J) { if (!groups[J.label]) { groups[J.label] = []; order.push(J.label); } groups[J.label].push(J); });
        var items = order.map(function (g) {
            var js = groups[g], pre = [];
            js.forEach(function (J) { if (J.pre.length) pre.push("along " + sg(J.along) + " " + J.pre.join(", ")); });
            if (js.length < 3) pre.push("only " + js.length + " roofed spot(s) to jump from");
            if (!js.some(function (J) { return J.rise >= needRise; })) pre.push("no jump rose >= " + needRise + " h anywhere (jump physics not exercised)");
            return { label: g, js: js, pre: pre };
        });
        aggCheck(id, items, "cave jump", fn, tail);
    }
    var JH = collect("high");
    jumpAgg("jump: a jump that would carry the player above the cave ceiling is stopped by it", JH, 1.0, function (it) {
        var bad = it.js.filter(function (J) { return !(J.maxH < J.ceil - CEIL_MARGIN); });
        var worst = null;
        it.js.forEach(function (J) { var m = J.ceil - J.maxH; if (!worst || m < worst.m) worst = { m: m, J: J }; });
        return { bad: bad.length > 0, msg: bad.length + "/" + it.js.length + " jumps pass the ceiling" +
            (bad.length ? " (" + bad.slice(0, 3).map(function (J) { return "along " + sg(J.along) + " apex " + f2(J.maxH) + " ceiling " + f2(J.ceil) + " landed " + J.endStack; }).join("; ") + ")"
                        : ", tightest clearance " + f2(worst.m) + " at along " + sg(worst.J.along)) };
    }, "impulse raised so the free apex clears the ceiling by " + HIGH_CLEAR + " h; margin " + CEIL_MARGIN + " h; the airborne integrator (L10137-10139) has no ceiling test and the landing picker ignores ceilings (L7877) (N3)");
    var JN = collect("jumps");
    jumpAgg("jump: a vertical jump inside the cave lands back on the cave floor it left", JN, 1.0, function (it) {
        var bad = it.js.filter(function (J) { return !J.landed || J.airEnd || Math.abs(J.hEnd - J.h0) > LAND_TOL; });
        return { bad: bad.length > 0, msg: bad.length + "/" + it.js.length + " bad landings" +
            (bad.length ? " (" + bad.slice(0, 4).map(function (J) { return "along " + sg(J.along) + " h0 " + f2(J.h0) + " ceiling " + f2(J.ceil) + " apex " + f2(J.maxH) + " end " + f2(J.hEnd) + " " + J.endStack; }).join("; ") + ")" : "") };
    }, "the game's own impulse; tolerance " + LAND_TOL + " h");
    // The natural jump's ceiling passes, for humans (the verdict is the high-jump check above).
    var natPass = JN.filter(function (J) { return J.ceil !== null && J.maxH >= J.ceil - CEIL_MARGIN; }).length;
    LAB.metric("caves_transition.natural_jumps", JN.length);
    LAB.metric("caves_transition.natural_jumps_through_ceiling", natPass);
}
LAB.finish();
undefined;
