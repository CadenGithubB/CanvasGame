// Shared model core for props and landmarks (integration stage C).
// A model is frozen, backend-neutral data: parts authored in model-local
// space (r = right, o = out, z = up, world units), each with a
// GAME_MATERIALS id and role, a per-part uvScale, a tint role, flags, an
// optional hinge, named anchors and bounds. buildModelFaces() writes reusable
// world-space face records whose UVs were assigned in part-local space;
// drawWorldModel() is the one Canvas draw path: exact back-face culling on
// closed opaque parts clear of the near plane, near-plane clipping, lighting
// that matches the wall renderer and the production scene-depth fill. Inert
// at load: declarations plus render-feature registrations (and one
// registry listener), no DOM, canvas or catalog work. The wall-prop (stage
// F), chest (stage G) and spawner obelisk (stage H) models are defined here
// too, and the landmark opaque pass (stage G2). Stage K adds the read-only
// early reject (modelHiddenByDepth, switch modelEarlyReject) and registers
// decorAnchorCache (07-decorations-lighting.js's anchor cache).
//
// Local winding is outward and counter-clockwise in right-handed (r, o, z)
// algebra. modelBasis() maps that frame with determinant -1 (out=(cos,sin),
// right=(-sin,cos)), so the builder reverses vertex order there; the
// structure basis (right=(cos,sin), out=(-sin,cos)) is its mirror and keeps
// the authored order. Either way every emitted face winds outward in world
// algebra and carries its outward unit normal.
//
// definePropModel() checks materials against GAME_MATERIALS and throws when
// 01-materials.js is absent, and fragments must stay inert at load. So
// production models are defined lazily (on first use) or behind a
// typeof GAME_MATERIALS guard, never as top-level definePropModel calls.
var PROP_MODELS = Object.create(null);
var PROP_MODEL_KINDS = Object.freeze(['box', 'frustum', 'prism', 'extrude', 'quad', 'tri', 'poly', 'mesh']);
var PROP_MODEL_FLAGS = Object.freeze(['closed', 'emissive', 'translucent', 'decal']);
var PROP_MODEL_UV_SCALE = 32;
// Optional capture hook read (typeof-guarded) by drawRuinDecorFace in
// 15-render-hud-menu.js. When it is a function it receives each world face
// and colour instead of that face being drawn. Null keeps drawing unchanged.
var _ruinDecorFaceSink = null;
var _propModelScratch = null, _propModelBasisScratch = null, _pmTranslucentPoints = null;

function _propModelError(message) { return new Error('prop models: ' + message); }

// ── Bases and adapters ──
function _pmSnap(v) { return Math.abs(v) < 1e-12 ? 0 : v; }
function modelBasis(yaw, out) {
  out = out || {};
  var c = _pmSnap(Math.cos(yaw)), s = _pmSnap(Math.sin(yaw));
  out.outX = c; out.outY = s; out.rightX = -s; out.rightY = c;
  out.hand = out.rightX * out.outY - out.rightY * out.outX;
  return out;
}
// drawStructureBoxWorld's basis: right=(cos,sin), out=(-sin,cos) (mirrored).
function structureModelBasis(yaw, out) {
  out = out || {};
  var c = _pmSnap(Math.cos(yaw)), s = _pmSnap(Math.sin(yaw));
  out.rightX = c; out.rightY = s; out.outX = -s; out.outY = c;
  out.hand = out.rightX * out.outY - out.rightY * out.outX;
  return out;
}
function chestModelBasis(ch, out) { return modelBasis(ch && Number.isFinite(ch.facing) ? ch.facing : 0, out); }
function ruinModelBasis(ru, out) { return modelBasis((((ru && ru.facing) | 0) & 3) * Math.PI * 0.5 - Math.PI * 0.5, out); }
function wallModelBasis(nx, ny, out) { return modelBasis(Math.atan2(ny, nx), out); }
function _pmInstanceBasis(inst) {
  if (inst.basis) return inst.basis;
  return modelBasis(Number.isFinite(inst.yaw) ? inst.yaw : 0,
    _propModelBasisScratch || (_propModelBasisScratch = {}));
}
function modelLocalToWorld(inst, r, o, z, out) {
  var b = _pmInstanceBasis(inst), s = inst.scale > 0 ? inst.scale : 1;
  out = out || {};
  out.x = inst.x + (r * b.rightX + o * b.outX) * s;
  out.y = inst.y + (r * b.rightY + o * b.outY) * s;
  out.z = (Number.isFinite(inst.z) ? inst.z : 0) + z * s;
  return out;
}

// ── Stateless keys (no RNG) ──
function propTypeSalt(name) {
  var h = 0x811c9dc5, text = String(name);
  for (var i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
function propInstanceKey(salt, cellX, cellY, seed) {
  var h = Math.imul((salt | 0) ^ 0x27d4eb2f, 0x9e3779b1);
  h = Math.imul(h ^ (cellX | 0), 0x85ebca6b); h ^= h >>> 13;
  h = Math.imul(h ^ (cellY | 0), 0xc2b2ae35); h ^= h >>> 16;
  h = Math.imul(h ^ (seed | 0), 0x27d4eb2f); h ^= h >>> 15;
  return h >>> 0;
}

// ── Definition-time geometry (allocates; never on the draw path) ──
function _pmVec(value, n, what) {
  if (!Array.isArray(value) || value.length !== n) throw _propModelError(what + ' must be ' + n + ' numbers');
  for (var i = 0; i < n; i++) {
    if (typeof value[i] !== 'number' || !Number.isFinite(value[i])) throw _propModelError(what + ' must be finite numbers');
  }
  return value.slice();
}
function _pmNumber(value, fallback, what, min) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || (min !== undefined && value < min))
    throw _propModelError(what + ' must be a finite number' + (min !== undefined ? ' >= ' + min : ''));
  return value;
}
function _pmNewell(points) {
  var nx = 0, ny = 0, nz = 0;
  for (var i = 0; i < points.length; i++) {
    var a = points[i], b = points[(i + 1) % points.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  var length = Math.sqrt(nx * nx + ny * ny + nz * nz);
  return length > 1e-9 ? [nx / length, ny / length, nz / length] : null;
}
function _pmDedupe(points) {
  var out = [];
  for (var i = 0; i < points.length; i++) {
    var p = points[i], q = out.length ? out[out.length - 1] : null;
    if (!q || Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) > 1e-9) out.push(p);
  }
  while (out.length > 1) {
    var f = out[0], l = out[out.length - 1];
    if (Math.abs(f[0] - l[0]) + Math.abs(f[1] - l[1]) + Math.abs(f[2] - l[2]) > 1e-9) break;
    out.pop();
  }
  return out;
}
// Box and frustum faces share one order: -out, +right, +out, -right, top,
// bottom. The first five match drawRuinDecorBox, so an adapter reproduces it.
function _pmQuadBlock(b, t, top, bottom) {
  var faces = [[b[0], b[1], t[1], t[0]], [b[1], b[2], t[2], t[1]], [b[2], b[3], t[3], t[2]], [b[3], b[0], t[0], t[3]]];
  if (top) faces.push([t[0], t[1], t[2], t[3]]);
  if (bottom) faces.push([b[0], b[3], b[2], b[1]]);
  return faces;
}
function _pmPartPoints(part, def, name) {
  var faces = [], i;
  if (part.kind === 'box') {
    var mn = _pmVec(def.min, 3, name + '.min'), mx = _pmVec(def.max, 3, name + '.max');
    for (i = 0; i < 3; i++) if (!(mx[i] > mn[i])) throw _propModelError(name + ': box max must exceed min');
    var b = [[mn[0], mn[1], mn[2]], [mx[0], mn[1], mn[2]], [mx[0], mx[1], mn[2]], [mn[0], mx[1], mn[2]]];
    var t = b.map(function(p) { return [p[0], p[1], mx[2]]; });
    faces = _pmQuadBlock(b, t, def.top !== false, def.bottom !== false);
    part.defaultClosed = def.top !== false && def.bottom !== false;
  } else if (part.kind === 'frustum') {
    var fc = _pmVec(def.center || [0, 0], 2, name + '.center'), fz0 = _pmNumber(def.z0, 0, name + '.z0');
    var fz1 = _pmNumber(def.z1, NaN, name + '.z1'), lo = _pmVec(def.bottom, 2, name + '.bottom');
    var hi = _pmVec(def.top, 2, name + '.top'), shift = _pmVec(def.shift || [0, 0], 2, name + '.shift');
    if (!(fz1 > fz0) || !(lo[0] > 0 && lo[1] > 0) || hi[0] < 0 || hi[1] < 0)
      throw _propModelError(name + ': frustum needs z1 > z0, a positive bottom and a non-negative top');
    var fb = [[fc[0] - lo[0], fc[1] - lo[1], fz0], [fc[0] + lo[0], fc[1] - lo[1], fz0],
      [fc[0] + lo[0], fc[1] + lo[1], fz0], [fc[0] - lo[0], fc[1] + lo[1], fz0]];
    var tr = fc[0] + shift[0], to = fc[1] + shift[1];
    var ft = [[tr - hi[0], to - hi[1], fz1], [tr + hi[0], to - hi[1], fz1],
      [tr + hi[0], to + hi[1], fz1], [tr - hi[0], to + hi[1], fz1]];
    if (def.apex === undefined) {
      faces = _pmQuadBlock(fb, ft, true, def.bottomCap !== false);
    } else {
      // Optional (stage H): apex > z1 replaces the flat top with a pyramid
      // cap to (center + shift, apex): sides, four cap triangles, bottom.
      var apex = _pmNumber(def.apex, NaN, name + '.apex');
      if (!(apex > fz1) || !(hi[0] > 0 && hi[1] > 0)) throw _propModelError(name + ': a frustum apex needs a positive top and apex > z1');
      faces = _pmQuadBlock(fb, ft, false, false);
      for (i = 0; i < 4; i++) faces.push([ft[i], ft[(i + 1) % 4], [tr, to, apex]]);
      if (def.bottomCap !== false) faces.push([fb[0], fb[3], fb[2], fb[1]]);
    }
    part.defaultClosed = def.bottomCap !== false;
  } else if (part.kind === 'prism') {
    // Optional (stage F2): axis 'o' or 'r' runs the prism along that local
    // axis (center and radius are then in the other two, in r, o, z order;
    // z0/z1 are positions along the axis), and radius may be [a, b] for an
    // elliptical cross-section. The defaults keep the vertical prism exactly.
    var sides = def.sides;
    if (!Number.isInteger(sides) || sides < 3 || sides > 64) throw _propModelError(name + ': prism sides must be an integer 3..64');
    var paxis = def.axis === undefined ? 'z' : def.axis;
    if (paxis !== 'r' && paxis !== 'o' && paxis !== 'z') throw _propModelError(name + ': prism axis must be r, o or z');
    var pc = _pmVec(def.center || [0, 0], 2, name + '.center');
    var radius = Array.isArray(def.radius) ? _pmVec(def.radius, 2, name + '.radius') : _pmNumber(def.radius, NaN, name + '.radius');
    var ra = Array.isArray(radius) ? radius[0] : radius, rb = Array.isArray(radius) ? radius[1] : radius;
    var taper = _pmNumber(def.taper, 1, name + '.taper', 0), rotation = _pmNumber(def.rotation, 0, name + '.rotation');
    var pz0 = _pmNumber(def.z0, 0, name + '.z0'), pz1 = _pmNumber(def.z1, NaN, name + '.z1');
    var ps = _pmVec(def.shift || [0, 0], 2, name + '.shift');
    if (!(ra > 0) || !(rb > 0) || !(pz1 > pz0)) throw _propModelError(name + ': prism needs radius > 0 and z1 > z0');
    var pat = function(p0, p1, tt) { return paxis === 'z' ? [p0, p1, tt] : paxis === 'o' ? [p0, tt, p1] : [tt, p0, p1]; };
    var ring0 = [], ring1 = [];
    for (i = 0; i < sides; i++) {
      var a = rotation + i * Math.PI * 2 / sides, ca = Math.cos(a), sa = Math.sin(a);
      ring0.push(pat(pc[0] + ca * ra, pc[1] + sa * rb, pz0));
      ring1.push(pat(pc[0] + ps[0] + ca * ra * taper, pc[1] + ps[1] + sa * rb * taper, pz1));
    }
    for (i = 0; i < sides; i++) faces.push([ring0[i], ring0[(i + 1) % sides], ring1[(i + 1) % sides], ring1[i]]);
    faces.push(ring1.slice());
    if (def.bottomCap !== false) faces.push(ring0.slice().reverse());
    // (a, t, b) swaps two axes, a reflection: reverse to keep outward winding.
    if (paxis === 'o') faces.forEach(function(f) { f.reverse(); });
    part.defaultClosed = def.bottomCap !== false;
  } else if (part.kind === 'extrude') {
    var axis = def.axis;
    if (axis !== 'r' && axis !== 'o' && axis !== 'z') throw _propModelError(name + ': extrude axis must be r, o or z');
    if (!Array.isArray(def.profile) || def.profile.length < 3) throw _propModelError(name + ': extrude needs a profile of 3+ points');
    var profile = def.profile.map(function(p, pi) { return _pmVec(p, 2, name + '.profile[' + pi + ']'); });
    var from = _pmNumber(def.from, NaN, name + '.from'), to2 = _pmNumber(def.to, NaN, name + '.to');
    if (!(to2 > from)) throw _propModelError(name + ': extrude needs to > from');
    var at = function(p, tt) { return axis === 'z' ? [p[0], p[1], tt] : axis === 'r' ? [tt, p[0], p[1]] : [p[0], tt, p[1]]; };
    var n = profile.length, start = [], end = [];
    for (i = 0; i < n; i++) {
      faces.push([at(profile[i], from), at(profile[(i + 1) % n], from), at(profile[(i + 1) % n], to2), at(profile[i], to2)]);
      start.push(at(profile[n - 1 - i], from)); end.push(at(profile[i], to2));
    }
    if (def.caps !== false) { faces.push(start); faces.push(end); }
    part.defaultClosed = def.caps !== false;
    // The profile may be authored either way round; orient by signed volume.
    if (part.defaultClosed && _pmSignedVolume(faces) < 0) faces.forEach(function(f) { f.reverse(); });
  } else if (part.kind === 'quad' || part.kind === 'tri' || part.kind === 'poly') {
    // poly (stage F2): one planar convex polygon of 3+ vertices, e.g. a decal.
    var count = part.kind === 'quad' ? 4 : part.kind === 'tri' ? 3 : 0;
    if (!Array.isArray(def.vertices) || (count ? def.vertices.length !== count : def.vertices.length < 3))
      throw _propModelError(name + ': ' + part.kind + ' needs ' + (count || '3+') + ' vertices');
    faces = [def.vertices.map(function(p, vi) { return _pmVec(p, 3, name + '.vertices[' + vi + ']'); })];
    part.defaultClosed = false;
  } else if (part.kind === 'mesh') {
    if (!Array.isArray(def.vertices) || def.vertices.length < 3 || !Array.isArray(def.triangles) || !def.triangles.length)
      throw _propModelError(name + ': mesh needs vertices and triangles');
    var verts = def.vertices.map(function(p, vi) { return _pmVec(p, 3, name + '.vertices[' + vi + ']'); });
    def.triangles.forEach(function(tri, ti) {
      if (!Array.isArray(tri) || tri.length !== 3 || !tri.every(function(k) { return Number.isInteger(k) && k >= 0 && k < verts.length; }))
        throw _propModelError(name + '.triangles[' + ti + '] must index three vertices');
      faces.push([verts[tri[0]], verts[tri[1]], verts[tri[2]]]);
    });
    part.defaultClosed = false;
  }
  return faces;
}
function _pmSignedVolume(faces) {
  var volume = 0;
  faces.forEach(function(f) {
    for (var i = 1; i + 1 < f.length; i++) {
      var a = f[0], b = f[i], c = f[i + 1];
      volume += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
  });
  return volume / 6;
}
function _pmPointKey(p) { return p.map(function(v) { return Math.round(v * 1e6); }).join(','); }
// Every directed edge must be matched by exactly one opposite edge.
function _pmManifoldProblem(faces) {
  var edges = Object.create(null);
  faces.forEach(function(f) {
    for (var i = 0; i < f.length; i++) {
      var key = _pmPointKey(f[i]) + '>' + _pmPointKey(f[(i + 1) % f.length]);
      edges[key] = (edges[key] || 0) + 1;
    }
  });
  for (var key in edges) {
    var ends = key.split('>'), reverse = ends[1] + '>' + ends[0];
    if (edges[key] !== 1 || edges[reverse] !== 1) return 'edge ' + key + ' is not shared by exactly two faces';
  }
  return '';
}
// Canvas and the scene-depth fan both assume a planar convex polygon.
function _pmFaceProblem(points, normal) {
  var p0 = points[0], size = 0, i;
  for (i = 1; i < points.length; i++) size = Math.max(size, Math.abs(points[i][0] - p0[0]) + Math.abs(points[i][1] - p0[1]) + Math.abs(points[i][2] - p0[2]));
  for (i = 1; i < points.length; i++) {
    var d = (points[i][0] - p0[0]) * normal[0] + (points[i][1] - p0[1]) * normal[1] + (points[i][2] - p0[2]) * normal[2];
    if (Math.abs(d) > size * 1e-6) return 'is not planar';
  }
  for (i = 0; i < points.length; i++) {
    var a = points[i], b = points[(i + 1) % points.length], c = points[(i + 2) % points.length];
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - b[0], vy = c[1] - b[1], vz = c[2] - b[2];
    var turn = (uy * vz - uz * vy) * normal[0] + (uz * vx - ux * vz) * normal[1] + (ux * vy - uy * vx) * normal[2];
    if (turn < -size * size * 1e-9) return 'is not convex';
  }
  return '';
}
// Part-local UVs in tile repeats: u runs along the horizontal tangent
// t = z x n (the viewer's right for modelBasis instances), v runs down the
// face. Horizontal faces use u along +r.
function _pmFaceUV(points, normal, scale) {
  var horizontal = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1]);
  var tx = 1, ty = 0;
  if (horizontal > 1e-9) { tx = -normal[1] / horizontal; ty = normal[0] / horizontal; }
  var bx = -normal[2] * ty, by = normal[2] * tx, bz = normal[0] * ty - normal[1] * tx;
  return points.map(function(p) {
    return Object.freeze([(p[0] * tx + p[1] * ty) / scale, -(p[0] * bx + p[1] * by + p[2] * bz) / scale]);
  });
}
function _pmDeepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.getOwnPropertyNames(value).forEach(function(k) { _pmDeepFreeze(value[k]); });
  }
  return value;
}

