// Structure render models (integration stage D, builder). One merged body +
// shell model per large structure, built from the real window grid:
// - Ownership: grid[i] && wallColorR[i] in window chunks whose .structure is
//   this entry's region, within +-ceil(1.8*scale) chunks of its centre chunk
//   (ruin huts also author colour, so colour alone is not enough). Cells a
//   cave touches stay with walls3D, which owns cave material, light and the
//   ceiling closure: gridCave, a deep-cave centre, a roof tag (wallCapZ), a
//   roof clamp (wallMaxTopZ), a cave ceiling at any corner (what makes a
//   walls3D face faceInCave) or a gridCave 4-neighbour.
// - Body: a production port of the study mesher (tools/game/structure-model.js
//   meshGrid). Tops and faces use walls3D's own numbers: top z = (fh +
//   wallBaseH*wh)*25, a face against an empty neighbour spans (wallFaceBase -
//   0.15)*25 to the top, and any solid neighbour (natural or not) occludes up
//   to its own top, leaving a riser above it. Runs merge only when kind, top,
//   base and colour are equal, and split at STRUCTURE_MODEL_SPAN units
//   anchored on the structure centre.
// - Shell: drawStructureShellWorld captured once through the drawRuinDecorFace
//   sink (12-prop-models.js) in structure-local space. Materials are explicit
//   (stone body and shell, wood standard poles, solid cloth accents) and the
//   tint is the palette role colour, not the baked ramp.
// - UVs: STRUCTURE_MODEL_UV_REPEAT units per repeat, on structure-local x/y
//   and absolute z with the study's axis rules, so a window rebase keeps the
//   phase.
// Presentation only: reads world data, never writes it, and makes no RNG
// draws. Built only in Endless while the structureModels feature is on (at
// window assembly, or lazily when the feature is switched on). Inert at load:
// declarations, one feature registration and one change listener.
var STRUCTURE_MODEL_UV_REPEAT = 32;   // world units per texture repeat
var STRUCTURE_MODEL_SPAN = 48;        // longest merged run (torch pool and fog granularity)
var STRUCTURE_MODEL_ROLES = 'wckfpsta';  // every structure palette role letter
var structureModels = [];             // models for the current window, largeStructures order
var structureModelOwner = null;       // Uint8Array(gridW*gridH): model index + 1, 0 = walls3D
var _structureModelsFor = null;       // the window inputs the models were built from
var structureModelStats = {builds: 0, skipped: 0, lastBuildMs: 0, maxBuildMs: 0, totalBuildMs: 0,
  structures: 0, faces: 0, owned: 0, excluded: 0, walls: 0, risers: 0, tops: 0, shell: 0, unclassified: 0,
  failures: 0, lastFailure: ''};
var _structureModelOwnedCells = null; // Int32Array of owned window indices (walls3D column depth)

function structureModelsEnabled() {
  return typeof renderFeatureOn === 'function' && renderFeatureOn('structureModels');
}
function _structureModelNow() {
  return typeof performance === 'object' && performance && typeof performance.now === 'function' ?
    performance.now() : Date.now();
}
// Endless only: classic levels keep the last Endless window's largeStructures,
// chunks and colour arrays (resetLevel does not clear them), so outside
// Endless nothing is built and no model is current.
function _structureModelsEndless() {
  return typeof ENDLESS_MODE !== 'undefined' && !!ENDLESS_MODE;
}
// True when the models were built from exactly the current window arrays.
function structureModelsCurrent() {
  var f = _structureModelsFor;
  return !!f && _structureModelsEndless() && f.grid === grid && grid !== null && f.wallFaceBase === wallFaceBase && f.floorMesh === floorMesh &&
    f.structures === largeStructures && f.originX === windowOriginX && f.originY === windowOriginY;
}
// Walls3D's question (stage D2): does an enabled, current model draw this cell?
function structureModelOwnsCell(index) {
  return structureModelOwner !== null && structureModelOwner[index] > 0 && structureModelsEnabled() &&
    structureModelsCurrent();
}
function ensureStructureModels() {
  if (!structureModelsEnabled()) return false;
  if (!structureModelsCurrent()) buildStructureModels();
  return structureModelsCurrent();
}
function getStructureModelStats() {
  var out = {};
  for (var k in structureModelStats) out[k] = structureModelStats[k];
  out.current = structureModelsCurrent();
  return out;
}

// A cave ceiling at a world point: the non-null condition of walls3D's
// caveCeilAt (12-render-core-walls.js), which makes a face faceInCave.
function _structureCaveCeilingAt(wx, wy) {
  if (typeof deepCaveRegions !== 'undefined' && deepCaveRegions.length > 0 && typeof isInDeepCave === 'function') {
    var ci = isInDeepCave(wx, wy);
    if (ci && ci.ceilZ > 0) return true;
  }
  if (floorMesh && floorMesh.layerCount) {
    var mx = Math.floor(wx / floorMesh.gridSize), my = Math.floor(wy / floorMesh.gridSize);
    if (mx >= 0 && mx < floorMesh.w && my >= 0 && my < floorMesh.h) {
      var mi = my * floorMesh.w + mx, lc = floorMesh.layerCount[mi];
      for (var li = 0; li < lc; li++) if (floorMesh['l' + li + 'Type'][mi] === 2) return true;
    }
  }
  return false;
}
// Cells a cave touches stay with walls3D (see the header).
function structureModelCaveCell(gx, gy) {
  var i = gy * gridW + gx, x1 = gx * cell, y1 = gy * cell, x2 = x1 + cell, y2 = y1 + cell;
  if (gridCave && gridCave[i]) return true;
  if (wallCapZ && wallCapZ[i] > -Infinity) return true;
  if (wallMaxTopZ && wallMaxTopZ[i] < Infinity) return true;
  if (typeof deepCaveRegions !== 'undefined' && deepCaveRegions.length > 0 && typeof isInDeepCave === 'function' &&
      isInDeepCave(x1 + cell * 0.5, y1 + cell * 0.5)) return true;
  if (gridCave && ((gx > 0 && gridCave[i - 1]) || (gx < gridW - 1 && gridCave[i + 1]) ||
      (gy > 0 && gridCave[i - gridW]) || (gy < gridH - 1 && gridCave[i + gridW]))) return true;
  return _structureCaveCeilingAt(x1, y1) || _structureCaveCeilingAt(x2, y1) ||
    _structureCaveCeilingAt(x1, y2) || _structureCaveCeilingAt(x2, y2);
}

