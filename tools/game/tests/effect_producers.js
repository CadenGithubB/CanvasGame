// Effect producers (unified effects V1, slice S4): the formerly dead feedback
// bursts, death bones in 3D and the 2D gaps. A full-game host loads the real
// manifest and runs the real generator (Endless seed 424242 at noon, the
// first-person camera at pitch 0 down a clear lane; seed 777 for the replays),
// fixed ticks and the real frame (renderFrame through a recording Canvas);
// bones also run on authored floors (a 20 degree ramp and a flat floor). The
// producers are the game's own: the player walks onto an arcane tome and a
// stat pickup (updateArcaneTomes, updateStatPickups), activates a shrine with
// the keyboard handler the game registered and with the gamepad in
// handleInput, dies wearing the Phoenix Feather (step), procs Thunder Core
// (applyRelicOnHit) and loses a garrison ally (updateFortressAllies); enemies
// die in updateEnemies and a spawner through updateProjectiles.
// Risks covered: feedback that first person cannot see (a burst below or
// behind the camera, above or below the view while the player looks down or
// up, or walked through while the player keeps walking) or records pruned
// before any frame draws them (E1), stacked rings instead of a radial burst
// (E2), a producer pushing malformed impact records (E3), bones drawn only in
// 2D, with an end through the floor, off their slope or never bouncing (E4),
// soul orbs, spawner coins and pickup feedback invisible or faint in 2D (E5),
// a Legacy/New switch that moves the gameplay random stream or shows both or
// neither source (E6), and two legacy deaths in one tick throwing identical
// bones (E7).
// Oracles: recorded Canvas commands (fills and strokes in the event
// material's colour, inside the canvas, per frame stage), the authored ramp
// plane (bone ends, and the feet of struck and fallen bodies), the legacy
// record shapes and 2D bone colour, a counting gameplay Math.random, the
// registry's malformed counter and particle identities. Controls: the camera
// turned round, no proc, the shrine burst held at its source.
// Mutations are applied to slurped sources only (anchors match exactly once):
//   --place-source-only     --burst-zero-speed      --push-legacy-shape
//   --bones-2d-only         --bone-no-ground        --no-orb-2d
//   --coin-nan-bob          --legacy-unscoped-random --legacy-rng-per-call
//   --thunder-at-target     --front-ignores-pitch   --front-no-inherit
//   --shrine-source         --bone-stick            --bone-no-restitution
//   --bone-centre-contact   --bone-flat-rest        --orb-save-always
//   --orb-no-cull           --feedback-2d-1px       --rest-draws-tumble
//   --rising-stick-rests    --lift-damps-vz
// S5 closed two S4 gaps (spec build notes S3-S4): a resting bone is drawn at
// the slope's tilt (not its frozen tumble), and a bone whose end swings into
// the floor while it rises is lifted, not stopped: it keeps the velocity of
// the same bone in free flight.
(function () {
  var G = (0, eval)('this'), output = (__engine === 'node' || __engine === 'deno') ? console.log.bind(console) : __out;
  var checked = 0, failed = 0, loadErrors = [], warnings = [], originalRandom = Math.random;
  var DT = 1 / 60, TAN20 = Math.tan(20 * Math.PI / 180);
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
  G.__producerSource = function (path, source) {
    if (path === 'src/11-fx-engine.js') {
      // First-person placement ignored: every burst spawns at its source.
      source = mutate(source, '--place-source-only', '  if (S.placeOver[r] >= 0) place = S.placeOver[r];', '  place = FX_PLACE_SOURCE;');
      // A legacy adapter called on the gameplay stream.
      source = mutate(source, '--legacy-unscoped-random', '      if (adapter) effectWithLegacyRandom(adapter, a, b, c);', '      if (adapter) adapter(a, b, c);');
      // Before the S4 review: the front point ignored pitch (eye height minus drop).
      source = mutate(source, '--front-ignores-pitch', '  var p = Number.isFinite(cam.pitch) ? cam.pitch : 0, fd = dist / Math.sqrt(1 + p * p);',
        '  var p = 0, fd = dist;');
      // Before the S4 review: a burst moved in front stood still in the world.
      source = mutate(source, '--front-no-inherit', '  else fxFrontVelocity(ctx);\n', '');
      // Before the S4 review: sticks touched the floor at their centre only.
      source = mutate(source, '--bone-centre-contact', '  if (stick) gz = fxStickSupport(S, i, r, px, py, gc);', '');
      // Before the S4 review: a resting stick lay level whatever the slope.
      source = mutate(source, '--bone-flat-rest', '  S.spin[i] = Math.atan2(g1 - g2, 2 * hl);', '  S.spin[i] = 0;');
      // A rising stick whose end dips into the support stops there (rests),
      // or is lifted but loses most of its rise (the S5 review's probe).
      source = mutate(source, '--rising-stick-rests', '  if (stick && S.vz[i] > 0) { S.z[i] = gz + 0.05; S.flags[i] |= FX_SNAP; return false; }\n', '');
      source = mutate(source, '--lift-damps-vz', '  if (stick && S.vz[i] > 0) { S.z[i] = gz + 0.05; S.flags[i] |= FX_SNAP; return false; }\n',
        '  if (stick && S.vz[i] > 0) { S.z[i] = gz + 0.05; S.vz[i] *= 0.2; S.flags[i] |= FX_SNAP; return false; }\n');
    }
    if (path === 'src/02-effect-registry.js') {
      // Before review M12: the legacy stream reseeded from seed ^ tick on every call.
      source = mutate(source, '--legacy-rng-per-call', '  Math.random = _effectLegacyRandom;\n',
        '  Math.random = _effectLegacyRandom;\n  _effectLegacyTarget.legacyRng = (fxState.seed ^ fxState.tick) >>> 0;\n');
      // Before S4: bones stayed on their legacy path, drawn only by the 2D view.
      source = mutate(source, '--bones-2d-only', 'bones:true, pickupBursts:true', 'bones:false, pickupBursts:true');
    }
    if (path === 'src/11-fx-recipes.js') {
      source = mutate(source, '--burst-zero-speed', "spawn:{shape:'ring', radius:[1, 2], direction:'radial', speed:[22, 34], up:[8, 22], inherit:1},",
        "spawn:{shape:'ring', radius:[1, 2], direction:'radial', speed:[0, 0], up:[8, 22], inherit:1},");
      var boneCollision = "    collision:{mode:'bounce', stratum:'reference', restitution:0.3, friction:0.55, bounces:2, restSeconds:[0.3, 0.5]},";
      source = mutate(source, '--bone-no-ground', boneCollision, boneCollision.replace("mode:'bounce'", "mode:'none'"));
      // Bones that stop dead at their first contact, or bounce with no energy.
      source = mutate(source, '--bone-stick', boneCollision, boneCollision.replace("mode:'bounce'", "mode:'rest'"));
      source = mutate(source, '--bone-no-restitution', boneCollision, boneCollision.replace('restitution:0.3', 'restitution:0'));
      // The shrine burst held where the shrine stands (the review's probe).
      source = mutate(source, '--shrine-source', "  'burst.shrine': {extends:'feedbackBurst', trigger:", "  'burst.shrine': {extends:'feedbackBurst', place:'source', trigger:");
    }
    if (path === 'src/17-input-lighting-update.js') {
      // The historical shrine producer: {life,maxLife} records in impacts.
      source = mutate(source, '--push-legacy-shape', "  if (typeof fxEvent === 'function') fxEvent('shrine', shr);\n",
        "  for (var pi = 0; pi < 12; pi++) {\n    var ang = (pi / 12) * Math.PI * 2;\n    impacts.push({\n      x: shr.x, y: shr.y, z: 10,\n" +
        "      vx: Math.cos(ang) * 40, vy: Math.sin(ang) * 40, vz: 30 + Math.random() * 20,\n      life: 0.8, maxLife: 0.8,\n" +
        "      color: shr.buffType === 'damage' ? '#ff4444' : shr.buffType === 'speed' ? '#44ffff' : shr.buffType === 'regen' ? '#44ff44' : '#ffaa44',\n" +
        "      size: 4\n    });\n  }\n");
    }
    // The spark marks the struck enemy instead of the neighbour the chain hit.
    if (path === 'src/03-level-generation.js') {
      source = mutate(source, '--thunder-at-target', "        if (typeof fxEvent === 'function') fxEvent('thunderCore', bestE);",
        "        if (typeof fxEvent === 'function') fxEvent('thunderCore', enemy);");
    }
    if (path === 'src/14-fx-render.js') {
      source = mutate(source, '--no-orb-2d', '  drawSoulOrbs2D();\n  if (!(MODE3D', '  if (!(MODE3D');
      // An orb stage that opens its state before culling, or draws every orb.
      source = mutate(source, '--orb-save-always', '  if (!list || !list.length) return;\n  try {', '  if (!list || !list.length) return;\n  ctx.save(); ctx.restore();\n  try {');
      source = mutate(source, '--orb-no-cull', '      if (!o || !(o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1)) continue;', '      if (!o) continue;');
      // The 1 px 2D dot floor of spec 5.8, whatever the recipe's minPx.
      source = mutate(source, '--feedback-2d-1px', 'if (v2 === FXV_DOT) { prim = FXP_DOT; if (lo2 < 1) lo2 = 1;', 'if (v2 === FXV_DOT) { prim = FXP_DOT; lo2 = 1;');
      // A resting stick drawn at its frozen tumble instead of the support's tilt.
      source = mutate(source, '--rest-draws-tumble', 'rot = (fl & FX_REST) ? S.spin[i] : S.rot[i]', 'rot = S.rot[i]');
    }
    if (path === 'src/15-render-hud-menu.js') {
      source = mutate(source, '--coin-nan-bob', '    var bob = Math.sin(now * 0.004 + (Number.isFinite(c.bob) ? c.bob : 0)) * 3;',
        '    var bob = Math.sin(now * 0.004 + c.bob) * 3;');
    }
    return source;
  };
  G.__producerLoad = function (path) {
    try { (0, eval)(G.__producerSource(path, slurp('assets/games/' + path))); } catch (e) {
      if (/^MUTATION_ANCHOR/.test(e.message)) throw e;
      loadErrors.push(path + ': ' + e.message);
    }
  };
  var host = slurp('tools/game/tests/cave_occlusion_integration.js');
  var end = host.indexOf('  function check(name, okay) {');
  if (end < 0) throw Error('SETUP producer host boundary missing');
  host = host.slice(0, end);
  var load = "manifest.parts.MAIN.forEach(function (path) { (0, eval)(slurp('assets/games/' + path)); });";
  if (host.split(load).length !== 2) throw Error('SETUP producer manifest boundary missing');
  host = host.replace(load, 'manifest.parts.MAIN.forEach(G.__producerLoad);');
  // The keyboard path is the game's own handler: the stub document keeps the
  // listeners the game registers.
  var doc = 'G.document = stub({getElementById: element,';
  if (host.split(doc).length !== 2) throw Error('SETUP producer document boundary missing');
  host = host.replace(doc, 'G.document = stub({addEventListener: function (type, fn) { (G.__listeners[type] = G.__listeners[type] || []).push(fn); }, getElementById: element,');
  G.__listeners = {};
  (0, eval)(host + 'G.__producerErrors = errors; }());');
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
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function lcg(seed) { var s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  check('every game fragment loads without an error', !loadErrors.length, {loadErrors: loadErrors});
  if (loadErrors.length) { output('EFFECT_PRODUCERS_RESULT FAIL ' + failed + '/' + checked + ' (load failed)'); return; }

  // ── Recording Canvas: the drawing state with a real save/restore stack and
  // the translation (fx and 2D stages only translate), and every fill,
  // stroke and image of the watched frame stages with the path and style it
  // used, in canvas pixels. Other calls fall through to the host stub.
  var hostCtx = G.ctx, rec = {stage: null, watch: null, draws: [], path: [], stack: [], calls: {}, blurSets: 0};
  var state = {fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1,
    shadowBlur: 0, tx: 0, ty: 0};
  var STATE_KEYS = Object.keys(state);
  function watching() { return !!(rec.watch && rec.stage && rec.watch.test(rec.stage)); }
  function draw(kind, extra) {
    if (!watching()) return;
    var d = {kind: kind, stage: rec.stage, alpha: state.globalAlpha, path: rec.path.slice()};
    for (var k in extra) d[k] = extra[k];
    rec.draws.push(d);
  }
  function pathOp(name) {
    return function (a, b, c, d, e) {
      if (name === 'arc') rec.path.push(['arc', a + state.tx, b + state.ty, c]);
      else if (name === 'rect') rec.path.push(['rect', a + state.tx, b + state.ty, c, d]);
      else if (name === 'ellipse') rec.path.push(['ellipse', a + state.tx, b + state.ty, c, d]);
      else rec.path.push([name, a + state.tx, b + state.ty]);
    };
  }
  var own = {
    save: function () { rec.stack.push(STATE_KEYS.map(function (k) { return state[k]; })); },
    restore: function () { var f = rec.stack.pop(); if (f) STATE_KEYS.forEach(function (k, i) { state[k] = f[i]; }); },
    translate: function (x, y) { state.tx += x; state.ty += y; },
    beginPath: function () { rec.path = []; },
    moveTo: pathOp('moveTo'), lineTo: pathOp('lineTo'), arc: pathOp('arc'), rect: pathOp('rect'), ellipse: pathOp('ellipse'),
    fill: function () { draw('fill', {style: state.fillStyle}); },
    stroke: function () { draw('stroke', {style: state.strokeStyle}); },
    drawImage: function (img, x, y, w, h) { draw('image', {x: x + state.tx, y: y + state.ty, w: w, h: h}); }
  };
  var wrappers = {};
  var recCtx = new Proxy(state, {
    get: function (t, k) {
      if (typeof k !== 'string') return undefined;
      if (Object.prototype.hasOwnProperty.call(state, k)) return state[k];
      if (wrappers[k]) return wrappers[k];
      var impl = own[k], hv = hostCtx[k];
      if (!impl && typeof hv !== 'function') return hv;
      wrappers[k] = function () {
        if (rec.stage) rec.calls[rec.stage] = (rec.calls[rec.stage] || 0) + 1;
        return impl ? impl.apply(null, arguments) : hv.apply(hostCtx, arguments);
      };
      return wrappers[k];
    },
    set: function (t, k, v) {
      if (rec.stage) rec.calls[rec.stage] = (rec.calls[rec.stage] || 0) + 1;
      if (k === 'shadowBlur' && v > 0 && watching()) rec.blurSets++;
      state[k] = v; return true;
    }
  });
  G.ctx = recCtx;
  var realPt = G._pt, stageErrors = [];
  var FX_STAGES = /^(fxCombat3D|ambientFX3D|fxOverlay|fx2D|coins2D|impacts3D)$/;
  // One real frame; the stages named by `watch` are recorded.
  function frame(watch) {
    rec.draws = []; rec.calls = {}; rec.path = []; rec.watch = watch || FX_STAGES;
    G._pt = function (name, fn) {
      var prev = rec.stage; rec.stage = name;
      try { return fn(); } catch (e) { stageErrors.push(name + ': ' + e.message); } finally { rec.stage = prev; }
    };
    try { G.renderFrame(); } finally { G._pt = realPt; rec.stage = null; rec.watch = null; }
    return rec.draws;
  }
  // The same recording around one direct stage call (authored scenes).
  function stage(name, fn) {
    rec.draws = []; rec.calls = {}; rec.path = []; rec.watch = /./; rec.stage = name;
    try { fn(); } finally { rec.stage = null; rec.watch = null; }
    return rec.draws;
  }
  function rgb(hex) { var v = parseInt(hex.slice(1), 16); return 'rgb(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ')'; }
  function inCanvas(x, y) { return x >= 0 && x <= G.canvas.width && y >= 0 && y <= G.canvas.height; }
  // Distinct canvas positions (half-pixel grid) of the dots (arc and rect
  // subpaths of fills) drawn in `stageName` in one of `styles`, inside the
  // canvas. A glow's core and its halo share a centre and count once.
  function dots(draws, stageName, styles) {
    var seen = {}, list = [];
    draws.forEach(function (d) {
      if (d.stage !== stageName || d.kind !== 'fill' || styles.indexOf(d.style) < 0) return;
      d.path.forEach(function (c) {
        var x = c[0] === 'arc' ? c[1] : c[0] === 'rect' ? c[1] + c[3] / 2 : NaN, y = c[0] === 'arc' ? c[2] : c[0] === 'rect' ? c[2] + c[4] / 2 : NaN;
        var key = Math.round(x * 2) + ',' + Math.round(y * 2);
        if (inCanvas(x, y) && !seen[key]) { seen[key] = 1; list.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]); }
      });
    });
    return list;
  }
  // Distinct line pieces (a moveTo followed by lineTo) of strokes in
  // `styles` that start inside the canvas: streaks, bones.
  function lines(draws, stageName, styles) {
    var seen = {}, n = 0;
    draws.forEach(function (d) {
      if (d.stage !== stageName || d.kind !== 'stroke' || (styles && styles.indexOf(d.style) < 0)) return;
      for (var i = 0; i + 1 < d.path.length; i++) {
        var a = d.path[i], b = d.path[i + 1];
        if (a[0] !== 'moveTo' || b[0] !== 'lineTo' || !inCanvas(a[1], a[2])) continue;
        var key = Math.round(a[1] * 2) + ',' + Math.round(a[2] * 2) + ',' + Math.round(b[1] * 2) + ',' + Math.round(b[2] * 2);
        if (!seen[key]) { seen[key] = 1; n++; }
      }
    });
    return n;
  }
  function lit(hex) {                                     // a colour at the eight light levels (spec 5.6, restated)
    var v = parseInt(hex.slice(1), 16);
    return [0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92, 1.0].map(function (f) {
      return 'rgb(' + Math.round(((v >> 16) & 255) * f) + ',' + Math.round(((v >> 8) & 255) * f) + ',' + Math.round((v & 255) * f) + ')';
    });
  }

  // Every producer event, counted by type on its way to the real fxEvent.
  var events = {}, realEvent = G.fxEvent;
  G.fxEvent = function (type) { events[type] = (events[type] || 0) + 1; return realEvent.apply(G, arguments); };
  function failures() { var f = G.getEffectStats().failures, n = 0; for (var k in f) n += f[k]; return n; }
  function malformedImpacts() { return G.getEffectStats().registry.malformed.impacts || 0; }
  var malformed0 = malformedImpacts();
  function byRecipe(S, id) {
    var r = S.C.ID[id], out = [];
    for (var i = 0; i < S.count; i++) if (S.rec[i] === r) out.push(i);
    return out;
  }

  // ── World fixtures ────────────────────────────────────────────────────────
  // Endless: the first Math.random draw becomes WORLD_SEED (the lab's
  // startEndless steering); later draws come from a seeded LCG, counted.
  function startEndless(seed, counter) {
    var next = lcg(seed * 7919 + 13), used = false;
    Math.random = function () { if (counter) counter.n++; if (!used) { used = true; return (seed - 0.5) / 999999; } return next(); };
    G.CAVE_TEST_MODE = false; G.ENDLESS_MODE = true; G.running = true; G.gameOverState = false;
    G.menuOpen = G.settingsOpen = G.shopOpen = G.inventoryOpen = G.forgeOpen = G.overviewActive = false;
    G.MODE3D = true; G.CAM_FOLLOW = true; G.settings.particles = 25;
    G.resetEndlessMode();
    if (G.WORLD_SEED !== seed) throw Error('SETUP world seed ' + G.WORLD_SEED + ' is not ' + seed);
    G.settings.dayNight = true; G.dayTime = 0.5; G.daySpeed = 0;
    G.startGameClock(); G.clearGameplayInput(); G.updateDayNight(0);
    G.USE_KEYBOARD = true; G.USE_MOUSE = true; G.USE_GAMEPAD = false; G.CONTROL_MODE = G.MODE_STICK_AIM;
    G.health = G.HEALTH_MAX; G.mana = G.MANA_MAX;
  }
  // The longest clear lane from the spawn (castingStudioFindTarget walks it
  // on the real grid and support): the camera looks down it at pitch 0.
  function longestLane() {
    var best = null;
    for (var a = 0; a < 16; a++) {
      try {
        var t = G.castingStudioFindTarget(G.pos, {ang: a * Math.PI / 8}, false);
        if (!best || t.distance > best.distance) { best = t; best.ang = a * Math.PI / 8; }
      } catch (e) {}
    }
    if (!best || best.distance < 180) throw Error('SETUP no clear lane of 180 u from the spawn (' + (best && best.distance) + ')');
    return best;
  }
  function freshFx() { return (G.fxState = G.createFxState(G.EFFECT_CONFIG.capacity, G.WORLD_SEED, {pinned: true})); }
  function ticks(n) { for (var k = 0; k < n; k++) G.runSimulationTick(DT); }
  function tame(e, x, y, health) {
    e.x = x; e.y = y; delete e.feetZ; e.underground = false; e.caveSpawnId = null; e.health = health; e.speed = 0; e.chaseRange = 0;
    e.enemyType = Object.assign({}, e.enemyType, {speed: 0, chaseRange: 0, attackDamage: 0});
    return e;
  }

  startEndless(424242);
  var LANE = longestLane(), P0 = {x: G.pos.x, y: G.pos.y, floorZ: G.pos.floorZ}, POOL = G.enemies.slice();
  var AHEAD = [Math.cos(LANE.ang), Math.sin(LANE.ang)], SIDE = [-AHEAD[1], AHEAD[0]];
  function ahead(d, lateral) { return {x: P0.x + AHEAD[0] * d + SIDE[0] * (lateral || 0), y: P0.y + AHEAD[1] * d + SIDE[1] * (lateral || 0)}; }
  // Back at the lane start, looking down it, with nothing else in play.
  function scene() {
    G.MODE3D = true; G.CAM_FOLLOW = true; G.running = true; G.gameOverState = false; G.settings.particles = 25;
    G.clearGameplayInput(); G.USE_KEYBOARD = true; G.USE_MOUSE = true; G.USE_GAMEPAD = false; G.gpLast = {x: 0, y: 0, buttons: 0xffff, valid: false};
    G.pos.x = P0.x; G.pos.y = P0.y; G.pos.floorZ = P0.floorZ; G.vel.x = G.vel.y = 0;
    G.cam.x = G.pos.x; G.cam.y = G.pos.y; G.cam.z = G.pos.floorZ; G.cam.ang = LANE.ang; G.cam.pitch = 0;
    G.enemies = []; G.enemySpawners = []; G.arcaneTomes = []; G.statPickups = []; G.shrines = []; G.fortressAllies = []; G.companions = [];
    G.treasureChests = []; G.shopMarker = null; G.impacts = []; G.deathEffects = []; G.soulOrbs = []; G.coinDrops = []; G.projectiles = [];
    G.equipment.relic = null; G.phoenixFeatherUsed = false; G.health = G.HEALTH_MAX; G.mana = G.MANA_MAX;
    G.setEffectToggle('fxUnified', true);
    events = {};
    return freshFx();
  }
  // Frames at 0, 3, ... 18 ticks (0.3 s) after the event's spawn tick; each
  // counts the burst's drawn particles. Returns the counts and the best.
  function within(count) {
    var seen = [];
    for (var k = 0; k <= 18; k += 3) { if (k) ticks(3); seen.push(count(frame())); }
    return {frames: seen, best: Math.max.apply(null, seen)};
  }

  // ── Authored floors ───────────────────────────────────────────────────────
  // Authored floors (projectile_sweeps.js style): a 20 degree ramp z = x tan 20
  // and a flat floor; the player and camera look +x at the kill site.
  var MW = 31, GS = 12;
  function mesh(kind) {
    var m = {w: MW, h: MW, gridSize: GS, layerCount: new Uint8Array(MW * MW)};
    for (var l = 0; l < 5; l++) { m['l' + l + 'Type'] = new Uint8Array(MW * MW); m['l' + l + 'TopZ'] = new Float64Array(MW * MW); m['l' + l + 'Meta'] = new Uint8Array(MW * MW); }
    for (var y = 0; y < MW; y++) for (var x = 0; x < MW; x++) {
      var i = y * MW + x;
      m.layerCount[i] = 1; m.l0Type[i] = 1; m.l0Meta[i] = 1; m.l0TopZ[i] = kind === 'ramp' ? x * GS * TAN20 / 25 : 0;
    }
    return m;
  }
  function authored(kind) {
    G.floorMesh = mesh(kind); G.ENDLESS_MODE = false; G.CAVE_TEST_MODE = false; G.level = 1; G.terrain = 'ground';
    G.cell = GS; G.gridW = G.gridH = MW; G.grid = new Uint8Array(MW * MW); G.wallHeights = G.wallFaceBase = G.wallMaxTopZ = null;
    G.deepCaveRegions = []; G.windowOriginX = G.windowOriginY = 0; G.playerUnderground = false;
    var ground = kind === 'ramp' ? 60 * TAN20 : 0;
    G.pos = {x: 60, y: 180, floorZ: 60 + 40 * ground / 25}; G.cam = {x: 60, y: 180, z: G.pos.floorZ, ang: 0, pitch: 0, fov: G.GAME_CONFIG.player.baseFov};
    G.MODE3D = true; G.CAM_FOLLOW = true; G.viewCam = {x: 180 - G.canvas.width / 2, y: 180 - G.canvas.height / 2};
    G.enemies = []; G.enemySpawners = []; G.projectiles = []; G.impacts = []; G.deathEffects = []; G.soulOrbs = []; G.coinDrops = [];
    G.renderPresentationAlpha = 1; G.goalSpawned = true;               // a classic level spawns its goal when the last enemy dies
    return freshFx();
  }
  function kill(x, y) {
    G.enemies = [{x: x, y: y, health: 0, underground: false, enemyType: {id: 'normal', size: 1}}];
    G.updateEnemies(DT);
  }
  function combatFrame() {
    G.beginSceneDepthFrame(G.canvas.width, G.canvas.height);
    return stage('fxCombat3D', function () { G.beginEffectFrame(); G.drawEffectLayer3D(1); });
  }

  // ── E1: feedback visible in first person, from the real producers ───────
  var E1 = {};
  // A burst marks the body it came from: every particle, one tick after its
  // spawn, lies within `reach` of the body's column and between its feet and
  // head (plus reach). Oracle: the authored ramp under the body (feet at
  // x tan 20), never the support helper the event reader uses.
  function atBody(S, id, body, height, reach) {
    var feet = body.x * TAN20, off = [];
    byRecipe(S, id).forEach(function (i) {
      var d = Math.hypot(S.x[i] - body.x, S.y[i] - body.y), up = S.z[i] - feet;
      if (!(d <= reach && up >= -reach && up <= height + reach)) off.push({d: r3(d), up: r3(up)});
    });
    return {n: byRecipe(S, id).length, off: off.slice(0, 3)};
  }
  var TOME = [rgb('#bb66ff')], MANA = [rgb('#4488ff')], SPEED = [rgb('#44ffff')], GARRISON = [rgb('#c8a028')];
  var RING = [rgb('#fff3c4'), rgb('#ffc966'), rgb('#f0762c')], STORM = [rgb('#ffffff'), rgb('#fff6a8')];
  function tomeDots(d) { return dots(d, 'ambientFX3D', TOME).length; }
  function statDots(d) { return dots(d, 'ambientFX3D', MANA).length; }
  function speedDots(d) { return dots(d, 'ambientFX3D', SPEED).length; }
  function stormLines(d) { return lines(d, 'ambientFX3D', STORM); }
  function allyDots(d) { return dots(d, 'ambientFX3D', GARRISON).length; }
  // Control: the camera turned round (after the spawn) draws none of a
  // world-placed burst.
  function turned(count) { G.cam.ang += Math.PI; var n = count(frame()); G.cam.ang -= Math.PI; return n; }
  // The tome's own art (a filled diamond in its colour) inside the canvas.
  function tomeArtDrawn() {
    return frame(/^arcaneTomes3D$/).some(function (d) { return d.kind === 'fill' && d.style === '#bb66ff' && d.path.some(function (c) { return inCanvas(c[1], c[2]); }); });
  }
  // The player walks onto a tome 70 u down the lane at `pitch`
  // (updateArcaneTomes collects within 30 u); counts the approach ticks on
  // which the tome itself is on screen when asked.
  function collectTome(pitch, keepWalking, watchItem) {
    var S = scene(), t = ahead(70), walked = 0, seen = 0;
    G.cam.pitch = pitch;
    G.arcaneTomes = [{x: t.x, y: t.y, spawnMs: G.gameTimeNow(), bob: 0}];
    G.kbState.up = true;
    while (G.arcaneTomes.length && walked < 120) { if (watchItem && tomeArtDrawn()) seen++; ticks(1); walked++; }
    if (!keepWalking) G.kbState.up = false;
    if (G.arcaneTomes.length || events.pickup !== 1) throw Error('SETUP the player never collected the tome (' + walked + ' ticks, pitch ' + pitch + ')');
    if (G.cam.pitch !== pitch) throw Error('SETUP the pitch moved from ' + pitch + ' to ' + G.cam.pitch + ' while walking');
    return {S: S, walked: walked, itemSeen: seen};
  }
  if (needed('E1', ['--place-source-only', '--push-legacy-shape', '--thunder-at-target', '--front-ignores-pitch', '--front-no-inherit', '--shrine-source'])) run('E1 first-person feedback', function () {
    // Tome at pitch 0.
    var tome0 = collectTome(0, false, false), S = tome0.S;
    var tome = within(tomeDots), tomeLive = byRecipe(S, 'burst.tome').length, tomeTurned = turned(tomeDots);
    E1.tome = {walked: tome0.walked, frames: tome.frames, live: tomeLive, turned: tomeTurned};
    check('tome pickup burst is visible in first person', tome.best >= 8 && tomeTurned === 0, {seed: 424242, need: '8/15', tome: E1.tome});

    // Looking down (1.2: the player watches the tome while walking onto it)
    // and up (-0.6): pitch persists under mouse, arrow and stick look.
    function pitched(pitch, watch) {
      var run1 = collectTome(pitch, false, watch), seen = within(tomeDots);
      return {pitch: pitch, item: run1.itemSeen, frames: seen.frames, live: byRecipe(run1.S, 'burst.tome').length, turned: turned(tomeDots), best: seen.best};
    }
    var down = pitched(1.2, true), up = pitched(-0.6, false);
    G.cam.pitch = 0;
    if (!down.item) throw Error('SETUP the tome is never on screen at pitch 1.2 before the pickup');
    check('tome pickup burst is visible in first person looking down and up', down.best >= 8 && up.best >= 8 && down.turned === 0 && up.turned === 0,
      {seed: 424242, need: '8/15', down: down, up: up});

    // The player keeps walking after the pickup (about 90 u/s): the burst
    // carries the walking velocity, so it is not walked through within 0.4 s.
    var walk = collectTome(0, true, false), walkFrames = [];
    for (var k = 0; k <= 24; k += 3) { if (k) ticks(3); walkFrames.push(tomeDots(frame())); }
    G.kbState.up = false;
    var walkMin = Math.min.apply(null, walkFrames);
    check('a tome burst stays in front of a player who keeps walking', walkMin >= 12,
      {seed: 424242, need: '12/15 through 0.4 s', walking: {minThrough0p4s: walkMin, frames: walkFrames, speed: r3(Math.hypot(G.vel.x, G.vel.y)), live: byRecipe(walk.S, 'burst.tome').length}});

    // Stat pickup: a Mana Star (its event colour, #4488ff).
    S = scene(); var t = ahead(70), walked = 0;
    G.statPickups = [{x: t.x, y: t.y, type: 'manaStar', wx: t.x + G.windowOriginX, wy: t.y + G.windowOriginY, bob: 0}];
    G.kbState.up = true;
    while (G.statPickups.length && walked < 120) { ticks(1); walked++; }
    G.kbState.up = false;
    if (G.statPickups.length || events.pickup !== 1) throw Error('SETUP the player never collected the stat pickup (' + walked + ' ticks)');
    var stat = within(statDots), statTurned = turned(statDots);
    check('stat pickup burst is visible in first person', stat.best >= 6 && statTurned === 0, {seed: 424242, need: '6/12', frames: stat.frames, walked: walked, turned: statTurned});

    // Shrine: the keyboard handler (between ticks) and the gamepad in
    // handleInput, with the shrine beside and behind the camera (inside the
    // 50 u activation radius), where a burst at the shrine is never on screen;
    // and straight ahead. Control: the same off-axis keyboard activation with
    // the burst held at its source draws nothing.
    var keydown = G.__listeners.keydown || [];
    if (keydown.length < 2) throw Error('SETUP the game registered ' + keydown.length + ' keydown listeners');
    function impactDraws() { return frame().filter(function (d) { return d.stage === 'impacts3D'; }).length; }
    function shrineRun(path, p, place) {
      var S2 = scene(), shr = {x: p.x, y: p.y, buffType: 'speed', used: false}, legacy = null;
      if (place) G.setEffectPlacementOverride('burst.shrine', place);
      try {
        G.shrines = [shr];
        ticks(1);                                            // tickEffects finds the shrine in range
        if (G.nearestShrine !== shr) throw Error('SETUP the shrine is not the nearest in range (' + path + ')');
        if (path === 'keyboard') {
          keydown.forEach(function (fn) { fn({key: 'e', target: null, repeat: false, shiftKey: false, preventDefault: function () {}}); });
          // Between the keydown and the next tick (the historical producer's
          // records exist only here) and after it.
          legacy = {recordsBefore: G.impacts.length, drawsBefore: impactDraws()};
        } else {
          G.USE_GAMEPAD = true; G.USE_MOUSE = false; G.lastShopGpA = false;
          G.gpLast = {x: 0, y: 0, buttons: 0xffff & ~G.BTN_A, valid: true};
        }
        ticks(1);
        if (legacy) { legacy.recordsAfter = G.impacts.length; legacy.drawsAfter = impactDraws(); }
        G.USE_GAMEPAD = false; G.USE_MOUSE = true; G.gpLast = {x: 0, y: 0, buttons: 0xffff, valid: false};
        if (!shr.used) throw Error('SETUP the ' + path + ' path did not activate the shrine');
        var seen = within(speedDots);
        return {frames: seen.frames, best: seen.best, events: events.shrine || 0, live: byRecipe(S2, 'burst.shrine').length,
          buff: G.speedBoostUntil > G.gameTimeNow(), turned: turned(speedDots), legacy: legacy};
      } finally { if (place) G.setEffectPlacementOverride('burst.shrine', null); }
    }
    // Off axis: 10 u behind the camera plane, 30 u to either side.
    var left = ahead(-10, 30), right = ahead(-10, -30);
    var kb = shrineRun('keyboard', left), pad = shrineRun('gamepad', right), front = shrineRun('keyboard', ahead(40));
    var held = shrineRun('keyboard', left, 'source');
    E1.shrine = {keyboard: kb, gamepad: pad, ahead: front, heldAtSource: held, malformed: malformedImpacts() - malformed0};
    check('shrine burst is visible in first person on the keyboard and gamepad paths', kb.best >= 6 && pad.best >= 6 && front.best >= 6 &&
      kb.buff && pad.buff && front.buff && kb.turned === 0 && pad.turned === 0 && held.best === 0 && held.live === 12,
      {seed: 424242, need: '6/12', shrine: E1.shrine});

    // Phoenix Feather: step() revives the player at 0 health; the ring is in eye space.
    // A lethal hit leaves health below zero (step() regenerates before its check).
    S = scene(); G.equipment.relic = {id: 'phoenixFeather', effect: 'phoenixRevive'}; G.health = -5;
    ticks(1);
    if (G.health !== G.HEALTH_MAX || !G.phoenixFeatherUsed || events.phoenix !== 1) throw Error('SETUP the Phoenix Feather did not revive the player');
    var ring = within(function (d) { return dots(d, 'fxOverlay', RING).length; });
    G.cam.ang += Math.PI; var ringTurned = dots(frame(), 'fxOverlay', RING).length; G.cam.ang -= Math.PI;
    check('Phoenix revive ring is visible in first person, in eye space', ring.best >= 10 && ringTurned >= 10,
      {seed: 424242, need: '10/16', frames: ring.frames, turned: ringTurned, live: byRecipe(S, 'burst.phoenixRing').length});

    // Thunder Core: a real proc on the struck enemy's neighbour, in view.
    // Control: the same scene with no proc draws no storm streak.
    function thunderScene(proc) {
      var S3 = scene(), a = ahead(100), b = ahead(110, 18);
      G.enemies = [tame(POOL[0], a.x, a.y, 50), tame(POOL[1], b.x, b.y, 50)];
      G.equipment.relic = {id: 'thunderCore', effect: 'chainLightning', value: 1};
      if (proc) {
        G.applyRelicOnHit(3, G.enemies[0], false);
        if (events.thunderCore !== 1 || !(G.enemies[1].health < 50)) throw Error('SETUP Thunder Core did not proc on the neighbour');
      }
      ticks(1);                                              // the queued event spawns in the next tick
      return S3;
    }
    thunderScene(true);
    var thunder = within(stormLines), thunderTurned = turned(stormLines);
    thunderScene(false);
    var quiet = within(stormLines);

    // Garrison ally death, in view: updateFortressAllies removes it and emits.
    S = scene(); var al = ahead(90, -10);
    G.fortressAllies = [{x: al.x, y: al.y, z: 0, health: 0, maxHealth: 6, name: 'Aldric', vx: 0, vy: 0}];
    ticks(1);
    if (G.fortressAllies.length || events.allyDeath !== 1) throw Error('SETUP the ally death did not run');
    var ally = within(allyDots), allyTurned = turned(allyDots);

    // Both bursts at the body, on the authored ramp: the same producers.
    var RS = authored('ramp'); events = {}; G.fortressAllies = [];
    G.enemies = [tame(POOL[0], 160, 180, 50), tame(POOL[1], 170, 198, 50)];
    G.equipment.relic = {id: 'thunderCore', effect: 'chainLightning', value: 1};
    G.applyRelicOnHit(3, G.enemies[0], false);
    if (events.thunderCore !== 1) throw Error('SETUP Thunder Core did not proc on the authored ramp');
    G.updateEffects(DT);
    var struck = atBody(RS, 'burst.thunder', G.enemies[1], 40 * (G.enemies[1].enemyType.size || 1), 3 + 190 * DT + 0.5);
    var fallen = {x: 150, y: 160, z: 0, health: 0, maxHealth: 6, name: 'Sera', vx: 0, vy: 0};
    G.fortressAllies = [fallen]; G.updateFortressAllies(DT);
    if (events.allyDeath !== 1) throw Error('SETUP the ally death did not run on the authored ramp');
    G.updateEffects(DT);
    var body = atBody(RS, 'burst.allyDeath', fallen, 50, 5 + 50 * DT + 0.5);
    G.equipment.relic = null; G.fortressAllies = [];
    startEndless(424242);                                   // the generated world again, for E2
    check('Thunder Core burst is visible at the struck body', thunder.best >= 5 && thunderTurned === 0 && quiet.best === 0 && struck.n === 8 && !struck.off.length,
      {seed: 424242, need: '5/8', atBody: struck, frames: thunder.frames, turned: thunderTurned, noProc: quiet.frames});
    check('garrison ally death burst is visible at the body', ally.best >= 5 && allyTurned === 0 && body.n === 8 && !body.off.length,
      {seed: 424242, need: '5/8', atBody: body, frames: ally.frames, turned: allyTurned});
  });

  // ── E2: the tome burst is radial, not stacked rings ─────────────────────
  if (needed('E2', ['--burst-zero-speed'])) run('E2 radial bursts', function () {
    function tomeAt(legacy) {
      var S = scene(), t = ahead(70), walked = 0;
      if (legacy) G.setEffectFamilyMode('pickupBursts', 'legacy');
      try {
        G.arcaneTomes = [{x: t.x, y: t.y, spawnMs: G.gameTimeNow(), bob: 0}];
        G.kbState.up = true;
        while (G.arcaneTomes.length && walked < 120) { ticks(1); walked++; }
        G.kbState.up = false;
        if (G.arcaneTomes.length) throw Error('SETUP the player never collected the tome');
        return S;
      } finally { G.setEffectFamilyMode('pickupBursts', null); }
    }
    var S = tomeAt(false), radii = [], positions = 0;
    for (var f = 1; f <= 3; f++) {
      ticks(1);
      var idx = byRecipe(S, 'burst.tome'), cx = 0, cy = 0;
      idx.forEach(function (i) { cx += S.x[i] / idx.length; cy += S.y[i] / idx.length; });
      radii.push(idx.length ? idx.reduce(function (m, i) { return m + Math.hypot(S.x[i] - cx, S.y[i] - cy) / idx.length; }, 0) : 0);
      if (f === 3) positions = dots(frame(), 'ambientFX3D', TOME).length;
    }
    // Historical defect: Legacy's 15 stacked records share one position.
    var L = tomeAt(true), rings = G.impacts.filter(function (im) { return im.color === '#bb66ff'; });
    var centres = {};
    rings.forEach(function (im) { centres[r3(im.x) + ',' + r3(im.y)] = 1; });
    check('pickup bursts are radial, not stacked rings', positions >= 12 && radii[1] > radii[0] + 0.1 && radii[2] > radii[1] + 0.1 &&
      rings.length === 15 && Object.keys(centres).length === 1 && byRecipe(L, 'burst.tome').length === 0,
      {seed: 424242, distinctAtFrame3: positions, meanRadius: radii.map(r3), legacy: {records: rings.length, centres: Object.keys(centres).length}});
  });

  // ── E4: death bones in 3D and 2D, resting on the slope ──────────────────
  var BONE = lit('#cfc8b8'), BONE2D = [rgb('#cfc8b8')], SPAWNER = lit('#3a1520');
  if (needed('E4', ['--bones-2d-only', '--bone-no-ground', '--bone-stick', '--bone-no-restitution', '--bone-centre-contact', '--bone-flat-rest',
      '--rest-draws-tumble', '--rising-stick-rests', '--lift-damps-vz'])) run('E4 death bones', function () {
    // A bone's centre and two ends, restated from the stick the renderer
    // draws: azimuth phase, tumble rot (at rest the support's tilt, which the
    // engine keeps in spin), half of its hashed length (noise key 20).
    function bonePoints(S, i) {
      var r = S.rec[i], hl = (S.R.len0[r] + (S.R.len1[r] - S.R.len0[r]) * G.effectNoise(S.seedA[i], 20)) / 2;
      var tilt = (S.flags[i] & 1) ? S.spin[i] : S.rot[i], cr = Math.cos(tilt) * hl, ez = Math.sin(tilt) * hl;
      var ex = Math.cos(S.phase[i]) * cr, ey = Math.sin(S.phase[i]) * cr;
      return [[S.x[i], S.y[i], S.z[i]], [S.x[i] + ex, S.y[i] + ey, S.z[i] + ez], [S.x[i] - ex, S.y[i] - ey, S.z[i] - ez]];
    }
    // The screen ends of a resting bone, from the authored slope: it lies on
    // the plane along its azimuth, so its tilt is atan(slope x cos azimuth);
    // projected with the game's projToScreen (whole pixels).
    function restEnds(S, i, slope) {
      var r = S.rec[i], hl = (S.R.len0[r] + (S.R.len1[r] - S.R.len0[r]) * G.effectNoise(S.seedA[i], 20)) / 2, ph = S.phase[i];
      var tilt = Math.atan(slope * Math.cos(ph)), c = Math.cos(tilt) * hl, ez = Math.sin(tilt) * hl, C = G.getCam3D();
      return [G.projToScreen(S.x[i] + Math.cos(ph) * c, S.y[i] + Math.sin(ph) * c, S.z[i] + ez, C),
        G.projToScreen(S.x[i] - Math.cos(ph) * c, S.y[i] - Math.sin(ph) * c, S.z[i] - ez, C)];
    }
    function strokePieces(draws) {
      var out = [];
      draws.forEach(function (d) {
        if (d.stage !== 'fxCombat3D' || d.kind !== 'stroke' || BONE.indexOf(d.style) < 0) return;
        for (var j = 0; j + 1 < d.path.length; j++) if (d.path[j][0] === 'moveTo' && d.path[j + 1][0] === 'lineTo') out.push([d.path[j], d.path[j + 1]]);
      });
      return out;
    }
    function settle(kind) {
      var S = authored(kind), seen = {}, below = [], drawn = [], restDraw = {compared: 0, off: []};
      function clearance(q) { return q[2] - (kind === 'ramp' ? q[0] * TAN20 : 0); }   // above the authored plane
      kill(180, 180);
      if (events.enemyDeath === undefined) throw Error('SETUP the enemy death emitted no event');
      for (var k = 1; k <= 120; k++) {
        G.updateEffects(DT);
        if (k === 6 || k === 12) drawn.push(lines(combatFrame(), 'fxCombat3D', BONE));
        // Every drawn resting bone lies at the slope's tilt: the stroke drawn
        // about its centre (the nearest midpoint within 3 px; a faded or culled
        // bone draws none) ends within 1.5 px of the authored ends.
        var resting = byRecipe(S, 'bone.enemy').filter(function (i) { return S.flags[i] & 1; });
        if (resting.length) {
          var pieces = strokePieces(combatFrame()), C = G.getCam3D();
          resting.forEach(function (i) {
            var e = restEnds(S, i, kind === 'ramp' ? TAN20 : 0), c = G.projToScreen(S.x[i], S.y[i], S.z[i], C), best = null, bestD = 3;
            if (!e[0] || !e[1] || !c) return;
            pieces.forEach(function (pc) {
              var d = Math.hypot((pc[0][1] + pc[1][1]) / 2 - c.sx, (pc[0][2] + pc[1][2]) / 2 - c.sy);
              if (d <= bestD) { bestD = d; best = pc; }
            });
            if (!best) return;
            restDraw.compared++;
            function near(p, q) { return Math.abs(p[1] - q.sx) <= 1.5 && Math.abs(p[2] - q.sy) <= 1.5; }
            if (near(best[0], e[0]) && near(best[1], e[1]) || near(best[0], e[1]) && near(best[1], e[0])) return;
            restDraw.missed = (restDraw.missed || 0) + 1;
            if (restDraw.off.length < 3) restDraw.off.push({tick: k, want: [[e[0].sx, e[0].sy], [e[1].sx, e[1].sy]],
              drawn: [[r3(best[0][1]), r3(best[0][2])], [r3(best[1][1]), r3(best[1][2])]]});
          });
        }
        byRecipe(S, 'bone.enemy').forEach(function (i) {
          var s = seen[S.seedA[i]] || (seen[S.seedA[i]] = {rest: null, falling: false, bounced: false, lifted: false});
          var pts = bonePoints(S, i), low = Math.min(clearance(pts[0]), clearance(pts[1]), clearance(pts[2]));
          if (low < -0.5) below.push({seed: S.seedA[i], x: r3(S.x[i]), z: r3(S.z[i]), low: r3(low), rest: !!(S.flags[i] & 1), tick: k});
          if ((S.flags[i] & 1) && !s.rest) s.rest = {x: r3(S.x[i]), z: r3(S.z[i]), plane: r3(S.z[i] - clearance(pts[0])), ends: [r3(clearance(pts[1])), r3(clearance(pts[2]))]};
          // A bounce: falling, then rising again before rest, then clear of the floor.
          if (!(S.flags[i] & 1)) {
            if (S.vz[i] < 0) s.falling = true;
            else if (s.falling && S.vz[i] > 0) s.bounced = true;
            if (s.bounced && low > 0.5) s.lifted = true;
          }
        });
      }
      var keys = Object.keys(seen), rested = keys.filter(function (s) { return seen[s].rest; }).map(function (s) { return seen[s].rest; });
      var off = rested.filter(function (r) { return Math.abs(r.z - r.plane) > 0.6 || r.ends.some(function (e) { return Math.abs(e) > 0.6; }); });
      return {bones: keys.length, rested: rested.length, off: off.slice(0, 3), below: below.length, firstBelow: below[0] || null, drawn: drawn, restDraw: restDraw,
        climbs: kind === 'ramp' ? rested.filter(function (r) { return r.plane > 180 * TAN20 + 1; }).length : 0,
        bounced: keys.filter(function (s) { return seen[s].bounced && seen[s].lifted; }).length};
    }
    events = {};
    var ramp = settle('ramp'); events = {};
    var flat = settle('flat');
    check('death bones are drawn in 3D', ramp.drawn[0] >= 5 && flat.drawn[0] >= 5, {need: '5/7 at 0.1 s', ramp: ramp.drawn, flat: flat.drawn});
    // Both ends and the centre: never 0.5 below the authored plane in flight
    // or at rest, and at rest within 0.6 of it.
    check('death bones rest on the sloped floor', ramp.bones === 7 && ramp.rested >= 5 && !ramp.off.length && !ramp.below && ramp.climbs > 0 &&
      flat.bones === 7 && flat.rested >= 5 && !flat.off.length && !flat.below, {tolerance: 0.6, ramp: ramp, flat: flat});
    check('death bones bounce before they settle', ramp.bounced >= 5 && flat.bounced >= 5,
      {need: '5/7 rise again and clear the floor by 0.5 before resting', ramp: {bounced: ramp.bounced, rested: ramp.rested}, flat: {bounced: flat.bounced, rested: flat.rested}});
    check('a resting bone is drawn at the tilt of the slope it lies on', ramp.restDraw.compared >= 20 && !ramp.restDraw.missed &&
      flat.restDraw.compared >= 20 && !flat.restDraw.missed, {tolerance: '1.5 px', ramp: ramp.restDraw, flat: flat.restDraw});
    // A tumbling bone rising off the floor with its lower end swung into it:
    // one tick later it still rises, lifted so that end sits on the floor,
    // with its velocity and its x and y exactly those of the same bone
    // posed 50 u higher, clear of the floor (the free-flight control).
    // (Bones held on the engine path for this unit fixture, whatever the migration table says.)
    function riser(z0) {
      var LS = authored('flat'); events = {};
      G.setEffectFamilyMode('bones', 'new');
      try { kill(180, 180); G.updateEffects(DT); } finally { G.setEffectFamilyMode('bones', null); }
      var li = byRecipe(LS, 'bone.enemy')[0];
      if (li === undefined) throw Error('SETUP the unit fixture threw no pool bone');
      var lseed = LS.seedA[li], lr = LS.rec[li], lhl = (LS.R.len0[lr] + (LS.R.len1[lr] - LS.R.len0[lr]) * G.effectNoise(lseed, 20)) / 2;
      LS.x[li] = 180; LS.y[li] = 180; LS.z[li] = z0; LS.vx[li] = LS.vy[li] = 0; LS.vz[li] = 100; LS.rot[li] = -Math.PI / 2 + 0.1; LS.spin[li] = 0;
      LS.flags[li] &= ~1; LS.gcell[li] = -1;
      var freeLow = z0 + 100 * DT - Math.abs(Math.sin(LS.rot[li])) * lhl;
      G.updateEffects(DT);
      var lj = -1;
      for (var q = 0; q < LS.count; q++) if (LS.seedA[q] === lseed && LS.rec[q] === lr) lj = q;
      if (lj < 0) throw Error('SETUP the lifted bone is gone');
      return {freeLow: freeLow, resting: !!(LS.flags[lj] & 1), vz: LS.vz[lj], x: LS.x[lj], y: LS.y[lj], lowEnd: LS.z[lj] - Math.abs(Math.sin(LS.rot[lj])) * lhl, hl: lhl};
    }
    var lifted = riser(1), free = riser(51);
    if (!(lifted.freeLow < -0.5) || !(free.lowEnd > 10)) throw Error('SETUP the bone end would not reach into the floor (' + lifted.freeLow + '), or the control would');
    check('a bone whose end swings into the floor while it rises is lifted, not stopped', !lifted.resting && lifted.vz > 0 &&
      lifted.lowEnd >= -0.01 && lifted.lowEnd <= 0.2 && Math.abs(lifted.vz - free.vz) < 1e-9 && lifted.x === free.x && lifted.y === free.y && lifted.x === 180,
      {freeFlightLowEnd: r3(lifted.freeLow), resting: lifted.resting, vz: r3(lifted.vz), freeVz: r3(free.vz), xy: [r3(lifted.x), r3(lifted.y)],
        freeXy: [r3(free.x), r3(free.y)], lowEnd: r3(lifted.lowEnd), halfLength: r3(lifted.hl)});
    // A spawner killed by a real projectile through updateProjectiles.
    var S = authored('flat'); events = {};
    G.enemySpawners = [{x: 190, y: 180, active: true, hp: 1}];
    G.projectiles = [{x: 150, y: 180, z: 55, ang: 0, speed: 240, hz: 240, vz: 0, r: 8, spell: G.spells.missile,
      spawnMs: G.gameTimeNow() - 100, lifeMs: 1500, renderFloorZ: 0}];
    G.updateProjectiles(0.5);
    if (G.enemySpawners[0].active || events.spawnerDeath !== 1) throw Error('SETUP the projectile did not destroy the spawner');
    for (var k = 0; k < 6; k++) G.updateEffects(DT);
    var spawnerBones = byRecipe(S, 'bone.spawner').length, spawnerDrawn = lines(combatFrame(), 'fxCombat3D', SPAWNER);
    check('a spawner killed through updateProjectiles throws bones drawn in 3D', spawnerBones === 5 && spawnerDrawn >= 3 && G.deathEffects.length === 0,
      {bones: spawnerBones, drawn: spawnerDrawn, legacyRecords: G.deathEffects.length});
    // 2D: seven sticks at the first frame, none after 2 s.
    S = authored('flat'); G.MODE3D = false; events = {};
    kill(180, 180); G.updateEffects(DT);
    var first = lines(stage('fx2D', function () { G.drawEffectLayer2D(); }), 'fx2D', BONE2D);
    for (k = 0; k < 120; k++) G.updateEffects(DT);
    var later = lines(stage('fx2D', function () { G.drawEffectLayer2D(); }), 'fx2D', BONE2D);
    G.MODE3D = true;
    check('death bones are drawn in 2D', first === 7 && later === 0, {first: first, after2s: later});
  });

  // ── E5: soul orbs and bob-less coins are visible in 2D ──────────────────
  if (needed('E5', ['--no-orb-2d', '--coin-nan-bob', '--orb-save-always', '--orb-no-cull', '--feedback-2d-1px'])) run('E5 2D gaps', function () {
    startEndless(424242); scene();
    G.MODE3D = false;
    var W = G.canvas.width, H = G.canvas.height;
    G.viewCam.x = G.pos.x - W / 2; G.viewCam.y = G.pos.y - H / 2;
    var orb = {x: G.pos.x + 60, y: G.pos.y - 30, renderFloorZ: 0, underground: false, spawnMs: G.gameTimeNow(), bob: 1.3};
    var far = {x: G.pos.x + 2000, y: G.pos.y, renderFloorZ: 0, underground: false, spawnMs: G.gameTimeNow(), bob: 0};
    // A spawner coin has no bob (10-combat.js); an enemy coin has one.
    var bare = {x: G.pos.x - 60, y: G.pos.y + 30, underground: false, spawnMs: G.gameTimeNow(), lifeMs: 25000};
    var bobbed = {x: G.pos.x - 110, y: G.pos.y - 30, underground: false, spawnMs: G.gameTimeNow(), bob: 0.5};
    G.soulOrbs = [orb, far]; G.coinDrops = [bare, bobbed];
    rec.blurSets = 0;                                        // this frame's fx stages only (the tome art in E1 blurs)
    var d = frame(), ox = G.viewCam.x, oy = G.viewCam.y;
    // Offsets from the item of the arcs drawn at its column (a NaN height
    // is kept, so the historical invisible coin shows as NaN).
    function arcsNear(stageName, style, p) {
      var out = [];
      d.forEach(function (r) {
        if (r.stage !== stageName || r.kind !== 'fill' || r.style !== style) return;
        r.path.forEach(function (c) {
          var dy = c[2] - (p.y - oy);
          if (c[0] === 'arc' && Math.abs(c[1] - (p.x - ox)) <= 3 && (dy !== dy || Math.abs(dy) <= 8)) out.push(dy);
        });
      });
      return out;
    }
    var orbArcs = arcsNear('fx2D', '#cc88ff', orb), farArcs = arcsNear('fx2D', '#cc88ff', far);
    var bareY = arcsNear('coins2D', '#ffd700', bare), bobbedY = arcsNear('coins2D', '#ffd700', bobbed);
    check('soul orbs are visible in 2D', orbArcs.length === 1 && Math.abs(orbArcs[0]) <= 2.5 && !farArcs.length && rec.blurSets === 0,
      {orb: orbArcs, culled: farArcs.length, blur: rec.blurSets});
    check('spawner coins without a bob are visible in 2D', bareY.length === 1 && Number.isFinite(bareY[0]) && Math.abs(bareY[0]) <= 3 &&
      bobbedY.length === 1 && Math.abs(bobbedY[0]) <= 3, {bare: bareY.map(String), bobbed: bobbedY.map(String)});
    // No orb in view and no particle: the 2D fx stage touches nothing.
    G.soulOrbs = [far]; freshFx();
    frame();
    check('an empty 2D fx stage makes no Canvas call', !(rec.calls.fx2D > 0), {calls: rec.calls.fx2D});
    // Pickup feedback in 2D (the S4 review): the player collects a tome and a
    // Mana Star in one tick; 0.1 s later each burst's dots, in its colour,
    // are at least 2 px across the radius (the legacy cue was a 2 px wide ring).
    function dotRadii(draws, styles) {
      var out = [];
      draws.forEach(function (r) {
        if (r.stage !== 'fx2D' || r.kind !== 'fill' || styles.indexOf(r.style) < 0) return;
        r.path.forEach(function (c) {
          if (c[0] === 'arc' && inCanvas(c[1], c[2])) out.push(c[3]);
          else if (c[0] === 'rect' && inCanvas(c[1] + c[3] / 2, c[2] + c[4] / 2)) out.push(c[3] / 2);
        });
      });
      return out;
    }
    scene(); G.MODE3D = false; G.soulOrbs = []; G.coinDrops = [];
    G.arcaneTomes = [{x: G.pos.x + 5, y: G.pos.y, spawnMs: G.gameTimeNow(), bob: 0}];
    G.statPickups = [{x: G.pos.x - 5, y: G.pos.y, type: 'manaStar', wx: G.pos.x - 5 + G.windowOriginX, wy: G.pos.y + G.windowOriginY, bob: 0}];
    ticks(1);
    if (G.arcaneTomes.length || G.statPickups.length || events.pickup !== 2) throw Error('SETUP the 2D pickups were not collected');
    ticks(6);
    G.viewCam.x = G.pos.x - W / 2; G.viewCam.y = G.pos.y - H / 2;
    var d2 = frame(), tomeR = dotRadii(d2, TOME), statR = dotRadii(d2, MANA);
    function least(list) { return list.length ? Math.min.apply(null, list) : null; }
    check('pickup feedback reads in 2D', tomeR.length >= 12 && statR.length >= 9 && least(tomeR) >= 2 - 1e-9 && least(statR) >= 2 - 1e-9,
      {seed: 424242, need: '12/15 and 9/12 dots of radius 2', tome: {minRadius: least(tomeR), dots: tomeR.length}, stat: {minRadius: least(statR), dots: statR.length}});
    G.MODE3D = true;
  });

  // ── E6: Legacy/New A/B is honest ─────────────────────────────────────────
  // Paired replays of one seeded world: kill, tome, kill, tome; the second
  // run switches Unified effects off for the first pair, mid-session.
  if (needed('E6', ['--legacy-unscoped-random'])) run('E6 honest A/B', function () {
    function replay(legacyMid) {
      var counter = {n: 0};
      startEndless(777, counter);
      var S = G.fxState, near = G.enemies.slice().sort(function (a, b) { return Math.hypot(a.x - G.pos.x, a.y - G.pos.y) - Math.hypot(b.x - G.pos.x, b.y - G.pos.y); });
      var X = near[0], Y = near[1], out = {legacy: null, back: null};
      [X, Y].forEach(function (e, k) { tame(e, G.pos.x + 40, G.pos.y + 20 * k, 50); });
      counter.n = 0;
      function tome() { G.arcaneTomes.push({x: G.pos.x + 5, y: G.pos.y, spawnMs: G.gameTimeNow(), bob: 0}); }
      try {
        for (var k = 0; k < 110; k++) {
          if (k === 10 && legacyMid) G.setEffectToggle('fxUnified', false);
          if (k === 20) X.health = 0;
          if (k === 30) tome();
          if (k === 60 && legacyMid) G.setEffectToggle('fxUnified', true);
          if (k === 70) Y.health = 0;
          if (k === 95) tome();                              // after the Legacy rings (1 s) expired
          G.runSimulationTick(DT);
          if (k === 31) {
            G.MODE3D = false; G.viewCam.x = G.pos.x - G.canvas.width / 2; G.viewCam.y = G.pos.y - G.canvas.height / 2;
            var sticks = lines(frame(/^draw\(\)$/), 'draw()', ['#cfc8b8']);
            G.MODE3D = true;
            var rings = G.impacts.filter(function (im) { return im.color === '#bb66ff' && im.lifeMs === 1000; });
            out.legacy = {deathEffects: G.deathEffects.length, sticks2D: sticks, rings: rings.length,
              sharedCentre: rings.filter(function (im) { return im.x === rings[0].x && im.y === rings[0].y; }).length,
              poolBones: byRecipe(S, 'bone.enemy').length, poolBursts: byRecipe(S, 'burst.tome').length};
          }
          if (k === 96) out.back = {deathEffects: G.deathEffects.length, poolBones: byRecipe(S, 'bone.enemy').length,
            poolBursts: byRecipe(S, 'burst.tome').length, rings: G.impacts.filter(function (im) { return im.color === '#bb66ff'; }).length};
        }
      } finally { G.setEffectToggle('fxUnified', true); }
      out.draws = counter.n;
      out.hash = JSON.stringify({pos: [r3(G.pos.x), r3(G.pos.y)], health: G.health, mana: r3(G.mana), coins: G.coins,
        enemies: G.enemies.map(function (n) { return [r3(n.x), r3(n.y), n.health]; }), orbs: G.soulOrbs.length, coinDrops: G.coinDrops.map(function (c) { return [r3(c.x), r3(c.y)]; })});
      return out;
    }
    var on = replay(false), mid = replay(true);
    check('with Unified effects off the legacy stacked rings and 2D bones return and the engine spawns no burst',
      mid.legacy.deathEffects === 7 && mid.legacy.sticks2D === 7 && mid.legacy.rings === 15 && mid.legacy.sharedCentre === 15 &&
      mid.legacy.poolBones === 0 && mid.legacy.poolBursts === 0 && on.legacy.deathEffects === 0 && on.legacy.poolBones === 7 &&
      on.legacy.poolBursts === 15 && mid.back.deathEffects === 0 && mid.back.poolBones === 7 && mid.back.poolBursts === 15 && mid.back.rings === 0,
      {offThenOn: mid.legacy, backOn: mid.back, reference: on.legacy});
    check('switching Unified effects off and on mid-session never changes the gameplay random stream', on.draws === mid.draws && on.hash === mid.hash,
      {seed: 777, drawsOn: on.draws, drawsMid: mid.draws, sameHash: on.hash === mid.hash});
  });

  // ── E7: two legacy deaths in one tick throw different bones ─────────────
  if (needed('E7', ['--legacy-rng-per-call'])) run('E7 same-tick deaths', function () {
    function twoDeaths(unified) {
      startEndless(777); G.setEffectToggle('fxUnified', unified);
      try {
        var S = G.fxState, pair = G.enemies.slice(0, 2);
        pair.forEach(function (e) { tame(e, G.pos.x + 40, G.pos.y, 0); });
        G.runSimulationTick(DT);
        var bones = unified ? byRecipe(S, 'bone.enemy').map(function (i) { return [r3(S.vx[i]), r3(S.vy[i]), r3(S.vz[i]), r3(S.rot[i])]; })
          : G.deathEffects.map(function (b) { return [r3(b.vx), r3(b.vy), r3(b.rot), r3(b.rotVel), r3(b.len)]; });
        var keys = {};
        bones.forEach(function (b) { keys[JSON.stringify(b.slice(0, 2))] = 1; });
        return {bones: bones.length, distinct: Object.keys(keys).length, text: JSON.stringify(bones)};
      } finally { G.setEffectToggle('fxUnified', true); }
    }
    var legacy = twoDeaths(false), again = twoDeaths(false), engine = twoDeaths(true);
    check('two legacy deaths in one tick throw different bones', legacy.bones === 14 && legacy.distinct === 14 && again.text === legacy.text &&
      engine.bones === 14 && engine.distinct === 14, {legacy: {bones: legacy.bones, distinct: legacy.distinct}, replaySame: again.text === legacy.text,
        engine: {bones: engine.bones, distinct: engine.distinct}});
  });

  // ── E3: no producer pushes malformed impact records ──────────────────────
  // A seeded Endless replay (walk, cast and kill, dash, a stat pickup, a
  // keyboard shrine, a tome, Thunder Core procs, a Phoenix revive and a
  // garrison death) on top of every producer above; the registry counts any
  // record whose lifetime is not {spawnMs, lifeMs}.
  if (needed('E3', ['--push-legacy-shape'])) run('E3 record shapes', function () {
    var before = malformedImpacts(), stats0;
    startEndless(777); events = {};
    var t = longestLane(), near = G.enemies.slice().sort(function (a, b) { return Math.hypot(a.x - G.pos.x, a.y - G.pos.y) - Math.hypot(b.x - G.pos.x, b.y - G.pos.y); });
    var c = Math.cos(t.ang), s = Math.sin(t.ang);
    G.enemies = [tame(near[0], G.pos.x + c * 90, G.pos.y + s * 90, 1), tame(near[1], G.pos.x + c * 90 - s * 30, G.pos.y + s * 90 + c * 30, 50)];
    G.equipment.relic = {id: 'thunderCore', effect: 'chainLightning', value: 1};
    stats0 = G.stats.totalEnemiesKilled;
    var keydown = G.__listeners.keydown || [], shrine = null;
    for (var k = 0; k < 600; k++) {
      G.cam.ang = t.ang; G._attackHeld = k < 200; G.kbState.up = k >= 240 && k < 300; G.dashPressed = k === 270;
      if (k === 150) G.statPickups.push({x: G.pos.x + 5, y: G.pos.y, type: 'heartCrystal', wx: G.pos.x + 5 + G.windowOriginX, wy: G.pos.y + G.windowOriginY, bob: 0});
      if (k === 320) { shrine = {x: G.pos.x + 10, y: G.pos.y, buffType: 'regen', used: false}; G.shrines.push(shrine); }
      if (k === 322) keydown.forEach(function (fn) { fn({key: 'e', target: null, repeat: false, shiftKey: false, preventDefault: function () {}}); });
      if (k === 350) G.arcaneTomes.push({x: G.pos.x + 5, y: G.pos.y, spawnMs: G.gameTimeNow(), bob: 0});
      if (k === 400) { G.equipment.relic = {id: 'phoenixFeather', effect: 'phoenixRevive'}; G.phoenixFeatherUsed = false; G.health = -5; }
      if (k === 450) G.fortressAllies.push({x: G.pos.x + 30, y: G.pos.y, z: 0, health: 0, maxHealth: 6, name: 'Sera', vx: 0, vy: 0});
      G.runSimulationTick(DT);
    }
    G._attackHeld = false; G.kbState.up = false;
    // The shrine counts by its own activation; its event only while the
    // producer is the shipping one (--push-legacy-shape restores the old loop).
    var malformed = malformedImpacts() - before, kinds = ['enemyDeath', 'pickup', 'thunderCore', 'phoenix', 'allyDeath'];
    if (!has('--push-legacy-shape')) kinds.push('shrine');
    var missing = kinds.filter(function (kind) { return !(events[kind] >= 1); });
    check('the E3 replay runs every producer (non-vacuous)', !missing.length && events.pickup >= 2 && G.stats.totalEnemiesKilled > stats0 &&
      !!shrine && shrine.used, {seed: 777, events: events, missing: missing, kills: G.stats.totalEnemiesKilled - stats0, shrine: !!shrine && shrine.used});
    check('no producer pushes malformed impact records', malformed === 0 && malformedImpacts() - malformed0 === 0,
      {seed: 777, malformed: malformed, sinceLoad: malformedImpacts() - malformed0, shrineE1: E1.shrine ? E1.shrine.malformed : null});
  });

  check('no effect runtime failures were counted', !failures(), {failures: G.getEffectStats().failures});
  check('no frame stage threw and no console errors from the game', !stageErrors.length && !G.__producerErrors.length,
    {stages: stageErrors.slice(0, 3), errors: G.__producerErrors.slice(0, 3)});
  Math.random = originalRandom;
  output('EFFECT_PRODUCERS_RESULT ' + (failed ? 'FAIL ' + failed + '/' : 'PASS ') + checked);
}());
