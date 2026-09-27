// Shared upright-body controller. Arcade acceleration, bounce, jump velocity
// and AI cadence remain caller policies. Geometry never reads camera/view mode.
var spatialSimulationTick = 0;
var SPATIAL_MOVE_MAX_STEPS = 128;
// Opt-in coarse stage profiling. No timing calls or buffers in normal play.
var physicsProfileEnabled=false, physicsStageSamples={};
function physicsStageStart() {return physicsProfileEnabled?performance.now():0;}
function physicsStageEnd(name,start) {
  if (!physicsProfileEnabled) return;
  var samples=physicsStageSamples[name];
  if (!samples) samples=physicsStageSamples[name]={values:new Float64Array(4096),count:0};
  samples.values[samples.count++%4096]=performance.now()-start;
}
function physicsProfileReport() {
  var report={};
  Object.keys(physicsStageSamples).forEach(function(name) {
    var s=physicsStageSamples[name], a=Array.prototype.slice.call(s.values,0,Math.min(s.count,4096));
    a.sort(function(x,y){return x-y;});
    function percentile(p){return a[Math.max(0,Math.ceil(a.length*p)-1)];}
    report[name]={samples:a.length,totalCalls:s.count,p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),maxMs:a[a.length-1]};
  });
  return report;
}
var _spatialFootOffsets = [0,0, -1,0, 1,0, 0,-1, 0,1, -.707,-.707, .707,-.707, -.707,.707, .707,.707];

function spatialValidBody(body) {
  return !!body && Number.isFinite(body.feetZ) &&
    (body.height===undefined || (Number.isFinite(body.height) && body.height>0)) &&
    (body.radius===undefined || (Number.isFinite(body.radius) && body.radius>=0)) &&
    (body.stepHeight===undefined || (Number.isFinite(body.stepHeight) && body.stepHeight>=0));
}

function spatialQuerySupport(body,x,y) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !spatialValidBody(body)) return {status:'invalid',feetZ:null};
  if (body.trackFloor===false || !floorMesh) {
    return !floorMesh && ENDLESS_MODE && body.trackFloor!==false ? {status:'unloaded',feetZ:null} :
      {status:'walk',feetZ:0,ceilingZ:Infinity,supportId:'flat'};
  }
  var step=body.airborne?0:(body.stepHeight===undefined?25:body.stepHeight);
  var height=body.height===undefined?70:body.height;
  var picked=getWalkableLayerTopAt(x,y,body.feetZ/25,{stepUp:step/25,bodyH:height/25});
  var idx=picked.idx>=0?picked.idx:picked.supportIdx;
  var gx=Math.floor(x/floorMesh.gridSize), gy=Math.floor(y/floorMesh.gridSize);
  return {status:picked.action==='missing'?'unloaded':picked.action,feetZ:picked.topH===null?null:picked.topH*25,
    ceilingZ:picked.ceilingH*25,supportId:idx>=0?spatialSurfaceId('support',gx,gy,floorMesh.gridSize,idx):null};
}

function spatialBodyHitsWall(body,x,y,work) {
  if (!spatialValidBody(body)) return true;
  var r=body.radius===undefined?6:body.radius, height=body.height===undefined?70:body.height;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(body.feetZ) || r<0 || !Number.isFinite(r)) return true;
  if (!grid) return false;
  var x0=Math.floor((x-r)/cell), x1=Math.floor((x+r)/cell), y0=Math.floor((y-r)/cell), y1=Math.floor((y+r)/cell);
  if (x0<0 || y0<0 || x1>=gridW || y1>=gridH) return true;
  for (var gy=y0;gy<=y1;gy++) for (var gx=x0;gx<=x1;gx++) {
    if (work) work.wallCells=(work.wallCells||0)+1;
    if (!grid[gy*gridW+gx]) continue;
    var nx=Math.max(gx*cell,Math.min(x,(gx+1)*cell)), ny=Math.max(gy*cell,Math.min(y,(gy+1)*cell));
    var dx=x-nx, dy=y-ny;
    if (dx*dx+dy*dy>=r*r-1e-8 && (dx || dy)) continue;
    var span=spatialWallSpan(gx,gy);
    if (!span) return true;
    var top=span.topZ;
    // The floor supporting the actor already accounts for the cap. A buried
    // wall cannot block a body above it; a real sloping closure still can.
    if (body.feetZ>=top-1e-6) top=Math.max(top,spatialWallClosureH(nx,ny,top/25)*25);
    if (body.feetZ<top-1e-6 && body.feetZ+height>span.baseZ+1e-6) return true;
  }
  return false;
}

function spatialBodyBlocked(body,x,y,work) {
  if (spatialBodyHitsWall(body,x,y,work)) return true;
  if (body.trackFloor===false) return false;
  var r=body.radius===undefined?6:body.radius, sampledCells=[];
  for (var i=0;i<_spatialFootOffsets.length;i+=2) {
    var fx=x+_spatialFootOffsets[i]*r, fy=y+_spatialFootOffsets[i+1]*r;
    // Support/headroom currently use discrete authored cells. Several circle
    // samples often land in one cell; query it once per footprint, not once
    // per point. This is local deduplication, never a cross-tick geometry cache.
    // Revisit this optimization if support changes to continuous triangles.
    var ci=meshCellAt(fx,fy);
    if (sampledCells.indexOf(ci)>=0) continue;
    sampledCells.push(ci);
    if (work) work.supportSamples=(work.supportSamples||0)+1;
    var support=spatialQuerySupport(body,fx,fy);
    if (support.status==='blocked' || support.status==='unloaded' || support.status==='invalid' ||
        (support.status==='fall' && body.allowFall===false && !body.airborne)) return true;
  }
  return false;
}

