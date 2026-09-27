// Actual DOM listeners, input sampling, camera, player step and combat. Browser
// APIs/transport are controlled; no movement, cast or collision decision is mocked.
(function () {
  var G=(0,eval)('this'),output=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
  var checked=0,failed=0,wallNow=100000,oldDate=Date.now,listeners={document:{},canvas:{}},requests=[];
  Date.now=function(){return wallNow;};
  function mutate(source,flag,before,after) {
    if(__argv.indexOf(flag)<0)return source;
    if(source.split(before).length!==2)throw Error('MUTATION_ANCHOR '+flag);
    return source.replace(before,after);
  }
  G.__inputSource=function(path,source) {
    if(path==='src/23-events-init.js') {
      source=mutate(source,'--immediate-click','_mouseHeld = true; _attackPressed = true;',
        '_mouseHeld = true; _attackPressed = true; castCurrentSpell();');
      source=mutate(source,'--release-discards-tap','// Jump/dash edges are consumed by step(), not lost on a quick key release.',
        "else if (k === ' ') jumpPressed = false; else if (k === 'Shift') dashPressed = false;");
    }
    if(path==='src/16-draw-overview.js')source=mutate(source,'--render-steers-camera',
      'function draw() {','function draw() { updateInputCamera(1 / 60);');
    if(path==='src/08-sensors-input-los.js')source=mutate(source,'--unscaled-tilt',
      'var dtScale = dt > 0 ? dt / 0.060 : 1;','var dtScale = 1;');
    if(path==='src/08-sensors-input-los.js')source=mutate(source,'--stale-imu-force',
      'if (_imuSampleValid && performance.now() - _imuSampleAtMs > IMU_SAMPLE_MAX_AGE_MS) _imuSampleValid = false;',
      '// Mutation: retain disconnected sensor sample indefinitely.');
    return source;
  };
  G.__registerInputHost=function() {
    ['document','canvas'].forEach(function(name){
      G[name].addEventListener=function(type,fn){(listeners[name][type]||(listeners[name][type]=[])).push(fn);};
    });
  };
  var host=slurp('tools/game/tests/cave_occlusion_integration.js');
  var boundary=host.indexOf('  function check(name, okay) {');
  if(boundary<0)throw Error('SETUP input host boundary missing');
  host=host.slice(0,boundary);
  var anchor="manifest.parts.MAIN.forEach(function (path) { (0, eval)(slurp('assets/games/' + path)); });";
  if(host.split(anchor).length!==2)throw Error('SETUP manifest boundary missing');
  // The source canvas global is assigned by config; register before the events
  // fragment, after that real configuration has provided the actual target.
  host=host.replace(anchor,"manifest.parts.MAIN.forEach(function(path){ if(path==='src/23-events-init.js') G.__registerInputHost(); (0,eval)(G.__inputSource(path,slurp('assets/games/'+path))); });");
  (0,eval)(host+'G.__inputErrors=errors; }());');
  function check(name,okay,detail){checked++;if(!okay)failed++;output((okay?'PASS ':'FAIL ')+name+(okay?'':' '+JSON.stringify(detail)));}
  function near(a,b){return Number.isFinite(a)&&Math.abs(a-b)<1e-8;}
  function emit(type,values) {
    var event=Object.assign({key:'',button:0,repeat:false,target:G.canvas,preventDefault:function(){}},values||{});
    (listeners.document[type]||[]).forEach(function(fn){fn(event);});
  }
  function tap(key){emit('keydown',{key:key});emit('keyup',{key:key});}
  function reset() {
    G.running=true;G.gameOverState=G.menuOpen=G.settingsOpen=G.shopOpen=G.forgeOpen=G.inventoryOpen=G.overviewActive=false;
    G.document.hidden=false;G.document.pointerLockElement=G.canvas;G.inventorySelIdx=-1;
    G.CAVE_TEST_MODE=G.ENDLESS_MODE=false;G.terrain='ground';G.MODE3D=true;G.calibrating=false;
    G.USE_KEYBOARD=G.USE_MOUSE=true;G.USE_GAMEPAD=false;G.CONTROL_MODE=G.MODE_STICK_AIM;
    G.hasYaw=G.hasBaseline=false;G.capturingYaw=false;G.yawTarget=G.pitchTarget=G.yawOffset=G.autoPitchOff=0;
    G.USE_YAW=G.USE_PITCH=true;G._imuSampleValid=false;G.gpLast={valid:false,buttons:-1,x:0,y:0};
    G.cell=20;G.gridW=G.gridH=128;G.grid=new Uint8Array(128*128);G.worldW=G.worldH=2560;
    G.floorMesh=G.gridCave=G.wallHeights=G.wallFaceBase=G.wallMaxTopZ=null;G.deepCaveRegions=[];G.deepCaveEntrances=[];
    G.windowOriginX=G.windowOriginY=0;G.pos={x:1000,y:1000,floorZ:60};G.vel={x:0,y:0};
    G.cam={x:1000,y:1000,z:80,ang:0,pitch:0,fov:G.GAME_CONFIG.player.baseFov};G.viewCam={x:900,y:900};
    G.playerUnderground=false;G.equipment={};G.speed=G.GAME_CONFIG.player.baseSpeed;
    G.damping=G.GAME_CONFIG.terrainPhysics.ground.damping;G.bounce=G.GAME_CONFIG.terrainPhysics.ground.bounce;
    G.jumpAirborne=false;G.jumpVelZ=G.dashFovPunch=G.dashUntil=G.dashCooldownUntil=0;
    G.health=G.HEALTH_MAX=100;G.mana=G.MANA_MAX=100;G.MANA_REGEN_PER_S=G.HEALTH_REGEN_PER_S=0;
    G.stats={totalDamageDone:0,totalDamageTaken:0,totalManaConsumed:0,totalEnemiesKilled:0};
    ['walls','enemies','enemySpawners','projectiles','impacts','groundEffects','chainEffects','coneEffects','novaEffects',
      'deathEffects','coinDrops','soulOrbs','arcaneTomes','statPickups','companions','fortressAllies',
      'treasureChests','oreVeins','marketStalls','ambientParticles','structures','shrines','floorScatter','wallDecorations'].forEach(function(k){G[k]=[];});
    G.shopMarker=G.shopNearby=G.nearestOpenChest=G.nearestShrine=G.nearestArenaAltar=G.arenaChallenge=G.goal=null;
    G.fortressLockedNear=G.nearestFortressInteract=null;G.goalSpawned=true;G.exploredCells=null;
    G.viewDist=900;G.dayTime=.5;G.daySpeed=0;G.settings.dayNight=false;G.currentSpellIdx=0;
    G.spells.missile.unlocked=true;G.spells.missile.tier=1;G.pendingMissileCasts=[];G.spellCastReservationSerial=0;
    G.castAnimUntil=G.flameStreamLastTick=G.dmgBoostUntil=G.speedBoostUntil=G.armorBoostUntil=G.regenBoostUntil=0;
    G.NOCLIP=G.DEBUG_COMBAT=G.DEBUG_EFFECTS=G.DEBUG_CAVE=G.DEBUG_CAM=false;G.collisions=0;
    G.startGameClock();G.startMs=G.gameTimeNow();G.lastShotMs=G.gameTimeNow()-1000;
    G.lastSelectDown=G.lastStartMenuDown=G.lastADown=G.lastXDown=false;
    G.lastSelectToggleMs=G.lastStartMenuToggleMs=0;G.clearGameplayInput();G.__inputErrors.length=0;
  }
  function tick(){G.runSimulationTick(1/60);}
  check('real event fixture registers keyboard mouse and pointer-lock handlers',
    (listeners.document.keydown||[]).length>=2&&(listeners.document.keyup||[]).length===1&&
    (listeners.document.mousedown||[]).length===1&&(listeners.document.mousemove||[]).length===1);

  reset();G.equipment.boots={canJump:true,canDash:true};tap(' ');tap('Shift');
  check('rapid jump and dash releases retain both edges before a simulation tick',G.jumpPressed&&G.dashPressed&&G.pos.floorZ===60&&G.pos.x===1000);
  tick();var dashDeadline=G.dashCooldownUntil;
  check('rapid jump and dash execute actual vertical motion and horizontal impulse once',G.jumpAirborne&&G.pos.floorZ>60&&G.pos.x>1000&&G.vel.x>0&&!G.jumpPressed&&!G.dashPressed,{pos:G.pos,vel:G.vel});
  emit('keydown',{key:' ',repeat:true});emit('keydown',{key:'Shift',repeat:true});tick();
  check('OS key-repeat does not enqueue another jump or dash edge',!G.jumpPressed&&!G.dashPressed&&G.dashCooldownUntil===dashDeadline);
  reset();tap(' ');tap('Shift');tick();G.equipment.boots={canJump:true,canDash:true};tick();
  check('tap rejected without boots cannot trigger later after equipping boots',G.pos.floorZ===60&&G.pos.x===1000&&!G.jumpAirborne&&G.dashUntil===0);
  reset();G.equipment.boots={canDash:true};G.dashCooldownUntil=G.gameTimeNow()+40;tap('Shift');
  tick();tick();tick();tick();
  check('tap rejected during cooldown does not auto-dash when cooldown expires',G.pos.x===1000&&G.dashUntil===0&&!G.dashPressed);

  reset();emit('mousedown');emit('mouseup');
  check('quick click queues input without charging mana or reserving a cast between ticks',G._attackPressed&&!G._mouseHeld&&G.mana===100&&G.pendingMissileCasts.length===0,{mana:G.mana,pending:G.pendingMissileCasts.length});
  tick();
  check('quick click reserves a real windup exactly once on its tick',!G._attackPressed&&G.pendingMissileCasts.length===1&&G.mana===90&&G.spellCastReservationSerial===1);
  for(var i=0;i<30;i++)tick();
  check('released quick click launches its missile without becoming held fire',G.projectiles.length===1&&G.pendingMissileCasts.length===0&&G.spellCastReservationSerial===1&&G.stats.totalManaConsumed===10);
  reset();tap('e');tick();
  check('quick keyboard attack reaches the same real cast after key release',G.pendingMissileCasts.length===1&&G.mana===90&&!G._attackPressed&&!G._attackHeld);

  reset();G.MOUSE_CAM_SENSITIVITY=.003;
  emit('mousemove',{movementX:12,movementY:-6});emit('mousemove',{movementX:-2,movementY:2});
  check('mouse sample accumulates without steering outside simulation',G.cam.ang===0&&G.cam.pitch===0&&G.mouseDelta.x===10&&G.mouseDelta.y===-4);
  for(var m=0;m<5;m++)tick();
  check('multiple catchup ticks consume mouse displacement once',near(G.cam.ang,.03)&&near(G.cam.pitch,-.012)&&G.mouseDelta.x===0&&G.mouseDelta.y===0,{angle:G.cam.ang,pitch:G.cam.pitch});
  reset();G.CONTROL_MODE=G.MODE_GYRO_AIM;G.USE_MOUSE=false;G.hasYaw=true;G.yawTarget=1;G.pitchTarget=.3;
  tick();check('gyro fixture genuinely changes authoritative yaw and pitch on a tick',G.cam.ang>0&&G.cam.ang<1&&G.cam.pitch>0&&G.cam.pitch<.3);
  var yaw=G.cam.ang,pitch=G.cam.pitch,drawError=null;
  try { for(var view=0;view<2;view++){G.MODE3D=!!view;G.draw();G.draw();G.draw();} }catch(e){drawError=String(e);}
  check('actual 2D and 3D draws leave authoritative camera unchanged',drawError===null&&G.__inputErrors.length===0&&near(G.cam.ang,yaw)&&near(G.cam.pitch,pitch),{error:drawError,swallowed:G.__inputErrors,before:[yaw,pitch],after:[G.cam.ang,G.cam.pitch]});

  reset();G.USE_GAMEPAD=G.USE_KEYBOARD=G.USE_MOUSE=false;G.i2cEnabled=G.imuCompiled=true;
  G.dead=0;G.maxAng=10;G.speed=60;G.USE_YAW=G.USE_PITCH=false;
  // Monotonic time is mocked only for transport freshness, never reported as
  // performance evidence. Explicit arrivals model delayed and hung requests.
  var monotonicNow=10000,realPerformance=G.performance;
  G.performance={now:function(){return monotonicNow;}};
  G.hw.fetchJSON=function(){var request={};requests.push(request);return {then:function(resolve){request.resolve=resolve;return {catch:function(reject){request.reject=reject;}};}};};
  function sample(roll){G.pollIMU();requests.shift().resolve({valid:true,ori:{pitch:0,roll:roll}});}
  sample(3);sample(10);
  check('asynchronous IMU replies update intent without applying any velocity',G.lastRoll===10&&G._imuSampleValid&&G.vel.x===0&&G.vel.y===0);
  G.updateInputCamera(1/60);
  check('fixed tick applies latest IMU tilt with legacy sixty-millisecond impulse scale',near(G.vel.x,5/3)&&G.vel.y===0,{velocity:G.vel.x});
  var once=G.vel.x;G.vel.x=0;for(var s=0;s<10;s++)sample(10);G.updateInputCamera(1/60);
  check('extra sensor replies cannot multiply movement impulses',near(G.vel.x,once));
  G.vel.x=0;G.updateInputCamera(.01);G.updateInputCamera(.01);G.updateInputCamera(.01);
  check('tilt impulse integrates elapsed simulation time rather than callback count',near(G.vel.x,3),{velocity:G.vel.x});
  G.pollIMU();var hung=requests.shift();G.vel.x=0;monotonicNow+=251;G.updateInputCamera(1/60);
  check('hung sensor request expires prior tilt instead of applying force forever',!G._imuSampleValid&&G.vel.x===0,{valid:G._imuSampleValid,velocity:G.vel.x});
  hung.resolve({valid:true,ori:{pitch:0,roll:10}});G.vel.x=0;G.updateInputCamera(1/60);
  check('late response cannot refresh an already stale orientation sample',!G._imuSampleValid&&G.vel.x===0);
  G.pollIMU();var older=requests.shift();monotonicNow+=10;G.pollIMU();var newer=requests.shift();
  newer.resolve({valid:true,ori:{pitch:0,roll:4}});older.resolve({valid:true,ori:{pitch:0,roll:10}});
  G.vel.x=0;G.updateInputCamera(1/60);
  check('out-of-order response cannot overwrite newer valid sensor intent',G.lastRoll===4&&near(G.vel.x,2/3),{roll:G.lastRoll,velocity:G.vel.x});
  G.pollIMU();var oldFailure=requests.shift();monotonicNow+=10;sample(10);oldFailure.reject(new Error('old transport request failed'));
  check('old failed request cannot invalidate a newer successful sample',G._imuSampleValid&&G.lastRoll===10);
  G.pollIMU();var stale=requests.shift();G._gameRunGeneration++;G._imuSampleValid=false;G.lastRoll=0;
  stale.resolve({valid:true,ori:{pitch:0,roll:10}});
  check('prior-run sensor response cannot revive stale input',!G._imuSampleValid&&G.lastRoll===0);
  G.performance=realPerformance;

  reset();G.USE_MOUSE=G.USE_KEYBOARD=false;G.USE_GAMEPAD=true;G.document.pointerLockElement=null;
  G.gpLast={valid:true,buttons:-1,x:0,y:0};G.pollInputControls();var clock=G.gameTimeNow();
  wallNow+=1000;G.gpLast.buttons=~G.BTN_START;G.pollInputControls();
  check('gamepad Start opens the real pause UI without simulation ticks',G.menuOpen&&G.document.getElementById('btnStop').textContent==='Resume'&&G.gameTimeNow()===clock);
  wallNow+=1000;G.pollInputControls();
  check('holding Start beyond debounce cannot repeatedly toggle pause',G.menuOpen&&G.gameTimeNow()===clock);
  G.gpLast.buttons=-1;G.pollInputControls();G.gpLast.buttons=~G.BTN_START;G.pollInputControls();
  check('released and repressed Start resumes while simulation was paused',!G.menuOpen&&G.document.getElementById('btnStop').textContent==='Pause'&&G.gameTimeNow()===clock);
  G.gpLast.buttons=-1;G.pollInputControls();wallNow+=10;G.gpLast.buttons=~G.BTN_START;G.pollInputControls();
  check('Start debounce rejects a second rapid toggle',!G.menuOpen);

  reset();G.pauseGame('input regression');tap('w');tap(' ');tap('Shift');tap('e');emit('mousedown');emit('mousemove',{movementX:10,movementY:10});
  check('paused DOM events cannot queue gameplay actions for resume',!G.kbState.up&&!G.jumpPressed&&!G.dashPressed&&!G._attackPressed&&!G._mouseHeld&&G.mouseDelta.x===0&&G.mana===100);
  emit('keydown',{key:'p',repeat:true});check('repeated pause key does not close menu',G.menuOpen);
  tap('p');check('pause key remains usable while gameplay input is blocked',!G.menuOpen);
  G.settingsOpen=true;tap('o');check('settings close key remains usable while simulation is paused',!G.settingsOpen);
  check('input scenarios have no swallowed production errors',G.__inputErrors.length===0,G.__inputErrors);
  Date.now=oldDate;
  output('INPUT_TIMING_RESULT '+(failed?'FAIL ':'PASS ')+checked);
}());
