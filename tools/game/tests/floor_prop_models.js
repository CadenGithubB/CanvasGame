// Floor-prop models (integration stage I1: crate, barrel, boulder,
// stone_column, sand_pillar, mesa_boulder; I2: stalagmite, tree_stump,
// fallen_log, rock_spire, cave_rubble_pile, rock_arch; floorPropModels,
// default ON since I2) and drawFloorScatter3D's per-type dispatch, through
// the real MAIN manifest
// (render_host.js). Oracles are independent of the model code: the recipe
// dimensions written out here (the sprite unit s = 1500 x tierScale / 180);
// built faces compared in absolute world coordinates across real Endless
// window assemblies (assembleWindow) with the item's chunk at window slots
// 0, 1 and 2; yaw measured from the built crate body's face normals; an
// analytic planar slope (a two-triangle floorMesh, ground z = 0.25 x + 0.1 y)
// for the support; a real wall (drawWalls3D on a grid) for occlusion; the
// entityVisible3D arithmetic and vertex projections for the view cull; and
// paintFloorItem / drawFloorItemContactShadow spies for the sprite path.
// Depth comes from the production scene-depth code. Not a rasterizer or
// browser: no pixel colours, timing or compositing claims. Checks print
// PASS/FAIL and keep going, so a mutation names what it broke.
// Mutations (evaluated copies only; each anchor must match exactly once):
//   --seed-2pi          the yaw is seed x 2pi (integer Endless seeds collapse)
//   --window-relative   the key uses window-relative x/y (a slot changes it)
//   --centre-support    the support is the centre ground only (the base
//                       floats on a slope)
//   --no-sink           the base is not sunk 0.15 below the support
//   --sprites-too       the modelled types stay on the sprite path as well
//   --see-through-fog   the models keep the sprite's distance alpha
//   --tight-cull        the view cull ignores the model's reach
//   --i2-sprites        the six I2 types are not registered (they stay
//                       sprites)
//   --log-tilted        the fallen log's taper lifts its narrow end's
//                       bottom off the ground plane (no shift)
//   --support-first     the model loop queries support before the view cull
// --sections a,b runs only: spec, yaw, slots, support, occlusion, phase,
// sprites, cache, fade, cull, fallback, lab.
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
  var DECOR = 'src/07-decorations-lighting.js', MODELS = 'src/12-prop-models.js';
  var loaded = H.loadManifest(function (path, source) {
    if (path === MODELS) {
      source = swap(source, '--i2-sprites', /  \/\/ I2: the remaining floor props[\s\S]*?rock_arch: Object\.freeze\(\{name: 'RockArch', alt: null, build: _floorRockArchDef\}\)\n/,
        '');
      source = swap(source, '--log-tilted', "center: [0, zc], radius: R, taper: taper, shift: [0, -zc * (1 - taper)], z0: -L, z1: L,\n",
        "center: [0, zc], radius: R, taper: taper, z0: -L, z1: L,\n");
      source = swap(source, '--seed-2pi', '  var yaw = (key & 0xffffff) / 16777216 * Math.PI * 2;\n',
        '  var yaw = (Number(item.seed) || 0) * Math.PI * 2;\n');
      source = swap(source, '--window-relative', 'Math.round(item.x + wx), Math.round(item.y + wy), floorPropSeedKey(item.seed));\n',
        'Math.round(item.x), Math.round(item.y), floorPropSeedKey(item.seed));\n');
      return swap(source, '--centre-support', '    if (zz < z) z = zz;\n', '    void zz;\n');
    }
    if (path !== DECOR) return source;
    source = swap(source, '--no-sink', '      pose.z = support - FLOOR_PROP_SINK;\n', '      pose.z = support;\n');
    source = swap(source, '--sprites-too', '  if (_fsModels) _fsItems = floorScatterSprites(_fsItems);\n', '');
    source = swap(source, '--see-through-fog', '    ctx.globalAlpha = baseAlpha * prop.fade;   // range and spawn fade only (1 inside the range)\n',
      '    ctx.globalAlpha = baseAlpha * prop.fade * (1.0 - prop.dist / (viewDist * 0.75) * 0.65);\n');
    source = swap(source, '--support-first', '      if (!pose || fwd < -pose.reach || side * cosHalf - fwd * sinHalf > pose.reach) continue;\n      var support = floorPropSupportZ(item, pose);\n',
      '      var support = pose ? floorPropSupportZ(item, pose) : NaN;\n      if (!pose || fwd < -pose.reach || side * cosHalf - fwd * sinHalf > pose.reach) continue;\n');
    return swap(source, '--tight-cull', '      if (!pose || fwd < -pose.reach || side * cosHalf - fwd * sinHalf > pose.reach) continue;\n',
      '      if (!pose || fwd < 1 || side * cosHalf - fwd * sinHalf > 0) continue;\n');
  });
  check('real manifest loads with the floor-prop models and no console errors',
    loaded > 40 && typeof G.floorPropPose === 'function' && typeof G.drawFloorPropModels3D === 'function' && H.errors.length === 0,
    {loaded: loaded, errors: H.errors.slice(0, 3)});

  var I1_TYPES = ['crate', 'barrel', 'boulder', 'stone_column', 'sand_pillar', 'mesa_boulder'];
  var I2_TYPES = ['stalagmite', 'tree_stump', 'fallen_log', 'rock_spire', 'cave_rubble_pile', 'rock_arch'];
  var TYPES = I1_TYPES.concat(I2_TYPES);
  var TIER = {crate: 1.0, barrel: 1.0, boulder: 1.3, stone_column: 1.3, sand_pillar: 1.3, mesa_boulder: 1.3,
    stalagmite: 1.0, tree_stump: 1.3, fallen_log: 1.3, rock_spire: 1.3, cave_rubble_pile: 1.3, rock_arch: 1.3};
  function unit(type) { return 1500 * TIER[type] / 180; }   // the sprite's s in world units at projScale 180
  var W = 320, HT = 240, SINK = 0.15;
  function world() {
    G.cell = 12; G.gridW = G.gridH = 64; G.grid = new Uint8Array(64 * 64);
    G.floorMesh = null; G.gridCave = null; G.deepCaveRegions = []; G.deepCaveEntrances = [];
    G.windowOriginX = G.windowOriginY = 0; G.CANVAS_BASE_H = 240; G.viewDist = 1400; G.ENDLESS_MODE = false;
    G.canvas.width = W; G.canvas.height = HT; G.projScale = 180; G.MODE3D = true;
    G.cam = {x: 0, y: 0, z: -4, ang: 0, pitch: 0, fov: Math.PI / 2};   // cameraZ = 20
    G.applyRenderPreset('recommended'); G.setRenderFeatures({floorPropModels: true});
    G.FLOOR_ARTWORK_CACHE_ENABLED = false;
    G.updateDayNight(0);
  }
  world();
  function frame() { G.beginSceneDepthFrame(G.canvas.width, G.canvas.height); G.beginRenderFrameStats(); }
  function item(type, x, y, extra) {
    var it = {x: x, y: y, type: type, variant: 0, seed: 1234};
    for (var k in extra || {}) it[k] = extra[k];
    return it;
  }
  function build(inst) {
    var buf = G.createModelFaceBuffer(), faces = [];
    G.buildModelFaces(inst.model, inst, buf);
    for (var i = 0; i < buf.count; i++) {
      var f = buf.faces[i];
      faces.push({part: f.partName, role: f.role, normal: {x: f.normal.x, y: f.normal.y, z: f.normal.z},
        v: f.vertices.map(function (v) { return {x: v.x, y: v.y, z: v.z}; })});
    }
    return faces;
  }
  function posed(it) {
    var p = G.floorPropPose(it, null);
    if (p) p.z = 0;
    return p;
  }
  // Every drawWorldModel instance of one call (copied).
  function captureModels(fn) {
    var real = G.drawWorldModel, got = [];
    G.drawWorldModel = function (inst, model, C, phase, stats) {
      got.push({x: inst.x, y: inst.y, z: inst.z, scale: inst.scale, model: model, phase: phase,
        basis: {rightX: inst.basis.rightX, rightY: inst.basis.rightY, outX: inst.basis.outX, outY: inst.basis.outY, hand: inst.basis.hand}});
      return real.apply(this, arguments);
    };
    try { fn(); } finally { G.drawWorldModel = real; }
    return got;
  }
  // Sprite-path spies: paintFloorItem and the contact shadow, by type.
  function spriteCalls(fn) {
    var realPaint = G.paintFloorItem, realShadow = G.drawFloorItemContactShadow, calls = {paint: [], shadow: []};
    G.paintFloorItem = function (ctx, type, variant, seed, x, y, size) {
      calls.paint.push([type, variant, seed, Math.round(x * 1000), Math.round(y * 1000), size].join('|'));
      return realPaint.apply(this, arguments);
    };
    G.drawFloorItemContactShadow = function (ctx, type) { calls.shadow.push(type); return realShadow.apply(this, arguments); };
    try { fn(); } finally { G.paintFloorItem = realPaint; G.drawFloorItemContactShadow = realShadow; }
    return calls;
  }
  function modelled(type) { return TYPES.indexOf(type) >= 0; }
  function depthCopy() { return Array.prototype.slice.call(G._sceneDepthInv); }
  function written(before) {
    var a = G._sceneDepthInv, n = 0;
    for (var i = 0; i < a.length; i++) if (a[i] !== before[i]) n++;
    return n;
  }
  function near(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-9); }
  function startEndless(seed) {
    H.startEndless(seed);
    G.applyRenderPreset('recommended'); G.setRenderFeatures({floorPropModels: true});
    G.FLOOR_ARTWORK_CACHE_ENABLED = false;
    G.resetRenderInterpolation(); G.renderFrame();   // the camera takes the player's place
    G.floorScatter.forEach(function (it) { it.spawnMs = 0; });
  }

  // ── spec ──
  if (section('spec')) {
    var def = G.RENDER_FEATURE_DEFS.filter(function (d) { return d.key === 'floorPropModels'; })[0];
    // Restated in I2: registered default OFF in I1; flipped ON in I2 after
    // the I2 checks passed with it OFF (Legacy stays OFF).
    check('spec: floorPropModels is registered default ON since I2 (OFF in I1) and OFF in Legacy',
      !!def && def.type === 'bool' && def.default === true && def.legacy === false &&
      G.renderFeaturePreset('legacy').floorPropModels === false && G.renderFeaturePreset('recommended').floorPropModels === true, def);
    var ids = Object.keys(G.GAME_MATERIAL_COLORS), at = ids.indexOf('floorStone'), M = G.GAME_MATERIAL_COLORS;
    check('spec: floorStone, sandstone, mesaRock and barrelWood are appended after the chest and spawner materials with the sprite colours',
      at > ids.indexOf('chestEpic') && at > ids.indexOf('spawnerObelisk') && ids.indexOf('bone') < ids.indexOf('chestCommon') &&
      ids.slice(at, at + 4).join() === 'floorStone,sandstone,mesaRock,barrelWood' &&
      M.floorStone.base === '#5a5550' && M.floorStone.column === '#605850' && M.floorStone.broken === '#706860' &&
      M.sandstone.base === '#c4a060' && M.sandstone.cap === '#b89050' &&
      M.mesaRock.bottom === '#8b6040' && M.mesaRock.middle === '#9b7050' && M.mesaRock.top === '#a88060' &&
      M.barrelWood.base === M.floorPropWood.base, ids.slice(Math.max(0, at - 2), at + 5));
    var cr = M.caveRock;
    check('spec: caveRock is appended after barrelWood with the cave sprite colours (stalagmite, the spire\'s three swatches, the rubble mound and rocks, the arch); the stump and log use floorPropWood',
      ids.indexOf('caveRock') === at + 4 && !!cr && cr.stalagmite === '#6a5848' && cr.spire === '#5a5248' && cr.spireLit === '#685e52' &&
      cr.spireDark === '#4e4840' && cr.mound === '#504a44' && cr.rubble === '#5e5650' && cr.rubbleLit === '#686058' &&
      cr.rubbleDark === '#3e3a36' && cr.arch === '#585048' && Object.keys(cr).length === 9, {ids: ids.slice(at, at + 6), caveRock: cr});
    var FACES = {crate: [18, 24], barrel: [30, 30], boulder: [22, 22], stone_column: [22, 22], sand_pillar: [22, 22], mesa_boulder: [18, 18],
      stalagmite: [22, 22], tree_stump: [22, 22], fallen_log: [10, 10], rock_spire: [[14, 21], [14, 21]], cave_rubble_pile: [40, 40], rock_arch: [40, 40]};
    var ALT = {crate: 2, boulder: 1};
    var faceBad = [], seenShapes = {};
    TYPES.forEach(function (type) {
      seenShapes[type] = {};
      [0, 1].forEach(function (alt) {
        for (var s = 0; s < 400 && Object.keys(seenShapes[type]).length < 40; s++) {
          var p = posed(item(type, s * 3.7, s * 1.3, {seed: s, variant: alt ? (ALT[type] || 0) : 0}));
          if (!p) { faceBad.push({type: type, none: true}); break; }
          seenShapes[type][p.model.key] = true;
          var closed = p.model.parts.every(function (part) { return part.flags.closed; });
          if ([].concat(FACES[type][ALT[type] ? alt : 0]).indexOf(p.model.faceCount) < 0 || !closed || p.model.family !== 'floorProp' || !(p.scale > 0))
            faceBad.push({type: type, key: p.model.key, faces: p.model.faceCount, closed: closed});
        }
      });
    });
    var shapeCounts = TYPES.map(function (t) { return Object.keys(seenShapes[t]).length; });
    check('spec: every type has ready closed models (family floorProp) with the spec face counts: crate 18 (broken 24), barrel 30, boulder 22, stone column and sand pillar 22, mesa 18; 8 shapes per variant',
      faceBad.filter(function (b) { return I1_TYPES.indexOf(b.type) >= 0; }).length === 0 && shapeCounts.slice(0, 6).join() === '16,8,16,8,8,8',
      {bad: faceBad.slice(0, 3), shapes: shapeCounts});
    check('spec: the I2 types have ready closed models (family floorProp) with the spec face counts: stalagmite 22, tree stump 22, fallen log 10, rock spire 14 or 21 (two or three spires), cave rubble pile 40, rock arch 40; 8 shapes each',
      faceBad.filter(function (b) { return I2_TYPES.indexOf(b.type) >= 0; }).length === 0 && shapeCounts.slice(6).join() === '8,8,8,8,8,8',
      {bad: faceBad.filter(function (b) { return I2_TYPES.indexOf(b.type) >= 0; }).slice(0, 3), shapes: shapeCounts});
    // Extents of the canonical instance (yaw 0: out = +x, right = +y), in s units.
    function extents(type, seed, variant) {
      var p = posed(item(type, 0, 0, {seed: seed, variant: variant || 0}));
      p.basis = G.modelBasis(0, {}); p.x = p.y = 0;
      var s = unit(type), e = {parts: {}, roles: {}}, all = e.all = {r: [Infinity, -Infinity], o: [Infinity, -Infinity], z: [Infinity, -Infinity], rad: 0, baseRad: 0};
      build(p).forEach(function (f) {
        var pe = e.parts[f.part] || (e.parts[f.part] = {r: [Infinity, -Infinity], o: [Infinity, -Infinity], z: [Infinity, -Infinity]});
        e.roles[f.role] = (e.roles[f.role] || 0) + 1;
        f.v.forEach(function (v) {
          var r = v.y / s, o = v.x / s, z = v.z / s;   // yaw 0: right = +y, out = +x
          [pe, all].forEach(function (x) {
            x.r[0] = Math.min(x.r[0], r); x.r[1] = Math.max(x.r[1], r); x.o[0] = Math.min(x.o[0], o); x.o[1] = Math.max(x.o[1], o);
            x.z[0] = Math.min(x.z[0], z); x.z[1] = Math.max(x.z[1], z);
          });
          all.rad = Math.max(all.rad, Math.hypot(r, o));
          if (Math.abs(z) < 1e-9) all.baseRad = Math.max(all.baseRad, Math.hypot(r, o));
        });
      });
      e.scaleOk = near(p.scale, s, 1e-9);
      return e;
    }
    var dimBad = [];
    for (var seed = 0; seed < 64; seed += 3) {
      var c = extents('crate', seed), b = c.parts.body, belt = c.parts.belt, strap = c.parts.strap;
      if (!(c.scaleOk && near(b.r[0], -0.5, 1e-9) && near(b.r[1], 0.5, 1e-9) && near(b.o[1], 0.5, 1e-9) && b.z[0] === 0 && b.z[1] >= 0.92 - 1e-9 && b.z[1] <= 1 + 1e-9 &&
            near(belt.r[1], 0.53, 1e-9) && near(belt.z[0], 0.47 * b.z[1], 1e-9) && near(belt.z[1], 0.62 * b.z[1], 1e-9) &&
            near(strap.z[1], b.z[1] + 0.03, 1e-9) && near(strap.o[1], 0.53, 1e-9) && strap.r[1] <= 0.075 + 1e-9)) dimBad.push({crate: seed, c: c.parts});
      var cb = extents('crate', seed, 2);
      if (!(cb.roles.interior === 3 && !cb.parts.strap && cb.parts.side && near(cb.parts.side.r[0], 0.18, 1e-9))) dimBad.push({broken: seed, roles: cb.roles});
      var ba = extents('barrel', seed), body = ba.parts.body, hoop = ba.parts.hoopLow, hoop2 = ba.parts.hoopHigh;
      if (!(ba.scaleOk && body.z[1] >= 0.66 - 1e-9 && body.z[1] <= 0.74 + 1e-9 && near(ba.all.baseRad, 0.28, 1e-9) &&
            near(hoop.z[0], 0.17 * body.z[1], 1e-9) && near(hoop2.z[1], 0.83 * body.z[1], 1e-9) && near(ba.all.rad, 0.305, 1e-9) && ba.roles.head === 1))
        dimBad.push({barrel: seed, b: ba.parts, roles: ba.roles});
      var bo = extents('boulder', seed), mossy = extents('boulder', seed, 1);
      // R = 0.4-0.55 s; base ring 0.9 R, waist 1.1 R (x 0.88-1.12), apex 1.25 R x 0.9-1.05.
      if (!(bo.scaleOk && bo.all.z[0] === 0 && bo.all.z[1] >= 1.25 * 0.4 * 0.9 - 1e-9 && bo.all.z[1] <= 1.25 * 0.55 * 1.05 + 1e-9 &&
            bo.all.rad >= 1.1 * 0.4 * 0.88 - 1e-9 && bo.all.rad <= 1.1 * 0.55 * 1.12 + 1e-9 && bo.all.baseRad <= 0.9 * 0.55 * 1.12 + 1e-9 &&
            !bo.roles.moss && mossy.roles.moss === 2)) dimBad.push({boulder: seed, all: bo.all, moss: mossy.roles});
      [['stone_column', 0.14, 0.2, 0.8, 1.4, 0.15, 'column', 'broken'], ['sand_pillar', 0.16, 0.22, 0.75, 1.25, 0.1, 'base', 'cap']].forEach(function (spec) {
        var pe = extents(spec[0], seed);
        // Base half-width w (x 0.94-1.06), top ring h - 0-0.06, peak up to `rise` above h.
        if (!(pe.scaleOk && pe.all.baseRad >= spec[1] * 0.94 - 1e-9 && pe.all.baseRad <= spec[2] * 1.06 + 1e-9 &&
              pe.all.z[1] >= spec[3] + 0.6 * spec[5] - 1e-9 && pe.all.z[1] <= spec[4] + spec[5] + 1e-9 && pe.roles[spec[7]] === 6 && pe.roles[spec[6]] === 16))
          dimBad.push({pillar: spec[0], seed: seed, all: pe.all, roles: pe.roles});
      });
      var me = extents('mesa_boulder', seed), lo = me.parts.bottom, mid = me.parts.middle, top = me.parts.top, Hm = me.all.z[1], Wm = lo.r[1];
      if (!(me.scaleOk && Wm >= 0.45 - 1e-9 && Wm <= 0.6 + 1e-9 && Hm >= 0.3 - 1e-9 && Hm <= 0.45 + 1e-9 && near(lo.z[1], 0.4 * Hm, 1e-9) &&
            near(mid.z[1], 0.75 * Hm, 1e-9) && near(top.r[1] - top.r[0], 1.4 * Wm, 1e-9) && near(lo.r[1] - lo.r[0], 2 * Wm, 1e-9) &&
            mid.r[1] - mid.r[0] < lo.r[1] - lo.r[0] && top.r[1] - top.r[0] < mid.r[1] - mid.r[0]))
        dimBad.push({mesa: seed, parts: me.parts});
    }
    check('spec: the models keep the recipe proportions of s = 1500 x tierScale / 180 (crate s cube 0.92-1 s tall with belt and strap; broken crate cut faces interior; barrel r 0.28 s, 0.66-0.74 s, hoops; boulder R 0.4-0.55 s hull, mossy top; column and pillar tapered with a jagged cap; mesa three strata)',
      dimBad.length === 0, dimBad.slice(0, 2));
    // I2 recipe proportions, in s units of the canonical instance (yaw 0:
    // local r = world y, o = world x), per part.
    function local(type, seed) {
      var p = posed(item(type, 0, 0, {seed: seed}));
      p.basis = G.modelBasis(0, {}); p.x = p.y = 0;
      var s = unit(type), parts = {}, roles = {};
      build(p).forEach(function (f) {
        var part = parts[f.part] || (parts[f.part] = {faces: 0, v: [], roles: {}});
        part.faces++; part.roles[f.role] = (part.roles[f.role] || 0) + 1; roles[f.role] = (roles[f.role] || 0) + 1;
        f.v.forEach(function (v) { part.v.push([v.y / s, v.x / s, v.z / s]); });
      });
      return {parts: parts, roles: roles, names: Object.keys(parts), scaleOk: near(p.scale, s, 1e-9), faces: build(p)};
    }
    function rad(v, c) { return Math.hypot(v[0] - (c ? c[0] : 0), v[1] - (c ? c[1] : 0)); }
    function maxOf(list, fn) { return list.reduce(function (m, v) { return Math.max(m, fn(v)); }, -Infinity); }
    function minOf(list, fn) { return list.reduce(function (m, v) { return Math.min(m, fn(v)); }, Infinity); }
    function onGround(list) { return list.filter(function (v) { return Math.abs(v[2]) < 1e-9; }); }
    function centre(list) {
      var seen = {}, u = list.filter(function (v) { var k = v.map(function (x) { return Math.round(x * 1e9); }).join(); return seen[k] ? false : (seen[k] = true); });
      return [u.reduce(function (a, v) { return a + v[0]; }, 0) / u.length, u.reduce(function (a, v) { return a + v[1]; }, 0) / u.length, u.length];
    }
    // Upward vertical ray from a local point: how many triangles of a part it crosses.
    function crossings(part, faces, pt, s) {
      var n = 0;
      faces.forEach(function (f) {
        if (f.part !== part) return;
        var a = f.v.map(function (v) { return [v.y / s, v.x / s, v.z / s]; });
        for (var i = 1; i + 1 < a.length; i++) {
          var p0 = a[0], p1 = a[i], p2 = a[i + 1];
          var d = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
          if (Math.abs(d) < 1e-12) continue;
          var l1 = ((pt[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (pt[1] - p0[1])) / d;
          var l2 = ((p1[0] - p0[0]) * (pt[1] - p0[1]) - (pt[0] - p0[0]) * (p1[1] - p0[1])) / d;
          if (l1 < 0 || l2 < 0 || l1 + l2 > 1) continue;
          if (p0[2] + l1 * (p1[2] - p0[2]) + l2 * (p2[2] - p0[2]) > pt[2]) n++;
        }
      });
      return n;
    }
    // The sprite's quadratic arch curves: ends at +-end/endZ, control (0, controlZ).
    function arch(t, end, endZ, controlZ) { var u = 1 - t; return [(t * t - u * u) * end, (u * u + t * t) * endZ + 2 * t * u * controlZ]; }
    var dim2 = [], spireCounts = {}, missing = I2_TYPES.filter(function (t) { return !posed(item(t, 0, 0, {seed: 1})); });
    if (missing.length) dim2.push({missing: missing});
    for (var seed2 = 0; seed2 < 64 && !missing.length; seed2 += 3) {
      // Stalagmite: 6-point base ring of half-width w = 0.12-0.2 (x 0.94-1.06),
      // top ring at 0.3 of it, peak (the sprite's height) 0.9-1.4.
      var st = local('stalagmite', seed2), sv = st.parts.pillar.v, sBase = onGround(sv), sTop = maxOf(sv, function (v) { return v[2]; });
      var sRing = sv.filter(function (v) { return v[2] > 1e-9 && v[2] < sTop - 1e-9; });
      if (!(st.scaleOk && centre(sBase)[2] === 6 && minOf(sBase, rad) >= 0.12 * 0.94 - 1e-9 && maxOf(sBase, rad) <= 0.2 * 1.06 + 1e-9 &&
            sTop >= 0.9 - 1e-9 && sTop <= 1.4 + 1e-9 && near(maxOf(sRing, rad) / maxOf(sBase, rad), 0.3, 1e-9) && st.roles.stalagmite === 22))
        dim2.push({stalagmite: seed2, top: sTop, base: [minOf(sBase, rad), maxOf(sBase, rad)], ring: maxOf(sRing, rad), roles: st.roles});
      // Tree stump: trunk Wt = 0.2-0.28 at the base, 0.85 Wt at the top, H = 0.2-0.3;
      // three roots whose only vertex outside the trunk is a tip on the
      // ground at 1.3-1.45 Wt, reaching 0.35 H up the trunk.
      var ts = local('tree_stump', seed2), tv = ts.parts.trunk.v, Wt = maxOf(onGround(tv), rad), Ht = maxOf(tv, function (v) { return v[2]; });
      var topR = maxOf(tv.filter(function (v) { return near(v[2], Ht, 1e-9); }), rad), rootsOk = true;
      ['root0', 'root1', 'root2'].forEach(function (name) {
        var rv = ts.parts[name] ? ts.parts[name].v : [], outside = rv.filter(function (v) { return rad(v) > Wt + 1e-9; });
        var tipR = maxOf(rv, rad), up = maxOf(rv, function (v) { return v[2]; });
        if (!(ts.parts[name] && ts.parts[name].faces === 4 && outside.every(function (v) { return Math.abs(v[2]) < 1e-9 && near(rad(v), tipR, 1e-9); }) &&
              tipR >= 1.3 * Wt - 1e-9 && tipR <= 1.45 * Wt + 1e-9 && near(up, 0.35 * Ht, 1e-9))) rootsOk = false;
      });
      if (!(ts.scaleOk && Wt >= 0.2 - 1e-9 && Wt <= 0.28 + 1e-9 && Ht >= 0.2 - 1e-9 && Ht <= 0.3 + 1e-9 && near(topR, 0.85 * Wt, 1e-9) &&
            rootsOk && ts.roles.cut === 1 && ts.roles.shadow === 9 && ts.roles.deep === 12 && ts.names.length === 4))
        dim2.push({stump: seed2, Wt: Wt, H: Ht, top: topR, roots: rootsOk, roles: ts.roles});
      // Fallen log along r: half-length L = 0.5-0.7, radius R = 0.12-0.16 (an
      // octagon on a flat face: height 2 R cos 22.5 deg), narrowing to
      // 0.85-0.95 at the +r end; the flat bottom runs the whole length.
      var fl = local('fallen_log', seed2), lv = fl.parts.log.v, L = maxOf(lv, function (v) { return v[0]; }), flat = onGround(lv);
      var endH = function (sign) { return maxOf(lv.filter(function (v) { return near(v[0], sign * L, 1e-9); }), function (v) { return v[2]; }); };
      var R0 = endH(-1) / (2 * Math.cos(Math.PI / 8)), ratio = endH(1) / endH(-1);
      if (!(fl.scaleOk && near(minOf(lv, function (v) { return v[0]; }), -L, 1e-9) && L >= 0.5 - 1e-9 && L <= 0.7 + 1e-9 &&
            R0 >= 0.12 - 1e-9 && R0 <= 0.16 + 1e-9 && ratio >= 0.85 - 1e-9 && ratio <= 0.95 + 1e-9 && near(maxOf(lv, function (v) { return Math.abs(v[1]); }), R0 * Math.cos(Math.PI / 8), 1e-9) &&
            centre(flat)[2] === 4 && flat.filter(function (v) { return near(v[0], -L, 1e-9); }).length > 0 && flat.filter(function (v) { return near(v[0], L, 1e-9); }).length > 0 &&
            minOf(lv, function (v) { return v[2]; }) > -1e-9 && fl.roles.cut === 2 && fl.roles.shadow === 8))
        dim2.push({log: seed2, L: L, R: R0, ratio: ratio, flat: centre(flat), roles: fl.roles});
      // Rock spire: 2-3 spires of 5-point base rings (half-width 0.07-0.12)
      // 0.22 apart across r (row centre within +-0.05, each within +-0.06 out),
      // 0.5-1.2 tall, the top ring 0.2 of the base, the sprite's swatch order.
      var sp = local('rock_spire', seed2), names = sp.names.slice().sort(), spOk = names.length >= 2 && names.length <= 3, cs = [];
      spireCounts[names.length] = true;
      names.forEach(function (name, k) {
        var pv = sp.parts[name].v, base = onGround(pv), c = centre(base), h = maxOf(pv, function (v) { return v[2]; });
        var top = pv.filter(function (v) { return near(v[2], h, 1e-9); }), tc = centre(top), w = rad(base[0], c);
        cs.push(c);
        if (!(name === 'spire' + k && sp.parts[name].faces === 7 && c[2] === 5 && base.every(function (v) { return near(rad(v, c), w, 1e-9); }) &&
              w >= 0.07 - 1e-9 && w <= 0.12 + 1e-9 && h >= 0.5 - 1e-9 && h <= 1.2 + 1e-9 && tc[2] === 5 && near(rad(top[0], tc), 0.2 * w, 1e-9) &&
              Math.abs(c[1]) <= 0.06 + 1e-9 && sp.parts[name].roles[['spire', 'spireLit', 'spireDark'][k]] === 7)) spOk = false;
      });
      for (var ci = 1; ci < cs.length; ci++) if (!near(cs[ci][0] - cs[ci - 1][0], 0.22, 1e-9)) spOk = false;
      if (!(sp.scaleOk && spOk && Math.abs((cs[0][0] + cs[cs.length - 1][0]) / 2) <= 0.05 + 1e-9)) dim2.push({spire: seed2, centres: cs, names: names});
      // Cave rubble pile: a mound (base ring R = 0.5-0.56 x 0.88-1.12, apex
      // 0.34-0.42 high, 22 triangles) with three 6-face rocks in the rubble
      // swatches whose base corners are inside the mound (a vertical ray
      // from each crosses its surface once) and whose top centres are above it.
      var rp = local('cave_rubble_pile', seed2), mv = rp.parts.mound.v, mBase = onGround(mv), su = unit('cave_rubble_pile'), rpOk = true;
      ['rock0', 'rock1', 'rock2'].forEach(function (name, k) {
        var part = rp.parts[name], rv = part ? part.v : [], z0 = minOf(rv, function (v) { return v[2]; }), z1 = maxOf(rv, function (v) { return v[2]; });
        var low = rv.filter(function (v) { return near(v[2], z0, 1e-9); }), tc = centre(rv.filter(function (v) { return near(v[2], z1, 1e-9); }));
        if (!(part && part.faces === 6 && part.roles[['rubble', 'rubbleLit', 'rubbleDark'][k]] === 6 &&
              low.every(function (v) { return crossings('mound', rp.faces, v, su) === 1; }) && crossings('mound', rp.faces, [tc[0], tc[1], z1], su) === 0)) rpOk = false;
      });
      if (!(rp.scaleOk && rpOk && centre(mBase)[2] === 6 && minOf(mBase, rad) >= 0.5 * 0.88 - 1e-9 && maxOf(mBase, rad) <= 0.56 * 1.12 + 1e-9 &&
            maxOf(mv, function (v) { return v[2]; }) >= 0.34 - 1e-9 && maxOf(mv, function (v) { return v[2]; }) <= 0.42 + 1e-9 &&
            rp.parts.mound.faces === 22 && rp.roles.mound === 22 && rp.names.length === 4))
        dim2.push({rubble: seed2, ok: rpOk, base: [minOf(mBase, rad), maxOf(mBase, rad)], roles: rp.roles});
      // Rock arch: pillars 0.16 wide at +-0.55, 0.4 A tall (A = 0.5-0.8); the
      // span between the sprite's curves sampled at thirds (top 2/3 A, ends
      // 0.3 A), open underneath (nothing between the pillars below 0.5 A),
      // 0.02 shallower than the pillars (span half-depth 0.08-0.11).
      var ra = local('rock_arch', seed2), pl = ra.parts.pillarLeft.v, pr = ra.parts.pillarRight.v, spn = ra.parts.span.v;
      var ztop = maxOf(pl, function (v) { return v[2]; }), A = ztop / 0.4, all = pl.concat(pr, spn);
      var dSpan = maxOf(spn, function (v) { return Math.abs(v[1]); }), dPil = maxOf(pl, function (v) { return Math.abs(v[1]); });
      var third = arch(1 / 3, 0.65, 0.4 * A, A), innerThird = arch(1 / 3, 0.61, 0.3 * A, 0.75 * A);
      if (!(ra.scaleOk && A >= 0.5 - 1e-9 && A <= 0.8 + 1e-9 && near(maxOf(pr, function (v) { return v[2]; }), ztop, 1e-9) &&
            near(minOf(pl, function (v) { return v[0]; }), -0.63, 1e-9) && near(maxOf(pl, function (v) { return v[0]; }), -0.47, 1e-9) &&
            near(minOf(pr, function (v) { return v[0]; }), 0.47, 1e-9) && near(maxOf(pr, function (v) { return v[0]; }), 0.63, 1e-9) &&
            near(minOf(spn, function (v) { return v[0]; }), -0.65, 1e-9) && near(maxOf(spn, function (v) { return v[0]; }), 0.65, 1e-9) &&
            near(maxOf(spn, function (v) { return v[2]; }), third[1], 1e-9) && near(minOf(spn, function (v) { return v[2]; }), 0.3 * A, 1e-9) &&
            spn.some(function (v) { return near(v[0], innerThird[0], 1e-9) && near(v[2], innerThird[1], 1e-9); }) &&
            all.every(function (v) { return Math.abs(v[0]) >= 0.47 - 1e-9 || v[2] >= innerThird[1] - 1e-9; }) &&
            dSpan >= 0.08 - 1e-9 && dSpan <= 0.11 + 1e-9 && near(dPil, dSpan + 0.02, 1e-9) && ra.roles.arch === 40 && ra.parts.span.faces === 28))
        dim2.push({arch: seed2, A: A, top: maxOf(spn, function (v) { return v[2]; }), third: third, depth: [dSpan, dPil], roles: ra.roles});
    }
    check('spec: the I2 models keep the recipe proportions of s (stalagmite tapered to 0.3 with a tip, 0.9-1.4 s; stump with a cut top and three ground roots; log with a flat bottom along its length; two or three spires 0.22 s apart; rubble mound with its rocks set in; arch pillars and a span along the sprite\'s curves, open underneath)',
      dim2.length === 0 && spireCounts[2] && spireCounts[3], {bad: dim2.slice(0, 2), spires: Object.keys(spireCounts)});
  }

  // ── yaw: 100 Endless crates ──
  if (section('yaw')) {
    startEndless(2024);
    var crates = G.floorScatter.filter(function (it) { return it.type === 'crate' && it.variant !== 2; }).slice(0, 100);
    var buckets = {}, heights = {};
    crates.forEach(function (it) {
      var p = posed(it), faces = build(p), body = faces.filter(function (f) { return f.part === 'body'; });
      var side = body.filter(function (f) { return Math.abs(f.normal.z) < 1e-9; })[0];
      var a = Math.atan2(side.normal.y, side.normal.x), q = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
      buckets[Math.min(15, Math.floor(q / (Math.PI / 2) * 16))] = true;
      var zs = body.reduce(function (m, f) { return f.v.reduce(function (n, v) { return Math.max(n, v.z); }, m); }, -Infinity);
      heights[Math.round(zs * 1e6)] = true;
    });
    var nb = Object.keys(buckets).length;
    out('NOTE yaw buckets ' + nb + '/16 over ' + crates.length + ' crates (body side normals mod 90 deg); ' + Object.keys(heights).length + ' distinct heights');
    check('yaw: 100 Endless crates (seed 2024) turn into at least 8 of 16 buckets of their body faces\' direction mod 90 degrees',
      crates.length === 100 && nb >= 8, {crates: crates.length, buckets: Object.keys(buckets)});
    check('yaw: their shapes vary too (at least 6 distinct crate heights)', Object.keys(heights).length >= 6, Object.keys(heights).length);
  }

  // ── slots: a chunk's props at window slots 0, 1 and 2 ──
  if (section('slots')) {
    var slotBad = [], slotInfo = [];
    [2024, 7].forEach(function (seed) {
      startEndless(seed);
      // The chunk of the spawn window's middle 3 x 3 with the most modelled props.
      var half = Math.floor(G.WINDOW_CHUNKS / 2), kx = 0, ky = 0, most = -1, per = [];
      for (var cy = G.windowCY + half - 1; cy <= G.windowCY + half + 1; cy++) {
        for (var cx = G.windowCX + half - 1; cx <= G.windowCX + half + 1; cx++) {
          var n = G.chunks[cx + ',' + cy].floorScatter.filter(function (it) { return modelled(it.type); }).length;
          if (n > most) { most = n; kx = cx; ky = cy; }
        }
      }
      [0, 1, 2].forEach(function (slot) {
        G.assembleWindow(kx + half - slot, ky + half - slot);
        var ox = G.windowOriginX, oy = G.windowOriginY, span = G.WINDOW_CHUNKS * G.CHUNK_SIZE, rec = {};
        if (ox !== (kx - slot) * G.CHUNK_SIZE || oy !== (ky - slot) * G.CHUNK_SIZE) slotBad.push({seed: seed, slot: slot, origin: [ox, oy]});
        G.floorScatter.forEach(function (it) {
          var ax = it.x + ox, ay = it.y + oy;
          if (!modelled(it.type) || Math.floor(ax / G.CHUNK_SIZE) !== kx || Math.floor(ay / G.CHUNK_SIZE) !== ky) return;
          var p = G.floorPropPose(it, null), interior = it.x > 24 && it.y > 24 && it.x < span - 24 && it.y < span - 24;
          p.z = interior ? G.floorPropSupportZ(it, p) - SINK : 0;
          rec[Math.round(ax * 1000) + ',' + Math.round(ay * 1000) + ',' + it.seed] = {type: it.type, key: p.model.key, interior: interior,
            v: build(p).map(function (f) { return f.v.map(function (v) { return [v.x + ox, v.y + oy, v.z]; }); })};
        });
        per.push(rec);
      });
      var keys = Object.keys(per[0]), types = {}, supported = 0;
      keys.forEach(function (k) {
        types[per[0][k].type] = true;
        for (var s = 1; s < 3; s++) {
          var a = per[0][k], b = per[s][k];
          if (!b || a.key !== b.key) { slotBad.push({seed: seed, item: k, slot: s, keys: [a.key, b && b.key]}); continue; }
          var both = a.interior && b.interior;
          if (both && s === 2) supported++;
          a.v.forEach(function (face, fi) {
            face.forEach(function (v, vi) {
              var w = b.v[fi][vi];
              if (!near(v[0], w[0], 1e-6) || !near(v[1], w[1], 1e-6) || (both && !near(v[2], w[2], 1e-6)))
                slotBad.push({seed: seed, item: k, slot: s, face: fi, a: v, b: w});
            });
          });
        }
      });
      slotInfo.push({seed: seed, chunk: [kx, ky], items: keys.length, same: [Object.keys(per[1]).length, Object.keys(per[2]).length],
        types: Object.keys(types), supported: supported});
      if (keys.length < 5 || Object.keys(per[1]).length !== keys.length || Object.keys(per[2]).length !== keys.length) slotBad.push({seed: seed, setup: slotInfo[slotInfo.length - 1]});
    });
    out('NOTE slots ' + JSON.stringify(slotInfo));
    check('slots: a chunk\'s modelled props build identical world faces (same model, yaw and shape; the same support where the footprint is inside every window) with the chunk at window slots 0, 1 and 2 (Endless 2024 and 7)',
      slotBad.length === 0 && slotInfo.every(function (s) { return s.supported > 0; }), slotBad.slice(0, 3));
  }

  // ── support: flat and sloped ground ──
  if (section('support')) {
    world();
    // A two-triangle mesh over [0, 200]^2 whose corners lie on one plane:
    // render z = 25 x (2 x/200 + 0.8 y/200) = 0.25 x + 0.1 y everywhere.
    function slopeMesh() {
      return {w: 2, h: 2, gridSize: 200, layerCount: [1, 1, 1, 1], surfaceH: [0, 2, 0.8, 2.8], ceilAboveMask: [0, 0, 0, 0],
        l0Type: [1, 1, 1, 1], l0Meta: [1, 1, 1, 1], l0TopZ: [0, 2, 0.8, 2.8]};
    }
    function ground(x, y) { return 0.25 * x + 0.1 * y; }
    function supportCase(sloped) {
      G.floorMesh = sloped ? slopeMesh() : null;
      var list = [], bad = [], lowest = [], flatBad = [];
      TYPES.forEach(function (type, ti) {
        // Restated in I2: twelve types, 8 each, on a 20 x 14 grid inside the
        // mesh (x 30-170, y 20-174), seen from 150+ u back so all are in view.
        for (var k = 0; k < 8; k++) list.push(item(type, 30 + k * 20, 20 + ti * 14, {seed: 97 * ti + 13 * k, variant: k & 1 ? 2 : 1}));
      });
      G.floorScatter = list;
      G.cam = {x: -120, y: 100, z: 60, ang: 0, pitch: 0, fov: Math.PI / 2};
      frame();
      var got = captureModels(function () { G.drawFloorScatter3D('opaque'); });
      got.forEach(function (inst) {
        var faces = build(inst), zmin = Infinity;
        faces.forEach(function (f) { f.v.forEach(function (v) { zmin = Math.min(zmin, v.z); }); });
        var gap = Infinity, float = -Infinity;
        faces.forEach(function (f) {
          f.v.forEach(function (v) {
            if (Math.abs(v.z - zmin) > 1e-9) return;
            var g = sloped ? ground(v.x, v.y) : 0;
            gap = Math.min(gap, g - v.z); float = Math.max(float, v.z - g);
          });
        });
        lowest.push(gap);
        if (float > 0.2 || gap < SINK - 1e-6 || gap > 0.2) bad.push({key: inst.model.key, float: float, gap: gap});
        if (!sloped && !near(gap, SINK, 1e-9)) flatBad.push({key: inst.model.key, gap: gap});
      });
      return {n: got.length, bad: bad, flatBad: flatBad, gapMax: Math.max.apply(null, lowest)};
    }
    var fixtureOk = (G.floorMesh = slopeMesh(), near(G.getEntityRenderFloorZ({x: 150, y: 40}), ground(150, 40), 1e-9) &&
      near(G.getEntityRenderFloorZ({x: 30, y: 170}), ground(30, 170), 1e-9));
    if (!fixtureOk) out('SETUP the slope fixture is not the plane 0.25 x + 0.1 y');
    var flat = supportCase(false), slope = supportCase(true);
    out('NOTE support flat ' + flat.n + ' props, slope ' + slope.n + ' props, largest lowest-point gap ' + slope.gapMax.toFixed(4));
    check('support: on flat ground every modelled prop\'s base is exactly 0.15 under the ground', flat.n === 96 && flat.bad.length === 0 && flat.flatBad.length === 0, flat);
    check('support: on a slope (ground z = 0.25 x + 0.1 y) no base vertex is more than 0.2 above the ground and the base is within 0.2 of the ground at its lowest point (sunk 0.15 there)',
      fixtureOk && slope.n === 96 && slope.bad.length === 0, slope.bad.slice(0, 3));
    world();
  }

  // ── occlusion: a real wall (drawWalls3D) ──
  if (section('occlusion')) {
    function wallWorld(wall) {
      world();
      G.wallHeights = new Float32Array(64 * 64); G.wallFaceBase = G.wallMaxTopZ = G.wallCapZ = null;
      G.wallColorR = new Uint8Array(64 * 64).fill(150); G.wallColorG = new Uint8Array(64 * 64).fill(120); G.wallColorB = new Uint8Array(64 * 64).fill(90);
      if (wall) for (var gy = 20; gy < 44; gy++) { G.grid[gy * 64 + 20] = 1; G.wallHeights[gy * 64 + 20] = 1; }
      G.cam = {x: 100, y: 384, z: -4, ang: 0, pitch: 0, fov: Math.PI / 2};
      // The crate on the view axis, the other eleven beside it within the wall's span.
      G.floorScatter = TYPES.map(function (type, i) { return item(type, 320, 384 + [0, -22, 22, -44, 44, 66, -66, 88, -88, 110, -110, 132][i], {seed: 31 + i}); });
      frame(); G.drawWalls3D();
    }
    function occlusionRun(wall, early) {
      wallWorld(wall);
      G.setRenderFeatures({modelEarlyReject: early});
      // Row 133 crosses the crate (rows ~130-136 at 220 u) and the wall.
      var fills = [], realFill = G.fillSceneDepthPolygon, before = depthCopy(), wallDepth = G.sceneDepthAt(W / 2, 133);
      G.fillSceneDepthPolygon = function () { var r = realFill.apply(this, arguments); fills.push(r); return r; };
      try { G.drawFloorScatter3D('opaque'); } finally { G.fillSceneDepthPolygon = realFill; G.setRenderFeatures({modelEarlyReject: true}); }
      var f = G.getRenderFeatureStats().frame;
      return {wallDepth: wallDepth, fills: fills.length, painted: fills.filter(function (r) { return r > 0; }).length, written: written(before),
        faces: f.mdlFloorPropFaces || 0, culled: f.mdlFloorPropCulled || 0, drawn: f.mdlFloorPropDrawn || 0, rejected: f.mdlFloorPropRejected || 0,
        centre: G.sceneDepthAt(W / 2, 133)};
    }
    var hidOff = occlusionRun(true, false), hidOn = occlusionRun(true, true), open = occlusionRun(false, true);
    out('NOTE occlusion ' + JSON.stringify({hidden: hidOff, early: hidOn, open: open}));
    check('occlusion (modelEarlyReject off): behind a real wall (drawWalls3D, 140 u ahead) every emitted face of the twelve props is depth-tested and rejected; nothing paints and no depth is written',
      near(hidOff.wallDepth, 140, 0.01) && hidOff.faces > 200 && hidOff.fills === hidOff.faces - hidOff.culled && hidOff.painted === 0 && hidOff.written === 0 && hidOff.drawn === 0, hidOff);
    check('occlusion (modelEarlyReject on): behind the same wall all twelve props are rejected before building faces',
      hidOn.rejected === 12 && hidOn.faces === 0 && hidOn.written === 0, hidOn);
    check('occlusion: without the wall the same props draw and write depth; the crate row\'s centre pixel is within its reach of its 220 u distance',
      open.drawn > 10 && open.written > 100 && open.centre > 220 - 8 && open.centre < 220 + 8 && !(open.wallDepth < 600), open);
  }

  // ── phase ──
  if (section('phase')) {
    world();
    G.floorScatter = [item('crate', 80, -10, {seed: 5}), item('bones', 80, 10, {seed: 0.4}), item('boulder', 110, 25, {seed: 9, variant: 1}),
      item('rock_pile', 70, 0, {seed: 0.7}), item('mesa_boulder', 130, -30, {seed: 3}), item('rock_arch', 150, 40, {seed: 0.31})];
    function phaseRun(on, phase) {
      G.setRenderFeatures({floorPropModels: on});
      frame();
      var before = depthCopy(), realBoard = G.withSceneDepthBillboard, boards = 0, rec, calls;
      G.withSceneDepthBillboard = function () { boards++; return realBoard.apply(this, arguments); };
      try {
        calls = spriteCalls(function () { H.record(true); G.drawFloorScatter3D(phase); rec = H.record(false); });
      } finally { G.withSceneDepthBillboard = realBoard; }
      var f = G.getRenderFeatureStats().frame;
      return {types: calls.paint.map(function (c) { return c.split('|')[0]; }).sort().join(), shadows: calls.shadow.sort().join(),
        boards: boards, written: written(before), faces: f.mdlFloorPropFaces || 0, instances: f.mdlFloorPropInstances || 0, entries: rec.entries, hash: rec.hash()};
    }
    var opq = phaseRun(true, 'opaque'), ovl = phaseRun(true, 'overlay'), both = phaseRun(true);
    var offOpq = phaseRun(false, 'opaque'), offOvl = phaseRun(false, 'overlay');
    check('phase: with floorPropModels on the opaque phase draws the four modelled props (a fixed-level rock arch included) into depth and no sprite, billboard or contact shadow',
      opq.written > 100 && opq.faces > 0 && opq.instances === 4 && opq.types === '' && opq.shadows === '' && opq.boards === 0, opq);
    check('phase: the overlay phase draws only the unmodelled sprites (bones, rock_pile) and no model face or depth',
      ovl.types === 'bones,rock_pile' && ovl.shadows === 'bones,rock_pile' && ovl.boards === 2 && ovl.faces === 0 && ovl.written === 0, ovl);
    check('phase: no argument draws the opaque phase then the overlay phase',
      both.entries === opq.entries + ovl.entries && both.faces === opq.faces && both.types === ovl.types && both.written === opq.written, {both: both, opq: opq, ovl: ovl});
    check('phase: with floorPropModels off the opaque phase records nothing and the overlay phase draws every item as a sprite',
      offOpq.entries === 0 && offOpq.written === 0 && offOvl.types === 'bones,boulder,crate,mesa_boulder,rock_arch,rock_pile' &&
      offOvl.shadows === 'bones,boulder,crate,mesa_boulder,rock_arch,rock_pile' && offOvl.faces === 0, {opq: offOpq, ovl: offOvl});
    G.setRenderFeatures({floorPropModels: true});
  }

  // ── sprites: the sprite path on real Endless windows ──
  if (section('sprites')) {
    var sprBad = [], tallies = {offModelled: 0, onModelled: 0, onShadow: 0, sprites: 0, models: 0, legacyEqual: 0, views: 0, oracleBad: 0};
    [7, 2024].forEach(function (seed) {
      startEndless(seed);
      for (var y = 0; y < 8; y++) {
        G.cam.ang = y * Math.PI / 4;
        // The legacy sprite contract: an item within [3, 0.75 viewDist] and in
        // front (fwd >= 1) paints once when its sprite bounds (size =
        // clamp(floor(1500 x tierScale / fwd), 6, 70), +-(2 size + 2) round
        // the ground point) reach the screen; bounds within 1 px of an edge
        // are skipped as ambiguous.
        var C = G.getCam3D(), maxDist = G.viewDist * 0.75, expect = {}, skip = {};
        G.floorScatter.forEach(function (it) {
          var dx = it.x - G.cam.x, dy = it.y - G.cam.y, d = Math.max(1, Math.hypot(dx, dy)), fwd = dx * C.cosAng + dy * C.sinAng;
          var z = G.getEntityRenderFloorZ(it);
          if (!(d <= maxDist && d >= 3 && fwd >= 1 && Number.isFinite(z))) return;
          var sx = Math.floor(((dy * C.cosAng - dx * C.sinAng) / fwd * C.invTanHalf * 0.5 + 0.5) * C.w);
          var sy = Math.floor(C.horizonY + (C.cameraZ - z) / fwd * G.projScale);
          var size = Math.max(6, Math.min(70, Math.floor(1500 * G.getScale3D(G.FLOOR_ITEM_TIER[it.type] || 'medium') / fwd)));
          var x0 = sx - size * 2 - 2, y0 = sy - size * 2 - 2, x1 = x0 + size * 4 + 4, y1 = y0 + size * 4 + 4;
          if (x1 > 1 && x0 < C.w - 1 && y1 > 1 && y0 < C.h - 1) expect[it.type] = (expect[it.type] || 0) + 1;
          else if (!(x1 <= 0 || x0 >= C.w || y1 <= 0 || y0 >= C.h)) skip[it.type] = (skip[it.type] || 0) + 1;
        });
        G.setRenderFeatures({floorPropModels: false}); frame();
        var off = spriteCalls(function () { G.drawFloorScatter3D(); });
        G.applyRenderPreset('legacy'); G.FLOOR_ARTWORK_CACHE_ENABLED = false; frame();
        var legacyRec, offRec;
        H.record(true); G.drawFloorScatter3D(); legacyRec = H.record(false).hash();
        G.applyRenderPreset('recommended'); G.setRenderFeatures({floorPropModels: false}); frame();
        H.record(true); G.drawFloorScatter3D(); offRec = H.record(false).hash();
        G.setRenderFeatures({floorPropModels: true}); frame();
        var on = null, models = captureModels(function () { on = spriteCalls(function () { G.drawFloorScatter3D(); }); });
        var offByType = {}, offRest = off.paint.filter(function (c) { var t = c.split('|')[0]; offByType[t] = (offByType[t] || 0) + 1; return !modelled(t); });
        Object.keys(expect).concat(Object.keys(offByType)).forEach(function (t) {
          var got = offByType[t] || 0, want = expect[t] || 0;
          if (got < want || got > want + (skip[t] || 0)) { tallies.oracleBad++; sprBad.push({seed: seed, y: y, type: t, expect: want, skip: skip[t] || 0, got: got}); }
        });
        var onModelled = on.paint.filter(function (c) { return modelled(c.split('|')[0]); }).length;
        tallies.offModelled += off.paint.length - offRest.length; tallies.onModelled += onModelled;
        tallies.onShadow += on.shadow.filter(modelled).length; tallies.sprites += on.paint.length; tallies.models += models.length;
        tallies.views++; if (legacyRec === offRec) tallies.legacyEqual++;
        if (onModelled || on.shadow.some(modelled) || on.paint.join('\n') !== offRest.join('\n'))
          sprBad.push({seed: seed, y: y, onModelled: onModelled, on: on.paint.length, offRest: offRest.length});
      }
    });
    out('NOTE sprites ' + JSON.stringify(tallies));
    check('sprites: with floorPropModels off paintFloorItem is called once per item entityVisible3D keeps (every type, modelled ones included), and the scatter draw records the same commands as under Legacy',
      tallies.oracleBad === 0 && tallies.offModelled > 50 && tallies.legacyEqual === tallies.views, {tallies: tallies, bad: sprBad.filter(function (b) { return b.expect !== undefined; }).slice(0, 3)});
    check('sprites: with it on the modelled types make zero paintFloorItem and contact-shadow calls, and every other type\'s calls are unchanged (same items, order and arguments), on Endless 7 and 2024 at 8 yaws',
      sprBad.filter(function (b) { return b.expect === undefined; }).length === 0 && tallies.onModelled === 0 && tallies.onShadow === 0 && tallies.models > 20 && tallies.sprites > 100,
      {tallies: tallies, bad: sprBad.slice(0, 3)});
  }

  // ── cache: decorAnchorCache on (cold, warm) vs off ──
  if (section('cache')) {
    startEndless(7);
    var cacheBad = [], warmStats = [], coldTerr = 0;
    function opaqueRecord() {
      frame(); H.record(true); G.drawFloorScatter3D('opaque');
      var rec = H.record(false), a = G._sceneDepthInv, h = 0x811c9dc5;
      for (var i = 0; i < a.length; i++) h = Math.imul(h ^ Math.round(a[i] * 1e9), 0x01000193);
      return {hash: rec.hash(), entries: rec.entries, depth: h >>> 0, stats: G.getRenderFeatureStats().frame};
    }
    for (var y = 0; y < 8; y++) {
      G.cam.ang = y * Math.PI / 4;
      G.setRenderFeatures({decorAnchorCache: false}); var live = opaqueRecord();
      G.setRenderFeatures({decorAnchorCache: true}); G.noteWorldGeometryEdit();
      var cold = opaqueRecord(), warm = opaqueRecord();
      coldTerr += cold.stats.terrFloorProp || 0;
      warmStats.push([warm.stats.terrFloorProp || 0, warm.stats.hitFloorProp || 0, warm.stats.mdlFloorPropInstances || 0]);
      if (live.hash !== cold.hash || live.hash !== warm.hash || live.depth !== cold.depth || live.depth !== warm.depth || live.entries < 10)
        cacheBad.push({y: y, live: live.hash, cold: cold.hash, warm: warm.hash, entries: live.entries});
    }
    out('NOTE cache warm [terr, hit, instances] ' + JSON.stringify(warmStats) + ' cold terr ' + coldTerr);
    check('cache: with decorAnchorCache on (cold and warm) the models draw the same commands and depth as with it off (Endless 7, 8 yaws)',
      cacheBad.length === 0, cacheBad.slice(0, 2));
    check('cache: the warm frame makes no support query (every drawn prop is a cache hit); after noteWorldGeometryEdit() the next frame queries again',
      coldTerr > 0 && warmStats.every(function (s) { return s[0] === 0 && s[1] >= s[2]; }) && warmStats.some(function (s) { return s[2] > 0; }), {warm: warmStats, cold: coldTerr});
    // I2 (the default flip): range and view before any support query, the K
    // rule for this loop. Cold, only the props the loop then draws compute
    // support, and every terrain query of the loop is inside floorPropSupportZ.
    var queryBad = [], inRangeTotal = 0, supportTotal = 0, strayTotal = 0;
    for (var y2 = 0; y2 < 8; y2++) {
      G.cam.ang = y2 * Math.PI / 4;
      G.setRenderFeatures({decorAnchorCache: true}); G.noteWorldGeometryEdit(); frame();
      var realSup = G.floorPropSupportZ, realZ = G.getEntityRenderFloorZ, depth = 0, supported = [], stray = 0, drawnItems;
      G.floorPropSupportZ = function (it) { supported.push(it); depth++; try { return realSup.apply(this, arguments); } finally { depth--; } };
      G.getEntityRenderFloorZ = function () { if (!depth) stray++; return realZ.apply(this, arguments); };
      try { drawnItems = captureModels(function () { G.drawFloorPropModels3D(); }); } finally { G.floorPropSupportZ = realSup; G.getEntityRenderFloorZ = realZ; }
      var maxD = G.viewDist * 0.75, inRange = G.floorScatter.filter(function (it) {
        var d = Math.hypot(it.x - G.cam.x, it.y - G.cam.y);
        return modelled(it.type) && d >= 3 && d <= maxD;
      });
      var drawnKeys = drawnItems.map(function (g) { return g.x + ',' + g.y; }).sort().join(';');
      var supKeys = supported.map(function (it) { return it.x + ',' + it.y; }).sort().join(';');
      inRangeTotal += inRange.length; supportTotal += supported.length; strayTotal += stray;
      if (drawnKeys !== supKeys || stray || supported.some(function (it) { return inRange.indexOf(it) < 0; }))
        queryBad.push({y: y2, drawn: drawnItems.length, supported: supported.length, stray: stray});
    }
    out('NOTE cache queries: ' + supportTotal + ' props computed support, ' + inRangeTotal + ' modelled props in range, over 8 yaws');
    check('cache: range and view come before any support query: cold, exactly the props the loop draws compute support (fewer than the modelled props in range) and every terrain query of the loop is inside floorPropSupportZ (Endless 7, 8 yaws)',
      queryBad.length === 0 && supportTotal > 0 && supportTotal < inRangeTotal && strayTotal === 0, queryBad.slice(0, 3));
  }

  // ── fade ──
  if (section('fade')) {
    world();
    var maxDist = G.viewDist * 0.75, fadeStart = maxDist * 0.8, now = G.gameTimeNow();
    function alphas(list) {
      G.floorScatter = list; frame();
      var got = [], realFill = G.fillSceneDepthPolygon;
      G.fillSceneDepthPolygon = function () { got.push(G.ctx.globalAlpha); return realFill.apply(this, arguments); };
      try { G.drawFloorScatter3D('opaque'); } finally { G.fillSceneDepthPolygon = realFill; }
      return got;
    }
    var inside = alphas([item('crate', 150, 0, {seed: 3}), item('boulder', 400, 40, {seed: 4}), item('mesa_boulder', 700, -60, {seed: 5})]);
    check('fade: inside the range every model fill is at globalAlpha 1 (colour fog, no see-through distance alpha)',
      inside.length > 5 && inside.every(function (a) { return a === 1; }), inside.slice(0, 6));
    var d = fadeStart + (maxDist - fadeStart) * 0.5, far = alphas([item('crate', d, 0, {seed: 3})]);
    var spawn = alphas([item('crate', 150, 0, {seed: 3, spawnMs: now - 250})]);
    check('fade: in the last 20% of the range only the range fade applies (0.5 half-way), and a window spawn fades in over 500 ms (0.5 at 250 ms)',
      far.length > 0 && far.every(function (a) { return near(a, 0.5, 1e-9); }) && spawn.length > 0 && spawn.every(function (a) { return near(a, 0.5, 1e-4); }),
      {far: far.slice(0, 3), spawn: spawn.slice(0, 3)});
  }

  // ── cull: nothing with a vertex on screen is dropped ──
  if (section('cull')) {
    var cullBad = [], straddle = 0, drawnTotal = 0;
    [7, 2024].forEach(function (seed) {
      startEndless(seed);
      for (var y = 0; y < 16; y++) {
        G.cam.ang = y * Math.PI / 8;
        var C = G.getCam3D(), maxDist = G.viewDist * 0.75;
        frame();
        var got = captureModels(function () { G.drawFloorScatter3D('opaque'); }), drawnAt = {};
        got.forEach(function (g) { drawnAt[g.x + ',' + g.y] = true; });
        drawnTotal += got.length;
        G.floorScatter.forEach(function (it) {
          if (!modelled(it.type)) return;
          var d = Math.hypot(it.x - G.cam.x, it.y - G.cam.y);
          if (d > maxDist || d < 3) return;
          var p = G.floorPropPose(it, null), sup = G.floorPropSupportZ(it, p);
          if (!Number.isFinite(sup)) return;
          p.z = sup - SINK;
          var on = 0, off = 0;
          build(p).forEach(function (f) {
            f.v.forEach(function (v) {
              var pr = G.projToScreen(v.x, v.y, v.z, C);
              if (pr && pr.fwd >= 1 && pr.sx >= 0 && pr.sx < C.w && pr.sy >= 0 && pr.sy < C.h) on++; else off++;
            });
          });
          if (on && off) straddle++;
          if (on && !drawnAt[it.x + ',' + it.y]) cullBad.push({seed: seed, y: y, type: it.type, d: Math.round(d), on: on, off: off});
        });
      }
    });
    out('NOTE cull ' + drawnTotal + ' drawn, ' + straddle + ' props straddling the screen edge');
    check('cull: every modelled prop in range with a vertex projecting on screen in front of the near plane is drawn (Endless 7 and 2024, 16 yaws; props straddling the screen edge included)',
      cullBad.length === 0 && straddle > 5 && drawnTotal > 50, {bad: cullBad.slice(0, 3), straddle: straddle});
  }

  // ── fallback: a rejected type stays on the sprite path ──
  if (section('fallback')) {
    world();
    G.floorScatter = [item('crate', 80, -10, {seed: 5}), item('barrel', 90, 12, {seed: 6})];
    G.floorPropTypeReady('crate'); G.floorPropTypeReady('barrel');
    var saveMaterials = G.GAME_MATERIALS, saveTable = G._floorPropTables.crate, saveModels = {}, errs0 = H.errors.length, copy = {};
    Object.keys(G.PROP_MODELS).forEach(function (k) { if (/^floorPropCrate/.test(k)) { saveModels[k] = G.PROP_MODELS[k]; delete G.PROP_MODELS[k]; } });
    Object.keys(saveMaterials).forEach(function (k) { if (k !== 'crateWood') copy[k] = saveMaterials[k]; });
    delete G._floorPropTables.crate;
    G.GAME_MATERIALS = copy;
    var ready1, ready2, calls, models;
    try {
      ready1 = G.floorPropTypeReady('crate'); G.GAME_MATERIALS = saveMaterials; ready2 = G.floorPropTypeReady('crate');
      frame();
      models = captureModels(function () { calls = spriteCalls(function () { G.drawFloorScatter3D(); }); });
    } finally {
      G.GAME_MATERIALS = saveMaterials; delete G._floorPropFailed.crate; G._floorPropTables.crate = saveTable;
      Object.keys(saveModels).forEach(function (k) { G.PROP_MODELS[k] = saveModels[k]; });
    }
    var newErrors = H.errors.splice(errs0);
    check('fallback: a type whose models are rejected is reported once and stays a sprite (paintFloorItem and its contact shadow) while the other types keep their models',
      ready1 === false && ready2 === false && newErrors.length === 1 && /floor props\] crate models rejected/.test(newErrors[0]) &&
      calls.paint.length === 1 && calls.paint[0].split('|')[0] === 'crate' && calls.shadow.join() === 'crate' &&
      models.length === 1 && /^floorPropBarrel/.test(models[0].model.key) && G.floorPropTypeReady('crate') === true,
      {ready: [ready1, ready2], errors: newErrors, paint: calls && calls.paint, models: models && models.map(function (m) { return m.model.key; })});
  }

  // ── lab smoke: render-lab/60-floor-props.js on a real Endless window ──
  if (section('lab')) {
    (0, eval)(slurp('tools/game/render-lab/00-core.js'));
    (0, eval)(slurp('tools/game/render-lab/60-floor-props.js'));
    H.startEndless(7);
    G.applyRenderPreset('recommended');
    var own = G.floorScatter, wrappers = {clip: G.withSceneDepthClip, draw: G.drawFloorScatter3D, paint: G.paintFloorItem, now: Date.now, random: Math.random};
    var pitch0 = G.cam.pitch;
    G.RenderLabFloorProps.gallery(60);
    var fixture = G.floorScatter, pitched = G.cam.pitch, snap = JSON.stringify(G.renderFeatureSnapshot()), r = G.RenderLabFloorProps.counts('smoke');
    out('NOTE lab ' + r.text);
    G.RenderLabFloorProps.restore();
    check('lab: gallery() poses the eight modelled variants with floorPropModels on; counts() sees their sprites (legacy) and models, then restores the switches, wrappers and clocks; restore() puts the scatter and the camera pitch back',
      fixture.length === 8 && r.legacy.paints >= 8 && r.model.paints === 0 && r.model.instances === 8 && r.model.drawn > 20 && r.legacy.faces === 0 &&
      JSON.stringify(G.renderFeatureSnapshot()) === snap && G.renderFeatureSnapshot().floorPropModels === true &&
      G.withSceneDepthClip === wrappers.clip && G.drawFloorScatter3D === wrappers.draw && G.paintFloorItem === wrappers.paint &&
      Date.now === wrappers.now && Math.random === wrappers.random && G.floorScatter === own && pitched !== pitch0 && G.cam.pitch === pitch0, r);
    G.RenderLabFloorProps.gallery(60, 2);
    var fixture2 = G.floorScatter.map(function (it) { return it.type; }).join(), r2 = G.RenderLabFloorProps.counts('smoke2');
    out('NOTE lab ' + r2.text);
    G.RenderLabFloorProps.restore();
    check('lab: gallery(60, 2) poses the six I2 types (stalagmite, stump, log, spire, rubble pile, arch) as models, all in view; restore() puts the scatter back',
      fixture2 === 'stalagmite,tree_stump,fallen_log,rock_spire,cave_rubble_pile,rock_arch' && r2.model.instances === 6 && r2.model.paints === 0 &&
      r2.legacy.paints >= 6 && r2.model.drawn > 20 && G.floorScatter === own && G.cam.pitch === pitch0, {fixture: fixture2, counts: r2.text});
    G.RenderLabFloorProps.distanceRow();
    var rowN = G.floorScatter.length, rc = G.RenderLabFloorProps.counts('row');
    G.RenderLabFloorProps.restore();
    var cfg = G.RenderLabFloorProps.CONFIGS;
    check('lab: distanceRow() poses 12 props at 45-400 u; the timing configurations are Recommended with floorPropModels off (A) and on (B)',
      rowN === 12 && rc.model.instances >= 9 && G.floorScatter === own && cfg.legacy.preset === 'recommended' &&
      cfg.legacy.features.floorPropModels === false && cfg.model.features.floorPropModels === true, {n: rowN, counts: rc.text});
  }

  check('no console errors', H.errors.length === 0, H.errors.slice(0, 3));
  out('FLOOR_PROP_MODELS_RESULT ' + (failed ? 'FAIL ' : 'PASS ') + checked + ' failed ' + failed);
}());
undefined;
