// Optional same-page diagnostic. Append to a local preview after game scripts,
// then use the visible button. It does not change production source or quality.
(function () {
  function legacyTrace(generation,minY,maxY) {
    ctx.beginPath();
    for(var y=minY;y<=maxY;y++) {
      if(_sceneDepthClipRowMarks[y]!==generation)continue;
      var row=y*_sceneDepthW,x=_sceneDepthClipRowMin[y],end=_sceneDepthClipRowMax[y];
      while(x<=end) {
        while(x<=end&&_sceneDepthClipMarks[row+x]!==generation)x++;
        var start=x;
        while(x<=end&&_sceneDepthClipMarks[row+x]===generation)x++;
        if(x>start)ctx.rect(start,y,x-start,1);
      }
    }
  }
  function diff(a,b,width) {
    var count=0,bytes=0,maxDelta=0,minX=Infinity,minY=Infinity,maxX=-1,maxY=-1;
    for(var i=0;i<a.length;i+=4) {
      var different=false;
      for(var c=0;c<4;c++)if(a[i+c]!==b[i+c]){
        bytes++;different=true;maxDelta=Math.max(maxDelta,Math.abs(a[i+c]-b[i+c]));
      }
      if(different){count++;var x=(i/4)%width,y=Math.floor(i/4/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    }
    return {pixels:count,bytes:bytes,maxChannelDelta:maxDelta,bounds:count?{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1}:null};
  }
  function run() {
    if(typeof _caveBrowserProfile!=='undefined'&&_caveBrowserProfile) {
      output.textContent='Finish or cancel the performance profile before comparing pixels.';return;
    }
    if(!CAVE_TEST_MODE||!caveVisibilityFixturesEnabled()) {
      output.textContent='Select Cave Test and enable Visibility fixtures first.';return;
    }
    var originalTrace=_traceSceneDepthPixelMask,originalFill=fillSceneDepthPolygon,oldDate=Date.now,oldRandom=Math.random;
    var oldFrame=_lightGridFrameCount,oldBob=walkBobPhase,oldPerf=DEBUG_PERF_HUD,oldCave=DEBUG_CAVE;
    var oldLight=_lightGrid?new Float32Array(_lightGrid):null;
    var oldLightScale=_lightGridLastScale,oldLightX=_lightGridLastCamGX,oldLightY=_lightGridLastCamGY;
    var originalPixels=ctx.getImageData(0,0,canvas.width,canvas.height);
    ctx.save();
    var transforms={},renders=[],insideOpaque=0,maskKinds={opaque:0,clip:0};
    fillSceneDepthPolygon=function(points){
      insideOpaque++;
      try{return originalFill(points);}finally{insideOpaque--;}
    };
    function render(mode) {
      var state=1234567;
      Date.now=function(){return 2000000000000;};
      Math.random=function(){state=(Math.imul(state,1664525)+1013904223)|0;return(state>>>0)/4294967296;};
      _lightGridFrameCount=0;walkBobPhase=0;DEBUG_PERF_HUD=false;DEBUG_CAVE=false;
      updateLightGrid();
      _traceSceneDepthPixelMask=function(g,minY,maxY){
        var m=ctx.getTransform(),key=[m.a,m.b,m.c,m.d,m.e,m.f].join(',');
        transforms[key]=(transforms[key]||0)+1;
        maskKinds[insideOpaque?'opaque':'clip']++;
        var trace=mode==='all'||(mode==='opaque'&&insideOpaque)||(mode==='clip'&&!insideOpaque)?originalTrace:legacyTrace;
        return trace(g,minY,maxY);
      };
      drawCaveVisibilityFixtures();
      return new Uint8ClampedArray(ctx.getImageData(0,0,canvas.width,canvas.height).data);
    }
    try {
      // Warm all cached render resources once, then prove same-version repeats
      // before attributing any differing pixel to the span optimization.
      render('all');
      renders=[render('legacy'),render('all'),render('legacy'),render('all'),render('opaque'),render('clip')];
      output.textContent=JSON.stringify({width:canvas.width,height:canvas.height,seed:WORLD_SEED,view:cavePreviewLastView,
        originalRepeat:diff(renders[0],renders[2],canvas.width),coalescedRepeat:diff(renders[1],renders[3],canvas.width),
        originalVsCoalesced:diff(renders[0],renders[1],canvas.width),
        originalVsOpaqueOnly:diff(renders[0],renders[4],canvas.width),
        originalVsClipOnly:diff(renders[0],renders[5],canvas.width),
        maskTransforms:transforms,maskKinds:maskKinds},null,2);
    } catch(error) { output.textContent=error.stack||String(error); }
    finally {
      _traceSceneDepthPixelMask=originalTrace;fillSceneDepthPolygon=originalFill;Date.now=oldDate;Math.random=oldRandom;
      _lightGridFrameCount=oldFrame;walkBobPhase=oldBob;DEBUG_PERF_HUD=oldPerf;DEBUG_CAVE=oldCave;
      if(oldLight&&_lightGrid&&oldLight.length===_lightGrid.length)_lightGrid.set(oldLight);
      _lightGridLastScale=oldLightScale;_lightGridLastCamGX=oldLightX;_lightGridLastCamGY=oldLightY;
      ctx.restore();
      ctx.putImageData(originalPixels,0,0);
    }
  }
  var host=document.getElementById('caveTestOptions');
  if(!host)return;
  var button=document.createElement('button');button.textContent='Compare depth-mask A/B';button.type='button';
  var viewportButton=document.createElement('button');viewportButton.textContent='Compare depth-mask A/B at viewport size';viewportButton.type='button';
  var output=document.createElement('pre');output.style.whiteSpace='pre-wrap';output.id='depthMaskABResult';
  output.setAttribute('role','log');output.setAttribute('aria-label','Mask pixel comparison');
  button.addEventListener('click',run);
  viewportButton.addEventListener('click',function(){
    if(!CAVE_TEST_MODE||!caveVisibilityFixturesEnabled()||(typeof _caveBrowserProfile!=='undefined'&&_caveBrowserProfile)) {run();return;}
    var oldWidth=canvas.width,oldHeight=canvas.height;
    try {
      canvas.width=Math.max(1,Math.floor(window.innerWidth));
      canvas.height=Math.max(1,Math.floor(window.innerHeight));
      run();
    } finally {
      canvas.width=oldWidth;canvas.height=oldHeight;
      if(CAVE_TEST_MODE&&caveVisibilityFixturesEnabled()) {
        try{drawCaveVisibilityFixtures();}catch(error){output.textContent+='\nRestore redraw error: '+(error.stack||String(error));}
      }
    }
  });
  host.appendChild(button);host.appendChild(viewportButton);host.appendChild(output);
}());