// walls3D's top for a solid cell, in render z.
function _structureCellTopZ(gx, gy, wallBaseH) {
  var i = gy * gridW + gx, wh = wallHeights ? wallHeights[i] : 1.0;
  var fh = floorMesh ? getFloorHeightAt((gx + 0.5) * cell, (gy + 0.5) * cell) : 0;
  var topH = fh + wallBaseH * wh;
  if (wallMaxTopZ) {
    var wmax = wallMaxTopZ[i];
    if (wmax < Infinity && topH > wmax) topH = wmax;
  }
  return topH * 25;
}

// The study's texturedFace UV rule (structure-model.js): horizontal faces map
// (x, y), faces whose normal is +-x map (y, -z), +-y map (x, -z), and any
// other face an orthonormal in-plane frame from its first edge. Points are
// structure-local in x/y; z is absolute. Returns null for a degenerate face.
function structureModelFaceFrame(points) {
  var first = points[0], second = points[1], third = points[2], rep = STRUCTURE_MODEL_UV_REPEAT;
  var ex = second.x - first.x, ey = second.y - first.y, ez = second.z - first.z;
  var fx = third.x - first.x, fy = third.y - first.y, fz = third.z - first.z;
  var nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
  var el = Math.hypot(ex, ey, ez), nl = Math.hypot(nx, ny, nz);
  if (!(el > 0 && nl > 0)) return null;
  var ux = ex / el, uy = ey / el, uz = ez / el;
  var vx = (ny * uz - nz * uy) / nl, vy = (nz * ux - nx * uz) / nl, vz = (nx * uy - ny * ux) / nl;
  var verticalX = Math.abs(nx) > nl * (1 - 1e-10);
  var verticalY = Math.abs(ny) > nl * (1 - 1e-10);
  var horizontal = Math.abs(nz) > nl * (1 - 1e-10);
  var uv = points.map(function(p) {
    var u, v;
    if (horizontal) { u = p.x / rep; v = p.y / rep; }
    else if (verticalX) { u = p.y / rep; v = -p.z / rep; }
    else if (verticalY) { u = p.x / rep; v = -p.z / rep; }
    else { u = (p.x * ux + p.y * uy + p.z * uz) / rep; v = (p.x * vx + p.y * vy + p.z * vz) / rep; }
    return [u, v];
  });
  return {uv: uv, normal: {x: nx / nl, y: ny / nl, z: nz / nl}};
}

// Face record. `local` points are structure-local x/y (absolute z); the
// stored vertices are window-local (x + ox, y + oy) with the local UVs.
function _structureModelFace(kind, material, role, tint, local, ox, oy, normal) {
  var frame = structureModelFaceFrame(local);
  if (!frame) return null;
  var verts = [], minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  var sx = 0, sy = 0, sz = 0;
  for (var i = 0; i < local.length; i++) {
    var p = local[i], x = p.x + ox, y = p.y + oy;
    verts.push({x: x, y: y, z: p.z, u: frame.uv[i][0], v: frame.uv[i][1]});
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    sx += x; sy += y; sz += p.z;
  }
  var n = local.length;
  return {kind: kind, material: material, solid: material === 'cloth', twoSided: material === 'cloth',
    role: role, tint: tint, vertices: verts, normal: normal || frame.normal,
    minX: minX, minY: minY, minZ: minZ, maxX: maxX, maxY: maxY, maxZ: maxZ, cx: sx / n, cy: sy / n, cz: sz / n};
}

