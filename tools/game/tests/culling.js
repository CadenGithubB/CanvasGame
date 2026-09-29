// Culling, early reject and counters (integration stage K) through the real
// MAIN manifest (render_host.js). Two exact switches: decorAnchorCache (the
// scatter, wall-decoration and ore loops reject by distance and view before
// any terrain query, and cache the terrain they stand on or hang from) and
// modelEarlyReject (a model hidden by nearer scene depth everywhere its
// bounds project builds no faces). Oracles are independent of the code under
// test: the switches' own off path (the legacy loops) recorded call for call,
// record coordinates and entityVisible3D's documented distance/forward
// contract for the within-radius counts, authored occluder quads and chest
// geometry (closed box, a lid opened 100 degrees about its back top edge)
// for the reject, and live terrain queries after an in-place mesh edit.
// Commands and scene depth, not browser pixels or timing.
// Checks print PASS/FAIL and keep going, so a mutation names what it broke.
// Mutations (evaluated copies only; each anchor must match exactly once):
//   --reject-farthest   the early reject tests the bounds' farthest depth
//   --no-hinge-reach    the reject bounds ignore hinges (closed-pose bounds)
//   --no-epoch-bump     noteWorldGeometryEdit() does not move the epoch
//   --no-mesh-key       the anchor cache ignores a new floorMesh object
//   --short-decor-radius  the wall-decoration pre-check keeps 0.6 viewDist
//   --scatter-radius    the scatter pre-check keeps 0.7 viewDist, not 0.75
// --sections a,b runs only: register, parity, counts, reject, invalidate, counters, lab.
(function () {
  (0, eval)(slurp('tools/game/tests/render_host.js'));
  var H = createRenderTestHost(), G = H.G, out = H.output, checked = 0, failed = 0;
  function check(name, ok, detail) {
    checked++; if (!ok) failed++;
    out((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + JSON.stringify(detail === undefined ? null : detail).slice(0, 1500)));
  }
  function flag(name) { return __argv.indexOf(name) >= 0; }
  var sectionArg = __argv.indexOf('--sections') >= 0 ? __argv[__argv.indexOf('--sections') + 1].split(',') : null;
  function section(name) { return !sectionArg || sectionArg.indexOf(name) >= 0; }
  function swap(source, name, before, after) {
    if (!flag(name)) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + name);
    return source.replace(before, after);
  }
  var DECOR = 'src/07-decorations-lighting.js', MODELS = 'src/12-prop-models.js', ENDLESS = 'src/05-endless-world.js';
  var loaded = H.loadManifest(function (path, source) {
    if (path === MODELS) {
      source = swap(source, '--reject-farthest', '    if (depth < near) near = depth;\n', '    if (!(near >= depth)) near = depth;\n');
      source = swap(source, '--reject-farthest', '  var near = Infinity, minX = Infinity,', '  var near = -Infinity, minX = Infinity,');
      return swap(source, '--no-hinge-reach', '    if (part.hinge) {\n      var o = part.hinge.origin, reach = 0;\n',
        '    if (false) {\n      var o = part.hinge.origin, reach = 0;\n');
    }
    if (path === ENDLESS) return swap(source, '--no-epoch-bump', '  worldGeometryEpoch = (worldGeometryEpoch + 1) | 0;\n', '  void 0;\n');
    if (path !== DECOR) return source;
    source = swap(source, '--no-mesh-key', '  if (!_decorAnchors || _decorAnchorMesh !== floorMesh || _decorAnchorEpoch !== epoch) {\n',
      '  if (!_decorAnchors || _decorAnchorEpoch !== epoch) {\n');
    source = swap(source, '--short-decor-radius', '  if (dist < 1 || dist > viewDist * 0.7) return false;\n', '  if (dist < 1 || dist > viewDist * 0.6) return false;\n');
    return swap(source, '--scatter-radius', '  var _fsItems = decorAnchorCacheOn() ? floorScatterInView(_fsMaxDist) : floorScatter;\n',
      '  var _fsItems = decorAnchorCacheOn() ? floorScatterInView(viewDist * 0.7) : floorScatter;\n');
  });
  check('real manifest loads with both stage K switches and no console errors',
    loaded > 40 && typeof G.floorScatterInView === 'function' && typeof G.modelHiddenByDepth === 'function' &&
    typeof G.noteWorldGeometryEdit === 'function' && H.errors.length === 0, {loaded: loaded, errors: H.errors.slice(0, 3)});

  function features(values) { G.setRenderFeatures(values); }

  // ── register ──
  if (section('register')) {
    var defs = {};
    G.RENDER_FEATURE_DEFS.forEach(function (f) { defs[f.key] = f; });
    G.applyRenderPreset('legacy');
    var legacyOff = !G.renderFeatureOn('modelEarlyReject') && !G.renderFeatureOn('decorAnchorCache');
    G.applyRenderPreset('recommended');
    check('register: modelEarlyReject and decorAnchorCache are bool switches, ON in Recommended and OFF in Legacy',
      defs.modelEarlyReject && defs.decorAnchorCache && defs.modelEarlyReject.type === 'bool' && defs.decorAnchorCache.type === 'bool' &&
      defs.modelEarlyReject.default === true && defs.decorAnchorCache.default === true && defs.modelEarlyReject.legacy === false &&
      defs.decorAnchorCache.legacy === false && legacyOff && G.renderFeatureOn('modelEarlyReject') && G.renderFeatureOn('decorAnchorCache'),
      {reject: defs.modelEarlyReject, cache: defs.decorAnchorCache, legacyOff: legacyOff});
  }

  // ── Scenes: four Endless windows; seed 10's camera stands in its fortress courtyard ──
  function place(x, y, ang) {
    G.pos.x = x; G.pos.y = y; G.vel.x = G.vel.y = 0;
    G.settlePlayerAtSpawn(true);
    G.cam.ang = ang; G.cam.pitch = 0;
  }
  function openCellNear(x, y, radius) {
    var best = null, gx0 = Math.floor(x / G.cell), gy0 = Math.floor(y / G.cell);
    for (var gy = gy0 - radius; gy <= gy0 + radius; gy++) for (var gx = gx0 - radius; gx <= gx0 + radius; gx++) {
      if (gx < 3 || gy < 3 || gx >= G.gridW - 3 || gy >= G.gridH - 3 || G.getTopWalkableLayerIdx(gx, gy) < 0) continue;
      var open = true;
      for (var oy = -1; oy <= 1 && open; oy++) for (var ox = -1; ox <= 1; ox++) if (G.grid[(gy + oy) * G.gridW + gx + ox]) { open = false; break; }
      var d = Math.hypot(gx - gx0, gy - gy0);
      if (open && (!best || d < best.d)) best = {x: (gx + 0.5) * G.cell, y: (gy + 0.5) * G.cell, d: d};
    }
    return best;
  }
  var SIDES = {west: [-1, 0], east: [1, 0], north: [0, -1], south: [0, 1]};
  // Ore on real wall faces (Endless windows carry none): every 3rd wall face
  // with an open cell in front of it, within 480 of the camera, at most 48.
  function addOre() {
    var ore = [], n = 0;
    for (var gy = 2; gy < G.gridH - 2 && ore.length < 48; gy++) for (var gx = 2; gx < G.gridW - 2 && ore.length < 48; gx++) {
      if (!G.grid[gy * G.gridW + gx]) continue;
      for (var side in SIDES) {
        var s = SIDES[side];
        if (G.grid[(gy + s[1]) * G.gridW + gx + s[0]]) continue;
        if (Math.hypot((gx + 0.5) * G.cell - G.cam.x, (gy + 0.5) * G.cell - G.cam.y) > 480 || (n++ % 3)) continue;
        ore.push({gx: gx, gy: gy, side: side, hp: 1 + (ore.length % 3), veinType: ore.length % 2 ? 'gold' : 'crystal'});
        if (ore.length >= 48) break;
      }
    }
    G.oreVeins = ore;
    return ore.length;
  }
  function scene(seed, courtyard) {
    H.startEndless(seed);
    var info = {seed: seed};
    if (courtyard) {
      // Between the keep and the curtain wall (render_parity's extent rule):
      // the open cell nearest 0.45 extent south of the fortress centre.
      var st = G.largeStructures.filter(function (x) {
        return x.type === 'fortress' && x.x > 0 && x.y > 0 && x.x < G.gridW * G.cell && x.y < G.gridH * G.cell; })[0];
      var extent = st ? G.CHUNK_SIZE * 1.7 * st.scale : 0, c = st && openCellNear(st.x, st.y + extent * 0.45, 12);
      if (!c || Math.max(Math.abs(c.x - st.x), Math.abs(c.y - st.y)) > extent * 0.8)
        return {ok: false, seed: seed, reason: 'no fortress courtyard cell', fortress: !!st, cell: c};
      place(c.x, c.y, 0);
      info.courtyard = Math.round(Math.hypot(c.x - st.x, c.y - st.y));
    }
    G.resetRenderInterpolation(); G.renderFrame();   // the camera takes the player's place
    info.cam = [Math.round(G.cam.x), Math.round(G.cam.y)];
    info.ore = addOre();
    info.scatter = G.floorScatter.length; info.decor = G.wallDecorations.length; info.chests = G.treasureChests.length;
    info.ok = info.scatter > 500 && info.decor > 100;
    G.resetRenderInterpolation(); G.updateDayNight(0); G.updateLightGrid();
    return info;
  }
  function recordFrame(keep) {
    H.clock.seed = 0x0badcafe; G._presentationRandomState = 1234567; G._lightGridFrameCount = 1;
    var start = {};
    STATE_KEYS.forEach(function (k) { start[k] = G.ctx[k]; });
    H.record(true, keep); G.renderFrame();
    var rec = H.record(false);
    return {hash: rec.hash(), entries: rec.entries, all: rec.all, start: start, depth: depthHash(), stats: G.getRenderFeatureStats().frame};
  }
  function depthHash() {
    var a = G._sceneDepthInv, u = new Uint32Array(a.buffer, a.byteOffset, a.length), h = 0x811c9dc5, n = 0;
    for (var i = 0; i < u.length; i++) { h = Math.imul(h ^ u[i], 0x01000193); if (u[i]) n++; }
    return (h >>> 0).toString(16) + ':' + n;
  }
  // The paint-effective stream: every call except state sets, save/restore
  // and path building, with each paint carrying the state it paints with and
  // the path it fills. Equal streams paint equal pixels whatever state sets
  // were skipped between paints.
  var STATE_KEYS = ['fillStyle', 'strokeStyle', 'globalAlpha', 'lineWidth', 'font', 'textAlign', 'textBaseline',
    'globalCompositeOperation', 'lineCap', 'lineJoin', 'miterLimit', 'shadowBlur', 'shadowColor', 'shadowOffsetX',
    'shadowOffsetY', 'imageSmoothingEnabled', 'filter', 'lineDashOffset'];
  var PATH = {beginPath: 1, moveTo: 1, lineTo: 1, rect: 1, arc: 1, arcTo: 1, ellipse: 1, closePath: 1,
    bezierCurveTo: 1, quadraticCurveTo: 1, roundRect: 1};
  // The state each paint reads (a clip reads only its path).
  var COMMON = ['globalAlpha', 'globalCompositeOperation', 'filter', 'shadowBlur', 'shadowColor', 'shadowOffsetX',
    'shadowOffsetY', 'imageSmoothingEnabled'];
  var STROKE = COMMON.concat(['strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'miterLimit', 'lineDashOffset']);
  var TEXT = ['font', 'textAlign', 'textBaseline'];
  var PAINT = {fill: COMMON.concat(['fillStyle']), fillRect: COMMON.concat(['fillStyle']),
    fillText: COMMON.concat(['fillStyle'], TEXT), stroke: STROKE, strokeRect: STROKE, strokeText: STROKE.concat(TEXT),
    drawImage: COMMON, putImageData: [], clearRect: [], clip: []};
  var USES_PATH = {fill: 1, stroke: 1, clip: 1};
  function effective(r, list) {
    var states = {}, stacks = {}, paths = {}, h = 0x811c9dc5, n = 0;
    function mix(text) {
      if (list) list.push(text);
      for (var i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
      h = Math.imul(h ^ 10, 0x01000193); n++;
    }
    function st(id) {
      if (!states[id]) {
        states[id] = {}; stacks[id] = []; paths[id] = [];
        if (id === 'c0') STATE_KEYS.forEach(function (k) { states[id][k] = JSON.stringify(r.start[k]); });
      }
      return states[id];
    }
    r.all.forEach(function (text) {
      var m = /^([^.]+)\.([A-Za-z_$][\w$]*)([=(])([\s\S]*)$/.exec(text);
      if (!m) { mix(text); return; }
      var id = m[1], key = m[2], s = st(id);
      if (m[3] === '=') { s[key] = m[4]; return; }
      if (key === 'save') { stacks[id].push(Object.assign({}, s)); return; }
      if (key === 'restore') { if (stacks[id].length) states[id] = stacks[id].pop(); return; }
      if (PATH[key]) { if (key === 'beginPath') paths[id] = []; else paths[id].push(key + '(' + m[4]); return; }
      if (PAINT[key]) {
        mix(text + ' | ' + PAINT[key].map(function (k) { return k + '=' + s[k]; }).join(';') + ' | ' + (USES_PATH[key] ? paths[id].join('') : ''));
        return;
      }
      mix(text);
    });
    return (h >>> 0).toString(16) + ':' + n;
  }
  function sumStats(stats, re) {
    var n = 0;
    for (var k in stats) if (re.test(k) && typeof stats[k] === 'number') n += stats[k];
    return n;
  }

  var SEEDS = [[259, true], [7, false], [2024, false], [12345, false]];

  // ── parity: 8 yaws x 4 seeds, both switches off and on ──
  if (section('parity')) {
    var rows = [], okA = true, okB = true, okC = true, okD = true, okRepeat = true, scenesOk = true, rejects = 0, drawnModels = 0;
    var hitsWarm = 0, terrWarm = 0, terrCold = 0, pruned = 0, infos = [], firstDiff = null;
    SEEDS.forEach(function (sd) {
      var info = scene(sd[0], sd[1]);
      infos.push(info);
      if (!info.ok) scenesOk = false;
      for (var k = 0; k < 8; k++) {
        G.applyRenderPreset('recommended');
        G.cam.ang = k * Math.PI / 4; G.cam.pitch = 0; G.resetRenderInterpolation();
        features({decorAnchorCache: false, modelEarlyReject: false});
        G.renderFrame(); G.renderFrame(); G.renderFrame();   // warm lazy caches (artwork) at this yaw
        var A = recordFrame(true), A2 = recordFrame(false);
        features({decorAnchorCache: true, modelEarlyReject: false}); G.DECOR_ANCHOR_STORE = false;
        var B = recordFrame(false);
        G.DECOR_ANCHOR_STORE = true; G.noteWorldGeometryEdit();
        var C1 = recordFrame(false), C2 = recordFrame(false);
        features({decorAnchorCache: true, modelEarlyReject: true});
        var D = recordFrame(true);
        var effA = effective(A), effD = effective(D);
        var row = {seed: sd[0], yaw: k, hash: A.hash, entries: A.entries, B: B.hash === A.hash, C1: C1.hash === A.hash,
          C2: C2.hash === A.hash, D: effD === effA && D.depth === A.depth, depth: A.depth,
          rejected: sumStats(D.stats, /^mdl\w+Rejected$/), dropped: A.entries - D.entries,
          models: sumStats(A.stats, /^mdl\w+Drawn$/)};
        if (A2.hash !== A.hash || A2.depth !== A.depth) okRepeat = false;
        if (B.hash !== A.hash || B.depth !== A.depth) okB = false;
        if (C1.hash !== A.hash || C2.hash !== A.hash || C1.depth !== A.depth || C2.depth !== A.depth) okC = false;
        if (effD !== effA || D.depth !== A.depth) {
          okD = false;
          if (!firstDiff) {
            var la = [], ld = [];
            effective(A, la); effective(D, ld);
            for (var q = 0; q < Math.max(la.length, ld.length) && !firstDiff; q++) {
              if (la[q] !== ld[q]) firstDiff = {seed: sd[0], yaw: k, at: q, off: (la[q] || '').slice(0, 600), on: (ld[q] || '').slice(0, 600),
                prevOff: (la[q - 1] || '').slice(0, 200)};
            }
          }
        }
        rejects += row.rejected; drawnModels += row.models;
        terrCold += (C1.stats.terrDecor || 0) + (C1.stats.terrScatter || 0); terrWarm += (C2.stats.terrDecor || 0) + (C2.stats.terrScatter || 0);
        hitsWarm += (C2.stats.hitDecor || 0) + (C2.stats.hitScatter || 0);
        pruned += G.floorScatter.length - (C2.stats.terrScatter || 0) - (C2.stats.hitScatter || 0);
        rows.push(row);
      }
      G.applyRenderPreset('recommended');
    });
    out('NOTE parity ' + JSON.stringify(rows.map(function (r) {
      return [r.seed, r.yaw, r.hash, r.entries, r.depth, r.rejected, r.dropped, r.models].join(' ');
    })));
    var oreTotal = infos.reduce(function (n, i) { return n + (i.ore || 0); }, 0);
    check('parity: the four scenes hold their fixtures (seed 259 camera in its fortress courtyard, scatter, wall decorations; >= 40 ore faces in all)',
      scenesOk && oreTotal >= 40, infos);
    if (firstDiff) out('NOTE parity first paint difference ' + JSON.stringify(firstDiff));
    check('parity: control, the same configuration records identically twice at every view (commands and depth)', okRepeat, rows.length);
    check('parity: decorAnchorCache on with live terrain (early rejection only) records every command and depth of the off path, 8 yaws x 4 seeds',
      okB && rows.length === 32, rows.filter(function (r) { return !r.B; }).slice(0, 4));
    check('parity: decorAnchorCache on with the cache, cold and warm, records every command and depth of the off path, 8 yaws x 4 seeds',
      okC && rows.length === 32, rows.filter(function (r) { return !r.C1 || !r.C2; }).slice(0, 4));
    check('parity: the warm frame reads its anchors from the cache (terrain queries 0, hits > 0) and the pre-check pruned scatter',
      terrWarm === 0 && hitsWarm > 0 && terrCold > 0 && pruned > 0, {terrWarm: terrWarm, hitsWarm: hitsWarm, terrCold: terrCold, pruned: pruned});
    check('parity: modelEarlyReject on paints the same pixels (every paint call with its state and path) and the same depth, 8 yaws x 4 seeds',
      okD && rows.length === 32, rows.filter(function (r) { return !r.D; }).slice(0, 4));
    check('parity: the early reject engaged (models rejected in some views, only state sets dropped) and models drew elsewhere',
      rejects > 0 && drawnModels > 0 && rows.every(function (r) { return r.dropped >= 0 && (r.rejected > 0 || r.dropped === 0); }),
      {rejects: rejects, drawn: drawnModels});
  }

  // ── counts: terrain queries fall to the within-radius counts ──
  function spyOn(name, log) {
    var real = G[name];
    G[name] = function (x, y) { log.push([name, x, y]); return real.apply(this, arguments); };
    return function () { G[name] = real; };
  }
  function measure(fn) {
    var log = [], undo = [spyOn('getFloorHeightAt', log), spyOn('getCaveSpaceAt', log), spyOn('sampleSpatialSupportZ', log)];
    var realO = G.drawWallPropModelOpaque, realV = G.drawWallPropModelOverlay, realS = G.drawWallAlignedDecoration, drawn = [], loopEnd = -1;
    G.drawWallPropModelOpaque = function (entry) { if (loopEnd < 0) loopEnd = log.length; drawn.push(entry.dec); return realO.apply(this, arguments); };
    G.drawWallPropModelOverlay = function (entry) { if (loopEnd < 0) loopEnd = log.length; drawn.push(entry.dec); return realV.apply(this, arguments); };
    G.drawWallAlignedDecoration = function () { if (loopEnd < 0) loopEnd = log.length; drawn.push(arguments[8]); return realS.apply(this, arguments); };
    try { fn(); } finally {
      undo.forEach(function (u) { u(); });
      G.drawWallPropModelOpaque = realO; G.drawWallPropModelOverlay = realV; G.drawWallAlignedDecoration = realS;
    }
    return {log: log, loop: loopEnd < 0 ? log : log.slice(0, loopEnd), drawn: drawn};
  }
  function count(log, name) { return log.filter(function (e) { return e[0] === name; }).length; }
  // The view facing the nearest wall decoration the camera sees the front of.
  function faceNearestDecoration(minDist) {
    var best = null;
    G.wallDecorations.forEach(function (d) {
      var s = SIDES[d.side], dist = Math.hypot(d.worldX - G.cam.x, d.worldY - G.cam.y);
      if (!s || dist < minDist || (G.cam.x - d.worldX) * s[0] + (G.cam.y - d.worldY) * s[1] < 20 || !G.getWallDecorationAttachment(d)) return;
      if (!best || dist < best.dist) best = {d: d, dist: dist};
    });
    if (best) G.cam.ang = Math.atan2(best.d.worldY - G.cam.y, best.d.worldX - G.cam.x);
    G.cam.pitch = 0;
    return best && best.d;
  }
  if (section('counts')) {
    var info = scene(7, false);
    G.applyRenderPreset('recommended'); faceNearestDecoration(30); G.resetRenderInterpolation();
    G.renderFrame();
    var C = G.getCam3D(), vd = G.viewDist;
    function decPoint(d) { var s = SIDES[d.side]; return {x: d.worldX + s[0] * 0.5, y: d.worldY + s[1] * 0.5}; }
    function solid(gx, gy) { return gx >= 0 && gy >= 0 && gx < G.gridW && gy < G.gridH && G.grid[gy * G.gridW + gx]; }
    function key(x, y) { return x + ',' + y; }
    function fwdOf(x, y) { return (x - G.cam.x) * C.cosAng + (y - G.cam.y) * C.sinAng; }
    function run(cache, store, fn) {
      features({decorAnchorCache: cache}); G.DECOR_ANCHOR_STORE = store; G.noteWorldGeometryEdit();
      G.beginSceneDepthFrame(C.w, C.h); G.beginRenderFrameStats();
      return measure(fn);
    }
    // Wall decorations: two getFloorHeightAt queries per record the loop attaches.
    var S = G.wallDecorations.filter(function (d) { return solid(d.gridX, d.gridY) && SIDES[d.side]; });
    var R = S.filter(function (d) { var p = decPoint(d), dist = Math.hypot(p.x - G.cam.x, p.y - G.cam.y); return dist >= 1 && dist <= vd * 0.7; });
    var legacy = run(false, true, function () { G.drawWallDecorations(); });
    var early = run(true, false, function () { G.drawWallDecorations(); });
    var cold = run(true, true, function () { G.drawWallDecorations(); });
    G.beginSceneDepthFrame(C.w, C.h);
    var warm = measure(function () { G.drawWallDecorations(); });
    var Rkeys = {}, Q = {};
    R.forEach(function (d) { var p = decPoint(d); Rkeys[key(p.x, p.y)] = true; });
    early.loop.forEach(function (e) { if (e[0] === 'getCaveSpaceAt') Q[key(e[1], e[2])] = true; });
    var qKeys = Object.keys(Q), legacyDrawn = legacy.drawn.filter(function (d) { return d; });
    var missing = legacyDrawn.filter(function (d) { var p = decPoint(d); return !Q[key(p.x, p.y)]; });
    out('NOTE counts decor ' + JSON.stringify({records: G.wallDecorations.length, solid: S.length, withinRadius: R.length,
      queried: qKeys.length, legacyLoopFloor: count(legacy.loop, 'getFloorHeightAt'), earlyLoopFloor: count(early.loop, 'getFloorHeightAt'),
      coldLoopFloor: count(cold.loop, 'getFloorHeightAt'), warmLoopFloor: count(warm.loop, 'getFloorHeightAt'), drawn: legacyDrawn.length}));
    check('counts: wall decorations, the off loop queries getFloorHeightAt twice for every record on a solid cell',
      S.length > 100 && count(legacy.loop, 'getFloorHeightAt') === 2 * S.length, {solid: S.length, calls: count(legacy.loop, 'getFloorHeightAt')});
    check('counts: wall decorations, with the switch on the loop queries only records within 0.7 viewDist (two getFloorHeightAt each), fewer than off, and every record the off path drew',
      count(early.loop, 'getFloorHeightAt') === 2 * qKeys.length && qKeys.every(function (k) { return Rkeys[k]; }) &&
      qKeys.length < S.length && qKeys.length <= R.length && legacyDrawn.length > 0 && missing.length === 0,
      {queried: qKeys.length, withinRadius: R.length, solid: S.length, missing: missing.length});
    check('counts: wall decorations, the cached loop queries the same records cold and none warm',
      count(cold.loop, 'getFloorHeightAt') === count(early.loop, 'getFloorHeightAt') && count(warm.loop, 'getFloorHeightAt') === 0 &&
      count(warm.loop, 'getCaveSpaceAt') === 0, {cold: count(cold.loop, 'getFloorHeightAt'), warm: count(warm.loop, 'getFloorHeightAt')});

    // Floor scatter: one support query per item; with the switch, exactly the
    // items entityVisible3D keeps by distance (clamped at 1, <= 0.75 viewDist)
    // and forward (>= 1). Restated in Stage I2: floorPropModels (default ON
    // since I2) takes the modelled types out of this sprite loop, so the
    // sprite-loop contract is measured with it off; floor_prop_models.js
    // (cache) checks the model loop's own range/view-first queries.
    var scatterModels = G.renderFeatureSnapshot().floorPropModels;
    features({floorPropModels: false});
    var near = G.floorScatter.filter(function (it) {
      var dist = Math.max(1, Math.hypot(it.x - G.cam.x, it.y - G.cam.y));
      return dist <= vd * 0.75 && fwdOf(it.x, it.y) >= 1;
    });
    var sLegacy = run(false, true, function () { G.drawFloorScatter3D(); });
    var sEarly = run(true, false, function () { G.drawFloorScatter3D(); });
    var sCold = run(true, true, function () { G.drawFloorScatter3D(); });
    G.beginSceneDepthFrame(C.w, C.h);
    var sWarm = measure(function () { G.drawFloorScatter3D(); });
    var sRows = {items: G.floorScatter.length, near: near.length, legacy: count(sLegacy.log, 'sampleSpatialSupportZ'),
      early: count(sEarly.log, 'sampleSpatialSupportZ'), cold: count(sCold.log, 'sampleSpatialSupportZ'), warm: count(sWarm.log, 'sampleSpatialSupportZ'),
      floorLegacy: count(sLegacy.log, 'getFloorHeightAt'), floorEarly: count(sEarly.log, 'getFloorHeightAt'), floorWarm: count(sWarm.log, 'getFloorHeightAt')};
    out('NOTE counts scatter ' + JSON.stringify(sRows));
    check('counts: floor scatter, off queries support for every item; on, exactly the items within 0.75 viewDist and in front; cached, the same cold and none warm',
      sRows.legacy === sRows.items && sRows.early === sRows.near && sRows.near > 0 && sRows.near < sRows.items &&
      sRows.cold === sRows.near && sRows.warm === 0, sRows);
    check('counts: floor scatter, entityVisible3D\'s own getFloorHeightAt calls (already within radius) are unchanged',
      sRows.floorLegacy === sRows.floorEarly && sRows.floorEarly === sRows.floorWarm && sRows.floorLegacy > 0, sRows);
    features({floorPropModels: scatterModels});

    // Ore: one getCaveSpaceAt per attached face; with the switch, the faces
    // whose attachment point is within 280 (clamped at 1) and in front.
    var oreNear = G.oreVeins.filter(function (o) {
      var s = SIDES[o.side], x = (o.gx + (o.side === 'west' ? 0 : o.side === 'east' ? 1 : 0.5)) * G.cell + s[0] * 0.5;
      var y = (o.gy + (o.side === 'north' ? 0 : o.side === 'south' ? 1 : 0.5)) * G.cell + s[1] * 0.5;
      return Math.max(1, Math.hypot(x - G.cam.x, y - G.cam.y)) <= 280 && fwdOf(x, y) >= 1;
    });
    var oLegacy = run(false, true, function () { G.drawOreVeins(); });
    var oEarly = run(true, false, function () { G.drawOreVeins(); });
    var oCold = run(true, true, function () { G.drawOreVeins(); });
    G.beginSceneDepthFrame(C.w, C.h);
    var oWarm = measure(function () { G.drawOreVeins(); });
    var oRows = {ore: G.oreVeins.length, near: oreNear.length, legacy: count(oLegacy.log, 'getCaveSpaceAt'), early: count(oEarly.log, 'getCaveSpaceAt'),
      cold: count(oCold.log, 'getCaveSpaceAt'), warm: count(oWarm.log, 'getCaveSpaceAt')};
    out('NOTE counts ore ' + JSON.stringify(oRows));
    check('counts: ore, off queries every face; on, exactly the faces within 280 and in front; cached, the same cold and none warm',
      oRows.legacy === oRows.ore && oRows.early === oRows.near && oRows.near > 0 && oRows.near < oRows.ore && oRows.cold === oRows.near && oRows.warm === 0, oRows);
    G.applyRenderPreset('recommended'); G.DECOR_ANCHOR_STORE = true;
  }

  // ── reject: authored chest behind authored occluders ──
  if (section('reject')) {
    function flatWorld() {
      G.cell = 12; G.gridW = G.gridH = 64; G.grid = new Uint8Array(64 * 64);
      G.floorMesh = null; G.gridCave = null; G.deepCaveRegions = []; G.deepCaveEntrances = [];
    }
    flatWorld();
    G.applyRenderPreset('recommended');
    var model = G.chestModelFor('common');
    function camera(camZ) {
      G.cam.x = 1060; G.cam.y = 1000; G.cam.ang = Math.PI; G.cam.pitch = 0;
      var Cc = G.getCam3D(); Cc.cameraZ = camZ; return Cc;
    }
    // An occluder: the plane x = X facing the camera, y in [900, 1100], z in [-200, top].
    function occluder(Cc, X, top) {
      var poly = G.projectSceneWorldPolygon([{x: X, y: 900, z: -200}, {x: X, y: 1100, z: -200}, {x: X, y: 1100, z: top}, {x: X, y: 900, z: top}], Cc);
      G.writeSceneDepthPolygon(poly);
    }
    function draw(lid, camZ, occ, reject) {
      features({modelEarlyReject: reject, modelBackfaceCull: true});
      var Cc = camera(camZ);
      G.beginSceneDepthFrame(Cc.w, Cc.h);
      if (occ) occluder(Cc, occ[0], occ[1]);
      var builds = 0, realBuild = G.buildModelFaces, stats = {}, anchors;
      G.buildModelFaces = function () { builds++; return realBuild.apply(this, arguments); };
      var inst = G.chestModelInstance({x: 1000, y: 1000, facing: 0, lidAngle: lid}, 0, {});
      H.record(true, true);
      try { anchors = G.drawWorldModel(inst, model, Cc, 'opaque', stats); } finally { G.buildModelFaces = realBuild; }
      var rec = H.record(false);
      var copy = {};
      for (var k in anchors || {}) copy[k] = [anchors[k].x, anchors[k].y, anchors[k].z].join(',');
      return {builds: builds, stats: stats, hash: rec.hash(), fills: rec.counts.fill || 0, depth: depthHash(), anchors: JSON.stringify(copy)};
    }
    var hidOff = draw(0, 12, [1020, 60], false), hidOn = draw(0, 12, [1020, 60], true);
    check('reject: control, the closed chest behind a nearer wall is truly hidden on the full path (faces built and depth-tested, none drawn)',
      hidOff.builds === 1 && hidOff.stats.faces > 0 && hidOff.stats.drawn === 0 && hidOff.fills === 0, hidOff);
    check('reject: the hidden chest builds zero faces with modelEarlyReject on, paints nothing, leaves depth unchanged and returns the same anchors',
      hidOn.builds === 0 && hidOn.stats.rejected === 1 && !hidOn.stats.faces && hidOn.fills === 0 && hidOn.depth === hidOff.depth &&
      hidOn.anchors === hidOff.anchors && hidOn.anchors.length > 5, {on: hidOn, off: hidOff});
    var visOff = draw(0, 12, null, false), visOn = draw(0, 12, null, true);
    check('reject: a visible chest is not rejected and records the same commands and depth with the switch on and off',
      visOn.builds === 1 && !visOn.stats.rejected && visOn.stats.drawn > 0 && visOn.hash === visOff.hash && visOn.depth === visOff.depth, {on: visOn, off: visOff});
    // A wall through the chest's centre plane: its front half is in front.
    var partOff = draw(0, 30, [1000, 200], false), partOn = draw(0, 30, [1000, 200], true);
    check('reject: a chest cut by a wall through its centre (front half in front) is not rejected and records identically',
      partOff.stats.drawn > 0 && partOn.builds === 1 && !partOn.stats.rejected && partOn.hash === partOff.hash && partOn.depth === partOff.depth,
      {on: partOn, off: partOff});
    // The lid opened 100 degrees rises to about 18 behind a wall 13 high; the
    // closed box (height 11) is below the wall's top from an eye at 12.
    var lidOff = draw(1, 12, [1020, 13], false), lidOn = draw(1, 12, [1020, 13], true), lidClosed = draw(0, 12, [1020, 13], false);
    check('reject: an open lid showing over a low wall (closed chest fully hidden there) is not rejected and records identically',
      lidClosed.stats.drawn === 0 && lidOff.stats.drawn > 0 && lidOn.builds === 1 && !lidOn.stats.rejected && lidOn.hash === lidOff.hash &&
      lidOn.depth === lidOff.depth, {on: lidOn, off: lidOff, closed: lidClosed});
    G.applyRenderPreset('recommended');
  }

  // ── invalidate: an in-place mesh edit refreshes the cached anchors ──
  if (section('invalidate')) {
    scene(7, false);
    G.applyRenderPreset('recommended');
    features({decorAnchorCache: true}); G.DECOR_ANCHOR_STORE = true;
    var MODEL_TYPES = {torch: 1, sconce: 1, shield: 1, banner: 1};
    var pick = null;
    G.wallDecorations.forEach(function (d) {
      if (pick || !MODEL_TYPES[G.canonicalWallDecorationType(d.type)]) return;
      var a = G.getWallDecorationAttachment(d), s = SIDES[d.side];
      if (!a || (G.cam.x - d.worldX) * s[0] + (G.cam.y - d.worldY) * s[1] < 20) return;
      var dist = Math.hypot(a.x - G.cam.x, a.y - G.cam.y);
      if (dist > 40 && dist < 200 && G.meshCellAt(a.x, a.y) >= 0) pick = d;
    });
    function aim() {
      var a = G.getWallDecorationAttachment(pick);
      G.cam.ang = Math.atan2(a.y - G.cam.y, a.x - G.cam.x); G.cam.pitch = 0;
    }
    function drawnAttachment() {
      var got = null, real = G.drawWallPropModelOpaque, Cc = G.getCam3D();
      G.drawWallPropModelOpaque = function (entry) { if (entry.dec === pick) got = entry.attachment.z + '/' + entry.attachment.size; return real.apply(this, arguments); };
      try { G.beginSceneDepthFrame(Cc.w, Cc.h); G.drawWallDecorations('opaque'); } finally { G.drawWallPropModelOpaque = real; }
      return got;
    }
    function live() { var a = G.getWallDecorationAttachment(pick); return a ? a.z + '/' + a.size : null; }
    function editCell(x, y, dh) {
      var m = G.floorMesh, i = G.meshCellAt(x, y);
      for (var li = 0; li < m.layerCount[i]; li++) {
        var t = m['l' + li + 'Type'][i];
        if (t === 1 || t === 3 || t === 4) m['l' + li + 'TopZ'][i] += dh;
      }
      G._floorCacheTick = (G._floorCacheTick + 1) | 0;   // the per-frame height cache, as the audit lab does
    }
    var ok = !!pick, rows = {};
    if (ok) {
      aim();
      var at = G.getWallDecorationAttachment(pick);
      rows.before = drawnAttachment(); rows.liveBefore = live();
      editCell(at.x, at.y, 1.0);
      rows.liveEdited = live(); rows.stale = drawnAttachment();
      G.noteWorldGeometryEdit(); rows.refreshed = drawnAttachment();
      editCell(at.x, at.y, -1.0); G.noteWorldGeometryEdit(); rows.restored = drawnAttachment();
      // An edit followed by a new floorMesh object (no epoch call) refreshes too.
      editCell(at.x, at.y, 1.0); rows.stale2 = drawnAttachment();
      var copy = {}; for (var k in G.floorMesh) copy[k] = G.floorMesh[k];
      G.floorMesh = copy; rows.newMesh = drawnAttachment(); rows.liveNewMesh = live();
      editCell(at.x, at.y, -1.0); G.noteWorldGeometryEdit();
      // Scatter: the support of an item in view.
      G.cam.ang = 0; var Cs = G.getCam3D();
      var item = G.floorScatter.filter(function (it) {
        var dx = it.x - G.cam.x, dy = it.y - G.cam.y;
        return dx * Cs.cosAng + dy * Cs.sinAng > 20 && Math.hypot(dx, dy) < 300 && G.meshCellAt(it.x, it.y) >= 0;
      })[0];
      function supportOf() {
        var list = G.floorScatterInView(G.viewDist * 0.75);
        for (var i = 0; i < list.length; i++) if (list[i]._scatterItem === item) return list[i].renderFloorZ;
        return null;
      }
      rows.sBefore = supportOf(); editCell(item.x, item.y, 1.0);
      rows.sLive = G.getEntityRenderFloorZ(item); rows.sStale = supportOf();
      G.noteWorldGeometryEdit(); rows.sRefreshed = supportOf();
      editCell(item.x, item.y, -1.0); G.noteWorldGeometryEdit();
    }
    out('NOTE invalidate ' + JSON.stringify(rows));
    check('invalidate: fixture, a modelled wall prop in view whose attachment moves when the floor in front of it is raised in place',
      ok && rows.before === rows.liveBefore && rows.before !== null && rows.liveEdited !== rows.liveBefore, rows);
    check('invalidate: control, without noteWorldGeometryEdit() the drawn prop keeps its cached anchor (the cache is really used)',
      ok && rows.stale === rows.before, rows);
    check('invalidate: after noteWorldGeometryEdit() the drawn prop uses the edited terrain, and the restored terrain after the undo',
      ok && rows.refreshed === rows.liveEdited && rows.restored === rows.liveBefore, rows);
    check('invalidate: a new floorMesh object refreshes the anchors without an epoch call',
      ok && rows.stale2 === rows.before && rows.newMesh === rows.liveNewMesh && rows.newMesh === rows.liveEdited, rows);
    check('invalidate: a scatter item\'s cached support refreshes after noteWorldGeometryEdit() (stale before it)',
      ok && Number.isFinite(rows.sBefore) && rows.sLive !== rows.sBefore && rows.sStale === rows.sBefore && rows.sRefreshed === rows.sLive, rows);
  }

  // ── counters: per-family depth-clip counters in the callers ──
  if (section('counters')) {
    scene(7, false);
    G.applyRenderPreset('recommended');
    var fams = {clipScatter: 'drawFloorScatter3D', clipDecor: 'drawWallDecorations', clipOre: 'drawOreVeins',
      clipChest: 'drawTreasureChests3D', clipSpawner: 'drawEnemySpawners3D'};
    var got = {}, rowsC = {}, okC = true;
    // Face the nearest chest so the chest family draws too.
    var ch = G.treasureChests.filter(function (c) { return !c.collected; }).sort(function (a, b) {
      return Math.hypot(a.x - G.cam.x, a.y - G.cam.y) - Math.hypot(b.x - G.cam.x, b.y - G.cam.y); })[0];
    if (ch) G.cam.ang = Math.atan2(ch.y - G.cam.y, ch.x - G.cam.x);
    G.resetRenderInterpolation(); G.renderFrame();
    Object.keys(fams).forEach(function (stat) {
      var name = fams[stat], real = G[name], realClip = G.withSceneDepthClip, calls = 0, inFam = 0;
      G.withSceneDepthClip = function (points) {
        if (inFam && points && points.length >= 3 && points.every(function (p) {
          return p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.depth) && p.depth > 0;
        })) calls++;
        return realClip.apply(this, arguments);
      };
      G[name] = function () { inFam++; try { return real.apply(this, arguments); } finally { inFam--; } };
      try { G.beginRenderFrameStats(); H.clock.seed = 0x0badcafe; G.renderFrame(); } finally { G[name] = real; G.withSceneDepthClip = realClip; }
      var stats = G.getRenderFeatureStats().frame;
      rowsC[stat] = {counter: stats[stat], clips: calls};
      if (stats[stat] !== calls) okC = false;
    });
    out('NOTE counters ' + JSON.stringify(rowsC));
    check('counters: each family\'s clip counter equals the valid withSceneDepthClip calls made inside its draw (scatter, decor, ore, chest, spawner)',
      okC && rowsC.clipScatter.clips > 0 && rowsC.clipDecor.clips > 0 && rowsC.clipChest.clips + rowsC.clipSpawner.clips > 0, rowsC);
  }

  // ── lab: the render-lab module the browser A/B/B/A uses ──
  if (section('lab')) {
    (0, eval)(slurp('tools/game/render-lab/00-core.js'));
    (0, eval)(slurp('tools/game/render-lab/70-culling.js'));
    G.applyRenderPreset('recommended');
    var msg = G.RenderLabCulling.courtyard(259), st = G.largeStructures.filter(function (s) {
      return s.type === 'fortress' && s.x > 0 && s.y > 0 && s.x < G.gridW * G.cell && s.y < G.gridH * G.cell; })[0];
    var snap = JSON.stringify(G.renderFeatureSnapshot()), wrappers = {now: Date.now, random: Math.random};
    var r = G.RenderLabCulling.counts('smoke'), cfg = G.RenderLabCulling.CONFIGS;
    out('NOTE lab ' + r.text.replace(/\n/g, ' | '));
    var inside = st && Math.max(Math.abs(G.pos.x - st.x), Math.abs(G.pos.y - st.y)) < G.CHUNK_SIZE * 1.7 * st.scale * 0.8;
    check('lab: courtyard() stands the camera inside seed 259\'s fortress; counts() reports per-family clip counters in both configurations, anchor-cache terrain/hits only with the switch on, then restores the switches and clocks; A = both off, B = both on',
      // Restated in Stage I2: with floorPropModels on (default since I2) the
      // scatter's clip count also holds the models' depth tests, which
      // modelEarlyReject (B only) lowers by the faces it never builds; the
      // sprite path's own equality is the parity section's.
      /^Fortress courtyard/.test(msg) && inside && r.off.clipScatter > 0 &&
      (r.on.clipScatter === r.off.clipScatter || (r.on.clipScatter < r.off.clipScatter && r.on.mdlFloorPropRejected > 0)) &&
      !Object.keys(r.off).some(function (k) { return /^(terr|hit)|Rejected$/.test(k); }) &&
      (r.on.terrScatter || 0) + (r.on.hitScatter || 0) > 0 && JSON.stringify(G.renderFeatureSnapshot()) === snap &&
      Date.now === wrappers.now && Math.random === wrappers.random &&
      cfg.off.preset === 'recommended' && cfg.off.features.modelEarlyReject === false && cfg.off.features.decorAnchorCache === false &&
      cfg.on.features.modelEarlyReject === true && cfg.on.features.decorAnchorCache === true, {msg: msg, inside: inside, off: r.off, on: r.on});
  }

  check('no console errors', H.errors.length === 0, H.errors.slice(0, 3));
  out('CULLING_RESULT ' + (failed ? 'FAIL ' : 'PASS ') + checked + ' failed ' + failed);
}());
undefined;
