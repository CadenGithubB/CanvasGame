load('prelude.js'); load('game_body.js');
var _r = Math.random; var seeds=[0.123455, 0.5, 0.777]; var si=0;
function frac(label){ var m=floorMesh,n=m.w*m.h,low=0; for (var i=0;i<n;i++) if (m.l0TopZ[i] < -0.1) low++;
  var eLow=0; for (var k=0;k<enemies.length;k++) if (getFloorHeightAt(enemies[k].x,enemies[k].y) < -0.1) eLow++;
  var cLow=0; for (var k2=0;k2<treasureChests.length;k2++) if (getFloorHeightAt(treasureChests[k2].x,treasureChests[k2].y) < -0.1) cLow++;
  var sLow=0; for (var k3=0;k3<floorScatter.length;k3++) if (getFloorHeightAt(floorScatter[k3].x,floorScatter[k3].y) < -0.1) sLow++;
  print('  ' + label + ': mesh cells with l0<-0.1 = ' + (100*low/n).toFixed(1) + '%   enemies on such cells ' + eLow + '/' + enemies.length + '   chests ' + cLow + '/' + treasureChests.length + '   scatter ' + sLow + '/' + floorScatter.length + '   (caves in window: ' + deepCaveEntrances.length + ' entrances)'); }
print('ENTITY CULL RULE line 511: `!playerUnderground && getFloorHeightAt(entity) < -0.1` => entity not drawn. Normal Endless, player on surface:');
seeds.forEach(function(s){ Math.random=function(){ return s; }; CAVE_TEST_MODE=false; ENDLESS_MODE=true; resetEndlessMode(); Math.random=_r;
  print(' seed ' + WORLD_SEED); frac('spawn window      '); assembleWindow(12, -9); frac('window @chunk(12,-9)'); assembleWindow(-25, 30); frac('window @chunk(-25,30)'); });
