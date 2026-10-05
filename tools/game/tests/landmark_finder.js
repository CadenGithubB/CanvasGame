// "Go to nearest landmark" lands safely and loads the world a walk-in would.
// Six fixed seeds, a separate seed sweep (--sweep), the real generator, window
// assembly, physics and fixed ticks (render_host.js supplies browser APIs
// only). Oracles are independent of the finder: the landing is checked against
// the grid, the floor mesh support query, grid ray casts for enclosure and 120
// real simulation ticks (health, push, spawner activity); the loaded records
// are compared with a fresh world entered by moving the player there and
// calling updateChunks(); the region rule is compared with generated
// region-centre chunks. Authored fixtures edit one landed cell's surroundings
// (an enemy, a spawner, a roof, a slope, water, an entrance, a stall, a wall)
// and assert the landing test rejects it and accepts it again once removed.
// Mutations (evaluated copies; exact-once anchors):
//   --finder-no-settle          skip settlePlayerAtSpawn
//   --finder-keep-velocity      keep the pre-teleport velocity
//   --finder-stale-origin       place with pre-re-centre window coordinates
//   --finder-threshold          presence threshold 0.012 -> 0.02 (the region rule, 05)
//   --finder-no-interp-reset    skip resetRenderInterpolation
//   --finder-no-spawner-gap     land within waking range of a live spawner
//   --finder-no-enemy-safety    ignore how soon an enemy can walk to the cell
//   --finder-hull-no-inside     treat the footprint hull's interior as outside
//   --finder-always-safe        report every landing as safe
//   --finder-no-underground     accept a roofed (cave) cell
//   --finder-no-flat            accept a sloped cell
//   --finder-no-enemy-gap       accept a cell beside an enemy
//   --finder-no-recentre        leave the re-centre to updateChunks()
//   --finder-no-updatechunks    skip the walk-in biome bookkeeping
//   --finder-no-run-reset       keep the visited list across runs (05 hook)
//   --finder-no-failed-skip     retry an unreachable landmark on every press
//   --finder-rechoose-unshifted re-choose against the hull in stale coordinates
// Narrowing: --seeds a,b  --skip-sweep  --skip-extras  --skip-fixtures;
// --sweep runs only the seed sweep, --cases 1,96:arena narrows it, --ticks n.
(function () {
  (0, eval)(slurp('tools/game/tests/render_host.js'));
  var H = createRenderTestHost(), G = H.G, out = H.output, checked = 0, failed = 0;
  function check(name, ok, detail) {
    checked++; if (!ok) failed++;
    out((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + JSON.stringify(detail === undefined ? null : detail)));
  }
  function swap(source, flag, before, after) {
    if (__argv.indexOf(flag) < 0) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + flag);
    return source.replace(before, after);
  }
  H.loadManifest(function (path, source) {
    if (path === 'src/05-endless-world.js') {
      source = swap(source, '--finder-no-run-reset',
        "  if (typeof resetLandmarkFinder === 'function') resetLandmarkFinder();   // a new run cycles landmarks afresh\n", '');
      // The finder's region rule lives with the generator (largeStructureForRegion).
      return swap(source, '--finder-threshold', '  if (rng() > 0.012) return null;', '  if (rng() > 0.02) return null;');
    }
    if (path !== 'src/22-landmark-finder.js') return source;
    source = swap(source, '--finder-no-settle', '  settlePlayerAtSpawn(true);                 // support height', '  // settle skipped; support height');
    source = swap(source, '--finder-keep-velocity',
      "  if (typeof clearGameplayInput === 'function') clearGameplayInput();\n  vel.x = 0; vel.y = 0; jumpVelZ = 0; jumpAirborne = false; jumpPressed = false; dashPressed = false;\n", '');
    source = swap(source, '--finder-stale-origin', '        landing = {gx: gx, gy: gy, x: lwx - windowOriginX, y: lwy - windowOriginY, gap: landing.gap};',
      '        landing = {gx: gx, gy: gy, x: landing.x, y: landing.y, gap: landing.gap};');
    source = swap(source, '--finder-no-interp-reset', '  resetRenderInterpolation();                // a teleport', '  // no interpolation reset; a teleport');
    source = swap(source, '--finder-no-spawner-gap',
      '    if (sp.active && sp.hp > 0 && Math.hypot(sp.x - x, sp.y - y) < LANDMARK_SPAWNER_GAP) return null;\n', '');
    source = swap(source, '--finder-no-enemy-safety',
      '      if (arrival < LANDMARK_SAFE_SECONDS) score += 3000 + (LANDMARK_SAFE_SECONDS - arrival) * 250;\n', '');
    source = swap(source, '--finder-hull-no-inside', '  return inside ? -best : best;', '  return best;');
    source = swap(source, '--finder-always-safe', 'safe = arrival >= LANDMARK_SAFE_SECONDS;', 'safe = true;');
    source = swap(source, '--finder-no-underground', '  if (getCaveSpaceAt(x, y, h).underground) return null;\n', '');
    source = swap(source, '--finder-no-flat',
      '      if (lj < 0 || Math.abs(meshLayerHeight(mesh, (gy + ny) * mesh.w + gx + nx, lj) - h) > 0.3) return null;\n', '');
    source = swap(source, '--finder-no-enemy-gap', '    if (Math.hypot(enemies[ei].x - x, enemies[ei].y - y) < 36) return null;\n', '');
    source = swap(source, '--finder-no-recentre', '      if (lcx !== windowCX + half || lcy !== windowCY + half) assembleWindow(lcx, lcy);\n', '');
    source = swap(source, '--finder-no-updatechunks', '  updateChunks();                            // walk-in', '  // no updateChunks; walk-in');
    source = swap(source, '--finder-rechoose-unshifted',
      '          hull.map(function(p) { return [p[0] + hullOX - windowOriginX, p[1] + hullOY - windowOriginY]; }));', '          hull);');
    source = swap(source, '--finder-no-failed-skip', '    if (memo.failed.indexOf(key) < 0) memo.failed.push(key);   // the next press moves on\n', '');
    return source;
  });
  // Count window assemblies, and those made by updateChunks() itself.
  var assembled = 0, assembledInUpdate = 0, inUpdate = false, realAssemble = G.assembleWindow, realUpdate = G.updateChunks;
  G.assembleWindow = function () { assembled++; if (inUpdate) assembledInUpdate++; return realAssemble.apply(null, arguments); };
  G.updateChunks = function () {
    var was = inUpdate; inUpdate = true;
    try { return realUpdate.apply(null, arguments); } finally { inUpdate = was; }
  };
  function option(name) { var i = __argv.indexOf(name); return i >= 0 ? __argv[i + 1] : null; }
  function flag(name) { return __argv.indexOf(name) >= 0; }
  var ALL_SEEDS = [424242, 777000, 31337, 12345, 2024, 555];
  var SEEDS = option('--seeds') ? option('--seeds').split(',').map(Number) : ALL_SEEDS;

  function fresh(seed) {
    G._gameClockOriginMs = null; G._gameClockElapsedMs = 0; G._presentationRandomState = 1234567;
    H.clock.seed = 0x13572468;
    H.startEndless(seed);
    G.runSimulationTick(1 / 60);   // interpolation history is now live
  }
  function r3(v) { return typeof v === 'number' ? Math.round(v * 1000) / 1000 : v; }
  // Window records in world coordinates. `npc` is excluded: it is runtime
  // AI state created per window load (see the separate identity note).
  function records() {
    var ox = G.windowOriginX, oy = G.windowOriginY;
    function world(o, skip) {
      var outRec = {};
      Object.keys(o).sort().forEach(function (k) {
        if (skip.indexOf(k) >= 0) return;
        var v = o[k];
        if (k === 'x') v += ox; else if (k === 'y') v += oy;
        else if (k === 'patrolWaypoints') v = v.map(function (w) { return [r3(w.x + ox), r3(w.y + oy)]; });
        else if (k === 'enemyType') v = v && v.id;
        else if (v && typeof v === 'object') v = JSON.stringify(v);
        outRec[k] = r3(v);
      });
      return JSON.stringify(outRec);
    }
    return {enemies: G.enemies.map(function (e) { return world(e, ['npc']); }),
      chests: G.treasureChests.map(function (c) { return world(c, []); }),
      spawners: G.enemySpawners.map(function (s) { return world(s, []); }),
      structures: G.largeStructures.map(function (s) { return world(s, []); }),
      shrines: G.shrines.map(function (s) { return world(s, []); }),
      ruins: G.ruins.map(function (s) { return world(s, []); }),
      stalls: G.marketStalls.map(function (s) { return world(s, []); }),
      biome: [G.terrain, G.damping],   // walk-in bookkeeping: updateChunks() applies the biome preset
      window: [G.windowCX, G.windowCY], gridSum: (function () { var h = 0; for (var i = 0; i < G.grid.length; i++) h = (Math.imul(h, 31) + G.grid[i]) | 0; return h; }())};
  }
  function firstDifference(a, b) {
    for (var k in a) {
      var x = JSON.stringify(a[k]), y = JSON.stringify(b[k]);
      if (x !== y) {
        if (Array.isArray(a[k])) {
          if (a[k].length !== b[k].length) return k + ' count ' + a[k].length + ' vs ' + b[k].length;
          for (var i = 0; i < a[k].length; i++) if (a[k][i] !== b[k][i]) return k + '[' + i + '] ' + String(a[k][i]).slice(0, 300) + ' VS ' + String(b[k][i]).slice(0, 300);
        }
        return k + ' ' + x + ' vs ' + y;
      }
    }
    return null;
  }
  // Body-circle clearance against solid cells, from the grid alone.
  function bodyClear(x, y, radius) {
    var gx = Math.floor(x / G.cell), gy = Math.floor(y / G.cell);
    for (var oy = -2; oy <= 2; oy++) for (var ox = -2; ox <= 2; ox++) {
      var cx = gx + ox, cy = gy + oy;
      if (cx < 0 || cy < 0 || cx >= G.gridW || cy >= G.gridH || !G.grid[cy * G.gridW + cx]) continue;
      var nx = Math.max(cx * G.cell, Math.min(x, (cx + 1) * G.cell)), ny = Math.max(cy * G.cell, Math.min(y, (cy + 1) * G.cell));
      if (Math.hypot(nx - x, ny - y) < radius + 1) return false;
    }
    return true;
  }
  function coloured(i) { return G.grid[i] && (G.wallColorR[i] | G.wallColorG[i] | G.wallColorB[i]); }
  function structureFaceDistance(st) {
    var half = G.CHUNK_SIZE * 1.8 * st.scale, best = Infinity;
    for (var i = 0; i < G.grid.length; i++) {
      if (!coloured(i)) continue;
      var x = (i % G.gridW + 0.5) * G.cell, y = (Math.floor(i / G.gridW) + 0.5) * G.cell;
      if (Math.abs(x - st.x) > half || Math.abs(y - st.y) > half) continue;
      best = Math.min(best, Math.hypot(x - G.pos.x, y - G.pos.y));
    }
    return best;
  }
  // Enclosed: grid rays in all four cardinal directions meet a structure cell
  // inside the generator's overlap box (then the point is inside the
  // footprint's convex hull; a point outside it has a ray that escapes).
  function enclosedByStructure(st) {
    var half = G.CHUNK_SIZE * (st.type === 'fortress' ? 1.8 : st.type === 'arena' ? 1.3 : 1.5) * st.scale;
    var gx = Math.floor(G.pos.x / G.cell), gy = Math.floor(G.pos.y / G.cell), hits = 0;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
      for (var s = 1; s < 400; s++) {
        var cx = gx + d[0] * s, cy = gy + d[1] * s;
        if (cx < 0 || cy < 0 || cx >= G.gridW || cy >= G.gridH) break;
        if (Math.abs((cx + 0.5) * G.cell - st.x) > half || Math.abs((cy + 0.5) * G.cell - st.y) > half) break;
        if (coloured(cy * G.gridW + cx)) { hits++; break; }
      }
    });
    return hits === 4;
  }
  function spawnTotal() { return G.enemySpawners.reduce(function (n, s) { return n + (s.spawnCount || 0); }, 0); }

  if (!flag('--sweep')) {
  var types = {}, results = {}, assemblies = {};
  SEEDS.forEach(function (seed) {
    var label = 'seed ' + seed + ': ';
    fresh(seed);
    var home = {x: G.pos.x + G.windowOriginX, y: G.pos.y + G.windowOriginY};
    G.vel.x = 150; G.vel.y = -40;   // leftover motion the landing must clear
    assembled = 0; assembledInUpdate = 0;
    var interpBefore = G._renderHistoryReady;
    var res = G.goToNearestLandmark();
    var interpAfter = [G._renderHistoryReady, G._renderHistory.pos];
    assemblies[seed] = {finder: assembled, insideUpdateChunks: assembledInUpdate};
    var st = res.ok ? G.landmarkInWindow(res) : null;
    results[seed] = res;
    check(label + 'the finder reaches a generated structure of the predicted type',
      res.ok && !!st && res.type === res.predictedType && st.type === res.type && assembled >= 1 && assembled <= 3,
      {res: res, assembled: assembled});
    if (!res.ok || !st) return;
    types[res.type] = (types[res.type] || 0) + 1;
    var gx = Math.floor(G.pos.x / G.cell), gy = Math.floor(G.pos.y / G.cell), i = gy * G.gridW + gx;
    var feetH = (G.pos.floorZ - 60) / 40, support = G.getWalkableLayerTopAt(G.pos.x, G.pos.y, feetH);
    var space = G.getCaveSpaceAt(G.pos.x, G.pos.y, feetH), meshI = G.meshCellAt(G.pos.x, G.pos.y);
    check(label + 'landing cell is open, clear of walls, and on a walkable roofless dry surface',
      G.grid[i] === 0 && bodyClear(G.pos.x, G.pos.y, G.spatialPlayerBody().radius) && support.action === 'walk' &&
      Math.abs(support.topH - feetH) < 1e-6 && G.getTopWalkableLayerIdx(gx, gy) === support.idx && !space.underground &&
      !(G.floorMesh.water && G.floorMesh.water[meshI]),
      {grid: G.grid[i], support: support, feetH: feetH, underground: space.underground});
    var chunkX = Math.floor((G.pos.x + G.windowOriginX) / G.CHUNK_SIZE), chunkY = Math.floor((G.pos.y + G.windowOriginY) / G.CHUNK_SIZE);
    var half = Math.floor(G.WINDOW_CHUNKS / 2);
    check(label + 'the window is centred on the landing chunk and the velocity and jump state are clear',
      chunkX === G.windowCX + half && chunkY === G.windowCY + half && G.vel.x === 0 && G.vel.y === 0 &&
      !G.jumpAirborne && G.jumpVelZ === 0 && G.cam.x === G.pos.x && G.cam.y === G.pos.y,
      {chunk: [chunkX, chunkY], window: [G.windowCX, G.windowCY], vel: [G.vel.x, G.vel.y]});
    check(label + 'render interpolation is reset for the teleport',
      interpBefore === true && interpAfter[0] === false && interpAfter[1] === null, {before: interpBefore, after: interpAfter[0]});
    var faceDist = structureFaceDistance(st), wantAng = Math.atan2(st.y - G.pos.y, st.x - G.pos.x);
    check(label + 'the structure is inside viewDist and the camera faces its centre',
      faceDist <= G.viewDist && faceDist >= 40 && Math.abs(Math.atan2(Math.sin(G.cam.ang - wantAng), Math.cos(G.cam.ang - wantAng))) < 1e-9,
      {faceDistance: faceDist, viewDist: G.viewDist});
    // 120 real ticks, no input: no fall, no push, no damage, no re-centre.
    var z0 = G.pos.floorZ, x0 = G.pos.x, y0 = G.pos.y, h0 = G.health, dmg0 = G.stats.totalDamageTaken;
    var worst = 0, air = false, under = false, attackers = 0;
    assembled = 0;
    for (var t = 0; t < 120; t++) {
      G.runSimulationTick(1 / 60);
      worst = Math.max(worst, Math.abs(G.pos.floorZ - z0));
      air = air || G.jumpAirborne; under = under || G.playerUnderground;
    }
    G.enemies.forEach(function (e) { if (e.attackState && e.attackState !== 'idle' && Math.hypot(e.x - G.pos.x, e.y - G.pos.y) < 60) attackers++; });
    check(label + '120 ticks after landing: no fall, push, damage, underground state or window re-centre',
      worst <= 0.5 && !air && !under && Math.hypot(G.pos.x - x0, G.pos.y - y0) <= 0.5 && G.health === h0 &&
      G.stats.totalDamageTaken === dmg0 && assembled === 0,
      {floorDrift: worst, airborne: air, underground: under, moved: Math.hypot(G.pos.x - x0, G.pos.y - y0),
        health: [h0, G.health], damage: G.stats.totalDamageTaken - dmg0, assembled: assembled, attackers: attackers});
    // Restated (fixes round 1): the visited list now resets with each run, so
    // a fresh run's first press repeats this landing without {revisit}; the
    // records now include the biome preset that updateChunks() applies.
    fresh(seed);
    G.vel.x = 150; G.vel.y = -40;
    var repeat = G.goToNearestLandmark();
    var finderRecords = records();
    var finderNpcIds = G.enemies.map(function (e) { return e.npc && e.npc.id; });
    fresh(seed);
    G.pos.x = res.landing.wx - G.windowOriginX; G.pos.y = res.landing.wy - G.windowOriginY;
    G.updateChunks();
    var walkRecords = records(), walkNpcIds = G.enemies.map(function (e) { return e.npc && e.npc.id; });
    var diff = firstDifference(walkRecords, finderRecords);
    check(label + "a fresh run's first press repeats the landing, and its records equal a walk-in (enemies, chests, spawners, landmarks, biome)",
      repeat.ok && repeat.landing.wx === res.landing.wx && repeat.landing.wy === res.landing.wy &&
      diff === null && finderRecords.enemies.length > 0 && finderRecords.chests.length > 0,
      {diff: diff, repeat: repeat.ok ? [repeat.regionX, repeat.regionY, repeat.landing.wx, repeat.landing.wy] : repeat,
        first: [res.regionX, res.regionY, res.landing.wx, res.landing.wy]});
    out('NOTE ' + label + 'npc ids ' + (JSON.stringify(finderNpcIds) === JSON.stringify(walkNpcIds) ? 'equal' : 'differ') +
      ' (runtime identity, excluded); assemblies ' + JSON.stringify(assemblies[seed]) + '; ' + res.message);
  });
  if (SEEDS.length === ALL_SEEDS.length) check('the six seeds reach every structure type (fortress, arena, watchtower)',
    !!types.fortress && !!types.arena && !!types.watchtower, types);
  // The finder centres the window on the landing chunk itself and validates
  // the cell there; its trailing updateChunks() must find nothing to re-centre.
  var recentred = Object.keys(assemblies).filter(function (s) { return assemblies[s].finder === 2; });
  check('updateChunks() inside the finder assembles nothing: the landing is validated in the final window (' +
    recentred.length + ' seed(s) needed the second assembly)',
    recentred.length >= 1 && Object.keys(assemblies).every(function (s) { return assemblies[s].insideUpdateChunks === 0; }), assemblies);

  // Authored fixtures on one landed cell: each guard rejects its hazard and
  // the cell is accepted again once the hazard is removed.
  if (!flag('--skip-fixtures')) {
    fresh(12345);
    var fres = G.goToNearestLandmark(), mesh = G.floorMesh;
    var fgx = Math.floor(G.pos.x / G.cell), fgy = Math.floor(G.pos.y / G.cell);
    var fxc = (fgx + 0.5) * G.cell, fyc = (fgy + 0.5) * G.cell, fi = fgy * mesh.w + fgx;
    var fli = G.getTopWalkableLayerIdx(fgx, fgy), fh = G.meshLayerHeight(mesh, fi, fli);
    function accepted() { return G.landmarkLandingCell(fgx, fgy) !== null; }
    var baseline = fres.ok && accepted();
    function fixture(name, cases) {
      var rows = [];
      cases.forEach(function (c) {
        c.apply(); var got = accepted(); c.undo(); var back = accepted();
        rows.push({hazard: c.what, accepted: got, want: c.accept, restored: back});
      });
      check('fixture: ' + name, baseline && rows.length === cases.length && rows.length > 0 &&
        rows.every(function (r) { return r.accepted === r.want && r.restored; }),
        {baseline: baseline, cases: cases.length, rows: rows.filter(function (r) { return r.accepted !== r.want || !r.restored; })});
    }
    function withPushed(list, item) { return {apply: function () { list.push(item); }, undo: function () { list.splice(list.indexOf(item), 1); }}; }
    function enemyAt(d) { return {x: fxc + d, y: fyc, health: 4, maxHealth: 4, speed: 35}; }
    function spawnerAt(d, extra) { return Object.assign({x: fxc + d, y: fyc, active: true, hp: 5, maxHp: 5, spawnCount: 0}, extra || {}); }
    function mark(what, accept, pair) { pair.what = what; pair.accept = accept; return pair; }
    function setArray(arr, index, value) {
      var old;
      return {apply: function () { old = arr[index]; arr[index] = value; }, undo: function () { arr[index] = old; }};
    }
    fixture('an enemy within 36 u rejects the cell; one 40 u away does not', [
      mark('enemy 20 u', false, withPushed(G.enemies, enemyAt(20))),
      mark('enemy 40 u', true, withPushed(G.enemies, enemyAt(40)))]);
    fixture('a live spawner within waking range (300 u + margin) rejects the cell; a far, destroyed or inactive one does not', [
      mark('live spawner 330 u', false, withPushed(G.enemySpawners, spawnerAt(330))),
      mark('live spawner 350 u', true, withPushed(G.enemySpawners, spawnerAt(350))),
      mark('destroyed spawner 100 u', true, withPushed(G.enemySpawners, spawnerAt(100, {hp: 0}))),
      mark('inactive spawner 100 u', true, withPushed(G.enemySpawners, spawnerAt(100, {active: false})))]);
    var roofLayer = mesh.layerCount[fi];
    fixture('a cave roof over the surface rejects the cell (layer ' + roofLayer + ' of 5)', roofLayer < 5 ? [
      mark('ceiling 3 above the floor', false, {apply: function () {
        mesh['l' + roofLayer + 'Type'][fi] = 2; mesh['l' + roofLayer + 'TopZ'][fi] = fh + 3; mesh.layerCount[fi] = roofLayer + 1;
      }, undo: function () { mesh.layerCount[fi] = roofLayer; mesh['l' + roofLayer + 'Type'][fi] = 0; mesh['l' + roofLayer + 'TopZ'][fi] = 0; }})] : []);
    var nIdx = fgy * mesh.w + fgx + 1, nLi = G.getTopWalkableLayerIdx(fgx + 1, fgy), nTop = mesh['l' + nLi + 'TopZ'];
    fixture('a neighbour 0.5 higher (a slope) rejects the cell; 0.2 higher does not', nLi >= 0 ? [
      mark('neighbour +0.5', false, setArray(nTop, nIdx, nTop[nIdx] + 0.5)),
      mark('neighbour +0.2', true, setArray(nTop, nIdx, nTop[nIdx] + 0.2))] : []);
    fixture('water in the cell rejects it', mesh.water ? [mark('water', false, setArray(mesh.water, fi, 1))] : []);
    fixture('a cave entrance reserve on the cell rejects it', [
      mark('entrance', false, withPushed(G.deepCaveEntrances, {x: fxc, y: fyc, angle: 0, cosA: 1, sinA: 0}))]);
    fixture('a market stall within 48 u rejects the cell', [
      mark('stall 40 u', false, withPushed(G.marketStalls, {x: fxc + 40, y: fyc, facing: 0, type: 'weapons'}))]);
    fixture('a solid cell two cells away rejects the cell', [
      mark('wall 24 u', false, setArray(G.grid, fgy * G.gridW + fgx + 2, 1))]);
  }

  // Region rule against generated region-centre chunks (the finder's input).
  if (!flag('--skip-sweep')) {
  var ruleOk = true, ruleDetail = [], present = 0, R = 5;
  ALL_SEEDS.forEach(function (seed) {   // always the six seeds, even in a narrowed run
    fresh(seed);
    var predicted = {};
    for (var ry = -R; ry <= R; ry++) for (var rx = -R; rx <= R; rx++) predicted[rx + ',' + ry] = G.landmarkRegionStructure(rx, ry);
    for (var ry2 = -R; ry2 <= R; ry2++) for (var rx2 = -R; rx2 <= R; rx2++) {
      var p = predicted[rx2 + ',' + ry2], chunk = G.generateChunk(rx2 * 3 + 1, ry2 * 3 + 1), s = chunk.structure;
      var own = !!(s && s.regionX === rx2 && s.regionY === ry2);
      var neighbour = false;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if ((dx || dy) && predicted[(rx2 + dx) + ',' + (ry2 + dy)]) neighbour = true;
      var ok = p ? (own ? s.type === p.type && Math.abs(s.scale - p.scale) < 1e-12 : !!s && neighbour) : !own;
      if (p) present++;
      if (!ok && ruleDetail.length < 4) ruleDetail.push({seed: seed, region: [rx2, ry2], predicted: p && p.type, generated: s && [s.type, s.regionX, s.regionY]});
      ruleOk = ruleOk && ok;
    }
  });
  check('the finder region rule matches generated region-centre chunks (6 seeds, regions -5..5)', ruleOk && present >= 6,
    {present: present, mismatches: ruleDetail});
  }

  // Filter, cycle, refusal and restore paths.
  if (!flag('--skip-extras')) {
  fresh(424242);
  var arena = G.goToNearestLandmark({type: 'arena'}), again = G.goToNearestLandmark({type: 'arena'});
  check('a type filter and a second press go to different landmarks of that type',
    arena.ok && again.ok && arena.type === 'arena' && again.type === 'arena' &&
    (arena.regionX !== again.regionX || arena.regionY !== again.regionY), [arena.regionX, arena.regionY, again.regionX, again.regionY]);
  // A landmark that cannot be reached (here: its structure is hidden from the
  // finder) is skipped by the next press instead of retried.
  fresh(424242);
  var nearest = G.findNearestLandmarkRegion(G.pos.x + G.windowOriginX, G.pos.y + G.windowOriginY, {});
  var realFind = G.landmarkInWindow;
  G.landmarkInWindow = function (t) { return t.regionX === nearest.regionX && t.regionY === nearest.regionY ? null : realFind(t); };
  var blockedPress = G.goToNearestLandmark(), nextPress = G.goToNearestLandmark();
  G.landmarkInWindow = realFind;
  check('an unreachable landmark is skipped by the next press',
    !!nearest && !blockedPress.ok && blockedPress.target && blockedPress.target.regionX === nearest.regionX && blockedPress.target.regionY === nearest.regionY &&
    nextPress.ok && (nextPress.regionX !== nearest.regionX || nextPress.regionY !== nearest.regionY),
    {nearest: nearest && [nearest.regionX, nearest.regionY], first: blockedPress.reason, next: nextPress.ok ? [nextPress.regionX, nextPress.regionY] : nextPress.reason});
  // Fault injection: the chosen cell is vetoed when re-validated after the
  // re-centre (no sampled seed reaches this branch naturally), so the finder
  // must choose again inside the new centre chunk, against the first
  // window's footprint hull, without a further re-centre.
  fresh(12345);
  var realChoose = G.chooseLandmarkLanding, realCell = G.landmarkLandingCell;
  var choosing = 0, vetoed = null, rechosen = 0;
  G.chooseLandmarkLanding = function (st, a, bounds) {
    choosing++; if (bounds) rechosen++;
    try { return realChoose.apply(null, arguments); } finally { choosing--; }
  };
  G.landmarkLandingCell = function (gx, gy) {
    if (!choosing && !vetoed && assembled >= 2) vetoed = [gx, gy];   // the re-validation call
    if (vetoed && gx === vetoed[0] && gy === vetoed[1]) return null;
    return realCell(gx, gy);
  };
  assembled = 0; assembledInUpdate = 0;
  var veto = G.goToNearestLandmark();
  G.chooseLandmarkLanding = realChoose; G.landmarkLandingCell = realCell;
  var vst = veto.ok ? G.landmarkInWindow(veto) : null, vHalf = Math.floor(G.WINDOW_CHUNKS / 2);
  var vgx = Math.floor(G.pos.x / G.cell), vgy = Math.floor(G.pos.y / G.cell);
  var vChunk = [Math.floor((G.pos.x + G.windowOriginX) / G.CHUNK_SIZE), Math.floor((G.pos.y + G.windowOriginY) / G.CHUNK_SIZE)];
  var vFace = vst ? structureFaceDistance(vst) : null;
  check('a cell vetoed after the re-centre is replaced by another in the centre chunk, outside the footprint, without another re-centre',
    veto.ok && !!vetoed && rechosen === 1 && (vgx !== vetoed[0] || vgy !== vetoed[1]) && G.grid[vgy * G.gridW + vgx] === 0 &&
    vChunk[0] === G.windowCX + vHalf && vChunk[1] === G.windowCY + vHalf && assembledInUpdate === 0 &&
    !!vst && !enclosedByStructure(vst) && vFace >= 40 && vFace <= G.viewDist,
    {res: veto.ok ? veto.message : veto.reason, vetoed: vetoed, landed: [vgx, vgy], rechosen: rechosen, chunk: vChunk,
      window: [G.windowCX, G.windowCY], insideUpdateChunks: assembledInUpdate, face: vFace});
  fresh(2024);
  var before = {x: G.pos.x + G.windowOriginX, y: G.pos.y + G.windowOriginY, z: G.pos.floorZ, ang: G.cam.ang, win: [G.windowCX, G.windowCY]};
  var realInWindow = G.landmarkInWindow;
  G.landmarkInWindow = function () { return null; };
  var refused = G.goToNearestLandmark();
  G.landmarkInWindow = realInWindow;
  check('a failed landing returns the player to the starting window, position, height and heading',
    !refused.ok && /generator placed no structure/.test(refused.reason) && G.windowCX === before.win[0] && G.windowCY === before.win[1] &&
    Math.abs(G.pos.x + G.windowOriginX - before.x) < 1e-9 && Math.abs(G.pos.y + G.windowOriginY - before.y) < 1e-9 &&
    G.pos.floorZ === before.z && G.cam.ang === before.ang, refused);
  G.shopOpen = true; var shop = G.goToNearestLandmark(); G.shopOpen = false;
  G.ENDLESS_MODE = false; var notEndless = G.goToNearestLandmark(); G.ENDLESS_MODE = true;
  check('the finder refuses with a reason in an open panel or outside Endless, without moving',
    !shop.ok && /Close the open panel/.test(shop.reason) && !notEndless.ok && /Start Endless Mode/.test(notEndless.reason) &&
    Math.abs(G.pos.x + G.windowOriginX - before.x) < 1e-9);
  }
  }

  // Seed sweep (TESTING.md: fixed seeds plus a separate sweep that keeps its
  // failures). Default: the default search on seeds 1-40, plus the preserved
  // failures of earlier finder versions: 1, 22, 27 and 30 (spawner waking
  // range; inside 1-40), 87 (a wolf within four seconds), 96 arena (a landing
  // inside the ring through a gate) and 37 watchtower (no calm cell: must be
  // reported unsafe). Every landing must meet the static oracles; the quiet
  // oracle (240 ticks, the finder's four-second enemy margin: no damage, push,
  // fall, spawner wake-up or re-centre) is excused only for a landing the
  // finder reports unsafe.
  if (flag('--sweep')) {
    var cases = [];
    if (option('--cases')) {
      option('--cases').split(',').forEach(function (c) { var p = c.split(':'); cases.push({seed: Number(p[0]), type: p[1]}); });
    } else {
      for (var sd = 1; sd <= 40; sd++) cases.push({seed: sd});
      cases.push({seed: 87}, {seed: 96, type: 'arena'}, {seed: 37, type: 'watchtower'});
    }
    var defaultUnsafe = [], reportedUnsafe = [], defaultCases = 0, TICKS = Number(option('--ticks') || 240);
    cases.forEach(function (c) {
      var label = 'sweep seed ' + c.seed + ' ' + (c.type || 'any') + ': ';
      if (!c.type) defaultCases++;
      fresh(c.seed);
      G.vel.x = 120; G.vel.y = 30; G.jumpAirborne = true; G.jumpVelZ = 5;   // leftover motion
      assembled = 0;
      var res = G.goToNearestLandmark({type: c.type}), problems = [], trace = null;
      var st = res.ok ? G.landmarkInWindow(res) : null;
      if (!res.ok || !st) problems.push('no landing: ' + (res.reason || 'structure missing'));
      else {
        var gx = Math.floor(G.pos.x / G.cell), gy = Math.floor(G.pos.y / G.cell), i = gy * G.gridW + gx;
        var feetH = (G.pos.floorZ - 60) / 40, support = G.getWalkableLayerTopAt(G.pos.x, G.pos.y, feetH);
        var half = Math.floor(G.WINDOW_CHUNKS / 2);
        var chunkX = Math.floor((G.pos.x + G.windowOriginX) / G.CHUNK_SIZE), chunkY = Math.floor((G.pos.y + G.windowOriginY) / G.CHUNK_SIZE);
        if (G.grid[i] !== 0 || !bodyClear(G.pos.x, G.pos.y, G.spatialPlayerBody().radius)) problems.push('in or against a wall');
        if (support.action !== 'walk' || Math.abs(support.topH - feetH) > 1e-6) problems.push('support ' + JSON.stringify(support));
        if (G.getCaveSpaceAt(G.pos.x, G.pos.y, feetH).underground) problems.push('under a roof');
        if (G.floorMesh.water && G.floorMesh.water[G.meshCellAt(G.pos.x, G.pos.y)]) problems.push('water');
        if (chunkX !== G.windowCX + half || chunkY !== G.windowCY + half) problems.push('window not centred');
        if (G.vel.x || G.vel.y || G.jumpAirborne || G.jumpVelZ) problems.push('still moving');
        if (enclosedByStructure(st)) problems.push('enclosed by the structure');
        var faceDist = structureFaceDistance(st);
        if (!(faceDist <= G.viewDist)) problems.push('structure face ' + Math.round(faceDist) + ' u > viewDist');
        var z0 = G.pos.floorZ, x0 = G.pos.x, y0 = G.pos.y, h0 = G.health, dmg0 = G.stats.totalDamageTaken, spawns0 = spawnTotal();
        var win0 = [G.windowCX, G.windowCY], worst = 0, air = false, under = false;
        for (var t = 0; t < TICKS; t++) {
          G.runSimulationTick(1 / 60);
          worst = Math.max(worst, Math.abs(G.pos.floorZ - z0)); air = air || G.jumpAirborne; under = under || G.playerUnderground;
          if (!trace && (G.health < h0 || Math.hypot(G.pos.x - x0, G.pos.y - y0) > 0.5 || spawnTotal() !== spawns0)) {
            var near = G.enemies.map(function (e) {
              return {d: Math.round(Math.hypot(e.x - G.pos.x, e.y - G.pos.y)), type: e.enemyType && e.enemyType.id, state: e.attackState, spawned: !!e.fromSpawner};
            }).sort(function (a, b) { return a.d - b.d; }).slice(0, 2);
            trace = {tick: t, health: [h0, G.health], moved: Math.round(Math.hypot(G.pos.x - x0, G.pos.y - y0) * 100) / 100, spawns: spawnTotal() - spawns0, nearest: near};
          }
        }
        var noisy = [];
        if (worst > 0.5) noisy.push('floor drift ' + worst.toFixed(2));
        if (air) noisy.push('airborne');
        if (under) noisy.push('underground');
        if (Math.hypot(G.pos.x - x0, G.pos.y - y0) > 0.5) noisy.push('pushed ' + Math.hypot(G.pos.x - x0, G.pos.y - y0).toFixed(2) + ' u');
        if (G.health < h0 || G.stats.totalDamageTaken !== dmg0) noisy.push('damage ' + (G.stats.totalDamageTaken - dmg0).toFixed(2));
        if (spawnTotal() !== spawns0) noisy.push('a spawner woke');
        if (G.windowCX !== win0[0] || G.windowCY !== win0[1]) noisy.push('window re-centred');
        if (res.safe === false) {
          reportedUnsafe.push(c.seed + ':' + (c.type || 'any'));
          if (!c.type) defaultUnsafe.push(c.seed);
          if (!/enemy can reach you/.test(res.message)) problems.push('unsafe landing without the warning');
        } else if (noisy.length) problems.push('reported safe but ' + noisy.join(', '));
      }
      check(label + 'lands outside the footprint on open support, quiet for ' + TICKS + ' ticks unless reported unsafe', !problems.length,
        {problems: problems, region: res.ok ? [res.regionX, res.regionY] : null, landing: res.ok ? [Math.round(res.landing.wx), Math.round(res.landing.wy)] : null,
          type: res.type, gap: res.ok ? Math.round(res.gap) : null, enemySeconds: res.ok ? res.enemySeconds : null, trace: trace});
      if (!problems.length && res.ok) out('NOTE ' + label + (res.safe ? 'safe' : 'reported unsafe') + '; ' + res.message);
    });
    // Rates: the default search must report every landing safe (so the quiet
    // oracle above covers it), and the preserved no-calm-cell case must take
    // the warning path.
    if (defaultCases) check('sweep: every default-search landing is reported safe (' + defaultCases + ' cases)',
      defaultUnsafe.length === 0, defaultUnsafe);
    if (cases.some(function (c) { return c.seed === 37 && c.type === 'watchtower'; }))
      check('sweep: the no-calm-cell regression (37 watchtower) is reported unsafe', reportedUnsafe.indexOf('37:watchtower') >= 0, reportedUnsafe);
    out('NOTE sweep reported unsafe: ' + JSON.stringify(reportedUnsafe));
  }
  check('no console errors', H.errors.length === 0, H.errors.slice(0, 3));
  out('LANDMARK_FINDER_RESULT ' + (failed ? 'FAIL ' : 'PASS ') + checked + ' failed ' + failed);
}());
undefined;
