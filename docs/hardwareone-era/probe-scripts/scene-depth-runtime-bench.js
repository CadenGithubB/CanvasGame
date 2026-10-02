(0, eval)(slurp('tools/webui/harness/_game_env.js'));
LAB.init(__out, slurp, __engine, __argv);
if (!LAB.load(__argv[0])) throw Error(LAB.loadError);
(0,eval)(slurp('assets/games/src/12-scene-depth.js'));
(0,eval)(slurp('assets/games/src/12-render-core-walls.js'));
(0,eval)(slurp('assets/games/src/13-render-floors-ceilings.js'));
var G=(0,eval)('this');
var realClip=G.withSceneDepthClip, realProject=G.projectSceneWorldPolygon, realBegin=G.beginSceneDepthFrame;
var stat=null,nesting=0;
G.withSceneDepthClip=function(points,callback,options){
  if(stat){stat.polygons++; if(nesting)stat.nested++;}
  nesting++;
  var count=realClip(points,function(){if(stat)stat.draws++;callback();},options);
  nesting--;
  if(stat && !count)stat.hidden++;
  return count;
};
var instrumentedClip=G.withSceneDepthClip;
G.projectSceneWorldPolygon=function(vertices,C){
  var points=realProject(vertices,C);
  if(stat && points.length>=4){
    var sign=0,concave=false;
    for(var i=0;i<points.length;i++){
      var a=points[i],b=points[(i+1)%points.length],c=points[(i+2)%points.length];
      var turn=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
      if(Math.abs(turn)<1e-5)continue;
      if(sign && sign*turn<0)concave=true;
      sign=turn;
    }
    if(concave){stat.nonconvex++;}
  }
  return points;
};
function percentile(values,p){values.sort(function(a,b){return a-b;});return values[Math.floor((values.length-1)*p)];}
[[12345,'descending'],[5668,'hillside']].forEach(function(fixture){
  G._caveTestKindOverride=fixture[1];LAB.startCaveTest(fixture[0]);LAB.freezeDay(0.5);
  ['mouth','chamber'].forEach(function(view){
    G.previewCaveView(view);
    [1,2].forEach(function(scale){
      canvas.width=360*scale;canvas.height=240*scale;
      [false,true].forEach(function(bypass){
        G.withSceneDepthClip=bypass?function(points,callback){if(points.length<3)return 0;callback();return 1;}:instrumentedClip;
        for(var warm=0;warm<4;warm++)renderFrame();
        var times=[];
        for(var k=0;k<12;k++){
          var now=LAB.realNow();renderFrame();times.push(LAB.realNow()-now);
        }
        LAB.out('BENCH '+JSON.stringify({kind:fixture[1],view:view,w:canvas.width,h:canvas.height,mode:bypass?'depth-bypass':'depth-on',medianMs:percentile(times,0.5),p90Ms:percentile(times,0.9),samples:times.length}));
      });
      G.withSceneDepthClip=instrumentedClip;
      stat={polygons:0,draws:0,hidden:0,nested:0,nonconvex:0,examples:[]};
      renderFrame();
      LAB.out('AUDIT '+JSON.stringify({kind:fixture[1],view:view,w:canvas.width,h:canvas.height,stat:stat,depthBytes:G._sceneDepthInv.byteLength+G._sceneDepthClipInv.byteLength+G._sceneDepthClipMarks.byteLength,errors:_ptErrors}));
      stat=null;
    });
  });
});