function _pmNormalizePart(def, index, anchorNames) {
  if (!def || typeof def !== 'object') throw _propModelError('part ' + index + ' must be an object');
  var name = typeof def.name === 'string' && def.name ? def.name : 'part' + index;
  if (PROP_MODEL_KINDS.indexOf(def.kind) < 0) throw _propModelError(name + ': unknown kind ' + def.kind);
  var materials = typeof GAME_MATERIALS !== 'undefined' ? GAME_MATERIALS : null;
  var material = materials && materials[def.material];
  if (!material) throw _propModelError(name + ': unknown material ' + def.material);
  var role = def.role === undefined ? 'base' : def.role;
  if (!material.packed || !(role in material.packed)) throw _propModelError(name + ': material ' + def.material + ' has no role ' + role);
  var part = {name: name, kind: def.kind, material: def.material, role: role,
    uvScale: _pmNumber(def.uvScale, PROP_MODEL_UV_SCALE, name + '.uvScale'),
    tint: def.tint === undefined ? 'none' : def.tint, alpha: 1, hinge: null, anchors: {}, faceRoles: null};
  if (!(part.uvScale > 0)) throw _propModelError(name + ': uvScale must be positive');
  if (typeof part.tint !== 'string' || !part.tint) throw _propModelError(name + ': tint must be a role name');
  var flags = def.flags || {};
  Object.keys(flags).forEach(function(k) {
    if (PROP_MODEL_FLAGS.indexOf(k) < 0 || typeof flags[k] !== 'boolean') throw _propModelError(name + ': unknown or non-boolean flag ' + k);
  });
  var points = _pmPartPoints(part, def, name).map(_pmDedupe).filter(function(f) { return f.length >= 3; });
  if (!points.length) throw _propModelError(name + ': no faces');
  part.flags = {closed: flags.closed === undefined ? part.defaultClosed : flags.closed,
    emissive: !!flags.emissive, translucent: !!flags.translucent, decal: !!flags.decal};
  delete part.defaultClosed;
  if (part.flags.translucent) {
    part.alpha = _pmNumber(def.alpha, 0.6, name + '.alpha');
    if (!(part.alpha > 0 && part.alpha <= 1)) throw _propModelError(name + ': alpha must be in (0, 1]');
  }
  if (def.faceRoles !== undefined) {
    if (!Array.isArray(def.faceRoles) || def.faceRoles.length !== points.length)
      throw _propModelError(name + ': faceRoles needs one role per face (' + points.length + ')');
    def.faceRoles.forEach(function(r) { if (!(r in material.packed)) throw _propModelError(name + ': material ' + def.material + ' has no role ' + r); });
    part.faceRoles = def.faceRoles.slice();
  }
  if (part.flags.closed) {
    var problem = _pmManifoldProblem(points);
    if (problem) throw _propModelError(name + ': closed part ' + problem);
    if (!(_pmSignedVolume(points) > 0)) throw _propModelError(name + ': closed part winds inward');
  }
  part.faces = points.map(function(f, fi) {
    var normal = _pmNewell(f);
    if (!normal) throw _propModelError(name + ': face ' + fi + ' has no area');
    var problem = _pmFaceProblem(f, normal);
    if (problem) throw _propModelError(name + ': face ' + fi + ' ' + problem);
    return {points: f.map(function(p) { return p.slice(); }), uv: _pmFaceUV(f, normal, part.uvScale), normal: normal,
      role: part.faceRoles ? part.faceRoles[fi] : role};
  });
  var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  part.faces.forEach(function(f) { f.points.forEach(function(p) {
    for (var k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  }); });
  part.bounds = {min: min, max: max};
  if (def.hinge !== undefined) {
    var h = def.hinge;
    if (!h || typeof h.name !== 'string' || !h.name) throw _propModelError(name + ': hinge needs a name');
    var axis = _pmVec(h.axis, 3, name + '.hinge.axis'), length = Math.sqrt(axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]);
    if (!(length > 1e-9)) throw _propModelError(name + ': hinge axis must be non-zero');
    part.hinge = {name: h.name, origin: _pmVec(h.origin, 3, name + '.hinge.origin'),
      axis: [axis[0] / length, axis[1] / length, axis[2] / length],
      min: _pmNumber(h.min, -Math.PI, name + '.hinge.min'), max: _pmNumber(h.max, Math.PI, name + '.hinge.max')};
    if (!(part.hinge.max >= part.hinge.min)) throw _propModelError(name + ': hinge max must be >= min');
  }
  Object.keys(def.anchors || {}).forEach(function(anchor) {
    if (anchorNames.indexOf(anchor) >= 0) throw _propModelError(name + ': duplicate anchor ' + anchor);
    anchorNames.push(anchor);
    part.anchors[anchor] = _pmVec(def.anchors[anchor], 3, name + '.anchors.' + anchor);
  });
  return part;
}

// Validates and freezes a model, then registers it in PROP_MODELS.
function definePropModel(def) {
  if (!def || typeof def !== 'object') throw _propModelError('a definition object is required');
  var key = def.key;
  if (typeof key !== 'string' || !/^[a-z][A-Za-z0-9]*$/.test(key)) throw _propModelError('invalid key ' + key);
  if (PROP_MODELS[key]) throw _propModelError('duplicate key ' + key);
  if (!Array.isArray(def.parts) || !def.parts.length) throw _propModelError(key + ': parts required');
  var family = def.family === undefined ? key : def.family;
  if (typeof family !== 'string' || !/^[a-z][A-Za-z0-9]*$/.test(family)) throw _propModelError(key + ': invalid family');
  var anchorNames = [], names = {};
  var parts = def.parts.map(function(p, i) {
    var part = _pmNormalizePart(p, i, anchorNames);
    if (names[part.name]) throw _propModelError(key + ': duplicate part ' + part.name);
    names[part.name] = true;
    return part;
  });
  var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], faceCount = 0;
  parts.forEach(function(part) {
    faceCount += part.faces.length;
    for (var k = 0; k < 3; k++) { min[k] = Math.min(min[k], part.bounds.min[k]); max[k] = Math.max(max[k], part.bounds.max[k]); }
  });
  var label = family.charAt(0).toUpperCase() + family.slice(1);
  var model = _pmDeepFreeze({key: key, family: family, parts: parts, bounds: {min: min, max: max},
    anchorNames: anchorNames, faceCount: faceCount,
    statKeys: {faces: 'mdl' + label + 'Faces', culled: 'mdl' + label + 'Culled', drawn: 'mdl' + label + 'Drawn',
      tested: 'mdl' + label + 'Tested'}});
  PROP_MODELS[key] = model;
  return model;
}

// ── Faces ──
function createModelFaceBuffer() { return {count: 0, faces: [], anchors: {}, parts: [], modelAnchors: {}}; }
function _pmFaceRecord() {
  return {vertices: [], material: '', role: '', tint: 'none', normal: {x: 0, y: 0, z: 1}, flags: null,
    alpha: 1, part: 0, partName: '', _pool: []};
}
function _pmRotate(p, a, o, c, s, out) {
  var x = p[0] - o[0], y = p[1] - o[1], z = p[2] - o[2];
  var d = (a[0] * x + a[1] * y + a[2] * z) * (1 - c);
  out[0] = o[0] + x * c + (a[1] * z - a[2] * y) * s + a[0] * d;
  out[1] = o[1] + y * c + (a[2] * x - a[0] * z) * s + a[1] * d;
  out[2] = o[2] + z * c + (a[0] * y - a[1] * x) * s + a[2] * d;
  return out;
}
var _pmPoint = [0, 0, 0], _pmNormal = [0, 0, 0], _pmZero = [0, 0, 0];

// Writes world faces into `out` (reused records) and returns their count.
// instance: {x, y, z, basis | yaw, scale, joints: {hingeName: angle},
// tints: {tintRole: packed rgb}, cave}.
function buildModelFaces(model, inst, out) {
  out = out || createModelFaceBuffer();
  out.count = 0;
  if (!model || !model.parts || !inst) return 0;
  // Anchors live in one reused map per model, so out.anchors holds exactly
  // this model's names; the next build of the same model overwrites them.
  var anchorMaps = out.modelAnchors || (out.modelAnchors = {});
  out.anchors = anchorMaps[model.key] || (anchorMaps[model.key] = {});
  var basis = _pmInstanceBasis(inst);
  var RX = basis.rightX, RY = basis.rightY, OX = basis.outX, OY = basis.outY;
  var reverse = RX * OY - RY * OX < 0;
  var scale = inst.scale > 0 ? inst.scale : 1, ox = inst.x, oy = inst.y, oz = Number.isFinite(inst.z) ? inst.z : 0;
  var count = 0;
  for (var pi = 0; pi < model.parts.length; pi++) {
    var part = model.parts[pi], hinge = part.hinge, angle = 0;
    if (hinge && inst.joints && Number.isFinite(inst.joints[hinge.name]))
      angle = Math.max(hinge.min, Math.min(hinge.max, inst.joints[hinge.name]));
    var hc = Math.cos(angle), hs = Math.sin(angle);
    var bounds = out.parts[pi] || (out.parts[pi] = {minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0});
    bounds.minX = bounds.minY = bounds.minZ = Infinity; bounds.maxX = bounds.maxY = bounds.maxZ = -Infinity;
    for (var fi = 0; fi < part.faces.length; fi++) {
      var src = part.faces[fi], n = src.points.length;
      var rec = out.faces[count] || (out.faces[count] = _pmFaceRecord());
      rec.vertices.length = 0;
      for (var k = 0; k < n; k++) {
        var j = reverse && k ? n - k : k;
        var p = angle ? _pmRotate(src.points[j], hinge.axis, hinge.origin, hc, hs, _pmPoint) : src.points[j], uv = src.uv[j];
        var v = rec._pool[k] || (rec._pool[k] = {x: 0, y: 0, z: 0, u: 0, v: 0});
        v.x = ox + (p[0] * RX + p[1] * OX) * scale;
        v.y = oy + (p[0] * RY + p[1] * OY) * scale;
        v.z = oz + p[2] * scale;
        v.u = uv[0]; v.v = uv[1];
        rec.vertices.push(v);
        if (v.x < bounds.minX) bounds.minX = v.x; if (v.x > bounds.maxX) bounds.maxX = v.x;
        if (v.y < bounds.minY) bounds.minY = v.y; if (v.y > bounds.maxY) bounds.maxY = v.y;
        if (v.z < bounds.minZ) bounds.minZ = v.z; if (v.z > bounds.maxZ) bounds.maxZ = v.z;
      }
      var nl = src.normal;
      if (angle) nl = _pmRotate(nl, hinge.axis, _pmZero, hc, hs, _pmNormal);
      rec.normal.x = nl[0] * RX + nl[1] * OX; rec.normal.y = nl[0] * RY + nl[1] * OY; rec.normal.z = nl[2];
      rec.material = part.material; rec.role = src.role; rec.tint = part.tint; rec.flags = part.flags;
      rec.alpha = part.alpha; rec.part = pi; rec.partName = part.name;
      count++;
    }
    for (var anchor in part.anchors) {
      var ap = angle ? _pmRotate(part.anchors[anchor], hinge.axis, hinge.origin, hc, hs, _pmPoint) : part.anchors[anchor];
      var target = out.anchors[anchor] || (out.anchors[anchor] = {x: 0, y: 0, z: 0});
      target.x = ox + (ap[0] * RX + ap[1] * OX) * scale;
      target.y = oy + (ap[0] * RY + ap[1] * OY) * scale;
      target.z = oz + ap[2] * scale;
    }
  }
  out.count = count;
  return count;
}

// ── Lighting (matches 12-render-core-walls.js renderFace) ──
// Exact on axis faces: the squared components select one production shade.
// Downward faces get no sun, so they take the surface ambient.
function worldFaceShade(nx, ny, nz) {
  var sx = nx * nx, sy = ny * ny, sz = nz * nz, total = sx + sy + sz;
  if (!(total > 0)) return renderSurfaceAmbient;
  var shade = sx * (nx >= 0 ? renderSurfaceWallShadeE : renderSurfaceWallShadeW) +
    sy * (ny >= 0 ? renderSurfaceWallShadeS : renderSurfaceWallShadeN) +
    sz * (nz >= 0 ? renderSurfaceTopShade : renderSurfaceAmbient);
  return total === 1 ? shade : shade / total;
}
function worldFaceLight(wx, wy) {
  if (typeof _lightGrid === 'undefined' || !_lightGrid) return 0;
  var lgx = Math.floor(wx / _lightCellSize), lgy = Math.floor(wy / _lightCellSize);
  if (lgx >= 0 && lgx < _lightGridW && lgy >= 0 && lgy < _lightGridH) return _lightGrid[lgy * _lightGridW + lgx];
  return 0;
}
function worldFaceFog(dist, inCave) {
  var floor = inCave && typeof renderCaveFogFloor !== 'undefined' ? renderCaveFogFloor :
    (typeof renderSurfaceFogFloor !== 'undefined' ? renderSurfaceFogFloor : fogFloor);
  return Math.max(floor, 1.0 - dist * 0.0008);
}
function worldFaceFadeAlpha(dist) {
  var fadeStart = viewDist * 0.82, fadeRange = viewDist - fadeStart;
  if (!(dist > fadeStart)) return 1;
  var alpha = Math.max(0, 1.0 - (dist - fadeStart) / fadeRange);
  return alpha * alpha;
}
// Lit multiplier as the wall renderer applies it: side faces clamp
// shade + light to 1 (renderFace), up-facing faces add the light to
// renderSurfaceTopShade unclamped (the wall top pass), and downward faces
// clamp like sides. Sloped normals blend the two by squared components.
function worldFaceLitShade(nx, ny, nz, light) {
  var side = nx * nx + ny * ny, vert = nz * nz, total = side + vert;
  if (!(total > 0)) return Math.min(1.0, renderSurfaceAmbient + light);
  var lit = 0;
  if (side > 0) lit += side * Math.min(1.0, worldFaceShade(nx, ny, 0) + light);
  if (vert > 0) lit += vert * (nz > 0 ? renderSurfaceTopShade + light : Math.min(1.0, renderSurfaceAmbient + light));
  return total === 1 ? lit : lit / total;
}
// Packed RGB of a lit face. Cave faces use the interior roles as walls do:
// up-facing is floor, down-facing is ceiling, the rest are walls, and faces
// running east-west (normal along y) are 0.94 quieter.
function worldFaceColor(packed, nx, ny, nz, wx, wy, fog, inCave, emissive) {
  var light = emissive ? 0 : worldFaceLight(wx, wy);
  if (inCave && !emissive) {
    var role = nz > 0.7 ? CAVE_SURFACE_FLOOR : nz < -0.7 ? CAVE_SURFACE_CEILING : CAVE_SURFACE_WALL;
    var ambient = typeof getCaveRenderLightAt === 'function' ? getCaveRenderLightAt(wx, wy, true) : renderSurfaceAmbient;
    if (role === CAVE_SURFACE_WALL) {
      var sx = nx * nx, sy = ny * ny;
      ambient *= (sx + sy * 0.94) / (sx + sy);
    }
    return shadeCaveSurfaceColor(packed, role, ambient, light, fog);
  }
  var total = emissive ? 1 : worldFaceLitShade(nx, ny, nz, light);
  var warmR = light > 0.05 ? 1.0 + light * 0.3 : 1.0, warmB = light > 0.05 ? 1.0 - light * 0.2 : 1.0;
  var r = Math.max(0, Math.min(255, Math.floor(((packed >>> 16) & 255) * total * fog * warmR)));
  var g = Math.max(0, Math.min(255, Math.floor(((packed >>> 8) & 255) * total * fog)));
  var b = Math.max(0, Math.min(255, Math.floor((packed & 255) * total * fog * warmB)));
  return (r << 16) | (g << 8) | b;
}

// ── Drawing ──
function _pmFillTranslucent() { traceSceneDepthPolygon(_pmTranslucentPoints); ctx.fill(); }
// Smallest camera depth over a part's world bounds. Depth is linear, so a
// bounds corner attains it, and rounding is monotonic, so no vertex projects
// shallower. A camera inside the bounds gives a depth <= 0.
function _pmNearDepth(b, camX, camY, cosA, sinA) {
  return ((cosA >= 0 ? b.minX : b.maxX) - camX) * cosA + ((sinA >= 0 ? b.minY : b.maxY) - camY) * sinA;
}