// Subdivide by authored cell width, never by render pixels or frame rate. A
// body cannot cross a whole wall cell between two checks. Extraordinary motion
// beyond the bounded work budget is returned as remaining travel, never jumped.
function spatialMoveBody(body,dx,dy,work) {
  var result={hitX:false,hitY:false,steps:0,remainingX:0,remainingY:0,status:'walk'};
  if (!spatialValidBody(body) || !Number.isFinite(body.x) || !Number.isFinite(body.y) ||
      !Number.isFinite(dx) || !Number.isFinite(dy)) {result.status='invalid';return result;}
  var size=Math.min(cell||12,floorMesh?floorMesh.gridSize:Infinity), stride=Math.max(.25,size*.4);
  var needed=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/stride));
  var steps=Math.min(needed,SPATIAL_MOVE_MAX_STEPS), sx=dx/needed, sy=dy/needed;
  for (var i=0;i<steps;i++) {
    result.steps++; if (work) work.steps=(work.steps||0)+1;
    var blockedX=false, blockedY=false;
    if (sx) {
      blockedX=spatialBodyBlocked(body,body.x+sx,body.y,work);
      if (!blockedX) body.x+=sx; else result.hitX=true;
    }
    if (sy) {
      blockedY=spatialBodyBlocked(body,body.x,body.y+sy,work);
      if (!blockedY) body.y+=sy; else result.hitY=true;
    }
    var support=spatialQuerySupport(body,body.x,body.y);
    result.status=support.status; body.supportId=support.supportId;
    if (!body.airborne && body.updateFeet!==false && support.status==='walk') body.feetZ=support.feetZ;
    if ((!sx || blockedX) && (!sy || blockedY)) break;
  }
  if (needed>steps) {
    result.remainingX=sx*(needed-steps); result.remainingY=sy*(needed-steps); result.status='limited';
  }
  return result;
}

function spatialActorBody(entity,radius) {
  var feet=entityFeetSpatialZ(entity);
  var body={x:entity.x,y:entity.y,feetZ:feet,radius:radius,height:entity.bodyHeight||70,stepHeight:25,allowFall:false,
    trackFloor:!!floorMesh || ENDLESS_MODE};
  // Bootstrap onto its real support once; subsequent motion carries that
  // stratum through entrances, rather than choosing top/bottom anew each tick.
  var support=spatialQuerySupport(body,body.x,body.y);
  if (support.status==='walk') body.feetZ=support.feetZ;
  return body;
}

function moveSpatialActor(entity,dx,dy,radius) {
  var body=spatialActorBody(entity,radius), result=spatialMoveBody(body,dx,dy);
  entity.x=body.x; entity.y=body.y; entity.feetZ=body.feetZ; entity.supportId=body.supportId;
  // Enemy z is a legacy absolute feet field; companion z is cosmetic bounce.
  if (entity.enemyType) entity.z=body.feetZ;
  if (Object.prototype.hasOwnProperty.call(entity,'renderFloorZ')) {
    entity.renderFloorZ=sampleSpatialSupportZ(body.x,body.y,body.feetZ);
  }
  if (Number.isFinite(body.feetZ)) entity.underground=getCaveSpaceAt(body.x,body.y,body.feetZ/25).underground;
  return result;
}

function spatialBodiesOverlapHeight(a,b) {
  var za=entityFeetSpatialZ(a), zb=entityFeetSpatialZ(b);
  return Number.isFinite(za) && Number.isFinite(zb) && za<zb+(b.bodyHeight||70)-1e-6 && zb<za+(a.bodyHeight||70)-1e-6;
}

// Following companions/allies retain their intentional catch-up teleport, but
// choose a supported, clear footprint on the player's storey, never inside rock.
function placeSpatialActorNear(entity,x,y,feetZ,radius) {
  var body={x:x,y:y,feetZ:feetZ,radius:radius,height:entity.bodyHeight||70,allowFall:false,trackFloor:!!floorMesh||ENDLESS_MODE};
  for (var i=0;i<17;i++) {
    var angle=(i-1)%8*Math.PI/4, distance=i?Math.ceil(i/8)*12:0;
    var tx=x+Math.cos(angle)*distance, ty=y+Math.sin(angle)*distance;
    if (spatialBodyBlocked(body,tx,ty)) continue;
    var support=spatialQuerySupport(body,tx,ty);
    if (support.status!=='walk') continue;
    entity.x=tx;entity.y=ty;entity.feetZ=support.feetZ;entity.supportId=support.supportId;
    if (typeof resetRenderInterpolation === 'function') resetRenderInterpolation(entity);
    entity.underground=getCaveSpaceAt(tx,ty,support.feetZ/25).underground;
    if (Object.prototype.hasOwnProperty.call(entity,'renderFloorZ')) entity.renderFloorZ=sampleSpatialSupportZ(tx,ty,support.feetZ);
    return true;
  }
  return false;
}

function spatialPlayerBody() {
  return {x:pos.x,y:pos.y,feetZ:playerFeetSpatialZ(),radius:6,height:70,stepHeight:25,
    airborne:jumpAirborne,allowFall:true,updateFeet:false,trackFloor:tracksMeshFloor()};
}