// Production port of the study mesher over a cell grid.
// g: {width, height, cell, minCellX, minCellY, uvX, uvY, solid, owned, topZ,
//     faceBase, colors}; cell (minCellX + x, minCellY + y) spans
//     [(minCellX + x) * cell, +cell) in output coordinates, and (uvX, uvY)
//     is the structure centre there. topZ (render z) is read for solid
//     cells, faceBase (render z; W, E, N, S) and colors (packed RGB) for
//     owned cells. Out-of-range neighbours are empty, as at the window edge.
// options: {span: merged-run cap in units (0 = none)}.
// Walls and risers are appended as merged runs; tops as greedy rectangles
// of equal top and colour, row-major like the study.
function meshStructureModelCells(g, options) {
  var W = g.width, Hc = g.height, cs = g.cell, n = W * Hc;
  var span = options && options.span > 0 ? options.span : 0;
  var solid = g.solid, owned = g.owned, topZ = g.topZ, faceBase = g.faceBase, colors = g.colors;
  var faces = [], groups = Object.create(null), groupList = [], visited = new Uint8Array(n);
  var stats = {tops: 0, walls: 0, risers: 0, edges: 0, owned: 0};
  function bucket(v, origin) { return span ? Math.floor((v - origin) / span) : 0; }
  function edge(kind, dir, plane, start, z0, z1, color) {
    if (!(z1 > z0)) return;
    var key = kind + '|' + dir + '|' + plane + '|' + z0 + '|' + z1 + '|' + color;
    var gr = groups[key];
    if (!gr) { gr = groups[key] = {kind: kind, dir: dir, plane: plane, z0: z0, z1: z1, color: color, starts: []}; groupList.push(gr); }
    gr.starts.push(start); stats.edges++;
  }
  // A solid neighbour occludes up to its own top; NaN when open.
  function occluderTop(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= Hc) return NaN;
    var j = y * W + x;
    return solid[j] ? topZ[j] : NaN;
  }
  function side(dir, nx, ny, plane, start, base, z1, color) {
    var t = occluderTop(nx, ny);
    if (t !== t) edge('wall', dir, plane, start, base, z1, color);
    else edge('riser', dir, plane, start, t, z1, color);
  }
  for (var y = 0; y < Hc; y++) for (var x = 0; x < W; x++) {
    var i = y * W + x;
    if (!owned[i]) continue;
    stats.owned++;
    var z1 = topZ[i], color = colors[i], wx = (g.minCellX + x) * cs, wy = (g.minCellY + y) * cs;
    side('W', x - 1, y, wx, wy, faceBase[i * 4], z1, color);
    side('E', x + 1, y, wx + cs, wy, faceBase[i * 4 + 1], z1, color);
    side('N', x, y - 1, wy, wx, faceBase[i * 4 + 2], z1, color);
    side('S', x, y + 1, wy + cs, wx, faceBase[i * 4 + 3], z1, color);
    if (visited[i]) continue;
    var bx = bucket(wx, g.uvX), by = bucket(wy, g.uvY), run = 1, rows = 1;
    var matching = function(px, py) {
      var m = py * W + px;
      return owned[m] && !visited[m] && topZ[m] === z1 && colors[m] === color &&
        bucket((g.minCellX + px) * cs, g.uvX) === bx && bucket((g.minCellY + py) * cs, g.uvY) === by;
    };
    while (x + run < W && matching(x + run, y)) run++;
    for (var extend = true; y + rows < Hc && extend;) {
      for (var xx = 0; xx < run; xx++) if (!matching(x + xx, y + rows)) { extend = false; break; }
      if (extend) rows++;
    }
    for (var yy = 0; yy < rows; yy++) for (var xx2 = 0; xx2 < run; xx2++) visited[(y + yy) * W + x + xx2] = 1;
    var tx0 = wx - g.uvX, ty0 = wy - g.uvY, tx1 = tx0 + run * cs, ty1 = ty0 + rows * cs;
    var top = _structureModelFace('top', 'stone', 'cell', color, [
      {x: tx0, y: ty0, z: z1}, {x: tx1, y: ty0, z: z1}, {x: tx1, y: ty1, z: z1}, {x: tx0, y: ty1, z: z1}
    ], g.uvX, g.uvY, {x: 0, y: 0, z: 1});
    if (top) { faces.push(top); stats.tops++; }
  }
  var normals = {W: {x: -1, y: 0, z: 0}, E: {x: 1, y: 0, z: 0}, N: {x: 0, y: -1, z: 0}, S: {x: 0, y: 1, z: 0}};
  for (var gi = 0; gi < groupList.length; gi++) {
    var gr = groupList[gi], starts = gr.starts.sort(function(a, b) { return a - b; });
    var alongY = gr.dir === 'W' || gr.dir === 'E', origin = alongY ? g.uvY : g.uvX;
    for (var s = 0; s < starts.length;) {
      var begin = starts[s], end = begin + cs, b0 = bucket(begin, origin);
      s++;
      while (s < starts.length && starts[s] === end && bucket(end, origin) === b0) { end += cs; s++; }
      var a, b;
      if (gr.dir === 'W') { a = {x: gr.plane, y: end}; b = {x: gr.plane, y: begin}; }
      else if (gr.dir === 'E') { a = {x: gr.plane, y: begin}; b = {x: gr.plane, y: end}; }
      else if (gr.dir === 'N') { a = {x: begin, y: gr.plane}; b = {x: end, y: gr.plane}; }
      else { a = {x: end, y: gr.plane}; b = {x: begin, y: gr.plane}; }
      var ax = a.x - g.uvX, ay = a.y - g.uvY, bxl = b.x - g.uvX, byl = b.y - g.uvY;
      var face = _structureModelFace(gr.kind, 'stone', 'cell', gr.color, [
        {x: ax, y: ay, z: gr.z0}, {x: bxl, y: byl, z: gr.z0}, {x: bxl, y: byl, z: gr.z1}, {x: ax, y: ay, z: gr.z1}
      ], g.uvX, g.uvY, normals[gr.dir]);
      if (face) { faces.push(face); if (gr.kind === 'wall') stats.walls++; else stats.risers++; }
    }
  }
  return {faces: faces, stats: stats};
}

// The shell of one structure as local faces: drawStructureShellWorld is run
// at the structure-local origin through the capture sink, with every palette
// role replaced by a sentinel so each ramp colour names its role exactly.
function captureStructureShellFaces(st, floorZ) {
  var faces = [], unclassified = 0;
  if (typeof drawStructureShellWorld !== 'function' || typeof captureRuinDecorFaces !== 'function' ||
      typeof structureColorRamp !== 'function' || typeof structurePaletteRole !== 'function') return {faces: faces, unclassified: 0};
  var proxy = Object.create(st), sentinel = {}, roleOf = Object.create(null), letters = STRUCTURE_MODEL_ROLES;
  proxy.x = 0; proxy.y = 0; proxy.palette = sentinel;
  for (var li = 0; li < letters.length; li++) sentinel[letters[li]] = [100, 100 + li, 100 + 2 * li];
  for (var lj = 0; lj < letters.length; lj++) {
    var ramp = structureColorRamp(proxy, letters[lj]);
    for (var shade in ramp) roleOf[ramp[shade]] = letters[lj];
  }
  var woodHex = Object.create(null), wood = typeof GAME_MATERIALS !== 'undefined' && GAME_MATERIALS.floorPropWood;
  if (wood) for (var wr in wood.hex) woodHex[wood.hex[wr]] = true;
  var captured = [];
  var savedAlpha = typeof ctx !== 'undefined' && ctx ? ctx.globalAlpha : null;
  try {
    captureRuinDecorFaces(function() { drawStructureShellWorld(proxy, {floorZ: floorZ}, null); },
      function(vertices, color) { captured.push({vertices: vertices, color: color}); return 0; });
  } finally {
    if (savedAlpha !== null && ctx.globalAlpha !== savedAlpha) ctx.globalAlpha = savedAlpha;
  }
  for (var ci = 0; ci < captured.length; ci++) {
    var c = captured[ci], color = c.color, material, role, tint;
    if (roleOf[color]) {
      role = roleOf[color]; material = 'stone';
      var rgb = structurePaletteRole(st, role);
      tint = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
    } else if (woodHex[color]) {
      material = 'wood'; role = 'wood'; tint = wood.packed.base;
    } else if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) {
      material = 'cloth'; role = 'accent'; tint = parseInt(color.slice(1), 16);
    } else {
      material = 'cloth'; role = 'unknown'; tint = 0x808080; unclassified++;
    }
    var local = c.vertices.map(function(p) { return {x: p.x, y: p.y, z: p.z}; });
    faces.push({material: material, role: role, tint: tint, local: local});
  }
  return {faces: faces, unclassified: unclassified};
}

