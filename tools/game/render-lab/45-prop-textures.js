// Render lab: prop textures (integration stage L, propTextures, default ON).
// Developer page only.
//   band(view, tier)  swaps this tab's treasureChests for three chests of one
//                     tier (common by default), lock side toward the camera,
//                     fanned sideways so none hides another: view 'near' at
//                     25, 30 and 40 units (camera pitched down to the limit,
//                     1.4; nearer chests on the same floor are below the
//                     view), 'far' at 55, 70 and 90 units; one frozen frame
//   ab()              the current view, frozen, propTextures off then on:
//                     P1 pixels changed by prop textures stay inside the
//                        prop faces' scene-depth masks, and some change
//                     P2 _sceneDepthInv is identical off and on
//                     P3 on: texPropFaces > 0, no failed draws, no strips,
//                        texPrims <= texBudget
//                     luma: mean luma inside the masks on against off, +-8%
//                     A canvas that reads back no opaque pixels reports P1
//                     and luma as SKIP, not PASS (a readback tab only)
//   timeView()        A/B/B/A propTextures off/on at this view (fresh tab)
//   restore()         puts this tab's chests and propTextures back
// Every wrapper, switch and clock is restored after ab().
var RenderLabPropTextures = (function () {
  var CONFIGS = {
    off: {preset: 'recommended', features: {propTextures: false}},
    on: {preset: 'recommended', features: {propTextures: true}}
  };
  var VIEWS = {near: [[25, -5], [30, 9], [40, -16]], far: [[55, -20], [70, 18], [90, -6]]};
  var saved = null, savedOn = null;
  function frozenRender() { RenderLab.freeze(4242); try { renderFrame(); } finally { RenderLab.unfreeze(); } }
  function band(view, tier) {
    RenderLab.stopLoop();
    if (!saved) { saved = treasureChests; savedOn = renderFeatureOn('propTextures'); }
    var spec = VIEWS[view] || VIEWS.near, ax = Math.cos(cam.ang), ay = Math.sin(cam.ang), rx = -ay, ry = ax;
    treasureChests = spec.map(function (s, i) {
      var x = pos.x + ax * s[0] + rx * s[1], y = pos.y + ay * s[0] + ry * s[1];
      return {x: x, y: y, gold: 25, collected: false, opened: false, lidAngle: 0, tier: tier || 'common', seed: 21 + i,
        facing: Math.atan2(pos.y - y, pos.x - x)};
    });
    // Pitch onto the chests' mid-height (the mean over the three), within the game's limit.
    var eye = getCam3D().cameraZ, p = 0;
    treasureChests.forEach(function (ch) { p += (eye - getEntityRenderFloorZ(ch) - 5.5) / Math.hypot(ch.x - pos.x, ch.y - pos.y) / 3; });
    cam.pitch = Math.max(-CAM_PITCH_MAX, Math.min(CAM_PITCH_MAX, p));
    frozenRender();
    return RenderLab.write('Prop texture band (' + (VIEWS[view] ? view : 'near') + '): ' + spec.map(function (s) { return s[0]; }).join(', ') +
      ' units, ' + (tier || 'common') + ', pitch ' + cam.pitch.toFixed(2) + ' (propTextures ' + (renderFeatureOn('propTextures') ? 'on' : 'off') + ').');
  }
  // One frozen frame; records the prop faces' masks (drawWorldModel on a
  // chest or obelisk) and, when asked, the pixels.
  function frame(config, record) {
    var masks = [], inProp = 0, realDraw = drawWorldModel, realClip = withSceneDepthClip;
    drawWorldModel = function (inst, model) {
      var prop = model && (model.family === 'chest' || model.family === 'spawner');
      if (prop) inProp++;
      try { return realDraw.apply(this, arguments); } finally { if (prop) inProp--; }
    };
    withSceneDepthClip = function (points, cb, options) {
      if (!inProp) return realClip.apply(this, arguments);
      return realClip(points, function () {
        var gen = _sceneDepthClipGeneration, W = _sceneDepthW;
        for (var y = _sceneDepthClipMinY; y <= _sceneDepthClipMaxY; y++) {
          if (_sceneDepthClipRowMarks[y] !== gen) continue;
          for (var x = _sceneDepthClipRowMin[y]; x <= _sceneDepthClipRowMax[y]; x++) if (_sceneDepthClipMarks[y * W + x] === gen) masks.push(y * W + x);
        }
        return cb.apply(this, arguments);
      }, options);
    };
    RenderLab.freeze(4242);
    try {
      // Warm up once: the first frame after a switch differs while patterns
      // are created, which would count as leaks outside the prop masks.
      RenderLab.applyConfig(config); renderFrame(); masks.length = 0; renderFrame();
      return {masks: masks, depth: Array.prototype.slice.call(_sceneDepthInv, 0, canvas.width * canvas.height),
        stats: JSON.parse(JSON.stringify(getRenderFeatureStats().frame)),
        pixels: record ? ctx.getImageData(0, 0, canvas.width, canvas.height).data : null};
    } finally {
      RenderLab.unfreeze(); drawWorldModel = realDraw; withSceneDepthClip = realClip;
    }
  }
  function luma(data, i) { return 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]; }
  function ab() {
    RenderLab.stopLoop();
    var snapshot = renderFeatureSnapshot(), off, on;
    try { off = frame(CONFIGS.off, true); on = frame(CONFIGS.on, true); } finally { setRenderFeatures(snapshot); }
    var inMask = {}, n = on.pixels.length / 4, opaque = 0, leaks = 0, changed = 0, lumaOff = 0, lumaOn = 0, count = 0;
    on.masks.forEach(function (i) { inMask[i] = 1; });
    for (var i = 0; i < n; i++) {
      if (off.pixels[i * 4 + 3] === 255) opaque++;
      var diff = off.pixels[i * 4] !== on.pixels[i * 4] || off.pixels[i * 4 + 1] !== on.pixels[i * 4 + 1] || off.pixels[i * 4 + 2] !== on.pixels[i * 4 + 2];
      if (inMask[i]) { count++; lumaOff += luma(off.pixels, i); lumaOn += luma(on.pixels, i); if (diff) changed++; }
      else if (diff) leaks++;
    }
    var readable = opaque > 0, depthSame = off.depth.length === on.depth.length && off.depth.every(function (v, i) { return v === on.depth[i]; });
    var s = on.stats, ratio = count && lumaOff ? lumaOn / lumaOff : NaN, out = {};
    out.P1 = {status: !readable ? 'SKIP' : leaks === 0 && changed > 0 ? 'PASS' : 'FAIL', leaks: leaks, changedInMask: changed, maskPixels: count};
    out.P2 = {status: depthSame && off.masks.length === on.masks.length ? 'PASS' : 'FAIL'};
    out.P3 = {status: s.texPropFaces > 0 && !s.texFailedDraws && !s.texStrips && s.texPrims <= s.texBudget ? 'PASS' : 'FAIL',
      texPropFaces: s.texPropFaces || 0, texPropMean: s.texPropMean || 0, texPropPrims: s.texPropPrims || 0, texPrims: s.texPrims || 0,
      texBudget: s.texBudget || 0, texPropDraws: s.texPropDraws || 0, flat: s.texFlat ? Object.keys(s).filter(function (k) { return /^texFlat./.test(k) && s[k]; }) : []};
    out.luma = {status: !readable ? 'SKIP' : Math.abs(ratio - 1) <= 0.08 ? 'PASS' : 'FAIL', off: count ? Math.round(lumaOff / count * 10) / 10 : 0,
      on: count ? Math.round(lumaOn / count * 10) / 10 : 0};
    var statuses = [out.P1.status, out.P2.status, out.P3.status, out.luma.status];
    out.status = statuses.indexOf('FAIL') >= 0 ? 'FAIL' : statuses.indexOf('SKIP') >= 0 ? 'PARTIAL' : 'PASS';
    out.text = out.status + ' prop textures A/B: P1 ' + out.P1.status + ' (leaks ' + leaks + ', changed ' + changed + '/' + count + ') P2 ' + out.P2.status +
      ' P3 ' + out.P3.status + ' (faces ' + out.P3.texPropFaces + ', mean ' + out.P3.texPropMean + ', prims ' + out.P3.texPropPrims + '/' + out.P3.texBudget +
      ') luma ' + out.luma.status + ' (' + out.luma.off + ' -> ' + out.luma.on + ')';
    RenderLab.write(out.text);
    return out;
  }
  function restore() {
    if (saved) { treasureChests = saved; setRenderFeatures({propTextures: !!savedOn}); saved = null; savedOn = null; }
    return RenderLab.write('Chests and propTextures restored.');
  }
  function timeView(options, done) { RenderLab.abba(CONFIGS.off, CONFIGS.on, options || {}, done); }
  return {CONFIGS: CONFIGS, VIEWS: VIEWS, band: band, ab: ab, restore: restore, timeView: timeView};
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
  button('Prop textures: chests 25-40 u', function () { RenderLabPropTextures.band('near'); });
  button('Prop textures: chests 55-90 u', function () { RenderLabPropTextures.band('far'); });
  button('Prop textures: A/B this view (readback tab)', function () { RenderLabPropTextures.ab(); });
  button('Prop textures: time off vs on (fresh tab)', function () { RenderLab.write('Timing off/on/on/off...'); RenderLabPropTextures.timeView(); });
  button('Prop textures: restore', function () { RenderLabPropTextures.restore(); });
  box.insertBefore(row, pre);
}());
