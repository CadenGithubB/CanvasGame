// Authored geometry contracts, independent of render submission and optional lab.
// Run with --benchmark for real-engine microtimings (NOT browser frame timings).
(function () {
  var G = (0, eval)('this'), checked = 0, failures = 0;
  G.floorMesh = G.grid = G.wallHeights = G.wallFaceBase = G.wallMaxTopZ = null;
  G.ENDLESS_MODE = true; G.windowOriginX = G.windowOriginY = 0;
  G.cell = 15; G.gridW = G.gridH = 8;
  G.pos = {x: 6, y: 6, floorZ: 60};
  G._cacheStats = {floorH: {hits: 0, misses: 0, size: 0}};
  (0, eval)(slurp('assets/games/src/06-floor-queries.js'));
  (0, eval)(slurp('assets/games/src/06-spatial-geometry.js'));
  var source = slurp('assets/games/src/06-spatial-queries.js');
  function mutate(flag, before, after) {
    if (__argv.indexOf(flag) < 0) return;
    if (source.split(before).length !== 2) throw new Error('MUTATION_ANCHOR ' + flag);
    source = source.replace(before, after);
  }
  mutate('--omit-roofs', 'if (type < 1 || type > 4) continue;',
    'if (type === 2 || type === 4 || type < 1 || type > 4) continue;');
  mutate('--omit-corner-walls', 'if (Math.abs(tx - ty) < 1e-12) {',
    'if (Math.abs(tx - ty) < 1e-12) { gx += sx; gy += sy; tx += stepx; ty += stepy; t = end; continue;');
  mutate('--local-hit-id', 'var ox = ENDLESS_MODE ? windowOriginX : 0, oy = ENDLESS_MODE ? windowOriginY : 0;',
    'var ox = 0, oy = 0;');
  mutate('--stale-wall-floor', 'var floorH = spatialLowestFloorH((gx+0.5)*cell,(gy+0.5)*cell);',
    'var floorH = getFloorHeightAt((gx+0.5)*cell,(gy+0.5)*cell);');
  mutate('--flatten-triangles', 'var corners = spatialLayerCorners(mesh,ci,li);',
    'var corners = spatialLayerCorners(mesh,ci,li); if (corners) corners = [corners[0],corners[0],corners[0],corners[0]];');
  mutate('--distant-roof-cap', 'if (capType!==1 && capType!==3 && capType!==4) continue;',
    'if (capType!==4) continue;');
  mutate('--omit-wall-closure', 'for (var face=0;face<4;face++) {',
    'for (var face=0;face<0;face++) {');
  mutate('--omit-parallel-boundary', 'var edgeX=!sx && a.x===gx*size, edgeY=!sy && a.y===gy*size;',
    'var edgeX=false, edgeY=false;');
  mutate('--omit-final-boundary', 'if (end >= 1) {', 'if (end >= 1) { return;');
  mutate('--omit-initial-boundary', 'if (n===0) {', 'if (false) {');
  (0, eval)(source);

  function check(id, okay, detail) {
    checked++;
    if (!okay) failures++;
    __out((okay ? 'PASS ' : 'FAIL ') + id + (okay ? '' : ' ' + JSON.stringify(detail)));
  }
  function close(a, b) { return Number.isFinite(a) && Math.abs(a - b) < 1e-6; }
  function point(x, y, z) { return {x: x, y: y, z: z}; }
  function mesh(layers, w, h) {
    w = w || 11; h = h || 11;
    var m = {w: w, h: h, gridSize: 12, layerCount: new Uint8Array(w * h),
      surfaceH: new Float64Array(w * h), ceilAboveMask: new Uint8Array(w * h)};
    m.layerCount.fill(layers.length);
    for (var k = 0; k < 5; k++) {
      var l = layers[k];
      m['l' + k + 'Type'] = new Uint8Array(w * h);
      m['l' + k + 'TopZ'] = new Float64Array(w * h);
      m['l' + k + 'Meta'] = new Uint8Array(w * h);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var i = y * w + x;
        m['l' + k + 'Type'][i] = l ? l[0] : 0;
        m['l' + k + 'TopZ'][i] = l ? (typeof l[1] === 'function' ? l[1](x, y) : l[1]) : 0;
        m['l' + k + 'Meta'][i] = l ? (l[2] || 0) : 0;
        m.surfaceH[i] = layers[layers.length - 1][1];
      }
    }
    G.floorMesh = m;
    G.gridW = Math.ceil((w - 1) * 12 / 15); G.gridH = Math.ceil((h - 1) * 12 / 15);
    G.grid = new Uint8Array(G.gridW * G.gridH);
    G.wallHeights = new Float64Array(G.grid.length); G.wallHeights.fill(1);
    G.wallFaceBase = G.wallMaxTopZ = null;
    G.ENDLESS_MODE = true; G.windowOriginX = G.windowOriginY = 0;
    return m;
  }
  function ray(a, b, work) { return G.spatialRaycast(a, b, work); }
  function wall(x, y) { G.grid[y * G.gridW + x] = 1; }

  mesh([[1, -5, 2], [2, -1], [4, 0, 3]]);
  var r = ray(point(6, 6, -90), point(54, 6, -90));
  check('cave_same_floor_clear', r.status === 'clear', r);
  r = ray(point(6, 6, 35), point(54, 6, 35));
  check('surface_same_floor_clear', r.status === 'clear', r);
  r = ray(point(6, 6, -90), point(54, 6, 35));
  check('roof_crossing_up_hits_ceiling_first', r.status === 'blocked' && r.kind === 'ceiling' && close(r.t, 65 / 125), r);
  r = ray(point(54, 6, 35), point(6, 6, -90));
  check('roof_crossing_down_hits_cap_first', r.status === 'blocked' && r.kind === 'cap' && close(r.t, 35 / 125), r);
  r = ray(point(6, 6, -12), point(54, 6, -12));
  check('ray_inside_roof_slab_cannot_see_sideways', r.status === 'blocked' && r.kind === 'slab' && r.t === 0, r);
  r = ray(point(6, 6, -90), point(6, 6, 35));
  check('vertical_ray_hits_real_overhead_plane', r.status === 'blocked' && r.kind === 'ceiling' && close(r.point.z, -25), r);
  r = ray(point(6, 6, -90), point(6, 6, -80));
  check('vertical_open_interval_clear', r.status === 'clear', r);
  check('support_selects_actual_stratum', G.sampleSpatialSupportZ(6, 6, NaN, true) === -125 &&
    G.sampleSpatialSupportZ(6, 6, NaN, false) === 0);
  G.pos.floorZ = -140; // legacy 40 * -5 + 60; spatial feet are -125.
  check('legacy_player_height_adapter_round_trips', G.playerFeetSpatialZ() === -125 && G.spatialZToPlayerZ(-125) === -140);
  wall(2, 0);
  r = ray(point(6, 6, -90), point(102, 6, 35));
  check('nearer_wall_wins_before_roof_plane', r.status === 'blocked' && r.kind === 'wall' && close(r.point.x, 30), r);
  G.grid.fill(0); wall(6, 0);
  r = ray(point(6, 6, -90), point(102, 6, 35));
  check('nearer_roof_plane_wins_before_wall', r.status === 'blocked' && r.kind === 'ceiling' && close(r.t, 65 / 125), r);

  mesh([[1, 0, 2], [2, 4], [1, 5, 2], [2, 9], [4, 10, 3]]);
  r = ray(point(6, 6, 35), point(54, 6, 35));
  check('stacked_lower_passage_remains_open', r.status === 'clear', r);
  r = ray(point(6, 6, 160), point(54, 6, 160));
  check('stacked_upper_passage_not_swallowed_by_lower_roof', r.status === 'clear', r);
  r = ray(point(6, 6, 110), point(54, 6, 110));
  check('stacked_lower_roof_volume_blocks', r.status === 'blocked' && r.kind === 'slab', r);
  r = ray(point(6, 6, 240), point(54, 6, 240));
  check('stacked_upper_roof_volume_blocks', r.status === 'blocked' && r.kind === 'slab', r);

  var m = mesh([[1, 0, 1]]);
  wall(1, 0);
  r = ray(point(14, 14, 35), point(16, 16, 35));
  check('thin_corner_wall_is_not_skipped', r.status === 'blocked' && r.kind === 'wall' && close(r.t, 0.5), r);
  G.grid.fill(0);
  r = ray(point(14, 14, 35), point(16, 16, 35));
  check('same_corner_without_wall_clear', r.status === 'clear', r);
  wall(2, 0);
  r = ray(point(6, 15, 35), point(54, 15, 35));
  check('parallel_grid_boundary_touches_adjacent_wall', r.status === 'blocked' && close(r.point.x, 30), r);
  r = ray(point(6, 15.01, 35), point(54, 15.01, 35));
  check('parallel_ray_clear_of_wall_boundary_remains_open', r.status === 'clear', r);
  r = ray(point(6, 6, 35), point(30, 6, 35));
  check('final_endpoint_on_wall_is_blocked', r.status === 'blocked' && close(r.t, 1), r);
  r = ray(point(54, 6, 35), point(45, 6, 35));
  check('reverse_final_endpoint_on_wall_is_blocked', r.status === 'blocked' && close(r.t, 1), r);
  r = ray(point(6, 6, 35), point(29.99, 6, 35));
  check('endpoint_before_wall_remains_open', r.status === 'clear', r);
  wall(1, 2);
  r = ray(point(30, 36, 35), point(40, 36, 35));
  check('initial_endpoint_moving_away_still_touches_wall', r.status === 'blocked' && r.t === 0, r);
  r = ray(point(30.01, 36, 35), point(40, 36, 35));
  check('initial_endpoint_clear_of_wall_can_move_away', r.status === 'clear', r);
  wall(2, 0); wall(4, 0);
  r = ray(point(6, 6, 35), point(90, 6, 35));
  check('nearest_wall_not_last_wall_wins', r.status === 'blocked' && close(r.point.x, 30) && close(r.t, 24 / 84), r);
  r = ray(point(90, 6, 35), point(6, 6, 35));
  check('reverse_ray_changes_first_wall', r.status === 'blocked' && close(r.point.x, 75), r);
  r = ray(point(6, 6, 260), point(90, 6, 260));
  check('ray_above_wall_is_clear', r.status === 'clear', r);
  G.wallHeights.fill(0.125); // exactly 30 spatial units
  r = ray(point(6, 6, 20), point(90, 6, 20));
  check('short_wall_blocks_within_authored_height', r.status === 'blocked', r);
  r = ray(point(6, 6, 35), point(90, 6, 35));
  check('short_wall_does_not_block_above_it', r.status === 'clear', r);

  mesh([[1, 0, 2], [2, 3]]); wall(2, 0);
  G.wallMaxTopZ = new Float64Array(G.grid.length); G.wallMaxTopZ.fill(1);
  r = ray(point(6, 6, 50), point(54, 6, 50));
  check('wall_ceiling_closure_blocks_above_regular_wall_top', r.status === 'blocked' && r.kind === 'wall' && close(r.point.x, 30), r);
  r = ray(point(6, 6, 80), point(54, 6, 80));
  check('ray_above_wall_ceiling_closure_remains_open', r.status === 'clear', r);

  m = mesh([[1, 0, 1]], 2, 2);
  m.l0TopZ.set([0, 2, 1, 4]); // NW-SE triangles are z=(50x+50y)/12 and z=(75x+25y)/12.
  r = ray(point(9, 3, 100), point(9, 3, -20));
  check('nonplanar_northeast_triangle_hits_analytic_height', r.status === 'blocked' && close(r.point.z, 50), r);
  r = ray(point(3, 9, 100), point(3, 9, -20));
  check('nonplanar_southwest_triangle_hits_analytic_height', r.status === 'blocked' && close(r.point.z, 37.5), r);
  check('support_matches_authored_triangle_not_flat_cell', close(G.sampleSpatialSupportZ(9, 3, NaN, false), 50) &&
    close(G.sampleSpatialSupportZ(3, 9, NaN, false), 37.5));

  m = mesh([[1, 0, 1]]);
  r = ray(point(-1, 6, 35), point(6, 6, 35));
  check('negative_local_coordinate_is_unloaded', r.status === 'unloaded' && r.t === 0, r);
  r = ray(point(6, 6, 35), point(150, 6, 35));
  check('outside_loaded_mesh_is_not_clear', r.status === 'unloaded' && close(r.t, 114 / 144), r);
  r = ray(point(6, 6, NaN), point(20, 6, 35));
  check('nonfinite_height_is_explicitly_invalid', r.status === 'invalid', r);
  m.layerCount[2] = 0;
  r = ray(point(6, 6, 35), point(54, 6, 35));
  check('empty_mesh_cell_is_unloaded', r.status === 'unloaded' && close(r.t, 18 / 48), r);
  G.floorMesh = null;
  r = ray(point(6, 6, 35), point(54, 6, 35));
  check('missing_endless_mesh_is_not_fabricated_flat_world', r.status === 'unloaded', r);
  G.ENDLESS_MODE = false;
  r = ray(point(6, 6, 35), point(54, 6, 35));
  check('authored_fixed_level_keeps_valid_flat_world', r.status === 'clear', r);

  mesh([[1, 0, 1]]); wall(4, 2);
  // A world-aligned window shift by 60 makes the original wall's local x=0.
  // Keep both endpoints inside the loaded window by reversing from its far side.
  var first = ray(point(100, 36, 35), point(64, 36, 35));
  G.windowOriginX = 60; G.grid.fill(0); wall(0, 2);
  var translated = ray(point(40, 36, 35), point(4, 36, 35));
  check('window_translation_preserves_world_surface_id', first.status === 'blocked' && translated.status === 'blocked' &&
    first.surfaceId === 'wall:60:30:0' && translated.surfaceId === first.surfaceId && close(first.t, translated.t),
    {before: first, after: translated});
  G.windowOriginX = -120; G.windowOriginY = -60;
  r = ray(point(40, 36, 35), point(4, 36, 35));
  check('negative_world_origin_preserves_signed_identity', r.surfaceId === 'wall:-120:-30:0', r);

  mesh([[1, 0, 1]]); wall(2, 0);
  var beforeView = ray(point(6, 6, 35), point(54, 6, 35));
  G.MODE3D = false; G.canvas = {width: 160, height: 120}; G.cam = {z: -900};
  var lowView = ray(point(6, 6, 35), point(54, 6, 35));
  G.MODE3D = true; G.canvas = {width: 3840, height: 2160}; G.cam.z = 900;
  var highView = ray(point(6, 6, 35), point(54, 6, 35));
  check('camera_view_and_resolution_cannot_change_collision', beforeView.status === 'blocked' &&
    JSON.stringify(beforeView) === JSON.stringify(lowView) && JSON.stringify(beforeView) === JSON.stringify(highView));
  G.grid.fill(0);
  r = ray(point(6, 6, 35), point(54, 6, 35));
  check('in_place_wall_removal_is_visible_immediately', r.status === 'clear', r);
  wall(2, 0);
  r = ray(point(6, 6, 35), point(54, 6, 35));
  check('in_place_wall_addition_is_visible_immediately', r.status === 'blocked', r);
  mesh([[1, -5, 2], [2, -1], [4, 0, 3]]);
  r = ray(point(6, 6, -90), point(54, 6, 35));
  var roofBefore = r.status;
  mesh([[1, -5, 2]]);
  r = ray(point(6, 6, -90), point(54, 6, 35));
  check('mesh_replacement_does_not_reuse_stale_roof_result', roofBefore === 'blocked' && r.status === 'clear', r);
  m = mesh([[1, -5, 2], [2, -1], [4, 0, 3]]);
  roofBefore = ray(point(6, 6, -90), point(54, 6, 35)).status;
  m.layerCount.fill(1);
  r = ray(point(6, 6, -90), point(54, 6, 35));
  check('in_place_roof_removal_is_visible_immediately', roofBefore === 'blocked' && r.status === 'clear', r);
  m = mesh([[1, 0, 1]]); wall(2, 0);
  var shortA = point(6, 6, 20), shortB = point(54, 6, 20);
  G.wallHeights.fill(0.125);
  var oldFloor = ray(shortA, shortB);
  m.l0TopZ.fill(-4); // Old wall interval [0,30] becomes [-100,-70] without another render/tick.
  var movedFloor = ray(shortA, shortB);
  check('in_place_support_edit_moves_wall_span_without_render_tick', oldFloor.status === 'blocked' && movedFloor.status === 'clear',
    {before: oldFloor, after: movedFloor});

  mesh([[1, 0, 1]], 101, 101);
  var workShort = {}, workLong = {}, workLarge = {};
  ray(point(6, 6, 35), point(246, 6, 35), workShort);
  ray(point(6, 6, 35), point(486, 6, 35), workLong);
  mesh([[1, 0, 1]], 201, 201);
  ray(point(6, 6, 35), point(246, 6, 35), workLarge);
  check('query_work_depends_on_ray_length_not_world_area', JSON.stringify(workShort) === JSON.stringify(workLarge) &&
    workLong.terrainCells <= 2 * workShort.terrainCells && workLong.wallCells <= 2 * workShort.wallCells,
    {short: workShort, long: workLong, largerWorld: workLarge});
  check('flat_query_triangle_budget_is_linear', workLong.triangles === 2 * workLong.terrainCells &&
    // 480 world units cross 41 mesh / 33 wall cells; closed endpoint handling
    // may revisit the endpoint once, but must not scan the whole world.
    workLong.terrainCells >= 41 && workLong.terrainCells <= 42 &&
    workLong.wallCells >= 33 && workLong.wallCells <= 34, workLong);
  if (failures) {
    __out('SPATIAL_QUERY_RESULT FAIL ' + failures + '/' + checked);
    return;
  }
  __out('SPATIAL_QUERY_RESULT PASS ' + checked);

  if (__argv.indexOf('--benchmark') < 0) return;
  var los = slurp('assets/games/src/08-sensors-input-los.js');
  var losStart = los.indexOf('var _losCache = {};');
  if (losStart < 0) throw new Error('BENCHMARK_SETUP missing legacy LOS');
  (0, eval)(los.slice(losStart));
  mesh([[1, 0, 1]], 161, 161);
  for (var wy = 0; wy < G.gridH; wy++) wall(40, wy);
  var rays = [];
  for (var ri = 0; ri < 64; ri++) {
    var y = 6 + ri * 24;
    rays.push([point(6, y, 35), point(ri % 2 ? 846 : 486, y, 35)]);
  }
  var baseline = [], counts = {}, benchQueries = 0;
  rays.forEach(function (p, i) {
    var expected = !(i % 2), old = G.hasLineOfSight(p[0].x, p[0].y, p[1].x, p[1].y);
    var fresh = ray(p[0], p[1], counts).status === 'clear';
    if (old !== expected || fresh !== expected) throw new Error('BENCHMARK_SETUP expected analytic clear/blocked ray ' + i);
    baseline.push(expected);
  });
  var now, clockLabel;
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    now = function () { return performance.now(); }; clockLabel = 'performance.now monotonic';
  } else {
    throw new Error('BENCHMARK_SETUP performance.now monotonic clock required; wall-clock fallback refused');
  }
  var modes = [
    {name: 'legacy_cached_xy_los', fn: function (p) { return G.hasLineOfSight(p[0].x, p[0].y, p[1].x, p[1].y); }},
    {name: 'legacy_cold_xy_los_includes_cache_reset', fn: function (p) {
      G._losCache = {}; return G.hasLineOfSight(p[0].x, p[0].y, p[1].x, p[1].y);
    }},
    {name: 'shared_25d_ray_counters_off', fn: function (p) { return ray(p[0], p[1]).status === 'clear'; }},
    {name: 'shared_25d_ray_counters_on', fn: function (p) { return ray(p[0], p[1], {}).status === 'clear'; }}
  ];
  function batch(mode, n) {
    var okay = 0, start = now();
    for (var i = 0; i < n; i++) if (mode.fn(rays[i % rays.length]) === baseline[i % rays.length]) okay++;
    var elapsed = now() - start;
    if (okay !== n || elapsed < 0) throw new Error('BENCHMARK_SETUP workload changed or clock moved backward');
    benchQueries += n;
    return elapsed;
  }
  function percentile(sorted, p) { return sorted[Math.ceil(p * sorted.length) - 1]; }
  modes.forEach(function (mode) { for (var w = 0; w < 8; w++) batch(mode, 1024); });
  var results = [];
  for (var repeat = 0; repeat < 5; repeat++) {
    // Alternating order avoids always measuring one method in a colder process.
    var order = repeat % 2 ? modes.slice().reverse() : modes;
    order.forEach(function (mode) {
      var n = 1024;
      while (batch(mode, n) < 8 && n < 65536) n *= 2;
      var samples = [];
      for (var s = 0; s < 30; s++) samples.push(batch(mode, n) * 1000 / n);
      samples.sort(function (a, b) { return a - b; });
      results.push({repeat: repeat + 1, mode: mode.name, queriesPerBatch: n, batches: samples.length,
        unit: 'microseconds/query from batched elapsed time', p50: percentile(samples, 0.5),
        p95: percentile(samples, 0.95), p99: percentile(samples, 0.99), max: samples[samples.length - 1]});
    });
  }
  __out('SPATIAL_BENCHMARK ' + JSON.stringify({engine: __engine, clock: clockLabel,
    scope: 'query microbenchmark only; no Canvas, browser cadence, GC isolation, or calibrated device budget',
    workload: {seed: 'authored-alternating-64', mesh: [161, 161, 12], walls: [128, 128, 15],
      rays: rays.length, clearRays: 32, blockedRays: 32, workCountsForOneWorkload: counts,
      warmupQueriesPerMode: 8192, serialRepeats: 5,
      totalQueriesIncludingWarmupAndCalibration: benchQueries}, results: results}));
}());
undefined;
