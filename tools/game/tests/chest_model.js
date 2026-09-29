// The treasure-chest model (integration stage G1) and drawTreasureChests3D's
// model path, through the real MAIN manifest (render_host.js). Oracles are
// independent of the model code: the chest frame is the legacy formula
// (fw = (cos f, sin f) is the lock side, rt = (-sin f, cos f)); the part
// extents are the G1 spec written out here (body 14 x 10 x 8 open at the top,
// lid 3 on it hinged at the back top edge, 0..100 degrees; trim band 0.38..0.55
// of the body height, strap +-0.15 of the half width, both 0.3 proud; lock
// plate 2.8 x 2.4 at 0.47, 0.3 proud of the strap); normals are recomputed
// from the emitted world vertices (Newell); depths are ray/plane and
// ray/box intersections through a pixel centre with the camera's pinhole
// formula. Depth comes from the production scene-depth code. Not a
// rasterizer or browser: no pixel colours, timing or compositing claims.
// Checks print PASS/FAIL and keep going, so a mutation names what it broke.
// Mutations (evaluated copies only; each anchor must match exactly once):
//   --swap-right-out    chestModelBasis uses the mirrored structure basis
//                       (right and out swapped)
//   --flip-normal       buildModelFaces emits inward normals (the cull is
//                       inverted)
//   --hinge-at-lid-top  the lid hinges at the lid's top back edge (lidTopZ)
//   --lid-shear         the lid opens by the legacy shear (back edge fixed,
//                       front edge raised 1.8 x lidH and pushed 0.4 x hd)
//   --halo-at-centre    the glow halo is depth-tested at the chest centre
//   --see-through-fog   the opaque parts keep the legacy see-through fog alpha
//   --overlay-in-opaque the overlays are drawn in the opaque phase too
// --sections a,b runs only: spec, joints, normals, depth, phase, overlay,
// fade, fallback, lab.
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
      source = swap(source, '--swap-right-out', 'function chestModelBasis(ch, out) { return modelBasis(',
        'function chestModelBasis(ch, out) { return structureModelBasis(');
      source = swap(source, '--flip-normal', '      rec.normal.x = nl[0] * RX + nl[1] * OX; rec.normal.y = nl[0] * RY + nl[1] * OY; rec.normal.z = nl[2];\n',
        '      rec.normal.x = -(nl[0] * RX + nl[1] * OX); rec.normal.y = -(nl[0] * RY + nl[1] * OY); rec.normal.z = -nl[2];\n');
      source = swap(source, '--hinge-at-lid-top', "hinge = {name: 'lid', origin: [0, -L, H],", "hinge = {name: 'lid', origin: [0, -L, top],");
      if (flag('--lid-shear')) {
        source = swap(source, '--lid-shear',
          '        var p = angle ? _pmRotate(src.points[j], hinge.axis, hinge.origin, hc, hs, _pmPoint) : src.points[j], uv = src.uv[j];\n',
          '        var p = angle ? _pmTestShear(src.points[j], hinge.origin, angle / CHEST_LID_MAX) : src.points[j], uv = src.uv[j];\n');
        source += '\nfunction _pmTestShear(p, o, lid) { var t = (p[1] - o[1]) / 10; _pmPoint[0] = p[0]; _pmPoint[1] = p[1] + t * lid * 2; ' +
          '_pmPoint[2] = p[2] + t * lid * 5.4; return _pmPoint; }\n';
      }
      return source;
    }
    if (path !== DECOR) return source;
    source = swap(source, '--halo-at-centre', '      glowP.fwd + CHEST_HALO_BEHIND, function () {\n', '      glowP.fwd, function () {\n');
    source = swap(source, '--see-through-fog', '  if (entry.fade < 1) ctx.globalAlpha = alpha * entry.fade;\n',
      '  ctx.globalAlpha = alpha * Math.max(0.5, 1.0 - Math.max(1, entry.fwd) / viewDist * 0.4) * entry.fade;\n');
    source = swap(source, '--overlay-in-opaque',
      '  for (var n = visible.length - 1; wantOpaque && n >= 0; n--) drawTreasureChestModelOpaque(visible[n], C);\n',
      '  for (var n = visible.length - 1; wantOpaque && n >= 0; n--) { drawTreasureChestModelOpaque(visible[n], C); drawTreasureChestModelOverlay(visible[n], C, now); }\n');
    return source;
  });
  check('real manifest loads with the chest model and no console errors',
    loaded > 40 && typeof G.chestModelFor === 'function' && typeof G.drawTreasureChestModels3D === 'function' && H.errors.length === 0,
    {loaded: loaded, errors: H.errors.slice(0, 3)});

  // ── Fixture: an empty flat world; camera eye 20 above the chest's support ──
  var W = 320, HT = 240, PS = 180, EPS = 1e-9, TIERS = ['common', 'uncommon', 'rare', 'epic'];
  var HW = 7, HD = 5, BODY = 8, LIDH = 3, PROUD = 0.3, LOCKZ = 0.47 * BODY, LID_MAX = 100 * Math.PI / 180;
  function world() {
    G.cell = 12; G.gridW = G.gridH = 64; G.grid = new Uint8Array(64 * 64);
    G.floorMesh = null; G.gridCave = null; G.deepCaveRegions = []; G.deepCaveEntrances = [];
    G.windowOriginX = G.windowOriginY = 0; G.CANVAS_BASE_H = 240; G.viewDist = 1400;
    G.canvas.width = W; G.canvas.height = HT; G.projScale = PS; G.MODE3D = true;
    G.cam = {x: 0, y: 0, z: -4, ang: 0, pitch: 0, fov: Math.PI / 2};   // cameraZ = 20
    G.applyRenderPreset('recommended'); G.setRenderFeatures({chestModel: true});
    G.updateDayNight(0);
  }
  world();
  function frame() { G.beginSceneDepthFrame(W, HT); G.beginRenderFrameStats(); }
  function chest(extra) {
    var c = {x: 200, y: 150, renderFloorZ: 0, tier: 'common', facing: 0.4, lidAngle: 0, opened: false, gold: 12, seed: 3};
    for (var k in extra || {}) c[k] = extra[k];
    return c;
  }
  // The legacy chest frame (07-decorations-lighting.js), written out.
  function frameOf(ch) {
    var f = ch.facing || 0;
    return {fx: Math.cos(f), fy: Math.sin(f), rx: -Math.sin(f), ry: Math.cos(f), x: ch.x, y: ch.y, z: G.getEntityRenderFloorZ(ch)};
  }
  function toLocal(F, p) {
    var dx = p.x - F.x, dy = p.y - F.y;
    return {r: dx * F.rx + dy * F.ry, o: dx * F.fx + dy * F.fy, z: p.z - F.z};
  }
  function build(ch) {
    var model = G.chestModelFor(ch.tier), buf = G.createModelFaceBuffer();
    G.buildModelFaces(model, G.chestModelInstance(ch, G.getEntityRenderFloorZ(ch), {}), buf);
    var faces = [];
    for (var i = 0; i < buf.count; i++) {
      var f = buf.faces[i];
      faces.push({part: f.partName, role: f.role, flags: f.flags, normal: {x: f.normal.x, y: f.normal.y, z: f.normal.z},
        v: f.vertices.map(function (v) { return {x: v.x, y: v.y, z: v.z, u: v.u, v: v.v}; })});
    }
    return faces;
  }
  function extent(F, faces, part) {
    var mn = {r: Infinity, o: Infinity, z: Infinity}, mx = {r: -Infinity, o: -Infinity, z: -Infinity};
    faces.forEach(function (f) {
      if (part && f.part !== part) return;
      f.v.forEach(function (p) {
        var l = toLocal(F, p);
        ['r', 'o', 'z'].forEach(function (k) { mn[k] = Math.min(mn[k], l[k]); mx[k] = Math.max(mx[k], l[k]); });
      });
    });
    return [mn.r, mx.r, mn.o, mx.o, mn.z, mx.z];
  }
  function near(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-9); }
  function nearAll(a, b, tol) { return a.length === b.length && a.every(function (x, i) { return near(x, b[i], tol); }); }

  // ── spec ──
  if (section('spec')) {
    var def = G.RENDER_FEATURE_DEFS.filter(function (d) { return d.key === 'chestModel'; })[0];
    // Restated in Stage G2: the default was flipped ON (G1 registered it OFF);
    // Legacy stays OFF, and the legacy path keeps its own explicit cases
    // (loot_visibility's 'legacy chest painter order').
    check('spec: chestModel is registered default ON (flipped in stage G2) and OFF in Legacy',
      !!def && def.type === 'bool' && def.default === true && def.legacy === false && G.renderFeaturePreset('legacy').chestModel === false &&
      G.renderFeaturePreset('recommended').chestModel === true, def);
    var keys = Object.keys(G.GAME_MATERIAL_COLORS), bone = keys.indexOf('bone'), matProblems = [];
    TIERS.forEach(function (tier) {
      var id = 'chest' + tier.charAt(0).toUpperCase() + tier.slice(1), m = G.GAME_MATERIAL_COLORS[id], td = G.CHEST_TIER_DEFS[tier];
      if (!m || keys.indexOf(id) <= bone) { matProblems.push(id + ' missing or not after bone'); return; }
      var want = {body: td.body, lid: td.lidTop, trim: td.trim, lock: td.lock, glow: td.glow};
      Object.keys(want).forEach(function (role) { if (m[role] !== want[role]) matProblems.push(id + '.' + role); });
      if (!/^#[0-9a-f]{6}$/.test(m.interior) || parseInt(m.interior.slice(1, 3), 16) > 0x30) matProblems.push(id + '.interior not dark');
    });
    check('spec: chestCommon..chestEpic are appended after bone; body, lid, trim, lock and glow are the legacy tier colours and the interior is dark',
      bone >= 0 && matProblems.length === 0, matProblems);
    var modelProblems = [];
    TIERS.concat(['mystery']).forEach(function (tier) {
      var m = G.chestModelFor(tier), id = tier === 'mystery' ? 'chestCommon' : 'chest' + tier.charAt(0).toUpperCase() + tier.slice(1);
      if (!m || m.key !== id || m.family !== 'chest' || m.faceCount !== 56 || !m.parts.every(function (p) { return p.material === id && p.uvScale === 14; }))
        modelProblems.push({tier: tier, key: m && m.key, faces: m && m.faceCount});
    });
    check('spec: one model per tier (an unknown tier uses common), family chest, the tier material and uvScale 14 on every part, 56 faces',
      modelProblems.length === 0 && G.chestModelsReady() === true, modelProblems);
    // Part extents in the legacy frame, the G1 spec written out: [r0, r1, o0, o1, z0, z1].
    var SPEC = {
      wallBack: [-HW, HW, -HD, -HD + 0.7, 0, BODY], wallFront: [-HW, HW, HD - 0.7, HD, 0, BODY],
      wallLeft: [-HW, -HW + 0.7, -HD + 0.7, HD - 0.7, 0, BODY], wallRight: [HW - 0.7, HW, -HD + 0.7, HD - 0.7, 0, BODY],
      floor: [-HW + 0.7, HW - 0.7, -HD + 0.7, HD - 0.7, 0.8, 0.8], mouth: [-HW + 0.7, HW - 0.7, -HD + 0.7, HD - 0.7, BODY, BODY],
      lid: [-HW, HW, -HD, HD, BODY, BODY + LIDH], lidTrim: [-HW, HW, HD, HD + PROUD, BODY + LIDH - 0.8, BODY + LIDH],
      trim: [-HW, HW, HD, HD + PROUD, 0.38 * BODY, 0.55 * BODY], strap: [-0.15 * HW, 0.15 * HW, HD, HD + PROUD, 0, BODY],
      lock: [-1.4, 1.4, HD, HD + 2 * PROUD, LOCKZ - 1.2, LOCKZ + 1.2]};
    var partProblems = [], cornerProblems = [];
    for (var k = 0; k < 8; k++) {
      var ch = chest({facing: k * Math.PI / 4 + 0.3, x: 512, y: -64, renderFloorZ: 2}), F = frameOf(ch), faces = build(ch);
      Object.keys(SPEC).forEach(function (part) {
        var e = extent(F, faces, part);
        if (!nearAll(e, SPEC[part], 1e-9)) partProblems.push({facing: k, part: part, got: e.map(function (v) { return +v.toFixed(4); })});
      });
      // The four outer body corners of the legacy chest: c0 front-left .. c3 back-left.
      var corners = [[HD, -HW], [HD, HW], [-HD, HW], [-HD, -HW]].map(function (c) {
        return {x: F.x + F.fx * c[0] + F.rx * c[1], y: F.y + F.fy * c[0] + F.ry * c[1]};
      });
      corners.forEach(function (c, ci) {
        [2, 2 + BODY].forEach(function (z) {
          var hit = faces.some(function (f) { return /^wall/.test(f.part) && f.v.some(function (p) { return near(p.x, c.x, 1e-9) && near(p.y, c.y, 1e-9) && near(p.z, z, 1e-9); }); });
          if (!hit) cornerProblems.push({facing: k, corner: 'c' + ci, z: z});
        });
      });
    }
    check('spec: the body footprint is the legacy chest (corners c0..c3 from the legacy formula) at 8 facings, and trim, strap and lock plate stand on the lock side',
      cornerProblems.length === 0 && partProblems.filter(function (p) { return /^(trim|strap|lock)$/.test(p.part); }).length === 0,
      {corners: cornerProblems.slice(0, 3), parts: partProblems.slice(0, 3)});
    check('spec: every part has the G1 extents in the chest frame (open body, lid 3 on top, details 0.3 proud, lock 0.3 out of the strap)',
      partProblems.length === 0, partProblems.slice(0, 4));
    var roleProblems = [], F0 = frameOf(chest()), faces0 = build(chest());
    faces0.forEach(function (f, fi) {
      if (!/^wall/.test(f.part)) return;
      var c = {x: 0, y: 0, z: 0};
      f.v.forEach(function (p) { c.x += p.x / f.v.length; c.y += p.y / f.v.length; c.z += p.z / f.v.length; });
      var inward = f.normal.x * (F0.x - c.x) + f.normal.y * (F0.y - c.y) > 1e-9, l = toLocal(F0, c);
      var inner = inward && Math.abs(l.r) < HW - 0.35 && Math.abs(l.o) < HD - 0.35;   // faces the interior cavity
      if ((f.role === 'interior') !== inner) roleProblems.push({face: fi, part: f.part, role: f.role, inner: inner});
    });
    var floorFace = faces0.filter(function (f) { return f.part === 'floor'; })[0], lidBottom = faces0.filter(function (f) { return f.part === 'lid' && f.normal.z < -0.5; })[0];
    check('spec: the wall faces toward the cavity, the interior floor and the lid underside are the dark interior; outer faces are body',
      roleProblems.length === 0 && floorFace.role === 'interior' && lidBottom.role === 'interior', roleProblems.slice(0, 4));
  }

  // ── joints ──
  if (section('joints')) {
    var FACINGS = [0, 1.1, Math.PI, 4.4], LIDS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
    function lidFaces(faces) { return faces.filter(function (f) { return f.part === 'lid' || f.part === 'lidTrim'; }); }
    function edges(face) { return face.v.map(function (p, i) { var q = face.v[(i + 1) % face.v.length]; return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z); }); }
    var lengthProblems = [], hingeProblems = [], seatProblems = [], angleProblems = [], uvProblems = [];
    var closedUV = build(chest({facing: 0})).map(function (f) { return f.v.map(function (p) { return [p.u, p.v]; }); });
    FACINGS.forEach(function (facing) {
      var base = chest({facing: facing}), F = frameOf(base), closed = lidFaces(build(base));
      // The hinge edge: the closed lid's vertices on the body's back top edge (o = -5, z = 8).
      var hingeIdx = [];
      closed.forEach(function (f, fi) { f.v.forEach(function (p, vi) { var l = toLocal(F, p); if (near(l.o, -HD, 1e-9) && near(l.z, BODY, 1e-9)) hingeIdx.push([fi, vi]); }); });
      if (hingeIdx.length < 4) hingeProblems.push({facing: facing, hingeVertices: hingeIdx.length});
      // Closed: the lid's underside is the body top, footprint for footprint.
      var under = closed.filter(function (f) { return f.part === 'lid' && f.normal.z < -0.5; })[0];
      var ue = extent(F, [under]);
      if (!under || !nearAll(ue, [-HW, HW, -HD, HD, BODY, BODY], 1e-9)) seatProblems.push({facing: facing, underside: ue});
      LIDS.forEach(function (lid) {
        var faces = build(chest({facing: facing, lidAngle: lid})), open = lidFaces(faces);
        open.forEach(function (f, fi) {
          var a = edges(closed[fi]), b = edges(f);
          if (!nearAll(a, b, 1e-9)) lengthProblems.push({facing: facing, lid: lid, face: fi, closed: a, open: b});
        });
        hingeIdx.forEach(function (ix) {
          var p = open[ix[0]].v[ix[1]], q = closed[ix[0]].v[ix[1]], l = toLocal(F, p);
          if (Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) > 1e-9 || !near(l.o, -HD, 1e-9) || !near(l.z, BODY, 1e-9) || Math.abs(l.r) > HW + 1e-9)
            hingeProblems.push({facing: facing, lid: lid, moved: Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)});
        });
        // The lid's front bottom edge swings about the hinge by lid x 100 degrees.
        var a = lid * LID_MAX, wantO = -HD + 2 * HD * Math.cos(a), wantZ = BODY + 2 * HD * Math.sin(a);
        var lidFront = open.filter(function (f) { return f.part === 'lid'; });
        var found = 0;
        lidFront.forEach(function (f) { f.v.forEach(function (p) { var l = toLocal(F, p); if (near(l.o, wantO, 1e-9) && near(l.z, wantZ, 1e-9)) found++; }); });
        if (found < 2) angleProblems.push({facing: facing, lid: lid, wantO: wantO, wantZ: wantZ});
        faces.forEach(function (f, fi) {
          var want = closedUV[fi];
          if (!f.v.every(function (p, vi) { return p.u === want[vi][0] && p.v === want[vi][1]; })) uvProblems.push({facing: facing, lid: lid, face: fi, part: f.part});
        });
      });
    });
    check('joints: lid and lid-trim edge lengths are invariant from lidAngle 0 to 1', lengthProblems.length === 0, lengthProblems.slice(0, 2));
    check('joints: the hinge edge is fixed: the lid\'s back bottom edge stays on the body\'s back top edge at every angle', hingeProblems.length === 0, hingeProblems.slice(0, 3));
    check('joints: the closed lid sits on the body top (its underside is the body footprint at bodyTopZ: no floating lid)', seatProblems.length === 0, seatProblems.slice(0, 3));
    check('joints: the lid\'s front bottom edge swings about the hinge by lidAngle x 100 degrees', angleProblems.length === 0, angleProblems.slice(0, 3));
    check('joints: UVs are unchanged by facing, position and lid angle (assigned in part-local space)', uvProblems.length === 0, uvProblems.slice(0, 3));
  }

  // ── normals ──
  if (section('normals')) {
    var normalProblems = [];
    [0, 0.7, 2.2, 3.9, 5.1].forEach(function (facing) {
      [0, 0.6].forEach(function (lid) {
        var faces = build(chest({facing: facing, lidAngle: lid})), centres = {};
        faces.forEach(function (f) {
          var c = centres[f.part] || (centres[f.part] = {x: 0, y: 0, z: 0, n: 0});
          f.v.forEach(function (p) { c.x += p.x; c.y += p.y; c.z += p.z; c.n++; });
        });
        faces.forEach(function (f, fi) {
          var nx = 0, ny = 0, nz = 0;
          for (var i = 0; i < f.v.length; i++) {
            var a = f.v[i], b = f.v[(i + 1) % f.v.length];
            nx += (a.y - b.y) * (a.z + b.z); ny += (a.z - b.z) * (a.x + b.x); nz += (a.x - b.x) * (a.y + b.y);
          }
          var len = Math.hypot(nx, ny, nz), c = centres[f.part], fc = {x: 0, y: 0, z: 0};
          f.v.forEach(function (p) { fc.x += p.x / f.v.length; fc.y += p.y / f.v.length; fc.z += p.z / f.v.length; });
          var same = near(f.normal.x, nx / len, 1e-9) && near(f.normal.y, ny / len, 1e-9) && near(f.normal.z, nz / len, 1e-9);
          var outward = !f.flags.closed || (fc.x - c.x / c.n) * f.normal.x + (fc.y - c.y / c.n) * f.normal.y + (fc.z - c.z / c.n) * f.normal.z > 0;
          if (!same || !outward) normalProblems.push({facing: facing, lid: lid, face: fi, part: f.part, same: same, outward: outward});
        });
      });
    });
    check('normals: every emitted normal is the Newell normal of its world vertices and points out of its closed part', normalProblems.length === 0, normalProblems.slice(0, 3));
  }

  // ── depth: who owns the lock plate's pixel ──
  var C;
  function aim(ch, azDeg, dist) {
    var F = frameOf(ch), a = ch.facing + azDeg * Math.PI / 180;
    var lx = F.x + F.fx * (HD + 2 * PROUD), ly = F.y + F.fy * (HD + 2 * PROUD);
    G.cam.x = F.x + Math.cos(a) * dist; G.cam.y = F.y + Math.sin(a) * dist;
    G.cam.ang = Math.atan2(ly - G.cam.y, lx - G.cam.x);
    C = G.getCam3D();
    return F;
  }
  function project(p) {
    var dx = p.x - G.cam.x, dy = p.y - G.cam.y, depth = dx * C.cosAng + dy * C.sinAng, right = -dx * C.sinAng + dy * C.cosAng;
    return {x: (right / depth * C.invTanHalf * 0.5 + 0.5) * C.w, y: C.horizonY + (C.cameraZ - p.z) / depth * PS, depth: depth};
  }
  // The ray through a pixel centre, per unit of camera depth, in the chest frame.
  function pixelRay(F, px, py) {
    var rOverD = ((px + 0.5) / C.w - 0.5) * 2 / C.invTanHalf, zOverD = (py + 0.5 - C.horizonY) / PS;
    var dir = {x: C.cosAng - C.sinAng * rOverD, y: C.sinAng + C.cosAng * rOverD, z: -zOverD};
    var o = toLocal(F, {x: G.cam.x, y: G.cam.y, z: C.cameraZ});
    return {o: o, d: {r: dir.x * F.rx + dir.y * F.ry, o: dir.x * F.fx + dir.y * F.fy, z: dir.z}};
  }
  // Slab entry of the closed chest's hull (body + closed lid) along the ray.
  function hullEntry(ray) {
    var lo = {r: -HW, o: -HD, z: 0}, hi = {r: HW, o: HD, z: BODY + LIDH}, tNear = -Infinity, tFar = Infinity, face = '';
    ['r', 'o', 'z'].forEach(function (k) {
      var t1 = (lo[k] - ray.o[k]) / ray.d[k], t2 = (hi[k] - ray.o[k]) / ray.d[k], a = Math.min(t1, t2), b = Math.max(t1, t2);
      if (a > tNear) { tNear = a; face = k + (t1 < t2 ? '-' : '+'); }
      tFar = Math.min(tFar, b);
    });
    return tNear <= tFar && tNear > 0 ? {depth: tNear, face: face} : null;
  }
  function lockDepthCase(azDeg, lid, cull) {
    var ch = chest({lidAngle: lid}), F = aim(ch, azDeg, 80);
    G.setRenderFeatures({modelBackfaceCull: cull});
    G.treasureChests = [ch]; frame(); G.drawTreasureChests3D();
    G.setRenderFeatures({modelBackfaceCull: true});
    var pc = project({x: F.x + F.fx * (HD + 2 * PROUD), y: F.y + F.fy * (HD + 2 * PROUD), z: F.z + LOCKZ});
    var px = Math.floor(pc.x), py = Math.floor(pc.y), ray = pixelRay(F, px, py), got = G.sceneDepthAt(px, py);
    var tPlate = (HD + 2 * PROUD - ray.o.o) / ray.d.o, hit = {r: ray.o.r + ray.d.r * tPlate, z: ray.o.z + ray.d.z * tPlate};
    return {az: azDeg, lid: lid, cull: cull, px: px, py: py, got: got, plate: tPlate, onPlate: Math.abs(hit.r) < 1.4 && Math.abs(hit.z - LOCKZ) < 1.2,
      hull: hullEntry(ray)};
  }
  if (section('depth')) {
    var front = [], back = [], frontBad = [], backBad = [];
    [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].forEach(function (az) {
      var lockSide = Math.cos(az * Math.PI / 180) > 0;
      [true, false].forEach(function (cull) {
        (lockSide ? [0, 1] : [0]).forEach(function (lid) {
          var r = lockDepthCase(az, lid, cull);
          if (lockSide) {
            front.push(r);
            if (!r.onPlate || !(Math.abs(r.got - r.plate) < 0.01)) frontBad.push(r);
          } else {
            back.push(r);
            if (!r.hull || !(Math.abs(r.got - r.hull.depth) < 0.01) || !(r.plate > r.got + 5)) backBad.push(r);
          }
        });
      });
    });
    out('NOTE depth lock side ' + front.filter(function (r) { return r.cull && !r.lid; }).map(function (r) { return r.az + ':' + r.got.toFixed(3) + '/' + r.plate.toFixed(3); }).join(' ') +
      ' | behind ' + back.filter(function (r) { return r.cull; }).map(function (r) { return r.az + ':' + r.got.toFixed(3) + '/' + (r.hull ? r.hull.face + r.hull.depth.toFixed(3) : 'miss') + ' plate ' + r.plate.toFixed(2); }).join(' '));
    check('depth: from the lock side (22.5 + k x 45 degrees, lid shut and open, cull on and off) the final depth at the lock plate\'s pixel is the plate\'s analytic depth',
      front.length === 16 && frontBad.length === 0, frontBad.slice(0, 3));
    check('depth: from behind it is the analytic depth of the chest\'s own nearer hull face (back or side), well behind the plate',
      back.length === 8 && backBad.length === 0, backBad.slice(0, 3));
  }

  // ── phase ──
  var realBillboard = G.withSceneDepthBillboard, billboards = [], realFill = G.fillSceneDepthPolygon, fills = [];
  function instrument(on) {
    if (on) {
      billboards = []; fills = [];
      G.withSceneDepthBillboard = function (bounds, depth) { billboards.push({x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height, depth: depth}); return realBillboard.apply(this, arguments); };
      G.fillSceneDepthPolygon = function () { fills.push(G.ctx.globalAlpha); return realFill.apply(this, arguments); };
    } else { G.withSceneDepthBillboard = realBillboard; G.fillSceneDepthPolygon = realFill; }
  }
  function depthCopy() { return Array.prototype.slice.call(G._sceneDepthInv, 0, W * HT); }
  function sameDepth(a, b) { for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
  function written(a) { var n = 0; for (var i = 0; i < a.length; i++) if (a[i] > 0) n++; return n; }
  if (section('phase')) {
    var epic = chest({tier: 'epic', lidAngle: 0.6, opened: true, relicId: G.RELIC_KEYS[0]});
    aim(epic, 30, 70); G.treasureChests = [epic];
    frame(); instrument(true); G.drawTreasureChests3D('opaque'); instrument(false);
    var afterOpaque = depthCopy(), opaqueBillboards = billboards.length, opaqueFills = fills.length;
    check('phase: the opaque phase writes the chest to depth and draws no billboard',
      opaqueBillboards === 0 && opaqueFills > 10 && written(afterOpaque) > 200, {billboards: opaqueBillboards, fills: opaqueFills, px: written(afterOpaque)});
    instrument(true); G.drawTreasureChests3D('overlay'); instrument(false);
    check('phase: the overlay phase draws the halo, sparkle, 4 epic particles and the loot label (7 billboards) and writes no depth',
      billboards.length === 7 && fills.length === 0 && sameDepth(afterOpaque, depthCopy()), {billboards: billboards.length, fills: fills.length});
    frame(); H.record(true, true); G.drawTreasureChests3D(); var both = H.record(false);
    frame(); H.record(true, true); G.drawTreasureChests3D('opaque'); G.drawTreasureChests3D('overlay'); var split = H.record(false);
    check('phase: with no argument the call draws both phases, opaque first (same commands as opaque then overlay)',
      both.entries > 50 && both.hash() === split.hash(), {both: both.entries, split: split.entries});
  }

  // ── overlay anchors ──
  if (section('overlay')) {
    var haloBad = [], anchorBad = [];
    [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].forEach(function (az) {
      var ch = chest({lidAngle: 0.8, opened: true}), F = aim(ch, az, 60);
      G.treasureChests = [ch]; frame(); instrument(true); G.drawTreasureChests3D(); instrument(false);
      var halo = billboards[0], centre = project({x: F.x, y: F.y, z: F.z + BODY * 0.5}), deepest = -Infinity;
      build(ch).forEach(function (f) { if (/^(wall|lid)/.test(f.part)) f.v.forEach(function (p) { deepest = Math.max(deepest, project(p).depth); }); });
      if (!halo || Math.abs(halo.x + halo.w / 2 - Math.floor(centre.x)) > EPS || Math.abs(halo.y + halo.h / 2 - Math.floor(centre.y)) > EPS ||
          !(halo.depth > deepest + 0.15)) haloBad.push({az: az, halo: halo, deepest: deepest});
      var spark = G.projToScreen(F.x, F.y, F.z + BODY + LIDH + 3, C), label = G.projToScreen(F.x, F.y, F.z + BODY + LIDH + 8, C);
      var sb = billboards[1], lb = billboards[billboards.length - 1];
      if (!sb || sb.x + sb.w / 2 !== spark.sx || sb.y + sb.h / 2 !== spark.sy || sb.depth !== spark.fwd ||
          !lb || lb.x + lb.w / 2 !== label.sx || lb.depth !== label.fwd || billboards.length !== 3) anchorBad.push({az: az, n: billboards.length});
    });
    check('overlay: the glow halo is centred on the glow anchor and depth-tested behind every body and lid vertex (the chest hides it; nearer things still do)',
      haloBad.length === 0, haloBad.slice(0, 2));
    check('overlay: the sparkle and the loot label are billboards at their anchors (the legacy points: 3 and 8 above the lid top)',
      anchorBad.length === 0, anchorBad.slice(0, 2));
    var ch2 = chest({lidAngle: 0.8, opened: true}), F2 = aim(ch2, 20, 60);
    G.treasureChests = [ch2]; frame(); G.drawTreasureChests3D('opaque');
    var covered = project({x: F2.x, y: F2.y, z: F2.z + BODY * 0.5}), before = depthCopy();
    G.writeSceneDepthPolygon([{x: 0, y: 0, depth: 5}, {x: W, y: 0, depth: 5}, {x: W, y: HT, depth: 5}, {x: 0, y: HT, depth: 5}]);
    var clipResults = [], realClip = G.withSceneDepthClip;
    G.withSceneDepthClip = function () { var r = realClip.apply(this, arguments); clipResults.push(r); return r; };
    // Stage K restatement: modelEarlyReject (default ON) skips a hidden
    // model before its faces are built, so the mouth glow's per-face depth
    // test is exercised here with the switch off, and the on path below.
    G.setRenderFeatures({modelEarlyReject: false});
    G.drawTreasureChests3D('overlay'); G.withSceneDepthClip = realClip;
    G.setRenderFeatures({modelEarlyReject: true});
    check('overlay (modelEarlyReject off): a nearer occluder hides every overlay (halo, mouth glow, sparkle, label)',
      clipResults.length >= 4 && clipResults.every(function (r) { return r === 0; }) && written(before) > 0 && Number.isFinite(covered.depth), clipResults);
    var clipsOn = [], stOn;
    G.withSceneDepthClip = function () { var r = realClip.apply(this, arguments); clipsOn.push(r); return r; };
    G.beginRenderFrameStats();
    try { G.drawTreasureChests3D('overlay'); } finally { G.withSceneDepthClip = realClip; }
    stOn = G.getRenderFeatureStats().frame;
    check('overlay (modelEarlyReject on): behind the same occluder the mouth glow builds no faces (one early reject) and the halo, sparkle and label are depth-tested and hidden',
      clipsOn.length === 3 && clipsOn.every(function (r) { return r === 0; }) &&
      stOn.mdlChestRejected === 1 && !stOn.mdlChestFaces, {clips: clipsOn, rejected: stOn.mdlChestRejected, faces: stOn.mdlChestFaces});
  }

  // ── fade ──
  if (section('fade')) {
    function fadeCase(dist) {
      var ch = chest(); aim(ch, 10, dist); G.treasureChests = [ch];
      frame(); instrument(true); G.drawTreasureChests3D('opaque'); instrument(false);
      return fills.slice();
    }
    var inside = fadeCase(0.5 * 1400), band = fadeCase(0.66 * 1400), wantBand = 1 - (0.66 * 1400 - 0.56 * 1400) / (0.14 * 1400);
    var legacyFog = Math.max(0.5, 1 - 0.5 * 0.4);
    check('fade: inside the range every opaque fill is at globalAlpha 1 (colour fog, not the legacy see-through ' + legacyFog.toFixed(2) + ')',
      inside.length > 5 && inside.every(function (a) { return a === 1; }), inside.slice(0, 5));
    check('fade: in the last 20% of the range the opaque fills carry only the range fade',
      band.length > 5 && band.every(function (a) { return Math.abs(a - wantBand) < 1e-9; }), {want: wantBand, got: band.slice(0, 5)});
    var cave = G.chestModelInstance({x: 0, y: 0, underground: true}, 0, {}), spawn = G.chestModelInstance({x: 0, y: 0, caveSpawnId: 'a:chamber:0:chest'}, 0, {});
    var plain = G.chestModelInstance({x: 0, y: 0}, 0, {});
    check('fade: cave chests (underground or caveSpawnId) take the cave shading roles; surface chests do not',
      cave.cave === true && spawn.cave === true && plain.cave === false);
  }

  // ── fallback ──
  if (section('fallback')) {
    var ch3 = chest({lidAngle: 0.5, opened: true, tier: 'rare'});
    aim(ch3, 15, 70); G.treasureChests = [ch3];
    G.setRenderFeatures({chestModel: false});
    frame(); H.record(true, true); G.drawTreasureChests3D('opaque'); var legacyOpaque = H.record(false);
    frame(); H.record(true, true); G.drawTreasureChests3D('overlay'); var legacyOverlay = H.record(false);
    frame(); H.record(true, true); G.drawTreasureChests3D(); var legacyAll = H.record(false);
    check('fallback: with chestModel off the opaque phase draws nothing and the overlay phase is the whole legacy chest',
      legacyOpaque.entries === 0 && legacyOverlay.entries > 50 && legacyOverlay.hash() === legacyAll.hash(), {opaque: legacyOpaque.entries, overlay: legacyOverlay.entries});
    G.setRenderFeatures({chestModel: true});
    var realDef = G._chestModelDef, errorsBefore = H.errors.length;
    delete G.PROP_MODELS.chestRare;
    G._chestModelDef = function (key) { var d = realDef(key); d.parts[0] = {name: 'broken', kind: 'box', min: [0, 0, 0], max: [0, 1, 1], material: key, role: 'body'}; return d; };
    frame(); H.record(true, true); G.drawTreasureChests3D(); var failedOpen = H.record(false);
    var reported = H.errors.slice(errorsBefore);
    H.errors.length = errorsBefore;
    G._chestModelDef = realDef; delete G._chestModelFailed.chestRare;
    check('fallback: a rejected chest definition is reported once and every chest keeps the legacy path',
      G.chestModelsReady() === true && failedOpen.hash() === legacyAll.hash() && reported.length === 1 && /chestRare model rejected/.test(reported[0]), reported);
  }

  // ── lab smoke: render-lab/40-chests.js on a real Endless window ──
  if (section('lab')) {
    (0, eval)(slurp('tools/game/render-lab/00-core.js'));
    (0, eval)(slurp('tools/game/render-lab/40-chests.js'));
    H.startEndless(4242);
    G.applyRenderPreset('recommended');
    var own = G.treasureChests, wrappers = {clip: G.withSceneDepthClip, draw: G.drawTreasureChests3D, now: Date.now, random: Math.random};
    G.RenderLabChests.gallery(0, 0.5);
    var fixtureChests = G.treasureChests, snap = JSON.stringify(G.renderFeatureSnapshot()), r = G.RenderLabChests.counts('smoke');
    out('NOTE lab ' + r.text);
    G.RenderLabChests.restore();
    check('lab: gallery() shows the four tiers with chestModel on; counts() sees the legacy and the model chests, then restores the switches, wrappers and clocks; restore() puts the chests back',
      fixtureChests.length === 4 && fixtureChests.map(function (c) { return c.tier; }).join() === TIERS.join() &&
      r.model.faces === 4 * 56 && r.model.drawn >= 40 && r.legacy.faces === 0 && r.legacy.tested > 1000 && r.model.statTested > 1000 &&
      JSON.stringify(G.renderFeatureSnapshot()) === snap && G.renderFeatureSnapshot().chestModel === true &&
      G.withSceneDepthClip === wrappers.clip && G.drawTreasureChests3D === wrappers.draw && Date.now === wrappers.now &&
      Math.random === wrappers.random && G.treasureChests === own, r);
    var cfg = G.RenderLabChests.CONFIGS;
    check('lab: the timing configurations are Recommended with chestModel off (A) and on (B)',
      cfg.legacy.preset === 'recommended' && cfg.legacy.features.chestModel === false && cfg.model.features.chestModel === true, cfg);
  }

  check('no console errors', H.errors.length === 0, H.errors.slice(0, 3));
  out('CHEST_MODEL_RESULT ' + (failed ? 'FAIL ' : 'PASS ') + checked + ' failed ' + failed);
}());
undefined;
