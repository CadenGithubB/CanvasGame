// Swept projectile queries. World geometry is the same canonical geometry used
// by support and visibility; no view mode or render resolution enters a hit.
function projectileSweepRoot(aa, bb, cc) {
  if (cc <= 0) return 0;
  if (aa < 1e-12) return Infinity;
  var disc = bb * bb - 4 * aa * cc;
  if (disc < 0) return Infinity;
  var t = (-bb - Math.sqrt(disc)) / (2 * aa);
  return t >= 0 && t <= 1 ? t : Infinity;
}

// Sphere against a finite segment, including its two round end caps.
function projectileSweepEdge(a, d, u, v, r) {
  var ex=v.x-u.x, ey=v.y-u.y, ez=v.z-u.z, len=ex*ex+ey*ey+ez*ez;
  var px=a.x-u.x, py=a.y-u.y, pz=a.z-u.z;
  var dd=d.x*d.x+d.y*d.y+d.z*d.z, pd=px*d.x+py*d.y+pz*d.z;
  var best=projectileSweepRoot(dd,2*pd,px*px+py*py+pz*pz-r*r);
  var qx=a.x-v.x, qy=a.y-v.y, qz=a.z-v.z;
  best=Math.min(best,projectileSweepRoot(dd,2*(qx*d.x+qy*d.y+qz*d.z),qx*qx+qy*qy+qz*qz-r*r));
  if (len>1e-12) {
    var pe=px*ex+py*ey+pz*ez, de=d.x*ex+d.y*ey+d.z*ez;
    var t=projectileSweepRoot(dd-de*de/len,2*(pd-pe*de/len),px*px+py*py+pz*pz-pe*pe/len-r*r);
    var along=(pe+de*t)/len;
    if (along>=0 && along<=1) best=Math.min(best,t);
  }
  return best;
}

function projectilePointInTriangle(p, u, v, w) {
  var ax=v.x-u.x,ay=v.y-u.y,az=v.z-u.z,bx=w.x-u.x,by=w.y-u.y,bz=w.z-u.z;
  var px=p.x-u.x,py=p.y-u.y,pz=p.z-u.z;
  var aa=ax*ax+ay*ay+az*az,bb=bx*bx+by*by+bz*bz,ab=ax*bx+ay*by+az*bz;
  var pa=px*ax+py*ay+pz*az,pb=px*bx+py*by+pz*bz,den=aa*bb-ab*ab;
  if (den<1e-12) return false;
  var s=(bb*pa-ab*pb)/den,t=(aa*pb-ab*pa)/den;
  return s>=-1e-8 && t>=-1e-8 && s+t<=1+1e-8;
}

function projectileSweepTriangle(a, d, u, v, w, r) {
  var ax=v.x-u.x,ay=v.y-u.y,az=v.z-u.z,bx=w.x-u.x,by=w.y-u.y,bz=w.z-u.z;
  var nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx,n=Math.hypot(nx,ny,nz);
  var best=Infinity;
  if (n>1e-12) {
    nx/=n;ny/=n;nz/=n;
    var gap=(a.x-u.x)*nx+(a.y-u.y)*ny+(a.z-u.z)*nz,rate=d.x*nx+d.y*ny+d.z*nz;
    if (Math.abs(gap)<=r && projectilePointInTriangle({x:a.x-gap*nx,y:a.y-gap*ny,z:a.z-gap*nz},u,v,w)) best=0;
    if (Math.abs(rate)>1e-12) for(var side=-1;side<=1;side+=2) {
      var t=(side*r-gap)/rate;
      if(t<0 || t>1 || t>=best) continue;
      if(projectilePointInTriangle({x:a.x+d.x*t-side*r*nx,y:a.y+d.y*t-side*r*ny,z:a.z+d.z*t-side*r*nz},u,v,w)) best=t;
    }
  }
  return Math.min(best,projectileSweepEdge(a,d,u,v,r),projectileSweepEdge(a,d,v,w,r),projectileSweepEdge(a,d,w,u,r));
}

// Visit only the strip of cells touched by the path expanded by its radius.
// Adjacent cells are deduplicated; a long shot never scans the whole window.
function projectileVisitCells(a,b,r,size,w,h,visit,work,key) {
  var reach=Math.ceil(r/size),seen=Object.create(null);
  spatialVisitCells(a,b,size,w,h,function(cx,cy) {
    for(var y=cy-reach;y<=cy+reach;y++) for(var x=cx-reach;x<=cx+reach;x++) {
      var id=x+','+y;
      if(seen[id]) continue;
      seen[id]=true;
      // Broad-phase slab clip against the expanded cell before narrow tests.
      var lo=0,hi=1,dx=b.x-a.x,dy=b.y-a.y;
      var axes=[[a.x,dx,x*size-r,(x+1)*size+r],[a.y,dy,y*size-r,(y+1)*size+r]];
      for(var k=0;k<2;k++) {
        var axis=axes[k];
        if(Math.abs(axis[1])<1e-12) {if(axis[0]<axis[2] || axis[0]>axis[3]) hi=-1;}
        else {var t0=(axis[2]-axis[0])/axis[1],t1=(axis[3]-axis[0])/axis[1];lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));}
      }
      if(lo>hi) continue;
      if(work) work[key]=(work[key]||0)+1;
      visit(x,y,lo);
    }
  });
}

