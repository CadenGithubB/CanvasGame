// Render lab: wall-prop models (integration stage F). Developer page only.
//   poseAt(type, deg)  camera deg degrees off the normal of the nearest wall
//                      prop of that type with a clear line of sight (70 by
//                      default: a grazing view), from an open cell
//   caveEntrancePose   the same at the torch nearest a cave entrance
//   counts()           one frozen draw() per switch state (sprite, model):
//                      props drawn (by model key), pixels the depth test
//                      visited inside drawWallDecorations, and the wallProp
//                      face counters
//   capture()          sprite against model pixels (readback tab only)
//   timeView()         A/B/B/A with wallPropModels off/on (fresh tab only);
//                      the model phases print mdlWallProp* counters per frame
// Wrappers and the switch are restored after every call.
var RenderLabWallProps = (function () {
  var CONFIGS = {
    sprite: {preset: 'recommended', features: {wallPropModels: false}},
    model: {preset: 'recommended', features: {wallPropModels: true}}
  };
  function solidAt(x, y) {
    var gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    return gx < 0 || gy < 0 || gx >= gridW || gy >= gridH || !!grid[gy * gridW + gx];
  }
  function clearLine(ax, ay, bx, by) {
    var steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 3);
    for (var i = 1; i < steps; i++) if (solidAt(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)) return false;
    return true;
  }
  // Nearest prop of `type` (canonical name) to (x, y) that has an attachment.
  function nearestProp(type, x, y) {
    var best = null, bestD = Infinity;
    (wallDecorations || []).forEach(function (d) {
      if (canonicalWallDecorationType(d.type) !== type) return;
      var a = getWallDecorationAttachment(d);
      if (!a) return;
      var dist = Math.hypot(a.x - x, a.y - y);
      if (dist < bestD) { bestD = dist; best = {dec: d, attachment: a}; }
    });
    return best;
  }
  function poseFor(prop, deg) {
    var a = prop.attachment, tx = -a.ny, ty = a.nx, r = (deg === undefined ? 70 : deg) * Math.PI / 180;
    var tries = [60, 45, 80, 35, 100];
    for (var k = 0; k < tries.length; k++) {
      for (var side = -1; side <= 1; side += 2) {
        var x = a.x + (Math.cos(r) * a.nx + side * Math.sin(r) * tx) * tries[k];
        var y = a.y + (Math.cos(r) * a.ny + side * Math.sin(r) * ty) * tries[k];
        if (solidAt(x, y) || !clearLine(x, y, a.x, a.y)) continue;
        RenderLab.place(x, y, Math.atan2(a.y - y, a.x - x));
        return {ok: true, type: canonicalWallDecorationType(prop.dec.type), deg: deg === undefined ? 70 : deg, distance: tries[k],
          side: prop.dec.side, x: Math.round(x), y: Math.round(y)};
      }
    }
    return {ok: false, reason: 'no open cell with a clear view of the ' + prop.dec.type};
  }
  function poseAt(type, deg) {
    var prop = nearestProp(type || 'torch', pos.x, pos.y);
    return prop ? poseFor(prop, deg) : {ok: false, reason: 'no ' + (type || 'torch') + ' with an attachment in this window'};
  }
  function caveEntrancePose(deg) {
    var e = (typeof deepCaveEntrances !== 'undefined' && deepCaveEntrances || [])[0];
    if (!e) return {ok: false, reason: 'no cave entrance in this window'};
    var prop = nearestProp('torch', e.x, e.y);   // deepCaveEntrances are window-local
    return prop ? poseFor(prop, deg) : {ok: false, reason: 'no torch near the cave entrance'};
  }
  // One frozen draw(); counts only the depth tests made inside drawWallDecorations.
  function frozenCount(config) {
    var realClip = window.withSceneDepthClip, realDraw = window.drawWallDecorations, realModel = window.drawWorldModel;
    var inside = false, tally = {props: 0, tested: 0, spriteQuads: 0, modelDraws: 0, modelFaces: 0, byKey: {}};
    window.drawWallDecorations = function () { inside = true; try { return realDraw.apply(this, arguments); } finally { inside = false; } };
    window.drawWorldModel = function (inst, model) {
      if (inside && model && model.family === 'wallProp') {
        tally.modelDraws++; tally.modelFaces += model.faceCount; tally.byKey[model.key] = (tally.byKey[model.key] || 0) + 1;
      }
      return realModel.apply(this, arguments);
    };
    window.withSceneDepthClip = function (points, cb, options) {
      var r = realClip.apply(this, arguments);
      if (inside) {
        tally.tested += _sceneDepthClipCount + _sceneDepthClipHidden;
        if (options && options.depthBias === 1.5) tally.spriteQuads++;
      }
      return r;
    };
    RenderLab.freeze(4242);
    try {
      RenderLab.applyConfig(config);
      if (typeof _lightGridFrameCount !== 'undefined') _lightGridFrameCount = 1;
      draw();
    } finally {
      RenderLab.unfreeze();
      window.withSceneDepthClip = realClip; window.drawWallDecorations = realDraw; window.drawWorldModel = realModel;
    }
    var frame = getRenderFeatureStats().frame;
    tally.props = tally.modelDraws + tally.spriteQuads;
    tally.faces = frame.mdlWallPropFaces || 0; tally.culled = frame.mdlWallPropCulled || 0;
    tally.drawn = frame.mdlWallPropDrawn || 0; tally.statTested = frame.mdlWallPropTested || 0;
    return tally;
  }
  function counts(label) {
    var snap = renderFeatureSnapshot(), preset = renderPresetName();
    var sprite, model;
    try {
      sprite = frozenCount(CONFIGS.sprite); model = frozenCount(CONFIGS.model);
    } finally {
      if (preset === 'legacy' || preset === 'recommended') applyRenderPreset(preset);
      setRenderFeatures(snap);
    }
    var text = (label || 'view') + ': sprite ' + sprite.props + ' props, ' + sprite.tested + ' px tested | model ' + model.props +
      ' props (' + model.modelDraws + ' modelled ' + JSON.stringify(model.byKey) + '), ' + model.tested + ' px tested, wallProp faces ' +
      model.faces + ' culled ' + model.culled + ' drawn ' + model.drawn + ' tested ' + model.statTested;
    RenderLab.write(text);
    return {sprite: sprite, model: model, text: text};
  }
  function capture() { return RenderLab.capture([CONFIGS.sprite, CONFIGS.model]); }
  function timeView(options, done) { RenderLab.abba(CONFIGS.sprite, CONFIGS.model, options || {}, done); }
  return {CONFIGS: CONFIGS, poseAt: poseAt, caveEntrancePose: caveEntrancePose, counts: counts, capture: capture, timeView: timeView};
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
  function report(r) { RenderLab.write(r.ok ? 'Posed ' + JSON.stringify(r) : 'FAIL ' + r.reason); }
  button('Wall props: fortress torch at 70 deg', function () {
    var r = goToNearestLandmark({type: 'fortress'}); RenderLab.stopLoop();
    report(r && r.ok ? RenderLabWallProps.poseAt('torch', 70) : {ok: false, reason: r && r.reason});
  });
  button('Wall props: nearest shield / banner at 70 deg', function () {
    var r = RenderLabWallProps.poseAt('shield', 70); report(r.ok ? r : RenderLabWallProps.poseAt('banner', 70));
  });
  button('Wall props: nearest banner at 70 deg', function () { report(RenderLabWallProps.poseAt('banner', 70)); });
  button('Wall props: nearest sconce at 70 deg', function () { report(RenderLabWallProps.poseAt('sconce', 70)); });
  button('Wall props: cave-entrance torch at 70 deg', function () { report(RenderLabWallProps.caveEntrancePose(70)); });
  button('Wall props: counts this view', function () { RenderLabWallProps.counts('current view'); });
  button('Wall props: capture sprite vs model (readback)', function () { RenderLabWallProps.capture(); });
  button('Wall props: time sprite vs model (fresh tab)', function () { RenderLab.write('Timing sprite/model/model/sprite...'); RenderLabWallProps.timeView(); });
  box.insertBefore(row, pre);
}());
