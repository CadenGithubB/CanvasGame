// Bounded local navigation. Search probes clone the same upright body used by
// locomotion; a route is advice, never permission to bypass live collision.
var NPC_NAV_MAX_EDGES_PER_TICK=48, NPC_NAV_MAX_NODES=384, NPC_NAV_MAX_JOBS=64;
var npcNavigationStats={requests:0,edges:0,expanded:0,completed:0,failed:0,
  deferred:0,invalidations:0,maxEdgesPerTick:0,probeSteps:0};
var _npcNavQueue=[],_npcNavTick=-1,_npcNavGeneration=0,_npcNavRevision=0;
var _npcNavGrid=null,_npcNavMesh=null,_npcNavWalls=null,_npcNavOriginX=NaN,_npcNavOriginY=NaN;
var _npcNavSeenRevision=-1;

function resetNpcNavigation() {
  _npcNavQueue=[];_npcNavTick=-1;_npcNavGeneration++;
  Object.keys(npcNavigationStats).forEach(function(key){npcNavigationStats[key]=0;});
}
function invalidateNpcNavigation() { _npcNavRevision++; }
function npcOwnerSupportZ() {
  // Follow reachable ground, not the owner's temporary jump height or smoothed
  // presentation-compatible floorZ. Missing geometry never becomes floor zero.
  var support=spatialQuerySupport(spatialPlayerBody(),pos.x,pos.y);
  return support.status==='walk' || support.status==='fall' ? support.feetZ : NaN;
}
function npcResetNavigation(actor) {
  if(!actor.npc || !actor.npc.navigation)return;
  if(actor.npc.navigation.job)actor.npc.navigation.job.cancelled=true;
  actor.npc.navigation=null;
}
function npcNavWorldCheck() {
  if(_npcNavGrid===grid && _npcNavMesh===floorMesh && _npcNavWalls===wallHeights &&
      _npcNavOriginX===windowOriginX && _npcNavOriginY===windowOriginY && _npcNavSeenRevision===_npcNavRevision)return;
  _npcNavGrid=grid;_npcNavMesh=floorMesh;_npcNavWalls=wallHeights;
  _npcNavOriginX=windowOriginX;_npcNavOriginY=windowOriginY;_npcNavSeenRevision=_npcNavRevision;
  _npcNavGeneration++;_npcNavQueue=[];npcNavigationStats.invalidations++;
}
function npcNavHeapPush(job,node) {
  var heap=job.open,i=heap.length;heap.push(node);
  while(i) {var p=(i-1)>>1;if(heap[p].f<=node.f)break;heap[i]=heap[p];i=p;}heap[i]=node;
}
function npcNavHeapPop(job) {
  var heap=job.open,first=heap[0],last=heap.pop();
  if(heap.length) {
    var i=0;
    while(i*2+1<heap.length) {
      var c=i*2+1;if(c+1<heap.length && heap[c+1].f<heap[c].f)c++;
      if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;
    }
    heap[i]=last;
  }
  return first;
}
function npcNavProbe(job,from,x,y,requiredZ) {
  npcNavigationStats.edges++;
  var body={x:from.x,y:from.y,feetZ:from.z,radius:job.radius,height:job.height,
    stepHeight:25,allowFall:false,trackFloor:job.trackFloor};
  var result=spatialMoveBody(body,x-from.x,y-from.y);
  npcNavigationStats.probeSteps+=result.steps;
  // Coarse diagonal probes can skip a lower tread at a stair corner, while
  // short real movement ticks enter it and cannot climb the following rise.
  // Change height on cardinal legs only, including the final goal connection.
  if(Math.abs(body.feetZ-from.z)>.01 && Math.abs(x-from.x)>.00001 && Math.abs(y-from.y)>.00001)return null;
  if(result.status!=='walk' || result.hitX || result.hitY || result.remainingX || result.remainingY ||
      Math.abs(body.x-x)>.00001 || Math.abs(body.y-y)>.00001 ||
      (Number.isFinite(requiredZ) && Math.abs(body.feetZ-requiredZ)>.01))return null;
  return body;
}
function npcNavFinish(job,node) {
  var path=[];
  while(node && node.parent) {path.push({x:node.x,y:node.y,feetZ:node.z});node=node.parent;}
  path.reverse();
  job.nav.path=path;job.nav.index=0;job.nav.status='following';job.nav.job=null;
  job.nav.readyAt=gameTimeNow();job.done=true;npcNavigationStats.completed++;
}
function npcNavFail(job) {
  job.done=true;job.nav.job=null;job.nav.path=null;job.nav.status='failed';
  job.nav.retryAt=gameTimeNow()+750+(job.actor.npc.id%6)*25;npcNavigationStats.failed++;
}
function npcNavExpand(job,budget) {
  var used=0;
  while(used<budget && !job.done) {
    if(!job.current) {
      var node;
      do {node=npcNavHeapPop(job);} while(node && (node.closed || job.nodes[node.key]!==node));
      if(!node) {npcNavFail(job);break;}
      node.closed=true;job.current=node;job.neighbor=-1;npcNavigationStats.expanded++;
    }
    var from=job.current,s=job.spacing;
    // An exact final connection validates the requested storey as well as XY.
    if(job.neighbor===-1) {
      job.neighbor=0;
      if(Math.hypot(job.gx-from.x,job.gy-from.y)<=s*1.5) {
        var end=npcNavProbe(job,from,job.gx,job.gy,job.gz);used++;
        if(end) {npcNavFinish(job,{x:job.gx,y:job.gy,z:end.feetZ,parent:from});break;}
        if(used===budget)break;
      }
    }
    if(job.neighbor>=9) {job.current=null;continue;}
    var k=job.neighbor++,cx=Math.floor(from.x/s),cy=Math.floor(from.y/s);
    var nx=(cx+k%3-1+.5)*s,ny=(cy+Math.floor(k/3)-1+.5)*s;
    if(Math.abs(nx-from.x)<.00001 && Math.abs(ny-from.y)<.00001)continue;
    if(nx<job.minX || nx>job.maxX || ny<job.minY || ny>job.maxY)continue;
    var body=npcNavProbe(job,from,nx,ny);used++;
    if(!body)continue;
    // The same XY cell on two storeys is two different states.
    var key=Math.floor(nx/s)+','+Math.floor(ny/s)+','+body.feetZ;
    var cost=from.g+Math.hypot(nx-from.x,ny-from.y)+Math.abs(body.feetZ-from.z)*.1;
    var old=job.nodes[key];if(old && old.g<=cost)continue;
    if(!old && job.count>=NPC_NAV_MAX_NODES) {npcNavFail(job);break;}
    if(!old)job.count++;
    var next={x:nx,y:ny,z:body.feetZ,g:cost,f:cost+Math.hypot(job.gx-nx,job.gy-ny),key:key,parent:from};
    job.nodes[key]=next;npcNavHeapPush(job,next);
  }
  return used;
}
function npcNavigationTick() {
  npcNavWorldCheck();
  if(_npcNavTick===spatialSimulationTick)return;
  _npcNavTick=spatialSimulationTick;
  var start=physicsStageStart(),used=0,visits=0;
  try {
    // Eight probes per turn, preserving queue order across ticks. Every pending
    // actor gets a turn; one difficult route cannot consume the entire budget.
    while(_npcNavQueue.length && used<NPC_NAV_MAX_EDGES_PER_TICK && visits++<NPC_NAV_MAX_JOBS+NPC_NAV_MAX_EDGES_PER_TICK) {
      var job=_npcNavQueue.shift(),actor=job.actor;
      if(job.cancelled || job.generation!==_npcNavGeneration || !actor.npc ||
          actor.npc.navigation!==job.nav)continue;
      if(actor.health<=0 || !npcHasTrait(actor,'navigation')) {npcResetNavigation(actor);continue;}
      if(gameTimeNow()<(actor.stunUntil||0)) {_npcNavQueue.push(job);continue;}
      if(Math.hypot(actor.x-job.sx,actor.y-job.sy)>job.spacing*2 ||
          Math.abs(entityFeetSpatialZ(actor)-job.sz)>.01) {npcNavFail(job);continue;}
      used+=npcNavExpand(job,Math.min(8,NPC_NAV_MAX_EDGES_PER_TICK-used));
      if(!job.done)_npcNavQueue.push(job);
    }
    npcNavigationStats.maxEdgesPerTick=Math.max(npcNavigationStats.maxEdgesPerTick,used);
    if(_npcNavQueue.length)npcNavigationStats.deferred+=_npcNavQueue.length;
  } finally {physicsStageEnd('npcNavigation',start);}
}
function npcNavRequest(actor,nav,x,y,z,radius) {
  if(_npcNavQueue.length>=NPC_NAV_MAX_JOBS) {nav.status='failed';nav.retryAt=gameTimeNow()+250;npcNavigationStats.deferred++;return;}
  var body=spatialActorBody(actor,radius),s=Math.max(4,Math.min(12,cell||12,floorMesh?floorMesh.gridSize:12));
  var job={actor:actor,nav:nav,generation:_npcNavGeneration,radius:radius,height:body.height,trackFloor:body.trackFloor,
    sx:actor.x,sy:actor.y,sz:body.feetZ,gx:x,gy:y,gz:z,spacing:s,open:[],nodes:Object.create(null),count:1,current:null,
    minX:Math.max(actor.x-384,Math.min(actor.x,x)-96),maxX:Math.min(actor.x+384,Math.max(actor.x,x)+96),
    minY:Math.max(actor.y-384,Math.min(actor.y,y)-96),maxY:Math.min(actor.y+384,Math.max(actor.y,y)+96)};
  nav.goalX=x;nav.goalY=y;nav.goalZ=z;nav.job=job;nav.status='pending';nav.path=null;
  npcNavigationStats.requests++;
  if(!Number.isFinite(z) || Math.hypot(x-actor.x,y-actor.y)>384) {npcNavFail(job);return;}
  var root={x:actor.x,y:actor.y,z:body.feetZ,g:0,f:Math.hypot(x-actor.x,y-actor.y),key:'start',parent:null};
  job.nodes.start=root;npcNavHeapPush(job,root);_npcNavQueue.push(job);
}
function npcNavigateToward(actor,x,y,feetZ,speed,dt,radius,stopDistance) {
  npcNavigationTick();
  if(!npcHasTrait(actor,'navigation')) {npcResetNavigation(actor);return npcMoveToward(actor,x,y,speed,dt,radius,stopDistance);}
  if(gameTimeNow()<(actor.stunUntil||0) || !(speed>0) || !(dt>0) ||
      !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(feetZ))return false;
  var now=gameTimeNow(),n=actor.npc,nav=n.navigation;
  if(nav && (nav.generation!==_npcNavGeneration || nav.radius!==radius || nav.height!==(actor.bodyHeight||70) ||
      Math.hypot(actor.x-nav.lastX,actor.y-nav.lastY)>64)) {npcResetNavigation(actor);nav=null;}
  if(!nav)nav=n.navigation={status:'direct',generation:_npcNavGeneration,radius:radius,height:actor.bodyHeight||70,
    lastX:actor.x,lastY:actor.y,blockedMs:0,job:null,path:null};
  // A substantial goal change abandons stale work; small moving-target/orbit
  // adjustments finish the short route and return to direct steering afterward.
  if(nav.status!=='direct' && (Math.hypot(x-nav.goalX,y-nav.goalY)>48 || Math.abs(feetZ-nav.goalZ)>.01)) {
    npcResetNavigation(actor);return npcNavigateToward(actor,x,y,feetZ,speed,dt,radius,stopDistance);
  }
  nav.lastX=actor.x;nav.lastY=actor.y;
  if(nav.status==='pending')return false;
  if(nav.status==='failed') {if(now<nav.retryAt)return false;nav.status='direct';nav.blockedMs=0;}
  var tx=x,ty=y,requiredZ=feetZ,stop=stopDistance||0;
  if(nav.status==='following') {
    while(nav.index<nav.path.length && Math.hypot(actor.x-nav.path[nav.index].x,actor.y-nav.path[nav.index].y)<.01 &&
        Math.abs(entityFeetSpatialZ(actor)-nav.path[nav.index].feetZ)<.01)nav.index++;
    if(nav.index>=nav.path.length) {nav.status='direct';nav.path=null;}
    else {tx=nav.path[nav.index].x;ty=nav.path[nav.index].y;requiredZ=nav.path[nav.index].feetZ;stop=0;}
  }
  var distance=Math.hypot(tx-actor.x,ty-actor.y),desired=Math.min(Math.max(0,distance-stop),speed*dt);
  if(!desired && Math.abs(entityFeetSpatialZ(actor)-requiredZ)<.01)return false;
  var oldX=actor.x,oldY=actor.y,moved=npcMoveToward(actor,tx,ty,speed,dt,radius,stop);
  var travelled=Math.hypot(actor.x-oldX,actor.y-oldY);
  nav.blockedMs=travelled<desired*.5 || !moved?nav.blockedMs+dt*1000:0;
  nav.lastX=actor.x;nav.lastY=actor.y;
  if(!moved || nav.blockedMs>=150) {
    if(nav.job)nav.job.cancelled=true;
    npcNavRequest(actor,nav,x,y,feetZ,radius);nav.blockedMs=0;
  }
  return moved;
}
