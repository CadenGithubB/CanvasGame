// Candidate only: not loaded by production until approved and integrated.
// Static corner results, not camera transforms/materials/lighting. Tiles make
// first use incremental; a fixed byte cap bounds memory even on huge meshes.
var FLOOR_STITCH_TILE_CELLS = 256;
var FLOOR_STITCH_CACHE_BYTES = 4 * 1024 * 1024;

function getFloorStitchCache(mesh) {
  var cache = mesh._floorRenderStitches;
  // buildWalkCandZ is the existing geometry-finalization boundary. It replaces
  // walkCandZ on every rebuild, including rebuilding a reused mesh object.
  // Future in-place height/type/meta changes must rebuild that derived data
  // or delete _floorRenderStitches before another render.
  if (!cache || cache.stamp !== mesh.walkCandZ || cache.w !== mesh.w || cache.h !== mesh.h) {
    cache = mesh._floorRenderStitches = {stamp:mesh.walkCandZ,w:mesh.w,h:mesh.h,
      floors:[],ceilings:[],bytes:0,hits:0,misses:0,fallbacks:0,
      scratch:{values:new Float64Array(FLOOR_STITCH_TILE_CELLS*3)}};
  }
  return cache;
}

function findCeilingRenderMatchZ(mesh, ci, targetZ) {
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

function getFloorStitchTile(mesh, cache, ci, li, role, z, ceiling) {
  var layers = ceiling ? cache.ceilings : cache.floors;
  var tiles = layers[li] || (layers[li]=[]), tileIndex=ci>>>8;
  var tile = tiles[tileIndex], slot=ci&255, offset=slot*3;
  if (tile && tile.ready[slot]) {
    cache.hits++;
    if (!ceiling) _cacheStats.matchZ.hits+=3;
    return tile;
  }
  if (!tile) {
    var tileBytes=FLOOR_STITCH_TILE_CELLS*(3*8+1);
    if (cache.bytes+tileBytes <= FLOOR_STITCH_CACHE_BYTES) {
      tile=tiles[tileIndex]={values:new Float64Array(FLOOR_STITCH_TILE_CELLS*3),ready:new Uint8Array(FLOOR_STITCH_TILE_CELLS)};
      cache.bytes+=tileBytes;
    } else {
      tile=cache.scratch;cache.fallbacks++;
    }
  }
  var values=tile.values,mw=mesh.w;
  if (ceiling) {
    values[offset]=findCeilingRenderMatchZ(mesh,ci+1,z);
    values[offset+1]=findCeilingRenderMatchZ(mesh,ci+mw,z);
    values[offset+2]=findCeilingRenderMatchZ(mesh,ci+mw+1,z);
  } else {
    values[offset]=findFloorRenderRoleZ(mesh,ci+1,role,z,ci);
    values[offset+1]=findFloorRenderRoleZ(mesh,ci+mw,role,z,ci);
    values[offset+2]=findFloorRenderRoleZ(mesh,ci+mw+1,role,z,ci);
    _cacheStats.matchZ.misses+=3;
  }
  if(tile.ready)tile.ready[slot]=1;
  cache.misses++;
  return tile;
}
