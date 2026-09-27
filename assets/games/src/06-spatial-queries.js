// Shared 2.5D query boundary. XY is window-local; Z is world distance (mesh H
// times 25), NOT legacy player floorZ or camera Z. No Canvas/view-mode state.
// These are point rays, not a character solver or swept projectile volumes.
var SPATIAL_Z_SCALE = 25;
var SPATIAL_WALL_HEIGHT = 240; // authored wall unit, independent of canvas size
function playerFeetSpatialZ() { return getPlayerFloorH() * SPATIAL_Z_SCALE; }
function spatialZToPlayerZ(z) { return meshHeightToPlayerZ(z / SPATIAL_Z_SCALE); }
function entityFeetSpatialZ(entity) {
  if (Number.isFinite(entity.feetZ)) return entity.feetZ;
  // Old surface entities often have a stale z=0. Resolve their actual stratum;
  // cave chest identity survives window assembly even without an underground flag.
  if (!floorMesh) return ENDLESS_MODE ? NaN : 0; // authored flat fixed levels
  return sampleSpatialSupportZ(entity.x, entity.y, NaN,
    !!(entity.underground || entity.caveSpawnId));
}

// Shared solid cell envelope for rays, actor footprints and projectile sweeps.
// Exposed sloping ceiling closures are queried separately at their edge points.
function spatialWallSpan(gx, gy) {
  if (!grid || gx<0 || gy<0 || gx>=gridW || gy>=gridH || !grid[gy*gridW+gx]) return null;
  var ci=gy*gridW+gx, h=spatialLowestFloorH((gx+0.5)*cell,(gy+0.5)*cell);
  if (!Number.isFinite(h)) return null;
  var base=h*25, top=base+SPATIAL_WALL_HEIGHT*(wallHeights?wallHeights[ci]:1);
  if (wallFaceBase) base=Math.min(wallFaceBase[ci*4],wallFaceBase[ci*4+1],wallFaceBase[ci*4+2],wallFaceBase[ci*4+3])*25;
  if (wallMaxTopZ && Number.isFinite(wallMaxTopZ[ci])) top=Math.min(top,wallMaxTopZ[ci]*25);
  return {baseZ:base,topZ:top};
}

function spatialSurfaceId(kind, gx, gy, size, layer) {
  var ox = ENDLESS_MODE ? windowOriginX : 0, oy = ENDLESS_MODE ? windowOriginY : 0;
  return kind + ':' + (gx * size + ox) + ':' + (gy * size + oy) + ':' + layer;
}

// Read live geometry, not the legacy tick-local floor cache: query callers can
// edit/replace a mesh and ask again before the next render increments its tick.
function spatialLowestFloorH(x, y) {
  var mesh=floorMesh;
  if (!mesh) return ENDLESS_MODE ? NaN : 0;
  var gx=Math.floor(x/mesh.gridSize), gy=Math.floor(y/mesh.gridSize);
  if (gx<0 || gy<0 || gx>=mesh.w || gy>=mesh.h) return NaN;
  var ci=gy*mesh.w+gx, h=Infinity;
  for (var li=0;li<mesh.layerCount[ci];li++) {
    var type=meshLayerType(mesh,ci,li);
    if (type===1 || type===3 || type===4) h=Math.min(h,meshLayerHeight(mesh,ci,li));
  }
  return h<Infinity ? h : NaN;
}

// Exact grid traversal, including the two side cells at a corner (supercover).
// No half-cell sampling that can step over a thin wall. Work is proportional
// to ray length, not window area. The visitor may stop at the first obstruction.
function spatialVisitCells(a, b, size, w, h, visit) {
  var dx = b.x - a.x, dy = b.y - a.y;
  var gx = Math.floor(a.x / size), gy = Math.floor(a.y / size);
  var sx = dx > 0 ? 1 : dx < 0 ? -1 : 0, sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  var tx = sx ? ((gx + (sx > 0 ? 1 : 0)) * size - a.x) / dx : Infinity;
  var ty = sy ? ((gy + (sy > 0 ? 1 : 0)) * size - a.y) / dy : Infinity;
  var stepx = sx ? size / Math.abs(dx) : Infinity, stepy = sy ? size / Math.abs(dy) : Infinity;
  var t = 0;
  for (var n = 0; n < w + h + 4; n++) {
    var end = Math.min(1, tx, ty);
    if (visit(gx, gy, t, end) === false) return;
    if (n===0) {
      // Starting on a closed face also touches the cell behind the ray, even
      // when moving away from that cell and never crossing its interior.
      if (sx && a.x===gx*size && visit(gx-1,gy,0,0)===false) return;
      if (sy && a.y===gy*size && visit(gx,gy-1,0,0)===false) return;
      if ((sx || sy) && a.x===gx*size && a.y===gy*size && visit(gx-1,gy-1,0,0)===false) return;
    }
    // Closed solids: travelling exactly along a grid line touches both sides.
    var edgeX=!sx && a.x===gx*size, edgeY=!sy && a.y===gy*size;
    if (edgeX && visit(gx-1,gy,t,end)===false) return;
    if (edgeY && visit(gx,gy-1,t,end)===false) return;
    if (edgeX && edgeY && visit(gx-1,gy-1,t,end)===false) return;
    if (end >= 1) {
      var ex=Math.floor(b.x/size), ey=Math.floor(b.y/size);
      if (visit(ex,ey,1,1)===false) return;
      if (b.x===ex*size && visit(ex-1,ey,1,1)===false) return;
      if (b.y===ey*size && visit(ex,ey-1,1,1)===false) return;
      if (b.x===ex*size && b.y===ey*size) visit(ex-1,ey-1,1,1);
      return;
    }
    if (Math.abs(tx - ty) < 1e-12) {
      if (visit(gx + sx, gy, end, end) === false || visit(gx, gy + sy, end, end) === false) return;
      gx += sx; gy += sy; tx += stepx; ty += stepy;
    } else if (tx < ty) { gx += sx; tx += stepx; }
    else { gy += sy; ty += stepy; }
    t = end;
  }
}

