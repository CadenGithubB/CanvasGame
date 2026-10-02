(function () {
  var G=(0,eval)('this'),out=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
  var host=slurp('tools/game/tests/cave_occlusion_integration.js'),end=host.indexOf('  function check(name, okay) {');
  (0,eval)(host.slice(0,end)+'}());');
  function rgb(c){var n=parseInt(c.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255];}
  function start(seed,kind){G._caveTestSeedOverride=seed;G._caveTestKindOverride=kind;G.CAVE_TEST_MODE=G.ENDLESS_MODE=G.running=true;G.gameOverState=false;G.terrain='plains';Object.keys(G.caveTestFlags).forEach(function(k){G.caveTestFlags[k]=false;});G.resetEndlessMode();G.previewCaveView('above');G.cam.pitch=.5;G.MODE3D=true;G.overviewActive=false;G._lightGrid=null;G.floorWallOccludesAO=function(){return false;};G.renderSurfaceAmbient=.8;}
  function stats(){var m=G.floorMesh,n=0,colors=0,heights=0,naturalColorMatches=0,maxDz=0,maxD=0,sumD=[0,0,0],examples=[],caps=[],map={};
    for(var i=0;i<m.layerCount.length;i++)for(var li=0;li<m.layerCount[i];li++)if(m['l'+li+'Type'][i]===4){
      n++;var color=m['l'+li+'Color'][i],original=m.surfaceBiome[i],z=m['l'+li+'TopZ'][i],dz=z-m.surfaceH[i],a=rgb(color),b=rgb(original),wx=(i%m.w)*m.gridSize+G.windowOriginX,wy=Math.floor(i/m.w)*m.gridSize+G.windowOriginY;
      if(color!==original)colors++;if(dz!==0)heights++;maxDz=Math.max(maxDz,Math.abs(dz));for(var k=0;k<3;k++){maxD=Math.max(maxD,Math.abs(a[k]-b[k]));sumD[k]+=a[k]-b[k];}
      if(original===G.getFloorColorBlended(wx,wy,G.getEndlessNaturalSurfaceH(wx,wy)))naturalColorMatches++;
      if(examples.length<5)examples.push({wx:wx,wy:wy,cap:color,natural:original,z:z,surface:m.surfaceH[i]});
      caps.push({i:i,li:li,color:color,original:original});map[wx+','+wy]=color;
    }
    return{count:n,colorDiff:colors,heightDiff:heights,maxDz:maxDz,maxChannelDiff:maxD,meanChannelDiff:sumD.map(function(v){return v/n;}),naturalColorMatches:naturalColorMatches,examples:examples,caps:caps,map:map};
  }
  function render(){var project=G.projectSceneWorldPolygon,fill=G.fillSceneDepthPolygon,records={},geom=[];
    G.projectSceneWorldPolygon=function(v,c){var p=project(v,c);p.auditV=v;return p;};
    G.fillSceneDepthPolygon=function(p){var count=fill(p),v=p.auditV;if(!v)return count;geom.push(JSON.stringify(v)+JSON.stringify(p));if(count)records[JSON.stringify(v)]={color:G.ctx.fillStyle,pixels:count};return count;};
    G.beginSceneDepthFrame(G.canvas.width,G.canvas.height);G.drawLayersFloor3D();G.projectSceneWorldPolygon=project;G.fillSceneDepthPolygon=fill;
    return{records:records,geom:geom.join('|'),depth:Array.prototype.join.call(G._sceneDepthInv,',')};
  }
  [[12345,'descending'],[5668,'hillside']].forEach(function(f){start(f[0],f[1]);var s=stats(),base=render(),m=G.floorMesh;
    s.caps.forEach(function(c){m['l'+c.li+'Color'][c.i]=c.original;});var clean=render(),changed=0,pixels=0,count=0;
    Object.keys(base.records).forEach(function(k){var a=base.records[k],b=clean.records[k];if(!b)return;count++;if(a.color!==b.color){changed++;pixels+=a.pixels;}});
    s.caps.forEach(function(c){m['l'+c.li+'Color'][c.i]=c.color;});
    out(JSON.stringify({fixture:f,albedo:{count:s.count,colorDiff:s.colorDiff,heightDiff:s.heightDiff,maxDz:s.maxDz,maxChannelDiff:s.maxChannelDiff,meanChannelDiff:s.meanChannelDiff,naturalColorMatches:s.naturalColorMatches,examples:s.examples},render:{visibleTriangles:count,changedTriangles:changed,changedCumulativePixels:pixels,sameGeometry:base.geom===clean.geom,sameDepth:base.depth===clean.depth}}));
    var half=Math.floor(G.WINDOW_CHUNKS/2);G.assembleWindow(G.windowCX+half+1,G.windowCY+half);var next=stats(),shared=0,recolored=0;
    Object.keys(s.map).forEach(function(k){if(k in next.map){shared++;if(next.map[k]!==s.map[k])recolored++;}});out(JSON.stringify({fixture:f,rebaseOneChunk:{sharedCaps:shared,recolored:recolored}}));
  });out('CAP_MATERIAL_PROBE_DONE');
}());
