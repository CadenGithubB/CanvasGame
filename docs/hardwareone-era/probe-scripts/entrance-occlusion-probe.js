(0, eval)(slurp('tools/webui/harness/_game_env.js'));
LAB.init(__out, slurp, __engine, __argv);
if (!LAB.load(__argv[0])) throw Error(LAB.loadError);
var G = (0, eval)('this');
G._caveTestKindOverride = 'descending';
LAB.startCaveTest(12345);
LAB.freezeDay(0.5);
var eWorld = endlessCaveNetworks['0,0'].entrances[0];
LAB.out('PORTAL ' + JSON.stringify(eWorld));
function blockage(px, py, pz) {
  var C = getCam3D(), dx=px-cam.x,dy=py-cam.y,len=Math.hypot(dx,dy),worst=null;
  for(var t=8;t<len-20;t+=8){
    var fr=t/len,x=cam.x+fr*dx,y=cam.y+fr*dy;
    var ls=LAB.layersAt(x,y), top=LAB.topWalkable(ls);
    if(!top)continue;
    var sight=C.cameraZ+(pz-C.cameraZ)*fr;
    var delta=top.z*25-sight;
    if(!worst || delta>worst.delta)worst={t:t,x:x,y:y,layerZ:top.z*25,sightZ:sight,delta:delta,layers:ls};
  }
  return worst;
}
[300,400,500,650].forEach(function(along){
  [0,80,160,240,-80,-160,-240].forEach(function(cross){
    var ca=Math.cos(eWorld.angle),sa=Math.sin(eWorld.angle);
    LAB.placeWorld(eWorld.x-ca*along-sa*cross,eWorld.y-sa*along+ca*cross,'top');
    cam.x=pos.x;cam.y=pos.y;cam.z=pos.floorZ;cam.pitch=0;
    var e=deepCaveEntrances[0];
    cam.ang=Math.atan2(e.y-cam.y,e.x-cam.x);
    updateDayNight(0);
    drawLayersCeiling3D();drawLayersFloor3D();drawWalls3D();
    var recorded=LAB.record(function(){drawCaveEntrance3D();});
    var style=e.style,pw=8+style*6,ow=Math.max(60,e.halfWidth*2),stride=(ow+pw)/2;
    var px=e.x-Math.sin(e.angle)*stride,py=e.y+Math.cos(e.angle)*stride;
    var bottom=blockage(px,py,e.floorH*25),top=blockage(px,py,(e.floorH+e.ceilH)*25);
    var vis=window.__archwayVis && window.__archwayVis.ent0;
    if(vis && vis.pillarL && bottom && bottom.delta>2) {
      LAB.out('RENDERED_PARTLY_BURIED_PILLAR '+JSON.stringify({along:along,cross:cross,cameraH:LAB.h(),playerUnderground:playerUnderground,vis:vis,bottomBlock:bottom,topBlock:top,recordedFills:recorded.fills.length}));
    }
  });
});
