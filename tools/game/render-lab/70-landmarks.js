// Render lab: landmark models (integration stage J1, landmarkModels) and
// their bounds gate (stage J2, landmarkBoundsGate); both default ON since J2.
// Developer page only. The poses turn landmarkModels on and render one
// frozen frame; ab() flips landmarkModels and abGate() flips
// landmarkBoundsGate (A/B).
//   market(seed)        seeded Endless (default 2024): camera 150 u from the
//                       market centre, facing the guard tower and stalls
//   shrine(distance)    camera `distance` u (default 70) from this window's
//                       nearest shrine, facing it
//   shrineAboveCave(seed) adds a lab shrine on an open surface cell over a
//                       roofed cave with head room (seeded Endless `seed`,
//                       default 555, whose spawn window holds caves; the
//                       landmark_bounds 'cave' site rule: 70 u of room under
//                       the roof, the eight neighbours alike, a run of seven
//                       such cave cells, 300 u or more from cave portals
//                       first) and stands on the surface 70 u away
//   shrineFromCave()    the same shrine from the cave floor along that run,
//                       the eye under the roof, looking up (pitch -1.4): the
//                       model stands on the surface, hidden by the cave
//                       roof; the legacy painter stands it on the cave floor
//   fortressGate(seed)  seeded Endless (default 259): camera outside this
//                       window's fortress on the line to its centre, facing
//                       it; walk(step) moves `step` u (default 24) toward the
//                       centre and re-renders (a gate walkthrough)
//   ab()                flips landmarkModels and re-renders this pose
//   portalSideways(seed) seeded Endless (default 555): 6 u outside this
//                       window's nearest cave portal mouth, facing along it
//                       (the portal's centre is beside the camera, depth 0)
//   pastWatchtower(seed) seeded Endless (default 424242), then Go to nearest
//                       landmark (watchtower): the camera past the tower
//                       centre, half-way along an arm, facing out
//   pastRuin(seed)      seeded Endless (default 2024): 6 u past this
//                       window's nearest ruin centre, facing out of its open
//                       face, looking down
//   abGate()            flips landmarkBoundsGate and re-renders this pose;
//                       the probe poses above lose the landmark with it off
//   counts()            one frozen renderFrame() per switch state (legacy,
//                       models; the late landmark stages run there):
//                       the mdlStall/Tower/Shrine/Keep counters
//   timeView()          A/B/B/A with landmarkModels off/on (fresh tab only)
//   restore()           removes the lab shrine
var RenderLabLandmarks = (function () {
  var CONFIGS = {
    legacy: {preset: 'recommended', features: {landmarkModels: false}},
    models: {preset: 'recommended', features: {landmarkModels: true}}
  };
  var KEYS = /^mdl(Stall|Tower|Shrine|Keep)(Faces|Culled|Drawn|Rejected)$/;
  var added = null, site = null, fort = null, api = null;
  function frozenRender() { RenderLab.freeze(4242); try { renderFrame(); } finally { RenderLab.unfreeze(); } }
  function face(x, y) {
    cam.ang = Math.atan2(y - pos.y, x - pos.x);
    cam.pitch = 0;
    setRenderFeatures({landmarkModels: true});
    frozenRender();
  }
  function stand(tx, ty, distance) {
    var a = Math.atan2(pos.y - ty, pos.x - tx);
    RenderLab.place(tx + Math.cos(a) * distance, ty + Math.sin(a) * distance, 0);
    face(tx, ty);
  }
  function market(seed) {
    RenderLab.startEndless(seed || 2024);
    if (!shopMarker) return RenderLab.write('FAIL seed ' + (seed || 2024) + ' has no market in its window; try 2024, 259 or 424242.');
    stand(shopMarker.x, shopMarker.y, 150);
    return RenderLab.write('Market, seed ' + WORLD_SEED + ': ' + marketStalls.length + ' stalls and the guard tower 150 u ahead (landmarkModels on; ab() flips it).');
  }
  function nearestShrine() {
    var best = null;
    (shrines || []).forEach(function (s) { if (!best || Math.hypot(s.x - pos.x, s.y - pos.y) < Math.hypot(best.x - pos.x, best.y - pos.y)) best = s; });
    return best;
  }
  function shrine(distance) {
    var s = nearestShrine();
    if (!s) return RenderLab.write('FAIL no shrine in this window; start seeded Endless (e.g. market(2024)) first.');
    stand(s.x, s.y, distance || 70);
    return RenderLab.write('Shrine (' + s.buffType + (s.used ? ', used' : '') + ') ' + (distance || 70) + ' u ahead (landmarkModels on).');
  }
  // A mesh column: its lowest walkable floor, the lowest ceiling layer
  // (type 2) above it, its top walkable layer, head room in world units and
  // whether the surface cell is open (the landmark_bounds 'cave' rule).
  function caveColumn(gx, gy) {
    var mesh = floorMesh, gs = mesh.gridSize;
    if (gx < 0 || gy < 0 || gx >= mesh.w || gy >= mesh.h) return null;
    var i = gy * mesh.w + gx, floor = Infinity, ceil = NaN, top = -Infinity, li, t, h;
    for (li = 0; li < mesh.layerCount[i]; li++) {
      t = meshLayerType(mesh, i, li); h = meshLayerHeight(mesh, i, li);
      if (t === 1 || t === 3 || t === 4) { floor = Math.min(floor, h); top = Math.max(top, h); }
    }
    for (li = 0; li < mesh.layerCount[i]; li++) {
      t = meshLayerType(mesh, i, li); h = meshLayerHeight(mesh, i, li);
      if (t === 2 && h > floor && !(h >= ceil)) ceil = h;
    }
    var x = (gx + 0.5) * gs, y = (gy + 0.5) * gs, c = Math.floor(x / cell), r = Math.floor(y / cell);
    return {floor: floor, ceil: ceil, top: top, room: (ceil - floor) * 25, roofed: top > ceil,
      open: c >= 0 && r >= 0 && c < gridW && r < gridH && !grid[r * gridW + c]};
  }
  // An open surface cell over a roofed cave with 70 u of head room, its
  // eight neighbours alike and a run of seven such cave cells in one
  // direction (room to stand back under the roof and look up). Sites 300 u
  // or more from every cave portal come first, then the nearest the centre.
  function caveSite() {
    var mesh = floorMesh, best = null;
    if (!mesh || !mesh.layerCount) return null;
    var gs = mesh.gridSize;
    function good(q) { return !!q && q.room >= 70 && q.roofed; }
    function portalDist(x, y) {
      var d = Infinity;
      (deepCaveEntrances || []).forEach(function (ce) { d = Math.min(d, Math.hypot(ce.x - x, ce.y - y)); });
      return d;
    }
    for (var gy = 1; gy < mesh.h - 1; gy++) for (var gx = 1; gx < mesh.w - 1; gx++) {
      var here = caveColumn(gx, gy);
      if (!good(here) || !here.open) continue;
      var ok = true;
      for (var k = 0; k < 9 && ok; k++) { var q = caveColumn(gx + (k % 3) - 1, gy + ((k / 3) | 0) - 1); ok = good(q) && q.open; }
      if (!ok) continue;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        for (var st = 1; st <= 7; st++) if (!good(caveColumn(gx + d[0] * st, gy + d[1] * st))) return;
        var x = (gx + 0.5) * gs, y = (gy + 0.5) * gs, pd = portalDist(x, y);
        var score = (pd >= 300 ? 0 : 1e6) + Math.hypot(gx - mesh.w / 2, gy - mesh.h / 2);
        if (!best || score < best.score) best = {x: x, y: y, dir: d, top: here.top, floor: here.floor, ceil: here.ceil, portal: pd, score: score};
      });
    }
    return best;
  }
  function shrineAboveCave(seed) {
    restore();
    RenderLab.startEndless(seed || 555);
    site = caveSite();
    if (!site) return RenderLab.write('FAIL no open surface cell over a roofed cave in the window of seed ' + WORLD_SEED + '; try 555.');
    added = {x: site.x, y: site.y, buffType: 'regen', used: false, chunkKey: 'lab'};
    shrines.push(added);
    var a = Math.atan2(-site.dir[1], -site.dir[0]);
    RenderLab.place(site.x + Math.cos(a) * 70, site.y + Math.sin(a) * 70, 0);
    face(site.x, site.y);
    return RenderLab.write('Lab shrine over a cave, seed ' + WORLD_SEED + ' (surface h ' + site.top.toFixed(2) + ', roof h ' + site.ceil.toFixed(2) +
      ', cave floor h ' + site.floor.toFixed(2) + ', nearest portal ' + Math.round(site.portal) + ' u). Surface view, 70 u away; shrineFromCave() looks from below.');
  }
  function shrineFromCave() {
    if (!site || !added) return RenderLab.write('FAIL run shrineAboveCave() first.');
    var s = added, gs = floorMesh.gridSize, steps = [5, 6, 7, 4];
    RenderLab.stopLoop();
    for (var k = 0; k < steps.length; k++) {
      pos.x = s.x + site.dir[0] * steps[k] * gs; pos.y = s.y + site.dir[1] * steps[k] * gs; vel.x = vel.y = 0;
      settlePlayerAtSpawn(false);   // the lowest layer: the cave floor
      if (typeof updatePlayerCaveSpace === 'function') updatePlayerCaveSpace();
      var q = caveColumn(Math.floor(pos.x / gs), Math.floor(pos.y / gs)), eye = getCam3D().cameraZ;
      if (playerUnderground && q && q.ceil * 25 > eye + 5) break;   // the eye under the roof
    }
    if (typeof resetRenderInterpolation === 'function') resetRenderInterpolation();
    cam.ang = Math.atan2(s.y - pos.y, s.x - pos.x);
    setRenderFeatures({landmarkModels: true});
    cam.pitch = -1.4;   // look up at the roof (the game allows -CAM_PITCH_MAX)
    frozenRender();
    return RenderLab.write('Cave view ' + Math.round(Math.hypot(s.x - pos.x, s.y - pos.y)) + ' u from under the shrine, looking up (underground ' + !!playerUnderground +
      '): with landmarkModels on the shrine stands on the surface above the roof, which hides it; the legacy one stands on this cave floor ' +
      '(with landmarkBoundsGate off the legacy centre-column gate can hide both from here).');
  }
  function fortressGate(seed) {
    RenderLab.startEndless(seed || 259);
    fort = largeStructures.filter(function (s) {
      return s.type === 'fortress' && s.x > 0 && s.y > 0 && s.x < gridW * cell && s.y < gridH * cell;
    })[0] || null;
    if (!fort) return RenderLab.write('FAIL seed ' + (seed || 259) + ' has no fortress inside its window; try 259, 204 or 162.');
    stand(fort.x, fort.y, CHUNK_SIZE * 1.7 * (fort.scale || 1));
    return RenderLab.write('Fortress, seed ' + WORLD_SEED + ': outside it, facing its centre; walk() steps toward the forge, lectern and banner.');
  }
  function walk(step) {
    if (!fort) return RenderLab.write('FAIL run fortressGate() first.');
    var d = Math.max(0, Math.hypot(pos.x - fort.x, pos.y - fort.y) - (step || 24));
    stand(fort.x, fort.y, Math.max(cell * 6, d));
    return RenderLab.write('Walked to ' + Math.round(Math.hypot(pos.x - fort.x, pos.y - fort.y)) + ' u from the fortress centre.');
  }
  function ab() {
    var on = !(typeof renderFeatureOn === 'function' && renderFeatureOn('landmarkModels'));
    setRenderFeatures({landmarkModels: on});
    RenderLab.freeze(4242); try { renderFrame(); } finally { RenderLab.unfreeze(); }
    return RenderLab.write('landmarkModels ' + (on ? 'ON (B)' : 'OFF (A)') + '.');
  }
  // Stage J2 probe poses: the landmark's centre is behind the camera.
  function nearestOf(list, pred) {
    var best = null;
    (list || []).forEach(function (o) {
      if (pred && !pred(o)) return;
      if (!best || Math.hypot(o.x - pos.x, o.y - pos.y) < Math.hypot(best.x - pos.x, best.y - pos.y)) best = o;
    });
    return best;
  }
  function probe(family, subject, x, y, ang, pitch) {
    RenderLab.place(x, y, ang, pitch);
    api.lastSubject = {family: family, x: subject.x, y: subject.y};
    setRenderFeatures({landmarkModels: true, landmarkBoundsGate: true});
    frozenRender();
  }
  function portalSideways(seed) {
    RenderLab.startEndless(seed || 555);
    var ce = nearestOf(deepCaveEntrances);
    if (!ce) return RenderLab.write('FAIL seed ' + WORLD_SEED + ' has no cave portal in its window; try 555.');
    var fa = Math.atan2(ce.sinA !== undefined ? ce.sinA : Math.sin(ce.angle || 0), ce.cosA !== undefined ? ce.cosA : Math.cos(ce.angle || 0));
    probe('portal', ce, ce.x - Math.cos(fa) * 6, ce.y - Math.sin(fa) * 6, fa + Math.PI / 2, 0);
    return RenderLab.write('Portal mouth, seed ' + WORLD_SEED + ': 6 u outside it, facing along the mouth (its centre is beside the camera). ' +
      'The legacy centre check culled the whole portal here; with landmarkBoundsGate the jamb and flank ahead draw (abGate() flips it).');
  }
  function pastWatchtower(seed) {
    RenderLab.startEndless(seed || 424242);
    var res = goToNearestLandmark({type: 'watchtower', revisit: true});
    if (!res || !res.ok) return RenderLab.write('FAIL no watchtower reached from seed ' + WORLD_SEED + ': ' + (res && res.reason));
    var st = nearestOf(largeStructures, function (s) { return s.type === 'watchtower'; });
    if (!st) return RenderLab.write('FAIL the landing window has no watchtower.');
    var a = st.rotation || 0, d = cell * (3 + 7) * (st.scale || 1);
    probe('watchtower', st, st.x + Math.cos(a) * d, st.y + Math.sin(a) * d, a, 0);
    return RenderLab.write('Watchtower, seed ' + WORLD_SEED + ': past its centre, half-way along an arm, facing out. ' +
      'The legacy gate culled the whole structure (roof, standards, label) here; abGate() flips landmarkBoundsGate.');
  }
  function pastRuin(seed) {
    RenderLab.startEndless(seed || 2024);
    var ru = nearestOf(ruins);
    if (!ru) return RenderLab.write('FAIL seed ' + WORLD_SEED + ' has no ruin in its window; try 2024, 12345 or 777000.');
    var o = ruinLocalToWorld(ru, 0, 1, {}), a = Math.atan2(o.y - ru.y, o.x - ru.x);
    probe('ruin', ru, ru.x + Math.cos(a) * 6, ru.y + Math.sin(a) * 6, a, 0.9);
    return RenderLab.write('Ruin (' + ru.ruinType + '), seed ' + WORLD_SEED + ': 6 u past its centre, facing out of its open face, looking down. ' +
      'The legacy gate culled the waypost and debris ahead; abGate() flips landmarkBoundsGate.');
  }
  function abGate() {
    var on = !(typeof renderFeatureOn === 'function' && renderFeatureOn('landmarkBoundsGate'));
    setRenderFeatures({landmarkBoundsGate: on});
    RenderLab.freeze(4242); try { renderFrame(); } finally { RenderLab.unfreeze(); }
    return RenderLab.write('landmarkBoundsGate ' + (on ? 'ON (B)' : 'OFF (A)') + '.');
  }
  function frozenCount(config) {
    RenderLab.freeze(4242);
    try { RenderLab.applyConfig(config); renderFrame(); } finally { RenderLab.unfreeze(); }
    var frame = getRenderFeatureStats().frame, out = {};
    Object.keys(frame).sort().forEach(function (k) { if (KEYS.test(k) && frame[k]) out[k] = frame[k]; });
    return out;
  }
  function counts(label) {
    var snap = renderFeatureSnapshot(), preset = renderPresetName(), legacy, models;
    try {
      legacy = frozenCount(CONFIGS.legacy); models = frozenCount(CONFIGS.models);
    } finally {
      if (preset === 'legacy' || preset === 'recommended') applyRenderPreset(preset);
      setRenderFeatures(snap);
    }
    function line(o) { return Object.keys(o).map(function (k) { return k + '=' + o[k]; }).join(' ') || '(none)'; }
    var text = (label || 'view') + ':\n  legacy: ' + line(legacy) + '\n  models: ' + line(models);
    RenderLab.write(text);
    return {legacy: legacy, models: models, text: text};
  }
  function restore() {
    if (added && shrines) { var i = shrines.indexOf(added); if (i >= 0) shrines.splice(i, 1); }
    added = null; site = null;
    return RenderLab.write('Landmarks restored.');
  }
  function timeView(options, done) { RenderLab.abba(CONFIGS.legacy, CONFIGS.models, options || {}, done); }
  api = {CONFIGS: CONFIGS, market: market, shrine: shrine, shrineAboveCave: shrineAboveCave, shrineFromCave: shrineFromCave,
    fortressGate: fortressGate, walk: walk, ab: ab, counts: counts, restore: restore, timeView: timeView,
    portalSideways: portalSideways, pastWatchtower: pastWatchtower, pastRuin: pastRuin, abGate: abGate, lastSubject: null};
  return api;
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
  button('Landmarks: seed 2024 market', function () { RenderLabLandmarks.market(2024); });
  button('Landmarks: nearest shrine', function () { RenderLabLandmarks.shrine(70); });
  button('Landmarks: shrine above a cave (seed 555, surface)', function () { RenderLabLandmarks.shrineAboveCave(555); });
  button('Landmarks: same shrine from the cave', function () { RenderLabLandmarks.shrineFromCave(); });
  button('Landmarks: fortress gate (seed 259)', function () { RenderLabLandmarks.fortressGate(259); });
  button('Landmarks: walk toward the keep', function () { RenderLabLandmarks.walk(24); });
  button('Landmarks: A/B (flip landmarkModels)', function () { RenderLabLandmarks.ab(); });
  button('Landmarks: portal mouth sideways (seed 555)', function () { RenderLabLandmarks.portalSideways(555); });
  button('Landmarks: past the watchtower centre', function () { RenderLabLandmarks.pastWatchtower(424242); });
  button('Landmarks: past the ruin centre (seed 2024)', function () { RenderLabLandmarks.pastRuin(2024); });
  button('Landmarks: A/B (flip landmarkBoundsGate)', function () { RenderLabLandmarks.abGate(); });
  button('Landmarks: counts this view', function () { RenderLabLandmarks.counts('current view'); });
  button('Landmarks: time legacy vs models (fresh tab)', function () { RenderLab.write('Timing legacy/models/models/legacy...'); RenderLabLandmarks.timeView(); });
  button('Landmarks: restore', function () { RenderLabLandmarks.restore(); });
  box.insertBefore(row, pre);
}());
