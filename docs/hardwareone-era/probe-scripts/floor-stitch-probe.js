(0,eval)(slurp('tools/webui/harness/_game_env.js'));
LAB.init(__out,slurp,__engine,__argv);
if(!LAB.load(__argv[0]))throw Error(LAB.loadError);
var G=(0,eval)('this');
var originalSource=slurp('assets/games/src/13-render-floors-ceilings.js');
var candidate=slurp(__argv[1])+'\n'+originalSource;
function replaceOnce(from,to){if(candidate.indexOf(from)<0)throw Error('candidate anchor missing: '+from);candidate=candidate.replace(from,to);}
// Both passes keep their loops, exact clamp math, projection and materials.
candidate=candidate.replace(/var mesh = floorMesh;\n  var gs = mesh.gridSize;/g,'var mesh = floorMesh;\n  var stitchCache = getFloorStitchCache(mesh);\n  var gs = mesh.gridSize;');
replaceOnce('var _z1 = findRoleMatchZ(idx1, _role0, _z0, idx0);\n        var _z2 = findRoleMatchZ(idx2, _role0, _z0, idx0);\n        var _z3 = findRoleMatchZ(idx3, _role0, _z0, idx0);',
  'var _stitch = getFloorStitchTile(mesh, stitchCache, idx0, li, _role0, _z0, false);\n        var _stitchOffset = (idx0 & 255) * 3;\n        var _z1 = _stitch.values[_stitchOffset];\n        var _z2 = _stitch.values[_stitchOffset+1];\n        var _z3 = _stitch.values[_stitchOffset+2];');
replaceOnce('var _cz1 = findCeilMatchZ(idx1, _cz0, _ctol);','var _ceilStitch = getFloorStitchTile(mesh, stitchCache, idx0, li, 0, _cz0, true);\n        var _ceilStitchOffset = (idx0 & 255) * 3;\n        var _cz1 = _ceilStitch.values[_ceilStitchOffset];');
replaceOnce('var _cz2 = findCeilMatchZ(idx2, _cz0, _ctol);','var _cz2 = _ceilStitch.values[_ceilStitchOffset+1];');
replaceOnce('var _cz3 = findCeilMatchZ(idx3, _cz0, _ctol);','var _cz3 = _ceilStitch.values[_ceilStitchOffset+2];');
var digest=null,realFill=__argv.indexOf('--geometry-only')>=0?function(){return 1;}:G.fillSceneDepthPolygon,nums=new Float64Array(1),bits=new Uint32Array(nums.buffer);
function hash(n){digest=Math.imul(digest^(n>>>0),16777619)>>>0;}
G.fillSceneDepthPolygon=function(points){
  if(digest!==null){hash(points.length);for(var k=0;k<points.length;k++){var p=points[k];[p.x,p.y,p.depth].forEach(function(v){nums[0]=v;hash(bits[0]);hash(bits[1]);});}
    var style=ctx.fillStyle;for(var j=0;j<style.length;j++)hash(style.charCodeAt(j));nums[0]=ctx.globalAlpha;hash(bits[0]);hash(bits[1]);}
  return realFill(points);
};
function frame(){beginSceneDepthFrame(canvas.width,canvas.height);drawLayersCeiling3D();drawLayersFloor3D();}
function percentile(v,p){v.sort(function(a,b){return a-b;});return v[Math.ceil(v.length*p)-1];}
[[12345,'descending'],[5668,'hillside']].forEach(function(fixture){
  G._caveTestKindOverride=fixture[1];LAB.startCaveTest(fixture[0]);LAB.freezeDay(.5);
  ['mouth','oblique','roofedge','chamber'].forEach(function(view){
    previewCaveView(view);canvas.width=720;canvas.height=480;resScale=2;projScale=360;
    var baselineHash=null;
    [false,true].forEach(function(cached){
      (0,eval)(cached?candidate:originalSource);
      for(var i=0;i<24;i++)frame();
      var times=[];for(var i=0;i<24;i++){var t=LAB.realNow();frame();times.push(LAB.realNow()-t);}
      digest=2166136261;frame();var result=digest;digest=null;
      if(!cached)baselineHash=result;
      else if(result!==baselineHash)throw Error('output mismatch '+fixture[1]+' '+view+' '+result+' != '+baselineHash);
      LAB.out('STITCH_PROBE '+JSON.stringify({kind:fixture[1],view:view,cached:cached,medianMs:percentile(times,.5),p95Ms:percentile(times,.95),outputHash:result,cache:cached?{bytes:floorMesh._floorRenderStitches.bytes,hits:floorMesh._floorRenderStitches.hits,misses:floorMesh._floorRenderStitches.misses,fallbacks:floorMesh._floorRenderStitches.fallbacks}:null,errors:_ptErrors}));
    });
  });
});
undefined;
