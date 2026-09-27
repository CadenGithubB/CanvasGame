// Development-only Canvas texture pilot. This file is deliberately absent from
// the shipping game manifest. UV coordinates are measured in tile repeats.
// The scene owns lighting, culling and the production opaque depth/pixel mask.
var TexturePilot = (function () {
  var patternCaches = new WeakMap();
  var preparedMaterials = new WeakMap();

  // Periodic, centered box integration sampled at an explicitly chosen spatial
  // density. Ordinary nonoverlapping mip texels lose the position of a narrow
  // feature within a large box. Four samples per filter footprint preserve that
  // phase much better without adding render-time samples. Each level is made
  // directly from the original image, not a chain of already rounded averages.
  function prefilterMipPixels(pixels, size, footprint, outputSize) {
    if (!Number.isInteger(size) || size < 1 || size > 128 || (size & (size - 1)) ||
        !Number.isInteger(footprint) || footprint < 1 || footprint > size || (footprint & (footprint - 1)) ||
        !Number.isInteger(outputSize) || outputSize < 1 || outputSize > 128 || (outputSize & (outputSize - 1)) ||
        !pixels || pixels.length !== size * size * 4) throw new RangeError('Invalid centered mip source');
    for (var channel = 0; channel < pixels.length; channel++) {
      if (!Number.isInteger(pixels[channel]) || pixels[channel] < 0 || pixels[channel] > 255) throw new RangeError('Invalid centered mip channel');
    }
    var weights = [];
    for (var coordinate = 0; coordinate < outputSize; coordinate++) {
      var center = (coordinate + 0.5) * size / outputSize;
      var start = center - footprint * 0.5, end = center + footprint * 0.5, taps = [];
      for (var sample = Math.floor(start); sample < Math.ceil(end); sample++) {
        var weight = Math.min(end, sample + 1) - Math.max(start, sample);
        if (weight > 0) taps.push({index: ((sample % size) + size) % size, weight: weight});
      }
      weights.push(taps);
    }
    // Separable exact area integration. Keep intermediate sums unrounded so
    // the result does not acquire a directional bias or repeated quantization.
    var horizontal = new Float64Array(size * outputSize * 4);
    for (var y = 0; y < size; y++) for (var x = 0; x < outputSize; x++) {
      var target = (y * outputSize + x) * 4, rowWeights = weights[x];
      for (var tap = 0; tap < rowWeights.length; tap++) {
        var source = (y * size + rowWeights[tap].index) * 4, scale = rowWeights[tap].weight;
        for (var c = 0; c < 4; c++) horizontal[target + c] += pixels[source + c] * scale;
      }
    }
    var output = new Uint8ClampedArray(outputSize * outputSize * 4), area = footprint * footprint;
    for (var oy = 0; oy < outputSize; oy++) for (var ox = 0; ox < outputSize; ox++) {
      var out = (oy * outputSize + ox) * 4, columnWeights = weights[oy];
      for (var color = 0; color < 4; color++) {
        var sum = 0;
        for (var row = 0; row < columnWeights.length; row++) {
          sum += horizontal[(columnWeights[row].index * outputSize + ox) * 4 + color] * columnWeights[row].weight;
        }
        output[out + color] = Math.round(sum / area);
      }
    }
    return {data: output, width: outputSize, height: outputSize};
  }

  // Materials become immutable assets after preparation: do not redraw their
  // source canvas. Metadata/level descriptors are frozen and shared by every
  // instance. Explicit preparation keeps generation off the rendering path.
  function prepareMaterial(material) {
    if (!material || !material.source || typeof material.source.getContext !== 'function' ||
        !Number.isInteger(material.size) || material.size < 1 || material.size > 128 ||
        (material.size & (material.size - 1)) || material.source.width !== material.size || material.source.height !== material.size) {
      throw new RangeError('Material must be a square power-of-two canvas of at most 128 pixels');
    }
    var prior = preparedMaterials.get(material);
    if (prior) {
      if (prior.levels[0].source !== material.source || prior.levels[0].size !== material.size) throw new RangeError('Prepared material identity changed');
      return prior;
    }
    var size = material.size, sourcePixels = material.source.getContext('2d').getImageData(0, 0, size, size).data;
    if (sourcePixels.length !== size * size * 4) throw new RangeError('Incomplete material pixels');
    for (var alpha = 3; alpha < sourcePixels.length; alpha += 4) {
      if (sourcePixels[alpha] !== 255) throw new RangeError('Texture pilot requires opaque material sources');
    }
    var levels = [Object.freeze({source: material.source, size: size, footprint: 1, color: material.color})];
    var baseBytes = size * size * 4, bytes = baseBytes;
    for (var footprint = 2; footprint <= size; footprint *= 2) {
      // A full-period footprint is exactly the constant tile mean, so store it
      // as one texel. Other levels keep four texels per filter footprint, up to
      // the same bounded128 grid for either source resolution. A64px source's
      // first filtered level needs128 phase samples; limiting it to64 causes
      // visible moving-edge error despite using the correct footprint width.
      var outputSize = footprint === size ? 1 : Math.min(128, size * 4 / footprint);
      var filtered = prefilterMipPixels(sourcePixels, size, footprint, outputSize);
      var canvas = document.createElement('canvas'); canvas.width = canvas.height = outputSize;
      var context = canvas.getContext('2d'), image = context.createImageData(outputSize, outputSize);
      image.data.set(filtered.data); context.putImageData(image, 0, 0);
      levels.push(Object.freeze({source: canvas, size: outputSize, footprint: footprint, color: material.color}));
      bytes += outputSize * outputSize * 4;
    }
    var planarLevels=levels, planarSize=size;
    if (size===64) {
      // The optional planar sampler needs sub-source-texel footprints too.
      // Nearest expansion preserves the64px artwork's exact piecewise-constant
      // signal; it invents no image detail. Its virtual128 chain adds only two
      // images, then shares every existing coarser level by object identity.
      // Triangle and explicit isotropic/legacy paths retain the original base.
      var expanded=new Uint8ClampedArray(128*128*4);
      for (var ey=0;ey<128;ey++) for (var ex=0;ex<128;ex++) {
        var from=((ey>>1)*size+(ex>>1))*4, to=(ey*128+ex)*4;
        for (var ec=0;ec<4;ec++) expanded[to+ec]=sourcePixels[from+ec];
      }
      var planarPixels=[expanded,prefilterMipPixels(sourcePixels,size,1,128).data], added=[];
      for (var extra=0;extra<planarPixels.length;extra++) {
        var extraCanvas=document.createElement('canvas'); extraCanvas.width=extraCanvas.height=128;
        var extraContext=extraCanvas.getContext('2d'), extraImage=extraContext.createImageData(128,128);
        extraImage.data.set(planarPixels[extra]); extraContext.putImageData(extraImage,0,0);
        added.push(Object.freeze({source:extraCanvas,size:128,footprint:extra?1:0.5,color:material.color}));
        bytes+=128*128*4;
      }
      planarLevels=added.concat(levels.slice(1)); planarSize=128;
    }
    var prepared = Object.freeze({levels: Object.freeze(levels), planarLevels:Object.freeze(planarLevels),
      planarSize:planarSize, oversampling: 4, baseBytes: baseBytes, mipBytes: bytes - baseBytes, bytes: bytes});
    preparedMaterials.set(material, prepared);
    return prepared;
  }

  // Source-texel -> screen-pixel affine Jacobian. Its inverse's largest singular
  // value is the widest source footprint of one screen pixel, including skew
  // and grazing angles. Distance alone cannot supply this information.
  function footprintLOD(m11, m12, m21, m22, maxLevel) {
    if (![m11, m12, m21, m22].every(Number.isFinite) || !Number.isInteger(maxLevel) || maxLevel < 0 || maxLevel > 7) return null;
    var determinant = m11 * m22 - m12 * m21;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return null;
    var a = m22 / determinant, b = -m12 / determinant, c = -m21 / determinant, d = m11 / determinant;
    var first = a * a + b * b, second = c * c + d * d, cross = a * c + b * d;
    var footprint = Math.sqrt((first + second + Math.hypot(first - second, 2 * cross)) * 0.5);
    if (!Number.isFinite(footprint) || footprint <= 0) return null;
    var lod = Math.max(0, Math.min(maxLevel, Math.log2(footprint)));
    var lower = Math.floor(lod), upper = Math.ceil(lod);
    return {footprint: footprint, lod: lod, lower: lower, upper: upper,
      blend: upper === lower ? 0 : lod - lower, minifying: footprint > 1};
  }

  // Bounded two-tap anisotropic approximation of one screen pixel's source
  // footprint. Derivatives are in tile repeats/pixel; offsets are ORIGINAL
  // source pixels, independent of the physical size of a prepared mip canvas.
  // Endpoint extrema bound the span. The center supplies a stable orientation;
  // fade the offset to zero as its covariance becomes isotropic, where no
  // major-axis direction is well-defined. No new bitmaps or readbacks are used.
  function planarFootprint(center, left, right, size, maxLevel) {
    if (!Number.isFinite(size) || size <= 0 || !Number.isInteger(maxLevel) || maxLevel < 0 || maxLevel > 7) return null;
    function ellipse(value) {
      if (!value || ![value.ux,value.uy,value.vx,value.vy].every(Number.isFinite)) return null;
      var a=value.ux*size, b=value.uy*size, c=value.vx*size, d=value.vy*size;
      var first=a*a+b*b, second=c*c+d*d, cross=a*c+b*d;
      var major=Math.sqrt((first+second+Math.hypot(first-second,2*cross))*0.5);
      var minor=Math.abs(a*d-b*c)/major;
      if (!(Number.isFinite(major) && major>0 && Number.isFinite(minor) && minor>0)) return null;
      return {major:major,minor:minor,angle:Math.atan2(2*cross,first-second)*0.5};
    }
    var mid=ellipse(center), lo=ellipse(left), hi=ellipse(right);
    if (!mid || !lo || !hi) return null;
    var major=Math.max(lo.major,hi.major), minor=Math.max(lo.minor,hi.minor);
    var footprintWidth=Math.max(1,minor,major*0.5,major*mid.minor/mid.major);
    var offset=Math.sqrt(Math.max(0,major*major-footprintWidth*footprintWidth)/12);
    var lod=Math.max(0,Math.min(maxLevel,Math.log2(footprintWidth)));
    var lower=Math.floor(lod), upper=Math.ceil(lod);
    // The last level is the constant whole-tile mean: displaced copies would
    // be identical, so retain the single pair of mip passes at that endpoint.
    if (lower===maxLevel || major<=1) offset=0;
    return {footprint:major,minor:minor,width:footprintWidth,lod:lod,lower:lower,upper:upper,
      blend:upper===lower?0:lod-lower,minifying:major>1,taps:offset>1e-10?2:1,
      offsetU:Math.cos(mid.angle)*offset,offsetV:Math.sin(mid.angle)*offset};
  }

  function finiteVertex(p) {
    return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
      Number.isFinite(p.depth) && p.depth > 0 && Number.isFinite(p.u) && Number.isFinite(p.v);
  }

  // Match projectSceneWorldPolygon exactly, but retain UVs at near-plane cuts.
  // World-space UV interpolation must happen before the perspective division.
  function clipNear(vertices, camera, C, projScale) {
    if (!Array.isArray(vertices) || vertices.length < 3 || vertices.length > 64 ||
        !camera || !Number.isFinite(camera.x) || !Number.isFinite(camera.y) || !C ||
        ![C.cosAng, C.sinAng, C.invTanHalf, C.w, C.h, C.horizonY, C.cameraZ, projScale].every(Number.isFinite) ||
        C.w <= 0 || C.h <= 0 || C.invTanHalf <= 0 || projScale <= 0) return [];
    var nearDepth = 1;
    var input = [], output = [], result = [];
    for (var i = 0; i < vertices.length; i++) {
      var p = vertices[i];
      if (!p || ![p.x, p.y, p.z, p.u, p.v].every(Number.isFinite)) return [];
      var dx = p.x - camera.x, dy = p.y - camera.y;
      var depth = dx * C.cosAng + dy * C.sinAng;
      var right = -dx * C.sinAng + dy * C.cosAng;
      if (!Number.isFinite(depth) || !Number.isFinite(right)) return [];
      input.push({depth: depth, right: right, z: p.z, u: p.u, v: p.v});
    }
    var previous = input[input.length - 1];
    for (var j = 0; j < input.length; j++) {
      var current = input[j];
      if ((previous.depth >= nearDepth) !== (current.depth >= nearDepth)) {
        var t = (nearDepth - previous.depth) / (current.depth - previous.depth);
        output.push({depth: nearDepth,
          right: previous.right + t * (current.right - previous.right),
          z: previous.z + t * (current.z - previous.z),
          u: previous.u + t * (current.u - previous.u),
          v: previous.v + t * (current.v - previous.v)});
      }
      if (current.depth >= nearDepth) output.push(current);
      previous = current;
    }
    for (var k = 0; k < output.length; k++) {
      var q = output[k];
      var projected = {x: (q.right / q.depth * C.invTanHalf * 0.5 + 0.5) * C.w,
        y: C.horizonY + (C.cameraZ - q.z) / q.depth * projScale,
        depth: q.depth, u: q.u, v: q.v};
      if (!finiteVertex(projected)) return [];
      result.push(projected);
    }
    return result;
  }

  // Analytic perspective-correct sample. The same formula also describes why
  // Canvas affine images need subdivision on receding surfaces.
  function perspectiveUV(a, b, c, x, y) {
    if (!finiteVertex(a) || !finiteVertex(b) || !finiteVertex(c) ||
        !Number.isFinite(x) || !Number.isFinite(y)) return null;
    var area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (!Number.isFinite(area) || Math.abs(area) < 1e-12) return null;
    var wb = ((x - a.x) * (c.y - a.y) - (y - a.y) * (c.x - a.x)) / area;
    var wc = ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)) / area;
    var wa = 1 - wb - wc;
    var inverse = wa / a.depth + wb / b.depth + wc / c.depth;
    if (!Number.isFinite(inverse) || inverse <= 0) return null;
    var u = (wa * a.u / a.depth + wb * b.u / b.depth + wc * c.u / c.depth) / inverse;
    var v = (wa * a.v / a.depth + wb * b.v / b.depth + wc * c.v / c.depth) / inverse;
    return Number.isFinite(u) && Number.isFinite(v) ? {u: u, v: v, depth: 1 / inverse} : null;
  }

  // Screen-space clipping/subdivision must interpolate reciprocal depth and
  // UV/depth, NOT raw UV. This keeps new vertices on the original 3D surface.
  function interpolateScreen(a, b, t) {
    var denominator = (1 - t) / a.depth + t / b.depth;
    return {x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), depth: 1 / denominator,
      u: ((1 - t) * a.u / a.depth + t * b.u / b.depth) / denominator,
      v: ((1 - t) * a.v / a.depth + t * b.v / b.depth) / denominator};
  }

  function clipViewport(vertices, width, height) {
    var result = vertices.slice();
    var axes = ['x', 'x', 'y', 'y'], bounds = [0, width, 0, height];
    for (var edge = 0; edge < 4 && result.length; edge++) {
      var input = result; result = [];
      var axis = axes[edge], bound = bounds[edge], lower = edge % 2 === 0;
      var a = input[input.length - 1], aInside = lower ? a[axis] >= bound : a[axis] <= bound;
      for (var i = 0; i < input.length; i++) {
        var b = input[i], bInside = lower ? b[axis] >= bound : b[axis] <= bound;
        if (aInside !== bInside) {
          var p = interpolateScreen(a, b, (bound - a[axis]) / (b[axis] - a[axis]));
          p[axis] = bound;
          result.push(p);
        }
        if (bInside) result.push(b);
        a = b; aInside = bInside;
      }
    }
    return result;
  }

  function makeNode(a, b, c, level) {
    var du1 = b.u - a.u, dv1 = b.v - a.v, du2 = c.u - a.u, dv2 = c.v - a.v;
    var determinant = du1 * dv2 - dv1 * du2;
    var node = {a: a, b: b, c: c, level: level, edge: 0, error: 0, children: null};
    if (Math.abs(determinant) < 1e-12) return node;
    // UV -> screen Jacobian turns mapping error into approximate screen pixels.
    var xu = ((b.x - a.x) * dv2 - (c.x - a.x) * dv1) / determinant;
    var xv = ((c.x - a.x) * du1 - (b.x - a.x) * du2) / determinant;
    var yu = ((b.y - a.y) * dv2 - (c.y - a.y) * dv1) / determinant;
    var yv = ((c.y - a.y) * du1 - (b.y - a.y) * du2) / determinant;
    var vertices = [a, b, c];
    for (var i = 0; i < 3; i++) {
      var p = vertices[i], q = vertices[(i + 1) % 3];
      var inv = 1 / p.depth + 1 / q.depth;
      var u = (p.u / p.depth + q.u / q.depth) / inv - (p.u + q.u) * 0.5;
      var v = (p.v / p.depth + q.v / q.depth) / inv - (p.v + q.v) * 0.5;
      var error = Math.hypot(xu * u + xv * v, yu * u + yv * v);
      if (error > node.error) { node.error = error; node.edge = i; }
    }
    return node;
  }

  function heapPush(heap, node) {
    var i = heap.length; heap.push(node);
    while (i) {
      var parent = (i - 1) >> 1;
      if (heap[parent].error >= node.error) break;
      heap[i] = heap[parent]; i = parent;
    }
    heap[i] = node;
  }
  function heapPop(heap) {
    var root = heap[0], last = heap.pop();
    if (!heap.length) return root;
    var i = 0;
    while (i * 2 + 1 < heap.length) {
      var child = i * 2 + 1;
      if (child + 1 < heap.length && heap[child + 1].error > heap[child].error) child++;
      if (heap[child].error <= last.error) break;
      heap[i] = heap[child]; i = child;
    }
    heap[i] = last;
    return root;
  }

  // Convex polygons only. Clip to viewport BEFORE refinement so huge projected
  // near-plane coordinates cannot consume the whole budget off-screen. Every
  // split replaces one leaf with two; budgets never discard part of a face.
  // emit(a,b,c) receives projected vertices. Stats report quality fallback.
  function tessellate(polygon, options, emit) {
    options = options || {};
    var stats = {triangles: 0, splits: 0, capped: false, clippedVertices: 0, rejected: false};
    var width = options.width, height = options.height;
    var maxTriangles = options.maxTriangles === undefined ? 256 : options.maxTriangles;
    var maxDepth = options.maxDepth === undefined ? 6 : options.maxDepth;
    var errorPixels = options.errorPixels === undefined ? 0.6 : options.errorPixels;
    if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 128 ||
        !polygon.every(finiteVertex) || typeof emit !== 'function' ||
        !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
        !Number.isInteger(maxTriangles) || maxTriangles < 1 || maxTriangles > 4096 ||
        !Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 12 ||
        !Number.isFinite(errorPixels) || errorPixels <= 0) {
      stats.rejected = true; return stats;
    }
    var clipped = clipViewport(polygon, width, height);
    stats.clippedVertices = clipped.length;
    if (clipped.length < 3) return stats;
    if (!clipped.every(finiteVertex)) { stats.rejected = true; return stats; }
    var roots = [], heap = [];
    for (var i = 1; i + 1 < clipped.length; i++) {
      var a = clipped[0], b = clipped[i], c = clipped[i + 1];
      var area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(area) < 1e-8) continue;
      var node = makeNode(a, b, c, 0);
      roots.push(node); heapPush(heap, node);
    }
    // A too-small caller budget cannot even represent this polygon. Reject the
    // whole face so the caller's opaque fallback remains complete and honest.
    if (roots.length > maxTriangles) { stats.rejected = true; stats.capped = true; return stats; }
    var leafCount = roots.length;
    while (heap.length) {
      var candidate = heapPop(heap);
      if (candidate.error <= errorPixels) break;
      if (candidate.level >= maxDepth) { stats.capped = true; continue; }
      if (leafCount >= maxTriangles) { stats.capped = true; break; }
      var corners = [candidate.a, candidate.b, candidate.c], edge = candidate.edge;
      var p = corners[edge], q = corners[(edge + 1) % 3], r = corners[(edge + 2) % 3];
      var midpoint = interpolateScreen(p, q, 0.5);
      var left = makeNode(p, midpoint, r, candidate.level + 1);
      var right = makeNode(midpoint, q, r, candidate.level + 1);
      candidate.children = [left, right];
      heapPush(heap, left); heapPush(heap, right);
      leafCount++; stats.splits++;
    }
    var stack = roots.slice();
    while (stack.length) {
      var leaf = stack.pop();
      if (leaf.children) { stack.push(leaf.children[1], leaf.children[0]); continue; }
      emit(leaf.a, leaf.b, leaf.c); stats.triangles++;
    }
    return stats;
  }

  // Offset triangle clip edges by a fraction of a screen pixel. The scene must
  // supply an outer exact face/depth mask and opaque base-color fill. This
  // overlap removes internal Canvas AA cracks without leaking beyond a face.
  function expandTriangle(a, b, c) {
    var points = [a, b, c], result = [];
    var sign = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) >= 0 ? 1 : -1;
    for (var i = 0; i < 3; i++) {
      var prev = points[(i + 2) % 3], p = points[i], next = points[(i + 1) % 3];
      var dx1 = p.x - prev.x, dy1 = p.y - prev.y, dx2 = next.x - p.x, dy2 = next.y - p.y;
      var len1 = Math.hypot(dx1, dy1), len2 = Math.hypot(dx2, dy2);
      if (len1 < 1e-9 || len2 < 1e-9) return null;
      var nx1 = sign * dy1 / len1, ny1 = -sign * dx1 / len1;
      var nx2 = sign * dy2 / len2, ny2 = -sign * dx2 / len2;
      var scale = 0.7 / Math.max(0.01, 1 + nx1 * nx2 + ny1 * ny2);
      var ox = (nx1 + nx2) * scale, oy = (ny1 + ny2) * scale;
      var length = Math.hypot(ox, oy);
      if (length > 3) { ox *= 3 / length; oy *= 3 / length; }
      result.push({x: p.x + ox, y: p.y + oy});
    }
    return result;
  }

  // Kept intact for the native broken-filter negative control. Also supplies
  // each single-level affine pass for the stable material sampler below.
  function drawTriangleLegacy(ctx, a, b, c, material) {
    if (!ctx || !finiteVertex(a) || !finiteVertex(b) || !finiteVertex(c) || !material ||
        !material.source || !Number.isFinite(material.size) || material.size <= 0) return false;
    var size = material.size;
    var sx = a.u * size, sy = a.v * size;
    var du1 = (b.u - a.u) * size, dv1 = (b.v - a.v) * size;
    var du2 = (c.u - a.u) * size, dv2 = (c.v - a.v) * size;
    var determinant = du1 * dv2 - dv1 * du2;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) return false;
    var m11 = ((b.x - a.x) * dv2 - (c.x - a.x) * dv1) / determinant;
    var m21 = ((c.x - a.x) * du1 - (b.x - a.x) * du2) / determinant;
    var m12 = ((b.y - a.y) * dv2 - (c.y - a.y) * dv1) / determinant;
    var m22 = ((c.y - a.y) * du1 - (b.y - a.y) * du2) / determinant;
    var dx = a.x - m11 * sx - m21 * sy, dy = a.y - m12 * sx - m22 * sy;
    var screenDet = m11 * m22 - m12 * m21;
    if (![m11, m21, m12, m22, dx, dy, screenDet].every(Number.isFinite) || Math.abs(screenDet) < 1e-12) return false;
    var expanded = expandTriangle(a, b, c);
    if (!expanded) return false;
    var cache = patternCaches.get(ctx);
    if (!cache) { cache = new WeakMap(); patternCaches.set(ctx, cache); }
    var pattern = cache.get(material);
    if (!pattern) { pattern = ctx.createPattern(material.source, 'repeat'); if (!pattern) return false; cache.set(material, pattern); }
    var minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
    for (var i = 0; i < 3; i++) {
      var px = expanded[i].x - dx, py = expanded[i].y - dy;
      var u = (m22 * px - m21 * py) / screenDet;
      var v = (m11 * py - m12 * px) / screenDet;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    ctx.save();
    ctx.beginPath(); ctx.moveTo(expanded[0].x, expanded[0].y);
    ctx.lineTo(expanded[1].x, expanded[1].y); ctx.lineTo(expanded[2].x, expanded[2].y);
    ctx.closePath(); ctx.clip();
    ctx.transform(m11, m12, m21, m22, dx, dy);
    ctx.fillStyle = pattern;
    ctx.fillRect(minU - 1, minV - 1, maxU - minU + 2, maxV - minV + 2);
    ctx.restore();
    return true;
  }

  // Magnification keeps the caller's crisp/smooth preference. Minification
  // always uses prefiltered mip levels with smooth sampling and a continuous
  // crossfade; never switch a tiny moving line abruptly between whole texels.
  // At most two cached-pattern passes, no per-frame canvases/readbacks/bakes.
  function drawTriangle(ctx, a, b, c, material, options) {
    var filter = options && options.filter !== undefined ? options.filter : 'stable';
    var stats = options && options.stats;
    function count(name) { if (stats) stats[name] = (Number.isFinite(stats[name]) ? stats[name] : 0) + 1; }
    if (filter === 'legacy') {
      var legacySuccess = drawTriangleLegacy(ctx, a, b, c, material);
      if (legacySuccess) count('patternFills');
      return legacySuccess;
    }
    if (filter !== 'stable' || !ctx || !finiteVertex(a) || !finiteVertex(b) || !finiteVertex(c) || !material) return false;
    var prepared = preparedMaterials.get(material);
    if (!prepared || prepared.levels[0].source !== material.source || prepared.levels[0].size !== material.size) { count('unpreparedMaterials'); return false; }
    var size = material.size, du1 = (b.u - a.u) * size, dv1 = (b.v - a.v) * size;
    var du2 = (c.u - a.u) * size, dv2 = (c.v - a.v) * size, determinant = du1 * dv2 - dv1 * du2;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) return false;
    var m11 = ((b.x - a.x) * dv2 - (c.x - a.x) * dv1) / determinant;
    var m21 = ((c.x - a.x) * du1 - (b.x - a.x) * du2) / determinant;
    var m12 = ((b.y - a.y) * dv2 - (c.y - a.y) * dv1) / determinant;
    var m22 = ((c.y - a.y) * du1 - (b.y - a.y) * du2) / determinant;
    var sampling = footprintLOD(m11, m12, m21, m22, prepared.levels.length - 1);
    if (!sampling) return false;
    if (!sampling.minifying) {
      var magnifiedSuccess = drawTriangleLegacy(ctx, a, b, c, prepared.levels[0]);
      if (magnifiedSuccess) count('patternFills');
      return magnifiedSuccess;
    }
    var alpha = ctx.globalAlpha, blend = sampling.blend, success = false;
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return false;
    ctx.save();
    try {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'low';
      // Two source-over draws must retain the caller's total opacity. The
      // ordinary opaque case is first-level alpha1, second-level alpha=blend.
      var secondAlpha = alpha * blend;
      ctx.globalAlpha = secondAlpha < 1 ? alpha * (1 - blend) / (1 - secondAlpha) : 0;
      success = drawTriangleLegacy(ctx, a, b, c, prepared.levels[sampling.lower]);
      if (success) { count('patternFills'); count('minifiedTriangles'); }
      if (success && blend > 0) {
        ctx.globalAlpha = secondAlpha;
        success = drawTriangleLegacy(ctx, a, b, c, prepared.levels[sampling.upper]);
        if (success) { count('patternFills'); count('blendedTriangles'); }
      }
    } finally { ctx.restore(); }
    return success;
  }

  // Optional planar fast path, deliberately separate from tessellate. On the
  // current yaw/horizon camera, horizontal surfaces have Q=1/depth varying only
  // with screen Y, and vertical walls only with X. At each pixel-row/column
  // center, UQ/Q and VQ/Q are EXACTLY affine along that whole scan band. A fixed
  // integer band grid removes camera-selected triangle seams and T-junctions.
  // Caller retains responsibility for opaque depth/base-color coverage. This
  // helper additionally clips to the actual convex face and never expands it.
  // Declines/preflight failures paint nothing. strips counts completed bands;
  // stats counts actual patternFills/minifiedStrips/blendedStrips and
  // anisotropicStrips, not strips. Stable filtering uses at most FOUR pattern
  // fills per band; directional:false retains the two-pass isotropic baseline.
  function drawPlanarFace(ctx, points, material, options) {
    options = options || {};
    var width = options.width, height = options.height;
    var maximum = options.maxStrips === undefined ? 256 : options.maxStrips;
    var filter = options.filter === undefined ? 'stable' : options.filter, stats = options.stats;
    function decline(reason, failed) { return {handled: false, strips: 0, failed: !!failed, reason: reason}; }
    function count(name) { if (stats) stats[name] = (Number.isFinite(stats[name]) ? stats[name] : 0) + 1; }
    if (!ctx || !Array.isArray(points) || points.length < 3 || points.length > 128 || !points.every(finiteVertex) ||
        !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 8192 || height > 8192 ||
        !Number.isInteger(maximum) || maximum < 1 || maximum > 2048 || (filter !== 'stable' && filter !== 'legacy') ||
        (options.directional !== undefined && typeof options.directional !== 'boolean')) return decline('invalid-input');
    var visibleBounds = options.visibleBounds;
    if (visibleBounds !== undefined && (!visibleBounds ||
        ![visibleBounds.minX, visibleBounds.maxX, visibleBounds.minY, visibleBounds.maxY].every(Number.isInteger) ||
        visibleBounds.minX < 0 || visibleBounds.maxX >= width || visibleBounds.minY < 0 || visibleBounds.maxY >= height ||
        visibleBounds.minX > visibleBounds.maxX || visibleBounds.minY > visibleBounds.maxY)) return decline('invalid-visible-bounds');
    if (!material || !material.source || !Number.isFinite(material.size) || material.size <= 0) return decline('invalid-material', true);
    var prepared = filter === 'stable' ? preparedMaterials.get(material) : null;
    if (filter === 'stable' && (!prepared || prepared.levels[0].source !== material.source || prepared.levels[0].size !== material.size)) return decline('unprepared-material', true);
    if (!Number.isFinite(ctx.globalAlpha) || ctx.globalAlpha < 0 || ctx.globalAlpha > 1) return decline('invalid-opacity', true);

    // Reject concave/self-crossing ordering: scan-band extrema assume a convex
    // polygon, like the existing scene-depth path. Zero-length edges are safe.
    var signedArea = 0;
    for (var edge = 0; edge < points.length; edge++) {
      var p = points[edge], q = points[(edge + 1) % points.length];
      signedArea += p.x * q.y - p.y * q.x;
    }
    if (!Number.isFinite(signedArea) || Math.abs(signedArea) < 1e-8) return decline('degenerate-face');
    var winding = signedArea > 0 ? 1 : -1;
    for (var e = 0; e < points.length; e++) {
      var first = points[e], second = points[(e + 1) % points.length];
      for (var corner = 0; corner < points.length; corner++) {
        var cross = (second.x - first.x) * (points[corner].y - first.y) - (second.y - first.y) * (points[corner].x - first.x);
        if (!Number.isFinite(cross) || cross * winding < -Math.abs(signedArea) * 1e-9) return decline('nonconvex-face');
      }
    }
    var a = points[0], b = null, c = null, area = 0;
    for (var triangle = 1; triangle + 1 < points.length; triangle++) {
      b = points[triangle]; c = points[triangle + 1];
      area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(area) > 1e-8) break;
    }
    if (Math.abs(area) <= 1e-8) return decline('degenerate-face');
    function fit(fa, fb, fc) {
      var x = ((fb - fa) * (c.y - a.y) - (fc - fa) * (b.y - a.y)) / area;
      var y = ((fc - fa) * (b.x - a.x) - (fb - fa) * (c.x - a.x)) / area;
      return {x: x, y: y, c: fa - x * a.x - y * a.y};
    }
    var Q = fit(1 / a.depth, 1 / b.depth, 1 / c.depth);
    var U = fit(a.u / a.depth, b.u / b.depth, c.u / c.depth);
    var V = fit(a.v / a.depth, b.v / b.depth, c.v / c.depth);
    function at(plane, x, y) { return plane.x * x + plane.y * y + plane.c; }
    var largestQ = 0;
    for (var vertex = 0; vertex < points.length; vertex++) {
      var point = points[vertex], expected = [1 / point.depth, point.u / point.depth, point.v / point.depth], planes = [Q, U, V];
      largestQ = Math.max(largestQ, expected[0]);
      for (var channel = 0; channel < 3; channel++) {
        var value = at(planes[channel], point.x, point.y);
        if (!Number.isFinite(value) || Math.abs(value - expected[channel]) > 1e-8 * Math.max(1e-6, Math.abs(expected[channel]))) return decline('nonplanar-depth-or-uv');
      }
    }
    var xChanges = Math.abs(Q.x) * width > largestQ * 1e-8;
    var yChanges = Math.abs(Q.y) * height > largestQ * 1e-8;
    if (xChanges && yChanges) return decline('general-perspective');
    if (!xChanges && !yChanges) return decline('constant-depth');
    var rows = yChanges, axis = rows ? 'y' : 'x', other = rows ? 'x' : 'y';
    if (rows) Q.x = 0; else Q.y = 0; // numerical noise, bounded by validation above
    var clipped = clipViewport(points, width, height);
    if (clipped.length < 3) return decline('offscreen');
    var low = Infinity, high = -Infinity;
    for (var bound = 0; bound < clipped.length; bound++) {
      low = Math.min(low, clipped[bound][axis]); high = Math.max(high, clipped[bound][axis]);
    }
    var begin = Math.max(0, Math.floor(low)), end = Math.min(rows ? height : width, Math.ceil(high));
    // Optional production depth-mask bounds skip wholly invisible bands. Never
    // use an occluder's span to choose UVs, filter footprints or mip levels:
    // unchanged visible pixels must retain exactly the same material sampling.
    if (visibleBounds) {
      begin = Math.max(begin, rows ? visibleBounds.minY : visibleBounds.minX);
      end = Math.min(end, (rows ? visibleBounds.maxY : visibleBounds.maxX) + 1);
    }
    var directional=filter==='stable' && options.directional!==false;
    var levels = filter === 'stable' ? (directional?prepared.planarLevels:prepared.levels) : [material], bands = [];
    var samplingSize=directional?prepared.planarSize:material.size;

    function derivatives(x, y) {
      var inverse = at(Q, x, y), uq = at(U, x, y), vq = at(V, x, y);
      if (!Number.isFinite(inverse) || inverse <= 0) return null;
      var square = inverse * inverse;
      var ux = (U.x * inverse - uq * Q.x) / square, uy = (U.y * inverse - uq * Q.y) / square;
      var vx = (V.x * inverse - vq * Q.x) / square, vy = (V.y * inverse - vq * Q.y) / square;
      var det = (ux * vy - uy * vx) * material.size * material.size;
      if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
      var transform = {a: vy * material.size / det, b: -vx * material.size / det,
        c: -uy * material.size / det, d: ux * material.size / det};
      var u = uq / inverse, v = vq / inverse;
      transform.e = x - transform.a * u * material.size - transform.c * v * material.size;
      transform.f = y - transform.b * u * material.size - transform.d * v * material.size;
      if (![ux, uy, vx, vy, u, v, transform.a, transform.b, transform.c, transform.d, transform.e, transform.f].every(Number.isFinite)) return null;
      return {u: u, v: v, ux: ux, uy: uy, vx: vx, vy: vy, x: x, y: y, transform: transform};
    }
    // Preflight EVERY visible band, including material sampling and the total
    // work budget, before issuing any paint. Unsupported faces stay untouched.
    for (var band = begin; band < end; band++) {
      var line = band + 0.5, minimum = Infinity, maximumSpan = -Infinity;
      for (var side = 0; side < clipped.length; side++) {
        var from = clipped[side], to = clipped[(side + 1) % clipped.length], delta = to[axis] - from[axis];
        if (Math.abs(delta) < 1e-12) {
          if (Math.abs(from[axis] - line) < 1e-10) { minimum = Math.min(minimum, from[other], to[other]); maximumSpan = Math.max(maximumSpan, from[other], to[other]); }
        } else if (line >= Math.min(from[axis], to[axis]) && line <= Math.max(from[axis], to[axis])) {
          var along = from[other] + (line - from[axis]) / delta * (to[other] - from[other]);
          minimum = Math.min(minimum, along); maximumSpan = Math.max(maximumSpan, along);
        }
      }
      if (!(maximumSpan > minimum)) continue;
      if (bands.length >= maximum) return decline('strip-budget');
      var midpoint = (minimum + maximumSpan) * 0.5;
      var center = derivatives(rows ? midpoint : line, rows ? line : midpoint);
      var left = derivatives(rows ? minimum : line, rows ? line : minimum);
      var right = derivatives(rows ? maximumSpan : line, rows ? line : maximumSpan);
      if (!center || !left || !right) return decline('invalid-mapping');
      var sampling = {lower: 0, upper: 0, blend: 0, minifying: false};
      if (filter === 'stable') {
        if (options.directional !== false) {
          sampling = planarFootprint(center,left,right,samplingSize,levels.length-1);
          if (!sampling) return decline('invalid-directional-footprint');
          // paintLevel's affine matrix is expressed in ORIGINAL source pixels.
          // Virtual high-density levels change filter resolution, not UV phase.
          sampling.offsetU*=material.size/samplingSize; sampling.offsetV*=material.size/samplingSize;
        } else {
          var l = left.transform, r = right.transform;
          var leftSample = footprintLOD(l.a, l.b, l.c, l.d, levels.length - 1);
          var rightSample = footprintLOD(r.a, r.b, r.c, r.d, levels.length - 1);
          if (!leftSample || !rightSample) return decline('invalid-footprint');
          // The derivative matrix is affine along a constant-Q band. Its
          // largest singular value is convex, bounding the whole span here.
          sampling = leftSample.footprint >= rightSample.footprint ? leftSample : rightSample;
        }
      }
      var rectangle = rows ? {x: 0, y: band, w: width, h: 1} : {x: band, y: 0, w: 1, h: height};
      // Affine fill bounds do not depend on mip choice or tap displacement.
      // Compute their four scalar corners once per band; each pass only scales
      // and translates these limits. This removes per-pass corner-array churn.
      var dx0=rectangle.x-center.x, dx1=rectangle.x+rectangle.w-center.x;
      var dy0=rectangle.y-center.y, dy1=rectangle.y+rectangle.h-center.y;
      var u00=center.u+center.ux*dx0+center.uy*dy0, u10=center.u+center.ux*dx1+center.uy*dy0;
      var u11=center.u+center.ux*dx1+center.uy*dy1, u01=center.u+center.ux*dx0+center.uy*dy1;
      var v00=center.v+center.vx*dx0+center.vy*dy0, v10=center.v+center.vx*dx1+center.vy*dy0;
      var v11=center.v+center.vx*dx1+center.vy*dy1, v01=center.v+center.vx*dx0+center.vy*dy1;
      bands.push({rectangle: rectangle, center: center, sampling: sampling,
        minU:Math.min(u00,u10,u11,u01),maxU:Math.max(u00,u10,u11,u01),
        minV:Math.min(v00,v10,v11,v01),maxV:Math.max(v00,v10,v11,v01)});
    }
    if (!bands.length) return decline('no-pixel-centers');
    var cache = patternCaches.get(ctx);
    if (!cache) { cache = new WeakMap(); patternCaches.set(ctx, cache); }
    var patterns = [];
    for (var needed = 0; needed < bands.length; needed++) {
      var selection = bands[needed].sampling;
      var indices = selection.blend > 0 ? [selection.lower, selection.upper] : [selection.lower];
      for (var index = 0; index < indices.length; index++) {
        var levelIndex = indices[index], level = levels[levelIndex];
        if (patterns[levelIndex]) continue;
        var pattern = cache.get(level);
        if (!pattern) { pattern = ctx.createPattern(level.source, 'repeat'); if (!pattern) return decline('pattern-unavailable', true); cache.set(level, pattern); }
        patterns[levelIndex] = pattern;
      }
    }
    var result = {handled: true, strips: 0, failed: false, axis: axis};
    var originalAlpha = ctx.globalAlpha;
    function paintLevel(item, levelIndex, offsetU, offsetV) {
      var rect = item.rectangle, sample = item.center, matrix = sample.transform, level = levels[levelIndex];
      offsetU=offsetU||0; offsetV=offsetV||0;
      var minU=(item.minU+offsetU/material.size)*level.size, maxU=(item.maxU+offsetU/material.size)*level.size;
      var minV=(item.minV+offsetV/material.size)*level.size, maxV=(item.maxV+offsetV/material.size)*level.size;
      var ratio = material.size / level.size;
      ctx.save();
      try {
        ctx.transform(matrix.a * ratio, matrix.b * ratio, matrix.c * ratio, matrix.d * ratio,
          matrix.e-matrix.a*offsetU-matrix.c*offsetV,matrix.f-matrix.b*offsetU-matrix.d*offsetV);
        ctx.fillStyle = patterns[levelIndex];
        ctx.fillRect(minU - 1, minV - 1, maxU - minU + 2, maxV - minV + 2);
        count('patternFills');
      } finally { ctx.restore(); }
    }
    ctx.save();
    try {
      ctx.beginPath(); ctx.moveTo(clipped[0].x, clipped[0].y);
      for (var path = 1; path < clipped.length; path++) ctx.lineTo(clipped[path].x, clipped[path].y);
      ctx.closePath(); ctx.clip();
      for (var draw = 0; draw < bands.length; draw++) {
        var item = bands[draw], rect = item.rectangle, selection = item.sampling;
        ctx.save();
        try {
          ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
          if (selection.minifying) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; }
          if (selection.taps===2) {
            var consumed=0, blend=selection.blend;
            for (var tap=0;tap<2;tap++) for (var mip=0;mip<(blend>0?2:1);mip++) {
              var weight=(mip?blend:1-blend)*0.5;
              consumed+=weight;
              var remainingWeight=Math.max(0,1-consumed);
              ctx.globalAlpha=originalAlpha*weight/(1-originalAlpha*remainingWeight);
              var direction=tap===0?-1:1;
              paintLevel(item,mip?selection.upper:selection.lower,direction*selection.offsetU,direction*selection.offsetV);
            }
            count('anisotropicStrips');
            if (blend>0) count('blendedStrips');
          } else {
            var secondAlpha = originalAlpha * selection.blend;
            ctx.globalAlpha = secondAlpha < 1 ? originalAlpha * (1 - selection.blend) / (1 - secondAlpha) : 0;
            paintLevel(item, selection.lower);
            if (selection.blend > 0) { ctx.globalAlpha = secondAlpha; paintLevel(item, selection.upper); count('blendedStrips'); }
          }
          if (selection.minifying) count('minifiedStrips');
          result.strips++;
        } finally { ctx.restore(); }
      }
    } catch (error) {
      result.failed = true; result.reason = 'canvas-paint-failed';
    } finally { ctx.restore(); }
    return result;
  }

  function rng(seed) {
    var state = seed >>> 0;
    return function () { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  }
  function createTile(size, color, paint, seed) {
    var canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    var ctx = canvas.getContext('2d');
    ctx.scale(size / 128, size / 128);
    ctx.fillStyle = color; ctx.fillRect(0, 0, 128, 128);
    paint(ctx, rng(seed));
    return {source: canvas, color: color, size: size};
  }
  function paintWood(ctx, random) {
    // Four continuous horizontal planks; periodic grain wraps across tile ends.
    var colors = ['#79502f', '#916039', '#815432', '#a16c40'];
    for (var row = 0; row < 4; row++) {
      ctx.fillStyle = colors[row]; ctx.fillRect(0, row * 32, 128, 32);
      ctx.fillStyle = '#38281f'; ctx.fillRect(0, row * 32, 128, 2);
      ctx.fillStyle = '#b48655'; ctx.fillRect(0, row * 32 + 2, 128, 1);
      for (var line = 0; line < 9; line++) {
        var y = row * 32 + 5 + line * 2.8;
        var phase = random() * Math.PI * 2, amplitude = 0.5 + random();
        ctx.strokeStyle = line % 3 === 0 ? 'rgba(212,161,99,.24)' : 'rgba(45,27,18,.27)';
        ctx.lineWidth = 0.6 + random() * 0.65; ctx.beginPath();
        for (var x = 0; x <= 128; x += 4) {
          var grainY = y + Math.sin(x / 128 * Math.PI * 2 + phase) * amplitude;
          if (!x) ctx.moveTo(x, grainY); else ctx.lineTo(x, grainY);
        }
        ctx.stroke();
      }
      var seam = row % 2 ? 87 : 23;
      ctx.fillStyle = 'rgba(42,25,16,.48)'; ctx.fillRect(seam, row * 32 + 2, 1, 30);
      ctx.fillStyle = '#493e31';
      ctx.fillRect(seam + 4, row * 32 + 7, 2, 2); ctx.fillRect(seam + 4, row * 32 + 24, 2, 2);
    }
  }
  function paintStone(ctx, random) {
    ctx.fillStyle = '#373935'; ctx.fillRect(0, 0, 128, 128);
    var colors = ['#777a6b', '#858779', '#696e65', '#7b8075', '#6c7267'];
    for (var row = 0; row < 4; row++) {
      var offset = row % 2 ? -32 : 0;
      for (var col = 0; col < 3; col++) {
        var x = offset + col * 64, y = row * 32;
        ctx.fillStyle = colors[(row * 2 + col % 2) % colors.length]; ctx.fillRect(x + 2, y + 2, 60, 28);
        ctx.strokeStyle = 'rgba(213,215,187,.16)'; ctx.lineWidth = 1;
        ctx.strokeRect(x + 3.5, y + 3.5, 57, 25);
      }
    }
    for (var i = 0; i < 750; i++) {
      var px = Math.floor(random() * 128), py = Math.floor(random() * 128);
      ctx.fillStyle = i % 2 ? 'rgba(20,25,22,.12)' : 'rgba(221,218,189,.12)';
      ctx.fillRect(px, py, 1 + Math.floor(random() * 2), 1);
    }
    ctx.strokeStyle = 'rgba(29,32,29,.4)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(43, 6); ctx.lineTo(39, 14); ctx.lineTo(44, 21); ctx.lineTo(42, 28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(93, 70); ctx.lineTo(99, 75); ctx.lineTo(97, 83); ctx.stroke();
  }
  function paintIron(ctx, random) {
    ctx.fillStyle = '#626b70'; ctx.fillRect(0, 0, 128, 128);
    for (var y = 0; y < 128; y++) {
      var value = 80 + Math.floor(random() * 34);
      ctx.fillStyle = 'rgba(' + value + ',' + (value + 6) + ',' + (value + 9) + ',.5)';
      ctx.fillRect(0, y, 128, 1);
    }
    for (var i = 0; i < 400; i++) {
      ctx.fillStyle = i % 3 ? 'rgba(13,24,28,.13)' : 'rgba(179,191,189,.18)';
      ctx.fillRect(Math.floor(random() * 128), Math.floor(random() * 128), 1, 1);
    }
    ctx.fillStyle = '#394146'; ctx.fillRect(0, 0, 128, 2); ctx.fillRect(0, 0, 2, 128);
    ctx.fillStyle = '#7c8589'; ctx.fillRect(2, 2, 125, 1); ctx.fillRect(2, 2, 1, 125);
    for (var ix = 0; ix < 2; ix++) for (var iy = 0; iy < 2; iy++) {
      var x = 10 + ix * 108, y2 = 10 + iy * 108;
      ctx.fillStyle = '#343e42'; ctx.beginPath(); ctx.arc(x, y2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#939b9b'; ctx.fillRect(x - 1, y2 - 2, 2, 1);
    }
  }
  function paintChecker(ctx) {
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#27384b' : '#e2ddbd';
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
    ctx.fillStyle = '#cc6b46'; ctx.fillRect(0, 0, 128, 3);
    ctx.fillStyle = '#4b98a4'; ctx.fillRect(0, 3, 3, 125);
  }

  // Only startup/resolution changes call this. A material is shared by every
  // face; no per-object bitmap copies, network fetches or external image data.
  function createCatalog(size) {
    if (size !== 64 && size !== 128) throw new RangeError('Texture size must be 64 or 128');
    var start = performance.now();
    var materials = {
      wood: createTile(size, '#875c37', paintWood, 0x781abc),
      stone: createTile(size, '#777b6e', paintStone, 0x51abf8),
      iron: createTile(size, '#60696d', paintIron, 0x18f137),
      checker: createTile(size, '#929783', paintChecker, 0x101010)
    };
    var bytes = 0, baseBytes = 0;
    Object.keys(materials).forEach(function (name) {
      var prepared = prepareMaterial(materials[name]); bytes += prepared.bytes; baseBytes += prepared.baseBytes;
    });
    return {materials: materials, bytes: bytes, baseBytes: baseBytes, mipBytes: bytes - baseBytes, buildMs: performance.now() - start};
  }

  return {createCatalog: createCatalog, clipNear: clipNear, perspectiveUV: perspectiveUV,
    tessellate: tessellate, drawTriangle: drawTriangle, drawPlanarFace: drawPlanarFace, prepareMaterial: prepareMaterial,
    prefilterMipPixels: prefilterMipPixels, footprintLOD: footprintLOD, planarFootprint: planarFootprint};
}());
