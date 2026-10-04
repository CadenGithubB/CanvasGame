// Floor cell buffer (audit D25) through the real MAIN manifest (render_host.js).
// Risk: drawLayersFloor3D packs one [distSq, x, y] triple per collected floor
// cell into _drawFloorCellBuf, then sorts and draws them. With a fixed
// 40,000-cell buffer the classic Expanse (Level 4: 2304 u view, 360x240 mesh)
// collected up to 46,596 cells; typed-array writes past the end are dropped
// without an error, and since the scan runs row by row the lost cells were the
// last rows scanned, not the farthest. Looking down, the whole screen lost its
// floor; looking level with the dash FOV, the ground in front of the player.
// Oracles, independent of the buffer under test:
//   reference  the same pass, evaluated from the unmutated source under
//              another name, given a NaN-filled buffer as large as the whole
//              mesh (it cannot fill): the cells it stores (demand, checked
//              against the shipped pass's own cull counters), the floor quads
//              it projects, in order, and the scene depth it draws from the
//              same input depth;
//   analytic   80 degrees down at single-layer ground under open sky with the
//              horizon above the canvas, every canvas pixel is ground.
// Fixtures: real Level 4 poses (seed 9127+4, the goal check's resetLevel),
// each wanting more than 40,000 cells; the first is the level's first 3D
// frame. Scene depth after the real floor pass, not browser pixels or timing.
// Checks print PASS/FAIL and keep going, so a mutation names what it broke.
// Mutations (evaluated copies only; each anchor must match exactly once):
//   --fixed-capacity       no growth: the fixed 40,000-cell buffer of 01
//   --stale-local          the pass reads the buffer before growing it, so the
//                          frame that grows it still writes the old one
//   --realloc-every-frame  the pass allocates a new buffer on every frame
// --sweep (opt-in, slow) adds a Level 4 pose sweep at two seeds: 25 positions
// x 16 headings x pitch 0/0.6/1.2/1.4 x base/dash FOV, quads vs reference.
(function () {
  (0, eval)(slurp('tools/game/tests/render_host.js'));
  var H = createRenderTestHost(), G = H.G, out = H.output, checked = 0, failed = 0;
  function check(name, ok, detail) {
    checked++; if (!ok) failed++;
    out((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + JSON.stringify(detail === undefined ? null : detail).slice(0, 2000)));
  }
  function flag(name) { return __argv.indexOf(name) >= 0; }
  function swap(source, name, before, after) {
    if (!flag(name)) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + name);
    return source.replace(before, after);
  }
  var FLOOR = 'src/13-render-floors-ceilings.js', pristine = null;
  var GROW = '  if (_drawFloorCellBuf.length < _scanCells * 3) {\n';
  var GROW_BLOCK = GROW + '    var _scanSpan = Math.ceil(2 * viewRad) + 2;\n' +
    '    _drawFloorCellBuf = new Float32Array(3 * Math.max(_scanCells,\n' +
    '      Math.min(_scanSpan, mesh.w - 1) * Math.min(_scanSpan, mesh.h - 1)));\n  }\n';
  var READ = '  var _cellBuf = _drawFloorCellBuf;\n';
  var loaded = H.loadManifest(function (path, source) {
    if (path !== FLOOR) return source;
    pristine = source;
    source = swap(source, '--fixed-capacity', GROW_BLOCK, '');
    source = swap(source, '--stale-local', '  var _scanCells = ', READ + '  var _scanCells = ');
    source = swap(source, '--stale-local', GROW_BLOCK + READ, GROW_BLOCK);
    return swap(source, '--realloc-every-frame', GROW, '  if (true) {\n');
  });
  // The reference pass: drawLayersFloor3D from the unmutated source, renamed.
  var HEAD = 'function drawLayersFloor3D() {\n', start = pristine ? pristine.indexOf(HEAD) : -1;
  var end = start >= 0 ? pristine.indexOf('\n}\n', start) : -1;
  if (start < 0 || end < 0 || pristine.split(HEAD).length !== 2) throw Error('SETUP floor pass source boundary missing');
  (0, eval)(pristine.slice(start, end + 3).replace(HEAD, 'function __floorCellReferencePass() {\n'));
  check('real manifest loads, with a reference copy of the floor pass, and no console errors',
    loaded > 40 && typeof G.drawLayersFloor3D === 'function' && typeof G.__floorCellReferencePass === 'function' &&
    H.errors.length === 0, {loaded: loaded, errors: H.errors.slice(0, 3)});

  // ── Start paths and poses ──
  function seedRandom(seed) {
    var s = seed >>> 0;
    Math.random = function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  function quiet() {
    G.running = true; G.gameOverState = G.menuOpen = G.settingsOpen = G.shopOpen = false;
    G.inventoryOpen = G.forgeOpen = G.overviewActive = false; G.calibrating = false;
    G.USE_KEYBOARD = G.USE_MOUSE = true; G.USE_GAMEPAD = false;
  }
  // classic_floor_render.js's start: Start for level 1, the goal check's
  // resetLevel for later levels, 3D on, noon, day/night frozen.
  function startClassic(lv, seed) {
    seedRandom(seed); quiet();
    G.CAVE_TEST_MODE = G.ENDLESS_MODE = false; G.terrain = 'ground'; G.MODE3D = true;
    if (lv === 1) G.startGame(); else G.resetLevel(lv);
    G.MODE3D = true; G.CAM_FOLLOW = true; G.settings.dayNight = true; G.dayTime = 0.5; G.daySpeed = 0; quiet();
  }
  var baseFov = G.GAME_CONFIG.player.baseFov, dashPunch = G.GAME_CONFIG.player.dashFovPunch;
  // Stand on the top walkable layer at (x, y) and look along ang, pitched.
  function view(f) {
    G.pos.x = f.x; G.pos.y = f.y; if (G.vel) { G.vel.x = 0; G.vel.y = 0; }
    G.settlePlayerAtSpawn(true);
    G.cam.ang = f.ang; G.cam.pitch = G.pos.pitch = f.pitch;
    G.dashFovPunch = f.dash ? 1 : 0; G.cam.fov = baseFov + (f.dash ? dashPunch : 0);
  }

  // ── The floor stage of one real frame: shipped pass vs reference ──
  var shippedPass = G.drawLayersFloor3D, realProject = G.projectSceneWorldPolygon;
  var probe = null, passes = 0, unconstrained = null;
  // A floor quad's vertex 0 is its cell's own (x*gs, y*gs) corner.
  function traced(fn) {
    var m = G.floorMesh, gs = m.gridSize, mw = m.w, keys = [];
    G.projectSceneWorldPolygon = function (vertices, C) {
      keys.push(Math.round(vertices[0].y / gs) * mw + Math.round(vertices[0].x / gs));
      return realProject(vertices, C);
    };
    try { fn(); } finally { G.projectSceneWorldPolygon = realProject; }
    return keys;
  }
  function countStored(b) { var n = 0; for (var i = 1; i < b.length; i += 3) if (b[i] === b[i]) n++; return n; }
  var STATS = ['floorTotal', 'floorDistCull', 'floorFovCull', 'floorBehind', 'floorBlendRange', 'floorOutsideBlend'];
  // Both passes from the same input depth. The rest of the frame continues
  // from the shipped pass's depth, buffer and counters.
  function measure(self, args) {
    var m = G.floorMesh, st = G.__caveStats, n = G._sceneDepthW * G._sceneDepthH, r = {};
    var before = new Float32Array(G._sceneDepthInv.subarray(0, n)), bufBefore = G._drawFloorCellBuf;
    var shipKeys = traced(function () { shippedPass.apply(self, args); });
    var shipped = new Float32Array(G._sceneDepthInv.subarray(0, n)), live = G._drawFloorCellBuf;
    var stats = STATS.map(function (k) { return st[k]; });
    r.counters = st.floorTotal - st.floorDistCull - st.floorBehind - st.floorFovCull;
    r.grew = live !== bufBefore; r.capacity = live.length / 3;
    if (!unconstrained || unconstrained.length < m.w * m.h * 3) unconstrained = new Float32Array(m.w * m.h * 3);
    unconstrained.fill(NaN);
    G._sceneDepthInv.set(before); G._drawFloorCellBuf = unconstrained;
    var refKeys;
    try { refKeys = traced(G.__floorCellReferencePass); } finally {
      r.refKeptBuffer = G._drawFloorCellBuf === unconstrained; G._drawFloorCellBuf = live;
    }
    r.demand = countStored(unconstrained);
    var ref = G._sceneDepthInv;
    r.px = n; r.floorlessShipped = 0; r.floorlessRef = 0; r.lostPx = 0; r.differentPx = 0;
    for (var i = 0; i < n; i++) {
      var a = shipped[i], b = ref[i];
      if (!(a > 0)) r.floorlessShipped++;
      if (!(b > 0)) r.floorlessRef++;
      if (b > 0 && !(a > 0)) r.lostPx++;
      if (a !== b) r.differentPx++;
    }
    var gs = m.gridSize, left = {}, nearest = Infinity;
    r.missingQuads = 0; r.extraQuads = 0;
    shipKeys.forEach(function (k) { left[k] = (left[k] || 0) + 1; });
    refKeys.forEach(function (k) {
      if (left[k]) { left[k]--; return; }
      r.missingQuads++;
      var d = Math.hypot((k % m.w + 0.5) * gs - G.cam.x, (Math.floor(k / m.w) + 0.5) * gs - G.cam.y);
      if (d < nearest) nearest = d;
    });
    Object.keys(left).forEach(function (k) { r.extraQuads += left[k]; });
    r.nearestMissing = isFinite(nearest) ? Math.round(nearest) : null;
    r.shipQuads = shipKeys.length; r.refQuads = refKeys.length;
    r.sameOrder = shipKeys.length === refKeys.length;
    for (var q = 0; r.sameOrder && q < refKeys.length; q++) if (shipKeys[q] !== refKeys[q]) r.sameOrder = false;
    G._sceneDepthInv.set(shipped);
    STATS.forEach(function (k, j) { st[k] = stats[j]; });
    r.horizonY = G.getCam3D().horizonY;
    return r;
  }
  G.drawLayersFloor3D = function () {
    passes++;
    var p = probe;
    if (!p || p.calls++) return shippedPass.apply(this, arguments);
    p.r = measure(this, arguments);
  };
  function ptTotals() { var t = {}; Object.keys(G._ptErrors || {}).forEach(function (k) { t[k] = G._ptErrors[k]; }); return t; }
  function ptDelta(before) {
    var d = {}, any = false;
    Object.keys(G._ptErrors || {}).forEach(function (k) { var v = G._ptErrors[k] - (before[k] || 0); if (v) { d[k] = v; any = true; } });
    return any ? d : null;
  }
  // One real renderFrame at fixture f, measured in its floor stage.
  function frame(f) {
    view(f);
    var m = G.floorMesh, gs = m.gridSize, ci = Math.floor(f.y / gs) * m.w + Math.floor(f.x / gs);
    var pt = ptTotals(), logged = H.errors.length;
    probe = {calls: 0, r: null};
    try { G.renderFrame(); } finally { var p = probe; probe = null; }
    var r = p.r || {};
    r.name = f.name; r.floorPasses = p.calls; r.crashes = ptDelta(pt); r.errors = H.errors.slice(logged, logged + 2);
    r.inWall = G.isInGridWall(f.x, f.y, 8); r.layers = m.layerCount[ci]; r.ceilAbove = m.ceilAboveMask[ci];
    return r;
  }

  // ── Level 4 fixtures (each wants more than 40,000 cells) ──
  var PI = Math.PI;
  var FIXTURES = [
    {name: 'open ground 80 deg down, dash FOV, first 3D frame', x: 1500, y: 2100, ang: 5.1051, pitch: 1.4, dash: 1},
    {name: 'level view north from the south edge, dash FOV', x: 2160, y: 2400, ang: 3 * PI / 2, pitch: 0, dash: 1},
    {name: 'reported pose, 80 deg down', x: 2160, y: 2730, ang: 3 * PI / 2, pitch: 1.4, dash: 0},
    {name: 'widest view, 80 deg down, dash FOV', x: 2220, y: 450, ang: PI / 2, pitch: 1.4, dash: 1}
  ];
  var CAP = 40000;
  startClassic(4, 9127 + 4);
  var world = {terrain: G.terrain, worldW: G.worldW, worldH: G.worldH, viewDist: G.viewDist,
    mesh: G.floorMesh ? [G.floorMesh.w, G.floorMesh.h, G.floorMesh.gridSize] : null, layered: !!(G.floorMesh && G.floorMesh.layerCount),
    startCapacity: G._drawFloorCellBuf.length / 3};
  check('setup: the classic Expanse (Level 4) has a 2304 u view over a 360x240 layered mesh',
    world.terrain === 'expanse' && world.worldW === 4320 && world.worldH === 2880 && world.viewDist === 2304 &&
    world.layered && String(world.mesh) === '360,240,12', world);
  var passesBefore = passes;
  var results = FIXTURES.map(frame);
  var r0 = results[0];
  check('setup: every fixture wants more than 40,000 floor cells (reference store = the pass\'s own cull counters)',
    results.every(function (r) { return r.refKeptBuffer && r.demand > CAP && r.demand === r.counters; }),
    results.map(function (r) { return {name: r.name, demand: r.demand, counters: r.counters, refKeptBuffer: r.refKeptBuffer}; }));
  check('setup: every fixture frame runs the floor pass once, outside walls, with no render crash or console error',
    results.every(function (r) { return r.floorPasses === 1 && !r.crashes && !r.errors.length && !r.inWall; }),
    results.map(function (r) { return {name: r.name, floorPasses: r.floorPasses, crashes: r.crashes, errors: r.errors, inWall: r.inWall}; }));
  check('setup: the first fixture is the level\'s first floor pass, looks down at single-layer ground under open sky ' +
    '(horizon above the canvas) and the reference floors every pixel',
    passesBefore === 0 && r0.horizonY < 0 && r0.layers === 1 && r0.ceilAbove === 0 && r0.floorlessRef === 0,
    {passesBefore: passesBefore, horizonY: r0.horizonY, layers: r0.layers, ceilAbove: r0.ceilAbove, floorlessRef: r0.floorlessRef});

  check('Level 4 draws every floor quad the unconstrained reference draws, in the same order, at every fixture',
    results.every(function (r) { return r.missingQuads === 0 && r.extraQuads === 0 && r.sameOrder; }),
    results.map(function (r) {
      return {name: r.name, demand: r.demand, capacity: r.capacity, shipQuads: r.shipQuads, refQuads: r.refQuads,
        missingQuads: r.missingQuads, nearestMissing: r.nearestMissing, extraQuads: r.extraQuads, sameOrder: r.sameOrder};
    }));
  check('looking 80 deg down at open ground in the level\'s first 3D frame, every canvas pixel has floor depth',
    r0.floorlessShipped === 0, {name: r0.name, px: r0.px, floorlessShipped: r0.floorlessShipped, demand: r0.demand, capacity: r0.capacity});
  check('Level 4 floor depth equals the unconstrained reference at every fixture (no near ground lost)',
    results.every(function (r) { return r.lostPx === 0 && r.differentPx === 0; }),
    results.map(function (r) {
      return {name: r.name, px: r.px, lostPx: r.lostPx, differentPx: r.differentPx, floorlessShipped: r.floorlessShipped,
        floorlessRef: r.floorlessRef};
    }));

  // ── Reuse: no allocation per frame once grown, and no shrink ──
  var grown = G._drawFloorCellBuf, reuse = [];
  FIXTURES.forEach(function (f) {
    [0, PI / 2, PI, 3 * PI / 2].forEach(function (ang) {
      view({x: f.x, y: f.y, ang: ang, pitch: f.pitch, dash: f.dash}); G.renderFrame();
      reuse.push(G._drawFloorCellBuf === grown);
    });
  });
  startClassic(2, 9127 + 2);
  view({x: G.worldW / 2, y: G.worldH / 2, ang: 0, pitch: 0.6, dash: 0}); G.renderFrame();
  var keptOnSmaller = G._drawFloorCellBuf === grown, smallerView = G.viewDist;
  startClassic(4, 9127 + 4);
  view(FIXTURES[0]); G.renderFrame();
  var keptOnReturn = G._drawFloorCellBuf === grown;
  check('the grown buffer is reused: 16 more Level 4 frames, a Level 2 frame and Level 4 again allocate no new buffer',
    reuse.every(Boolean) && keptOnSmaller && keptOnReturn,
    {reusedFrames: reuse.filter(Boolean).length + '/' + reuse.length, keptOnSmaller: keptOnSmaller, keptOnReturn: keptOnReturn,
      capacity: grown.length / 3, level2ViewDist: smallerView});

  out('NOTE ' + JSON.stringify({startCapacity: world.startCapacity, capacity: grown.length / 3,
    fixtures: results.map(function (r) {
      return [r.name, 'demand ' + r.demand, 'quads ' + r.shipQuads + '/' + r.refQuads, 'floorless ' + r.floorlessShipped + '/' + r.floorlessRef];
    })}));

  // ── Opt-in sweep: every pose's quads against the reference ──
  if (flag('--sweep')) {
    var sweep = {poses: 0, overCap: 0, maxDemand: 0, maxCapacity: 0, badPoses: 0, bad: [], seeds: []};
    [9127 + 4, 20261004].forEach(function (seed) {
      startClassic(4, seed);
      G.renderFrame();
      sweep.seeds.push(seed);
      var W = G.worldW, HH = G.worldH, spots = [];
      [1, 3, 5, 7].forEach(function (fy) { [1, 3, 5, 7].forEach(function (fx) { spots.push([W * fx / 8, HH * fy / 8]); }); });
      [1, 3, 5].forEach(function (fy) { [1, 3, 5].forEach(function (fx) { spots.push([W * fx / 6, HH * fy / 6]); }); });
      spots.forEach(function (s) {
        for (var hi = 0; hi < 16; hi++) [0, 0.6, 1.2, 1.4].forEach(function (pitch) { [0, 1].forEach(function (dash) {
          view({x: Math.round(s[0]), y: Math.round(s[1]), ang: hi * PI / 8, pitch: pitch, dash: dash});
          var r = measure(null, []);
          sweep.poses++;
          if (r.demand > CAP) sweep.overCap++;
          sweep.maxDemand = Math.max(sweep.maxDemand, r.demand); sweep.maxCapacity = Math.max(sweep.maxCapacity, r.capacity);
          if (!(r.missingQuads || r.extraQuads || !r.sameOrder || r.demand !== r.counters || !r.refKeptBuffer)) return;
          if (sweep.badPoses++ < 5)
            sweep.bad.push({seed: seed, pos: [Math.round(s[0]), Math.round(s[1])], heading: hi + '/16', pitch: pitch, dash: dash,
              demand: r.demand, counters: r.counters, missingQuads: r.missingQuads, nearestMissing: r.nearestMissing, sameOrder: r.sameOrder});
        }); });
      });
    });
    out('NOTE sweep ' + JSON.stringify({poses: sweep.poses, overCap: sweep.overCap, maxDemand: sweep.maxDemand,
      maxCapacity: sweep.maxCapacity, badPoses: sweep.badPoses, seeds: sweep.seeds}));
    check('sweep: every Level 4 pose (2 seeds, 25 positions, 16 headings, 4 pitches, base/dash FOV) draws every reference quad in order',
      sweep.poses === 6400 && sweep.overCap > 0 && !sweep.badPoses, sweep);
  }

  out('FLOOR_CELL_BUFFER_RESULT ' + (failed ? 'FAIL ' + failed : 'PASS ' + checked));
}());