function projectileSweepWorld(a,b,r,work) {
  // The center ray also catches initial roof-volume overlap and unloaded space.
  var hit=spatialRaycast(a,b,work),d={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z};
  if(hit.status==='invalid') return hit;
  function record(t,kind,id,gx,gy,status) {
    if(!Number.isFinite(t) || t<0 || t>1 || (hit.status!=='clear' && t>=hit.t-1e-8)) return;
    hit={status:status||'blocked',t:t,kind:kind,surfaceId:id,gx:gx,gy:gy};
  }
  function triangle(u,v,w,kind,id,gx,gy) {
    if(Math.max(u.z,v.z,w.z)<Math.min(a.z,b.z)-r || Math.min(u.z,v.z,w.z)>Math.max(a.z,b.z)+r) return;
    if(work) work.sweepTriangles=(work.sweepTriangles||0)+1;
    record(projectileSweepTriangle(a,d,u,v,w,r),kind,id,gx,gy);
  }
  function quad(u,v,w,z,kind,id,gx,gy) {triangle(u,v,w,kind,id,gx,gy);triangle(u,w,z,kind,id,gx,gy);}
  var m=floorMesh;
  if(m && m.layerCount) projectileVisitCells(a,b,r,m.gridSize,m.w,m.h,function(gx,gy,start) {
    if(start>hit.t) return;
    if(gx<0 || gy<0 || gx>=m.w-1 || gy>=m.h-1 || !m.layerCount[gy*m.w+gx]) {
      record(start,'terrain',null,gx,gy,'unloaded');return;
    }
    var ci=gy*m.w+gx,s=m.gridSize;
    for(var li=0;li<m.layerCount[ci];li++) {
      var c=spatialLayerCorners(m,ci,li);if(!c) continue;
      var type=meshLayerType(m,ci,li),kind=type===2?'ceiling':type===4?'cap':'floor';
      var u={x:gx*s,y:gy*s,z:c[0]*25},v={x:(gx+1)*s,y:gy*s,z:c[1]*25};
      var w={x:(gx+1)*s,y:(gy+1)*s,z:c[3]*25},z={x:gx*s,y:(gy+1)*s,z:c[2]*25};
      quad(u,v,w,z,kind,spatialSurfaceId(kind,gx,gy,s,li),gx,gy);
    }
  },work,'sweepTerrainCells');
  else if(!ENDLESS_MODE) {
    // Fixed levels explicitly author a flat floor even without a terrain mesh.
    if(a.z<=r) record(0,'floor','floor:flat');
    else if(d.z<0) record((r-a.z)/d.z,'floor','floor:flat');
  }
  if(grid) projectileVisitCells(a,b,r,cell,gridW,gridH,function(gx,gy,start) {
    if(start>hit.t) return;
    if(gx<0 || gy<0 || gx>=gridW || gy>=gridH) {record(start,'wall',null,gx,gy,'unloaded');return;}
    if(!grid[gy*gridW+gx]) return;
    var span=spatialWallSpan(gx,gy);if(!span) {record(start,'wall',null,gx,gy,'unloaded');return;}
    var low=span.baseZ,high=span.topZ,id=spatialSurfaceId('wall',gx,gy,cell,0);
    if(high<=low) return;
    var x=gx*cell,y=gy*cell;
    var p=[{x:x,y:y,z:low},{x:x+cell,y:y,z:low},{x:x+cell,y:y+cell,z:low},{x:x,y:y+cell,z:low}];
    var q=p.map(function(v){return {x:v.x,y:v.y,z:high};});
    quad(p[0],p[1],p[2],p[3],'wall',id,gx,gy);quad(q[0],q[1],q[2],q[3],'wall',id,gx,gy);
    for(var face=0;face<4;face++) {
      var next=(face+1)%4;
      quad(p[face],p[next],q[next],q[face],'wall',id,gx,gy);
      var nx=gx+(face===1?1:face===3?-1:0),ny=gy+(face===0?-1:face===2?1:0);
      if(nx>=0 && ny>=0 && nx<gridW && ny<gridH && grid[ny*gridW+nx]) continue;
      var h0=spatialWallClosureH(q[face].x,q[face].y,high/25)*25;
      var h1=spatialWallClosureH(q[next].x,q[next].y,high/25)*25;
      if(h0>high || h1>high) quad(q[face],q[next],{x:q[next].x,y:q[next].y,z:h1},{x:q[face].x,y:q[face].y,z:h0},'wall',id,gx,gy);
    }
  },work,'sweepWallCells');
  if(hit.status!=='clear') hit.point={x:a.x+d.x*hit.t,y:a.y+d.y*hit.t,z:a.z+d.z*hit.t};
  return hit;
}

