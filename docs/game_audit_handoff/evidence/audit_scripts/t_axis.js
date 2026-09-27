load('prelude.js'); load('game_body.js');
var seed = (typeof __seed !== 'undefined') ? __seed : 12345;
window._caveTestSeedOverride = seed;
CAVE_TEST_MODE = true; ENDLESS_MODE = true; terrain = 'plains';
resetEndlessMode();
var net = endlessCaveNetworks['0,0'];
print('seed=' + WORLD_SEED + ' WINDOW_CHUNKS=' + WINDOW_CHUNKS + ' viewDist=' + viewDist + ' mesh=' + floorMesh.w + 'x' + floorMesh.h + ' _ampBoost=' + _ampBoost);
print('network: entrances=' + net.entrances.length + ' corridors=' + net.corridors.length + ' chambers=' + net.chambers.length);
for (var i = 0; i < net.entrances.length; i++) { var e = net.entrances[i]; print('  ent[' + i + '] x=' + e.x.toFixed(1) + ' y=' + e.y.toFixed(1) + ' angle=' + e.angle.toFixed(3) + ' keys=' + Object.keys(e).join(',') + ' depthField=' + e.depth); }
var c0 = net.corridors[0]; print('  corridor[0] width=' + c0.width.toFixed(1) + ' depth=' + c0.depth.toFixed(2) + ' ceilH=' + c0.ceilH.toFixed(2) + ' => hw+108=' + (c0.width/2+108).toFixed(1));
print('deepCaveEntrances=' + JSON.stringify(deepCaveEntrances.map(function(d){return {x:+d.x.toFixed(1),y:+d.y.toFixed(1),depth:d.depth,ceilH:d.ceilH};})));
print('player spawn pos=(' + pos.x.toFixed(1) + ',' + pos.y.toFixed(1) + ') floorZ=' + pos.floorZ);
function layersAt(wx, wy) { // window-local
  var m = floorMesh, gx = Math.floor(wx/12), gy = Math.floor(wy/12); if (gx<0||gy<0||gx>=m.w||gy>=m.h) return null;
  var i = gy*m.w+gx, lc = m.layerCount[i], out = [];
  var Z=[m.l0TopZ,m.l1TopZ,m.l2TopZ,m.l3TopZ,m.l4TopZ], T=[m.l0Type,m.l1Type,m.l2Type,m.l3Type,m.l4Type];
  for (var li=0; li<lc; li++) out.push(T[li][i] + '@' + Z[li][i].toFixed(2));
  return {i:i, s:out.join(' '), surf:m.surfaceH[i], lc:lc};
}
var E = net.entrances[0]; var outDX = -Math.cos(E.angle), outDY = -Math.sin(E.angle);
print('\nAXIS PROFILE ent[0] (along>0 = outside). cols: along | surfH | layers(type@Z: 1=floor 2=ceil 4=cap) | wall gridCave | gen: source fade floorZ ceilZ mouth carve');
var prevL0 = null;
for (var along = 516; along >= -240; along -= 12) {
  var wxW = E.x + outDX*along, wyW = E.y + outDY*along;       // world
  var lx = wxW - windowOriginX, ly = wyW - windowOriginY;      // window-local
  var L = layersAt(lx, ly); if (!L) { print(along + ' out of window'); continue; }
  var gx = Math.floor(lx/cell), gy = Math.floor(ly/cell); var gi = gy*gridW+gx;
  var g = queryCaveGeometry(wxW, wyW, [net], 2.0);
  var l0 = floorMesh.l0TopZ[L.i];
  var jump = (prevL0 !== null && Math.abs(l0 - prevL0) > 1.0) ? '  <<< dL0=' + (l0-prevL0).toFixed(2) : '';
  prevL0 = l0;
  print(String(along).padStart(5) + ' | ' + L.surf.toFixed(2).padStart(6) + ' | ' + L.s.padEnd(30) + ' | w' + grid[gi] + ' c' + gridCave[gi] + ' | ' + (g ? (g.source + ' f=' + g.fade.toFixed(2) + ' fz=' + g.caveFloorZ.toFixed(2) + ' cz=' + (g.ceilZ===null?'null':g.ceilZ.toFixed(2)) + (g.isEntrance?' MOUTH':'') + (g.wallCarve?' carve':'')) : 'null') + jump);
}
