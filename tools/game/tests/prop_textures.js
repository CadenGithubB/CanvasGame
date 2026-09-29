// Prop textures (integration stage L, propTextures, default ON): the chest
// body and lid in wood (uvScale 14) and the spawner obelisk's body in stone
// (uvScale 32, dark wash) through the stage-E textured sink, triangles only,
// on the frame's shared primitive budget and counters. Real MAIN manifest
// through render_host.js; an empty flat world like chest_model.js, plus one
// real Endless frame. Oracles are independent of the prop texture code:
// - the scene-depth masks themselves: a wrapper on withSceneDepthClip records
//   every mask (pixel set, visible count, options) and the final
//   _sceneDepthInv during the prop draws, compared with propTextures off;
// - the recorded 2D-context stream, interpreted for clips equal to the face
//   mask and for pattern fills (fillStyle is a createPattern token);
// - the part and role of every filled face, found by matching its world
//   vertices (captured at projectSceneWorldPolygon) against faces built here
//   with buildModelFaces, and the brief's textured set written out below;
// - UV scale from geometry: on a planar isometric mapping the world distance
//   between two vertices is uvScale x their UV distance;
// - spies on the mapper entry points (drawPlanarFace, tessellate);
// - pinned hashes of the prop draws recorded on the stage-K tree before
//   stage L edited any source (test_prop_textures.py). The fixture switches
//   propTextures OFF explicitly (default ON since the flip), so the pins
//   still record the stage-K prop stream.
// Material pixels: the host's getImageData returns alpha 0, so sections that
// need a catalog give new canvases an opaque deterministic pixel store (as
// world_textures.js). Not a rasterizer: commands and pixel sets, not pixels.
// Mutations (evaluated copies; each anchor must match exactly once):
//   --props-planar          props are offered to the planar mapper (hybrid and planar modes)
//   --props-own-budget      the prop pass starts from 0, not the frame's used primitives
//   --props-any-role        every face of a textured material is textured (trim, lock, interior)
//   --props-model-uv        the obelisk keeps its model UVs (uvScale 24, not 32)
//   --props-fade-textured   a face drawn at a fade alpha below 1 is textured anyway
//   --props-budget-twice    every prop pass publishes texBudget again
//   --skip-mask-clip        the textured sink does not clip to the face mask
//   --clip-bias-zero        the textured sink's clip uses the study's depthBias 0
//   --props-tint-strip      Texture debug tints a textured prop face in the strip colour
//   --props-no-tint         Texture debug skips the tint on a textured prop face
// Narrowing: --sections a,b (load, parity, coverage, containment, faces, uv,
// triangles, budget, engage, fade, counters, debug, frame, lab).
(function () {
  (0, eval)(slurp('tools/game/tests/render_host.js'));
  var H = createRenderTestHost(), G = H.G, out = H.output, checked = 0, failed = 0;
  function check(name, ok, detail) {
    checked++; if (!ok) failed++;
    out((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + JSON.stringify(detail === undefined ? null : detail)));
  }
  function flag(name) { return __argv.indexOf(name) >= 0; }
  function option(name) { var i = __argv.indexOf(name); return i >= 0 ? __argv[i + 1] : null; }
  var sectionArg = option('--sections') ? option('--sections').split(',') : null;
  function section(name) { return !sectionArg || sectionArg.indexOf(name) >= 0; }
  function swap(source, name, before, after) {
    if (!flag(name)) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + name);
    return source.replace(before, after);
  }
  var TEX = 'src/12-world-textures.js';
  var loaded = H.loadManifest(function (path, source) {
    if (path !== TEX) return source;
    source = swap(source, '--props-planar', '  if (surface.triangles) planar = false;\n', '');
    source = swap(source, '--props-own-budget', '  pass.used = frame.used; pass.propStart = frame.used;\n', '  pass.used = 0; pass.propStart = 0;\n');
    source = swap(source, '--props-any-role', '  var spec = roles && roles[face.role];\n',
      '  var spec = roles && (roles[face.role] || roles[Object.keys(roles)[0]]);\n');
    source = swap(source, '--props-model-uv', '  var k = part && part.uvScale > 0 ? part.uvScale / spec.uvScale : 1;\n', '  var k = 1;\n');
    source = swap(source, '--props-fade-textured', '  if (surface.meanOnly) return _worldTextureMean(stats, key, meanStyle, gen, minY, maxY, \'fade\');\n', '');
    source = swap(source, '--props-budget-twice', '  if (!frame.budgetShown) {\n', '  if (true) {\n');
    source = swap(source, '--skip-mask-clip', '    _traceSceneDepthPixelMask(gen, minY, maxY); ctx.clip(); stats.clips++;\n',
      '    stats.clips++;\n');
    source = swap(source, '--clip-bias-zero', 'var _WORLD_TEXTURE_CLIP = {writeDepth: true, _paintsDepthPixels: true};',
      'var _WORLD_TEXTURE_CLIP = {writeDepth: true, depthBias: 0, _paintsDepthPixels: true};');
    source = swap(source, '--props-tint-strip', "  _worldTextureDebugTint(stats, handled ? 'strip' : 'triangle', gen, minY, maxY);\n",
      "  _worldTextureDebugTint(stats, handled || surface.triangles ? 'strip' : 'triangle', gen, minY, maxY);\n");
    source = swap(source, '--props-no-tint', "  _worldTextureDebugTint(stats, handled ? 'strip' : 'triangle', gen, minY, maxY);\n",
      "  if (!surface.triangles) _worldTextureDebugTint(stats, handled ? 'strip' : 'triangle', gen, minY, maxY);\n");
    return source;
  });
  var hasProps = typeof G.beginWorldTexturePropPass === 'function';
  var defs = {};
  (G.RENDER_FEATURE_DEFS || []).forEach(function (d) { defs[d.key] = d; });
  // setRenderFeatures with the keys this tree knows (the parity pins were
  // recorded on the stage-K tree, which has no propTextures).
  function features(values) {
    var known = {};
    for (var k in values) if (defs[k]) known[k] = values[k];
    G.setRenderFeatures(known);
  }
  function propsOn(on) { features({propTextures: on}); }

  if (section('load')) {
    check('load: the real manifest loads with the prop texture pass and no console errors',
      loaded > 40 && hasProps && typeof G.endWorldTexturePropPass === 'function' && typeof G.worldTexturePropSurface === 'function' &&
      H.errors.length === 0, {loaded: loaded, hasProps: hasProps, errors: H.errors.slice(0, 3)});
    var d = defs.propTextures;
    G.applyRenderPreset('legacy'); var legacyOn = G.renderFeatureOn('propTextures');
    G.applyRenderPreset('recommended'); var recOn = G.renderFeatureOn('propTextures');
    // Restated at the flip: stage L registered propTextures OFF in both
    // presets pending the native magnified-band case. That case passed in
    // Chromium (16/16, both controls) and the lab A/B was clean with no tail
    // regression, so it ships ON in Recommended; Legacy stays OFF (the Legacy
    // pins below are unchanged).
    check('load: propTextures is a bool switch, ON in Recommended (flipped after the native magnified band passed) and OFF in Legacy',
      !!d && d.type === 'bool' && d.default === true && d.legacy === false && recOn === true && legacyOn === false, {def: d, rec: recOn, legacy: legacyOn});
    var S = G.PROP_TEXTURE_SPECS || {}, bad = [];
    ['chestCommon', 'chestUncommon', 'chestRare', 'chestEpic'].forEach(function (id) {
      var roles = S[id] || {};
      if (Object.keys(roles).sort().join() !== 'body,lid') bad.push(id + ' roles ' + Object.keys(roles).join());
      ['body', 'lid'].forEach(function (r) {
        var s = roles[r];
        if (!s || s.material !== 'wood' || s.uvScale !== 14 || s.wash !== 0.32) bad.push(id + '.' + r);
      });
    });
    var ob = (S.spawnerObelisk || {}).body;
    if (Object.keys(S.spawnerObelisk || {}).join() !== 'body' || !ob || ob.material !== 'stone' || ob.uvScale !== 32 || !(ob.wash > 0.32 && ob.wash < 1)) bad.push('spawnerObelisk');
    if (Object.keys(S).length !== 5) bad.push('ids ' + Object.keys(S).join());
    check('load: the texture specs are the brief\'s: chest body and lid (every tier) wood at uvScale 14 with the structures\' 0.32 wash; obelisk body stone at uvScale 32 with a heavier (dark) wash; nothing else',
      bad.length === 0 && Object.isFrozen(S), bad);
  }

  // ── Opaque material pixels (the browser's behaviour) for catalog sections ──
  var realCreate = G.document.createElement, opaque = false;
  G.document.createElement = function (tag) {
    var element = realCreate(tag);
    if (opaque && String(tag).toLowerCase() === 'canvas') {
      var context = element.getContext('2d'), stored = null;
      context.putImageData = function (image) { stored = {w: image.width, h: image.height, data: new Uint8ClampedArray(image.data)}; };
      context.getImageData = function (x, y, w, h) {
        if (stored && stored.w === w && stored.h === h && !x && !y) return {width: w, height: h, data: new Uint8ClampedArray(stored.data)};
        var data = new Uint8ClampedArray(w * h * 4);
        for (var i = 0; i < w * h; i++) {
          var px = i % w, py = (i / w) | 0;
          data[i * 4] = 70 + ((px * 13 + py * 7) % 70); data[i * 4 + 1] = 72 + ((px * 5 + py * 11) % 60);
          data[i * 4 + 2] = 60 + ((px * 3 + py * 17) % 50); data[i * 4 + 3] = 255;
        }
        return {width: w, height: h, data: data};
      };
    }
    return element;
  };
  function withOpaque(fn) { var was = opaque; opaque = true; try { return fn(); } finally { opaque = was; } }
  function freshCatalog() {
    if (typeof G.resetWorldTextureCatalog !== 'function') return null;
    G.resetWorldTextureCatalog(); return withOpaque(function () { return G.ensureWorldTextureCatalog(128); });
  }

  // ── Fixture: an empty flat world; camera eye 20 above the floor ──
  var W = 320, HT = 240, PS = 180, EYE = 20, C = null;
  function world() {
    G.cell = 12; G.gridW = G.gridH = 64; G.grid = new Uint8Array(64 * 64);
    G.floorMesh = null; G.gridCave = null; G.deepCaveRegions = []; G.deepCaveEntrances = [];
    G.windowOriginX = G.windowOriginY = 0; G.CANVAS_BASE_H = 240; G.viewDist = 1400; G.ENDLESS_MODE = false;
    G.canvas.width = W; G.canvas.height = HT; G.projScale = PS; G.MODE3D = true; G.enemies = [];
    G.cam = {x: 0, y: 0, z: 60 + (EYE - 60) * 40 / 25, ang: 0, pitch: 0, fov: Math.PI / 2};
    G.applyRenderPreset('recommended'); features({chestModel: true, spawnerModel: true, propTextures: false});
    G.USE_TEXTURES = true; G.DEBUG_TEXTURE = false; G.DEBUG_POLY_TYPES = false; G.DEBUG_CAVE_COLORS = false; G.DEBUG_LAYER_TYPES = false;
    G.treasureChests = []; G.enemySpawners = [];
    G.updateDayNight(0);
  }
  world();
  function chest(x, y, tier, facing, lid) {
    return {x: x, y: y, renderFloorZ: 0, tier: tier, facing: facing, lidAngle: lid, opened: lid > 0, gold: 12, seed: 3};
  }
  function spawner(x, y) { return {x: x, y: y, renderFloorZ: 0, feetZ: 0, hp: 6, maxHp: 6, active: true, type: 'basic', pulsePhase: 0.5}; }
  // Camera `dist` out along `dir` from (x, y), looking back, the target
  // height zc centred on the screen row (y = horizon + (eye - z) PS / depth).
  function aimAt(x, y, zc, dir, dist) {
    G.cam.x = x + Math.cos(dir) * dist; G.cam.y = y + Math.sin(dir) * dist; G.cam.ang = dir + Math.PI;
    G.cam.pitch = (EYE - zc) / dist;
    C = G.getCam3D();
  }
  // Scenes: one chest per tier at magnified-band distances (lid shut and
  // open), a row of chests, and the obelisk near and far.
  var SCENES = [
    {tag: 'common25', chests: [['common', 0, 0, 0.4, 0]], aim: [0, 0, 5.5, 0.4 + 0.3, 25]},
    {tag: 'uncommon45open', chests: [['uncommon', 0, 0, 1.1, 0.6]], aim: [0, 0, 6, 1.1 - 0.4, 45]},
    {tag: 'rare70', chests: [['rare', 0, 0, 2.0, 0]], aim: [0, 0, 5.5, 2.0 + 0.2, 70]},
    {tag: 'epic90', chests: [['epic', 0, 0, 3.0, 0.3]], aim: [0, 0, 5.5, 3.0, 90]},
    {tag: 'row', chests: [['common', 0, 0, 0, 0], ['rare', -25, 12, 0.3, 0], ['epic', -50, -14, 6, 0], ['uncommon', -95, 5, 0.2, 0.5]], aim: [0, 0, 5.5, 0, 30]},
    {tag: 'obelisk60', spawners: [[0, 0]], aim: [0, 0, 40, 0.9, 60]},
    {tag: 'obelisk150', spawners: [[0, 0]], chests: [['common', -40, 20, 5.8, 0]], aim: [0, 0, 40, 2.4, 150]}
  ];
  function place(scene) {
    G.treasureChests = (scene.chests || []).map(function (c) { return chest(1000 + c[1], 1000 + c[2], c[0], c[3], c[4]); });
    G.enemySpawners = (scene.spawners || []).map(function (s) { return spawner(1000 + s[0], 1000 + s[1]); });
    var a = scene.aim; aimAt(1000 + a[0], 1000 + a[1], a[2], a[3], a[4]);
  }
  function sceneOf(tag) { return SCENES.filter(function (s) { return s.tag === tag; })[0]; }

  // ── Instrumentation (only while inProps) ──
  var inProps = false, maskLog = null, currentMask = null, faceLog = null, sinkLog = null, planarCalls = 0, tessCalls = 0;
  var realClip = G.withSceneDepthClip, realProject = G.projectSceneWorldPolygon, realFlat = G.fillSceneDepthPolygon;
  var realSink = G.fillSceneDepthTexturedPolygon, projectedWorld = typeof WeakMap === 'function' ? new WeakMap() : null;
  function snapshotMask() {
    var gen = G._sceneDepthClipGeneration, Wd = G._sceneDepthW, list = [];
    for (var y = G._sceneDepthClipMinY; y <= G._sceneDepthClipMaxY; y++) {
      if (G._sceneDepthClipRowMarks[y] !== gen) continue;
      for (var x = G._sceneDepthClipRowMin[y]; x <= G._sceneDepthClipRowMax[y]; x++) if (G._sceneDepthClipMarks[y * Wd + x] === gen) list.push(y * Wd + x);
    }
    return list;
  }
  function hashList(list) {
    var h = 0x811c9dc5;
    for (var i = 0; i < list.length; i++) h = Math.imul(h ^ list[i], 0x01000193) >>> 0;
    return (h >>> 0).toString(16) + ':' + list.length;
  }
  G.withSceneDepthClip = function (points, cb, options) {
    if (!inProps) return realClip.apply(null, arguments);
    var entry = {pixels: null, bias: options && options.depthBias, write: !!(options && options.writeDepth),
      paints: !!(options && options._paintsDepthPixels), extra: !!(options && options.extraPolygons)};
    var r = realClip(points, function () {
      entry.pixels = snapshotMask(); currentMask = entry.pixels;
      G.ctx.__mark('face', maskLog ? maskLog.length : -1);
      try { return cb.apply(this, arguments); } finally { currentMask = null; G.ctx.__mark('end', 0); }
    }, options);
    entry.visible = r;
    if (maskLog) maskLog.push(entry);
    return r;
  };
  G.projectSceneWorldPolygon = function (verts) {
    var p = realProject.apply(null, arguments);
    if (inProps && projectedWorld && p && typeof p === 'object') projectedWorld.set(p, verts.map(function (v) { return {x: v.x, y: v.y, z: v.z}; }));
    return p;
  };
  function worldOf(points) { return projectedWorld && points ? projectedWorld.get(points) || null : null; }
  G.fillSceneDepthPolygon = function (points) {
    if (inProps && faceLog) faceLog.push({textured: false, world: worldOf(points), alpha: G.ctx.globalAlpha});
    return realFlat.apply(null, arguments);
  };
  if (typeof realSink === 'function') G.fillSceneDepthTexturedPolygon = function (points, surface) {
    var pass = G._worldTexturePass, s = pass.stats || {};
    var before = {faces: s.faces || 0, budget: s.meanBudget || 0, small: s.meanSmall || 0, fade: s.meanFade || 0, decline: s.meanDecline || 0,
      failed: s.meanFailed || 0, triangles: s.triangles || 0, strips: s.strips || 0, fills: pass.mapperStats && pass.mapperStats.patternFills || 0};
    var entry = {textured: true, world: worldOf(points), alpha: G.ctx.globalAlpha, material: surface && surface.material, mask: maskLog ? maskLog.length : -1,
      key: surface && surface.key, meanOnly: !!(surface && surface.meanOnly),
      uv: surface && surface.vertices.map(function (v) { return {x: v.x, y: v.y, z: v.z, u: v.u, v: v.v}; })};
    if (inProps && faceLog) faceLog.push(entry);
    var r = realSink.apply(null, arguments);
    s = pass.stats || s;
    ['faces', 'budget', 'small', 'fade', 'decline', 'failed'].forEach(function (k) {
      var now = {faces: s.faces, budget: s.meanBudget, small: s.meanSmall, fade: s.meanFade, decline: s.meanDecline, failed: s.meanFailed}[k] || 0;
      if (now > before[k]) entry.outcome = k === 'faces' ? 'textured' : k;
    });
    entry.prims = (s.strips || 0) + (s.triangles || 0) - before.strips - before.triangles;
    entry.strips = (s.strips || 0) - before.strips;
    entry.visible = r;
    if (inProps && sinkLog) sinkLog.push(entry);
    return r;
  };
  if (G.TexturePilot) {
    var realPlanar = G.TexturePilot.drawPlanarFace, realTess = G.TexturePilot.tessellate;
    G.TexturePilot.drawPlanarFace = function () { if (inProps) planarCalls++; return realPlanar.apply(this, arguments); };
    G.TexturePilot.tessellate = function () { if (inProps) tessCalls++; return realTess.apply(this, arguments); };
  }
  function depthHash() {
    var inv = G._sceneDepthInv, h = 0x811c9dc5;
    for (var i = 0; i < W * HT; i++) { var v = Math.round(inv[i] * 1e7); h = Math.imul(h ^ v, 0x01000193) >>> 0; }
    return (h >>> 0).toString(16);
  }
  function frame() { G.beginSceneDepthFrame(W, HT); G.beginRenderFrameStats(); }
  // One frame of the prop opaque phase: chests (near to far), then spawners.
  function drawProps(keep, phase) {
    frame();
    maskLog = []; faceLog = []; sinkLog = []; planarCalls = 0; tessCalls = 0;
    H.record(true, keep !== false);
    inProps = true;
    try { G.drawTreasureChests3D(phase || 'opaque'); G.drawEnemySpawners3D(phase || 'opaque'); } finally { inProps = false; }
    var rec = H.record(false), log = maskLog;
    var result = {rec: rec, log: log, faces: faceLog, sink: sinkLog, planar: planarCalls, tess: tessCalls, depth: depthHash(),
      stats: JSON.parse(JSON.stringify(G._renderFrameStats)),
      seq: log.map(function (e) { return (e.pixels ? hashList(e.pixels) : '-') + '/' + e.visible + '/' + e.bias + '/' + e.write + e.paints + e.extra; })};
    maskLog = null; faceLog = null; sinkLog = null;
    return result;
  }

  // ── Independent face identities: part and role by world vertices ──
  var TEXTURED = {chest: {wallBack: 'body', wallFront: 'body', wallLeft: 'body', wallRight: 'body', lid: 'lid'}, spawner: {body: 'body'}};
  function vkey(list) { return list.map(function (p) { return [p.x, p.y, p.z].map(function (v) { return Math.round(v * 1e4); }).join(','); }).sort().join('|'); }
  function sceneFaces() {
    var map = {};
    function add(model, inst, family) {
      var buf = G.createModelFaceBuffer(), n = G.buildModelFaces(model, inst, buf);
      for (var i = 0; i < n; i++) {
        var f = buf.faces[i], want = TEXTURED[family][f.partName];
        map[vkey(f.vertices)] = {family: family, part: f.partName, role: f.role, textured: want !== undefined && want === f.role,
          uvScale: family === 'chest' ? 14 : 32};
      }
    }
    G.treasureChests.forEach(function (ch) { add(G.chestModelFor(ch.tier), G.chestModelInstance(ch, G.getEntityRenderFloorZ(ch), {}), 'chest'); });
    G.enemySpawners.forEach(function (sp) { add(G.spawnerModelFor(), G.spawnerModelInstance(sp, G.getEntityRenderFloorZ(sp), 1, {}), 'spawner'); });
    return map;
  }
  function identify(frameResult) {
    var map = sceneFaces(), unknown = 0;
    frameResult.faces.forEach(function (e) {
      var id = e.world ? map[vkey(e.world)] : null;
      if (!id) { unknown++; return; }
      e.id = id;
    });
    return unknown;
  }

  // ── Stream interpreter: pattern fills, clips equal to the current face mask ──
  var ctxId = (function () { H.record(true, true); G.ctx.__probe(); var r = H.record(false); return /^(c\d+)\./.exec(r.all[0])[1]; })();
  // tintOf(fillStyle) (optional, the debug section): each face also records
  // every fill with its tint path (or null), alpha, composite, fillRect or
  // path fill, and whether a tint's path equals the face mask; tints outside
  // any face span are counted as strayTints. The composite is tracked only
  // then; the recorder writes a string as JSON and anything else (a token,
  // null, 'object') bare, so a value that is not JSON is kept as its text.
  function unquote(value) { try { var v = JSON.parse(value); return typeof v === 'string' ? v : value; } catch (e) { return value; } }
  function interpret(entries, masks, tintOf) {
    var faces = [], face = null, path = [], clips = [], stack = [], fill = '', saves = 0, alpha = 1, op = 'source-over', strayTints = 0;
    function pixelsOfRects(rects) {
      var set = {};
      rects.forEach(function (r) {
        var x0 = Math.max(0, Math.ceil(r[0] - 0.5)), x1 = Math.min(W - 1, Math.ceil(r[0] + r[2] - 0.5) - 1);
        var y0 = Math.max(0, Math.ceil(r[1] - 0.5)), y1 = Math.min(HT - 1, Math.ceil(r[1] + r[3] - 0.5) - 1);
        for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) set[y * W + x] = 1;
      });
      return set;
    }
    function pathEqualsFaceMask() {
      var want = face && masks[face.index] ? masks[face.index].pixels : null;
      var rectsOnly = path.length && path.every(function (e) { return e.t === 'rect'; });
      if (!(rectsOnly && want)) return false;
      var set = pixelsOfRects(path.map(function (e) { return e.r; })), n = 0;
      for (var k in set) n++;
      return n === want.length && want.every(function (i) { return set[i] === 1; });
    }
    var stray = 0;
    entries.forEach(function (text) {
      var m = /^(c\d+)\.([A-Za-z_]+)(=(.*)|\((.*)\))$/.exec(text);
      if (!m || m[1] !== ctxId) return;
      var name = m[2], value = m[4], args = m[5] !== undefined ? (m[5] === '' ? [] : m[5].split(',')) : null;
      if (name === '__mark') {
        if (args[0] === '"face"') { face = {index: +args[1], patternFills: 0, unclipped: 0, saves: saves, baseAlpha: alpha, fills: []}; faces.push(face); }
        else { if (face) face.balanced = saves === face.saves; face = null; }
        return;
      }
      if (value !== undefined) {
        if (name === 'fillStyle') fill = value;
        else if (name === 'globalAlpha') alpha = +value;
        else if (name === 'globalCompositeOperation' && tintOf) op = unquote(value);
        return;
      }
      if (name === 'save') { stack.push({clips: clips.slice(), fill: fill, alpha: alpha, op: op}); saves++; }
      else if (name === 'restore') { var s = stack.pop(); saves--; if (s) { clips = s.clips; fill = s.fill; alpha = s.alpha; op = s.op; } }
      else if (name === 'beginPath') path = [];
      else if (name === 'rect') path.push({t: 'rect', r: args.map(Number)});
      else if (name === 'moveTo' || name === 'lineTo') path.push({t: 'line'});
      else if (name === 'clip') clips = clips.concat([{equalsMask: pathEqualsFaceMask()}]);
      else if (name === 'fillRect' || name === 'fill') {
        if (tintOf) {
          var tint = tintOf(fill);
          if (!face) { if (tint) strayTints++; }
          else face.fills.push({tint: tint, alpha: alpha, op: op, rect: name === 'fillRect', pathIsMask: !!tint && name === 'fill' && pathEqualsFaceMask()});
        }
        if (/^pat#/.test(fill)) {
          if (!face) { stray++; return; }
          face.patternFills++;
          if (!clips.some(function (c) { return c.equalsMask; })) face.unclipped++;
        }
      }
    });
    return {faces: faces, saves: saves, stray: stray, strayTints: strayTints};
  }
  function sumFills(a) { return a.faces.reduce(function (s, f) { return s + f.patternFills; }, 0); }
  function withOverride(values, fn) { var was = G._worldTextureOverride; G._worldTextureOverride = values; try { return fn(); } finally { G._worldTextureOverride = was; } }

  // ── parity: propTextures OFF records the stage-K prop draws exactly ──
  if (section('parity')) {
    // Pinned by test_prop_textures.py (recorded on the stage-K tree). Legacy
    // (the chest and obelisk billboards) is pinned too, as a control.
    SCENES.forEach(function (scene) {
      place(scene);
      propsOn(false); var off = drawProps(false);
      out('HASH off ' + scene.tag + ' ' + off.rec.hash());
      G.applyRenderPreset('legacy'); var legacy = drawProps(false, 'all'); G.applyRenderPreset('recommended'); world(); place(scene);
      out('HASH legacy ' + scene.tag + ' ' + legacy.rec.hash());
      if (!hasProps) return;
      freshCatalog();
      propsOn(true); G.USE_TEXTURES = false;
      var master = drawProps(false);
      G.USE_TEXTURES = true; propsOn(false);
      check('parity: ' + scene.tag + ': propTextures on with the texture master off records the flat prop stream exactly (reason master counted once)',
        master.rec.hash() === off.rec.hash() && master.stats.texFlat === 1 && master.stats.texFlatMaster === 1 && off.rec.entries > 20,
        {off: off.rec.hash(), on: master.rec.hash(), flat: master.stats.texFlat, master: master.stats.texFlatMaster});
    });
    if (hasProps) {
      // No catalog (headless alpha 0): after the one failed build the frames
      // record the flat stream exactly.
      var scene = sceneOf('row'); place(scene);
      propsOn(false); var flat = drawProps(false);
      G.resetWorldTextureCatalog(); propsOn(true);
      drawProps(false); var later = drawProps(false); propsOn(false);
      check('parity: with no catalog (headless alpha 0), frames after the one failed build record the flat prop stream exactly (reason catalog)',
        later.rec.hash() === flat.rec.hash() && later.stats.texFlatCatalog === 1 && G.getWorldTextureState().catalogFailed === true,
        {flat: flat.rec.hash(), later: later.rec.hash(), stats: later.stats.texFlatCatalog});
      freshCatalog();
    }
  }
  if (!hasProps) { out('PROP_TEXTURES_RESULT ' + (failed ? 'FAIL ' + failed + '/' : 'PASS ') + checked + ' failed ' + failed); return; }

  // ── coverage: masks and depth identical with prop textures on and off ──
  if (section('coverage')) {
    freshCatalog();
    SCENES.forEach(function (scene) {
      place(scene);
      propsOn(false); var off = drawProps(true);
      propsOn(true); var on = drawProps(true);
      propsOn(false);
      var firstDiff = -1;
      for (var i = 0; i < Math.max(off.seq.length, on.seq.length); i++) if (off.seq[i] !== on.seq[i]) { firstDiff = i; break; }
      check('coverage: ' + scene.tag + ': the prop draws make the same withSceneDepthClip masks (pixels, count, options) and the same final _sceneDepthInv with prop textures on and off',
        on.seq.length === off.seq.length && firstDiff < 0 && on.depth === off.depth && (on.stats.texPropFaces || 0) > 0,
        {clips: [off.seq.length, on.seq.length], firstDiff: firstDiff, at: firstDiff >= 0 ? [off.seq[firstDiff], on.seq[firstDiff]] : null,
          depth: [off.depth, on.depth], textured: on.stats.texPropFaces});
    });
  }

  // ── containment: every pattern fill is under a clip equal to its face mask ──
  if (section('containment')) {
    freshCatalog();
    var strayAll = 0, spans = 0;
    SCENES.forEach(function (scene) {
      place(scene); propsOn(true);
      var f = drawProps(true); propsOn(false);
      var a = interpret(f.rec.all, f.log), fills = sumFills(a), bad = a.faces.filter(function (x) { return x.unclipped > 0; });
      var unbalanced = a.faces.filter(function (x) { return x.balanced === false; }).length;
      strayAll += a.stray; spans += a.faces.length;
      check('containment: ' + scene.tag + ': every pattern fill is issued under a clip whose rects equal that face\'s scene-depth mask; save/restore balanced per face',
        fills > 0 && bad.length === 0 && fills === f.stats.texPatternFills && unbalanced === 0 && a.saves === 0,
        {fills: fills, counted: f.stats.texPatternFills, unclipped: bad.slice(0, 3).map(function (x) { return {i: x.index, n: x.unclipped}; }),
          unbalanced: unbalanced, saves: a.saves});
    });
    check('containment: no pattern fill on the game canvas outside a scene-depth face callback in any prop scene', spans > 0 && strayAll === 0,
      {spans: spans, stray: strayAll});
  }

  // ── faces: exactly the chest body/lid and obelisk body faces reach the sink ──
  if (section('faces')) {
    freshCatalog();
    var problems = [], seen = {}, keyProblems = [];
    SCENES.forEach(function (scene) {
      place(scene); propsOn(true);
      var f = drawProps(true); propsOn(false);
      var unknown = identify(f);
      if (unknown) problems.push(scene.tag + ': ' + unknown + ' unidentified fills');
      f.faces.forEach(function (e) {
        if (!e.id) return;
        var tag = e.id.family + '.' + e.id.part + '.' + e.id.role;
        seen[tag] = (seen[tag] || 0) + 1;
        if (e.textured !== e.id.textured) problems.push(scene.tag + ': ' + tag + (e.textured ? ' textured' : ' flat'));
        if (e.textured && e.material !== (e.id.family === 'chest' ? 'wood' : 'stone')) problems.push(scene.tag + ': ' + tag + ' material ' + e.material);
      });
    });
    var texturedTags = Object.keys(seen).filter(function (t) { return /\.(wall(Back|Front|Left|Right)\.body|lid\.lid|body\.body)$/.test(t); });
    var flatTags = Object.keys(seen).filter(function (t) { return texturedTags.indexOf(t) < 0; });
    out('NOTE faces textured ' + texturedTags.join(' ') + ' | flat ' + flatTags.join(' '));
    check('faces: exactly the chest wall slabs\' body faces, the lid\'s lid faces (not its interior underside) and the obelisk body reach the textured sink; trim, strap, lock, interior and runes stay flat',
      problems.length === 0 && texturedTags.length === 6 && flatTags.some(function (t) { return /\.trim\./.test(t); }) &&
      flatTags.some(function (t) { return /interior/.test(t); }) && flatTags.some(function (t) { return /^spawner\.rune/.test(t); }),
      {problems: problems.slice(0, 6), textured: texturedTags, flat: flatTags});
    // Owned-pixel hysteresis keys: one per chest face, stable across frames.
    place(sceneOf('row')); propsOn(true);
    var k1 = drawProps(false).sink, k2 = drawProps(false).sink; propsOn(false);
    var distinct = new Set(k1.map(function (e) { return e.key; })).size;
    var stable = k1.length === k2.length && k1.every(function (e, i) { return e.key && e.key === k2[i].key; });
    check('faces: every prop face has its own hysteresis key (distinct across the four chests, the same object next frame)',
      k1.length > 0 && distinct === k1.length && stable, {calls: k1.length, distinct: distinct, stable: stable});
  }

  // ── uv: world distance = uvScale x UV distance on every textured surface ──
  if (section('uv')) {
    freshCatalog();
    var worst = {chest: 0, spawner: 0}, counts = {chest: 0, spawner: 0}, bad = [];
    SCENES.forEach(function (scene) {
      place(scene); propsOn(true);
      var f = drawProps(true); propsOn(false); identify(f);
      f.sink.forEach(function (e) {
        if (!e.id) return;
        var scale = e.id.uvScale, fam = e.id.family, v = e.uv;
        counts[fam]++;
        for (var i = 0; i < v.length; i++) for (var j = i + 1; j < v.length; j++) {
          var dw = Math.hypot(v[i].x - v[j].x, v[i].y - v[j].y, v[i].z - v[j].z), du = Math.hypot(v[i].u - v[j].u, v[i].v - v[j].v);
          var err = Math.abs(dw - scale * du);
          if (err > worst[fam]) worst[fam] = err;
          if (err > 1e-6) bad.push({scene: scene.tag, part: e.id.part, dw: dw, du: du});
        }
      });
    });
    var model = G.spawnerModelFor(), bodyScale = model.parts.filter(function (p) { return p.name === 'body'; })[0].uvScale;
    check('uv: every textured chest face maps 14 world units to one tile and every obelisk face 32 (the model\'s own obelisk UVs are ' + bodyScale + ')',
      counts.chest > 0 && counts.spawner > 0 && bad.length === 0 && bodyScale !== 32, {counts: counts, worst: worst, bad: bad.slice(0, 3)});
  }

  // ── triangles: props never use planar strips, whatever textureMapping says ──
  if (section('triangles')) {
    freshCatalog();
    var modes = {};
    ['hybrid', 'planar', 'triangles'].forEach(function (mode) {
      var planar = 0, tess = 0, strips = 0, triangles = 0, textured = 0;
      SCENES.forEach(function (scene) {
        place(scene); propsOn(true);
        var f = withOverride({textureMapping: mode}, function () { return drawProps(false); }); propsOn(false);
        planar += f.planar; tess += f.tess; strips += f.stats.texStrips || 0; triangles += f.stats.texTriangles || 0; textured += f.stats.texPropFaces || 0;
      });
      modes[mode] = {planar: planar, tess: tess, strips: strips, triangles: triangles, textured: textured};
    });
    // Positive control: the same sink offers a horizontal structure-like face
    // to the planar mapper in hybrid mode (so the spy can see planar calls).
    place(sceneOf('common25')); frame();
    G.setRenderFeatures({structureTextures: true});
    inProps = true; planarCalls = 0;
    var begun = G.beginWorldTexturePass(C);
    var z = 0.5, quad = [[990, 990], [1010, 990], [1010, 1010], [990, 1010]].map(function (p) { return {x: p[0], y: p[1], z: z, u: p[0] / 32, v: p[1] / 32}; });
    var projected = realProject(quad, C);
    G.fillSceneDepthTexturedPolygon(projected, {vertices: quad, material: 'stone', tint: 0x808080, lit: 0x707070, dist: 20, horizontal: true, key: {}});
    G.endWorldTexturePass(); inProps = false;
    var control = planarCalls;
    check('triangles: in hybrid, planar and triangles modes the props never call the planar mapper and issue zero strips (tessellated triangles only); control: a horizontal structure face in hybrid does reach the planar mapper',
      ['hybrid', 'planar', 'triangles'].every(function (m) { return modes[m].planar === 0 && modes[m].strips === 0 && modes[m].tess > 0 && modes[m].triangles > 0; }) &&
      begun === true && control > 0, {modes: modes, control: control, begun: begun});
  }

  // ── budget: one per-frame budget shared with the structure pass ──
  if (section('budget')) {
    freshCatalog();
    // (1) Props alone, budget 40: never exceeded; the nearest chest first.
    place(sceneOf('row')); propsOn(true);
    var small = withOverride({textureBudget: 40, textureMinPixels: 0}, function () { return drawProps(false); }); propsOn(false);
    identify({faces: small.sink});
    var used = small.sink.reduce(function (s, e) { return s + e.prims; }, 0);
    var chestDist = function (e) { var w = e.world || e.uv; var cx = 0, cy = 0; w.forEach(function (p) { cx += p.x; cy += p.y; }); return Math.round(Math.hypot(cx / w.length - G.cam.x, cy / w.length - G.cam.y) / 10); };
    var declined = small.sink.filter(function (e) { return e.outcome === 'budget'; }), admitted = small.sink.filter(function (e) { return e.outcome === 'textured'; });
    var firstDecline = small.sink.indexOf(declined[0]);
    var nearestAdmitted = admitted.length ? chestDist(admitted[0]) : -1, farthestDeclined = declined.reduce(function (m, e) { return Math.max(m, chestDist(e)); }, -1);
    var nearest = small.sink.filter(function (e) { return e.outcome; }).reduce(function (m, e) { return Math.min(m, chestDist(e)); }, Infinity);
    out('NOTE budget props-only 40: used ' + used + ', admitted ' + admitted.length + ', declined ' + declined.length);
    check('budget: props alone at budget 40 never exceed it (texPrims = the spies\' primitives), declines are counted as budget means, and the nearest chest is admitted before any decline',
      used <= 40 && small.stats.texPrims === used && small.stats.texPropPrims === used && small.stats.texBudget === 40 &&
      declined.length > 0 && small.stats.texMeanBudget === declined.length && firstDecline > 0 && admitted.length > 0 &&
      nearestAdmitted === nearest && small.sink.slice(0, firstDecline).every(function (e) { return chestDist(e) <= farthestDeclined; }),
      {used: used, counted: small.stats.texPrims, props: small.stats.texPropPrims, budget: small.stats.texBudget, declined: declined.length,
        counted2: small.stats.texMeanBudget, firstDecline: firstDecline, nearestAdmitted: nearestAdmitted, nearest: nearest});
    // (2) Shared: a structure pass earlier in the same frame spends S
    // primitives on a wall face through the same sink; the props then get
    // at most budget - S, and texBudget is published once.
    function sharedFrame(budget) {
      place(sceneOf('row'));
      return withOverride({textureBudget: budget, textureMinPixels: 0}, function () {
        frame();
        G.setRenderFeatures({structureTextures: true}); propsOn(true);
        G.beginWorldTexturePass(C);
        // A grazing stone wall beside the row (camera at x 1030 looking down
        // -x; the chests stand at y <= 1012), so the structure spends many
        // triangles.
        var wall = [[1026, 1030, 0], [880, 1030, 0], [880, 1030, 40], [1026, 1030, 40]].map(function (p) { return {x: p[0], y: p[1], z: p[2], u: p[0] / 32, v: (40 - p[2]) / 32}; });
        var pw = realProject(wall, C);
        if (pw && pw.length >= 3) G.fillSceneDepthTexturedPolygon(pw, {vertices: wall, material: 'stone', tint: 0x808080, lit: 0x707070, dist: 60, horizontal: false, key: {}});
        var structPrims = G._worldTexturePass.used;
        G.endWorldTexturePass();
        maskLog = []; faceLog = []; sinkLog = [];
        inProps = true;
        try { G.drawTreasureChests3D('opaque'); G.drawEnemySpawners3D('opaque'); } finally { inProps = false; }
        var props = sinkLog; maskLog = faceLog = sinkLog = null;
        propsOn(false);
        return {struct: structPrims, props: props, stats: JSON.parse(JSON.stringify(G._renderFrameStats))};
      });
    }
    var roomy = sharedFrame(2048);
    var tightBudget = roomy.struct + 10, t = sharedFrame(tightBudget);
    var propPrims = t.props.reduce(function (s, e) { return s + e.prims; }, 0);
    out('NOTE budget shared: structure ' + roomy.struct + ' primitives; at budget ' + tightBudget + ' the props used ' + propPrims);
    check('budget: shared with the structure pass in the same frame: props get at most budget - structure primitives, texPrims counts both, texBudget is published once',
      roomy.struct > 10 && t.struct === roomy.struct && propPrims <= tightBudget - t.struct && t.stats.texPrims === t.struct + propPrims &&
      t.stats.texPropPrims === propPrims && t.stats.texBudget === tightBudget && roomy.stats.texBudget === 2048 &&
      t.props.some(function (e) { return e.outcome === 'budget'; }) && roomy.stats.texPropPrims > propPrims,
      {struct: t.struct, propPrims: propPrims, texPrims: t.stats.texPrims, budget: t.stats.texBudget, roomyBudget: roomy.stats.texBudget,
        roomyProps: roomy.stats.texPropPrims});
    G.setRenderFeatures({structureTextures: true});
  }

  // ── engage: each disengage condition gives zero prop pattern fills, reason counted once ──
  if (section('engage')) {
    freshCatalog();
    place(sceneOf('obelisk150'));   // one chest and one obelisk: two prop passes a frame
    function engaged(setup, teardown, reasonKey) {
      propsOn(true); setup();
      var f;
      try { f = drawProps(true); } finally { teardown(); propsOn(false); }
      return {fills: sumFills(interpret(f.rec.all, f.log)), reason: reasonKey ? f.stats[reasonKey] : undefined, flat: f.stats.texFlat,
        textured: f.stats.texPropFaces || 0, props: f.stats.texPropFlat || 0};
    }
    var control = engaged(function () {}, function () {}, null);
    check('engage: positive control (identity transform, source-over, 240 rows, no debug palette): a chest and an obelisk are textured with pattern fills',
      control.fills > 0 && control.textured > 0 && !control.flat, control);
    var cases = [
      ['USE_TEXTURES false', function () { G.USE_TEXTURES = false; }, function () { G.USE_TEXTURES = true; }, 'texFlatMaster'],
      ['361 rows', function () { G.canvas.height = 361; }, function () { G.canvas.height = HT; }, 'texFlatRows'],
      ['transform', function () { G.__rt = G.ctx.getTransform; G.ctx.getTransform = function () { return {a: 2, b: 0, c: 0, d: 2, e: 0, f: 0}; }; },
        function () { G.ctx.getTransform = G.__rt; }, 'texFlatTransform'],
      ['DEBUG_POLY_TYPES', function () { G.DEBUG_POLY_TYPES = true; }, function () { G.DEBUG_POLY_TYPES = false; }, 'texFlatDebug'],
      ['composite', function () { G.ctx.globalCompositeOperation = 'multiply'; }, function () { G.ctx.globalCompositeOperation = 'source-over'; }, 'texFlatComposite']];
    var results = cases.map(function (c) { var r = engaged(c[1], c[2], c[3]); r.label = c[0]; return r; });
    check('engage: texture master off, 361 rows, a transform, a debug palette or a composite -> zero prop pattern fills; the frame\'s flat reason is counted once for two prop passes',
      results.every(function (r) { return r.fills === 0 && r.reason === 1 && r.flat === 1 && r.textured === 0; }), results);
    var off = engaged(function () { propsOn(false); }, function () {}, null);
    check('engage: propTextures off -> zero pattern fills and nothing counted (no flat reason, no texProp counters)',
      off.fills === 0 && !off.flat && !off.textured && !off.props, off);
  }

  // ── fade: a chest in its range fade (alpha < 1) paints the prepared mean ──
  if (section('fade')) {
    freshCatalog();
    function fadeCase(dist) {
      G.treasureChests = [chest(1000, 1000, 'common', 0.4, 0)]; G.enemySpawners = [];
      aimAt(1000, 1000, 5.5, 0.4, dist); propsOn(true);
      var f = withOverride({textureMinPixels: 0}, function () { return drawProps(true); }); propsOn(false);
      // Faces that own pixels (the callback ran) have an outcome.
      var shown = f.sink.filter(function (e) { return e.outcome; });
      return {fills: sumFills(interpret(f.rec.all, f.log)), alphas: f.sink.map(function (e) { return e.alpha; }),
        outcomes: shown.map(function (e) { return e.outcome; }), fade: f.stats.texMeanFade || 0, shown: shown.length};
    }
    var inRange = fadeCase(0.5 * 1400), band = fadeCase(0.66 * 1400);
    check('fade: a chest inside its range (alpha 1) is textured (control); in its range fade band every textured-material face that owns pixels paints the prepared mean (zero pattern fills, counted as fade)',
      inRange.fills > 0 && inRange.alphas.every(function (a) { return a === 1; }) && inRange.outcomes.indexOf('textured') >= 0 &&
      band.shown > 0 && band.fills === 0 && band.alphas.every(function (a) { return a < 1; }) && band.fade === band.shown &&
      band.outcomes.every(function (o) { return o === 'fade'; }), {inRange: inRange, band: band});
  }

  // ── counters: per-pass publishing ──
  if (section('counters')) {
    freshCatalog();
    place(sceneOf('obelisk150')); propsOn(true); G.setRenderFeatures({structureTextures: false});
    var f = drawProps(false); propsOn(false); G.setRenderFeatures({structureTextures: true});
    var s = f.stats, textured = f.sink.filter(function (e) { return e.outcome === 'textured'; }).length;
    var means = f.sink.filter(function (e) { return e.outcome && e.outcome !== 'textured'; }).length;
    var prims = f.sink.reduce(function (a, e) { return a + e.prims; }, 0);
    check('counters: two prop passes (chest, obelisk), structures off: texBudget published once (2048), texFaces = texPropFaces = textured sink calls, texMean = texPropMean = the rest, texPrims = texPropPrims = the spies\' primitives, texPropDraws 2',
      s.texBudget === 2048 && s.texFaces === textured && s.texPropFaces === textured && s.texMean === means && s.texPropMean === means &&
      s.texPrims === prims && s.texPropPrims === prims && s.texPropDraws === 2 && textured > 0 && !s.texStrips,
      {stats: {budget: s.texBudget, faces: s.texFaces, propFaces: s.texPropFaces, mean: s.texMean, propMean: s.texPropMean, prims: s.texPrims,
        propPrims: s.texPropPrims, draws: s.texPropDraws}, textured: textured, means: means, prims: prims});
    var line = G.renderHudStatusLine();
    check('counters: the HUD render line reads the props\' primitives against the budget (R:Custom TEX <prims>/2048 ... f<faces>)',
      line.indexOf('TEX ' + prims + '/2048') > 0 && line.indexOf(' f' + textured + ' ') > 0, line);
  }

  // ── debug: the Texture debug checkbox tints each textured prop face by its path ──
  if (section('debug')) {
    freshCatalog();
    var TINT = G.WORLD_TEXTURE_DEBUG_TINTS || {}, TINT_ALPHA = G.WORLD_TEXTURE_DEBUG_ALPHA;
    function tintOf(fillText) {
      var m = /rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\)/.exec(fillText || ''), c = m ? 'rgb(' + m[1] + ',' + m[2] + ',' + m[3] + ')' : '';
      for (var k in TINT) if (TINT[k] === c) return k;
      return null;
    }
    function tintRun(scene, debugOn, override) {
      place(scene); propsOn(true); G.DEBUG_TEXTURE = debugOn;
      try {
        var f = withOverride(override || null, function () { return drawProps(true); });
        identify(f);
        return {tag: scene.tag, f: f, a: interpret(f.rec.all, f.log, tintOf)};
      } finally { G.DEBUG_TEXTURE = false; propsOn(false); }
    }
    function tintTotal(r) { return r.a.strayTints + r.a.faces.reduce(function (s, face) { return s + face.fills.filter(function (x) { return x.tint; }).length; }, 0); }
    // Every scene, plus the row under a 40-primitive budget (budget means),
    // one chest in its range fade band (fade means at alpha < 1) and the
    // obelisk in its own range fade band (0.9 of its 0.5 x viewDist reach,
    // fade 0.5), so obelisk faces take the mean path too.
    var fadeScene = {tag: 'fade', chests: [['common', 0, 0, 0.4, 0]], aim: [0, 0, 5.5, 0.4, 0.66 * 1400]};
    var obeliskFade = {tag: 'obeliskFade', spawners: [[0, 0]], aim: [0, 0, 40, 0.9, 0.9 * 0.5 * 1400]};
    var cases = SCENES.map(function (s) { return [s, null]; }).concat([[sceneOf('row'), {textureBudget: 40, textureMinPixels: 0}], [fadeScene, {textureMinPixels: 0}],
      [obeliskFade, {textureMinPixels: 0}]]);
    var offRuns = cases.map(function (c) { return tintRun(c[0], false, c[1]); });
    var onRuns = cases.map(function (c) { return tintRun(c[0], true, c[1]); });
    // Path oracle from the sink spy: textured with no strips -> triangle
    // (props are triangles only, so never the strip colour); any mean
    // outcome (budget, small, fade, decline, failed) -> mean.
    var seen = {strip: 0, triangle: 0, mean: 0}, families = {chest: 0, spawner: 0}, bad = [], outside = 0, counted = [];
    var paths = {chest: {triangle: 0, mean: 0}, spawner: {triangle: 0, mean: 0}};
    onRuns.forEach(function (r) {
      var byIndex = {}, owners = {}, visible = 0;
      r.a.faces.forEach(function (face) { byIndex[face.index] = face; });
      r.f.sink.forEach(function (e) {
        if (!(e.visible > 0)) return;
        visible++; owners[e.mask] = true;
        var face = byIndex[e.mask], want = e.outcome === 'textured' && e.strips === 0 ? 'triangle' : e.outcome && e.outcome !== 'textured' ? 'mean' : 'none';
        var tints = face ? face.fills.filter(function (x) { return x.tint; }) : [], last = face ? face.fills[face.fills.length - 1] : null;
        var ok = !!e.id && tints.length === 1 && last === tints[0] && last.tint === want && last.pathIsMask === true && !last.rect &&
          last.op === 'source-over' && Math.abs(last.alpha - face.baseAlpha * TINT_ALPHA) < 2e-3; // the recorder keeps 3 decimals
        if (ok) { seen[want]++; families[e.id.family]++; paths[e.id.family][want]++; }
        else bad.push({scene: r.tag, mask: e.mask, part: e.id && e.id.part, outcome: e.outcome, strips: e.strips, want: want,
          got: tints.map(function (x) { return x.tint; }), last: last, base: face && face.baseAlpha});
      });
      // Tints on any other span (flat trim, lock, runes...) or outside every span.
      r.a.faces.forEach(function (face) { if (!owners[face.index]) outside += face.fills.filter(function (x) { return x.tint; }).length; });
      outside += r.a.strayTints;
      counted.push([r.tag, r.f.stats.texDebugTints || 0, visible]);
      if ((r.f.stats.texDebugTints || 0) !== visible || !visible) bad.push({scene: r.tag, counted: r.f.stats.texDebugTints, visible: visible});
    });
    var offTints = offRuns.map(function (r) { return [r.tag, tintTotal(r), r.f.stats.texDebugTints || 0, r.f.stats.texPropFaces || 0]; });
    out('NOTE debug tints ' + JSON.stringify({seen: seen, families: families, paths: paths, counted: counted}));
    check('debug: Texture debug on with prop textures on: every visible textured-material chest and obelisk face ends with exactly one translucent tint fill over its own scene-depth mask, coloured by its path (triangle or mean, never strip), counted once; chest and obelisk faces each take both paths; no tint lands outside those faces; control: Texture debug off issues and counts none',
      bad.length === 0 && outside === 0 && seen.triangle > 0 && seen.mean > 0 && seen.strip === 0 && families.chest > 0 && families.spawner > 0 &&
      paths.chest.triangle > 0 && paths.chest.mean > 0 && paths.spawner.triangle > 0 && paths.spawner.mean > 0 &&
      offTints.every(function (x) { return x[1] === 0 && x[2] === 0; }) && offRuns.some(function (r) { return (r.f.stats.texPropFaces || 0) > 0; }),
      {seen: seen, families: families, paths: paths, bad: bad.slice(0, 3), outside: outside, counted: counted, off: offTints});
  }

  // ── frame: one real Endless draw() with a chest and an obelisk ahead ──
  if (section('frame')) {
    H.startEndless(31337);
    G.applyRenderPreset('recommended'); features({propTextures: true});
    freshCatalog();
    G.resetRenderInterpolation(); G.updateDayNight(0); G.updateLightGrid();
    var p = {x: G.pos.x, y: G.pos.y}, best = null;
    for (var k = 0; k < 16 && !best; k++) {
      var a = k * Math.PI / 8, cx = p.x + Math.cos(a) * 40, cy = p.y + Math.sin(a) * 40, sx = p.x + Math.cos(a) * 130, sy = p.y + Math.sin(a) * 130;
      var clear = true;
      for (var d = 0; d <= 140; d += 6) {
        var gx = Math.floor((p.x + Math.cos(a) * d) / G.cell), gy = Math.floor((p.y + Math.sin(a) * d) / G.cell);
        if (gx < 0 || gy < 0 || gx >= G.gridW || gy >= G.gridH || G.grid[gy * G.gridW + gx]) { clear = false; break; }
      }
      if (clear) best = {a: a, chest: [cx, cy], spawner: [sx, sy]};
    }
    if (!best) { out('SETUP_FAILURE no clear ray at the seed-31337 start'); throw Error('SETUP_FAILURE'); }
    G.cam.ang = best.a; G.cam.pitch = 0.35;
    var ch = {x: best.chest[0], y: best.chest[1], tier: 'rare', facing: best.a + Math.PI, lidAngle: 0, opened: false, gold: 5, seed: 1};
    var sp = {x: best.spawner[0], y: best.spawner[1], hp: 6, maxHp: 6, active: true, type: 'basic', pulsePhase: 0.2};
    G.treasureChests = [ch]; G.enemySpawners = [sp];
    G._lightGridFrameCount = 1; G._presentationRandomState = 1234567; H.clock.seed = 0x0badcafe;
    G.draw();
    var s2 = JSON.parse(JSON.stringify(G._renderFrameStats)), hud = G.renderHudStatusLine();
    out('NOTE frame ' + JSON.stringify({ang: best.a, propFaces: s2.texPropFaces, propPrims: s2.texPropPrims, prims: s2.texPrims, budget: s2.texBudget, hud: hud}));
    check('frame: a real Endless draw() textures the chest and the obelisk in the opaque phase (texPropFaces, texPropDraws 2, texPrims within the 2048 budget) with no console errors',
      s2.texPropFaces > 0 && s2.texPropPrims > 0 && s2.texPropDraws === 2 && s2.texPrims <= 2048 && s2.texBudget === 2048 && !s2.texFailedDraws &&
      H.errors.length === 0 && hud.indexOf('TEX ' + s2.texPrims + '/2048') > 0, {stats: s2, hud: hud, errors: H.errors.slice(0, 3)});
    features({propTextures: false});
  }

  // ── lab smoke: render-lab/45-prop-textures.js on a real Endless window ──
  if (section('lab')) {
    (0, eval)(slurp('tools/game/render-lab/00-core.js'));
    (0, eval)(slurp('tools/game/render-lab/45-prop-textures.js'));
    H.startEndless(4242);
    G.applyRenderPreset('recommended');
    freshCatalog();
    var own = G.treasureChests, snap = JSON.stringify(G.renderFeatureSnapshot());
    var wrappers = {draw: G.drawWorldModel, clip: G.withSceneDepthClip, now: Date.now, random: Math.random};
    var results = ['near', 'far'].map(function (view) {
      G.RenderLabPropTextures.band(view);
      // Forward distance along the view (the band's nominal distances).
      var chests = G.treasureChests.map(function (c) { return Math.round((c.x - G.pos.x) * Math.cos(G.cam.ang) + (c.y - G.pos.y) * Math.sin(G.cam.ang)); });
      var r = G.RenderLabPropTextures.ab();
      return {view: view, chests: chests, r: r};
    });
    G.RenderLabPropTextures.restore();
    results.forEach(function (x) { out('NOTE lab ' + x.view + ' ' + x.chests.join('/') + ': ' + x.r.text); });
    check('lab: band() fans three chests at 25-40 and 55-90 units; ab() finds them textured (P3) with identical depth (P2), reports the pixel checks as SKIP on this host (no readback), and restores switches, wrappers, clocks and chests',
      results.every(function (x) { return x.chests.length === 3 && x.r.P2.status === 'PASS' && x.r.P3.status === 'PASS' && x.r.P1.status === 'SKIP' &&
        x.r.luma.status === 'SKIP' && x.r.status === 'PARTIAL'; }) &&
      results[0].chests.join() === '25,30,40' && results[1].chests.join() === '55,70,90' &&
      JSON.stringify(G.renderFeatureSnapshot()) === snap && G.drawWorldModel === wrappers.draw && G.withSceneDepthClip === wrappers.clip &&
      Date.now === wrappers.now && Math.random === wrappers.random && G.treasureChests === own && H.errors.length === 0,
      results.map(function (x) { return {view: x.view, chests: x.chests, text: x.r.text}; }));
    var cfg = G.RenderLabPropTextures.CONFIGS;
    check('lab: the timing configurations are Recommended with propTextures off (A) and on (B)',
      cfg.off.preset === 'recommended' && cfg.off.features.propTextures === false && cfg.on.preset === 'recommended' && cfg.on.features.propTextures === true, cfg);
  }

  out('PROP_TEXTURES_RESULT ' + (failed ? 'FAIL ' + failed + '/' : 'PASS ') + checked + ' failed ' + failed);
}());
undefined;