// ── Early reject (integration stage K: modelEarlyReject; exact, kept for bisecting) ──
// Model-local bounds holding every face at any joint angle: a part's own
// bounds, or for a hinged part the cube round its hinge origin whose half
// size is its farthest vertex from that origin. Cached per model object.
var _pmReachBoundsCache = null, _pmRejectedKeys = Object.create(null);
function modelReachBounds(model) {
  if (!_pmReachBoundsCache && typeof WeakMap === 'function') _pmReachBoundsCache = new WeakMap();
  var cached = _pmReachBoundsCache ? _pmReachBoundsCache.get(model) : null;
  if (cached) return cached;
  var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  model.parts.forEach(function(part) {
    var lo = part.bounds.min, hi = part.bounds.max;
    if (part.hinge) {
      var o = part.hinge.origin, reach = 0;
      part.faces.forEach(function(face) {
        face.points.forEach(function(p) { reach = Math.max(reach, Math.hypot(p[0] - o[0], p[1] - o[1], p[2] - o[2])); });
      });
      lo = [o[0] - reach, o[1] - reach, o[2] - reach]; hi = [o[0] + reach, o[1] + reach, o[2] + reach];
    }
    for (var k = 0; k < 3; k++) { min[k] = Math.min(min[k], lo[k]); max[k] = Math.max(max[k], hi[k]); }
  });
  var bounds = {min: min, max: max};
  if (_pmReachBoundsCache) _pmReachBoundsCache.set(model, bounds);
  return bounds;
}
// Read-only: true when no face of the instance can pass the scene-depth
// test. Depth is linear, so a corner of the transformed reach box attains
// the nearest depth of any face point, and (all corners in front of the near
// plane, so no face is clipped) every face projects inside the corners'
// screen box. If at every pixel centre that box can reach (plus one pixel)
// even a fragment at that nearest depth fails withSceneDepthClip's test at
// the opaque fill's bias 0.15 (translucent parts use the same default), no
// face can draw or write depth. Fail-open: a corner nearer than 1.001, a
// non-finite corner or no scene-depth buffer keeps the full draw.
function modelHiddenByDepth(inst, model, C) {
  if (typeof _sceneDepthInv === 'undefined' || !_sceneDepthW || !_sceneDepthH) return false;
  var rb = modelReachBounds(model), b = _pmInstanceBasis(inst);
  var scale = inst.scale > 0 ? inst.scale : 1, ox = inst.x, oy = inst.y, oz = Number.isFinite(inst.z) ? inst.z : 0;
  var near = Infinity, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (var c = 0; c < 8; c++) {
    var r = c & 1 ? rb.max[0] : rb.min[0], o = c & 2 ? rb.max[1] : rb.min[1], z = c & 4 ? rb.max[2] : rb.min[2];
    var dx = ox + (r * b.rightX + o * b.outX) * scale - cam.x, dy = oy + (r * b.rightY + o * b.outY) * scale - cam.y;
    var depth = dx * C.cosAng + dy * C.sinAng;
    if (!(depth >= 1.001) || !Number.isFinite(depth)) return false;
    var sx = ((-dx * C.sinAng + dy * C.cosAng) / depth * C.invTanHalf * 0.5 + 0.5) * C.w;
    var sy = C.horizonY + (C.cameraZ - (oz + z * scale)) / depth * projScale;
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return false;
    if (depth < near) near = depth;
    if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
  }
  var x0 = Math.max(0, Math.floor(minX) - 1), x1 = Math.min(_sceneDepthW - 1, Math.ceil(maxX) + 1);
  var y0 = Math.max(0, Math.floor(minY) - 1), y1 = Math.min(_sceneDepthH - 1, Math.ceil(maxY) + 1);
  // Largest inverse depth any face fragment can have, with slack for the
  // rasterizer's incremental interpolation.
  var inv = (1 / near) * (1 + 1e-6), bias = 0.15, depthInv = _sceneDepthInv;
  for (var y = y0; y <= y1; y++) {
    for (var x = x0, i = y * _sceneDepthW + x0; x <= x1; x++, i++) {
      var existing = depthInv[i];
      if (inv * (1 + existing * bias) + 1e-9 >= existing) return false;
    }
  }
  return true;
}
function _pmRejectedStatKey(model) {
  return _pmRejectedKeys[model.key] || (_pmRejectedKeys[model.key] = model.statKeys.faces.replace(/Faces$/, 'Rejected'));
}
// A rejected model still returns its anchors, as buildModelFaces writes them
// (the same per-model map and arithmetic), without building any face.
function modelAnchorsOnly(model, inst, out) {
  var maps = out.modelAnchors || (out.modelAnchors = {});
  var anchors = out.anchors = maps[model.key] || (maps[model.key] = {});
  var b = _pmInstanceBasis(inst), RX = b.rightX, RY = b.rightY, OX = b.outX, OY = b.outY;
  var scale = inst.scale > 0 ? inst.scale : 1, ox = inst.x, oy = inst.y, oz = Number.isFinite(inst.z) ? inst.z : 0;
  out.count = 0;
  for (var pi = 0; pi < model.parts.length; pi++) {
    var part = model.parts[pi], hinge = part.hinge, angle = 0;
    if (hinge && inst.joints && Number.isFinite(inst.joints[hinge.name]))
      angle = Math.max(hinge.min, Math.min(hinge.max, inst.joints[hinge.name]));
    var hc = Math.cos(angle), hs = Math.sin(angle);
    for (var name in part.anchors) {
      var ap = angle ? _pmRotate(part.anchors[name], hinge.axis, hinge.origin, hc, hs, _pmPoint) : part.anchors[name];
      var t = anchors[name] || (anchors[name] = {x: 0, y: 0, z: 0});
      t.x = ox + (ap[0] * RX + ap[1] * OX) * scale;
      t.y = oy + (ap[0] * RY + ap[1] * OY) * scale;
      t.z = oz + ap[2] * scale;
    }
  }
  return anchors;
}
// phase: 'opaque' (default: every non-translucent part), 'overlay'
// (translucent parts only) or 'all'. Never call it inside a renderEntities3D
// bounds callback or another scene-depth clip. Returns the world anchors of
// this model only, as reused objects that the next draw of the same model
// overwrites (copy them to keep them); stats, when given, accumulates counters
// (faces, culled, drawn, hidden, clipped, and tested: pixels the depth test
// visited), and the model's family frame stats receive faces/culled/drawn/tested.
// With modelEarlyReject on, a model hidden everywhere (modelHiddenByDepth)
// builds no faces: it still returns its anchors, adds stats.rejected and the
// family's mdl<Family>Rejected, and leaves ctx and scene depth untouched.
function drawWorldModel(inst, model, C, phase, stats) {
  if (!inst || !model || !C) return null;
  var out = _propModelScratch || (_propModelScratch = createModelFaceBuffer());
  // Stage K: a model hidden everywhere its bounds project builds no faces.
  if (typeof renderFeatureOn === 'function' && renderFeatureOn('modelEarlyReject') && modelHiddenByDepth(inst, model, C)) {
    if (stats) stats.rejected = (stats.rejected || 0) + 1;
    if (typeof addRenderFrameStat === 'function') addRenderFrameStat(_pmRejectedStatKey(model), 1);
    return modelAnchorsOnly(model, inst, out);
  }
  var count = buildModelFaces(model, inst, out);
  var cull = typeof renderFeatureOn === 'function' && renderFeatureOn('modelBackfaceCull');
  var wantOpaque = phase !== 'overlay', wantOverlay = phase === 'overlay' || phase === 'all';
  // Stage L (propTextures, 12-world-textures.js): the opaque wood and stone
  // faces go through the textured sink; off, flat or absent: unchanged.
  var textured = wantOpaque && typeof beginWorldTexturePropPass === 'function' && beginWorldTexturePropPass(model, C);
  var surface = null;
  var camX = cam.x, camY = cam.y, camZ = C.cameraZ, inCave = !!inst.cave, tints = inst.tints;
  var baseAlpha = ctx.globalAlpha, alpha = baseAlpha;
  var faces = 0, culled = 0, drawn = 0, hidden = 0, clipped = 0, tested = 0;
  for (var i = 0; i < count; i++) {
    var f = out.faces[i], flags = f.flags;
    if (flags.translucent ? !wantOverlay : !wantOpaque) continue;
    faces++;
    var verts = f.vertices, v0 = verts[0], n = f.normal;
    // Exact: on a closed opaque part, a face turned away is covered by the
    // part's own front faces. That fails once projectSceneWorldPolygon clips
    // a front face at the depth-1 near plane, so a part whose bounds reach
    // it (camera inside included) is never culled. Translucent parts show
    // their back faces through the front ones, so they are never culled.
    if (cull && flags.closed && !flags.translucent &&
        _pmNearDepth(out.parts[f.part], camX, camY, C.cosAng, C.sinAng) >= 1 &&
        n.x * (camX - v0.x) + n.y * (camY - v0.y) + n.z * (camZ - v0.z) <= 0) { culled++; continue; }
    var projected = projectSceneWorldPolygon(verts, C);
    if (projected.length < 3) { clipped++; continue; }
    var cx = 0, cy = 0;
    for (var k = 0; k < verts.length; k++) { cx += verts[k].x; cy += verts[k].y; }
    cx /= verts.length; cy /= verts.length;
    var dist = Math.abs((cx - camX) * C.cosAng + (cy - camY) * C.sinAng);
    if (dist < 1) dist = 1;
    var packed = tints && f.tint !== 'none' && Number.isFinite(tints[f.tint]) ? tints[f.tint] :
      GAME_MATERIALS[f.material].packed[f.role];
    var lit = worldFaceColor(packed, n.x, n.y, n.z, cx, cy, worldFaceFog(dist, inCave), inCave, flags.emissive);
    var want = baseAlpha * worldFaceFadeAlpha(dist) * (flags.translucent ? f.alpha : 1);
    if (want !== alpha) { ctx.globalAlpha = want; alpha = want; }
    ctx.fillStyle = rgbQ((lit >>> 16) & 255, (lit >>> 8) & 255, lit & 255);
    var visible;
    if (flags.translucent) {
      _pmTranslucentPoints = projected;
      visible = withSceneDepthClip(projected, _pmFillTranslucent);
      _pmTranslucentPoints = null;
    } else if (textured && (surface = worldTexturePropSurface(f, model.parts[f.part], inst, i, packed, lit, dist, want))) {
      visible = fillSceneDepthTexturedPolygon(projected, surface);
    } else {
      visible = fillSceneDepthPolygon(projected);
    }
    // Pixels the depth test visited for this face (visible plus hidden).
    tested += _sceneDepthClipCount + _sceneDepthClipHidden;
    if (visible) drawn++; else hidden++;
  }
  if (alpha !== baseAlpha) ctx.globalAlpha = baseAlpha;
  if (textured) endWorldTexturePropPass();
  if (stats) {
    stats.faces = (stats.faces || 0) + faces; stats.culled = (stats.culled || 0) + culled;
    stats.drawn = (stats.drawn || 0) + drawn; stats.hidden = (stats.hidden || 0) + hidden;
    stats.clipped = (stats.clipped || 0) + clipped; stats.tested = (stats.tested || 0) + tested;
  }
  if (typeof addRenderFrameStat === 'function') {
    addRenderFrameStat(model.statKeys.faces, faces);
    addRenderFrameStat(model.statKeys.culled, culled);
    addRenderFrameStat(model.statKeys.drawn, drawn);
    addRenderFrameStat(model.statKeys.tested, tested);
  }
  return out.anchors;
}

// World position of one named anchor without building faces (hinges apply),
// for overlay passes that did not draw the opaque parts this call.
function modelAnchorWorld(model, inst, name, out) {
  if (!model || !model.parts || !inst) return null;
  for (var pi = 0; pi < model.parts.length; pi++) {
    var part = model.parts[pi];
    if (!Object.prototype.hasOwnProperty.call(part.anchors, name)) continue;
    var ap = part.anchors[name], hinge = part.hinge;
    if (hinge && inst.joints && Number.isFinite(inst.joints[hinge.name])) {
      var angle = Math.max(hinge.min, Math.min(hinge.max, inst.joints[hinge.name]));
      if (angle) ap = _pmRotate(ap, hinge.axis, hinge.origin, Math.cos(angle), Math.sin(angle), _pmPoint);
    }
    return modelLocalToWorld(inst, ap[0], ap[1], ap[2], out);
  }
  return null;
}

// ── Wall props (integration stage F) ──
// Authored at full size S = 35.2 = 32 x the lgWall tier (1.1), the
// attachment.size of a wall prop on an unclamped wall; an instance scales by
// attachment.size / S. Local frame (wallModelBasis, yaw atan2(ny, nx)): the
// origin is on the wall plane at the attachment, o points out of the wall, r
// runs along it and z is up from attachment.z (the sprite's centre). The
// point light stays at 0.5 out and 0.25 S up (attachment.flameZ), so the
// flame anchor sits at the shaft tip 2.2 out and 1.3 below it. Models are
// defined on first use (definePropModel needs GAME_MATERIALS). Seen from the
// front, +r is the viewer's left, so a sprite x offset maps to r = -x.
// Shields and banners have one model per heraldry family (variant % 3, as
// the sprite): the field colour and its charge (cross, chevron, roundel).
var WALL_PROP_MODEL_S = 35.2;
var WALL_PROP_HERALDRY = Object.freeze(['red', 'blue', 'purple']);
var WALL_PROP_MODEL_KEYS = Object.freeze({torch: 'wallTorch', sconce: 'wallSconce',
  shield: Object.freeze(['wallShieldRed', 'wallShieldBlue', 'wallShieldPurple']),
  banner: Object.freeze(['wallBannerRed', 'wallBannerBlue', 'wallBannerPurple'])});
var _wallPropModelFailed = Object.create(null), _wallPropCullRadius = Object.create(null);
var _wallPropInstanceScratch = null;
function _wallTorchModelDef(S) {
  var tip = 0.25 * S - 1.3, ref = tip - 0.01 * S, axis = 2.2;   // ref: the sprite's origin
  return {key: 'wallTorch', family: 'wallProp', parts: [
    // Iron backplate flush on the wall, 0.3 S x 0.46 S, 0.4 thick.
    {name: 'backplate', kind: 'box', min: [-0.15 * S, 0, ref - 0.33 * S], max: [0.15 * S, 0.4, ref + 0.13 * S],
      material: 'wallPropIron', role: 'shadow'},
    // Bracket from inside the plate out to the shaft axis, inside the lower band.
    {name: 'bracket', kind: 'box', min: [-0.05 * S, 0.3, ref - 0.225 * S], max: [0.05 * S, axis, ref - 0.185 * S],
      material: 'wallPropIron', role: 'base'},
    // Wall-parallel shaft tapering 0.23 S (tip) to 0.15 S over 0.83 S; charred top.
    {name: 'shaft', kind: 'frustum', center: [0, axis], z0: tip - 0.83 * S, z1: tip, bottom: [0.075 * S, 0.9], top: [0.115 * S, 1.4],
      material: 'wallPropWood', role: 'base', faceRoles: ['base', 'base', 'base', 'base', 'deep', 'base'],
      anchors: {flame: [0, axis, tip]}},
    // Two 0.28 S x 0.07 S retaining bands, 1.5 either side of the axis.
    {name: 'bandUpper', kind: 'box', min: [-0.14 * S, axis - 1.5, ref - 0.09 * S], max: [0.14 * S, axis + 1.5, ref - 0.02 * S],
      material: 'wallPropIron', role: 'deep'},
    {name: 'bandLower', kind: 'box', min: [-0.14 * S, axis - 1.5, ref - 0.24 * S], max: [0.14 * S, axis + 1.5, ref - 0.17 * S],
      material: 'wallPropIron', role: 'deep'}
  ]};
}
// Wall sconce: a backplate (the sprite's plate ellipse as an octagon), an
// arm along the normal and a six-sided bowl on its end, wider along the wall
// than out of it (the sprite's bowl is 0.5 S wide). The bowl's rim is 1.0
// below the light (0.5 out, attachment.flameZ = S / 6) and its axis 2.7 out,
// so the flame anchor at the rim centre is 2.4 from the light.
function _wallSconceModelDef(S) {
  var axis = 2.7, top = S / 6 - 1.0, bottom = top - 0.09 * S, plateZ = top - 0.16 * S, plate = [];
  for (var i = 0; i < 8; i++) {
    var a = (i + 0.5) * Math.PI / 4;
    plate.push([Math.cos(a) * 0.24 * S, plateZ + Math.sin(a) * 0.28 * S]);
  }
  return {key: 'wallSconce', family: 'wallProp', parts: [
    {name: 'backplate', kind: 'extrude', axis: 'o', profile: plate, from: 0, to: 0.4, material: 'wallPropIron', role: 'shadow',
      faceRoles: ['deep', 'deep', 'deep', 'deep', 'deep', 'deep', 'deep', 'deep', 'deep', 'shadow']},
    {name: 'arm', kind: 'box', min: [-0.03 * S, 0.3, bottom - 1.2], max: [0.03 * S, axis, bottom],
      material: 'wallPropIron', role: 'base'},
    {name: 'bowl', kind: 'prism', sides: 6, center: [0, axis], radius: [0.09 * S, 1.4], taper: 1.6, z0: bottom, z1: top,
      material: 'wallPropIron', role: 'deep', faceRoles: ['deep', 'deep', 'deep', 'deep', 'deep', 'deep', 'lit', 'shadow'],
      anchors: {flame: [0, axis, top]}}
  ]};
}
// The sprite outlines (07-decorations-lighting.js traceWallShieldPath and
// traceWallBannerCloth) as data at w = h = 1, x right and y down; quadratic
// segments are flattened at uniform t into WALL_PROP_CURVE_SEGMENTS chords.
var WALL_PROP_CURVE_SEGMENTS = 4;
var WALL_SHIELD_OUTLINE = Object.freeze([[-0.44, -0.42], [0, -0.58, 0.44, -0.42], [0.36, 0.12],
  [0.24, 0.42, 0, 0.58], [-0.24, 0.42, -0.36, 0.12]]);
