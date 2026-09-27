load('prelude.js'); load('game_body.js');
window._caveTestSeedOverride = (typeof __seed !== 'undefined') ? __seed : 12345;
CAVE_TEST_MODE = true; ENDLESS_MODE = true; terrain = 'plains';
resetEndlessMode();
var m = floorMesh, W = m.w, H = m.h;
var Z=[m.l0TopZ,m.l1TopZ,m.l2TopZ,m.l3TopZ,m.l4TopZ], T=[m.l0Type,m.l1Type,m.l2Type,m.l3Type,m.l4Type];
function walkable(t){ return t===1||t===3||t===4; }
function topWalk(i){ for (var li=m.layerCount[i]-1; li>=0; li--) if (walkable(T[li][i])) return {z:Z[li][i], li:li, t:T[li][i]}; return null; }
function ceilOf(i){ for (var li=0; li<m.layerCount[i]; li++) if (T[li][i]===2) return Z[li][i]; return null; }
function lay(i){ var o=[]; for (var li=0; li<m.layerCount[i]; li++) o.push(T[li][i]+'@'+Z[li][i].toFixed(2)); return o.join(' '); }
function entDist(i){ var x=(i%W+0.5)*12, y=((i/W)|0)*12+6, b=1e9; for (var k=0;k<deepCaveEntrances.length;k++){ var d=Math.hypot(x-deepCaveEntrances[k].x,y-deepCaveEntrances[k].y); if(d<b)b=d;} return b; }
// ---- static mesh stats
var st = {cells:W*H, caveCells:0, capCells:0, ceilNoCap:0, l0IsCeil:0, floorAboveCeil:0, capClamped:0, headroomLt24:0, headroomLt1:0, capBelowSurfNeighbor:0};
for (var i=0;i<W*H;i++){
  var c = ceilOf(i); if (c===null) continue; st.caveCells++;
  var hasCap=false, floorZ=null; for (var li=0; li<m.layerCount[i]; li++){ if (T[li][i]===4) hasCap=true; if (T[li][i]===1 && floorZ===null) floorZ=Z[li][i]; }
  if (hasCap) st.capCells++; else st.ceilNoCap++;
  if (T[0][i]===2) st.l0IsCeil++;
  if (floorZ!==null && floorZ >= c) st.floorAboveCeil++;
  if (floorZ!==null && floorZ < c && c-floorZ < 2.4) st.headroomLt24++;
  if (floorZ!==null && floorZ < c && c-floorZ < 1.0) st.headroomLt1++;
  if (hasCap && m.surfaceH[i] < c + 0.25 - 1e-6) st.capClamped++;
}
print('MESH STATS (seed ' + WORLD_SEED + ', window ' + W + 'x' + H + '): ' + JSON.stringify(st));
// ---- transition scan: player standing on top walkable of n steps into adjacent c
var dirs=[[1,0],[-1,0],[0,1],[0,-1]];
var cnt={pairs:0, fallThrough:0, fallThroughNearEnt:0, noCandidate:0, noCandNonZero:0, bigDropSurface:0};
var ex=[], exNC=[];
for (var y=1;y<H-1;y++) for (var x=1;x<W-1;x++){
  var n=y*W+x, tn=topWalk(n); if(!tn) continue;
  for (var d=0; d<4; d++){
    var cx=x+dirs[d][0], cy=y+dirs[d][1], c=cy*W+cx; cnt.pairs++;
    var r=getWalkableLayerTopAt((cx+0.5)*12,(cy+0.5)*12,tn.z), tc=topWalk(c); if(!tc) continue;
    if (r.idx===-1 && r.type===0) { cnt.noCandidate++; if (Math.abs(tn.z) > 1.0) { cnt.noCandNonZero++; if (exNC.length<6) exNC.push('from['+lay(n)+'] h='+tn.z.toFixed(2)+' -> ['+lay(c)+'] => target h=0 (entDist='+entDist(c).toFixed(0)+')'); } continue; }
    if (r.topH < tc.z - 1.0) { // ends up beneath the destination's top walkable layer
      var ed=entDist(c);
      if (ed < 35) cnt.fallThroughNearEnt++; else { cnt.fallThrough++; if (ex.length<10) ex.push('cell('+cx+','+cy+') entDist='+ed.toFixed(0)+' from['+lay(n)+'] h='+tn.z.toFixed(2)+' -> ['+lay(c)+'] picker='+r.action+'@'+r.topH.toFixed(2)+' surfH='+m.surfaceH[c].toFixed(2)); }
    }
  }
}
print('TRANSITION SCAN (surface walker, 4-neighbour steps): ' + JSON.stringify(cnt));
print('  fall-through examples (destination top layer is >1.0 above where the picker puts you, not at the entrance hole):'); ex.forEach(function(s){print('    '+s);});
print('  no-candidate examples:'); exNC.forEach(function(s){print('    '+s);});
