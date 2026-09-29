// Landmark bounds gate (integration stage J2, landmarkBoundsGate) through the
// real MAIN manifest (render_host.js). Shrines, stalls, the guard tower,
// structures, ruins and cave portals used to be culled by their centre
// point: a camera past a landmark's centre (or a portal mouth seen sideways)
// lost the whole landmark, and the column, hill, below-floor and
// surface/underground tests culled landmarks whose faces were in view.
// Oracles are independent of the gate: each subject's authored world faces
// are captured once, with entityVisible3D stubbed open, from a pose every
// gate variant passes; the test then clips them at the depth-1 near plane
// and projects them with its own camera formulas, so "lands on screen" is
// the test's claim, not the gate's. The legacy verdict per row (its reason)
// comes from entityVisible3D with the legacy options written out here.
// Scene depth is empty (the gate is under test, not occlusion). Not a
// rasterizer or browser: no pixel colour, timing or compositing claims.
// Checks print PASS/FAIL and keep going, so a mutation names what it broke.
// Mutations (evaluated copies only; each anchor must match exactly once):
//   --legacy-gates           landmarkBoundsGateOn answers false: every
//                            family keeps its legacy gate options
//   --centre-gate            entityVisible3D's bounded test is fwd < 1
//                            again (the centre, not the bounds)
//   --centre-screen-point    a centre behind the camera keeps a screen point
//   --no-rescue              the stall and tower rescue never re-asks
//   --portal-centre-gate     the portal keeps its 900 u / fwd < 1 checks
//   --short-fortress-radius  the fortress radius drops its sqrt 2
//   --draw-faded             a fully faded shrine model still draws
//   --ruin-far-bounds        ruin dressing draws past viewDist through its
//                            bounds (no centre limit at the far end)
//   --ceiling-no-depth       the cave ceiling pass paints but writes no
//                            scene depth (the roof no longer hides a surface shrine)
// --sections a,b runs only: spec, gate, sweep, probe, cave, lab; --seeds a,b
// narrows the sweep (its family checks then need not hold).
(function () {
  (0, eval)(slurp('tools/game/tests/render_host.js'));
  var H = createRenderTestHost(), G = H.G, out = H.output, checked = 0, failed = 0;
  function check(name, ok, detail) {
    checked++; if (!ok) failed++;
    out((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + JSON.stringify(detail === undefined ? null : detail).slice(0, 3000)));
  }
  function flag(name) { return __argv.indexOf(name) >= 0; }
  var sectionArg = __argv.indexOf('--sections') >= 0 ? __argv[__argv.indexOf('--sections') + 1].split(',') : null;
  function section(name) { return !sectionArg || sectionArg.indexOf(name) >= 0; }
  function swap(source, name, before, after) {
    if (!flag(name)) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + name);
    return source.replace(before, after);
  }
  var loaded = H.loadManifest(function (path, source) {
    if (path === 'src/12-prop-models.js') {
      source = swap(source, '--legacy-gates', "  return typeof renderFeatureOn === 'function' && renderFeatureOn('landmarkBoundsGate');\n", '  return false;\n');
      source = swap(source, '--no-rescue', '  if (!landmarkBoundsGateOn() || !(r > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return null;\n', '  return null;\n');
      return swap(source, '--short-fortress-radius', "  if (st && st.type === 'fortress') return chunk * 1.7 * s * Math.SQRT2 + c;\n",
        "  if (st && st.type === 'fortress') return chunk * 1.7 * s + c;\n");
    }
    if (path === 'src/01-config-state.js') {
      source = swap(source, '--centre-gate', '  if (boundR >= 0 ? fwd + boundR < 1 : fwd < 1) {', '  if (fwd < 1) {');
      return swap(source, '--centre-screen-point', '  var sx = fwd < 1 ? NaN : Math.floor(', '  var sx = Math.floor(');
    }
    if (path === 'src/13-render-floors-ceilings.js')
      return swap(source, '--ceiling-no-depth', '        fillSceneDepthPolygon(ceilingPoly);\n        fillSceneDepthPolygon(ceilingPolyB);\n',
        '        withSceneDepthClip(ceilingPoly, function () { traceSceneDepthPolygon(ceilingPoly); ctx.fill(); });\n' +
        '        withSceneDepthClip(ceilingPolyB, function () { traceSceneDepthPolygon(ceilingPolyB); ctx.fill(); });\n');
    if (path === 'src/15-render-hud-menu.js') {
      source = swap(source, '--draw-faded', '  if (!(vis.fade > 0)) return;\n  var floorZ = getEntityRenderFloorZ(shr);\n', '  var floorZ = getEntityRenderFloorZ(shr);\n');
      source = swap(source, '--ruin-far-bounds', '      if (ruinRadius !== undefined && vis.dist > viewDist) return;\n', '');
      return swap(source, '--portal-centre-gate', "  var portalBounds = typeof landmarkBoundsGateOn === 'function' && landmarkBoundsGateOn();\n", '  var portalBounds = false;\n');
    }
    return source;
  });
  check('real manifest loads with the bounds gate helpers and no console errors',
    loaded > 40 && typeof G.landmarkBoundsGateOn === 'function' && typeof G.landmarkBoundsRescue === 'function' &&
    typeof G.landmarkPortalRadius === 'function' && H.errors.length === 0, {loaded: loaded, errors: H.errors.slice(0, 3)});

  var W = 320, HT = 240, PS = 180, EYE = 60, VIEW = 1400;
  function frame() {
    G.beginSceneDepthFrame(W, HT); G.beginRenderFrameStats();
    G.depthBuffer = new Float32Array(W); G.depthBuffer.fill(Infinity);
  }
  function features(extra) {
    G.applyRenderPreset('recommended');
    // Every face in front is drawn, so the oracle need not know facing (the
    // cull is exact and tested elsewhere).
    G.setRenderFeatures({modelBackfaceCull: false});
    if (extra) G.setRenderFeatures(extra);
  }
  // A camera at (x, y) facing `ang`, `pitch` (screen shear, + looks down),
  // its eye EYE above the surface there (the game's pos.floorZ + 60).
  function pose(x, y, ang, pitch, groundZ) {
    var g = G.getEntityGroundRenderZ(x, y, false);
    if (!Number.isFinite(g)) g = Number.isFinite(groundZ) ? groundZ : 0;
    var cameraZ = g + EYE;
    G.canvas.width = W; G.canvas.height = HT; G.projScale = PS; G.viewDist = VIEW; G.MODE3D = true;
    G.cam = {x: x, y: y, ang: ang, pitch: pitch || 0, fov: Math.PI / 2, z: 60 + (cameraZ - 60) * 40 / 25};
    G.pos.x = x; G.pos.y = y; G.playerUnderground = false;
    G.nearestShrine = null; G.nearestFortressInteract = null; G.fortressLockedNear = null;
    frame();
    return {x: x, y: y, ang: ang, pitch: pitch || 0, cameraZ: cameraZ, horizonY: Math.floor(HT * 0.5) + Math.floor(-(pitch || 0) * PS)};
  }

  // ── The test's own projection: near clip at depth 1, then the screen ──
  function clip2(poly, inside, cut) {
    var res = [];
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length], ai = inside(a), bi = inside(b);
      if (ai) res.push(a);
      if (ai !== bi) res.push(cut(a, b));
    }
    return res;
  }
  function screenArea(verts, P) {
    var c = Math.cos(P.ang), s = Math.sin(P.ang);
    var pts = verts.map(function (p) { var dx = p.x - P.x, dy = p.y - P.y; return {f: dx * c + dy * s, r: -dx * s + dy * c, z: p.z}; });
    pts = clip2(pts, function (q) { return q.f >= 1; }, function (a, b) {
      var t = (1 - a.f) / (b.f - a.f); return {f: 1, r: a.r + (b.r - a.r) * t, z: a.z + (b.z - a.z) * t};
    });
    if (pts.length < 3) return 0;
    var scr = pts.map(function (q) { return [(q.r / q.f * 0.5 + 0.5) * W, P.horizonY + (P.cameraZ - q.z) / q.f * PS]; });
    [[0, 0, 1], [0, W, -1], [1, 0, 1], [1, HT, -1]].forEach(function (e) {
      if (scr.length < 3) return;
      scr = clip2(scr, function (q) { return (q[e[0]] - e[1]) * e[2] >= 0; }, function (a, b) {
        var t = (e[1] - a[e[0]]) / (b[e[0]] - a[e[0]]);
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      });
    });
    if (scr.length < 3) return 0;
    var area = 0;
    for (var i = 0; i < scr.length; i++) { var p = scr[i], q = scr[(i + 1) % scr.length]; area += p[0] * q[1] - q[0] * p[1]; }
    return Math.abs(area) / 2;
  }
  // 'draw' when a captured face covers >= 12 px on screen, 'none' when none
  // covers any, else 'marginal' (sub-pixel slivers; not judged).
  function oracle(subject, P) {
    var max = 0, n = 0;
    subject.faces.forEach(function (f) { var a = screenArea(f, P); if (a > 0) n++; if (a > max) max = a; });
    return {expect: max >= 12 ? 'draw' : max > 0 ? 'marginal' : 'none', faces: n, maxArea: Math.round(max)};
  }

  // ── Spies: world faces handed to projectSceneWorldPolygon (capture) and
  // depth-tested fills that painted pixels (actual), per model key ──
  var capturing = null, painting = null, modelKey = null;
  (function () {
    var realModel = G.drawWorldModel, realProject = G.projectSceneWorldPolygon, realFill = G.fillSceneDepthPolygon;
    G.drawWorldModel = function (inst, model) {
      var prev = modelKey; modelKey = model && model.key;
      try { return realModel.apply(this, arguments); } finally { modelKey = prev; }
    };
    G.projectSceneWorldPolygon = function (vertices) {
      if (capturing) capturing.push({key: modelKey, v: vertices.map(function (p) { return {x: p.x, y: p.y, z: p.z}; })});
      return realProject.apply(this, arguments);
    };
    G.fillSceneDepthPolygon = function () {
      var r = realFill.apply(this, arguments);
      if (painting) painting.push({key: modelKey, visible: r});
      return r;
    };
  }());

  // ── Subjects ──
  // family -> model keys counted (null: every face of the isolated draw).
  var KEYS = {shrine: ['landmarkShrine'], stall: ['landmarkStall'], tower: ['landmarkTower']};
  function farStall() { return {x: -9000, y: -9000, facing: 0, stallType: 'weapons'}; }
  function isolated(subject, fn) {
    var names = ['shrines', 'marketStalls', 'shopMarker', 'largeStructures', 'deepCaveEntrances', 'ruins', 'treasureChests'], saved = {};
    names.forEach(function (n) { saved[n] = G[n]; });
    G.shrines = []; G.marketStalls = []; G.shopMarker = null; G.largeStructures = []; G.deepCaveEntrances = []; G.ruins = []; G.treasureChests = [];
    var f = subject.family, o = subject.obj;
    if (f === 'shrine') G.shrines = [o];
    else if (f === 'stall') G.marketStalls = [o];
    else if (f === 'tower') { G.marketStalls = [farStall()]; G.shopMarker = o; }   // drawMarketStalls3D needs a stall; this one is out of range
    else if (f === 'portal') G.deepCaveEntrances = [o];
    else if (f === 'ruin') G.ruins = [o];
    else if (f === 'chest') G.treasureChests = [o];
    else G.largeStructures = [o];
    try { return fn(); } finally { names.forEach(function (n) { G[n] = saved[n]; }); }
  }
  function drawFamily(subject) {
    var f = subject.family;
    if (f === 'shrine') G.drawShrines3D();
    else if (f === 'stall' || f === 'tower') G.drawMarketStalls3D();
    else if (f === 'portal') G.drawCaveEntrance3D();
    else if (f === 'ruin') G.drawRuins3D();
    else if (f === 'chest') G.drawTreasureChests3D();
    else G.drawStructures3D();
  }
  function counted(subject, list) {
    var keys = KEYS[subject.family];
    return list.filter(function (e) { return !keys || keys.indexOf(e.key) >= 0; });
  }
  var PAINT = ['fill', 'fillRect', 'stroke', 'strokeRect', 'fillText', 'strokeText', 'drawImage', 'putImageData'];
  // The real draw at pose P: painted faces, every paint command, depth written.
  // A column pose adds the legacy column occluder (depthBuffer only; the
  // real walls pass writes it and scene depth, which tests each face).
  function actual(subject, P, extra) {
    features(extra);
    pose(P.x, P.y, P.ang, P.pitch, subject.z);
    if (P.column) G.depthBuffer.fill(5, 156, 165);
    var before = G._sceneDepthInv.slice();
    painting = []; H.record(true, false);
    try { isolated(subject, function () { drawFamily(subject); }); } finally { var rec = H.record(false), paints = painting; painting = null; }
    var d = G._sceneDepthInv, written = 0;
    for (var i = 0; i < d.length; i++) if (d[i] !== before[i]) written++;
    var cmds = 0;
    PAINT.forEach(function (m) { cmds += rec.counts[m] || 0; });
    return {painted: counted(subject, paints).filter(function (e) { return e.visible > 0; }).length, cmds: cmds, depth: written};
  }
  // Authored faces: the isolated draw at pose P with entityVisible3D stubbed
  // open (every entity accepted, its centre depth kept), so no gate variant
  // can hide a face from the oracle.
  function capture(subject, P) {
    features();
    pose(P.x, P.y, P.ang, P.pitch, subject.z);
    var realVis = G.entityVisible3D;
    G.entityVisible3D = function (wx, wy, wz, C) {
      var dx = wx - G.cam.x, dy = wy - G.cam.y;
      return {sx: NaN, sy: NaN, fwd: dx * C.cosAng + dy * C.sinAng, dist: Math.max(1, Math.hypot(dx, dy)), floorZ: wz, renderZ: wz, fade: 1};
    };
    capturing = [];
    try { isolated(subject, function () { drawFamily(subject); }); } finally { G.entityVisible3D = realVis; var got = capturing; capturing = null; }
    subject.faces = counted(subject, got).map(function (e) { return e.v; });
    subject.reach = 0;
    subject.faces.forEach(function (f) { f.forEach(function (p) { subject.reach = Math.max(subject.reach, Math.hypot(p.x - subject.x, p.y - subject.y)); }); });
    return subject.faces.length;
  }
  function radiusOf(subject) {
    var f = subject.family, o = subject.obj;
    if (f === 'shrine') return G.landmarkShrineRadius();
    if (f === 'stall') return G.landmarkStallRadius();
    if (f === 'tower') return G.landmarkTowerRadius();
    if (f === 'portal') return G.landmarkPortalRadius(o);
    if (f === 'ruin') return G.landmarkRuinRadius(o);
    if (f === 'chest') return 12;
    return G.landmarkStructureRadius(o);
  }
  // The legacy gate's verdict and reason, from the legacy options.
  function legacyVerdict(subject) {
    var o = subject.obj, f = subject.family, C = G.getCam3D(), st = {tooFar: 0, behind: 0, depthOccl: 0, belowFloor: 0, midOccl: 0}, v;
    var dx = o.x - G.cam.x, dy = o.y - G.cam.y, dist = Math.hypot(dx, dy), fwd = dx * C.cosAng + dy * C.sinAng;
    var lowZ = G.floorMesh ? G.getFloorHeightAt(o.x, o.y) * 25 : 0;
    if (f === 'chest') return 'control';
    if (f === 'portal') return dist < 1 || dist > 900 ? 'tooFar' : fwd < 1 ? 'behind' : 'drawn';
    if ((f === 'shrine' || f === 'ruin' || f === 'fortress' || f === 'arena' || f === 'watchtower') && Math.max(1, dist) < 3) return 'minDist';
    if (f === 'shrine') v = G.entityVisible3D(o.x, o.y, o.wz || o.z || 0, C, {maxDist: VIEW * 0.8, depthOffset: 2, checkMidpoint: true, fadeFraction: 0.8, stats: st});
    else if (f === 'stall') v = G.entityVisible3D(o.x, o.y, lowZ, C, {maxDist: VIEW * 0.8, sceneDepth: true, fadeFraction: 0.8, stats: st});
    else if (f === 'tower') v = G.entityVisible3D(o.x, o.y, lowZ, C, {maxDist: 900, sceneDepth: true, fadeFraction: 0.8, stats: st});
    else if (f === 'ruin') v = G.entityVisible3D(o.x, o.y, G.getEntityRenderFloorZ(o), C, {maxDist: VIEW, sceneDepth: true, fadeFraction: 0.8, stats: st});
    else v = G.entityVisible3D(o.x, o.y, G.getEntityRenderFloorZ(o), C, {maxDist: VIEW * 2.6, depthOffset: 2, checkMidpoint: true, fadeFraction: 0.92, stats: st});
    if (v) return 'drawn';
    var why = Object.keys(st).filter(function (k) { return st[k]; });
    return why.length ? why.join('+') : (G.floorMesh && lowZ < -2.5 ? 'underground' : 'rejected');
  }
  function row(subject, name, P, extra) {
    var Pz = pose(P.x, P.y, P.ang, P.pitch, subject.z), o = oracle(subject, Pz), a = actual(subject, P, extra);
    features(extra);
    pose(P.x, P.y, P.ang, P.pitch, subject.z);
    if (P.column) G.depthBuffer.fill(5, 156, 165);
    var legacy = legacyVerdict(subject);
    var ok = o.expect === 'draw' ? a.painted > 0 : o.expect === 'none' ? a.painted === 0 && (name !== 'behind' || (a.cmds === 0 && a.depth === 0)) : true;
    return {seed: subject.seed, family: subject.family, id: subject.id, pose: name, expect: o.expect, faces: o.faces, maxArea: o.maxArea,
      painted: a.painted, cmds: a.cmds, depth: a.depth, legacy: legacy, ok: ok};
  }
  function fmt(r) {
    return r.seed + ' ' + r.family + ' ' + r.id + ' ' + r.pose + ': expect ' + r.expect + ' (' + r.faces + ' faces on screen, max ' + r.maxArea +
      ' px) painted ' + r.painted + (r.pose === 'behind' ? ' cmds ' + r.cmds + ' depth ' + r.depth : '') + ' legacy ' + r.legacy + (r.ok ? '' : ' MISMATCH');
  }
  function unit(a) { return {x: Math.cos(a), y: Math.sin(a)}; }
  // Poses about a subject whose production radius is R, approaching along `a`.
  // In front: far enough that the ground under a small landmark is in view
  // from the game's eye height (the ground shows from ~60 u at pitch 0.3).
  function frontPose(s, a) { var u = unit(a), d = s.R + 120; return {x: s.x - u.x * d, y: s.y - u.y * d, ang: a, pitch: 0.3}; }
  // Wholly behind: past both the captured faces and the production radius.
  function behindPose(s, a) { var u = unit(a), d = Math.max(s.reach, s.R) + 40; return {x: s.x + u.x * d, y: s.y + u.y * d, ang: a, pitch: 0}; }
  // A camera past the centre (its centre depth <= -2) whose captured faces
  // land on screen, standing outside a model family's plan box (a camera in
  // a pedestal, stall or tower is not a pose the game produces).
  function pastPose(s, a0) {
    var model = !!KEYS[s.family], box = null;
    if (model) {
      box = {x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity};
      s.faces.forEach(function (f) { f.forEach(function (p) {
        box.x0 = Math.min(box.x0, p.x); box.x1 = Math.max(box.x1, p.x); box.y0 = Math.min(box.y0, p.y); box.y1 = Math.max(box.y1, p.y); }); });
    }
    var R = s.reach, half = box ? Math.max(box.x1 - s.x, s.x - box.x0, box.y1 - s.y, s.y - box.y0) : R * 0.75;
    var steps = [2, 4, R * 0.25, R * 0.5], sides = [0, R * 0.5, -R * 0.5, half + 3, -half - 3, R + 3, -R - 3];
    var turns = [0, 0.35, -0.35, 0.7, -0.7], pitches = [0, 0.5, 0.9];
    for (var k = 0; k < 4; k++) for (var i = 0; i < steps.length; i++) for (var j = 0; j < sides.length; j++) {
      var a = a0 + k * Math.PI / 2, u = unit(a), v = {x: -u.y, y: u.x}, L = sides[j];
      var x = s.x + u.x * steps[i] + v.x * L, y = s.y + u.y * steps[i] + v.y * L;
      if (box && x > box.x0 - 3 && x < box.x1 + 3 && y > box.y0 - 3 && y < box.y1 + 3) continue;
      for (var t = 0; t < turns.length; t++) for (var p = 0; p < pitches.length; p++) {
        var ang = a + turns[t], c = unit(ang);
        if ((s.x - x) * c.x + (s.y - y) * c.y > -2) continue;
        var g = G.getEntityGroundRenderZ(x, y, false);
        var P = {x: x, y: y, ang: ang, pitch: pitches[p], cameraZ: (Number.isFinite(g) ? g : s.z) + EYE,
          horizonY: Math.floor(HT * 0.5) + Math.floor(-pitches[p] * PS)};
        if (oracle(s, P).expect === 'draw') return P;
      }
    }
    return null;
  }
  function makeSubject(seed, family, obj, id) {
    var z = G.getEntityRenderFloorZ(obj);
    return {seed: seed, family: family, obj: obj, id: id, x: obj.x, y: obj.y, z: Number.isFinite(z) ? z : 0, faces: [], reach: 0, R: 0};
  }
  function nearestTo(list, x, y, pred) {
    var best = null, bd = Infinity;
    (list || []).forEach(function (o) {
      if (pred && !pred(o)) return;
      var d = Math.hypot(o.x - x, o.y - y);
      if (d < bd) { bd = d; best = o; }
    });
    return best;
  }

  var ALL_SEEDS = [424242, 777000, 31337, 12345, 2024, 555];
  var SEEDS = __argv.indexOf('--seeds') >= 0 ? __argv[__argv.indexOf('--seeds') + 1].split(',').map(Number) : ALL_SEEDS;
  function insideWindow(o) { return o.x > 0 && o.y > 0 && o.x < G.gridW * G.cell && o.y < G.gridH * G.cell; }
  function windowSubjects(seed) {
    var cx = G.pos.x, cy = G.pos.y, list = [];
    var shr = nearestTo(G.shrines, cx, cy, insideWindow);
    if (shr) list.push(makeSubject(seed, 'shrine', shr, 'shrine@' + Math.round(shr.x) + ',' + Math.round(shr.y)));
    var stall = nearestTo(G.marketStalls, cx, cy);
    if (stall) list.push(makeSubject(seed, 'stall', stall, 'stall:' + stall.stallType));
    if (G.shopMarker) list.push(makeSubject(seed, 'tower', G.shopMarker, 'tower'));
    var ce = nearestTo(G.deepCaveEntrances, cx, cy, insideWindow);
    if (ce) list.push(makeSubject(seed, 'portal', ce, 'portal@' + Math.round(ce.x) + ',' + Math.round(ce.y)));
    var ru = nearestTo(G.ruins, cx, cy, insideWindow);
    if (ru) list.push(makeSubject(seed, 'ruin', ru, 'ruin:' + ru.ruinType));
    var ch = nearestTo(G.treasureChests, cx, cy, function (c) { return insideWindow(c) && !c.collected && !c.underground && !c.caveSpawnId; });
    if (ch) list.push(makeSubject(seed, 'chest', ch, 'chest:' + (ch.tier || 'common')));
    return list;
  }
  function structureWindow(seed, type) {
    var target = G.findNearestLandmarkRegion(0, 0, {type: type});
    if (!target) return null;
    G.assembleWindow(target.centerCX, target.centerCY);
    var st = G.largeStructures.filter(function (s) { return s.regionX === target.regionX && s.regionY === target.regionY; })[0];
    return st ? makeSubject(seed, type, st, type + '@' + target.regionX + ',' + target.regionY) : null;
  }
  // Rows for one subject: front, column (legacy column-gate families),
  // past (when a pose exists) and behind; the approach is from the window centre.
  function sweepSubject(s, rows, approach) {
    s.R = radiusOf(s);
    var a = Number.isFinite(approach) ? approach : Math.atan2(s.y - G.pos.y, s.x - G.pos.x) || 0.3;
    var front = frontPose(s, a);
    if (!capture(s, front)) { rows.push({seed: s.seed, family: s.family, id: s.id, pose: 'capture', expect: 'draw', faces: 0, maxArea: 0, painted: 0, legacy: 'n/a', ok: false}); return; }
    s.radiusOk = s.reach <= s.R + 1e-6;
    rows.push(row(s, 'front', front));
    if (s.family === 'chest' || s.family === 'ruin') {
      var off = actual(s, front, {landmarkBoundsGate: false});
      rows[rows.length - 1].controlOff = off.painted;
    }
    if (s.family === 'shrine' || s.family === 'fortress' || s.family === 'arena' || s.family === 'watchtower')
      rows.push(row(s, 'column', {x: front.x, y: front.y, ang: front.ang, pitch: front.pitch, column: true}));
    if (s.family !== 'chest') {
      var past = pastPose(s, a);
      if (past) rows.push(row(s, 'past', past));
      else s.noPast = true;
    }
    rows.push(row(s, 'behind', behindPose(s, a)));
  }

  // ── spec ──
  if (section('spec')) {
    var defs = {};
    G.RENDER_FEATURE_DEFS.forEach(function (d) { defs[d.key] = d; });
    var bg = defs.landmarkBoundsGate, lm = defs.landmarkModels;
    check('spec: landmarkBoundsGate is registered bool, default ON (stage J2) and OFF in Legacy; landmarkModels is now default ON too',
      !!bg && bg.type === 'bool' && bg.default === true && bg.legacy === false && !!lm && lm.default === true && lm.legacy === false,
      {bounds: bg, models: lm});
    G.applyRenderPreset('legacy');
    var legacyOff = !G.landmarkBoundsGateOn() && !G.landmarkModelsOn();
    G.applyRenderPreset('recommended');
    check('spec: the Legacy preset turns both off; Recommended turns both on', legacyOff && G.landmarkBoundsGateOn() && G.landmarkModelsOn(), legacyOff);
  }

  // ── gate: entityVisible3D's worldRadius and renderEntities3D ──
  if (section('gate')) {
    features();
    G.floorMesh = null; G.playerUnderground = false;
    pose(0, 0, 0, 0, 0);
    var C = G.getCam3D();
    function vis(x, y, opts) { var st = {tooFar: 0, behind: 0, depthOccl: 0, belowFloor: 0, midOccl: 0}; opts.stats = st; var v = G.entityVisible3D(x, y, 0, C, opts); return {v: v, st: st}; }
    var a = vis(-5, 3, {sceneDepth: true, worldRadius: 6.5}), b = vis(-5, 3, {sceneDepth: true, worldRadius: 5.5});
    var c0 = vis(-5, 3, {sceneDepth: true});
    check('gate: a centre 5 behind the camera is kept with r 6.5 (fwd + r >= 1) with sx/sy NaN and its true depth; rejected as behind with r 5.5 and with no radius',
      !!a.v && Number.isNaN(a.v.sx) && Number.isNaN(a.v.sy) && a.v.fwd === -5 && !b.v && b.st.behind === 1 && !c0.v && c0.st.behind === 1,
      {a: a.v, b: b.st, none: c0.st});
    var f1 = vis(120, 0, {sceneDepth: true, maxDist: 100, worldRadius: 25}), f2 = vis(120, 0, {sceneDepth: true, maxDist: 100, worldRadius: 15});
    var f3 = vis(120, 0, {sceneDepth: true, maxDist: 100});
    check('gate: a centre 120 away with maxDist 100 is kept with r 25 (dist - r <= maxDist, a real screen point) and rejected as too far with r 15 and with no radius',
      !!f1.v && f1.v.sx === 160 && Number.isFinite(f1.v.sy) && !f2.v && f2.st.tooFar === 1 && !f3.v && f3.st.tooFar === 1, {r25: f1.v, r15: f2.st});
    G.depthBuffer.fill(5, 150, 170);
    var n1 = vis(60, 0, {depthOffset: 2, worldRadius: 50}), n2 = vis(60, 0, {depthOffset: 2});
    var n3 = vis(-5, 0, {worldRadius: 50});
    G.depthBuffer.fill(Infinity);
    check('gate: without scene depth the radius is ignored: the column test still rejects (same stats) and a centre behind is still rejected',
      !n1.v && !n2.v && n1.st.depthOccl === 1 && n2.st.depthOccl === 1 && !n3.v && n3.st.behind === 1, {n1: n1.st, n2: n2.st, n3: n3.st});
    // midpointBeyond: a hill of 500 at the midpoint of a centre 300 ahead.
    var realFloor = G.getFloorHeightAt;
    G.floorMesh = {stub: true};
    G.getFloorHeightAt = function (x) { return Math.abs(x - 150) < 20 ? 20 : 0; };
    try {
      var h1 = vis(300, 0, {sceneDepth: true, worldRadius: 50, checkMidpoint: true, midpointBeyond: 200});
      var h2 = vis(300, 0, {sceneDepth: true, worldRadius: 50, checkMidpoint: true, midpointBeyond: 260});
      var h3 = vis(300, 0, {checkMidpoint: true});
      var h4 = vis(300, 0, {sceneDepth: true, checkMidpoint: true, midpointBeyond: 200});
    } finally { G.getFloorHeightAt = realFloor; G.floorMesh = null; }
    check('gate: the hill test applies only to bounds wholly beyond midpointBeyond (250 > 200 rejects as midOccl, 250 < 260 keeps); the legacy test still rejects; scene depth without a radius skips it',
      !h1.v && h1.st.midOccl === 1 && !!h2.v && !h3.v && h3.st.midOccl === 1 && !!h4.v, {h1: h1.st, h2: !!h2.v, h3: h3.st, h4: !!h4.v});
    // renderEntities3D: the radius function sees each entity; minDist yields to the bounds.
    var seen = [], drawn = [];
    var ents = [{x: 2, y: 0.5, z: 0, id: 'near'}, {x: -4, y: 1, z: 0, id: 'behind'}, {x: 50, y: 0, z: 0, id: 'ahead'}];
    G.renderEntities3D(ents, {sceneDepth: true, minDist: 3, worldRadius: function (e) { seen.push(e.id); return 8; }}, function (e) { drawn.push(e.id); });
    var drawnLegacy = [];
    G.renderEntities3D(ents, {sceneDepth: true, minDist: 3}, function (e) { drawnLegacy.push(e.id); });
    check('gate: renderEntities3D hands each entity to the radius function; with bounds minDist does not apply (near and behind kept), without it the centre gate and minDist stand',
      seen.join() === 'near,behind,ahead' && drawn.sort().join() === 'ahead,behind,near' && drawnLegacy.join() === 'ahead', {seen: seen, drawn: drawn, legacy: drawnLegacy});
    // A shrine the bounds reach past its range fade (maxDist < dist <= maxDist
    // + r) is fully faded: no model is drawn and no depth written (an
    // unpainted depth write would hide what lies behind it). Control: nearer, it draws.
    function shrineAt(d) {
      features(); pose(0, 0, 0, 0.3, 0);
      G.shrines = [{x: d, y: 0, buffType: 'speed', used: false}];
      var before = G._sceneDepthInv.slice(), n = 0;
      painting = [];
      try { G.drawShrines3D('opaque'); } finally { var p = painting; painting = null; G.shrines = []; }
      for (var i = 0; i < before.length; i++) if (before[i] !== G._sceneDepthInv[i]) n++;
      return {fills: p.length, depth: n};
    }
    var pastRange = shrineAt(VIEW * 0.8 + 5), inRange = shrineAt(VIEW * 0.5);
    var reached = G.entityVisible3D(VIEW * 0.8 + 5, 0, 0, G.getCam3D(), {maxDist: VIEW * 0.8, sceneDepth: true, worldRadius: G.landmarkShrineRadius(), fadeFraction: 0.8});
    check('gate: a shrine just past its range, reached only through its bounds, is fully faded and draws nothing (no fill, no depth); control: at half range it draws',
      !!reached && reached.fade === 0 && pastRange.fills === 0 && pastRange.depth === 0 && inRange.fills > 0 && inRange.depth > 0,
      {reached: reached, past: pastRange, near: inRange});
    var rescueOff, rescueFront, rescueBehind;
    features({landmarkBoundsGate: false}); rescueOff = G.landmarkBoundsRescue(-5, 0, 0, C, 900, 0.8, 12);
    features(); rescueFront = G.landmarkBoundsRescue(50, 0, 0, C, 900, 0.8, 12); rescueBehind = G.landmarkBoundsRescue(-5, 0, 0, C, 900, 0.8, 12);
    var rescueGone = G.landmarkBoundsRescue(-20, 0, 0, C, 900, 0.8, 12);
    check('gate: the stall/tower rescue re-asks only a centre behind the camera or out of range, with the bounds, and only with the switch on',
      rescueOff === null && rescueFront === null && !!rescueBehind && Number.isNaN(rescueBehind.sx) && rescueGone === null,
      {off: rescueOff, front: rescueFront, behind: rescueBehind, gone: rescueGone});
    // Ruin dressing paints opaque (alpha 1) and the wall renderer and terrain
    // end at viewDist, so the bounds extend only its near-plane test: a ruin
    // whose centre is past viewDist, though its bounds reach inside, draws no
    // dressing (no fill, no depth), as the legacy centre limit did (fixes
    // round 1). Control: a centre just inside viewDist draws.
    function ruinAt(d) {
      features(); pose(0, 0, 0, 0.3, 0);
      G.ruins = [{x: d, y: 0, ruinType: 'hut', facing: 0}];
      var before = G._sceneDepthInv.slice(), n = 0;
      painting = [];
      try { G.drawRuins3D('opaque'); } finally { var p = painting; painting = null; G.ruins = []; }
      for (var i = 0; i < before.length; i++) if (before[i] !== G._sceneDepthInv[i]) n++;
      return {fills: p.length, depth: n};
    }
    var ruinR = G.landmarkRuinRadius({x: 0, y: 0, ruinType: 'hut', facing: 0});
    var ruinFar = ruinAt(VIEW + ruinR * 0.5), ruinNear = ruinAt(VIEW - 20);
    var ruinReached = G.entityVisible3D(VIEW + ruinR * 0.5, 0, 0, G.getCam3D(), {maxDist: VIEW, sceneDepth: true, worldRadius: ruinR, fadeFraction: 0.8});
    check('gate: a ruin whose centre is past viewDist, reached only through its bounds, draws no opaque dressing (no fill, no depth); control: a centre just inside viewDist draws',
      ruinR > 0 && !!ruinReached && ruinFar.fills === 0 && ruinFar.depth === 0 && ruinNear.fills > 0,
      {r: ruinR, reached: !!ruinReached, far: ruinFar, near: ruinNear});
  }

  // ── sweep: six seeds, every family ──
  var rows = [], subjects = [];
  if (section('sweep')) {
    SEEDS.forEach(function (seed) {
      H.startEndless(seed);
      windowSubjects(seed).forEach(function (s) { subjects.push(s); sweepSubject(s, rows); });
      ['fortress', 'arena', 'watchtower'].forEach(function (type) {
        var s = structureWindow(seed, type);
        if (s) { subjects.push(s); sweepSubject(s, rows); }
      });
    });
    rows.forEach(function (r) { out('NOTE row ' + fmt(r)); });
    var bad = rows.filter(function (r) { return !r.ok; }), judged = rows.filter(function (r) { return r.expect !== 'marginal'; });
    check('sweep: every subject over the six seeds draws exactly when its authored faces land on screen (front, column, past, behind; ' +
      judged.length + ' judged rows, ' + (rows.length - judged.length) + ' marginal)', bad.length === 0 && judged.length > (SEEDS.length === ALL_SEEDS.length ? 50 : 0),
      bad.slice(0, 8).map(fmt));
    var FAMS = ['shrine', 'stall', 'tower', 'fortress', 'arena', 'watchtower', 'portal', 'ruin', 'chest'], have = {};
    rows.forEach(function (r) {
      var h = have[r.family] || (have[r.family] = {front: 0, behind: 0});
      if (r.pose === 'front' && r.expect === 'draw' && r.painted > 0) h.front++;
      if (r.pose === 'behind' && r.expect === 'none' && r.cmds === 0 && r.depth === 0) h.behind++;
    });
    if (SEEDS.length === ALL_SEEDS.length) check('sweep: every family has a subject that draws from in front and draws nothing (no paint command, no depth) from past its bounds',
      FAMS.every(function (f) { return have[f] && have[f].front > 0 && have[f].behind > 0; }), have);
    var controls = rows.filter(function (r) { return (r.family === 'chest' || r.family === 'ruin') && r.pose === 'front'; });
    if (SEEDS.length === ALL_SEEDS.length) check('sweep: positive controls: every chest and ruin front row draws with the bounds gate on and off',
      controls.length >= 6 && controls.every(function (r) { return r.painted > 0 && r.controlOff > 0; }),
      controls.map(function (r) { return r.seed + ' ' + r.id + ' ' + r.painted + '/' + r.controlOff; }));
    var culls = {}, reasons = {};
    rows.forEach(function (r) {
      if (r.expect !== 'draw' || r.legacy === 'drawn' || r.legacy === 'control') return;
      culls[r.family] = (culls[r.family] || 0) + 1;
      reasons[r.legacy] = (reasons[r.legacy] || 0) + 1;
    });
    out('NOTE sweep legacy culls of on-screen rows by family ' + JSON.stringify(culls) + ' by reason ' + JSON.stringify(reasons) +
      '; no past pose: ' + subjects.filter(function (s) { return s.noPast; }).map(function (s) { return s.seed + ' ' + s.id; }).join(', '));
    if (SEEDS.length === ALL_SEEDS.length) check('sweep: the legacy gates cull on-screen rows of every family but the chest control (centre behind, column, hill, below floor, underground); the bounds gate draws them',
      ['shrine', 'stall', 'tower', 'fortress', 'arena', 'watchtower', 'portal', 'ruin'].every(function (f) { return culls[f] > 0; }) &&
      reasons.behind > 0 && reasons.depthOccl > 0, {culls: culls, reasons: reasons});
    var shortR = subjects.filter(function (s) { return s.faces.length && !s.radiusOk; });
    check('sweep: every captured authored face lies inside its family\'s bounds radius (' + subjects.length + ' subjects)',
      shortR.length === 0 && subjects.length >= (SEEDS.length === ALL_SEEDS.length ? 30 : 1), shortR.map(function (s) { return s.seed + ' ' + s.id + ' reach ' + s.reach.toFixed(2) + ' > R ' + s.R.toFixed(2); }));
  }

  // ── probe: the probe-B poses and an object wholly behind the camera ──
  if (section('probe')) {
    function probeRow(s, name, P) { var r = row(s, name, P); out('NOTE probe ' + fmt(r)); return r; }
    H.startEndless(555);
    var ce = nearestTo(G.deepCaveEntrances, G.pos.x, G.pos.y, insideWindow), portal = ce ? makeSubject(555, 'portal', ce, 'portal') : null;
    if (portal) {
      portal.R = radiusOf(portal);
      var fa = Math.atan2(ce.sinA !== undefined ? ce.sinA : Math.sin(ce.angle || 0), ce.cosA !== undefined ? ce.cosA : Math.cos(ce.angle || 0));
      capture(portal, frontPose(portal, fa));
      var mouth = {x: ce.x - Math.cos(fa) * 6, y: ce.y - Math.sin(fa) * 6};
      var side1 = probeRow(portal, 'mouth-sideways+', {x: mouth.x, y: mouth.y, ang: fa + Math.PI / 2, pitch: 0});
      var side2 = probeRow(portal, 'mouth-sideways-', {x: mouth.x, y: mouth.y, ang: fa - Math.PI / 2, pitch: 0});
      check('probe: at the portal mouth facing sideways (either way) the jamb and flank ahead draw; the legacy centre check (fwd < 1) culled the portal',
        [side1, side2].every(function (r) { return r.expect === 'draw' && r.painted > 0 && r.legacy === 'behind'; }), [fmt(side1), fmt(side2)]);
      var pb = probeRow(portal, 'behind', behindPose(portal, fa + Math.PI));
      check('probe: a portal wholly behind the camera draws nothing (no paint command, no depth)', pb.expect === 'none' && pb.painted === 0 && pb.cmds === 0 && pb.depth === 0, fmt(pb));
    } else check('probe: seed 555 has a cave portal in its window', false, null);
    // Past the watchtower centre, along an arm, facing out.
    H.startEndless(424242);
    var wt = structureWindow(424242, 'watchtower');
    if (wt) {
      wt.R = radiusOf(wt);
      var armA = wt.obj.rotation || 0, sc = wt.obj.scale || 1;
      capture(wt, frontPose(wt, armA));
      var wrow = probeRow(wt, 'past-centre-along-arm', {x: wt.x + Math.cos(armA) * G.cell * (3 + 7) * sc, y: wt.y + Math.sin(armA) * G.cell * (3 + 7) * sc, ang: armA, pitch: 0});
      check('probe: a camera past the watchtower centre, along an arm facing out, draws the arm room\'s faces ahead; the legacy gate culled the watchtower as behind',
        wrow.expect === 'draw' && wrow.painted > 0 && wrow.legacy === 'behind', fmt(wrow));
      var wb = probeRow(wt, 'behind', behindPose(wt, armA));
      check('probe: a watchtower wholly behind the camera draws nothing', wb.expect === 'none' && wb.painted === 0 && wb.cmds === 0 && wb.depth === 0, fmt(wb));
    } else check('probe: seed 424242 reaches a watchtower', false, null);
    // Past the ruin centre, facing out of its open face, looking down.
    H.startEndless(2024);
    var ru = nearestTo(G.ruins, G.pos.x, G.pos.y, insideWindow), ruin = ru ? makeSubject(2024, 'ruin', ru, 'ruin:' + ru.ruinType) : null;
    if (ruin) {
      ruin.R = radiusOf(ruin);
      var o1 = G.ruinLocalToWorld(ru, 0, 1, {}), outA = Math.atan2(o1.y - ru.y, o1.x - ru.x);
      capture(ruin, frontPose(ruin, outA + Math.PI));
      var rrow = probeRow(ruin, 'past-centre-facing-out', {x: ru.x + Math.cos(outA) * 6, y: ru.y + Math.sin(outA) * 6, ang: outA, pitch: 0.9});
      check('probe: a camera past the ruin centre, facing out of its open face, draws the waypost and debris ahead; the legacy gate culled the ruin as behind',
        rrow.expect === 'draw' && rrow.painted > 0 && rrow.legacy === 'behind', fmt(rrow));
      var rb = probeRow(ruin, 'behind', behindPose(ruin, outA));
      check('probe: a ruin wholly behind the camera draws nothing', rb.expect === 'none' && rb.painted === 0 && rb.cmds === 0 && rb.depth === 0, fmt(rb));
    } else check('probe: seed 2024 has a ruin in its window', false, null);
    // Model landmarks wholly behind: shrine, stall and tower (seed 2024 market).
    var small = [];
    var sh = nearestTo(G.shrines, G.pos.x, G.pos.y, insideWindow);
    if (sh) small.push(makeSubject(2024, 'shrine', sh, 'shrine'));
    if (G.marketStalls && G.marketStalls[0]) small.push(makeSubject(2024, 'stall', G.marketStalls[0], 'stall'));
    if (G.shopMarker) small.push(makeSubject(2024, 'tower', G.shopMarker, 'tower'));
    var smallRows = small.map(function (s) { s.R = radiusOf(s); capture(s, frontPose(s, 0.4)); return probeRow(s, 'behind', behindPose(s, 0.4)); });
    check('probe: a shrine, stall and guard tower wholly behind the camera draw nothing (no paint command, no depth); from in front they draw',
      smallRows.length === 3 && smallRows.every(function (r) { return r.expect === 'none' && r.painted === 0 && r.cmds === 0 && r.depth === 0; }) &&
      small.every(function (s) { var r = row(s, 'front', frontPose(s, 0.4)); return r.painted > 0; }), smallRows.map(fmt));
  }

  // ── cave: a surface shrine above a cave, seen from both strata (fixes round 1) ──
  // The bounds gate drops the legacy column and surface/underground tests,
  // so from inside a cave only the scene depth the real passes write (the
  // cave roof) hides a surface shrine. Full G.draw() frames on seed 555's
  // window (real ceiling, floor, wall and portal passes; the player settled
  // on the cave floor, cam.z = pos.floorZ, as the game places it): the
  // shrine model paints 0 px from the cave although its captured faces land
  // on screen by the test's own projection. Controls: the same shrine from
  // the surface paints; from the cave it paints when the scene depth is
  // cleared just before the landmark pass (the pose frames it, and depth
  // alone hides it) and when the ceiling pass is skipped (DEBUG_HIDE_CEIL:
  // the roof is what hides it).
  if (section('cave')) {
    H.startEndless(555);
    var mesh = G.floorMesh, gs = mesh ? mesh.gridSize : 0;
    // A mesh column: its lowest walkable floor, the lowest ceiling layer
    // (type 2) above that floor, its top walkable layer, head room in world
    // units, and whether the surface cell is open.
    function column(gx, gy) {
      if (gx < 0 || gy < 0 || gx >= mesh.w || gy >= mesh.h) return null;
      var i = gy * mesh.w + gx, floor = Infinity, ceil = NaN, top = -Infinity, li, t, h;
      for (li = 0; li < mesh.layerCount[i]; li++) {
        t = G.meshLayerType(mesh, i, li); h = G.meshLayerHeight(mesh, i, li);
        if (t === 1 || t === 3 || t === 4) { floor = Math.min(floor, h); top = Math.max(top, h); }
      }
      for (li = 0; li < mesh.layerCount[i]; li++) {
        t = G.meshLayerType(mesh, i, li); h = G.meshLayerHeight(mesh, i, li);
        if (t === 2 && h > floor && !(h >= ceil)) ceil = h;
      }
      var x = (gx + 0.5) * gs, y = (gy + 0.5) * gs, c = Math.floor(x / G.cell), r = Math.floor(y / G.cell);
      return {floor: floor, ceil: ceil, top: top, room: (ceil - floor) * 25, roofed: top > ceil,
        open: c >= 0 && r >= 0 && c < G.gridW && r < G.gridH && !G.grid[r * G.gridW + c]};
    }
    function portalDist(x, y) {
      var d = Infinity;
      (G.deepCaveEntrances || []).forEach(function (ce) { d = Math.min(d, Math.hypot(ce.x - x, ce.y - y)); });
      return d;
    }
    // The site: an open surface cell over a roofed cave with at least 70 u
    // of head room, its eight neighbours alike, and a run of seven such cave
    // cells in one direction (room to stand back and look up at it). Sites
    // 300 u or more from every cave portal come first (so the roof, not a
    // portal's rock cut, is between), then the one nearest the window centre.
    function caveSite() {
      var best = null;
      if (!mesh || !mesh.layerCount) return null;
      function good(q) { return !!q && q.room >= 70 && q.roofed; }
      for (var gy = 1; gy < mesh.h - 1; gy++) for (var gx = 1; gx < mesh.w - 1; gx++) {
        var here = column(gx, gy);
        if (!good(here) || !here.open) continue;
        var ok = true;
        for (var k = 0; k < 9 && ok; k++) { var q = column(gx + (k % 3) - 1, gy + ((k / 3) | 0) - 1); ok = good(q) && q.open; }
        if (!ok) continue;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          for (var st = 1; st <= 7; st++) if (!good(column(gx + d[0] * st, gy + d[1] * st))) return;
          var x = (gx + 0.5) * gs, y = (gy + 0.5) * gs, pd = portalDist(x, y);
          var score = (pd >= 300 ? 0 : 1e6) + Math.hypot(gx - mesh.w / 2, gy - mesh.h / 2);
          if (!best || score < best.score) best = {x: x, y: y, dir: d, top: here.top, floor: here.floor, ceil: here.ceil, portal: pd, score: score};
        });
      }
      return best;
    }
    var site = caveSite();
    if (site) {
      var savedShrines = G.shrines, shr = {x: site.x, y: site.y, buffType: 'regen', used: false, chunkKey: 'test'};
      var caveSubject = makeSubject(555, 'shrine', shr, 'caveShrine');
      G.shrines = [shr];
      capture(caveSubject, frontPose(caveSubject, 0));
      // A settled pose (preferSurface: the top layer, else the cave floor)
      // facing the shrine, as the game places the camera (cam.z = pos.floorZ).
      function settleAt(x, y, preferSurface, pitch) {
        G.canvas.width = W; G.canvas.height = HT; G.MODE3D = true; G.projScale = PS;
        G.pos.x = x; G.pos.y = y; G.vel.x = G.vel.y = 0;
        G.settlePlayerAtSpawn(preferSurface);
        G.updatePlayerCaveSpace();
        G.cam.ang = Math.atan2(site.y - G.pos.y, site.x - G.pos.x); G.cam.pitch = pitch; G.cam.fov = Math.PI / 2;
        G.resetRenderInterpolation();
        var C = G.getCam3D();
        return {x: G.pos.x, y: G.pos.y, ang: G.cam.ang, pitch: pitch, cameraZ: C.cameraZ, horizonY: C.horizonY, underground: !!G.playerUnderground};
      }
      // The cave pose: along the site's run, the first whose settled player
      // is underground with head room (the eye at least 5 below the roof)
      // and, looking up (the game allows pitch -1.4), sees the shrine's
      // captured faces on screen by the test's projection. No gate involved.
      var cavePose = null, tried = 0;
      [5, 6, 7, 4].forEach(function (st) {
        [-1, -1.4].forEach(function (pitch) {
          if (cavePose) return;
          tried++;
          var P = settleAt(site.x + site.dir[0] * st * gs, site.y + site.dir[1] * st * gs, false, pitch);
          var q = column(Math.floor(P.x / gs), Math.floor(P.y / gs));
          if (P.underground && q && q.ceil * 25 > P.cameraZ + 5 && oracle(caveSubject, P).expect === 'draw') { cavePose = P; cavePose.roof = q.ceil * 25; }
        });
      });
      // A real frame; the camera is read inside it, at the shrine pass.
      // clearDepth: the scene depth is cleared just before the landmark pass.
      var frameCam = null, realShrines = G.drawShrines3D, realLandmarks = G.drawLandmarkOpaque3D;
      function caveFrame(x, y, preferSurface, pitch, hideCeil, clearDepth) {
        features();
        settleAt(x, y, preferSurface, pitch);
        G._lightGridFrameCount = 1; G._presentationRandomState = 1234567; H.clock.seed = 0x0badcafe;
        G.DEBUG_HIDE_CEIL = !!hideCeil;
        frameCam = null; painting = [];
        G.drawShrines3D = function () {
          if (!frameCam) { var C = G.getCam3D(); frameCam = {x: G.cam.x, y: G.cam.y, ang: G.cam.ang, pitch: G.cam.pitch, cameraZ: C.cameraZ, horizonY: C.horizonY, invTanHalf: C.invTanHalf, ps: G.projScale}; }
          return realShrines.apply(this, arguments);
        };
        if (clearDepth) G.drawLandmarkOpaque3D = function () { G._sceneDepthInv.fill(0); return realLandmarks.apply(this, arguments); };
        try { G.draw(); } finally {
          var p = painting; painting = null; G.drawShrines3D = realShrines; G.drawLandmarkOpaque3D = realLandmarks; G.DEBUG_HIDE_CEIL = false;
        }
        var model = counted(caveSubject, p), px = 0;
        model.forEach(function (e) { px += e.visible > 0 ? e.visible : 0; });
        var o = frameCam ? oracle(caveSubject, frameCam) : {expect: 'n/a'};
        return {underground: !!G.playerUnderground, x: Math.round(G.pos.x), y: Math.round(G.pos.y), pitch: pitch, fills: model.length, px: px,
          expect: o.expect, maxArea: o.maxArea, camOk: !!frameCam && Math.abs(frameCam.invTanHalf - 1) < 1e-9 && frameCam.ps === PS};
      }
      var fromSurface = null, fromCave = null, caveCleared = null, caveNoCeil = null;
      try {
        fromSurface = caveFrame(site.x - site.dir[0] * 70, site.y - site.dir[1] * 70, true, 0);
        if (cavePose) {
          fromCave = caveFrame(cavePose.x, cavePose.y, false, cavePose.pitch);
          caveCleared = caveFrame(cavePose.x, cavePose.y, false, cavePose.pitch, false, true);
          caveNoCeil = caveFrame(cavePose.x, cavePose.y, false, cavePose.pitch, true);
        }
      } finally { G.shrines = savedShrines; }
      out('NOTE cave seed 555 site (' + Math.round(site.x) + ',' + Math.round(site.y) + ') surface ' + (site.top * 25).toFixed(1) + ' roof ' + (site.ceil * 25).toFixed(1) +
        ' cave floor ' + (site.floor * 25).toFixed(1) + ' nearest portal ' + Math.round(site.portal) + ' u | cave pose ' +
        (cavePose ? '(' + Math.round(cavePose.x) + ',' + Math.round(cavePose.y) + ') eye ' + cavePose.cameraZ.toFixed(1) + ' roof ' + cavePose.roof.toFixed(1) + ' pitch ' + cavePose.pitch : 'none') +
        ' of ' + tried + ' | surface ' + JSON.stringify(fromSurface) + ' | cave ' + JSON.stringify(fromCave) +
        ' | cave, depth cleared before the landmark pass ' + JSON.stringify(caveCleared) + ' | cave, ceiling pass skipped ' + JSON.stringify(caveNoCeil));
      check('cave: from the cave floor under a surface shrine the roof hides the shrine model (0 px painted) though its faces land on screen; ' +
        'controls: from the surface it paints, and from the cave it paints with the scene depth cleared before the landmark pass or the ceiling pass skipped',
        !!cavePose && fromCave.underground && !fromSurface.underground && fromCave.camOk && fromSurface.camOk && caveCleared.camOk && caveNoCeil.camOk &&
        fromCave.expect === 'draw' && fromCave.px === 0 && fromSurface.expect === 'draw' && fromSurface.px > 0 && caveCleared.px > 0 && caveNoCeil.px > 0,
        {site: site, pose: cavePose, surface: fromSurface, cave: fromCave, cleared: caveCleared, noCeil: caveNoCeil});
    } else check('cave: seed 555 has an open surface cell over a roofed cave in its window', false, null);
  }

  // ── lab ──
  if (section('lab')) {
    (0, eval)(slurp('tools/game/render-lab/00-core.js'));
    (0, eval)(slurp('tools/game/render-lab/70-landmarks.js'));
    var L = G.RenderLabLandmarks, snap = JSON.stringify(G.renderFeatureSnapshot());
    function behindNow(x, y) { var C = G.getCam3D(); return (x - G.cam.x) * C.cosAng + (y - G.cam.y) * C.sinAng < 1; }
    var m1 = L.portalSideways(555), p1 = L.lastSubject && behindNow(L.lastSubject.x, L.lastSubject.y);
    var m2 = L.pastRuin(2024), p2 = L.lastSubject && behindNow(L.lastSubject.x, L.lastSubject.y);
    var m3 = L.pastWatchtower(424242), p3 = L.lastSubject && behindNow(L.lastSubject.x, L.lastSubject.y);
    var on = G.renderFeatureOn('landmarkBoundsGate'), ab1 = L.abGate(), off = G.renderFeatureOn('landmarkBoundsGate'), ab2 = L.abGate();
    out('NOTE lab ' + [m1, m2, m3, ab1, ab2].join(' | '));
    check('lab: portalSideways(555), pastRuin(2024) and pastWatchtower(424242) stand the camera past each centre with the bounds gate on; abGate() flips landmarkBoundsGate and back',
      !/FAIL/.test(m1 + m2 + m3) && p1 && p2 && p3 && on === true && off === false && G.renderFeatureOn('landmarkBoundsGate') === true &&
      snap === JSON.stringify(G.renderFeatureSnapshot()), {m: [m1, m2, m3], p: [p1, p2, p3], on: on, off: off});
    // The lab's cave pair (fixes round 1): the eye under the roof from the
    // cave (a spot on an entry ramp put the 60 u eye inside the rock); the
    // shrine models paint from the surface and are hidden from the cave.
    function labShrinePx(fn) {
      painting = [];
      try { var msg = fn(); } finally { var p = painting; painting = null; }
      var px = 0;
      p.forEach(function (e) { if (e.key === 'landmarkShrine' && e.visible > 0) px += e.visible; });
      return {msg: msg, px: px};
    }
    var surf = labShrinePx(function () { return L.shrineAboveCave(555); });
    var under = labShrinePx(function () { return L.shrineFromCave(); });
    var gsz = G.floorMesh.gridSize, ci = Math.floor(G.pos.y / gsz) * G.floorMesh.w + Math.floor(G.pos.x / gsz), roof = Infinity, floorAt = G.getCam3D().cameraZ - EYE;
    for (var li = 0; li < G.floorMesh.layerCount[ci]; li++) {
      var lz = G.meshLayerHeight(G.floorMesh, ci, li) * 25;
      if (G.meshLayerType(G.floorMesh, ci, li) === 2 && lz > floorAt && lz < roof) roof = lz;
    }
    var eyeZ = G.getCam3D().cameraZ;
    out('NOTE lab cave ' + surf.msg + ' surface px ' + surf.px + ' | ' + under.msg + ' cave px ' + under.px + ' eye ' + eyeZ.toFixed(1) + ' roof ' + roof.toFixed(1));
    check('lab: shrineAboveCave(555) paints the shrine model from the surface; shrineFromCave() stands underground with the eye under the roof, where the roof hides it',
      !/FAIL/.test(surf.msg + under.msg) && surf.px > 0 && G.playerUnderground === true && roof > eyeZ + 5 && under.px === 0,
      {surface: surf, cave: under, eye: eyeZ, roof: roof});
  }

  check('no console errors', H.errors.length === 0, H.errors.slice(0, 3));
  out('LANDMARK_BOUNDS_RESULT ' + (failed ? 'FAIL ' : 'PASS ') + checked + ' failed ' + failed);
}());
undefined;
