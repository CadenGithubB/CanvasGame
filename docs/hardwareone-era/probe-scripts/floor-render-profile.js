(0,eval)(slurp('tools/webui/harness/_game_env.js'));
LAB.init(__out,slurp,__engine,__argv);
if(!LAB.load(__argv[0]))throw Error(LAB.loadError);
var G=(0,eval)('this'),stat=null;
['findFloorRenderRoleZ','getFloorRenderLayerRole','getCaveRenderLightAt','getCavePortalDepthBlendAt','getCaveMaterialColorAt','projectSceneWorldPolygon'].forEach(function(name){
  var original=G[name];G[name]=function(){if(stat)stat[name]=(stat[name]||0)+1;return original.apply(this,arguments);};
});
var originalFill=G.fillSceneDepthPolygon;
function percentile(values,p){values.sort(function(a,b){return a-b;});return values[Math.ceil(values.length*p)-1];}
function frame(){G.beginSceneDepthFrame(canvas.width,canvas.height);drawLayersCeiling3D();drawLayersFloor3D();}
[[12345,'descending'],[5668,'hillside']].forEach(function(fixture){
  G._caveTestKindOverride=fixture[1];LAB.startCaveTest(fixture[0]);LAB.freezeDay(0.5);
  ['mouth','roofedge'].forEach(function(view){
    previewCaveView(view);
    [1,2,4].forEach(function(scale){
      canvas.width=360*scale;canvas.height=240*scale;resScale=scale;projScale=180*scale;
      [false,true].forEach(function(skipFill){
        G.fillSceneDepthPolygon=skipFill?function(){return 1;}:originalFill;
        for(var warm=0;warm<4;warm++)frame();
        var times=[];
        for(var i=0;i<8;i++){var t=LAB.realNow();frame();times.push(LAB.realNow()-t);}
        stat={};frame();
        LAB.out('FLOOR_PROFILE '+JSON.stringify({kind:fixture[1],view:view,w:canvas.width,h:canvas.height,geometryOnly:skipFill,medianMs:percentile(times,.5),p95Ms:percentile(times,.95),counts:stat,mesh:{w:floorMesh.w,h:floorMesh.h},floorQuads:__caveStats.floorBlendRange,ceilingQuads:__caveStats.ceilRendered,errors:_ptErrors}));
        stat=null;
      });
      G.fillSceneDepthPolygon=originalFill;
    });
  });
});
undefined;
