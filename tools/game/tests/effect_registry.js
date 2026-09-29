// Effect registry lifecycle contracts (unified effects V1, slices S1-S2a). A
// full-game host runs the real generator, chunk streaming (updateChunks ->
// assembleWindow), resets, fixed ticks and draw functions. Risks covered: effect
// records drifting 480 u after a chunk shift (chain arcs, novas, cones, stat
// pickups, the lob reticle), bone debris surviving a level change, chain arcs
// and novas that only expire when drawn, prune predicates drifting from the
// legacy lists, a family missing from a lifecycle list, malformed records
// dropped silently, legacy ambient motes lost after a reset, and a world reset
// erasing what assembly built. Oracles are authored world coordinates, chunk
// generation data, legacy predicates restated here, the pre-registry
// interpolation group literal and the legacy code path.
// S2a adds the registry services and the engine's gameplay boundary: the
// legacy ambient init on its private stream (A11), toggles in the
// render-feature shape, the live budget table, family modes and the
// persistent legacy stream (R1-R4), a cosmetic tick or emit failure never
// reaching gameplay (A13), events queued before a window shift (A14) and
// gameplay invariance under density, toggles and Legacy/New (I1). They run
// on a test-local recipe table (spec 11.1).
// S3: S1b (the user's Q1 answer) clears soul orbs, tomes and stat pickups at
// a level change (A4); ambient and torch embers migrate, so A11's legacy half
// runs with the ambient family held on its legacy path and a New-mode half
// checks that every reset primes the engine's ambient field; I1 replays on
// the shipping table plus the test recipes, its spawn prerequisite met by the
// shipping ambient field; I2 allows the browser profile's fxState swap.
// S4: bones and the feedback bursts migrate. A4 kills in both modes (pool
// bones and legacy deathEffects) and clears both; A14 adds a real enemy death
// in the crossing tick; I1 also requires the real producers' events; R3
// follows the migrated set.
// S5: A13 adds a throwing projectileContact reader during a real wall hit
// (the shot is still consumed and gameplay matches a working reader), and
// checks where the working reader starts that hit's debris against the
// generated world's wall (cell bounds, solid span); I1 also requires a real
// projectile contact event. A13's contact half replays its own seeded
// Endless wall hit rather than I1's replay (spec 11.2 A13 names I1's hash):
// the same gameplay-hash oracle on a scenario that provably reaches the reader.
// S7: I1 also requires the forced-rain variant to rain (and off, Legacy and
// Particles 0 not to). S6: I1 also requires the movement observers' footsteps from its walk in
// every variant with Footstep dust on, and none where it is off (the
// gameplay hash and Math.random count stay the verdict).
// Mutations are applied to slurped sources only (anchors match exactly once):
//   --registry-skip-chain   --stat-rebase-xy        --skip-lob-target
//   --no-level-reset-bones  --render-prune-only     --prune-le-impacts
//   --drop-studio-key       --drop-draw2d-decision  --declare-future-stage
//   --no-malformed-count    --reset-without-prime   --reset-after-assembly
//   --prime-before-assembly --drop-pose-coins       --chain-no-shape-check
//   --late-family-no-studio-key                     --unguarded-rebase
//   --legacy-prime-gameplay-stream --toggle-no-generation --budget-ignores-reserve
//   --family-ignores-unified --legacy-rng-per-call  --unguarded-entry
//   --unguarded-emit        --no-ring-rebase        --no-pool-rebase
//   --cosmetic-math-random  --toggle-init-redefines --toggle-listener-twice
//   --gameplay-reads-fx     --orbs-survive-level    --pickups-survive-level
//   --engine-reset-without-prime --engine-no-level-reset --throwing-reader
//   --debris-far-side
// Pin guidance: moving the chain-arc and nova prune into the simulation changes
// no pixels, gameplay state or random stream, but in 2D the Canvas command
// stream at an expiry tick loses one empty save/translate/restore/globalAlpha=1
// (the renderer now returns early on an empty array). A8 covers impacts only.
(function () {
  var G = (0, eval)('this'), output = (__engine === 'node' || __engine === 'deno') ? console.log.bind(console) : __out;
  var checked = 0, failed = 0, loadErrors = [], warnings = [], originalRandom = Math.random;
  var ACTORS = ['enemies', 'projectiles', 'companions', 'fortressAllies'];
  // Independent oracle for the interpolation groups: the pre-registry
  // _renderGroups literal (02-render-interpolation.js:11-12 at c6851a4) minus
  // impacts, in its order.
  var LEGACY_GROUPS = ACTORS.concat(['deathEffects', 'soulOrbs', 'coinDrops', 'statPickups', 'arcaneTomes', 'ambientParticles']);
  // Families that assembleWindow shifted by hand before the registry, plus
  // chain arcs and novas (never shifted before; combat-8, infra-2).
  var SHIFTED = ['impacts', 'coneEffects', 'groundEffects', 'chainEffects', 'novaEffects', 'deathEffects',
    'soulOrbs', 'coinDrops', 'arcaneTomes'];
  function has(flag) { return __argv.indexOf(flag) >= 0; }
  // The default run executes every case. A mutation run aimed at another
  // check skips the slow S2 replays (I1, A14) and says so.
  var mutationRun = __argv.some(function (a) { return /^--/.test(a); });
  function needed(name, flags) {
    if (!mutationRun || flags.some(has)) return true;
    output('SKIP ' + name + ' (mutation run for another check)');
    return false;
  }
  // A mutation run aimed at an S2a check also skips the S1 world-lifecycle
  // cases (about 30 s of world generation); the S2a cases start their own worlds.
  var S2A_FLAGS = ['--legacy-prime-gameplay-stream', '--toggle-no-generation', '--budget-ignores-reserve', '--family-ignores-unified',
    '--legacy-rng-per-call', '--unguarded-entry', '--unguarded-emit', '--no-ring-rebase', '--no-pool-rebase', '--cosmetic-math-random',
    '--toggle-init-redefines', '--toggle-listener-twice', '--gameplay-reads-fx', '--engine-reset-without-prime', '--throwing-reader', '--debris-far-side'];
  var s1Cases = !mutationRun || !S2A_FLAGS.some(has), s1Skipped = [];
  function s1run(name, fn) { if (s1Cases) run(name, fn); else s1Skipped.push(name); }
  function mutate(source, flag, before, after) {
    if (!has(flag)) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + flag);
    return source.replace(before, after);
  }
  G.__registrySource = function (path, source) {
    if (path === 'src/02-effect-registry.js') {
      source = mutate(source, '--registry-skip-chain', "keep:'le',rebase:'chain'", "keep:'le',rebase:'none'");
      source = mutate(source, '--stat-rebase-xy', "rebase:'rebuilt'", "rebase:'xy'");
      source = mutate(source, '--no-level-reset-bones', "step:'legacyBones',rebase:'xy',reset:'level world'", "step:'legacyBones',rebase:'xy',reset:'world'");
      source = mutate(source, '--orbs-survive-level', "soulOrbs:{storage:'array',prune:'owner',rebase:'xy',reset:'level world'",
        "soulOrbs:{storage:'array',prune:'owner',rebase:'xy',reset:'world'");
      source = mutate(source, '--pickups-survive-level', "statPickups:{storage:'array',prune:'owner',rebase:'rebuilt',reset:'level world'",
        "statPickups:{storage:'array',prune:'owner',rebase:'rebuilt',reset:'world'");
      source = mutate(source, '--pickups-survive-level', "arcaneTomes:{storage:'array',prune:'owner',rebase:'xy',reset:'level world'",
        "arcaneTomes:{storage:'array',prune:'owner',rebase:'xy',reset:'world'");
      source = mutate(source, '--render-prune-only', "chainEffects:{storage:'array',life:'lifeMs',prune:'sim'", "chainEffects:{storage:'array',life:'lifeMs',prune:'owner'");
      source = mutate(source, '--render-prune-only', "novaEffects:{storage:'array',life:'lifeMs',prune:'sim'", "novaEffects:{storage:'array',life:'lifeMs',prune:'owner'");
      source = mutate(source, '--prune-le-impacts', "impacts:{storage:'array',life:'lifeMs',prune:'sim',keep:'lt'", "impacts:{storage:'array',life:'lifeMs',prune:'sim',keep:'le'");
      source = mutate(source, '--drop-draw2d-decision', ",draw3D:'impacts3D',draw2D:'impacts2D'}", ",draw3D:'impacts3D'}");
      // fx2D exists from S2 and draws soul orbs from S4, so the future stage
      // is one no slice adds.
      source = mutate(source, '--declare-future-stage', "draw3D:'soulOrbs3D',draw2D:'fx2D'}", "draw3D:'soulOrbs3D',draw2D:'soulOrbs2D'}");
      source = mutate(source, '--no-malformed-count', "if (isNaN(effectLifetimeProgress(r, now, d.life))) _effectMalformed(d.name);", '');
      source = mutate(source, '--reset-without-prime', 'hooks:{prime:effectAmbientLegacyPrime,studio:', 'hooks:{studio:');
      source = mutate(source, '--drop-pose-coins', "coinDrops:{storage:'array',prune:'owner',rebase:'xy',reset:'level world',interp:'pose',",
        "coinDrops:{storage:'array',prune:'owner',rebase:'xy',reset:'level world',interp:'none',");
      source = mutate(source, '--chain-no-shape-check',
        'else if (r && Number.isFinite(r.fromX + r.fromY) && Array.isArray(r.targets) && r.targets.every(_effectFinitePoint)) {', 'else if (r) {');
      source = mutate(source, '--late-family-no-studio-key',
        "  if (typeof _castingStudioKeys !== 'undefined') _castingStudioKeys = _castingStudioKeys.concat(effectRegistryStudioKeys(_castingStudioKeys));\n", '');
      source = mutate(source, '--unguarded-rebase', "      if (d.hooks.rebase) d.hooks.rebase(sx, sy);\n    } catch (e) { effectFailure('rebase', e); }",
        "      if (d.hooks.rebase) d.hooks.rebase(sx, sy);\n    } catch (e) { throw e; }");
      source = mutate(source, '--legacy-prime-gameplay-stream', "  if (effectFamilyMode('ambient') === 'legacy') effectWithLegacyRandom(initAmbientParticles);",
        "  if (effectFamilyMode('ambient') === 'legacy') initAmbientParticles();");
      source = mutate(source, '--toggle-no-generation', '  else if (EFFECT_TOGGLES[key] !== value) { EFFECT_TOGGLES[key] = value; _effectToggleGen++; }',
        '  else if (EFFECT_TOGGLES[key] !== value) { EFFECT_TOGGLES[key] = value; }');
      source = mutate(source, '--budget-ignores-reserve', 'B = Math.max(0, Math.min(cap - res, EFFECT_CONFIG.budgetPerSetting * P))',
        'B = Math.max(0, Math.min(cap, EFFECT_CONFIG.budgetPerSetting * P))');
      source = mutate(source, '--family-ignores-unified', "  return effectToggleOn('fxUnified') ? 'new' : 'legacy';", "  return 'new';");
      source = mutate(source, '--legacy-rng-per-call', '  Math.random = _effectLegacyRandom;\n',
        '  Math.random = _effectLegacyRandom;\n  _effectLegacyTarget.legacyRng = (fxState.seed ^ fxState.tick) >>> 0;\n');
      source = mutate(source, '--toggle-init-redefines', '      catch (e) { if (renderFeatureValue(d.key, _effectNone) === _effectNone) throw e; }',
        '      catch (e) { throw e; }');
      source = mutate(source, '--toggle-listener-twice',
        "    if (typeof onRenderFeaturesChange === 'function' && _effectToggleListened.indexOf(onRenderFeaturesChange) < 0) {",
        "    if (typeof onRenderFeaturesChange === 'function') {");
    }
    if (path === 'src/10-combat.js' && has('--gameplay-reads-fx')) source += '\nfunction _probeReadsFx() { return fxState.count; }\n';
    if (path === 'src/11-fx-engine.js') {
      source = mutate(source, '--unguarded-entry', "  } catch (e) { effectFailure('updateEffects', e); }\n", '  } finally {}\n');
      source = mutate(source, '--unguarded-emit', "  } catch (e) { effectFailure('fxEmit', e); return false; }\n", '  } finally {}\n');
      // A reader's throw leaves fxEvent (the producer's call site) unguarded.
      source = mutate(source, '--throwing-reader', "  } catch (err) { effectFailure('fxEvent', err); }\n", '  } finally {}\n');
      // The wall normal pointing into the struck cell: debris behind the face.
      source = mutate(source, '--debris-far-side', '    sx = qx + nx * 0.75; sy = qy + ny * 0.75; sz = qz + nz * 0.75;',
        '    nx = -nx; ny = -ny; nz = -nz; sx = qx + nx * 0.75; sy = qy + ny * 0.75; sz = qz + nz * 0.75;');
      source = mutate(source, '--no-ring-rebase', '  for (var e = 0; e < ev.count; e++) { var k = (ev.head + e) % ev.n; ev.x[k] -= sx; ev.y[k] -= sy; }\n', '');
      source = mutate(source, '--no-pool-rebase', '  for (var i = 0; i < n; i++) if (!(fl[i] & (FX_EYE | FX_SCREEN))) { S.x[i] -= sx; S.y[i] -= sy; }\n', '');
      source = mutate(source, '--cosmetic-math-random', '  var R = S.R, st = S.stats, seed = (effectNoise(',
        '  Math.random();\n  var R = S.R, st = S.stats, seed = (effectNoise(');
      source = mutate(source, '--engine-reset-without-prime', 'hooks:{rebase:fxRebase, reset:fxReset, prime:fxPrime, studio:fxStudioInstall}',
        'hooks:{rebase:fxRebase, reset:fxReset, studio:fxStudioInstall}');
      // The engine family outliving a classic level change: its pool (bones
      // since S4) carries into the next map (the S4 review's probe).
      source = mutate(source, '--engine-no-level-reset', "registerEffectFamily('fxState', {storage:'engine', life:'engine', prune:'none', rebase:'engine', reset:'level world',",
        "registerEffectFamily('fxState', {storage:'engine', life:'engine', prune:'none', rebase:'engine', reset:'world',");
    }
    if (path === 'src/05-endless-world.js') {
      source = mutate(source, '--skip-lob-target', "      if (projectiles[pi].isLob) { projectiles[pi].targetX -= shiftX; projectiles[pi].targetY -= shiftY; }\n", '');
      source = mutate(source, '--reset-after-assembly', "  if (typeof effectRegistryReset === 'function') effectRegistryReset('world');\n\n  // Set window at origin", "\n  // Set window at origin");
      source = mutate(source, '--reset-after-assembly', "  if (typeof effectRegistryPrime === 'function') effectRegistryPrime('world'); else initAmbientParticles();",
        "  if (typeof effectRegistryReset === 'function') effectRegistryReset('world');\n  if (typeof effectRegistryPrime === 'function') effectRegistryPrime('world'); else initAmbientParticles();");
      source = mutate(source, '--prime-before-assembly', "  if (typeof effectRegistryReset === 'function') effectRegistryReset('world');\n\n",
        "  if (typeof effectRegistryReset === 'function') { effectRegistryReset('world'); effectRegistryPrime('world'); }\n\n");
      source = mutate(source, '--prime-before-assembly', "  if (typeof effectRegistryPrime === 'function') effectRegistryPrime('world'); else initAmbientParticles();",
        "  if (typeof effectRegistryPrime !== 'function') initAmbientParticles();");
    }
    if (path === 'src/20-casting-preview.js') {
      source = mutate(source, '--drop-studio-key', "if (typeof effectRegistryStudioKeys === 'function') _castingStudioKeys = _castingStudioKeys.concat(effectRegistryStudioKeys(_castingStudioKeys));",
        '// Mutation: the studio key hook was dropped in a merge.');
    }
    return source;
  };
  // A later fragment (for example spell slice 5's halo globals) registers a
  // family with one call at load; the probe must reach the run reset and the
  // studio key list without any other edit.
  var PROBE = "registerEffectFamily('a7Probe',{storage:'globals',globals:'a7ProbeFlag',resetValues:{a7ProbeFlag:false}," +
    "reset:'run',studio:'copy',owner:'test',draw3D:{none:'probe'},draw2D:{none:'probe'}});";
  G.__registryLoad = function (path) {
    try {
      (0, eval)(G.__registrySource(path, slurp('assets/games/' + path)));
      if (path === 'src/02-effect-registry.js') (0, eval)(PROBE);
    } catch (e) {
      if (/^MUTATION_ANCHOR/.test(e.message)) throw e;
      loadErrors.push(path + ': ' + e.message);
    }
  };
  var host = slurp('tools/game/tests/cave_occlusion_integration.js');
  var end = host.indexOf('  function check(name, okay) {');
  if (end < 0) throw Error('SETUP registry host boundary missing');
  host = host.slice(0, end);
  var load = "manifest.parts.MAIN.forEach(function (path) { (0, eval)(slurp('assets/games/' + path)); });";
  if (host.split(load).length !== 2) throw Error('SETUP registry manifest boundary missing');
  host = host.replace(load, 'manifest.parts.MAIN.forEach(G.__registryLoad);');
  (0, eval)(host + 'G.__registryErrors = errors; }());');
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
  function near(a, b, tol) { return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= (tol || 1e-6); }
  function lcg(seed) { var s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
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
  }
  function windowChunks() {
    var list = [];
    for (var dy = 0; dy < G.WINDOW_CHUNKS; dy++) for (var dx = 0; dx < G.WINDOW_CHUNKS; dx++) {
      var chunk = G.chunks[(G.windowCX + dx) + ',' + (G.windowCY + dy)];
      if (chunk) list.push(chunk);
    }
    return list;
  }
  // Oracle: generation data, not assembly output. Nothing is collected yet.
  function chunkStatPickups() {
    return windowChunks().filter(function (c) { return c.ruin && c.ruin.statPickup; }).map(function (c) {
      var sp = c.ruin.statPickup;
      return {type: sp.type, x: sp.wx - G.windowOriginX, y: sp.wy - G.windowOriginY};
    });
  }
  function sortXY(list) { return list.slice().sort(function (a, b) { return a.x - b.x || a.y - b.y; }); }
  function samePickups(actual, expected) {
    if (actual.length !== expected.length) return false;
    var a = sortXY(actual), b = sortXY(expected);
    return a.every(function (p, i) { return p.type === b[i].type && near(p.x, b[i].x) && near(p.y, b[i].y); });
  }
  function statErrors() {
    return G.statPickups.map(function (sp) { return [sp.x + G.windowOriginX - sp.wx, sp.y + G.windowOriginY - sp.wy]; });
  }
  function crossEast() {
    var half = Math.floor(G.WINDOW_CHUNKS / 2), before = G.windowOriginX;
    G.pos.x = (G.windowCX + half + 1) * G.CHUNK_SIZE - G.windowOriginX + 2; G.cam.x = G.pos.x;
    G.updateChunks();
    return G.windowOriginX - before;
  }
  function sameCentre() {
    var half = Math.floor(G.WINDOW_CHUNKS / 2), ox = G.windowOriginX, oy = G.windowOriginY;
    G.assembleWindow(G.windowCX + half, G.windowCY + half);
    return G.windowOriginX === ox && G.windowOriginY === oy;
  }
  function ambientCheck(label, expected, log) {
    var primed = G.ambientParticles.length;
    G.updateAmbientParticles(1 / 60);
    log.push({reset: label, expected: expected, afterReset: primed, afterTick: G.ambientParticles.length});
  }

  // A family without a draw decision stops the game at load; only that
  // compiler error counts for the draw-decision check, any other load error
  // is reported on its own.
  var drawErrors = loadErrors.filter(function (e) { return /^src\/02-effect-registry\.js: Effect family \w+: missing draw[23]D decision$/.test(e); });
  if (drawErrors.length) check('every family states a 2D and a 3D draw decision', false, {loadErrors: drawErrors});
  check('every game fragment loads without an error', !loadErrors.length, {loadErrors: loadErrors});
  if (loadErrors.length) {
    output('EFFECT_REGISTRY_RESULT FAIL ' + failed + '/' + checked + ' (load failed; scenarios not run)');
    return;
  }

  var ambientLog = [], startupAmbient = G.AMBIENT_MAX, a12Seed = 777, a12List = null, a1Stat = null;
  function malformedCount(name) { return G.getEffectStats().registry.malformed[name] || 0; }

  // A11 (fresh load) and A12: the world clear runs before assembly, the prime
  // after the player is placed. From S3 the ambient family is migrated; the
  // legacy half of A11 holds it on its legacy path through the S1 cases (a
  // console override, never persisted) and the New half follows them.
  G.setEffectFamilyMode('ambient', 'legacy');
  s1run('A11/A12 first world reset', function () {
    check('fresh load uses the startup ambient budget of 35', startupAmbient === 35, {AMBIENT_MAX: startupAmbient});
    startEndless(777);
    ambientCheck('first resetEndlessMode', 35, ambientLog);
    if (!chunkStatPickups().length) {
      for (var s = 1; s <= 2000 && !chunkStatPickups().length; s++) startEndless(a12Seed = s);
    }
    var expected = chunkStatPickups();
    check('the spawn window has a ruin stat pickup (seed prerequisite)', expected.length > 0 && !Object.keys(G.collectedStatPickups).length,
      {seed: a12Seed, count: expected.length});
    check('the world reset never erases what assembly built', samePickups(G.statPickups, expected),
      {seed: a12Seed, expected: expected, actual: G.statPickups.map(function (p) { return {type: p.type, x: p.x, y: p.y}; })});
    var torches = 0;
    windowChunks().forEach(function (c) { (c.wallDecorations || []).forEach(function (d) { if (d.type === 'torch' || d.type === 'sconce') torches++; }); });
    check('point lights exist where the window has torches', torches > 0 && G.pointLights.length > 0, {torches: torches, lights: G.pointLights.length});
    a12List = G.statPickups.map(function (p) { return {type: p.type, x: p.x, y: p.y}; });
    startEndless(a12Seed);
    ambientCheck('same-seed resetEndlessMode', 35, ambientLog);
    check('a same-seed second reset rebuilds the same stat pickups', samePickups(G.statPickups, a12List) && samePickups(G.statPickups, chunkStatPickups()),
      {first: a12List, second: G.statPickups.map(function (p) { return {type: p.type, x: p.x, y: p.y}; })});
    if (a12Seed !== 777) startEndless(777);
  });

  // A1 + A3: one sentinel per shifted family 2 u from the east chunk edge, a
  // real in-flight poison lob and a companion, then a real updateChunks shift.
  s1run('A1/A3 chunk shift', function () {
    G.startGameClock(); G.clearGameplayInput();
    var half = Math.floor(G.WINDOW_CHUNKS / 2), edge = (G.windowCX + half + 1) * G.CHUNK_SIZE - G.windowOriginX;
    var y0 = G.pos.y, now = G.gameTimeNow(), records = {};
    SHIFTED.forEach(function (name, i) {
      var r = name === 'chainEffects' ?
        {fromX: edge - 2, fromY: y0, fromZ: 30, targets: [{x: edge - 30, y: y0 + 6, z: 30}, {x: edge - 2, y: y0 - 9, z: 30}], spawnMs: now, lifeMs: 1e9} :
        {x: edge - 2, y: y0 + i, z: 10, spawnMs: now, lifeMs: 1e9, duration: 1e9, radius: 20, renderFloorZ: 0};
      G[name] = [r]; records[name] = r;
    });
    // A chain record without target points must be counted and left alone
    // (section 2.2), never throw inside assembleWindow.
    var badChain = {fromX: 1, fromY: 2, targets: null, spawnMs: now, lifeMs: 1e9};
    G.chainEffects.push(badChain);
    var badBefore = malformedCount('chainEffects'), rebaseFailures = G.getEffectStats().failures.rebase;
    G.cam.ang = 0; G.cam.pitch = 0; G.pos.x = edge - 60; G.cam.x = G.pos.x;
    G.projectiles = []; G.spawnLobProjectile(G.spells.poison);
    var lob = G.projectiles[0], companion = {x: edge - 20, y: y0 + 3};
    G.companions = [companion];
    function world(r) {
      return r.targets ? [r.fromX + G.windowOriginX, r.fromY + G.windowOriginY].concat(r.targets.map(function (t) { return [t.x + G.windowOriginX, t.y + G.windowOriginY]; })) :
        [r.x + G.windowOriginX, r.y + G.windowOriginY];
    }
    var before = {}, lobBefore = lob && [lob.x + G.windowOriginX, lob.y + G.windowOriginY, lob.targetX + G.windowOriginX, lob.targetY + G.windowOriginY];
    var companionBefore = world(companion);
    SHIFTED.forEach(function (name) { before[name] = JSON.stringify(world(records[name])); });
    var shift = crossEast();
    // A2 audits this crossing's stat pickups before the same-centre control below rebuilds them.
    a1Stat = {shift: shift, errors: statErrors()};
    check('the crossing is a real 480 u window shift', shift === 480 && G.CHUNK_SIZE === 480, {shift: shift, chunk: G.CHUNK_SIZE});
    check('malformed chain records are counted and left in place at a shift', G.chainEffects[1] === badChain &&
      badChain.fromX === 1 && badChain.fromY === 2 && badChain.targets === null && malformedCount('chainEffects') - badBefore === 1 &&
      G.getEffectStats().failures.rebase === rebaseFailures,
      {record: badChain, counted: malformedCount('chainEffects') - badBefore, rebaseFailures: G.getEffectStats().failures.rebase - rebaseFailures});
    G.chainEffects.splice(1, 1);
    function kept(name) { return G[name][0] === records[name] && before[name] === JSON.stringify(world(records[name])); }
    check('chain arcs keep their world position across a chunk shift', kept('chainEffects'),
      {before: before.chainEffects, after: JSON.stringify(world(records.chainEffects))});
    check('novas keep their world position across a chunk shift', kept('novaEffects'), {before: before.novaEffects, after: JSON.stringify(world(records.novaEffects))});
    check('cones keep their world position across a chunk shift', kept('coneEffects'), {before: before.coneEffects, after: JSON.stringify(world(records.coneEffects))});
    var drifted = SHIFTED.filter(function (name) { return !kept(name); });
    check('every rebased effect family keeps its world position across a chunk shift', !drifted.length, {drifted: drifted});
    check('projectiles and companions move exactly once across the shift', !!lob && lob.isLob &&
      near(lob.x + G.windowOriginX, lobBefore[0]) && near(lob.y + G.windowOriginY, lobBefore[1]) &&
      JSON.stringify(world(companion)) === JSON.stringify(companionBefore), {lob: !!lob, companion: world(companion), before: companionBefore});
    check('the lob reticle stays on its landing point across a chunk shift', !!lob &&
      near(lob.targetX + G.windowOriginX, lobBefore[2]) && near(lob.targetY + G.windowOriginY, lobBefore[3]),
      {before: lobBefore && lobBefore.slice(2), after: lob && [lob.targetX + G.windowOriginX, lob.targetY + G.windowOriginY]});
    var local = JSON.stringify(SHIFTED.map(function (n) { return world(records[n]); })) + JSON.stringify(lob && [lob.x, lob.targetX]);
    var centred = sameCentre();
    check('same-centre reassembly leaves every effect in place', centred &&
      local === JSON.stringify(SHIFTED.map(function (n) { return world(records[n]); })) + JSON.stringify(lob && [lob.x, lob.targetX]));
    G.companions = []; G.projectiles = [];
  });

  // A2: ten eastward crossings of seed 777 (the first was A1's, audited there).
  s1run('A2 stat pickups', function () {
    if (!a1Stat) throw Error('SETUP A2 needs the A1 crossing');
    var shifts = [a1Stat.shift], seen = 0, bad = [], centred = null;
    function audit(i, errors) {
      seen += errors.length;
      errors.forEach(function (e) { if (!near(e[0], 0) || !near(e[1], 0)) bad.push({crossing: i, error: e}); });
      // Positive control: a same-centre reassembly (shift 0) of that window.
      if (errors.length && !centred) {
        var same = sameCentre(), after = statErrors();
        centred = {same: same, count: after.length, errors: after, ok: same && after.length === errors.length &&
          after.every(function (e) { return near(e[0], 0) && near(e[1], 0); })};
      }
    }
    audit(0, a1Stat.errors);
    for (var i = 1; i < 10; i++) { shifts.push(crossEast()); audit(i, statErrors()); }
    check('ten eastward crossings each shift 480 u and meet a stat pickup', shifts.length === 10 && shifts.every(function (s) { return s === 480; }) && seen > 0,
      {shifts: shifts, pickupsSeen: seen});
    // Historical defect (audit D20): a second shift leaves every pickup exactly [-480,0] off.
    var distinct = [];
    bad.forEach(function (b) {
      var e = JSON.stringify(b.error.map(function (v) { return Math.round(v * 1e6) / 1e6; }));
      if (distinct.indexOf(e) < 0) distinct.push(e);
    });
    check('stat pickups stay on their ruin across a chunk shift', !bad.length,
      {seed: 777, bad: bad.length, crossings: bad.map(function (b) { return b.crossing; }), distinct: distinct.map(JSON.parse), first: bad.slice(0, 2)});
    check('same-centre reassembly keeps stat pickups on their ruin', !!centred && centred.ok, centred);
  });

  // A5: records expire through real fixed ticks while nothing is drawn.
  s1run('A5 simulation expiry', function () {
    var draws = 0, spied = ['renderFrame', 'drawChainEffects2D', 'drawChainEffects3D', 'drawNovaEffects2D', 'drawNovaEffects3D'], saved = {};
    spied.forEach(function (n) { saved[n] = G[n]; G[n] = function () { draws++; return saved[n].apply(G, arguments); }; });
    try {
      G.startGameClock(); G.clearGameplayInput(); G.health = G.HEALTH_MAX;
      var tickMs = 1000 / 60, offset = 5, now = G.gameTimeNow();
      var chain = {fromX: G.pos.x + 40, fromY: G.pos.y, fromZ: 30, targets: [{x: G.pos.x + 70, y: G.pos.y, z: 30}], spawnMs: now - offset, lifeMs: 300};
      var nova = {x: G.pos.x, y: G.pos.y, renderFloorZ: 0, radius: 100, color: '#88ccff', spawnMs: now - offset, lifeMs: 400};
      G.chainEffects = [chain]; G.novaEffects = [nova];
      // Authored ages: 5 + k * 16.667 ms never lands on 300 or 400.
      var lastChain = Math.floor((300 - offset) / tickMs), lastNova = Math.floor((400 - offset) / tickMs), states = [];
      for (var k = 1; k <= lastNova + 1; k++) {
        G.runSimulationTick(1 / 60);
        states[k] = {chain: G.chainEffects.indexOf(chain) >= 0, nova: G.novaEffects.indexOf(nova) >= 0};
      }
      check('chain arcs and novas are present one tick before expiry', lastChain === 17 && lastNova === 23 &&
        states[lastChain].chain && states[lastNova].nova, {lastChain: lastChain, lastNova: lastNova, states: [states[lastChain], states[lastNova]]});
      check('chain arcs and novas expire in the simulation with no render', !states[lastChain + 1].chain && !states[lastNova + 1].nova,
        {afterChain: states[lastChain + 1], afterNova: states[lastNova + 1]});
      check('no renderer ran during the expiry replay', draws === 0, {draws: draws});
    } finally { spied.forEach(function (n) { G[n] = saved[n]; }); }
  });

  // A6: exact predicates at authored ages (10-combat.js:779 and :786 keep
  // age < lifeMs; the render prunes of chain arcs and novas keep age <= lifeMs).
  s1run('A6 prune predicates', function () {
    var impactKeep = {spawnMs: 600.5, lifeMs: 400}, impactEdge = {spawnMs: 600, lifeMs: 400};
    var coneEdge = {spawnMs: 800, lifeMs: 200}, chainEdge = {fromX: 0, fromY: 0, targets: [], spawnMs: 700, lifeMs: 300};
    var chainPast = {fromX: 0, fromY: 0, targets: [], spawnMs: 699.5, lifeMs: 300}, novaEdge = {x: 0, y: 0, spawnMs: 600, lifeMs: 400};
    var novaPast = {x: 0, y: 0, spawnMs: 599.5, lifeMs: 400};
    G.impacts = [impactKeep, impactEdge]; G.coneEffects = [coneEdge]; G.chainEffects = [chainEdge, chainPast];
    G.novaEffects = [novaEdge, novaPast]; G.deathEffects = [];
    G.effectRegistryPrune(1000, 1 / 60);
    var got = {impacts: G.impacts.length === 1 && G.impacts[0] === impactKeep, cone: G.coneEffects.length === 0,
      chain: G.chainEffects.length === 1 && G.chainEffects[0] === chainEdge, nova: G.novaEffects.length === 1 && G.novaEffects[0] === novaEdge};
    check("registry prune keeps today's exact predicates", got.impacts && got.cone && got.chain && got.nova, got);
    // Differential oracle: the legacy tickEffects branch on identical records.
    function fixture() {
      return {impacts: [{x: 1, y: 1, spawnMs: 600, lifeMs: 400}, {x: 2, y: 2, spawnMs: 600.5, lifeMs: 400}, {x: 3, y: 3, life: 0.3, maxLife: 0.3}],
        coneEffects: [{spawnMs: 800, lifeMs: 200}, {spawnMs: 801, lifeMs: 200}],
        deathEffects: [{x: 10, y: 20, vx: 30.5, vy: -40.25, spawnMs: 300, lifeMs: 800}, {x: 0, y: 0, vx: 1, vy: 1, spawnMs: 200, lifeMs: 800},
          {x: 5, y: 5, vx: 7, vy: 3, spawnMs: 999, lifeMs: 800}]};
    }
    function tickWith(registry, dt) {
      var f = fixture(), clock = G.gameTimeNow, prune = G.effectRegistryPrune;
      Object.keys(f).forEach(function (k) { G[k] = f[k]; });
      G.soulOrbs = []; G.coinDrops = [];
      G.gameTimeNow = function () { return 1000; };
      if (!registry) G.effectRegistryPrune = undefined;
      try { G.tickEffects(dt); } finally { G.gameTimeNow = clock; G.effectRegistryPrune = prune; }
      return JSON.stringify({impacts: G.impacts, coneEffects: G.coneEffects, deathEffects: G.deathEffects});
    }
    var legacy60 = tickWith(false, 1 / 60), registry60 = tickWith(true, 1 / 60);
    var legacy120 = tickWith(false, 1 / 120), registry120 = tickWith(true, 1 / 120);
    check('registry prune matches the legacy tickEffects lists on identical records', legacy60 === registry60 && legacy120 === registry120,
      {legacy: legacy60, registry: registry60});
    // Restated legacy bone step (10-combat.js:796-797) at the studio's 1/120.
    var bone = JSON.parse(registry120).deathEffects[0], dt = 1 / 120, vx = 30.5, vy = -40.25;
    var x = 10 + vx * dt, y = 20 + vy * dt; vy += 60 * dt; vx *= 0.96; vy *= 0.96;
    check('legacy bone step integrates with the caller dt', bone && bone.x === x && bone.y === y && bone.vx === vx && bone.vy === vy,
      {bone: bone, expected: {x: x, y: y, vx: vx, vy: vy}});
  });

  // A9: malformed records are dropped as before, but counted once each.
  s1run('A9 malformed records', function () {
    var before = G.getEffectStats().registry.malformed.impacts || 0, warned = warnings.length, live = {spawnMs: 900, lifeMs: 1000};
    G.impacts = [{x: 1, y: 1, life: 0.3, maxLife: 0.3}, {x: 2, y: 2, t: 900, dur: 400}, {spawnMs: 0, lifeMs: 10}, live];
    G.effectRegistryPrune(1000, 1 / 60);
    var after = G.getEffectStats().registry.malformed.impacts || 0;
    check('malformed impact records are counted, not silently dropped', after - before === 2, {before: before, after: after});
    check('well-formed records are kept or expire without being counted', G.impacts.length === 1 && G.impacts[0] === live, {left: G.impacts});
    G.impacts = [{life: 1, maxLife: 1}]; G.effectRegistryPrune(1000, 1 / 60);
    var impactWarnings = warnings.filter(function (w) { return /malformed impacts/.test(w); }).length;
    check('malformed records warn once per family', impactWarnings === 1 && G.impacts.length === 0, {warnings: warnings});
    G.impacts = [];
  });

  // A8: impacts are static records, so leaving the interpolation groups must
  // not change one recorded Canvas command at any blend.
  s1run('A8 impacts leave interpolation', function () {
    function fmt(v) {
      if (typeof v === 'number') return String(Math.round(v * 1e6) / 1e6);
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) return '[' + v.map(fmt).join(',') + ']';
      return v && typeof v === 'object' ? 'obj' : String(v);
    }
    function recorder(base, log) {
      return new Proxy({}, {
        get: function (o, k) {
          if (k === 'then') return undefined;
          if (k in o) return o[k];
          var v = base[k];
          if (typeof v !== 'function') return v;
          return function () { log.push(String(k) + '(' + Array.prototype.map.call(arguments, fmt).join(',') + ')'); return v.apply(base, arguments); };
        },
        set: function (o, k, v) { log.push(String(k) + '=' + fmt(v)); o[k] = v; return true; }
      });
    }
    function draw() {
      if (!G.MODE3D) return G.drawImpacts2D();
      G.beginSceneDepthFrame(G.canvas.width, G.canvas.height);
      if (typeof G.beginSpellVisualFrame === 'function') G.beginSpellVisualFrame();
      G.drawImpacts3D();
    }
    var now = G.gameTimeNow(), fz = G.pos.floorZ || 60;
    G.cam.ang = 0; G.cam.pitch = 0; G.CAM_FOLLOW = true; G.cam.x = G.pos.x; G.cam.y = G.pos.y;
    G.impacts = [{x: G.pos.x + 90, y: G.pos.y + 4, z: fz, spawnMs: now - 50, lifeMs: 1e6},
      {x: G.pos.x + 110, y: G.pos.y - 6, z: fz + 5, spawnMs: now - 80, lifeMs: 1e6, spellId: 'missile'},
      {x: G.pos.x + 70, y: G.pos.y + 12, z: fz, spawnMs: now - 20, lifeMs: 1e6, isCompanionProj: true, color: '#44dd55'}];
    function variant(oldList, mode3D) {
      var groups = G._renderGroups.slice(), streams = [];
      if (oldList) G._renderGroups.splice(4, 0, {name: 'impacts', source: null, view: []});
      G.MODE3D = mode3D;
      try {
        G.resetRenderInterpolation(); G.captureRenderInterpolation();
        G.pos.x += 6; G.pos.y += 2; G.cam.x = G.pos.x; G.cam.y = G.pos.y; G.cam.ang += 0.05; G.viewCam.x += 6;
        G.finishRenderInterpolation();
        [0.25, 0.5, 0.75].forEach(function (alpha) {
          var log = [], base = G.ctx, rng = G._presentationRandomState;
          G.ctx = recorder(base, log); G._presentationRandomState = 4242;
          try { G.renderInterpolatedFrame(alpha, draw); } finally { G.ctx = base; G._presentationRandomState = rng; }
          streams.push(log.join(';'));
        });
        G.pos.x -= 6; G.pos.y -= 2; G.cam.x = G.pos.x; G.cam.y = G.pos.y; G.cam.ang -= 0.05; G.viewCam.x -= 6;
      } finally {
        G._renderGroups.length = 0; groups.forEach(function (g) { G._renderGroups.push(g); }); G.MODE3D = true;
      }
      return streams;
    }
    var old3 = variant(true, true), new3 = variant(false, true), old2 = variant(true, false), new2 = variant(false, false);
    check('the A8 fixture draws the impacts and blends the camera', /arc\(/.test(new3[0]) && /arc\(/.test(new2[0]) && new3[0] !== new3[2] && new2[0] !== new2[2],
      {drew3D: /arc\(/.test(new3[0]), drew2D: /arc\(/.test(new2[0])});
    var mismatch = [0, 1, 2].filter(function (i) { return old3[i] !== new3[i] || old2[i] !== new2[i]; });
    check('removing impacts from interpolation changes no recorded draw commands', !mismatch.length,
      {blends: mismatch, old: old3[mismatch[0]] && old3[mismatch[0]].slice(0, 300), current: new3[mismatch[0]] && new3[mismatch[0]].slice(0, 300)});
    G.impacts = [];
  });

  // A7: every family is wired into every lifecycle list.
  s1run('A7 wiring', function () {
    // The key list as the load left it, then a family registered after every
    // fragment loaded (after 20-casting-preview.js built that list). The late
    // registration refreshes the list, so the load-time list is kept apart.
    var loadKeys = G._castingStudioKeys.slice();
    G.registerEffectFamily('a7Late', {storage: 'globals', globals: 'a7LateFlag', resetValues: {a7LateFlag: false}, reset: 'run',
      studio: 'copy', owner: 'test', draw3D: {none: 'probe'}, draw2D: {none: 'probe'}});
    var fams = G.EFFECT_FAMILIES, report = G.effectRegistryReport(), source = G.EFFECT_FAMILY_SOURCE;
    var missingKeys = [];
    fams.list.forEach(function (d) {
      if (d.studio === 'none') return;
      var keys = d.name === 'a7Late' ? G._castingStudioKeys : loadKeys;
      (d.globals.length ? d.globals : [d.name]).forEach(function (k) { if (keys.indexOf(k) < 0) missingKeys.push(k); });
    });
    check('every family is a studio key', !missingKeys.length && fams.byName.a7Probe && fams.byName.a7Late &&
      G._castingStudioKeys.indexOf('a7ProbeFlag') >= 0 && G._castingStudioKeys.indexOf('a7LateFlag') >= 0, {missing: missingKeys});
    var undecided = Object.keys(source).filter(function (n) {
      return ['draw3D', 'draw2D'].some(function (v) { var x = source[n][v]; return !(typeof x === 'string' && x || x && typeof x.none === 'string' && x.none); });
    });
    check('every family states a 2D and a 3D draw decision', !undecided.length && report.length === Object.keys(source).length, {undecided: undecided});
    var stages = [], re = /_pt\('([^']+)'/g, m, text = String(G.renderFrame);
    while ((m = re.exec(text))) stages.push(m[1]);
    function missingStages(decl) { return typeof decl === 'string' ? decl.split(' ').filter(function (s) { return stages.indexOf(s) < 0; }) : []; }
    var future = [];
    report.forEach(function (r) { missingStages(r.draw3D).concat(missingStages(r.draw2D)).forEach(function (s) { future.push(r.name + ':' + s); }); });
    check('every declared stage exists in renderFrame', stages.length >= 30 && !future.length, {missing: future, stages: stages.length});
    check('the stage scanner rejects a stage that does not exist (soulOrbs2D)', missingStages('soulOrbs2D').length === 1 &&
      !missingStages('impacts2D').length && !missingStages('fxCombat3D ambientFX3D fxOverlay fx2D').length);
    var names = G._renderGroups.map(function (g) { return g.name; });
    check('render interpolation groups are the legacy list minus impacts, in order', JSON.stringify(names) === JSON.stringify(LEGACY_GROUPS),
      {groups: names, expected: LEGACY_GROUPS});
    function audit(name) {
      var d = fams.byName[name];
      if (!d) return ['not a registered family'];
      var why = [];
      if ((d.interp === 'pose') !== (names.indexOf(name) >= 0)) why.push('interpolation');
      if (d.studio !== 'none' && G._castingStudioKeys.indexOf(d.globals.length ? d.globals[0] : name) < 0) why.push('studio key');
      d.reset.forEach(function (s) { if (fams.reset[s].indexOf(d) < 0) why.push('reset ' + s); });
      return why;
    }
    G.a7Unwired = [{x: 1, y: 1}];
    var wired = report.filter(function (r) { return audit(r.name).length; }).map(function (r) { return r.name + ':' + audit(r.name); });
    check('an unregistered sentinel array is reported as unwired', audit('a7Unwired').length === 1 && !wired.length, {wired: wired});
    delete G.a7Unwired;
    // Real studio cycle: every studio:'clear' array is replaced for the cycle.
    var job = {live: G.castingStudioCopy(G._castingStudioKeys), mode: 'hand', target: null, underground: false, art: false,
      light: 'daylight', yaw: 0, grip: 'handle', style: 'arcane', clockBase: 0};
    var sentinels = {};
    fams.list.forEach(function (d) { if (d.studio === 'clear') job.live[d.name] = sentinels[d.name] = [{x: 0, y: 0}]; });
    G.castingStudioResetCycle(job);
    var kept = Object.keys(sentinels).filter(function (n) { return job.live[n] === sentinels[n] || !Array.isArray(job.live[n]) || job.live[n].length; });
    check('the studio reset clears every studio:clear family', Object.keys(sentinels).length >= 10 && !kept.length, {kept: kept});
    // Real Start: prepareGameRun's run reset covers the flame globals and the
    // probe family registered by a later fragment.
    G.flameStreamActive = true; G.flameStreamLastTick = 7; G.flameStreamStartMs = 7; G.a7ProbeFlag = true; G.a7LateFlag = true;
    G.prepareGameRun();
    check('prepareGameRun clears run-scoped effect state', G.flameStreamActive === false && G.flameStreamLastTick === 0 &&
      G.flameStreamStartMs === 0 && G.a7ProbeFlag === false && G.a7LateFlag === false,
      {active: G.flameStreamActive, probe: G.a7ProbeFlag, late: G.a7LateFlag});
  });

  // A4 + A11: the real Start button path, a real enemy death, then a level
  // change after the Particles setting was applied.
  s1run('A4/A11 level resets', function () {
    // Classic Start draws once inside startGame. It runs in 2D here: a
    // classic 3D first frame already crashes platforms3D in this host before
    // S1 (mesh.l0Color undefined), which is not what this case measures.
    G.terrain = 'ground'; G.MODE3D = false;
    G.startGame();
    ambientCheck('startGame -> resetLevel(1)', startupAmbient, ambientLog);
    if (G.enemies.length < 2) throw Error('SETUP level 1 has fewer than two enemies to kill');
    G.startGameClock();
    // S4: death bones are particles in New mode and deathEffects records in
    // Legacy mode (the adapter); one real death of each, near the player so
    // the bones are within their LOD cull, and one tick so the queued burst
    // spawns. The level clear must remove both.
    var bones0 = G.deathEffects.length, orbs0 = G.soulOrbs.length, coins0 = G.coinDrops.length, poolBones = 0;
    G.enemies.slice(0, 2).forEach(function (e, k) { e.x = G.pos.x + 30; e.y = G.pos.y + 10 * k; delete e.feetZ; });
    G.setEffectFamilyMode('bones', 'legacy');
    try { G.enemies[0].health = 0; G.updateEnemies(1 / 60); } finally { G.setEffectFamilyMode('bones', null); }
    G.enemies[0].health = 0; G.updateEnemies(1 / 60); G.updateEffects(1 / 60);
    for (var bi = 0; bi < G.fxState.count; bi++) if (G.fxState.rec[bi] === G.fxState.C.ID['bone.enemy']) poolBones++;
    var bones = G.deathEffects.length - bones0, orbs = G.soulOrbs.length, coins = G.coinDrops.length - coins0;
    check('level fixture killed a real enemy that left bones orbs and coins', bones === 7 && poolBones === 7 && orbs - orbs0 === 2 && coins > 0,
      {bones: bones, poolBones: poolBones, orbs: orbs - orbs0, coins: coins});
    // A sentinel in every family (a tome and a stat pickup included): the
    // level clear must remove exactly the families whose scopes name 'level'.
    var sentinel = {x: G.pos.x + 30, y: G.pos.y, spawnMs: G.gameTimeNow(), lifeMs: 1e9, duration: 1e9, targets: [], fromX: 0, fromY: 0, type: 'speed', wx: 0, wy: 0};
    G.EFFECT_FAMILIES.list.forEach(function (d) {
      if (d.storage === 'array') G[d.name].push(sentinel);
      Object.keys(d.resetValues).forEach(function (k) { G[k] = 'sentinel'; });
    });
    G.settings.particles = 40; G.settings.chunkWindow = G.WINDOW_CHUNKS; G.applySettings();
    G.resetLevel(2);
    ambientCheck('resetLevel(2) after Apply', 40, ambientLog);
    var poolAfter = 0;
    for (bi = 0; bi < G.fxState.count; bi++) if (G.fxState.C.LIST[G.fxState.rec[bi]].id.indexOf('bone.') === 0) poolAfter++;
    check('resetLevel clears bone debris from the previous map', G.deathEffects.length === 0 && poolAfter === 0,
      {bones: G.deathEffects.length, poolBones: poolAfter});
    check('resetLevel still clears coin drops', G.coinDrops.length === 0, {coins: G.coinDrops.length});
    // S1b (spec Q1, the user's answer: clear all three): the gameplay pickups
    // of the previous map leave with it, as coins already did. The fixture
    // left a real soul orb and a tome and a stat pickup sentinel.
    check('resetLevel clears soul orbs, tomes and stat pickups from the previous map', orbs > orbs0 &&
      G.soulOrbs.length === 0 && G.arcaneTomes.length === 0 && G.statPickups.length === 0,
      {orbsBefore: orbs, orbs: G.soulOrbs.length, tomes: G.arcaneTomes.length, stats: G.statPickups.length});
    var wrong = G.EFFECT_FAMILIES.list.filter(function (d) {
      var level = d.reset.indexOf('level') >= 0;
      if (d.storage === 'array') return level === (G[d.name].indexOf(sentinel) >= 0);
      return Object.keys(d.resetValues).some(function (k) { return level === (G[k] === 'sentinel'); });
    }).map(function (d) { return d.name; });
    check('the level clear removes exactly the level-scoped families', !wrong.length, {wrong: wrong});
    G.EFFECT_FAMILIES.list.forEach(function (d) { Object.keys(d.resetValues).forEach(function (k) { G[k] = d.resetValues[k]; }); });
    G.soulOrbs = []; G.arcaneTomes = []; G.statPickups = [];
  });

  // A11: a second world reset after Apply, with sentinels in every family.
  s1run('A11 second world reset', function () {
    var sentinel = {x: 0, y: 0, spawnMs: 0, lifeMs: 1e9};
    G.EFFECT_FAMILIES.list.forEach(function (d) { if (d.storage === 'array') G[d.name].push(sentinel); });
    G.flameStreamActive = true; G.flameStreamStartMs = 99;
    startEndless(777);
    ambientCheck('second resetEndlessMode after Apply', 40, ambientLog);
    var wrong = G.EFFECT_FAMILIES.list.filter(function (d) { return d.storage === 'array' && d.reset.indexOf('world') >= 0 && G[d.name].indexOf(sentinel) >= 0; });
    check('the world clear removes every world-scoped family', !wrong.length && G.flameStreamActive === false && G.flameStreamStartMs === 0,
      {wrong: wrong.map(function (d) { return d.name; })});
    var lost = ambientLog.filter(function (e) { return e.afterReset !== e.expected; });
    check('legacy ambient motes survive every reset', ambientLog.length === 5 && !lost.length, {log: ambientLog});
    check('ambient updates keep the primed population', ambientLog.every(function (e) { return e.afterTick === e.afterReset; }), {log: ambientLog});
  });

  G.setEffectFamilyMode('ambient', null);

  // A11 (New half, S3): with ambient migrated, no legacy mote is initialised
  // (no private-stream work for an invisible array) and every reset primes
  // the engine: prewarm is set, and the first tick fills the ambient field to
  // its target, the Particles setting. Real resets: an Endless world, a
  // classic Start (resetLevel(1)) and a level change (resetLevel(2)). Each
  // starts from a clean precondition: one New-mode tick has consumed any
  // earlier prewarm (a fresh pool, a mode switch), so prewarm after the
  // reset can only come from the registry's prime phase.
  run('A11 New-mode prime', function () {
    if (G.effectFamilyMode('ambient') !== 'new') throw Error('SETUP ambient is not in New mode');
    var log = [], P = G.settings.particles, entry = null;
    function before(label) {
      G.updateEffects(1 / 60);
      entry = {reset: label, cleanBefore: G.fxState.prewarm === false && G.fxState.ambientMode === 'new'};
    }
    function after() {
      entry.prewarm = G.fxState.prewarm === true; entry.legacy = G.ambientParticles.length;
      G.MODE3D = true; G.runSimulationTick(1 / 60);
      var f = G.getEffectStats().fields.ambient;
      entry.live = f.live; entry.target = f.target; log.push(entry);
    }
    before('resetEndlessMode');
    startEndless(777); G.startGameClock(); G.clearGameplayInput();
    after();
    before('startGame -> resetLevel(1)');
    G.terrain = 'ground'; G.MODE3D = false; G.startGame(); G.startGameClock(); G.clearGameplayInput();
    after();
    before('resetLevel(2)');
    G.MODE3D = false; G.resetLevel(2); G.clearGameplayInput();
    after();
    check('every reset primes the New-mode ambient field', P > 0 && log.length === 3 &&
      log.every(function (e) { return e.cleanBefore && e.prewarm && e.legacy === 0 && e.live === P && e.target === P; }), {particles: P, log: log});
  });

  // A10: incomplete families fail at load with a named error.
  s1run('A10 compiler', function () {
    var base = {storage: 'array', life: 'lifeMs', prune: 'sim', keep: 'lt', rebase: 'xy', reset: 'level world', studio: 'clear',
      draw3D: 'impacts3D', draw2D: 'impacts2D'};
    function variant(patch, drop) {
      var d = Object.assign({}, base, patch);
      (drop || []).forEach(function (k) { delete d[k]; });
      return d;
    }
    var bad = [
      ['unknown key', variant({colour: 'red'}), /unknown colour/],
      ['unknown enum value', variant({rebase: 'diagonal'}), /unknown rebase diagonal/],
      ['two enum values in one', variant({rebase: 'xy chain'}), /unknown rebase xy chain/],
      ['sim prune without life', variant({}, ['life']), /sim prune needs life/],
      ['pose on globals', {storage: 'globals', globals: 'x', interp: 'pose', draw3D: 'a', draw2D: 'b'}, /pose\/chain need arrays/],
      ['missing draw decision', variant({}, ['draw2D']), /missing draw2D decision/],
      ['unknown reset scope', variant({reset: 'level zone'}), /unknown reset scope zone/],
      ['prime hook on a rebuilt family', variant({rebase: 'rebuilt', hooks: {prime: function () {}}}), /prime hook on rebuilt/],
      ['legacy without family', variant({status: 'legacy'}), /legacy needs family/],
      ['unknown hook', variant({hooks: {draw: function () {}}}), /bad hook draw/],
      ['sim prune without keep', variant({}, ['keep']), /sim prune needs life, keep/],
      ['chain rebase on globals', {storage: 'globals', globals: 'x', rebase: 'chain', draw3D: 'a', draw2D: 'b'}, /pose\/chain need arrays/],
      ['globals storage without globals', {storage: 'globals', draw3D: 'a', draw2D: 'b'}, /globals mismatch/],
      ['globals on array storage', variant({globals: 'x'}), /globals mismatch/],
      ['engine without hooks', {storage: 'engine', draw3D: 'a', draw2D: 'b'}, /engine needs hooks/],
      ['bone step without sim prune', variant({prune: 'owner', step: 'legacyBones'}), /step needs sim prune/],
      ['reset value for an undeclared global', {storage: 'globals', globals: 'x', resetValues: {y: 0}, draw3D: 'a', draw2D: 'b'}, /resetValues y/]
    ];
    var misses = bad.filter(function (b) {
      try { G.compileEffectFamilies({impacts: base, badFamily: b[1]}); return true; } catch (e) {
        return !/^Effect family badFamily: /.test(e.message) || !b[2].test(e.message);
      }
    }).map(function (b) { return b[0]; });
    check('an incomplete family fails at load with a named error', !misses.length, {accepted: misses});
    var before = JSON.stringify(G.EFFECT_FAMILY_SOURCE), compiled = G.compileEffectFamilies(G.EFFECT_FAMILY_SOURCE);
    check('the shipping family table compiles and the compiler is pure', compiled.list.length === Object.keys(G.EFFECT_FAMILY_SOURCE).length &&
      Object.isFrozen(compiled) && Object.isFrozen(compiled.list[0]) && before === JSON.stringify(G.EFFECT_FAMILY_SOURCE));
    var dup = null;
    try { G.registerEffectFamily('impacts', base); } catch (e) { dup = e.message; }
    check('a duplicate family registration fails', /Effect family impacts: already registered/.test(dup || ''), {error: dup});
  });

  if (s1Skipped.length) output('SKIP ' + s1Skipped.join(', ') + ' (mutation run for an S2a check)');

  // S2 keeps the legacy ambient init at its call position (after the player
  // is placed) but moves it to the private legacy stream (spec 7.6), so
  // New/Legacy never changes gameplay draws. Oracle: the typeof-guarded
  // legacy branch (registry entry points hidden) on the same seed builds the
  // same world and takes exactly the init's own draws more from the gameplay
  // stream; the legacy spawn rule puts every mote 30-180 u from the player.
  run('A11 random stream position', function () {
    var names = ['effectRegistryReset', 'effectRegistryPrime', 'effectRegistryPrune', 'effectRegistryRebase'];
    function world() {
      return JSON.stringify({seed: G.WORLD_SEED, pos: [G.pos.x, G.pos.y], enemies: G.enemies.map(function (e) { return [e.x, e.y]; }),
        stats: G.statPickups.map(function (p) { return [p.x, p.y]; })});
    }
    function ring() {
      return G.AMBIENT_MAX > 0 && G.ambientParticles.length === G.AMBIENT_MAX && G.ambientParticles.every(function (p) {
        var d = Math.hypot(p.x - G.pos.x, p.y - G.pos.y);
        return d >= 30 - 1e-9 && d <= 180 + 1e-9;
      });
    }
    // Each start begins far from the spawn it builds, so an init that ran
    // before placement would scatter motes elsewhere.
    function both(start) {
      var saved = {}, legacy, init = G.initAmbientParticles, counter = {n: 0}, initDraws = 0;
      names.forEach(function (n) { saved[n] = G[n]; G[n] = undefined; });
      G.initAmbientParticles = function () { var n0 = counter.n; try { return init.apply(G, arguments); } finally { initDraws += counter.n - n0; } };
      try { G.pos.x = 1234; G.pos.y = -777; start(counter); legacy = {world: world(), draws: counter.n}; }
      finally { names.forEach(function (n) { G[n] = saved[n]; }); G.initAmbientParticles = init; }
      counter.n = 0; G.pos.x = 1234; G.pos.y = -777; start(counter);
      return {legacy: legacy, registry: {world: world(), draws: counter.n, ring: ring()}, initDraws: initDraws};
    }
    // The legacy init runs only while ambient is Legacy (S3 migrated it).
    G.setEffectFamilyMode('ambient', 'legacy');
    try {
      var endless = both(function (counter) { startEndless(424242, counter); });
      var classic = both(function (counter) {
        var next = lcg(99);
        Math.random = function () { counter.n++; return next(); };
        G.terrain = 'ground'; G.MODE3D = false; G.startGame(); G.MODE3D = true;
      });
    } finally { G.setEffectFamilyMode('ambient', null); }
    function moved(r) { return r.initDraws > 0 && r.legacy.draws - r.registry.draws === r.initDraws && r.legacy.world === r.registry.world; }
    check('the legacy ambient init no longer draws from the gameplay random stream', moved(endless) && moved(classic),
      {endless: {init: endless.initDraws, legacy: endless.legacy.draws, registry: endless.registry.draws, world: endless.legacy.world === endless.registry.world},
        classic: {init: classic.initDraws, legacy: classic.legacy.draws, registry: classic.registry.draws, world: classic.legacy.world === classic.registry.world}});
    check('legacy ambient motes are spawned around the placed player', endless.registry.ring && classic.registry.ring,
      {endless: endless.registry.ring, classic: classic.registry.ring});
  });

  // ── S2a: registry services and the engine's gameplay boundary ──────────
  // A test-local recipe table (spec 11.1): the shipping table is templates only.
  var TEST_RECIPES = {
    'test.debris': {class:'combat', toggle:'fxDebris', trigger:{api:true}, color:'event',
      spawn:{shape:'sphere', radius:[0, 2], direction:'random', speed:[40, 120], up:[20, 60]}, motion:{model:'ballistic', gravity:420, drag:0.5},
      collision:{mode:'bounce', stratum:'reference', restitution:0.35, friction:0.6, bounces:2, restSeconds:[0.3, 0.5]},
      life:{seconds:[0.8, 1.4]}, render:{primitive:'chip', size:[0.4, 0.7]}, view2D:'dot'},
    'test.guarded': {class:'combat', toggle:'fxDebris', trigger:{api:true}, color:{material:'fxDebris', roles:['spark']},
      motion:{model:'static'}, life:{seconds:[5, 5]}, render:{primitive:'dot', size:[0.3, 0.3]}, view2D:'dot'},
    'test.fb': {class:'feedback', trigger:{api:true}, color:{material:'fxFeedback', roles:['tome']},
      spawn:{shape:'ring', radius:[1, 2], direction:'radial', speed:[20, 30], up:[8, 20]}, motion:{model:'drift', gravity:-6, drag:1.8},
      life:{seconds:[0.8, 1]}, render:{primitive:'glowDot', size:[0.5, 0.8], glow:3}, view2D:'dot'},
    'test.drip': {class:'ambient', trigger:{api:true}, color:{material:'fxMote', roles:['drip']}, spawn:{shape:'disc', radius:[0, 20]},
      motion:{model:'fall', gravity:220}, collision:{mode:'kill', stratum:'reference', onFloor:'test.ripple', onFloorChance:0.7},
      life:{seconds:[2, 3]}, render:{primitive:'streak', size:[0.16, 0.16], streakSeconds:0.05}, view2D:'none'},
    'test.ripple': {class:'ambient', trigger:{child:true}, color:{material:'fxMote', roles:['drip']}, motion:{model:'static'},
      life:{seconds:[0.25, 0.35]}, render:{primitive:'ring', size:[0.4, 0.6], grow:2.5}, view2D:'none'},
    'test.marker': {class:'feedback', trigger:{api:true}, color:{material:'fxDebris', roles:['spark']}, spawn:{shape:'disc', radius:[0, 3]},
      motion:{model:'static'}, life:{seconds:[5, 5]}, render:{primitive:'dot', size:[0.3, 0.3]}, view2D:'dot'}
  };
  var TEST_TABLE = G.compileFxRecipes(TEST_RECIPES, G.FX_MATERIALS), liveFx = G.fxState;
  G.settings.particles = 25;                               // A4 left 40 (Apply); these cases use the default budget
  var injected = {rebase: 0, updateEffects: 0, fxEmit: 0, fxEvent: 0};
  function installFx(cap, seed, opts) {
    var o = {compiled: TEST_TABLE, pinned: true};
    Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
    return (G.fxState = G.createFxState(cap, seed, o));
  }
  function byRecipe(S, id) {
    var r = S.C.ID[id], out = [];
    for (var i = 0; i < S.count; i++) if (S.rec[i] === r) out.push(i);
    return out;
  }
  function findSeed(S, seed) { for (var i = 0; i < S.count; i++) if (S.seedA[i] === seed) return i; return -1; }

  // R1: the toggles in the render-feature definition shape; the fallback
  // store; the registry path (3d-int) through a recording stand-in.
  // The fallback store is tested with any render-feature registry hidden (on
  // the merged tree 3d-int's is live); stand-ins test the registry path, and
  // the real registry is restored (init re-run, which must be idempotent).
  var TOGGLE_REGISTRY = ['defineRenderFeature', 'renderFeatureValue', 'setRenderFeature', 'onRenderFeaturesChange'], liveRegistry = {};
  TOGGLE_REGISTRY.forEach(function (n) { liveRegistry[n] = G[n]; });
  function useToggleRegistry(fns) { TOGGLE_REGISTRY.forEach(function (n) { G[n] = fns ? fns[n] : undefined; }); G.effectToggleInit(); }
  run('R1 toggles', function () {
    useToggleRegistry(null);
    try { r1Toggles(); } finally { useToggleRegistry(liveRegistry); }
  });
  function r1Toggles() {
    var bad = [];
    // Definition rules of defineRenderFeature (3d-int 01-config-state.js:468-498), restated.
    G.EFFECT_TOGGLE_DEFS.forEach(function (d) {
      var ok = /^[a-z][A-Za-z0-9]*$/.test(d.key) && typeof d.label === 'string' && !!d.label && (d.type === 'bool' ?
        d.legacy === false && (d.default === true || d.default === false) :
        d.type === 'enum' && Array.isArray(d.values) && d.values.length >= 2 && d.values.indexOf(d.default) >= 0 &&
        d.values.indexOf(d.legacy) >= 0 && d.values.every(function (v, i) { return d.values.indexOf(v) === i; }));
      if (!ok) bad.push(d.key);
    });
    check('the effect toggles are valid render-feature definitions', !bad.length &&
      JSON.stringify(G.EFFECT_TOGGLE_DEFS.map(function (d) { return d.key; })) === '["fxUnified","fxWeather","fxDebris","fxFootDust"]', {bad: bad});
    var gen0 = G.effectToggleGeneration(), snap0 = JSON.stringify(G.effectTogglesSnapshot()), errors = [];
    [['fxWeather', 'fog'], ['fxRain', true], ['fxDebris', 1]].forEach(function (p) { try { G.setEffectToggle(p[0], p[1]); } catch (e) { errors.push(e.message); } });
    var genBad = G.effectToggleGeneration();
    G.setEffectToggle('fxWeather', 'rain'); var genSet = G.effectToggleGeneration();
    G.setEffectToggle('fxWeather', 'rain'); var genSame = G.effectToggleGeneration();
    var rain = G.effectToggleValue('fxWeather'), rainOn = G.effectToggleOn('fxWeather');
    G.setEffectToggle('fxWeather', 'off'); var offOn = G.effectToggleOn('fxWeather');
    G.setEffectToggle('fxWeather', 'auto');
    check('toggles validate like setRenderFeatures, apply immediately and are never saved in settings',
      snap0 === '{"fxUnified":true,"fxWeather":"auto","fxDebris":true,"fxFootDust":true}' && errors.length === 3 &&
      /fxWeather: "fog" is not one of/.test(errors[0]) && /unknown toggle fxRain/.test(errors[1]) && genBad === gen0 &&
      genSet === gen0 + 1 && genSame === genSet && rain === 'rain' && rainOn && !offOn && JSON.stringify(G.settings).indexOf('fxWeather') < 0,
      {snap: snap0, errors: errors, gens: [gen0, genBad, genSet, genSame]});
    var registry = {defs: [], values: {}, listeners: []}, shared = null;
    G.defineRenderFeature = function (d) { registry.defs.push(d.key); registry.values[d.key] = d.default; return d; };
    G.renderFeatureValue = function (k, fallback) { return k in registry.values ? registry.values[k] : fallback; };
    G.setRenderFeature = function (k, v) { registry.values[k] = v; registry.listeners.forEach(function (l) { l('set', k); }); };
    G.onRenderFeaturesChange = function (l) { registry.listeners.push(l); };
    try {
      G.effectToggleInit();
      var g1 = G.effectToggleGeneration();
      G.setEffectToggle('fxDebris', false);
      var viaRegistry = registry.values.fxDebris === false && G.effectToggleValue('fxDebris') === false && G.effectToggleGeneration() === g1 + 1;
      registry.values.fxFootDust = false; registry.listeners.forEach(function (l) { l('preset', 'legacy'); });   // the G key or a preset
      shared = {defs: registry.defs.join(','), viaRegistry: viaRegistry, preset: G.effectToggleOn('fxFootDust') === false && G.effectToggleGeneration() === g1 + 2};
    } finally { useToggleRegistry(null); }
    check('with the render-feature registry the toggles register and read through it', !!shared &&
      shared.defs === 'fxUnified,fxWeather,fxDebris,fxFootDust' && shared.viaRegistry && shared.preset && G.effectToggleValue('fxDebris') === true, shared);
    // The load-time init run again (a later fragment, a harness) under a
    // registry that rejects duplicate keys, as 3d-int's defineRenderFeature
    // does (01-config-state.js:467-470, restated): nothing is redefined or
    // counted, the values keep coming from the registry, one listener.
    var strict = {defs: [], values: {}, listeners: []}, again = null, t0 = G.getEffectStats().failures.toggles || 0;
    G.defineRenderFeature = function (d) {
      if (d.key in strict.values) throw Error('render features: duplicate key ' + d.key);
      strict.defs.push(d.key); strict.values[d.key] = d.default; return d;
    };
    G.renderFeatureValue = function (k, fallback) { return k in strict.values ? strict.values[k] : fallback; };
    G.setRenderFeature = function (k, v) { strict.values[k] = v; strict.listeners.forEach(function (l) { l('set', k); }); };
    G.onRenderFeaturesChange = function (l) { strict.listeners.push(l); };
    try {
      G.effectToggleInit(); G.setEffectToggle('fxFootDust', false);
      G.effectToggleInit();
      var g2 = G.effectToggleGeneration(); G.setEffectToggle('fxDebris', false);
      again = {defs: strict.defs.length, listeners: strict.listeners.length, failures: (G.getEffectStats().failures.toggles || 0) - t0,
        footDust: G.effectToggleValue('fxFootDust'), debris: G.effectToggleValue('fxDebris'), bumps: G.effectToggleGeneration() - g2};
    } finally { useToggleRegistry(null); }
    check('re-running the toggle init keeps the registry path and its values', !!again && again.defs === 4 && again.listeners === 1 &&
      again.failures === 0 && again.footDust === false && again.debris === false && again.bumps === 1 && G.effectToggleValue('fxDebris') === true,
      {again: again, expected: {defs: 4, listeners: 1, failures: 0, bumps: 1}});
    // The pool reacts in the next tick: a switched-off preset fades and refuses.
    var S = installFx(512, 11, {reserve: 16}), z = G.playerFeetSpatialZ() + 20;
    try {
      G.fxEmit('test.guarded', G.pos.x + 30, G.pos.y, z, {count: 20}); G.updateEffects(1 / 60);
      var n0 = byRecipe(S, 'test.guarded').length, refused0 = S.stats.refusedToggle;
      G.setEffectToggle('fxDebris', false);
      G.fxEmit('test.guarded', G.pos.x + 30, G.pos.y, z, {count: 20}); G.updateEffects(1 / 60);
      var list = byRecipe(S, 'test.guarded'), dying = list.length === 20 && list.every(function (i) { return S.flags[i] & 16; });
      var refused = S.stats.refusedToggle - refused0;
      for (var k = 0; k < 15; k++) G.updateEffects(1 / 60);
      var gone = byRecipe(S, 'test.guarded').length;
      G.setEffectToggle('fxDebris', true);
      G.fxEmit('test.guarded', G.pos.x + 30, G.pos.y, z, {count: 20}); G.updateEffects(1 / 60);
      check('a preset switched off fades its particles and refuses new ones in the next tick', n0 === 20 && dying && refused === 20 &&
        gone === 0 && byRecipe(S, 'test.guarded').length === 20, {n0: n0, dying: dying, refused: refused, gone: gone});
    } finally { G.setEffectToggle('fxDebris', true); G.fxState = liveFx; }
  }

  // R2: the live budget reproduces the section 6.1 table (capacity 3072, reserve 256).
  run('R2 live budget', function () {
    var TABLE = [[0, 0, 0, 0, 0], [10, 0.4, 480, 168, 48], [25, 1, 1200, 420, 120], [40, 1.6, 1920, 672, 192], [60, 2.4, 2816, 985, 281]];
    var saved = G.settings.particles, bad = [], same = false;
    try {
      TABLE.forEach(function (row) {
        G.settings.particles = row[0];
        var q = G.effectQuality(3072, 256);
        if (q.P !== row[0] || !near(q.s, row[1]) || q.B !== row[2] || q.caps[3] !== row[3] || q.caps[2] !== row[4] || q.caps[4] !== 3072 ||
            q.caps[0] !== row[2] || !near(q.scale[3], Math.min(row[1], 1.5)) || !near(q.scale[4], Math.max(0.5, Math.min(1.25, row[1]))))
          bad.push({P: row[0], s: q.s, B: q.B, combat: q.caps[3], locomotion: q.caps[2]});
      });
      var a = G.effectQuality(3072, 256), gen = a.gen;
      same = G.effectQuality(3072, 256) === a && a.gen === gen;
    } finally { G.settings.particles = saved; }
    check('the live budget follows the section 6.1 table', !bad.length && same, {bad: bad, reused: same});
  });

  // R3: family modes.
  run('R3 family modes', function () {
    var fams = Object.keys(G.EFFECT_FAMILY_MIGRATED), errors = [], migrated = null, unmigrated = null;
    // S3 migrated ambient and torchEmbers, S4 bones and pickupBursts, S8
    // torch glow and flame embers: every family. The rule for a family not
    // yet migrated is shown on flame embers with its flag lowered here.
    var MIGRATED = ['ambient', 'torchEmbers', 'bones', 'pickupBursts', 'torchGlow', 'flameEmbers'];
    var allLegacy = fams.length === 6 && fams.every(function (f) { return G.EFFECT_FAMILY_MIGRATED[f] === (MIGRATED.indexOf(f) >= 0); }) &&
      fams.every(function (f) { return G.effectFamilyMode(f) === (G.EFFECT_FAMILY_MIGRATED[f] ? 'new' : 'legacy'); });
    [['sparks', 'new'], ['bones', 'on']].forEach(function (p) { try { G.setEffectFamilyMode(p[0], p[1]); } catch (e) { errors.push(e.message); } });
    // A console override holds a migrated family on its legacy path; the
    // report shows it on the family's registered array (deathEffects).
    var over = G.setEffectFamilyMode('bones', 'legacy');
    var report = G.effectRegistryReport().filter(function (r) { return r.name === 'deathEffects'; })[0].mode;
    G.setEffectFamilyMode('bones', null);
    try {
      var on = G.effectFamilyMode('bones');
      G.setEffectToggle('fxUnified', false); var off = G.effectFamilyMode('bones'); G.setEffectToggle('fxUnified', true);
      migrated = {on: on, off: off};
      G.EFFECT_FAMILY_MIGRATED.flameEmbers = false;
      unmigrated = {on: G.effectFamilyMode('flameEmbers')};
    } finally { G.EFFECT_FAMILY_MIGRATED.flameEmbers = true; G.setEffectToggle('fxUnified', true); }
    check('unmigrated families stay Legacy and overrides are validated', allLegacy && errors.length === 2 && over === 'legacy' &&
      report === 'legacy' && G.effectFamilyMode('bones') === 'new' && unmigrated.on === 'legacy',
      {errors: errors, over: over, report: report, unmigrated: unmigrated, migrated: fams.filter(function (f) { return G.EFFECT_FAMILY_MIGRATED[f]; })});
    check('a migrated family follows the Unified effects switch', migrated.on === 'new' && migrated.off === 'legacy', migrated);
  });

  // R4: the persistent private legacy stream.
  run('R4 legacy stream', function () {
    var S = installFx(64, 4040), gameplay = 0, base = Math.random, a, b, c, d, threw = false, restored = false;
    function three() { return [Math.random(), Math.random(), Math.random()]; }
    Math.random = function () { gameplay++; return base(); };
    var wrapped = Math.random;
    try {
      a = G.effectWithLegacyRandom(three); b = G.effectWithLegacyRandom(three);
      try { G.effectWithLegacyRandom(function () { Math.random(); throw Error('legacy throw'); }); } catch (e) { threw = e.message === 'legacy throw'; }
      restored = Math.random === wrapped;
      G.fxReset('world', S); c = G.effectWithLegacyRandom(three);
      G.fxReset('world', S); d = G.effectWithLegacyRandom(three);
    } finally { Math.random = base; G.fxState = liveFx; }
    check('two legacy calls in one tick draw different values', JSON.stringify(a) !== JSON.stringify(b) && S.tick === 0, {a: a, b: b});
    check('the legacy stream never touches the gameplay stream and is reseeded only by a reset', gameplay === 0 && threw && restored &&
      JSON.stringify(c) === JSON.stringify(d) && JSON.stringify(c) !== JSON.stringify(b), {gameplay: gameplay, threw: threw, restored: restored, c: c, d: d});
  });

  // I2 (spec 7.5): no gameplay fragment reads fxState. A static scan of every
  // manifest script except the effect system's own files; the negative control
  // is a gameplay source with one injected reference.
  run('I2 gameplay never reads fxState', function () {
    var manifest = JSON.parse(slurp('assets/games/manifest.json')), own = /^src\/(02-effect-registry|11-fx-[a-z]+|14-fx-render)\.js$/;
    // Allowed readers outside the effect system, each with its reason. An
    // entry that no longer reads fxState is stale and fails.
    var ALLOWED = {'src/20-browser-profile.js': 'the browser profile swaps a fresh pinned fxState in for its frozen frames and ' +
      'restores the live one (spec 10.4); it never reads particle state for gameplay'};
    var hits = [], scanned = 0, allowed = [];
    function reads(text) { return /\bfxState\b/.test(text); }
    Object.keys(manifest.parts).forEach(function (part) {
      (manifest.parts[part] || []).forEach(function (path) {
        if (!/\.js$/.test(path) || own.test(path)) return;
        scanned++;
        if (reads(G.__registrySource(path, slurp('assets/games/' + path)))) (ALLOWED.hasOwnProperty(path) ? allowed : hits).push(path);
      });
    });
    var control = reads(slurp('assets/games/src/10-combat.js') + '\nvar probe = fxState.count;');
    check('no gameplay fragment reads fxState', scanned >= 40 && !hits.length && control &&
      JSON.stringify(allowed) === JSON.stringify(Object.keys(ALLOWED)), {scanned: scanned, hits: hits, control: control, allowed: allowed});
  });

  // A14 (S2 part): a burst queued from inside updateProjectiles in the tick
  // whose step() shifts the window lands where its event happened.
  if (needed('A14', ['--no-ring-rebase', '--no-pool-rebase'])) run('A14 queued effects across a shift', function () {
    function trial(cross) {
      startEndless(777); G.startGameClock(); G.clearGameplayInput();
      var S = installFx(512, G.WORLD_SEED, {reserve: 16});
      var half = Math.floor(G.WINDOW_CHUNKS / 2), edge = (G.windowCX + half + 1) * G.CHUNK_SIZE - G.windowOriginX;
      G.pos.x = cross ? edge + 2 : edge - 60; G.cam.x = G.pos.x; G.vel.x = G.vel.y = 0;
      var ox = G.windowOriginX, oy = G.windowOriginY, ev = {x: G.pos.x - 30, y: G.pos.y + 5, z: G.playerFeetSpatialZ() + 10};
      G.fxEmit('test.marker', ev.x + 10, ev.y, ev.z, {count: 1}); G.updateEffects(1 / 60);
      var early = S.seedA[0], earlyWorld = [S.x[0] + ox, S.y[0] + oy];
      var handle = G.fxAttach('test.marker', {x: ev.x - 10, y: ev.y, z: ev.z}, {rate: 1e-6}), saved = G.updateProjectiles;   // never reaches one spawn here
      G.updateProjectiles = function () { var r = saved.apply(G, arguments); G.fxEmit('test.marker', ev.x, ev.y, ev.z, {count: 8}); return r; };
      try { G.runSimulationTick(1 / 60); } finally { G.updateProjectiles = saved; }
      var dist = [], A = S.anchors, k = handle & 255, ei = findSeed(S, early);
      byRecipe(S, 'test.marker').forEach(function (i) {
        if (S.seedA[i] !== early) dist.push(Math.hypot(S.x[i] + G.windowOriginX - (ev.x + ox), S.y[i] + G.windowOriginY - (ev.y + oy)));
      });
      G.fxDetach(handle);
      return {shift: G.windowOriginX - ox, dist: dist, earlyErr: ei >= 0 ? Math.hypot(S.x[ei] + G.windowOriginX - earlyWorld[0], S.y[ei] + G.windowOriginY - earlyWorld[1]) : NaN,
        anchorErr: Math.hypot(A.x[k] + G.windowOriginX - (ev.x - 10 + ox), A.y[k] + G.windowOriginY - (ev.y + oy))};
    }
    var crossing = trial(true), still = trial(false);
    function landed(t) { return t.dist.length === 8 && t.dist.every(function (d) { return d <= 3 + 1e-9; }); }
    check('the A14 crossing is a real 480 u window shift', crossing.shift === 480 && still.shift === 0, {crossing: crossing.shift, still: still.shift});
    check('effects queued before a window shift land where their event happened', landed(crossing) && landed(still),
      {crossing: crossing.dist.map(Math.round), still: still.dist.map(Math.round)});
    check('live particles and point anchors keep their world position across a shift', near(crossing.earlyErr, 0, 1e-9) && near(crossing.anchorErr, 0, 1e-9),
      {particle: crossing.earlyErr, anchor: crossing.anchorErr});
    // S4: a real enemy death in the crossing tick (health 0 before
    // updateEnemies, which queues the event before step() shifts the window)
    // on the shipping table. Every bone lies within the recipe's spawn disc
    // (3 u) plus one tick of its fastest flight (160 u/s) of the corpse's
    // world position; without the ring rebase they land a shift away.
    function deathTrial(cross) {
      startEndless(777); G.startGameClock(); G.clearGameplayInput();
      var S = G.fxState = G.createFxState(512, G.WORLD_SEED, {pinned: true});
      var half = Math.floor(G.WINDOW_CHUNKS / 2), edge = (G.windowCX + half + 1) * G.CHUNK_SIZE - G.windowOriginX;
      G.pos.x = cross ? edge + 2 : edge - 60; G.cam.x = G.pos.x; G.vel.x = G.vel.y = 0;
      var e = G.enemies[0], ox = G.windowOriginX, oy = G.windowOriginY;
      e.x = G.pos.x - 40; e.y = G.pos.y + 5; delete e.feetZ; e.underground = false; e.health = 0;
      var corpse = [e.x + ox, e.y + oy], events = 0, savedEvent = G.fxEvent;
      G.fxEvent = function (type) { if (type === 'enemyDeath') events++; return savedEvent.apply(G, arguments); };
      try { G.runSimulationTick(1 / 60); } finally { G.fxEvent = savedEvent; }
      var dist = byRecipe(S, 'bone.enemy').map(function (i) { return Math.hypot(S.x[i] + G.windowOriginX - corpse[0], S.y[i] + G.windowOriginY - corpse[1]); });
      return {shift: G.windowOriginX - ox, events: events, dist: dist};
    }
    var deathCross = deathTrial(true), deathStill = deathTrial(false), reach = 3 + 160 / 60 + 1e-6;
    function thrown(t) { return t.events === 1 && t.dist.length === 7 && t.dist.every(function (d) { return d <= reach; }); }
    check('a real enemy death in the crossing tick throws its bones where the enemy died', deathCross.shift === 480 && deathStill.shift === 0 &&
      thrown(deathCross) && thrown(deathStill), {crossing: {shift: deathCross.shift, events: deathCross.events, dist: deathCross.dist.map(Math.round)},
        still: {shift: deathStill.shift, events: deathStill.events, dist: deathStill.dist.map(Math.round)}, reach: reach});
    G.fxState = liveFx;
  });

  // A13 (S2 part): a failing cosmetic tick never skips updateExplored, and a
  // throwing fxEmit argument never aborts the producer that called it.
  run('A13 tick and emit isolation', function () {
    startEndless(777); G.startGameClock(); G.clearGameplayInput();
    installFx(512, G.WORLD_SEED, {reserve: 16});
    G.fxEmit('test.marker', G.pos.x + 30, G.pos.y, G.playerFeetSpatialZ() + 10, {count: 4});
    var explored = 0, savedExplored = G.updateExplored, savedIntegrate = G.fxIntegrate, threw = null;
    var f0 = G.getEffectStats().failures.updateEffects, w0 = warnings.length;
    G.updateExplored = function () { explored++; return savedExplored.apply(G, arguments); };
    G.fxIntegrate = function () { throw Error('a13 integrate'); };
    try { G.gameUpdate(1 / 60); G.gameUpdate(1 / 60); } catch (e) { threw = e.message; } finally { G.fxIntegrate = savedIntegrate; }
    injected.updateEffects = G.getEffectStats().failures.updateEffects - f0;
    var warned = warnings.slice(w0).filter(function (w) { return /updateEffects failed: a13 integrate/.test(w); }).length;
    check('a cosmetic tick failure never skips updateExplored', threw === null && explored === 2 && injected.updateEffects === 2 && warned === 1,
      {threw: threw, explored: explored, failures: injected.updateEffects, warned: warned});
    var bad = {}, savedUP = G.updateProjectiles, f1 = G.getEffectStats().failures.fxEmit, returned = null, completed = false;
    Object.defineProperty(bad, 'nx', {get: function () { throw Error('a13 emit option'); }});
    explored = 0; threw = null;
    G.updateProjectiles = function () { returned = G.fxEmit('test.marker', G.pos.x, G.pos.y, 0, bad); var r = savedUP.apply(G, arguments); completed = true; return r; };
    try { G.gameUpdate(1 / 60); } catch (e) { threw = e.message; } finally { G.updateProjectiles = savedUP; G.updateExplored = savedExplored; }
    injected.fxEmit = G.getEffectStats().failures.fxEmit - f1;
    check('a throwing fxEmit argument is counted and never aborts its producer', threw === null && returned === false && completed &&
      explored === 1 && injected.fxEmit === 1, {threw: threw, returned: returned, completed: completed, explored: explored, failures: injected.fxEmit});
    G.fxState = liveFx;
  });

  // A13 (S5 part): a throwing projectileContact reader during a real wall
  // hit in the Endless world (seed 777) is counted and warned once;
  // updateProjectiles still consumes the shot (projectiles is reassigned in
  // the contact tick) and the gameplay hash equals the same replay with the
  // working reader. Under --throwing-reader fxEvent has no catch.
  run('A13 contact reader isolation', function () {
    function replay(throwing) {
      startEndless(777); G.startGameClock(); G.clearGameplayInput();
      G.fxState = G.createFxState(1024, G.WORLD_SEED, {pinned: true});
      var a = {x: G.pos.x, y: G.pos.y, z: G.playerFeetSpatialZ() + 35}, wall = null;
      // The nearest wall cell 60..300 u away whose centre a shot reaches first.
      for (var gy = 0; gy < G.gridH; gy++) for (var gx = 0; gx < G.gridW; gx++) {
        if (!G.grid[gy * G.gridW + gx]) continue;
        var cx = (gx + 0.5) * G.cell, cy = (gy + 0.5) * G.cell, d = Math.hypot(cx - a.x, cy - a.y);
        if (d < 60 || d > 300 || wall && d >= wall.d) continue;
        var hit = G.projectileFirstHit({r: 3}, a, {x: cx, y: cy, z: a.z}, null, null, 1);
        if (hit.status === 'blocked' && hit.kind === 'wall' && hit.gx === gx && hit.gy === gy) wall = {gx: gx, gy: gy, d: d, ang: Math.atan2(cy - a.y, cx - a.x)};
      }
      if (!wall) throw Error('SETUP A13 found no shootable wall near the Endless 777 spawn');
      var saved = G.FX_EVENT_READERS.projectileContact, f0 = G.getEffectStats().failures.fxEvent || 0, w0 = warnings.length, e0 = G.__registryErrors.length;
      var shot = {x: a.x, y: a.y, z: a.z, ang: wall.ang, speed: 360, hz: 360, vz: 0, r: 3, spell: G.spells.ice, spawnMs: G.gameTimeNow(),
        lifeMs: 1500, renderFloorZ: G.getPlayerRenderFloorZ(), underground: !!G.playerUnderground};
      var contacts = 0, reassigned = null, savedEvent = G.fxEvent, spawnAt = null;
      if (throwing) G.FX_EVENT_READERS.projectileContact = function () { throw Error('a13 contact reader'); };
      else G.FX_EVENT_READERS.projectileContact = function (S, k, p, c) {      // the debris spawn point the reader queues
        var out = saved.apply(G, arguments);
        if (!spawnAt) spawnAt = {x: S.ev.x[k], y: S.ev.y[k], z: S.ev.z[k], kind: c.kind, gx: c.gx, gy: c.gy};
        return out;
      };
      G.fxEvent = function (type) { if (type === 'projectileContact') contacts++; return savedEvent.apply(G, arguments); };
      try {
        // Until 5 ticks after the first contact (the impact record lives 220 ms).
        G.projectiles.push(shot);
        for (var k = 0, after = -1; k < 90 && after < 5; k++) {
          G.cam.ang = wall.ang;
          var list = G.projectiles, before = contacts;
          G.runSimulationTick(1 / 60);
          if (contacts > before && reassigned === null) reassigned = G.projectiles !== list && G.projectiles.indexOf(shot) < 0;
          if (reassigned !== null) after++;
        }
      } finally { G.FX_EVENT_READERS.projectileContact = saved; G.fxEvent = savedEvent; }
      var hash = JSON.stringify({pos: [G.pos.x, G.pos.y], health: G.health, mana: G.mana, enemies: G.enemies.map(function (n) { return [n.x, n.y, n.health]; }),
        projectiles: G.projectiles.map(function (p) { return [p.x, p.y, p.z]; }), impacts: G.impacts.map(function (im) { return [im.x, im.y, im.z, im.lifeMs]; }),
        explored: G.exploredCells ? Array.prototype.reduce.call(G.exploredCells, function (n, v) { return n + (v ? 1 : 0); }, 0) : null});
      // Where the debris starts, against the struck cell of the generated
      // world: its grid bounds and its solid span (real wall base and top).
      var place = null;
      if (spawnAt) {
        var span = G.spatialWallSpan(wall.gx, wall.gy), x0 = wall.gx * G.cell, y0 = wall.gy * G.cell;
        var qx = Math.max(x0, Math.min(x0 + G.cell, spawnAt.x)), qy = Math.max(y0, Math.min(y0 + G.cell, spawnAt.y));
        var qz = span ? Math.max(span.baseZ, Math.min(span.topZ, spawnAt.z)) : NaN;
        var ox = spawnAt.x - qx, oy = spawnAt.y - qy, oz = spawnAt.z - qz;
        place = {kind: spawnAt.kind, cell: [spawnAt.gx, spawnAt.gy], off: Math.round(Math.hypot(ox, oy, oz) * 1000) / 1000,
          towardShooter: ox * Math.cos(wall.ang) + oy * Math.sin(wall.ang) < 0, span: span && [Math.round(span.baseZ), Math.round(span.topZ)],
          spawnZ: Math.round(spawnAt.z * 1000) / 1000};
      }
      return {hash: hash, contacts: contacts, reassigned: reassigned, wall: [wall.gx, wall.gy, Math.round(wall.d)], place: place,
        failures: (G.getEffectStats().failures.fxEvent || 0) - f0, errors: G.__registryErrors.slice(e0, e0 + 1),
        warned: warnings.slice(w0).filter(function (w) { return /fxEvent failed: a13 contact reader/.test(w); }).length};
    }
    var clean = replay(false), faulty = replay(true);
    // The generated world's wall (not an authored grid): the debris point is
    // 0.5..1 u outside the struck cell's solid box, on the shooter's side.
    var pl = clean.place;
    check('a generated-world wall hit starts its debris on the shooter\'s side of the struck face', !!pl && pl.kind === 'wall' &&
      pl.cell[0] === clean.wall[0] && pl.cell[1] === clean.wall[1] && pl.off >= 0.5 && pl.off <= 1 && pl.towardShooter && !!pl.span,
      {wall: clean.wall, place: pl});
    injected.fxEvent += faulty.failures;
    if (clean.contacts < 1) throw Error('SETUP the A13 shot made no contact (' + JSON.stringify(clean.wall) + ')');
    check('a throwing contact reader never reaches gameplay code', faulty.hash === clean.hash && faulty.reassigned === true && clean.reassigned === true &&
      faulty.contacts === 1 && clean.contacts === 1 && JSON.parse(clean.hash).impacts.length === 1 &&
      faulty.failures >= 1 && faulty.warned === 1 && !faulty.errors.length && clean.failures === 0,
      {wall: clean.wall, sameHash: faulty.hash === clean.hash, reassigned: faulty.reassigned, failures: faulty.failures, warned: faulty.warned,
        errors: faulty.errors, contacts: {clean: clean.contacts, faulty: faulty.contacts}});
    G.fxState = liveFx;
  });

  // I1: a 600-tick seeded Endless replay (walk, dash, a real cast and kill,
  // a stat pickup collected by updateStatPickups, a shrine activated by the
  // keyboard path between ticks) with harness-queued test bursts; the gameplay
  // hash and the gameplay Math.random count must not depend on density,
  // toggles or Legacy/New. resetEndlessMode clears the pickup and shrine state.
  // From S3 the pool runs the shipping table (its ambient field and torch
  // embers) plus the test recipes, and the spawn prerequisite is met by the
  // shipping ambient field alone. Settings, toggles and family modes are set
  // before the world starts, so the Legacy variants run the legacy ambient
  // init and update (on the private stream) from the reset on.
  if (needed('I1', ['--cosmetic-math-random'])) run('I1 gameplay invariance', function () {
    // S7: weather is forced in two variants (rain; snow with every family
    // New); the Legacy preset keeps rain selected, so Unified effects off is
    // what stops it. (Ash: weather.js B1, the random-stream check itself.)
    var VARIANTS = [{name: 'P25'}, {name: 'P25 again'}, {name: 'P0', P: 0}, {name: 'P60', P: 60},
      {name: 'presets off', toggles: {fxDebris: false, fxFootDust: false, fxWeather: 'off'}},
      {name: 'weather rain', toggles: {fxWeather: 'rain'}},
      {name: 'Legacy preset', toggles: {fxUnified: false, fxWeather: 'rain', fxDebris: false, fxFootDust: false}},
      {name: 'every family New, snow', P: 60, families: 'new', toggles: {fxWeather: 'snow'}}];
    function lane() {
      for (var a = 0; a < 16; a++) {
        try { var t = G.castingStudioFindTarget(G.pos, {ang: a * Math.PI / 8}, true); t.ang = a * Math.PI / 8; return t; } catch (e) {}
      }
      throw Error('SETUP I1 found no clear lane from the Endless spawn');
    }
    function r6(v) { return Math.round(v * 1e6) / 1e6; }
    function xy(list) { return list.map(function (o) { return [r6(o.x), r6(o.y)]; }); }
    var table = G.compileFxRecipes(Object.assign({}, G.FX_RECIPE_SOURCE, TEST_RECIPES), G.FX_MATERIALS);
    if (table.FIELDS[0].sets.every(function (set) { return !set.r.length; })) throw Error('SETUP I1 table has no ambient field members');
    function replay(v) {
      // Torch embers follow the ambient family (their legacy code runs inside it).
      var counter = {n: 0}, fams = Object.keys(G.EFFECT_FAMILY_MIGRATED).filter(function (f) { return !G.EFFECT_FAMILY_FOLLOWS[f]; });
      G.settings.particles = v.P === undefined ? 25 : v.P;
      Object.keys(v.toggles || {}).forEach(function (k) { G.setEffectToggle(k, v.toggles[k]); });
      if (v.families) fams.forEach(function (f) { G.setEffectFamilyMode(f, v.families); });
      startEndless(777, counter);
      var S = G.fxState = G.createFxState(3072, G.WORLD_SEED, {compiled: table, pinned: true});
      G.startGameClock(); G.clearGameplayInput();
      G.USE_KEYBOARD = true; G.USE_MOUSE = true; G.USE_GAMEPAD = false; G.CONTROL_MODE = G.MODE_STICK_AIM;
      G.health = G.HEALTH_MAX; G.mana = G.MANA_MAX; G.currentSpellIdx = 0;
      var t = lane(), e = G.enemies.slice().sort(function (a, b) { return Math.hypot(a.x - G.pos.x, a.y - G.pos.y) - Math.hypot(b.x - G.pos.x, b.y - G.pos.y); })[0];
      e.x = t.x; e.y = t.y; e.z = t.z; e.feetZ = t.feetZ; e.renderFloorZ = t.renderFloorZ; e.health = 1; e.speed = 0; e.chaseRange = 0;
      e.enemyType = Object.assign({}, e.enemyType, {speed: 0, chaseRange: 0}); e.underground = false;
      var stats0 = JSON.parse(JSON.stringify(G.stats));      // cumulative across worlds: hash this run's change
      counter.n = 0;
      var shrine = null, events = {}, savedEvent = G.fxEvent;
      // S4+: the real producers' effect events (kill, stat pickup, shrine).
      G.fxEvent = function (type) { events[type] = (events[type] || 0) + 1; return savedEvent.apply(G, arguments); };
      try {
        for (var k = 0; k < 600; k++) {
          G.cam.ang = t.ang; G._attackHeld = k < 400; G.kbState.up = k >= 240 && k < 360; G.dashPressed = k === 300;
          if (k === 150) G.statPickups.push({x: G.pos.x + 5, y: G.pos.y, type: 'movementTome', wx: G.pos.x + 5 + G.windowOriginX, wy: G.pos.y + G.windowOriginY});
          if (k === 200) { shrine = {x: G.pos.x + 10, y: G.pos.y, buffType: 'damage', used: false}; G.shrines.push(shrine); G.activateShrine(shrine); }
          if (k % 10 === 0) G.enemies.forEach(function (n) {
            if (Math.hypot(n.x - G.pos.x, n.y - G.pos.y) < 400) G.fxEmit('test.debris', n.x, n.y, (Number.isFinite(n.feetZ) ? n.feetZ : G.playerFeetSpatialZ()) + 20, {count: 6, color: 0xffaa44});
          });
          if (k % 30 === 0) G.fxEmit('test.drip', G.pos.x + 40, G.pos.y, G.playerFeetSpatialZ() + 90, {count: 5});
          if (k % 60 === 0) G.fxEmit('test.fb', G.pos.x, G.pos.y, G.playerFeetSpatialZ() + 10, {count: 12});
          G.runSimulationTick(1 / 60);
        }
      } finally {
        G.fxEvent = savedEvent;
        G._attackHeld = false; G.kbState.up = false; G.settings.particles = 25;
        G.EFFECT_TOGGLE_DEFS.forEach(function (d) { G.setEffectToggle(d.key, d.default); });
        fams.forEach(function (f) { G.setEffectFamilyMode(f, null); });
      }
      var hash = JSON.stringify({pos: [r6(G.pos.x), r6(G.pos.y), r6(G.pos.floorZ)], vel: [r6(G.vel.x), r6(G.vel.y)], health: G.health,
        mana: r6(G.mana), coins: G.coins, enemies: G.enemies.map(function (n) { return [r6(n.x), r6(n.y), n.health]; }),
        projectiles: xy(G.projectiles), impacts: xy(G.impacts), orbs: xy(G.soulOrbs), coinDrops: xy(G.coinDrops),
        stats: Object.keys(G.stats).map(function (k) { return G.stats[k] - stats0[k]; })});
      return {name: v.name, hash: hash, draws: counter.n, kills: G.stats.totalEnemiesKilled - stats0.totalEnemiesKilled,
        contacts: G.stats.totalDamageDone - stats0.totalDamageDone, spawned: S.stats.spawned, field: S.stats.fieldSpawned,
        legacyMotes: G.ambientParticles.length, events: events, steps: S.stats.obsSteps, weather: S.stats.weatherSpawned,
        pickups: Object.keys(G.collectedStatPickups).length, shrine: !!shrine && shrine.used && G.dmgBoostUntil > 0};
    }
    var runs = VARIANTS.map(replay), ref = runs[0];
    // S4+: the producers' events reach the engine in every variant (the
    // Legacy preset runs their adapters instead). S6+: the movement observers
    // lay the walk's footsteps, except where Footstep dust is off or at
    // Particles 0, where the observers idle (S6 review round 2).
    var producers = runs.every(function (r) { return r.events.enemyDeath >= 1 && r.events.pickup === 1 && r.events.shrine === 1 && r.events.projectileContact >= 1; });
    var observers = runs.every(function (r) { return r.name === 'presets off' || r.name === 'Legacy preset' || r.name === 'P0' ? r.steps === 0 : r.steps >= 3; });
    // S7+: forced rain and snow really fall through the replay; off, P0 and
    // the Legacy preset (rain selected) spawn no weather.
    var weather = runs[5].weather >= 1000 && runs[7].weather >= 300 && runs[4].weather === 0 && runs[6].weather === 0 && runs[2].weather === 0;
    check('the I1 replay casts, hits, kills, collects, activates and spawns (non-vacuous)', ref.kills >= 1 && ref.contacts >= 1 && ref.field >= 50 &&
      ref.pickups === 1 && ref.shrine && runs[2].spawned < ref.spawned && runs[3].spawned > ref.spawned && runs[4].spawned < ref.spawned &&
      runs[2].field === 0 && runs[3].field > ref.field && runs[6].field === 0 && runs[6].legacyMotes > 0 && ref.legacyMotes === 0 && producers && observers &&
      weather, runs.map(function (r) { return {name: r.name, kills: r.kills, contacts: r.contacts, spawned: r.spawned, field: r.field,
        legacyMotes: r.legacyMotes, pickups: r.pickups, shrine: r.shrine, events: r.events, steps: r.steps, weather: r.weather}; }));
    var differ = runs.filter(function (r) { return r.hash !== ref.hash || r.draws !== ref.draws; })
      .map(function (r) { return {name: r.name, draws: r.draws, sameHash: r.hash === ref.hash}; });
    check('particle density, fx toggles and Legacy/New never shift gameplay', !differ.length, {referenceDraws: ref.draws, differ: differ});
    G.fxState = liveFx;
  });

  // A13 (rebase part, pulled forward from S2): a throwing rebase hook during a
  // real crossing is counted and warned once; assembleWindow still rebases
  // companions and allies exactly once and logs no crash. Runs last, because
  // under --unguarded-rebase the world is left half-rebased.
  run('A13 rebase isolation', function () {
    startEndless(777);
    G.startGameClock(); G.clearGameplayInput();
    var armed = true;
    G.registerEffectFamily('a13Probe', {storage: 'globals', globals: 'a13ProbeFlag', studio: 'none', owner: 'test',
      hooks: {rebase: function () { if (armed) throw Error('a13 probe rebase hook'); }}, draw3D: {none: 'probe'}, draw2D: {none: 'probe'}});
    var half = Math.floor(G.WINDOW_CHUNKS / 2), edge = (G.windowCX + half + 1) * G.CHUNK_SIZE - G.windowOriginX;
    var companion = {x: edge - 20, y: G.pos.y + 3}, ally = {x: edge - 25, y: G.pos.y - 4};
    G.companions = [companion]; G.fortressAllies = [ally];
    function world(b) { return [b.x + G.windowOriginX, b.y + G.windowOriginY]; }
    var before = JSON.stringify([world(companion), world(ally)]), failures0 = G.getEffectStats().failures.rebase || 0;
    var warned0 = warnings.length, errors0 = G.__registryErrors.length;
    var shift = crossEast(), camOffset = G.cam.x - G.pos.x;
    armed = false;
    injected.rebase = (G.getEffectStats().failures.rebase || 0) - failures0;
    var hookWarnings = warnings.slice(warned0).filter(function (w) { return /rebase failed: a13 probe rebase hook/.test(w); }).length;
    check('the A13 crossing is a real 480 u window shift', shift === 480, {shift: shift});
    check('a cosmetic rebase failure never reaches gameplay code', JSON.stringify([world(companion), world(ally)]) === before &&
      near(camOffset, 0) && G.__registryErrors.length === errors0 && injected.rebase === 1 && hookWarnings === 1,
      {before: before, after: JSON.stringify([world(companion), world(ally)]), camOffset: camOffset, rebaseFailures: injected.rebase,
        warnings: hookWarnings, errors: G.__registryErrors.slice(errors0, errors0 + 1)});
    G.companions = []; G.fortressAllies = [];
  });

  var stats = G.getEffectStats(), failures = Object.keys(stats.failures).filter(function (k) { return stats.failures[k] - (injected[k] || 0); });
  check('no effect registry runtime failures were counted', !failures.length, {failures: stats.failures, injected: injected});
  check('no console errors from the game', G.__registryErrors.length === 0, G.__registryErrors.slice(0, 3));
  Math.random = originalRandom;
  output('EFFECT_REGISTRY_RESULT ' + (failed ? 'FAIL ' + failed + '/' : 'PASS ') + checked);
}());
undefined;
