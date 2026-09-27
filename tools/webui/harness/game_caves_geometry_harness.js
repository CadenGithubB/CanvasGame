// game_caves_geometry_harness.js -- STATIC invariants of the assembled world
// around caves. Nothing walks here (caves_transition owns the dynamic walks):
// every check builds a world, then reads the game's own data (floorMesh layer
// stacks, surfaceH, grid[], endlessCaveNetworks, the per-chunk meshes
// generateChunk returns) and calls the game's own queries (getFloorHeightAt,
// getWalkableLayerTopAt, queryCaveGeometry, generateChunk,
// generateCaveNetwork). No geometry is re-derived here.
//
// Worlds:
//   --seeds a,b          Cave Test worlds        (default 12345, 1, 777, 424242)
//   --endless-seeds a,b  normal Endless worlds   (default 424242, 999983, 123),
//                        each re-centred on its nearest cave network. Cave Test
//                        forces plains and one network at region (0,0), so it
//                        is not representative on its own. Seed 123 is in the
//                        defaults because it is the one that reaches N14 (an
//                        approach cell 284 u out, beyond the 260 u STEP_DOWN
//                        relaxation).
//   --networks N|all     normal Endless windows per seed, nearest network
//                        first (default 1). A triage sweep; game_lab's CLI does
//                        not forward it -- pass it through
//                        game_lab.run_harness("caves_geometry", [...]).
//
// Every check aggregates over all worlds and entrances; per-world measured
// values, world coordinates and header line refs go in the detail string (and
// per-world bad counts in METRIC lines), so check ids stay stable across seeds.
//
// usage (via tools/webui/game_lab.py): <extracted game js> [--seeds a,b] [--endless-seeds a,b] [--networks N|all]

(0, eval)(slurp("tools/webui/harness/_game_env.js"));
LAB.init(__out, slurp, __engine, __argv);
LAB.check("caves_geometry: game script evaluates without throwing", LAB.load(__argv[0]),
    String(LAB.loadError || "").replace(/\s*\n\s*/g, " | "));

var P = "caves_geometry: ";
var STEP_UP = 1.0;            // getWalkableLayerTopAt, L7844: the step a player can climb
var ROOF_TOL = 40;            // u: the arch is drawn AT the entrance point (drawCaveEntrance3D L16411)
var APPROACH_OUT = 470;       // u outside the entrance where each entrance path starts (APPROACH_LEN 480, L4661)
var INSIDE_LEN = 150;         // u of corridor followed inside the entrance
var DS = 6;                   // u between path samples (half a 12 u mesh cell)
var NET_RADIUS = 12;          // regions searched around spawn in normal Endless
var SEAM_TOL = 0.25;          // h a chunk-border spike of the cave floor may exceed the mid-chunk control spike by
var SURF_SEAM_R = 300;        // u around an entrance where generateChunk blurs the surface (10 cells x 12 u x 2.5, L5525/L5541)
var SURF_SEAM_TOL = 0.05;     // h: see the surface-seam check
var WATER_TOL = 0.0025;       // fraction of water cells a wall may stand on: see the D17 check
var D17_R = 8;                // chunks -8..8 around spawn per Endless seed for the water/wall census
var MIN_ENTRANCES = 5;        // entrance-path checks need at least this many entrance paths inside a window
var NETWORKS_PER_SEED = (function () {
    var v = LAB.opt("networks", null);
    if (v === "all") return 1e9;
    var n = parseInt(v, 10);
    return n > 0 ? n : 1;
})();
var CT_SEEDS = LAB.seeds([12345, 1, 777, 424242]);
var ENDLESS_SEEDS = LAB.seeds([424242, 999983, 123], "endless-seeds");

// ── small helpers (reading, never re-deriving) ──────────────────────────────
var fx = LAB.fx;
function at(i) { var w = LAB.cellWorld(i); return "(" + fx(w.x, 0) + "," + fx(w.y, 0) + ")"; }
function isWallCell(i) {      // grid[] at the mesh cell's centre
    var w = LAB.cellWorld(i), gx = Math.floor((w.x - windowOriginX) / cell), gy = Math.floor((w.y - windowOriginY) / cell);
    if (gx < 0 || gy < 0 || gx >= gridW || gy >= gridH) return false;
    return !!grid[gy * gridW + gx];
}
function sortedLayers(i) {    // a Z-sorted COPY (stable), so an unsorted stack cannot hide a relation
    var ls = LAB.layers(i).map(function (l, k) { return { t: l.t, z: l.z, k: k }; });
    ls.sort(function (a, b) { return a.z - b.z || a.k - b.k; });
    return ls;
}
// Walkable layer directly below the lowest ceiling (the cave floor), or null.
function caveFloorOf(sl) {
    for (var k = 0; k < sl.length; k++) if (sl[k].t === 2) return (k > 0 && LAB.walkable(sl[k - 1].t)) ? sl[k - 1] : null;
    return null;
}
function lowestWalkableZ(sl) { for (var k = 0; k < sl.length; k++) if (LAB.walkable(sl[k].t)) return sl[k].z; return null; }
function hasRoof(sl) { for (var k = 0; k < sl.length; k++) if (sl[k].t === 2 || sl[k].t === 4) return true; return false; }
function allNets() { var out = []; for (var k in endlessCaveNetworks) if (endlessCaveNetworks[k]) out.push(endlessCaveNetworks[k]); return out; }
function short(list, n) { return list.length > n ? list.slice(0, n).join("; ") + "; +" + (list.length - n) + " more" : list.join("; "); }
function sgn(v) { return (v >= 0 ? "+" : "") + fx(v, 0); }

// ── aggregators, one per check ──────────────────────────────────────────────
var A = {
    worlds: [], expectedWorlds: 0, entrancesTested: 0, ceilCells: 0,   // ceilCells: the precondition for the stack checks
    sorted: { bad: 0, cells: 0, per: [] },
    lowest: { bad: 0, cells: 0, per: [] },
    gfh: { bad: 0, cells: 0, per: [] },
    head: { bad: 0, cells: 0, per: [], min: Infinity },
    cap: { bad: 0, cells: 0, per: [], raised: 0, raiseMax: 0 },
    e4: { bad: 0, pairs: 0, per: [] },
    roof: { bad: 0, n: 0, per: [] },
    open: { n: 0, skipped: [] },                      // entrance paths whose +470 start cell is open / under a roof
    step: { bad: 0, n: 0, per: [] },
    walkIn: { bad: 0, n: 0, per: [] },
    walkOut: { bad: 0, n: 0, per: [] },
    mouth: { bad: 0, cells: 0, entCells: 0, per: [] },
    interior: { bad: 0, pairs: 0, per: [], borderBad: 0, borderPairs: 0 },
    seam: { bad: 0, n: 0, per: [] },
    surf: { bad: 0, n: 0, bSamples: 0, per: [] },
    trunc: { miss: 0, extra: 0, want: 0, chunks: 0, per: [], minMargin: Infinity },
    water: { wall: 0, water: 0, bad: false, per: [] },
    entCount: { one: 0, nets: 0, per: [] },
    f6: 0
};

