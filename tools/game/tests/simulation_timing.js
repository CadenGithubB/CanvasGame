// Replay the real loop, input, movement, and combat over authored geometry.
// Wall time and display callbacks vary; the same tick-indexed input is replayed.
// Browser/transport APIs come from the shipping host. Canvas rendering is not
// measured here, and no gameplay/collision/update routine is replaced by a fake.
(function () {
  var G=(0,eval)('this'), output=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
  var checked=0, failures=0, wallNow=100000, wallEpoch=100000, ticks=0, inputs=0, frames=0, releases=[], trace=[], epoch=0;
  var replayInput=function(){}, originalDate=Date.now, originalRandom=Math.random;
  var host=slurp('tools/game/tests/cave_occlusion_integration.js');
  var end=host.indexOf('  function check(name, okay) {');
  if(end<0) throw Error('SETUP shipping browser host boundary missing');
  var bootstrap=host.slice(0,end);
  var load="manifest.parts.MAIN.forEach(function (path) { (0, eval)(slurp('assets/games/' + path)); });";
  if(bootstrap.split(load).length!==2) throw Error('SETUP shipping manifest loader boundary missing');
  bootstrap=bootstrap.replace(load,"manifest.parts.MAIN.forEach(function (path) { (0, eval)(G.__timingSource(path,slurp('assets/games/' + path))); });");
  function mutation(source,flag,before,after) {
    if(__argv.indexOf(flag)<0) return source;
    if(source.split(before).length!==2) throw Error('MUTATION_ANCHOR '+flag);
    return source.replace(before,after);
  }
  G.__timingSource=function(path,source) {
    if(path==='src/02-simulation-clock.js')source=mutation(source,'--render-rate-input',
      'updateInputCamera(dt); handleInput(dt);','updateInputCamera(dt);');
    if(path==='src/21-frame-loop.js') {
      source=mutation(source,'--render-rate-input',
        'pollInputControls();',"pollInputControls(); _pt('handleInput',function(){handleInput(FIXED_DT);});");
      source=mutation(source,'--unbounded-catchup','steps < MAX_PHYSICS_STEPS','steps < 1000');
      source=mutation(source,'--resume-wall-gap','if (paused || _simulationWasPaused === true)', 'if (paused)');
    }
    if(path==='src/10-combat.js')source=mutation(source,'--wall-clock-cast',
      'function castCurrentSpell() {\n  if (!running || gameOverState || menuOpen) return;\n  var now = gameTimeNow();',
      'function castCurrentSpell() {\n  if (!running || gameOverState || menuOpen) return;\n  var now = Date.now();');
    if(path==='src/11-enemies.js')source=mutation(source,'--wall-clock-enemy',
      'function updateEnemies(dt) {\n  if (!enemies || !enemies.length) return;\n  var now = gameTimeNow();',
      'function updateEnemies(dt) {\n  if (!enemies || !enemies.length) return;\n  var now = Date.now();');
    if(path==='src/22-lifecycle.js')source=mutation(source,'--settings-keeps-frame-anchor',
      'function setGameSettingsOpen(open) {\n  settingsOpen = !!open;\n  clearGameplayInput();\n  resetSimulationFrame();',
      'function setGameSettingsOpen(open) {\n  settingsOpen = !!open;\n  clearGameplayInput();');
    if(path==='src/16-draw-overview.js')source=mutation(source,'--overview-keeps-frame-anchor',
      'function toggleOverview() {\n  clearGameplayInput();\n  resetSimulationFrame();',
      'function toggleOverview() {\n  clearGameplayInput();');
    return source;
  };
  Date.now=function(){return wallNow;};
  (0,eval)(bootstrap+'G.__timingErrors=errors; }());');
  var realInput=G.handleInput, realUpdate=G.gameUpdate, realSpawn=G.spawnProjectile, realTick=G.runSimulationTick;
  G.runSimulationTick=function(dt){replayInput(ticks);return realTick(dt);};
  G.handleInput=function(dt){inputs++;return realInput(dt);};
  G.gameUpdate=function(dt){
    var result=realUpdate(dt);ticks++;
    if(ticks%30===0) trace.push({tick:ticks,x:G.pos.x,y:G.pos.y,angle:G.cam.ang,mana:G.mana,shots:releases.length});
    return result;
  };
  G.spawnProjectile=function(){var result=realSpawn.apply(G,arguments);releases.push({tick:ticks,at:G.projectiles[G.projectiles.length-1].spawnMs-epoch});return result;};
  G.renderFrame=function(){frames++;};
  function check(name,okay,detail) {
    checked++;if(!okay)failures++;
    output((okay?'PASS ':'FAIL ')+name+(okay?'':' '+JSON.stringify(detail)));
  }
  function near(a,b) {return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-6;}
  function reset(mode) {
    wallNow=100000;ticks=inputs=frames=0;releases=[];trace=[];replayInput=function(){};
    var rng=21731;Math.random=function(){rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
    G.running=true;G.gameOverState=false;G.menuOpen=G.shopOpen=G.inventoryOpen=G.forgeOpen=G.settingsOpen=false;
    G.overviewActive=false;G.CAVE_TEST_MODE=G.ENDLESS_MODE=false;G.terrain='ground';G.MODE3D=mode;
    G.document.hidden=false;G.document.pointerLockElement=null;
    G.floorMesh=G.gridCave=G.wallHeights=G.wallFaceBase=G.wallMaxTopZ=null;
    G.cell=20;G.gridW=G.gridH=128;G.grid=new Uint8Array(G.gridW*G.gridH);G.worldW=G.worldH=2560;
    G.windowOriginX=G.windowOriginY=0;G.deepCaveRegions=[];G.deepCaveEntrances=[];
    G.pos={x:1000,y:1000,floorZ:60};G.vel={x:0,y:0};G.cam={x:1000,y:1000,z:80,ang:0,pitch:0,fov:G.GAME_CONFIG.player.baseFov};
    G.playerUnderground=false;G.autoPitchOff=0;G.speed=G.GAME_CONFIG.player.baseSpeed;
    G.damping=G.GAME_CONFIG.terrainPhysics.ground.damping;G.bounce=G.GAME_CONFIG.terrainPhysics.ground.bounce;
    G.equipment={};G.health=G.HEALTH_MAX=100;G.mana=G.MANA_MAX=1000;G.MANA_REGEN_PER_S=G.HEALTH_REGEN_PER_S=0;
    G.kbState={up:false,down:false,left:false,right:false};G._arrowCam={up:false,down:false,left:false,right:false};
    G.mouseDelta={x:0,y:0};G.mouseAccum={x:0,y:0};G._mouseHeld=G._attackHeld=false;
    G.USE_KEYBOARD=true;G.USE_MOUSE=true;G.USE_GAMEPAD=false;G.calibrating=false;G.hasYaw=false;
    G.gpLast={valid:false,buttons:65535,x:0,y:0};G.CONTROL_MODE=G.MODE_STICK_AIM;
    G.lastSelectDown=G.lastStartMenuDown=G.lastADown=G.lastXDown=false;
    G.lastSelectToggleMs=G.lastStartMenuToggleMs=0;
    G.jumpPressed=G.dashPressed=G.jumpAirborne=false;G.jumpVelZ=G.dashFovPunch=0;G.dashUntil=G.dashCooldownUntil=0;
    G.NOCLIP=false;G.DEBUG_PERF=G.DEBUG_CAVE=G.DEBUG_COMBAT=G.DEBUG_EFFECTS=false;G.collisions=0;
    ['walls','enemies','enemySpawners','projectiles','impacts','groundEffects','chainEffects','coneEffects','novaEffects',
      'deathEffects','coinDrops','soulOrbs','arcaneTomes','statPickups','companions','fortressAllies',
      'treasureChests','oreVeins','marketStalls','ambientParticles','structures','shrines'].forEach(function(k){G[k]=[];});
    G.shopMarker=G.shopNearby=G.nearestOpenChest=G.nearestShrine=G.arenaChallenge=G.goal=null;G.goalSpawned=true;
    G.exploredCells=null;G.viewDist=900;G.dayTime=.5;G.daySpeed=0;G.settings.dayNight=false;
    G.currentSpellIdx=0;G.spells.missile.unlocked=true;G.spells.missile.tier=1;
    G.lastShotMs=G.castAnimUntil=G.spellCastReservationSerial=0;G.pendingMissileCasts=[];G.projectileConsumedMotionTick=-1;
    G.flameStreamActive=false;G.flameStreamLastTick=0;G.dmgBoostUntil=G.speedBoostUntil=G.armorBoostUntil=G.regenBoostUntil=0;
    G.stats={totalDamageDone:0,totalDamageTaken:0,totalManaConsumed:0,totalEnemiesKilled:0};
    G.spatialSimulationTick=0;G.resetSimulationFrame();G._loopGen++;
    G._loopErrCount=0;G._ptErrors={};G.__timingErrors.length=0;
    G.startGameClock();epoch=G.gameTimeNow();wallEpoch=epoch;G.startMs=epoch;
    G.lastShotMs=epoch-1000;G.lastSelectToggleMs=G.lastStartMenuToggleMs=epoch;
  }
  function frame(ts) {wallNow=wallEpoch+ts;G.loop(ts,G._loopGen);}
  function drive(duration,schedule,offset) {
    var t=0,i=0,base=offset||0;
    frame(base);
    while(t<duration-1e-8){t=Math.min(duration,t+schedule[i++%schedule.length]);frame(base+t);}
  }
  function snapshot() {
    return {ticks:ticks,inputs:inputs,x:G.pos.x,y:G.pos.y,z:G.pos.floorZ,vx:G.vel.x,vy:G.vel.y,angle:G.cam.ang,pitch:G.cam.pitch,
      mana:G.mana,spent:G.stats.totalManaConsumed,damage:G.stats.totalDamageDone,reservations:G.spellCastReservationSerial,
      releases:releases.slice(),pending:G.pendingMissileCasts.length,
      projectiles:G.projectiles.map(function(p){return{x:p.x,y:p.y,z:p.z,spawnMs:p.spawnMs-epoch};}),
      enemies:G.enemies.map(function(e){return{x:e.x,y:e.y,z:e.z,health:e.health};}),trace:trace.slice()};
  }
  function compact(s){var c=Object.assign({},s);delete c.trace;return c;}
  function same(a,b) {
    function normalize(value){
      if(typeof value==='number')return Math.round(value*1e6)/1e6;
      if(Array.isArray(value))return value.map(normalize);
      if(value&&typeof value==='object'){var obj={};Object.keys(value).sort().forEach(function(k){obj[k]=normalize(value[k]);});return obj;}
      return value;
    }
    return JSON.stringify(normalize(compact(a)))===JSON.stringify(normalize(compact(b)));
  }
  function assertHost(name) {check(name+' actual loop has no swallowed errors',!G._loopErrCount&&G.__timingErrors.length===0,{loop:G._loopErrCount,errors:G.__timingErrors,trace:trace});}
  var schedules={'60Hz':[1000/60],'30Hz':[1000/30],'120Hz':[1000/120],jitter:[5,28,9,21,11,26]};
  [false,true].forEach(function(mode){
    var prefix=mode?'3D ':'2D ',reference=null;
    Object.keys(schedules).forEach(function(label){
      reset(mode);
      replayInput=function(k){G.kbState.up=k<150;G.kbState.right=k>=60&&k<150;G._arrowCam.right=k>=30&&k<90;G._attackHeld=k<180;};
      drive(4000,schedules[label]);var state=snapshot();
      assertHost(prefix+label);
      check(prefix+label+' fixture moves turns and releases real held attacks',Math.hypot(state.x-1000,state.y-1000)>20&&state.angle>1&&state.releases.length>=4&&state.spent>=40,state);
      check(prefix+label+' applies input exactly once for each of 240 simulation ticks',state.ticks===240&&state.inputs===240,state);
      if(reference)check(prefix+label+' matches 60Hz gameplay replay',same(state,reference),{expected:reference,actual:state});
      else reference=state;
    });
  });
  // Damage must be caused by the real windup, swept missile and living target,
  // not just a call counter. The clear-lane control is deliberately not moving.
  var damageReference=null;
  Object.keys(schedules).forEach(function(label){
    reset(true);
    G.enemies=[{x:1120,y:1002,z:0,feetZ:0,enemyType:G.enemyTypes.normal,health:100,maxHealth:100,speed:0,chaseRange:0,
      lastUpdate:0,vx:0,vy:0,attackState:'idle',patrolWaypoints:[],patrolIdx:0}];
    replayInput=function(k){G._attackHeld=k<180;};
    drive(4000,schedules[label]);var state=snapshot();
    assertHost('target '+label);
    check(label+' real missiles damage clear-lane living target',state.damage>=4&&state.enemies.length===1&&state.enemies[0].health===100-state.damage&&state.releases.length>=4,state);
    if(damageReference)check(label+' combat damage and missile travel match 60Hz',same(state,damageReference),{expected:damageReference,actual:state});
    else damageReference=state;
  });

  reset(true);frame(0);replayInput=function(k){G._attackHeld=k===0;};frame(1000/60);
  check('pause fixture reaches reserved windup before projectile exists',G.pendingMissileCasts.length===1&&G.projectiles.length===0&&G.mana===990);
  var pauseClock=G.gameTimeNow();G.pauseGame('timing regression');replayInput=function(){};
  frame(20000);
  check('pause cancels and refunds pending windup without advancing game time',G.pendingMissileCasts.length===0&&G.mana===1000&&releases.length===0&&ticks===1&&near(G.gameTimeNow(),pauseClock));
  G.resumeGame();frame(20001);frame(20001+1000/60);
  check('resume cannot replay canceled windup or stale held attack',ticks===2&&releases.length===0&&G.pendingMissileCasts.length===0&&G.mana===1000&&!G._attackHeld&&!G._mouseHeld);
  assertHost('windup pause');

  // A pause can begin and end between two display callbacks (for example a
  // busy browser finishing a settings interaction). The loop cannot discover
  // that transition by reading only the final overlay flag on the next frame.
  ['settings','overview'].forEach(function(kind){
    reset(true);frame(0);replayInput=function(k){G._attackHeld=k===0;};frame(1000/60);
    check(kind+' between-frame pause fixture reserves an unfinished missile',G.pendingMissileCasts.length===1&&G.projectiles.length===0&&G.mana===990);
    var frozenTime=G.gameTimeNow(),frozenTicks=ticks;
    if(kind==='settings')G.setGameSettingsOpen(true);else G.toggleOverview();
    check(kind+' opening refunds pending missile immediately before any RAF',G.pendingMissileCasts.length===0&&G.mana===1000&&releases.length===0&&ticks===frozenTicks&&!G._attackHeld&&(kind==='settings'?G.settingsOpen:G.overviewActive));
    wallNow+=30000;
    if(kind==='settings')G.setGameSettingsOpen(false);else G.toggleOverview();
    replayInput=function(){};frame(30000);
    check(kind+' closed before next RAF still reanchors without simulation',ticks===frozenTicks&&near(G.gameTimeNow(),frozenTime)&&G.pendingMissileCasts.length===0&&releases.length===0&&!G.settingsOpen&&!G.overviewActive,snapshot());
    frame(30000+1000/60);
    check(kind+' following RAF advances one normal tick without stale attack',ticks===frozenTicks+1&&near(G.gameTimeNow()-frozenTime,1000/60)&&G.mana===1000&&releases.length===0,snapshot());
    assertHost(kind+' between-frame pause');
  });

  reset(true);replayInput=function(k){G._attackHeld=k===0;};drive(200,[1000/60]);
  check('active-shot pause fixture has a live released missile and cooldown',G.projectiles.length===1&&releases.length===1&&G.gameTimeNow()-G.lastShotMs<G.getEffectiveCooldown());
  var shot=G.projectiles[0],shotX=shot.x,shotAge=G.gameTimeNow()-shot.spawnMs,shotCount=releases.length,spent=G.stats.totalManaConsumed;
  pauseClock=G.gameTimeNow();var pausedTick=ticks;G.pauseGame('live projectile');replayInput=function(){};frame(30200);
  check('paused existing missile neither travels nor ages for thirty wall seconds',G.projectiles[0]===shot&&near(shot.x,shotX)&&near(G.gameTimeNow()-shot.spawnMs,shotAge)&&ticks===pausedTick);
  G.resumeGame();frame(30201);replayInput=function(){G._attackHeld=true;};frame(30201+1000/60);
  check('resume advances one tick without expiring projectile or bypassing attack cooldown',ticks===pausedTick+1&&G.projectiles[0]===shot&&shot.x>shotX&&shot.x-shotX<7&&releases.length===shotCount&&G.stats.totalManaConsumed===spent&&near(G.gameTimeNow()-pauseClock,1000/60),snapshot());
  assertHost('live-shot pause');

  reset(true);frame(0);replayInput=function(){G.kbState.up=true;G._attackHeld=true;};frame(1000/60);
  var hiddenTick=ticks,hiddenClock=G.gameTimeNow(),hiddenX=G.pos.x;G.document.hidden=true;frame(10000);
  check('hidden-tab callback cannot simulate held movement or release pending spell',ticks===hiddenTick&&near(G.gameTimeNow(),hiddenClock)&&near(G.pos.x,hiddenX)&&releases.length===0&&G.pendingMissileCasts.length===0,snapshot());
  replayInput=function(){};G.document.hidden=false;frame(40000);
  check('first visible frame reanchors without a hidden-time burst',ticks===hiddenTick&&near(G.gameTimeNow(),hiddenClock)&&releases.length===0,snapshot());
  assertHost('hidden return');

  reset(true);frame(0);replayInput=function(k){G._attackHeld=k===0;};frame(1000/60);
  var stallTick=ticks,stallClock=G.gameTimeNow(),oldDrop=G.simulationTiming.droppedMs;
  frame(1000+1000/60);
  var recovered=ticks-stallTick,dropped=G.simulationTiming.droppedMs-oldDrop;
  check('one-second stall has bounded catchup and explicit dropped-time accounting',recovered>=0&&recovered<=G.MAX_PHYSICS_STEPS&&near(G.gameTimeNow()-stallClock,recovered*1000/60)&&dropped>=900&&G.simulationTiming.maxStepsPerFrame<=G.MAX_PHYSICS_STEPS,{steps:recovered,dropped:dropped,timing:G.simulationTiming});
  check('stall cannot instantly release a windup using discarded wall time',G.projectiles.length===0&&releases.length===0&&G.pendingMissileCasts.length===1,snapshot());
  frame(1000+2000/60);
  check('normal frame after stall has no leftover catchup burst',ticks-stallTick===recovered+1,{ticks:ticks,before:stallTick,recovered:recovered});
  assertHost('stall recovery');

  // A real wall behind the player prevents separation from pulling the target
  // out of melee reach. This exercises an actual windup without mocking push,
  // movement or attack resolution. A second enemy has a real burn deadline.
  reset(true);G.pos.x=1006;
  for(var wy=45;wy<55;wy++)G.grid[wy*G.gridW+49]=1;
  var attacker={x:1019,y:1000,z:0,feetZ:0,enemyType:G.enemyTypes.normal,health:10,maxHealth:10,speed:0,chaseRange:0,
    lastUpdate:0,vx:0,vy:0,attackState:'idle',patrolWaypoints:[]};
  var burning={x:1200,y:1000,z:0,feetZ:0,enemyType:G.enemyTypes.normal,health:10,maxHealth:10,speed:0,chaseRange:0,
    lastUpdate:0,vx:0,vy:0,attackState:'idle',patrolWaypoints:[],burnUntil:epoch+2000,burnDmgLast:epoch};
  G.enemies=[attacker,burning];drive(100,[1000/60]);
  check('melee and burn fixture reaches genuine unfinished enemy deadlines',attacker.attackState==='windup'&&attacker.attackStateUntil>G.gameTimeNow()&&G.health===100&&burning.health===10&&G.pos.x>=1006&&G.pos.x<1007,{player:G.pos,attacker:attacker,burning:burning});
  G.pauseGame('enemy deadlines');frame(20100);G.resumeGame();frame(20101);frame(20101+1000/60);
  check('resume cannot land enemy windup or expire burning with paused wall time',attacker.attackState==='windup'&&G.health===100&&burning.health===10&&burning.burnUntil>G.gameTimeNow(),{health:G.health,attacker:attacker,burning:burning});
  for(var et=2;et<=37;et++)frame(20101+et*1000/60);
  check('active ticks eventually land the same melee strike and burn damage',G.health===85&&G.stats.totalDamageTaken===15&&near(burning.health,9.7)&&attacker.attackState==='cooldown',{health:G.health,attacker:attacker,burning:burning});
  assertHost('enemy deadlines');

  // Keep a generated-world integration in addition to the isolated room.
  // Same authored seed and tick inputs must survive genuine cave support,
  // enemies, effects and streaming consumers without display-rate changes.
  var caveReference=null;
  ['60Hz','30Hz','120Hz'].forEach(function(label){
    reset(true);G.CAVE_TEST_MODE=true;G._caveTestSeedOverride=12345;G._caveTestKindOverride='descending';
    Object.keys(G.caveTestFlags).forEach(function(k){G.caveTestFlags[k]=false;});G.caveTestFlags.caveEnemies=true;
    G.resetEndlessMode();G.previewCaveView('back');G.mana=G.MANA_MAX=1000;
    var initialX=G.pos.x,initialY=G.pos.y,initialZ=G.pos.floorZ,initialEnemies=G.enemies.length;
    check(label+' seeded cave fixture has real support walls and enemies',!!G.floorMesh&&G.deepCaveEntrances.length>0&&G.grid.some(function(v){return v!==0;})&&initialEnemies>0,{seed:G.WORLD_SEED,enemies:initialEnemies});
    replayInput=function(k){G.kbState.up=k<180;G._attackHeld=k<90;};
    drive(4000,schedules[label]);var state=snapshot();
    assertHost('seeded cave '+label);
    check(label+' seeded cave replay genuinely moves across changing support',Math.hypot(state.x-initialX,state.y-initialY)>30&&Math.abs(state.z-initialZ)>2&&state.ticks===240&&state.releases.length>=2,{before:{x:initialX,y:initialY,z:initialZ},after:state});
    if(caveReference)check(label+' seeded cave world matches 60Hz gameplay replay',same(state,caveReference),{expected:caveReference,actual:state});
    else caveReference=state;
  });
  Date.now=originalDate;Math.random=originalRandom;
  output('SIMULATION_TIMING_RESULT '+(failures?'FAIL '+failures+'/':'PASS ')+checked);
}());
