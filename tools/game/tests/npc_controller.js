// Real NPC controller contracts. Browser/device APIs are hosted; perception,
// actions, movement, collision, game clock, and seeded generation are real.
(function () {
  var G=(0,eval)('this'),output=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
  var checked=0,failed=0,wallNow=100000,oldDate=Date.now,oldRandom=Math.random;
  Date.now=function(){return wallNow;};
  function mutate(source,flag,before,after) {
    if(__argv.indexOf(flag)<0)return source;
    if(source.split(before).length!==2)throw Error('MUTATION_ANCHOR '+flag);
    return source.replace(before,after);
  }
  G.__npcSource=function(path,source){
    if(path==='src/10-npc-controller.js'){
      source=mutate(source,'--cooldown-stuck',"if(actor.attackState==='cooldown' && now>=actor.attackStateUntil)actor.attackState='idle';",'/* mutation: cooldown never becomes ready while target remains nearby */');
      source=mutate(source,'--stun-can-strike','if(actor.health<=0 || now<(actor.stunUntil||0)) {npcCancelAction(actor);return;}','if(actor.health<=0) {npcCancelAction(actor);return;}');
      source=mutate(source,'--remote-melee-hit','if(!npcTargetValid(actor,recipient,ability.range,ability.melee)) {npcStats.invalidations++;return;}','/* mutation: remembered recipient no longer checked at impact */');
      source=mutate(source,'--transfer-windup','var recipient=n.attackTargetId===0?pos:actor._attackTarget;\n      if(!recipient || !recipient.npc || recipient.npc.id!==n.attackTargetId)recipient=npcFindTarget(n.attackTargetId);','var recipient=target;');
      source=mutate(source,'--removed-target-present','if (!enemy && !ally) return false;','/* mutation: stale party references retain attack eligibility */');
      source=mutate(source,'--list-order-target','best=target;bestD=d;bestId=id;','best=target;bestD=d;bestId=id;break;');
      source=mutate(source,'--ignore-occlusion',"return spatialRaycast(a,b).status==='clear';",'return true;');
      source=mutate(source,'--eighty-ms-movement','travel=Math.min(d-stop,speed*dt)','travel=Math.min(d-stop,speed*.08)');
      source=mutate(source,'--think-every-tick','if (now<n.nextThinkAt) return false;','/* mutation: perception scans on every movement tick */');
      source=mutate(source,'--ignore-trait-overrides',"if(actor.npcTraits && Object.prototype.hasOwnProperty.call(actor.npcTraits,name))return !!actor.npcTraits[name];",'/* mutation: ignore per-creature capability overrides */');
    }
    if(path==='src/10-projectile-queries.js')source=mutate(source,'--slime-bypasses-solids',"hit=projectileSweepWorld(a,b,r,work),key='';","hit=p.spell&&p.spell.isCompanion?{status:'clear',t:1,kind:null}:projectileSweepWorld(a,b,r,work),key='';");
    if(path==='src/10-combat.js'){
      source=mutate(source,'--npc-player-buff-leak','if (spell.isNpc || spell.isTower) {','if (spell.isTower) {');
      source=mutate(source,'--tower-legacy-feet','to = npcAimPoint(target);','to = {x:target.x,y:target.y,z:target.z||0};');
    }
    if(path==='src/11-enemies.js')source=mutate(source,'--unreachable-melee','var meleeRange=12+8*(e.enemyType.size||1)+(NPC_PROFILES[brain.role].meleeReach||0);','var meleeRange=6+8*(e.enemyType.size||1);');
    if(path==='src/05-endless-world.js')source=mutate(source,'--lose-streamed-npc-state','npcSaved: npcSnapshot(e), stunUntil: e.stunUntil || 0,','npcSaved: null, stunUntil: 0,');
    return source;
  };
  var host=slurp('tools/game/tests/cave_occlusion_integration.js');
  var boundary=host.indexOf('  function check(name, okay) {');
  if(boundary<0)throw Error('SETUP NPC browser host boundary missing');
  host=host.slice(0,boundary);
  var load="manifest.parts.MAIN.forEach(function (path) { (0, eval)(slurp('assets/games/' + path)); });";
  if(host.split(load).length!==2)throw Error('SETUP NPC manifest boundary missing');
  host=host.replace(load,"manifest.parts.MAIN.forEach(function(path){(0,eval)(G.__npcSource(path,slurp('assets/games/'+path)));});");
  (0,eval)(host+'G.__npcErrors=errors; }());');
  function check(name,okay,detail){checked++;if(!okay)failed++;output((okay?'PASS ':'FAIL ')+name+(okay?'':' '+JSON.stringify(detail)));}
  function near(a,b){return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-7;}
  function rounded(value){
    if(typeof value==='number')return Math.round(value*1e6)/1e6;
    if(Array.isArray(value))return value.map(rounded);
    if(value&&typeof value==='object'){var o={};Object.keys(value).sort().forEach(function(k){o[k]=rounded(value[k]);});return o;}
    return value;
  }
  function equal(a,b){return JSON.stringify(rounded(a))===JSON.stringify(rounded(b));}
  function reset(mode){
    wallNow=100000;
    var rng=41753;Math.random=function(){rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
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
    G._loopErrCount=0;G._ptErrors={};G.__npcErrors.length=0;
    G._gameClockOriginMs=null;G._gameClockElapsedMs=0;G.simulationTiming={ticks:0,droppedMs:0,maxStepsPerFrame:0};
    G.startGameClock();G.startMs=G.gameTimeNow();G.lastShotMs=G.gameTimeNow()-1000;
    G.renderInterpolationEnabled=true;G.resetRenderInterpolation();G.resetNpcSystem();
  }
  function enemy(x,y,speed){
    var type=Object.assign({},G.enemyTypes.normal,{speed:speed||0,chaseRange:500,attackDamage:10,attackWindup:100,attackCooldown:200,size:1});
    return {x:x,y:y,z:0,feetZ:0,enemyType:type,health:100,maxHealth:100,speed:speed||0,chaseRange:500,
      lastUpdate:0,vx:0,vy:0,attackState:'idle',attackStateUntil:0,patrolWaypoints:[],patrolIdx:0};
  }
  function ally(x,y){return {x:x,y:y,feetZ:0,health:100,maxHealth:100,attackRange:18,attackDamage:3,attackCooldown:200,
    lastAttackMs:0,speed:0,followIdeal:50,followDist:80,teleportDist:99999,wanderAng:0,phase:0};}
  function tick(count,update){for(var i=0;i<count;i++){G.advanceGameClock(1/60);G.spatialSimulationTick++;(update||G.updateEnemies)(1/60);}}
  function mesh(layers){
    var w=41,m={w:w,h:w,gridSize:20,layerCount:new Uint8Array(w*w),surfaceH:new Float64Array(w*w),ceilAboveMask:new Uint8Array(w*w)};
    m.layerCount.fill(layers.length);
    for(var k=0;k<5;k++){
      m['l'+k+'Type']=new Uint8Array(w*w);m['l'+k+'TopZ']=new Float64Array(w*w);m['l'+k+'Meta']=new Uint8Array(w*w);
      if(layers[k]){m['l'+k+'Type'].fill(layers[k][0]);m['l'+k+'TopZ'].fill(layers[k][1]);m['l'+k+'Meta'].fill(layers[k][2]||0);}
    }
    m.surfaceH.fill(layers[layers.length-1][1]);G.floorMesh=m;return m;
  }
  reset(false);var e=enemy(990,1000);G.enemies=[e];
  check('authored combat fixture has live adjacent opponent and no solid geometry',e.health===100&&G.health===1000&&Math.hypot(e.x-G.pos.x,e.y-G.pos.y)===10&&G.grid.every(function(v){return v===0;}));
  tick(72);
  check('enemy repeatedly leaves cooldown and lands multiple melee attacks without target leaving range',G.health<=970&&G.health>=950,{health:G.health,state:e.attackState});

  reset(false);e=enemy(990,1000);G.enemies=[e];e.stunUntil=G.gameTimeNow()+1000;tick(36);
  check('stunned adjacent enemy neither starts nor lands an attack',G.health===1000&&e.attackState!=='windup',{health:G.health,state:e.attackState});
  reset(false);e=enemy(990,1000);G.enemies=[e];tick(1);
  check('interrupt fixture begins an actual production enemy windup',e.attackState==='windup',{state:e.attackState});
  e.stunUntil=G.gameTimeNow()+1000;tick(18);
  check('stun applied during windup cancels the pending strike',G.health===1000&&e.attackState!=='windup',{health:G.health,state:e.attackState});

  ['range','death','despawn'].forEach(function(change){
    reset(false);G.pos.x=1200;e=enemy(1000,1000);var recipient=ally(1010,1000);G.enemies=[e];G.fortressAllies=[recipient];tick(1);
    check(change+' fixture locks a real adjacent ally attack',e.attackState==='windup',{state:e.attackState});
    if(change==='range')recipient.x=1400;
    if(change==='death')recipient.health=0;
    if(change==='despawn')G.fortressAllies=[];
    if(change==='despawn')check('removed live ally reference immediately loses target eligibility',!G.npcTargetPresent(e,recipient));
    G.pos.x=990;tick(7);
    check('remembered ally '+change+' cancels impact instead of damaging remote ally or transferring to player',recipient.health===(change==='death'?0:100)&&G.health===1000,
      {allyHealth:recipient.health,playerHealth:G.health,state:e.attackState});
  });

  reset(false);G.pos.x=1800;e=enemy(1000,1000);var close=ally(1030,1000),far=ally(1100,1000);G.enemies=[e];
  G.npcEnsure(e,'enemy');G.npcEnsure(close,'garrison');G.npcEnsure(far,'garrison');G.fortressAllies=[far,close];
  var first=G.npcSelectTarget(e,200);G.fortressAllies.reverse();e.npc.target=null;var second=G.npcSelectTarget(e,200);
  check('nearest eligible target is independent of friendly array order',first===close&&second===close,{first:first&&first.x,second:second&&second.x});
  far.x=970;e.npc.target=null;var tie1=G.npcSelectTarget(e,200);G.fortressAllies.reverse();e.npc.target=null;var tie2=G.npcSelectTarget(e,200);
  check('equidistant candidates keep the same identity when input list is reversed',tie1===tie2&&(tie1===close||tie1===far));
  G.enemies.push(enemy(1001,1000));G.companions=[{x:1002,y:1000,feetZ:0,type:'slime',phase:0,z:0,lastAttackMs:0}];
  G.npcEnsure(G.companions[0],'slime');var hostileChoice=G.npcSelectTarget(e,200);
  check('enemy rejects own faction and invulnerable slime as attack recipients',hostileChoice===close||hostileChoice===far);
  var friendlyChoice=G.npcSelectTarget(close,200);
  check('friendly garrison selects a hostile rather than nearby player or companion',G.enemies.indexOf(friendlyChoice)>=0);
  far.x=1028;close.x=1030;e.npc.target=close;
  check('small target-distance fluctuations retain the current valid recipient',G.npcSelectTarget(e,200)===close);
  far.x=1020;
  check('substantially nearer hostile opportunity replaces the retained recipient',G.npcSelectTarget(e,200)===far);

  reset(false);e=enemy(960,1000,60);e.npcTraits={pursue:false,patrol:false,melee:false};G.enemies=[e];tick(24);
  check('per-creature trait overrides actually suppress movement and melee consumers',near(e.x,960)&&near(e.y,1000)&&G.health===1000&&e.npc.commits===0,{x:e.x,health:G.health,commits:e.npc.commits});
  G.pos.x=970;tick(24);
  check('disabled melee trait prevents damage even when a live target is within strike reach',G.health===1000&&e.npc.commits===0,{health:G.health,commits:e.npc.commits});
  e.npcTraits.melee=true;tick(24);
  check('reenabling the melee trait restores real attacks without enabling pursuit',near(e.x,960)&&G.health<1000&&e.npc.commits>0,{x:e.x,health:G.health,commits:e.npc.commits});

  reset(false);var observer=ally(1000,1000);G.fortressAllies=[observer];G.npcEnsure(observer,'garrison');
  for(var ni=0;ni<64;ni++)G.enemies.push(enemy(1060+ni*2,1000));
  var membershipCalls=0,arrayIndexOf=Array.prototype.indexOf;
  G.enemies.indexOf=function(value){membershipCalls++;return arrayIndexOf.call(this,value);};
  G.npcSelectTarget(observer,400);
  check('one perception scan visits each opponent once without nested membership scans',G.npcStats.candidates===64&&membershipCalls===0,{candidates:G.npcStats.candidates,membershipCalls:membershipCalls});

  // A bounded deterministic scheduling check measures work, not fake-clock
  // milliseconds: stationary actors must not rescan candidates at render rate.
  reset(false);var thinkers=[];
  for(var ti=0;ti<6;ti++){var thinker=enemy(800+ti*20,1000);G.npcEnsure(thinker,'enemy');thinkers.push(thinker);}
  var duePerTick=[],decisionCount=0;
  for(var ts=0;ts<60;ts++){
    var due=0;
    for(var tj=0;tj<thinkers.length;tj++)if(G.npcDecisionDue(thinkers[tj],ts*1000/60)){due++;decisionCount++;}
    duePerTick.push(due);
  }
  check('initial perception acquires promptly for every new actor',duePerTick[0]===6,duePerTick.slice(0,8));
  check('subsequent perception is bounded and staggered while locomotion stays sixty Hz',decisionCount>=55&&decisionCount<=66&&duePerTick.slice(1).every(function(n){return n<=2;}),{decisions:decisionCount,perTick:duePerTick});

  reset(false);G.pos.x=500;G.pos.y=500;e=enemy(110,110);var target=ally(150,110);G.enemies=[e];G.fortressAllies=[target];G.npcEnsure(e,'enemy');G.npcEnsure(target,'garrison');
  check('open ranged target is eligible before occluder is introduced',G.npcTargetValid(e,target,100,false));
  for(var wy=0;wy<G.gridH;wy++)G.grid[wy*G.gridW+6]=1;
  check('solid wall prevents target acquisition and attack eligibility',!G.npcTargetValid(e,target,100,false)&&G.npcSelectTarget(e,100)===null);
  G.grid.fill(0);
  check('removing the same wall restores target eligibility',G.npcTargetValid(e,target,100,false));
  mesh([[1,0,2],[2,4],[4,5,3]]);target.feetZ=125;target.x=118;
  check('different storeys have authored nonoverlapping bodies separated by a real roof',e.feetZ===0&&target.feetZ===125&&G.floorMesh.layerCount[5*41+5]===3);
  check('roof blocks ranged acquisition and nonoverlapping height blocks melee',!G.npcTargetValid(e,target,100,false)&&!G.npcTargetValid(e,target,100,true));
  target.feetZ=0;
  check('same cellar floor remains a valid open melee target',G.npcTargetValid(e,target,100,true));

  reset(false);G.pos.x=1200;e=enemy(1000,1000,60);G.enemies=[e];var positions=[];
  for(var mt=0;mt<12;mt++){tick(1);positions.push(e.x);}
  check('enemy locomotion advances every fixed tick rather than once per perception update',positions.every(function(x,i){return near(x,1001+i);}),positions);
  check('twelve fixed ticks at sixty units per second move exactly twelve units',near(e.x,1012)&&near(e.y,1000),{x:e.x,y:e.y});
  function distant(view){reset(false);G.viewDist=view;G.pos.x=1300;e=enemy(1000,1000,30);e.chaseRange=0;e.patrolWaypoints=[{x:1100,y:1000},{x:1000,y:1000}];e.patrolIdx=0;e.burnDmgLast=G.gameTimeNow();e.burnUntil=G.gameTimeNow()+3000;G.enemies=[e];tick(60);return {x:e.x,y:e.y,health:e.health};}
  var smallView=distant(100),largeView=distant(1800);
  check('far actor fixture actually patrols and takes burning damage',smallView.x>1000&&smallView.health<100,smallView);
  check('render view distance cannot freeze NPC motion or damage timers',equal(smallView,largeView),{small:smallView,large:largeView});

  function slimeScenario(obstruction,buffed){
    reset(false);G.pos.x=110;G.pos.y=110;G.cam.x=110;G.cam.y=110;
    var slime={type:'slime',x:110,y:110,feetZ:0,renderFloorZ:0,z:0,phase:0,wanderAng:0,lastAttackMs:0,squash:1};
    var victim=enemy(210,110);victim.vx=7;victim.vy=-3;
    if(obstruction==='roof')victim.feetZ=125;
    G.enemies=[victim];G.companions=[slime];
    if(buffed){G.equipment={robes:{spellDmgBonus:9},relic:{effect:'lifesteal',value:1}};G.dmgBoostUntil=G.gameTimeNow()+10000;G.health=500;}
    tick(1,G.updateCompanions);var shot=G.projectiles[0];
    check(obstruction+' slime fixture launches a real shared projectile toward a living target',G.projectiles.length===1&&!!shot.spell.isCompanion&&shot.ownerId===slime.npc.id&&G.impacts.length===0,
      {shots:G.projectiles.length,impacts:G.impacts.length});
    if(obstruction==='wall')for(var sy=0;sy<G.gridH;sy++)G.grid[sy*G.gridW+8]=1;
    if(obstruction==='roof')mesh([[1,0,2],[2,4],[4,5,3]]);
    if(obstruction==='spawner')G.enemySpawners=[{x:160,y:110,feetZ:0,hp:10,maxHp:10,active:true}];
    var beforeHealth=G.health,beforeMana=G.mana,beforeStats=JSON.stringify(G.stats);
    G.advanceGameClock(.5);G.spatialSimulationTick++;G.updateProjectiles(.5);
    return {health:victim.health,vx:victim.vx,vy:victim.vy,shots:G.projectiles.length,impacts:G.impacts.length,
      playerHealth:G.health,playerMana:G.mana,isolated:G.health===beforeHealth&&G.mana===beforeMana&&JSON.stringify(G.stats)===beforeStats,
      spawner:G.enemySpawners[0]&&G.enemySpawners[0].hp};
  }
  var slimeOpen=slimeScenario('open',false);
  check('slime projectile crosses target within one tick and deals exactly its configured damage',near(slimeOpen.health,99.2)&&slimeOpen.shots===0&&slimeOpen.impacts===1,slimeOpen);
  var slimeWall=slimeScenario('wall',false);
  check('wall inserted after slime launch absorbs swept bolt before enemy',slimeWall.health===100&&slimeWall.shots===0&&slimeWall.impacts===1,slimeWall);
  var slimeRoof=slimeScenario('roof',false);
  check('roof inserted after slime launch blocks shot crossing between storeys',slimeRoof.health===100&&slimeRoof.shots===0&&slimeRoof.impacts===1,slimeRoof);
  var slimeBuffed=slimeScenario('open',true);
  check('NPC projectile damage ignores player robes boosts relic rewards and knockback',near(slimeBuffed.health,99.2)&&slimeBuffed.isolated&&slimeBuffed.vx===7&&slimeBuffed.vy===-3,slimeBuffed);
  var slimeSpawner=slimeScenario('spawner',false);
  check('slime bolt stops at spawner without granting mining or spawner damage rewards',slimeSpawner.health===100&&slimeSpawner.spawner===10&&slimeSpawner.shots===0&&slimeSpawner.isolated,slimeSpawner);

  function guardScenario(obstruction){
    reset(false);G.pos.x=110;G.pos.y=110;var guard=ally(110,110),victim=enemy(150,110);guard.attackRange=60;G.fortressAllies=[guard];G.enemies=[victim];
    if(obstruction==='wall')for(var gy=0;gy<G.gridH;gy++)G.grid[gy*G.gridW+6]=1;
    if(obstruction==='roof'){mesh([[1,0,2],[2,4],[4,5,3]]);victim.feetZ=125;}
    tick(1,G.updateFortressAllies);return {health:victim.health,commits:guard.npc.commits};
  }
  var guardOpen=guardScenario('open'),guardWall=guardScenario('wall'),guardRoof=guardScenario('roof');
  check('garrison shared action lands its configured melee hit in open space',guardOpen.health===97&&guardOpen.commits===1,guardOpen);
  check('same garrison cannot melee through solid wall or across roof storeys',guardWall.health===100&&guardWall.commits===0&&guardRoof.health===100&&guardRoof.commits===0,{wall:guardWall,roof:guardRoof});

  reset(false);G.pos.x=110;G.pos.y=110;mesh([[1,5,1]]);G.shopMarker={x:110,y:110};e=enemy(210,110);e.feetZ=125;G.enemies=[e];G.guardTowerLastFire=0;
  tick(1,G.updateGuardTower);var towerShot=G.projectiles[0];
  check('tower on raised support launches from canonical support plus muzzle height',!!towerShot&&near(towerShot.z,200)&&towerShot.spell.isNpc&&towerShot.ownerId===G.shopMarker.npc.id,towerShot&&{z:towerShot.z,vz:towerShot.vz});
  check('raised tower aims at body center rather than legacy zero feet field',!!towerShot&&near(towerShot.vz,(-40)*G.towerSpell.speed/100),towerShot&&{vz:towerShot.vz,speed:towerShot.speed});
  G.advanceGameClock(.5);G.spatialSimulationTick++;G.updateProjectiles(.5);
  check('raised tower shot actually reaches enemy on the same supported floor',e.health===100-G.towerSpell.damage&&G.projectiles.length===0,{health:e.health,shots:G.projectiles.length});

  // The actual loop performs input, simulation, combat and draw at differing
  // RAF rates. Pause must not advance thought/action deadlines or grant backlog.
  var realTick=G.runSimulationTick,replayTicks=0,baseClock=0;
  G.runSimulationTick=function(dt){var r=realTick(dt);replayTicks++;return r;};
  function replay(hz,vsPlayer){
    reset(false);G.health=G.HEALTH_MAX=1000;replayTicks=0;baseClock=G.gameTimeNow();G.pos.x=vsPlayer?1000:1200;e=enemy(vsPlayer?1013:990,1000,vsPlayer?60:15);G.enemies=[e];
    var guard=vsPlayer?null:ally(1000,1000);if(guard){guard.attackRange=1;G.fortressAllies=[guard];}
    G.loop(0,G._loopGen);
    for(var f=1;f<=hz*2;f++){
      var stamp=f*1000/hz;
      wallNow=100000+stamp;G.loop(stamp,G._loopGen);
    }
    return {ticks:replayTicks,clock:G.gameTimeNow()-baseClock,health:G.health,x:e.x,y:e.y,state:e.attackState,deadline:e.attackStateUntil-baseClock,
      allyHealth:guard?guard.health:null,commits:e.npc.commits,damage:G.stats.totalDamageTaken,loopErrors:G._loopErrCount,errors:G.__npcErrors.slice()};
  }
  var baseline=replay(60);
  check('real-loop replay reaches repeated combat without swallowed production errors',baseline.ticks===120&&baseline.allyHealth<95&&baseline.commits>=4&&baseline.loopErrors===0&&baseline.errors.length===0,baseline);
  [30,120].forEach(function(hz){var actual=replay(hz);check(hz+'Hz loop produces the same authoritative NPC combat as sixty Hz',equal(actual,baseline),{expected:baseline,actual:actual});});
  var playerBaseline=replay(60,true);
  check('real player collision separation still permits multiple correctly ranged enemy strikes',playerBaseline.health<=970&&playerBaseline.commits>=3&&playerBaseline.damage>=30&&playerBaseline.loopErrors===0&&playerBaseline.errors.length===0,playerBaseline);
  [30,120].forEach(function(hz){var actual=replay(hz,true);check(hz+'Hz player melee replay preserves damage and movement with actual separation',equal(actual,playerBaseline),{expected:playerBaseline,actual:actual});});
  // Pause uses a separate short sub-loop to avoid changing the number of active
  // simulation ticks in the cross-rate replay above.
  reset(false);e=enemy(990,1000);G.enemies=[e];G.loop(0,G._loopGen);G.loop(1000/60,G._loopGen);var frozen={time:G.gameTimeNow(),health:G.health,state:e.attackState,until:e.attackStateUntil};
  G.pauseGame('NPC deadline freeze');wallNow+=60000;G.loop(60000,G._loopGen);
  check('pause freezes in-flight enemy windup and simulation time',equal(frozen,{time:G.gameTimeNow(),health:G.health,state:e.attackState,until:e.attackStateUntil}));
  G.menuOpen=false;G.resetSimulationFrame();G.loop(61000,G._loopGen);G.loop(61000+1000/60,G._loopGen);
  check('resume advances one tick without consuming paused attack cooldowns',near(G.gameTimeNow()-frozen.time,1000/60)&&G.health===1000,{time:G.gameTimeNow()-frozen.time,health:G.health});
  G.runSimulationTick=realTick;

  // Real procedural geometry and real chunk serialization/reassembly. State
  // must follow identity, not the old live object or its array index.
  reset(true);G.CAVE_TEST_MODE=true;G._caveTestSeedOverride=12345;G._caveTestKindOverride='descending';
  Object.keys(G.caveTestFlags).forEach(function(key){G.caveTestFlags[key]=false;});G.caveTestFlags.caveEnemies=true;
  G.resetEndlessMode();
  var generated=G.enemies.slice().sort(function(a,b){return Math.hypot(a.x-G.pos.x,a.y-G.pos.y)-Math.hypot(b.x-G.pos.x,b.y-G.pos.y);})[0];
  check('seeded cave fixture has nonempty enemies solid walls and authored multi-layer support',!!generated&&G.enemies.length>0&&!!G.floorMesh&&G.grid.some(function(v){return v!==0;})&&G.deepCaveEntrances.length>0,
    {seed:G.WORLD_SEED,enemies:G.enemies.length,entrances:G.deepCaveEntrances.length});
  var generatedBrain=G.npcEnsure(generated,'enemy'),savedId=generatedBrain.id;
  generated.health=55;generated.stunUntil=G.gameTimeNow()+777;generated.arenaEnemy=true;generated.fromSpawner=true;
  generated.npcTraits={pursue:false};
  generated.attackState='windup';generated.attackStateUntil=G.gameTimeNow()+333;generatedBrain.attackTargetId=0;
  var worldPose={x:generated.x+G.windowOriginX,y:generated.y+G.windowOriginY},deadline=generated.attackStateUntil,stunDeadline=generated.stunUntil;
  var oldOrigin=G.windowOriginX;
  G.assembleWindow(G.windowCX+Math.floor(G.WINDOW_CHUNKS/2)+1,G.windowCY+Math.floor(G.WINDOW_CHUNKS/2));
  var rebuilt=G.enemies.filter(function(subject){return subject.npc.id===savedId;})[0];
  check('actual chunk shift replaces objects while keeping enemy world pose and stable identity',!!rebuilt&&rebuilt!==generated&&G.windowOriginX!==oldOrigin&&near(rebuilt.x+G.windowOriginX,worldPose.x)&&near(rebuilt.y+G.windowOriginY,worldPose.y),
    {id:savedId,found:!!rebuilt,origin:G.windowOriginX,before:oldOrigin});
  check('chunk reconstruction preserves stun windup recipient deadline health and spawn flags',!!rebuilt&&rebuilt.health===55&&rebuilt.stunUntil===stunDeadline&&rebuilt.attackState==='windup'&&rebuilt.attackStateUntil===deadline&&rebuilt.npc.attackTargetId===0&&rebuilt.arenaEnemy&&rebuilt.fromSpawner&&rebuilt.npcTraits&&rebuilt.npcTraits.pursue===false,
    rebuilt&&{health:rebuilt.health,stun:rebuilt.stunUntil,state:rebuilt.attackState,deadline:rebuilt.attackStateUntil,recipient:rebuilt.npc.attackTargetId});
  G.fortressAllies=[ally(G.pos.x,G.pos.y)];G.companions=[{type:'slime',x:G.pos.x,y:G.pos.y}];G.resetEndlessMode();
  var ids=G.enemies.map(function(subject){return G.npcEnsure(subject,'enemy').id;});
  check('real new-run reset removes party targets and assigns distinct IDs without stale combat',G.fortressAllies.length===0&&G.companions.length===0&&new Set(ids).size===ids.length&&G.enemies.every(function(subject){return subject.attackState==='idle'&&subject.npc.attackTargetId===null;}),
    {allies:G.fortressAllies.length,companions:G.companions.length,ids:ids});
  G.previewCaveView('back');var caveApproach=null;
  for(var gi=0;gi<G.enemies.length&&!caveApproach;gi++)for(var ga=0;ga<8&&!caveApproach;ga++){
    var subject=G.enemies[gi],feet=G.entityFeetSpatialZ(subject),angle=ga*Math.PI/4;
    var approach={x:subject.x+Math.cos(angle)*60,y:subject.y+Math.sin(angle)*60,feetZ:feet};
    if(!G.placeSpatialActorNear(approach,approach.x,approach.y,feet,6))continue;
    var gap=Math.hypot(approach.x-subject.x,approach.y-subject.y);
    if(gap>35&&gap<90&&near(approach.feetZ,feet)&&G.spatialRaycast({x:subject.x,y:subject.y,z:feet+35},{x:approach.x,y:approach.y,z:feet+35}).status==='clear')caveApproach=approach;
  }
  check('generated locomotion fixture locates a clear supported same-storey player approach',caveApproach!==null,{seed:G.WORLD_SEED});
  if(caveApproach){G.pos.x=caveApproach.x;G.pos.y=caveApproach.y;G.pos.floorZ=G.spatialZToPlayerZ(caveApproach.feetZ);}
  var generatedPositions=G.enemies.map(function(subject){return {id:subject.npc.id,x:subject.x,y:subject.y};});
  for(var gt=0;gt<30;gt++)G.runSimulationTick(1/60);
  var travelers=G.enemies.filter(function(subject){var before=generatedPositions.filter(function(p){return p.id===subject.npc.id;})[0];return before&&Math.hypot(subject.x-before.x,subject.y-before.y)>.01;});
  check('seeded cave real ticks run perception and supported locomotion with actual traveling NPCs',G.npcStats.decisions>0&&G.npcStats.moves>0&&travelers.length>0&&travelers.every(function(subject){return Number.isFinite(subject.feetZ)&&Number.isFinite(subject.x)&&Number.isFinite(subject.y);}),
    {decisions:G.npcStats.decisions,moves:G.npcStats.moves,travelers:travelers.length});
  check('generated NPC simulation has no swallowed stage or runtime errors',G.__npcErrors.length===0&&Object.keys(G._ptErrors).length===0,{errors:G.__npcErrors,stages:G._ptErrors});

  Date.now=oldDate;Math.random=oldRandom;
  output('NPC_CONTROLLER_RESULT '+(failed?'FAIL '+failed+'/':'PASS ')+checked);
}());
