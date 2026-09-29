// Structure render models, builder (integration stage D1, src/12-structure-models.js).
// Real MAIN manifest through render_host.js; six fixed seeds (424242, 777000,
// 31337, 12345, 2024, 555), each giving a fortress, an arena and a watchtower
// (the nearest of each type, found with the stage B finder and loaded with
// assembleWindow). Oracles are independent of the builder:
// - ownership recomputed from the window chunks' .structure regions and the
//   window colour arrays;
// - every face walls3D submits (drawWalls3D recorded from four views above
//   the structure, projectSceneWorldPolygon inputs; a face is a cave face when
//   walls3D asks getCaveRenderLightAt for it);
// - StructureModel.meshGrid on StructureProduction.stamp grids (the dev.py
//   import of the production stamp) for study parity, and StructureModel.build
//   for the shell and its UVs;
// - world arrays, spatial wall spans, collision and ray queries and the RNG
//   counter for presentation-only; one recorded frame for "no drawing change".
// The cave/structure overlap fixture is authored on a real fortress window:
// the generator never lets a cave reach a structure footprint (see the
// 'generator' section note), so one cell each gets gridCave, a roof tag
// (wallCapZ), a roof clamp (wallMaxTopZ) and a cave ceiling at a corner.
// Mutations (evaluated copies of the fragment; exact-once anchors):
//   --ignore-natural-neighbours  only owned neighbours occlude
//   --drop-owned-mask            mesh every solid cell in the box
//   --window-relative-uv         UVs and span buckets on window coordinates
//   --drop-risers                no face above a lower solid neighbour
//   --include-cave-cells         cave-touched cells are owned too
//   --colour-only                own every coloured cell in the scan range (huts too)
//   --no-endless-build           build outside Endless (stale classic state)
//   --no-endless-current         models stay current after leaving Endless
//   --stale-always-current       no staleness detection (grid, origin, ...)
//   --merge-ignores-colour       runs merge across different colours
//   --swap-we-base               the W side takes the E face base
//   --no-maxtop-clamp            solid tops ignore wallMaxTopZ
//   --no-cave-neighbour          gridCave 4-neighbours are owned
// The coverage section adds a seventh window, seed 7919's watchtower, whose
// ownership scan range holds a real ruin hut (coloured cells in a chunk of
// no structure); SETUP_FAILURE when no coverage window has such cells.
// Narrowing: --sections a,b  --seeds a,b  --production <StructureProduction js>.
(function () {
  var realNow = Date.now.bind(Date);
  (0, eval)(slurp('tools/game/tests/render_host.js'));
  var H = createRenderTestHost(), G = H.G, out = H.output, checked = 0, failed = 0;
  function check(name, ok, detail) {
    checked++; if (!ok) failed++;
    out((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + JSON.stringify(detail === undefined ? null : detail)));
  }
  function flag(name) { return __argv.indexOf(name) >= 0; }
  function option(name) { var i = __argv.indexOf(name); return i >= 0 ? __argv[i + 1] : null; }
  var sectionArg = option('--sections') ? option('--sections').split(',') : null;
  function section(name) { return !sectionArg || sectionArg.indexOf(name) >= 0; }
  function swap(source, name, before, after) {
    if (!flag(name)) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + name);
    return source.replace(before, after);
  }
  var MODELS = 'src/12-structure-models.js';
  var fragmentSource = slurp('assets/games/' + MODELS);
  var loaded = H.loadManifest(function (path, source) {
    if (path !== MODELS) return source;
    source = swap(source, '--ignore-natural-neighbours', '    return solid[j] ? topZ[j] : NaN;\n', '    return owned[j] ? topZ[j] : NaN;\n');
    source = swap(source, '--drop-owned-mask', '    if (!owned[i]) continue;\n', '    if (!solid[i]) continue;\n');
    source = swap(source, '--window-relative-uv',
      '    var uvX = st.centerWX - windowOriginX, uvY = st.centerWY - windowOriginY, faces = [], mesh = null;\n',
      '    var uvX = 0, uvY = 0, faces = [], mesh = null;\n');
    source = swap(source, '--drop-risers', "    else edge('riser', dir, plane, start, t, z1, color);\n", '');
    source = swap(source, '--include-cave-cells', '      if (structureModelCaveCell(gx, gy)) { counts.excluded++; continue; }\n', '');
    source = swap(source, '--colour-only',
      '    if (!ch || !ch.structure || ch.structure.regionX !== st.regionX || ch.structure.regionY !== st.regionY) continue;\n',
      '    if (!ch) continue;\n');
    source = swap(source, '--no-endless-build', '  if (!grid || !_structureModelsEndless() || (!force && !structureModelsEnabled())) {',
      '  if (!grid || (!force && !structureModelsEnabled())) {');
    source = swap(source, '--no-endless-current', '  return !!f && _structureModelsEndless() && f.grid === grid', '  return !!f && f.grid === grid');
    source = swap(source, '--stale-always-current',
      '  return !!f && _structureModelsEndless() && f.grid === grid && grid !== null && f.wallFaceBase === wallFaceBase && f.floorMesh === floorMesh &&\n' +
      '    f.structures === largeStructures && f.originX === windowOriginX && f.originY === windowOriginY;\n',
      '  return !!f && _structureModelsEndless();\n');
    source = swap(source, '--merge-ignores-colour', "    var key = kind + '|' + dir + '|' + plane + '|' + z0 + '|' + z1 + '|' + color;\n",
      "    var key = kind + '|' + dir + '|' + plane + '|' + z0 + '|' + z1;\n");
    source = swap(source, '--swap-we-base', "    side('W', x - 1, y, wx, wy, faceBase[i * 4], z1, color);\n",
      "    side('W', x - 1, y, wx, wy, faceBase[i * 4 + 1], z1, color);\n");
    source = swap(source, '--no-maxtop-clamp', '    if (wmax < Infinity && topH > wmax) topH = wmax;\n', '');
    source = swap(source, '--no-cave-neighbour',
      '  if (gridCave && ((gx > 0 && gridCave[i - 1]) || (gx < gridW - 1 && gridCave[i + 1]) ||\n' +
      '      (gy > 0 && gridCave[i - gridW]) || (gy < gridH - 1 && gridCave[i + gridW]))) return true;\n', '');
    return source;
  });
  check('real manifest loads with the structure model builder and no console errors',
    loaded > 40 && typeof G.buildStructureModels === 'function' && H.errors.length === 0, {loaded: loaded, errors: H.errors.slice(0, 3)});
  // Stage D2 flipped the default ON. The builder sections below were written
  // with the switch OFF and turn it on where they test it, so they start OFF.
  G.setRenderFeatures({structureModels: false});

  var CELL = G.cell, SPAN = G.STRUCTURE_MODEL_SPAN, REP = G.STRUCTURE_MODEL_UV_REPEAT;
  var SEEDS = option('--seeds') ? option('--seeds').split(',').map(Number) : [424242, 777000, 31337, 12345, 2024, 555];
  var TYPES = ['fortress', 'arena', 'watchtower'];
  function packed(i) { return (G.wallColorR[i] << 16) | (G.wallColorG[i] << 8) | G.wallColorB[i]; }
  function limited(list) { return list.length > 6 ? list.slice(0, 6).concat(['... ' + list.length + ' total']) : list; }

  // ── Quads: walls3D and the builder share vertex conventions ──
  // Side [a@z0, b@z0, b@z1, a@z1]: W runs -y, E +y, N +x, S -x. Top: flat.
  function parseQuad(v) {
    if (!v || v.length !== 4) return null;
    if (v[0].z === v[1].z && v[1].z === v[2].z && v[2].z === v[3].z) {
      var xs = v.map(function (p) { return p.x; }), ys = v.map(function (p) { return p.y; });
      return {type: 'top', x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs),
        y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys), z: v[0].z};
    }
    if (v[0].z !== v[1].z || v[2].z !== v[3].z) return null;
    if (v[0].x !== v[3].x || v[0].y !== v[3].y || v[1].x !== v[2].x || v[1].y !== v[2].y) return null;
    var a = v[0], b = v[1], z0 = v[0].z, z1 = v[3].z;
    if (a.x === b.x) return a.y > b.y ? {type: 'side', dir: 'W', plane: a.x, begin: b.y, end: a.y, z0: z0, z1: z1} :
      {type: 'side', dir: 'E', plane: a.x, begin: a.y, end: b.y, z0: z0, z1: z1};
    if (a.y === b.y) return a.x < b.x ? {type: 'side', dir: 'N', plane: a.y, begin: a.x, end: b.x, z0: z0, z1: z1} :
      {type: 'side', dir: 'S', plane: a.y, begin: b.x, end: a.x, z0: z0, z1: z1};
    return null;
  }
  // Owning cell of a side step (s = start of one cell along the run) and the neighbour across.
  function sideCell(q, s) {
    var gx, gy, nx, ny;
    if (q.dir === 'W') { gx = q.plane / CELL; gy = s / CELL; nx = gx - 1; ny = gy; }
    else if (q.dir === 'E') { gx = q.plane / CELL - 1; gy = s / CELL; nx = gx + 1; ny = gy; }
    else if (q.dir === 'N') { gy = q.plane / CELL; gx = s / CELL; nx = gx; ny = gy - 1; }
    else { gy = q.plane / CELL - 1; gx = s / CELL; nx = gx; ny = gy + 1; }
    return {gx: gx, gy: gy, nx: nx, ny: ny, i: gy * G.gridW + gx,
      n: (nx >= 0 && ny >= 0 && nx < G.gridW && ny < G.gridH) ? ny * G.gridW + nx : -1};
  }

  // ── walls3D recording: every face it submits from four views above (cx, cy) ──
  function recordLegacy(cx, cy) {
    var recs = [], last = null, realProject = G.projectSceneWorldPolygon, realLight = G.getCaveRenderLightAt;
    if (typeof realLight !== 'function') throw Error('SETUP getCaveRenderLightAt is not a function');
    var saved = {x: G.cam.x, y: G.cam.y, z: G.cam.z, ang: G.cam.ang, pitch: G.cam.pitch, vd: G.viewDist};
    G.projectSceneWorldPolygon = function (v, C) {
      last = {v: v.map(function (p) { return {x: p.x, y: p.y, z: p.z}; }), cave: false};
      recs.push(last);
      return realProject(v, C);
    };
    G.getCaveRenderLightAt = function () { if (last) last.cave = true; return realLight.apply(null, arguments); };
    try {
      G.viewDist = 1600; G.cam.x = cx; G.cam.y = cy; G.cam.z = 4000; G.cam.pitch = 0;
      for (var k = 0; k < 4; k++) {
        G.cam.ang = k * Math.PI / 2;
        var C = G.getCam3D(); G.beginSceneDepthFrame(C.w, C.h); G.drawWalls3D();
      }
    } finally {
      G.projectSceneWorldPolygon = realProject; G.getCaveRenderLightAt = realLight;
      G.cam.x = saved.x; G.cam.y = saved.y; G.cam.z = saved.z; G.cam.ang = saved.ang; G.cam.pitch = saved.pitch; G.viewDist = saved.vd;
    }
    var byKey = {}, faces = [], other = 0;
    recs.forEach(function (r) {
      var key = r.v.map(function (p) { return p.x + ',' + p.y + ',' + p.z; }).join(';');
      if (byKey[key]) { byKey[key].cave = byKey[key].cave || r.cave; return; }
      var q = parseQuad(r.v);
      if (!q) { other++; return; }
      q.cave = r.cave; q.key = key; byKey[key] = q; faces.push(q);
    });
    return {faces: faces, other: other};
  }

  // ── Independent ownership: .structure region chunks x colour, minus cave tags ──
  function oracleOwned(st, caveCells) {
    var set = new Uint8Array(G.gridW * G.gridH), count = 0;
    for (var dy = 0; dy < G.WINDOW_CHUNKS; dy++) for (var dx = 0; dx < G.WINDOW_CHUNKS; dx++) {
      var ch = G.chunks[(G.windowCX + dx) + ',' + (G.windowCY + dy)];
      if (!ch || !ch.structure || ch.structure.regionX !== st.regionX || ch.structure.regionY !== st.regionY) continue;
      for (var y = 0; y < G.CHUNK_CELLS; y++) for (var x = 0; x < G.CHUNK_CELLS; x++) {
        var i = (dy * G.CHUNK_CELLS + y) * G.gridW + dx * G.CHUNK_CELLS + x;
        if (!G.grid[i] || !G.wallColorR[i]) continue;
        if (G.gridCave[i] || G.wallCapZ[i] > -Infinity || G.wallMaxTopZ[i] < Infinity || (caveCells && caveCells[i])) continue;
        set[i] = 1; count++;
      }
    }
    return {set: set, count: count};
  }
  function modelOf(st) { return G.structureModels.filter(function (m) { return m.structure === st; })[0]; }

  // Cell tops walls3D used (side z1 or top z), cave cells and the face lists per cell.
  function legacyIndex(rec) {
    var top = {}, cave = new Uint8Array(G.gridW * G.gridH), conflicts = 0;
    function note(i, z) { if (top[i] === undefined) top[i] = z; else if (top[i] !== z) conflicts++; }
    rec.faces.forEach(function (q) {
      if (q.type === 'top') { var tc = (q.y0 / CELL) * G.gridW + q.x0 / CELL; if (!q.cave) note(tc, q.z); return; }
      for (var s = q.begin; s < q.end; s += CELL) {
        var c = sideCell(q, s);
        if (q.cave) cave[c.i] = 1; else note(c.i, q.z1);
      }
    });
    return {top: top, cave: cave, conflicts: conflicts};
  }
  function sideIndex(faces) {
    var idx = {};
    faces.forEach(function (f) {
      var q = parseQuad(f.vertices);
      if (!q) return;
      q.face = f;
      var key = q.type === 'top' ? 'top|' + q.z : q.dir + '|' + q.plane;
      (idx[key] || (idx[key] = [])).push(q);
    });
    return idx;
  }
  function containing(idx, q) {
    if (q.type === 'top') return (idx['top|' + q.z] || []).filter(function (m) {
      return m.x0 <= q.x0 && m.x1 >= q.x1 && m.y0 <= q.y0 && m.y1 >= q.y1;
    });
    return (idx[q.dir + '|' + q.plane] || []).filter(function (m) {
      return m.z0 === q.z0 && m.z1 === q.z1 && m.begin <= q.begin && m.end >= q.end;
    });
  }
  function overlapping(idx, q) {
    if (q.type === 'top') {
      var hits = [];
      Object.keys(idx).forEach(function (k) {
        if (k.indexOf('top|') !== 0) return;
        idx[k].forEach(function (m) { if (m.z === q.z && m.x0 < q.x1 && m.x1 > q.x0 && m.y0 < q.y1 && m.y1 > q.y0) hits.push(m); });
      });
      return hits;
    }
    return (idx[q.dir + '|' + q.plane] || []).filter(function (m) {
      return m.begin < q.end && m.end > q.begin && Math.min(m.z1, q.z1) > Math.max(m.z0, q.z0);
    });
  }

  // ── Fixtures ──
  var fixtures = [], setupFailures = [];
  function loadFixture(fx) {
    var t0 = realNow();
    G.assembleWindow(fx.target.centerCX, fx.target.centerCY);
    fx.assembleMs = realNow() - t0;
    fx.st = G.largeStructures.filter(function (s) { return s.regionX === fx.target.regionX && s.regionY === fx.target.regionY; })[0];
    return fx.st;
  }
  if (section('coverage') || section('cave') || section('rebase') || section('presentation')) {
    SEEDS.forEach(function (seed) {
      H.startEndless(seed);
      TYPES.forEach(function (type) {
        var target = G.findNearestLandmarkRegion(0, 0, {type: type});
        if (!target) { setupFailures.push(seed + ':' + type); return; }
        fixtures.push({seed: seed, type: type, target: target});
      });
    });
    if (setupFailures.length) out('SETUP_FAILURE missing structures ' + setupFailures.join(','));
    check('prerequisites: every seed yields a fortress, an arena and a watchtower',
      !setupFailures.length && fixtures.length === SEEDS.length * 3, setupFailures);
  }
  // Loads the fixture's window (a fresh world when the seed differs).
  function reload(fx) {
    if (G.WORLD_SEED !== fx.seed || !G.grid) H.startEndless(fx.seed);
    if (!loadFixture(fx)) { out('SETUP_FAILURE the window at ' + fx.seed + ':' + fx.type + ' has no structure'); throw Error('SETUP_FAILURE'); }
  }

  // Coloured solid cells inside st's ownership scan range (+-ceil(1.8 scale)
  // chunks of its centre chunk) in chunks of no or another structure: the
  // cells that make colour alone insufficient (ruin huts author colour).
  function foreignColouredInScan(st) {
    var R = Math.ceil(1.8 * (st.scale || 1)), ccx = Math.floor(st.centerWX / G.CHUNK_SIZE), ccy = Math.floor(st.centerWY / G.CHUNK_SIZE), n = 0;
    for (var cy = ccy - R; cy <= ccy + R; cy++) for (var cx = ccx - R; cx <= ccx + R; cx++) {
      var dx = cx - G.windowCX, dy = cy - G.windowCY, ch = G.chunks[cx + ',' + cy];
      if (dx < 0 || dy < 0 || dx >= G.WINDOW_CHUNKS || dy >= G.WINDOW_CHUNKS || !ch) continue;
      if (ch.structure && ch.structure.regionX === st.regionX && ch.structure.regionY === st.regionY) continue;
      for (var y = 0; y < G.CHUNK_CELLS; y++) for (var x = 0; x < G.CHUNK_CELLS; x++) {
        var i = (dy * G.CHUNK_CELLS + y) * G.gridW + dx * G.CHUNK_CELLS + x;
        if (G.grid[i] && G.wallColorR[i]) n++;
      }
    }
    return n;
  }

  // ── Coverage, ownership, shell, UVs and build time on every fixture ──
  if (section('coverage')) {
    var fail = {own: [], cover: [], walls: [], risers: [], tops: [], natural: [], span: [], uv: [], tint: [], shell: [], shellTint: [], time: [], conflicts: []};
    var totals = {legacy: 0, legacyOwned: 0, walls: 0, risers: 0, naturalRisers: 0, tops: 0, shell: 0, huts: 0, scanHuts: 0, fallbackTops: 0, maxBuildMs: 0, maxRatio: 0, timingRetries: 0, other: 0};
    var mainRole = {fortress: 'w', arena: 'w', watchtower: 't'}, trimRole = {fortress: 'k', arena: 'p', watchtower: 'a'};
    // Seed 7919's watchtower has a ruin hut inside its scan range (always added, whatever --seeds says).
    var coverageFixtures = fixtures.slice(), HUT_SEED = 7919;
    H.startEndless(HUT_SEED);
    var hutTarget = G.findNearestLandmarkRegion(0, 0, {type: 'watchtower'});
    if (hutTarget) coverageFixtures.unshift({seed: HUT_SEED, type: 'watchtower', target: hutTarget, hut: true});
    else out('SETUP_FAILURE seed ' + HUT_SEED + ' has no watchtower for the hut fixture');
    coverageFixtures.forEach(function (fx) {
      reload(fx);
      // Time the first build after the window assembly (the hitch assembleWindow adds while the flag is on).
      // Load tolerance: a ratio over a quarter is measured again on a fresh world and a fresh first
      // assembly, up to three attempts, and the lowest ratio counts.
      var t0 = realNow();
      G.buildStructureModels({force: true});
      var buildMs = realNow() - t0, assembleMs = fx.assembleMs, tag = fx.seed + ':' + fx.type;
      for (var attempt = 1; buildMs > assembleMs * 0.25 && attempt < 3; attempt++) {
        totals.timingRetries++;
        H.startEndless(fx.seed); reload(fx);
        var t1 = realNow();
        G.buildStructureModels({force: true});
        var again = realNow() - t1;
        if (again / fx.assembleMs < buildMs / assembleMs) { buildMs = again; assembleMs = fx.assembleMs; }
      }
      var st = fx.st, model = modelOf(st);
      totals.maxBuildMs = Math.max(totals.maxBuildMs, buildMs);
      totals.maxRatio = Math.max(totals.maxRatio, buildMs / assembleMs);
      if (!(buildMs <= assembleMs * 0.25)) fail.time.push(tag + ' ' + buildMs + 'ms vs assemble ' + assembleMs);
      if (!model) { fail.own.push(tag + ' no model'); return; }
      var scanHuts = foreignColouredInScan(st);
      totals.scanHuts += scanHuts;
      if (fx.hut && !scanHuts) fail.own.push(tag + ' hut fixture: no coloured non-structure cell in the scan range');
      var rec = recordLegacy(st.x, st.y), li = legacyIndex(rec);
      totals.other += rec.other;
      if (li.conflicts) fail.conflicts.push(tag + ' ' + li.conflicts);
      var oracle = oracleOwned(st, li.cave), owner = G.structureModelOwner, value = model.index + 1;
      // Ownership equals the oracle exactly; coloured cells elsewhere (huts, other structures) stay out.
      var ownDiff = [];
      for (var i = 0; i < owner.length; i++) {
        var mine = owner[i] === value;
        if (mine !== !!oracle.set[i]) ownDiff.push(i);
        if (!owner[i] && G.grid[i] && G.wallColorR[i]) totals.huts++;
      }
      if (ownDiff.length || oracle.count !== model.ownedCells) fail.own.push(tag + ' diff ' + ownDiff.length + ' oracle ' + oracle.count + ' model ' + model.ownedCells);
      var grids = model.faces.filter(function (f) { return f.kind !== 'shell'; }), idx = sideIndex(grids);
      var topCount = new Uint8Array(owner.length);
      // Every walls3D face of an owned cell lies in exactly one coplanar model face.
      rec.faces.forEach(function (q) {
        var c = q.type === 'top' ? (q.y0 / CELL) * G.gridW + q.x0 / CELL : sideCell(q, q.begin).i;
        totals.legacy++;
        if (!oracle.set[c]) return;
        totals.legacyOwned++;
        var hits = containing(idx, q);
        if (hits.length !== 1) fail.cover.push(tag + ' ' + q.key + ' hits ' + hits.length);
      });
      var legacyIdx = sideIndex(rec.faces.filter(function (q) { return !q.cave; }).map(function (q) {
        return {vertices: q.key.split(';').map(function (s) { var p = s.split(',').map(Number); return {x: p[0], y: p[1], z: p[2]}; })};
      }));
      grids.forEach(function (f) {
        var q = parseQuad(f.vertices);
        if (!q) { fail.natural.push(tag + ' unparsed ' + f.kind); return; }
        var local = f.vertices.map(function (p) { return {x: p.x - model.uvX, y: p.y - model.uvY, z: p.z}; });
        if (q.type === 'top') {
          totals.tops++;
          if (f.kind !== 'top') fail.tops.push(tag + ' flat ' + f.kind);
          if (q.x1 - q.x0 > SPAN || q.y1 - q.y0 > SPAN || Math.floor((q.x0 - model.uvX) / SPAN) !== Math.floor((q.x1 - model.uvX - 1e-9) / SPAN) ||
              Math.floor((q.y0 - model.uvY) / SPAN) !== Math.floor((q.y1 - model.uvY - 1e-9) / SPAN)) fail.span.push(tag + ' top');
          for (var ty = q.y0; ty < q.y1; ty += CELL) for (var tx = q.x0; tx < q.x1; tx += CELL) {
            var tc = (ty / CELL) * G.gridW + tx / CELL;
            topCount[tc]++;
            if (!oracle.set[tc]) { fail.natural.push(tag + ' top on cell ' + tc); continue; }
            var want = li.top[tc];
            if (want === undefined) {
              totals.fallbackTops++;
              want = (G.getFloorHeightAt((tx + CELL / 2), (ty + CELL / 2)) + G.CANVAS_BASE_H / 25 * G.wallHeights[tc]) * 25;
            }
            if (want !== q.z) fail.tops.push(tag + ' cell ' + tc + ' z ' + q.z + ' want ' + want);
            if (packed(tc) !== f.tint) fail.tint.push(tag + ' top ' + tc);
          }
          local.forEach(function (p, k) { if (f.vertices[k].u !== p.x / REP || f.vertices[k].v !== p.y / REP) fail.uv.push(tag + ' top'); });
        } else {
          if (q.end - q.begin > SPAN) fail.span.push(tag + ' ' + q.dir + ' length ' + (q.end - q.begin));
          var origin = (q.dir === 'W' || q.dir === 'E') ? model.uvY : model.uvX;
          if (Math.floor((q.begin - origin) / SPAN) !== Math.floor((q.end - origin - 1e-9) / SPAN)) fail.span.push(tag + ' crosses a span line');
          for (var s = q.begin; s < q.end; s += CELL) {
            var c = sideCell(q, s);
            if (!oracle.set[c.i]) fail.natural.push(tag + ' side on cell ' + c.i);
            if (packed(c.i) !== f.tint) fail.tint.push(tag + ' side ' + c.i);
            var nSolid = c.n >= 0 && G.grid[c.n];
            if (f.kind === 'riser') {
              var nTop = li.top[c.n];
              if (nTop === undefined && nSolid) nTop = (G.getFloorHeightAt((c.nx + 0.5) * CELL, (c.ny + 0.5) * CELL) + G.CANVAS_BASE_H / 25 * G.wallHeights[c.n]) * 25;
              if (!nSolid || nTop !== q.z0 || !(q.z1 > q.z0) || (li.top[c.i] !== undefined && li.top[c.i] !== q.z1)) fail.risers.push(tag + ' ' + q.dir + ' ' + c.i);
            } else if (nSolid) fail.walls.push(tag + ' wall against a solid neighbour ' + c.i);
          }
          if (f.kind === 'riser') {
            totals.risers++;
            var anyNatural = false;
            for (var s2 = q.begin; s2 < q.end; s2 += CELL) { var c2 = sideCell(q, s2); if (c2.n >= 0 && !oracle.set[c2.n]) anyNatural = true; }
            if (anyNatural) totals.naturalRisers++;
          } else {
            totals.walls++;
            // A model wall is exactly the merge of walls3D faces: same plane and z, lengths summing to its own.
            var parts = (legacyIdx[q.dir + '|' + q.plane] || []).filter(function (m) {
              return m.z0 === q.z0 && m.z1 === q.z1 && m.begin >= q.begin && m.end <= q.end;
            });
            var covered = parts.reduce(function (sum, m) { return sum + (m.end - m.begin); }, 0);
            if (covered !== q.end - q.begin) fail.walls.push(tag + ' ' + q.dir + ' ' + q.plane + ' ' + q.begin + '-' + q.end + ' covered ' + covered);
          }
          var alongY = q.dir === 'W' || q.dir === 'E';
          local.forEach(function (p, k) {
            if (f.vertices[k].u !== (alongY ? p.y : p.x) / REP || f.vertices[k].v !== -p.z / REP) fail.uv.push(tag + ' ' + q.dir);
          });
        }
        if (f.material !== 'stone') fail.tint.push(tag + ' body material ' + f.material);
      });
      for (var oc = 0; oc < owner.length; oc++) if (oracle.set[oc] && topCount[oc] !== 1) fail.tops.push(tag + ' cell ' + oc + ' under ' + topCount[oc] + ' tops');
      // Shell: the production shell at the real position, captured through the sink.
      var shellFaces = model.faces.filter(function (f) { return f.kind === 'shell'; }), captured = [];
      G.captureRuinDecorFaces(function () { G.drawStructureShellWorld(st, {floorZ: G.getEntityRenderFloorZ(st)}, null); },
        function (vertices, color) { captured.push({vertices: vertices, color: color}); return 0; });
      totals.shell += shellFaces.length;
      if (captured.length !== shellFaces.length || !captured.length) fail.shell.push(tag + ' count ' + shellFaces.length + ' vs ' + captured.length);
      var woodHex = Object.keys(G.GAME_MATERIALS.floorPropWood.hex).map(function (k) { return G.GAME_MATERIALS.floorPropWood.hex[k]; });
      var mainRamp = G.structureColorRamp(st, mainRole[st.type]), trimRamp = G.structureColorRamp(st, trimRole[st.type]);
      function inRamp(r, c) { return Object.keys(r).some(function (k) { return r[k] === c; }); }
      function pack(rgb) { return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]; }
      captured.forEach(function (c, k) {
        var f = shellFaces[k];
        if (!f || f.vertices.length !== c.vertices.length || f.vertices.some(function (p, j) {
          return Math.abs(p.x - c.vertices[j].x) > 1e-9 || Math.abs(p.y - c.vertices[j].y) > 1e-9 || p.z !== c.vertices[j].z;
        })) { fail.shell.push(tag + ' face ' + k); return; }
        var m = inRamp(mainRamp, c.color), t = inRamp(trimRamp, c.color), want;
        if (woodHex.indexOf(c.color) >= 0) want = {material: 'wood', tint: G.GAME_MATERIALS.floorPropWood.packed.base};
        else if (m && !t) want = {material: 'stone', tint: pack(G.structurePaletteRole(st, mainRole[st.type]))};
        else if (t && !m) want = {material: 'stone', tint: pack(G.structurePaletteRole(st, trimRole[st.type]))};
        else if (!m && !t && /^#[0-9a-f]{6}$/i.test(c.color)) want = {material: 'cloth', tint: parseInt(c.color.slice(1), 16)};
        if (want && (f.material !== want.material || f.tint !== want.tint)) fail.shellTint.push(tag + ' face ' + k + ' ' + c.color);
      });
    });
    if (!totals.scanHuts) out('SETUP_FAILURE no coverage window has a coloured non-structure cell inside an ownership scan range');
    out('NOTE coverage ' + coverageFixtures.length + ' structures: walls3D faces ' + totals.legacy + ' (owned cells ' + totals.legacyOwned +
      '), model walls ' + totals.walls + ', risers ' + totals.risers + ' (' + totals.naturalRisers + ' above natural cells), tops ' + totals.tops +
      ' (' + totals.fallbackTops + ' interior cells walls3D never tops), shell ' + totals.shell + ', unowned coloured cells ' + totals.huts +
      ', coloured non-structure cells in scan ranges ' + totals.scanHuts +
      ', unparsed walls3D polygons ' + totals.other + ', max first build ' + totals.maxBuildMs + 'ms (max ' +
      Math.round(totals.maxRatio * 100) + '% of its assembleWindow; ' + totals.timingRetries + ' timing retries)');
    check('ownership: exactly grid && wallColorR in window chunks whose .structure is the region (no hut or other colour, no cave cell)',
      !fail.own.length && totals.scanHuts > 0, {fail: limited(fail.own), scanHuts: totals.scanHuts});
    check('coverage: every walls3D face of an owned cell lies in exactly one coplanar model face (same plane and z range)',
      !fail.cover.length && totals.legacyOwned > 1000, {fail: limited(fail.cover), owned: totals.legacyOwned});
    check('model walls are exactly merged walls3D faces; the only extra faces are risers and tops', !fail.walls.length && totals.walls > 0,
      limited(fail.walls));
    check('risers sit above a lower solid neighbour, from its walls3D top to the cell top (natural neighbours occlude with their own tops)',
      !fail.risers.length && totals.risers > 0 && totals.naturalRisers > 0, {fail: limited(fail.risers), natural: totals.naturalRisers});
    check('tops partition the owned cells (one top over each) at the walls3D top z', !fail.tops.length && totals.tops > 0, limited(fail.tops));
    check('natural cells emit no model face', !fail.natural.length, limited(fail.natural));
    check('merged runs stop at 48 units, on structure-local multiples of 48', !fail.span.length, limited(fail.span));
    check('body UVs are structure-local at 32 units per repeat (tops x,y; x-planes y,-z; y-planes x,-z)', !fail.uv.length, limited(fail.uv));
    check('body faces are stone tinted with their cell colour', !fail.tint.length, limited(fail.tint));
    check('shell faces are the production shell (drawStructureShellWorld through the sink) at the render floor', !fail.shell.length, limited(fail.shell));
    check('shell materials and tints: wood poles, solid cloth accents, stone tinted by its palette role', !fail.shellTint.length, limited(fail.shellTint));
    check('walls3D reports one top per cell (recording is consistent)', !fail.conflicts.length, fail.conflicts);
    check('build time: the first build after each window assembly adds at most a quarter to that assembleWindow hitch (real clock, best of up to 3 fresh assemblies)', !fail.time.length, fail.time);
  }

  // ── Authored cave/structure overlap: every walls3D face has exactly one path ──
  if (section('cave') && fixtures.length) {
    var fx = fixtures.filter(function (f) { return f.type === 'fortress'; })[0];
    reload(fx);
    G.buildStructureModels({force: true});
    var st = fx.st, before = modelOf(st), value0 = before.index + 1, ownedBefore = new Uint8Array(G.structureModelOwner);
    // Outer curtain cells with an open outward face, far apart.
    var picks = [];
    for (var gy = 1; gy < G.gridH - 1 && picks.length < 4; gy++) for (var gx = 1; gx < G.gridW - 1 && picks.length < 4; gx++) {
      var i = gy * G.gridW + gx;
      if (ownedBefore[i] !== value0 || G.grid[i - 1] || !G.grid[i + 1]) continue;
      if (Math.hypot((gx + 0.5) * CELL - st.x, (gy + 0.5) * CELL - st.y) < 700) continue;
      if (picks.some(function (p) { return Math.abs(p.gx - gx) + Math.abs(p.gy - gy) < 12; })) continue;
      picks.push({gx: gx, gy: gy, i: i});
    }
    if (picks.length < 4) out('SETUP_FAILURE cave fixture found ' + picks.length + ' curtain cells');
    var A = picks[0], B = picks[1], Cc = picks[2], D = picks[3];
    var topMesh = function (p) { return G.getFloorHeightAt((p.gx + 0.5) * CELL, (p.gy + 0.5) * CELL) + G.CANVAS_BASE_H / 25 * G.wallHeights[p.i]; };
    G.gridCave[A.i] = 1;                                   // a cave wall (corridor edge)
    G.wallCapZ[B.i] = topMesh(B) + 2;                      // roofed by a walkable layer
    G.wallMaxTopZ[Cc.i] = topMesh(Cc) - 3;                 // clamped under a roof
    var fm = G.floorMesh, mx = Math.floor(D.gx * CELL / fm.gridSize), my = Math.floor(D.gy * CELL / fm.gridSize);
    var mi = my * fm.w + mx, lc = fm.layerCount[mi];
    fm['l' + lc + 'Type'][mi] = 2; fm['l' + lc + 'TopZ'][mi] = topMesh(D) + 4; fm.layerCount[mi] = lc + 1;   // a ceiling at the corner of D's open west face
    G.buildStructureModels({force: true});
    var model = modelOf(st), owner = G.structureModelOwner, value = model.index + 1;
    var rec = recordLegacy(st.x, st.y), li = legacyIndex(rec), idx = sideIndex(model.faces.filter(function (f) { return f.kind !== 'shell'; }));
    var caveFaces = rec.faces.filter(function (q) { return q.cave; }).length;
    if (!caveFaces) out('SETUP_FAILURE the authored cave cells produced no walls3D cave face');
    // The gridCave cell's 4-neighbours (walls3D can treat their faces as cave faces) stay with walls3D too.
    var caveNeighbours = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(function (d) {
      return {gx: A.gx + d[0], gy: A.gy + d[1], i: (A.gy + d[1]) * G.gridW + A.gx + d[0]};
    }).filter(function (p) { return ownedBefore[p.i] === value0; });
    if (!caveNeighbours.length) out('SETUP_FAILURE the gridCave cell has no owned 4-neighbour');
    var tagged = [A, B, Cc, D].concat(caveNeighbours).filter(function (p) { return owner[p.i] === value; });
    check('positive control: the authored cells were owned before the cave tags', [A, B, Cc, D].every(function (p) { return ownedBefore[p.i] === value0; }));
    var caveOwned = [], lost = [], gained = [];
    for (var k = 0; k < owner.length; k++) {
      if (owner[k] === value && li.cave[k]) caveOwned.push(k);
      if (owner[k] === value && ownedBefore[k] !== value0) gained.push(k);
      if (owner[k] !== value && ownedBefore[k] === value0) {
        var kx = k % G.gridW, ky = (k - kx) / G.gridW;
        var local = [A, B, Cc, D].some(function (p) { return Math.abs(p.gx - kx) <= 1 && Math.abs(p.gy - ky) <= 1; });
        if (!local) lost.push(k);
      }
    }
    check('cave-touched cells stay with walls3D: gridCave and its 4-neighbours, wallCapZ, wallMaxTopZ, a corner ceiling and every walls3D cave face',
      !tagged.length && !caveOwned.length && caveFaces > 0 && caveNeighbours.length > 0,
      {tagged: tagged, caveOwned: limited(caveOwned), caveFaces: caveFaces, neighbours: caveNeighbours.length});
    // Risers start at the neighbour's walls3D top; the roof-clamped cell Cc (wallMaxTopZ) occludes only up to its clamp.
    var clampTop = G.wallMaxTopZ[Cc.i] * 25, riserFail = [], clampSides = [];
    function cellTop(k) {
      if (li.top[k] !== undefined) return li.top[k];
      var kx = k % G.gridW, ky = (k - kx) / G.gridW;
      return (G.getFloorHeightAt((kx + 0.5) * CELL, (ky + 0.5) * CELL) + G.CANVAS_BASE_H / 25 * G.wallHeights[k]) * 25;
    }
    if (li.top[Cc.i] !== undefined && li.top[Cc.i] !== clampTop) riserFail.push('walls3D tops the clamped cell at ' + li.top[Cc.i] + ', not ' + clampTop);
    [['W', 1, 0], ['E', -1, 0], ['N', 0, 1], ['S', 0, -1]].forEach(function (d) {
      // The owned neighbour at (Cc + d) faces Cc with its d[0] side.
      var nx = Cc.gx + d[1], ny = Cc.gy + d[2], n = ny * G.gridW + nx, top = cellTop(n);
      if (owner[n] !== value || !(top > clampTop)) return;
      var q = d[0] === 'W' ? {dir: 'W', plane: nx * CELL, begin: ny * CELL} : d[0] === 'E' ? {dir: 'E', plane: (nx + 1) * CELL, begin: ny * CELL} :
        d[0] === 'N' ? {dir: 'N', plane: ny * CELL, begin: nx * CELL} : {dir: 'S', plane: (ny + 1) * CELL, begin: nx * CELL};
      q.type = 'side'; q.end = q.begin + CELL; q.z0 = clampTop; q.z1 = top;
      var hits = containing(idx, q).filter(function (m) { return m.face.kind === 'riser'; });
      clampSides.push(n);
      if (hits.length !== 1) riserFail.push('clamp neighbour ' + n + ' ' + d[0] + ' risers ' + hits.length + ' from ' + clampTop + ' to ' + top);
    });
    if (!clampSides.length) out('SETUP_FAILURE no owned neighbour of the roof-clamped cell rises above its clamp');
    model.faces.forEach(function (f) {
      if (f.kind !== 'riser') return;
      var q = parseQuad(f.vertices);
      for (var s = q.begin; s < q.end; s += CELL) {
        var c = sideCell(q, s);
        if (c.n >= 0 && c.n !== Cc.i && li.top[c.n] !== undefined && li.top[c.n] !== q.z0) riserFail.push(c.n + ' ' + q.dir + ' from ' + q.z0 + ' want ' + li.top[c.n]);
      }
    });
    check('cave fixture: risers start at the neighbour walls3D top, and at the clamp above a roof-clamped (wallMaxTopZ) neighbour',
      !riserFail.length && clampSides.length > 0, {fail: limited(riserFail), clampSides: clampSides.length});
    check('the cave exclusion is local (only cells within one of an authored cell change hands)', !lost.length && !gained.length,
      {lost: limited(lost), gained: limited(gained)});
    var paths = [];
    rec.faces.forEach(function (q) {
      var c = q.type === 'top' ? (q.y0 / CELL) * G.gridW + q.x0 / CELL : sideCell(q, q.begin).i;
      var ownedCell = owner[c] === value, n = ownedCell ? containing(idx, q).length : overlapping(idx, q).length;
      if ((ownedCell ? n !== 1 : n !== 0) || (q.cave && ownedCell)) paths.push(q.key + (q.cave ? ' cave' : '') + ' owned ' + ownedCell + ' model ' + n);
    });
    check('overlap fixture: every walls3D face is drawn by exactly one path (model for owned cells, walls3D otherwise; cave faces by walls3D)',
      !paths.length && rec.faces.length > 1000, {fail: limited(paths), faces: rec.faces.length});
    out('NOTE cave fixture ' + fx.seed + ':' + fx.type + ' walls3D cave faces ' + caveFaces + ', excluded ' + model.excludedCells);
  }

  // ── Rebase: another window origin gives identical absolute faces and UVs ──
  if (section('rebase') && fixtures.length) {
    var rx = fixtures.filter(function (f) { return f.type === 'fortress' && Math.ceil(1.8 * f.target.scale) === 2; })[0] || fixtures[0];
    function canon() {
      G.buildStructureModels({force: true});
      var m = modelOf(rx.st), ox = G.windowOriginX, oy = G.windowOriginY;
      return {owned: m.ownedCells, faces: m.faces.map(function (f) {
        return f.kind + '|' + f.material + '|' + f.tint + '|' + f.vertices.map(function (p) {
          return [Math.round((p.x + ox) * 1e6), Math.round((p.y + oy) * 1e6), p.z, p.u, p.v].join(',');
        }).join(';');
      }).sort()};
    }
    reload(rx);
    var a = canon(), shifts = [[1, -1], [-1, 0]], diffs = [];
    shifts.forEach(function (d) {
      G.assembleWindow(rx.target.centerCX + d[0], rx.target.centerCY + d[1]);
      rx.st = G.largeStructures.filter(function (s) { return s.regionX === rx.target.regionX && s.regionY === rx.target.regionY; })[0];
      var b = canon(), missing = a.faces.filter(function (f) { return b.faces.indexOf(f) < 0; });
      if (a.owned !== b.owned || a.faces.length !== b.faces.length || missing.length) diffs.push({shift: d, owned: [a.owned, b.owned], faces: [a.faces.length, b.faces.length], missing: limited(missing)});
    });
    check('rebase: window origins shifted by a chunk give identical absolute faces and UVs', !diffs.length && a.faces.length > 100, diffs);
  }

  // ── Presentation only ──
  if (section('presentation') && fixtures.length) {
    var px = fixtures[0];
    function hashArray(arr) {
      if (!arr) return 'null';
      var h = 0x811c9dc5;
      for (var i = 0; i < arr.length; i++) { var v = arr[i]; h = Math.imul(h ^ (v === Infinity ? 1e9 : v === -Infinity ? -1e9 : Math.round(v * 4096)), 0x01000193); }
      return (h >>> 0).toString(16) + ':' + arr.length;
    }
    function snapshot() {
      var st = px.st, s = {};
      ['grid', 'wallHeights', 'wallColorR', 'wallColorG', 'wallColorB', 'wallFaceBase', 'wallCapZ', 'wallMaxTopZ', 'gridCave'].forEach(function (k) { s[k] = hashArray(G[k]); });
      s.mesh = hashArray(G.floorMesh.l0TopZ) + hashArray(G.floorMesh.layerCount);
      var spans = [], hits = [], rays = [], floors = [], x0 = Math.max(0, Math.floor((st.x - 1100) / CELL)), x1 = Math.min(G.gridW - 1, Math.floor((st.x + 1100) / CELL));
      var y0 = Math.max(0, Math.floor((st.y - 1100) / CELL)), y1 = Math.min(G.gridH - 1, Math.floor((st.y + 1100) / CELL));
      for (var gy = y0; gy <= y1; gy++) for (var gx = x0; gx <= x1; gx++) {
        var sp = G.spatialWallSpan(gx, gy); spans.push(sp ? sp.baseZ + '/' + sp.topZ : '-');
      }
      for (var y = st.y - 1100; y <= st.y + 1100; y += 37) for (var x = st.x - 1100; x <= st.x + 1100; x += 37) {
        hits.push(G.isInGridWall(x, y, 6) ? 1 : 0, G.isInGridWall(x, y, 6, G.pos.floorZ) ? 1 : 0);
        floors.push(G.getFloorHeightAt(x, y));
      }
      for (var r = 0; r < 24; r++) {
        var ang = r * Math.PI / 12, fz = G.getFloorHeightAt(st.x, st.y) * 25 + 40;
        var ray = G.spatialRaycast({x: st.x + Math.cos(ang) * 1200, y: st.y + Math.sin(ang) * 1200, z: fz}, {x: st.x - Math.cos(ang) * 200, y: st.y - Math.sin(ang) * 200, z: fz});
        rays.push(ray.status + ':' + (Math.round(ray.t * 1e9) / 1e9) + ':' + ray.kind);
      }
      s.spans = hashArray(spans.map(function (t) { var h = 0; for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return h; }));
      s.hits = hashArray(hits); s.floors = hashArray(floors); s.rays = rays.join('|');
      return JSON.stringify(s);
    }
    reload(px);
    var off = snapshot(), rngBefore = H.clock.randomCalls;
    var clearedWhileOff = G.structureModels.length === 0 && G.structureModelOwner === null;
    G.setRenderFeatures({structureModels: true});   // lazy build for the loaded window
    var lazy = G.structureModelsCurrent() && G.structureModels.length > 0, rngDraws = H.clock.randomCalls - rngBefore;
    var afterLazy = snapshot();
    G.assembleWindow(px.target.centerCX, px.target.centerCY);
    px.st = G.largeStructures.filter(function (s) { return s.regionX === px.target.regionX && s.regionY === px.target.regionY; })[0];
    var builtInAssembly = G.structureModelsCurrent() && G.structureModels.length > 0, onAssembled = snapshot();
    check('built only while enabled: none while off, lazily on the switch, and at window assembly while on',
      clearedWhileOff && lazy && builtInAssembly, {cleared: clearedWhileOff, lazy: lazy, assembly: builtInAssembly});
    check('presentation only: world arrays, spatial wall spans, collision and ray queries are identical with the flag off and on; 0 RNG draws',
      off === afterLazy && off === onAssembled && rngDraws === 0, {off: off, lazy: afterLazy === off, assembled: onAssembled === off, rng: rngDraws});
    var ownedCell = -1;
    for (var oc = 0; oc < G.structureModelOwner.length && ownedCell < 0; oc++) if (G.structureModelOwner[oc]) ownedCell = oc;
    var ownsOn = G.structureModelOwnsCell(ownedCell);
    // Staleness: a replaced grid or a moved window origin without a rebuild stops ownership; restoring resumes it.
    var realGrid = G.grid, realOriginX = G.windowOriginX, stale = {};
    G.grid = new Uint8Array(realGrid); stale.newGrid = G.structureModelOwnsCell(ownedCell);
    G.grid = realGrid; stale.gridBack = G.structureModelOwnsCell(ownedCell);
    G.windowOriginX = realOriginX + G.CHUNK_SIZE; stale.movedOrigin = G.structureModelOwnsCell(ownedCell);
    G.windowOriginX = realOriginX; stale.originBack = G.structureModelOwnsCell(ownedCell);
    check('staleness: a replaced grid or a moved window origin without a rebuild stops ownership (restoring them resumes it)',
      ownsOn && !stale.newGrid && stale.gridBack && !stale.movedOrigin && stale.originBack, stale);
    G.setRenderFeatures({structureModels: false});
    var ownsOff = G.structureModelOwnsCell(ownedCell);
    G.assembleWindow(px.target.centerCX, px.target.centerCY);
    check('switching off stops ownership at once and the next window assembly clears the models',
      ownsOn && !ownsOff && G.structureModels.length === 0 && G.structureModelOwner === null);
    // Restated in D2 (the draw pass): the flag-on frame now draws the models, so it
    // differs from the flag-off frame; switching off again restores that frame exactly.
    var landed = G.goToNearestLandmark({type: px.type});
    function frame() {
      H.clock.seed = 0x0badcafe; G._presentationRandomState = 1234567; G._lightGridFrameCount = 1;
      var hud = G.renderHudStatusLine; G.renderHudStatusLine = function () { return 'R:fixed'; };
      try { H.record(true); G.renderFrame(); return H.record(false); } finally { G.renderHudStatusLine = hud; }
    }
    G.resetRenderInterpolation(); G.updateDayNight(0); G.updateLightGrid(); G.renderFrame(); G.renderFrame();
    var frameOff = frame();
    G.setRenderFeatures({structureModels: true});
    var withModels = G.structureModelsCurrent() && G.structureModels.length > 0;
    var frameOn = frame();
    G.setRenderFeatures({structureModels: false});
    var frameBack = frame();
    check('drawing (restated in D2): a recorded frame near the structure changes with the models built and the flag on, and switching off restores the flag-off frame',
      landed && landed.ok && withModels && frameOff.hash() !== frameOn.hash() && frameOff.hash() === frameBack.hash() &&
      frameOff.entries === frameBack.entries && frameOff.entries > 500,
      {landed: landed && landed.ok, models: withModels, off: [frameOff.hash(), frameOff.entries], on: [frameOn.hash(), frameOn.entries],
        back: [frameBack.hash(), frameBack.entries]});
    var stats = G.getStructureModelStats();
    check('stats report builds, build ms, faces, owned and excluded cells', stats.builds > 0 && typeof stats.lastBuildMs === 'number' &&
      stats.faces > 0 && stats.owned > 0 && stats.excluded === 0 && stats.unclassified === 0, stats);

    // Classic levels: resetLevel keeps the Endless largeStructures, chunks and
    // colour arrays, so an ungated build would claim classic cells.
    G.setRenderFeatures({structureModels: true});
    var classic = {endlessCell: -1};
    for (var ec = 0; G.structureModelOwner && ec < G.structureModelOwner.length && classic.endlessCell < 0; ec++) if (G.structureModelOwnsCell(ec)) classic.endlessCell = ec;
    G.ENDLESS_MODE = false;
    classic.ownsAfterModeSwitch = classic.endlessCell >= 0 && G.structureModelOwnsCell(classic.endlessCell);
    var expanseLevel = 0;
    for (var lvi = 0; lvi < G.levels.length && !expanseLevel; lvi++) if (G.levels[lvi].terrain === 'expanse') expanseLevel = lvi + 1;
    G.terrain = 'expanse'; G.resetLevel(expanseLevel);
    // Positive control: stale cells an ungated build would claim (coloured, in a chunk of a listed structure).
    classic.staleCells = 0;
    (G.largeStructures || []).forEach(function (st) {
      for (var dy = 0; dy < G.WINDOW_CHUNKS; dy++) for (var dx = 0; dx < G.WINDOW_CHUNKS; dx++) {
        var ch = G.chunks[(G.windowCX + dx) + ',' + (G.windowCY + dy)];
        if (!ch || !ch.structure || ch.structure.regionX !== st.regionX || ch.structure.regionY !== st.regionY) continue;
        for (var y = 0; y < G.CHUNK_CELLS; y++) for (var x = 0; x < G.CHUNK_CELLS; x++) {
          var gx = dx * G.CHUNK_CELLS + x, gy = dy * G.CHUNK_CELLS + y, ci = gy * G.gridW + gx;
          if (gx < G.gridW && gy < G.gridH && G.grid[ci] && G.wallColorR && G.wallColorR[ci]) classic.staleCells++;
        }
      }
    });
    if (!expanseLevel || !classic.staleCells) out('SETUP_FAILURE the classic Expanse level keeps no stale structure cells (level ' + expanseLevel + ')');
    classic.ensured = G.ensureStructureModels();
    classic.models = G.structureModels.length;
    classic.owned = 0;
    for (var cc = 0; cc < G.gridW * G.gridH; cc++) if (G.structureModelOwnsCell(cc)) classic.owned++;
    G.setRenderFeatures({structureModels: false});
    check('classic levels: outside Endless no model is built or current and no cell is owned (stale Endless structures stay unclaimed)',
      classic.endlessCell >= 0 && !classic.ownsAfterModeSwitch && classic.staleCells > 0 && classic.ensured === false &&
      classic.models === 0 && classic.owned === 0, classic);
    H.startEndless(px.seed);   // later sections expect an Endless world
  }

  // ── Authored mesher fixture: merge keys, per-side bases, natural occluders ──
  // A 4x5 grid of 10-unit cells, hand-computed faces. Row 1: two owned cells,
  // equal top (100) and bases, different colours. Row 3: two owned cells of
  // one colour (the merge positive control). (1,2) is a natural solid cell
  // (not owned, top 60). Every owned cell has bases W 10, E 20, N 30, S 40.
  if (section('mesher')) {
    var MW = 4, MH = 5, MC = 10, mn = MW * MH;
    var mg = {width: MW, height: MH, cell: MC, minCellX: 0, minCellY: 0, uvX: 0, uvY: 0, solid: new Uint8Array(mn), owned: new Uint8Array(mn),
      topZ: new Float64Array(mn), faceBase: new Float64Array(mn * 4), colors: new Uint32Array(mn)};
    [[1, 1, 0x112233], [2, 1, 0x445566], [1, 3, 0x778899], [2, 3, 0x778899]].forEach(function (c) {
      var k = c[1] * MW + c[0];
      mg.solid[k] = 1; mg.owned[k] = 1; mg.topZ[k] = 100; mg.colors[k] = c[2];
      mg.faceBase[k * 4] = 10; mg.faceBase[k * 4 + 1] = 20; mg.faceBase[k * 4 + 2] = 30; mg.faceBase[k * 4 + 3] = 40;
    });
    mg.solid[2 * MW + 1] = 1; mg.topZ[2 * MW + 1] = 60;
    // kind|dir|plane|begin|end|z0|z1|tint for sides, kind|top|x0-x1|y0-y1|z|tint for tops.
    var expectedFaces = [
      'wall|W|10|10|20|10|100|1122867', 'wall|N|10|10|20|30|100|1122867', 'riser|S|20|10|20|60|100|1122867',
      'wall|N|10|20|30|30|100|4478310', 'wall|E|30|10|20|20|100|4478310', 'wall|S|20|20|30|40|100|4478310',
      'top|top|10-20|10-20|100|1122867', 'top|top|20-30|10-20|100|4478310',
      'wall|W|10|30|40|10|100|7833753', 'riser|N|30|10|20|60|100|7833753', 'wall|N|30|20|30|30|100|7833753',
      'wall|E|30|30|40|20|100|7833753', 'wall|S|40|10|30|40|100|7833753', 'top|top|10-30|30-40|100|7833753'
    ].sort();
    var meshed = G.meshStructureModelCells(mg, {span: 0}).faces.map(function (f) {
      var q = parseQuad(f.vertices);
      if (!q) return 'unparsed|' + f.kind;
      return q.type === 'top' ? [f.kind, 'top', q.x0 + '-' + q.x1, q.y0 + '-' + q.y1, q.z, f.tint].join('|') :
        [f.kind, q.dir, q.plane, q.begin, q.end, q.z0, q.z1, f.tint].join('|');
    }).sort();
    var row1North = meshed.filter(function (k) { return k.indexOf('wall|N|10|') === 0; });
    var row3South = meshed.filter(function (k) { return k.indexOf('wall|S|40|') === 0; });
    check('mesher fixture: equal top and base but different colours stay separate faces (equal colours merge)',
      row1North.length === 2 && row3South.length === 1 && row3South[0] === 'wall|S|40|10|30|40|100|7833753', {row1North: row1North, row3South: row3South});
    var missingFaces = expectedFaces.filter(function (k) { return meshed.indexOf(k) < 0; });
    var extraFaces = meshed.filter(function (k) { return expectedFaces.indexOf(k) < 0; });
    check('mesher fixture: faces equal the hand-built list (each side its own base W, E, N, S; natural neighbours occlude with their own top and emit nothing)',
      !missingFaces.length && !extraFaces.length && meshed.length === expectedFaces.length, {missing: missingFaces, extra: extraFaces});
  }

  // ── Study parity: StructureModel.meshGrid on StructureProduction.stamp grids ──
  if (section('parity')) {
    var prodPath = option('--production');
    if (!prodPath) { out('SETUP_FAILURE --production <StructureProduction js> is required for parity'); check('study parity inputs load', false); }
    else {
      (0, eval)(slurp(prodPath));
      (0, eval)(slurp('tools/game/structure-model.js'));
      var SP = G.StructureProduction, SM = G.StructureModel, baseH = SP.constants.canvasBaseH, pFail = [], shellFail = [], spanFail = [], nFaces = 0, nRisers = 0;
      function css(v) { return '#' + (0x1000000 | v).toString(16).slice(1); }
      function key(kind, material, color, vs) {
        return kind + '|' + material + '|' + color + '|' + vs.map(function (p) { return [p.x, p.y, p.z, p.u, p.v].join(','); }).join(';');
      }
      function area(faces) {
        return faces.reduce(function (sum, f) { var q = parseQuad(f.vertices); return sum + (q.type === 'top' ? (q.x1 - q.x0) * (q.y1 - q.y0) : (q.end - q.begin) * (q.z1 - q.z0)); }, 0);
      }
      var cases = [];
      TYPES.forEach(function (type) {
        cases.push({type: type});
        cases.push({type: type, scale: 0.85, rotation: 0.7, numBuildings: 1, numPillars: 9, armCount: 4});
        cases.push({type: type, scale: 1.15, rotation: 1.3, numBuildings: 2, numPillars: 15, armCount: 2});
      });
      cases.forEach(function (opts) {
        var built = SM.build(opts), grid = built.grid, n = grid.width * grid.height;
        var study = SM.meshGrid(grid).faces;
        var g = {width: grid.width, height: grid.height, cell: grid.cell, minCellX: grid.minCellX, minCellY: grid.minCellY, uvX: 0, uvY: 0,
          solid: grid.solid, owned: grid.solid, topZ: new Float64Array(n), faceBase: new Float64Array(n * 4), colors: grid.colors};
        for (var i = 0; i < n; i++) if (grid.solid[i]) g.topZ[i] = grid.wallHeights[i] * baseH;
        var mine = G.meshStructureModelCells(g, {span: 0}).faces;
        var a = study.map(function (f) { return key(f.kind, f.material, f.color, f.vertices); }).sort();
        var b = mine.map(function (f) { return key(f.kind === 'riser' ? 'wall' : f.kind, f.material, css(f.tint), f.vertices); }).sort();
        nFaces += mine.length; nRisers += mine.filter(function (f) { return f.kind === 'riser'; }).length;
        var diff = a.filter(function (x, k) { return x !== b[k]; });
        if (a.length !== b.length || diff.length) pFail.push(opts.type + ' ' + JSON.stringify(opts) + ' study ' + a.length + ' mine ' + b.length + ' first ' + (diff[0] || ''));
        var capped = G.meshStructureModelCells(g, {span: SPAN}).faces;
        if (area(capped) !== area(mine) || capped.length < mine.length) spanFail.push(opts.type + ' area ' + area(capped) + ' vs ' + area(mine));
        // Shell and its UVs against the study's build (same descriptor, pad base z 0).
        var studyShell = built.faces.filter(function (f) { return f.kind === 'shell'; });
        var myShell = G.captureStructureShellFaces(built.descriptor, 0).faces.map(function (f) {
          return {face: G._structureModelFace('shell', f.material, f.role, f.tint, f.local, 0, 0, null), role: f.role};
        });
        if (studyShell.length !== myShell.length) shellFail.push(opts.type + ' count ' + studyShell.length + ' vs ' + myShell.length);
        studyShell.forEach(function (sf, k) {
          var mf = myShell[k];
          if (!mf) return;
          var sameGeo = key('', '', '', sf.vertices) === key('', '', '', mf.face.vertices);
          var mat = sf.material === null ? 'cloth' : sf.material;
          var roleOk = mf.face.material !== 'stone' || Object.keys(G.structureColorRamp(built.descriptor, mf.role)).some(function (r) {
            return G.structureColorRamp(built.descriptor, mf.role)[r] === sf.color;
          });
          if (!sameGeo || mat !== mf.face.material || !roleOk) shellFail.push(opts.type + ' face ' + k + ' geo ' + sameGeo + ' ' + mat + '/' + mf.face.material + ' role ' + roleOk);
        });
      });
      check('study parity: the production mesher on StructureProduction.stamp grids (span cap off) equals StructureModel.meshGrid faces and UVs',
        !pFail.length && nFaces > 1000 && nRisers > 0, {fail: limited(pFail), faces: nFaces, risers: nRisers});
      check('the 48-unit span cap only splits faces (same wall and top area)', !spanFail.length, spanFail);
      check('shell parity: vertices, UVs and materials equal StructureModel.build shell faces; stone faces name the ramp role of their colour',
        !shellFail.length, limited(shellFail));
    }
  }

  // ── Load: inert fragment, registered default ON in Recommended since D2 ──
  if (section('load')) {
    function loadTouches(source) {
      var touches = [], defines = [], listeners = 0;
      function trap(name) {
        return new Proxy({}, {get: function (o, k) { touches.push(name + '.' + String(k)); return undefined; },
          set: function (o, k) { touches.push(name + '.' + String(k) + '='); return true; },
          has: function () { touches.push(name + ' in'); return false; }});
      }
      var randomBefore = H.clock.randomCalls;
      var run = new Function('document', 'window', 'canvas', 'ctx', 'localStorage', 'GAME_MATERIALS', 'defineRenderFeature', 'onRenderFeaturesChange', source);
      run(trap('document'), trap('window'), trap('canvas'), trap('ctx'), trap('localStorage'), trap('GAME_MATERIALS'),
        function (def) { defines.push(def.key + ':' + def.default + '/' + def.legacy); }, function () { listeners++; });
      return {touches: touches, defines: defines, listeners: listeners, random: H.clock.randomCalls - randomBefore};
    }
    var clean = loadTouches(fragmentSource), control = loadTouches(fragmentSource + '\nctx.fillStyle;\n');
    check('the fragment has no load-time DOM, canvas, storage, material or RNG use; it registers structureModels and one change listener',
      clean.touches.length === 0 && clean.random === 0 && JSON.stringify(clean.defines) === '["structureModels:true/false"]' &&
      clean.listeners === 1 && control.touches.join() === 'ctx.fillStyle', {clean: clean, control: control.touches});
    var main = JSON.parse(slurp('assets/games/manifest.json')).parts.MAIN;
    // Restated in D2: the default was flipped ON after the draw-pass checks passed (Legacy stays OFF).
    check('structureModels is registered default ON in Recommended and OFF in Legacy (flipped in D2) and the fragment sits after 12-prop-models.js',
      G.renderFeaturePreset('recommended').structureModels === true &&
      G.renderFeaturePreset('legacy').structureModels === false &&
      main.indexOf(MODELS) === main.indexOf('src/12-prop-models.js') + 1 && main.indexOf(MODELS) < main.indexOf('src/12-render-core-walls.js'));
  }

  // ── Generator note: why the cave overlap fixture is authored ──
  if (section('generator')) {
    function inside(t, x, y, pad) {
      var dx = x - t.centerWX, dy = y - t.centerWY, s = t.scale;
      if (t.type === 'fortress') { var E = G.CHUNK_SIZE * 1.7 * s + pad; return Math.abs(dx) < E && Math.abs(dy) < E; }
      if (t.type === 'arena') return Math.hypot(dx, dy) < G.CHUNK_SIZE * 1.1 * s + CELL * 4.5 + pad;
      return Math.hypot(dx, dy) < CELL * 19.5 * s * 1.42 + pad;
    }
    function scan(pad) {
      var structs = 0, hits = 0;
      for (var seed = 1; seed <= 1500; seed++) {
        G.WORLD_SEED = seed; G.noiseSeed = (seed * 7 + 42) | 0; G._biomeSeed = (seed * 13 + 999) | 0; G._geoSeed = (seed * 19 + 5555) | 0;
        G.endlessCaveNetworks = {};
        for (var ry = -10; ry <= 10; ry++) for (var rx2 = -10; rx2 <= 10; rx2++) {
          var t = G.landmarkRegionStructure(rx2, ry), hit = false;
          if (!t) continue;
          structs++;
          for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
            var net = G.generateCaveNetwork(rx2 + dx, ry + dy);
            if (!net) continue;
            net.corridors.forEach(function (c) {
              var L = Math.hypot(c.x2 - c.x1, c.y2 - c.y1), m = Math.max(1, Math.ceil(L / CELL));
              for (var k = 0; k <= m; k++) if (inside(t, c.x1 + (c.x2 - c.x1) * k / m, c.y1 + (c.y2 - c.y1) * k / m, c.width / 2 + pad)) hit = true;
            });
            net.chambers.forEach(function (c) { if (inside(t, c.cx, c.cy, c.radius + pad)) hit = true; });
          }
          if (hit) hits++;
        }
      }
      return {structs: structs, hits: hits};
    }
    var near = scan(24), padded = scan(174);
    out('NOTE generator sample: seeds 1-1500, regions +-10: ' + near.structs + ' structures, ' + near.hits +
      ' with a cave corridor or chamber within 24 u of the footprint (' + padded.hits + ' within 174 u); the overlap fixture is authored');
    check('generator scan positive control: padding the footprints by 150 u finds nearby cave networks', padded.hits > 0 && near.structs > 1000, padded);
  }

  check('no console errors', H.errors.length === 0, H.errors.slice(0, 3));
  out('STRUCTURE_MODELS_RESULT ' + (failed ? 'FAIL ' : 'PASS ') + checked + ' failed ' + failed);
}());
undefined;