// ── whole-window invariants ─────────────────────────────────────────────────
function scanWindow(label) {
    var m = floorMesh, N = m.w * m.h, W = m.w, H = m.h, EYE = LAB.EYE_H;
    _floorCacheTick = (_floorCacheTick + 1) | 0;          // getFloorHeightAt caches per tick (L7812)
    var s = { unsorted: 0, uAt: null, l0c: 0, l0At: null, l0Stack: "", gfhC: 0, gfhAt: null, gfhUnderCap: 0,
              headN: 0, headBad: 0, headMin: Infinity, headAt: null, headStack: "", headNoFloor: 0,
              capN: 0, capBad: 0, capGap: Infinity, capAt: null, raised: 0, raiseMax: 0, raiseAt: null, ceil: 0,
              e4Pairs: 0, e4Bad: 0, e4At: "", f6: 0 };
    var groundZ = new Float64Array(N);     // lowest walkable of open ceilinged cells, else NaN
    for (var i = 0; i < N; i++) {
        groundZ[i] = NaN;
        var raw = LAB.layers(i);
        if (!raw.length) continue;
        for (var k = 1; k < raw.length; k++) if (raw[k].z < raw[k - 1].z) { s.unsorted++; if (!s.uAt) s.uAt = at(i) + " " + LAB.fmtLayers(raw); break; }
        var sl = sortedLayers(i);
        if (!LAB.walkable(sl[0].t)) { s.l0c++; if (!s.l0At) { s.l0At = at(i); s.l0Stack = LAB.fmtLayers(raw); } }
        // getFloorHeightAt: which layer did it return?
        var w = LAB.cellWorld(i), v = getFloorHeightAt(w.x - windowOriginX, w.y - windowOriginY);
        var hitWalk = false, hitCeil = false;
        for (k = 0; k < raw.length; k++) if (raw[k].z === v) { if (LAB.walkable(raw[k].t)) hitWalk = true; else if (raw[k].t === 2) hitCeil = true; }
        if (hitCeil && !hitWalk) { s.gfhC++; if (!s.gfhAt) s.gfhAt = at(i) + " returned " + fx(v) + " stack " + LAB.fmtLayers(raw); }
        var topW = LAB.topWalkable(sl);
        if (hitWalk && topW && topW.z !== v && LAB.capOf(sl)) s.gfhUnderCap++;
        // headroom above the cave floor
        var ceilL = LAB.ceilingOf(sl);
        if (ceilL) {
            s.ceil++;
            var wallHere = isWallCell(i), lw = lowestWalkableZ(sl);
            if (wallHere) s.f6++;
            if (!wallHere && lw !== null) groundZ[i] = lw;
            var cf = caveFloorOf(sl);
            if (!cf) s.headNoFloor++;
            else if (!wallHere) {
                var hr = ceilL.z - cf.z;
                s.headN++;
                if (hr < EYE) s.headBad++;
                if (hr < s.headMin) { s.headMin = hr; s.headAt = at(i); s.headStack = LAB.fmtLayers(raw); }
            }
        }
        // caps
        var capL = LAB.capOf(sl);
        if (capL) {
            s.capN++;
            var maxC = -Infinity;
            for (k = 0; k < sl.length; k++) if (sl[k].t === 2 && sl[k].z > maxC) maxC = sl[k].z;
            if (maxC > -Infinity) {
                var gap = capL.z - maxC;
                if (!(gap > 0)) s.capBad++;
                if (gap < s.capGap) { s.capGap = gap; s.capAt = at(i); }
            }
            var raise = capL.z - m.surfaceH[i];
            if (raise > 1e-4) { s.raised++; if (raise > s.raiseMax) { s.raiseMax = raise; s.raiseAt = at(i); } }
            // E4: the edge of the roof. A 4-neighbour that is open ground (no
            // ceiling, no cap, a walkable layer). A cliff the natural surface
            // (surfaceH, the pre-stamp snapshot the cap is meant to sit on,
            // L6655-6680) would NOT have made, but the lifted cap does.
            var gx = i % W, gy = (i / W) | 0;
            for (var d = 0; d < 4; d++) {
                var nx = gx + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = gy + (d === 2 ? 1 : d === 3 ? -1 : 0);
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                var nl = LAB.layers(ny * W + nx);
                if (LAB.ceilingOf(nl) || LAB.capOf(nl)) continue;
                var nw = LAB.topWalkable(nl);
                if (!nw) continue;
                s.e4Pairs++;
                if (capL.z - nw.z > STEP_UP && m.surfaceH[i] - nw.z <= STEP_UP) {
                    s.e4Bad++;
                    if (!s.e4At) s.e4At = at(i) + " cap " + fx(capL.z) + " (natural surface " + fx(m.surfaceH[i]) + ") over open ground " + fx(nw.z) + " at " + at(ny * W + nx);
                }
            }
        }
    }
    A.ceilCells += s.ceil; A.f6 += s.f6;
    A.sorted.cells += N; A.sorted.bad += s.unsorted;
    A.sorted.per.push(label + " unsorted=" + s.unsorted + (s.uAt ? " first " + s.uAt : ""));
    A.lowest.cells += N; A.lowest.bad += s.l0c;
    A.lowest.per.push(label + " " + s.l0c + "/" + s.ceil + " ceilinged cells have a ceiling lowest" + (s.l0At ? " e.g. " + s.l0At + " " + s.l0Stack : ""));
    A.gfh.cells += N; A.gfh.bad += s.gfhC;
    A.gfh.per.push(label + " ceilingZ=" + s.gfhC + " caveFloorUnderCap=" + s.gfhUnderCap + (s.gfhAt ? " e.g. " + s.gfhAt : ""));
    A.head.cells += s.headN; A.head.bad += s.headBad; if (s.headMin < A.head.min) A.head.min = s.headMin;
    A.head.per.push(label + " " + s.headBad + "/" + s.headN + " below " + LAB.EYE_H + " min " + fx(s.headMin) + (s.headAt ? " at " + s.headAt + " " + s.headStack : "") + " (no floor under ceiling: " + s.headNoFloor + ")");
    A.cap.cells += s.capN; A.cap.bad += s.capBad; A.cap.raised += s.raised; if (s.raiseMax > A.cap.raiseMax) A.cap.raiseMax = s.raiseMax;
    A.cap.per.push(label + " caps=" + s.capN + " notAbove=" + s.capBad + " minGap " + fx(s.capGap) + (s.capAt ? " at " + s.capAt : "") +
        " raisedAboveSurface=" + s.raised + " max +" + fx(s.raiseMax) + (s.raiseAt ? " at " + s.raiseAt : ""));
    A.e4.pairs += s.e4Pairs; A.e4.bad += s.e4Bad;
    A.e4.per.push(label + " " + s.e4Bad + "/" + s.e4Pairs + " roof-edge pairs" + (s.e4At ? " e.g. " + s.e4At : ""));
    LAB.metric("caves_geometry." + label + ".caps_raised_above_surface", s.raised, "cells");
    LAB.metric("caves_geometry." + label + ".caps_max_raise_h", s.raiseMax);
    LAB.metric("caves_geometry." + label + ".min_headroom_h", isFinite(s.headMin) ? s.headMin : -1);
    LAB.metric("caves_geometry." + label + ".lowest_is_ceiling", s.l0c, "cells");
    LAB.metric("caves_geometry." + label + ".headroom_below_eye", s.headBad, "cells");
    LAB.metric("caves_geometry." + label + ".raised_cap_cliffs", s.e4Bad, "pairs");
    LAB.metric("caves_geometry." + label + ".grid_walls_under_ceiling", s.f6, "cells");
    return { groundZ: groundZ };
}

