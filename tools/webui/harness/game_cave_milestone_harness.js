// Focused acceptance checks for the first playable cave milestone.
// Uses the actual generated page, input path, mesh and renderer. No replacement
// geometry or movement algorithm is introduced by this harness.
(0, eval)(slurp('tools/webui/harness/_game_env.js'));
LAB.init(__out, slurp, __engine, __argv);
LAB.check('cave_milestone: page evaluates', LAB.load(__argv[0]), LAB.loadError || '');

if (LAB.loaded) {
    var G = (0, eval)('this');
    var originalAssemble = G.assembleWindow;
    function quiet() {
        enemies.length = 0; enemySpawners.length = 0; projectiles.length = 0;
    }
    G.assembleWindow = function() {
        var result = originalAssemble.apply(this, arguments);
        quiet();
        return result;
    };
    function d(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function atWorld(p) { return LAB.toLocal(p.x, p.y); }
    function height() { return (pos.floorZ - 60) / 40; }
    function settle() { LAB.keys({}); LAB.tick(15); }
    function walkRoute(points, reverse) {
        var pointsToWalk = reverse ? points.slice().reverse() : points;
        var state = { reached: true, maxDH: 0, unsupported: 0, cramped: 0, airborne: 0, ticks: 0 };
        var oldH = height();
        pointsToWalk.forEach(function(p) {
            var trace = LAB.walkTo(p.x, p.y, {maxTicks: 1000, arrive: 5, onTick: function() {
                var h = height();
                state.maxDH = Math.max(state.maxDH, Math.abs(h - oldH)); oldH = h;
                var support = getWalkableLayerTopAt(pos.x, pos.y, h);
                if (support.idx < 0 || !Number.isFinite(support.topH)) state.unsupported++;
                var space = getCaveSpaceAt(pos.x, pos.y, h);
                if (space.ceilingH !== null && Number.isFinite(space.ceilingH) && space.ceilingH - h < 2.4) state.cramped++;
                if (jumpAirborne) state.airborne++;
                state.ticks++;
            }});
            if (d(LAB.worldPos(), p) > 6) state.reached = false;
        });
        settle();
        return state;
    }
    function fixture(kind, seed) {
        var P = 'cave_milestone: ' + kind + ' ' + seed + ' ';
        LAB.freshPage(); LAB.seedRandom(seed);
        G._caveTestKindOverride = kind;
        LAB.startCaveTest(seed);
        LAB.freezeDay(0.5);
        quiet();
        var net = endlessCaveNetworks['0,0'];
        var e = net && net.entrances[0];
        LAB.check(P + 'requested entrance exists', !!e && e.kind === kind, e ? e.kind : 'no entrance');
        if (!e) return;
        LAB.check(P + 'portal has finite floor and clearance', Number.isFinite(e.floorH) && e.ceilH >= 2.8,
            'floor=' + e.floorH + ' headroom=' + e.ceilH);
        var out = {x: -Math.cos(e.angle), y: -Math.sin(e.angle)};
        var outer = {x: e.x + out.x * (e.approachLength - 24), y: e.y + out.y * (e.approachLength - 24)};
        var chamber = net.chambers[net.chambers.length - 1];
        var inner = {x: chamber.cx, y: chamber.cy};
        var route = [outer, {x: e.x, y: e.y}];
        net.corridors.forEach(function(c) { route.push({x: c.x2, y: c.y2}); });
        route.push(inner);
        LAB.placeWorld(outer.x, outer.y, 'top'); settle();
        var outsideH = height();
        var walkIn = walkRoute(route, false);
        LAB.check(P + 'walk reaches chamber', walkIn.reached, JSON.stringify(walkIn));
        LAB.check(P + 'walk has continuous support', walkIn.unsupported === 0 && walkIn.maxDH < 0.36, JSON.stringify(walkIn));
        LAB.check(P + 'walk preserves eye clearance', walkIn.cramped === 0, JSON.stringify(walkIn));
        LAB.check(P + 'walking does not trigger falls', walkIn.airborne === 0, JSON.stringify(walkIn));
        LAB.check(P + 'chamber classifies underground', playerUnderground === true, 'h=' + height());
        var chamberH = height();
        var chamberLocal = atWorld(inner);
        var space = getCaveSpaceAt(chamberLocal.x, chamberLocal.y, chamberH);
        LAB.check(P + 'chamber ceiling is above camera', Number.isFinite(space.ceilingH) && space.ceilingH >= chamberH + 2.4,
            JSON.stringify(space));
        [0.5, 0.95].forEach(function(time) {
            LAB.freezeDay(time); settle();
            LAB.check(P + 'readable ambient at ' + time, ambientLight >= 0.25 && ambientLight <= 0.65,
                'ambient=' + ambientLight);
        });
        settings.dayNight = false; settle();
        LAB.check(P + 'underground detection with day/night off', playerUnderground === true);
        var errors = 0;
        [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach(function(turn) {
            cam.ang = e.angle + turn;
            errors += LAB.frame();
        });
        LAB.check(P + 'turning inside renders without errors', errors === 0 && Object.keys(_ptErrors).length === 0,
            JSON.stringify(_ptErrors));
        LAB.freezeDay(0.5);
        var walkOut = walkRoute(route, true);
        LAB.check(P + 'walk returns to approach', walkOut.reached, JSON.stringify(walkOut));
        LAB.check(P + 'return preserves support and headroom', walkOut.unsupported === 0 && walkOut.cramped === 0 && walkOut.maxDH < 0.36,
            JSON.stringify(walkOut));
        LAB.check(P + 'return is outdoors at original height', !playerUnderground && Math.abs(height() - outsideH) < 0.2,
            'h=' + height() + ' expected=' + outsideH + ' underground=' + playerUnderground);
        LAB.placeWorld(inner.x, inner.y, 'top'); settle();
        var aboveH = height();
        LAB.check(P + 'surface above chamber stays outdoors', !playerUnderground && aboveH > chamberH + e.ceilH,
            'surface=' + aboveH + ' cave=' + chamberH);
        LAB.check(P + 'surface viewpoint renders without errors', LAB.frame() === 0 && Object.keys(_ptErrors).length === 0,
            JSON.stringify(_ptErrors));
        LAB.metric('cave_milestone.' + kind + '.' + seed + '.walk_ticks', walkIn.ticks + walkOut.ticks);
        // Same world-space geometry must survive eviction/reassembly.
        var before = JSON.stringify(net);
        delete endlessCaveNetworks['0,0'];
        LAB.check(P + 'network regenerates deterministically', JSON.stringify(generateCaveNetwork(0, 0)) === before);
    }
    var seeds = LAB.seeds([12345]);
    seeds.forEach(function(seed) {
        LAB.scenario('cave_milestone: descending scenario ' + seed, function() { fixture('descending', seed); });
    });
    // Hillside fixtures need genuine cover, not a forced opening in flat land.
    // These two known natural sites supplement any requested descending sweep.
    [5668, 6290].forEach(function(seed) {
        LAB.scenario('cave_milestone: hillside scenario ' + seed, function() { fixture('hillside', seed); });
    });
    LAB.scenario('cave_milestone: chunk-edge chamber content', function() {
        LAB.freshPage();
        G.assembleWindow = originalAssemble;
        G._caveTestKindOverride = 'descending';
        LAB.startCaveTest(12345, {caveEnemies: true, caveChests: true});
        var caveEnemies = enemies.filter(function(e) { return !!e.caveSpawnId; });
        var caveChests = treasureChests.filter(function(c) { return !!c.caveSpawnId; });
        LAB.check('cave_milestone: chunk-edge chamber has its reward', caveChests.length === 1, 'count=' + caveChests.length);
        LAB.check('cave_milestone: chunk-edge chamber has its enemies', caveEnemies.length >= 2 && caveEnemies.length <= 3,
            'count=' + caveEnemies.length);
        var occupants = caveEnemies.concat(caveChests), ids = {};
        var unique = true, open = true;
        occupants.forEach(function(o) {
            if (ids[o.caveSpawnId]) unique = false;
            ids[o.caveSpawnId] = true;
            var gx = Math.floor(o.x / cell), gy = Math.floor(o.y / cell);
            if (gx < 0 || gy < 0 || gx >= gridW || gy >= gridH || grid[gy * gridW + gx]) open = false;
        });
        LAB.check('cave_milestone: chamber content has unique stable identities', occupants.length >= 3 && unique);
        LAB.check('cave_milestone: chamber content spawns in open cells', occupants.length >= 3 && open);
    });
    LAB.scenario('cave_milestone: zero-height camera', function() {
        cam.z = 0;
        LAB.check('cave_milestone: camera preserves legitimate zero physics height', Math.abs(getCam3D().cameraZ - 22.5) < 1e-9);
    });
}
LAB.finish();
undefined;
