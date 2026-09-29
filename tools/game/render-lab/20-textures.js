// Render lab: structure textures (integration stage E). Developer page only.
// Runs the browser checks S1-S7 and the brightness check on the current view,
// or on standard poses around the nearest fortress, arena or watchtower:
//   S1 pixels changed by textures stay inside the model pass's face masks
//   S2 _sceneDepthInv is identical with textures on and off
//   S3 pattern fills > 0, no failed draws, within budget, textured contrast
//      (luma spread inside the masks) above flat
//   S4 a billboard probe behind the structure is hidden; one in front is not
//   S5 two textured draws after a warm-up are identical
//   S6 live mapping switches add no _ptErrors; 'triangles' issues no strips
//   S7 negative control: the flat sink in place of the textured sink fails S3
//   luma: mean luma inside the masks, textured against flat, within +-8%
// Pixel checks read the canvas back, so run them in a readback tab, never in
// a timing tab. A canvas that reads back no opaque pixels reports the pixel
// checks as SKIP, not PASS. Every wrapper and switch is restored afterwards.
var RenderLabTextures = (function () {
  var PARAMS = {textureMapping: 'hybrid', textureTile: 128, textureOwnedEdges: true, textureBudget: 2048, textureMaxRows: 360, textureMinPixels: 64};
  var SEED = 4242;

  function floorAt(x, y) { return typeof floorMesh !== 'undefined' && floorMesh && typeof getFloorHeightAt === 'function' ? getFloorHeightAt(x, y) : 0; }
  function solidAt(x, y) {
    var gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    return gx < 0 || gy < 0 || gx >= gridW || gy >= gridH || !!grid[gy * gridW + gx];
  }
  function nearestStructure(type) {
    var best = null, bestD = Infinity;
    (typeof largeStructures !== 'undefined' && largeStructures || []).forEach(function (s) {
      if (type && s.type !== type) return;
      var d = Math.hypot(s.x - pos.x, s.y - pos.y);
      if (d < bestD) { bestD = d; best = s; }
    });
    return best;
  }
  function modelRadius(s) {
    var r = 0;
    (typeof structureModels !== 'undefined' && structureModels || []).forEach(function (m) {
      var b = m.bounds;
      if (b && s.x >= b.minX && s.x <= b.maxX && s.y >= b.minY && s.y <= b.maxY) r = Math.max(r, (b.maxX - b.minX) / 2, (b.maxY - b.minY) / 2);
    });
    return r || 300;
  }
  // Poses looking at the structure centre from the first free cell on each
  // ray: exterior (R + 700 out), approach (R + 120, ground level at the
  // wall), inside (0.35 R from the centre) and roof (2 R out, raised, looking
  // down: the only view of wall tops). Roof is for pixel checks only: the game
  // loop re-derives the camera height, so time only the ground poses.
  function poses(type) {
    var s = nearestStructure(type);
    if (!s) return null;
    var R = modelRadius(s), out = {};
    [['exterior', R + 700, 60], ['approach', R + 120, 60], ['inside', R * 0.35, 60], ['roof', R * 2, 444]].forEach(function (spec) {
      var angles = [0.66, 1.4, 2.2, 3.0, 0.3, 1.2, 2.0, 2.8, 3.7, 4.6, 5.5];
      for (var k = 0; k < angles.length; k++) {
        var a = angles[k], x = s.x - Math.cos(a) * spec[1], y = s.y - Math.sin(a) * spec[1];
        if (!solidAt(x, y)) {
          out[spec[0]] = {tag: spec[0], x: x, y: y, ang: a, raised: spec[2] !== 60, z: spec[2] === 60 ? null : spec[2], pitch: spec[2] === 60 ? 0 : 0.35};
          return;
        }
      }
    });
    out.structure = {type: s.type, x: s.x, y: s.y, radius: R};
    return out;
  }
  function setPose(p) {
    RenderLab.stopLoop();
    pos.x = p.x; pos.y = p.y; vel.x = 0; vel.y = 0;
    cam.x = p.x; cam.y = p.y; cam.ang = p.ang; cam.pitch = p.pitch || 0;
    cam.z = p.z !== null && p.z !== undefined ? p.z : 60 + 40 * floorAt(p.x, p.y);
    if (typeof resetRenderInterpolation === 'function') resetRenderInterpolation();
  }

  // One frozen draw() with the model pass's scene-depth masks recorded.
  function frozenDraw(record) {
    var realClip = window.withSceneDepthClip, realModels = window.drawStructureModels3D, inModels = false;
    var W = canvas.width, H = canvas.height, union = record ? new Uint8Array(W * H) : null, masks = 0;
    window.drawStructureModels3D = function () { inModels = true; try { return realModels.apply(this, arguments); } finally { inModels = false; } };
    window.withSceneDepthClip = function (points, cb, options) {
      if (!inModels || !union) return realClip.apply(this, arguments);
      return realClip(points, function () {
        masks++;
        var gen = _sceneDepthClipGeneration, SW = _sceneDepthW;
        for (var y = _sceneDepthClipMinY; y <= _sceneDepthClipMaxY; y++) {
          if (_sceneDepthClipRowMarks[y] !== gen) continue;
          for (var x = _sceneDepthClipRowMin[y]; x <= _sceneDepthClipRowMax[y]; x++) if (_sceneDepthClipMarks[y * SW + x] === gen) union[y * W + x] = 1;
        }
        return cb.apply(this, arguments);
      }, options);
    };
    RenderLab.freeze(SEED);
    try {
      if (typeof _lightGridFrameCount !== 'undefined') _lightGridFrameCount = 1;
      if (typeof _presentationRandomState !== 'undefined') _presentationRandomState = 1234567;
      draw();
    } finally {
      RenderLab.unfreeze();
      window.withSceneDepthClip = realClip; window.drawStructureModels3D = realModels;
    }
    var frame = getRenderFeatureStats().frame, counters = {};
    for (var k in frame) counters[k] = frame[k];
    var depth = 0x811c9dc5, bits = new Uint32Array(_sceneDepthInv.buffer, _sceneDepthInv.byteOffset, W * H);
    for (var i = 0; i < bits.length; i++) depth = Math.imul(depth ^ bits[i], 0x01000193);
    return {union: union, masks: masks, counters: counters, depth: (depth >>> 0).toString(16),
      pixels: record ? ctx.getImageData(0, 0, W, H).data : null};
  }
  function lumaStats(data, union) {
    var n = 0, sum = 0, sq = 0, opaque = 0;
    for (var i = 0; i < union.length; i++) {
      if (!union[i]) continue;
      var p = i * 4, l = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      n++; sum += l; sq += l * l; if (data[p + 3] === 255) opaque++;
    }
    var mean = n ? sum / n : NaN;
    return {n: n, opaque: opaque, mean: mean, sd: n ? Math.sqrt(Math.max(0, sq / n - mean * mean)) : NaN};
  }
  function hashPixels(data) {
    var h = 0x811c9dc5;
    for (var i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 0x01000193);
    return (h >>> 0).toString(16);
  }
  function s3Of(c, flatLuma, texLuma) {
    var contrast = texLuma && flatLuma && texLuma.opaque > 0 ? texLuma.sd > flatLuma.sd : null;
    return {pass: (c.texPatternFills || 0) > 0 && !c.texFailedDraws && (c.texPrims || 0) <= (c.texBudget || 0) && contrast !== false,
      fills: c.texPatternFills || 0, failed: c.texFailedDraws || 0, prims: c.texPrims || 0, budget: c.texBudget || 0, contrast: contrast};
  }
  // S4: billboard probes on the view's centre ray against the textured frame's depth.
  function probeS4(union) {
    var C = getCam3D(), W = canvas.width, first = -1, lastVisible = -1;
    function probe(d) {
      var x = cam.x + Math.cos(cam.ang) * d, y = cam.y + Math.sin(cam.ang) * d, ez = floorAt(x, y) * 25;
      var top = projToScreen(x, y, ez + 50, C), bot = projToScreen(x, y, ez, C);
      if (!top || !bot) return {visible: -1};
      var col = Math.round(bot.sx), row = Math.max(0, Math.min(canvas.height - 1, Math.round((top.sy + bot.sy) / 2)));
      return {visible: withSceneDepthBillboard({x: bot.sx - 6, y: top.sy, width: 12, height: Math.max(1, bot.sy - top.sy)}, bot.fwd, function () {}),
        masked: col >= 0 && col < W && !!union[row * W + col]};
    }
    for (var d = 40; d < viewDist * 0.8; d += 16) {
      var r = probe(d);
      if (r.visible > 0) lastVisible = d;
      else if (r.visible === 0 && lastVisible > 0 && r.masked) { first = d; break; }
    }
    if (first < 0) return {status: 'SKIP', note: 'no structure occluder on the centre ray'};
    var behind = probe(first + 48), front = probe(lastVisible);
    return {status: behind.visible === 0 && front.visible > 0 ? 'PASS' : 'FAIL', wall: first, behind: behind.visible, front: front.visible};
  }

  // The checks on the current view. Leaves the feature switches as found.
  function checkView(label) {
    var before = renderFeatureSnapshot(), texBefore = USE_TEXTURES, sink = window.fillSceneDepthTexturedPolygon;
    var out = {label: label || 'view', canvas: canvas.width + 'x' + canvas.height};
    try {
      USE_TEXTURES = true;
      setRenderFeatures(Object.assign({structureTextures: false}, PARAMS));
      var flat = frozenDraw(true);
      setRenderFeatures({structureTextures: true});
      frozenDraw(false); // warm-up: the first textured frame creates the cached patterns
      var tex = frozenDraw(true), tex2 = frozenDraw(true);
      var flatL = lumaStats(flat.pixels, tex.union), texL = lumaStats(tex.pixels, tex.union), readable = texL.opaque > 0;
      var leaks = 0, changed = 0;
      for (var i = 0; i < tex.union.length; i++) {
        var p = i * 4;
        if (tex.pixels[p] !== flat.pixels[p] || tex.pixels[p + 1] !== flat.pixels[p + 1] || tex.pixels[p + 2] !== flat.pixels[p + 2]) {
          if (tex.union[i]) changed++; else leaks++;
        }
      }
      out.S1 = {status: !readable ? 'SKIP' : leaks === 0 && changed > 0 ? 'PASS' : 'FAIL', leaks: leaks, changedInMask: changed, maskPixels: texL.n};
      out.S2 = {status: tex.depth === flat.depth && tex.masks === flat.masks && tex.masks > 0 ? 'PASS' : 'FAIL', depth: [flat.depth, tex.depth], masks: [flat.masks, tex.masks]};
      var s3 = s3Of(tex.counters, readable ? flatL : null, readable ? texL : null);
      out.S3 = {status: s3.pass ? (readable ? 'PASS' : 'PASS (counters only)') : 'FAIL', fills: s3.fills, failed: s3.failed, prims: s3.prims + '/' + s3.budget,
        textured: tex.counters.texFaces || 0, mean: tex.counters.texMean || 0, flat: tex.counters.texFlat || 0,
        sd: readable ? [Math.round(flatL.sd * 10) / 10, Math.round(texL.sd * 10) / 10] : null};
      out.S4 = probeS4(tex.union);
      out.S5 = {status: !readable ? 'SKIP' : hashPixels(tex.pixels) === hashPixels(tex2.pixels) ? 'PASS' : 'FAIL'};
      var ratio = readable ? texL.mean / flatL.mean : NaN;
      out.luma = {status: !readable ? 'SKIP' : Math.abs(ratio - 1) <= 0.08 ? 'PASS' : 'FAIL', flat: Math.round(flatL.mean * 10) / 10,
        textured: Math.round(texL.mean * 10) / 10, delta: Math.round((ratio - 1) * 1000) / 10 + '%'};
      // S6: live switches through the real frame (renderFrame, _pt timers).
      var errors0 = 0, k; for (k in _ptErrors) errors0 += _ptErrors[k];
      var strips = {};
      ['hybrid', 'triangles', 'planar', 'hybrid'].forEach(function (mode, n) {
        setRenderFeatures({textureMapping: mode});
        RenderLab.freeze(SEED); try { renderFrame(); } finally { RenderLab.unfreeze(); }
        strips[mode + (n === 3 ? '2' : '')] = getRenderFeatureStats().frame.texStrips || 0;
      });
      setRenderFeatures({textureMapping: PARAMS.textureMapping});
      var errors1 = 0; for (k in _ptErrors) errors1 += _ptErrors[k];
      out.S6 = {status: errors1 === errors0 && strips.triangles === 0 ? 'PASS' : 'FAIL', newPtErrors: errors1 - errors0, strips: strips};
      // S7: the flat sink in place of the textured sink must fail S3.
      window.fillSceneDepthTexturedPolygon = function (points, surface) {
        if (surface) ctx.fillStyle = rgbQ((surface.lit >>> 16) & 255, (surface.lit >>> 8) & 255, surface.lit & 255);
        return fillSceneDepthPolygon(points);
      };
      var neg;
      try { neg = frozenDraw(true); } finally { window.fillSceneDepthTexturedPolygon = sink; }
      var negS3 = s3Of(neg.counters, readable ? flatL : null, readable ? lumaStats(neg.pixels, neg.union) : null);
      out.S7 = {status: negS3.pass ? 'FAIL' : 'PASS', negativeFills: negS3.fills, negativeContrast: negS3.contrast};
    } finally {
      window.fillSceneDepthTexturedPolygon = sink;
      USE_TEXTURES = texBefore;
      setRenderFeatures(before);
    }
    var statuses = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'luma'].map(function (k) { return out[k].status; });
    out.status = statuses.some(function (s) { return s === 'FAIL'; }) ? 'FAIL' : statuses.some(function (s) { return /^SKIP/.test(s); }) ? 'PARTIAL' : 'PASS';
    return out;
  }
  function line(r) {
    return r.status + ' ' + r.label + ' (' + r.canvas + ')' +
      ' | S1 ' + r.S1.status + ' leaks ' + r.S1.leaks + ' changed ' + r.S1.changedInMask + '/' + r.S1.maskPixels +
      ' | S2 ' + r.S2.status + ' | S3 ' + r.S3.status + ' fills ' + r.S3.fills + ' failed ' + r.S3.failed + ' prims ' + r.S3.prims +
      ' faces ' + r.S3.textured + '/' + r.S3.mean + (r.S3.sd ? ' sd ' + r.S3.sd.join('->') : '') +
      ' | S4 ' + r.S4.status + (r.S4.wall ? ' wall ' + r.S4.wall + ' behind ' + r.S4.behind + ' front ' + r.S4.front : ' ' + (r.S4.note || '')) +
      ' | S5 ' + r.S5.status + ' | S6 ' + r.S6.status + ' ptErrors +' + r.S6.newPtErrors + ' strips ' + JSON.stringify(r.S6.strips) +
      ' | S7 ' + r.S7.status + ' | luma ' + r.luma.status + ' ' + r.luma.flat + ' -> ' + r.luma.textured + ' (' + r.luma.delta + ')';
  }
  // types x seeds x poses. Synchronous; the tab is unusable for timing after.
  function runAll(options) {
    options = options || {};
    var types = options.types || ['fortress', 'arena', 'watchtower'], seeds = options.seeds || [424242, 31337];
    var tags = options.poses || ['exterior', 'approach', 'inside', 'roof'], results = [], lines = [];
    seeds.forEach(function (seed) {
      types.forEach(function (type) {
        RenderLab.startEndless(seed);
        var landed = goToNearestLandmark({type: type});
        RenderLab.stopLoop();
        if (!landed || !landed.ok) { lines.push('SKIP ' + type + '/' + seed + ': ' + (landed && landed.reason)); return; }
        if (typeof buildStructureModels === 'function' && typeof structureModelsCurrent === 'function' && !structureModelsCurrent()) buildStructureModels();
        var set = poses(type);
        tags.forEach(function (tag) {
          if (!set || !set[tag]) { lines.push('SKIP ' + type + '/' + seed + '/' + tag + ': no free pose'); return; }
          setPose(set[tag]);
          var r = checkView(type + '/' + seed + '/' + tag);
          results.push(r); lines.push(line(r));
        });
      });
    });
    var failed = results.filter(function (r) { return r.status === 'FAIL'; }).length;
    lines.unshift((failed ? 'FAIL' : 'PASS') + ' structure textures S1-S7 + luma: ' + results.length + ' views, ' + failed + ' failed (pixel readback: this tab is now unsuitable for timing)');
    RenderLab.write(lines.join('\n'));
    return {pass: failed === 0 && results.length > 0, results: results, text: lines.join('\n')};
  }
  // A/B/B/A configurations for timing, always in a fresh tab with no readback.
  var CONFIGS = {
    flat: {preset: 'recommended', features: {structureTextures: false}},
    hybrid: {preset: 'recommended', features: {structureTextures: true, textureMapping: 'hybrid'}},
    triangles: {preset: 'recommended', features: {structureTextures: true, textureMapping: 'triangles'}}
  };
  // The tail gate on an A/B/B/A run (A = flat model): renderFrame frames over
  // 16.7 ms and 8.33 ms per phase. Textures pass when B's total over 16.7 ms
  // exceeds A's by no more than the noise floor, the repeat spread
  // max(1, |A1 - A2| + |B1 - B2|).
  function tail(run) {
    var names = ['A1', 'B1', 'B2', 'A2'];
    var per = run.phases.map(function (p, i) {
      var draw = p.stages && p.stages['draw()'] || [];
      return {phase: names[i] || p.label, frames: p.renderMs.length,
        over16: p.renderMs.filter(function (ms) { return ms > 16.7; }).length,
        over8: p.renderMs.filter(function (ms) { return ms > 8.33; }).length,
        drawP95: draw.length ? RenderLab.percentile(draw, 95) : NaN};
    });
    if (per.length !== 4) return {pass: false, phases: per, note: 'not an A/B/B/A run'};
    var noise = Math.max(1, Math.abs(per[0].over16 - per[3].over16) + Math.abs(per[1].over16 - per[2].over16));
    var extra = per[1].over16 + per[2].over16 - per[0].over16 - per[3].over16;
    return {pass: extra <= noise, extraOver16: extra, noise: noise, phases: per};
  }
  function tailText(t) {
    return (t.pass ? 'PASS' : 'FAIL') + ' tail: textured minus flat frames over 16.7 ms = ' + t.extraOver16 + ' (noise floor ' + t.noise + '); ' +
      t.phases.map(function (p) { return p.phase + ' >16.7 ' + p.over16 + ' >8.33 ' + p.over8 + '/' + p.frames + ' draw() p95 ' + (isNaN(p.drawP95) ? '-' : p.drawP95.toFixed(2)); }).join('; ');
  }
  // Flat model (A) against 'hybrid' or 'triangles' (B) on the current view.
  function timeView(bKey, options, done) {
    if (!CONFIGS[bKey]) throw new Error('unknown timing configuration ' + bKey);
    RenderLab.abba(CONFIGS.flat, CONFIGS[bKey], options || {}, function (summary, run) {
      var t = tail(run), text = summary.text + '\n' + tailText(t);
      RenderLab.write(text);
      if (done) done({summary: summary, tail: t, text: text});
    });
  }
  return {poses: poses, setPose: setPose, checkView: checkView, line: line, runAll: runAll, CONFIGS: CONFIGS, PARAMS: PARAMS,
    tail: tail, tailText: tailText, timeView: timeView};
}());

(function () {
  var box = document.getElementById('renderLab'), pre = document.getElementById('renderLabResult');
  if (!box || !pre || !document.createElement || typeof box.insertBefore !== 'function') return;
  var row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px';
  function button(text, fn) {
    var b = document.createElement('button');
    b.className = 'btn'; b.textContent = text;
    b.addEventListener('click', function () { try { fn(); } catch (e) { RenderLab.write('FAIL ' + (e && e.message || e)); } });
    row.appendChild(b);
  }
  button('Textures: check this view (readback)', function () { RenderLab.write(RenderLabTextures.line(RenderLabTextures.checkView('current view'))); });
  button('Textures: S1-S7 all structures (readback)', function () { RenderLab.write('Running...'); RenderLabTextures.runAll(); });
  button('Textures: time flat vs hybrid (fresh tab)', function () { RenderLab.write('Timing flat/hybrid/hybrid/flat...'); RenderLabTextures.timeView('hybrid'); });
  button('Textures: time flat vs triangles (fresh tab)', function () { RenderLab.write('Timing flat/triangles/triangles/flat...'); RenderLabTextures.timeView('triangles'); });
  box.insertBefore(row, pre);
}());