// ── cave-interior floor continuity (and chunk-border seams) ─────────────────
function scanInterior(label, groundZ) {
    var m = floorMesh, W = m.w, H = m.h, CC = CHUNK_SIZE / m.gridSize;
    var pairs = 0, bad = 0, bPairs = 0, bBad = 0, worst = 0, worstAt = "", worstBorder = false, bWorst = 0, nWorst = 0;
    for (var gy = 0; gy < H; gy++) for (var gx = 0; gx < W; gx++) {
        var i = gy * W + gx, a = groundZ[i];
        if (a !== a) continue;
        for (var d = 0; d < 2; d++) {
            var j = d === 0 ? (gx + 1 < W ? i + 1 : -1) : (gy + 1 < H ? i + W : -1);
            if (j < 0) continue;
            var b = groundZ[j];
            if (b !== b) continue;
            var st = Math.abs(a - b), border = d === 0 ? ((gx + 1) % CC === 0) : ((gy + 1) % CC === 0);
            pairs++; if (border) bPairs++;
            if (st > STEP_UP) { bad++; if (border) bBad++; }
            if (border) { if (st > bWorst) bWorst = st; }
            else if (st > nWorst) nWorst = st;
            if (st > worst) { worst = st; worstAt = at(i) + "->" + at(j) + " " + fx(a) + "->" + fx(b); worstBorder = border; }
        }
    }
    A.interior.pairs += pairs; A.interior.bad += bad; A.interior.borderBad += bBad; A.interior.borderPairs += bPairs;
    A.interior.per.push(label + " " + bad + "/" + pairs + " steps>" + STEP_UP + " worst " + fx(worst) + " " + worstAt +
        (worstBorder ? " ON a chunk border" : " inside a chunk") + " | chunk-border pairs " + bBad + "/" + bPairs +
        " bad, worst border " + fx(bWorst) + " vs worst in-chunk " + fx(nWorst));
    // Seam test. "Spike" of a pair = its step minus the larger of the two
    // steps continuing it on either side (same row/column): a smooth floor
    // keeps it near curvature size, a seam makes it jump. Border pairs (the
    // line between chunks) are compared with CONTROL pairs on the lines 10, 20
    // and 30 cells into every chunk -- same kind of geometry, 3x the samples,
    // so a seamless floor cannot make the border worse except by chance
    // smaller than SEAM_TOL.
    var sp = spikes(groundZ, W, H, CC, null);
    if (sp.bN > 0 && sp.cN > 0) {
        A.seam.n++;
        if (!(sp.bMax <= sp.cMax + SEAM_TOL)) A.seam.bad++;
        A.seam.per.push(label + " max spike on chunk borders " + fx(sp.bMax) + " at " + sp.bAt + " vs mid-chunk control " + fx(sp.cMax) +
            " (" + sp.bN + " border / " + sp.cN + " control samples)");
    } else A.seam.per.push(label + " no cave floor spans a chunk border (" + sp.bN + " border / " + sp.cN + " control samples)");
    LAB.metric("caves_geometry." + label + ".border_spike_h", isFinite(sp.bMax) ? sp.bMax : -99);
    LAB.metric("caves_geometry." + label + ".control_spike_h", isFinite(sp.cMax) ? sp.cMax : -99);
    LAB.metric("caves_geometry." + label + ".interior_step_max_h", worst);
    LAB.metric("caves_geometry." + label + ".interior_steps_over_step_up", bad, "pairs");
    LAB.metric("caves_geometry." + label + ".interior_border_steps_over_step_up", bBad, "pairs");
}
// Border-vs-control spike statistic over a per-cell height array (NaN = not
// sampled). keep(gx, gy) optionally restricts which cells count.
function spikes(Z, W, H, CC, keep) {
    var r = { bMax: -Infinity, bAt: "", cMax: -Infinity, bN: 0, cN: 0 };
    for (var gy = 0; gy < H; gy++) for (var gx = 0; gx < W; gx++) {
        for (var d = 0; d < 2; d++) {
            var line = d === 0 ? (gx + 1) % CC : (gy + 1) % CC;
            var isB = line === 0, isC = line === 10 || line === 20 || line === 30;
            if (!isB && !isC) continue;
            var v = d === 0 ? gx : gy, u = d === 0 ? gy : gx, len = d === 0 ? W : H;
            if (v < 1 || v + 2 >= len) continue;
            if (keep && !keep(gx, gy)) continue;
            var I = function (k) { return d === 0 ? u * W + k : k * W + u; };
            var z0 = Z[I(v - 1)], z1 = Z[I(v)], z2 = Z[I(v + 1)], z3 = Z[I(v + 2)];
            if (z0 !== z0 || z1 !== z1 || z2 !== z2 || z3 !== z3) continue;
            var spike = Math.abs(z2 - z1) - Math.max(Math.abs(z1 - z0), Math.abs(z3 - z2));
            if (isB) { r.bN++; if (spike > r.bMax) { r.bMax = spike; r.bAt = at(I(v)) + "->" + at(I(v + 1)) + " " + fx(z0) + "," + fx(z1) + "|" + fx(z2) + "," + fx(z3); } }
            else { r.cN++; if (spike > r.cMax) r.cMax = spike; }
        }
    }
    return r;
}

