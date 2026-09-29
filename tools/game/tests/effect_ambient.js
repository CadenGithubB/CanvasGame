// Ambient motes and torch embers (unified effects V1, slice S3). A full-game
// host loads the real manifest and runs the real generator (Endless seed
// 424242, Cave Test seed 12345 'descending': above the chamber, at the mouth,
// in the chamber and looking back out, and a walk from outside the mouth into
// the chamber and back), fixed ticks, chunk streaming and the real draw path;
// the ember and wrap cases also run on authored floors (flat; a cave whose
// roof drops from 4 H to 1.2 H) with authored lights. Risks covered: motes in
// another stratum (buried under a surface viewer, on the roof above a cave
// viewer), drips that land on the cap, members of the old stratum lingering
// after the viewer walks into or out of a cave, and wrapped members above a
// lower roof or back-projected across the wrap (D1); the field blinking out at
// a chunk crossing (D2); a startup count and slider that ignore the Particles
// setting (D3); embers from the first listed, a 2D-nearest or an other-floor
// light, from cave-mouth lights, at the wrong height, popping in, simulated
// in the 2D view, flagged with a stale stratum, or doubled or lost by a split
// ambient/ember A/B (D4); cosmetic spawns consuming the gameplay random stream
// (D5); recipes drifting from the legacy literals (ranges, pulse depth and
// rate, blown sand's direction) or a size tier applied twice (D6); a browser
// profile that shares or leaks the live pool or ignores its seed (D7);
// fireflies by day or sparkle and shimmer by night, a gated weight that is
// dropped, or fireflies hidden by light weather (D8); motes spawned where the
// camera does not look (D9); a member choice tied to where its column landed,
// and a prewarm in the spawn mix with its drips falling in step (D10).
// Oracles are authored mesh layers read directly or through the shared
// spatial helpers (never the engine's own support code), authored light
// records and decoration sides, the legacy literals of 15-render-hud-menu.js
// restated here, the legacy draw formula, the recipe's authored rate, LOD and
// fade restated, the set weights, a measured steady state, particle
// identities (seedA) and recorded births (fxSpawn is wrapped). Since S7 the
// weather field shares the pool: the checks count ambient-field members
// (owner 0), blown sand runs with the Weather switch off (calm air), and D8
// sets its weather through effectWeatherForce (the schedule owns the state).
// Mutations are applied to slurped sources only (anchors match exactly once):
//   --lowest-layer-support  --viewer-nearest-only   --nearest-reference
//   --keep-other-stratum    --wrap-under-roof       --wrap-snap-cleared
//   --no-fx-rebase          --stale-ambient-max     --budget-at-init-only
//   --simulate-2d-ambient   --ember-first-light     --ember-list-order
//   --ember-two-draws       --ember-2d-distance     --ember-no-height-window
//   --embers-in-2d          --stale-torch-stratum   --split-ember-mode
//   --ambient-math-random   --dust-life-drift       --double-size-tier
//   --tier-twice-at-draw    --soft-pulse            --sand-random-direction
//   --profile-shares-pool   --field-global-serial   --profile-seed-ignored
//   --no-visibility-gate    --gated-drop            --suppress-any-weather
//   --annulus-spawn         --member-shares-column-noise
//   --prewarm-spawn-weights --prewarm-drips-at-ceiling
(function () {
  var G = (0, eval)('this'), output = (__engine === 'node' || __engine === 'deno') ? console.log.bind(console) : __out;
  var checked = 0, failed = 0, loadErrors = [], warnings = [], originalRandom = Math.random;
  var DT = 1 / 60;
  function has(flag) { return __argv.indexOf(flag) >= 0; }
  // The default run executes every case. A mutation run skips the cases its
  // flag cannot reach and says so.
  var mutationRun = __argv.some(function (a) { return /^--/.test(a); });
  function needed(name, flags) {
    if (!mutationRun || flags.some(has)) return true;
    output('SKIP ' + name + ' (mutation run for another check)');
    return false;
  }
  function mutate(source, flag, before, after) {
    if (!has(flag)) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + flag);
    return source.replace(before, after);
  }
  G.__ambientSource = function (path, source) {
    if (path === 'src/02-effect-registry.js') {
      // Before the fix: torch embers had a mode of their own, so an ambient-only A/B showed both ember sources.
      source = mutate(source, '--split-ember-mode', "var EFFECT_FAMILY_FOLLOWS = {torchEmbers:'ambient'};", 'var EFFECT_FAMILY_FOLLOWS = {};');
    }
    if (path === 'src/14-fx-render.js') {
      source = mutate(source, '--tier-twice-at-draw', 'rr = size * (space === 8 ? F.su : tier[r] * F.projScale / fwd);',
        'rr = size * (space === 8 ? F.su : tier[r] * tier[r] * F.projScale / fwd);');
    }
    if (path === 'src/11-fx-engine.js') {
      // The legacy spawn support (getFloorHeightAt): the lowest walkable layer, whatever the viewer's stratum.
      source = mutate(source, '--lowest-layer-support', '    var d = h > feet ? h - feet : feet - h;\n    if (d < best) { best = d; li = k; }\n  }\n  if (li < 0) return NaN;\n' +
        '  if (fxUnderAtH(x, y, m[SPATIAL_LAYER_TOP_KEYS[li]][ci]) !== S.viewUnder) return NaN;   // getCaveSpaceAt\'s rule, no allocation\n',
        '    var d = h > feet ? h - feet : feet - h;\n    if (li < 0 || h < m[SPATIAL_LAYER_TOP_KEYS[li]][ci]) { best = d; li = k; }\n  }\n  if (li < 0) return NaN;\n');
      source = mutate(source, '--viewer-nearest-only',
        '  if (fxUnderAtH(x, y, m[SPATIAL_LAYER_TOP_KEYS[li]][ci]) !== S.viewUnder) return NaN;   // getCaveSpaceAt\'s rule, no allocation\n', '');
      source = mutate(source, '--nearest-reference',
        '    var d = Math.abs(h - ref);\n    if (d < nearD) { nearD = d; near = k; }\n' +
        '    if (h > ref + 0.04 || h <= best) continue;                // support at or below the particle (1 u)\n' +
        '    if (fxCeilingBetween(m, ci, n, h, ref)) continue;\n    best = h; li = k;\n',
        '    var d = Math.abs(h - ref);\n    if (d < nearD) { nearD = d; near = k; li = k; }\n');
      source = mutate(source, '--keep-other-stratum', '    if (!on || !!(f & FX_UNDER) !== under) { fxMarkDying(S, i); i++; continue; }',
        '    if (!on) { fxMarkDying(S, i); i++; continue; }');
      source = mutate(source, '--wrap-under-roof',
        '  if (S.viewUnder && !(z < getCaveSpaceAt(x, y, h / 25).ceilingH * 25 - 1)) return false;   // under a lower roof there\n', '');
      // Before the fix: the integrate pass cleared SNAP, including the one a wrap had just set.
      source = mutate(source, '--wrap-snap-cleared', '    var r = rec[i], a = age[i] + dt, f = fl[i];\n',
        '    var r = rec[i], a = age[i] + dt, f = fl[i] & ~FX_SNAP; fl[i] = f;\n');
      source = mutate(source, '--no-fx-rebase', '  for (var i = 0; i < n; i++) if (!(fl[i] & (FX_EYE | FX_SCREEN))) { S.x[i] -= sx; S.y[i] -= sy; }\n', '');
      source = mutate(source, '--stale-ambient-max', '  st.target = on && set >= 0 ? Math.floor(S.P) : 0;', '  st.target = on && set >= 0 ? AMBIENT_MAX : 0;');
      source = mutate(source, '--budget-at-init-only', '  if (q.gen !== S.qGen) {', '  if (S.qGen < 0) {');
      source = mutate(source, '--ember-first-light', '    if (!(d < radius) || n === maxN && d >= T.d[n - 1]) continue;', '    if (!(d < radius) || n >= 1) continue;');
      // The first maxN eligible lights in list order: no sort, no eviction.
      source = mutate(source, '--ember-list-order',
        '    if (!(d < radius) || n === maxN && d >= T.d[n - 1]) continue;\n    for (j = n < maxN ? n++ : n - 1; j > 0 && T.d[j - 1] > d; j--)',
        '    if (!(d < radius) || n === maxN) continue;\n    for (j = n++; false; j--)');
      source = mutate(source, '--ember-two-draws', '  S.age[i] = 0; S.life[i] = life;',
        '  S.age[i] = R.trig[r] & 8 ? life - (R.life0[r] + (R.life1[r] - R.life0[r]) * effectNoise(seed, 22)) : 0; S.life[i] = life;');
      // The metric alone (the height window stays): the legacy 2D distance.
      source = mutate(source, '--ember-2d-distance', '    var d = Math.hypot(L.x - cam.x, L.y - cam.y, dz);', '    var d = Math.hypot(L.x - cam.x, L.y - cam.y);');
      source = mutate(source, '--ember-no-height-window', '    if (!(dz >= -40 && dz <= 260)) continue;\n', '');
      source = mutate(source, '--embers-in-2d', '    var idle = !S.gate[r] || !MODE3D && R.view2D[r] === FX_VIEW2D_NONE;', '    var idle = !S.gate[r];');
      // Before the fix: the viewer's stratum was set by the field pass, after the torches and only when a field exists.
      source = mutate(source, '--stale-torch-stratum',
        "    S.feetH = playerFeetSpatialZ() / 25; S.viewUnder = !!playerUnderground;   // the viewer's stratum, for anchors and fields\n", '');
      source = mutate(source, '--stale-torch-stratum', '  var F = S.C.FIELDS;\n  for (var f = 0; f < F.length; f++) fxRunField(S, F[f], S.fields[f], dt);',
        '  var F = S.C.FIELDS;\n  if (!F.length) return;\n  S.feetH = playerFeetSpatialZ() / 25; S.viewUnder = !!playerUnderground;\n' +
        '  for (var f = 0; f < F.length; f++) fxRunField(S, F[f], S.fields[f], dt);');
      source = mutate(source, '--ambient-math-random', '  var base = S.fieldSerial, salt = F.salt ^ S.seed,',
        '  Math.random();\n  var base = S.fieldSerial, salt = F.salt ^ S.seed,');
      source = mutate(source, '--field-global-serial', '  var base = S.fieldSerial, salt = F.salt ^ S.seed,',
        '  var base = (window._fxSessionFieldSerial = (window._fxSessionFieldSerial || 0) + 1), salt = F.salt ^ S.seed,');
      source = mutate(source, '--profile-shares-pool', '  fxState = createFxState(EFFECT_CONFIG.capacity, job.randomSeed, {pinned:true});\n',
        '  fxState.pinned = true;\n');
      source = mutate(source, '--profile-seed-ignored', '  fxState = createFxState(EFFECT_CONFIG.capacity, job.randomSeed, {pinned:true});\n',
        '  fxState = createFxState(EFFECT_CONFIG.capacity, 7, {pinned:true});\n');
      source = mutate(source, '--simulate-2d-ambient', '  var on = MODE3D || F.mode2D !== FX_MODE2D_NONE, under = S.viewUnder;', '  var on = true, under = S.viewUnder;');
      source = mutate(source, '--no-visibility-gate', '  return v === FX_VIS_NIGHT ? !g.night || g.hideNight : v === FX_VIS_DAY && !g.day;', '  return false;');
      // A hidden member's share is dropped instead of moving to the first shown member.
      source = mutate(source, '--gated-drop', ' + (k === first ? moved : 0);', ';');
      source = mutate(source, '--gated-drop', '  return list.r[first];\n}', '  return -1;\n}');
      source = mutate(source, '--suppress-any-weather', 'g.hideNight = wt.intensity > FX_WEATHER_RULES.fireflySuppress;', 'g.hideNight = wt.intensity > 0;');
      // Before the fix: the member used the 4th column's y key (base x 8 + 7).
      source = mutate(source, '--member-shares-column-noise', 'effectNoise(salt, base * 9 + 8), pre);', 'effectNoise(salt, base * 9 + 7), pre);');
      source = mutate(source, '--prewarm-spawn-weights', 'W = pre ? list.steady : list.w', 'W = list.w');
      source = mutate(source, '--prewarm-drips-at-ceiling',
        '    if (S.R.untilGround[r]) S.z[i] -= (S.z[i] - h) * 0.9 * u;\n    else S.age[i] = S.life[i] * 0.95 * u;', '    S.age[i] = S.life[i] * 0.95 * u;');
      // Before the fix: with no weather wind, 'wind' picked a random direction per mote.
      source = mutate(source, '--sand-random-direction', 'else { bx = calm[0]; by = calm[1]; }',
        'else { bx = Math.cos(2 * Math.PI * n14); by = Math.sin(2 * Math.PI * n14); }');
      // The legacy spawn rule: a 30-180 u annulus around the player, no forward bias.
      source = mutate(source, '--annulus-spawn', '  st.cx = cam.x + c * F.bias; st.cy = cam.y + s * F.bias;', '  st.cx = cam.x; st.cy = cam.y;');
      source = mutate(source, '--annulus-spawn',
        '    x = st.cx + (2 * effectNoise(salt, base * 9 + 2 * a) - 1) * F.half;\n    y = st.cy + (2 * effectNoise(salt, base * 9 + 2 * a + 1) - 1) * F.half;\n',
        '    var ang = 2 * Math.PI * effectNoise(salt, base * 9 + 2 * a), rad = 30 + 150 * effectNoise(salt, base * 9 + 2 * a + 1);\n' +
        '    x = pos.x + Math.cos(ang) * rad; y = pos.y + Math.sin(ang) * rad;\n');
    }
    if (path === 'src/11-fx-recipes.js') {
      source = mutate(source, '--dust-life-drift', "collision:{mode:'clamp', stratum:'reference'}, life:{seconds:[3, 7], fade:[0.2, 0.3]},",
        "collision:{mode:'clamp', stratum:'reference'}, life:{seconds:[3, 8], fade:[0.2, 0.3]},");
      // The first draft authored legacy x 0.1125 (the tier already inside) and applied the tier again.
      source = mutate(source, '--double-size-tier', "    render:{primitive:'dot', size:[0.15, 0.3], alpha:[0.18, 0.3], minPx:1, maxPx:4},",
        "    render:{primitive:'dot', size:[0.1125, 0.225], alpha:[0.18, 0.3], minPx:1, maxPx:4},");
      // The first transcription: the engine pulse ranges over [1 - depth, 1], legacy fireflies over [0, 1].
      source = mutate(source, '--soft-pulse', "pulseHz:0.8, pulseDepth:1},", "pulseHz:0.8, pulseDepth:0.5},");
    }
    return source;
  };
  G.__ambientLoad = function (path) {
    try { (0, eval)(G.__ambientSource(path, slurp('assets/games/' + path))); } catch (e) {
      if (/^MUTATION_ANCHOR/.test(e.message)) throw e;
      loadErrors.push(path + ': ' + e.message);
    }
  };
  var host = slurp('tools/game/tests/cave_occlusion_integration.js');
  var end = host.indexOf('  function check(name, okay) {');
  if (end < 0) throw Error('SETUP ambient host boundary missing');
  host = host.slice(0, end);
  var load = "manifest.parts.MAIN.forEach(function (path) { (0, eval)(slurp('assets/games/' + path)); });";
  if (host.split(load).length !== 2) throw Error('SETUP ambient manifest boundary missing');
  host = host.replace(load, 'manifest.parts.MAIN.forEach(G.__ambientLoad);');
  (0, eval)(host + 'G.__ambientErrors = errors; }());');
  G.console.warn = function () { warnings.push(Array.prototype.join.call(arguments, ' ')); };

  function check(name, okay, detail) {
    checked++; if (!okay) failed++;
    output((okay ? 'PASS ' : 'FAIL ') + name + (okay ? '' : ' ' + JSON.stringify(detail === undefined ? null : detail)));
  }
  function run(name, fn) {
    try { fn(); } catch (e) {
      check(name + ' ran without an exception', false, {message: e.message, stack: String(e.stack || '').split('\n').slice(0, 4)});
    }
  }
  function near(a, b, tol) { return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol); }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function lcg(seed) { var s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  check('every game fragment loads without an error', !loadErrors.length, {loadErrors: loadErrors});
  if (loadErrors.length) { output('EFFECT_AMBIENT_RESULT FAIL ' + failed + '/' + checked + ' (load failed)'); return; }

  // Fresh-load values, read before any case applies settings (D3).
  var fresh = {particles: G.settings.particles, ambientMax: G.AMBIENT_MAX, ambient: G.effectFamilyMode('ambient'),
    embers: G.effectFamilyMode('torchEmbers'), migrated: G.EFFECT_FAMILY_MIGRATED.ambient && G.EFFECT_FAMILY_MIGRATED.torchEmbers};

  // ── World fixtures ────────────────────────────────────────────────────────
  // Endless: the first Math.random draw becomes WORLD_SEED (the lab's
  // startEndless steering); later draws come from a seeded LCG.
  function startEndless(seed, counter) {
    var next = lcg(seed * 7919 + 13), used = false;
    Math.random = function () { if (counter) counter.n++; if (!used) { used = true; return (seed - 0.5) / 999999; } return next(); };
    G.CAVE_TEST_MODE = false; G.ENDLESS_MODE = true; G.running = true; G.gameOverState = false;
    G.menuOpen = G.settingsOpen = G.shopOpen = G.inventoryOpen = G.forgeOpen = G.overviewActive = false;
    G.MODE3D = true; G.CAM_FOLLOW = true;
    G.resetEndlessMode();
    if (G.WORLD_SEED !== seed) throw Error('SETUP world seed ' + G.WORLD_SEED + ' is not ' + seed);
    G.settings.dayNight = true; G.dayTime = 0.5; G.daySpeed = 0;
    G.startGameClock(); G.clearGameplayInput(); G.updateDayNight(0);
  }
  function startCave(view) {
    G._caveTestSeedOverride = 12345; G._caveTestKindOverride = 'descending';
    G.CAVE_TEST_MODE = true; G.ENDLESS_MODE = true; G.running = true; G.gameOverState = false; G.terrain = 'plains';
    G.menuOpen = G.settingsOpen = G.shopOpen = G.inventoryOpen = G.forgeOpen = G.overviewActive = false;
    Object.keys(G.caveTestFlags).forEach(function (k) { G.caveTestFlags[k] = false; });
    G.resetEndlessMode(); G.MODE3D = true; G.CAM_FOLLOW = true;
    G.settings.dayNight = true; G.dayTime = 0.5; G.daySpeed = 0;
    G.startGameClock(); G.clearGameplayInput();
    if (view) G.previewCaveView(view);
  }
  // Authored floors (12 u cells, feet at 0, camera at the centre): a flat
  // 31 x 31 floor; a 61 x 61 cave (floor 0, roof at 4 H, dropping to 1.2 H in
  // the grid columns below lowCols, cap at 5 H); a 61 x 61 surface stripe
  // with support only in the grid rows [row0, row1].
  var GS = 12;
  function authoredMesh(N, layers) {
    var m = {w: N, h: N, gridSize: GS, layerCount: new Uint8Array(N * N)};
    for (var l = 0; l < 5; l++) { m['l' + l + 'Type'] = new Uint8Array(N * N); m['l' + l + 'TopZ'] = new Float64Array(N * N); m['l' + l + 'Meta'] = new Uint8Array(N * N); }
    for (var gy = 0; gy < N; gy++) for (var gx = 0; gx < N; gx++) layers(m, gy * N + gx, gx, gy);
    return m;
  }
  function authoredScene(m, under, c) {
    var N = m.w;
    G.floorMesh = m; G.ENDLESS_MODE = false; G.CAVE_TEST_MODE = false;
    G.cell = GS; G.gridW = G.gridH = N; G.grid = new Uint8Array(N * N); G.wallHeights = G.wallFaceBase = G.wallMaxTopZ = null;
    G.deepCaveRegions = []; G.windowOriginX = G.windowOriginY = 0;
    G.pos = {x: c, y: c, floorZ: 60}; G.cam = {x: c, y: c, z: 60, ang: 0, pitch: 0, fov: G.GAME_CONFIG.player.baseFov};
    G.MODE3D = true; G.CAM_FOLLOW = true; G.playerUnderground = !!under; G.terrain = 'ground'; G.level = 1;
    G.renderSurfaceAmbient = 0.9; G.renderPresentationAlpha = 1;
  }
  function flatScene() {
    authoredScene(authoredMesh(31, function (m, i) { m.layerCount[i] = 1; m.l0Type[i] = 1; m.l0Meta[i] = 1; }), false, 180);
  }
  function caveScene(lowCols) {
    authoredScene(authoredMesh(61, function (m, i, gx) {
      m.layerCount[i] = 3; m.l0Type[i] = 1; m.l0Meta[i] = 1;
      m.l1Type[i] = 2; m.l1TopZ[i] = gx < lowCols ? 1.2 : 4; m.l2Type[i] = 4; m.l2TopZ[i] = 5;
    }), true, 366);
  }
  function stripeScene(row0, row1) {
    authoredScene(authoredMesh(61, function (m, i, gx, gy) {
      if (gy >= row0 && gy <= row1) { m.layerCount[i] = 1; m.l0Type[i] = 1; m.l0Meta[i] = 1; }
    }), false, 366);
  }
  // A clean field at the current viewpoint: the engine's own reset and prime.
  function freshField() { G.fxReset('world'); G.fxPrime(); }
  function effects(n) { for (var k = 0; k < n; k++) G.updateEffects(DT); }
  // Members of the ambient field (field code 0). Since S7 the weather field's
  // members (rain, snow, ash) share the FIELD flag; their owner holds the
  // weather field's code, so they are not counted here.
  function members(S, withDying) {
    var out = [];
    for (var i = 0; i < S.count; i++) if ((S.flags[i] & 64) && S.owner[i] === 0 && (withDying || !(S.flags[i] & 16))) out.push(i);
    return out;
  }
  function recipeOf(S, i) { return S.C.LIST[S.rec[i]].id; }
  function countBy(S, list) {
    var out = {};
    list.forEach(function (i) { var id = recipeOf(S, i); out[id] = (out[id] || 0) + 1; });
    return out;
  }
  // Births: fxSpawn is wrapped (the engine calls it by its global name).
  var births = null, realSpawn = G.fxSpawn;
  G.fxSpawn = function (S, r, serial, j, m, ctx) {
    var i = realSpawn.apply(G, arguments);
    if (i >= 0 && births) births.push({id: S.C.LIST[r].id, x: S.x[i], y: S.y[i], z: S.z[i], vx: S.vx[i], vy: S.vy[i], vz: S.vz[i],
      age: S.age[i], life: S.life[i], seed: S.seedA[i], under: !!(S.flags[i] & 32)});
    return i;
  };
  // Mesh oracles: layers read directly from the cell.
  function cellLayers(x, y) {
    var m = G.floorMesh, gs = m.gridSize, gx = Math.floor(x / gs), gy = Math.floor(y / gs), out = [];
    if (gx < 0 || gy < 0 || gx >= m.w || gy >= m.h) return out;
    var ci = gy * m.w + gx;
    for (var k = 0; k < m.layerCount[ci]; k++) out.push({type: m['l' + k + 'Type'][ci], h: m['l' + k + 'TopZ'][ci]});
    return out;
  }
  function hasRoofLayer(x, y) { return cellLayers(x, y).some(function (l) { return l.type === 2; }); }
  // The authored ceiling over a cave floor: the lowest type-2 layer above it.
  function authoredCeiling(x, y, floorH) {
    var c = Infinity;
    cellLayers(x, y).forEach(function (l) { if (l.type === 2 && l.h > floorH + 0.001 && l.h < c) c = l.h; });
    return c;
  }
  var liveState = G.fxState;
  function poolBytes(S) {
    var n = S.count, sl = Array.prototype.slice;
    return JSON.stringify([n, S.serial, S.fieldSerial, sl.call(S.x, 0, n), sl.call(S.y, 0, n), sl.call(S.z, 0, n), sl.call(S.age, 0, n),
      sl.call(S.seedA, 0, n), sl.call(S.rec, 0, n), sl.call(S.flags, 0, n)]);
  }

  // ── D1: motes stay in the viewer's stratum (ambient-4, -5, -10) ──────────
  // Each view is judged right after it runs (a view change can shift the
  // window). Positions are sampled every 20 ticks; spawns are judged at birth
  // (a mote may later drift a few units past a cave mouth, which is air, not
  // a stratum error).
  if (needed('D1', ['--lowest-layer-support', '--viewer-nearest-only', '--nearest-reference'])) run('D1 strata', function () {
    startCave(null);
    function sample(view, ticks, judge) {
      G.previewCaveView(view); freshField(); births = [];
      var S = G.fxState, snaps = [];
      try {
        for (var k = 0; k < ticks; k++) {
          G.updateEffects(DT);
          if (k % 20 === 19) snaps.push(members(S).map(function (i) { return {id: recipeOf(S, i), x: S.x[i], y: S.y[i], z: S.z[i], under: !!(S.flags[i] & 32)}; }));
        }
      } finally { var b = births; births = null; }
      var out = {view: view, under: !!G.playerUnderground, live: G.getEffectStats().fields.ambient.live, noSupport: S.stats.refusedNoSupport,
        spawns: b.filter(function (x) { return /^ambient\.(?!dripRipple)/.test(x.id); })};
      judge(out, snaps, b);
      return out;
    }
    function spot(p, extra) { var o = {x: r3(p.x), y: r3(p.y), z: r3(p.z), id: p.id}; Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; }); return o; }
    // Surface viewer above the chamber: motes over the cave rest on its cap.
    var capBad = [], overCave = 0, outdoorBad = [], outdoorSpawns = 0;
    var above = sample('above', 600, function (o, snaps) {
      snaps.forEach(function (list) {
        list.forEach(function (p) {
          if (!hasRoofLayer(p.x, p.y)) return;
          overCave++;
          var cap = G.sampleSpatialSupportZ(p.x, p.y, NaN, false);          // the highest support: the cap
          if (!(p.z >= cap - 0.5)) capBad.push(spot(p, {cap: r3(cap)}));
        });
      });
    });
    check('the surface field above the chamber is populated', !above.under && above.live >= 20, {under: above.under, live: above.live});
    check('surface motes above a cave rest on its cap', overCave >= 20 && !capBad.length,
      {view: 'above', seed: 12345, overCaveSamples: overCave, bad: capBad.length, first: capBad.slice(0, 3), tolerance: 0.5});
    // Surface viewers above the chamber and at the mouth (whose box reaches
    // under the roof): every spawn is outdoors.
    function outdoors(o) {
      o.spawns.forEach(function (p) {
        outdoorSpawns++;
        if (p.under || G.getCaveSpaceAt(p.x, p.y, p.z / 25).underground) outdoorBad.push(spot(p, {view: o.view}));
      });
    }
    outdoors(above);
    var mouth = sample('mouth', 600, outdoors);
    check('surface motes never spawn under a cave roof', !mouth.under && mouth.live >= 20 && outdoorSpawns >= 60 && !outdoorBad.length,
      {views: ['above', 'mouth'], seed: 12345, spawns: outdoorSpawns, bad: outdoorBad.length, first: outdoorBad.slice(0, 3)});
    // Underground viewers: in the chamber (positions over time), and just
    // inside the mouth looking back out (spawns), the box reaching the approach.
    var caveBad = [], caveSamples = 0, drips = [], ripples = [];
    function underRoof(p, view) {
      caveSamples++;
      var space = G.getCaveSpaceAt(p.x, p.y, p.z / 25);
      if (!p.under || !space.underground || !(p.z <= space.ceilingH * 25 - 1)) caveBad.push(spot(p, {view: view, roof: r3(space.ceilingH * 25)}));
    }
    var chamber = sample('chamber', 1200, function (o, snaps, b) {
      snaps.forEach(function (list) { list.forEach(function (p) { underRoof(p, 'chamber'); }); });
      o.spawns.forEach(function (p) { underRoof(p, 'chamber spawn'); });
      // Drips: born at the authored ceiling; they end on the cave floor (their ripples), never on the cap.
      b.forEach(function (x) {
        var floor = G.sampleSpatialSupportZ(x.x, x.y, NaN, true), cap = G.sampleSpatialSupportZ(x.x, x.y, NaN, false);
        if (x.id === 'ambient.drip') drips.push({p: x, roof: authoredCeiling(x.x, x.y, floor / 25) * 25});
        if (x.id === 'ambient.dripRipple') ripples.push({p: x, floor: floor, cap: cap});
      });
    });
    var back = sample('back', 600, function (o) { o.spawns.forEach(function (p) { underRoof(p, 'back spawn'); }); });
    check('the cave field is populated and refuses columns outside the chamber', [chamber, back].every(function (c) { return c.under && c.live >= 20; }) &&
      chamber.noSupport > 0, [chamber, back].map(function (c) { return {view: c.view, under: c.under, live: c.live, noSupport: c.noSupport}; }));
    check('cave motes stay under the cave roof', caveSamples >= 500 && back.spawns.length >= 20 && !caveBad.length,
      {seed: 12345, samples: caveSamples, backSpawns: back.spawns.length, bad: caveBad.length, first: caveBad.slice(0, 3)});
    var dripBad = drips.filter(function (d) { return !(d.p.z <= d.roof && d.p.z >= d.roof - 3); }).map(function (d) { return spot(d.p, {roof: r3(d.roof)}); });
    var rippleBad = ripples.filter(function (d) { return !(Math.abs(d.p.z - d.floor) <= 0.5) || Math.abs(d.p.z - d.cap) <= 10; })
      .map(function (d) { return spot(d.p, {floor: r3(d.floor), cap: r3(d.cap)}); });
    check('drips fall from the authored ceiling', drips.length >= 20 && !dripBad.length, {drips: drips.length, bad: dripBad.length, first: dripBad.slice(0, 3)});
    check('drips end on the cave floor, never on the cap', ripples.length >= 5 && !rippleBad.length,
      {seed: 12345, view: 'chamber', ripples: ripples.length, bad: rippleBad.length, first: rippleBad.slice(0, 3), tolerance: 0.5});
    G.fxState = liveState; freshField();
  });

  // ── D1 (stratum change): a live field carried across the cave mouth, with
  // no reset. The player walks from outside the mouth into the tunnel, then
  // back out; at each flip of playerUnderground every member of the old
  // stratum leaves within the cull fade plus one tick, and the new stratum's
  // field fills within a second.
  if (needed('D1 stratum change', ['--keep-other-stratum'])) run('D1 stratum change', function () {
    startCave('mouth');
    G.USE_KEYBOARD = true; G.USE_MOUSE = true; G.USE_GAMEPAD = false; G.CONTROL_MODE = G.MODE_STICK_AIM;
    var net = G.endlessCaveNetworks['0,0'], e = net.entrances[0], ch = net.chambers[net.chambers.length - 1], S = G.fxState, T = G.settings.particles;
    var fade = Math.ceil(G.EFFECT_CONFIG.cullFadeSeconds / DT) + 1;
    freshField();
    for (var k = 0; k < 120; k++) G.runSimulationTick(DT);
    function counts() {
      var under = !!G.playerUnderground, out = {same: 0, other: 0};
      for (var i = 0; i < S.count; i++) {
        if (!(S.flags[i] & 64)) continue;
        if (!!(S.flags[i] & 32) !== under) out.other++; else if (!(S.flags[i] & 16)) out.same++;
      }
      return out;
    }
    // Walk (steering with aim) until the stratum flips, then stand still.
    function walk(leg, aim) {
      var from = !!G.playerUnderground, log = {leg: leg, before: counts()}, flip = -1;
      G.kbState.up = true;
      try {
        for (var k = 0; k < 1200; k++) {
          G.cam.ang = aim(); G.runSimulationTick(DT);
          if (flip < 0 && !!G.playerUnderground !== from) { flip = k; log.flipTick = k; log.atFlip = counts(); G.kbState.up = false; }
          if (flip >= 0 && k === flip + fade) log.afterFade = counts();
          if (flip >= 0 && k === flip + 60) { log.after1s = counts(); break; }
        }
      } finally { G.kbState.up = false; }
      return log;
    }
    var into = walk('into the cave', function () {
      return G.playerUnderground ? Math.atan2(ch.cy - G.windowOriginY - G.pos.y, ch.cx - G.windowOriginX - G.pos.x) : e.angle;
    });
    var outOf = walk('out of the cave', function () {
      var ox = e.x - G.windowOriginX - Math.cos(e.angle) * 80, oy = e.y - G.windowOriginY - Math.sin(e.angle) * 80;
      return Math.atan2(oy - G.pos.y, ox - G.pos.x);
    });
    var legs = [into, outOf];
    check('the D1 walk flips the viewer into the cave and back out, each time leaving a field behind', into.before.same >= T - 2 &&
      legs.every(function (l) { return l.flipTick >= 0 && l.atFlip.other >= 10 && l.after1s; }), legs);
    check('members of the other stratum leave within the cull fade when the viewer enters or leaves a cave',
      legs.every(function (l) { return l.afterFade && l.afterFade.other === 0; }), {seed: 12345, fadeTicks: fade, legs: legs});
    check("the new stratum's field fills within a second", legs.every(function (l) { return l.after1s && l.after1s.other === 0 && l.after1s.same >= T - 2; }),
      {target: T, legs: legs});
    G.fxState = liveState; freshField();
  });

  // ── D1 (wraps): a cave field under a turning camera on an authored floor
  // whose roof drops from 4 H to 1.2 H (30 u) at x = 252 (grid column 21).
  // Members that leave the box wrap into the low-roof side; rising spores
  // reach 30-50 u, so a wrap must refuse a column where the member would sit
  // above the roof. A wrapped member keeps its height above its support and
  // presents its wrapped position (SNAP), never a back-projection across the
  // box. Oracles: the authored roof per column and particle identities.
  if (needed('D1 wraps', ['--wrap-under-roof', '--wrap-snap-cleared'])) run('D1 wraps', function () {
    caveScene(21);
    G.settings.particles = 60;
    var S = G.fxState = G.createFxState(3072, 505, {pinned: true}), seen = {}, wraps = 0, low = 0, roofBad = [], snapBad = [], heightBad = [];
    try {
      for (var k = 0; k < 2400; k++) {
        G.cam.ang = k * 0.01; G.updateEffects(DT);
        for (var i = 0; i < S.count; i++) {
          if (!(S.flags[i] & 64) || S.owner[i] !== 0 || (S.flags[i] & 16)) continue;       // ambient members (S7: not weather)
          var id = S.seedA[i], p = seen[id], x = S.x[i], y = S.y[i], z = S.z[i];
          if (p && (Math.abs(x - p[0]) > 170 || Math.abs(y - p[1]) > 170)) {
            wraps++;
            var roof = (Math.floor(x / GS) <= 20 ? 1.2 : 4) * 25;          // authored, floor 0 everywhere
            if (roof < 100) low++;
            var at = {id: recipeOf(S, i), x: r3(x), y: r3(y), z: r3(z), roof: roof, tick: k};
            if (!(z <= roof - 1)) roofBad.push(at);
            if (!(S.flags[i] & 2)) snapBad.push(at);
            if (!(Math.abs(z - p[2]) <= 0.25)) heightBad.push({id: at.id, z: at.z, before: r3(p[2])});   // one tick of its own motion
          }
          seen[id] = [x, y, z];
        }
      }
    } finally { G.settings.particles = 25; G.fxState = liveState; }
    check('the D1 wrap fixture wraps cave members into the low-roof side', S.stats.fieldWraps >= 100 && wraps >= 100 && low >= 20,
      {engineWraps: S.stats.fieldWraps, observed: wraps, intoLowRoof: low, dropped: S.stats.fieldDropped});
    check('a wrapped cave member stays under the roof of its new column', !roofBad.length,
      {wraps: wraps, bad: roofBad.length, first: roofBad.slice(0, 3), tolerance: 1});
    check('a wrapped member keeps its height and presents its wrapped position', !snapBad.length && !heightBad.length,
      {wraps: wraps, noSnap: snapBad.length, heightChanged: heightBad.length, first: snapBad.slice(0, 2).concat(heightBad.slice(0, 2))});
  });

  // ── D2: the field survives a chunk crossing without mass respawn (ambient-6)
  if (needed('D2', ['--no-fx-rebase'])) run('D2 chunk crossing', function () {
    startEndless(424242);
    G.USE_KEYBOARD = true; G.USE_MOUSE = true; G.USE_GAMEPAD = false; G.CONTROL_MODE = G.MODE_STICK_AIM;
    var S = G.fxState, half = Math.floor(G.WINDOW_CHUNKS / 2), edge = (G.windowCX + half + 1) * G.CHUNK_SIZE - G.windowOriginX;
    G.pos.x = edge - 30; G.cam.x = G.pos.x; G.cam.y = G.pos.y; G.cam.ang = 0; G.vel.x = G.vel.y = 0;
    freshField();
    function sumAlpha() {
      var sum = 0;
      members(S).forEach(function (i) {
        var r = S.rec[i], a = S.age[i];
        sum += S.alpha[i] * G.fxEnvelope(S.R, r, a / S.life[i], a, S.phase[i]) * G.fxFieldFade(S, S.owner[i], S.x[i], S.y[i]);
      });
      return sum;
    }
    function tick() { G.cam.ang = 0; var k0 = S.stats.killed; G.runSimulationTick(DT); return S.stats.killed - k0; }
    var settle = [];
    for (var k = 0; k < 240; k++) { var kills = tick(); if (k >= 120) settle.push(kills); }
    var natural = settle.reduce(function (a, b) { return a + b; }, 0) / settle.length;
    // Walk east until the real updateChunks -> assembleWindow shift.
    G.kbState.up = true;
    var crossing = null, walk = [], ox = G.windowOriginX, ratios = [];
    try {
      for (k = 0; k < 400 && !crossing; k++) {
        var before = sumAlpha(), killed = tick(), after = sumAlpha();
        if (G.windowOriginX !== ox) crossing = {shift: G.windowOriginX - ox, kills: killed, ratio: after / before, live: G.getEffectStats().fields.ambient.live};
        else { walk.push(killed); ratios.push(after / before); }
      }
    } finally { G.kbState.up = false; }
    if (!crossing) throw Error('SETUP D2 walk never crossed the chunk edge');
    var walkRate = walk.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, walk.length);
    var worstWalk = ratios.reduce(function (w, r) { return Math.abs(r - 1) > Math.abs(w - 1) ? r : w; }, 1);
    check('the D2 crossing is a real 480 u window shift after a walk', crossing.shift === 480 && walk.length >= 5,
      {shift: crossing.shift, walkTicks: walk.length});
    check('the ambient field survives a chunk crossing without mass respawn', crossing.kills <= Math.max(natural, walkRate) + 2 &&
      crossing.ratio >= 0.95 && crossing.ratio <= 1.05 && crossing.live === G.settings.particles,
      {seed: 424242, crossing: crossing, naturalKillsPerTick: r3(natural), walkKillsPerTick: r3(walkRate), worstWalkRatio: r3(worstWalk), bounds: [0.95, 1.05]});
    // Positive control: a 1,000 u teleport drops the old field and refills it.
    var n0 = members(S).length, d0 = S.stats.fieldDropped;
    G.pos.y += 1000; G.cam.y = G.pos.y; tick();
    var dropped = S.stats.fieldDropped - d0, refilled = 0;
    for (k = 0; k < 60; k++) tick();
    refilled = G.getEffectStats().fields.ambient.live;
    check('a 1,000 u teleport drops the old field and refills it', n0 === G.settings.particles && dropped >= 0.5 * n0 && refilled >= 0.9 * G.settings.particles,
      {before: n0, dropped: dropped, liveAfter1s: refilled});
  });

  // ── D3: startup population matches the preset; the slider is live ─────────
  if (needed('D3', ['--stale-ambient-max', '--budget-at-init-only', '--simulate-2d-ambient'])) run('D3 Particles setting', function () {
    check('the fresh load migrates ambient and torch embers and keeps the Medium preset', fresh.particles === 25 && fresh.migrated &&
      fresh.ambient === 'new' && fresh.embers === 'new', fresh);
    startEndless(424242); G.runSimulationTick(DT);
    var f = G.getEffectStats().fields.ambient;
    check('startup population matches the preset', f.target === 25 && f.live === 25 && members(G.fxState).length === 25,
      {target: f.target, live: f.live, pool: members(G.fxState).length, AMBIENT_MAX: G.AMBIENT_MAX});
    // Documented: the legacy path still reads AMBIENT_MAX (35 at a fresh load).
    G.setEffectFamilyMode('ambient', 'legacy');
    try { startEndless(424242); var legacyCount = G.ambientParticles.length; } finally { G.setEffectFamilyMode('ambient', null); }
    check('the legacy path still starts at AMBIENT_MAX (35, documented)', fresh.ambientMax === 35 && legacyCount === 35, {legacy: legacyCount});
    // Live slider: Apply without any reset; 60 fills within a second, 0 empties within the fade.
    startEndless(424242);
    var resets = 0, savedReset = G.effectRegistryReset;
    G.effectRegistryReset = function () { resets++; return savedReset.apply(G, arguments); };
    var log = {};
    try {
      for (var k = 0; k < 60; k++) G.runSimulationTick(DT);
      G.settings.particles = 60; G.settings.chunkWindow = G.WINDOW_CHUNKS; G.applySettings();
      for (k = 0; k < 60; k++) G.runSimulationTick(DT);
      log.at60 = members(G.fxState).length; log.target60 = G.getEffectStats().fields.ambient.target;
      G.settings.particles = 0; G.applySettings();
      for (k = 0; k < Math.ceil(G.EFFECT_CONFIG.cullFadeSeconds / DT) + 1; k++) G.runSimulationTick(DT);
      log.at0 = members(G.fxState, true).length;
      G.settings.particles = 25; G.applySettings();
      for (k = 0; k < 60; k++) G.runSimulationTick(DT);
      log.back = members(G.fxState).length;
    } finally { G.effectRegistryReset = savedReset; G.settings.particles = 25; G.applySettings(); }
    log.resets = resets;
    check('the ambient field follows the Particles slider live', log.at60 === 60 && log.target60 === 60 && log.at0 === 0 && log.back === 25 && resets === 0, log);
    // The 2D view (mode2D 'none', ambient-18): the field is not simulated, its
    // members fade out, and returning to 3D refills it at once.
    startEndless(424242); G.runSimulationTick(DT);
    var S = G.fxState, s0 = S.stats.fieldSpawned, twoD = {before: members(S).length};
    G.MODE3D = false;
    for (k = 0; k < 60; k++) G.runSimulationTick(DT);
    twoD.members = members(S, true).length; twoD.spawned = S.stats.fieldSpawned - s0;
    G.MODE3D = true; G.runSimulationTick(DT);
    twoD.back = members(S).length;
    check('the ambient field is not simulated in the 2D view', twoD.before === 25 && twoD.members === 0 && twoD.spawned === 0 && twoD.back === 25, twoD);
  });

  // ── D4: embers rise from the nearest torch flames with a proper envelope ──
  if (needed('D4', ['--ember-first-light', '--ember-list-order', '--ember-two-draws', '--ember-2d-distance', '--ember-no-height-window',
      '--embers-in-2d', '--stale-torch-stratum'])) run('D4 torch embers', function () {
    flatScene();
    // Authored lights (feet at 0; flames 45 u up on this floor). Six torches
    // on this floor within the 220 u radius, T1-T6 at 3D distances 67, 83,
    // 101, 119, 157 and 195 u, so T1-T4 are the four nearest. H sits on a
    // ledge 200 u up: 40 u away in 2D (nearer than T1) but 204 u in 3D. E is
    // a cave torch 100 u below: 20 u away in 2D and 102 u in 3D (nearer than
    // T4), outside the -40..260 u height window. F is a cave-mouth light, Far
    // is beyond the radius. They are listed farthest-first, so list order is
    // the wrong answer.
    var L = {T1: {x: 230, y: 180, z: 45, kind: 'torch', nx: -1, ny: 0}, T2: {x: 180, y: 250, z: 45, kind: 'torch', nx: 0, ny: -1},
      T3: {x: 90, y: 180, z: 45, kind: 'torch', nx: 1, ny: 0}, T4: {x: 180, y: 70, z: 45, kind: 'torch', nx: 0, ny: 1},
      T5: {x: 286, y: 286, z: 45, kind: 'torch', nx: -1, ny: 0}, T6: {x: 314, y: 46, z: 45, kind: 'torch', nx: -1, ny: 0},
      H: {x: 180, y: 220, z: 200, kind: 'torch', nx: 0, ny: -1}, E: {x: 160, y: 180, z: -100, kind: 'torch', nx: 1, ny: 0},
      Far: {x: 340, y: 340, z: 45, kind: 'torch', nx: -1, ny: 0}, F: {x: 170, y: 200, z: 35, kind: 'entrance'}};
    var NAMES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'H', 'E', 'Far'], NEAREST = ['T1', 'T2', 'T3', 'T4'];
    G.pointLights = ['Far', 'H', 'T6', 'F', 'T5', 'T4', 'E', 'T3', 'T2', 'T1'].map(function (k) { return L[k]; });
    function emission(l) { return {x: l.x + 2 * l.nx, y: l.y + 2 * l.ny, z: l.z + 2}; }
    var S = G.fxState = G.createFxState(3072, 404, {pinned: true}), rE = S.C.ID['torch.ember'], firstBad = [], rampBad = [], seen = {}, nSeen = 0;
    births = [];
    try {
      for (var k = 0; k < 3000; k++) {
        G.updateEffects(DT);
        for (var i = 0; i < S.count; i++) {
          if (S.rec[i] !== rE) continue;
          var sd = S.seedA[i], a = S.age[i], life = S.life[i], t = a / life, env = G.fxEnvelope(S.R, rE, t, a, S.phase[i]);
          // Restated fade-in: 15% of life. At first sight (the tick of birth)
          // an ember shows at most one tick of it; the pulse only dims it.
          if (!seen[sd]) {
            seen[sd] = 1; nSeen++;
            if (!(a <= DT + 1e-9) || env > DT / (0.15 * life) + 1e-9) firstBad.push({seed: sd, tick: k, age: r3(a), life: r3(life), env: r3(env)});
          }
          if (t <= 0.15 && env > t / 0.15 + 1e-9) rampBad.push({seed: sd, tick: k, t: r3(t), env: r3(env)});
        }
      }
    } finally { var b = births; births = null; }
    var embers = b.filter(function (x) { return x.id === 'torch.ember'; }), per = {}, stray = [], ages = [];
    NAMES.forEach(function (name) { per[name] = 0; });
    embers.forEach(function (e) {
      var best = null, bestD = Infinity;
      NAMES.forEach(function (name) { var p = emission(L[name]), d = Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z); if (d < bestD) { bestD = d; best = name; } });
      if (bestD > 2 + 1e-9) stray.push({x: r3(e.x), y: r3(e.y), z: r3(e.z), d: r3(bestD), torch: best});
      else per[best]++;
      if (e.age !== 0 || !(e.life >= 0.8 && e.life <= 2)) ages.push({age: e.age, life: e.life});
      if (Math.hypot(e.x - L.F.x, e.y - L.F.y) < 10) stray.push({entrance: true});
    });
    var n = embers.length, others = NAMES.filter(function (name) { return NEAREST.indexOf(name) < 0; });
    check('embers leave only the flames of the four nearest torches on the viewer floor', n >= 60 && !stray.length &&
      NEAREST.every(function (name) { return per[name] >= 0.1 * n; }) && others.every(function (name) { return per[name] === 0; }),
      {embers: n, perTorch: per, stray: stray.length, first: stray.slice(0, 3),
       lights: 'T1-T4 nearest in 3D; T5 T6 farther; H 200 u up (40 u in 2D, 204 u in 3D); E 100 u below (20 u in 2D); F entrance; Far beyond 220 u'});
    // Rate: 6/s x min(s, 1.5) x keep(d), keep 1 -> 0.25 over 40 -> 220 u (recipe, restated).
    var expect = {};
    NEAREST.forEach(function (name) {
      var p = emission(L[name]), d = Math.hypot(p.x - 180, p.y - 180), keep = d <= 40 ? 1 : 1 + (0.25 - 1) * (d - 40) / 180;
      expect[name] = r3(6 * keep * 3000 * DT);
    });
    check('each of the four nearest torches emits at its recipe rate', NEAREST.every(function (name) { return Math.abs(per[name] - expect[name]) <= 0.1 * expect[name]; }),
      {perTorch: per, expected: expect, tolerance: 0.1});
    check('embers are born at age 0 with one life draw', n > 0 && !ages.length, {bad: ages.length, first: ages.slice(0, 3), life: [0.8, 2]});
    check('ember alpha fades in from zero at birth over the first 15% of life', nSeen >= 60 && !firstBad.length && !rampBad.length,
      {tracked: nSeen, poppedIn: firstBad.length, first: firstBad.slice(0, 3), aboveRamp: rampBad.length, ramp: rampBad.slice(0, 2), fadeIn: 0.15});
    // The 2D view: embers have no 2D form (view2D 'none'), so the torches
    // idle there, as the field does, and resume in 3D.
    var s0 = S.stats.torchSpawned, twoD = {};
    G.MODE3D = false;
    try { effects(600); } finally { G.MODE3D = true; }
    twoD.spawnedIn2D = S.stats.torchSpawned - s0; twoD.liveAfter10s = 0;
    for (i = 0; i < S.count; i++) if (S.rec[i] === rE) twoD.liveAfter10s++;
    s0 = S.stats.torchSpawned; effects(120); twoD.spawnedBackIn3D = S.stats.torchSpawned - s0;
    check('torch embers idle in the 2D view, where they have no form', twoD.spawnedIn2D === 0 && twoD.liveAfter10s === 0 && twoD.spawnedBackIn3D >= 5, twoD);
    // The torch table follows its own light list (a rebuilt list is reselected at once).
    G.pointLights = [L.T3]; G.updateEffects(DT);
    check('a rebuilt light list is reselected on the next tick', S.torch.n === 1 && S.torch.ref[0] === L.T3, {n: S.torch.n});
    G.fxState = liveState;
    // A generated world tags its lights (07-decorations-lighting.js): torches
    // and sconces with the face normal of their wall side, cave mouths apart.
    startCave(null);
    var sides = {west: [-1, 0], east: [1, 0], north: [0, -1], south: [0, 1]}, torchDecs = 0, tagBad = [];
    G.wallDecorations.forEach(function (d) {
      if (d.type !== 'torch' && d.type !== 'sconce') return;
      var at = G.getWallDecorationAttachment(d);
      if (!at) return;
      torchDecs++;
      var l = G.pointLights.filter(function (q) { return q.x === at.x && q.y === at.y && q.z === at.flameZ; })[0], n2 = sides[d.side];
      if (!l || l.kind !== 'torch' || !n2 || l.nx !== n2[0] || l.ny !== n2[1]) tagBad.push({side: d.side, light: l && [l.kind, l.nx, l.ny]});
    });
    var entrances = G.pointLights.filter(function (q) { return q.kind === 'entrance'; }).length;
    check('generated torch lights carry kind and wall normal; cave-mouth lights are entrances', torchDecs >= 3 && !tagBad.length &&
      entrances === G.deepCaveEntrances.length && entrances > 0 && G.pointLights.length === torchDecs + entrances,
      {torches: torchDecs, entrances: entrances, lights: G.pointLights.length, bad: tagBad.slice(0, 3)});
    // Real Cave Test chamber: every ember leaves a real torch flame on the viewer's floor.
    G.previewCaveView('chamber'); freshField(); births = [];
    try { effects(600); } finally { b = births; births = null; }
    var feet = G.playerFeetSpatialZ(), real = b.filter(function (x) { return x.id === 'torch.ember'; }), realBad = [];
    real.forEach(function (e) {
      var ok = G.pointLights.some(function (q) {
        return q.kind === 'torch' && q.z - feet >= -40 && q.z - feet <= 260 && Math.hypot(e.x - q.x - 2 * q.nx, e.y - q.y - 2 * q.ny, e.z - q.z - 2) <= 2 + 1e-9;
      });
      if (!ok) realBad.push({x: r3(e.x), y: r3(e.y), z: r3(e.z)});
    });
    check('Cave Test chamber embers rise from real torch flames', real.length >= 20 && !realBad.length, {embers: real.length, bad: realBad.slice(0, 3)});
    // The viewer's stratum is read at the start of each tick, before the
    // torches, whatever the table holds: with a table that has no field (a
    // test table, or a build without the ambient field) every chamber ember
    // is still flagged underground, and so lit and fogged as the cave.
    var torchOnly = G.compileFxRecipes({'torch.ember': G.FX_RECIPE_SOURCE['torch.ember']}, G.FX_MATERIALS, {});
    var S2 = G.fxState = G.createFxState(3072, 99, {compiled: torchOnly, pinned: true}), rE2 = torchOnly.ID['torch.ember'], flagged = {under: 0, surface: 0};
    try {
      effects(300);
      for (i = 0; i < S2.count; i++) if (S2.rec[i] === rE2) flagged[S2.flags[i] & 32 ? 'under' : 'surface']++;
    } finally { G.fxState = liveState; }
    check("embers take the viewer's stratum from their own tick", G.playerUnderground === true && torchOnly.FIELDS.length === 0 &&
      flagged.under >= 3 && flagged.surface === 0, {playerUnderground: G.playerUnderground, fields: torchOnly.FIELDS.length, flagged: flagged});
    freshField();
  });

  // ── D4 (A/B): torch embers follow the ambient family, whose legacy update
  // produces the legacy embers (15-render-hud-menu.js), so every A/B shows
  // exactly one ember source: the default (engine), the ambient family held
  // on Legacy (legacy respawns) and Unified effects off (legacy). A lone
  // torch-ember override is refused with a named error.
  if (needed('D4 ember A/B', ['--split-ember-mode'])) run('D4 ember A/B', function () {
    function sources(label, set, unset) {
      set();
      try {
        startCave('chamber');
        var engine = 0, legacy = 0;
        for (var k = 0; k < 600; k++) {
          G.runSimulationTick(DT);
          if (k < 60 || k % 10) continue;
          var S = G.fxState, rE = S.C.ID['torch.ember'];
          for (var i = 0; i < S.count; i++) if (S.rec[i] === rE && !(S.flags[i] & 16)) engine++;
          G.ambientParticles.forEach(function (p) { if (p.type === 'ember') legacy++; });
        }
        return {ab: label, emberMode: G.effectFamilyMode('torchEmbers'), engineSamples: engine, legacySamples: legacy};
      } finally { unset(); }
    }
    function none() {}
    var runs = [sources('default', none, none),
      sources('ambient held on Legacy', function () { G.setEffectFamilyMode('ambient', 'legacy'); }, function () { G.setEffectFamilyMode('ambient', null); }),
      sources('Unified effects off', function () { G.setEffectToggle('fxUnified', false); }, function () { G.setEffectToggle('fxUnified', true); })];
    var refused = null;
    try { G.setEffectFamilyMode('torchEmbers', 'legacy'); } catch (e) { refused = e.message; } finally { G.setEffectFamilyMode('torchEmbers', null); }
    check('every ember A/B shows exactly one ember source', runs[0].emberMode === 'new' && runs[0].engineSamples > 0 && runs[0].legacySamples === 0 &&
      runs.slice(1).every(function (r) { return r.emberMode === 'legacy' && r.legacySamples > 0 && r.engineSamples === 0; }) &&
      /^effect families: torchEmbers follows ambient/.test(refused || ''), {runs: runs, loneOverride: refused});
    startCave(null); G.fxState = liveState; freshField();
  });

  // ── D5: ambient never consumes the gameplay random stream (ambient-9) ─────
  if (needed('D5', ['--ambient-math-random'])) run('D5 random streams', function () {
    function replay(P) {
      var counter = {n: 0};
      G.settings.particles = P;
      startEndless(424242, counter);
      // A torch 60 u ahead of the spawn so embers run too (standing still: no
      // chunk crossing rebuilds the light list).
      G.pointLights.push({x: G.pos.x + 60, y: G.pos.y, z: G.playerFeetSpatialZ() + 45, kind: 'torch', nx: -1, ny: 0, r: 255, g: 180, b: 80, radius: 90, intensity: 0.55});
      var S = G.fxState;
      counter.n = 0;
      try { for (var k = 0; k < 600; k++) G.runSimulationTick(DT); } finally { G.settings.particles = 25; }
      return {P: P, draws: counter.n, field: S.stats.fieldSpawned, embers: S.stats.torchSpawned};
    }
    var runs = [replay(0), replay(25), replay(60)];
    check('the D5 replay draws gameplay randoms and spawns motes and embers above P = 0', runs[0].draws > 0 && runs[0].field === 0 &&
      runs[1].field > 25 && runs[2].field > runs[1].field && runs[1].embers > 0 && runs[2].embers > runs[1].embers, runs);
    check('ambient never consumes the gameplay stream', runs[1].draws === runs[0].draws && runs[2].draws === runs[0].draws, runs);
    // The shipping field and torch anchor under throwing random sources: the
    // underground set (drips, ripples, spores, cave dust) and 4 torches.
    startCave('chamber'); freshField();
    var calls = {random: 0, presentation: 0}, savedPR = G.presentationRandom, S = G.fxState, s0 = S.stats.fieldSpawned, e0 = S.stats.torchSpawned, c0 = S.stats.children;
    function thrower(kind) { return function () { calls[kind]++; throw Error('cosmetic draw from ' + kind); }; }
    Math.random = thrower('random'); G.presentationRandom = thrower('presentation');
    try {
      for (var k = 0; k < 600; k++) {
        G.updateEffects(DT);
        if (k % 30 === 0) { G.beginSceneDepthFrame(G.canvas.width, G.canvas.height); G.beginEffectFrame(); G.drawEffectLayer3D(0); }
      }
    } finally { Math.random = originalRandom; G.presentationRandom = savedPR; }
    var fx = G.getEffectStats();
    check('ambient and ember spawns never call Math.random or presentationRandom', !calls.random && !calls.presentation &&
      S.stats.fieldSpawned - s0 >= 50 && S.stats.torchSpawned - e0 > 0 && S.stats.children - c0 > 0 && !fx.failures.updateEffects && !fx.failures.render,
      {calls: calls, field: S.stats.fieldSpawned - s0, embers: S.stats.torchSpawned - e0, ripples: S.stats.children - c0, failures: fx.failures});
  });

  // ── D6: compiled ambient ranges equal the legacy literals; blown sand
  // drifts one way; the size tier is applied once, at draw ──────────────────
  if (needed('D6', ['--dust-life-drift', '--double-size-tier', '--tier-twice-at-draw', '--soft-pulse', '--sand-random-direction'])) run('D6 legacy ranges', function () {
    // 15-render-hud-menu.js:411-491 and the ember literal at :540-544,
    // restated: size in legacy units, maxAlpha, maxLife, spawn height above
    // the floor, vertical speed, and the alpha pulse as [its minimum factor,
    // rad/s]: fireflies x (0.5 + 0.5 sin(t 0.005/ms)), embers x (0.6 + 0.4
    // sin(t 0.01/ms)) (:525-527). (Drip heights come from the real ceiling
    // now, and the drip is a streak of its own width.)
    var LEGACY = {
      'ambient.dust': {size: [1, 2], alpha: [0.18, 0.3], life: [3, 7], height: [5, 25], vz: [-1, 1]},
      'ambient.firefly': {size: [1.5, 1.5], alpha: [0.3, 0.6], life: [3, 8], height: [8, 28], vz: [-2.5, 2.5], pulse: [0, 5]},
      'ambient.snowflake': {size: [1, 3], alpha: [0.25, 0.45], life: [4, 7], height: [30, 70], vz: [-15, -5]},
      'ambient.sparkle': {size: [1, 2], alpha: [0.4, 0.7], life: [0.8, 2], height: [2, 17], vz: [0, 0]},
      'ambient.sandDust': {size: [1, 2.5], alpha: [0.15, 0.3], life: [3, 6], height: [3, 23], vz: [-1.5, 1.5]},
      'ambient.shimmer': {size: [2, 4], alpha: [0.08, 0.16], life: [2, 4], height: [5, 20], vz: [1, 4]},
      'ambient.drip': {alpha: [0.35, 0.5], life: [1.5, 3], vz: [-35, -20]},
      'ambient.spore': {size: [1, 2.5], alpha: [0.2, 0.35], life: [4, 8], height: [3, 13], vz: [2, 6]},
      'torch.ember': {size: [1, 2], alpha: [0.4, 0.7], life: [0.8, 2], vz: [8, 20], pulse: [0.2, 10]}
    };
    var C = G.FX_COMPILED, R = C.R, bad = [];
    Object.keys(LEGACY).forEach(function (id) {
      var r = C.ID[id], L = LEGACY[id], got = {};
      if (r === undefined) { bad.push({id: id, missing: true}); return; }
      if (L.size) got.size = [R.size0[r] / 0.15, R.size1[r] / 0.15];
      got.alpha = [R.alpha0[r], R.alpha1[r]]; got.life = [R.life0[r], R.life1[r]];
      if (L.height) got.height = [R.hgt0[r], R.hgt1[r]];
      got.vz = [R.up0[r], R.up1[r]];
      if (L.pulse) got.pulse = [1 - R.pulseD[r], R.pulseW[r]];
      Object.keys(got).forEach(function (k) {
        var tol = k === 'pulse' ? 0.011 * L.pulse[1] : 1e-9;                  // the recipe's 0.8 and 1.6 Hz are within 1% of the legacy rad/ms
        if (!near(got[k][0], L[k][0], 1e-9) || !near(got[k][1], L[k][1], tol)) bad.push({id: id, key: k, legacy: L[k], compiled: got[k].map(r3)});
      });
    });
    check('compiled ambient ranges equal the legacy literals', !bad.length && Object.keys(LEGACY).length === 9, {bad: bad});
    // Blown sand (legacy 'dust' in the expanse): vx 8..20 always +x, vy
    // within +-3, vz within +-1.5, constant over its life. With the Weather
    // switch off no weather wind blows (S7: every front blows otherwise, and
    // weather.js checks sand in that wind), so direction 'wind' must take the
    // calm direction, not a random one per mote. Births through the real
    // field, then the survivors.
    flatScene(); G.terrain = 'expanse';
    var S = G.fxState = G.createFxState(3072, 707, {pinned: true}), rS = S.C.ID['ambient.sandDust'], sand = [], later = [];
    births = []; G.setEffectToggle('fxWeather', 'off');
    try {
      effects(600);
      for (var i = 0; i < S.count; i++) if (S.rec[i] === rS) later.push([S.vx[i], S.vy[i]]);
    } finally { var b = births; births = null; G.fxState = liveState; G.setEffectToggle('fxWeather', 'auto'); }
    sand = b.filter(function (x) { return x.id === 'ambient.sandDust'; });
    var mx = 0, my = 0, sandBad = [];
    sand.forEach(function (x) {
      var h = Math.hypot(x.vx, x.vy); mx += x.vx / h; my += x.vy / h;
      if (!(x.vx >= 8 - 1e-9 && x.vx <= 20 + 1e-9 && Math.abs(x.vy) <= 3 && Math.abs(x.vz) <= 1.5 + 1e-9)) sandBad.push({vx: r3(x.vx), vy: r3(x.vy), vz: r3(x.vz)});
    });
    later.forEach(function (v) { if (!(v[0] >= 8 - 1e-9 && v[0] <= 20 + 1e-9 && Math.abs(v[1]) <= 3)) sandBad.push({live: true, vx: r3(v[0]), vy: r3(v[1])}); });
    var coherence = sand.length ? Math.hypot(mx, my) / sand.length : 0;
    check('blown sand drifts one way as legacy sand did (+x, 8-20 u/s)', sand.length >= 30 && later.length >= 5 && coherence >= 0.95 && !sandBad.length,
      {births: sand.length, live: later.length, coherence: r3(coherence), bad: sandBad.length, first: sandBad.slice(0, 3), legacy: {vx: [8, 20], vy: 3, vz: 1.5}});
    // Drawn radius: a mote spawned through the compiled ambient.dust recipe
    // (fxEmit, fixed seed; an empty biome keeps the field out of the pool) at
    // three distances, against legacy max(1, size x getScale3D('particle') x
    // projScale / fwd x 0.15) (15-render-hud-menu.js:614) with its legacy
    // size from the restated range [1, 2] at the particle's size draw
    // (attribute 1 of its seed, 11-fx-engine.js fxSpawn).
    startEndless(424242);
    var calls = [], base = G.ctx, savedTerrain = G.terrain, drawn = [], rD, dust = -1;
    S = G.fxState = G.createFxState(64, 6, {pinned: true, reserve: 0}); rD = S.C.ID['ambient.dust'];
    var rec = new Proxy({}, {
      get: function (o, k) {
        if (k in o) return o[k];
        var v = base[k];
        if (typeof v !== 'function') return v;
        return function () { calls.push([k].concat(Array.prototype.slice.call(arguments))); return v.apply(base, arguments); };
      },
      set: function (o, k, v) { o[k] = v; return true; }
    });
    try {
      G.terrain = 'void'; G.cam.pitch = 0; G.renderSurfaceAmbient = 0.9; G.playerUnderground = false;
      G.updateEffects(DT);
      G.fxEmit('ambient.dust', G.cam.x + 30, G.cam.y, G.playerFeetSpatialZ() + 10);
      G.updateEffects(DT);
      for (i = 0; i < S.count; i++) if (S.rec[i] === rD) dust = i;
      if (S.count !== 1 || dust !== 0) throw Error('SETUP D6 expected one emitted dust mote, pool ' + S.count);
      var legacySize = 1 + (2 - 1) * G.effectNoise(S.seedA[0], 1);
      [15, 25, 50].forEach(function (fwd) {
        var cam3 = G.getCam3D();
        S.x[0] = G.cam.x + Math.cos(G.cam.ang) * fwd; S.y[0] = G.cam.y + Math.sin(G.cam.ang) * fwd; S.z[0] = cam3.cameraZ;
        S.vx[0] = S.vy[0] = S.vz[0] = 0; S.age[0] = 2; S.life[0] = 5; S.flags[0] = 0;
        calls = []; G.ctx = rec;
        try { G.beginSceneDepthFrame(G.canvas.width, G.canvas.height); G.beginEffectFrame(); G.drawEffectLayer3D(0); } finally { G.ctx = base; }
        var shape = calls.filter(function (q) { return q[0] === 'rect' || q[0] === 'arc'; })[0];
        var r = !shape ? NaN : shape[0] === 'rect' ? shape[3] / 2 : shape[3];
        var legacy = Math.max(1, legacySize * G.getScale3D('particle') * G.projScale / fwd * 0.15);
        drawn.push({fwd: fwd, legacySize: r3(legacySize), drawn: r3(r), legacy: r3(legacy), ratio: r3(r / legacy)});
      });
    } finally { G.ctx = base; G.fxState = liveState; G.terrain = savedTerrain; }
    check('the drawn mote radius equals the legacy radius (size tier applied once)', drawn.length === 3 && drawn.every(function (d) { return near(d.drawn, d.legacy, 1e-3); }) &&
      drawn[0].legacy > 1.25 && drawn[2].legacy === 1, {drawn: drawn, projScale: G.projScale, tier: G.getScale3D('particle')});
  });

  // ── D7: profile priming is deterministic, private and restored ──────────
  if (needed('D7', ['--profile-shares-pool', '--field-global-serial', '--profile-seed-ignored'])) run('D7 browser profile', function () {
    startCave('chamber'); freshField(); effects(60);
    var live = G.fxState, liveBytes = poolBytes(live), job = {frozenTime: 2000000000000, randomSeed: 1234567, renderMs: [], stages: {}};
    G.caveProfilePrepareInputs(job);
    var p1 = G.fxState, b1 = poolBytes(p1), fields1 = G.getEffectStats().fields.ambient;
    G.caveProfileRestoreInputs(job);
    var restored = G.fxState === live && poolBytes(live) === liveBytes;
    check('the profile primes a fresh pinned pool, never the live one', p1 !== live && p1.pinned === true && p1.count >= 25 &&
      fields1.live === G.settings.particles && p1.stats.torchSpawned > 0 && restored,
      {fresh: p1 !== live, pinned: p1.pinned, count: p1.count, field: fields1, embers: p1.stats.torchSpawned, restored: restored});
    G.caveProfilePrepareInputs(job);
    var b2 = poolBytes(G.fxState);
    G.caveProfileRestoreInputs(job);
    // Negative control: the same profile under another seed primes other motes.
    var other = {frozenTime: job.frozenTime, randomSeed: 7654321, renderMs: [], stages: {}};
    G.caveProfilePrepareInputs(other);
    var b3 = poolBytes(G.fxState);
    G.caveProfileRestoreInputs(other);
    check('profile priming is deterministic and follows the profile seed', b1 === b2 && b3 !== b1 && G.fxState === live,
      {same: b1 === b2, otherSeedDiffers: b3 !== b1, bytes: b1.length});
    // Legacy: the old init and update under the profile's own seeded random.
    G.setEffectFamilyMode('ambient', 'legacy');
    var liveAmbient = G.ambientParticles, legacy = null;
    try {
      G.caveProfilePrepareInputs(job);
      legacy = {fresh: G.fxState !== live, motes: G.ambientParticles.length, temp: G.ambientParticles !== liveAmbient};
      G.caveProfileRestoreInputs(job);
      legacy.restored = G.fxState === live && G.ambientParticles === liveAmbient;
    } finally { G.setEffectFamilyMode('ambient', null); }
    check('a Legacy profile primes legacy motes and restores both inputs', legacy.fresh && legacy.temp && legacy.motes === G.AMBIENT_MAX && legacy.restored, legacy);
    // Cancel after a world regeneration: the old pool never comes back, and
    // the profile's pool (reset for the new world) stays live unpinned.
    G.caveProfilePrepareInputs(job);
    var cancelled = G.fxState;
    startCave('chamber');
    G.caveProfileRestoreInputs(job);
    check('a cancel after world regeneration never restores the old pool', G.fxState === cancelled && G.fxState !== live && cancelled.pinned === false,
      {old: G.fxState === live, kept: G.fxState === cancelled, pinned: cancelled.pinned});
    G.fxState = liveState; freshField();
  });

  // ── D8: fireflies at night, sparkle and shimmer by day, population constant
  if (needed('D8', ['--no-visibility-gate', '--gated-drop', '--suppress-any-weather'])) run('D8 day and night', function () {
    flatScene();
    var T = G.settings.particles, rows = [];
    function field(terrain, ambient, weather) {
      G.terrain = terrain; G.renderSurfaceAmbient = ambient;
      var S = G.fxState = G.createFxState(3072, 808, {pinned: true}), lo = Infinity, hi = 0;
      G.effectWeatherForce(weather ? 'rain' : 'clear', weather || 1);           // S7: the schedule sets the state every tick
      // Members that end their life inside a tick's integration are replaced
      // by the next tick's refill, so the count is read over the last second.
      for (var k = 0; k < 1200; k++) {
        G.updateEffects(DT);
        if (k >= 1140) { var c = members(S).length; lo = Math.min(lo, c); hi = Math.max(hi, c); }
      }
      var list = members(S), by = countBy(S, list);
      rows.push({terrain: terrain, ambient: ambient, weather: weather || 0, min: lo, max: hi, by: by});
      return {by: by};
    }
    try {
      var meadowDay = field('ground', 0.9), meadowNight = field('ground', 0.32), stormNight = field('ground', 0.32, 0.5), drizzleNight = field('ground', 0.32, 0.2);
      var frostDay = field('ice', 0.9), frostNight = field('ice', 0.32), dunesDay = field('expanse', 0.9), dunesNight = field('expanse', 0.32);
    } finally { G.fxState = liveState; }
    function n(r, id) { return r.by[id] || 0; }
    check('the meadow set is populated day and night', n(meadowDay, 'ambient.dust') > 0 && n(meadowNight, 'ambient.dust') > 0, rows.slice(0, 2));
    check('fireflies only at night, sparkle and shimmer only by day', n(meadowDay, 'ambient.firefly') === 0 && n(meadowNight, 'ambient.firefly') >= 2 &&
      n(frostDay, 'ambient.sparkle') >= 2 && n(frostNight, 'ambient.sparkle') === 0 && n(dunesDay, 'ambient.shimmer') >= 2 && n(dunesNight, 'ambient.shimmer') === 0,
      rows);
    // Weather at intensity 0.5 hides fireflies; a drizzle at 0.2, below the 0.3 threshold, does not.
    check('fireflies hide in weather above the suppression intensity', n(stormNight, 'ambient.firefly') === 0 && n(drizzleNight, 'ambient.firefly') >= 2 &&
      G.FX_WEATHER_RULES.fireflySuppress === 0.3, {storm: n(stormNight, 'ambient.firefly'), drizzle: n(drizzleNight, 'ambient.firefly'), rows: rows.slice(2, 4)});
    check('a gated member never lowers the population', rows.every(function (r) { return r.max === T && r.min >= T - 2; }),
      rows.map(function (r) { return [r.min, r.max]; }));
    // The mechanism: a hidden member's weight goes to the set's first shown
    // member, so every draw of the member choice lands on a shown member
    // (spawn and prewarm weights), whatever u is.
    var S = G.fxState = G.createFxState(3072, 809, {pinned: true}), lost = [];
    try {
      G.updateEffects(DT);
      var F = S.C.FIELDS[0];
      [['meadow', 0.9, 0, 'ambient.dust'], ['meadow', 0.32, 0.5, 'ambient.dust'], ['frost', 0.32, 0, 'ambient.snowflake'],
       ['dunes', 0.32, 0, 'ambient.sandDust']].forEach(function (c) {
        G.renderSurfaceAmbient = c[1]; S.weather.intensity = c[2];
        var list = F.sets[F.setNames.indexOf(c[0])], wrong = 0;
        [false, true].forEach(function (pre) {
          for (var k = 0; k < 1000; k++) { var r = G.fxFieldMember(S, list, (k + 0.5) / 1000, pre); if (r < 0 || S.C.LIST[r].id !== c[3]) wrong++; }
        });
        if (wrong) lost.push({set: c[0], ambient: c[1], weather: c[2], wrong: wrong});
      });
    } finally { G.fxState = liveState; }
    check("a hidden member's weight goes to the set's shown members", !lost.length, {draws: 2000, lost: lost});
  });

  // ── D9: the field puts motes in view (count metric) ──────────────────────
  if (needed('D9', ['--annulus-spawn'])) run('D9 motes in view', function () {
    // Share of motes inside the horizontal view cone over 300 ticks while the
    // camera turns (0.6 rad/s). Legacy on the same fixture is the control.
    function share(legacy) {
      startEndless(424242); G.updateDayNight(0);
      var S = G.fxState, tanHalf = Math.tan(G.cam.fov / 2), sum = 0, samples = 0, n0 = 0;
      if (legacy) G.setEffectFamilyMode('ambient', 'legacy');
      try {
        G.updateEffects(DT);
        for (var k = 0; k < 300; k++) {
          G.cam.ang += 0.01; G.updateEffects(DT);
          var pts = legacy ? G.ambientParticles.map(function (p) { return [p.x, p.y]; }) : members(S).map(function (i) { return [S.x[i], S.y[i]]; }), inView = 0;
          pts.forEach(function (p) {
            var dx = p[0] - G.cam.x, dy = p[1] - G.cam.y, c = Math.cos(G.cam.ang), s = Math.sin(G.cam.ang), fwd = dx * c + dy * s;
            if (fwd >= 1 && Math.abs((-dx * s + dy * c) / fwd) <= tanHalf) inView++;
          });
          if (pts.length) { sum += inView / pts.length; samples++; n0 = pts.length; }
        }
      } finally { G.setEffectFamilyMode('ambient', null); }
      return {share: samples ? sum / samples : 0, samples: samples, count: n0};
    }
    var fieldShare = share(false), legacyShare = share(true);
    check('the legacy annulus control keeps most motes out of view', legacyShare.samples === 300 && legacyShare.count >= 20 && legacyShare.share < 0.3, legacyShare);
    check('the field puts motes in view', fieldShare.samples === 300 && fieldShare.count === G.settings.particles && fieldShare.share >= 0.4,
      {field: fieldShare, legacy: legacyShare, threshold: 0.4});
  });

  // ── D10: field composition. (a) The member choice is independent of where
  // its column landed. On an authored surface stripe (support only in grid
  // rows 38-43, the far quarter of the box's y range), most columns are
  // refused, so many spawns take a 2nd, 3rd or 4th column; the frost set's
  // day mix over 3,000 direct field spawns must match its weights (snowflake
  // 0.6, sparkle 0.4), within 0.035 (about 4 standard errors).
  if (needed('D10 composition', ['--member-shares-column-noise'])) run('D10 composition', function () {
    stripeScene(38, 43); G.terrain = 'ice'; G.renderSurfaceAmbient = 0.9;
    var S = G.fxState = G.createFxState(3072, 606, {pinned: true}), by = {}, got = 0, tries = 0;
    try {
      G.updateEffects(DT);
      var F = S.C.FIELDS[0], st = S.fields[0], list = F.sets[F.setNames.indexOf('frost')], refused0 = S.stats.refusedNoSupport;
      while (got < 3000 && tries < 30000) {
        tries++; S.spawnLeft = 1e9;
        if (!G.fxFieldSpawn(S, F, st, list, false)) continue;
        got++; var id = recipeOf(S, S.count - 1); by[id] = (by[id] || 0) + 1;
        G.fxKill(S, S.count - 1);
      }
      var refused = S.stats.refusedNoSupport - refused0;
    } finally { G.fxState = liveState; }
    var share = (by['ambient.sparkle'] || 0) / Math.max(1, got);
    check('the D10 stripe refuses most columns but still spawns', got === 3000 && tries < 7000 && refused > 0, {spawns: got, tries: tries, refusedAfter4: refused});
    check('the field member is independent of where its column landed', Math.abs(share - 0.4) <= 0.035,
      {sparkle: r3(share), by: by, weights: {'ambient.snowflake': 0.6, 'ambient.sparkle': 0.4}, tolerance: 0.035});
  });

  // (b) A prewarm starts at the steady state. In the Cave Test chamber the
  // drip share of the live field is measured over 50 s of a settled run; 40
  // fresh pools (seeds 1000-1039) then each prime the field in one tick, and
  // their drip share must match it (spawn weights would give 0.45 against a
  // live share near 0.11). Every prewarmed drip is then followed to its end:
  // the drips start spread along their fall (median at 25-75% of the way
  // down) and each ends on the cave floor, none expiring mid-air.
  if (needed('D10 prewarm', ['--prewarm-spawn-weights', '--prewarm-drips-at-ceiling'])) run('D10 prewarm', function () {
    startCave('chamber'); freshField();
    var live = G.fxState, rD = live.C.ID['ambient.drip'], sum = 0, samples = 0, k, i;
    for (k = 0; k < 3600; k++) {
      G.updateEffects(DT);
      if (k < 600 || k % 10) continue;
      var d = 0, m = 0;
      for (i = 0; i < live.count; i++) if ((live.flags[i] & 64) && !(live.flags[i] & 16)) { m++; if (live.rec[i] === rD) d++; }
      sum += d / m; samples++;
    }
    var steady = sum / samples, pre = {drips: 0, members: 0}, fractions = [], followed = 0, midAir = [];
    try {
      for (var seed = 1000; seed < 1040; seed++) {
        var S = G.fxState = G.createFxState(3072, seed, {pinned: true}), track = {};
        G.updateEffects(DT);
        for (i = 0; i < S.count; i++) {
          if (!(S.flags[i] & 64)) continue;
          pre.members++;
          if (S.rec[i] !== rD) continue;
          pre.drips++;
          var floor = G.sampleSpatialSupportZ(S.x[i], S.y[i], NaN, true), roof = G.getCaveSpaceAt(S.x[i], S.y[i], floor / 25).ceilingH * 25 - 2;
          fractions.push((roof - S.z[i]) / (roof - floor));                  // 0 at the ceiling, 1 on the floor
          track[S.seedA[i]] = {x: S.x[i], y: S.y[i], z: S.z[i], vz: S.vz[i]};
        }
        for (k = 0; k < 240; k++) {
          G.updateEffects(DT);
          var alive = {};
          for (i = 0; i < S.count; i++) {
            var o = track[S.seedA[i]];
            if (!o) continue;
            alive[S.seedA[i]] = 1; o.x = S.x[i]; o.y = S.y[i]; o.z = S.z[i]; o.vz = S.vz[i];
          }
          Object.keys(track).forEach(function (sd) {
            var o = track[sd];
            if (alive[sd] || o.done) return;
            o.done = true; followed++;
            var above = o.z - G.sampleSpatialSupportZ(o.x, o.y, NaN, true);
            if (above > Math.abs(o.vz) * DT + 1) midAir.push({seed: seed, above: r3(above)});
          });
        }
      }
    } finally { G.fxState = liveState; }
    fractions.sort(function (a, b) { return a - b; });
    var share = pre.drips / Math.max(1, pre.members), median = fractions.length ? fractions[fractions.length >> 1] : NaN;
    check('a prewarm starts in the steady-state mix', samples >= 300 && pre.members >= 900 && Math.abs(share - steady) <= 0.05,
      {steadyDripShare: r3(steady), prewarmDripShare: r3(share), prewarmMembers: pre.members, tolerance: 0.05});
    check('prewarmed drips fall from spread heights and land on the cave floor', pre.drips >= 40 && followed === pre.drips &&
      median >= 0.25 && median <= 0.75 && !midAir.length,
      {drips: pre.drips, followed: followed, fallDone: [r3(fractions[0]), r3(median), r3(fractions[fractions.length - 1])], midAir: midAir.length, first: midAir.slice(0, 3)});
    freshField();
  });

  // Settle: the live pool is back, no runtime failure was hidden.
  G.fxState = liveState; G.fxSpawn = realSpawn;
  var fx = G.getEffectStats().failures, failedKeys = Object.keys(fx).filter(function (k) { return fx[k]; });
  check('no effect runtime failures were counted', !failedKeys.length, {failures: fx, warnings: warnings.slice(0, 3)});
  check('no console errors from the game', !G.__ambientErrors.length, {errors: G.__ambientErrors.slice(0, 3)});
  Math.random = originalRandom;
  output('EFFECT_AMBIENT_RESULT ' + (failed ? 'FAIL ' + failed + '/' + checked : 'PASS ' + checked));
}());
undefined;
