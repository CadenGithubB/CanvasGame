load('prelude.js'); load('game_body.js');
// Merged from the session's t_fixed.js and t_l4.js.
var saves=0, restores=0, fills=0;
var cctx = new Proxy({}, { get:function(t,k){ if(k==='save') return function(){saves++;}; if(k==='restore') return function(){restores++;}; if(k==='fill') return function(){fills++;};
   if(k==='createLinearGradient'||k==='createRadialGradient') return function(){ return {addColorStop:function(){}}; }; if(k==='createPattern') return function(){return {};};
   if(k==='measureText') return function(){return {width:10};}; if(k==='fillStyle'||k==='strokeStyle') return ''; if(k==='globalAlpha') return 1; return function(){}; },
   set:function(){ return true; } });
function buffered(){ return __caveStats.floorTotal-__caveStats.floorDistCull-__caveStats.floorFovCull-__caveStats.floorBehind; }
print('(1) FIXED LEVEL 1, exactly what Start + "3D View" does: ENDLESS_MODE=false; resetLevel(1); MODE3D=true; draw() x30');
ENDLESS_MODE=false; CAVE_TEST_MODE=false; running=true; gameOverState=false; resetLevel(1); MODE3D=true; calibrating=false; ctx=cctx;
print('    floorMesh has l0Color? ' + (floorMesh.l0Color !== undefined) + '   mesh=' + floorMesh.w + 'x' + floorMesh.h + ' gs=' + floorMesh.gridSize + ' viewDist=' + viewDist);
var firstErr=null; console.error=function(){ if(!firstErr) firstErr=Array.prototype.join.call(arguments,' ').split('\n')[0]; };
saves=0; restores=0; fills=0; for (var f=0; f<30; f++) draw();
print('    after 30 frames: _ptErrors=' + JSON.stringify(_ptErrors) + '   ctx.save=' + saves + ' ctx.restore=' + restores + ' (leaked states=' + (saves-restores) + ')');
print('    first swallowed error: ' + firstErr);
var thrown=null, f0=fills; try { drawLayersFloor3D(); } catch(e){ thrown=String(e); } print('    drawLayersFloor3D() alone: threw=' + thrown + '   quad fills before throw=' + (fills-f0));
print('\n(2) FIXED LEVEL 4 floor cell buffer occupancy (capacity 40000 cells): camera position x angle sweep of the REAL cull loop');
resetLevel(4); MODE3D=true; ctx=cctx; console.error=function(){};
print('    L4 mesh=' + floorMesh.w + 'x' + floorMesh.h + ' (' + (floorMesh.w*floorMesh.h) + ' cells) gs=' + floorMesh.gridSize + ' viewDist=' + viewDist + ' world=' + worldW + 'x' + worldH);
function best(label, pitch, fov){ var mx=0, at='';
  for (var py=120; py<worldH; py+=240) for (var px=120; px<worldW; px+=240) for (var a=0;a<360;a+=15){
    cam.x=px; cam.y=py; cam.z=60; cam.pitch=pitch; cam.fov=fov; cam.ang=a*Math.PI/180; try{ drawLayersFloor3D(); }catch(e){} var b=buffered(); if(b>mx){mx=b; at='cam=('+px+','+py+') ang='+a; } }
  print('  ' + label + ': worst case ' + mx + ' cells buffered  [' + at + ']  => ' + (mx>40000 ? 'OVERFLOW by ' + (mx-40000) : (100*mx/40000).toFixed(1) + '% of 40000')); }
best('level camera, normal FOV   ', 0, GAME_CONFIG.player.baseFov);
best('pitch 1.4, normal FOV      ', 1.4, GAME_CONFIG.player.baseFov);
best('pitch 1.4 + dash FOV punch ', 1.4, GAME_CONFIG.player.baseFov + GAME_CONFIG.player.dashFovPunch);
