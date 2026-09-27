load('prelude.js'); load('game_body.js');
window._caveTestSeedOverride = 12345; CAVE_TEST_MODE = true; ENDLESS_MODE = true; terrain='plains';
caveTestFlags.caveEnemies=false; caveTestFlags.caveChests=false;
resetEndlessMode(); MODE3D=true; running=true; USE_KEYBOARD=true;
function lay(){ var m=floorMesh,i=Math.floor(pos.y/12)*m.w+Math.floor(pos.x/12),T=[m.l0Type,m.l1Type,m.l2Type,m.l3Type,m.l4Type],Z=[m.l0TopZ,m.l1TopZ,m.l2TopZ,m.l3TopZ,m.l4TopZ],o=[];for(var li=0;li<m.layerCount[i];li++)o.push(T[li][i]+'@'+Z[li][i].toFixed(2));return o.join(' ');}
print('CAVE TEST DEFAULT SPAWN (comment 7612: "Stand 60 units outside the entrance"): h0=' + ((pos.floorZ-60)/40).toFixed(2) + ' layers[' + lay() + ']');
for (var t=0;t<90;t++){ gameUpdate(FIXED_DT); if (t===0||t===5||t===20||t===89) print('  t=' + t + ' h=' + ((pos.floorZ-60)/40).toFixed(2) + ' air=' + jumpAirborne + ' playerUnderground=' + playerUnderground + ' ambient=' + ambientLight.toFixed(2)); }
print('\nDAY/NIGHT OFF: playerUnderground freeze test');
var ugInside = playerUnderground; settings.dayNight=false;
var net=endlessCaveNetworks['0,0'],E=net.entrances[0],ox=-Math.cos(E.angle),oy=-Math.sin(E.angle);
pos.x=E.x+ox*450-windowOriginX; pos.y=E.y+oy*450-windowOriginY; pos.floorZ=400; vel.x=0; vel.y=0;
for (var t=0;t<240;t++) gameUpdate(FIXED_DT);
print('  moved player to open surface 450u outside entrance: h=' + ((pos.floorZ-60)/40).toFixed(2) + ' layers[' + lay() + ']  playerUnderground=' + playerUnderground + ' (was ' + ugInside + ' when dayNight was switched off)');
settings.dayNight=true; gameUpdate(FIXED_DT); print('  dayNight back on, one tick later: playerUnderground=' + playerUnderground);