// Cells of one largeStructures entry that its model owns, as a window mask
// value (index + 1), counting cave exclusions.
function _structureModelClaimCells(st, value, owner, counts) {
  var R = Math.ceil(1.8 * (st.scale || 1));
  var ccx = Math.floor(st.centerWX / CHUNK_SIZE), ccy = Math.floor(st.centerWY / CHUNK_SIZE);
  var box = {gx0: Infinity, gy0: Infinity, gx1: -Infinity, gy1: -Infinity};
  for (var cy = ccy - R; cy <= ccy + R; cy++) for (var cx = ccx - R; cx <= ccx + R; cx++) {
    var dx = cx - windowCX, dy = cy - windowCY;
    if (dx < 0 || dy < 0 || dx >= WINDOW_CHUNKS || dy >= WINDOW_CHUNKS) continue;
    var ch = chunks[cx + ',' + cy];
    if (!ch || !ch.structure || ch.structure.regionX !== st.regionX || ch.structure.regionY !== st.regionY) continue;
    for (var ly = 0; ly < CHUNK_CELLS; ly++) for (var lx = 0; lx < CHUNK_CELLS; lx++) {
      var gx = dx * CHUNK_CELLS + lx, gy = dy * CHUNK_CELLS + ly, i = gy * gridW + gx;
      if (!grid[i] || !wallColorR[i] || owner[i]) continue;
      if (structureModelCaveCell(gx, gy)) { counts.excluded++; continue; }
      owner[i] = value; counts.owned++;
      if (gx < box.gx0) box.gx0 = gx; if (gx > box.gx1) box.gx1 = gx;
      if (gy < box.gy0) box.gy0 = gy; if (gy > box.gy1) box.gy1 = gy;
    }
  }
  return box;
}

