// Render lab: spawner obelisk models (integration stage H). Developer page only.
//   row(distance)     swaps this tab's enemySpawners for a lab fixture: three
//                     obelisks in a row `distance` units ahead (the middle one
//                     damaged, so its HP bar shows, and each at its own pulse
//                     phase), pitches the camera onto their mid-height and
//                     renders one frozen frame with spawnerModel on
//   behindWall(gap)   one obelisk `gap` units (default 30) behind the first
//                     solid cell along the view (terrain occlusion: only its
//                     exposed part, and no glow, eye or bar through the wall;
//                     at 19 the wall is within 25.5 of its centre, where the
//                     first H version let the eye and bar through)
//   wallBehind(gap)   one obelisk `gap` units (default 20) in front of the
//                     first solid cell: the glow should show on the wall
//                     around the body (near or far: face a near or far wall)
//   walkIn(d, away)   one obelisk centred `d` units ahead (behind with away):
//                     the camera is in or at it (spawners have no movement
//                     collision); the view must not fill with the obelisk
//   counts()          one frozen draw() per switch state (legacy, model):
//                     pixels the depth test visited inside
//                     drawEnemySpawners3D and the mdlSpawner* counters
//   timeView()        A/B/B/A with spawnerModel off/on (fresh tab only)
//   restore()         puts this tab's own spawners and camera pitch back
// The switch is restored after counts(); the posing calls leave spawnerModel
// on.
var RenderLabSpawners = (function () {
  var CONFIGS = {
    legacy: {preset: 'recommended', features: {spawnerModel: false}},
    model: {preset: 'recommended', features: {spawnerModel: true}}
  };
  var saved = null, savedPitch = 0;
  function frozenRender() { RenderLab.freeze(4242); try { renderFrame(); } finally { RenderLab.unfreeze(); } }
  function spawner(x, y, hp, phase) {
    return {x: x, y: y, hp: hp, maxHp: 6, cooldownMs: 8000, lastSpawn: 0, spawnCount: 0, maxSpawns: 0,
      active: true, type: 'basic', pulsePhase: phase};
  }
  // lookZ: pitch the camera onto that height over the fixture (null keeps it).
  function pose(fixture, lookZ) {
    if (!saved) { saved = enemySpawners; savedPitch = cam.pitch; }
    enemySpawners = fixture;
    if (lookZ !== null) {
      var z = 0;
      fixture.forEach(function (sp) { z += (getEntityRenderFloorZ(sp) + lookZ) / fixture.length; });
      var d = Math.max(20, Math.hypot(fixture[0].x - pos.x, fixture[0].y - pos.y));
      cam.pitch = Math.max(-1, Math.min(1, (getCam3D().cameraZ - z) / d));
    }
    setRenderFeatures({spawnerModel: true});
    frozenRender();
  }
  function row(distance) {
    RenderLab.stopLoop();
    var d = distance || 60, ax = Math.cos(cam.ang), ay = Math.sin(cam.ang), rx = -ay, ry = ax;
    var gap = Math.max(60, d * 0.6);
    pose([-1, 0, 1].map(function (k) {
      return spawner(pos.x + ax * d + rx * k * gap, pos.y + ay * d + ry * k * gap, k === 0 ? 3 : 6, 1 + k * 2);
    }), 45);
    return RenderLab.write('Spawner row ' + d + ' u ahead (3 obelisks; middle one at 3/6 HP; spawnerModel on; restore() puts the spawners back).');
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
    var g = Number.isFinite(gap) ? gap : 30, ax = Math.cos(cam.ang), ay = Math.sin(cam.ang), hit = firstSolid();
    if (hit < 0) return RenderLab.write('FAIL no solid cell within 600 u along the view; turn toward a wall or hill and retry.');
    pose([spawner(pos.x + ax * (hit + g), pos.y + ay * (hit + g), 3, 0)], 45);
    return RenderLab.write('Spawner ' + g + ' u behind the first solid cell (' + hit.toFixed(0) + ' u ahead): only its exposed part may show; no glow, eye or bar through the wall.');
  }
  function wallBehind(gap) {
    RenderLab.stopLoop();
    var g = Number.isFinite(gap) ? gap : 20, ax = Math.cos(cam.ang), ay = Math.sin(cam.ang), hit = firstSolid();
    if (hit < 0) return RenderLab.write('FAIL no solid cell within 600 u along the view; turn toward a wall or hill and retry.');
    if (hit - g < 30) return RenderLab.write('FAIL the first solid cell is ' + hit.toFixed(0) + ' u ahead; face a wall at least ' + (g + 30) + ' u away and retry.');
    pose([spawner(pos.x + ax * (hit - g), pos.y + ay * (hit - g), 3, 0)], 45);
    return RenderLab.write('Spawner ' + g + ' u in front of the first solid cell (' + hit.toFixed(0) + ' u ahead): its glow should show on the wall around the body.');
  }
  function walkIn(distance, away) {
    RenderLab.stopLoop();
    var d = Number.isFinite(distance) ? distance : 8, k = away ? -d : d;
    pose([spawner(cam.x + Math.cos(cam.ang) * k, cam.y + Math.sin(cam.ang) * k, 3, 0)], null);
    return RenderLab.write('Camera ' + d + ' u from an obelisk centre, facing ' + (away ? 'away from' : 'toward') +
      ' it: the view must not fill with obelisk colour; enemies, projectiles and loot stay visible (the model yields to the legacy billboard here).');
  }
  function frozenCount(config) {
    var realClip = window.withSceneDepthClip, realDraw = window.drawEnemySpawners3D, inside = false, tally = {tested: 0, calls: 0};
    window.drawEnemySpawners3D = function () { inside = true; try { return realDraw.apply(this, arguments); } finally { inside = false; } };
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
      window.withSceneDepthClip = realClip; window.drawEnemySpawners3D = realDraw;
    }
    var frame = getRenderFeatureStats().frame;
    tally.faces = frame.mdlSpawnerFaces || 0; tally.culled = frame.mdlSpawnerCulled || 0;
    tally.drawn = frame.mdlSpawnerDrawn || 0; tally.statTested = frame.mdlSpawnerTested || 0;
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
      ' depth tests, ' + model.tested + ' px, spawner faces ' + model.faces + ' culled ' + model.culled + ' drawn ' + model.drawn +
      ' tested ' + model.statTested;
    RenderLab.write(text);
    return {legacy: legacy, model: model, text: text};
  }
  function restore() {
    if (saved) { enemySpawners = saved; saved = null; cam.pitch = savedPitch; }
    return RenderLab.write('Spawners restored.');
  }
  function timeView(options, done) { RenderLab.abba(CONFIGS.legacy, CONFIGS.model, options || {}, done); }
  return {CONFIGS: CONFIGS, row: row, behindWall: behindWall, wallBehind: wallBehind, walkIn: walkIn, counts: counts,
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
  [45, 120, 300].forEach(function (d) {
    button('Spawners: row at ' + d + ' u', function () { RenderLabSpawners.row(d); });
  });
  button('Spawners: behind nearest wall', function () { RenderLabSpawners.behindWall(); });
  button('Spawners: 19 u behind nearest wall', function () { RenderLabSpawners.behindWall(19); });
  button('Spawners: wall directly behind', function () { RenderLabSpawners.wallBehind(20); });
  button('Spawners: walk into (8 u, facing it)', function () { RenderLabSpawners.walkIn(8); });
  button('Spawners: walk into (14 u, facing it)', function () { RenderLabSpawners.walkIn(14); });
  button('Spawners: walk into (8 u, facing away)', function () { RenderLabSpawners.walkIn(8, true); });
  button('Spawners: counts this view', function () { RenderLabSpawners.counts('current view'); });
  button('Spawners: time legacy vs model (fresh tab)', function () { RenderLab.write('Timing legacy/model/model/legacy...'); RenderLabSpawners.timeView(); });
  button('Spawners: restore', function () { RenderLabSpawners.restore(); });
  box.insertBefore(row, pre);
}());
