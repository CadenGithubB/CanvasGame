(0, eval)(slurp("tools/webui/harness/_game_env.js"));
LAB.init(__out, slurp, __engine, __argv);
// The verdict protocol is one line per check: only the error's first line goes
// in the detail (a stack would split it and the id would swallow the detail).
LAB.check("enemies: game script evaluates without throwing", LAB.load(__argv[0]), (LAB.loadError || "").split("\n")[0]);

// game_enemies_harness.js -- enemy AI movement, collision and awareness in the
// Endless crawler (WebPage_Games.h). Every check states how enemies SHOULD
// behave; tools/webui/tests/test_game_enemies.py lists the ones today's code
// fails (KNOWN_BUGS) with the audit reference for each.
//
// usage (via tools/webui/game_lab.py): <extracted game js> [--seeds a,b] [--endless-seeds a,b]
//   --seeds          Cave Test worlds (default 12345)
//   --endless-seeds  normal Endless worlds (default 424242,777000). Without it,
//                    the generation survey ALSO reads ten extra spawn windows
//                    (GEN_EXTRA below, ~2.6 s): F3 embeds 2 of 340 enemies on the
//                    default worlds, too few to see a partial fix.
//
// WORLDS (each measurement starts from a freshly built world, LAB.freshPage first):
//   surface   normal Endless spawn window (surface enemies only near spawn)
//   cavewin   the same seed, window re-centred (placeWorld -> updateChunks ->
//             assembleWindow) onto the nearest cave network: freshly generated
//             chunks, so both surface and underground enemies, flags intact
//   cavetest  Cave Test with caveEnemies:true (underground enemies only)
//
// NUMBERS TAKEN FROM THE GAME, NOT COPIED INTO THE HARNESS
//   moveRad(e)  the radius the game's OWN movement code passes to moveSpatialActor
//               for this enemy, recorded by spying moveSpatialActor while
//               updateEnemies runs a knockback step, a patrol step and a chase
//               step for it (L11363, L11303, L11443 today: 8*size*0.6). The
//               largest recorded value is used -- the most restrictive test the
//               enemy's movement makes.
//   ARRIVAL     the waypoint arrival radius, found by bisection on the game's
//               own patrol step: the largest distance to the current waypoint at
//               which updateEnemies switches waypoint without moving and without
//               a wall test (L11295 today: 14 u).
//   A fix that changes either in the game changes what these checks judge by.
//   (_game_env.js has no argument-recording spy -- LAB.countCalls only counts --
//   so spyOn below is local.)
//
// HOW ENEMIES ARE STEPPED
//   enemyTick() runs the enemy-facing lines of gameUpdate (L19404, L19406-19407):
//   updateDayNight(dt) (it computes playerUnderground), updateEnemies(dt), then
//   separateEnemies(), with the virtual clock advanced one 60 Hz frame first.
//   The AI reads only pos.x/pos.y, shopMarker and fortressAllies from the
//   player side, so the reference player can be put anywhere in the window
//   (setPlayerAt: on a chosen layer) without re-centring it. The player's own
//   push-apart (repelFromEnemies, step() L10034) is NOT run there: checks that
//   say "held in place" mean exactly that; landing a hit in play is physics'
//   check (N2). Scenarios whose outcome depends on the PLAYER's own movement or
//   standing (walks, the roof) use LAB.tick / LAB.walkTo -- the real gameUpdate
//   at a 60 Hz step. They do not use walkTo's {fps} mode: nothing here depends
//   on frame rate (no falls, no floor-cache reads between frames), and every
//   rendered frame would cost a full renderFrame.
//
// "NOT CHASING" FOR THE PATROL CHECKS
//   Patrol runs only when the enemy is within 350 u of the player and not
//   chasing (L11451-11454). The harness uses the game's market safe zone:
//   `inMarketSafe` (L11420) is true when the player is within 100 u of
//   shopMarker, so shopMarker is set on the reference point for the session.
//   updateGuardTower() (which also reads shopMarker) is NOT run by enemyTick.