// Builds every structure model for the current window. Without
// {force: true} it only clears the models while the feature is off or after
// a session failure, and outside Endless it always only clears them. Never
// throws (window assembly calls it): a failure clears the models, so walls3D
// and the late shell draw every structure.
function buildStructureModels(options) {
  try {
    return _buildStructureModelsUnchecked(options);
  } catch (e) {
    structureModels = []; structureModelOwner = null; _structureModelsFor = null; _structureModelOwnedCells = null;
    _structureModelsFail(e, 'build');
    return null;
  }
}
function _buildStructureModelsUnchecked(options) {
  var force = !!(options && options.force);
  structureModels = []; structureModelOwner = null; _structureModelsFor = null; _structureModelOwnedCells = null;
  if (!force && _structureModelsFailed) { structureModelStats.skipped++; return null; }
  if (!grid || !_structureModelsEndless() || (!force && !structureModelsEnabled())) { structureModelStats.skipped++; return null; }
  var started = _structureModelNow(), span = options && options.span !== undefined ? options.span : STRUCTURE_MODEL_SPAN;
  var owner = new Uint8Array(gridW * gridH), wallBaseH = CANVAS_BASE_H / 25;
  var totals = {faces: 0, owned: 0, excluded: 0, walls: 0, risers: 0, tops: 0, shell: 0, unclassified: 0};
  var list = largeStructures || [];
  for (var si = 0; si < list.length && si < 255; si++) {
    var st = list[si], t0 = _structureModelNow(), counts = {owned: 0, excluded: 0};
    var box = _structureModelClaimCells(st, si + 1, owner, counts);
    var uvX = st.centerWX - windowOriginX, uvY = st.centerWY - windowOriginY, faces = [], mesh = null;
    if (counts.owned) {
      // The owned bounding box plus a one-cell ring of occluding neighbours.
      var gx0 = Math.max(0, box.gx0 - 1), gy0 = Math.max(0, box.gy0 - 1);
      var gx1 = Math.min(gridW - 1, box.gx1 + 1), gy1 = Math.min(gridH - 1, box.gy1 + 1);
      var w = gx1 - gx0 + 1, h = gy1 - gy0 + 1, n = w * h;
      var sub = {width: w, height: h, cell: cell, minCellX: gx0, minCellY: gy0, uvX: uvX, uvY: uvY,
        solid: new Uint8Array(n), owned: new Uint8Array(n), topZ: new Float64Array(n),
        faceBase: new Float64Array(n * 4), colors: new Uint32Array(n)};
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var gx = gx0 + x, gy = gy0 + y, gi = gy * gridW + gx, k = y * w + x;
        if (!grid[gi]) continue;
        sub.solid[k] = 1;
        sub.topZ[k] = _structureCellTopZ(gx, gy, wallBaseH);
        if (owner[gi] !== si + 1) continue;
        sub.owned[k] = 1;
        sub.colors[k] = (wallColorR[gi] << 16) | (wallColorG[gi] << 8) | wallColorB[gi];
        for (var f = 0; f < 4; f++) {
          var base = wallFaceBase ? wallFaceBase[gi * 4 + f] :
            (floorMesh ? getFloorHeightAt((gx + 0.5) * cell, (gy + 0.5) * cell) : 0);
          sub.faceBase[k * 4 + f] = (base - 0.15) * 25;
        }
      }
      mesh = meshStructureModelCells(sub, {span: span});
      faces = mesh.faces;
    }
    var floorZ = typeof getEntityRenderFloorZ === 'function' ? getEntityRenderFloorZ(st) : 0;
    var shell = captureStructureShellFaces(st, floorZ), shellCount = 0;
    for (var fi = 0; fi < shell.faces.length; fi++) {
      var sf = shell.faces[fi];
      var face = _structureModelFace('shell', sf.material, sf.role, sf.tint, sf.local, st.x, st.y, null);
      if (face) { faces.push(face); shellCount++; }
    }
    var bounds = {minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity};
    for (var bi = 0; bi < faces.length; bi++) {
      var bf = faces[bi];
      if (bf.minX < bounds.minX) bounds.minX = bf.minX; if (bf.maxX > bounds.maxX) bounds.maxX = bf.maxX;
      if (bf.minY < bounds.minY) bounds.minY = bf.minY; if (bf.maxY > bounds.maxY) bounds.maxY = bf.maxY;
      if (bf.minZ < bounds.minZ) bounds.minZ = bf.minZ; if (bf.maxZ > bounds.maxZ) bounds.maxZ = bf.maxZ;
    }
    var model = {key: st.regionX + ',' + st.regionY, index: si, type: st.type, structure: st, floorZ: floorZ,
      uvX: uvX, uvY: uvY, faces: faces, bounds: bounds, ownedCells: counts.owned, excludedCells: counts.excluded,
      counts: {walls: mesh ? mesh.stats.walls : 0, risers: mesh ? mesh.stats.risers : 0, tops: mesh ? mesh.stats.tops : 0,
        shell: shellCount, unclassified: shell.unclassified},
      buildMs: _structureModelNow() - t0};
    structureModels.push(model);
    totals.faces += faces.length; totals.owned += counts.owned; totals.excluded += counts.excluded;
    totals.walls += model.counts.walls; totals.risers += model.counts.risers; totals.tops += model.counts.tops;
    totals.shell += shellCount; totals.unclassified += shell.unclassified;
  }
  structureModelOwner = owner;
  var ownedCount = 0;
  for (var oi = 0; oi < owner.length; oi++) if (owner[oi]) ownedCount++;
  var ownedCells = new Int32Array(ownedCount);
  for (var oj = 0, on = 0; oj < owner.length; oj++) if (owner[oj]) ownedCells[on++] = oj;
  _structureModelOwnedCells = ownedCells;
  _structureModelsFor = {grid: grid, wallFaceBase: wallFaceBase, floorMesh: floorMesh, structures: largeStructures,
    originX: windowOriginX, originY: windowOriginY};
  var ms = _structureModelNow() - started, s = structureModelStats;
  s.builds++; s.lastBuildMs = ms; s.totalBuildMs += ms; if (ms > s.maxBuildMs) s.maxBuildMs = ms;
  s.structures = structureModels.length;
  for (var key in totals) s[key] = totals[key];
  if (structureModels.length) {
    console.log('[STRUCTURE-MODEL] ' + structureModels.length + ' models, ' + totals.faces + ' faces (' +
      totals.walls + ' walls, ' + totals.risers + ' risers, ' + totals.tops + ' tops, ' + totals.shell + ' shell), ' +
      totals.owned + ' cells owned, ' + totals.excluded + ' left to walls3D by caves, ' + ms.toFixed(1) + 'ms');
  }
  return structureModels;
}

// ── Draw pass (stage D2) ──
// draw() runs drawStructureModels3D between platforms3D and walls3D while the
// feature is on, so the opaque, depth-writing model is in the scene depth
// before walls3D paints its far-to-near faces, inline canopies and fade-band
// translucency over it. walls3D then takes the pass once: it merges the
// model's legacy column depth (drawWalls3D resets depthBuffer) and skips the
// owned cells. The late drawStructures3D skips the shells the model drew and
// draws shells beyond the model range fogged in colour (Decision 5).
// Fail-open: any exception in the build or the pass sets a session failure
// flag and counts it; walls3D and the late shell then draw every structure,
// from the failing frame on, until the feature is switched off and on again.
var _structureModelsFailed = false;
var _structureModelsWasOn = false;
var _structureModelProject = null;    // test hook: replaces projectSceneWorldPolygon in the pass
var _structureModelPass = {serial: 0, frame: -1, ok: false, wallsPending: false, owner: null,
  minX: 0, minY: 0, maxX: -1, maxY: -1};
var _structureModelColumnDepth = null; // Float64Array(canvas width): the owned cells' legacy column depth
var _structureModelItems = [], _structureModelItemCount = 0;
var _structureModelColourCache = Object.create(null);
var STRUCTURE_MODEL_DEBUG_TINT = 0xaaaaaa; // DEBUG_POLY_TYPES surface-wall grey

