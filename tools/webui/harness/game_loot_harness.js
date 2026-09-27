(0, eval)(slurp("tools/webui/harness/_game_env.js"));
LAB.init(__out, slurp, __engine, __argv);
// One line only: loadError carries a stack, and a newline inside a verdict
// detail makes game_lab fold the detail into the check id.
LAB.check("loot: game script evaluates without throwing", LAB.load(__argv[0]), (LAB.loadError || "").split("\n")[0]);

// game_loot_harness.js -- chest rewards and looting rules in the Endless crawler.
//
// usage (via tools/webui/game_lab.py): <extracted game js> [--seeds a,b] [--endless-seeds a,b]
//   --seeds          Cave Test worlds, caveChests on (default 12345,424242,777;
//                    777 is the default seed that reaches N8's reserve cause)
//   --endless-seeds  normal Endless worlds (default 424242)
//
// Everything measured goes through the game's own code, and every reward is
// judged on the WINDOW copy of a chest -- the object the player actually loots
// (assembleWindow 7035-7041, entrance-reserve filter 7174-7181) -- not on the
// chunk data generateChunk (4920) builds. A fix placed where the window is
// assembled, where the chunk is generated, or inside collectChest all show.
//   - what a chest pays: collectChest() (20175) run on a COPY of the window
//     chest with empty equipment and 0 coins, reading coins / equipment after.
//   - what the player is offered: gameUpdate() -> updateTreasureChests()
//     (19426) sets nearestOpenChest and ch.opened; looting is the real gamepad-A
//     path in handleInput() (19098-19099), the same `collectChest(nearestOpenChest)`
//     the keyboard E handler runs (22337). The keyboard handler itself is an
//     anonymous document listener (22309) that the env discards, so it is not
//     reachable headless.
//   - what a chest ADVERTISES: the floating text the chest pass
//     (drawTreasureChests3D, text at 9372-9444) draws during a REAL loop() frame
//     (LAB.frame), captured from the canvas fillText calls made while that pass
//     is on the stack. Nothing re-derives the text.
//   - reaching a chest: LAB.walkTo at 30 fps through the real loop, from outside
//     the network's entrance along its corridor centre-lines.
//
// Cave chests are the window chests that sit ON a terminal chamber's centre
// (within CAVE_MATCH_R = 0.5 u; generateChunk puts them exactly there, 5970).
// A surface chest can lie inside a chamber's radius (on the cap above it), so a
// radius match would count it -- and let one chamber's chest satisfy a
// neighbouring chamber that has none. If a fix moves cave chests off-centre,
// the terminal check names the off-centre chest instead of passing silently.
//
// Local helper kept because the env has no equivalent: pressA() drives one
// gamepad-A press and release through handleInput with USE_GAMEPAD on and
// USE_MOUSE off (the pad path is skipped while the mouse is active, 19088).

