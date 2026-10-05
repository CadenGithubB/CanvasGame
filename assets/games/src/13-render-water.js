// Water surfaces for the water system (06-water.js). Lakes are drawn per
// floor square (the floor spans four height points): every square with a
// lake corner gets a surface at the lake level, and the scene depth test (the
// floor is already drawn and writes depth) cuts the shoreline exactly where
// land rises out of the water. A dry corner is lowered to the ground there if
// the ground is lower, so water never hangs over a drop; squares sharing one
// level merge into flat strips. Rivers are ribbons along their carved
// channels: level across, falling downstream, with edges that reach into the
// banks so the depth test draws a smooth waterline (but not out over lower
// ground, and not past the centre of a tight bend). Built once per solve;
// each frame only culls, sorts, projects and fills translucent through the
// scene-depth clip, after floors, walls and every opaque model part and
// before billboards and sprites (draw()'s water3D stage). Presentation
// only: no depth writes, no gameplay state, no RNG.
var WATER_RENDER_ENABLED = true;
var WATER_RIBBON_OVERLAP = 7;      // world units a river ribbon reaches past the waterline into its banks
var _waterTiles = [], _waterTilesMesh = null, _waterTilesBuild = -1, _waterVisible = [];
var waterRenderStats = {tiles: 0, lakeTiles: 0, riverTiles: 0, sheets: 0, drawn: 0, culled: 0, lastMs: 0};