var WALL_BANNER_CLOTH = Object.freeze([[-0.39, -0.34], [0.39, -0.34], [0.36, 0.42], [0, 0.28], [-0.36, 0.42]]);
function _wallPropFlatten(path) {
  var pts = [path[0].slice()];
  for (var i = 1; i < path.length; i++) {
    var p = path[i], last = pts[pts.length - 1];
    if (p.length === 2) { pts.push(p.slice()); continue; }
    for (var k = 1; k <= WALL_PROP_CURVE_SEGMENTS; k++) {
      var t = k / WALL_PROP_CURVE_SEGMENTS, u = 1 - t;
      pts.push([u * u * last[0] + 2 * u * t * p[0] + t * t * p[2], u * u * last[1] + 2 * u * t * p[1] + t * t * p[3]]);
    }
  }
  return pts;
}
// Sprite points (x, y) around (cx, cy) at scale k (of S) -> local (r, z).
function _wallPropProfile(points, S, k, cx, cy) {
  return points.map(function(p) { return [-(cx + p[0] * k) * S, -(cy + p[1] * k) * S]; });
}
// A flat polygon out o from the wall, wound so its normal points out (+o).
function _wallPropFace(profile, o) {
  var area = 0;
  for (var i = 0; i < profile.length; i++) {
    var a = profile[i], b = profile[(i + 1) % profile.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  var pts = profile.map(function(p) { return [p[0], o, p[1]]; });
  return area > 0 ? pts.reverse() : pts;
}
function _wallPropCircle(cx, cy, radius, sides) {
  var pts = [];
  for (var i = 0; i < sides; i++) pts.push([cx + Math.cos(i * Math.PI * 2 / sides) * radius, cy + Math.sin(i * Math.PI * 2 / sides) * radius]);
  return pts;
}
// Heraldic charges in sprite units (w = h = 1), as convex pieces: the cross's
// two bars, the chevron's two arms, or the roundel.
function _wallPropCharge(family, cross, chevron, roundel) {
  if (family === 0) return [[[-cross[0], cross[1]], [cross[0], cross[1]], [cross[0], cross[2]], [-cross[0], cross[2]]],
    [[-cross[3], cross[4]], [cross[3], cross[4]], [cross[3], cross[5]], [-cross[3], cross[5]]]];
  if (family === 1) return [[[-chevron[0], chevron[1]], [0, chevron[2]], [0, chevron[4]], [-chevron[0], chevron[3]]],
    [[0, chevron[2]], [chevron[0], chevron[1]], [chevron[0], chevron[3]], [0, chevron[4]]]];
  return [_wallPropCircle(0, roundel[0], roundel[1], 12)];
}
function _wallPropDecals(name, pieces, S, o, material, role) {
  return pieces.map(function(piece, i) {
    return {name: name + (pieces.length > 1 ? i : ''), kind: 'poly', vertices: _wallPropFace(_wallPropProfile(piece, S, 1, 0, 0), o),
      material: material, role: role, flags: {decal: true}};
  });
}
// Wall shield: the sprite's heater outline extruded 1.2 out of the wall
// (iron, lit face), the heraldic field (the outline at 0.79, 0.01 lower) and
// its gold charge as decals 0.1 proud of the face, drawn after it (the depth
// test lets a later face within 0.15 overpaint a nearer one), then a boss
// frustum (8 sides) standing 1.4 proud of the face.
function _wallShieldModelDef(S, family) {
  var outline = _wallPropFlatten(WALL_SHIELD_OUTLINE), face = 1.2, decal = face + 0.1, sides = [];
  for (var i = 0; i < outline.length; i++) sides.push('base');
  var parts = [
    {name: 'body', kind: 'extrude', axis: 'o', profile: _wallPropProfile(outline, S, 1, 0, 0), from: 0, to: face,
      material: 'wallPropIron', role: 'base', faceRoles: sides.concat(['shadow', 'lit'])},
    {name: 'field', kind: 'poly', vertices: _wallPropFace(_wallPropProfile(outline, S, 0.79, 0, 0.01), decal),
      material: 'wallHeraldry', role: WALL_PROP_HERALDRY[family], flags: {decal: true}}
  ].concat(_wallPropDecals('charge', _wallPropCharge(family, [0.055, -0.35, 0.33, 0.27, -0.07, 0.04],
    [0.25, -0.16, 0.12, -0.02, 0.27], [-0.03, 0.20]), S, decal, 'wallHeraldry', 'gold'));
  parts.push({name: 'boss', kind: 'prism', axis: 'o', sides: 8, rotation: Math.PI / 8, center: [0, 0.02 * S], radius: 0.09 * S,
    taper: 0.55, z0: face, z1: face + 1.4, material: 'wallPropIron', role: 'lit',
    faceRoles: ['lit', 'lit', 'lit', 'lit', 'lit', 'lit', 'lit', 'lit', 'edge', 'shadow']});
  return {key: WALL_PROP_MODEL_KEYS.shield[family], family: 'wallProp', parts: parts};
}
// Wall banner: a six-sided rod along the wall (the tangent) on a central
// hanger, a tapered finial at each end, and the sprite's swallowtail cloth as
// two convex halves 0.7 out, with its gold charge 0.1 proud of the cloth.
// The cloth stands 0.7 out, not 0.4: a farther torch's flame folds onto the
// plane 0.5 out (07 WALL_PROP_FLAME_FOLD_OUT) and passes the depth test up to
// 0.15 behind a surface, so a cloth inside 0.65 would be painted over by it.
function _wallBannerModelDef(S, family) {
  var rodO = 1.8, rodZ = 0.40 * S, cloth = 0.7, c = WALL_BANNER_CLOTH;
  // Split at x = 0 (the notch is not convex): the top edge's midpoint and
  // the notch point join the two halves.
  var left = [c[0], [0, c[0][1]], c[3], c[4]], right = [[0, c[1][1]], c[1], c[2], c[3]];
  var role = WALL_PROP_HERALDRY[family], charge = _wallPropCharge(family, [0.06, -0.22, 0.16, 0.22, -0.08, 0.02],
    [0.22, -0.13, 0.12, 0.01, 0.26], [-0.04, 0.17]);
  var parts = [
    {name: 'rod', kind: 'prism', axis: 'r', sides: 6, rotation: Math.PI / 6, center: [rodO, rodZ], radius: 0.04 * S,
      z0: -0.49 * S, z1: 0.49 * S, material: 'wallPropWood', role: 'shadow'},
    {name: 'hanger', kind: 'box', min: [-0.025 * S, 0, 0.33 * S], max: [0.025 * S, rodO, 0.47 * S], material: 'wallPropWood', role: 'shadow'},
    // Left and right as the viewer sees them (+r is the viewer's left).
    {name: 'finialRight', kind: 'prism', axis: 'r', sides: 6, rotation: Math.PI / 6, center: [rodO, rodZ], radius: [0.8, 0.035 * S],
      taper: 2, z0: -0.56 * S, z1: -0.46 * S, material: 'wallPropIron', role: 'lit'},
    {name: 'finialLeft', kind: 'prism', axis: 'r', sides: 6, rotation: Math.PI / 6, center: [rodO, rodZ], radius: [1.6, 0.07 * S],
      taper: 0.5, z0: 0.46 * S, z1: 0.56 * S, material: 'wallPropIron', role: 'lit'},
    {name: 'clothLeft', kind: 'quad', vertices: _wallPropFace(_wallPropProfile(left, S, 1, 0, 0), cloth), material: 'wallHeraldry', role: role},
    {name: 'clothRight', kind: 'quad', vertices: _wallPropFace(_wallPropProfile(right, S, 1, 0, 0), cloth), material: 'wallHeraldry', role: role}
  ].concat(_wallPropDecals('charge', charge, S, cloth + 0.1, 'wallHeraldry', 'goldLit'));
  if (family === 2) parts = parts.concat(_wallPropDecals('roundelCentre', [_wallPropCircle(0, -0.04, 0.07, 12)], S, cloth + 0.1, 'wallHeraldry', 'linen'));
  return {key: WALL_PROP_MODEL_KEYS.banner[family], family: 'wallProp', parts: parts};
}
var _WALL_PROP_MODEL_DEFS = {torch: _wallTorchModelDef, sconce: _wallSconceModelDef, shield: _wallShieldModelDef, banner: _wallBannerModelDef};
// The model key for a canonical wall decoration type and its variant
// (getWallDecorationVariant): shields and banners pick their heraldry family
// as variant % 3, like the sprite. Null for types without a model.
function wallPropModelKey(type, variant) {
  if (!Object.prototype.hasOwnProperty.call(WALL_PROP_MODEL_KEYS, type)) return null;
  var key = WALL_PROP_MODEL_KEYS[type];
  return typeof key === 'string' ? key : key[((variant >>> 0) || 0) % key.length];
}
// The model for a canonical wall decoration type, or null (sprite path).
// A definition that fails validation is reported once and keeps the sprite.
function wallPropModelFor(type, variant) {
  var key = wallPropModelKey(type, variant);
  if (!key) return null;
  if (PROP_MODELS[key]) return PROP_MODELS[key];
  if (_wallPropModelFailed[key] || typeof GAME_MATERIALS === 'undefined') return null;
  var model, keys = WALL_PROP_MODEL_KEYS[type];
  try {
    model = definePropModel(_WALL_PROP_MODEL_DEFS[type](WALL_PROP_MODEL_S, typeof keys === 'string' ? 0 : keys.indexOf(key)));
  } catch (e) {
    _wallPropModelFailed[key] = true;
    if (typeof console !== 'undefined' && console.error) console.error('[wall props] ' + key + ' model rejected; sprite kept: ' + (e && e.message));
    return null;
  }
  return model;
}
// World radius of the prop's horizontal bounding circle around its origin:
// the parts, or the flame billboard around its anchor. The billboard is
// 0.36 s screen px either side of the anchor (s = size / depth * projScale),
// which is 0.36 size * flameK world units at any depth, with flameK =
// projScale / (0.5 w invTanHalf). flameK follows the canvas aspect and FOV
// (portrait canvases exceed 2), so the caller passes the live value; 1 when
// omitted.
function wallPropCullRadius(model, attachment, flameK) {
  var c = _wallPropCullRadius[model.key];
  if (c === undefined) {
    var b = model.bounds, flame = -1;
    model.parts.forEach(function(part) {
      var f = part.anchors.flame;
      if (f) flame = Math.max(flame, Math.hypot(f[0], f[1]));
    });
    c = _wallPropCullRadius[model.key] = {flame: flame,
      parts: Math.hypot(Math.max(-b.min[0], b.max[0]), Math.max(-b.min[1], b.max[1]))};
  }
  var k = flameK > 0 && isFinite(flameK) ? flameK : 1;
  var radius = c.flame < 0 ? c.parts : Math.max(c.parts, c.flame + 0.36 * WALL_PROP_MODEL_S * k);
  return radius * attachment.size / WALL_PROP_MODEL_S;
}
// Instance at the attachment frame (reused object unless `out` is given).
function wallPropInstance(attachment, inCave, out) {
  out = out || _wallPropInstanceScratch || (_wallPropInstanceScratch = {x: 0, y: 0, z: 0, basis: {}, scale: 1, cave: false});
  out.x = attachment.x - attachment.nx * 0.5; out.y = attachment.y - attachment.ny * 0.5;
  out.z = attachment.z;
  out.basis = wallModelBasis(attachment.nx, attachment.ny, out.basis || {});
  out.scale = attachment.size / WALL_PROP_MODEL_S;
  out.cave = !!inCave;
  return out;
}

// ── Treasure chests (integration stage G) ──
// One model per CHEST_TIER_DEFS tier, material chest<Tier>. Local frame
// (chestModelBasis, yaw = facing): o is the lock side (the legacy fw), r
// the legacy rt, the origin the chest centre on its support; the legacy
// extents (half 7 x 5, body 8, lid 3). The body is open at the top: four
// closed wall slabs CHEST_MODEL_DIMS.wall thick (their inner faces in the
// dark interior role) round an interior floor. The lid is a closed box on
// the body top hinged at its back top edge (o = -5, z = 8, about +r): the
// joint 'lid' is lidAngle x CHEST_LID_MAX, so it opens 0..100 degrees and
// its front trim rides the same hinge. The trim band (0.38..0.55 of the
// body height) and the centre strap (+-0.15 of the half width) stand
// CHEST_MODEL_DIMS.proud out of the front; the lock plate (2.8 x 2.4,
// centred at 0.47) runs from the body to as much again out of the strap. The mouth over the opening is emissive
// and translucent, so it draws only in the overlay phase (the open chest's
// interior glow). Anchors on the body: glow (its centre), sparkle and label
// (the legacy sparkle and loot-text points). Defined on first use.
var CHEST_MODEL_KEYS = Object.freeze({common: 'chestCommon', uncommon: 'chestUncommon', rare: 'chestRare', epic: 'chestEpic'});
var CHEST_MODEL_DIMS = Object.freeze({hw: 7, hd: 5, bodyH: 8, lidH: 3, wall: 0.7, floor: 0.8, proud: 0.3, uvScale: 14});
var CHEST_LID_MAX = Math.PI * 100 / 180;
var _chestModelFailed = Object.create(null), _chestInstanceScratch = null;
function _chestModelDef(key) {
  var D = CHEST_MODEL_DIMS, W = D.hw, L = D.hd, H = D.bodyH, T = D.wall, P = D.proud, top = H + D.lidH;
  var lockZ = H * 0.47, hinge = {name: 'lid', origin: [0, -L, H], axis: [1, 0, 0], min: 0, max: CHEST_LID_MAX};
  // Box faces: -out, +right, +out, -right, top, bottom; `inner` is the one facing the interior.
  function wall(name, min, max, inner) {
    var roles = ['body', 'body', 'body', 'body', 'body', 'body'];
    roles[inner] = 'interior';
    return {name: name, kind: 'box', min: min, max: max, material: key, role: 'body', faceRoles: roles, uvScale: D.uvScale};
  }
  function box(name, min, max, role, extra) {
    var part = {name: name, kind: 'box', min: min, max: max, material: key, role: role, uvScale: D.uvScale};
    for (var k in extra) part[k] = extra[k];
    return part;
  }
  return {key: key, family: 'chest', parts: [
    wall('wallBack', [-W, -L, 0], [W, -L + T, H], 2),
    wall('wallFront', [-W, L - T, 0], [W, L, H], 0),
    wall('wallLeft', [-W, -L + T, 0], [-W + T, L - T, H], 1),
    wall('wallRight', [W - T, -L + T, 0], [W, L - T, H], 3),
    {name: 'floor', kind: 'quad', vertices: [[-W + T, -L + T, D.floor], [W - T, -L + T, D.floor], [W - T, L - T, D.floor], [-W + T, L - T, D.floor]],
      material: key, role: 'interior', uvScale: D.uvScale,
      anchors: {glow: [0, 0, H * 0.5], sparkle: [0, 0, top + 3], label: [0, 0, top + 8]}},
    box('lid', [-W, -L, H], [W, L, top], 'lid', {faceRoles: ['lid', 'lid', 'lid', 'lid', 'lid', 'interior'], hinge: hinge}),
    box('lidTrim', [-W, L, top - 0.8], [W, L + P, top], 'trim', {hinge: hinge}),
    box('trim', [-W, L, H * 0.38], [W, L + P, H * 0.55], 'trim'),
    box('strap', [-W * 0.15, L, 0], [W * 0.15, L + P, H], 'trim'),
    box('lock', [-1.4, L, lockZ - 1.2], [1.4, L + 2 * P, lockZ + 1.2], 'lock'),
    {name: 'mouth', kind: 'quad', vertices: [[-W + T, -L + T, H], [W - T, -L + T, H], [W - T, L - T, H], [-W + T, L - T, H]],
      material: key, role: 'glow', uvScale: D.uvScale, flags: {translucent: true, emissive: true}, alpha: 1}
  ]};
}
// The model for a chest tier (unknown tiers use common), or null when its
// definition was rejected (reported once; chestModelsReady is then false).
function chestModelFor(tier) {
  var key = CHEST_MODEL_KEYS[tier] || CHEST_MODEL_KEYS.common;
  if (PROP_MODELS[key]) return PROP_MODELS[key];
  if (_chestModelFailed[key] || typeof GAME_MATERIALS === 'undefined') return null;
  try {
    return definePropModel(_chestModelDef(key));
  } catch (e) {
    _chestModelFailed[key] = true;
    if (typeof console !== 'undefined' && console.error) console.error('[chests] ' + key + ' model rejected; legacy chest kept: ' + (e && e.message));
    return null;
  }
}
// True once every tier's model is defined (on first use). False when any
// was rejected: the caller then keeps the legacy path for every chest.
function chestModelsReady() {
  for (var tier in CHEST_MODEL_KEYS) if (!chestModelFor(tier)) return false;
  return true;
}
// Instance for a chest on its render support floorZ (reused unless `out`).
function chestModelInstance(ch, floorZ, out) {
  out = out || _chestInstanceScratch || (_chestInstanceScratch = {x: 0, y: 0, z: 0, basis: {}, scale: 1, joints: {lid: 0}, cave: false});
  out.x = ch.x; out.y = ch.y; out.z = floorZ;
  out.basis = chestModelBasis(ch, out.basis || {});
  out.scale = 1;
  var lid = Number.isFinite(ch.lidAngle) ? Math.max(0, Math.min(1, ch.lidAngle)) : 0;
  (out.joints || (out.joints = {})).lid = lid * CHEST_LID_MAX;
  out.cave = !!(ch.underground || ch.caveSpawnId);
  out.texOwner = ch;   // stage L: keys the prop texture hysteresis per chest
  return out;
}

// ── Spawner obelisk (integration stage H, spawnerModel) ──
// Sized to the projectile hit volume (10-projectile-queries.js: radius 25,
// height 90 above the feet): a square frustum from half-width 17.6 (corner
// radius 24.89 <= 25) to 11 at 72, the legacy trapezoid's proportions (0.3
// and 1.2 x 60 at lgStructure 1.5), capped by a pyramid to 90. Local frame:
// r and o across the square, z up from the render floor. Each side carries
// the legacy's three rune bands (at 0.2, 0.45 and 0.7 of the shaft; 0.9,
// 0.8 and 0.7 of the face's half-width there; 3.6 tall, the legacy stroke)
// as emissive decal strips 0.1 proud of the face, coloured by the instance
// tint 'rune' (the pulse). Anchors: glow (the legacy glow centre, 30 up),
// eye (0.65 of the shaft) and bar (4 above the apex); the eye, glow and HP
// bar stay billboards (07 draws them in the overlay phase). The yaw is
// stateless: propInstanceKey of the spawner's world cell and WORLD_SEED,
// within a quarter turn (the obelisk is square). Defined on first use.
var SPAWNER_MODEL_KEY = 'spawnerObelisk';
var SPAWNER_MODEL_DIMS = Object.freeze({base: 17.6, top: 11, shaftH: 72, apex: 90, rune: 3.6, proud: 0.1, uvScale: 24});
var SPAWNER_RUNE_BANDS = Object.freeze([Object.freeze([0.2, 0.9]), Object.freeze([0.45, 0.8]), Object.freeze([0.7, 0.7])]);
var _spawnerModelFailed = false, _spawnerInstanceScratch = null, _spawnerModelSalt = 0;
function _spawnerModelDef() {
  var D = SPAWNER_MODEL_DIMS, B = D.base, T = D.top, H = D.shaftH;
  var slope = Math.sqrt(H * H + (B - T) * (B - T)), nh = H / slope, nz = (B - T) / slope;
  // The frustum's side order (-out, +right, +out, -right): outward d, and t
  // along the face in its outward winding.
  var sides = [[0, -1, 1, 0], [1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1]];
  var parts = [{name: 'body', kind: 'frustum', z0: 0, z1: H, apex: D.apex, bottom: [B, B], top: [T, T],
    material: SPAWNER_MODEL_KEY, role: 'body', uvScale: D.uvScale,
    anchors: {glow: [0, 0, 30], eye: [0, 0, H * 0.65], bar: [0, 0, D.apex + 4]}}];
  SPAWNER_RUNE_BANDS.forEach(function (band, bi) {
    var zc = H * band[0], w = (B + (T - B) * zc / H) * band[1];
    sides.forEach(function (s, si) {
      var verts = [[-w, zc - D.rune / 2], [w, zc - D.rune / 2], [w, zc + D.rune / 2], [-w, zc + D.rune / 2]].map(function (p) {
        var reach = B + (T - B) * p[1] / H + D.proud * nh;
        return [s[0] * reach + s[2] * p[0], s[1] * reach + s[3] * p[0], p[1] + D.proud * nz];
      });
      parts.push({name: 'rune' + bi + '_' + si, kind: 'quad', vertices: verts, material: SPAWNER_MODEL_KEY, role: 'rune',
        tint: 'rune', uvScale: D.uvScale, flags: {emissive: true, decal: true}});
    });
  });
  return {key: SPAWNER_MODEL_KEY, family: 'spawner', parts: parts};
}
// The obelisk model, or null when its definition was rejected (reported
// once; every spawner then keeps the legacy path).
function spawnerModelFor() {
  if (PROP_MODELS[SPAWNER_MODEL_KEY]) return PROP_MODELS[SPAWNER_MODEL_KEY];
  if (_spawnerModelFailed || typeof GAME_MATERIALS === 'undefined') return null;
  try {
    return definePropModel(_spawnerModelDef());
  } catch (e) {
    _spawnerModelFailed = true;
    if (typeof console !== 'undefined' && console.error) console.error('[spawners] ' + SPAWNER_MODEL_KEY + ' model rejected; legacy obelisk kept: ' + (e && e.message));
    return null;
  }
}
function spawnerModelYaw(sp) {
  var size = typeof cell === 'number' && cell > 0 ? cell : 12;
  var endless = typeof ENDLESS_MODE !== 'undefined' && ENDLESS_MODE;
  var ox = endless && typeof windowOriginX === 'number' ? windowOriginX : 0;
  var oy = endless && typeof windowOriginY === 'number' ? windowOriginY : 0;
  if (!_spawnerModelSalt) _spawnerModelSalt = propTypeSalt(SPAWNER_MODEL_KEY);
  var key = propInstanceKey(_spawnerModelSalt, Math.floor((sp.x + ox) / size), Math.floor((sp.y + oy) / size),
    typeof WORLD_SEED === 'number' ? WORLD_SEED : 0);
  return key / 4294967296 * Math.PI * 0.5;
}
// The rune strips' colour at a pulse: the legacy rune stroke (alpha 0.8 x
// pulse over the body) as an opaque blend of the two albedos.
function spawnerRuneTint(pulse) {
  var m = GAME_MATERIALS[SPAWNER_MODEL_KEY].packed, a = m.body, b = m.rune;
  var k = Math.max(0, Math.min(1, 0.8 * (Number.isFinite(pulse) ? pulse : 1)));
  function mix(shift) { var x = (a >>> shift) & 255; return Math.round(x + (((b >>> shift) & 255) - x) * k); }
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}
// Instance for a spawner on its render support floorZ (reused unless `out`).
function spawnerModelInstance(sp, floorZ, pulse, out) {
  out = out || _spawnerInstanceScratch || (_spawnerInstanceScratch = {x: 0, y: 0, z: 0, basis: {}, scale: 1, tints: {rune: 0}, cave: false});
  out.x = sp.x; out.y = sp.y; out.z = floorZ;
  out.basis = modelBasis(spawnerModelYaw(sp), out.basis || {});
  out.scale = 1;
  (out.tints || (out.tints = {})).rune = spawnerRuneTint(pulse);
  out.cave = !!(sp.underground || sp.caveSpawnId);
  out.texOwner = sp;   // stage L: keys the prop texture hysteresis per spawner
  return out;
}
// True when the camera is inside the obelisk body or nearer to it than the
// farthest on-screen point of the depth-1 near plane. Spawners have no
// movement collision, so the player can walk in; there the near-plane clip
// opens the body and drawWorldModel (no back-face cull at the near plane)
// fills the view with its inside faces, hiding everything drawn later. 07
// draws such a spawner as the legacy billboard instead. The largest of the
// nine half-space distances (bottom, 4 sides, 4 cap faces) is a lower bound
// on the distance to the convex body, so false means the body is clear.
function spawnerCameraInReach(inst, C) {
  var D = SPAWNER_MODEL_DIMS, b = _pmInstanceBasis(inst), s = inst.scale > 0 ? inst.scale : 1;
  var B = D.base, T = D.top, H = D.shaftH, A = D.apex, dx = cam.x - inst.x, dy = cam.y - inst.y;
  var m = Math.max(Math.abs(dx * b.rightX + dy * b.rightY), Math.abs(dx * b.outX + dy * b.outY)) / s;
  var z = (C.cameraZ - (Number.isFinite(inst.z) ? inst.z : 0)) / s;
  var clear = s * Math.max(-z, (m * H + z * (B - T) - B * H) / Math.hypot(H, B - T),
    (m * (A - H) + z * T - T * A) / Math.hypot(A - H, T));
  var v = Math.max(Math.abs(C.horizonY), Math.abs(C.h - C.horizonY)) / projScale;
  return !(clear >= Math.sqrt(1 + 1 / (C.invTanHalf * C.invTanHalf) + v * v));
}
// Camera-depth range of the obelisk body seen through a screen rect (clipped
// to the screen): out.min/out.max, or Infinity/-Infinity when the rect does
// not overlap the body. Each of the body's nine faces is clipped to the
// rect's four side planes through the camera; a linear depth over the
// clipped convex body takes its extremes at those clipped faces' vertices.
// The runes lie within 0.1 of the body. 07 tests the eye and HP bar in
// front of the range's min and the glow behind its max.
var SPAWNER_BODY_FACES = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 8], [5, 6, 8], [6, 7, 8], [7, 4, 8], [3, 2, 1, 0]];
var _spawnerCorners = null, _spawnerClipA = null, _spawnerClipB = null, _spawnerPlanes = null;
function spawnerBodyDepthRange(inst, C, rect, out) {
  out = out || {};
  out.min = Infinity; out.max = -Infinity;
  var x0 = Math.max(0, rect.x), x1 = Math.min(C.w, rect.x + rect.width);
  var y0 = Math.max(0, rect.y), y1 = Math.min(C.h, rect.y + rect.height);
  if (!(x1 > x0) || !(y1 > y0)) return out;
  // Plane k keeps pl[k*3]*depth + pl[k*3+1]*right + pl[k*3+2]*up >= 0.
  var k = 2 / C.invTanHalf, pl = _spawnerPlanes || (_spawnerPlanes = new Float64Array(12));
  pl[0] = -(x0 / C.w - 0.5) * k; pl[1] = 1; pl[2] = 0;
  pl[3] = (x1 / C.w - 0.5) * k; pl[4] = -1; pl[5] = 0;
  pl[6] = -(C.horizonY - y1) / projScale; pl[7] = 0; pl[8] = 1;
  pl[9] = (C.horizonY - y0) / projScale; pl[10] = 0; pl[11] = -1;
  // Corners in camera space (depth, right, up): 4 base, 4 top, the apex.
  var D = SPAWNER_MODEL_DIMS, b = _pmInstanceBasis(inst), s = inst.scale > 0 ? inst.scale : 1;
  var P = _spawnerCorners || (_spawnerCorners = new Float64Array(27));
  var cosA = C.cosAng, sinA = C.sinAng, up0 = (Number.isFinite(inst.z) ? inst.z : 0) - C.cameraZ;
  for (var i = 0; i < 9; i++) {
    var hw = i < 4 ? D.base : i < 8 ? D.top : 0, q = i & 3;
    var r = q === 1 || q === 2 ? hw : -hw, o = q >= 2 ? hw : -hw;
    var dx = inst.x + (r * b.rightX + o * b.outX) * s - cam.x, dy = inst.y + (r * b.rightY + o * b.outY) * s - cam.y;
    P[i * 3] = dx * cosA + dy * sinA;
    P[i * 3 + 1] = -dx * sinA + dy * cosA;
    P[i * 3 + 2] = up0 + (i < 4 ? 0 : i < 8 ? D.shaftH : D.apex) * s;
  }
  var A = _spawnerClipA || (_spawnerClipA = new Float64Array(48)), Bf = _spawnerClipB || (_spawnerClipB = new Float64Array(48));
  for (var f = 0; f < SPAWNER_BODY_FACES.length; f++) {
    var face = SPAWNER_BODY_FACES[f], n = face.length, src = A, dst = Bf;
    for (var v = 0; v < n; v++) { src[v * 3] = P[face[v] * 3]; src[v * 3 + 1] = P[face[v] * 3 + 1]; src[v * 3 + 2] = P[face[v] * 3 + 2]; }
    for (var p = 0; p < 4 && n > 0; p++) {
      var cd = pl[p * 3], cr = pl[p * 3 + 1], cu = pl[p * 3 + 2], m = 0;
      var prev = n - 1, fPrev = cd * src[prev * 3] + cr * src[prev * 3 + 1] + cu * src[prev * 3 + 2];
      for (var c = 0; c < n; c++) {
        var fCur = cd * src[c * 3] + cr * src[c * 3 + 1] + cu * src[c * 3 + 2];
        if ((fPrev >= 0) !== (fCur >= 0)) {
          var t = fPrev / (fPrev - fCur);
          for (var e = 0; e < 3; e++) dst[m * 3 + e] = src[prev * 3 + e] + t * (src[c * 3 + e] - src[prev * 3 + e]);
          m++;
        }
        if (fCur >= 0) { dst[m * 3] = src[c * 3]; dst[m * 3 + 1] = src[c * 3 + 1]; dst[m * 3 + 2] = src[c * 3 + 2]; m++; }
        prev = c; fPrev = fCur;
      }
      n = m; var swap = src; src = dst; dst = swap;
    }
    for (var w = 0; w < n; w++) {
      if (src[w * 3] < out.min) out.min = src[w * 3];
      if (src[w * 3] > out.max) out.max = src[w * 3];
    }
  }
  return out;
}