function _structureModelsFail(error, where) {
  _structureModelsFailed = true;
  structureModelStats.failures++;
  structureModelStats.lastFailure = where + ': ' + (error && error.message ? error.message : String(error));
  if (structureModelStats.failures <= 3 && typeof console !== 'undefined' && console && console.error) {
    console.error('[STRUCTURE-MODEL] ' + structureModelStats.lastFailure + ' -- falling back to walls3D and the late shell');
  }
}
function _structureModelFrameStamp() {
  return typeof _renderFrameStats === 'object' && _renderFrameStats ? _renderFrameStats.frame : -1;
}
function _structureModelStat(name, amount) {
  if (typeof addRenderFrameStat === 'function') addRenderFrameStat(name, amount);
}
// draw()'s question: run the pass this frame?
function structureModelsPassWanted() {
  return !_structureModelsFailed && !!grid && _structureModelsEndless() && structureModelsEnabled();
}
// True after this frame's pass drew without an exception.
function structureModelsDrewThisFrame() {
  var pass = _structureModelPass;
  return pass.ok && !_structureModelsFailed && pass.frame === _structureModelFrameStamp();
}
// walls3D takes the pass once, right after resetting depthBuffer: it merges
// the owned cells' column depth and gets the owner mask of cells to skip plus
// the screen box the model painted. null when no pass drew this frame
// (Legacy, a failure, a stale model or a second walls3D call), so walls3D
// draws every cell itself.
function takeStructureModelWallPass(columns, width) {
  var pass = _structureModelPass;
  if (!pass.wallsPending) return null;
  pass.wallsPending = false;
  if (!structureModelsDrewThisFrame() || !structureModelsEnabled() || !structureModelsCurrent() || !structureModelOwner) return null;
  var col = _structureModelColumnDepth;
  if (columns && col && col.length === width) {
    for (var i = 0; i < width; i++) if (col[i] < columns[i]) columns[i] = col[i];
  }
  pass.owner = structureModelOwner;
  return pass;
}

// walls3D's per-face column depth (12-render-core-walls.js renderFace) for
// the owned cells, with walls3D's own cell culls, face tests and numbers, so
// the merged depthBuffer equals the Legacy one and the legacy entity gates
// (shrines, structure labels) are unchanged.
function _structureModelColumn(col, w, C, project, wx1, wy1, wx2, wy2, perpDist) {
  if (perpDist < 1) perpDist = 1;
  // Projected x is independent of z (clipping is on depth only).
  var poly = project([{x: wx1, y: wy1, z: 0}, {x: wx2, y: wy2, z: 0}, {x: wx2, y: wy2, z: 1}, {x: wx1, y: wy1, z: 1}], C);
  if (poly.length < 3) return;
  var minSX = w - 1, maxSX = 0;
  for (var k = 0; k < poly.length; k++) {
    minSX = Math.min(minSX, Math.max(0, Math.floor(poly[k].x)));
    maxSX = Math.max(maxSX, Math.min(w - 1, Math.ceil(poly[k].x)));
  }
  for (var sx = minSX; sx <= maxSX; sx++) if (perpDist < col[sx]) col[sx] = perpDist;
}
function _structureModelColumnDepths(C, project) {
  var w = C.w, col = _structureModelColumnDepth;
  if (!col || col.length !== w) col = _structureModelColumnDepth = new Float64Array(w);
  col.fill(9999);
  var cells = _structureModelOwnedCells;
  if (!cells || !cells.length) return col;
  var cosAng = C.cosAng, sinAng = C.sinAng, tanHalf = 1 / C.invTanHalf, viewDistSq = viewDist * viewDist;
  var camGX = cam.x / cell, camGY = cam.y / cell, viewRad = viewDist / cell;
  var gxMin = Math.max(0, Math.floor(camGX - viewRad)), gxMax = Math.min(gridW - 1, Math.ceil(camGX + viewRad));
  var gyMin = Math.max(0, Math.floor(camGY - viewRad)), gyMax = Math.min(gridH - 1, Math.ceil(camGY + viewRad));
  for (var k = 0; k < cells.length; k++) {
    var i = cells[k], gx = i % gridW, gy = (i - gx) / gridW;
    if (gx < gxMin || gx > gxMax || gy < gyMin || gy > gyMax) continue;
    var centerX = (gx + 0.5) * cell, centerY = (gy + 0.5) * cell;
    var ddx = centerX - cam.x, ddy = centerY - cam.y;
    if (ddx * ddx + ddy * ddy > viewDistSq) continue;
    var fwdDot = ddx * cosAng + ddy * sinAng;
    if (fwdDot < -cell) continue;
    var rgtDot = ddx * (-sinAng) + ddy * cosAng;
    if (fwdDot > 1 && Math.abs(rgtDot) / fwdDot > tanHalf * 2.5) continue;
    var x1 = gx * cell, y1 = gy * cell, x2 = (gx + 1) * cell, y2 = (gy + 1) * cell;
    if (gx === 0 || !grid[gy * gridW + (gx - 1)])
      _structureModelColumn(col, w, C, project, x1, y2, x1, y1, Math.abs((x1 - cam.x) * cosAng + (y1 + cell * 0.5 - cam.y) * sinAng));
    if (gx === gridW - 1 || !grid[gy * gridW + (gx + 1)])
      _structureModelColumn(col, w, C, project, x2, y1, x2, y2, Math.abs((x2 - cam.x) * cosAng + (y1 + cell * 0.5 - cam.y) * sinAng));
    if (gy === 0 || !grid[(gy - 1) * gridW + gx])
      _structureModelColumn(col, w, C, project, x1, y1, x2, y1, Math.abs((x1 + cell * 0.5 - cam.x) * cosAng + (y1 - cam.y) * sinAng));
    if (gy === gridH - 1 || !grid[(gy + 1) * gridW + gx])
      _structureModelColumn(col, w, C, project, x2, y2, x1, y2, Math.abs((x1 + cell * 0.5 - cam.x) * cosAng + (y2 - cam.y) * sinAng));
  }
  return col;
}