// Walkable surface height at a terrain point, or NaN.
function _waterTerrainZ(mesh, v) {
  if (!mesh.layerCount || mesh.layerCount[v] < 1) return NaN;
  var t = mesh.l0Type[v];
  return t === 1 || t === 3 || t === 4 ? mesh.l0TopZ[v] : NaN;
}
// Rendered height of plain surface ground at a world point (the floor's own
// triangle split), or NaN where any corner is not plain surface. Reserved
// ground counts: water never stands on it, but a ribbon must not hang over it.
function _waterGroundAt(mesh, x, y) {
  var gs = mesh.gridSize, gx = Math.floor(x / gs), gy = Math.floor(y / gs), w = mesh.w;
  if (gx < 0 || gy < 0 || gx >= w - 1 || gy >= mesh.h - 1) return NaN;
  var i = gy * w + gx, z0 = _waterPlainGround(mesh, i), z1 = _waterPlainGround(mesh, i + 1),
    z2 = _waterPlainGround(mesh, i + w), z3 = _waterPlainGround(mesh, i + w + 1), u = x / gs - gx, v = y / gs - gy;
  return u >= v ? z0 + (z1 - z0) * u + (z3 - z1) * v : z0 + (z3 - z2) * u + (z2 - z0) * v;
}
// How far one side of a river ribbon reaches: past the channel edge into the
// bank by WATER_RIBBON_OVERLAP, but not out over ground clearly lower than
// the water (a neighbouring channel, the river's own next bend, a perched
// bank), where the strip would float.
function _waterRibbonReach(mesh, x, y, nx, ny, hw, surface) {
  for (var e = 0; e <= WATER_RIBBON_OVERLAP; e += 1.75) {
    var g = _waterGroundAt(mesh, x + nx * (hw + e), y + ny * (hw + e));
    if (g === g && g < surface - 0.08) return hw + Math.max(0, e - 1.75);
  }
  return hw + WATER_RIBBON_OVERLAP;
}
// A river's open end (its spring, a confluence, the window edge, or an end
// that drains into reserved ground) gets one more section straight on,
// covering the rounded end of its carved channel and reaching into the land
// past it as a side reaches into its bank (_waterRibbonReach), so the depth
// test draws the waterline there too. An end inside a lake needs none (the
// lake's own surface covers it), nor does the end of a river that ends in
// another river's water (river.joins; see buildWaterTiles).
function _waterRibbonCap(mesh, pts, q) {
  var p = pts[q], o = pts[q === 0 ? 1 : q - 1];
  if (!o || _waterLakeAt(mesh, p) >= 0) return null;
  var dx = p[0] - o[0], dy = p[1] - o[1], len = Math.hypot(dx, dy), hw = p[4];
  if (!(len > 0) || !(hw > 0)) return null;
  var reach = _waterRibbonReach(mesh, p[0], p[1], dx / len, dy / len, hw, p[2]);
  return [p[0] + dx / len * reach, p[1] + dy / len * reach, p[2], q === 0 ? p[3] - reach : p[3] + reach, hw];
}
// Signed curvature of a river centreline at point q (1 / radius; positive
// when the river turns toward its left, the ribbon's first side).
function _waterBend(pts, q) {
  if (q <= 0 || q >= pts.length - 1) return 0;
  var a = pts[q - 1], b = pts[q], c = pts[q + 1];
  var abx = b[0] - a[0], aby = b[1] - a[1], bcx = c[0] - b[0], bcy = c[1] - b[1], acx = c[0] - a[0], acy = c[1] - a[1];
  var denom = Math.hypot(abx, aby) * Math.hypot(bcx, bcy) * Math.hypot(acx, acy);
  return denom > 0 ? 2 * (abx * bcy - aby * bcx) / denom : 0;
}
function buildWaterTiles(mesh) {
  var tiles = [], gs = mesh.gridSize, w = mesh.w, h = mesh.h, lakes = 0, rivers = 0, sheets = 0;
  var v = [0, 0, 0, 0], cz = [0, 0, 0, 0];
  for (var y = 0; y < h - 1; y++) {
    var run = null;
    for (var x = 0; x < w - 1; x++) {
      // Corners in draw order: NW, NE, SE, SW (the floor's own corners).
      var i0 = y * w + x;
      v[0] = i0; v[1] = i0 + 1; v[2] = i0 + w + 1; v[3] = i0 + w;
      var wet = 0, sum = 0, level = null, flat = true, depth = 0, flowCell = -1, lakeCell = -1, k;
      for (k = 0; k < 4; k++) {
        var vi = v[k];
        if (mesh.water[vi] !== WATER_KIND.still) continue;   // rivers draw as ribbons
        var surf = mesh.waterSurface[vi];
        wet++; sum += surf; depth = Math.max(depth, mesh.waterDepth[vi]);
        if (level === null) level = surf; else if (surf !== level) flat = false;
        if (lakeCell < 0) lakeCell = vi;
      }
      if (!wet) { run = null; continue; }
      var avg = sum / wet;
      for (k = 0; k < 4; k++) {
        var vk = v[k];
        if (mesh.water[vk] === WATER_KIND.still) { cz[k] = mesh.waterSurface[vk]; continue; }
        var ground = _waterTerrainZ(mesh, vk);
        cz[k] = ground === ground ? Math.min(avg, ground) : avg;
        if (cz[k] < avg - 1e-6) flat = false;
      }
      if (flat && level !== null) {
        if (run && run.level === level && run.x1 === x * gs) {
          run.x1 = (x + 1) * gs; run.cx = (run.x0 + run.x1) * 0.5; run.depth = Math.max(run.depth, depth);
          continue;
        }
        var z = level * 25;
        run = {kind: 1, x0: x * gs, y0: y * gs, x1: (x + 1) * gs, y1: (y + 1) * gs, z: [z, z, z, z],
          cx: (x + 0.5) * gs, cy: (y + 0.5) * gs, depth: depth, flowX: 0, flowY: 0, speed: 0,
          cell: lakeCell, body: mesh.waterBody[lakeCell], level: level};
        tiles.push(run); lakes++; continue;
      }
      run = null;
      tiles.push({kind: 1, x0: x * gs, y0: y * gs, x1: (x + 1) * gs, y1: (y + 1) * gs,
        z: [cz[0] * 25, cz[1] * 25, cz[2] * 25, cz[3] * 25], cx: (x + 0.5) * gs, cy: (y + 0.5) * gs,
        depth: depth, flowX: 0, flowY: 0, speed: 0, cell: lakeCell, body: mesh.waterBody[lakeCell]});
      lakes++;
    }
  }
  // River ribbons: a cross-section at every centreline point, oriented by
  // the averaged direction of its neighbouring segments so bends share edges.
  var rivers_ = typeof waterRivers !== 'undefined' ? waterRivers : [];
  for (var r = 0; r < rivers_.length; r++) {
    var rv = rivers_[r], pts = rv.points, half = 0, sections = [];
    var capA = _waterRibbonCap(mesh, pts, 0), capB = rv.joins ? null : _waterRibbonCap(mesh, pts, pts.length - 1), bend = [];
    if (capA || capB) { pts = pts.slice(); if (capA) pts.unshift(capA); if (capB) pts.push(capB); }
    for (var b0 = 0; b0 < pts.length; b0++) bend.push(_waterBend(pts, b0));
    for (var q = 0; q < pts.length; q++) {
      var prev = pts[Math.max(0, q - 1)], next = pts[Math.min(pts.length - 1, q + 1)];
      var tx = next[0] - prev[0], ty = next[1] - prev[1], tl = Math.hypot(tx, ty) || 1;
      var nx = -ty / tl, ny = tx / tl, z = pts[q][2] * 25, hwq = pts[q][4] || rv.halfWidth;
      var left = _waterRibbonReach(mesh, pts[q][0], pts[q][1], nx, ny, hwq, pts[q][2]);
      var right = _waterRibbonReach(mesh, pts[q][0], pts[q][1], -nx, -ny, hwq, pts[q][2]);
      // On the inside of a bend tighter than the ribbon, sections reaching
      // past the bend's centre would cross their neighbours; stopping at the
      // centre makes that side a fan instead of a fold.
      for (var bq = Math.max(0, q - 1); bq <= Math.min(pts.length - 1, q + 1); bq++) {
        if (bend[bq] > 0) left = Math.min(left, 1 / bend[bq]);
        else if (bend[bq] < 0) right = Math.min(right, -1 / bend[bq]);
      }
      half = Math.max(half, left, right);
      sections.push([[pts[q][0] + nx * left, pts[q][1] + ny * left, z], [pts[q][0] - nx * right, pts[q][1] - ny * right, z], tx / tl, ty / tl]);
    }
    for (var e = 0; e < sections.length - 1; e++) {
      var A = sections[e], B = sections[e + 1], a = pts[e], b = pts[e + 1];
      var slope = Math.max(0, (a[2] - b[2]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1));
      tiles.push({kind: 2, ribbon: true, quad: [A[0], B[0], B[1], A[1]], cx: (a[0] + b[0]) * 0.5, cy: (a[1] + b[1]) * 0.5,
        half: WATER_RIVER_STEP + half, depth: rv.depth * 0.8, flowX: (A[2] + B[2]) * 0.5, flowY: (A[3] + B[3]) * 0.5,
        speed: Math.max(0.25, Math.min(1, 0.25 + slope * 30)), arc0: a[3], arc1: b[3], body: rv.body, cell: rv.id * 4096 + e});
      rivers++;
    }
  }
  waterRenderStats.tiles = tiles.length; waterRenderStats.lakeTiles = lakes;
  waterRenderStats.riverTiles = rivers; waterRenderStats.sheets = sheets;
  return tiles;
}

