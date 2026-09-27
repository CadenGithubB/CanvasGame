(0, eval)(slurp("tools/webui/harness/_game_env.js"));
LAB.init(__out, slurp, __engine, __argv);
// The detail is the FIRST line of the load error only: LAB.loadError carries
// the stack after a newline, and game_lab's verdict parser needs the closing
// ']' on the same line -- a multi-line detail would turn this FAIL into a
// mangled id and the real id into MISSING.
LAB.check("perf: game script evaluates without throwing", LAB.load(__argv[0]),
    String(LAB.loadError || "").split("\n")[0].slice(0, 300));

// game_perf_harness.js -- deterministic performance budgets for the Endless
// crawler in WebPage_Games.h, plus measured metrics.
//
// Pass/fail is decided ONLY by counts the game itself produces: cells its own
// floor pass writes into its own _drawFloorCellBuf, calls to its own
// assembleWindow / parseInt / noise functions / hw.fetchJSON, lines it writes
// to the console, entries in its own _rgbCache, fills its own draw code
// issues, cam.ang / world position after driving its own loop(), the text its
// own HUD draws. Wall-clock time never decides a verdict; it is reported as
// METRIC ids ending in _ms, which game_lab's determinism comparison ignores.
//
// usage (via tools/webui/game_lab.py): <extracted game js> [--endless-seeds a,b]
//   --endless-seeds  normal Endless worlds (default 424242). This suite starts
//                    no Cave Test world, so --seeds is accepted and ignored.
//
// All line numbers are WebPage_Games.h header lines.
//
// Everything below lives in one IIFE: under jsc the harness is a classic
// script, so a top-level `function applyPreset` here would silently replace
// the game's own global of the same name.

