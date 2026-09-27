// Authored navigation geometry and last-seen behavior. The browser transport is
// hosted; the planner, body controller, support, perception and clock are real.
(function () {
  var G=(0,eval)('this'),out=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
  var checked=0,failed=0,wallNow=100000,oldDate=Date.now,oldRandom=Math.random;
  Date.now=function(){return wallNow;};
  function mutate(source,flag,before,after){
    if(__argv.indexOf(flag)<0)return source;
    if(source.split(before).length!==2)throw Error('MUTATION_ANCHOR '+flag);
    return source.replace(before,after);
  }
  G.__navSource=function(path,source){
    // Each probe changes a temporary source string, never a shipping file.
    if(path==='src/10-npc-navigation.js'){
      source=mutate(source,'--no-route-request','if(!moved || nav.blockedMs>=150) {','if(false) {');
      source=mutate(source,'--probe-short-body','radius:job.radius,height:job.height,','radius:job.radius,height:1,');
      source=mutate(source,'--unbounded-search','NPC_NAV_MAX_EDGES_PER_TICK=48','NPC_NAV_MAX_EDGES_PER_TICK=480');
      source=mutate(source,'--starve-later-jobs','if(!job.done)_npcNavQueue.push(job);','if(!job.done)_npcNavQueue.unshift(job);');
      source=mutate(source,'--ignore-goal-storey','(Number.isFinite(requiredZ) && Math.abs(body.feetZ-requiredZ)>.01)','false');
      source=mutate(source,'--ignore-world-revision','_npcNavSeenRevision===_npcNavRevision)return;','true)return;');
      source=mutate(source,'--ignore-map-replacement','_npcNavGrid===grid && _npcNavMesh===floorMesh && _npcNavWalls===wallHeights &&','true &&');
      source=mutate(source,'--orphan-disabled-job',"if(actor.health<=0 || !npcHasTrait(actor,'navigation')) {npcResetNavigation(actor);continue;}","if(actor.health<=0 || !npcHasTrait(actor,'navigation')) continue;");
      source=mutate(source,'--nearby-storey-is-arrival','if(!desired && Math.abs(entityFeetSpatialZ(actor)-requiredZ)<.01)return false;','if(!desired && Math.abs(entityFeetSpatialZ(actor)-requiredZ)<=25)return false;');
      source=mutate(source,'--ignore-active-waypoint-storey','requiredZ=nav.path[nav.index].feetZ;','/* mutation: compare only final goal storey */');
      source=mutate(source,'--follow-jump-height',"return support.status==='walk' || support.status==='fall' ? support.feetZ : NaN;",'return playerFeetSpatialZ();');
      source=mutate(source,'--diagonal-height-shortcut','if(Math.abs(body.feetZ-from.z)>.01 && Math.abs(x-from.x)>.00001 && Math.abs(y-from.y)>.00001)return null;','/* mutation: coarse edge cuts a step corner that fixed ticks cannot climb */');
    }
    if(path==='src/10-npc-controller.js'){
      source=mutate(source,'--omniscient-memory','var x=seen.worldX-windowOriginX,y=seen.worldY-windowOriginY;','var x=seen.targetRef.x,y=seen.targetRef.y;');
      source=mutate(source,'--endless-memory','now>=seen.expiresAt','false');
      source=mutate(source,'--window-local-memory','seen.worldX=target.x+windowOriginX;seen.worldY=target.y+windowOriginY;','seen.worldX=target.x;seen.worldY=target.y;');
      source=mutate(source,'--keep-dead-memory','if(!npcTargetPresent(actor,seen.targetRef)) {npcForgetTarget(actor);return null;}','/* mutation: dead targets remain searchable */');
      source=mutate(source,'--arrive-through-wall',"if(spatialRaycast(npcAimPoint(actor),{x:x,y:y,z:seen.aimZ}).status==='clear') {",'if(true) {');
      source=mutate(source,'--arrive-on-other-floor','Math.abs(seen.feetZ-entityFeetSpatialZ(actor))<=.01','Math.abs(seen.feetZ-entityFeetSpatialZ(actor))<=25');
    }
    if(path==='src/19-companions-loot.js')source=mutate(source,'--slime-xy-only-follow',"var moving = npcHasTrait(c, 'followOwner') && (tdist > 5 || otherFloor);","var moving = npcHasTrait(c, 'followOwner') && tdist > 5;");
    if(path==='src/18-arena-fortress.js')source=mutate(source,'--garrison-xy-only-follow',"npcHasTrait(ally, 'followOwner') && (dist > ally.followIdeal || otherFloor)","npcHasTrait(ally, 'followOwner') && dist > ally.followIdeal");
    return source;
  };
  var host=slurp('tools/game/tests/cave_occlusion_integration.js');
  var boundary=host.indexOf('  function check(name, okay) {');
  if(boundary<0)throw Error('SETUP navigation browser host boundary missing');
  host=host.slice(0,boundary);
  var load="manifest.parts.MAIN.forEach(function (path) { (0, eval)(slurp('assets/games/' + path)); });";
  if(host.split(load).length!==2)throw Error('SETUP navigation manifest boundary missing');
  host=host.replace(load,"manifest.parts.MAIN.forEach(function(path){(0,eval)(G.__navSource(path,slurp('assets/games/'+path)));});");
  (0,eval)(host+'G.__navErrors=errors; }());');
  function check(name,okay,detail){checked++;if(!okay)failed++;out((okay?'PASS ':'FAIL ')+name+(okay?'':' '+JSON.stringify(detail)));}
  function near(a,b){return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-6;}
  function round(v){return Math.round(v*1e6)/1e6;}
  function pose(a){return [round(a.x),round(a.y),round(a.feetZ)];}
  function reset(){
    wallNow=100000;var rng=41753;Math.random=function(){rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
    G.running=true;G.gameOverState=G.menuOpen=G.settingsOpen=G.shopOpen=G.inventoryOpen=G.forgeOpen=G.overviewActive=false;
    G.document.hidden=false;G.document.pointerLockElement=null;G.CAVE_TEST_MODE=G.ENDLESS_MODE=false;G.terrain='ground';
    G.MODE3D=false;G.CAM_FOLLOW=true;G.calibrating=false;G.USE_KEYBOARD=G.USE_MOUSE=true;G.USE_GAMEPAD=false;
    G.CONTROL_MODE=G.MODE_STICK_AIM;G.hasYaw=G.hasBaseline=G.capturingYaw=false;
    G.yawTarget=G.pitchTarget=G.yawOffset=G.autoPitchOff=0;G._imuSampleValid=false;
    G.gpLast={valid:false,buttons:-1,x:0,y:0};G.lastSelectDown=G.lastStartMenuDown=G.lastADown=G.lastXDown=false;
    G.lastSelectToggleMs=G.lastStartMenuToggleMs=wallNow;
    G.cell=20;G.gridW=G.gridH=32;G.grid=new Uint8Array(1024);G.worldW=G.worldH=640;
    G.floorMesh=G.gridCave=G.wallHeights=G.wallFaceBase=G.wallMaxTopZ=null;G.deepCaveRegions=[];G.deepCaveEntrances=[];
    G.windowOriginX=G.windowOriginY=0;G.pos={x:550,y:550,floorZ:60};G.vel={x:0,y:0};
    G.cam={x:550,y:550,z:60,ang:0,pitch:0,fov:G.GAME_CONFIG.player.baseFov};G.viewCam={x:370,y:430};
    G.playerUnderground=false;G.equipment={};G.speed=G.GAME_CONFIG.player.baseSpeed;
    G.damping=G.GAME_CONFIG.terrainPhysics.ground.damping;G.bounce=G.GAME_CONFIG.terrainPhysics.ground.bounce;
    G.jumpAirborne=false;G.jumpVelZ=G.dashFovPunch=G.dashUntil=G.dashCooldownUntil=0;
    G.health=G.HEALTH_MAX=1000;G.mana=G.MANA_MAX=1000;G.MANA_REGEN_PER_S=G.HEALTH_REGEN_PER_S=0;
    G.wardActive=false;G.stats={totalDamageDone:0,totalDamageTaken:0,totalManaConsumed:0,totalEnemiesKilled:0};
    ['walls','enemies','enemySpawners','projectiles','impacts','groundEffects','chainEffects','coneEffects','novaEffects',
      'deathEffects','coinDrops','soulOrbs','arcaneTomes','statPickups','companions','fortressAllies',
      'treasureChests','oreVeins','marketStalls','ambientParticles','structures','shrines','floorScatter','wallDecorations'].forEach(function(k){G[k]=[];});
    G.shopMarker=G.shopNearby=G.nearestOpenChest=G.nearestShrine=G.nearestArenaAltar=G.arenaChallenge=G.goal=null;
    G.fortressLockedNear=G.nearestFortressInteract=null;G.goalSpawned=true;G.exploredCells=null;
    G.viewDist=900;G.dayTime=.5;G.daySpeed=0;G.settings.dayNight=false;G.currentSpellIdx=0;
    G.spells.missile.unlocked=true;G.spells.missile.tier=1;G.pendingMissileCasts=[];G.spellCastReservationSerial=0;
    G.projectileConsumedMotionTick=-1;G.spatialSimulationTick=0;
    G.castAnimUntil=G.flameStreamLastTick=G.dmgBoostUntil=G.speedBoostUntil=G.armorBoostUntil=G.regenBoostUntil=0;
    G.NOCLIP=G.DEBUG_COMBAT=G.DEBUG_EFFECTS=G.DEBUG_CAVE=G.DEBUG_CAM=G.DEBUG_PERF=G.DEBUG_PERF_HUD=G.DEBUG_SKELETON=false;
    G.collisions=0;G.clearGameplayInput();G.resetSimulationFrame();G._loopGen++;
    G._loopErrCount=0;G._ptErrors={};G.__navErrors.length=0;
    G._gameClockOriginMs=null;G._gameClockElapsedMs=0;G.simulationTiming={ticks:0,droppedMs:0,maxStepsPerFrame:0};
    G.startGameClock();G.startMs=G.gameTimeNow();G.lastShotMs=G.gameTimeNow()-1000;
    G.renderInterpolationEnabled=true;G.resetRenderInterpolation();G.resetNpcSystem();
  }
  function actor(x,y,height){
    var a={x:x,y:y,z:0,feetZ:0,bodyHeight:height||70,health:100,maxHealth:100,speed:60,chaseRange:500,
      enemyType:Object.assign({},G.enemyTypes.normal,{speed:60,chaseRange:500,attackDamage:10,attackWindup:100,attackCooldown:200,size:1}),
      lastUpdate:0,vx:0,vy:0,attackState:'idle',attackStateUntil:0,patrolWaypoints:[],patrolIdx:0};
    G.enemies.push(a);G.npcEnsure(a,'enemy');return a;
  }
  function mesh(){
    var w=33,m={w:w,h:w,gridSize:20,layerCount:new Uint8Array(w*w),surfaceH:new Float64Array(w*w),ceilAboveMask:new Uint8Array(w*w)};
    m.layerCount.fill(1);
    for(var k=0;k<5;k++){
      m['l'+k+'Type']=new Uint8Array(w*w);m['l'+k+'TopZ']=new Float64Array(w*w);m['l'+k+'Meta']=new Uint8Array(w*w);
    }
    m.l0Type.fill(1);m.l0Meta.fill(1);G.floorMesh=m;G.ENDLESS_MODE=true;return m;
  }
  function rectWall(x0,y0,x1,y1){for(var y=y0;y<y1;y++)for(var x=x0;x<x1;x++)G.grid[y*G.gridW+x]=1;}
  function tick(fn){G.advanceGameClock(1/60);G.spatialSimulationTick++;fn();}
  function route(a,x,y,z,ticks,radius){
    var trace=[];
    for(var t=0;t<ticks;t++)tick(function(){G.npcNavigateToward(a,x,y,z,60,1/60,radius||8,1);trace.push(pose(a));});
    return trace;
  }
  // Independent analytic circle/rectangle oracle. It does not consult either
  // production collision code or the planner's own walkability cache.
  function clearRect(p,r,x0,y0,x1,y1){
    var dx=p[0]-Math.max(x0,Math.min(p[0],x1)),dy=p[1]-Math.max(y0,Math.min(p[1],y1));
    return dx*dx+dy*dy>=r*r-1e-4;
  }
  function arrived(a,x,y){return Math.hypot(a.x-x,a.y-y)<=1.01;}
  reset();var a=actor(110,150);var open=route(a,270,150,0,180);
  check('authored route fixture has clear supported start and actually moves',open[0][0]>110&&open[0][1]===150&&G.grid.every(function(v){return v===0;}),open.slice(0,3));
  check('unobstructed navigation preserves sixty unit speed without arrival overshoot',near(open[59][0],170)&&arrived(a,270,150)&&near(a.y,150),{tick60:open[59],end:pose(a)});

  reset();a=actor(110,150);rectWall(9,4,10,11);var detour=route(a,270,150,0,540);
  check('wall fixture intersects the direct route and has open space beyond both ends',G.grid[7*32+9]===1&&G.grid[3*32+9]===0&&G.grid[11*32+9]===0);
  check('blocked navigator actually routes around the wall and reaches its goal',arrived(a,270,150)&&detour.some(function(p){return p[1]<=72.01||p[1]>=227.99;}),{end:pose(a),trace:detour.filter(function(_,i){return i%30===0;})});
  check('wall detour never cuts the body footprint through authored solid geometry',detour.every(function(p){return clearRect(p,8,180,80,200,220);}),detour.filter(function(p){return !clearRect(p,8,180,80,200,220);}).slice(0,3));

  reset();a=actor(130,130);rectWall(8,7,9,8);rectWall(7,8,8,9);var corner=route(a,210,210,0,540);
  check('diagonal corner route reaches goal only by going around the touching solids',arrived(a,210,210)&&corner.every(function(p){return clearRect(p,8,160,140,180,160)&&clearRect(p,8,140,160,160,180);}),{end:pose(a),trace:corner.filter(function(_,i){return i%30===0;})});

  function roofRoute(height){
    reset();var m=mesh(),unit=actor(110,150,height);
    for(var y=4;y<11;y++)for(var x=9;x<10;x++){var i=y*m.w+x;m.layerCount[i]=2;m.l1Type[i]=2;m.l1TopZ[i]=2.5;}
    var trace=route(unit,270,150,0,540);return {actor:unit,trace:trace};
  }
  var tall=roofRoute(70),short=roofRoute(60);
  check('seventy unit navigator detours around sixty two unit roof clearance',arrived(tall.actor,270,150)&&tall.trace.every(function(p){return clearRect(p,8,180,80,200,220);}),{end:pose(tall.actor),trace:tall.trace.filter(function(_,i){return i%30===0;})});
  check('short navigator uses the same passage directly when its body fits',arrived(short.actor,270,150)&&short.trace.every(function(p){return near(p[1],150);}),{end:pose(short.actor),trace:short.trace.filter(function(_,i){return i%30===0;})});

  ['unloaded','drop'].forEach(function(kind){
    reset();var m=mesh();a=actor(110,150);
    for(var y=0;y<m.h;y++)for(var x=9;x<11;x++){var i=y*m.w+x;if(kind==='unloaded')m.layerCount[i]=0;else{m.l0TopZ[i]=-3;m.surfaceH[i]=-3;}}
    var trace=route(a,270,150,0,240);
    check(kind+' barrier cannot be crossed or treated as flat path support',trace.every(function(p){return p[0]<=172.001&&near(p[2],0);})&&!arrived(a,270,150),{end:pose(a),trace:trace.filter(function(_,i){return i%30===0;})});
  });

  reset();mesh();a=actor(110,150);route(a,110,150,125,90);
  check('same horizontal goal on disconnected storey cannot complete a false route',near(a.feetZ,0)&&G.npcNavigationStats.requests>0&&G.npcNavigationStats.completed===0,
    {pose:pose(a),stats:G.npcNavigationStats,state:a.npc.navigation&&a.npc.navigation.status});

  reset();rectWall(9,4,10,11);var crowd=[];
  for(var ci=0;ci<12;ci++)crowd.push(actor(172,150));
  var maxEdges=0,edgesByTick=[];
  for(var ct=0;ct<25;ct++)tick(function(){
    var before=G.npcNavigationStats.edges;
    crowd.forEach(function(unit){G.npcNavigateToward(unit,270,150,0,60,1/60,8,1);});
    var edges=G.npcNavigationStats.edges-before;edgesByTick.push(edges);maxEdges=Math.max(maxEdges,edges);
  });
  check('crowd fixture queues twelve genuinely blocked independent actors',G.npcNavigationStats.requests>=12&&crowd.length===12&&G.npcNavigationStats.edges>0,{stats:G.npcNavigationStats,edges:edgesByTick});
  check('all actors share one forty eight probe budget per simulation tick',maxEdges>0&&maxEdges<=48&&G.npcNavigationStats.maxEdgesPerTick<=48,{max:maxEdges,edges:edgesByTick});
  check('round robin planning gives every queued actor real search work',crowd.every(function(unit){var nav=unit.npc.navigation;return nav&&(nav.status==='following'||nav.job&&nav.job.count>1);}),
    crowd.map(function(unit){var nav=unit.npc.navigation;return {id:unit.npc.id,state:nav&&nav.status,nodes:nav&&nav.job&&nav.job.count};}));

  function readyRoute(){
    reset();rectWall(9,4,10,11);var unit=actor(172,150);
    tick(function(){G.npcNavigateToward(unit,270,150,0,60,1/60,8,1);});
    for(var n=0;n<180&&unit.npc.navigation.status==='pending';n++)tick(G.npcNavigationTick);
    return unit;
  }
  a=readyRoute();
  check('dynamic geometry fixture has a completed live multi waypoint detour',a.npc.navigation.status==='following'&&a.npc.navigation.path.length>2&&G.npcNavigationStats.completed===1,
    {state:a.npc.navigation.status,stats:G.npcNavigationStats});
  G.grid=new Uint8Array(1024);var oldInvalidations=G.npcNavigationStats.invalidations;
  tick(function(){G.npcNavigateToward(a,270,150,0,60,1/60,8,1);});
  check('map replacement discards stale detour and immediately uses newly open direct motion',G.npcNavigationStats.invalidations===oldInvalidations+1&&near(a.x,173)&&near(a.y,150)&&a.npc.navigation.status==='direct',
    {pose:pose(a),state:a.npc.navigation.status,stats:G.npcNavigationStats});
  a=readyRoute();G.grid.fill(0);oldInvalidations=G.npcNavigationStats.invalidations;G.invalidateNpcNavigation();
  tick(function(){G.npcNavigateToward(a,270,150,0,60,1/60,8,1);});
  check('explicit in place geometry revision discards cached route advice',G.npcNavigationStats.invalidations===oldInvalidations+1&&near(a.x,173)&&near(a.y,150)&&a.npc.navigation.status==='direct',
    {pose:pose(a),state:a.npc.navigation.status,stats:G.npcNavigationStats});
  a=readyRoute();rectWall(9,0,10,32);var changed=route(a,270,150,0,360);
  check('live movement rechecks cached path when a new wall closes the passage',changed.every(function(p){return p[0]<=172.001;})&&!arrived(a,270,150),{pose:pose(a),trace:changed.filter(function(_,i){return i%30===0;})});
  a=readyRoute();G.windowOriginX=40;a.x-=40;G.grid=new Uint8Array(1024);rectWall(7,4,8,11);
  var shiftedRoute=route(a,230,150,0,540);
  check('origin shift abandons local route coordinates and navigates to the same world goal',arrived(a,230,150)&&shiftedRoute.every(function(p){return clearRect(p,8,140,80,160,220);}),
    {pose:pose(a),trace:shiftedRoute.filter(function(_,i){return i%30===0;})});

  reset();rectWall(9,4,10,11);a=actor(172,150);tick(function(){G.npcNavigateToward(a,270,150,0,60,1/60,8,1);});
  var wasPending=a.npc.navigation.status==='pending';a.npcTraits={navigation:false};tick(G.npcNavigationTick);tick(G.npcNavigationTick);
  var disabledCleared=a.npc.navigation===null;a.npcTraits.navigation=true;route(a,270,150,0,540);
  check('disabling a pending navigator without a movement call cannot orphan its future route',wasPending&&disabledCleared&&arrived(a,270,150),{pending:wasPending,cleared:disabledCleared,pose:pose(a),state:a.npc.navigation&&a.npc.navigation.status});

  reset();var stacked=mesh();stacked.layerCount.fill(3);stacked.l1Type.fill(2);stacked.l1TopZ.fill(.5);stacked.l2Type.fill(4);stacked.l2TopZ.fill(1);stacked.surfaceH.fill(1);
  a=actor(110,150,10);route(a,110,150,25,90);
  check('short body below a real cap does not call the nearby upper storey reached',near(a.feetZ,0)&&G.npcNavigationStats.requests>0&&G.npcNavigationStats.completed===0,
    {pose:pose(a),stats:G.npcNavigationStats,state:a.npc.navigation&&a.npc.navigation.status});

  reset();var movingFloor=mesh();
  for(var fy=0;fy<movingFloor.h;fy++)for(var fx=0;fx<10;fx++){movingFloor.l0TopZ[fy*movingFloor.w+fx]=1;movingFloor.surfaceH[fy*movingFloor.w+fx]=1;}
  rectWall(9,4,10,11);a=actor(172,150);a.feetZ=a.z=25;
  tick(function(){G.npcNavigateToward(a,270,150,0,60,1/60,8,1);});
  for(var ft=0;ft<180&&a.npc.navigation.status==='pending';ft++)tick(G.npcNavigationTick);
  var firstWaypoint=a.npc.navigation.path&&a.npc.navigation.path[0];
  check('live support edit fixture has a real raised waypoint leading to lower final floor',!!firstWaypoint&&firstWaypoint.feetZ===25&&a.npc.navigation.goalZ===0,
    {waypoint:firstWaypoint,state:a.npc.navigation.status});
  if(firstWaypoint){a.x=firstWaypoint.x;a.y=firstWaypoint.y;a.feetZ=a.z=0;}
  movingFloor.l0TopZ.fill(0);movingFloor.surfaceH.fill(0);var requestBeforeEdit=G.npcNavigationStats.requests;
  route(a,270,150,0,540);
  check('in place height change at current waypoint replans instead of freezing forever',G.npcNavigationStats.requests>requestBeforeEdit&&arrived(a,270,150)&&near(a.feetZ,0),
    {pose:pose(a),requests:G.npcNavigationStats.requests,before:requestBeforeEdit,state:a.npc.navigation.status});

  function follower(kind){
    reset();G.pos.x=270;G.pos.y=150;rectWall(9,4,10,11);
    var unit={x:110,y:150,feetZ:0,renderFloorZ:0,z:0,phase:0,wanderAng:0,lastAttackMs:0,
      npcTraits:{catchUp:false,orbit:false},squash:1};
    if(kind==='slime'){unit.type='slime';G.companions=[unit];}
    else{Object.assign(unit,{health:100,maxHealth:100,attackRange:18,attackDamage:3,attackCooldown:200,speed:90,followIdeal:40,followDist:60,teleportDist:99999});G.fortressAllies=[unit];}
    var trace=[];
    for(var t=0;t<360;t++)tick(function(){(kind==='slime'?G.updateCompanions:G.updateFortressAllies)(1/60);trace.push(pose(unit));});
    return {unit:unit,trace:trace,completed:G.npcNavigationStats.completed};
  }
  ['slime','garrison'].forEach(function(kind){var result=follower(kind),r=kind==='slime'?5:6;
    check(kind+' actual follower adapter routes around a wall without catch up teleport',result.completed>0&&result.unit.x>206&&Math.hypot(result.unit.x-270,result.unit.y-150)<=41&&
      result.trace.every(function(p){return clearRect(p,r,180,80,200,220);}),{end:pose(result.unit),completed:result.completed,trace:result.trace.filter(function(_,i){return i%30===0;})});
  });

  function verticalFollower(kind,jumping){
    reset();var m=mesh();G.pos.x=110;G.pos.y=150;G.pos.floorZ=jumping?220:260;G.jumpAirborne=!!jumping;
    if(!jumping){
      // A cellar under a 125-unit cap. Its only lower-floor exit is the east
      // corridor, then four authored 25-unit stairs and the exterior landing.
      // The owner begins directly overhead, so an XY-only follower would idle.
      for(var y=0;y<m.h;y++)for(var x=0;x<m.w;x++){
        var i=y*m.w+x;
        if(x<6){m.layerCount[i]=3;m.l1Type[i]=2;m.l1TopZ[i]=y===7?4:.8;m.l2Type[i]=4;m.l2TopZ[i]=5;m.surfaceH[i]=5;}
        else{var h=y===7&&x<10?x-5:5;m.l0TopZ[i]=h;m.surfaceH[i]=h;}
      }
    }
    var unit={x:110,y:150,feetZ:0,renderFloorZ:0,z:0,phase:0,wanderAng:0,lastAttackMs:0,
      npcTraits:{catchUp:false,orbit:false},squash:1};
    if(kind==='slime'){unit.type='slime';G.companions=[unit];}
    else{Object.assign(unit,{health:100,maxHealth:100,attackRange:18,attackDamage:3,attackCooldown:200,speed:90,followIdeal:40,followDist:60,teleportDist:99999});G.fortressAllies=[unit];}
    var trace=[];
    for(var t=0;t<(jumping?60:720);t++)tick(function(){(kind==='slime'?G.updateCompanions:G.updateFortressAllies)(1/60);trace.push(pose(unit));});
    return {unit:unit,trace:trace,requests:G.npcNavigationStats.requests,completed:G.npcNavigationStats.completed,ownerSupport:G.npcOwnerSupportZ()};
  }
  ['slime','garrison'].forEach(function(kind){
    var upstairs=verticalFollower(kind,false);
    check(kind+' follows same XY upstairs owner by walking the authored stairs',upstairs.ownerSupport===125&&upstairs.requests>0&&upstairs.completed>0&&upstairs.trace.some(function(p){return p[0]>=180;})&&near(upstairs.unit.feetZ,125)&&Math.hypot(upstairs.unit.x-110,upstairs.unit.y-150)<=41,
      {end:pose(upstairs.unit),requests:upstairs.requests,completed:upstairs.completed,ownerSupport:upstairs.ownerSupport,trace:upstairs.trace.filter(function(_,i){return i%30===0;})});
    var jump=verticalFollower(kind,true);
    check(kind+' owner jump on same ground does not create unreachable height searches',jump.ownerSupport===0&&jump.requests===0&&jump.completed===0&&jump.trace.every(function(p){return p[0]===110&&p[1]===150&&p[2]===0;}),
      {end:pose(jump.unit),requests:jump.requests,completed:jump.completed,ownerSupport:jump.ownerSupport});
  });

  // Render schedules differ; authoritative ticks and decisions must not. This
  // uses the actual loop, gameUpdate and garrison follower on an obstacle route.
  var realTick=G.runSimulationTick,replayActor=null,replayTrace=[];
  G.runSimulationTick=function(dt){var value=realTick(dt);replayTrace.push(pose(replayActor));return value;};
  function replay(hz){
    reset();G.pos.x=270;G.pos.y=150;G.cam.x=270;G.cam.y=150;rectWall(9,4,10,11);
    replayActor={x:110,y:150,feetZ:0,health:100,maxHealth:100,attackRange:18,attackDamage:3,attackCooldown:200,speed:90,
      followIdeal:40,followDist:60,teleportDist:99999,lastAttackMs:0,wanderAng:0,phase:0,npcTraits:{catchUp:false}};
    G.fortressAllies=[replayActor];replayTrace=[];G.loop(0,G._loopGen);
    for(var f=1;f<=hz*4;f++){wallNow=100000+f*1000/hz;G.loop(f*1000/hz,G._loopGen);}
    return {trace:replayTrace.slice(),completed:G.npcNavigationStats.completed,edges:G.npcNavigationStats.edges,errors:G.__navErrors.slice(),loopErrors:G._loopErrCount};
  }
  var baseline=replay(60);
  check('real loop route fixture reaches the owner through an actual completed detour',baseline.trace.length===240&&baseline.completed>0&&baseline.trace[239][0]>206&&baseline.errors.length===0&&baseline.loopErrors===0,
    {ticks:baseline.trace.length,end:baseline.trace[239],completed:baseline.completed,errors:baseline.errors,loopErrors:baseline.loopErrors});
  [30,120].forEach(function(hz){var result=replay(hz);
    check(hz+' Hz real loop preserves every authoritative navigation pose and search work',JSON.stringify(result)===JSON.stringify(baseline),{expected:{end:baseline.trace[239],completed:baseline.completed,edges:baseline.edges},actual:{end:result.trace[239],ticks:result.trace.length,completed:result.completed,edges:result.edges,errors:result.errors}});
  });
  G.runSimulationTick=realTick;

  // The next scenarios run the actual enemy adapter, not a second implementation
  // of memory. Unseen movement must not be an input to pursuit steering.
  function remember(hiddenY){
    reset();G.pos.x=230;G.pos.y=150;a=actor(110,150);G.npcSelectTarget(a,500);
    var visible=G.npcPursuitGoal(a,G.gameTimeNow());var observed=visible&&[visible.x,visible.y,visible.feetZ,visible.remembered];
    rectWall(9,4,10,11);G.pos.x=300;G.pos.y=hiddenY;
    tick(function(){G.updateEnemies(1/60);});
    var remembered=G.npcPursuitGoal(a,G.gameTimeNow()),snapshot=remembered&&[remembered.x,remembered.y,remembered.feetZ,remembered.remembered];
    var trace=[];
    for(var t=0;t<30;t++)tick(function(){G.updateEnemies(1/60);trace.push(pose(a));});
    return {visible:observed,memory:snapshot,trace:trace,health:G.health,state:a.attackState};
  }
  var hiddenUp=remember(110),hiddenDown=remember(190);
  check('last seen fixture acquires a real visible opponent before it hides',JSON.stringify(hiddenUp.visible)==='[230,150,0,false]'&&JSON.stringify(hiddenDown.visible)==='[230,150,0,false]',{a:hiddenUp.visible,b:hiddenDown.visible});
  check('hidden target relocation cannot rewrite last seen coordinates or steer pursuit',JSON.stringify(hiddenUp.memory)==='[230,150,0,true]'&&JSON.stringify(hiddenUp.memory)===JSON.stringify(hiddenDown.memory)&&JSON.stringify(hiddenUp.trace)===JSON.stringify(hiddenDown.trace),{a:hiddenUp,b:hiddenDown});
  check('remembered pursuit genuinely moves without granting remote attacks',hiddenUp.trace.some(function(p){return p[0]!==110||p[1]!==150;})&&hiddenUp.health===1000&&hiddenDown.health===1000,hiddenUp.trace.filter(function(_,i){return i%10===0;}));

  reset();G.pos.x=230;G.pos.y=150;a=actor(110,150);G.npcSelectTarget(a,500);var observedAt=G.gameTimeNow();
  rectWall(9,4,10,11);G.pos.x=300;G.pos.y=150;G.npcSelectTarget(a,500);
  var duration=G.NPC_PROFILES.enemy.memoryMs;
  check('memory has finite positive profile duration and survives a brief loss of sight',duration>0&&Number.isFinite(duration)&&!!G.npcPursuitGoal(a,observedAt+100));
  check('lost target memory expires at its simulation deadline',G.npcPursuitGoal(a,observedAt+duration+1)===null,{duration:duration,seen:a.npc.seen});
  G.grid.fill(0);G.npcSelectTarget(a,500);var reacquired=G.npcPursuitGoal(a,G.gameTimeNow());
  check('reacquisition refreshes last seen pose from current visible target',!!reacquired&&reacquired.x===300&&reacquired.y===150&&!reacquired.remembered,reacquired);
  G.health=0;
  check('dead remembered recipient cannot remain a pursuit goal',G.npcPursuitGoal(a,G.gameTimeNow())===null);

  reset();G.cell=4;G.gridW=G.gridH=160;G.grid=new Uint8Array(160*160);G.pos.x=118;G.pos.y=150;a=actor(106,150);G.npcSelectTarget(a,500);
  rectWall(28,30,29,45);G.pos.x=300;G.npcSelectTarget(a,500);
  check('close remembered point behind a thin wall is not falsely considered searched',!!G.npcPursuitGoal(a,G.gameTimeNow()),{seen:a.npc.seen,pose:pose(a)});
  G.grid.fill(0);
  check('reaching the same visible last seen point ends the search',G.npcPursuitGoal(a,G.gameTimeNow())===null);

  reset();G.pos.x=120;G.pos.y=150;G.pos.floorZ=85;a=actor(110,150);a.feetZ=a.z=25;G.npcSelectTarget(a,500);
  rectWall(9,4,10,11);G.pos.x=300;G.npcSelectTarget(a,500);a.feetZ=a.z=0;
  check('nearby remembered point on a different floor does not end lower floor search',!!G.npcPursuitGoal(a,G.gameTimeNow()),{seen:a.npc.seen,pose:pose(a)});

  reset();G.pos.x=550;G.pos.y=550;a=actor(110,150);var ally={x:230,y:150,feetZ:0,health:100};G.fortressAllies=[ally];G.npcSelectTarget(a,500);
  rectWall(9,4,10,11);ally.x=300;G.npcSelectTarget(a,500);var hadAllyMemory=!!G.npcPursuitGoal(a,G.gameTimeNow());G.fortressAllies=[];
  check('despawned living recipient is forgotten without steering toward stale object',hadAllyMemory&&G.npcPursuitGoal(a,G.gameTimeNow())===null,{health:ally.health,seen:a.npc.seen});

  reset();mesh();G.windowOriginX=1000;G.windowOriginY=2000;G.pos.x=230;G.pos.y=150;a=actor(110,150);G.npcSelectTarget(a,500);
  rectWall(9,4,10,11);G.pos.x=300;G.npcSelectTarget(a,500);
  G.windowOriginX+=40;G.windowOriginY+=20;a.x-=40;a.y-=20;G.pos.x-=40;G.pos.y-=20;
  var shifted=G.npcPursuitGoal(a,G.gameTimeNow());
  check('last seen world waypoint survives a loaded window origin shift',!!shifted&&shifted.x===190&&shifted.y===130&&shifted.feetZ===0&&shifted.remembered,shifted);
  G.npcForgetTarget(a);
  check('explicit forgetting clears memory and prevents stale pursuit after teleport',G.npcPursuitGoal(a,G.gameTimeNow())===null&&a.npc.target===null&&a.npc.seen===null);

  check('navigation scenarios finish without swallowed host or render errors',G.__navErrors.length===0&&G._loopErrCount===0,{host:G.__navErrors,loop:G._loopErrCount});
  Date.now=oldDate;Math.random=oldRandom;
  out('NPC_NAVIGATION_RESULT '+(failed?'FAIL '+failed+'/':'PASS ')+checked);
}());