// Colour: deep water is dark teal and nearly opaque; shallows show the bed.
// Distance adds a little sky (a cheap Fresnel). A lake shimmers as one body so
// its strips never show a grid; rivers shimmer along their flow. The scene's
// ambient and nearby point light apply as they do on floors.
function _waterTileStyle(tile, dist, now, ambient, pointLight) {
  var deep = Math.min(1, tile.depth / 1.2), reflect = 0.08 + 0.3 * Math.min(1, dist / (viewDist || 900));
  var r = 14 + (1 - deep) * 36, g = 70 + (1 - deep) * 52, b = 104 + (1 - deep) * 22;
  var shimmer;
  // Lakes shimmer as one body; rivers with a slow wave that is continuous
  // across neighbouring squares (their motion comes from the streaks).
  if (tile.kind === 1) shimmer = 0.035 * Math.sin(now * 0.0011 + tile.body * 1.7);
  else shimmer = 0.035 * Math.sin(now * 0.0025 - (tile.arc0 + tile.arc1) * 0.02);
  r += (128 - r) * reflect; g += (170 - g) * reflect; b += (198 - b) * reflect;
  var light = Math.min(1.15, ambient + pointLight) * (1 + shimmer);
  var foam = tile.kind === 3 ? 0.55 : tile.kind === 2 ? Math.max(0, tile.speed - 0.7) * 0.8 : 0;
  r = (r + (235 - r) * foam) * light; g = (g + (242 - g) * foam) * light; b = (b + (245 - b) * foam) * light;
  return {color: rgbQ(Math.min(255, r), Math.min(255, g), Math.min(255, b)),
    alpha: tile.kind === 3 ? 0.72 : 0.64 + 0.3 * deep, light: light};
}
// Surface detail drawn inside a tile's own clipped callback, positioned by
// bilinear interpolation of its projected corners so it stays inside the
// quad and foreshortens with it. Rivers carry streaks downstream; lakes get
// sparse glints that flicker. Deterministic per cell; animated by game time.
function _waterHash(i) { var x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; return ((Math.imul(x, 0xc2b2ae35) >>> 0) % 10007) / 10007; }
function _waterLerpPoint(p, u, v) {
  var ax = p[0].x + (p[1].x - p[0].x) * u, ay = p[0].y + (p[1].y - p[0].y) * u;
  var bx = p[3].x + (p[2].x - p[3].x) * u, by = p[3].y + (p[2].y - p[3].y) * u;
  return [ax + (bx - ax) * v, ay + (by - ay) * v];
}
function _waterDetail(tile, p, now, light) {
  var h = _waterHash(tile.cell), a, b, alpha;
  if (tile.ribbon) {
    // Two lanes of dashes sliding downstream at the river's pace. Positions
    // come from arc length, so dashes run continuously across pieces.
    var len = tile.arc1 - tile.arc0;
    if (!(len > 0)) return;
    var travel = now * 0.018 * (0.6 + tile.speed), drew = false;
    ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = Math.max(1, 700 / Math.max(60, tile.dist));
    ctx.beginPath();
    for (var lane = 0; lane < 2; lane++) {
      var v = lane ? 0.68 : 0.32, period = lane ? 34 : 27, dash = 7;
      var start = Math.floor((tile.arc0 + travel - period) / period) * period - travel + lane * 11;
      for (var s0 = start; s0 < tile.arc1; s0 += period) {
        var u0 = Math.max(0, (s0 - tile.arc0) / len), u1 = Math.min(1, (s0 + dash - tile.arc0) / len);
        if (u1 <= u0) continue;
        var pa = _waterLerpPoint(p, u0, v), pb = _waterLerpPoint(p, u1, v);
        ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); drew = true;
      }
    }
    if (drew) { ctx.globalAlpha = Math.min(0.35, 0.22 * Math.min(1, light)); ctx.stroke(); }
    return;
  }
  if (tile.kind === 2) {
    var t = (now * 0.00045 * (0.6 + tile.speed) + h) % 1, cu = 0.5 + tile.flowX * (t - 0.5) * 0.8, cv = 0.5 + tile.flowY * (t - 0.5) * 0.8;
    var off = (h - 0.5) * 0.5, px = -tile.flowY * off, py = tile.flowX * off;
    a = _waterLerpPoint(p, Math.max(0.05, Math.min(0.95, cu + px - tile.flowX * 0.18)), Math.max(0.05, Math.min(0.95, cv + py - tile.flowY * 0.18)));
    b = _waterLerpPoint(p, Math.max(0.05, Math.min(0.95, cu + px + tile.flowX * 0.18)), Math.max(0.05, Math.min(0.95, cv + py + tile.flowY * 0.18)));
    alpha = 0.22 * Math.sin(t * Math.PI);
  } else {
    var flick = Math.sin(now * 0.0021 + h * 40);
    if (flick < 0.55) return;
    var span = Math.min(0.4, 7 / Math.max(1, tile.x1 - tile.x0)), u = 0.1 + h * 0.8, v = 0.25 + ((h * 7.3) % 1) * 0.5;
    a = _waterLerpPoint(p, Math.max(0.02, u - span), v); b = _waterLerpPoint(p, Math.min(0.98, u + span), v);
    alpha = (flick - 0.55) * 0.9;
  }
  ctx.globalAlpha = Math.min(0.5, alpha * Math.min(1, light));
  ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = Math.max(1, 900 / Math.max(60, tile.dist));
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
}

