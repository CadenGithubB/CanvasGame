load('prelude.js'); load('game_body.js');
window._caveTestSeedOverride = (typeof __seed !== 'undefined') ? __seed : 12345;
CAVE_TEST_MODE = true; ENDLESS_MODE = true; terrain = 'plains';
caveTestFlags.caveEnemies = false; caveTestFlags.caveChests = false;
resetEndlessMode(); MODE3D = true; USE_KEYBOARD = true; running = true;
var net = endlessCaveNetworks['0,0']; var E = net.entrances[0];
var outDX = -Math.cos(E.angle), outDY = -Math.sin(E.angle);
function alongOf() { var wx = pos.x + windowOriginX - E.x, wy = pos.y + windowOriginY - E.y; return wx*outDX + wy*outDY; }
function perpOf() { var wx = pos.x + windowOriginX - E.x, wy = pos.y + windowOriginY - E.y; return wx*(-outDY) + wy*outDX; }
function hOf() { return (pos.floorZ - 60) / 40; }
function place(al, h) { pos.x = E.x + outDX*al - windowOriginX; pos.y = E.y + outDY*al - windowOriginY; vel.x = 0; vel.y = 0; if (h !== undefined) pos.floorZ = 60 + h*40; jumpAirborne = false; jumpVelZ = 0; }
function surfH(al) { var lx = E.x + outDX*al - windowOriginX, ly = E.y + outDY*al - windowOriginY; var i = Math.floor(ly/12)*floorMesh.w + Math.floor(lx/12); return floorMesh.surfaceH[i]; }
function layersStr() { var m=floorMesh, i=Math.floor(pos.y/12)*m.w+Math.floor(pos.x/12), lc=m.layerCount[i], Z=[m.l0TopZ,m.l1TopZ,m.l2TopZ,m.l3TopZ,m.l4TopZ], T=[m.l0Type,m.l1Type,m.l2Type,m.l3Type,m.l4Type], o=[]; for (var li=0;li<lc;li++) o.push(T[li][i]+'@'+Z[li][i].toFixed(2)); return o.join(' '); }
function walk(label, fromAl, toAl, startH, maxTicks) {
  print('\n=== WALK ' + label + ': along ' + fromAl + ' -> ' + toAl + ' (startH=' + startH.toFixed(2) + ') ===');
  place(fromAl, startH);
  var dir = toAl < fromAl ? 1 : -1; // inward = toward decreasing along
  var prevUG = null, prevH = hOf(), prevAir = false, events = [], t = 0, maxDh = 0, lastPrintAl = 1e9;
  for (t = 0; t < maxTicks; t++) {
    // steer toward a point on the axis 60u ahead
    var tgtAl = alongOf() - dir*60; var tx = E.x + outDX*tgtAl - windowOriginX, ty = E.y + outDY*tgtAl - windowOriginY;
    cam.ang = Math.atan2(ty - pos.y, tx - pos.x); kbState.up = true;
    handleInput(FIXED_DT); gameUpdate(FIXED_DT);
    cam.x = pos.x; cam.y = pos.y; cam.z = pos.floorZ;
    var h = hOf(), al = alongOf(), w = getWalkableLayerTopAt(pos.x, pos.y, h);
    var dh = h - prevH; if (Math.abs(dh) > Math.abs(maxDh)) maxDh = dh;
    if (prevUG !== null && playerUnderground !== prevUG) events.push('t=' + t + ' along=' + al.toFixed(0) + ' UNDERGROUND ' + prevUG + '->' + playerUnderground + ' h=' + h.toFixed(2) + ' ambient=' + ambientLight.toFixed(2) + ' layers[' + layersStr() + ']');
    if (jumpAirborne !== prevAir) events.push('t=' + t + ' along=' + al.toFixed(0) + ' AIRBORNE ' + prevAir + '->' + jumpAirborne + ' h=' + h.toFixed(2) + ' layers[' + layersStr() + ']');
    if (Math.abs(dh) > 0.35) events.push('t=' + t + ' along=' + al.toFixed(0) + ' ZJUMP dh=' + dh.toFixed(2) + ' h=' + h.toFixed(2) + ' pick=' + w.action + '/idx' + w.idx + '/t' + w.type + '@' + w.topH.toFixed(2) + ' layers[' + layersStr() + ']');
    if (w.idx === -1 && w.type === 0 && w.topH === 0) events.push('t=' + t + ' along=' + al.toFixed(0) + ' NO-CANDIDATE fallback(topH=0) h=' + h.toFixed(2) + ' layers[' + layersStr() + ']');
    prevUG = playerUnderground; prevH = h; prevAir = jumpAirborne;
    if (Math.abs(al - lastPrintAl) >= 36) { lastPrintAl = al; print('  t=' + String(t).padStart(4) + ' along=' + al.toFixed(0).padStart(5) + ' perp=' + perpOf().toFixed(0).padStart(4) + ' h=' + h.toFixed(2).padStart(6) + ' eyeH=' + (h+2.4).toFixed(2).padStart(6) + ' UG=' + (playerUnderground?1:0) + ' air=' + (jumpAirborne?1:0) + ' amb=' + ambientLight.toFixed(2) + ' pick=' + w.action + '/idx' + w.idx + ' layers[' + layersStr() + ']'); }
    if ((dir === 1 && al <= toAl) || (dir === -1 && al >= toAl)) break;
  }
  print('  -- finished at t=' + t + ' along=' + alongOf().toFixed(0) + ' h=' + hOf().toFixed(2) + ' maxTickDh=' + maxDh.toFixed(2));
  print('  EVENTS (' + events.length + '):'); for (var i = 0; i < Math.min(events.length, 40); i++) print('    ' + events[i]);
  if (events.length > 40) print('    ... ' + (events.length - 40) + ' more');
}
settings.dayNight = true;
walk('IN  (surface -> cave)', 470, -150, surfH(470), 3000);
walk('OUT (cave -> surface)', -150, 470, hOf(), 3000);