// Runs drawFn with the drawRuinDecorFace capture sink installed.
function captureRuinDecorFaces(drawFn, sink) {
  var previous = _ruinDecorFaceSink;
  _ruinDecorFaceSink = sink;
  try { return drawFn(); } finally { _ruinDecorFaceSink = previous; }
}

// ── Landmark opaque pass (integration stage G2, landmarkOpaqueEarly) ──
// draw() runs drawLandmarkOpaque3D right after caveEntrance3D: the ruins'
// opaque faces and the structures' shells (the fogged far band, or the
// legacy shell without a model pass) write depth before sceneEntities and
// every billboard stage, so a farther shell never paints over a nearer
// sprite. The late ruins3D and structures3D stages (21-frame-loop.js,
// unchanged) call with no argument; landmarkLatePhase answers 'overlay' for
// a family whose opaque phase ran in this frame (once), so they draw only
// their labels, interactables, prompts and ring, depth-clipped. A family
// whose early call threw, or any call outside that frame, gets undefined:
// both phases, as before.
var _landmarkOpaquePass = {frame: -1, ruins: false, structures: false, stalls: false, shrines: false};
function landmarkOpaqueEarlyOn() {
  return typeof renderFeatureOn === 'function' && renderFeatureOn('landmarkOpaqueEarly');
}
function _landmarkOpaqueFrameStamp() {
  return typeof _renderFrameStats === 'object' && _renderFrameStats ? _renderFrameStats.frame : -1;
}
function drawLandmarkOpaque3D() {
  var pass = _landmarkOpaquePass;
  pass.ruins = pass.structures = pass.stalls = pass.shrines = false;
  pass.frame = _landmarkOpaqueFrameStamp();
  if (!landmarkOpaqueEarlyOn()) return;
  if (typeof drawRuins3D === 'function') { drawRuins3D('opaque'); pass.ruins = true; }
  if (typeof drawStructures3D === 'function') { drawStructures3D('opaque'); pass.structures = true; }
  // Stage J1 (landmarkModels): the market stall, guard tower and shrine
  // models; the late marketStalls3D and shrines3D stages then draw overlays.
  if (typeof landmarkModelsOn === 'function' && landmarkModelsOn()) {
    if (typeof drawMarketStalls3D === 'function') { drawMarketStalls3D('opaque'); pass.stalls = true; }
    if (typeof drawShrines3D === 'function') { drawShrines3D('opaque'); pass.shrines = true; }
  }
}
function landmarkLatePhase(family) {
  var pass = _landmarkOpaquePass;
  if (!pass[family] || pass.frame !== _landmarkOpaqueFrameStamp()) return undefined;
  pass[family] = false;
  return landmarkOpaqueEarlyOn() ? 'overlay' : undefined;
}

if (typeof defineRenderFeature === 'function') {
  defineRenderFeature({key: 'modelBackfaceCull', label: 'Model back-face cull', type: 'bool', default: true, legacy: false,
    title: 'Exact: skips faces of closed opaque model parts that face away from the camera. Kept for bisecting.'});
  defineRenderFeature({key: 'wallPropModels', label: 'Wall prop models', type: 'bool', default: true, legacy: false,
    title: 'Wall torches, sconces, shields and banners drawn as depth-correct models on their wall (flames stay billboards; lights unchanged).'});
  defineRenderFeature({key: 'chestModel', label: 'Chest model', type: 'bool', default: true, legacy: false,
    title: 'Treasure chests drawn as opaque, depth-writing models with a hinged lid (glow, sparkle and loot label stay billboards).'});
  defineRenderFeature({key: 'landmarkOpaqueEarly', label: 'Landmarks opaque first', type: 'bool', default: true, legacy: false,
    title: 'Ruin faces and structure shells draw before props and sprites (only their labels and prompts stay late, depth-clipped), so a farther landmark never paints over a nearer sprite.'});
  defineRenderFeature({key: 'spawnerModel', label: 'Spawner model', type: 'bool', default: true, legacy: false,
    title: 'Enemy spawners drawn as opaque, depth-writing obelisks sized to their hit volume, pulsing at their own phase (eye, glow and HP bar stay billboards).'});
  defineRenderFeature({key: 'modelEarlyReject', label: 'Model early reject', type: 'bool', default: true, legacy: false,
    title: 'Exact: a model whose bounds are hidden by nearer scene depth everywhere they project builds no faces. Kept for bisecting.'});
  defineRenderFeature({key: 'decorAnchorCache', label: 'Prop anchor cache', type: 'bool', default: true, legacy: false,
    title: 'Exact: scatter, wall decorations and ore reject by distance and view before any terrain query, and cache the terrain they stand on or hang from. Kept for bisecting.'});
}
// The Endless window copies carry pulsePhase only while spawnerModel is on
// (05-endless-world.js), so Legacy keeps its in-phase pulse; a switch or
// preset change re-syncs the current window's copies.
if (typeof onRenderFeaturesChange === 'function') {
  onRenderFeaturesChange(function (kind, detail) {
    if (typeof syncWindowSpawnerPulsePhases === 'function' &&
        (kind === 'preset' || String(detail).split(',').indexOf('spawnerModel') >= 0)) syncWindowSpawnerPulsePhases();
  });
}