// ── the ground surface near entrances: the per-chunk entrance blur ─────────
// generateChunk blurs the surface within 10 cells x 2.5 of each entrance
// (L5524-5562) using only the chunk's own cells (neighbours outside the chunk
// are skipped), so the two sides of a chunk line are blurred differently.
// surfaceH is that blurred pre-stamp surface: open ground outside caves and
// the height every cap over a cave is built from (L6682).
function scanSurfaceSeam(label) {
    var m = floorMesh, W = m.w, H = m.h, CC = CHUNK_SIZE / m.gridSize, R2 = SURF_SEAM_R * SURF_SEAM_R;
    var ents = LAB.entrances().map(function (E) { return LAB.toLocal(E.x, E.y); });
    var sp = spikes(m.surfaceH, W, H, CC, function (gx, gy) {
        var x = (gx + 0.5) * m.gridSize, y = (gy + 0.5) * m.gridSize;
        for (var k = 0; k < ents.length; k++) { var dx = x - ents[k].x, dy = y - ents[k].y; if (dx * dx + dy * dy < R2) return true; }
        return false;
    });
    A.surf.bSamples += sp.bN;
    if (sp.bN > 0 && sp.cN > 0) {
        A.surf.n++;
        if (!(sp.bMax <= sp.cMax + SURF_SEAM_TOL)) A.surf.bad++;
        A.surf.per.push(label + " border max " + fx(sp.bMax, 3) + (sp.bMax <= sp.cMax + SURF_SEAM_TOL ? " <= " : " > ") + "control max " + fx(sp.cMax, 3) +
            " + " + SURF_SEAM_TOL + " at " + sp.bAt + " (" + sp.bN + " border / " + sp.cN + " control samples)");
    } else A.surf.per.push(label + " no chunk line within " + SURF_SEAM_R + " u of an entrance (" + sp.bN + "/" + sp.cN + ")");
    LAB.metric("caves_geometry." + label + ".surface_border_spike_h", isFinite(sp.bMax) ? sp.bMax : -99);
    LAB.metric("caves_geometry." + label + ".surface_control_spike_h", isFinite(sp.cMax) ? sp.cMax : -99);
}

// ── roof: authoritative covered footprint vs the assembled layers ──────────
function scanMouth(label) {
    var m = floorMesh, N = m.w * m.h, nets = allNets();
    var n = 0, nEnt = 0, cappedIn = 0, holeOut = 0, exIn = "", exOut = "";
    for (var i = 0; i < N; i++) {
        var sl = LAB.layers(i);
        var hasCeiling = !!LAB.ceilingOf(sl);
        var capped = !!LAB.capOf(sl);
        var c = LAB.cellCorner(i);
        var qc = queryCaveGeometry(c.x, c.y, nets, m.surfaceH[i]);
        if (!qc && !hasCeiling && !capped) continue;
        n++;
        // The new portal contract stamps at the mesh corner. isEntrance only
        // names the vicinity for diagnostics; covered/ceilZ own actual roofs.
        var covered = !!(qc && qc.covered && qc.ceilZ !== null);
        if (covered) nEnt++;
        if (!covered && (capped || hasCeiling)) { cappedIn++; if (!exIn) exIn = at(i); }
        if (covered && (!capped || !hasCeiling)) { holeOut++; if (!exOut) exOut = at(i); }
    }
    A.mouth.cells += n; A.mouth.entCells += nEnt; A.mouth.bad += cappedIn + holeOut;
    A.mouth.per.push(label + " influenced cells " + n + " (" + nEnt + " covered): roof outside covered footprint=" + cappedIn + (exIn ? " e.g. " + exIn : "") +
        ", missing roof/cap inside covered footprint=" + holeOut + (exOut ? " e.g. " + exOut : ""));
}

// ── one entrance path: axis from +APPROACH_OUT to 0, then the corridor ──────
function entrancePath(E) {
    var raw = [];
    for (var a = APPROACH_OUT; a >= 0; a -= DS) { var w = LAB.axisWorld(E, a, 0); raw.push({ x: w.x, y: w.y, along: a }); }
    var cs = E.net.corridors, k = -1;
    for (var ci = 0; ci < cs.length; ci++) if (cs[ci].x1 === E.x && cs[ci].y1 === E.y) { k = ci; break; }
    var chain = [];
    while (k >= 0 && k < cs.length) {
        chain.push(cs[k]);
        if (k + 1 < cs.length && cs[k + 1].x1 === cs[k].x2 && cs[k + 1].y1 === cs[k].y2) k++; else k = -1;
    }
    var t = 0, segStart = 0;
    for (var si = 0; si < chain.length && t < INSIDE_LEN; si++) {
        var c = chain[si], len = Math.hypot(c.x2 - c.x1, c.y2 - c.y1);
        while (t + DS <= segStart + len && t < INSIDE_LEN) {
            t += DS;
            var f = (t - segStart) / len;
            raw.push({ x: c.x1 + (c.x2 - c.x1) * f, y: c.y1 + (c.y2 - c.y1) * f, along: -t });
        }
        segStart += len;
    }
    var pts = [], inWin = true;
    for (var q = 0; q < raw.length; q++) {
        var l = LAB.toLocal(raw[q].x, raw[q].y), idx = LAB.meshIndex(l.x, l.y);
        if (idx < 0) { inWin = false; break; }
        if (pts.length && pts[pts.length - 1].cell === idx) continue;
        pts.push({ cell: idx, lx: l.x, ly: l.y, wx: raw[q].x, wy: raw[q].y, along: raw[q].along });
    }
    return { pts: pts, inWindow: inWin, chainLen: chain.length, insideReached: t };
}

// The game's own picker carried cell to cell along pts[from..to] (either
// direction), starting on a layer at h0. What a player standing on the
// answer of one cell gets from the next: walk (idx >= 0), fall to the
// highest layer below (idx -1 with a candidate), or -- idx -1, type 0 -- no
// layer at or below the player at all, i.e. the only floors are more than
// STEP_UP above. Carrying on from that answer would carry on from the
// picker's h=0 sentinel (D11, physics' finding), so the chain stops there:
// the player is blocked by a step they cannot climb.
function carry(pts, from, to, h0) {
    var h = h0, dir = to >= from ? 1 : -1, r = { h: h, hs: [h0], breaks: [], first: "", blocked: null, maxStep: 0, maxAt: "", capUntil: null };
    for (var q = from + dir; dir > 0 ? q <= to : q >= to; q += dir) {
        var p = pts[q], res = getWalkableLayerTopAt(p.lx, p.ly, h);
        if (res.idx < 0 && res.type === 0) {
            r.blocked = "blocked at along " + fx(p.along, 0) + " " + at(p.cell) + ": step up from " + fx(h) + " [" + LAB.fmtLayers(LAB.layers(p.cell)) + "]";
            r.breaks.push(fx(p.along, 0));
            if (!r.first) r.first = r.blocked;
            break;
        }
        if (res.idx < 0) {
            r.breaks.push(fx(p.along, 0));
            if (!r.first) r.first = "along " + fx(p.along, 0) + " " + at(p.cell) + " h " + fx(h) + " -> fall to " + fx(res.topH) + " [" + LAB.fmtLayers(LAB.layers(p.cell)) + "]";
        }
        var st = Math.abs(res.topH - h);
        if (st > r.maxStep) { r.maxStep = st; r.maxAt = "along " + fx(pts[q - dir].along, 0) + "->" + fx(p.along, 0) + " " + at(p.cell) + " " + fx(h) + "->" + fx(res.topH) + " (" + (res.action || "?") + ") [" + LAB.fmtLayers(LAB.layers(p.cell)) + "]"; }
        if (res.type === 4) r.capUntil = p.along;
        h = res.topH; r.hs.push(h);
    }
    r.h = h;
    return r;
}