if (LAB.loaded) {
    var G = (0, eval)("this");
    var CAVE_SEEDS = LAB.seeds([12345, 424242, 777]);
    var ENDLESS_SEEDS = LAB.seeds([424242, 777000, 777, 1], "endless-seeds");
    var CAVE_MATCH_R = 0.5;           // a cave chest sits ON its chamber centre
    var CAVE_NET_R = 12;              // Endless: networks within 12 regions of spawn
    var SURFACE_TILES = [-5, 0, 5];   // Endless: surface sample = chunks -7..7 (3x3 windows) + cave tiles
    var ENDLESS_FLOOR_MAX = 8;        // Endless: cave chests of the nearest network used by the floor/cap passes
    var TRIP_CHUNKS = 4;              // re-centre trip: > WINDOW_CHUNKS/2 (any hysteresis must re-centre), < WINDOW_CHUNKS+2 (no eviction)
    var WALK_FPS = 30;
    var PAIRS_MIN = 20, RATIO_MIN = 1.2, DIFF_TOL = 0.1, CAP_MIN = 5;

    var r1 = function (v) { return LAB.fx(v, 1); };
    var r2 = function (v) { return LAB.fx(v, 2); };

    // ── accumulators (aggregated across worlds; verdicts emitted at the end) ──
    var A = {
        worlds: [],            // {world, terminals}
        cave: [],              // judged cave chests: {world, net, tier, quality, loot, wx, wy, diff}
        surf: [],              // judged surface chests (Endless)
        terms: [],             // {world, wx, wy, ok, why}
        floor: [], cap: [], persist: [], walk: [], tierControls: [],
        prompt: null, reserve: null,
        notIsolated: 0
    };

    // startEndless reseeds Math.random, startCaveTest does not: reseed here so
    // a Cave Test world measures the same whatever ran before it.
    function start(kind, seed) {
        LAB.freshPage();
        if (kind === "cave") { LAB.startCaveTest(seed, { caveChests: true }); LAB.seedRandom(seed); }
        else LAB.startEndless(seed);
        LAB.freezeDay(0.5);
        LAB.releasePad();
    }
    // One gamepad-A press through handleInput (19088-19116), then a release
    // tick so lastShopGpA is re-armed. USE_MOUSE must be off for the pad path.
    function pressA() {
        var sv = { g: USE_GAMEPAD, m: USE_MOUSE };
        USE_GAMEPAD = true; USE_MOUSE = false;
        lastShopGpA = false;
        gpLast = { x: 0, y: 0, buttons: ~BTN_A, valid: true };
        LAB.tick(1);
        gpLast = { x: 0, y: 0, buttons: -1, valid: true };
        LAB.tick(1);
        LAB.releasePad();
        USE_GAMEPAD = sv.g; USE_MOUSE = sv.m;
    }
    // The window copy of the chest at a WORLD point (window arrays are rebuilt
    // on every re-centre, so never hold a chest object across one).
    function winChestAt(wx, wy) {
        for (var i = 0; i < treasureChests.length; i++) {
            var tc = treasureChests[i];
            if (Math.abs(tc.x + windowOriginX - wx) < 0.01 && Math.abs(tc.y + windowOriginY - wy) < 0.01) return tc;
        }
        return null;
    }
    function chunkOf(wx, wy) { return { cx: Math.floor(wx / CHUNK_SIZE), cy: Math.floor(wy / CHUNK_SIZE) }; }
    function chunkKey(wx, wy) { var k = chunkOf(wx, wy); return k.cx + "," + k.cy; }
    // A chunk is "usable" when it is at least one chunk inside the window edge:
    // an entrance whose 44 u reserve reaches a chest there is registered by an
    // in-window chunk (7146-7163), so the window's filter decision is the one a
    // player standing at the chest gets.
    function usable(wx, wy) {
        var k = chunkOf(wx, wy);
        return k.cx >= windowCX + 1 && k.cx <= windowCX + WINDOW_CHUNKS - 2 && k.cy >= windowCY + 1 && k.cy <= windowCY + WINDOW_CHUNKS - 2;
    }
    function emptySlots() { equipment = { armor: null, hat: null, robes: null, boots: null, relic: null }; }
    function slotIds() {
        return ["armor", "hat", "robes", "boots", "relic"].map(function (s) {
            return equipment[s] ? equipment[s].id + (equipment[s].quality ? "@" + r2(equipment[s].quality) : "") : "-"; }).join(",");
    }
    function wearsNamed(name) {
        return ["armor", "hat", "robes", "boots", "relic"].some(function (s) {
            return !!equipment[s] && (equipment[s].displayName || equipment[s].name) === name; });
    }
    // What collectChest pays for this chest, run on a copy with empty slots.
    // This is a reward test, so establish a genuinely reachable position on
    // the chest's support without ticking/recentring the sampled window. The
    // interaction scenarios below separately test blocked and reachable paths.
    function lootOf(ch) {
        var sv = { eq: equipment, coins: coins, ph: phoenixFeatherUsed,
            pos: pos, underground: playerUnderground, chests: treasureChests };
        var copy = {};
        for (var k in ch) copy[k] = ch[k];
        emptySlots();
        coins = 0;
        var out = { gold: 0, relic: null, equip: null, collected: false };
        try {
            var supportZ = getEntityRenderFloorZ(copy);
            if (!Number.isFinite(supportZ)) throw new Error("PRECONDITION: reward chest has no support at " +
                r1(copy.x + windowOriginX) + "," + r1(copy.y + windowOriginY));
            pos = { x: copy.x, y: copy.y, floorZ: meshHeightToPlayerZ(supportZ / 25) };
            playerUnderground = getCaveSpaceAt(pos.x, pos.y, supportZ / 25).underground;
            if (!canReachChest(copy)) throw new Error("PRECONDITION: reward chest is unreachable at its support " +
                r1(copy.x + windowOriginX) + "," + r1(copy.y + windowOriginY) + " z=" + r2(supportZ));
            treasureChests = [copy];
            collectChest(copy);
            out.gold = coins;
            out.relic = equipment.relic ? equipment.relic.id : null;
            ["armor", "hat", "robes", "boots"].forEach(function (s) {
                if (equipment[s]) out.equip = { id: equipment[s].id, slot: s, quality: equipment[s].quality };
            });
            out.collected = !!copy.collected;
        } finally {
            equipment = sv.eq; coins = sv.coins; phoenixFeatherUsed = sv.ph;
            pos = sv.pos; playerUnderground = sv.underground;
            treasureChests = sv.chests;
        }
        return out;
    }
    function kindOf(loot) { return loot.relic ? "relic" : loot.equip ? "equip" : loot.gold > 0 ? "gold" : "nothing"; }

    // The floating text the chest pass draws, from a REAL loop() frame. The
    // player faces the chest; `frames` real frames run (the lid must be past
    // 0.3 open for the text, 9374) and the last one is recorded. Only fillText
    // calls made while drawTreasureChests3D is on the stack are kept: draw()
    // calls the pass by bare name (18975), so wrapping the global sees it.
    function chestPrompt(ch, frames) {
        cam.ang = Math.atan2(ch.y - pos.y, ch.x - pos.x);
        // Aim at the chest, not horizontally over a nearby floor object. The
        // scene-depth billboard now correctly clips prompts outside the view.
        cam.pitch = Math.min(1, (60 + 25 * LAB.h() - getEntityRenderFloorZ(ch) - 20) /
            Math.max(1, Math.hypot(ch.x - pos.x, ch.y - pos.y)));
        lastUpdate = LAB.clock;             // the next frame runs one physics step, not a catch-up burst
        var orig = G.drawTreasureChests3D, spans = [], errs = 0, rec = null, c0 = 0;
        G.drawTreasureChests3D = function () {
            var s = LAB.ctxCounters.fillText;
            try { return orig.apply(this, arguments); }
            finally { spans.push([s, LAB.ctxCounters.fillText]); }
        };
        try {
            for (var i = 0; i < (frames || 4) - 1; i++) errs += LAB.frame();
            spans = [];
            c0 = LAB.ctxCounters.fillText;
            rec = LAB.record(function () { errs += LAB.frame(); }, { texts: true });
        } finally { G.drawTreasureChests3D = orig; }
        var lines = [];
        spans.forEach(function (sp) { rec.texts.slice(sp[0] - c0, sp[1] - c0).forEach(function (t) { lines.push(t.text); }); });
        var p = { lines: lines, errs: errs, action: null, gold: null, name: lines.length ? lines[0] : null };
        lines.forEach(function (s) {
            var m = /^\+(\d+) Gold$/.exec(s);
            if (m) p.gold = +m[1];
            if (s === "[E] Take") p.action = "take";
            else if (s === "[E] Swap") p.action = "swap";
        });
        return p;
    }
    function fmtPrompt(p) { return p && p.lines.length ? "'" + p.lines.join(" / ") + "'" : "no prompt drawn"; }

    // Terminal chambers of the given networks, WORLD coords.
    function terminalsOf(nets) {
        var out = [];
        nets.forEach(function (n) {
            n.net.chambers.forEach(function (c, i) { if (c.terminal) out.push({ net: n.key, wx: c.cx, wy: c.cy, r: c.radius,
                spawnId: n.key + ':chamber:' + i + ':chest' }); });
        });
        return out;
    }
    function netsOfWorld() {
        var out = [];
        Object.keys(endlessCaveNetworks).sort().forEach(function (key) { if (endlessCaveNetworks[key]) out.push({ key: key, net: endlessCaveNetworks[key] }); });
        return out;
    }
    function terminalAt(wx, wy, terms, spawnId) {
        for (var i = 0; i < terms.length; i++) if (terms[i].spawnId === spawnId &&
            Math.hypot(terms[i].wx - wx, terms[i].wy - wy) <= terms[i].r) return terms[i];
        return null;
    }
    // Same chunk, same random reward draw, only the first cave chest's tier
    // roll differs. Independent random worlds made tier-blind gold appear to
    // scale by chance. This paired intervention must expose that defect.
    function tierControl(cx, cy) {
        var originalChunks = chunks, originalRng = chunkRng, key = cx + ',' + cy;
        function roll(tierRoll) {
            chunks = Object.assign({}, originalChunks); delete chunks[key];
            chunkRng = function (x, y, stream) {
                var rng = originalRng(x, y, stream), first = true;
                return function () {
                    var v = rng();
                    if (x === cx && y === cy && stream === 103 && first) { first = false; return tierRoll; }
                    return v;
                };
            };
            var chest = generateChunk(cx, cy).treasureChests.filter(function (c) { return !!c.caveSpawnId; })[0];
            // Generated chunk records are world-space, unlike the window
            // copies passed by harvest. Reachability always takes local XY.
            return chest ? Object.assign({}, chest, {x: chest.x-windowOriginX,
                y: chest.y-windowOriginY}) : null;
        }
        try {
            var low = roll(0), high = roll(0.8);
            var pre = low && high && low.caveSpawnId === high.caveSpawnId && low.tier === 'common' && high.tier === 'epic';
            A.tierControls.push({pre: !!pre, low: pre ? lootOf(low).gold : 0, high: pre ? lootOf(high).gold : 0});
        } finally { chunks = originalChunks; chunkRng = originalRng; }
    }
    function chunkChestsNear(wx, wy, rad) {
        var c0 = chunkOf(wx, wy), found = [];
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
            var ch = generateChunk(c0.cx + dx, c0.cy + dy);
            ch.treasureChests.forEach(function (tc) { if (Math.hypot(tc.x - wx, tc.y - wy) <= rad) found.push(tc); });
        }
        return found;
    }
    // A chest can only be singled out when no other chest is within reach of
    // the spot the player tests it from (pickup radius 90 + 30 u offset).
    // (p comes from a window copy: local + origin is not bit-identical to the
    // chunk's world x, hence the 0.01 u tolerance.)
    function isolated(p) {
        return chunkChestsNear(p.wx, p.wy, 120).filter(function (tc) { return Math.hypot(tc.x - p.wx, tc.y - p.wy) > 0.01; }).length === 0;
    }
    function closePairs(pts) {
        var close = 0;
        for (var i = 0; i < pts.length; i++) for (var j = i + 1; j < pts.length; j++)
            if (Math.hypot(pts[i].wx - pts[j].wx, pts[i].wy - pts[j].wy) < 90) close++;
        return close;
    }

    // Harvest the current window. A cave chest must own its chamber identity
    // and lie inside that chamber; inset placements near chunk edges need not
    // equal the exact centre. Each chamber must still have exactly one chest.
    function harvest(world, terms, seen) {
        treasureChests.forEach(function (tc) {
            var wx = tc.x + windowOriginX, wy = tc.y + windowOriginY;
            if (!usable(wx, wy)) return;
            // the chunk slot the window copy came from (7041): exact, unlike a rounded position
            var key = tc._chunkKey + "#" + tc._chunkIdx;
            if (seen[key]) return;
            seen[key] = true;
            var t = terminalAt(wx, wy, terms, tc.caveSpawnId), k = chunkOf(wx, wy);
            if (t && !seen['tier:' + tc._chunkKey]) {
                seen['tier:' + tc._chunkKey] = true; tierControl(k.cx, k.cy);
            }
            var cgx = Math.floor((wx - k.cx * CHUNK_SIZE) / cell), cgy = Math.floor((wy - k.cy * CHUNK_SIZE) / cell);
            // Interaction scenarios keep a stable population under the N8
            // FIX probe. That mutation restores chests which never existed in
            // the baseline window: outer-ring chests, plus a terminal chamber
            // overlapping the entrance reserve. Rewards still judge all of
            // them, but floor/cap/walk checks use interior, non-reserve cave
            // chests so a FIX does not silently change their precondition.
            var interaction = !!t && cgx >= 1 && cgx < CHUNK_CELLS - 1 && cgy >= 1 && cgy < CHUNK_CELLS - 1 &&
                !inEntranceReserve(tc.x, tc.y);
            var rec = { world: world, net: t ? t.net : null, chamberX: t ? t.wx : null, chamberY: t ? t.wy : null,
                        tier: tc.tier, quality: tc.quality, loot: lootOf(tc), wx: wx, wy: wy,
                        interaction: interaction,
                        // the difficulty generateChunk used for this chest's chunk (4925)
                        diff: getDifficultyAt(k.cx * CHUNK_SIZE + CHUNK_SIZE / 2, k.cy * CHUNK_SIZE + CHUNK_SIZE / 2) };
            (t ? A.cave : A.surf).push(rec);
        });
        terms.forEach(function (t) {
            if (t.judged || !usable(t.wx, t.wy)) return;
            t.judged = true;
            var ch = null, near = null, matches = 0;
            treasureChests.forEach(function (tc) {
                var d = Math.hypot(tc.x + windowOriginX - t.wx, tc.y + windowOriginY - t.wy);
                if (tc.caveSpawnId === t.spawnId && d <= t.r) { ch = tc; matches++; }
                else if (d <= t.r && (!near || d < near.d)) near = { d: d };
            });
            var rec = { world: world, net: t.net, wx: t.wx, wy: t.wy, ok: !!ch && matches === 1,
                why: matches > 1 ? 'duplicate chamber identity' : '', cause: matches > 1 ? 'other' : null };
            if (!ch) {
                var k = chunkOf(t.wx, t.wy), gen = generateChunk(k.cx, k.cy).treasureChests.filter(function (c) {
                    return Math.hypot(c.x - t.wx, c.y - t.wy) <= CAVE_MATCH_R; });
                var gx = Math.floor((t.wx - k.cx * CHUNK_SIZE) / cell), gy = Math.floor((t.wy - k.cy * CHUNK_SIZE) / cell);
                var edge = gx < 1 || gx >= CHUNK_CELLS - 1 || gy < 1 || gy >= CHUNK_CELLS - 1;
                var inRes = gen.length && inEntranceReserve(t.wx - windowOriginX, t.wy - windowOriginY);
                rec.cause = gen.length ? (inRes ? "reserve" : "other") : (edge ? "edge" : "other");
                rec.why = gen.length
                    ? "chest generated in chunk " + k.cx + "," + k.cy + " but absent from the window" +
                      (inRes ? " (inside an entrance reserve, filter L7180)" : " (not in a reserve)")
                    : "no chest generated: chamber centre in " + (edge ? "EDGE" : "interior") + " cell " + gx + "," + gy + " of chunk " + k.cx + "," + k.cy +
                      (edge ? " (chunk-cell guard L5966)" : "");
                if (near) rec.why += "; a window chest lies " + r1(near.d) + " u from the centre (off-centre: a surface chest on the cap, or a moved cave chest?)";
            }
            A.terms.push(rec);
        });
    }
    // Visit windows until every terminal chamber has been judged: greedy
    // centres chosen so each covers the most pending chambers (usable = +-2).
    function harvestAll(world, terms, seen) {
        harvest(world, terms, seen);
        var guard = 0;
        for (;;) {
            var pending = terms.filter(function (t) { return !t.judged; });
            if (!pending.length || guard++ > 200) break;
            var p0 = chunkOf(pending[0].wx, pending[0].wy), best = null;
            for (var ox = -2; ox <= 2; ox++) for (var oy = -2; oy <= 2; oy++) {
                var ccx = p0.cx + ox, ccy = p0.cy + oy, n = 0;
                pending.forEach(function (t) { var q = chunkOf(t.wx, t.wy); if (Math.abs(q.cx - ccx) <= 2 && Math.abs(q.cy - ccy) <= 2) n++; });
                if (!best || n > best.n) best = { cx: ccx, cy: ccy, n: n };
            }
            LAB.placeWorld(best.cx * CHUNK_SIZE + CHUNK_SIZE / 2, best.cy * CHUNK_SIZE + CHUNK_SIZE / 2, "top");
            harvest(world, terms, seen);
        }
    }

    // Floor pass: stand beside each chest on the cave floor, read the prompt
    // from a real frame, loot it with A, press A again.
    function floorPass(world, pts) {
        pts.forEach(function (p) {
            LAB.placeWorld(p.wx + 30, p.wy, "bottom");
            LAB.tick(3);
            var ch = winChestAt(p.wx, p.wy);
            // the chest cell's cave floor, not the player's own cell
            var cl = LAB.layersAt(p.wx - windowOriginX, p.wy - windowOriginY), fl = LAB.lowestWalkable(cl);
            var rec = { world: world, wx: p.wx, wy: p.wy, inWindow: !!ch, h: LAB.h(), floorZ: fl ? fl.z : null, ug: !!playerUnderground };
            rec.onFloor = !!fl && Math.abs(LAB.h() - fl.z) < 0.5 && !!playerUnderground;
            rec.offered = !!ch && nearestOpenChest === ch && !!ch.opened;
            emptySlots();                   // a fresh character: an item chest is a take, not a swap
            rec.prompt = ch ? chestPrompt(ch, 4) : null;
            var c0 = coins, s0 = slotIds();
            pressA();
            ch = winChestAt(p.wx, p.wy);
            rec.paid = coins - c0;
            rec.slots = s0 === slotIds() ? "unchanged" : s0 + "->" + slotIds();
            var pr = rec.prompt;
            rec.got = !!pr && (pr.gold !== null ? (pr.gold > 0 && rec.paid === pr.gold)
                                                : (!!pr.name && rec.paid === 0 && wearsNamed(pr.name)));
            rec.collected = !!ch && !!ch.collected;
            var c1 = coins, s1 = slotIds();
            pressA();
            rec.secondNone = coins === c1 && slotIds() === s1;
            rec.second = rec.secondNone ? "nothing" : "coins +" + (coins - c1) + " slots " + s1 + "->" + slotIds();
            A.floor.push(rec);
        });
    }
    // Cap pass (fresh world): stand on the surface cap directly over each chest.
    function capPass(world, pts) {
        pts.forEach(function (p) {
            LAB.placeWorld(p.wx, p.wy, "top");
            LAB.tick(3);
            var ls = LAB.layersAt(pos.x, pos.y), cap = LAB.capOf(ls), fl = LAB.lowestWalkable(ls);
            var ch = winChestAt(p.wx, p.wy);
            var rec = { world: world, wx: p.wx, wy: p.wy, inWindow: !!ch, h: LAB.h(),
                        capZ: cap ? cap.z : null, floorZ: fl ? fl.z : null, layers: LAB.fmtLayers(ls) };
            rec.onCap = !!cap && Math.abs(LAB.h() - cap.z) < 0.5 && !!fl && (LAB.h() - fl.z) >= 3;
            rec.offered = !!ch && (nearestOpenChest === ch || !!ch.opened);
            // informational: is the prompt drawn for the player on the cap?
            rec.drawn = ch ? chestPrompt(ch, 2).lines.length > 0 : false;
            emptySlots();
            var s0 = slotIds();
            pressA();
            ch = winChestAt(p.wx, p.wy);
            rec.looted = (!!ch && !!ch.collected) || slotIds() !== s0;
            A.cap.push(rec);
        });
    }
    // Looted chest survives a window re-centre: a TRIP_CHUNKS trip east and
    // back, counted by the game's own assembleWindow calls.
    function persistTrip(world, p) {
        var rec = { world: world, wx: p.wx, wy: p.wy };
        LAB.placeWorld(p.wx + 30, p.wy, "bottom"); LAB.tick(3);
        var before = winChestAt(p.wx, p.wy);
        rec.collectedBefore = !!before && !!before.collected;
        var key = chunkKey(p.wx, p.wy);
        var cc = LAB.countCalls("assembleWindow");
        try {
            LAB.placeWorld(p.wx + CHUNK_SIZE * TRIP_CHUNKS, p.wy, "top"); LAB.tick(1);
            rec.leftWindow = !winChestAt(p.wx, p.wy);
            LAB.placeWorld(p.wx + 30, p.wy, "bottom"); LAB.tick(3);
        } finally { cc.restore(); }
        rec.recentres = cc.calls;
        rec.inMemory = !!chunks[key];
        var after = winChestAt(p.wx, p.wy);
        rec.rebuilt = !!after && after !== before;
        rec.after = after ? "collected=" + !!after.collected + " offered=" + (nearestOpenChest === after) : "chest not in window";
        rec.ok = !!after && !!after.collected && nearestOpenChest !== after;
        rec.pre = rec.collectedBefore && rec.recentres >= 2 && rec.leftWindow && rec.rebuilt && rec.inMemory;
        A.persist.push(rec);
    }

    // Corridor centre-line graph of one network: segment endpoints are shared
    // exactly (4531-4532), a branch starts at a parent's endpoint (4553), and a
    // chamber centre is its segment's end (4541).
    function corridorGraph(net) {
        var nodes = [], edges = [];
        function node(x, y) {
            for (var i = 0; i < nodes.length; i++) if (Math.abs(nodes[i].x - x) < 0.01 && Math.abs(nodes[i].y - y) < 0.01) return i;
            nodes.push({ x: x, y: y }); edges.push([]); return nodes.length - 1;
        }
        net.corridors.forEach(function (c) { var a = node(c.x1, c.y1), b = node(c.x2, c.y2); edges[a].push(b); edges[b].push(a); });
        return { nodes: nodes, edges: edges, find: function (x, y) {
            for (var i = 0; i < nodes.length; i++) if (Math.abs(nodes[i].x - x) < 0.01 && Math.abs(nodes[i].y - y) < 0.01) return i;
            return -1; } };
    }
    function shortestPath(g, from, to) {
        var dist = g.nodes.map(function () { return Infinity; }), prev = {}, done = {};
        dist[from] = 0;
        for (;;) {
            var u = -1;
            for (var i = 0; i < dist.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
            if (u < 0 || u === to) break;
            done[u] = true;
            g.edges[u].forEach(function (v) {
                var d = dist[u] + Math.hypot(g.nodes[u].x - g.nodes[v].x, g.nodes[u].y - g.nodes[v].y);
                if (d < dist[v]) { dist[v] = d; prev[v] = u; }
            });
        }
        if (dist[to] === Infinity) return null;
        var out = [to];
        while (out[0] !== from) out.unshift(prev[out[0]]);
        return { nodes: out, len: dist[to] };
    }
    // Walk in from 150 u outside an entrance to the nearest terminal chamber
    // that holds a window chest, at WALK_FPS through the real loop.
    function walkIn(world, netKey, chestPts) {
        var rk = netKey.split(",");
        var net = generateCaveNetwork(+rk[0], +rk[1]);     // memoised (4441): the world's own network
        var rec = { world: world, pre: false, ok: false, detail: "" };
        if (!net) { rec.detail = "PRECONDITION: " + world + ": network " + netKey + " not generated"; A.walk.push(rec); return; }
        var g = corridorGraph(net), best = null;
        var ents = LAB.entrances().filter(function (E) { return E.key === netKey; });
        ents.forEach(function (E) {
            var e0 = g.find(E.x, E.y);
            if (e0 < 0) return;
            chestPts.forEach(function (p) {
                var tn = g.find(p.chamberX, p.chamberY);
                if (tn < 0) return;
                var sp = shortestPath(g, e0, tn);
                if (sp && (!best || sp.len < best.sp.len)) best = { E: E, p: p, sp: sp };
            });
        });
        if (!best) { rec.detail = "PRECONDITION: " + world + ": no corridor path from an entrance to a chamber holding a window chest"; A.walk.push(rec); return; }
        rec.pre = true;
        var E = best.E, p = best.p, st = LAB.axisWorld(E, 150, 0);
        LAB.placeWorld(st.x, st.y, "top");
        LAB.tick(2);
        lastUpdate = LAB.clock;
        var mark = LAB.renderErrorMark(), frames = 0, stuckAt = null, air = 0, minH = 1e9;
        var pts = best.sp.nodes.map(function (i) { return { x: g.nodes[i].x, y: g.nodes[i].y }; });
        for (var k = 0; k < pts.length; k++) {
            // the last node is the chest itself: stop short, as a player reading its prompt would
            var last = k === pts.length - 1, arrive = last ? 70 : 12;
            var tr = LAB.walkTo(pts[k].x, pts[k].y, { fps: WALK_FPS, maxTicks: 300, arrive: arrive,
                onTick: function (s) { if (s.air) air++; if (s.h < minH) minH = s.h; } });
            frames += tr.length;
            var w = LAB.worldPos(), d = Math.hypot(w.x - pts[k].x, w.y - pts[k].y);
            if (d > arrive + 8) { stuckAt = { k: k, d: d, w: w }; break; }
        }
        // come to rest: releasing W leaves momentum that carries the player on
        for (var sf = 0; sf < 90 && Math.hypot(vel.x, vel.y) > 0.5; sf++) LAB.frameAt(1000 / WALK_FPS);
        var ch = winChestAt(p.wx, p.wy);
        var pr = ch ? chestPrompt(ch, 4) : null;
        var errs = LAB.renderErrorsSince(mark);
        var cl = LAB.layersAt(p.wx - windowOriginX, p.wy - windowOriginY), fl = LAB.lowestWalkable(cl);
        var w2 = LAB.worldPos();
        rec.reached = !stuckAt;
        rec.onFloor = !!fl && Math.abs(LAB.h() - fl.z) < 0.5 && !!playerUnderground;
        rec.offered = !!ch && nearestOpenChest === ch;
        rec.drawn = !!pr && !!pr.action;
        rec.errs = errs;
        rec.ok = rec.reached && rec.onFloor && rec.offered && rec.drawn && errs === 0;
        rec.detail = world + ": entrance (" + r1(E.x) + "," + r1(E.y) + ") -> chest (" + r1(p.wx) + "," + r1(p.wy) + ") " +
            best.sp.nodes.length + " corridor nodes, " + r1(best.sp.len) + " u, " + frames + " frames at " + WALK_FPS + " fps" +
            (stuckAt ? "; STUCK " + r1(stuckAt.d) + " u short of node " + stuckAt.k + " at (" + r1(stuckAt.w.x) + "," + r1(stuckAt.w.y) + ")" : "") +
            "; end at (" + r1(w2.x) + "," + r1(w2.y) + ") h=" + r2(LAB.h()) + " chest-cell floor " + (fl ? r2(fl.z) : "none") +
            " underground=" + !!playerUnderground + " airborne frames " + air + " min h " + r2(minH) +
            "; offered=" + rec.offered + " prompt " + fmtPrompt(pr) + "; render errors " + errs;
        A.walk.push(rec);
    }

    // ── Cave Test worlds ─────────────────────────────────────────────────────
    CAVE_SEEDS.forEach(function (seed) {
        var world = "cavetest" + seed;
        LAB.scenario("loot: " + world, function () {
            var t0 = LAB.realNow();
            start("cave", seed);
            var terms = terminalsOf(netsOfWorld());
            A.worlds.push({ world: world, terminals: terms.length });
            var seen = {};
            var cave0 = A.cave.length;
            harvestAll(world, terms, seen);
            var caveHere = A.cave.slice(cave0);
            var pts = caveHere.filter(function (c) { return c.interaction; }).map(function (c) {
                return { wx: c.wx, wy: c.wy, chamberX: c.chamberX, chamberY: c.chamberY }; });
            LAB.metric("loot." + world + ".interaction_chests_excluded", caveHere.length - pts.length);
            LAB.metric("loot." + world + ".cave_chest_pairs_within_90", closePairs(pts));
            var all = pts.length;
            pts = pts.filter(isolated);
            A.notIsolated += all - pts.length;

            // pass 1: floor (collects everything), then the re-centre trip on
            // the first chest the floor pass looted
            start("cave", seed);
            floorPass(world, pts);
            var looted = A.floor.filter(function (f) { return f.world === world && f.collected; });
            if (looted.length) persistTrip(world, looted[0]);
            // pass 2: cap, fresh world
            start("cave", seed);
            capPass(world, pts);
            // pass 3: walk in on foot, fresh world
            start("cave", seed);
            // Missing generated loot belongs to the terminal-chest check.
            // Only walk a world that has a target; the aggregate walk gate
            // still requires multiple completed, non-vacuous routes.
            if (pts.length) walkIn(world, "0,0", pts);
            LAB.metric("loot." + world + ".scenario_ms", LAB.realNow() - t0);
        });
    });

    // ── normal Endless ───────────────────────────────────────────────────────
    ENDLESS_SEEDS.forEach(function (seed) {
        var world = "endless" + seed;
        LAB.scenario("loot: " + world, function () {
            var t0 = LAB.realNow();
            start("endless", seed);
            var found = LAB.findCaveNetworks(CAVE_NET_R);
            var nets = found.map(function (n) { return { key: n.rx + "," + n.ry, net: n.net }; });
            var terms = terminalsOf(nets);
            A.worlds.push({ world: world, terminals: terms.length });
            var seen = {}, cave0 = A.cave.length, surf0 = A.surf.length;
            harvestAll(world, terms, seen);
            SURFACE_TILES.forEach(function (ty) { SURFACE_TILES.forEach(function (tx) {
                LAB.placeWorld(tx * CHUNK_SIZE + CHUNK_SIZE / 2, ty * CHUNK_SIZE + CHUNK_SIZE / 2, "top");
                harvest(world, terms, seen);
            }); });
            var cavePts = A.cave.slice(cave0);
            LAB.metric("loot." + world + ".cave_chest_pairs_within_90", closePairs(cavePts));
            LAB.note(world + ": " + nets.length + " cave networks within " + CAVE_NET_R + " regions, " + terms.length + " terminal chambers, " +
                cavePts.length + " cave chests and " + (A.surf.length - surf0) + " surface chests judged on window copies");

            // floor/cap/walk on the nearest network's isolated cave chests
            var pts = [];
            if (nets.length) {
                cavePts.forEach(function (c) {
                    if (c.net !== nets[0].key || !c.interaction || pts.length >= ENDLESS_FLOOR_MAX) return;
                    if (isolated(c)) pts.push({ wx: c.wx, wy: c.wy }); else A.notIsolated++;
                });
            }
            start("endless", seed);
            floorPass(world, pts);
            start("endless", seed);
            capPass(world, pts);
            // No walk-in here: Endless caves hold enemies whose knockback shoves a
            // scripted walker off the corridor line (Endless 424242: pushed 185 u
            // off course with 2-9 enemies within 40 u), which measures combat, not
            // whether the cave can be walked. Cave Test worlds (no enemies) walk.
            LAB.metric("loot." + world + ".scenario_ms", LAB.realNow() - t0);
        });
    });

    // ── prompt vs action: does "[E] Take" / "[E] Swap" say what A does? ─────
    LAB.scenario("loot: prompt", function () {
        var seed = ENDLESS_SEEDS[0], world = "endless" + seed;
        start("endless", seed);
        var home = LAB.worldPos();
        var eqs = treasureChests.filter(function (tc) { return tc.equipId && !tc.collected && EQUIPMENT_DEFS[tc.equipId]; })
            .map(function (tc) { return { wx: tc.x + windowOriginX, wy: tc.y + windowOriginY, id: tc.equipId, q: tc.quality }; })
            .sort(function (a, b) { return Math.hypot(a.wx - home.x, a.wy - home.y) - Math.hypot(b.wx - home.x, b.wy - home.y); });
        var R = A.prompt = { world: world, cases: [], pre: false, detail: "" };
        if (!eqs.length) { R.detail = "PRECONDITION: no equipment chest in the " + world + " start window"; return; }
        var E = eqs[0], slot = EQUIPMENT_DEFS[E.id].slot;
        var other = Object.keys(EQUIPMENT_DEFS).filter(function (k) { return EQUIPMENT_DEFS[k].slot === slot && k !== E.id; })[0];
        var WORN_Q = 1.27;
        R.chest = E.id + " q" + r2(E.q) + " at (" + r1(E.wx) + "," + r1(E.wy) + ")";
        [{ name: "empty " + slot + " slot", wear: null }, { name: "wearing " + other + " q" + WORN_Q, wear: other },
         { name: "wearing the same " + E.id + " at q" + WORN_Q, wear: E.id }].forEach(function (cs, i) {
            start("endless", seed);
            emptySlots();
            if (cs.wear) equipment[slot] = createEquipInstance(cs.wear, WORN_Q);
            var worn0 = equipment[slot];
            LAB.placeWorld(E.wx + 30, E.wy, "top");
            LAB.tick(3);
            var ch = winChestAt(E.wx, E.wy);
            var pr = ch ? chestPrompt(ch, 4) : null;
            var offered = !!ch && nearestOpenChest === ch;
            pressA();
            ch = winChestAt(E.wx, E.wy);
            var outcome = !ch ? "chest gone" : ch.collected ? "take"
                : (worn0 && ch.equipId === worn0.id && Math.abs(ch.quality - worn0.quality) < 1e-9) ? "swap" : "nothing";
            var wornNow = equipment[slot];
            R.cases.push({ name: cs.name, offered: offered, prompt: pr, outcome: outcome,
                ok: !!pr && pr.action === outcome, errs: pr ? pr.errs : 0,
                text: cs.name + ": prompt " + fmtPrompt(pr) + " -> A " + outcome.toUpperCase() +
                    " (now wearing " + (wornNow ? wornNow.id + " q" + r2(wornNow.quality) : "nothing") +
                    ", chest " + (ch ? (ch.collected ? "collected" : "holds " + ch.equipId + " q" + r2(ch.quality)) : "gone") + ")" });
        });
        R.pre = R.cases.length === 3 && R.cases.every(function (c) { return c.offered && c.prompt && !!c.prompt.action && c.errs === 0; });
    });

    // ── entrance reserve filter (regression guard) ───────────────────────────
    LAB.scenario("loot: entrance reserve", function () {
        start("cave", CAVE_SEEDS[0]);
        var span = WINDOW_CHUNKS * CHUNK_SIZE;
        var ents = LAB.entrances().filter(function (E) {
            var l = LAB.toLocal(E.x, E.y); return l.x > CHUNK_SIZE && l.y > CHUNK_SIZE && l.x < span - CHUNK_SIZE && l.y < span - CHUNK_SIZE; });
        if (!ents.length) { A.reserve = { ok: false, detail: "PRECONDITION: no entrance inside the cavetest" + CAVE_SEEDS[0] + " window" }; return; }
        // natural data: chunk chests of the window that fall in a reserve
        var natural = 0;
        for (var dy = 0; dy < WINDOW_CHUNKS; dy++) for (var dx = 0; dx < WINDOW_CHUNKS; dx++) {
            var c = chunks[(windowCX + dx) + "," + (windowCY + dy)];
            if (c) c.treasureChests.forEach(function (tc) { if (inEntranceReserve(tc.x - windowOriginX, tc.y - windowOriginY)) natural++; });
        }
        LAB.metric("loot.reserve.natural_chunk_chests_in_reserve", natural);
        var E = ents[0];
        var inside = { x: E.x, y: E.y }, outside = LAB.axisWorld(E, 150, 0);
        function inject(p, gold) {
            var k = chunkOf(p.x, p.y), ch = generateChunk(k.cx, k.cy);
            ch.treasureChests.push({ x: p.x, y: p.y, gold: gold, collected: false, opened: false, lidAngle: 0, facing: 0,
                equipId: null, relicId: null, tier: "common", quality: 1.0, seed: 1 });
        }
        inject(inside, 7771);
        inject(outside, 7772);
        var half = Math.floor(WINDOW_CHUNKS / 2);
        assembleWindow(windowCX + half, windowCY + half);
        var hasIn = !!winChestAt(inside.x, inside.y), hasOut = !!winChestAt(outside.x, outside.y);
        A.reserve = { ok: hasOut && !hasIn, detail: "entrance (" + r1(E.x) + "," + r1(E.y) + "): injected chest at the arch centre " +
            (hasIn ? "SURVIVED" : "filtered") + ", control chest 150 u outside " + (hasOut ? "present" : "MISSING (injection path broken)") +
            " (filter 7174-7181, inEntranceReserve 765)" };
    });

    // ── verdicts ─────────────────────────────────────────────────────────────
    LAB.scenario("loot: verdicts", function () {
        // terminal chambers
        var noTerm = A.worlds.filter(function (w) { return w.terminals === 0; });
        LAB.check("loot: precondition: every world has terminal cave chambers to judge",
            A.worlds.length > 0 && noTerm.length === 0,
            A.worlds.map(function (w) { return w.world + " " + w.terminals; }).join(", ") +
            (noTerm.length ? "; PRECONDITION: no terminal chamber in " + noTerm.map(function (w) { return w.world; }).join(",") : "") +
            " (terminal chambers 4537-4545)");
        var T = A.terms, Tok = T.filter(function (t) { return t.ok; });
        var perWorld = {};
        T.forEach(function (t) { var w = perWorld[t.world] || (perWorld[t.world] = { n: 0, ok: 0 }); w.n++; if (t.ok) w.ok++; });
        Object.keys(perWorld).sort().forEach(function (w) { LAB.metric("loot." + w + ".terminal_chambers_without_chest", perWorld[w].n - perWorld[w].ok); });
        var missing = T.filter(function (t) { return !t.ok; });
        if (missing.length) LAB.note("terminal chambers without a lootable chest: " + missing.map(function (t) { return t.world + "(" + r1(t.wx) + "," + r1(t.wy) + "): " + t.why; }).join(" | "));
        var causes = { edge: 0, reserve: 0, other: 0 };
        missing.forEach(function (t) { causes[t.cause]++; });
        LAB.check("loot: every terminal cave chamber holds a lootable chest",
            T.length > 0 && noTerm.length === 0 && Tok.length === T.length,
            Tok.length + "/" + T.length + " terminal chambers have a chest on their centre in the window a player there gets (" +
            Object.keys(perWorld).sort().map(function (w) { return w + " " + perWorld[w].ok + "/" + perWorld[w].n; }).join(", ") + ")" +
            "; causes: edge cell (L5966) " + causes.edge + ", entrance reserve (L7180) " + causes.reserve + ", other " + causes.other +
            (missing.length ? "; missing: " + missing.slice(0, 6).map(function (t) { return t.world + "(" + r1(t.wx) + "," + r1(t.wy) + "): " + t.why; }).join("; ") +
                (missing.length > 6 ? "; +" + (missing.length - 6) + " more" : "") : "") +
            (T.length && !noTerm.length ? "" : "; PRECONDITION: no terminal chambers judged") +
            " (cave chest placement 5956-5980)");

        // reward sample
        function tierStats(list) {
            var s = {};
            CHEST_TIER_KEYS.forEach(function (t) { s[t] = { n: 0, goldN: 0, goldSum: 0, relic: 0, equip: 0, gold: 0 }; });
            list.forEach(function (c) {
                var t = s[c.tier] || (s[c.tier] = { n: 0, goldN: 0, goldSum: 0, relic: 0, equip: 0, gold: 0 });
                t.n++; t[kindOf(c.loot) === "nothing" ? "gold" : kindOf(c.loot)]++;
                if (c.loot.gold > 0) { t.goldN++; t.goldSum += c.loot.gold; }
            });
            return s;
        }
        function fmtStats(s) {
            return CHEST_TIER_KEYS.map(function (t) {
                var x = s[t];
                return t + " n" + x.n + " gold" + x.gold + "/equip" + x.equip + "/relic" + x.relic +
                    " meanGold " + (x.goldN ? r1(x.goldSum / x.goldN) : "-");
            }).join("; ");
        }
        var cs = tierStats(A.cave), ss = tierStats(A.surf);
        ["cave", "surface"].forEach(function (kind) {
            var s = kind === "cave" ? cs : ss, tiers = {}, means = {};
            CHEST_TIER_KEYS.forEach(function (t) { tiers[t] = s[t].n; means[t] = s[t].goldN ? +(s[t].goldSum / s[t].goldN).toFixed(1) : null; });
            LAB.metric("loot." + kind + ".tier_counts", tiers);
            LAB.metric("loot." + kind + ".mean_gold_by_tier", means);
        });
        LAB.note("cave chests: " + fmtStats(cs));
        LAB.note("surface chests: " + fmtStats(ss));

        // gold rises with tier: difficulty-matched cross-tier pairs. Verdict
        // statistic: total gold of the higher-tier chests / total gold of the
        // lower-tier chests over every pair whose chunks' difficulty is within
        // DIFF_TOL (gold also scales with difficulty, 5847/5971). Any per-tier
        // multiplier >= 1.33x per step (CHEST_TIER_DEFS goldMult 1/1.5/2/3)
        // lands >= 1.33x; tier-blind gold lands ~1.0x (0.92-1.03x measured
        // across seed sets). Concordance is a METRIC only: a 1.33-1.5x
        // multiplier on a uniform roll caps it near 0.63-0.67.
        function tierPairs(list) {
            var g = list.filter(function (c) { return c.loot.gold > 0; });
            var pairs = 0, conc = 0, hiSum = 0, loSum = 0;
            for (var i = 0; i < g.length; i++) for (var j = i + 1; j < g.length; j++) {
                if (Math.abs(g[i].diff - g[j].diff) > DIFF_TOL) continue;
                var ri = CHEST_TIER_KEYS.indexOf(g[i].tier), rj = CHEST_TIER_KEYS.indexOf(g[j].tier);
                if (ri === rj) continue;
                var hi = ri > rj ? g[i] : g[j], lo = ri > rj ? g[j] : g[i];
                pairs++;
                hiSum += hi.loot.gold; loSum += lo.loot.gold;
                conc += hi.loot.gold > lo.loot.gold ? 1 : hi.loot.gold === lo.loot.gold ? 0.5 : 0;
            }
            return { n: g.length, pairs: pairs, c: pairs ? conc / pairs : 0, ratio: loSum ? hiSum / loSum : 0 };
        }
        var cc = tierPairs(A.cave), sc = tierPairs(A.surf);
        LAB.metric("loot.cave.gold_tier_concordance", cc.c);
        LAB.metric("loot.surface.gold_tier_concordance", sc.c);
        LAB.metric("loot.cave.gold_tier_ratio", cc.ratio);
        LAB.metric("loot.surface.gold_tier_ratio", sc.ratio);
        var epicCave = A.cave.filter(function (c) { return c.tier === "epic"; });
        var tierPre = A.tierControls.length >= 20 && A.tierControls.every(function (p) { return p.pre && p.low > 0; });
        LAB.check("loot: precondition: the cave reward sample contains epic chests and paired rarity controls",
            epicCave.length > 0 && tierPre,
            A.cave.length + " cave chests judged (" + epicCave.length + " epic), " + A.tierControls.length + " paired rarity controls" +
            (epicCave.length > 0 && tierPre ? "" : "; PRECONDITION: sample too small or tier intervention invalid"));

        // epic cave chests pay a relic or equipment
        var epicGood = epicCave.filter(function (c) { return !!c.loot.relic || !!c.loot.equip; });
        var ew = {};
        epicCave.forEach(function (c) { var w = ew[c.world] || (ew[c.world] = { n: 0, ok: 0, gold: [] });
            w.n++; if (c.loot.relic || c.loot.equip) w.ok++; else w.gold.push(c.loot.gold); });
        var epicGoldOnly = epicCave.filter(function (c) { return kindOf(c.loot) === "gold"; }).length;
        LAB.check("loot: every epic cave chest yields a relic or equipment",
            epicCave.length > 0 && epicGood.length === epicCave.length,
            epicGood.length + "/" + epicCave.length + " epic cave chests (window copies) yield a relic/equipment via collectChest; failures: " +
            epicGoldOnly + " gold-only, " + (epicCave.length - epicGood.length - epicGoldOnly) + " other; " +
            Object.keys(ew).sort().map(function (w) { var x = ew[w];
                return w + " " + x.ok + "/" + x.n + (x.gold.length ? " (gold only: " + x.gold.slice(0, 8).join(",") + (x.gold.length > 8 ? ",..." : "") + ")" : ""); }).join("; ") +
            (epicCave.length ? "" : "; PRECONDITION: no epic cave chest in these worlds") +
            " (cave chest contents 5969-5977; surface epic relic 5848-5850)");

        var paired = A.tierControls, pairPre = tierPre;
        var pairGood = paired.filter(function (p) { return p.high >= p.low * RATIO_MIN; }).length;
        LAB.check("loot: cave chest gold rises with chest tier", pairPre && pairGood === paired.length,
            pairGood + '/' + paired.length + ' same-seed common/epic pairs scale gold by at least ' + RATIO_MIN + 'x' +
            (pairPre ? '' : '; PRECONDITION: fewer than 20 valid same-draw tier interventions'));
        LAB.check("loot: surface chest gold rises with chest tier",
            sc.pairs >= PAIRS_MIN && sc.ratio >= RATIO_MIN,
            "higher-tier / lower-tier gold = " + r2(sc.ratio) + "x over " + sc.pairs + " cross-tier pairs (chunk difficulty within " + DIFF_TOL + ") of " + sc.n +
            " gold-paying surface chests (need >= " + RATIO_MIN + "x); " + fmtStats(ss) +
            (sc.pairs >= PAIRS_MIN ? "" : "; PRECONDITION: fewer than " + PAIRS_MIN + " pairs") + " (5847)");

        // surface epic -> relic
        var epicSurf = A.surf.filter(function (c) { return c.tier === "epic"; });
        var epicSurfOk = epicSurf.filter(function (c) { return !!c.loot.relic && c.loot.collected; });
        LAB.check("loot: every epic surface chest yields a relic",
            epicSurf.length > 0 && epicSurfOk.length === epicSurf.length,
            epicSurfOk.length + "/" + epicSurf.length + " epic surface chests (window copies) equip a relic via collectChest" +
            (epicSurf.length ? " (" + epicSurf.map(function (c) { return c.loot.relic || kindOf(c.loot); }).join(",") + ")" : "; PRECONDITION: no epic surface chest sampled") +
            " (5848-5850, 20177-20194)");

        // equipment carries the chest's quality, inside the tier's range
        var eqAll = A.surf.concat(A.cave).filter(function (c) { return !!c.loot.equip; });
        var eqBad = eqAll.filter(function (c) {
            var td = CHEST_TIER_DEFS[c.tier];
            var q = c.loot.equip.quality;
            return !td || Math.abs(q - c.quality) > 1e-9 || q < td.qualityMin - 1e-9 || q > td.qualityMax + 1e-9;
        });
        var eqCave = eqAll.filter(function (c) { return A.cave.indexOf(c) >= 0; }).length;
        LAB.check("loot: chest equipment carries the chest's quality, inside its tier's range",
            eqAll.length > 0 && eqBad.length === 0,
            (eqAll.length - eqBad.length) + "/" + eqAll.length + " equipment rewards (" + (eqAll.length - eqCave) + " surface, " + eqCave +
            " cave) have quality == chest.quality within CHEST_TIER_DEFS[tier] range" +
            (eqBad.length ? "; bad: " + eqBad.slice(0, 6).map(function (c) { return c.world + " " + c.tier + " " + c.loot.equip.id +
                " q" + r2(c.loot.equip.quality) + " chest q" + r2(c.quality); }).join("; ") : "") +
            (eqAll.length ? "" : "; PRECONDITION: no equipment reward sampled") + " (rollQuality 3638, createEquipInstance 3650, collectChest 20198)");

        // floor: offered, and pays exactly what its drawn prompt says, once
        var flNW = A.floor.filter(function (f) { return !f.inWindow; });
        var fl = A.floor.filter(function (f) { return f.inWindow; });
        var flOk = fl.filter(function (f) { return f.onFloor && f.offered; });
        LAB.check("loot: a cave chest is offered to a player standing beside it on the cave floor",
            fl.length > 0 && flOk.length === fl.length,
            flOk.length + "/" + fl.length + " cave chests offered (nearestOpenChest + lid open) with the player 30 u away on the chest cell's cave floor, underground" +
            (flOk.length < fl.length ? "; not: " + fl.filter(function (f) { return flOk.indexOf(f) < 0; }).slice(0, 6).map(function (f) {
                return f.world + "(" + r1(f.wx) + "," + r1(f.wy) + ") offered=" + f.offered + " onFloor=" + f.onFloor + " h=" + r2(f.h) +
                    " floor=" + (f.floorZ === null ? "none" : r2(f.floorZ)) + " underground=" + f.ug; }).join("; ") : "") +
            (A.notIsolated ? "; " + A.notIsolated + " not tested (another chest within 120 u)" : "") +
            (flNW.length ? "; " + flNW.length + " not tested (absent from the window)" : "") +
            (fl.length ? "" : "; PRECONDITION: no cave chest visited") + " (updateTreasureChests 19426)");
        var payOk = flOk.filter(function (f) { return f.got && f.collected && f.secondNone && f.prompt && f.prompt.errs === 0; });
        var promptKinds = {};
        flOk.forEach(function (f) { var k = !f.prompt || !f.prompt.lines.length ? "none" : f.prompt.gold !== null ? "gold" : "item"; promptKinds[k] = (promptKinds[k] || 0) + 1; });
        LAB.check("loot: looting a cave chest from the floor pays its advertised reward exactly once",
            flOk.length > 0 && payOk.length === flOk.length,
            payOk.length + "/" + flOk.length + " offered cave chests " + JSON.stringify(promptKinds) + " paid exactly what the floating text drawn in a real frame names " +
            "(+N Gold, or the item/relic name now worn) on the first A press and nothing on the second" +
            (payOk.length < flOk.length ? "; not: " + flOk.filter(function (f) { return payOk.indexOf(f) < 0; }).slice(0, 6).map(function (f) {
                return f.world + "(" + r1(f.wx) + "," + r1(f.wy) + ") prompt " + fmtPrompt(f.prompt) + " paid=" + f.paid + " slots " + f.slots +
                    " got=" + !!f.got + " collected=" + f.collected + " second=" + f.second + " renderErrors=" + (f.prompt ? f.prompt.errs : "-"); }).join("; ") : "") +
            (flOk.length ? "" : "; PRECONDITION: no chest was offered on the floor") + " (text 9372-9444; gamepad A 19098-19099 -> collectChest 20175-20220)");

        // cap: not offered, not looted
        var offerable = {};
        flOk.forEach(function (f) { offerable[f.world + ":" + f.wx + "," + f.wy] = true; });
        var capT = A.cap.filter(function (c) { return c.inWindow && c.onCap && offerable[c.world + ":" + c.wx + "," + c.wy]; });
        var capBad = capT.filter(function (c) { return c.offered || c.looted; });
        var capSkip = A.cap.filter(function (c) { return capT.indexOf(c) < 0; });
        var capSkipWhy = capSkip.slice(0, 4).map(function (c) {
            return c.world + "(" + r1(c.wx) + "," + r1(c.wy) + ") inWindow=" + c.inWindow + " onCap=" + c.onCap + " h=" + r2(c.h) +
                " layers " + c.layers + " floorOffer=" + !!offerable[c.world + ":" + c.wx + "," + c.wy]; }).join("; ");
        LAB.check("loot: precondition: at least 5 floor-lootable cave chests were tested from the cap above them",
            capT.length >= CAP_MIN,
            capT.length + " cave chests tested with the player on the type-4 cap directly above (>= 3 h over the cave floor), each one offered from the floor" +
            (capSkip.length ? "; " + capSkip.length + " skipped (" + capSkipWhy + ")" : "") +
            (capT.length >= CAP_MIN ? "" : "; PRECONDITION: fewer than " + CAP_MIN));
        var capWorld = {};
        capT.forEach(function (c) { var w = capWorld[c.world] || (capWorld[c.world] = { n: 0, bad: 0 }); w.n++; if (c.offered || c.looted) w.bad++; });
        Object.keys(capWorld).sort().forEach(function (w) { LAB.metric("loot." + w + ".cap_offered_or_looted", capWorld[w].bad); });
        LAB.check("loot: a cave chest is not offered to a player standing on the surface cap above it",
            capT.length >= CAP_MIN && capBad.length === 0,
            capBad.length + "/" + capT.length + " cave chests were offered or looted (A press) from the cap directly above them (looted " +
            capBad.filter(function (c) { return c.looted; }).length + ", no prompt drawn for " + capBad.filter(function (c) { return !c.drawn; }).length + ")" +
            (capBad.length ? " e.g. " + capBad.slice(0, 5).map(function (c) { return c.world + "(" + r1(c.wx) + "," + r1(c.wy) + ") player h=" + r2(c.h) +
                " on cap " + r2(c.capZ) + ", chest on floor " + r2(c.floorZ) + " (" + r2(c.h - c.floorZ) + " h below)" +
                (c.looted ? " LOOTED" : " offered") + (c.drawn ? "" : " with no prompt drawn"); }).join("; ") : "") +
            (capT.length >= CAP_MIN ? "" : "; PRECONDITION: fewer than " + CAP_MIN + " chests tested from the cap") +
            " (pickup range: updateTreasureChests 19433-19434 tests XY distance only)");

        // looted chest survives a window re-centre (in-memory write-back)
        var P = A.persist;
        var pOk = P.filter(function (p) { return p.pre && p.ok; });
        LAB.check("loot: a looted chest stays looted after the window re-centres",
            P.length > 0 && pOk.length === P.length,
            pOk.length + "/" + P.length + " looted cave chests still collected and not offered after a " + TRIP_CHUNKS + "-chunk trip out and back" +
            P.map(function (p) { return "; " + p.world + "(" + r1(p.wx) + "," + r1(p.wy) + ") looted=" + p.collectedBefore + " assembleWindow calls=" + p.recentres +
                " chestLeftWindow=" + !!p.leftWindow + " rebuilt=" + p.rebuilt + " chunkInMemory=" + p.inMemory + " after: " + p.after +
                (p.pre ? "" : " PRECONDITION: the trip did not re-centre / rebuild the chest"); }).join("") +
            (P.length ? "" : "; PRECONDITION: no chest looted") + " (saveAllEntityDeltas 7388-7410, assembleWindow copy 7035-7041)");

        // walking in on foot
        var W = A.walk, wOk = W.filter(function (w) { return w.pre && w.ok; });
        LAB.check("loot: a cave chest is reached on foot from the entrance and offered, with the player on the cave floor",
            W.length >= 2 && wOk.length === W.length,
            wOk.length + "/" + W.length + " walks at " + WALK_FPS + " fps (real loop) reached the chest, stood on its cave floor underground, were offered it and saw its prompt, with 0 render errors: " +
            W.map(function (w) { return w.detail; }).join(" | ") + (W.length ? "" : "PRECONDITION: no walk ran"));

        // prompt vs action
        var R = A.prompt;
        LAB.check("loot: precondition: the prompt scenario offers an equipment chest and draws its prompt in every case",
            !!R && R.pre,
            !R ? "PRECONDITION: prompt scenario did not run" : (R.detail || (R.chest + ": " + R.cases.map(function (c) {
                return c.name + " offered=" + c.offered + " prompt " + fmtPrompt(c.prompt) + " renderErrors=" + c.errs; }).join("; "))) +
            (R && R.pre ? "" : "; PRECONDITION: not every case drew an actionable prompt"));
        var rBad = R ? R.cases.filter(function (c) { return !c.ok; }) : [];
        LAB.check("loot: the chest prompt says Take or Swap exactly as pressing A takes or swaps",
            !!R && R.pre && rBad.length === 0,
            !R ? "PRECONDITION: prompt scenario did not run" : (R.detail || (R.chest + ": " + R.cases.map(function (c) { return (c.ok ? "" : "MISMATCH ") + c.text; }).join("; "))) +
            (R && R.pre ? "" : "; PRECONDITION: prompt scenario incomplete") +
            " (prompt 9406-9413 tests currentItem.id !== eInst.id; collectChest 20198-20207 swaps whenever the slot is occupied)");

        // entrance reserve
        LAB.check("loot: chests inside a cave entrance reserve are filtered out of the window",
            !!A.reserve && A.reserve.ok, A.reserve ? A.reserve.detail : "PRECONDITION: reserve scenario did not run");
    });
}
LAB.finish();
undefined;
