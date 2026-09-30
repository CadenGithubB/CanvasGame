// Water and movement: the real fixed-tick player step and NPC locomotion in a
// seeded Endless window. Rivers carry an idle player downstream, dry ground
// does not; the same input covers less ground in deep water; enemies wade.
(function () {
  var G=(0,eval)('this'),checks=0,out=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
  function check(name,ok,detail){if(!ok){if(detail!==undefined)out('DETAIL '+JSON.stringify(detail));throw Error(name);}checks++;out('PASS '+name);}
  var host=slurp('tools/game/tests/cave_occlusion_integration.js'),hostEnd=host.indexOf('  function check(name, okay) {');
  var loadLine="manifest.parts.MAIN.forEach(function (path) { (0, eval)(slurp('assets/games/' + path)); });";
  if(hostEnd<0||host.split(loadLine).length!==2)throw Error('shipping game host boundary missing');
  var src=slurp('assets/games/src/06-water.js');
  function patch(from,to,flag){if(__argv.indexOf(flag)<0)return;if(src.split(from).length!==2)throw Error('mutation anchor for '+flag+' must match exactly once');src=src.replace(from,to);}
  patch('out.x = w.flowX * k; out.y = w.flowY * k;','out.x = 0; out.y = 0;','--no-current');
  patch('var WATER_WADE_SLOW = 0.45;','var WATER_WADE_SLOW = 0;','--no-wade');
  G.__waterSource=src;
  (0,eval)(host.slice(0,hostEnd).replace(loadLine,"manifest.parts.MAIN.forEach(function (path) { (0, eval)(path === 'src/06-water.js' ? G.__waterSource : slurp('assets/games/' + path)); });")+'G.__waterErrors=errors; }());');
  function loadWorld(seed){var st0=seed,realRandom=Math.random;Math.random=function(){st0=(st0*1103515245+12345)%2147483648;return st0/2147483648;};
    try{G.ENDLESS_MODE=G.running=true;G.gameOverState=false;G.terrain='plains';G.resetEndlessMode();}finally{Math.random=realRandom;}}
  loadWorld(33);
  G.MODE3D=true;G.NOCLIP=false;G.menuOpen=G.shopOpen=false;
  // World streaming is not under test: hold the window still so fixture cell
  // indices stay valid. The player step, input and water model are all real.
  var realUpdateChunks=G.updateChunks;G.updateChunks=function(){};
  var m=G.floorMesh,gs=m.gridSize,n=m.w*m.h,dt=1/60;
  function findDry(){for(var i=0;i<n;i++){if(m.water[i]||!(G._waterWindowBed(m,i)===G._waterWindowBed(m,i))||!open(i,4))continue;
    var dx0=i%m.w,dy0=(i/m.w)|0,near=false;for(var ry=-6;ry<=6;ry++)for(var rx=-6;rx<=6;rx++)if(m.water[(dy0+ry)*m.w+dx0+rx])near=true;if(!near)return i;}return -1;}
  function centre(i){return {x:(i%m.w+.5)*gs,y:(((i/m.w)|0)+.5)*gs};}
  function place(i){var c=centre(i);G.pos.x=c.x;G.pos.y=c.y;G.pos.floorZ=G.meshHeightToPlayerZ(G.getFloorHeightAt(c.x,c.y));
    G.vel.x=G.vel.y=0;G.jumpVelZ=0;G.jumpAirborne=false;G.onWallTop=false;G.cam.x=c.x;G.cam.y=c.y;}
  function open(i,r){var x=i%m.w,y=(i/m.w)|0;for(var dy=-r;dy<=r;dy++)for(var dx=-r;dx<=r;dx++){var X=x+dx,Y=y+dy;if(X<1||Y<1||X>=m.w-1||Y>=m.h-1||G.grid[Y*m.w+X])return false;}return true;}

  // Idle drift: a fast, reasonably deep river cell versus open dry ground.
  var river=-1,dry=-1;
  for(var i=0;i<n;i++){
    if(river<0&&m.water[i]===2&&m.waterSpeed[i]>=0.3&&m.waterDepth[i]>0.25&&open(i,3))river=i;
    if(dry<0&&!m.water[i]&&G._waterWindowBed(m,i)===G._waterWindowBed(m,i)&&open(i,4)){var dx0=i%m.w,dy0=(i/m.w)|0,near=false;
      for(var ry=-6;ry<=6;ry++)for(var rx=-6;rx<=6;rx++)if(m.water[(dy0+ry)*m.w+dx0+rx])near=true;if(!near)dry=i;}
  }
  check('fixtures include a flowing river cell and open dry ground',river>=0&&dry>=0,{river:river,dry:dry});
  var flow=[m.waterDirX[river],m.waterDirY[river]],startSurface=m.waterSurface[river];
  place(river);var s0=centre(river);
  for(var t=0;t<120;t++)G.step(dt);
  var along=(G.pos.x-s0.x)*flow[0]+(G.pos.y-s0.y)*flow[1];
  check('an idle player standing in a river drifts downstream with the current',along>4,{along:along,flow:flow,speed:m.waterSpeed[river],depth:m.waterDepth[river]});
  var endW=G.waterAt(G.pos.x,G.pos.y);
  check('the current carries the player to water whose surface is no higher',!endW||endW.surface<=startSurface+1e-5);
  place(dry);var d0=centre(dry);for(var t2=0;t2<120;t2++)G.step(dt);
  check('an idle player on dry ground does not drift',Math.hypot(G.pos.x-d0.x,G.pos.y-d0.y)<0.5);

  // Jumping clear of the surface ends both effects.
  var wr=G.waterAt(centre(river).x,centre(river).y),above=wr.surfaceZ+5;
  var cur=G.waterCurrentAt(centre(river).x,centre(river).y,above,{x:0,y:0});
  check('feet above the surface feel no drag and no current',G.waterSpeedFactorAt(centre(river).x,centre(river).y,above)===1&&cur.x===0&&cur.y===0);

  // Switching the system off removes every effect (for in-game A/B).
  G.setWaterSystemEnabled(false);
  var offCur=G.waterCurrentAt(centre(river).x,centre(river).y,G.meshHeightToPlayerZ(G._waterWindowBed(m,river)),{x:0,y:0});
  check('with the water system off there is no drag or current anywhere',G.waterSpeedFactorAt(centre(river).x,centre(river).y,0)===1&&offCur.x===0&&offCur.y===0&&G.__waterErrors.length===0);
  G.setWaterSystemEnabled(true);
  // Wading, in a world whose valley pools are deeper than the full-effect
  // depth, so the expected slowdown is the authored constant, not a formula.
  loadWorld(11);m=G.floorMesh;n=m.w*m.h;dry=findDry();
  // Wading: from rest, the same forward input covers less ground in deep water.
  function walk(i,ang,ticks){place(i);G.cam.ang=ang;var start=centre(i),minDepth=Infinity;
    for(var k=0;k<ticks;k++){G.tickEffects(dt);G.applyGamepad(0,-1,dt);G.step(dt);var w=G.waterAt(G.pos.x,G.pos.y);minDepth=Math.min(minDepth,w?w.depth:0);}
    return {dist:Math.hypot(G.pos.x-start.x,G.pos.y-start.y),minDepth:minDepth};}
  var lakeRun=null;
  for(var li=0;li<n&&!lakeRun;li++){
    if(m.water[li]!==1||m.waterDepth[li]<0.8||!open(li,2))continue;
    for(var a=0;a<8&&!lakeRun;a++){var ang=a*Math.PI/4,r=walk(li,ang,40);if(r.minDepth*40>=G.WATER_FULL_DEPTH_Z)lakeRun={cell:li,ang:ang,dist:r.dist};}
  }
  var dryRun=null;
  for(var a2=0;a2<8&&!dryRun;a2++){var r2=walk(dry,a2*Math.PI/4,40);if(r2.minDepth===0&&r2.dist>5)dryRun={ang:a2*Math.PI/4,dist:r2.dist};}
  check('fixtures include a walk that stays in deep lake water and one on dry ground',!!lakeRun&&!!dryRun,{lake:lakeRun,dry:dryRun});
  var ratio=lakeRun.dist/dryRun.dist,expected=1-G.WATER_WADE_SLOW;
  check('deep water slows the same input to the wading factor',Math.abs(ratio-expected)<0.06&&ratio<0.8,{ratio:ratio,expected:expected});

  // Enemies wade through the same model.
  function npcTravel(i){var c=centre(i),actor={x:c.x,y:c.y,z:0,radius:6,facing:0};var before={x:actor.x,y:actor.y};
    G.npcMoveToward(actor,c.x+200,c.y,40,0.25,6,0);return Math.hypot(actor.x-before.x,actor.y-before.y);}
  var wetNpc=npcTravel(lakeRun.cell),dryNpc=npcTravel(dry);
  check('an enemy moving through deep water travels less than on dry ground',dryNpc>5&&wetNpc<dryNpc*0.8,{wet:wetNpc,dry:dryNpc});

  G.updateChunks=realUpdateChunks;
  out('WATER_MOVEMENT_RESULT PASS '+checks);
}());
undefined;
