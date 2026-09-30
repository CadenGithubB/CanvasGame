// Reuse the shipping browser-API host, then exercise the real studio and game.
(function () {
  var G=(0,eval)('this'), output=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out, checked=0;
  var host=slurp('tools/game/tests/cave_occlusion_integration.js');
  var end=host.indexOf('  function check(name, okay) {');
  if(end<0)throw Error('shipping game host boundary missing');
  var bootstrap=host.slice(0,end),listenerStub='G.addEventListener = G.removeEventListener = noop;';
  // Mutations apply to slurped sources only (anchor must match exactly once):
  //   --studio-shares-pool      the effect engine family loses its studio hook
  //   --studio-integrate-throws every studio-pool integration throws (counted)
  //   --studio-ambient-drift    the legacy motes copy is not restored per cycle
  //   --governor-ignores-pinned the frame-time governor also thins pinned (studio) pools
  //   --thin-ignores-pin        thinning reads the raw governor instead of the pinned frame's
  //   --field-global-serial     the ambient field draws its columns from a session-wide serial
  //   --studio-hud-unscoped     the spell HUD's spell-change time is not studio state
  //   --gallery-hud-idle        the gallery starts idle, so the HUD fade hides its spell label
  //   --studio-perf-unscoped    the Perf HUD's stage table, ring and dump time are not studio state
  //   --profile-perf-unscoped   the cave profile draws into the live Perf HUD state
  var load="manifest.parts.MAIN.forEach(function (path) { (0, eval)(slurp('assets/games/' + path)); });";
  if(bootstrap.split(load).length!==2)throw Error('shipping manifest loader boundary missing');
  bootstrap=bootstrap.replace(load,"manifest.parts.MAIN.forEach(function (path) { (0, eval)(G.__studioSource(path, slurp('assets/games/' + path))); });");
  var MUTATIONS={'--studio-shares-pool':['src/11-fx-engine.js','hooks:{rebase:fxRebase, reset:fxReset, prime:fxPrime, studio:fxStudioInstall}','hooks:{rebase:fxRebase, reset:fxReset, prime:fxPrime}'],
    '--studio-integrate-throws':['src/11-fx-engine.js','function fxIntegrate(S, dt) {\n','function fxIntegrate(S, dt) {\n  if (S.pinned) throw Error(\'studio integrate\');\n'],
    '--studio-ambient-drift':['src/02-effect-registry.js','hooks:{prime:effectAmbientLegacyPrime,studio:effectAmbientLegacyStudio}','hooks:{prime:effectAmbientLegacyPrime}'],
    '--governor-ignores-pinned':['src/14-fx-render.js','  F.g = !S || S.pinned ? 1 : G.governor;','  F.g = !S ? 1 : G.governor;'],
    '--thin-ignores-pin':['src/14-fx-render.js','(S.seedA[i] & 1023) >= F.g * 1024)','(S.seedA[i] & 1023) >= _fxRender.governor * 1024)'],
    '--field-global-serial':['src/11-fx-engine.js','  var base = S.fieldSerial, salt = F.salt ^ S.seed,','  var base = (window._fxSessionFieldSerial = (window._fxSessionFieldSerial || 0) + 1), salt = F.salt ^ S.seed,'],
    '--studio-hud-unscoped':['src/20-casting-preview.js','currentSpellIdx lastShotMs lastSpellChangeMs castAnimUntil','currentSpellIdx lastShotMs castAnimUntil'],
    '--gallery-hud-idle':['src/20-casting-preview.js',"job.live.lastSpellChangeMs = job.mode === 'gallery' ? job.clockBase : -1e12;","job.live.lastSpellChangeMs = -1e12;"],
    '--studio-perf-unscoped':['src/20-casting-preview.js',"  '_perfBreakdown _perfBreakdownLog _perfStageHistory _perfSecStages ' +\n",''],
    '--profile-perf-unscoped':['src/20-browser-profile.js','  _perfBreakdown=perf.breakdown;_perfBreakdownLog=perf.log;_perfStageHistory=perf.history;_perfSecStages=perf.sec;\n','']};
  G.__studioSource=function(path,src){
    Object.keys(MUTATIONS).forEach(function(flag){
      var m=MUTATIONS[flag];
      if(path!==m[0]||__argv.indexOf(flag)<0)return;
      if(src.split(m[1]).length!==2)throw Error('MUTATION_ANCHOR '+flag);
      src=src.replace(m[1],m[2]);
    });
    return src;
  };
  if(bootstrap.indexOf(listenerStub)<0)throw Error('shipping window event host boundary missing');
  bootstrap=bootstrap.replace(listenerStub,'G.__studioWindowEvents={}; G.addEventListener=function(type,listener){(G.__studioWindowEvents[type]||(G.__studioWindowEvents[type]=[])).push(listener);}; G.removeEventListener=noop;');
  (0,eval)(bootstrap+'G.__studioErrors=errors; }());');
  G.document.fullscreenElement=G.document.webkitFullscreenElement=G.document.mozFullScreenElement=G.document.msFullscreenElement=null;
  if(typeof G.startCastingStudio!=='function')(0,eval)(slurp('assets/games/src/20-casting-preview.js'));
  function check(name,okay){if(!okay)throw Error(name);checked++;output('PASS '+name);}
  // Spell HUD (held-staff fade): hudTexts records every text drawn during fn
  // with the alpha it is drawn at; hudAlphas picks one text's alphas.
  function hudTexts(fn){
    var texts=[],oldFill=G.ctx.fillText;
    G.ctx.fillText=function(text){texts.push({text:String(text),alpha:G.ctx.globalAlpha});return oldFill.apply(this,arguments);};
    try{fn();}finally{G.ctx.fillText=oldFill;}
    return texts;
  }
  function hudAlphas(texts,text){return texts.filter(function(t){return t.text===text;}).map(function(t){return t.alpha;});}
  // S3 migrated ambient and torch embers. The S2 studio checks keep their
  // fixture (the live legacy motes copied into the studio; the 12-particle
  // burst as the studio pool's only particles) with both families held on
  // their legacy paths (a console override, never persisted; torch embers
  // follow the ambient family); the New-mode studio field is checked on its
  // own after them.
  G.setEffectFamilyMode('ambient','legacy');
  G._caveTestSeedOverride=12345;G._caveTestKindOverride='descending';
  G.CAVE_TEST_MODE=G.ENDLESS_MODE=G.running=true;G.gameOverState=false;G.terrain='plains';
  Object.keys(G.caveTestFlags).forEach(function(key){G.caveTestFlags[key]=false;});
  G.resetEndlessMode();G.MODE3D=true;G.overviewActive=false;G.USE_MOUSE=true;G.USE_GAMEPAD=false;
  G.settings.dayNight=true;G.dayTime=0.5;G.daySpeed=0;
  G.previewCaveView('mouth');
  check('studio defaults to the articulated anatomy proof, not rejected flat art',G._castingStudioMode==='hand');
  G._castingStudioMode='casting';
  var baseline={pos:G.pos,cam:G.cam,mana:G.mana,equipment:G.equipment,stats:G.stats,spells:G.spells,
    projectiles:G.projectiles,pending:G.pendingMissileCasts,reservation:G.spellCastReservationSerial,impacts:G.impacts,enemies:G.enemies,light:G._lightGrid,
    explored:G.exploredCells,minimap:G.minimapCanvas,pose:G._castingPoseState,day:G.dayTime,settings:G.settings,
    surfaceBake:G._surfaceFloorLightBake,surfaceMesh:G._surfaceFloorLightMesh,surfaceScale:G._surfaceFloorLightScale,surfaceStats:G._surfaceFloorLightStats};
  var job=G.startCastingStudio();
  check('studio uses a real clear lane in the existing seeded world',job.target.distance>=96&&job.target.distance<=220&&job.mesh===G.floorMesh);
  check('studio pauses ordinary loop without replacing player state',!G.running&&G.pos===baseline.pos&&G.cam===baseline.cam);
  check('studio owns independent combat and appearance state',job.live.equipment!==baseline.equipment&&job.live.stats!==baseline.stats&&job.live.enemies!==baseline.enemies&&job.live._castingPoseState!==baseline.pose);
  check('studio shares immutable terrain-light bake without changing live scale',job.live._surfaceFloorLightBake===baseline.surfaceBake&&G._surfaceFloorLightScale===baseline.surfaceScale&&G._surfaceFloorLightMesh===baseline.surfaceMesh);
  G.castingStudioAdvance(job,600);
  check('practice request enters production windup without an early projectile',job.requested&&!job.released&&job.live.projectiles.length===0&&job.live.pendingMissileCasts.length===1);
  check('pending practice cast never replaces the real queue or reservation serial',G.pendingMissileCasts===baseline.pending&&job.live.pendingMissileCasts!==baseline.pending&&G.spellCastReservationSerial===baseline.reservation);
  G.castingStudioAdvance(job,715);
  check('gather phase remains pending before the real release time',!job.released&&job.live.projectiles.length===0);
  G.castingStudioAdvance(job,1400);
  check('actual missile releases after requested 120 ms windup',Math.abs(job.requestAt-600)<0.001&&job.releaseAt>=720&&job.releaseAt<=720+G.CASTING_STUDIO_STEP_MS&&job.released);
  check('actual projectile cylinder collision damages practice target',job.hitAt>720&&job.hitAt<1400&&job.live.stats.totalDamageDone===1&&job.live.enemies[0].health===999);
  check('real mana cost remains in isolated practice state',job.live.mana===G.MANA_MAX-G.spells.missile.manaCost&&G.mana===baseline.mana);
  check('cast and hit do not alter actual arrays or stats',G.projectiles===baseline.projectiles&&G.pendingMissileCasts===baseline.pending&&G.impacts===baseline.impacts&&G.enemies===baseline.enemies&&G.stats===baseline.stats);
  // Unified effects (T21): each studio cycle gets a fresh pinned 512-slot pool
  // ticked on the studio step; studio bursts never reach the live pool.
  function fxBytes(S){return JSON.stringify([S.count,S.tick,S.serial,Array.prototype.slice.call(S.x,0,S.count),Array.prototype.slice.call(S.age,0,S.count)]);}
  var liveFx=G.fxState,studioFx=job.live.fxState;
  G.setEffectFamilyMode('pickupBursts','new');
  G.fxEmit('feedbackBurst',G.pos.x+40,G.pos.y,G.playerFeetSpatialZ()+20,{count:12,color:'#bb66ff'});G.updateEffects(1/60);
  var liveBytes=fxBytes(liveFx);
  check('studio installs a fresh pinned effect pool ticked on the studio step',!!studioFx&&studioFx!==liveFx&&studioFx.pinned&&studioFx.cap===512&&studioFx.tick===Math.round(1400/G.CASTING_STUDIO_STEP_MS)&&liveFx.count>0);
  G.castingStudioScoped(job,function(){G.fxEmit('feedbackBurst',job.target.x,job.target.y,job.target.z+20,{count:12,color:'#44ffff'});});
  var studioTick0=studioFx.tick;
  G.castingStudioAdvance(job,1450);G.setEffectFamilyMode('pickupBursts',null);
  check('studio bursts spawn in the studio pool and never change the live pool',G.fxState===liveFx&&job.live.fxState===studioFx&&studioFx.count>=12&&fxBytes(liveFx)===liveBytes);
  // Integration really runs on the studio step (not only the tick counter):
  // every burst particle, spawned in the first step after the emit, has aged
  // one studio step per step since.
  var studioSteps=studioFx.tick-studioTick0,burstAges=[];
  for(var fi=0;fi<studioFx.count;fi++)if(studioFx.rec[fi]===studioFx.C.ID.feedbackBurst)burstAges.push(studioFx.age[fi]);
  if(!(burstAges.length>=12&&Math.min.apply(null,burstAges)>=(studioSteps-1)*G.CASTING_STUDIO_STEP_MS/1000-1e-9))
    output('DETAIL studio ages '+JSON.stringify({steps:studioSteps,count:burstAges.length,minAge:Math.min.apply(null,burstAges),stepSeconds:G.CASTING_STUDIO_STEP_MS/1000}));
  check('studio particles age on every studio step',studioSteps>=5&&burstAges.length>=12&&Math.min.apply(null,burstAges)>=(studioSteps-1)*G.CASTING_STUDIO_STEP_MS/1000-1e-9);
  // T21, render side: a studio frame draws the studio pool through the real fx
  // stages and the governor never thins it, so studio A/B frames never depend
  // on machine timing; both pools stay untouched. The burst is relabelled as
  // ambient class (the governor thins only weather, ambient and locomotion)
  // with the governor forced to 0.35; the same frame with the studio pool
  // unpinned thins it (negative control).
  G.setEffectFamilyMode('pickupBursts','new');G._fxRender.governor=0.35;
  var studioCls=Array.prototype.slice.call(studioFx.cls,0,studioFx.count);
  for(var ci=0;ci<studioFx.count;ci++)studioFx.cls[ci]=1;
  var liveDrawBytes=fxBytes(liveFx),studioDrawBytes=fxBytes(studioFx),studioFrame=G.castingStudioDraw(job),studioDrawn=G.getEffectStats().frame;
  studioFx.pinned=false;G._fxRender.governor=0.35;G.castingStudioDraw(job);var unpinnedDrawn=G.getEffectStats().frame;studioFx.pinned=true;
  for(ci=0;ci<studioCls.length;ci++)studioFx.cls[ci]=studioCls[ci];
  // The unpinned control frame's pixels (S9: its passes feed the governor's
  // raster input) are dropped with the governor state it leaves behind.
  G._fxRender.governor=1;G._fxRender.ema=0;G._fxRender.rasterAcc=0;G.setEffectFamilyMode('pickupBursts',null);
  var studioThin={drawn:studioDrawn.drawn,considered:studioDrawn.considered,thinned:studioDrawn.thinned,unpinnedThinned:unpinnedDrawn.thinned};
  if(!(studioDrawn.drawn>=12&&studioDrawn.thinned===0&&unpinnedDrawn.thinned>0))output('DETAIL studio frame '+JSON.stringify({frame:studioThin,stages:Object.keys(studioFrame.stages).filter(function(k){return /^fx|ambientFX/.test(k);})}));
  check('a studio frame draws the studio pool through the fx stages and the governor never thins it',
    ['fxCombat3D','ambientFX3D','fxOverlay'].every(function(k){return k in studioFrame.stages;})&&studioDrawn.drawn>=12&&studioDrawn.considered>=12&&
    studioDrawn.thinned===0&&unpinnedDrawn.thinned>0&&fxBytes(liveFx)===liveDrawBytes&&fxBytes(studioFx)===studioDrawBytes&&G.fxState===liveFx);
  var damage=job.live.stats.totalDamageDone, oldDate=Date.now, oldRandom=Math.random, caught=false;
  var oldGameClock=G.gameTimeNow, oldPresentationState=G._presentationRandomState;
  try{G.castingStudioScoped(job,function(){G.mana=7;G.projectiles=[];throw Error('deliberate draw failure');});}catch(e){caught=e.message==='deliberate draw failure';}
  check('exception restores global references and clock immediately',caught&&G.mana===baseline.mana&&G.projectiles===baseline.projectiles&&Date.now===oldDate&&Math.random===oldRandom&&G.gameTimeNow===oldGameClock&&G._presentationRandomState===oldPresentationState);
  check('isolated state survives scope exit for next frame',job.live.mana===7&&job.live.stats.totalDamageDone===damage);
  // The HUD's spell-change time is studio state: a live change at the studio's
  // own clock time must not show the panel, and the studio never writes it.
  var liveSpellChange=G.lastSpellChangeMs;G.lastSpellChangeMs=job.clockBase;
  var idleHud=hudTexts(function(){G.setCastingStudioLight('dusk');});
  check('dusk changes only studio lighting',job.live.dayTime===0.78&&G.dayTime===baseline.day&&G._lightGrid===baseline.light);
  check('dusk isolates exterior-light scalar while retaining same visibility bake',G._surfaceFloorLightScale===baseline.surfaceScale&&G._surfaceFloorLightBake===baseline.surfaceBake&&job.live._surfaceFloorLightBake===baseline.surfaceBake&&job.live._surfaceFloorLightScale!==baseline.surfaceScale);
  var beforeErrors=G.__studioErrors.length;
  G.castingStudioAdvance(job,1000);var castHud=hudTexts(function(){G.castingStudioDraw(job);});
  check('actual full render reports no swallowed stage errors',G.__studioErrors.length===beforeErrors);
  // Decision: the casting study starts idle, as in play (not P1's always-on
  // panel), so the practice cast at 600 ms brings the panel in.
  var castingHud={idle:hudAlphas(idleHud,G.spells.missile.name),cast:hudAlphas(castHud,G.spells.missile.name),live:G.lastSpellChangeMs===job.clockBase};
  if(!(castingHud.idle.length===0&&castingHud.cast.length===1&&castingHud.cast[0]===1&&castingHud.live))output('DETAIL casting HUD '+JSON.stringify(castingHud));
  check('casting study spell HUD is idle before the practice cast and shown after it, on studio state only',
    castingHud.idle.length===0&&castingHud.cast.length===1&&castingHud.cast[0]===1&&castingHud.live);
  G.lastSpellChangeMs=liveSpellChange;
  check('draw restores pose settings and minimap references',G.cam===baseline.cam&&G.pos===baseline.pos&&G.settings===baseline.settings&&G.exploredCells===baseline.explored&&G.minimapCanvas===baseline.minimap&&G._castingPoseState===baseline.pose);
  caught=false;
  try{G.castingStudioScoped(job,function(){G._surfaceFloorLightScale=77;throw Error('lighting scope failure');});}catch(e){caught=e.message==='lighting scope failure';}
  check('failed studio draw restores surface-light state immediately',caught&&G._surfaceFloorLightScale===baseline.surfaceScale&&G._surfaceFloorLightBake===baseline.surfaceBake&&G._surfaceFloorLightMesh===baseline.surfaceMesh&&G._surfaceFloorLightStats===baseline.surfaceStats);
  G.setCastingStudioArt(false);
  check('each studio cycle gets a fresh effect pool',job.live.fxState!==studioFx&&job.live.fxState!==G.fxState&&job.live.fxState.count===0&&G.fxState===liveFx);
  check('A/B resets same pose and physics timeline',job.time===0&&!job.released&&!job.requested&&job.live.pendingMissileCasts.length===0&&job.live.CASTING_ART_ENABLED===false&&job.live.pos.x===baseline.pos.x&&job.live.pos.y===baseline.pos.y);
  G.castingStudioAdvance(job,1400);
  check('original visual path produces same real hit damage',job.live.stats.totalDamageDone===damage&&job.live.enemies[0].health===999);
  // The legacy motes move on the studio step (updateEffects runs the legacy
  // ambient update); every cycle restarts from the copy the studio opened
  // with, so a reset or backwards scrub replays the same motes.
  function motes(list){return JSON.stringify(list.map(function(p){return [p.x,p.y,p.z,p.life,p.alpha];}));}
  var liveMotes=motes(G.ambientParticles);
  G.castingStudioResetCycle(job);var motes0=motes(job.live.ambientParticles);G.castingStudioAdvance(job,1000);var motes1=motes(job.live.ambientParticles);
  G.castingStudioResetCycle(job);var motes0b=motes(job.live.ambientParticles);G.castingStudioAdvance(job,1000);var motes1b=motes(job.live.ambientParticles);
  if(!(motes0===motes0b&&motes1===motes1b))output('DETAIL studio motes '+JSON.stringify({count:job.live.ambientParticles.length,startSame:motes0===motes0b,endSame:motes1===motes1b,moved:motes0!==motes1}));
  check('studio cycles replay the same legacy ambient motes',job.live.ambientParticles.length>=20&&motes0!==motes1&&motes0===motes0b&&motes1===motes1b&&motes(G.ambientParticles)===liveMotes);
  // New mode (S3): each cycle's fresh pinned pool primes its own ambient field
  // and torch embers around the studio camera from the job's seed, so a reset
  // or a backwards scrub replays the same motes; the live pool is untouched.
  G.setEffectFamilyMode('ambient',null);
  var liveFieldBytes=fxBytes(G.fxState);
  function fieldMembers(S){var n=0;for(var q=0;q<S.count;q++)if(S.flags[q]&64)n++;return n;}
  G.castingStudioResetCycle(job);G.castingStudioAdvance(job,1000);
  var field0=fxBytes(job.live.fxState),fieldPool0=job.live.fxState,members0=fieldMembers(fieldPool0);
  G.castingStudioResetCycle(job);G.castingStudioAdvance(job,1000);var field1=fxBytes(job.live.fxState);
  var fieldDetail={members:members0,fieldSame:field0===field1,fresh:job.live.fxState!==fieldPool0,liveSame:fxBytes(G.fxState)===liveFieldBytes};
  if(!(members0>=20&&fieldDetail.fieldSame&&fieldDetail.fresh&&fieldDetail.liveSame))output('DETAIL studio field '+JSON.stringify(fieldDetail));
  check('studio cycles replay the same New ambient field',members0>=20&&fieldDetail.fieldSame&&fieldDetail.fresh&&fieldDetail.liveSame&&G.fxState===liveFx);
  G.stopCastingStudio('test complete');
  check('stop restores original simulation and equipment',G._castingStudio===null&&G.running&&G.equipment===baseline.equipment&&G.spells===baseline.spells&&G.mana===baseline.mana);
  var cancelled=G.startCastingStudio(),resumes=0,cancels=0,oldCancel=G.cancelAnimationFrame;
  cancelled.profile=true;cancelled.raf=17;cancelled.resume=function(value){if(value===null)resumes++;};
  G.cancelAnimationFrame=function(id){if(id===17)cancels++;};
  G.stopCastingStudio('cancel requested');G.stopCastingStudio('cancel repeated');
  check('profile cancellation resolves pending frame exactly once',cancelled.stopped&&resumes===1&&cancels===1&&cancelled.resume===null&&cancelled.raf===0);
  check('async profile cancellation leaves cleanup to its owner',G._castingStudio===cancelled&&!G.running);
  cancelled.profile=false;G.castingStudioRestore(cancelled);G.cancelAnimationFrame=oldCancel;
  check('profile cleanup restores canvas and prior simulation once',G._castingStudio===null&&G.running&&G.canvas.width===cancelled.width&&G.canvas.height===cancelled.height);
  var yielding=G.startCastingStudio();yielding.profile=true;G.castingStudioYieldToControls();
  G.running=false;yielding.profile=false;G.castingStudioRestore(yielding);
  check('late profile cleanup cannot override an ordinary Stop action',G._castingStudio===null&&!G.running);
  var oldInit=G.initMinimap;G.initMinimap=function(){G.minimapCanvas={temporary:true};throw Error('deliberate setup failure');};
  caught=false;try{G.startCastingStudio();}catch(e){caught=e.message==='deliberate setup failure';}
  G.initMinimap=oldInit;
  check('preparation failure restores minimap and never claims simulation',caught&&G.minimapCanvas===baseline.minimap&&G._castingStudio===null&&!G.running&&Date.now===oldDate);
  var next=G.startCastingStudio(), replacement={test:'new-world'};
  G.floorMesh=replacement;G.running=false;
  G.stopCastingStudio('world replaced');
  check('late cleanup never resumes or overwrites a replacement world',G.floorMesh===replacement&&!G.running&&G._castingStudio===null);
  G.floorMesh=next.mesh;
  var oldGrid=G.grid;G.grid=new Uint8Array(G.grid.length);G.grid.fill(1);var rejected=false;
  try{G.startCastingStudio();}catch(e){rejected=e.message.indexOf('no clear practice lane')>=0;}
  check('blocked lane refuses demonstration rather than fabricating a hit',rejected&&G._castingStudio===null&&!G.running);
  G.grid=oldGrid;
  var oldRecorder=G.MediaRecorder,oldCapture=G.canvas.captureStream,tracksStopped=0,recorderStopped=0,captures=0;
  function FakeRecorder(){this.state='inactive';}
  FakeRecorder.isTypeSupported=function(type){return type==='video/webm;codecs=vp9';};
  FakeRecorder.prototype.start=function(){this.state='recording';};
  FakeRecorder.prototype.stop=function(){this.state='inactive';recorderStopped++;if(this.onstop)this.onstop();};
  G.MediaRecorder=FakeRecorder;
  G.canvas.captureStream=function(fps){captures++;check('video capture requests 30 fps without changing canvas size',fps===30&&this.width===360&&this.height===240);return{getTracks:function(){return[{stop:function(){tracksStopped++;}}];}};};
  G.recordCastingStudioCycle();var recordingJob=G._castingStudio,recording=recordingJob.recording;
  check('recording uses current appearance and light in export filename',recording.filename==='casting-original-dusk-360x240.webm'&&recording.recorder.state==='recording');
  G.recordCastingStudioCycle();
  check('recording cannot start a competing recorder',captures===1);
  G.stopCastingStudio('cancel partial capture');
  check('cancelled capture stops recorder and video track before restoration',recording.discard&&tracksStopped===1&&recorderStopped===1&&G._castingStudio===null);
  var exclusive=G.startCastingStudio();exclusive.profile=true;G.recordCastingStudioCycle();
  check('profile and video recording are mutually exclusive',captures===1&&!exclusive.recording);
  exclusive.profile=false;G.stopCastingStudio();
  G.MediaRecorder=undefined;var previousStudio=G._castingStudio;G.recordCastingStudioCycle();
  check('unsupported recorder does not start or change simulation',G._castingStudio===previousStudio&&captures===1);
  G.MediaRecorder=oldRecorder;G.canvas.captureStream=oldCapture;
  // Spell gallery: synthetic records on a fixed loop must never enter combat,
  // must regenerate identically when scrubbed, and must leave the shipping
  // kill switch and live arrays untouched.
  G.setCastingStudioMode('gallery');
  var galleryBaseline={visuals:G.SPELL_VISUALS_ENABLED,projectiles:G.projectiles,impacts:G.impacts};
  var savedGalleryCast=G.castCurrentSpell,savedGalleryProjectiles=G.updateProjectiles,savedGalleryEffects=G.tickEffects,galleryCombat=0;
  G.castCurrentSpell=G.updateProjectiles=G.tickEffects=function(){galleryCombat++;throw Error('gallery entered combat');};
  var gallery=G.startCastingStudio();
  check('spell gallery uses the practice lane and the redesigned archetypes by default',gallery.mode==='gallery'&&gallery.scene==='bolt:missile'&&gallery.target.distance>=96&&gallery.live.SPELL_VISUALS_ENABLED===true&&gallery.live.CASTING_ART_ENABLED===false&&gallery.live.HAND_RIG_PREVIEW===false&&G.castingStudioCycleMs(gallery)===2400);
  G.castingStudioAdvance(gallery,120);
  check('gallery bolt records are pure functions of loop time without combat',gallery.live.projectiles.length===1&&gallery.live.projectiles[0].spell.id==='missile'&&gallery.galleryPhase==='flight'&&galleryCombat===0);
  var flightX=gallery.live.projectiles[0].x,flightY=gallery.live.projectiles[0].y;
  G.castingStudioAdvance(gallery,900);G.castingStudioAdvance(gallery,120);
  check('scrubbing backwards regenerates the identical bolt pose',gallery.live.projectiles[0].x===flightX&&gallery.live.projectiles[0].y===flightY);
  var galleryErrors=G.__studioErrors.length;
  G.castingStudioDraw(gallery);
  check('gallery frame renders through the real frame loop without stage errors',G.__studioErrors.length===galleryErrors&&G.projectiles===galleryBaseline.projectiles);
  G.setCastingStudioScene('bolt:ice');
  check('scene selection is scoped to the studio job',gallery.scene==='bolt:ice'&&G._castingStudioScene==='bolt:ice'&&gallery.time===0&&gallery.live.projectiles.length===1&&gallery.live.projectiles[0].spell.id==='ice');
  var burstSeen=false;
  for(var galleryT=0;galleryT<=2400&&!burstSeen;galleryT+=20){G.castingStudioAdvance(gallery,galleryT);burstSeen=gallery.galleryPhase==='burst';}
  check('bolt arrival produces one burst record with the scene spell',burstSeen&&gallery.live.projectiles.length===0&&gallery.live.impacts.length===1&&gallery.live.impacts[0].spellId==='ice'&&galleryCombat===0);
  // The HUD names the scene's spell (scoped spells/currentSpellIdx) for the
  // whole loop: the idle fade reads the studio's spell-change time, not the
  // live one (set long ago here), and the studio never writes the live value.
  var liveGallerySpellChange=G.lastSpellChangeMs;G.lastSpellChangeMs=0;
  G.castingStudioAdvance(gallery,120);var galleryStartHud=hudTexts(function(){G.castingStudioDraw(gallery);});
  G.castingStudioAdvance(gallery,2400);var galleryEndHud=hudTexts(function(){G.castingStudioDraw(gallery);});
  var galleryHud={start:hudAlphas(galleryStartHud,G.spells.ice.name),end:hudAlphas(galleryEndHud,G.spells.ice.name),
    missile:hudAlphas(galleryStartHud.concat(galleryEndHud),G.spells.missile.name).length,live:G.lastSpellChangeMs===0};
  if(!(galleryHud.start.length===1&&galleryHud.start[0]===1&&galleryHud.end.length===1&&galleryHud.end[0]===1&&!galleryHud.missile&&galleryHud.live))
    output('DETAIL gallery HUD '+JSON.stringify(galleryHud));
  check('gallery HUD names the scene spell for the whole loop, independent of the live spell-change time',
    galleryHud.start.length===1&&galleryHud.start[0]===1&&galleryHud.end.length===1&&galleryHud.end[0]===1&&!galleryHud.missile&&galleryHud.live&&galleryCombat===0);
  G.lastSpellChangeMs=liveGallerySpellChange;
  G.setCastingStudioArt(false);
  check('original spell drawing toggles only the scoped kill switch',gallery.live.SPELL_VISUALS_ENABLED===false&&G.SPELL_VISUALS_ENABLED===galleryBaseline.visuals&&gallery.time===0);
  G.stopCastingStudio('gallery complete');
  check('gallery stop restores live arrays and the shipping kill switch',G._castingStudio===null&&G.SPELL_VISUALS_ENABLED===galleryBaseline.visuals&&G.projectiles===galleryBaseline.projectiles&&G.impacts===galleryBaseline.impacts&&galleryCombat===0);
  G.castCurrentSpell=savedGalleryCast;G.updateProjectiles=savedGalleryProjectiles;G.tickEffects=savedGalleryEffects;
  // Perf HUD (merge fix): studio and cave profile frames are not game frames.
  // On a fixed wall clock T0, five live frames (the loop's ring step, then
  // renderFrame) fill the live stage table; a casting study then draws 13
  // frames with the loop stopped (its practice cast at 600 ms) and the cave
  // profile renders 4 frozen fixture frames. Oracles: the live table, ring
  // slot and per-second stacks are the same objects with the same values
  // after each, and the 5 s breakdown dump keeps its live time; one more live
  // frame is the table's sixth draw() call, its all-time max within the
  // longest live frame timed here, and 6 s later the live dump runs. Positive
  // controls: 13 and 4 frames went through renderFrame, one draw() call a
  // frame in the studio's and the profile's own sinks.
  var perfNow=Date.now,perfT0=perfNow(),perfClock=perfT0,perfLiveMs=[];
  Date.now=function(){return perfClock;};
  var hudCanvas=G.document.getElementById('perfHudCanvas');hudCanvas.width=300;hudCanvas.height=200;hudCanvas.getContext=function(){return G.ctx;};
  function perfLiveFrame(){
    G._perfRingIdx=(G._perfRingIdx+1)%G.PERF_HISTORY_LEN;
    for(var pk in G._perfStageHistory)G._perfStageHistory[pk][G._perfRingIdx]=0;
    var t0=performance.now();G.renderFrame();perfLiveMs.push(performance.now()-t0);
  }
  function perfLiveState(){
    var slot={},sec={};
    Object.keys(G._perfStageHistory).forEach(function(k){slot[k]=G._perfStageHistory[k][G._perfRingIdx];});
    Object.keys(G._perfSecStages).forEach(function(k){sec[k]=G._perfSecStages[k][G._perfSecIdx];});
    return {table:G._perfBreakdown,tableJSON:JSON.stringify(G._perfBreakdown),history:G._perfStageHistory,sec:G._perfSecStages,
      slotJSON:JSON.stringify(slot),secJSON:JSON.stringify(sec),log:G._perfBreakdownLog,max:JSON.stringify(G._hudAllTimeMax)};
  }
  function perfSame(a,b){return a.table===b.table&&a.tableJSON===b.tableJSON&&a.history===b.history&&a.sec===b.sec&&a.slotJSON===b.slotJSON&&a.secJSON===b.secJSON&&a.log===b.log&&a.max===b.max;}
  // The fixture draw cancels (replaces) the pending cast queue; later checks compare the live queue's identity.
  var perfRunning=G.running,perfPending=G.pendingMissileCasts,perfFixtures=G.document.getElementById('ctVisibilityFixtures'),perfFixturesChecked=perfFixtures.checked;
  try{
    // The game is running, so closing the studio resumes the loop rather than drawing a live frame.
    G.running=true;G._perfBreakdown={};G._hudAllTimeMax={};G._perfBreakdownLog=perfT0-1000;G._hudBreakdownFlush=0;
    for(var pf=0;pf<5;pf++)perfLiveFrame();
    var perfBefore=perfLiveState(),perfSerial=G._perfFrameSerial,perfStudioDraws=[];
    G.setCastingStudioMode('casting');var perfJob=G.startCastingStudio();
    for(var pt=0;pt<=2400;pt+=200){G.castingStudioAdvance(perfJob,pt);perfStudioDraws.push(G.castingStudioDraw(perfJob).stages['draw()']);}
    var perfStudioSink=perfJob.live._perfBreakdown&&perfJob.live._perfBreakdown['draw()'],perfStudioSerials=G._perfFrameSerial-perfSerial;
    G.stopCastingStudio('perf check complete');
    var perfAfterStudio=perfLiveState(),perfStudio={same:perfSame(perfBefore,perfAfterStudio),log:G._perfBreakdownLog,draws:perfStudioDraws.length,
      serials:perfStudioSerials,sinkCount:perfStudioSink?perfStudioSink.count:null,hit:perfJob.hitAt!==null,liveDraw:G._perfBreakdown['draw()']};
    if(!(perfStudio.same&&perfStudio.draws===13&&perfStudio.serials===13&&perfStudio.sinkCount===13&&perfStudio.hit))output('DETAIL studio perf '+JSON.stringify(perfStudio));
    check('casting-study frames (the loop stopped) never reach the live Perf HUD: its stage table, ring slot and per-second stacks are unchanged and the breakdown dump keeps its live time',
      perfStudio.same&&perfStudio.draws===13&&perfStudio.serials===13&&perfStudio.sinkCount===13&&perfStudio.hit&&
      perfStudioDraws.every(function(ms){return ms>0;}));
    perfFixtures.checked=true;
    var perfProfile={frozenTime:2000000000000,randomSeed:1234567,renderMs:[],stages:{}},perfProfileSerial=G._perfFrameSerial;
    for(var pp=0;pp<4;pp++)G.caveProfileRender(perfProfile,true);
    var perfAfterProfile=perfLiveState(),perfProf={same:perfSame(perfBefore,perfAfterProfile),log:G._perfBreakdownLog,serials:G._perfFrameSerial-perfProfileSerial,
      samples:(perfProfile.stages['draw()']||[]).length,sinkCount:perfProfile.perf&&perfProfile.perf.breakdown['draw()']?perfProfile.perf.breakdown['draw()'].count:null};
    if(!(perfProf.same&&perfProf.serials===4&&perfProf.samples===4&&perfProf.sinkCount===4))output('DETAIL profile perf '+JSON.stringify(perfProf));
    check('cave profile frames (frozen clock) never reach the live Perf HUD: its stage table, ring slot and per-second stacks are unchanged and the breakdown dump keeps its live time',
      perfProf.same&&perfProf.serials===4&&perfProf.samples===4&&perfProf.sinkCount===4);
    perfFixtures.checked=perfFixturesChecked;G.running=perfRunning;
    perfLiveFrame();G._hudBreakdownFlush=0;G.drawPerfHud();
    var perfDraw=G._perfBreakdown['draw()'],perfTable=G._perfBreakdown,perfLiveMax=Math.max.apply(null,perfLiveMs);
    var perfLive={count:perfDraw?perfDraw.count:null,max:perfDraw?perfDraw.max:null,allTimeMax:G._hudAllTimeMax['draw()'],liveMax:perfLiveMax};
    perfClock=perfT0+6000;perfLiveFrame();
    perfLive.dumped=G._perfBreakdownLog===perfT0+6000&&G._perfBreakdown!==perfTable;perfLive.log=G._perfBreakdownLog;
    if(!(perfLive.count===6&&perfLive.allTimeMax===perfLive.max&&perfLive.max<=perfLiveMax&&perfLive.dumped))output('DETAIL live perf '+JSON.stringify(perfLive));
    check('after the studio and the profile the live Perf HUD counts only live frames (6 draw() calls, all-time max within the longest live frame) and its 5 s breakdown dump still runs on the live clock',
      perfLive.count===6&&perfLive.allTimeMax===perfLive.max&&perfLive.max<=perfLiveMax&&perfLive.dumped);
  }finally{Date.now=perfNow;perfFixtures.checked=perfFixturesChecked;G.running=perfRunning;G.pendingMissileCasts=perfPending;if(G._castingStudio)G.stopCastingStudio('perf check cleanup');}
  G.setCastingStudioMode('hand');
  var rigBaseline={preview:G.HAND_RIG_PREVIEW,time:G.HAND_RIG_TIME_MS,yaw:G.HAND_RIG_VIEW_YAW,grip:G.HAND_RIG_GRIP,style:G.HAND_RIG_STYLE};
  var savedCast=G.castCurrentSpell,savedProjectiles=G.updateProjectiles,savedEffects=G.tickEffects,combatCalls=0;
  G.castCurrentSpell=G.updateProjectiles=G.tickEffects=function(){combatCalls++;throw Error('anatomy study entered combat');};
  var hand=G.startCastingStudio();
  check('hand study requires no target or firing lane',hand.mode==='hand'&&hand.target===null&&hand.live.enemies.length===0&&G.castingStudioCycleMs(hand)===2800);
  check('default hand study is paused in handle grip with synchronized selector',!hand.playing&&hand.time===0&&hand.grip==='handle'&&hand.live.HAND_RIG_GRIP==='handle'&&G.document.getElementById('castingStudioGrip').value==='handle');
  check('rig state is isolated and rejected cutout stays disabled',hand.live.HAND_RIG_PREVIEW===true&&hand.live.CASTING_ART_ENABLED===false&&G.HAND_RIG_PREVIEW===rigBaseline.preview);
  G.setCastingStudioHandGrip('reach');
  G.scrubCastingStudio(780);
  check('explicit reach gather scrubs exact anatomy timeline without casting',hand.grip==='reach'&&hand.time===780&&hand.live.HAND_RIG_TIME_MS===780&&G.handStudioPhase(hand.time)==='Gather'&&combatCalls===0);
  check('gather scrubbing synchronizes range and named pose immediately',G.document.getElementById('castingStudioTime').value==='780'&&G.document.getElementById('castingStudioPhase').value==='780');
  var panel=G.document.getElementById('castingStudioPanel'),oldContains=panel.contains;
  panel.contains=function(node){return !!(node&&node.studioControl);};
  function event(type,target){return{type:type,target:target,cancelable:true,prevented:0,stopped:0,
    preventDefault:function(){this.prevented++;},stopImmediatePropagation:function(){this.stopped++;}};}
  var focus=event('click',G.canvas);hand.fullscreenPending=true;
  G.castingStudioControlEvent(focus);
  check('canvas focus during pending inspection never cancels studio',G._castingStudio===hand&&!hand.stopped&&hand.time===780);
  var press=event('pointerdown',G.canvas);G.castingStudioCanvasInput(press);
  check('canvas pointer press is consumed before gameplay handlers',press.prevented===1&&press.stopped===1&&hand.canvasPointerActive);
  var release=event('pointerup',{tagName:'BODY'});G.castingStudioCanvasInput(release);
  check('pointer release outside canvas is consumed and clears capture',release.prevented===1&&release.stopped===1&&!hand.canvasPointerActive);
  var click=event('click',G.canvas),doubleClick=event('dblclick',G.canvas);
  G.castingStudioCanvasInput(click);G.castingStudioCanvasInput(doubleClick);
  check('canvas clicks cannot reach game cast or fullscreen toggles',click.stopped===1&&doubleClick.stopped===1&&G._castingStudio===hand&&!hand.stopped&&combatCalls===0);
  var poseControl={tagName:'SELECT',id:'castingStudioPhase',studioControl:true};
  var poseLabel={tagName:'LABEL',control:poseControl,studioControl:true};
  G.castingStudioControlEvent(event('click',poseLabel));G.castingStudioControlEvent(event('change',poseControl));
  check('internal label and select event sequence preserves pending inspection',G._castingStudio===hand&&!hand.stopped&&hand.fullscreenPending&&hand.time===780);
  hand.fullscreenPending=false;
  var oldYield=G.castingStudioYieldToControls,yields=0;G.castingStudioYieldToControls=function(){yields++;};
  G.castingStudioControlEvent(event('click',{tagName:'BODY'}));
  G.castingStudioControlEvent(event('click',{tagName:'LABEL',control:null}));
  check('background and unrelated label clicks do not count as game controls',yields===0);
  var gameButton={tagName:'BUTTON',id:'btnStop'},gameText={tagName:'SPAN',parentElement:gameButton};
  G.castingStudioControlEvent(event('click',gameText));
  check('actual game button descendants still yield to their control',yields===1&&G.castingStudioControlTarget(gameText)===gameButton);
  G.castingStudioYieldToControls=oldYield;panel.contains=oldContains;
  G.scrubCastingStudio(1220);
  check('release pose retains empty projectiles and unchanged mana',hand.live.projectiles.length===0&&hand.live.pendingMissileCasts.length===0&&hand.live.mana===G.MANA_MAX&&G.handStudioPhase(hand.time)==='Release');
  G.setCastingStudioHandView(Math.PI);
  check('back inspection changes only the owned hand yaw',hand.live.HAND_RIG_VIEW_YAW===Math.PI&&G.HAND_RIG_VIEW_YAW===rigBaseline.yaw&&G.HAND_RIG_TIME_MS===rigBaseline.time);
  G.setCastingStudioHandView('palm');
  var palmScope=false;G.castingStudioScoped(hand,function(){palmScope=G.HAND_RIG_VIEW_YAW==='palm';});
  check('palm study preserves its scoped sentinel and restores player yaw without resizing',palmScope&&hand.yaw==='palm'&&hand.live.HAND_RIG_VIEW_YAW==='palm'&&G.HAND_RIG_VIEW_YAW===rigBaseline.yaw&&G.canvas.width===360&&G.canvas.height===240&&combatCalls===0);
  var restingEquipment=hand.live.equipment;
  hand.playing=true;G.setCastingStudioHandGrip('handle');
  check('handle grip selection stops the flourish and returns to rest',!hand.playing&&hand.time===0&&hand.live.HAND_RIG_GRIP==='handle'&&G.document.getElementById('castingStudioTime').value==='0');
  G.setCastingStudioHandGrip('cradle');
  check('cradle is scoped shape data, not an equipped item',hand.live.HAND_RIG_GRIP==='cradle'&&hand.live.equipment===restingEquipment&&G.equipment===baseline.equipment&&G.HAND_RIG_GRIP===rigBaseline.grip);
  G.setCastingStudioHandGrip('staff');
  check('staff casting rig is a selectable preview, not an equipped item',hand.grip==='staff'&&hand.live.HAND_RIG_GRIP==='staff'&&!hand.playing&&hand.time===0&&
    hand.live.equipment===restingEquipment&&G.equipment===baseline.equipment&&G.HAND_RIG_GRIP===rigBaseline.grip&&
    G.document.getElementById('castingStudioGrip').value==='staff'&&/staff casting rig/.test(G.castingStudioDescribe(hand)));
  G.setCastingStudioHandGrip('invalid');
  check('invalid resting template safely falls back to handle',hand.grip==='handle'&&hand.live.HAND_RIG_GRIP==='handle'&&G.document.getElementById('castingStudioGrip').value==='handle');
  G.setCastingStudioHandGrip('reach');
  G.setCastingStudioArt(false);
  check('original hand baseline never enables rejected flat study',!hand.live.HAND_RIG_PREVIEW&&!hand.live.CASTING_ART_ENABLED&&G.document.getElementById('castingStudioTime').value==='0');
  hand.playing=true;G.setCastingStudioArt(true);
  check('selecting articulated hand never auto-plays the casting flourish',!hand.playing&&hand.time===0&&combatCalls===0);
  var oldRaf=G.requestAnimationFrame,frames=[];
  G.requestAnimationFrame=function(fn){frames.push(fn);return frames.length;};
  G.playCastingStudio();frames.shift()(0);frames.shift()(40);
  check('hand playback advances at quarter wall-clock speed',Math.abs(hand.time-10)<0.000001&&combatCalls===0);
  G.pauseCastingStudio();frames=[];
  G.MediaRecorder=FakeRecorder;
  G.canvas.captureStream=function(){return{getTracks:function(){return[{stop:function(){tracksStopped++;}}];}};};
  G.recordCastingStudioCycle();var handRecording=hand.recording;
  check('hand recording includes selected style and independent resting template',handRecording.visualStudy&&handRecording.filename==='hand-motion-articulated-arcane-reach-dusk-360x240.webm');
  hand.time=2799;frames.shift()(0);frames.shift()(40);
  check('anatomy recording completes with no fabricated cast or hit',!hand.recording&&!handRecording.discard&&!hand.playing&&hand.hitAt===null&&combatCalls===0);
  G.requestAnimationFrame=oldRaf;G.MediaRecorder=oldRecorder;G.canvas.captureStream=oldCapture;
  hand.inspectionFullscreen=true;G.castingStudioFullscreenChanged();
  check('leaving inspection restores real rig state even after palm study',G._castingStudio===null&&G.HAND_RIG_PREVIEW===rigBaseline.preview&&G.HAND_RIG_TIME_MS===rigBaseline.time&&G.HAND_RIG_VIEW_YAW===rigBaseline.yaw&&G.HAND_RIG_GRIP===rigBaseline.grip&&G.HAND_RIG_STYLE===rigBaseline.style);
  G.setCastingStudioArt(true);
  check('opening articulated preview draws a resting hand without starting animation',G._castingStudio!==null&&!G._castingStudio.playing&&G._castingStudio.time===0&&G._castingStudio.live.HAND_RIG_GRIP==='reach');
  G.stopCastingStudio('resting proof complete');
  var preferenceBefore=G.getSelectedCastingStyle(),pendingBefore=G.pendingSettings;
  G.pendingSettings=Object.assign({},G.settings);
  var oldStudioDraw=G.castingStudioDraw,styleDraws=0,styleEvents=0;
  G.castingStudioDraw=function(value){styleDraws++;return oldStudioDraw(value);};
  var removeStyleObserver=G.onCastingStyleChange(function(){styleEvents++;});
  G.setCastingStudioStyle('finger_guns');
  var styled=G._castingStudio;
  check('selecting Finger Guns opens a paused ready proof with one draw',styled&&styled.style==='finger_guns'&&styled.time===0&&!styled.playing&&styleDraws===1&&styleEvents===1);
  check('style choice is present in scoped rig and synchronized control',styled.live.HAND_RIG_STYLE==='finger_guns'&&styled.live.settings.castingStyle==='finger_guns'&&G.document.getElementById('castingStudioStyle').value==='finger_guns');
  check('deliberate preference survives drawing while temporary rig style is restored',G.getSelectedCastingStyle()==='finger_guns'&&G.settings===baseline.settings&&G.settings.castingStyle==='finger_guns'&&G.pendingSettings.castingStyle==='finger_guns'&&G.HAND_RIG_STYLE===rigBaseline.style);
  G.setCastingStudioHandGrip('handle');G.scrubCastingStudio(1220);styled.playing=true;
  var styledEquipment=styled.live.equipment;
  G.setCastingStudioStyle('arcane');
  check('changing style pauses at ready but preserves independent handle contract',styled.style==='arcane'&&styled.time===0&&!styled.playing&&styled.grip==='handle'&&styled.live.HAND_RIG_GRIP==='handle'&&styled.live.equipment===styledEquipment&&combatCalls===0);
  check('style selection never changes actual equipment spell or combat state',G.equipment===baseline.equipment&&G.spells===baseline.spells&&G.stats===baseline.stats&&G.pendingMissileCasts===baseline.pending&&G.mana===baseline.mana);
  G.scrubCastingStudio(780);styled.playing=true;
  var externalDraws=styleDraws;
  G.setSelectedCastingStyle('finger_guns');
  check('external player style change refreshes active proof exactly once at rest',G._castingStudio===styled&&styled.style==='finger_guns'&&styled.live.HAND_RIG_STYLE==='finger_guns'&&styled.time===0&&!styled.playing&&styleDraws===externalDraws+1);
  var beforeUnchangedEvents=styleEvents;G.setSelectedCastingStyle('finger_guns');
  check('unchanged external preference cannot recursively restart the proof',styleEvents===beforeUnchangedEvents&&styleDraws===externalDraws+1);
  G.stopCastingStudio('style proof complete');
  check('closing studio preserves chosen preference but restores all real rig state',G._castingStudio===null&&G.getSelectedCastingStyle()==='finger_guns'&&G.HAND_RIG_STYLE===rigBaseline.style&&G.HAND_RIG_GRIP===rigBaseline.grip&&G.HAND_RIG_PREVIEW===rigBaseline.preview);
  var resumedStyle=G.startCastingStudio();
  check('new proof starts with saved style and independent resting template',resumedStyle.style==='finger_guns'&&resumedStyle.live.HAND_RIG_STYLE==='finger_guns'&&resumedStyle.grip==='handle'&&!resumedStyle.playing);
  G.stopCastingStudio('style reopen complete');
  var inactiveRunning=G.running,inactiveDraws=styleDraws;
  G.setSelectedCastingStyle('arcane');
  check('external style selection without a proof updates control without opening one',G._castingStudio===null&&G.running===inactiveRunning&&styleDraws===inactiveDraws&&G.document.getElementById('castingStudioStyle').value==='arcane');
  G.setCastingStudioStyle('missing-style');
  check('invalid studio style safely uses the registry default without entering combat',G._castingStudio.style==='arcane'&&G.getSelectedCastingStyle()==='arcane'&&combatCalls===0);
  G.stopCastingStudio('invalid style proof complete');removeStyleObserver();
  var pagehide=G.__studioWindowEvents.pagehide.filter(function(listener){return listener.toString().indexOf('castingStudioRevokeVideo')>=0;})[0];
  if(!pagehide)throw Error('shipping studio pagehide listener missing');
  var cachedStyleSubscription=G._castingStudioStyleUnsubscribe,oldRevoke=G.castingStudioRevokeVideo,revokes=0;
  G.castingStudioRevokeVideo=function(){revokes++;};G.startCastingStudio();
  pagehide({persisted:true});
  check('cached pagehide stops preview and releases video without dropping style subscription',G._castingStudio===null&&revokes===1&&G._castingStudioStyleUnsubscribe===cachedStyleSubscription);
  G.setSelectedCastingStyle('finger_guns');var cachedProof=G.startCastingStudio();G.setSelectedCastingStyle('arcane');
  check('cached page return keeps player and studio style choices synchronized',cachedProof.style==='arcane'&&cachedProof.live.HAND_RIG_STYLE==='arcane'&&G.document.getElementById('castingStudioStyle').value==='arcane');
  pagehide({persisted:false});
  check('real page unload releases preview video and style listener exactly once',G._castingStudio===null&&revokes===2&&G._castingStudioStyleUnsubscribe===null);
  G.castingStudioRevokeVideo=oldRevoke;
  G.castingStudioDraw=oldStudioDraw;G.setSelectedCastingStyle(preferenceBefore);G.pendingSettings=pendingBefore;
  G.castCurrentSpell=savedCast;G.updateProjectiles=savedProjectiles;G.tickEffects=savedEffects;
  // Runtime isolation (spec 2.3) hides engine failures from gameplay; the
  // harness must not let it hide them from the test.
  var fxFailures=G.getEffectStats().failures,fxFailed=Object.keys(fxFailures).filter(function(k){return fxFailures[k];});
  if(fxFailed.length)output('DETAIL effect failures '+JSON.stringify(fxFailures));
  check('no effect runtime failures were counted in the studio or the live game',!fxFailed.length);
  output('CASTING_STUDIO_RESULT PASS '+checked);
}());
undefined;