// ── Floor props (integration stage I, floorPropModels) ──
// Volumetric models for the high-value floor-scatter types (I1: crate,
// barrel, boulder, stone_column, sand_pillar, mesa_boulder; I2: stalagmite,
// tree_stump, fallen_log, rock_spire, cave_rubble_pile, rock_arch). They are
// authored in the sprite's own unit s (paintFloorItem's `size`) and scaled
// per instance by floorPropScale(type) = FLOOR_PROP_UNIT x the type's size
// tier: at 360x240 (projScale 180) the sprite is 1500 x tierScale / fwd
// pixels, the projection of 8.33 x tierScale world units, so each model keeps
// its recipe's proportions of s. Local frame (modelBasis(yaw)): r and o
// across the footprint, z up from the base. Yaw and shape are stateless:
// propInstanceKey(propTypeSalt(type), rounded absolute x/y, stored seed),
// never the sprite's r0..r2 or seed x 2pi (integer Endless seeds would all
// face one way). The absolute position adds the Endless window origin, so
// the window slot an item lands in never changes it. Each type has
// FLOOR_PROP_SHAPES shapes (and the sprite's variant flag: the broken crate,
// the mossy boulder), all defined together on first use; a rejected
// definition keeps the whole type on the sprite path (reported once).
// Jittered hulls are closed triangle meshes (a jittered quad is not planar).
// The support is the lowest getEntityRenderFloorZ under the base outline
// and centre (floorPropSupportZ), and the base is sunk FLOOR_PROP_SINK below
// it, so no prop floats on a slope. 07-decorations-lighting.js draws them.
var FLOOR_PROP_UNIT = 1500 / 180;
var FLOOR_PROP_SHAPES = 8;
var FLOOR_PROP_SINK = 0.15;
var FLOOR_PROP_MIDPOINT_EDGE = 6;   // world units: a longer base edge also samples its midpoint
var FLOOR_PROP_TYPES = Object.freeze({
  crate: Object.freeze({name: 'Crate', alt: _floorPropBrokenCrate, build: _floorCrateDef}),
  barrel: Object.freeze({name: 'Barrel', alt: null, build: _floorBarrelDef}),
  boulder: Object.freeze({name: 'Boulder', alt: _floorPropMossyBoulder, build: _floorBoulderDef}),
  stone_column: Object.freeze({name: 'StoneColumn', alt: null, build: _floorStoneColumnDef}),
  sand_pillar: Object.freeze({name: 'SandPillar', alt: null, build: _floorSandPillarDef}),
  mesa_boulder: Object.freeze({name: 'MesaBoulder', alt: null, build: _floorMesaDef}),
  // I2: the remaining floor props (Tier-7 scatter such as rock_pile, skull
  // and crystal stays sprites).
  stalagmite: Object.freeze({name: 'Stalagmite', alt: null, build: _floorStalagmiteDef}),
  tree_stump: Object.freeze({name: 'TreeStump', alt: null, build: _floorTreeStumpDef}),
  fallen_log: Object.freeze({name: 'FallenLog', alt: null, build: _floorFallenLogDef}),
  rock_spire: Object.freeze({name: 'RockSpire', alt: null, build: _floorRockSpireDef}),
  cave_rubble_pile: Object.freeze({name: 'CaveRubblePile', alt: null, build: _floorRubblePileDef}),
  rock_arch: Object.freeze({name: 'RockArch', alt: null, build: _floorRockArchDef})
});
var _floorPropTables = Object.create(null), _floorPropFailed = Object.create(null), _floorPropSalts = Object.create(null);
var _floorPropProbe = null;
function _floorPropBrokenCrate(variant) { return variant === 2; }   // the sprite's broken corner
function _floorPropMossyBoulder(variant) { return variant > 0; }    // the sprite's moss patch
function _floorPropSaltOf(type) { return _floorPropSalts[type] || (_floorPropSalts[type] = propTypeSalt(type)); }
// Definition-time shape draws in [0, 1) for one type and shape (no RNG).
function _floorPropRandFor(type, shape) {
  var salt = _floorPropSaltOf(type);
  return function (i) { return propInstanceKey(salt, shape, i, 0x6d2b79f5) / 4294967296; };
}
function _floorPropBox(name, min, max, material, role, faceRoles) {
  var part = {name: name, kind: 'box', min: min, max: max, material: material, role: role, uvScale: 0.5};
  if (faceRoles) part.faceRoles = faceRoles;
  return part;
}
// Crate (mdPlant): the sprite's s x s square as a cube of side s (0.92-1.0 s
// tall by shape) with the sprite's bracing as a belt at 0.47-0.62 of the
// height and a strap over the top, both 0.03 s proud. The broken variant
// (sprite variant 2) loses a 0.32 s cube at one top corner, its cut faces
// interior. Box faces: -out, +right, +out, -right, top, bottom.
function _floorCrateDef(key, rand, alt) {
  var h = 0.92 + 0.08 * rand(0), P = 0.03, M = 'crateWood', B = 'base', I = 'interior', parts;
  var belt = _floorPropBox('belt', [-0.5 - P, -0.5 - P, 0.47 * h], [0.5 + P, 0.5 + P, 0.62 * h], M, 'bracing');
  if (!alt) {
    parts = [_floorPropBox('body', [-0.5, -0.5, 0], [0.5, 0.5, h], M, B), belt,
      _floorPropBox('strap', [-0.075, -0.5 - P, 0], [0.075, 0.5 + P, h + P], M, 'bracing')];
  } else {
    var c = 0.32;
    parts = [_floorPropBox('body', [-0.5, -0.5, 0], [0.5, 0.5, h - c], M, B, [B, B, B, B, I, B]),
      _floorPropBox('back', [-0.5, -0.5, h - c], [0.5 - c, 0.5, h], M, B, [B, I, B, B, B, B]),
      _floorPropBox('side', [0.5 - c, -0.5, h - c], [0.5, 0.5 - c, h], M, B, [B, B, I, B, B, B]), belt];
  }
  return {key: key, family: 'floorProp', parts: parts};
}
// Barrel (mdPlant): the sprite's ellipse (0.28 s half-width, 0.7 s tall) as
// an 8-sided stave body (0.66-0.74 s) with a lighter head, and the sprite's
// two iron bands as hoops 0.025 s proud at 0.17-0.25 and 0.75-0.83.
function _floorBarrelDef(key, rand) {
  var R = 0.28, H = 0.66 + 0.08 * rand(0), P = 0.025, rot = Math.PI / 8, B = 'base';
  function hoop(name, z0, z1) {
    return {name: name, kind: 'prism', sides: 8, radius: R + P, z0: z0 * H, z1: z1 * H, rotation: rot,
      material: 'floorPropIron', role: 'base', uvScale: 0.5};
  }
  return {key: key, family: 'floorProp', parts: [
    {name: 'body', kind: 'prism', sides: 8, radius: R, z0: 0, z1: H, rotation: rot, material: 'barrelWood', role: B,
      faceRoles: [B, B, B, B, B, B, B, B, 'head', B], uvScale: 0.5},
    hoop('hoopLow', 0.17, 0.25), hoop('hoopHigh', 0.75, 0.83)]};
}
// Boulder (lgPlant): the sprite's ellipse (R = 0.4-0.55 s, 2.2 R wide, 1.4 R
// tall) as a jittered hull: a 6-point base ring (0.9 R), a 6-point waist
// ring (1.1 R, turned half a step, near 0.45 of the height) and an apex at
// about 1.25 R, 22 triangles. The mossy variant (sprite variant > 0) greens
// two adjacent top triangles.
function _floorBoulderDef(key, rand, alt) {
  var R = 0.4 + 0.15 * rand(0), H = 1.25 * R * (0.9 + 0.15 * rand(1)), N = 6, verts = [], tris = [], roles = [], i;
  for (i = 0; i < N; i++) {
    var a = i * Math.PI * 2 / N + (rand(10 + i) - 0.5) * 0.24, r = 0.9 * R * (0.88 + 0.24 * rand(20 + i));
    verts.push([Math.cos(a) * r, Math.sin(a) * r, 0]);
  }
  for (i = 0; i < N; i++) {
    var b = (i + 0.5) * Math.PI * 2 / N + (rand(30 + i) - 0.5) * 0.24, q = 1.1 * R * (0.88 + 0.24 * rand(40 + i));
    verts.push([Math.cos(b) * q, Math.sin(b) * q, H * 0.45 * (0.85 + 0.3 * rand(50 + i))]);
  }
  verts.push([(rand(2) - 0.5) * 0.4 * R, (rand(3) - 0.5) * 0.4 * R, H]);
  var apex = 2 * N, moss = Math.floor(rand(4) * N);
  for (i = 0; i < N; i++) {
    var j = (i + 1) % N;
    tris.push([i, j, N + i], [N + i, j, N + j]); roles.push('base', 'base');
  }
  for (i = 0; i < N; i++) {
    tris.push([N + i, N + (i + 1) % N, apex]);
    roles.push(alt && (i === moss || i === (moss + 1) % N) ? 'moss' : 'base');
  }
  for (i = 1; i < N - 1; i++) { tris.push([0, i + 1, i]); roles.push('base'); }
  return {key: key, family: 'floorProp', parts: [{name: 'hull', kind: 'mesh', vertices: verts, triangles: tris,
    material: 'floorStone', role: 'base', faceRoles: roles, flags: {closed: true}, uvScale: 0.5}]};
}
// Stone column and sand pillar (lgPlant): the sprite's tapered trapezoid
// (half-width w at the base, taper x w at the top, height h) as a 6-sided
// tapered hull whose top corners sit up to 0.06 s low (the break) under an
// off-centre peak `rise` above h (the sprite's jagged cap), 22 triangles.
function _floorPillarDef(key, rand, material, sideRole, capRole, w, h, taper, rise) {
  var N = 6, verts = [], tris = [], roles = [], rot = rand(9) * Math.PI * 2 / N, i;
  for (i = 0; i < N; i++) {
    var a = rot + i * Math.PI * 2 / N, k = 0.94 + 0.12 * rand(10 + i);
    verts.push([Math.cos(a) * w * k, Math.sin(a) * w * k, 0]);
  }
  for (i = 0; i < N; i++) {
    var a2 = rot + i * Math.PI * 2 / N, k2 = 0.94 + 0.12 * rand(10 + i);
    verts.push([Math.cos(a2) * w * taper * k2, Math.sin(a2) * w * taper * k2, h - 0.06 * rand(20 + i)]);
  }
  var pa = rand(3) * Math.PI * 2, pd = 0.45 * w * taper;
  verts.push([Math.cos(pa) * pd, Math.sin(pa) * pd, h + rise]);
  var peak = 2 * N;
  for (i = 0; i < N; i++) {
    var j = (i + 1) % N;
    tris.push([i, j, N + j], [i, N + j, N + i]); roles.push(sideRole, sideRole);
  }
  for (i = 0; i < N; i++) { tris.push([N + i, N + (i + 1) % N, peak]); roles.push(capRole); }
  for (i = 1; i < N - 1; i++) { tris.push([0, i + 1, i]); roles.push(sideRole); }
  return {key: key, family: 'floorProp', parts: [{name: 'pillar', kind: 'mesh', vertices: verts, triangles: tris,
    material: material, role: sideRole, faceRoles: roles, flags: {closed: true}, uvScale: 0.5}]};
}
function _floorStoneColumnDef(key, rand) {
  return _floorPillarDef(key, rand, 'floorStone', 'column', 'broken',
    0.14 + 0.06 * rand(0), 0.8 + 0.6 * rand(1), 0.7, 0.15 * (0.6 + 0.4 * rand(2)));
}
function _floorSandPillarDef(key, rand) {
  return _floorPillarDef(key, rand, 'sandstone', 'base', 'cap',
    0.16 + 0.06 * rand(0), 0.75 + 0.5 * rand(1), 0.6, 0.1 * (0.6 + 0.4 * rand(2)));
}
// Mesa boulder (lgPlant): the sprite's three strata (half-width W = 0.45-0.6
// s, height 0.3-0.45 s: bottom to 0.4, middle to 0.75, a flat top) as three
// stacked frusta with shrinking footprints (1 -> 0.875, 0.825 -> 0.725, 0.7),
// 0.6-0.85 as deep as wide, the upper two shifted a little; 18 faces.
function _floorMesaDef(key, rand) {
  var W = 0.45 + 0.15 * rand(0), H = 0.3 + 0.15 * rand(1), d = 0.6 + 0.25 * rand(2);
  function layer(name, z0, z1, lo, hi, jr, jo) {
    return {name: name, kind: 'frustum', center: [jr * W, jo * W], z0: z0 * H, z1: z1 * H,
      bottom: [lo * W, lo * d * W], top: [hi * W, hi * d * W], material: 'mesaRock', role: name, uvScale: 0.5};
  }
  return {key: key, family: 'floorProp', parts: [
    layer('bottom', 0, 0.4, 1, 0.875, 0, 0),
    layer('middle', 0.4, 0.75, 0.825, 0.725, (rand(3) - 0.5) * 0.06, (rand(4) - 0.5) * 0.06),
    layer('top', 0.75, 1, 0.7, 0.7, (rand(5) - 0.5) * 0.04, (rand(6) - 0.5) * 0.04)]};
}
// The base outline of a model (its vertices at the lowest z) in angle order
// round the origin, with the midpoint of every edge longer than
// FLOOR_PROP_MIDPOINT_EDGE world units at `scale`: flat [r0, o0, r1, o1, ...].
function _floorPropFootprint(model, scale) {
  var pts = [], seen = Object.create(null), z0 = model.bounds.min[2], out = [];
  model.parts.forEach(function (part) {
    part.faces.forEach(function (face) {
      face.points.forEach(function (p) {
        var key = Math.round(p[0] * 1e6) + ',' + Math.round(p[1] * 1e6);
        if (Math.abs(p[2] - z0) > 1e-9 || seen[key]) return;
        seen[key] = true; pts.push([p[0], p[1]]);
      });
    });
  });
  pts.sort(function (a, b) { return Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]); });
  for (var i = 0; i < pts.length; i++) {
    var a = pts[i], b = pts[(i + 1) % pts.length];
    out.push(a[0], a[1]);
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) * scale > FLOOR_PROP_MIDPOINT_EDGE) out.push((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  return Object.freeze(out);
}
// Largest horizontal distance of any vertex from the origin (model units).
function _floorPropReach(model) {
  var reach = 0;
  model.parts.forEach(function (part) {
    part.faces.forEach(function (face) { face.points.forEach(function (p) { reach = Math.max(reach, Math.hypot(p[0], p[1])); }); });
  });
  return reach;
}
function floorPropScale(type) {
  var tier = typeof FLOOR_ITEM_TIER !== 'undefined' && FLOOR_ITEM_TIER[type] || 'medium';
  return FLOOR_PROP_UNIT * (typeof getScale3D === 'function' ? getScale3D(tier) : 1);
}
// True once every shape of the type's models is defined (on first use).
// False for a type without models or whose definitions were rejected
// (reported once): its items stay on the sprite path.
function floorPropTypeReady(type) {
  if (_floorPropTables[type]) return true;
  if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(FLOOR_PROP_TYPES, type) ||
      _floorPropFailed[type] || typeof GAME_MATERIALS === 'undefined') return false;
  var spec = FLOOR_PROP_TYPES[type];
  try {
    var scale = floorPropScale(type), table = {models: [[], []], footprints: [[], []], reach: [[], []]};
    for (var alt = 0; alt < 2; alt++) {
      for (var k = 0; k < FLOOR_PROP_SHAPES; k++) {
        if (alt && !spec.alt) {
          table.models[1][k] = table.models[0][k]; table.footprints[1][k] = table.footprints[0][k]; table.reach[1][k] = table.reach[0][k];
          continue;
        }
        var key = 'floorProp' + spec.name + (alt ? 'Alt' : '') + k;
        var model = PROP_MODELS[key] || definePropModel(spec.build(key, _floorPropRandFor(type, k), !!alt));
        table.models[alt][k] = model;
        table.footprints[alt][k] = _floorPropFootprint(model, scale);
        table.reach[alt][k] = _floorPropReach(model);
      }
    }
    _floorPropTables[type] = table;
    return true;
  } catch (e) {
    _floorPropFailed[type] = true;
    if (typeof console !== 'undefined' && console.error) console.error('[floor props] ' + type + ' models rejected; sprites kept: ' + (e && e.message));
    return false;
  }
}
function floorPropSeedKey(seed) {
  if (typeof seed !== 'number' || !Number.isFinite(seed)) return 0;
  return Number.isInteger(seed) ? seed | 0 : Math.floor(seed * 4294967296) | 0;
}
// An item's stateless key: its type salt, rounded absolute x/y (the Endless
// window origin added back) and stored seed.
function floorPropKey(item) {
  var inWindow = typeof ENDLESS_MODE !== 'undefined' && ENDLESS_MODE;
  var wx = inWindow && typeof windowOriginX === 'number' ? windowOriginX : 0;
  var wy = inWindow && typeof windowOriginY === 'number' ? windowOriginY : 0;
  return propInstanceKey(_floorPropSaltOf(item.type), Math.round(item.x + wx), Math.round(item.y + wy), floorPropSeedKey(item.seed));
}
// Pose of a floor-scatter item for drawWorldModel: its model (shape and
// variant flag), yaw basis, scale, cave flag, base outline and horizontal
// reach (world units). z stays NaN until the caller sets the support.
// Written into `out` (a new object without one); null when the type has no
// ready model.
function floorPropPose(item, out) {
  if (!item || !floorPropTypeReady(item.type)) return null;
  var spec = FLOOR_PROP_TYPES[item.type], table = _floorPropTables[item.type], key = floorPropKey(item);
  var yaw = (key & 0xffffff) / 16777216 * Math.PI * 2;
  var shape = Math.floor((key >>> 24) * FLOOR_PROP_SHAPES / 256), alt = spec.alt && spec.alt(item.variant) ? 1 : 0;
  out = out || {};
  out.x = item.x; out.y = item.y; out.z = NaN; out.yaw = yaw;
  out.basis = modelBasis(yaw, out.basis || {});
  out.scale = floorPropScale(item.type); out.cave = !!(item.underground || item.caveSpawnId);
  out.model = table.models[alt][shape]; out.footprint = table.footprints[alt][shape];
  out.reach = table.reach[alt][shape] * out.scale; out.shape = shape; out.alt = alt;
  return out;
}
// The support under a posed item: its own renderFloorZ when it carries one,
// otherwise the lowest getEntityRenderFloorZ at the centre and under every
// base-outline point (a sample without support is ignored); NaN when the
// centre has no support.
function floorPropSupportZ(item, pose) {
  if (typeof item.renderFloorZ === 'number' && Number.isFinite(item.renderFloorZ)) return item.renderFloorZ;
  var z = getEntityRenderFloorZ(item);
  if (!Number.isFinite(z)) return NaN;
  var probe = _floorPropProbe || (_floorPropProbe = {x: 0, y: 0, feetZ: undefined, underground: false, caveSpawnId: 0});
  probe.feetZ = item.feetZ; probe.underground = item.underground; probe.caveSpawnId = item.caveSpawnId;
  var fp = pose.footprint, b = pose.basis, s = pose.scale;
  for (var i = 0; i < fp.length; i += 2) {
    probe.x = item.x + (fp[i] * b.rightX + fp[i + 1] * b.outX) * s;
    probe.y = item.y + (fp[i] * b.rightY + fp[i + 1] * b.outY) * s;
    var zz = getEntityRenderFloorZ(probe);
    if (zz < z) z = zz;
  }
  return z;
}

