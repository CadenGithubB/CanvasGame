// Held staff for the staff-casting hand rig (grip 'staff' in 15-hand-rig.js).
// Preview-only like the hand: native Canvas2D triangles in hand units, posed
// rigidly with the palm. No raster art, world depth, spell or gameplay state.
// Geometry is authored along the staff's own axis, then mounted once into the
// hand's local frame (+x thumb side, +y fingers, +z palmar).
var STAFF_RIG_MATERIAL = {wood:0,grain:1,wrap:2,lacing:3,brass:4,crystal:5};
// The grip's finger curls were solved against this cylinder: its axis runs
// across the palm through (0, 7.0, 2.25), rising 0.1 toward the thumb side.
var STAFF_RIG_GRIP = {center:[0,7.0,2.25],slope:.1,radius:1.2};
var _staffRigMesh = null;
var _staffRigStats = {vertices:0,triangles:0,buildMs:0,builds:0,topologyBytes:0};
function clearStaffRigCache() {
  _staffRigMesh=null;
  _staffRigStats={vertices:0,triangles:0,buildMs:0,builds:0,topologyBytes:0};
}
function getStaffRigStats() {return Object.assign({},_staffRigStats);}
function buildStaffRigMesh() {
  if(_staffRigMesh)return _staffRigMesh;
  var start=performance.now(),verts=[],faces=[];
  var g=STAFF_RIG_GRIP,al=Math.hypot(1,g.slope);
  // Staff axis A, with U (palmar) and V completing a right-handed U,V,A frame.
  var A=[1/al,g.slope/al,0],U=[0,0,1],V=[A[1],-A[0],0];
  // Staff station s=0 sits mid-fist, slightly toward the little finger.
  var O=[g.center[0]-.2*A[0],g.center[1]-.2*A[1],g.center[2]];
  function at(s,r,theta){
    var c=Math.cos(theta)*r,n=Math.sin(theta)*r;
    return [O[0]+s*A[0]+c*U[0]+n*V[0],O[1]+s*A[1]+c*U[1]+n*V[1],O[2]+s*A[2]+c*U[2]+n*V[2]];
  }
  function vertex(p){verts.push(p);return verts.length-1;}
  // Rings along s; quads [a,b,c],[a,c,d] wind outward (right-handed U,V,A).
  function lathe(stations,sides,radius,material,caps){
    var first=verts.length;
    stations.forEach(function(s){for(var j=0;j<sides;j++){var th=j*Math.PI*2/sides;verts.push(at(s,radius(s,th),th));}});
    for(var i=0;i<stations.length-1;i++)for(var j=0;j<sides;j++){
      var a=first+i*sides+j,b=first+i*sides+(j+1)%sides,c=b+sides,d=a+sides;
      var m=typeof material==='function'?material(stations[i],j):material;
      faces.push([a,b,c,m],[a,c,d,m]);
    }
    if(caps){
      var bottom=vertex(at(stations[0],0,0)),top=vertex(at(stations[stations.length-1],0,0));
      var last=first+(stations.length-1)*sides;
      for(var k=0;k<sides;k++){
        var m0=typeof material==='function'?material(stations[0],k):material;
        faces.push([bottom,first+(k+1)%sides,first+k,m0],[top,last+k,last+(k+1)%sides,m0]);
      }
    }
  }
  function range(from,to,step){var out=[];for(var s=from;s<to-1e-9;s+=step)out.push(s);out.push(to);return out;}
  // Gnarled wood: slow swelling, a few knots and a flare into the head.
  var knots=[[14,2.0],[22,4.4],[-14,.9],[-31,3.3],[27,1.1]];
  function wood(s,th){
    var r=1.1*(1+.035*Math.sin(.23*s+1.3)+.02*Math.sin(.61*s));
    knots.forEach(function(k){var d=(s-k[0])/1.3,c=Math.max(0,Math.cos(th-k[1]));r+=.24*Math.exp(-d*d)*c*c*c;});
    var flare=Math.max(0,Math.min(1,(s-26)/7));
    return r+.9*flare*flare*(3-2*flare);
  }
  // Two spiral streaks of darker grain; they turn with the staff, not the camera.
  function grain(s,j){return ((j+Math.floor(s*.18))%7+7)%7===0?STAFF_RIG_MATERIAL.grain:STAFF_RIG_MATERIAL.wood;}
  var SIDES=12;
  lathe(range(-90,-26,8).concat(range(-24,-6.4,1.6)),SIDES,wood,grain,true);
  lathe(range(8.4,33,1.5),SIDES,wood,grain,true);
  // Leather wrap is the contact cylinder; fine rings keep painter order local
  // where fingers and thumb close around it.
  // Every third band is raised cord lacing over the leather.
  lathe(range(-5.6,7.6,.6),SIDES,function(){return g.radius;},function(s){
    return Math.round((s+5.6)/.6)%3===1?STAFF_RIG_MATERIAL.lacing:STAFF_RIG_MATERIAL.wrap;},true);
  // Brass collars at both wrap ends and under the head.
  function collar(s0,s1,r){lathe([s0,s0+.15,s1-.15,s1],SIDES,function(s){return s===s0||s===s1?r-.1:r;},STAFF_RIG_MATERIAL.brass,true);}
  collar(-6.5,-5.5,1.34);collar(7.5,8.5,1.34);collar(25.4,27.2,1.46);
  collar(-94,-89.5,1.2);
  // Three wooden prongs curl out of the flare and back in around the crystal.
  for(var k=0;k<3;k++){
    var phi=k*Math.PI*2/3+.5,E=[Math.cos(phi),Math.sin(phi)];
    var path=[];
    for(var t=0;t<=1.0001;t+=1/11){
      var s=32.2+19*t,rho=.95+3.0*Math.sin(Math.PI*Math.min(1,t*1.15))*(1-.3*t)-.5*t*t;
      path.push([s,rho,.8*(1-t)+.16]);
    }
    var first=verts.length;
    path.forEach(function(q,i){
      var prev=path[Math.max(0,i-1)],next=path[Math.min(path.length-1,i+1)];
      // In-plane tangent: along A and the prong's radial direction E.
      var ds=next[0]-prev[0],dr=next[1]-prev[1],tl=Math.hypot(ds,dr);ds/=tl;dr/=tl;
      var T=[ds*A[0]+dr*(E[0]*U[0]+E[1]*V[0]),ds*A[1]+dr*(E[0]*U[1]+E[1]*V[1]),ds*A[2]+dr*(E[0]*U[2]+E[1]*V[2])];
      var P0=[-E[1]*U[0]+E[0]*V[0],-E[1]*U[1]+E[0]*V[1],-E[1]*U[2]+E[0]*V[2]];
      var Q0=[T[1]*P0[2]-T[2]*P0[1],T[2]*P0[0]-T[0]*P0[2],T[0]*P0[1]-T[1]*P0[0]];
      var c=at(q[0],q[1],phi);
      for(var j=0;j<6;j++){var a=j*Math.PI/3,ca=Math.cos(a)*q[2],sa=Math.sin(a)*q[2];
        verts.push([c[0]+ca*P0[0]+sa*Q0[0],c[1]+ca*P0[1]+sa*Q0[1],c[2]+ca*P0[2]+sa*Q0[2]]);}
    });
    for(var i=0;i<path.length-1;i++)for(var j=0;j<6;j++){
      var a=first+i*6+j,b=first+i*6+(j+1)%6,c=b+6,d=a+6;
      faces.push([a,b,c,STAFF_RIG_MATERIAL.wood],[a,c,d,STAFF_RIG_MATERIAL.wood]);
    }
    var tip=vertex(at(path[path.length-1][0]+.5,path[path.length-1][1]-.35,phi)),end=first+(path.length-1)*6;
    for(var j2=0;j2<6;j2++)faces.push([tip,end+j2,end+(j2+1)%6,STAFF_RIG_MATERIAL.wood]);
  }
  // Faceted crystal: unshared vertices per facet keep hard, readable facets.
  var crystalFirst=verts.length,cs=[36.2,39.8,43.6,49.0],cr=2.2,rot=.5+Math.PI/6;
  function facet(p,q,r){faces.push([vertex(p),vertex(q),vertex(r),STAFF_RIG_MATERIAL.crystal]);}
  for(var f=0;f<6;f++){
    var t0=rot+f*Math.PI/3,t1=rot+(f+1)*Math.PI/3;
    var lo0=at(cs[1],cr,t0),lo1=at(cs[1],cr,t1),hi0=at(cs[2],cr*.94,t0),hi1=at(cs[2],cr*.94,t1);
    facet(lo0,lo1,hi1);facet(lo0,hi1,hi0);
    facet(hi0,hi1,at(cs[3],0,0));facet(lo1,lo0,at(cs[0],0,0));
  }
  // Unreferenced marker at the crystal center; it is posed and projected with
  // the mesh so the glow follows the actual head.
  var headIndex=vertex(at((cs[1]+cs[2])/2,0,0));
  var n=verts.length,local=new Float64Array(n*3),normals=new Float64Array(n*3);
  verts.forEach(function(p,i){local[i*3]=p[0];local[i*3+1]=p[1];local[i*3+2]=p[2];});
  // Area-weighted normals once in the rest frame; the pose is a pure rotation.
  faces.forEach(function(F){
    var a=F[0]*3,b=F[1]*3,c=F[2]*3;
    var abx=local[b]-local[a],aby=local[b+1]-local[a+1],abz=local[b+2]-local[a+2];
    var acx=local[c]-local[a],acy=local[c+1]-local[a+1],acz=local[c+2]-local[a+2];
    var nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;
    for(var k=0;k<3;k++){var index=F[k]*3;normals[index]+=nx;normals[index+1]+=ny;normals[index+2]+=nz;}
  });
  for(var v=0;v<n;v++){var len=Math.hypot(normals[v*3],normals[v*3+1],normals[v*3+2])||1;
    normals[v*3]/=len;normals[v*3+1]/=len;normals[v*3+2]/=len;}
  _staffRigMesh={count:n,local:local,localNormals:normals,faces:faces,crystalFirst:crystalFirst,
    headIndex:headIndex,axis:A,origin:O,positions:new Float64Array(n*3),normals:new Float64Array(n*3),
    screen:new Float64Array(n*3),light:new Float64Array(n),faceDepth:new Float64Array(faces.length)};
  _staffRigStats.vertices=n;_staffRigStats.triangles=faces.length;
  _staffRigStats.buildMs=performance.now()-start;_staffRigStats.builds++;
  _staffRigStats.topologyBytes=n*13*8+faces.length*8;
  return _staffRigMesh;
}
function staffRigPalette() {
  var M=typeof GAME_MATERIALS!=='undefined'?GAME_MATERIALS:{};
  var wood=M.casterStaff&&M.casterStaff.hex?M.casterStaff.hex:
    {woodDeep:'#2e1d12',wood:'#6a4529',woodLit:'#a4774a',grain:'#3f2819',wrapDeep:'#23160f',wrap:'#5b3a26',wrapLit:'#8d6343',lacing:'#c9b48a'};
  var metal=M.casterMetal&&M.casterMetal.hex?M.casterMetal.hex:{shadow:'#50422c',base:'#a78b54',light:'#dfc78d'};
  var magic=M.missileMagic&&M.missileMagic.hex?M.missileMagic.hex:{core:'#fff3d8',light:'#c4edf0',mid:'#79b9d0',deep:'#315677'};
  var h=handRigHexRgb;
  return [
    [h(wood.woodDeep,'#2e1d12'),h(wood.wood,'#6a4529'),h(wood.woodLit,'#a4774a')],
    [h(wood.woodDeep,'#2e1d12'),h(wood.grain,'#3f2819'),h(wood.wood,'#6a4529')],
    [h(wood.wrapDeep,'#23160f'),h(wood.wrap,'#5b3a26'),h(wood.wrapLit,'#8d6343')],
    [h(wood.wrap,'#5b3a26'),h(wood.lacing,'#c9b48a'),handRigRgbMix(h(wood.lacing,'#c9b48a'),[255,246,222],.3)],
    [h(metal.shadow,'#50422c'),h(metal.base,'#a78b54'),h(metal.light,'#dfc78d')],
    [h(magic.deep,'#315677'),h(magic.mid,'#79b9d0'),h(magic.core,'#fff3d8')]
  ];
}
// Crystal charge follows the shared casting timeline: it gathers, holds
// through the thrust and fades on recovery. Presentation only.
function staffRigCharge(pose) {return Math.max(pose.gather,pose.release);}
function staffRigLift(pose) {
  return [0,0,0,.02,.07,.10+staffRigCharge(pose)*.45];
}
// Soft additive light around the crystal while charged. Drawn after every
// face inside the rig's save/restore; it never touches world depth.
function staffRigOverlay(item,pose,palette) {
  var charge=staffRigCharge(pose),S=item.screen,h=item.headIndex*3,depth=S[h+2];
  if(charge<=.01||depth<3)return;
  var radius=canvas.height*1.28*4.2/depth*(.75+charge*.45),core=palette[STAFF_RIG_MATERIAL.crystal];
  var glow=ctx.createRadialGradient(S[h],S[h+1],0,S[h],S[h+1],radius);
  glow.addColorStop(0,'rgba('+core[2].join(',')+','+(.42*charge).toFixed(3)+')');
  glow.addColorStop(.4,'rgba('+core[1].join(',')+','+(.16*charge).toFixed(3)+')');
  glow.addColorStop(1,'rgba('+core[0].join(',')+',0)');
  ctx.globalCompositeOperation='lighter';ctx.fillStyle=glow;
  ctx.beginPath();ctx.arc(S[h],S[h+1],radius,0,Math.PI*2);ctx.fill();
}
HAND_RIG_ITEMS.staff={build:buildStaffRigMesh,palette:staffRigPalette,lift:staffRigLift,overlay:staffRigOverlay};
