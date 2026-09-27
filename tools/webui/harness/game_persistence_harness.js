// game_persistence_harness.js -- what the Endless crawler keeps, and what it
// should keep, across window shifts, chunk eviction, Settings changes and
// restarts WITHIN one page session. The game keeps nothing in browser storage
// (reported as a NOTE/METRIC, not a verdict: the audit lists "no saves" (H1) as
// a PROBLEM, so a check rewarding it would call a fix a regression). So
// "persistence" here means the in-memory chunk cache (chunks{}), the per-chunk
// delta store (entityDeltas, WebPage_Games.h:969), the cave-network memo
// (endlessCaveNetworks, 1153) and the globals a restart (resetEndlessMode,
// 7511) does or does not reset.
//
// Every check states how the game SHOULD behave. Many fail on today's code on
// purpose; tools/webui/tests/test_game_persistence.py lists each known failure
// with its audit reference and the detail text that pins its mechanism.
//
// Nothing here re-derives game state. Worlds are built by resetEndlessMode and
// assembleWindow, chunks by generateChunk, deaths by updateEnemies (via
// LAB.tick / LAB.frame), chest interaction by collectChest, shrines by
// activateShrine, arenas by startArenaChallenge + updateArenaChallenge,
// spawner-born enemies by updateEnemySpawners, stat pickups by
// updateStatPickups, progression by applyShopItem / applyArcaneTome /
// activateFortressGarrison, Settings by drawSettingsOverlay +
// handleSettingsClick, calibration by pollIMU + onCalibUpdate. The harness only
// reads the arrays those functions leave behind.
//
// Coordinates: enemies/chests/pos are WINDOW-LOCAL and re-based on every chunk
// crossing, so everything the harness remembers across a shift is kept in
// WORLD coordinates (local + windowOrigin) and converted at the point of use.
//
// Detail text states the game's cause of a failure ONLY when the check fails
// (a passing check under a fix must not print the bug it no longer has).
//
// usage (via tools/webui/game_lab.py):
//   <extracted game js> [--endless-seeds a,b]  normal Endless worlds (default 424242)
//                       [--seeds a,b]          Cave Test worlds      (default 12345)

(0, eval)(slurp("tools/webui/harness/_game_env.js"));
LAB.init(__out, slurp, __engine, __argv);
// One line: loadError carries the stack, and a newline inside a verdict line
// would cut the "[detail]" off and turn the rest into a different check id.
LAB.check("persistence: game script evaluates without throwing", LAB.load(__argv[0]),
    (LAB.loadError || "").split("\n").slice(0, 3).join(" | "));