// ── Floor props, I2 types (stalagmite, tree_stump, fallen_log, rock_spire,
// cave_rubble_pile, rock_arch) ──
// Same builder contract as the I1 types: (key, rand, alt), proportions of s
// from the paintFloorItem recipe, one closed model per shape.
// A closed triangle-mesh part wound outward (by its signed volume).
function _floorPropSolid(name, verts, tris, material, role) {
  var volume = 0;
  tris.forEach(function (t) {
    var a = verts[t[0]], b = verts[t[1]], c = verts[t[2]];
    volume += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  });
  if (volume < 0) tris = tris.map(function (t) { return [t[0], t[2], t[1]]; });
  return {name: name, kind: 'mesh', vertices: verts, triangles: tris, material: material, role: role, flags: {closed: true}, uvScale: 0.5};
}
// Stalagmite (mdPlant): the sprite's tapered trapezoid (half-width 0.12-0.2
// s at the base, 0.3 of it at the top, 0.9-1.4 s tall) as the pillar hull
// with a blunt off-centre tip: the top ring 0-0.06 s under h, the tip `rise`
// above it, so h + rise is the sprite's height. 22 triangles.
function _floorStalagmiteDef(key, rand) {
  var rise = 0.12 * (0.6 + 0.4 * rand(2));
  return _floorPillarDef(key, rand, 'caveRock', 'stalagmite', 'stalagmite', 0.12 + 0.08 * rand(0), 0.9 + 0.5 * rand(1) - rise, 0.3, rise);
}
// Tree stump (lgPlant): the sprite's trunk (half-width W = 0.2-0.28 s, 0.85
// W at the top, 0.2-0.3 s tall) as an 8-sided tapered prism with bark sides
// and a cut top, and three root wedges (the sprite's tendrils, floorPropWood
// deep) from inside the trunk out to 1.3-1.45 W on the ground. 22 faces.
function _floorStumpRoot(name, a, W, H, reach) {
  function at(angle, r, z) { return [Math.cos(angle) * r, Math.sin(angle) * r, z]; }
  return _floorPropSolid(name, [at(a - 0.3, 0.75 * W, 0), at(a + 0.3, 0.75 * W, 0), at(a, reach, 0), at(a, 0.8 * W, 0.35 * H)],
    [[0, 1, 2], [0, 2, 3], [2, 1, 3], [1, 0, 3]], 'floorPropWood', 'deep');
}
function _floorTreeStumpDef(key, rand) {
  var W = 0.2 + 0.08 * rand(0), H = 0.2 + 0.1 * rand(1), B = 'shadow', a0 = rand(3) * Math.PI * 2;
  var parts = [{name: 'trunk', kind: 'prism', sides: 8, radius: W, taper: 0.85, z0: 0, z1: H, rotation: rand(2) * Math.PI / 4,
    material: 'floorPropWood', role: B, faceRoles: [B, B, B, B, B, B, B, B, 'cut', B], uvScale: 0.5}];
  for (var k = 0; k < 3; k++)
    parts.push(_floorStumpRoot('root' + k, a0 + k * Math.PI * 2 / 3 + (rand(10 + k) - 0.5) * 0.6, W, H, W * (1.3 + 0.15 * rand(20 + k))));
  return {key: key, family: 'floorProp', parts: parts};
}
// Fallen log (lgPlant): the sprite's trunk (half-length L = 0.5-0.7 s,
// radius R = 0.12-0.16 s, a cut end) as an 8-sided prism along r lying on a
// flat bottom face, narrowing to 0.85-0.95 R at the +r end with the bottom
// kept flat (so the footprint spans the whole length for the minimum
// support), bark sides and both ends cut. 10 faces.
function _floorFallenLogDef(key, rand) {
  var L = 0.5 + 0.2 * rand(0), R = 0.12 + 0.04 * rand(1), taper = 0.85 + 0.1 * rand(2), zc = R * Math.cos(Math.PI / 8), B = 'shadow';
  return {key: key, family: 'floorProp', parts: [{name: 'log', kind: 'prism', axis: 'r', sides: 8, rotation: Math.PI / 8,
    center: [0, zc], radius: R, taper: taper, shift: [0, -zc * (1 - taper)], z0: -L, z1: L,
    material: 'floorPropWood', role: B, faceRoles: [B, B, B, B, B, B, B, B, 'cut', 'cut'], uvScale: 0.5}]};
}
// Rock spire (lgPlant): the sprite's two or three thin spires (half-width
// 0.07-0.12 s, 0.2 of it at the top, 0.5-1.2 s tall, 0.22 s apart across r
// with a shared +-0.05 s jitter) in its three swatches, as closed 5-sided
// tapered prisms, each up to 0.06 s off the row and leaning a quarter of
// its base half-width. 7 faces per spire.
function _floorRockSpireDef(key, rand) {
  var count = 2 + Math.floor(rand(0) * 2), jitter = (rand(1) - 0.5) * 0.1, roles = ['spire', 'spireLit', 'spireDark'], parts = [];
  for (var k = 0; k < count; k++) {
    var w = 0.07 + 0.05 * rand(10 + k), lean = rand(30 + k) * Math.PI * 2;
    parts.push({name: 'spire' + k, kind: 'prism', sides: 5, rotation: rand(40 + k) * Math.PI * 2 / 5,
      center: [(k - count * 0.5 + 0.5) * 0.22 + jitter, (rand(50 + k) - 0.5) * 0.12], radius: w, taper: 0.2,
      shift: [Math.cos(lean) * 0.25 * w, Math.sin(lean) * 0.25 * w], z0: 0, z1: 0.5 + 0.7 * rand(20 + k),
      material: 'caveRock', role: roles[k % 3], uvScale: 0.5});
  }
  return {key: key, family: 'floorProp', parts: parts};
}
// Cave rubble pile (lgPlant): the sprite's mound (about 1.05 s wide, 0.4 s
// tall) as a jittered hull (a 6-point base ring at R = 0.5-0.56 s, a waist
// ring at 0.62 R about half way up, an off-centre apex at H = 0.34-0.42 s),
// 22 triangles, with three of its rocks (rotated 4-sided blocks 0.12-0.24 s
// across in the rubble swatches, centred 0.15-0.35 R out, inside the base
// ring) set into the slope: the base 0.04 s under the mound's surface at
// its lowest corner, the top 0.5-0.8 of its half-size above the surface at
// its centre. 40 faces.
function _floorHullTopZ(verts, tris, x, y) {
  var top = 0;
  for (var i = 0; i < tris.length; i++) {
    var p0 = verts[tris[i][0]], p1 = verts[tris[i][1]], p2 = verts[tris[i][2]];
    var d = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
    if (Math.abs(d) < 1e-12) continue;
    var a = ((x - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (y - p0[1])) / d;
    var b = ((p1[0] - p0[0]) * (y - p0[1]) - (x - p0[0]) * (p1[1] - p0[1])) / d;
    if (a >= 0 && b >= 0 && a + b <= 1) top = Math.max(top, p0[2] + a * (p1[2] - p0[2]) + b * (p2[2] - p0[2]));
  }
  return top;
}
function _floorRubblePileDef(key, rand) {
  var R = 0.5 + 0.06 * rand(0), H = 0.34 + 0.08 * rand(1), N = 6, rot = rand(2) * Math.PI * 2 / N, verts = [], tris = [], i;
  for (i = 0; i < N; i++) {
    var a = rot + i * Math.PI * 2 / N + (rand(10 + i) - 0.5) * 0.3, r = R * (0.88 + 0.24 * rand(20 + i));
    verts.push([Math.cos(a) * r, Math.sin(a) * r, 0]);
  }
  for (i = 0; i < N; i++) {
    var b = rot + (i + 0.5) * Math.PI * 2 / N + (rand(30 + i) - 0.5) * 0.3, q = 0.62 * R * (0.88 + 0.24 * rand(40 + i));
    verts.push([Math.cos(b) * q, Math.sin(b) * q, H * 0.5 * (0.85 + 0.3 * rand(50 + i))]);
  }
  verts.push([(rand(3) - 0.5) * 0.3 * R, (rand(4) - 0.5) * 0.3 * R, H]);
  for (i = 0; i < N; i++) tris.push([i, (i + 1) % N, N + i], [N + i, (i + 1) % N, N + (i + 1) % N]);
  for (i = 0; i < N; i++) tris.push([N + i, N + (i + 1) % N, 2 * N]);
  for (i = 1; i < N - 1; i++) tris.push([0, i + 1, i]);
  var parts = [_floorPropSolid('mound', verts, tris, 'caveRock', 'mound')], roles = ['rubble', 'rubbleLit', 'rubbleDark'];
  for (var k = 0; k < 3; k++) {
    var t = rot + k * Math.PI * 2 / 3 + (rand(60 + k) - 0.5) * 0.8, d = R * (0.15 + 0.2 * rand(70 + k)), cx = Math.cos(t) * d, cy = Math.sin(t) * d;
    var ra = 0.06 + 0.06 * rand(80 + k), rb = ra * (0.6 + 0.3 * rand(90 + k)), spin = rand(100 + k) * Math.PI, low = Infinity;
    for (i = 0; i < 4; i++) {
      var ca = spin + i * Math.PI / 2;
      low = Math.min(low, _floorHullTopZ(verts, tris, cx + Math.cos(ca) * ra, cy + Math.sin(ca) * rb));
    }
    parts.push({name: 'rock' + k, kind: 'prism', sides: 4, rotation: spin, center: [cx, cy], radius: [ra, rb], taper: 0.6,
      z0: Math.max(0.01, low - 0.04), z1: _floorHullTopZ(verts, tris, cx, cy) + ra * (0.5 + 0.3 * rand(110 + k)),
      material: 'caveRock', role: roles[k], uvScale: 0.5});
  }
  return {key: key, family: 'floorProp', parts: parts};
}
// Rock arch (lgPlant): the sprite's two pillars (0.16 s wide at +-0.55 s,
// 0.4 A tall, A = 0.5-0.8 s) as boxes 0.2-0.23 s deep, and its span (outer
// curve from (+-0.65 s, 0.4 A) with the control (0, A); inner curve from
// (+-0.61 s, 0.3 A) with the control (0, 0.75 A)) as a closed triangle mesh
// over three segments, 0.02 s shallower than the pillars. 40 faces.
function _floorRockArchDef(key, rand) {
  var A = 0.5 + 0.3 * rand(0), d = 0.08 + 0.03 * rand(1), D = d + 0.02, M = 3, verts = [], tris = [], i;
  function curve(end, endZ, controlZ, sideO) {
    for (var j = 0; j <= M; j++) {
      var t = j / M, u = 1 - t;
      verts.push([(t * t - u * u) * end, sideO, (u * u + t * t) * endZ + 2 * t * u * controlZ]);
    }
  }
  curve(0.65, 0.4 * A, A, -d); curve(0.65, 0.4 * A, A, d); curve(0.61, 0.3 * A, 0.75 * A, -d); curve(0.61, 0.3 * A, 0.75 * A, d);
  function of(j) { return j; } function ob(j) { return M + 1 + j; } function inf(j) { return 2 * (M + 1) + j; } function inb(j) { return 3 * (M + 1) + j; }
  function quad(a, b, c, e) { tris.push([a, b, c], [a, c, e]); }
  for (i = 0; i < M; i++) {
    quad(of(i), of(i + 1), inf(i + 1), inf(i));   // front cap
    quad(ob(i), inb(i), inb(i + 1), ob(i + 1));   // back cap
    quad(of(i), ob(i), ob(i + 1), of(i + 1));     // outer (top) strip
    quad(inf(i), inf(i + 1), inb(i + 1), inb(i)); // inner (underside) strip
  }
  quad(of(0), inf(0), inb(0), ob(0)); quad(of(M), ob(M), inb(M), inf(M));
  return {key: key, family: 'floorProp', parts: [
    _floorPropBox('pillarLeft', [-0.63, -D, 0], [-0.47, D, 0.4 * A], 'caveRock', 'arch'),
    _floorPropBox('pillarRight', [0.47, -D, 0], [0.63, D, 0.4 * A], 'caveRock', 'arch'),
    _floorPropSolid('span', verts, tris, 'caveRock', 'arch')]};
}

if (typeof defineRenderFeature === 'function') {
  defineRenderFeature({key: 'floorPropModels', label: 'Floor prop models', type: 'bool', default: true, legacy: false,
    title: 'Crates, barrels, boulders, stone columns, sand pillars, mesa boulders, stalagmites, tree stumps, fallen logs, rock spires, cave rubble piles and rock arches drawn as opaque, depth-writing models on the terrain under their footprint (other floor scatter stays sprites).'});
}

// ── Landmark models (integration stage J1, landmarkModels) ──
// Shrines, market stalls, the guard tower and the fortress keep's forge,
// lectern and garrison banner as world-face models standing on
// getEntityRenderFloorZ: the surface support, so a landmark above a cave
// sits on the surface, not on the lowest layer getFloorHeightAt answers.
// The draw paths sit next to the legacy painters in 15-render-hud-menu.js
// and keep the legacy gates (stage J2 replaces those); glows, labels and
// prompts stay billboards there, depth-clipped. Models are defined on first
// use; if any is rejected (reported once), every landmark keeps the legacy
// path. Local frames (modelBasis: o out, r right, z up from the support):
//  - shrine (yaw 0): the legacy 20 x 20 x 18 pedestal. The crystal is its
//    own model because it bobs: the legacy octahedron about the legacy
//    crystalZ (top 2c, bottom -c, equator 0.5c up with radius c = 7),
//    translucent and emissive, its faces alternating two tints (the legacy
//    buff colour and its dark shade).
//  - stall (yaw = facing: o is the legacy front, r its left): the table slab
//    over the whole STALL_W x STALL_D footprint (34 across, 18 along the
//    facing: repelFromStalls' collision box in 09-physics.js), two back legs
//    and two front poles inset 0.15 inside it up into the awning, and the
//    awning from 44 over the back edge down to 39 at 10 past the front (the
//    legacy droop and overhang) with the legacy dark stripe. The goods are
//    their own model, drawn within 200 u like the legacy goods: a crate, a
//    barrel and two wares boxes on the table (stall-local shapes; stage I's
//    crate and barrel models can replace them once merged).
//  - tower (yaw 0): the legacy 16 x 16 x TOWER_HEIGHT box (its top face is
//    the cap) and two 12-high merlons per side at the legacy 0.15 and 0.65
//    of each edge, 0.3 of it wide and 2 deep.
//  - keep props (yaw toward the fortress centre): a 10 x 10 platform with an
//    anvil (forge), a slanted rest and book (lectern), or a pole whose flag
//    swings about it (garrison, joint 'wave').
var LANDMARK_MODEL_KEYS = Object.freeze(['landmarkShrine', 'landmarkShrineCrystal', 'landmarkStall', 'landmarkStallGoods',
  'landmarkTower', 'landmarkForge', 'landmarkLectern', 'landmarkGarrison']);
var SHRINE_MODEL_DIMS = Object.freeze({half: 10, height: 18, crystal: 7, lift: 10, bob: 4, label: 30, prompt: 40, alpha: 0.85});
var STALL_MODEL_DIMS = Object.freeze({w: 34, d: 18, tableH: 18, slab: 2, awningH: 44, droop: 5, awningOut: 10, awningT: 1,
  leg: 1.6, pole: 2, inset: 0.15, goodsDist: 200});
var TOWER_MODEL_DIMS = Object.freeze({half: 8, merlonH: 12, merlonT: 2, merlonW: 0.3, merlonAt: Object.freeze([0.15, 0.65]), beacon: 50});
var KEEP_PROP_DIMS = Object.freeze({pad: 5, padH: 1.5, prompt: 28});
var _landmarkModelFailed = Object.create(null), _landmarkInstanceScratch = null, _landmarkAnchorScratch = null;
function _landmarkShrineDef() {
  var D = SHRINE_MODEL_DIMS, h = D.half, H = D.height;
  return {key: 'landmarkShrine', family: 'shrine', parts: [
    {name: 'pedestal', kind: 'box', min: [-h, -h, 0], max: [h, h, H], material: 'landmarkShrine', role: 'stone',
      faceRoles: ['stone', 'stone', 'stone', 'stone', 'top', 'stone'], uvScale: 20,
      anchors: {label: [0, 0, H + D.label], prompt: [0, 0, H + D.prompt]}}]};
}
function _landmarkShrineCrystalDef() {
  var c = SHRINE_MODEL_DIMS.crystal, e = c * 0.5;
  // 0 top, 1 bottom, then the equator +r, +o, -r, -o; every face winds outward.
  var v = [[0, 0, 2 * c], [0, 0, -c], [c, 0, e], [0, c, e], [-c, 0, e], [0, -c, e]];
  function half(name, tint, triangles, anchors) {
    var part = {name: name, kind: 'mesh', vertices: v, triangles: triangles, material: 'landmarkShrine', role: tint, tint: tint,
      uvScale: 14, flags: {translucent: true, emissive: true}, alpha: SHRINE_MODEL_DIMS.alpha};
    if (anchors) part.anchors = anchors;
    return part;
  }
  return {key: 'landmarkShrineCrystal', family: 'shrine', parts: [
    half('crystalLit', 'crystal', [[0, 2, 3], [0, 4, 5], [1, 4, 3], [1, 2, 5]], {glow: [0, 0, 2 * c]}),
    half('crystalDark', 'crystalDark', [[0, 3, 4], [0, 5, 2], [1, 3, 2], [1, 5, 4]])]};
}
function _landmarkStallDef() {
  var D = STALL_MODEL_DIMS, hw = D.w / 2, hd = D.d / 2, top = D.tableH, i = D.inset, M = 'landmarkStall';
  var run = D.d + D.awningOut, low = D.awningH - D.droop, s0 = D.awningOut / 2 - 1, s1 = D.awningOut / 2 + 1;
  function awningTop(o) { return D.awningH - D.droop * (o + hd) / run; }
  function box(name, min, max, role, extra) {
    var part = {name: name, kind: 'box', min: min, max: max, material: M, role: role, uvScale: 16};
    for (var k in extra) part[k] = extra[k];
    return part;
  }
  // Legs and poles end inside the awning slab (half its thickness down).
  var legTop = awningTop(-hd + i + D.leg) - D.awningT / 2, poleTop = awningTop(hd - i) - D.awningT / 2;
  return {key: 'landmarkStall', family: 'stall', parts: [
    box('slab', [-hw, -hd, top - D.slab], [hw, hd, top], 'table', {faceRoles: ['wood', 'wood', 'wood', 'wood', 'table', 'woodDark']}),
    box('legBackLeft', [-hw + i, -hd + i, 0], [-hw + i + D.leg, -hd + i + D.leg, legTop], 'woodDark'),
    box('legBackRight', [hw - i - D.leg, -hd + i, 0], [hw - i, -hd + i + D.leg, legTop], 'woodDark'),
    box('poleFrontLeft', [-hw + i, hd - i - D.pole, 0], [-hw + i + D.pole, hd - i, poleTop], 'wood'),
    box('poleFrontRight', [hw - i - D.pole, hd - i - D.pole, 0], [hw - i, hd - i, poleTop], 'wood'),
    {name: 'awning', kind: 'extrude', axis: 'r', from: -hw, to: hw, material: M, role: 'awning', tint: 'awning', uvScale: 24,
      profile: [[-hd, D.awningH], [hd + D.awningOut, low], [hd + D.awningOut, low - D.awningT], [-hd, D.awningH - D.awningT]]},
    {name: 'stripe', kind: 'quad', material: M, role: 'awningDark', tint: 'awningDark', uvScale: 24, flags: {decal: true},
      vertices: [[-hw, s0, awningTop(s0) + 0.05], [hw, s0, awningTop(s0) + 0.05], [hw, s1, awningTop(s1) + 0.05], [-hw, s1, awningTop(s1) + 0.05]]}]};
}
function _landmarkStallGoodsDef() {
  var top = STALL_MODEL_DIMS.tableH, M = 'landmarkStall';
  return {key: 'landmarkStallGoods', family: 'stall', parts: [
    {name: 'crate', kind: 'box', min: [-12, -2.5, top], max: [-7, 2.5, top + 5], material: 'crateWood', role: 'base',
      faceRoles: ['base', 'base', 'base', 'base', 'bracing', 'base'], uvScale: 10},
    {name: 'wares', kind: 'box', min: [-4.5, -2, top], max: [-0.5, 2, top + 3], material: M, role: 'goods', tint: 'goods', uvScale: 10},
    {name: 'barrel', kind: 'prism', sides: 8, center: [4.5, 0], radius: 2.4, z0: top, z1: top + 5.5, material: M, role: 'woodLit', uvScale: 10},
    {name: 'waresSmall', kind: 'box', min: [9, -2.5, top], max: [13, 1.5, top + 2.5], material: M, role: 'goods', tint: 'goods', uvScale: 10}]};
}
function _landmarkTowerDef() {
  var D = TOWER_MODEL_DIMS, h = D.half, H = typeof TOWER_HEIGHT === 'number' && TOWER_HEIGHT > 0 ? TOWER_HEIGHT : 80;
  var parts = [{name: 'body', kind: 'box', min: [-h, -h, 0], max: [h, h, H], material: 'landmarkTower', role: 'stone',
    faceRoles: ['stone', 'stone', 'stone', 'stone', 'top', 'stone'], uvScale: 24,
    anchors: {beacon: [0, 0, H], beaconTop: [0, 0, H + D.beacon]}}];
  // The legacy corner walk in world (x, y) about the marker; at yaw 0 the
  // local frame is r = y, o = x. Each merlon runs inward from its face.
  var corners = [[-h, -h], [h, -h], [h, h], [-h, h]];
  for (var k = 0; k < 4; k++) {
    var a = corners[k], b = corners[(k + 1) % 4], nx = Math.sign(a[0] + b[0]), ny = Math.sign(a[1] + b[1]);
    for (var m = 0; m < D.merlonAt.length; m++) {
      var xs = [], ys = [], ends = [D.merlonAt[m], D.merlonAt[m] + D.merlonW];
      for (var e = 0; e < 2; e++) {
        var px = a[0] + (b[0] - a[0]) * ends[e], py = a[1] + (b[1] - a[1]) * ends[e];
        xs.push(px, px - nx * D.merlonT); ys.push(py, py - ny * D.merlonT);
      }
      parts.push({name: 'merlon' + k + '_' + m, kind: 'box', material: 'landmarkTower', role: 'top', uvScale: 24,
        min: [Math.min.apply(null, ys), Math.min.apply(null, xs), H], max: [Math.max.apply(null, ys), Math.max.apply(null, xs), H + D.merlonH]});
    }
  }
  return {key: 'landmarkTower', family: 'tower', parts: parts};
}
function _keepPlatformPart() {
  var P = KEEP_PROP_DIMS.pad;
  return {name: 'platform', kind: 'box', min: [-P, -P, 0], max: [P, P, KEEP_PROP_DIMS.padH], material: 'landmarkKeep', role: 'platform', uvScale: 12};
}
function _keepPart(name, kind, fields, role, anchors) {
  var part = {name: name, kind: kind, material: 'landmarkKeep', role: role, uvScale: 12};
  for (var k in fields) part[k] = fields[k];
  if (anchors) part.anchors = anchors;
  return part;
}
function _landmarkForgeDef() {
  var z = KEEP_PROP_DIMS.padH;
  return {key: 'landmarkForge', family: 'keep', parts: [_keepPlatformPart(),
    _keepPart('anvilFoot', 'box', {min: [-3, -2, z], max: [3, 2, z + 4.5]}, 'iron'),
    _keepPart('anvilWaist', 'box', {min: [-1.8, -1.2, z + 4.5], max: [1.8, 1.2, z + 8.5]}, 'iron'),
    _keepPart('anvilFace', 'box', {min: [-5, -2.2, z + 8.5], max: [5, 2.2, z + 11.5]}, 'ironLit',
      {glow: [0, 0, z + 12], prompt: [0, 0, KEEP_PROP_DIMS.prompt]})]};
}
function _landmarkLecternDef() {
  var z = KEEP_PROP_DIMS.padH;
  // The rest slopes down toward the fortress centre (+o): z = 15.5 - 0.5 o.
  return {key: 'landmarkLectern', family: 'keep', parts: [_keepPlatformPart(),
    _keepPart('column', 'box', {min: [-1.2, -1.2, z], max: [1.2, 1.2, 13]}, 'stone'),
    _keepPart('rest', 'extrude', {axis: 'r', from: -4, to: 4, profile: [[-3, 13], [3, 13], [3, 14], [-3, 17]]}, 'stone'),
    _keepPart('book', 'extrude', {axis: 'r', from: -3.5, to: 3.5, profile: [[-2.5, 16.75], [2.5, 14.25], [2.5, 15.15], [-2.5, 17.65]]}, 'book',
      {glow: [0, 0, 17.5], prompt: [0, 0, KEEP_PROP_DIMS.prompt]})]};
}
function _landmarkGarrisonDef() {
  var z = KEEP_PROP_DIMS.padH;
  return {key: 'landmarkGarrison', family: 'keep', parts: [_keepPlatformPart(),
    _keepPart('pole', 'box', {min: [-0.8, -0.8, z], max: [0.8, 0.8, 26]}, 'pole', {prompt: [0, 0, KEEP_PROP_DIMS.prompt]}),
    _keepPart('finial', 'box', {min: [-1.2, -1.2, 26], max: [1.2, 1.2, 27.5]}, 'flag'),
    _keepPart('flag', 'box', {min: [0.8, -0.2, 12], max: [12.8, 0.2, 24],
      hinge: {name: 'wave', origin: [0, 0, 0], axis: [0, 0, 1], min: -0.6, max: 0.6}}, 'flag')]};
}
var _LANDMARK_MODEL_DEFS = {landmarkShrine: _landmarkShrineDef, landmarkShrineCrystal: _landmarkShrineCrystalDef,
  landmarkStall: _landmarkStallDef, landmarkStallGoods: _landmarkStallGoodsDef, landmarkTower: _landmarkTowerDef,
  landmarkForge: _landmarkForgeDef, landmarkLectern: _landmarkLecternDef, landmarkGarrison: _landmarkGarrisonDef};
// The model for a landmark key, or null when its definition was rejected
// (reported once; landmarkModelsReady is then false).
function landmarkModelFor(key) {
  if (PROP_MODELS[key]) return PROP_MODELS[key];
  if (_landmarkModelFailed[key] || typeof GAME_MATERIALS === 'undefined' || !_LANDMARK_MODEL_DEFS[key]) return null;
  try {
    return definePropModel(_LANDMARK_MODEL_DEFS[key]());
  } catch (e) {
    _landmarkModelFailed[key] = true;
    if (typeof console !== 'undefined' && console.error) console.error('[landmarks] ' + key + ' model rejected; legacy landmarks kept: ' + (e && e.message));
    return null;
  }
}
function landmarkModelsReady() {
  for (var i = 0; i < LANDMARK_MODEL_KEYS.length; i++) if (!landmarkModelFor(LANDMARK_MODEL_KEYS[i])) return false;
  return true;
}
// The switch the landmark painters read (typeof-guarded there).
function landmarkModelsOn() {
  return typeof renderFeatureOn === 'function' && renderFeatureOn('landmarkModels') && landmarkModelsReady();
}
// Instance at (x, y) on support z (one reused scratch unless `out`).
function landmarkModelInstance(x, y, z, yaw, out) {
  out = out || _landmarkInstanceScratch ||
    (_landmarkInstanceScratch = {x: 0, y: 0, z: 0, basis: {}, scale: 1, joints: {}, tints: {}, cave: false});
  out.x = x; out.y = y; out.z = z;
  out.basis = modelBasis(Number.isFinite(yaw) ? yaw : 0, out.basis || {});
  out.scale = 1; out.cave = false;
  if (!out.joints) out.joints = {};
  if (!out.tints) out.tints = {};
  return out;
}
function landmarkTint(hex, fallback) {
  return typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex) ? parseInt(hex.slice(1), 16) : fallback;
}
function shrineModelInstance(shr, floorZ, out) { return landmarkModelInstance(shr.x, shr.y, floorZ, 0, out); }
// The crystal centred on its (bobbing) crystalZ, tinted with the legacy
// crystal colour and its dark shade.
function shrineCrystalInstance(shr, crystalZ, lit, dark, out) {
  out = landmarkModelInstance(shr.x, shr.y, crystalZ, 0, out);
  var m = GAME_MATERIALS.landmarkShrine.packed;
  out.tints.crystal = landmarkTint(lit, m.crystal); out.tints.crystalDark = landmarkTint(dark, m.crystalDark);
  return out;
}
// A stall on its support, tinted with the legacy awning, stripe and goods colours.
function stallModelInstance(stall, floorZ, awning, awningDark, goods, out) {
  out = landmarkModelInstance(stall.x, stall.y, floorZ, stall.facing, out);
  var m = GAME_MATERIALS.landmarkStall.packed, t = out.tints;
  t.awning = landmarkTint(awning, m.awning); t.awningDark = landmarkTint(awningDark, m.awningDark); t.goods = landmarkTint(goods, m.goods);
  return out;
}
function towerModelInstance(marker, floorZ, out) { return landmarkModelInstance(marker.x, marker.y, floorZ, 0, out); }
function keepPropModelKey(type) {
  return type === 'forge' ? 'landmarkForge' : type === 'lectern' ? 'landmarkLectern' : 'landmarkGarrison';
}
// A keep prop ({type, ox, oy} from fortressInteractables3D) facing its
// fortress centre; the garrison flag swings with the legacy wave clock.
function keepPropInstance(st, item, floorZ, now, out) {
  var x = st.x + item.ox, y = st.y + item.oy;
  out = landmarkModelInstance(x, y, floorZ, Math.atan2(st.y - y, st.x - x), out);
  out.joints.wave = item.type === 'garrison' ? Math.sin((Number.isFinite(now) ? now : 0) * 0.005) * 0.25 : 0;
  return out;
}
// Nearest camera depth of the plan box |r| <= halfR, |o| <= halfO about an
// instance (depth is linear, so a corner attains it). Overlays tested there
// are never hidden by their own landmark, only by something nearer.
function landmarkNearDepth(inst, C, halfR, halfO) {
  var b = _pmInstanceBasis(inst), dx = inst.x - cam.x, dy = inst.y - cam.y;
  return dx * C.cosAng + dy * C.sinAng - halfR * Math.abs(b.rightX * C.cosAng + b.rightY * C.sinAng) -
    halfO * Math.abs(b.outX * C.cosAng + b.outY * C.sinAng);
}
// Screen point of a model anchor (hinges apply), or null behind the camera.
function landmarkAnchorScreen(model, inst, name, C) {
  var a = modelAnchorWorld(model, inst, name, _landmarkAnchorScratch || (_landmarkAnchorScratch = {x: 0, y: 0, z: 0}));
  return a ? projToScreen(a.x, a.y, a.z, C) : null;
}
// True when the camera is in the box |r|, |o| <= half, z0 <= z <= z1 about
// an instance, or nearer to it than the farthest on-screen point of the
// depth-1 near plane (see spawnerCameraInReach): the largest of the box's
// half-space distances is a lower bound on the distance to it.
function landmarkCameraInBox(inst, C, half, z0, z1) {
  var b = _pmInstanceBasis(inst), s = inst.scale > 0 ? inst.scale : 1, dx = cam.x - inst.x, dy = cam.y - inst.y;
  var m = Math.max(Math.abs(dx * b.rightX + dy * b.rightY), Math.abs(dx * b.outX + dy * b.outY)) / s;
  var z = (C.cameraZ - (Number.isFinite(inst.z) ? inst.z : 0)) / s;
  var clear = s * Math.max(m - half, z0 - z, z - z1);
  var v = Math.max(Math.abs(C.horizonY), Math.abs(C.h - C.horizonY)) / projScale;
  return !(clear >= Math.sqrt(1 + 1 / (C.invTanHalf * C.invTanHalf) + v * v));
}
// The shop stands at the guard tower, which has no movement collision, so
// the camera can be in it; 15 then keeps the legacy tower body.
function towerCameraInReach(inst, C) {
  var H = typeof TOWER_HEIGHT === 'number' && TOWER_HEIGHT > 0 ? TOWER_HEIGHT : 80;
  return landmarkCameraInBox(inst, C, TOWER_MODEL_DIMS.half, 0, H + TOWER_MODEL_DIMS.merlonH);
}
if (typeof defineRenderFeature === 'function') {
  defineRenderFeature({key: 'landmarkModels', label: 'Landmark models', type: 'bool', default: true, legacy: false,
    title: 'Shrines, market stalls, the guard tower and the fortress forge, lectern and banner drawn as depth-writing models on their surface support (glows, labels and prompts stay billboards, depth-clipped).'});
}