// Shell range (Decision 5): the model draws a structure's shell while the
// structure is within viewDist, measured as renderEntities3D measures
// vis.dist; beyond it the late pass draws the legacy shell fogged in colour.
function _structureModelShellInRange(st) {
  var d = Math.hypot(st.x - cam.x, st.y - cam.y);
  return (d < 1 ? 1 : d) <= viewDist;
}
function _structureModelItem(face, dist, alpha, flip) {
  var item = _structureModelItems[_structureModelItemCount];
  if (!item) item = _structureModelItems[_structureModelItemCount] = {face: null, dist: 0, alpha: 1, flip: false};
  item.face = face; item.dist = dist; item.alpha = alpha; item.flip = flip;
  _structureModelItemCount++;
}
function _structureModelNearFirst(a, b) { return a.dist - b.dist; }
// The textured sink's surface for one face (reused), or null for a face that
// stays flat (cloth, or a material without a catalog texture).
var _structureModelSurface = {vertices: null, material: '', tint: 0, lit: 0, dist: 0, horizontal: false, key: null};
function _structureModelTexSurface(face, lit, dist) {
  var name = worldTextureMaterialName(face.material);
  if (!name) return null;
  var s = _structureModelSurface;
  s.vertices = face.vertices; s.material = name; s.tint = face.tint; s.lit = lit; s.dist = dist;
  s.horizontal = Math.abs(face.normal.z) > 1 - 1e-9; s.key = face;
  return s;
}

// Gathers, culls, sorts near to far and paints every model face in range.
// Body faces (walls, risers, tops) take the wall fade band; shell faces stay
// opaque and colour-fogged, continuous with the far-band shell.
function _drawStructureModelFaces(C, pass, project, textured) {
  var camX = cam.x, camY = cam.y, camZ = C.cameraZ, cosA = C.cosAng, sinA = C.sinAng;
  var range = viewDist, rangeSq = range * range;
  var debugTint = typeof DEBUG_POLY_TYPES !== 'undefined' && DEBUG_POLY_TYPES;
  var faces = 0, culled = 0, drawn = 0, hidden = 0, clipped = 0;
  _structureModelItemCount = 0;
  for (var mi = 0; mi < structureModels.length; mi++) {
    var m = structureModels[mi], list = m.faces, b = m.bounds;
    var withShell = _structureModelShellInRange(m.structure);
    if (withShell) m.shellSerial = pass.serial;
    if (!list.length) continue;
    var bdx = Math.max(b.minX - camX, 0, camX - b.maxX), bdy = Math.max(b.minY - camY, 0, camY - b.maxY);
    var bFar = ((cosA >= 0 ? b.maxX : b.minX) - camX) * cosA + ((sinA >= 0 ? b.maxY : b.minY) - camY) * sinA;
    var bodyOut = bdx * bdx + bdy * bdy > rangeSq, behind = bFar < 1;
    for (var fi = 0; fi < list.length; fi++) {
      var f = list[fi], shell = f.kind === 'shell';
      if (shell && !withShell) continue;
      faces++;
      if (behind || (!shell && bodyOut)) { culled++; continue; }
      // Body faces end at viewDist like walls3D; a shell in range is drawn
      // whole (opaque, colour-fogged), like the far-band shell beyond it.
      var dx = Math.max(f.minX - camX, 0, camX - f.maxX), dy = Math.max(f.minY - camY, 0, camY - f.maxY);
      if (!shell && dx * dx + dy * dy > rangeSq) { culled++; continue; }
      var far = ((cosA >= 0 ? f.maxX : f.minX) - camX) * cosA + ((sinA >= 0 ? f.maxY : f.minY) - camY) * sinA;
      if (far < 1) { culled++; continue; }
      var n = f.normal, v0 = f.vertices[0];
      var side = n.x * (camX - v0.x) + n.y * (camY - v0.y) + n.z * (camZ - v0.z);
      // No back-face cull. The body is open where an owned cell borders a
      // natural solid (that face is left to walls3D, which may skip it: its
      // near-camera FOV cull, no risers above lower natural cells), so a face
      // turned away is what fills such a gap, as Legacy's inner faces do. The
      // depth test hides it wherever a front face covers it. Faces turned away
      // are lit with the normal flipped toward the camera.
      var dist = Math.abs((f.cx - camX) * cosA + (f.cy - camY) * sinA);
      if (dist < 1) dist = 1;
      var alpha = shell ? 1 : worldFaceFadeAlpha(dist);
      if (!(alpha > 0)) { culled++; continue; }
      _structureModelItem(f, dist, alpha, side < 0);
    }
  }
  var items = _structureModelItems, count = _structureModelItemCount;
  if (count > 1) {
    var view = items.length === count ? items : items.slice(0, count);
    view.sort(_structureModelNearFirst);
    if (view !== items) for (var si = 0; si < count; si++) items[si] = view[si];
  }
  var baseAlpha = ctx.globalAlpha, alphaNow = baseAlpha;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (var ii = 0; ii < count; ii++) {
    var it = items[ii], face = it.face, nn = face.normal;
    var projected = project(face.vertices, C);
    if (!projected || projected.length < 3) { clipped++; continue; }
    var sign = it.flip ? -1 : 1;
    var lit = worldFaceColor(debugTint ? STRUCTURE_MODEL_DEBUG_TINT : face.tint, nn.x * sign, nn.y * sign, nn.z * sign,
      face.cx, face.cy, worldFaceFog(it.dist, false), false, false);
    var want = baseAlpha * it.alpha;
    if (want !== alphaNow) { ctx.globalAlpha = want; alphaNow = want; }
    ctx.fillStyle = rgbQ((lit >>> 16) & 255, (lit >>> 8) & 255, lit & 255);
    var surface = textured ? _structureModelTexSurface(face, lit, it.dist) : null;
    if (surface ? fillSceneDepthTexturedPolygon(projected, surface) : fillSceneDepthPolygon(projected)) {
      drawn++;
      for (var pk = 0; pk < projected.length; pk++) {
        var pp = projected[pk];
        if (pp.x < minX) minX = pp.x; if (pp.x > maxX) maxX = pp.x;
        if (pp.y < minY) minY = pp.y; if (pp.y > maxY) maxY = pp.y;
      }
    } else hidden++;
  }
  if (alphaNow !== baseAlpha) ctx.globalAlpha = baseAlpha;
  for (var ci = 0; ci < count; ci++) items[ci].face = null;
  _structureModelItemCount = 0;
  pass.minX = minX; pass.minY = minY; pass.maxX = maxX; pass.maxY = maxY;
  _structureModelStat('structFaces', faces); _structureModelStat('structCulled', culled);
  _structureModelStat('structDrawn', drawn); _structureModelStat('structHidden', hidden);
  _structureModelStat('structClipped', clipped);
  return drawn;
}