function scanEntrance(label, E) {
    var path = entrancePath(E);
    var tag = label + " e" + E.key + "#" + E.index + "@(" + fx(E.x, 0) + "," + fx(E.y, 0) + ")";
    if (!path.inWindow) return false;
    A.entrancesTested++;
    var pts = path.pts, n = pts.length, last = pts[n - 1];
    var sls = pts.map(function (p) { return sortedLayers(p.cell); });
    var walls = [];
    pts.forEach(function (p) { if (isWallCell(p.cell)) walls.push(fx(p.along, 0)); });
    var innerFloor = caveFloorOf(sls[n - 1]);
    var pre = (path.chainLen > 0 && path.insideReached >= INSIDE_LEN) ? "" :
        "PRECONDITION: no corridor chain of " + INSIDE_LEN + " u starts at the entrance (chain " + path.chainLen + " segs, " + fx(path.insideReached, 0) + " u)";
    if (!pre && !innerFloor) pre = "PRECONDITION: the path end (along " + fx(last.along, 0) + ", " + at(last.cell) + ") has no floor under a ceiling: " + LAB.fmtLayers(LAB.layers(last.cell));

    // (1) roof start: the roofed run that covers the cave just inside the arch
    A.roof.n++;
    var k0 = -1;
    for (var q = 0; q < n; q++) if (pts[q].along <= 0 && hasRoof(sls[q])) { k0 = q; break; }
    var roofMsg, roofOk;
    if (k0 < 0) { roofOk = false; roofMsg = tag + " PRECONDITION: no roof over the first " + INSIDE_LEN + " u of the cave"; }
    else {
        var k = k0; while (k > 0 && hasRoof(sls[k - 1])) k--;
        var rs = pts[k].along;
        roofOk = rs <= ROOF_TOL;
        roofMsg = tag + " roof starts at along " + sgn(rs) + (k === 0 ? " (the whole approach is roofed)" : "") +
            " " + at(pts[k].cell) + " " + LAB.fmtLayers(LAB.layers(pts[k].cell));
    }
    if (!roofOk) A.roof.bad++;
    A.roof.per.push(roofMsg);
    LAB.metric("caves_geometry." + label + ".e" + E.key + "#" + E.index + ".roof_start_u", k0 < 0 ? 9999 : pts[k].along, "u");

    // (2) the floor actually walked in: per-cell change of the picker chain
    //     (the layer a player stands on, or lands on, in each cell). It starts
    //     on the TOP walkable layer at +470 -- where a player arriving over
    //     the surface is -- so an approach that runs over another part of the
    //     cave is judged by what that player gets: a walk on the roof cap and
    //     a plunge through the cap hole at the mouth.
    // (3,4) the game's own picker carried along the path, in and out
    var start = pts[0], startLs = LAB.layers(start.cell), surf = LAB.topWalkable(startLs);
    if (!pre && !surf) pre = "PRECONDITION: no walkable layer at along +" + APPROACH_OUT + " " + at(start.cell);
    if (!hasRoof(sls[0])) A.open.n++; else A.open.skipped.push(tag);
    A.step.n++; A.walkIn.n++; A.walkOut.n++;
    if (pre) {
        A.step.bad++; A.walkIn.bad++; A.walkOut.bad++;
        A.step.per.push(tag + " " + pre); A.walkIn.per.push(tag + " " + pre); A.walkOut.per.push(tag + " " + pre);
        return true;
    }
    var ci = carry(pts, 0, n - 1, surf.z);
    var stepOk = !ci.blocked && ci.maxStep <= STEP_UP;
    if (!stepOk) A.step.bad++;
    A.step.per.push(tag + " max step " + fx(ci.maxStep) + " h at " + ci.maxAt + (ci.blocked ? " " + ci.blocked : "") +
        (ci.capUntil !== null ? " (stood on a roof cap until along " + fx(ci.capUntil, 0) + ")" : "") +
        (walls.length ? " gridWallsOnPath@along " + short(walls, 4) : ""));
    var inOk = ci.breaks.length === 0 && !ci.blocked && Math.abs(ci.h - innerFloor.z) < 1e-3;
    if (!inOk) A.walkIn.bad++;
    A.walkIn.per.push(tag + " in: unsupported=" + ci.breaks.length + (ci.first ? " first " + ci.first : "") +
        " ends h " + fx(ci.h) + " (cave floor " + fx(innerFloor.z) + ")");
    // Out: "the surface" is a walkable layer of the +470 cell with nothing
    // above it (no ceiling, no cap) -- open sky. When the +470 cell is itself
    // over a cave, ending on ITS cave floor is still underground.
    var co = carry(pts, n - 1, 0, innerFloor.z);
    var sky = null;
    startLs.forEach(function (l, k) {
        if (!LAB.walkable(l.t) || Math.abs(l.z - co.h) >= 1e-3) return;
        var roofed = false;
        for (var j = 0; j < startLs.length; j++) if (j !== k && startLs[j].z > l.z && (startLs[j].t === 2 || startLs[j].t === 4)) roofed = true;
        sky = !roofed;
    });
    var outOk = co.breaks.length === 0 && !co.blocked && sky === true;
    if (!outOk) A.walkOut.bad++;
    A.walkOut.per.push(tag + " out: unsupported=" + co.breaks.length + (co.first ? " first " + co.first : "") +
        (co.breaks.length > 1 ? " all@along " + short(co.breaks, 6) : "") +
        (co.blocked ? "" : " ends h " + fx(co.h) + (sky === true ? " under open sky" : sky === false ? " still UNDER A ROOF" : " on no layer") +
            " at along +" + APPROACH_OUT + " [" + LAB.fmtLayers(startLs) + "]"));
    return true;
}

