// Render lab: treasure-chest models (integration stage G). Developer page only.
//   gallery(yawDeg, lid)  swaps this tab's treasureChests for a lab fixture:
//                         the four tiers in a row 50 units ahead, each turned
//                         yawDeg from facing the camera (0 = lock side toward
//                         the camera), lid 0..1; pitches the camera onto the
//                         row and renders one frozen frame
//   animateLid(frames)    opens and closes the gallery lids over `frames`
//                         animation frames (90 by default)
//   caveFixture()         Cave Test 12345 with its visibility-fixture chest
//                         (drawCaveVisibilityFixtures), chestModel on
//   counts()              one frozen draw() per switch state (legacy, model):
//                         pixels the depth test visited inside
//                         drawTreasureChests3D and the mdlChest* counters
//   timeView()            A/B/B/A with chestModel off/on (fresh tab only)
//   restore()             puts this tab's own chests back
// The switch is restored after counts(); gallery() leaves chestModel on.
var RenderLabChests = (function () {
  var CONFIGS = {
    legacy: {preset: 'recommended', features: {chestModel: false}},
    model: {preset: 'recommended', features: {chestModel: true}}
  };
  var TIERS = ['common', 'uncommon', 'rare', 'epic'], saved = null, fixture = null;
  function frozenRender() { RenderLab.freeze(4242); try { renderFrame(); } finally { RenderLab.unfreeze(); } }
  function gallery(yawDeg, lid) {
    RenderLab.stopLoop();
    if (!saved) saved = treasureChests;
    var ax = Math.cos(cam.ang), ay = Math.sin(cam.ang), rx = -ay, ry = ax, open = Math.max(0, Math.min(1, lid || 0));
    fixture = TIERS.map(function (tier, i) {
      var x = pos.x + ax * 50 + rx * (i - 1.5) * 24, y = pos.y + ay * 50 + ry * (i - 1.5) * 24;
      return {x: x, y: y, gold: 25, collected: false, opened: open > 0.3, lidAngle: open, tier: tier, seed: 11 + i,
        facing: Math.atan2(pos.y - y, pos.x - x) + (yawDeg || 0) * Math.PI / 180};
    });
    treasureChests = fixture;
    // Pitch the camera so the row's mid-height sits at the screen centre.
    var z = 0;
    fixture.forEach(function (ch) { z += (getEntityRenderFloorZ(ch) + 6) / fixture.length; });
    cam.pitch = Math.max(-1, Math.min(1, (getCam3D().cameraZ - z) / 50));
    setRenderFeatures({chestModel: true});
    frozenRender();
    return RenderLab.write('Chest gallery: 4 tiers at yaw ' + (yawDeg || 0) + ' deg, lid ' + open + ' (chestModel on; restore() puts the chests back).');
  }
  function animateLid(frames) {
    if (!fixture) gallery(0, 0);
    var n = 0, total = frames || 90;
    function step() {
      var t = n / total, lid = t < 0.5 ? t * 2 : 2 - t * 2;
      fixture.forEach(function (ch) { ch.lidAngle = lid; ch.opened = lid > 0.3; });
      renderFrame();
      if (++n <= total) requestAnimationFrame(step); else RenderLab.write('Lid animation done (' + total + ' frames).');
    }
    requestAnimationFrame(step);
  }
  function caveFixture() {
    RenderLab.startCaveTest(12345);
    var box = document.getElementById('ctVisibilityFixtures');
    if (!box) return RenderLab.write('FAIL no Cave Test fixture checkbox on this page');
    box.checked = true;
    setRenderFeatures({chestModel: true});
    RenderLab.freeze(12345);
    try { drawCaveVisibilityFixtures(); } finally { RenderLab.unfreeze(); }
    return RenderLab.write('Cave Test 12345 fixture chest (rare) drawn with chestModel on; the loop is stopped.');
  }
  function frozenCount(config) {
    var realClip = window.withSceneDepthClip, realDraw = window.drawTreasureChests3D, inside = false, tally = {tested: 0, calls: 0};
    window.drawTreasureChests3D = function () { inside = true; try { return realDraw.apply(this, arguments); } finally { inside = false; } };
    window.withSceneDepthClip = function () {
      var r = realClip.apply(this, arguments);
      if (inside) { tally.calls++; tally.tested += _sceneDepthClipCount + _sceneDepthClipHidden; }
      return r;
    };
    RenderLab.freeze(4242);
    try {
      RenderLab.applyConfig(config);
      draw();
    } finally {
      RenderLab.unfreeze();
      window.withSceneDepthClip = realClip; window.drawTreasureChests3D = realDraw;
    }
    var frame = getRenderFeatureStats().frame;
    tally.faces = frame.mdlChestFaces || 0; tally.culled = frame.mdlChestCulled || 0;
    tally.drawn = frame.mdlChestDrawn || 0; tally.statTested = frame.mdlChestTested || 0;
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
    var text = (label || 'view') + ': legacy ' + legacy.calls + ' depth tests, ' + legacy.tested + ' px | model ' + model.calls +
      ' depth tests, ' + model.tested + ' px, chest faces ' + model.faces + ' culled ' + model.culled + ' drawn ' + model.drawn +
      ' tested ' + model.statTested;
    RenderLab.write(text);
    return {legacy: legacy, model: model, text: text};
  }
  function restore() {
    if (saved) { treasureChests = saved; saved = null; fixture = null; }
    return RenderLab.write('Chests restored.');
  }
  function timeView(options, done) { RenderLab.abba(CONFIGS.legacy, CONFIGS.model, options || {}, done); }
  return {CONFIGS: CONFIGS, gallery: gallery, animateLid: animateLid, caveFixture: caveFixture, counts: counts,
    restore: restore, timeView: timeView};
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
  [0, 90, 180, 270].forEach(function (yaw) {
    button('Chests: 4 tiers at ' + yaw + ' deg', function () { RenderLabChests.gallery(yaw, 0); });
  });
  button('Chests: open lids', function () { RenderLabChests.gallery(0, 1); });
  button('Chests: animate lids', function () { RenderLabChests.animateLid(90); });
  button('Chests: Cave Test fixture chest', function () { RenderLabChests.caveFixture(); });
  button('Chests: counts this view', function () { RenderLabChests.counts('current view'); });
  button('Chests: time legacy vs model (fresh tab)', function () { RenderLab.write('Timing legacy/model/model/legacy...'); RenderLabChests.timeView(); });
  button('Chests: restore', function () { RenderLabChests.restore(); });
  box.insertBefore(row, pre);
}());
