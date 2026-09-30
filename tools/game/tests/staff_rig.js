// Staff casting rig: a held 3D staff, its grip contact, rigid attachment,
// reach-and-point motion and a resting view kept out of the player's way.
// Oracles are the authored grip cylinder and projected geometry, not hashes.
(function () {
  var G=(0,eval)('this'),checks=0,commands=[],stack=[],clock=0;
  function check(name,ok){if(!ok)throw Error(name);checks++;__out('PASS '+name);}
  function forbidden(){throw Error('staff rig used a forbidden gameplay/raster API');}
  var stateKeys=['globalAlpha','globalCompositeOperation','shadowBlur','lineJoin','lineWidth','fillStyle','strokeStyle'];
  G.ctx={globalAlpha:.43,globalCompositeOperation:'multiply',shadowBlur:3,lineJoin:'miter',lineWidth:7,
    fillStyle:'#123456',strokeStyle:'#654321',
    save:function(){var s={};stateKeys.forEach(function(k){s[k]=G.ctx[k];});stack.push(s);},
    restore:function(){var s=stack.pop();if(!s)throw Error('unbalanced restore');stateKeys.forEach(function(k){G.ctx[k]=s[k];});},
    beginPath:function(){},moveTo:function(){},lineTo:function(){},closePath:function(){},stroke:function(){},
    fill:function(){commands.push(['fill',G.ctx.globalCompositeOperation]);},
    arc:function(){commands.push(['arc',G.ctx.globalCompositeOperation]);},
    createLinearGradient:function(){return {addColorStop:function(){}};},
    createRadialGradient:function(){commands.push(['radial']);return {addColorStop:function(){}};},
    drawImage:forbidden,putImageData:forbidden,getImageData:forbidden};
  G.document={createElement:forbidden};
  G.beginSceneDepthFrame=G.writeSceneDepthPolygon=G.fillSceneDepthPolygon=forbidden;
  G.performance={now:function(){clock+=.01;return clock;}};
  G.MODE3D=true;G.shopOpen=false;G.canvas={width:360,height:240};G.ambientLight=.8;
  G.pos={x:1,y:2,floorZ:3};G.mana=50;G.equipment={robes:null,relic:null};
  var oldRandom=Math.random;Math.random=forbidden;
  function patch(source,from,to,flag){
    if(__argv.indexOf(flag)<0)return source;
    if(source.split(from).length!==2)throw Error('mutation anchor for '+flag+' must match exactly once');
    return source.replace(from,to);
  }
  function snapshot(){return JSON.stringify([G.pos,G.mana,G.equipment]);}
  function maxDelta(a,b){var r=0;for(var i=0;i<a.length;i++)r=Math.max(r,Math.abs(a[i]-b[i]));return r;}
  function copy(a){return Array.prototype.slice.call(a);}
  try {
    (0,eval)(slurp('assets/games/src/01-materials.js'));
    (0,eval)(slurp('assets/games/src/01-casting-styles.js'));
    var rig=slurp('assets/games/src/15-hand-rig.js');
    rig=patch(rig,'var q=handRigPlace(frame,L[p]*c+L[p+2]*s,L[p+1],L[p+2]*c-L[p]*s,1);',
      'var q=handRigPlace(frame,L[p]*c+L[p+2]*s,L[p+1],L[p+2]*c-L[p]*s,0);','--staff-follows-forearm');
    rig=patch(rig,'staff:{fingers:[[.95,1.65,.45],[1.45,1.55,.70],[1.35,1.50,.70],[.85,1.35,.50]],',
      'staff:{fingers:[[.60,1.10,.30],[.95,1.05,.45],[.90,1.00,.45],[.55,.90,.35]],','--loosen-staff-grip');
    (0,eval)(rig);
    var staffSource=patch(slurp('assets/games/src/15-staff-rig.js'),'faces.push([a,b,c,m],[a,c,d,m]);',
      'faces.push([a,c,b,m],[a,d,c,m]);','--invert-staff-winding');
    (0,eval)(staffSource);
    var STAFF=G.HAND_RIG_REST_POSES.staff;
    if(__argv.indexOf('--center-staff')>=0)STAFF.placement.anchorX=[.5,.5,.5];
    if(__argv.indexOf('--no-staff-point')>=0){STAFF.root[2]=STAFF.root[0].slice();STAFF.arm[2]=[0,0,0];}
    // The reported defect: the reach swung the sleeve in from the right side.
    if(__argv.indexOf('--arm-from-side')>=0){STAFF.root[2]=[-.905,.302,1.092];STAFF.arm[2]=[-.524,.524,0];
      STAFF.placement.distance[2]=84;STAFF.placement.anchorX[2]=.68;STAFF.placement.anchorY[2]=.8;}
    var before=snapshot();

    check('staff grip names a registered held item and other grips hold nothing',
      STAFF.item==='staff'&&typeof G.HAND_RIG_ITEMS.staff.build==='function'&&
      ['reach','handle','cradle'].every(function(g){return !G.HAND_RIG_REST_POSES[g].item;}));
    check('loading the staff rig builds nothing until it is drawn',G._staffRigMesh===null&&G.HAND_RIG_PREVIEW===false);
    var item=G.buildStaffRigMesh(),mesh=G.buildHandRigMesh(),stats=G.getStaffRigStats();
    check('staff topology is bounded, indexed and reused',item.count>300&&item.count<3000&&item.faces.length>300&&item.faces.length<5000&&
      G.buildStaffRigMesh()===item&&G.getStaffRigStats().builds===1&&stats.triangles===item.faces.length&&
      item.faces.every(function(f){return f[0]!==f[1]&&f[0]!==f[2]&&f[1]!==f[2]&&f.slice(0,3).every(function(i){return Number.isInteger(i)&&i>=0&&i<item.count;})&&
        f[3]>=0&&f[3]<=G.STAFF_RIG_MATERIAL.crystal;}));
    var materialsUsed={};item.faces.forEach(function(f){materialsUsed[f[3]]=1;});
    check('staff separates wood, grain, leather wrap, cord, brass and crystal materials',
      Object.keys(G.STAFF_RIG_MATERIAL).every(function(k){return materialsUsed[G.STAFF_RIG_MATERIAL[k]];})&&G.staffRigPalette().length===6);

    // Authored contact cylinder in hand-local units (+x thumb, +y fingers, +z palm).
    var grip=G.STAFF_RIG_GRIP,al=Math.hypot(1,grip.slope),A=[1/al,grip.slope/al,0];
    function axisOffset(x,y,z){var dx=x-grip.center[0],dy=y-grip.center[1],dz=z-grip.center[2],t=dx*A[0]+dy*A[1]+dz*A[2];
      return {t:t,v:[dx-t*A[0],dy-t*A[1],dz-t*A[2]]};}
    function clearance(x,y,z){var o=axisOffset(x,y,z);return Math.hypot(o.v[0],o.v[1],o.v[2])-grip.radius;}
    var L=item.local,wrapOnRadius=true,wrapCount=0;
    item.faces.forEach(function(f){if(f[3]!==G.STAFF_RIG_MATERIAL.wrap&&f[3]!==G.STAFF_RIG_MATERIAL.lacing)return;
      f.slice(0,3).forEach(function(i){var c=clearance(L[i*3],L[i*3+1],L[i*3+2]);if(c>-grip.radius+.1){wrapCount++;if(Math.abs(c)>1e-9)wrapOnRadius=false;}});});
    check('leather wrap is modelled exactly on the grip contact cylinder',wrapCount>100&&wrapOnRadius);
    var outward=true,sideFaces=0;
    item.faces.forEach(function(f){
      var a=f[0]*3,b=f[1]*3,c=f[2]*3,n=[(L[b+1]-L[a+1])*(L[c+2]-L[a+2])-(L[b+2]-L[a+2])*(L[c+1]-L[a+1]),
        (L[b+2]-L[a+2])*(L[c]-L[a])-(L[b]-L[a])*(L[c+2]-L[a+2]),(L[b]-L[a])*(L[c+1]-L[a+1])-(L[b+1]-L[a+1])*(L[c]-L[a])];
      var nl=Math.hypot(n[0],n[1],n[2]);if(nl<1e-12)return;
      var m=[(L[a]+L[b]+L[c])/3,(L[a+1]+L[b+1]+L[c+1])/3,(L[a+2]+L[b+2]+L[c+2])/3],o=axisOffset(m[0],m[1],m[2]);
      if(f[3]===G.STAFF_RIG_MATERIAL.crystal){
        var h=item.headIndex*3,d=[m[0]-L[h],m[1]-L[h+1],m[2]-L[h+2]];
        if(n[0]*d[0]+n[1]*d[1]+n[2]*d[2]<=0)outward=false;return;
      }
      // Lathe sides of the shaft, wrap and collars; caps and head prongs excluded.
      if(o.t>24||Math.abs(n[0]*A[0]+n[1]*A[1]+n[2]*A[2])/nl>.5)return;
      sideFaces++;if(n[0]*o.v[0]+n[1]*o.v[1]+n[2]*o.v[2]<=0)outward=false;
    });
    check('staff shaft and crystal facets wind outward for back-face culling',sideFaces>500&&outward);

    // Grip contact: pose the real hand with its arm/wrist turn removed so
    // positions are hand-local, then measure against the authored cylinder.
    var saved={root:STAFF.root,forearm:STAFF.forearm,arm:STAFF.arm};
    STAFF.root=[[0,0,0],[0,0,0],[0,0,0]];STAFF.forearm=null;STAFF.arm=null;
    G.poseHandRigMesh(mesh,G.sampleHandRigRestPose('staff'),0);
    var P=mesh.positions,segMin={},palmMin=1e9,thumbMin=1e9;
    mesh.desc.forEach(function(d,i){
      var c=clearance(P[i*3],P[i*3+1],P[i*3+2]);
      if(d.kind===0)palmMin=Math.min(palmMin,c);
      if(d.kind!==2)return;
      var Ls=mesh.digits[d.digit].lengths,seg=d.distance<Ls[0]?0:d.distance<Ls[0]+Ls[1]?1:2,key=d.digit+':'+seg;
      if(mesh.digits[d.digit].thumb)thumbMin=Math.min(thumbMin,c);else segMin[key]=Math.min(segMin[key]===undefined?1e9:segMin[key],c);
    });
    STAFF.root=saved.root;STAFF.forearm=saved.forearm;STAFF.arm=saved.arm;
    var contact=Object.keys(segMin).length===12&&Object.keys(segMin).every(function(k){return segMin[k]>-.06&&segMin[k]<.16;});
    if(!contact)__out('STAFF_GRIP_CLEARANCE '+JSON.stringify(segMin));
    check('every finger phalanx rests on the shaft without entering it',contact);
    check('palm and thumb stay outside the shaft',palmMin>-.02&&thumbMin>-.06);
    var closed=true;
    [0,500,800,1050,1220,1560,2000,2450,2800].forEach(function(t){var pose=G.sampleHandRigPose(t,'staff'),rest=G.sampleHandRigRestPose('staff');
      mesh.digits.forEach(function(d){if(JSON.stringify(G.handRigDigitFrame(d,pose))!==JSON.stringify(G.handRigDigitFrame(d,rest)))closed=false;});});
    check('staff grip stays closed through the entire cast',closed);
    check('staff grip ignores the free-hand casting style',[0,1220,1560].every(function(t){
      G.poseHandRigMesh(mesh,G.sampleHandRigPose(t,'staff','arcane'),0);var a=copy(mesh.positions);
      G.poseHandRigMesh(mesh,G.sampleHandRigPose(t,'staff','finger_guns'),0);return maxDelta(a,mesh.positions)===0;}));

    // Production draws. The staff is posed from the palm frame each draw.
    var handFaces=mesh.faces.length,wristRing=[];
    mesh.desc.forEach(function(d,i){if(d.kind===0&&d.y===0)wristRing.push(i);});
    var wrapVerts=[];item.faces.forEach(function(f){if(f[3]===G.STAFF_RIG_MATERIAL.wrap)f.slice(0,3).forEach(function(i){if(wrapVerts.indexOf(i)<0)wrapVerts.push(i);});});
    function draw(t,yaw){commands=[];G.drawFirstPersonHandRig(t,yaw===undefined?0:yaw,'staff','arcane');}
    function meanDepth(S,list){var s=0;list.forEach(function(i){s+=S[i*3+2];});return s/list.length;}
    function sample(t){draw(t);var S=item.screen,h=item.headIndex*3,W=G.canvas.width,H=G.canvas.height;
      return {head:[S[h],S[h+1]],headDepth:S[h+2],gripDepth:meanDepth(S,wrapVerts),wristDepth:meanDepth(mesh.screen,wristRing),
        center:Math.hypot(S[h]-W/2,S[h+1]-H/2),W:W,H:H,hand:copy(mesh.screen),staff:copy(S)};}
    var pairs=[[wristRing[0],0],[wristRing[6],wrapVerts[3]],[wristRing[12],item.headIndex]];
    function pairDistances(){return pairs.map(function(p){var a=p[0]*3,b=p[1]*3;
      return Math.hypot(mesh.positions[a]-item.positions[b],mesh.positions[a+1]-item.positions[b+1],mesh.positions[a+2]-item.positions[b+2]);});}
    draw(0);var restPairs=pairDistances(),rigid=true;
    [300,700,1050,1200,1420,1600,2000,2450].forEach(function(t){[0,-.8,.8,Math.PI].forEach(function(yaw){
      draw(t,yaw);if(maxDelta(restPairs,pairDistances())>1e-9)rigid=false;});});
    check('staff stays rigidly locked to the palm through the cast and inspection views',rigid);

    // Wrist bend: angle between the hand and forearm frames stays anatomical.
    var worstBend=0;
    for(var t=0;t<=2800;t+=50){
      G.poseHandRigMesh(mesh,G.sampleHandRigPose(t,'staff'),0);var fr=mesh.frame,trace=0;
      [[1,0,0],[0,1,0],[0,0,1]].forEach(function(e,k){var h=G.handRigPlace(fr,e[0],e[1],e[2],1),f=G.handRigPlace(fr,e[0],e[1],e[2],0);trace+=h[0]*f[0]+h[1]*f[1]+h[2]*f[2];});
      worstBend=Math.max(worstBend,Math.acos(Math.max(-1,Math.min(1,(trace-1)/2)))*180/Math.PI);
    }
    check('wrist bend between hand and sleeve stays within 50 degrees',worstBend>5&&worstBend<50);

    // Resting view: out of the player's way at preview and fullscreen shapes.
    var outOfWay=true,headVisible=true,layout=[];
    [[360,240],[640,360],[1280,720]].forEach(function(size){
      G.canvas={width:size[0],height:size[1]};var r=sample(0),minX=1e9;
      mesh.order.forEach(function(k){var part=k<handFaces?mesh:item,F=part.faces[k<handFaces?k:k-handFaces];
        for(var j=0;j<3;j++)minX=Math.min(minX,part.screen[F[j]*3]);});
      layout.push({size:size,minX:+(minX/size[0]).toFixed(3),head:[+(r.head[0]/size[0]).toFixed(3),+(r.head[1]/size[1]).toFixed(3)]});
      if(minX<.62*size[0])outOfWay=false;
      if(r.head[0]<.76*size[0]||r.head[0]>.97*size[0]||r.head[1]<.12*size[1]||r.head[1]>.55*size[1])headVisible=false;
    });
    __out('STAFF_REST_LAYOUT '+JSON.stringify(layout));
    check('resting staff and hand stay in the right side of the view, clear of the crosshair',outOfWay);
    check('resting staff head is visible near the right edge',headVisible);
    // A first-person arm rises from the bottom edge (or the very corner),
    // never from the side. Follow the sleeve's projected centerline from the
    // wrist: it must leave through the bottom edge, or the right edge only in
    // its lowest 5%, sloping at least 30 degrees below horizontal.
    var stations={};
    mesh.desc.forEach(function(d,i){if(d.kind===1&&!d.sleeveCap)(stations[d.y]||(stations[d.y]=[])).push(i);});
    var stationYs=Object.keys(stations).map(Number).sort(function(a,b){return b-a;});
    function centre(y){var c=[0,0],list=stations[y];list.forEach(function(i){c[0]+=mesh.screen[i*3];c[1]+=mesh.screen[i*3+1];});return [c[0]/list.length,c[1]/list.length];}
    var sideEntry=null,armSamples=0;
    [[360,240],[640,360],[1280,720]].forEach(function(size){G.canvas={width:size[0],height:size[1]};var W=size[0],H=size[1];
      for(var at=0;at<=2800;at+=20){draw(at);armSamples++;if(sideEntry)continue;
        var wrist=centre(stationYs[0]),exit=null;
        for(var k=1;k<stationYs.length&&!exit;k++){var a=centre(stationYs[k-1]),b=centre(stationYs[k]);
          if(b[0]>W||b[0]<0||b[1]>H){
            var tb=b[1]>H?(H-a[1])/(b[1]-a[1]):9,tr=b[0]>W?(W-a[0])/(b[0]-a[0]):9,tl=b[0]<0?-a[0]/(b[0]-a[0]):9,t=Math.min(tb,tr,tl);
            exit={edge:t===tb?'bottom':t===tr?'right':'left',x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t};}}
        var slope=exit?Math.atan2(exit.y-wrist[1],Math.abs(exit.x-wrist[0])+1e-9)*180/Math.PI:0;
        if(!exit||exit.edge==='left'||(exit.edge==='right'&&exit.y<.95*H)||slope<30)
          sideEntry={time:at,size:size,exit:exit&&{edge:exit.edge,y:+(exit.y/H).toFixed(3)},slope:+slope.toFixed(1)};}
    });
    if(sideEntry)__out('STAFF_ARM_SIDE_ENTRY '+JSON.stringify(sideEntry));
    check('sleeve rises from the bottom edge, never the side, in every phase',armSamples===423&&stationYs.length>10&&!sideEntry);
    G.canvas={width:360,height:240};

    // Cast: the arm reaches away and the staff tips forward toward the aim
    // without its head covering the crosshair.
    var rest=sample(0),point=sample(1560);
    check('cast extends the arm away from the camera',point.wristDepth-rest.wristDepth>12);
    check('cast tips the staff head forward into the scene',(point.headDepth-point.gripDepth)-(rest.headDepth-rest.gripDepth)>12);
    check('pointed staff head comes toward the aim point but leaves the crosshair clear',
      point.center<.6*rest.center&&point.center>.04*point.W);
    var gather=sample(900);
    check('gather draws the staff up before the thrust',gather.headDepth<rest.headDepth&&gather.head[1]<rest.head[1]);
    var recovered=[2450,2800].every(function(t){var s=sample(t);return maxDelta(s.hand,rest.hand)<1e-9&&maxDelta(s.staff,rest.staff)<1e-9;});
    check('recovery returns hand and staff to the exact resting projection',recovered);
    var continuous=true;
    [500,1050,1420,1730,2450].forEach(function(b){
      G.poseHandRigMesh(mesh,G.sampleHandRigPose(b-.001,'staff'),0);G.poseHandRigItem(item,mesh.frame);var h0=copy(mesh.positions),s0=copy(item.positions);
      G.poseHandRigMesh(mesh,G.sampleHandRigPose(b+.001,'staff'),0);G.poseHandRigItem(item,mesh.frame);
      if(maxDelta(h0,mesh.positions)>.02||maxDelta(s0,item.positions)>.02)continuous=false;});
    check('phase boundaries never snap the hand or staff',continuous);

    // One far-to-near order shared by hand and staff, with real interleaving.
    draw(0);var ordered=true,kinds='';
    function depthOf(k){return k<handFaces?mesh.faceDepth[k]:item.faceDepth[k-handFaces];}
    mesh.order.forEach(function(k,i){if(i>0&&depthOf(mesh.order[i-1])<depthOf(k))ordered=false;var kind=k<handFaces?'h':'s';if(kinds.slice(-1)!==kind)kinds+=kind;});
    check('hand and staff faces share one far-to-near painter order',ordered&&/hsh|shs/.test(kinds));

    // Crystal glow is presentation only and restores the Canvas state.
    draw(0);var restGlow=commands.some(function(c){return c[0]==='radial';});
    draw(1560);var castGlow=commands.some(function(c){return c[0]==='radial';})&&commands.some(function(c){return c[0]==='arc'&&c[1]==='lighter';});
    var liftRest=G.staffRigLift(G.sampleHandRigPose(0,'staff'))[G.STAFF_RIG_MATERIAL.crystal],liftCast=G.staffRigLift(G.sampleHandRigPose(1560,'staff'))[G.STAFF_RIG_MATERIAL.crystal];
    check('crystal glows only while the cast is charged',!restGlow&&castGlow&&liftCast>liftRest);
    check('drawing restores Canvas state and leaves gameplay unchanged',stack.length===0&&G.ctx.globalCompositeOperation==='multiply'&&G.ctx.globalAlpha===.43&&snapshot()===before);

    commands=[];G.drawFirstPersonHandRig(1560,0,'handle','arcane');
    check('grips without an item draw no staff and no glow',mesh.order.every(function(k){return k<handFaces;})&&!commands.some(function(c){return c[0]==='radial';}));
    STAFF.item='missing';var survived=true;
    try{draw(0);}catch(error){survived=false;}
    STAFF.item='staff';
    check('an unregistered item name draws the hand alone',survived&&mesh.order.every(function(k){return k<handFaces;}));
    G.clearStaffRigCache();
    check('clearing the staff cache releases its mesh and counters',G._staffRigMesh===null&&G.getStaffRigStats().triangles===0);
    check('staff rebuild is fresh and identical in size',G.buildStaffRigMesh()!==item&&G.getStaffRigStats().triangles===item.faces.length);
    __out('STAFF_RIG_RESULT PASS '+checks);
  } finally {Math.random=oldRandom;}
}());
undefined;
