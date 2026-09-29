// Landmark models (integration stage J1, landmarkModels; default ON since J2)
// and the shrine, market stall, guard tower and fortress keep draw paths,
// through the real MAIN manifest (render_host.js). Oracles are independent of
// the model code: the stall's collision box is probed from repelFromStalls
// (09-physics.js) by bisection and its drawn table from the legacy painter's
// own ground corners; model extents, the octahedron, the merlon spans and the
// keep offsets are the J1 spec written out here; the surface support comes
// from an authored two-layer mesh (a cave floor at 0 under a surface at 50);
// depth is analytic (a face square to the view has one depth). Scene depth is
// the production code. Not a rasterizer or browser: no pixel colour, timing
// or compositing claims. Checks print PASS/FAIL and keep going, so a mutation
// names what it broke.
// Mutations (evaluated copies only; each anchor must match exactly once):
//   --stall-width           the model's STALL_W 34 -> 36 (footprint drifts
//                           from the collision box)
//   --legacy-stall-width    the legacy painter's STALL_W 34 -> 36 (the drawn
//                           table drifts from the model)
//   --lowest-floor          landmark models stand on getFloorHeightAt's
//                           lowest layer, as the legacy painters do
//   --no-tower-reach        a camera in the guard tower still draws its model
//   --overlay-at-near-plane the shrine overlays are tested at depth 1
//   --late-landmarks        the landmark opaque pass skips the stall and
//                           shrine models (they draw both phases late)
// --sections a,b runs only: spec, footprint, anchor, phase, depth, overlay,
// reach, keep, fallback, frame, lab.
(function () {
  (0, eval)(slurp('tools/game/tests/render_host.js'));
  var H = createRenderTestHost(), G = H.G, out = H.output, checked = 0, failed = 0;
  function check(name, ok, detail) {
    checked++; if (!ok) failed++;
    out((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + JSON.stringify(detail === undefined ? null : detail)));
  }
  function flag(name) { return __argv.indexOf(name) >= 0; }
  var sectionArg = __argv.indexOf('--sections') >= 0 ? __argv[__argv.indexOf('--sections') + 1].split(',') : null;
  function section(name) { return !sectionArg || sectionArg.indexOf(name) >= 0; }
  function swap(source, name, before, after) {
    if (!flag(name)) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + name);
    return source.replace(before, after);
  }
  var MODELS = 'src/12-prop-models.js', HUD = 'src/15-render-hud-menu.js';
  var loaded = H.loadManifest(function (path, source) {
    if (path === MODELS) {
      source = swap(source, '--stall-width', 'var STALL_MODEL_DIMS = Object.freeze({w: 34,', 'var STALL_MODEL_DIMS = Object.freeze({w: 36,');
      source = swap(source, '--lowest-floor', '  out.x = x; out.y = y; out.z = z;\n',
        '  out.x = x; out.y = y; out.z = floorMesh ? getFloorHeightAt(x, y) * 25 : z;\n');
      source = swap(source, '--no-tower-reach', '  return landmarkCameraInBox(inst, C, TOWER_MODEL_DIMS.half, 0, H + TOWER_MODEL_DIMS.merlonH);\n', '  return false;\n');
      return swap(source, '--late-landmarks',
        "    if (typeof drawMarketStalls3D === 'function') { drawMarketStalls3D('opaque'); pass.stalls = true; }\n" +
        "    if (typeof drawShrines3D === 'function') { drawShrines3D('opaque'); pass.shrines = true; }\n", '');
    }
    if (path === HUD) {
      source = swap(source, '--legacy-stall-width', '  var STALL_W = 34;   // width\n', '  var STALL_W = 36;   // width\n');
      return swap(source, '--overlay-at-near-plane', '  var depth = Math.max(1, landmarkNearDepth(inst, C, D.half, D.half));\n', '  var depth = 1;\n');
    }
    return source;
  });
  var KEYS = ['landmarkShrine', 'landmarkShrineCrystal', 'landmarkStall', 'landmarkStallGoods', 'landmarkTower',
    'landmarkForge', 'landmarkLectern', 'landmarkGarrison'];
  var definedAtLoad = KEYS.filter(function (k) { return !!G.PROP_MODELS[k]; });
  check('real manifest loads with the landmark models and no console errors',
    loaded > 40 && typeof G.landmarkModelFor === 'function' && typeof G.drawShrineModels3D === 'function' &&
    typeof G.drawMarketStallModels3D === 'function' && H.errors.length === 0, {loaded: loaded, errors: H.errors.slice(0, 3)});

  // ── Fixture: an authored flat world, empty grid; eye `eye` above the floor ──
  var W = 320, HT = 240, PS = 180, N = 64;
  function world(opts) {
    opts = opts || {};
    G.cell = 12; G.gridW = G.gridH = N; G.grid = new Uint8Array(N * N);
    G.wallHeights = new Float32Array(N * N); G.wallHeights.fill(1);
    G.floorMesh = opts.mesh || null; G.gridCave = null; G.deepCaveRegions = []; G.deepCaveEntrances = [];
    G.windowOriginX = G.windowOriginY = 0; G.CANVAS_BASE_H = 240; G.viewDist = 1400; G.ENDLESS_MODE = false;
    G.canvas.width = W; G.canvas.height = HT; G.projScale = PS; G.MODE3D = true; G.playerUnderground = false;
    G.ruins = []; G.treasureChests = []; G.enemySpawners = []; G.oreVeins = []; G.enemies = []; G.floorScatter = []; G.wallDecorations = [];
    G.marketStalls = opts.stalls || []; G.shopMarker = opts.shop || null; G.shrines = opts.shrines || [];
    G.largeStructures = opts.structures || []; G.completedFortresses = opts.completed || {};
    G.nearestShrine = opts.nearestShrine || null; G.nearestFortressInteract = opts.interact || null; G.fortressLockedNear = null;
    G.applyRenderPreset('recommended'); G.setRenderFeatures({landmarkModels: opts.models !== false});
    if (opts.features) G.setRenderFeatures(opts.features);
    var c = opts.cam || [0, 0, 0], eye = opts.eye === undefined ? 20 : opts.eye;
    G.cam = {x: c[0], y: c[1], ang: c[2], pitch: opts.pitch || 0, fov: Math.PI / 2, z: 60 + (eye - 60) * 40 / 25};
    G.pos.x = c[0]; G.pos.y = c[1];
    G.updateDayNight(0);
    frame();
  }
  function frame() {
    G.beginSceneDepthFrame(W, HT); G.beginRenderFrameStats();
    G.depthBuffer = new Float32Array(W); G.depthBuffer.fill(Infinity);
  }
  // Camera `d` units from (x, y) along angle `a` (radians), facing the point.
  function camAt(x, y, d, a) { return [x - Math.cos(a) * d, y - Math.sin(a) * d, a]; }
  function occluder(depth) {
    G.writeSceneDepthPolygon([{x: 0, y: 0, depth: depth}, {x: W, y: 0, depth: depth}, {x: W, y: HT, depth: depth}, {x: 0, y: HT, depth: depth}]);
  }
  function near(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol); }
  // Spies: model draws (key, phase, instance copy), billboards (depth, bounds,
  // result), translucent clips, text and depth pixels written.
  var log = null;
  function spyOn(name, wrap) { var real = G[name]; G[name] = wrap(real); return real; }
  spyOn('drawWorldModel', function (real) {
    return function (inst, model, C, phase) {
      if (log) log.models.push({key: model && model.key, phase: phase, stage: log.stage, x: inst.x, y: inst.y, z: inst.z,
        outX: inst.basis ? inst.basis.outX : NaN, outY: inst.basis ? inst.basis.outY : NaN,
        tints: inst.tints ? JSON.parse(JSON.stringify(inst.tints)) : null, before: G.getRenderFeatureStats().frame});
      var r = real.apply(this, arguments);
      if (log) { var m = log.models[log.models.length - 1], after = G.getRenderFeatureStats().frame, fam = model.statKeys;
        m.drawn = (after[fam.drawn] || 0) - (m.before[fam.drawn] || 0); m.faces = (after[fam.faces] || 0) - (m.before[fam.faces] || 0); delete m.before; }
      return r;
    };
  });
  spyOn('withSceneDepthBillboard', function (real) {
    return function (bounds, depth) {
      var r = real.apply(this, arguments);
      if (log) log.bills.push({depth: depth, x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height, result: r, stage: log.stage});
      return r;
    };
  });
  var realClip = spyOn('withSceneDepthClip', function (real) {
    return function () { var r = real.apply(this, arguments); if (log) log.clips.push(r); return r; };
  });
  spyOn('_pt', function (real) {
    return function (name) { var prev = log ? log.stage : ''; if (log) log.stage = name; try { return real.apply(this, arguments); } finally { if (log) log.stage = prev; } };
  });
  var realFillText = G.ctx.fillText;
  G.ctx.fillText = function (text, x, y) { if (log) log.texts.push({text: String(text), x: x, y: y}); return realFillText.apply(this, arguments); };
  function capture(fn) {
    var before = G._sceneDepthInv.slice();
    log = {models: [], bills: [], clips: [], texts: [], stage: ''};
    try { fn(); } finally { var got = log; log = null; }
    var d = G._sceneDepthInv, written = 0;
    for (var i = 0; i < d.length; i++) if (d[i] !== before[i]) written++;
    got.depthWritten = written;
    return got;
  }
  function recorded(fn) { H.record(true, true); try { fn(); } finally { var r = H.record(false); } return r.all; }
  function keyed(list, key) { return list.filter(function (m) { return m.key === key; }); }
  function buildFaces(model, inst) {
    var buf = G.createModelFaceBuffer(), n = G.buildModelFaces(model, inst, buf), faces = [];
    for (var i = 0; i < n; i++) {
      var f = buf.faces[i];
      faces.push({part: f.partName, v: f.vertices.map(function (p) { return {x: p.x, y: p.y, z: p.z}; })});
    }
    return faces;
  }
  function partBox(faces, pred) {
    var b = {x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity};
    faces.forEach(function (f) { if (pred(f.part)) f.v.forEach(function (p) {
      b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y);
      b.z0 = Math.min(b.z0, p.z); b.z1 = Math.max(b.z1, p.z); }); });
    return b;
  }
  function round(v) { return Math.round(v * 1e6) / 1e6; }

  // ── spec ──
  if (section('spec')) {
    var def = G.RENDER_FEATURE_DEFS.filter(function (d) { return d.key === 'landmarkModels'; })[0];
    // Restated in Stage J2: the default is ON (was OFF in J1); Legacy stays OFF.
    check('spec: landmarkModels is registered bool, default ON (since stage J2) and OFF in Legacy',
      !!def && def.type === 'bool' && def.default === true && def.legacy === false, def);
    var ids = Object.keys(G.GAME_MATERIAL_COLORS), M = G.GAME_MATERIAL_COLORS;
    // Restated at the I/J merge: stage I's floor-prop materials were appended
    // after spawnerObelisk first, so the landmark materials follow caveRock
    // (append-only: no earlier id moves; the five landmark-side ids stay one
    // contiguous run).
    var order = ['spawnerObelisk', 'floorStone', 'sandstone', 'mesaRock', 'barrelWood', 'caveRock',
      'landmarkShrine', 'landmarkStall', 'landmarkTower', 'landmarkKeep'].map(function (k) { return ids.indexOf(k); });
    check('spec: the landmark materials are appended after spawnerObelisk and the floor-prop materials (caveRock) and carry the legacy painted colours',
      order.every(function (v, i) { return v >= 0 && (i === 0 || v === order[i - 1] + 1); }) && ids.indexOf('bone') < order[0] &&
      M.landmarkStall.table === '#7a5030' && M.landmarkStall.wood === '#6b4226' && M.landmarkStall.woodDark === '#4a2e18' &&
      M.landmarkStall.woodLit === '#8b5e3c' && M.landmarkStall.awning === '#886633' && M.landmarkStall.awningDark === '#553311' &&
      M.landmarkStall.goods === '#aa8844' && M.landmarkTower.stone === '#9b8b7b' && M.landmarkTower.top === '#8b7d6b' &&
      M.landmarkShrine.top === '#888888' && M.landmarkKeep.platform === '#333333' && M.landmarkKeep.book === '#8866cc' &&
      M.landmarkKeep.flag === '#c8a028' && M.landmarkKeep.pole === '#5a4a3a', {order: order});
    var models = KEYS.map(function (k) { return G.landmarkModelFor(k); });
    check('spec: none is defined at load; all eight define on first use (families shrine, stall, tower, keep)',
      definedAtLoad.length === 0 && G.landmarkModelsReady() &&
      models.map(function (m) { return m && m.family; }).join() === 'shrine,shrine,stall,stall,tower,keep,keep,keep', definedAtLoad);
    // Shrine: the legacy pedestal and octahedron (c = 7 about crystalZ).
    var at0 = G.landmarkModelInstance(0, 0, 0, 0, {});
    var ped = partBox(buildFaces(models[0], at0), function () { return true; });
    var crystal = models[1], verts = {}, triangles = 0;
    crystal.parts.forEach(function (p) { triangles += p.faces.length; p.faces.forEach(function (f) { f.points.forEach(function (q) { verts[q.map(round).join(',')] = 1; }); }); });
    check('spec: shrine pedestal is the legacy 20 x 20 x 18 box; the crystal is the legacy octahedron (top 14, bottom -7, equator 3.5 at radius 7), two tinted halves of four faces, translucent and emissive; label 48 and prompt 58 up',
      near(ped.x0, -10) && near(ped.x1, 10) && near(ped.y0, -10) && near(ped.y1, 10) && near(ped.z0, 0) && near(ped.z1, 18) &&
      Object.keys(verts).sort().join(';') === ['-7,0,3.5', '0,-7,3.5', '0,0,-7', '0,0,14', '0,7,3.5', '7,0,3.5'].sort().join(';') &&
      triangles === 8 && crystal.parts.length === 2 && crystal.parts.every(function (p) { return p.faces.length === 4 && p.flags.translucent && p.flags.emissive; }) &&
      crystal.parts[0].tint === 'crystal' && crystal.parts[1].tint === 'crystalDark' &&
      JSON.stringify(models[0].parts[0].anchors) === '{"label":[0,0,48],"prompt":[0,0,58]}', {ped: ped, verts: Object.keys(verts)});
    // Tower: world spans at yaw 0 about the marker: the legacy corner walk,
    // merlons at 0.15-0.45 and 0.65-0.95 of each edge, 2 deep, 80 to 92.
    var towerFaces = buildFaces(models[4], at0), body = partBox(towerFaces, function (p) { return p === 'body'; });
    var want = ['-5.6,-0.8,-8,-6', '2.4,7.2,-8,-6', '6,8,-5.6,-0.8', '6,8,2.4,7.2', '0.8,5.6,6,8', '-7.2,-2.4,6,8', '-8,-6,0.8,5.6', '-8,-6,-7.2,-2.4'];
    var merlons = [], mz = true;
    for (var k = 0; k < 4; k++) for (var m = 0; m < 2; m++) {
      var mb = partBox(towerFaces, function (p) { return p === 'merlon' + k + '_' + m; });
      merlons.push([mb.x0, mb.x1, mb.y0, mb.y1].map(round).join(','));
      mz = mz && near(mb.z0, 80) && near(mb.z1, 92);
    }
    check('spec: guard tower is the legacy 16 x 16 x TOWER_HEIGHT (80) box with eight 12-high merlons at the legacy edge spans',
      near(body.x0, -8) && near(body.x1, 8) && near(body.y0, -8) && near(body.y1, 8) && near(body.z1, 80) && G.TOWER_HEIGHT === 80 &&
      mz && merlons.sort().join(';') === want.slice().sort().join(';'), {merlons: merlons, body: body});
    // Stall, local: r across (34), o along the facing (18); awning 44 at the
    // back edge to 39 at 10 past the front, 1 thick; legs and poles inside.
    var sf = buildFaces(models[2], at0), slab = partBox(sf, function (p) { return p === 'slab'; });
    var aw = partBox(sf, function (p) { return p === 'awning'; }), stand = partBox(sf, function (p) { return /^(leg|pole)/.test(p); });
    // At yaw 0 (modelBasis) o is world +x and r world +y.
    check('spec: stall slab spans 34 across and 18 along the facing at 16-18 up; the awning runs 44 -> 39 from the back edge to 10 past the front; legs and poles stand inside the slab',
      near(slab.y0, -17) && near(slab.y1, 17) && near(slab.x0, -9) && near(slab.x1, 9) && near(slab.z0, 16) && near(slab.z1, 18) &&
      near(aw.x0, -9) && near(aw.x1, 19) && near(aw.z1, 44) && near(aw.z0, 38) && near(aw.y0, -17) && near(aw.y1, 17) &&
      stand.x0 > -9 && stand.x1 < 9 && stand.y0 > -17 && stand.y1 < 17 && near(stand.z0, 0) && stand.z1 > 40 && stand.z1 < 44,
      {slab: slab, awning: aw, stand: stand});
    var keepOk = [5, 6, 7].every(function (i) {
      var b = partBox(buildFaces(models[i], at0), function (p) { return p === 'platform'; });
      return near(b.x0, -5) && near(b.x1, 5) && near(b.z1, 1.5);
    });
    check('spec: forge, lectern and garrison stand on a 10 x 10 platform with a prompt anchor 28 up',
      keepOk && [5, 6, 7].every(function (i) {
        var a = G.modelAnchorWorld(models[i], at0, 'prompt', {});
        return a && near(a.x, 0) && near(a.y, 0) && near(a.z, 28);
      }));
  }

  // ── footprint: stall model = collision box = legacy drawn table ──
  if (section('footprint')) {
    world({});
    var radius = G.spatialPlayerBody().radius, facings = [0, Math.PI * 0.5, Math.PI * 0.25, -Math.PI * 0.75, 2.2], rows = [];
    function pushed(stall, x, y) {
      var keep = G.marketStalls; G.marketStalls = [stall];
      G.pos.x = x; G.pos.y = y; G.vel.x = G.vel.y = 0;
      try { G.repelFromStalls(); } finally { G.marketStalls = keep; }
      return Math.hypot(G.pos.x - x, G.pos.y - y) > 1e-9;
    }
    function boundary(stall, ux, uy) {
      var lo = 0, hi = 60;
      for (var i = 0; i < 60; i++) { var mid = (lo + hi) / 2; if (pushed(stall, stall.x + ux * mid, stall.y + uy * mid)) lo = mid; else hi = mid; }
      return (lo + hi) / 2;
    }
    // The legacy painter's ground corners (world points it projects at its ground z).
    var realProj = G.projToScreen;
    function legacyCorners(stall) {
      world({models: false, stalls: [stall], cam: camAt(stall.x, stall.y, 130, 0.6)});
      var pts = [];
      G.projToScreen = function (x, y, z, C) { pts.push({x: x, y: y, z: z}); return realProj(x, y, z, C); };
      try { G.drawMarketStalls3D(); } finally { G.projToScreen = realProj; }
      var seen = {};
      return pts.filter(function (p) { var k = round(p.x) + ',' + round(p.y); if (p.z !== 0 || seen[k]) return false; seen[k] = 1; return true; });
    }
    facings.forEach(function (facing) {
      var stall = {x: 384, y: 384, facing: facing, stallType: 'weapons'};
      var f = {x: Math.cos(facing), y: Math.sin(facing)}, a = {x: -f.y, y: f.x};
      var faces = buildFaces(G.landmarkModelFor('landmarkStall'), G.stallModelInstance(stall, 0, '#cc3333', '#882222', '#cc3333', {}));
      var along = 0, across = 0, over = -Infinity, slabXY = {};
      faces.forEach(function (fc) { fc.v.forEach(function (p) {
        var dx = p.x - stall.x, dy = p.y - stall.y, lo = dx * f.x + dy * f.y, la = dx * a.x + dy * a.y;
        if (fc.part === 'awning' || fc.part === 'stripe') { over = Math.max(over, lo); return; }
        along = Math.max(along, Math.abs(lo)); across = Math.max(across, Math.abs(la));
        if (fc.part === 'slab') slabXY[round(p.x) + ',' + round(p.y)] = 1;
      }); });
      var col = [boundary(stall, f.x, f.y), boundary(stall, -f.x, -f.y), boundary(stall, a.x, a.y), boundary(stall, -a.x, -a.y)]
        .map(function (b) { return b - radius; });
      var legacy = legacyCorners(stall).map(function (p) { return round(p.x) + ',' + round(p.y); }).sort();
      rows.push({facing: round(facing), along: round(along), across: round(across), collision: col.map(function (v) { return round(v); }),
        overhang: round(over), legacy: legacy.join(';') === Object.keys(slabXY).sort().join(';'), legacyCount: legacy.length});
    });
    out('NOTE footprint ' + JSON.stringify(rows));
    check('footprint: at five facings the stall model\'s standing parts (slab, legs, poles) span exactly repelFromStalls\' collision box, probed by bisection (9 along the facing, 17 across, both sides)',
      rows.every(function (r) { return near(r.along, 9, 1e-6) && near(r.across, 17, 1e-6) &&
        near(r.collision[0], r.along, 1e-6) && near(r.collision[1], r.along, 1e-6) &&
        near(r.collision[2], r.across, 1e-6) && near(r.collision[3], r.across, 1e-6); }), rows);
    check('footprint: the model slab\'s corners are the legacy painter\'s drawn table corners at every facing (its STALL_W x STALL_D)',
      rows.every(function (r) { return r.legacy && r.legacyCount === 4; }), rows);
    check('footprint: only the awning overhangs, 10 past the front edge (the legacy overhang)',
      rows.every(function (r) { return near(r.overhang, 19, 1e-6); }), rows);
  }

  // ── anchor: a two-layer site (cave floor at 0 under a surface at 50) ──
  var TWO_LAYER = {w: 1, h: 1, gridSize: 4000, layerCount: [2], l0Type: [1], l0TopZ: [0], l1Type: [1], l1TopZ: [2],
    l2Type: [0], l2TopZ: [0], l3Type: [0], l3TopZ: [0], l4Type: [0], l4TopZ: [0]};
  if (section('anchor')) {
    var SX = 400, SY = 400, FORT = {type: 'fortress', x: 400, y: 400, scale: 1, numBuildings: 2, rotation: 0, regionX: 5, regionY: 5};
    function drawAll() { G.drawMarketStalls3D(); G.drawShrines3D(); G.drawStructures3D(); }
    function scene(models) {
      world({mesh: TWO_LAYER, models: models, eye: 80, cam: camAt(SX, SY, 120, 0.3),
        stalls: [{x: SX + 60, y: SY - 40, facing: 2.5, stallType: 'potions'}], shop: {x: SX + 20, y: SY + 70},
        shrines: [{x: SX - 60, y: SY + 20, buffType: 'regen', used: false}], structures: [FORT]});
    }
    scene(true);
    var got = capture(drawAll), z = {};
    got.models.forEach(function (m) { if (m.key !== 'landmarkShrineCrystal') z[m.key] = (z[m.key] || []).concat([m.z]); });
    out('NOTE anchor model z ' + JSON.stringify(z));
    check('anchor: over a cave, the shrine, stall, goods, guard tower, forge, lectern and banner models stand on the surface (authored 50), not the cave floor (0)',
      ['landmarkShrine', 'landmarkStall', 'landmarkStallGoods', 'landmarkTower', 'landmarkForge', 'landmarkLectern', 'landmarkGarrison']
        .every(function (k) { return z[k] && z[k].length && z[k].every(function (v) { return v === 50; }); }), z);
    // Control: the fixture discriminates. The legacy painters stand on the
    // lowest layer (getFloorHeightAt), world height 0 here.
    scene(false);
    var realProj2 = G.projToScreen, minZ = Infinity;
    G.projToScreen = function (x, y, zz, C) { minZ = Math.min(minZ, zz); return realProj2(x, y, zz, C); };
    try { G.drawMarketStalls3D(); } finally { G.projToScreen = realProj2; }
    check('anchor (control): the legacy stall and tower painters stand on the cave floor (0) at the same site', minZ === 0, minZ);
  }

  // ── Shared scene for phase / depth / overlay: flat, eye 20 ──
  function stallScene(models, extra) {
    var o = {models: models, stalls: [{x: 400, y: 400, facing: Math.PI, stallType: 'scrolls'}], shop: {x: 460, y: 330},
      shrines: [{x: 420, y: 470, buffType: 'speed', used: false}], cam: [300, 400, 0]};
    for (var k in extra || {}) o[k] = extra[k];
    o.nearestShrine = o.shrines[0];
    world(o);
  }
  var OFORT = {type: 'fortress', x: 400, y: 400, scale: 1, numBuildings: 2, rotation: 0, regionX: 3, regionY: 3};

  // ── phase ──
  if (section('phase')) {
    var fams = [['stalls', function (p) { return p === undefined ? G.drawMarketStalls3D() : G.drawMarketStalls3D(p); }],
      ['shrines', function (p) { return p === undefined ? G.drawShrines3D() : G.drawShrines3D(p); }]];
    var rows = {};
    fams.forEach(function (f) {
      stallScene(true); var op = capture(function () { f[1]('opaque'); });
      stallScene(true); var ov = capture(function () { f[1]('overlay'); });
      stallScene(true); var both = recorded(function () { f[1](); });
      stallScene(true); var seq = recorded(function () { f[1]('opaque'); f[1]('overlay'); });
      rows[f[0]] = {opaque: {depth: op.depthWritten, bills: op.bills.length, texts: op.texts.length, models: op.models.map(function (m) { return m.key + ':' + m.phase; })},
        overlay: {depth: ov.depthWritten, bills: ov.bills.length, texts: ov.texts.map(function (t) { return t.text; }), models: ov.models.map(function (m) { return m.key + ':' + m.phase; })},
        same: both.join('\n') === seq.join('\n'), entries: both.length};
    });
    out('NOTE phase ' + JSON.stringify(rows));
    var st = rows.stalls, sh = rows.shrines;
    check('phase: the stall pass\'s opaque phase draws the stall, goods and tower models, writing depth, and no billboard or text',
      st.opaque.depth > 500 && st.opaque.bills === 0 && st.opaque.texts === 0 &&
      st.opaque.models.join() === 'landmarkTower:opaque,landmarkStall:opaque,landmarkStallGoods:opaque', st);
    check('phase: the stall pass\'s overlay phase draws only the tower beacon billboard and writes no depth',
      st.overlay.depth === 0 && st.overlay.bills === 1 && st.overlay.models.length === 0, st);
    check('phase: the shrine\'s opaque phase draws the pedestal, writing depth, and no billboard or text',
      sh.opaque.depth > 200 && sh.opaque.bills === 0 && sh.opaque.texts === 0 && sh.opaque.models.join() === 'landmarkShrine:opaque', sh);
    check('phase: the shrine\'s overlay phase draws the translucent crystal, the glow, the buff label and the prompt, and writes no depth',
      sh.overlay.depth === 0 && sh.overlay.models.join() === 'landmarkShrineCrystal:overlay' && sh.overlay.bills === 3 &&
      sh.overlay.texts.join() === 'Swiftness,Press E', sh);
    check('phase: outside a frame, a call with no argument records the same commands as the opaque phase then the overlay phase (stalls, shrines)',
      st.same && sh.same && st.entries > 50 && sh.entries > 50, {stalls: st.same, shrines: sh.same});
    // Keep: the models draw with the shell ('opaque'); glows and prompt are overlays.
    world({structures: [OFORT], cam: camAt(400, 400 - 48, 70, Math.PI / 2 + 0.3), interact: {type: 'forge', structure: OFORT}});
    var kop = capture(function () { G.drawStructures3D('opaque'); });
    world({structures: [OFORT], cam: camAt(400, 400 - 48, 70, Math.PI / 2 + 0.3), interact: {type: 'forge', structure: OFORT}});
    var kov = capture(function () { G.drawStructures3D('overlay'); });
    var keepKeys = function (g) { return g.models.filter(function (m) { return /^landmark(Forge|Lectern|Garrison)$/.test(m.key); }).map(function (m) { return m.key + ':' + m.phase; }).join(); };
    check('phase: the structures\' opaque phase draws the forge, lectern and banner models; the overlay phase draws none, only billboards (two glows, the label and the forge prompt)',
      keepKeys(kop) === 'landmarkForge:opaque,landmarkLectern:opaque,landmarkGarrison:opaque' && keepKeys(kov) === '' &&
      kov.texts.some(function (t) { return t.text === '[E] Enchantment Forge'; }) && kov.depthWritten === 0,
      {opaque: keepKeys(kop), overlay: keepKeys(kov), texts: kov.texts.map(function (t) { return t.text; })});
  }

  // ── depth: faces write the analytic depth; a nearer occluder hides all ──
  if (section('depth')) {
    var D = 60, rows = [];
    // Straight on (camera on the landmark's axis, facing it); eye inside each face's height.
    function sample(opts, eye) {
      world(opts); var C = G.getCam3D();
      var got = capture(function () { if (opts.stalls.length || opts.shop) G.drawMarketStalls3D('opaque'); if (opts.shrines.length) G.drawShrines3D('opaque'); });
      return {depth: G.sceneDepthAt(W / 2, C.horizonY), drawn: got.models.reduce(function (s, m) { return s + m.drawn; }, 0), written: got.depthWritten};
    }
    var tower = sample({stalls: [{x: -1e5, y: -1e5, facing: 0, stallType: 'weapons'}], shop: {x: 400, y: 400}, shrines: [], cam: [400 - D, 400, 0], eye: 20});
    var stall = sample({stalls: [{x: 400, y: 400, facing: Math.PI, stallType: 'weapons'}], shop: null, shrines: [], cam: [400 - D, 400, 0], eye: 17});
    var shrine = sample({stalls: [], shop: null, shrines: [{x: 400, y: 400, buffType: 'damage', used: false}], cam: [400 - D, 400, 0], eye: 9});
    rows.push({tower: tower, stall: stall, shrine: shrine});
    out('NOTE depth ' + JSON.stringify(rows));
    check('depth: straight on, the tower face, the stall slab front and the shrine pedestal front write their analytic depths (D - 8, D - 9, D - 10)',
      near(tower.depth, D - 8, 1e-3) && near(stall.depth, D - 9, 1e-3) && near(shrine.depth, D - 10, 1e-3), rows);
    // Occlusion, with a positive control: the same scene without the occluder.
    function occluded(withOccluder) {
      stallScene(true);
      if (withOccluder) occluder(5);
      return capture(function () { G.drawMarketStalls3D(); G.drawShrines3D(); });
    }
    var open = occluded(false), shut = occluded(true);
    var sum = function (g) { return g.models.reduce(function (s, m) { return s + (m.drawn || 0); }, 0); };
    check('depth: with nothing in front, the stall, tower and shrine models draw faces and every billboard shows (positive control)',
      sum(open) > 10 && open.bills.length === 4 && open.bills.every(function (b) { return b.result > 0; }), {drawn: sum(open), bills: open.bills});
    check('depth: an occluder nearer than every landmark hides every model face, the crystal and every billboard, and they write no depth',
      sum(shut) === 0 && shut.bills.length === 4 && shut.bills.every(function (b) { return b.result === 0; }) &&
      shut.clips.every(function (r) { return r === 0; }) && shut.depthWritten === 0, {drawn: sum(shut), bills: shut.bills, clips: shut.clips});
  }

  // ── overlay: shrine crystal, glow, label and prompt ──
  if (section('overlay')) {
    var rows = [];
    [[0, 60], [Math.PI / 4, 70]].forEach(function (pose) {
      var shr = {x: 400, y: 400, buffType: 'speed', used: false}, c = camAt(400, 400, pose[1], pose[0]);
      world({shrines: [shr], nearestShrine: shr, cam: c});
      var C = G.getCam3D(), g = capture(function () { G.drawShrines3D(); }), now = G.gameTimeNow(), dist = Math.hypot(400 - c[0], 400 - c[1]);
      var cr = keyed(g.models, 'landmarkShrineCrystal')[0], nearest = pose[1] - 10 * (Math.abs(Math.cos(pose[0])) + Math.abs(Math.sin(pose[0])));
      var label = G.projToScreen(400, 400, 48, C), prompt = G.projToScreen(400, 400, 58, C);
      var lt = g.texts.filter(function (t) { return t.text === 'Swiftness'; })[0], pt = g.texts.filter(function (t) { return t.text === 'Press E'; })[0];
      rows.push({crystalZ: cr && cr.z, wantZ: 28 + Math.sin(now * 0.003 + dist * 0.01) * 4, tints: cr && cr.tints, depths: g.bills.map(function (b) { return b.depth; }),
        nearest: nearest, label: lt && [lt.x, lt.y], wantLabel: [label.sx, label.sy], prompt: pt && [pt.x, pt.y], wantPrompt: [prompt.sx, prompt.sy]});
    });
    out('NOTE overlay ' + JSON.stringify(rows));
    check('overlay: the crystal is centred at the legacy crystalZ (support + 28 + the legacy bob) with the legacy buff colours (speed #44ffff / #116666)',
      rows.every(function (r) { return near(r.crystalZ, r.wantZ, 1e-9) && r.tints.crystal === 0x44ffff && r.tints.crystalDark === 0x116666; }), rows);
    check('overlay: the glow, label and prompt are tested at the pedestal\'s nearest depth (straight on D - 10, at 45 degrees D - 10 sqrt 2)',
      rows.every(function (r) { return r.depths.length === 3 && r.depths.every(function (d) { return near(d, r.nearest, 1e-9); }); }), rows);
    check('overlay: the label and prompt are drawn at the pedestal anchors 48 and 58 above the support',
      rows.every(function (r) { return r.label && r.prompt && near(r.label[0], r.wantLabel[0]) && near(r.label[1], r.wantLabel[1]) &&
        near(r.prompt[0], r.wantPrompt[0]) && near(r.prompt[1], r.wantPrompt[1]); }), rows);
    var used = {x: 400, y: 400, buffType: 'speed', used: true};
    world({shrines: [used], nearestShrine: null, cam: camAt(400, 400, 60, 0)});
    var ug = capture(function () { G.drawShrines3D(); }), ucr = keyed(ug.models, 'landmarkShrineCrystal')[0];
    check('overlay: a used shrine keeps its grey crystal (#555555 / #444444) and draws no glow, label or prompt',
      !!ucr && ucr.tints.crystal === 0x555555 && ucr.tints.crystalDark === 0x444444 && ug.bills.length === 0 && ug.texts.length === 0,
      {tints: ucr && ucr.tints, bills: ug.bills.length});
    // Straight on at 60 the pedestal front is at 50 and the centre at 60. A
    // wall at 30 (between the camera and the shrine) hides the overlays; one
    // at 55 (inside the shrine's own depth range, behind its front) does not.
    function wallAt(depth) {
      var shr = {x: 400, y: 400, buffType: 'speed', used: false};
      world({shrines: [shr], nearestShrine: shr, cam: camAt(400, 400, 60, 0)});
      if (depth) occluder(depth);
      return capture(function () { G.drawShrines3D('overlay'); });
    }
    var bare = wallAt(0), front = wallAt(30), within = wallAt(55);
    var shows = function (g) { return g.bills.length === 3 && g.bills.every(function (b) { return b.result > 0; }); };
    check('overlay: a wall between the camera and the shrine (depth 30) hides the glow, label and prompt; without it all three show',
      shows(bare) && front.bills.length === 3 && front.bills.every(function (b) { return b.result === 0; }), {bare: bare.bills, front: front.bills});
    check('overlay: something within the shrine\'s own depth range (55: behind its front at 50, before its centre at 60) does not hide them',
      shows(within), within.bills);
  }

  // ── reach: a camera in or at the guard tower keeps the legacy body ──
  if (section('reach')) {
    // The shop stands at the tower, which has no movement collision.
    function towerAt(d, models, ang) {
      world({models: models, stalls: [{x: -1e5, y: -1e5, facing: 0, stallType: 'weapons'}], shop: {x: 400, y: 400}, shrines: [],
        cam: [400 - d, 400, ang || 0], eye: 20});
      var rec = null, g = capture(function () { rec = recorded(function () { G.drawMarketStalls3D(); }); });
      return {models: keyed(g.models, 'landmarkTower').length, bills: g.bills.length, depth: g.depthWritten, rec: rec.join('\n'), n: rec.length};
    }
    var poses = [[2, 0], [2, Math.PI], [8.5, 0]], rows = poses.map(function (p) {
      var on = towerAt(p[0], true, p[1]), off = towerAt(p[0], false, p[1]);
      return {d: p[0], ang: round(p[1]), models: on.models, depth: on.depth, same: on.rec === off.rec, n: on.n};
    });
    var far = towerAt(40, true);
    out('NOTE reach ' + JSON.stringify({rows: rows, far: {models: far.models, depth: far.depth, bills: far.bills}}));
    check('reach: from 40 u the tower model draws, writing depth (the beacon is its one billboard)', far.models === 1 && far.depth > 1000 && far.bills === 1,
      {models: far.models, depth: far.depth, bills: far.bills});
    check('reach: a camera inside the tower (facing in or out) or 0.5 u from its face (within the near plane\'s reach) draws no tower model and no depth, exactly the legacy painter\'s commands',
      rows.every(function (r) { return r.models === 0 && r.depth === 0 && r.same; }), rows);
  }

  // ── keep: forge, lectern and banner models ──
  if (section('keep')) {
    world({structures: [OFORT], completed: {'3,3': {forge: true}}, cam: camAt(400, 400, 200, 0.4)});
    var g = capture(function () { G.drawStructures3D('opaque'); });
    var props = g.models.filter(function (m) { return /^landmark(Forge|Lectern|Garrison)$/.test(m.key); });
    var want = {landmarkLectern: [448, 424], landmarkGarrison: [352, 424]};
    check('keep: the lectern and banner stand at the legacy offsets (4 cells east 2 south, 4 west 2 south) facing the fortress centre; the used forge draws nothing',
      props.length === 2 && props.every(function (m) {
        var w = want[m.key], dx = 400 - m.x, dy = 400 - m.y, len = Math.hypot(dx, dy);
        return !!w && near(m.x, w[0]) && near(m.y, w[1]) && near(m.outX * dx / len + m.outY * dy / len, 1, 1e-12);
      }), props);
    var gar = G.landmarkModelFor('landmarkGarrison'), item = {type: 'garrison', ox: -48, oy: 24};
    var f0 = buildFaces(gar, G.keepPropInstance(OFORT, item, 0, 0, {})), f1 = buildFaces(gar, G.keepPropInstance(OFORT, item, 0, 314.159, {}));
    var flagMoved = false, poleSame = true;
    f0.forEach(function (fc, i) { fc.v.forEach(function (p, j) { var q = f1[i].v[j], d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
      if (fc.part === 'flag' && d > 1) flagMoved = true; if (fc.part !== 'flag' && d > 1e-9) poleSame = false; }); });
    check('keep: the banner\'s flag swings about its pole with the legacy wave clock; the pole and platform stay put', flagMoved && poleSame);
    world({structures: [OFORT], cam: camAt(400, 400 + 24, 120, -Math.PI / 2 - 0.2), interact: {type: 'lectern', structure: OFORT}});
    var C = G.getCam3D(), ov = capture(function () { G.drawStructures3D(); });
    var t = ov.texts.filter(function (x) { return x.text === '[E] Ancient Lectern'; })[0], p = G.projToScreen(448, 424, 28, C);
    var glows = ov.bills.filter(function (b) { return b.w < 200; });
    check('keep: the lectern prompt is drawn at the model\'s prompt anchor (28 above its own support), and the forge and lectern glows are depth-tested billboards',
      !!t && !!p && near(t.x, p.sx) && near(t.y, p.sy) && glows.length >= 2, {text: t, want: p, bills: ov.bills});
  }

  // ── fallback: switch off, and a rejected definition ──
  if (section('fallback')) {
    stallScene(false);
    var offOpaque = recorded(function () { G.drawMarketStalls3D('opaque'); G.drawShrines3D('opaque'); });
    stallScene(false); var offBoth = recorded(function () { G.drawMarketStalls3D(); G.drawShrines3D(); });
    stallScene(false); var offOverlay = recorded(function () { G.drawMarketStalls3D('overlay'); G.drawShrines3D('overlay'); });
    check('fallback: with landmarkModels off, the opaque phase draws nothing and the overlay phase is the whole legacy painter (same commands as no argument)',
      offOpaque.length === 0 && offBoth.length > 50 && offBoth.join('\n') === offOverlay.join('\n'), {opaque: offOpaque.length, both: offBoth.length});
    world({structures: [OFORT], models: false, cam: camAt(400, 400 - 48, 70, Math.PI / 2 + 0.3)});
    var kg = capture(function () { G.drawStructures3D('opaque'); });
    check('fallback: with landmarkModels off, the structures\' opaque phase draws no keep model', kg.models.length === 0, kg.models);
    // A rejected definition keeps every landmark on the legacy path (reported once).
    var realDef = G._LANDMARK_MODEL_DEFS.landmarkTower, kept = G.PROP_MODELS.landmarkTower, errs = H.errors.length;
    delete G.PROP_MODELS.landmarkTower;
    G._LANDMARK_MODEL_DEFS.landmarkTower = function () { var d = realDef(); d.parts[0].max = [8, 8, 0]; return d; };
    try {
      stallScene(true); var rej = recorded(function () { G.drawMarketStalls3D(); G.drawShrines3D(); });
      stallScene(true); recorded(function () { G.drawMarketStalls3D(); });
      var reported = H.errors.slice(errs);
      check('fallback: a rejected tower definition is reported once and every landmark keeps the legacy painter (the same commands as with the switch off)',
        reported.length === 1 && /landmarkTower model rejected/.test(reported[0]) && !G.landmarkModelsOn() && rej.join('\n') === offBoth.join('\n'),
        {reported: reported, same: rej.join('\n') === offBoth.join('\n')});
    } finally {
      G._LANDMARK_MODEL_DEFS.landmarkTower = realDef; G.PROP_MODELS.landmarkTower = kept;
      delete G._landmarkModelFailed.landmarkTower; H.errors.length = errs;
    }
  }

  // ── frame: the real renderFrame pass order ──
  if (section('frame')) {
    function frameRun(features) {
      stallScene(true, {structures: [OFORT], features: features, cam: camAt(430, 420, 190, 0.2)});
      G._lightGridFrameCount = 1; G._ptErrors = {};
      var g = capture(function () { G.renderFrame(); });
      g.errors = JSON.stringify(G._ptErrors);
      return g;
    }
    var early = frameRun({landmarkOpaqueEarly: true}), late = frameRun({landmarkOpaqueEarly: false});
    function where(g, phase) {
      var o = {};
      g.models.forEach(function (m) { if (/^landmark/.test(m.key) && m.phase === phase) o[m.key] = (o[m.key] ? o[m.key] + ',' : '') + m.stage; });
      return o;
    }
    var eo = where(early, 'opaque'), lo = where(late, 'opaque'), ev = where(early, 'overlay');
    out('NOTE frame early ' + JSON.stringify(eo) + ' late ' + JSON.stringify(lo) + ' overlay ' + JSON.stringify(ev));
    var families = ['landmarkStall', 'landmarkTower', 'landmarkShrine', 'landmarkForge', 'landmarkLectern', 'landmarkGarrison'];
    check('frame: with the landmark opaque pass, every stall, tower, shrine and keep model draws once, in landmarkOpaque3D',
      families.every(function (k) { return eo[k] === 'landmarkOpaque3D'; }) && early.errors === '{}', {opaque: eo, errors: early.errors});
    check('frame: the late marketStalls3D and shrines3D stages then draw only overlays (the crystal and billboards)',
      ev.landmarkShrineCrystal === 'shrines3D' && early.bills.some(function (b) { return b.stage === 'marketStalls3D'; }) &&
      !early.models.some(function (m) { return m.phase === 'opaque' && (m.stage === 'marketStalls3D' || m.stage === 'shrines3D'); }), ev);
    check('frame: without the landmark opaque pass the late stages draw the models (stalls and tower in marketStalls3D, shrine in shrines3D, keep in structures3D)',
      lo.landmarkStall === 'marketStalls3D' && lo.landmarkTower === 'marketStalls3D' && lo.landmarkShrine === 'shrines3D' &&
      lo.landmarkForge === 'structures3D' && late.errors === '{}', lo);
  }

  // ── lab ──
  if (section('lab')) {
    (0, eval)(slurp('tools/game/render-lab/00-core.js'));
    (0, eval)(slurp('tools/game/render-lab/70-landmarks.js'));
    var snap0 = JSON.stringify(G.renderFeatureSnapshot());
    G.RenderLabLandmarks.market(2024);
    var r = G.RenderLabLandmarks.counts('smoke'), snap1 = JSON.stringify(G.renderFeatureSnapshot());
    out('NOTE lab ' + r.text.replace(/\n/g, ' | '));
    check('lab: market(2024) faces the seed-2024 market with landmarkModels on; counts() sees no landmark model counters with the switch off and stall and tower faces with it on, then restores the switches',
      G.WORLD_SEED === 2024 && G.renderFeatureSnapshot().landmarkModels === true && Object.keys(r.legacy).length === 0 &&
      r.models.mdlStallFaces > 0 && r.models.mdlTowerFaces > 0 && snap1 === JSON.stringify(G.renderFeatureSnapshot()), r);
    var msg = G.RenderLabLandmarks.shrineAboveCave(555), labShrines = G.shrines.slice(), surface = G.playerUnderground;
    var msg2 = G.RenderLabLandmarks.shrineFromCave(), under = G.playerUnderground, added = labShrines[labShrines.length - 1];
    var support = G.getEntityRenderFloorZ(added), eyeZ = G.getCam3D().cameraZ;
    G.RenderLabLandmarks.restore();
    out('NOTE lab cave ' + msg + ' | ' + msg2 + ' | support ' + support.toFixed(2) + ' eye ' + eyeZ.toFixed(2));
    // The pose only: the gates from here are landmark_bounds.js's (stage J2).
    check('lab: shrineAboveCave(555) adds a shrine over a cave and stands on the surface; shrineFromCave() stands underground, below the shrine\'s surface support; restore() removes it',
      G.WORLD_SEED === 555 && !!added && added.chunkKey === 'lab' && surface === false && under === true && eyeZ < support &&
      G.shrines.indexOf(added) < 0, {msg: msg, msg2: msg2, support: support, eye: eyeZ});
    var cfg = G.RenderLabLandmarks.CONFIGS;
    check('lab: the timing configurations are Recommended with landmarkModels off (A) and on (B)',
      cfg.legacy.preset === 'recommended' && cfg.legacy.features.landmarkModels === false && cfg.models.features.landmarkModels === true &&
      snap0 !== null, cfg);
  }

  check('no console errors', H.errors.length === 0, H.errors.slice(0, 3));
  out('LANDMARK_MODELS_RESULT ' + (failed ? 'FAIL ' : 'PASS ') + checked + ' failed ' + failed);
}());
undefined;
