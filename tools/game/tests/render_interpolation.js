// Presentation-only interpolation: authored analytic poses, the actual Canvas
// draw entry, and real input/physics/combat replays at differing RAF cadences.
// Canvas arguments are observations, not claims about rasterized browser pixels.
(function () {
  var G=(0,eval)('this'),output=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
  var checked=0,failed=0,wallNow=100000,oldDate=Date.now,oldRandom=Math.random;
  Date.now=function(){return wallNow;};
  function mutate(source,flag,before,after) {
    if(__argv.indexOf(flag)<0)return source;
    if(source.split(before).length!==2)throw Error('MUTATION_ANCHOR '+flag);
    return source.replace(before,after);
  }
  G.__interpolationSource=function(path,source){
    if(path==='src/02-render-interpolation.js'){
      source=mutate(source,'--no-blend','var blend=record.serial === _renderPoseSerial ? alpha : 1;','var blend=1;');
      source=mutate(source,'--long-angle','return previous + delta * alpha;','return previous + (current-previous) * alpha;');
      source=mutate(source,'--restore-reference-leak','pos=savedPos; cam=savedCam; viewCam=savedViewCam;','cam=savedCam; viewCam=savedViewCam;');
      source=mutate(source,'--draw-mutates-original','record = {previous:[], view:Object.create(body), serial:-1};','record = {previous:[], view:body, serial:-1};');
      source=mutate(source,'--teleport-streak','dx*dx+dy*dy>64*64','dx*dx+dy*dy>1e30');
      source=mutate(source,'--origin-streak','_renderHistory.originX === windowOriginX && _renderHistory.originY === windowOriginY &&','true &&');
      source=mutate(source,'--despawn-ghost','visible.length=source.length;','// Mutation: retain the departed tail of the draw list.');
      source=mutate(source,'--allocate-every-frame','var record = _renderPoseRecords.get(body);','var record = null;');
    }
    if(path==='src/21-frame-loop.js'){
      source=mutate(source,'--bypass-interpolated-loop','renderInterpolatedFrame(_physicsAccum / FIXED_DT_MS);','renderFrame();');
      source=mutate(source,'--reset-keeps-history','  resetRenderInterpolation();','  // Mutation: keep old history through frame reset.');
    }
    return source;
  };
  var host=slurp('tools/game/tests/cave_occlusion_integration.js');
  var end=host.indexOf('  function check(name, okay) {');
  if(end<0)throw Error('SETUP interpolation browser host boundary missing');
  host=host.slice(0,end);
  var load="manifest.parts.MAIN.forEach(function (path) { (0, eval)(slurp('assets/games/' + path)); });";
  if(host.split(load).length!==2)throw Error('SETUP interpolation manifest boundary missing');
  host=host.replace(load,"manifest.parts.MAIN.forEach(function(path){(0,eval)(G.__interpolationSource(path,slurp('assets/games/'+path)));});");
  (0,eval)(host+'G.__interpolationErrors=errors; }());');
  function check(name,okay,detail){checked++;if(!okay)failed++;output((okay?'PASS ':'FAIL ')+name+(okay?'':' '+JSON.stringify(detail)));}
  function near(a,b){return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-7;}
  function yawNear(a,b){return near(Math.sin(a),Math.sin(b))&&near(Math.cos(a),Math.cos(b));}
  function rounded(value){
    if(typeof value==='number')return Math.round(value*1e6)/1e6;
    if(Array.isArray(value))return value.map(rounded);
    if(value&&typeof value==='object'){var o={};Object.keys(value).sort().forEach(function(k){o[k]=rounded(value[k]);});return o;}
    return value;
  }
  function equal(a,b){return JSON.stringify(rounded(a))===JSON.stringify(rounded(b));}
  function enemy(x,y){return {x:x,y:y,z:0,feetZ:0,enemyType:G.enemyTypes.normal,health:100,maxHealth:100,speed:0,chaseRange:0,
    lastUpdate:0,vx:0,vy:0,attackState:'idle',patrolWaypoints:[],patrolIdx:0};}
  function reset(mode){
    var rng=21731;Math.random=function(){rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
    G.running=true;G.gameOverState=G.menuOpen=G.settingsOpen=G.shopOpen=G.inventoryOpen=G.forgeOpen=G.overviewActive=false;
    G.document.hidden=false;G.document.pointerLockElement=null;G.CAVE_TEST_MODE=G.ENDLESS_MODE=false;G.terrain='ground';
    G.MODE3D=!!mode;G.CAM_FOLLOW=true;G.calibrating=false;G.USE_KEYBOARD=G.USE_MOUSE=true;G.USE_GAMEPAD=false;
    G.CONTROL_MODE=G.MODE_STICK_AIM;G.hasYaw=G.hasBaseline=G.capturingYaw=false;
    G.yawTarget=G.pitchTarget=G.yawOffset=G.autoPitchOff=0;G._imuSampleValid=false;
    G.gpLast={valid:false,buttons:-1,x:0,y:0};G.lastSelectDown=G.lastStartMenuDown=G.lastADown=G.lastXDown=false;
    G.lastSelectToggleMs=G.lastStartMenuToggleMs=wallNow;
    G.cell=20;G.gridW=G.gridH=128;G.grid=new Uint8Array(128*128);G.worldW=G.worldH=2560;
    G.floorMesh=G.gridCave=G.wallHeights=G.wallFaceBase=G.wallMaxTopZ=null;G.deepCaveRegions=[];G.deepCaveEntrances=[];
    G.windowOriginX=G.windowOriginY=0;G.pos={x:1000,y:1000,floorZ:60};G.vel={x:0,y:0};
    G.cam={x:1000,y:1000,z:60,ang:0,pitch:0,fov:G.GAME_CONFIG.player.baseFov};G.viewCam={x:820,y:880};
    G.playerUnderground=false;G.equipment={};G.speed=G.GAME_CONFIG.player.baseSpeed;
    G.damping=G.GAME_CONFIG.terrainPhysics.ground.damping;G.bounce=G.GAME_CONFIG.terrainPhysics.ground.bounce;
    G.jumpAirborne=false;G.jumpVelZ=G.dashFovPunch=G.dashUntil=G.dashCooldownUntil=0;
    G.health=G.HEALTH_MAX=100;G.mana=G.MANA_MAX=1000;G.MANA_REGEN_PER_S=G.HEALTH_REGEN_PER_S=0;
    G.stats={totalDamageDone:0,totalDamageTaken:0,totalManaConsumed:0,totalEnemiesKilled:0};
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
    G._loopErrCount=0;G._ptErrors={};G.__interpolationErrors.length=0;
    G.startGameClock();G.startMs=G.gameTimeNow();G.lastShotMs=G.gameTimeNow()-1000;
    G.renderInterpolationEnabled=true;G.resetRenderInterpolation();
  }
  function pose(){return {pos:{x:G.pos.x,y:G.pos.y,z:G.pos.floorZ},cam:{x:G.cam.x,y:G.cam.y,z:G.cam.z,ang:G.cam.ang,pitch:G.cam.pitch,fov:G.cam.fov},
    view:{x:G.viewCam.x,y:G.viewCam.y},enemy:G.enemies.map(function(e){return {x:e.x,y:e.y,z:e.z,feet:e.feetZ,facing:e.facing};}),
    shot:G.projectiles.map(function(p){return {x:p.x,y:p.y,z:p.z,ang:p.ang};})};}
  function authoredPair(){
    reset(true);G.CAM_FOLLOW=false;G.cam.z=80;G.cam.ang=Math.PI-.1;G.cam.pitch=-.2;G.cam.fov=1;
    G.enemies=[enemy(1100,1000)];G.enemies[0].facing=Math.PI-.1;
    G.projectiles=[{x:1120,y:1000,z:30,ang:Math.PI-.1,r:4,spawnMs:G.gameTimeNow(),lifeMs:2000,spell:G.spells.missile}];
    G.captureRenderInterpolation();
    G.pos.x=1008;G.pos.y=1004;G.pos.floorZ=92;G.cam.x=1008;G.cam.y=1004;G.cam.z=96;
    G.cam.ang=-Math.PI+.1;G.cam.pitch=.2;G.cam.fov=1.2;G.viewCam.x=828;G.viewCam.y=884;
    G.enemies[0].x=1108;G.enemies[0].y=1004;G.enemies[0].z=G.enemies[0].feetZ=8;G.enemies[0].facing=-Math.PI+.1;
    G.projectiles[0].x=1128;G.projectiles[0].y=1004;G.projectiles[0].z=38;G.projectiles[0].ang=-Math.PI+.1;
    G.finishRenderInterpolation();
  }
  function visual(alpha,callback){var p;G.renderInterpolatedFrame(alpha,function(){p=pose();if(callback)callback();});return p;}
  authoredPair();var real=pose(),quarter=visual(.25),half=visual(.5);
  check('authored fixture has distinct finite player camera enemy and missile endpoints',real.pos.x===1008&&real.cam.z===96&&real.enemy.length===1&&real.shot.length===1);
  check('quarter tick blends player and both camera translations analytically',near(quarter.pos.x,1002)&&near(quarter.pos.y,1001)&&near(quarter.pos.z,68)&&
    near(quarter.cam.x,1002)&&near(quarter.cam.y,1001)&&near(quarter.cam.z,84)&&near(quarter.view.x,822)&&near(quarter.view.y,881),quarter);
  check('half tick moves living target and in-flight missile between their own endpoints',near(half.enemy[0].x,1104)&&near(half.enemy[0].y,1002)&&near(half.enemy[0].feet,4)&&near(half.enemy[0].z,4)&&
    near(half.shot[0].x,1124)&&near(half.shot[0].y,1002)&&near(half.shot[0].z,34),half);
  check('camera enemy and missile angles cross the pi seam by the shortest arc',yawNear(quarter.cam.ang,Math.PI-.05)&&yawNear(half.cam.ang,Math.PI)&&yawNear(half.enemy[0].facing,Math.PI)&&yawNear(half.shot[0].ang,Math.PI),half);
  check('pitch and field of view use ordinary linear interpolation',near(quarter.cam.pitch,-.1)&&near(quarter.cam.fov,1.05)&&near(half.cam.pitch,0)&&near(half.cam.fov,1.1),quarter);
  check('interpolated reads leave exact authoritative endpoint poses untouched',equal(real,pose()));
  var lower=visual(-1),upper=visual(2),invalid=visual(NaN);
  check('invalid or out-of-range frame fractions never extrapolate beyond the tick',near(lower.pos.x,1000)&&near(upper.pos.x,1008)&&near(invalid.pos.x,1008));
  G.renderInterpolationEnabled=false;var disabled=visual(.25);
  check('disabled interpolation is a genuine current-pose negative control',equal(disabled,real)&&!near(disabled.pos.x,quarter.pos.x),{disabled:disabled,blended:quarter});
  G.renderInterpolationEnabled=true;

  // A renderer can accidentally assign to a coordinate or throw halfway through
  // its work. Neither must leak a presentation proxy into subsequent physics.
  var posRef=G.pos,camRef=G.cam,viewRef=G.viewCam,enemiesRef=G.enemies,enemyRef=G.enemies[0],shotsRef=G.projectiles,shotRef=G.projectiles[0];
  var ownKeys={pos:Object.keys(posRef).sort(),cam:Object.keys(camRef).sort(),enemy:Object.keys(enemyRef).sort(),shot:Object.keys(shotRef).sort()};
  var isolated=false,caught=false;
  try{G.renderInterpolatedFrame(.5,function(){
    isolated=near(G.pos.x,1004)&&posRef.x===1008&&enemyRef.x===1108&&shotRef.x===1128;
    G.pos.x=-99;G.cam.ang=0;G.enemies[0].x=-99;G.projectiles[0].x=-99;
    throw Error('intentional paint interruption');
  });}catch(e){caught=e.message==='intentional paint interruption';}
  check('draw transaction exposes intermediate values without writing original bodies',isolated);
  check('throwing render restores every authoritative global and body reference',caught&&G.pos===posRef&&G.cam===camRef&&G.viewCam===viewRef&&G.enemies===enemiesRef&&G.enemies[0]===enemyRef&&G.projectiles===shotsRef&&G.projectiles[0]===shotRef);
  check('throwing renderer cannot corrupt gameplay coordinates or add snapshot fields',equal(real,pose())&&equal(ownKeys,{pos:Object.keys(posRef).sort(),cam:Object.keys(camRef).sort(),enemy:Object.keys(enemyRef).sort(),shot:Object.keys(shotRef).sort()}),pose());

  authoredPair();var firstViews=null,lastViews=null;
  visual(.5,function(){firstViews={pos:G.pos,cam:G.cam,enemies:G.enemies,enemy:G.enemies[0],shots:G.projectiles,shot:G.projectiles[0]};});
  var recordCount=G.renderInterpolationStats.recordsCreated;
  var queryCalls=0,queryFunctions={};
  ['spatialRaycast','spatialQuerySupport','spatialMoveBody','gameUpdate','updateProjectiles'].forEach(function(name){
    queryFunctions[name]=G[name];G[name]=function(){queryCalls++;return queryFunctions[name].apply(G,arguments);};
  });
  for(var n=0;n<240;n++)visual((n%4)/4,function(){lastViews={pos:G.pos,cam:G.cam,enemies:G.enemies,enemy:G.enemies[0],shots:G.projectiles,shot:G.projectiles[0]};});
  Object.keys(queryFunctions).forEach(function(name){G[name]=queryFunctions[name];});
  check('unchanged live actors reuse pose records proxies and scratch arrays over 240 frames',G.renderInterpolationStats.recordsCreated===recordCount&&
    firstViews.pos===lastViews.pos&&firstViews.cam===lastViews.cam&&firstViews.enemies===lastViews.enemies&&firstViews.enemy===lastViews.enemy&&
    firstViews.shots===lastViews.shots&&firstViews.shot===lastViews.shot,{before:recordCount,after:G.renderInterpolationStats.recordsCreated});
  check('presentation adapter adds no simulation collision support or projectile queries',queryCalls===0,{calls:queryCalls});

  // Exercise actual renderers rather than only a synthetic callback. Record
  // their inputs; no mocked collision, world generator or draw body is used.
  authoredPair();G.cam.ang=0;G.resetRenderInterpolation();G.captureRenderInterpolation();G.pos.x+=8;G.cam.x+=8;G.finishRenderInterpolation();
  var prior=pose(),drawError=null;
  try{for(var i=0;i<8;i++)G.renderInterpolatedFrame((i+1)/10);}catch(e){drawError=String(e);}
  check('repeated actual first-person frames preserve authoritative simulation poses',drawError===null&&G.__interpolationErrors.length===0&&equal(prior,pose()),{error:drawError,swallowed:G.__interpolationErrors,before:prior,after:pose()});

  // Identity matters: spawns/replacements must not borrow a departed slot's
  // history, and array reordering must not swap two moving entities' histories.
  authoredPair();var old=G.enemies[0],born=enemy(1200,1010);G.enemies.push(born);
  var birth=visual(.5);check('newly spawned enemy appears at its current position without a ghost path',birth.enemy.length===2&&near(birth.enemy[0].x,1104)&&near(birth.enemy[1].x,1200),birth);
  G.enemies=[born,old];var reordered=visual(.5);
  check('reordering a live actor list preserves per-identity interpolation history',near(reordered.enemy[0].x,1200)&&near(reordered.enemy[1].x,1104),reordered);
  G.enemies=[born];var removed=visual(.5);
  check('despawn removes the departed enemy instead of drawing a cached ghost',removed.enemy.length===1&&near(removed.enemy[0].x,1200),removed);
  G.enemies=[enemy(1300,1020)];var replacement=visual(.5);
  check('replacement actor at the same array slot cannot inherit the prior actor pose',replacement.enemy.length===1&&near(replacement.enemy[0].x,1300),replacement);

  authoredPair();G.enemies[0].x+=200;var teleported=visual(.5);
  check('large actor relocation snaps while ordinarily moving player still interpolates',near(teleported.enemy[0].x,1308)&&near(teleported.pos.x,1004),teleported);
  authoredPair();G.resetRenderInterpolation(G.enemies[0]);var marked=visual(.5);
  check('explicit short teleport invalidates only that body interpolation history',near(marked.enemy[0].x,1108)&&near(marked.pos.x,1004),marked);

  authoredPair();G.windowOriginX+=256;G.pos.x-=256;G.cam.x-=256;G.enemies[0].x-=256;G.projectiles[0].x-=256;
  var shifted=pose(),shiftVisual=visual(.5);
  check('chunk-origin translation snaps every pose without a cross-window streak',equal(shifted,shiftVisual),{expected:shifted,actual:shiftVisual});
  authoredPair();G.windowOriginX+=256;var changedOrigin=pose();
  check('origin-only world rebuild cannot reuse old local-coordinate movement history',equal(changedOrigin,visual(.5)));
  authoredPair();G.grid=new Uint8Array(G.grid.length);var rebuilt=pose();
  check('rebuilt geometry invalidates otherwise plausible old pose history',equal(rebuilt,visual(.5)));
  authoredPair();G.pos.x+=1;var edited=pose();
  check('out-of-band player reposition is not blended through its previous view',equal(edited,visual(.5)));
  authoredPair();G.resetSimulationFrame();var resetPose=pose();
  check('frame reset discards previous poses before rendering resumed or restarted world',equal(resetPose,visual(.5)));
  authoredPair();G.pauseGame('interpolation regression');var pausePose=pose();
  check('pause immediately snaps to frozen current state instead of rewinding half a tick',equal(pausePose,visual(.5))&&G.menuOpen);

  // Whole-loop integration records the actual red player arc submitted to the
  // Canvas host. An odd 120 Hz frame has no simulation step but must show the
  // midpoint of the two known ticks, not a duplicate or speculative position.
  reset(false);var arcs=[],oldArc=G.ctx.arc;
  G.ctx.arc=function(x,y,r){if(r===6&&this.fillStyle==='#ff0000')arcs.push({x:x,y:y});return oldArc.apply(this,arguments);};
  function frame(ts){wallNow=100000+ts;arcs=[];G.loop(ts,G._loopGen);return arcs.length?arcs[0]:null;}
  G.kbState.up=true;frame(0);var first=frame(1000/60),tickX=G.pos.x,tickY=G.pos.y,tick=G.spatialSimulationTick;
  var middle=frame(1000/60+1000/120);
  check('120 Hz real-loop fixture moves and submits a player draw on consecutive frames',tick===1&&Math.hypot(tickX-1000,tickY-1000)>0&&first!==null&&middle!==null,{first:first,middle:middle,end:[tickX,tickY]});
  check('120 Hz no-tick frame submits an actual halfway player pose to Canvas',G.spatialSimulationTick===tick&&middle!==null&&near(middle.x,(1000+tickX)/2)&&near(middle.y,(1000+tickY)/2)&&Math.hypot(middle.x-first.x,middle.y-first.y)>0,{first:first,middle:middle,end:[tickX,tickY],tick:G.spatialSimulationTick});
  check('extra interpolated frame does not move or steer the real player',near(G.pos.x,tickX)&&near(G.pos.y,tickY)&&G.spatialSimulationTick===tick);
  G.ctx.arc=oldArc;

  // Compare genuine input, jump, cast reservations, swept projectiles and damage
  // across cadence and toggle. A stationary enemy is a real nonempty recipient;
  // movement begins after the opening shots so the damage control is guaranteed.
  var realTick=G.runSimulationTick,replayTicks=0,baseClock=0;
  G.runSimulationTick=function(dt){
    G._attackHeld=replayTicks<100;G.kbState.up=replayTicks>=60;G._arrowCam.right=replayTicks>=80&&replayTicks<110;
    var result=realTick(dt);replayTicks++;return result;
  };
  function finalState(){return {ticks:replayTicks,pos:{x:G.pos.x,y:G.pos.y,z:G.pos.floorZ},vel:{x:G.vel.x,y:G.vel.y},
    angle:G.cam.ang,pitch:G.cam.pitch,mana:G.mana,health:G.health,stats:G.stats,reservations:G.spellCastReservationSerial,
    clock:G.gameTimeNow()-baseClock,enemy:G.enemies.map(function(e){return {x:e.x,y:e.y,health:e.health};}),
    projectiles:G.projectiles.map(function(p){return {x:p.x,y:p.y,z:p.z,spawn:p.spawnMs-baseClock};})};}
  [false,true].forEach(function(mode){
    var reference=null;
    [false,true].forEach(function(enabled){
      [30,60,120].forEach(function(hz){
        reset(mode);G.renderInterpolationEnabled=enabled;replayTicks=0;baseClock=G.gameTimeNow();
        G.enemies=[enemy(1120,1002)];
        frame(0);for(var f=1;f<=hz*2;f++)frame(f*1000/hz);
        var actual=finalState(),label=(mode?'3D ':'2D ')+(enabled?'blended ':'current ')+hz+'Hz';
        check(label+' replay reaches real movement aiming cast release and enemy damage',actual.ticks===120&&Math.hypot(actual.pos.x-1000,actual.pos.y-1000)>20&&actual.angle>.5&&actual.reservations>=2&&actual.stats.totalDamageDone>0&&actual.stats.totalManaConsumed>=20,actual);
        check(label+' complete real draws have no swallowed production errors',G._loopErrCount===0&&G.__interpolationErrors.length===0&&Object.keys(G._ptErrors).length===0,{loop:G._loopErrCount,errors:G.__interpolationErrors,stages:G._ptErrors});
        if(reference)check(label+' interpolation preserves exact authoritative gameplay replay',equal(actual,reference),{expected:reference,actual:actual});else reference=actual;
      });
    });
  });
  G.runSimulationTick=realTick;
  reset(true);G.CAVE_TEST_MODE=true;G._caveTestSeedOverride=12345;G._caveTestKindOverride='descending';
  Object.keys(G.caveTestFlags).forEach(function(k){G.caveTestFlags[k]=false;});G.caveTestFlags.caveEnemies=true;
  G.resetEndlessMode();G.previewCaveView('back');G.kbState.up=true;
  for(var ct=0;ct<30;ct++)G.runSimulationTick(1/60);
  var caveBefore=pose();G.runSimulationTick(1/60);var caveAfter=pose(),caveVisual=null,caveDrawError=null;
  check('seeded cave fixture contains real support walls and enemies and player travel',!!G.floorMesh&&G.deepCaveEntrances.length>0&&G.enemies.length>0&&G.grid.some(function(v){return v!==0;})&&
    Math.hypot(caveAfter.pos.x-caveBefore.pos.x,caveAfter.pos.y-caveBefore.pos.y)>0,{seed:G.WORLD_SEED,enemyCount:G.enemies.length,before:caveBefore.pos,after:caveAfter.pos});
  try{G.renderInterpolatedFrame(.5,function(){caveVisual=pose();G.renderFrame();});}catch(e){caveDrawError=String(e);}
  check('generated cave draw receives player and follow camera midway between real supported ticks',caveVisual!==null&&
    near(caveVisual.pos.x,(caveBefore.pos.x+caveAfter.pos.x)/2)&&near(caveVisual.pos.y,(caveBefore.pos.y+caveAfter.pos.y)/2)&&
    near(caveVisual.pos.z,(caveBefore.pos.z+caveAfter.pos.z)/2)&&near(caveVisual.cam.x,caveVisual.pos.x)&&near(caveVisual.cam.y,caveVisual.pos.y)&&near(caveVisual.cam.z,caveVisual.pos.z),
    {before:caveBefore.pos,after:caveAfter.pos,visual:caveVisual});
  check('full generated cave frame restores gameplay without thrown or swallowed errors',caveDrawError===null&&G.__interpolationErrors.length===0&&equal(caveAfter,pose()),
    {error:caveDrawError,swallowed:G.__interpolationErrors});
  Date.now=oldDate;Math.random=oldRandom;
  output('RENDER_INTERPOLATION_RESULT '+(failed?'FAIL '+failed+'/':'PASS ')+checked);
}());