if (LAB.loaded) {
    var SEEDS = LAB.seeds([424242], "endless-seeds");    // normal Endless worlds
    var CT_SEEDS = LAB.seeds([12345]);                   // Cave Test worlds
    var FAR_CHUNKS = 20;            // teleport distance that must evict the home window
    var WALK_CROSSINGS = 4;         // distinct windows entered by the delta-growth walk
    var ROUND_TRIP_AWAY_MS = 3601007;   // the player comes back ~1 h later (odd whole seconds)

    // Page-load state, captured before any world exists. The restart checks
    // compare against these snapshots; LAB.freshPage() restores the page-lifetime
    // globals (spells, settings, WINDOW_CHUNKS, fortress state, jump state, ...)
    // between scenarios that are NOT about those leaks.
    var PAGE_GRID_WAS_NULL = !grid;
    var SPELLS_AT_LOAD = JSON.stringify(spells);
    var PRESET_AT_LOAD = qualityPreset;

    // ── small helpers (reading, never re-deriving) ───────────────────────────
    var fx = LAB.fx;
    function keyOf(cx, cy) { return cx + "," + cy; }
    function chunkOfWorld(wx, wy) { return { cx: Math.floor(wx / CHUNK_SIZE), cy: Math.floor(wy / CHUNK_SIZE) }; }
    function chunkCenter(cx, cy) { return { x: cx * CHUNK_SIZE + CHUNK_SIZE / 2, y: cy * CHUNK_SIZE + CHUNK_SIZE / 2 }; }
    function inWindow(cx, cy) {
        return cx >= windowCX && cx < windowCX + WINDOW_CHUNKS && cy >= windowCY && cy < windowCY + WINDOW_CHUNKS;
    }
    function windowKeys() {
        var out = [];
        for (var dy = 0; dy < WINDOW_CHUNKS; dy++) for (var dx = 0; dx < WINDOW_CHUNKS; dx++) out.push(keyOf(windowCX + dx, windowCY + dy));
        return out;
    }
    function teleportChunk(cx, cy) { var c = chunkCenter(cx, cy); LAB.placeWorld(c.x, c.y, "top"); }
    function playerChunk() { var w = LAB.worldPos(); return chunkOfWorld(w.x, w.y); }
    function because(ok, cause) { return ok ? "" : " " + cause; }
    function shopItem(id) { for (var i = 0; i < SHOP_ITEMS_BASE.length; i++) if (SHOP_ITEMS_BASE[i].id === id) return SHOP_ITEMS_BASE[i]; return null; }

    // A fresh Endless world on a freshly loaded page, for scenarios that are
    // not about restarts. qualityPreset is not a LAB.freshPage key.
    function freshWorld(seed) {
        LAB.freshPage();
        qualityPreset = PRESET_AT_LOAD;
        LAB.releasePad();
        LAB.startEndless(seed);
        LAB.freezeDay(0.5);
    }
    function freshCaveTest(seed, flags) {
        LAB.freshPage();
        qualityPreset = PRESET_AT_LOAD;
        LAB.releasePad();
        LAB.startCaveTest(seed, flags);
        LAB.seedRandom(seed);           // startCaveTest does not reseed Math.random
        LAB.freezeDay(0.5);
    }

    // ── fingerprints: FNV-1a over a chunk's generated content ────────────────
    // Volatile bookkeeping (lastAccess, windowAddedMs, AI timers) is left out on
    // purpose; everything a player could see or interact with is in.
    function mix(h, v) { return Math.imul(h ^ (v | 0), 16777619); }
    function hv(h, x) {
        if (x === null || x === undefined) return mix(h, 0x5bd1e995);
        var t = typeof x;
        if (t === "boolean") return mix(h, x ? 0x1f2e3d : 0x3d2e1f);
        if (t === "number") {
            if (!isFinite(x)) return mix(h, 0x7f7f7f7f);
            var r = Math.round(x * 1000);
            return mix(mix(h, r % 1000000007), Math.floor(r / 1000000007));
        }
        if (t === "string") { h = mix(h, x.length); for (var i = 0; i < x.length; i++) h = mix(h, x.charCodeAt(i)); return h; }
        if (x.length !== undefined) { h = mix(h, x.length); for (var j = 0; j < x.length; j++) h = hv(h, x[j]); return h; }
        return mix(h, 0x0bad0bad);
    }
    function hFields(h, o, fields) {
        if (!o) return mix(h, 0x11111111);
        for (var i = 0; i < fields.length; i++) {
            var f = fields[i], v = o[f];
            if (f === "enemyType") v = v && v.id;
            if (f === "patrolWaypoints" || f === "stalls" || f === "cells") {
                h = mix(h, v ? v.length : -1);
                if (v) for (var j = 0; j < v.length; j++) h = hFields(h, v[j], ["x", "y", "dx", "dy", "facing", "stallType"]);
                continue;
            }
            if (f === "statPickup") { h = hFields(h, v, ["type", "wx", "wy"]); continue; }
            h = hv(h, v);
        }
        return h;
    }
    function hList(list, fields) {
        var h = 0x811c9dc5 | 0; h = mix(h, list ? list.length : -1);
        if (list) for (var i = 0; i < list.length; i++) h = hFields(h, list[i], fields);
        return h;
    }
    var ENEMY_F = ["x", "y", "z", "enemyType", "health", "maxHealth", "speed", "chaseRange", "underground", "facing", "patrolWaypoints"];
    var CHEST_F = ["x", "y", "gold", "collected", "opened", "facing", "equipId", "relicId", "tier", "quality", "seed"];
    var SPAWNER_F = ["x", "y", "hp", "maxHp", "cooldownMs", "maxSpawns", "spawnCount", "active", "type"];
    function fpChunk(ch) {
        var m = ch.floorMesh, h;
        var fp = {};
        h = 0x811c9dc5 | 0;
        h = hv(h, ch.biome); h = hv(h, ch.difficulty); h = hv(h, ch.grid); h = hv(h, ch.wallHeights);
        h = hv(h, ch.wallColorR); h = hv(h, ch.wallColorG); h = hv(h, ch.wallColorB); h = hv(h, ch.caveInterior);
        h = mix(h, hList(ch.walls, ["x", "y", "w", "h"]));
        fp.terrain = h;
        h = 0x811c9dc5 | 0;
        h = hv(h, m.w); h = hv(h, m.h); h = hv(h, m.water); h = hv(h, m.surfaceBiome); h = hv(h, m.surfaceH); h = hv(h, m.layerCount);
        for (var li = 0; li < 5; li++) { h = hv(h, m["l" + li + "TopZ"]); h = hv(h, m["l" + li + "Type"]); h = hv(h, m["l" + li + "Color"]); }
        fp.mesh = h;
        fp.enemies = hList(ch.enemies, ENEMY_F);
        fp.chests = hList(ch.treasureChests, CHEST_F);
        fp.spawners = hList(ch.enemySpawners, SPAWNER_F);
        h = 0x811c9dc5 | 0;
        h = hFields(h, ch.market, ["centerX", "centerY", "stalls"]);
        h = hFields(h, ch.shrine, ["x", "y", "buffType", "used"]);
        h = hFields(h, ch.ruin, ["x", "y", "ruinType", "facing", "cells", "statPickup"]);
        h = hFields(h, ch.structure, ["type", "centerWX", "centerWY", "regionX", "regionY", "scale"]);
        h = mix(h, hList(ch.caveEntrances, ["x", "y", "angle", "depth", "ceilH"]));
        fp.features = h;
        fp.scatter = mix(hList(ch.floorScatter, ["x", "y", "type", "variant", "seed"]),
                         hList(ch.wallDecorations, ["worldX", "worldY", "side", "type", "gridX", "gridY"]));
        fp.explored = hv(0x811c9dc5 | 0, ch.exploredCells);
        return fp;
    }
    function fpDiff(a, b) {
        var out = [];
        for (var k in a) if (a[k] !== b[k]) out.push(k);
        return out;
    }
    function fpWindow() {
        var out = {};
        windowKeys().forEach(function (k) { out[k] = chunks[k] ? fpChunk(chunks[k]) : null; });
        return out;
    }
    function compareFpSets(a, b) {
        var diffs = [], n = 0;
        for (var k in a) {
            n++;
            if (!b[k] || !a[k]) { diffs.push(k + ":missing"); continue; }
            var d = fpDiff(a[k], b[k]);
            if (d.length) diffs.push(k + ":" + d.join("+"));
        }
        for (var k2 in b) if (!(k2 in a)) diffs.push(k2 + ":extra");
        return { n: n, diffs: diffs };
    }

    // Regenerate chunk (cx,cy) with the game's generator WITHOUT disturbing the
    // cache: returns the fresh chunk object, then puts the cached one back.
    // generateChunk applies entityDeltas, so this is "what a revisit would build".
    function regenerate(cx, cy) {
        var k = keyOf(cx, cy), saved = chunks[k];
        delete chunks[k];
        var fresh = generateChunk(cx, cy);
        if (saved) chunks[k] = saved; else delete chunks[k];
        return fresh;
    }
    // First chunk, ring by ring around the origin, for which pred(chunk) is
    // non-null. Chunks generated only for the search are dropped again.
    function spiralFind(maxR, pred) {
        for (var r = 0; r <= maxR; r++) for (var cy = -r; cy <= r; cy++) for (var cx = -r; cx <= r; cx++) {
            if (Math.max(Math.abs(cx), Math.abs(cy)) !== r) continue;
            var k = keyOf(cx, cy), had = !!chunks[k];
            var ch = generateChunk(cx, cy);
            var hit = pred(ch);
            if (hit !== null && hit !== undefined && hit !== false) return { cx: cx, cy: cy, key: k, ch: ch, hit: hit };
            if (!had && !inWindow(cx, cy)) delete chunks[k];
        }
        return null;
    }

    // Walk away until every chunk in `keys` could have been evicted, let an hour
    // pass, then come back to WORLD point (bx, by). Both legs are teleports: no
    // tick runs, so nothing moves or dies on the way; only assembleWindow /
    // evictDistantChunks act. The hour makes any wall-clock dependence of chunk
    // regeneration visible (a revisit must not depend on WHEN it happens).
    function evictRoundTrip(keys, bx, by) {
        LAB.placeWorld(bx + FAR_CHUNKS * CHUNK_SIZE, by, "top");
        var still = keys.filter(function (k) { return !!chunks[k]; });
        LAB.advance(ROUND_TRIP_AWAY_MS);
        LAB.placeWorld(bx, by, "top");
        var back = keys.filter(function (k) { var c = chunks[k]; return !(c && inWindow(c.cx, c.cy)); });
        return { evicted: still.length === 0, still: still, back: back.length === 0, missing: back };
    }

    function aliveWorldEnemies() {
        var out = [];
        for (var i = 0; i < enemies.length; i++) {
            var e = enemies[i];
            if (e.health > 0) out.push({ x: e.x + windowOriginX, y: e.y + windowOriginY, t: e.enemyType && e.enemyType.id, e: e });
        }
        return out;
    }
    function findEnemyAtWorld(wx, wy, typeId) {
        for (var i = 0; i < enemies.length; i++) {
            var e = enemies[i];
            if (e.enemyType && e.enemyType.id === typeId &&
                Math.abs(e.x + windowOriginX - wx) < 0.01 && Math.abs(e.y + windowOriginY - wy) < 0.01) return e;
        }
        return null;
    }
    function findChest(key, idx) {
        for (var i = 0; i < treasureChests.length; i++) {
            var c = treasureChests[i];
            if (c._chunkKey === key && c._chunkIdx === idx) return c;
        }
        return null;
    }
    // Persistence setup must use a real reachable interaction. Put the player
    // at a supported, clear pose beside this live-window chest; do not bypass
    // canReachChest or retain an obsolete chest object after a window rebuild.
    // Restore the pose before ticking so this setup does not incidentally move
    // the chunk window, enemies, or the home exploration scenario.
    function visitReachableChest(chest, allowCollected, action) {
        if (!chest || treasureChests.indexOf(chest) < 0) return null;
        var saved = { x: pos.x, y: pos.y, floorZ: pos.floorZ, airborne: jumpAirborne, vz: jumpVelZ };
        var targetZ = entityFeetSpatialZ(chest), offsets = [[0, 0]];
        [10, 18, 30, 45].forEach(function (radius) {
            for (var direction = 0; direction < 8; direction++) {
                var angle = direction * Math.PI / 4;
                offsets.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
            }
        });
        if (!Number.isFinite(targetZ)) return null;
        try {
            for (var oi = 0; oi < offsets.length; oi++) {
                var x = chest.x + offsets[oi][0], y = chest.y + offsets[oi][1];
                var body = { x: x, y: y, feetZ: targetZ, radius: 6, height: 70, allowFall: false };
                var support = spatialQuerySupport(body, x, y);
                if (support.status !== 'walk') continue;
                body.feetZ = support.feetZ;
                if (spatialBodyBlocked(body, x, y)) continue;
                pos.x = x; pos.y = y; pos.floorZ = spatialZToPlayerZ(body.feetZ);
                jumpAirborne = false; jumpVelZ = 0;
                // A collected chest must be non-interactable only because it
                // is collected, not because this test stood behind its roof.
                // The copy is a reach probe only; actual collection always
                // receives the original member of treasureChests.
                var reachProbe = allowCollected ? Object.assign({}, chest, { collected: false }) : chest;
                updateTreasureChests();
                if (!canReachChest(reachProbe) || (!allowCollected && nearestOpenChest !== chest)) continue;
                var evidence = { distance: Math.hypot(x - chest.x, y - chest.y),
                    feetZ: body.feetZ, targetZ: targetZ, offered: nearestOpenChest === chest };
                action(chest, evidence);
                return evidence;
            }
            return null;
        } finally {
            pos.x = saved.x; pos.y = saved.y; pos.floorZ = saved.floorZ;
            jumpAirborne = saved.airborne; jumpVelZ = saved.vz;
            updateTreasureChests();
        }
    }
    function reachableChestMatching(predicate) {
        for (var i = 0; i < treasureChests.length; i++) {
            var chest = treasureChests[i];
            if (predicate(chest) && visitReachableChest(chest, false, function () {})) return chest;
        }
        return null;
    }
    function findSpawner(key, idx) {
        for (var i = 0; i < enemySpawners.length; i++) {
            var s = enemySpawners[i];
            if (s._chunkKey === key && s._chunkIdx === idx) return s;
        }
        return null;
    }
    function findShrine(key) {
        for (var i = 0; i < shrines.length; i++) if (shrines[i].chunkKey === key) return shrines[i];
        return null;
    }
    // Every live enemy in the world: the window's array plus the enemy lists of
    // cached chunks outside the window (the window chunks' own lists are stale
    // while the window is live; saveEnemyStateToChunks rewrites them on a shift).
    function enemyCensus() {
        var all = aliveWorldEnemies().map(function (a) { return { x: a.x, y: a.y, t: a.t, src: "window" }; });
        for (var k in chunks) {
            var c = chunks[k];
            if (inWindow(c.cx, c.cy)) continue;
            for (var i = 0; i < c.enemies.length; i++) {
                var e = c.enemies[i];
                if (e.health > 0) all.push({ x: e.x, y: e.y, t: e.enemyType && e.enemyType.id, src: k });
            }
        }
        return all;
    }
    function sameEnemy(a, b) { return a.t === b.t && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5; }
    function missingFrom(list, from) { return list.filter(function (b) { return !from.some(function (a) { return sameEnemy(a, b); }); }).length; }
    function dupPairs(list) {
        var d = 0;
        for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) if (sameEnemy(list[i], list[j])) d++;
        return d;
    }
    function deltaCensus() {
        var keys = Object.keys(entityDeltas), bytes = 0, empty = 0, interact = 0;
        keys.forEach(function (k) {
            var d = entityDeltas[k], info = false;
            for (var f in d) {
                var v = d[f];
                if (f === "chestsCollected" || f === "spawnersDestroyed" || f === "shrineUsed") {
                    if (v && (v === true || v.length)) interact++;
                }
                if (v && typeof v === "object" && v.length !== undefined) {
                    bytes += (v.byteLength !== undefined) ? v.byteLength : v.length * 8;
                    for (var i = 0; i < v.length; i++) if (v[i]) { info = true; break; }
                } else if (v) { info = true; bytes += 8; }
            }
            if (!info) empty++;
        });
        return { keys: keys.length, bytes: bytes, empty: empty, interact: interact };
    }

    // ── S0: storage references (a NOTE, not a verdict) ───────────────────────
    // H1 (the game saves nothing) is an audit PROBLEM; asserting "no storage"
    // would report its fix as a regression. The count states the suite's scope.
    (function () {
        var re = /\b(localStorage|sessionStorage|indexedDB|IDBFactory|openDatabase|document\.cookie)\b/;
        var hits = [], lines = LAB.sourceLines();
        for (var i = 0; i < lines.length; i++) if (re.test(lines[i])) hits.push((i + 1) + ":" + lines[i].trim().slice(0, 40));
        LAB.metric("persistence.storage_refs", hits.length);
        LAB.note("browser-storage references in the game source: " + (hits.length ? hits.slice(0, 5).join(" | ") : "none") +
            " -- nothing survives a page reload (audit H1); every check here is about ONE page session");
    })();

    // ── S1: restart with the same seed in the same page session ──────────────
    // Runs FIRST: for the first seed the world built here is the page's first
    // world (the market/shrine guarantee, 6356-6435, is gated on !grid).
    LAB.scenario("persistence: restart", function () {
        var restart = [], guar = [], spellD = [], fortD = [], resetD = [];
        var okRestart = true, okGuar = true, okSpells = true, okFort = true, okReset = true;
        SEEDS.forEach(function (seed, si) {
            // Earlier seeds' leaks (measured below) must not seed this one; for
            // the first seed these are already the page-load values. grid=null
            // emulates a page load for every seed after the first.
            LAB.freshPage(); qualityPreset = PRESET_AT_LOAD; LAB.releasePad();
            grid = null;
            LAB.startEndless(seed); LAB.freezeDay(0.5);
            var fp1 = fpWindow();
            var hpMax0 = HEALTH_MAX, manaMax0 = MANA_MAX;

            // For the RESTART detail only: which spawn-window features did
            // assembleWindow inject (the generator's own chunk lacks them)?
            var injected = [];
            windowKeys().forEach(function (k) {
                var ch = chunks[k];
                if (!ch || !(ch.market || ch.shrine)) return;
                var fresh = regenerate(ch.cx, ch.cy);
                if (ch.market && !fresh.market) injected.push("market@" + k);
                if (ch.shrine && !fresh.shrine) injected.push("shrine@" + k);
            });

            // Every market and shrine of the spawn window, however it got there,
            // as the WORLD LISTS show them (marketStalls, shrines) -- what the
            // player walks up to. Fix-agnostic: a delta, a pinned chunk or a
            // separate registry all satisfy it.
            function features() {
                var f = [], byChunk = {};
                shrines.forEach(function (s) { f.push({ kind: "shrine", key: s.chunkKey, x: s.x + windowOriginX, y: s.y + windowOriginY, buff: s.buffType }); });
                marketStalls.forEach(function (s) {
                    var wx = s.x + windowOriginX, wy = s.y + windowOriginY, c = chunkOfWorld(wx, wy), k = keyOf(c.cx, c.cy);
                    (byChunk[k] = byChunk[k] || []).push({ x: wx, y: wy, t: s.stallType });
                });
                for (var k in byChunk) f.push({ kind: "market", key: k, stalls: byChunk[k] });
                return f;
            }
            function present(f) {
                if (f.kind === "shrine") return shrines.some(function (s) {
                    return Math.abs(s.x + windowOriginX - f.x) < 1 && Math.abs(s.y + windowOriginY - f.y) < 1 && s.buffType === f.buff; });
                return f.stalls.every(function (st) { return marketStalls.some(function (s) {
                    return Math.abs(s.x + windowOriginX - st.x) < 1 && Math.abs(s.y + windowOriginY - st.y) < 1 && s.stallType === st.t; }); });
            }
            var feats = features();
            var hasM = feats.some(function (f) { return f.kind === "market"; }), hasS = feats.some(function (f) { return f.kind === "shrine"; });
            var allKeys = windowKeys();
            var home = chunkCenter(0, 0);
            var rt = evictRoundTrip(allKeys, home.x, home.y);
            var farEnough = rt.still.length < allKeys.length;      // the trip evicted SOME spawn-window chunk
            var lost = feats.filter(function (f) { return !present(f); });
            var gPre = hasM && hasS && farEnough && rt.back && !(si === 0 && !PAGE_GRID_WAS_NULL);
            if (!gPre || lost.length) okGuar = false;
            guar.push("s" + seed + ": spawn window has " + feats.map(function (f) { return f.kind + "@" + f.key; }).join(" ") +
                (hasM && hasS ? "" : " PRECONDITION: the spawn window lacks a " + (hasM ? "shrine" : "market") + " (6356-6435 guarantee)") +
                (si === 0 && !PAGE_GRID_WAS_NULL ? " PRECONDITION: grid was already built at page load" : "") +
                (farEnough ? "; a " + FAR_CHUNKS + "-chunk trip evicted " + (allKeys.length - rt.still.length) + "/" + allKeys.length + " spawn-window chunks"
                           : " PRECONDITION: the trip evicted no spawn-window chunk") +
                (rt.back ? "" : " PRECONDITION: spawn window not rebuilt on return") +
                "; after the return " + (lost.length ? "GONE: " + lost.map(function (f) { return f.kind + "@" + f.key; }).join(" ") : "all present") +
                because(!lost.length, "(injected into the cached chunk object only, 6356-6435; evictDistantChunks 7463 drops it and generateChunk cannot rebuild it)"));

            // Play world 1: every kind of state a restart must forget.
            LAB.placeWorld(home.x, home.y, "top");
            var gold = reachableChestMatching(function (tc) { return tc.gold > 0 && !tc.equipId && !tc.relicId; });
            var gear = reachableChestMatching(function (tc) { return !!tc.equipId; });
            var goldApproach = visitReachableChest(gold, false, function (tc) { collectChest(tc); });
            var gearApproach = visitReachableChest(gear, false, function (tc) { collectChest(tc); });
            var killed = 0;
            if (enemies.length) {
                var victim = { x: enemies[0].x + windowOriginX, y: enemies[0].y + windowOriginY, t: enemies[0].enemyType.id };
                enemies[0].health = 0; LAB.tick(1);
                if (!findEnemyAtWorld(victim.x, victim.y, victim.t)) killed = 1;
            }
            coins += 1000;
            var shopOk = 0;
            ["spell_fire", "upg_missile", "winged_boots"].forEach(function (id) { if (applyShopItem(shopItem(id))) shopOk++; });
            applyArcaneTome();
            activateFortressGarrison({ structure: { regionX: 0, regionY: 0 }, x: pos.x + 40, y: pos.y });
            // An arena cleared through the arena's own path (19480-19580): three
            // waves, each killed, processed by updateEnemies/updateArenaChallenge.
            startArenaChallenge({ x: pos.x, y: pos.y, regionX: 5, regionY: 5, scale: 1 });
            for (var wv = 0; wv < 3 && arenaChallenge; wv++) {
                enemies.forEach(function (e) { if (e.arenaEnemy) e.health = 0; });
                LAB.tick(1);
                if (arenaChallenge && arenaChallenge.state === "waveDelay") { LAB.advance(2100); LAB.tick(1); }
            }
            // A stat pickup collected by updateStatPickups (19992), with the player
            // put where the game keeps the pickup (its window-local x,y). D20
            // misplaces that by the last shift, so a full tick would first
            // re-centre the window in step() (10306) and move it again; calling
            // the collector directly keeps D20 out of this check.
            var pk = spiralFind(14, function (ch) { return (ch.ruin && ch.ruin.statPickup) ? ch.ruin.statPickup : null; });
            var pickedUp = null;
            if (pk) {
                teleportChunk(pk.cx, pk.cy);
                for (var pi = 0; pi < statPickups.length; pi++) {
                    var sp = statPickups[pi];
                    if (sp.wx !== pk.hit.wx || sp.wy !== pk.hit.wy) continue;
                    var n0 = Object.keys(collectedStatPickups).length, at = { x: pos.x, y: pos.y };
                    pos.x = sp.x; pos.y = sp.y;
                    updateStatPickups();
                    pos.x = at.x; pos.y = at.y;
                    if (Object.keys(collectedStatPickups).length > n0) pickedUp = sp.type;
                    break;
                }
            }
            teleportChunk(1, 0);                     // one more window shift with all of that live
            teleportChunk(0, 0);
            var bonus = permanentHealthBonus + permanentManaBonus + permanentSpeedBonus;
            var played = {
                spellsChanged: JSON.stringify(spells) !== SPELLS_AT_LOAD, shopOk: shopOk,
                allies: fortressAllies.length, fortresses: Object.keys(completedFortresses).length,
                coins: coins, boots: !!equipment.boots,
                gear: !!(equipment.armor || equipment.hat || equipment.robes || equipment.boots || equipment.relic),
                deltas: Object.keys(entityDeltas).length, collected: !!(goldApproach && gold && gold.collected), killed: killed,
                bonus: bonus, pickups: Object.keys(collectedStatPickups).length, arenas: Object.keys(completedArenas).length
            };

            // Restart, same seed, same page session (the Endless button path).
            LAB.startEndless(seed); LAB.freezeDay(0.5);
            var fp2 = fpWindow();
            var cmp = compareFpSets(fp1, fp2);
            var playedOk = played.collected && played.deltas > 0;
            if (cmp.diffs.length || !playedOk) okRestart = false;
            restart.push("s" + seed + ": " + cmp.n + " spawn-window chunks, " +
                (playedOk ? "world 1 was played (reachable chest collected at " + fx(goldApproach.distance, 1) + " u, " + played.killed + " kill, " + played.deltas + " delta records)" : "PRECONDITION: world 1 was not modified (reachable gold=" + !!goldApproach + ", reachable gear=" + !!gearApproach + ")") +
                "; differ after restart: " + (cmp.diffs.length ? cmp.diffs.join(" ") : "none") +
                "; injected in world 1: " + (injected.length ? injected.join(" ") : "none") +
                because(!cmp.diffs.length, "(the guarantee is gated on !grid, 6358, and resetEndlessMode never clears grid)"));

            // Progression a new world must not inherit.
            var spellsNow = JSON.stringify(spells) === SPELLS_AT_LOAD;
            var carried = [];
            if (!spellsNow) {
                var cur = spells, snap = JSON.parse(SPELLS_AT_LOAD);
                for (var id in snap) {
                    if (cur[id].unlocked !== snap[id].unlocked) carried.push(id + ".unlocked=" + cur[id].unlocked);
                    if (cur[id].tier !== snap[id].tier) carried.push(id + ".tier=" + cur[id].tier);
                }
            }
            if (!played.spellsChanged || !spellsNow) okSpells = false;
            spellD.push("s" + seed + ": " + (played.spellsChanged ? "world 1 unlocked/upgraded spells (applyShopItem + arcane tome)" :
                "PRECONDITION: world 1 progression did not change the spell table") +
                "; after restart: " + (spellsNow ? "page-load spell table" : "carried over " + carried.join(" ")) +
                because(spellsNow, "(spells are assigned once at 1080; resetEndlessMode 7511-7589 never resets them)"));
            var alliesNow = fortressAllies.length, fortNow = Object.keys(completedFortresses).length;
            var fortOk = played.allies > 0 && played.fortresses > 0 && !alliesNow && !fortNow;
            if (!fortOk) okFort = false;
            fortD.push("s" + seed + ": world 1 had " + played.allies + " garrison allies, " + played.fortresses + " completed fortress entries" +
                (played.allies > 0 ? "" : " (PRECONDITION: garrison did not spawn allies)") +
                "; after restart: allies=" + alliesNow + " completedFortresses=" + fortNow +
                because(!alliesNow && !fortNow, "(resetEndlessMode 7511-7589 resets companions but neither fortressAllies nor completedFortresses)"));
            var eqNow = ["armor", "hat", "robes", "boots", "relic"].filter(function (s) { return !!equipment[s]; });
            var bonusNow = permanentHealthBonus + permanentManaBonus + permanentSpeedBonus;
            var resetOk = coins === 0 && !eqNow.length && Object.keys(entityDeltas).length === 0 &&
                bonusNow === 0 && HEALTH_MAX === hpMax0 && MANA_MAX === manaMax0 &&
                Object.keys(collectedStatPickups).length === 0 && Object.keys(completedArenas).length === 0;
            var resetPre = played.coins > 0 && played.boots && played.deltas > 0 && played.bonus > 0 && played.arenas > 0;
            if (!resetOk || !resetPre) okReset = false;
            resetD.push("s" + seed + ": world 1 coins=" + played.coins + " boots=" + played.boots + " deltas=" + played.deltas +
                " statBonus=" + fx(played.bonus, 2) + " (" + (pickedUp || "no pickup") + ") clearedArenas=" + played.arenas +
                (resetPre ? "" : " (PRECONDITION: world 1 not modified in every respect)") +
                "; after restart coins=" + coins + " deltas=" + Object.keys(entityDeltas).length + " equipped=" + (eqNow.join("+") || "none") +
                " statBonus=" + fx(bonusNow, 2) + " maxHP=" + HEALTH_MAX + " maxMana=" + MANA_MAX +
                " collectedPickups=" + Object.keys(collectedStatPickups).length + " clearedArenas=" + Object.keys(completedArenas).length);
        });
        LAB.check("persistence: restarting Endless with the same seed in the same page session rebuilds the same world",
            okRestart, restart.join(" || "));
        LAB.check("persistence: the spawn window's markets and shrines are back at their world positions after a trip that evicts the spawn window",
            okGuar, guar.join(" || "));
        LAB.check("persistence: a new Endless world starts with the page-load spell table (no unlocks or tier-2 upgrades carried over)",
            okSpells, spellD.join(" || "));
        LAB.check("persistence: a new Endless world starts without the previous world's fortress allies or fortress progress",
            okFort, fortD.join(" || "));
        LAB.check("persistence: a new Endless world starts with no coins, equipment, stat bonuses, cleared arenas or chunk deltas from the previous world",
            okReset, resetD.join(" || "));
    });

    // ── S1b: restart while the player is in the air (N5) ─────────────────────
    // Control: a start from a quiet page. Test: a world whose player is mid-jump
    // (winged boots bought in the shop, jump pressed, the game's own step())
    // restarted through the Endless button path. The new world must start the
    // way the control does: same jump state, same height after 5 ticks.
    LAB.scenario("persistence: restart mid-jump", function () {
        var ok = true, det = [];
        SEEDS.forEach(function (seed) {
            freshWorld(seed);
            var ctl = { air: jumpAirborne, vz: jumpVelZ };
            LAB.tick(5);
            var hCtl = LAB.h();
            freshWorld(seed);
            coins = 1000; applyShopItem(shopItem("winged_boots"));
            LAB.tick(10);                    // settle onto the ground first (the spawn is at h=0)
            jumpPressed = true;
            LAB.tick(2);
            var mid = { air: jumpAirborne, vz: jumpVelZ, h: LAB.h() };
            LAB.startEndless(seed); LAB.freezeDay(0.5);   // the restart
            var re = { air: jumpAirborne, vz: jumpVelZ };
            LAB.tick(5);
            var hRe = LAB.h();
            var pre = mid.air === true && mid.vz > 0;
            var same = re.air === ctl.air && re.vz === ctl.vz && Math.abs(hRe - hCtl) <= 0.01;
            if (!pre || !same) ok = false;
            det.push("s" + seed + ": world 1 " + (pre ? "mid-jump (airborne, vz=" + fx(mid.vz, 1) + ", h=" + fx(mid.h, 2) + ")" : "PRECONDITION: the jump did not start") +
                "; right after the restart airborne=" + re.air + " vz=" + fx(re.vz, 1) + " (a start from rest: airborne=" + ctl.air + " vz=" + fx(ctl.vz, 1) + ")" +
                "; h after 5 ticks " + fx(hRe, 2) + " vs " + fx(hCtl, 2) + " from rest" +
                because(same, "(neither resetEndlessMode 7511-7589 nor the btnEndless handler 22163 resets jumpAirborne/jumpVelZ, 721)"));
        });
        LAB.check("persistence: restarting Endless mid-jump starts the new world exactly as a start from rest (no carried-over jump)", ok, det.join(" || "));
    });

    // ── S2: generation does not depend on visit order, or on WHEN ────────────
    // Three fresh same-seed worlds at three wall-clock times (absolute, and an
    // odd number of seconds apart, so a chunk seeded from Date.now() cannot
    // coincide): A generates a block row-major, B generates other regions first
    // and then the block in reverse, C lets assembleWindow build it around a
    // teleported player.
    LAB.scenario("persistence: visit order", function () {
        var ok = true, det = [];
        var BX = 10, BY = 4;             // 5x5 block of chunks outside the spawn window
        var block = [];
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) block.push({ cx: BX + dx, cy: BY + dy });
        SEEDS.forEach(function (seed) {
            var T = Math.ceil(LAB.clock / 1e7) * 1e7 + 1e7;
            LAB.setClock(T);
            freshWorld(seed);
            var fa = {};
            block.forEach(function (b) { fa[keyOf(b.cx, b.cy)] = fpChunk(generateChunk(b.cx, b.cy)); });
            LAB.setClock(T + 3601007);
            freshWorld(seed);
            for (var y = -1; y <= 1; y++) for (var x = -1; x <= 1; x++) { generateChunk(-11 + x, -9 + y); generateChunk(16 + x, 13 + y); }
            var fb = {};
            block.slice().reverse().forEach(function (b) { fb[keyOf(b.cx, b.cy)] = fpChunk(generateChunk(b.cx, b.cy)); });
            LAB.setClock(T + 7203011);
            freshWorld(seed);
            teleportChunk(BX, BY);
            var fc = {}, notLoaded = 0;
            block.forEach(function (b) { var c = chunks[keyOf(b.cx, b.cy)]; if (!c) notLoaded++; fc[keyOf(b.cx, b.cy)] = c ? fpChunk(c) : null; });
            var ab = compareFpSets(fa, fb), ac = compareFpSets(fa, fc);
            if (ab.diffs.length || ac.diffs.length || notLoaded || ab.n !== block.length) ok = false;
            det.push("s" + seed + ": " + ab.n + " chunks around (" + BX + "," + BY + ") built at 3 clock times 1 h apart" +
                (notLoaded ? " PRECONDITION: " + notLoaded + " not loaded by the teleport" : "") +
                "; direct-vs-reversed diffs: " + (ab.diffs.length ? ab.diffs.join(" ") : "none") +
                "; direct-vs-walked-in diffs: " + (ac.diffs.length ? ac.diffs.join(" ") : "none"));
        });
        LAB.check("persistence: the same seed builds identical chunks regardless of visit order", ok, det.join(" || "));
    });

    // ── S3: chunk content does not depend on the player's equipment ──────────
    LAB.scenario("persistence: relic roll", function () {
        var ok = true, det = [];
        SEEDS.forEach(function (seed) {
            freshWorld(seed);
            equipment.relic = null;
            var f = spiralFind(14, function (ch) {
                for (var i = 0; i < ch.treasureChests.length; i++) if (ch.treasureChests[i].relicId) return i;
                return null;
            });
            if (!f) { ok = false; det.push("s" + seed + ": PRECONDITION: no relic chest within 14 chunks of the origin"); return; }
            var bare = regenerate(f.cx, f.cy);
            var rolled = bare.treasureChests[f.hit].relicId;
            var d = RELIC_DEFS[rolled];
            // Equip exactly the relic this chest rolls, the way collectChest does (20179-20182).
            equipment.relic = { id: d.id, name: d.name, desc: d.desc, effect: d.effect, value: d.value, color: d.color, accent: d.accent, shape: d.shape };
            var worn = regenerate(f.cx, f.cy);
            equipment.relic = null;
            var diff = fpDiff(fpChunk(bare), fpChunk(worn));
            if (diff.length) ok = false;
            det.push("s" + seed + ": chunk " + f.key + " chest#" + f.hit + " rolls " + rolled + " with no relic equipped, " +
                worn.treasureChests[f.hit].relicId + " with " + rolled + " equipped; chunk components that differ: " +
                (diff.length ? diff.join("+") : "none") + because(!diff.length, "(pickRandomRelic 3685-3693 skips equipment.relic)"));
        });
        LAB.check("persistence: chunk contents do not depend on the relic the player has equipped", ok, det.join(" || "));
    });

    // ── S4: eviction and revisit -- kills, collected chests, explored cells ──
    LAB.scenario("persistence: evict and revisit", function () {
        var okDead = true, okChest = true, okExpl = true, dDead = [], dChest = [], dExpl = [];
        SEEDS.forEach(function (seed) {
            freshWorld(seed);
            var home = chunkCenter(0, 0);
            var pc = playerChunk();
            // Victim chunk: first window chunk (row-major) holding a live enemy,
            // other than the player's own chunk.
            var byChunk = {};
            aliveWorldEnemies().forEach(function (a) { var c = chunkOfWorld(a.x, a.y); var k = keyOf(c.cx, c.cy); (byChunk[k] = byChunk[k] || []).push(a); });
            var K = null;
            windowKeys().forEach(function (k) { if (!K && byChunk[k] && k !== keyOf(pc.cx, pc.cy)) K = k; });
            // Gold chest to collect (the delta store's own positive case).
            var gold = reachableChestMatching(function (tc) { return tc.gold > 0 && !tc.equipId && !tc.relicId; });
            if (!K || !gold) {
                okDead = okDead && !!K; okChest = okChest && !!gold;
                dDead.push("s" + seed + ": PRECONDITION: " + (K ? "" : "no chunk with enemies"));
                dChest.push("s" + seed + ": PRECONDITION: " + (gold ? "" : "no gold chest in the spawn window"));
                return;
            }
            var victims = byChunk[K].map(function (a) { return { x: a.x, y: a.y, t: a.t }; });
            byChunk[K].forEach(function (a) { a.e.health = 0; });
            var goldKey = gold._chunkKey, goldIdx = gold._chunkIdx;
            var goldW = { x: gold.x + windowOriginX, y: gold.y + windowOriginY };
            var approach = visitReachableChest(gold, false, function (tc) { collectChest(tc); });
            // updateEnemies processes the deaths on the first tick; updateExplored
            // is throttled to one reveal per 100 ms (17018), so run 8 ticks.
            LAB.tick(8);
            var processed = victims.every(function (v) { return !findEnemyAtWorld(v.x, v.y, v.t); });
            var hk = keyOf(0, 0);
            function homeExplored() {
                var n = 0, ox = (0 - windowCX) * CHUNK_CELLS, oy = (0 - windowCY) * CHUNK_CELLS;
                for (var y = 0; y < CHUNK_CELLS; y++) for (var x = 0; x < CHUNK_CELLS; x++) if (exploredCells[(oy + y) * gridW + ox + x]) n++;
                return n;
            }
            var explBefore = homeExplored();

            var rt = evictRoundTrip([K, goldKey, hk], home.x, home.y);
            var pre = rt.evicted && rt.back;
            var preTxt = !rt.evicted ? "PRECONDITION: not evicted (" + rt.still.join(" ") + ")" : !rt.back ? "PRECONDITION: not back in window (" + rt.missing.join(" ") + ")" : "";

            // Killed enemies: none of them may be alive again, in the window or in the chunk.
            var revived = 0;
            victims.forEach(function (v) {
                if (findEnemyAtWorld(v.x, v.y, v.t)) revived++;
                else {
                    var ch = chunks[K];
                    if (ch) for (var j = 0; j < ch.enemies.length; j++) {
                        var e = ch.enemies[j];
                        if (e.health > 0 && e.enemyType && e.enemyType.id === v.t && Math.abs(e.x - v.x) < 0.01 && Math.abs(e.y - v.y) < 0.01) { revived++; break; }
                    }
                }
            });
            if (!pre || !processed || revived) okDead = false;
            dDead.push("s" + seed + ": killed " + victims.length + " enemies in chunk " + K +
                (processed ? "" : " (PRECONDITION: deaths not processed by updateEnemies)") + (preTxt ? " " + preTxt : "") +
                "; alive again at their spawn points after evict+revisit: " + revived + "/" + victims.length +
                because(!revived, "(no enemy delta: 6302-6318 applies only chest/spawner/explored/shrine deltas)"));

            var explAfter = homeExplored();
            if (!pre || explBefore === 0 || explAfter < explBefore) okExpl = false;
            dExpl.push("s" + seed + ": home chunk " + hk + " explored cells " + explBefore + " before, " + explAfter + " after evict+revisit" +
                (explBefore ? "" : " (PRECONDITION: nothing explored)") + (preTxt ? " " + preTxt : ""));

            // The collected chest: still collected, at its place, and the game does
            // not offer it again to a player standing next to it (updateTreasureChests).
            var c2 = findChest(goldKey, goldIdx);
            var atPlace = !!c2 && Math.abs(c2.x + windowOriginX - goldW.x) < 0.01 && Math.abs(c2.y + windowOriginY - goldW.y) < 0.01;
            var offered = null;
            var returnApproach = visitReachableChest(c2, true, function (tc, evidence) { offered = evidence.offered; });
            var cOk = pre && approach && gold.collected && returnApproach && atPlace && c2.collected && offered === false;
            if (!cOk) okChest = false;
            dChest.push("s" + seed + ": gold chest " + goldKey + "#" + goldIdx + " collected=" + gold.collected + " before; after evict+revisit " +
                (c2 ? "collected=" + c2.collected + (atPlace ? "" : " MOVED") + ", offered again from a verified reachable pose=" + offered : "chest not found") +
                (approach && gold.collected ? "; collection setup offered the live chest" : " PRECONDITION: reachable collection did not complete") +
                (returnApproach ? "; return distance=" + fx(returnApproach.distance, 1) + " u" : " PRECONDITION: no clear supported return pose") +
                (preTxt ? " " + preTxt : ""));
        });
        LAB.check("persistence: a killed enemy stays dead after its chunk is evicted and revisited", okDead, dDead.join(" || "));
        LAB.check("persistence: a collected chest stays collected after its chunk is evicted and revisited", okChest, dChest.join(" || "));
        LAB.check("persistence: explored minimap cells survive chunk eviction and revisit", okExpl, dExpl.join(" || "));
    });

    // ── S4b: the other two delta kinds -- destroyed spawners, used shrines ───
    // Seed 424242's spawn window has no spawner and only an INJECTED shrine
    // (whose loss is N12's check), so both are searched for outside it.
    LAB.scenario("persistence: spawner and shrine deltas", function () {
        var okSp = true, okSh = true, dSp = [], dSh = [];
        SEEDS.forEach(function (seed) {
            freshWorld(seed);
            var f = spiralFind(14, function (ch) {
                for (var i = 0; i < ch.enemySpawners.length; i++) if (ch.enemySpawners[i].active) return i;
                return null;
            });
            if (!f) { okSp = false; dSp.push("s" + seed + ": PRECONDITION: no active spawner within 14 chunks"); }
            else {
                teleportChunk(f.cx, f.cy);
                var sp = findSpawner(f.key, f.hit);
                // The state the projectile path leaves a destroyed obelisk in (10917-10921).
                if (sp) { sp.hp = 0; sp.active = false; }
                var c = chunkCenter(f.cx, f.cy);
                var rt = evictRoundTrip([f.key], c.x, c.y);
                var sp2 = findSpawner(f.key, f.hit);
                var ok = !!sp && rt.evicted && rt.back && !!sp2 && sp2.active === false;
                if (!ok) okSp = false;
                dSp.push("s" + seed + ": spawner " + f.key + "#" + f.hit + (sp ? " destroyed" : " PRECONDITION: not in the window after the teleport") +
                    (rt.evicted ? "" : " PRECONDITION: not evicted") + (rt.back ? "" : " PRECONDITION: not back in window") +
                    "; after evict+revisit " + (sp2 ? "active=" + sp2.active + " hp=" + sp2.hp : "spawner not found"));
            }
            freshWorld(seed);
            var g = spiralFind(14, function (ch) { return (ch.shrine && !inWindow(ch.cx, ch.cy)) ? true : null; });
            if (!g) { okSh = false; dSh.push("s" + seed + ": PRECONDITION: no natural shrine within 14 chunks"); }
            else {
                teleportChunk(g.cx, g.cy);
                var shr = findShrine(g.key);
                if (shr) activateShrine(shr);
                var used = !!shr && shr.used === true;
                var c2 = chunkCenter(g.cx, g.cy);
                var rt2 = evictRoundTrip([g.key], c2.x, c2.y);
                var shr2 = findShrine(g.key);
                var ok2 = used && rt2.evicted && rt2.back && !!shr2 && shr2.used === true;
                if (!ok2) okSh = false;
                dSh.push("s" + seed + ": " + (shr ? shr.buffType : "?") + " shrine in chunk " + g.key + (used ? " activated (activateShrine)" : " PRECONDITION: activateShrine did not mark it used") +
                    (rt2.evicted ? "" : " PRECONDITION: not evicted") + (rt2.back ? "" : " PRECONDITION: not back in window") +
                    "; after evict+revisit " + (shr2 ? "used=" + shr2.used : "shrine not found"));
            }
        });
        LAB.check("persistence: a destroyed spawner stays destroyed after its chunk is evicted and revisited", okSp, dSp.join(" || "));
        LAB.check("persistence: a used shrine stays used after its chunk is evicted and revisited", okSh, dSh.join(" || "));
    });

    // ── S5: a chest whose item was swapped ───────────────────────────────────
    // One swap = collectChest with the slot already filled (20175-20217): the
    // chest takes the old item (and its quality) and is NOT marked collected.
    // The window-shift and the eviction sub-tests each get their OWN fresh world
    // and their own swap, so the eviction verdict cannot inherit the shift bug.
    LAB.scenario("persistence: chest swap", function () {
        var res = { shift: [true, []], evict: [true, []] };
        function relicObj(id) { var d = RELIC_DEFS[id]; return { id: d.id, name: d.name, desc: d.desc, effect: d.effect, value: d.value, color: d.color, accent: d.accent, shape: d.shape }; }
        function run(mode, seed, label, chestKey, chestIdx, doSwap, expect) {
            var R = res[mode];
            var c = findChest(chestKey, chestIdx);
            if (!c) { R[0] = false; R[1].push("s" + seed + " " + label + ": PRECONDITION: chest not in window"); return; }
            var cw = { x: c.x + windowOriginX, y: c.y + windowOriginY };
            var before = { equipId: c.equipId, relicId: c.relicId, quality: c.quality };
            var approach = visitReachableChest(c, false, function (tc) { doSwap(tc); });
            var swapped = c.equipId === expect.equipId && c.relicId === expect.relicId && !c.collected &&
                (expect.quality === undefined || Math.abs(c.quality - expect.quality) < 1e-9);
            function state(ch) {
                if (!ch) return "chest not found";
                return (ch.equipId || ch.relicId) + (ch.equipId ? " q=" + fx(ch.quality, 4) : "") + (ch.collected ? " collected" : "");
            }
            function matches(ch) {
                return !!ch && ch.equipId === expect.equipId && ch.relicId === expect.relicId && !ch.collected &&
                    (expect.quality === undefined || Math.abs(ch.quality - expect.quality) < 1e-9) &&
                    Math.abs(ch.x + windowOriginX - cw.x) < 0.01 && Math.abs(ch.y + windowOriginY - cw.y) < 0.01;
            }
            var head = "s" + seed + " " + label + " " + chestKey + "#" + chestIdx +
                (approach ? ": reachable offer at " + fx(approach.distance, 1) + " u; generated " : ": PRECONDITION: no clear supported chest interaction pose; generated ") + (before.equipId || before.relicId) +
                (before.equipId ? " q=" + fx(before.quality, 4) : "") + ", swapped to " + (expect.equipId || expect.relicId) +
                (expect.quality !== undefined ? " q=" + fx(expect.quality, 4) : "") +
                (swapped ? "" : " PRECONDITION: swap did not happen (" + state(c) + ")");
            var pc = playerChunk();
            if (mode === "shift") {
                var cc = chunkOfWorld(cw.x, cw.y), ox = windowCX;
                teleportChunk(pc.cx + 1, pc.cy);
                var stayed = inWindow(cc.cx, cc.cy) && windowCX !== ox;
                var a = findChest(chestKey, chestIdx), okA = swapped && stayed && matches(a);
                if (!okA) R[0] = false;
                R[1].push(head + (stayed ? "" : " PRECONDITION: no shift or chest left the window") + "; after a window shift: " + state(a) +
                    because(okA, "(saveAllEntityDeltas 7396-7401 writes equipId/relicId back but not quality; assembly 7036-7041 reads the chunk's)"));
            } else {
                var back = chunkCenter(pc.cx, pc.cy);
                var rt = evictRoundTrip([chestKey], back.x, back.y);
                var b = findChest(chestKey, chestIdx), okB = swapped && rt.evicted && rt.back && matches(b);
                if (!okB) R[0] = false;
                R[1].push(head + (rt.evicted ? "" : " PRECONDITION: not evicted") + (rt.back ? "" : " PRECONDITION: not back in window") +
                    "; after evict+revisit: " + state(b) +
                    because(okB, "(a swap never sets collected and no delta records it, 7403-7409; the regenerated chunk hands the generated item back)"));
            }
        }
        ["shift", "evict"].forEach(function (mode) {
            SEEDS.forEach(function (seed) {
                // Equipment chest in the spawn window whose chunk survives a one-chunk shift east.
                freshWorld(seed);
                var gear = reachableChestMatching(function (tc) {
                    var cc = chunkOfWorld(tc.x + windowOriginX, tc.y + windowOriginY);
                    return tc.equipId && EQUIPMENT_DEFS[tc.equipId] && cc.cx >= windowCX + 1;
                });
                if (!gear) { res[mode][0] = false; res[mode][1].push("s" + seed + " equipment: PRECONDITION: no equipment chest"); }
                else {
                    var slot = EQUIPMENT_DEFS[gear.equipId].slot, oldId = null;
                    for (var id in EQUIPMENT_DEFS) if (!oldId && EQUIPMENT_DEFS[id].slot === slot && id !== gear.equipId) oldId = id;
                    var q = Math.abs(gear.quality - 0.8765) > 0.01 ? 0.8765 : 1.1234;   // a quality no generator produces
                    run(mode, seed, "equipment", gear._chunkKey, gear._chunkIdx, function (c) {
                        equipment[slot] = createEquipInstance(oldId, q);
                        collectChest(c);
                    }, { equipId: oldId, relicId: gear.relicId || null, quality: q });
                }
                // Relic chest: nearest epic chest; stand in its chunk. The relic
                // swapped in differs from the rolled one AND from what the chunk
                // re-rolls while the player wears the rolled one (H7), so a lost
                // swap can never pass by coincidence.
                freshWorld(seed);
                equipment.relic = null;
                var f = spiralFind(14, function (ch) {
                    for (var j = 0; j < ch.treasureChests.length; j++) if (ch.treasureChests[j].relicId) return j;
                    return null;
                });
                if (!f) { res[mode][0] = false; res[mode][1].push("s" + seed + " relic: PRECONDITION: no relic chest"); return; }
                teleportChunk(f.cx, f.cy);
                var rolled = f.ch.treasureChests[f.hit].relicId;
                equipment.relic = relicObj(rolled);
                var reroll = regenerate(f.cx, f.cy).treasureChests[f.hit].relicId;
                equipment.relic = null;
                var other = null;
                for (var r = 0; r < RELIC_KEYS.length && !other; r++) if (RELIC_KEYS[r] !== rolled && RELIC_KEYS[r] !== reroll) other = RELIC_KEYS[r];
                run(mode, seed, "relic", f.key, f.hit, function (c) {
                    equipment.relic = relicObj(other);
                    collectChest(c);
                }, { equipId: null, relicId: other });
            });
        });
        LAB.check("persistence: a chest whose item was swapped keeps the swapped item and quality across a window shift",
            res.shift[0], res.shift[1].join(" || "));
        LAB.check("persistence: a chest whose item was swapped keeps the swapped item and quality after its chunk is evicted and revisited",
            res.evict[0], res.evict[1].join(" || "));
    });

    // ── S6: delta-store growth while just walking ────────────────────────────
    // Frame rate plays no part in what the delta store records, so the walk
    // uses 60 Hz physics ticks (LAB.walkTo without fps).
    LAB.scenario("persistence: delta growth", function () {
        var ok = true, det = [];
        // Straight walk from spawn with the real input path. Terrain can block a
        // heading, so try east, south, west, north and keep the first heading
        // that enters enough DISTINCT windows (a re-crossed line re-enters an old
        // window and proves nothing new). If walls block all four, fall back to
        // a guided walk: the player is stepped east along a straight line at
        // walking speed (90 u/s) with placeWorld, and one real tick runs per step.
        var HEADINGS = [["east", 1, 0], ["south", 0, 1], ["west", -1, 0], ["north", 0, -1]];
        SEEDS.forEach(function (seed, si) {
            var seen = {}, crossings = 0, per = [], heading = null;
            function onTick() {
                health = HEALTH_MAX;                     // walking only: nothing may end the walk early
                var k = windowCX + "," + windowCY;
                if (!seen[k]) { seen[k] = true; crossings++; per.push(deltaCensus()); }
            }
            function reset(name) { seen = {}; seen[windowCX + "," + windowCY] = true; crossings = 0; per = []; heading = name; }
            for (var hi = 0; hi < HEADINGS.length && crossings < WALK_CROSSINGS; hi++) {
                freshWorld(seed);
                var w0 = LAB.worldPos(), hd = HEADINGS[hi];
                reset(hd[0]);
                LAB.walkTo(w0.x + hd[1] * CHUNK_SIZE * (WALK_CROSSINGS + 0.5), w0.y + hd[2] * CHUNK_SIZE * (WALK_CROSSINGS + 0.5), { maxTicks: 4000, onTick: onTick });
            }
            if (crossings < WALK_CROSSINGS) {
                freshWorld(seed);
                var g0 = LAB.worldPos(), steps = Math.ceil(CHUNK_SIZE * (WALK_CROSSINGS + 0.5) / (90 * LAB.FIXED_DT));
                reset("east (guided: walls blocked every heading)");
                for (var st = 1; st <= steps; st++) {
                    LAB.placeWorld(g0.x + st * 90 * LAB.FIXED_DT, g0.y, "top");
                    onTick();
                    LAB.tick(1);
                }
            }
            var c = deltaCensus();
            var pre = crossings >= WALK_CROSSINGS && c.interact === 0;
            if (!pre || c.empty > 0) ok = false;
            det.push("s" + seed + ": walked " + heading + ", " + crossings + " new windows entered" + (crossings >= WALK_CROSSINGS ? "" : " (PRECONDITION: fewer than " + WALK_CROSSINGS + " in every heading)") +
                (c.interact ? " (PRECONDITION: " + c.interact + " interaction deltas)" : ", no interaction") +
                "; delta records after each new window " + per.map(function (p) { return p.keys; }).join("/") +
                "; records carrying no information " + c.empty + "/" + c.keys + " (" + c.bytes + " bytes)" +
                because(c.empty === 0, "(saveAllEntityDeltas 7457-7458 snapshots explored cells for every window chunk on every shift, all-zero ones included)"));
            if (si === 0) {
                LAB.metric("persistence.deltas.records_after_walk", c.keys);
                LAB.metric("persistence.deltas.bytes_after_walk", c.bytes, "bytes");
                LAB.metric("persistence.deltas.noinfo_records_after_walk", c.empty);
                if (per.length >= 2) LAB.metric("persistence.deltas.bytes_per_crossing", (per[per.length - 1].bytes - per[0].bytes) / (per.length - 1), "bytes");
                LAB.metric("persistence.chunks.loaded_after_walk", Object.keys(chunks).length);
            }
        });
        LAB.check("persistence: walking across chunk lines without interacting stores no chunk delta that carries no information",
            ok, det.join(" || "));
    });

    // ── S6b: both long-lived stores stay bounded (H8) ───────────────────────
    // generateChunk reads the cave networks of the 3x3 regions (1 region = 3
    // chunks) around its own region (5341-5350), and assembleWindow only
    // generates chunks of the current window. So the networks any pending
    // generation can read lie within ceil(W/3)+1 regions (the window's span) +
    // 2 (that reach) per axis; one more region of hysteresis on each side keeps
    // a player pacing across a region line from recomputing: BOUND =
    // (ceil(W/3)+1+2+2)^2 = 64 for W=7 (49 for W=5). A memo tied to the chunk
    // cache (evictDistantChunks keeps W+2 chunks around the centre) stays under
    // it on a straight walk; an unbounded memo passes it after ~30 chunks.
    LAB.scenario("persistence: cave-network memo", function () {
        var ok = true, okBoth = true, det = [], bothDet = [];
        var STEPS = 14, STEP_CHUNKS = 3;          // one region per step: 42 chunks east
        var DELTA_BOUND_BYTES = 4096;              // no interaction: only a small active working set is defensible
        SEEDS.forEach(function (seed, si) {
            freshWorld(seed);
            var W = WINDOW_CHUNKS, per = Math.ceil(W / 3) + 1 + 2 + 2, bound = per * per;
            var trace = [], maxMemo = 0, maxDeltaBytes = 0, maxDeltaKeys = 0, interactions = 0;
            var homeKey = keyOf(-Math.floor(W / 2), 0);
            for (var s = 1; s <= STEPS; s++) {
                teleportChunk(s * STEP_CHUNKS, 0);
                var n = Object.keys(endlessCaveNetworks).length;
                if (n > maxMemo) maxMemo = n;
                var dc = deltaCensus();
                if (dc.bytes > maxDeltaBytes) maxDeltaBytes = dc.bytes;
                if (dc.keys > maxDeltaKeys) maxDeltaKeys = dc.keys;
                interactions += dc.interact;
                if (s % 3 === 0 || s === STEPS) trace.push(n);
            }
            var evicted = !chunks[homeKey];
            var nets = Object.keys(endlessCaveNetworks).filter(function (k) { return !!endlessCaveNetworks[k]; }).length;
            if (!evicted || maxMemo > bound) ok = false;
            var both = evicted && interactions === 0 && maxMemo <= bound && maxDeltaBytes <= DELTA_BOUND_BYTES;
            if (!both) okBoth = false;
            det.push("s" + seed + ": walked " + (STEPS * STEP_CHUNKS) + " chunks east one region at a time (W=" + W + ")" +
                (evicted ? "" : " PRECONDITION: home chunk " + homeKey + " never evicted") +
                "; memo entries every 3 regions " + trace.join("/") + ", max " + maxMemo + " vs bound " + bound +
                " (" + nets + " real networks among them)" +
                because(maxMemo <= bound, "(endlessCaveNetworks 1153 is only ever added to, 4441-4567; reset only by resetEndlessMode 7536)"));
            var causes = [];
            if (maxMemo > bound) causes.push("endlessCaveNetworks is only ever added to (1153/4441-4567)");
            if (maxDeltaBytes > DELTA_BOUND_BYTES) causes.push("saveAllEntityDeltas snapshots explored cells for every window chunk (7457-7458)");
            bothDet.push("s" + seed + ": walked " + (STEPS * STEP_CHUNKS) + " chunks with no interaction" +
                (evicted ? "" : " PRECONDITION: home chunk " + homeKey + " never evicted") +
                (interactions ? " PRECONDITION: " + interactions + " interaction delta observations" : "") +
                "; memo max " + maxMemo + " vs bound " + bound + "; delta bytes max " + maxDeltaBytes + " vs bound " + DELTA_BOUND_BYTES +
                " (max " + maxDeltaKeys + " records)" + (causes.length ? " (" + causes.join("; ") + ")" : ""));
            if (si === 0) {
                LAB.metric("persistence.caveNetworks.memo_entries_after_walk", maxMemo);
                LAB.metric("persistence.caveNetworks.networks_after_walk", nets);
                LAB.metric("persistence.deltas.max_bytes_on_long_walk", maxDeltaBytes, "bytes");
                LAB.metric("persistence.deltas.max_records_on_long_walk", maxDeltaKeys);
            }
        });
        LAB.check("persistence: the cave-network memo stays within the regions the chunk window can reach on a long walk", ok, det.join(" || "));
        LAB.check("persistence: the cave-network memo and delta store stay bounded on a 42-chunk no-interaction walk", okBoth, bothDet.join(" || "));
    });

    // ── S7: enemy state across a window shift (D19, owned here) ──────────────
    LAB.scenario("persistence: enemy flags", function () {
        var res = { ug: [true, []], arena: [true, []], spawner: [true, []], hp: [true, []] };
        // The shift: move the player one chunk east of the chunk they stand in.
        // (Cave Test teleports the player next to the entrance without
        // re-centring, so the window after that move is centred on the target
        // chunk, not on the old centre plus one.)
        function shiftTarget() { var pc = playerChunk(); return { cx: pc.cx + 1, cy: pc.cy }; }
        function shiftAndFind(tracked) {
            var tg = shiftTarget(), ox = windowCX, oy = windowCY;
            teleportChunk(tg.cx, tg.cy);
            var shifted = windowCX !== ox || windowCY !== oy;
            return { shifted: shifted, found: tracked.map(function (t) { return findEnemyAtWorld(t.x, t.y, t.t); }) };
        }
        function eligible(list) {
            // enemies whose chunk is inside both the current window and the one
            // the shift will assemble around the target chunk
            var tg = shiftTarget(), half = Math.floor(WINDOW_CHUNKS / 2);
            return list.filter(function (a) {
                var c = chunkOfWorld(a.x, a.y);
                return inWindow(c.cx, c.cy) && Math.abs(c.cx - tg.cx) <= half && Math.abs(c.cy - tg.cy) <= half;
            });
        }
        function track(list) { return list.map(function (a) { return { x: a.x, y: a.y, t: a.t }; }); }
        var SAVE_CAUSE = "(saveEnemyStateToChunks 7369-7381 does not copy it";
        SEEDS.forEach(function (seed) {
            // Arena: a real wave from the arena's own path (startArenaChallenge ->
            // spawnArenaWave, 19480-19535), then the shift.
            freshWorld(seed);
            startArenaChallenge({ x: pos.x, y: pos.y, regionX: 5, regionY: 5, scale: 1 });
            var ar = eligible(aliveWorldEnemies().filter(function (a) { return a.e.arenaEnemy === true; }));
            if (!ar.length) { res.arena[0] = false; res.arena[1].push("s" + seed + ": PRECONDITION: the arena spawned no wave enemy inside both windows"); }
            else {
                var ta = track(ar), ra = shiftAndFind(ta);
                var keptA = ra.found.filter(function (e) { return e && e.arenaEnemy === true; }).length;
                var foundA = ra.found.filter(function (e) { return !!e; }).length;
                var okA = ra.shifted && foundA === ta.length && keptA === ta.length;
                if (!okA) res.arena[0] = false;
                res.arena[1].push("s" + seed + ": " + ta.length + " arena wave-1 enemies, still arenaEnemy after the shift " + keptA + "/" + ta.length +
                    (ra.shifted ? "" : " (PRECONDITION: window did not shift)") + (foundA === ta.length ? "" : " (PRECONDITION: only " + foundA + " found after the shift)") +
                    because(okA, SAVE_CAUSE + " and assembly 7051-7063 does not either)"));
            }
            // Spawner-born: stand next to the nearest active spawner and let
            // updateEnemySpawners (20229-20280) spawn one, then shift.
            freshWorld(seed);
            var fsp = spiralFind(14, function (ch) {
                for (var i = 0; i < ch.enemySpawners.length; i++) if (ch.enemySpawners[i].active) return i;
                return null;
            });
            var born = null, sp = null;
            if (fsp) {
                teleportChunk(fsp.cx, fsp.cy);
                sp = findSpawner(fsp.key, fsp.hit);
                if (sp) {
                    var offs = [[40, 0], [-40, 0], [0, 40], [0, -40]];
                    for (var oi = 0; oi < offs.length && !born; oi++) {
                        LAB.placeWorld(sp.x + windowOriginX + offs[oi][0], sp.y + windowOriginY + offs[oi][1], "top");
                        sp = findSpawner(fsp.key, fsp.hit);
                        for (var t = 0; t < 30 && !born; t++) {
                            LAB.tick(1);
                            var bl = aliveWorldEnemies().filter(function (a) { return a.e.fromSpawner === true; });
                            if (bl.length) born = bl[0];
                        }
                    }
                }
            }
            var elB = born ? eligible([born]) : [];
            if (!elB.length) {
                res.spawner[0] = false;
                res.spawner[1].push("s" + seed + ": PRECONDITION: " + (!fsp ? "no active spawner within 14 chunks" : !born ? "the spawner at " + fsp.key + " spawned nothing in 120 ticks" : "the spawned enemy would leave the window"));
            } else {
                var tb = track(elB), rb = shiftAndFind(tb), b0 = rb.found[0];
                var okB = rb.shifted && !!b0 && b0.fromSpawner === true;
                if (!okB) res.spawner[0] = false;
                res.spawner[1].push("s" + seed + ": enemy spawned by spawner " + fsp.key + "#" + fsp.hit + " at world(" + fx(tb[0].x, 1) + "," + fx(tb[0].y, 1) + ") fromSpawner=true before, " +
                    (b0 ? "fromSpawner=" + b0.fromSpawner : "?") + " after" + (rb.shifted ? "" : " (PRECONDITION: window did not shift)") + (b0 ? "" : " (PRECONDITION: enemy not found after the shift)") +
                    because(okB, SAVE_CAUSE + " and assembly 7051-7063 does not either)"));
            }
            // Wounded: a health value no generator produces, then the shift.
            freshWorld(seed);
            var el = eligible(aliveWorldEnemies());
            if (!el.length) { res.hp[0] = false; res.hp[1].push("s" + seed + ": PRECONDITION: no eligible enemy"); }
            else {
                var hp = Math.round(el[0].e.maxHealth * 0.37 * 1000) / 1000;
                if (hp <= 0 || hp === el[0].e.health) hp = 0.37;
                el[0].e.health = hp;
                var tw = track(el.slice(0, 1)), rw = shiftAndFind(tw), w0 = rw.found[0];
                var okW = rw.shifted && !!w0 && Math.abs(w0.health - hp) < 1e-9;
                if (!okW) res.hp[0] = false;
                res.hp[1].push("s" + seed + ": enemy at world(" + fx(tw[0].x, 1) + "," + fx(tw[0].y, 1) + ") health " + hp + " before, " +
                    (w0 ? w0.health : "?") + " after" + (rw.shifted ? "" : " (PRECONDITION: window did not shift)") + (w0 ? "" : " (PRECONDITION: enemy not found)"));
            }
        });
        // Cave Test: its cave enemies are generated underground (5936).
        CT_SEEDS.forEach(function (seed) {
            freshCaveTest(seed, { caveEnemies: true });
            var ug = eligible(aliveWorldEnemies().filter(function (a) { return a.e.underground === true; })).slice(0, 3);
            if (!ug.length) { res.ug[0] = false; res.ug[1].push("ct" + seed + ": PRECONDITION: no underground enemy in the cave test window"); return; }
            var tu = track(ug), ru = shiftAndFind(tu);
            var kept = ru.found.filter(function (e) { return e && e.underground === true; }).length;
            var found = ru.found.filter(function (e) { return !!e; }).length;
            var okU = ru.shifted && found === tu.length && kept === tu.length;
            if (!okU) res.ug[0] = false;
            res.ug[1].push("ct" + seed + ": " + tu.length + " underground enemies, still underground after the shift " + kept + "/" + tu.length +
                (ru.shifted ? "" : " (PRECONDITION: window did not shift)") +
                (found === tu.length ? "" : " (PRECONDITION: only " + found + " found after the shift)") +
                because(okU, SAVE_CAUSE + "; assembly copies it, 7063)"));
        });
        LAB.check("persistence: a cave (underground) enemy is still underground after a window shift", res.ug[0], res.ug[1].join(" || "));
        LAB.check("persistence: an arena-wave enemy is still an arena enemy after a window shift", res.arena[0], res.arena[1].join(" || "));
        LAB.check("persistence: a spawner-born enemy is still spawner-born after a window shift", res.spawner[0], res.spawner[1].join(" || "));
        LAB.check("persistence: a wounded enemy keeps its health after a window shift", res.hp[0], res.hp[1].join(" || "));
    });

    // ── S8: stat pickups and fortress allies across window shifts ────────────
    LAB.scenario("persistence: pickups and allies", function () {
        var okSP = true, okAl = true, dSP = [], dAl = [];
        SEEDS.forEach(function (seed) {
            freshWorld(seed);
            var f = spiralFind(14, function (ch) {
                return (ch.ruin && ch.ruin.statPickup && !collectedStatPickups[Math.floor(ch.ruin.statPickup.wx) + "," + Math.floor(ch.ruin.statPickup.wy)]) ? ch.ruin.statPickup : null;
            });
            if (!f) { okSP = false; dSP.push("s" + seed + ": PRECONDITION: no stat pickup within 14 chunks"); }
            else {
                // Stand two chunks east of it (outside the 100 u vacuum radius), then
                // shift north and back south. After each shift, every stat pickup
                // must sit at its own world position.
                var steps = [[f.cx + 2, f.cy], [f.cx + 2, f.cy - 1], [f.cx + 2, f.cy]];
                var seen = 0, bad = [];
                steps.forEach(function (s) {
                    var ox = windowOriginX, oy = windowOriginY;
                    teleportChunk(s[0], s[1]);
                    var shifted = ox !== windowOriginX || oy !== windowOriginY;
                    statPickups.forEach(function (p) {
                        if (!shifted) return;
                        seen++;
                        var ex = p.x + windowOriginX - p.wx, ey = p.y + windowOriginY - p.wy;
                        if (Math.abs(ex) > 0.01 || Math.abs(ey) > 0.01) bad.push(p.type + " off by (" + fx(ex, 1) + "," + fx(ey, 1) + ") after shift (" + (windowOriginX - ox) + "," + (windowOriginY - oy) + ")");
                    });
                });
                if (!seen || bad.length) okSP = false;
                dSP.push("s" + seed + ": " + f.hit.type + " in ruin chunk " + f.key + " world(" + fx(f.hit.wx, 1) + "," + fx(f.hit.wy, 1) + "); " +
                    (seen ? seen + " pickup observations after shifts" : "PRECONDITION: pickup never in window after a shift") +
                    "; misplaced: " + (bad.length ? bad.join(" | ") : "none") +
                    because(!bad.length, "(built in new-origin coords 7117-7119, shifted again 7320-7322)"));
            }
            // Fortress allies: the garrison's own spawn path, then one shift.
            freshWorld(seed);
            activateFortressGarrison({ structure: { regionX: 0, regionY: 0 }, x: pos.x + 40, y: pos.y });
            var before = fortressAllies.map(function (a) { return { x: a.x + windowOriginX, y: a.y + windowOriginY }; });
            var pc = playerChunk(), ox2 = windowCX;
            teleportChunk(pc.cx + 1, pc.cy);
            var shifted2 = windowCX !== ox2;
            var moved = [];
            fortressAllies.forEach(function (a, i) {
                var dx = a.x + windowOriginX - before[i].x, dy = a.y + windowOriginY - before[i].y;
                if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) moved.push("ally" + i + " moved (" + fx(dx, 1) + "," + fx(dy, 1) + ")");
            });
            if (!before.length || !shifted2 || moved.length || fortressAllies.length !== before.length) okAl = false;
            dAl.push("s" + seed + ": " + before.length + " garrison allies" + (before.length ? "" : " (PRECONDITION: none spawned)") +
                (shifted2 ? ", window shifted one chunk" : " (PRECONDITION: no shift)") + "; world displacement after the shift: " +
                (moved.length ? moved.join(" ") : "none") + because(!moved.length, "(fortressAllies is not in the rebase list 7295-7325)"));
        });
        LAB.check("persistence: stat pickups stay at their world position across window shifts", okSP, dSP.join(" || "));
        LAB.check("persistence: fortress allies stay at their world position across a window shift", okAl, dAl.join(" || "));
    });

    // ── S9: the Settings panel ───────────────────────────────────────────────
    // Reached exactly as a player reaches it: open the panel the way the O key
    // does (22377-22387: sync the staging copy, then settingsOpen), let
    // drawSettingsOverlay lay out its hit areas as a frame would, click with
    // handleSettingsClick (the canvas click handler, 22217-22224), run the rAF
    // an Apply schedules.
    function openSettings() {
        pendingSettings.viewDist = settings.viewDist; pendingSettings.chunkWindow = settings.chunkWindow;
        pendingSettings.particles = settings.particles; pendingSettings.resolution = settings.resolution;
        pendingSettings.showFPS = settings.showFPS; pendingSettings.dayNight = settings.dayNight;
        _pendingQualityPreset = qualityPreset; _settingsDirty = false; settingsOpen = true;
    }
    function layoutSettings() { LAB.prepCamera(); drawSettingsOverlay(); return _settingsClickAreas.slice(); }
    function hitArea(areas, x, y) {
        for (var j = 0; j < areas.length; j++) { var b = areas[j]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return j; }
        return -1;
    }
    // Click the first hit area matching pred. `at(a)` picks the point; without
    // it, a point of the area that no EARLIER area claims (handleSettingsClick
    // takes the first containing area), preferring the middle column.
    function clickSettings(pred, at) {
        var areas = layoutSettings(), ai = -1;
        for (var i = 0; i < areas.length; i++) if (pred(areas[i])) { ai = i; break; }
        if (ai < 0) return { ok: false, why: "no such hit area" };
        var a = areas[ai], pt = null, total = 0, hidden = 0;
        if (at) pt = at(a);
        else for (var yy = 0; yy < 20; yy++) for (var xx = 0; xx < 20; xx++) {
            var px = a.x + a.w * (xx + 0.5) / 20, py = a.y + a.h * (yy + 0.5) / 20;
            total++;
            if (hitArea(areas, px, py) !== ai) hidden++; else if (!pt || (xx === 10 && !pt.mid)) pt = { x: px, y: py, mid: xx === 10 };
        }
        if (!pt) return { ok: false, why: "area fully covered by earlier hit areas", hiddenFrac: 1 };
        var owner = hitArea(areas, pt.x, pt.y);
        var took = handleSettingsClick(pt.x, pt.y);
        var raf = LAB.flushRaf();
        return { ok: took, took: took, raf: raf, hiddenFrac: total ? hidden / total : 0, pt: pt,
                 owner: owner < 0 ? "nothing" : (areas[owner].action + (areas[owner].key ? " " + areas[owner].key : "")) };
    }
    function applyChunkWindow(n) {
        openSettings();
        var s = clickSettings(function (a) { return a.action === "slider" && a.key === "chunkWindow"; },
            function (a) { return { x: a.trackX + a.trackW * (n - a.min) / (a.max - a.min), y: a.y + a.h / 2 }; });
        var staged = pendingSettings.chunkWindow;
        var r = clickSettings(function (a) { return a.action === "apply"; });
        return { ok: s.took && staged === n && r.took && !settingsOpen && r.raf >= 1 && WINDOW_CHUNKS === n, staged: staged, raf: r.raf,
                 why: !s.took ? "slider click not taken (" + s.owner + ")" : staged !== n ? "slider staged " + staged : !r.took ? "Apply click not taken" :
                      settingsOpen ? "panel still open" : r.raf < 1 ? "no rebuild scheduled" : WINDOW_CHUNKS !== n ? "WINDOW_CHUNKS=" + WINDOW_CHUNKS : "" };
    }
    LAB.scenario("persistence: settings", function () {
        var okSize = true, okPop = true, okCtr = true, okUncovered = true;
        var dSize = [], dPop = [], dCtr = [], dUncovered = [];
        SEEDS.forEach(function (seed, si) {
            freshWorld(seed);
            var sizeOk = WINDOW_CHUNKS === settings.chunkWindow;
            if (!sizeOk) okSize = false;
            dSize.push("s" + seed + ": WINDOW_CHUNKS=" + WINDOW_CHUNKS + ", settings.chunkWindow=" + settings.chunkWindow + ", preset '" + qualityPreset + "'" +
                because(sizeOk, "(WINDOW_CHUNKS starts at GAME_CONFIG.world.windowChunks = 7, 293/965; settings and every preset below 'high' say 5, 1180-1186)"));

            // A Settings Apply that really changes the window: grow to the
            // slider's maximum (9), then shrink back to the start size. First
            // kill one enemy on each side of the window border (a revived kill
            // shows up), then an excursion two chunks south-east and back so
            // cached chunks outside the window hold enemies (as after any walk).
            var W0 = WINDOW_CHUNKS;
            var picked = [], sides = { top: null, bottom: null, left: null, right: null };
            aliveWorldEnemies().forEach(function (a) {
                var c = chunkOfWorld(a.x, a.y);
                var s = c.cy === windowCY ? "top" : c.cy === windowCY + WINDOW_CHUNKS - 1 ? "bottom" :
                        c.cx === windowCX ? "left" : c.cx === windowCX + WINDOW_CHUNKS - 1 ? "right" : null;
                if (s && !sides[s]) { sides[s] = a; picked.push(a); }
            });
            picked.forEach(function (a) { a.e.health = 0; });
            if (picked.length) LAB.tick(1);
            var killed = picked.map(function (a) { return { x: a.x, y: a.y, t: a.t }; });
            var h0 = chunkCenter(0, 0), h2 = chunkCenter(2, 2);
            LAB.placeWorld(h2.x, h2.y, "top"); LAB.placeWorld(h0.x, h0.y, "top");
            var before = enemyCensus();
            var outside = before.filter(function (a) { return a.src !== "window"; }).length;
            var deadBefore = killed.every(function (k) { return !before.some(function (a) { return sameEnemy(a, k); }); });
            var g = applyChunkWindow(9);
            var mid = enemyCensus();
            var s2 = applyChunkWindow(W0);
            var after = enemyCensus();
            var lostGrow = missingFrom(before, mid), lostShrink = missingFrom(mid, after);
            var dupMid = dupPairs(mid), dupAfter = dupPairs(after);
            var revived = killed.filter(function (k) { return mid.some(function (a) { return sameEnemy(a, k); }) || after.some(function (a) { return sameEnemy(a, k); }); }).length;
            var pre = g.ok && s2.ok && killed.length > 0 && deadBefore && outside > 0;
            var popOk = !lostGrow && !lostShrink && !dupMid && !dupAfter && !revived;
            if (!pre || !popOk) okPop = false;
            dPop.push("s" + seed + ": " + (g.ok ? "Apply " + W0 + "->9 ran" : "PRECONDITION: Apply ->9 failed: " + g.why) + ", " +
                (s2.ok ? "Apply 9->" + W0 + " ran" : "PRECONDITION: Apply ->" + W0 + " failed: " + s2.why) +
                (killed.length ? "" : " PRECONDITION: no border enemy to kill") + (deadBefore ? "" : " PRECONDITION: border kills not processed") +
                (outside ? "" : " PRECONDITION: no enemy cached outside the window") +
                "; live enemies " + before.length + " -> " + mid.length + " -> " + after.length + " (" + outside + " cached outside the window)" +
                "; lost on grow " + lostGrow + ", lost on shrink " + lostShrink + "; duplicate pairs " + dupMid + "/" + dupAfter +
                "; border kills alive again " + revived + "/" + killed.length +
                because(popOk, "(applySettings 17756 sets WINDOW_CHUNKS before the rAF assembleWindow runs its save pass 6334, which clears and clamps against the NEW window)"));
            if (si === 0) {
                LAB.metric("persistence.apply.enemies_before", before.length);
                LAB.metric("persistence.apply.enemies_after_grow", mid.length);
                LAB.metric("persistence.apply.enemies_after_shrink", after.length);
            }

            // A click at the CENTRE of the Apply button (where a player aims)
            // applies the staged change: stage one (Show FPS), click Apply's centre.
            freshWorld(seed);
            openSettings();
            var fps0 = settings.showFPS, dn0 = settings.dayNight;
            var t1 = clickSettings(function (a) { return a.action === "toggle" && a.key === "showFPS"; });
            var staged = pendingSettings.showFPS !== fps0;
            var ap = clickSettings(function (a) { return a.action === "apply"; }, function (a) { return { x: a.x + a.w / 2, y: a.y + a.h / 2 }; });
            var stillOpen = settingsOpen;
            var ctrOk = ap.took && !stillOpen && settings.showFPS === !fps0 && settings.dayNight === dn0 && pendingSettings.dayNight === dn0;
            if (!(t1.took && staged) || !ctrOk) okCtr = false;
            dCtr.push("s" + seed + ": " + (t1.took && staged ? "Show FPS staged " + fps0 + "->" + !fps0 : "PRECONDITION: could not stage Show FPS") +
                "; click at Apply's centre (" + (ap.pt ? fx(ap.pt.x, 1) + "," + fx(ap.pt.y, 1) : "?") + ") went to the '" + (ap.owner || "?") + "' area" +
                "; panel still open=" + stillOpen + "; showFPS applied=" + (settings.showFPS === !fps0) + "; dayNight " + dn0 + "->" + settings.dayNight +
                " (staged " + pendingSettings.dayNight + ")" +
                because(ctrOk, "(the Day/Night toggle's hit area spans the panel width, 17949, and handleSettingsClick takes the first area containing the point, 18005)"));
            settingsOpen = false;
            // Every point in Apply must belong to Apply, not only its centre.
            // The 20x20 grid is exact enough for axis-aligned hit rectangles:
            // each sample is at a cell centre, and the current overlap spans
            // eleven complete rows (220/400 = 55%).
            openSettings();
            var areas = layoutSettings(), ai = -1, hidden = 0;
            for (var i = 0; i < areas.length; i++) if (areas[i].action === "apply") { ai = i; break; }
            if (ai >= 0) for (var yy = 0; yy < 20; yy++) for (var xx = 0; xx < 20; xx++)
                if (hitArea(areas, areas[ai].x + areas[ai].w * (xx + 0.5) / 20, areas[ai].y + areas[ai].h * (yy + 0.5) / 20) !== ai) hidden++;
            var overlapPre = areas.length >= 5 && ai >= 0;
            var overlapOk = overlapPre && hidden === 0;
            if (!overlapOk) okUncovered = false;
            dUncovered.push("s" + seed + ": " + areas.length + " Settings hit areas, Apply " + (ai >= 0 ? "found" : "MISSING") +
                "; hidden samples " + hidden + "/400, fraction " + fx(hidden / 400, 2) +
                (overlapPre ? "" : " PRECONDITION: layout did not produce Apply and at least 5 hit areas") +
                because(overlapOk, "(the earlier Day/Night area spans the panel width, 17949; first match wins, 18005)"));
            settingsOpen = false;
            if (si === 0) {
                LAB.metric("persistence.settings.apply_button_hidden_fraction", hidden / 400);
            }
        });
        LAB.check("persistence: the chunk window in use at start is the size the settings panel shows", okSize, dSize.join(" || "));
        LAB.check("persistence: a Settings Apply that changes the chunk window keeps every enemy exactly once (none lost, none duplicated, no kill revived)",
            okPop, dPop.join(" || "));
        LAB.check("persistence: a click at the centre of the Settings Apply button applies the staged settings", okCtr, dCtr.join(" || "));
        LAB.check("persistence: no other Settings hit area covers any part of the Apply button", okUncovered, dUncovered.join(" || "));
    });

    // ── S10: Endless has no exit goal ────────────────────────────────────────
    // spawnGoal seeds its placement RNG from Date.now() (4085) and misbehaves for
    // one sign of int32(Date.now() ^ 0xBEEF), so the clear is run at two clock
    // values 2^31 ms apart (opposite sign bit, by construction) -- the verdict
    // must not hinge on which half of a ~50-day cycle the clock sits in. The
    // values are ABSOLUTE (LAB.setClock), so tick counts of earlier scenarios
    // cannot move them. Real loop() frames (LAB.frame): an exception inside
    // gameUpdate is swallowed by _pt (20576) exactly as on the page, and counted.
    var GOAL_CLOCK_BASE = 1800000000000;
    LAB.scenario("persistence: endless goal", function () {
        var ok = true, det = [];
        SEEDS.forEach(function (seed, si) {
            [0, 1].forEach(function (p) {
                freshWorld(seed);
                LAB.setClock(GOAL_CLOCK_BASE + (2 * si + p) * 2147483648);
                var n = enemies.length;
                enemySpawners.forEach(function (sp) { sp.hp = 0; sp.active = false; });
                enemies.forEach(function (e) { e.health = 0; });
                var orig = spawnGoal, calledAt = [];
                spawnGoal = function () { calledAt.push(Math.floor(Date.now())); return orig.apply(this, arguments); };
                var errs = 0, e0 = LAB.errors.length;
                try { for (var f = 0; f < 6; f++) errs += LAB.frame(); } finally { spawnGoal = orig; }
                var stages = [];
                for (var k in _ptErrors) if (_ptErrors[k]) stages.push(k + " x" + _ptErrors[k]);
                var inGoal = LAB.errors.slice(e0).some(function (s) { return /spawnGoal/.test(s); });
                var sAlive = enemySpawners.filter(function (sp) { return sp.active; }).length;
                var pre = n > 0 && enemies.length === 0 && sAlive === 0;
                var good = !errs && goal === null && !goalSpawned;
                if (!pre || !good) ok = false;
                det.push("s" + seed + " clock " + (GOAL_CLOCK_BASE + (2 * si + p) * 2147483648) + ": cleared " + n + " enemies and " + enemySpawners.length + " spawners" +
                    (pre ? "" : " (PRECONDITION: window not cleared: enemies left " + enemies.length + ", spawners " + sAlive + ")") +
                    "; spawnGoal " + (calledAt.length ? "called at Date.now()=" + calledAt[0] : "not called") +
                    "; render errors in 6 frames " + errs + (stages.length ? " (" + stages.join(", ") + (inGoal ? ", thrown inside spawnGoal" : "") + ")" : "") +
                    "; goalSpawned=" + goalSpawned + (goal ? " goal at world(" + fx(goal.x + windowOriginX, 1) + "," + fx(goal.y + windowOriginY, 1) + ")" : " goal=null") +
                    because(good, "(updateEnemies 11495 calls spawnGoal regardless of mode; its LCG goes negative when int32(Date.now()^0xBEEF) < 0, 4085-4104)"));
            });
        });
        LAB.check("persistence: clearing every enemy in an Endless window neither spawns a fixed-level exit goal nor throws", ok, det.join(" || "));
    });

    // ── S11: IMU calibration inside a Cave Test world (D24) ──────────────────
    // btnStart with Cave Test selected and IMU hardware in use (21990-22009)
    // builds the Cave Test world and THEN calibrates. Calibration is driven
    // through the page's own pollIMU with a device that holds still; the fetch
    // is answered synchronously (hw.fetchJSON is otherwise a never-settling
    // stub). Completing it must not replace the world.
    //
    // The critic also proposed synthesizing calibration after normal Endless,
    // but that is not a page path: btnEndless sets calibrating=false and never
    // calls startCalibration (22163-22183). Its only call sites are startGame's
    // fixed-level and Cave Test hardware branches (22004/22036), so the Cave
    // Test branch below is the reachable Endless-mode calibration contract.
    LAB.scenario("persistence: calibration", function () {
        var ok = true, det = [];
        CT_SEEDS.forEach(function (seed) {
            freshCaveTest(seed, {});
            var before = { seed: WORLD_SEED, w: worldW, gw: gridW, nets: Object.keys(endlessCaveNetworks).length, p: LAB.worldPos(), mw: floorMesh.w };
            hasBaseline = false; calStableMs = 0; calibrating = true;           // what btnStart does (22005)
            var sv = { i2c: i2cEnabled, imu: imuCompiled, fetch: hw.fetchJSON };
            var reading = { valid: true, ori: { pitch: 1.5, roll: -0.5, yaw: null } };
            i2cEnabled = true; imuCompiled = true;
            hw.fetchJSON = function () {
                return { then: function (cb) { var err = null; try { cb(reading); } catch (e) { err = e; }
                    return { "catch": function (h) { if (err && h) h(err); } }; } };
            };
            var polls = 0;
            try { while (calibrating && polls < 100) { pollIMU(); LAB.advance(60); polls++; } }
            finally { i2cEnabled = sv.i2c; imuCompiled = sv.imu; hw.fetchJSON = sv.fetch; }
            var p = LAB.worldPos();
            var after = { seed: WORLD_SEED, w: worldW, gw: gridW, nets: Object.keys(endlessCaveNetworks).length, mw: floorMesh ? floorMesh.w : -1 };
            var moved = Math.hypot(p.x - before.p.x, p.y - before.p.y);
            var pre = !calibrating && polls > 0 && before.nets > 0;
            var kept = ENDLESS_MODE && CAVE_TEST_MODE && after.seed === before.seed && after.w === before.w && after.gw === before.gw &&
                after.nets === before.nets && after.mw === before.mw && moved < 1;
            if (!pre || !kept) ok = false;
            det.push("ct" + seed + ": " + (pre ? "calibration completed after " + polls + " polls" : "PRECONDITION: calibration did not complete (" + polls + " polls, calibrating=" + calibrating + ")") +
                "; world width " + before.w + " -> " + after.w + ", grid " + before.gw + " -> " + after.gw + ", cave networks " + before.nets + " -> " + after.nets +
                ", mesh width " + before.mw + " -> " + after.mw + ", player moved " + fx(moved, 1) + " u" +
                because(kept, "(onCalibUpdate 9854 calls resetLevel(1) whatever the mode, which builds fixed level 1)"));
        });
        LAB.check("persistence: completing IMU calibration after a Cave Test start keeps the Cave Test world (no switch to fixed level 1)", ok, det.join(" || "));
    });
}
LAB.finish();
undefined;
