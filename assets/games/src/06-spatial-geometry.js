// Camera-independent terrain semantics shared by queries and both views.
// Heights remain in authored mesh units here; spatial world Z is mesh H * 25.
var SPATIAL_CORNER_MAX_DELTA_H = 4.5;

// Wall faces can continue above their regular top to close against a cave
// ceiling. Sample the authored edge endpoints, as the wall renderer does.
function spatialWallClosureH(wx, wy, topH) {
  if (typeof deepCaveRegions !== 'undefined' && deepCaveRegions.length > 0) {
    var region = isInDeepCave(wx, wy);
    if (region && region.ceilZ > 0) {
      var depth = region.depth || 1.0;
      return Math.max(topH, topH + (region.ceilZ / 25 - topH) * Math.min(1, depth * depth * 2.5));
    }
  }
  var mesh = floorMesh;
  if (!mesh || !mesh.layerCount) return topH;
  var mx = Math.floor(wx / mesh.gridSize), my = Math.floor(wy / mesh.gridSize);
  if (mx < 0 || my < 0 || mx >= mesh.w || my >= mesh.h) return topH;
  var mi = my * mesh.w + mx, ceiling = Infinity;
  for (var li = 0; li < mesh.layerCount[mi]; li++) {
    if (mesh['l'+li+'Type'][mi] === 2) ceiling = Math.min(ceiling, mesh['l'+li+'TopZ'][mi]);
  }
  return ceiling < Infinity ? Math.max(topH, ceiling) : topH;
}

function getSpatialLayerRole(mesh, ci, li, type) {
  var meta = 0;
  if (li === 0) meta = mesh.l0Meta ? mesh.l0Meta[ci] : 0;
  else if (li === 1) meta = mesh.l1Meta ? mesh.l1Meta[ci] : 0;
  else if (li === 2) meta = mesh.l2Meta ? mesh.l2Meta[ci] : 0;
  else if (li === 3) meta = mesh.l3Meta ? mesh.l3Meta[ci] : 0;
  else meta = mesh.l4Meta ? mesh.l4Meta[ci] : 0;
  var role = meta & 0x7f;
  if (role) return role;
  // Fixed/legacy meshes may not carry metadata. Keep a conservative fallback
  // that still separates caps and ledges from ordinary ground.
  if (type === 4) return 3;
  if (type === 3) return 4;
  if (type === 1) {
    return mesh.ceilAboveMask && ((mesh.ceilAboveMask[ci] >> li) & 1) ? 2 : 1;
  }
  return 0;
}

function findSpatialRoleZ(mesh, ci, targetRole, targetZ, sourceCi) {
  var lc = mesh.layerCount[ci];
  if (!lc) return NaN;
  var bestZ = 0, bestDiff = 1e9, exteriorZ = 0, exteriorDiff = 1e9;
  var mouthZ = 0, mouthDiff = 1e9;
  var sourceSurface = mesh.surfaceH && sourceCi >= 0 ? mesh.surfaceH[sourceCi] : NaN;
  for (var li = 0; li < lc; li++) {
    var type, z;
    if (li === 0) { type = mesh.l0Type[ci]; z = mesh.l0TopZ[ci]; }
    else if (li === 1) { type = mesh.l1Type[ci]; z = mesh.l1TopZ[ci]; }
    else if (li === 2) { type = mesh.l2Type[ci]; z = mesh.l2TopZ[ci]; }
    else if (li === 3) { type = mesh.l3Type[ci]; z = mesh.l3TopZ[ci]; }
    else { type = mesh.l4Type[ci]; z = mesh.l4TopZ[ci]; }
    if (type !== 1 && type !== 3 && type !== 4) continue;
    var role = getSpatialLayerRole(mesh, ci, li, type);
    var diff = z > targetZ ? z - targetZ : targetZ - z;
    if (role === targetRole) {
      if (diff < bestDiff) { bestDiff = diff; bestZ = z; }
      continue;
    }
    // Surface and cap are two storage roles for one exterior terrain skin.
    // Join them only when both samples still sit on their natural surface.
    // The depressed approach fails this test, so it cannot pull the cap down
    // into a green spike at the mouth.
    if ((targetRole === 1 && role === 3) || (targetRole === 3 && role === 1)) {
      var neighborSurface = mesh.surfaceH ? mesh.surfaceH[ci] : NaN;
      if (sourceSurface === sourceSurface && neighborSurface === neighborSurface &&
          Math.abs(targetZ - sourceSurface) <= 0.6 &&
          Math.abs(z - neighborSurface) <= 0.6 && diff <= 1.5 &&
          diff < exteriorDiff) {
        exteriorDiff = diff;
        exteriorZ = z;
      }
    }
    // Open approach (surface role) and covered tunnel floor (cave-floor role)
    // are physically one support at the portal plane. Preserve that seam only
    // while it is within the movement step contract; deeper/lateral strata
    // remain separate instead of being stretched into a sloped quad.
    if (((targetRole === 1 && role === 2) || (targetRole === 2 && role === 1)) &&
        diff <= 1.0 && diff < mouthDiff) {
      mouthDiff = diff;
      mouthZ = z;
    }
  }
  return bestDiff < 1e9 ? bestZ :
    exteriorDiff < 1e9 ? exteriorZ : mouthDiff < 1e9 ? mouthZ : NaN;
}

