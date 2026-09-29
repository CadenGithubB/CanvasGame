// Render lab: opaque-first pass order (integration stage G2). Developer page only.
//   ruinPose(early)  the nearest ruin in this tab's window: the camera out in
//                    front of its waypost (the first open cell 60..100 out
//                    with a clear line), the nearest live enemy moved 45 out
//                    from the post and a rare chest 55 out beside it; one
//                    frozen frame with landmarkOpaqueEarly on (early) or off
//                    (the late order, where the post paints over them)
//   timeView()       A/B/B/A with landmarkOpaqueEarly off/on (fresh tab
//                    only): landmarkOpaque3D, sceneEntities, ruins3D and
//                    structures3D stage times
//   restore()        puts this tab's enemy, chests and switches back
var RenderLabPassOrder = (function () {
  var CONFIGS = {
    late: {preset: 'recommended', features: {landmarkOpaqueEarly: false}},
    early: {preset: 'recommended', features: {landmarkOpaqueEarly: true}}
  };
  var saved = null;
  function solidAt(x, y) {
    var gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    return gx < 0 || gy < 0 || gx >= gridW || gy >= gridH || !!grid[gy * gridW + gx];
  }
  function clearLine(ax, ay, bx, by) {
    var steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 3);
    for (var i = 0; i <= steps; i++) if (solidAt(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)) return false;
    return true;
  }
  function nearestRuin() {
    var best = null, bestD = Infinity;
    (ruins || []).forEach(function (ru) {
      var d = Math.hypot(ru.x - pos.x, ru.y - pos.y);
      if (d < bestD) { bestD = d; best = ru; }
    });
    return best;
  }
  function ruinPose(early) {
    RenderLab.stopLoop();
    var ru = nearestRuin();
    if (!ru) return RenderLab.write('FAIL no ruin in this window (walk nearer one; the landmark finder lists structures only).');
    var post = getRuinPostWorld(ru, {}), out = 0;
    [80, 70, 90, 60, 100].some(function (d) {
      if (clearLine(post.x + post.outX * 8, post.y + post.outY * 8, post.x + post.outX * d, post.y + post.outY * d)) { out = d; return true; }
      return false;
    });
    if (!out) return RenderLab.write('FAIL no open cell 60..100 out from the nearest ruin\'s waypost');
    if (!saved) saved = {chests: treasureChests, enemy: null, features: renderFeatureSnapshot()};
    pos.x = post.x + post.outX * out; pos.y = post.y + post.outY * out;
    vel.x = vel.y = 0; settlePlayerAtSpawn(true);
    var foe = null, foeD = Infinity;
    (enemies || []).forEach(function (e) {
      if (!(e.health > 0)) return;
      var d = Math.hypot(e.x - pos.x, e.y - pos.y);
      if (d < foeD) { foeD = d; foe = e; }
    });
    if (foe) {
      if (!saved.enemy) saved.enemy = {e: foe, x: foe.x, y: foe.y};
      foe.x = post.x + post.outX * 45; foe.y = post.y + post.outY * 45;
    }
    var chx = post.x + post.outX * 55 + post.rightX * 10, chy = post.y + post.outY * 55 + post.rightY * 10;
    treasureChests = [{x: chx, y: chy, gold: 10, collected: false, opened: false, lidAngle: 0, tier: 'rare', seed: 5,
      facing: Math.atan2(pos.y - chy, pos.x - chx)}];
    setRenderFeatures({landmarkOpaqueEarly: !!early});
    cam.ang = Math.atan2(post.y - pos.y, post.x - pos.x); cam.pitch = 0;
    resetRenderInterpolation();
    RenderLab.freeze(4242);
    try { renderFrame(); } finally { RenderLab.unfreeze(); }
    return RenderLab.write('Ruin waypost ' + out + ' ahead (' + ru.ruinType + '), enemy ' + (foe ? 'moved 45 out' : 'none alive') +
      ', rare chest 55 out; landmarkOpaqueEarly ' + (early ? 'ON: the post is behind them' : 'OFF (late order): the post paints over them') +
      '. restore() puts the enemy, chests and switches back.');
  }
  function restore() {
    if (saved) {
      treasureChests = saved.chests;
      if (saved.enemy) { saved.enemy.e.x = saved.enemy.x; saved.enemy.e.y = saved.enemy.y; }
      setRenderFeatures(saved.features);
      saved = null;
    }
    return RenderLab.write('Pass-order pose restored.');
  }
  function timeView(options, done) { RenderLab.abba(CONFIGS.late, CONFIGS.early, options || {}, done); }
  return {CONFIGS: CONFIGS, ruinPose: ruinPose, restore: restore, timeView: timeView};
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
  button('Pass order: ruin post behind enemy (early)', function () { RenderLabPassOrder.ruinPose(true); });
  button('Pass order: same, late order', function () { RenderLabPassOrder.ruinPose(false); });
  button('Pass order: time late vs early (fresh tab)', function () { RenderLab.write('Timing late/early/early/late...'); RenderLabPassOrder.timeView(); });
  button('Pass order: restore', function () { RenderLabPassOrder.restore(); });
  box.insertBefore(row, pre);
}());
