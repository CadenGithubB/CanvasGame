// Analytic actor-motion contracts. Only production geometry and controller code
// decides collisions; fixtures author independent coordinates and heights.
(function () {
  (0, eval)(slurp('assets/games/src/02-simulation-clock.js'));
  var G = (0, eval)('this'), checked = 0, failures = 0;
  G.floorMesh = G.grid = G.wallHeights = G.wallFaceBase = G.wallMaxTopZ = null;
  G.ENDLESS_MODE = true; G.windowOriginX = G.windowOriginY = 0;
  G.cell = 15; G.gridW = G.gridH = 16; G.worldW = G.worldH = 240;
  G.terrain = 'plains'; G.deepCaveRegions = [];
  G.pos = {x: 30, y: 66, floorZ: 60};
  G._cacheStats = {floorH: {hits: 0, misses: 0, size: 0}};
  ['06-floor-queries.js', '06-spatial-geometry.js', '06-spatial-queries.js'].forEach(function (path) {
    (0, eval)(slurp('assets/games/src/' + path));
  });
  var source = slurp('assets/games/src/06-spatial-motion.js');
  function mutate(flag, before, after) {
    if (__argv.indexOf(flag) < 0) return;
    if (source.split(before).length !== 2) throw new Error('MUTATION_ANCHOR ' + flag);
    source = source.replace(before, after);
  }
  // Mutation anchors are deliberately source-exact. Stale probes must fail
  // loudly rather than silently ceasing to exercise the historical defect.
  mutate('--single-endpoint',
    'var steps=Math.min(needed,SPATIAL_MOVE_MAX_STEPS), sx=dx/needed, sy=dy/needed;',
    'var steps=1, sx=dx, sy=dy;');
  mutate('--freeze-support-height',
    "if (!body.airborne && body.updateFeet!==false && support.status==='walk') body.feetZ=support.feetZ;",
    '/* mutation: support changes no longer update actor feet */');
  mutate('--omit-body-headroom', 'bodyH:height/25', 'bodyH:0');
  mutate('--repeat-support-cell', 'if (sampledCells.indexOf(ci)>=0) continue;',
    '/* mutation: repeat identical support queries for every footprint point */');
  mutate('--omit-wall-height',
    'if (body.feetZ<top-1e-6 && body.feetZ+height>span.baseZ+1e-6) return true;',
    'if (true) return true;');
  (0, eval)(source);
  source=slurp('assets/games/src/17-input-lighting-update.js');
  mutate('--cross-storey-separation', 'if (!spatialBodiesOverlapHeight(a,b)) return;',
    '/* mutation: separation ignores vertical overlap */');
  mutate('--coincident-separation', 'if (dist < 0.01) {dx=1;dy=0;dist=1;}',
    'if (dist < 0.01) return;');
  (0, eval)(source);
  source=slurp('assets/games/src/09-physics.js');
  mutate('--player-bypass-controller',
    'var movement=spatialMoveBody(movementBody,vel.x*dt,vel.y*dt);',
    'movementBody.x+=vel.x*dt; movementBody.y+=vel.y*dt; var movement={hitX:false,hitY:false};');
  (0, eval)(source);
  (0, eval)(slurp('assets/games/src/10-npc-controller.js'));
  (0, eval)(slurp('assets/games/src/10-npc-navigation.js'));
  source=slurp('assets/games/src/11-enemies.js');
  mutate('--patrol-bypass-controller',
    'if (npcNavigateToward(e,wp.x,wp.y,wpFeet,e.speed*.38,dt===undefined?.08:dt,eRad*.6,0)) return 1;',
    'e.x+=wpDx/wpDist*e.speed*.38*(dt===undefined?.08:dt); e.y+=wpDy/wpDist*e.speed*.38*(dt===undefined?.08:dt); return 1;');
  (0, eval)(source);

  function check(id, okay, detail) {
    checked++; if (!okay) failures++;
    __out((okay ? 'PASS ' : 'FAIL ') + id + (okay ? '' : ' ' + JSON.stringify(detail)));
  }
  function close(a, b) { return Number.isFinite(a) && Math.abs(a - b) < 1e-6; }
  function mesh(layers, width) {
    var w = width || 21, h = w;
    var m = {w:w, h:h, gridSize:12, layerCount:new Uint8Array(w*h),
      surfaceH:new Float64Array(w*h), ceilAboveMask:new Uint8Array(w*h)};
    m.layerCount.fill(layers.length);
    for (var k = 0; k < 5; k++) {
      var layer = layers[k];
      m['l'+k+'Type'] = new Uint8Array(w*h);
      m['l'+k+'TopZ'] = new Float64Array(w*h);
      m['l'+k+'Meta'] = new Uint8Array(w*h);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var i = y*w+x, height = layer && (typeof layer[1] === 'function' ? layer[1](x,y) : layer[1]);
        m['l'+k+'Type'][i] = layer ? layer[0] : 0;
        m['l'+k+'TopZ'][i] = height || 0;
        m['l'+k+'Meta'][i] = layer ? layer[2] || 0 : 0;
        if (k === layers.length-1) m.surfaceH[i] = height;
      }
    }
    G.floorMesh = m; G.worldW = G.worldH = (w-1)*12;
    G.gridW = G.gridH = Math.ceil(G.worldW/G.cell);
    G.grid = new Uint8Array(G.gridW*G.gridH);
    G.wallHeights = new Float64Array(G.grid.length); G.wallHeights.fill(1);
    G.wallFaceBase = G.wallMaxTopZ = G.gridCave = null;
    G.ENDLESS_MODE = true; G.windowOriginX = G.windowOriginY = 0;
    return m;
  }
  function body(x,y,z,overrides) {
    var b = {x:x,y:y,feetZ:z,radius:6,height:70,stepHeight:25,
      airborne:false,trackFloor:true,allowFall:false};
    Object.keys(overrides || {}).forEach(function (key) { b[key]=overrides[key]; });
    return b;
  }
  function wall(x,y) { G.grid[y*G.gridW+x]=1; }
  function wallColumn(x) { for (var y=0;y<G.gridH;y++) wall(x,y); }
  function move(b,dx,dy,work) { return G.spatialMoveBody(b,dx,dy,work); }

  var dedupMesh=mesh([[1,0,2],[2,4]]), supportCalls=0, realSupport=G.getWalkableLayerTopAt;
  G.getWalkableLayerTopAt=function(x,y,z,options) {supportCalls++;return realSupport(x,y,z,options);};
  var dedupBody=body(30,66,0,{radius:2}), blocked=G.spatialBodyBlocked(dedupBody,30,66);
  check('one_cell_footprint_performs_one_real_support_query', !blocked && supportCalls===1, supportCalls);
  supportCalls=0; dedupBody.x=36; dedupBody.y=72;
  blocked=G.spatialBodyBlocked(dedupBody,36,72);
  check('grid_corner_footprint_queries_all_four_distinct_cells', !blocked && supportCalls===4, supportCalls);
  // Only the upper-left quadrant has a low roof; the center remains clear.
  dedupMesh.l1TopZ[5*dedupMesh.w+2]=2;
  check('dedup_keeps_neighbor_cell_headroom_obstruction', G.spatialBodyBlocked(dedupBody,36,72));
  dedupMesh.l1TopZ[5*dedupMesh.w+2]=4;
  check('support_dedup_does_not_cache_live_geometry_between_calls', !G.spatialBodyBlocked(dedupBody,36,72));
  G.getWalkableLayerTopAt=realSupport;

  mesh([[1,0,1]]);
  var b=body(30,66,0), result=G.spatialQuerySupport(b,30,66);
  check('flat_support_has_world_height_and_identity', result.status==='walk' && close(result.feetZ,0) &&
    result.ceilingZ===Infinity && typeof result.supportId==='string' && result.supportId.length>0, result);
  result=move(b,24,12);
  check('unobstructed_move_consumes_requested_displacement', close(b.x,54) && close(b.y,78) && close(b.feetZ,0) &&
    !result.hitX && !result.hitY && close(result.remainingX,0) && close(result.remainingY,0), {body:b,result:result});

  // Controller support deliberately retains the authored cell-height policy
  // while rendering interpolates its triangles. Cells x=2 and x=4 are 15 and
  // 30 units high: crossing two cells must change physical support by 15.
  mesh([[1,function(x){return x*0.3;},1]]);
  b=body(30,66,15); result=move(b,24,0);
  check('authored_ramp_cells_raise_support_by_fifteen_units', close(b.x,54) && close(b.feetZ,30), {body:b,result:result});
  result=move(b,-24,0);
  check('descending_same_ramp_returns_to_original_support_cell', close(b.x,30) && close(b.feetZ,15), {body:b,result:result});
  b=body(30,66,15); result=G.spatialQuerySupport(b,30,66);
  check('controller_cell_support_is_explicitly_not_render_interpolation', result.feetZ===15 &&
    close(G.sampleSpatialSupportZ(30,66,15),18.75), result);
  var lowView=body(30,66,15), highView=body(30,66,15);
  G.MODE3D=false; G.cam={z:-900}; G.canvas={width:160,height:120}; move(lowView,24,12);
  G.MODE3D=true; G.cam.z=900; G.canvas={width:3840,height:2160}; move(highView,24,12);
  check('both_views_and_resolutions_produce_identical_motion', JSON.stringify(lowView)===JSON.stringify(highView) &&
    close(lowView.x,54) && lowView.feetZ>15, {low:lowView,high:highView});

  mesh([[1,1,1]]); b=body(30,66,0);
  result=G.spatialQuerySupport(b,36,66);
  check('one_mesh_unit_is_a_legal_twenty_five_unit_step', result.status==='walk' && close(result.feetZ,25), result);
  mesh([[1,1.2,1]]);
  result=G.spatialQuerySupport(b,36,66);
  check('thirty_unit_rise_exceeds_step_height', result.status==='blocked', result);
  mesh([[1,0.4,1]]); b.airborne=true;
  result=G.spatialQuerySupport(b,36,66);
  check('airborne_actor_cannot_ground_step_up_into_terrain', result.status==='blocked', result);

  mesh([[1,0,2],[2,2.5]]); b=body(30,66,0);
  result=G.spatialQuerySupport(b,36,66);
  check('seventy_unit_body_cannot_enter_sixty_two_unit_headroom', result.status==='blocked', result);
  b.height=60; result=G.spatialQuerySupport(b,36,66);
  check('short_body_fits_same_authored_low_passage', result.status==='walk' && close(result.ceilingZ,62.5), result);
  var edge=mesh([[1,0,2],[2,2.5]]);
  for (var ey=0;ey<edge.h;ey++) for (var ex=0;ex<3;ex++) edge.layerCount[ey*edge.w+ex]=1;
  b=body(33,66,0);
  check('headroom_fixture_center_is_open_but_body_reaches_low_roof', G.spatialQuerySupport(b,33,66).status==='walk' &&
    edge.layerCount[5*edge.w+3]===2);
  check('body_edge_cannot_clip_low_roof_despite_open_center', G.spatialBodyBlocked(b,33,66));
  b.radius=2;
  check('narrow_body_clear_of_same_roof_edge_is_not_blocked', !G.spatialBodyBlocked(b,33,66));

  mesh([[1,-5,2],[2,-1],[4,0,3]]);
  b=body(30,66,-125); result=G.spatialQuerySupport(b,36,66);
  check('cave_actor_stays_on_lower_support_under_cap', result.status==='walk' && close(result.feetZ,-125) && close(result.ceilingZ,-25), result);
  b=body(30,66,0); result=G.spatialQuerySupport(b,36,66);
  check('surface_actor_stays_on_cap_above_same_cave', result.status==='walk' && close(result.feetZ,0), result);
  mesh([[1,-5,2],[2,-1]]);
  result=G.spatialQuerySupport(b,36,66);
  check('missing_cap_does_not_teleport_surface_actor_through_roof', result.status==='blocked', result);

  mesh([[1,-3,1]]); b=body(30,66,0);
  result=G.spatialQuerySupport(b,36,66);
  check('deep_ledge_is_reported_as_fall_not_walk', result.status==='fall' && close(result.feetZ,-75), result);
  result=move(b,24,0);
  check('nonfalling_actor_refuses_deep_ledge', close(b.x,30) && close(b.feetZ,0) && result.hitX, {body:b,result:result});
  b=body(30,66,0,{allowFall:true}); result=move(b,24,0);
  check('falling_actor_can_leave_ledge_without_snapping_to_bottom', close(b.x,54) && close(b.feetZ,0), {body:b,result:result});

  mesh([[1,0,1]]); wallColumn(4); b=body(30,66,0);
  check('fast_motion_fixture_crosses_fifteen_unit_solid_wall', b.x<60 && b.x+120>75 && G.grid[4*G.gridW+4]===1);
  result=move(b,120,0);
  check('fast_actor_cannot_tunnel_through_wall', b.x<=54+1e-6 && b.x>=45 && close(b.y,66) && result.hitX,
    {body:b,result:result});
  G.grid.fill(0); b=body(30,66,0); result=move(b,120,0);
  check('same_fast_motion_reaches_target_when_wall_removed', close(b.x,150) && !result.hitX, {body:b,result:result});
  wallColumn(4); b=body(30,40,0); result=move(b,90,60);
  check('diagonal_wall_contact_slides_along_unblocked_axis', b.x<=54+1e-6 && b.x>=45 && close(b.y,100) && result.hitX && !result.hitY,
    {body:b,result:result});
  G.grid.fill(0); wall(4,3); wall(3,4); b=body(40,40,0); result=move(b,40,40);
  check('touching_wall_corner_cannot_be_cut_diagonally', b.x<60 && b.y<60 && (result.hitX || result.hitY), {body:b,result:result});
  G.grid.fill(0); b=body(40,40,0); move(b,40,40);
  check('same_diagonal_is_open_without_corner_walls', close(b.x,80) && close(b.y,80), b);

  mesh([[1,-5,2],[2,-1],[4,0,3]]); wallColumn(4);
  G.wallMaxTopZ=new Float64Array(G.grid.length); G.wallMaxTopZ.fill(-1);
  b=body(30,66,-125); result=move(b,90,0);
  check('cave_wall_blocks_body_in_its_vertical_interval', b.x<=54+1e-6 && result.hitX, {body:b,result:result});
  b=body(30,66,0); result=move(b,90,0);
  check('same_buried_wall_does_not_block_surface_actor', close(b.x,120) && close(b.feetZ,0) && !result.hitX, {body:b,result:result});

  mesh([[1,0,1]]); wallColumn(4); G.wallHeights.fill(0.125);
  b=body(66,66,20,{airborne:true});
  check('body_overlapping_short_wall_height_is_blocked', G.spatialBodyBlocked(b,b.x,b.y), b);
  b.feetZ=31;
  check('airborne_body_above_same_short_wall_is_clear', !G.spatialBodyBlocked(b,b.x,b.y), b);

  mesh([[1,0,1]]); b=body(30,66,0);
  result=G.spatialQuerySupport(b,-1,66);
  check('negative_local_support_is_unloaded_not_floor_zero', result.status==='unloaded', result);
  var m=G.floorMesh; m.layerCount.fill(0);
  result=G.spatialQuerySupport(b,36,66);
  check('empty_geometry_is_unloaded_not_walkable', result.status==='unloaded', result);
  result=move(b,24,0);
  check('movement_into_unloaded_geometry_is_refused', close(b.x,30) && result.hitX, {body:b,result:result});
  G.floorMesh=null;
  result=G.spatialQuerySupport(b,36,66);
  check('absent_endless_mesh_is_not_fabricated_flat_support', result.status==='unloaded', result);
  G.ENDLESS_MODE=false; b.trackFloor=false;
  result=move(b,24,0);
  check('authored_flat_level_remains_movable_without_mesh', close(b.x,54) && close(b.feetZ,0), {body:b,result:result});

  mesh([[1,0,1]]); b=body(30,66,NaN);
  check('invalid_body_height_is_not_clear_collision_space', G.spatialBodyBlocked(b,36,66));
  b=body(30,66,0); result=move(b,NaN,1);
  check('nonfinite_input_does_not_corrupt_actor_coordinates', b.x===30 && b.y===66 && b.feetZ===0 &&
    Number.isFinite(result.steps), {body:b,result:result});
  b=body(30,66,0,{height:NaN});
  check('nonfinite_body_height_is_rejected', G.spatialBodyBlocked(b,36,66));
  b=body(30,66,0,{height:-1});
  check('negative_body_height_is_rejected', G.spatialBodyBlocked(b,36,66));
  b=body(30,66,0,{radius:-1});
  check('negative_body_radius_is_rejected', G.spatialBodyBlocked(b,36,66));

  // Real separation and adapter consumers, not a duplicate solver. These run
  // unchanged in both views and include a same-storey positive control.
  function actor(x,y,z,height) {
    return {x:x,y:y,z:z,feetZ:z,enemyType:{size:1},bodyHeight:height||70,underground:z<0};
  }
  function playerFixture() {
    G.ENDLESS_MODE=false; G.terrain='plains'; G.pos={x:30,y:66,floorZ:60}; G.vel={x:7200,y:0};
    G.equipment={}; G.mana=G.MANA_MAX=100; G.health=G.HEALTH_MAX=100;
    G.MANA_REGEN_PER_S=G.HEALTH_REGEN_PER_S=0;
    G.dashPressed=G.jumpPressed=G.jumpAirborne=false; G.jumpVelZ=G.dashFovPunch=0;
    G.GAME_CONFIG={player:{baseFov:1.2,gravity:500}}; G.cam={ang:0}; G.autoPitchOff=0;
    G.damping=1; G.bounce=0.5; G.NOCLIP=G.DEBUG_CAVE=false; G.collisions=0;
    G.walls=[]; G.enemies=[]; G.marketStalls=[]; G.running=true; G.goal=null;
    G.startMs=Date.now(); G.medalGold=60; G.medalSilver=90; G.medalBronze=120;
    G.document={getElementById:function(){return {textContent:''};}};
  }
  [false,true].forEach(function (view) {
    var label=view?'3D_':'2D_'; G.MODE3D=view; G.viewDist=500; G.pos={x:30,y:66,floorZ:60};
    mesh([[1,-5,2],[2,-1],[4,0,3]]);
    var cave=actor(66,66,-125), surface=actor(67,66,0);
    G.enemies=[cave,surface]; G.separateEnemies();
    check(label+'roof_separated_enemies_do_not_push_each_other', cave.x===66 && surface.x===67,
      {cave:cave,surface:surface});
    var peer=actor(67,66,-125); G.enemies=[cave,peer]; G.separateEnemies();
    check(label+'same_cave_floor_enemies_actually_separate', cave.x<66 && peer.x>67 && cave.z===-125 && peer.z===-125,
      {a:cave,b:peer});
    mesh([[1,0,1]]); var first=actor(90,66,0), second=actor(90,66,0);
    G.enemies=[first,second]; G.separateEnemies();
    check(label+'coincident_enemy_spawns_separate_without_nan', first.x<90 && second.x>90 &&
      [first.x,first.y,second.x,second.y].every(Number.isFinite), {a:first,b:second});
    mesh([[1,0,1]]); wallColumn(4);
    first=actor(53,66,0); second=actor(49,66,0); G.enemies=[first,second]; G.separateEnemies();
    check(label+'enemy_separation_cannot_push_body_into_wall', first.x<=55.2+1e-6 && second.x<49,
      {a:first,b:second});
    mesh([[1,0,2],[2,2]]); first=actor(30,66,0,70); second=actor(30,66,0,25);
    var tallResult=G.moveSpatialActor(first,24,0,6), shortResult=G.moveSpatialActor(second,24,0,6);
    check(label+'actor_adapter_honors_tall_body_headroom', first.x===30 && tallResult.hitX, first);
    check(label+'actor_adapter_honors_short_companion_headroom', close(second.x,54) && !shortResult.hitX, second);
    mesh([[1,function(x){return x*.3;},1]]); first=actor(30,66,15);
    G.moveSpatialActor(first,24,0,6);
    check(label+'enemy_adapter_carries_support_into_legacy_z', close(first.x,54) && first.feetZ===30 && first.z===30, first);

    mesh([[1,0,1]]); wallColumn(4); playerFixture(); G.step(1/60);
    check(label+'actual_player_step_cannot_skip_intermediate_wall', G.pos.x<=54+1e-6 && G.pos.x>=45 &&
      G.vel.x<0 && G.collisions===1, {pos:G.pos,velocity:G.vel,collisions:G.collisions});
    mesh([[1,0,1]]); playerFixture(); G.step(1/60);
    check(label+'actual_player_step_moves_without_wall', close(G.pos.x,150) && G.vel.x>0 && G.collisions===0,
      {pos:G.pos,velocity:G.vel});
    mesh([[1,-5,2],[2,-1],[4,0,3]]); playerFixture();
    G.pos={x:66,y:66,floorZ:60}; G.vel={x:0,y:0}; G.enemies=[actor(67,66,-125)];
    G.repelFromEnemies(1/60);
    check(label+'buried_enemy_does_not_repel_surface_player', G.pos.x===66 && G.pos.y===66 && G.vel.x===0, G.pos);
    G.enemies=[actor(67,66,0)]; G.repelFromEnemies(1/60);
    check(label+'same_storey_enemy_still_repels_player', G.pos.x<66 && G.vel.x<0, {pos:G.pos,velocity:G.vel});

    mesh([[1,0,1]]); wallColumn(4); first=actor(30,66,0);
    first.speed=5000; first.patrolWaypoints=[{x:210,y:66}]; first.patrolIdx=0;
    var patrolMoved=G._patrolEnemy(first,8);
    check(label+'actual_enemy_patrol_cannot_skip_intermediate_wall', first.x<=55.2+1e-6 && first.x>30 && patrolMoved===1, first);
    G.grid.fill(0); first=actor(30,66,0); first.speed=5000;
    first.patrolWaypoints=[{x:210,y:66}]; first.patrolIdx=0; patrolMoved=G._patrolEnemy(first,8);
    check(label+'same_enemy_patrol_moves_without_wall', close(first.x,182) && patrolMoved===1, first);
  });

  mesh([[1,0,1]]); b=body(66,66,0);
  var original=G.spatialQuerySupport(b,66,66);
  G.windowOriginX=60; G.windowOriginY=60; b.x=b.y=6;
  var rebased=G.spatialQuerySupport(b,6,6);
  check('window_rebase_preserves_support_world_identity', original.status==='walk' && rebased.status==='walk' &&
    original.supportId===rebased.supportId && close(original.feetZ,rebased.feetZ), {original:original,rebased:rebased});

  // Capped work must keep the unprocessed tail explicit. It must never turn
  // a pathological displacement into one giant wall-skipping step.
  mesh([[1,0,1]],101); b=body(30,66,0); var work={};
  result=move(b,1e9,0,work);
  check('extreme_displacement_has_bounded_substeps_and_explicit_remainder', Number.isFinite(result.steps) &&
    result.steps>0 && result.steps<=128 && Number.isFinite(result.remainingX) && result.remainingX>1e8 &&
    b.x<G.worldW && b.x>=30, {body:b,result:result,work:work});
  var small=body(30,66,0), workSmall={}; result=move(small,24,0,workSmall);
  mesh([[1,0,1]],201); var large=body(30,66,0), workLarge={}; move(large,24,0,workLarge);
  check('same_motion_cost_does_not_scan_larger_world', small.x===large.x && small.y===large.y &&
    Object.keys(workSmall).length>0 && JSON.stringify(workSmall)===JSON.stringify(workLarge), {small:workSmall,large:workLarge});
  check('fixture_reaches_final_independent_control', close(large.x,54) && close(large.feetZ,0), large);
  __out('SPATIAL_MOTION_RESULT ' + (failures ? 'FAIL '+failures+'/' : 'PASS ') + checked);
})();
