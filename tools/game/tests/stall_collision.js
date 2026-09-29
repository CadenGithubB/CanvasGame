// Market stall collision must match the table the stall renderer draws, and the
// ordinary market generator must open its stalls the way its layout says. The
// collision box used to be rotated 90 degrees: players walked into the drawn
// table and bumped into invisible walls beside it.
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
  // Exact-once mutation of an evaluated copy restores the historical swapped
  // half-extents (width along the facing, depth across it).
  function mutate(path,source){
    if(__argv.indexOf('--swap-stall-extents')<0||path!=='src/09-physics.js')return source;
    var before='    var ox = hd + pr - Math.abs(lx);\n    var oy = hw + pr - Math.abs(ly);\n';
    if(source.split(before).length!==2)throw Error('MUTATION_ANCHOR --swap-stall-extents');
    return source.replace(before,'    var ox = hw + pr - Math.abs(lx);\n    var oy = hd + pr - Math.abs(ly);\n');
  }
  JSON.parse(slurp('assets/games/manifest.json')).parts.MAIN.forEach(function(path){(0,eval)(mutate(path,slurp('assets/games/'+path)));});
  function check(name,okay){if(!okay)throw Error(name);checked++;output('PASS '+name);}

  fillLog=[];
  context.fillStyle='#010203';context.beginPath();context.moveTo(0,0);context.lineTo(4,0);context.lineTo(0,4);context.fill();
  context.fillStyle='#040506';context.beginPath();context.moveTo(NaN,0);context.lineTo(4,NaN);context.lineTo(NaN,NaN);context.fill();
  check('recording canvas paints a finite path and, like Canvas, nothing for non-finite points',
    fillLog.length===1&&fillLog[0]==='#010203');
  fillLog=null;

  var TABLE_TOP='#7a5030';
  var originalProj=G.projToScreen;
  G.projToScreen=function(wx,wy,wz,C){var r=originalProj(wx,wy,wz,C);if(projLog)projLog.push({x:wx,y:wy,z:wz});return r;};
  // The independent footprint: the ground-level leg feet the renderer projects,
  // confirmed to sit under the table top it paints. Drawn on flat authored
  // ground; the stall pass culls stalls on raised terrain (a separate defect).
  function drawnTable(stall,camX,camY){
    var mesh=G.floorMesh,marker=G.shopMarker,stalls=G.marketStalls;
    G.floorMesh=null;G.shopMarker=null;G.marketStalls=[stall];G.playerUnderground=false;
    G.cam={x:camX,y:camY,z:60,ang:Math.atan2(stall.y-camY,stall.x-camX),pitch:0,fov:Math.PI/2};
    G.depthBuffer=new Float32Array(360).fill(Infinity);
    G.beginSceneDepthFrame(360,240);projLog=[];fillLog=[];
    try{G.drawMarketStalls3D();}finally{G.floorMesh=mesh;G.shopMarker=marker;G.marketStalls=stalls;}
    var pts=projLog,fills=fillLog;projLog=fillLog=null;
    var heights=pts.map(function(p){return p.z;}).filter(function(z,i,a){return z>0&&a.indexOf(z)===i;}).sort(function(a,b){return a-b;});
    var ground=pts.filter(function(p){return p.z===0;}),top=pts.filter(function(p){return p.z===heights[0];});
    var awningTop=heights[heights.length-1],front=pts.filter(function(p){return Math.abs(p.z-(awningTop-5))<1e-6;});
    var cx=0,cy=0;ground.forEach(function(p){cx+=p.x;cy+=p.y;});cx/=ground.length||1;cy/=ground.length||1;
    var poly=ground.slice().sort(function(a,b){return Math.atan2(a.y-cy,a.x-cx)-Math.atan2(b.y-cy,b.x-cx);});
    var area=0;poly.forEach(function(a,i){var b=poly[(i+1)%poly.length];area+=a.x*b.y-b.x*a.y;});
    var under=ground.length===4&&top.length===4&&ground.every(function(g){
      return top.some(function(t){return Math.abs(t.x-g.x)<1e-9&&Math.abs(t.y-g.y)<1e-9;});});
    return {poly:poly,cx:cx,cy:cy,valid:under&&Math.abs(area)/2>1&&fills.indexOf(TABLE_TOP)>=0,front:front};
  }
  function insidePoly(poly,x,y){
    var sign=0;
    for(var i=0;i<poly.length;i++){
      var a=poly[i],b=poly[(i+1)%poly.length],c=(b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);
      if(Math.abs(c)<1e-9)continue;
      if(!sign)sign=c>0?1:-1;else if((c>0?1:-1)!==sign)return false;
    }
    return true;
  }
  function edgeDistance(poly,x,y){
    var best=Infinity;
    for(var i=0;i<poly.length;i++){
      var a=poly[i],b=poly[(i+1)%poly.length],ex=b.x-a.x,ey=b.y-a.y;
      var t=Math.max(0,Math.min(1,((x-a.x)*ex+(y-a.y)*ey)/(ex*ex+ey*ey)));
      best=Math.min(best,Math.hypot(a.x+ex*t-x,a.y+ey*t-y));
    }
    return best;
  }
  function push(stall,x,y){
    var stalls=G.marketStalls;G.marketStalls=[stall];
    G.pos.x=x;G.pos.y=y;G.vel.x=G.vel.y=0;
    try{G.repelFromStalls();}finally{G.marketStalls=stalls;}
    return {moved:Math.hypot(G.pos.x-x,G.pos.y-y)>1e-6,x:G.pos.x,y:G.pos.y};
  }

  // Flat authored ground with an empty wall grid: only the stall can push.
  G.MODE3D=true;G.viewDist=1000;G.projScale=180;G.floorMesh=null;G.ENDLESS_MODE=false;G.CAVE_TEST_MODE=false;
  G.gridW=G.gridH=40;G.cell=12;G.grid=new Uint8Array(1600);G.wallHeights=new Float32Array(1600);G.worldW=G.worldH=480;
  G.pos.x=G.pos.y=0;
  var radius=G.spatialPlayerBody().radius;
  // Two edge probes per drawn edge: 94% of the way from the centre to the edge
  // midpoint (inside), and one body radius plus a unit beyond the edge (clear).
  var facings=[0,Math.PI*0.5,Math.PI*0.25,-Math.PI*0.75,2.2],tables=[],pushedIn=[],freeOut=[],clearances=[];
  facings.forEach(function(facing){
    var stall={x:240,y:240,facing:facing,stallType:'weapons'},table=drawnTable(stall,130,170);
    tables.push(table);
    if(!table.valid)return;
    table.poly.forEach(function(a,i){
      var b=table.poly[(i+1)%table.poly.length],mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
      var nx=b.y-a.y,ny=-(b.x-a.x),len=Math.hypot(nx,ny);nx/=len;ny/=len;
      if(nx*(mx-table.cx)+ny*(my-table.cy)<0){nx=-nx;ny=-ny;}
      var inX=table.cx+(mx-table.cx)*0.94,inY=table.cy+(my-table.cy)*0.94;
      var hit=push(stall,inX,inY);
      pushedIn.push(insidePoly(table.poly,inX,inY)&&hit.moved);
      clearances.push(hit.moved&&!insidePoly(table.poly,hit.x,hit.y)&&edgeDistance(table.poly,hit.x,hit.y)>=radius-1e-6);
      var outX=mx+nx*(radius+1),outY=my+ny*(radius+1);
      freeOut.push(!insidePoly(table.poly,outX,outY)&&edgeDistance(table.poly,outX,outY)>radius&&!push(stall,outX,outY).moved);
    });
  });
  check('stall renderer paints a table whose leg feet lie under its top at every tested facing',
    radius>0&&tables.every(function(t){return t.valid;}));
  check('a player just inside any edge of the drawn table is pushed out at every facing',
    pushedIn.length===facings.length*4&&pushedIn.every(Boolean));
  check('a pushed player ends outside the drawn table with its body clear of every edge',
    clearances.length===facings.length*4&&clearances.every(Boolean));
  check('a player whose body clears an edge of the drawn table is left free at every facing',
    freeOut.length===facings.length*4&&freeOut.every(Boolean));
  check('a player far from the stall is never moved',!push({x:240,y:240,facing:0.3,stallType:'weapons'},440,440).moved);

  // The ordinary generator, in a real world whose spawn window holds exactly
  // one natural market (seed 777, markets enabled, everything else disabled).
  G._caveTestSeedOverride=777;G._caveTestKindOverride='descending';
  G.CAVE_TEST_MODE=true;G.running=true;G.gameOverState=false;
  Object.keys(G.caveTestFlags).forEach(function(k){G.caveTestFlags[k]=k==='markets';});
  G.resetEndlessMode();
  var marketKeys=Object.keys(G.chunks).filter(function(k){return !!G.chunks[k].market;});
  var market=marketKeys.length===1?G.chunks[marketKeys[0]].market:null;
  check('seed 777 generates exactly one ordinary four-stall market in its window',
    market!==null&&market.stalls.length===4&&G.marketStalls.length===4&&!!G.shopMarker);
  var cell=G.cell,layout=market.stalls.map(function(s){return (s.x-market.centerX)/cell+','+(s.y-market.centerY)/cell;}).sort();
  check('ordinary market stalls keep their authored four-corner square layout',
    JSON.stringify(layout)===JSON.stringify(['-4,-3','-4,3','4,-3','4,3']));
  // The layout comments: left stalls face right, right stalls face left. With
  // front = (cos, sin), each stall must open horizontally toward the centre.
  check('ordinary market stalls open horizontally toward the market centre',
    market.stalls.every(function(s){
      return Math.cos(s.facing)*(market.centerX-s.x)>0&&Math.abs(Math.sin(s.facing))<1e-9;}));
  var centre=G.shopMarker;
  check('drawn ordinary stall awnings overhang toward the market centre',G.marketStalls.every(function(s){
    var t=drawnTable(s,centre.x,centre.y);
    if(!t.valid||t.front.length!==2)return false;
    var mx=(t.front[0].x+t.front[1].x)/2,my=(t.front[0].y+t.front[1].y)/2;
    return Math.hypot(mx-centre.x,my-centre.y)<Math.hypot(s.x-centre.x,s.y-centre.y)-5;
  }));

  check('actual generator, renderer and collision report no swallowed errors',errors.length===0);
  output('STALL_COLLISION_RESULT PASS '+checked);
}());
undefined;
