(0, eval)(slurp("tools/webui/harness/_game_env.js"));
LAB.init(__out, slurp, __engine, __argv);
LAB.check("tools: game script evaluates without throwing", LAB.load(__argv[0]),
    String(LAB.loadError || "").split("\n")[0].slice(0, 300));

// game_tools_harness.js -- do the Endless crawler's OWN in-page debug tools tell
// the truth? Every future cave fix will be judged with them, so a tool that
// misreports is a bug in its own right.
//
// Tools under test (WebPage_Games.h header lines):
//   window.caveCapture  L1592   the "Capture state" button's snapshot
//   window.caveDiag     L1418   console snapshot incl. lastTransitionSnapshot
//   window.caveGaps     L1476   wall-base / floor gap scanner
//   window.debugCaveAt  L4796   queryCaveGeometry probe at a world point
//   drawCaveProfileChart L21340 cross-section chart (#caveProfileCanvas)
//   drawCaveControlMap  L21582  top-down map (#controlMapCanvas)
//   __caveStats         L1398   floor/ceiling pass counters the capture prints
//   debug-panel checkboxes L22239-22262 (DEBUG_FLOOR, DEBUG_FLOOR_LINE, DEBUG_TEXTURE)
//
// Ground truth is always the game's own state: pos.floorZ (the height physics
// put the player at), the floorMesh layer stacks, wallFaceBase, __caveStats,
// and what the draw functions actually submit to their canvases. Nothing here
// re-derives the value a tool reports; the chart canvases are observed through
// a local recording 2D context installed on the stub canvas element (the LAB
// recorder only sees the main canvas).
//
// usage (via tools/webui/game_lab.py): <extracted game js> [--seeds 12345,1]

