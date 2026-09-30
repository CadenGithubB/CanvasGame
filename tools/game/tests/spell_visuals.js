// Spell visual archetype contracts: recipes over shared materials, the glow
// sprite cache, and the bolt/burst painters through the production depth
// helpers. Risks covered: a spell silently losing its recipe (legacy circle),
// glow memory growth, painters leaking Canvas state or consuming gameplay
// random numbers, bursts outliving their gameplay lifetime, and the production
// loops bypassing the layer. Mutation flags (see test_spell_visuals.py):
//   --bypass-spell-depth      draw without the scene-depth clip
//   --drop-recipe <id>        remove one spell's recipe after load
//   --burst-ignores-lifetime  bursts report mid-life progress forever
//   --glow-no-document        headless host without canvas creation
(function () {
  (0, eval)(slurp('assets/games/src/02-simulation-clock.js'));
  var G = (0, eval)('this'), checks = 0, clock = 1000;
  function has(flag) { return __argv.indexOf(flag) >= 0; }
  function argValue(flag) { var i = __argv.indexOf(flag); return i >= 0 ? __argv[i + 1] : null; }
  function check(name, condition) { if (!condition) throw Error(name); checks++; __out('PASS ' + name); }
  function source(name) { return slurp('assets/games/src/' + name); }
  function evaluate(text) { (0, eval)(text); }
  function noop() {}
  function normalize(value) {
    if (typeof value === 'number') return Math.round(value * 1e8) / 1e8;
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') {
      var result = {};
      Object.keys(value).sort().forEach(function (key) { result[key] = normalize(value[key]); });
      return result;
    }
    return value;
  }
  function hash(value) {
    var text = JSON.stringify(value), h = 2166136261;
    for (var i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }
  // Recording Canvas host. Every fill/stroke/image counts as one draw; clips
  // record their rectangle runs; save/restore keep a real scalar state stack.
  var stack = [], commands = [], drawCount = 0, clipCount = 0, clipRuns = [], rects = [], images = 0;
  var blurSets = 0, restoring = false, shadow = 0;
  var props = ['globalAlpha', 'lineWidth', 'globalCompositeOperation', 'fillStyle', 'strokeStyle', 'lineCap', 'lineJoin', 'shadowBlur'];
  var ctx = {globalAlpha:1, lineWidth:1, globalCompositeOperation:'source-over', fillStyle:'#000000', strokeStyle:'#000000', lineCap:'butt', lineJoin:'miter'};
  Object.defineProperty(ctx, 'shadowBlur', {get:function () { return shadow; },
    set:function (value) { if (value > 0 && !restoring) blurSets++; shadow = value; }});
  ctx.save = function () { var saved = {}; props.forEach(function (key) { saved[key] = ctx[key]; }); stack.push(saved); };
  ctx.restore = function () {
    var saved = stack.pop(); if (!saved) return;
    restoring = true; props.forEach(function (key) { ctx[key] = saved[key]; }); restoring = false;
  };
  ctx.beginPath = function () { rects = []; commands.push(['begin']); };
  ctx.moveTo = function (x, y) { commands.push(['move', x, y]); };
  ctx.lineTo = function (x, y) { commands.push(['line', x, y]); };
  ctx.quadraticCurveTo = function (a, b, x, y) { commands.push(['quad', a, b, x, y]); };
  ctx.bezierCurveTo = function (a, b, c, d, x, y) { commands.push(['bezier', a, b, c, d, x, y]); };
  ctx.closePath = function () { commands.push(['close']); };
  ctx.rect = function (x, y, w, h) { rects.push({x:x, y:y, w:w, h:h}); };
  ctx.clip = function () { clipCount++; clipRuns.push(rects.slice()); };
  ctx.arc = function (x, y, r, a, b) { commands.push(['arc', x, y, r, a, b]); };
  ctx.ellipse = function (x, y, rx, ry, rot) { commands.push(['ellipse', x, y, rx, ry, rot]); };
  ctx.fill = function () { drawCount++; commands.push(['fill', ctx.fillStyle, ctx.globalAlpha]); };
  ctx.stroke = function () { drawCount++; commands.push(['stroke', ctx.strokeStyle, ctx.lineWidth, ctx.globalAlpha]); };
  ctx.fillRect = function (x, y, w, h) { drawCount++; commands.push(['fillRect', x, y, w, h]); };
  ctx.drawImage = function (image, x, y, w, h) { drawCount++; images++; commands.push(['image', image.width, x, y, w, h, ctx.globalAlpha, ctx.globalCompositeOperation]); };
  ctx.createLinearGradient = function (x1, y1, x2, y2) {
    var grad = {stops:[], addColorStop:function (offset, color) { this.stops.push([offset, color]); }};
    commands.push(['gradient', x1, y1, x2, y2, grad.stops]); return grad;
  };
  ctx.createRadialGradient = function () { return {addColorStop:noop}; };
  G.ctx = ctx;
  var canvasBuilds = 0, noDocument = has('--glow-no-document');
  function fakeCanvas() {
    var canvas = {width:0, height:0};
    canvas.getContext = function (kind) {
      if (kind !== '2d') return null;
      canvasBuilds++;
      return {fillStyle:null, createRadialGradient:function () { return {addColorStop:noop}; }, fillRect:noop};
    };
    return canvas;
  }
  if (!noDocument) G.document = {createElement:function (tag) { if (tag !== 'canvas') throw Error('unexpected element ' + tag); return fakeCanvas(); }};
  evaluate(source('01-materials.js'));
  var config = source('01-config-state.js');
  evaluate(config.slice(config.indexOf('var spells = {'), config.indexOf('var currentSpellIdx')));
  evaluate(config.slice(config.indexOf('function projToScreen('), config.indexOf('// GENERIC 3D ENTITY RENDERER')));
  evaluate(source('06-spatial-geometry.js'));
  evaluate(source('12-scene-depth.js'));
  evaluate(source('14-missile-art.js'));
  evaluate(source('14-spell-visuals.js'));
  evaluate(source('14-render-entities.js'));
  G.cam = {x:0, y:100, z:60, ang:0, pitch:0}; G.projScale = 80; G.viewDist = 700; G.resScale = 1;
  G.getScale3D = function () { return 1; }; G.rgbQ = function (r, g, b) { return 'rgb(' + r + ',' + g + ',' + b + ')'; };
  G.playerUnderground = false; G.getPlayerFloorH = function () { return 0; }; G.getFloorHeightAt = function () { return 0; };
  G.pos = {x:8, y:100, floorZ:60}; G.depthBuffer = new Float32Array(120); G.depthBuffer.fill(1);
  function flatMesh(height) {
    var mesh = {w:40, h:30, gridSize:10, layerCount:new Uint8Array(1200), l0Type:new Uint8Array(1200),
      l0TopZ:new Float32Array(1200), l0Meta:new Uint8Array(1200)};
    mesh.layerCount.fill(1); mesh.l0Type.fill(1); mesh.l0TopZ.fill(height); mesh.l0Meta.fill(1); return mesh;
  }
  G.floorMesh = flatMesh(0);
  var camera = {w:120, h:90, cosAng:1, sinAng:0, invTanHalf:1, horizonY:35, cameraZ:30};
  G.getCam3D = function () { return camera; };
  function wall(depth, top) {
    G.writeSceneDepthPolygon([{x:0, y:top || 0, depth:depth}, {x:120, y:top || 0, depth:depth},
      {x:120, y:90, depth:depth}, {x:0, y:90, depth:depth}]);
  }
  function resetPaint(hidden) {
    G.beginSceneDepthFrame(120, 90); G.beginSpellVisualFrame();
    drawCount = clipCount = images = 0; clipRuns = []; commands = [];
    ctx.globalAlpha = 0.37; ctx.shadowBlur = 5; ctx.lineWidth = 2; blurSets = 0;
    if (hidden) wall(1);
  }
  function stateRestored() { return stack.length === 0 && ctx.globalAlpha === 0.37 && ctx.shadowBlur === 5 && ctx.lineWidth === 2; }
  if (has('--bypass-spell-depth')) G.withSceneDepthClip = function (points, draw) { draw(); return 1; };
  var dropped = argValue('--drop-recipe');
  if (dropped) {
    var kept = {};
    Object.keys(G.SPELL_VISUAL_RECIPES).forEach(function (id) { if (id !== dropped) kept[id] = G.SPELL_VISUAL_RECIPES[id]; });
    G.SPELL_VISUAL_RECIPES = Object.freeze(kept);
  }
  if (has('--burst-ignores-lifetime')) G.spellImpactProgress = function () { return 0.5; };
  var oldDate = Date.now, oldRandom = Math.random;
  Date.now = function () { return clock; };
  Math.random = function () { throw Error('spell visuals must not consume gameplay random numbers'); };
  try {
    // ── Recipes ───────────────────────────────────────────────────────────
    var recipes = G.SPELL_VISUAL_RECIPES, roles = ['core', 'light', 'mid', 'deep', 'rune'];
    check('every recipe compiles against shared materials with five roles', Object.keys(recipes).length > 0 &&
      Object.keys(recipes).every(function (id) {
        var recipe = recipes[id], material = G.GAME_MATERIALS[recipe.material];
        return material && roles.every(function (role) { return recipe.hex[role] === material.hex[role] &&
          /^rgba\(\d+,\d+,\d+,$/.test(recipe.rgba[role]); }) && Object.isFrozen(recipe);
      }));
    var boltIds = G.spellOrder.filter(function (id) { var type = G.spells[id].attackType; return type === 'projectile' || type === 'lob'; }).concat(['tower', 'slime']);
    check('every projectile or lob spell, tower and companion bolt has bolt and burst recipes',
      boltIds.length >= 5 && boltIds.every(function (id) { return recipes[id] && recipes[id].bolt && recipes[id].burst; }));
    var burstOnly = G.spellOrder.filter(function (id) { var type = G.spells[id].attackType; return type === 'nova' || type === 'stream'; });
    check('nova and stream spells own bursts without bolts',
      burstOnly.length >= 2 && burstOnly.every(function (id) { return recipes[id] && recipes[id].burst && !recipes[id].bolt; }));
    var bad = [
      {x:{material:'noSuchMagic', burst:{style:'runeFlash', sizeWorld:5}}},
      {x:{material:'missileMagic', bolt:{head:'nope', radiusWorld:3, wakeSeconds:0.1, wakeUnits:30}}},
      {x:{material:'missileMagic', burst:{style:'runeFlash', sizeWorld:-1}}},
      {x:{material:'missileMagic', bolt:{head:'bead', radiusWorld:3, wakeSeconds:NaN, wakeUnits:30}}}
    ];
    check('invalid recipes fail explicitly', bad.every(function (definition) {
      try { G.compileSpellVisualRecipes(definition, G.GAME_MATERIALS); return false; } catch (error) { return /Spell (visual recipe|material)/.test(error.message); }
    }) && (function () {
      try { G.compileSpellVisualRecipes({x:{material:'partial', burst:{style:'runeFlash', sizeWorld:5}}}, {partial:{hex:{core:'#ffffff'}}}); return false; }
      catch (error) { return error.message.indexOf('lacks role') >= 0; }
    }()));
    var generic = G.spellVisualRecipe({id:'unknownSpell', color:'#336699'});
    check('unknown spells derive a five-role palette from their own color and cache it',
      generic.bolt && generic.burst && generic.hex.mid === '#336699' &&
      roles.every(function (role) { return /^#[0-9a-f]{6}$/.test(generic.hex[role]); }) &&
      G.spellVisualRecipe({id:'anotherUnknown', color:'#336699'}) === generic &&
      G.spellVisualRecipe({id:'ice'}) === recipes.ice);

    // ── Bolts ─────────────────────────────────────────────────────────────
    function projectileFor(id) {
      return {x:100, y:108, z:20, ang:0.23, hz:360, vz:15, speed:360, spawnMs:900, lifeMs:1200, r:3,
        spell:{id:id, color:G.spells[id] ? G.spells[id].color : '#ffd54f', isNpc:id === 'slime' || id === 'tower'}};
    }
    var boltHashes = {};
    ['ice', 'lightning', 'poison', 'tower', 'slime'].forEach(function (id) {
      var projectile = projectileFor(id), before = JSON.stringify(projectile);
      resetPaint(false);
      var handled = G.renderSpellBolt(projectile, camera, clock);
      check(id + ' bolt draws when visible without mutating its record', handled === true && drawCount > 0 && JSON.stringify(projectile) === before);
      boltHashes[id] = hash(normalize(commands));
      check(id + ' bolt restores inherited Canvas state and writes no opaque depth', stateRestored() && G.sceneDepthAt(60, 50) === Infinity);
      resetPaint(false); G.renderSpellBolt(projectile, camera, clock);
      check(id + ' bolt is deterministic for the same pose and clock', hash(normalize(commands)) === boltHashes[id]);
      resetPaint(true); G.renderSpellBolt(projectile, camera, clock);
      check(id + ' bolt cannot paint through opaque terrain', drawCount === 0 && stateRestored());
    });
    check('distinct spells produce distinct bolt artwork', Object.keys(boltHashes).every(function (a) {
      return Object.keys(boltHashes).every(function (b) { return a === b || boltHashes[a] !== boltHashes[b]; });
    }));
    check('redesigned bolts never enable Canvas shadow blur', blurSets === 0);
    var realMissileArt = G.renderMissileProjectileArt, missileArtCalls = 0;
    G.renderMissileProjectileArt = function () { missileArtCalls++; return realMissileArt.apply(null, arguments); };
    resetPaint(false);
    var missileHandled = G.renderSpellBolt(projectileFor('missile'), camera, clock);
    G.renderMissileProjectileArt = realMissileArt;
    check('missile bolt delegates to the approved missile art', missileHandled === true && missileArtCalls === 1 && drawCount > 0);
    var turn = 0.83, turnedCamera = {w:120, h:90, cosAng:Math.cos(turn), sinAng:Math.sin(turn), invTanHalf:1, horizonY:35, cameraZ:30};
    var shard = projectileFor('ice');
    var turnedShard = Object.assign({}, shard, {x:100 * Math.cos(turn) - 8 * Math.sin(turn), y:100 + 100 * Math.sin(turn) + 8 * Math.cos(turn), ang:shard.ang + turn});
    resetPaint(false); G.renderSpellBolt(turnedShard, turnedCamera, clock);
    check('frost shard orientation follows projected world velocity when camera and scene rotate together', hash(normalize(commands)) === boltHashes.ice);
    resetPaint(false); wall(80); G.renderSpellBolt(shard, camera, clock);
    check('near wake survives terrain that hides the bolt head', drawCount > 0 && clipCount > 0);
    resetPaint(false);
    var noRecipe = G.renderSpellBolt({x:100, y:100, z:20, ang:0, spawnMs:900, spell:{id:'fire', color:'#ff6600'}}, camera, clock);
    var invalid = G.renderSpellBolt({x:NaN, y:100, z:20, ang:0, spell:{id:'ice'}}, camera, clock);
    var far = G.renderSpellBolt({x:700, y:100, z:20, ang:0, spell:{id:'ice'}}, camera, clock);
    check('bolts without a recipe fall back to legacy while invalid or distant bolts cull safely',
      noRecipe === false && invalid === true && far === true && drawCount === 0 && stack.length === 0);
    resetPaint(false); var realFill = ctx.fill, threw = false;
    ctx.fill = function () { throw Error('intentional Canvas failure'); };
    try { G.renderSpellBolt(shard, camera, clock); } catch (error) { threw = error.message === 'intentional Canvas failure'; }
    ctx.fill = realFill;
    check('bolt painter exception restores caller state', threw && stateRestored());

    // ── Bursts ────────────────────────────────────────────────────────────
    function impactFor(id, age) { return {x:100, y:100, z:0, spawnMs:clock - age, lifeMs:220, spellId:id}; }
    var burstHashes = {};
    ['ice', 'lightning', 'poison', 'arcane', 'fire', 'tower', 'slime'].forEach(function (id) {
      var impact = impactFor(id, 60), before = JSON.stringify(impact);
      resetPaint(false);
      var handled = G.renderSpellBurst(impact, camera, clock), visible = drawCount, depthClear = G.sceneDepthAt(60, 50) === Infinity;
      burstHashes[id] = hash(normalize(commands));
      resetPaint(true); G.renderSpellBurst(impact, camera, clock);
      check(id + ' burst draws when visible and hides behind terrain', handled === true && visible > 0 && drawCount === 0 &&
        JSON.stringify(impact) === before && stateRestored() && depthClear);
      resetPaint(false); G.renderSpellBurst(impactFor(id, 220), camera, clock); var expired = drawCount;
      resetPaint(false); G.renderSpellBurst(impactFor(id, -40), camera, clock); var unborn = drawCount;
      resetPaint(false); G.renderSpellBurst(impact, camera, clock);
      check(id + ' burst ends at its lifetime and stays deterministic', expired === 0 && unborn === 0 && hash(normalize(commands)) === burstHashes[id]);
    });
    check('distinct spells produce distinct burst artwork', Object.keys(burstHashes).every(function (a) {
      return Object.keys(burstHashes).every(function (b) { return a === b || burstHashes[a] !== burstHashes[b]; });
    }));
    check('redesigned bursts never enable Canvas shadow blur', blurSets === 0);
    var realImpactArt = G.renderMissileImpactArt, impactArtCalls = 0;
    G.renderMissileImpactArt = function () { impactArtCalls++; return realImpactArt.apply(null, arguments); };
    resetPaint(false);
    var missileBurst = G.renderSpellBurst(impactFor('missile', 60), camera, clock);
    G.renderMissileImpactArt = realImpactArt;
    check('missile burst delegates to the approved impact art', missileBurst === true && impactArtCalls === 1 && drawCount > 0);
    check('impact progress normalizes every producer shape',
      G.spellImpactProgress({spawnMs:900, lifeMs:300}, 1050) === 0.5 &&
      G.spellImpactProgress({t:900, dur:300}, 1050) === 0.5 &&
      Math.abs(G.spellImpactProgress({life:0.2, maxLife:0.8}, 1050) - 0.75) < 1e-9 &&
      G.spellImpactProgress({x:1, y:2}, 1050) === -1 && G.spellImpactProgress(null, 1050) === -1);
    resetPaint(false);
    var steam = G.renderSpellBurst({x:100, y:100, z:10, spawnMs:clock - 50, lifeMs:500, type:'steam'}, camera, clock);
    var companion = G.renderSpellBurst({x:100, y:100, z:10, spawnMs:clock - 50, lifeMs:220, spellId:'missile', isCompanionProj:true}, camera, clock);
    check('synergy impacts without a spell id and companion orbs stay on the legacy path', steam === false && companion === false && drawCount === 0);

    // ── Glow sprites ──────────────────────────────────────────────────────
    G.clearSpellVisualCache();
    var stats;
    if (noDocument) {
      resetPaint(false); G.renderSpellBolt(shard, camera, clock); stats = G.getSpellVisualStats();
      check('glow falls back to flat discs without a document', stats.glowFallbacks > 0 && stats.glowBuilds === 0 && stats.glowEntries === 0 && drawCount > 0 && images === 0);
    } else {
      var canvasBefore = canvasBuilds;
      resetPaint(false); G.renderSpellBolt(shard, camera, clock); stats = G.getSpellVisualStats();
      var firstBuilds = stats.glowBuilds, firstImages = images;
      resetPaint(false); G.renderSpellBolt(shard, camera, clock); stats = G.getSpellVisualStats();
      check('glow sprites are baked once per material role and bucket then reused',
        firstBuilds > 0 && firstImages > 0 && stats.glowBuilds === firstBuilds && stats.glowHits > 0 && images === firstImages &&
        canvasBuilds - canvasBefore === firstBuilds);
      var oldEntryLimit = G.SPELL_GLOW_ENTRY_LIMIT;
      G.clearSpellVisualCache(); G.SPELL_GLOW_ENTRY_LIMIT = 2;
      ['ice', 'lightning', 'poison'].forEach(function (id) { resetPaint(false); G.renderSpellBolt(projectileFor(id), camera, clock); });
      stats = G.getSpellVisualStats(); G.SPELL_GLOW_ENTRY_LIMIT = oldEntryLimit;
      check('glow cache stays within its entry and byte limits and evicts the oldest sprite',
        stats.glowEntries <= 2 && stats.glowEvictions >= 1 && stats.glowBytes <= G.SPELL_GLOW_BYTE_LIMIT && stats.glowBytes > 0 && stats.glowBuilds === 3);
      var oldFrameBudget = G.SPELL_GLOW_BUILDS_PER_FRAME;
      G.clearSpellVisualCache(); G.SPELL_GLOW_BUILDS_PER_FRAME = 0;
      resetPaint(false); G.renderSpellBolt(shard, camera, clock); stats = G.getSpellVisualStats();
      G.SPELL_GLOW_BUILDS_PER_FRAME = oldFrameBudget;
      check('an exhausted per-frame bake budget falls back to flat discs instead of stalling', stats.glowBuilds === 0 && stats.glowFallbacks > 0 && drawCount > 0);
      G.clearSpellVisualCache(); stats = G.getSpellVisualStats();
      check('clearing the cache releases sprites and resets counters', stats.glowEntries === 0 && stats.glowBytes === 0 && stats.glowBuilds === 0 && stats.glowHits === 0 && stats.bolts === 0);
    }

    // ── Production loops ──────────────────────────────────────────────────
    var realBolt = G.renderSpellBolt, boltCalls = 0;
    G.renderSpellBolt = function () { boltCalls++; return realBolt.apply(null, arguments); };
    G.projectiles = [projectileFor('ice'), projectileFor('lightning')];
    resetPaint(false); G.drawProjectiles3D(); var routedDraws = drawCount, routed = boltCalls;
    G.SPELL_VISUALS_ENABLED = false;
    resetPaint(false); G.drawProjectiles3D(); var legacyDraws = drawCount;
    G.SPELL_VISUALS_ENABLED = true; G.renderSpellBolt = realBolt;
    check('production projectile loop routes bolts to the archetype layer and the kill switch restores legacy drawing',
      routed === 2 && routedDraws > 0 && boltCalls === 2 && legacyDraws > 0);
    var realBurst = G.renderSpellBurst, burstCalls = 0;
    G.renderSpellBurst = function () { burstCalls++; return realBurst.apply(null, arguments); };
    G.impacts = [impactFor('ice', 60), {x:100, y:100, z:10, spawnMs:clock - 50, lifeMs:500, type:'steam'}];
    resetPaint(false); G.drawImpacts3D(); var impactDraws = drawCount;
    G.SPELL_VISUALS_ENABLED = false;
    resetPaint(false); G.drawImpacts3D(); var legacyImpactDraws = drawCount;
    G.SPELL_VISUALS_ENABLED = true; G.renderSpellBurst = realBurst;
    check('production impact loop routes bursts to the archetype layer and keeps legacy synergy impacts',
      burstCalls === 2 && impactDraws > 0 && legacyImpactDraws > 0);
    var scenes = G.spellVisualGalleryScenes(), sceneIds = scenes.map(function (scene) { return scene.spell; }).sort().join(',');
    check('gallery scenes cover every bolt and burst recipe exactly once',
      sceneIds === Object.keys(recipes).sort().join(',') && scenes.every(function (scene) {
        return /^(bolt|burst):/.test(scene.id) && scene.label.length > 0 && (scene.archetype === 'bolt' ? !!recipes[scene.spell].bolt : !recipes[scene.spell].bolt);
      }));
  } finally { Date.now = oldDate; Math.random = oldRandom; }
  __out('SPELL_VISUALS_RESULT PASS ' + checks);
}());
undefined;
