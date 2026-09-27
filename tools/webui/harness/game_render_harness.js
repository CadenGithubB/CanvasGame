// game_render_harness.js -- what the Endless crawler's 3D draw passes actually
// SUBMIT, measured by recording every fill() the real passes make.
//
// Each check states how the game SHOULD render and is scored on the game's own
// output: drawLayersCeiling3D / drawLayersFloor3D / drawWalls3D /
// drawCaveEntrance3D / drawEnemies3D / drawTreasureChests3D are called as-is,
// with DEBUG_POLY_TYPES on where fills are classified (the game's own
// per-polygon palette, WebPage_Games.h:12817-12824, 13085-13088), and whole
// frames go through the real loop(). Nothing here re-derives what a pass
// "would" draw. What this file computes itself is PRECONDITION evidence read
// straight from floorMesh (how many cave cells sit in the camera's view cone,
// whether a sight line runs through rock), so that a "draws nothing" check can
// fail when there was nothing to draw, and a "draws enough" check has a bar.
//
// usage (via tools/webui/game_lab.py): <extracted game js> [--seeds a,b] [--endless-seeds c,d]
//   --seeds          Cave Test worlds     (default 12345, 424242, 1, 777)
//   --endless-seeds  normal Endless worlds (default 424242, 777000)
//
// Line numbers are WebPage_Games.h header lines (game_lab pads the extract).

(0, eval)(slurp("tools/webui/harness/_game_env.js"));
LAB.init(__out, slurp, __engine, __argv);
LAB.check("render: game script evaluates without throwing", LAB.load(__argv[0]),
    String(LAB.loadError || "").replace(/\s*\n\s*/g, " | "));