// ── network truncation: every chunk against every network ──────────────────
// Black-box differential, independent of the ceiling policy. For every mesh
// cell of every chunk that could hold part of a network, ask queryCaveGeometry
// with EVERY network of the 5x5 regions around the chunk -- a superset of the
// 3x3 generateChunk consults (L5341-5350) and of its per-network AABB filter
// (L5352-5379). Where that says the cell is cave (fade >= TRUNC_FADE, any
// source: corridor, chamber or approach ramp), generateChunk's own chunk must
// show it was stamped: a ceiling, or a floor moved off the pre-stamp surface
// snapshot (cSurfaceH L5566-5571 -- the stamping loop L5618 is the only write
// to cHeights after it). A network the chunk never saw leaves such cells
// untouched, feather band included. Whether a ceiling is stamped where
// ceilZ !== null is NOT assumed (that is D6's policy, and a fix may change it).
var TRUNC_FADE = 0.05;        // below this the floor lerp can round to nothing in Float32
function scanTruncation(label, nets) {
    var REGION = 3 * CHUNK_SIZE, keys = {}, nChunks = 0, want = 0, miss = 0, ceilPolicy = 0, ex = "", exFade = -1;
    var minMargin = Infinity, minAt = "";
    nets.forEach(function (net) {
        var x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
        function box(x, y, r) { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); }
        net.corridors.forEach(function (c) { var r = c.width * 0.5 + 108; box(c.x1, c.y1, r); box(c.x2, c.y2, r); });
        net.chambers.forEach(function (ch) { box(ch.cx, ch.cy, ch.radius + 108); });
        for (var cy = Math.floor(y0 / CHUNK_SIZE); cy <= Math.floor(y1 / CHUNK_SIZE); cy++)
            for (var cx = Math.floor(x0 / CHUNK_SIZE); cx <= Math.floor(x1 / CHUNK_SIZE); cx++) keys[cx + "," + cy] = [cx, cy];
        // informational: how close the feather comes to the 3x3-region reach
        var rx0 = (net.regionX - 1) * REGION, rx1 = (net.regionX + 2) * REGION, ry0 = (net.regionY - 1) * REGION, ry1 = (net.regionY + 2) * REGION;
        var mg = Math.min(x0 - rx0, rx1 - x1, y0 - ry0, ry1 - y1);
        if (mg < minMargin) { minMargin = mg; minAt = "net " + net.regionX + "," + net.regionY; }
    });
    for (var key in keys) {
        var cx = keys[key][0], cy = keys[key][1], ch = generateChunk(cx, cy), fm = ch.floorMesh;
        var LT = [fm.l0Type, fm.l1Type, fm.l2Type, fm.l3Type, fm.l4Type];
        var crx = Math.floor(cx / 3), cry = Math.floor(cy / 3), oracle = [];
        for (var ry = cry - 2; ry <= cry + 2; ry++) for (var rx = crx - 2; rx <= crx + 2; rx++) { var nt = generateCaveNetwork(rx, ry); if (nt) oracle.push(nt); }
        nChunks++;
        if (!oracle.length) continue;
        for (var my = 0; my < fm.h; my++) for (var mx = 0; mx < fm.w; mx++) {
            var i = my * fm.w + mx, x = cx * CHUNK_SIZE + mx * fm.gridSize, y = cy * CHUNK_SIZE + my * fm.gridSize;
            var qq = queryCaveGeometry(x, y, oracle, 2.0);
            if (!qq || !(qq.fade >= TRUNC_FADE)) continue;
            var hasCeil = false;
            for (var li = 1; li < fm.layerCount[i]; li++) if (LT[li][i] === 2) hasCeil = true;
            var stamped = hasCeil || fm.l0TopZ[i] !== fm.surfaceH[i];
            want++;
            if (qq.ceilZ !== null && !hasCeil) ceilPolicy++;
            if (!stamped) { miss++; if (qq.fade > exFade) { exFade = qq.fade; ex = "chunk " + key + " (" + fx(x, 0) + "," + fx(y, 0) + ") " + qq.source + " fade " + fx(qq.fade, 3); } }
        }
    }
    A.trunc.chunks += nChunks; A.trunc.want += want; A.trunc.miss += miss; A.trunc.extra += ceilPolicy;
    if (minMargin < A.trunc.minMargin) A.trunc.minMargin = minMargin;
    A.trunc.per.push(label + " " + nets.length + " nets, " + nChunks + " chunks: unstamped " + miss + "/" + want + " cave cells" +
        (ex ? " worst " + ex : "") + " (nearest feather edge to generateChunk's 3x3-region reach " + fx(minMargin, 0) + " u, " + minAt + ")");
    LAB.metric("caves_geometry." + label + ".trunc_unstamped_cells", miss, "cells");
    LAB.metric("caves_geometry." + label + ".cells_with_ceilZ_but_no_ceiling", ceilPolicy, "cells");
}

// ── D17: walls in water ─────────────────────────────────────────────────────
function scanWater(label) {
    var water = 0, wall = 0, ex = "", shared = true;
    for (var cy = -D17_R; cy <= D17_R; cy++) for (var cx = -D17_R; cx <= D17_R; cx++) {
        var ch = generateChunk(cx, cy), fm = ch.floorMesh;
        if (fm.w !== CHUNK_CELLS || fm.h !== CHUNK_CELLS) { shared = false; continue; }
        for (var i = 0; i < fm.w * fm.h; i++) if (fm.water[i]) {
            water++;
            if (ch.grid[i]) { wall++; if (!ex) ex = "chunk " + cx + "," + cy + " cell " + (i % fm.w) + "," + ((i / fm.w) | 0) + " floor " + fx(fm.l0TopZ[i]); }
        }
    }
    if (!shared) A.water.bad = true;
    A.water.water += water; A.water.wall += wall;
    A.water.per.push(label + " " + wall + "/" + water + (ex ? " e.g. " + ex : "") + (shared ? "" : " (floorMesh and grid[] differ in size)"));
    LAB.metric("caves_geometry." + label + ".walls_on_water", wall, "cells");
}

// ── worlds ──────────────────────────────────────────────────────────────────
function testWindow(label, seen) {
    var r = scanWindow(label);
    scanInterior(label, r.groundZ);
    scanSurfaceSeam(label);
    scanMouth(label);
    var tested = 0, ents = LAB.entrances();
    ents.forEach(function (E) {
        var id = E.key + "#" + E.index;
        if (seen && seen[id]) return;                   // already tested from an earlier window
        if (scanEntrance(label, E)) { tested++; if (seen) seen[id] = true; }
    });
    A.worlds.push(label + ": entrances in window " + tested);
    return tested;
}
// The nearest entrance of a network to spawn, or null (a network may have none).
function nearestEntrance(net) {
    var E = null, d = 1e18;
    net.entrances.forEach(function (e) { var dd = Math.hypot(e.x - CHUNK_SIZE / 2, e.y - CHUNK_SIZE / 2); if (dd < d) { d = dd; E = e; } });
    return E;
}

