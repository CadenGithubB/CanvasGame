// Flame embers (unified effects V1, slice S8): the flame stream's embers as
// particles of the flame.ember recipe, emitted along the beam by the
// flameStream anchor, in place of the shadow-blurred billboard loops of
// drawFlameStream3D/2D (now run only in Legacy mode). A full-game host loads
// the real manifest; the stream is the game's own: the fire spell held down
// through runSimulationTick (handleInput, castStreamAttack), on authored
// floors (F1: flat; F1b raised, stepped, layered and ending in a wall; F1c
// strafing; F1d a tier-2 stream; F1e a floor-level wall), in Endless seed
// 424242 and 777 (F2, F3) and in the Cave Test 12345 chamber (F4); frames
// are the real renderFrame through a recording Canvas.
// Risks covered: embers that leave the player's feet instead of the casting
// hand, fly on a straight line under the beam's arc, stay on its axis
// instead of fanning with it, or keep spawning after the stream stops (F1);
// embers that take the floor at the beam's end, at the feet or from the
// wrong layer of a stack, or a hand at an absolute height, so a beam that
// ends in a wall or on rising ground lifts or buries them (F1b, F4); an ember
// occlusion test whose cost grows with the canvas (F5, 1920 x 1080); embers
// that ignore the player's motion (F1c), the spell's stream width (F1d) or
// the wall the beam ends in (F1e), or lose the UNDER flag in a cave (F4);
// an A/B switch that shows both ember sources or neither, in 3D or 2D, or
// leaves shadowBlur in the New stream (F2); flame embers that consume the
// gameplay random stream or change gameplay (F3).
// Oracles: the beam geometry of drawFlameStream3D restated here (the hand
// 14 u ahead and 6 u right of the player along the aim, 55 u above the feet;
// range x the 0.3 s ramp; height by u squared down to 1 u above the floor
// under each point, sampled with the beam's own spellFloorRenderZ over the
// player's floor; the cone half width 1 + d tan(w) (0.3 + 0.7 u^2), w from
// the spell's tier and width), the authored floors and walls, the recipe's
// authored speed and spread, recorded Canvas commands per frame stage (the
// legacy ember colours, the fire palette's lit colours, shadowBlur sets), a
// counting and a throwing Math.random, and a gameplay hash of paired runs.
// Mutations are applied to slurped sources only (anchors match exactly once):
//   --flame-from-feet       --flame-linear-height   --flame-narrow
//   --flame-after-release   --ember-3d-unguarded    --ember-2d-unguarded
//   --ember-math-random     --flame-end-floor       --flame-floor-at-feet
//   --flame-absolute-height --flame-top-layer       --flame-no-inherit
//   --flame-no-under        --flame-fixed-width     --ember-no-wall
//   --ember-auto-occlusion
(function () {
  var G = (0, eval)('this'), output = (__engine === 'node' || __engine === 'deno') ? console.log.bind(console) : __out;
  var checked = 0, failed = 0, loadErrors = [], warnings = [], originalRandom = Math.random;
  var DT = 1 / 60;
  function has(flag) { return __argv.indexOf(flag) >= 0; }
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
  G.__flameSource = function (path, source) {
    if (path === 'src/11-fx-engine.js') {
      // Embers from the player's feet instead of the casting hand.
      source = mutate(source, '--flame-from-feet', '    ctx.x = pos.x + c * 14 - s * 6; ctx.y = pos.y + s * 14 + c * 6; ctx.z = feet + 55;',
        '    ctx.x = pos.x; ctx.y = pos.y; ctx.z = feet + 55;');
      // A straight line from the hand to the floor, under the beam's arc.
      source = mutate(source, '--flame-linear-height', '(_fxSegP[2] + 1 - ctx.z) * n3 * n3', '(_fxSegP[2] + 1 - ctx.z) * n3');
      // The floor sampled once, at the segment's end (the S8 review defect:
      // a beam ending in a wall or on rising ground lifts every ember).
      source = mutate(source, '--flame-end-floor', 'fxNearestLayerZ(_fxSegP[0], _fxSegP[1], ctx.feet)', 'fxNearestLayerZ(ctx.x2, ctx.y2, ctx.feet)');
      // The floor under every ember taken at the feet.
      source = mutate(source, '--flame-floor-at-feet', 'ctx.z + (_fxSegP[2] + 1 - ctx.z)', 'ctx.z + (ctx.feet + 1 - ctx.z)');
      // The hand at an absolute 55 u instead of 55 u above the feet.
      source = mutate(source, '--flame-absolute-height', 'ctx.z = feet + 55;', 'ctx.z = 55;');
      // The top walkable layer of a stack instead of the one nearest the feet.
      source = mutate(source, '--flame-top-layer', '!(Math.abs(h * 25 - ref) < best)) continue;\n    best = Math.abs(h * 25 - ref); li = k;',
        '!(-h < best)) continue;\n    best = -h; li = k;');
      // Embers that do not carry the player's motion.
      source = mutate(source, '--flame-no-inherit', 'ctx.vx = Number.isFinite(vel.x) ? vel.x : 0; ctx.vy = Number.isFinite(vel.y) ? vel.y : 0;', 'ctx.vx = 0; ctx.vy = 0;');
      // Underground embers not flagged UNDER (surface fog floor and ambient).
      source = mutate(source, '--flame-no-under', 'ctx.flags = playerUnderground ? FX_EV_UNDER : 0;', 'ctx.flags = 0;');
      // The spell's stream width ignored (a tier-2 beam is 0.55 rad wide).
      source = mutate(source, '--flame-fixed-width', 'hw = fire.tier >= 2 ? 0.55 : fire.streamWidth || 0.4;', 'hw = 0.4;');
      // Every ember on the beam's axis.
      source = mutate(source, '--flame-narrow', '    ctx.segW = (1 + range * Math.tan(hw)) * ramp; ctx.dx = c; ctx.dy = s;', '    ctx.segW = 0; ctx.dx = c; ctx.dy = s;');
      // The anchor ignores the beam's draw test: embers after the stream stops.
      source = mutate(source, '--flame-after-release', '    if (!(now - flameStreamLastTick <= 180)) return 0;\n', '');
      // A cosmetic draw from the gameplay random stream.
      source = mutate(source, '--ember-math-random', '    ctx.segW = (1 + range * Math.tan(hw)) * ramp; ctx.dx = c; ctx.dy = s;',
        '    ctx.segW = (1 + range * Math.tan(hw)) * ramp * (0.9 + 0.2 * Math.random()); ctx.dx = c; ctx.dy = s;');
    }
    if (path === 'src/11-fx-recipes.js') {
      // Embers that ignore walls (they fly into the wall the beam ends in).
      source = mutate(source, '--ember-no-wall', "collision:{mode:'kill', stratum:'reference', wall:true},\n    life:{seconds:[0.35, 0.6]",
        "collision:{mode:'kill', stratum:'reference', wall:false},\n    life:{seconds:[0.35, 0.6]");
      // The embers' occlusion chosen by footprint size (the S8 review's
      // 1080p cost: halos past 24 px read the tile summary over their box).
      source = mutate(source, '--ember-auto-occlusion', "occlusion:'corona', lighting:'emissive', view2D:'dot', budget:{maxLive:96}}",
        "occlusion:'auto', lighting:'emissive', view2D:'dot', budget:{maxLive:96}}");
    }
    if (path === 'src/14-render-entities.js') {
      // The legacy ember loops left unguarded: New mode shows both sources.
      var guard = "  if (typeof effectFamilyMode !== 'function' || effectFamilyMode('flameEmbers') === 'legacy') {   // New: flame.ember particles (fx2D/fxCombat3D)\n";
      source = mutate(source, '--ember-3d-unguarded', guard + '  // Animated ember particles scattered across the cone\n',
        '  if (true) {\n  // Animated ember particles scattered across the cone\n');
      source = mutate(source, '--ember-2d-unguarded', guard + '  // Ember particles scattered across the cone\n',
        '  if (true) {\n  // Ember particles scattered across the cone\n');
    }
    return source;
  };
  G.__flameLoad = function (path) {
    try { (0, eval)(G.__flameSource(path, slurp('assets/games/' + path))); } catch (e) {
      if (/^MUTATION_ANCHOR/.test(e.message)) throw e;
      loadErrors.push(path + ': ' + e.message);
    }
  };
  var host = slurp('tools/game/tests/cave_occlusion_integration.js');
  var end = host.indexOf('  function check(name, okay) {');
  if (end < 0) throw Error('SETUP flame host boundary missing');
  host = host.slice(0, end);
  var load = "manifest.parts.MAIN.forEach(function (path) { (0, eval)(slurp('assets/games/' + path)); });";
  if (host.split(load).length !== 2) throw Error('SETUP flame manifest boundary missing');
  host = host.replace(load, 'manifest.parts.MAIN.forEach(G.__flameLoad);');
  (0, eval)(host + 'G.__flameErrors = errors; }());');
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
  if (loadErrors.length) { output('FLAME_EMBERS_RESULT FAIL ' + failed + '/' + checked + ' (load failed)'); return; }

  // ── Recording Canvas: the drawing state with a save/restore stack and the
  // translation, every fill/stroke/image of the frame's stages with its
  // path (canvas pixels), style and alpha, and shadowBlur sets per stage.
  var hostCtx = G.ctx, rec = {stage: null, draws: [], path: [], stack: [], blur: {}};
  var state = {fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1,
    shadowBlur: 0, tx: 0, ty: 0};
  var STATE_KEYS = Object.keys(state);
  function draw(kind, extra) {
    var d = {kind: kind, stage: rec.stage, alpha: state.globalAlpha, op: state.globalCompositeOperation, path: rec.path.slice()};
    for (var k in extra) d[k] = extra[k];
    rec.draws.push(d);
  }
  function pathOp(name) {
    return function (a, b, c, d) {
      if (name === 'arc') rec.path.push(['arc', a + state.tx, b + state.ty, c]);
      else if (name === 'rect') rec.path.push(['rect', a + state.tx, b + state.ty, c, d]);
      else rec.path.push([name, a + state.tx, b + state.ty]);
    };
  }
  var own = {
    save: function () { rec.stack.push(STATE_KEYS.map(function (k) { return state[k]; })); },
    restore: function () { var f = rec.stack.pop(); if (f) STATE_KEYS.forEach(function (k, i) { state[k] = f[i]; }); },
    translate: function (x, y) { state.tx += x; state.ty += y; },
    beginPath: function () { rec.path = []; },
    moveTo: pathOp('moveTo'), lineTo: pathOp('lineTo'), arc: pathOp('arc'), rect: pathOp('rect'),
    fill: function () { draw('fill', {style: state.fillStyle}); },
    stroke: function () { draw('stroke', {style: state.strokeStyle}); },
    drawImage: function (img, x, y, w, h) { draw('image', {x: x + state.tx, y: y + state.ty, w: w, h: h}); }
  };
  var wrappers = {};
  G.ctx = new Proxy(state, {
    get: function (t, k) {
      if (typeof k !== 'string') return undefined;
      if (Object.prototype.hasOwnProperty.call(state, k)) return state[k];
      if (wrappers[k]) return wrappers[k];
      var impl = own[k], hv = hostCtx[k];
      if (!impl && typeof hv !== 'function') return hv;
      wrappers[k] = function () { return impl ? impl.apply(null, arguments) : hv.apply(hostCtx, arguments); };
      return wrappers[k];
    },
    set: function (t, k, v) {
      if (k === 'shadowBlur' && v > 0 && rec.stage) rec.blur[rec.stage] = (rec.blur[rec.stage] || 0) + 1;
      state[k] = v; return true;
    }
  });
  var realPt = G._pt, stageErrors = [];
  // One real frame: every stage recorded under its name.
  function frame() {
    rec.draws = []; rec.path = []; rec.blur = {};
    var after = {};                                        // the effect frame counters after each fx stage
    G._pt = function (name, fn) {
      var prev = rec.stage; rec.stage = name;
      try { return fn(); } catch (e) { stageErrors.push(name + ': ' + e.message); }
      finally { rec.stage = prev; if (/^fx/.test(name)) after[name] = JSON.parse(JSON.stringify(G.getEffectStats().frame)); }
    };
    try { G.renderFrame(); } finally { G._pt = realPt; rec.stage = null; }
    return {draws: rec.draws, blur: rec.blur, after: after};
  }
  // One stage drawn directly (the authored floor has no render mesh).
  function stageFrame(name, fn) {
    rec.draws = []; rec.path = []; rec.blur = {}; rec.stage = name;
    try { fn(); } finally { rec.stage = null; }
    return {draws: rec.draws, blur: rec.blur};
  }
  function inCanvas(x, y) { return x >= 0 && x <= G.canvas.width && y >= 0 && y <= G.canvas.height; }
  function hex(h) { var v = parseInt(h.slice(1), 16); return 'rgb(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ')'; }
  // Filled dots (arc and rect subpaths) of `stage` in one of `styles`, inside the canvas.
  function dots(f, stage, styles) {
    var n = 0;
    f.draws.forEach(function (d) {
      if (d.stage !== stage || d.kind !== 'fill' || styles.indexOf(d.style) < 0) return;
      d.path.forEach(function (c) {
        var x = c[0] === 'arc' ? c[1] : c[0] === 'rect' ? c[1] + c[3] / 2 : NaN, y = c[0] === 'arc' ? c[2] : c[0] === 'rect' ? c[2] + c[4] / 2 : NaN;
        if (inCanvas(x, y)) n++;
      });
    });
    return n;
  }
  // The legacy ember colours (14-render-entities.js drawFlameStream3D/2D) and
  // the new embers' fire palette at full light (emissive, level 7), as filled.
  var LEGACY3D = ['#ffffcc', '#ffdd44', '#ffaa00', '#ff6600', '#ff3300'], LEGACY2D = ['#ffffaa', '#ffcc44', '#ff8800', '#ff4400'];
  var FIRE = ['#fff3c4', '#ffc966', '#f0762c', '#7a2a12'].map(hex);
  function failures() { var f = G.getEffectStats().failures, n = 0; for (var k in f) n += f[k]; return n; }
  function embers(S) {
    var r = S.C.ID['flame.ember'], out = [];
    for (var i = 0; i < S.count; i++) if (S.rec[i] === r) out.push(i);
    return out;
  }
  function flameAnchors(S) {
    var A = S.anchors, code = G.FX_ANCHOR_NAMES.indexOf('flameStream'), n = 0;
    for (var k = 0; k < A.n; k++) if (A.used[k] && A.kind[k] === code) n++;
    return n;
  }
  function freshFx() { return (G.fxState = G.createFxState(G.EFFECT_CONFIG.capacity, G.WORLD_SEED, {pinned: true})); }
  // The fire spell selected with full mana; the attack held (or released:
  // the key-up handler's own two assignments, 23-events-init.js).
  function arm() {
    G.spells.fire.unlocked = true; G.spells.fire.tier = 1; G.spells.fire.streamWidth = 0.4;
    G.currentSpellIdx = G.getUnlockedSpells().indexOf('fire'); G.mana = G.MANA_MAX; G.health = G.HEALTH_MAX;
    G.flameStreamActive = false; G.flameStreamLastTick = 0; G.equipment.relic = null; G.equipment.robes = null;
    if (G.getCurrentSpell().id !== 'fire') throw Error('SETUP the fire spell is not selected');
  }
  function hold(on) { G._attackHeld = on; if (!on) G.flameStreamActive = false; }
  function ticks(n, each) { for (var k = 0; k < n; k++) { G.mana = G.MANA_MAX; G.runSimulationTick(DT); if (each) each(k); } }

  // ── F1: embers spawn along the beam (authored floors) ────────────────────
  // Authored 31 x 31 worlds of 12 u cells; the player stands at (60, 180)
  // looking +x at pitch 0. Each tick, the embers born in it (age one tick)
  // are judged against the beam restated from drawFlameStream3D at that tick
  // (beamNow): u (distance along the aim from the hand over the ramped
  // range) in [0, 1]; lateral within the cone's half width at u; height on
  // the beam's arc handZ + (floor + 1 - handZ) u^2, the floor sampled under
  // the ember's own point with the beam's function (spellFloorRenderZ over
  // the player's floor), at its current point and one tick back; one tick of
  // motion is allowed (4 u, and 4 u along the aim in u). Each miss records
  // why: "u", "lateral", "belowArc", "aboveArc" or "noFloor".
  // F1a, flat at 0 with no wall: the stream reaches its full 140 u; then the
  // release: embers are born only while the beam is drawn (a stream tick
  // within 180 ms), and the anchor is freed.
  // F1b, raised ground (feet at 50 u) stepping up 20 u a third of the way
  // along, a strip of three stacked walkable layers (25 u below, 70 u and
  // 140 u) two thirds along, and a wall whose walkable top is 75 u above the
  // feet: the beam stops at the wall and its end lies inside it, so a single
  // floor sample there, a floor taken at the feet, a hand at an absolute
  // 55 u or the stack's top layer each move the embers off the beam's arc.
  // F1c, the player strafing across the aim: every ember's velocity is the
  // player's plus the recipe's along-beam cone (its authored speed and spread).
  // F1d, a tier-2 stream (half width 0.55, 180 u): the embers fan to its width.
  // F1e, a wall at floor level in the beam's way: no ember lives inside it.
  var MW = 31, GS = 12;
  function authoredWorld(layers, walls, feetH) {
    var m = {w: MW, h: MW, gridSize: GS, layerCount: new Uint8Array(MW * MW)};
    for (var l = 0; l < 5; l++) { m['l' + l + 'Type'] = new Uint8Array(MW * MW); m['l' + l + 'TopZ'] = new Float64Array(MW * MW); m['l' + l + 'Meta'] = new Uint8Array(MW * MW); }
    G.grid = new Uint8Array(MW * MW);
    for (var gy = 0; gy < MW; gy++) for (var gx = 0; gx < MW; gx++) {
      var ci = gy * MW + gx, L = layers(gx, gy);
      m.layerCount[ci] = L.length;
      L.forEach(function (q, k) { m['l' + k + 'Type'][ci] = q[0]; m['l' + k + 'TopZ'][ci] = q[1]; m['l' + k + 'Meta'][ci] = 1; });
      if (walls && walls(gx, gy)) G.grid[ci] = 1;
    }
    // Raised ground: a plains level, whose player tracks the mesh floor (09-physics.js tracksMeshFloor).
    G.floorMesh = m; G.ENDLESS_MODE = false; G.CAVE_TEST_MODE = false; G.level = 1; G.terrain = feetH ? 'plains' : 'ground';
    G.cell = GS; G.gridW = G.gridH = MW; G.wallHeights = G.wallFaceBase = G.wallMaxTopZ = null;
    G.deepCaveRegions = []; G.windowOriginX = G.windowOriginY = 0; G.playerUnderground = false; G.running = true; G.gameOverState = false;
    G.menuOpen = G.settingsOpen = G.shopOpen = G.inventoryOpen = G.forgeOpen = G.overviewActive = false;
    G.pos = {x: 60, y: 180, floorZ: 60 + 40 * feetH}; G.vel.x = G.vel.y = 0;
    G.cam = {x: 60, y: 180, z: 60, ang: 0, pitch: 0, fov: G.GAME_CONFIG.player.baseFov};
    G.MODE3D = true; G.CAM_FOLLOW = true; G.settings.particles = 25;
    G.enemies = []; G.enemySpawners = []; G.projectiles = []; G.impacts = []; G.deathEffects = []; G.soulOrbs = []; G.coinDrops = [];
    G.arcaneTomes = []; G.statPickups = []; G.shrines = []; G.companions = []; G.fortressAllies = []; G.groundEffects = []; G.pointLights = [];
    G.goalSpawned = true; G.renderPresentationAlpha = 1;
    G.startGameClock(); G.clearGameplayInput(); G.USE_KEYBOARD = true; G.USE_MOUSE = true; G.USE_GAMEPAD = false;
    G.gpLast = {x: 0, y: 0, buttons: 0xffff, valid: false};
    G.setEffectToggle('fxUnified', true);
    return freshFx();
  }
  function flatWorld() { return authoredWorld(function () { return [[1, 0]]; }, null, 0); }
  // The beam restated from drawFlameStream3D at this tick.
  function beamNow() {
    var now = G.gameTimeNow(), ramp = Math.min(1, (now - G.flameStreamStartMs) / 300), range = G.flameStreamRange * ramp, ang = G.flameStreamAng;
    var fire = G.spells.fire, hw = fire.streamWidth || 0.4, c = Math.cos(ang), s = Math.sin(ang);
    if (fire.tier >= 2) hw = 0.55;
    return {on: now - G.flameStreamLastTick <= 180 && range > 0, ramp: ramp, range: range, c: c, s: s, hw: hw,
      hx: G.pos.x + c * 14 - s * 6, hy: G.pos.y + s * 14 + c * 6, handZ: ((Number.isFinite(G.pos.floorZ) ? G.pos.floorZ : 60) - 60) * (25 / 40) + 55,
      ground: {x: G.pos.x, y: G.pos.y, renderFloorZ: G.getPlayerFloorH() * 25, underground: G.playerUnderground}};
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  var TOL = 4;
  // One newborn ember against the beam B: the record, with `why` set on a miss.
  function judge(B, S, i) {
    var x = S.x[i], y = S.y[i], bx = x - S.vx[i] * DT, by = y - S.vy[i] * DT;
    var dx = x - B.hx, dy = y - B.hy, u = (dx * B.c + dy * B.s) / B.range, lat = -dx * B.s + dy * B.c, du = TOL / B.range;
    var lo = clamp01(u - du), hi = clamp01(u + du), half = (1 + B.range * hi * Math.tan(B.hw) * (0.3 + 0.7 * hi * hi)) * B.ramp;
    var floors = [G.spellFloorRenderZ(B.ground, x, y), G.spellFloorRenderZ(B.ground, bx, by)].filter(Number.isFinite), zmin = Infinity, zmax = -Infinity;
    floors.forEach(function (f) {
      [lo, hi].forEach(function (v) { var a = B.handZ + (f + 1 - B.handZ) * v * v; zmin = Math.min(zmin, a); zmax = Math.max(zmax, a); });
    });
    var z = S.z[i], why = u < -du || u > 1 + du ? 'u' : Math.abs(lat) > half + TOL ? 'lateral' : !floors.length ? 'noFloor' :
      z < zmin - TOL ? 'belowArc' : z > zmax + TOL ? 'aboveArc' : null;
    return {rec: {why: why, u: r3(u), lat: r3(lat), half: r3(half), z: r3(z), arc: [r3(zmin), r3(zmax)], floor: floors.length ? r3(floors[0]) : null,
      ramp: r3(B.ramp)}, ue: clamp01(u), share: Math.abs(lat) / half};
  }
  // A held stream for n ticks (before(k) runs before each tick): every ember
  // born in a tick, judged; the anchor's velocity input (vel after the tick).
  function beamLeg(S, n, before, moving) {
    var o = {born: [], off: [], bands: [0, 0, 0], sides: {left: 0, right: 0}, farWidth: 0, seen: {}, vel: [], under: 0, list: []};
    hold(true);
    for (var k = 0; k < n; k++) {
      G.mana = G.MANA_MAX; if (before) before(k);
      G.runSimulationTick(DT);
      if (!moving && (G.pos.x !== 60 || G.pos.y !== 180)) throw Error('SETUP the player moved while casting');
      var B = beamNow();
      if (!B.on) continue;
      embers(S).forEach(function (i) {
        if (S.age[i] > DT + 1e-9 || o.seen[S.seedA[i]]) return;
        o.seen[S.seedA[i]] = 1;
        var j = judge(B, S, i), e = j.rec;
        o.born.push(e); o.list.push({x: S.x[i], y: S.y[i], B: B, pv: [G.vel.x, G.vel.y], v: [S.vx[i], S.vy[i]], flags: S.flags[i]});
        if (e.why) o.off.push(e);
        o.bands[j.ue < 1 / 3 ? 0 : j.ue < 2 / 3 ? 1 : 2]++;
        if (B.ramp === 1 && j.ue > 0.6) { if (e.lat < 0) o.sides.left++; else o.sides.right++; o.farWidth = Math.max(o.farWidth, j.share); }
      });
    }
    return o;
  }
  if (needed('F1', ['--flame-from-feet', '--flame-linear-height', '--flame-narrow', '--flame-after-release'])) run('F1 embers along the beam', function () {
    var S = flatWorld(); arm();
    var o = beamLeg(S, 90);
    var drawn = stageFrame('fxCombat3D', function () {
      G.beginSceneDepthFrame(G.canvas.width, G.canvas.height); G.beginEffectFrame(); G.drawEffectLayer3D(1);
    }), fxDots = dots(drawn, 'fxCombat3D', FIRE);
    check('F1 holds the real stream on the authored floor (non-vacuous)', G.flameStreamRange === 140 && o.born.length >= 40 && fxDots >= 5,
      {range: G.flameStreamRange, born: o.born.length, drawnDots: fxDots, live: embers(S).length});
    check('flame embers spawn along the beam from the casting hand, on its arc, fanning with it', !o.off.length && o.bands.every(function (b) { return b >= 5; }) &&
      o.sides.left >= 3 && o.sides.right >= 3 && o.farWidth > 0.5,
      {tolerance: TOL, off: o.off.slice(0, 4), bands: o.bands, sides: o.sides, farWidthShare: r3(o.farWidth), sample: o.born.slice(0, 3)});
    // Release: the stream's last tick ages past 180 ms; the embers already
    // in flight live out their life (under 0.6 s).
    var last = G.flameStreamLastTick, lateBirths = 0, lastBirthAge = -1, anchorsAt = -1, emptyAt = -1, seen = o.seen;
    hold(false);
    ticks(60, function (k) {
      var age = G.gameTimeNow() - last;
      embers(S).forEach(function (i) { if (S.age[i] <= DT + 1e-9 && !seen[S.seedA[i]]) { seen[S.seedA[i]] = 1; lastBirthAge = age; if (age > 180 + 1000 * DT) lateBirths++; } });
      if (anchorsAt < 0 && !flameAnchors(S)) anchorsAt = age;
      if (emptyAt < 0 && !embers(S).length) emptyAt = age;
    });
    check('flame embers stop with the beam: none born once it is no longer drawn', lateBirths === 0 && anchorsAt >= 0 && anchorsAt <= 180 + 1000 * DT + 1e-6 &&
      emptyAt >= 0 && emptyAt <= 180 + 600 + 2000 * DT, {lateBirths: lateBirths, lastBirthMsAfterStreamTick: r3(lastBirthAge), anchorFreedAt: r3(anchorsAt),
      emptyAt: r3(emptyAt)});
  });
  // F1b: feet at H 2 (50 u); from x 108 (grid column 9) the ground is at
  // H 2.8 (70 u); column 11 holds three walkable layers (H -1, 2.8, 5.6);
  // columns 13 and on are a wall (the stream stops at x 156) whose walkable
  // top is at H 5 (125 u), where the beam's segment ends (x 170).
  if (needed('F1b', ['--flame-end-floor', '--flame-floor-at-feet', '--flame-absolute-height', '--flame-top-layer', '--flame-linear-height'])) run('F1b raised ground', function () {
    var S = authoredWorld(function (gx) {
      return gx >= 13 ? [[1, 5]] : gx === 11 ? [[1, -1], [1, 2.8], [1, 5.6]] : gx >= 9 ? [[1, 2.8]] : [[1, 2]];
    }, function (gx) { return gx >= 13; }, 2);
    arm();
    var o = beamLeg(S, 90), B = beamNow(), feet = G.getPlayerFloorH() * 25;
    var endFloor = G.spellFloorRenderZ(B.ground, B.hx + B.c * G.flameStreamRange, B.hy + B.s * G.flameStreamRange);
    var over = {step: 0, stack: 0};
    o.list.forEach(function (q) { var gx = Math.floor(q.x / GS); if (gx >= 9 && gx <= 12) over.step++; if (gx === 11) over.stack++; });
    check('F1b holds the stream on raised, stepped ground into a wall (non-vacuous)', feet === 50 && G.flameStreamRange === 96 && endFloor - feet > 50 &&
      S.stats.spawned >= 60 && over.step >= 10 && over.stack >= 4,
      {feet: feet, range: G.flameStreamRange, endFloorAboveFeet: r3(endFloor - feet), spawned: S.stats.spawned, born: o.born.length, over: over});
    check('on raised, stepped and layered ground ending in a wall, embers follow the beam arc over the floor under each one', !o.off.length,
      {tolerance: TOL, off: o.off.slice(0, 4), offCount: o.off.length, born: o.born.length, sample: o.born.slice(0, 2)});
  });
  // F1c: the player strafes across the aim (vel.y set before each tick).
  if (needed('F1c', ['--flame-no-inherit'])) run('F1c strafing', function () {
    var S = flatWorld(); arm();
    var o = beamLeg(S, 60, function () { G.vel.x = 0; G.vel.y = 150; }, true), spawn = G.FX_RECIPE_SOURCE['flame.ember'].spawn, bad = [], latMean = 0, pvMean = 0;
    var sp0 = spawn.speed[0], sp1 = spawn.speed[1], spread = spawn.spread, K = Math.exp(-G.FX_RECIPE_SOURCE['flame.ember'].motion.drag * DT);
    o.list.forEach(function (q) {
      var B = q.B, rx = q.v[0] - q.pv[0], ry = q.v[1] - q.pv[1], al = rx * B.c + ry * B.s, lt = -rx * B.s + ry * B.c;
      var pl = Math.hypot(q.pv[0], q.pv[1]), tol = 3 + 0.05 * pl;
      latMean += (-q.v[0] * B.s + q.v[1] * B.c) / o.list.length; pvMean += (-q.pv[0] * B.s + q.pv[1] * B.c) / o.list.length;
      if (al < sp0 * Math.cos(spread) * K - tol || al > sp1 + tol || Math.abs(lt) > sp1 * Math.sin(spread) + tol) bad.push({along: r3(al), lateral: r3(lt), player: [r3(q.pv[0]), r3(q.pv[1])]});
    });
    check('F1c strafes while casting (non-vacuous)', o.born.length >= 30 && pvMean > 60 && Math.abs(G.pos.y - 180) > 40,
      {born: o.born.length, playerLateralSpeed: r3(pvMean), movedY: r3(G.pos.y - 180)});
    check("flame embers carry the player's motion: each one's velocity is the player's plus the recipe's along-beam cone",
      !bad.length && !o.off.length && latMean / pvMean > 0.85 && latMean / pvMean < 1.1,
      {bad: bad.slice(0, 4), badCount: bad.length, off: o.off.slice(0, 2), emberLateralMean: r3(latMean), playerLateralMean: r3(pvMean)});
  });
  // F1d: a tier-2 stream, 180 u long and 0.55 rad wide (10-combat.js castStreamAttack, drawFlameStream3D).
  if (needed('F1d', ['--flame-fixed-width'])) run('F1d tier-2 width', function () {
    var S = flatWorld(); arm(); G.spells.fire.tier = 2;
    try {
      var o = beamLeg(S, 90);
      check('F1d holds a tier-2 stream (non-vacuous)', G.flameStreamRange === 180 && o.born.length >= 40, {range: G.flameStreamRange, born: o.born.length});
      check("flame embers fan to the tier-2 beam's half width", !o.off.length && o.farWidth > 0.8 && o.sides.left >= 3 && o.sides.right >= 3,
        {off: o.off.slice(0, 3), farWidthShare: r3(o.farWidth), sides: o.sides, halfWidthRad: beamNow().hw});
    } finally { G.spells.fire.tier = 1; }
  });
  // F1e: a wall (grid columns 13 and on, 240 u high over a floor-level mesh)
  // in the beam's way: the stream stops at x 156, the segment ends at x 170.
  if (needed('F1e', ['--ember-no-wall'])) run('F1e wall', function () {
    var S = authoredWorld(function () { return [[1, 0]]; }, function (gx) { return gx >= 13; }, 0);
    arm(); hold(true);
    var inside = [], live = 0;
    ticks(90, function () {
      embers(S).forEach(function (i) { live++; if (S.x[i] >= 156 && S.z[i] < 240) inside.push({x: r3(S.x[i]), z: r3(S.z[i]), age: r3(S.age[i])}); });
    });
    var st = S.stats;
    check('F1e holds the stream against a wall (non-vacuous)', G.flameStreamRange === 96 && live >= 200 && st.spawned >= 40, {range: G.flameStreamRange, liveSamples: live, spawned: st.spawned});
    check('no flame ember lives inside the wall the beam ends in', !inside.length, {inside: inside.slice(0, 4), count: inside.length});
  });
  // ── Endless fixtures (seed steering as in effect_producers.js) ──────────
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
    G.gpLast = {x: 0, y: 0, buttons: 0xffff, valid: false};
    G.health = G.HEALTH_MAX; G.mana = G.MANA_MAX;
  }
  function longestLane() {
    var best = null;
    for (var a = 0; a < 16; a++) {
      try {
        var t = G.castingStudioFindTarget(G.pos, {ang: a * Math.PI / 8}, false);
        if (!best || t.distance > best.distance) { best = t; best.ang = a * Math.PI / 8; }
      } catch (e) {}
    }
    if (!best || best.distance < 160) throw Error('SETUP no clear lane of 160 u from the spawn (' + (best && best.distance) + ')');
    return best;
  }

  // ── F2: one ember source per mode, in 3D and in 2D ───────────────────────
  // Endless 424242 at noon, the stream held down the longest clear lane.
  // New: the flame stage (coneFX3D / coneFX2D) draws no legacy ember and sets
  // no shadowBlur in 3D; fxCombat3D / fx2D draw fire-palette embers. Legacy
  // (Unified effects off): the stage draws the legacy embers (shadowBlur 10
  // in 3D) and the engine holds no flame ember.
  if (needed('F2', ['--ember-3d-unguarded', '--ember-2d-unguarded'])) run('F2 one ember source', function () {
    var modes = {};
    ['new', 'legacy'].forEach(function (mode) {
      startEndless(424242); var lane = longestLane(); Math.random = originalRandom;
      G.cam.ang = lane.ang; G.cam.pitch = 0; G.enemies = []; G.enemySpawners = [];
      var S = freshFx(); arm(); G.setEffectToggle('fxUnified', mode === 'new');
      try {
        hold(true); ticks(45, function () { G.cam.ang = lane.ang; });
        var f3 = frame(); G.MODE3D = false; var f2 = frame(); G.MODE3D = true;
        modes[mode] = {family: G.effectFamilyMode('flameEmbers'), live: embers(S).length, spawned: S.stats.spawned,
          stage3D: {legacy: dots(f3, 'coneFX3D', LEGACY3D), blur: f3.blur.coneFX3D || 0, beam: f3.draws.filter(function (d) { return d.stage === 'coneFX3D'; }).length},
          fx3D: dots(f3, 'fxCombat3D', FIRE), halos: f3.draws.filter(function (d) { return d.stage === 'fxCombat3D' && d.kind === 'image' && d.op === 'lighter'; }).length,
          stage2D: {legacy: dots(f2, 'coneFX2D', LEGACY2D), beam: f2.draws.filter(function (d) { return d.stage === 'coneFX2D'; }).length},
          fx2D: dots(f2, 'fx2D', FIRE)};
      } finally { hold(false); G.setEffectToggle('fxUnified', true); }
    });
    var n = modes['new'], l = modes.legacy;
    check('F2 draws the stream in both modes (non-vacuous)', n.stage3D.beam >= 5 && l.stage3D.beam >= 5 && n.stage2D.beam >= 5 && l.stage2D.beam >= 5, modes);
    check('New mode draws flame embers as particles only, with no shadowBlur in 3D', n.family === 'new' && n.live >= 8 && n.stage3D.legacy === 0 &&
      n.stage3D.blur === 0 && n.fx3D >= 5 && n.halos >= 5, {new: n});
    check('New mode draws flame embers as particles only in 2D', n.family === 'new' && n.stage2D.legacy === 0 && n.fx2D >= 5, {new: n});
    check('Legacy mode draws only the legacy flame embers', l.family === 'legacy' && l.live === 0 && l.stage3D.legacy >= 5 && l.stage3D.blur >= 1 &&
      l.fx3D === 0 && l.stage2D.legacy >= 5 && l.fx2D === 0, {legacy: l});
  });

  // ── F3: the gameplay streams ────────────────────────────────────────────
  // Endless 777: the stream held on an enemy 60 u down the lane for 240
  // ticks, New and Legacy from the same start: the same gameplay (player,
  // mana, the enemy, kills, damage) and the same gameplay Math.random draws.
  // In New mode a throwing Math.random wraps the effects tick and every
  // frame stage while the embers spawn and draw.
  if (needed('F3', ['--ember-math-random'])) run('F3 gameplay streams', function () {
    function r6(v) { return Math.round(v * 1e6) / 1e6; }
    var thrown = 0, thrower = function () { thrown++; throw Error('flame embers drew Math.random'); };
    var realUpdate = G.updateEffects, realLayer = G.drawEffectLayer3D;
    function guarded(fn) {
      return function () { var saved = Math.random; Math.random = thrower; try { return fn.apply(this, arguments); } finally { Math.random = saved; } };
    }
    function replay(mode) {
      var counter = {n: 0};
      startEndless(777, counter); var lane = longestLane();
      var c = Math.cos(lane.ang), s = Math.sin(lane.ang), e = G.enemies.slice().sort(function (a, b) {
        return Math.hypot(a.x - G.pos.x, a.y - G.pos.y) - Math.hypot(b.x - G.pos.x, b.y - G.pos.y); })[0];
      e.x = G.pos.x + c * 60; e.y = G.pos.y + s * 60; delete e.feetZ; e.underground = false; e.caveSpawnId = null; e.health = 40; e.speed = 0; e.chaseRange = 0;
      e.enemyType = Object.assign({}, e.enemyType, {speed: 0, chaseRange: 0, attackDamage: 0});
      G.enemies = [e]; G.enemySpawners = [];
      var S = freshFx(); arm(); G.setEffectToggle('fxUnified', mode === 'new');
      var stats0 = JSON.parse(JSON.stringify(G.stats)), drawn = 0;
      if (mode === 'new') { G.updateEffects = guarded(realUpdate); G.drawEffectLayer3D = guarded(realLayer); }
      counter.n = 0;
      try {
        hold(true);
        for (var k = 0; k < 240; k++) {
          G.cam.ang = lane.ang; G.runSimulationTick(DT);
          if (k % 40 === 39) drawn += dots(frame(), 'fxCombat3D', FIRE);
        }
      } finally { hold(false); G.updateEffects = realUpdate; G.drawEffectLayer3D = realLayer; G.setEffectToggle('fxUnified', true); Math.random = originalRandom; }
      var hash = JSON.stringify({pos: [r6(G.pos.x), r6(G.pos.y), r6(G.pos.floorZ)], mana: r6(G.mana), enemies: G.enemies.map(function (n) { return [r6(n.x), r6(n.y), r6(n.health)]; }),
        stats: Object.keys(G.stats).map(function (k) { return typeof G.stats[k] === 'number' ? r6(G.stats[k] - stats0[k]) : 0; })});
      return {hash: hash, draws: counter.n, embersSpawned: embers(S).length + 0, spawned: S.stats.spawned, drawn: drawn,
        damage: r6(G.stats.totalDamageDone - stats0.totalDamageDone)};
    }
    var fresh = replay('new'), legacy = replay('legacy');
    check('F3 holds the stream on the enemy in both runs (non-vacuous)', fresh.damage > 0 && fresh.spawned >= 60 && fresh.drawn >= 10 && legacy.damage > 0,
      {new: {damage: fresh.damage, spawned: fresh.spawned, drawn: fresh.drawn}, legacy: {damage: legacy.damage, spawned: legacy.spawned}});
    check('flame embers never draw from the gameplay random stream or change gameplay', thrown === 0 && fresh.hash === legacy.hash && fresh.draws === legacy.draws,
      {thrown: thrown, draws: {new: fresh.draws, legacy: legacy.draws}, sameHash: fresh.hash === legacy.hash, failures: G.getEffectStats().failures});
  });

  // Cave Test 12345 'descending' (as effect_ambient.js), at a preview view.
  function startCave(view) {
    G._caveTestSeedOverride = 12345; G._caveTestKindOverride = 'descending';
    G.CAVE_TEST_MODE = true; G.ENDLESS_MODE = true; G.running = true; G.gameOverState = false; G.terrain = 'plains';
    G.menuOpen = G.settingsOpen = G.shopOpen = G.inventoryOpen = G.forgeOpen = G.overviewActive = false;
    Object.keys(G.caveTestFlags).forEach(function (k) { G.caveTestFlags[k] = false; });
    G.resetEndlessMode(); G.MODE3D = true; G.CAM_FOLLOW = true; G.settings.particles = 25;
    G.settings.dayNight = true; G.dayTime = 0.5; G.daySpeed = 0;
    G.startGameClock(); G.clearGameplayInput();
    if (view) G.previewCaveView(view);
    G.USE_KEYBOARD = true; G.USE_MOUSE = true; G.USE_GAMEPAD = false; G.CONTROL_MODE = G.MODE_STICK_AIM;
    G.gpLast = {x: 0, y: 0, buttons: 0xffff, valid: false}; G.health = G.HEALTH_MAX; G.mana = G.MANA_MAX;
  }

  // ── F4: the Cave Test 12345 'descending' chamber (underground), the stream
  // held along 8 headings in turn: embers follow the beam's per-point arc
  // (where the beam ends in a wall cell whose walkable layer is far from the
  // feet) and carry the UNDER flag (the cave's fog floor and ambient).
  if (needed('F4', ['--flame-end-floor', '--flame-no-under'])) run('F4 Cave Test chamber', function () {
    startCave('chamber'); Math.random = originalRandom;
    var S = freshFx(); arm(); G.enemies = []; G.enemySpawners = [];
    var feet = G.getPlayerFloorH() * 25, under = !!G.playerUnderground, lanes = [], off = [], born = 0, flagged = 0, UNDER = G.FX_UNDER;
    for (var a = 0; a < 8; a++) {
      var ang = a * Math.PI / 4;
      G.cam.ang = ang; G.cam.pitch = 0;
      var o = beamLeg(S, 36, function () { G.cam.ang = ang; G.enemies = []; G.health = G.HEALTH_MAX; }, true), B = beamNow();
      var end = G.spellFloorRenderZ(B.ground, B.hx + B.c * G.flameStreamRange, B.hy + B.s * G.flameStreamRange);
      lanes.push({ang: r3(ang), range: G.flameStreamRange, endAboveFeet: r3(end - feet), born: o.born.length, off: o.off.length});
      o.off.forEach(function (e) { off.push(Object.assign({lane: a}, e)); });
      born += o.born.length;
      o.list.forEach(function (q) { if (q.flags & UNDER) flagged++; });
      hold(false); ticks(30, function () { G.cam.ang = ang; });
    }
    var far = lanes.filter(function (l) { return Number.isFinite(l.endAboveFeet) && Math.abs(l.endAboveFeet) > 20; }).length;
    check('F4 holds the stream in the Cave Test chamber, some lanes ending far above or below the feet (non-vacuous)', under && born >= 150 && far >= 2,
      {under: under, born: born, farLanes: far, lanes: lanes});
    check("in the Cave Test chamber flame embers follow the beam's arc over the floor under each one", !off.length,
      {tolerance: TOL, off: off.slice(0, 4), offCount: off.length, lanes: lanes});
    check('flame embers born underground carry the UNDER flag', flagged === born, {born: born, flagged: flagged});
  });

  // ── F5: the ember layer's occlusion cost is flat in canvas area ─────────
  // Endless 424242 at noon, the stream held down the longest clear lane, one
  // real frame at 360 x 240 and one at 1920 x 1080 (resScale 4.5, embers and
  // halos 4.5 x larger): the fxCombat3D pass (the embers alone here) tests
  // each ember with the five corona reads, so it reads no tile summary,
  // scans no footprint and spends no mask pixel at either size.
  if (needed('F5', ['--ember-auto-occlusion'])) run('F5 occlusion cost', function () {
    startEndless(424242); var lane = longestLane(); Math.random = originalRandom;
    G.cam.ang = lane.ang; G.cam.pitch = 0; G.enemies = []; G.enemySpawners = [];
    var S = freshFx(), sizes = [[360, 240], [1920, 1080]], out = [], w0 = G.canvas.width, h0 = G.canvas.height;
    arm();
    try {
      hold(true); ticks(45, function () { G.cam.ang = lane.ang; });
      sizes.forEach(function (sz) {
        G.canvas.width = sz[0]; G.canvas.height = sz[1];
        var f = frame(), st = f.after.fxCombat3D;
        out.push({size: sz.join('x'), live: embers(S).length, considered: st.considered, drawn: st.drawn, occ: st.occ, maskPx: st.maskPx,
          halos: f.draws.filter(function (d) { return d.stage === 'fxCombat3D' && d.kind === 'image'; }).length});
      });
    } finally { G.canvas.width = w0; G.canvas.height = h0; hold(false); }
    check('F5 draws the held stream at both sizes (non-vacuous)', out.every(function (o) { return o.live >= 8 && o.drawn >= 5 && o.halos >= 5; }), {frames: out});
    check('the flame ember pass reads five corona samples per ember at any canvas size: no tiles, footprints or mask pixels',
      out.every(function (o) { return o.occ.corona === o.considered && o.occ.tiles === 0 && o.occ.footprint === 0 && o.occ.point === 0 && o.maskPx === 0 &&
        o.occ.clip === 0 && o.occ.grid === 0; }), {frames: out});
  });

  check('no effect runtime failures were counted', !failures(), {failures: G.getEffectStats().failures, warnings: warnings.slice(0, 3)});
  check('no frame stage threw and no console errors from the game', !stageErrors.length && !G.__flameErrors.length,
    {stages: stageErrors.slice(0, 3), errors: G.__flameErrors.slice(0, 3)});
  Math.random = originalRandom;
  output('FLAME_EMBERS_RESULT ' + (failed ? 'FAIL ' + failed + '/' : 'PASS ') + checked);
}());