function drawWater3D() {
  if (!WATER_RENDER_ENABLED || typeof WATER_SYSTEM_ENABLED === 'undefined' || !WATER_SYSTEM_ENABLED) return;
  var mesh = floorMesh;
  if (!mesh || !mesh.water || !mesh.waterSurface) return;
  var started = typeof performance === 'object' && performance.now ? performance.now() : 0;
  if (_waterTilesMesh !== mesh || _waterTilesBuild !== waterStats.builds) {
    _waterTiles = buildWaterTiles(mesh); _waterTilesMesh = mesh; _waterTilesBuild = waterStats.builds;
  }
  if (!_waterTiles.length) return;
  var C = getCam3D(), tanHalf = 1 / C.invTanHalf, fovCut = tanHalf * 2.2 + 0.2;
  var reach = viewDist + mesh.gridSize * 4, reachSq = reach * reach, visible = _waterVisible;
  visible.length = 0;
  var culled = 0;
  for (var t = 0; t < _waterTiles.length; t++) {
    var tile = _waterTiles[t], dx = tile.cx - cam.x, dy = tile.cy - cam.y, dsq = dx * dx + dy * dy;
    if (dsq > reachSq) { culled++; continue; }
    // Tile half-extent keeps long lake strips that cross the view edge.
    var half = tile.ribbon ? tile.half : tile.kind === 1 ? (tile.x1 - tile.x0) * 0.5 + mesh.gridSize : mesh.gridSize;
    var fwd = dx * C.cosAng + dy * C.sinAng, side = -dx * C.sinAng + dy * C.cosAng;
    if (fwd < -half || Math.abs(side) > (Math.max(0, fwd) + half) * fovCut + half) { culled++; continue; }
    tile.dist = Math.sqrt(dsq); visible.push(tile);
  }
  // Far to near so overlapping translucent sheets blend in order.
  visible.sort(function(a, b) { return b.dist - a.dist; });
  var now = gameTimeNow(), ambient = typeof renderSurfaceAmbient !== 'undefined' ? renderSurfaceAmbient : ambientLight;
  var fadeStart = viewDist * 0.72, fadeRange = viewDist - fadeStart, drawn = 0;
  ctx.save();
  try {
    for (var v = 0; v < visible.length; v++) {
      var tl = visible[v], verts;
      if (tl.ribbon) verts = tl.quad.map(function(p) { return {x: p[0], y: p[1], z: p[2]}; });
      else verts = [{x: tl.x0, y: tl.y0, z: tl.z[0]}, {x: tl.x1, y: tl.y0, z: tl.z[1]},
        {x: tl.x1, y: tl.y1, z: tl.z[2]}, {x: tl.x0, y: tl.y1, z: tl.z[3]}];
      var points = projectSceneWorldPolygon(verts, C);
      if (points.length < 3) continue;
      var pointLight = 0;
      if (_lightGrid) {
        var lgx = Math.floor(tl.cx / _lightCellSize), lgy = Math.floor(tl.cy / _lightCellSize);
        if (lgx >= 0 && lgx < _lightGridW && lgy >= 0 && lgy < _lightGridH) pointLight = _lightGrid[lgy * _lightGridW + lgx];
      }
      var style = _waterTileStyle(tl, tl.dist, now, ambient, pointLight);
      var fade = tl.dist > fadeStart ? Math.max(0, 1 - (tl.dist - fadeStart) / fadeRange) : 1;
      var tileAlpha = style.alpha * fade * fade, detail = points.length === 4 && tl.kind !== 3 && tl.dist < viewDist * 0.55;
      ctx.globalAlpha = tileAlpha;
      ctx.fillStyle = style.color;
      drawn += withSceneDepthClip(points, function() {
        traceSceneDepthPolygon(points); ctx.fill();
        if (detail) { _waterDetail(tl, points, now, style.light * fade); ctx.globalAlpha = tileAlpha; }
      }) ? 1 : 0;
    }
  } finally { ctx.restore(); }
  waterRenderStats.drawn = drawn; waterRenderStats.culled = culled;
  waterRenderStats.lastMs = started ? performance.now() - started : 0;
}
function getWaterRenderStats() { return Object.assign({}, waterRenderStats); }
