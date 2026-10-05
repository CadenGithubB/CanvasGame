// Water rendering geometry in real seeded windows: lakes cover every floor
// square they touch without hanging over lower ground; river ribbons cover
// their channel, do not fold over themselves, and never hang over dry land;
// a river that drains into a structure's reserved ground ends where the land
// holds its water; no near-black beds under water; switching the system off
// restores every ground colour. Geometry contracts on the built tiles;
// browser pixels are checked separately.
(function () {
  var G=(0,eval)('this'),checks=0,out=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
  function check(name,ok,detail){if(!ok){if(detail!==undefined)out('DETAIL '+JSON.stringify(detail));throw Error(name);}checks++;out('PASS '+name);}
  var host=slurp('tools/game/tests/cave_occlusion_integration.js'),hostEnd=host.indexOf('  function check(name, okay) {');
  var loadLine="manifest.parts.MAIN.forEach(function (path) { (0, eval)(slurp('assets/games/' + path)); });";
  if(hostEnd<0||host.split(loadLine).length!==2)throw Error('shipping game host boundary missing');
  var sources={'src/06-water.js':slurp('assets/games/src/06-water.js'),'src/13-render-water.js':slurp('assets/games/src/13-render-water.js')};
  function patch(file,from,to,flag){if(__argv.indexOf(flag)<0)return;if(sources[file].split(from).length!==2)throw Error('mutation anchor for '+flag+' must match exactly once');sources[file]=sources[file].replace(from,to);}
  patch('src/13-render-water.js','if (!wet) { run = null; continue; }','if (!mesh.water[i0]) { run = null; continue; }','--nw-corner-coverage');
  patch('src/13-render-water.js','cz[k] = ground === ground ? Math.min(avg, ground) : avg;','cz[k] = avg;','--floating-edges');
  // The earlier design: keep the (dark, height-coloured) natural ground under water.
  patch('src/06-water.js','colour = _waterHexOut((rgb[0] * keep + WATER_BED_TONE[0] * mud) * dark,\n          (rgb[1] * keep + WATER_BED_TONE[1] * mud) * dark, (rgb[2] * keep + WATER_BED_TONE[2] * mud) * dark);',
    'colour = _waterHexOut(rgb[0] * dark, rgb[1] * dark, rgb[2] * dark);','--dark-beds');
  // Ribbons only half as wide as their channel.
  patch('src/13-render-water.js','half = Math.max(half, left, right);','left *= 0.5; right *= 0.5; half = Math.max(half, left, right);','--narrow-ribbon');
  // Sections on the inside of a tight bend reaching past its centre.
  patch('src/13-render-water.js','for (var bq = Math.max(0, q - 1); bq <= Math.min(pts.length - 1, q + 1); bq++) {','for (var bq = 0; bq < 0; bq++) {','--no-fan');
  // River centrelines straight from the height grid, without relaxing.
  patch('src/06-water.js','var WATER_RIVER_RELAX = 10;','var WATER_RIVER_RELAX = 0;','--no-relax');
  // Ribbon edges reaching out over the bank without the levee under them.
  patch('src/06-water.js','ground = Math.max(cut, levee);','ground = cut;','--perched-bank');
  // A river that drains into reserved ground ending as it used to: no
  // rounded end carved past its last point and no cap drawn there, so its
  // full-depth channel stops at a straight edge (the historical defect).
  patch('src/06-water.js','    var ground = H[q];\n    if (_waterCarvable(mesh, H, q)) {','    if (bestEnd[q] > 0 && river.drains) continue;\n    var ground = H[q];\n    if (_waterCarvable(mesh, H, q)) {','--uncapped-drained-ends');
  patch('src/13-render-water.js','capB = rv.joins ? null :','capB = rv.joins || rv.drains ? null :','--uncapped-drained-ends');
  // A drained river's surface left where the solver put it, or its end not
  // held back where the land ahead of it cannot hold its water.
  patch('src/06-water.js','  if (course.drains) _waterRiverDrainFall(mesh, field, course);\n','','--no-drain-fall');
  patch('src/06-water.js','    if (!(end.floor > end.hold)) break;\n','    break;\n','--no-hold');
  // Drained ends' caps that stop at the channel edge instead of reaching
  // into the land past it; or every cap reaching on into the bank, a spring's
  // or a confluence's too, as they once did.
  patch('src/13-render-water.js','  var reach = drained ? _waterRibbonReach(','  var reach = false ? _waterRibbonReach(','--short-caps');
  patch('src/13-render-water.js','  var reach = drained ? _waterRibbonReach(','  var reach = true ? _waterRibbonReach(','--long-caps');
  // A tributary that ends in the water of a river that drains given an end
  // cap at its own level, as any other end, over the lower tail of the river
  // it joins.
  patch('src/13-render-water.js','capB = rv.joins ? null :','capB =','--joined-caps');
  G.__waterSources=sources;
  (0,eval)(host.slice(0,hostEnd).replace(loadLine,"manifest.parts.MAIN.forEach(function (path) { (0, eval)(G.__waterSources[path] || slurp('assets/games/' + path)); });")+'G.__waterErrors=errors; }());');
  function loadWorld(seed,walk){var st0=seed,realRandom=Math.random;Math.random=function(){st0=(st0*1103515245+12345)%2147483648;return st0/2147483648;};
    try{G.ENDLESS_MODE=G.running=true;G.gameOverState=false;G.terrain='plains';G.resetEndlessMode();if(walk)G.assembleWindow(walk[0],walk[1]);}finally{Math.random=realRandom;}return G.floorMesh;}
  function luma(hex){var n=parseInt(hex.slice(1),16);return 0.299*((n>>16)&255)+0.587*((n>>8)&255)+0.114*(n&255);}
  // The ground the floor renderer draws: each square split along NW-SE.
  function groundAt(m,x,y){var gs=m.gridSize,gx=Math.floor(x/gs),gy=Math.floor(y/gs),u=x/gs-gx,v=y/gs-gy,i=gy*m.w+gx;
    var z0=m.l0TopZ[i],z1=m.l0TopZ[i+1],z2=m.l0TopZ[i+m.w],z3=m.l0TopZ[i+m.w+1];return u>=v?z0+(z1-z0)*u+(z3-z1)*v:z0+(z3-z2)*u+(z2-z0)*v;}
  function inQuad(q,x,y){var s=0;for(var i=0;i<4;i++){var a=q[i],b=q[(i+1)%4],c=(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);if(c>0)s|=1;else if(c<0)s|=2;}return s!==3;}
  function area(p,q,r){return (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);}
  // Two home windows, and windows entered beside structures where rivers
  // drain into reserved ground: seed 6 beside a fortress (its region 11,8;
  // one river there is held back), seed 14 beside an arena and seed 8 beside
  // a watchtower (the two drained ends that used to stop at a straight edge
  // above lower ground), seed 3, whose end meets land that only the cap's
  // reach into the bank covers, seed 10 beside a watchtower, where a
  // spring's head sits by the step at the edge of its levelled ground (a cap
  // reaching on into the bank there hangs over it), and seed 1, where a
  // tributary joins a river just before that river's surface falls to its
  // drained end.
  [[11],[33],[6,[36,26]],[14,[22,23]],[8,[-15,102]],[3,[6,46]],[10,[17,12]],[1,[31,-1]]].forEach(function(win){
    var seed=win[0],m=loadWorld(seed,win[1]),w=m.w,h=m.h,gs=m.gridSize,tiles=G.buildWaterTiles(m),label='world '+seed+(win[1]?' at '+win[1]:'')+': ';
    var lakes=tiles.filter(function(t){return t.kind===1;}),ribbons=tiles.filter(function(t){return t.ribbon;});
    // Independent enumeration of floor squares with any lake corner.
    var covered=new Uint8Array(w*h),need=0,missing=0,still=G.WATER_KIND.still;
    lakes.forEach(function(t){for(var gy=t.y0/gs;gy<t.y1/gs;gy++)for(var gx=t.x0/gs;gx<t.x1/gs;gx++)covered[gy*w+gx]=1;});
    for(var y=0;y<h-1;y++)for(var x=0;x<w-1;x++){var i=y*w+x;if(m.water[i]===still||m.water[i+1]===still||m.water[i+w]===still||m.water[i+w+1]===still){need++;if(!covered[i])missing++;}}
    check(label+'every floor square touching lake water carries a lake surface',need>200&&missing===0,{need:need,missing:missing});
    // At dry points a lake surface may meet the ground but never hang above it.
    var floating=0,dryCorners=0;
    lakes.forEach(function(t){var gx0=t.x0/gs,gx1=t.x1/gs,gy0=t.y0/gs,gy1=t.y1/gs;
      for(var gy=gy0;gy<=gy1;gy++)for(var gx=gx0;gx<=gx1;gx++){var v=gy*w+gx;if(m.water[v])continue;var ground=G._waterTerrainZ(m,v);if(!(ground===ground))continue;
        // bilinear surface height at this point of the tile
        var u=(gx-gx0)/(gx1-gx0),vv=(gy-gy0)/(gy1-gy0),z=(t.z[0]*(1-u)+t.z[1]*u)*(1-vv)+(t.z[3]*(1-u)+t.z[2]*u)*vv;
        dryCorners++;if(z>ground*25+1e-4)floating++;}});
    check(label+'lake water never hangs above lower dry ground at the shoreline',dryCorners>100&&floating===0,{dry:dryCorners,floating:floating});
    // Ribbon pieces keep their orientation: a folded piece paints its bend twice.
    var folded=ribbons.filter(function(t){var q=t.quad;return area(q[0],q[1],q[2])*area(q[0],q[2],q[3])<0;}).length;
    check(label+'river ribbons do not fold over themselves at bends',ribbons.length>100&&folded===0,{ribbons:ribbons.length,folded:folded});
    // Every point of river water lies under a water surface: a ribbon piece,
    // or (where a river opens into a lake) a lake square it is a corner of.
    var riverPoints=0,uncovered=[];
    for(var r=0;r<w*h;r++){if(m.water[r]!==G.WATER_KIND.flowing)continue;riverPoints++;
      var px=(r%w)*gs,py=((r/w)|0)*gs,rx=r%w,ry=(r/w)|0,hit=false;
      for(var o=0;o<ribbons.length&&!hit;o++){var t=ribbons[o];if(Math.abs(t.cx-px)<=t.half&&Math.abs(t.cy-py)<=t.half&&inQuad(t.quad,px,py))hit=true;}
      for(var sy=ry-1;sy<=ry&&!hit;sy++)for(var sx=rx-1;sx<=rx;sx++)if(sx>=0&&sy>=0&&covered[sy*w+sx])hit=true;
      if(!hit)uncovered.push(r);}
    check(label+'every point of river water lies under a water surface',riverPoints>150&&uncovered.length===0,{points:riverPoints,uncovered:uncovered.slice(0,8)});
    // A ribbon edge over dry, open ground rests on or inside the bank: every
    // corner of every piece, the last section of each river included.
    function openDry(x,y){var gx=Math.floor(x/gs),gy=Math.floor(y/gs);if(gx<1||gy<1||gx>=w-2||gy>=h-2)return false;
      for(var dy=-1;dy<=2;dy++)for(var dx=-1;dx<=2;dx++){var v=(gy+dy)*w+gx+dx,b=G._waterWindowBed(m,v);if(!(b===b))return false;if(dy>=0&&dy<=1&&dx>=0&&dx<=1&&m.water[v])return false;}return true;}
    var edges=0,hanging=[];
    ribbons.forEach(function(t){t.quad.forEach(function(p){if(!openDry(p[0],p[1]))return;edges++;var g=groundAt(m,p[0],p[1]),S=p[2]/25;if(g<S-0.01)hanging.push(+(S-g).toFixed(3));});});
    check(label+'river ribbon edges never hang above dry open ground',edges>50&&hanging.length===0,{edges:edges,hanging:hanging.slice(0,6)});
    // Ground seen through water is never near-black.
    var beds=0,darkest=255;
    for(var y2=0;y2<h-1;y2++)for(var x2=0;x2<w-1;x2++){var j=y2*w+x2;if(m.water[j]&&m.water[j+1]&&m.water[j+w]&&m.water[j+w+1]&&typeof m.l0Color[j]==='string'){beds++;darkest=Math.min(darkest,luma(m.l0Color[j]));}}
    check(label+'ground under water is a lit lakebed, never near-black',beds>50&&darkest>=35,{beds:beds,darkest:darkest});
    // A river that drains into reserved ground ends where the land holds its
    // water: across the middle half of its last drawn section, the rendered
    // ground 1 to 12 units past that section stands at or above the section's
    // surface (the tolerance of the edge check above). Samples over squares
    // that touch closed ground, a lake or another river's water are left out;
    // this river's own water past its drawn end counts as ground below it.
    if(win[1]){var drained=G.waterRivers.filter(function(r){return r.drains;}),samples=0,low=[],unsampled=[];
      drained.forEach(function(r){var own=ribbons.filter(function(t){return Math.floor(t.cell/4096)===r.id;});
        if(!own.length){unsampled.push(r.id);return;}
        var last=own.reduce(function(a,b){return b.arc1>a.arc1?b:a;}),L=last.quad[1],R=last.quad[2],z=L[2]/25;
        var P=r.points,E=P[P.length-1],O=P[P.length-2],dx=E[0]-O[0],dy=E[1]-O[1],len=Math.hypot(dx,dy);dx/=len;dy/=len;
        var mx=(L[0]+R[0])/2,my=(L[1]+R[1])/2,before=samples;
        for(var li=-4;li<=4;li++)for(var a=1;a<=12;a++){var x=mx-dy*E[4]/2*li/4+dx*a,y=my+dx*E[4]/2*li/4+dy*a,gx=Math.floor(x/gs),gy=Math.floor(y/gs),ok=gx>=0&&gy>=0&&gx<w-1&&gy<h-1;
          for(var cy=0;cy<=1&&ok;cy++)for(var cx=0;cx<=1&&ok;cx++){var c=(gy+cy)*w+gx+cx,g0=G._waterPlainGround(m,c);
            if(!(g0===g0)||(m.water[c]&&(m.water[c]!==G.WATER_KIND.flowing||m.waterBody[c]!==r.body)))ok=false;}
          if(!ok)continue;samples++;var g=groundAt(m,x,y);if(g<z-0.01)low.push([r.id,li,a,+(z-g).toFixed(3)]);}
        if(samples===before)unsampled.push(r.id);});
      check(label+'a river that drains into reserved ground ends where the land holds its water: no ground within 12 units past its drawn end lies below it',
        drained.length>=1&&!unsampled.length&&samples>=50*drained.length&&low.length===0,{drained:drained.length,samples:samples,unsampled:unsampled,low:low.slice(0,6)});}
  });
  // The toggle restores every ground colour of a world generated without the system.
  G.WATER_SYSTEM_ENABLED=false;var pristine=loadWorld(11).l0Color.slice();G.WATER_SYSTEM_ENABLED=true;
  var on=loadWorld(11),changed=0;for(var c=0;c<pristine.length;c++)if(on.l0Color[c]!==pristine[c])changed++;
  G.setWaterSystemEnabled(false);var off=G.floorMesh,restored=off!==on&&off.l0Color.every(function(col,i){return col===pristine[i];});
  check('switching water off restores every ground colour the system changed',changed>100&&restored&&G.__waterErrors.length===0,{changed:changed});
  G.setWaterSystemEnabled(true);
  out('WATER_RENDER_RESULT PASS '+checks);
}());
undefined;