// The structureModels3D stage. Never throws: an exception sets the session
// failure flag, so walls3D and the late shell draw every structure this
// frame and after.
function drawStructureModels3D() {
  var pass = _structureModelPass;
  pass.serial++; pass.ok = false; pass.wallsPending = false; pass.owner = null; pass.frame = _structureModelFrameStamp();
  pass.minX = pass.minY = 0; pass.maxX = pass.maxY = -1;
  if (!structureModelsPassWanted()) return 0;
  var drawn = 0;
  ctx.save();
  try {
    if (!ensureStructureModels() || _structureModelsFailed) return 0;
    var C = getCam3D(), project = typeof _structureModelProject === 'function' ? _structureModelProject : projectSceneWorldPolygon;
    _structureModelColumnDepths(C, project);
    // Stage E: the whole frame is textured or flat (12-world-textures.js).
    var textured = typeof beginWorldTexturePass === 'function' && beginWorldTexturePass(C);
    drawn = _drawStructureModelFaces(C, pass, project, textured);
    pass.ok = true; pass.wallsPending = true;
  } catch (e) {
    pass.ok = false; pass.wallsPending = false;
    _structureModelsFail(e, 'draw');
  } finally {
    ctx.restore();
    if (typeof endWorldTexturePass === 'function') endWorldTexturePass();
    _structureModelStat('structBuildMs', Math.round(structureModelStats.lastBuildMs * 10) / 10);
    if (_structureModelsFailed) _structureModelStat('structFailures', structureModelStats.failures);
  }
  return drawn;
}

// Packed RGB of a shell colour ('rgb(r,g,b)' from rgbQ, or '#rrggbb'); -1 if unknown.
function _structureModelColourPacked(color) {
  var cached = _structureModelColourCache[color];
  if (cached !== undefined) return cached;
  var packed = -1, m;
  if (typeof color === 'string') {
    if ((m = /^#([0-9a-fA-F]{6})$/.exec(color))) packed = parseInt(m[1], 16);
    else if ((m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(color))) packed = (m[1] << 16) | (m[2] << 8) | (+m[3]);
  }
  _structureModelColourCache[color] = packed;
  return packed;
}
// Far-band shell sink: drawRuinDecorFace's own projection and opaque fill,
// with the colour fogged by the face's camera depth.
function _structureModelFarShellFace(vertices, color, C) {
  var projected = projectSceneWorldPolygon(vertices, C);
  if (!projected || projected.length < 3) return 0;
  var sx = 0, sy = 0, n = vertices.length;
  for (var i = 0; i < n; i++) { sx += vertices[i].x; sy += vertices[i].y; }
  var dist = Math.abs((sx / n - cam.x) * C.cosAng + (sy / n - cam.y) * C.sinAng);
  var fog = worldFaceFog(dist < 1 ? 1 : dist, false), packed = _structureModelColourPacked(color);
  ctx.fillStyle = packed < 0 ? color : rgbQ(Math.floor(((packed >>> 16) & 255) * fog),
    Math.floor(((packed >>> 8) & 255) * fog), Math.floor((packed & 255) * fog));
  return fillSceneDepthPolygon(projected);
}
// drawStructures3D's question for one structure. True when the model drew
// its shell this frame (skip the legacy shell) or when the structure is
// beyond the model range, in which case its legacy shell is drawn here fogged
// in colour (the renderEntities3D gate, midpoint test included, already
// passed it). False without a model pass this frame (Legacy, a failure):
// the caller draws the legacy shell.
function structureModelHandlesShell(st, vis, C) {
  if (!structureModelsDrewThisFrame()) return false;
  var model = null;
  for (var i = 0; i < structureModels.length; i++) if (structureModels[i].structure === st) { model = structureModels[i]; break; }
  if (!model) return false;
  if (model.shellSerial === _structureModelPass.serial) return true;
  // Fail open: an exception here sets the session flag and hands this shell
  // back to the caller's legacy draw instead of aborting structures3D.
  try {
    captureRuinDecorFaces(function() { drawStructureShellWorld(st, vis, C); }, _structureModelFarShellFace);
  } catch (e) {
    _structureModelsFail(e, 'far-shell');
    return false;
  }
  _structureModelStat('structFarShells', 1);
  return true;
}

// Lazily build when the feature is switched on for an already loaded window;
// switching it on again also retries after a session failure.
function _structureModelsFeatureChanged() {
  var on = structureModelsEnabled();
  if (on && !_structureModelsWasOn) _structureModelsFailed = false;
  _structureModelsWasOn = on;
  if (grid && on && !structureModelsCurrent()) buildStructureModels();
}
function getStructureModelDrawState() {
  var pass = _structureModelPass;
  return {failed: _structureModelsFailed, failures: structureModelStats.failures, lastFailure: structureModelStats.lastFailure,
    serial: pass.serial, frame: pass.frame, ok: pass.ok, wallsPending: pass.wallsPending,
    painted: pass.maxX >= pass.minX ? {minX: pass.minX, minY: pass.minY, maxX: pass.maxX, maxY: pass.maxY} : null};
}

if (typeof defineRenderFeature === 'function') {
  defineRenderFeature({key: 'structureModels', label: 'Structure models', type: 'bool', default: true, legacy: false,
    title: 'One merged, sun-lit model per fortress, arena and watchtower (body and shell) instead of per-cell walls and the late shell.'});
}
if (typeof onRenderFeaturesChange === 'function') onRenderFeaturesChange(_structureModelsFeatureChanged);