if (LAB.loaded) {
    CT_SEEDS.forEach(function (seed) {
        LAB.scenario(P + "cave test seed " + seed, function () {
            var label = "ct" + seed;
            A.expectedWorlds++;
            LAB.freshPage();
            LAB.seedRandom(seed);
            LAB.startCaveTest(seed);
            LAB.freezeDay(0.5);
            testWindow(label);
            scanTruncation(label, allNets());
        });
    });

    var normalNets = [];
    ENDLESS_SEEDS.forEach(function (seed) {
        LAB.scenario(P + "normal endless seed " + seed, function () {
            LAB.freshPage();
            LAB.startEndless(seed);
            LAB.freezeDay(0.5);
            var found = LAB.findCaveNetworks(NET_RADIUS);
            var regions = (2 * NET_RADIUS + 1) * (2 * NET_RADIUS + 1);
            LAB.metric("caves_geometry.n" + seed + ".regions_with_network_pct", 100 * found.length / regions, "%");
            LAB.metric("caves_geometry.n" + seed + ".nearest_entrance_u", found.length ? found[0].dist : -1, "u");
            found.forEach(function (f) { normalNets.push({ seed: seed, net: f.net }); });
            if (!found.length) { A.expectedWorlds++; A.worlds.push("n" + seed + ": NO cave network within " + NET_RADIUS + " regions"); return; }
            var seen = {};
            for (var k = 0; k < Math.min(NETWORKS_PER_SEED, found.length); k++) {
                var near = found[k], E = nearestEntrance(near.net);
                A.expectedWorlds++;
                if (!E) { A.worlds.push("n" + seed + "r" + near.rx + "," + near.ry + ": the network has no entrance, entrances in window 0"); continue; }
                if (seen[near.rx + "," + near.ry + "#" + near.net.entrances.indexOf(E)]) { A.expectedWorlds--; continue; }   // tested from an earlier window
                LAB.placeWorld(E.x, E.y, "top");
                testWindow("n" + seed + "r" + near.rx + "," + near.ry, seen);
            }
            scanTruncation("n" + seed, found.map(function (f) { return f.net; }));
        });
    });

    ENDLESS_SEEDS.forEach(function (seed) {
        LAB.scenario(P + "water census endless seed " + seed, function () {
            LAB.freshPage();
            LAB.startEndless(seed);
            scanWater("n" + seed);
        });
    });

    LAB.scenario(P + "normal endless entrance counts", function () {
        var per = {};
        normalNets.forEach(function (o) {
            A.entCount.nets++;
            if (o.net.entrances.length === 1) A.entCount.one++;
            per[o.seed] = per[o.seed] || { n: 0, one: 0, two: 0 };
            per[o.seed].n++;
            if (o.net.entrances.length === 1) per[o.seed].one++; else if (o.net.entrances.length === 2) per[o.seed].two++;
        });
        for (var sd in per) A.entCount.per.push("n" + sd + ": " + per[sd].n + " nets, 1-entrance " + per[sd].one + ", 2-entrance " + per[sd].two);
    });

    // ── verdicts ────────────────────────────────────────────────────────────
    var entPre = A.step.n >= MIN_ENTRANCES ? "" : "PRECONDITION: only " + A.step.n + " entrance paths inside a window (need >= " + MIN_ENTRANCES + "); ";
    var skipped = A.open.skipped.length ? " | approach start (+" + APPROACH_OUT + ") is itself under a cave roof: " + A.open.skipped.join("; ") : "";
    LAB.check("caves_geometry: every world under test has a cave entrance inside its window",
        A.worlds.length > 0 && A.worlds.length === A.expectedWorlds && A.worlds.every(function (s) { return / [1-9]\d*$/.test(s); }),
        A.worlds.join("; "));
    LAB.check("caves_geometry: every cell's layer stack is sorted by ascending Z",
        A.ceilCells > 0 && A.sorted.bad === 0,
        (A.ceilCells > 0 ? "" : "PRECONDITION: no ceilinged (multi-layer) cell in any window; ") + A.sorted.bad + "/" + A.sorted.cells + " unsorted; " + A.sorted.per.join("; "));
    LAB.check("caves_geometry: the lowest layer of every cell is walkable ground, never a ceiling",
        A.ceilCells > 0 && A.lowest.bad === 0,
        "[D6; floor lerped L5618, ceiling stamped whole L5621, cap insert re-sorts the stack L6724] " + (A.ceilCells > 0 ? "" : "PRECONDITION: no ceilinged cell in any window; ") +
        A.lowest.bad + "/" + A.ceilCells + " ceilinged cells; " + A.lowest.per.join("; "));
    LAB.check("caves_geometry: getFloorHeightAt never returns a ceiling's height",
        A.ceilCells > 0 && A.gfh.bad === 0,
        "[D6; getFloorHeightAt L7816 returns l0TopZ] " + (A.ceilCells > 0 ? "" : "PRECONDITION: no ceilinged cell in any window; ") +
        A.gfh.bad + "/" + A.gfh.cells + " cells; " + A.gfh.per.join("; "));
    LAB.check("caves_geometry: every open cell under a ceiling has eye-height (LAB.EYE_H 2.4 h) headroom above its cave floor",
        A.head.cells > 0 && A.head.bad === 0,
        "[D2; floor lerped by fade L5618, ceiling stamped whole L5621] " + (A.head.cells > 0 ? "" : "PRECONDITION: no open cell under a ceiling; ") +
        A.head.bad + "/" + A.head.cells + " cells, min headroom " + fx(A.head.min) + " h; " + A.head.per.join("; "));
    LAB.check("caves_geometry: every surface cap sits strictly above the ceiling it covers",
        A.cap.cells > 0 && A.cap.bad === 0,
        "[clamp L6693] " + (A.cap.cells > 0 ? "" : "PRECONDITION: no cap in any window; ") + A.cap.bad + "/" + A.cap.cells + "; " + A.cap.per.join("; "));
    LAB.metric("caves_geometry.caps_raised_above_surface_total", A.cap.raised, "cells");
    LAB.metric("caves_geometry.caps_max_raise_h", A.cap.raiseMax);
    LAB.check("caves_geometry: a cap lifted above the natural surface never stands more than STEP_UP (1.0 h) above the open ground beside it",
        A.e4.pairs >= 100 && A.e4.bad === 0,
        "[E4; clamp L6693 lifts caps over ceilings that the 21x21-max depth gate L5595-5604 lets rise above the local surface] " +
        (A.e4.pairs >= 100 ? "" : "PRECONDITION: only " + A.e4.pairs + " cap/open-ground neighbour pairs (need >= 100); ") +
        "cliffs made by the lift " + A.e4.bad + "/" + A.e4.pairs + " roof-edge pairs; " + A.e4.per.join("; "));
    LAB.check("caves_geometry: the cave roof starts no more than 40 u outside the entrance arch",
        A.roof.n > 0 && A.roof.bad === 0,
        "[D2; ceiling wherever fade>0 L4756, feather hw+108 L4684/L4702] " + A.roof.bad + "/" + A.roof.n + " entrances; " + A.roof.per.join("; "));
    LAB.metric("caves_geometry.entrances_with_roofed_approach_start", A.open.skipped.length, "entrances");
    LAB.check("caves_geometry: walking in along every entrance path, the floor the player stands on never changes by more than STEP_UP (1.0 h) between neighbouring cells",
        !entPre && A.step.bad === 0,
        "[D1 approach depth e.depth||5 L4741 vs corridor depth 6.0-8.5 L4496; steep feather smoothstep L4684/L4702; approach under the cave roof D2 L4756; picker L7831] " + entPre +
        A.step.bad + "/" + A.step.n + " entrances; " + A.step.per.join("; ") + skipped);
    LAB.check("caves_geometry: getWalkableLayerTopAt carries a player from the surface down to the cave floor with no unsupported step",
        !entPre && A.walkIn.bad === 0,
        "[N14; STEP_DOWN relaxed to 10 only within 260 u of an entrance L7853, approach is 480 u L4661] " + entPre +
        A.walkIn.bad + "/" + A.walkIn.n + " entrances; " + A.walkIn.per.join("; ") + skipped);
    LAB.check("caves_geometry: getWalkableLayerTopAt carries a player from the cave floor back out to the surface with no unsupported step",
        !entPre && A.walkOut.bad === 0,
        "[D1; STEP_UP 1.0 L7844, no layer at or below -> {idx:-1,type:0} L7901] " + entPre +
        A.walkOut.bad + "/" + A.walkOut.n + " entrances; " + A.walkOut.per.join("; ") + skipped);
    LAB.check("caves_geometry: ceiling and cap layers exactly match queryCaveGeometry's covered footprint",
        A.mouth.entCells > 0 && A.mouth.bad === 0,
        "[shared portal roof contract] " + (A.mouth.entCells > 0 ? "" : "PRECONDITION: no covered cells; ") + A.mouth.bad + "/" + A.mouth.cells + " influenced cells disagree; " + A.mouth.per.join("; "));
    LAB.check("caves_geometry: the floor under a cave ceiling never steps more than STEP_UP (1.0 h) between neighbouring open cells",
        A.interior.pairs > 0 && A.interior.bad === 0,
        "[caves laterally open: feather hw+108 L4684/L4702, walls carved only where fade>0.3 L4773; D6 inverted stacks; N14 entrance trees of different depth L4496] " +
        (A.interior.pairs > 0 ? "" : "PRECONDITION: no open ceilinged neighbour pair; ") +
        A.interior.bad + "/" + A.interior.pairs + " pairs (on chunk borders " + A.interior.borderBad + "/" + A.interior.borderPairs + "); " + A.interior.per.join("; "));
    LAB.check("caves_geometry: chunk borders add no seam to the floor under cave ceilings",
        A.seam.n > 0 && A.seam.bad === 0,
        "[E2 suspected seams: per-chunk smoothing L5524-5562 / 21x21 surface max L5595 are clipped at the chunk edge] " +
        "tolerance: border spike <= mid-chunk control spike + " + SEAM_TOL + " h; " +
        (A.seam.n === 0 ? "PRECONDITION: no world has cave floor across a chunk border; " : "") + A.seam.bad + "/" + A.seam.n + " worlds; " + A.seam.per.join("; "));
    LAB.check("caves_geometry: chunk borders add no seam to the ground surface within 300 u of a cave entrance",
        A.surf.bSamples >= 50 && A.surf.bad === 0,
        "[E2 in the surface: the entrance blur L5524-5562 skips neighbours outside the chunk] tolerance: border spike <= control spike + " + SURF_SEAM_TOL + " h; " +
        (A.surf.bSamples >= 50 ? "" : "PRECONDITION: only " + A.surf.bSamples + " chunk-line samples near an entrance (need >= 50); ") +
        A.surf.bad + "/" + A.surf.n + " worlds; " + A.surf.per.join("; "));
    LAB.check("caves_geometry: every chunk stamps every cell that queryCaveGeometry over all nearby networks calls cave (no network truncation)",
        A.trunc.want > 0 && A.trunc.miss === 0,
        "[E3; generateChunk consults the 3x3 regions L5341-5350 and an AABB margin of 100 L5353] " +
        (A.trunc.want > 0 ? "" : "PRECONDITION: no cell of any scanned chunk is cave (fade >= " + TRUNC_FADE + "); ") +
        "unstamped " + A.trunc.miss + "/" + A.trunc.want + " cave cells over " + A.trunc.chunks + " chunks (ceilZ given but no ceiling stamped: " + A.trunc.extra + ", METRIC only); " +
        A.trunc.per.join("; "));
    var wFrac = A.water.water ? A.water.wall / A.water.water : 1;
    LAB.check("caves_geometry: no more than 0.25% of water cells carry a grid wall",
        A.water.water >= 1000 && !A.water.bad && wFrac <= WATER_TOL,
        "[D17; the water-zone wall test calls terrainNoise under the wall noise seed L4978-4987] " +
        (A.water.water >= 1000 ? "" : "PRECONDITION: only " + A.water.water + " water cells in chunks -" + D17_R + ".." + D17_R + " (need >= 1000); ") +
        "wall-on-water " + A.water.wall + "/" + A.water.water + " (" + fx(100 * wFrac, 2) + "%); " + A.water.per.join("; "));
    LAB.check("caves_geometry: normal Endless generates some cave networks with exactly one entrance",
        A.entCount.nets >= 10 && A.entCount.one > 0,
        "[D16; L4478 asks for 1 or 2, but rng and rng2 share chunkRng(rx,ry,100) L4465/L4472] " +
        (A.entCount.nets < 10 ? "PRECONDITION: only " + A.entCount.nets + " networks found (need >= 10); " : "") +
        A.entCount.one + "/" + A.entCount.nets + " networks have exactly 1 entrance; " + A.entCount.per.join("; "));
    LAB.metric("caves_geometry.entrances_tested", A.entrancesTested);
    LAB.metric("caves_geometry.entrances_with_open_approach_start", A.open.n);
    LAB.metric("caves_geometry.grid_walls_under_ceiling_total", A.f6, "cells");
    LAB.metric("caves_geometry.network_feather_min_margin_to_region_reach_u", isFinite(A.trunc.minMargin) ? A.trunc.minMargin : -1, "u");
}
LAB.finish();
undefined;
