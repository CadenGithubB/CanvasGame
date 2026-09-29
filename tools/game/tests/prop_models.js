// Shared model core (src/12-prop-models.js) driven through the real MAIN
// manifest (render_host.js). Oracles are authored geometry (hand-written
// quarter-turn corners, face counts, hinge positions), the production code
// the adapters must reproduce (ruinLocalToWorld, the chest corner lines of
// 07-decorations-lighting.js evaluated from source, drawStructureBoxWorld and
// the recorded fillSceneDepthPolygon inputs of drawRuins3D and
// drawStructureShellWorld) and invariants (manifold, outward winding, depth
// identity with culling on and off). Not a rasterizer: depth comes from the
// production scene-depth code; no pixel or browser claims.
// Checks print PASS/FAIL and keep going, so a mutation names what it broke.
// Mutations (evaluated copies only; each anchor must match exactly once):
//   --swap-right-out        modelBasis swaps its right and out axes
//   --drop-face             buildModelFaces skips each part's last face
//   --flip-handedness       the winding reversal uses the wrong basis sign
//   --world-uv              UVs are anchored to world x instead of the part
//   --invert-cull           back-face test keeps faces turned away instead
//   --sink-drops-triangles  drawRuinDecorFace's sink hook drops triangles
//   --ignore-near           culling exempts only a camera inside the bounds
//                           (the stage C behaviour), not the near plane
//   --cull-translucent      closed translucent parts are culled too
//   --shared-anchors        every model writes one shared anchors object
//   --clamp-tops            up-facing faces clamp shade + light at 1
//   --no-fade, --no-fog, --no-tint, --wrong-normal-shade, --no-alpha-restore
//                           drawWorldModel drops the fade alpha, the fog, the
//                           instance tint, passes -n.x/-n.y to the shading or
//                           leaves ctx.globalAlpha changed
//   --uv-scale-ignored      part UVs always use the default uvScale 32
// --sections a,b runs only the named sections: geometry, culling, world, load.
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
  function mutate(path, source) {
    if (path === MODELS) {
      source = swap(source, '--swap-right-out', '  out.outX = c; out.outY = s; out.rightX = -s; out.rightY = c;\n',
        '  out.outX = -s; out.outY = c; out.rightX = c; out.rightY = s;\n');
      source = swap(source, '--drop-face', '    for (var fi = 0; fi < part.faces.length; fi++) {\n',
        '    for (var fi = 0; fi < part.faces.length - 1; fi++) {\n');
      source = swap(source, '--flip-handedness', '  var reverse = RX * OY - RY * OX < 0;\n', '  var reverse = RX * OY - RY * OX > 0;\n');
      source = swap(source, '--world-uv', '        v.u = uv[0]; v.v = uv[1];\n', '        v.u = uv[0] + v.x / part.uvScale; v.v = uv[1];\n');
      source = swap(source, '--invert-cull', '(camZ - v0.z) <= 0) { culled++; continue; }', '(camZ - v0.z) > 0) { culled++; continue; }');
      source = swap(source, '--ignore-near', '        _pmNearDepth(out.parts[f.part], camX, camY, C.cosAng, C.sinAng) >= 1 &&\n',
        '        !(camX >= out.parts[f.part].minX && camX <= out.parts[f.part].maxX && camY >= out.parts[f.part].minY &&\n' +
        '          camY <= out.parts[f.part].maxY && camZ >= out.parts[f.part].minZ && camZ <= out.parts[f.part].maxZ) &&\n');
      source = swap(source, '--cull-translucent', '    if (cull && flags.closed && !flags.translucent &&\n', '    if (cull && flags.closed &&\n');
      source = swap(source, '--shared-anchors', '  out.anchors = anchorMaps[model.key] || (anchorMaps[model.key] = {});\n', '');
      source = swap(source, '--clamp-tops', '(nz > 0 ? renderSurfaceTopShade + light :', '(nz > 0 ? Math.min(1.0, renderSurfaceTopShade + light) :');
      source = swap(source, '--no-fade', '    var want = baseAlpha * worldFaceFadeAlpha(dist) * (flags.translucent ? f.alpha : 1);\n',
        '    var want = baseAlpha * (flags.translucent ? f.alpha : 1);\n');
      source = swap(source, '--no-fog', 'worldFaceFog(dist, inCave), inCave, flags.emissive);', '1, inCave, flags.emissive);');
      source = swap(source, '--no-tint', "    var packed = tints && f.tint !== 'none' && Number.isFinite(tints[f.tint]) ? tints[f.tint] :\n",
        "    var packed = false ? tints[f.tint] :\n");
      source = swap(source, '--wrong-normal-shade', 'var lit = worldFaceColor(packed, n.x, n.y, n.z,', 'var lit = worldFaceColor(packed, -n.x, -n.y, n.z,');
      source = swap(source, '--no-alpha-restore', '  if (alpha !== baseAlpha) ctx.globalAlpha = baseAlpha;\n', '');
      source = swap(source, '--uv-scale-ignored', '  return points.map(function(p) {\n', '  scale = 32; return points.map(function(p) {\n');
    }
    if (path === HUD) {
      source = swap(source, '--sink-drops-triangles',
        "  if (typeof _ruinDecorFaceSink === 'function') return _ruinDecorFaceSink(vertices, color, C);\n",
        "  if (typeof _ruinDecorFaceSink === 'function') return vertices.length < 4 ? 0 : _ruinDecorFaceSink(vertices, color, C);\n");
    }
    return source;
  }
  var fragmentSource = slurp('assets/games/' + MODELS);
  var loaded = H.loadManifest(mutate);
  check('real manifest loads with the model core and no console errors',
    loaded > 40 && typeof G.definePropModel === 'function' && typeof G.drawWorldModel === 'function' && H.errors.length === 0,
    {loaded: loaded, errors: H.errors.slice(0, 3)});

  var EPS = 1e-9, PI = Math.PI;
  function near(a, b, tol) { return Math.abs(a - b) <= (tol || EPS); }
  function build(model, inst) { var buf = G.createModelFaceBuffer(); G.buildModelFaces(model, inst, buf); return buf; }
  function facesOf(buf, partIndex) { return buf.faces.slice(0, buf.count).filter(function (f) { return partIndex === undefined || f.part === partIndex; }); }
  function key(p) { return [p.x, p.y, p.z].map(function (v) { return Math.round(v * 1e6); }).join(','); }
  function newell(vs) {
    var nx = 0, ny = 0, nz = 0;
    for (var i = 0; i < vs.length; i++) {
      var a = vs[i], b = vs[(i + 1) % vs.length];
      nx += (a.y - b.y) * (a.z + b.z); ny += (a.z - b.z) * (a.x + b.x); nz += (a.x - b.x) * (a.y + b.y);
    }
    var l = Math.hypot(nx, ny, nz); return {x: nx / l, y: ny / l, z: nz / l};
  }

  // Test models. Local frame: r = right, o = out, z = up (world units).
  var M = {};
  M.box = G.definePropModel({key: 'pmTestBox', parts: [{kind: 'box', min: [-7, -5, 0], max: [7, 5, 8], material: 'palisadeWood', role: 'mid'}]});
  var KIT_COUNTS = {base: 6, lid: 6, roof: 5, spire: 7, post: 6, cap: 5, gem: 4, sign: 1};
  // Authored uvScale per kit part; every other part takes the documented default of 32.
  var KIT_UV_SCALE = {roof: 24, spire: 16};
  M.kit = G.definePropModel({key: 'pmTestKit', parts: [
    {name: 'base', kind: 'box', min: [-20, -12, 0], max: [20, 12, 16], material: 'palisadeWood', role: 'mid'},
    {name: 'lid', kind: 'box', min: [-20, -12, 16], max: [20, 12, 22], material: 'palisadeWood', role: 'lit',
      hinge: {name: 'lid', origin: [0, -12, 16], axis: [1, 0, 0], min: 0, max: 2}, anchors: {lock: [0, 12, 19]}},
    {name: 'roof', kind: 'extrude', axis: 'r', profile: [[-14, 22], [14, 22], [0, 34]], from: -18, to: 18, material: 'palisadeWood', role: 'dark',
      uvScale: 24},
    {name: 'spire', kind: 'prism', sides: 6, radius: 5, z0: 34, z1: 46, taper: 0, rotation: 0.2, material: 'wallPropIron', role: 'base',
      uvScale: 16},
    {name: 'post', kind: 'frustum', center: [26, 0], z0: 0, z1: 20, bottom: [3, 3], top: [1.5, 1.5], shift: [1, 0.5],
      material: 'palisadeWood', role: 'deep', anchors: {postTop: [27, 0.5, 20]}},
    {name: 'cap', kind: 'frustum', center: [26, 0], z0: 20, z1: 26, bottom: [2, 2], top: [0, 0], material: 'wallPropIron', role: 'lit'},
    {name: 'gem', kind: 'mesh', vertices: [[-26, 0, 0], [-20, 0, 0], [-23, 5, 0], [-23, 2, 8]],
      triangles: [[0, 2, 1], [0, 1, 3], [1, 2, 3], [2, 0, 3]], flags: {closed: true}, material: 'wallPropIron', role: 'edge'},
    {name: 'sign', kind: 'quad', vertices: [[-6, 12.01, 4], [6, 12.01, 4], [6, 12.01, 12], [-6, 12.01, 12]],
      material: 'wallHeraldry', role: 'red', tint: 'banner', flags: {decal: true}}
  ]});
  M.glass = G.definePropModel({key: 'pmTestGlass', parts: [{kind: 'box', min: [-8, -8, 0], max: [8, 8, 16],
    material: 'wallPropIron', role: 'lit', flags: {translucent: true}, alpha: 0.5}]});
  M.room = G.definePropModel({key: 'pmTestRoom', parts: [{kind: 'box', min: [-60, -60, 0], max: [60, 60, 80], material: 'palisadeWood', role: 'mid'}]});
  M.pillar = G.definePropModel({key: 'pmTestPillar', parts: [{kind: 'box', min: [-20, -20, 0], max: [20, 20, 60], material: 'palisadeWood', role: 'mid'}]});
  M.anchorA = G.definePropModel({key: 'pmTestAnchorA', parts: [{kind: 'box', min: [-5, -5, 0], max: [5, 5, 10], material: 'palisadeWood', role: 'mid',
    anchors: {lock: [0, 5, 5]}}]});
  M.anchorB = G.definePropModel({key: 'pmTestAnchorB', parts: [{kind: 'box', min: [-5, -5, 0], max: [5, 5, 10], material: 'palisadeWood', role: 'mid',
    anchors: {flame: [0, 0, 12]}}]});
  // Paint oracle model: an opaque box, a tinted decal and a translucent pane.
  M.paint = G.definePropModel({key: 'pmTestPaint', parts: [
    {name: 'body', kind: 'box', min: [-10, -10, 0], max: [10, 10, 20], material: 'palisadeWood', role: 'mid'},
    {name: 'flag', kind: 'quad', vertices: [[-6, 10.01, 4], [6, 10.01, 4], [6, 10.01, 12], [-6, 10.01, 12]],
      material: 'wallHeraldry', role: 'red', tint: 'banner', flags: {decal: true}},
    {name: 'pane', kind: 'box', min: [14, -4, 0], max: [16, 4, 10], material: 'wallPropIron', role: 'lit',
      flags: {translucent: true}, alpha: 0.5}]});
  var partIndex = {}; M.kit.parts.forEach(function (p, i) { partIndex[p.name] = i; });

  if (section('geometry')) {
    // ── Analytic corners: hand-written quarter-turn tables plus one random yaw ──
    var LOCAL = [[-7, -5], [7, -5], [7, 5], [-7, 5]];
    var TABLE = {
      '0': [[95, 193], [95, 207], [105, 207], [105, 193]],
      '1': [[107, 195], [93, 195], [93, 205], [107, 205]],
      '2': [[105, 207], [105, 193], [95, 193], [95, 207]],
      '3': [[93, 205], [107, 205], [107, 195], [93, 195]]
    };
    var cornerProblems = [];
    function cornerCase(label, yaw, expected) {
      var inst = {x: 100, y: 200, z: 3, basis: G.modelBasis(yaw)}, buf = build(M.box, inst), have = {};
      facesOf(buf).forEach(function (f) { f.vertices.forEach(function (v) { have[key(v)] = true; }); });
      LOCAL.forEach(function (lc, i) {
        [[0, 3], [8, 11]].forEach(function (zz) {
          var w = G.modelLocalToWorld(inst, lc[0], lc[1], zz[0], {});
          if (!near(w.x, expected[i][0]) || !near(w.y, expected[i][1]) || !near(w.z, zz[1]))
            cornerProblems.push({yaw: label, local: lc, z: zz[0], got: [w.x, w.y, w.z], want: expected[i]});
          if (!have[key({x: expected[i][0], y: expected[i][1], z: zz[1]})])
            cornerProblems.push({yaw: label, local: lc, missingFromFaces: expected[i]});
        });
      });
      if (Object.keys(have).length !== 8) cornerProblems.push({yaw: label, distinctVertices: Object.keys(have).length});
    }
    [0, 1, 2, 3].forEach(function (q) { cornerCase('q' + q, q * PI / 2, TABLE[q]); });
    var ry = 0.7317, rc = Math.cos(ry), rs = Math.sin(ry);
    cornerCase('random', ry, LOCAL.map(function (lc) { return [100 + lc[1] * rc - lc[0] * rs, 200 + lc[1] * rs + lc[0] * rc]; }));
    check('box corners match the hand-written quarter-turn tables and a random yaw (out=(cos,sin), right=(-sin,cos))',
      cornerProblems.length === 0, cornerProblems.slice(0, 4));

    // ── Closed parts: face counts, manifold, outward winding, both handedness ──
    var manifoldProblems = [], orientProblems = [];
    [['modelBasis', G.modelBasis(0.37)], ['structureBasis', G.structureModelBasis(0.37)]].forEach(function (b) {
      var buf = build(M.kit, {x: 40, y: -25, z: 5, basis: b[1], joints: {lid: 1.1}});
      M.kit.parts.forEach(function (part, pi) {
        var faces = facesOf(buf, pi);
        if (faces.length !== KIT_COUNTS[part.name]) manifoldProblems.push({basis: b[0], part: part.name, faces: faces.length, want: KIT_COUNTS[part.name]});
        faces.forEach(function (f, fi) {
          var n = newell(f.vertices), dot = n.x * f.normal.x + n.y * f.normal.y + n.z * f.normal.z;
          if (!(dot > 0.999)) orientProblems.push({basis: b[0], part: part.name, face: fi, dot: dot});
        });
        if (!part.flags.closed) return;
        var directed = {}, undirected = {};
        faces.forEach(function (f) {
          for (var i = 0; i < f.vertices.length; i++) {
            var a = key(f.vertices[i]), c = key(f.vertices[(i + 1) % f.vertices.length]);
            directed[a + '>' + c] = (directed[a + '>' + c] || 0) + 1;
            var u = a < c ? a + '|' + c : c + '|' + a;
            undirected[u] = (undirected[u] || 0) + 1;
          }
        });
        Object.keys(undirected).forEach(function (u) { if (undirected[u] !== 2) manifoldProblems.push({basis: b[0], part: part.name, edge: u, faces: undirected[u]}); });
        Object.keys(directed).forEach(function (d) {
          var ends = d.split('>');
          if (directed[d] !== 1 || directed[ends[1] + '>' + ends[0]] !== 1) orientProblems.push({basis: b[0], part: part.name, edge: d});
        });
      });
    });
    check('closed parts are manifold: authored face counts, every edge shared by exactly two faces (lid hinged open)',
      manifoldProblems.length === 0, manifoldProblems.slice(0, 4));
    check('every face winds outward in world space on both bases (Newell normal = stored normal, opposite directed edges)',
      orientProblems.length === 0, orientProblems.slice(0, 4));

    // ── Bounds equal the vertex extremes ──
    var boundsProblems = [];
    var identity = build(M.kit, {x: 0, y: 0, z: 0, basis: G.structureModelBasis(0)});
    var all = {min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity]};
    M.kit.parts.forEach(function (part, pi) {
      var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      facesOf(identity, pi).forEach(function (f) { f.vertices.forEach(function (v) {
        [v.x, v.y, v.z].forEach(function (c, k) { mn[k] = Math.min(mn[k], c); mx[k] = Math.max(mx[k], c); });
      }); });
      for (var k = 0; k < 3; k++) {
        all.min[k] = Math.min(all.min[k], mn[k]); all.max[k] = Math.max(all.max[k], mx[k]);
        if (!near(part.bounds.min[k], mn[k]) || !near(part.bounds.max[k], mx[k])) boundsProblems.push({part: part.name, axis: k, bounds: part.bounds, extremes: [mn, mx]});
      }
    });
    for (var bk = 0; bk < 3; bk++) if (!near(M.kit.bounds.min[bk], all.min[bk]) || !near(M.kit.bounds.max[bk], all.max[bk])) boundsProblems.push({model: M.kit.bounds, extremes: all});
    if (JSON.stringify(M.box.bounds) !== JSON.stringify({min: [-7, -5, 0], max: [7, 5, 8]})) boundsProblems.push({authoredBox: M.box.bounds});
    var rotated = build(M.kit, {x: 40, y: -25, z: 5, yaw: 2.2});
    M.kit.parts.forEach(function (part, pi) {
      var b = rotated.parts[pi], mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      facesOf(rotated, pi).forEach(function (f) { f.vertices.forEach(function (v) {
        [v.x, v.y, v.z].forEach(function (c, k) { mn[k] = Math.min(mn[k], c); mx[k] = Math.max(mx[k], c); });
      }); });
      if (!near(b.minX, mn[0]) || !near(b.maxX, mx[0]) || !near(b.minY, mn[1]) || !near(b.maxY, mx[1]) || !near(b.minZ, mn[2]) || !near(b.maxZ, mx[2]))
        boundsProblems.push({worldPart: part.name, bounds: b, extremes: [mn, mx]});
    });
    check('part and model bounds equal the vertex extremes (local), and per-instance world bounds equal the world extremes',
      boundsProblems.length === 0, boundsProblems.slice(0, 3));

    // ── UVs: U horizontal, V down the face, part-local ──
    function gradient(f, field) {
      var p0 = f.vertices[0], p1 = f.vertices[1], p2 = f.vertices[2];
      var e1 = [p1.x - p0.x, p1.y - p0.y, p1.z - p0.z], e2 = [p2.x - p0.x, p2.y - p0.y, p2.z - p0.z];
      var d1 = p1[field] - p0[field], d2 = p2[field] - p0[field];
      var a11 = e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2], a12 = e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2];
      var a22 = e2[0] * e2[0] + e2[1] * e2[1] + e2[2] * e2[2], det = a11 * a22 - a12 * a12;
      var s = (d1 * a22 - d2 * a12) / det, t = (d2 * a11 - d1 * a12) / det;
      return [s * e1[0] + t * e2[0], s * e1[1] + t * e2[1], s * e1[2] + t * e2[2]];
    }
    var uvProblems = [], slopeFaces = 0, rotatedFaces = 0;
    [['modelBasis', G.modelBasis(0.37)], ['structureBasis', G.structureModelBasis(0.37)]].forEach(function (b) {
      facesOf(build(M.kit, {x: 40, y: -25, z: 5, basis: b[1]})).forEach(function (f) {
        if (Math.abs(f.normal.z) > 0.999) return;
        var scale = KIT_UV_SCALE[f.partName] || 32, gu = gradient(f, 'u'), gv = gradient(f, 'v');
        var lu = Math.hypot(gu[0], gu[1], gu[2]), lv = Math.hypot(gv[0], gv[1], gv[2]);
        rotatedFaces++;
        if (Math.abs(f.normal.z) > 0.01) slopeFaces++;
        var ok = Math.abs(gu[2]) < 1e-9 && near(lu, 1 / scale, 1e-9) && near(lv, 1 / scale, 1e-9) &&
          Math.abs(gu[0] * gv[0] + gu[1] * gv[1] + gu[2] * gv[2]) < 1e-9 && gv[2] < 0;
        // modelBasis faces read left-to-right for a viewer facing them: +u is
        // that viewer's screen right, (n.y, -n.x) in this renderer.
        if (ok && b[0] === 'modelBasis') {
          var h = Math.hypot(f.normal.x, f.normal.y);
          ok = near(gu[0] / lu, f.normal.y / h, 1e-9) && near(gu[1] / lu, -f.normal.x / h, 1e-9);
        }
        if (!ok) uvProblems.push({basis: b[0], part: f.partName, normal: f.normal, gu: gu, gv: gv});
      });
    });
    check('U runs horizontally (screen-right on modelBasis) and V down the face at 1/uvScale (authored 16, 24, default 32) on rotated and gable faces',
      uvProblems.length === 0 && slopeFaces >= 6 && rotatedFaces >= 40, {problems: uvProblems.slice(0, 3), slopeFaces: slopeFaces, rotatedFaces: rotatedFaces});
    function uvs(buf) { return facesOf(buf).map(function (f) { return f.vertices.map(function (v) { return [v.u, v.v]; }); }); }
    var uvA = uvs(build(M.kit, {x: 0, y: 0, z: 0, yaw: 0.37})), uvB = uvs(build(M.kit, {x: -512.5, y: 900.25, z: 40, yaw: 0.37}));
    var uvC = uvs(build(M.kit, {x: 77, y: 13, z: -9, yaw: 2.9})), uvD = uvs(build(M.kit, {x: 0, y: 0, z: 0, yaw: 0.37, joints: {lid: 1.4}}));
    var uvE = uvs(build(M.kit, {x: 0, y: 0, z: 0, yaw: 0.37, scale: 1.5}));
    check('UVs are part-local: unchanged by translation, yaw, scale and an open hinge',
      JSON.stringify(uvA) === JSON.stringify(uvB) && JSON.stringify(uvA) === JSON.stringify(uvC) &&
      JSON.stringify(uvA) === JSON.stringify(uvD) && JSON.stringify(uvA) === JSON.stringify(uvE),
      {a: uvA[0], b: uvB[0], c: uvC[0], lidA: uvA[6], lidD: uvD[6]});

    // ── Hinge and anchors (hand-computed positions) ──
    var hingeInst = {x: 10, y: 20, z: 1, yaw: 0.9, joints: {lid: PI / 2}}, hingeBuf = build(M.kit, hingeInst);
    var shutBuf = build(M.kit, {x: 10, y: 20, z: 1, yaw: 0.9});
    var lockOpen = G.modelLocalToWorld(hingeInst, 0, -15, 40, {}), lockShut = G.modelLocalToWorld(hingeInst, 0, 12, 19, {});
    var postTop = G.modelLocalToWorld(hingeInst, 27, 0.5, 20, {});
    function same(a, b) { return near(a.x, b.x) && near(a.y, b.y) && near(a.z, b.z); }
    // The lid top (face 4) turns from up to facing back (-out) at 90 degrees.
    var lidTop = facesOf(hingeBuf, partIndex.lid)[4].normal;
    var lidUp = near(lidTop.x, -Math.cos(0.9)) && near(lidTop.y, -Math.sin(0.9)) && near(lidTop.z, 0);
    check('hinge: the lid anchor swings from (0,12,19) to (0,-15,40) at 90 degrees, other anchors stay put, clamped to the joint range',
      same(hingeBuf.anchors.lock, lockOpen) && same(shutBuf.anchors.lock, lockShut) && same(hingeBuf.anchors.postTop, postTop) &&
      same(build(M.kit, {x: 10, y: 20, z: 1, yaw: 0.9, joints: {lid: 9}}).anchors.lock, G.modelLocalToWorld(hingeInst,
        0, -12 + 24 * Math.cos(2) - 3 * Math.sin(2), 16 + 3 * Math.cos(2) + 24 * Math.sin(2), {})) && lidUp,
      {open: hingeBuf.anchors.lock, wantOpen: lockOpen, shut: shutBuf.anchors.lock, wantShut: lockShut});

    // ── Adapters ──
    var ruinProblems = [];
    [0, 1, 2, 3].forEach(function (facing) {
      var ru = {x: 300, y: 400, facing: facing, ruinType: 'hut'}, inst = {x: ru.x, y: ru.y, z: 0, basis: G.ruinModelBasis(ru)};
      [[18, 39], [0, -27], [-27, -5], [3.5, -11.25]].forEach(function (lp) {
        var want = G.ruinLocalToWorld(ru, lp[0], lp[1], {}), got = G.modelLocalToWorld(inst, lp[0], lp[1], 0, {});
        if (got.x !== want.x || got.y !== want.y) ruinProblems.push({facing: facing, local: lp, got: got, want: want});
      });
      var post = G.getRuinPostWorld(ru, {}), b = inst.basis;
      if (b.rightX !== post.rightX || b.rightY !== post.rightY || b.outX !== post.outX || b.outY !== post.outY)
        ruinProblems.push({facing: facing, basis: b, post: post});
    });
    check('ruin adapter (yaw = facing*pi/2 - pi/2) reproduces ruinLocalToWorld and the waypost basis exactly at all four facings',
      ruinProblems.length === 0, ruinProblems.slice(0, 3));

    var decor = slurp('assets/games/src/07-decorations-lighting.js');
    function between(text, a, b) {
      if (text.split(a).length !== 2 || text.split(b).length !== 2) throw Error('SETUP chest anchor drift: ' + a + ' / ' + b);
      var i = text.indexOf(a), j = text.indexOf(b);
      if (j < i) throw Error('SETUP chest anchors out of order');
      return text.slice(i, j);
    }
    var cornerBlock = between(decor, '    var facingAng = ch.facing || 0;\n', '\n    var bodyTopZ = floorZ + bodyH;');
    var dims = decor.match(/var hw = (\d+), hd = (\d+);/g);
    if (!dims || dims.length !== 1) throw Error('SETUP chest half-extent line drift');
    var hw = +dims[0].match(/hw = (\d+)/)[1], hd = +dims[0].match(/hd = (\d+)/)[1];
    var chestCorners = new Function('ch', 'hw', 'hd', cornerBlock + '\nreturn [[c0x,c0y],[c1x,c1y],[c2x,c2y],[c3x,c3y]];');
    var chestModel = G.definePropModel({key: 'pmTestChest', parts: [{kind: 'box', min: [-hw, -hd, 0], max: [hw, hd, 8], material: 'palisadeWood', role: 'mid'}]});
    var chestProblems = [];
    [0, 0.9, PI / 2, 2.8, -1.3].forEach(function (facing) {
      var ch = {x: 512, y: -64, facing: facing}, want = chestCorners(ch, hw, hd);
      var inst = {x: ch.x, y: ch.y, z: 2, basis: G.chestModelBasis(ch)}, have = {};
      facesOf(build(chestModel, inst)).forEach(function (f) { f.vertices.forEach(function (v) { have[key(v)] = true; }); });
      // c0 front-left, c1 front-right, c2 back-right, c3 back-left (front = out).
      [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd]].forEach(function (lc, i) {
        var got = G.modelLocalToWorld(inst, lc[0], lc[1], 0, {});
        if (!near(got.x, want[i][0]) || !near(got.y, want[i][1]) || !have[key({x: want[i][0], y: want[i][1], z: 2})])
          chestProblems.push({facing: facing, corner: 'c' + i, got: [got.x, got.y], want: want[i]});
      });
    });
    check('chest adapter (yaw = facing) reproduces the chest corners c0..c3 evaluated from 07-decorations-lighting.js',
      chestProblems.length === 0 && hw === 7 && hd === 5, {problems: chestProblems.slice(0, 3), hw: hw, hd: hd});

    var ramp = G.GAME_MATERIALS.palisadeWood.hex, roleOfHex = {};
    Object.keys(ramp).forEach(function (r) { roleOfHex[ramp[r]] = r; });
    var structureProblems = [], structureFaces = 0;
    [0, 0.7, PI / 2, 2.5, -1.1].forEach(function (yaw, yi) {
      var x = 130 + yi * 17, y = -40 + yi * 5, z0 = 3 + yi, z1 = 11 + yi, hr = 9 + yi, ho = 2.5;
      var captured = [];
      G.captureRuinDecorFaces(function () { G.drawStructureBoxWorld(x, y, z0, z1, hr, ho, yaw, ramp, {}); },
        function (vertices, color) { captured.push({vertices: vertices.map(function (v) { return {x: v.x, y: v.y, z: v.z}; }), role: roleOfHex[color]}); return 0; });
      var model = G.definePropModel({key: 'pmTestStructBox' + yi, parts: [{kind: 'box', min: [-hr, -ho, z0], max: [hr, ho, z1], bottom: false,
        material: 'palisadeWood', role: 'mid', faceRoles: ['dark', 'mid', 'deep', 'dark', 'lit']}]});
      var faces = facesOf(build(model, {x: x, y: y, z: 0, basis: G.structureModelBasis(yaw)}));
      structureFaces += captured.length;
      if (captured.length !== 5 || faces.length !== 5) { structureProblems.push({yaw: yaw, captured: captured.length, faces: faces.length}); return; }
      captured.forEach(function (c, fi) {
        var f = faces[fi];
        if (c.role !== f.role || c.vertices.length !== f.vertices.length ||
            c.vertices.some(function (v, vi) { return !near(v.x, f.vertices[vi].x) || !near(v.y, f.vertices[vi].y) || !near(v.z, f.vertices[vi].z); }))
          structureProblems.push({yaw: yaw, face: fi, legacy: c, model: {role: f.role, vertices: f.vertices.map(function (v) { return [v.x, v.y, v.z]; })}});
      });
    });
    check('structure adapter (mirrored basis) reproduces drawStructureBoxWorld face order, vertex order and ramp roles',
      structureProblems.length === 0 && structureFaces === 25, {problems: structureProblems.slice(0, 2), faces: structureFaces});
    var wall = G.wallModelBasis(0, -1, {}), wallE = G.wallModelBasis(1, 0, {});
    check('wall adapter (yaw = atan2(ny, nx)) points out along the wall normal',
      wall.outX === 0 && wall.outY === -1 && wallE.outX === 1 && wallE.outY === 0 && wall.rightX === 1 && wall.rightY === 0, {north: wall, east: wallE});

    // ── Validation at definition time ──
    function rejects(def, needle) {
      var before = Object.keys(G.PROP_MODELS).length;
      try { G.definePropModel(def); } catch (e) { return String(e.message).indexOf(needle) >= 0 && Object.keys(G.PROP_MODELS).length === before ? true : String(e.message); }
      return 'accepted';
    }
    function part(extra) { return Object.assign({kind: 'box', min: [0, 0, 0], max: [1, 1, 1], material: 'palisadeWood', role: 'mid'}, extra); }
    var tetra = [[0, 0, 0], [6, 0, 0], [3, 5, 0], [3, 2, 8]];
    var rejections = {
      kind: rejects({key: 'pmBadKind', parts: [part({kind: 'sphere'})]}, 'unknown kind'),
      material: rejects({key: 'pmBadMat', parts: [part({material: 'unobtainium'})]}, 'unknown material'),
      role: rejects({key: 'pmBadRole', parts: [part({role: 'glow'})]}, 'has no role glow'),
      uvScale: rejects({key: 'pmBadUv', parts: [part({uvScale: 0})]}, 'uvScale'),
      flag: rejects({key: 'pmBadFlag', parts: [part({flags: {solid: true}})]}, 'flag solid'),
      faceRoles: rejects({key: 'pmBadRoles', parts: [part({faceRoles: ['mid']})]}, 'one role per face'),
      nonPlanar: rejects({key: 'pmBadPlane', parts: [part({kind: 'quad', vertices: [[0, 0, 0], [4, 0, 0], [4, 4, 1], [0, 4, 0]]})]}, 'not planar'),
      nonConvex: rejects({key: 'pmBadDart', parts: [part({kind: 'quad', vertices: [[0, 0, 0], [4, 0, 0], [1, 1, 0], [0, 4, 0]]})]}, 'not convex'),
      openMesh: rejects({key: 'pmBadHole', parts: [part({kind: 'mesh', vertices: tetra, triangles: [[0, 2, 1], [0, 1, 3], [1, 2, 3]], flags: {closed: true}})]}, 'not shared by exactly two'),
      inwardMesh: rejects({key: 'pmBadInward', parts: [part({kind: 'mesh', vertices: tetra, triangles: [[0, 1, 2], [0, 3, 1], [1, 3, 2], [2, 3, 0]], flags: {closed: true}})]}, 'winds inward'),
      duplicate: rejects({key: 'pmTestBox', parts: [part({})]}, 'duplicate key')
    };
    check('definePropModel rejects malformed parts and leaves PROP_MODELS unchanged',
      Object.keys(rejections).every(function (k) { return rejections[k] === true; }), rejections);
    check('models are deep-frozen data and registered by key',
      Object.isFrozen(M.kit) && Object.isFrozen(M.kit.parts[2].faces[0].points[0]) && Object.isFrozen(M.kit.parts[1].hinge.axis) &&
      Object.isFrozen(M.kit.parts[0].flags) && G.PROP_MODELS.pmTestKit === M.kit && M.kit.faceCount === 40);

    // ── Stateless instance keys ──
    var randomBefore = H.clock.randomCalls, seen = {}, low = [0, 0, 0, 0], unique = 0, salt = G.propTypeSalt('chest');
    for (var cy = -64; cy < 64; cy++) for (var cx = -64; cx < 64; cx++) {
      var k = G.propInstanceKey(salt, cx + 4096, cy - 8192, 424242);
      if (!seen[k]) { seen[k] = true; unique++; }
      low[k & 3]++;
    }
    var tuples = [[1, 2, 3, 4], [salt, 0, 0, 0], [7, -5, 9, 2024]], sensitive = true, repeat = true;
    tuples.forEach(function (t) {
      var base = G.propInstanceKey(t[0], t[1], t[2], t[3]);
      for (var i = 0; i < 4; i++) { var u = t.slice(); u[i] += 1; if (G.propInstanceKey(u[0], u[1], u[2], u[3]) === base) sensitive = false; }
      if (G.propInstanceKey(t[0], t[1], t[2], t[3]) !== base) repeat = false;
    });
    check('propInstanceKey: stateless 32-bit keys, unique over 128x128 cells, balanced low bits, sensitive to every input, no RNG draws',
      unique === 16384 && low.every(function (n) { return Math.abs(n - 4096) < 300; }) && sensitive && repeat &&
      H.clock.randomCalls === randomBefore && G.propTypeSalt('chest') !== G.propTypeSalt('chests') &&
      Object.keys(seen).every(function (s) { var n = +s; return n >= 0 && n < 4294967296 && n === Math.floor(n); }),
      {unique: unique, low: low, sensitive: sensitive, repeat: repeat, randomCalls: H.clock.randomCalls - randomBefore});
  }

  // ── Culling: exact on closed parts, proven with production scene depth ──
  function setCamera(x, y, ang, z) {
    G.cam.x = x; G.cam.y = y; G.cam.ang = ang; G.cam.pitch = 0;
    var C = G.getCam3D(); C.cameraZ = z; return C;
  }
  function depthRun(inst, model, C, cull, phase) {
    G.setRenderFeatures({modelBackfaceCull: cull});
    G.beginSceneDepthFrame(C.w, C.h);
    var stats = {};
    G.drawWorldModel(inst, model, C, phase, stats);
    return {depth: Array.prototype.slice.call(G._sceneDepthInv, 0, C.w * C.h), stats: stats};
  }
  function covered(depth) { var n = 0; for (var i = 0; i < depth.length; i++) if (depth[i] > 0) n++; return n; }
  function firstDiff(a, b) { for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return {index: i, a: a[i], b: b[i]}; return null; }
  if (section('culling')) {
    var saved = {w: G.canvas.width, h: G.canvas.height, ps: G.projScale, cam: Object.assign({}, G.cam), cull: G.RENDER_FEATURES.modelBackfaceCull};
    G.canvas.width = 200; G.canvas.height = 150; G.projScale = 150;
    var kitInst = {x: 1000, y: 1000, z: 0, yaw: 0.37, tints: {banner: 0x3050a0}};
    var views = [], cullProblems = [];
    [10, 70].forEach(function (height) {
      for (var az = 0; az < 8; az++) {
        var a = az * PI / 4, cx = kitInst.x + Math.cos(a) * 160, cy = kitInst.y + Math.sin(a) * 160;
        var C = setCamera(cx, cy, Math.atan2(kitInst.y - cy, kitInst.x - cx), height);
        var off = depthRun(kitInst, M.kit, C, false), on = depthRun(kitInst, M.kit, C, true), diff = firstDiff(off.depth, on.depth);
        var view = {height: height, azimuth: az, covered: covered(on.depth), culledOn: on.stats.culled, culledOff: off.stats.culled,
          drawnOff: off.stats.drawn, drawnOn: on.stats.drawn, diff: diff};
        views.push(view);
        if (diff || view.covered < 800 || !(on.stats.culled >= 12) || off.stats.culled !== 0 || on.stats.faces !== 40 || off.stats.faces !== 40)
          cullProblems.push(view);
      }
    });
    out('NOTE culling views covered ' + Math.min.apply(null, views.map(function (v) { return v.covered; })) + '..' +
      Math.max.apply(null, views.map(function (v) { return v.covered; })) + ' px, culled ' +
      Math.min.apply(null, views.map(function (v) { return v.culledOn; })) + '..' + Math.max.apply(null, views.map(function (v) { return v.culledOn; })) + ' of 40 faces');
    check('culling on and off leave _sceneDepthInv identical at 8 azimuths x 2 heights, with faces culled and depth written in both',
      cullProblems.length === 0 && views.length === 16, cullProblems.slice(0, 3));
    var roomInst = {x: 3000, y: 3000, z: 0, yaw: 0.2}, roomC = setCamera(3010, 2995, 0.4, 40);
    var roomBuf = build(M.room, roomInst), awayCount = facesOf(roomBuf).filter(function (f) {
      var v0 = f.vertices[0], n = f.normal;
      return n.x * (G.cam.x - v0.x) + n.y * (G.cam.y - v0.y) + n.z * (40 - v0.z) <= 0;
    }).length;
    var roomOff = depthRun(roomInst, M.room, roomC, false), roomOn = depthRun(roomInst, M.room, roomC, true);
    check('camera inside a closed hull: every face faces away, yet the exemption keeps depth identical and non-empty',
      awayCount === 6 && !firstDiff(roomOff.depth, roomOn.depth) && covered(roomOn.depth) > 1000 && roomOn.stats.culled === 0,
      {away: awayCount, covered: covered(roomOn.depth), culled: roomOn.stats.culled, diff: firstDiff(roomOff.depth, roomOn.depth)});
    var glassC = setCamera(kitInst.x - 120, kitInst.y + 10, 0, 40), glassInst = {x: kitInst.x, y: kitInst.y, z: 0, yaw: 0.3};
    var glassOpaque = depthRun(glassInst, M.glass, glassC, true, 'opaque');
    H.count(true);
    var glassOverlay = depthRun(glassInst, M.glass, glassC, true, 'overlay');
    var fills = H.count(false).calls;
    check('translucent parts draw only in the overlay phase and never write scene depth',
      glassOpaque.stats.faces === 0 && glassOverlay.stats.faces === 6 && glassOverlay.stats.drawn >= 2 && covered(glassOverlay.depth) === 0 && fills > 0,
      {opaque: glassOpaque.stats, overlay: glassOverlay.stats, covered: covered(glassOverlay.depth), calls: fills});
    // Near plane: a closed part whose bounds reach camera depth 1 has its
    // near faces clipped, so culling there would open a hole. Each view has
    // the camera outside the bounds (the old inside-only exemption misses it)
    // and a vertex shallower than 1, both computed here from the vertices.
    var pillarInst = {x: 5000, y: 5000, z: 0, yaw: 0}, pillarFaces = facesOf(build(M.pillar, pillarInst)), nearProblems = [], nearViews = [];
    [['front gap 0.5', 4979.5, 5005, 0, 30, true], ['front gap 0.5 turned -0.6', 4979.5, 5005, -0.6, 30, true],
      ['0.3 above the top', 5000, 5000, 0, 60.3, true], ['corner gap 0.3', 4979.7, 4979.7, PI / 4, 30, true],
      ['control: front gap 3', 4977, 5005, 0, 30, false]].forEach(function (v) {
      var C = setCamera(v[1], v[2], v[3], v[4]), minDepth = Infinity;
      pillarFaces.forEach(function (f) { f.vertices.forEach(function (p) { minDepth = Math.min(minDepth, (p.x - v[1]) * C.cosAng + (p.y - v[2]) * C.sinAng); }); });
      var outside = v[1] < 4980 || v[1] > 5020 || v[2] < 4980 || v[2] > 5020 || v[4] > 60;
      var off = depthRun(pillarInst, M.pillar, C, false), on = depthRun(pillarInst, M.pillar, C, true), diff = firstDiff(off.depth, on.depth);
      var view = {view: v[0], minDepth: Math.round(minDepth * 100) / 100, outside: outside, covered: covered(on.depth), culledOn: on.stats.culled, diff: diff};
      nearViews.push(view);
      var shapeOk = outside && (v[5] ? minDepth < 1 && on.stats.culled === 0 : minDepth >= 1 && on.stats.culled >= 3);
      if (diff || !shapeOk || view.covered < 1000) nearProblems.push(view);
    });
    out('NOTE near-plane views ' + nearViews.map(function (v) { return v.view + ':' + v.covered + 'px/culled ' + v.culledOn; }).join(', '));
    check('near plane: a closed part within depth 1 of an outside camera (front, turned, above, corner) is not culled and depth stays identical; at gap 3 it is culled',
      nearProblems.length === 0 && nearViews.length === 5, nearProblems);
    // Translucent parts are never culled: the overlay commands are identical either way.
    function overlayRun(cull) {
      var overlayC = setCamera(kitInst.x - 120, kitInst.y + 10, 0, 40);
      G.setRenderFeatures({modelBackfaceCull: cull}); G.beginSceneDepthFrame(overlayC.w, overlayC.h);
      var stats = {}; H.record(true, true); G.drawWorldModel(glassInst, M.glass, overlayC, 'overlay', stats);
      var r = H.record(false); return {hash: r.hash(), entries: r.entries, stats: stats};
    }
    var overlayOff = overlayRun(false), overlayOn = overlayRun(true);
    check('translucent closed parts are never culled: the overlay draw records the same commands with modelBackfaceCull on and off',
      overlayOn.hash === overlayOff.hash && overlayOn.entries === overlayOff.entries && overlayOn.entries > 20 &&
      overlayOn.stats.culled === 0 && overlayOn.stats.faces === 6,
      {on: {hash: overlayOn.hash, entries: overlayOn.entries, stats: overlayOn.stats}, off: {hash: overlayOff.hash, entries: overlayOff.entries}});
    // Anchors: each call returns only its own model's anchors, and drawing
    // another model leaves them intact (hand-computed yaw-0 positions).
    var anchorC = setCamera(900, 1000, 0, 30);
    var anchorsA = G.drawWorldModel({x: 1000, y: 1000, z: 0, yaw: 0}, M.anchorA, anchorC), keysA = Object.keys(anchorsA).join(',');
    var anchorsB = G.drawWorldModel({x: 1100, y: 1000, z: 0, yaw: 0}, M.anchorB, anchorC), keysB = Object.keys(anchorsB).join(',');
    check('drawWorldModel returns only the drawn model\'s anchors, and drawing another model leaves them intact',
      keysA === 'lock' && keysB === 'flame' && Object.keys(anchorsA).join(',') === 'lock' &&
      anchorsA.lock.x === 1005 && anchorsA.lock.y === 1000 && anchorsA.lock.z === 5 &&
      anchorsB.flame.x === 1100 && anchorsB.flame.y === 1000 && anchorsB.flame.z === 12,
      {a: anchorsA, keysA: keysA, b: anchorsB, keysB: keysB});
    G.beginRenderFrameStats();
    depthRun(kitInst, M.kit, setCamera(kitInst.x - 160, kitInst.y, 0, 40), true);
    var fs = G._renderFrameStats;
    check('per-family frame counters record faces, culled and drawn',
      fs.mdlPmTestKitFaces === 40 && fs.mdlPmTestKitCulled > 0 && fs.mdlPmTestKitDrawn > 0 &&
      fs.mdlPmTestKitCulled + fs.mdlPmTestKitDrawn <= 40,
      {faces: fs.mdlPmTestKitFaces, culled: fs.mdlPmTestKitCulled, drawn: fs.mdlPmTestKitDrawn});
    G.canvas.width = saved.w; G.canvas.height = saved.h; G.projScale = saved.ps; Object.assign(G.cam, saved.cam);
    G.setRenderFeatures({modelBackfaceCull: saved.cull});
  }

  if (section('world')) {
    H.startEndless(2024);
    // ── Registry entry ──
    var def = G.RENDER_FEATURE_DEFS.filter(function (d) { return d.key === 'modelBackfaceCull'; })[0];
    G.renderPreset('legacy'); var legacyValue = G.RENDER_FEATURES.modelBackfaceCull;
    G.renderPreset('recommended'); var recommendedValue = G.RENDER_FEATURES.modelBackfaceCull;
    check('modelBackfaceCull is registered (bool, Legacy off) and follows the presets',
      !!def && def.type === 'bool' && def.legacy === false && legacyValue === false && recommendedValue === def.default, {def: def});

    // ── Shading equals the production globals on axis normals ──
    var shadeProblems = [], seenShades = {};
    [['noon', 0.5], ['dusk', 0.76], ['night', 0.95]].forEach(function (t) {
      G.settings.dayNight = true; G.daySpeed = 0; G.dayTime = t[1]; G.updateDayNight(0);
      var want = {E: G.renderSurfaceWallShadeE, W: G.renderSurfaceWallShadeW, N: G.renderSurfaceWallShadeN,
        S: G.renderSurfaceWallShadeS, T: G.renderSurfaceTopShade};
      var got = {E: G.worldFaceShade(1, 0, 0), W: G.worldFaceShade(-1, 0, 0), N: G.worldFaceShade(0, -1, 0),
        S: G.worldFaceShade(0, 1, 0), T: G.worldFaceShade(0, 0, 1)};
      Object.keys(want).forEach(function (k) { if (got[k] !== want[k]) shadeProblems.push({time: t[0], face: k, got: got[k], want: want[k]}); });
      var diag = G.worldFaceShade(Math.SQRT1_2, Math.SQRT1_2, 0);
      if (!near(diag, (want.E + want.S) / 2, 1e-12)) shadeProblems.push({time: t[0], diagonal: diag, want: (want.E + want.S) / 2});
      seenShades[t[0]] = want;
    });
    check('worldFaceShade equals renderSurfaceWallShadeN/S/E/W and renderSurfaceTopShade exactly at noon, dusk and night',
      shadeProblems.length === 0 && seenShades.noon.T !== seenShades.night.T && seenShades.dusk.E !== seenShades.dusk.W,
      {problems: shadeProblems, shades: seenShades});
    G.dayTime = 0.5; G.updateDayNight(0);
    var savedGrid = [G._lightGrid, G._lightGridW, G._lightGridH];
    G._lightGrid = new Float32Array(16); G._lightGridW = 4; G._lightGridH = 4; G._lightGrid[1 * 4 + 2] = 0.2;
    var cs = G._lightCellSize, lx = 2.5 * cs, ly = 1.5 * cs, fog = 0.9, packed = (200 << 16) | (100 << 8) | 50;
    var s = G.renderSurfaceWallShadeE, total = Math.min(1, s + 0.2);
    var wantLit = (Math.min(255, Math.floor(200 * total * fog * 1.06)) << 16) | (Math.min(255, Math.floor(100 * total * fog)) << 8) |
      Math.min(255, Math.floor(50 * total * fog * 0.96));
    var unlit = (Math.floor(200 * s * fog) << 16) | (Math.floor(100 * s * fog) << 8) | Math.floor(50 * s * fog);
    var gotLit = G.worldFaceColor(packed, 1, 0, 0, lx, ly, fog, false), gotDark = G.worldFaceColor(packed, 1, 0, 0, lx + cs, ly, fog, false);
    var gotEmissive = G.worldFaceColor(packed, 1, 0, 0, lx, ly, fog, false, true);
    check('surface faces add the light-grid sample with the walls\' warm tint (x1.06 red, x0.96 blue at 0.2); emissive ignores both',
      gotLit === wantLit && gotDark === unlit && gotEmissive === ((180 << 16) | (90 << 8) | 45),
      {lit: gotLit.toString(16), want: wantLit.toString(16), dark: gotDark.toString(16), unlit: unlit.toString(16), emissive: gotEmissive.toString(16)});
    var caveProblems = [];
    [[1, 0, 0, G.CAVE_SURFACE_WALL, 1], [0, 1, 0, G.CAVE_SURFACE_WALL, 0.94], [0, -1, 0, G.CAVE_SURFACE_WALL, 0.94],
      [0, 0, 1, G.CAVE_SURFACE_FLOOR, 1], [0, 0, -1, G.CAVE_SURFACE_CEILING, 1]].forEach(function (c) {
      var ambient = G.getCaveRenderLightAt(lx, ly, true) * c[4];
      var want = G.shadeCaveSurfaceColor(packed, c[3], ambient, 0.2, fog), got = G.worldFaceColor(packed, c[0], c[1], c[2], lx, ly, fog, true);
      if (got !== want) caveProblems.push({normal: c.slice(0, 3), got: got.toString(16), want: want.toString(16)});
    });
    check('cave faces select the wall/floor/ceiling role and the 0.94 east-west wall factor as walls do (shadeCaveSurfaceColor)',
      caveProblems.length === 0, caveProblems);
    // Tops follow the wall top pass (12-render-core-walls.js): shade + light
    // with no clamp, so a noon top (TopShade + 0.2 > 1) is brighter than 1.
    var topPacked = (120 << 16) | (100 << 8) | 80, topMul = G.renderSurfaceTopShade + 0.2, downMul = Math.min(1, G.renderSurfaceAmbient + 0.2);
    function wallLit(pk, mul) {
      return (Math.min(255, Math.floor(((pk >>> 16) & 255) * mul * fog * 1.06)) << 16) |
        (Math.min(255, Math.floor(((pk >>> 8) & 255) * mul * fog)) << 8) | Math.min(255, Math.floor((pk & 255) * mul * fog * 0.96));
    }
    var gotTop = G.worldFaceColor(topPacked, 0, 0, 1, lx, ly, fog, false), gotDown = G.worldFaceColor(topPacked, 0, 0, -1, lx, ly, fog, false);
    var slopeMul = G.worldFaceLitShade(0, Math.SQRT1_2, Math.SQRT1_2, 0.2), wantSlope = (Math.min(1, G.renderSurfaceWallShadeS + 0.2) + topMul) / 2;
    check('up-facing faces take the wall top pass (renderSurfaceTopShade + light, unclamped); side and downward faces clamp at 1; slopes blend',
      topMul > 1 && gotTop === wallLit(topPacked, topMul) && gotTop !== wallLit(topPacked, 1) && gotDown === wallLit(topPacked, downMul) &&
      near(slopeMul, wantSlope, 1e-12),
      {topMul: topMul, top: gotTop.toString(16), want: wallLit(topPacked, topMul).toString(16), down: gotDown.toString(16),
        wantDown: wallLit(topPacked, downMul).toString(16), slope: slopeMul, wantSlope: wantSlope});
    G._lightGrid = savedGrid[0]; G._lightGridW = savedGrid[1]; G._lightGridH = savedGrid[2];
    var vd = G.viewDist;
    check('fog and fade band match the wall renderer: max(fogFloor, 1 - d*0.0008), eased alpha over the last 18% of viewDist',
      G.worldFaceFog(0, false) === 1 && near(G.worldFaceFog(500, false), 0.6, 1e-12) && G.worldFaceFog(5000, false) === G.renderSurfaceFogFloor &&
      G.worldFaceFog(5000, true) === G.renderCaveFogFloor && G.worldFaceFadeAlpha(vd * 0.5) === 1 && G.worldFaceFadeAlpha(vd * 0.82) === 1 &&
      near(G.worldFaceFadeAlpha(vd * 0.91), 0.25, 1e-9) && G.worldFaceFadeAlpha(vd) === 0,
      {fog500: G.worldFaceFog(500, false), fade91: G.worldFaceFadeAlpha(vd * 0.91)});

    // ── Paint path: every fill of one drawWorldModel call against oracles ──
    // Oracle per face, from an independent build: the authored material or
    // tint, the stored normal (checked against Newell here), the centroid
    // distance along the view, and the tested helpers worldFaceColor,
    // worldFaceFog and worldFaceFadeAlpha. Dusk so E and W shades differ.
    G.dayTime = 0.76; G.updateDayNight(0);
    var paintSaved = {w: G.canvas.width, h: G.canvas.height, ps: G.projScale, cam: Object.assign({}, G.cam),
      cull: G.RENDER_FEATURES.modelBackfaceCull, alpha: G.ctx.globalAlpha};
    G.canvas.width = 200; G.canvas.height = 150; G.projScale = 150;
    var BANNER = 0x3050a0, BASE_ALPHA = 0.6, paintAng = 0.3, paintC = setCamera(2000, 2000, paintAng, 30);
    var PAINT_SOURCE = {body: G.GAME_MATERIALS.palisadeWood.packed.mid, flag: BANNER, pane: G.GAME_MATERIALS.wallPropIron.packed.lit};
    function paintRun(inst) {
      var fills = [], inFill = false, realFill = G.fillSceneDepthPolygon, realClip = G.withSceneDepthClip;
      G.fillSceneDepthPolygon = function (points) {
        fills.push({kind: 'opaque', style: G.ctx.fillStyle, alpha: G.ctx.globalAlpha});
        inFill = true; try { return realFill(points); } finally { inFill = false; }
      };
      G.withSceneDepthClip = function (points, fn, opts) {
        if (!inFill) fills.push({kind: 'overlay', style: G.ctx.fillStyle, alpha: G.ctx.globalAlpha});
        return realClip(points, fn, opts);
      };
      G.setRenderFeatures({modelBackfaceCull: false});
      G.beginSceneDepthFrame(paintC.w, paintC.h); G.ctx.globalAlpha = BASE_ALPHA;
      try { G.drawWorldModel(inst, M.paint, paintC, 'all', {}); } finally { G.fillSceneDepthPolygon = realFill; G.withSceneDepthClip = realClip; }
      return {fills: fills, alphaAfter: G.ctx.globalAlpha};
    }
    function paintOracle(inst) {
      return facesOf(build(M.paint, inst)).map(function (f) {
        var vs = f.vertices, n = f.normal, nw = newell(vs), cx = 0, cy = 0;
        for (var k = 0; k < vs.length; k++) { cx += vs[k].x; cy += vs[k].y; }
        cx /= vs.length; cy /= vs.length;
        var dist = Math.max(1, Math.abs((cx - 2000) * Math.cos(paintAng) + (cy - 2000) * Math.sin(paintAng)));
        var lit = G.worldFaceColor(PAINT_SOURCE[f.partName], n.x, n.y, n.z, cx, cy, G.worldFaceFog(dist, false), false, false);
        var fade = G.worldFaceFadeAlpha(dist), pane = f.partName === 'pane';
        return {kind: pane ? 'overlay' : 'opaque', style: G.rgbQ((lit >>> 16) & 255, (lit >>> 8) & 255, lit & 255),
          alpha: BASE_ALPHA * fade * (pane ? 0.5 : 1), fade: fade, fog: G.worldFaceFog(dist, false), part: f.partName,
          newellOk: near(nw.x, n.x, 1e-9) && near(nw.y, n.y, 1e-9) && near(nw.z, n.z, 1e-9)};
      });
    }
    var paintProblems = [], paintNotes = [], fadeFaces = 0, foggedFaces = 0, tintedFaces = 0, paneFaces = 0;
    [['near', 300], ['fade band', G.viewDist * 0.9]].forEach(function (p) {
      var inst = {x: 2000 + Math.cos(paintAng) * p[1], y: 2000 + Math.sin(paintAng) * p[1], z: 0, yaw: 0, tints: {banner: BANNER}};
      var got = paintRun(inst), want = paintOracle(inst);
      if (got.fills.length !== want.length) paintProblems.push({instance: p[0], fills: got.fills.length, faces: want.length});
      want.forEach(function (w, i) {
        var g = got.fills[i] || {};
        if (w.fade > 0 && w.fade < 1) fadeFaces++;
        if (w.fog < 1) foggedFaces++;
        if (w.part === 'flag') tintedFaces++;
        if (w.part === 'pane') paneFaces++;
        if (!w.newellOk || g.kind !== w.kind || g.style !== w.style || !near(g.alpha, w.alpha, 1e-12))
          paintProblems.push({instance: p[0], face: i, part: w.part, got: g, want: {kind: w.kind, style: w.style, alpha: w.alpha}});
      });
      if (got.alphaAfter !== BASE_ALPHA) paintProblems.push({instance: p[0], alphaAfter: got.alphaAfter});
      paintNotes.push(p[0] + ' ' + got.fills.length + ' fills');
    });
    out('NOTE paint ' + paintNotes.join(', ') + ', fade-band faces ' + fadeFaces + ', fogged ' + foggedFaces);
    check('drawWorldModel paints each face with the oracle colour (material or tint, normal shade, fog) and alpha (base x fade x part alpha), then restores globalAlpha',
      paintProblems.length === 0 && fadeFaces >= 13 && foggedFaces >= 26 && tintedFaces === 2 && paneFaces === 12 &&
      G.renderSurfaceWallShadeE !== G.renderSurfaceWallShadeW, paintProblems.slice(0, 4));
    G.canvas.width = paintSaved.w; G.canvas.height = paintSaved.h; G.projScale = paintSaved.ps; Object.assign(G.cam, paintSaved.cam);
    G.setRenderFeatures({modelBackfaceCull: paintSaved.cull}); G.ctx.globalAlpha = paintSaved.alpha;
    G.dayTime = 0.5; G.updateDayNight(0);

    // ── Sink parity against recorded fillSceneDepthPolygon inputs ──
    function ser(points) { return points.map(function (p) { return [p.x, p.y, p.depth].map(function (v) { return Math.round(v * 1e6) / 1e6; }).join(','); }).join(' '); }
    function recordFills(draw) {
      var list = [], real = G.fillSceneDepthPolygon;
      G.fillSceneDepthPolygon = function (points) { list.push({points: ser(points), color: G.ctx.fillStyle}); return real(points); };
      try { G.beginSceneDepthFrame(G.canvas.width, G.canvas.height); draw(); } finally { G.fillSceneDepthPolygon = real; }
      return list;
    }
    function recordSink(draw) {
      var list = [], raw = 0, fills = 0, real = G.fillSceneDepthPolygon;
      G.fillSceneDepthPolygon = function (points) { fills++; return real(points); };
      try {
        G.beginSceneDepthFrame(G.canvas.width, G.canvas.height);
        G.captureRuinDecorFaces(draw, function (vertices, color, C) {
          raw++;
          var projected = G.projectSceneWorldPolygon(vertices, C);
          if (projected.length >= 3) list.push({points: ser(projected), color: color, triangle: vertices.length === 3});
          return 0;
        });
      } finally { G.fillSceneDepthPolygon = real; }
      return {list: list, raw: raw, fills: fills};
    }
    function compare(a, b) {
      if (a.length !== b.list.length) return {recorded: a.length, sunk: b.list.length};
      for (var i = 0; i < a.length; i++) if (a[i].points !== b.list[i].points || a[i].color !== b.list[i].color) return {index: i, recorded: a[i], sunk: b.list[i]};
      return null;
    }
    function openCell(x, y) {
      var best = null, gx0 = Math.floor(x / G.cell), gy0 = Math.floor(y / G.cell);
      for (var gy = gy0 - 6; gy <= gy0 + 6; gy++) for (var gx = gx0 - 6; gx <= gx0 + 6; gx++) {
        if (gx < 3 || gy < 3 || gx >= G.gridW - 3 || gy >= G.gridH - 3 || G.getTopWalkableLayerIdx(gx, gy) < 0) continue;
        var open = true;
        for (var oy = -1; oy <= 1 && open; oy++) for (var ox = -1; ox <= 1; ox++) if (G.grid[(gy + oy) * G.gridW + gx + ox]) { open = false; break; }
        var d = Math.hypot(gx - gx0, gy - gy0);
        if (open && (!best || d < best.d)) best = {x: (gx + 0.5) * G.cell, y: (gy + 0.5) * G.cell, d: d};
      }
      return best;
    }
    var ruin = G.ruins.slice().sort(function (a, b) { return Math.hypot(a.x - G.pos.x, a.y - G.pos.y) - Math.hypot(b.x - G.pos.x, b.y - G.pos.y); })[0];
    var ruinView = null;
    for (var dir = 0; ruin && dir < 8 && !ruinView; dir++) {
      var da = dir * PI / 4 + 0.3, spot = openCell(ruin.x + Math.cos(da) * 150, ruin.y + Math.sin(da) * 150);
      if (!spot || Math.hypot(spot.x - ruin.x, spot.y - ruin.y) < 90) continue;
      G.pos.x = spot.x; G.pos.y = spot.y; G.vel.x = G.vel.y = 0; G.settlePlayerAtSpawn(true);
      G.cam.ang = Math.atan2(ruin.y - G.pos.y, ruin.x - G.pos.x); G.cam.pitch = 0;
      G.resetRenderInterpolation(); G.renderFrame();
      var probe = recordFills(function () { G.drawRuins3D(); });
      if (probe.length >= 30) ruinView = {type: ruin.ruinType, facing: ruin.facing, distance: Math.round(Math.hypot(spot.x - ruin.x, spot.y - ruin.y))};
    }
    var ruinRecorded = ruinView ? recordFills(function () { G.drawRuins3D(); }) : [];
    var ruinSunk = ruinView ? recordSink(function () { G.drawRuins3D(); }) : {list: [], raw: 0, fills: 0};
    var ruinDiff = compare(ruinRecorded, ruinSunk);
    out('NOTE ruin view ' + JSON.stringify(ruinView) + ' recorded ' + ruinRecorded.length + ' faces, sink saw ' + ruinSunk.raw);
    check('sink parity, drawRuins3D: the sink sees the same projected faces and colours, in order, as the recorded fills (and nothing is filled)',
      !!ruinView && !ruinDiff && ruinRecorded.length >= 30 && ruinSunk.fills === 0 && ruinSunk.raw >= ruinSunk.list.length,
      {view: ruinView, diff: ruinDiff, recorded: ruinRecorded.length, fills: ruinSunk.fills});
    var shellC = G.getCam3D(), fwd = [Math.cos(G.cam.ang), Math.sin(G.cam.ang)];
    var shells = [
      {type: 'fortress', scale: 1, numBuildings: 2, rotation: 0.2, dist: G.CHUNK_SIZE * 4.5},
      {type: 'arena', scale: 1, numPillars: 10, rotation: 0.3, dist: G.CHUNK_SIZE * 3},
      {type: 'watchtower', scale: 1, armCount: 3, rotation: 0.4, dist: G.CHUNK_SIZE * 3}
    ].map(function (st) { st.x = G.cam.x + fwd[0] * st.dist; st.y = G.cam.y + fwd[1] * st.dist; return st; });
    function drawShells() { shells.forEach(function (st) { G.drawStructureShellWorld(st, {floorZ: 0}, shellC); }); }
    var shellRecorded = recordFills(drawShells), shellSunk = recordSink(drawShells), shellDiff = compare(shellRecorded, shellSunk);
    var shellTriangles = shellSunk.list.filter(function (f) { return f.triangle; }).length;
    out('NOTE shells recorded ' + shellRecorded.length + ' faces (' + shellTriangles + ' triangles), sink saw ' + shellSunk.raw);
    check('sink parity, drawStructureShellWorld (fortress, arena, watchtower): same projected faces and colours, in order, triangles included',
      !shellDiff && shellRecorded.length >= 100 && shellTriangles >= 10 && shellSunk.fills === 0,
      {diff: shellDiff, recorded: shellRecorded.length, triangles: shellTriangles, fills: shellSunk.fills});
    check('with no sink installed drawRuinDecorFace draws as before (sink is null after capture)',
      G._ruinDecorFaceSink === null && recordFills(drawShells).length === shellRecorded.length);
  }

  if (section('load')) {
    // Evaluate the fragment with every browser surface trapped; any load-time
    // touch counts. Positive control: a copy that reads ctx.fillStyle.
    function loadTouches(source) {
      var touches = [], defines = [], listeners = [];
      function trap(name) {
        return new Proxy({}, {get: function (o, k) { touches.push(name + '.' + String(k)); return undefined; },
          set: function (o, k) { touches.push(name + '.' + String(k) + '='); return true; },
          has: function () { touches.push(name + ' in'); return false; }});
      }
      var randomBefore = H.clock.randomCalls;
      var run = new Function('document', 'window', 'canvas', 'ctx', 'localStorage', 'GAME_MATERIALS', 'defineRenderFeature',
        'onRenderFeaturesChange', source);
      run(trap('document'), trap('window'), trap('canvas'), trap('ctx'), trap('localStorage'), trap('GAME_MATERIALS'),
        function (def) { defines.push(def.key + ':' + def.default + '/' + def.legacy); },
        function (listener) { listeners.push(typeof listener); });
      return {touches: touches, defines: defines, listeners: listeners, random: H.clock.randomCalls - randomBefore};
    }
    // Restated in Stage F1: the fragment now also registers wallPropModels;
    // the wall-prop models themselves are defined on first use, so
    // GAME_MATERIALS stays untouched at load. Restated in Stage F2: the
    // default is ON (was off in F1); Legacy stays off. Restated in Stage G1:
    // it also registers chestModel (default OFF in G1; the chest models are
    // defined on first use too, so GAME_MATERIALS stays untouched).
    // Restated in Stage G2: chestModel is default ON, and the fragment also
    // registers landmarkOpaqueEarly (default ON; the landmark pass is plain
    // functions and one state object, no load-time work). Restated in Stage
    // H: it also registers spawnerModel (default ON after the H checks; the
    // obelisk is defined on first use) and one registry listener (the
    // window spawner pulsePhase re-sync), now trapped and counted too.
    // Restated in Stage I1: it also registers floorPropModels (default OFF
    // in I1; the floor-prop models are defined on first use, so
    // GAME_MATERIALS stays untouched at load). Restated in Stage I2:
    // floorPropModels is default ON (the I2 flip, after its checks).
    // J1: landmarkModels is registered default OFF (the models are defined on
    // first use). Restated in Stage J2: landmarkModels is default ON, and the
    // fragment also registers landmarkBoundsGate (default ON; its radii are
    // computed on first use).
    var clean = loadTouches(fragmentSource), control = loadTouches(fragmentSource + '\nctx.fillStyle;\n');
    check('the fragment has no load-time DOM, canvas, storage, material or RNG use; it only registers modelBackfaceCull, wallPropModels (default ON since F2), chestModel and landmarkOpaqueEarly (default ON since G2), spawnerModel (default ON since H), modelEarlyReject and decorAnchorCache (default ON since K), floorPropModels (default ON since I2), landmarkModels and landmarkBoundsGate (default ON since J2) and one registry listener',
      clean.touches.length === 0 && clean.random === 0 && clean.listeners.join() === 'function' &&
      JSON.stringify(clean.defines) === '["modelBackfaceCull:true/false","wallPropModels:true/false","chestModel:true/false","landmarkOpaqueEarly:true/false","spawnerModel:true/false","modelEarlyReject:true/false","decorAnchorCache:true/false","floorPropModels:true/false","landmarkModels:true/false","landmarkBoundsGate:true/false"]' &&
      control.touches.join() === 'ctx.fillStyle', {clean: clean, control: control.touches});
  }

  check('no console errors', H.errors.length === 0, H.errors.slice(0, 3));
  out('PROP_MODELS_RESULT ' + (failed ? 'FAIL ' : 'PASS ') + checked + ' failed ' + failed);
}());
undefined;
