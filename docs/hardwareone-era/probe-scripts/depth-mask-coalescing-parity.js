(function () {
  var G=(0,eval)('this'), checked=0, rectangles=[], oldCount=0, newCount=0;
  G.ctx={beginPath:function(){rectangles=[];},rect:function(x,y,w,h){rectangles.push([x,y,w,h]);},
    fill:function(){},save:function(){},restore:function(){},clip:function(){}};
  (0,eval)(slurp('assets/games/src/12-scene-depth.js'));
  var originalFill=G.fillSceneDepthPolygon;
  function traceMask() {
    var generation=G._sceneDepthClipGeneration;
    var px=0,py=0,pw=0,ph=0;
    G.ctx.beginPath();
    for(var y=G._sceneDepthClipMinY;y<=G._sceneDepthClipMaxY;y++) {
      if(G._sceneDepthClipRowMarks[y]!==generation)continue;
      var row=y*G._sceneDepthW,x=G._sceneDepthClipRowMin[y],end=G._sceneDepthClipRowMax[y];
      while(x<=end) {
        while(x<=end&&G._sceneDepthClipMarks[row+x]!==generation)x++;
        var start=x;
        while(x<=end&&G._sceneDepthClipMarks[row+x]===generation)x++;
        if(x>start) {
          var width=x-start;
          if(ph&&px===start&&pw===width&&py+ph===y)ph++;
          else {
            if(ph)G.ctx.rect(px,py,pw,ph);
            px=start;py=y;pw=width;ph=1;
          }
        }
      }
    }
    if(ph)G.ctx.rect(px,py,pw,ph);
  }
  function candidateFill(points) {
    return G.withSceneDepthClip(points,function(){traceMask();G.ctx.fill();},{writeDepth:true,_paintsDepthPixels:true});
  }
  function quad(x0,y0,x1,y1,z){return [{x:x0,y:y0,depth:z},{x:x1,y:y0,depth:z},{x:x1,y:y1,depth:z},{x:x0,y:y1,depth:z}];}
  function coverage(rects,w,h) {
    var pixels=new Uint8Array(w*h);
    rects.forEach(function(r){for(var y=r[1];y<r[1]+r[3];y++)for(var x=r[0];x<r[0]+r[2];x++)pixels[y*w+x]++;});
    return pixels;
  }
  function same(a,b){return a.length===b.length&&a.every(function(v,i){return v===b[i];});}
  var randomState=193;
  function random(){randomState=(Math.imul(randomState,1664525)+1013904223)|0;return(randomState>>>0)/4294967296;}
  for(var trial=0;trial<400;trial++) {
    G.beginSceneDepthFrame(96,64);
    for(var wall=0;wall<4;wall++) {
      var x=random()*96,y=random()*64;
      G.writeSceneDepthPolygon(quad(x,y,x+random()*40,y+random()*40,10+random()*30));
    }
    var triangle=[];
    for(var v=0;v<3;v++)triangle.push({x:random()*160-32,y:random()*110-22,depth:3+random()*100});
    var before=new Float32Array(G._sceneDepthInv);
    rectangles=[];var oldVisible=originalFill(triangle),oldRects=rectangles.slice(),oldDepth=new Float32Array(G._sceneDepthInv);
    G._sceneDepthInv.set(before);
    rectangles=[];var newVisible=candidateFill(triangle),newRects=rectangles.slice();
    if(oldVisible!==newVisible||!same(oldDepth,G._sceneDepthInv)||!same(coverage(oldRects,96,64),coverage(newRects,96,64)))throw Error('parity trial '+trial);
    oldCount+=oldRects.length;newCount+=newRects.length;checked++;
  }
  G.beginSceneDepthFrame(1920,1080);rectangles=[];originalFill(quad(0,0,1920,1080,50));var oldFull=rectangles.length;
  G.beginSceneDepthFrame(1920,1080);rectangles=[];candidateFill(quad(0,0,1920,1080,50));
  if(rectangles.length!==1||oldFull!==1080)throw Error('full-screen rectangle coalescing');checked++;
  __out('MASK_COALESCING_PARITY '+JSON.stringify({trials:checked,oldRandomRects:oldCount,newRandomRects:newCount,fullScreenOld:oldFull,fullScreenNew:rectangles.length}));
}());
