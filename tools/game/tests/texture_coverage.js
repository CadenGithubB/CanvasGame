// Owner-mask edge coverage for the texture pilot. Pixel ownership comes from
// the production scene-depth mask; a recording Canvas resolves the clip paths
// the mapper actually issues with the nonzero rule. This checks submitted clip
// geometry against owned pixels, not browser antialiasing or compositing.
(function () {
  var G = (0, eval)('this'), checked = 0, failed = 0, verbose = __argv.indexOf('--verbose') >= 0;
  var out = (__engine === 'node' || __engine === 'deno') ? console.log.bind(console) : __out;
  function check(name, okay, detail) {
    checked++;
    if (!okay) failed++;
    out((okay ? 'PASS ' : 'FAIL ') + name + (okay ? '' : ' ' + JSON.stringify(detail)));
    if (okay && verbose) out('  DETAIL ' + JSON.stringify(detail));
  }
  function mutate(source, flag, before, after) {
    if (__argv.indexOf(flag) < 0) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + flag);
    return source.replace(before, after);
  }
  // Exact-once mutants on an evaluated copy, never the shipping file:
  // --old-clip          drawTriangle ignores ownedPixels (expandTriangle only)
  // --keep-face-clip    planar keeps its antialiased face-outline clip
  // --drop-outline-flags tessellate emits all-false boundary flags
  // --reverse-skirt     skirts run p->q, so nonzero cancels their overlap
  var source = slurp('tools/game/texture-mapping.js');
  source = mutate(source, '--old-clip', 'if (options && options.ownedPixels) {', 'if (false) {');
  source = mutate(source, '--keep-face-clip', 'if (options.ownedPixels !== true) {', 'if (true) {');
  source = mutate(source, '--drop-outline-flags',
    'emit(leaf.a, leaf.b, leaf.c, leaf.boundary.slice()); stats.triangles++;',
    'emit(leaf.a, leaf.b, leaf.c, [false, false, false]); stats.triangles++;');
  source = mutate(source, '--reverse-skirt', 'polygons.push(skirt);', 'polygons.push(skirt.slice().reverse());');
  (0, eval)(source);
  (0, eval)(slurp('assets/games/src/12-scene-depth.js'));
  var T = G.TexturePilot;
  var W = 360, H = 240, PHASES = [];
  for (var k = 0; k <= 16; k++) PHASES.push(k / 16);
  // Variants of the vertical join use the phases where the join pixel's
  // exterior part is 1/4..1/2 px, the band the pre-owner clip leaves bare.
  var SPOT = [4, 7, 8, 9, 12].map(function (step) { return step / 16; });

  // Opaque material sources for prepareMaterial; rendering never reads them.
  function pixelCanvas() {
    var c = {width: 0, height: 0}, data = new Uint8ClampedArray(0), w = 0, h = 0;
    function storage() { if (w !== c.width || h !== c.height) { w = c.width; h = c.height; data = new Uint8ClampedArray(w * h * 4); } return data; }
    var context = {
      createImageData: function (width, height) { return {width: width, height: height, data: new Uint8ClampedArray(width * height * 4)}; },
      getImageData: function (x, y, width, height) {
        var pixels = storage(), image = this.createImageData(width, height);
        for (var py = 0; py < height; py++) for (var px = 0; px < width; px++) for (var ch = 0; ch < 4; ch++)
          image.data[(py * width + px) * 4 + ch] = pixels[((y + py) * w + x + px) * 4 + ch];
        return image;
      },
      putImageData: function (image, x, y) {
        var pixels = storage();
        for (var py = 0; py < image.height; py++) for (var px = 0; px < image.width; px++) for (var ch = 0; ch < 4; ch++)
          pixels[((y + py) * w + x + px) * 4 + ch] = image.data[(py * image.width + px) * 4 + ch];
      }
    };
    c.getContext = function () { return context; };
    return c;
  }
  G.document = {createElement: function (tag) { if (tag !== 'canvas') throw Error('SETUP unexpected element ' + tag); return pixelCanvas(); }};
  function material(size) {
    var c = pixelCanvas(); c.width = c.height = size;
    var image = c.getContext().createImageData(size, size);
    for (var i = 0; i < size * size; i++) image.data.set([i % 17 * 8, 80, 120, 255], i * 4);
    c.getContext().putImageData(image, 0, 0);
    var m = {source: c, size: size, color: '#000000'};
    T.prepareMaterial(m);
    return m;
  }
  var MATERIAL = material(128);

  // Nonzero-rule regions. Row queries use the half-open vertex rule, so a
  // sample row through a shared vertex is counted exactly once.
  function region(subpaths) {
    var count = 0, minY = Infinity, maxY = -Infinity;
    subpaths.forEach(function (path) { count += path.length; });
    var lo = new Float64Array(count), hi = new Float64Array(count), x0 = new Float64Array(count);
    var y0 = new Float64Array(count), slope = new Float64Array(count), dir = new Int8Array(count), n = 0;
    subpaths.forEach(function (path) {
      for (var i = 0; i < path.length; i++) {
        var p = path[i], q = path[(i + 1) % path.length];
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        if (p.y === q.y) continue;
        lo[n] = Math.min(p.y, q.y); hi[n] = Math.max(p.y, q.y); x0[n] = p.x; y0[n] = p.y;
        slope[n] = (q.x - p.x) / (q.y - p.y); dir[n] = q.y > p.y ? 1 : -1; n++;
      }
    });
    return {subpaths: subpaths, single: subpaths.length === 1, n: n, lo: lo, hi: hi, x0: x0, y0: y0, slope: slope, dir: dir, minY: minY, maxY: maxY, cache: null};
  }
  var HIT_X = new Float64Array(4096), HIT_D = new Int8Array(4096), NONE = [];
  function intervals(r, y) {
    if (r.cache) { var cached = r.cache.get(y); if (cached) return cached; }
    var n = 0;
    if (r.single) {
      // One closed path crossed exactly twice: its two crossings have
      // opposite directions, so the span between them has winding +-1.
      var first = 0, second = 0;
      for (var e = 0; e < r.n; e++) {
        if (y < r.lo[e] || y >= r.hi[e]) continue;
        var hit = r.x0[e] + (y - r.y0[e]) * r.slope[e];
        if (n === 0) first = hit; else second = hit;
        if (++n > 2) break;
      }
      if (n === 0) return NONE;
      if (n === 2) return first < second ? [[first, second]] : second < first ? [[second, first]] : NONE;
      n = 0;
    }
    for (var i = 0; i < r.n; i++) {
      if (y < r.lo[i] || y >= r.hi[i]) continue;
      if (n === HIT_X.length) throw Error('SETUP too many clip crossings on one sample row');
      HIT_X[n] = r.x0[i] + (y - r.y0[i]) * r.slope[i]; HIT_D[n] = r.dir[i]; n++;
    }
    var result = NONE;
    if (n) {
      for (var a = 1; a < n; a++) {
        var x = HIT_X[a], d = HIT_D[a], b = a - 1;
        while (b >= 0 && HIT_X[b] > x) { HIT_X[b + 1] = HIT_X[b]; HIT_D[b + 1] = HIT_D[b]; b--; }
        HIT_X[b + 1] = x; HIT_D[b + 1] = d;
      }
      result = [];
      for (var h = 0, winding = 0, start = 0; h < n; h++) {
        var before = winding; winding += HIT_D[h];
        if (!before && winding) start = HIT_X[h];
        else if (before && !winding && HIT_X[h] > start) result.push([start, HIT_X[h]]);
      }
    }
    if (r.cache) r.cache.set(y, result);
    return result;
  }
  function intersect(a, b) {
    var result = [], i = 0, j = 0;
    while (i < a.length && j < b.length) {
      var lo = Math.max(a[i][0], b[j][0]), hi = Math.min(a[i][1], b[j][1]);
      if (hi > lo) result.push([lo, hi]);
      if (a[i][1] < b[j][1]) i++; else j++;
    }
    return result;
  }
  function merge(list) {
    list.sort(function (a, b) { return a[0] - b[0]; });
    var result = [];
    for (var i = 0; i < list.length; i++) {
      var last = result[result.length - 1];
      if (last && list[i][0] <= last[1]) last[1] = Math.max(last[1], list[i][1]);
      else result.push([list[i][0], list[i][1]]);
    }
    return result;
  }
  function inside(list, x) {
    for (var i = 0; i < list.length; i++) if (x >= list[i][0] && x < list[i][1]) return true;
    return false;
  }

  // Recording Canvas: CTM-transformed path points, nonzero clip stack with
  // save/restore, and fillRect records carrying their clip stack and alpha.
  function recorder() {
    var state = {matrix: [1, 0, 0, 1, 0, 0], clips: [], alpha: 1, fill: null, smoothing: true, quality: 'low'};
    var stack = [], subpaths = [], current = null, log = {fills: [], clips: [], stack: stack};
    function point(x, y) { var m = state.matrix; return {x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5]}; }
    var host = {
      log: log,
      save: function () { stack.push({matrix: state.matrix.slice(), clips: state.clips, alpha: state.alpha, fill: state.fill, smoothing: state.smoothing, quality: state.quality}); },
      restore: function () { var prior = stack.pop(); if (!prior) throw Error('SETUP unbalanced Canvas state'); state = prior; },
      beginPath: function () { subpaths = []; current = null; },
      moveTo: function (x, y) { current = [point(x, y)]; subpaths.push(current); },
      lineTo: function (x, y) { if (!current) { host.moveTo(x, y); return; } current.push(point(x, y)); },
      closePath: function () { if (current && current.length) { current = [current[0]]; subpaths.push(current); } },
      rect: function (x, y, w, h) {
        subpaths.push([point(x, y), point(x + w, y), point(x + w, y + h), point(x, y + h)]);
        current = [point(x, y)]; subpaths.push(current);
      },
      clip: function () {
        var clip = region(subpaths.filter(function (path) { return path.length > 2; }).map(function (path) { return path.slice(); }));
        state.clips = state.clips.concat([clip]); log.clips.push(clip);
      },
      transform: function (a, b, c, d, e, f) {
        var m = state.matrix;
        state.matrix = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]];
      },
      setTransform: function (a, b, c, d, e, f) { state.matrix = [a, b, c, d, e, f]; },
      createPattern: function (image, repetition) { return {source: image, repetition: repetition}; },
      fillRect: function (x, y, w, h) {
        var area = region([[point(x, y), point(x + w, y), point(x + w, y + h), point(x, y + h)]]);
        var minY = area.minY, maxY = area.maxY;
        state.clips.forEach(function (clip) { minY = Math.max(minY, clip.minY); maxY = Math.min(maxY, clip.maxY); });
        log.fills.push({alpha: state.alpha, fill: state.fill, clips: state.clips, area: area, minY: minY, maxY: maxY});
      }
    };
    [['globalAlpha', 'alpha', function (v) { return Number.isFinite(v) && v >= 0 && v <= 1; }],
     ['fillStyle', 'fill', function () { return true; }],
     ['imageSmoothingEnabled', 'smoothing', function () { return true; }],
     ['imageSmoothingQuality', 'quality', function () { return true; }]].forEach(function (property) {
      Object.defineProperty(host, property[0], {get: function () { return state[property[1]]; },
        set: function (value) { if (property[2](value)) state[property[1]] = value; }});
    });
    return host;
  }
  // Painted = fill parallelogram intersected with every clip on its stack.
  // skip names the face's own owner mask when only that face's owned samples
  // are tested: intersecting with it cannot change whether an owned sample is
  // painted, so omitting it there is exact, not an approximation.
  function painted(fill, y, skip) {
    var result = intervals(fill.area, y);
    for (var i = fill.clips.length - 1; i >= 0 && result.length; i--) {
      if (fill.clips[i] !== skip) result = intersect(result, intervals(fill.clips[i], y));
    }
    return result;
  }
  function paintedUnion(fills, y, skip) {
    var union = [];
    for (var i = 0; i < fills.length; i++) {
      var fill = fills[i];
      if (y < fill.minY || y >= fill.maxY) continue;
      var spans = painted(fill, y, skip);
      for (var s = 0; s < spans.length; s++) union.push(spans[s]);
    }
    return merge(union);
  }

  // Oracle choice: a sample point is textured when it lies in the painted
  // region of at least one OPAQUE pass issued for the same face. Every face
  // here uses one continuous mapping at caller alpha 1, so any covering opaque
  // pass hides the owner-mask base; which sibling triangle covers it is
  // irrelevant. A single-owner-draw rule would also flag unchanged interior
  // joins where two capped expandTriangle offsets meet (a separate,
  // pre-existing seam), so it cannot isolate this outline contract. The union
  // does not model antialiased conflation of two partial coverages: it is a
  // necessary geometric condition, and final pixels need a native browser.
  var OFFSETS = [0.02, 0.212, 0.404, 0.596, 0.788, 0.98];
  function opaque(fill) { return fill.alpha >= 1 - 1e-9; }
  function ownedRows(clip) {
    var rows = {}, count = 0;
    clip.subpaths.forEach(function (path) {
      if (path.length !== 4) throw Error('SETUP owner mask subpath is not a rectangle');
      var xs = path.map(function (p) { return p.x; }), ys = path.map(function (p) { return p.y; });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      if (![x0, x1, y0, y1].every(Number.isInteger) || x1 <= x0 || y1 <= y0) throw Error('SETUP owner mask is not integer pixel rectangles');
      for (var y = y0; y < y1; y++) { (rows[y] = rows[y] || []).push([x0, x1]); count += x1 - x0; }
    });
    var ys = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
    ys.forEach(function (y) { rows[y] = merge(rows[y]); });
    return {rows: rows, ys: ys, count: count};
  }
  // Every sample x+OFFSETS[i], y+OFFSETS[j] of every owned pixel is tested.
  // Gaps in the merged painted union are enumerated exactly, so a fully
  // covered row costs one walk over its intervals, not one lookup per sample.
  function coverage(owned, fills, skip) {
    var solid = fills.filter(opaque), report = {pixels: owned.count, points: owned.count * OFFSETS.length * OFFSETS.length, bare: 0, barePixels: 0, examples: []}, bad = {};
    function bare(x0, x1, g0, g1, y, oy) {
      for (var x = Math.max(x0, Math.floor(g0) - 1); x < x1 && x <= g1; x++) for (var p = 0; p < OFFSETS.length; p++) {
        var sx = x + OFFSETS[p];
        if (sx < g0 || sx >= g1) continue;
        report.bare++;
        if (!bad[x + ',' + y]) { bad[x + ',' + y] = true; report.barePixels++; if (report.examples.length < 4) report.examples.push([x, y, OFFSETS[p], oy]); }
      }
    }
    owned.ys.forEach(function (y) {
      for (var o = 0; o < OFFSETS.length; o++) {
        var union = paintedUnion(solid, y + OFFSETS[o], skip);
        owned.rows[y].forEach(function (span) {
          var cursor = span[0], j = 0;
          while (j < union.length && union[j][1] <= cursor) j++;
          for (;;) {
            var gapEnd = j < union.length ? Math.min(union[j][0], span[1]) : span[1];
            if (gapEnd > cursor) bare(span[0], span[1], cursor, gapEnd, y, OFFSETS[o]);
            if (j >= union.length || union[j][1] >= span[1]) break;
            cursor = Math.max(cursor, union[j][1]); j++;
          }
        });
      }
    });
    return report;
  }
  // Any pass, translucent or opaque, painting a sample of another owner's pixel.
  function paintedSamples(fills, owned) {
    var count = 0;
    owned.ys.forEach(function (y) {
      for (var o = 0; o < OFFSETS.length; o++) {
        var union = paintedUnion(fills, y + OFFSETS[o]);
        owned.rows[y].forEach(function (span) {
          for (var x = span[0]; x < span[1]; x++) for (var p = 0; p < OFFSETS.length; p++) if (inside(union, x + OFFSETS[p])) count++;
        });
      }
    });
    return count;
  }

  // Page-equivalent face painting (structure-preview.html paint()): production
  // owner mask, opaque base, then the texture mapper under that same clip.
  function runScene(faces, config) {
    var host = recorder(), entries = [];
    G.ctx = host;
    G.beginSceneDepthFrame(W, H);
    faces.forEach(function (face) {
      var entry = {face: face, owner: null, fills: [], triangles: [], planar: null, planarClips: [], work: null};
      entry.visible = G.withSceneDepthClip(face.points, function () {
        host.save();
        try {
          G._traceSceneDepthPixelMask(G._sceneDepthClipGeneration, G._sceneDepthClipMinY, G._sceneDepthClipMaxY);
          host.clip(); entry.owner = host.log.clips[host.log.clips.length - 1];
          entry.owner.cache = new Map();
          host.fillStyle = '#000000'; host.fillRect(0, 0, W, H);
          if (face.occluder) return;
          var firstFill = host.log.fills.length, firstClip = host.log.clips.length;
          if (config.mode === 'planar') {
            entry.planar = T.drawPlanarFace(host, face.points, config.material || MATERIAL, {width: W, height: H, maxStrips: 384,
              filter: config.filter || 'stable', stats: {}, ownedPixels: config.owned,
              visibleBounds: {minX: G._sceneDepthClipMinX, maxX: G._sceneDepthClipMaxX, minY: G._sceneDepthClipMinY, maxY: G._sceneDepthClipMaxY}});
            entry.planarClips = host.log.clips.slice(firstClip);
          } else {
            entry.work = T.tessellate(face.points, {width: W, height: H, maxTriangles: 256, maxDepth: 7, errorPixels: 0.65}, function (a, b, c, flags) {
              var clipStart = host.log.clips.length, fillStart = host.log.fills.length;
              var ok = T.drawTriangle(host, a, b, c, config.material || MATERIAL, {filter: config.filter || 'stable', stats: {}, ownedPixels: config.owned, boundary: flags});
              entry.triangles.push({a: a, b: b, c: c, flags: flags, ok: ok,
                clips: host.log.clips.slice(clipStart), fills: host.log.fills.slice(fillStart)});
            });
          }
          entry.fills = host.log.fills.slice(firstFill);
        } finally { host.restore(); }
      }, {writeDepth: true, depthBias: 0, _paintsDepthPixels: true});
      entry.owned = entry.owner ? ownedRows(entry.owner) : {rows: {}, ys: [], count: 0};
      if (entry.owned.count !== entry.visible) throw Error('SETUP traced owner mask disagrees with production visible count');
      entries.push(entry);
    });
    if (host.log.stack.length) throw Error('SETUP unbalanced Canvas state after scene');
    return entries;
  }

  // Fixtures. Codex join: q=0.006+slope*(x-s), depth=1/q, UV/q affine.
  function codexVertex(x, y, s, slope) {
    var q = 0.006 + slope * (x - s);
    return {x: x, y: y, depth: 1 / q, u: (0.0001 * x + 0.00002 * y) / q, v: (0.000002 * x + 0.00002 * y) / q};
  }
  function transposedVertex(x, y, t, slope) {
    var q = 0.006 + slope * (y - t);
    return {x: x, y: y, depth: 1 / q, u: (0.0001 * y + 0.00002 * x) / q, v: (0.000002 * y + 0.00002 * x) / q};
  }
  function codex(phase, orientation, reversed, occluder) {
    var first, second, join;
    if (orientation === 'vertical') {
      var s = 178 + phase;
      first = {tag: 'left', points: [[30, 40], [s, 20], [s, 220], [30, 190]].map(function (p) { return codexVertex(p[0], p[1], s, 0.000004); })};
      second = {tag: 'right', points: [[s, 20], [325, 45], [325, 190], [s, 220]].map(function (p) { return codexVertex(p[0], p[1], s, -0.000004); })};
      join = {axis: 'x', at: s, from: 20, to: 220};
    } else {
      var t = 118 + phase;
      first = {tag: 'top', points: [[40, 10], [20, t], [340, t], [320, 10]].map(function (p) { return transposedVertex(p[0], p[1], t, 0.000004); })};
      second = {tag: 'bottom', points: [[20, t], [45, 230], [315, 230], [340, t]].map(function (p) { return transposedVertex(p[0], p[1], t, -0.000004); })};
      join = {axis: 'y', at: t, from: 40, to: 320};
    }
    var faces = reversed ? [second, first] : [first, second];
    if (occluder) {
      // Nearer opaque face over the join: q=0.012, half the join depth.
      var block = {tag: 'occluder', occluder: true, points: [[165.3, 95.6], [191.7, 95.6], [191.7, 140.4], [165.3, 140.4]].map(function (p) {
        return {x: p[0] + phase, y: p[1], depth: 1 / 0.012, u: 0, v: 0}; })};
      faces = occluder === 'first' ? [block].concat(faces) : faces.concat([block]);
    }
    return {faces: faces, join: join, phase: phase};
  }
  // Long thin triangle from the tessellated right face: acute outline corners.
  function longThin(phase) {
    var s = 178 + phase;
    return {faces: [{tag: 'long-thin', points: [[s, 20], [196.8, 91.25], [s, 220]].map(function (p) {
      return {x: p[0], y: p[1], depth: 100, u: p[0] / 256, v: p[1] / 256}; })}], phase: phase};
  }
  // Receding wall partly left of and above the viewport: q=0.004+0.00002(x+40).
  function viewportCrop() {
    return {faces: [{tag: 'viewport-crop', points: [[-40, -30], [150, 10], [150, 120], [-40, 200]].map(function (p) {
      var q = 0.004 + 0.00002 * (p[0] + 40);
      return {x: p[0], y: p[1], depth: 1 / q, u: (0.0001 * p[0] + 0.00002 * p[1]) / q, v: (0.000002 * p[0] + 0.00002 * p[1]) / q}; })}]};
  }
  // Camera params C built directly, not by getCam3D: eye at world (0,0), yaw 0
  // (forward +x, right +y), invTanHalf 1 (90 degree horizontal field), 360x240
  // screen, horizon row 120, eye height 10, projScale 120 px per height unit at
  // depth 1. The wall y=3 spans x=-2..40 (behind the near plane at x=-2) and
  // z=0..14; UVs are world x/4 and z/4 tile repeats.
  var NEAR_CAMERA = {x: 0, y: 0}, NEAR_C = {cosAng: 1, sinAng: 0, invTanHalf: 1, w: W, h: H, horizonY: 120, cameraZ: 10}, NEAR_SCALE = 120;
  var NEAR_WORLD = [[-2, 0], [40, 0], [40, 14], [-2, 14]].map(function (p) { return {x: p[0], y: 3, z: p[1], u: p[0] / 4, v: p[1] / 4}; });
  var NEAR_POINTS = T.clipNear(NEAR_WORLD, NEAR_CAMERA, NEAR_C, NEAR_SCALE);
  function nearPlane() { return {faces: [{tag: 'near-plane', points: NEAR_POINTS}]}; }
  // 0.4 px wide wall seen almost edge-on; q=0.006+0.00001(y-120).
  function sliver(phase) {
    var x0 = 100.3 + phase;
    return {faces: [{tag: 'sliver', points: [[x0, 50], [x0 + 0.4, 52], [x0 + 0.4, 190], [x0, 188]].map(function (p) {
      var q = 0.006 + 0.00001 * (p[1] - 120);
      return {x: p[0], y: p[1], depth: 1 / q, u: (0.0001 * p[0] + 0.00002 * p[1]) / q, v: (0.000002 * p[0] + 0.00002 * p[1]) / q}; })}],
      phase: phase, x0: x0};
  }

  // ---- Controls for the recording host and the oracle itself.
  var control = recorder();
  control.save(); control.beginPath();
  control.moveTo(0, 0); control.lineTo(4, 0); control.lineTo(4, 4); control.lineTo(0, 4); control.closePath();
  control.moveTo(2, 0); control.lineTo(6, 0); control.lineTo(6, 4); control.lineTo(2, 4); control.closePath();
  control.clip(); var sameWinding = intervals(control.log.clips[0], 1);
  control.restore(); control.save(); control.beginPath();
  control.moveTo(0, 0); control.lineTo(4, 0); control.lineTo(4, 4); control.lineTo(0, 4); control.closePath();
  control.moveTo(2, 0); control.lineTo(2, 4); control.lineTo(6, 4); control.lineTo(6, 0); control.closePath();
  control.clip(); var opposite = intervals(control.log.clips[1], 1);
  control.restore(); control.save(); control.transform(2, 0, 0, 3, 5, 7); control.beginPath(); control.rect(1, 1, 2, 1); control.clip();
  control.fillRect(0, 0, 10, 10); control.restore(); control.fillRect(0, 0, 1, 1);
  var transformed = control.log.fills[0], restored = control.log.fills[1];
  check('recording canvas resolves nonzero unions opposite winding holes transforms and clip save restore',
    JSON.stringify(sameWinding) === '[[0,6]]' && JSON.stringify(opposite) === '[[0,2],[4,6]]' &&
    JSON.stringify(painted(transformed, 11)) === '[[7,11]]' && painted(transformed, 9.9).length === 0 &&
    restored.clips.length === 0 && control.log.stack.length === 0, {sameWinding: sameWinding, opposite: opposite});

  function syntheticCoverage(paths, alpha) {
    var host = recorder();
    host.save(); host.beginPath(); host.rect(10, 10, 1, 1); host.clip();
    var owned = ownedRows(host.log.clips[0]);
    host.save(); host.beginPath();
    paths.forEach(function (path) { host.moveTo(path[0][0], path[0][1]); path.slice(1).forEach(function (p) { host.lineTo(p[0], p[1]); }); host.closePath(); });
    host.clip(); host.globalAlpha = alpha; host.fillRect(0, 0, 40, 40); host.restore(); host.restore();
    return coverage(owned, host.log.fills);
  }
  var wide = [[9.5, 9.5], [11.5, 9.5], [11.5, 11.5], [9.5, 11.5]];
  var fullCover = syntheticCoverage([wide], 1);
  var shortCover = syntheticCoverage([[[9.5, 9.5], [10.9, 9.5], [10.9, 11.5], [9.5, 11.5]]], 1);
  var cancelled = syntheticCoverage([wide, [[10.9, 9], [10.9, 12], [12, 12], [12, 9]]], 1);
  var translucent = syntheticCoverage([wide], 0.75);
  check('coverage oracle rejects bare subpixel strips cancelled windings and translucent passes but accepts full cover',
    fullCover.points === 36 && fullCover.bare === 0 && shortCover.bare === 6 && cancelled.bare === 6 && translucent.bare === 36,
    {full: fullCover, short: shortCover, cancelled: cancelled, translucent: translucent});

  // ---- Scenes.
  var codexConfigs = [['vertical', false], ['vertical', true], ['horizontal', false], ['horizontal', true]];
  function label(config) { return config[0] + (config[1] ? '-reversed' : ''); }
  var triangleCodex = {}, planarCodex = {};
  codexConfigs.forEach(function (config) {
    triangleCodex[label(config)] = PHASES.map(function (phase) { var fixture = codex(phase, config[0], config[1]); fixture.entries = runScene(fixture.faces, {mode: 'triangles', owned: true}); return fixture; });
    planarCodex[label(config)] = PHASES.map(function (phase) { var fixture = codex(phase, config[0], config[1]); fixture.entries = runScene(fixture.faces, {mode: 'planar', owned: true}); return fixture; });
  });
  var legacyCodex = SPOT.map(function (phase) { var f = codex(phase, 'vertical', false); f.entries = runScene(f.faces, {mode: 'triangles', owned: true, filter: 'legacy'}); return f; });
  var occluded = [];
  ['first', 'last'].forEach(function (order) {
    SPOT.forEach(function (phase) { var f = codex(phase, 'vertical', false, order); f.order = order; f.entries = runScene(f.faces, {mode: 'triangles', owned: true}); occluded.push(f); });
  });
  function both(builder, phases, mode) {
    return phases.map(function (phase) {
      var owned = builder(phase), unowned = builder(phase);
      owned.entries = runScene(owned.faces, {mode: mode, owned: true});
      unowned.entries = runScene(unowned.faces, {mode: mode, owned: false});
      return {owned: owned, unowned: unowned};
    });
  }
  var thinRuns = both(longThin, PHASES, 'triangles');
  var sliverRuns = both(sliver, PHASES, 'triangles');
  var cropRuns = both(viewportCrop, [0], 'triangles');
  var nearRuns = both(nearPlane, [0], 'triangles');
  var codexOldRuns = both(function (phase) { return codex(phase, 'vertical', false); }, PHASES, 'triangles');
  var codexPairRuns = both(function (phase) { return codex(phase, 'horizontal', true); }, PHASES, 'triangles');
  var planarOldRuns = both(function (phase) { return codex(phase, 'vertical', false); }, SPOT, 'planar');
  var planarOthers = [[sliver, PHASES], [viewportCrop, [0]], [nearPlane, [0]]].map(function (item) {
    return item[1].map(function (phase) { var f = item[0](phase); f.entries = runScene(f.faces, {mode: 'planar', owned: true}); return f; });
  });

  // ---- Fixture preconditions (independent of the mapper under test).
  var joinMisses = [];
  codexConfigs.forEach(function (config) {
    triangleCodex[label(config)].forEach(function (fixture) {
      var join = fixture.join, cell = Math.floor(join.at);
      if (cell === join.at) return;
      var straddles = 0;
      for (var along = join.from; along < join.to; along++) {
        if (fixture.entries.some(function (entry) {
          var x = join.axis === 'x' ? cell : along, y = join.axis === 'x' ? along : cell;
          return (entry.owned.rows[y] || []).some(function (span) { return x >= span[0] && x < span[1]; });
        })) straddles++;
      }
      if (straddles < join.to - join.from - 10) joinMisses.push({config: label(config), phase: fixture.phase, straddles: straddles});
    });
  });
  check('codex join fixtures own pixels whose centers are inside but whose squares cross the join at every fractional phase',
    joinMisses.length === 0, joinMisses);

  function cornerAngle(p, a, b) {
    var ax = a.x - p.x, ay = a.y - p.y, bx = b.x - p.x, by = b.y - p.y;
    return Math.acos((ax * bx + ay * by) / Math.hypot(ax, ay) / Math.hypot(bx, by));
  }
  var thinFace = longThin(0.5).faces[0].points;
  var acute = [cornerAngle(thinFace[0], thinFace[1], thinFace[2]), cornerAngle(thinFace[2], thinFace[0], thinFace[1])];
  // An uncapped 0.7 px miter needs 0.7/sin(angle/2) px; the 3 px cap then
  // leaves only 3*sin(angle/2) px of perpendicular outline offset.
  var cappedOffsets = acute.map(function (angle) { return 3 * Math.sin(angle / 2); });
  var thinWhole = thinRuns.every(function (run) {
    return run.owned.entries[0].triangles.length === 1;
  });
  check('long thin triangle fixture is emitted whole with outline miters capped to under 0.4 px',
    thinWhole && acute.every(function (angle) { return 0.7 / Math.sin(angle / 2) > 3; }) && cappedOffsets.every(function (offset) { return offset < 0.4; }),
    {angles: acute.map(function (a) { return a * 180 / Math.PI; }), offsets: cappedOffsets, whole: thinWhole});

  var crop = cropRuns[0].owned.entries[0], near = nearRuns[0].owned.entries[0];
  var nearCuts = NEAR_POINTS.filter(function (p) { return p.depth === 1; });
  var farCorner = NEAR_POINTS.filter(function (p) { return Math.abs(p.depth - 40) < 1e-9 && Math.abs(p.v) < 1e-12; })[0];
  function ownsAt(entry, x, y) { return (entry.owned.rows[y] || []).some(function (span) { return x >= span[0] && x < span[1]; }); }
  check('viewport and near plane fixtures are genuinely cropped and still own visible edge pixels',
    crop.owned.count > 10000 && ownsAt(crop, 0, 100) && ownsAt(crop, 50, 0) && crop.face.points.some(function (p) { return p.x < 0; }) &&
    NEAR_WORLD[0].x - NEAR_CAMERA.x < 1 && nearCuts.length === 2 && nearCuts.every(function (p) { return p.x > W; }) &&
    farCorner && Math.abs(farCorner.x - 193.5) < 1e-9 && Math.abs(farCorner.y - 150) < 1e-9 &&
    near.owned.count > 10000 && ownsAt(near, W - 1, 120),
    {crop: crop.owned.count, near: near.owned.count, cuts: nearCuts, far: farCorner});

  // Owned iff some pixel-center column c+0.5 lies within [x0, x0+0.4].
  var sliverMismatch = sliverRuns.filter(function (run) {
    var x0 = run.owned.x0, column = Math.ceil(x0 - 0.5), predicted = column + 0.5 <= x0 + 0.4;
    var entry = run.owned.entries[0], only = entry.owned.ys.every(function (y) {
      return entry.owned.rows[y].length === 1 && entry.owned.rows[y][0][0] === column && entry.owned.rows[y][0][1] === column + 1;
    });
    return predicted !== entry.owned.count > 0 || !only;
  }).map(function (run) { return run.owned.phase; });
  var sliverOwnedPhases = sliverRuns.filter(function (run) { return run.owned.entries[0].owned.count > 0; }).length;
  check('sliver owns pixel centers exactly at the analytically predicted phases and nowhere else',
    sliverMismatch.length === 0 && sliverOwnedPhases === 8, {mismatch: sliverMismatch, ownedPhases: sliverOwnedPhases});

  var allTriangleFixtures = [];
  Object.keys(triangleCodex).forEach(function (key) { allTriangleFixtures = allTriangleFixtures.concat(triangleCodex[key]); });
  allTriangleFixtures = allTriangleFixtures.concat(legacyCodex, occluded);
  [thinRuns, sliverRuns, cropRuns, nearRuns, codexOldRuns, codexPairRuns].forEach(function (runs) { runs.forEach(function (run) { allTriangleFixtures.push(run.owned); }); });
  var passCounts = {one: 0, two: 0, failedDraws: 0, translucentFirst: 0, rejected: 0};
  allTriangleFixtures.forEach(function (fixture) {
    fixture.entries.forEach(function (entry) {
      if (entry.work && entry.work.rejected) passCounts.rejected++;
      entry.triangles.forEach(function (tri) {
        if (!tri.ok) passCounts.failedDraws++;
        if (tri.fills.length === 1) passCounts.one++; else if (tri.fills.length === 2) passCounts.two++;
        if (!tri.fills.length || !opaque(tri.fills[0])) passCounts.translucentFirst++;
      });
    });
  });
  check('triangle fixtures draw every triangle with an opaque first pass through both one pass and two pass sampling',
    passCounts.one > 0 && passCounts.two > 0 && !passCounts.failedDraws && !passCounts.translucentFirst && !passCounts.rejected, passCounts);

  // ---- Triangle owner-mask coverage.
  function sweep(fixtures) {
    var summary = {faces: 0, pixels: 0, points: 0, bare: 0, barePixels: 0, failures: []};
    fixtures.forEach(function (fixture) {
      fixture.entries.forEach(function (entry) {
        if (entry.face.occluder) return;
        var report = coverage(entry.owned, entry.fills, entry.owner);
        summary.faces++; summary.pixels += report.pixels; summary.points += report.points;
        summary.bare += report.bare; summary.barePixels += report.barePixels;
        if (report.bare && summary.failures.length < 4) summary.failures.push({face: entry.face.tag, phase: fixture.phase, order: fixture.order, bare: report.bare, pixels: report.barePixels, examples: report.examples});
      });
    });
    return summary;
  }
  function covered(summary, faces) { return summary.faces === faces && summary.pixels > 0 && summary.bare === 0; }
  var vertical = sweep(triangleCodex['vertical'].concat(triangleCodex['vertical-reversed']));
  check('codex vertical join triangles cover every owned pixel point in both face orders at all 17 phases', covered(vertical, 68), vertical);
  var horizontal = sweep(triangleCodex['horizontal'].concat(triangleCodex['horizontal-reversed']));
  check('codex horizontal join triangles cover every owned pixel point in both face orders at all 17 phases', covered(horizontal, 68), horizontal);
  var legacy = sweep(legacyCodex);
  check('legacy filter triangles cover every owned codex join pixel point', covered(legacy, 2 * SPOT.length), legacy);
  var occludedCoverage = sweep(occluded), leaks = 0, hiddenPixels = 0;
  occluded.filter(function (f) { return f.order === 'first'; }).forEach(function (fixture) {
    var blocker = fixture.entries[0];
    hiddenPixels += blocker.owned.count;
    fixture.entries.slice(1).forEach(function (entry) { leaks += paintedSamples(entry.fills, blocker.owned); });
  });
  check('nearer occluder first or last keeps owned coverage and textures never paint occluder pixels',
    covered(occludedCoverage, 4 * SPOT.length) && hiddenPixels > SPOT.length * 1000 && leaks === 0, {coverage: occludedCoverage, hidden: hiddenPixels, leaks: leaks});
  var thin = sweep(thinRuns.map(function (run) { return run.owned; }));
  check('long thin triangle with capped miters covers every owned pixel point at all 17 phases', covered(thin, 17), thin);
  var cropped = sweep(cropRuns.map(function (run) { return run.owned; }));
  check('viewport cropped face triangles cover every owned pixel point', covered(cropped, 1), cropped);
  var nearCoverage = sweep(nearRuns.map(function (run) { return run.owned; }));
  check('near plane cropped face triangles cover every owned pixel point', covered(nearCoverage, 1), nearCoverage);
  var sliverCoverage = sweep(sliverRuns.map(function (run) { return run.owned; }));
  check('owned sliver pixels are fully covered by triangle textures at every phase that owns them',
    sliverCoverage.pixels > 8 * 100 && sliverCoverage.bare === 0, sliverCoverage);

  // Negative control: the same oracle must detect the pre-owner clip. At join
  // phases 7..9/16 the owned join pixel extends >=0.4375 px beyond the face,
  // more than the largest capped miter offset (0.376 px, checked above). The
  // thin triangle's slanted outline edges cross pixels near its capped acute
  // corners at every phase; every owned sliver pixel is 0.4 px wide inside.
  function barePhases(runs) {
    return runs.filter(function (run) { return sweep([run.unowned]).bare > 0; }).map(function (run) { return run.unowned.phase * 16; });
  }
  var oldCodex = barePhases(codexOldRuns.filter(function (run) { return SPOT.indexOf(run.unowned.phase) >= 0; }));
  var oldThin = barePhases(thinRuns), oldSliver = barePhases(sliverRuns);
  var sliverOwnedList = sliverRuns.filter(function (run) { return run.owned.entries[0].owned.count > 0; }).map(function (run) { return run.owned.phase * 16; });
  check('without ownedPixels the same oracle finds bare owned edge area at the join thin corners and sliver',
    [7, 8, 9].every(function (k) { return oldCodex.indexOf(k) >= 0; }) && oldThin.length === 17 &&
    JSON.stringify(oldSliver) === JSON.stringify(sliverOwnedList),
    {codex: oldCodex, thin: oldThin, sliver: oldSliver, sliverOwned: sliverOwnedList});

  // ---- Boundary flags, interior parity and skirt geometry.
  function insideConvex(point, polygon) {
    var sign = 0;
    for (var i = 0; i < polygon.length; i++) {
      var a = polygon[i], b = polygon[(i + 1) % polygon.length];
      var cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
      if (Math.abs(cross) < 1e-9 * Math.hypot(b.x - a.x, b.y - a.y)) return false;
      if (!sign) sign = cross > 0 ? 1 : -1; else if (cross * sign < 0) return false;
    }
    return true;
  }
  function insideVisibleFace(point, polygon) { return point.x > 0 && point.x < W && point.y > 0 && point.y < H && insideConvex(point, polygon); }
  // True iff segment pq lies along the input polygon's own outline and not on
  // a viewport border: nothing beyond the canvas is owned, so cuts get no skirt.
  function onOutline(p, q, polygon) {
    var eps = 1e-6, borders = [['x', 0], ['x', W], ['y', 0], ['y', H]];
    for (var b = 0; b < borders.length; b++) if (Math.abs(p[borders[b][0]] - borders[b][1]) < eps && Math.abs(q[borders[b][0]] - borders[b][1]) < eps) return false;
    for (var i = 0; i < polygon.length; i++) {
      var A = polygon[i], B = polygon[(i + 1) % polygon.length], dx = B.x - A.x, dy = B.y - A.y, length = Math.hypot(dx, dy);
      if (length < 1e-12) continue;
      var ok = [p, q].every(function (P) {
        var distance = Math.abs(dx * (P.y - A.y) - dy * (P.x - A.x)) / length, along = (dx * (P.x - A.x) + dy * (P.y - A.y)) / length;
        return distance < eps && along > -eps && along < length + eps;
      });
      if (ok) return true;
    }
    return false;
  }
  var flagStats = {edges: 0, outline: 0, interior: 0, wrong: []};
  allTriangleFixtures.forEach(function (fixture) {
    fixture.entries.forEach(function (entry) {
      entry.triangles.forEach(function (tri) {
        var corners = [tri.a, tri.b, tri.c];
        for (var i = 0; i < 3; i++) {
          var expected = onOutline(corners[i], corners[(i + 1) % 3], entry.face.points);
          flagStats.edges++; if (expected) flagStats.outline++; else flagStats.interior++;
          if (tri.flags[i] !== expected && flagStats.wrong.length < 4) flagStats.wrong.push({face: entry.face.tag, phase: fixture.phase, edge: i, flag: tri.flags[i], p: corners[i], q: corners[(i + 1) % 3]});
        }
      });
    });
  });
  check('tessellate boundary flags mark exactly the face outline edges and never viewport cuts',
    flagStats.outline > 1000 && flagStats.interior > 1000 && !flagStats.wrong.length, flagStats);

  function subpathJSON(clip) { return JSON.stringify(clip.subpaths); }
  var pairs = [];
  [thinRuns, sliverRuns, cropRuns, nearRuns, codexOldRuns, codexPairRuns].forEach(function (runs) {
    runs.forEach(function (run) {
      run.owned.entries.forEach(function (entry, index) {
        var other = run.unowned.entries[index];
        if (entry.triangles.length !== other.triangles.length) throw Error('SETUP owned and unowned tessellations differ');
        entry.triangles.forEach(function (tri, t) {
          var peer = other.triangles[t];
          if (JSON.stringify([tri.a, tri.b, tri.c]) !== JSON.stringify([peer.a, peer.b, peer.c])) throw Error('SETUP owned and unowned triangles differ');
          pairs.push({owned: tri, unowned: peer, face: entry.face});
        });
      });
    });
  });
  var interior = pairs.filter(function (pair) { return !pair.owned.flags.some(Boolean); });
  var interiorWrong = interior.filter(function (pair) {
    var tri = pair.owned, expanded = JSON.stringify([T.expandTriangle(tri.a, tri.b, tri.c)]), clip = T.ownedClip(tri.a, tri.b, tri.c, tri.flags);
    return !clip || JSON.stringify(clip.polygons) !== expanded || !tri.clips.length || tri.clips.length !== pair.unowned.clips.length ||
      tri.clips.some(function (issued, pass) { return subpathJSON(issued) !== subpathJSON(pair.unowned.clips[pass]); });
  });
  check('triangles without outline edges issue exactly the unowned expandTriangle clip', interior.length > 50 && !interiorWrong.length,
    {interior: interior.length, wrong: interiorWrong.length});

  var legacyWrong = pairs.filter(function (pair) {
    var tri = pair.unowned, expanded = JSON.stringify([T.expandTriangle(tri.a, tri.b, tri.c)]);
    return !tri.clips.length || tri.clips.some(function (issued) { return subpathJSON(issued) !== expanded; });
  });
  check('without ownedPixels drawTriangle issues exactly expandTriangle for every pass', pairs.length > 500 && !legacyWrong.length,
    {pairs: pairs.length, wrong: legacyWrong.length});

  var outlinePairs = pairs.filter(function (pair) { return pair.owned.flags.some(Boolean); }), outlineWrong = [];
  outlinePairs.forEach(function (pair) {
    var tri = pair.owned, expanded = JSON.stringify(pair.unowned.clips[0].subpaths[0]), skirts = tri.flags.filter(Boolean).length;
    var bad = !tri.clips.length || tri.clips.length !== pair.unowned.clips.length || tri.clips.some(function (issued) {
      return issued.subpaths.length !== 1 + skirts || JSON.stringify(issued.subpaths[0]) !== expanded || subpathJSON(issued) !== subpathJSON(tri.clips[0]);
    });
    if (bad && outlineWrong.length < 4) outlineWrong.push({face: pair.face.tag, flags: tri.flags, subpaths: tri.clips.map(function (c) { return c.subpaths.length; })});
  });
  check('outline triangles keep the unowned expanded triangle first and add one skirt per outline edge on every pass',
    outlinePairs.length > 300 && !outlineWrong.length, {outline: outlinePairs.length, wrong: outlineWrong});

  function signedArea(path) {
    var sum = 0;
    for (var i = 0; i < path.length; i++) { var p = path[i], q = path[(i + 1) % path.length]; sum += p.x * q.y - q.x * p.y; }
    return sum / 2;
  }
  var skirtStats = {skirts: 0, misplaced: [], outside: 0, winding: 0};
  outlinePairs.forEach(function (pair) {
    var tri = pair.owned, corners = [tri.a, tri.b, tri.c], issued = tri.clips[0], next = 1;
    if (!issued) return;
    var triangleSign = signedArea(corners) > 0 ? 1 : -1;
    for (var i = 0; i < 3; i++) {
      if (!tri.flags[i]) continue;
      var skirt = issued.subpaths[next++];
      if (!skirt) { skirtStats.misplaced.push({missing: i}); continue; }
      var p = corners[i], q = corners[(i + 1) % 3], r = corners[(i + 2) % 3], length = Math.hypot(q.x - p.x, q.y - p.y);
      var ex = (q.x - p.x) / length, ey = (q.y - p.y) / length, nx = -ey, ny = ex;
      if ((r.x - p.x) * nx + (r.y - p.y) * ny > 0) { nx = -nx; ny = -ny; }
      skirtStats.skirts++;
      var measures = skirt.map(function (v) { return {along: (v.x - p.x) * ex + (v.y - p.y) * ey, out: (v.x - p.x) * nx + (v.y - p.y) * ny}; });
      var alongs = measures.map(function (m) { return m.along; }), outs = measures.map(function (m) { return m.out; });
      var placed = Math.min.apply(null, outs) > -1e-9 && Math.max.apply(null, outs) < 2 + 1e-9 && Math.max.apply(null, outs) > 2 - 1e-9 &&
        Math.min.apply(null, alongs) > -2 - 1e-9 && Math.min.apply(null, alongs) < -2 + 1e-9 &&
        Math.max.apply(null, alongs) < length + 2 + 1e-9 && Math.max.apply(null, alongs) > length + 2 - 1e-9;
      if (!placed && skirtStats.misplaced.length < 4) skirtStats.misplaced.push({face: pair.face.tag, measures: measures, length: length});
      // Interior probes of the skirt quad: none may fall inside the visible face.
      var centroid = {x: 0, y: 0};
      skirt.forEach(function (v) { centroid.x += v.x / skirt.length; centroid.y += v.y / skirt.length; });
      var probes = [centroid].concat(skirt.map(function (v) { return {x: 0.98 * v.x + 0.02 * centroid.x, y: 0.98 * v.y + 0.02 * centroid.y}; }));
      if (probes.some(function (probe) { return insideVisibleFace(probe, pair.face.points); })) skirtStats.outside++;
      if ((signedArea(skirt) > 0 ? 1 : -1) !== triangleSign) skirtStats.winding++;
    }
  });
  check('each skirt lies outside the face within 2 px of its outline edge line and 2 px beyond its ends',
    skirtStats.skirts > 300 && !skirtStats.misplaced.length && !skirtStats.outside, skirtStats);
  check('skirts share their triangle winding so the nonzero clip is a union', skirtStats.skirts > 300 && !skirtStats.winding, skirtStats);

  // ---- Planar strips.
  var planarFixtures = [];
  Object.keys(planarCodex).forEach(function (key) { planarFixtures = planarFixtures.concat(planarCodex[key]); });
  planarOthers.forEach(function (list) { planarFixtures = planarFixtures.concat(list); });
  var planarAxes = {x: 0, y: 0}, planarDeclined = [];
  planarFixtures.forEach(function (fixture) {
    fixture.entries.forEach(function (entry) {
      if (!entry.owned.count) return;
      if (!entry.planar || !entry.planar.handled || entry.planar.failed || !entry.planar.strips) planarDeclined.push({face: entry.face.tag, phase: fixture.phase, result: entry.planar});
      else planarAxes[entry.planar.axis]++;
    });
  });
  check('planar fixtures are handled as one pixel strips in both orientations', !planarDeclined.length && planarAxes.x > 0 && planarAxes.y > 0,
    {declined: planarDeclined.slice(0, 4), axes: planarAxes});
  function bandRectangle(clip) {
    if (clip.subpaths.length !== 1 || clip.subpaths[0].length !== 4) return false;
    var xs = clip.subpaths[0].map(function (p) { return p.x; }), ys = clip.subpaths[0].map(function (p) { return p.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var axisAligned = clip.subpaths[0].every(function (p) { return (p.x === x0 || p.x === x1) && (p.y === y0 || p.y === y1); });
    return axisAligned && [x0, x1, y0, y1].every(Number.isInteger) &&
      ((x1 - x0 === 1 && y0 === 0 && y1 === H) || (y1 - y0 === 1 && x0 === 0 && x1 === W));
  }
  var outlineClips = 0, planarClipCount = 0;
  planarFixtures.forEach(function (fixture) {
    fixture.entries.forEach(function (entry) {
      entry.planarClips.forEach(function (clip) { planarClipCount++; if (!bandRectangle(clip)) outlineClips++; });
    });
  });
  check('planar ownedPixels issues no face outline clip only one pixel band rectangles', planarClipCount > 1000 && outlineClips === 0,
    {clips: planarClipCount, nonBand: outlineClips});
  var planarCoverage = sweep(planarFixtures);
  check('planar ownedPixels paints every owned pixel point with an opaque band pass',
    planarCoverage.faces === 136 + 17 + 2 && planarCoverage.pixels > 0 && planarCoverage.bare === 0, planarCoverage);
  var planarOld = planarOldRuns.map(function (run) {
    var nonBand = 0;
    run.unowned.entries.forEach(function (entry) { entry.planarClips.forEach(function (clip) { if (!bandRectangle(clip)) nonBand++; }); });
    return {phase: run.unowned.phase * 16, nonBand: nonBand, bare: sweep([run.unowned]).bare};
  });
  check('without ownedPixels planar keeps its face outline clip and the oracle finds bare edge area',
    planarOld.length === SPOT.length && planarOld.every(function (row) { return row.nonBand === 2 && row.bare > 0; }), planarOld);
  var escaped = 0, passes = 0;
  allTriangleFixtures.concat(planarFixtures).forEach(function (fixture) {
    fixture.entries.forEach(function (entry) {
      entry.fills.forEach(function (fill) { passes++; if (fill.clips[0] !== entry.owner) escaped++; });
    });
  });
  check('every texture pass stays inside its face production owner mask clip', passes > 10000 && !escaped, {passes: passes, escaped: escaped});
  var declineHost = recorder(), declines = [1, 'true', null, {}].map(function (value) {
    var result = T.drawPlanarFace(declineHost, codex(0.25, 'vertical', false).faces[0].points, MATERIAL, {width: W, height: H, maxStrips: 384, ownedPixels: value});
    return !result.handled && result.reason === 'invalid-input';
  });
  check('non boolean ownedPixels declines planar drawing before any paint',
    declines.every(Boolean) && !declineHost.log.fills.length && !declineHost.log.clips.length, declines);

  out('TEXTURE_COVERAGE_RESULT ' + (failed ? 'FAIL ' + failed + '/' : 'PASS ') + checked);
}());
undefined;
