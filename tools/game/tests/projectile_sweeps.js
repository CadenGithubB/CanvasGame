// Analytic world/body contacts plus real updateProjectiles damage and effects.
(function(){
  (0, eval)(slurp('assets/games/src/02-simulation-clock.js'));
  var G=(0,eval)('this'),count=0,failed=0,clock=100000;
  var out=typeof __out==='function'?__out:console.log.bind(console);
  G.console={log:function(){}};
  G.floorMesh=G.grid=G.wallHeights=G.wallFaceBase=G.wallMaxTopZ=null;
  G.ENDLESS_MODE=false;G.cell=15;G.gridW=G.gridH=24;G.windowOriginX=G.windowOriginY=0;
  G.pos={x:30,y:150,floorZ:60};G.cam={ang:0,pitch:0};G.MODE3D=true;G.playerUnderground=false;
  G.deepCaveRegions=[];G._cacheStats={floorH:{hits:0,misses:0,size:0}};
  G.spatialSimulationTick=0;G.PROJ_RADIUS=8;G.PROJ_LIFE_MS=1500;G.CONTROL_MODE=0;G.MODE_STICK_AIM=1;G.MODE_GYRO_AIM=2;G.gpLast=null;
  Date.now=function(){return clock;};
  ['06-floor-queries','06-spatial-geometry','06-spatial-queries','10-projectile-queries','10-combat'].forEach(function(name){
    var src=slurp('assets/games/src/'+name+'.js');
    function mutate(flag,before,after){if(__argv.indexOf(flag)<0)return;if(src.split(before).length!==2)throw Error('MUTATION_ANCHOR '+flag);src=src.replace(before,after);}
    if(name==='10-projectile-queries') {
      mutate('--endpoint-only','var r=Number.isFinite(p.r)?Math.max(0,p.r):8,hit=projectileSweepWorld(a,b,r,work),key=\'\';',
        'a=b;var r=Number.isFinite(p.r)?Math.max(0,p.r):8,hit=projectileSweepWorld(a,b,r,work),key=\'\';');
      mutate('--ignore-world','hit=projectileSweepWorld(a,b,r,work)','hit={status:\'clear\',t:1}');
      mutate('--ignore-radius','var r=Number.isFinite(p.r)?Math.max(0,p.r):8,','var r=0,');
      mutate('--ignore-height','var pz=a.z-z;','var pz=35;dz=0;');
      mutate('--freeze-target','var moving=now!==null &&','var moving=false &&');
      mutate('--full-target-history','var fraction=Number.isFinite(motionFraction)?Math.max(0,Math.min(1,motionFraction)):1;',
        'var fraction=1;');
      mutate('--last-body-wins','if(t>hit.t+1e-8 ||','if(false && (t>hit.t+1e-8 ||');
      if(__argv.indexOf('--last-body-wins')>=0) src=src.replace('(!hit.body || nextKey>=key)))) return;','(!hit.body || nextKey>=key))))) return;');
    }
    (0,eval)(src);
  });
  G.applyRelicOnHit=function(){};
  function check(name,ok,detail){count++;if(!ok)failed++;out((ok?'PASS ':'FAIL ')+name+(ok?'':' '+JSON.stringify(detail)));}
  function close(a,b){return Number.isFinite(a)&&Math.abs(a-b)<1e-5;}
  function mesh(roof,slope){
    var m={w:31,h:31,gridSize:12,layerCount:new Uint8Array(961)};
    for(var l=0;l<5;l++){m['l'+l+'Type']=new Uint8Array(961);m['l'+l+'TopZ']=new Float64Array(961);m['l'+l+'Meta']=new Uint8Array(961);}
    for(var y=0;y<31;y++)for(var x=0;x<31;x++){
      var i=y*31+x;m.layerCount[i]=roof?3:1;m.l0Type[i]=1;m.l0TopZ[i]=slope?x*12*0.5/25:0;m.l0Meta[i]=roof?2:1;
      if(roof){m.l1Type[i]=2;m.l1TopZ[i]=4;m.l2Type[i]=4;m.l2TopZ[i]=5;m.l2Meta[i]=3;}
    }
    G.floorMesh=m;
  }
  function reset(mode,roof){
    G.MODE3D=mode;mesh(roof);G.grid=new Uint8Array(576);G.wallHeights=new Float64Array(576);G.wallHeights.fill(1);
    G.wallFaceBase=G.wallMaxTopZ=null;G.projectiles=[];G.enemies=[];G.enemySpawners=[];G.oreVeins=[];
    G.impacts=[];G.groundEffects=[];G.chainEffects=[];G.deathEffects=[];G.coinDrops=[];G.DEBUG_EFFECTS=false;
    G.equipment={relic:null,robes:null};G.stats={totalDamageDone:0,totalEnemiesKilled:0};G.dmgBoostUntil=0;
    G.spells={missile:{id:'missile',damage:3,color:'#fff',speed:240}};
    G.pos={x:30,y:150,floorZ:60};G.cam={ang:0,pitch:0};G.playerUnderground=false;
    G.spatialSimulationTick++;clock+=1000;
  }
  function enemy(x,y,cave){var e={x:x,y:y,z:0,underground:!!cave,health:10,enemyType:{id:'normal'},vx:0,vy:0};G.enemies.push(e);return e;}
  function shot(values){var p={x:30,y:150,z:55,ang:0,speed:240,hz:240,vz:0,r:8,spell:G.spells.missile,spawnMs:clock-100,lifeMs:1500,renderFloorZ:0};Object.keys(values||{}).forEach(function(k){p[k]=values[k];});G.projectiles.push(p);return p;}
  function wall(x,y){G.grid[y*24+x]=1;}
  [false,true].forEach(function(mode){
    var v=mode?'3D ':'2D ';
    reset(mode);wall(10,10);var e=enemy(230,150);shot();G.updateProjectiles(1);
    check(v+'fast shot stops at near wall face before protected enemy',e.health===10&&G.projectiles.length===0&&G.impacts.length===1&&close(G.impacts[0].x,142),G.impacts);
    reset(mode);e=enemy(230,150);shot();G.updateProjectiles(1);G.updateProjectiles(1);
    check(v+'same shot without wall hits once at swept body contact',e.health===7&&G.stats.totalDamageDone===3&&G.impacts.length===1&&close(G.impacts[0].x,194),G.impacts);
    [false,true].forEach(function(reverse){
      reset(mode);var near=enemy(130,150),far=enemy(230,150);if(reverse)G.enemies.reverse();shot();G.updateProjectiles(1);
      check(v+'nearest body wins independent of array order '+reverse,near.health===7&&far.health===10&&close(G.impacts[0].x,94));
    });
    reset(mode);wall(16,10);e=enemy(130,150);shot();G.updateProjectiles(1);
    check(v+'near enemy wins before farther wall',e.health===7&&close(G.impacts[0].x,94));
    reset(mode);wall(10,10);shot({y:149});G.updateProjectiles(1);
    check(v+'projectile radius catches wall edge missed by center ray',G.projectiles.length===0&&G.impacts.length===1&&close(G.impacts[0].x,150-Math.sqrt(63)),G.impacts);
    reset(mode);wall(10,10);shot({y:141});G.updateProjectiles(1);
    check(v+'same glancing path outside radius stays clear',G.projectiles.length===1&&close(G.projectiles[0].x,270));
    reset(mode,true);e=enemy(160,150,true);shot({z:180,renderFloorZ:125});G.updateProjectiles(1);
    check(v+'surface shot cannot damage cave body at same XY',e.health===10&&G.projectiles.length===1);
    reset(mode,true);e=enemy(160,150,true);shot({z:55,underground:true});G.updateProjectiles(1);
    check(v+'same cave body can be hit from its open passage',e.health===7&&G.projectiles.length===0);
    reset(mode,true);shot({speed:1,hz:1,vz:200});G.updateProjectiles(1);
    check(v+'upward shot hits ceiling with radius before entering roof',G.projectiles.length===0&&G.impacts.length===1&&close(G.impacts[0].z,92),G.impacts);
    reset(mode);mesh(false,true);shot({x:100,z:150,speed:0,hz:0,vz:-150});G.updateProjectiles(1);
    check(v+'sloped terrain contact follows triangle plane not cell sample',G.impacts.length===1&&close(G.impacts[0].z,50+8*Math.sqrt(1.25)),G.impacts);
    reset(mode);e=enemy(150,240);e._projectilePrevX=150;e._projectilePrevY=60;e._projectilePrevZ=0;e._projectileMotionTick=G.spatialSimulationTick;
    shot();G.updateProjectiles(1);
    check(v+'moving target crossing shot is hit between endpoint positions',e.health===7&&G.projectiles.length===0);
    shot();G.updateProjectiles(1);
    check(v+'consumed target trajectory is not replayed on same tick',e.health===7&&G.projectiles.length===1);
    reset(mode);e=enemy(150,240);e._projectilePrevX=150;e._projectilePrevY=60;e._projectilePrevZ=0;e._projectileMotionTick=G.spatialSimulationTick;
    shot({speed:960,hz:960,_castReleaseAt:clock-250});G.updateProjectiles(1);
    check(v+'late release cannot hit earlier target motion before shot existed',e.health===10&&G.projectiles.length===1&&close(G.projectiles[0].x,270));
    reset(mode);e=enemy(230,150);var sp={x:120,y:150,active:true,hp:3};G.enemySpawners.push(sp);shot();G.updateProjectiles(1);
    check(v+'near spawner wins before enemy and drops rewards once',!sp.active&&sp.hp===0&&e.health===10&&G.coinDrops.length===5&&G.deathEffects.length===5);
    reset(mode);wall(10,10);G.oreVeins=[{gx:10,gy:10,hp:2}];shot();G.updateProjectiles(1);
    check(v+'ore damage uses contacted wall not projectile center cell',G.oreVeins[0].hp===1&&close(G.impacts[0].x,142));
    reset(mode);wall(10,10);shot({isLob:true,gravZ:-1,spell:{id:'poison',damage:0.4,color:'#0f0'}});G.updateProjectiles(1);
    check(v+'lob bursts once on near side of wall',G.projectiles.length===0&&G.groundEffects.length===1&&close(G.groundEffects[0].x,142)&&G.groundEffects[0].renderFloorZ===0);
    reset(mode);shot({isLob:true,gravZ:-200,speed:30,hz:30});G.updateProjectiles(1);
    check(v+'lob lands at swept floor contact',G.projectiles.length===0&&G.groundEffects.length===1&&close(G.impacts[0].z,8));
    reset(mode);e=enemy(130,150);shot({spawnMs:clock-2000});G.updateProjectiles(1);
    check(v+'expired shot cannot apply one final damage event',e.health===10&&G.projectiles.length===0&&G.impacts.length===0);
    reset(mode,true);G.pos.floorZ=260;G.spawnProjectile(240,8,G.spells.missile);
    check(v+'projectile launch uses player storey in either view',G.projectiles.length===1&&G.projectiles[0].z===180);
    reset(mode);e=enemy(130,150);e.health=0;var live=enemy(230,150);shot();G.updateProjectiles(1);
    check(v+'dead enemy cannot consume shot intended for live target',live.health===7&&e.health===0);
  });
  reset(true);var work={};for(var i=0;i<60;i++)enemy(30+i*3,300);var p=shot();G.projectileFirstHit(p,{x:30,y:150,z:55},{x:270,y:150,z:55},null,work);
  check('spell storm broad phase rejects distant targets before body geometry',work.bodyCandidates===60&&!work.bodyTests,work);
  check('swept terrain work scales with path not whole map',work.sweepTerrainCells>0&&work.sweepTerrainCells<100&&(work.sweepTriangles||0)<200,work);
  out('PROJECTILE_SWEEPS_RESULT '+(failed?'FAIL ':'PASS ')+count);
  if(__argv.indexOf('--benchmark')>=0 && !failed) {
    if(typeof performance==='undefined'||typeof performance.now!=='function')throw Error('Real monotonic performance.now required');
    reset(true);for(var i=0;i<60;i++)enemy(45+(i%10)*27,50+Math.floor(i/10)*45);
    wall(12,10);wall(15,8);
    function batch(counters){for(var j=0;j<120;j++){
      var a={x:30+(j%20)*12,y:45+Math.floor(j/20)*45,z:55};
      G.projectileFirstHit({r:8},a,{x:a.x+12,y:a.y+1,z:55},null,counters);
    }}
    var start=performance.now();while(performance.now()-start<1000)batch();
    var all=[];
    for(var repeat=0;repeat<5;repeat++) {
      var samples=[];start=performance.now();
      while(performance.now()-start<1000){var t=performance.now();batch();samples.push(performance.now()-t);}
      samples.sort(function(a,b){return a-b;});
      function percentile(p){return samples[Math.min(samples.length-1,Math.floor(p*samples.length))];}
      all.push({repeat:repeat,batches:samples.length,p50:percentile(0.5),p95:percentile(0.95),p99:percentile(0.99),max:samples[samples.length-1]});
    }
    var counters={};batch(counters);
    out('PROJECTILE_MICROBENCH '+JSON.stringify({engine:__engine,unit:'ms per 120 swept queries with 60 bodies; headless query batch, not browser frame time',warmupMs:1000,measurementMsPerRepeat:1000,repeats:all,work:counters}));
  }
})();
