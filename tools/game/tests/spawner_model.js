// The spawner obelisk model (integration stage H) and drawEnemySpawners3D's
// model path, through the real MAIN manifest (render_host.js). Oracles are
// independent of the model code: the obelisk is the H spec written out here
// (a square frustum, half-width 17.6 at the floor to 11 at 72, a pyramid cap
// to 90; three rune bands per side at 0.2, 0.45 and 0.7 of the shaft, 0.9,
// 0.8 and 0.7 of the face's half-width, 3.6 tall, 0.1 proud), as nine
// half-spaces for ray intersection; the hit volume is the production
// projectile query (projectileFirstHit, 10-projectile-queries.js) fired at
// every emitted vertex; the yaw is recomputed from propInstanceKey of the
// world cell and WORLD_SEED; the window copies are compared with the chunk
// records and with a Legacy assembly. Depth comes from the production
// scene-depth code. Not a rasterizer or browser: no pixel colours, timing
// or compositing claims. Checks print PASS/FAIL and keep going, so a
// mutation names what it broke.
// Mutations (evaluated copies only; each anchor must match exactly once):
//   --wide-base            the plan's original base half-width 18 (corner
//                          radius 25.46, outside the r = 25 hit cylinder)
//   --window-relative-yaw  the yaw key uses window-relative cells
//   --drop-pulse-copy      assembleWindow does not copy pulsePhase
//   --glow-at-centre       the glow is depth-tested at its anchor depth
//   --glow-fixed-reach     the glow is tested 25.5 behind its anchor (the
//                          first H version: a wall just behind hid it)
//   --overlay-front-reach  the eye and bar are tested 25.5 before their
//                          anchor (the first H version: an occluder within
//                          25.5 of the centre let them through)
//   --no-inside-skip       a camera in or at the obelisk still draws the
//                          model (its inside faces fill the view)
//   --see-through-fog      the opaque parts keep the legacy see-through alpha
//   --overlay-in-opaque    the overlays are drawn in the opaque phase too
// --sections a,b runs only: spec, extent, yaw, depth, phase, overlay, inside,
// fade, fallback, pulse, lab.
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
  var DECOR = 'src/07-decorations-lighting.js', MODELS = 'src/12-prop-models.js', ENDLESS = 'src/05-endless-world.js';
  var loaded = H.loadManifest(function (path, source) {
    if (path === MODELS) {
      source = swap(source, '--wide-base', 'var SPAWNER_MODEL_DIMS = Object.freeze({base: 17.6,', 'var SPAWNER_MODEL_DIMS = Object.freeze({base: 18,');
      return swap(source, '--window-relative-yaw', "  var endless = typeof ENDLESS_MODE !== 'undefined' && ENDLESS_MODE;\n", '  var endless = false;\n');
    }
    if (path === ENDLESS) {
      return swap(source, '--drop-pulse-copy', '          enemySpawners[enemySpawners.length - 1].pulsePhase = sp.pulsePhase;\n', '          void 0;\n');
    }
    if (path !== DECOR) return source;
    source = swap(source, '--glow-at-centre', '      Math.max(glowP.fwd, deepest) + SPAWNER_GLOW_MARGIN, function () {\n', '      glowP.fwd, function () {\n');
    source = swap(source, '--glow-fixed-reach', '      Math.max(glowP.fwd, deepest) + SPAWNER_GLOW_MARGIN, function () {\n', '      glowP.fwd + 25.5, function () {\n');
    source = swap(source, '--overlay-front-reach', '  return Math.max(1, Math.min(anchorFwd, nearest) - SPAWNER_OVERLAY_BIAS);\n', '  return Math.max(1, anchorFwd - 25.5);\n');
    source = swap(source, '--no-inside-skip',
      "    entry.legacy = typeof spawnerCameraInReach === 'function' && spawnerCameraInReach(spawnerModelInstance(sp, floorZ, 1), C);\n",
      '    entry.legacy = false;\n');
    source = swap(source, '--see-through-fog',
      "  ctx.globalAlpha = alpha * entry.fade;   // the range fade only (1 inside the range)\n",
      "  ctx.globalAlpha = alpha * Math.max(0.4, 1.0 - Math.max(1, entry.fwd) / (viewDist * 0.5) * 0.5) * entry.fade;\n");
    return swap(source, '--overlay-in-opaque',
      '  for (var n = visible.length - 1; wantOpaque && n >= 0; n--) drawEnemySpawnerModelOpaque(visible[n], C, model, now);\n',
      '  for (var n = visible.length - 1; wantOpaque && n >= 0; n--) { drawEnemySpawnerModelOpaque(visible[n], C, model, now); drawEnemySpawnerModelOverlay(visible[n], C, model, now); }\n');
  });
  check('real manifest loads with the spawner model and no console errors',
    loaded > 40 && typeof G.spawnerModelFor === 'function' && typeof G.drawEnemySpawnerModels3D === 'function' && H.errors.length === 0,
    {loaded: loaded, errors: H.errors.slice(0, 3)});

  // ── Fixture: an empty flat world; camera eye 20 above the floor ──
  var W = 320, HT = 240, PS = 180, B = 17.6, T = 11, SHAFT = 72, APEX = 90, HIT_R = 25, HIT_H = 90;
  var BANDS = [[0.2, 0.9], [0.45, 0.8], [0.7, 0.7]], RUNE_H = 3.6, PROUD = 0.1;
  var SIDES = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // outward (r, o) of the four sides
  function world() {
    G.cell = 12; G.gridW = G.gridH = 64; G.grid = new Uint8Array(64 * 64);
    G.floorMesh = null; G.gridCave = null; G.deepCaveRegions = []; G.deepCaveEntrances = [];
    G.windowOriginX = G.windowOriginY = 0; G.CANVAS_BASE_H = 240; G.viewDist = 1400; G.ENDLESS_MODE = false;
    G.canvas.width = W; G.canvas.height = HT; G.projScale = PS; G.MODE3D = true; G.enemies = [];
    G.cam = {x: 0, y: 0, z: -4, ang: 0, pitch: 0, fov: Math.PI / 2};   // cameraZ = 20
    G.applyRenderPreset('recommended'); G.setRenderFeatures({spawnerModel: true});
    G.updateDayNight(0);
  }
  world();
  function frame() { G.beginSceneDepthFrame(W, HT); G.beginRenderFrameStats(); }
  function spawner(extra) {
    var s = {x: 380, y: 380, renderFloorZ: 0, feetZ: 0, hp: 6, maxHp: 6, active: true, type: 'basic', pulsePhase: 0.5};
    for (var k in extra || {}) s[k] = extra[k];
    return s;
  }
  // The yaw oracle: propInstanceKey of the world cell, a quarter turn.
  function yawOf(sp) {
    var ox = G.ENDLESS_MODE ? G.windowOriginX : 0, oy = G.ENDLESS_MODE ? G.windowOriginY : 0;
    return G.propInstanceKey(G.propTypeSalt('spawnerObelisk'), Math.floor((sp.x + ox) / G.cell), Math.floor((sp.y + oy) / G.cell), G.WORLD_SEED) /
      4294967296 * Math.PI / 2;
  }
  function frameOf(sp) {
    var y = yawOf(sp);
    return {ox: Math.cos(y), oy: Math.sin(y), rx: -Math.sin(y), ry: Math.cos(y), x: sp.x, y: sp.y, z: G.getEntityRenderFloorZ(sp)};
  }
  function toLocal(F, p) {
    var dx = p.x - F.x, dy = p.y - F.y;
    return {r: dx * F.rx + dy * F.ry, o: dx * F.ox + dy * F.oy, z: p.z - F.z};
  }
  function toWorld(F, r, o, z) { return {x: F.x + r * F.rx + o * F.ox, y: F.y + r * F.ry + o * F.oy, z: F.z + z}; }
  function build(sp) {
    var model = G.spawnerModelFor(), buf = G.createModelFaceBuffer();
    G.buildModelFaces(model, G.spawnerModelInstance(sp, G.getEntityRenderFloorZ(sp), 1, {}), buf);
    var faces = [];
    for (var i = 0; i < buf.count; i++) {
      var f = buf.faces[i];
      faces.push({part: f.partName, role: f.role, tint: f.tint, flags: f.flags, normal: {x: f.normal.x, y: f.normal.y, z: f.normal.z},
        v: f.vertices.map(function (v) { return {x: v.x, y: v.y, z: v.z}; })});
    }
    return faces;
  }
  function near(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-9); }
  function half(z) { return B + (T - B) * z / SHAFT; }   // the shaft's half-width at height z
  // Nine half-spaces n.p <= c in the local frame (unit n): bottom, the four
  // shaft sides and the four cap faces.
  var PLANES = (function () {
    var list = [{n: [0, 0, -1], c: 0, face: 'bottom'}], ls = Math.hypot(SHAFT, B - T), lc = Math.hypot(APEX - SHAFT, T);
    SIDES.forEach(function (d, k) {
      list.push({n: [d[0] * SHAFT / ls, d[1] * SHAFT / ls, (B - T) / ls], c: B * SHAFT / ls, face: 'side' + k, d: d});
      list.push({n: [d[0] * (APEX - SHAFT) / lc, d[1] * (APEX - SHAFT) / lc, T / lc], c: T * APEX / lc, face: 'cap' + k, d: d});
    });
    return list;
  }());
  function dot3(n, p) { return n[0] * p.r + n[1] * p.o + n[2] * p.z; }

  // ── spec ──
  if (section('spec')) {
    var def = G.RENDER_FEATURE_DEFS.filter(function (d) { return d.key === 'spawnerModel'; })[0];
    check('spec: spawnerModel is registered default ON (flipped in stage H after its checks) and OFF in Legacy',
      !!def && def.type === 'bool' && def.default === true && def.legacy === false &&
      G.renderFeaturePreset('legacy').spawnerModel === false && G.renderFeaturePreset('recommended').spawnerModel === true, def);
    var ids = Object.keys(G.GAME_MATERIAL_COLORS), mat = G.GAME_MATERIAL_COLORS.spawnerObelisk;
    check('spec: the spawnerObelisk material is appended after the chest materials (after bone) with a body and the legacy rune red',
      ids.indexOf('spawnerObelisk') > ids.indexOf('chestEpic') && ids.indexOf('chestEpic') > ids.indexOf('bone') &&
      !!mat && mat.rune === '#c83232' && /^#[0-9a-f]{6}$/.test(mat.body) && Object.keys(mat).join() === 'body,rune', mat);
    var m = G.spawnerModelFor();
    check('spec: one model, family spawner: a closed body of 9 faces (4 sides, 4 cap triangles, the bottom) and 12 emissive decal rune strips tinted by the instance',
      !!m && m.key === 'spawnerObelisk' && m.family === 'spawner' && m.parts.length === 13 && m.faceCount === 21 &&
      m.parts[0].name === 'body' && m.parts[0].flags.closed === true && m.parts[0].faces.length === 9 &&
      m.parts.slice(1).every(function (p) { return p.faces.length === 1 && p.flags.emissive && p.flags.decal && !p.flags.translucent && p.tint === 'rune' && p.role === 'rune'; }),
      m && {parts: m.parts.length, faces: m.faceCount});
    // The frustum's apex option (stage H): absent, the flat-topped frustum
    // is unchanged (prop_models.js); present, it must rise above z1 over a
    // positive top.
    function rejects(extra) {
      var d = {name: 'f', kind: 'frustum', z0: 0, z1: 10, bottom: [4, 4], top: [2, 2], material: 'spawnerObelisk', role: 'body'};
      for (var k in extra) d[k] = extra[k];
      try { G.definePropModel({key: 'smApexProbe' + (++apexProbes), parts: [d]}); return false; } catch (e) { return /apex/.test(e.message); }
    }
    var apexProbes = 0, flat = G.definePropModel({key: 'smApexFlat', parts: [{name: 'f', kind: 'frustum', z0: 0, z1: 10, bottom: [4, 4], top: [2, 2], material: 'spawnerObelisk', role: 'body'}]});
    var capped = G.definePropModel({key: 'smApexCap', parts: [{name: 'f', kind: 'frustum', z0: 0, z1: 10, apex: 13, bottom: [4, 4], top: [2, 2], material: 'spawnerObelisk', role: 'body'}]});
    check('spec: a frustum apex replaces the flat top with 4 cap triangles in a closed part, and is rejected at or below z1 or over a zero top',
      flat.faceCount === 6 && capped.faceCount === 9 && capped.parts[0].flags.closed === true && capped.bounds.max[2] === 13 &&
      rejects({apex: 10}) && rejects({apex: 5}) && rejects({apex: 20, top: [0, 0]}), {flat: flat.faceCount, capped: capped.faceCount});
    delete G.PROP_MODELS.smApexFlat; delete G.PROP_MODELS.smApexCap;
    // Body vertices are the spec corners, at 12 cells (12 yaws).
    var bodyBad = [], runeBad = [];
    for (var k = 0; k < 12; k++) {
      var sp = spawner({x: 100 + 37 * k, y: 200 + 23 * k}), F = frameOf(sp), faces = build(sp);
      var want = [];
      [[0, B], [SHAFT, T]].forEach(function (zh) { [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) { want.push([s[0] * zh[1], s[1] * zh[1], zh[0]]); }); });
      want.push([0, 0, APEX]);
      var have = [];
      faces.filter(function (f) { return f.part === 'body'; }).forEach(function (f) { f.v.forEach(function (p) { have.push(toLocal(F, p)); }); });
      function at(w) { return function (l) { return near(l.r, w[0], 1e-9) && near(l.o, w[1], 1e-9) && near(l.z, w[2], 1e-9); }; }
      var unmatched = have.filter(function (l) { return !want.some(function (w) { return at(w)(l); }); });
      if (have.length !== 32 || unmatched.length || !want.every(function (w) { return have.some(at(w)); }))
        bodyBad.push({k: k, n: have.length, unmatched: unmatched.slice(0, 2)});
      // Runes: parallel to their side, 0.1 out of it, at the band heights and widths.
      faces.filter(function (f) { return /^rune/.test(f.part); }).forEach(function (f) {
        var l = f.v.map(function (p) { return toLocal(F, p); }), bi = +f.part.charAt(4), si = +f.part.charAt(6);
        var plane = PLANES.filter(function (P) { return P.face === 'side' + si; })[0], band = BANDS[bi];
        var nl = toLocal({x: 0, y: 0, z: 0, rx: F.rx, ry: F.ry, ox: F.ox, oy: F.oy}, f.normal);
        var zc = 0, dist = [], along = [];
        l.forEach(function (p) {
          dist.push(dot3(plane.n, p) - plane.c);
          along.push(p.r * -plane.d[1] + p.o * plane.d[0]);
        });
        var zs = l.map(function (p) { return p.z - PROUD * plane.n[2]; });
        zc = (Math.min.apply(null, zs) + Math.max.apply(null, zs)) / 2;
        var width = (Math.max.apply(null, along) - Math.min.apply(null, along)) / 2;
        if (!(near(nl.r, plane.n[0], 1e-9) && near(nl.o, plane.n[1], 1e-9) && near(nl.z, plane.n[2], 1e-9)) ||
            !dist.every(function (d) { return near(d, PROUD, 1e-9); }) || !near(zc, SHAFT * band[0], 1e-9) ||
            !near(Math.max.apply(null, zs) - Math.min.apply(null, zs), RUNE_H, 1e-9) || !near(width, half(SHAFT * band[0]) * band[1], 1e-9))
          runeBad.push({k: k, part: f.part, dist: dist.map(function (d) { return +d.toFixed(6); }), zc: zc, width: width});
      });
    }
    check('spec: at 12 cells the body is the square frustum 17.6 -> 11 over 0..72 with its apex at 90, in the propInstanceKey yaw frame',
      bodyBad.length === 0, bodyBad.slice(0, 2));
    check('spec: each rune strip is parallel to its side, 0.1 out of it, 3.6 tall, centred at 0.2/0.45/0.7 of the shaft with 0.9/0.8/0.7 of the side\'s half-width',
      runeBad.length === 0, runeBad.slice(0, 2));
  }

  // ── extent: the production projectile query hits every emitted vertex ──
  if (section('extent')) {
    var FEET = 40, maxR = 0, minZ = Infinity, maxZ = -Infinity, misses = [], total = 0;
    for (var e = 0; e < 12; e++) {
      var s2 = spawner({x: 300 + 13 * e, y: 320 + 29 * e, feetZ: FEET, renderFloorZ: FEET});
      G.enemySpawners = [s2];
      build(s2).forEach(function (f) {
        f.v.forEach(function (p) {
          var dx = p.x - s2.x, dy = p.y - s2.y, rad = Math.hypot(dx, dy), ux = rad > 1e-9 ? dx / rad : 1, uy = rad > 1e-9 ? dy / rad : 0;
          maxR = Math.max(maxR, rad); minZ = Math.min(minZ, p.z - FEET); maxZ = Math.max(maxZ, p.z - FEET); total++;
          var hit = G.projectileFirstHit({r: 0}, {x: p.x + ux * 40, y: p.y + uy * 40, z: p.z}, {x: p.x, y: p.y, z: p.z}, null);
          if (hit.status !== 'blocked' || hit.kind !== 'spawner') misses.push({e: e, part: f.part, r: +rad.toFixed(4), z: +(p.z - FEET).toFixed(3), hit: hit.status + ':' + hit.kind});
        });
      });
    }
    var s3 = spawner({feetZ: FEET, renderFloorZ: FEET}); G.enemySpawners = [s3];
    function shot(rad, z) { var h = G.projectileFirstHit({r: 0}, {x: s3.x + rad + 40, y: s3.y, z: FEET + z}, {x: s3.x + rad, y: s3.y, z: FEET + z}, null); return h.status + ':' + h.kind; }
    var controls = [shot(24.95, 45), shot(25.3, 45), shot(10, 90), shot(10, 90.3)];
    out('NOTE extent vertices ' + total + ' max radius ' + maxR.toFixed(4) + ' z ' + minZ.toFixed(3) + '..' + maxZ.toFixed(3) + ' controls ' + controls.join(' '));
    check('extent: control, the production hit query (10-projectile-queries.js) is the r = 25, h = 90 cylinder: a point 24.95 out or 90 up is hit, 25.3 out or 90.3 up is not',
      controls.join() === 'blocked:spawner,clear:null,blocked:spawner,clear:null', controls);
    check('extent: at 12 yaws every emitted body and rune vertex lies inside the projectile hit cylinder (the query hits it; radius <= 25, 0 <= z <= 90)',
      total === 12 * 80 && misses.length === 0 && maxR <= HIT_R && minZ >= 0 && maxZ <= HIT_H, {misses: misses.slice(0, 3), maxR: maxR});
    G.enemySpawners = [];
  }

  // ── yaw ──
  if (section('yaw')) {
    var yaws = {}, frameBad = [];
    for (var y = 0; y < 16; y++) {
      var s4 = spawner({x: 60 + 41 * y, y: 90 + 17 * y}), want = yawOf(s4), got = G.spawnerModelYaw(s4);
      yaws[got.toFixed(6)] = true;
      if (!near(got, want, 1e-12) || !(got >= 0 && got < Math.PI / 2)) frameBad.push({y: y, got: got, want: want});
    }
    check('yaw: the yaw is propInstanceKey(spawnerObelisk salt, world cell, WORLD_SEED) as a quarter turn, and differs across cells',
      frameBad.length === 0 && Object.keys(yaws).length >= 12, {bad: frameBad.slice(0, 2), distinct: Object.keys(yaws).length});
    // Endless window copies are window-relative: the same world spawner under
    // two window origins builds the same faces relative to itself.
    G.ENDLESS_MODE = true;
    var base = {x: 12 * 40 + 6, y: 12 * 33 + 6}, shapes = [];
    [[0, 0], [3 * G.CHUNK_SIZE, -2 * G.CHUNK_SIZE]].forEach(function (o) {
      G.windowOriginX = o[0]; G.windowOriginY = o[1];
      var s5 = spawner({x: base.x - o[0], y: base.y - o[1]});
      shapes.push(build(s5).map(function (f) { return f.v.map(function (p) { return [(p.x - s5.x).toFixed(6), (p.y - s5.y).toFixed(6), p.z.toFixed(6)].join(); }).join(';'); }).join('|'));
    });
    G.ENDLESS_MODE = false; G.windowOriginX = G.windowOriginY = 0;
    check('yaw: an Endless window shift keeps each obelisk\'s yaw (the key uses world cells, not window-relative ones)',
      shapes[0] === shapes[1] && shapes[0].length > 100);
  }

  // ── depth: the body and a rune write their analytic depth ──
  var C;
  function aim(sp, azDeg, dist) {
    var a = azDeg * Math.PI / 180;
    G.cam.x = sp.x + Math.cos(a) * dist; G.cam.y = sp.y + Math.sin(a) * dist;
    G.cam.ang = Math.atan2(sp.y - G.cam.y, sp.x - G.cam.x);
    C = G.getCam3D();
  }
  function project(p) {
    var dx = p.x - G.cam.x, dy = p.y - G.cam.y, depth = dx * C.cosAng + dy * C.sinAng, right = -dx * C.sinAng + dy * C.cosAng;
    return {x: (right / depth * C.invTanHalf * 0.5 + 0.5) * C.w, y: C.horizonY + (C.cameraZ - p.z) / depth * PS, depth: depth};
  }
  // The ray through a pixel centre, per unit of camera depth, in the local frame.
  function pixelRay(F, px, py) {
    var rOverD = ((px + 0.5) / C.w - 0.5) * 2 / C.invTanHalf, zOverD = (py + 0.5 - C.horizonY) / PS;
    var dir = {x: C.cosAng - C.sinAng * rOverD, y: C.sinAng + C.cosAng * rOverD, z: -zOverD};
    var o = toLocal(F, {x: G.cam.x, y: G.cam.y, z: C.cameraZ});
    return {o: o, d: {r: dir.x * F.rx + dir.y * F.ry, o: dir.x * F.ox + dir.y * F.oy, z: dir.z}};
  }
  // Cyrus-Beck entry of the ray into the nine half-spaces.
  function obeliskEntry(ray) {
    var tIn = -Infinity, tOut = Infinity, face = '';
    PLANES.forEach(function (P) {
      var nd = dot3(P.n, ray.d), no = dot3(P.n, ray.o);
      if (Math.abs(nd) < 1e-12) { if (no > P.c) tIn = Infinity; return; }
      var t = (P.c - no) / nd;
      if (nd < 0) { if (t > tIn) { tIn = t; face = P.face; } } else tOut = Math.min(tOut, t);
    });
    return tIn <= tOut && tIn > 0 ? {depth: tIn, face: face} : null;
  }
  function facingSide(F) {
    var c = toLocal(F, {x: G.cam.x, y: G.cam.y, z: 0}), best = 0;
    SIDES.forEach(function (d, k) { if (d[0] * c.r + d[1] * c.o > SIDES[best][0] * c.r + SIDES[best][1] * c.o) best = k; });
    return best;
  }
  function depthCase(azDeg, cull, i) {
    var sp = spawner({x: 300 + 37 * i, y: 330 + 11 * i}), F = frameOf(sp);
    aim(sp, azDeg, 150);
    G.setRenderFeatures({modelBackfaceCull: cull});
    G.enemySpawners = [sp]; frame(); G.drawEnemySpawners3D();
    G.setRenderFeatures({modelBackfaceCull: true});
    var k = facingSide(F), d = SIDES[k], plane = PLANES.filter(function (P) { return P.face === 'side' + k; })[0];
    // A body pixel: the facing side's centre line at z 22, between the bands.
    var pb = project(toWorld(F, d[0] * half(22), d[1] * half(22), 22)), bx = Math.floor(pb.x), by = Math.floor(pb.y);
    var body = obeliskEntry(pixelRay(F, bx, by));
    // A rune pixel: the middle band's centre on the facing side, 0.1 out.
    var zc = SHAFT * BANDS[1][0], out1 = half(zc) + PROUD * plane.n[0] * d[0] + PROUD * plane.n[1] * d[1];
    var pr = project(toWorld(F, d[0] * out1, d[1] * out1, zc + PROUD * plane.n[2])), rx = Math.floor(pr.x), ry = Math.floor(pr.y);
    var ray = pixelRay(F, rx, ry), nd = dot3(plane.n, ray.d), tRune = (plane.c + PROUD - dot3(plane.n, ray.o)) / nd;
    var hitR = {r: ray.o.r + ray.d.r * tRune, o: ray.o.o + ray.d.o * tRune, z: ray.o.z + ray.d.z * tRune};
    var along = hitR.r * -d[1] + hitR.o * d[0], zOn = hitR.z - PROUD * plane.n[2];
    return {az: azDeg, cull: cull, side: k, body: {px: bx, py: by, got: G.sceneDepthAt(bx, by), want: body},
      rune: {px: rx, py: ry, got: G.sceneDepthAt(rx, ry), want: tRune,
        on: Math.abs(along) < half(zc) * BANDS[1][1] && Math.abs(zOn - zc) < RUNE_H / 2}};
  }
  if (section('depth')) {
    var rows = [], bodyBad2 = [], runeBad2 = [];
    [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].forEach(function (az, i) {
      [true, false].forEach(function (cull) {
        var r = depthCase(az, cull, i);
        rows.push(r);
        if (!r.body.want || !/^side/.test(r.body.want.face) || !(Math.abs(r.body.got - r.body.want.depth) < 0.01)) bodyBad2.push(r.body);
        if (!r.rune.on || !(Math.abs(r.rune.got - r.rune.want) < 0.01)) runeBad2.push(r.rune);
      });
    });
    out('NOTE depth ' + rows.filter(function (r) { return r.cull; }).map(function (r) {
      return r.az + ':' + r.body.got.toFixed(3) + '/' + (r.body.want ? r.body.want.face + r.body.want.depth.toFixed(3) : 'miss') +
        ' rune ' + r.rune.got.toFixed(3) + '/' + r.rune.want.toFixed(3);
    }).join(' '));
    check('depth: at 8 azimuths and 8 yaws (cull on and off) the final depth at a body pixel is the ray\'s analytic entry into the obelisk (a side face, within 0.01)',
      rows.length === 16 && bodyBad2.length === 0, bodyBad2.slice(0, 3));
    check('depth: at a rune pixel it is the analytic depth of the rune strip 0.1 out of the facing side (the decal writes depth over its face)',
      rows.length === 16 && runeBad2.length === 0, runeBad2.slice(0, 3));
  }

  // ── phase ──
  var realBillboard = G.withSceneDepthBillboard, billboards = [], realFill = G.fillSceneDepthPolygon, fills = [];
  function instrument(on) {
    if (on) {
      billboards = []; fills = [];
      G.withSceneDepthBillboard = function (bounds, depth) {
        var r = realBillboard.apply(this, arguments);
        billboards.push({x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height, depth: depth, result: r});
        return r;
      };
      G.fillSceneDepthPolygon = function () { fills.push(G.ctx.globalAlpha); return realFill.apply(this, arguments); };
    } else { G.withSceneDepthBillboard = realBillboard; G.fillSceneDepthPolygon = realFill; }
  }
  function depthCopy() { return Array.prototype.slice.call(G._sceneDepthInv, 0, W * HT); }
  function sameDepth(a, b) { for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
  function written(a) { var n = 0; for (var i = 0; i < a.length; i++) if (a[i] > 0) n++; return n; }
  if (section('phase')) {
    var hurt = spawner({hp: 3});
    aim(hurt, 30, 150); G.enemySpawners = [hurt];
    frame(); instrument(true); G.drawEnemySpawners3D('opaque'); instrument(false);
    var afterOpaque = depthCopy(), opaqueBillboards = billboards.length, opaqueFills = fills.length;
    check('phase: the opaque phase writes the obelisk to depth and draws no billboard',
      opaqueBillboards === 0 && opaqueFills >= 8 && written(afterOpaque) > 500, {billboards: opaqueBillboards, fills: opaqueFills, px: written(afterOpaque)});
    instrument(true); G.drawEnemySpawners3D('overlay'); instrument(false);
    check('phase: the overlay phase draws the glow, the eye and the HP bar (3 billboards) and writes no depth (the glow bounds stay transparent)',
      billboards.length === 3 && fills.length === 0 && sameDepth(afterOpaque, depthCopy()), {billboards: billboards.length, fills: fills.length});
    frame(); H.record(true, true); G.drawEnemySpawners3D(); var both = H.record(false);
    frame(); H.record(true, true); G.drawEnemySpawners3D('opaque'); G.drawEnemySpawners3D('overlay'); var split = H.record(false);
    check('phase: with no argument the call draws both phases, opaque first (same commands as opaque then overlay)',
      both.entries > 30 && both.hash() === split.hash(), {both: both.entries, split: split.entries});
  }

  // ── overlay anchors and their depth tests ──
  // Entry depths of the pixel-centre rays inside a screen rect (clipped to
  // the screen) into the obelisk, over the rays that hit it.
  function entriesIn(F, x0, y0, x1, y1) {
    var r = {min: Infinity, max: -Infinity, n: 0};
    for (var py = Math.max(0, Math.floor(y0)); py < Math.min(HT, Math.ceil(y1)); py++) {
      if (py + 0.5 < y0 || py + 0.5 > y1) continue;
      for (var px = Math.max(0, Math.floor(x0)); px < Math.min(W, Math.ceil(x1)); px++) {
        if (px + 0.5 < x0 || px + 0.5 > x1) continue;
        var e = obeliskEntry(pixelRay(F, px, py));
        if (e) { r.n++; r.min = Math.min(r.min, e.depth); r.max = Math.max(r.max, e.depth); }
      }
    }
    return r;
  }
  // The spec corners (4 at the floor, 4 at the shaft top, the apex).
  function corners(F) {
    var list = [];
    [[B, 0], [T, SHAFT]].forEach(function (lv) {
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { list.push(toWorld(F, q[0] * lv[0], q[1] * lv[0], lv[1])); });
    });
    list.push(toWorld(F, 0, 0, APEX));
    return list;
  }
  function fullScreen(depth) {
    G.writeSceneDepthPolygon([{x: 0, y: 0, depth: depth}, {x: W, y: 0, depth: depth}, {x: W, y: HT, depth: depth}, {x: 0, y: HT, depth: depth}]);
  }
  if (section('overlay')) {
    var glowBad = [], eyeBad = [], shown = [], bandBad = [], bandNote = [];
    [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].forEach(function (az) {
      var sp = spawner({hp: 2}), F = frameOf(sp);
      aim(sp, az, 120); G.enemySpawners = [sp];
      frame(); instrument(true); G.drawEnemySpawners3D('overlay'); instrument(false);
      var bare = billboards.slice();   // on an empty depth buffer every pixel of each rect passes
      frame(); instrument(true); G.drawEnemySpawners3D(); instrument(false);
      var glow = billboards[0], eye = billboards[1], bar = billboards[2], deepest = -Infinity, box = {x0: W, y0: HT, x1: 0, y1: 0};
      corners(F).forEach(function (p) {
        var q = project(p); deepest = Math.max(deepest, q.depth);
        box.x0 = Math.min(box.x0, q.x); box.y0 = Math.min(box.y0, q.y); box.x1 = Math.max(box.x1, q.x); box.y1 = Math.max(box.y1, q.y);
      });
      var gc = G.projToScreen(F.x, F.y, F.z + 30, C), ec = G.projToScreen(F.x, F.y, F.z + SHAFT * 0.65, C), bc = G.projToScreen(F.x, F.y, F.z + APEX + 4, C);
      var under = glow ? entriesIn(F, Math.max(glow.x, box.x0), Math.max(glow.y, box.y0), Math.min(glow.x + glow.w, box.x1), Math.min(glow.y + glow.h, box.y1)) : null;
      if (!glow || !near(glow.x + glow.w / 2, gc.sx, 1e-6) || !near(glow.y + glow.h / 2, gc.sy, 1e-6) || !(under.n > 100) ||
          !(glow.depth - 0.15 > under.max) || !(glow.depth <= deepest + 0.4 + 1e-9))
        glowBad.push({az: az, glow: glow, under: under, deepest: deepest});
      if (!eye || !near(eye.x + eye.w / 2, ec.sx, 1e-6) || !near(eye.y + eye.h / 2, ec.sy, 1e-6) ||
          !bar || !near(bar.x + bar.w / 2, bc.sx, 1e-6) || !near(bar.y + bar.h, bc.sy, 1e-6) || billboards.length !== 3 || bare.length !== 3 ||
          !(eye.result > 0 && eye.result === bare[1].result) || !(bar.result > 0 && bar.result === bare[2].result))
        eyeBad.push({az: az, eye: eye, bar: bar, bare: bare.map(function (b) { return b.result; })});
      shown.push(eye && bar && glow ? [eye.result > 0, bar.result > 0, glow.result > 0] : null);
      // A full-screen occluder 2 in front of the nearest body point under the
      // eye and the bar (their anchor when nearer), still within 25.35 of the
      // centre: the first H version tested them 25.5 before their anchors.
      if (!eye || !bar) return;
      var underEye = entriesIn(F, eye.x, eye.y, eye.x + eye.w, eye.y + eye.h), underBar = entriesIn(F, bar.x, bar.y, bar.x + bar.w, bar.y + bar.h);
      var centreFwd = project({x: F.x, y: F.y, z: 0}).depth;
      var occ = Math.min(underEye.min, underBar.min, bc.fwd) - 2;
      frame(); G.drawEnemySpawners3D('opaque'); fullScreen(occ);
      instrument(true); G.drawEnemySpawners3D('overlay'); instrument(false);
      bandNote.push(az + ':' + (centreFwd - occ).toFixed(1));
      if (!(underEye.n > 0) || !(occ > centreFwd - 25.35) || billboards.length !== 3 || billboards[1].result !== 0 || billboards[2].result !== 0)
        bandBad.push({az: az, occ: occ, centre: centreFwd, eye: billboards[1] && billboards[1].result, bar: billboards[2] && billboards[2].result});
    });
    out('NOTE overlay occluder in front of the centre by ' + bandNote.join(' '));
    check('overlay: the glow is centred on the glow anchor (30 up, the legacy glow centre) and depth-tested just behind the deepest body point under it: every body pixel ray in its rect enters before its test depth (the obelisk hides it; nearer things still do), and it is at most the deepest body corner + 0.4, not a fixed reach',
      glowBad.length === 0, glowBad.slice(0, 2));
    check('overlay: the eye (0.65 of the shaft) and the HP bar (bottom 4 above the apex) are billboards at their anchors that the obelisk never hides (as many pixels pass over the drawn body as on an empty depth buffer)',
      eyeBad.length === 0 && shown.every(function (s) { return s && s[0] && s[1] && s[2]; }), {bad: eyeBad.slice(0, 2), shown: shown});
    check('overlay: an occluder 2 in front of the obelisk under the eye and the HP bar, within 25.35 of the centre (the first H version let them through), hides both',
      bandBad.length === 0 && bandNote.length === 8, bandBad.slice(0, 2));
    // Facing a side squarely: the verifier's leak case (an occluder 20 in
    // front of the centre) and a wall directly behind the obelisk.
    var leakBad = [], wallBad = [], wallNote = [];
    var sq = spawner({hp: 2}), Fq = frameOf(sq), yawDeg = yawOf(sq) * 180 / Math.PI;
    [0, 90, 180, 270].forEach(function (k) {
      aim(sq, yawDeg + k, 120); G.enemySpawners = [sq];
      var centreFwd = project({x: Fq.x, y: Fq.y, z: 0}).depth, deepest = -Infinity;
      corners(Fq).forEach(function (p) { deepest = Math.max(deepest, project(p).depth); });
      frame(); G.drawEnemySpawners3D('opaque'); fullScreen(centreFwd - 20);
      instrument(true); G.drawEnemySpawners3D('overlay'); instrument(false);
      var eye = billboards[1], bar = billboards[2], underEye = eye ? entriesIn(Fq, eye.x, eye.y, eye.x + eye.w, eye.y + eye.h) : {min: -Infinity};
      if (!eye || !bar || !(centreFwd - 20 < underEye.min - 1) || eye.result !== 0 || bar.result !== 0)
        leakBad.push({k: k, eye: eye && eye.result, bar: bar && bar.result, surface: underEye.min - centreFwd});
      var wall = deepest + 0.5;
      frame(); fullScreen(wall);
      instrument(true); G.drawEnemySpawners3D(); instrument(false);
      var glow = billboards[0];
      wallNote.push((wall - centreFwd).toFixed(2));
      if (!glow || !(wall < centreFwd + 25.35) || !(glow.result > 0)) wallBad.push({k: k, wall: wall - centreFwd, glow: glow && glow.result});
    });
    out('NOTE overlay wall behind the centre by ' + wallNote.join(' '));
    check('overlay: facing a side squarely, a full-screen occluder 20 in front of the centre (in front of the body under the eye) hides the eye and the HP bar',
      leakBad.length === 0, leakBad);
    check('overlay: facing a side squarely, a wall directly behind the obelisk (0.5 past its deepest corner, within 25.35 of the centre) shows the glow around the body',
      wallBad.length === 0, wallBad);
    var sp2 = spawner({hp: 2}); aim(sp2, 20, 120); G.enemySpawners = [sp2];
    frame(); G.drawEnemySpawners3D('opaque');
    fullScreen(5);
    instrument(true); G.drawEnemySpawners3D('overlay'); instrument(false);
    check('overlay: a nearer occluder hides every overlay (glow, eye, HP bar)',
      billboards.length === 3 && billboards.every(function (b) { return b.result === 0; }), billboards);
  }

  // ── inside: spawners have no movement collision, so the camera can be in
  // or at the obelisk; there the model must not draw its inside faces ──
  if (section('inside')) {
    var z0 = G.cam.z, sp7 = spawner({hp: 3}), F7 = frameOf(sp7), inCases = 0, legacyDrawn = 0, clearToward = 0;
    var inBad = [], awayBad = [], towardBad = [];
    G.enemySpawners = [sp7];
    [[-4, 20], [60, 60]].forEach(function (h) {       // cam.z -> eye height over the floor
      G.cam.z = h[0];
      [4, 8, 12, 14, 16, 18].forEach(function (d) {
        for (var az = 0; az < 360; az += 30) {
          ['toward', 'away'].forEach(function (facing) {
            aim(sp7, az, d);
            if (facing === 'away') { G.cam.ang += Math.PI; C = G.getCam3D(); }
            var camL = toLocal(F7, {x: G.cam.x, y: G.cam.y, z: C.cameraZ}), clear = -Infinity;
            PLANES.forEach(function (P) { clear = Math.max(clear, dot3(P.n, camL) - P.c); });
            frame(); instrument(true); G.drawEnemySpawners3D('opaque'); instrument(false);
            var px = written(depthCopy()), nFills = fills.length;
            if (facing === 'away' && px >= W * HT * 0.05) awayBad.push({eye: h[1], d: d, az: az, clear: clear, px: px});
            if (clear < 1) {
              inCases++;
              frame(); H.record(true, true); G.drawEnemySpawners3D('overlay'); var rec = H.record(false);
              G.setRenderFeatures({spawnerModel: false});
              frame(); H.record(true, true); G.drawEnemySpawners3D('overlay'); var leg = H.record(false);
              G.setRenderFeatures({spawnerModel: true});
              if (leg.entries > 0) legacyDrawn++;
              if (px !== 0 || nFills !== 0 || rec.hash() !== leg.hash())
                inBad.push({eye: h[1], d: d, az: az, facing: facing, clear: +clear.toFixed(2), px: px, fills: nFills, rec: rec.entries, legacy: leg.entries});
            } else if (clear >= 3 && facing === 'toward') {
              clearToward++;
              var e = obeliskEntry(pixelRay(F7, W / 2, HT / 2)), got = G.sceneDepthAt(W / 2, HT / 2);
              if (!e || !/^side/.test(e.face) || !(Math.abs(got - e.depth) < 0.01)) towardBad.push({eye: h[1], d: d, az: az, clear: clear, got: got, want: e});
            }
          });
        }
      });
    });
    G.cam.z = z0;
    out('NOTE inside: ' + inCases + ' views in or within 1 of the obelisk (' + legacyDrawn + ' with a visible legacy billboard), ' + clearToward + ' clear views facing it');
    check('inside: 4-18 units from the centre (eye 20 and 60 over the floor, 12 azimuths, facing toward and away), with the camera inside the obelisk or within 1 unit of it (the nine half-spaces) the model writes no depth and fills no face, and the spawner draws the Legacy billboard commands instead',
      inCases >= 100 && legacyDrawn >= 10 && inBad.length === 0, {cases: inCases, legacyDrawn: legacyDrawn, bad: inBad.slice(0, 3)});
    check('inside: facing away at those distances the obelisk never covers the view (under 5% of the screen written)',
      awayBad.length === 0, awayBad.slice(0, 3));
    check('inside: control, 3 or more units outside and facing it the model still draws: the screen-centre depth is the analytic entry into a side',
      clearToward >= 10 && towardBad.length === 0, {cases: clearToward, bad: towardBad.slice(0, 3)});
  }

  // ── fade ──
  if (section('fade')) {
    function fadeCase(dist) {
      var sp = spawner(); aim(sp, 10, dist); G.enemySpawners = [sp];
      frame(); instrument(true); G.drawEnemySpawners3D('opaque'); instrument(false);
      return fills.slice();
    }
    var inside = fadeCase(0.3 * 1400), band = fadeCase(0.46 * 1400), wantBand = 1 - (0.46 * 1400 - 0.4 * 1400) / (0.1 * 1400);
    var legacyFog = Math.max(0.4, 1 - 0.3 / 0.5 * 0.5);
    check('fade: inside the range every opaque fill is at globalAlpha 1 (colour fog, not the legacy see-through ' + legacyFog.toFixed(2) + ')',
      inside.length > 5 && inside.every(function (a) { return a === 1; }), inside.slice(0, 5));
    check('fade: in the last 20% of the range (0.5 viewDist) the opaque fills carry only the range fade',
      band.length > 5 && band.every(function (a) { return Math.abs(a - wantBand) < 1e-9; }), {want: wantBand, got: band.slice(0, 5)});
    var cave = G.spawnerModelInstance({x: 0, y: 0, underground: true}, 0, 1, {}), spawnCave = G.spawnerModelInstance({x: 0, y: 0, caveSpawnId: 'a'}, 0, 1, {});
    var plain = G.spawnerModelInstance({x: 0, y: 0}, 0, 1, {});
    check('fade: cave spawners (underground or caveSpawnId) take the cave shading roles; surface spawners do not',
      cave.cave === true && spawnCave.cave === true && plain.cave === false);
  }

  // ── fallback ──
  if (section('fallback')) {
    var sp6 = spawner({hp: 4});
    aim(sp6, 15, 150); G.enemySpawners = [sp6];
    G.setRenderFeatures({spawnerModel: false});
    frame(); H.record(true, true); G.drawEnemySpawners3D('opaque'); var legacyOpaque = H.record(false);
    frame(); H.record(true, true); G.drawEnemySpawners3D('overlay'); var legacyOverlay = H.record(false);
    frame(); H.record(true, true); G.drawEnemySpawners3D(); var legacyAll = H.record(false);
    check('fallback: with spawnerModel off the opaque phase draws nothing and the overlay phase is the whole legacy obelisk',
      legacyOpaque.entries === 0 && legacyOverlay.entries > 20 && legacyOverlay.hash() === legacyAll.hash(), {opaque: legacyOpaque.entries, overlay: legacyOverlay.entries});
    G.setRenderFeatures({spawnerModel: true});
    var realDef = G._spawnerModelDef, errorsBefore = H.errors.length;
    delete G.PROP_MODELS.spawnerObelisk;
    G._spawnerModelDef = function () { var d = realDef(); d.parts[0] = {name: 'broken', kind: 'box', min: [0, 0, 0], max: [0, 1, 1], material: 'spawnerObelisk', role: 'body'}; return d; };
    frame(); H.record(true, true); G.drawEnemySpawners3D(); var failedOpen = H.record(false);
    frame(); H.record(true, true); G.drawEnemySpawners3D(); var failedAgain = H.record(false);
    var reported = H.errors.slice(errorsBefore);
    H.errors.length = errorsBefore;
    G._spawnerModelDef = realDef; G._spawnerModelFailed = false;
    check('fallback: a rejected spawner definition is reported once and every spawner keeps the legacy path',
      !!G.spawnerModelFor() && failedOpen.hash() === legacyAll.hash() && failedAgain.hash() === legacyAll.hash() &&
      reported.length === 1 && /spawnerObelisk model rejected/.test(reported[0]), reported);
  }

  // ── pulse: Endless window copies carry pulsePhase only with the model ──
  var PRE_H_KEYS = 'x,y,hp,maxHp,cooldownMs,lastSpawn,spawnCount,maxSpawns,active,type,_chunkKey,_chunkIdx';
  function chunkPhase(sp) { var ch = G.chunks[sp._chunkKey]; return ch && ch.enemySpawners[sp._chunkIdx] ? ch.enemySpawners[sp._chunkIdx].pulsePhase : NaN; }
  if (section('pulse')) {
    G.applyRenderPreset('recommended');
    H.startEndless(7);
    var list = G.enemySpawners, phases = {}, copyBad = [];
    list.forEach(function (sp) {
      if (!(Number.isFinite(sp.pulsePhase) && sp.pulsePhase === chunkPhase(sp))) copyBad.push({key: sp._chunkKey, idx: sp._chunkIdx, got: sp.pulsePhase});
      phases[String(sp.pulsePhase)] = true;
    });
    var now = G.gameTimeNow(), tints = {};
    list.forEach(function (sp) { tints[G.spawnerModelInstance(sp, 0, G.spawnerPulse(sp, now), {}).tints.rune] = true; });
    out('NOTE pulse seed 7: ' + list.length + ' spawners, ' + Object.keys(phases).length + ' phases, ' + Object.keys(tints).length + ' rune tints at one instant');
    check('pulse: with spawnerModel on every Endless window spawner carries its chunk\'s pulsePhase, and the phases (so the rune tints at one instant) differ across the window',
      list.length >= 2 && copyBad.length === 0 && Object.keys(phases).length === list.length && Object.keys(tints).length >= 2,
      {n: list.length, bad: copyBad.slice(0, 2), phases: Object.keys(phases).length});
    var recordsOn = JSON.stringify(list);
    G.applyRenderPreset('legacy');
    var switchedOff = JSON.stringify(G.enemySpawners), keysOff = G.enemySpawners.map(function (sp) { return Object.keys(sp).join(); });
    H.startEndless(7);
    var legacyRecords = JSON.stringify(G.enemySpawners);
    check('pulse: under Legacy the window records are the pre-H ones (no pulsePhase: in-phase pulse); switching the preset strips the field from the live window at once',
      keysOff.length >= 2 && keysOff.every(function (k) { return k === PRE_H_KEYS; }) && switchedOff === legacyRecords && recordsOn !== legacyRecords,
      {keys: keysOff.slice(0, 1)});
    G.applyRenderPreset('recommended');
    check('pulse: switching back to Recommended restores every chunk phase in the live window',
      G.enemySpawners.length >= 2 && G.enemySpawners.every(function (sp) { return Number.isFinite(sp.pulsePhase) && sp.pulsePhase === chunkPhase(sp); }) &&
      JSON.stringify(G.enemySpawners) === recordsOn);
  }

  // ── lab smoke: render-lab/60-spawners.js on a real Endless window ──
  if (section('lab')) {
    (0, eval)(slurp('tools/game/render-lab/00-core.js'));
    (0, eval)(slurp('tools/game/render-lab/60-spawners.js'));
    H.startEndless(7);
    G.applyRenderPreset('recommended');
    var own = G.enemySpawners, wrappers = {clip: G.withSceneDepthClip, draw: G.drawEnemySpawners3D, now: Date.now, random: Math.random};
    var pitch0 = G.cam.pitch;
    G.RenderLabSpawners.row(60);
    var fixture = G.enemySpawners, pitched = G.cam.pitch, snap = JSON.stringify(G.renderFeatureSnapshot()), r = G.RenderLabSpawners.counts('smoke');
    out('NOTE lab ' + r.text);
    G.RenderLabSpawners.restore();
    check('lab: row() poses three obelisks with spawnerModel on; counts() sees the legacy and the model obelisks, then restores the switches, wrappers and clocks; restore() puts the spawners and the camera pitch back',
      fixture.length === 3 && fixture[1].hp < fixture[1].maxHp && r.model.faces === 3 * 21 && r.model.drawn >= 12 && r.legacy.faces === 0 &&
      r.legacy.tested > 1000 && r.model.statTested > 1000 &&
      JSON.stringify(G.renderFeatureSnapshot()) === snap && G.renderFeatureSnapshot().spawnerModel === true &&
      G.withSceneDepthClip === wrappers.clip && G.drawEnemySpawners3D === wrappers.draw && Date.now === wrappers.now &&
      Math.random === wrappers.random && G.enemySpawners === own && pitched !== pitch0 && G.cam.pitch === pitch0, r);
    var walks = [[8, false], [14, false], [8, true]].map(function (w) {
      G.RenderLabSpawners.walkIn(w[0], w[1]);
      var c = G.RenderLabSpawners.counts('walk-in'), pose = G.enemySpawners;
      G.RenderLabSpawners.restore();
      return {d: w[0], away: w[1], n: pose.length, faces: c.model.faces, calls: [c.legacy.calls, c.model.calls], tested: [c.legacy.tested, c.model.tested]};
    });
    out('NOTE lab walk-in ' + JSON.stringify(walks));
    check('lab: walkIn() centres an obelisk 8 or 14 units from the camera (facing it or away) on the real Endless frame: the model builds no face and the spawner takes exactly the legacy depth tests; restore() puts everything back',
      walks.every(function (w) { return w.n === 1 && w.faces === 0 && w.calls[0] === w.calls[1] && w.tested[0] === w.tested[1]; }) &&
      G.enemySpawners === own && G.cam.pitch === pitch0 && G.renderFeatureSnapshot().spawnerModel === true, walks);
    var cfg = G.RenderLabSpawners.CONFIGS;
    check('lab: the timing configurations are Recommended with spawnerModel off (A) and on (B)',
      cfg.legacy.preset === 'recommended' && cfg.legacy.features.spawnerModel === false && cfg.model.features.spawnerModel === true, cfg);
  }

  check('no console errors', H.errors.length === 0, H.errors.slice(0, 3));
  out('SPAWNER_MODEL_RESULT ' + (failed ? 'FAIL ' : 'PASS ') + checked + ' failed ' + failed);
}());
undefined;
