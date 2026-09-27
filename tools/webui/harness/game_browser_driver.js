// game_browser_driver.js -- rendered-pixel checks for the Endless crawler, run
// INSIDE the real Games page in a real browser.
//
// tools/webui/game_page.py injects this after the game's own scripts, so every
// game global (draw, resetEndlessMode, floorMesh, cam, pos, ...) is reachable by
// bare name, exactly as the game's own code reaches it. It defines
//
//     window.GameVisual.run(opts) -> Promise<result>
//
// which, for each Cave Test seed (default 12345 and 424242):
//   1. starts Cave Test THROUGH THE PAGE: sets window._caveTestSeedOverride,
//      picks 'cavetest' in #terrainSelect and dispatches 'change', i.e. the
//      handler at WebPage_Games.h:22117 that "does the full cave test setup".
//      The auto-overview timer that resetEndlessMode schedules (7648) is
//      cancelled, and _loopGen is bumped so any running loop() is stale
//      (21898) -- nothing renders unless this driver calls draw().
//   2. freezes Date.now (animations, torch flicker) and re-seeds Math.random
//      before every draw, holds the light grid still between the frames of one
//      view, and stops the day cycle at noon (dayTime 0.5), so the same view
//      drawn twice paints the same pixels (a check proves it does).
//   3. for every cave entrance and every VIEW: places the player in the
//      entrance frame (angle faces INTO the cave, along > 0 is outside -- the
//      convention of queryCaveGeometry 4723 and of LAB.axisWorld), lets two real
//      physics ticks run (handleInput + gameUpdate, so updateDayNight classifies
//      the spot, 19342), turns the camera, then calls the page's draw() plus its
//      post-draw cave-entrance mesh (the scene part of renderFrame, 21798)
//      synchronously and reads the canvas back with getImageData:
//         F   DEBUG_POLY_TYPES on: every polygon in the game's debug palette
//             (12817-12824 floor, 13085-13088 ceiling, 11903-11905 walls)
//         F2  the same again, and once more after all the others (determinism)
//         Fa  F without drawCaveEntrance3D (attributes the arch overlay)
//         Fw  F with the walls pass skipped   (DEBUG_HIDE_WALLS, 18972)
//         Ff  F with the floor pass skipped   (DEBUG_HIDE_PLATS, 18971)
//         Fc  F with the ceiling pass skipped (DEBUG_HIDE_CEIL, 18970)
//         S   drawSkybox3D() alone: the sky reference
//         N   DEBUG_POLY_TYPES off: what a player sees (screenshot, luminance)
//      A final real renderFrame() is also executed for exception coverage; HUD
//      and the Cave Test control map are not included in pixel classification.
//   4. classifies every pixel of F by WHICH PASS PAINTED IT and, inside the
//      floor pass, by HUE:
//         sky        within SKY_TOL of S (nothing drawn over the sky)
//         caveWall / wall   F != Fw  (red-dominant / anything else: walls are
//                    tinted by torch light, so their hue is not the palette's)
//         floor pass F != Ff, then by hue -- cap #0074d9, surface #2ecc40,
//                    tilted/ledge #ffdc00, caveFloor #ff851b; floorDark = the
//                    pass's solid ground-plane fill (12474-12482) or fog-black
//         ceiling    F != Fc  (purple or tilted-yellow, all of it the ceiling)
//         dark / void / other   none of the above
//      Floor and ceiling lighting multiply all three channels by one scalar
//      (12857-12859, 13097-13099) and fog multiplies again, which keeps hue.
//   5. turns the per-view class fractions (whole frame, top half, bottom half:
//      the horizon is the middle row at pitch 0, getCam3D 453) into PASS/FAIL
//      lines -- the protocol of the headless harnesses (PASS/FAIL <id>
//      [detail], METRIC, NOTE, HARNESS_RESULT) -- in <pre id="gameVisualResults">
//      and in window.__gameVisualResult.
//
// Nothing here re-derives what the game draws: every class comes from pixels
// the page painted. The only geometry read directly is PRECONDITION evidence
// from floorMesh (is the player on the cave floor under a ceiling, is the ramp
// spot under open sky), so a check whose scene never reached the state it is
// about FAILS with "PRECONDITION FAILED" instead of passing vacuously.
//
// Headless use: tools/webui/harness/game_browser_harness.js evaluates this
// file in the LAB stub environment and tests the non-pixel parts through
// GameVisual._internals (frame math, view placement, the hue classifier against
// the colours the game's passes really submit, the fraction arithmetic and the
// check logic). The stub canvas has no pixels, so a headless full run must
// report every frame blank -- that harness checks it does.
//
// This file must never contain a closing script tag (game_page.py refuses it).

