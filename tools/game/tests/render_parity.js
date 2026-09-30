// Legacy recording reference. Every 2D-context call and state set made during
// one renderFrame() is serialized (numbers rounded to 1e-3) and hashed, under
// the Legacy preset, at three seeded scenes. test_render_parity.py pins the
// hashes: a stage that must leave Legacy byte-identical keeps them unchanged,
// and a stage that changes Legacy on purpose re-pins them with the reason.
// Commands, not pixels: the host is not a rasterizer (render_host.js).
//   --source-root DIR          load page.html/manifest/src from DIR (e.g. a snapshot)
//   --wall-colour-plus-one     sensitivity: every biome wall colour +1 blue
//   --window-relative-variant  restores the pre-F1 wall-decoration variant key
//                              (window-relative gridX/Y): must reproduce the
//                              Stage B pins, so F1's re-key is the only change
//   --pre-fade-spell-panel     drops the spell HUD fade's trailing globalAlpha
//                              reset; the scenes record inside the fade's hold,
//                              so this is the pre-fade panel's exact command
//                              stream and must reproduce the F1 pins
//   --water-off                starts with the water system (06-water.js)
//                              switched off: no carving, lakes or water pass,
//                              so it must reproduce the held-staff pins
(function () {
  (0, eval)(slurp('tools/game/tests/render_host.js'));
  function option(name) { var i = __argv.indexOf(name); return i >= 0 ? __argv[i + 1] : null; }
  var root = option('--source-root');
  var H = createRenderTestHost({sourceRoot: root ? root.replace(/\/?$/, '/') : null}), G = H.G, out = H.output;
  var checked = 0, failed = 0;
  function check(name, ok, detail) {
    checked++; if (!ok) failed++;
    out((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + JSON.stringify(detail === undefined ? null : detail)));
  }
  function mutate(path, source) {
    if (__argv.indexOf('--water-off') >= 0 && path === 'src/06-water.js') {
      var on = 'var WATER_SYSTEM_ENABLED = true;\n';
      if (source.split(on).length !== 2) throw Error('MUTATION_ANCHOR --water-off');
      return source.replace(on, 'var WATER_SYSTEM_ENABLED = false;\n');
    }
    if (__argv.indexOf('--pre-fade-spell-panel') >= 0 && path === 'src/15-render-hud-menu.js') {
      var reset = '    ctx.fillRect(spellX + 1 * S, spellY + 28 * S, (spellW - 2 * S) * (canAfford ? spellReady : 1), S);\n' +
        '    ctx.globalAlpha = 1;\n  }\n';
      if (source.split(reset).length !== 2) throw Error('MUTATION_ANCHOR --pre-fade-spell-panel');
      return source.replace(reset, reset.replace('    ctx.globalAlpha = 1;\n', ''));
    }
    if (__argv.indexOf('--window-relative-variant') >= 0 && path === 'src/07-decorations-lighting.js') {
      var key = "  if (Number.isFinite(dec.worldX) && Number.isFinite(dec.worldY) && typeof cell === 'number' && cell > 0) {\n";
      if (source.split(key).length !== 2) throw Error('MUTATION_ANCHOR --window-relative-variant');
      return source.replace(key, '  if (false) {\n');
    }
    if (__argv.indexOf('--wall-colour-plus-one') < 0 || path !== 'src/05-endless-world.js') return source;
    var before = '  return (r << 16) | (g << 8) | b;\n}';
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR --wall-colour-plus-one');
    return source.replace(before, '  return (r << 16) | (g << 8) | Math.min(255, b + 1);\n}');
  }
  H.loadManifest(mutate);
  var hasRegistry = typeof G.applyRenderPreset === 'function';
  function legacy() { if (hasRegistry) G.applyRenderPreset('legacy'); }

  // One recorded frame from a fixed presentation state; the same state is
  // restored before each recording, so a repeat must hash identically.
  function recordFrame() {
    H.clock.seed = 0x0badcafe; G._presentationRandomState = 1234567;
    G._lightGridFrameCount = 1;   // this frame is not a 5-frame light-grid refresh
    H.record(true); G.renderFrame();
    return H.record(false);
  }
  function scene(name, seed, setup) {
    legacy();
    var prerequisite = setup();
    G.resetRenderInterpolation();
    G.updateDayNight(0); G.updateLightGrid();
    G.renderFrame(); G.renderFrame();   // warm lazy caches (artwork, minimap)
    var first = recordFrame(), second = recordFrame();
    check(name + ': scene prerequisites hold', prerequisite.ok, prerequisite);
    check(name + ': the Legacy frame records identically twice', first.hash() === second.hash() && first.entries === second.entries,
      [first.hash(), second.hash()]);
    check(name + ': the recording is substantial (walls, fills and text)',
      first.entries > 2000 && (first.counts.fill || 0) > 200 && (first.counts.fillText || 0) > 0,
      {entries: first.entries, counts: first.counts});
    out('SCENE ' + name + ' seed ' + seed + ' hash ' + first.hash() + ' entries ' + first.entries);
  }
  function facing(x, y) {
    var dx = x - G.cam.x, dy = y - G.cam.y, fwd = dx * Math.cos(G.cam.ang) + dy * Math.sin(G.cam.ang);
    var rgt = -dx * Math.sin(G.cam.ang) + dy * Math.cos(G.cam.ang);
    return fwd > 1 && Math.abs(rgt / fwd) < Math.tan(G.cam.fov / 2) && Math.hypot(dx, dy) < G.viewDist;
  }
  function place(x, y, ang) {
    G.pos.x = x; G.pos.y = y; G.vel.x = G.vel.y = 0;
    G.settlePlayerAtSpawn(true);
    G.cam.ang = ang; G.cam.pitch = 0;
  }

  // 1. Cave Test 12345, the entrance approach view (the page's own viewpoint).
  scene('cave-12345-entrance', 12345, function () {
    H.startCaveTest(12345, {caveChests: true});
    G.previewCaveView('approach');
    var e = G.endlessCaveNetworks['0,0'] && G.endlessCaveNetworks['0,0'].entrances[0];
    return {ok: G.WORLD_SEED === 12345 && !!e && G.cavePreviewLastView === 'approach' &&
      facing(e.x - G.windowOriginX, e.y - G.windowOriginY), seed: G.WORLD_SEED};
  });

  // 2. An Endless seed whose spawn window holds a fortress. The harness's own
  // region rule (chunkRng(rX,rY,80) <= 0.012 in the regions around spawn,
  // spawn region excluded) proposes seeds; generation confirms the fortress.
  var fortressSeed = null;
  for (var s = 1; s < 2000 && fortressSeed === null; s++) {
    G.WORLD_SEED = s;
    var near = false;
    for (var ry = -1; ry <= 1; ry++) for (var rx = -1; rx <= 1; rx++) if ((rx || ry) && G.chunkRng(rx, ry, 80)() <= 0.012) near = true;
    if (!near) continue;
    H.startEndless(s);
    if (G.largeStructures.some(function (st) { return st.type === 'fortress'; })) fortressSeed = s;
  }
  scene('endless-fortress-window', fortressSeed, function () {
    if (fortressSeed === null) return {ok: false, reason: 'no fortress seed below 2000'};
    H.startEndless(fortressSeed);
    var st = G.largeStructures.filter(function (x) { return x.type === 'fortress'; })[0];
    var extent = G.CHUNK_SIZE * 1.7 * st.scale, best = null;
    // Nearest open 5x5 cell to 150 u outside the curtain wall, facing the centre.
    for (var gy = 3; gy < G.gridH - 3; gy++) for (var gx = 3; gx < G.gridW - 3; gx++) {
      var x = (gx + 0.5) * G.cell, y = (gy + 0.5) * G.cell;
      var d = Math.max(Math.abs(x - st.x), Math.abs(y - st.y)) - extent;
      if (d < 100 || d > 200) continue;
      var open = true;
      for (var oy = -2; oy <= 2 && open; oy++) for (var ox = -2; ox <= 2; ox++) if (G.grid[(gy + oy) * G.gridW + gx + ox]) { open = false; break; }
      if (!open || G.getTopWalkableLayerIdx(gx, gy) < 0) continue;
      var score = Math.abs(d - 150) + Math.hypot(x - G.pos.x, y - G.pos.y) * 0.01;
      if (!best || score < best.score) best = {x: x, y: y, score: score};
    }
    if (!best) return {ok: false, reason: 'no camera cell outside the fortress'};
    place(best.x, best.y, Math.atan2(st.y - best.y, st.x - best.x));
    var walls = 0;
    for (var i = 0; i < G.grid.length; i++) {
      if (!G.grid[i] || !(G.wallColorR[i] | G.wallColorG[i] | G.wallColorB[i])) continue;
      if (facing((i % G.gridW + 0.5) * G.cell, (Math.floor(i / G.gridW) + 0.5) * G.cell)) walls++;
    }
    return {ok: walls > 40, seed: fortressSeed, fortressWallCellsInView: walls};
  });

  // 3. Seed 2024: the market and its nearest ruin in one view, seen from the
  // side of the line between them, from the nearest open cell to that spot.
  function openCell(x, y) {
    var best = null, gx0 = Math.floor(x / G.cell), gy0 = Math.floor(y / G.cell);
    for (var gy = gy0 - 8; gy <= gy0 + 8; gy++) for (var gx = gx0 - 8; gx <= gx0 + 8; gx++) {
      if (gx < 3 || gy < 3 || gx >= G.gridW - 3 || gy >= G.gridH - 3 || G.getTopWalkableLayerIdx(gx, gy) < 0) continue;
      var open = true;
      for (var oy = -2; oy <= 2 && open; oy++) for (var ox = -2; ox <= 2; ox++) if (G.grid[(gy + oy) * G.gridW + gx + ox]) { open = false; break; }
      var d = Math.hypot(gx - gx0, gy - gy0);
      if (open && (!best || d < best.d)) best = {x: (gx + 0.5) * G.cell, y: (gy + 0.5) * G.cell, d: d};
    }
    return best;
  }
  scene('endless-2024-market-ruin', 2024, function () {
    H.startEndless(2024);
    if (!G.shopMarker || !G.ruins.length || !G.marketStalls.length) return {ok: false, market: !!G.shopMarker, ruins: G.ruins.length};
    var m = G.shopMarker, ruin = G.ruins.slice().sort(function (a, b) {
      return Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y);
    })[0];
    var mx = (m.x + ruin.x) / 2, my = (m.y + ruin.y) / 2, half = Math.hypot(ruin.x - m.x, ruin.y - m.y) / 2;
    var nx = -(ruin.y - m.y) / (2 * half), ny = (ruin.x - m.x) / (2 * half), back = half * 1.25, result = null;
    [1, -1].forEach(function (side) {
      if (result && result.ok) return;
      var cellAt = openCell(mx + nx * back * side, my + ny * back * side);
      if (!cellAt) return;
      place(cellAt.x, cellAt.y, Math.atan2(my - cellAt.y, mx - cellAt.x));
      var stallsInView = G.marketStalls.filter(function (st) { return facing(st.x, st.y); }).length;
      result = {ok: stallsInView >= 2 && facing(ruin.x, ruin.y), side: side, stallsInView: stallsInView,
        ruinDistance: Math.round(Math.hypot(ruin.x - G.cam.x, ruin.y - G.cam.y))};
    });
    return result || {ok: false, reason: 'no open cell beside the market and ruin'};
  });

  check('no console errors while recording', H.errors.length === 0, H.errors.slice(0, 3));
  out('RENDER_PARITY_RESULT ' + (failed ? 'FAIL ' : 'PASS ') + checked + ' failed ' + failed + (hasRegistry ? '' : ' (no render registry in these sources)'));
}());
undefined;
