// Classic (non-Endless) levels in 3D. The layered floor pass reads per-layer
// colours (lNColor) that only Endless chunks authored, so every classic 3D
// frame threw inside 'platforms3D' (V8: "Cannot read properties of undefined
// (reading '30132')"; JSC: "undefined is not an object: mesh.l0Color[idx0]").
// This loads the source manifest and drives the real Start button path, the
// level generator and renderFrame; the host supplies browser APIs only.
// Mutations are applied to slurped sources only (anchors match exactly once):
//   --skip-classic-layer-colors   --colors-before-water
// Mutation runs skip the Endless control and transition (SKIP lines); the
// classic levels and every prerequisite still run.
(function () {
  var G = (0, eval)('this'), checked = 0, failed = 0;
  var output = (__engine === 'node' || __engine === 'deno') ? console.log.bind(console) : __out;
  function has(flag) { return __argv.indexOf(flag) >= 0; }
  var mutationRun = __argv.some(function (a) { return /^--/.test(a); });
  function mutate(source, flag, before, after) {
    if (!has(flag)) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + flag);
    return source.replace(before, after);
  }
  var COLOURS_AFTER_WATER = '  generateWaterFeatures();\n  buildClassicFloorLayerColors(floorMesh);\n';
  G.__classicFloorSource = function (path, source) {
    if (path === 'src/03-level-generation.js') {
      source = mutate(source, '--skip-classic-layer-colors', COLOURS_AFTER_WATER, '  generateWaterFeatures();\n');
      source = mutate(source, '--colors-before-water', COLOURS_AFTER_WATER,
        '  buildClassicFloorLayerColors(floorMesh);\n  generateWaterFeatures();\n');
    }
    return source;
  };
  var host = slurp('tools/game/tests/cave_occlusion_integration.js');
  var end = host.indexOf('  function check(name, okay) {');
  if (end < 0) throw Error('SETUP classic floor browser host boundary missing');
  host = host.slice(0, end);
  var load = "manifest.parts.MAIN.forEach(function (path) { (0, eval)(slurp('assets/games/' + path)); });";
  if (host.split(load).length !== 2) throw Error('SETUP classic floor manifest boundary missing');
  host = host.replace(load, "manifest.parts.MAIN.forEach(function (path) { (0, eval)(G.__classicFloorSource(path, slurp('assets/games/' + path))); });");
  (0, eval)(host + 'G.__classicFloorErrors = errors; }());');
  var consoleErrors = G.__classicFloorErrors;

  function check(name, okay, detail) {
    checked++; if (!okay) failed++;
    output((okay ? 'PASS ' : 'FAIL ') + name + (okay ? '' : ' ' + JSON.stringify(detail === undefined ? null : detail)));
  }
  var currentSeed = 0;
  function seedRandom(seed) {
    var s = currentSeed = seed >>> 0;
    Math.random = function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  function quiet() {
    G.running = true; G.gameOverState = G.menuOpen = G.settingsOpen = G.shopOpen = false;
    G.inventoryOpen = G.forgeOpen = G.overviewActive = false;
    G.USE_KEYBOARD = G.USE_MOUSE = true; G.USE_GAMEPAD = false;
  }
  function fixDay() { G.settings.dayNight = true; G.dayTime = 0.5; G.daySpeed = 0; }
  // The Start button with the 3D view already selected (observation 1):
  // startGame() -> resetLevel(1) -> draw() in 3D. Later levels arrive through
  // the same resetLevel the goal check uses.
  function startClassic(lv) {
    seedRandom(9127 + lv); quiet();
    G.CAVE_TEST_MODE = G.ENDLESS_MODE = false; G.terrain = 'ground'; G.MODE3D = true;
    if (lv === 1) G.startGame(); else G.resetLevel(lv);
    G.MODE3D = true; G.CAM_FOLLOW = true; fixDay();
  }
  function startEndless() {
    seedRandom(424242); quiet();
    G.CAVE_TEST_MODE = false; G.ENDLESS_MODE = true; G.terrain = 'ground';
    G.resetEndlessMode();
    G.MODE3D = true; G.CAM_FOLLOW = true; fixDay();
  }
  // Every _pt stage's swallowed crashes, so a crash anywhere in the frame counts.
  function ptTotals() { var t = {}; Object.keys(G._ptErrors || {}).forEach(function (k) { t[k] = G._ptErrors[k]; }); return t; }
  function ptDelta(before) {
    var d = {};
    Object.keys(G._ptErrors || {}).forEach(function (k) { var n = G._ptErrors[k] - (before[k] || 0); if (n) d[k] = n; });
    return d;
  }
  // Counts the floor pass's own fills (the fixture must reach the colour read).
  var floorPass = G.drawLayersFloor3D, inFloor = false, floorFills = 0;
  G.drawLayersFloor3D = function () {
    inFloor = true;
    try { return floorPass.apply(this, arguments); } finally { inFloor = false; }
  };
  var ctxFill = G.ctx.fill;
  G.ctx.fill = function () { if (inFloor) floorFills++; return ctxFill.apply(this, arguments); };
  function pose() {
    var m = G.floorMesh;
    return {seed: currentSeed, pos: [Math.round(G.pos.x), Math.round(G.pos.y)], ang: +(G.cam.ang || 0).toFixed(3),
      pitch: G.cam.pitch, mesh: m ? [m.w, m.h, m.gridSize] : null, endless: G.ENDLESS_MODE, terrain: G.terrain};
  }
  // One real frame looking down, so the ground around the player is in view.
  function frame(pitch) {
    G.cam.pitch = pitch === undefined ? 0.5 : pitch; if (G.pos) G.pos.pitch = G.cam.pitch;
    var before = ptTotals(), logged = consoleErrors.length;
    floorFills = 0; G.__caveFloorRendered = 0;
    G.renderFrame();
    var crashes = consoleErrors.slice(logged).filter(function (e) { return /RENDER CRASH/.test(e); });
    return {crashes: ptDelta(before), fills: floorFills, underground: G.__caveFloorRendered || 0,
      firstError: crashes.length ? crashes[0].split('\n')[0] : null, pose: pose()};
  }
  function clean(f) { return !Object.keys(f.crashes).length && f.fills > 0; }
  var HEX = /^#[0-9a-f]{6}$/i;
  // Authored water palette (generateWaterFeatures, non-cave terrain). Classic
  // levels are ground, ice, plains and expanse.
  var POOL = {'#0e1e30': 1, '#152a45': 1}, STREAM = '#1a3a5a';

  var levels = G.levels.length, meshes = [], rendered = [], startCrashes = null;
  var expanseCaves = 0, pools = 0, streams = 0, layerColourFaults = [], waterFaults = [];
  for (var lv = 1; lv <= levels; lv++) {
    var beforeStart = ptTotals();
    startClassic(lv);
    if (lv === 1) startCrashes = ptDelta(beforeStart);          // startGame's own draw()
    var m = G.floorMesh, n = m ? m.w * m.h : 0, caves = 0, water = 0;
    for (var i = 0; i < n; i++) {
      if (m.layerCount[i] > 1 && m.l1Type[i] === 2) caves++;
      // Contract: every walkable layer (types 1, 3, 4) has a #rrggbb colour.
      for (var li = 0; li < m.layerCount[i]; li++) {
        var t = m['l' + li + 'Type'][i], arr = m['l' + li + 'Color'];
        if ((t === 1 || t === 3 || t === 4) && !(arr && HEX.test(arr[i])) && layerColourFaults.length < 5)
          layerColourFaults.push({level: lv, cell: i, layer: li, type: t, colour: arr ? arr[i] : 'no array'});
      }
      // Authored oracle: water cells show the water pass's palette in 3D.
      if (m.water && m.water[i]) {
        water++;
        var c = m.l0Color ? m.l0Color[i] : undefined;
        if (m.water[i] === 1) pools++; else streams++;
        var ok = m.water[i] === 1 ? POOL.hasOwnProperty(c) : c === STREAM;
        if (!ok && waterFaults.length < 5) waterFaults.push({level: lv, cell: i, water: m.water[i], l0Color: c === undefined ? 'missing' : c});
      }
    }
    meshes.push({level: lv, terrain: G.terrain, endless: G.ENDLESS_MODE, w: m && m.w, h: m && m.h,
      gridSize: m && m.gridSize, layered: !!(m && m.layerCount), caves: caves, water: water});
    if (G.terrain === 'expanse') expanseCaves += caves;
    rendered.push(frame());
    // The Expanse's deep caves render from inside: stand on a cave floor.
    if (G.terrain === 'expanse' && caves) {
      for (var cc = 0; cc < n; cc++) if (m.layerCount[cc] > 1 && m.l1Type[cc] === 2 &&
          m.layerCount[cc - 1] > 1 && m.layerCount[cc + 1] > 1) break;
      G.pos.x = (cc % m.w + 0.5) * m.gridSize; G.pos.y = (Math.floor(cc / m.w) + 0.5) * m.gridSize;
      G.pos.floorZ = G.meshHeightToPlayerZ(m.l0TopZ[cc]);
      var cave = frame(0.2); cave.caveCell = cc; rendered.push(cave);
    }
  }

  // Prerequisites: real classic levels, including the Expanse's deep caves
  // (a second, ceiling layer) and water repainted by the water pass.
  check('the Start path builds a layered classic floor mesh for every level',
    meshes.length === levels && levels >= 4 && meshes.every(function (x) { return x.layered && !x.endless && x.w > 0; }), meshes);
  check('the classic Expanse level has deep caves under a ceiling layer', expanseCaves > 0, meshes);
  check('classic levels have pools and streams painted by the water pass', pools > 0 && streams > 0, {pools: pools, streams: streams, meshes: meshes});
  check('the Start button in 3D draws its first frame without a render crash', startCrashes && !Object.keys(startCrashes).length, startCrashes);
  check('every classic level draws its layered 3D floor without a render crash',
    rendered.every(clean) && rendered.some(function (r) { return r.underground > 0; }), rendered);
  check('every walkable classic layer has a floor colour', !layerColourFaults.length, layerColourFaults);
  check('3D water shows the water pass palette (pools and streams)', !waterFaults.length, waterFaults);

  if (mutationRun) {
    output('SKIP an Endless world draws its layered 3D floor in the same host (mutation run)');
    output('SKIP a hand resetLevel from Endless into the classic Expanse draws its 3D floor (mutation run)');
  } else {
    // Positive control: an Endless world's layered floor draws in this host.
    startEndless();
    var endless = frame();
    check('an Endless world draws its layered 3D floor in the same host', clean(endless), endless);
    // Observation 2: a classic Expanse level started by hand from an Endless
    // tab (resetLevel typed into the console, Endless flags left as they were).
    G.terrain = 'expanse'; G.resetLevel(levels); G.MODE3D = true;
    var byHand = frame();
    check('a hand resetLevel from Endless into the classic Expanse draws its 3D floor',
      clean(byHand) && byHand.pose.terrain === 'expanse' && !!G.floorMesh.l0Color, byHand);
  }

  // Negative control: the host reports a floor pass that reads a missing
  // layer colour. _pt() counts every crash but logs only the first few, so
  // the counter is the verdict.
  startClassic(2);
  delete G.floorMesh.l0Color;
  var broken = frame();
  check('a classic floor without layer colours is reported as a platforms3D crash',
    (broken.crashes.platforms3D || 0) > 0 && broken.fills === 0, broken);

  output('CLASSIC_FLOOR_RESULT ' + (failed ? 'FAIL ' + failed : 'PASS ' + checked));
}());