if (LAB.loaded) {
    var P = "tools: ";
    var SEEDS = LAB.seeds([12345]);          // Cave Test worlds for every scenario
    var XSEEDS = LAB.seeds([12345, 1]);      // debugCaveAt: seed 1 is where the real smoothed surface is < 2.0
    if (XSEEDS.indexOf(1) < 0) XSEEDS = XSEEDS.concat([1]); // a custom sweep must not drop the reproducing seed
    var INSIDE = -100;                       // along: 100 u inside the entrance, under roof + cap
    var H_TOL = 0.05;                        // h: a reported height must match the real one this closely
    var CHART_TOL = 0.5;                     // h: profile-chart floor line vs the player dot
    var CEIL_FRAC = 0.9;                     // profile chart must draw >= 90% of ceilinged samples
    var YAW = 2.2;                           // distinctive camera yaw for the reproducibility search

    // ── formatting ──────────────────────────────────────────────────────────
    function f2(x) { return (typeof x === "number" && isFinite(x)) ? x.toFixed(2) : String(x); }
    function f3(x) { return (typeof x === "number" && isFinite(x)) ? x.toFixed(3) : String(x); }
    function wxy(p) { return "(" + Math.round(p.x) + "," + Math.round(p.y) + ")"; }
    function sg(a) { return (a >= 0 ? "+" : "") + Math.round(a); }

    // ── fixtures ────────────────────────────────────────────────────────────
    function quiet() {
        if (enemies) enemies.length = 0;
        if (enemySpawners) enemySpawners.length = 0;
        if (projectiles) projectiles.length = 0;
    }
    function start(seed) {
        LAB.startCaveTest(seed);
        LAB.seedRandom(seed);
        LAB.freezeDay(0.5);
        quiet();
        LAB.clearLogs();
    }
    // Lowest ceiling strictly above z in a layer stack.
    function ceilAbove(ls, z) {
        var best = null;
        ls.forEach(function (l) { if (l.t === 2 && l.z > z + 1e-4 && (!best || l.z < best.z)) best = l; });
        return best;
    }
    // Stand the player on a layer at a WORLD point and let physics settle. The
    // precondition is read back from the game: not airborne, and pos.floorZ on
    // the requested kind of layer (4 = surface cap, 1 = cave floor under a ceiling).
    function standOn(w, kind) {
        LAB.placeWorld(w.x, w.y, kind === 4 ? "top" : "bottom");
        LAB.tick(20);
        var ls = LAB.layersAt(pos.x, pos.y), h = LAB.h(), on = null;
        ls.forEach(function (l) { if (LAB.walkable(l.t) && Math.abs(l.z - h) <= H_TOL) on = l; });
        var ok = !jumpAirborne && on && on.t === kind && (kind === 4 || !!ceilAbove(ls, h));
        return { ok: !!ok, h: h, ls: ls, world: LAB.worldPos(),
                 why: "h=" + f2(h) + " air=" + jumpAirborne + " stack " + LAB.fmtLayers(ls) };
    }

    // A recording 2D context for the chart canvases: every fill / stroke with its
    // style and path, every fillRect and fillText. Installed as the stub canvas
    // element's context, so the game's own getContext('2d') returns it.
    function recCtx() {
        var st = { fillStyle: "#000000", strokeStyle: "#000000", globalAlpha: 1, lineWidth: 1, font: "", textAlign: "start" };
        var path = [];
        var log = { fills: [], strokes: [], fillRects: [], texts: [] };
        var m = {
            beginPath: function () { path = []; },
            moveTo: function (x, y) { path.push(x, y); }, lineTo: function (x, y) { path.push(x, y); },
            closePath: function () {}, arc: function (x, y) { path.push(x, y); },
            rect: function (x, y, w, h) { path.push(x, y, x + w, y, x + w, y + h, x, y + h); },
            fill: function () { log.fills.push({ style: st.fillStyle, pts: path.slice() }); },
            stroke: function () { log.strokes.push({ style: st.strokeStyle, pts: path.slice() }); },
            fillRect: function (x, y, w, h) { log.fillRects.push({ style: st.fillStyle, x: x, y: y, w: w, h: h }); },
            fillText: function (s, x, y) { log.texts.push({ style: st.fillStyle, s: String(s), x: x, y: y }); },
            save: function () {}, restore: function () {}, clip: function () {}, clearRect: function () {},
            setLineDash: function () {}, strokeRect: function () {}, translate: function () {}, scale: function () {},
            rotate: function () {}, setTransform: function () {},
            measureText: function (s) { return { width: String(s).length * 6 }; }
        };
        return new Proxy({}, {
            get: function (t, k) { if (k === "_log") return log; if (k in m) return m[k]; if (k in st) return st[k]; return undefined; },
            set: function (t, k, v) { st[k] = v; return true; }
        });
    }
    function recordCanvas(id, fn) {
        var el = LAB.element(id);
        var prev = el._ctx;
        el._ctx = recCtx();
        try { fn(); } finally { var lg = el._ctx._log; el._ctx = prev; }
        return { log: lg, w: el.width, h: el.height };
    }
    // Every numeric leaf of an object, with its path.
    function numericLeaves(o) {
        var out = [];
        (function walk(v, p, depth) {
            if (v === null || v === undefined || depth > 8) return;
            if (typeof v === "number") { out.push({ p: p, v: v }); return; }
            if (typeof v === "object") for (var k in v) walk(v[k], p + "." + k, depth + 1);
        })(o, "", 0);
        return out;
    }
    function numericMap(o) {
        var m = {};
        numericLeaves(o).forEach(function (q) { m[q.p] = q.v; });
        return m;
    }
    function matchingPaths(map, value, tol, exclude) {
        var out = [];
        for (var p in map) {
            if (exclude && exclude.test(p)) continue;
            if (Math.abs(map[p] - value) <= tol) out.push(p);
        }
        return out;
    }
    function commonTrackingPath(a, av, b, bv, tol, exclude) {
        var ap = matchingPaths(a, av, tol, exclude);
        for (var i = 0; i < ap.length; i++) {
            var p = ap[i];
            if (p in b && Math.abs(b[p] - bv) <= tol && Math.abs(a[p] - b[p]) > tol) return p;
        }
        return null;
    }

    // ═══ 1. caveCapture / caveDiag / profile chart at a standing position ═══
    // One place per entrance, 100 u inside, standing (a) on the surface cap over
    // the corridor and (b) on the cave floor beneath it -- the same column.
    // Per check: samples taken on the cap / on the cave floor, samples that
    // could not be taken (skipped, with the reason), and wrong answers.
    function acc(needCap) { return { n: 0, cap: 0, floor: 0, needCap: needCap, bad: [], skip: [], det: [] }; }
    var C1 = acc(true);    // capture floorH == standing layer
    var C2 = acc(true);    // capture ceilH == ceiling above the standing layer
    var D2 = acc(true);    // caveDiag live floorH == standing layer
    var D3 = acc(true);    // caveDiag live ceilH == ceiling above standing layer
    var P1 = acc(false);   // profile chart draws ceilings (inside the cave)
    var P2 = acc(true);    // profile chart floor line through the feet
    function took(A, kind) { A.n++; if (kind === 4) A.cap++; else A.floor++; }

    function profileChart() {
        return recordCanvas("caveProfileCanvas", function () { drawCaveProfileChart(); });
    }
    // y -> h mapping of the chart, from its own labelled horizontal grid lines.
    function chartAxis(lg) {
        var gridY = [];
        lg.strokes.forEach(function (s) { if (s.pts.length === 4 && Math.abs(s.pts[1] - s.pts[3]) < 1e-6) gridY.push(s.pts[1]); });
        var pairs = [];
        lg.texts.forEach(function (t) {
            if (!/^-?\d+$/.test(t.s)) return;
            for (var i = 0; i < gridY.length; i++) if (Math.abs(gridY[i] - (t.y - 3)) < 0.01) { pairs.push({ y: gridY[i], h: +t.s }); break; }
        });
        if (pairs.length < 2) return null;
        pairs.sort(function (a, b) { return a.y - b.y; });
        var a = pairs[0], b = pairs[pairs.length - 1];
        var slope = (b.h - a.h) / (b.y - a.y);
        var fit = pairs.every(function (q) { return Math.abs(a.h + (q.y - a.y) * slope - q.h) < 0.02; });
        return fit ? function (y) { return a.h + (y - a.y) * slope; } : null;
    }
    function polyYAt(pts, x) {
        for (var i = 0; i + 3 < pts.length; i += 2) {
            var x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
            if ((x >= x0 && x <= x1) || (x >= x1 && x <= x0)) {
                if (Math.abs(x1 - x0) < 1e-9) return y0;
                return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
            }
        }
        return null;
    }
    // x -> signed distance from the player, fitted from the chart's OWN
    // bottom-axis labels (their draw call is xAt(tick)-10). This avoids
    // copying the chart's sampleStart/sampleEnd formula into the oracle.
    function chartDistanceAxis(lg) {
        var rows = {}, q = [], bestY = -Infinity;
        lg.texts.forEach(function (t) {
            var m = /^([+-]?\d+)(?:u)?$/.exec(t.s);
            if (!m) return;
            var key = (+t.y).toFixed(3);
            if (!rows[key]) rows[key] = [];
            rows[key].push({ x: t.x + 10, d: +m[1] });
        });
        // X labels share one baseline; Y-axis labels each sit on a different
        // horizontal grid line. Choose the populated numeric row furthest down.
        for (var key in rows) if (rows[key].length >= 2 &&
            (rows[key].length > q.length || (rows[key].length === q.length && +key > bestY))) {
            q = rows[key]; bestY = +key;
        }
        if (q.length < 2) return null;
        q.sort(function (a, b) { return a.x - b.x; });
        var a = q[0], b = q[q.length - 1], slope = (b.d - a.d) / (b.x - a.x);
        if (!isFinite(slope) || slope === 0) return null;
        var fit = q.every(function (v) { return Math.abs(a.d + (v.x - a.x) * slope - v.d) < 0.1; });
        return fit ? function (x) { return a.d + (x - a.x) * slope; } : null;
    }
    var CEIL_STROKE = "#cc9955";   // L21481: the chart's ceiling line colour
    var DOT_FILL = "#6699ff";      // L21551: the player marker

    LAB.scenario(P + "standing snapshots", function () {
        SEEDS.forEach(function (seed) {
            start(seed);
            LAB.entrances().forEach(function (E, ei) {
                var w = LAB.axisWorld(E, INSIDE, 0);
                var tag = "seed " + seed + " E" + ei + " " + wxy(w);
                [4, 1].forEach(function (kind) {
                    var lay = kind === 4 ? "cap" : "floor";
                    var s = standOn(w, kind);
                    if (!s.ok) {
                        var msg = tag + " " + lay + ": could not stand there (" + s.why + ")";
                        C1.skip.push(msg); C2.skip.push(msg); D2.skip.push(msg); D3.skip.push(msg); P2.skip.push(msg);
                        if (kind === 1) P1.skip.push(msg);
                        return;
                    }
                    var frameErrs = LAB.frame();   // one real frame so __caveStats is a live frame's
                    quiet();
                    var h = LAB.h();
                    var ls = LAB.layersAt(pos.x, pos.y);
                    var on = LAB.standingLayer(H_TOL);
                    var postOk = !frameErrs && !jumpAirborne && on && on.t === kind && (kind === 4 || !!ceilAbove(ls, h));
                    if (!postOk) {
                        var post = tag + " " + lay + ": state changed during the measured frame (errors=" + frameErrs +
                                   " h=" + f2(h) + " air=" + jumpAirborne + " standing=" + (on ? on.t + "@" + f2(on.z) : "none") +
                                   " stack " + LAB.fmtLayers(ls) + ")";
                        C1.skip.push(post); C2.skip.push(post); D2.skip.push(post); D3.skip.push(post); P2.skip.push(post);
                        if (kind === 1) P1.skip.push(post);
                        return;
                    }
                    var snap = window.caveCapture();
                    var diag = window.caveDiag();
                    // C1: floor height
                    took(C1, kind);
                    var fh = snap && snap.player ? snap.player.floorH : null;
                    if (typeof fh !== "number" || Math.abs(fh - h) > H_TOL)
                        C1.bad.push(tag + " on " + lay + ": standing h " + f2(h) + ", caveCapture floorH " + f2(fh) +
                            " onSurface=" + (snap && snap.player ? snap.player.onSurface : "?") + " stack " + LAB.fmtLayers(ls));
                    // D2: caveDiag live floor height
                    took(D2, kind);
                    var dfh = diag && diag.live && diag.live.player ? diag.live.player.floorH : null;
                    if (typeof dfh !== "number" || Math.abs(dfh - h) > H_TOL)
                        D2.bad.push(tag + " on " + lay + ": standing h " + f2(h) + ", caveDiag floorH " + f2(dfh));
                    // C2: ceiling above the standing layer (none on the open cap)
                    took(C2, kind);
                    var want = ceilAbove(ls, h);
                    var ch = snap && snap.player ? snap.player.ceilH : undefined;
                    var none = (ch === null || ch === undefined || (typeof ch === "number" && (ch !== ch || ch === 0)));
                    var okC = want ? (typeof ch === "number" && Math.abs(ch - want.z) <= H_TOL) : none;
                    if (!okC) C2.bad.push(tag + " on " + lay + ": ceiling above the feet " + (want ? f2(want.z) : "none") +
                                          ", caveCapture ceilH " + f2(ch) + " (standing h " + f2(h) + ")");
                    // D3: caveDiag ceiling above this same standing layer.
                    took(D3, kind);
                    var dch = diag && diag.live && diag.live.player ? diag.live.player.ceilH : undefined;
                    var dnone = (dch === null || dch === undefined || (typeof dch === "number" && (dch !== dch || dch === 0)));
                    var okDch = want ? (typeof dch === "number" && Math.abs(dch - want.z) <= H_TOL) : dnone;
                    if (!okDch) D3.bad.push(tag + " on " + lay + ": ceiling above the feet " + (want ? f2(want.z) : "none") +
                                            ", caveDiag ceilH " + f2(dch) + " (standing h " + f2(h) + ")");
                    // P2: profile chart floor line through the player's feet
                    var rc = profileChart();
                    var lg = rc.log, axis = chartAxis(lg);
                    var dot = null;
                    lg.fills.forEach(function (f) { if (f.style === DOT_FILL && f.pts.length === 2) dot = { x: f.pts[0], y: f.pts[1] }; });
                    if (!axis || !dot) {
                        P2.skip.push(tag + " " + lay + ": chart " + (!axis ? "has no labelled grid lines" : "drew no player marker"));
                    } else {
                        var hDot = axis(dot.y);
                        if (Math.abs(hDot - h) > 0.1) P2.skip.push(tag + " " + lay + ": chart player marker at " + f2(hDot) + " vs h " + f2(h));
                        else {
                            took(P2, kind);
                            var best = null;
                            lg.strokes.forEach(function (s) {
                                if (s.style === CEIL_STROKE || s.pts.length < 20) return;
                                var y = polyYAt(s.pts, dot.x);
                                if (y === null) return;
                                var hl = axis(y);
                                if (!best || Math.abs(hl - hDot) < Math.abs(best.h - hDot)) best = { h: hl, style: s.style };
                            });
                            P2.det.push(tag + " " + lay + ": feet " + f2(h) + " nearest profile line " + (best ? f2(best.h) + " (" + best.style + ")" : "none"));
                            if (!best || Math.abs(best.h - hDot) > CHART_TOL)
                                P2.bad.push(tag + " on " + lay + ": player marker at h " + f2(hDot) + ", nearest drawn floor line at the player's x " +
                                            (best ? f2(best.h) : "none") + " stack " + LAB.fmtLayers(ls));
                        }
                    }
                    // P1: profile-chart ceiling vertices at the right X AND
                    // the right height (inside the cave only).
                    if (kind === 1) {
                        var ne = null, nd = Infinity;
                        deepCaveEntrances.forEach(function (e) { var d = Math.hypot(pos.x - e.x, pos.y - e.y); if (d < nd) { nd = d; ne = e; } });
                        var dx = (ne.x - pos.x) / nd, dy = (ne.y - pos.y) / nd;
                        var xAxis = chartDistanceAxis(lg), floorLine = null, ceilPts = [];
                        lg.strokes.forEach(function (st) {
                            if (st.style === "#44ee44" && (!floorLine || st.pts.length > floorLine.length)) floorLine = st.pts;
                            if (st.style === CEIL_STROKE) for (var ci = 0; ci + 1 < st.pts.length; ci += 2) ceilPts.push({ x: st.pts[ci], y: st.pts[ci + 1] });
                        });
                        if (!axis || !xAxis || !floorLine || floorLine.length < 20) {
                            P1.skip.push(tag + ": chart did not expose a calibrated distance/height axis and floor sample line");
                        } else {
                            var ceiled = 0, matched = 0, wrongH = [], sampleN = floorLine.length / 2;
                            for (var pi = 0; pi + 1 < floorLine.length; pi += 2) {
                                var px = floorLine[pi], dist = xAxis(px);
                                var wantC = LAB.ceilingOf(LAB.layersAt(pos.x + dx * dist, pos.y + dy * dist));
                                if (!wantC) continue;
                                ceiled++;
                                var got = null;
                                for (var cj = 0; cj < ceilPts.length; cj++) {
                                    if (Math.abs(ceilPts[cj].x - px) <= 0.5) { got = axis(ceilPts[cj].y); break; }
                                }
                                if (got !== null && Math.abs(got - wantC.z) <= CHART_TOL) matched++;
                                else if (wrongH.length < 3) wrongH.push("x=" + f2(px) + " want " + f2(wantC.z) + " got " + (got === null ? "none" : f2(got)));
                            }
                            if (ceiled < 10) P1.skip.push(tag + ": only " + ceiled + "/" + sampleN + " chart samples cross a ceiling");
                            else {
                                took(P1, kind);
                                P1.det.push(tag + ": matched " + matched + "/" + ceiled + " ceiling samples by x and height");
                                if (matched < CEIL_FRAC * ceiled) P1.bad.push(tag + ": matched " + matched + "/" + ceiled +
                                    " ceiling samples by x and height (need " + Math.ceil(CEIL_FRAC * ceiled) +
                                    "; L21449/L21476 draw only ceilings > 0.1): " + wrongH.join("; "));
                            }
                        }
                    }
                });
            });
        });
        // PRECONDITION: the check needs at least one sample standing on the cave
        // floor and (when it is about the cap) one standing on the surface cap.
        function emit(id, A, extra) {
            var pre = (A.floor === 0 ? "no sample stood on the cave floor; " : "") + (A.needCap && A.cap === 0 ? "no sample stood on the surface cap; " : "");
            var ok = !pre && A.bad.length === 0;
            var d = (pre ? "PRECONDITION: " + pre + "|| " : "") +
                    A.bad.length + "/" + A.n + " wrong (" + A.cap + " on the cap, " + A.floor + " on the cave floor)" +
                    (A.bad.length ? ": " + A.bad.slice(0, 4).join("; ") : "") +
                    (A.skip.length ? " || skipped " + A.skip.length + ": " + A.skip.slice(0, 3).join("; ") : "") + (extra || "");
            LAB.check(P + id, ok, d);
        }
        emit("caveCapture reports the floor height of the layer the player is standing on (surface cap and cave floor)", C1, " [L1600 reads getFloorHeightAt = l0TopZ, L7816]");
        emit("caveCapture reports the ceiling above the player's standing layer (none on the open surface cap)", C2, " [L1601-1607 read l1/l2 regardless of the player's layer]");
        emit("caveDiag reports the floor height of the layer the player is standing on", D2, " [L1422-1423 getFloorHeightAt]");
        emit("caveDiag reports the ceiling above the player's standing layer (none on the open surface cap)", D3, " [L1430-1431 read l1/l2 regardless of the player's layer]");
        emit("the cave profile chart draws the cave ceiling where its profile crosses ceilinged cells", P1, (P1.det.length && !P1.bad.length) ? " | " + P1.det.slice(0, 2).join("; ") : "");
        emit("the cave profile chart draws a floor line through the player's feet (on the surface cap and on the cave floor)", P2, P2.det.length ? " | " + P2.det.slice(0, 4).join("; ") : "");

    });

    // Reproducibility fields are proved by DIFFERENTIAL snapshots, not by
    // finding one coincidental number anywhere in one large object.
    LAB.scenario(P + "capture reproducibility", function () {
        function capFixture(seed) {
            start(seed);
            var E = LAB.entrances()[0], w = LAB.axisWorld(E, INSIDE, 0), s = standOn(w, 4);
            if (!s.ok) return { error: "could not stand on cap: " + s.why };
            var errs = LAB.frame(), on = LAB.standingLayer(H_TOL);
            if (errs || jumpAirborne || !on || on.t !== 4) return { error: "cap state changed during frame" };
            cam.ang = YAW;
            return { snap: window.caveCapture(), seed: WORLD_SEED, ox: windowOriginX, oy: windowOriginY,
                     wx: LAB.worldPos().x, wy: LAB.worldPos().y, h: LAB.h(), floorZ: pos.floorZ };
        }
        function pairPaths(a, ax, ay, b, bx, by, tol) {
            var xs = matchingPaths(a, ax, tol), ys = matchingPaths(a, ay, tol), out = null;
            for (var i = 0; i < xs.length && !out; i++) for (var j = 0; j < ys.length && !out; j++) {
                if (xs[i] === ys[j]) continue;
                if (xs[i] in b && ys[j] in b && Math.abs(b[xs[i]] - bx) <= tol && Math.abs(b[ys[j]] - by) <= tol &&
                    (Math.abs(a[xs[i]] - b[xs[i]]) > tol || Math.abs(a[ys[j]] - b[ys[j]]) > tol)) out = [xs[i], ys[j]];
            }
            return out;
        }
        var aSeed = SEEDS[0], bSeed = aSeed === 1 ? 12345 : 1;
        var A = capFixture(aSeed), B = capFixture(bSeed);
        var fixturePre = A.error || B.error;
        if (fixturePre) {
            ["records the world seed", "records where the player is in world space (world position or window origin)",
             "records the player's own height (pos.floorZ), not just the mesh under them", "records the camera yaw"].forEach(function (s) {
                LAB.check(P + "caveCapture " + s, false, "PRECONDITION: " + (A.error || B.error));
            });
            return;
        }
        var am = numericMap(A.snap), bm = numericMap(B.snap);
        var seedPath = commonTrackingPath(am, A.seed, bm, B.seed, 0, null);
        LAB.check(P + "caveCapture records the world seed", !!seedPath,
            seedPath ? "numeric path " + seedPath + " tracked " + A.seed + " -> " + B.seed :
            "no numeric path tracked seed " + A.seed + " -> " + B.seed + " across two otherwise fresh Cave Test worlds");

        // Same world, two distinct yaws. Coincidental entrance angles/counters
        // stay constant and therefore cannot satisfy this check.
        start(aSeed);
        var E = LAB.entrances()[0], w = LAB.axisWorld(E, INSIDE, 0), st = standOn(w, 4);
        var stable = st.ok && LAB.frame() === 0 && LAB.standingLayer(H_TOL);
        cam.ang = YAW; var yawA = numericMap(window.caveCapture());
        cam.ang = 0.9; var yawB = numericMap(window.caveCapture());
        var yawPath = commonTrackingPath(yawA, YAW, yawB, 0.9, 0.01, null) ||
                      commonTrackingPath(yawA, YAW * 180 / Math.PI, yawB, 0.9 * 180 / Math.PI, 0.5, null);
        LAB.check(P + "caveCapture records the camera yaw", stable && !!yawPath,
            (stable ? "" : "PRECONDITION: could not hold the cap fixture; ") + (yawPath ? "numeric path " + yawPath + " tracked yaw 2.2 -> 0.9" :
            "no numeric path tracked yaw 2.2 -> 0.9 (radians or degrees)"));

        // Capture before and after a two-axis window shift. X and Y must be
        // distinct paths and must both track either WORLD position or origin.
        cam.ang = YAW;
        var p0 = { snap: window.caveCapture(), wx: LAB.worldPos().x, wy: LAB.worldPos().y, ox: windowOriginX, oy: windowOriginY };
        LAB.placeWorld(p0.wx + 3 * CHUNK_SIZE + 37, p0.wy + 2 * CHUNK_SIZE + 83, "top");
        var p1 = { snap: window.caveCapture(), wx: LAB.worldPos().x, wy: LAB.worldPos().y, ox: windowOriginX, oy: windowOriginY };
        var p0m = numericMap(p0.snap), p1m = numericMap(p1.snap);
        var worldPair = pairPaths(p0m, p0.wx, p0.wy, p1m, p1.wx, p1.wy, 1);
        var originPair = pairPaths(p0m, p0.ox, p0.oy, p1m, p1.ox, p1.oy, 0.5);
        var xyPair = worldPair || originPair;
        LAB.check(P + "caveCapture records where the player is in world space (world position or window origin)", !!xyPair,
            xyPair ? "distinct numeric paths " + xyPair.join(",") + " tracked " + (worldPair ? "world position" : "window origin") + " across a two-axis shift" :
            "no distinct numeric paths tracked both world x/y or origin x/y across a two-axis window shift; player.x/y alone are window-local");

        // Same x/y and mesh stack, two airborne heights. Mesh floorH/ceilH are
        // excluded: the capture must carry the player's own height.
        var lowH = LAB.h(), lowZ = pos.floorZ, lowSnap = numericMap(window.caveCapture());
        jumpAirborne = true; jumpVelZ = 0; pos.floorZ = lowZ + 32; cam.z = pos.floorZ;
        var highH = LAB.h(), highZ = pos.floorZ, highSnap = numericMap(window.caveCapture());
        var ownHeight = commonTrackingPath(lowSnap, lowH, highSnap, highH, 0.02, /\.player\.(?:floorH|ceilH)$/) ||
                        commonTrackingPath(lowSnap, lowZ, highSnap, highZ, 0.5, /\.player\.(?:floorH|ceilH)$/);
        var away = LAB.layersAt(pos.x, pos.y).every(function (l) { return Math.abs(l.z - highH) > 0.5; });
        pos.floorZ = lowZ; cam.z = lowZ; jumpAirborne = false; jumpVelZ = 0;
        LAB.check(P + "caveCapture records the player's own height (pos.floorZ), not just the mesh under them", away && !!ownHeight,
            (away ? "" : "PRECONDITION: raised fixture was not between layers; ") + (ownHeight ? "numeric path " + ownHeight + " tracked player h " +
            f2(lowH) + " -> " + f2(highH) : "no numeric path tracked player h " + f2(lowH) + " -> " + f2(highH) +
            " (or floorZ " + f2(lowZ) + " -> " + f2(highZ) + ") at unchanged x/y; mesh floorH/ceilH excluded"));
    });

    // ═══ 2. a real walk from the open surface into the cave, rendered ═══════
    // Every frame goes through the real loop() (input, physics, renderFrame), so
    // anything a frame could write -- __caveStats, window.__caveDebugLast -- gets
    // its chance. WORLD target, re-read every frame (the window re-centres).
    var W = { walks: 0, reached: [], notReached: [], frames: 0, obFrames: 0,
              rawOverFrames: 0, rawOverWorst: null, drawnFrames: 0,
              statsMissing: [], renderErrors: 0, snapBad: [], display: [] };
    LAB.scenario(P + "walk into the cave", function () {
        SEEDS.forEach(function (seed) {
            start(seed);
            var beforeDiag = window.caveDiag();
            var beforeSnap = JSON.stringify(beforeDiag ? beforeDiag.lastTransitionSnapshot : null);
            var E = LAB.entrances()[0];
            var a = LAB.axisWorld(E, 300, 0), b = LAB.axisWorld(E, -150, 0);
            LAB.placeWorld(a.x, a.y, "top");
            W.walks++;
            var t;
            for (t = 0; t < 700; t++) {
                var p = LAB.worldPos();
                if (Math.hypot(b.x - p.x, b.y - p.y) < 6) break;
                cam.ang = Math.atan2(b.y - p.y, b.x - p.x); cam.pitch = 0;
                LAB.keys({ up: true });
                W.renderErrors += LAB.frame();
                quiet();
                W.frames++;
                var cs = __caveStats;
                if (cs.floorTotal > 0) W.drawnFrames++;
                if (typeof cs.floorOutsideBlend === "number" && isFinite(cs.floorOutsideBlend) && cs.floorOutsideBlend > 0) W.obFrames++;
                var names = ["floorTotal", "floorDistCull", "floorFovCull", "floorBehind", "floorBlendRange", "floorOutsideBlend"];
                var missing = names.filter(function (k) { return typeof cs[k] !== "number" || !isFinite(cs[k]); });
                if (missing.length) {
                    if (!W.statsMissing.length) W.statsMissing.push("seed " + seed + " missing/non-numeric " + missing.join(","));
                    continue;
                }
                var sum = cs.floorDistCull + cs.floorFovCull + cs.floorBehind + cs.floorBlendRange + cs.floorOutsideBlend;
                if (sum > cs.floorTotal) {
                    W.rawOverFrames++;
                    if (!W.rawOverWorst || sum - cs.floorTotal > W.rawOverWorst.over)
                        W.rawOverWorst = { over: sum - cs.floorTotal, seed: seed, at: LAB.worldPos(), along: LAB.alongOf(E),
                                        s: "total " + cs.floorTotal + " = distCull " + cs.floorDistCull + " + fovCull " + cs.floorFovCull +
                                           " + behind " + cs.floorBehind + " + blendRange " + cs.floorBlendRange + " + outsideBlend " + cs.floorOutsideBlend };
                }
            }
            LAB.keys({});
            var ls = LAB.layersAt(pos.x, pos.y), h = LAB.h(), low = LAB.lowestWalkable(ls);
            var tag = "seed " + seed + " E0 walk along +300 -> " + sg(LAB.alongOf(E)) + " at " + wxy(LAB.worldPos()) + " h " + f2(h) + " in " + t + " frames";
            if (!(low && Math.abs(h - low.z) < 0.3 && ceilAbove(ls, h))) { W.notReached.push(tag + " stack " + LAB.fmtLayers(ls)); return; }
            W.reached.push(tag);
            var dg = window.caveDiag();
            var afterSnap = JSON.stringify(dg ? dg.lastTransitionSnapshot : null);
            if (!dg || !dg.lastTransitionSnapshot || afterSnap === beforeSnap) W.snapBad.push(tag + " before=" + beforeSnap + " after=" + afterSnap);

            // Judge the user-visible FLOOR REJECTION percentages. A valid
            // relabeling may remove blend/outside from the percentage table;
            // the three actual cell-cull rows must remain numeric.
            drawCaveDebug();
            var txt = String(LAB.element("caveDebugStats").textContent || "");
            var floorPart = txt.split("═══ CEILING PIPELINE ═══")[0], pctSum = 0, pctRows = 0, invalid = [];
            ["distCull", "fovCull", "behind", "blendRange", "outsideBlend"].forEach(function (name) {
                var mm = new RegExp("^" + name + "\\s+.*?([0-9]+(?:\\.[0-9]+)?)%", "m").exec(floorPart);
                if (mm) { pctRows++; pctSum += +mm[1]; }
                else if (new RegExp("^" + name + "\\s+.*?(?:NaN|undefined)%", "m").test(floorPart) ||
                         ((name === "distCull" || name === "fovCull" || name === "behind") && new RegExp("^" + name + "\\b", "m").test(floorPart))) invalid.push(name);
            });
            W.display.push({ seed: seed, sum: pctSum, rows: pctRows, invalid: invalid, text: floorPart.replace(/\s*\n\s*/g, " | ").slice(0, 500) });
        });
        var pre = (W.reached.length === 0 ? "PRECONDITION: no walk reached the cave floor || " : "") +
                  (W.drawnFrames === 0 ? "PRECONDITION: no frame ran the floor pass || " : "") +
                  (W.renderErrors ? "PRECONDITION: " + W.renderErrors + " render errors || " : "") +
                  (W.statsMissing.length ? "PRECONDITION: " + W.statsMissing.join("; ") + " || " : "");
        var skipped = W.notReached.length ? " || walks that did not reach the cave floor: " + W.notReached.join("; ") : "";
        LAB.check(P + "caveDiag().lastTransitionSnapshot is populated after walking from the surface into the cave",
            !pre && W.snapBad.length === 0,
            pre + W.snapBad.length + "/" + W.reached.length + " walks that reached the cave floor left lastTransitionSnapshot null or unchanged from before the walk" +
            (W.snapBad.length ? ": " + W.snapBad.slice(0, 3).join("; ") : "") + " (window.__caveDebugLast is read at L1419, never written)" + skipped);
        LAB.check(P + "caveCapture's outsideBlend counter changes somewhere on a walk from the surface into the cave",
            !pre && W.obFrames > 0,
            pre + "__caveStats.floorOutsideBlend non-zero in " + W.obFrames + "/" + W.frames + " rendered frames (reset at L12471, never incremented); " + W.reached.slice(0, 2).join("; ") + skipped);
        var displayBad = W.display.filter(function (d) { return d.invalid.length || d.rows < 3 || d.sum > 100.1; });
        LAB.check(P + "the floor-rejection histogram's buckets never add up to more than its total",
            !pre && W.display.length > 0 && displayBad.length === 0,
            pre + (W.display.length ? displayBad.length + "/" + W.display.length + " displayed histograms invalid; " + W.display.map(function (d) {
                return "seed " + d.seed + " displayed rejection percentages total " + f2(d.sum) + "% across " + d.rows + " rows" +
                       (d.invalid.length ? " (invalid " + d.invalid.join(",") + ")" : ""); }).join("; ") : "PRECONDITION: no displayed histogram was sampled") +
            (W.rawOverWorst ? " || raw metric worst seed " + W.rawOverWorst.seed + " at world " + wxy(W.rawOverWorst.at) + " along " + sg(W.rawOverWorst.along) +
            ": " + W.rawOverWorst.s + " (over by " + W.rawOverWorst.over + ")" : ""));
        LAB.metric("tools.walk.frames", W.frames);
        LAB.metric("tools.walk.raw_counter_over_frames", W.rawOverFrames);
    });

    // ═══ 3. far from any cave: the ceiling pipeline must report no ceilings ═══
    LAB.scenario(P + "no cave in the window", function () {
        var n = 0, pre = [], bad = [], det = [];
        SEEDS.forEach(function (seed) {
            start(seed);
            // Cave Test builds exactly one network, at region (0,0) (L4450-4455),
            // centred on world (720,720). Walk out along the compass until the
            // assembled window holds none of it (read from the mesh, not assumed).
            function windowCeilings() {
                var m = floorMesh, c = 0;
                for (var i = 0; i < m.w * m.h; i++) if (LAB.ceilingOf(LAB.layers(i))) c++;
                return c;
            }
            var ceils = -1, tried = [];
            [2600, 3400, 4400].some(function (r) {
                return [[-1, 0], [0, 1], [1, 0], [0, -1]].some(function (d) {
                    LAB.placeWorld(720 + d[0] * r, 720 + d[1] * r, "top");
                    ceils = windowCeilings();
                    tried.push(wxy(LAB.worldPos()) + ":" + ceils);
                    return ceils === 0;
                });
            });
            cam.ang = Math.PI; cam.pitch = 0;
            LAB.tick(3);
            var frameErrs = LAB.frame();
            ceils = windowCeilings();
            var tag = "seed " + seed + " at world " + wxy(LAB.worldPos());
            if (ceils > 0) tag += " (tried " + tried.join(" ") + ")";
            if (frameErrs || ceils > 0 || __caveStats.floorTotal === 0) {
                pre.push(tag + ": skipped, renderErrors " + frameErrs + ", " + ceils +
                         " ceiling cells in the window, floorTotal " + __caveStats.floorTotal); return;
            }
            n++;
            var snap = window.caveCapture();
            var cp = (snap && snap.ceilPipeline) || {};
            var required = ["skipLowCeil", "skipEntrRange", "collected", "rendered"];
            var allowedNonzero = { visited: 1, skipViewDist: 1, skipBehind: 1, skipFov: 1 };
            var missing = required.filter(function (k) { return !(k in cp) || typeof cp[k] !== "number" || !isFinite(cp[k]); });
            var nz = [];
            for (var k in cp) if (typeof cp[k] === "number" && isFinite(cp[k]) && !allowedNonzero[k] && cp[k] !== 0) nz.push(k);
            det.push(tag + " (0 ceiling layers in the whole window): ceilPipeline " + JSON.stringify(cp));
            if (missing.length || nz.length) bad.push(tag + ": " + (missing.length ? "missing/non-numeric required fields " + missing.join(",") + "; " : "") +
                (nz.length ? nz.map(function (k) { return k + "=" + cp[k]; }).join(" ") : ""));
        });
        LAB.check(P + "with no ceiling anywhere in the window, caveCapture's ceiling pipeline reports no ceilings skipped, collected or rendered",
            n > 0 && bad.length === 0,
            (n === 0 ? "PRECONDITION: no seed produced a window without ceilings || " : "") +
            bad.length + "/" + n + " wrong (skipLowCeil++ runs for EVERY non-ceiling layer, L13021): " + det.join("; ") +
            (pre.length ? " || " + pre.join("; ") : ""));
    });

    // ═══ 4. the control map's colours vs the mesh ═══════════════════════════
    LAB.scenario(P + "control map", function () {
        var painted = 0, ug = 0, bad = [], teal = 0, badN = 0, pre = [];
        SEEDS.forEach(function (seed) {
            start(seed);
            var E = LAB.entrances()[0];
            var w = LAB.axisWorld(E, 150, 0);
            LAB.placeWorld(w.x, w.y, "top");
            var rc = recordCanvas("controlMapCanvas", function () { drawCaveControlMap(); });
            // Invert the map's own cell placement (L21606-21611, L21646): px =
            // (gx*gs - centre + 500) * width/1000, centre = nearest entrance.
            var ne = null, nd = Infinity;
            deepCaveEntrances.forEach(function (e) { var d = Math.hypot(pos.x - e.x, pos.y - e.y); if (d < nd) { nd = d; ne = e; } });
            var ppu = rc.w / 1000, gs = floorMesh.gridSize, cells = 0, off = 0;
            rc.log.fillRects.forEach(function (r) {
                var mm = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(r.style);
                if (r.style === "#1a3a3a") teal++;
                if (!mm || r.w !== r.h || r.w > 8) return;
                var gxf = (r.x / ppu + ne.x - 500) / gs, gyf = (r.y / ppu + ne.y - 500) / gs;
                var gx = Math.round(gxf), gy = Math.round(gyf);
                if (Math.abs(gxf - gx) > 0.01 || Math.abs(gyf - gy) > 0.01) { off++; return; }
                cells++;
                var R_ = +mm[1], G_ = +mm[2], B_ = +mm[3];
                if (!(B_ > R_ && B_ > G_)) return;         // L21651-21655 underground palette: blue dominant
                ug++;
                var ls = LAB.layers(gy * floorMesh.w + gx);
                var low = ls.some(function (l) { return LAB.walkable(l.t) && l.z < -0.1; });
                if (!low) { badN++; if (bad.length < 4) bad.push("seed " + seed + " world " + wxy({ x: windowOriginX + gx * gs, y: windowOriginY + gy * gs }) + " stack " + LAB.fmtLayers(ls) + " painted " + r.style); }
            });
            painted += cells;
            if (off > 0) pre.push("seed " + seed + ": " + off + " cell rects did not map back to a grid cell (map placement changed?)");
        });
        if (painted < 100) pre.push("only " + painted + " cell rects mapped back to grid cells");
        if (ug < 100) pre.push("only " + ug + " cells painted with the underground palette");
        LAB.check(P + "the control map paints a cell as cave floor only if the cell has a walkable floor below the surface",
            pre.length === 0 && badN === 0,
            (pre.length ? "PRECONDITION: " + pre.join("; ") + " || " : "") + badN + "/" + ug + " underground-painted cells have no walkable layer below -0.1 " +
            "(L21641 colours by l0TopZ, which is the CEILING where assembleWindow's Z-sort put it at the bottom, L6724): " + bad.join("; "));
        LAB.metric("tools.controlmap.cells", painted);
        LAB.metric("tools.controlmap.underground_cells", ug);
        LAB.metric("tools.controlmap.teal_cells", teal);
    });

    // ═══ 5. debugCaveAt vs the assembled mesh ══════════════════════════════
    // At every ceilinged mesh cell, probe the point the chunk stamper queried
    // (the cell's NW corner, L5589-5590). Where debugCaveAt reports full cave
    // influence (fade 1) the stamped floor is exactly caveFloorZ and the stamped
    // ceiling exactly ceilZ (L5618, L5621) -- so they must match the mesh.
    LAB.scenario(P + "debugCaveAt", function () {
        var core = 0, bad = [], badN = 0, feather = 0, featherOff = 0, worst = 0;
        XSEEDS.forEach(function (seed) {
            start(seed);
            var m = floorMesh, gs = m.gridSize;
            for (var gy = 0; gy < m.h; gy++) for (var gx = 0; gx < m.w; gx++) {
                var ls = LAB.layers(gy * m.w + gx);
                var c = LAB.ceilingOf(ls);
                if (!c) continue;
                var r = window.debugCaveAt(windowOriginX + gx * gs, windowOriginY + gy * gs);
                var fl = null;
                ls.forEach(function (l) { if (l.t === 1 && l.z < c.z && (!fl || l.z > fl.z)) fl = l; });
                if (!r || typeof r.fade !== "number") { badN++; if (bad.length < 4) bad.push("seed " + seed + " cell " + gx + "," + gy + ": debugCaveAt returned " + JSON.stringify(r)); continue; }
                if (r.fade < 0.999) { feather++; if (!fl || Math.abs(fl.z - r.caveFloorZ) > 0.25) featherOff++; continue; }
                core++;
                var df = fl ? Math.abs(fl.z - r.caveFloorZ) : Infinity;
                var dc = (typeof r.ceilZ === "number") ? Math.abs(c.z - r.ceilZ) : Infinity;
                var d = Math.max(df, dc);
                if (d > worst && isFinite(d)) worst = d;
                if (d > 0.25) {
                    badN++;
                    if (bad.length < 4) bad.push("seed " + seed + " world " + wxy({ x: windowOriginX + gx * gs, y: windowOriginY + gy * gs }) + " mesh " + LAB.fmtLayers(ls) +
                                                 " vs debugCaveAt floor " + f2(r.caveFloorZ) + " ceil " + f2(r.ceilZ));
                }
            }
            LAB.clearLogs();                 // debugCaveAt console.logs every call
        });
        LAB.check(P + "debugCaveAt reports the assembled mesh's cave floor and ceiling wherever it reports full cave influence",
            core > 0 && badN === 0,
            (core === 0 ? "PRECONDITION: no core cave cell || " : "") + badN + "/" + core + " core cells differ by > 0.25 h (worst " + f2(worst) +
            " h; seeds " + XSEEDS.join(",") + "; L4802 passes smoothedSurface 2.0, the stamper passes the real 21x21 max, L5594-5606): " + bad.join("; "));
        LAB.metric("tools.debugcaveat.core_cells", core);
        LAB.metric("tools.debugcaveat.core_mismatch", badN);
        LAB.metric("tools.debugcaveat.feather_cells", feather);
        LAB.metric("tools.debugcaveat.feather_target_not_mesh_frac", feather ? featherOff / feather : 0);
    });

    // ═══ 6. caveGaps: can it see a gap at all? ═════════════════════════════
    // Real walls, real faces. Two injected, restored-after situations per face
    // direction: (a) the face's wallFaceBase raised 1 h above the floor caveGaps
    // samples, (b) the floor at the face's far VERTEX -- where the floor quads
    // meet the wall (a floor quad's corner (x*gs, y*gs) carries cell (x,y)'s
    // height, L12752-12761) -- dropped 2 h below the face's base.
    LAB.scenario(P + "caveGaps", function () {
        var DIRS = ["W", "E", "N", "S"], FI = { W: 0, E: 1, N: 2, S: 3 };
        // Far vertex of each face (the endpoint that is not the wall's own cell's
        // NW corner). Face endpoints: L1507-1510 / L12149-12179.
        var FAR = { W: [0, 1], E: [1, 1], N: [1, 0], S: [0, 1] };
        var raised = {}, dropped = {}, skip = [], realFaces = 0, realMax = -Infinity, realGaps = 0, below = 0;
        // Supplement the natural sample, keeping all four face directions a
        // mandatory precondition even when the first cave has no suitable face.
        var gapSeeds = SEEDS.slice();
        [1, 777, 424242].forEach(function (s) { if (gapSeeds.indexOf(s) < 0) gapSeeds.push(s); });
        gapSeeds.forEach(function (seed) {
            start(seed);
            var E = LAB.entrances()[0];
            var w = LAB.axisWorld(E, INSIDE, 0);
            LAB.placeWorld(w.x, w.y, "bottom");
            LAB.tick(2);
            var all = window.caveGaps(400, -1e9, 1e6);
            var real = window.caveGaps(400, 0.2, 1e6);
            if (!all || !all.top.length) { skip.push("seed " + seed + ": caveGaps scanned no cave wall face near " + wxy(LAB.worldPos())); return; }
            realFaces += all.top.length; realGaps += real.top.length;
            all.top.forEach(function (r) {
                if (r.gap > realMax) realMax = r.gap;
                var mn = Math.min(r.fh, r.faceSamples.e1, r.faceSamples.mid, r.faceSamples.e2);
                if (r.baseFh <= mn + 1e-3) below++;
            });
            var m = floorMesh;
            DIRS.forEach(function (d) {
                var c = all.top.filter(function (r) { return r.face === d; });
                c.sort(function (a, b) { return a.dist - b.dist || a.gy - b.gy || a.gx - b.gx; });
                var pick = null;
                for (var k = 0; k < c.length && !pick; k++) {
                    var vx = c[k].gx + FAR[d][0], vy = c[k].gy + FAR[d][1];
                    if (vx < m.w && vy < m.h && !grid[vy * gridW + vx]) pick = { r: c[k], vx: vx, vy: vy };
                }
                if (!pick) { skip.push("seed " + seed + ": no " + d + " face with an open far vertex"); return; }
                var bi = (pick.r.gy * gridW + pick.r.gx) * 4 + FI[d];
                var face = "seed " + seed + " wall (" + pick.r.gx + "," + pick.r.gy + ") " + d + " face";
                function found(res) { return res && res.top.some(function (x) { return x.gx === pick.r.gx && x.gy === pick.r.gy && x.face === d; }); }
                // (a) raised base
                var sb = wallFaceBase[bi];
                wallFaceBase[bi] = pick.r.minSample + 1.0;
                var ra = window.caveGaps(400, 0.2, 1e6);
                wallFaceBase[bi] = sb;
                (raised[d] = raised[d] || []).push({ ok: found(ra), s: face + " base raised to " + f2(pick.r.minSample + 1.0) });
                // (b) floor at the far vertex dropped below the base
                var vi = pick.vy * m.w + pick.vx;
                var sv = { lc: m.layerCount[vi], t: m.l0Type[vi], z: m.l0TopZ[vi] };
                m.layerCount[vi] = 1; m.l0Type[vi] = 1; m.l0TopZ[vi] = sb - 2.0;
                _floorCacheTick = (_floorCacheTick + 1) | 0;
                var rb = window.caveGaps(400, 0.2, 1e6);
                m.layerCount[vi] = sv.lc; m.l0Type[vi] = sv.t; m.l0TopZ[vi] = sv.z;
                _floorCacheTick = (_floorCacheTick + 1) | 0;
                (dropped[d] = dropped[d] || []).push({ ok: found(rb), s: face + " base " + f2(sb) + ", floor at vertex cell (" + pick.vx + "," + pick.vy + ") dropped to " + f2(sb - 2.0) });
            });
            LAB.clearLogs();
        });
        // PRECONDITION: every face direction must have been tested at least once.
        function verdict(tbl) {
            var miss = [], n = 0, got = [];
            DIRS.forEach(function (d) {
                if (!tbl[d]) { miss.push("PRECONDITION " + d + ": no face of this direction was tested"); return; }
                tbl[d].forEach(function (q) { n++; (q.ok ? got : miss).push(q.s + (q.ok ? " -> reported" : " -> NOT reported")); });
            });
            return { ok: miss.length === 0 && n > 0, s: miss.concat(got).join("; ") };
        }
        var va = verdict(raised), vb = verdict(dropped);
        var sk = skip.length ? " || skipped: " + skip.join("; ") : "";
        LAB.check(P + "caveGaps reports a wall face whose base is raised above the floor beside it", va.ok, va.s + sk);
        LAB.check(P + "caveGaps reports a wall face when the floor at either of its vertices drops below the wall base",
            vb.ok, vb.s + sk + " [W/N faces sample the column/row BEYOND the face vertex (offset 1 u into the neighbour, L1549-1554), " +
            "the same points wallFaceBase was built from (L6856-6865), so the floor at the far vertex is never looked at]");
        LAB.metric("tools.cavegaps.real_faces", realFaces);
        LAB.metric("tools.cavegaps.real_gaps_reported", realGaps);
        LAB.metric("tools.cavegaps.real_max_gap", isFinite(realMax) ? realMax : null, "h");
        LAB.metric("tools.cavegaps.real_base_at_or_below_own_samples", below);
        LAB.note("caveGaps on the unmodified world: " + realGaps + " gaps over " + realFaces + " cave wall faces, max gap " + f3(realMax) +
                 " h; " + below + "/" + realFaces + " faces have wallFaceBase <= min(own cell, the 3 samples caveGaps reads) -- the base is built from those " +
                 "same samples (L6844-6867) then cave walls are pushed to the window's min floor - 0.5 (L6875-6893), so a gap > 0 is impossible by construction");
    });

    // ═══ 7. debug-panel checkboxes must change something ═══════════════════
    // Compare both a surface mouth view and an underground look-back view.
    // Observable includes path fills, fillRect content, strokes, text, ctx call
    // counts and monotonic console counts. A render error is NEVER an effect.
    LAB.scenario(P + "debug checkboxes", function () {
        var seed = SEEDS[0];
        start(seed);
        var E = LAB.entrances()[0];
        var scenes = {
            surface: { w: LAB.axisWorld(E, 150, 0), layer: "top", ang: E.angle },
            underground: { w: LAB.axisWorld(E, INSIDE, 0), layer: "bottom", ang: E.angle + Math.PI }
        };
        function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
        function round(v) { return Math.round(v * 100) / 100; }
        function setup(which) {
            var q = scenes[which];
            LAB.placeWorld(q.w.x, q.w.y, q.layer); cam.ang = q.ang; cam.pitch = 0;
            LAB.tick(5); quiet();
        }
        function sig() {
            var c0 = {}; for (var k in LAB.ctxCounters) c0[k] = LAB.ctxCounters[k];
            var lc0 = LAB.logCount, ec0 = LAB.errorCount, mark = LAB.renderErrorMark();
            // Frame-phase fixture: the light grid rebuilds on every 5th frame
            // (L18968), so pin the phase and every compared frame does the same work.
            _lightGridFrameCount = 4;
            LAB.prepCamera();
            var rec = LAB.record(function () { renderFrame(); }, { fillRects: true, strokes: true, texts: true, keepOnThrow: true });
            var d = []; Object.keys(LAB.ctxCounters).sort().forEach(function (k2) { d.push(k2 + ":" + (LAB.ctxCounters[k2] - c0[k2])); });
            var serial = rec.fills.map(function (f) { return "F|" + f.style + "|" + f.alpha + "|" + f.pts.map(round).join(","); })
                .concat(rec.fillRects.map(function (r) { return "R|" + r.style + "|" + [r.x, r.y, r.w, r.h].map(round).join(","); }))
                .concat(rec.strokes.map(function (s) { return "S|" + s.style + "|" + s.pts.map(round).join(","); }))
                .concat(rec.texts.map(function (t) { return "T|" + t.style + "|" + t.text + "|" + round(t.x) + "," + round(t.y); })).join(";");
            var logN = LAB.logCount - lc0, errN = LAB.errorCount - ec0;
            // Array#slice(-0) is slice(0), so handle the zero-delta case
            // explicitly or an earlier toggle's log poisons the restore check.
            var newLogs = logN > 0 ? LAB.logs.slice(-Math.min(logN, LAB.logs.length)).join("\n") : "";
            var renderErrs = LAB.renderErrorsSince(mark) + (rec.error ? 1 : 0);
            return { s: d.join(" ") + " fills:" + rec.fills.length + " rects:" + rec.fillRects.length + " h:" + hash(serial) +
                        " logs:" + logN + " lh:" + hash(newLogs), fills: rec.fills.length, errors: renderErrs + errN };
        }
        function settle(which) {
            setup(which);
            var run = 0, prev = null;
            for (var i = 0; i < 20; i++) {
                var s = sig();
                if (s.errors) return { error: "render errors while settling: " + s.errors };
                run = (prev && prev.s === s.s) ? run + 1 : 0; prev = s;
                if (run >= 2) return { base: s, renders: i + 1 };
            }
            return { error: "frames never settled to three identical renders in 20" };
        }
        function effect(which, name) {
            var st = settle(which);
            if (!st.base) return { scene: which, error: st.error };
            var old = window[name];
            window[name] = !old;
            var b = sig();
            window[name] = old;
            var a2 = sig();
            return { scene: which, changed: b.s !== st.base.s, stable: a2.s === st.base.s,
                     clean: b.errors === 0 && a2.errors === 0, from: old, b: b, base: st.base, renders: st.renders };
        }
        function both(name) { return [effect("surface", name), effect("underground", name)]; }
        function verdict(rs) {
            return rs.every(function (r) { return !r.error && r.stable && r.clean; }) && rs.some(function (r) { return r.changed; });
        }
        function detail(name, rs) {
            return name + " " + rs.map(function (r) {
                if (r.error) return r.scene + " PRECONDITION: " + r.error;
                return r.scene + " " + r.from + "->" + !r.from + " " + (r.changed ? "changed" : "identical") +
                       " stable=" + r.stable + " renderErrors=" + r.b.errors + " [" + r.b.s + "]";
            }).join("; ");
        }
        var poly = both("DEBUG_POLY_TYPES"), wire = both("DEBUG_CEIL_WIRE");
        LAB.check(P + "the frame comparison detects a checkbox that is wired (Poly types, DEBUG_POLY_TYPES)", verdict(poly), detail("DEBUG_POLY_TYPES", poly));
        LAB.check(P + "the frame comparison detects an underground-only checkbox that is wired (Ceiling wireframe, DEBUG_CEIL_WIRE)", verdict(wire), detail("DEBUG_CEIL_WIRE", wire));
        [["DEBUG_FLOOR", "Floor debug", "L1369 declared, L22241 set, never read"],
         ["DEBUG_FLOOR_LINE", "Floor LINE debug", "L1370 declared, L22242 set, never read"],
         ["DEBUG_TEXTURE", "Texture debug", "L1368 declared, L22240 set, L22497 forced true at load, never read"]].forEach(function (q) {
            var id = P + "ticking '" + q[1] + "' (" + q[0] + ") changes what the game draws or logs";
            var rs = both(q[0]);
            LAB.check(id, verdict(poly) && verdict(wire) && verdict(rs),
                (verdict(poly) && verdict(wire) ? "" : "PRECONDITION: a positive control was not detected cleanly || ") + detail(q[0], rs) + " [" + q[2] + "]");
        });
    });

    // ═══ 8. I4: legacy window.caveTest is at least executable end-to-end ═══
    // jsc exposes drainMicrotasks(), which lets this synchronous harness drive
    // the function's captured setTimeout awaits deterministically. JXA does
    // not expose a microtask drain; there we still require a callable returning
    // a thenable. If jsc finds a product failure, the engine-status comparison
    // will diverge rather than silently blessing it.
    LAB.scenario(P + "legacy caveTest", function () {
        start(SEEDS[0]);
        var done = false, report = null, rejected = null, inBounds = true, turns = 0;
        var ec0 = LAB.errorCount, p = null, callError = null;
        try { p = window.caveTest(); } catch (e) { callError = e; }
        var thenable = !!p && typeof p.then === "function";
        if (thenable) p.then(function (v) { done = true; report = v; }, function (e) { done = true; rejected = e; });
        var canDrain = typeof drainMicrotasks === "function";
        if (thenable && canDrain) {
            for (turns = 0; turns < 600 && !done; turns++) {
                LAB.advance(20);
                LAB.runTimers(); LAB.flushRaf();
                drainMicrotasks();
                if (floorMesh && (pos.x < 0 || pos.y < 0 || pos.x >= floorMesh.w * floorMesh.gridSize || pos.y >= floorMesh.h * floorMesh.gridSize)) inBounds = false;
            }
        }
        var fullOk = done && !rejected && report && typeof report === "object" && Array.isArray(report.results) && inBounds && LAB.errorCount === ec0;
        var limitedOk = !canDrain && !callError && thenable;
        var verdict = canDrain ? fullOk : limitedOk;
        var failDetail = callError ? "synchronous call threw " + callError : !thenable ? "call did not return a Promise/thenable" :
            ("async completion failed: done=" + done + " rejected=" + (rejected ? String(rejected) : "no") +
             " report=" + (report ? (report.passed + " passed/" + report.failed + " failed/" + report.results.length + " results") : "null") +
             " stayedInsideWindow=" + inBounds + " console.errors=" + (LAB.errorCount - ec0));
        LAB.check(P + "window.caveTest runs to completion and returns a report", verdict,
            verdict ? "callable returned a thenable; jsc supplies the authoritative async-completion verdict" : failDetail);
        if (canDrain) LAB.note("caveTest: jsc drove " + turns + " captured-timer turns; report " +
            (report ? (report.passed + " passed/" + report.failed + " failed/" + report.results.length + " results") : "null"));
        else LAB.note("caveTest: LIMITED ENGINE " + LAB.engine + " exposes no synchronous microtask drain; callable/thenable checked here, jsc owns completion");
    });
}
LAB.finish();
undefined;