(function () {
    // Everything lives in this IIFE: on jsc a top-level `var` in the harness
    // is a GLOBAL and would silently overwrite a game global of the same name.
    if (!LAB.loaded) return;

    // Seed 1 is in the default Cave Test list on purpose: it is the world where
    // capped cave walls show through a hill (N13) -- the default run must see it.
    var CAVE_SEEDS = LAB.seeds([12345, 424242, 1, 777]);
    var ENDLESS_SEEDS = LAB.seeds([424242, 777000], "endless-seeds");
    var OUT_CORE_PRESENT = CAVE_SEEDS.some(function (s) { return s === 12345 || s === 424242; });

    // ── helpers ──────────────────────────────────────────────────────────────
    var fx = LAB.fx;
    function f0(x) { return LAB.fx(x, 0); }
    function n(o, k) { return (o && o[k]) || 0; }
    function emit(id, list) {
        var ok = list.length > 0 && list.every(function (r) { return r.ok; });
        LAB.check(id, ok, list.length ? list.map(function (r) { return (r.ok ? "ok " : "BAD ") + r.d; }).join(" | ")
                                      : "nothing was measured -- PRECONDITION FAILED");
    }

    // Record one draw pass the way draw() would run it (camera prepared,
    // pitch level), with the game's DEBUG_POLY_TYPES palette switched on.
    function recordPass(fn, opts) {
        cam.pitch = 0;
        LAB.prepCamera();
        DEBUG_POLY_TYPES = true;
        try { return LAB.record(fn, opts); } finally { DEBUG_POLY_TYPES = false; }
    }
    // Floor-pass cave quads. Cave cells fade their RGB toward black with
    // distance (12866-12868) while surface cells fade alpha, so far cave floor
    // lands in polyClass "black"/"other" instead of "caveFloor". Surface, cap
    // and tilted quads keep their hue; nothing else in this pass goes dark.
    function caveQuads(rec) { return n(rec.byClass, "caveFloor") + n(rec.byClass, "black") + n(rec.byClass, "other"); }

    // Stand the player at (along, perp) of entrance E on a layer, let two real
    // physics ticks run (updateDayNight classifies the spot -> playerUnderground,
    // 19342-19360), then face INTO the cave (or along `ang`).
    function stand(E, along, perp, layer, ang) {
        var p = LAB.axisWorld(E, along, perp);
        LAB.placeWorld(p.x, p.y, layer);
        LAB.tick(2);
        cam.ang = (ang === undefined) ? E.angle : ang;
        cam.pitch = 0;
        var ls = LAB.layersAt(pos.x, pos.y);
        var w = LAB.worldPos();
        return { along: LAB.alongOf(E), perp: LAB.perpOf(E), h: LAB.h(), ls: ls, ug: playerUnderground,
                 wx: w.x, wy: w.y, low: LAB.lowestWalkable(ls), top: LAB.topWalkable(ls), ceil: LAB.ceilingOf(ls), cap: LAB.capOf(ls) };
    }
    function where(s) {
        return "along=" + f0(s.along) + " perp=" + f0(s.perp) + " world=(" + f0(s.wx) + "," + f0(s.wy) + ") h=" + fx(s.h) +
            " ug=" + (s.ug ? 1 : 0) + " cell=[" + LAB.fmtLayers(s.ls) + "]";
    }

    // PRECONDITION evidence: mesh cells inside the camera's horizontal view
    // cone (cam.fov, 937) and within viewDist that satisfy pred(layers).
    function viewCells(pred) {
        var m = floorMesh, gs = m.gridSize;
        var ca = Math.cos(cam.ang), sa = Math.sin(cam.ang), th = Math.tan(cam.fov / 2);
        var r = Math.ceil(viewDist / gs), cx = Math.floor(cam.x / gs), cy = Math.floor(cam.y / gs), cnt = 0;
        var vd2 = viewDist * viewDist;
        for (var gy = Math.max(0, cy - r); gy <= Math.min(m.h - 1, cy + r); gy++) {
            for (var gx = Math.max(0, cx - r); gx <= Math.min(m.w - 1, cx + r); gx++) {
                var dx = (gx + 0.5) * gs - cam.x, dy = (gy + 0.5) * gs - cam.y;
                if (dx * dx + dy * dy > vd2) continue;
                var fw = dx * ca + dy * sa;
                if (fw < gs) continue;
                if (Math.abs(-dx * sa + dy * ca) > fw * th) continue;
                if (pred(LAB.layers(gy * m.w + gx),
                         (gx + 0.5) * gs + windowOriginX,
                         (gy + 0.5) * gs + windowOriginY)) cnt++;
            }
        }
        return cnt;
    }
    // A cave floor with rock over it: lowest walkable < ceiling < cap.
    function isCappedCaveFloor(ls) {
        var lo = LAB.lowestWalkable(ls), c = LAB.ceilingOf(ls), p = LAB.capOf(ls);
        return !!(lo && c && p && lo.t === 1 && lo.z < c.z && c.z < p.z);
    }
    // A buried (capped) ceiling above an eye standing at h.
    function cappedCeilingAbove(h) {
        return function (ls) { var c = LAB.ceilingOf(ls); return !!(c && LAB.capOf(ls) && c.z > h + LAB.EYE_H); };
    }

    // Open cave cells -- a ceiling layer but NO cap over it (the pit at every
    // arch, 6647/6680) -- are holes to the sky: seeing their floor from the
    // surface is legitimate (Cave Test seed 777 sees the other entrance's pit
    // 690 u away), and their few ceiling quads are not the buried tunnel
    // ceiling. To measure only the BURIED tunnel, those cells are hidden
    // (layerCount 0) for the duration of fn, then restored. Returns fn(hidden).
    function withOpenCaveCellsHidden(fn) {
        var m = floorMesh, saved = [], N = m.w * m.h;
        for (var i = 0; i < N; i++) {
            var ls = LAB.layers(i);
            if (LAB.ceilingOf(ls) && !LAB.capOf(ls)) { saved.push(i, m.layerCount[i]); m.layerCount[i] = 0; }
        }
        try { return fn(saved.length / 2); } finally { for (var j = 0; j < saved.length; j += 2) m.layerCount[saved[j]] = saved[j + 1]; }
    }

    // Walls: side faces fill with a gradient, whose colour stops the shared
    // recorder cannot see. Only count fills here, never classify them.
    // Keep only CAPPED wall cells (wallCapZ > -Infinity: rock above them,
    // 6944-6957) in the grid for the duration of fn, then restore.
    function withOnlyCappedWalls(fn) {
        var saved = Array.prototype.slice.call(grid), keep = 0;
        for (var i = 0; i < grid.length; i++) if (grid[i]) { if (wallCapZ[i] > -Infinity) keep++; else grid[i] = 0; }
        try { return fn(keep); } finally { for (var j = 0; j < grid.length; j++) grid[j] = saved[j]; }
    }

    // Where the roof over this tunnel ends, on the entrance axis: scan OUTWARD
    // from along=-60 (inside the tunnel) in 3 u steps and return the last along
    // whose cell still carries a roof layer (ceiling 2 or cap 4). Scanning from
    // inside follows the roof run that is contiguous with the tunnel; a scan
    // from outside latches onto any stray roof cell further out (under a D2
    // geometry fix, 777e1 grows a disjoint run at +465..+531). This is where
    // the ramp and walk scenarios stand, not a verdict: the roof-start
    // distance itself is caves_geometry's check (D2).
    function roofEdge(E) {
        function roofed(a) {
            var p = LAB.axisWorld(E, a, 0), lp = LAB.toLocal(p.x, p.y), ls = LAB.layersAt(lp.x, lp.y);
            return !!(LAB.ceilingOf(ls) || LAB.capOf(ls));
        }
        if (!roofed(-60)) return null;
        for (var a = -57; a <= 900; a += 3) if (!roofed(a)) return a - 3;
        return null;
    }

    // The arch drawCaveEntrance3D draws for entrance E: the deepCaveEntrances
    // entry with E's angle that stands on E's axis (|perp| < 5, along -60..600).
    // Matched by axis, not by exact position, so a fix that MOVES the arch to
    // the roof is still found.
    function archFor(E) {
        var best = null;
        for (var i = 0; i < deepCaveEntrances.length; i++) {
            var d = deepCaveEntrances[i], wx = d.x + windowOriginX, wy = d.y + windowOriginY;
            var al = (wx - E.x) * E.outX + (wy - E.y) * E.outY, pp = (wx - E.x) * (-E.outY) + (wy - E.y) * E.outX;
            var da = Math.abs(Math.atan2(Math.sin((d.angle || 0) - E.angle), Math.cos((d.angle || 0) - E.angle)));
            if (da < 0.01 && Math.abs(pp) < 5 && al >= -60 && al <= 600 && (!best || Math.abs(al) < Math.abs(best.along))) best = { d: d, along: al };
        }
        return best;
    }
    // drawCaveEntrance3D draws EVERY arch within 900 u in front of the camera
    // (16531-16539); restrict it to one so another entrance cannot earn a pass.
    function withOnlyArch(d, fn) {
        var all = deepCaveEntrances;
        deepCaveEntrances = [d];
        try { return fn(); } finally { deepCaveEntrances = all; }
    }

    // ── scenario 1: cave views (Cave Test) ───────────────────────────────────
    LAB.scenario("render: cave views", function () {
        var R = { inCeil: [], inOver: [], inFloor: [], out: [], ramp: [], arch: [], above: [], walls: [], archSeen: [] };
        CAVE_SEEDS.forEach(function (seed) {
            LAB.freshPage();
            LAB.seedRandom(seed);
            LAB.startCaveTest(seed);
            LAB.releasePad();
            LAB.freezeDay(0.5);
            var ents = LAB.entrances();
            if (!ents.length) {
                var msg = "s" + seed + ": NO cave entrance generated -- PRECONDITION FAILED";
                Object.keys(R).forEach(function (k) { R[k].push({ ok: false, d: msg }); });
                return;
            }
            ents.forEach(function (E, ei) {
                var tag = "s" + seed + "e" + ei;
                var mk = "render." + tag + ".";
                var rs = roofEdge(E);
                LAB.metric(mk + "roof_edge_along", rs === null ? "none" : rs);

                // (a) inside the tunnel: cave floor at along=-150, facing further in.
                var s = stand(E, -150, 0, "bottom");
                var onFloor = !!(s.low && Math.abs(s.h - s.low.z) < 0.05 && s.ceil && s.ceil.z > s.h + LAB.EYE_H);
                var nCeilView = viewCells(cappedCeilingAbove(s.h));
                var nCaveIn = viewCells(isCappedCaveFloor);
                var rcAll = recordPass(drawLayersCeiling3D);
                var stitched = __caveStats.ceilCollected;
                var rc = withOpenCaveCellsHidden(function () { return recordPass(drawLayersCeiling3D); });
                var rf = recordPass(drawLayersFloor3D);
                LAB.metric(mk + "inside.ceiling", rc.fills.length);
                LAB.metric(mk + "inside.floor", rf.byClass);
                LAB.metric(mk + "inside.floor_overhead", rf.overheadByClass);
                var preIn = onFloor && nCeilView >= 50;
                var inWhere = tag + " " + where(s);
                var PRE_IN = " PRECONDITION FAILED (not on the cave floor under a ceiling above eye height, or <50 capped ceiling cells in view)";
                // 25%: the pass draws one quad per stitched cell; a quarter of the
                // capped ceiling cells in the view cone leaves room for cells a
                // correct pass drops (screen clipping, unstitched edges) and still
                // rejects a pass that draws only the few nearest (P7: 2-4 quads).
                R.inCeil.push({ ok: preIn && rc.fills.length >= 0.25 * nCeilView,
                    d: inWhere + " buriedCeilingQuads=" + rc.fills.length + " of cappedCeilingCellsInView=" + nCeilView +
                       " (with pits: " + rcAll.fills.length + ") stitched=" + stitched + (preIn ? "" : PRE_IN) });
                // Sloped surface TOPS may legitimately project above the
                // horizon. Flat cap undersides may not. Triangle-facing and
                // partial terrain occlusion have dedicated shipping tests.
                var over = n(rf.overheadByClass, "cap");
                R.inOver.push({ ok: preIn && rf.fills.length > 0 && over === 0,
                    d: inWhere + " overheadCap=" + n(rf.overheadByClass, "cap") + " overheadSurface=" + n(rf.overheadByClass, "surface") +
                       " floorFills=" + rf.fills.length + (preIn && rf.fills.length > 0 ? "" : PRE_IN) });
                var preF = onFloor && nCaveIn >= 50;
                R.inFloor.push({ ok: preF && caveQuads(rf) >= 0.25 * nCaveIn,
                    d: inWhere + " caveFloorQuads=" + caveQuads(rf) + " of cappedCaveFloorCellsInView=" + nCaveIn +
                       (preF ? "" : " PRECONDITION FAILED (not on the cave floor, or <50 capped cave cells in view)") });

                // (a2) inside the tunnel at along=-60, facing back OUT of the cave.
                var so = stand(E, -150, 0, "bottom", E.angle + Math.PI);
                var onFloorO = !!(so.low && Math.abs(so.h - so.low.z) < 0.05 && so.ceil && so.ceil.z > so.h + LAB.EYE_H);
                var nCeilO = viewCells(cappedCeilingAbove(so.h));
                // The open approach must exist in the view cone so this really
                // is an outward view.  Surface-below-horizon remains diagnostic:
                // at this deep camera the prescribed 12345/424242 views have
                // hundreds of approach cells in-cone but project none wholly
                // below the horizon, even with both D5 mutations.  The browser
                // suite owns positive pixel visibility of the approach.
                var nOpenO = viewCells(function (ls, wx, wy) {
                    var dx = wx - E.x, dy = wy - E.y;
                    var al = dx * E.outX + dy * E.outY;
                    var pp = dx * (-E.outY) + dy * E.outX;
                    var top = LAB.topWalkable(ls);
                    return al >= 0 && al <= 520 && Math.abs(pp) <= 180 &&
                        !LAB.ceilingOf(ls) && !LAB.capOf(ls) && !!top && top.t === 1;
                });
                var rcO = withOpenCaveCellsHidden(function () { return recordPass(drawLayersCeiling3D); });
                var rfO = recordPass(drawLayersFloor3D);
                var overO = n(rfO.overheadByClass, "cap") + n(rfO.overheadByClass, "surface");
                var surfaceBelowAnyO = rfO.fills.filter(function (f) {
                    if (LAB.polyClass(f.style) !== "surface" || f.pts.length < 6) return false;
                    for (var q = 1; q < f.pts.length; q += 2) if (f.pts[q] < rfO.horizon) return false;
                    return true;
                }).length;
                var surfaceBelowO = rfO.fills.filter(function (f) {
                    if (LAB.polyClass(f.style) !== "surface" || !(f.alpha > 0) || f.pts.length < 6) return false;
                    for (var q = 1; q < f.pts.length; q += 2) if (f.pts[q] < rfO.horizon) return false;
                    return true;
                }).length;
                LAB.metric(mk + "out.floor_overhead", rfO.overheadByClass);
                LAB.metric(mk + "out.open_ground_cells", nOpenO);
                LAB.metric(mk + "out.surface_below_horizon_any_alpha", surfaceBelowAnyO);
                LAB.metric(mk + "out.surface_below_horizon", surfaceBelowO);
                var preO = onFloorO && nCeilO >= 50 && nOpenO >= 50;
                // Prefer the critic-prescribed 12345/424242 samples whenever
                // either is present.  A replacement --seeds sweep may omit
                // both; then use every supplemental entrance that satisfies
                // the same >=50-cell precondition (and skip only invalid extra
                // entrances such as s777e1's 31-cell view).  An all-invalid
                // sweep still leaves R.out empty and fails loudly.
                var coreOut = seed === 12345 || seed === 424242;
                if ((OUT_CORE_PRESENT && coreOut) || (!OUT_CORE_PRESENT && preO)) {
                    R.out.push({ ok: preO && rcO.fills.length > 0 && surfaceBelowO > 0,
                        d: tag + " " + where(so) + " buriedCeilingQuads=" + rcO.fills.length + " of cappedCeilingCellsInView=" + nCeilO +
                           " overheadCap=" + n(rfO.overheadByClass, "cap") + " overheadSurface=" + n(rfO.overheadByClass, "surface") +
                           " openGroundCellsInView=" + nOpenO + " surfaceQuadsBelowHorizon=" + surfaceBelowO +
                           " (anyAlpha=" + surfaceBelowAnyO + ")" +
                           (preO ? "" : " PRECONDITION FAILED (not on the cave floor, or <50 capped ceiling/open-ground cells in view)") });
                }

                // (b) on the open approach ramp, 24 u outside the roof's edge.
                if (rs === null) {
                    R.ramp.push({ ok: false, d: tag + " no roof over the tunnel at along=-60 -- PRECONDITION FAILED" });
                    R.archSeen.push({ ok: false, d: tag + " no roof over the tunnel at along=-60 -- PRECONDITION FAILED" });
                } else {
                    s = stand(E, rs + 24, 0, "bottom");
                    var openSky = !s.ceil && !s.cap && !!s.low && Math.abs(s.h - s.low.z) < 0.05;
                    var nCave = viewCells(isCappedCaveFloor);
                    rf = recordPass(drawLayersFloor3D);
                    var rfB0 = withOpenCaveCellsHidden(function () { return recordPass(drawLayersFloor3D); });
                    LAB.metric(mk + "ramp.floor", rf.byClass);
                    var preR = openSky && nCave >= 50;
                    R.ramp.push({ ok: preR && caveQuads(rfB0) > 50,
                        d: tag + " roofEdge=+" + rs + " " + where(s) + " cappedCaveCellsInView=" + nCave + " buriedCaveFloorQuads=" + caveQuads(rfB0) +
                           " (all caveFloorQuads=" + caveQuads(rf) + ")" +
                           (preR ? "" : " PRECONDITION FAILED (not on open ground below open sky, or <50 cave cells in view)") });
                    // Looked up AFTER standing: placeWorld may re-centre the window,
                    // which rebuilds deepCaveEntrances in new local coordinates.
                    // Close to a wider natural portal, both jambs can be outside
                    // the viewport. Back up enough to test visible architecture.
                    s = stand(E, Math.max(rs + 24, 160), 0, "bottom");
                    var arch = archFor(E);
                    if (!arch) {
                        R.archSeen.push({ ok: false, d: tag + " no deepCaveEntrances arch on this entrance's axis -- PRECONDITION FAILED" });
                    } else {
                        recordPass(drawWalls3D);             // fills depthBuffer exactly as a frame would before the arch pass
                        var ra = withOnlyArch(arch.d, function () { return recordPass(drawCaveEntrance3D); });
                        LAB.metric(mk + "ramp.arch_fills", ra.fills.length);
                        R.archSeen.push({ ok: openSky && ra.fills.length > 0,
                            d: tag + " arch at along=" + f0(arch.along) + " roofEdge=+" + rs + " " + where(s) + " archFills=" + ra.fills.length +
                               (ra.fills.length ? "" : " (canSeePoint: " + (window.__lastSeeReason || "no reason recorded") + ")") +
                               (openSky ? "" : " PRECONDITION FAILED (not under open sky)") });
                    }
                }

                // (c) standing in the archway (the cap hole), facing into the tunnel.
                s = stand(E, 0, 0, "bottom");
                var inArch = !!(s.low && Math.abs(s.h - s.low.z) < 0.05);
                var nCaveA = viewCells(isCappedCaveFloor);
                rf = recordPass(drawLayersFloor3D);
                var rfA0 = withOpenCaveCellsHidden(function () { return recordPass(drawLayersFloor3D); });
                LAB.metric(mk + "arch.floor", rf.byClass);
                var preA = inArch && nCaveA >= 50;
                R.arch.push({ ok: preA && caveQuads(rfA0) > 50,
                    d: tag + " " + where(s) + " cappedCaveCellsInView=" + nCaveA + " buriedCaveFloorQuads=" + caveQuads(rfA0) +
                       " (all caveFloorQuads=" + caveQuads(rf) + ")" + (preA ? "" : " PRECONDITION FAILED") });

                // (d) A submitted buried polygon is not evidence of bleed:
                // later opaque surfaces can cover it. Test an on-screen buried
                // target against the composed production terrain depth instead.
                var ab = null;
                [0, 24, -24, 48, -48, 72, -72, 100, -100].forEach(function (pp) {
                    if (ab) return;
                    var t = stand(E, -150, pp, "top");
                    if (t.top && t.top.t === 4 && Math.abs(t.h - t.top.z) < 0.05 && isCappedCaveFloor(t.ls)) ab = t;
                });
                if (!ab) {
                    R.above.push({ok:false, d:tag + " no cap-over-tunnel site -- PRECONDITION FAILED"});
                } else {
                    LAB.prepCamera();
                    var m = floorMesh, target = null, best = Infinity;
                    for (var bi = 0; bi < m.layerCount.length; bi++) {
                        var ls = LAB.layers(bi);
                        if (!isCappedCaveFloor(ls)) continue;
                        var tx = (bi % m.w + 0.5) * m.gridSize, ty = (Math.floor(bi / m.w) + 0.5) * m.gridSize;
                        var dist = Math.hypot(tx - cam.x, ty - cam.y), tz = LAB.lowestWalkable(ls).z * 25 + 20;
                        var pitch = (getCam3D().cameraZ - tz) / dist;
                        if (dist < 180 || dist > 500 || Math.abs(pitch) > CAM_PITCH_MAX) continue;
                        if (Math.abs(dist - 250) < best) {
                            best = Math.abs(dist - 250); target = {x:tx, y:ty, z:tz, pitch:pitch, dist:dist};
                        }
                    }
                    if (!target) {
                        R.above.push({ok:false, d:tag + " no on-screen buried target -- PRECONDITION FAILED"});
                    } else {
                        cam.ang = Math.atan2(target.y - cam.y, target.x - cam.x); cam.pitch = target.pitch;
                        LAB.prepCamera();
                        var sp = projToScreen(target.x, target.y, target.z, getCam3D());
                        var onScreen = sp && sp.sx > 4 && sp.sx < canvas.width - 4 && sp.sy > 4 && sp.sy < canvas.height - 4;
                        var patch = onScreen ? {x:sp.sx-2, y:sp.sy-2, width:4, height:4} : null;
                        var exposed = patch ? withSceneDepthBillboard(patch, sp.fwd, function () {}) : 0;
                        drawLayersCeiling3D(); drawLayersFloor3D(); drawWalls3D();
                        var buried = patch ? withSceneDepthBillboard(patch, sp.fwd, function () {}) : -1;
                        var preB = onScreen && exposed > 0;
                        R.above.push({ok:preB && buried === 0,
                            d:tag + " " + where(ab) + " target distance=" + fx(target.dist) +
                            " exposedPixels=" + exposed + " buriedPixels=" + buried +
                            (preB ? "" : " PRECONDITION FAILED (target not visible without terrain)")});
                    }
                }

                // The same arch from 200 u outside the entrance point, both layers there.
                ["top", "bottom"].forEach(function (ly) {
                    var s2 = stand(E, 200, 0, ly), arch2 = archFor(E);
                    if (!arch2) return;
                    recordPass(drawWalls3D);
                    var ra2 = withOnlyArch(arch2.d, function () { return recordPass(drawCaveEntrance3D); });
                    LAB.metric(mk + "arch_fills_from_200_" + ly, ra2.fills.length);
                    LAB.note(tag + " arch from along=+200 on " + ly + " layer: " + ra2.fills.length + " fills; " + where(s2) +
                        (ra2.fills.length ? "" : " hidden by canSeePoint: " + (window.__lastSeeReason || "?")));
                });
            });

            // (f) capped (buried) cave walls, seen from the cap above them.
            // Find a spot on a cap over a tunnel where, standing on the tunnel
            // floor below, the capped walls ARE drawn (proves they are in view
            // and the recorder sees them); then stand on the cap at that spot.
            var E0 = ents[0], capped = [];
            for (var gy = 0; gy < gridH; gy++) for (var gx = 0; gx < gridW; gx++) {
                var ci = gy * gridW + gx;
                if (grid[ci] && wallCapZ[ci] > -Infinity) {
                    var wxx = (gx + 0.5) * cell + windowOriginX, wyy = (gy + 0.5) * cell + windowOriginY;
                    capped.push({ i: ci, x: wxx, y: wyy, d: Math.hypot(wxx - E0.x, wyy - E0.y) });
                }
            }
            capped.sort(function (a, b) { return a.d - b.d || a.i - b.i; });
            var spot = null, tried = 0;
            for (var k = 0; k < capped.length && !spot && tried < 40; k += 5) {
                for (var rr = 60; rr <= 120 && !spot; rr += 30) for (var q = 0; q < 16 && !spot; q++) {
                    var an = q * Math.PI / 8, sx = capped[k].x + rr * Math.cos(an), sy = capped[k].y + rr * Math.sin(an);
                    var lp = LAB.toLocal(sx, sy), ls = LAB.layersAt(lp.x, lp.y);
                    var gi = Math.floor(lp.y / cell) * gridW + Math.floor(lp.x / cell);
                    // A real tunnel spot: capped cave floor with standing headroom under the ceiling.
                    if (!isCappedCaveFloor(ls) || grid[gi] || LAB.ceilingOf(ls).z < LAB.lowestWalkable(ls).z + LAB.EYE_H) continue;
                    tried++;
                    var face = Math.atan2(capped[k].y - sy, capped[k].x - sx);
                    LAB.placeWorld(sx, sy, "bottom"); LAB.tick(2); cam.ang = face; cam.pitch = 0;
                    var lo = LAB.lowestWalkable(ls), hb = LAB.h(), ugb = playerUnderground;
                    var nb = withOnlyCappedWalls(function () { return recordPass(drawWalls3D).fills.length; });
                    if (nb > 0 && lo && Math.abs(hb - lo.z) < 0.05)
                        spot = { x: sx, y: sy, ang: face, below: nb, hb: hb, ugb: ugb, ls: LAB.fmtLayers(ls), wall: capped[k] };
                }
            }
            if (!spot) {
                R.walls.push({ ok: false, d: "s" + seed + " cappedWallCells=" + capped.length + " triedSpots=" + tried +
                    " -- PRECONDITION FAILED: no spot where capped walls are drawn from the tunnel floor below" });
            } else {
                LAB.placeWorld(spot.x, spot.y, "top"); LAB.tick(2); cam.ang = spot.ang; cam.pitch = 0;
                var lsT = LAB.layersAt(pos.x, pos.y), topT = LAB.topWalkable(lsT);
                var onCap = !!(topT && topT.t === 4 && Math.abs(LAB.h() - topT.z) < 0.05);
                var nt = withOnlyCappedWalls(function (keep) { return { fills: recordPass(drawWalls3D).fills.length, keep: keep }; });
                var nAll = recordPass(drawWalls3D).fills.length;
                LAB.metric("render.s" + seed + ".capped_walls.from_below", spot.below);
                LAB.metric("render.s" + seed + ".capped_walls.from_cap", nt.fills);
                R.walls.push({ ok: onCap && nt.fills === 0,
                    d: "s" + seed + " spot world=(" + f0(spot.x) + "," + f0(spot.y) + ") cell=[" + spot.ls + "] facing wall (" + f0(spot.wall.x) + "," + f0(spot.wall.y) +
                       ") cappedWallCells=" + nt.keep + " fillsFromTunnelFloor(h=" + fx(spot.hb) + ",ug=" + (spot.ugb ? 1 : 0) + ")=" + spot.below +
                       " fillsFromCap(h=" + fx(LAB.h()) + ",ug=" + (playerUnderground ? 1 : 0) + ")=" + nt.fills + " allWallFillsFromCap=" + nAll +
                       (onCap ? "" : " PRECONDITION FAILED (not standing on the cap)") });
            }
        });

        emit("render: inside the tunnel the ceiling pass draws the tunnel ceiling", R.inCeil);
        emit("render: inside the tunnel the floor pass draws no cap undersides overhead", R.inOver);
        emit("render: inside the tunnel the floor pass draws the tunnel floor", R.inFloor);
        emit("render: looking back out from inside the tunnel draws its ceiling and open ground", R.out);
        emit("render: from the open approach ramp the cave floor ahead is drawn", R.ramp);
        emit("render: standing in the archway the tunnel floor ahead is drawn", R.arch);
        emit("render: composed terrain hides a buried target from a camera on the cap", R.above);
        emit("render: a camera on the cap above the cave draws no buried cave walls", R.walls);
        emit("render: the archway is drawn to a player on the open approach ramp", R.archSeen);
    });

    // ── scenario 2: the rock drawn above cave walls meets the cave ceiling ───
    // renderFace extends dark rock from a wall's top up to caveCeilAt()
    // (11991-12010) while the player is underground. The contract: that rock
    // follows the ceiling beside the wall -- move the ceiling and the rock
    // moves. Measured differentially on the game's own drawWalls3D: the
    // ceiling layers caveCeilAt reads (l1/l2 type 2, 12124-12128) are lowered
    // by 0.5 h for one recording and restored. getFloorHeightAt reads l0 only
    // (7816) and the wall clamps are precomputed, so nothing else in the pass
    // sees the fixture. The extension quads are the only fills in
    // '#150c05' / '#1a0f06' (12001).
    LAB.scenario("render: cave wall rock", function () {
        var res = [];
        function extSig(rec) {
            // Materials now shade the closure dynamically. Compare geometry,
            // not the two historical hard-coded brown fill colours.
            var ext = rec.fills;
            return { n: ext.length, sig: ext.map(function (f) { return f.pts.map(function (v) { return Math.round(v * 4); }).join(","); }).sort().join(";") };
        }
        function withCeilings(fz, fn) {
            var m = floorMesh, N = m.w * m.h, s1 = [], s2 = [];
            for (var i = 0; i < N; i++) {
                if (m.layerCount[i] >= 2 && m.l1Type[i] === 2) { s1.push(i, m.l1TopZ[i]); m.l1TopZ[i] = fz(m.l1TopZ[i]); }
                if (m.layerCount[i] >= 3 && m.l2Type[i] === 2) { s2.push(i, m.l2TopZ[i]); m.l2TopZ[i] = fz(m.l2TopZ[i]); }
            }
            _floorCacheTick = (_floorCacheTick + 1) | 0;
            try { return fn(); }
            finally {
                for (var j = 0; j < s1.length; j += 2) m.l1TopZ[s1[j]] = s1[j + 1];
                for (var k = 0; k < s2.length; k += 2) m.l2TopZ[s2[k]] = s2[k + 1];
                _floorCacheTick = (_floorCacheTick + 1) | 0;
            }
        }
        // Make the wall top sit below the tunnel ceiling.  Most generated cave
        // walls are already taller than the floor-to-ceiling gap, in which case
        // renderFace quite correctly has no wall-to-ceiling extension to draw
        // and caveCeilAt cannot affect its output.  This reversible geometry
        // fixture isolates the extension path without replacing the draw pass.
        function withShortWalls(fn) {
            var saved = new Float32Array(wallHeights.length);
            for (var i = 0; i < wallHeights.length; i++) {
                saved[i] = wallHeights[i];
                if (grid[i]) wallHeights[i] = 0.05;
            }
            try { return fn(); }
            finally { for (var j = 0; j < wallHeights.length; j++) wallHeights[j] = saved[j]; }
        }
        // The critic's D8 design names seed 12345 specifically.  Keeping this
        // causal fixture to one fixed world also prevents unrelated seed
        // geometry from turning a focused renderer check into a seed census.
        [12345].forEach(function (seed) {
            LAB.freshPage();
            LAB.seedRandom(seed);
            LAB.startCaveTest(seed);
            LAB.releasePad();
            LAB.freezeDay(0.5);
            var view = null;
            LAB.entrances().forEach(function (E, ei) {
                [-60, -150].forEach(function (a) {
                    [0, Math.PI / 2, -Math.PI / 2, Math.PI].forEach(function (da) {
                        if (view) return;
                        var s = stand(E, a, 0, "bottom", E.angle + da);
                        if (!s.ug || !s.ceil || !s.low || Math.abs(s.h - s.low.z) > 0.05) return;
                        var A = withShortWalls(function () { return extSig(recordPass(drawWalls3D)); });
                        if (A.n >= 3) view = { tag: "s" + seed + "e" + ei + " heading=" + fx(da) + " " + where(s), A: A };
                    });
                });
            });
            if (!view) { LAB.note("s" + seed + " cave wall rock: no underground view with >=3 wall-top rock quads (seed skipped)"); return; }
            var B = withCeilings(function (z) { return z - 0.5; }, function () {
                return withShortWalls(function () { return extSig(recordPass(drawWalls3D)); });
            });
            var C = withCeilings(function () { return 5.0; }, function () {
                return withShortWalls(function () { return extSig(recordPass(drawWalls3D)); });
            });
            var reads = C.sig !== view.A.sig;       // the pass does read the ceiling layers the fixture moves
            LAB.metric("render.s" + seed + ".wall_rock_quads", view.A.n);
            res.push({ ok: reads && B.sig !== view.A.sig,
                d: view.tag + " shortWallFixture=0.05 rockQuads=" + view.A.n + " ceilings-0.5h: rockQuads=" + B.n + (B.sig === view.A.sig ? " IDENTICAL" : " moved") +
                   " ceilings@+5h: rockQuads=" + C.n + (reads ? " moved" : " IDENTICAL -- PRECONDITION FAILED (the pass never reads these ceilings)") });
        });
        emit("render: the rock drawn above a cave wall follows the cave ceiling beside it", res);
    });

    // ── scenario 3: a real frame loop into the cave and back out ─────────────
    LAB.scenario("render: frame loop cave walk", function () {
        var errs = [], bal = [];
        CAVE_SEEDS.forEach(function (seed) {
            LAB.freshPage();
            LAB.seedRandom(seed);
            LAB.startCaveTest(seed);
            LAB.releasePad();
            LAB.freezeDay(0.5);
            var E = LAB.entrances()[0];
            var rs = E ? roofEdge(E) : null;
            if (!E || rs === null) {
                var m0 = "s" + seed + " no entrance/roof -- PRECONDITION FAILED";
                errs.push({ ok: false, d: m0 }); bal.push({ ok: false, d: m0 });
                return;
            }
            var st = LAB.axisWorld(E, rs + 30, 0);
            LAB.placeWorld(st.x, st.y, "bottom");
            LAB.tick(2);
            var mark = LAB.renderErrorMark(), ce0 = LAB.errorCount, sd0 = LAB.saveDepth(), t0 = LAB.realNow();
            var sv0 = LAB.ctxCounters.save, rs0 = LAB.ctxCounters.restore;
            var ugFrames = 0;
            function onTick(tr) { if (tr.ug) ugFrames++; }
            // LAB.walkTo with fps drives the REAL loop() (handleInput, fixed-step
            // gameUpdate, renderFrame with every draw pass, HUD, minimap).
            var tin = LAB.axisWorld(E, -150, 0);
            var fIn = LAB.walkTo(tin.x, tin.y, { fps: 60, maxTicks: 900, onTick: onTick }).length;
            var lsIn = LAB.layersAt(pos.x, pos.y), loIn = LAB.lowestWalkable(lsIn), ceIn = LAB.ceilingOf(lsIn);
            var reachedIn = LAB.alongOf(E) < -100 && !!loIn && Math.abs(LAB.h() - loIn.z) < 0.1 && !!ceIn && ceIn.z > LAB.h();
            var inDesc = "in: " + fIn + " frames to along=" + f0(LAB.alongOf(E)) + " h=" + fx(LAB.h()) + " cell=[" + LAB.fmtLayers(lsIn) + "]";
            var tout = LAB.axisWorld(E, rs + 60, 0);
            var fOut = LAB.walkTo(tout.x, tout.y, { fps: 60, maxTicks: 900, onTick: onTick }).length;
            var lsOut = LAB.layersAt(pos.x, pos.y);
            var reachedOut = LAB.alongOf(E) > rs && !LAB.ceilingOf(lsOut) && !LAB.capOf(lsOut);
            var outDesc = "out: " + fOut + " frames to along=" + f0(LAB.alongOf(E)) + " h=" + fx(LAB.h()) + " cell=[" + LAB.fmtLayers(lsOut) + "]";
            var re = LAB.renderErrorsSince(mark), ce = LAB.errorCount - ce0, sd = LAB.saveDepth() - sd0;
            var sv = LAB.ctxCounters.save - sv0, rsN = LAB.ctxCounters.restore - rs0;
            LAB.metric("render.s" + seed + ".walk.frames", fIn + fOut);
            LAB.metric("render.s" + seed + ".walk.underground_frames", ugFrames);
            LAB.metric("render.s" + seed + ".walk_ms", LAB.realNow() - t0, "ms");
            var pre = reachedIn && reachedOut && ugFrames >= 30;
            var d = "s" + seed + " " + inDesc + "; " + outDesc + "; undergroundFrames=" + ugFrames +
                (pre ? "" : " PRECONDITION FAILED (walk did not reach the tunnel floor and come back out)");
            errs.push({ ok: pre && re === 0 && ce === 0, d: d + " renderErrors+=" + re + " " + JSON.stringify(_ptErrors) + " consoleErrors+=" + ce });
            // saveDepth clamps at 0 (_game_env), so an extra restore() is only
            // visible in the call counts: require both to balance.
            bal.push({ ok: pre && sd === 0 && sv === rsN, d: d + " saveDepthDelta=" + sd + " save=" + sv + " restore=" + rsN });
        });
        emit("render: a real frame loop walking into the cave and back out raises no render errors", errs);
        emit("render: canvas save/restore stays balanced through the cave walk", bal);
    });

    // ── scenario 4: surface entities are visible (normal Endless) ────────────
    // Visibility is judged by the game's own draw functions (drawEnemies3D,
    // drawTreasureChests3D) with the entity list narrowed to the one entity
    // and depthBuffer null (no wall in the way): visible <=> it submits a fill
    // (every drawn enemy fills its shadow ellipse, 14064; every chest its glow,
    // 9195). The camera stands 60 u away facing the entity, eye at the
    // entity's ground. `cull=` in a detail is DIAGNOSIS ONLY: the same
    // entityVisible3D call with a stats object, to name the line that hid it.
    LAB.scenario("render: surface entity visibility", function () {
        var low = { tested: 0, hidden: [], pre: true, notes: [] }, high = { tested: 0, hidden: [], pre: true, notes: [] };
        var chests = { tested: 0, hidden: [], pre: true, notes: [] };
        function diag(wx, wy, wz, maxDist) {
            var st = { tooFar: 0, behind: 0, depthOccl: 0, belowFloor: 0, midOccl: 0 };
            var v = entityVisible3D(wx, wy, wz, getCam3D(), { maxDist: maxDist, depthOffset: 16, stats: st, skipDepth: true });
            if (v) return "none";
            if (st.belowFloor) return "belowFloor(508)";
            for (var k in st) if (st[k]) return k;
            return "surfaceUnderground(511)";
        }
        function faceFrom(x, y, k, gz) {
            var a = (k * 2.399963) % (2 * Math.PI);
            cam.x = x - 60 * Math.cos(a); cam.y = y - 60 * Math.sin(a); cam.ang = a; cam.pitch = 0;
            cam.z = 60 + 40 * gz;                  // eye at the entity's ground level
            depthBuffer = null;
            _floorCacheTick = (_floorCacheTick + 1) | 0;
        }
        ENDLESS_SEEDS.forEach(function (seed) {
            LAB.freshPage();
            LAB.startEndless(seed);
            LAB.releasePad();
            LAB.freezeDay(0.5);
            // 6 ticks = 100 ms: enemy AI (and floor tracking) runs at most every
            // 80 ms (11405), with lastUpdate seeded on the first tick, so this is
            // the first tick count at which every enemy in range has updated.
            LAB.tick(6);
            var pls = LAB.layersAt(pos.x, pos.y);
            var playerOnSurface = !playerUnderground && !LAB.ceilingOf(pls) && !LAB.capOf(pls);
            var caveCells = 0;
            for (var i = 0; i < floorMesh.w * floorMesh.h; i++) if (LAB.ceilingOf(LAB.layers(i))) caveCells++;
            var sav = { x: cam.x, y: cam.y, z: cam.z, ang: cam.ang, db: depthBuffer };
            LAB.prepCamera();                          // projScale for this canvas
            // Interest management freezes every enemy farther than 1.5 x viewDist
            // from the player (11346-11357). The player does not move here, so an
            // enemy that far is in a state no camera 60 u from it can co-occur
            // with in play: test only enemies inside that radius.
            var IM_R = viewDist * 1.5;
            var cntL = 0, cntH = 0, hidL = 0, hidH = 0, allE = enemies;
            try {
                allE.forEach(function (e, k) {
                    if (e.health !== undefined && e.health <= 0) return;
                    if (Math.hypot(e.x - pos.x, e.y - pos.y) > IM_R) return;
                    var ls = LAB.layersAt(e.x, e.y);
                    if (!ls.length || LAB.ceilingOf(ls) || LAB.capOf(ls)) return;   // surface enemies only
                    var g = LAB.topWalkable(ls), gz = g ? g.z : 0;
                    faceFrom(e.x, e.y, k, gz);
                    enemies = [e];
                    var rec = LAB.record(drawEnemies3D);
                    enemies = allE;
                    var bucket = gz < 0 ? low : high;
                    bucket.tested++;
                    if (gz < 0) cntL++; else cntH++;
                    if (!rec.fills.length) {
                        if (gz < 0) hidL++; else hidH++;
                        if (bucket.hidden.length < 6)
                            bucket.hidden.push("s" + seed + " e" + k + " world=(" + f0(e.x + windowOriginX) + "," + f0(e.y + windowOriginY) + ") ground h=" + fx(gz) +
                                " e.z=" + (e.z === undefined ? "undef" : fx(e.z)) + " cull=" + diag(e.x, e.y, e.z || 0, viewDist));
                    }
                });
            } finally { enemies = allE; }
            var cntC = 0, hidC = 0, allC = treasureChests;
            try {
                allC.forEach(function (ch, k) {
                    if (ch.collected) return;
                    var ls = LAB.layersAt(ch.x, ch.y);
                    if (!ls.length || LAB.ceilingOf(ls) || LAB.capOf(ls)) return;   // surface chests only
                    var g = LAB.topWalkable(ls), gz = g ? g.z : 0;
                    faceFrom(ch.x, ch.y, k, gz);
                    treasureChests = [ch];
                    var rec = LAB.record(drawTreasureChests3D);
                    treasureChests = allC;
                    chests.tested++; cntC++;
                    if (!rec.fills.length) {
                        hidC++;
                        if (chests.hidden.length < 8)
                            chests.hidden.push("s" + seed + " chest" + k + " world=(" + f0(ch.x + windowOriginX) + "," + f0(ch.y + windowOriginY) + ") ground h=" + fx(gz) +
                                " cull=" + diag(ch.x, ch.y, 0, viewDist * 0.7));
                    }
                });
            } finally { treasureChests = allC; }
            cam.x = sav.x; cam.y = sav.y; cam.z = sav.z; cam.ang = sav.ang; depthBuffer = sav.db;
            LAB.metric("render.endless" + seed + ".surface_enemies_low", cntL);
            LAB.metric("render.endless" + seed + ".surface_enemies_high", cntH);
            LAB.metric("render.endless" + seed + ".hidden_low", hidL);
            LAB.metric("render.endless" + seed + ".hidden_high", hidH);
            LAB.metric("render.endless" + seed + ".surface_chests", cntC);
            LAB.metric("render.endless" + seed + ".hidden_chests", hidC);
            var note = "s" + seed + " playerOnSurface=" + (playerOnSurface ? 1 : 0) + " caveCellsInWindow=" + caveCells;
            low.notes.push(note + " lowGround hidden " + hidL + "/" + cntL);
            high.notes.push(note + " highGround hidden " + hidH + "/" + cntH);
            chests.notes.push(note + " chests hidden " + hidC + "/" + cntC);
            if (!playerOnSurface) { low.pre = false; high.pre = false; chests.pre = false; }
        });
        [["render: surface enemies standing below h=0 are visible to a camera 60 u away facing them", low],
         ["render: surface enemies standing at or above h=0 are visible to a camera 60 u away facing them", high],
         ["render: surface treasure chests are visible to a camera 60 u away facing them", chests]].forEach(function (pair) {
            var b = pair[1];
            var pre = b.pre && b.tested >= 5;
            LAB.check(pair[0], pre && b.hidden.length === 0,
                b.notes.join(" | ") + (b.hidden.length ? " || hidden e.g.: " + b.hidden.join("; ") : "") +
                (pre ? "" : " || PRECONDITION FAILED (player not on the surface, or fewer than 5 tested: " + b.tested + ")"));
        });
    });

    // ── scenario 4b: other literal-wz entity consumers (normal Endless) ─────
    // Ore, the fixed-level exit marker and the market guard tower all pass a
    // literal world-Z of 0 to entityVisible3D.  Exercise their REAL draw passes
    // on open surface at low, ordinary and high terrain.  The relocated objects
    // are reversible draw fixtures only; spawning/lifetime belongs to the
    // persistence suite.  A wrapper observes the actual helper call/result so
    // this accepts either a call-site Z fix or a shared culling fix.
    LAB.scenario("render: literal-zero entity consumers", function () {
        var kinds = ["ore", "goal", "shop"], bands = ["low", "mid", "high"];
        var rows = { ore: [], goal: [], shop: [] };
        var good = { ore: true, goal: true, shop: true };
        var measuredWorlds = 0, ordinal = 0;

        function drawAt(kind, band, p, seed, ordinal0) {
            // prepCamera computes projection scale; do it BEFORE the camera
            // fixture because CAM_FOLLOW=true would otherwise move it to pos.
            LAB.prepCamera();
            var oldCam = { x: cam.x, y: cam.y, z: cam.z, ang: cam.ang, pitch: cam.pitch };
            var oldDepth = depthBuffer;
            var camera = null;
            for (var cq = 0; cq < 16 && !camera; cq++) {
                var ca = (ordinal0 * 2.399963 + cq * Math.PI / 8) % (2 * Math.PI);
                var cx = p.x - 60 * Math.cos(ca), cy = p.y - 60 * Math.sin(ca);
                var cls = LAB.layersAt(cx, cy), cg = LAB.topWalkable(cls);
                if (cg && cg.t === 1 && !LAB.ceilingOf(cls) && !LAB.capOf(cls))
                    camera = { x: cx, y: cy, h: cg.z, a: ca };
            }
            if (!camera) {
                rows[kind].push("s" + seed + " " + band + "(h=" + fx(p.h) + "): no open camera site 60u away PRECONDITION FAILED");
                return false;
            }
            cam.x = camera.x; cam.y = camera.y; cam.ang = camera.a; cam.pitch = 0;
            cam.z = 60 + 40 * camera.h;
            cam.pitch = (60 + 25 * camera.h - p.h * 25 - 10) / 60;
            depthBuffer = null;

            var realVisible = entityVisible3D, calls = [], rec = null, offRec = null;
            var oldOre = oreVeins, oldGoal = goal, oldGoalSpawned = goalSpawned;
            var oldShop = shopMarker, oldStalls = marketStalls;
            var wallFixture = null;
            entityVisible3D = function (wx, wy, wz, C, opts) {
                var result = realVisible.apply(this, arguments);
                if (kind === "ore" || (Math.abs(wx - p.x) < 0.01 && Math.abs(wy - p.y) < 0.01))
                    calls.push({ wz: wz, visible: !!result });
                return result;
            };
            try {
                if (kind === "ore") {
                    // Ore now attaches to a physical wall face. A floating ore
                    // record with no side/host is correctly rejected by production.
                    var gx = Math.floor(p.x / cell), gy = Math.floor(p.y / cell), ci = gy * gridW + gx;
                    wallFixture = {ci:ci, grid:grid[ci], height:wallHeights[ci], max:wallMaxTopZ[ci], base:wallFaceBase[ci*4]};
                    grid[ci] = 1; wallHeights[ci] = 0.25; wallMaxTopZ[ci] = Infinity;
                    wallFaceBase[ci*4] = p.h;
                    var attach = getWallDecorationAttachment({gridX:gx, gridY:gy,
                        worldX:gx*cell, worldY:(gy+0.5)*cell, side:'west', type:'ore'});
                    cam.x = gx*cell - 60; cam.y = (gy+0.5)*cell; cam.ang = 0;
                    cam.z = 60 + 40 * getFloorHeightAt(cam.x, cam.y);
                    cam.pitch = attach ? (60 + 25 * getFloorHeightAt(cam.x, cam.y) - attach.z) / 60 : 0;
                    oreVeins = [];
                    offRec = LAB.record(drawOreVeins, { fillRects: true });
                    oreVeins = [{ hp: 3, gx: gx, gy: gy, side: 'west', veinType: "gold" }];
                    rec = LAB.record(drawOreVeins, { fillRects: true });
                } else if (kind === "goal") {
                    goal = null; goalSpawned = false;
                    offRec = LAB.record(drawGoalMarker3D, { fillRects: true });
                    goal = { x: p.x - 16, y: p.y - 16, w: 32, h: 32 }; goalSpawned = true;
                    rec = LAB.record(drawGoalMarker3D, { fillRects: true });
                } else {
                    // The pass gates the tower on a non-empty stall list.  Keep
                    // that unrelated stall far away so only the tower is judged.
                    marketStalls = [{ x: -1000000, y: -1000000, facing: 0, stallType: "weapons" }];
                    shopMarker = null;
                    offRec = LAB.record(drawMarketStalls3D, { fillRects: true });
                    shopMarker = { x: p.x, y: p.y };
                    rec = LAB.record(drawMarketStalls3D, { fillRects: true });
                }
            } finally {
                entityVisible3D = realVisible;
                oreVeins = oldOre; goal = oldGoal; goalSpawned = oldGoalSpawned;
                shopMarker = oldShop; marketStalls = oldStalls;
                if (wallFixture) {
                    var wf = wallFixture; grid[wf.ci] = wf.grid; wallHeights[wf.ci] = wf.height;
                    wallMaxTopZ[wf.ci] = wf.max; wallFaceBase[wf.ci*4] = wf.base;
                }
                cam.x = oldCam.x; cam.y = oldCam.y; cam.z = oldCam.z;
                cam.ang = oldCam.ang; cam.pitch = oldCam.pitch; depthBuffer = oldDepth;
            }
            var fillsOff = offRec.fills.length + offRec.fillRects.length;
            var fills = rec.fills.length + rec.fillRects.length;
            var fillDelta = fills - fillsOff;
            var callOk = calls.length > 0, visible = callOk && calls.some(function (c) { return c.visible; });
            var wzs = calls.map(function (c) { return c.wz; }).join(",");
            LAB.metric("render.literal0.s" + seed + "." + kind + "." + band + ".calls", calls.length);
            LAB.metric("render.literal0.s" + seed + "." + kind + "." + band + ".fill_delta", fillDelta);
            rows[kind].push("s" + seed + " " + band + "(h=" + fx(p.h) + "): calls=" + calls.length +
                " wz=" + (wzs || "none") + " result=" + (visible ? "visible" : "null") +
                " cameraH=" + fx(camera.h) + " fills=" + fillsOff + "->" + fills);
            return callOk && visible && fillDelta > 0;
        }

        ENDLESS_SEEDS.forEach(function (seed) {
            LAB.freshPage();
            LAB.startEndless(seed);
            LAB.releasePad();
            LAB.freezeDay(0.5);
            LAB.tick(2);
            var sites = { low: null, mid: null, high: null };
            var m = floorMesh, margin = Math.ceil(100 / m.gridSize);
            for (var gy = margin; gy < m.h - margin; gy++) {
                for (var gx = margin; gx < m.w - margin; gx++) {
                    var ls = LAB.layers(gy * m.w + gx), g = LAB.topWalkable(ls);
                    if (!g || g.t !== 1 || LAB.ceilingOf(ls) || LAB.capOf(ls)) continue;
                    var band = g.z < -0.25 ? "low" : (g.z > 1.8 ? "high" : (g.z >= 0.1 && g.z <= 0.9 ? "mid" : null));
                    if (band && !sites[band]) sites[band] = { x: (gx + 0.5) * m.gridSize, y: (gy + 0.5) * m.gridSize, h: g.z };
                }
            }
            var pre = !playerUnderground && !!sites.low && !!sites.mid && !!sites.high;
            if (!pre) {
                kinds.forEach(function (kind) {
                    rows[kind].push("s" + seed + " surface/sites=" + (!playerUnderground ? 1 : 0) + "/" +
                        (!!sites.low ? 1 : 0) + (!!sites.mid ? 1 : 0) + (!!sites.high ? 1 : 0) + " PRECONDITION FAILED");
                    good[kind] = false;
                });
                return;
            }
            measuredWorlds++;
            kinds.forEach(function (kind) {
                bands.forEach(function (band) {
                    if (!drawAt(kind, band, sites[band], seed, ordinal++)) good[kind] = false;
                });
            });
        });

        var ids = {
            ore: "render: ore attached to a real wall remains visible at every terrain height",
            goal: "render: the exit goal remains visible on open surface at every terrain height",
            shop: "render: the shop tower remains visible on open surface at every terrain height"
        };
        kinds.forEach(function (kind) {
            LAB.check(ids[kind], measuredWorlds > 0 && good[kind],
                "measuredWorlds=" + measuredWorlds + " | " + rows[kind].join(" | ") +
                (measuredWorlds ? "" : " | PRECONDITION FAILED (no world had low/mid/high open ground)"));
        });
    });

    // ── scenario 5: buried enemies stay hidden from the surface ──────────────
    // The counterpart of the visibility checks above: whatever replaces the
    // L511 surface cull must still hide an enemy that has rock between it and
    // the camera. Cave Test with cave enemies on; the player stands on the cap
    // 60 u from an enemy on the tunnel floor, where the straight sight line
    // from the eye to the enemy's head runs through rock (PRECONDITION, read
    // from floorMesh: inside the ceiling..cap slab, or below solid ground);
    // walls are drawn first so depthBuffer is what a frame would hold.
    LAB.scenario("render: buried enemy visibility", function () {
        var tested = 0, hidden = 0, rows = [];
        function lsW(wx, wy) { var l = LAB.toLocal(wx, wy); return LAB.layersAt(l.x, l.y); }
        function throughRock(cw, eyeH, ew, headH) {
            var inRock = 0;
            for (var t = 0.05; t < 0.97; t += 0.05) {
                var x = cw.x + (ew.x - cw.x) * t, y = cw.y + (ew.y - cw.y) * t, z = eyeH + (headH - eyeH) * t;
                var ls = lsW(x, y), cap = LAB.capOf(ls), ce = LAB.ceilingOf(ls), top = LAB.topWalkable(ls);
                if (cap && ce && z < cap.z && z > ce.z) inRock++;
                else if (!ce && top && z < top.z) inRock++;
            }
            return inRock;
        }
        CAVE_SEEDS.forEach(function (seed) {
            LAB.freshPage();
            LAB.seedRandom(seed);
            LAB.startCaveTest(seed, { caveEnemies: true });
            LAB.releasePad();
            LAB.freezeDay(0.5);
            LAB.tick(1);
            var list = enemies.map(function (e) { return { wx: e.x + windowOriginX, wy: e.y + windowOriginY, z: e.z || 0 }; });
            var perSeed = 0, perHidden = 0, ex = [];
            list.forEach(function (en, k) {
                if (perSeed >= 6) return;
                var els = lsW(en.wx, en.wy), lo = LAB.lowestWalkable(els), cap = LAB.capOf(els);
                if (!lo || !cap || !isCappedCaveFloor(els) || Math.abs(en.z / 25 - lo.z) > 0.5) return;
                var spot = null;
                for (var q = 0; q < 16 && !spot; q++) {
                    var a = q * Math.PI / 8, cw = { x: en.wx - 60 * Math.cos(a), y: en.wy - 60 * Math.sin(a) };
                    var top = LAB.topWalkable(lsW(cw.x, cw.y));
                    if (!top || top.t !== 4) continue;
                    var rock = throughRock(cw, top.z + LAB.EYE_H, { x: en.wx, y: en.wy }, lo.z + LAB.EYE_H);
                    if (rock >= 2) spot = { cw: cw, rock: rock };
                }
                if (!spot) return;
                LAB.placeWorld(spot.cw.x, spot.cw.y, "top");
                LAB.tick(2);
                var best = null, bd = 1e9;
                enemies.forEach(function (e) { var dd = Math.hypot(e.x + windowOriginX - en.wx, e.y + windowOriginY - en.wy); if (dd < bd) { bd = dd; best = e; } });
                var top2 = LAB.topWalkable(LAB.layersAt(pos.x, pos.y));
                if (!best || bd > 20 || playerUnderground || !top2 || top2.t !== 4 || Math.abs(LAB.h() - top2.z) > 0.05) return;
                cam.ang = Math.atan2(best.y - pos.y, best.x - pos.x);
                recordPass(drawWalls3D);
                var allE = enemies, rec;
                enemies = [best];
                try { rec = recordPass(drawEnemies3D); } finally { enemies = allE; }
                perSeed++;
                if (!rec.fills.length) perHidden++;
                else if (ex.length < 3) ex.push("e" + k + " at h=" + fx(best.z / 25) + " DRAWN from the cap at h=" + fx(LAB.h()) + " (" + spot.rock + "/19 sight-line samples in rock)");
            });
            tested += perSeed; hidden += perHidden;
            rows.push("s" + seed + " hidden " + perHidden + "/" + perSeed + (ex.length ? " e.g. " + ex.join("; ") : ""));
        });
        var pre = tested >= 5;
        LAB.check("render: enemies on a capped tunnel floor stay hidden from a camera on the ground above", pre && hidden === tested,
            rows.join(" | ") + (pre ? "" : " || PRECONDITION FAILED (fewer than 5 buried enemies tested: " + tested + ")"));
    });

    // ── scenario 6: an enemy's walk cycle follows its own motion ─────────────
    // drawEnemies3D picks the sprite frame from skeletonFrames / wolfFrames
    // (14073-14078). Each drawImage is recorded through a wrapper around the
    // game's ctx and mapped back to (type, direction, frame) by identity.
    // Idle: a surface enemy that never moves, camera 60 u away, 8 draws 100 ms
    // apart -- it must hold one frame. Walking: the same enemy moved 1.5 u per
    // draw, camera 1.1 x its chaseRange away -- it must cycle (>= 3 frames).
    LAB.scenario("render: enemy walk cycle", function () {
        var res = [];
        function frameOf(img) {
            if (wolfFrames) for (var d = 0; d < wolfFrames.length; d++) for (var f = 0; f < (wolfFrames[d] || []).length; f++) if (wolfFrames[d][f] === img) return "wolf/" + d + "/" + f;
            for (var key in (skeletonFrames || {})) for (var d2 = 0; d2 < skeletonFrames[key].length; d2++)
                for (var f2 = 0; f2 < (skeletonFrames[key][d2] || []).length; f2++) if (skeletonFrames[key][d2][f2] === img) return key + "/" + d2 + "/" + f2;
            return null;
        }
        function drawSeries(e, n, step, camDist) {
            var out = [], real = ctx, allE = enemies, x0 = e.x, y0 = e.y;
            ctx = new Proxy({}, {
                get: function (t, k) {
                    if (k === "drawImage") return function (img) { var fo = frameOf(img); if (fo) out[out.length - 1].push(fo); return real.drawImage.apply(real, arguments); };
                    var v = real[k]; return (typeof v === "function") ? v.bind(real) : v;
                },
                set: function (t, k, v) { real[k] = v; return true; } });
            enemies = [e];
            try {
                for (var i = 0; i < n; i++) {
                    LAB.advance(100);
                    e.x += step;
                    var ls = LAB.layersAt(e.x, e.y), g = LAB.topWalkable(ls), a = 0.7;
                    cam.x = e.x - camDist * Math.cos(a); cam.y = e.y - camDist * Math.sin(a); cam.ang = a; cam.pitch = 0;
                    cam.z = 60 + 40 * (g ? g.z : 0);
                    depthBuffer = null;
                    _floorCacheTick = (_floorCacheTick + 1) | 0;
                    out.push([]);
                    drawEnemies3D();
                }
            } finally { ctx = real; enemies = allE; e.x = x0; e.y = y0; }
            return out;
        }
        ENDLESS_SEEDS.forEach(function (seed) {
            LAB.freshPage();
            LAB.startEndless(seed);
            LAB.releasePad();
            LAB.freezeDay(0.5);
            LAB.tick(6);
            LAB.prepCamera();
            // A surface enemy on ground 0.2..1.3 h: clear of both visibility
            // culls (508, 511) so every draw reaches the sprite code.
            var e = null;
            enemies.forEach(function (x) {
                if (e || (x.health !== undefined && x.health <= 0) || x.health < 0.25 * x.maxHealth) return;
                var ls = LAB.layersAt(x.x, x.y), g = LAB.topWalkable(ls);
                if (ls.length && !LAB.ceilingOf(ls) && !LAB.capOf(ls) && g && g.z >= 0.2 && g.z <= 1.3 && !x.damageFlash) e = x;
            });
            if (!e) { res.push({ ok: false, d: "s" + seed + " no surface enemy on ground 0.2..1.3 h -- PRECONDITION FAILED" }); return; }
            var sav = { x: cam.x, y: cam.y, z: cam.z, ang: cam.ang, db: depthBuffer, vx: e.vx, vy: e.vy };
            e.vx = 0; e.vy = 0;
            var idle = drawSeries(e, 8, 0, 60);
            var walk = drawSeries(e, 8, 1.5, e.enemyType.chaseRange * 1.1);
            e.vx = sav.vx; e.vy = sav.vy;
            cam.x = sav.x; cam.y = sav.y; cam.z = sav.z; cam.ang = sav.ang; depthBuffer = sav.db;
            function distinct(s) { var seen = {}; s.forEach(function (fr) { fr.forEach(function (f) { seen[f] = 1; }); }); return Object.keys(seen); }
            var drawnAll = idle.every(function (fr) { return fr.length > 0; }) && walk.every(function (fr) { return fr.length > 0; });
            var di = distinct(idle), dw = distinct(walk);
            res.push({ ok: drawnAll && di.length === 1 && dw.length >= 3,
                d: "s" + seed + " " + e.enemyType.id + " (chaseRange " + e.enemyType.chaseRange + ") idle@60u frames=" + di.length + " [" + di.join(",") + "]" +
                   " walking@" + f0(e.enemyType.chaseRange * 1.1) + "u frames=" + dw.length + " [" + dw.join(",") + "]" +
                   (drawnAll ? "" : " PRECONDITION FAILED (the enemy was not drawn on every frame)") });
        });
        emit("render: an enemy's walk-cycle frame advances only while the enemy itself moves", res);
    });

    // ── scenario 7: a fixed level renders in 3D ──────────────────────────────
    // Last: it measures a leak, and the leaked ctx.save() depth is page state.
    LAB.scenario("render: fixed level 3D", function () {
        LAB.freshPage();
        LAB.seedRandom(1);
        LAB.startLevel(1);
        LAB.releasePad();
        MODE3D = true;
        var hasMesh = !!(floorMesh && floorMesh.layerCount);
        var sd0 = LAB.saveDepth(), sv0 = LAB.ctxCounters.save, rs0 = LAB.ctxCounters.restore, ce0 = LAB.errorCount;
        var byPass0 = {};
        for (var k0 in _ptErrors) byPass0[k0] = _ptErrors[k0];
        var re = 0;
        for (var f = 0; f < 30; f++) re += LAB.frame();
        var sd = LAB.saveDepth() - sd0, sv = LAB.ctxCounters.save - sv0, rsN = LAB.ctxCounters.restore - rs0, ce = LAB.errorCount - ce0;
        // Per-pass error counts for THIS level only. Engine-specific error
        // message text never goes into a detail: deno and jsc word the same
        // TypeError differently, and PASS/FAIL lines must match across engines.
        var byPass = {};
        for (var k in _ptErrors) if (_ptErrors[k] - (byPass0[k] || 0) > 0) byPass[k] = _ptErrors[k] - (byPass0[k] || 0);
        var pre = "level=1 floorMesh=" + (hasMesh ? floorMesh.w + "x" + floorMesh.h + " l0Color=" + (floorMesh.l0Color ? "yes" : "MISSING") : "none") + " frames=30";
        LAB.check("render: fixed level 1 renders 3D frames without render-pass exceptions", hasMesh && re === 0,
            pre + " renderErrors+=" + re + " byPass=" + JSON.stringify(byPass) + " consoleErrors+=" + ce + (hasMesh ? "" : " PRECONDITION FAILED (no floorMesh)"));
        var rec = recordPass(drawLayersFloor3D, { keepOnThrow: true });
        LAB.metric("render.level1.floor", rec.byClass);
        LAB.check("render: fixed level 1 floor pass draws ground quads", hasMesh && rec.fills.length > 0,
            pre + " floorFills=" + rec.fills.length + (rec.error ? " drawLayersFloor3D threw " + (rec.error.name || "an exception") : ""));
        LAB.check("render: fixed level 1 keeps canvas save/restore balanced across frames", hasMesh && sd === 0 && sv === rsN,
            pre + " saveDepthDelta=" + sd + " save=" + sv + " restore=" + rsN);
    });
})();

LAB.finish();
undefined;