(function () {
    var G = (typeof window !== "undefined") ? window : (0, eval)("this");

    // ── tunables (rationale in tools/webui/tests/test_game_page.py) ───────────
    var DARK_MAX = 24;      // max channel below this = near-black: hue unusable
    var SAT_MIN = 0.25;     // palette colours have HSV saturation >= 0.77; sky/mountains <= 0.3
    var SKY_TOL = 8;        // per channel: still "sky" when far geometry fades over it by less
    var EYE_H = 2.4;        // h: cameraZ = 60 + 25h (454) vs layer render Z 25h
    // u outside the first roofed cell on the axis; on Cave Test seed 12345 the
    // roof starts at along +225, so these are the views at +260 and +232.
    var RAMP_OFFSETS = { ramp_far_in: 35, ramp_near_in: 7 };
    // 424242 is part of the default because it exposes the N13 capped-wall
    // bleed that seed 12345 misses (the browser suite is the pixel confirmation;
    // render owns the automated N13 verdict).
    var DEFAULT_SEEDS = [12345, 424242];
    var CLOCK0 = 1700000000000;

    // View id, placement in the entrance frame, and which way the camera looks.
    // layer: 'bottom' = lowest walkable layer of the cell, 'top' = highest.
    var VIEWS = [
        { id: "inside_in",    along: -150, layer: "bottom", face: "in",  what: "on the tunnel floor 150 u inside, looking further in" },
        { id: "inside_out",   along: -60,  layer: "bottom", face: "out", what: "on the tunnel floor 60 u inside, looking back out" },
        { id: "arch_in",      along: 0,    layer: "bottom", face: "in",  what: "in the archway (entrance point), looking in" },
        { id: "ramp_far_in",  ramp: true,  layer: "bottom", face: "in",  what: "on the open approach ramp 35 u outside the roof, looking in" },
        { id: "ramp_near_in", ramp: true,  layer: "bottom", face: "in",  what: "on the open approach ramp 7 u outside the roof, looking in" },
        { id: "cap_along",    along: -150, layer: "top",    face: "in",  what: "on the surface cap right above the tunnel, looking along it" },
        { id: "far_surface",  along: 700,  openSurface: true, layer: "top", face: "out", what: "on the first open ground at or beyond 700 u, looking away from the cave" }
    ];

    var CLASSES = ["ceiling", "cap", "surface", "tilted", "caveFloor", "floorDark", "gray",
                   "caveWall", "wall", "arch", "sky", "dark", "void", "other"];

    // ── pixel classification ──────────────────────────────────────────────────
    // Debug palette hues (HSV): cap #0074d9 208, ceiling #b10dc9 292, surface
    // #2ecc40 127, tilted/ledge #ffdc00 52, cave floor #ff851b 28, cave wall
    // rgb(255,30,30) 0, surface wall rgb(170,170,170) grey.
    function hueSat(r, g, b) {
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        if (mx === 0) return { h: 0, s: 0, mx: 0 };
        var h;
        if (d === 0) h = 0;
        else if (mx === r) h = 60 * (((g - b) / d) % 6);
        else if (mx === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
        if (h < 0) h += 360;
        return { h: h, s: d / mx, mx: mx };
    }
    // Hue-only class of one colour in the debug palette.
    function classifyRGBA(r, g, b, a) {
        if (a === 0) return "void";
        var q = hueSat(r, g, b);
        if (q.mx < DARK_MAX) return "dark";
        if (q.s < SAT_MIN) return "gray";
        var h = q.h;
        if (h >= 345 || h < 12) return "caveWall";
        if (h < 40) return "caveFloor";
        if (h < 75) return "tilted";
        if (h >= 90 && h < 165) return "surface";
        if (h >= 185 && h < 235) return "cap";
        if (h >= 265 && h < 320) return "ceiling";
        return "other";
    }
    function differs(a, b, i) { return a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]; }
    function nearSky(d, s, i) {
        return s[i + 3] === 255 && d[i + 3] === 255 && Math.abs(d[i] - s[i]) <= SKY_TOL &&
               Math.abs(d[i + 1] - s[i + 1]) <= SKY_TOL && Math.abs(d[i + 2] - s[i + 2]) <= SKY_TOL;
    }
    // Class of pixel i. fr = {full, noArch, noWalls, noFloor, noCeil, sky}; any but
    // `full` may be missing (then that attribution step is skipped).
    function pixelClass(fr, i) {
        var d = fr.full.data;
        if (fr.sky && nearSky(d, fr.sky.data, i)) return "sky";
        // The entrance mesh is drawn after draw(), as it is in renderFrame.
        // Attribute it before the pass removals so an arch covering a ceiling
        // pixel is graded as visible arch, not as a hidden ceiling.
        if (fr.noArch && differs(d, fr.noArch.data, i)) return "arch";
        if (fr.noWalls && differs(d, fr.noWalls.data, i)) {
            var q = hueSat(d[i], d[i + 1], d[i + 2]);
            return (q.mx >= DARK_MAX && q.s >= 0.5 && (q.h >= 345 || q.h < 12)) ? "caveWall" : "wall";
        }
        if (fr.noFloor && differs(d, fr.noFloor.data, i)) {
            var c = classifyRGBA(d[i], d[i + 1], d[i + 2], d[i + 3]);
            if (c === "dark") return "floorDark";
            if (c === "ceiling" || c === "caveWall") return "other";     // not a floor-pass colour
            return c;
        }
        if (fr.noCeil && differs(d, fr.noCeil.data, i)) return "ceiling";
        if (d[i + 3] === 0) return "void";
        if (Math.max(d[i], d[i + 1], d[i + 2]) < DARK_MAX) return "dark";
        return "other";
    }
    function emptyCounts() { var o = {}; CLASSES.forEach(function (c) { o[c] = 0; }); return o; }
    function fractions(counts, n) {
        var o = {};
        CLASSES.forEach(function (c) { o[c] = n ? counts[c] / n : 0; });
        return o;
    }
    // Class fractions of a frame set: whole frame, top half (rows < H/2), bottom half.
    function analyzeFrames(fr) {
        var W = fr.full.width, H = fr.full.height, half = Math.floor(H / 2);
        var all = emptyCounts(), top = emptyCounts(), bot = emptyCounts();
        for (var y = 0; y < H; y++) {
            var part = (y < half) ? top : bot;
            for (var x = 0; x < W; x++) {
                var c = pixelClass(fr, (y * W + x) * 4);
                all[c]++; part[c]++;
            }
        }
        return { w: W, h: H, all: fractions(all, W * H), top: fractions(top, W * half), bottom: fractions(bot, W * (H - half)),
                 counts: { all: all, top: top, bottom: bot } };
    }
    // Coarse text picture of the classes, one character per cw x ch cell
    // (sampled at the cell centre) -- for a human reading a failure.
    var MAP_CH = { ceiling: "P", cap: "C", surface: "g", tilted: "y", caveFloor: "o", floorDark: ",", gray: ".",
                   caveWall: "R", wall: "W", arch: "A", sky: " ", dark: "#", "void": "_", other: "?" };
    var MAP_LEGEND = "P ceiling, C cap, g grass, y tilted, o cave floor, , floor-pass dark, . floor-pass grey, R cave wall, W wall, A entrance arch, blank sky, # dark, _ nothing, ? other";
    function classMap(fr, cw, ch) {
        cw = cw || 6; ch = ch || 10;
        var W = fr.full.width, H = fr.full.height, rows = [];
        for (var y = Math.floor(ch / 2); y < H; y += ch) {
            var row = "";
            for (var x = Math.floor(cw / 2); x < W; x += cw) row += MAP_CH[pixelClass(fr, (y * W + x) * 4)];
            rows.push(row);
        }
        return rows.join("\n");
    }
    // Mean Rec.709 luma of what the player sees; a transparent pixel shows the
    // canvas's black CSS background, so it counts as 0.
    function meanLuma(img) {
        var d = img.data, n = img.width * img.height, sum = 0;
        for (var i = 0; i < n * 4; i += 4) sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) * (d[i + 3] / 255);
        return n ? sum / n : 0;
    }
    function diffCount(a, b) {
        var n = 0, d1 = a.data, d2 = b.data;
        for (var i = 0; i < d1.length; i += 4) if (differs(d1, d2, i)) n++;
        return n;
    }

    // ── entrance frame (same math as LAB.axisWorld / alongOf / perpOf) ────────
    function entranceFrame(e) {
        return { x: e.x, y: e.y, angle: e.angle, outX: -Math.cos(e.angle), outY: -Math.sin(e.angle) };
    }
    function axisWorld(E, along, perp) {
        perp = perp || 0;
        return { x: E.x + E.outX * along + (-E.outY) * perp, y: E.y + E.outY * along + E.outX * perp };
    }
    function alongOf(E, w) { return (w.x - E.x) * E.outX + (w.y - E.y) * E.outY; }
    function perpOf(E, w) { return (w.x - E.x) * (-E.outY) + (w.y - E.y) * E.outX; }
    function entrances() {
        var out = [];
        for (var key in endlessCaveNetworks) {
            var net = endlessCaveNetworks[key];
            if (!net || !net.entrances) continue;
            for (var i = 0; i < net.entrances.length; i++) {
                var E = entranceFrame(net.entrances[i]);
                E.key = key; E.index = i;
                out.push(E);
            }
        }
        return out;
    }

    // ── reading floorMesh (data, not logic) ───────────────────────────────────
    function layersLocal(lx, ly) {
        var m = floorMesh, out = [];
        if (!m) return out;
        var gx = Math.floor(lx / m.gridSize), gy = Math.floor(ly / m.gridSize);
        if (gx < 0 || gy < 0 || gx >= m.w || gy >= m.h) return out;
        var i = gy * m.w + gx;
        var Z = [m.l0TopZ, m.l1TopZ, m.l2TopZ, m.l3TopZ, m.l4TopZ];
        var T = [m.l0Type, m.l1Type, m.l2Type, m.l3Type, m.l4Type];
        for (var li = 0; li < m.layerCount[i]; li++) out.push({ t: T[li][i], z: Z[li][i] });
        return out;
    }
    function layersWorld(wx, wy) { return layersLocal(wx - windowOriginX, wy - windowOriginY); }
    function walkable(t) { return t === 1 || t === 3 || t === 4; }
    function lowestWalkable(ls) { for (var k = 0; k < ls.length; k++) if (walkable(ls[k].t)) return ls[k]; return null; }
    function topWalkable(ls) { for (var k = ls.length - 1; k >= 0; k--) if (walkable(ls[k].t)) return ls[k]; return null; }
    function firstOfType(ls, t) { for (var k = 0; k < ls.length; k++) if (ls[k].t === t) return ls[k]; return null; }
    function fmtLayers(ls) { return ls.map(function (l) { return l.t + "@" + l.z.toFixed(2); }).join(" "); }
    // First along (1 u steps, from +600 inward) whose cell carries a roof: a
    // ceiling (2) or a surface cap (4). null if none before along = -60.
    function roofStart(E) {
        for (var a = 600; a >= -60; a -= 1) {
            var p = axisWorld(E, a, 0), ls = layersWorld(p.x, p.y);
            if (firstOfType(ls, 2) || firstOfType(ls, 4)) return a;
        }
        return null;
    }
    // Cells with a ceiling layer on the axis between along-12 and along-400,
    // sampled every 12 u (one mesh cell): is there a tunnel ahead to look at?
    function tunnelCellsAhead(E, along) {
        var n = 0;
        for (var a = along - 12; a >= along - 400; a -= 12) {
            var p = axisWorld(E, a, 0);
            if (firstOfType(layersWorld(p.x, p.y), 2)) n++;
        }
        return n;
    }
    // The fixed +700 point can sit under another entrance's roof on multi-
    // entrance seeds. Search outward on the same axis for actual open ground.
    function openSurfaceAlong(E, start) {
        for (var a = start; a <= start + 960; a += 12) {
            var p = axisWorld(E, a, 0), ls = layersWorld(p.x, p.y);
            if (topWalkable(ls) && !firstOfType(ls, 2) && !firstOfType(ls, 4)) return a;
        }
        return null;
    }

    // ── controlled environment ────────────────────────────────────────────────
    var saved = null, clockNow = CLOCK0, rs = 1, drawSeed = 1;
    function mulberry32() {
        rs = (rs + 0x6D2B79F5) | 0;
        var t = Math.imul(rs ^ (rs >>> 15), 1 | rs);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    var DEBUG_FLAGS = ["DEBUG_POLY_TYPES", "DEBUG_HIDE_CEIL", "DEBUG_HIDE_PLATS", "DEBUG_HIDE_WALLS", "DEBUG_LAYER_TYPES", "DEBUG_CAVE_COLORS", "DEBUG_CEIL_WIRE"];
    function freeze(seed) {
        if (!saved) {
            saved = { now: Date.now, random: Math.random, flags: {} };
            DEBUG_FLAGS.forEach(function (k) { saved.flags[k] = G[k]; });
        }
        clockNow = CLOCK0;
        Date.now = function () { return clockNow; };
        rs = (seed | 0) || 1;
        drawSeed = rs;
        Math.random = mulberry32;
        DEBUG_FLAGS.forEach(function (k) { G[k] = false; });
    }
    function unfreeze() {
        if (!saved) return;
        Date.now = saved.now; Math.random = saved.random;
        DEBUG_FLAGS.forEach(function (k) { G[k] = saved.flags[k]; });
        saved = null;
    }
    function ptErrTotal() { var n = 0; for (var k in _ptErrors) n += _ptErrors[k]; return n; }

    // Start Cave Test through the page's own terrain dropdown handler (22117).
    function startCaveTestViaPage(seed, flags) {
        flags = flags || {};
        G._caveTestSeedOverride = seed;
        var boxes = { ctSurfaceEnemies: "surfaceEnemies", ctStructures: "structures", ctMarkets: "markets", ctShrines: "shrines",
                      ctSpawners: "spawners", ctSurfaceChests: "surfaceChests", ctCaveEnemies: "caveEnemies", ctCaveChests: "caveChests" };
        for (var id in boxes) { var el = document.getElementById(id); if (el) el.checked = !!flags[boxes[id]]; }
        var sel = document.getElementById("terrainSelect");
        if (!sel) throw new Error("no #terrainSelect on the page");
        // Capture the timers the start schedules -- the auto-overview at 7648
        // would otherwise take over the canvas 100 ms later -- and cancel them.
        var origST = G.setTimeout, ids = [];
        G.setTimeout = function () { var t = origST.apply(G, arguments); ids.push(t); return t; };
        try {
            sel.value = "cavetest";
            sel.dispatchEvent(new Event("change"));
        } finally { G.setTimeout = origST; }
        ids.forEach(function (t) { clearTimeout(t); });
    }

    function settle() {
        _loopGen = (_loopGen || 0) + 1;        // any scheduled loop() is now stale (21898)
        if (overviewActive) toggleOverview();
        MODE3D = true; calibrating = false; hasBaseline = true;
        menuOpen = false; settingsOpen = false; shopOpen = false; inventoryOpen = false; forgeOpen = false;
        USE_GAMEPAD = false; USE_KEYBOARD = true; USE_MOUSE = true;
        try { stopGamepadPolling(); } catch (e) { /* not running */ }
        kbState.up = kbState.down = kbState.left = kbState.right = false;
        _arrowCam.up = _arrowCam.down = _arrowCam.left = _arrowCam.right = false;
        mouseDelta.x = 0; mouseDelta.y = 0;
        CAM_FOLLOW = true;
        dayTime = 0.5; daySpeed = 0; settings.dayNight = true;
    }

    function tick(n) {
        for (var i = 0; i < n; i++) {
            clockNow += 1000 / 60;
            handleInput(FIXED_DT);
            if (!menuOpen) gameUpdate(FIXED_DT);
            if (CAM_FOLLOW) { cam.x = pos.x; cam.y = pos.y; if (pos.floorZ) cam.z = pos.floorZ; }
            _floorCacheTick = (_floorCacheTick + 1) | 0;
        }
    }

    // Put the player at a WORLD point on a layer of its cell. Same steps as
    // LAB.placeWorld.
    function placeWorld(wx, wy, layer) {
        pos.x = wx - windowOriginX; pos.y = wy - windowOriginY;
        vel.x = 0; vel.y = 0;
        updateChunks();                          // may re-centre the window and rebase pos
        var ls = layersLocal(pos.x, pos.y);
        var w = (layer === "top") ? topWalkable(ls) : lowestWalkable(ls);
        var h = w ? w.z : 0;
        pos.floorZ = 60 + 40 * h;
        jumpAirborne = false; jumpVelZ = 0;
        cam.x = pos.x; cam.y = pos.y; cam.z = pos.floorZ;
        _floorCacheTick = (_floorCacheTick + 1) | 0;
        return h;
    }

    function placeView(E, view) {
        var rsA = null, along = view.along;
        if (view.ramp) {
            rsA = roofStart(E);
            along = (rsA === null) ? null : rsA + RAMP_OFFSETS[view.id];
        }
        if (view.openSurface) along = openSurfaceAlong(E, view.along);
        if (along === null) return { view: view.id, placed: false, why: view.openSurface ?
            "no open surface cell on the axis between +" + view.along + " and +" + (view.along + 960) :
            "no roofed cell on the axis between +600 and -60" };
        var p = axisWorld(E, along, 0);
        var h0 = placeWorld(p.x, p.y, view.layer);
        tick(2);
        cam.ang = (view.face === "out") ? E.angle + Math.PI : E.angle;
        cam.pitch = 0;
        var w = { x: pos.x + windowOriginX, y: pos.y + windowOriginY };
        var h = ((pos.floorZ || 60) - 60) / 40;
        var ls = layersLocal(pos.x, pos.y);
        var st = { view: view.id, placed: true, targetAlong: along, roofStart: rsA, along: alongOf(E, w), perp: perpOf(E, w),
                   wx: w.x, wy: w.y, h: h, h0: h0, ug: !!playerUnderground, amb: ambientLight, layers: ls };
        st.pre = precondition(E, view, st);
        return st;
    }

    // Is the scene the one the check is about? Reads floorMesh only.
    function precondition(E, view, st) {
        var ls = st.layers, lo = lowestWalkable(ls), top = topWalkable(ls), ceil = firstOfType(ls, 2), cap = firstOfType(ls, 4);
        var near = function (a, b) { return Math.abs(a - b) < 0.1; };
        var ok = true, why = [];
        function need(c, msg) { if (!c) { ok = false; why.push(msg); } }
        need(Math.abs(st.along - st.targetAlong) < 2 && Math.abs(st.perp) < 2, "player is not where the view puts it");
        if (view.id === "inside_in" || view.id === "inside_out") {
            need(lo && lo.t === 1 && near(st.h, lo.z), "not standing on the cave floor");
            need(ceil && lo && ceil.z > lo.z + EYE_H, "no ceiling above eye height");
            need(!!cap, "cell has no surface cap (not a buried tunnel cell)");
        } else if (view.id === "arch_in") {
            need(lo && near(st.h, lo.z), "not standing on the lowest walkable layer");
            need(tunnelCellsAhead(E, st.along) >= 10, "fewer than 10 ceilinged cells ahead on the axis");
        } else if (view.ramp) {
            need(lo && near(st.h, lo.z), "not standing on the ramp floor");
            need(!ceil && !cap, "spot is not under open sky (cell has a ceiling or cap)");
            need(tunnelCellsAhead(E, st.along) >= 10, "fewer than 10 ceilinged cells ahead on the axis");
        } else if (view.id === "cap_along") {
            need(top && top.t === 4 && near(st.h, top.z), "not standing on a surface cap");
            need(ceil && lo && lo.t === 1 && lo.z < ceil.z && top && ceil.z < top.z, "no buried tunnel (floor < ceiling < cap) under the spot");
        } else if (view.id === "far_surface") {
            need(!ceil && !cap, "spot is under a roof");
            need(top && near(st.h, top.z), "not standing on the ground");
            need(st.along >= 600, "not far from the entrance");
        }
        return { ok: ok, why: why.join("; ") };
    }

    // ── rendering one view ────────────────────────────────────────────────────
    function grab() { return ctx.getImageData(0, 0, canvas.width, canvas.height); }
    // One draw() with the given debug toggles, from an identical starting
    // state every time: identity transform, alpha 1, same random sequence,
    // light grid held (draw() refreshes it every 5th call, 18968).
    function drawFrame(o) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        // Do not inherit pixels from the preceding attribution frame. This is
        // essential evidence: a broken/no-op draw() must leave a blank frame.
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        rs = drawSeed;
        _lightGridFrameCount = 0;
        DEBUG_POLY_TYPES = !!o.dbg; DEBUG_HIDE_WALLS = !!o.w; DEBUG_HIDE_PLATS = !!o.p; DEBUG_HIDE_CEIL = !!o.c;
        try {
            draw();
            // renderFrame draws this scene geometry after draw(). Keep HUD and
            // Cave Test's control-map overlay out of pixel classification, but
            // include the entrance mesh the player actually sees.
            if (o.arch !== false) drawCaveEntrance3D();
        }
        finally { DEBUG_POLY_TYPES = false; DEBUG_HIDE_WALLS = false; DEBUG_HIDE_PLATS = false; DEBUG_HIDE_CEIL = false; }
        return grab();
    }
    // Chrome can move this canvas back to the GPU after renderFrame() and then
    // to the CPU again on the next getImageData readback.  The two paths blend
    // differently (measured: 28,798 of 86,400 pixels change between identical
    // draws straddling the switch), so warming just once for the whole page is
    // insufficient: every later view's first captured frame can be the switch
    // frame.  Warm after each placement, immediately before measurement.  The
    // per-view redraw check (F == F2 == F again at the end) proves it held.
    function warmCanvas() {
        for (var k = 0; k < 4; k++) { drawFrame({ dbg: 1 }); }
    }
    function renderView(opts) {
        var r = { drawErrors: 0, threw: null, renderFrameThrew: null };
        try { warmCanvas(); } catch (e) { /* the view's own draws below report it */ }
        var pe0 = ptErrTotal();
        try {
            rs = drawSeed;
            if (typeof updateLightGrid === "function") updateLightGrid();   // light grid for THIS spot
            var fr = {};
            fr.full = drawFrame({ dbg: 1 });
            r.shotDebug = opts.screenshots ? canvas.toDataURL("image/png") : null;
            var again = drawFrame({ dbg: 1 });
            fr.noArch = drawFrame({ dbg: 1, arch: false });
            fr.noWalls = drawFrame({ dbg: 1, w: 1 });
            fr.noFloor = drawFrame({ dbg: 1, p: 1 });
            fr.noCeil = drawFrame({ dbg: 1, c: 1 });
            ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            rs = drawSeed;
            drawSkybox3D();
            fr.sky = grab();
            var normal = drawFrame({});
            r.shotNormal = opts.screenshots ? canvas.toDataURL("image/png") : null;
            var last = drawFrame({ dbg: 1 });
            r.redrawDiff = diffCount(fr.full, again) + diffCount(fr.full, last);
            r.px = analyzeFrames(fr);
            r.map = classMap(fr);
            r.luma = meanLuma(normal);
            r.transparentDebug = analyzeFrames({ full: fr.full }).all["void"];
            r.transparentNormal = analyzeFrames({ full: normal }).all["void"];
            // Exercise the exact page path too. Its HUD/control-map overlays
            // are deliberately excluded from class fractions above.
            try { renderFrame(); } catch (rf) { r.renderFrameThrew = String(rf && rf.message || rf); }
        } catch (e) {
            r.threw = String(e && e.message || e);
        }
        r.drawErrors = ptErrTotal() - pe0;
        return r;
    }

    // ── checks ────────────────────────────────────────────────────────────────
    function pct(x) { return (100 * x).toFixed(2) + "%"; }
    // Fixed-point without a negative zero ("-0" from a 1e-14 is noise, and it
    // differs between engines).
    function fx(x, d) { if (typeof x !== "number" || !isFinite(x)) return String(x); var v = +x.toFixed(d); return (v === 0 ? 0 : v).toFixed(d); }
    function sum(fr, keys) { var s = 0; keys.forEach(function (k) { s += fr[k] || 0; }); return s; }
    function where(rec) {
        var st = rec.state;
        if (!st.placed) return rec.tag + " " + st.view + " NOT PLACED (" + st.why + ")";
        return rec.tag + " " + st.view + " along=" + fx(st.along, 0) + " perp=" + fx(st.perp, 0) +
            " world=(" + fx(st.wx, 0) + "," + fx(st.wy, 0) + ") h=" + fx(st.h, 2) + " ug=" + (st.ug ? 1 : 0) +
            " cell=[" + fmtLayers(st.layers) + "]";
    }
    // A frame the browser really painted: BOTH the classified debug frame and
    // the normal player frame are at least half non-transparent. The LAB stub
    // returns all-zero pixels, so every headless frame fails this gate.
    function painted(rec) {
        var r = rec.render;
        return !!(r && !r.threw && r.transparentDebug !== undefined && r.transparentNormal !== undefined &&
                  r.transparentDebug < 0.5 && r.transparentNormal < 0.5);
    }

    // Thresholds and their rationale: tools/webui/tests/test_game_page.py.
    var SPECS = [
        { id: "browser: inside the tunnel the upper half of the view shows the tunnel ceiling", views: ["inside_in"],
          test: function (p) { var v = p.top.ceiling; return { ok: v >= 0.02, d: "top ceiling=" + pct(v) + " (need >= 2%) cap=" + pct(p.top.cap) + " surface=" + pct(p.top.surface) + " sky=" + pct(p.top.sky) }; } },
        { id: "browser: inside the tunnel no sky, grass or surface cap is visible overhead", views: ["inside_in"],
          test: function (p) { var v = sum(p.top, ["sky", "surface", "cap"]); return { ok: v < 0.05, d: "top sky+surface+cap=" + pct(v) + " (sky " + pct(p.top.sky) + " surface " + pct(p.top.surface) + " cap " + pct(p.top.cap) + "; need < 5%)" }; } },
        { id: "browser: inside the tunnel the lower half of the view shows the cave floor", views: ["inside_in"],
          test: function (p) { var v = p.bottom.caveFloor; return { ok: v >= 0.05, d: "bottom caveFloor=" + pct(v) + " (need >= 5%) floorDark=" + pct(p.bottom.floorDark) }; } },
        { id: "browser: looking back out from inside the tunnel the ceiling is visible overhead", views: ["inside_out"],
          test: function (p) { var v = p.top.ceiling; return { ok: v >= 0.02, d: "top ceiling=" + pct(v) + " (need >= 2%) sky=" + pct(p.top.sky) + " cap=" + pct(p.top.cap) + " surface=" + pct(p.top.surface) }; } },
        { id: "browser: looking out from inside and standing in the archway show no grass or surface cap overhead", views: ["inside_out", "arch_in"],
          test: function (p) { var v = sum(p.top, ["surface", "cap"]); return { ok: v < 0.05, d: "top surface+cap=" + pct(v) + " (surface " + pct(p.top.surface) + " cap " + pct(p.top.cap) + "; need < 5%; sky ahead is allowed)" }; } },
        { id: "browser: looking back out from inside the tunnel includes the cave entrance arch", views: ["inside_out"],
          test: function (p) { var v = p.all.arch; return { ok: v >= 0.01, d: "arch=" + pct(v) + " of frame (need >= 1%)" }; } },
        { id: "browser: standing in the archway the tunnel floor ahead is visible below the horizon", views: ["arch_in"],
          test: function (p) { var v = p.bottom.caveFloor; return { ok: v >= 0.01, d: "bottom caveFloor=" + pct(v) + " (need >= 1%) floorDark(empty ground plane)=" + pct(p.bottom.floorDark) + " top cap=" + pct(p.top.cap) }; } },
        { id: "browser: from the open approach ramp the cave floor ahead is visible below the horizon", views: ["ramp_far_in", "ramp_near_in"],
          test: function (p) { var v = p.bottom.caveFloor; return { ok: v >= 0.01, d: "bottom caveFloor=" + pct(v) + " (need >= 1%) floorDark(empty ground plane)=" + pct(p.bottom.floorDark) }; } },
        { id: "browser: from the cap above the tunnel no cave floor, cave ceiling or cave wall shows through", views: ["cap_along"],
          test: function (p) { var v = sum(p.all, ["caveFloor", "ceiling", "caveWall"]); return { ok: v < 0.01, d: "caveFloor+ceiling+caveWall=" + pct(v) + " of frame (caveFloor " + pct(p.all.caveFloor) + " ceiling " + pct(p.all.ceiling) + " caveWall " + pct(p.all.caveWall) + "; need < 1%)" }; } },
        { id: "browser: far from the cave the view is sky above and grass below, with no cave surfaces", views: ["far_surface"],
          test: function (p) {
              var sk = p.top.sky, gr = sum(p.bottom, ["surface", "tilted"]), cv = sum(p.all, ["caveFloor", "ceiling"]);
              return { ok: sk >= 0.25 && gr >= 0.25 && cv < 0.005, d: "top sky=" + pct(sk) + " (need >= 25%) bottom surface+tilted=" + pct(gr) + " (need >= 25%) caveFloor+ceiling=" + pct(cv) + " (need < 0.5%) walls=" + pct(p.all.wall + p.all.caveWall) }; } }
    ];

    function evaluate(records) {
        var checks = [];
        function push(id, list) {
            var ok = list.length > 0 && list.every(function (x) { return x.ok; });
            checks.push({ id: id, ok: ok, detail: list.length ? list.map(function (x) { return (x.ok ? "ok " : "BAD ") + x.d; }).join(" | ") : "no records -- nothing was rendered" });
        }
        function name(rec) { return rec.tag + " " + rec.state.view; }
        // Rendering itself.
        push("browser: every view renders through the page's renderFrame() without render-pass exceptions", records.map(function (rec) {
            var r = rec.render;
            if (!rec.state.placed) return { ok: false, d: where(rec) };
            if (!r) return { ok: false, d: name(rec) + " not rendered" };
            return { ok: !r.threw && !r.renderFrameThrew && r.drawErrors === 0,
                     d: name(rec) + (r.threw ? " measured draw threw: " + r.threw : (r.renderFrameThrew ? " renderFrame threw: " + r.renderFrameThrew : " renderPassErrors+=" + r.drawErrors)) };
        }));
        push("browser: every view's frame is painted (the canvas is not blank)", records.map(function (rec) {
            var r = rec.render;
            return { ok: painted(rec), d: name(rec) + " debugTransparent=" + (r && r.transparentDebug !== undefined ? pct(r.transparentDebug) : "n/a") +
                " normalTransparent=" + (r && r.transparentNormal !== undefined ? pct(r.transparentNormal) : "n/a") + " (both need < 50%)" };
        }));
        push("browser: redrawing the same view paints identical pixels", records.map(function (rec) {
            var r = rec.render;
            if (!painted(rec)) return { ok: false, d: name(rec) + " PRECONDITION FAILED: frame is blank" };
            return { ok: r.redrawDiff === 0, d: name(rec) + " pixelsDiffering=" + r.redrawDiff };
        }));
        SPECS.forEach(function (spec) {
            var list = [];
            records.forEach(function (rec) {
                if (spec.views.indexOf(rec.state.view) < 0) return;
                if (!rec.state.placed || !rec.state.pre.ok) { list.push({ ok: false, d: where(rec) + " PRECONDITION FAILED: " + (rec.state.placed ? rec.state.pre.why : rec.state.why) }); return; }
                if (!painted(rec)) { list.push({ ok: false, d: where(rec) + " PRECONDITION FAILED: frame is blank (no pixels were painted)" }); return; }
                var t = spec.test(rec.render.px);
                list.push({ ok: t.ok, d: where(rec) + " " + t.d });
            });
            push(spec.id, list);
        });
        // Lighting: the player's frame inside the tunnel vs open ground, same seed and entrance.
        var lum = [], byTag = {};
        records.forEach(function (rec) { (byTag[rec.tag] = byTag[rec.tag] || {})[rec.state.view] = rec; });
        Object.keys(byTag).sort().forEach(function (tag) {
            var a = byTag[tag].inside_in, b = byTag[tag].far_surface;
            if (!a || !b) { lum.push({ ok: false, d: tag + " PRECONDITION FAILED: inside_in or far_surface view missing" }); return; }
            var bad = [a, b].filter(function (r) { return !r.state.placed || !r.state.pre.ok || !painted(r); });
            if (bad.length) {
                lum.push({ ok: false, d: tag + " PRECONDITION FAILED: " + bad.map(function (r) { return r.state.view + (r.state.placed ? (r.state.pre.ok ? " blank" : " " + r.state.pre.why) : " not placed"); }).join(", ") });
                return;
            }
            lum.push({ ok: a.render.luma < b.render.luma, d: tag + " meanLuma inside_in=" + a.render.luma.toFixed(1) + " (ug=" + (a.state.ug ? 1 : 0) + " ambient=" + a.state.amb.toFixed(2) + ") far_surface=" + b.render.luma.toFixed(1) + " (ambient=" + b.state.amb.toFixed(2) + ")" });
        });
        push("browser: 150 u inside the tunnel the scene is darker than open ground at noon", lum);
        return checks;
    }

    // ── one full run, synchronous ─────────────────────────────────────────────
    function runSync(opts) {
        opts = opts || {};
        var seeds = (opts.seeds && opts.seeds.length) ? opts.seeds : DEFAULT_SEEDS;
        var shots = opts.screenshots !== false;
        var views = VIEWS.filter(function (v) { return !opts.views || opts.views.indexOf(v.id) >= 0; });
        var records = [], notes = [], metrics = {};
        var cfg = G.__GAME_VISUAL_CONFIG__ || {};
        var ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
        var provenance = { protocol: 2, seeds: seeds.slice(), views: views.map(function (v) { return v.id; }),
                           userAgent: ua, start: opts.startCaveTest ? "injected" : "page",
                           mutated: !!(cfg.mutated && cfg.mutated.length), mutationCount: (cfg.mutated && cfg.mutated.length) || 0 };
        notes.push("browser.provenance " + JSON.stringify(provenance));
        var tStart = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
        try {
            seeds.forEach(function (seed) {
                freeze(seed);
                if (opts.startCaveTest) opts.startCaveTest(seed); else startCaveTestViaPage(seed, opts.caveTestFlags);
                if (!CAVE_TEST_MODE || WORLD_SEED !== seed) throw new Error("Cave Test did not start with seed " + seed + " (CAVE_TEST_MODE=" + CAVE_TEST_MODE + " WORLD_SEED=" + WORLD_SEED + ")");
                settle();
                var ents = entrances();
                metrics["browser.s" + seed + ".entrances"] = ents.length;
                if (!ents.length) notes.push("s" + seed + ": no cave entrance generated");
                ents.forEach(function (E, ei) {
                    var tag = "s" + seed + "e" + ei;
                    var rsA = roofStart(E);
                    metrics["browser." + tag + ".roof_start_along"] = rsA === null ? "none" : rsA;
                    views.forEach(function (view) {
                        var st = placeView(E, view);
                        var rec = { seed: seed, entrance: ei, tag: tag, state: st, render: null };
                        if (st.placed) rec.render = renderView({ screenshots: shots });
                        records.push(rec);
                        if (rec.render && rec.render.px && painted(rec)) {
                            var mk = "browser." + tag + "." + view.id;
                            ["all", "top", "bottom"].forEach(function (part) {
                                var o = {};
                                CLASSES.forEach(function (c) { var v = rec.render.px[part][c]; if (v) o[c] = +v.toFixed(4); });
                                metrics[mk + "." + part] = o;
                            });
                            metrics[mk + ".luma"] = +rec.render.luma.toFixed(2);
                        }
                    });
                });
            });
        } finally { unfreeze(); }
        var checks = evaluate(records);
        var lines = [];
        checks.forEach(function (c) { lines.push((c.ok ? "PASS " : "FAIL ") + c.id + (c.detail ? "   [" + c.detail + "]" : "")); });
        Object.keys(metrics).forEach(function (k) { lines.push("METRIC " + k + " " + JSON.stringify(metrics[k])); });
        notes.forEach(function (n) { lines.push("NOTE " + n); });
        var tEnd = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
        lines.push("METRIC browser.run_ms " + JSON.stringify(+(tEnd - tStart).toFixed(1)) + " ms");
        var failed = checks.filter(function (c) { return !c.ok; }).length;
        var verdict = failed ? "HARNESS_RESULT FAIL " + failed : "HARNESS_RESULT PASS";
        lines.push(verdict);
        return { verdict: verdict, checks: checks, metrics: metrics, notes: notes, lines: lines, text: lines.join("\n"),
                 canvas: { w: canvas.width, h: canvas.height }, seeds: seeds,
                 userAgent: ua, provenance: provenance,
                 views: records.map(function (rec) {
                     var r = rec.render || {};
                     return { tag: rec.tag, view: rec.state.view, state: rec.state, px: r.px || null, luma: r.luma, drawErrors: r.drawErrors,
                              threw: r.threw || null, renderFrameThrew: r.renderFrameThrew || null,
                              transparentDebug: r.transparentDebug, transparentNormal: r.transparentNormal,
                              map: r.map || "", shotDebug: r.shotDebug || null, shotNormal: r.shotNormal || null };
                 }) };
    }

    // ── page output ───────────────────────────────────────────────────────────
    function el(id) { return (typeof document !== "undefined" && document.getElementById) ? document.getElementById(id) : null; }
    function setStatus(s) { var e = el("gvStatus"); if (e) e.textContent = s; }
    function publish(res) {
        G.__gameVisualResult = res;
        var pre = el("gameVisualResults");
        if (pre) pre.textContent = res.text;
        // A plain-text copy to hand to tools/webui/tests/test_game_browser.py
        // (HW1_GAME_BROWSER_RESULTS=<file>), which grades it against the
        // suite's known bugs.
        var bar = el("gvBar");
        if (bar && typeof Blob !== "undefined" && typeof URL !== "undefined" && URL.createObjectURL) {
            var link = el("gvSave");
            if (!link) { link = document.createElement("a"); link.id = "gvSave"; link.style.marginLeft = "8px"; bar.appendChild(link); }
            if (link.href && link.href.indexOf("blob:") === 0) { try { URL.revokeObjectURL(link.href); } catch (e) { /* ignore */ } }
            link.href = URL.createObjectURL(new Blob([res.text + "\n"], { type: "text/plain" }));
            link.download = "game_visual_results.txt";
            link.textContent = "save results";
        }
        var box = el("gameVisualShots");
        if (box) {
            box.innerHTML = "";
            res.views.forEach(function (v) {
                var fig = document.createElement("figure");
                var cap = document.createElement("figcaption");
                var t = v.tag + " " + v.view + (v.state.placed ? " along=" + fx(v.state.along, 0) + " h=" + fx(v.state.h, 2) + " ug=" + (v.state.ug ? 1 : 0) : " not placed");
                if (v.px) {
                    var fmt = function (fr) { return CLASSES.filter(function (c) { return fr[c] >= 0.005; }).map(function (c) { return c + " " + (100 * fr[c]).toFixed(1) + "%"; }).join(", "); };
                    t += "\ntop: " + fmt(v.px.top) + "\nbottom: " + fmt(v.px.bottom);
                }
                if (v.map) t += "\nclass map (" + MAP_LEGEND + "):\n" + v.map;
                cap.textContent = t;
                cap.style.whiteSpace = "pre";
                [v.shotDebug, v.shotNormal].forEach(function (src) {
                    if (!src) return;
                    var img = document.createElement("img"); img.src = src; img.width = canvas.width; img.height = canvas.height;
                    fig.appendChild(img);
                });
                fig.appendChild(cap);
                box.appendChild(fig);
            });
        }
        var done = el("gameVisualDone");
        if (!done && document.body) { done = document.createElement("div"); done.id = "gameVisualDone"; done.style.display = "none"; document.body.appendChild(done); }
        if (done) done.textContent = res.verdict;
        setStatus("done: " + res.verdict);
    }

    var busy = false;
    function run(opts) {
        return new Promise(function (resolve, reject) {
            if (busy) { reject(new Error("GameVisual.run is already running")); return; }
            busy = true;
            setStatus("running...");
            // Yield once so the status paints before the synchronous run.
            setTimeout(function () {
                try { var res = runSync(opts); publish(res); resolve(res); }
                catch (e) {
                    var verdict = "HARNESS_RESULT FAIL 1";
                    var res2 = { verdict: verdict, checks: [{ id: "browser: visual run completed", ok: false, detail: String(e && e.stack || e) }],
                                 views: [], metrics: {}, notes: [],
                                 lines: ["FAIL browser: visual run completed   [" + String(e && e.message || e) + "]", verdict] };
                    res2.text = res2.lines.join("\n");
                    publish(res2); reject(e);
                }
                finally { busy = false; }
            }, 0);
        });
    }

    function pageOpts() {
        var cfg = G.__GAME_VISUAL_CONFIG__ || {};
        var o = { autorun: !!cfg.autorun, seeds: cfg.seeds || null, views: null, screenshots: true };
        try {
            var q = (typeof location !== "undefined" && location.search) ? location.search.slice(1).split("&") : [];
            q.forEach(function (kv) {
                var p = kv.split("="), k = decodeURIComponent(p[0] || ""), v = decodeURIComponent(p[1] || "");
                if (k === "autorun") o.autorun = (v !== "0");
                if (k === "seeds") o.seeds = v.split(",").map(function (x) { return parseInt(x, 10); }).filter(function (x) { return x > 0; });
                if (k === "views") o.views = v.split(",");
                if (k === "shots") o.screenshots = (v !== "0");
            });
        } catch (e) { /* no location */ }
        return o;
    }

    G.GameVisual = {
        run: run,
        runSync: runSync,
        VIEWS: VIEWS,
        CLASSES: CLASSES,
        _internals: { classifyRGBA: classifyRGBA, hueSat: hueSat, pixelClass: pixelClass, analyzeFrames: analyzeFrames,
                      classMap: classMap, meanLuma: meanLuma, diffCount: diffCount, renderView: renderView,
                      entranceFrame: entranceFrame, axisWorld: axisWorld, alongOf: alongOf, perpOf: perpOf, entrances: entrances,
                      layersWorld: layersWorld, roofStart: roofStart, tunnelCellsAhead: tunnelCellsAhead, openSurfaceAlong: openSurfaceAlong,
                      placeView: placeView, settle: settle, freeze: freeze, unfreeze: unfreeze, evaluate: evaluate,
                      SPECS: SPECS, DEFAULT_SEEDS: DEFAULT_SEEDS, DARK_MAX: DARK_MAX, SAT_MIN: SAT_MIN, SKY_TOL: SKY_TOL, RAMP_OFFSETS: RAMP_OFFSETS }
    };

    // Wire the page (browser only: game_page.py's hw stub sets __HW_STUB__).
    if (G.__HW_STUB__) {
        var btn = el("gvRun");
        if (btn) btn.addEventListener("click", function () {
            var o = pageOpts(); run({ seeds: o.seeds, views: o.views, screenshots: o.screenshots })["catch"](function () {});
        });
        var po = pageOpts();
        if (po.autorun) {
            var go = function () { setTimeout(function () { run({ seeds: po.seeds, views: po.views, screenshots: po.screenshots })["catch"](function () {}); }, 50); };
            if (document.readyState === "complete") go(); else G.addEventListener("load", go);
        }
    }
})();
undefined;