// First opaque obstruction, or an explicit unavailable/invalid result. No
// result cache: window replacement and in-place geometry edits are visible
// immediately, without a time-based stale-LOS interval. Optional work counters
// are for tests/profiling; timing is deliberately outside the hot path.
function spatialRaycast(a, b, work) {
  var result = {status:'clear', t:1, kind:null, surfaceId:null};
  if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.z) ||
      !Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.z)) {
    result.status = 'invalid'; return result;
  }
  var dx = b.x-a.x, dy = b.y-a.y, dz = b.z-a.z, eps = 1e-7;
  function count(key) { if (work) work[key] = (work[key] || 0) + 1; }
  function hit(t, kind, id, unavailable) {
    if (t < -eps || t > result.t + eps) return;
    if (result.status !== 'clear' && t >= result.t - eps) return;
    result = {status:unavailable ? 'unloaded' : 'blocked', t:Math.max(0,t), kind:kind, surfaceId:id};
  }
  var mesh = floorMesh;
  if (mesh && mesh.layerCount) {
    var gs = mesh.gridSize;
    spatialVisitCells(a,b,gs,mesh.w,mesh.h,function(gx,gy,start,end) {
      if (start > result.t + eps) return false;
      count('terrainCells');
      if (gx < 0 || gy < 0 || gx >= mesh.w-1 || gy >= mesh.h-1) {
        hit(start,'terrain',null,true); return false;
      }
      var ci = gy*mesh.w+gx, lc = mesh.layerCount[ci];
      if (!lc) { hit(start,'terrain',null,true); return false; }
      var localX = a.x/gs-gx, localY = a.y/gs-gy;
      for (var li=0;li<lc;li++) {
        var type = meshLayerType(mesh,ci,li);
        if (type < 1 || type > 4) continue;
        var corners = spatialLayerCorners(mesh,ci,li);
        if (!corners) continue; // a semantic edge is an opening, not a stretched roof
        var id = null, kind = type===2 ? 'ceiling' : type===4 ? 'cap' : 'floor';
        for (var tri=0;tri<2;tri++) {
          count('triangles');
          // z = z0 + u*x + v*y on the renderer's NW-SE diagonal.
          var u = (tri===0 ? corners[1]-corners[0] : corners[3]-corners[2])*25;
          var v = (tri===0 ? corners[3]-corners[1] : corners[2]-corners[0])*25;
          var gap = a.z-(corners[0]*25+u*localX+v*localY);
          var rate = dz-u*dx/gs-v*dy/gs;
          if (Math.abs(rate) < eps) continue; // parallel, not crossing the skin
          var t = -gap/rate;
          if (t < start-eps || t > end+eps || t < 0 || t > result.t+eps) continue;
          var x = localX+dx*t/gs, y = localY+dy*t/gs;
          if (tri===0 ? x+eps<y : y+eps<x) continue;
          id = spatialSurfaceId(kind,gx,gy,gs,li);
          hit(t,kind,id,false);
        }
        // A segment starting inside the roof volume must not see sideways
        // through it merely because it crosses neither its ceiling nor cap.
        if (type===2) {
          var tx0 = localX+dx*start/gs, ty0 = localY+dy*start/gs;
          var low = spatialCornerHeight(corners,tx0,ty0)*25;
          var high = Infinity;
          for (var cap=0;cap<lc;cap++) {
            var capType=meshLayerType(mesh,ci,cap);
            if (capType!==1 && capType!==3 && capType!==4) continue;
            var capCorners = spatialLayerCorners(mesh,ci,cap);
            if (!capCorners) continue;
            var candidate=spatialCornerHeight(capCorners,tx0,ty0)*25;
            if (candidate>low+eps && candidate<high) high=candidate;
          }
          // Stop at the nearest upper support, never swallow an open upper
          // passage by pairing a lower ceiling with a distant exterior cap.
          var z=a.z+dz*start;
          if (high<Infinity && z>low+eps && z<high-eps) hit(start,'slab',spatialSurfaceId('slab',gx,gy,gs,li),false);
        }
      }
    });
  } else if (ENDLESS_MODE) {
    hit(0,'terrain',null,true);
  }
  if (grid) {
    spatialVisitCells(a,b,cell,gridW,gridH,function(gx,gy,start,end) {
      if (start > result.t+eps) return false;
      count('wallCells');
      if (gx<0 || gy<0 || gx>=gridW || gy>=gridH) {
        hit(start,'wall',null,true); return false;
      }
      var ci = gy*gridW+gx;
      if (!grid[ci]) return;
      count('wallTests');
      var floorH = spatialLowestFloorH((gx+0.5)*cell,(gy+0.5)*cell);
      if (!Number.isFinite(floorH)) { hit(start,'wall',null,true); return false; }
      var base = floorH*25, top = base+SPATIAL_WALL_HEIGHT*(wallHeights ? wallHeights[ci] : 1);
      if (wallFaceBase) {
        base = Math.min(wallFaceBase[ci*4],wallFaceBase[ci*4+1],wallFaceBase[ci*4+2],wallFaceBase[ci*4+3])*25;
      }
      if (wallMaxTopZ && Number.isFinite(wallMaxTopZ[ci])) top = Math.min(top,wallMaxTopZ[ci]*25);
      if (top<=base) return;
      var lo=start, hi=end;
      if (Math.abs(dz)<eps) { if (a.z<base-eps || a.z>top+eps) hi=-1; }
      else {
        var t0=(base-a.z)/dz, t1=(top-a.z)/dz;
        lo=Math.max(lo,Math.min(t0,t1)); hi=Math.min(hi,Math.max(t0,t1));
      }
      if (lo<=hi+eps) hit(lo,'wall',spatialSurfaceId('wall',gx,gy,cell,0),false);
      // The visible cave closure is a sloped face, not a full-height box:
      // test its four exposed edges with interpolated endpoint heights.
      if (Math.max(a.z+dz*start,a.z+dz*end)<=top+eps) return;
      for (var face=0;face<4;face++) {
        var nx=gx+(face===0?-1:face===1?1:0), ny=gy+(face===2?-1:face===3?1:0);
        if (nx>=0 && ny>=0 && nx<gridW && ny<gridH && grid[ny*gridW+nx]) continue;
        var x1=(gx+(face===1?1:0))*cell, y1=(gy+(face===3?1:0))*cell;
        var x2=x1+(face>=2?cell:0), y2=y1+(face<2?cell:0);
        var rate=face<2?dx:dy;
        if (Math.abs(rate)<eps) continue;
        var t=((face<2?x1:y1)-(face<2?a.x:a.y))/rate;
        if (t<start-eps || t>end+eps || t>result.t+eps) continue;
        var along=face<2?(a.y+dy*t-y1)/cell:(a.x+dx*t-x1)/cell;
        if (along<-eps || along>1+eps) continue;
        count('wallClosures');
        var top1=spatialWallClosureH(x1,y1,top/25)*25, top2=spatialWallClosureH(x2,y2,top/25)*25;
        var z=a.z+dz*t;
        if (z>top+eps && z<=top1+(top2-top1)*along+eps) {
          hit(t,'wall',spatialSurfaceId('wall',gx,gy,cell,face),false);
        }
      }
    });
  }
  if (result.status==='blocked') result.point={x:a.x+dx*result.t,y:a.y+dy*result.t,z:a.z+dz*result.t};
  return result;
}

function spatialCornerHeight(c, x, y) {
  return x>=y ? c[0]+x*(c[1]-c[0])+y*(c[3]-c[1]) : c[0]+y*(c[2]-c[0])+x*(c[3]-c[2]);
}

function canReachChest(ch) {
  if (!ch || ch.collected || Math.hypot(pos.x-ch.x,pos.y-ch.y)>=90) return false;
  var feet=playerFeetSpatialZ(), target=entityFeetSpatialZ(ch);
  // Preserve the horizontal reach and permit nearby support-height changes, but
  // not a pickup from a different storey or while jumping far overhead.
  if (!Number.isFinite(target) || Math.abs(feet-target)>PLAYER_BODY_H*25) return false;
  return spatialRaycast({x:pos.x,y:pos.y,z:feet+35},{x:ch.x,y:ch.y,z:target+16}).status==='clear';
}

function enemyCanSeePlayer(e) {
  var feet=entityFeetSpatialZ(e);
  return spatialRaycast({x:e.x,y:e.y,z:feet+35},
    {x:pos.x,y:pos.y,z:playerFeetSpatialZ()+35}).status==='clear';
}
