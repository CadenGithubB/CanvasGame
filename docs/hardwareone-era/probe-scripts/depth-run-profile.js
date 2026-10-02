(function () {
  var G=(0,eval)('this'), read=slurp;
  G._runStats={runs:0,merged:0,pixels:0,batches:0};
  var last=null;
  G._depthRunReset=function(){last=null;G._runStats.batches++;};
  G._depthRunNote=function(x,y,w){
    var stats=G._runStats;stats.runs++;stats.pixels+=w;
    if(last&&last.x===x&&last.w===w&&last.y+last.h===y)last.h++;
    else {stats.merged++;last={x:x,y:y,w:w,h:1};}
  };
  G.slurp=function(path){
    var text=read(path);
    if(path==='assets/games/src/12-scene-depth.js') {
      text=text.replace('var generation = _sceneDepthClipGeneration;\n    ctx.beginPath();',
        'var generation = _sceneDepthClipGeneration;\n    _depthRunReset();\n    ctx.beginPath();');
      text=text.replace('    try {\n      ctx.beginPath();',
        '    try {\n      _depthRunReset();\n      ctx.beginPath();');
      text=text.replace(/if \(x > start\) ctx.rect\(start, y, x - start, 1\);/g,
        'if (x > start) { _depthRunNote(start,y,x-start); ctx.rect(start, y, x-start, 1); }');
    }
    return text;
  };
  var source=read('tools/game/tests/cave_occlusion_integration.js');
  var extra="\n  [[360,240],[1280,720],[1920,1080]].forEach(function(size){\n"+
    "    G.canvas.width=size[0];G.canvas.height=size[1];G.resScale=size[0]/360; G.projScale=(size[0]/2)/Math.tan(G.fov/2);\n"+
    "    [[12345,'descending'],[5668,'hillside']].forEach(function(fixture){\n"+
    "      start(fixture[0],fixture[1]);\n"+
    "      ['mouth','inside','sideleft','chamber'].forEach(function(view){\n"+
    "        G._runStats={runs:0,merged:0,pixels:0,batches:0};\n"+
    "        G.previewCaveView(view);\n"+
    "        output('RUN_PROFILE '+JSON.stringify({size:size,seed:fixture[0],view:view,stats:G._runStats}));\n"+
    "      });\n"+
    "    });\n"+
    "  });\n";
  (0,eval)(source.replace("  output('CAVE_OCCLUSION_INTEGRATION_RESULT PASS '",extra+"  output('CAVE_OCCLUSION_INTEGRATION_RESULT PASS '"));
}());