if (LAB.loaded) (function () {
    var G = (0, eval)("this");
    var endlessSeeds = LAB.seeds([424242, 777000, 777], "endless-seeds");
    var caveTestSeeds = LAB.seeds([12345, 424242, 777]);
    var GEN_EXTRA = LAB.opt("endless-seeds", null) ? [] : [1, 777, 55555, 31337, 2024, 98765, 4242, 99991, 123457, 600001];
    var WORLDS = [];
    endlessSeeds.forEach(function (s) { WORLDS.push({ kind: "surface", seed: s, label: "endless " + s }); });
    endlessSeeds.forEach(function (s) { WORLDS.push({ kind: "cavewin", seed: s, label: "endless " + s + " cave" }); });
    caveTestSeeds.forEach(function (s) { WORLDS.push({ kind: "cavetest", seed: s, label: "cavetest " + s }); });
    GEN_EXTRA.forEach(function (s) { WORLDS.push({ kind: "surface", seed: s, label: "endless " + s, genOnly: true }); });

    // ── helpers ──────────────────────────────────────────────────────────────
    function wx(x) { return x + windowOriginX; }
    function wy(y) { return y + windowOriginY; }
    function fmtW(e) { return Math.round(wx(e.x)) + "," + Math.round(wy(e.y)); }
    function kindOf(e) { return e.underground ? "cave" : "surface"; }
    function inc(o, k, n) { o[k] = (o[k] || 0) + (n === undefined ? 1 : n); }
    function head(a, n) { return a.slice(0, n || 4).join("; ") + (a.length > (n || 4) ? "; ..." : ""); }
    function pct(a, b) { return b ? LAB.fx(100 * a / b, 1) + "%" : "n/a"; }
    // Wrap a game function the game calls BY NAME; fn sees its arguments first.
    function spyOn(name, fn) {
        var orig = G[name];
        G[name] = function () { fn.apply(this, arguments); return orig.apply(this, arguments); };
        return function () { G[name] = orig; };
    }
    function enemyTick(n) {
        for (var i = 0; i < n; i++) {
            LAB.advance(LAB.FRAME_MS);
            updateDayNight(LAB.FIXED_DT);
            updateEnemies(LAB.FIXED_DT);
            separateEnemies();
        }
    }
    // Put the AI's reference player at a window-local point without running
    // updateChunks, standing on the lowest ("bottom") or top walkable layer.
    function setPlayerAt(x, y, bottom) {
        pos.x = x; pos.y = y; vel.x = 0; vel.y = 0;
        var ls = LAB.layersAt(x, y);
        var l = bottom ? LAB.lowestWalkable(ls) : LAB.topWalkable(ls);
        LAB.setH(l ? l.z : 0);
        jumpAirborne = false; jumpVelZ = 0;
    }
    // Test relocation must move the complete physical body, not carry a feetZ
    // from the old location/storey. Read authored layers independently of the
    // movement query so an incorrect support selection remains observable.
    function placeEnemyAt(e, x, y, bottom) {
        var ls = LAB.layersAt(x, y);
        var support = bottom ? LAB.lowestWalkable(ls) : LAB.topWalkable(ls);
        if (!support) throw new Error("PRECONDITION FAILED: enemy relocation has no authored support at " + x + "," + y);
        e.x = x; e.y = y; e.feetZ = support.z * 25; e.z = e.feetZ;
        e.underground = !!bottom;
        delete e.supportId;
    }
    // Independent cylinder-vs-authored-wall oracle for the separation fixture.
    // The former corner-in-cell oracle describes a square, and would call a
    // safely rounded body beside a corner embedded. Read the wall's regular
    // authored prism directly; this fixture does not judge ceiling closures.
    function separationWallOverlap(e, radius) {
        var gx0 = Math.floor((e.x - radius) / cell), gx1 = Math.floor((e.x + radius) / cell);
        var gy0 = Math.floor((e.y - radius) / cell), gy1 = Math.floor((e.y + radius) / cell);
        for (var gy = gy0; gy <= gy1; gy++) for (var gx = gx0; gx <= gx1; gx++) {
            if (gx < 0 || gy < 0 || gx >= gridW || gy >= gridH) return true;
            var wi = gy * gridW + gx;
            if (!grid[wi]) continue;
            var dx = Math.max(0, Math.abs(e.x - (gx + 0.5) * cell) - cell * 0.5);
            var dy = Math.max(0, Math.abs(e.y - (gy + 0.5) * cell) - cell * 0.5);
            if (Math.hypot(dx, dy) >= radius - 1e-6) continue;
            var floor = LAB.lowestWalkable(LAB.layersAt((gx + 0.5) * cell, (gy + 0.5) * cell));
            if (!floor) throw new Error("PRECONDITION FAILED: separation wall has no authored base");
            var base = floor.z * 25, top = base + 240 * (wallHeights ? wallHeights[wi] : 1);
            if (wallFaceBase) base = Math.min.apply(null, Array.prototype.slice.call(wallFaceBase, wi * 4, wi * 4 + 4)) * 25;
            if (wallMaxTopZ && Number.isFinite(wallMaxTopZ[wi])) top = Math.min(top, wallMaxTopZ[wi] * 25);
            if (e.feetZ < top - 1e-6 && e.feetZ + 70 > base + 1e-6) return true;
        }
        return false;
    }
    // One enemy's whole state (every own field) -- restore deletes fields a
    // trial added (stunUntil, _attackTarget, ...).
    function snapE(e) { return Object.assign({}, e); }
    function restE(e, s) { for (var k in e) if (!(k in s)) delete e[k]; for (var k2 in s) e[k2] = s[k2]; }
    function snapEnemies() { var list = enemies.slice(); return { list: list, st: list.map(snapE) }; }
    function restoreEnemies(sn) { sn.list.forEach(function (e, i) { restE(e, sn.st[i]); }); enemies = sn.list.slice(); }
    // Run fn with `enemies` = [e] and the reference player / market marker saved.
    function alone(e, fn) {
        var s = snapE(e), list0 = enemies, P0 = { x: pos.x, y: pos.y, fz: pos.floorZ }, shop0 = shopMarker;
        enemies = [e];
        try { return fn(); }
        finally { restE(e, s); enemies = list0; pos.x = P0.x; pos.y = P0.y; pos.floorZ = P0.fz; vel.x = 0; vel.y = 0; shopMarker = shop0; health = HEALTH_MAX; }
    }
    // Find the live enemy object at a WORLD position (objects are rebuilt by
    // assembleWindow, so identity does not survive a re-centre).
    function enemyAtWorld(p, tol) {
        var best = null, bd = tol;
        enemies.forEach(function (e) { var d = Math.hypot(wx(e.x) - p.x, wy(e.y) - p.y); if (d <= bd) { bd = d; best = e; } });
        return best;
    }

    // The game's movement radius for this enemy (see the header).
    var _radCache = {};
    function moveRad(e) {
        var key = e.enemyType.id + "|" + (e.enemyType.size || 1);
        if (key in _radCache) return _radCache[key];
        var radii = [];
        var unspy = spyOn("moveSpatialActor", function (actor, dx, dy, rad) { if (actor === e) radii.push(rad); });
        try {
            alone(e, function () {           // knockback + patrol step, chase held off by the market zone
                e.vx = 40; e.vy = 0; e.stunUntil = 0; e.aggroAt = 0; e.attackState = "idle"; e.lastUpdate = Date.now() - 100;
                e.patrolWaypoints = [{ x: e.x + 100, y: e.y }, { x: e.x - 100, y: e.y }]; e.patrolIdx = 0;
                pos.x = e.x + 30; pos.y = e.y; shopMarker = { x: pos.x, y: pos.y };
                updateEnemies(LAB.FIXED_DT);
            });
            alone(e, function () {           // chase step toward a player 40 u away in view
                for (var k = 0; k < 8; k++) {
                    var q = { x: e.x + 40 * Math.cos(k * Math.PI / 4), y: e.y + 40 * Math.sin(k * Math.PI / 4) };
                    if (hasLineOfSight(e.x, e.y, q.x, q.y)) { pos.x = q.x; pos.y = q.y; break; }
                }
                shopMarker = null; e.vx = 0; e.vy = 0; e.stunUntil = 0; e.lastUpdate = Date.now() - 100;
                updateEnemies(LAB.FIXED_DT);
            });
        } finally { unspy(); }
        var r = radii.length ? Math.max.apply(null, radii) : NaN;
        _radCache[key] = r;
        return r;
    }
    // The game's waypoint arrival radius (see the header). NaN if the patrol
    // step no longer "arrives" by distance at all.
    function measureArrival(e) {
        function arrives(d) {
            var calls = 0, unspy = spyOn("moveSpatialActor", function (actor) { if (actor === e) calls++; });
            try {
                return alone(e, function () {
                    e.vx = 0; e.vy = 0; e.stunUntil = 0; e.aggroAt = 0; e.attackState = "idle"; e.lastUpdate = Date.now() - 100;
                    e.patrolWaypoints = [{ x: e.x + d, y: e.y }, { x: e.x - 300, y: e.y }]; e.patrolIdx = 0;
                    pos.x = e.x; pos.y = e.y + 30; shopMarker = { x: pos.x, y: pos.y };
                    var x0 = e.x, y0 = e.y;
                    updateEnemies(LAB.FIXED_DT);
                    return e.patrolIdx === 1 && e.x === x0 && e.y === y0 && calls === 0;
                });
            } finally { unspy(); }
        }
        if (arrives(100) || !arrives(0.01)) return NaN;
        var lo = 0.01, hi = 100;
        for (var k = 0; k < 30; k++) { var mid = (lo + hi) / 2; if (arrives(mid)) lo = mid; else hi = mid; }
        return lo;
    }
    var ARRIVAL = NaN;

    function build(W) {
        LAB.freshPage();
        _radCache = {};
        if (W.kind === "cavetest") {
            LAB.seedRandom(W.seed);
            LAB.startCaveTest(W.seed, { caveEnemies: true });
        } else {
            LAB.startEndless(W.seed);
        }
        LAB.freezeDay(0.5);
        LAB.releasePad();
        if (W.kind === "cavewin") {
            var nets = LAB.findCaveNetworks(10);
            if (!nets.length) { W.missing = "no cave network within 10 regions"; return false; }
            var c = nets[0].net.chambers[0];
            W.where = "region " + nets[0].rx + "," + nets[0].ry + " chamber0 " + Math.round(c.cx) + "," + Math.round(c.cy);
            LAB.placeWorld(c.cx, c.cy, "top");
        }
        if (isNaN(ARRIVAL) && enemies.length) ARRIVAL = measureArrival(enemies[0]);
        return true;
    }
    var TIMES = {};
    function forWorlds(name, kinds, fn, withGenOnly) {
        var t0 = LAB.realNow();
        WORLDS.forEach(function (W) {
            if (kinds && kinds.indexOf(W.kind) < 0) return;
            if (W.genOnly && !withGenOnly) return;
            LAB.scenario("enemies: " + name + " [" + W.label + "]", function () {
                if (!build(W)) { LAB.note(name + " [" + W.label + "] skipped: " + W.missing); return; }
                fn(W);
            });
        });
        TIMES[name.replace(/[^a-z0-9]+/gi, "_")] = LAB.realNow() - t0;
    }
    function centreChunkBounds(margin) {      // local coords of the window's central chunk
        var half = Math.floor(WINDOW_CHUNKS / 2), m = margin || 0;
        var x0 = half * CHUNK_SIZE, y0 = half * CHUNK_SIZE;
        return { x0: x0 + m, y0: y0 + m, x1: x0 + CHUNK_SIZE - m, y1: y0 + CHUNK_SIZE - m };
    }
    function inCentreChunk(p, margin) { var b = centreChunkBounds(margin); return p.x >= b.x0 && p.x < b.x1 && p.y >= b.y0 && p.y < b.y1; }
    function inWorldBounds(q) { return q.x >= 3 * cell && q.y >= 3 * cell && q.x <= worldW - 3 * cell && q.y <= worldH - 3 * cell; }
    function marketSafeAt(q) { return shopMarker && Math.hypot(q.x - shopMarker.x, q.y - shopMarker.y) < 100; }
    // A cell under the cave roof: cave floor below a ceiling below the cap.
    function isRoofCell(ls) {
        var cap = LAB.capOf(ls), ce = LAB.ceilingOf(ls), fl = LAB.lowestWalkable(ls);
        return !!(cap && ce && fl && fl.t === 1 && fl.z < ce.z && ce.z < cap.z);
    }
    var T0 = LAB.realNow();

    // ═════════════════════════════════════════════════════════════════════════
    // 1. Generation: every freshly assembled enemy [F1, F3, ruin order]
    // ═════════════════════════════════════════════════════════════════════════
    var GEN = { n: 0, byKind: {}, onWall: [], embedded: [], embByType: {}, typeCount: {}, degenerate: [], degByKind: {},
                wpInWall: [], wpInWallByKind: {}, worlds: [], noPatrol: 0, noRad: 0, rad: {}, perWorld: {} };
    forWorlds("generation survey", null, function (W) {
        var n = 0, pw = GEN.perWorld[W.label] = { n: 0, embedded: 0, onWall: 0, degenerate: 0, wpInWall: 0 };
        enemies.forEach(function (e) {
            n++; GEN.n++; pw.n++;
            var k = kindOf(e), tk = k + "." + e.enemyType.id, R = moveRad(e);
            GEN.rad[e.enemyType.id] = R;
            inc(GEN.byKind, k); inc(GEN.typeCount, tk);
            if (isNaN(R)) { GEN.noRad++; return; }
            if (isInGridWall(e.x, e.y, 0)) {                                   // its own cell is a wall
                var ru = null, rd = 60;                                        // nearest ruin (window list, L7102)
                (ruins || []).forEach(function (r) { var d = Math.hypot(r.x - e.x, r.y - e.y); if (d < rd) { rd = d; ru = r; } });
                GEN.onWall.push(W.label + " " + tk + "@" + fmtW(e) + (ru ? " (" + Math.round(rd) + " u from a " + ru.ruinType + " ruin)" : " (no ruin within 60 u)"));
                pw.onWall++;
            } else if (isInGridWall(e.x, e.y, R)) {                            // open cell, wall in the footprint
                inc(GEN.embByType, tk); pw.embedded++;
                GEN.embedded.push(W.label + " " + tk + "@" + fmtW(e));
            }
            // A 2-waypoint patrol can freeze only when one point is within the
            // arrival radius of BOTH waypoints, i.e. they are < 2*ARRIVAL apart;
            // a span (largest pairwise distance) >= 2*ARRIVAL cannot freeze.
            // Fewer than two waypoints = no patrol at all (L11453), not counted.
            var w = e.patrolWaypoints || [], span = 0;
            for (var a = 0; a < w.length; a++) for (var b = a + 1; b < w.length; b++)
                span = Math.max(span, Math.hypot(w[a].x - w[b].x, w[a].y - w[b].y));
            if (w.length < 2) GEN.noPatrol++;
            else if (!(span >= 2 * ARRIVAL)) { inc(GEN.degByKind, k); pw.degenerate++; GEN.degenerate.push(W.label + " " + tk + "@" + fmtW(e) + " span=" + LAB.fx(span, 1)); }
            var bad = w.filter(function (p) { return isInGridWall(p.x, p.y, 0); }).length;   // centre in a wall cell
            if (bad) { inc(GEN.wpInWallByKind, k); pw.wpInWall++; GEN.wpInWall.push(W.label + " " + tk + "@" + fmtW(e)); }
        });
        GEN.worlds.push(W.label + (W.where ? " (" + W.where + ")" : "") + ": " + n);
    }, true);

    // ═════════════════════════════════════════════════════════════════════════
    // 2. Patrol progress [F1: degenerate waypoints; no wall slide L11307]
    // ═════════════════════════════════════════════════════════════════════════
    // "Keeps walking" = distance the enemy's own AI moved it (sum of the
    // per-frame displacement made by updateEnemies) in the measured 10 s. A
    // patrol that ping-pongs over a short span still walks; an enemy whose
    // waypoint index flips every decision (both waypoints inside the arrival
    // radius, L11295) or that bounces off a wall toward two blocked waypoints
    // (L11307) walks ~0.
    var PAT = { measured: 0, excl: { chased: 0, far: 0, dead: 0, noPatrol: 0 }, frozen: [], frozenBy: {}, measuredBy: {}, sessions: 0, shortSpan: 0, perWorld: {} };
    var WARM_FRAMES = 900, MEASURE_FRAMES = 600, GROUP_R = 250;
    forWorlds("patrol progress", null, function (W) {
        var list = enemies.slice(), done = [], pw = PAT.perWorld[W.label] = [0, 0];
        var savedShop = shopMarker;
        for (var i = 0; i < list.length; i++) {
            var a = list[i];
            if (done.indexOf(a) >= 0) continue;
            var P = { x: a.x + 30, y: a.y };
            var group = list.filter(function (e) { return done.indexOf(e) < 0 && Math.hypot(e.x - P.x, e.y - P.y) < GROUP_R; });
            group.forEach(function (e) { done.push(e); });
            setPlayerAt(P.x, P.y, a.underground);
            shopMarker = { x: P.x, y: P.y };              // market safe zone (L11420)
            PAT.sessions++;
            enemyTick(WARM_FRAMES);
            var st = group.map(function (e) { return { e: e, x0: e.x, y0: e.y, px: 0, py: 0, path: 0, maxd: 0, aggro: false, far: false, dead: false }; });
            for (var f = 0; f < MEASURE_FRAMES; f++) {
                // One enemyTick, split so only the enemy's OWN movement
                // (updateEnemies) counts as walking -- being shoved by
                // separateEnemies() is not patrolling.
                LAB.advance(LAB.FRAME_MS);
                updateDayNight(LAB.FIXED_DT);
                st.forEach(function (s) { s.px = s.e.x; s.py = s.e.y; });
                updateEnemies(LAB.FIXED_DT);
                st.forEach(function (s) { s.path += Math.hypot(s.e.x - s.px, s.e.y - s.py); });
                separateEnemies();
                for (var j = 0; j < st.length; j++) {
                    var s = st[j], e = s.e;
                    s.maxd = Math.max(s.maxd, Math.hypot(e.x - s.x0, e.y - s.y0));
                    if (e.aggroAt) s.aggro = true;
                    if (Math.hypot(e.x - P.x, e.y - P.y) >= 350) s.far = true;
                    if (e.health <= 0) s.dead = true;
                }
            }
            st.forEach(function (s) {
                var e = s.e, k = kindOf(e) + "." + e.enemyType.id;
                var biome = e.underground ? "cave" : getBiomeAt(wx(e.x), wy(e.y));
                if (!(e.patrolWaypoints && e.patrolWaypoints.length > 1)) { PAT.excl.noPatrol++; return; }
                if (s.aggro) { PAT.excl.chased++; return; }
                if (s.far) { PAT.excl.far++; return; }
                if (s.dead) { PAT.excl.dead++; return; }
                PAT.measured++; pw[1]++; inc(PAT.measuredBy, k); inc(PAT.measuredBy, "kind." + kindOf(e));
                if (s.maxd <= 20) PAT.shortSpan++;
                if (s.path <= 20) {
                    pw[0]++;
                    inc(PAT.frozenBy, k); inc(PAT.frozenBy, "biome." + biome); inc(PAT.frozenBy, "kind." + kindOf(e));
                    PAT.frozen.push(W.label + " " + k + "@" + fmtW(e) + " walked " + LAB.fx(s.path, 1));
                }
            });
        }
        shopMarker = savedShop;
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 3. Chase to a player held in place: regression guard (expected PASS)
    // ═════════════════════════════════════════════════════════════════════════
    // Enemy pipeline only (no step(), so no repelFromEnemies push-back): this
    // guards chase NAVIGATION -- that an enemy in view closes the distance. In
    // play the push-back keeps enemies out of reach (N2); physics owns that
    // ("every enemy type chasing a stationary player in open ground lands an attack").
    function chaseSpot(e, D) {
        for (var k = 0; k < 8; k++) {
            var th = k * Math.PI / 4;
            var q = { x: e.x + D * Math.cos(th), y: e.y + D * Math.sin(th) };
            if (!inWorldBounds(q)) continue;
            if (isInGridWall(q.x, q.y, 6)) continue;                       // somewhere the player can stand
            if (!hasLineOfSight(e.x, e.y, q.x, q.y)) continue;             // the game's own LOS says "in view"
            if (marketSafeAt(q)) continue;
            if (D >= e.chaseRange) continue;
            return q;
        }
        return null;
    }
    var CH = { trials: 0, ok: 0, fails: [] };
    forWorlds("chase in the open", null, function (W) {
        enemies.slice().forEach(function (e) {
            var P = chaseSpot(e, 100);
            if (!P) return;
            var from = fmtW(e);
            alone(e, function () {
                setPlayerAt(P.x, P.y, e.underground);           // on the enemy's own level
                var reached = false;
                for (var t = 0; t < 600 && !reached; t++) { enemyTick(1); if (e.attackState && e.attackState !== "idle") reached = true; }
                CH.trials++;
                if (reached) CH.ok++;
                else CH.fails.push(W.label + " " + kindOf(e) + "." + e.enemyType.id + " from " + from + " ended " + LAB.fx(Math.hypot(e.x - P.x, e.y - P.y), 1) + "u from player");
            });
        });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 3b. Back to patrol after a chase past a wall [F2: no wall slide in patrol, L11307]
    // ═════════════════════════════════════════════════════════════════════════
    // The player stands 60-160 u away where the game's LOS (a centre line) is
    // clear but the enemy's own footprint grazes a wall on the way, so the
    // chase has to slide along it (L11447-11449). Once it reaches attack
    // windup, the player steps into a market safe zone (L11420): the enemy
    // stops chasing and patrols. It must get back to its route -- within the
    // game's arrival radius of one of its waypoints -- within 20 s. Only
    // well-formed patrols are used (every waypoint on an open cell and in view
    // of the spawn point, what generatePatrolWaypoints L11211 guarantees), and
    // no enemy embedded at spawn, so F1/F3 are not what is measured.
    var F2 = { trials: 0, ok: 0, noReach: 0, noDisplace: 0, noSpot: 0, fails: [], perWorld: {} };
    forWorlds("return to patrol after a chase", null, function (W) {
        var n = 0, pw = F2.perWorld[W.label] = [0, 0];
        enemies.slice().forEach(function (e) {
            if (n >= 40) return;
            var wps = e.patrolWaypoints || [], R = moveRad(e);
            if (wps.length < 2 || isInGridWall(e.x, e.y, R)) return;
            if (!wps.every(function (w) { return !isInGridWall(w.x, w.y, 0) && hasLineOfSight(e.x, e.y, w.x, w.y); })) return;
            var P = null;
            for (var k = 0; k < 16 && !P; k++) for (var D = 60; D <= 160 && !P; D += 20) {
                var th = k * Math.PI / 8, q = { x: e.x + D * Math.cos(th), y: e.y + D * Math.sin(th) };
                if (!inWorldBounds(q) || isInGridWall(q.x, q.y, 6) || marketSafeAt(q) || D >= e.chaseRange) continue;
                if (!hasLineOfSight(e.x, e.y, q.x, q.y)) continue;
                var graze = false;
                for (var s = 0.1; s < 0.9 && !graze; s += 0.05) if (isInGridWall(e.x + (q.x - e.x) * s, e.y + (q.y - e.y) * s, R)) graze = true;
                if (graze) P = q;
            }
            if (!P) { F2.noSpot++; return; }
            var from = fmtW(e);
            alone(e, function () {
                var sx = e.x, sy = e.y;
                setPlayerAt(P.x, P.y, e.underground);
                var reached = false, t;
                for (t = 0; t < 600 && !reached; t++) { enemyTick(1); if (e.attackState && e.attackState !== "idle") reached = true; }
                if (!reached) { F2.noReach++; return; }
                // The critic's F2 observable is recovery after a real chase
                // displacement, not ordinary patrol from the spawn point.
                if (Math.hypot(e.x - sx, e.y - sy) < 40) { F2.noDisplace++; return; }
                shopMarker = { x: pos.x, y: pos.y };
                var best = Infinity;
                for (t = 0; t < 1200 && !(best < ARRIVAL); t++) {
                    enemyTick(1);
                    e.patrolWaypoints.forEach(function (w) { best = Math.min(best, Math.hypot(w.x - e.x, w.y - e.y)); });
                }
                F2.trials++; n++; pw[1]++;
                if (best < ARRIVAL) { F2.ok++; pw[0]++; }
                else F2.fails.push(W.label + " " + kindOf(e) + "." + e.enemyType.id + "@" + from + " stopped " + LAB.fx(best, 1) + "u from its nearest waypoint");
            });
        });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 4. Separation next to walls [F4: _separatePair tests only the centre cell, L19282]
    // ═════════════════════════════════════════════════════════════════════════
    // Sites are taken where enemies live: around each real enemy of the world
    // (array order), the first point within 4 cells that has a wall within 2
    // cells and where every cluster member fits at its own movement radius.
    var SEP = { sites: 0, caveSites: 0, members: 0, pushed: 0, embedded: [], startEmbedded: 0, byType: {}, perWorld: {} };
    var SEP_OFF = [[0, 0], [0.6, 0.2], [-0.2, 0.6], [-0.4, -0.5]];
    var SUB = [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [3, 3], [-3, -3], [3, -3], [-3, 3]];
    forWorlds("separation near walls", null, function (W) {
        // Cluster members: real enemies of this world, the two widest (Brutes) and the two narrowest.
        var pool = enemies.slice().sort(function (a, b) { return (b.enemyType.size || 1) - (a.enemyType.size || 1); });
        var members = [];
        [0, 1].forEach(function (i) { if (pool[i]) members.push(pool[i]); });
        for (var i = pool.length - 1; i >= 0 && members.length < 4; i--) if (members.indexOf(pool[i]) < 0) members.push(pool[i]);
        if (members.length < 2) { LAB.note("separation [" + W.label + "]: fewer than 2 enemies"); return; }
        var rads = members.map(moveRad);
        var sn = snapEnemies();
        function wallWithin2(gx, gy) {
            var cave = false, any = false;
            for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
                var gi = (gy + dy) * gridW + gx + dx;
                if (grid[gi]) { any = true; if (gridCave && gridCave[gi]) cave = true; }
            }
            return any ? (cave ? "cave" : "plain") : null;
        }
        var sites = [];
        for (var ai = 0; ai < sn.list.length && sites.length < 12; ai++) {
            var an = sn.st[ai], gx0 = Math.floor(an.x / cell), gy0 = Math.floor(an.y / cell), got = null;
            if (sites.some(function (s) { return Math.hypot(s.x - an.x, s.y - an.y) < 150; })) continue;
            for (var r = 0; r <= 4 && !got; r++) for (var dy = -r; dy <= r && !got; dy++) for (var dx = -r; dx <= r && !got; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                var gx = gx0 + dx, gy = gy0 + dy;
                if (gx < 4 || gy < 4 || gx >= gridW - 4 || gy >= gridH - 4 || grid[gy * gridW + gx]) continue;
                var kind = wallWithin2(gx, gy);
                if (!kind) continue;
                for (var li = 0; li < SUB.length && !got; li++) {
                    var cx = (gx + 0.5) * cell + SUB[li][0], cy = (gy + 0.5) * cell + SUB[li][1];
                    var clear = members.every(function (e, j) { return SEP_OFF.every(function (o) { return !isInGridWall(cx + o[0], cy + o[1], rads[j]); }); });
                    if (clear) got = { x: cx, y: cy, kind: kind, bottom: !!an.underground };
                }
            }
            if (got && !sites.some(function (s) { return Math.hypot(s.x - got.x, s.y - got.y) < 150; })) sites.push(got);
        }
        var pw = SEP.perWorld[W.label] = [0, 0];
        sites.forEach(function (s, si) {
            var rot = si % 4;                                 // vary which member gets which offset
            members.forEach(function (e, j) {
                var o = SEP_OFF[(j + rot) % members.length];
                placeEnemyAt(e, s.x + o[0], s.y + o[1], s.bottom);
                e.vx = 0; e.vy = 0;
                if (separationWallOverlap(e, rads[j])) SEP.startEmbedded++;
            });
            var start = members.map(function (e) { return { x: e.x, y: e.y }; });
            enemies = members.slice();
            pos.x = s.x; pos.y = s.y;
            for (var k = 0; k < 30; k++) separateEnemies();
            SEP.sites++;
            if (s.kind === "cave") SEP.caveSites++;
            members.forEach(function (e, j) {
                SEP.members++; pw[1]++;
                if (Math.hypot(e.x - start[j].x, e.y - start[j].y) >= 3) SEP.pushed++;
                if (separationWallOverlap(e, rads[j])) {
                    inc(SEP.byType, e.enemyType.id); pw[0]++;
                    SEP.embedded.push(W.label + " " + e.enemyType.id + " site " + Math.round(wx(s.x)) + "," + Math.round(wy(s.y)) +
                        " -> " + Math.round(wx(e.x)) + "," + Math.round(wy(e.y)));
                }
            });
        });
        restoreEnemies(sn);
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 5. Collision parity with the surface player [F6 ring: L9999/L10014/L10314]
    // ═════════════════════════════════════════════════════════════════════════
    function surfaceSubject() {
        var s = null;
        enemies.forEach(function (e) { if (!s && !e.underground && e.enemyType.id === "normal") s = e; });
        enemies.forEach(function (e) { if (!s && !e.underground) s = e; });
        return s;
    }
    var DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    // Pairs A -> B, 3 cells either side of a wall cell Wc chosen by pick(gi),
    // nearest to the player first, 60 u apart, in WORLD coordinates (walking
    // may re-centre the window).
    function wallPairs(pick, subj, strictB) {
        var here = LAB.worldPos(), cands = [], R = moveRad(subj);
        for (var gy = 8; gy < gridH - 8; gy++) for (var gx = 8; gx < gridW - 8; gx++) {
            var gi = gy * gridW + gx;
            if (!grid[gi] || !pick(gi)) continue;
            var Wc = { x: (gx + 0.5) * cell, y: (gy + 0.5) * cell };
            for (var d = 0; d < 4; d++) {
                var A = { x: Wc.x - DIRS[d][0] * 3 * cell, y: Wc.y - DIRS[d][1] * 3 * cell };
                var B = { x: Wc.x + DIRS[d][0] * 3 * cell, y: Wc.y + DIRS[d][1] * 3 * cell };
                if (isInGridWall(A.x, A.y, R)) continue;
                if (strictB ? isInGridWall(B.x, B.y, R) : grid[Math.floor(B.y / cell) * gridW + Math.floor(B.x / cell)]) continue;
                cands.push({ W: { x: wx(Wc.x), y: wy(Wc.y) }, A: { x: wx(A.x), y: wy(A.y) }, B: { x: wx(B.x), y: wy(B.y) },
                             d: Math.hypot(wx(Wc.x) - here.x, wy(Wc.y) - here.y) });
                break;
            }
        }
        cands.sort(function (a, b) { return a.d - b.d; });
        var picked = [];
        cands.forEach(function (c) { if (!picked.some(function (p) { return Math.hypot(p.W.x - c.W.x, p.W.y - c.W.y) < 60; })) picked.push(c); });
        return picked;
    }
    // Relocate the surface subject to A (window-local) with waypoints [B, A],
    // alone, market-safe so it patrols; 15 s. Returns {best, enteredWall}.
    function patrolAcross(se, A2, B2, wallCell) {
        return alone(se, function () {
            placeEnemyAt(se, A2.x, A2.y, false);
            se.vx = 0; se.vy = 0; se.patrolIdx = 0; se.lastUpdate = 0; se.aggroAt = 0;
            se.attackState = "idle"; se.attackStateUntil = 0;
            se.patrolWaypoints = [{ x: B2.x, y: B2.y }, { x: A2.x, y: A2.y }];
            shopMarker = { x: pos.x, y: pos.y };
            var best = Infinity, entered = false;
            for (var f = 0; f < 900; f++) {
                enemyTick(1);
                best = Math.min(best, Math.hypot(se.x - B2.x, se.y - B2.y));
                if (wallCell && Math.floor(se.x / cell) === wallCell.gx && Math.floor(se.y / cell) === wallCell.gy) entered = true;
            }
            return { best: best, entered: entered };
        });
    }
    // 5a. Where a surface player walks across a cave-wall cell (grid wall AND
    //     gridCave), a surface enemy can follow.
    var TRV = { pairs: 0, ok: 0, fails: [], walkFail: 0, noSurfaceEnemy: 0, subjectEmbeddedAtA: 0,
                apiPts: 0, apiEnemySolid: 0, apiPlayerSolid: 0, apiDisagree: 0 };
    forWorlds("surface enemy crosses where the player walks", ["cavewin", "cavetest"], function (W) {
        // API-level census (METRIC only): same footprint, with and without the player's Z.
        var m = floorMesh, ceil = new Uint8Array(m.w * m.h);
        for (var i = 0; i < m.w * m.h; i++) if (LAB.ceilingOf(LAB.layers(i))) ceil[i] = 1;
        function nearCave(gx, gy) {
            for (var dy = -3; dy <= 3; dy++) for (var dx = -3; dx <= 3; dx++) {
                var X = gx + dx, Y = gy + dy;
                if (X >= 0 && Y >= 0 && X < m.w && Y < m.h && ceil[Y * m.w + X]) return true;
            }
            return false;
        }
        var savedUG = playerUnderground;
        playerUnderground = false;
        for (var gy = 0; gy < gridH; gy++) for (var gx = 0; gx < gridW; gx++) {
            if (!nearCave(gx, gy)) continue;
            var x = (gx + 0.5) * cell, y = (gy + 0.5) * cell;
            var top = LAB.topWalkable(LAB.layersAt(x, y));
            if (!top) continue;
            TRV.apiPts++;
            var es = isInGridWall(x, y, 4.8), ps = isInGridWall(x, y, 4.8, 60 + 40 * top.z);
            if (es) TRV.apiEnemySolid++;
            if (ps) TRV.apiPlayerSolid++;
            if (es && !ps) TRV.apiDisagree++;
        }
        playerUnderground = savedUG;

        var subj0 = surfaceSubject();
        if (!subj0) { TRV.noSurfaceEnemy++; LAB.note("traversal [" + W.label + "]: no surface enemy in this world"); return; }
        var picked = wallPairs(function (gi) { return gridCave && gridCave[gi]; }, subj0, false);
        var tried = 0;
        for (var ci = 0; ci < picked.length && tried < 5; ci++) {
            var c = picked[ci];
            // Precondition: the surface player really walks A -> B (real input path).
            LAB.placeWorld(c.A.x, c.A.y, "top");
            var ug = false;
            var tr = LAB.walkTo(c.B.x, c.B.y, { maxTicks: 180, arrive: 8, onTick: function (s) { if (s.ug) ug = true; } });
            var end = LAB.worldPos();
            if (Math.hypot(end.x - c.B.x, end.y - c.B.y) > 10 || ug || !tr.length) { TRV.walkFail++; continue; }
            var se = surfaceSubject();
            if (!se) { TRV.noSurfaceEnemy++; continue; }
            var A2 = LAB.toLocal(c.A.x, c.A.y), B2 = LAB.toLocal(c.B.x, c.B.y);
            if (isInGridWall(A2.x, A2.y, moveRad(se))) { TRV.subjectEmbeddedAtA++; continue; }
            tried++;
            var r = patrolAcross(se, A2, B2, null);
            TRV.pairs++;
            if (r.best <= 22) TRV.ok++;
            else TRV.fails.push(W.label + " A=" + Math.round(c.A.x) + "," + Math.round(c.A.y) + " B=" + Math.round(c.B.x) + "," + Math.round(c.B.y) +
                " closest " + LAB.fx(r.best, 1) + "u (" + se.enemyType.id + ", cave-wall cell " + Math.round(c.W.x) + "," + Math.round(c.W.y) + ")");
        }
    });
    // 5b. The other direction: a plain wall cell (grid wall, NOT gridCave) that
    //     stops the surface player also stops a surface enemy. Guards against
    //     an over-permissive ring fix (enemies ignoring walls).
    var TRB = { pairs: 0, entered: [], reachedB: 0, playerCrossed: 0, noSurfaceEnemy: 0, subjectEmbeddedAtA: 0 };
    forWorlds("surface enemy blocked where the player is blocked", ["surface", "cavewin"], function (W) {
        var subj0 = surfaceSubject();
        if (!subj0) { TRB.noSurfaceEnemy++; return; }
        var picked = wallPairs(function (gi) { return !(gridCave && gridCave[gi]); }, subj0, true);
        var tried = 0;
        for (var ci = 0; ci < picked.length && tried < 4; ci++) {
            var c = picked[ci];
            LAB.placeWorld(c.A.x, c.A.y, "top");
            var tr = LAB.walkTo(c.B.x, c.B.y, { maxTicks: 180, arrive: 8 });
            var end = LAB.worldPos();
            if (Math.hypot(end.x - c.B.x, end.y - c.B.y) <= 10 && tr.length) { TRB.playerCrossed++; continue; }   // the player got past: not a blocking wall
            var se = surfaceSubject();
            if (!se) { TRB.noSurfaceEnemy++; continue; }
            var A2 = LAB.toLocal(c.A.x, c.A.y), B2 = LAB.toLocal(c.B.x, c.B.y), Wl = LAB.toLocal(c.W.x, c.W.y);
            if (isInGridWall(A2.x, A2.y, moveRad(se))) { TRB.subjectEmbeddedAtA++; continue; }
            tried++;
            var r = patrolAcross(se, A2, B2, { gx: Math.floor(Wl.x / cell), gy: Math.floor(Wl.y / cell) });
            TRB.pairs++;
            if (r.best <= 22) TRB.reachedB++;
            if (r.entered) TRB.entered.push(W.label + " " + se.enemyType.id + " A=" + Math.round(c.A.x) + "," + Math.round(c.A.y) +
                " wall cell " + Math.round(c.W.x) + "," + Math.round(c.W.y) + " (player stopped " + LAB.fx(Math.hypot(end.x - c.B.x, end.y - c.B.y), 1) + "u short of B)");
        }
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 6. Awareness across the cave roof [F7: LOS is 2D, hasLineOfSight L9940, chase L11423]
    // ═════════════════════════════════════════════════════════════════════════
    // Roof pairs use the REAL gameUpdate (LAB.tick) so the player's own physics
    // decides where they stand. Every roof point lies inside the window's
    // centre chunk (24 u margin) so placing the player there does not re-centre
    // the window: a re-centre runs the enemy save pass, which drops the
    // underground flag (D19, persistence owns it) and would make a flag-based
    // LOS fix look broken. Each pair is wrapped in LAB.countCalls("assembleWindow");
    // a pair that re-centred anyway is dropped and counted, and the world rebuilt.
    function roofSpot(e, dists, ok) {
        for (var k = 0; k < 16; k++) for (var di = 0; di < dists.length; di++) {
            var D = dists[di], th = k * Math.PI / 8;
            var q = { x: e.x + D * Math.cos(th), y: e.y + D * Math.sin(th) };
            if (!inCentreChunk(q, 24) || D >= e.chaseRange || marketSafeAt(q)) continue;
            if (!ok(LAB.layersAt(q.x, q.y), q)) continue;
            if (!hasLineOfSight(e.x, e.y, q.x, q.y)) continue;
            return { x: q.x, y: q.y, D: D };
        }
        return null;
    }
    // One phase: the player placed on `layer` at P, the enemy alone, 90 real ticks.
    function roofPhase(e, P, layer) {
        var rec = LAB.countCalls("assembleWindow"), r = { chased: false, attacked: false, ugAll: true, ugAny: false };
        try {
            alone(e, function () {
                LAB.placeWorld(wx(P.x), wy(P.y), layer);
                r.h0 = LAB.h();
                for (var t = 0; t < 90; t++) {
                    LAB.tick(1); health = HEALTH_MAX;
                    if (e.aggroAt) r.chased = true;
                    if (e.attackState && e.attackState !== "idle") r.attacked = true;
                    if (playerUnderground) r.ugAny = true; else r.ugAll = false;
                }
                r.h = LAB.h(); r.flag = e.underground;
            });
        } finally { rec.restore(); }
        r.recentres = rec.calls;
        return r;
    }
    var ROOF = { pairs: 0, violations: [], ctlNoChase: 0, ctlFlagCleared: 0, capInvalid: 0, recentred: 0, tried: 0, noSpot: 0 };
    var RROOF = { pairs: 0, violations: [], attacked: 0, ctlNoChase: 0, floorInvalid: 0, recentred: 0, tried: 0 };
    var LAT = { trials: 0, reached: [], chased: 0, belowSurface: 0, maxJump: 0, noSpot: 0 };
    forWorlds("awareness across the cave roof", ["cavewin", "cavetest"], function (W) {
        // 6a. A cave enemy and a player standing on the roof above the cave.
        var targets = enemies.filter(function (e) { return e.underground; }).map(function (e) { return { x: wx(e.x), y: wy(e.y), id: e.enemyType.id }; });
        var pairsHere = 0;
        for (var ti = 0; ti < targets.length && pairsHere < 6; ti++) {
            var T = targets[ti], e = enemyAtWorld(T, 0.01);
            if (!e) continue;
            var P = roofSpot(e, [60, 90, 120], isRoofCell);
            if (!P) { ROOF.noSpot++; continue; }
            ROOF.tried++;
            var capL = LAB.capOf(LAB.layersAt(P.x, P.y));
            var A = roofPhase(e, P, "top"), B = roofPhase(e, P, "bottom");
            if (A.recentres || B.recentres) { ROOF.recentred++; build(W); continue; }
            if (!(Math.abs(A.h - capL.z) < 0.5 && !A.ugAny)) { ROOF.capInvalid++; continue; }
            if (!B.chased || !B.ugAll) { ROOF.ctlNoChase++; if (!B.flag) ROOF.ctlFlagCleared++; continue; }
            ROOF.pairs++; pairsHere++;
            if (A.chased) ROOF.violations.push(W.label + " " + T.id + "@" + Math.round(T.x) + "," + Math.round(T.y) + " player " + Math.round(wx(P.x)) + "," + Math.round(wy(P.y)) +
                " D=" + P.D + " cap h=" + LAB.fx(capL.z, 2));
        }
        // 6b. A surface enemy and a player standing on the cave floor below it.
        var starg = enemies.filter(function (e) { return !e.underground; }).map(function (e) { return { x: wx(e.x), y: wy(e.y), id: e.enemyType.id }; });
        pairsHere = 0;
        for (var si = 0; si < starg.length && pairsHere < 6; si++) {
            var S = starg[si], se = enemyAtWorld(S, 0.01);
            if (!se) continue;
            var Q = roofSpot(se, [60, 90, 120], isRoofCell);
            if (!Q) continue;
            RROOF.tried++;
            var fl = LAB.lowestWalkable(LAB.layersAt(Q.x, Q.y));
            var A2 = roofPhase(se, Q, "bottom"), B2 = roofPhase(se, Q, "top");
            if (A2.recentres || B2.recentres) { RROOF.recentred++; build(W); continue; }
            if (!(Math.abs(A2.h - fl.z) < 0.5 && A2.ugAll)) { RROOF.floorInvalid++; continue; }
            if (!B2.chased || B2.ugAny) { RROOF.ctlNoChase++; continue; }
            RROOF.pairs++; pairsHere++;
            if (A2.attacked) RROOF.attacked++;
            if (A2.chased) RROOF.violations.push(W.label + " " + S.id + "@" + Math.round(S.x) + "," + Math.round(S.y) + " player on the cave floor " +
                Math.round(wx(Q.x)) + "," + Math.round(wy(Q.y)) + " D=" + Q.D + " floor h=" + LAB.fx(fl.z, 2) + (A2.attacked ? " ATTACKED" : ""));
        }
        // 6c. A cave enemy and a player on open ground (no ceiling, no cap)
        //     away from every cave mouth: at least 150 u from each entrance, and
        //     the straight line to the enemy passes no closer than 80 u to one,
        //     so the only way to reach the player is through rock. Enemy
        //     pipeline (the player stands still; no re-centre possible).
        var ents = LAB.entrances();
        function farFromMouths(p, e0) {
            var pw = { x: wx(p.x), y: wy(p.y) }, ew = { x: wx(e0.x), y: wy(e0.y) };
            return ents.every(function (E) {
                if (Math.hypot(E.x - pw.x, E.y - pw.y) < 150) return false;
                var vx = pw.x - ew.x, vy = pw.y - ew.y, L2 = vx * vx + vy * vy;
                var t = L2 ? Math.max(0, Math.min(1, ((E.x - ew.x) * vx + (E.y - ew.y) * vy) / L2)) : 0;
                return Math.hypot(ew.x + t * vx - E.x, ew.y + t * vy - E.y) >= 80;
            });
        }
        var latHere = 0;
        enemies.filter(function (e) { return e.underground; }).forEach(function (e) {
            if (latHere >= 6) return;
            var P = null;
            for (var k = 0; k < 16 && !P; k++) for (var D = 120; D <= 240 && !P; D += 40) {
                var th = k * Math.PI / 8, q = { x: e.x + D * Math.cos(th), y: e.y + D * Math.sin(th) };
                if (!inWorldBounds(q) || D >= e.chaseRange || marketSafeAt(q) || isInGridWall(q.x, q.y, 6)) continue;
                var ls = LAB.layersAt(q.x, q.y);
                if (!ls.length || LAB.ceilingOf(ls) || LAB.capOf(ls)) continue;
                // An occlusion test must include blocked sight lines. Requiring
                // LOS here excluded every subject once cave walls became solid.
                if (!farFromMouths(q, e)) continue;
                P = { x: q.x, y: q.y, D: D };
            }
            if (!P) { LAT.noSpot++; return; }
            var from = fmtW(e), z0 = e.z;
            alone(e, function () {
                setPlayerAt(P.x, P.y, false);
                var ph = LAB.h(), reached = false, chased = false, maxJ = 0, lastZ = e.z;
                for (var t = 0; t < 600 && !reached; t++) {
                    enemyTick(1);
                    if (e.aggroAt) chased = true;
                    if (e.attackState && e.attackState !== "idle") reached = true;
                    maxJ = Math.max(maxJ, Math.abs(e.z - lastZ)); lastZ = e.z;
                }
                LAT.trials++; latHere++;
                if (chased) LAT.chased++;
                LAT.maxJump = Math.max(LAT.maxJump, maxJ);
                if (reached) {
                    var below = (ph * 25 - e.z) / 25;
                    if (below > 1) LAT.belowSurface++;
                    LAT.reached.push(W.label + " " + e.enemyType.id + "@" + from + " -> player on open ground D=" + P.D + ", enemy z " +
                        LAB.fx(z0 / 25, 1) + " h -> " + LAB.fx(e.z / 25, 1) + " h vs player " + LAB.fx(ph, 1) + " h, largest z step " + LAB.fx(maxJ / 25, 1) + " h");
                }
            });
        });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 7. Cave Test start: the first physics tick [N6; D19 is persistence's]
    // ═════════════════════════════════════════════════════════════════════════
    // The Cave Test spawn teleport (L7609-7617) moves the player into another
    // chunk without updateChunks, so the first step() re-centres the window
    // (L10306 -> L7491), and the re-centre's save pass drops `underground`
    // (L7369-7382). Saving the flag repairs the D19 consequence only; the N6
    // verdict also requires that the unnecessary first-tick rebuild not occur.
    var N6 = { worlds: 0, ug0: 0, ug1: 0, calls: 0, parts: [] };
    forWorlds("Cave Test first tick", ["cavetest"], function (W) {
        var ug0 = enemies.filter(function (e) { return e.underground === true; }).length;
        var rec = LAB.countCalls("assembleWindow");
        try { LAB.tick(1); } finally { rec.restore(); }
        var ug1 = enemies.filter(function (e) { return e.underground === true; }).length;
        N6.worlds++; N6.ug0 += ug0; N6.ug1 += ug1; N6.calls += rec.calls;
        N6.parts.push(W.label + ": " + ug1 + "/" + ug0 + ", the tick re-centred the window " + rec.calls + " time" + (rec.calls === 1 ? "" : "s"));
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 8. Cave enemies across a window re-centre [z save/restore; floor tracking L11458]
    // ═════════════════════════════════════════════════════════════════════════
    // The player starts 30 u inside an edge of the window's central chunk (no
    // re-centre yet), stands for 1 s so overlapping chamber spawns finish
    // separating, then WALKS 60 u across the chunk line: step() ->
    // updateChunks() -> assembleWindow() (L10306, L7491), the same path play
    // takes. Only enemies that were flagged underground just before the walk
    // and were too far from it to move are compared, matched by exact position.
    //
    // Floor tracking: while flagged, an underground enemy's z follows the floor
    // under it (L11458-11459, e.z = getFloorHeightAt * 25). Up to 10 of the
    // world's cave enemies chase a player standing on their cave floor 100 u
    // away for 10 s, once BEFORE the walk and once AFTER it (the same enemies,
    // same world points). Every 10 frames: is e.z within 1 u (0.04 h) of 25 x
    // the lowest walkable layer under it? "varied" counts samples where that
    // floor differs from the enemy's starting z -- where a z that stopped
    // tracking would show -- so a pass cannot come from flat ground alone.
    var SH = { worlds: 0, recentred: 0, compared: 0, zChanged: [], movedExcluded: 0, notFound: 0, leftWindow: 0, flaggedBefore: 0 };
    var FT = { pre: { n: 0, off: 0, varied: 0, trials: 0, ex: [] }, post: { n: 0, off: 0, varied: 0, trials: 0, flagLost: 0, ex: [] } };
    function floorChase(e, Pw, acc, label) {
        var P = LAB.toLocal(Pw.x, Pw.y);
        alone(e, function () {
            setPlayerAt(P.x, P.y, true);
            var z0 = e.z;
            // A shallow ramp is a deliberate geometry fixture: current natural
            // chambers are flat, which cannot catch height tracking being lost.
            // Use real mesh support and the real enemy update, never a stubbed
            // height-query result. Restore every edited sample afterwards.
            var m = floorMesh, savedFloor = [], startX = e.x, startY = e.y;
            var rampDX = (P.x - e.x) / 100, rampDY = (P.y - e.y) / 100;
            for (var ci = 0; ci < m.layerCount.length; ci++) {
                if (m.l0Type[ci] !== 1 || m.layerCount[ci] < 2 || m.l1Type[ci] !== 2) continue;
                var along = ((ci % m.w) * m.gridSize - startX) * rampDX +
                    (Math.floor(ci / m.w) * m.gridSize - startY) * rampDY;
                savedFloor.push(ci, m.l0TopZ[ci]);
                m.l0TopZ[ci] += Math.max(-0.4, Math.min(0.4, along * 0.004));
            }
            _floorCacheTick = (_floorCacheTick + 1) | 0;
            acc.trials++;
            if (e.underground !== true) acc.flagLost = (acc.flagLost || 0) + 1;
            try { for (var t = 0; t < 600; t++) {
                enemyTick(1);
                if (t % 10 !== 9) continue;
                var fl = LAB.lowestWalkable(LAB.layersAt(e.x, e.y));
                if (!fl) continue;
                acc.n++;
                if (Math.abs(25 * fl.z - z0) > 1) acc.varied++;
                if (Math.abs(e.z - 25 * fl.z) > 1) {
                    acc.off++;
                    if (acc.ex.length < 3) acc.ex.push(label + " " + e.enemyType.id + "@" + fmtW(e) + " z " + LAB.fx(e.z / 25, 2) + " h over floor " + LAB.fx(fl.z, 2) + " h");
                }
            } } finally {
                for (var si = 0; si < savedFloor.length; si += 2) m.l0TopZ[savedFloor[si]] = savedFloor[si + 1];
                _floorCacheTick = (_floorCacheTick + 1) | 0;
            }
        });
    }
    forWorlds("cave enemies across a window re-centre", ["cavewin", "cavetest"], function (W) {
        SH.worlds++;
        // Floor-tracking subjects: up to 10 cave enemies with a chase target on
        // their cave floor (under the roof) 100 u away, in the game's 2D view.
        function floorTarget(e) {
            for (var k = 0; k < 16; k++) {
                var q = { x: e.x + 100 * Math.cos(k * Math.PI / 8), y: e.y + 100 * Math.sin(k * Math.PI / 8) };
                if (!inWorldBounds(q) || isInGridWall(q.x, q.y, 6) || marketSafeAt(q) || 100 >= e.chaseRange) continue;
                var ls = LAB.layersAt(q.x, q.y), fl = LAB.lowestWalkable(ls), ce = LAB.ceilingOf(ls);
                if (!fl || fl.t !== 1 || !ce || ce.z <= fl.z) continue;
                if (!hasLineOfSight(e.x, e.y, q.x, q.y)) continue;
                return { x: wx(q.x), y: wy(q.y) };
            }
            return null;
        }
        var preN = 0;
        enemies.slice().forEach(function (e) {
            if (preN >= 10 || e.underground !== true) return;
            var P = floorTarget(e);
            if (P) { preN++; floorChase(e, P, FT.pre, W.label + " before"); }
        });

        // East edge first; if the 60 u walk is blocked there (no re-centre), try
        // the other three edges of the same, still un-moved, window.
        var EDGES = [[1, 0], [0, 1], [-1, 0], [0, -1]];
        for (var ei = 0; ei < EDGES.length; ei++) {
            var B0 = centreChunkBounds(0), E = EDGES[ei];
            var sx = E[0] ? (E[0] > 0 ? B0.x1 - 30 : B0.x0 + 30) : (B0.x0 + B0.x1) / 2;
            var sy = E[1] ? (E[1] > 0 ? B0.y1 - 30 : B0.y0 + 30) : (B0.y0 + B0.y1) / 2;
            var start = { x: wx(sx), y: wy(sy) };
            var dest = { x: start.x + 60 * E[0], y: start.y + 60 * E[1] };
            var ox = windowOriginX, oy = windowOriginY;
            LAB.placeWorld(start.x, start.y, "top");
            LAB.tick(60);
            if (windowOriginX !== ox || windowOriginY !== oy) { LAB.note("re-centre [" + W.label + "]: window moved before the walk"); return; }
            var before = enemies.filter(function (e) { return e.underground === true; }).map(function (e) {
                return { x: wx(e.x), y: wy(e.y), z: e.z, id: e.enemyType.id };
            });
            var path = [LAB.worldPos()];
            LAB.walkTo(dest.x, dest.y, { maxTicks: 240, arrive: 6, onTick: function (s) { path.push({ x: s.x, y: s.y }); } });
            if (windowOriginX === ox && windowOriginY === oy) {
                LAB.note("re-centre [" + W.label + "]: walk " + E.join(",") + " across the chunk line did not re-centre");
                continue;
            }
            SH.recentred++;
            SH.flaggedBefore += before.length;
            var compared = [];
            before.forEach(function (b) {
                // Enemies within 360 u of the walk could have patrolled or chased
                // (L11423, L11453): compare only the ones that cannot have moved.
                var near = path.some(function (p) { return Math.hypot(p.x - b.x, p.y - b.y) < 360; });
                if (near) { SH.movedExcluded++; return; }
                var cxk = Math.floor(b.x / CHUNK_SIZE), cyk = Math.floor(b.y / CHUNK_SIZE);
                if (cxk < windowCX || cyk < windowCY || cxk >= windowCX + WINDOW_CHUNKS || cyk >= windowCY + WINDOW_CHUNKS) { SH.leftWindow++; return; }
                var e = enemyAtWorld(b, 0.05);
                if (!e || e.enemyType.id !== b.id) { SH.notFound++; return; }
                SH.compared++;
                compared.push(e);
                var tag = W.label + " " + b.id + "@" + Math.round(b.x) + "," + Math.round(b.y);
                if (Math.abs((e.z || 0) - b.z) > 0.5) SH.zChanged.push(tag + " z " + LAB.fx(b.z, 1) + " -> " + LAB.fx(+e.z, 1));
            });
            // Floor tracking again, on up to 10 of the compared enemies -- cave
            // enemies (flagged just before the walk) that the walk cannot have moved.
            var postN = 0;
            compared.forEach(function (e) {
                if (postN >= 10) return;
                var P = floorTarget(e);
                if (P) { postN++; floorChase(e, P, FT.post, W.label + " after"); }
            });
            return;
        }
    });

    // ═════════════════════════════════════════════════════════════════════════
    // Verdicts (one per behaviour, aggregated over worlds and seeds)
    // ═════════════════════════════════════════════════════════════════════════
    LAB.scenario("enemies: verdicts", function () {
        var worlds = GEN.worlds.join(", ");
        function perWorld(prefix, o) { Object.keys(o).forEach(function (k) { LAB.metric(prefix + "." + k.replace(/[^a-z0-9]+/gi, "_"), o[k]); }); }
        var radTxt = "game movement radius " + Object.keys(GEN.rad).sort().map(function (k) { return k + " " + LAB.fx(GEN.rad[k], 2); }).join(", ");
        Object.keys(GEN.rad).forEach(function (k) { LAB.metric("enemies.move_radius." + k, GEN.rad[k], "u"); });
        LAB.metric("enemies.arrival_radius", ARRIVAL, "u");

        // [ruin order] own cell is a wall
        LAB.check("enemies: no enemy spawns on a wall cell",
            GEN.n >= 50 && GEN.onWall.length === 0,
            (GEN.n < 50 ? "PRECONDITION FAILED: only " + GEN.n + " enemies assembled; " : "") +
            GEN.onWall.length + "/" + GEN.n + " enemies stand on a wall cell" + (GEN.onWall.length ? " e.g. " + head(GEN.onWall) : "") +
            " (spawn checks the cell open at L5885; ruin walls are stamped later, L6179-6183)");
        // [F3] wall inside the footprint of an enemy on an open cell
        var embTotal = GEN.embedded.length;
        LAB.check("enemies: no enemy on an open cell spawns with a wall inside its footprint (the game's movement radius)",
            GEN.n >= 50 && GEN.noRad === 0 && embTotal === 0,
            (GEN.n < 50 || GEN.noRad ? "PRECONDITION FAILED: " + GEN.n + " enemies assembled, " + GEN.noRad + " with no measurable movement radius; " : "") +
            embTotal + "/" + GEN.n + " embedded " + JSON.stringify(GEN.embByType) + " of " + JSON.stringify(GEN.typeCount) +
            "; " + radTxt + " [" + worlds + "]" + (embTotal ? " e.g. " + head(GEN.embedded) : "") + " (spawn L5885 checks one cell; wall test L9980)");
        LAB.metric("enemies.spawn.enemies", GEN.n);
        LAB.metric("enemies.spawn.embedded", embTotal);
        LAB.metric("enemies.spawn.on_wall_cell", GEN.onWall.length);

        // [F1] degenerate waypoint pairs
        var withPatrol = GEN.n - GEN.noPatrol, arrOk = ARRIVAL >= 1;
        LAB.check("enemies: every enemy's patrol waypoints span at least twice the game's waypoint arrival radius",
            withPatrol >= 50 && arrOk && GEN.degenerate.length === 0,
            (withPatrol < 50 || !arrOk ? "PRECONDITION FAILED: " + withPatrol + " enemies with a patrol, arrival radius " + LAB.fx(ARRIVAL, 2) + "; " : "") +
            GEN.degenerate.length + "/" + withPatrol + " patrols span < " + LAB.fx(2 * ARRIVAL, 2) + " u (arrival radius " + LAB.fx(ARRIVAL, 2) +
            " u measured on updateEnemies) " + JSON.stringify(GEN.degByKind) + " of " + JSON.stringify(GEN.byKind) + " (no patrol: " + GEN.noPatrol + ")" +
            (GEN.degenerate.length ? " e.g. " + head(GEN.degenerate) : "") + " (waypoints L5904 +-50 u / L5947 +-30 u, arrival L11295)");
        LAB.metric("enemies.waypoints.degenerate", GEN.degenerate.length);
        LAB.check("enemies: no patrol waypoint lies inside a wall cell",
            GEN.n >= 50 && GEN.wpInWall.length === 0,
            (GEN.n < 50 ? "PRECONDITION FAILED: only " + GEN.n + " enemies; " : "") +
            GEN.wpInWall.length + "/" + GEN.n + " enemies have a waypoint inside a wall cell " + JSON.stringify(GEN.wpInWallByKind) +
            (GEN.wpInWall.length ? " e.g. " + head(GEN.wpInWall) : "") + " (unvalidated waypoints L5904/L5947)");
        LAB.metric("enemies.waypoints.in_wall", GEN.wpInWall.length);
        Object.keys(GEN.perWorld).forEach(function (k) {
            var p = GEN.perWorld[k], id = k.replace(/[^a-z0-9]+/gi, "_");
            LAB.metric("enemies.world." + id + ".spawn", p.n + "/emb " + p.embedded + "/wall " + p.onWall + "/degen " + p.degenerate + "/wpwall " + p.wpInWall);
        });

        // [F1+F3+no slide] patrol progress
        LAB.check("enemies: every patrolling enemy keeps walking (> 20 u travelled per 10 s of patrol)",
            PAT.measured >= 40 && PAT.frozen.length === 0,
            (PAT.measured < 40 ? "PRECONDITION FAILED: only " + PAT.measured + " enemies measured while patrolling; " : "") +
            PAT.frozen.length + "/" + PAT.measured + " frozen " + JSON.stringify(PAT.frozenBy) + " measured " + JSON.stringify(PAT.measuredBy) +
            " excluded: chased " + PAT.excl.chased + ", left 350 u " + PAT.excl.far + ", died " + PAT.excl.dead + ", < 2 waypoints " + PAT.excl.noPatrol +
            "; sessions=" + PAT.sessions + (PAT.frozen.length ? " e.g. " + head(PAT.frozen, 5) : "") +
            " (15 s warm-up then 10 s measured; market-safe L11420 keeps them patrolling; _patrolEnemy L11291-11308)");
        LAB.metric("enemies.patrol.measured", PAT.measured);
        LAB.metric("enemies.patrol.frozen", PAT.frozen.length);
        LAB.metric("enemies.patrol.frozen_fraction", PAT.measured ? PAT.frozen.length / PAT.measured : 0);
        LAB.metric("enemies.patrol.span_under_20u", PAT.shortSpan);
        Object.keys(PAT.frozenBy).sort().forEach(function (k) { LAB.metric("enemies.patrol.frozen." + k, PAT.frozenBy[k]); });
        perWorld("enemies.patrol.frozen_of_measured", PAT.perWorld);

        // chase regression guard (enemy pipeline; the player is held in place)
        LAB.check("enemies: a lone enemy chasing a player held in place (no push-back) reaches attack windup within 10 s in >= 95% of trials",
            CH.trials >= 40 && CH.ok >= 0.95 * CH.trials,
            (CH.trials < 40 ? "PRECONDITION FAILED: only " + CH.trials + " trials; " : "") +
            CH.ok + "/" + CH.trials + " reached attack windup" + (CH.fails.length ? "; misses: " + head(CH.fails) : "") +
            " (player 100 u away with hasLineOfSight true; chase L11423-11450; attack windup L11385-11388; in play the push-back " +
            "L10042 keeps enemies out of reach -- physics' N2 check)");
        LAB.metric("enemies.chase.trials", CH.trials);
        LAB.metric("enemies.chase.success", CH.ok);

        // [F2] back to patrol after a chase
        LAB.check("enemies: after chasing the player past a wall an enemy gets back to its patrol route within 20 s (>= 95% of trials)",
            F2.trials >= 30 && arrOk && F2.ok >= 0.95 * F2.trials,
            (F2.trials < 30 || !arrOk ? "PRECONDITION FAILED: " + F2.trials + " trials (no grazing spot " + F2.noSpot + ", chase never reached windup " + F2.noReach +
                ", chase moved < 40 u " + F2.noDisplace + "), arrival radius " + LAB.fx(ARRIVAL, 2) + "; " : "") +
            F2.ok + "/" + F2.trials + " (" + pct(F2.ok, F2.trials) + ") returned to within the arrival radius of a waypoint" +
            (F2.fails.length ? "; stuck: " + head(F2.fails, 4) : "") +
            " (shared patrol/chase slide; historical patrol rejected the entire diagonal and alternated blocked waypoints)");
        LAB.metric("enemies.return_to_patrol.trials", F2.trials);
        LAB.metric("enemies.return_to_patrol.stuck", F2.trials - F2.ok);
        perWorld("enemies.return_to_patrol.ok_of_trials", F2.perWorld);

        // [F4] separation into walls
        LAB.check("enemies: separation never pushes an enemy into a wall",
            SEP.sites >= 10 && SEP.pushed > 0 && SEP.startEmbedded === 0 && SEP.embedded.length === 0,
            (SEP.sites < 10 || SEP.pushed === 0 || SEP.startEmbedded ? "PRECONDITION FAILED: sites=" + SEP.sites + " pushed=" + SEP.pushed +
                " startEmbedded=" + SEP.startEmbedded + "; " : "") +
            SEP.embedded.length + "/" + SEP.members + " cluster members " + JSON.stringify(SEP.byType) + " ended with a wall inside their footprint after 30 separateEnemies() passes at " +
            SEP.sites + " wall-adjacent sites next to real enemies (" + SEP.caveSites + " by a cave wall; " + SEP.pushed + " pushed >= 3 u; " + radTxt + ")" +
            (SEP.embedded.length ? " e.g. " + head(SEP.embedded) : "") + " (independent cylinder/regular-wall-prism overlap; historical defect tested only the centre cell)");
        LAB.metric("enemies.separation.embedded", SEP.embedded.length);
        LAB.metric("enemies.separation.sites", SEP.sites);
        perWorld("enemies.separation.embedded_of_members", SEP.perWorld);

        // [F6 ring] surface enemy vs surface player
        LAB.check("enemies: a surface enemy can follow where a surface player walks across cave-wall cells",
            TRV.pairs >= 3 && TRV.ok === TRV.pairs,
            (TRV.pairs < 3 ? "PRECONDITION FAILED: only " + TRV.pairs + " A->B pairs the player walked on the surface (walk failures " + TRV.walkFail +
                ", no surface enemy " + TRV.noSurfaceEnemy + ", subject embedded at A " + TRV.subjectEmbeddedAtA + "); " : "") +
            TRV.ok + "/" + TRV.pairs + " patrols reached the far side" + (TRV.fails.length ? "; blocked: " + head(TRV.fails, 3) : "") +
            " (same physical route for surface player and enemy; historical enemy wall checks omitted height)");
        LAB.metric("enemies.collision.sampled_points", TRV.apiPts);
        LAB.metric("enemies.collision.enemy_solid", TRV.apiEnemySolid);
        LAB.metric("enemies.collision.player_solid", TRV.apiPlayerSolid);
        LAB.metric("enemies.collision.disagreements", TRV.apiDisagree);
        LAB.check("enemies: a surface enemy never walks into a plain wall cell that stops the surface player",
            TRB.pairs >= 3 && TRB.entered.length === 0,
            (TRB.pairs < 3 ? "PRECONDITION FAILED: only " + TRB.pairs + " walls that stopped the walking player (player got past " + TRB.playerCrossed +
                ", no surface enemy " + TRB.noSurfaceEnemy + ", subject embedded at A " + TRB.subjectEmbeddedAtA + "); " : "") +
            TRB.entered.length + "/" + TRB.pairs + " patrols entered the wall cell that stopped the player (reached the far side: " + TRB.reachedB + ")" +
            (TRB.entered.length ? " e.g. " + head(TRB.entered, 3) : "") + " (the reverse of the cave-wall parity check; patrol wall test L11303)");

        // [F7] roof, both directions, and through the side
        LAB.check("enemies: a cave enemy does not chase a player standing on the cave roof",
            ROOF.pairs >= 3 && ROOF.violations.length === 0,
            (ROOF.pairs < 3 ? "PRECONDITION FAILED: only " + ROOF.pairs + " valid pairs (tried " + ROOF.tried + "; control never chased " + ROOF.ctlNoChase +
                (ROOF.ctlFlagCleared ? " -- " + ROOF.ctlFlagCleared + " of them had lost the underground flag (D19 cleared the flag)" : "") +
                "; player not held on the cap " + ROOF.capInvalid + "; re-centred " + ROOF.recentred + "; no roof spot in the centre chunk " + ROOF.noSpot + "); " : "") +
            ROOF.violations.length + "/" + ROOF.pairs + " chased the player on the roof (each pair's control: the same enemy chases when the player stands on the cave floor at the same x,y; " +
            "no pair re-centred the window)" + (ROOF.violations.length ? " e.g. " + head(ROOF.violations, 3) : "") + " (hasLineOfSight L9940 is 2D; chase L11423)");
        LAB.metric("enemies.roof.pairs", ROOF.pairs);
        LAB.metric("enemies.roof.violations", ROOF.violations.length);
        LAB.metric("enemies.roof.recentred_pairs_dropped", ROOF.recentred);
        LAB.check("enemies: a surface enemy does not chase a player standing in the cave below it",
            RROOF.pairs >= 3 && RROOF.violations.length === 0,
            (RROOF.pairs < 3 ? "PRECONDITION FAILED: only " + RROOF.pairs + " valid pairs (tried " + RROOF.tried + "; control never chased " + RROOF.ctlNoChase +
                "; player not held on the cave floor " + RROOF.floorInvalid + "; re-centred " + RROOF.recentred + "); " : "") +
            RROOF.violations.length + "/" + RROOF.pairs + " chased the player through the roof, " + RROOF.attacked + " of them reached attack windup " +
            "(each pair's control: the same enemy chases when the player stands on the cap at the same x,y)" +
            (RROOF.violations.length ? " e.g. " + head(RROOF.violations, 3) : "") + " (hasLineOfSight L9940 is 2D; chase L11423; attack range is 2D L11372-11385)");
        LAB.metric("enemies.reverse_roof.pairs", RROOF.pairs);
        LAB.metric("enemies.reverse_roof.violations", RROOF.violations.length);
        LAB.check("enemies: a cave enemy cannot reach a player on open ground away from every cave mouth",
            LAT.trials >= 6 && LAT.reached.length === 0,
            (LAT.trials < 6 ? "PRECONDITION FAILED: only " + LAT.trials + " trials (no open-ground spot away from the mouths " + LAT.noSpot + "); " : "") +
            LAT.reached.length + "/" + LAT.trials + " reached attack windup (" + LAT.chased + " chased; " + LAT.belowSurface + " attacked from more than 1 h below the player's feet; " +
            "largest single z step " + LAB.fx(LAT.maxJump / 25, 1) + " h)" + (LAT.reached.length ? " e.g. " + head(LAT.reached, 3) : "") +
            " (2D LOS L9940 + chase L11423 with no height term; nothing solid around the cave in `grid`, so the enemy walks out through rock and its z follows getFloorHeightAt L11459)");
        LAB.metric("enemies.lateral.trials", LAT.trials);
        LAB.metric("enemies.lateral.reached", LAT.reached.length);

        // [N6 + D19] Cave Test first tick
        LAB.check("enemies: the first physics tick after a Cave Test start neither re-centres the window nor clears cave enemies' underground flag",
            N6.worlds >= 1 && N6.ug0 >= 5 && N6.calls === 0 && N6.ug1 === N6.ug0,
            (N6.worlds < 1 || N6.ug0 < 5 ? "PRECONDITION FAILED: " + N6.worlds + " Cave Test worlds, " + N6.ug0 + " cave enemies at start; " : "") +
            "first tick re-centred the window " + N6.calls + " time" + (N6.calls === 1 ? "" : "s") + "; still underground: " + N6.ug1 + "/" + N6.ug0 + "; " + N6.parts.join("; ") +
            " (spawn teleport L7609-7617 skips updateChunks -> first step() re-centres; the save pass drops the flag L7369-7382)");

        // [z save/restore] re-centre
        var pre = SH.recentred >= 1 && SH.compared >= 5;
        var preTxt = pre ? "" : "PRECONDITION FAILED: re-centred " + SH.recentred + "/" + SH.worlds + " worlds, compared " + SH.compared +
            " of " + SH.flaggedBefore + " flagged enemies; ";
        LAB.check("enemies: underground cave enemies keep their Z across a window re-centre",
            pre && SH.zChanged.length === 0,
            preTxt + SH.zChanged.length + "/" + SH.compared + " changed z (re-centred " + SH.recentred + "/" + SH.worlds +
            " worlds; excluded as possibly moved: " + SH.movedExcluded + ", chunk left the window: " + SH.leftWindow + ", not found: " + SH.notFound + ")" +
            (SH.zChanged.length ? " e.g. " + head(SH.zChanged, 3) : "") + " (z saved L7370, restored L7052)");
        LAB.metric("enemies.recentre.compared", SH.compared);
        LAB.metric("enemies.recentre.left_window", SH.leftWindow);

        // [floor tracking] before and after a re-centre
        function ftDetail(a) { return a.off + "/" + a.n + " samples off the cave floor over " + a.trials + " chases (" + a.varied + " samples where a z that stopped tracking would show)"; }
        LAB.check("enemies: a cave enemy chasing through its cave stands on the cave floor under it",
            FT.pre.trials >= 5 && FT.pre.varied >= 20 && FT.pre.off === 0,
            (FT.pre.trials < 5 || FT.pre.varied < 20 ? "PRECONDITION FAILED: " + FT.pre.trials + " chases, " + FT.pre.varied + " samples on a floor away from the starting z; " : "") +
            ftDetail(FT.pre) + (FT.pre.ex.length ? " e.g. " + head(FT.pre.ex, 3) : "") + " (z = getFloorHeightAt * 25 while flagged, L11458-11459)");
        LAB.check("enemies: after a window re-centre a cave enemy chasing through its cave still stands on the cave floor",
            FT.post.trials >= 5 && FT.post.varied >= 20 && FT.post.off === 0,
            (FT.post.trials < 5 || FT.post.varied < 20 ? "PRECONDITION FAILED: " + FT.post.trials + " chases, " + FT.post.varied + " samples on a floor away from the starting z; " : "") +
            ftDetail(FT.post) + "; " + (FT.post.flagLost || 0) + "/" + FT.post.trials + " subjects had lost the underground flag" +
            (FT.post.ex.length ? " e.g. " + head(FT.post.ex, 3) : "") + " (floor tracking needs the flag, L11458; the re-centre's save pass drops it, L7369-7382)");
        LAB.metric("enemies.floor_tracking.before.off", FT.pre.off);
        LAB.metric("enemies.floor_tracking.after.off", FT.post.off);

        Object.keys(TIMES).forEach(function (k) { LAB.metric("enemies.time." + k + "_ms", TIMES[k], "ms"); });
        LAB.metric("enemies.total_ms", LAB.realNow() - T0, "ms");
    });
})();
LAB.finish();
undefined;
