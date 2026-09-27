// Profiling correctness with a controlled clock, NOT a performance benchmark.
// The production ring/report and gameUpdate instrumentation are the subjects;
// deterministic stage stand-ins give independent, exactly known durations.
(function () {
  var G=(0,eval)('this'), checked=0, failed=0, clock=1000, clockReads=0;
  G.performance={now:function(){clockReads++;return clock;}};
  var source=slurp('assets/games/src/06-spatial-motion.js');
  function mutate(flag,before,after) {
    if(__argv.indexOf(flag)<0)return;
    if(source.split(before).length!==2)throw new Error('MUTATION_ANCHOR '+flag);
    source=source.replace(before,after);
  }
  mutate('--time-when-disabled',
    'return physicsProfileEnabled?performance.now():0;', 'return performance.now();');
  mutate('--record-when-disabled', 'if (!physicsProfileEnabled) return;',
    '/* mutation: recording is no longer opt-in */');
  mutate('--broken-ring-wrap', 'samples.count++%4096', 'samples.count++%8192');
  (0,eval)(source);
  source=slurp('assets/games/src/17-input-lighting-update.js');
  mutate('--misattribute-player-stage', "physicsStageEnd('playerStep',stageStart);",
    "physicsStageEnd('separation',stageStart);");
  (0,eval)(source);

  function check(name,okay,detail) {
    checked++;if(!okay)failed++;
    __out((okay?'PASS ':'FAIL ')+name+(okay?'':' '+JSON.stringify(detail)));
  }
  function reset(enabled) {
    G.physicsProfileEnabled=enabled;G.physicsStageSamples={};clockReads=0;
  }
  function sample(name,duration) {
    var start=G.physicsStageStart();clock+=duration;G.physicsStageEnd(name,start);
  }
  reset(false);
  for(var i=0;i<200;i++)sample('disabled',10);
  check('disabled_profiling_reads_no_clock',clockReads===0,{reads:clockReads});
  check('disabled_profiling_allocates_no_stage_buffers',Object.keys(G.physicsStageSamples).length===0,
    Object.keys(G.physicsStageSamples));
  check('disabled_empty_report_has_no_fabricated_measurements',Object.keys(G.physicsProfileReport()).length===0);

  reset(true);sample('probe',8);sample('probe',2);sample('probe',5);
  var before=Array.prototype.slice.call(G.physicsStageSamples.probe.values,0,3);
  var report=G.physicsProfileReport(), row=report.probe;
  check('enabled_stage_records_elapsed_time_not_clock_timestamp',row.samples===3&&row.totalCalls===3&&
    row.p50Ms===5&&row.p95Ms===8&&row.p99Ms===8&&row.maxMs===8,row);
  check('report_does_not_sort_live_ring_in_place',JSON.stringify(before)===JSON.stringify(
    Array.prototype.slice.call(G.physicsStageSamples.probe.values,0,3)),before);
  report.probe.p50Ms=-1;
  check('report_is_detached_from_subsequent_reports',G.physicsProfileReport().probe.p50Ms===5);
  var readsBefore=clockReads;G.physicsProfileEnabled=false;sample('probe',500);
  check('disabling_profile_preserves_existing_samples_without_timing',clockReads===readsBefore&&
    G.physicsProfileReport().probe.totalCalls===3,{reads:clockReads,row:G.physicsProfileReport().probe});
  G.physicsProfileEnabled=true;sample('probe',1);
  row=G.physicsProfileReport().probe;
  check('re_enabling_profile_resumes_without_disabled_gap_sample',row.samples===4&&row.maxMs===8&&row.p50Ms===2,row);

  // Fill the entire ring, then overwrite 100 slots with deliberately different
  // durations. The final 4096 samples contain 3996 ones and 100 nineties.
  reset(true);
  for(i=0;i<4096;i++)sample('ring',1);
  var buffer=G.physicsStageSamples.ring.values;
  for(i=0;i<100;i++)sample('ring',90);
  row=G.physicsProfileReport().ring;
  check('ring_fixture_exercises_capacity_and_wraparound',G.physicsStageSamples.ring.count===4196&&
    buffer.length===4096,{count:G.physicsStageSamples.ring.count,capacity:buffer.length});
  check('wrapped_ring_keeps_latest_outlier_samples',row.samples===4096&&row.totalCalls===4196&&
    row.p50Ms===1&&row.p95Ms===1&&row.p99Ms===90&&row.maxMs===90,row);
  for(i=0;i<4096;i++)sample('ring',2);
  row=G.physicsProfileReport().ring;
  check('full_ring_turnover_evicts_old_outliers',row.samples===4096&&row.totalCalls===8292&&
    row.p50Ms===2&&row.p95Ms===2&&row.p99Ms===2&&row.maxMs===2,row);
  check('ring_storage_remains_same_fixed_allocation',G.physicsStageSamples.ring.values===buffer&&
    buffer.length===4096&&buffer.byteLength===32768);

  // Test the real integration ordering. These stand-ins do not claim to test
  // gameplay or speed; each advances a known number of clock units so an
  // omitted/wrongly scoped timer is observable independently of its own report.
  var stages=[['npcNavigationTick',18],['updateDayNight',50],['updateViewCamera',50],['updateEnemies',1],
    ['separateEnemies',2],['updateProjectiles',3],['updateGuardTower',7],
    ['updateGroundEffects',8],['tickEffects',9],['step',4],['updateTreasureChests',10],
    ['updateEnemySpawners',11],['updateArenaChallenge',12],['updateArcaneTomes',13],
    ['updateStatPickups',14],['updateCompanions',5],['updateFortressAllies',6],
    ['updateMapRevealAnim',15],['updateAmbientParticles',16],['updateExplored',17]], trace=[];
  stages.forEach(function(stage){G[stage[0]]=function(){trace.push(stage[0]);clock+=stage[1];};});
  reset(true);G.overviewActive=false;G.CAM_FOLLOW=false;G.spatialSimulationTick=100;G.gameUpdate(1/60);
  report=G.physicsProfileReport();
  check('game_update_profiles_actual_named_stages',report.enemyAIAndMotion&&report.enemyAIAndMotion.p50Ms===1&&
    report.separation&&report.separation.p50Ms===2&&report.projectileCCD&&report.projectileCCD.p50Ms===3&&
    report.playerStep&&report.playerStep.p50Ms===4&&report.followers&&report.followers.p50Ms===11,report);
  check('simulation_span_measures_elapsed_span_not_sum_of_selected_stages',report.simulationSpan&&
    report.simulationSpan.p50Ms===105&&report.simulationSpan.samples===1,report.simulationSpan);
  check('profiled_update_runs_every_system_once',trace.length===20&&trace.join(',')===stages.map(function(s){return s[0];}).join(',')&&
    G.spatialSimulationTick===101,{trace:trace,tick:G.spatialSimulationTick});
  var enabledTrace=trace.join(',');trace=[];reset(false);G.gameUpdate(1/60);
  check('disabled_update_preserves_simulation_order_without_timer_calls',trace.join(',')===enabledTrace&&
    G.spatialSimulationTick===102&&clockReads===0&&Object.keys(G.physicsStageSamples).length===0,
    {trace:trace,tick:G.spatialSimulationTick,reads:clockReads});
  reset(true);trace=[];G.overviewActive=true;G.gameUpdate(1/60);
  check('overview_pause_advances_neither_simulation_nor_profiling',trace.length===0&&G.spatialSimulationTick===102&&
    clockReads===0&&Object.keys(G.physicsStageSamples).length===0,{trace:trace,tick:G.spatialSimulationTick,reads:clockReads});
  G.overviewActive=false;G.gameUpdate(1/60);
  check('resume_records_one_new_simulation_sample',G.spatialSimulationTick===103&&
    G.physicsProfileReport().simulationSpan.samples===1);
  check('fixture_reaches_final_independent_control',trace.length===20&&trace[19]==='updateExplored');
  __out('PHYSICS_PROFILE_RESULT '+(failed?'FAIL '+failed+'/':'PASS ')+checked);
})();
