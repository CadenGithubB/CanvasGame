// Structure textures in production (integration stages E1 and E2,
// src/12-world-textures.js with its sink in 12-structure-models.js). Real MAIN
// manifest through render_host.js on the real fortress window of seed 31337.
// E1 shipped structureTextures OFF; E2 registers the texture parameters, the
// Texture debug path tint and the HUD counters, and ships the feature ON in
// Recommended. Each section still switches it explicitly (texOn).
// Oracles are independent of the texture pass:
// - the scene-depth masks themselves: a wrapper on withSceneDepthClip records
//   every mask (pixel set, visible count, options) and the final _sceneDepthInv,
//   compared with the textures-off frame;
// - the recorded 2D-context stream, interpreted for save/restore, paths and
//   clips (which rect-only clip equals which face mask as a pixel set) and for
//   pattern fills (fillStyle is a createPattern token);
// - spies on the mapper entry points (drawPlanarFace, tessellate) that observe
//   the calls actually made, and the face geometry (horizontality from the
//   vertices' z, distance from the centroid) instead of the pass's own flags;
// - pinned hashes of the flat-model (structureTextures OFF) and Legacy frames,
//   recorded on the Stage D tree before E1 edited any source. Since stage F2
//   the flat-model frames also switch wallPropModels OFF (it became default
//   ON): they pin the structure-model path, and the wall-prop models have
//   their own driver (wall_decor_driver.js). Since stage G2 they also switch
//   chestModel and landmarkOpaqueEarly OFF (both became default ON; the
//   chest has chest_model.js and the pass order pass_order.js).
// Material pixels: the host's getImageData returns alpha 0 (like the headless
// audit lab, which therefore never exercises the textured path: the catalog
// build fails and every frame stays flat). Sections that need a catalog give
// new canvases an opaque deterministic getImageData/putImageData store.
// Not a rasterizer: commands and pixel sets, not browser pixels.
// Mutations (evaluated copies; each anchor must match exactly once):
//   --clip-bias-zero     the textured sink's clip uses the study's depthBias 0
//   --skip-mask-clip     the textured sink does not clip to the face mask
//   --ignore-debug-poly  the engage rules ignore DEBUG_POLY_TYPES
//   --far-first          the model pass paints (and so admits) far to near
//   --no-fade            the fade band is ignored (texture to viewDist)
//   --strips-everywhere  hybrid offers every face to the planar mapper
//   --no-restore-guard   no restore-to-sentinel after a mapper exception
//   --no-luma-norm       the light is not luma-normalised to the authored colour
//   --ignore-registry    the pass ignores the registered texture parameters
//   --tint-one-colour    Texture debug tints every textured face as a triangle face
//   --hud-no-counters    the HUD render line drops the f/m counters
// Reference (not a mutation): --window-relative-variant restores the pre-F1
// wall-decoration variant key; the parity hashes must then equal the Stage D pins.
// Narrowing: --sections a,b (load, mapping, parity, coverage, containment,
// engage, budget, fade, strips, colour, failure, determinism, catalog,
// registry, debug, hud, lab).
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
  var TEX = 'src/12-world-textures.js', MODELS = 'src/12-structure-models.js', CONFIG = 'src/01-config-state.js';
  var loaded = H.loadManifest(function (path, source) {
    if (path === 'src/07-decorations-lighting.js') {
      source = swap(source, '--window-relative-variant',
        "  if (Number.isFinite(dec.worldX) && Number.isFinite(dec.worldY) && typeof cell === 'number' && cell > 0) {\n", '  if (false) {\n');
    }
    if (path === CONFIG) {
      source = swap(source, '--hud-no-counters', "    line += ' f' + (s.texFaces || 0) + ' m' + (s.texMean || 0) + (s.texFailedDraws > 0 ? ' x' + s.texFailedDraws : '');\n", '');
    }
    if (path === TEX) {
      source = swap(source, '--ignore-registry', "  if (typeof RENDER_FEATURES === 'object' && RENDER_FEATURES && Object.prototype.hasOwnProperty.call(RENDER_FEATURES, key)) return RENDER_FEATURES[key];\n", '');
      source = swap(source, '--tint-one-colour', "_worldTextureDebugTint(stats, handled ? 'strip' : 'triangle', gen, minY, maxY);", "_worldTextureDebugTint(stats, 'triangle', gen, minY, maxY);");
      source = swap(source, '--clip-bias-zero', 'var _WORLD_TEXTURE_CLIP = {writeDepth: true, _paintsDepthPixels: true};',
        'var _WORLD_TEXTURE_CLIP = {writeDepth: true, _paintsDepthPixels: true, depthBias: 0};');
      source = swap(source, '--skip-mask-clip', '    _traceSceneDepthPixelMask(gen, minY, maxY); ctx.clip(); stats.clips++;\n',
        '    stats.clips++;\n');
      source = swap(source, '--ignore-debug-poly', "  if ((typeof DEBUG_POLY_TYPES !== 'undefined' && DEBUG_POLY_TYPES) ||\n",
        "  if (false ||\n");
      source = swap(source, '--no-fade', '  if (dist >= pass.fadeEnd) return _worldTextureMean(stats, key, meanStyle, gen, minY, maxY, \'fade\');\n', '');
      source = swap(source, '--strips-everywhere', "  var planar = pass.mapping === 'planar' || (pass.mapping === 'hybrid' && surface.horizontal);\n",
        "  var planar = pass.mapping !== 'triangles';\n");
      source = swap(source, '--no-luma-norm', ', norm = lumaW > 0 ? lumaA / lumaW : 0;', ', norm = 1;');
      source = swap(source, '--no-restore-guard', '    for (var guard = 0; guard < 32 && ctx.lineDashOffset !== dash; guard++) ctx.restore();\n', '');
    }
    if (path === MODELS) {
      source = swap(source, '--far-first', 'function _structureModelNearFirst(a, b) { return a.dist - b.dist; }',
        'function _structureModelNearFirst(a, b) { return b.dist - a.dist; }');
    }
    return source;
  });
  var hasTex = typeof G.fillSceneDepthTexturedPolygon === 'function';
  if (section('load')) {
    check('load: the real manifest loads with the world texture pass and no console errors',
      loaded > 40 && hasTex && typeof G.ensureWorldTextureCatalog === 'function' && H.errors.length === 0,
      {loaded: loaded, hasTex: hasTex, errors: H.errors.slice(0, 3)});
    var manifest = JSON.parse(slurp('assets/games/manifest.json')).parts.MAIN;
    check('load: 12-world-textures.js sits after 12-texture-mapping.js and before the model fragments',
      manifest.indexOf(TEX) === manifest.indexOf('src/12-texture-mapping.js') + 1 &&
      manifest.indexOf(TEX) < manifest.indexOf('src/12-prop-models.js') && manifest.indexOf(TEX) < manifest.indexOf(MODELS),
      manifest.slice(20, 30));
    var rec = G.renderFeaturePreset('recommended'), leg = G.renderFeaturePreset('legacy');
    // Restated in Stage E2: E1 registered structureTextures OFF (checked here
    // as OFF in both presets). E2 ships it ON in Recommended; Legacy stays OFF,
    // and the pinned flat-model and Legacy recordings below cover the old path.
    check('load: structureTextures is ON in Recommended (stage E2 default) and OFF in Legacy; the page starts in Recommended',
      rec.structureTextures === true && leg.structureTextures === false && G.RENDER_FEATURES.structureTextures === true &&
      G.renderPresetName() === 'recommended',
      {recommended: rec.structureTextures, legacy: leg.structureTextures, live: G.RENDER_FEATURES.structureTextures, preset: G.renderPresetName()});
    var D = G.WORLD_TEXTURE_DEFAULTS;
    check('load: WORLD_TEXTURE_DEFAULTS are the study optimum (hybrid, 128, owned, stable, 384/256, {256,10,0.4}, 2048, 360, 0.32, 64/48)',
      Object.isFrozen(D) && D.mapping === 'hybrid' && D.tile === 128 && D.ownedPixels === true && D.filter === 'stable' &&
      D.maxStrips === 384 && D.maxTriangles === 256 && D.tessellation === G.TexturePilot.STRUCTURE_TESSELLATION &&
      D.budget === 2048 && D.maxRows === 360 && D.wash === 0.32 && D.minOwnedPx === 64 && D.leaveOwnedPx === 48 &&
      D.fadeStart === 0.72 && D.fadeEnd === 0.82, D);
    // The brief's toggle list, written out independently of the source.
    var wantDefs = {
      textureMapping: {type: 'enum', values: ['hybrid', 'triangles', 'planar'], def: 'hybrid', legacy: 'hybrid'},
      textureTile: {type: 'enum', values: [128, 64], def: 128, legacy: 128},
      textureOwnedEdges: {type: 'bool', values: [false, true], def: true, legacy: false},
      textureBudget: {type: 'enum', values: [2048, 4096, 8192], def: 2048, legacy: 2048},
      textureMaxRows: {type: 'enum', values: [360, 540, 720, 'unlimited'], def: 360, legacy: 360},
      textureMinPixels: {type: 'enum', values: [64, 0], def: 64, legacy: 64}};
    var defsByKey = {}; G.RENDER_FEATURE_DEFS.forEach(function (d) { defsByKey[d.key] = d; });
    var wrongDefs = Object.keys(wantDefs).filter(function (k) {
      var d = defsByKey[k], w = wantDefs[k];
      return !d || d.type !== w.type || JSON.stringify(d.values) !== JSON.stringify(w.values) || d.default !== w.def || d.legacy !== w.legacy ||
        G.RENDER_FEATURES[k] !== w.def;
    });
    check('load: the texture parameters are registered (mapping hybrid/triangles/planar, tile 128/64, owned edges, budget 2048/4096/8192, max rows 360/540/720/unlimited, min pixels 64/0) with the study defaults, which equal WORLD_TEXTURE_DEFAULTS',
      wrongDefs.length === 0 && rec.textureMapping === D.mapping && rec.textureTile === D.tile && rec.textureOwnedEdges === D.ownedPixels &&
      rec.textureBudget === D.budget && rec.textureMaxRows === D.maxRows && rec.textureMinPixels === D.minOwnedPx,
      {wrong: wrongDefs.map(function (k) { return [k, defsByKey[k] && {type: defsByKey[k].type, values: defsByKey[k].values, def: defsByKey[k].default, legacy: defsByKey[k].legacy}]; })});
    var fsDefault = G.fullscreenCanvasSize(1920, 1080, 0.75, G.settings.fullscreenRows);
    check('load: settings.fullscreenRows defaults to 360 with Native still selectable, so a 1920x1080 fullscreen at 0.75 is 640x360 (within textureMaxRows)',
      G.settings.fullscreenRows === 360 && G.FULLSCREEN_ROW_CHOICES.indexOf('native') >= 0 && G.FULLSCREEN_ROW_CHOICES.indexOf(360) >= 0 &&
      fsDefault.width === 640 && fsDefault.height === 360 && fsDefault.height <= D.maxRows,
      {rows: G.settings.fullscreenRows, choices: G.FULLSCREEN_ROW_CHOICES, size: fsDefault});
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

  // ── Fixture: the seed-31337 fortress and camera poses around it ──
  var CELL = G.cell, st = null, poses = [];
  function floorH(x, y) { return G.floorMesh ? G.getFloorHeightAt(x, y) : 0; }
  function setCamera(x, y, ang) {
    G.cam.x = x; G.cam.y = y; G.cam.ang = ang; G.cam.pitch = 0; G.cam.z = 60 + 40 * floorH(x, y);
    G.pos.x = x; G.pos.y = y;
  }
  function solid(x, y) { var gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
    return gx < 0 || gy < 0 || gx >= G.gridW || gy >= G.gridH || !!G.grid[gy * G.gridW + gx]; }
  function drawFrame(keep) {
    G._lightGridFrameCount = 1; G._presentationRandomState = 1234567; H.clock.seed = 0x0badcafe;
    H.record(true, keep !== false);
    G.draw();
    return H.record(false);
  }
  function features(values) { if (typeof G.setRenderFeatures === 'function') G.setRenderFeatures(values); }
  function texOn(on) { if (hasTex) features({structureTextures: on}); }
  // Restated at the stage L flip (propTextures ON in Recommended since then):
  // the mask-log containment check, the catalog-retry check and the debug
  // section check the structure pass alone (the mask log covers
  // drawStructureModels3D only; the counters, the sink spy and the off->on
  // retry listener are shared with the prop pass), so they switch
  // propTextures OFF and back ON. Prop faces are prop_textures.js's.
  var hasPropTex = (G.RENDER_FEATURE_DEFS || []).some(function (d) { return d.key === 'propTextures'; });
  function propsOn(on) { if (hasPropTex) features({propTextures: on}); }
  function pose(p) { setCamera(p.x, p.y, p.ang); if (p.z !== undefined) { G.cam.z = p.z; G.cam.pitch = p.pitch; } }
  function setupFortress() {
    H.startEndless(31337);
    var landed = G.goToNearestLandmark({type: 'fortress'});
    if (!landed || !landed.ok) { out('SETUP_FAILURE no fortress on seed 31337'); throw Error('SETUP_FAILURE'); }
    G.applyRenderPreset('recommended');
    G.buildStructureModels();
    st = G.largeStructures.filter(function (s) { return s.type === 'fortress' && Math.hypot(s.x - G.pos.x, s.y - G.pos.y) < 1400; })[0];
    if (!st || !G.structureModelsCurrent()) { out('SETUP_FAILURE fortress model on seed 31337'); throw Error('SETUP_FAILURE'); }
    G.resetRenderInterpolation(); G.updateDayNight(0); G.updateLightGrid();
    // Deterministic poses looking at the fortress centre: the first free cell
    // on each ray. exterior 1150 u out, near 820 u out, inside 250 u out.
    [['exterior', 1150, [0.66, 1.4, 2.2, 3.0]], ['near', 820, [2.4, 3.3, 4.1, 5.0]], ['inside', 250, [0.3, 1.2, 2.0, 2.8, 3.7, 4.6, 5.5]]]
      .forEach(function (spec) {
        for (var k = 0; k < spec[2].length; k++) {
          var a = spec[2][k], x = st.x - Math.cos(a) * spec[1], y = st.y - Math.sin(a) * spec[1];
          if (!solid(x, y)) { poses.push({tag: spec[0], x: x, y: y, ang: a}); return; }
        }
      });
    // An elevated pose (the study's roof view) shows wall tops, the only
    // horizontal faces: cameraZ 60 + (z - 60) * 25 / 40 = 300, looking down.
    var high = [1.4, 2.4, 0.3, 3.3].map(function (a) { return {tag: 'high', x: st.x - Math.cos(a) * 900, y: st.y - Math.sin(a) * 900, ang: a, z: 444, pitch: 0.35}; })
      .filter(function (p) { return !solid(p.x, p.y); })[0];
    if (high) poses.push(high);
    out('NOTE fixture seed 31337 fortress at ' + st.x + ',' + st.y + ' poses ' +
      JSON.stringify(poses.map(function (p) { return p.tag + '@' + p.ang; })));
    if (poses.length !== 4) { out('SETUP_FAILURE poses'); throw Error('SETUP_FAILURE'); }
  }
  setupFortress();
  function poseOf(tag) { return poses.filter(function (p) { return p.tag === tag; })[0]; }

  // ── Stage spans and ctx id ──
  var ctxId = (function () { H.record(true, true); G.ctx.__probe(); var r = H.record(false); return /^(c\d+)\./.exec(r.all[0])[1]; })();
  var inModels = false, modelDateCalls = 0, modelRandom = 0;
  var realModels = G.drawStructureModels3D;
  G.drawStructureModels3D = function () {
    G.ctx.__stage('models'); inModels = true; var r0 = H.clock.randomCalls;
    try { return realModels.apply(this, arguments); } finally { inModels = false; modelRandom += H.clock.randomCalls - r0; G.ctx.__stage(''); }
  };
  var realDateNow = Date.now;
  Date.now = function () { if (inModels) modelDateCalls++; return realDateNow(); };

  // ── Scene-depth mask log: every withSceneDepthClip call inside the model pass ──
  var realClip = G.withSceneDepthClip, maskLog = null, currentMask = null;
  function snapshotMask() {
    var gen = G._sceneDepthClipGeneration, W = G._sceneDepthW, list = [];
    for (var y = G._sceneDepthClipMinY; y <= G._sceneDepthClipMaxY; y++) {
      if (G._sceneDepthClipRowMarks[y] !== gen) continue;
      for (var x = G._sceneDepthClipRowMin[y]; x <= G._sceneDepthClipRowMax[y]; x++) if (G._sceneDepthClipMarks[y * W + x] === gen) list.push(y * W + x);
    }
    return list;
  }
  function hashList(list) {
    var h = 0x811c9dc5;
    for (var i = 0; i < list.length; i++) h = Math.imul(h ^ list[i], 0x01000193) >>> 0;
    return (h >>> 0).toString(16) + ':' + list.length;
  }
  G.withSceneDepthClip = function (points, cb, options) {
    if (!inModels) return realClip.apply(null, arguments);
    var entry = {pixels: null, called: false, bias: options && options.depthBias, write: !!(options && options.writeDepth),
      paints: !!(options && options._paintsDepthPixels), extra: !!(options && options.extraPolygons)};
    var r = realClip(points, function () {
      entry.called = true; entry.pixels = snapshotMask(); currentMask = entry.pixels;
      G.ctx.__mark('face', maskLog ? maskLog.length : -1);
      try { return cb.apply(this, arguments); } finally { currentMask = null; G.ctx.__mark('end', 0); }
    }, options);
    entry.visible = r;
    if (maskLog) maskLog.push(entry);
    return r;
  };
  function depthHash() {
    var inv = G._sceneDepthInv, h = 0x811c9dc5;
    for (var i = 0; i < inv.length; i++) { var v = Math.round(inv[i] * 1e7); h = Math.imul(h ^ v, 0x01000193) >>> 0; }
    return (h >>> 0).toString(16);
  }
  function maskFrame() {
    maskLog = [];
    var rec = drawFrame(true), log = maskLog; maskLog = null;
    return {rec: rec, log: log, depth: depthHash(),
      seq: log.map(function (e) { return (e.pixels ? hashList(e.pixels) : '-') + '/' + e.visible + '/' + e.bias + '/' + e.write + e.paints + e.extra; })};
  }

  // ── Stream interpreter: pattern fills, clips equal to the current face mask ──
  // Returns per-face (between __mark("face",n) and __mark("end")) records.
  function interpret(entries) {
    var faces = [], face = null, path = [], clips = [], stack = [], fill = '', alpha = 1, op = 'source-over';
    var saves = 0, minDepth = 0, masks = {}, maskIndex = -1;
    function pixelsOfRects(rects) {
      var W = G.canvas.width, Hh = G.canvas.height, set = {};
      rects.forEach(function (r) {
        var x0 = Math.max(0, Math.ceil(r[0] - 0.5)), x1 = Math.min(W - 1, Math.ceil(r[0] + r[2] - 0.5) - 1);
        var y0 = Math.max(0, Math.ceil(r[1] - 0.5)), y1 = Math.min(Hh - 1, Math.ceil(r[1] + r[3] - 0.5) - 1);
        for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) set[y * W + x] = 1;
      });
      return set;
    }
    // The current path is rects only and covers exactly the current face's mask.
    function pathEqualsFaceMask() {
      var rectsOnly = path.length && path.every(function (e) { return e.t === 'rect'; });
      if (!(rectsOnly && face && currentMaskFor(face.index))) return false;
      var set = pixelsOfRects(path.map(function (e) { return e.r; })), want = currentMaskFor(face.index), n = 0;
      for (var k in set) n++;
      return n === want.length && want.every(function (i) { return set[i] === 1; });
    }
    entries.forEach(function (text) {
      var m = /^(c\d+)\.([A-Za-z_]+)(=(.*)|\((.*)\))$/.exec(text);
      if (!m || m[1] !== ctxId) return;
      var name = m[2], value = m[4], args = m[5] !== undefined ? (m[5] === '' ? [] : m[5].split(',')) : null;
      if (name === '__mark') {
        if (args[0] === '"face"') { face = {index: +args[1], patternFills: 0, maskClipped: 0, unclipped: 0, fills: [], saves: saves, baseAlpha: alpha};
          faces.push(face); maskIndex = +args[1]; }
        else { if (face) face.balanced = saves === face.saves; face = null; maskIndex = -1; }
        return;
      }
      if (value !== undefined) {
        if (name === 'fillStyle') fill = value;
        else if (name === 'globalAlpha') alpha = +value;
        else if (name === 'globalCompositeOperation') op = JSON.parse(value);
        return;
      }
      if (name === 'save') { stack.push({clips: clips.slice(), fill: fill, alpha: alpha, op: op}); saves++; }
      else if (name === 'restore') { var s = stack.pop(); saves--; if (saves < minDepth) minDepth = saves; if (s) { clips = s.clips; fill = s.fill; alpha = s.alpha; op = s.op; } }
      else if (name === 'beginPath') path = [];
      else if (name === 'rect') path.push({t: 'rect', r: args.map(Number)});
      else if (name === 'moveTo' || name === 'lineTo') path.push({t: 'line'});
      else if (name === 'clip') {
        clips = clips.concat([{equalsMask: pathEqualsFaceMask()}]);
      } else if (name === 'fillRect' || name === 'fill') {
        var pattern = /^pat#/.test(fill);
        if (face) {
          var fillRecord = {pattern: pattern, fill: fill, alpha: alpha, op: op, rect: name === 'fillRect'};
          if (name === 'fill' && maskPathFills && maskPathFills(fill)) fillRecord.pathIsMask = pathEqualsFaceMask();
          face.fills.push(fillRecord);
          if (pattern) {
            face.patternFills++;
            if (clips.some(function (c) { return c.equalsMask; })) face.maskClipped++; else face.unclipped++;
          }
        }
      }
    });
    return {faces: faces, saves: saves, minDepth: minDepth};
  }
  var maskByIndex = null, maskPathFills = null; // maskPathFills(fillStyle): record pathIsMask for that fill()
  function currentMaskFor(index) { return maskByIndex && maskByIndex[index] ? maskByIndex[index].pixels : null; }
  function analyse(frame) { maskByIndex = frame.log; var r = interpret(frame.rec.all); maskByIndex = null; return r; }

  // ── Catalog helpers ──
  function freshCatalog() { G.resetWorldTextureCatalog(); return withOpaque(function () { return G.ensureWorldTextureCatalog(128); }); }
  function stats() { return G._renderFrameStats; }
  function sumPatternFills(a) { return a.faces.reduce(function (s, f) { return s + f.patternFills; }, 0); }
  function withOverride(values, fn) { var was = G._worldTextureOverride; G._worldTextureOverride = values; try { return fn(); } finally { G._worldTextureOverride = was; } }

  // ── Sink spy: per-face surface and pass counters around each call ──
  var sinkLog = null, realSink = G.fillSceneDepthTexturedPolygon, currentSurface = null;
  if (hasTex) G.fillSceneDepthTexturedPolygon = function (points, surface) {
    var s = G._worldTexturePass.stats, before = {faces: s.faces, budget: s.meanBudget, small: s.meanSmall, fade: s.meanFade,
      decline: s.meanDecline, failed: s.meanFailed, strips: s.strips, triangles: s.triangles, fills: G._worldTexturePass.mapperStats.patternFills || 0};
    var v = surface.vertices, horizontal = v.every(function (p) { return Math.abs(p.z - v[0].z) < 1e-9; });
    var cx = 0, cy = 0; v.forEach(function (p) { cx += p.x; cy += p.y; }); cx /= v.length; cy /= v.length;
    var dist = Math.abs((cx - G.cam.x) * Math.cos(G.cam.ang) + (cy - G.cam.y) * Math.sin(G.cam.ang));
    var entry = {horizontal: horizontal, dist: dist, passDist: surface.dist, planarCalls: 0, strips: 0, mask: maskLog ? maskLog.length : -1,
      material: surface.material};
    currentSurface = entry;
    var r;
    try { r = realSink.apply(null, arguments); } finally { currentSurface = null; }
    entry.visible = r;
    ['faces', 'budget', 'small', 'fade', 'decline', 'failed'].forEach(function (k) {
      var now = {faces: s.faces, budget: s.meanBudget, small: s.meanSmall, fade: s.meanFade, decline: s.meanDecline, failed: s.meanFailed}[k];
      if (now > before[k]) entry.outcome = k === 'faces' ? 'textured' : k;
    });
    entry.prims = s.strips + s.triangles - before.strips - before.triangles;
    entry.patternFills = (G._worldTexturePass.mapperStats.patternFills || 0) - before.fills;
    if (sinkLog) sinkLog.push(entry);
    return r;
  };
  if (hasTex) {
    var realPlanar = G.TexturePilot.drawPlanarFace;
    G.TexturePilot.drawPlanarFace = function () {
      var r = realPlanar.apply(this, arguments);
      if (currentSurface) { currentSurface.planarCalls++; if (r && r.handled) currentSurface.strips += r.strips; }
      return r;
    };
  }
  function sinkFrame() { sinkLog = []; var f = maskFrame(); f.sink = sinkLog; sinkLog = null; return f; }

  // ── mapping: texture catalog <-> GAME_MATERIALS ──
  if (section('mapping') && hasTex) {
    var table = G.WORLD_TEXTURE_MATERIALS, catalog = freshCatalog(), faceMaterials = {stone: 1, wood: 1, cloth: 1};
    var stale = Object.keys(table).filter(function (id) { return !G.GAME_MATERIALS[id] && !faceMaterials[id]; });
    check('mapping: every table key is a GAME_MATERIALS id or a structure face material (no stale ids)', stale.length === 0, stale);
    var bad = Object.keys(table).filter(function (id) { var v = table[id]; return v !== null && !(catalog && catalog.materials[v] && v !== 'checker'); });
    check('mapping: every mapped value is a catalog material (stone, wood, iron), never the diagnostic checker',
      !!catalog && bad.length === 0 && Object.keys(catalog.materials).indexOf('checker') >= 0, {bad: bad});
    // Independent naming oracle: *Stone -> stone, *Wood -> wood, *Iron -> iron, anything else untextured.
    var wrong = Object.keys(G.GAME_MATERIALS).filter(function (id) {
      var want = /Stone$/.test(id) ? 'stone' : /Wood$/.test(id) ? 'wood' : /Iron$/.test(id) ? 'iron' : null;
      return G.worldTextureMaterialName(id) !== want;
    });
    check('mapping: every GAME_MATERIALS id resolves by its material family (Stone/Wood/Iron, others flat)', wrong.length === 0,
      wrong.map(function (id) { return id + '->' + G.worldTextureMaterialName(id); }));
    var models = G.structureModels, used = {};
    models.forEach(function (m) { m.faces.forEach(function (f) { used[f.material] = G.worldTextureMaterialName(f.material); }); });
    check('mapping: structure faces use stone and wood textures; cloth stays flat', used.stone === 'stone' && used.wood === 'wood' &&
      used.cloth === null && G.worldTextureMaterialName('noSuchMaterial') === null, used);
  }

  // ── parity: pinned flat-model and Legacy recordings ──
  var FLAT_OFF = {wallPropModels: false, chestModel: false, landmarkOpaqueEarly: false, spawnerModel: false, floorPropModels: false};
  if (section('parity')) {
    ['exterior', 'near', 'inside'].forEach(function (tag) {
      pose(poseOf(tag));
      // Restated in F2: the flat frame keeps wallPropModels OFF (default ON
      // since F2), so it records the same stream as before the flip.
      // Restated in G2: likewise chestModel and landmarkOpaqueEarly (default
      // ON since G2); with every model family off, sceneEntities' opaque
      // phase is empty and the frame keeps the pre-G2 order.
      // Restated in H: likewise spawnerModel (default ON since H).
      // Restated in I2: likewise floorPropModels (default ON since I2).
      G.applyRenderPreset('recommended'); texOn(false); features(FLAT_OFF);
      var flat = drawFrame(false).hash();
      out('HASH flat ' + tag + ' ' + flat);
      G.applyRenderPreset('legacy');
      out('HASH legacy ' + tag + ' ' + drawFrame(false).hash());
      G.applyRenderPreset('recommended'); features(FLAT_OFF);
      if (hasTex) {
        // Engaged-off frames with the feature on: the master switch off stops
        // before any context call, so the stream equals the flat model's.
        features({structureTextures: true}); G.USE_TEXTURES = false;
        var master = drawFrame(false).hash(), reason = stats().texFlatMaster;
        G.USE_TEXTURES = true; texOn(false);
        check('parity: ' + tag + ': feature on with the texture master off records the flat-model stream exactly (flat reason counted)',
          master === flat && reason === 1, {master: master, flat: flat, reason: reason});
        // Headless (getImageData alpha 0): the first engaged frame's build
        // fails once; every later frame records the flat-model stream exactly.
        G.resetWorldTextureCatalog(); features({structureTextures: true});
        drawFrame(false);
        var failedFlat = drawFrame(false).hash(), why = stats().texFlatCatalog, tries = G.getWorldTextureState().catalogFailures;
        texOn(false);
        check('parity: ' + tag + ': with no catalog (headless alpha 0), frames after the one failed build record the flat-model stream exactly',
          failedFlat === flat && why === 1 && tries === 1, {hash: failedFlat, flat: flat, reason: why, failures: tries});
      }
    });
    G.applyRenderPreset('recommended');   // F2/G2: later sections start from Recommended again (model switches ON)
  }
  if (!hasTex) { out('WORLD_TEXTURES_RESULT ' + (failed ? 'FAIL' : 'PASS') + ' ' + checked + ' failed ' + failed); return; }

  // ── coverage: masks and depth identical with textures on and off ──
  if (section('coverage')) {
    freshCatalog();
    poses.forEach(function (p) {
      pose(p);
      texOn(false); var off = maskFrame();
      texOn(true); var on = maskFrame(), s = stats();
      texOn(false);
      var firstDiff = -1;
      for (var i = 0; i < Math.max(off.seq.length, on.seq.length); i++) if (off.seq[i] !== on.seq[i]) { firstDiff = i; break; }
      var pixDiff = 0; for (var q = 0; q < Math.min(off.seq.length, on.seq.length); q++) if (off.seq[q].split('/').slice(0, 2).join() !== on.seq[q].split('/').slice(0, 2).join()) pixDiff++;
      check('coverage: ' + p.tag + ': the model pass makes the same withSceneDepthClip masks (pixels, count, options) and the same final _sceneDepthInv with textures on and off',
        on.seq.length === off.seq.length && firstDiff < 0 && pixDiff === 0 && on.depth === off.depth && (s.texFaces || 0) > 0,
        {clips: [off.seq.length, on.seq.length], firstDiff: firstDiff, maskPixelDiffs: pixDiff, at: firstDiff >= 0 ? [off.seq[firstDiff], on.seq[firstDiff]] : null,
          depth: [off.depth, on.depth], textured: s.texFaces});
    });
  }

  // ── containment: every pattern fill is under a clip equal to its face mask ──
  if (section('containment')) {
    freshCatalog(); propsOn(false);
    poses.forEach(function (p) {
      pose(p); texOn(true);
      var frame = maskFrame(), a = analyse(frame), s = stats();
      texOn(false);
      var fills = sumPatternFills(a), bad = a.faces.filter(function (f) { return f.unclipped > 0; });
      var outside = 0; a.faces.forEach(function (f) { if (f.index < 0) outside += f.patternFills; });
      check('containment: ' + p.tag + ': every pattern fill is issued under a clip whose rects equal that face\'s scene-depth mask',
        fills > 0 && bad.length === 0 && outside === 0 && fills === s.texPatternFills,
        {fills: fills, counted: s.texPatternFills, unclipped: bad.slice(0, 3).map(function (f) { return {i: f.index, n: f.unclipped}; })});
    });
    // Pattern fills never occur outside a structure face span. Restated after
    // the stage L flip (it read "props ON: theirs too"): the wrapper marks face
    // spans only inside drawStructureModels3D, so this covers the structure
    // pass only. It still runs with propTextures ON (the default) over the
    // whole frame, so any pattern fill outside a structure face span counts
    // as stray, but this pose textures no prop face (texPropFaces in the
    // NOTE); prop containment is prop_textures.js's.
    propsOn(true);
    pose(poseOf('exterior')); texOn(true);
    var rec = drawFrame(true), spans = 0, stray = 0, inFace = false, fillStyle = '', spanStats = stats();
    var propFaces = spanStats.texPropFaces || 0, structureFills = spanStats.texPatternFills || 0;
    rec.all.forEach(function (t) {
      if (t.indexOf(ctxId + '.__mark("face"') === 0) { inFace = true; spans++; return; }
      if (t.indexOf(ctxId + '.__mark("end"') === 0) { inFace = false; return; }
      var m = /^c\d+\.fillStyle=(.*)$/.exec(t); if (m && t.indexOf(ctxId + '.') === 0) fillStyle = m[1];
      if (!inFace && t.indexOf(ctxId + '.fill') === 0 && /^pat#/.test(fillStyle) && /\.(fill|fillRect)\(/.test(t)) stray++;
    });
    texOn(false);
    out('NOTE containment exterior frame: ' + spans + ' structure face spans, texPatternFills ' + structureFills + ', texPropFaces ' + propFaces);
    check('containment: structure pass: no pattern fill on the game canvas outside a structure-model scene-depth face callback (the wrapper marks drawStructureModels3D only)',
      spans > 0 && stray === 0, {spans: spans, stray: stray, propFaces: propFaces});
  }

  // ── engage: each disengage condition gives zero pattern fills, reason counted ──
  if (section('engage')) {
    freshCatalog();
    pose(poseOf('exterior'));
    function engaged(label, setup, teardown, reasonKey) {
      texOn(true); setup();
      var frame, s;
      try { frame = maskFrame(); s = JSON.parse(JSON.stringify(stats())); } finally { teardown(); texOn(false); }
      var fills = sumPatternFills(analyse(frame));
      return {label: label, fills: fills, reason: reasonKey ? s[reasonKey] : undefined, flat: s.texFlat, textured: s.texFaces || 0};
    }
    var control = engaged('control', function () {}, function () {}, null);
    check('engage: positive control: identity transform, source-over, 240 rows, no debug palette -> textured with pattern fills',
      control.fills > 0 && control.textured > 0 && !control.flat, control);
    var W0 = G.canvas.width, H0 = G.canvas.height;
    var rows = engaged('rows 361', function () { G.canvas.width = 540; G.canvas.height = 361; }, function () { G.canvas.width = W0; G.canvas.height = H0; }, 'texFlatRows');
    var rows360 = engaged('rows 360', function () { G.canvas.width = 540; G.canvas.height = 360; }, function () { G.canvas.width = W0; G.canvas.height = H0; }, null);
    check('engage: 361 canvas rows (over textureMaxRows 360) -> zero pattern fills, reason rows counted; 360 rows still textures',
      rows.fills === 0 && rows.reason === 1 && rows.flat === 1 && rows360.fills > 0, [rows, rows360]);
    var realTransform = G.ctx.getTransform;
    var transform = engaged('transform', function () { G.ctx.getTransform = function () { return {a: 2, b: 0, c: 0, d: 2, e: 0, f: 0}; }; },
      function () { G.ctx.getTransform = realTransform; }, 'texFlatTransform');
    check('engage: a non-identity transform -> zero pattern fills, reason transform counted', transform.fills === 0 && transform.reason === 1, transform);
    var missing = engaged('no getTransform', function () { G.ctx.getTransform = undefined; },
      function () { G.ctx.getTransform = realTransform; }, 'texFlatTransform');
    check('engage: a context without getTransform -> zero pattern fills, reason transform counted', missing.fills === 0 && missing.reason === 1, missing);
    [['DEBUG_POLY_TYPES', 'texFlatDebug'], ['DEBUG_CAVE_COLORS', 'texFlatDebug'], ['DEBUG_LAYER_TYPES', 'texFlatDebug']].forEach(function (d) {
      var r = engaged(d[0], function () { G[d[0]] = true; }, function () { G[d[0]] = false; }, d[1]);
      check('engage: ' + d[0] + ' -> zero pattern fills, reason debug counted', r.fills === 0 && r.reason === 1, r);
    });
    var master = engaged('USE_TEXTURES false', function () { G.USE_TEXTURES = false; }, function () { G.USE_TEXTURES = true; }, 'texFlatMaster');
    check('engage: USE_TEXTURES false (Toggle Textures) -> zero pattern fills, reason master counted', master.fills === 0 && master.reason === 1, master);
    var composite = engaged('composite', function () { G.ctx.globalCompositeOperation = 'multiply'; }, function () { G.ctx.globalCompositeOperation = 'source-over'; }, 'texFlatComposite');
    var filter = engaged('filter', function () { G.ctx.filter = 'blur(1px)'; }, function () { G.ctx.filter = 'none'; }, 'texFlatFilter');
    var shadow = engaged('shadow', function () { G.ctx.shadowBlur = 4; }, function () { G.ctx.shadowBlur = 0; }, 'texFlatShadow');
    check('engage: a non-source-over composite, a filter or a shadow -> zero pattern fills, each reason counted',
      [composite, filter, shadow].every(function (r) { return r.fills === 0 && r.reason === 1; }), [composite, filter, shadow]);
    G.resetWorldTextureCatalog();
    // E2: the failure is silent (the _floorArtworkFailed precedent), because a
    // default-ON feature fails here every headless session and the audit lab
    // checks that steady-state play writes nothing to the console.
    var consoleLines = 0, realConsole = G.console;
    G.console = {log: function () { consoleLines++; }, info: function () { consoleLines++; }, warn: function () { consoleLines++; }, error: realConsole.error};
    var headless;
    try { headless = engaged('catalog', function () {}, function () {}, 'texFlatCatalog'); } finally { G.console = realConsole; }
    var st0 = G.getWorldTextureState();
    check('engage: a missing catalog (headless getImageData alpha 0, as in the audit lab) -> zero pattern fills, reason catalog counted, session failure flag set, no console output',
      headless.fills === 0 && headless.reason === 1 && st0.catalogFailed === true && st0.catalogFailures === 1 && H.errors.length === 0 &&
      consoleLines === 0 && !!st0.lastFailure, {r: headless, state: st0, errors: H.errors.slice(0, 2), consoleLines: consoleLines});
    // Two more frames with the switch left on: no rebuild per frame. Switching
    // off and on again retries once (lazily, in the next engaged frame).
    propsOn(false);
    texOn(true); drawFrame(false); var again = stats().texFlatCatalog, first = G.getWorldTextureState().catalogFailures;
    drawFrame(false); drawFrame(false); var kept = G.getWorldTextureState().catalogFailures; texOn(false);
    texOn(true); drawFrame(false); texOn(false);
    var retried = G.getWorldTextureState().catalogFailures; propsOn(true);
    check('engage: after a catalog failure the session does not retry the build every frame; switching off and on retries once',
      again === 1 && kept === first && retried === first + 1, {again: again, first: first, kept: kept, retried: retried});
    freshCatalog();
    var off = engaged('feature off', function () { texOn(false); }, function () {}, null);
    check('engage: structureTextures off -> zero pattern fills and no flat-frame reason (the stage is off)', off.fills === 0 && !off.flat && !off.textured, off);
  }

  // ── budget: never exceeded, counted, near faces first ──
  if (section('budget')) {
    freshCatalog();
    [['exterior', 64], ['high', 64], ['high', 256]].forEach(function (c) {
      var budget = c[1];
      pose(poseOf(c[0]));
      var full = (function () { texOn(true); try { drawFrame(false); return stats().texPrims; } finally { texOn(false); } })();
      var f = withOverride({textureBudget: budget}, function () { texOn(true); try { return sinkFrame(); } finally { texOn(false); } });
      var s = G._worldTexturePass.stats, frame = stats(), list = f.sink.filter(function (e) { return e.visible > 0; });
      var admitted = list.filter(function (e) { return e.outcome === 'textured'; }), declined = list.filter(function (e) { return e.outcome === 'budget'; });
      var used = list.reduce(function (sum, e) { return sum + e.prims; }, 0);
      var firstDecline = list.indexOf(declined[0]);
      var before = firstDecline < 0 ? admitted : list.slice(0, firstDecline).filter(function (e) { return e.outcome === 'textured'; });
      var nearestDeclined = declined.reduce(function (m, e) { return Math.min(m, e.dist); }, Infinity);
      var eligible = admitted.concat(declined).sort(function (a, b) { return a.dist - b.dist; });
      out('NOTE budget ' + c[0] + ' ' + budget + ': ' + full + ' primitives at the default budget, admitted ' + admitted.length + ', declined ' + declined.length);
      check('budget ' + c[0] + ' ' + budget + ': primitives never exceed the budget; fallbacks are counted; faces admitted before the first budget decline are nearer than every declined face; the nearest eligible face is textured',
        used <= budget && frame.texPrims === used && frame.texBudget === budget && declined.length > 0 && frame.texMeanBudget === declined.length &&
        frame.texFallbacks >= declined.length && before.length > 0 && before.every(function (e) { return e.dist <= nearestDeclined; }) &&
        eligible[0].outcome === 'textured',
        {used: used, counted: frame.texPrims, declined: declined.length, counted2: frame.texMeanBudget, admitted: admitted.length,
          before: before.map(function (e) { return Math.round(e.dist); }).slice(0, 5), nearestDeclined: Math.round(nearestDeclined),
          nearest: eligible[0] && {d: Math.round(eligible[0].dist), o: eligible[0].outcome}});
      var after = list.slice(firstDecline + 1).filter(function (e) { return e.outcome === 'textured'; });
      out('NOTE budget ' + c[0] + ' ' + budget + ': faces admitted after the first decline (skip-not-stop) ' + after.length);
    });
  }

  // ── fade: no pattern fills beyond 0.82 x viewDist; crossfade inside the band ──
  if (section('fade')) {
    freshCatalog();
    // viewDist chosen from this view's visible faces so that textured faces,
    // the 0.72-0.82 band and faces beyond it are all present.
    pose(poseOf('high'));
    var vd = G.viewDist, probe;
    try { texOn(true); probe = sinkFrame(); } finally { texOn(false); }
    var dists = probe.sink.filter(function (e) { return e.visible > 0; }).map(function (e) { return e.passDist; }).sort(function (a, b) { return a - b; });
    var VD = Math.round(dists[Math.floor(dists.length * 0.5)] / 0.77);
    out('NOTE fade viewDist ' + VD + ' from ' + dists.length + ' visible faces at ' + Math.round(dists[0]) + '..' + Math.round(dists[dists.length - 1]));
    G.viewDist = VD;
    var fr;
    try { texOn(true); fr = sinkFrame(); } finally { texOn(false); G.viewDist = vd; }
    var a2 = analyse(fr), byIndex = {};
    a2.faces.forEach(function (f) { byIndex[f.index] = f; });
    var beyond = fr.sink.filter(function (e) { return e.visible > 0 && e.passDist >= 0.82 * VD; });
    var near = fr.sink.filter(function (e) { return e.visible > 0 && e.passDist < 0.72 * VD; });
    var band = fr.sink.filter(function (e) { return e.visible > 0 && e.passDist > 0.72 * VD && e.passDist < 0.82 * VD && e.outcome === 'textured'; });
    var beyondFills = beyond.reduce(function (s, e) { return s + e.patternFills; }, 0);
    check('fade: faces at or beyond 0.82 x viewDist get zero pattern fills and are counted as fade means; nearer faces are textured (control)',
      beyond.length > 0 && beyondFills === 0 && beyond.every(function (e) { return e.outcome === 'fade'; }) &&
      near.some(function (e) { return e.outcome === 'textured' && e.patternFills > 0; }),
      {beyond: beyond.length, beyondFills: beyondFills, outcomes: beyond.map(function (e) { return e.outcome; }).slice(0, 6), near: near.length});
    // Band faces end with one source-over mean fill at alpha (d - 0.72 vd) / (0.1 vd).
    var crossOk = 0, crossBad = [];
    var sinkTextured = fr.sink.filter(function (e) { return e.visible > 0 && e.outcome === 'textured'; });
    var texturedFaces = a2.faces.filter(function (f) { return f.patternFills > 0; });
    sinkTextured.forEach(function (e, k) {
      var f = texturedFaces[k]; if (!f) return;
      var last = f.fills[f.fills.length - 1], t = (e.passDist - 0.72 * VD) / (0.1 * VD);
      if (e.passDist > 0.72 * VD) {
        if (last && !last.pattern && last.op === 'source-over' && Math.abs(last.alpha - t) < 2e-3) crossOk++;
        else crossBad.push({d: Math.round(e.passDist), t: t, last: last});
      } else if (last && last.op === 'source-over' && last.alpha < 1 && !last.pattern) crossBad.push({d: Math.round(e.passDist), near: true, last: last});
    });
    check('fade: textured faces inside 0.72-0.82 x viewDist end with one source-over mean fill at the crossfade alpha; nearer faces have none',
      band.length > 0 && crossOk === band.length && crossBad.length === 0 && sinkTextured.length === texturedFaces.length,
      {band: band.length, ok: crossOk, bad: crossBad.slice(0, 3), counts: [sinkTextured.length, texturedFaces.length]});
  }

  // ── strips: planar strips only on horizontal faces; triangles mode has none ──
  if (section('strips')) {
    freshCatalog();
    var modes = {};
    ['hybrid', 'triangles', 'planar'].forEach(function (mode) {
      var total = {strips: 0, vertStrips: 0, horStrips: 0, calls: 0, vertCalls: 0, horTextured: 0, triangles: 0};
      poses.forEach(function (p) {
        pose(p);
        var f = withOverride({textureMapping: mode}, function () { texOn(true); try { return sinkFrame(); } finally { texOn(false); } });
        f.sink.forEach(function (e) {
          total.strips += e.strips; total.calls += e.planarCalls;
          if (e.horizontal) { total.horStrips += e.strips; if (e.outcome === 'textured') total.horTextured++; }
          else { total.vertStrips += e.strips; total.vertCalls += e.planarCalls; }
        });
        total.triangles += stats().texTriangles || 0;
      });
      modes[mode] = total;
    });
    check('strips: hybrid issues planar strips only on horizontal faces (by vertex z), and some (control)',
      modes.hybrid.horStrips > 0 && modes.hybrid.vertStrips === 0 && modes.hybrid.vertCalls === 0, modes.hybrid);
    check('strips: triangles mode never calls the planar mapper and issues zero strips',
      modes.triangles.calls === 0 && modes.triangles.strips === 0 && modes.triangles.triangles > 0, modes.triangles);
    check('strips: planar mode offers vertical faces to the planar mapper too (the harness can see them)',
      modes.planar.vertCalls > 0, modes.planar);
  }

  // ── failure: a throwing pattern fill is contained ──
  if (section('failure')) {
    freshCatalog();
    pose(poseOf('exterior'));
    texOn(false); var ref = maskFrame();
    var realFillRect = G.ctx.fillRect, thrown = 0;
    G.ctx.fillRect = function () {
      var style = G.ctx.fillStyle;
      if (inModels && !thrown && style && style.__token && /^pat#/.test(style.__token)) { thrown++; throw Error('injected pattern fill failure'); }
      return realFillRect.apply(null, arguments);
    };
    var ptBefore = JSON.stringify(G._ptErrors), frame, s;
    try { texOn(true); sinkLog = []; frame = maskFrame(); frame.sink = sinkLog; sinkLog = null; s = JSON.parse(JSON.stringify(stats())); }
    finally { G.ctx.fillRect = realFillRect; texOn(false); }
    var a3 = analyse(frame), failedFace = frame.sink.filter(function (e) { return e.outcome === 'failed'; });
    var spans = a3.faces.filter(function (f) { return f.patternFills > 0 || f.fills.length; });
    var unbalanced = a3.faces.filter(function (f) { return f.balanced === false; });
    var failedSpan = failedFace.length === 1 ? a3.faces.filter(function (f) { return f.index === failedFace[0].mask; })[0] : null;
    var lastFill = failedSpan && failedSpan.fills[failedSpan.fills.length - 1];
    var repainted = !!lastFill && !lastFill.pattern && !lastFill.rect && lastFill.op === 'source-over' && failedSpan.balanced === true;
    check('failure: a throwing pattern fill -> one mean repaint (a mask fill after the throw), failedDraws +1, meanFailed +1, no escaping exception, textured faces continue',
      thrown === 1 && failedFace.length === 1 && s.texFailedDraws === 1 && s.texMeanFailed === 1 && JSON.stringify(G._ptErrors) === ptBefore &&
      repainted && s.texFaces > 0 && H.errors.length === 0,
      {thrown: thrown, failed: failedFace.length, draws: s.texFailedDraws, mean: s.texMeanFailed, pt: [ptBefore, JSON.stringify(G._ptErrors)],
        span: failedSpan && {fills: failedSpan.fills.slice(-3), balanced: failedSpan.balanced}});
    check('failure: depth is written once per face (same masks, same final _sceneDepthInv as textures off) and save/restore stays balanced in every face and the frame',
      frame.seq.join('|') === ref.seq.join('|') && frame.depth === ref.depth && unbalanced.length === 0 && a3.saves === 0 && a3.minDepth >= 0,
      {same: frame.seq.join('|') === ref.seq.join('|'), depth: [frame.depth, ref.depth], unbalanced: unbalanced.length, saves: a3.saves, min: a3.minDepth});
  }

  // ── colour: the textured face's mean equals the flat model's luma ──
  // The fills after a face's last pattern fill (wash, multiply, lighter) are
  // linear, so the face's mean colour is that sequence applied to the tile
  // mean. Compared with the colour the flat frame (textures off) filled the
  // same mask with. Browser pixels are checked in the lab (within 8%).
  if (section('colour')) {
    var cat = freshCatalog();
    function rgb(text) { var m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(text || ''); return m ? [+m[1], +m[2], +m[3]] : null; }
    function luma(c) { return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; }
    ['exterior', 'high'].forEach(function (tag) {
      pose(poseOf(tag));
      texOn(false); var off = analyse(maskFrame());
      texOn(true); var onFrame = sinkFrame(), on = analyse(onFrame); texOn(false);
      var offBy = {}, onBy = {}, n = 0, worst = 0, bad = [];
      off.faces.forEach(function (f) { offBy[f.index] = f; }); on.faces.forEach(function (f) { onBy[f.index] = f; });
      onFrame.sink.forEach(function (e) {
        if (e.outcome !== 'textured' || e.passDist > 0.72 * G.viewDist) return;
        var fOn = onBy[e.mask], fOff = offBy[e.mask];
        var flat = fOff && fOff.fills.length ? rgb(fOff.fills[fOff.fills.length - 1].fill) : null;
        var last = -1; if (fOn) fOn.fills.forEach(function (f, i) { if (f.pattern) last = i; });
        if (!flat || last < 0) { bad.push({mask: e.mask, flat: !!flat, last: last}); return; }
        var X = cat.means[e.material].slice();
        fOn.fills.slice(last + 1).forEach(function (f) {
          var c = rgb(f.fill);
          if (f.op === 'source-over') X = X.map(function (x, i) { return x * (1 - f.alpha) + c[i] * f.alpha; });
          else if (f.op === 'multiply') X = X.map(function (x, i) { return x * c[i] / 255; });
          else if (f.op === 'lighter') X = X.map(function (x, i) { return Math.min(255, x + c[i]); });
        });
        var d = Math.abs(luma(X) - luma(flat)) / Math.max(1, luma(flat));
        n++; if (d > worst) worst = d;
        if (d > 0.02) bad.push({mask: e.mask, flat: flat, textured: X.map(Math.round)});
      });
      check('colour: ' + tag + ': every textured face\'s mean colour (tile mean through its wash, multiply and lighter fills) is within 2% luma of the colour the flat frame paints on the same mask',
        n > 0 && bad.length === 0, {faces: n, worst: Math.round(worst * 1000) / 1000, bad: bad.slice(0, 3)});
    });
  }

  // ── determinism: no wall clock or random stream in the pass ──
  if (section('determinism')) {
    freshCatalog();
    pose(poseOf('near'));
    modelDateCalls = 0; modelRandom = 0;
    texOn(true);
    drawFrame(false); // warm-up: the first textured frame creates the cached patterns
    var one = drawFrame(false).hash(), s1 = stats().texFaces;
    var two = drawFrame(false).hash();
    texOn(false);
    check('determinism: the textured pass makes zero Date.now and Math.random calls and two frames after warm-up record identically',
      modelDateCalls === 0 && modelRandom === 0 && one === two && s1 > 0, {date: modelDateCalls, random: modelRandom, same: one === two, textured: s1});
  }

  // ── catalog: counted bytes and ms, per tile size, lazy in the pass ──
  if (section('catalog')) {
    G.resetWorldTextureCatalog();
    var c128 = withOpaque(function () { return G.ensureWorldTextureCatalog(128); });
    var c128b = G.ensureWorldTextureCatalog(128);
    var c64 = withOpaque(function () { return G.ensureWorldTextureCatalog(64); });
    var cs = G.getWorldTextureState();
    check('catalog: built once per tile size, bytes and prep ms counted, prepared means for stone, wood and iron',
      !!c128 && c128 === c128b && !!c64 && c64 !== c128 && c128.bytes > 0 && c64.bytes > 0 && c128.buildMs > 0 &&
      cs.catalogBuilds === 2 && cs.catalogBytes === c128.bytes + c64.bytes &&
      ['stone', 'wood', 'iron'].every(function (n) { return c128.means[n] && c128.means[n].length === 3; }),
      {builds: cs.catalogBuilds, bytes: cs.catalogBytes, b128: c128 && c128.bytes, b64: c64 && c64.bytes, ms: c128 && c128.buildMs});
    // Lazy: the first engaged frame builds the catalog (prepareGameRun is the eager path).
    G.resetWorldTextureCatalog();
    pose(poseOf('exterior'));
    withOpaque(function () { texOn(true); try { drawFrame(false); } finally { texOn(false); } });
    var lazy = G.getWorldTextureState(), fs = stats();
    check('catalog: with no catalog yet, the first engaged frame builds it lazily and textures; the build ms and bytes are in that frame\'s stats',
      lazy.catalogBuilds === 1 && fs.texCatalogMs > 0 && fs.texCatalogBytes > 0 && fs.texFaces > 0, {state: lazy, ms: fs.texCatalogMs, faces: fs.texFaces});
  }

  // ── registry: the registered parameters (not only the test override) drive the pass ──
  var PARAM_DEFAULTS = {textureMapping: 'hybrid', textureTile: 128, textureOwnedEdges: true, textureBudget: 2048, textureMaxRows: 360, textureMinPixels: 64};
  function withParams(values, fn) { features(values); try { return fn(); } finally { features(PARAM_DEFAULTS); } }
  function texturedSink(tag) { pose(poseOf(tag)); texOn(true); try { return sinkFrame(); } finally { texOn(false); } }
  if (section('registry')) {
    freshCatalog();
    var reg = {};
    ['hybrid', 'triangles', 'planar'].forEach(function (mode) {
      reg[mode] = withParams({textureMapping: mode}, function () {
        var f = texturedSink('high'), r = {strips: 0, calls: 0, vertCalls: 0, triangles: stats().texTriangles || 0, mode: G._worldTexturePass.mapping};
        f.sink.forEach(function (e) { r.strips += e.strips; r.calls += e.planarCalls; if (!e.horizontal) r.vertCalls += e.planarCalls; });
        return r;
      });
    });
    check('registry: textureMapping from the Graphics row drives the pass: triangles makes no planar calls, hybrid strips only horizontal faces, planar offers vertical faces',
      reg.triangles.calls === 0 && reg.triangles.strips === 0 && reg.triangles.triangles > 0 && reg.hybrid.strips > 0 && reg.hybrid.vertCalls === 0 &&
      reg.planar.vertCalls > 0, reg);
    var tile64 = withParams({textureTile: 64}, function () {
      return withOpaque(function () { texturedSink('exterior'); return {faces: stats().texFaces || 0, bytes: stats().texCatalogBytes, state: G.getWorldTextureState()}; });
    });
    var bytes128 = G.ensureWorldTextureCatalog(128).bytes, cat64 = G.ensureWorldTextureCatalog(64);
    check('registry: textureTile 64 builds the 64 px catalog lazily and textures with it (its bytes, not the 128 px catalog\'s, are reported)',
      !!cat64 && tile64.faces > 0 && tile64.bytes === cat64.bytes && cat64.bytes !== bytes128 && tile64.state.catalogs.indexOf(64) >= 0,
      {faces: tile64.faces, bytes: tile64.bytes, b64: cat64 && cat64.bytes, b128: bytes128, catalogs: tile64.state.catalogs});
    function ownedSeen(values) {
      var seen = {tri: {}, planar: {}}, realTri = G.TexturePilot.drawTriangle, realPl = G.TexturePilot.drawPlanarFace;
      G.TexturePilot.drawTriangle = function (c, a, b, d, m, o) { seen.tri[String(o && o.ownedPixels)] = 1; return realTri.apply(this, arguments); };
      G.TexturePilot.drawPlanarFace = function (c, p, m, o) { seen.planar[String(o && o.ownedPixels)] = 1; return realPl.apply(this, arguments); };
      try { withParams(values, function () { texturedSink('high'); }); }
      finally { G.TexturePilot.drawTriangle = realTri; G.TexturePilot.drawPlanarFace = realPl; }
      return {tri: Object.keys(seen.tri).sort().join(), planar: Object.keys(seen.planar).sort().join()};
    }
    var ownedOn = ownedSeen({textureOwnedEdges: true}), ownedOff = ownedSeen({textureOwnedEdges: false});
    check('registry: textureOwnedEdges reaches both mappers (ownedPixels true by default, false when switched off)',
      ownedOn.tri === 'true' && ownedOn.planar === 'true' && ownedOff.tri === 'false' && ownedOff.planar === 'false', {on: ownedOn, off: ownedOff});
    var budgets = [2048, 4096, 8192].map(function (b) {
      return withParams({textureBudget: b}, function () { texturedSink('high'); return {budget: stats().texBudget, prims: stats().texPrims, pass: G._worldTexturePass.budget}; });
    });
    check('registry: textureBudget 2048/4096/8192 sets the pass budget that admission uses and the HUD reports',
      budgets.every(function (r, i) { return r.budget === [2048, 4096, 8192][i] && r.pass === r.budget && r.prims <= r.budget && r.prims > 0; }), budgets);
    var W0 = G.canvas.width, H0 = G.canvas.height;
    function rowsCase(w, h, rows) {
      return withParams({textureMaxRows: rows}, function () {
        G.canvas.width = w; G.canvas.height = h;
        try { var f = texturedSink('exterior'); return {rows: rows, h: h, fills: sumPatternFills(analyse(f)), flatRows: stats().texFlatRows || 0}; }
        finally { G.canvas.width = W0; G.canvas.height = H0; }
      });
    }
    var rowsCases = [rowsCase(540, 361, 360), rowsCase(540, 361, 540), rowsCase(1080, 721, 720), rowsCase(1080, 721, 'unlimited')];
    check('registry: textureMaxRows: 361 rows are flat at 360 and textured at 540; 721 rows are flat at 720 and textured at unlimited',
      rowsCases[0].fills === 0 && rowsCases[0].flatRows === 1 && rowsCases[1].fills > 0 && rowsCases[1].flatRows === 0 &&
      rowsCases[2].fills === 0 && rowsCases[2].flatRows === 1 && rowsCases[3].fills > 0 && rowsCases[3].flatRows === 0, rowsCases);
    var small = {};
    [64, 0].forEach(function (px) {
      small[px] = withParams({textureMinPixels: px}, function () {
        var f = texturedSink('exterior'), tiny = f.sink.filter(function (e) { return e.visible > 0 && e.visible < 48; });
        return {small: stats().texMeanSmall || 0, tinyTextured: tiny.filter(function (e) { return e.outcome === 'textured'; }).length, tiny: tiny.length};
      });
    });
    check('registry: textureMinPixels 64 paints faces owning under 64 px with their mean; 0 disables the threshold (those faces texture)',
      small[64].small > 0 && small[64].tinyTextured === 0 && small[0].small === 0 && small[0].tinyTextured > 0, small);
  }

  // ── debug: the Texture debug checkbox tints each face by its path ──
  if (section('debug')) {
    freshCatalog(); propsOn(false);
    var TINT = G.WORLD_TEXTURE_DEBUG_TINTS;
    function tintOf(fillText) {
      var m = /rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\)/.exec(fillText || ''), c = m ? 'rgb(' + m[1] + ',' + m[2] + ',' + m[3] + ')' : '';
      for (var k in TINT) if (TINT[k] === c) return k;
      return null;
    }
    // Path oracle from the spies: planar strips observed -> strip; textured
    // without strips -> triangle; any mean outcome -> mean.
    function pathOf(e) { return e.outcome === 'textured' ? (e.strips > 0 ? 'strip' : 'triangle') : 'mean'; }
    function tintFrame(tag, debugOn, override) {
      pose(poseOf(tag)); G.DEBUG_TEXTURE = debugOn; maskPathFills = function (f) { return !!tintOf(f); };
      try {
        return withOverride(override || null, function () {
          texOn(true);
          try { var f = sinkFrame(); return {f: f, a: analyse(f), s: JSON.parse(JSON.stringify(stats()))}; } finally { texOn(false); }
        });
      } finally { G.DEBUG_TEXTURE = false; maskPathFills = null; }
    }
    function tintCount(a) { var n = 0; a.faces.forEach(function (face) { face.fills.forEach(function (x) { if (tintOf(x.fill)) n++; }); }); return n; }
    var offRuns = ['exterior', 'high'].map(function (tag) { return tintFrame(tag, false); });
    check('debug: Texture debug off (the default) issues no tint fills and counts none',
      G.DEBUG_TEXTURE === false && offRuns.every(function (r) { return tintCount(r.a) === 0 && !r.s.texDebugTints && r.s.texFaces > 0; }),
      offRuns.map(function (r) { return {tints: tintCount(r.a), counted: r.s.texDebugTints, faces: r.s.texFaces}; }));
    var seen = {strip: 0, triangle: 0, mean: 0}, bad = [], onRuns = [];
    [['high', null], ['exterior', null], ['high', {textureBudget: 256}]].forEach(function (c) {
      var r = tintFrame(c[0], true, c[1]), byIndex = {}, faces = 0;
      onRuns.push(r);
      r.a.faces.forEach(function (face) { byIndex[face.index] = face; });
      r.f.sink.forEach(function (e) {
        if (!(e.visible > 0)) return;
        faces++;
        var face = byIndex[e.mask], want = pathOf(e), tints = face ? face.fills.filter(function (x) { return tintOf(x.fill); }) : [];
        var last = face && face.fills[face.fills.length - 1];
        var ok = tints.length === 1 && last === tints[0] && tintOf(last.fill) === want && last.pathIsMask === true && !last.rect &&
          last.op === 'source-over' && Math.abs(last.alpha - face.baseAlpha * G.WORLD_TEXTURE_DEBUG_ALPHA) < 2e-3; // the recorder keeps 3 decimals
        if (ok) seen[want]++;
        else bad.push({pose: c[0], mask: e.mask, want: want, got: tints.map(function (x) { return tintOf(x.fill); }), last: last, base: face && face.baseAlpha, fills: face && face.fills.length});
      });
      r.visibleFaces = faces;
    });
    // Renamed after the stage L flip (was "every visible face ..."): the sink
    // spy's faces are matched to the mask log, which covers
    // drawStructureModels3D only, and this section switches propTextures
    // OFF, so the check is about structure faces. The prop faces' tints are
    // prop_textures.js's debug check. Contract and thresholds unchanged.
    check('debug: Texture debug on: every visible structure face ends with exactly one translucent tint fill over its own mask, coloured by the path the spies observed (strip, triangle, mean), and all three paths occur',
      bad.length === 0 && seen.strip > 0 && seen.triangle > 0 && seen.mean > 0 &&
      onRuns.every(function (r) { return r.s.texDebugTints === r.visibleFaces; }),
      {seen: seen, bad: bad.slice(0, 3), counted: onRuns.map(function (r) { return [r.s.texDebugTints, r.visibleFaces]; })});
    pose(poseOf('high')); texOn(true);
    var plain = maskFrame(); G.DEBUG_TEXTURE = true; var tinted = maskFrame(); G.DEBUG_TEXTURE = false; texOn(false);
    check('debug: the tint is a colour overlay only: masks and the final _sceneDepthInv are identical with Texture debug on and off',
      plain.seq.join('|') === tinted.seq.join('|') && plain.depth === tinted.depth && plain.seq.length > 0,
      {clips: [plain.seq.length, tinted.seq.length], depth: [plain.depth, tinted.depth]});
    G.USE_TEXTURES = false;
    var flatTint;
    try { flatTint = tintFrame('high', true); } finally { G.USE_TEXTURES = true; }
    check('debug: a flat frame (Toggle Textures off) draws no tint: there is no mapping path to show',
      tintCount(flatTint.a) === 0 && flatTint.s.texFlatMaster === 1 && !flatTint.s.texDebugTints, {tints: tintCount(flatTint.a), s: flatTint.s.texFlatMaster});
    propsOn(true);
  }

  // ── hud: the render line carries the pass's counters ──
  if (section('hud')) {
    freshCatalog();
    function hudCase(tag, override) {
      return withOverride(override || null, function () {
        pose(poseOf(tag)); texOn(true);
        try {
          var f = sinkFrame(), line = G.renderHudStatusLine(), v = f.sink.filter(function (e) { return e.visible > 0; });
          var faces = v.filter(function (e) { return e.outcome === 'textured'; }).length;
          var fb = v.filter(function (e) { return e.outcome === 'budget' || e.outcome === 'decline' || e.outcome === 'failed'; }).length;
          var prims = v.reduce(function (s, e) { return s + e.prims; }, 0), budget = override && override.textureBudget || 2048;
          return {line: line, want: 'R:Rec TEX ' + prims + '/' + budget + ' fb ' + fb + ' f' + faces + ' m' + (v.length - faces), fb: fb};
        } finally { texOn(false); }
      });
    }
    var hudRuns = [hudCase('high'), hudCase('exterior', {textureBudget: 64})];
    check('hud: an engaged frame\'s render line is R:Rec TEX <prims>/<budget> fb <fallbacks> f<textured faces> m<mean faces>, each counted independently by the sink spies',
      hudRuns.every(function (r) { return r.line === r.want; }) && hudRuns[1].fb > 0, hudRuns);
    function flatLine(setup, teardown) {
      pose(poseOf('exterior')); texOn(true); setup();
      try { drawFrame(false); return G.renderHudStatusLine(); } finally { teardown(); texOn(false); }
    }
    var W1 = G.canvas.width, H1 = G.canvas.height, realGT = G.ctx.getTransform;
    var flats = {
      rows: flatLine(function () { G.canvas.width = 540; G.canvas.height = 361; }, function () { G.canvas.width = W1; G.canvas.height = H1; }),
      debug: flatLine(function () { G.DEBUG_POLY_TYPES = true; }, function () { G.DEBUG_POLY_TYPES = false; }),
      transform: flatLine(function () { G.ctx.getTransform = function () { return {a: 2, b: 0, c: 0, d: 2, e: 0, f: 0}; }; }, function () { G.ctx.getTransform = realGT; }),
      master: flatLine(function () { G.USE_TEXTURES = false; }, function () { G.USE_TEXTURES = true; })
    };
    G.applyRenderPreset('legacy'); pose(poseOf('exterior')); drawFrame(false); flats.legacy = G.renderHudStatusLine(); G.applyRenderPreset('recommended'); texOn(false);
    check('hud: a flat frame names its reason (flat:rows, flat:debug, flat:transform), Toggle Textures off reads off, Legacy reads -',
      flats.rows === 'R:Rec TEX flat:rows fb 0' && flats.debug === 'R:Rec TEX flat:debug fb 0' && flats.transform === 'R:Rec TEX flat:transform fb 0' &&
      flats.master === 'R:Rec TEX off fb 0' && flats.legacy === 'R:Legacy TEX - fb 0', flats);
  }

  // ── lab: headless smoke of tools/game/render-lab/20-textures.js ──
  // The browser runs S1-S7 with real pixels; this host reads back no opaque
  // pixels, so the pixel checks must say SKIP (never a vacuous PASS) while the
  // depth, counter and control checks run for real.
  if (section('lab')) {
    freshCatalog();
    (0, eval)(slurp('tools/game/render-lab/00-core.js'));
    (0, eval)(slurp('tools/game/render-lab/20-textures.js'));
    pose(poseOf('exterior'));
    var wrappers = {clip: G.withSceneDepthClip, models: G.drawStructureModels3D, sink: G.fillSceneDepthTexturedPolygon, now: Date.now, random: Math.random};
    var snap = JSON.stringify(G.renderFeatureSnapshot()), master = G.USE_TEXTURES;
    var r = G.RenderLabTextures.checkView('smoke');
    out('NOTE lab ' + G.RenderLabTextures.line(r));
    check('lab: checkView on the exterior pose: S2, S3 (counters), S4 (probe hidden behind the wall, visible in front), S6 and S7 pass; pixel checks SKIP on a host with no readable pixels',
      r.S1.status === 'SKIP' && r.S5.status === 'SKIP' && r.luma.status === 'SKIP' && r.S2.status === 'PASS' && r.S3.status === 'PASS (counters only)' &&
      r.S3.fills > 0 && r.S4.status === 'PASS' && r.S4.behind === 0 && r.S4.front > 0 && r.S6.status === 'PASS' && r.S6.strips.triangles === 0 &&
      r.S7.status === 'PASS' && r.S7.negativeFills === 0 && r.status === 'PARTIAL', r);
    check('lab: checkView restores the feature switches, Toggle Textures, the scene-depth and sink functions and the frozen clocks',
      JSON.stringify(G.renderFeatureSnapshot()) === snap && G.USE_TEXTURES === master && G.withSceneDepthClip === wrappers.clip &&
      G.drawStructureModels3D === wrappers.models && G.fillSceneDepthTexturedPolygon === wrappers.sink && Date.now === wrappers.now &&
      Math.random === wrappers.random, {features: JSON.stringify(G.renderFeatureSnapshot()) === snap, master: G.USE_TEXTURES});
    // The tail gate on synthetic A/B/B/A runs: n frames over 16.7 ms, m over 8.33 ms, the rest 5 ms.
    function phase(label, over16, over8) {
      var ms = [], i; for (i = 0; i < 90; i++) ms.push(i < over16 ? 20 : i < over16 + over8 ? 10 : 5);
      return {label: label, renderMs: ms, stages: {'draw()': ms}};
    }
    var calm = G.RenderLabTextures.tail({phases: [phase('A', 2, 0), phase('B', 3, 4), phase('B', 2, 4), phase('A', 1, 0)]});
    var tailHeavy = G.RenderLabTextures.tail({phases: [phase('A', 0, 1), phase('B', 5, 10), phase('B', 6, 12), phase('A', 0, 1)]});
    var broken = G.RenderLabTextures.tail({phases: [phase('A', 0, 0), phase('B', 0, 0), phase('A', 0, 0)]});
    check('lab: the tail gate passes textured-minus-flat frames over 16.7 ms within the repeat noise floor and fails a heavier tail or a non-A/B/B/A run',
      calm.pass === true && calm.extraOver16 === 2 && calm.noise === 2 && calm.phases[1].over8 === 7 &&
      tailHeavy.pass === false && tailHeavy.extraOver16 === 11 && tailHeavy.noise === 1 && broken.pass === false,
      {calm: calm, heavy: tailHeavy, broken: broken});
    var cfg = G.RenderLabTextures.CONFIGS;
    check('lab: the timing configurations are flat model, hybrid and triangles over Recommended',
      cfg.flat.preset === 'recommended' && cfg.flat.features.structureTextures === false && cfg.hybrid.features.textureMapping === 'hybrid' &&
      cfg.triangles.features.textureMapping === 'triangles' && cfg.triangles.features.structureTextures === true, cfg);
  }

  check('no console errors', H.errors.length === 0, H.errors.slice(0, 3));
  out('WORLD_TEXTURES_RESULT ' + (failed ? 'FAIL' : 'PASS') + ' ' + checked + ' failed ' + failed);
})();
