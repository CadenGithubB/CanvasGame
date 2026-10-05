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
  // Reserved ground stays closed but a filling basin no longer drains into
  // it, or a river whose water reaches it no longer drains there.
  src=patch(src,'    var key = _waterPassable(field, ni) ? field.height[ni] : field.sink[ni];','    var key = _waterPassable(field, ni) ? field.height[ni] : NaN;','--no-basin-drain');
  src=patch(src,'    if (field.water[c] && _waterReachesSink(field, c, field.surface[c], source.reach || 0)) {','    if (false) {','--no-river-drain');
  // A basin that drains into reserved ground keeps the level of its last
  // joined cell instead of rising to that ground.
  src=patch(src,'      if (field.sink[cell] > level) level = field.sink[cell];\n','','--no-drain-level');
  // The solver reaches only a river's own cell, not its width.
  src=patch(src,'_waterReachesSink(field, c, field.surface[c], source.reach || 0)','_waterReachesSink(field, c, field.surface[c], 0)','--no-drain-reach');
  // No structure ground is reserved at all.
  src=patch(src,'          if (largeStructureFlatDistance(st.type, x * gs - lx, y * gs - ly) < reach) mask[y * w + x] = 1;\n','','--no-reserve');
  // The reserve read from the window's largeStructures list, which is still
  // the previous window's when the water is solved during assembly.
  src=patch(src,'      var st = largeStructureForRegion(rx, ry);','      var st = null;\n      for (var ls = 0; ls < largeStructures.length; ls++) if (largeStructures[ls].regionX === rx && largeStructures[ls].regionY === ry) st = largeStructures[ls];','--stale-structures');
  // The levelled floor alone, without the margin around it.
  src=patch(src,'var WATER_RESERVE_MARGIN = 48;','var WATER_RESERVE_MARGIN = 0;','--no-margin');
  // Only the regions the window's chunks lie in, not their neighbours.
  src=patch(src,'var rx0 = Math.floor(windowCX / span) - 1','var rx0 = Math.floor(windowCX / span)','--reserve-window-regions');
  // A river kept only by the solver's estimate of its width: no end where its
  // carved water would stand above reserved ground beside it.
  src=patch(src,'function _waterRiverKeepOff(mesh, field, course) {\n','function _waterRiverKeepOff(mesh, field, course) {\n  return;\n','--no-keep-off');
  // A river that drains into reserved ground keeps the surface the solver gave
  // it to its end, or sinks below what its channel can hold.
  src=patch(src,'  if (course.drains) _waterRiverDrainFall(mesh, field, course);\n','','--no-drain-fall');
  src=patch(src,'var WATER_DRAIN_SINK = WATER_MAX_CUT - WATER_RIVER_BED_DEPTH;','var WATER_DRAIN_SINK = WATER_MAX_CUT;','--deep-drain-sink');
  // ... or falls below ground the carve leaves as it is (beside a wall), where
  // its water then has no depth.
  src=patch(src,': H[v] + WATER_MIN_DEPTH;',': -Infinity;','--no-unshaped-floor');
  // A drained river ending where the land ahead cannot hold its water.
  src=patch(src,'    if (!(end.floor > end.hold)) break;\n','    break;\n','--no-hold');
  // A tributary of a river that drains left as it was (ending above that
  // river's lowered tail, or where that river no longer runs); meeting it
  // without falling to its surface; looking for a point that can hold that
  // surface only at its end; or, without an outlet, not draining.
  src=patch(src,'  if (outlet && outlet.drains && !course.drains) _waterRiverOutlet(mesh, field, course, outlet);\n','','--no-outlet');
  src=patch(src,'{ pts.length = j + 1; _waterRiverFall(mesh, field, pts, S); course.joins = true; return; }','{ pts.length = j + 1; course.joins = true; return; }','--no-outlet-fall');
  src=patch(src,'    if (!(bd < wide)) break;\n','    if (!(bd < wide) || j < pts.length - 1) break;\n','--no-walk-back');
  src=patch(src,'course.joins = true; return; }\n  }\n  course.drains = true;\n','course.joins = true; return; }\n  }\n','--lost-outlet-dangles');
  // A drained river's rounded end carved but left without its water (dry holes).
  src=patch(src,'    var mouth = bestEnd[q] ?','    if (bestEnd[q] > 0 && river.drains) continue;\n    var mouth = bestEnd[q] ?','--dry-drained-ends');
  // Levees raised, or channels cut, without bound; or ground cut to the bound
  // where it then holds no water: a dry pit in a channel, or (only the
  // channel kept from it) a notch cut into a bank.
  src=patch(src,'      if (ground > H[q] + WATER_MAX_FILL) ground = H[q] + WATER_MAX_FILL;\n','','--no-fill-cap');
  src=patch(src,'      if (ground < H[q] - WATER_MAX_CUT) {\n','      if (false) {\n','--no-cut-cap');
  src=patch(src,'        if (!(S - ground > WATER_WET_EPS)) ground = H[q];\n','','--dry-cuts');
  src=patch(src,'        if (!(S - ground > WATER_WET_EPS)) ground = H[q];\n','        if (d2 < hw && !(S - ground > WATER_WET_EPS)) ground = H[q];\n','--dry-bank-cuts');
  // A height point tested against the wall cell north-west of it instead of
  // the floor square it stands for.
  src=patch(src,'Math.floor((i % mesh.w + 0.5) * gs / cell), gy = Math.floor((((i / mesh.w) | 0) + 0.5) * gs / cell)',
    'Math.floor((i % mesh.w - 0.5) * gs / cell), gy = Math.floor((((i / mesh.w) | 0) - 0.5) * gs / cell)','--wall-cell-nw');
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

    // 9. Reserved ground is closed to water but drains it (field.sink holds
    // its ground height). The notched bowl with a reserved patch on its north
    // slope fills only to the patch's lowest ground: expected lake = the
    // cells connected to the bottom below that height (a BFS on the authored
    // heights). The patch's ground lies 0.02 below the bowl's there, so it is
    // strictly lower than every open cell the water has not yet reached
    // (the next ring stands at 0.882, the last joined at 0.81): the level
    // must rise to the patch's ground when the basin drains. Control: the
    // same patch closed like a wall (no sink) leaves the bowl filling to its
    // notch.
    function patchedBowl(drains){var f=field(bowlH);
      for(var nx4=cx+10;nx4<W;nx4++)for(var ny4=cy-1;ny4<=cy+1;ny4++)f.height[ny4*W+nx4]=notchH-(nx4-(cx+10))*0.15;
      var cells=[];for(var py=cy-8;py<=cy-7;py++)for(var px=cx-1;px<=cx+1;px++){var pi=py*W+px;if(drains)f.sink[pi]=f.height[pi]-0.02;f.height[pi]=NaN;cells.push(pi);}
      f.patch=cells;return f;}
    var drained=patchedBowl(true),closedPatch=patchedBowl(false),src9=[{cell:cy*W+3,strength:2000}],ctl9=[{cell:cy*W+3,strength:2000}];
    solve(drained,src9);solve(closedPatch,ctl9);
    var sinkLow=Infinity;drained.patch.forEach(function(i){sinkLow=Math.min(sinkLow,drained.sink[i]);});
    var expect9={},q9=[cy*W+cx];expect9[cy*W+cx]=1;
    while(q9.length){var c9=q9.pop(),c9x=c9%W,c9y=(c9/W)|0;for(var k9=0;k9<8;k9++){var e9x=c9x+[1,-1,0,0,1,-1,1,-1][k9],e9y=c9y+[0,0,1,-1,1,1,-1,-1][k9];
      if(e9x<0||e9y<0||e9x>=W||e9y>=Hh)continue;var e9=e9y*W+e9x;if(expect9[e9]||!(drained.height[e9]<sinkLow-G.WATER_MIN_DEPTH))continue;expect9[e9]=1;q9.push(e9);}}
    var lake9=wet(drained).filter(function(i){return drained.water[i]===G.WATER_KIND.still;}),level9=true,set9=true,patchDry=true,flagged=false;
    lake9.forEach(function(i){if(Math.abs(drained.surface[i]-sinkLow)>1e-6)level9=false;if(!expect9[i])set9=false;});
    Object.keys(expect9).forEach(function(k){if(drained.water[+k]!==G.WATER_KIND.still)set9=false;});
    drained.patch.forEach(function(i){if(drained.water[i])patchDry=false;for(var k=0;k<8;k++){var a=i+[1,-1,0,0,1,-1,1,-1][k]+[0,0,1,-1,1,1,-1,-1][k]*W;if(drained.flags[a]&G.WATER_FLAG_DRAIN)flagged=true;}});
    var ctlLevel=wet(closedPatch).filter(function(i){return closedPatch.water[i]===G.WATER_KIND.still;}).map(function(i){return closedPatch.surface[i];});
    check('a basin beside reserved ground fills only to that ground and drains into it',
      lake9.length>50&&level9&&set9&&patchDry&&flagged&&src9[0].end==='outflow'&&ctlLevel.length>lake9.length&&Math.abs(Math.max.apply(Math,ctlLevel)-notchH)<1e-6,
      {lake:lake9.length,expected:Object.keys(expect9).length,surface:lake9.length&&drained.surface[lake9[0]],sink:sinkLow,end:src9[0].end,flagged:flagged,control:ctlLevel.length&&Math.max.apply(Math,ctlLevel)});

    // 10. A river running down the plane past a band of reserved ground a
    // unit lower than the plane (rows 22-23 from x 12 on) drains into the
    // band where its water first reaches it (a one-cell river: the band is
    // its 8-neighbour) and ends there: its last cell beside the band is
    // marked as draining and nothing further east is wet. Control: the same
    // band closed like a wall, and the river runs on to the window edge.
    function banded(drains){var f=field(function(x,y){return 10-x*0.2+Math.sin(y*0.7)*0.01;});
      for(var by=22;by<=23;by++)for(var bx=12;bx<W;bx++){var bi=by*W+bx;if(drains)f.sink[bi]=f.height[bi]-1;f.height[bi]=NaN;}return f;}
    var band=banded(true),wall10=banded(false),src10=[{cell:24*W+4,strength:600}],ctl10=[{cell:24*W+4,strength:600}];
    solve(band,src10);solve(wall10,ctl10);
    var east=0,eastCtl=0,flag10=[];for(var i10=0;i10<W*Hh;i10++){if(band.water[i10]&&i10%W>=13)east++;if(wall10.water[i10]&&i10%W>=W-2)eastCtl++;if(band.flags[i10]&G.WATER_FLAG_DRAIN)flag10.push(i10);}
    var besideBand=flag10.length===1&&(function(c){var x=c%W,y=(c/W)|0;return y===24&&x>=11&&x<=12;}(flag10[0]));
    check('a river passing lower reserved ground drains into it there',
      src10[0].end==='outflow'&&east===0&&besideBand&&ctl10[0].end==='outflow'&&eastCtl>0,
      {end:src10[0].end,east:east,drainCells:flag10.map(function(c){return [c%W,(c/W)|0];}),control:[ctl10[0].end,eastCtl]});

    // 11. A river as wide as carving makes it drains where its width reaches
    // lower reserved ground. The same plane with the band two rows further
    // north (rows 20-21 from x 12): the river's own cells on row 24 never
    // touch it, but with reach 2.5 cells its water covers row 22, and the
    // first open cell beside the band, (11,22), lies within 2.5 of (10,24)
    // ((x-11)^2+2^2 <= 2.5^2 first holds at x = 10). Expected: the run drains
    // at exactly (10,24) and nothing from x 11 on is wet. Control: the same
    // band and river with reach 0 runs past it to the window edge.
    function farBand(){var f=field(function(x,y){return 10-x*0.2+Math.sin(y*0.7)*0.01;});
      for(var by=20;by<=21;by++)for(var bx=12;bx<W;bx++){var bi=by*W+bx;f.sink[bi]=f.height[bi]-1;f.height[bi]=NaN;}return f;}
    var wide=farBand(),narrow=farBand(),src11=[{cell:24*W+4,strength:600,reach:2.5}],ctl11=[{cell:24*W+4,strength:600,reach:0}];
    solve(wide,src11);solve(narrow,ctl11);
    var east11=0,edge11=0,flag11=[];for(var i11=0;i11<W*Hh;i11++){if(wide.water[i11]&&i11%W>=11)east11++;if(narrow.water[i11]&&i11%W>=W-2)edge11++;if(wide.flags[i11]&G.WATER_FLAG_DRAIN)flag11.push(i11);}
    check('a river drains where its width reaches lower reserved ground beside its course',
      src11[0].end==='outflow'&&flag11.length===1&&flag11[0]===24*W+10&&east11===0&&ctl11[0].end==='outflow'&&edge11>0&&!narrow.flags.some(function(f){return f&G.WATER_FLAG_DRAIN;}),
      {end:src11[0].end,east:east11,drainCells:flag11.map(function(c){return [c%W,(c/W)|0];}),control:[ctl11[0].end,edge11]});

    // 12. Keep-off, on an authored course: a river 30 units wide runs east
    // along row 24 (y 288) past a band of reserved ground in rows 20-21 from
    // x 24 on, a unit below the open ground. The first open cell beside the
    // band, (23,22) at x 276, lies 24 units from the course, inside the
    // river's width, so the river must end within a section before x 276 and
    // drain there. Control: the same band closed like a wall (no sink) leaves
    // the course whole and undrained.
    function keepOffCase(drains){var f=G.createWaterField(W,Hh),mesh={w:W,h:Hh,gridSize:12,water:new Uint8Array(W*Hh)};
      for(var i12=0;i12<W*Hh;i12++){f.height[i12]=5;var x12=i12%W,y12=(i12/W)|0;if(y12>=20&&y12<=21&&x12>=24){f.height[i12]=NaN;if(drains)f.sink[i12]=4;}}
      G._waterBuildRim(f);var pts=[];for(var k12=0;k12<=70;k12++)pts.push([k12*6,288,5.35-k12*0.001,k12*6,30]);
      var course={points:pts,drains:false};G._waterRiverKeepOff(mesh,f,course);return course;}
    var kept=keepOffCase(true),whole=keepOffCase(false),endX=kept.points[kept.points.length-1][0];
    check('a river ends where its carved water would first stand above lower reserved ground beside it, and drains there',
      kept.drains&&endX<276&&endX>=276-2*6&&!whole.drains&&whole.points.length===71,{end:endX,drains:kept.drains,control:[whole.points.length,whole.drains]});

    // 13. A tributary of a river whose water drains, on authored flat ground
    // (height 5, courses every 6 units). The river runs east along y 288, 30
    // units wide, its surface falling 0.002 a unit (5.0 at x 300). The
    // tributary runs south down x 300 at 5.4 and ends 6 units north of the
    // river's centreline, inside its water: it ends there at the river's
    // surface, 5.0, its own surface falling to it only over its last
    // WATER_DRAIN_FALL units. With the ground raised to 6.2 at the height
    // points of the tributary's last three points (y 282, 276 and 270: rows
    // 23 and 24 of column 25), where a channel cut even as deep as
    // WATER_MAX_CUT holds no water as low as 5.0, it ends at y 264, the last
    // point whose channel can, 24 units from the river's centreline, at 5.0.
    // A river held back to x 198, whose water no longer
    // comes within its width, or with no river left at all, leaves it no
    // outlet: it drains (an end the land holds; _waterRiverDrainFall), its
    // course unchanged here.
    function outletCase(raised,into){var f=G.createWaterField(W,Hh),mesh={w:W,h:Hh,gridSize:12,water:new Uint8Array(W*Hh)};
      f.height.fill(5);if(raised)f.height[23*W+25]=f.height[24*W+25]=6.2;var pts=[];for(var k13=0;k13<48;k13++)pts.push([300,k13*6,5.4-k13*0.0001,k13*6,25]);
      var out13=[];for(var x13=0;x13<=into;x13+=6)out13.push([x13,288,5.6-0.002*x13,x13,30]);
      var course={points:pts,drains:false,heldBack:0};G._waterRiverOutlet(mesh,f,course,{river:into>=0?{points:out13}:null,drains:true});return course;}
    function settled(c,endY,S){var P13=c.points,E=P13[P13.length-1],steady=true,falling=true;
      for(var k=0;k<P13.length;k++){if(E[3]-P13[k][3]>=G.WATER_DRAIN_FALL&&P13[k][2]!==5.4-k*0.0001)steady=false;if(k&&P13[k][2]>P13[k-1][2])falling=false;}
      return c.joins&&!c.drains&&E[1]===endY&&Math.abs(E[2]-S)<1e-6&&steady&&falling;}
    var joined=outletCase(false,420),walked=outletCase(true,420),cut=outletCase(false,198),none=outletCase(false,-1);
    function intact(c){return c.drains&&!c.joins&&c.points.length===48&&c.points[47][2]===5.4-47*0.0001;}
    check('a tributary of a river that drains ends in its water at its surface, at the last point of its course that can hold that surface, or drains where it has no such point',
      settled(joined,282,5.0)&&settled(walked,264,5.0)&&intact(cut)&&intact(none),
      [joined,walked,cut,none].map(function(c){var E=c.points[c.points.length-1];return {n:c.points.length,end:E.slice(0,3),joins:!!c.joins,drains:c.drains};}));

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
    var shaped=0,raise33=0,cut33=0;for(var i6=0;i6<n;i6++){if(m.l0TopZ[i6]!==reference.z[i6])shaped++;raise33=Math.max(raise33,m.l0TopZ[i6]-reference.z[i6]);cut33=Math.max(cut33,reference.z[i6]-m.l0TopZ[i6]);}
    G.setWaterSystemEnabled(false);var off=G.floorMesh,restored=off!==m&&off.l0TopZ.length===n;
    for(var i5=0;i5<n&&restored;i5++)if(off.water[i5]!==reference.water[i5]||off.l0TopZ[i5]!==reference.z[i5]||off.l0Color[i5]!==reference.colour[i5])restored=false;
    check('switching the system off gives back the ground, colours and water of a world generated without it',
      shaped>500&&restored&&G.waterAt(0,0)===null&&G.getWaterStats().lastSolveMs===0,{shaped:shaped});
    G.setWaterSystemEnabled(true);

    // Structures. A fortress, arena or watchtower levels its ground
    // (05-endless-world.js, "Flatten floor inside structures": flat within
    // 1.75, 1.25 or 1.55 chunk sizes times its scale of its centre, by the
    // larger axis distance, straight-line for arenas). Water keeps off that
    // floor, the structure's footprint and a WATER_RESERVE_MARGIN ring around
    // the floor (the widest river half-width and a ribbon's reach into its
    // bank, in whole height-grid steps). Each window is entered from the home window, as a walk-in
    // is: the window's largeStructures list is assembled after its water, so
    // while the water is solved it still holds the home window's structures.
    // The window is then compared with itself rebuilt with the system off.
    // The structures come from the window's list after assembly and the radii
    // are the generator's authored numbers, not the water code's.
    var FLAT={fortress:1.75,arena:1.25,watchtower:1.55},margin=Math.ceil((G.WATER_RIVER_HALF_WIDTH[1]+G.WATER_RIBBON_OVERLAP)/12)*12;
    // The solver's water, per point, as the carve receives it (the carve
    // replaces river points with its own).
    var realCarve=G.carveWaterRivers;G.carveWaterRivers=function(mesh,field,rivers){G.__solvedBody=new Int32Array(mesh.waterBody);return realCarve(mesh,field,rivers);};
    function enter(seed,cx,cy){world(seed);var home=G.largeStructures.map(function(st){return st.regionX+','+st.regionY;});
      var st1=seed+101,realRandom=Math.random;Math.random=function(){st1=(st1*1103515245+12345)%2147483648;return st1/2147483648;};
      try{G.assembleWindow(cx,cy);}finally{Math.random=realRandom;}return home;}
    function floorDist(st,x,y){var dx=G.windowOriginX+x-st.centerWX,dy=G.windowOriginY+y-st.centerWY;
      return st.type==='arena'?Math.sqrt(dx*dx+dy*dy):Math.max(Math.abs(dx),Math.abs(dy));}
    function keepFloors(){var z=[];G.largeStructures.forEach(function(st){z.push(G.getEntityRenderFloorZ(st));
      if(st.type==='fortress')G.fortressInteractables3D(st).forEach(function(item){z.push(G.fortressInteractableFloorZ(st,item));});});return z;}
    function models(){G.buildStructureModels({force:true});
      return (G.structureModels||[]).map(function(md){var sum=0;md.faces.forEach(function(f){sum+=f.minZ*1.25+f.maxZ;});return [md.key,md.floorZ,md.faces.length,sum];});}
    // seed, window centre, the structure the window is for (seed 3: a chunk of
    // the fortress's footprint recorded a neighbouring watchtower and was never
    // levelled; seeds 10 and 8: rivers beside the steps at the edges of a
    // watchtower's levelled ground; seed 22: an arena and a fortress sharing
    // chunks, with a channel cut as deep as WATER_MAX_CUT allows at a
    // terrain step; seed 14: a river whose carved water, wider than the
    // solver's estimate there, would stand above the arena's reserved ground;
    // seed 9: a drained river down a wall, where the carve leaves the ground
    // under its tail as it is, and its tail ran dry when the fall took no
    // account of that; seed 35: a river held back short of its confluence,
    // which left its tributary's end on dry ground above its water; seed 1: a
    // tributary joining a drained river just before its tail falls to its
    // end)
    var fixtures=[[11,-49,41,'fortress','-17,14'],[6,44,39,'arena','14,13'],[3,56,-3,'fortress','19,-2'],[10,14,16,'watchtower','5,5'],
      [8,-15,102,'watchtower','-5,34'],[22,13,58,'arena','4,19'],[14,13,4,'arena','4,1'],[9,-3,-35,'watchtower','-1,-13'],
      [35,-20,-17,'fortress','-7,-6'],[1,28,-2,'watchtower','9,-1']],seen=[];
    function segDist(a,b,x,y){var sx=b[0]-a[0],sy=b[1]-a[1],l2=sx*sx+sy*sy,t=l2>0?Math.max(0,Math.min(1,((x-a[0])*sx+(y-a[1])*sy)/l2)):0;
      return Math.hypot(x-a[0]-sx*t,y-a[1]-sy*t);}
    // The nearest point of a course to (x,y): its distance, surface and width.
    function nearest(P0,x,y){var best={d:Infinity,S:NaN,w:0};
      for(var k=0;k<P0.length-1;k++){var a=P0[k],b=P0[k+1],sx=b[0]-a[0],sy=b[1]-a[1],l2=sx*sx+sy*sy,t=l2>0?Math.max(0,Math.min(1,((x-a[0])*sx+(y-a[1])*sy)/l2)):0;
        var d=Math.hypot(x-a[0]-sx*t,y-a[1]-sy*t);if(d<best.d)best={d:d,S:a[2]+(b[2]-a[2])*t,w:a[4]+(b[4]-a[4])*t};}
      return best;}
    var pair=null;
    fixtures.forEach(function(fx,fi){
      var home=enter(fx[0],fx[1],fx[2]),mm=G.floorMesh,nn=mm.w*mm.h,gs=mm.gridSize,R=mm.waterReserve,rec={fx:fx.join(' '),home:home,stats:G.getWaterStats()};
      rec.target=G.largeStructures.filter(function(st){return st.type===fx[3]&&st.regionX+','+st.regionY===fx[4];}).length;
      // Floor (no margin), floor plus margin, and footprint hull points.
      var floor=new Uint8Array(nn),keep=new Uint8Array(nn);
      G.largeStructures.forEach(function(st){var r=G.CHUNK_SIZE*FLAT[st.type]*st.scale,hull=G.landmarkFootprintHull(st);
        for(var i=0;i<nn;i++){var x=(i%mm.w)*gs,y=((i/mm.w)|0)*gs,d=floorDist(st,x,y);if(d<r)floor[i]=1;if(d<r+margin||(hull&&G.landmarkHullGap(hull,x,y)<=0))keep[i]=1;}});
      rec.floor=0;rec.keep=0;for(var k=0;k<nn;k++){rec.floor+=floor[k];rec.keep+=keep[k];}
      rec.springs=G.waterSources.filter(function(src){return keep[src.cell];}).length;
      // River surfaces drawn over the floor (ribbon pieces, sampled 3x3).
      rec.ribbonsOverFloor=0;G.buildWaterTiles(mm).forEach(function(t){if(!t.ribbon)return;var q=t.quad;
        for(var a=0;a<=2;a++)for(var b=0;b<=2;b++){var u=a/2,v=b/2,x=(q[0][0]*(1-u)+q[1][0]*u)*(1-v)+(q[3][0]*(1-u)+q[2][0]*u)*v,y=(q[0][1]*(1-u)+q[1][1]*u)*(1-v)+(q[3][1]*(1-u)+q[2][1]*u)*v;
          var gx=Math.round(x/gs),gy=Math.round(y/gs);if(gx>=0&&gy>=0&&gx<mm.w&&gy<mm.h&&floor[gy*mm.w+gx])rec.ribbonsOverFloor++;}});
      // Water near reserved ground (within two points of it) and water
      // standing above a reserved 8-neighbour's ground.
      rec.nearReserve=0;rec.above=[];
      for(var w1=0;w1<nn;w1++){if(!mm.water[w1])continue;var x1=w1%mm.w,y1=(w1/mm.w)|0,near=false;
        for(var oy=-2;oy<=2;oy++)for(var ox=-2;ox<=2;ox++){var X=x1+ox,Y=y1+oy;if(X<0||Y<0||X>=mm.w||Y>=mm.h||!R[Y*mm.w+X])continue;near=true;
          var g=Math.abs(ox)<=1&&Math.abs(oy)<=1?G._waterPlainGround(mm,Y*mm.w+X):NaN;
          if(g===g&&mm.waterSurface[w1]-g>1e-3)rec.above.push([x1*gs,y1*gs,+(mm.waterSurface[w1]-g).toFixed(3)]);}
        if(near)rec.nearReserve++;}
      rec.rivers=G.waterRivers.length;
      // River ends, not drained and not in a lake or at the window's border:
      // those within the width of a river that drains (a tributary of it),
      // with their surface, that river's surface at the nearest point and
      // the ground at the end; and those where the solver's water belonged
      // to another river (a confluence), and whether a river of that body
      // still runs there.
      rec.tribs=[];rec.confluences=[];var solved=G.__solvedBody;
      G.waterRivers.forEach(function(rv){if(rv.drains)return;var E=rv.points[rv.points.length-1],ex=Math.round(E[0]/gs),ey=Math.round(E[1]/gs),v=ey*mm.w+ex;
        if(ex<=1||ey<=1||ex>=mm.w-2||ey>=mm.h-2||mm.water[v]===G.WATER_KIND.still)return;var into=null;
        G.waterRivers.forEach(function(o){if(o===rv||!o.drains)return;var s=nearest(o.points,E[0],E[1]);if(s.d<s.w&&(!into||s.d<into.d))into=s;});
        if(into)rec.tribs.push({r:rv.id,end:[Math.round(E[0]),Math.round(E[1])],S:+E[2].toFixed(4),into:+into.S.toFixed(4),ground:+mm.l0TopZ[v].toFixed(4)});
        var b=solved[v];if(b&&b!==rv.body)rec.confluences.push({r:rv.id,body:b,within:G.waterRivers.some(function(o){if(o.body!==b)return false;var s=nearest(o.points,E[0],E[1]);return s.d<s.w;})});});
      var courses=G.waterRivers.map(function(r){return {drains:r.drains,hw:r.halfWidth,held:r.heldBack||0,pts:r.points.map(function(p){return p.slice();})};});
      var on={water:new Uint8Array(mm.water),z:new Float32Array(mm.l0TopZ)};rec.keepOn=keepFloors();rec.modelsOn=models();
      if(fi===0){var rA=new Uint8Array(R),oA=[G.windowOriginX,G.windowOriginY],wA=mm.w;}
      G.setWaterSystemEnabled(false);var off=G.floorMesh;rec.keepOff=keepFloors();rec.modelsOff=models();
      rec.newWet=0;rec.reshaped=0;rec.maxRaise=0;rec.atCap=0;rec.maxCut=0;rec.atCut=0;rec.dryCut=0;
      for(var j=0;j<nn;j++){var dz=on.z[j]-off.l0TopZ[j];if(dz>rec.maxRaise)rec.maxRaise=dz;if(Math.abs(dz-G.WATER_MAX_FILL)<1e-4)rec.atCap++;
        if(-dz>rec.maxCut)rec.maxCut=-dz;if(Math.abs(dz+G.WATER_MAX_CUT)<1e-4){rec.atCut++;if(!on.water[j])rec.dryCut++;}
        if(!keep[j])continue;if(on.water[j]&&!off.water[j])rec.newWet++;if(dz!==0)rec.reshaped++;}
      // Rivers that drain into reserved ground, measured against the natural
      // ground (the window rebuilt with the system off): how far the end lies
      // from reserved ground and how far the river was held back from it, the
      // surface at the end against the ground there and the lowest reserved
      // ground within its shore (its half-width, a levee's width and a grid
      // step), water along the last 16 sections (within 0.6 of the width of
      // each section over open plain ground), and the ground whose nearest
      // river point is the end itself (past the end): cut below its natural
      // height and below the surface yet dry (a hole), wet, or dry at the rim
      // of the rounded end.
      rec.drained=[];rec.past=0;rec.holes=[];rec.wetPast=0;rec.rim=0;rec.rimLow=[];
      courses.forEach(function(cr){if(!cr.drains)return;var P0=cr.pts,e=P0[P0.length-1],ex=Math.round(e[0]/gs),ey=Math.round(e[1]/gs),gap=Infinity,low=Infinity,shore=e[4]+G.WATER_LEVEE_WIDTH+gs;
        for(var i=0;i<nn;i++){if(!R[i])continue;var d=Math.hypot((i%mm.w)*gs-e[0],((i/mm.w)|0)*gs-e[1]);gap=Math.min(gap,d);
          if(d<=shore){var z0=G._waterPlainGround(off,i);if(z0<low)low=z0;}}
        var ground=G._waterPlainGround(off,ey*mm.w+ex),dry=[];
        for(var k=Math.max(0,P0.length-16);k<P0.length;k++){var gx=Math.round(P0[k][0]/gs),gy=Math.round(P0[k][1]/gs),v=gy*mm.w+gx;
          if(R[v]||!(G._waterPlainGround(off,v)===G._waterPlainGround(off,v)))continue;var rr=Math.ceil(P0[k][4]*0.6/gs),wet=false;
          for(var yy=-rr;yy<=rr&&!wet;yy++)for(var xx=-rr;xx<=rr;xx++){var X2=gx+xx,Y2=gy+yy;if(X2<0||Y2<0||X2>=mm.w||Y2>=mm.h)continue;if(Math.hypot(xx,yy)*gs<=P0[k][4]*0.6&&on.water[Y2*mm.w+X2]){wet=true;break;}}
          if(!wet)dry.push(k);}
        rec.drained.push({end:[Math.round(e[0]),Math.round(e[1])],gap:+gap.toFixed(1),bound:+(cr.hw+G.WATER_RIVER_STEP+1.5*gs).toFixed(1),held:+cr.held.toFixed(1),
          surface:+e[2].toFixed(4),ground:ground===ground?+ground.toFixed(4):null,low:low<Infinity?+low.toFixed(4):null,dry:dry});
        var pv=P0[P0.length-2],tx=e[0]-pv[0],ty=e[1]-pv[1],reach=e[4]+G.WATER_BANK_REACH,r0=Math.ceil(reach/gs);
        for(var dy=-r0;dy<=r0;dy++)for(var dx=-r0;dx<=r0;dx++){var X3=ex+dx,Y3=ey+dy;if(X3<1||Y3<1||X3>=mm.w-1||Y3>=mm.h-1)continue;
          var p3=Y3*mm.w+X3,px=X3*gs,py=Y3*gs,dEnd=Math.hypot(px-e[0],py-e[1]);
          if(dEnd>=reach||(px-e[0])*tx+(py-e[1])*ty<=0||R[p3]||!(G._waterPlainGround(off,p3)===G._waterPlainGround(off,p3)))continue;
          var nearer=courses.some(function(c2){for(var s2=0;s2<c2.pts.length-1;s2++)if(segDist(c2.pts[s2],c2.pts[s2+1],px,py)<dEnd-1e-6)return true;return false;});
          if(nearer)continue;rec.past++;
          if(on.water[p3]){rec.wetPast++;continue;}
          if(on.z[p3]<e[2]-1e-3&&on.z[p3]<off.l0TopZ[p3]-1e-6)rec.holes.push([px,py,+(e[2]-on.z[p3]).toFixed(3)]);
          if(dEnd>=e[4]&&dEnd<e[4]+gs){rec.rim++;if(on.z[p3]<e[2]-0.01)rec.rimLow.push([px,py,+(e[2]-on.z[p3]).toFixed(3)]);}}
      });
      G.setWaterSystemEnabled(true);
      if(fi===0){
        // The same world points in the window one region east share their reserve.
        G.assembleWindow(fx[1]+4,fx[2]);var mB=G.floorMesh,rB=mB.waterReserve,oB=[G.windowOriginX,G.windowOriginY];pair={shared:0,reserved:0,differ:0};
        for(var p=0;p<rA.length;p++){var bx=(oA[0]+(p%wA)*gs-oB[0])/gs,by=(oA[1]+((p/wA)|0)*gs-oB[1])/gs;
          if(bx<0||by<0||bx>=mB.w||by>=mB.h)continue;pair.shared++;if(rA[p])pair.reserved++;if(rA[p]!==rB[by*mB.w+bx])pair.differ++;}
      }
      seen.push(rec);
    });
    function brief(r,keys){var o={fx:r.fx};keys.forEach(function(k){o[k]=r[k];});return o;}
    var modelsOk=true,keepOk=true;
    seen.forEach(function(r){if(JSON.stringify(r.modelsOn)!==JSON.stringify(r.modelsOff)||!r.modelsOn.length)modelsOk=false;if(JSON.stringify(r.keepOn)!==JSON.stringify(r.keepOff))keepOk=false;});
    check('keep props, structure floors and structure models stand the same with water on and off',
      modelsOk&&keepOk&&seen[0].keepOn.length===4,seen.map(function(r){return brief(r,['keepOn','keepOff','modelsOn','modelsOff']);}));
    var floorsOk=true,setupOk=true,drains=0;
    seen.forEach(function(r){drains+=r.stats.drains;
      if(r.target!==1||r.home.indexOf(r.fx.split(' ').slice(-1)[0])>=0||r.floor<1000||r.rivers<1)setupOk=false;
      if(r.newWet||r.reshaped||r.springs||r.ribbonsOverFloor)floorsOk=false;});
    check('water keeps off the levelled floor, footprint and margin of a fortress, arena or watchtower: no new water, reshaped ground, spring or river surface there',
      setupOk&&floorsOk&&drains>=2,seen.map(function(r){return brief(r,['target','home','floor','keep','rivers','newWet','reshaped','springs','ribbonsOverFloor']);}).concat([{drains:drains}]));
    // A tributary of a river that drains (seed 35: a river held back short
    // of its confluence left its tributary's end on ground above its own
    // water; seed 1: a drained river's tail, falling to its end, left its
    // tributary's end 0.45 above it) ends in that river's water at its level:
    // its surface at its end no higher than that river's at the nearest
    // point, over ground below that surface. No river that ends at a
    // confluence, and does not drain itself, is left where the river it
    // joined no longer runs.
    var tribOk=true,tribs=0,confluences=0;
    seen.forEach(function(r){r.tribs.forEach(function(t){tribs++;if(!(t.S<=t.into+1e-3&&t.ground<t.into))tribOk=false;});
      r.confluences.forEach(function(c){confluences++;if(!c.within)tribOk=false;});});
    check('a tributary of a river that drains ends in its water at its level, and no tributary is left where the river it joined no longer runs',
      tribOk&&tribs>=2&&confluences>=1,seen.map(function(r){return brief(r,['tribs','confluences']);}));
    // Past its end a drained river ends like any open end: its rounded end is
    // carved and holds water, ground there cut below the surface is never dry,
    // and the dry ground at the rim of the rounded end stands at or above the
    // water (the land holds it).
    var pastOk=true,past=0,wetPast=0,rim=0;
    seen.forEach(function(r){past+=r.past;wetPast+=r.wetPast;rim+=r.rim;if(r.holes.length||r.rimLow.length)pastOk=false;});
    check('a river that drains ends in a rounded end that holds its water: no dry hole past its end, and the land at its rim stands at or above the water',
      pastOk&&past>50&&wetPast>10&&rim>20,seen.map(function(r){return brief(r,['past','wetPast','rim','holes','rimLow']);}));
    // Subjects: water within two points of reserved ground and rivers that
    // drain into it. Each drained river ends within its width, a section and a
    // point and a half of reserved ground, where it reached that ground, or
    // is held back from there (where the land could not hold its end) by no
    // more than the length its object records; at least one is held back.
    var aboveOk=true,drained=0,nearReserve=0,endsOk=true,heldBack=0;
    seen.forEach(function(r){nearReserve+=r.nearReserve;if(r.above.length)aboveOk=false;
      r.drained.forEach(function(d){drained++;if(d.held>0)heldBack++;if(!(d.gap<=d.bound+d.held+1e-3))endsOk=false;});});
    check('water that reaches reserved ground drains into it and never stands above it',
      aboveOk&&endsOk&&drained>=4&&heldBack>=1&&nearReserve>0,seen.map(function(r){return brief(r,['nearReserve','above','drained']);}));
    // A drained river's surface ends no higher than the reserved ground within
    // its end's shore (its water meets the land, which no water stands above),
    // and no lower than its channel can hold: at most WATER_MAX_CUT less the
    // bed depth below the natural ground at its end, so a channel cut no deeper
    // than WATER_MAX_CUT still holds that much water. Its last sections hold
    // water.
    var fallOk=true,sinkRoom=G.WATER_MAX_CUT-G.WATER_RIVER_BED_DEPTH,sunk=0;
    seen.forEach(function(r){r.drained.forEach(function(d){
      if(d.low!==null&&!(d.surface<=d.low+1e-3))fallOk=false;
      if(d.ground!==null){if(!(d.surface>=d.ground-sinkRoom-1e-3))fallOk=false;if(d.surface<d.ground-1e-3)sunk++;}
      if(d.dry.length)fallOk=false;});});
    check('a river that drains ends no higher than the reserved ground around its end and no lower than its channel can hold, its tail holding water',
      fallOk&&drained>=4&&sunk>=1,seen.map(function(r){return brief(r,['drained']);}).concat([{sunk:sunk}]));
    // Both bounds bind in the fixtures (points carved exactly to them).
    var shapeOk=raise33<=G.WATER_MAX_FILL+1e-4&&cut33<=G.WATER_MAX_CUT+1e-4,raiseBinds=0,cutBinds=0,dryCuts=0;
    seen.forEach(function(r){if(r.maxRaise>G.WATER_MAX_FILL+1e-4||r.maxCut>G.WATER_MAX_CUT+1e-4)shapeOk=false;raiseBinds+=r.atCap;cutBinds+=r.atCut;dryCuts+=r.dryCut;});
    check('carving never moves ground more than WATER_MAX_FILL above or WATER_MAX_CUT below its natural height',
      shapeOk&&raiseBinds>0&&cutBinds>0,{world33:[raise33,cut33],windows:seen.map(function(r){return brief(r,['maxRaise','atCap','maxCut','atCut']);})});
    // Where the cut bound binds, the ground holds water: a channel cut that
    // deep and left dry would be a pit, a bank cut that deep a notch (seed 22
    // holds both without the rule).
    check('ground cut as deep as WATER_MAX_CUT allows always holds water: no dry pit or notch',
      dryCuts===0&&cutBinds>0,seen.map(function(r){return brief(r,['atCut','dryCut']);}));
    check('a point is reserved the same way in every window that holds it',
      pair&&pair.differ===0&&pair.reserved>100,pair);
    out('WATER_SYSTEM_RESULT PASS '+checks);
  } catch(e){throw e;}
}());
undefined;