// Upright body envelope: XY circle and canonical vertical interval. Relative
// motion catches targets that cross a shot during this same simulation tick.
function projectileSweepBody(a,b,r,body,radius,height,now,motionFraction) {
  var feet=entityFeetSpatialZ(body);
  if(!Number.isFinite(feet)) return Infinity;
  var moving=now!==null && body._projectileMotionTick===now && Number.isFinite(body._projectilePrevX) &&
    Number.isFinite(body._projectilePrevY) && Number.isFinite(body._projectilePrevZ);
  var fraction=Number.isFinite(motionFraction)?Math.max(0,Math.min(1,motionFraction)):1;
  var x=moving?body.x+(body._projectilePrevX-body.x)*fraction:body.x;
  var y=moving?body.y+(body._projectilePrevY-body.y)*fraction:body.y;
  var z=moving?feet+(body._projectilePrevZ-feet)*fraction:feet;
  var dx=b.x-a.x-(body.x-x),dy=b.y-a.y-(body.y-y),dz=b.z-a.z-(feet-z);
  var px=a.x-x,py=a.y-y,rr=radius+r,aa=dx*dx+dy*dy,bb=2*(px*dx+py*dy),cc=px*px+py*py-rr*rr;
  var lo=0,hi=1;
  if(aa<1e-12) {if(cc>0) return Infinity;}
  else {var disc=bb*bb-4*aa*cc;if(disc<0)return Infinity;var root=Math.sqrt(disc);lo=Math.max(lo,(-bb-root)/(2*aa));hi=Math.min(hi,(-bb+root)/(2*aa));}
  var pz=a.z-z;
  if(Math.abs(dz)<1e-12) {if(pz < -r || pz > height+r) return Infinity;}
  else {var t0=(-r-pz)/dz,t1=(height+r-pz)/dz;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));}
  return lo<=hi && lo<=1 && hi>=0 ? lo : Infinity;
}

function projectileBodyKey(body) {
  return String(body.caveSpawnId || body.id || '')+':'+body.x+':'+body.y+':'+entityFeetSpatialZ(body)+':'+
    (body.enemyType ? body.enemyType.id : 'spawner');
}

function projectileFirstHit(p,a,b,now,work,motionFraction) {
  var r=Number.isFinite(p.r)?Math.max(0,p.r):8,hit=projectileSweepWorld(a,b,r,work),key='';
  if(p.isLob || hit.status==='invalid') return hit;
  function body(target,index,kind,radius,height) {
    if(work) work.bodyCandidates=(work.bodyCandidates||0)+1;
    var pad=radius+r,px=target._projectileMotionTick===now?target._projectilePrevX:target.x;
    var py=target._projectileMotionTick===now?target._projectilePrevY:target.y;
    if (!Number.isFinite(px)) px=target.x;
    if (!Number.isFinite(py)) py=target.y;
    if(Math.max(target.x,px)<Math.min(a.x,b.x)-pad || Math.min(target.x,px)>Math.max(a.x,b.x)+pad ||
       Math.max(target.y,py)<Math.min(a.y,b.y)-pad || Math.min(target.y,py)>Math.max(a.y,b.y)+pad) return;
    if(work) work.bodyTests=(work.bodyTests||0)+1;
    var t=projectileSweepBody(a,b,r,target,radius,height,now,motionFraction);
    if(!Number.isFinite(t)) return;
    var nextKey=projectileBodyKey(target);
    // Static geometry wins exact ties. Two bodies at different distances cannot
    // change contact order when their storage array is permuted.
    if(t>hit.t+1e-8 || (Math.abs(t-hit.t)<=1e-8 && (hit.status!=='clear' && (!hit.body || nextKey>=key)))) return;
    hit={status:'blocked',t:t,kind:kind,body:target,index:index,
      point:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t}};key=nextKey;
  }
  var targetRadius=Number.isFinite(p.targetRadius)?Math.max(0,p.targetRadius):28;
  for(var i=0;i<enemies.length;i++) if(enemies[i].health>0) body(enemies[i],i,'enemy',targetRadius,72);
  if(enemySpawners) for(var j=0;j<enemySpawners.length;j++) if(enemySpawners[j].active && enemySpawners[j].hp>0) body(enemySpawners[j],j,'spawner',25,90);
  return hit;
}
