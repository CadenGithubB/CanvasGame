// Edge-coverage harness contracts on a NON-rasterizing Canvas host: authored
// pixel-centre geometry, measurement sensitivity and fail-closed reporting.
// The production scene-depth mask and TexturePilot run for real; pixels do not.
// Nothing here is browser evidence, and no host here may produce a PASS.
(function () {
  var G=(0,eval)('this'),checked=0,failed=0;
  var out=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
  function check(name,okay,detail) {checked++;if(!okay)failed++;out((okay?'PASS ':'FAIL ')+name+(okay?'':' '+JSON.stringify(detail)));}
  function mutate(source,flag,before,after) {
    if(__argv.indexOf(flag)<0)return source;
    if(source.split(before).length!==2)throw Error('MUTATION_ANCHOR '+flag);
    return source.replace(before,after);
  }
  var W=360,H=240,BG=[0x36,0x49,0x4b,255],policy='background',timeouts=0,readbacks=0,sceneContexts=[];
  function fakeContext(c) {
    var context={canvas:c,fillStyle:'#000000',globalAlpha:1,imageSmoothingEnabled:true,imageSmoothingQuality:'low',lineWidth:1,strokeStyle:'#000000',
      createPattern:function(){return{pattern:true};},
      createImageData:function(w,h){return{width:w,height:h,data:new Uint8ClampedArray(w*h*4)};},
      putImageData:function(){},
      // Materials read back opaque white. Scene canvases return untouched
      // background, white everywhere, or 'mask-white': white exactly where the
      // production depth mask owns a pixel, like a perfect non-antialiased host.
      getImageData:function(x,y,w,h){var scene=c.width===W&&c.height===H,d=new Uint8ClampedArray(w*h*4).fill(255),depth=G._sceneDepthInv;
        if(scene&&policy!=='white'){readbacks++;for(var py=0;py<h;py++)for(var px=0;px<w;px++){
          if(policy==='mask-white'&&depth[(y+py)*W+x+px]>0)continue;var i=(py*w+px)*4;d[i]=BG[0];d[i+1]=BG[1];d[i+2]=BG[2];}}
        else if(scene)readbacks++;
        return{width:w,height:h,data:d};}};
    ['save','restore','beginPath','moveTo','lineTo','closePath','rect','clip','fill','fillRect','stroke','strokeRect','arc','scale','setTransform','transform']
      .forEach(function(name){context[name]=function(){};});
    return context;
  }
  G.document={createElement:function(tag){
    if(tag!=='canvas')throw Error('SETUP unexpected element '+tag);
    var c={width:300,height:150},context=null;
    c.getContext=function(kind,options){if(kind!=='2d')throw Error('SETUP unexpected context '+kind);
      if(c.width===W&&c.height===H)sceneContexts.push(options);return context||(context=fakeContext(c));};
    return c;}};
  G.setTimeout=function(callback){timeouts++;callback();return 1;};
  (0,eval)('var canvas, ctx;');
  (0,eval)(slurp('assets/games/src/12-scene-depth.js'));
  (0,eval)(slurp('tools/game/texture-mapping.js'));
  var source=slurp('tools/game/edge-coverage.js');
  source=mutate(source,'--measure-red-only',
    'value = Math.min(data[o], data[o + 1], data[o + 2])','value = data[o]');
  source=mutate(source,'--ignore-exterior-leaks',
    'if (data[o] !== BG[0] || data[o + 1] !== BG[1] || data[o + 2] !== BG[2]) r.exteriorLeak++;','');
  source=mutate(source,'--sample-pixel-corners','var cx = x + 0.5, cy = y + 0.5, lowest = Infinity;','var cx = x, cy = y, lowest = Infinity;');
  source=mutate(source,'--drop-sensitivity-gate',"=== 'sensitivity-below-250'; }).length && !missed.length,","=== 'sensitivity-below-250'; }).length,");
  source=mutate(source,'--skip-black-base-control','pass: !base.prerequisites.length && base.regionMax === 0 &&','pass: !base.prerequisites.length &&');
  source=mutate(source,'--ignore-occluder-green','if (data[o + 1] > 0) r.occluderLeak++;','');
  source=mutate(source,'--flat-ignores-leaks','flat.minValue === 255 && flat.leakPixels === 0,','flat.minValue === 255,');
  (0,eval)(source);var E=G.EdgeCoverage;

  function count(array,predicate){var n=0;for(var i=0;i<array.length;i++)if(predicate(array[i],i))n++;return n;}
  function columns(array,value){var set={};for(var i=0;i<array.length;i++)if(array[i]===value)set[i%W]=true;return Object.keys(set).map(Number);}

  // Authored expectations, derived by hand from the fixture coordinates.
  var sliverCounts=[],sliverColumns=[];
  for(var k=0;k<=16;k++){var g=E.classify(E.scene('sliver',k/16));sliverCounts.push(count(g.textured,function(v){return v>0;}));
    sliverColumns.push(columns(g.textured,1).join(','));}
  // A pixel centre lies inside the 0.4 px sliver only when 100.5 or 101.5 is
  // strictly between x0=100.3+k/16 and x0+0.4: k=0..3 and k=13..16. Both long
  // edges share slope 5, so every owning column spans exactly 138 rows.
  check('sliver owns pixel centres only at the hand derived phases and rows',
    JSON.stringify(sliverCounts)==='[138,138,138,138,0,0,0,0,0,0,0,0,0,138,138,138,138]'&&
    sliverColumns.slice(0,4).every(function(c){return c==='100';})&&sliverColumns.slice(13).every(function(c){return c==='101';}),
    {counts:sliverCounts,columns:sliverColumns});
  var regionOkay=true,ambiguous=[];
  for(k=0;k<=16;k++)['join','horizontal'].forEach(function(name){var g=E.classify(E.scene(name,k/16)),r=g.region,cells=0,edge=0;
    for(var y=r.y;y<r.y+r.height;y++)for(var x=r.x;x<r.x+r.width;x++){var i=y*W+x;cells++;if(g.textured[i]<0)regionOkay=false;if(g.textured[i]===0)edge++;}
    if(cells!==(name==='join'?1560:3120))regionOkay=false;if(name==='join')ambiguous.push(edge);else if(edge!==(k===8?240:0))regionOkay=false;});
  // Only s=178.5 (k=8) puts the vertical join on the pixel centres of column 178.
  check('measured join regions lie inside the authored faces with the shared edge on centres only at phase eight',
    regionOkay&&ambiguous.every(function(n,i){return n===(i===8?120:0);}),{ambiguous:ambiguous});
  var occluderCounts=[0,0.5].map(function(p){return count(E.classify(E.scene('occluder-first',p)).occluder,function(v){return v>0;});});
  // (165.3,191.7) holds 27 half-integer centres, (165.8,192.2) holds 26; rows 96..139.
  check('occluder owns the hand counted pixel centres',occluderCounts[0]===27*44&&occluderCounts[1]===26*44,occluderCounts);
  var list=E.cases(),ids={},twins=true;
  list.forEach(function(c){ids[c.id]=true;if(c.ownedPixels){var twin=list.filter(function(o){return o.id===c.id.replace(/-owned$/,'-unowned');})[0];
    twins=twins&&twin&&twin.scene===c.scene&&twin.mapping===c.mapping&&twin.size===c.size&&twin.filter===c.filter&&twin.ownedPixels===false;}});
  check('case matrix pairs every owner-mask case with its mask-off twin across both mapping paths',
    list.length===32&&Object.keys(ids).length===32&&twins&&count(list,function(c){return c.ownedPixels===true;})===16&&
    count(list,function(c){return c.expectation==='sensitivity-below-250';})===10&&count(list,function(c){return c.mapping==='planar';})===16&&
    count(list,function(c){return c.filter==='legacy';})===4&&count(list,function(c){return c.size===64;})===4,list.map(function(c){return c.id;}));
  var measurement=E.measurementControl();
  check('synthetic ideal image measures clean and each single injected defect is found',measurement.pass===true,measurement);

  function run(mode,cancelAfter){policy=mode;var calls=0,messages=[];
    return E.run({progress:function(text){messages.push(text);},cancelled:function(){calls++;return cancelAfter!==undefined&&calls>cancelAfter;}})
      .then(function(report){report.progressMessages=messages.length;return report;});}
  function controlOf(report,id){return report.controls.filter(function(c){return c.id===id;})[0];}
  var sentinel={sentinel:true};G.canvas=sentinel;G.ctx=sentinel;
  // --only-host=<name> limits a mutation run to the host whose check it
  // targets; 'none' keeps only the synchronous oracle and measurement checks.
  var only=__argv.filter(function(a){return a.indexOf('--only-host=')===0;}).map(function(a){return a.slice(12);})[0];
  var steps=[{host:'background',verify:function(report){
    var flats=report.controls.filter(function(c){return c.id.indexOf('flat-mask-coverage-')===0;});
    check('untouched background host fails every flat mask control and cannot pass',
      report.complete&&report.status==='SETUP_FAILURE'&&flats.length===6&&flats.every(function(c){return c.pass===false&&c.minValue===0x36;})&&
      controlOf(report,'black-base-without-texture').pass===false&&controlOf(report,'unmasked-overwrite-detected').pass===false,
      {status:report.status,flats:flats});
    var plain=report.cases.filter(function(c){return c.scene.indexOf('occluder')<0;}),occluded=report.cases.filter(function(c){return c.scene.indexOf('occluder')>=0;});
    check('production depth agrees with authored geometry and every face reaches its mapping path without declines',
      report.cases.length===32&&plain.length===24&&plain.every(function(c){return !c.prerequisites.length&&c.work.frames===17&&
        c.work.visibleFaces===c.work.expectedVisibleFaces&&!c.work.failedDraws&&!c.work.fallbackFaces&&!Object.keys(c.work.declines).length&&
        c.work.patternFills>0&&(c.mapping==='planar'?c.work.strips>0&&!c.work.triangles:c.work.triangles>0&&!c.work.strips);}),
      plain.filter(function(c){return c.prerequisites.length;}).map(function(c){return[c.id,c.prerequisites.slice(0,3)];}));
    check('an occluder that never reaches the pixels is a setup failure rather than a clean pass',
      occluded.length===8&&occluded.every(function(c){return c.prerequisites.some(function(p){return p.indexOf('occluderMissing')>=0;})&&c.pass===undefined;}),
      occluded.map(function(c){return c.prerequisites.slice(0,1);}));
    var sliverCase=report.cases.filter(function(c){return c.id==='sliver-128-planar-owned';})[0];
    check('sliver case measures owned pixels only in the owning phases',
      sliverCase&&sliverCase.ownedPhases===8&&JSON.stringify(sliverCase.ownedPixelsByPhase)===JSON.stringify(sliverCounts)&&sliverCase.minValue===0x36,sliverCase);
    check('owner-mask cases on the unrasterized host are quality failures, never exact passes',
      report.ownerMaskResults.passed===0&&report.qualityFailures.length>=12,{results:report.ownerMaskResults,quality:report.qualityFailures.length});
    check('private canvases use the non readback context preference and restore the page drawing globals',
      sceneContexts.length>=40&&sceneContexts.every(function(o){return o&&o.willReadFrequently===false;})&&G.canvas===sentinel&&G.ctx===sentinel&&
      timeouts>=32*5&&report.progressMessages>=32*5&&report.kind==='native-edge-coverage'&&report.fixtureVersion===1,
      {contexts:sceneContexts.length,timeouts:timeouts,progress:report.progressMessages});
  }},{host:'white',verify:function(report){
    var sensitivity=controlOf(report,'owner-mask-off-sensitivity'),flats=report.controls.filter(function(c){return c.id.indexOf('flat-mask-coverage-')===0;});
    check('uniform white host fails the black base and owner-mask-off sensitivity controls',
      report.complete&&report.status==='SETUP_FAILURE'&&controlOf(report,'black-base-without-texture').pass===false&&
      sensitivity.pass===false&&sensitivity.gatedCases===10&&sensitivity.failedToDip.length===10,{status:report.status,sensitivity:sensitivity});
    check('uniform white host fails flat controls through leaked exterior pixels',
      flats.length===6&&flats.every(function(c){return c.pass===false&&c.minValue===255&&c.leakPixels>0;}),flats);
  }},{host:'mask-white',verify:function(report){
    var sensitivity=controlOf(report,'owner-mask-off-sensitivity'),base=controlOf(report,'black-base-without-texture');
    var plainFlats=['join','join-reversed','horizontal','sliver'].map(function(name){return controlOf(report,'flat-mask-coverage-'+name);});
    var owned=report.cases.filter(function(c){return c.ownedPixels&&c.scene.indexOf('occluder')<0;});
    // Exact integer-mask coverage without any antialiased deficit: owner-mask
    // cases read 255, but the fixture then proves nothing about edge coverage.
    check('perfect non antialiased host passes owner-mask cases yet fails sensitivity so the run cannot pass',
      report.complete&&report.status==='SETUP_FAILURE'&&owned.length===12&&owned.every(function(c){return c.pass===true;})&&
      sensitivity.pass===false&&sensitivity.failedToDip.length===10&&plainFlats.every(function(c){return c&&c.pass===true;}),
      {status:report.status,sensitivity:sensitivity,flats:plainFlats,owned:owned.map(function(c){return[c.id,c.pass,c.prerequisites.slice(0,1)];})});
    check('mask-white host fails the black base control on region colour alone',
      base.pass===false&&base.regionMax===255&&base.leakPixels===0&&!base.prerequisites.length,base);
  }},{host:'cancel',mode:'background',cancelAfter:3,verify:function(report){
    check('cancellation reports CANCELLED and incomplete, never a verdict',
      report.status==='CANCELLED'&&report.complete===false&&G.canvas===sentinel,{status:report.status,complete:report.complete});
  }}];
  if(only!==undefined&&!steps.some(function(step){return step.host===only;})&&only!=='none')throw Error('SETUP unknown host '+only);
  steps.filter(function(step){return only===undefined||step.host===only;}).reduce(function(chain,step){
    return chain.then(function(){return run(step.mode||step.host,step.cancelAfter);}).then(step.verify);
  },Promise.resolve()).catch(function(error){check('asynchronous run completed without an exception',false,String(error)+' '+String(error&&error.stack));})
    .then(function(){out('EDGE_COVERAGE_RESULT '+(failed?'FAIL '+failed+'/'+checked:'PASS '+checked));});
}());
undefined;
