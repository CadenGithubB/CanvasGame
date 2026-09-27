load('prelude.js'); load('game_body.js');
window._caveTestSeedOverride = (typeof __seed !== 'undefined') ? __seed : 12345;
CAVE_TEST_MODE = true; ENDLESS_MODE = true; terrain = 'plains';
caveTestFlags.caveEnemies = false; caveTestFlags.caveChests = false;
resetEndlessMode(); MODE3D = true; USE_KEYBOARD = true; running = true;
function M(){ return floorMesh; }
function walkable(t){ return t===1||t===3||t===4; }
function arrs(){ var m=M(); return {Z:[m.l0TopZ,m.l1TopZ,m.l2TopZ,m.l3TopZ,m.l4TopZ], T:[m.l0Type,m.l1Type,m.l2Type,m.l3Type,m.l4Type]}; }
function topWalkI(i){ var a=arrs(), m=M(); for (var li=m.layerCount[i]-1; li>=0; li--) if (walkable(a.T[li][i])) return a.Z[li][i]; return null; }
function layI(i){ var a=arrs(), m=M(), o=[]; for (var li=0; li<m.layerCount[i]; li++) o.push(a.T[li][i]+'@'+a.Z[li][i].toFixed(2)); return o.join(' '); }
function idxAtWorld(wx,wy){ var m=M(); return Math.floor((wy-windowOriginY)/12)*m.w + Math.floor((wx-windowOriginX)/12); }
function hOf(){ return (pos.floorZ-60)/40; }
function teleportWorld(wx, wy){ pos.x = wx - windowOriginX; pos.y = wy - windowOriginY; vel.x=0; vel.y=0; updateChunks(); var i=idxAtWorld(wx,wy); pos.floorZ = 60 + topWalkI(i)*40; jumpAirborne=false; jumpVelZ=0; cam.x=pos.x; cam.y=pos.y; cam.z=pos.floorZ; }
// (A) locate a no-candidate pair (single-layer -> single-layer), in WORLD coords
var m0=M(), W=m0.w, H=m0.h, dirs=[[1,0],[-1,0],[0,1],[0,-1]], found=null;
for (var y=1;y<H-1 && !found;y++) for (var x=1;x<W-1 && !found;x++){ var n=y*W+x; if (m0.layerCount[n]!==1) continue; var tn=topWalkI(n); if (tn===null||Math.abs(tn)<1.2) continue;
  for (var d=0; d<4; d++){ var cx=x+dirs[d][0], cy=y+dirs[d][1], c=cy*W+cx; if (m0.layerCount[c]!==1) continue; var r=getWalkableLayerTopAt((cx+0.5)*12,(cy+0.5)*12,tn); if (r.idx===-1 && r.type===0){ found={wx:(x+0.5)*12+windowOriginX, wy:(y+0.5)*12+windowOriginY, d:dirs[d]}; break; } } }
print('(A) NO-CANDIDATE SINK TEST (real step(), 60Hz, walking speed)');
if (!found) print('  none found'); else {
  teleportWorld(found.wx - found.d[0]*30, found.wy - found.d[1]*30);
  var iN=idxAtWorld(found.wx,found.wy), iC=idxAtWorld(found.wx+found.d[0]*12, found.wy+found.d[1]*12);
  print('  step pair world=(' + found.wx.toFixed(0) + ',' + found.wy.toFixed(0) + ') dir=' + found.d + ': [' + layI(iN) + '] -> [' + layI(iC) + ']  (rise ' + (topWalkI(iC)-topWalkI(iN)).toFixed(2) + ' > STEP_UP 1.0)');
  cam.ang=Math.atan2(found.d[1],found.d[0]); var sunkTicks=0, eyeBelow=0;
  for (var t=0;t<200;t++){ kbState.up=true; handleInput(FIXED_DT); gameUpdate(FIXED_DT); cam.x=pos.x; cam.y=pos.y; cam.z=pos.floorZ;
    var i=idxAtWorld(pos.x+windowOriginX,pos.y+windowOriginY), tw=topWalkI(i), h=hOf(); if (h < tw-1.0) sunkTicks++; if (h+2.4 < tw) eyeBelow++;
    if (t%10===0) print('   t=' + String(t).padStart(3) + ' world=(' + (pos.x+windowOriginX).toFixed(0) + ',' + (pos.y+windowOriginY).toFixed(0) + ') terrainTop=' + tw.toFixed(2) + ' playerH=' + h.toFixed(2) + ' eyeH=' + (h+2.4).toFixed(2) + ' air=' + (jumpAirborne?1:0) + (h+2.4 < tw ? '  <<< EYE BELOW TERRAIN' : (h < tw-1.0 ? '  << feet ' + (tw-h).toFixed(2) + ' below terrain' : ''))); }
  print('  summary: ticks with feet >1.0 below terrain = ' + sunkTicks + '/200, ticks with EYE below terrain = ' + eyeBelow + '/200');
}
// (B) lateral walk inside the cave
var net = endlessCaveNetworks['0,0']; var E = net.entrances[0]; var inX=Math.cos(E.angle), inY=Math.sin(E.angle);
print('\n(B) LATERAL WALK INSIDE CAVE: start on corridor axis 150u inside, walk perpendicular (real step())');
var sx=E.x+inX*150, sy=E.y+inY*150; pos.x=sx-windowOriginX; pos.y=sy-windowOriginY; vel.x=0; vel.y=0; updateChunks();
pos.floorZ = 60 + M().l0TopZ[idxAtWorld(sx,sy)]*40; jumpAirborne=false; jumpVelZ=0; cam.x=pos.x; cam.y=pos.y; cam.z=pos.floorZ;
cam.ang = E.angle + Math.PI/2; var prevH=hOf(), prevUG=null, jolts=0;
for (var t=0;t<330;t++){ kbState.up=true; handleInput(FIXED_DT); gameUpdate(FIXED_DT); cam.x=pos.x; cam.y=pos.y; cam.z=pos.floorZ;
  var wx=pos.x+windowOriginX, wy=pos.y+windowOriginY, i=idxAtWorld(wx,wy), h=hOf(), dh=h-prevH; if (Math.abs(dh)>0.5) jolts++;
  var gi=Math.floor(pos.y/cell)*gridW+Math.floor(pos.x/cell); var lateral=(wx-sx)*(-inY)+(wy-sy)*inX;
  if (t%15===0 || Math.abs(dh)>0.5 || (prevUG!==null && prevUG!==playerUnderground)) print('   t=' + String(t).padStart(3) + ' lateral=' + lateral.toFixed(0).padStart(4) + ' h=' + h.toFixed(2).padStart(6) + ' dh=' + dh.toFixed(2).padStart(5) + ' UG=' + (playerUnderground?1:0) + ' air=' + (jumpAirborne?1:0) + ' gridWall=' + grid[gi] + ' layers[' + layI(i) + ']' + (Math.abs(dh)>0.5?'  <<< JOLT':'') + ((prevUG!==null && prevUG!==playerUnderground)?'  <<< UG FLIP':''));
  prevH=h; prevUG=playerUnderground; }
print('  jolts(|dh|>0.5/tick)=' + jolts + '  final h=' + hOf().toFixed(2) + ' UG=' + playerUnderground);
