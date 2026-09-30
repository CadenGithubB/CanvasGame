(function(){
  (0, eval)(slurp('assets/games/src/02-simulation-clock.js'));
  var G=(0,eval)('this'),checked=0,clock=0,rafCalls=0,cancelled=[];
  function noop(){}
  G.window=G;G.addEventListener=noop;
  G.document={getElementById:function(){return null;},addEventListener:noop};
  G.performance={now:function(){return clock++;}};
  G.cancelAnimationFrame=function(id){cancelled.push(id);};
  G.requestAnimationFrame=function(fn){rafCalls++;return rafCalls;};
  G._pt=function(name,fn){return fn();};
  // The live Perf HUD state (19-companions-loot.js, 20-diagnostics.js).
  G._perfBreakdown={live:1};G._perfBreakdownLog=1234;G._perfStageHistory={};G._perfSecStages={};
  (0,eval)(slurp('assets/games/src/20-browser-profile.js'));
  function check(name,okay){if(!okay)throw Error(name);checked++;__out('PASS '+name);}
  var samples=[9,1,3,5];
  var summary=G.caveProfileSummary(samples);
  check('median averages middle pair without mutating samples',summary.medianMs===4 && samples.join(',')==='9,1,3,5');
  check('p95 uses nearest rank',summary.p95Ms===9 && summary.samples===4);
  check('odd median uses middle sample',G.caveProfileSummary([7,3,5]).medianMs===5);
  check('empty result reports unavailable timings',G.caveProfileSummary([]).medianMs===null && G.caveProfileSummary([]).samples===0);
  var oldDate=Date.now,oldRandom=Math.random,oldPt=G._pt,seen=[];
  var oldGameClock=G.gameTimeNow,oldPresentationState=G._presentationRandomState;
  var job={frozenTime:2000000000000,randomSeed:1234567,renderMs:[],stages:{}};
  G.drawCaveVisibilityFixtures=function(){seen.push([Date.now(),Math.random(),Math.random(),G.gameTimeNow(),G.presentationRandom()]);G._pt('outer',function(){G._pt('inner',noop);});};
  G.caveProfileRender(job,true);G.caveProfileRender(job,true);
  check('every sampled render gets the same frozen clock and seeded random sequence',JSON.stringify(seen[0])===JSON.stringify(seen[1]) && seen[0][0]===2000000000000 && seen[0][3]===2000000000000);
  check('render restores native clock random and timing wrapper before yielding',Date.now===oldDate && Math.random===oldRandom && G._pt===oldPt && G.gameTimeNow===oldGameClock && G._presentationRandomState===oldPresentationState);
  check('inclusive stage timings keep parent and child separately',job.stages.outer.length===2 && job.stages.inner.length===2 && job.stages.outer[0]>job.stages.inner[0]);
  check('render command samples recorded once per measured frame',job.renderMs.length===2 && job.renderMs[0]>0);
  G.caveProfileRender(job,false);
  check('warmups do not pollute measured sample counts',job.renderMs.length===2 && job.stages.outer.length===2);
  G.drawCaveVisibilityFixtures=function(){throw Error('injected draw failure');};
  var failed=false;try{G.caveProfileRender(job,true);}catch(e){failed=e.message==='injected draw failure';}
  check('failed render propagates error and restores all temporarily replaced globals',failed && Date.now===oldDate && Math.random===oldRandom && G._pt===oldPt && G.gameTimeNow===oldGameClock && G._presentationRandomState===oldPresentationState);
  check('failed render is not counted as a successful sample',job.renderMs.length===2);
  // Perf HUD (merge fix): each profile draw times its stages into the job's
  // own table, ring and per-second stacks (the same ones every frame) and
  // runs renderFrame's 5 s dump on the frozen clock; the live state and the
  // dump's live time come back untouched, after a failed draw too.
  var livePerf={table:G._perfBreakdown,history:G._perfStageHistory,sec:G._perfSecStages},perfSeen=[];
  var perfJob={frozenTime:2000000000000,randomSeed:1234567,renderMs:[],stages:{}};
  G.drawCaveVisibilityFixtures=function(){
    perfSeen.push([G._perfBreakdown,G._perfStageHistory,G._perfSecStages,G._perfBreakdownLog]);
    G._perfBreakdown.draw=(G._perfBreakdown.draw||0)+1;G._perfStageHistory.draw=1;G._perfSecStages.draw=1;
    if(Date.now()-G._perfBreakdownLog>5000){G._perfBreakdownLog=Date.now();G._perfBreakdown={};}
  };
  G.caveProfileRender(perfJob,true);G.caveProfileRender(perfJob,true);
  var perfSinkDraws=perfJob.perf&&perfJob.perf.breakdown.draw;
  G.drawCaveVisibilityFixtures=function(){G._perfBreakdown={broken:1};G._perfBreakdownLog=Date.now();throw Error('injected perf failure');};
  failed=false;try{G.caveProfileRender(perfJob,true);}catch(e){failed=e.message==='injected perf failure';}
  check('profile draws time into the job\'s own Perf HUD sinks and the live Perf HUD state and dump time come back untouched, after a failed draw too',
    failed && perfSeen.length===2 && perfSeen[0][0]!==livePerf.table && perfSeen[0][1]!==livePerf.history && perfSeen[0][2]!==livePerf.sec &&
    perfSeen[1][0]===perfSeen[0][0] && perfSeen[1][1]===perfSeen[0][1] && perfSeen[0][3]===perfJob.frozenTime && perfSinkDraws===2 &&
    G._perfBreakdown===livePerf.table && JSON.stringify(G._perfBreakdown)==='{"live":1}' && G._perfBreakdownLog===1234 &&
    G._perfStageHistory===livePerf.history && G._perfSecStages===livePerf.sec && !Object.keys(livePerf.history).length && !Object.keys(livePerf.sec).length);
  var resumed=0;
  G._caveBrowserProfile={raf:17,resume:function(value){if(value===null)resumed++;}};
  G.cancelCaveBrowserProfile('fixture changed');
  check('cancel removes pending animation frame and resumes pending wait',cancelled[0]===17 && resumed===1 && G._caveBrowserProfile.raf===0);
  check('cancel records reason and clears resolver',G._caveBrowserProfile.cancelReason==='fixture changed' && G._caveBrowserProfile.resume===null);
  G.cancelCaveBrowserProfile('cancel again');
  check('repeated cancellation does not double resume or cancel stale callbacks',resumed===1 && cancelled.length===1);
  G._caveBrowserProfile=null;G.cancelCaveBrowserProfile();
  check('cancel without active profile is safe',cancelled.length===1);
  G.canvas={width:1,height:1};var readbacks=0;
  G.ctx={getImageData:function(){readbacks++;return{data:new Uint8Array([12,34,56,255])};}};
  var sig=G.caveProfileContentSignature();
  check('content signature records full RGBA bytes and readback algorithm',sig.bytes===4 && sig.algorithm==='fnv1a32-rgba' && sig.hash.length===8 && readbacks===1);
  check('content signature is deterministic',G.caveProfileContentSignature().hash===sig.hash);
  check('signature reports all twelve spatial tiles from the same readback',sig.tiles.length===12 && sig.tileColumns===4 && sig.tileRows===3 && sig.tiles.reduce(function(n,t){return n+t.bytes;},0)===4);
  var priorReadbacks=readbacks,skipped=G.caveProfileOptionalSignature(false);
  check('pixel verification disabled performs no main-canvas readback',skipped.skipped===true && skipped.reason.indexOf('disabled')>=0 && readbacks===priorReadbacks);
  var verified=G.caveProfileOptionalSignature(true);
  check('pixel verification only reads canvas when explicitly enabled',readbacks===priorReadbacks+1 && verified.hash===sig.hash);
  G.floorMesh={id:'original'};G.WORLD_SEED=12345;
  G.ambientParticles=[{real:true}];G.exploredCells=new Uint8Array([1,0,1]);G.minimapCanvas={real:true};G.minimapDirty=false;
  G.drawMinimap=function(){};G.drawMinimap._fogCanvas={realFog:true};G._lastExploredUpdate=123;
  G._lightGrid=new Float32Array([0.3,0.4]);G._lightGridLastScale=0.3;G._lightGridLastCamGX=7;G._lightGridLastCamGY=8;G._lightGridFrameCount=21;
  G._surfaceFloorLightBake=new Float32Array([0.2,0.6]);G._surfaceFloorLightMesh=G.floorMesh;
  G._surfaceFloorLightScale=0.4;G._surfaceFloorLightStats={bakeMs:2};
  var surfaceBake=G._surfaceFloorLightBake,surfaceStats=G._surfaceFloorLightStats;
  G.settings={showFPS:true};G._fpsSmooth=42;G._lastFrameTimeMs=78;G.MINIMAP_W=90;G.MINIMAP_H=65;
  G.document.createElement=function(){return{};};
  G.initAmbientParticles=function(){G.ambientParticles=[{x:Math.random(),alpha:0}];};
  G.updateAmbientParticles=function(dt){G.ambientParticles[0].alpha=Math.random();};
  G.initMinimap=function(){G.exploredCells=new Uint8Array([1,1,0]);G.minimapCanvas={canonical:true};G.minimapDirty=true;};
  G.updateLightGrid=function(){G._lightGrid[0]=Date.now()%1009;G._lightGridLastScale=0.9;G._surfaceFloorLightScale=0.8;};
  var originalAmbient=G.ambientParticles,originalExplored=G.exploredCells,originalMap=G.minimapCanvas,originalFog=G.drawMinimap._fogCanvas,originalLight=G._lightGrid;
  G.caveProfilePrepareInputs(job);
  var firstParticles=JSON.stringify(G.ambientParticles),firstLighting=G._lightGrid[0];
  check('canonical setup preserves live arrays by using temporary references',G.ambientParticles!==originalAmbient && G.exploredCells!==originalExplored && G.minimapCanvas!==originalMap && G.drawMinimap._fogCanvas!==originalFog && G._lightGrid!==originalLight);
  check('canonical setup retains particles and map instead of hiding quality features',G.ambientParticles.length===1 && G.exploredCells.length===3 && G.drawMinimap._fogCanvas.width===90 && G.drawMinimap._fogCanvas.height===65);
  check('canonical lighting forces a frozen-time update on its own buffer',firstLighting===job.frozenTime%1009 && G._lightGridFrameCount===4 && originalLight[0]!==firstLighting);
  check('canonical surface lighting shares immutable visibility and updates only its scalar',G._surfaceFloorLightBake===surfaceBake && G._surfaceFloorLightScale===0.8 && surfaceBake[0]===Math.fround(0.2));
  check('canonical setup restores native random and clock before yielding',Date.now===oldDate && Math.random===oldRandom);
  G.caveProfileRestoreInputs(job);
  check('profile teardown restores exact original world references',G.ambientParticles===originalAmbient && G.exploredCells===originalExplored && G.minimapCanvas===originalMap && G.drawMinimap._fogCanvas===originalFog && G._lightGrid===originalLight);
  check('profile teardown restores map lighting and FPS metadata',G.minimapDirty===false && G._lastExploredUpdate===123 && G._lightGridLastScale===0.3 && G._lightGridLastCamGX===7 && G._lightGridFrameCount===21 && G.settings.showFPS===true && G._fpsSmooth===42 && G._lastFrameTimeMs===78);
  check('profile teardown restores surface-light scalar and preserves baked references',G._surfaceFloorLightScale===0.4 && G._surfaceFloorLightBake===surfaceBake && G._surfaceFloorLightStats===surfaceStats && G._surfaceFloorLightMesh===G.floorMesh);
  G.caveProfilePrepareInputs(job);
  check('two profile setups produce identical particle and light inputs',JSON.stringify(G.ambientParticles)===firstParticles && G._lightGrid[0]===firstLighting);
  G.caveProfileRestoreInputs(job);
  var oldInit=G.initAmbientParticles;G.initAmbientParticles=function(){G.ambientParticles=[{temporary:true}];throw Error('setup failed');};
  failed=false;try{G.caveProfilePrepareInputs(job);}catch(e){failed=e.message==='setup failed';}
  G.caveProfileRestoreInputs(job);G.initAmbientParticles=oldInit;
  check('failed setup still restores changed arrays and native globals',failed && G.ambientParticles===originalAmbient && Date.now===oldDate && Math.random===oldRandom);
  G.caveProfilePrepareInputs(job);var newAmbient=[{newWorld:true}];G.floorMesh={id:'new'};G.ambientParticles=newAmbient;
  var newSurface=new Float32Array([0.9]);G._surfaceFloorLightBake=newSurface;G._surfaceFloorLightMesh=G.floorMesh;G._surfaceFloorLightScale=0.7;
  G.caveProfileRestoreInputs(job);
  check('cancel after world regeneration never restores old world arrays',G.ambientParticles===newAmbient);
  check('cancel after world regeneration preserves new surface lighting',G._surfaceFloorLightBake===newSurface && G._surfaceFloorLightMesh===G.floorMesh && G._surfaceFloorLightScale===0.7);
  // Unified effects (spec 10.4): with the engine present the profile primes a
  // fresh pinned particle pool (stubbed here: this harness loads only the
  // profile fragment) under the profile's seeded random, swaps it in place of
  // the live one and restores the live one only while it is still owned.
  var liveFx={live:true,pinned:false},legacyCalls=0,primes=[];
  G.fxState=liveFx;G.floorMesh={id:'fx world'};G.ambientParticles=[{live:true}];
  var fxLiveAmbient=G.ambientParticles,fxOldInit=G.initAmbientParticles;
  G.initAmbientParticles=function(){legacyCalls++;return fxOldInit.apply(G,arguments);};
  G.effectProfilePrime=function(job){primes.push(job.randomSeed);G.fxState={profile:true,pinned:true,seed:job.randomSeed,draws:[Math.random(),Math.random()]};};
  G.caveProfilePrepareInputs(job);
  var profileFx=G.fxState,firstFx=JSON.stringify(profileFx);
  check('with the engine the profile primes its own pinned pool instead of the legacy motes',profileFx!==liveFx && profileFx.profile===true && profileFx.pinned===true &&
    primes.length===1 && primes[0]===job.randomSeed && legacyCalls===0 && Math.random===oldRandom);
  G.caveProfileRestoreInputs(job);
  check('profile teardown restores the live particle pool',G.fxState===liveFx && G.ambientParticles===fxLiveAmbient);
  G.caveProfilePrepareInputs(job);
  check('two profile setups prime identical particle pools',JSON.stringify(G.fxState)===firstFx && G.fxState!==profileFx);
  G.caveProfileRestoreInputs(job);
  G.caveProfilePrepareInputs(job);var cancelledFx=G.fxState;G.floorMesh={id:'regenerated'};
  G.caveProfileRestoreInputs(job);
  check('cancel after world regeneration never restores the old pool and unpins the profile pool left live',G.fxState===cancelledFx && G.fxState!==liveFx && cancelledFx.pinned===false);
  G.effectProfilePrime=undefined;G.initAmbientParticles=fxOldInit;
  // Recorded workload inputs (spec 10.4): the Particles setting and every
  // live particle, on a host without the engine (this harness loads only the
  // profile fragment: the typeof fallback) and with one (a stubbed stats call).
  G.settings.particles=40;G.ambientParticles=[{a:1},{b:2},{c:3}];
  var plainInputs=G.caveProfileCanonicalInputs();
  check('profile inputs record the Particles setting and the legacy motes without the engine',typeof G.getEffectStats==='undefined' &&
    plainInputs.particleSetting===40 && plainInputs.particles===3 && plainInputs.ambientParticles===3);
  G.getEffectStats=function(){return{live:37};};G.ambientParticles=[{legacy:true},{legacy:true}];
  var engineInputs=G.caveProfileCanonicalInputs();
  G.getEffectStats=undefined;
  check('profile inputs count the engine pool and any legacy motes with the engine',engineInputs.particles===39 &&
    engineInputs.particleSetting===40 && engineInputs.ambientParticles===2);
  // Render preset and switches (3D integration): recorded when the registry
  // is present (stubbed here), null without it.
  var features={wallPropModels:true,worldTextures:'hybrid'};
  G.renderPresetName=function(){return 'custom';};G.renderFeatureSnapshot=function(){return Object.assign({},features);};
  var renderInputs=G.caveProfileCanonicalInputs();
  G.renderPresetName=G.renderFeatureSnapshot=undefined;
  check('profile inputs record the render preset and switches with the registry, null without it',plainInputs.renderPreset===null &&
    plainInputs.renderFeatures===null && renderInputs.renderPreset==='custom' && JSON.stringify(renderInputs.renderFeatures)===JSON.stringify(features));
  __out('BROWSER_PROFILE_RESULT PASS '+checked);
}());
undefined;
