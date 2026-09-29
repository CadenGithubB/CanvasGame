// Guaranteed-market stalls: the real injection path, window assembly and the
// production stall renderer. A compass-string facing used to reach Math.cos
// in both the renderer and stall collision, so the stalls vanished silently.
(function () {
  var G=(0,eval)('this'), checked=0, errors=[], fillLog=null, projLog=null, path=[];
  var output=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
  function noop() {}
  function stub(values) {return new Proxy(values||{}, {get:function(o,k){return k==='then'?undefined:k in o?o[k]:noop;}});}
  // Canvas ignores moveTo/lineTo with a non-finite coordinate, so such a path
  // fills nothing. Only a fill whose path kept three finite points is paint.
  function pathPoint(x,y){if(isFinite(x)&&isFinite(y))path.push([x,y]);}
  function recordFill(){if(fillLog&&path.length>=3)fillLog.push(context.fillStyle);}
  function gradient(){return {addColorStop:noop};}
  var context=stub({save:noop,restore:noop,beginPath:function(){path=[];},moveTo:pathPoint,lineTo:pathPoint,fill:recordFill,stroke:noop,fillRect:noop,strokeRect:noop,fillText:noop,drawImage:noop,
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
  // Exact-once mutation of an evaluated copy restores the historical injection
  // (compass strings plus an 'armor' stall with no authored awning colour).
  function mutate(path,source){
    if(__argv.indexOf('--legacy-injected-market')<0||path!=='src/05-endless-world.js')return source;
    var before="        var _stallOffsets = [{dx:-2,dy:-2,facing:Math.PI*0.25},{dx:2,dy:-2,facing:Math.PI*0.75},{dx:-2,dy:2,facing:-Math.PI*0.25},{dx:2,dy:2,facing:-Math.PI*0.75}];\n"+
      "        var _stallTypes = ['weapons','potions','scrolls','trinkets'];\n";
    if(source.split(before).length!==2)throw Error('MUTATION_ANCHOR --legacy-injected-market');
    return source.replace(before,"        var _stallOffsets = [{dx:-2,dy:-2,facing:'se'},{dx:2,dy:-2,facing:'sw'},{dx:-2,dy:2,facing:'ne'},{dx:2,dy:2,facing:'nw'}];\n"+
      "        var _stallTypes = ['weapons','potions','armor','scrolls'];\n");
  }
  JSON.parse(slurp('assets/games/manifest.json')).parts.MAIN.forEach(function(path){(0,eval)(mutate(path,slurp('assets/games/'+path)));});
  function check(name,okay){if(!okay)throw Error(name);checked++;output('PASS '+name);}
  function finite(v){return typeof v==='number'&&isFinite(v);}
  fillLog=[];
  context.fillStyle='#010203';context.beginPath();context.moveTo(0,0);context.lineTo(4,0);context.lineTo(0,4);context.fill();
  context.fillStyle='#040506';context.beginPath();context.moveTo(NaN,0);context.lineTo(4,NaN);context.lineTo(NaN,NaN);context.fill();
  check('recording canvas paints a finite path and, like Canvas, nothing for non-finite points',
    fillLog.length===1&&fillLog[0]==='#010203');
  fillLog=null;

  G.MODE3D=true;G.viewDist=1000;G.ambientLight=1;G.projScale=180;
  G.cam={x:0,y:0,z:60,ang:0,pitch:0,fov:Math.PI/2};
  G._caveTestSeedOverride=12345;G._caveTestKindOverride='descending';
  G.CAVE_TEST_MODE=true;G.running=true;G.gameOverState=false;
  // With natural markets disabled, a market can only come from the guarantee.
  Object.keys(G.caveTestFlags).forEach(function(k){G.caveTestFlags[k]=false;});
  G.resetEndlessMode();
  var marketKeys=Object.keys(G.chunks).filter(function(k){return !!G.chunks[k].market;});
  var market=marketKeys.length===1?G.chunks[marketKeys[0]].market:null;
  check('markets-disabled world receives exactly one guaranteed four-stall market',
    market!==null&&market.stalls.length===4&&G.marketStalls.length===4&&!!G.shopMarker);

  check('guaranteed market chunk records store finite world-angle facings',
    market.stalls.every(function(s){return finite(s.facing);}));
  // Oracle: authored positions only. Facing is a world angle whose front is
  // (cos, sin), the convention drawMarketStalls3D and repelFromStalls both use.
  check('guaranteed market stalls open toward the market centre',market.stalls.every(function(s){
    var vx=market.centerX-s.x,vy=market.centerY-s.y,len=Math.hypot(vx,vy);
    return finite(s.facing)&&len>0&&(Math.cos(s.facing)*vx+Math.sin(s.facing)*vy)/len>0.999;
  }));
  check('assembled window stalls reach renderer and collision with finite facings',
    G.marketStalls.every(function(s){return finite(s.facing);}));

  var originalProj=G.projToScreen;
  G.projToScreen=function(wx,wy,wz,C){var r=originalProj(wx,wy,wz,C);if(projLog)projLog.push({x:wx,y:wy,z:wz,r:r});return r;};
  // Draw one stall from the market centre, where a shopper stands. The guard
  // tower is suppressed so every recorded fill belongs to the stall itself.
  // The draw uses authored flat ground: the stall pass asks entityVisible3D
  // about world Z 0, which culls stalls on ground above 1.6 mesh units (the
  // same literal-zero defect the render lab records for the guard tower).
  // This isolates facing-to-corner math from that separate visibility defect.
  function drawStall(stall){
    var centre=G.shopMarker,saved=G.marketStalls,mesh=G.floorMesh;
    G.shopMarker=null;G.marketStalls=[stall];G.floorMesh=null;
    G.cam.x=centre.x;G.cam.y=centre.y;G.cam.ang=Math.atan2(stall.y-centre.y,stall.x-centre.x);
    G.cam.z=60;G.playerUnderground=false;
    G.depthBuffer=new Float32Array(360).fill(Infinity);
    G.beginSceneDepthFrame(360,240);fillLog=[];projLog=[];
    try{G.drawMarketStalls3D();}finally{G.shopMarker=centre;G.marketStalls=saved;G.floorMesh=mesh;}
    var out={fills:fillLog,points:projLog};fillLog=projLog=null;return out;
  }
  var TABLE_TOP='#7a5030',AWNING_FALLBACK='#886633';
  var drawn=G.marketStalls.map(drawStall);
  check('every guaranteed stall projects finite table and awning corners',drawn.every(function(d){
    return d.points.length>=14&&d.points.every(function(p){return p.r&&finite(p.r.sx)&&finite(p.r.sy)&&finite(p.r.fwd);});
  }));
  check('every guaranteed stall paints its table top and awning',drawn.every(function(d){
    return d.fills.length>=2&&d.fills.indexOf(TABLE_TOP)>=0;
  }));
  var awnings=drawn.map(function(d){return d.fills.filter(function(c){return c!==TABLE_TOP;})[0];});
  check('four guaranteed stalls show four authored awning colours, none the unknown-type fallback',
    awnings.every(function(c){return typeof c==='string'&&c!==AWNING_FALLBACK;})&&
    awnings.filter(function(c,i){return awnings.indexOf(c)===i;}).length===4);
  // The awning's front edge is authored 5 units below its back edge; its two
  // projected corners locate the open side the renderer actually drew.
  check('drawn awning overhangs toward the market centre',drawn.every(function(d,i){
    var s=G.marketStalls[i],top=-Infinity;
    d.points.forEach(function(p){top=Math.max(top,p.z);});
    var front=d.points.filter(function(p){return Math.abs(p.z-(top-5))<1e-6;});
    if(front.length!==2)return false;
    var mx=(front[0].x+front[1].x)/2,my=(front[0].y+front[1].y)/2,c=G.shopMarker;
    return Math.hypot(mx-c.x,my-c.y)<Math.hypot(s.x-c.x,s.y-c.y)-5;
  }));

  // Negative control: the unchanged renderer still cannot draw a raw compass
  // string. This is the mechanism that hid the old injected stalls.
  var legacy={x:G.marketStalls[0].x,y:G.marketStalls[0].y,facing:'se',stallType:G.marketStalls[0].stallType};
  var legacyDraw=drawStall(legacy);
  check('raw compass-string facing gives the stall renderer NaN corners and no paint',
    legacyDraw.fills.length===0&&legacyDraw.points.some(function(p){return p.r&&!finite(p.r.sx);}));

  var norm=typeof G.normalizeMarketStallFacing==='function'?G.normalizeMarketStallFacing:null, r2=Math.SQRT1_2;
  // Compass oracle: +x is east and +y is south, as wall decorations use
  // (north offsets y by -1). Each name must open toward its own direction.
  var compass={e:[1,0],se:[r2,r2],s:[0,1],sw:[-r2,r2],w:[-1,0],nw:[-r2,-r2],n:[0,-1],ne:[r2,-r2]};
  check('compass-string stall facings normalize to angles opening toward that compass direction',
    !!norm&&Object.keys(compass).every(function(k){var a=norm(k);
      return finite(a)&&Math.abs(Math.cos(a)-compass[k][0])<1e-9&&Math.abs(Math.sin(a)-compass[k][1])<1e-9;}));
  check('numeric stall facings pass through and unknown facings become a finite angle',
    !!norm&&norm(1.25)===1.25&&norm(-Math.PI)===-Math.PI&&[undefined,null,NaN,Infinity,'bogus',{}].every(function(v){return finite(norm(v));}));

  // Integration: a stored chunk record that still carries compass strings is
  // rebuilt into the window and must render, not vanish.
  var legacyNames=['se','sw','ne','nw'],savedFacings=market.stalls.map(function(s){return s.facing;});
  market.stalls.forEach(function(s,i){s.facing=legacyNames[i];});
  var half=Math.floor(G.WINDOW_CHUNKS/2);
  G.assembleWindow(G.windowCX+half,G.windowCY+half);
  var rebuilt=G.marketStalls.slice();
  market.stalls.forEach(function(s,i){s.facing=savedFacings[i];});
  check('legacy compass-string chunk records reassemble into drawable stalls',
    rebuilt.length===4&&rebuilt.every(function(s){return finite(s.facing);})&&
    rebuilt.map(drawStall).every(function(d){return d.fills.indexOf(TABLE_TOP)>=0;}));

  check('actual generator and renderer report no swallowed errors',errors.length===0);
  output('MARKET_STALLS_RESULT PASS '+checked);
}());
undefined;
