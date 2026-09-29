// Water system: solver contracts on authored terrain with independent
// expectations, then the real Endless window. No timing is asserted here.
(function () {
  var G=(0,eval)('this'),checks=0,out=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
  function check(name,ok,detail){if(!ok){if(detail!==undefined)out('DETAIL '+JSON.stringify(detail));throw Error(name);}checks++;out('PASS '+name);}
  function patch(source,from,to,flag){
    if(__argv.indexOf(flag)<0)return source;
    if(source.split(from).length!==2)throw Error('mutation anchor for '+flag+' must match exactly once');
    return source.replace(from,to);
  }
  var src=slurp('assets/games/src/06-water.js');
  src=patch(src,'if (slope > bestSlope) { bestSlope = slope; best = ni; }','if (-slope > bestSlope) { bestSlope = -slope; best = ni; }','--uphill-descent');
  src=patch(src,'if (!own && H[cell] < level) { spill = cell;','if (H[cell] < level) { spill = cell;','--spill-into-own');
  src=patch(src,'if (!own && H[cell] < level) { spill = cell;','if (!own && H[cell] <= level + 0.5) { spill = cell;','--early-spill');
  // Rivers keep the solver's surface but never shape the ground.
  src=patch(src,'if (ground !== H[q]) {','if (false) {','--no-carve');
  // Banks follow the natural ground down, with no levee holding them up.
  src=patch(src,'ground = Math.max(cut, levee);','ground = cut;','--perched-bank');
  var W=48,Hh=48;
  function field(fn){var f=G.createWaterField(W,Hh);for(var y=0;y<Hh;y++)for(var x=0;x<W;x++)f.height[y*W+x]=fn(x,y);f.surface.fill(NaN);return f;}
  function solve(f,sources){return G.solveWaterSources(f,sources,G.createWaterScratch(W*Hh));}
  function wet(f){var list=[];for(var i=0;i<W*Hh;i++)if(f.water[i])list.push(i);return list;}
  function follow(f,start,limit){ // walk the stored flow directions from a cell
    var path=[start],c=start;
    for(var k=0;k<limit;k++){var dx=Math.round(f.dirX[c]),dy=Math.round(f.dirY[c]);if(!dx&&!dy)break;
      var x=c%W+dx,y=((c/W)|0)+dy;if(x<0||y<0||x>=W||y>=Hh)break;c=y*W+x;if(!f.water[c])break;path.push(c);}
    return path;}
  try {
    (0,eval)(src);

    // 1. A plane falling to the east: one river straight downhill, off the edge.
    var plane=field(function(x,y){return 10-x*0.2+Math.sin(y*0.7)*0.01;});
    var src1=[{cell:24*W+4,strength:500}],s1=solve(plane,src1);
    var path1=follow(plane,24*W+4,200),mono=true;
    for(var i=1;i<path1.length;i++)if(plane.height[path1[i]]>plane.height[path1[i-1]])mono=false;
    check('a river on a slope only ever flows downhill',mono&&path1.length>30,{len:path1.length});
    check('a river that reaches the window edge leaves as outflow without a lake',src1[0].end==='outflow'&&s1.lake===0&&(path1[path1.length-1]%W)>=W-2);

    // 2. A bowl with one low notch on its east rim, fed from a western slope.
    // Expected lake: the cells connected to the bowl bottom that lie below
    // the notch height (a BFS on the authored heights, not the solver).
    var cx=24,cy=24,notchH=2.0;
    // Interior at most 1.8, rim 4, a western slope rising away from the rim
    // (so the spring runs into the bowl) and a low eastern plain. The notch
    // channel below is the only way out; its first cell sets the spill.
    function bowlH(x,y){var r=Math.hypot(x-cx,y-cy);if(r<10)return r*r*0.018;if(r<13)return 4;return x<cx?4+(r-13)*0.2:1.0;}
    var bowl=field(bowlH);
    // notch: an open channel through the east rim at exactly notchH, then downhill
    for(var nx=cx+10;nx<W;nx++)for(var ny=cy-1;ny<=cy+1;ny++)bowl.height[ny*W+nx]=notchH-(nx-(cx+10))*0.15;
    var src2=[{cell:cy*W+3,strength:2000}],s2=solve(bowl,src2);
    var expected={},queue=[cy*W+cx];expected[cy*W+cx]=1;
    while(queue.length){var q=queue.pop(),qx=q%W,qy=(q/W)|0;for(var k=0;k<8;k++){var dx=[1,-1,0,0,1,-1,1,-1][k],dy=[0,0,1,-1,1,1,-1,-1][k],ex=qx+dx,ey=qy+dy;
      if(ex<0||ey<0||ex>=W||ey>=Hh)continue;var e=ey*W+ex;if(expected[e]||!(bowl.height[e]<notchH-G.WATER_MIN_DEPTH))continue;expected[e]=1;queue.push(e);}}
    var lakeCells=wet(bowl).filter(function(i){return bowl.water[i]===G.WATER_KIND.still;}),flat=true,sameSet=true;
    lakeCells.forEach(function(i){if(Math.abs(bowl.surface[i]-notchH)>1e-6)flat=false;if(!expected[i])sameSet=false;});
    Object.keys(expected).forEach(function(k){if(bowl.water[+k]!==G.WATER_KIND.still)sameSet=false;});
    check('a filled basin has one flat surface at its spill height',lakeCells.length>50&&flat,{cells:lakeCells.length,surface:lakeCells.length&&bowl.surface[lakeCells[0]]});
    check('the lake covers exactly the basin cells below the spill height',sameSet,{lake:lakeCells.length,expected:Object.keys(expected).length});
    // Through the notch (its channel cells carry water) and on beyond the rim.
    var viaNotch=false,beyond=0;
    for(var sy=cy-1;sy<=cy+1;sy++)for(var sx=cx+10;sx<=cx+12;sx++)if(bowl.water[sy*W+sx])viaNotch=true;
    for(var bi=0;bi<W*Hh;bi++)if(bowl.water[bi]===G.WATER_KIND.flowing&&Math.hypot(bi%W-cx,((bi/W)|0)-cy)>=13&&bi%W>cx)beyond++;
    check('water leaves the basin through its notch and keeps flowing',viaNotch&&beyond>3&&src2[0].end==='outflow',{end:src2[0].end,beyond:beyond});

    // 3. The same bowl with a weak spring: it stops short of the rim.
    var weak=field(bowlH);for(var nx2=cx+10;nx2<W;nx2++)for(var ny2=cy-1;ny2<=cy+1;ny2++)weak.height[ny2*W+nx2]=notchH-(nx2-(cx+10))*0.15;
    var src3=[{cell:cy*W+3,strength:40}],s3=solve(weak,src3),wet3=wet(weak);
    var level3=wet3.filter(function(i){return weak.water[i]===G.WATER_KIND.still;}).map(function(i){return weak.surface[i];});
    check('a weak spring runs out of water and leaves a pond below the rim',src3[0].end==='exhausted'&&level3.length>0&&Math.max.apply(Math,level3)<notchH&&wet3.length<=40+48,{end:src3[0].end,wet:wet3.length});

    // 4. A wall across the slope with one gap: water only on open ground, through the gap.
    var walled=field(function(x,y){return 10-x*0.2;});
    for(var wy=0;wy<Hh;wy++)if(wy!==35)walled.height[wy*W+20]=NaN;
    var src4=[{cell:24*W+4,strength:800}];solve(walled,src4);
    var dryWalls=true;for(var wi=0;wi<W*Hh;wi++)if(walled.water[wi]&&!(walled.height[wi]===walled.height[wi]))dryWalls=false;
    check('walls stay dry and water finds the gap',dryWalls&&walled.water[35*W+20]!==0&&src4[0].end==='outflow');

    // 5. A flat plateau between two slopes: the river crosses it as one connected channel.
    // Rows 10..38 only; high closed ground above and below keeps the flat
    // from touching the grid edge, so the east slope is its one way out.
    var plateau=field(function(x,y){if(y<10||y>38)return NaN;return x<14?8-x*0.2:x<30?5.2:5.2-(x-30)*0.2;});
    var src5=[{cell:24*W+2,strength:900}];solve(plateau,src5);
    var reach={},stack=[24*W+2];reach[24*W+2]=1;var reachedEdge=false;
    while(stack.length){var r=stack.pop(),rx=r%W,ry=(r/W)|0;if(rx>=W-1)reachedEdge=true;
      for(var k2=0;k2<8;k2++){var ax=rx+[1,-1,0,0,1,-1,1,-1][k2],ay=ry+[0,0,1,-1,1,1,-1,-1][k2];if(ax<0||ay<0||ax>=W||ay>=Hh)continue;var a=ay*W+ax;if(reach[a]||!plateau.water[a])continue;reach[a]=1;stack.push(a);}}
    check('a river crosses flat ground as one connected channel',reachedEdge&&src5[0].end==='outflow');

    // 6. Determinism and 7. joining standing water.
    var twin=field(bowlH);for(var nx3=cx+10;nx3<W;nx3++)for(var ny3=cy-1;ny3<=cy+1;ny3++)twin.height[ny3*W+nx3]=notchH-(nx3-(cx+10))*0.15;
    solve(twin,[{cell:cy*W+3,strength:2000}]);
    var same=['water','surface','dirX','dirY','speed','flags','body'].every(function(k){for(var i=0;i<W*Hh;i++){var a=bowl[k][i],b=twin[k][i];if(!(a===b||(a!==a&&b!==b)))return false;}return true;});
    check('the same terrain and sources always produce identical water',same);
    var lakeFirst=field(bowlH);
    for(var li=0;li<W*Hh;li++)if(lakeFirst.height[li]<1.5){lakeFirst.water[li]=G.WATER_KIND.still;lakeFirst.surface[li]=1.5;lakeFirst.body[li]=99;}
    var src7=[{cell:cy*W+3,strength:900}];solve(lakeFirst,src7);
    check('a river that reaches existing standing water joins it',src7[0].end==='joined');

    // 8. Seeded rough terrain: every source ends on a known outcome within its
    // work bound, nothing is wet on closed ground, and each lake body is flat.
    var seed=7,rnd=function(){seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;},bad=null,runs=0;
    for(var t=0;t<24&&!bad;t++){
      var a1=rnd()*6,a2=rnd()*6,holes=rnd();
      var rough=field(function(x,y){return Math.sin(x*0.31+a1)*1.3+Math.cos(y*0.27+a2)*1.1+Math.sin((x+y)*0.9)*0.25-x*0.05;});
      for(var hI=0;hI<W*Hh;hI++)if(rnd()<holes*0.06)rough.height[hI]=NaN;
      var sources=[];for(var sI=0;sI<4;sI++)sources.push({cell:Math.floor(rnd()*W*Hh),strength:100+Math.floor(rnd()*900)});
      var st=solve(rough,sources);runs++;
      sources.forEach(function(s){if(['outflow','joined','exhausted','enclosed','rejected'].indexOf(s.end)<0&&!bad)bad={trial:t,end:s.end};});
      if(st.capped&&!bad)bad={trial:t,capped:st.capped};
      var levels={};for(var ri=0;ri<W*Hh;ri++){if(!rough.water[ri])continue;
        if(!(rough.height[ri]===rough.height[ri])&&!bad)bad={trial:t,wetClosed:ri};
        if(rough.water[ri]===G.WATER_KIND.still){if(rough.surface[ri]<rough.height[ri]&&!bad)bad={trial:t,below:ri};}}
    }
    check('rough terrain: every source ends on a known outcome, uncapped, with water only on open ground',!bad&&runs===24,bad);

    // Real Endless windows through the shipping host (with the same, possibly
    // mutated, water source). World A has springs; world B has legacy pools.
    var host=slurp('tools/game/tests/cave_occlusion_integration.js'),hostEnd=host.indexOf('  function check(name, okay) {');
    var loadLine="manifest.parts.MAIN.forEach(function (path) { (0, eval)(slurp('assets/games/' + path)); });";
    var headLine="var G = (0, eval)('this'), errors = [], checked = 0;";
    if(hostEnd<0||host.split(loadLine).length!==2||host.split(headLine).length!==2)throw Error('shipping game host boundary missing');
    G.__waterSource=src;
    (0,eval)(host.slice(0,hostEnd).replace(loadLine,"manifest.parts.MAIN.forEach(function (path) { (0, eval)(path === 'src/06-water.js' ? G.__waterSource : slurp('assets/games/' + path)); });")+'G.__waterErrors=errors; }());');
    function world(seed){var st0=seed,realRandom=Math.random;Math.random=function(){st0=(st0*1103515245+12345)%2147483648;return st0/2147483648;};
      try{G.ENDLESS_MODE=G.running=true;G.gameOverState=false;G.terrain='plains';G.resetEndlessMode();}finally{Math.random=realRandom;}
      return G.floorMesh;}
    var m=world(11),n=m.w*m.h,legacyOk=true,legacyCount=0;
    for(var iL=0;iL<n;iL++){var bedL=G._waterWindowBed(m,iL);
      if(m.waterLegacy[iL]&&bedL===bedL&&bedL<G.WATER_LAKE_LEVEL){legacyCount++;
        if(!m.water[iL]||(m.waterBody[iL]===0&&m.waterSurface[iL]!==G.WATER_LAKE_LEVEL))legacyOk=false;}}
    check('legacy valley pools stay wet as lakes with a flat surface at the old threshold',legacyOk&&legacyCount>100&&G.getWaterStats().standing===legacyCount,{legacy:legacyCount});
    // The same world generated with the system off is the reference for
    // what the system changes and for what switching it off must restore.
    G.WATER_SYSTEM_ENABLED=false;var pristine=world(33);G.WATER_SYSTEM_ENABLED=true;
    var reference={z:new Float32Array(pristine.l0TopZ),colour:pristine.l0Color.slice(),water:new Uint8Array(pristine.water)};
    m=world(33);n=m.w*m.h;var stats=G.getWaterStats();
    check('the real window solves springs into rivers and lakes',stats.springs>=4&&stats.river>100&&stats.lake>100&&stats.capped===0&&G.__waterErrors.length===0,stats);
    var wallsDry=true,downhill=true,flowing=0;
    for(var i2=0;i2<n;i2++){
      var bed=G._waterWindowBed(m,i2);
      if(m.water[i2]&&(G.grid[i2]||!(bed===bed)))wallsDry=false;
      // Follow each flowing cell's direction to its successor: the water
      // surface there may not be higher (lakes are flat, rivers only fall).
      if(m.water[i2]===G.WATER_KIND.flowing&&m.waterSpeed[i2]>0){flowing++;var tx=i2%m.w+Math.round(m.waterDirX[i2]),ty=((i2/m.w)|0)+Math.round(m.waterDirY[i2]),tj=ty*m.w+tx;
        if(tx>=0&&ty>=0&&tx<m.w&&ty<m.h&&m.water[tj]&&m.waterBody[tj]===m.waterBody[i2]&&m.waterSurface[tj]>m.waterSurface[i2]+1e-5)downhill=false;}
    }
    check('no water on walls, cave interiors or carved ground in the real window',wallsDry);
    check('along every river the water surface never rises',downhill&&flowing>100,{flowing:flowing});
    var rivers=G.waterRivers,falling=rivers.length>=4;
    rivers.forEach(function(r){if(r.points.length<3)falling=false;for(var k=1;k<r.points.length;k++)if(r.points[k][2]>r.points[k-1][2]+1e-6)falling=false;});
    check('each river runs from its source to its mouth without its surface ever rising',falling,{rivers:rivers.length});
    // Channels, measured on the ground the renderer draws (each floor square
    // split along its NW-SE diagonal): across every full-width section the
    // bed dips well below the water, and dry open ground just past the
    // channel edge stands at or above it.
    function groundAt(x,y){var gs=m.gridSize,gx=Math.floor(x/gs),gy=Math.floor(y/gs),u=x/gs-gx,v=y/gs-gy,i=gy*m.w+gx;
      var z0=m.l0TopZ[i],z1=m.l0TopZ[i+1],z2=m.l0TopZ[i+m.w],z3=m.l0TopZ[i+m.w+1];return u>=v?z0+(z1-z0)*u+(z3-z1)*v:z0+(z3-z2)*u+(z2-z0)*v;}
    function openSquare(x,y,dry){var gx=Math.floor(x/m.gridSize),gy=Math.floor(y/m.gridSize);if(gx<1||gy<1||gx>=m.w-2||gy>=m.h-2)return false;
      for(var dy=-1;dy<=2;dy++)for(var dx=-1;dx<=2;dx++){var v=(gy+dy)*m.w+gx+dx,b=G._waterWindowBed(m,v);if(!(b===b)||m.water[v]===G.WATER_KIND.still)return false;
        if(dry&&dy>=0&&dy<=1&&dx>=0&&dx<=1&&m.water[v])return false;}return true;}
    var sections=0,deep=0,banks=0,perched=[];
    rivers.forEach(function(r){var P=r.points;
      for(var k=3;k<P.length-3;k++){if(P[k][4]<r.halfWidth-1e-6)continue;
        var tx=P[k+1][0]-P[k-1][0],ty=P[k+1][1]-P[k-1][1],L=Math.hypot(tx,ty),nx=-ty/L,ny=tx/L,S=P[k][2],hw=P[k][4],inside=true,low=Infinity;
        for(var s=-hw;s<=hw&&inside;s+=2){var sx=P[k][0]+nx*s,sy=P[k][1]+ny*s;if(!openSquare(sx,sy,false))inside=false;else low=Math.min(low,groundAt(sx,sy));}
        if(inside){sections++;if(S-low>=0.3)deep++;}
        for(var side=-1;side<=1;side+=2){var bx=P[k][0]+nx*side*(hw+6),by=P[k][1]+ny*side*(hw+6);if(!openSquare(bx,by,true))continue;
          banks++;var g=groundAt(bx,by);if(g<S-1e-3)perched.push([r.id,k,+(S-g).toFixed(3)]);}
      }});
    check('rivers run in carved channels: the bed dips below the water and dry banks stand above it',
      sections>100&&deep>=sections*0.95&&banks>150&&perched.length===0,{sections:sections,deep:deep,banks:banks,perched:perched.slice(0,6)});
    var copy={water:new Uint8Array(m.water),surface:new Float32Array(m.waterSurface),z:new Float32Array(m.l0TopZ),colour:m.l0Color.slice()};G.buildWindowWater();
    var rebuilt=true;for(var i3=0;i3<n;i3++){if(copy.water[i3]!==m.water[i3]||copy.z[i3]!==m.l0TopZ[i3]||copy.colour[i3]!==m.l0Color[i3])rebuilt=false;
      var a3=copy.surface[i3],b3=m.waterSurface[i3];if(!(a3===b3||(a3!==a3&&b3!==b3)))rebuilt=false;}
    check('rebuilding the same window reproduces the same water, ground heights and colours',rebuilt);
    var sampleOk=true,sampled=0;
    for(var i4=0;i4<n&&sampled<400;i4+=97){var x4=(i4%m.w+.5)*m.gridSize,y4=(((i4/m.w)|0)+.5)*m.gridSize,wa=G.waterAt(x4,y4);
      if(m.water[i4]){sampled++;if(!wa||Math.abs(wa.depth-(m.waterSurface[i4]-G._waterWindowBed(m,i4)))>1e-5||Math.abs(wa.surfaceZ-(m.waterSurface[i4]*40+60))>1e-4||!(wa.depth>0))sampleOk=false;}
      else if(wa)sampleOk=false;}
    check('waterAt reports depth and surface height from the solved cell, and null on dry ground',sampleOk&&sampled>20,{sampled:sampled});
    var shaped=0;for(var i6=0;i6<n;i6++)if(m.l0TopZ[i6]!==reference.z[i6])shaped++;
    G.setWaterSystemEnabled(false);var off=G.floorMesh,restored=off!==m&&off.l0TopZ.length===n;
    for(var i5=0;i5<n&&restored;i5++)if(off.water[i5]!==reference.water[i5]||off.l0TopZ[i5]!==reference.z[i5]||off.l0Color[i5]!==reference.colour[i5])restored=false;
    check('switching the system off gives back the ground, colours and water of a world generated without it',
      shaped>500&&restored&&G.waterAt(0,0)===null&&G.getWaterStats().lastSolveMs===0,{shaped:shaped});
    G.setWaterSystemEnabled(true);
    out('WATER_SYSTEM_RESULT PASS '+checks);
  } catch(e){throw e;}
}());
undefined;
