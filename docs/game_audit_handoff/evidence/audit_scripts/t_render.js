load('prelude.js'); load('game_body.js');
window._caveTestSeedOverride = 12345; CAVE_TEST_MODE = true; ENDLESS_MODE = true; terrain='plains';
caveTestFlags.caveEnemies=false; caveTestFlags.caveChests=false;
resetEndlessMode(); MODE3D = true; running = true;
// recording 2D context
var rec = [], curPts = [], curStyle = '', curAlpha = 1;
var recCtx = new Proxy({}, { get: function(t,k){
    if (k==='beginPath') return function(){ curPts=[]; };
    if (k==='moveTo'||k==='lineTo') return function(x,y){ curPts.push(x,y); };
    if (k==='fill') return function(){ rec.push({s:curStyle, a:curAlpha, p:curPts.slice()}); };
    if (k==='fillStyle') return curStyle; if (k==='globalAlpha') return curAlpha;
    if (k==='createLinearGradient'||k==='createRadialGradient') return function(){ return {addColorStop:function(){}}; };
    if (k==='measureText') return function(){ return {width:10}; };
    return function(){}; },
  set: function(t,k,v){ if (k==='fillStyle') curStyle=v; else if (k==='globalAlpha') curAlpha=v; return true; } });
ctx = recCtx;
function cls(s){ if (typeof s!=='string') return 'other'; var mm=s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/); if(!mm) return 'other'; var r=+mm[1],g=+mm[2],b=+mm[3];
  if (s==='rgb(60, 42, 28)') return 'skirt'; if (r===0 && b>g) return 'CAP(blue)'; if (b>r && r>g) return 'CEIL(purple)'; if (g>r && g>b) return 'SURFACE(green)';
  if (r>g && g>b){ return (g/r>0.7) ? 'TILTED(yellow)' : 'CAVEFLOOR(orange)'; } return 'other'; }
var net=endlessCaveNetworks['0,0'], E=net.entrances[0], ox=-Math.cos(E.angle), oy=-Math.sin(E.angle);
function view(label, al, faceInward){
  var wx=E.x+ox*al, wy=E.y+oy*al; pos.x=wx-windowOriginX; pos.y=wy-windowOriginY; vel.x=0; vel.y=0; updateChunks();
  var m=floorMesh, i=Math.floor(pos.y/12)*m.w+Math.floor(pos.x/12);
  // stand on the LOWEST walkable layer at this spot (on the ramp / cave floor)
  var T=[m.l0Type,m.l1Type,m.l2Type,m.l3Type,m.l4Type], Zs=[m.l0TopZ,m.l1TopZ,m.l2TopZ,m.l3TopZ,m.l4TopZ], fz=null; for (var li=0; li<m.layerCount[i]; li++) if (T[li][i]===1){ fz=Zs[li][i]; break; }
  pos.floorZ=60+fz*40; jumpAirborne=false; cam.x=pos.x; cam.y=pos.y; cam.z=pos.floorZ; cam.pitch=0; cam.ang = faceInward ? E.angle : E.angle+Math.PI;
  settings.dayNight=true; updateDayNight(1/60);
  projScale = canvas.height*(180/CANVAS_BASE_H); resScale = canvas.height/CANVAS_BASE_H; _floorCacheTick++;
  var C=getCam3D(); DEBUG_POLY_TYPES=true;
  rec=[]; drawLayersCeiling3D(); var ceilFills=rec.length, cs={collected:__caveStats.ceilCollected, rendered:__caveStats.ceilRendered};
  rec=[]; drawLayersFloor3D(); var tally={}, overhead={};
  for (var k=0;k<rec.length;k++){ var c=cls(rec[k].s); tally[c]=(tally[c]||0)+1; var p=rec[k].p, allAbove=p.length>=8; for (var q=1;q<p.length;q+=2) if (p[q]>=C.horizonY) allAbove=false; if (allAbove) overhead[c]=(overhead[c]||0)+1; }
  DEBUG_POLY_TYPES=false;
  print('\n' + label + '  [along=' + al + ', feet h=' + fz.toFixed(2) + ', eye h=' + (fz+2.4).toFixed(2) + ', facing ' + (faceInward?'INTO cave':'OUT of cave') + ', playerUnderground=' + playerUnderground + ', ambient=' + ambientLight.toFixed(2) + ']');
  print('   ceiling pass : ceilings stitched=' + cs.collected + '  actually drawn=' + cs.rendered);
  print('   floor pass   : ' + JSON.stringify(tally) + '   __caveFloorRendered=' + window.__caveFloorRendered);
  print('   floor-pass quads drawn entirely ABOVE the horizon (i.e. overhead, seen from below): ' + JSON.stringify(overhead));
}
view('V1 deep inside cave', -150, true);
view('V2 inside cave looking OUT toward the mouth', -60, false);
view('V3 standing in the cap-hole disc at the arch (UG flips false)', 0, true);
view('V4 on the open approach ramp looking INTO the tunnel', 260, true);
view('V5 on the ramp right at the roof edge, looking in', 232, true);
