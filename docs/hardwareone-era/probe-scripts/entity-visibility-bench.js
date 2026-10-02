(0,eval)(slurp('tools/webui/harness/_game_env.js'));
LAB.init(__out,slurp,__engine,__argv);
if(!LAB.load(__argv[0]))throw Error(LAB.loadError);
var G=(0,eval)('this'), phase='',stat=null, realClip=G.withSceneDepthClip;
G.withSceneDepthClip=function(points,callback,options){
  if(stat){stat.clips++;if(phase==='payload')stat.payloadClips++;}
  var result=realClip(points,function(){if(stat){stat.drawCallbacks++;if(phase==='payload')stat.payloadCallbacks++;}callback();},options);
  if(stat&&!result)stat.hidden++;return result;
};
if(G.withSceneDepthBillboard){var realBillboard=G.withSceneDepthBillboard;G.withSceneDepthBillboard=function(bounds,depth,callback,opts){
  if(stat&&bounds){stat.billboards++;stat.maxBoundsArea=Math.max(stat.maxBoundsArea,bounds.width*bounds.height);
    var clippedArea=Math.max(0,Math.min(canvas.width,bounds.x+bounds.width)-Math.max(0,bounds.x))*Math.max(0,Math.min(canvas.height,bounds.y+bounds.height)-Math.max(0,bounds.y));
    stat.maxClampedBoundsArea=Math.max(stat.maxClampedBoundsArea,clippedArea);if(clippedArea>=canvas.width*canvas.height)stat.fullCanvasBounds++;}
  return realBillboard(bounds,depth,callback,opts);
};}
var originalFloor=G.getFloorHeightAt;
G.getFloorHeightAt=function(x,y){if(stat)stat.floorQueries++;return originalFloor(x,y);};
if(G.sampleEntitySupportRenderZ){var originalSupport=G.sampleEntitySupportRenderZ;G.sampleEntitySupportRenderZ=function(){if(stat)stat.supportQueries++;return originalSupport.apply(this,arguments);};}
function percentile(values,p){var sorted=values.slice().sort(function(a,b){return a-b;});return sorted[Math.ceil(p*sorted.length)-1];}
function payload(e){
  var floorZ=e.floorH*25,now=Date.now(), ca=Math.cos(e.angle),sa=Math.sin(e.angle);
  function at(along,side){return {x:e.x+ca*along-sa*side,y:e.y+sa*along+ca*side};}
  enemies=[];coinDrops=[];soulOrbs=[];arcaneTomes=[];statPickups=[];treasureChests=[];projectiles=[];impacts=[];groundEffects=[];chainEffects=[];novaEffects=[];coneEffects=[];
  floorScatter=[];companions=[];fortressAllies=[];enemySpawners=[];oreVeins=[];ambientParticles=[];
  for(var i=0;i<12;i++){
    var p=at(90-i*18,(i%3-1)*16),eType=enemyTypes[i%3===0?'tank':'normal'];
    enemies.push({x:p.x,y:p.y,z:floorZ,renderFloorZ:floorZ,underground:true,enemyType:eType,health:6,maxHealth:10,speed:eType.speed,facing:e.angle,attackState:'idle',damageFlash:0});
    coinDrops.push({x:p.x+3,y:p.y,renderFloorZ:floorZ,bob:i});
    if(i<6)soulOrbs.push({x:p.x-3,y:p.y+3,renderFloorZ:floorZ,bob:i});
    if(i<8)projectiles.push({x:p.x,y:p.y,z:floorZ+28,spellId:i%2?'ice':'missile',color:i%2?'#00ffff':'#4db6ff',lifeMs:2000,spawnMs:now-120,r:4,vx:1,vy:0});
    if(i<6)impacts.push({x:p.x,y:p.y,z:floorZ+20,color:'#ff6600',spawnMs:now-100,lifeMs:500});
  }
  for(var j=0;j<3;j++){var p=at(30-j*55,20);treasureChests.push({x:p.x,y:p.y,renderFloorZ:floorZ,caveSpawnId:'bench:'+j,tier:'rare',facing:e.angle,lidAngle:0.4,opened:true,gold:12,seed:j});
    statPickups.push({x:p.x,y:p.y-20,renderFloorZ:floorZ,type:'heartCrystal',bob:j});
    groundEffects.push({x:p.x,y:p.y-14,renderFloorZ:floorZ,underground:true,spellId:['fire','ice','poison'][j],radius:20,duration:2000,spawnMs:now-500});}
  var p=at(-40,0);arcaneTomes.push({x:p.x,y:p.y,renderFloorZ:floorZ,bob:0});
  var a=at(45,-20),b=at(-50,20);chainEffects.push({fromX:a.x,fromY:a.y,fromZ:floorZ+30,renderFloorZ:floorZ,targets:[{x:b.x,y:b.y,z:floorZ+30}],spawnMs:now-80,lifeMs:300});
  novaEffects.push({x:p.x,y:p.y,renderFloorZ:floorZ,underground:true,color:'#cc66ff',radius:50,spawnMs:now-150,lifeMs:600});
  coneEffects.push({x:a.x,y:a.y,ang:e.angle+Math.PI,halfAngle:0.25,range:60,renderFloorZ:floorZ,underground:true,spellId:'fire',spawnMs:now-70,lifeMs:300});
}
function drawPayload(){
  drawTreasureChests3D();drawEnemies3D();drawCoins3D();drawSoulOrbs3D();drawArcaneTomes3D();drawStatPickups3D();
  drawProjectiles3D();drawImpacts3D();drawGroundEffects3D();drawChainEffects3D();drawNovaEffects3D();drawConeEffects3D();
}
function paintCount(){var c=LAB.ctxCounters;return c.fill+c.stroke+c.fillRect+c.fillText+c.drawImage;}
function drawScene(){phase='terrain';beginSceneDepthFrame(canvas.width,canvas.height);drawLayersCeiling3D();drawLayersFloor3D();drawWalls3D();drawCaveEntrance3D();phase='payload';var beforePaint=stat?paintCount():0;drawPayload();if(stat)stat.payloadPaintCalls=paintCount()-beforePaint;phase='';}
var seedState=123;
Math.random=function(){seedState=(Math.imul(seedState,1664525)+1013904223)|0;return (seedState>>>0)/4294967296;};
[[12345,'descending'],[5668,'hillside']].forEach(function(fixture){
  G._caveTestKindOverride=fixture[1];LAB.startCaveTest(fixture[0]);LAB.freezeDay(0.5);
  ['mouth','roofedge'].forEach(function(view){
    G.previewCaveView(view);payload(deepCaveEntrances[0]);
    [1,2].forEach(function(scale){
      canvas.width=360*scale;canvas.height=240*scale;resScale=scale;projScale=180*scale;
      for(var warm=0;warm<12;warm++){seedState=123;drawScene();}
      var total=[],entityOnly=[];
      for(var sample=0;sample<12;sample++){seedState=123;var start=LAB.realNow();drawScene();total.push(LAB.realNow()-start);
        seedState=123;start=LAB.realNow();drawPayload();entityOnly.push(LAB.realNow()-start);}
      stat={clips:0,payloadClips:0,drawCallbacks:0,payloadCallbacks:0,payloadPaintCalls:0,hidden:0,billboards:0,maxBoundsArea:0,maxClampedBoundsArea:0,fullCanvasBounds:0,floorQueries:0,supportQueries:0};
      seedState=123;drawScene();
      LAB.out('ENTITY_BENCH '+JSON.stringify({version:__argv[1],kind:fixture[1],view:view,w:canvas.width,h:canvas.height,warmups:12,samples:12,
        totalMedianMs:percentile(total,0.5),totalP95Ms:percentile(total,0.95),payloadMedianMs:percentile(entityOnly,0.5),payloadP95Ms:percentile(entityOnly,0.95),stat:stat,errors:_ptErrors,totalSamples:total,payloadSamples:entityOnly}));stat=null;
    });
  });
});
undefined;
