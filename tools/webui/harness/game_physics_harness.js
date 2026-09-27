// game_physics_harness.js -- falling, floor picking, landing and collision in the
// Endless crawler (WebPage_Games.h), on the surface as much as at cave mouths.
//
// Every check states how the game SHOULD behave; several FAIL on today's code on
// purpose (tools/webui/tests/test_game_physics.py lists them in KNOWN_BUGS with
// the audit reference). Measurements always come from the game's own code:
// getWalkableLayerTopAt, step() via LAB.tick / LAB.walkTo, loop() via LAB.frameAt
// (real frames, several physics steps per frame below 60 fps), assembleWindow,
// getFloorHeightAt, isInGridWall, updateEnemies/_applyEnemyAttack, and its own
// arrays (floorMesh, wallFaceBase). Mesh data is only ever used to CHOOSE where
// to test (a rise, a drop, a step, a wall), never to compute the quantity a
// check judges. Where a check needs a reference value it asks the game again
// under a controlled condition (getFloorHeightAt with a guaranteed cache miss,
// assembleWindow with the cache invalidated), never a copy of the game's code.
//
// Worlds (the shared convention of every game suite):
//   --seeds a,b            Cave Test worlds         default 12345
//   --endless-seeds a,b    normal Endless worlds    default 424242, 777000
// Each Endless seed is used as its spawn window plus one far window centred
// near its nearest cave network (the only place normal Endless has caves).
// Enemies are removed for the movement scenarios so a walk measures terrain
// physics, not a shove from a passing Soldier; the combat scenarios add back
// exactly the enemy they need.
//
// Isolation: every world is built from a reloaded-page state (LAB.freshPage,
// LAB.releasePad), with Math.random seeded BEFORE the start (resetEndlessMode
// draws from it) and the floor-height cache invalidated before the start, so a
// scenario never depends on the ones before it. That last step hides one real
// bug everywhere except in the check that measures it: "a new world's
// wallFaceBase ... after another world was played" (scenario C).
//
// usage (via tools/webui/game_lab.py):
//   <extracted game js> [--seeds a,b] [--endless-seeds a,b] [--only A,C]
//   --only runs a subset of scenarios (A B N4 C D E F N5): for debugging by
//   hand, and for the mutation probes in tests/test_game_physics.py, which run
//   only the scenario that holds their checks (scenarios are isolated, above).

(0, eval)(slurp("tools/webui/harness/_game_env.js"));
LAB.init(__out, slurp, __engine, __argv);
// One line: a multi-line stack in the detail would break the verdict protocol.
LAB.check("physics: game script evaluates without throwing", LAB.load(__argv[0]), String(LAB.loadError || "").replace(/\s*\n\s*/g, " | "));