function findSpatialCeilingZ(mesh, ci, targetZ) {
  var lc = mesh.layerCount[ci], bestZ = 0, bestDiff = 1e9;
  for (var li = 0; li < lc; li++) {
    var type, z;
    if (li === 0) { type=mesh.l0Type[ci]; z=mesh.l0TopZ[ci]; }
    else if (li === 1) { type=mesh.l1Type[ci]; z=mesh.l1TopZ[ci]; }
    else if (li === 2) { type=mesh.l2Type[ci]; z=mesh.l2TopZ[ci]; }
    else if (li === 3) { type=mesh.l3Type[ci]; z=mesh.l3TopZ[ci]; }
    else { type=mesh.l4Type[ci]; z=mesh.l4TopZ[ci]; }
    if (type !== 2) continue;
    var diff = z > targetZ ? z-targetZ : targetZ-z;
    if (diff < bestDiff) {bestDiff=diff;bestZ=z;}
  }
  return bestDiff <= 0.8 ? bestZ : NaN;
}

// Corner order is top-left, top-right, bottom-left, bottom-right. The quad is
// split along 0->3, exactly as the floor and ceiling drawing passes split it.
// A missing join is a missing triangle, not a bridge to another stratum.
function spatialLayerCorners(mesh, ci, li) {
  if (!mesh || !mesh.layerCount || !Number.isInteger(ci) || ci < 0 ||
      ci >= mesh.w * mesh.h || !Number.isInteger(li) || li < 0 ||
      li >= mesh.layerCount[ci] || ci % mesh.w >= mesh.w - 1 ||
      Math.floor(ci / mesh.w) >= mesh.h - 1) return null;
  var type = mesh['l' + li + 'Type'][ci], z = mesh['l' + li + 'TopZ'][ci];
  if ((type !== 1 && type !== 2 && type !== 3 && type !== 4) || !Number.isFinite(z)) return null;
  var z1, z2, z3;
  if (type === 2) {
    z1 = findSpatialCeilingZ(mesh, ci + 1, z);
    z2 = findSpatialCeilingZ(mesh, ci + mesh.w, z);
    z3 = findSpatialCeilingZ(mesh, ci + mesh.w + 1, z);
  } else {
    var role = getSpatialLayerRole(mesh, ci, li, type);
    z1 = findSpatialRoleZ(mesh, ci + 1, role, z, ci);
    z2 = findSpatialRoleZ(mesh, ci + mesh.w, role, z, ci);
    z3 = findSpatialRoleZ(mesh, ci + mesh.w + 1, role, z, ci);
  }
  if (!Number.isFinite(z1) || !Number.isFinite(z2) || !Number.isFinite(z3)) return null;
  var tolerance = SPATIAL_CORNER_MAX_DELTA_H;
  return [z, Math.max(z - tolerance, Math.min(z + tolerance, z1)),
    Math.max(z - tolerance, Math.min(z + tolerance, z2)),
    Math.max(z - tolerance, Math.min(z + tolerance, z3))];
}

// referenceZ, when supplied, is spatial world Z; otherwise underground selects
// the lowest support and surface selects the highest. This does not consult
// the camera or player. Missing/unloaded support stays NaN, never floor zero.
function sampleSpatialSupportZ(wx, wy, referenceZ, underground, requireTriangle) {
  var mesh = floorMesh;
  if (!mesh || !mesh.layerCount) return NaN;
  var gs = mesh.gridSize, gx = Math.floor(wx / gs), gy = Math.floor(wy / gs);
  if (gx < 0 || gy < 0 || gx >= mesh.w || gy >= mesh.h) return NaN;
  var ci = gy * mesh.w + gx, li = -1, z = 0, score = Infinity;
  for (var k = 0; k < mesh.layerCount[ci]; k++) {
    var type = mesh['l' + k + 'Type'][ci], h = mesh['l' + k + 'TopZ'][ci];
    if ((type !== 1 && type !== 3 && type !== 4) || !Number.isFinite(h)) continue;
    var next = Number.isFinite(referenceZ) ? Math.abs(h * 25 - referenceZ) : underground ? h : -h;
    if (next < score) { score = next; li = k; z = h; }
  }
  if (li < 0) return NaN;
  var corners = spatialLayerCorners(mesh, ci, li);
  // Keep a real cell's support at a stratum edge; decal/query callers that need
  // the actual terrain face explicitly reject a missing triangle instead.
  if (!corners) return requireTriangle ? NaN : z * 25;
  var tx = wx / gs - gx, ty = wy / gs - gy;
  return 25 * (tx >= ty ? z + tx * (corners[1] - z) + ty * (corners[3] - corners[1]) :
    z + ty * (corners[2] - z) + tx * (corners[3] - corners[2]));
}
