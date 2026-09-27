// Real chest/enemy consumers with authored geometry and seeded cave content.
// The host replaces browser APIs and the clock, never spatial decisions.
(function () {
  var G = (0, eval)('this'), checked = 0, clock = 100000, errors = [];
  var output = (__engine === 'node' || __engine === 'deno') ? console.log.bind(console) : __out;
  function noop() {}
  function stub(values) { return new Proxy(values || {}, {get: function (o,k) {
    if (k === 'then') return undefined;
    return k in o ? o[k] : noop;
  }}); }
  function gradient() { return {addColorStop:noop}; }
  var context = stub({measureText:function(s){return {width:String(s).length*6};},
    createLinearGradient:gradient,createRadialGradient:gradient,createPattern:function(){return {};},
    createImageData:function(w,h){return {data:new Uint8ClampedArray(w*h*4)};},
    getImageData:function(x,y,w,h){return {data:new Uint8ClampedArray(w*h*4)};}});
  function canvas() { return stub({width:360,height:240,style:{},getContext:function(){return context;},
    getBoundingClientRect:function(){return {left:0,top:0,width:this.width,height:this.height};}}); }
  var elements = {maze:canvas()};
  function element(id) {
    if (!elements[id]) elements[id]=stub({id:id,checked:id==='ctFixedNoon',value:'',textContent:'',
      style:{},classList:stub(),dataset:{}});
    return elements[id];
  }
  G.window=G;
  G.document=stub({getElementById:element,createElement:function(t){return t==='canvas'?canvas():stub({style:{}});},
    querySelectorAll:function(){return [];},querySelector:function(){return null;},
    body:stub({style:{}}),documentElement:stub({style:{}})});
  G.console={log:noop,info:noop,warn:noop,error:function(){errors.push(Array.prototype.join.call(arguments,' '));}};
  G.setTimeout=G.setInterval=G.requestAnimationFrame=function(){return 1;};
  G.clearTimeout=G.clearInterval=G.cancelAnimationFrame=noop;
  G.addEventListener=G.removeEventListener=noop;
  G.innerWidth=1280; G.innerHeight=720; G.devicePixelRatio=1;
  G.hw={fetchJSON:function(){return new Promise(noop);},postFormText:function(){return new Promise(noop);},_auth401:noop};
  Date.now=function(){return clock;};
  function replaceOnce(source,before,after,label) {
    if (source.split(before).length!==2) throw new Error('MUTATION ANCHOR '+label);
    return source.replace(before,after);
  }
  var mutations={
    '--legacy-chest-offer':['src/17-input-lighting-update.js',
      'var inRange = dist < 90 && canReachChest(ch);','var inRange = dist < 90;'],
    '--legacy-chest-collect':['src/19-companions-loot.js',
      'if (!ch || ch.collected || !canReachChest(ch)) return;','if (!ch || ch.collected) return;'],
    '--stale-window-chest':['src/19-companions-loot.js',
      'if (!treasureChests || treasureChests.indexOf(ch) < 0) return;',
      '/* mutation: accepts obsolete window chest */'],
    '--legacy-enemy-chase':['src/10-npc-controller.js',
      "return spatialRaycast(a,b).status==='clear';",
      "return hasLineOfSight(a.x,a.y,b.x,b.y);"],
    '--legacy-enemy-melee':['src/10-npc-controller.js',
      'function npcTargetGeometry(actor,target,range,melee) {',
      'function npcTargetGeometry(actor,target,range,melee) {\n  if(Math.hypot(target.x-actor.x,target.y-actor.y)<24)return true;'],
    '--stale-strike-recipient':['src/10-npc-controller.js',
      'if(!npcTargetValid(actor,recipient,ability.range,ability.melee))',
      'if(!npcTargetValid(actor,target,ability.range,ability.melee))'],
    '--omit-wall-closure':['src/06-spatial-queries.js',
      'for (var face=0;face<4;face++) {',
      'for (var face=4;face<4;face++) {']
  };
  var manifest=JSON.parse(slurp('assets/games/manifest.json'));
  manifest.parts.MAIN.forEach(function(path){
    var source=slurp('assets/games/'+path);
    Object.keys(mutations).forEach(function(flag){
      var m=mutations[flag];
      if (__argv.indexOf(flag)>=0 && path===m[0]) source=replaceOnce(source,m[1],m[2],flag);
    });
    (0,eval)(source);
  });
  function check(name,okay,detail) {
    if (!okay) throw new Error(name+(detail?' ['+detail+']':''));
    checked++; output('PASS '+name);
  }
  function player(x,y,h) { G.pos={x:x,y:y,floorZ:60+40*h}; G.playerUnderground=h<0; }
  function authored(roof,mode) {
    G.MODE3D=mode; G.ENDLESS_MODE=false; G.CAVE_TEST_MODE=false;
    G.windowOriginX=G.windowOriginY=0;
    G.cell=15; G.gridW=G.gridH=16; G.worldW=G.worldH=240;
    G.grid=new Uint8Array(256); G.wallHeights=new Float32Array(256); G.wallHeights.fill(1);
    G.gridCave=null; G.wallFaceBase=null; G.wallMaxTopZ=null; G.walls=[];
    var mesh={w:21,h:21,gridSize:12,layerCount:new Uint8Array(441)};
    for(var l=0;l<5;l++) {
      mesh['l'+l+'Type']=new Uint8Array(441); mesh['l'+l+'TopZ']=new Float32Array(441);
      mesh['l'+l+'Meta']=new Uint8Array(441);
    }
    for(var i=0;i<441;i++) {
      mesh.layerCount[i]=roof?3:1; mesh.l0Type[i]=1; mesh.l0Meta[i]=roof?2:1;
      if(roof) { mesh.l1Type[i]=2;mesh.l1TopZ[i]=4;mesh.l2Type[i]=4;mesh.l2TopZ[i]=5;mesh.l2Meta[i]=3; }
    }
    G.floorMesh=mesh; G.viewDist=500; G.shopMarker=null; G.fortressAllies=[];
    G.enemySpawners=[]; G.enemies=[]; G.treasureChests=[]; G.nearestOpenChest=null;
    G.NOCLIP=false; G.goalSpawned=true; G.health=100; G.dashUntil=0; G.wardActive=false;
    G.armorBoostUntil=0; G.coins=0; G.equipment={armor:null,hat:null,robes:null,boots:null,relic:null};
    G.deepCaveRegions=[]; G.deepCaveEntrances=[]; G.jumpAirborne=false; G.jumpVelZ=0;
    clock+=2000;
  }
  function chest(cave) {
    var ch={x:80,y:66,gold:17,collected:false,opened:false,lidAngle:0,caveSpawnId:cave?'fixture:chest':null};
    G.treasureChests=[ch]; return ch;
  }
  function enemy(x,cave,type) {
    var t=G.enemyTypes[type||'normal'];
    var e={x:x,y:66,z:0,underground:!!cave,caveSpawnId:cave?'fixture:enemy':null,
      enemyType:t,health:t.health,maxHealth:t.health,speed:t.speed,chaseRange:t.chaseRange,
      lastUpdate:clock-100,damageFlash:0,vx:0,vy:0,aggroAt:0,attackState:'idle',attackStateUntil:0,
      patrolWaypoints:[{x:x,y:66}],patrolIdx:0};
    G.enemies=[e]; return e;
  }
  function strike(e) {
    G.updateEnemies(1/60); var windup=e.attackState;
    clock+=e.enemyType.attackWindup+1; G.updateEnemies(1/60);
    return windup;
  }
  [false,true].forEach(function(mode){
    var label=(mode?'3D':'2D')+' ';
    authored(false,mode); player(30,66,0); var ch=chest(false);
    G.updateTreasureChests();
    check(label+'reachable chest is offered',G.nearestOpenChest===ch&&ch.opened);
    G.collectChest(ch); G.collectChest(ch);
    check(label+'reachable chest pays exactly once',ch.collected&&G.coins===17);
    ch=chest(false); G.updateTreasureChests();
    check(label+'stale-target setup has an offered chest',G.nearestOpenChest===ch&&!ch.collected);
    player(200,66,0); G.collectChest(G.nearestOpenChest);
    check(label+'stale chest target cannot pay after player moves',!ch.collected&&G.coins===17);
    G.treasureChests=[]; G.updateTreasureChests();
    check(label+'empty chest list clears previous target',G.nearestOpenChest===null);

    authored(false,mode); player(30,66,0); ch=chest(false); G.updateTreasureChests();
    var offered=G.nearestOpenChest===ch, replacement={};
    Object.keys(ch).forEach(function(k){replacement[k]=ch[k];});
    G.treasureChests=[replacement]; G.collectChest(ch);
    check(label+'obsolete window chest cannot pay at identical local coordinates',
      offered&&!ch.collected&&!replacement.collected&&G.coins===0);
    G.updateTreasureChests(); G.collectChest(G.nearestOpenChest);
    check(label+'current window replacement chest remains collectible',
      G.nearestOpenChest===replacement&&replacement.collected&&G.coins===17);

    authored(true,mode); player(30,66,5); ch=chest(true);
    check(label+'roof fixture has separate authored storeys',G.floorMesh.l1TopZ[0]===4&&G.floorMesh.l2TopZ[0]===5);
    G.updateTreasureChests();
    check(label+'roof-separated chest is not offered',G.nearestOpenChest===null&&!ch.opened);
    G.collectChest(ch);
    check(label+'roof-separated chest cannot pay',!ch.collected&&G.coins===0);
    player(30,66,0); G.updateTreasureChests(); G.collectChest(ch);
    check(label+'same cave chest pays from cave floor',ch.collected&&G.coins===17);

    authored(false,mode); player(30,66,0); ch=chest(false);
    G.grid[4*16+4]=1; G.updateTreasureChests(); G.collectChest(ch);
    check(label+'wall-separated chest is neither offered nor paid',G.nearestOpenChest===null&&!ch.opened&&!ch.collected&&G.coins===0);
    G.grid[4*16+4]=0; G.updateTreasureChests(); G.collectChest(ch);
    check(label+'opening wall restores same chest interaction immediately',ch.collected&&G.coins===17);

    authored(true,mode); player(110,66,0); var e=enemy(40,true);
    G.updateEnemies(1/60);
    check(label+'cave enemy chases visible same-floor player',e.aggroAt>0&&e.x>40);
    authored(true,mode); player(110,66,5); e=enemy(40,true);
    G.updateEnemies(1/60);
    check(label+'cave enemy does not chase through roof',e.aggroAt===0&&e.x===40);
    authored(true,mode); player(110,66,0); e=enemy(40,false);
    G.updateEnemies(1/60);
    check(label+'surface enemy does not chase player under roof',e.aggroAt===0&&e.x===40);
    authored(true,mode); player(110,66,5); e=enemy(40,false);
    G.updateEnemies(1/60);
    check(label+'surface enemy repairs stale z zero and chases on actual cap',e.z===125&&e.feetZ===125&&e.aggroAt>0&&e.x>40);
    authored(false,mode); player(110,66,0); e=enemy(40,false); G.grid[4*16+4]=1;
    G.updateEnemies(1/60);
    check(label+'wall prevents enemy chase',e.aggroAt===0&&e.x===40);
    G.grid[4*16+4]=0; clock+=100; G.updateEnemies(1/60);
    check(label+'opening wall restores enemy chase immediately',e.aggroAt>0&&e.x>40);

    authored(true,mode); player(68,66,0); e=enemy(60,true);
    check(label+'same-floor melee winds up and damages',strike(e)==='windup'&&G.health===85);
    authored(true,mode); player(68,66,5); e=enemy(60,true);
    check(label+'roof blocks melee despite close XY',strike(e)==='idle'&&G.health===100);
    authored(true,mode); player(68,66,0); e=enemy(60,true);
    G.updateEnemies(1/60);
    check(label+'stored strike fixture targets player before ally arrives',e.attackState==='windup'&&e._attackTarget===null);
    var ally={x:61,y:66,feetZ:0,health:100}; G.fortressAllies=[ally];
    player(68,66,5); clock+=e.enemyType.attackWindup+1; G.updateEnemies(1/60);
    check(label+'new closer ally cannot authorize stored player strike through roof',
      G.npcTargetValid(e,ally,24,true)&&G.health===100&&ally.health===100);
    authored(true,mode); player(68,66,0); e=enemy(60,true);
    G.updateEnemies(1/60); G.fortressAllies=[{x:61,y:66,feetZ:0,health:100}];
    clock+=e.enemyType.attackWindup+1; G.updateEnemies(1/60);
    check(label+'stored player strike still lands on same floor with new ally',G.health===85&&G.fortressAllies[0].health===100);
    authored(false,mode); player(76,66,0); e=enemy(59,false,'tank'); G.grid[4*16+4]=1;
    check(label+'wall melee fixture is within authored attack radius',76-59<6+8*e.enemyType.size);
    check(label+'wall blocks melee despite attack-range proximity',strike(e)==='idle'&&G.health===100);
    // A changed wall becomes visible on the next scheduled perception update.
    G.grid[4*16+4]=0; e.attackState='idle'; clock+=100;
    check(label+'removing wall restores actual melee damage',strike(e)==='windup'&&G.health===75);
  });

  // The authored fixture intentionally used a different collision-grid size.
  // Restore the real generator's configuration before inspecting real worlds.
  G.cell=G.GAME_CONFIG.world.cellSize;

  // Sample actual authored stratum heights, not the query's predicted answer.
  // Limit slope in the fixture so a cell's floor sample is a valid standing
  // position while the production sampler still performs its real interpolation.
  function candidate(ch) {
    var m=G.floorMesh,gx=Math.floor(ch.x/m.gridSize),gy=Math.floor(ch.y/m.gridSize);
    if(gx<1||gy<1||gx>=m.w-2||gy>=m.h-2) return null;
    var base=gy*m.w+gx, lows=[],caps=[],ceilings=[];
    [base,base+1,base+m.w,base+m.w+1].forEach(function(ci){
      var low=Infinity,cap=-Infinity,ceil=Infinity;
      for(var li=0;li<m.layerCount[ci];li++) {
        var t=m['l'+li+'Type'][ci],z=m['l'+li+'TopZ'][ci];
        if(t===1||t===3||t===4)low=Math.min(low,z);
        if(t===4)cap=Math.max(cap,z);
        if(t===2)ceil=Math.min(ceil,z);
      }
      lows.push(low);caps.push(cap);ceilings.push(ceil);
    });
    if(!lows.concat(caps,ceilings).every(Number.isFinite))return null;
    if(Math.max.apply(null,lows)-Math.min.apply(null,lows)>.5||
       Math.max.apply(null,caps)-Math.min.apply(null,caps)>.5||
       Math.min.apply(null,ceilings)-Math.max.apply(null,lows)<3||
       Math.min.apply(null,caps)-Math.max.apply(null,lows)<4) return null;
    if(G.grid[Math.floor(ch.y/G.cell)*G.gridW+Math.floor(ch.x/G.cell)])return null;
    return {ch:ch,floor:lows[0],cap:caps[0]};
  }
  [12345,424242].forEach(function(seed){
    G._caveTestSeedOverride=seed; G._caveTestKindOverride='descending';
    G.CAVE_TEST_MODE=true; G.ENDLESS_MODE=true; G.running=true; G.gameOverState=false; G.terrain='plains';
    Object.keys(G.caveTestFlags).forEach(function(k){G.caveTestFlags[k]=k==='caveChests';});
    G.resetEndlessMode();
    var samples=G.treasureChests.filter(function(ch){return !!ch.caveSpawnId&&!ch.collected&&ch.gold>0;})
      .map(candidate).filter(function(s){return !!s;});
    check('seed '+seed+' has a real supported cave chest beneath roof',samples.length>0,'samples='+samples.length);
    var sample=samples[0],original=sample.ch;
    [false,true].forEach(function(mode){
      G.MODE3D=mode; G.coins=0; var ch={}; Object.keys(original).forEach(function(k){ch[k]=original[k];});
      G.treasureChests=[ch]; player(ch.x,ch.y,sample.cap); G.updateTreasureChests(); G.collectChest(ch);
      var label='seed '+seed+' '+(mode?'3D':'2D')+' '+ch.caveSpawnId+' ';
      check(label+'roof blocks actual generated chest',G.nearestOpenChest===null&&!ch.collected&&G.coins===0);
      player(ch.x,ch.y,sample.floor); G.updateTreasureChests();
      check(label+'cave floor offers actual generated chest',G.nearestOpenChest===ch&&ch.opened);
      G.collectChest(ch); G.collectChest(ch);
      check(label+'actual generated reward pays once',ch.collected&&G.coins===original.gold);
    });
  });

  // Real hillside regression: the ordinary wall top is below its ceiling
  // closure. A ray across that extra visible face used to pass through it.
  // These raw authored endpoint values are independent of spatial query
  // helpers, so deleting the closure check cannot change the expected result.
  G._caveTestSeedOverride=5668; G._caveTestKindOverride='hillside';
  G.CAVE_TEST_MODE=true; G.ENDLESS_MODE=true; G.running=true; G.gameOverState=false; G.terrain='plains';
  Object.keys(G.caveTestFlags).forEach(function(k){G.caveTestFlags[k]=false;});
  G.resetEndlessMode();
  var closureCell=162*G.gridW+193;
  check('seed 5668 has the exposed regression wall face',G.cell===12&&
    G.grid[closureCell]===1&&G.grid[closureCell-1]===0);
  function authoredHeightsAt(x,y) {
    var m=G.floorMesh,ci=Math.floor(y/m.gridSize)*m.w+Math.floor(x/m.gridSize);
    var ceiling=Infinity,cap=-Infinity;
    for(var li=0;li<m.layerCount[ci];li++) {
      var type=m['l'+li+'Type'][ci],height=m['l'+li+'TopZ'][ci]*25;
      if(type===2)ceiling=Math.min(ceiling,height);
      if(type===4)cap=Math.max(cap,height);
    }
    return {ceiling:ceiling,cap:cap};
  }
  var endA=authoredHeightsAt(2316,1944),endB=authoredHeightsAt(2316,1956);
  var boxTop=G.wallMaxTopZ[closureCell]*25;
  check('seed 5668 closure rises above wall box with real roof cover',
    Math.abs(boxTop-11.224783957004547)<0.00001&&
    Math.abs(endA.ceiling-70.4515278339386)<0.00001&&
    Math.abs(endB.ceiling-70.4515278339386)<0.00001&&
    Math.abs(endA.cap-95.4515278339386)<0.00001&&
    Math.abs(endB.cap-95.4515278339386)<0.00001,
    JSON.stringify({boxTop:boxTop,endA:endA,endB:endB}));
  [false,true].forEach(function(mode){
    G.MODE3D=mode;
    var label='seed 5668 '+(mode?'3D':'2D')+' ';
    var above=G.spatialRaycast({x:2315,y:1950,z:106},{x:2317,y:1950,z:106});
    check(label+'same crossing above closure and roof stays clear',above.status==='clear',JSON.stringify(above));
    var mid=(boxTop+endA.ceiling)/2;
    var hit=G.spatialRaycast({x:2315,y:1950,z:mid},{x:2317,y:1950,z:mid});
    check(label+'generated wall closure blocks at the actual face',hit.status==='blocked'&&
      hit.kind==='wall'&&Math.abs(hit.t-0.5)<0.000001&&hit.point&&hit.point.x===2316,JSON.stringify(hit));
  });
  check('production setup reports no swallowed errors',errors.length===0,errors.join(';'));
  output('SPATIAL_CONSUMERS_RESULT PASS '+checked);
}());
undefined;