if (LAB.loaded) (function () {
    // Everything lives inside this function: on jsc a top-level `var` in the
    // harness would become a global and could shadow a game global of the same
    // name, while on deno (an ES module) it would not -- an engine difference.
    var G = (0, eval)("this");
    var CAVE_SEEDS = LAB.seeds([12345]);
    var ENDLESS_SEEDS = LAB.seeds([424242, 777000], "endless-seeds");
    var ONLY = LAB.opt("only", null);
    function want(letter) { return !ONLY || ONLY === true || String(ONLY).split(",").indexOf(letter) >= 0; }
    // The picker's own step window (getWalkableLayerTopAt, 7841-7845), used to
    // choose test locations and as the documented contract: "STEP_UP: max
    // height you can step onto like a curb. STEP_DOWN: max drop you can walk
    // off without starting to fall. Beyond these the player goes airborne."
    var STEP_UP = 1.0, STEP_DOWN = 1.0;
    // The grounded floor ease moves 30% of the way per step (10277), so a
    // walkable step (<= STEP_UP) never lifts a walking player more than 0.30 h
    // in one tick; 0.35 h is that plus a margin.
    var MAX_WALK_RISE_PER_TICK = 0.35;
    // Picker relaxes STEP_DOWN to 10 within 260 u of a cave entrance (7853);
    // 300 u keeps every "open ground" test outside that zone.
    var MOUTH_CLEAR = 300;
    var GS = 12;                               // mesh cell = grid cell = 12 u

    function f2(v) { return LAB.fx(v, 2); }
    function wcell(wx, wy) { return Math.floor(wx / GS) + "," + Math.floor(wy / GS); }
    function dropEnemies() { if (enemies && enemies.length) enemies = []; }
    function snap(t) {
        var w = LAB.worldPos();
        return { t: t, x: w.x, y: w.y, h: LAB.h(), air: jumpAirborne, cell: LAB.meshIndex(pos.x, pos.y) };
    }
    function nearMouth(lx, ly, r) {
        for (var e = 0; e < deepCaveEntrances.length; e++)
            if (Math.hypot(lx - deepCaveEntrances[e].x, ly - deepCaveEntrances[e].y) < r) return true;
        return false;
    }
    function evenly(list, n) {
        if (list.length <= n) return list.slice();
        var out = [];
        for (var q = 0; q < n; q++) out.push(list[Math.floor(q * list.length / n)]);
        return out;
    }
    function bumpFloorCache() { _floorCacheTick = (_floorCacheTick + 1) | 0; }
    // LAB.scenario plus a wall-clock METRIC (informational, never a verdict).
    function scenario(letter, name, fn) {
        if (!want(letter)) return;
        var t0 = LAB.realNow();
        LAB.scenario(name, fn);
        LAB.metric("physics.ms." + name.replace(/^physics: /, "").replace(/[^A-Za-z0-9]+/g, "_"), LAB.realNow() - t0, "ms");
    }

    // ── worlds ───────────────────────────────────────────────────────────────
    var WORLDS = [];
    CAVE_SEEDS.forEach(function (s) { WORLDS.push({ tag: "cave" + s, kind: "cave", seed: s, far: false }); });
    ENDLESS_SEEDS.forEach(function (s) {
        WORLDS.push({ tag: "endless" + s, kind: "endless", seed: s, far: false });
        WORLDS.push({ tag: "endless" + s + "-far", kind: "endless", seed: s, far: true });
    });
    // A shallow copy of a live enemy from the last world start (spawnEnemies /
    // chunk spawns, 11262): the shape enemyOfType() retypes. Taken before
    // build() drops the world's enemies.
    var ENEMY_TEMPLATE = null;
    function start(W, keepCache) {
        LAB.freshPage(); LAB.releasePad();
        LAB.seedRandom(W.seed);
        if (!keepCache) bumpFloorCache();
        if (W.kind === "cave") { LAB.startCaveTest(W.seed); LAB.seedRandom(W.seed); }
        else LAB.startEndless(W.seed);
        LAB.freezeDay(0.5);
        if (enemies && enemies.length) { ENEMY_TEMPLATE = {}; for (var k in enemies[0]) ENEMY_TEMPLATE[k] = enemies[0][k]; }
    }
    function build(W) {
        start(W);
        if (W.far) {
            // Nearest cave network (entrances are WORLD coords); stand 300 u
            // outside its first entrance so the window holds the whole mouth.
            var nets = LAB.findCaveNetworks(12), p;
            if (nets.length) {
                var e = nets[0].net.entrances[0];
                p = { x: e.x - Math.cos(e.angle) * 300, y: e.y - Math.sin(e.angle) * 300 };
            } else p = { x: 20 * CHUNK_SIZE + CHUNK_SIZE / 2, y: CHUNK_SIZE / 2 };
            LAB.placeWorld(p.x, p.y, "top");
            W.where = "(" + Math.round(p.x) + "," + Math.round(p.y) + ")";
        }
        dropEnemies();
        return W;
    }

    // Per-cell top / lowest walkable layer of the current window (for choosing
    // test locations only).
    function walkableTable() {
        var m = floorMesh, n = m.w * m.h;
        var top = new Float64Array(n), low = new Float64Array(n), has = new Uint8Array(n);
        for (var i = 0; i < n; i++) {
            var ls = LAB.layers(i), t = LAB.topWalkable(ls), l = LAB.lowestWalkable(ls);
            if (t) { has[i] = 1; top[i] = t.z; low[i] = l.z; }
        }
        return { top: top, low: low, has: has };
    }

    // ── A. floor picking at steep rises [D11] ────────────────────────────────
    // A1 scans every (cell, 4-neighbour) pair with the game's picker, from the
    // neighbour's top AND lowest walkable layer (the cave-floor case). It judges
    // the picker's own contract on purpose: four callers consume the sentinel's
    // topH (airborne landing 10147, edge fall 10176, ground ease 10272,
    // underground detection 19356), so a fix elsewhere leaves the trap armed.
    // A2-A4 walk the player, with the real input path, at every rise whose
    // walkable layers are ALL more than STEP_UP above the neighbour's top
    // (chosen from the mesh, so the walks still exist after any fix), and judge
    // the outcome -- whichever way a fix goes (climb, block, fall):
    //   A2 the feet never stay below the ground / the eye never in terrain;
    //   A3 a grounded player is never lifted onto such a rise (the picker's
    //      own "curb" contract: beyond STEP_UP you do not step up);
    //   A4 a jump toward such a rise never lands the player below the ground
    //      (the airborne landing path 10141-10160, separate from walking).
    // A walk counts once the player APPROACHED the rise: entered its cell or
    // its 6u-radius body came within 3u of the shared edge. Terrain collision
    // now checks the body footprint, not only its centre; requiring the centre
    // to get within 3u would reject a correctly blocked body before testing it.
    // "Entered" alone would reject a fix that blocks the rise like a wall.
    scenario("A", "physics: floor picking at steep rises", function () {
        var sentinelTotal = 0, pairsTotal = 0, a1Detail = [], a1Ex = null;
        var walks = 0, approached = 0, bad = 0, worst = null, a2Detail = [], risesTotal = 0, maxJolt = 0;
        var climbed = 0, climbEx = null, a3Detail = [];
        var jumps = 0, jApproached = 0, jBad = 0, jEx = null, a4Detail = [];
        var NB = [[1, 0], [-1, 0], [0, 1], [0, -1]], APPROACH = 6 + 3;
        WORLDS.forEach(function (W) {
            build(W);
            var m = floorMesh, MW = m.w, MH = m.h, T = walkableTable();
            var sentinel = 0, pairs = 0, rises = [];
            for (var gy = 0; gy < MH; gy++) for (var gx = 0; gx < MW; gx++) {
                var i = gy * MW + gx;
                if (!T.has[i]) continue;
                for (var k = 0; k < 4; k++) {
                    var nx = gx + NB[k][0], ny = gy + NB[k][1];
                    if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
                    var n = ny * MW + nx;
                    if (!T.has[n]) continue;
                    var froms = (T.low[n] !== T.top[n]) ? [T.top[n], T.low[n]] : [T.top[n]];
                    for (var fi = 0; fi < froms.length; fi++) {
                        pairs++;
                        var r = getWalkableLayerTopAt((gx + 0.5) * GS, (gy + 0.5) * GS, froms[fi]);
                        if (r.idx === -1 && r.type === 0 && r.topH === 0) {
                            sentinel++;
                            if (!a1Ex) { var c = LAB.cellWorld(i); a1Ex = W.tag + " world(" + c.x + "," + c.y + ") from h=" + f2(froms[fi]) + " layers " + LAB.fmtLayers(LAB.layers(i)); }
                        }
                    }
                    // WORLD coords now: placeWorld below may re-centre the window.
                    if (T.low[i] > T.top[n] + STEP_UP && gx >= 10 && gy >= 10 && gx < MW - 10 && gy < MH - 10 &&
                        !(grid[i] || grid[n]))
                        rises.push({ to: LAB.cellWorld(i), from: LAB.cellWorld(n), dx: -NB[k][0], dy: -NB[k][1], rise: T.low[i] - T.top[n], fromH: T.top[n] });
                }
            }
            sentinelTotal += sentinel; pairsTotal += pairs; risesTotal += rises.length;
            a1Detail.push(W.tag + "=" + sentinel);

            // Walk at most 40 rises per world, evenly spaced through scan order.
            var pick = evenly(rises, 40);
            var wWalks = 0, wAppr = 0, wBad = 0, wClimb = 0, wJumps = 0, wJAppr = 0, wJBad = 0;
            pick.forEach(function (R) {
                var riseKey = wcell(R.to.x, R.to.y), edge = { x: (R.from.x + R.to.x) / 2, y: (R.from.y + R.to.y) / 2 };
                var target = { x: R.to.x + R.dx * 3 * GS, y: R.to.y + R.dy * 3 * GS };
                // A2 + A3: walk into the rise.
                LAB.placeWorld(R.from.x, R.from.y, "top"); dropEnemies();
                var st = { appr: false, run: 0, maxRun: 0, eye: 0, maxSink: 0, at: null, prevH: LAB.h(), stood: 0 };
                var observe = function (s) {
                    dropEnemies();
                    var inRise = wcell(s.x, s.y) === riseKey;
                    if (inRise || Math.hypot(s.x - edge.x, s.y - edge.y) < APPROACH) st.appr = true;
                    if (!s.air) maxJolt = Math.max(maxJolt, s.h - st.prevH);
                    st.prevH = s.h;
                    if (inRise && !s.air && LAB.standingLayer(0.15)) st.stood++;
                    var ls = LAB.layers(s.cell), low = LAB.lowestWalkable(ls);
                    if (!low) { st.run = 0; return; }
                    var sink = low.z - s.h;
                    if (sink > STEP_UP) { st.run++; if (st.run > st.maxRun) st.maxRun = st.run; } else st.run = 0;
                    if (sink > st.maxSink) { st.maxSink = sink; st.at = "world(" + Math.round(s.x) + "," + Math.round(s.y) + ") h=" + f2(s.h) + " layers " + LAB.fmtLayers(ls); }
                    if (ls.length === 1 && LAB.walkable(ls[0].t) && s.h + LAB.EYE_H < ls[0].z) st.eye++;
                };
                LAB.walkTo(target.x, target.y, { maxTicks: 240, onTick: observe });
                for (var d = 0; d < 30; d++) { LAB.tick(1); observe(snap(240 + d)); }      // then stand still for 0.5 s
                wWalks++;
                if (st.appr) {
                    wAppr++;
                    // > 15 consecutive ticks (0.25 s) more than STEP_UP below the
                    // LOWEST walkable layer = standing inside rock, not a transient
                    // of the 30%/tick Z ease (10277) on a legitimate step.
                    if (st.maxRun > 15 || st.eye > 0) {
                        wBad++;
                        if (!worst || st.maxSink > worst.sink)
                            worst = { sink: st.maxSink, s: W.tag + " rise " + f2(R.rise) + "h into world(" + R.to.x + "," + R.to.y + "): feet " + f2(st.maxSink) + "h below ground for " + st.maxRun + " ticks, eye in terrain " + st.eye + " ticks, at " + st.at };
                    }
                    if (st.stood > 0) {
                        wClimb++;
                        if (!climbEx) climbEx = W.tag + " rise " + f2(R.rise) + "h from h=" + f2(R.fromH) + " into world(" + R.to.x + "," + R.to.y + ") layers " + LAB.fmtLayers(LAB.layersAt(LAB.toLocal(R.to.x, R.to.y).x, LAB.toLocal(R.to.x, R.to.y).y)) + ": stood on it grounded for " + st.stood + " ticks";
                    }
                }
                // A4: the same rise, jumping from the neighbour's centre.
                LAB.placeWorld(R.from.x, R.from.y, "top"); dropEnemies();
                equipment.boots = { canJump: true }; jumpPressed = true;
                var js = { appr: false, bad: 0, ex: null, prev: null };
                var jobs = function (s) {
                    dropEnemies();
                    if (s.air && (wcell(s.x, s.y) === riseKey || Math.hypot(s.x - edge.x, s.y - edge.y) < APPROACH)) js.appr = true;
                    if (js.prev && js.prev.air && !s.air) {
                        var lo = LAB.lowestWalkable(LAB.layers(s.cell));
                        if (lo && lo.z - s.h > STEP_UP) { js.bad++; if (!js.ex) js.ex = "landed at h=" + f2(s.h) + " world(" + Math.round(s.x) + "," + Math.round(s.y) + ") layers " + LAB.fmtLayers(LAB.layers(s.cell)); }
                    }
                    js.prev = s;
                };
                LAB.walkTo(target.x, target.y, { maxTicks: 240, onTick: jobs });
                for (var d2 = 0; d2 < 60; d2++) { LAB.tick(1); jobs(snap(240 + d2)); }
                equipment.boots = null; jumpPressed = false;
                wJumps++;
                if (js.appr) { wJAppr++; if (js.bad) { wJBad++; if (!jEx) jEx = W.tag + " rise " + f2(R.rise) + "h from h=" + f2(R.fromH) + ": " + js.ex; } }
            });
            walks += wWalks; approached += wAppr; bad += wBad; climbed += wClimb;
            jumps += wJumps; jApproached += wJAppr; jBad += wJBad;
            a2Detail.push(W.tag + " " + wBad + "/" + wAppr + "/" + wWalks);
            a3Detail.push(W.tag + " " + wClimb + "/" + wAppr);
            a4Detail.push(W.tag + " " + wJBad + "/" + wJAppr + "/" + wJumps);
        });
        LAB.metric("physics.picker_sentinel_returns", sentinelTotal);
        LAB.metric("physics.steep_rises_walked", walks);
        LAB.metric("physics.max_grounded_rise_per_tick", maxJolt, "h");
        LAB.metric("physics.steep_rises_climbed", climbed);
        LAB.check("physics: floor picker never fabricates ground at h=0 for a cell that has walkable layers",
            pairsTotal > 0 && sentinelTotal === 0,
            (pairsTotal > 0 ? "" : "PRECONDITION FAILED: no (cell, neighbour) pair scanned; ") +
            "getWalkableLayerTopAt (7831) returned the no-walkable-layer sentinel {topH:0,idx:-1,type:0} (7901) for " +
            sentinelTotal + " of " + pairsTotal + " (cell, neighbour top/lowest layer) pairs [" + a1Detail.join(" ") + "]" +
            (a1Ex ? "; first: " + a1Ex : ""));
        LAB.check("physics: walking up a rise steeper than STEP_UP never sinks the feet below the ground or the eye into the terrain",
            approached > 0 && bad === 0,
            (approached === 0 ? "PRECONDITION FAILED: no walk approached a rise (" + walks + " walks, " + risesTotal + " rises found); " : "") +
            "bad/approached/walked per world: " + a2Detail.join(", ") + " (step() 10085, pick 10272, ease 10277)" +
            (worst ? "; worst: " + worst.s : ""));
        LAB.check("physics: walking into a rise steeper than STEP_UP never lifts a grounded player onto it (a rise that high is a wall, not a curb)",
            approached > 0 && climbed === 0,
            (approached === 0 ? "PRECONDITION FAILED: no walk approached a rise; " : "") +
            "walks that ended standing grounded on the rise / approached, per world: " + a3Detail.join(", ") +
            " (picker 7889 rejects a layer > STEP_UP above; STEP_UP is 'max height you can step onto like a curb', 7841)" +
            (climbEx ? "; first: " + climbEx : ""));
        LAB.check("physics: a jump toward a rise steeper than STEP_UP never lands the player below the ground",
            jApproached > 0 && jBad === 0,
            (jApproached === 0 ? "PRECONDITION FAILED: no jump reached a rise while airborne (" + jumps + " jumps); " : "") +
            "jumps that landed > STEP_UP below the landing cell's lowest walkable layer / jumps that reached the rise airborne / jumps, per world: " +
            a4Detail.join(", ") + " (airborne landing 10141-10160 takes groundZ from the picker)" + (jEx ? "; first: " + jEx : ""));
    });

    // ── B. walking down: no micro-falls, but real drops fall [D12] ────────────
    scenario("B", "physics: gentle open-ground slopes", function () {
        var lines = 0, walked = 0, eps = 0, micro = 0, airTicks = 0, detail = [], ex = null, preFail = [];
        ENDLESS_SEEDS.forEach(function (seed) {
            var W = build({ tag: "endless" + seed, kind: "endless", seed: seed, far: false });
            // Candidate straight 800 u lines on ordinary open surface: no wall
            // within 10 u, every cell one plain floor layer, every cell-to-cell
            // step within the picker's step window, > MOUTH_CLEAR from any mouth.
            function lineInfo(wx0, wy0, ang) {
                var ca = Math.cos(ang), sa = Math.sin(ang), prevCell = null, prevZ = 0, desc = 0;
                for (var d = 0; d <= 800; d += 4) {
                    var x = wx0 + ca * d, y = wy0 + sa * d, l = LAB.toLocal(x, y);
                    if (l.x < 30 || l.y < 30 || l.x > worldW - 30 || l.y > worldH - 30) return null;
                    if (isInGridWall(l.x, l.y, 10)) return null;
                    if (nearMouth(l.x, l.y, MOUTH_CLEAR)) return null;
                    var i = LAB.meshIndex(l.x, l.y);
                    if (i < 0 || floorMesh.layerCount[i] !== 1 || floorMesh.l0Type[i] !== 1) return null;
                    var key = wcell(x, y);
                    if (key !== prevCell) {
                        var z = floorMesh.l0TopZ[i];
                        if (prevCell !== null) {
                            if (z - prevZ > STEP_UP || prevZ - z > STEP_DOWN) return null;
                            if (z < prevZ) desc += prevZ - z;
                        }
                        prevCell = key; prevZ = z;
                    }
                }
                return desc;
            }
            var cands = [], half = Math.floor(WINDOW_CHUNKS / 2);
            var c0x = (windowCX + half) * CHUNK_SIZE + CHUNK_SIZE / 2, c0y = (windowCY + half) * CHUNK_SIZE + CHUNK_SIZE / 2;
            for (var sy = -3; sy <= 3; sy++) for (var sx = -3; sx <= 3; sx++) for (var a = 0; a < 16; a++) {
                var wx = c0x + sx * 240, wy = c0y + sy * 240, ang = a * Math.PI / 8;
                var desc = lineInfo(wx, wy, ang);
                if (desc !== null && desc > 2) cands.push({ wx: wx, wy: wy, a: a, desc: desc });
            }
            cands.sort(function (p, q) { return (q.desc - p.desc) || (p.wx - q.wx) || (p.wy - q.wy) || (p.a - q.a); });
            var chosen = [];
            for (var ci = 0; ci < cands.length && chosen.length < 2; ci++)
                if (!chosen.some(function (o) { return o.wx === cands[ci].wx && o.wy === cands[ci].wy; })) chosen.push(cands[ci]);
            lines += chosen.length;
            if (!chosen.length) preFail.push(W.tag + ": no descending open line found");
            chosen.forEach(function (Ln) {
                var ang = Ln.a * Math.PI / 8, tx = Ln.wx + Math.cos(ang) * 800, ty = Ln.wy + Math.sin(ang) * 800;
                LAB.placeWorld(Ln.wx, Ln.wy, "top"); dropEnemies();
                var prev = null, walkedDesc = 0, lEps = 0, lMicro = 0;
                LAB.walkTo(tx, ty, { maxTicks: 1500, onTick: function (s) {
                    dropEnemies();
                    var ls = LAB.layers(s.cell), top = LAB.topWalkable(ls);
                    s.top = top ? top.z : NaN; s.key = wcell(s.x, s.y);
                    if (s.air) airTicks++;
                    if (prev) {
                        if (s.key !== prev.key && s.top < prev.top) walkedDesc += prev.top - s.top;
                        if (s.air && !prev.air) {
                            lEps++;
                            var drop = (s.key !== prev.key) ? prev.top - s.top : prev.h - s.top;
                            if (drop <= STEP_DOWN) {
                                lMicro++;
                                if (!ex) ex = W.tag + " world(" + Math.round(s.x) + "," + Math.round(s.y) + ") drop " + LAB.fx(drop, 3) + "h from h=" + f2(prev.h);
                            }
                        }
                    }
                    prev = s;
                } });
                var p = LAB.worldPos(), miss = Math.hypot(p.x - tx, p.y - ty);
                var ok = miss < 16 && walkedDesc > 2;
                if (!ok) preFail.push(W.tag + " line@(" + Ln.wx + "," + Ln.wy + ")a" + Ln.a + ": ended " + LAB.fx(miss, 0) + "u from target, descended " + f2(walkedDesc) + "h");
                else walked++;
                eps += lEps; micro += lMicro;
                detail.push(W.tag + " (" + Ln.wx + "," + Ln.wy + ")a" + Ln.a + " desc " + f2(walkedDesc) + "h: " + lMicro + " micro-falls/" + lEps + " airborne");
            });
        });
        LAB.metric("physics.microfall_episodes", micro);
        LAB.metric("physics.slope_airborne_ticks", airTicks);
        var pre = lines > 0 && walked === lines;
        LAB.check("physics: walking down a gentle open-ground slope (every step within STEP_DOWN) never makes the player airborne",
            pre && micro === 0,
            (pre ? "" : "PRECONDITION FAILED: " + preFail.join("; ") + "; ") +
            detail.join("; ") + " (edge-fall threshold pos.floorZ > groundZ2 + 3 at 10179 = 0.075h)" + (ex ? "; first: " + ex : ""));
    });

    // The other half of the STEP_DOWN contract: a cell whose walkable layers
    // are ALL out of the step window, with ground more than STEP_DOWN below,
    // must start a fall. Without this, deleting falling altogether would turn
    // the micro-fall check green. Drops come from the mesh, > MOUTH_CLEAR from
    // every mouth. Walked with 60 Hz ticks, and a subset with the real loop at
    // 30 fps (two physics steps per rendered frame).
    scenario("B", "physics: drops larger than STEP_DOWN", function () {
        var walks = 0, entered = 0, late = 0, ex = null, detail = [], fpsWalks = 0, fpsEntered = 0, fpsLate = 0, renderErrs = 0;
        var NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        WORLDS.forEach(function (W) {
            build(W);
            var m = floorMesh, MW = m.w, MH = m.h, drops = [];
            for (var gy = 10; gy < MH - 10; gy++) for (var gx = 10; gx < MW - 10; gx++) {
                var i = gy * MW + gx;
                if (grid[i]) continue;
                var ls = LAB.layers(i);
                if (!LAB.lowestWalkable(ls)) continue;
                var cx = (gx + 0.5) * GS, cy = (gy + 0.5) * GS;
                if (nearMouth(cx, cy, MOUTH_CLEAR)) continue;
                for (var k = 0; k < 4; k++) {
                    var n = (gy + NB[k][1]) * MW + gx + NB[k][0];
                    if (grid[n]) continue;
                    var tn = LAB.topWalkable(LAB.layers(n));
                    if (!tn) continue;
                    var inWin = false, below = -Infinity;
                    ls.forEach(function (l) { if (!LAB.walkable(l.t)) return;
                        if (l.z - tn.z <= STEP_UP && tn.z - l.z <= STEP_DOWN) inWin = true;
                        if (l.z < tn.z - STEP_DOWN && l.z > below) below = l.z; });
                    if (!inWin && below > -Infinity)
                        drops.push({ to: LAB.cellWorld(i), from: LAB.cellWorld(n), dx: -NB[k][0], dy: -NB[k][1], drop: tn.z - below, fromH: tn.z });
                }
            }
            var pick = evenly(drops, 12), wEnt = 0, wLate = 0;
            pick.forEach(function (D, di) {
                [0, 30].forEach(function (fps) {
                    if (fps && di >= 3) return;                   // 30 fps: first 3 drops per world
                    var key = wcell(D.to.x, D.to.y), inT = -1, airT = -1;
                    LAB.placeWorld(D.from.x, D.from.y, "top"); dropEnemies();
                    var mark = LAB.renderErrorMark();
                    LAB.walkTo(D.to.x + D.dx * 3 * GS, D.to.y + D.dy * 3 * GS, { maxTicks: fps ? 60 : 120, fps: fps || undefined, onTick: function (s) {
                        dropEnemies();
                        if (wcell(s.x, s.y) === key && inT < 0) inT = s.t;
                        if (s.air && airT < 0) airT = s.t;
                    } });
                    // A frame whose gameUpdate threw (swallowed by _pt) ran a partial step.
                    renderErrs += LAB.renderErrorsSince(mark);
                    // "Within 3 physics steps": 3 ticks at 60 Hz, 2 rendered frames at 30 fps.
                    var limit = fps ? 2 : 3, isLate = inT >= 0 && (airT < 0 || airT > inT + limit);
                    if (fps) { fpsWalks++; if (inT >= 0) fpsEntered++; if (isLate) fpsLate++; }
                    else { walks++; if (inT >= 0) { entered++; wEnt++; } if (isLate) { late++; wLate++; } }
                    if (isLate && !ex) ex = W.tag + (fps ? " at " + fps + " fps" : "") + " drop " + f2(D.drop) + "h from h=" + f2(D.fromH) + " into world(" + D.to.x + "," + D.to.y + "): entered at step " + inT + ", airborne " + (airT < 0 ? "never" : "at " + airT);
                });
            });
            detail.push(W.tag + " " + wLate + "/" + wEnt + "/" + pick.length + " of " + drops.length);
        });
        LAB.metric("physics.drops_walked", walks + fpsWalks);
        var pre = entered >= 5 && entered === walks && fpsEntered > 0 && fpsEntered === fpsWalks;
        LAB.check("physics: walking off a drop larger than STEP_DOWN on open ground starts a fall within 3 physics steps",
            pre && late === 0 && fpsLate === 0 && renderErrs === 0,
            (pre ? "" : "PRECONDITION FAILED: entered " + entered + "/" + walks + " drops at 60 Hz, " + fpsEntered + "/" + fpsWalks + " at 30 fps (need >= 5, all); ") +
            (renderErrs ? "RENDER ERRORS " + renderErrs + " during the 30 fps walks; " : "") +
            "late-or-never/entered/walked of found, per world: " + detail.join(", ") + "; 30 fps: " + fpsLate + "/" + fpsEntered +
            " (edge fall 10172-10183; STEP_DOWN 'max drop you can walk off without starting to fall', 7842)" + (ex ? "; first: " + ex : ""));
    });

    // ── N4. landing never snaps the player up [N4] ───────────────────────────
    // The airborne landing (10141-10160) takes groundZ from the picker, which
    // accepts a floor up to STEP_UP ABOVE the feet, and sets pos.floorZ to it in
    // one step. Hop continuously (jump whenever grounded) across single-layer
    // open step-ups of 0.4-0.95 h, > MOUTH_CLEAR from any mouth, and judge every
    // landing: the tick it lands must not raise the player more than a walking
    // step can in one tick. Precondition: enough landings on higher ground.
    scenario("N4", "physics: landing on higher ground", function () {
        var lands = 0, uphill = 0, snaps = 0, worst = 0, ex = null, detail = [];
        var NB = [[1, 0], [-1, 0], [0, 1], [0, -1]], RUN = 60;
        WORLDS.forEach(function (W) {
            build(W);
            var m = floorMesh, MW = m.w, MH = m.h, pairs = [];
            for (var gy = 20; gy < MH - 20; gy++) for (var gx = 20; gx < MW - 20; gx++) {
                var i = gy * MW + gx, ls = LAB.layers(i);
                if (grid[i] || ls.length !== 1 || ls[0].t !== 1) continue;
                var cx = (gx + 0.5) * GS, cy = (gy + 0.5) * GS;
                if (nearMouth(cx, cy, MOUTH_CLEAR)) continue;
                for (var k = 0; k < 4; k++) {
                    var n = (gy + NB[k][1]) * MW + gx + NB[k][0], lsn = LAB.layers(n);
                    if (grid[n] || lsn.length !== 1 || lsn[0].t !== 1) continue;
                    var d = ls[0].z - lsn[0].z;
                    if (d < 0.4 || d > 0.95) continue;
                    var ux = -NB[k][0], uy = -NB[k][1], exL = cx - ux * 6, eyL = cy - uy * 6, ok = true;
                    for (var s = -RUN; s <= RUN && ok; s += 4) if (isInGridWall(exL + ux * s, eyL + uy * s, 10)) ok = false;
                    if (ok) { var c = LAB.cellWorld(i); pairs.push({ ex: c.x - ux * 6, ey: c.y - uy * 6, ux: ux, uy: uy }); }
                }
            }
            var pick = evenly(pairs, 20), wLands = 0, wSnaps = 0;
            pick.forEach(function (P) {
                LAB.placeWorld(P.ex - P.ux * RUN, P.ey - P.uy * RUN, "top"); dropEnemies();
                equipment.boots = { canJump: true };
                var prev = null, takeoffH = null;
                var obs = function (s) {
                    dropEnemies();
                    if (!s.air) jumpPressed = true;               // hop again as soon as grounded
                    if (prev && !prev.air && s.air) takeoffH = prev.h;
                    if (prev && prev.air && !s.air) {
                        lands++; wLands++;
                        var dh = s.h - prev.h;
                        worst = Math.max(worst, dh);
                        if (takeoffH !== null && s.h > takeoffH + 0.3) uphill++;
                        if (dh > MAX_WALK_RISE_PER_TICK) { snaps++; wSnaps++; if (!ex) ex = W.tag + " world(" + Math.round(s.x) + "," + Math.round(s.y) + ") landed " + f2(prev.h) + " -> " + f2(s.h) + "h in one tick, layers " + LAB.fmtLayers(LAB.layers(s.cell)); }
                    }
                    prev = s;
                };
                LAB.walkTo(P.ex + P.ux * RUN, P.ey + P.uy * RUN, { maxTicks: 400, arrive: 3, onTick: obs });
                jumpPressed = false;
                for (var t = 0; t < 90 && jumpAirborne; t++) { LAB.tick(1); obs(snap(t)); jumpPressed = false; }
                equipment.boots = null; jumpPressed = false;
            });
            detail.push(W.tag + " " + wSnaps + "/" + wLands + " (" + pick.length + " of " + pairs.length + " steps)");
        });
        LAB.metric("physics.landings", lands);
        LAB.metric("physics.landing_snap_worst", worst, "h");
        var pre = uphill >= 10;
        LAB.check("physics: landing from a jump never lifts the player more in one tick than walking up a step can (0.35 h)",
            pre && snaps === 0,
            (pre ? "" : "PRECONDITION FAILED: only " + uphill + " landings on ground > 0.3 h above the take-off (need >= 10); ") +
            "snaps/landings per world: " + detail.join(", ") + "; " + uphill + " landings on higher ground, worst rise in the landing tick " + f2(worst) +
            "h (landing 10156-10159 sets pos.floorZ = groundZ; the picker accepts a floor up to STEP_UP above the feet, 7889)" + (ex ? "; first: " + ex : ""));
    });

    // ── C. window shifts [D15] ────────────────────────────────────────────────
    // Walk across a chunk line with REAL frames (LAB.frameAt -> loop -> draw),
    // at 60 fps and at 30 fps (two physics steps per rendered frame, one cache
    // bump per frame), so the floor-height cache holds whatever the last draw()
    // read (18967), then observe from wrappers -- the game calls both functions
    // by name: assembleWindow from updateChunks (7491) inside step(),
    // getFloorHeightAt from getWallTopZ, the draw passes and the wallFaceBase
    // precompute. A read is stale if it differs from the game's own
    // getFloorHeightAt called with a guaranteed cache miss (private cache
    // arrays swapped in, live cache untouched) -- so the oracle follows
    // whatever getFloorHeightAt is defined to return (a D6 fix changes both).
    scenario("C", "physics: window shifts", function () {
        var orig = G.assembleWindow, origGFH = G.getFloorHeightAt, cap = null, inAW = false, RD = null;
        var c1 = [], c2 = [], c3 = [], c1Bad = 0, c2Bad = 0, c3Bad = 0, shifted = 0, runs = 0, ctlBad = 0, staleFaces = 0, staleReads = 0;
        var renderErrs = 0, consoleErrs = 0;
        var SK = new Int32Array(1024), SV = new Float32Array(1024), ST = new Int32Array(1024), refTick = -7;
        function coldGFH(x, y) {
            var k = _floorCacheKey, v = _floorCacheVal, t = _floorCacheTickArr, tk = _floorCacheTick;
            _floorCacheKey = SK; _floorCacheVal = SV; _floorCacheTickArr = ST; _floorCacheTick = refTick--;
            try { return origGFH(x, y); }
            finally { _floorCacheKey = k; _floorCacheVal = v; _floorCacheTickArr = t; _floorCacheTick = tk; }
        }
        var gfhWrapper = function (x, y) {
            var v = origGFH(x, y), m = floorMesh;
            if (RD && m) {
                var gx = Math.floor(x / m.gridSize), gy = Math.floor(y / m.gridSize);
                if (gx >= 0 && gy >= 0 && gx < m.w && gy < m.h) {
                    var want = coldGFH(x, y), b = inAW ? RD.aw : RD.after;
                    b.n++;
                    if (v !== want) { b.stale++; if (!b.ex) { var cw = LAB.cellWorld(gy * m.w + gx); b.ex = "world(" + cw.x + "," + cw.y + ") " + f2(v) + " vs " + f2(want); } }
                }
            }
            return v;
        };
        var wrapAW = function (cx, cy) {
            var o0x = windowOriginX, o0y = windowOriginY, w0 = LAB.worldPos(), h0 = LAB.h();
            var pk0 = getWalkableLayerTopAt(pos.x, pos.y, h0).topH, ls0 = LAB.fmtLayers(LAB.layersAt(pos.x, pos.y));
            if (!cap && RD) inAW = true;
            var r;
            try { r = orig.apply(this, arguments); } finally { inAW = false; }
            if (cap || !RD || (o0x === windowOriginX && o0y === windowOriginY)) return r;   // only the measured walk's first shift
            var w1 = LAB.worldPos();
            var pk1 = getWalkableLayerTopAt(pos.x, pos.y, h0).topH, ls1 = LAB.fmtLayers(LAB.layersAt(pos.x, pos.y));
            // Snapshot wallFaceBase BEFORE this wrapper reads anything else.
            var wfb = wallFaceBase ? Float32Array.from(wallFaceBase) : null;
            var stale = 0, ex = null, pStale = false, pi = LAB.meshIndex(pos.x, pos.y);
            for (var gy = 0; gy < floorMesh.h; gy++) for (var gx = 0; gx < floorMesh.w; gx++) {
                var got = origGFH((gx + 0.5) * GS, (gy + 0.5) * GS), want = coldGFH((gx + 0.5) * GS, (gy + 0.5) * GS);
                if (got !== want) { stale++; if (gy * floorMesh.w + gx === pi) pStale = true; if (!ex) ex = "cell(" + gx + "," + gy + ") " + f2(got) + " vs " + f2(want); }
            }
            cap = { w0: w0, w1: w1, pk0: pk0, pk1: pk1, ls0: ls0, ls1: ls1, h0: h0, wfb: wfb, stale: stale, ex: ex, pStale: pStale, cx: cx, cy: cy };
            return r;
        };
        G.assembleWindow = wrapAW;
        try {
            WORLDS.forEach(function (W) {
                if (W.far) return;                     // spawn windows: the first chunk line a player crosses
                [60, 30].forEach(function (fps) {
                    var tag = W.tag + "@" + fps + "fps";
                    runs++;
                    build(W);
                    // A wall-free straight line from the centre chunk that crosses a
                    // chunk line; nearest the line first (fewer real frames to walk).
                    var half = Math.floor(WINDOW_CHUNKS / 2), ccx = windowCX + half, ccy = windowCY + half, line = null;
                    for (var r = 200; r >= 60 && !line; r -= 70) for (var a = 0; a < 16 && !line; a++) {
                        var ang = a * Math.PI / 8, ca = Math.cos(ang), sa = Math.sin(ang);
                        var wx = ccx * CHUNK_SIZE + CHUNK_SIZE / 2 + ca * r, wy = ccy * CHUNK_SIZE + CHUNK_SIZE / 2 + sa * r, free = true;
                        for (var d = 0; d <= 400 && free; d += 4) { var l = LAB.toLocal(wx + ca * d, wy + sa * d); if (isInGridWall(l.x, l.y, 10)) free = false; }
                        var ex = wx + ca * 400, ey = wy + sa * 400;
                        if (free && (Math.floor(ex / CHUNK_SIZE) !== ccx || Math.floor(ey / CHUNK_SIZE) !== ccy)) line = { wx: wx, wy: wy, ex: ex, ey: ey };
                    }
                    if (!line) { c1.push(tag + ": PRECONDITION FAILED no wall-free line across a chunk line"); c1Bad++; c2Bad++; c3Bad++; return; }
                    LAB.placeWorld(line.wx, line.wy, "top"); dropEnemies();
                    cap = null;
                    RD = { aw: { n: 0, stale: 0, ex: null }, after: { n: 0, stale: 0, ex: null } };
                    G.getFloorHeightAt = gfhWrapper;
                    var frames = 0, hBefore = 0, dhShift = 0, post = -1, err0 = LAB.errorCount, rErr = 0;
                    try {
                        for (; frames < 600 && post < 30; frames++) {       // until the shift, then 30 more frames
                            var p = LAB.worldPos();
                            cam.ang = Math.atan2(line.ey - p.y, line.ex - p.x); cam.pitch = 0;
                            LAB.keys({ up: true });
                            if (!cap) hBefore = LAB.h();
                            rErr += LAB.frameAt(1000 / fps);
                            dropEnemies();
                            if (cap) { if (post < 0) dhShift = LAB.h() - hBefore; post++; }
                        }
                    } finally { G.getFloorHeightAt = origGFH; }
                    var rd = RD; RD = null;
                    LAB.keys({});
                    var cErr = LAB.errorCount - err0;
                    renderErrs += rErr; consoleErrs += cErr;
                    var errTxt = (rErr || cErr) ? " RENDER ERRORS " + rErr + " / console.error " + cErr + " during the walk" : "";
                    if (!cap) { c1.push(tag + ": PRECONDITION FAILED no window shift in " + frames + " frames"); c1Bad++; c2Bad++; c3Bad++; return; }
                    shifted++;
                    var moved = Math.hypot(cap.w1.x - cap.w0.x, cap.w1.y - cap.w0.y);
                    var sameGround = moved < 1e-6 && cap.pk0 === cap.pk1 && cap.ls0 === cap.ls1;
                    if (!sameGround || rErr || cErr) c1Bad++;
                    c1.push(tag + " world(" + f2(cap.w0.x) + "," + f2(cap.w0.y) + ") moved " + f2(moved) + "u, picker " + f2(cap.pk0) + "->" + f2(cap.pk1) +
                        ", layers [" + cap.ls0 + "]->[" + cap.ls1 + "], dh over the shift frame " + LAB.fx(dhShift, 3) + errTxt);
                    var nStale = rd.aw.stale + rd.after.stale;
                    staleReads += nStale;
                    if (nStale || rd.aw.n === 0 || rErr || cErr) c2Bad++;
                    c2.push(tag + " inside assembleWindow " + rd.aw.stale + "/" + rd.aw.n + " stale" + (rd.aw.ex ? " e.g. " + rd.aw.ex : "") +
                        ", after it " + rd.after.stale + "/" + rd.after.n + (rd.after.ex ? " e.g. " + rd.after.ex : "") +
                        " (incl. a sweep of every cell right after it returned: " + cap.stale + " stale" + (cap.pStale ? " incl. the player's cell" : "") + ")" +
                        (rd.aw.n === 0 ? " PRECONDITION FAILED: no read inside assembleWindow" : "") + errTxt);
                    // wallFaceBase freshness: rebuild the SAME window twice with the
                    // cache invalidated first; the two rebuilds must agree (control),
                    // and the shift-time array must equal them.
                    bumpFloorCache(); orig(cap.cx, cap.cy); var A = Float32Array.from(wallFaceBase);
                    bumpFloorCache(); orig(cap.cx, cap.cy); var B = Float32Array.from(wallFaceBase);
                    var diff = 0, ctl = 0, maxd = 0, fex = null;
                    if (!cap.wfb || cap.wfb.length !== A.length) diff = -1;
                    else for (var i = 0; i < A.length; i++) {
                        if (A[i] !== B[i]) ctl++;
                        if (cap.wfb[i] !== A[i]) {
                            diff++; maxd = Math.max(maxd, Math.abs(cap.wfb[i] - A[i]));
                            if (!fex) { var cw = LAB.cellWorld(i >> 2); fex = "wall world(" + cw.x + "," + cw.y + ") face " + (i & 3) + " " + f2(cap.wfb[i]) + " vs " + f2(A[i]); }
                        }
                    }
                    if (ctl) ctlBad++;
                    if (diff !== 0 || ctl || rErr || cErr) c3Bad++;
                    if (diff > 0) staleFaces += diff;
                    c3.push(tag + " " + diff + " stale faces (max " + f2(maxd) + "h)" + (ctl ? " CONTROL MISMATCH " + ctl : "") + (fex ? " e.g. " + fex : "") + errTxt);
                    LAB.dropTimers();
                });
            });
        } finally { G.assembleWindow = orig; G.getFloorHeightAt = origGFH; }
        LAB.metric("physics.wallfacebase_stale_faces", staleFaces);
        LAB.metric("physics.stale_floor_height_reads", staleReads);
        LAB.metric("physics.shift_walk_render_errors", renderErrs + consoleErrs);
        var pre = shifted > 0 ? "" : "PRECONDITION FAILED: no world produced a window shift; ";
        LAB.check("physics: a window shift leaves the player's world position and the ground under them unchanged",
            shifted > 0 && c1Bad === 0, pre + c1.join("; ") + " (rebase 7289)");
        LAB.check("physics: getFloorHeightAt never returns a stale floor height across a window shift",
            shifted > 0 && c2Bad === 0, pre + "reads of getFloorHeightAt (7804) that differ from an uncached call of the same function, from the walk up to 30 frames after the shift: " + c2.join("; "));
        LAB.check("physics: wallFaceBase after a window shift matches a rebuild of that window with the floor-height cache invalidated",
            shifted > 0 && c3Bad === 0,
            pre + (ctlBad ? "CONTROL: two cache-invalidated rebuilds disagree; " : "") + c3.join("; ") +
            " (wallFaceBase 6834-6870 reads getFloorHeightAt; cache tick bumped only in draw() 18967)");
    });

    // A new world is assembled by resetEndlessMode -> assembleWindow(0,0)
    // (7604) with the floor-height cache left as the previous world's last
    // draw() filled it. Play another world for 10 real frames, start this one
    // WITHOUT invalidating the cache (what the page does), and compare its
    // wallFaceBase with two cache-invalidated rebuilds of the same window.
    scenario("C", "physics: new world after another", function () {
        var worlds = 0, bad = 0, ctlBad = 0, detail = [], preFail = [], seenKind = {};
        WORLDS.forEach(function (W) {
            if (W.far || seenKind[W.kind]) return;         // the first Cave Test and the first Endless world
            seenKind[W.kind] = true;
            // The previous world: any other non-far world, else the same kind with another seed.
            var P = null;
            WORLDS.forEach(function (o) { if (!P && !o.far && o !== W) P = o; });
            if (!P) P = { tag: "endless" + (W.seed + 1), kind: "endless", seed: W.seed + 1 };
            build(P);
            var reads = LAB.countCalls("getFloorHeightAt"), rErr = 0;
            try { for (var f = 0; f < 10; f++) rErr += LAB.frame(); } finally { reads.restore(); }
            if (reads.calls === 0 || rErr) { preFail.push(W.tag + " after " + P.tag + ": " + reads.calls + " floor reads, " + rErr + " render errors in 10 frames"); return; }
            start(W, true);                         // keepCache: the page never invalidates it here
            var got = Float32Array.from(wallFaceBase), half = Math.floor(WINDOW_CHUNKS / 2);
            bumpFloorCache(); assembleWindow(windowCX + half, windowCY + half); var A = Float32Array.from(wallFaceBase);
            bumpFloorCache(); assembleWindow(windowCX + half, windowCY + half); var B = Float32Array.from(wallFaceBase);
            var diff = 0, ctl = 0, maxd = 0, fex = null;
            for (var i = 0; i < A.length; i++) {
                if (A[i] !== B[i]) ctl++;
                if (got[i] !== A[i]) {
                    diff++; maxd = Math.max(maxd, Math.abs(got[i] - A[i]));
                    if (!fex) { var cw = LAB.cellWorld(i >> 2); fex = "wall world(" + cw.x + "," + cw.y + ") face " + (i & 3) + " " + f2(got[i]) + " vs " + f2(A[i]); }
                }
            }
            worlds++;
            if (ctl) ctlBad++;
            if (diff || ctl) bad++;
            detail.push(W.tag + " after 10 frames of " + P.tag + ": " + diff + " stale faces (max " + f2(maxd) + "h)" + (ctl ? " CONTROL MISMATCH " + ctl : "") + (fex ? " e.g. " + fex : ""));
        });
        var pre = worlds > 0 && !preFail.length;
        LAB.check("physics: a new world's wallFaceBase matches a rebuild of that window with the floor-height cache invalidated, after another world was played",
            pre && bad === 0,
            (pre ? "" : "PRECONDITION FAILED: " + (preFail.join("; ") || "no world") + "; ") +
            (ctlBad ? "CONTROL: two cache-invalidated rebuilds disagree; " : "") + detail.join("; ") +
            " (resetEndlessMode 7604 -> assembleWindow -> wallFaceBase 6834-6870 reads getFloorHeightAt; the cache tick is bumped only in draw() 18967)");
    });

    // ── D. surface walls are solid (regression guard) ─────────────────────────
    // Only the walls[] rect pass (10309-10327) holds the line on most raised
    // terrain: step() skips grid-wall axis collision whenever pos.floorZ > 80,
    // i.e. h > 0.5 ('aboveWalls', 10206). Every grid wall cell is covered by a
    // walls[] rect built from the same chunk data (6483-6495), so there is no
    // wall the rect pass misses to test; the detail reports how many contact
    // ticks ran with grid collision skipped.
    scenario("D", "physics: surface wall collision", function () {
        var approaches = 0, reachedN = 0, inside = 0, detail = [], ex = null, notReached = [], minContact = 1e9;
        var contactTicks = 0, aboveTicks = 0;
        var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        ENDLESS_SEEDS.forEach(function (seed) {
            var W = build({ tag: "endless" + seed, kind: "endless", seed: seed, far: false });
            // Ordinary surface wall cells (grid wall, not a cave wall) nearest the
            // player, each with a clear 5-cell x 7-cell open plain-floor lane on one
            // side; one wall per approach side.
            var found = [], pgx = Math.floor(pos.x / cell), pgy = Math.floor(pos.y / cell);
            for (var r = 3; r < 130 && found.length < 4; r++)
                for (var gy = pgy - r; gy <= pgy + r && found.length < 4; gy++)
                    for (var gx = pgx - r; gx <= pgx + r && found.length < 4; gx++) {
                        if (Math.max(Math.abs(gx - pgx), Math.abs(gy - pgy)) !== r) continue;
                        if (gx < 10 || gy < 10 || gx >= gridW - 10 || gy >= gridH - 10) continue;
                        var i = gy * gridW + gx;
                        if (!grid[i] || (gridCave && gridCave[i])) continue;
                        for (var d = 0; d < 4; d++) {
                            if (found.some(function (o) { return o.d === d; })) continue;
                            // A face at least 3 cells wide (both perpendicular
                            // neighbours are surface walls too), so an oblique
                            // approach slides along it instead of around it.
                            var pa = (gy + DIRS[d][0]) * gridW + (gx + DIRS[d][1]), pb = (gy - DIRS[d][0]) * gridW + (gx - DIRS[d][1]);
                            var ok = !!(grid[pa] && grid[pb]) && !(gridCave && (gridCave[pa] || gridCave[pb]));
                            for (var k = 1; k <= 5 && ok; k++) for (var s = -3; s <= 3 && ok; s++) {
                                var sx = gx + DIRS[d][0] * k + (DIRS[d][1] ? s : 0), sy = gy + DIRS[d][1] * k + (DIRS[d][0] ? s : 0);
                                var si = sy * gridW + sx;
                                if (grid[si] || floorMesh.layerCount[si] !== 1) ok = false;
                            }
                            if (ok) { found.push({ c: LAB.cellWorld(i), d: d }); break; }   // WORLD coords
                        }
                    }
            found.forEach(function (F) {
                var dir = DIRS[F.d], px = -dir[1], py = dir[0], c = F.c;
                // Head-on, and two oblique approaches (start 10 u to one side,
                // aim 10 u to the other) that keep pressing while sliding.
                [0, 10, -10].forEach(function (off) {
                    approaches++;
                    var sx = c.x + dir[0] * 4 * GS + px * off, sy = c.y + dir[1] * 4 * GS + py * off;
                    LAB.placeWorld(sx, sy, "top"); dropEnemies();
                    var near = 0, inWall = 0;
                    LAB.walkTo(c.x - dir[0] * 2 * GS - px * off, c.y - dir[1] * 2 * GS - py * off, { maxTicks: 240, arrive: 1, onTick: function (st) {
                        dropEnemies();
                        if (isInGridWall(pos.x, pos.y, 0, pos.floorZ)) { inWall++; if (!ex) ex = W.tag + " world(" + Math.round(st.x) + "," + Math.round(st.y) + ") inside wall cell world(" + c.x + "," + c.y + ")"; }
                        // Contact: the game's own box test at 7 u (player radius 6
                        // + 1) touches a wall cell -- the face may be a neighbour
                        // of the target cell once the player slides along it.
                        if (isInGridWall(pos.x, pos.y, 7)) { near++; contactTicks++; if ((pos.floorZ || 0) > 80) aboveTicks++; }
                    } });
                    minContact = Math.min(minContact, near);
                    if (near >= 30) reachedN++; else notReached.push(W.tag + " wall world(" + c.x + "," + c.y + ") side " + F.d + " off " + off + " contact " + near + " ticks");
                    if (inWall) inside++;
                });
            });
            detail.push(W.tag + " " + found.length + " walls");
        });
        LAB.metric("physics.wall_contact_ticks_grid_collision_skipped", aboveTicks);
        var pre = approaches >= 12 && reachedN === approaches;
        LAB.check("physics: walking into an ordinary surface wall never puts the player's position inside a wall cell",
            pre && inside === 0,
            (pre ? "" : "PRECONDITION FAILED: " + reachedN + "/" + approaches + " approaches pressed against the wall for >= 30 ticks " + notReached.join(", ") + "; ") +
            detail.join(", ") + ", " + approaches + " approaches (head-on + oblique, min contact " + minContact + " ticks, " + aboveTicks + "/" + contactTicks +
            " contact ticks with pos.floorZ > 80 so only the walls[] rect pass applied), " + inside + " entered a wall cell (isInGridWall 9980 with the player's Z)" + (ex ? "; first: " + ex : ""));
    });

    // An enemy object of the given type, shaped by the game itself: copy of a
    // live enemy from spawnEnemies/chunk spawns (11262), retyped.
    function enemyOfType(typeId, x, y) {
        var tmpl = ENEMY_TEMPLATE;
        if (!tmpl) return null;
        var e = {};
        for (var k in tmpl) e[k] = tmpl[k];
        var T = enemyTypes[typeId];
        e.enemyType = T; e.health = T.health; e.maxHealth = T.health; e.speed = T.speed; e.chaseRange = T.chaseRange;
        e.x = x; e.y = y; e.vx = 0; e.vy = 0; e.z = 0; e.attackState = "idle"; e.attackStateUntil = 0;
        e.lastUpdate = 0; e.aggroAt = 0; e.stunUntil = 0; e.slowUntil = 0; e.burnUntil = 0; e._attackTarget = null;
        return e;
    }
    // A spawn-window point with no wall within 120 u, so neither the player nor
    // an enemy is pinned against one for the first few seconds.
    function openGround() {
        for (var r = 0; r <= 1200; r += 60) for (var a = 0; a < 16; a++) {
            var wx = CHUNK_SIZE / 2 + Math.cos(a * Math.PI / 8) * r, wy = CHUNK_SIZE / 2 + Math.sin(a * Math.PI / 8) * r;
            var l = LAB.toLocal(wx, wy), clear = true;
            for (var dy = -120; dy <= 120 && clear; dy += 6) for (var dx = -120; dx <= 120 && clear; dx += 6)
                if (dx * dx + dy * dy <= 14400 && isInGridWall(l.x + dx, l.y + dy, 0)) clear = false;
            if (clear) return { x: wx, y: wy };
            if (r === 0) break;
        }
        return null;
    }
    function noDefences() { equipment.relic = null; wardActive = false; dashUntil = 0; armorBoostUntil = 0; }

    // ── E. death is reachable [D21] ───────────────────────────────────────────
    // Two lethal hits per Endless seed, no relic/ward/dash/armour boost:
    // (a) straight through the game's damage function; (b) a Scout already
    // inside its reach at the end of its windup, so the NEXT updateEnemies call
    // lands the hit through the game's own attack state machine (11372-11385) --
    // independent of chase, push-apart (N2) and walls. The hit tick must not
    // re-centre the window (the Scout would be saved to its chunk and replaced).
    scenario("E", "physics: death", function () {
        var parts = [], pre = true, dead = 0, trials = 0;
        ENDLESS_SEEDS.forEach(function (seed) {
            var W = { tag: "endless" + seed, kind: "endless", seed: seed, far: false }, t;
            // (a)
            build(W);
            var ea = enemyOfType("normal", pos.x + 200, pos.y);
            enemies = []; noDefences();
            health = 5;
            var dmg0 = stats.totalDamageTaken;
            if (ea) _applyEnemyAttack(ea, ea.enemyType, Date.now());
            var landed = !!ea && stats.totalDamageTaken - dmg0 >= 5 && health === 0;
            for (t = 0; t < 120 && !gameOverState; t++) LAB.tick(1);
            trials++; if (!landed) pre = false; if (gameOverState) dead++;
            parts.push(W.tag + " _applyEnemyAttack(11272): hit " + (landed ? "landed" : "DID NOT LAND") + ", health after 2 s " + f2(health) + ", gameOverState=" + gameOverState);
            // (b)
            build(W);
            var og = openGround();
            var eb = og && (LAB.placeWorld(og.x, og.y, "top"), enemyOfType("fast", pos.x + 8, pos.y));
            if (eb) { eb.attackState = "windup"; eb.attackStateUntil = Date.now(); }
            enemies = eb ? [eb] : []; noDefences();
            health = 5;
            var dB = stats.totalDamageTaken, aw = LAB.countCalls("assembleWindow"), hit = false, lethal = false, shiftsAtHit = 0;
            try {
                LAB.tick(1);
                shiftsAtHit = aw.calls;
                hit = !!eb && stats.totalDamageTaken > dB && eb.attackState === "cooldown";
                lethal = hit && stats.totalDamageTaken - dB >= 5;
            } finally { aw.restore(); }
            for (t = 0; t < 120 && !gameOverState; t++) LAB.tick(1);
            trials++; if (!lethal || shiftsAtHit) pre = false; if (gameOverState) dead++;
            parts.push(W.tag + " Scout windup via updateEnemies: " + (!eb ? "NO open ground/template" : !hit ? "NO hit" : (lethal ? "lethal" : "NON-LETHAL") + " hit") +
                (shiftsAtHit ? " (window shifted on the hit tick)" : "") + ", health 2 s later " + f2(health) + ", gameOverState=" + gameOverState);
        });
        LAB.check("physics: a lethal enemy hit ends the game within 2 s when no phoenix relic is equipped",
            pre && dead === trials,
            (pre ? "" : "PRECONDITION FAILED: a lethal hit did not land; ") + parts.join("; ") +
            " (health clamps at 0 in 11282, regen 10090 runs before the death check 10334)");
    });

    // ── F. every enemy type can land an attack in the open [N2] ───────────────
    // The push-apart shoves the player 20-30 u/s ahead of a chasing enemy, and
    // once the player is pinned against a wall any enemy connects -- so only
    // hits landed while the player is still in the open (no wall cell within a
    // 20 u box, isInGridWall) count, and the trial ends at the first wall, at
    // the first window shift (assembleWindow saves the enemy to its chunk and
    // rebuilds enemies[] with new objects), or when the enemy leaves enemies[].
    // A hit counts only when THIS enemy's windup completed in that tick
    // (attackState windup -> cooldown) and the player took damage.
    scenario("F", "physics: enemy reach", function () {
        var seed = ENDLESS_SEEDS[0], parts = [], fail = 0, chaseFail = 0;
        Object.keys(enemyTypes).forEach(function (id) {
            build({ tag: "endless" + seed, kind: "endless", seed: seed, far: false });
            var og = openGround();
            if (!og) { parts.push(id + ": no open ground"); chaseFail++; return; }
            LAB.placeWorld(og.x, og.y, "top");
            var e = enemyOfType(id, pos.x + 60, pos.y);
            if (!e) { parts.push(id + ": no enemy template"); chaseFail++; return; }
            enemies = [e]; noDefences();
            var minD = 1e9, engaged = 0, hits = 0, t, end = "10 s", aw = LAB.countCalls("assembleWindow");
            try {
                for (t = 0; t < 600; t++) {
                    var d0 = stats.totalDamageTaken, s0 = e.attackState;
                    LAB.tick(1);
                    health = HEALTH_MAX;
                    if (aw.calls > 0) { end = "window shift"; break; }
                    if (enemies.indexOf(e) < 0) { end = "enemy left enemies[]"; break; }
                    if (isInGridWall(pos.x, pos.y, 20)) { end = "wall"; break; }          // no longer open ground
                    var d = Math.hypot(e.x - pos.x, e.y - pos.y);
                    minD = Math.min(minD, d);
                    if (d < 30) engaged++;
                    if (stats.totalDamageTaken > d0 && s0 === "windup" && e.attackState === "cooldown") hits++;
                }
            } finally { aw.restore(); }
            // Engaged for >= 1 s in the open: longer than any windup (750 ms, 1340).
            if (engaged < 60 && hits === 0) chaseFail++;
            if (hits === 0) fail++;
            parts.push(enemyTypes[id].name + " " + hits + " hits in " + f2(t / 60) + " s of open ground (ended: " + end + "; " + f2(engaged / 60) + " s within 30 u, closest " + f2(minD) + " u)");
        });
        LAB.check("physics: every enemy type chasing a stationary player in open ground lands an attack",
            chaseFail === 0 && fail === 0,
            (chaseFail ? "PRECONDITION FAILED: an enemy was never engaged for 1 s in the open; " : "") + parts.join("; ") +
            " (attack reach 6+8*size at 11372 vs player/enemy push-apart 12+8*size at 10042)");
    });

    // ── N5. a new world does not inherit a jump in progress [N5] ──────────────
    // The previous world's player jumps for real (boots + jumpPressed, 10111)
    // and a new world starts 10 ticks later, mid-air -- as when a player starts
    // a new world from the menu or after death. Control: the same sequence
    // with no jump. The new world's first 0.5 s must be the same in both.
    scenario("N5", "physics: new world after a jump", function () {
        var parts = [], bad = 0, pre = true, targets = [];
        if (ENDLESS_SEEDS.length) targets.push({ tag: "endless" + ENDLESS_SEEDS[0], kind: "endless", seed: ENDLESS_SEEDS[0] });
        if (CAVE_SEEDS.length) targets.push({ tag: "cave" + CAVE_SEEDS[0], kind: "cave", seed: CAVE_SEEDS[0] });
        targets.forEach(function (T) {
            function run(jump) {
                var P = { tag: "prev", kind: "endless", seed: ENDLESS_SEEDS[0] || 424242 };
                build(P);
                // Settle first: the spawn puts the feet at h=0 below the ground,
                // and a jump from there lands on the next tick (the N4 snap).
                equipment.boots = { canJump: true };
                LAB.tick(30);
                jumpPressed = !!jump;
                LAB.tick(10); dropEnemies();
                var wasAir = jumpAirborne;
                jumpPressed = false;
                // Start the new world exactly as the page does: no freshPage in between.
                LAB.seedRandom(T.seed); bumpFloorCache();
                if (T.kind === "cave") { LAB.startCaveTest(T.seed); LAB.seedRandom(T.seed); } else LAB.startEndless(T.seed);
                LAB.freezeDay(0.5);
                var st = { wasAir: wasAir, air0: jumpAirborne, vz0: jumpVelZ, hs: [LAB.h()] };
                for (var t = 0; t < 30; t++) { dropEnemies(); LAB.tick(1); st.hs.push(LAB.h()); }
                return st;
            }
            var ctl = run(false), jmp = run(true), maxd = 0, at = -1;
            for (var i = 0; i < ctl.hs.length; i++) { var dd = Math.abs(jmp.hs[i] - ctl.hs[i]); if (dd > maxd) { maxd = dd; at = i; } }
            if (!jmp.wasAir || ctl.wasAir || ctl.air0) pre = false;
            var ok = !jmp.air0 && jmp.vz0 === 0 && maxd < 0.01;
            if (!ok) bad++;
            parts.push(T.tag + ": previous player airborne " + jmp.wasAir + " (control " + ctl.wasAir + "); right after the start jumpAirborne=" + jmp.air0 + " jumpVelZ=" + f2(jmp.vz0) +
                " (control " + ctl.air0 + "/" + f2(ctl.vz0) + "); height differs from the control by up to " + f2(maxd) + "h" + (at >= 0 && maxd >= 0.01 ? " at tick " + at + " (" + f2(jmp.hs[at]) + " vs " + f2(ctl.hs[at]) + ")" : ""));
        });
        LAB.check("physics: a new world starts with the player on the ground even if the previous world ended mid-jump",
            pre && targets.length > 0 && bad === 0,
            (pre && targets.length ? "" : "PRECONDITION FAILED: the previous world's jump did not leave the player airborne (or the control did); ") +
            parts.join("; ") + " (resetEndlessMode 7511-7640 resets pos.floorZ but not jumpAirborne/jumpVelZ, 721)");
    });
})();
LAB.finish();
undefined;