(function () {
    if (!LAB.loaded) return;
    var G = (0, eval)("this");
    var SEEDS = LAB.seeds([424242], "endless-seeds");
    var PRESETS = ["low", "medium", "high", "ultra"];

    // Every detail on one line (see the load check above), whatever it holds.
    function check(id, ok, detail) {
        return LAB.check(id, ok, String(detail === undefined ? "" : detail).replace(/\s*\n\s*/g, " | "));
    }
    // LAB.scenario plus the scenario's wall time as an informational METRIC.
    function scenario(name, fn) {
        var t0 = LAB.realNow();
        LAB.scenario(name, fn);
        LAB.metric("perf.time." + name.replace(/^perf: /, "").replace(/[^A-Za-z0-9]+/g, "_") + "_ms", LAB.realNow() - t0, "ms");
    }
    var fx = LAB.fx;
    function fmt(v, d) { return fx(+v, d === undefined ? 0 : d); }
    function digitless(s) { return String(s).replace(/[0-9]+(\.[0-9]+)?/g, "#").slice(0, 48); }
    // Console lines / errors written since a LAB.logCount / LAB.errorCount mark.
    function newLines(mark) { var n = LAB.logCount - mark; return n > 0 ? LAB.logs.slice(-Math.min(n, LAB.logs.length)) : []; }
    function newErrors(mark) { var n = LAB.errorCount - mark; return n > 0 ? LAB.errors.slice(-Math.min(n, LAB.errors.length)) : []; }
    // n real loop() frames at an arbitrary interval; returns new render errors.
    function frames(n, ms) { var e = 0; for (var i = 0; i < n; i++) e += (ms ? LAB.frameAt(ms) : LAB.frame()); return e; }
    // A fresh page, a new Endless world, noon, the pad released. Scenarios
    // that TEST page-load pad state (N11) start their own way.
    function fresh(seed) {
        LAB.freshPage();
        LAB.startEndless(seed);
        LAB.freezeDay(0.5);
        LAB.releasePad();
    }
    // Move the player to a WORLD point WITHOUT calling updateChunks (unlike
    // LAB.placeWorld): the re-centre, if any, must come from the game's own
    // loop. Stands them on the top walkable layer of the target cell, which
    // must lie inside the current window.
    function teleport(wx, wy) {
        var l = LAB.toLocal(wx, wy);
        pos.x = l.x; pos.y = l.y; vel.x = 0; vel.y = 0;
        var top = LAB.topWalkable(LAB.layersAt(pos.x, pos.y));
        if (top) LAB.setH(top.z);
        jumpAirborne = false; jumpVelZ = 0;
        cam.x = pos.x; cam.y = pos.y; cam.z = pos.floorZ;
    }
    function chunkKey(p) { return Math.floor(p.x / CHUNK_SIZE) + "," + Math.floor(p.y / CHUNK_SIZE); }

    // ── floor render buffer: what the pass REALLY writes ─────────────────
    // _drawFloorCellBuf (L786) packs [distSq, x, y] per surviving cell; the
    // write at L12643-12646 is unguarded, and typed-array writes past the end
    // are silently dropped. The demand is measured from the buffer itself, not
    // re-derived from the __caveStats cull counters (a formula that is only
    // right while the game has exactly those three culls: a new cull counted
    // anywhere else would read as MORE cells):
    //   1. fill the live buffer with NaN, run the pass, count the triples it
    //      wrote (a pass that grows the buffer is re-run on the grown one);
    //   2. only when it filled the buffer to the last slot, re-run the same
    //      view with a 4x NaN scratch buffer to learn how many it WANTED.
    // A pass that writes nothing (did not run, returned early) is reported as
    // empty, never as whatever an earlier pass left in the counters.
    var _bigBuf = null;
    function countWritten(b) { var n = 0; for (var i = 1; i < b.length; i += 3) if (b[i] === b[i]) n++; return n; }
    function floorPass() {
        var threw = false, b = _drawFloorCellBuf, written = 0;
        for (var tries = 0; tries < 3; tries++) {
            b = _drawFloorCellBuf;
            b.fill(NaN);
            try { drawLayersFloor3D(); } catch (e) { threw = true; }
            if (_drawFloorCellBuf === b) { written = countWritten(b); break; }
        }
        var cap = Math.floor(b.length / 3), demand = written, saturated = false;
        if (written >= cap && cap > 0) {
            if (!_bigBuf || _bigBuf.length < b.length * 4) _bigBuf = new Float32Array(b.length * 4);
            _bigBuf.fill(NaN);
            _drawFloorCellBuf = _bigBuf;
            try { drawLayersFloor3D(); } catch (e2) {}
            demand = countWritten(_bigBuf);
            saturated = demand >= Math.floor(_bigBuf.length / 3);
            _drawFloorCellBuf = b;
        }
        var formula = __caveStats.floorTotal - __caveStats.floorDistCull - __caveStats.floorFovCull - __caveStats.floorBehind;
        return { demand: demand, cap: cap, written: written, threw: threw, saturated: saturated, formula: formula };
    }
    // Sweep pitch {0, pitchMax} x FOV {base, base + dash punch} x headings;
    // keep the pass closest to (or furthest past) its buffer's capacity.
    function sweepFloor(headings) {
        var pitches = [0, CAM_PITCH_MAX];
        var fovs = [GAME_CONFIG.player.baseFov, GAME_CONFIG.player.baseFov + GAME_CONFIG.player.dashFovPunch];
        var r = { max: -1, cap: 0, at: "", formula: 0, passes: 0, empty: 0, threw: 0, byPitch: {} };
        var sv = { ang: cam.ang, pitch: cam.pitch, fov: cam.fov };
        for (var pi = 0; pi < pitches.length; pi++) for (var fi = 0; fi < fovs.length; fi++) {
            for (var hi = 0; hi < headings; hi++) {
                cam.pitch = pitches[pi]; cam.fov = fovs[fi]; cam.ang = hi * 2 * Math.PI / headings;
                var p = floorPass();
                r.passes++;
                if (p.demand <= 0) { r.empty++; continue; }
                if (p.threw) r.threw++;
                var pk = "p" + fmt(pitches[pi], 1);
                r.byPitch[pk] = Math.max(r.byPitch[pk] || 0, p.demand);
                if (r.max < 0 || p.demand - p.cap > r.max - r.cap) {
                    r.max = p.demand; r.cap = p.cap; r.formula = p.formula; r.sat = p.saturated;
                    r.at = "pitch " + fmt(pitches[pi], 2) + (fi ? " +dash" : "") + " heading " + fmt(hi * 360 / headings) + "deg";
                }
            }
        }
        cam.ang = sv.ang; cam.pitch = sv.pitch; cam.fov = sv.fov;
        return r;
    }
    function byPitchText(bp) { return Object.keys(bp).map(function (k) { return k + " " + bp[k]; }).join(", "); }

    // ── the settings overlay, driven through the game's own click handler ──
    // Opening it is a keydown listener ('O', L22380-22392), which the env's
    // element stubs discard, so the open copies settings -> pendingSettings
    // exactly as that listener does. Everything after that is the game's own
    // code: drawSettingsOverlay lays out the click areas, handleSettingsClick
    // (L18004) handles the preset button and Apply (commit L18010-18018,
    // applySettings L17752). Apply's centre is covered by the Day/Night
    // toggle's hit area listed before it (N10), so the click goes to a point
    // inside Apply that no earlier area covers; the effect is verified.
    function areaHit(a, x, y) { return x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h; }
    function clickPoint(action, value) {
        var A = _settingsClickAreas, idx = -1;
        for (var i = 0; i < A.length; i++) if (A[i].action === action && (value === undefined || A[i].value === value)) { idx = i; break; }
        if (idx < 0) return null;
        var a = A[idx], centreOwner = null;
        for (var j = 0; j < idx; j++) if (areaHit(A[j], a.x + a.w / 2, a.y + a.h / 2)) { centreOwner = A[j].key || A[j].action; break; }
        for (var yy = a.y + a.h / 2; yy <= a.y + a.h; yy += 0.5) for (var xx = a.x + a.w / 2; xx <= a.x + a.w; xx += 0.5) {
            var free = true;
            for (var k = 0; k < idx && free; k++) if (areaHit(A[k], xx, yy)) free = false;
            if (free) return { x: xx, y: yy, centreOwner: centreOwner };
        }
        return null;
    }
    function applyPreset(name, aw) {
        pendingSettings.viewDist = settings.viewDist; pendingSettings.chunkWindow = settings.chunkWindow;
        pendingSettings.particles = settings.particles; pendingSettings.resolution = settings.resolution;
        pendingSettings.showFPS = settings.showFPS; pendingSettings.dayNight = settings.dayNight;
        _pendingQualityPreset = qualityPreset; _settingsDirty = false;
        settingsOpen = true;
        drawSettingsOverlay();
        var pp = clickPoint("preset", name), okPreset = !!pp && handleSettingsClick(pp.x, pp.y);
        drawSettingsOverlay();
        var ap = clickPoint("apply"), dn0 = settings.dayNight;
        var r0 = aw.calls, c0 = chunkKey(LAB.worldPos()), t0 = LAB.realNow();
        var okApply = !!ap && handleSettingsClick(ap.x, ap.y) && !settingsOpen;
        var rafs = LAB.flushRaf();
        var afterRaf = aw.calls - r0, ms = LAB.realNow() - t0;
        var errs = frames(2);                    // the "never otherwise" half: the next frames must not rebuild again
        settingsOpen = false;
        return { rebuilds: aw.calls - r0, afterRaf: afterRaf, rafs: rafs, ms: ms, errs: errs,
                 clicked: okPreset && okApply && settings.dayNight === dn0, chunkSame: chunkKey(LAB.worldPos()) === c0,
                 applyCentreOwner: ap ? ap.centreOwner : null };
    }
    function presetApplied(P) {
        return WINDOW_CHUNKS === P.chunkWindow && viewDist === P.viewDist && !!floorMesh &&
               floorMesh.w * floorMesh.gridSize === P.chunkWindow * CHUNK_SIZE;
    }

    // Typed-array bytes held by the assembled window (floorMesh + grid arrays
    // allocated in assembleWindow, L6458-6462/6608/6758/6804-6808/6834/6924/6930/7272).
    function windowBytes() {
        var typed = 0, slots = 0;
        for (var k in floorMesh) {
            var v = floorMesh[k];
            if (v && ArrayBuffer.isView(v)) typed += v.byteLength;
            else if (Array.isArray(v)) slots += v.length;
        }
        ["grid", "wallHeights", "wallColorR", "wallColorG", "wallColorB", "meshCave", "gridCave",
         "wallFaceBase", "wallCapZ", "wallMaxTopZ", "exploredCells"].forEach(function (n) {
            var v = G[n];
            if (v && ArrayBuffer.isView(v)) typed += v.byteLength;
        });
        return { typed: typed, slots: slots };
    }

    // Is a WORLD point clear ground for a walking player? The game's own tests:
    // isInGridWall (L9980) for grid walls, rectsOverlap (L2037) of a 64 u box
    // against walls[] -- repelFromWalls (L10008) pushes within 28 u of a rect,
    // and a push off the path is what sends a walker out of its chunk.
    function clearAt(wx, wy) {
        var l = LAB.toLocal(wx, wy);
        if (isInGridWall(l.x, l.y, 6) || isInGridWall(l.x, l.y, 18)) return false;
        var box = { x: l.x - 32, y: l.y - 32, w: 64, h: 64 };
        for (var i = 0; i < walls.length; i++) {
            if (walls[i].cave) continue;                         // surface players skip cave rects (L10314)
            if (rectsOverlap(box, walls[i])) return false;
        }
        return true;
    }
    // An east-west segment of clear ground inside chunk (cx, cy), 280 u long.
    // The window must already contain the chunk. Returns WORLD endpoints or null.
    function openSegment(cx, cy) {
        var x0 = cx * CHUNK_SIZE + 100, x1 = cx * CHUNK_SIZE + 380;
        var ys = [240];
        for (var d = 24; d <= 192; d += 24) ys.push(240 - d, 240 + d);
        for (var i = 0; i < ys.length; i++) {
            var wy = cy * CHUNK_SIZE + ys[i], ok = true;
            for (var wx = x0 - 12; wx <= x1 + 12 && ok; wx += 6) if (!clearAt(wx, wy)) ok = false;
            if (ok) return { cx: cx, cy: cy, A: { x: x0, y: wy }, B: { x: x1, y: wy } };
        }
        return null;
    }
    // Relocate to the first candidate chunk that has an open segment.
    function findSite(cands) {
        for (var i = 0; i < cands.length; i++) {
            var cx = cands[i][0], cy = cands[i][1];
            LAB.placeWorld(cx * CHUNK_SIZE + 240, cy * CHUNK_SIZE + 240, "top");
            var seg = openSegment(cx, cy);
            if (seg) return seg;
        }
        return null;
    }

    // Full frames through loop() (LAB.frame) while walking A <-> B inside
    // chunk (site.cx, site.cy) with the real keyboard path, steering back onto
    // the segment (aim 40 u ahead of the player's projection on it) when an
    // enemy or wall pushes it off. Enemies are part of play and can still
    // shove the player across a chunk line (repelFromEnemies, L10329), so the
    // result is accounted PER FRAME: a frame is steady-state only if the
    // player was in the site chunk before and after it. Console lines,
    // console errors and rebuilds are attributed to steady frames only;
    // render errors (loop crashes + _pt-caught pass exceptions) to every frame.
    function walkFrames(site, n, aw) {
        var A = site.A, B = site.B, home = site.cx + "," + site.cy;
        var len = Math.hypot(B.x - A.x, B.y - A.y), ux = (B.x - A.x) / len, uy = (B.y - A.y) / len;
        var r = { moved: 0, steady: 0, lines: [], errors: [], rebuilds: 0, renderErrors: 0 };
        var dir = 1, last = LAB.worldPos();
        for (var f = 0; f < n; f++) {
            var p = LAB.worldPos(), inBefore = chunkKey(p) === home, rb0 = aw.calls;
            var lc0 = LAB.logCount, ec0 = LAB.errorCount;
            var t = (p.x - A.x) * ux + (p.y - A.y) * uy;
            if (dir > 0 && t > len - 12) dir = -1; else if (dir < 0 && t < 12) dir = 1;
            var tt = Math.max(0, Math.min(len, t + dir * 40));
            cam.ang = Math.atan2(A.y + uy * tt - p.y, A.x + ux * tt - p.x); cam.pitch = 0;
            LAB.keys({ up: true });
            r.renderErrors += LAB.frame();
            var q = LAB.worldPos();
            r.moved += Math.hypot(q.x - last.x, q.y - last.y); last = q;
            if (inBefore && chunkKey(q) === home) {
                r.steady++;
                r.rebuilds += aw.calls - rb0;
                Array.prototype.push.apply(r.lines, newLines(lc0));
                Array.prototype.push.apply(r.errors, newErrors(ec0));
            }
        }
        LAB.keys({});
        return r;
    }

    // ════════════════════════════════════════════════════════════════════
    // 1. Endless: floor buffer capacity at every quality preset; the preset
    //    rebuild budget (Apply through the real overlay + 2 frames).
    //    Sampling at the spawn camera is enough: for every preset viewDist <=
    //    W*240-240 (500<=960 .. 1800<=1920), so the view circle stays inside
    //    the mesh from anywhere in the centre chunk and the count is pure
    //    geometry (identical maxima on every seed tried).
    // ════════════════════════════════════════════════════════════════════
    scenario("perf: endless quality presets", function () {
        var bufOk = true, bufDetail = [], rbOk = true, rbDetail = [];
        var aw = LAB.countCalls("assembleWindow");
        try {
            SEEDS.forEach(function (seed) {
                fresh(seed);
                PRESETS.forEach(function (name) {
                    var P = QUALITY_PRESETS[name];
                    var wBefore = WINDOW_CHUNKS;
                    var c = applyPreset(name, aw);
                    var expect = (P.chunkWindow !== wBefore) ? 1 : 0;
                    var applied = presetApplied(P);
                    var pre = c.clicked && c.chunkSame && c.errs === 0;
                    if (!pre || c.rebuilds !== expect || !applied) rbOk = false;
                    rbDetail.push("s" + seed + " " + name + " W" + wBefore + "->" + WINDOW_CHUNKS + " rebuilds=" + c.rebuilds +
                        " (want " + expect + "; " + c.afterRaf + " by the rAF, " + (c.rebuilds - c.afterRaf) + " in the next 2 frames)" +
                        (applied ? "" : " NOT APPLIED mesh=" + (floorMesh ? floorMesh.w : "none") + " vd=" + viewDist) +
                        (c.clicked ? "" : " PRECONDITION: the overlay's preset/Apply click did not commit") +
                        (c.chunkSame ? "" : " PRECONDITION: the player changed chunk during the 2 frames") +
                        (c.errs ? " PRECONDITION: " + c.errs + " render errors" : ""));

                    LAB.prepCamera();
                    var r = sweepFloor(16);
                    var over = r.max > r.cap;
                    if (!applied || over || r.empty > 0 || r.max <= 0) bufOk = false;
                    bufDetail.push("s" + seed + " " + name + " vd" + viewDist + " W" + WINDOW_CHUNKS + " demand max " + r.max +
                        (r.sat ? "+" : "") + "/" + r.cap + " @" + r.at +
                        (r.empty ? " PRECONDITION: " + r.empty + "/" + r.passes + " passes wrote no cells" : "") +
                        (r.threw ? " (" + r.threw + " passes threw after buffering)" : ""));
                });
            });
        } finally { aw.restore(); }
        check("perf: Endless floor render buffer never overflows at any quality preset, pitch, dash FOV or heading",
            bufOk, "cells each floor pass wrote into _drawFloorCellBuf (NaN-sentinel count; demand re-measured with a 4x scratch buffer when it filled) vs " +
            "its capacity (L786, unguarded write L12643-12646), pitch 0/" + CAM_PITCH_MAX + ", FOV base/+dash, 16 headings: " + bufDetail.join("; "));
        check("perf: applying a quality preset rebuilds the window once when the chunk window changes and never otherwise",
            rbOk, "assembleWindow calls from the Apply click through the rAF and 2 more frames (applySettings L17752-17768): " + rbDetail.join("; "));
        LAB.freshPage();
    });

    // ════════════════════════════════════════════════════════════════════
    // 2. Fixed Level 4: buffer capacity over a 3x3 camera grid. (Whether a
    //    fixed level's floor pass completes at all -- D24, no lNColor arrays,
    //    L12788 -- is owned by the render suite.)
    // ════════════════════════════════════════════════════════════════════
    scenario("perf: fixed level 4", function () {
        LAB.freshPage();
        LAB.startLevel(4);
        LAB.freezeDay(0.5);
        LAB.releasePad();
        var pre = worldW === 4320 && worldH === 2880 && !!floorMesh && !!floorMesh.layerCount;
        var worst = { max: -1, cap: 0, at: "" }, passes = 0, empty = 0, threw = 0, bp = {};
        var fr = [1 / 6, 1 / 2, 5 / 6];
        for (var iy = 0; iy < 3; iy++) for (var ix = 0; ix < 3; ix++) {
            pos.x = worldW * fr[ix]; pos.y = worldH * fr[iy];
            LAB.prepCamera();
            var r = sweepFloor(8);
            passes += r.passes; empty += r.empty; threw += r.threw;
            for (var k in r.byPitch) bp[k] = Math.max(bp[k] || 0, r.byPitch[k]);
            if (r.max >= 0 && (worst.max < 0 || r.max - r.cap > worst.max - worst.cap)) {
                worst = { max: r.max, cap: r.cap, sat: r.sat, formula: r.formula, at: "(" + fmt(pos.x) + "," + fmt(pos.y) + ") " + r.at };
            }
        }
        LAB.metric("perf.level4.max_floor_demand_cells", worst.max);
        LAB.metric("perf.level4.view_dist", viewDist);
        var ok = pre && empty === 0 && worst.max > 0 && worst.max <= worst.cap;
        check("perf: fixed Level 4 floor render buffer never overflows at any camera position, pitch, dash FOV or heading", ok,
            (pre ? "" : "PRECONDITION: level 4 world/mesh not built; ") +
            (empty ? "PRECONDITION: " + empty + "/" + passes + " passes wrote no cells into _drawFloorCellBuf; " : "") +
            "demand " + worst.max + (worst.sat ? "+" : "") + (worst.max > worst.cap ? " > " : " <= ") + "capacity " + worst.cap +
            " (over by " + (worst.max - worst.cap) + ") at " + worst.at + "; worst per pitch: " + byPitchText(bp) +
            "; viewDist " + viewDist + " (L7677), mesh " + (floorMesh ? floorMesh.w + "x" + floorMesh.h + " gs " + floorMesh.gridSize : "none") +
            "; " + passes + " passes over a 3x3 grid x pitch 0/" + CAM_PITCH_MAX + " x FOV base/+dash x 8 headings" +
            (threw ? "; " + threw + " passes threw after buffering (D24, render suite)" : "") + "; buffer L786, unguarded write L12643");
    });

    // ════════════════════════════════════════════════════════════════════
    // 3. Chunk-line hysteresis: 2 u of jitter across a chunk line, each
    //    crossing followed by one REAL loop() frame -- whatever part of the
    //    loop re-centres the window (today updateChunks inside gameUpdate).
    // ════════════════════════════════════════════════════════════════════
    scenario("perf: chunk-line jitter", function () {
        var ok = true, parts = [], logSum = 0, rbSum = 0;
        var aw = LAB.countCalls("assembleWindow");
        try {
            SEEDS.forEach(function (seed) {
                fresh(seed);
                var lineX = CHUNK_SIZE;                              // between chunk 0 and chunk 1
                var wy = -1, ys = [240, 180, 300, 120, 360, 60, 420];
                for (var i = 0; i < ys.length && wy < 0; i++) {
                    var clear = true;
                    for (var dx = -12; dx <= 12; dx += 3) { var l = LAB.toLocal(lineX + dx, ys[i]); if (isInGridWall(l.x, l.y, 6)) clear = false; }
                    if (clear) wy = ys[i];
                }
                if (wy < 0) { ok = false; parts.push("s" + seed + " PRECONDITION: no open ground on the x=" + lineX + " chunk line"); return; }
                LAB.placeWorld(lineX - 4, wy, "top");
                var errs = frames(3);
                var r0 = aw.calls, lc0 = LAB.logCount;
                var crossings = 0, sidesOk = true;
                for (var k = 0; k < 10; k++) {
                    var wantChunk = (k % 2 === 0) ? 1 : 0;
                    teleport(lineX + (wantChunk ? 1 : -1), wy);
                    errs += LAB.frame();
                    if (Math.floor(LAB.worldPos().x / CHUNK_SIZE) === wantChunk) crossings++; else sidesOk = false;
                }
                var n = aw.calls - r0, lines = LAB.logCount - lc0;
                // prove the counter and the loop path are live: a 3-chunk jump
                // followed by one frame must rebuild
                var r1 = aw.calls;
                teleport(lineX + 3 * CHUNK_SIZE + 240, wy);
                errs += LAB.frame();
                var live = aw.calls > r1;
                if (!sidesOk || !live || errs || n > 2) ok = false;
                rbSum += n; logSum += lines;
                parts.push("s" + seed + " line x=" + lineX + " y=" + wy + ": " + crossings + "/10 crossings, " + n + " rebuilds, " + lines + " log lines" +
                    (sidesOk ? "" : " PRECONDITION: player did not end on the intended side") +
                    (live ? "" : " PRECONDITION: a 3-chunk jump plus one frame did not rebuild") +
                    (errs ? " PRECONDITION: " + errs + " render errors" : ""));
            });
        } finally { aw.restore(); }
        LAB.metric("perf.chunkjitter.rebuilds", rbSum);
        LAB.metric("perf.chunkjitter.log_lines_per_rebuild", rbSum ? logSum / rbSum : 0);
        check("perf: jittering 2 u across a chunk line 10 times rebuilds the window at most twice", ok,
            parts.join("; ") + "; one real loop() frame per crossing; updateChunks L7474-7501 re-centres whenever the player's chunk differs from the window centre (no hysteresis)");
    });

    // ════════════════════════════════════════════════════════════════════
    // 4. Steady-state play: console output, rebuilds, _rgbCache growth.
    //    Fresh page (empty _rgbCache), Endless, three sites: one near spawn
    //    and two >= 1900 u from the origin (where a player is after a few
    //    minutes). Per site: 60 warm-up frames, then a measured window
    //    walking a clear 280 u segment inside one chunk -- 400 frames near,
    //    900 at each far site. Math.random is reseeded at the start of each
    //    measured window, so the window does not inherit the random state
    //    earlier scenarios left behind (the far-site line count moved 3+4 ->
    //    1+2 -> 4+3 with scenario order before this); the far windows are long
    //    enough that the 0.5%-per-frame [STATE] dump (L21953) is expected ~9
    //    times (P(none) ~ 1e-4), not ~6 as with 600 frames per site.
    // ════════════════════════════════════════════════════════════════════
    var NEAR_CHUNKS = [[0, 0], [-1, 0], [0, -1], [-1, -1]];
    var FAR1_CHUNKS = [[5, 0], [5, 1], [5, -1], [6, 0]];
    var FAR2_CHUNKS = [[0, -5], [1, -5], [-1, -5], [0, -6]];
    var SITES = [{ name: "near", chunks: NEAR_CHUNKS, frames: 400 },
                 { name: "far1", chunks: FAR1_CHUNKS, frames: 900 },
                 { name: "far2", chunks: FAR2_CHUNKS, frames: 900 }];
    var RGB_BOUND = 8192;
    scenario("perf: steady-state play", function () {
        var spamOk = true, spamParts = [], rbOk = true, rbParts = [], rgbOk = true, rgbParts = [];
        var aw = LAB.countCalls("assembleWindow");
        try {
            SEEDS.forEach(function (seed) {
                fresh(seed);                                          // empty _rgbCache, no render errors
                var fill0 = LAB.ctxCounters.fill, allGood = true, rerr = 0;
                SITES.forEach(function (s, si) {
                    var r0 = aw.calls;
                    var seg = findSite(s.chunks);
                    var relocLive = s.name === "near" || aw.calls > r0;   // reaching a far site must rebuild
                    if (!seg) {
                        spamOk = rbOk = rgbOk = allGood = false;
                        var none = "s" + seed + " " + s.name + " PRECONDITION: no clear 280 u segment in chunks " + JSON.stringify(s.chunks);
                        spamParts.push(none); rbParts.push(none);
                        return;
                    }
                    LAB.placeWorld(seg.A.x, seg.A.y, "top");
                    var warm = walkFrames(seg, 60, aw);
                    LAB.seedRandom(seed * 131 + si + 1);
                    var w = walkFrames(seg, s.frames, aw);
                    rerr += warm.renderErrors + w.renderErrors;
                    var walked = w.moved >= s.frames / 2, held = w.steady >= s.frames / 2, clean = w.renderErrors === 0;
                    var pre = walked && held && clean;
                    if (!pre) allGood = false;
                    var where = "s" + seed + " " + s.name + " chunk (" + seg.cx + "," + seg.cy + ") x " + seg.A.x + ".." + seg.B.x + " y " + seg.A.y;
                    var preTxt = (walked ? "" : " PRECONDITION: walked only " + fmt(w.moved) + " u") +
                                 (held ? "" : " PRECONDITION: only " + w.steady + " frames inside the chunk") +
                                 (clean ? "" : " PRECONDITION: " + w.renderErrors + " render errors (loop crashes / _pt-caught pass exceptions)");
                    var steadyTxt = w.steady + "/" + s.frames + " frames in-chunk";
                    var out = w.lines.length + w.errors.length;
                    if (!pre || out > 0) spamOk = false;
                    spamParts.push(where + " (~" + fmt(Math.hypot(seg.A.x, seg.A.y)) + " u from origin): " + w.lines.length + " lines + " +
                        w.errors.length + " console.errors in " + steadyTxt +
                        (w.lines.length ? ", e.g. '" + digitless(w.lines[0]) + "'" : "") +
                        (w.errors.length ? ", e.g. error '" + digitless(w.errors[0]) + "'" : "") + preTxt);
                    if (!pre || !relocLive || w.rebuilds > 0) rbOk = false;
                    rbParts.push(where + ": " + w.rebuilds + " rebuilds in " + steadyTxt + ", walked " + fmt(w.moved) + " u" + preTxt +
                        (relocLive ? "" : " PRECONDITION: rebuild counter saw no rebuild when relocating"));
                    rgbParts.push("s" + seed + " after " + s.name + ": " + Object.keys(_rgbCache).length);
                    LAB.metric("perf.play." + s.name + ".console_lines", out);
                });
                var size = Object.keys(_rgbCache).length;
                var rendered = LAB.ctxCounters.fill - fill0;
                var rgbPre = allGood && rendered >= 10000 && rerr === 0;
                if (!rgbPre || size > RGB_BOUND) rgbOk = false;
                rgbParts.push("s" + seed + " final " + size + (size > RGB_BOUND ? " > " : " <= ") + "bound " + RGB_BOUND);
                if (rendered < 10000) rgbParts.push("s" + seed + " PRECONDITION: only " + rendered + " fills rendered");
                if (rerr) rgbParts.push("s" + seed + " PRECONDITION: " + rerr + " render errors during play");
                if (!allGood) rgbParts.push("s" + seed + " PRECONDITION: a site was not walked as planned (see the console check)");
                LAB.metric("perf.play.rgb_cache_entries", size);
            });
        } finally { aw.restore(); }
        check("perf: steady-state play writes nothing to the console", spamOk,
            spamParts.join("; ") + "; console.log/info/warn AND console.error; loop() L21953-21966 console.warns a [STATE] line on 0.5% of frames beyond 1500 u from the origin or after any render error");
        check("perf: walking inside one chunk triggers no window rebuild", rbOk, rbParts.join("; "));
        check("perf: colour-string cache stays bounded (at most 8,192 entries) during play", rgbOk,
            "Object.keys(_rgbCache).length, fresh cache, 60+400 frames near spawn and 60+900 at each of two far sites: " + rgbParts.join("; ") +
            "; rgbQ L1929-1941 memoises every exact lit/fogged RGB triple and never evicts (comment L1927 expects ~1000-3000)");
    });

    // ════════════════════════════════════════════════════════════════════
    // 5. Frame-rate independence: 1 s of game time at 60 fps vs 30 fps,
    //    through the real loop(), for each input path that feeds motion:
    //    arrow-key yaw, WASD walking, gamepad stick yaw, gamepad X walking.
    //    Every measurement starts from its own fresh world at the SAME spot.
    // ════════════════════════════════════════════════════════════════════
    scenario("perf: frame-rate independence", function () {
        var R = { turn: { ok: true, parts: [] }, walk: { ok: true, parts: [] }, gpturn: { ok: true, parts: [] }, gpwalk: { ok: true, parts: [] } };
        var RATES = [60, 30];
        SEEDS.forEach(function (seed) {
            fresh(seed);
            var seg = findSite(NEAR_CHUNKS);
            if (!seg) {
                for (var k0 in R) { R[k0].ok = false; R[k0].parts.push("s" + seed + " PRECONDITION: no clear 280 u segment near spawn"); }
                return;
            }
            var heading = Math.atan2(seg.B.y - seg.A.y, seg.B.x - seg.A.x);
            function start() { fresh(seed); LAB.placeWorld(seg.A.x, seg.A.y, "top"); cam.ang = heading; cam.pitch = 0; }
            var got = { turn: [], walk: [], gpturn: [], gpwalk: [] }, errs = 0;
            RATES.forEach(function (fps) {
                var ms = 1000 / fps, n = fps;
                // arrow-right camera key (L19079-19085)
                start(); errs += frames(3, ms);
                var a0 = cam.ang;
                _arrowCam.right = true;
                try { errs += frames(n, ms); } finally { _arrowCam.right = false; }
                got.turn.push(cam.ang - a0);
                // W held, steered at B every frame (LAB.walkTo through the real loop at this rate)
                start(); errs += frames(3, ms);
                var p0 = LAB.worldPos();
                var e0 = LAB.renderErrorMark();
                LAB.walkTo(seg.B.x, seg.B.y, { fps: fps, maxTicks: n, arrive: 1 });
                errs += LAB.renderErrorsSince(e0);
                var p1 = LAB.worldPos();
                got.walk.push(Math.hypot(p1.x - p0.x, p1.y - p0.y));
                // gamepad, Stick Aim mode (L19170-19186): stick x = full right; X button = walk forward
                var sv = { gp: USE_GAMEPAD, mouse: USE_MOUSE };
                try {
                    start(); USE_GAMEPAD = true; USE_MOUSE = false; CONTROL_MODE = MODE_STICK_AIM;
                    gpLast = { x: 0, y: 0, buttons: -1, valid: true };
                    errs += frames(3, ms);
                    var g0 = cam.ang;
                    gpLast = { x: 1, y: 0, buttons: -1, valid: true };
                    errs += frames(n, ms);
                    got.gpturn.push(cam.ang - g0);
                    start(); USE_GAMEPAD = true; USE_MOUSE = false; CONTROL_MODE = MODE_STICK_AIM;
                    gpLast = { x: 0, y: 0, buttons: -1, valid: true };
                    errs += frames(3, ms);
                    var q0 = LAB.worldPos();
                    cam.ang = heading;
                    gpLast = { x: 0, y: 0, buttons: ~BTN_X, valid: true };
                    errs += frames(n, ms);
                    var q1 = LAB.worldPos();
                    got.gpwalk.push(Math.hypot(q1.x - q0.x, q1.y - q0.y));
                } finally { USE_GAMEPAD = sv.gp; USE_MOUSE = sv.mouse; LAB.releasePad(); }
            });
            var MIN = { turn: 0.5, walk: 30, gpturn: 0.5, gpwalk: 30 }, UNIT = { turn: "rad", walk: "u", gpturn: "rad", gpwalk: "u" };
            for (var key in R) {
                var v = got[key], ratio = v[1] / v[0], pre = v[0] > MIN[key] && errs === 0;
                if (!pre || !(Math.abs(ratio - 1) <= 0.05)) R[key].ok = false;
                var d = UNIT[key] === "rad" ? 3 : 1;
                R[key].parts.push("s" + seed + " from (" + seg.A.x + "," + seg.A.y + "): 60 fps " + fmt(v[0], d) + " " + UNIT[key] + ", 30 fps " +
                    fmt(v[1], d) + " " + UNIT[key] + " (ratio " + fmt(ratio, 3) + ")" +
                    (v[0] > MIN[key] ? "" : " PRECONDITION: moved < " + MIN[key] + " " + UNIT[key] + " in 1 s at 60 fps") +
                    (errs ? " PRECONDITION: " + errs + " render errors" : ""));
                LAB.metric("perf.fps." + key + "_ratio_30_over_60", ratio);
            }
        });
        var WHY = "; 1 s of game time; loop() calls handleInput(FIXED_DT) once per render frame (L21910) while gameUpdate runs per physics step (L21916-21920)";
        check("perf: arrow-key turn rate is the same at 30 fps and 60 fps (within 5%)", R.turn.ok,
            R.turn.parts.join("; ") + WHY + "; arrow yaw += 2.0*dt per handleInput (L19080)");
        check("perf: walking speed is the same at 30 fps and 60 fps (within 5%)", R.walk.ok,
            R.walk.parts.join("; ") + WHY + "; applyGamepad adds a velocity impulse per handleInput call (L9822-9841), damping runs per physics step (L10195)");
        check("perf: gamepad stick turn rate is the same at 30 fps and 60 fps (within 5%)", R.gpturn.ok,
            R.gpturn.parts.join("; ") + WHY + "; Stick Aim yaw += x*STICK_CAM_YAW_SPEED*dt per handleInput (L19173)");
        check("perf: gamepad X-button walking speed is the same at 30 fps and 60 fps (within 5%)", R.gpwalk.ok,
            R.gpwalk.parts.join("; ") + WHY + "; Stick Aim X adds a velocity impulse per handleInput call (L19180-19185)");
    });

    // ════════════════════════════════════════════════════════════════════
    // 6. Fullscreen honours the resolution setting.
    // ════════════════════════════════════════════════════════════════════
    scenario("perf: fullscreen resolution", function () {
        LAB.freshPage();
        var ok = true, parts = [];
        var res0 = settings.resolution, w0 = canvas.width, h0 = canvas.height;
        try {
            [0.5, 0.75].forEach(function (res) {
                settings.resolution = res;
                LAB.dropTimers();
                document.fullscreenElement = canvas;
                onFullscreenChange();
                LAB.flushRaf(); LAB.runTimers(); LAB.flushRaf();
                var wantW = Math.floor(innerWidth * res), wantH = Math.floor(innerHeight * res);
                var good = canvas.width === wantW && canvas.height === wantH;
                if (!good) ok = false;
                parts.push("resolution " + res + ": canvas " + canvas.width + "x" + canvas.height + ", want " + wantW + "x" + wantH);
                document.fullscreenElement = null;
                onFullscreenChange();
                LAB.flushRaf(); LAB.runTimers();
            });
        } finally { document.fullscreenElement = null; settings.resolution = res0; canvas.width = w0; canvas.height = h0; }
        check("perf: entering fullscreen sizes the canvas by the resolution setting", ok,
            "window " + innerWidth + "x" + innerHeight + "; " + parts.join("; ") +
            "; onFullscreenChange rAF sets innerWidth x innerHeight (L690-693), only applySettings scales by settings.resolution (L17773-17777)");
    });

    // ════════════════════════════════════════════════════════════════════
    // 7. N11: the first loop() frame on a freshly loaded page, keyboard
    //    player, no gamepad. gpLast starts {buttons:0, valid:false} (L998);
    //    buttons are active-low, so 0 reads as SELECT held (L19000).
    //    LAB.freshPage restores exactly that page-load state; the pad is NOT
    //    released before the measured frame. Controls: handleInput ran on that
    //    frame, and a connected pad that really presses SELECT does toggle.
    // ════════════════════════════════════════════════════════════════════
    scenario("perf: first frame on a fresh page", function () {
        LAB.freshPage();
        LAB.startEndless(SEEDS[0]);
        LAB.freezeDay(0.5);
        var cm0 = CONTROL_MODE, lc0 = LAB.logCount, errs = 0;
        var gp0 = JSON.stringify({ buttons: gpLast.buttons, valid: gpLast.valid }) + " lastSelectDown " + lastSelectDown;
        var hi = LAB.countCalls("handleInput");
        try { errs += LAB.frame(); } finally { hi.restore(); }
        var cm1 = CONTROL_MODE;
        var ctrl = newLines(lc0).filter(function (s) { return /\[CTRL\]/.test(s); });
        // positive control: a connected pad pressing SELECT toggles
        LAB.releasePad();
        LAB.advance(SELECT_TOGGLE_COOLDOWN + 1);
        errs += LAB.frame();
        var cmA = CONTROL_MODE;
        gpLast = { x: 0, y: 0, buttons: ~BTN_SELECT, valid: true };
        errs += LAB.frame();
        var pressToggles = CONTROL_MODE !== cmA;
        LAB.releasePad();
        var pre = hi.calls >= 1 && errs === 0 && pressToggles;
        check("perf: the first frame on a freshly loaded page does not toggle the control mode", pre && cm1 === cm0 && ctrl.length === 0,
            (pre ? "" : "PRECONDITION: " + (hi.calls >= 1 ? "" : "handleInput did not run on the first frame; ") +
                (errs ? errs + " render errors; " : "") + (pressToggles ? "" : "a pad pressing SELECT did not toggle either; ")) +
            "CONTROL_MODE " + cm0 + " -> " + cm1 + " on the first frame (page-load pad state gpLast " + gp0 +
            "), " + ctrl.length + " [CTRL] lines" + (ctrl.length ? " '" + digitless(ctrl[0]) + "'" : "") +
            "; control: SELECT on a connected pad toggles " + (pressToggles ? "yes" : "NO") +
            "; handleInput reads SELECT from gpLast.buttons without checking gpLast.valid (L18997-19010)");
    });

    // ════════════════════════════════════════════════════════════════════
    // 8. E6: gamepad polling against a device that is slower than 16 ms.
    //    hw.fetchJSON is replaced by a counter returning a promise that never
    //    settles (a request still in flight). Timers run on the virtual clock
    //    for 160 ms, honouring each timer's own interval, so a fix that polls
    //    by re-arming after each response is measured the same way as today's
    //    setInterval(tick, 16) (L9799).
    // ════════════════════════════════════════════════════════════════════
    function pumpTimers(totalMs, stepMs) {
        for (var t = 0; t < totalMs; t += stepMs) {
            LAB.advance(stepMs);
            var snap = LAB.timers.slice();
            for (var i = 0; i < snap.length; i++) {
                var tm = snap[i];
                if (LAB.timers.indexOf(tm) < 0) continue;
                if (tm._due === undefined) tm._due = LAB.clock - stepMs + (tm.ms || 0);
                if (LAB.clock < tm._due) continue;
                if (tm.repeat) tm._due += Math.max(1, tm.ms || 0);
                else LAB.timers.splice(LAB.timers.indexOf(tm), 1);
                if (typeof tm.fn === "function") tm.fn();
            }
            LAB.flushRaf();
        }
    }
    scenario("perf: gamepad polling", function () {
        fresh(SEEDS[0]);
        var calls = 0, orig = hw.fetchJSON, sv = { i2c: i2cEnabled, inp: inputCompiled };
        var started = false;
        try {
            hw.fetchJSON = function () { calls++; return new Promise(function () {}); };
            stopGamepadPolling(); LAB.dropTimers();
            i2cEnabled = true; inputCompiled = true;
            startGamepadPolling();
            started = LAB.timers.length > 0 || calls > 0;
            pumpTimers(160, 16);
        } finally {
            stopGamepadPolling(); hw.fetchJSON = orig; i2cEnabled = sv.i2c; inputCompiled = sv.inp;
            LAB.dropTimers(); LAB.releasePad();
        }
        var pre = started && calls >= 1;
        check("perf: gamepad polling keeps at most one request in flight", pre && calls <= 1,
            (pre ? "" : "PRECONDITION: polling issued no request (i2cEnabled/inputCompiled forced true); ") +
            calls + " requests in flight after 160 ms with the first still unanswered" +
            "; startGamepadPolling ticks every 16 ms (L9799) and issues hw.fetchJSON with no in-flight guard (L9778-9797); the ESP32 serves them on one httpd task");
    });

    // ════════════════════════════════════════════════════════════════════
    // 9. G5: the overview map a new Endless world opens by itself. The start
    //    keeps its timers here (LAB.dropTimers is a no-op for the duration of
    //    LAB.startEndless), so the game's own 100 ms auto-overview (L7648) is
    //    observed; the overview is then closed, one ordinary 3D frame counted,
    //    and the overview reopened with the same toggleOverview() the timer
    //    calls. Fills = fill() + fillRect() calls on the page canvas.
    // ════════════════════════════════════════════════════════════════════
    scenario("perf: overview map cost", function () {
        LAB.freshPage();
        var drop = LAB.dropTimers;
        LAB.dropTimers = function () {};
        try { LAB.startEndless(SEEDS[0]); } finally { LAB.dropTimers = drop; }
        LAB.freezeDay(0.5); LAB.releasePad();
        var scheduled = LAB.timers.length;
        pumpTimers(120, 20);
        var autoOpened = overviewActive;
        LAB.dropTimers();
        if (overviewActive) toggleOverview();
        function fills() { return LAB.ctxCounters.fill + LAB.ctxCounters.fillRect; }
        var errs = frames(2);
        var f0 = fills();
        errs += LAB.frame();
        var normal = fills() - f0;
        toggleOverview();
        var opened = overviewActive;
        errs += LAB.frame();
        var f1 = fills();
        errs += LAB.frame();
        var over = fills() - f1;
        if (overviewActive) toggleOverview();
        LAB.metric("perf.overview.frame_fills", over);
        LAB.metric("perf.overview.normal_frame_fills", normal);
        LAB.metric("perf.overview.auto_opened_on_start", autoOpened ? 1 : 0);
        var pre = opened && errs === 0 && normal > 0;
        check("perf: a frame with the overview map open costs no more fills than a normal 3D frame", pre && over <= normal,
            (pre ? "" : "PRECONDITION: " + (opened ? "" : "toggleOverview did not open the overview; ") + (errs ? errs + " render errors; " : "") +
                (normal > 0 ? "" : "the normal frame drew nothing; ")) +
            "overview frame " + over + " fills vs normal 3D frame " + normal + " at the same spot; a new world " +
            (autoOpened ? "opened it by itself (" + scheduled + " start timer, L7648)" : "did not open it by itself") +
            "; drawDebugOverview (L18285) redraws one fillRect per grid cell every frame (L18305-18333) and loop() pauses the game while it is open (L19403)");
    });

    // ════════════════════════════════════════════════════════════════════
    // 10. G1: the floor pass parses colour strings per quad. One warm pass,
    //     then parseInt calls counted over an identical repeat of the same
    //     view (so a fix that caches on first sight is measured warm).
    // 11. G2: the walls pass samples biome noise at render time. Same
    //     warm-then-repeat protocol at the heading with the most wall fills.
    // ════════════════════════════════════════════════════════════════════
    scenario("perf: per-quad colour work", function () {
        fresh(SEEDS[0]);
        LAB.prepCamera();
        cam.ang = 0; cam.pitch = 0; cam.fov = GAME_CONFIG.player.baseFov;
        LAB.record(function () { drawLayersFloor3D(); }, { keepOnThrow: true });
        var pc = LAB.countCalls("parseInt"), rec;
        try { rec = LAB.record(function () { drawLayersFloor3D(); }, { keepOnThrow: true }); } finally { pc.restore(); }
        var n = rec.fills.length, pre = !rec.error && n >= 1000;
        LAB.metric("perf.floorcolour.fills", n);
        LAB.metric("perf.floorcolour.parseInt_calls", pc.calls);
        check("perf: a repeated floor pass parses no colour strings per quad", pre && pc.calls <= 0.01 * n,
            (pre ? "" : "PRECONDITION: " + (rec.error ? "the pass threw " + rec.error.name + "; " : "") + "only " + n + " floor fills; ") +
            "parseInt calls " + pc.calls + " for " + n + " floor fills on an identical repeat pass (Endless s" + SEEDS[0] + ", default preset, heading 0, pitch 0)" +
            "; drawLayersFloor3D parses mesh.lNColor '#rrggbb' per quad (L12856) and builds a new 'rgb()' string per quad (L12872)");
    });
    scenario("perf: walls pass noise", function () {
        fresh(SEEDS[0]);
        LAB.prepCamera();
        cam.pitch = 0; cam.fov = GAME_CONFIG.player.baseFov;
        var best = -1, bestAng = 0;
        for (var h = 0; h < 16; h++) {
            cam.ang = h * Math.PI / 8;
            LAB.prepCamera();
            var r = LAB.record(function () { drawWalls3D(); }, { keepOnThrow: true });
            if (r.fills.length > best) { best = r.fills.length; bestAng = cam.ang; }
        }
        cam.ang = bestAng;
        LAB.prepCamera();
        var g0 = LAB.ctxCounters.gradients;
        LAB.record(function () { drawWalls3D(); }, { keepOnThrow: true });
        var gradsFirst = LAB.ctxCounters.gradients - g0;
        LAB.prepCamera();
        var cb = LAB.countCalls("getBiomeAt"), cw = LAB.countCalls("getWallBiomeRGB"), cs = LAB.countCalls("smoothNoise"), rec;
        var g1 = LAB.ctxCounters.gradients;
        try { rec = LAB.record(function () { drawWalls3D(); }, { keepOnThrow: true }); }
        finally { cs.restore(); cw.restore(); cb.restore(); }
        LAB.metric("perf.walls.gradients_first_pass", gradsFirst);
        LAB.metric("perf.walls.gradients_repeat_pass", LAB.ctxCounters.gradients - g1);
        LAB.metric("perf.walls.fills", rec.fills.length);
        var n = rec.fills.length, pre = !rec.error && n >= 500;
        check("perf: a repeated walls pass samples no biome noise", pre && cb.calls === 0 && cw.calls === 0 && cs.calls === 0,
            (pre ? "" : "PRECONDITION: " + (rec.error ? "the pass threw " + rec.error.name + "; " : "") + "only " + n + " wall fills; ") +
            "getBiomeAt " + cb.calls + ", getWallBiomeRGB " + cw.calls + ", smoothNoise " + cs.calls + " calls for " + n +
            " wall fills on an identical repeat pass (Endless s" + SEEDS[0] + ", heading " + fmt(bestAng * 180 / Math.PI) + "deg)" +
            "; drawWalls3D computes each wall cell's biome colour (L12083) and biome (L12100) from noise every frame; wallColorR/G/B (L6460) only hold structure overrides");
    });

    // ════════════════════════════════════════════════════════════════════
    // 12. G3: console output per window re-centre. Five one-chunk moves
    //     within 1500 u of the origin (no [STATE] dump there), each followed
    //     by one real frame; every line those frames write is attributed to
    //     the re-centre (near-spawn frames without one write 0 -- see the
    //     steady-state check).
    // ════════════════════════════════════════════════════════════════════
    scenario("perf: re-centre console output", function () {
        fresh(SEEDS[0]);
        var aw = LAB.countCalls("assembleWindow"), per = [], errs = 0, sample = "";
        try {
            LAB.placeWorld(240, 240, "top");
            errs += frames(3);
            [720, 1200, 720, 240, -240].forEach(function (wx) {
                var r0 = aw.calls, lc0 = LAB.logCount, ec0 = LAB.errorCount;
                teleport(wx, 240);
                errs += LAB.frame();
                var ls = newLines(lc0).concat(newErrors(ec0));
                if (!sample && ls.length > 2) sample = ls[2];
                per.push({ rebuilds: aw.calls - r0, lines: ls.length });
            });
        } finally { aw.restore(); }
        var total = 0, maxL = 0, rb = 0;
        per.forEach(function (p) { total += p.lines; maxL = Math.max(maxL, p.lines); rb += p.rebuilds; });
        var pre = rb === 5 && per.every(function (p) { return p.rebuilds === 1; }) && errs === 0;
        LAB.metric("perf.recentre.lines_per_rebuild", rb ? total / rb : 0);
        check("perf: a window re-centre writes at most 2 console lines", pre && maxL <= 2,
            (pre ? "" : "PRECONDITION: " + rb + "/5 moves re-centred exactly once" + (errs ? ", " + errs + " render errors" : "") + "; ") +
            "max " + maxL + " lines per re-centre, " + total + " over " + rb + " re-centres (" + per.map(function (p) { return p.lines; }).join("/") + ")" +
            (sample ? ", e.g. '" + digitless(sample) + "'" : "") +
            "; updateChunks logs the shift and its result (L7484, L7493), assembleWindow adds ~18 diagnostic lines (L6793-L7385)");
    });

    // ════════════════════════════════════════════════════════════════════
    // 13. G8: the Perf HUD's fps figure. Frames arrive every 33.3 ms (30 fps)
    //     and each spends 10 ms of JS inside renderFrame (the virtual clock
    //     advances 10 ms there; without that a headless frame takes 0 ms).
    //     Control: the settings FPS counter (L17544-17553, frame-interval
    //     based) reads 30 in the same run.
    // ════════════════════════════════════════════════════════════════════
    scenario("perf: perf HUD fps", function () {
        fresh(SEEDS[0]);
        var origRF = G.renderFrame, hud = null, counter = null, errs = 0;
        var sv = { hud: DEBUG_PERF_HUD, fps: settings.showFPS };
        try {
            DEBUG_PERF_HUD = true; settings.showFPS = true;
            G.renderFrame = function () { LAB.advance(10); return origRF.apply(this, arguments); };
            errs += frames(130, 1000 / 30 - 10);
            var rr = LAB.record(function () { errs += LAB.frameAt(1000 / 30 - 10); }, { texts: true });
            rr.texts.forEach(function (t) {
                var m = /^(\d+) fps$/.exec(t.text); if (m) hud = +m[1];
                var c = /^(\d+) FPS$/.exec(t.text); if (c) counter = +c[1];
            });
        } finally { G.renderFrame = origRF; DEBUG_PERF_HUD = sv.hud; settings.showFPS = sv.fps; }
        var pre = hud !== null && counter !== null && Math.abs(counter - 30) <= 3 && errs === 0;
        check("perf: the Perf HUD fps readout matches the rate the loop runs at", pre && Math.abs(hud - 30) <= 3,
            (pre ? "" : "PRECONDITION: " + (hud === null ? "the HUD drew no 'N fps' text; " : "") +
                (counter === null ? "the settings FPS counter drew nothing; " : (Math.abs(counter - 30) > 3 ? "the settings FPS counter read " + counter + "; " : "")) +
                (errs ? errs + " render errors; " : "")) +
            "HUD reads " + hud + " fps, settings FPS counter reads " + counter + " FPS, frames every 33.3 ms with 10 ms of JS each" +
            "; drawPerfHud computes fps = 1000 / average JS time per frame (L20774-20777), not the frame interval");
    });

    // ════════════════════════════════════════════════════════════════════
    // 14. METRICs only (first seed, fresh page): per-pass fills and JS time,
    //     frame fills, window build cost and size, buffered-but-unfilled
    //     floor cells. Nothing here decides a verdict.
    // ════════════════════════════════════════════════════════════════════
    scenario("perf: metrics", function () {
        fresh(SEEDS[0]);
        var aw = LAB.countCalls("assembleWindow");
        try {
            PRESETS.forEach(function (name) {
                var c = applyPreset(name, aw);
                if (c.afterRaf > 0) {
                    LAB.metric("perf.window.w" + WINDOW_CHUNKS + ".assemble_ms", c.ms, "ms");
                    var wb = windowBytes();
                    LAB.metric("perf.window.w" + WINDOW_CHUNKS + ".typed_bytes", wb.typed, "bytes");
                    LAB.metric("perf.window.w" + WINDOW_CHUNKS + ".array_slots", wb.slots);
                }
                if (name === PRESETS[0] && c.applyCentreOwner) LAB.note("settings overlay: Apply's centre is inside the '" + c.applyCentreOwner + "' hit area listed before it (N10)");
                LAB.prepCamera();
                cam.ang = 0; cam.pitch = 0; cam.fov = GAME_CONFIG.player.baseFov;
                var passes = [["skybox3D", function () { drawSkybox3D(); }],
                              ["ceiling3D", function () { drawLayersCeiling3D(); }],
                              ["platforms3D", function () { drawLayersFloor3D(); }],
                              ["walls3D", function () { drawWalls3D(); }],
                              ["sceneEntities", function () { drawFloorScatter3D(); drawTreasureChests3D(); drawEnemySpawners3D(); drawOreVeins(); drawWallDecorations(); }]];
                passes.forEach(function (ps) {
                    var f0 = LAB.ctxCounters.fill, t0 = LAB.realNow();
                    try { ps[1](); } catch (e) { LAB.note("pass " + ps[0] + " threw at preset " + name + ": " + (e && e.name)); }
                    LAB.metric("perf.pass." + name + "." + ps[0] + ".pass_ms", LAB.realNow() - t0, "ms");
                    LAB.metric("perf.pass." + name + "." + ps[0] + ".fills", LAB.ctxCounters.fill - f0);
                });
                var ff = LAB.ctxCounters.fill, ft = LAB.realNow();
                LAB.frame();
                LAB.metric("perf.frame." + name + ".frame_ms", LAB.realNow() - ft, "ms");
                LAB.metric("perf.frame." + name + ".fills", LAB.ctxCounters.fill - ff);
                // buffered-but-unfilled floor cells: cells that cost a buffer
                // slot and a sort position but produced no quad.
                LAB.prepCamera();
                cam.ang = 0; cam.fov = GAME_CONFIG.player.baseFov;
                [0, CAM_PITCH_MAX].forEach(function (pitch) {
                    cam.pitch = pitch;
                    var fp = null;
                    var rec = LAB.record(function () { fp = floorPass(); });
                    var skirts = rec.fills.filter(function (f) { return f.style === "rgb(60, 42, 28)"; }).length;
                    var quads = rec.fills.length - 2 * skirts;              // skirt = dirt fill + quad redraw (L12909-12919)
                    var tag = pitch ? "pitchmax" : "pitch0";
                    LAB.metric("perf.floor." + name + "." + tag + ".buffered_cells", fp.demand);
                    LAB.metric("perf.floor." + name + "." + tag + ".quad_fills", quads);
                    LAB.metric("perf.floor." + name + "." + tag + ".unfilled_ratio", fp.demand > 0 ? Math.max(0, 1 - quads / fp.demand) : 0);
                });
                cam.pitch = 0;
            });
        } finally { aw.restore(); }
        LAB.freshPage();
    });
})();

LAB.finish();
undefined;
