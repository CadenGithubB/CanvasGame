// Render lab: floor-prop models (integration stage I). Developer page only.
//   gallery(distance, set)  swaps this tab's floorScatter for a lab fixture:
//                      set 1 (default: crate, broken crate, barrel, boulder,
//                      mossy boulder, stone column, sand pillar, mesa boulder)
//                      or set 2 (I2: stalagmite, tree stump, fallen log, rock
//                      spire, cave rubble pile, rock arch, spaced wider) in a
//                      row `distance` units ahead (default 60), pitches the
//                      camera onto the row and renders one frozen frame with
//                      floorPropModels on
//   distanceRow()      crates, barrels and stone columns at 45, 120, 250 and
//                      400 u (small props at distance: the models have no
//                      6 px sprite minimum)
//   behindWall(gap)    one crate `gap` units (default 20) behind the first
//                      solid cell along the view: only its exposed part may
//                      show
//   capture()          one frozen pixel capture per switch state (legacy
//                      sprites, models) of the current view; use it per biome,
//                      windowed and under the fullscreen row cap (this tab is
//                      then unsuitable for timing)
//   counts()           one frozen draw() per switch state: depth tests and
//                      pixels visited inside drawFloorScatter3D, paintFloorItem
//                      calls and the mdlFloorProp* counters
//   timeView()         A/B/B/A with floorPropModels off/on (fresh tab only)
//   restore()          puts this tab's own floor scatter and camera pitch back
// The switch is restored after counts() and capture(); the posing calls leave
// floorPropModels on.
var RenderLabFloorProps = (function () {
  var CONFIGS = {
    legacy: {preset: 'recommended', features: {floorPropModels: false}},
    model: {preset: 'recommended', features: {floorPropModels: true}}
  };
  var GALLERY = [['crate', 0], ['crate', 2], ['barrel', 0], ['boulder', 0], ['boulder', 1],
    ['stone_column', 0], ['sand_pillar', 0], ['mesa_boulder', 0]];
  var GALLERY2 = [['stalagmite', 0], ['tree_stump', 0], ['fallen_log', 0], ['rock_spire', 0], ['cave_rubble_pile', 0], ['rock_arch', 0]];
  var saved = null, savedPitch = 0;
  function frozenRender() { RenderLab.freeze(4242); try { renderFrame(); } finally { RenderLab.unfreeze(); } }
  function item(type, variant, x, y, seed) { return {x: x, y: y, type: type, variant: variant, seed: seed, spawnMs: 0}; }
  function pose(fixture, lookZ, distance) {
    if (!saved) { saved = floorScatter; savedPitch = cam.pitch; }
    floorScatter = fixture;
    var z = 0;
    fixture.forEach(function (it) { z += (getEntityRenderFloorZ(it) + lookZ) / fixture.length; });
    cam.pitch = Math.max(-1, Math.min(1, (getCam3D().cameraZ - z) / Math.max(20, distance)));
    setRenderFeatures({floorPropModels: true});
    frozenRender();
  }
  function gallery(distance, set) {
    RenderLab.stopLoop();
    var list = set === 2 ? GALLERY2 : GALLERY, wide = set === 2;
    var d = distance || 60, ax = Math.cos(cam.ang), ay = Math.sin(cam.ang), rx = -ay, ry = ax;
    var gap = wide ? Math.max(14, d * 0.28) : Math.max(10, d * 0.2);   // set 2: the arch and log are ~14 u long
    pose(list.map(function (g, i) {
      var k = i - (list.length - 1) / 2;
      return item(g[0], g[1], pos.x + ax * d + rx * k * gap, pos.y + ay * d + ry * k * gap, 101 + i * 37);
    }), 5, d);
    return RenderLab.write('Floor-prop gallery ' + (wide ? '2 ' : '') + d + ' u ahead (' + list.map(function (g) { return g[0] + (g[1] ? '/' + g[1] : ''); }).join(', ') +
      '; floorPropModels on; restore() puts the scatter back).');
  }
  function distanceRow() {
    RenderLab.stopLoop();
    var ax = Math.cos(cam.ang), ay = Math.sin(cam.ang), rx = -ay, ry = ax, list = [];
    [45, 120, 250, 400].forEach(function (d, i) {
      ['crate', 'barrel', 'stone_column'].forEach(function (type, k) {
        var off = (k - 1) * Math.max(12, d * 0.12);
        list.push(item(type, 0, pos.x + ax * d + rx * off, pos.y + ay * d + ry * off, 7 + i * 13 + k));
      });
    });
    pose(list, 4, 120);
    return RenderLab.write('Crates, barrels and stone columns at 45, 120, 250 and 400 u (floorPropModels on): note the farthest that still reads; press G to compare the sprites.');
  }
  function firstSolid() {
    var ax = Math.cos(cam.ang), ay = Math.sin(cam.ang);
    for (var t = cell; t < 600; t += cell * 0.5) {
      var gx = Math.floor((pos.x + ax * t) / cell), gy = Math.floor((pos.y + ay * t) / cell);
      if (gx >= 0 && gy >= 0 && gx < gridW && gy < gridH && grid[gy * gridW + gx]) return t;
    }
    return -1;
  }
  function behindWall(gap) {
    RenderLab.stopLoop();
    var g = Number.isFinite(gap) ? gap : 20, ax = Math.cos(cam.ang), ay = Math.sin(cam.ang), hit = firstSolid();
    if (hit < 0) return RenderLab.write('FAIL no solid cell within 600 u along the view; turn toward a wall or hill and retry.');
    pose([item('crate', 0, pos.x + ax * (hit + g), pos.y + ay * (hit + g), 5)], 4, hit + g);
    return RenderLab.write('Crate ' + g + ' u behind the first solid cell (' + hit.toFixed(0) + ' u ahead): only its exposed part may show.');
  }
  function capture() {
    var snap = renderFeatureSnapshot(), preset = renderPresetName();
    try { return RenderLab.capture([CONFIGS.legacy, CONFIGS.model]); }
    finally {
      if (preset === 'legacy' || preset === 'recommended') applyRenderPreset(preset);
      setRenderFeatures(snap);
    }
  }
  function frozenCount(config) {
    var realClip = window.withSceneDepthClip, realDraw = window.drawFloorScatter3D, realPaint = window.paintFloorItem;
    var inside = false, tally = {tested: 0, calls: 0, paints: 0};
    window.drawFloorScatter3D = function () { inside = true; try { return realDraw.apply(this, arguments); } finally { inside = false; } };
    window.withSceneDepthClip = function () {
      var r = realClip.apply(this, arguments);
      if (inside) { tally.calls++; tally.tested += _sceneDepthClipCount + _sceneDepthClipHidden; }
      return r;
    };
    window.paintFloorItem = function () { if (inside) tally.paints++; return realPaint.apply(this, arguments); };
    RenderLab.freeze(4242);
    try {
      RenderLab.applyConfig(config);
      draw();
    } finally {
      RenderLab.unfreeze();
      window.withSceneDepthClip = realClip; window.drawFloorScatter3D = realDraw; window.paintFloorItem = realPaint;
    }
    var frame = getRenderFeatureStats().frame;
    tally.instances = frame.mdlFloorPropInstances || 0; tally.faces = frame.mdlFloorPropFaces || 0;
    tally.culled = frame.mdlFloorPropCulled || 0; tally.drawn = frame.mdlFloorPropDrawn || 0;
    tally.rejected = frame.mdlFloorPropRejected || 0; tally.statTested = frame.mdlFloorPropTested || 0;
    return tally;
  }
  function counts(label) {
    var snap = renderFeatureSnapshot(), preset = renderPresetName(), legacy, model;
    try {
      legacy = frozenCount(CONFIGS.legacy); model = frozenCount(CONFIGS.model);
    } finally {
      if (preset === 'legacy' || preset === 'recommended') applyRenderPreset(preset);
      setRenderFeatures(snap);
    }
    var text = (label || 'view') + ': legacy ' + legacy.calls + ' depth tests, ' + legacy.tested + ' px, ' + legacy.paints +
      ' paintFloorItem | model ' + model.calls + ' depth tests, ' + model.tested + ' px, ' + model.paints + ' paintFloorItem, ' +
      model.instances + ' props, faces ' + model.faces + ' culled ' + model.culled + ' drawn ' + model.drawn +
      ' rejected ' + model.rejected + ' tested ' + model.statTested;
    RenderLab.write(text);
    return {legacy: legacy, model: model, text: text};
  }
  function restore() {
    if (saved) { floorScatter = saved; saved = null; cam.pitch = savedPitch; }
    return RenderLab.write('Floor scatter restored.');
  }
  function timeView(options, done) { RenderLab.abba(CONFIGS.legacy, CONFIGS.model, options || {}, done); }
  return {CONFIGS: CONFIGS, gallery: gallery, distanceRow: distanceRow, behindWall: behindWall, capture: capture,
    counts: counts, restore: restore, timeView: timeView};
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
  [40, 60, 120].forEach(function (d) {
    button('Floor props: gallery at ' + d + ' u', function () { RenderLabFloorProps.gallery(d); });
  });
  [40, 60, 120].forEach(function (d) {
    button('Floor props: gallery 2 (stalagmite, stump, log, spire, rubble, arch) at ' + d + ' u', function () { RenderLabFloorProps.gallery(d, 2); });
  });
  button('Floor props: distance row', function () { RenderLabFloorProps.distanceRow(); });
  button('Floor props: behind nearest wall', function () { RenderLabFloorProps.behindWall(); });
  button('Floor props: capture sprites vs models', function () { RenderLabFloorProps.capture(); });
  button('Floor props: counts this view', function () { RenderLabFloorProps.counts('current view'); });
  button('Floor props: time legacy vs model (fresh tab)', function () { RenderLab.write('Timing legacy/model/model/legacy...'); RenderLabFloorProps.timeView(); });
  button('Floor props: restore', function () { RenderLabFloorProps.restore(); });
  box.insertBefore(row, pre);
}());