// ── Landmark bounds gate (integration stage J2, landmarkBoundsGate) ──
// Landmarks gate on their world bounds instead of their centre point: one is
// rejected only when its horizontal bounds radius r about its anchor lies
// wholly behind the depth-1 near plane (fwd + r < 1) or wholly out of range
// (dist - r > maxDist): entityVisible3D's worldRadius. Its faces are
// near-plane clipped world faces tested against scene depth, so the legacy
// centre-column, hill, below-floor and surface/underground tests go, and a
// camera past a landmark's centre still draws the part ahead of it; a centre
// behind the camera has no screen point (sx/sy NaN), so its anchored
// billboards and prompts do not draw. Callers (15-render-hud-menu.js,
// typeof-guarded):
//  - shrines (models path): renderEntities3D with sceneDepth + worldRadius;
//  - stalls and the guard tower (models path): their audited centre gates
//    stay; landmarkBoundsRescue re-asks only a centre behind the camera or
//    past range with the bounds, so a reintroduced column/hill gate (the
//    audit lab's _SHOP_ZERO probe) still rejects;
//  - structures: sceneDepth + worldRadius, the hill test only for bounds
//    wholly beyond viewDist (midpointBeyond), every overlay depth-clipped;
//  - ruins: worldRadius added to their scene-depth gate;
//  - cave portals: the bounds gate replaces the 900 u and fwd < 1 checks.
// The legacy landmark painters (landmarkModels off) keep their gates: they
// paint without a depth test, so the column gate is their only occlusion.
// Radii are horizontal, about the anchor (tests capture every authored face
// and check it lies inside): the shrine, stall and tower models' reach
// bounds (crystal and goods included); the structure shell of
// drawStructureShellWorld (fortress extent x sqrt 2, the arena ring and its
// gates, the watchtower's arm rooms); the ruin dressing (debris, waypost,
// hut beams); the portal's rock cut, frame, lintel and flanks.
function landmarkBoundsGateOn() {
  return typeof renderFeatureOn === 'function' && renderFeatureOn('landmarkBoundsGate');
}
var _landmarkPlanRadii = Object.create(null), _landmarkRuinRadii = Object.create(null);
// Largest horizontal distance from a landmark model's origin to its reach
// bounds (any yaw; 0 when the model is unavailable).
function landmarkModelPlanRadius(key) {
  if (_landmarkPlanRadii[key] >= 0) return _landmarkPlanRadii[key];
  var model = typeof landmarkModelFor === 'function' ? landmarkModelFor(key) : null;
  if (!model) return 0;
  var b = modelReachBounds(model), r = 0;
  for (var i = 0; i < 4; i++) r = Math.max(r, Math.hypot(i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1]));
  return (_landmarkPlanRadii[key] = r);
}
function landmarkShrineRadius() {
  return Math.max(landmarkModelPlanRadius('landmarkShrine'), landmarkModelPlanRadius('landmarkShrineCrystal'));
}
function landmarkStallRadius() {
  return Math.max(landmarkModelPlanRadius('landmarkStall'), landmarkModelPlanRadius('landmarkStallGoods'));
}
function landmarkTowerRadius() { return landmarkModelPlanRadius('landmarkTower'); }
// drawStructureShellWorld's extent (plus one cell for the standards).
function landmarkStructureRadius(st) {
  var s = st && st.scale || 1, c = typeof cell === 'number' && cell > 0 ? cell : 12;
  var chunk = typeof CHUNK_SIZE === 'number' && CHUNK_SIZE > 0 ? CHUNK_SIZE : c * 40;
  if (st && st.type === 'fortress') return chunk * 1.7 * s * Math.SQRT2 + c;
  if (st && st.type === 'arena') return Math.hypot(chunk * 1.1 * s + c * 0.5, c * 2.8) + c;
  return c * s * (3 + 14 + 2.5 * 1.08 * Math.SQRT2) + c;   // tower, arm length, arm room roof corner
}
// The ruin dressing of drawRuins3D: debris stones (a stone's corner is at
// most 1.21 x its size from its point), the waypost and its crosspiece, and
// the hut's two roof beams (41 u).
function landmarkRuinRadius(ru) {
  var type = ru && ru.ruinType;
  if (_landmarkRuinRadii[type] > 0) return _landmarkRuinRadii[type];
  var layouts = typeof RUIN_DEBRIS_LAYOUTS === 'object' && RUIN_DEBRIS_LAYOUTS ? RUIN_DEBRIS_LAYOUTS : null;
  if (!layouts || typeof getRuinPostWorld !== 'function') return 90;
  var layout = layouts[type] || layouts.hut, r = 0;
  for (var i = 0; i < layout.length; i++) r = Math.max(r, Math.hypot(layout[i][0], layout[i][1]) + layout[i][2] * 1.25);
  var post = getRuinPostWorld({x: 0, y: 0, ruinType: type, facing: 0}, {});
  r = Math.max(r, Math.hypot(post.x, post.y) + 9);
  if (type !== 'hall' && type !== 'tower_base') r = Math.max(r, 41);
  return (_landmarkRuinRadii[type] = r + 1);
}
// drawCaveEntrance3D's portal from its record: the rock cut (-3..16 along
// the walk axis), the frame, lintel and flanks across it.
function landmarkPortalRadius(ce) {
  var style = typeof ce.style === 'number' ? Math.max(0, Math.min(1, ce.style)) : 0.8;
  var pillar = 8 + style * 6, opening = Math.max(60, (ce.halfWidth || 45) * 2);
  var rockHalf = ce.halfWidth || 54, rockOuter = rockHalf + Math.min(48, Math.max(30, rockHalf * 0.7));
  var flank = Math.round((ce.halfWidth || 54) * (0.5 + style * 0.7));
  var across = Math.max(rockOuter, opening * 0.5 + pillar + 4 + style * 4, opening * 0.5 + pillar + flank);
  return Math.hypot(across, Math.max(16, pillar * 0.5 + 2)) + 1;
}
// A models-path landmark whose audited centre gate rejected it: re-asked
// with its bounds only when its centre is behind the camera or past range
// (the only rejections of a scene-depth centre gate), else null.
function landmarkBoundsRescue(x, y, z, C, maxDist, fadeFraction, r) {
  if (!landmarkBoundsGateOn() || !(r > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  var dx = x - cam.x, dy = y - cam.y;
  if (dx * C.cosAng + dy * C.sinAng >= 1 && Math.max(1, Math.hypot(dx, dy)) <= maxDist) return null;
  return entityVisible3D(x, y, z, C, {maxDist: maxDist, sceneDepth: true, fadeFraction: fadeFraction, worldRadius: r});
}
if (typeof defineRenderFeature === 'function') {
  defineRenderFeature({key: 'landmarkBoundsGate', label: 'Landmark bounds gate', type: 'bool', default: true, legacy: false,
    title: 'Shrines, stalls, the guard tower, structures, ruins and cave portals are culled by their world bounds (wholly behind the camera or out of range), not by their centre point; scene depth hides them behind nearer geometry.'});
}
