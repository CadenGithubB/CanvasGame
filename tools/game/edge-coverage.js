// DEV ONLY: native edge-coverage regression for owner-masked texture clips.
// Faces are painted exactly like structure-preview.html's paint(): the
// production scene-depth integer pixel mask, an opaque black base, then a
// uniform white texture through TexturePilot. Every pixel the mask assigns to
// a face must therefore read exactly 255. The expectation comes from authored
// geometry and the uniform artwork; pixel ownership is re-derived here from
// pixel-centre half-planes, not from the rasterizer or texture mapper.
var EdgeCoverage = (function () {
  var W = 360, H = 240, STEPS = 16, EPS = 1e-7, BACKGROUND = '#36494b', BG = [0x36, 0x49, 0x4b];
  var OCCLUDER_INV = 0.012, VERTICAL = {x: 172, y: 60, width: 13, height: 120};
  var HORIZONTAL = {x: 60, y: 112, width: 240, height: 13}, materials = {};

  function material(size) {
    if (materials[size]) return materials[size];
    var source = document.createElement('canvas'); source.width = source.height = size;
    var g = source.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, size, size);
    // color is the page paint() base: diagnostic materials supply their solid.
    var m = {source: source, size: size, color: '#000000'};
    TexturePilot.prepareMaterial(m);
    return materials[size] = m;
  }

  // Codex geometry: s=178+phase, per-vertex q=0.006+slope*(x-s), depth=1/q.
  function vertex(x, y, s, slope) {
    var q = 0.006 + slope * (x - s);
    return {x: x, y: y, depth: 1 / q, u: (0.0001 * x + 0.00002 * y) / q, v: (0.000002 * x + 0.00002 * y) / q};
  }
  // The same join transposed: it runs across rows like a roof or floor edge.
  function transposed(x, y, t, slope) {
    var q = 0.006 + slope * (y - t);
    return {x: x, y: y, depth: 1 / q, u: (0.0001 * y + 0.00002 * x) / q, v: (0.000002 * y + 0.00002 * x) / q};
  }
  function face(points, occluder) { return {points: points, occluder: !!occluder}; }
  function join(phase) {
    var s = 178 + phase;
    return [face([[30, 40], [s, 20], [s, 220], [30, 190]].map(function (p) { return vertex(p[0], p[1], s, 0.000004); })),
      face([[s, 20], [325, 45], [325, 190], [s, 220]].map(function (p) { return vertex(p[0], p[1], s, -0.000004); }))];
  }
  function horizontal(phase) {
    var t = 118 + phase;
    return [face([[40, 10], [20, t], [340, t], [320, 10]].map(function (p) { return transposed(p[0], p[1], t, 0.000004); })),
      face([[20, t], [45, 230], [315, 230], [340, t]].map(function (p) { return transposed(p[0], p[1], t, -0.000004); }))];
  }
  // A nearer opaque red face across the join at half the depth (q=0.012).
  function occluder(phase) {
    return face([[165.3, 95.6], [191.7, 95.6], [191.7, 140.4], [165.3, 140.4]].map(function (p) {
      return {x: p[0] + phase, y: p[1], depth: 1 / OCCLUDER_INV, u: 0, v: 0};
    }), true);
  }
  // A 0.4 px wide wall seen almost edge-on, like a pillar corner.
  function sliver(phase) {
    var x0 = 100.3 + phase;
    return [face([[x0, 50], [x0 + 0.4, 52], [x0 + 0.4, 190], [x0, 188]].map(function (p) {
      var q = 0.006 + 0.00001 * (p[1] - 120);
      return {x: p[0], y: p[1], depth: 1 / q, u: (0.0001 * p[0] + 0.00002 * p[1]) / q, v: (0.000002 * p[0] + 0.00002 * p[1]) / q};
    }))];
  }
  var SCENES = {
    'join': {region: VERTICAL, faces: join},
    'join-reversed': {region: VERTICAL, faces: function (phase) { return join(phase).reverse(); }},
    'horizontal': {region: HORIZONTAL, faces: horizontal},
    'occluder-first': {region: VERTICAL, faces: function (phase) { return [occluder(phase)].concat(join(phase)); }},
    'occluder-last': {region: VERTICAL, faces: function (phase) { return join(phase).concat([occluder(phase)]); }},
    'sliver': {region: null, faces: sliver}
  };
  function scene(name, phase) {
    var definition = SCENES[name];
    if (!definition || !(phase >= 0 && phase <= 1)) throw Error('Unknown edge-coverage scene ' + name + ' at ' + phase);
    return {name: name, phase: phase, region: definition.region, faces: definition.faces(phase)};
  }

  // Join scenes gate their owner-mask-off twin: it must reproduce the edge
  // deficit or the fixture no longer exercises the defect (SETUP_FAILURE).
  var SPECS = [
    {name: 'join', scene: 'join', sizes: [64, 128], filter: 'stable', gated: true},
    {name: 'join-legacy', scene: 'join', sizes: [128], filter: 'legacy', gated: true},
    {name: 'join-reversed', scene: 'join-reversed', sizes: [128], filter: 'stable', gated: true},
    {name: 'join-horizontal', scene: 'horizontal', sizes: [128], filter: 'stable', gated: true},
    {name: 'occluder-first', scene: 'occluder-first', sizes: [128], filter: 'stable', gated: false},
    {name: 'occluder-last', scene: 'occluder-last', sizes: [128], filter: 'stable', gated: false},
    {name: 'sliver', scene: 'sliver', sizes: [128], filter: 'stable', gated: false}
  ];
  function cases() {
    var list = [];
    SPECS.forEach(function (spec) {
      spec.sizes.forEach(function (size) {
        ['triangles', 'planar'].forEach(function (mapping) {
          [true, false].forEach(function (owned) {
            list.push({id: spec.name + '-' + size + '-' + mapping + (owned ? '-owned' : '-unowned'), scene: spec.scene,
              mapping: mapping, size: size, filter: spec.filter, ownedPixels: owned, surface: 'texture',
              expectation: owned ? 'exact-255' : spec.gated ? 'sensitivity-below-250' : 'descriptive'});
          });
        });
      });
    });
    return list;
  }

  // Pixel-centre classification against each convex face: 1 strictly inside,
  // 0 within EPS of an edge (ambiguous, both neighbours may own it), -1 outside.
  function classifyInto(any, own, points) {
    var n = points.length, area = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, edges = [];
    for (var i = 0; i < n; i++) {
      var a = points[i], b = points[(i + 1) % n];
      area += a.x * b.y - b.x * a.y;
      minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x); minY = Math.min(minY, a.y); maxY = Math.max(maxY, a.y);
    }
    var sign = area >= 0 ? 1 : -1, count = 0;
    for (var e = 0; e < n; e++) {
      var p = points[e], q = points[(e + 1) % n], length = Math.hypot(q.x - p.x, q.y - p.y);
      edges.push({x: p.x, y: p.y, dx: sign * (q.x - p.x) / length, dy: sign * (q.y - p.y) / length});
    }
    var x0 = Math.max(0, Math.floor(minX - 1)), x1 = Math.min(W - 1, Math.ceil(maxX + 1));
    var y0 = Math.max(0, Math.floor(minY - 1)), y1 = Math.min(H - 1, Math.ceil(maxY + 1));
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var cx = x + 0.5, cy = y + 0.5, lowest = Infinity;
      for (var k = 0; k < edges.length; k++) {
        var edge = edges[k], d = edge.dx * (cy - edge.y) - edge.dy * (cx - edge.x);
        if (d < lowest) lowest = d;
      }
      var value = lowest > EPS ? 1 : lowest >= -EPS ? 0 : -1;
      if (value < 0) continue;
      var index = y * W + x;
      if (value > any[index]) any[index] = value;
      if (value > own[index]) own[index] = value;
      count++;
    }
    return count;
  }
  function classify(sceneData) {
    var any = new Int8Array(W * H).fill(-1), textured = new Int8Array(W * H).fill(-1), occ = null, expectedVisible = 0;
    sceneData.faces.forEach(function (f) {
      if (f.occluder && !occ) occ = new Int8Array(W * H).fill(-1);
      if (classifyInto(any, f.occluder ? occ : textured, f.points)) expectedVisible++;
    });
    return {region: sceneData.region, any: any, textured: textured, occluder: occ, sliver: !sceneData.region, expectedVisible: expectedVisible};
  }

  // One frame's measurements. data is RGBA; depth is the production inverse
  // depth buffer, used only for prerequisite cross-checks against geometry.
  // Values are min(R,G,B), so a red occluder pixel cannot pass as white.
  function measure(data, depth, geometry) {
    var r = {regionMin: 255, regionMax: 0, regionAt: null, regionPixels: 0, regionOutside: 0, regionUnowned: 0,
      ownedMin: null, ownedAt: null, ownedPixels: 0, ownedUnowned: 0, exteriorLeak: 0, depthOutside: 0,
      occluderPixels: 0, occluderLeak: 0, occluderMissing: 0, ambiguous: 0, alphaHoles: 0};
    var region = geometry.region, occ = geometry.occluder;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x, o = i * 4, value = Math.min(data[o], data[o + 1], data[o + 2]), cls = geometry.any[i];
      if (data[o + 3] !== 255) r.alphaHoles++;
      if (cls < 0) {
        if (data[o] !== BG[0] || data[o + 1] !== BG[1] || data[o + 2] !== BG[2]) r.exteriorLeak++;
        if (depth && depth[i] > 0) r.depthOutside++;
        continue;
      }
      if (cls === 0) r.ambiguous++;
      if (occ && occ[i] >= 0) {
        if (occ[i] > 0) {
          r.occluderPixels++;
          if (data[o + 1] > 0) r.occluderLeak++;
          if (data[o] !== 255 || (depth && Math.abs(depth[i] - OCCLUDER_INV) > 1e-6)) r.occluderMissing++;
        }
        continue;
      }
      if (region && x >= region.x && x < region.x + region.width && y >= region.y && y < region.y + region.height) {
        r.regionPixels++;
        if (geometry.textured[i] < 0) r.regionOutside++;
        if (depth && !(depth[i] > 0)) r.regionUnowned++;
        if (value < r.regionMin) { r.regionMin = value; r.regionAt = {x: x, y: y}; }
        r.regionMax = Math.max(r.regionMax, data[o], data[o + 1], data[o + 2]);
      }
      if (geometry.sliver && geometry.textured[i] > 0) {
        r.ownedPixels++;
        if (depth && !(depth[i] > 0)) r.ownedUnowned++;
        if (r.ownedMin === null || value < r.ownedMin) { r.ownedMin = value; r.ownedAt = {x: x, y: y}; }
      }
    }
    return r;
  }

  function newWork() {
    return {frames: 0, visibleFaces: 0, expectedVisibleFaces: 0, visiblePixels: 0, triangles: 0, strips: 0, patternFills: 0,
      planarAttempts: 0, failedDraws: 0, fallbackFaces: 0, cappedFaces: 0, declines: {}};
  }
  // Mirrors structure-preview.html paint() for a diagnostic unlit material:
  // mask clip, opaque base, texture, counted solid fallback on failure. The
  // one difference is deliberate: a declined planar face is not retried as
  // triangles, so a planar case cannot silently test the triangle path.
  function paintFace(c, f, variant, work) {
    var visible = withSceneDepthClip(f.points, function () {
      c.save();
      try {
        _traceSceneDepthPixelMask(_sceneDepthClipGeneration, _sceneDepthClipMinY, _sceneDepthClipMaxY); c.clip();
        if (f.occluder) { c.fillStyle = '#ff0000'; c.fillRect(0, 0, W, H); return; }
        c.fillStyle = variant.surface === 'flat' ? '#ffffff' : '#000000'; c.fillRect(0, 0, W, H);
        if (variant.surface !== 'texture') return;
        var mat = material(variant.size), failed = false;
        if (variant.mapping === 'planar') {
          work.planarAttempts++;
          var result = TexturePilot.drawPlanarFace(c, f.points, mat, {width: W, height: H, maxStrips: 384, filter: variant.filter, stats: work,
            ownedPixels: variant.ownedPixels,
            visibleBounds: {minX: _sceneDepthClipMinX, maxX: _sceneDepthClipMaxX, minY: _sceneDepthClipMinY, maxY: _sceneDepthClipMaxY}});
          if (!result.handled) { failed = true; work.declines[result.reason] = (work.declines[result.reason] || 0) + 1; }
          else work.strips += result.strips;
          if (result.failed) work.failedDraws++;
        } else {
          var draws = 0;
          var tess = TexturePilot.tessellate(f.points, {width: W, height: H, maxTriangles: 256, maxDepth: 7, errorPixels: 0.65}, function (a, b, d, edges) {
            if (TexturePilot.drawTriangle(c, a, b, d, mat, {filter: variant.filter, stats: work, ownedPixels: variant.ownedPixels, boundary: edges})) draws++;
            else { work.failedDraws++; failed = true; }
          });
          work.triangles += tess.triangles; if (tess.capped) work.cappedFaces++;
          if (tess.rejected || !draws) { work.failedDraws++; failed = true; }
        }
        if (failed) { c.fillStyle = mat.color; c.fillRect(0, 0, W, H); work.fallbackFaces++; }
      } finally { c.restore(); }
    }, {writeDepth: true, depthBias: 0, _paintsDepthPixels: true});
    if (visible) { work.visibleFaces++; work.visiblePixels += visible; }
    return visible;
  }
  function surface() {
    var target = document.createElement('canvas'); target.width = W; target.height = H;
    return {canvas: target, context: target.getContext('2d', {willReadFrequently: false})};
  }
  // Same frame setup as the page render(): identity transform, opaque
  // background, fresh scene depth. The scene-depth helpers draw on global ctx.
  function begin(s) {
    var c = s.context; canvas = s.canvas; ctx = c;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'low';
    c.fillStyle = BACKGROUND; c.fillRect(0, 0, W, H);
    if (!beginSceneDepthFrame(W, H)) throw Error('Scene depth frame could not start');
    return c;
  }
  function frame(s, sceneData, variant, work) {
    var c = begin(s);
    sceneData.faces.forEach(function (f) { paintFace(c, f, variant, work); });
    return c.getImageData(0, 0, W, H).data;
  }
  function pause() { return new Promise(function (resolve) { setTimeout(resolve, 0); }); }

  // All 17 phases of one variant on a fresh private canvas.
  async function sweep(variant, env, label) {
    var s = surface(), work = newWork(), mins = [], owned = [], problems = [];
    var totals = {regionPixels: 0, ownedPixels: 0, exteriorLeak: 0, occluderLeak: 0, occluderPixels: 0, ambiguous: 0, regionMax: 0};
    var worst = null, below = 0, ownedPhases = 0;
    for (var step = 0; step <= STEPS; step++) {
      if (env.cancelled()) throw Error('Cancelled');
      if (step % 4 === 0) { env.progress(label + ' · phase ' + step + '/' + STEPS); await pause(); if (env.cancelled()) throw Error('Cancelled'); }
      var phase = step / STEPS, sceneData = scene(variant.scene, phase), geometry = classify(sceneData);
      var before = work.visibleFaces, data = frame(s, sceneData, variant, work), m = measure(data, _sceneDepthInv, geometry);
      work.frames++; work.expectedVisibleFaces += geometry.expectedVisible;
      if (work.visibleFaces - before !== geometry.expectedVisible) problems.push('phase ' + step + ': ' + (work.visibleFaces - before) + ' visible faces, geometry expects ' + geometry.expectedVisible);
      ['regionOutside', 'regionUnowned', 'depthOutside', 'ownedUnowned', 'occluderMissing', 'alphaHoles'].forEach(function (key) {
        if (m[key]) problems.push('phase ' + step + ': ' + key + '=' + m[key]);
      });
      if (sceneData.region && !m.regionPixels) problems.push('phase ' + step + ': measured region is empty');
      if (geometry.occluder && !m.occluderPixels) problems.push('phase ' + step + ': occluder owns no pixels');
      var value = sceneData.region ? m.regionMin : m.ownedMin, at = sceneData.region ? m.regionAt : m.ownedAt;
      mins.push(value); owned.push(m.ownedPixels);
      if (m.ownedPixels) ownedPhases++;
      if (value !== null && value < 250) below++;
      if (value !== null && (!worst || value < worst.value)) worst = {value: value, phase: phase, x: at && at.x, y: at && at.y};
      totals.regionPixels += m.regionPixels; totals.ownedPixels += m.ownedPixels; totals.exteriorLeak += m.exteriorLeak;
      totals.occluderLeak += m.occluderLeak; totals.occluderPixels += m.occluderPixels; totals.ambiguous += m.ambiguous;
      totals.regionMax = Math.max(totals.regionMax, m.regionMax);
    }
    if (variant.scene === 'sliver' && !ownedPhases) problems.push('sliver owns no pixel centre at any phase');
    if (variant.surface === 'texture') {
      if (work.failedDraws || work.fallbackFaces) problems.push(work.failedDraws + ' failed draws, ' + work.fallbackFaces + ' solid fallbacks');
      if (Object.keys(work.declines).length) problems.push('planar declines ' + JSON.stringify(work.declines));
      if (!work.patternFills) problems.push('no texture pattern fills');
      if (variant.mapping === 'planar' ? !work.strips || work.triangles : !work.triangles || work.strips) problems.push('mapping work does not match ' + variant.mapping);
    }
    return {minValue: worst ? worst.value : null, worst: worst, phasesBelow250: below, phaseMins: mins, ownedPixelsByPhase: variant.scene === 'sliver' ? owned : undefined,
      ownedPhases: variant.scene === 'sliver' ? ownedPhases : undefined, measuredPixels: totals.regionPixels + totals.ownedPixels, regionMax: totals.regionMax,
      leakPixels: totals.exteriorLeak + totals.occluderLeak, exteriorLeakPixels: totals.exteriorLeak, occluderLeakPixels: totals.occluderLeak,
      occluderPixels: totals.occluderPixels, ambiguousPixels: totals.ambiguous, work: work, prerequisites: problems};
  }

  // Pure measurement sensitivity: an ideal image synthesized from geometry
  // must measure clean, and each single injected defect must be found.
  function measurementControl() {
    var sceneData = scene('occluder-first', 0.5), geometry = classify(sceneData), data = new Uint8ClampedArray(W * H * 4), depth = new Float32Array(W * H);
    for (var i = 0; i < W * H; i++) {
      var o = i * 4, inOcc = geometry.occluder[i] >= 0, inAny = geometry.any[i] >= 0;
      var color = inOcc ? [255, 0, 0] : inAny ? [255, 255, 255] : BG;
      data[o] = color[0]; data[o + 1] = color[1]; data[o + 2] = color[2]; data[o + 3] = 255;
      depth[i] = inOcc ? OCCLUDER_INV : inAny ? 0.006 : 0;
    }
    function first(predicate) { for (var i = 0; i < W * H; i++) if (predicate(i)) return i; return -1; }
    var region = geometry.region, inRegion = first(function (i) { var x = i % W, y = (i - x) / W; return geometry.occluder[i] < 0 && x === region.x + 6 && y === region.y + 3; });
    var inOccluder = first(function (i) { return geometry.occluder[i] > 0; }), outside = first(function (i) { return geometry.any[i] < 0; });
    var clean = measure(data, depth, geometry), results = {clean: clean.regionMin === 255 && !clean.exteriorLeak && !clean.occluderLeak && !clean.occluderMissing &&
      !clean.regionOutside && !clean.regionUnowned && !clean.depthOutside && !clean.alphaHoles && clean.regionPixels > 0 && clean.occluderPixels > 0};
    function inject(index, channel, value, check) {
      var copy = new Uint8ClampedArray(data), d = new Float32Array(depth);
      if (channel === 'depth') d[index] = value; else copy[index * 4 + channel] = value;
      return check(measure(copy, d, geometry));
    }
    results.darkRegionPixel = inject(inRegion, 0, 249, function (m) { return m.regionMin === 249 && m.regionAt.x === region.x + 6 && m.regionAt.y === region.y + 3; });
    results.redRegionPixel = inject(inRegion, 1, 0, function (m) { return m.regionMin === 0; });
    results.occluderGreen = inject(inOccluder, 1, 1, function (m) { return m.occluderLeak === 1; });
    results.exteriorChange = inject(outside, 2, BG[2] + 1, function (m) { return m.exteriorLeak === 1; });
    results.unownedRegionDepth = inject(inRegion, 'depth', 0, function (m) { return m.regionUnowned === 1; });
    var pass = inRegion >= 0 && inOccluder >= 0 && outside >= 0 && Object.keys(results).every(function (k) { return results[k] === true; });
    return {id: 'measurement-injected-defects', pass: pass, checks: results};
  }

  // Native leak detector: filling the join faces with an unmasked
  // antialiased polygon over a masked occluder must register both leak kinds.
  function unmaskedOverwriteControl() {
    var s = surface(), sceneData = scene('occluder-first', 0.5), geometry = classify(sceneData), c = begin(s), work = newWork();
    paintFace(c, sceneData.faces[0], {surface: 'flat'}, work);
    c.fillStyle = '#ffffff';
    sceneData.faces.slice(1).forEach(function (f) {
      c.beginPath(); c.moveTo(f.points[0].x, f.points[0].y);
      for (var i = 1; i < f.points.length; i++) c.lineTo(f.points[i].x, f.points[i].y);
      c.closePath(); c.fill();
    });
    var m = measure(c.getImageData(0, 0, W, H).data, null, geometry);
    return {id: 'unmasked-overwrite-detected', pass: m.occluderLeak > 0 && m.exteriorLeak > 0 && m.occluderPixels > 0,
      occluderLeakPixels: m.occluderLeak, exteriorLeakPixels: m.exteriorLeak, occluderPixels: m.occluderPixels};
  }

  async function run(options) {
    options = options || {};
    var env = {progress: typeof options.progress === 'function' ? options.progress : function () {},
      cancelled: typeof options.cancelled === 'function' ? options.cancelled : function () { return false; }};
    var report = {kind: 'native-edge-coverage', fixtureVersion: 1, complete: false, status: 'SETUP_FAILURE', resolution: [W, H], phases: STEPS + 1,
      regions: {vertical: VERTICAL, horizontal: HORIZONTAL}, browser: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      cases: [], controls: [], setupFailures: [], qualityFailures: [],
      limitations: 'Synthetic Codex join (vertical and transposed), nearer occluder and 0.4 px sliver fixtures with uniform white artwork over an opaque black base, painted through the production scene-depth mask and TexturePilot. ' +
        'Exact 255 is required only where the integer mask owns a pixel centre; a sliver owning no centre vanishes in flat and textured renders alike (binary-mask silhouette aliasing, not measured). ' +
        'Owner-mask-off runs gate sensitivity for join scenes only; occluder and sliver owner-mask-off results are descriptive. ' +
        'Rare acute interior-join deficits inside real structures and whole-structure edge counts are not covered. Private canvases; not a performance benchmark.'};
    var savedCanvas = typeof canvas === 'undefined' ? undefined : canvas, savedCtx = typeof ctx === 'undefined' ? undefined : ctx;
    try {
      env.progress('Edge coverage: measurement controls');
      var measurement = measurementControl(); report.controls.push(measurement);
      report.controls.push(unmaskedOverwriteControl());
      var sceneNames = Object.keys(SCENES);
      for (var n = 0; n < sceneNames.length; n++) {
        var flat = await sweep({scene: sceneNames[n], surface: 'flat'}, env, 'Edge coverage: flat control ' + sceneNames[n]);
        report.controls.push({id: 'flat-mask-coverage-' + sceneNames[n], pass: !flat.prerequisites.length && flat.minValue === 255 && flat.leakPixels === 0,
          minValue: flat.minValue, phasesBelow250: flat.phasesBelow250, leakPixels: flat.leakPixels, measuredPixels: flat.measuredPixels, prerequisites: flat.prerequisites});
      }
      var base = await sweep({scene: 'join', surface: 'base'}, env, 'Edge coverage: black base control');
      report.controls.push({id: 'black-base-without-texture', pass: !base.prerequisites.length && base.regionMax === 0 && base.leakPixels === 0,
        regionMax: base.regionMax, minValue: base.minValue, leakPixels: base.leakPixels, prerequisites: base.prerequisites});
      var list = cases();
      for (var i = 0; i < list.length; i++) {
        var variant = list[i], result = await sweep(variant, env, 'Edge coverage ' + (i + 1) + '/' + list.length + ': ' + variant.id);
        var record = {id: variant.id, scene: variant.scene, mapping: variant.mapping, size: variant.size, filter: variant.filter, ownedPixels: variant.ownedPixels,
          expectation: variant.expectation, minValue: result.minValue, phasesBelow250: result.phasesBelow250, leakPixels: result.leakPixels, work: result.work,
          worst: result.worst, phaseMins: result.phaseMins, exteriorLeakPixels: result.exteriorLeakPixels, occluderLeakPixels: result.occluderLeakPixels,
          occluderPixels: result.occluderPixels, measuredPixels: result.measuredPixels, ambiguousPixels: result.ambiguousPixels,
          ownedPhases: result.ownedPhases, ownedPixelsByPhase: result.ownedPixelsByPhase, prerequisites: result.prerequisites};
        if (result.prerequisites.length) report.setupFailures.push(variant.id + ': ' + result.prerequisites.join('; '));
        else {
          if (variant.ownedPixels) record.pass = result.minValue === 255 && result.leakPixels === 0;
          if (variant.ownedPixels && result.minValue !== 255) report.qualityFailures.push(variant.id + ': min ' + result.minValue + ' at ' + JSON.stringify(result.worst));
          if (result.leakPixels) report.qualityFailures.push(variant.id + ': ' + result.leakPixels + ' leaked pixels');
          if (!variant.ownedPixels) record.dipped = result.minValue !== null && result.minValue < 250;
        }
        report.cases.push(record);
      }
      // Every gated owner-mask-off join run must reproduce the edge deficit.
      var gated = report.cases.filter(function (c) { return c.expectation === 'sensitivity-below-250'; });
      var missed = gated.filter(function (c) { return c.dipped !== true; });
      report.controls.push({id: 'owner-mask-off-sensitivity', gatedCases: gated.length,
        pass: gated.length > 0 && gated.length === list.filter(function (c) { return c.expectation === 'sensitivity-below-250'; }).length && !missed.length,
        failedToDip: missed.map(function (c) { return c.id + ' min ' + c.minValue; })});
      report.controls.forEach(function (control) {
        if (control.pass !== true) report.setupFailures.push('Control failed: ' + control.id + (control.failedToDip && control.failedToDip.length ? ' (' + control.failedToDip.join(', ') + ')' : ''));
      });
      report.ownerMaskResults = {cases: report.cases.filter(function (c) { return c.ownedPixels; }).length,
        passed: report.cases.filter(function (c) { return c.ownedPixels && c.pass === true; }).length};
      report.complete = true;
      report.status = report.setupFailures.length ? 'SETUP_FAILURE' : report.qualityFailures.length ? 'QUALITY_FAILURE' : 'PASS';
    } catch (e) {
      report.status = env.cancelled() ? 'CANCELLED' : 'SETUP_FAILURE';
      report.setupFailures.push(e.message);
    } finally {
      canvas = savedCanvas; ctx = savedCtx;
    }
    return report;
  }

  return {run: run, scene: scene, classify: classify, measure: measure, cases: cases, measurementControl: measurementControl, width: W, height: H};
}());
