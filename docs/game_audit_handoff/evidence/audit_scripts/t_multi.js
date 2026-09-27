load('prelude.js'); load('game_body.js');
// ---- (1) cave rarity in NORMAL endless mode (no assembly needed)
print('(1) CAVE RARITY, normal Endless (CAVE_TEST_MODE=false). Regions are 1440u squares; scanning 41x41 regions (+-29,500u) per seed');
CAVE_TEST_MODE = false; ENDLESS_MODE = true;
[12345, 1, 777, 424242, 999983].forEach(function(seed){
  WORLD_SEED = seed; noiseSeed = (seed*7+42)|0; _biomeSeed = (seed*13+999)|0; _geoSeed = (seed*19+5555)|0; endlessCaveNetworks = {};
  var n=0, caveBiome=0, nets=0, nearest=1e9, ent2=0, ent1=0;
  for (var ry=-20; ry<=20; ry++) for (var rx=-20; rx<=20; rx++){ n++;
    var cwx=(rx*3+1)*480+240, cwy=(ry*3+1)*480+240; if (getBiomeAt(cwx,cwy)==='cave') caveBiome++;
    var net=generateCaveNetwork(rx,ry); if (net){ nets++; if (net.entrances.length===2) ent2++; else ent1++; for (var k=0;k<net.entrances.length;k++){ var d=Math.hypot(net.entrances[k].x-240, net.entrances[k].y-240); if (d<nearest) nearest=d; } } }
  print('  seed ' + String(seed).padStart(6) + ': cave-biome regions ' + caveBiome + '/' + n + ' (' + (100*caveBiome/n).toFixed(1) + '%), regions WITH a cave network ' + nets + ' (' + (100*nets/n).toFixed(2) + '%), nearest entrance to spawn = ' + (nearest<1e9?nearest.toFixed(0)+'u (~' + (nearest/90).toFixed(0) + 's walk)':'NONE within 29,500u') + ', networks with 2 entrances: ' + ent2 + ', with 1: ' + ent1);
});
// ---- (2) structural entrance metrics across cave-test seeds
print('\n(2) ENTRANCE STRUCTURE across Cave Test seeds (assembled mesh, entrance[0] axis, along>0 = outside)');
function metrics(seed){
  window._caveTestSeedOverride = seed; CAVE_TEST_MODE = true; ENDLESS_MODE = true; terrain='plains'; resetEndlessMode();
  var net=endlessCaveNetworks['0,0'], E=net.entrances[0], ox=-Math.cos(E.angle), oy=-Math.sin(E.angle), m=floorMesh;
  var T=[m.l0Type,m.l1Type,m.l2Type,m.l3Type,m.l4Type], Zs=[m.l0TopZ,m.l1TopZ,m.l2TopZ,m.l3TopZ,m.l4TopZ];
  var roofMax=-1e9, uncapMin=1e9, uncapMax=-1e9, maxCliff=0, cliffAt=0, prevF=null, minHead=1e9, minHeadAt=0, surfAtE=null, eyeAboveCeilSpan=0;
  for (var al=516; al>=-120; al-=6){ var lx=E.x+ox*al-windowOriginX, ly=E.y+oy*al-windowOriginY; var i=Math.floor(ly/12)*m.w+Math.floor(lx/12); var lc=m.layerCount[i], f=null,c=null,cap=null;
    for (var li=0;li<lc;li++){ var t=T[li][i], z=Zs[li][i]; if(t===1&&f===null)f=z; if(t===2)c=z; if(t===4)cap=z; }
    if (al===0) surfAtE=m.surfaceH[i];
    if (c!==null && al>roofMax) roofMax=al;
    if (c!==null && cap===null){ if(al<uncapMin)uncapMin=al; if(al>uncapMax)uncapMax=al; }
    if (prevF!==null && Math.abs(f-prevF)>Math.abs(maxCliff)){ maxCliff=f-prevF; cliffAt=al; }
    if (c!==null && f<c && al>0){ var hd=c-f; if(hd<minHead){minHead=hd;minHeadAt=al;} if (hd<2.4) eyeAboveCeilSpan+=6; }
    prevF=f; }
  var c0=net.corridors[0];
  return 'seed ' + String(seed).padStart(6) + ': ents=' + net.entrances.length + ' depth=' + c0.depth.toFixed(2) + ' (approach uses ' + (E.depth||5) + ') surfAtE=' + surfAtE.toFixed(2) + ' | roof (ceiling+cap) starts ' + roofMax + 'u OUTSIDE the arch | cap hole spans along[' + uncapMin + ',' + uncapMax + '] | worst floor step on axis ' + maxCliff.toFixed(2) + ' @along=' + cliffAt + ' | min headroom outside arch ' + minHead.toFixed(2) + ' @' + minHeadAt + ' | span where eye(2.4) is above ceiling: ' + eyeAboveCeilSpan + 'u';
}
[12345, 1, 777, 424242].forEach(function(s){ print('  ' + metrics(s)); });
