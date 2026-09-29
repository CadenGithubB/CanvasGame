// Driver-level coverage of drawWallDecorations(phase) with wallPropModels on
// (integration stage F1: the modelled torch; F2: sconce, shield and banner).
// Runs the real MAIN manifest through render_host.js on an authored wall: a
// straight row of wall cells whose north face carries the props at full size
// (attachment.size 35.2). Oracles are independent: the torch parts are
// authored here from the F1 spec (backplate 0.3 S x 0.46 S, bracket to 2.2
// out, shaft 0.23 S -> 0.15 S x 0.83 S, two 0.28 S x 0.07 S bands, flame at
// the shaft tip, S = 35.2) and the sconce from the F2 design (octagonal plate,
// arm along the normal, six-sided bowl, flame at the bowl rim); the shield and
// banner parts are built here from the sprite's own recorded 2D layout (its
// traceWallShieldPath / traceWallBannerCloth paths, charges, boss, rod,
// hanger and finials, drawn at w = h = 1000) placed at the F2 depths (shield
// outline extruded 1.2, heraldry decals 0.1 proud, boss frustum; banner rod
// along the tangent, cloth 0.7 out). Everything is projected with the camera's
// pinhole formula; pixel sets are pixel centres inside the convex hull of each
// part. Occluders and the wall plane are authored quads written with
// writeSceneDepthPolygon. Depth comes from the production scene-depth code.
// Not a rasterizer or browser: no pixel colours, timing or compositing claims.
// Checks print PASS/FAIL and keep going, so a mutation names what it broke.
// Mutations (evaluated copies only; each anchor must match exactly once):
//   --clamp-model      the model path shifts the prop so its anchor lands on
//                      screen (the sprite's renderX clamp, reintroduced)
//   --anchor-cull      model props are culled by the sprite's anchor test
//                      (screenX outside +-40 px) instead of their bounds
//   --window-key       the variant is keyed on window-relative gridX/Y again
//   --flame-in-opaque  the flame billboard is drawn in the opaque phase
//   --no-flame-fold    the flame is one billboard at the anchor depth again
//                      (its wall-side half is clipped by its own wall)
//   --fold-at-anchor   the flame's fold plane moves out to the anchor (2.2),
//                      so things standing 0.5-2.2 out no longer hide it
//   --flame-bias       the fold is replaced by a 100-unit depth bias on the
//                      flame billboard (a real nearer occluder shows it)
//   --no-cave          getWallDecorationInCave always answers false
//   --no-fade          the model faces ignore the distance fade
//   --draw-behind      the model path no longer skips a prop whose wall plane
//                      faces away from the camera
//   --no-endless-gate  the variant key adds the window origin outside Endless
//                      too (a stale origin re-rolls fixed-level decorations)
//   --fixed-flame-cull the model cull takes the flame's half-width as 0.36 S
//                      world units again, ignoring aspect and FOV
//   --decal-first      the shield's body and the banner's cloth are drawn after
//                      their heraldry decals (which they then overpaint)
//   --heraldry-fixed   every shield and banner uses the first heraldry family
//   --sconce-torch-flame  the modelled sconce draws the torch's flame recipe
//   --cloth-at-0.4     the banner cloth at the spec's 0.4 out, inside a
//                      farther torch flame's fold plane (0.5) plus its bias
// --sections a,b runs only: spec, edge, oblique, phase, flame, work, variant,
// model, decal, lab.
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
      source = swap(source, '--decal-first', "  return {key: WALL_PROP_MODEL_KEYS.shield[family], family: 'wallProp', parts: parts};\n",
        "  parts.push(parts.shift());\n  return {key: WALL_PROP_MODEL_KEYS.shield[family], family: 'wallProp', parts: parts};\n");
      source = swap(source, '--decal-first', "  return {key: WALL_PROP_MODEL_KEYS.banner[family], family: 'wallProp', parts: parts};\n",
        "  parts = parts.filter(function(p) { return p.name.indexOf('cloth') !== 0; }).concat(parts.filter(function(p) { return p.name.indexOf('cloth') === 0; }));\n" +
        "  return {key: WALL_PROP_MODEL_KEYS.banner[family], family: 'wallProp', parts: parts};\n");
      source = swap(source, '--heraldry-fixed', "  return typeof key === 'string' ? key : key[((variant >>> 0) || 0) % key.length];\n",
        "  return typeof key === 'string' ? key : key[0];\n");
      source = swap(source, '--cloth-at-0.4', 'var rodO = 1.8, rodZ = 0.40 * S, cloth = 0.7,', 'var rodO = 1.8, rodZ = 0.40 * S, cloth = 0.4,');
      return source;
    }
    if (path !== DECOR) return source;
    source = swap(source, '--sconce-torch-flame', '    if (sconce) drawWallSconceFlame(sx, sy, s, s, variant, now, fade);\n',
      '    if (false) drawWallSconceFlame(sx, sy, s, s, variant, now, fade);\n');
    source = swap(source, '--window-key',
      "  if (Number.isFinite(dec.worldX) && Number.isFinite(dec.worldY) && typeof cell === 'number' && cell > 0) {\n", '  if (false) {\n');
    source = swap(source, '--clamp-model',
      '  var inst = wallPropInstance(entry.attachment, getWallDecorationInCave(entry.dec, entry.attachment));\n',
      '  var inst = wallPropInstance(entry.attachment, getWallDecorationInCave(entry.dec, entry.attachment));\n' +
      '  var ex = entry.attachment.x - cam.x, ey = entry.attachment.y - cam.y, ef = ex * C.cosAng + ey * C.sinAng;\n' +
      '  var esx = ((-ex * C.sinAng + ey * C.cosAng) / ef * C.invTanHalf * 0.5 + 0.5) * C.w;\n' +
      '  var eshift = (Math.max(0, Math.min(C.w - 1, esx)) - esx) / C.w / (C.invTanHalf * 0.5) * ef;\n' +
      '  inst.x += -C.sinAng * eshift; inst.y += C.cosAng * eshift;\n');
    source = swap(source, '--anchor-cull', '    if (propModel) {\n',
      '    if (propModel && fwd >= 1 && Math.abs((dx * (-sinAng) + dy * cosAng) / fwd * invTanHalf * 0.5 * w) <= w * 0.5 + 40) {\n');
    source = swap(source, '--flame-in-opaque',
      '      if (visibleDecors[mi].model && visibleDecors[mi]._dFade > 0) drawWallPropModelOpaque(visibleDecors[mi], C);\n',
      '      if (visibleDecors[mi].model && visibleDecors[mi]._dFade > 0) { drawWallPropModelOpaque(visibleDecors[mi], C); drawWallPropModelOverlay(visibleDecors[mi], C, now); }\n');
    source = swap(source, '--flame-in-opaque', '      if (visibleDecors[di]._dFade > 0) drawWallPropModelOverlay(visibleDecors[di], C, now);\n', '');
    source = swap(source, '--no-flame-fold',
      '  var fold = wallPropFlameFold(inst, entry.attachment.nx, entry.attachment.ny, C, depth, x0, x1, y0, y1);\n', '  var fold = null;\n');
    source = swap(source, '--fold-at-anchor', 'var WALL_PROP_FLAME_FOLD_OUT = 0.5;\n', 'var WALL_PROP_FLAME_FOLD_OUT = 2.2;\n');
    source = swap(source, '--flame-bias', '{depthBias: 0.15, extraPolygons: [fold]}', '{depthBias: 100}');
    source = swap(source, '--no-cave', 'function getWallDecorationInCave(dec, attachment) {\n',
      'function getWallDecorationInCave(dec, attachment) {\n  return false;\n');
    source = swap(source, '--no-fade', '  if (entry._dFade < 1) ctx.globalAlpha = alpha * entry._dFade;\n', '');
    source = swap(source, '--draw-behind',
      '      if ((cam.x - dec.worldX) * attachment.nx + (cam.y - dec.worldY) * attachment.ny <= 0) continue;\n', '');
    source = swap(source, '--no-endless-gate', "    var endless = typeof ENDLESS_MODE !== 'undefined' && ENDLESS_MODE;\n", '    var endless = true;\n');
    source = swap(source, '--fixed-flame-cull', 'wallPropCullRadius(propModel, attachment, flameK)', 'wallPropCullRadius(propModel, attachment)');
    return source;
  });
  check('real manifest loads with the wall-prop driver and no console errors',
    loaded > 40 && typeof G.wallPropModelFor === 'function' && typeof G.drawWallPropModelOpaque === 'function' && H.errors.length === 0,
    {loaded: loaded, errors: H.errors.slice(0, 3)});

  // ── Authored fixture: wall row gy = 24 (all solid), torch on its north face ──
  var W = 320, HT = 240, PS = 180, N = 48, S = 35.2, EPS = 1e-9;
  var TIP = 0.25 * S - 1.3, REF = TIP - 0.01 * S, AXIS = 2.2;
  // The F1 spec, authored here: [name, z0, z1, rHalf at z0, rHalf at z1, o range at z0, o range at z1].
  var PARTS = [
    ['backplate', REF - 0.33 * S, REF + 0.13 * S, 0.15 * S, 0.15 * S, [0, 0.4], [0, 0.4]],
    ['bracket', REF - 0.225 * S, REF - 0.185 * S, 0.05 * S, 0.05 * S, [0.3, AXIS], [0.3, AXIS]],
    ['shaft', TIP - 0.83 * S, TIP, 0.075 * S, 0.115 * S, [AXIS - 0.9, AXIS + 0.9], [AXIS - 1.4, AXIS + 1.4]],
    ['bandUpper', REF - 0.09 * S, REF - 0.02 * S, 0.14 * S, 0.14 * S, [AXIS - 1.5, AXIS + 1.5], [AXIS - 1.5, AXIS + 1.5]],
    ['bandLower', REF - 0.24 * S, REF - 0.17 * S, 0.14 * S, 0.14 * S, [AXIS - 1.5, AXIS + 1.5], [AXIS - 1.5, AXIS + 1.5]]
  ];
  var TORCH = {worldX: 24 * 12 + 6, worldY: 24 * 12, side: 'north', type: 'torch', gridX: 24, gridY: 24};
  function world(decs) {
    G.cell = 12; G.gridW = G.gridH = N; G.grid = new Uint8Array(N * N);
    for (var x = 0; x < N; x++) G.grid[24 * N + x] = 1;
    G.wallHeights = new Float32Array(N * N); G.wallHeights.fill(1);
    G.wallMaxTopZ = new Float32Array(N * N); G.wallMaxTopZ.fill(Infinity);
    G.wallFaceBase = new Float32Array(N * N * 4);
    G.floorMesh = null; G.gridCave = null; G.deepCaveRegions = []; G.deepCaveEntrances = [];
    G.windowOriginX = G.windowOriginY = 0; G.CANVAS_BASE_H = 240; G.viewDist = 1400;
    G.canvas.width = W; G.canvas.height = HT; G.projScale = PS; G.MODE3D = true; G.DEBUG_DECORATIONS = false;
    G.wallDecorations = decs || [TORCH];
    G.applyRenderPreset('recommended'); G.setRenderFeatures({wallPropModels: true});
    G.updateDayNight(0);
  }
  world();
  var AT = G.getWallDecorationAttachment(TORCH);
  var OX = TORCH.worldX, OY = TORCH.worldY, NX = 0, NY = -1, TX = 1, TY = 0;   // t along the wall (the torch is symmetric in r)
  function local(r, o, z) { return {x: OX + r * TX + o * NX, y: OY + r * TY + o * NY, z: AT.z + z}; }
  function corners(p, half) {   // half: 0 whole, -1 r <= 0, +1 r >= 0
    var pts = [];
    [[p[1], p[3], p[5]], [p[2], p[4], p[6]]].forEach(function (ring) {
      var rLo = half > 0 ? 0 : -ring[1], rHi = half < 0 ? 0 : ring[1];
      [[rLo, ring[2][0]], [rHi, ring[2][0]], [rHi, ring[2][1]], [rLo, ring[2][1]]].forEach(function (ro) { pts.push(local(ro[0], ro[1], ring[0])); });
    });
    return pts;
  }
  function pose(x, y, ang, cameraZ) {
    G.cam.x = x; G.cam.y = y; G.cam.ang = ang; G.cam.pitch = 0; G.cam.z = 60 + (cameraZ - 60) * 40 / 25;
    return G.getCam3D();
  }
  // Pinhole projection written from the camera convention (fwd = (cos, sin), right = (-sin, cos)).
  function project(p, C) {
    var dx = p.x - G.cam.x, dy = p.y - G.cam.y, d = dx * C.cosAng + dy * C.sinAng;
    return {x: ((-dx * C.sinAng + dy * C.cosAng) / d * C.invTanHalf * 0.5 + 0.5) * C.w,
      y: C.horizonY + (C.cameraZ - p.z) / d * PS, depth: d};
  }
  function hull(points) {
    var p = points.slice().sort(function (a, b) { return a.x - b.x || a.y - b.y; }), lower = [], upper = [], i;
    function cross(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
    for (i = 0; i < p.length; i++) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p[i]) <= 0) lower.pop(); lower.push(p[i]); }
    for (i = p.length - 1; i >= 0; i--) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p[i]) <= 0) upper.pop(); upper.push(p[i]); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));   // counter-clockwise in screen maths
  }
  // Signed distance of (x, y) inside a convex polygon (positive inside).
  function inside(poly, x, y) {
    var best = Infinity;
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length], ex = b.x - a.x, ey = b.y - a.y, len = Math.hypot(ex, ey);
      if (len < EPS) continue;
      best = Math.min(best, (ex * (y - a.y) - ey * (x - a.x)) / len);
    }
    return best;
  }
  function area(poly) { var s = 0; for (var i = 0; i < poly.length; i++) { var a = poly[i], b = poly[(i + 1) % poly.length]; s += a.x * b.y - b.x * a.y; } return Math.abs(s) / 2; }
  // Analytic pixel classes for a set of hulls: 1 inside by > tol, -1 outside by > tol, 0 edge band.
  function classify(hulls, tol) {
    var cls = new Int8Array(W * HT), x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    cls.fill(-1);
    hulls.forEach(function (h) { h.forEach(function (p) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }); });
    x0 = Math.max(0, Math.floor(x0 - tol - 2)); x1 = Math.min(W - 1, Math.ceil(x1 + tol + 2));
    y0 = Math.max(0, Math.floor(y0 - tol - 2)); y1 = Math.min(HT - 1, Math.ceil(y1 + tol + 2));
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var d = -Infinity;
      for (var k = 0; k < hulls.length; k++) d = Math.max(d, inside(hulls[k], x + 0.5, y + 0.5));
      cls[y * W + x] = d > tol ? 1 : d < -tol ? -1 : 0;
    }
    return cls;
  }
  function partHulls(C, half) {
    return PARTS.map(function (p) {
      var pts = corners(p, half || 0).map(function (q) { return project(q, C); });
      if (pts.some(function (q) { return !(q.depth >= 1); })) throw Error('SETUP a torch corner is within depth 1');
      return hull(pts);
    });
  }
  function depthCopy() { return Array.prototype.slice.call(G._sceneDepthInv, 0, W * HT); }
  function painted(before) {
    var after = G._sceneDepthInv, set = new Uint8Array(W * HT);
    for (var i = 0; i < W * HT; i++) set[i] = after[i] > before[i] ? 1 : 0;
    return set;
  }
  function writeQuad(points, C) { return G.writeSceneDepthPolygon(G.projectSceneWorldPolygon(points, C)); }
  function wallPlane(C) {
    return writeQuad([{x: 0, y: 288, z: 0}, {x: N * 12, y: 288, z: 0}, {x: N * 12, y: 288, z: 240}, {x: 0, y: 288, z: 240}], C);
  }
  function drawPhase(phase) { var r = H.record(true, true); G.drawWallDecorations(phase); return H.record(false); }
  function calls(rec, method) { return rec.all.filter(function (t) { return t.indexOf('.' + method + '(') > 0; }); }
  var FLAME = G.GAME_MATERIALS.wallFlame.hex;
  function flameFills(rec) {
    return rec.all.filter(function (t) { return /\.fillStyle=/.test(t) && (t.indexOf(FLAME.outer) > 0 || t.indexOf(FLAME.inner) > 0 || t.indexOf(FLAME.core) > 0); }).length;
  }
  // Pixels visited by every depth test (visible + hidden) while fn runs.
  function counting(fn, onClip) {
    var orig = G.withSceneDepthClip, tally = {tested: 0, calls: 0};
    G.withSceneDepthClip = function (points, cb, options) {
      var r = orig(points, cb, options);
      tally.calls++; tally.tested += G._sceneDepthClipCount + G._sceneDepthClipHidden;
      if (onClip) onClip(points, options, r);
      return r;
    };
    try { fn(); } finally { G.withSceneDepthClip = orig; }
    return tally;
  }
  function headOn(D) { return pose(OX, OY - D, Math.PI / 2, AT.z); }
  function oblique(deg, side, D) {
    var a = deg * Math.PI / 180, cx = OX + side * Math.sin(a) * D, cy = OY - Math.cos(a) * D;
    return pose(cx, cy, Math.atan2(OY - 0.5 - cy, OX - cx), AT.z);
  }
  // The flame body (the F1 verifier's probe region): x within 0.24 s of the
  // analytic anchor, from the flame base (0.01 s below the tip) to 0.55 s above
  // it, split at the anchor. Runs the overlay phase on the current depth and
  // returns each half's visible fraction [left, right], the half on the
  // camera's side of the wall (wall: 0 left, 1 right) and the flame fills.
  // F2: F and type select another flame-bearing prop (FLAME_PROBE below).
  function flameHalves(C, F, type) {
    var pr = FLAME_PROBE[type || 'torch'], a = pr.anchor, at = F ? F.at : AT, ox = F ? F.ox : OX;
    var fl = project(F ? localF(F, a[0], a[1], a[2]) : local(0, AXIS, TIP), C), s = at.size / fl.depth * PS, base = fl.y + pr.base * s;
    var nearWall = project(F ? localF(F, G.cam.x > ox ? 20 : -20, 0, a[2]) : local(G.cam.x > OX ? 20 : -20, 0, TIP), C), halves = null;
    H.record(true, true);
    counting(function () { G.drawWallDecorations('overlay'); }, function (points, options, r) {
      if (halves || !options || options.writeDepth) return;
      var gen = G._sceneDepthClipGeneration, vis = [0, 0], all = [0, 0];
      for (var y = Math.max(0, Math.ceil(base - pr.up * s - 0.5)); y + 0.5 < Math.min(HT, base); y++) {
        for (var x = Math.max(0, Math.ceil(fl.x - pr.halfW * s - 0.5)); x + 0.5 < Math.min(W, fl.x + pr.halfW * s); x++) {
          var k = x + 0.5 < fl.x ? 0 : 1; all[k]++;
          if (r && G._sceneDepthClipMarks[y * W + x] === gen) vis[k]++;
        }
      }
      if (all[0] < 40 || all[1] < 40) throw Error('SETUP flame region too small ' + JSON.stringify(all));
      halves = [vis[0] / all[0], vis[1] / all[1]];
    });
    var rec = H.record(false);
    return {halves: halves || [0, 0], wall: nearWall.x > fl.x ? 1 : 0, fills: flameFills(rec)};
  }

  // ── F2: the four modelled types, authored here ──
  // Every prop sits on the same north face (row 24), so a frame is the record,
  // its attachment and origin; local (r, o, z): r along +x, o out of the wall
  // (-y), z up from attachment.z. Seen from the front, +r is the viewer's
  // left, so a sprite x offset maps to r = -x (the sprite's y down to -z).
  function recAt(type, gx) { return {worldX: gx * 12 + 6, worldY: 24 * 12, side: 'north', type: type, gridX: gx, gridY: 24}; }
  function frameOf(rec) { return {rec: rec, at: G.getWallDecorationAttachment(rec), ox: rec.worldX, oy: rec.worldY}; }
  function localF(F, r, o, z) { return {x: F.ox + r, y: F.oy - o, z: F.at.z + z}; }
  // The first record on row 24 (east of gx 20) whose variant picks heraldry family f.
  function familyRec(type, f) {
    for (var gx = 20; gx < 44; gx++) { var r = recAt(type, gx); if (G.getWallDecorationVariant(r) % 3 === f) return r; }
    throw Error('SETUP no record for family ' + f);
  }
  var LIT = function (material, role) { return G.wallPropLitColor(material, role, 1); };
  var HERALDRY = ['red', 'blue', 'purple'];
  // The sprite's 2D layout for one record: every fill in order with its style,
  // alpha and path, drawn at w = h = 1000 (head-on, far: widthScale 1) and
  // read back in sprite units (w = h = 1).
  function spriteFills(type, dec) {
    H.record(true, true);
    G.drawWallAlignedDecoration(type, 0, 0, 1000, 200, 'north', 1, 1, dec, 0);
    var rec = H.record(false), fills = [], style = null, alpha = 1, path = [];
    rec.all.forEach(function (t) {
      var set = /^[^.(]*\.(\w+)=(.*)$/.exec(t);
      if (set) { if (set[1] === 'fillStyle') style = JSON.parse(set[2]); else if (set[1] === 'globalAlpha') alpha = +set[2]; return; }
      var call = /^[^.(]*\.(\w+)\((.*)\)$/.exec(t);
      if (!call) return;
      var a = call[2] ? call[2].split(',').map(Number) : [];
      if (call[1] === 'beginPath') path = [];
      else if (call[1] === 'moveTo' || call[1] === 'lineTo' || call[1] === 'quadraticCurveTo') path.push([call[1]].concat(a.map(function (v) { return v / 1000; })));
      else if (call[1] === 'arc') path.push(['arc', a[0] / 1000, a[1] / 1000, a[2] / 1000]);
      else if (call[1] === 'fill') fills.push({style: style, alpha: alpha, path: path.slice()});
      else if (call[1] === 'fillRect') fills.push({style: style, alpha: alpha, path: [['rect', a[0] / 1000, a[1] / 1000, a[2] / 1000, a[3] / 1000]]});
    });
    return fills;
  }
  // A recorded path as polygon points: quadratic curves in 4 chords at uniform
  // t, circles as 12-gons from angle 0, rects as their corners.
  function flatten(path) {
    var pts = [], last = null;
    path.forEach(function (op) {
      if (op[0] === 'moveTo' || op[0] === 'lineTo') { last = [op[1], op[2]]; pts.push(last); }
      else if (op[0] === 'quadraticCurveTo') {
        for (var k = 1; k <= 4; k++) {
          var t = k / 4, u = 1 - t;
          pts.push([u * u * last[0] + 2 * u * t * op[1] + t * t * op[3], u * u * last[1] + 2 * u * t * op[2] + t * t * op[4]]);
        }
        last = [op[3], op[4]];
      } else if (op[0] === 'arc') {
        for (var i = 0; i < 12; i++) pts.push([op[1] + Math.cos(i * Math.PI * 2 / 12) * op[3], op[2] + Math.sin(i * Math.PI * 2 / 12) * op[3]]);
      } else if (op[0] === 'rect') pts.push([op[1], op[2]], [op[1] + op[3], op[2]], [op[1] + op[3], op[2] + op[4]], [op[1], op[2] + op[4]]);
    });
    return pts;
  }
  // Clip a 2D polygon to x * side >= 0 (Sutherland-Hodgman).
  function clipX(poly, side) {
    var outP = [];
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length], ia = a[0] * side >= 0, ib = b[0] * side >= 0;
      if (ia) outP.push(a);
      if (ia !== ib && a[0] !== 0 && b[0] !== 0) { var t = a[0] / (a[0] - b[0]); outP.push([0, a[1] + (b[1] - a[1]) * t]); }
    }
    return outP;
  }
  function slab(pts2, o0, o1) {   // sprite 2D points -> local points at o0 (and o1)
    var outP = [];
    [o0, o1].forEach(function (o) { if (o === undefined) return; pts2.forEach(function (p) { outP.push([-p[0] * S, o, -p[1] * S]); }); });
    return outP;
  }
  // A prism ring about an axis: (a, b) in the plane across it.
  function ring(sides, rot, ca, cb, ra, rb, t, axis) {
    var outP = [];
    for (var i = 0; i < sides; i++) {
      var ang = rot + i * Math.PI * 2 / sides, a = ca + Math.cos(ang) * ra, b = cb + Math.sin(ang) * rb;
      outP.push(axis === 'z' ? [a, b, t] : axis === 'o' ? [a, t, b] : [t, a, b]);
    }
    return outP;
  }
  function box(r0, r1, o0, o1, z0, z1) {
    var outP = [];
    [z0, z1].forEach(function (z) { [[r0, o0], [r1, o0], [r1, o1], [r0, o1]].forEach(function (ro) { outP.push([ro[0], ro[1], z]); }); });
    return outP;
  }
  function pieces(name, polys, o) {
    return polys.map(function (poly, i) { return {name: name + (polys.length > 1 ? i : ''), pts: slab(poly, o)}; });
  }
  // A recorded charge fill as convex pieces: a rect, a circle, or a
  // non-convex path (the chevron) split at x = 0.
  function chargePieces(fills) {
    var outP = [];
    fills.forEach(function (f) {
      var pts = flatten(f.path);
      if (f.path[0][0] === 'moveTo' && pts.length > 4) { outP.push(clipX(pts, -1)); outP.push(clipX(pts, 1)); }
      else outP.push(pts);
    });
    return outP;
  }
  // Sconce, from the F2 design: the sprite's plate ellipse (0.24 S x 0.28 S)
  // as an octagon 0.4 thick, 0.16 S below the bowl rim; an arm along the
  // normal to the bowl axis 2.7 out; a six-sided bowl 0.09 S tall, 0.09 S x 1.4
  // at its base widening 1.6x to its rim at S / 6 - 1 (1 below the light).
  var SC_AXIS = 2.7, SC_TOP = S / 6 - 1.0, SC_BOTTOM = SC_TOP - 0.09 * S;
  function sconceParts() {
    var plate = [];
    for (var i = 0; i < 8; i++) { var a = (i + 0.5) * Math.PI / 4; plate.push([Math.cos(a) * 0.24 * S, SC_TOP - 0.16 * S + Math.sin(a) * 0.28 * S]); }
    var platePts = [];
    [0, 0.4].forEach(function (o) { plate.forEach(function (p) { platePts.push([p[0], o, p[1]]); }); });
    return [{name: 'backplate', pts: platePts},
      {name: 'arm', pts: box(-0.03 * S, 0.03 * S, 0.3, SC_AXIS, SC_BOTTOM - 1.2, SC_BOTTOM)},
      {name: 'bowl', pts: ring(6, 0, 0, SC_AXIS, 0.09 * S, 1.4, SC_BOTTOM, 'z').concat(ring(6, 0, 0, SC_AXIS, 0.09 * S * 1.6, 1.4 * 1.6, SC_TOP, 'z'))}];
  }
  function torchParts() {
    return PARTS.map(function (p) {
      var pts = [];
      [[p[1], p[3], p[5]], [p[2], p[4], p[6]]].forEach(function (rg) {
        [[-rg[1], rg[2][0]], [rg[1], rg[2][0]], [rg[1], rg[2][1]], [-rg[1], rg[2][1]]].forEach(function (ro) { pts.push([ro[0], ro[1], rg[0]]); });
      });
      return {name: p[0], pts: pts};
    });
  }
  // Shield and banner parts from the sprite's recorded layout for `rec`
  // (its heraldry family), at the F2 depths. Also returns the field role the
  // sprite painted, the model key it implies and the unmodelled fills.
  function heraldicParts(type, rec) {
    var fills = spriteFills(type, rec), role = null, parts = [], skipped = [];
    function take(style, alpha) { return fills.filter(function (f) { return f.style === style && (alpha === undefined || f.alpha === alpha); }); }
    HERALDRY.forEach(function (r) { if (take(LIT('wallHeraldry', r)).length) role = r; });
    if (type === 'shield') {
      var body = take(LIT('wallPropIron', 'lit'))[0], field = take(LIT('wallHeraldry', role))[0], boss = take(LIT('wallPropIron', 'edge'))[0].path[0];
      parts.push({name: 'body', pts: slab(flatten(body.path), 0, 1.2)}, {name: 'field', pts: slab(flatten(field.path), 1.3)});
      parts = parts.concat(pieces('charge', chargePieces(take(LIT('wallHeraldry', 'gold'))), 1.3));
      parts.push({name: 'boss', pts: ring(8, Math.PI / 8, -boss[1] * S, -boss[2] * S, boss[3] * S, boss[3] * S, 1.2, 'o')
        .concat(ring(8, Math.PI / 8, -boss[1] * S, -boss[2] * S, boss[3] * S * 0.55, boss[3] * S * 0.55, 2.6, 'o'))});
      skipped = fills.filter(function (f) { return f.alpha < 1; }).length;   // the drop shadow
    } else {
      var wood = take(LIT('wallPropWood', 'shadow')), rod = wood[0].path[0], hanger = wood[1].path[0];
      var zc = -(rod[2] + rod[4] / 2) * S, rr = rod[4] / 2 * S;
      parts.push({name: 'rod', pts: ring(6, Math.PI / 6, 1.8, zc, rr, rr, -(rod[1] + rod[3]) * S, 'r').concat(ring(6, Math.PI / 6, 1.8, zc, rr, rr, -rod[1] * S, 'r'))});
      parts.push({name: 'hanger', pts: box(-(hanger[1] + hanger[3]) * S, -hanger[1] * S, 0, 1.8, -(hanger[2] + hanger[4]) * S, -hanger[2] * S)});
      // Finials: the sprite's discs; each reaches the disc's outer edge from
      // 0.03 S inside the rod's end, 1.6 x its radius across (halved outwards).
      take(LIT('wallPropIron', 'lit')).forEach(function (f) {
        var d = f.path[0], rIn = -Math.sign(d[1]) * (Math.abs(d[1]) - 0.03) * S, rOut = -Math.sign(d[1]) * (Math.abs(d[1]) + d[3]) * S, z = -d[2] * S;
        parts.push({name: rOut < 0 ? 'finialRight' : 'finialLeft', pts: ring(6, Math.PI / 6, 1.8, z, 1.6, d[3] * S, rIn, 'r').concat(ring(6, Math.PI / 6, 1.8, z, 0.8, d[3] * S / 2, rOut, 'r'))});
      });
      var cloth = flatten(take(LIT('wallHeraldry', role), 1)[0].path);
      parts.push({name: 'clothLeft', pts: slab(clipX(cloth, -1), 0.7)}, {name: 'clothRight', pts: slab(clipX(cloth, 1), 0.7)});
      parts = parts.concat(pieces('charge', chargePieces(take(LIT('wallHeraldry', 'goldLit'))), 0.8));
      var linen = take(LIT('wallHeraldry', 'linen'));
      if (linen.length) parts = parts.concat(pieces('roundelCentre', chargePieces(linen), 0.8));
      skipped = fills.filter(function (f) { return f.alpha < 1; }).length;   // drop shadow and the painted fold stripe
    }
    return {parts: parts, role: role, key: 'wall' + type.charAt(0).toUpperCase() + type.slice(1) + role.charAt(0).toUpperCase() + role.slice(1), skipped: skipped};
  }
  function authoredParts(rec) {
    var type = rec.type;
    return type === 'torch' ? torchParts() : type === 'sconce' ? sconceParts() : heraldicParts(type, rec).parts;
  }
  // Points of a convex part on one side of r = 0 (half -1: r <= 0, +1: r >= 0):
  // the part's own points there plus every pair's crossing of the plane.
  function clipHalf(pts, half) {
    var outP = pts.filter(function (p) { return half * p[0] >= 0; });
    for (var i = 0; i < pts.length; i++) for (var j = i + 1; j < pts.length; j++) {
      var a = pts[i], b = pts[j];
      if (a[0] * b[0] < 0) { var t = a[0] / (a[0] - b[0]); outP.push([0, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
    }
    return outP;
  }
  function hullsFor(F, parts, C, half) {
    var hs = [];
    parts.forEach(function (p) {
      var pts = half ? clipHalf(p.pts, half) : p.pts;
      if (pts.length < 3) return;
      var proj = pts.map(function (q) { return project(localF(F, q[0], q[1], q[2]), C); });
      if (proj.some(function (q) { return !(q.depth >= 1); })) throw Error('SETUP a ' + F.rec.type + ' corner is within depth 1');
      var h = hull(proj);
      if (h.length >= 3) hs.push(h);
    });
    return hs;
  }
  var TYPES = ['torch', 'sconce', 'shield', 'banner'];
  // One record per type at gx 24 (shield and banner: the variant there picks their family).
  function typeRec(type) { return recAt(type, 24); }
  // Flame anchors (local) and probe regions per flame-bearing type: the probe
  // is the flame body above the recipe's base, split at the anchor.
  var FLAME_PROBE = {torch: {anchor: [0, AXIS, TIP], base: 0.01, halfW: 0.24, up: 0.55},
    sconce: {anchor: [0, SC_AXIS, SC_TOP], base: -0.02, halfW: 0.14, up: 0.40}};

  // ── spec: the production model is the authored torch ──
  if (section('spec')) {
    var model = G.wallPropModelFor('torch'), inst = G.wallPropInstance(AT, false, {});
    var buf = G.createModelFaceBuffer(); G.buildModelFaces(model, inst, buf);
    function key(p) { return [p.x, p.y, p.z].map(function (v) { return Math.round(v * 1e6); }).join(','); }
    var problems = [];
    PARTS.forEach(function (p, pi) {
      var want = {}, have = {};
      corners(p, 0).forEach(function (q) { want[key(q)] = true; });
      buf.faces.slice(0, buf.count).filter(function (f) { return f.partName === p[0]; }).forEach(function (f) {
        f.vertices.forEach(function (v) { have[key(v)] = true; });
      });
      if (Object.keys(want).sort().join('|') !== Object.keys(have).sort().join('|')) problems.push({part: p[0], want: Object.keys(want).length, have: Object.keys(have).length});
    });
    check('spec: every torch part has exactly the authored corners (backplate 0.3 S x 0.46 S, bracket to 2.2 out, shaft 0.23 S -> 0.15 S x 0.83 S, bands 0.28 S x 0.07 S) at the attachment frame',
      model && model.key === 'wallTorch' && model.family === 'wallProp' && buf.count === 30 && problems.length === 0 &&
      Math.abs(AT.size - S) < EPS && inst.scale === 1, {problems: problems, faces: buf.count, size: AT.size});
    var flame = G.modelAnchorWorld(model, inst, 'flame', {}), expect = local(0, AXIS, TIP);
    check('spec: the flame anchor is the shaft tip on its axis, 2.2 out of the wall face',
      Math.abs(flame.x - expect.x) < 1e-9 && Math.abs(flame.y - expect.y) < 1e-9 && Math.abs(flame.z - expect.z) < 1e-9, {flame: flame, expect: expect});
    // Restated in stage F2 (was: "registered default OFF (stage F1) and OFF in
    // Legacy; only torches have a model yet"): F2 models the other three types
    // and flips the default ON. Legacy stays OFF, and the sprite path it draws
    // keeps its own coverage (render_parity pins; the sconce check below).
    var rec0 = G.renderFeaturePreset('recommended').wallPropModels, leg = G.renderFeaturePreset('legacy').wallPropModels;
    var keys = {};
    TYPES.forEach(function (t) { keys[t] = [0, 1, 2].map(function (v) { var m = G.wallPropModelFor(t, v); return m ? m.key : null; }); });
    check('spec: wallPropModels is default ON (stage F2) and OFF in Legacy; torch, sconce, shield and banner have models (shields and banners one per heraldry family, variant % 3); other types keep the sprite',
      rec0 === true && leg === false && keys.torch.join() === 'wallTorch,wallTorch,wallTorch' && keys.sconce.join() === 'wallSconce,wallSconce,wallSconce' &&
      keys.shield.join() === 'wallShieldRed,wallShieldBlue,wallShieldPurple' && keys.banner.join() === 'wallBannerRed,wallBannerBlue,wallBannerPurple' &&
      ['fungi', 'wall_crack', 'crack', 'carved_rune', 'icicle'].every(function (t) { return G.wallPropModelFor(t, 0) === null; }), {recommended: rec0, legacy: leg, keys: keys});

    // Every type: production faces have exactly the authored corners, part by part.
    function sameCorners(model, F, parts) {
      var inst = G.wallPropInstance(F.at, false, {}), b = G.createModelFaceBuffer(), n = G.buildModelFaces(model, inst, b), problems = [];
      var names = {};
      b.faces.slice(0, n).forEach(function (f) { names[f.partName] = true; });
      parts.forEach(function (p) {
        var want = {}, have = {};
        p.pts.forEach(function (q) { want[key(localF(F, q[0], q[1], q[2]))] = true; });
        b.faces.slice(0, n).filter(function (f) { return f.partName === p.name; }).forEach(function (f) { f.vertices.forEach(function (v) { have[key(v)] = true; }); });
        if (Object.keys(want).sort().join('|') !== Object.keys(have).sort().join('|')) problems.push({part: p.name, want: Object.keys(want).length, have: Object.keys(have).length});
        delete names[p.name];
      });
      if (Object.keys(names).length) problems.push({unauthored: Object.keys(names)});
      return {faces: n, problems: problems, scale: inst.scale};
    }
    var SF = frameOf(typeRec('sconce')), sconceModel = G.wallPropModelFor('sconce', 0), sc = sameCorners(sconceModel, SF, sconceParts());
    var scFlame = G.modelAnchorWorld(sconceModel, G.wallPropInstance(SF.at, false, {}), 'flame', {}), scWant = localF(SF, 0, SC_AXIS, SC_TOP);
    check('spec: the sconce is the authored plate (the sprite plate ellipse as an octagon, 0.4 thick), an arm along the normal to 2.7 out and a six-sided bowl; its flame anchor is the bowl rim centre',
      sc.problems.length === 0 && sc.faces === 24 && sc.scale === 1 && Math.abs(scFlame.x - scWant.x) < 1e-9 && Math.abs(scFlame.y - scWant.y) < 1e-9 &&
      Math.abs(scFlame.z - scWant.z) < 1e-9, {corners: sc, flame: scFlame, want: scWant});
    var heraldic = [], hProblems = [];
    ['shield', 'banner'].forEach(function (type) {
      [0, 1, 2].forEach(function (f) {
        var rec = familyRec(type, f), F = frameOf(rec), hp = heraldicParts(type, rec), variant = G.getWallDecorationVariant(rec);
        var model = G.wallPropModelFor(type, variant), c = sameCorners(model, F, hp.parts);
        var fieldRole = model.parts.filter(function (p) { return p.name === 'field' || p.name.indexOf('cloth') === 0; }).map(function (p) { return p.role; });
        heraldic.push({type: type, family: f, key: model.key, faces: c.faces, spriteRole: hp.role, skippedFills: hp.skipped});
        if (c.problems.length || model.key !== hp.key || hp.role !== HERALDRY[f] || !fieldRole.length ||
            fieldRole.some(function (r) { return r !== hp.role; })) hProblems.push({type: type, family: f, key: model.key, want: hp.key, problems: c.problems, fieldRole: fieldRole});
      });
    });
    out('NOTE spec heraldic ' + JSON.stringify(heraldic));
    check('spec: shields and banners are the sprite\'s own recorded layout at the F2 depths (shield outline extruded 1.2, field and charge 0.1 proud, boss frustum to 2.6; banner rod along the tangent, hanger, finials, cloth 0.7 out, charge 0.1 proud of it), and the heraldry family (model key and field colour) is the one the sprite paints for that record',
      hProblems.length === 0 && heraldic.length === 6, hProblems);
    // The outlines the models use are the sprite functions' own paths.
    function tracePath(fn) {
      H.record(true, true); G[fn](0, 0, 1000, 1000); var r = H.record(false), ops = [];
      r.all.forEach(function (t) { var m = /\.(moveTo|lineTo|quadraticCurveTo)\((.*)\)$/.exec(t); if (m) ops.push([m[1]].concat(m[2].split(',').map(function (v) { return +v / 1000; }))); });
      return ops;
    }
    var shieldOps = tracePath('traceWallShieldPath'), clothOps = tracePath('traceWallBannerCloth');
    var shieldData = G.WALL_SHIELD_OUTLINE.map(function (p, i) { return [i === 0 ? 'moveTo' : p.length === 2 ? 'lineTo' : 'quadraticCurveTo'].concat(p); });
    var clothData = G.WALL_BANNER_CLOTH.map(function (p, i) { return [i === 0 ? 'moveTo' : 'lineTo'].concat(p); });
    check('spec: the model outlines are traceWallShieldPath and traceWallBannerCloth (recorded paths equal WALL_SHIELD_OUTLINE / WALL_BANNER_CLOTH; curves flattened in 4 chords)',
      JSON.stringify(shieldOps) === JSON.stringify(shieldData) && JSON.stringify(clothOps) === JSON.stringify(clothData) && G.WALL_PROP_CURVE_SEGMENTS === 4,
      {shield: shieldOps, shieldData: shieldData, cloth: clothOps});
    // The sconce sprite's flame moved into drawWallSconceFlame (F2); its
    // commands must equal the pre-F2 inline recipe, kept here verbatim.
    function preF2Sconce(x, y, size, dist, viewAngle, fade, dec, now) {
      var ctx = G.ctx; ctx.save();
      var brightness = Math.max(0.4, viewAngle), baseAlpha = Math.max(0.6, brightness) * (fade !== undefined ? fade : 1);
      ctx.globalAlpha = baseAlpha;
      var widthScale = 1.0, heightScale = 1.0, distanceFactor = Math.max(0.0, Math.min(1.0, (120 - dist) / 80)), angleEffect = distanceFactor * (1.0 - viewAngle);
      widthScale = 1.0 - angleEffect * 0.6;
      var w = Math.max(1, size * widthScale), h = Math.max(1, size * heightScale), variant = G.getWallDecorationVariant(dec), wallPropLitColor = G.wallPropLitColor;
      ctx.fillStyle = wallPropLitColor('wallPropIron', 'shadow', brightness);
      ctx.beginPath(); ctx.ellipse(x, y + h * 0.10, w * 0.24, h * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = wallPropLitColor('wallPropIron', 'base', brightness);
      ctx.beginPath(); ctx.arc(x, y + h * 0.07, w * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - w * 0.07, y + h * 0.04); ctx.lineTo(x + w * 0.26, y - h * 0.03);
      ctx.lineTo(x + w * 0.30, y + h * 0.08); ctx.lineTo(x, y + h * 0.18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = wallPropLitColor('wallPropIron', 'deep', brightness);
      ctx.beginPath(); ctx.ellipse(x + w * 0.25, y - h * 0.02, w * 0.25, h * 0.10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = wallPropLitColor('wallPropIron', 'lit', brightness);
      ctx.beginPath(); ctx.ellipse(x + w * 0.25, y - h * 0.06, w * 0.19, h * 0.07, 0, 0, Math.PI * 2); ctx.fill();
      var sconceWave = Math.sin(now * 0.010 + (variant & 255) * 0.13);
      var sconceX = x + w * 0.25 + sconceWave * w * 0.025;
      ctx.globalAlpha = baseAlpha * 0.9;
      ctx.fillStyle = G.GAME_MATERIALS.wallFlame.hex.outer;
      ctx.beginPath(); ctx.ellipse(sconceX, y - h * 0.25, w * 0.18, h * 0.29, sconceWave * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = G.GAME_MATERIALS.wallFlame.hex.inner;
      ctx.beginPath(); ctx.ellipse(sconceX, y - h * 0.19, w * 0.10, h * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = G.GAME_MATERIALS.wallFlame.hex.core;
      ctx.beginPath(); ctx.ellipse(sconceX, y - h * 0.13, w * 0.045, h * 0.09, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    var sconceDiff = [];
    [[100, 80, 30, 50, 0.3, 0.8], [5.5, 7.25, 3.3, 200, 1, 1], [0, 0, 1000, 130, 0.62, 0.4], [-20, 300, 71.3, 10, 0.05, 1]].forEach(function (a, i) {
      var dec = recAt('sconce', 20 + i * 3);
      H.record(true, true); G.drawWallAlignedDecoration('sconce', a[0], a[1], a[2], a[3], 'north', a[4], a[5], dec, 1234.5 + i * 777); var got = H.record(false).all.join('\n');
      H.record(true, true); preF2Sconce(a[0], a[1], a[2], a[3], a[4], a[5], dec, 1234.5 + i * 777); var want = H.record(false).all.join('\n');
      if (got !== want || got.split('\n').length < 30) sconceDiff.push({args: a, got: got.length, want: want.length});
    });
    check('spec: the sconce sprite records exactly the pre-F2 inline recipe (flame moved into drawWallSconceFlame; Legacy parity scenes have no sconce)',
      sconceDiff.length === 0, sconceDiff);
  }

  // ── edge: no renderX clamp; painted pixels are the analytic projection ──
  // F2: F selects another prop's frame (the torch fixture when omitted).
  function edgePose(targetX, D, F) {
    // Facing south (+y): screen x = (-dx / D * invTanHalf * 0.5 + 0.5) * W for the attachment point.
    var at = F ? F.at : AT, oy = F ? F.oy : OY;
    var C0 = F ? pose(F.ox, oy - D, Math.PI / 2, at.z) : headOn(D), dist = D - 0.5, dx = -((targetX / W - 0.5) / (C0.invTanHalf * 0.5)) * dist;
    return pose(at.x - dx, oy - D, Math.PI / 2, at.z);
  }
  function edgeCase(label, targetX, D, rec) {
    rec = rec || TORCH;
    world([rec]); var F = frameOf(rec), C = edgePose(targetX, D, F), anchorX = project({x: F.at.x, y: F.at.y, z: F.at.z}, C).x;
    G.beginSceneDepthFrame(W, HT); var before = depthCopy();
    var rcd = drawPhase(undefined), set = painted(before);
    var hulls = hullsFor(F, authoredParts(rec), C, 0), cls = classify(hulls, 0.5), leaks = 0, missing = 0, count = 0, onScreen = 0, total = 0;
    for (var i = 0; i < W * HT; i++) { if (set[i]) count++; if (set[i] && cls[i] < 0) leaks++; if (!set[i] && cls[i] > 0) missing++; if (cls[i] > 0) onScreen++; }
    hulls.forEach(function (h) { total += area(h); });
    var row = {type: rec.type, anchorX: anchorX, painted: count, onScreen: onScreen, leaks: leaks, missing: missing, total: total};
    var pr = FLAME_PROBE[rec.type];
    if (pr) {
      // The recipe's last ellipse is its core, centred on the anchor plus the sway (torch 0.035 s, sconce 0.025 s).
      var fl = project(localF(F, pr.anchor[0], pr.anchor[1], pr.anchor[2]), C), s = F.at.size / fl.depth * PS, cores = calls(rcd, 'ellipse');
      row.flameX = cores.length ? parseFloat(cores[cores.length - 1].split('(')[1]) : NaN;
      row.flameWant = fl.x; row.flameTol = (rec.type === 'torch' ? 0.04 : 0.03) * s + 0.01;
    }
    out('NOTE edge ' + label + (rec.type === 'torch' ? '' : ' ' + rec.type) + ' anchor x ' + anchorX.toFixed(1) + ' painted ' + count +
      ' analytic on-screen ' + onScreen + ' leaks ' + leaks + ' missing ' + missing);
    return row;
  }
  if (section('edge')) {
    // F2: every modelled type (was the torch only).
    var e20s = TYPES.map(function (t) { return edgeCase('-20', -20, 30, typeRec(t)); });
    check('edge: anchor near x = -20: painted pixels are exactly the analytic projection of the authored parts (0 outside, 0 missing), the silhouette is partly off screen (torch, sconce, shield, banner)',
      e20s.every(function (e) { return Math.abs(e.anchorX + 20) < 1 && e.painted > 300 && e.leaks === 0 && e.missing === 0 && e.onScreen < e.total * 0.8; }), e20s);
    var flameEdges = e20s.filter(function (e) { return e.flameTol; });
    check('edge: the flame billboard is drawn at the analytic anchor projection, not clamped onto the screen (torch and sconce)',
      flameEdges.length === 2 && flameEdges.every(function (e) { return Math.abs(e.flameX - e.flameWant) <= e.flameTol && e.flameWant < 0; }), flameEdges);
    var e45s = TYPES.map(function (t) { return edgeCase('-45', -45, 15, typeRec(t)); });
    check('edge: anchor at x = -45 (beyond the sprite cull margin) with parts on screen: the model still paints them exactly (torch, sconce, shield, banner)',
      e45s.every(function (e) { return Math.abs(e.anchorX + 45) < 1 && e.painted > 100 && e.leaks === 0 && e.missing === 0; }), e45s);
    // The cull must keep every on-screen part of the flame billboard: 0.36 s
    // px either side of the analytic anchor, s = size / depth * projScale, so
    // its world width follows the canvas aspect and FOV. The torch is swept
    // across the right screen edge (camera 60 out); a pose counts as culled
    // when drawWorldModel is not called for it.
    var sweeps = [], fov0 = G.cam.fov, baseFov = G.GAME_CONFIG.player.baseFov;
    [[320, 240, 0, '4:3'], [240, 240, 0, '1:1'], [240, 400, 0, 'portrait 240x400'], [320, 240, 0.35, '4:3 dash fov +0.35']].forEach(function (cfg) {
      world(); G.canvas.width = cfg[0]; G.canvas.height = cfg[1]; G.projScale = cfg[1] * 0.75; G.cam.fov = baseFov + cfg[2];
      var fl = local(0, AXIS, TIP), row = {config: cfg[3], worst: 0, culled: 0, drawn: 0, gap: Infinity}, orig = G.drawWorldModel;
      for (var off = 20; off < 170; off += 0.25) {
        var C = pose(AT.x + off, AT.y - 60, Math.PI / 2, AT.z), p = project(fl, C), sc = AT.size / p.depth * G.projScale;
        var x0 = p.x - 0.36 * sc, x1 = p.x + 0.36 * sc, overlap = Math.min(x1, C.w) - Math.max(0, x0), models = 0;
        G.drawWorldModel = function () { models++; return orig.apply(this, arguments); };
        try { G.beginSceneDepthFrame(C.w, C.h); G.drawWallDecorations(); } finally { G.drawWorldModel = orig; }
        if (models) row.drawn++;
        else { row.culled++; row.gap = Math.min(row.gap, x0 - C.w); if (overlap > 0) row.worst = Math.max(row.worst, overlap); }
      }
      sweeps.push(row);
    });
    G.cam.fov = fov0;
    out('NOTE edge cull ' + JSON.stringify(sweeps));
    check('edge: the model cull keeps every on-screen part of the flame billboard at 4:3, 1:1, portrait 240x400 and 4:3 dash FOV (torch swept across the right screen edge)',
      sweeps.every(function (r) { return r.worst === 0 && r.culled > 20 && r.drawn > 20; }), sweeps);
  }

  // ── oblique: an authored wall plane in depth; both halves stay visible ──
  // F2: F selects another prop's frame (the torch fixture when omitted).
  function obliqueF(F, deg, side, D) {
    var a = deg * Math.PI / 180, cx = F.ox + side * Math.sin(a) * D, cy = F.oy - Math.cos(a) * D;
    return pose(cx, cy, Math.atan2(F.oy - 0.5 - cy, F.ox - cx), F.at.z);
  }
  if (section('oblique')) {
    var rows = [], legacyRows = [], bad = [], flameRows = [], typeRows = {};
    // F2: every modelled type (was the torch only); the flame rows add the sconce.
    TYPES.forEach(function (type) {
      var rec = typeRec(type), F = frameOf(rec), parts = authoredParts(rec);
      typeRows[type] = [];
    [56, 62, 68, 74, 80].forEach(function (deg) {
      [-1, 1].forEach(function (side) {
        world([rec]); var C = obliqueF(F, deg, side, 90);
        G.beginSceneDepthFrame(W, HT); wallPlane(C); var before = depthCopy();
        G.drawWallDecorations('opaque');
        var set = painted(before), frac = [];
        [-1, 1].forEach(function (half) {
          var cls = classify(hullsFor(F, parts, C, half), 0.75), n = 0, hit = 0;
          for (var i = 0; i < W * HT; i++) if (cls[i] > 0) { n++; if (set[i]) hit++; }
          frac.push(n ? hit / n : 0); if (n < 40) bad.push({type: type, deg: deg, side: side, half: half, n: n});
        });
        typeRows[type].push({deg: deg * side, left: +frac[0].toFixed(3), right: +frac[1].toFixed(3)});
        if (FLAME_PROBE[type]) {
          var fh = flameHalves(C, F, type);
          flameRows.push({type: type, deg: deg * side, wall: +fh.halves[fh.wall].toFixed(3), far: +fh.halves[1 - fh.wall].toFixed(3), fills: fh.fills});
        }
        if (type !== 'torch') return;
        // Control: the sprite's flat quad at the same pose, one depth, bias 1.5.
        G.setRenderFeatures({wallPropModels: false});
        G.beginSceneDepthFrame(W, HT); wallPlane(C);
        var halves = null;
        counting(function () { G.drawWallDecorations(); }, function (points, options) {
          if (!options || options.depthBias !== 1.5) return;
          var cx = (points[0].x + points[1].x) / 2, size = (points[1].x - points[0].x) / 4, y0 = points[0].y + size * 2.3, y1 = points[0].y + size * 3.85;
          var gen = G._sceneDepthClipGeneration, vis = [0, 0], all = [0, 0];
          for (var y = Math.max(0, Math.ceil(y0)); y < Math.min(HT, y1); y++) for (var x = Math.max(0, Math.ceil(cx - 0.3 * size)); x < Math.min(W, cx + 0.3 * size); x++) {
            var k = x < cx ? 0 : 1; all[k]++; if (G._sceneDepthClipMarks[y * W + x] === gen) vis[k]++;
          }
          halves = [all[0] ? vis[0] / all[0] : 1, all[1] ? vis[1] / all[1] : 1];
        });
        legacyRows.push({deg: deg * side, worst: halves ? +Math.min(halves[0], halves[1]).toFixed(3) : null});
      });
    });
    });
    out('NOTE oblique model halves ' + JSON.stringify(typeRows));
    out('NOTE oblique sprite quad worst half ' + JSON.stringify(legacyRows));
    check('oblique: against an authored wall plane, both halves of each modelled prop (torch, sconce, shield, banner) stay >= 99% visible from 56 to 80 degrees off the normal (both sides)',
      bad.length === 0 && TYPES.every(function (t) { return typeRows[t].length === 10 && typeRows[t].every(function (r) { return r.left >= 0.99 && r.right >= 0.99; }); }),
      {rows: typeRows, bad: bad});
    check('oblique: control, the sprite path at the same poses loses more than half of one side of its torch footprint (the defect the model removes)',
      legacyRows.every(function (r) { return r.worst !== null && r.worst < 0.5; }), legacyRows);
    out('NOTE oblique flame halves ' + JSON.stringify(flameRows));
    check('oblique: the flame keeps both halves of its body >= 95% visible from 56 to 80 degrees against its own wall (the wall-side half folds onto the plane 0.5 out; the shaft top hides ~2% at the base, as head-on; torch and sconce)',
      flameRows.length === 20 && flameRows.every(function (r) { return r.wall >= 0.95 && r.far >= 0.95 && r.fills === 3; }), flameRows);
    // Negative controls for the fold at grazing poses. A panel standing 1.0
    // out of the wall on the camera's side (further out than the 0.5 fold
    // plane) hides the folded wall-side half; the same panel 0.3 out (flush,
    // like a decal) does not; the far half is untouched either way. A
    // camera-facing occluder a third of the way from the camera hides all of it.
    var panelRows = [], nearRows = [];
    [56, 68, 80].forEach(function (deg) {
      [-1, 1].forEach(function (side) {
        [1.0, 0.3].forEach(function (po) {
          world(); var C = oblique(deg, side, 90);
          G.beginSceneDepthFrame(W, HT); wallPlane(C); G.drawWallDecorations('opaque');
          writeQuad([local(0, po, TIP - 30), local(side * 150, po, TIP - 30), local(side * 150, po, TIP + 40), local(0, po, TIP + 40)], C);
          var m = flameHalves(C);
          panelRows.push({deg: deg * side, out: po, wall: +m.halves[m.wall].toFixed(3), far: +m.halves[1 - m.wall].toFixed(3)});
        });
        world(); var Co = oblique(deg, side, 90), fl = local(0, AXIS, TIP);
        G.beginSceneDepthFrame(W, HT); wallPlane(Co); G.drawWallDecorations('opaque');
        var px = G.cam.x + (fl.x - G.cam.x) / 3, py = G.cam.y + (fl.y - G.cam.y) / 3, rx = -Co.sinAng * 8, ry = Co.cosAng * 8;
        writeQuad([{x: px - rx, y: py - ry, z: fl.z - 10}, {x: px + rx, y: py + ry, z: fl.z - 10}, {x: px + rx, y: py + ry, z: fl.z + 20}, {x: px - rx, y: py - ry, z: fl.z + 20}], Co);
        var n = flameHalves(Co);
        nearRows.push({deg: deg * side, left: n.halves[0], right: n.halves[1], fills: n.fills});
      });
    });
    out('NOTE oblique flame panel ' + JSON.stringify(panelRows));
    check('oblique: negative control, a panel standing 1.0 out on the camera side hides the folded wall-side half of the flame (<= 35% left) while one 0.3 out does not; the far half stays >= 95%',
      panelRows.length === 12 && panelRows.every(function (r) { return r.far >= 0.95 && (r.out > 0.5 ? r.wall <= 0.35 : r.wall >= 0.95); }), panelRows);
    check('oblique: negative control, a camera-facing occluder a third of the way from the camera hides the whole flame, folded half included, at 56/68/80 degrees',
      nearRows.length === 6 && nearRows.every(function (r) { return r.left === 0 && r.right === 0 && r.fills === 0; }), nearRows);
    // F2: a nearer banner's cloth hides a farther torch's folded flame. The
    // fold plane is 0.5 out and the flame's depth test passes up to 0.15
    // behind a surface, so the cloth stands 0.7 out (the spec's 0.4 would
    // let the folded flame paint over it). Banner at gx 24, torch two cells
    // east; the camera looks along the wall from the west.
    var foldRows = [];
    var BR = recAt('banner', 24), TR = recAt('torch', 26), BF = frameOf(BR), TF2 = frameOf(TR);
    var clothParts = authoredParts(BR).filter(function (p) { return p.name.indexOf('cloth') === 0; });
    [60, 66, 72, 78].forEach(function (deg) {
      [40, 60].forEach(function (D) {
        world([BR, TR]); var Cf = obliqueF(BF, deg, -1, D);
        G.beginSceneDepthFrame(W, HT); wallPlane(Cf); G.drawWallDecorations('opaque');
        var cls = classify(hullsFor(BF, clothParts, Cf, 0), 0.75), fl = project(localF(TF2, 0, AXIS, TIP), Cf), s = TF2.at.size / fl.depth * PS;
        var x0 = fl.x - 0.36 * s, x1 = fl.x + 0.36 * s, y0 = fl.y + 0.01 * s - 0.72 * s, y1 = y0 + 0.84 * s, region = 0, shown = 0, clips = 0;
        counting(function () { G.drawWallDecorations('overlay'); }, function (points, options, r) {
          if (!options || options.writeDepth) return;
          clips++;
          var gen = G._sceneDepthClipGeneration;
          for (var i = 0; i < W * HT; i++) {
            if (cls[i] <= 0) continue;
            var x = i % W + 0.5, y = Math.floor(i / W) + 0.5;
            if (x > x0 && x < x1 && y > y0 && y < y1) region++;
            if (r && G._sceneDepthClipMarks[i] === gen) shown++;
          }
        });
        foldRows.push({deg: deg, D: D, clothUnderFlame: region, flameOverCloth: shown, clips: clips});
      });
    });
    out('NOTE oblique banner fold ' + JSON.stringify(foldRows));
    check('oblique: a nearer banner\'s cloth (0.7 out) hides a farther torch\'s folded flame wherever the flame billboard overlaps it (camera along the wall, 60-78 degrees)',
      foldRows.filter(function (r) { return r.clothUnderFlame > 200; }).length >= 3 && foldRows.every(function (r) { return r.clips === 1 && r.flameOverCloth === 0; }), foldRows);
    // Negative control: a nearer authored occluder hides the prop and its flame
    // (F2: every modelled type; shields and banners have no flame).
    var occRows = TYPES.map(function (type) {
      var rec = typeRec(type), F = frameOf(rec);
      world([rec]); var Cn = pose(F.ox, F.oy - 60, Math.PI / 2, F.at.z);
      G.beginSceneDepthFrame(W, HT); wallPlane(Cn);
      writeQuad([{x: F.ox - 30, y: F.oy - 20, z: F.at.z - 40}, {x: F.ox + 30, y: F.oy - 20, z: F.at.z - 40}, {x: F.ox + 30, y: F.oy - 20, z: F.at.z + 50}, {x: F.ox - 30, y: F.oy - 20, z: F.at.z + 50}], Cn);
      var beforeN = depthCopy(), recN = drawPhase(undefined), paintedN = 0, setN = painted(beforeN);
      for (var pn = 0; pn < W * HT; pn++) paintedN += setN[pn];
      G.beginSceneDepthFrame(W, HT); wallPlane(Cn); var beforeP = depthCopy(), recP = drawPhase(undefined), paintedP = 0, setP = painted(beforeP);
      for (var pp = 0; pp < W * HT; pp++) paintedP += setP[pp];
      return {type: type, occluded: paintedN, flameOccluded: flameFills(recN), open: paintedP, flameOpen: flameFills(recP)};
    });
    check('oblique: negative control, an authored occluder 20 units in front hides every prop pixel and the flame; without it both draw (torch, sconce, shield, banner)',
      occRows.every(function (r) { return r.occluded === 0 && r.flameOccluded === 0 && r.open > 1000 && r.flameOpen === (FLAME_PROBE[r.type] ? 3 : 0); }), occRows);
  }

  // ── phase: opaque writes depth and draws no flame; overlay draws the flame only ──
  if (section('phase')) {
    // F2: one wall carrying all four types (was the torch alone): every
    // prop's parts are written in the opaque phase, and only the torch's and
    // the sconce's flames (three layers each) are drawn, in the overlay phase.
    var four = [recAt('torch', 20), recAt('sconce', 23), recAt('shield', 26), recAt('banner', 29)];
    world(four); var Cq = pose(300, OY - 130, Math.PI / 2, AT.z), modelsDrawn = [], origModel = G.drawWorldModel;
    G.beginSceneDepthFrame(W, HT); wallPlane(Cq);
    G.drawWorldModel = function (inst, model) { modelsDrawn.push(model.key); return origModel.apply(this, arguments); };
    var d0, recO, d1, recV, d2;
    try { d0 = depthCopy(); recO = drawPhase('opaque'); d1 = depthCopy(); recV = drawPhase('overlay'); d2 = depthCopy(); } finally { G.drawWorldModel = origModel; }
    var wroteBy = four.map(function (rec) {
      var F = frameOf(rec), cls = classify(hullsFor(F, authoredParts(rec), Cq, 0), 0.75), n = 0, hit = 0;
      for (var i = 0; i < W * HT; i++) if (cls[i] > 0) { n++; if (d1[i] > d0[i]) hit++; }
      return {type: rec.type, inside: n, written: hit};
    });
    var changed = 0;
    for (var i = 0; i < W * HT; i++) if (d2[i] !== d1[i]) changed++;
    out('NOTE phase four props ' + JSON.stringify({models: modelsDrawn, written: wroteBy}));
    check('phase: the opaque phase writes the model parts to depth and draws no flame; the overlay phase draws the three flame layers of each flame-bearing prop and writes no depth (torch, sconce, shield, banner on one wall)',
      modelsDrawn.length === 4 && wroteBy.every(function (w) { return w.inside > 100 && w.written === w.inside; }) &&
      flameFills(recO) === 0 && flameFills(recV) === 6 && changed === 0,
      {models: modelsDrawn, written: wroteBy, opaqueFlame: flameFills(recO), overlayFlame: flameFills(recV), overlayDepthChanges: changed});
    // Each flame-bearing type draws its own sprite recipe at its anchor: the
    // torch's outer path (two quadratic curves) and two ellipses; the sconce's
    // three ellipses, the outer one 0.18 s x 0.29 s centred 0.19 s above the
    // bowl rim (its origin 0.06 s below the rim) within its 0.025 s sway.
    var recipes = ['torch', 'sconce', 'shield', 'banner'].map(function (type) {
      var rec = typeRec(type), F = frameOf(rec);
      world([rec]); var Cr = pose(F.ox, F.oy - 60, Math.PI / 2, F.at.z);
      G.beginSceneDepthFrame(W, HT); wallPlane(Cr); drawPhase('opaque');
      var rv = drawPhase('overlay'), ell = calls(rv, 'ellipse').map(function (t) { return t.split('(')[1].split(')')[0].split(',').map(Number); });
      var row = {type: type, ellipses: ell.length, curves: calls(rv, 'quadraticCurveTo').length, fills: flameFills(rv)};
      if (type === 'sconce' && ell.length) {
        var fl = project(localF(F, 0, SC_AXIS, SC_TOP), Cr), s = F.at.size / fl.depth * PS;
        row.outer = {dx: +(ell[0][0] - fl.x).toFixed(3), dy: +(ell[0][1] - (fl.y + 0.06 * s - 0.25 * s)).toFixed(3), rx: +(ell[0][2] / s).toFixed(3), ry: +(ell[0][3] / s).toFixed(3), sway: +(0.025 * s).toFixed(3)};
      }
      return row;
    });
    out('NOTE phase recipes ' + JSON.stringify(recipes));
    var rt = recipes[0], rs = recipes[1];
    check('phase: each flame-bearing model draws its own sprite recipe at its anchor (torch: outer path + 2 ellipses; sconce: 3 ellipses, outer 0.18 s x 0.29 s above the bowl rim); shields and banners draw nothing in the overlay phase',
      rt.ellipses === 2 && rt.curves === 2 && rt.fills === 3 && rs.ellipses === 3 && rs.curves === 0 && rs.fills === 3 && rs.outer &&
      Math.abs(rs.outer.dx) <= rs.outer.sway + 0.01 && Math.abs(rs.outer.dy) <= 0.01 && Math.abs(rs.outer.rx - 0.18) < 0.002 && Math.abs(rs.outer.ry - 0.29) < 0.002 &&
      recipes.slice(2).every(function (r) { return r.ellipses === 0 && r.curves === 0 && r.fills === 0; }), recipes);
    world(); var Cp = headOn(60);
    G.beginSceneDepthFrame(W, HT); wallPlane(Cp);
    var recV1 = (drawPhase('opaque'), drawPhase('overlay'));
    // An authored depth-writing occluder placed between the phases hides the flame.
    G.beginSceneDepthFrame(W, HT); wallPlane(Cp); drawPhase('opaque');
    var fl = local(0, AXIS + 6, TIP);
    writeQuad([{x: fl.x - 25, y: fl.y, z: fl.z - 10}, {x: fl.x + 25, y: fl.y, z: fl.z - 10}, {x: fl.x + 25, y: fl.y, z: fl.z + 40}, {x: fl.x - 25, y: fl.y, z: fl.z + 40}], Cp);
    var recHidden = drawPhase('overlay');
    check('phase: an authored depth-writing occluder in front of the flame (written after the opaque phase) hides the overlay flame',
      flameFills(recHidden) === 0 && flameFills(recV1) === 3, {hidden: flameFills(recHidden)});
    G.beginSceneDepthFrame(W, HT); wallPlane(Cp); var both = drawPhase(undefined);
    G.beginSceneDepthFrame(W, HT); wallPlane(Cp); var split = drawPhase('opaque'), split2 = drawPhase('overlay');
    G.setRenderFeatures({wallPropModels: false});
    G.beginSceneDepthFrame(W, HT); wallPlane(Cp); var legacyOpaque = drawPhase('opaque'), legacyAll = drawPhase(undefined);
    check('phase: the default call equals opaque then overlay; the sprite path draws only in the overlay (default) phase',
      both.all.join('\n') === split.all.concat(split2.all).join('\n') && legacyOpaque.entries === 0 && legacyAll.entries > 20,
      {both: both.entries, split: split.entries + split2.entries, legacyOpaque: legacyOpaque.entries, legacyAll: legacyAll.entries});
  }

  // ── flame and light: anchor out of the face, near its unchanged point light ──
  if (section('flame')) {
    world(); G.worldW = G.worldH = N * 12; G._lightCellSize = G._lightCellSize || 24;
    G.setRenderFeatures({wallPropModels: false}); G.buildPointLights(); var lightsOff = JSON.stringify(G.pointLights);
    G.setRenderFeatures({wallPropModels: true}); G.buildPointLights(); var lightsOn = JSON.stringify(G.pointLights);
    var light = G.pointLights[0], anchor = G.modelAnchorWorld(G.wallPropModelFor('torch'), G.wallPropInstance(AT, false, {}), 'flame', {});
    var outOfFace = (anchor.x - TORCH.worldX) * NX + (anchor.y - TORCH.worldY) * NY;
    var gap = Math.hypot(anchor.x - light.x, anchor.y - light.y, anchor.z - light.z);
    check('flame: the flame anchor is >= 1.5 units out of the wall face and within 3 units of its point light; point lights are identical with models on and off and sit at 0.5 out, flameZ',
      outOfFace >= 1.5 && gap <= 3 && lightsOn === lightsOff && G.pointLights.length === 1 &&
      light.x === AT.x && light.y === AT.y && light.z === AT.flameZ, {out: outOfFace, gap: gap, light: light, anchor: anchor});
    // F2: the sconce (light at S / 6 above attachment.z), and a wall with all
    // four types: the same two lights (torch, sconce) with models on and off.
    var four = [recAt('torch', 20), recAt('sconce', 23), recAt('shield', 26), recAt('banner', 29)], SF = frameOf(four[1]);
    world(four); G.worldW = G.worldH = N * 12;
    G.setRenderFeatures({wallPropModels: false}); G.buildPointLights(); var lightsOff4 = JSON.stringify(G.pointLights);
    G.setRenderFeatures({wallPropModels: true}); G.buildPointLights(); var lightsOn4 = JSON.stringify(G.pointLights);
    var sLight = G.pointLights.filter(function (l) { return l.x === SF.at.x; })[0];
    var sAnchor = G.modelAnchorWorld(G.wallPropModelFor('sconce', 0), G.wallPropInstance(SF.at, false, {}), 'flame', {});
    var sOut = -(sAnchor.y - four[1].worldY), sGap = sLight ? Math.hypot(sAnchor.x - sLight.x, sAnchor.y - sLight.y, sAnchor.z - sLight.z) : NaN;
    check('flame: the sconce\'s flame anchor (bowl rim) is >= 1.5 units out and within 3 units of its point light; a wall with all four types keeps the same two point lights (torch, sconce) with models on and off',
      sOut >= 1.5 && sGap <= 3 && lightsOn4 === lightsOff4 && G.pointLights.length === 2 && sLight.y === SF.at.y && sLight.z === SF.at.flameZ &&
      Math.abs(SF.at.flameZ - SF.at.z - S / 6) < 1e-9, {out: sOut, gap: sGap, light: sLight, anchor: sAnchor, lights: G.pointLights.length});
  }

  // ── work: pixels tested per torch below the flat-quad baseline ──
  if (section('work')) {
    // F2: every modelled type (was the torch only); faces is the model's own count.
    var rowsW = [], okW = true;
    TYPES.forEach(function (type) {
      var rec = typeRec(type), F = frameOf(rec), faceCount = G.wallPropModelFor(type, G.getWallDecorationVariant(rec)).faceCount;
    [['head-on 60', function () { return pose(F.ox, F.oy - 60, Math.PI / 2, F.at.z); }], ['oblique 68', function () { return obliqueF(F, 68, 1, 90); }],
     ['near 30', function () { return pose(F.ox, F.oy - 30, Math.PI / 2, F.at.z); }], ['edge -20', function () { return edgePose(-20, 30, F); }]].forEach(function (spec) {
      world([rec]); var C = spec[1](), fwd = (F.at.x - G.cam.x) * C.cosAng + (F.at.y - G.cam.y) * C.sinAng, size = F.at.size / fwd * PS;
      G.beginSceneDepthFrame(W, HT); wallPlane(C); G.beginRenderFrameStats();
      var opaque = counting(function () { G.drawWallDecorations('opaque'); }), overlay = counting(function () { G.drawWallDecorations('overlay'); });
      var stats = G.getRenderFeatureStats().frame;
      G.setRenderFeatures({wallPropModels: false});
      G.beginSceneDepthFrame(W, HT); wallPlane(C);
      var sprite = counting(function () { G.drawWallDecorations(); });
      var row = {type: type, pose: spec[0], sizePx: Math.round(size), model: opaque.tested + overlay.tested, sprite: sprite.tested, baseline: Math.round(24 * size * size),
        statTested: stats.mdlWallPropTested, faces: stats.mdlWallPropFaces, culled: stats.mdlWallPropCulled};
      rowsW.push(row);
      if (!(row.model > 0 && row.model < row.baseline && row.model < row.sprite && row.statTested === opaque.tested &&
            row.faces === faceCount && row.culled > 0)) okW = false;
    });
    });
    out('NOTE work ' + JSON.stringify(rowsW));
    check('work: per-prop pixels tested (model faces + flame) stay below the flat-quad baseline 24 x size_px^2 and the measured sprite quad; mdlWallPropTested equals the counted opaque pixels (torch, sconce, shield, banner)',
      okW && rowsW.length === 16, rowsW);
  }

  // ── variant: absolute-cell key, stable across window slots ──
  if (section('variant')) {
    var CC = G.CHUNK_CELLS, CS = G.CHUNK_SIZE, cellSize = G.cell, stable = [], sides = ['north', 'south', 'west', 'east'];
    var modes0 = {endless: G.ENDLESS_MODE, cave: G.CAVE_TEST_MODE, terrain: G.terrain};
    G.ENDLESS_MODE = true;   // window slots only exist in Endless
    [[3, -2], [-5, 7], [0, 0], [12, -9]].forEach(function (chunk) {
      sides.forEach(function (side, si) {
        var dxc = 3 + si * 4, dyc = 5 + si, wx = chunk[0] * CS + dxc * cellSize + cellSize / 2, wy = chunk[1] * CS + dyc * cellSize + cellSize / 2;
        if (side === 'north') wy -= cellSize / 2; else if (side === 'south') wy += cellSize / 2; else if (side === 'west') wx -= cellSize / 2; else wx += cellSize / 2;
        var rec = {worldX: wx, worldY: wy, side: side, type: 'shield', gridX: dxc, gridY: dyc}, got = [];
        [0, 1, 2].forEach(function (slot) {
          G.windowOriginX = (chunk[0] - slot) * CS; G.windowOriginY = (chunk[1] - slot) * CS;
          got.push(G.getWallDecorationVariant(G.chunkWallDecorationInWindow(rec, slot, slot)));
        });
        stable.push({chunk: chunk, side: side, variants: got});
      });
    });
    G.windowOriginX = G.windowOriginY = 0; G.ENDLESS_MODE = false;
    check('variant: the same chunk record at window slots 0, 1 and 2 gives the same variant (4 chunks x 4 sides)',
      stable.every(function (s) { return s.variants[0] === s.variants[1] && s.variants[1] === s.variants[2]; }), stable.filter(function (s) {
        return s.variants[0] !== s.variants[1] || s.variants[1] !== s.variants[2]; }).slice(0, 3));
    // The pre-F1 key (window-relative gridX/Y), kept here as the reference for window origin 0.
    function oldKey(dec) {
      var sideCode = dec.side === 'north' ? 11 : dec.side === 'south' ? 23 : dec.side === 'west' ? 37 : 53;
      var h = Math.imul((dec.gridX | 0) + 4099, 73856093) ^ Math.imul((dec.gridY | 0) + 8191, 19349663) ^ sideCode;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return (h ^ (h >>> 16)) >>> 0;
    }
    var fixedRecs = [];
    for (var gy = 1; gy < 30; gy += 3) for (var gx = 1; gx < 30; gx += 4) sides.forEach(function (side) {
      [-0.19, 0, 0.19].forEach(function (off) {
        var wx = gx * cellSize + cellSize / 2, wy = gy * cellSize + cellSize / 2;
        if (side === 'north') { wy -= cellSize / 2; wx += off * cellSize; } else if (side === 'south') { wy += cellSize / 2; wx += off * cellSize; }
        else if (side === 'west') { wx -= cellSize / 2; wy += off * cellSize; } else { wx += cellSize / 2; wy += off * cellSize; }
        fixedRecs.push({worldX: wx, worldY: wy, side: side, gridX: gx, gridY: gy});
      });
    });
    function sameAsOld(recs) { return recs.filter(function (dec) { return G.getWallDecorationVariant(dec) === oldKey(dec); }).length; }
    var same = sameAsOld(fixedRecs), total = fixedRecs.length;
    check('variant: at window origin 0 (non-Endless maps) the absolute key equals the pre-F1 key, including the +-0.2 cell placement offset',
      total > 300 && same === total, {same: same, total: total});
    // The window origin is not reset when a fixed level starts, so a fixed
    // level must ignore it (as 06-spatial-queries does). Control: the same
    // stale origin in Endless mode does change the key.
    G.windowOriginX = -1440; G.windowOriginY = -1440;
    var staleFixed = sameAsOld(fixedRecs);
    G.ENDLESS_MODE = true; var staleEndless = sameAsOld(fixedRecs); G.ENDLESS_MODE = false;
    G.windowOriginX = G.windowOriginY = 0;
    check('variant: on a fixed level (ENDLESS_MODE false) a stale Endless window origin is ignored: the pre-F1 key; in Endless the same origin moves the key',
      staleFixed === total && staleEndless < total * 0.1, {staleFixed: staleFixed, staleEndless: staleEndless, total: total});
    // The real Endless window, re-centred by one chunk east: every decoration
    // still in the window keeps its variant and its drawn shield heraldry.
    H.startEndless(4242);
    function snapshot() {
      var map = {};
      G.wallDecorations.forEach(function (d) { map[(d.worldX + G.windowOriginX) + ',' + (d.worldY + G.windowOriginY) + ',' + d.side] = G.getWallDecorationVariant(d); });
      return map;
    }
    var first = snapshot(), originBefore = G.windowOriginX, half = Math.floor(G.WINDOW_CHUNKS / 2);
    G.assembleWindow(G.windowCX + half + 1, G.windowCY + half);
    var second = snapshot(), matched = 0, differ = 0;
    Object.keys(first).forEach(function (k) { if (k in second) { matched++; if (first[k] !== second[k]) differ++; } });
    check('variant: re-centring a real Endless window (seed 4242) by one chunk keeps every shared decoration\'s variant',
      G.windowOriginX !== originBefore && matched > 20 && differ === 0, {matched: matched, differ: differ, shift: G.windowOriginX - originBefore});
    // Then a normal level, as 22-lifecycle starts one (ENDLESS_MODE false,
    // resetLevel(1)): the Endless origin is still set, the variants are the
    // pre-F1 key of the level's own (absolute) records.
    G.ENDLESS_MODE = false; G.CAVE_TEST_MODE = false; G.terrain = 'dungeon';
    G.resetLevel(1);
    var fixedDecs = G.wallDecorations.slice(), fixedSame = sameAsOld(fixedDecs), staleOrigin = [G.windowOriginX, G.windowOriginY];
    check('variant: a normal level started after an Endless session keeps the pre-F1 key for every wall decoration (the window origin is stale)',
      fixedDecs.length > 0 && fixedSame === fixedDecs.length && (staleOrigin[0] !== 0 || staleOrigin[1] !== 0),
      {decorations: fixedDecs.length, same: fixedSame, origin: staleOrigin});
    G.ENDLESS_MODE = modes0.endless; G.CAVE_TEST_MODE = modes0.cave; G.terrain = modes0.terrain;
  }

  // ── model path: cave shading, distance fade, not from behind the wall plane ──
  if (section('model')) {
    // Channel sums of the opaque phase's face fills, in draw order.
    var opaqueFills = function () {
      G.beginSceneDepthFrame(W, HT); H.record(true, true); G.drawWallDecorations('opaque'); var r = H.record(false);
      return r.all.filter(function (t) { return /\.fillStyle="rgb\(/.test(t); }).map(function (t) {
        return t.split('(')[1].split(')')[0].split(',').reduce(function (sum, v) { return sum + (+v); }, 0);
      });
    };
    world(); headOn(60);
    var surface = opaqueFills();
    G.gridCave = new Uint8Array(N * N); G.gridCave[24 * N + 10] = 1;   // a cave flag on another wall cell
    var otherCell = opaqueFills();
    G.gridCave[24 * N + 24] = 1;                                        // the torch's own wall cell
    var cave = opaqueFills();
    check('model: cave shading, a torch on a gridCave wall cell is filled darker face for face than on the surface; a cave flag on another cell changes nothing',
      surface.length >= 6 && cave.length === surface.length && cave.every(function (v, i) { return v < surface[i]; }) &&
      otherCell.join() === surface.join(), {surface: surface, cave: cave, otherCell: otherCell});

    // viewDist 200: the fade runs from 0.56 (112) to 0.7 (140) viewDist.
    var fadeAt = function (D) {
      world(); G.viewDist = 200; headOn(D);
      var faceAlpha = [], orig = G.withSceneDepthClip;
      G.withSceneDepthClip = function (points, cb, options) {
        if (options && options.writeDepth) faceAlpha.push(G.ctx.globalAlpha);
        return orig(points, cb, options);
      };
      var rec;
      try {
        G.beginSceneDepthFrame(W, HT); G.drawWallDecorations('opaque');
        H.record(true, true); G.drawWallDecorations('overlay'); rec = H.record(false);
      } finally { G.withSceneDepthClip = orig; }
      return {dist: D - 0.5, faces: faceAlpha.length, faceMin: Math.min.apply(null, faceAlpha.concat([Infinity])),
        faceMax: Math.max.apply(null, faceAlpha.concat([-Infinity])), flameAlpha: rec.all.filter(function (t) { return /\.globalAlpha=/.test(t); })
          .map(function (t) { return +t.split('=')[1]; }), flameFills: flameFills(rec), after: G.ctx.globalAlpha};
    };
    var fNear = fadeAt(100.5), fMid = fadeAt(126.5), fFar = fadeAt(150);
    function near(a, b) { return Math.abs(a - b) < 1e-9; }
    check('model: distance fade, faces and flame are opaque before 0.56 viewDist, at half alpha at 0.63 viewDist (alpha restored afterwards) and not drawn beyond 0.7 viewDist',
      fNear.faces >= 5 && fNear.faceMin === 1 && fNear.faceMax === 1 && fNear.flameAlpha.length === 1 && near(fNear.flameAlpha[0], 0.92) &&
      fMid.faces >= 5 && near(fMid.faceMin, 0.5) && near(fMid.faceMax, 0.5) && fMid.flameAlpha.length === 1 && near(fMid.flameAlpha[0], 0.46) &&
      fMid.after === 1 && fMid.flameFills === 3 && fFar.faces === 0 && fFar.flameFills === 0, {near: fNear, mid: fMid, far: fFar});

    // Behind the face plane (south of the wall row, looking north at the
    // torch) with the prop in the frustum; the mirrored pose in front.
    var drawnFrom = function (y, ang) {
      world(); pose(OX, y, ang, AT.z);
      var tally = null, painted0 = 0;
      G.beginSceneDepthFrame(W, HT); var before = depthCopy();
      H.record(true, true);
      tally = counting(function () { G.drawWallDecorations(); });
      var rec = H.record(false), set = painted(before);
      for (var i = 0; i < W * HT; i++) painted0 += set[i];
      return {clips: tally.calls, painted: painted0, flame: flameFills(rec), entries: rec.entries};
    };
    var behind = drawnFrom(OY + 12 + 42, -Math.PI / 2), front = drawnFrom(OY - 54, Math.PI / 2);
    check('model: not drawn from behind its wall plane (camera behind the face, prop in the frustum): no depth tests, faces or flame; the mirrored front pose draws',
      behind.clips === 0 && behind.painted === 0 && behind.flame === 0 && behind.entries === 0 &&
      front.clips > 3 && front.painted > 1000 && front.flame === 3, {behind: behind, front: front});
  }

  // ── decal: the heraldry is drawn after the face it sits on (F2) ──
  // The depth test passes a later face up to 0.15 behind a nearer one, so a
  // decal 0.1 proud must be drawn after its face or the face paints over it.
  // Oracle: with the back-face cull off, the opaque phase fills every face in
  // buildModelFaces order, so each fill is attributed to its part; a pixel's
  // owner is the part that painted it last. Inside each authored decal (away
  // from nearer parts' edges) the owner must be that decal.
  if (section('decal')) {
    var decalRows = [];
    ['shield', 'banner'].forEach(function (type) {
      [0, 1, 2].forEach(function (f) {
        var rec = familyRec(type, f), F = frameOf(rec), parts = heraldicParts(type, rec).parts;
        var model = G.wallPropModelFor(type, G.getWallDecorationVariant(rec));
        [['head-on 60', function () { return pose(F.ox, F.oy - 60, Math.PI / 2, F.at.z); }], ['oblique 68', function () { return obliqueF(F, 68, 1, 70); }]].forEach(function (spec) {
          world([rec]); G.setRenderFeatures({modelBackfaceCull: false});
          var C = spec[1](), buf = G.createModelFaceBuffer(), n = G.buildModelFaces(model, G.wallPropInstance(F.at, false, {}), buf);
          var owner = new Int16Array(W * HT), fillsSeen = 0, realFill = G.fillSceneDepthPolygon;
          owner.fill(-1);
          G.beginSceneDepthFrame(W, HT); wallPlane(C);
          G.fillSceneDepthPolygon = function (points) {
            var r = realFill(points), gen = G._sceneDepthClipGeneration, k = fillsSeen++;
            if (r) for (var i = 0; i < W * HT; i++) if (G._sceneDepthClipMarks[i] === gen) owner[i] = k;
            return r;
          };
          try { G.drawWallDecorations('opaque'); } finally { G.fillSceneDepthPolygon = realFill; G.setRenderFeatures({modelBackfaceCull: true}); }
          if (fillsSeen !== n) throw Error('SETUP fills ' + fillsSeen + ' != faces ' + n);
          // Decals (and what stands in front of them): field/cloth < charge < roundel centre < boss/rod.
          var tiers = type === 'shield' ? [['field'], ['charge'], ['boss']] : [['cloth'], ['charge'], ['roundelCentre'], ['rod', 'hanger', 'finial']];
          var tierOf = function (name) { for (var t = 0; t < tiers.length; t++) if (tiers[t].some(function (p) { return name.indexOf(p) === 0; })) return t; return -1; };
          var clsBy = tiers.map(function (names) {
            return classify(hullsFor(F, parts.filter(function (p) { return names.some(function (q) { return p.name.indexOf(q) === 0; }); }), C, 0), 0.75);
          });
          var row = {type: type, family: f, pose: spec[0], checked: 0, wrong: 0, byTier: []};
          for (var t = 0; t < tiers.length - 1; t++) {   // the last tier (boss, rod) is not a decal
            var n0 = 0, bad = 0;
            for (var i = 0; i < W * HT; i++) {
              if (clsBy[t][i] <= 0) continue;
              var covered = false;   // skip pixels near or under a later tier
              for (var u = t + 1; u < tiers.length; u++) if (clsBy[u][i] >= 0) covered = true;
              if (covered) continue;
              n0++;
              var o = owner[i], name = o >= 0 ? buf.faces[o].partName : '(none)';
              if (tierOf(name) !== t) bad++;
            }
            row.byTier.push(tiers[t][0] + ' ' + n0 + '/' + bad);
            row.checked += n0; row.wrong += bad;
          }
          decalRows.push(row);
        });
      });
    });
    out('NOTE decal ' + JSON.stringify(decalRows));
    check('decal: the heraldry is drawn after its face: every pixel inside the shield\'s field and charge, and the banner\'s cloth, charge and roundel centre, is last painted by that part (3 families each, head-on and 68 degrees)',
      decalRows.length === 12 && decalRows.every(function (r) { return r.checked > 150 && r.wrong === 0; }), decalRows);
  }

  // ── lab: headless smoke of tools/game/render-lab/30-wall-props.js ──
  // A real Endless window: pose at the nearest torch 70 degrees off its
  // normal, then one frozen draw() per switch state. Counters only; the
  // captures and timing are browser checks.
  if (section('lab')) {
    (0, eval)(slurp('tools/game/render-lab/00-core.js'));
    (0, eval)(slurp('tools/game/render-lab/30-wall-props.js'));
    H.startEndless(4242);
    G.applyRenderPreset('recommended');
    var wrappers = {clip: G.withSceneDepthClip, draw: G.drawWallDecorations, model: G.drawWorldModel, now: Date.now, random: Math.random};
    var snap = JSON.stringify(G.renderFeatureSnapshot()), posed = G.RenderLabWallProps.poseAt('torch', 70);
    var r = G.RenderLabWallProps.counts('smoke');
    out('NOTE lab ' + JSON.stringify(posed) + ' ' + r.text);
    // Restated in F2 (was "30 faces per modelled torch"): every wall prop type
    // is modelled now, so the faces equal the drawn models' own face counts.
    check('lab: poseAt finds a torch at 70 degrees; counts() sees it as a sprite and as a model (faces = the drawn models\' face counts, fewer pixels tested), then restores the switches, wrappers and clocks',
      posed.ok && r.sprite.spriteQuads >= 1 && r.model.modelDraws >= 1 && r.model.faces === r.model.modelFaces && r.model.byKey.wallTorch >= 1 &&
      r.model.statTested > 0 && r.model.tested < r.sprite.tested && r.sprite.faces === 0 &&
      JSON.stringify(G.renderFeatureSnapshot()) === snap && G.withSceneDepthClip === wrappers.clip && G.drawWallDecorations === wrappers.draw &&
      G.drawWorldModel === wrappers.model && Date.now === wrappers.now && Math.random === wrappers.random, {posed: posed, counts: r});
    var cfg = G.RenderLabWallProps.CONFIGS;
    check('lab: the timing configurations are Recommended with wallPropModels off (A) and on (B)',
      cfg.sprite.preset === 'recommended' && cfg.sprite.features.wallPropModels === false && cfg.model.features.wallPropModels === true, cfg);
  }

  check('no console errors', H.errors.length === 0, H.errors.slice(0, 3));
  out('WALL_DECOR_DRIVER_RESULT ' + (failed ? 'FAIL ' : 'PASS ') + checked + ' failed ' + failed);
}());
undefined;
