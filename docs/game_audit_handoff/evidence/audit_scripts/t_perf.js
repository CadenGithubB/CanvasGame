load('prelude.js'); load('game_body.js');
var fills=0, paths=0, styleSets=0, gradients=0;
var cctx = new Proxy({}, { get:function(t,k){ if(k==='fill'||k==='fillRect') return function(){fills++;}; if(k==='beginPath') return function(){paths++;};
   if(k==='createLinearGradient'||k==='createRadialGradient') return function(){ gradients++; return {addColorStop:function(){}}; };
   if(k==='measureText') return function(){return {width:10};}; if(k==='fillStyle'||k==='strokeStyle') return ''; if(k==='globalAlpha') return 1; return function(){}; },
   set:function(t,k,v){ if(k==='fillStyle') styleSets++; return true; } });
function bench(label){
  ctx = cctx; projScale = canvas.height*(180/CANVAS_BASE_H); resScale = canvas.height/CANVAS_BASE_H; cam.x=pos.x; cam.y=pos.y; cam.z=pos.floorZ; cam.pitch=0;
  settings.dayNight=true; updateDayNight(1/60);
  var passes={ceil:drawLayersCeiling3D, floor:drawLayersFloor3D, walls:drawWalls3D, sky:drawSkybox3D}, out=[];
  for (var name in passes){ for (var w=0;w<15;w++){ _floorCacheTick++; cam.ang+=0.05; passes[name](); } // warm up JIT
    fills=0; styleSets=0; gradients=0; var N=60, t0=Date.now(); for (var f=0;f<N;f++){ _floorCacheTick++; cam.ang += 0.105; passes[name](); } var ms=(Date.now()-t0)/N;
    out.push(name + '=' + ms.toFixed(2) + 'ms (' + Math.round(fills/N) + ' fills, ' + Math.round(gradients/N) + ' gradients)'); }
  print('  ' + label + ' [viewDist=' + viewDist + ', W=' + WINDOW_CHUNKS + ', UG=' + playerUnderground + ']: ' + out.join('  '));
}
print('JS-side cost per pass, averaged over a full 360 deg camera sweep (no rasterization: canvas calls are no-ops). Rasterization cost in a real browser is ADDITIONAL and scales with fills x pixel area.');
CAVE_TEST_MODE=false; ENDLESS_MODE=true; var _r=Math.random; Math.random=function(){return 0.777;}; resetEndlessMode(); Math.random=_r; MODE3D=true;
bench('normal endless, spawn, medium preset');
viewDist=1300; settings.viewDist=1300; bench('normal endless, spawn, viewDist 1300');
viewDist=1800; settings.viewDist=1800; bench('normal endless, spawn, viewDist 1800');
settings.viewDist=900; window._caveTestSeedOverride=12345; CAVE_TEST_MODE=true; caveTestFlags.caveEnemies=false; resetEndlessMode();
var net=endlessCaveNetworks['0,0'],E=net.entrances[0]; pos.x=E.x+Math.cos(E.angle)*150-windowOriginX; pos.y=E.y+Math.sin(E.angle)*150-windowOriginY; updateChunks();
pos.floorZ=60+40*floorMesh.l0TopZ[Math.floor(pos.y/12)*floorMesh.w+Math.floor(pos.x/12)]; bench('cave test, 150u inside cave, medium   ');
