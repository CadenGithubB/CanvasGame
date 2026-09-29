// Market stalls and the guard tower on real Endless terrain. Their visibility
// call used to ask about world height 0: stalls and tower vanished on ground
// above ~1.6 mesh units ("below floor") and on low ground (surface/underground
// cull), while nothing but the legacy column gate hid them behind terrain.
// Restated in stage J1: the same checks run on both paths. Without flags the
// legacy painters run (landmarkModels off, explicitly); --models runs the
// landmark models (12-prop-models.js), judged by their depth-tested faces
// (the slab, the awning, any tower face) instead of the painter's fill
// colours, standing on getEntityRenderFloorZ. --literal-zero-tower restores
// only the tower's call: the audit lab's _SHOP_ZERO reintroduction probe.
(function () {
  var G=(0,eval)('this'), checked=0, errors=[], fillLog=null, projLog=null, clipLog=null, path=[];
  var output=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
  function noop() {}
  function stub(values) {return new Proxy(values||{}, {get:function(o,k){return k==='then'?undefined:k in o?o[k]:noop;}});}
  // Canvas ignores moveTo/lineTo with a non-finite coordinate, so such a path
  // fills nothing. Only a fill whose path kept three finite points is paint.
  function pathPoint(x,y){if(isFinite(x)&&isFinite(y))path.push([x,y]);}
  function recordFill(){if(fillLog&&path.length>=3)fillLog.push(context.fillStyle);}
  function gradient(){return {addColorStop:noop};}
  var context=stub({save:noop,restore:noop,beginPath:function(){path=[];},moveTo:pathPoint,lineTo:pathPoint,fill:recordFill,
    stroke:noop,fillRect:noop,strokeRect:noop,fillText:noop,drawImage:noop,
    measureText:function(s){return {width:String(s).length*8};},
    createLinearGradient:gradient,createRadialGradient:gradient,createPattern:function(){return {};},
    createImageData:function(w,h){return {data:new Uint8ClampedArray(w*h*4)};},
    getImageData:function(x,y,w,h){return {data:new Uint8ClampedArray(w*h*4)};}});
  function canvas(){return stub({width:360,height:240,style:{},getContext:function(){return context;},
    getBoundingClientRect:function(){return {left:0,top:0,width:360,height:240};}});}
  var elements={maze:canvas()};
  function element(id){return elements[id]||(elements[id]=stub({id:id,checked:false,value:'',textContent:'',style:{},classList:stub(),dataset:{}}));}
  G.window=G;G.document=stub({getElementById:element,querySelectorAll:function(){return [];},querySelector:function(){return null;},
    createElement:function(tag){return tag==='canvas'?canvas():stub({style:{}});},body:stub({style:{}}),documentElement:stub({style:{}})});
  G.console={log:noop,info:noop,warn:noop,error:function(){errors.push(Array.prototype.join.call(arguments,' '));}};
  G.setTimeout=G.setInterval=G.requestAnimationFrame=function(){return 1;};
  G.clearTimeout=G.clearInterval=G.cancelAnimationFrame=G.addEventListener=G.removeEventListener=noop;
  G.innerWidth=1280;G.innerHeight=720;G.devicePixelRatio=1;
  G.hw={fetchJSON:function(){return new Promise(noop);},postFormText:function(){return new Promise(noop);},_auth401:noop};
  // Exact-once mutations of an evaluated copy restore the historical literal
  // world-Z 0 calls, with their legacy column/hill gates, at both call sites.
  var MODELS=__argv.indexOf('--models')>=0;
  function mutate(path,source){
    var market=__argv.indexOf('--literal-zero-market')>=0,tower=__argv.indexOf('--literal-zero-tower')>=0;
    if((!market&&!tower)||path!=='src/15-render-hud-menu.js')return source;
    var stallEdit=['    var _sv = entityVisible3D(_ss.x, _ss.y, _ssZ, C, {maxDist: viewDist * 0.8, sceneDepth: true, fadeFraction: 0.8});\n',
       '    var _sv = entityVisible3D(_ss.x, _ss.y, 0, C, {maxDist: viewDist * 0.8, depthOffset: 5, checkMidpoint: true, fadeFraction: 0.8});\n'];
    var towerEdit=['  var towerVis = entityVisible3D(shopMarker.x, shopMarker.y, bgz, C, {maxDist: 900, sceneDepth: true, fadeFraction: 0.8});\n',
       '  var towerVis = entityVisible3D(shopMarker.x, shopMarker.y, 0, C, {maxDist: 900, depthOffset: 5, checkMidpoint: true, fadeFraction: 0.8});\n'];
    var edits=market?[stallEdit,towerEdit]:[towerEdit];
    edits.forEach(function(e){
      if(source.split(e[0]).length!==2)throw Error('MUTATION_ANCHOR '+(market?'--literal-zero-market':'--literal-zero-tower'));
      source=source.replace(e[0],e[1]);
    });
    return source;
  }
  JSON.parse(slurp('assets/games/manifest.json')).parts.MAIN.forEach(function(path){(0,eval)(mutate(path,slurp('assets/games/'+path)));});
  function check(name,okay){if(!okay)throw Error(name);checked++;output('PASS '+name);}

  fillLog=[];
  context.fillStyle='#010203';context.beginPath();context.moveTo(0,0);context.lineTo(4,0);context.lineTo(0,4);context.fill();
  context.fillStyle='#040506';context.beginPath();context.moveTo(NaN,0);context.lineTo(4,NaN);context.lineTo(NaN,NaN);context.fill();
  check('recording canvas paints a finite path and, like Canvas, nothing for non-finite points',
    fillLog.length===1&&fillLog[0]==='#010203');
  fillLog=null;

  var originalProj=G.projToScreen,originalClip=G.withSceneDepthClip,originalWorld=G.projectSceneWorldPolygon,originalFill=G.fillSceneDepthPolygon;
  // Model faces: the world z range of the face projectSceneWorldPolygon last
  // took, paired with its depth-tested fill's visible pixels.
  var faceLog=null,faceZ=null;
  G.projectSceneWorldPolygon=function(vertices,C){
    if(faceLog){faceZ={lo:Infinity,hi:-Infinity};vertices.forEach(function(p){faceZ.lo=Math.min(faceZ.lo,p.z);faceZ.hi=Math.max(faceZ.hi,p.z);});}
    return originalWorld(vertices,C);
  };
  G.fillSceneDepthPolygon=function(points){
    var r=originalFill(points);
    if(faceLog&&faceZ)faceLog.push({lo:faceZ.lo,hi:faceZ.hi,visible:r});
    return r;
  };
  G.projToScreen=function(wx,wy,wz,C){var r=originalProj(wx,wy,wz,C);if(projLog)projLog.push({x:wx,y:wy,z:wz});return r;};
  G.withSceneDepthClip=function(points,draw,options){
    var result=originalClip(points,draw,options);
    if(clipLog)clipLog.push({result:result,hidden:G._sceneDepthClipHidden});
    return result;
  };

  // A real surface world. Stall records are authored; terrain, projection,
  // scene depth and both draw passes are production code.
  G.MODE3D=true;G.viewDist=1000;G.projScale=180;
  G.cam={x:0,y:0,z:60,ang:0,pitch:0,fov:Math.PI/2};
  G._caveTestSeedOverride=777;G._caveTestKindOverride='descending';
  G.CAVE_TEST_MODE=true;G.running=true;G.gameOverState=false;
  Object.keys(G.caveTestFlags).forEach(function(k){G.caveTestFlags[k]=false;});
  G.resetEndlessMode();
  G.applyRenderPreset('recommended');G.setRenderFeatures({landmarkModels:MODELS});
  var mesh=G.floorMesh;
  // Open surface: a single plain ground layer (no ceiling or cave cap) under
  // an empty wall cell, the same open-site rule the render lab uses.
  function openAt(x,y){
    if(!mesh)return null;
    var gx=Math.floor(x/mesh.gridSize),gy=Math.floor(y/mesh.gridSize);
    if(gx<0||gy<0||gx>=mesh.w||gy>=mesh.h)return null;
    var ci=gy*mesh.w+gx,wx=Math.floor(x/G.cell),wy=Math.floor(y/G.cell);
    if(mesh.layerCount[ci]!==1||mesh.l0Type[ci]!==1)return null;
    if(wx<0||wy<0||wx>=G.gridW||wy>=G.gridH||G.grid[wy*G.gridW+wx])return null;
    return mesh.l0TopZ[ci];
  }
  var sites={low:null,mid:null,high:null},margin=Math.ceil(100/mesh.gridSize);
  for(var gy=margin;gy<mesh.h-margin;gy++)for(var gx=margin;gx<mesh.w-margin;gx++){
    var x=(gx+0.5)*mesh.gridSize,y=(gy+0.5)*mesh.gridSize,h=openAt(x,y);
    if(h===null)continue;
    var band=h<-0.25?'low':h>1.8?'high':(h>=0.1&&h<=0.9?'mid':null);
    if(!band||sites[band])continue;
    // A shopper's open standing spot 60 units away, looking at the site.
    for(var q=0;q<16;q++){
      var a=q*Math.PI/8,cx=x-60*Math.cos(a),cy=y-60*Math.sin(a),ch=openAt(cx,cy);
      if(ch!==null){sites[band]={x:x,y:y,h:h,cam:{x:cx,y:cy,h:ch,a:a}};break;}
    }
  }
  check('seed 777 offers open surface market sites at low, ordinary and high terrain with a shopper spot',
    !G.playerUnderground&&!!sites.low&&!!sites.mid&&!!sites.high);

  var TABLE_TOP='#7a5030',AWNING='#cc3333',TOWER=['#9b8b7b','#6b5d4b','#8b7d6b'];
  function view(site,occluderTop){
    var c=site.cam;
    G.cam={x:c.x,y:c.y,z:60+40*c.h,ang:c.a,pitch:(60+25*c.h-site.h*25-10)/60,fov:Math.PI/2};
    G.depthBuffer=new Float32Array(360).fill(Infinity);G.playerUnderground=false;
    G.beginSceneDepthFrame(360,240);G.beginRenderFrameStats();
    if(occluderTop!==undefined)G.writeSceneDepthPolygon([{x:0,y:occluderTop,depth:5},{x:360,y:occluderTop,depth:5},
      {x:360,y:240,depth:5},{x:0,y:240,depth:5}]);
  }
  function record(draw){
    fillLog=[];projLog=[];clipLog=[];faceLog=[];faceZ=null;
    try{draw();}finally{var out={fills:fillLog,points:projLog,clips:clipLog,faces:faceLog,stats:G.getRenderFeatureStats().frame};
      fillLog=projLog=clipLog=faceLog=null;}
    return out;
  }
  function drawStallAt(site,occluderTop){
    view(site,occluderTop);
    var marker=G.shopMarker,stalls=G.marketStalls;
    G.shopMarker=null;G.marketStalls=[{x:site.x,y:site.y,facing:0,stallType:'weapons'}];
    try{return record(G.drawMarketStalls3D);}finally{G.shopMarker=marker;G.marketStalls=stalls;}
  }
  function drawTowerAt(site,occluderTop){
    view(site,occluderTop);
    var marker=G.shopMarker,stalls=G.marketStalls;
    // The pass needs a non-empty stall list; this one is far out of range.
    G.shopMarker={x:site.x,y:site.y};G.marketStalls=[{x:-1e6,y:-1e6,facing:0,stallType:'weapons'}];
    try{return record(G.drawMarketStalls3D);}finally{G.shopMarker=marker;G.marketStalls=stalls;}
  }
  // Model faces relative to the stall's support: the slab spans 16-18 and
  // the awning 38-44 above it.
  function faceSeen(r,ground,lo,hi){return r.faces.some(function(f){return f.visible>0&&f.lo>=ground+lo-1e-6&&f.hi<=ground+hi+1e-6;});}
  function stallPainted(r,site){
    if(!MODELS)return r.fills.indexOf(TABLE_TOP)>=0&&r.fills.indexOf(AWNING)>=0;
    var ground=G.getEntityRenderFloorZ({x:site.x,y:site.y});
    return faceSeen(r,ground,16,18)&&faceSeen(r,ground,38,44);
  }
  function towerPainted(r){return MODELS?(r.stats.mdlTowerDrawn||0)>0:TOWER.some(function(c){return r.fills.indexOf(c)>=0;});}
  var bands=['low','mid','high'],stalls={},towers={};
  bands.forEach(function(b){stalls[b]=drawStallAt(sites[b]);towers[b]=drawTowerAt(sites[b]);});

  check('a market stall on ordinary terrain is drawn for a shopper facing it',stallPainted(stalls.mid,sites.mid));
  check('a market stall on low terrain is drawn for a shopper facing it',stallPainted(stalls.low,sites.low));
  check('a market stall on high terrain is drawn for a shopper facing it',stallPainted(stalls.high,sites.high));
  check('the guard tower is drawn on low, ordinary and high terrain',bands.every(function(b){return towerPainted(towers[b]);}));
  // The legacy drawing is unchanged: its ground corners sit on the terrain it
  // samples, not at world height 0. The models stand on the terrain surface
  // at their centre (getEntityRenderFloorZ); these open sites have one layer.
  check('drawn stalls and tower stand on their sampled terrain height',bands.every(function(b){
    function base(points){var z=Infinity;points.forEach(function(p){z=Math.min(z,p.z);});return z;}
    if(MODELS){
      var support=G.getEntityRenderFloorZ({x:sites[b].x,y:sites[b].y}),fs=stalls[b].faces,ft=towers[b].faces;
      function low(faces){var z=Infinity;faces.forEach(function(f){z=Math.min(z,f.lo);});return z;}
      return fs.length>0&&ft.length>0&&Number.isFinite(support)&&Math.abs(low(fs)-support)<1e-9&&Math.abs(low(ft)-support)<1e-9;
    }
    var ground=G.getFloorHeightAt(sites[b].x,sites[b].y)*25,s=stalls[b].points,t=towers[b].points;
    return s.length>0&&t.length>0&&Math.abs(base(s)-ground)<1e-9&&Math.abs(base(t)-ground)<1e-9;
  }));

  // Covered negative control: opaque terrain nearer than the whole stall.
  check('opaque terrain in front hides every stall and tower part at every height',bands.every(function(b){
    var s=drawStallAt(sites[b],0),t=drawTowerAt(sites[b],0);
    if(MODELS)return !s.faces.some(function(f){return f.visible>0;})&&!towerPainted(t)&&(s.stats.mdlStallDrawn||0)===0&&
      (s.stats.mdlStallFaces||0)+(s.stats.mdlStallRejected||0)>0&&(t.stats.mdlTowerFaces||0)+(t.stats.mdlTowerRejected||0)>0;
    return s.fills.length===0&&!towerPainted(t)&&s.clips.length>0&&t.clips.length>0;
  }));
  // Partial cover: a bank below the table top hides the lower stall per pixel
  // but leaves the raised awning, instead of hiding or showing all of it.
  var mid=sites.mid;view(mid);
  var awningP=originalProj(mid.x,mid.y,G.getFloorHeightAt(mid.x,mid.y)*25+18,G.getCam3D());
  var partial=drawStallAt(mid,awningP?awningP.sy:240);
  var midGround=G.getEntityRenderFloorZ({x:mid.x,y:mid.y});
  check('a bank hiding the lower stall still leaves its awning drawn',MODELS?
    !!awningP&&faceSeen(partial,midGround,38,44)&&partial.faces.some(function(f){return f.visible===0&&f.hi<=midGround+18+1e-6;}):
    !!awningP&&partial.clips.some(function(c){return c.result>0&&c.hidden>0;})&&partial.fills.indexOf(AWNING)>=0);

  check('actual generator and market renderer report no swallowed errors',errors.length===0);
  output('STALL_VISIBILITY_RESULT PASS '+checked);
}());
undefined;
