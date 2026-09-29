// Weather (unified effects V1, slice S7). A full-game host loads the real
// manifest and runs the real generator (Endless seed 424242, Cave Test seed
// 12345 'descending', classic Expanse), fixed ticks, chunk streaming and the
// real draw path through a recording Canvas; roof, wall, slope and flat
// cases run on authored floors (12 u cells) whose layers the checks read
// directly.
// Risks covered: rain through cave roofs, overhangs, a classic level's
// capless cave roof or a cave's wall cells, landing below the open sky of
// its column, or snow blown sideways that climbs onto a higher column (H1);
// weather that ignores the viewer going underground, a kind's excess that
// is not faded when its target falls, or rain drawn over the rock around a
// cave mouth (H2); a snow line that ignores the column's height or the
// biome's kind, or that spends rain's population on snow (H3); a schedule
// tied to the wall clock, the tick count or the step size instead of the
// seed and the sim time, fronts outside 2-5 min, crossfades or wind eases
// that are not 8 s and 10 s, per-biome chances that are ignored, and wind
// that the weather does not follow through drag (H4, B15); rain spawned
// outside its box, splashes beyond 120 u or at the wrong chance, a prewarm
// that does not spread rain over its fall, a refill that bursts, splashes
// on walls hit from the side, and wraps that lose the height above ground
// or move settled members; splashes off the slope (H5); a Weather switch
// that is ignored, keeps its wind when off, or a state and dev force that
// misreport (H6); a refill that never reaches the population, or a
// population that ignores the Particles setting or the intensity (H7);
// rain drops simulated in 2D, a 2D box smaller than the view, the 2D snow
// line or splash rate lost, and edge fades that fail (H8); weather that
// does not blow with the wind or settle on wall tops; rain and snow that do
// not change with day, night and torchlight, and ash that brightens at
// night; weather that jumps at a chunk crossing; cosmetic draws from a
// random stream (B1 re-run); feedback lost in a pool full of rain (B3
// re-run); and per-particle clip or allocation regressions under Ultra rain
// (C9 re-run). The streak drawing of the shipping rain recipe is C3's
// second run in particle_render.js.
// Oracles: authored layer heights, the shared spatial helpers
// (sampleSpatialSupportZ, spatialWallSpan, spatialLayerCorners,
// getCaveSpaceAt) and the player's own physics (getWalkableLayerTopAt,
// getWallTopZ) read here, the spec's rules restated (populations by
// Particles and intensity, smoothstep visibility, front, crossfade and wind
// bounds, biome chances, the analytic drag response, turnover rate,
// twoDScale and the 2D area cap, wind couplings, spriteLight, the box and
// the splash chance), runs of the same schedule at other step sizes, clock
// origins and seeds, reference runs (no snow line, forced snow), particle
// identities (seedA), recorded births (fxSpawn is wrapped), steals (fxSteal
// is wrapped) and draws, and the scene depth.
// Mutations are applied to slurped sources only (anchors match exactly once):
//   --weather-lowest-layer  --walkable-only-sky     --cave-wall-as-wall
//   --side-entry-climbs     --ignore-underground    --weather-zero-underground
//   --no-excess-cull        --weather-unoccluded    --no-snowline
//   --swap-fills-rain-set   --swap-always           --weather-wall-clock
//   --tick-keyed-weather    --no-crossfade          --crossfade-rate
//   --no-wind-ease          --chance-const          --refill-per-tick-ceil
//   --no-child-near         --bias-zero             --splash-chance-1
//   --prewarm-no-fall       --acc-uncapped          --wall-side-splash
//   --wrap-keep-z           --wrap-rest             --splash-cell-constant
//   --toggle-ignored        --kind-first            --off-keeps-wind
//   --reset-drops-force     --refill-seconds-cap    --no-intensity-scale
//   --force-ignores-intensity --simulate-2d-rain    --2d-view-box
//   --2d-no-snowline        --2d-splash-rate-x3     --fade-no-mask
//   --wind-at-rest          --wall-top-kills-rest   --rain-emissive
//   --rain-ambient-light    --snow-no-night-boost   --ash-night-boost
//   --no-fx-rebase          --weather-math-random   --no-reserve
//   --no-steal              --per-particle-billboard --profile-weather-unforced
//   --studio-weather-unforced --no-dt-guard     --weather-refill-steals
(function () {
  var G = (0, eval)('this'), output = (__engine === 'node' || __engine === 'deno') ? console.log.bind(console) : __out;
  var checked = 0, failed = 0, loadErrors = [], warnings = [], originalRandom = Math.random;
  var DT = 1 / 60, GS = 12, TAN20 = Math.tan(20 * Math.PI / 180);
  function has(flag) { return __argv.indexOf(flag) >= 0; }
  // The default run executes every case. A mutation run skips the cases its
  // flag cannot reach and says so.
  var mutationRun = __argv.some(function (a) { return /^--/.test(a); });
  function needed(name, flags) {
    if (!mutationRun || flags.some(has)) return true;
    output('SKIP ' + name + ' (mutation run for another check)');
    return false;
  }
  function mutate(source, flag, before, after) {
    if (!has(flag)) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + flag);
    return source.replace(before, after);
  }
  G.__weatherSource = function (path, source) {
    if (path === 'src/11-fx-engine.js') {
      // The legacy support rule (getFloorHeightAt): the lowest walkable layer, for spawns and for landings.
      // (one rule for spawns, wraps, the snow line and landings: fxSkyLayer).
      source = mutate(source, '--weather-lowest-layer',
        '    if (type >= 1 && type <= 4 && Number.isFinite(h) && h > best) { best = h; li = k; }',
        '    if ((type === 1 || type === 3 || type === 4) && Number.isFinite(h) && (li < 0 || h < best)) { best = h; li = k; }');
      // The S7 first cut: the highest walkable layer only, so a classic
      // level's capless cave roof (floor and ceiling layers) is open sky.
      source = mutate(source, '--walkable-only-sky',
        '    if (type >= 1 && type <= 4 && Number.isFinite(h) && h > best) { best = h; li = k; }',
        '    if ((type === 1 || type === 3 || type === 4) && Number.isFinite(h) && h > best) { best = h; li = k; }');
      // A cave's wall cell treated as a wall by open-sky particles (its span top, not the surface over it).
      source = mutate(source, '--cave-wall-as-wall', ' && grid[wi] && !(gridCave && gridCave[wi])) {\n      var wt = fxWallTopZ(wi, wx, wy);\n      if (wt < Infinity && !(top >= wt)) return wt;',
        ' && grid[wi]) {\n      var wt = fxWallTopZ(wi, wx, wy);\n      if (wt < Infinity && !(top >= wt)) return wt;');
      source = mutate(source, '--cave-wall-as-wall', '        !(R.stratum[r] === FX_STRATUM_OPENSKY && gridCave && gridCave[wi])) {', '        true) {');
      source = mutate(source, '--ignore-underground', '  W.visibility = 1 - u * u * (3 - 2 * u); W.snapped = false;', '  W.visibility = 1; W.snapped = false;');
      // The naive rule: no weather at all while the viewer is underground.
      source = mutate(source, '--weather-zero-underground', '  W.visibility = 1 - u * u * (3 - 2 * u); W.snapped = false;',
        '  W.visibility = playerUnderground ? 0 : 1; W.snapped = false;');
      source = mutate(source, '--no-snowline', '  if ((alt = R.snowAlt[r]) >= 0 && sky.top >= FX_WEATHER_RULES.snowLineH * 25) {', '  if (false) {');
      // The S7 first cut: every rain draw above the line becomes snow, kept in the rain set's count.
      source = mutate(source, '--swap-fills-rain-set', '    st.swapV++;\n    if (st.lives[FX_WEATHER_SWAP] < st.targets[FX_WEATHER_SWAP] && effectNoise(key ^ FX_WEATHER_SWAP_SALT, serial) < fxSwapChance(S, set, alt, pre) &&\n' +
        '        fxWeatherMember(S, F, st, FX_WEATHER_SWAP, alt, x, y, z, pre)) S.stats.weatherSnowLine++;\n    return 1;',
        '    if (!fxWeatherMember(S, F, st, k, alt, x, y, z, pre)) return 0;\n    S.stats.weatherSnowLine++;\n    return 1;');
      // Every draw above the line spawns its swap (no thinning to snow's density).
      source = mutate(source, '--swap-always', '  return share * set.life / span;', '  return 1;');
      // Perf's epochs: the game clock (Date.now at session start + game time).
      // Levels jump to their goals (no crossfade).
      source = mutate(source, '--no-crossfade', '      W.level[k] = v < g ? (v + d < g ? v + d : g) : (v - d > g ? v - d : g);', '      W.level[k] = g;');
      // The S7 first cut: a crossfade is a rate of 1/crossfadeSeconds, not a duration.
      source = mutate(source, '--crossfade-rate', 'W.rate[k] = (g > v ? g - v : v - g) / fade; }', 'W.rate[k] = 1 / fade; }');
      source = mutate(source, '--no-wind-ease', '  e = e < 0 ? 0 : e > 1 ? 1 : e;', '  e = 1;');
      // One chance for every biome (plains').
      source = mutate(source, '--chance-const', 'W.roll < FX_WEATHER.biomeChance[b]) G[FX_WEATHER.biomeKind[b]] = W.frontI;', 'W.roll < 0.5) G[FX_WEATHER.biomeKind[b]] = W.frontI;');
      // The state always names rain (the summary ignores the kinds' levels).
      source = mutate(source, '--kind-first', '  W.kind = best; W.intensity = W.level[best];', '  W.kind = 0; W.intensity = W.level[best];');
      source = mutate(source, '--off-keeps-wind', 'W.kind = 0; W.intensity = 0; W.windX = W.windY = 0; W.mode = mode;', 'W.kind = 0; W.intensity = 0; W.mode = mode;');
      source = mutate(source, '--reset-drops-force', '  S.weather.force = force; S.weather.forceI = forceI;\n', '');
      // Every open kind at its full population (intensity ignored).
      source = mutate(source, '--no-intensity-scale', '    T[k] = on ? Math.floor(pop[k] * scale * W.level[k] + 1e-9) : 0;',
        '    T[k] = on ? Math.floor(pop[k] * scale * (W.level[k] > 0 ? 1 : 0) + 1e-9) : 0;');
      source = mutate(source, '--force-ignores-intensity', '{ G[mode - 1] = W.force !== FX_WF_NONE ? W.forceI : 1; return; }', '{ G[mode - 1] = 1; return; }');
      source = mutate(source, '--no-dt-guard', "    if (!(dt > 0 && dt <= 1)) throw new Error('updateEffects needs a step of (0, 1] s, got ' + dt);\n", '');
      source = mutate(source, '--weather-wall-clock', 'var W = S.weather, rules = FX_WEATHER_RULES, now = S.simTime,',
        'var W = S.weather, rules = FX_WEATHER_RULES, now = gameTimeNow() / 1000,');
      source = mutate(source, '--tick-keyed-weather', 'var W = S.weather, rules = FX_WEATHER_RULES, now = S.simTime,',
        'var W = S.weather, rules = FX_WEATHER_RULES, now = S.tick / 60,');
      // The spec's per-tick cap, ceil(T dt / life x 1.25) + 1, with no carry.
      source = mutate(source, '--refill-per-tick-ceil', '      st.acc[k] = acc = acc > rate + 1 ? rate + 1 : acc;\n      if (want > Math.floor(acc)) want = Math.floor(acc);',
        '      st.acc[k] = 0;\n      if (want > Math.ceil(rate) + 1) want = Math.ceil(rate) + 1;');
      // Perf's refill: ceil(T / (refillSeconds x 60)) + 1 per tick, refillSeconds 0.4 (26 a tick for 600).
      // No fade for a kind's excess when its target falls (the members live on).
      source = mutate(source, '--no-excess-cull', '  for (k = 0; k < 4; k++) if (L[k] > T[k]) { fxDyingOldest(S, -1, L[k] - T[k], code | k << 8); L[k] = T[k]; }',
        '  for (k = 0; k < 4; k++) if (L[k] > T[k]) { L[k] = T[k]; }');
      source = mutate(source, '--refill-seconds-cap', '      st.acc[k] = acc = acc > rate + 1 ? rate + 1 : acc;\n      if (want > Math.floor(acc)) want = Math.floor(acc);',
        '      st.acc[k] = acc;\n      if (want > Math.ceil(T[k] / 24) + 1) want = Math.ceil(T[k] / 24) + 1;');
      source = mutate(source, '--no-child-near', '  if (d > R.childNear[r] || !(effectNoise(S.seedA[i], 13) < R.onFloorChance[r] * fxKeep(R, child, d))) return;',
        '  if (!(effectNoise(S.seedA[i], 13) < R.onFloorChance[r] * fxKeep(R, child, d))) return;');
      source = mutate(source, '--bias-zero', '    st.cx = cam.x + Math.cos(cam.ang) * F.bias; st.cy = cam.y + Math.sin(cam.ang) * F.bias;', '    st.cx = cam.x; st.cy = cam.y;');
      source = mutate(source, '--prewarm-no-fall', '    if (S.R.untilGround[r]) S.z[i] -= (S.z[i] - z) * 0.9 * u; else S.age[i] = S.life[i] * 0.95 * u;',
        '    if (!S.R.untilGround[r]) S.age[i] = S.life[i] * 0.95 * u;');
      source = mutate(source, '--acc-uncapped', '      st.acc[k] = acc = acc > rate + 1 ? rate + 1 : acc;\n', '      st.acc[k] = acc;\n');
      // A drop against a wall's side splashes on its top.
      source = mutate(source, '--wall-side-splash', '        if (oz >= top) fxQueueChild(S, i, r, px, py, top);   // fell onto the wall top', '        fxQueueChild(S, i, r, px, py, top);');
      // A wrapped member keeps its height (not its height above the ground).
      source = mutate(source, '--wrap-keep-z', '  S.z[i] = h + (S.z[i] - g); S.x[i] = x; S.y[i] = y;', '  S.x[i] = x; S.y[i] = y;');
      source = mutate(source, '--wrap-rest', '      if ((f & FX_REST) || dx > limX', '      if (dx > limX');
      source = mutate(source, '--splash-cell-constant', '  if (mode === FX_MODE_KILL) { fxQueueChild(S, i, r, px, py, gz); fxKill(S, i); return true; }',
        '  if (mode === FX_MODE_KILL) { fxQueueChild(S, i, r, px, py, S.g0[i]); fxKill(S, i); return true; }');
      source = mutate(source, '--toggle-ignored', "    S.weatherToggle = !effectPresetOn('fxWeather') ? FX_WM_OFF : wv === 'auto' ? FX_WM_AUTO : FX_ENUMS.weatherKind.indexOf(wv) + 1;",
        "    S.weatherToggle = !effectPresetOn('fxWeather') ? FX_WM_OFF : FX_WM_AUTO;");
      source = mutate(source, '--simulate-2d-rain', '    if (twoD && set.splash >= 0) {', '    if (false) {');
      // The S7 first cut: the 2D box keeps the 3D half size (200 u) around the view's centre.
      source = mutate(source, '--2d-view-box', '    st.hx = cw / 2 + FX_VIEW2D_MARGIN; st.hy = ch / 2 + FX_VIEW2D_MARGIN; st.fade = FX_VIEW2D_MARGIN;',
        '    st.hx = st.hy = F.half; st.fade = F.edgeFade * F.half;');
      source = mutate(source, '--2d-no-snowline', '    if (alt >= 0 && sky.top >= line) {', '    if (false) {');
      source = mutate(source, '--2d-splash-rate-x3', 'fxWeatherSplashes2D(S, F, st, k, set, rate / FX_WEATHER_RULES.refillBoost);',
        'fxWeatherSplashes2D(S, F, st, k, set, 3 * rate / FX_WEATHER_RULES.refillBoost);');
      source = mutate(source, '--simulate-2d-rain', '    if (twoD && R.mode2D[S.rec[i]] !== FX_MODE2D_SIM) { fxMarkDying(S, i); i++; continue; }   // rain drops leave the 2D view\n', '');
      source = mutate(source, '--wind-at-rest', '  if (dir === FX_DIR_WIND) { vx += S.weather.windX * R.wind[r]; vy += S.weather.windY * R.wind[r]; }\n', '');
      source = mutate(source, '--wall-top-kills-rest', 'if (oz >= top && mode === FX_MODE_REST) {', 'if (false) {');
      // The S7 first cut: a flake blown sideways into a higher column settles on top of it.
      source = mutate(source, '--side-entry-climbs', '  if (oz < gz - 1 && R.stratum[r] === FX_STRATUM_OPENSKY) { fxKill(S, i); return true; }\n', '');
      source = mutate(source, '--no-fx-rebase', '  for (var i = 0; i < n; i++) if (!(fl[i] & (FX_EYE | FX_SCREEN))) { S.x[i] -= sx; S.y[i] -= sy; }\n', '');
      source = mutate(source, '--weather-math-random', '  var serial = S.fieldSerial, key = F.salt ^ S.seed, x = 0, y = 0, z = NaN, R = S.R, sky = _fxSky, alt;',
        '  Math.random();\n  var serial = S.fieldSerial, key = F.salt ^ S.seed, x = 0, y = 0, z = NaN, R = S.R, sky = _fxSky, alt;');
      source = mutate(source, '--no-reserve', '  if (S.count >= (c === 4 ? S.cap : S.B)) {', '  if (S.count >= S.B) {');
      // S9: the weather refill going on past the full budget (a draw per refused member).
      source = mutate(source, '--weather-refill-steals', "      if (S.count >= S.B) { S.stats.refusedBudget += want - got; break; }   // weather never steals: no column lookups for refusals\n", '');
      source = mutate(source, '--no-steal', '    if (S.noSteal || !fxSteal(S, c)) return -3;', '    return -3;');
      source = mutate(source, '--profile-weather-unforced', '  fxState.weather.force = wf === wf ? wf : FX_WM_CLEAR;\n', '');
      source = mutate(source, '--studio-weather-unforced', '  live.fxState.weather.force = FX_WM_CLEAR;\n', '');
    }
    if (path === 'src/11-fx-recipes.js') {
      source = mutate(source, '--splash-chance-1', "onFloor:'weather.splash', onFloorChance:0.45, childNear:120}", "onFloor:'weather.splash', onFloorChance:1, childNear:120}");
      source = mutate(source, '--rain-ambient-light', "    occlusion:'segment', lighting:'lightGrid', view2D:'none', mode2D:'splashOnly',",
        "    occlusion:'segment', lighting:'ambient', view2D:'none', mode2D:'splashOnly',");
      source = mutate(source, '--ash-night-boost', "alpha:[0.35, 0.6]}, nightBoost:0, budget:{maxLive:950}},", "alpha:[0.35, 0.6]}, budget:{maxLive:950}},");
      source = mutate(source, '--rain-emissive', "    occlusion:'segment', lighting:'lightGrid', view2D:'none', mode2D:'splashOnly',",
        "    occlusion:'segment', lighting:'emissive', view2D:'none', mode2D:'splashOnly',");
    }
    if (path === 'src/14-fx-render.js') {
      // A member's field is looked up by its whole owner (the kind set included): no weather field, no fade.
      source = mutate(source, '--fade-no-mask', '  var st = S.fields[code & 255];', '  var st = S.fields[code];');
      // Weather drawn with no depth test (over the rock that hides it).
      source = mutate(source, '--weather-unoccluded', '    var cls = 1, aux = 0, occ = space || twoD ? FXO_NONE : R.occ[r];',
        '    var cls = 1, aux = 0, occ = space || twoD || S.cls[i] === 0 ? FXO_NONE : R.occ[r];');
      source = mutate(source, '--snow-no-night-boost',
        '      if (R.nightBoost[r] > 0 && (lt === FXL_AMBIENT || lt === FXL_GRID)) alpha *= 1 + F.night * R.nightBoost[r];   // lit snow reads at night\n', '');
      source = mutate(source, '--per-particle-billboard', '    var mmode = 0, cost;\n    if (cls === 2) {', '    var mmode = 0, cost;\n    if (!space && !twoD) cls = 2;\n    if (cls === 2) {');
    }
    return source;
  };
  G.__weatherLoad = function (path) {
    try { (0, eval)(G.__weatherSource(path, slurp('assets/games/' + path))); } catch (e) {
      if (/^MUTATION_ANCHOR/.test(e.message)) throw e;
      loadErrors.push(path + ': ' + e.message);
    }
  };
  var host = slurp('tools/game/tests/cave_occlusion_integration.js');
  var end = host.indexOf('  function check(name, okay) {');
  if (end < 0) throw Error('SETUP weather host boundary missing');
  host = host.slice(0, end);
  var load = "manifest.parts.MAIN.forEach(function (path) { (0, eval)(slurp('assets/games/' + path)); });";
  if (host.split(load).length !== 2) throw Error('SETUP weather manifest boundary missing');
  host = host.replace(load, 'manifest.parts.MAIN.forEach(G.__weatherLoad);');
  (0, eval)(host + 'G.__weatherErrors = errors; }());');
  G.console.warn = function () { warnings.push(Array.prototype.join.call(arguments, ' ')); };

  function check(name, okay, detail) {
    checked++; if (!okay) failed++;
    output((okay ? 'PASS ' : 'FAIL ') + name + (okay ? '' : ' ' + JSON.stringify(detail === undefined ? null : detail)));
  }
  function run(name, fn) {
    try { fn(); } catch (e) {
      check(name + ' ran without an exception', false, {message: e.message, stack: String(e.stack || '').split('\n').slice(0, 4)});
    }
  }
  function near(a, b, tol) { return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol); }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function lcg(seed) { var s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  check('every game fragment loads without an error', !loadErrors.length, {loadErrors: loadErrors});
  if (loadErrors.length) { output('WEATHER_RESULT FAIL ' + failed + '/' + checked + ' (load failed)'); return; }

  // ── Recording Canvas: the drawing state with a real save/restore stack and
  // translation, every fill, stroke and image of the watched stages with its
  // path, style and alpha, and path calls and shadow-blur sets per stage.
  // Other calls fall through to the host stub.
  var hostCtx = G.ctx, rec = {stage: null, watch: null, draws: [], path: [], stack: [], pathCalls: 0, blurSets: 0};
  var state = {fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1,
    shadowBlur: 0, tx: 0, ty: 0};
  var STATE_KEYS = Object.keys(state);
  function watching() { return !!(rec.watch && rec.stage && rec.watch.test(rec.stage)); }
  function draw(kind, extra) {
    if (!watching()) return;
    var d = {kind: kind, stage: rec.stage, alpha: state.globalAlpha, path: rec.path.slice()};
    for (var k in extra) d[k] = extra[k];
    rec.draws.push(d);
  }
  function pathOp(name) {
    return function (a, b, c, d) {
      if (watching()) rec.pathCalls++;
      if (name === 'arc') rec.path.push(['arc', a + state.tx, b + state.ty, c]);
      else if (name === 'rect') rec.path.push(['rect', a + state.tx, b + state.ty, c, d]);
      else if (name === 'ellipse') rec.path.push(['ellipse', a + state.tx, b + state.ty, c, d]);
      else rec.path.push([name, a + state.tx, b + state.ty]);
    };
  }
  var own = {
    save: function () { rec.stack.push(STATE_KEYS.map(function (k) { return state[k]; })); },
    restore: function () { var f = rec.stack.pop(); if (f) STATE_KEYS.forEach(function (k, i) { state[k] = f[i]; }); },
    translate: function (x, y) { state.tx += x; state.ty += y; },
    beginPath: function () { rec.path = []; },
    moveTo: pathOp('moveTo'), lineTo: pathOp('lineTo'), arc: pathOp('arc'), rect: pathOp('rect'), ellipse: pathOp('ellipse'),
    fill: function () { draw('fill', {style: state.fillStyle}); },
    stroke: function () { draw('stroke', {style: state.strokeStyle}); },
    drawImage: function (img, x, y, w, h) { draw('image', {x: x + state.tx, y: y + state.ty, w: w, h: h}); }
  };
  var wrappers = {};
  G.ctx = new Proxy(state, {
    get: function (t, k) {
      if (typeof k !== 'string') return undefined;
      if (Object.prototype.hasOwnProperty.call(state, k)) return state[k];
      if (wrappers[k]) return wrappers[k];
      var impl = own[k], hv = hostCtx[k];
      if (!impl && typeof hv !== 'function') return hv;
      wrappers[k] = function () { return impl ? impl.apply(null, arguments) : hv.apply(hostCtx, arguments); };
      return wrappers[k];
    },
    set: function (t, k, v) {
      if (k === 'shadowBlur' && v > 0 && watching()) rec.blurSets++;
      state[k] = v; return true;
    }
  });
  var realPt = G._pt, stageErrors = [];
  // One real frame (renderFrame); the stages named by `watch` are recorded.
  function frame(watch) {
    rec.draws = []; rec.path = []; rec.pathCalls = 0; rec.watch = watch || /^(ambientFX3D|fxCombat3D|fx2D)$/;
    G._pt = function (name, fn) {
      var prev = rec.stage; rec.stage = name;
      try { return fn(); } catch (e) { stageErrors.push(name + ': ' + e.message); } finally { rec.stage = prev; }
    };
    try { G.renderFrame(); } finally { G._pt = realPt; rec.stage = null; rec.watch = null; }
    return rec.draws;
  }
  // The same recording around direct stage calls (authored scenes).
  function stage(name, fn) {
    rec.draws = []; rec.path = []; rec.pathCalls = 0; rec.watch = /./; rec.stage = name;
    try { fn(); } finally { rec.stage = null; rec.watch = null; }
    return rec.draws;
  }
  function inCanvas(x, y) { return x >= 0 && x <= G.canvas.width && y >= 0 && y <= G.canvas.height; }
  function lit(hex) {                                     // a colour at the eight light levels (spec 5.6, restated)
    var v = parseInt(hex.slice(1), 16);
    return [0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92, 1.0].map(function (f) {
      return 'rgb(' + Math.round(((v >> 16) & 255) * f) + ',' + Math.round(((v >> 8) & 255) * f) + ',' + Math.round((v & 255) * f) + ')';
    });
  }
  var RAIN_STYLES = lit('#9fb4c8').concat(lit('#c9d6e4')), SNOW_STYLES = lit('#eef4fa'), CINDER_STYLES = lit('#ff8a3a');
  var ASH_STYLES = lit('#6e6a66').concat(lit('#a39c94'));
  // Rain drawn in `stageName`: streak pieces (moveTo then lineTo) and far
  // drops drawn as dots (rects/arcs), inside the canvas.
  function rainDrawn(draws, stageName) {
    var streaks = 0, dots = 0;
    draws.forEach(function (d) {
      if (d.stage !== stageName || RAIN_STYLES.indexOf(d.style) < 0) return;
      for (var i = 0; i < d.path.length; i++) {
        var a = d.path[i];
        if (d.kind === 'stroke' && a[0] === 'moveTo' && i + 1 < d.path.length && d.path[i + 1][0] === 'lineTo' && inCanvas(a[1], a[2])) streaks++;
        if (d.kind === 'fill' && (a[0] === 'rect' || a[0] === 'arc') && inCanvas(a[1], a[2])) dots++;
      }
    });
    return {streaks: streaks, dots: dots};
  }
  function luminance(style) { var m = /rgb\((\d+),(\d+),(\d+)\)/.exec(style); return m ? 0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3] : NaN; }

  // ── Fixtures ──────────────────────────────────────────────────────────────
  function startEndless(seed, counter) {
    var next = lcg(seed * 7919 + 13), used = false;
    Math.random = function () { if (counter) counter.n++; if (!used) { used = true; return (seed - 0.5) / 999999; } return next(); };
    G.CAVE_TEST_MODE = false; G.ENDLESS_MODE = true; G.running = true; G.gameOverState = false;
    G.menuOpen = G.settingsOpen = G.shopOpen = G.inventoryOpen = G.forgeOpen = G.overviewActive = false;
    G.MODE3D = true; G.CAM_FOLLOW = true; G.settings.particles = 25;
    G.resetEndlessMode();
    if (G.WORLD_SEED !== seed) throw Error('SETUP world seed ' + G.WORLD_SEED + ' is not ' + seed);
    G.settings.dayNight = true; G.dayTime = 0.5; G.daySpeed = 0;
    G.startGameClock(); G.clearGameplayInput(); G.updateDayNight(0);
    G.USE_KEYBOARD = true; G.USE_MOUSE = true; G.USE_GAMEPAD = false; G.CONTROL_MODE = G.MODE_STICK_AIM;
  }
  function startCave(view) {
    G._caveTestSeedOverride = 12345; G._caveTestKindOverride = 'descending';
    G.CAVE_TEST_MODE = true; G.ENDLESS_MODE = true; G.running = true; G.gameOverState = false; G.terrain = 'plains';
    G.menuOpen = G.settingsOpen = G.shopOpen = G.inventoryOpen = G.forgeOpen = G.overviewActive = false;
    Object.keys(G.caveTestFlags).forEach(function (k) { G.caveTestFlags[k] = false; });
    G.resetEndlessMode(); G.MODE3D = true; G.CAM_FOLLOW = true; G.settings.particles = 25;
    G.settings.dayNight = true; G.dayTime = 0.5; G.daySpeed = 0;
    G.startGameClock(); G.clearGameplayInput();
    G.USE_KEYBOARD = true; G.USE_MOUSE = true; G.USE_GAMEPAD = false; G.CONTROL_MODE = G.MODE_STICK_AIM;
    if (view) G.previewCaveView(view);
  }
  // Authored floors (12 u cells). layers(m, ci, gx, gy) fills a cell.
  function authoredMesh(N, layers) {
    var m = {w: N, h: N, gridSize: GS, layerCount: new Uint8Array(N * N)};
    for (var l = 0; l < 5; l++) { m['l' + l + 'Type'] = new Uint8Array(N * N); m['l' + l + 'TopZ'] = new Float64Array(N * N); m['l' + l + 'Meta'] = new Uint8Array(N * N); }
    for (var gy = 0; gy < N; gy++) for (var gx = 0; gx < N; gx++) layers(m, gy * N + gx, gx, gy);
    return m;
  }
  function authoredScene(m, cx, cy, ang) {
    var N = m.w;
    G.floorMesh = m; G.ENDLESS_MODE = false; G.CAVE_TEST_MODE = false;
    G.cell = GS; G.gridW = G.gridH = N; G.grid = new Uint8Array(N * N); G.gridCave = null;
    G.wallHeights = G.wallFaceBase = G.wallMaxTopZ = null;
    G.deepCaveRegions = []; G.windowOriginX = G.windowOriginY = 0;
    G.pos = {x: cx, y: cy, floorZ: 60}; G.cam = {x: cx, y: cy, z: 60, ang: ang || 0, pitch: 0, fov: G.GAME_CONFIG.player.baseFov};
    G.viewCam = {x: cx - G.canvas.width / 2, y: cy - G.canvas.height / 2};
    G.MODE3D = true; G.CAM_FOLLOW = true; G.playerUnderground = false; G.terrain = 'plains'; G.level = 1;
    G.renderSurfaceAmbient = 0.9; G.renderCameraCaveBlend = 0; G.renderPresentationAlpha = 1; G.settings.particles = 25;
    G._lightGrid = null;                                                     // no torch light from an earlier world
  }
  function flatMesh(N) { return authoredMesh(N, function (m, i) { m.layerCount[i] = 1; m.l0Type[i] = 1; m.l0Meta[i] = 1; }); }
  function fresh(seed, opts) { return (G.fxState = G.createFxState((opts && opts.cap) || 3072, seed, Object.assign({pinned: true}, opts || {}))); }
  function ticks(n, dt) { for (var k = 0; k < n; k++) G.updateEffects(dt || DT); }
  function byRecipe(S) {
    var out = {};
    for (var i = 0; i < S.count; i++) { var id = S.C.LIST[S.rec[i]].id; out[id] = (out[id] || 0) + 1; }
    return out;
  }
  function liveOf(S, id, withDying) {
    var r = S.C.ID[id], n = 0;
    for (var i = 0; i < S.count; i++) if (S.rec[i] === r && (withDying || !(S.flags[i] & 16))) n++;
    return n;
  }
  function weatherLive(S) { var n = 0; for (var i = 0; i < S.count; i++) if (S.cls[i] === 0) n++; return n; }
  // A weather kind's population as the field keeps it: its members counted
  // after the tick's refill (rain loses about 6% of its drops to the floor
  // in the same tick's integrate pass, after the field ran).
  function kept(kind) { return G.getEffectStats().fields.weather[kind]; }
  function toggle(v) { G.setEffectToggle('fxWeather', v); }
  function restoreToggles() { G.EFFECT_TOGGLE_DEFS.forEach(function (d) { G.setEffectToggle(d.key, d.default); }); }
  // Births: fxSpawn is wrapped (the engine calls it by its global name).
  var births = null, realSpawn = G.fxSpawn;
  G.fxSpawn = function (S, r) {
    var i = realSpawn.apply(G, arguments);
    if (i >= 0 && births) births.push({id: S.C.LIST[r].id, x: S.x[i], y: S.y[i], z: S.z[i], vx: S.vx[i], vy: S.vy[i], vz: S.vz[i],
      seed: S.seedA[i], windX: S.weather.windX, windY: S.weather.windY, count: S.count, B: S.B, cls: S.cls[i], t: S.simTime});
    return i;
  };
  function failures() { var f = G.getEffectStats().failures, n = 0; for (var k in f) n += f[k]; return n; }
  // Steals by the stealing class (fxSteal is wrapped: the engine calls it by its global name).
  var steals = null, realSteal = G.fxSteal;
  G.fxSteal = function (S, c) {
    var n = S.stats.stolen, got = realSteal.apply(G, arguments);
    if (steals && S.stats.stolen > n) steals.push({by: c, from: S.stolenByClass.slice()});
    return got;
  };
  var liveState = G.fxState;

  // ── H1: rain never falls through a roof; it lands on the open sky of its
  // own column. Authored 61 x 61 floor, camera at the cave edge looking +y:
  // open floor (0 u) for x < 360; a cave (floor 0, ceiling 1 H, cap 1.4 H =
  // 35 u, under the 1.5 H snow line) for x >= 360; a 3 x 3 block of grid
  // walls 60 u tall on the open side; and a classic level's capless cave
  // (floor 0 and a ceiling at 1.2 H = 30 u, no walkable cap: 03-level-
  // generation.js) over cells 22-28 x 26-31, whose rock roof is the sky.
  // Oracles: the authored heights.
  function roofScene() {
    var m = authoredMesh(61, function (m, i, gx, gy) {
      m.layerCount[i] = 1; m.l0Type[i] = 1; m.l0Meta[i] = 1;
      if (gx >= 30) { m.layerCount[i] = 3; m.l1Type[i] = 2; m.l1TopZ[i] = 1; m.l2Type[i] = 4; m.l2TopZ[i] = 1.4; m.l2Meta[i] = 3; }
      else if (gx >= 22 && gx <= 28 && gy >= 26 && gy <= 31) { m.layerCount[i] = 2; m.l1Type[i] = 2; m.l1TopZ[i] = 1.2; }
    });
    authoredScene(m, 366, 250, Math.PI / 2);
    G.wallHeights = new Float32Array(61 * 61);
    for (var gy = 22; gy <= 24; gy++) for (var gx = 24; gx <= 26; gx++) { G.grid[gy * 61 + gx] = 1; G.wallHeights[gy * 61 + gx] = 0.25; }
  }
  function capless(gx, gy) { return gx >= 22 && gx <= 28 && gy >= 26 && gy <= 31; }
  function roofSupport(x, y) {
    var gx = Math.floor(x / GS), gy = Math.floor(y / GS);
    if (gx >= 24 && gx <= 26 && gy >= 22 && gy <= 24) return 60;
    return gx >= 30 ? 35 : capless(gx, gy) ? 30 : 0;
  }
  if (needed('H1', ['--weather-lowest-layer', '--wall-top-kills-rest', '--walkable-only-sky', '--side-entry-climbs'])) run('H1 roofs and wall tops', function () {
    roofScene(); toggle('rain');
    var S = fresh(101), splash = {left: [], right: [], wall: [], roof: []}, below = [], spawnBad = [], rainBirths = 0;
    births = [];
    try {
      for (var k = 0; k < 400; k++) {
        G.updateEffects(DT);
        var rR = S.C.ID['weather.rain'];
        for (var i = 0; i < S.count; i++) {
          if (S.rec[i] !== rR) continue;
          var cap = S.x[i] >= 372 ? 35 : capless(Math.floor(S.x[i] / GS), Math.floor(S.y[i] / GS)) ? 30 : NaN;
          if (S.z[i] < cap - 0.01) below.push({x: r3(S.x[i]), y: r3(S.y[i]), z: r3(S.z[i]), roof: cap, tick: k});
        }
      }
    } finally { var b = births; births = null; }
    b.forEach(function (p) {
      var gx = Math.floor(p.x / GS), gy = Math.floor(p.y / GS), sup = roofSupport(p.x, p.y);
      if (p.id === 'weather.rain') {
        rainBirths++;
        if (!(p.z - sup >= 70 - 1e-6 && p.z - sup <= 150 + 1e-6)) spawnBad.push({x: r3(p.x), y: r3(p.y), z: r3(p.z), support: sup});
      }
      if (p.id !== 'weather.splash') return;
      var at = {x: r3(p.x), y: r3(p.y), z: r3(p.z)};
      if (sup === 60) splash.wall.push(at); else if (gx >= 31) splash.right.push(at);
      else if (capless(gx, gy)) splash.roof.push(at); else if (gx <= 28 && !(gx >= 21 && gy >= 25 && gy <= 32)) splash.left.push(at);
    });
    function off(list, z) { return list.filter(function (p) { return !near(p.z, z, 0.01); }); }
    var rightBad = off(splash.right, 35), roofBad = off(splash.roof, 30), leftBad = off(splash.left, 0), wallBad = off(splash.wall, 60);
    check('the H1 fixture rains on both sides of the cave edge, on the capless roof and on the wall block', splash.left.length >= 30 &&
      splash.right.length >= 30 && splash.roof.length >= 30 && splash.wall.length >= 5 && rainBirths >= 1000,
      {left: splash.left.length, right: splash.right.length, caplessRoof: splash.roof.length, wall: splash.wall.length, rainBirths: rainBirths});
    check('rain never falls through a roof', !rightBad.length && !below.length,
      {seed: 101, cap: 35, splashesRight: splash.right.length, bad: rightBad.length, first: rightBad.slice(0, 3), dropsBelowRoof: below.length, firstBelow: below.slice(0, 2), tolerance: 0.01});
    check('rain ends on a capless cave roof (floor and ceiling layers only), never inside the cave', !roofBad.length && !below.some(function (p) { return p.roof === 30; }),
      {seed: 101, roof: 30, splashes: splash.roof.length, bad: roofBad.length, first: roofBad.slice(0, 3),
        dropsUnderRoof: below.filter(function (p) { return p.roof === 30; }).slice(0, 2), tolerance: 0.01});
    check('rain lands on the open floor and on wall tops', !leftBad.length && !wallBad.length,
      {left: splash.left.length, leftBad: leftBad.slice(0, 3), wall: splash.wall.length, wallBad: wallBad.slice(0, 3), floor: 0, wallTop: 60});
    check("rain spawns 70-150 u above its own column's open sky", rainBirths > 0 && !spawnBad.length, {births: rainBirths, bad: spawnBad.length, first: spawnBad.slice(0, 3)});
    // Snow settles on the open sky of its column: 0.3 u over wall tops,
    // caps and the capless roof, never under a roof; the positive control is
    // the open floor.
    toggle('snow'); S = fresh(102);
    var rested = {left: {}, right: {}, wall: {}, roof: {}}, restBad = [], rS = S.C.ID['weather.snow'];
    for (k = 0; k < 900; k++) {
      G.updateEffects(DT);
      if (k % 10) continue;
      for (i = 0; i < S.count; i++) {
        if (S.rec[i] !== rS || !(S.flags[i] & 1)) continue;
        var sup = roofSupport(S.x[i], S.y[i]), side = sup === 60 ? 'wall' : sup === 30 ? 'roof' : Math.floor(S.x[i] / GS) >= 30 ? 'right' : 'left';
        rested[side][S.seedA[i]] = 1;
        if (!near(S.z[i], sup + 0.3, 0.01)) restBad.push({x: r3(S.x[i]), y: r3(S.y[i]), z: r3(S.z[i]), support: sup});
      }
    }
    var n = {left: Object.keys(rested.left).length, right: Object.keys(rested.right).length, wall: Object.keys(rested.wall).length,
      roof: Object.keys(rested.roof).length};
    check('snow settles on the open sky of its column: floors, caps, capless roofs and wall tops', n.left >= 20 && n.right >= 20 && n.wall >= 5 &&
      n.roof >= 5 && !restBad.length, {seed: 102, rested: n, bad: restBad.length, first: restBad.slice(0, 3), tolerance: 0.01});
    // Wind blowing toward the cave: flakes that drift sideways into its
    // roofed columns below the cap end there; none climbs onto the cap (a
    // settle more than 1 u, plus its 0.3 u rest lift, above where the flake
    // was a tick before).
    // (approaching: before a tick, a falling flake in the last open column
    // below the cap's height, blown toward it).
    S = fresh(103);
    var climbs = [], approaching = 0, tracked = {};
    for (k = 0; k < 600; k++) {
      S.weather.wx0 = S.weather.wx1 = 25; S.weather.wy0 = S.weather.wy1 = 0;          // a steady wind toward +x (the cave)
      tracked = {};
      for (i = 0; i < S.count; i++) {
        tracked[S.seedA[i]] = S.z[i];
        if (S.rec[i] === rS && !(S.flags[i] & 1) && S.x[i] >= 348 && S.x[i] < 360 && S.z[i] > 1 && S.z[i] < 34 && S.vx[i] > 0) approaching++;
      }
      G.updateEffects(DT);
      for (i = 0; i < S.count; i++) {
        var was = tracked[S.seedA[i]];
        if (S.rec[i] !== rS || was === undefined) continue;
        if ((S.flags[i] & 1) && S.z[i] > was + 1.3 + 1e-9) climbs.push({x: r3(S.x[i]), from: r3(was), to: r3(S.z[i]), rest: true});
      }
    }
    check('snow blown sideways into a higher column never climbs onto it', approaching >= 100 && !climbs.length,
      {seed: 103, wind: [25, 0], approaching: approaching, climbs: climbs.length, first: climbs.slice(0, 3)});
    restoreToggles(); G.fxState = liveState;
  });

  // ── H1 (classic): a classic level's deep caves have a floor and a ceiling
  // layer but no walkable cap (03-level-generation.js), so their rock roof
  // ends the sky: rain and ash spawn over it, land or settle on it, and never
  // fall into the cave. Classic Expanse (the first expanse level, seeded), a
  // camera 80 u outside and 10 u inside the first corridor's mouth looking
  // along it. Forced rain snows there (the roofs are above the snow line),
  // so every weather member counts. Oracles: getCaveSpaceAt (a ceiling
  // above a member's height in its cell: inside a cave) with that ceiling
  // on its triangle (spatialLayerCorners, the drawn roof), and the mesh's
  // own layers.
  if (needed('H1 classic', ['--walkable-only-sky', '--weather-lowest-layer'])) run('H1 classic', function () {
    var idx = -1;
    for (var li = 0; li < G.levels.length && idx < 0; li++) if (G.levels[li].terrain === 'expanse') idx = li;
    if (idx < 0) throw Error('SETUP H1 classic: no expanse level');
    Math.random = lcg(4242);
    G.ENDLESS_MODE = false; G.CAVE_TEST_MODE = false; G.running = true; G.gameOverState = false; G.terrain = 'expanse';
    G.menuOpen = G.settingsOpen = G.shopOpen = G.inventoryOpen = G.forgeOpen = G.overviewActive = false;
    G.MODE3D = true; G.CAM_FOLLOW = true; G.settings.particles = 25;
    try { G.resetLevel(idx + 1); } finally { Math.random = originalRandom; }
    G.settings.dayNight = true; G.dayTime = 0.5; G.daySpeed = 0; G.updateDayNight(0);
    var m = G.floorMesh, ceilings = 0, caps = 0;
    for (var ci = 0; ci < m.w * m.h; ci++) for (var l = 0; l < m.layerCount[ci]; l++) {
      if (m['l' + l + 'Type'][ci] === 2) ceilings++;
      if (m['l' + l + 'Type'][ci] === 4) caps++;
    }
    var reg = G.deepCaveRegions[0];
    if (!reg || ceilings < 1000 || caps) throw Error('SETUP H1 classic: ' + JSON.stringify({regions: G.deepCaveRegions.length, ceilings: ceilings, caps: caps}));
    var dx = reg.x2 - reg.x1, dy = reg.y2 - reg.y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, rows = [], inside = [];
    // The ceiling getCaveSpaceAt finds over height h at (x, y), on its
    // triangle (the 0->3 split), spatial Z; NaN where no ceiling covers h.
    function roofAt(x, y, h) {
      var c = G.getCaveSpaceAt(x, y, h);
      if (!c.underground || c.cellIdx < 0) return NaN;
      for (var l = 0; l < m.layerCount[c.cellIdx]; l++) {
        if (m['l' + l + 'Type'][c.cellIdx] !== 2 || m['l' + l + 'TopZ'][c.cellIdx] !== c.ceilingH) continue;
        var k = G.spatialLayerCorners(m, c.cellIdx, l), tx = x / m.gridSize - c.cellIdx % m.w, ty = y / m.gridSize - Math.floor(c.cellIdx / m.w);
        if (!k) return c.ceilingH * 25;
        return 25 * (tx >= ty ? k[0] + tx * (k[1] - k[0]) + ty * (k[3] - k[1]) : k[0] + ty * (k[2] - k[0]) + tx * (k[3] - k[2]));
      }
      return c.ceilingH * 25;                                                   // a cap as the roof: flat
    }
    [['outside', 80], ['mouth', -10]].forEach(function (where) {
      G.pos.x = reg.x1 - ux * where[1]; G.pos.y = reg.y1 - uy * where[1];
      G.cam.x = G.pos.x; G.cam.y = G.pos.y; G.cam.ang = Math.atan2(uy, ux); G.cam.pitch = 0;
      ['rain', 'ash'].forEach(function (kind) {
        toggle(kind); var S = fresh(111), samples = 0, overRoof = 0, spawnLow = [];
        births = [];
        try {
          for (var k = 0; k < 240; k++) {
            G.updateEffects(DT);
            if (k % 20) continue;
            for (var i = 0; i < S.count; i++) {
              if (S.cls[i] !== 0) continue;
              samples++;
              var roof = roofAt(S.x[i], S.y[i], S.z[i] / 25);
              if (S.z[i] < roof - 0.01 && inside.length < 400) inside.push({where: where[0], id: S.C.LIST[S.rec[i]].id, x: r3(S.x[i]), y: r3(S.y[i]), z: r3(S.z[i]),
                roof: r3(roof), rest: !!(S.flags[i] & 1)});
            }
          }
        } finally { var b = births; births = null; }
        b.forEach(function (p) {
          if (p.cls !== 0 || p.id === 'weather.splash') return;             // weather members (not the ambient field)
          var roof = roofAt(p.x, p.y, -100);                                    // a roof over this column
          if (roof !== roof) return;
          overRoof++;
          if (!(p.z >= roof + 40 - 1e-6)) spawnLow.push({id: p.id, x: r3(p.x), y: r3(p.y), z: r3(p.z), roof: r3(roof)});
        });
        rows.push({where: where[0], kind: kind, samples: samples, spawnedOverRoof: overRoof, spawnedUnderRoof: spawnLow.length, first: spawnLow.slice(0, 2)});
      });
    });
    restoreToggles(); G.fxState = liveState;
    check('the H1 classic fixture has capless cave roofs and spawns weather over them', rows.every(function (r) { return r.samples >= 1000 && r.spawnedOverRoof >= 30; }),
      {level: idx + 1, ceilingLayers: ceilings, caps: caps, rows: rows});
    check('weather never falls into a classic cave (its capless roof ends the sky)', !inside.length && rows.every(function (r) { return !r.spawnedUnderRoof; }),
      {level: idx + 1, inside: inside.length, first: inside.slice(0, 3), rows: rows});
  });

  // ── H1 (generated): Cave Test seed 12345 from outside the mouth and above
  // the chamber: every rain splash lies where a body falling from the sky
  // lands by the game's own physics: the highest walkable layer that no
  // ceiling covers (getWalkableLayerTopAt from far above, 06-floor-queries)
  // on its triangle (sampleSpatialSupportZ at that layer), or a surface
  // wall's top where higher (getWallTopZ; the surface player walks over a
  // cave's wall cells, 09-physics.js); never under a roof (getCaveSpaceAt)
  // nor below the highest walkable surface (buried). Forced rain (auto is
  // clear in Cave Test).
  if (needed('H1 generated', ['--weather-lowest-layer', '--cave-wall-as-wall'])) run('H1 generated', function () {
    var all = [], bad = [], roofed = 0, caveWall = 0, overCaveWall = [];
    function landing(x, y) {
      var fall = G.getWalkableLayerTopAt(x, y, 1e4, {stepUp: 0}), z = NaN;
      if (fall.action === 'fall') z = G.sampleSpatialSupportZ(x, y, fall.topH * 25, false);
      var gx = Math.floor(x / G.cell), gy = Math.floor(y / G.cell), wi = gy * G.gridW + gx;
      if (!(G.gridCave && G.gridCave[wi])) {
        var wall = G.getWallTopZ(x, y);                                        // player Z (0: no wall)
        if (wall > 0) { var wz = G.spatialWallSpan(gx, gy).topZ; if (!(z >= wz)) z = wz; }
      }
      return z;
    }
    ['mouth', 'above'].forEach(function (view) {
      startCave(view); toggle('rain'); G.fxReset('world'); G.fxPrime();
      births = [];
      try { for (var k = 0; k < 300; k++) G.runSimulationTick(DT); } finally { var b = births; births = null; }
      b.forEach(function (p) {
        if (p.id !== 'weather.splash') return;
        all.push(p);
        var sky = landing(p.x, p.y), under = G.getCaveSpaceAt(p.x, p.y, p.z / 25).underground, top = G.sampleSpatialSupportZ(p.x, p.y, NaN, false);
        var gx = Math.floor(p.x / G.cell), gy = Math.floor(p.y / G.cell), wi = gy * G.gridW + gx;
        if (G.gridCave && G.grid[wi] && G.gridCave[wi]) { caveWall++; var span = G.spatialWallSpan(gx, gy); if (span) overCaveWall.push(r3(span.topZ - p.z)); }
        if (G.getCaveSpaceAt(p.x, p.y, -100).underground) roofed++;           // a roof somewhere over this column
        if (!near(p.z, sky, 0.01) || under || p.z < top - 0.01) bad.push({view: view, x: r3(p.x), y: r3(p.y), z: r3(p.z), landing: r3(sky), under: under, buried: p.z < top - 0.01});
      });
    });
    check('the generated H1 fixture splashes over cave roofs and cave wall cells', all.length >= 200 && roofed >= 20 && caveWall >= 5,
      {splashes: all.length, overRoofedColumns: roofed, overCaveWallCells: caveWall});
    check('generated rain lands on the open sky of its column, never under a roof', !bad.length,
      {seed: 12345, splashes: all.length, bad: bad.length, first: bad.slice(0, 3), caveWallTopMinusSplash: overCaveWall.slice(0, 5), tolerance: 0.01});
    restoreToggles(); G.fxState = liveState;
  });

  // ── H2: weather fades underground and shows from a cave mouth. Counted
  // as particles in the pool after the tick (non-dying, and with the dying
  // ones), for rain and for snow, whose flakes outlive a second: the field
  // itself must fade a kind's excess when its target falls (a cave mouth, a
  // lower Particles setting), rain would hide that by dying on its own.
  if (needed('H2', ['--ignore-underground', '--weather-zero-underground', '--no-excess-cull', '--weather-unoccluded'])) run('H2 underground', function () {
    authoredScene(flatMesh(61), 366, 250, Math.PI / 2);
    // Oracle: population x (1 - smoothstep(0.5, 1, blend)), restated.
    function vis(b) { var u = Math.max(0, Math.min(1, (b - 0.5) / 0.5)); return 1 - u * u * (3 - 2 * u); }
    var POP = {rain: 600, snow: 450};
    function rowsOf(kind, seed) {
      toggle(kind); var S = fresh(seed), id = 'weather.' + kind, rows = {};
      function at(name, blend, n, P) {
        G.renderCameraCaveBlend = blend; G.playerUnderground = blend > 0; G.settings.particles = P || 25;
        ticks(n);
        rows[name] = {blend: blend, P: P || 25, target: kept(kind).target, pool: liveOf(S, id), withDying: liveOf(S, id, true)};
      }
      try {
        at('surface', 0, 120); at('half', 0.5, 120); at('quarter', 0.75, 60); at('surface2', 0, 240); at('fewer', 0, 60, 10);
        at('surface3', 0, 240); at('deep', 1, 60);
      } finally { G.renderCameraCaveBlend = 0; G.playerUnderground = false; G.settings.particles = 25; }
      Object.keys(rows).forEach(function (k) {
        var r = rows[k];
        r.want = Math.floor(POP[kind] * r.P / 25 * vis(r.blend) + 1e-9);
        r.ok = r.target === r.want && r.pool >= Math.floor(0.95 * r.want) && r.pool <= r.want + 1 && r.withDying <= r.want + 1;
      });
      return rows;
    }
    var rain = rowsOf('rain', 201), snow = rowsOf('snow', 202);
    function ok(rows, names) { return names.every(function (n) { return rows[n].ok; }); }
    check('the surface is full', ok(rain, ['surface', 'surface2', 'surface3']) && ok(snow, ['surface', 'surface2', 'surface3']),
      {rain: [rain.surface, rain.surface2, rain.surface3], snow: [snow.surface, snow.surface2, snow.surface3]});
    check('weather at the cave-mouth blend 0.5 keeps at least 80% of the surface population', rain.half.pool >= 0.8 * rain.surface.pool &&
      snow.half.pool >= 0.8 * snow.surface.pool && rain.half.ok && snow.half.ok, {rain: rain.half, snow: snow.half});
    check('weather population follows the cave-mouth visibility', rain.quarter.ok && snow.quarter.ok, {rain: rain.quarter, snow: snow.quarter});
    check('weather population follows a lower Particles setting within the cull fade', rain.fewer.ok && snow.fewer.ok, {rain: rain.fewer, snow: snow.fewer});
    check('weather is gone within a second deep underground (blend 1)', rain.deep.withDying === 0 && rain.deep.target === 0 &&
      snow.deep.withDying === 0 && snow.deep.target === 0, {rain: rain.deep, snow: snow.deep});
    // Cave Test: walk from outside the mouth until playerUnderground flips,
    // then one cell (12 u) further, and look back out; the real tick
    // computes the blend. A real frame is recorded.
    startCave('mouth'); toggle('rain'); G.fxReset('world'); G.fxPrime();
    var net = G.endlessCaveNetworks['0,0'], e = net.entrances[0], flip = null, k;
    G.kbState.up = true;
    try {
      for (k = 0; k < 600; k++) {
        G.cam.ang = e.angle; G.runSimulationTick(DT);
        if (!flip && G.playerUnderground) flip = {x: G.pos.x, y: G.pos.y};
        if (flip && Math.hypot(G.pos.x - flip.x, G.pos.y - flip.y) >= 12) break;
      }
    } finally { G.kbState.up = false; }
    if (!flip) throw Error('SETUP H2 walk never entered the cave');
    G.vel.x = G.vel.y = 0;
    for (k = 0; k < 60; k++) { G.cam.ang = e.angle + Math.PI; G.vel.x = G.vel.y = 0; G.runSimulationTick(DT); }
    var draws = frame(), mouth = rainDrawn(draws, 'ambientFX3D'), st = G.getEffectStats();
    var inside = {under: G.playerUnderground, blend: r3(G.renderCameraCaveBlend), visibility: r3(st.weather.visibility),
      live: st.fields.weather.rain.live, streaks: mouth.streaks, farDots: mouth.dots};
    check('the view from 1 cell inside a cave mouth draws the rain outside', inside.under && inside.streaks >= 50,
      {seed: 12345, view: 'mouth +1 cell, looking out', inside: inside});
    // No drawn rain lies over the cave's own rock, seen from 90 u inside
    // looking out through the entrance (the 'back' preview, the real tick's
    // blend): each streak piece is matched to the drop whose projected
    // streak (head, and the point streakSeconds 0.028 back along its
    // velocity, restated) holds both of its ends within 0.75 px; the scene
    // depth must not be 2 u or more in front of the drop (inverse depth is
    // linear on screen) at either end, each taken one sample spacing inside
    // the piece (the segment test's tolerance at an edge, C3: len / (k - 1),
    // k = clamp(ceil(len / 4), 2, 9) over the drop's whole streak), or at its
    // middle when it is shorter than two spacings. Prerequisite: drops behind
    // the rock (both ends hidden by that rule) as well as drawn ones.
    G.previewCaveView('back');
    for (k = 0; k < 60; k++) G.runSimulationTick(DT);
    draws = frame();
    var C = G.getCam3D(), W = G._sceneDepthW, S = G.fxState, drops = [], rR = S.C.ID['weather.rain'];
    function proj(x, y, z) {
      var dx = x - G.cam.x, dy = y - G.cam.y, fwd = dx * C.cosAng + dy * C.sinAng;
      if (fwd < 1) return null;
      var rgt = -dx * C.sinAng + dy * C.cosAng;
      return {x: (rgt / fwd * C.invTanHalf * 0.5 + 0.5) * C.w, y: C.horizonY + (C.cameraZ - z) / fwd * G.projScale, iz: 1 / fwd};
    }
    function sceneInv(x, y) { var px = Math.floor(x), py = Math.floor(y); return px >= 0 && py >= 0 && px < W && py < G._sceneDepthH ? G._sceneDepthInv[py * W + px] : 0; }
    function hiddenAt(x, y, iz) { var inv = sceneInv(x, y); return inv > 0 && 1 / inv < 1 / iz - 2; }
    for (var i = 0; i < S.count; i++) {
      if (S.rec[i] !== rR || (S.flags[i] & 16)) continue;
      var h = proj(S.x[i], S.y[i], S.z[i]), t = proj(S.x[i] - S.vx[i] * 0.028, S.y[i] - S.vy[i] * 0.028, S.z[i] - S.vz[i] * 0.028);
      if (h && t) drops.push({h: h, t: t});
    }
    var pieces = [], matched = 0, overRock = [], behind = 0;
    draws.forEach(function (d) {
      if (d.stage !== 'ambientFX3D' || d.kind !== 'stroke' || RAIN_STYLES.indexOf(d.style) < 0) return;
      for (var q = 0; q + 1 < d.path.length; q++) if (d.path[q][0] === 'moveTo' && d.path[q + 1][0] === 'lineTo') pieces.push([d.path[q][1], d.path[q][2], d.path[q + 1][1], d.path[q + 1][2]]);
    });
    function along(p, x, y) {                                                   // param and distance of (x, y) on p's screen streak
      var ex = p.t.x - p.h.x, ey = p.t.y - p.h.y, l2 = ex * ex + ey * ey, u = l2 > 0 ? ((x - p.h.x) * ex + (y - p.h.y) * ey) / l2 : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      return {u: u, d: Math.hypot(p.h.x + ex * u - x, p.h.y + ey * u - y)};
    }
    drops.forEach(function (p) { if (hiddenAt(p.h.x, p.h.y, p.h.iz) && hiddenAt(p.t.x, p.t.y, p.t.iz)) behind++; });
    pieces.forEach(function (g) {
      for (var j = 0; j < drops.length; j++) {
        var p = drops[j], a = along(p, g[0], g[1]), b = along(p, g[2], g[3]);
        if (a.d > 0.75 || b.d > 0.75) continue;
        matched++;
        var full = Math.hypot(p.t.x - p.h.x, p.t.y - p.h.y), ks = Math.min(9, Math.max(2, Math.ceil(full / 4))), du = full > 0 ? 1 / (ks - 1) : 0;
        var lo = Math.min(a.u, b.u), hi = Math.max(a.u, b.u), probe = hi - lo > 2 * du ? [lo + du, hi - du] : [(lo + hi) / 2];
        if (probe.some(function (u) { return hiddenAt(p.h.x + (p.t.x - p.h.x) * u, p.h.y + (p.t.y - p.h.y) * u, p.h.iz + (p.t.iz - p.h.iz) * u); }))
          overRock.push(g.map(r3));
        return;
      }
    });
    check('no rain seen through a cave mouth is drawn over the rock around it', pieces.length >= 20 && matched >= 0.9 * pieces.length && behind >= 20 &&
      !overRock.length, {seed: 12345, view: 'back (90 u inside, looking out)', blend: r3(G.renderCameraCaveBlend), pieces: pieces.length, matched: matched,
        dropsBehindRock: behind, overRock: overRock.length, first: overRock.slice(0, 3), depthMargin: 2});
    G.previewCaveView('chamber');
    for (k = 0; k < 60; k++) G.runSimulationTick(DT);
    var deep = rainDrawn(frame(), 'ambientFX3D'), dst = G.getEffectStats();
    check('the deep chamber has no weather', G.playerUnderground && dst.fields.weather.rain.live === 0 && deep.streaks + deep.dots === 0,
      {blend: r3(G.renderCameraCaveBlend), live: dst.fields.weather.rain.live, drawn: deep});
    restoreToggles(); G.fxState = liveState;
  });

  // ── H3: peaks snow while valleys rain (the per-drop snow line), each at
  // its own density, and the biome picks the kind. Prerequisite (spec):
  // seed 424242 has a box with columns on both sides of snowLineH. The
  // height histogram of its spawn window (highest walkable surface of every
  // mesh cell, mesh H) is recorded as evidence (an INFO line) for the
  // snowLineH calibration; the value itself is the lead's call.
  if (needed('H3', ['--no-snowline', '--swap-fills-rain-set', '--swap-always'])) run('H3 snow line', function () {
    startEndless(424242);
    var m = G.floorMesh, hs = [], line = G.FX_WEATHER_RULES.snowLineH;
    for (var ci = 0; ci < m.w * m.h; ci++) {
      var best = -Infinity;
      for (var l = 0; l < m.layerCount[ci]; l++) {
        var t = m['l' + l + 'Type'][ci], h = m['l' + l + 'TopZ'][ci];
        if ((t === 1 || t === 3 || t === 4) && Number.isFinite(h) && h > best) best = h;
      }
      if (best > -Infinity) hs.push(best);
    }
    hs.sort(function (a, b) { return a - b; });
    function q(p) { return r3(hs[Math.min(hs.length - 1, Math.floor(p * hs.length))]); }
    var histogram = {cells: hs.length, q10: q(0.1), q25: q(0.25), q50: q(0.5), q75: q(0.75), q84: q(0.84), q90: q(0.9), q95: q(0.95), max: q(1),
      above: r3(hs.filter(function (h) { return h >= line; }).length / hs.length)};
    // The box nearest the spawn with 30-70% of its columns above the line.
    var spot = null;
    for (var cx = 400; cx < 3000; cx += 120) for (var cy = 400; cy < 3000; cy += 120) {
      var n = 0, hi = 0;
      for (var dx = -200; dx <= 200; dx += 24) for (var dy = -200; dy <= 200; dy += 24) {
        var z = G.sampleSpatialSupportZ(cx + dx, cy + dy, NaN, false);
        if (Number.isFinite(z)) { n++; if (z / 25 >= line) hi++; }
      }
      var d = Math.hypot(cx - G.pos.x, cy - G.pos.y);
      if (n && hi / n >= 0.3 && hi / n <= 0.7 && (!spot || d < spot.d)) spot = {x: cx, y: cy, share: r3(hi / n), d: r3(d)};
    }
    output('INFO H3 seed 424242 surface heights (mesh H) ' + JSON.stringify({snowLineH: line, histogram: histogram, box: spot}));
    check('seed 424242 has a box with columns on both sides of the snow line (the H3 prerequisite)', !!spot && histogram.above > 0 && histogram.above < 1,
      {snowLineH: line, histogram: histogram, box: spot});
    if (!spot) throw Error('SETUP H3 found no box with columns on both sides of the snow line');
    function place(x, y) {
      G.pos.x = x; G.pos.y = y; G.cam.x = x; G.cam.y = y - 90; G.cam.ang = Math.PI / 2; G.playerUnderground = false; G.renderCameraCaveBlend = 0;
    }
    place(spot.x, spot.y); toggle('rain');
    var S = fresh(303), rows = {rain: 0, snow: 0, rainHigh: [], snowLow: [], other: {}};
    births = [];
    try { ticks(240); } finally { var b = births; births = null; }
    b.forEach(function (p) {
      var H = G.sampleSpatialSupportZ(p.x, p.y, NaN, false) / 25;              // the highest walkable surface (shared helper)
      if (p.id === 'weather.rain') { rows.rain++; if (!(H < line)) rows.rainHigh.push(r3(H)); }
      else if (p.id === 'weather.snow') { rows.snow++; if (!(H >= line)) rows.snowLow.push(r3(H)); }
      else if (p.id !== 'weather.splash') rows.other[p.id] = (rows.other[p.id] || 0) + 1;
    });
    check('peaks snow while valleys rain', rows.rain >= 200 && rows.snow >= 50 && !rows.rainHigh.length && !rows.snowLow.length,
      {seed: 424242, snowLineH: line, rain: rows.rain, snow: rows.snow, rainAboveLine: rows.rainHigh.slice(0, 5), snowBelowLine: rows.snowLow.slice(0, 5),
        swaps: S.stats.weatherSnowLine});
    // Live members by the column under them (the shared helper), sampled
    // every 30 ticks over 5 s after 10 s of forced weather in the same box:
    // rain over the valleys against rain with the snow line out of reach
    // (snowLineH 99); rain's snow (all of it: born over the peaks, some has
    // blown over the valleys) against forced snow over the peaks.
    function density(kind, lineH, seed) {
      var saved = G.FX_WEATHER_RULES.snowLineH, out = {kind: kind, snowLineH: lineH, rainLow: 0, snowHigh: 0, snowAll: 0, samples: 0};
      G.FX_WEATHER_RULES.snowLineH = lineH; toggle(kind);
      var Sd = fresh(seed);
      try {
        ticks(600);
        for (var k = 0; k < 300; k++) {
          G.updateEffects(DT);
          if (k % 30) continue;
          out.samples++;
          for (var i = 0; i < Sd.count; i++) {
            if (Sd.cls[i] !== 0 || (Sd.flags[i] & 16)) continue;
            var id = Sd.C.LIST[Sd.rec[i]].id, H = G.sampleSpatialSupportZ(Sd.x[i], Sd.y[i], NaN, false) / 25;
            if (id === 'weather.rain' && H < line) out.rainLow++;
            if (id === 'weather.snow' && H >= line) out.snowHigh++;
            if (id === 'weather.snow') out.snowAll++;
          }
        }
      } finally { G.FX_WEATHER_RULES.snowLineH = saved; }
      out.rainLow = r3(out.rainLow / out.samples); out.snowHigh = r3(out.snowHigh / out.samples); out.snowAll = r3(out.snowAll / out.samples);
      return out;
    }
    var mixed = density('rain', line, 305), noLine = density('rain', 99, 305), snowRef = density('snow', line, 306);
    check("valleys keep rain's density where peaks snow (live members)", noLine.rainLow >= 100 && mixed.rainLow >= 0.9 * noLine.rainLow &&
      mixed.rainLow <= 1.1 * noLine.rainLow, {box: spot, mixed: mixed, noSnowLine: noLine, share: r3(mixed.rainLow / noLine.rainLow)});
    check("the peaks snow at forced snow's density (live members)", snowRef.snowHigh >= 50 && mixed.snowAll >= 0.85 * snowRef.snowHigh &&
      mixed.snowAll <= 1.15 * snowRef.snowHigh, {box: spot, mixed: mixed, forcedSnow: snowRef, ratio: r3(mixed.snowAll / snowRef.snowHigh)});
    // The biome picks the kind: the dev 'biome' force keeps the schedule's
    // kind rule and makes the front active.
    function biome(terrain) {
      G.terrain = terrain; var Sb = fresh(304); G.effectWeatherForce('biome', 1);
      births = [];
      try { ticks(120); } finally { var bb = births; births = null; }
      var out = {};
      bb.forEach(function (p) { if (/^weather\./.test(p.id)) out[p.id] = (out[p.id] || 0) + 1; });
      return out;
    }
    toggle('auto'); authoredScene(flatMesh(61), 366, 250, Math.PI / 2);      // 0 H: every column below the line
    var ice = biome('ice'), expanse = biome('expanse'), plains = biome('plains');
    function only(o, ids) { return Object.keys(o).length > 0 && Object.keys(o).every(function (id) { return ids.indexOf(id) >= 0; }); }
    check('ice gives snow, the expanse ash, other biomes rain', only(ice, ['weather.snow']) && only(expanse, ['weather.ash', 'weather.cinder']) &&
      (expanse['weather.cinder'] || 0) > 0 && only(plains, ['weather.rain', 'weather.splash']), {ice: ice, expanse: expanse, plains: plains});
    restoreToggles(); G.fxState = liveState;
  });

  // ── H4: weather is a pure function of the seed and the sim time.
  // Samples each whole sim second: front, its roll, intensity and wind,
  // the three levels and the wind. Oracles: other runs (step size, clock
  // origin, seed) and the spec's bounds.
  // Seed 2 (the first of seeds 1-59 found by scanning, S7) holds three
  // fronts, a clear and an active stretch in its first 600 s of plains; each
  // case asserts that prerequisite at 60 Hz.
  var SCHEDULE_SEED = 2;
  function activeSeconds(sc) { return sc.filter(function (s) { return Math.max(s[5], s[6], s[7]) > 0; }).length; }
  // The game clock starts at `origin` ms (default 5e6; Date.now at a session
  // start in the live game) and advances with the ticks, as runSimulationTick does.
  function schedule(seed, hz, seconds, opts) {
    var o = opts || {};
    G._gameClockOriginMs = o.origin === undefined ? 5e6 : o.origin; G._gameClockElapsedMs = 0;
    var S = fresh(seed, {cap: 64}), per = hz, out = [];
    for (var k = 1; k <= seconds * per; k++) {
      G.advanceGameClock(1 / hz); G.updateEffects(1 / hz);
      if (k % per) continue;
      var W = S.weather;
      out.push([W.front, W.roll, W.frontI, W.start, W.end, W.level[0], W.level[1], W.level[2], W.windX, W.windY]);
    }
    return out;
  }
  function sameSamples(a, b, tol) {
    if (a.length !== b.length) return {length: [a.length, b.length]};
    for (var i = 0; i < a.length; i++) for (var j = 0; j < a[i].length; j++) {
      if (!(j === 0 ? a[i][j] === b[i][j] : near(a[i][j], b[i][j], tol))) return {second: i + 1, field: j, a: a[i].map(r3), b: b[i].map(r3)};
    }
    return null;
  }
  if (needed('H4', ['--weather-wall-clock', '--tick-keyed-weather', '--no-crossfade', '--crossfade-rate', '--no-wind-ease', '--chance-const'])) run('H4 schedule', function () {
    var savedOrigin = G._gameClockOriginMs, savedElapsed = G._gameClockElapsedMs;
    G._gameClockOriginMs = 5e6; G._gameClockElapsedMs = 0;
    authoredScene(flatMesh(31), 180, 180, 0); G.settings.particles = 0; toggle('auto');
    try {
      var scheduleSeed = SCHEDULE_SEED;
      var a60 = schedule(scheduleSeed, 60, 600), a60b = schedule(scheduleSeed, 60, 600);
      var a120 = schedule(scheduleSeed, 120, 600), shifted = schedule(scheduleSeed, 60, 600, {origin: 5e6 + 987654321});
      var active = activeSeconds(a60);
      check('the H4 schedule has fronts, clear and active stretches in 600 s', a60[a60.length - 1][0] >= 2 && active >= 60 && active <= 540,
        {seed: scheduleSeed, fronts: a60[a60.length - 1][0] + 1, activeSeconds: active});
      var d60 = sameSamples(a60, a60b, 0), d120 = sameSamples(a60, a120, 1e-9), dClock = sameSamples(a60, shifted, 0);
      check('weather is a pure function of seed and sim time', !d60 && !d120 && !dClock,
        {seed: scheduleSeed, sameSeed: d60, at120Hz: d120, otherClockOrigin: dClock, tolerance: 1e-9});
      // Twenty fronts of two seeds (1 s steps), and the spec's bounds on each.
      function fronts(seed) {
        G._gameClockOriginMs = 5e6; G._gameClockElapsedMs = 0;
        var list = [], S = fresh(seed, {cap: 64});
        for (var guard = 0; list.length < 20 && guard < 7000; guard++) {        // 20 fronts last at most 6,000 s
          G.advanceGameClock(1); G.updateEffects(1);
          var W = S.weather;
          if (!list.length || list[list.length - 1].front !== W.front) list.push({front: W.front, start: W.start, end: W.end, roll: W.roll, i: W.frontI, wind: Math.hypot(W.wx1, W.wy1)});
        }
        return list;
      }
      var fa = fronts(scheduleSeed), fb = fronts(scheduleSeed + 1), boundsBad = [];
      fa.concat(fb).forEach(function (f, j) {
        var dur = f.end - f.start;
        if (!(dur >= 120 && dur <= 300) || !(f.i >= 0.35 && f.i <= 1) || !(f.wind >= 4 - 1e-9 && f.wind <= 30 + 1e-9) || (f.front === 0 && f.start !== 0)) boundsBad.push(f);
      });
      var differ = fa.filter(function (f, j) { return !fb[j] || f.end !== fb[j].end || f.roll !== fb[j].roll || f.i !== fb[j].i; }).length;
      check('fronts last 2-5 minutes of sim time from sim time 0, at intensities 0.35-1 and winds 4-30 u/s', fa.length === 20 && fb.length === 20 &&
        !boundsBad.length && fa[0].start === 0,
        {bad: boundsBad.slice(0, 3), first: fa.slice(0, 3)});
      check('a different seed differs in at least 1 of 20 fronts', differ >= 1, {seeds: [scheduleSeed, scheduleSeed + 1], differ: differ});
      // Cave Test: auto is clear; outside it the same seed is active.
      G.CAVE_TEST_MODE = true;
      var cave = schedule(scheduleSeed, 1, 600);
      G.CAVE_TEST_MODE = false;
      var caveActive = cave.filter(function (s) { return Math.max(s[5], s[6], s[7]) > 0; }).length;
      check('Cave Test auto weather is clear', caveActive === 0 && active > 0, {seed: scheduleSeed, caveActiveSeconds: caveActive, outsideActiveSeconds: active});
      // Crossfades and the wind ease, every 60 Hz tick of 1,500 s of plains
      // (spec 9.1, restated): the goal is the front's intensity when its roll
      // is under plains' chance 0.5, else 0; when it changes, the level eases
      // linearly from where it was to the new goal over 8 s (halfway at 4 s,
      // there one tick after 8 s), never faster than 1/8 a second; the wind
      // eases from the last front's to the new one's over 10 s (the midpoint
      // at 5 s). The game clock advances with the ticks, as runSimulationTick does.
      function tick(dt) { G.advanceGameClock(dt); G.updateEffects(dt); }
      G._gameClockOriginMs = 5e6; G._gameClockElapsedMs = 0;
      var S = fresh(scheduleSeed, {cap: 64}), W = S.weather, prev = null, steps = [], fades = [], winds = [], fade = null;
      for (var k = 1; k <= 1500 * 60; k++) {
        tick(DT);
        var lv = W.level[0], goal = W.roll < 0.5 ? W.frontI : 0, t = S.simTime - W.start;
        if (prev !== null && Math.abs(lv - prev.lv) > DT / 8 + 1e-9) steps.push({t: r3(S.simTime), from: r3(prev.lv), to: r3(lv)});
        if (prev !== null && prev.front !== W.front && Math.abs(prev.goal - goal) > 1e-9) fade = {front: W.front, from: prev.lv, to: goal};
        if (fade && fade.front === W.front) {
          var mid = (fade.from + fade.to) / 2, tol = Math.abs(fade.to - fade.from) * DT / 8 + 1e-9;
          if (Math.abs(t - 4) < DT / 2) fade.at4 = {level: r3(lv), want: r3(mid), ok: Math.abs(lv - mid) <= tol};
          if (Math.abs(t - 8 + DT) < DT / 2) fade.before8 = {level: r3(lv), ok: Math.abs(lv - fade.to) > 1e-12};
          if (Math.abs(t - 8 - DT) < DT / 2) { fade.after8 = {level: r3(lv), ok: Math.abs(lv - fade.to) <= 1e-9}; fades.push(fade); fade = null; }
        }
        if (W.front > 0 && Math.abs(t - 5) < DT / 2) {
          var mx = (W.wx0 + W.wx1) / 2, my = (W.wy0 + W.wy1) / 2, wtol = Math.hypot(W.wx1 - W.wx0, W.wy1 - W.wy0) * DT / 10 + 1e-9;
          winds.push({front: W.front, wind: [r3(W.windX), r3(W.windY)], mid: [r3(mx), r3(my)], ok: near(W.windX, mx, wtol) && near(W.windY, my, wtol)});
        }
        prev = {lv: lv, front: W.front, goal: goal};
      }
      var fadeBad = fades.filter(function (f) { return !(f.at4 && f.at4.ok && f.before8.ok && f.after8.ok); });
      check('a front change crossfades each level over 8 s and eases the wind over 10 s', !steps.length && fades.length >= 2 && !fadeBad.length &&
        winds.length >= 2 && winds.every(function (w) { return w.ok; }),
        {seed: scheduleSeed, fasterThanAnEighthASecond: steps.slice(0, 3), crossfades: fades.length, badCrossfades: fadeBad.slice(0, 2), winds: winds.slice(0, 3)});
      // A biome change mid-front crossfades the kinds with the same roll:
      // plains' rain eases out and ice's snow in over the same 8 s.
      G._gameClockOriginMs = 5e6; G._gameClockElapsedMs = 0;
      S = fresh(scheduleSeed, {cap: 64}); W = S.weather; G.terrain = 'plains';
      for (k = 0; k < 7200 * 60 && !(W.roll < 0.5 && S.simTime - W.start >= 10 && W.end - S.simTime >= 20); k++) tick(DT);
      if (!(W.roll < 0.5)) throw Error('SETUP H4 found no active plains front for the biome change');
      var I = W.frontI, t0 = S.simTime, biome = [];
      G.terrain = 'ice';
      try {
        for (k = 1; k <= 9 * 60; k++) {
          tick(DT);
          var dt0 = S.simTime - t0;
          if (Math.abs(dt0 - 4) < DT / 2 || Math.abs(dt0 - (8 + DT)) < DT / 2)
            biome.push({t: r3(dt0), rain: r3(W.level[0]), snow: r3(W.level[1]), want: dt0 < 6 ? [r3(I / 2), r3(I / 2)] : [0, r3(I)],
              ok: dt0 < 6 ? near(W.level[0], I / 2, I * DT / 8 + 1e-9) && near(W.level[1], I / 2, I * DT / 8 + 1e-9) : W.level[0] === 0 && near(W.level[1], I, 1e-9)});
        }
      } finally { G.terrain = 'plains'; }
      check('a biome change crossfades the kinds over 8 s', biome.length === 2 && biome.every(function (b) { return b.ok; }),
        {seed: scheduleSeed, intensity: r3(I), front: W.front, rows: biome});
      // Each biome's chance (restated from spec 9.1): a front is active in it
      // exactly when its roll is under the chance, over at least 10 fronts,
      // one of them rolling between 0.3 and 0.65 (where the chances differ).
      var CHANCE = {ground: 0.45, plains: 0.5, forest: 0.6, cave: 0.3, ice: 0.65, expanse: 0.35}, chanceBad = [], perBiome = {};
      Object.keys(CHANCE).forEach(function (b) {
        G._gameClockOriginMs = 5e6; G._gameClockElapsedMs = 0;
        G.terrain = b; var Sb = fresh(scheduleSeed, {cap: 64}), done = {}, n = 0, between = 0;
        for (var k2 = 0; k2 < 3000; k2++) {
          tick(1);
          var Wb = Sb.weather;
          if (done[Wb.front] || Sb.simTime - Wb.start < 20) continue;
          done[Wb.front] = 1; n++;
          if (Wb.roll >= 0.3 && Wb.roll <= 0.65) between++;
          var on = Math.max(Wb.level[0], Wb.level[1], Wb.level[2]) > 0;
          if (on !== (Wb.roll < CHANCE[b])) chanceBad.push({biome: b, front: Wb.front, roll: r3(Wb.roll), active: on});
        }
        perBiome[b] = {fronts: n, rollsBetween: between};
      });
      G.terrain = 'plains';
      check("auto weather follows each biome's chance", !chanceBad.length && Object.keys(perBiome).every(function (b) { return perBiome[b].fronts >= 10 && perBiome[b].rollsBetween >= 1; }),
        {seed: scheduleSeed, perBiome: perBiome, bad: chanceBad.slice(0, 4)});
    } finally { G._gameClockOriginMs = savedOrigin; G._gameClockElapsedMs = savedElapsed; G.CAVE_TEST_MODE = false; G.terrain = 'plains'; restoreToggles(); G.settings.particles = 25; G.fxState = liveState; }
  });

  // ── Wind across a front change (forced snow, Particles 25): from 3 s
  // before front 1 starts to 9 s after, the wind eases linearly from front
  // 0's to front 1's over 10 s (restated). A falling flake's horizontal
  // velocity obeys dv/dt = drag (coupling w(t) - v) from coupling w(birth)
  // (the analytic ramp response, restated): on the ramp it lags coupling
  // w(t) by coupling a tau (1 - exp(-(t - max(birth, ramp start)) / tau)),
  // a the ramp's slope, tau = 1 / drag (snow: coupling 0.8, drag 0.8).
  // Tolerance: the tick's wind is held for the tick (coupling |a| dt).
  if (needed('wind front', ['--no-wind-ease', '--wind-at-rest'])) run('wind across a front', function () {
    authoredScene(flatMesh(61), 366, 250, Math.PI / 2); toggle('snow');
    var S = fresh(SCHEDULE_SEED), W = S.weather, c = 0.8, tau = 1 / 0.8, born = {}, rows = [], bad = [];
    G.updateEffects(DT);
    S.simTime = W.end - 3;
    births = [];
    try {
      for (var k = 0; k < 12 * 60; k++) {
        G.updateEffects(DT);
        births.forEach(function (p) { born[p.seed] = p.t; }); births.length = 0;
        var t = S.simTime - W.start;
        if (W.front !== 1 || [2, 4, 6, 8].every(function (s) { return Math.abs(t - s) >= DT / 2; })) continue;
        var ax = (W.wx1 - W.wx0) / 10, ay = (W.wy1 - W.wy0) / 10, e = Math.min(1, Math.max(0, t / 10)), n = 0, worst = 0, rS = S.C.ID['weather.snow'];
        for (var i = 0; i < S.count; i++) {
          if (S.rec[i] !== rS || (S.flags[i] & 17) || born[S.seedA[i]] === undefined) continue;
          var since = S.simTime - Math.max(born[S.seedA[i]], W.start), lag = since > 0 ? tau * (1 - Math.exp(-since / tau)) : 0;
          var wantX = c * (W.wx0 + (W.wx1 - W.wx0) * e) - c * ax * lag, wantY = c * (W.wy0 + (W.wy1 - W.wy0) * e) - c * ay * lag;
          var off = Math.hypot(S.vx[i] - wantX, S.vy[i] - wantY);
          n++; worst = Math.max(worst, off);
          if (off > c * Math.hypot(ax, ay) * DT * 2 + 1e-6 && bad.length < 3) bad.push({t: r3(t), v: [r3(S.vx[i]), r3(S.vy[i])], want: [r3(wantX), r3(wantY)]});
        }
        rows.push({t: r3(t), falling: n, worst: r3(worst)});
      }
    } finally { births = null; }
    var change = Math.hypot(W.wx1 - W.wx0, W.wy1 - W.wy0);
    check('falling snow follows the wind through drag across a front change', change >= 5 && rows.length === 4 && rows.every(function (r) { return r.falling >= 100; }) &&
      !bad.length, {seed: SCHEDULE_SEED, windChange: r3(change), wind0: [r3(W.wx0), r3(W.wy0)], wind1: [r3(W.wx1), r3(W.wy1)], rows: rows, bad: bad,
        tolerance: 'coupling |a| 2 dt'});
    restoreToggles(); G.fxState = liveState;
  });

  // ── B15: schedules and refill caps do not depend on the step size. The
  // schedule of SCHEDULE_SEED over 600 s at 60 and at 120 Hz (auto, plains,
  // Particles 0); then forced rain from an empty field (Particles 0 for the
  // first tick, then 25), at 60 and 120 Hz: spawns by 0.05-0.2 s against
  // each other and against the turnover rate restated from the spec
  // (600 / (110 / 420 s) x 1.25 a second).
  if (needed('B15', ['--refill-per-tick-ceil', '--tick-keyed-weather'])) run('B15 step size', function () {
    var savedOrigin = G._gameClockOriginMs, savedElapsed = G._gameClockElapsedMs;
    try {
      authoredScene(flatMesh(31), 180, 180, 0); G.settings.particles = 0; toggle('auto');
      var a60 = schedule(SCHEDULE_SEED, 60, 600), a120 = schedule(SCHEDULE_SEED, 120, 600), d = sameSamples(a60, a120, 1e-9);
      check('the weather schedule does not depend on the step size', !d && a60[a60.length - 1][0] >= 2 && activeSeconds(a60) >= 60,
        {seed: SCHEDULE_SEED, fronts: a60[a60.length - 1][0] + 1, activeSeconds: activeSeconds(a60), firstDifference: d, tolerance: 1e-9});
    } finally { G._gameClockOriginMs = savedOrigin; G._gameClockElapsedMs = savedElapsed; restoreToggles(); G.settings.particles = 25; }
    function refill(hz) {
      authoredScene(flatMesh(61), 366, 250, Math.PI / 2); toggle('rain');
      var S = fresh(1501), out = [];
      G.settings.particles = 0; G.updateEffects(1 / hz); G.settings.particles = 25;
      var s0 = S.stats.weatherSpawned;
      for (var k = 1; k <= hz / 5; k++) { G.updateEffects(1 / hz); if (k % (hz / 20) === 0) out.push(S.stats.weatherSpawned - s0); }
      return out;
    }
    var r60 = refill(60), r120 = refill(120), rate = 600 / (110 / 420) * 1.25, bad = [];
    r60.forEach(function (n, j) {
      var t = 0.05 * (j + 1), want = rate * t;
      if (Math.abs(n - r120[j]) > 1 || Math.abs(n - want) > 1) bad.push({t: t, at60Hz: n, at120Hz: r120[j], rateTimesT: r3(want)});
    });
    check('refill per second does not depend on the step size (within 1 spawn)', r60.length === 4 && r60[3] > 400 && !bad.length,
      {at60Hz: r60, at120Hz: r120, perSecond: r3(rate), bad: bad});
    restoreToggles(); G.fxState = liveState;
  });

  // ── The box, splashes and prewarm (spec 4.7, 9.1, restated): rain spawns
  // in the 400 u box centred 90 u ahead of the sim camera; a drop's floor
  // kill splashes with chance 0.45, only within 120 u of the camera; a
  // prewarm spreads rain over its fall (not all at its spawn height); a
  // refill held back (no open sky under the box) does not burst when the
  // sky returns: the allowance carries at most one tick's rate plus one.
  if (needed('box', ['--no-child-near', '--bias-zero', '--splash-chance-1', '--prewarm-no-fall', '--acc-uncapped'])) run('box and splashes', function () {
    authoredScene(flatMesh(61), 366, 250, Math.PI / 2); toggle('rain');
    var S = fresh(1901), ang = G.cam.ang, cx = G.cam.x + Math.cos(ang) * 90, cy = G.cam.y + Math.sin(ang) * 90, rR = S.C.ID['weather.rain'];
    G.updateEffects(DT);                                                      // the prewarm (the pool after it: flat floor at 0)
    var pre = [], low = 0;
    for (var i = 0; i < S.count; i++) if (S.rec[i] === rR) { pre.push(S.z[i]); if (S.z[i] < 70 - 1e-6) low++; }
    births = [];
    try { ticks(300); } finally { var b = births; births = null; }
    var rain = b.filter(function (p) { return p.id === 'weather.rain'; }), sp = b.filter(function (p) { return p.id === 'weather.splash'; });
    var outBox = rain.filter(function (p) { return Math.abs(p.x - cx) > 200 + 1e-6 || Math.abs(p.y - cy) > 200 + 1e-6; }).length;
    var far = sp.filter(function (p) { return Math.hypot(p.x - G.cam.x, p.y - G.cam.y) > 120 + 1e-6; }).length;
    // The share: splashes and drop births within 100 u (a drop drifts under 3 u while it falls).
    var nearBirths = rain.filter(function (p) { return Math.hypot(p.x - G.cam.x, p.y - G.cam.y) <= 100; }).length;
    var share = sp.filter(function (p) { return Math.hypot(p.x - G.cam.x, p.y - G.cam.y) <= 100; }).length / Math.max(1, nearBirths), halfBehind = rain.filter(function (p) { return (p.x - G.cam.x) * Math.cos(ang) + (p.y - G.cam.y) * Math.sin(ang) < -110 - 1e-6; }).length;
    check('rain spawns in the box 90 u ahead of the camera', rain.length >= 3000 && !outBox && !halfBehind, {births: rain.length, outsideBox: outBox, behind110: halfBehind, centre: [r3(cx), r3(cy)]});
    check('rain splashes with chance 0.45, only within 120 u of the camera', sp.length >= 300 && !far && share >= 0.4 && share <= 0.5,
      {splashes: sp.length, beyond120: far, dropsBornWithin100: nearBirths, share: r3(share)});
    check('a prewarm spreads rain over its fall', pre.length >= 300 && low >= 0.3 * pre.length, {prewarmed: pre.length, belowSpawnHeight: low});
    // No open sky under the box for a second (the camera far off the mesh), then back.
    S = fresh(1902); G.cam.x = -3000; G.cam.y = -3000; ticks(60);
    var held = liveOf(S, 'weather.rain'); G.cam.x = 366; G.cam.y = 250;
    var s0 = S.stats.weatherSpawned; G.updateEffects(DT); var burst = S.stats.weatherSpawned - s0, rate = 600 * DT / (110 / 420) * 1.25;
    check('a held-back refill does not burst when the sky returns', held === 0 && burst >= 1 && burst <= Math.floor(2 * rate + 1),
      {heldBack: held, firstTick: burst, max: Math.floor(2 * rate + 1)});
    restoreToggles(); G.fxState = liveState;
  });

  // ── Wall sides: a drop that hits a wall's side below its top dies there
  // (no splash); one that falls onto the top splashes on it. Drops written
  // into the pool (fxSpawn, then placed) beside the authored 60 u wall block
  // of H1, with the field's own rain off (cave-mouth visibility 0); seeds
  // chosen so the splash chance (restated: effectNoise(seed, 13) < 0.45) passes.
  if (needed('wall sides', ['--wall-side-splash'])) run('wall sides', function () {
    roofScene(); toggle('rain'); G.renderCameraCaveBlend = 1;
    var S = fresh(1911), rR = S.C.ID['weather.rain'], ctx = G._fxCtx, seeds = [];
    for (var sd = 1; seeds.length < 8; sd++) if (G.effectNoise(sd, 13) < 0.45) seeds.push(sd);
    G.updateEffects(DT);
    function drop(x, y, z, vx, vz, seed) {
      G.fxCtxReset(ctx); ctx.x = x; ctx.y = y; ctx.z = 0; ctx.sky = true; ctx.spec = S.R.colorSpec[rR];
      var i = G.fxSpawn(S, rR, 777, 0, 1, ctx);
      if (i < 0) throw Error('SETUP wall sides: a drop was refused (' + i + ')');
      S.x[i] = x; S.y[i] = y; S.z[i] = z; S.vx[i] = vx; S.vy[i] = 0; S.vz[i] = vz; S.seedA[i] = seed; S.gcell[i] = -1; S.age[i] = 0; S.life[i] = 1.4;
    }
    var west = 24 * GS, sideSplashes = 0, topSplashes = 0;
    for (var j = 0; j < 4; j++) {
      births = [];
      drop(west - 0.3, 270 + j * 6, 30, 60, -10, seeds[2 * j]);                // against the west face, 30 u below its top
      drop(west + 6, 270 + j * 6, 62, 0, -420, seeds[2 * j + 1]);              // above the top
      try { ticks(3); } finally { var b = births; births = null; }
      b.forEach(function (p) { if (p.id === 'weather.splash') { if (near(p.z, 60, 0.01) && p.x > west + 3) topSplashes++; else sideSplashes++; } });
    }
    check('rain against a wall side dies there; rain onto its top splashes', topSplashes === 4 && sideSplashes === 0, {onTop: topSplashes, fromSides: sideSplashes});
    G.renderCameraCaveBlend = 0; restoreToggles(); G.fxState = liveState;
  });

  // ── Wraps: a member leaving the box reappears on the far side at the same
  // height above its new column's open sky (a 20 degree ramp through 0 at
  // x = 480, restated), advanced by its own fall that tick; a settled one
  // leaves instead. The camera moves 120 u in x for one tick (snow).
  if (needed('wrap', ['--wrap-keep-z', '--wrap-rest'])) run('wrap', function () {
    var m = authoredMesh(61, function (m, i, gx) { m.layerCount[i] = 1; m.l0Type[i] = 1; m.l0Meta[i] = 1; m.l0TopZ[i] = (gx - 40) * GS * TAN20 / 25; });
    authoredScene(m, 300, 250, Math.PI / 2); toggle('snow');
    var S = fresh(1501); ticks(240);
    function sky(x) { return (x - 480) * TAN20; }
    var before = {};
    for (var i = 0; i < S.count; i++) if (S.cls[i] === 0) before[S.seedA[i]] = [S.x[i], S.z[i] - sky(S.x[i]), S.vz[i], S.flags[i] & 1];
    G.cam.x = 420; G.updateEffects(DT);
    var wraps = 0, bad = [], restedWrapped = 0, restedBefore = 0;
    Object.keys(before).forEach(function (k) { if (before[k][3]) restedBefore++; });
    for (i = 0; i < S.count; i++) {
      var w = before[S.seedA[i]];
      if (!w || Math.abs(S.x[i] - w[0]) < 300) continue;
      wraps++;
      if (w[3]) { restedWrapped++; continue; }
      var h = S.z[i] - sky(S.x[i]);
      if (!near(h, w[1] + w[2] * DT, 1.5)) bad.push({dx: r3(S.x[i] - w[0]), was: r3(w[1]), now: r3(h)});
    }
    check('a wrapped member keeps its height above its new column; a settled one leaves', wraps >= 20 && restedBefore >= 20 && !bad.length && !restedWrapped,
      {wraps: wraps, settledBefore: restedBefore, settledWrapped: restedWrapped, bad: bad.length, first: bad.slice(0, 3), tolerance: 1.5});
    restoreToggles(); G.fxState = liveState;
  });

  // ── H5: splashes lie on the terrain slope (the exact support triangle).
  // A 20 degree ramp through 0 at x = 480, below the snow line over the box.
  if (needed('H5', ['--splash-cell-constant'])) run('H5 slopes', function () {
    function splashes(ramp) {
      var m = authoredMesh(61, function (m, i, gx) { m.layerCount[i] = 1; m.l0Type[i] = 1; m.l0Meta[i] = 1; m.l0TopZ[i] = ramp ? (gx - 40) * GS * TAN20 / 25 : 0; });
      authoredScene(m, 366, 250, Math.PI / 2); toggle('rain'); fresh(ramp ? 501 : 502);
      births = [];
      try { ticks(300); } finally { var b = births; births = null; }
      var list = b.filter(function (p) { return p.id === 'weather.splash'; }), bad = [];
      list.forEach(function (p) { var want = ramp ? (p.x - 480) * TAN20 : 0; if (!near(p.z, want, 0.01)) bad.push({x: r3(p.x), z: r3(p.z), plane: r3(want)}); });
      return {n: list.length, bad: bad};
    }
    var ramp = splashes(true), flat = splashes(false);
    check('splashes lie on the terrain slope', ramp.n >= 30 && !ramp.bad.length, {slope: '20 deg', splashes: ramp.n, bad: ramp.bad.length, first: ramp.bad.slice(0, 3), tolerance: 0.01});
    check('splashes lie on flat ground', flat.n >= 30 && !flat.bad.length, {splashes: flat.n, bad: flat.bad.slice(0, 3)});
    restoreToggles(); G.fxState = liveState;
  });

  // ── H6: the Weather switch is honoured: off, each forced kind (and the
  // state names that kind), and the Legacy preset (Unified effects off).
  // Authored flat floor at 0 H (below the snow line), plains (auto would
  // rain or be clear, never snow or ash). Switched off mid-rain the sky is
  // calm (no wind: blown sand drifts the calm way). A dev force outlives a
  // world reset.
  if (needed('H6', ['--toggle-ignored', '--kind-first', '--off-keeps-wind', '--reset-drops-force'])) run('H6 switch', function () {
    function under(values) {
      authoredScene(flatMesh(61), 366, 250, Math.PI / 2);
      Object.keys(values).forEach(function (k) { G.setEffectToggle(k, values[k]); });
      var S = fresh(601);
      try { ticks(120); } finally { restoreToggles(); }
      var by = byRecipe(S), out = {};
      Object.keys(by).forEach(function (id) { if (/^weather\./.test(id)) out[id] = by[id]; });
      return {live: out, spawned: S.stats.weatherSpawned, kind: G.effectWeatherState().kind};
    }
    function only(r, ids) { return Object.keys(r.live).length > 0 && Object.keys(r.live).every(function (id) { return ids.indexOf(id) >= 0; }); }
    var off = under({fxWeather: 'off'}), rain = under({fxWeather: 'rain'}), snow = under({fxWeather: 'snow'}), ash = under({fxWeather: 'ash'});
    var legacy = under({fxWeather: 'rain', fxUnified: false});
    check('the Weather switch off leaves no weather', !Object.keys(off.live).length && off.spawned === 0, off);
    check('each forced kind shows only that kind', only(rain, ['weather.rain', 'weather.splash']) && (rain.live['weather.splash'] || 0) > 0 &&
      only(snow, ['weather.snow']) && only(ash, ['weather.ash', 'weather.cinder']) && (ash.live['weather.cinder'] || 0) > 0 &&
      rain.kind === 'rain' && snow.kind === 'snow' && ash.kind === 'ash', {rain: rain, snow: snow, ash: ash});
    check('the Legacy preset (Unified effects off) shows no weather', !Object.keys(legacy.live).length && legacy.spawned === 0, legacy);
    // Switched off mid-rain: every weather particle is gone within the cull fade, and the air is calm.
    authoredScene(flatMesh(61), 366, 250, Math.PI / 2); toggle('rain'); var S = fresh(602), W = S.weather;
    ticks(60); var before = liveOf(S, 'weather.rain'), windOn = Math.hypot(W.windX, W.windY); toggle('off');
    ticks(Math.ceil(G.EFFECT_CONFIG.cullFadeSeconds / DT) + 1);
    check('switching the weather off clears it within the cull fade and calms the wind', before >= 570 && windOn >= 4 && weatherLive(S) === 0 &&
      W.windX === 0 && W.windY === 0, {before: before, after: weatherLive(S), windBefore: r3(windOn), windAfter: [W.windX, W.windY]});
    // A dev force (console, fxBench) outlives a world reset.
    restoreToggles(); S = fresh(603); G.effectWeatherForce('snow', 0.5);
    try { ticks(10); G.fxReset('world', S); ticks(10); var kept2 = G.effectWeatherState(); } finally { G.effectWeatherForce(null); }
    check('a dev weather force outlives a world reset', kept2.force === 'snow' && kept2.kind === 'snow' && near(kept2.intensity, 0.5, 1e-12) &&
      kept2.target === 0.5, {state: {mode: kept2.mode, force: kept2.force, kind: kept2.kind, intensity: kept2.intensity}});
    restoreToggles(); G.fxState = liveState;
  });

  // ── H7: steady weather reaches its population, and populations follow
  // the Particles setting and the intensity (spec 6.1 table, restated): rain
  // 240/600/1440, snow 450 and ash 360 at 25, x intensity. Counted as
  // particles in the pool after the tick (non-dying: at least 95%; with the
  // dying ones: at most T + 1), from an empty field (Particles 0 for the
  // first tick). Intensity: a dev force at 0.5, and the auto schedule's
  // first active plains front of seed 2 (intensity 0.77).
  if (needed('H7', ['--refill-seconds-cap', '--no-intensity-scale', '--force-ignores-intensity'])) run('H7 population', function () {
    var POP = {rain: 600, snow: 450, ash: 360};
    function pools(S, kind) {
      var ids = kind === 'ash' ? ['weather.ash', 'weather.cinder'] : ['weather.' + kind];
      return {pool: ids.reduce(function (a, id) { return a + liveOf(S, id); }, 0), withDying: ids.reduce(function (a, id) { return a + liveOf(S, id, true); }, 0)};
    }
    function row(S, kind, P, I) {
      var f = kept(kind), p = pools(S, kind), want = Math.floor(POP[kind] * P / 25 * I + 1e-9);
      return {kind: kind, P: P, intensity: r3(I), target: f.target, want: want, pool: p.pool, withDying: p.withDying, share: r3(p.pool / f.target),
        ok: f.target === want && p.pool >= 0.95 * want && p.withDying <= want + 1};
    }
    function steady(kind, P, seconds, intensity) {
      authoredScene(flatMesh(61), 366, 250, Math.PI / 2); toggle(kind);
      var S = fresh(701);
      if (intensity !== undefined) G.effectWeatherForce(kind, intensity);
      try {
        G.settings.particles = 0; G.updateEffects(DT); G.settings.particles = P;
        ticks(60 * seconds);
        return row(S, kind, P, intensity === undefined ? 1 : intensity);
      } finally { G.settings.particles = 25; G.effectWeatherForce(null); }
    }
    // From empty, a refill at 1.25 x the turnover rate fills a kind in about
    // 0.8 of its mean life: rain 0.26 s, snow 2.1 s, ash 5 s.
    var medium = steady('rain', 25, 2), low = steady('rain', 10, 2), ultra = steady('rain', 60, 2), snow = steady('snow', 25, 4), ash = steady('ash', 25, 8);
    check('steady Medium rain reaches 95% of its population within 2 s', medium.ok, medium);
    check('weather populations follow the Particles setting', [low, ultra, snow, ash].every(function (r) { return r.ok; }), [low, ultra, snow, ash]);
    var half = steady('rain', 25, 2, 0.5);
    authoredScene(flatMesh(61), 366, 250, Math.PI / 2); toggle('auto'); G.terrain = 'plains';
    var S = fresh(SCHEDULE_SEED), W = S.weather;
    G.settings.particles = 0;
    try {
      for (var k = 0; k < 600 * 60 && !(W.roll < 0.5 && S.simTime - W.start >= 10); k++) G.updateEffects(DT);
      G.settings.particles = 25; ticks(120);
    } finally { G.settings.particles = 25; }
    var front = row(S, 'rain', 25, W.frontI);
    check('weather populations follow the intensity (a dev force, an auto front)', half.ok && half.target === 300 && front.ok && front.intensity < 0.9,
      {force: half, autoFront: front});
    restoreToggles(); G.fxState = liveState;
  });

  // ── H8: 2D rain spawns splashes only, at T / meanLife a second (T x
  // twoDScale, restated: 600 x 0.35 / (110 / 420 s)), inside the view
  // rectangle; snow is simulated at 0.35 x T. The 2D weather box is the view
  // plus its margin: members fade over the margin only, and a fullscreen
  // canvas (1440 x 900, 15 x the authored 360 x 240) is covered edge to edge
  // at 3 x the authored count (the cap), by snow and by splashes. Above the
  // snow line 2D rain is simulated snow instead of splashes.
  if (needed('H8', ['--simulate-2d-rain', '--2d-view-box', '--2d-no-snowline', '--2d-splash-rate-x3', '--fade-no-mask'])) run('H8 2D', function () {
    var W0 = G.canvas.width, H0 = G.canvas.height;
    authoredScene(flatMesh(61), 366, 366, Math.PI / 2); toggle('rain');
    var S = fresh(801);
    ticks(30);
    var in3D = liveOf(S, 'weather.rain');
    G.MODE3D = false; ticks(30);                                             // the 3D drops fade out (and splash) first
    births = [];
    try { ticks(120); } finally { var b = births; births = null; }
    var vx = G.viewCam.x, vy = G.viewCam.y, W = G.canvas.width, H = G.canvas.height, splashes = b.filter(function (p) { return p.id === 'weather.splash'; });
    var outside = splashes.filter(function (p) { return !(p.x >= vx && p.x <= vx + W && p.y >= vy && p.y <= vy + H); });
    var rainBirths = b.filter(function (p) { return p.id === 'weather.rain'; }).length, drops = liveOf(S, 'weather.rain', true);
    var draws = stage('fx2D', function () { G.drawEffectLayer2D(); }), rings = 0;
    draws.forEach(function (d) { if (d.kind === 'stroke') d.path.forEach(function (c) { if (c[0] === 'ellipse' && inCanvas(c[1], c[2])) rings++; }); });
    check('no rain drops are simulated in the 2D view', in3D >= 570 && drops === 0 && rainBirths === 0, {in3D: in3D, drops2D: drops, rainBirths2D: rainBirths});
    var rate = Math.floor(600 * 0.35) / (110 / 420), want = rate * 120 * DT;
    check('2D rain draws splashes across the view at T / meanLife a second', Math.abs(splashes.length - want) <= 0.02 * want && !outside.length && rings >= 20,
      {splashes: splashes.length, want: r3(want), outside: outside.length, ringsDrawn: rings});
    // Snow in 2D: simulated at twoDScale x T (0.35 x 450, restated); members
    // inside the view are fully shown, those in its margin fade.
    toggle('snow'); ticks(240);
    var snow2D = kept('snow'), snowPool = liveOf(S, 'weather.snow'), fadeBad = [], inMargin = 0;
    for (var i = 0; i < S.count; i++) {
      if (S.rec[i] !== S.C.ID['weather.snow']) continue;
      var f = G.fxFieldFade(S, S.owner[i], S.x[i], S.y[i]), inView = S.x[i] >= vx && S.x[i] <= vx + W && S.y[i] >= vy && S.y[i] <= vy + H;
      if (!inView) inMargin++;
      if (inView ? f !== 1 : !(f < 1)) fadeBad.push({x: r3(S.x[i] - vx), y: r3(S.y[i] - vy), fade: r3(f)});
    }
    check('2D snow is simulated at 0.35 of its population', snow2D.target === Math.floor(0.35 * 450) && snowPool >= snow2D.target - 3 && snowPool <= snow2D.target + 1,
      {field: snow2D, pool: snowPool, want: Math.floor(0.35 * 450)});
    check('2D snow is fully shown over the view and fades over its margin', inMargin >= 3 && !fadeBad.length, {inMargin: inMargin, bad: fadeBad.slice(0, 3)});
    // Back in 3D the rain refills at once: a prewarm, over two ticks because
    // the spawn cap is 384 a tick (spec 6.5).
    toggle('rain'); ticks(10); G.MODE3D = true; G.updateEffects(DT);
    var first = liveOf(S, 'weather.rain'); G.updateEffects(DT);
    check('back in 3D the rain refills at once (a prewarm within the spawn cap)', first >= 300 && liveOf(S, 'weather.rain') >= 570,
      {firstTick: first, secondTick: liveOf(S, 'weather.rain'), spawnCap: 384});
    // Fullscreen 2D: counts by ninths of the view (row-major), each at least
    // 40% of an even share.
    function ninths(list, vx0, vy0, w, h) {
      var n = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      list.forEach(function (p) {
        var cx = Math.floor((p.x - vx0) / w * 3), cy = Math.floor((p.y - vy0) / h * 3);
        if (cx >= 0 && cx < 3 && cy >= 0 && cy < 3) n[cy * 3 + cx]++;
      });
      return n;
    }
    authoredScene(flatMesh(161), 966, 966, Math.PI / 2);
    G.canvas.width = 1440; G.canvas.height = 900; G.viewCam = {x: 966 - 720, y: 966 - 450}; G.MODE3D = false;
    var big = {};
    try {
      toggle('snow'); var Sb = fresh(802); ticks(300);
      var flakes = [];
      for (i = 0; i < Sb.count; i++) if (Sb.rec[i] === Sb.C.ID['weather.snow'] && !(Sb.flags[i] & 16)) flakes.push({x: Sb.x[i], y: Sb.y[i]});
      big.snow = {target: kept('snow').target, want: Math.floor(450 * 0.35 * 3 + 1e-9), members: flakes.length, ninths: ninths(flakes, G.viewCam.x, G.viewCam.y, 1440, 900)};
      toggle('rain'); fresh(803); births = [];
      try { ticks(60); } finally { var bb = births; births = null; }
      var sp = bb.filter(function (p) { return p.id === 'weather.splash'; });
      big.rain = {splashes: sp.length, ninths: ninths(sp, G.viewCam.x, G.viewCam.y, 1440, 900)};
    } finally { G.canvas.width = W0; G.canvas.height = H0; G.MODE3D = true; }
    function even(r) { var t = r.ninths.reduce(function (a, v) { return a + v; }, 0); return t > 0 && r.ninths.every(function (v) { return v >= 0.4 * t / 9; }); }
    check('fullscreen 2D weather covers the view (snow and splashes by ninths)', big.snow.target === big.snow.want && big.snow.members >= 0.95 * big.snow.want &&
      even(big.snow) && big.rain.splashes >= 1000 && even(big.rain), big);
    // The 2D snow line: a floor at 3 H (above the 1.5 H line) for x >= 360.
    var m = authoredMesh(61, function (m, i, gx) { m.layerCount[i] = 1; m.l0Type[i] = 1; m.l0Meta[i] = 1; m.l0TopZ[i] = gx >= 30 ? 3 : 0; });
    authoredScene(m, 366, 366, Math.PI / 2); toggle('rain'); fresh(804); ticks(30); G.MODE3D = false;
    births = [];
    try { ticks(240); } finally { var b6 = births; births = null; G.MODE3D = true; }
    var line = G.FX_WEATHER_RULES.snowLineH * 25, high = function (p) { return G.sampleSpatialSupportZ(p.x, p.y, NaN, false) >= line; };
    var sn = b6.filter(function (p) { return p.id === 'weather.snow'; }), spl = b6.filter(function (p) { return p.id === 'weather.splash'; });
    var line2D = {snow: sn.length, snowBelowLine: sn.filter(function (p) { return !high(p); }).length, splashes: spl.length,
      splashesAboveLine: spl.filter(high).length, splashesBelowLine: spl.filter(function (p) { return !high(p); }).length};
    check('2D rain above the snow line is simulated snow, below it splashes', line2D.snow >= 20 && !line2D.snowBelowLine && !line2D.splashesAboveLine &&
      line2D.splashesBelowLine >= 100, line2D);
    G.MODE3D = true; restoreToggles(); G.fxState = liveState;
  });

  // ── Field edge fade (3D): a weather member fades over the outer edgeFade
  // (0.1) of its box's half size, 200 u (restated): alpha x d / 20 within 20
  // u of the edge, 1 inside. Forced snow (its owner holds its kind set).
  if (needed('edge fade', ['--fade-no-mask'])) run('edge fade', function () {
    authoredScene(flatMesh(61), 366, 250, Math.PI / 2); toggle('snow');
    var S = fresh(811), st = S.fields[S.C.FIELD_ID.weather], bad = [], band = 0, inner = 0;
    ticks(240);
    for (var i = 0; i < S.count; i++) {
      if (S.rec[i] !== S.C.ID['weather.snow']) continue;
      var d = Math.min(200 - Math.abs(S.x[i] - st.cx), 200 - Math.abs(S.y[i] - st.cy)), want = d >= 20 ? 1 : d > 0 ? d / 20 : 0, f = G.fxFieldFade(S, S.owner[i], S.x[i], S.y[i]);
      if (d < 20) band++; else inner++;
      if (!near(f, want, 1e-9)) bad.push({d: r3(d), fade: r3(f), want: r3(want)});
    }
    check('weather fades over the edge of its box', band >= 20 && inner >= 100 && !bad.length, {band: band, inner: inner, bad: bad.slice(0, 3)});
    restoreToggles(); G.fxState = liveState;
  });

  // ── Wind: weather starts at the air's speed and follows it through drag
  // (couplings restated from the spec: rain 0.35, snow 0.8); blown sand in
  // the expanse drifts with the weather wind when it blows.
  if (needed('wind', ['--wind-at-rest'])) run('wind', function () {
    authoredScene(flatMesh(61), 366, 250, Math.PI / 2);
    function born(kind, coupling) {
      toggle(kind); var S = fresh(901);
      births = [];
      try { ticks(180); } finally { var b = births; births = null; }
      var bad = [], n = 0;
      b.forEach(function (p) {
        if (p.id !== 'weather.' + kind) return;
        n++;
        if (!near(p.vx, p.windX * coupling, 1e-9) || !near(p.vy, p.windY * coupling, 1e-9)) bad.push({vx: r3(p.vx), vy: r3(p.vy), want: [r3(p.windX * coupling), r3(p.windY * coupling)]});
      });
      var W = S.weather, live = [], id = S.C.ID['weather.' + kind];
      for (var i = 0; i < S.count; i++) if (S.rec[i] === id && !(S.flags[i] & 1)) live.push(Math.hypot(S.vx[i] - W.windX * coupling, S.vy[i] - W.windY * coupling));
      var worst = live.reduce(function (a, b) { return Math.max(a, b); }, 0);
      return {kind: kind, births: n, bad: bad.length, first: bad.slice(0, 2), wind: r3(Math.hypot(W.windX, W.windY)), liveFalling: live.length, worstDrift: r3(worst)};
    }
    var snow = born('snow', 0.8), rain = born('rain', 0.35);
    check('rain and snow start at the wind speed and follow it', snow.births >= 200 && rain.births >= 1000 && snow.wind >= 4 && !snow.bad && !rain.bad &&
      snow.liveFalling >= 100 && snow.worstDrift <= 0.05, [snow, rain]);
    // Blown sand: every birth moves along the weather wind (auto, expanse).
    toggle('auto'); G.terrain = 'expanse'; var S = fresh(902);
    births = [];
    try { ticks(600); } finally { var b = births; births = null; }
    var sand = b.filter(function (p) { return p.id === 'ambient.sandDust'; }), off = 0, W = S.weather;
    sand.forEach(function (p) { var c = (p.vx * p.windX + p.vy * p.windY) / (Math.hypot(p.vx, p.vy) * Math.hypot(p.windX, p.windY)); if (!(c >= 0.95)) off++; });
    check('blown sand drifts with the weather wind', sand.length >= 30 && Math.hypot(W.windX, W.windY) >= 4 && off === 0,
      {births: sand.length, againstWind: off, wind: [r3(W.windX), r3(W.windY)]});
    restoreToggles(); G.fxState = liveState;
  });

  // ── Lighting by day and night: the same pool drawn at noon (surface
  // ambient 0.9) and at night (0.32), no tick between. Rain (lightGrid)
  // darkens by spriteLight (0.524 of noon, restated); snow keeps its colour
  // level rule and gains its night boost (x 1.1 alpha); cinders (emissive)
  // keep their colour and gain x 1.4 (capped at 1).
  if (needed('lighting', ['--rain-emissive', '--snow-no-night-boost', '--rain-ambient-light', '--ash-night-boost'])) run('lighting', function () {
    authoredScene(flatMesh(61), 366, 250, Math.PI / 2);
    function drawn(ambient) {
      G.renderSurfaceAmbient = ambient; G.beginSceneDepthFrame(G.canvas.width, G.canvas.height);
      return stage('ambientFX3D', function () { G.beginEffectFrame(); G.drawEffectLayer3D(0); });
    }
    // Per drawn item (a stroke's moveTo, a fill's arc or rect), its style's
    // luminance and its alpha, averaged.
    function styled(draws, styles, kind, acc) {
      var o = acc || {lum: 0, alpha: 0, n: 0};
      draws.forEach(function (d) {
        if (d.kind !== kind || styles.indexOf(d.style) < 0) return;
        var pieces = d.path.filter(function (c) { return kind === 'stroke' ? c[0] === 'moveTo' : c[0] === 'arc' || c[0] === 'rect'; }).length;
        o.lum += luminance(d.style) * pieces; o.alpha += d.alpha * pieces; o.n += pieces;
      });
      return o;
    }
    function mean(o) { return {n: o.n, lum: o.n ? r3(o.lum / o.n) : NaN, alpha: o.n ? r3(o.alpha / o.n) : NaN}; }
    toggle('rain'); fresh(1001); ticks(60);
    var rainDay = mean(styled(drawn(0.9), RAIN_STYLES, 'stroke')), rainNight = mean(styled(drawn(0.32), RAIN_STYLES, 'stroke'));
    var rainRatio = rainNight.lum / rainDay.lum;
    check('rain darkens at night (spriteLight of the surface ambient)', rainDay.n >= 50 && rainNight.n >= 50 && rainRatio >= 0.45 && rainRatio <= 0.65,
      {day: rainDay, night: rainNight, ratio: r3(rainRatio), spriteLight: 0.524});
    // Torchlight (lightGrid, spec 9.1): the same night pool under a light
    // grid of 0.6 everywhere (restated: + min(0.6, grid) to spriteLight 0.524,
    // level 7 of 8 instead of 3) draws brighter; ambient lighting would not.
    var saved = [G._lightGrid, G._lightGridW, G._lightGridH];
    var cells = Math.ceil(732 / G._lightCellSize);
    G._lightGrid = new Float32Array(cells * cells).fill(0.6); G._lightGridW = G._lightGridH = cells;
    try { var rainTorch = mean(styled(drawn(0.32), RAIN_STYLES, 'stroke')); } finally { G._lightGrid = saved[0]; G._lightGridW = saved[1]; G._lightGridH = saved[2]; }
    var torchRatio = rainTorch.lum / rainNight.lum;
    check('rain near torches catches their light at night (lightGrid)', rainTorch.n >= 50 && torchRatio >= 1.5, {night: rainNight, torchlit: rainTorch, ratio: r3(torchRatio)});
    toggle('snow'); fresh(1002); ticks(120);
    var snowDay = mean(styled(drawn(0.9), SNOW_STYLES, 'fill')), snowNight = mean(styled(drawn(0.32), SNOW_STYLES, 'fill'));
    var snowAlpha = snowNight.alpha / snowDay.alpha;
    check('snow gains its night boost', snowDay.n >= 50 && snowNight.n >= 50 && snowAlpha >= 1.04 && snowAlpha <= 1.16,
      {day: snowDay, night: snowNight, alphaRatio: r3(snowAlpha), boost: 1.1});
    // Cinders are 8% of the ash: Particles 60, and ten pairs of frames.
    toggle('ash'); G.settings.particles = 60; fresh(1003); ticks(120);
    var cd = null, cn = null, ad = null, an = null;
    for (var k = 0; k < 10; k++) {
      ticks(15);
      var dd = drawn(0.9), nn = drawn(0.32);
      cd = styled(dd, CINDER_STYLES, 'fill', cd); cn = styled(nn, CINDER_STYLES, 'fill', cn); ad = styled(dd, ASH_STYLES, 'fill', ad); an = styled(nn, ASH_STYLES, 'fill', an);
    }
    G.settings.particles = 25;
    var cinderDay = mean(cd), cinderNight = mean(cn), ashDay = mean(ad), ashNight = mean(an);
    check('cinders glow at night', cinderDay.n >= 20 && cinderNight.n >= 20 && cinderNight.lum === cinderDay.lum && cinderNight.alpha / cinderDay.alpha >= 1.15,
      {day: cinderDay, night: cinderNight});
    // Grey ash has no night boost (it would inherit snow's 0.1): its alpha is the same at night.
    check('ash does not brighten at night', ashDay.n >= 200 && ashNight.n >= 200 && Math.abs(ashNight.alpha / ashDay.alpha - 1) <= 0.02,
      {day: ashDay, night: ashNight, alphaRatio: r3(ashNight.alpha / ashDay.alpha)});
    G.renderSurfaceAmbient = 0.9; restoreToggles(); G.fxState = liveState;
  });

  // ── Crossing: weather members keep their world position across a real
  // chunk crossing (rebased with the window), and the field stays full.
  if (needed('crossing', ['--no-fx-rebase'])) run('crossing', function () {
    startEndless(424242); toggle('snow');
    var S = G.fxState, half = Math.floor(G.WINDOW_CHUNKS / 2), edge = (G.windowCX + half + 1) * G.CHUNK_SIZE - G.windowOriginX;
    G.pos.x = edge - 30; G.cam.x = G.pos.x; G.cam.y = G.pos.y; G.cam.ang = 0; G.vel.x = G.vel.y = 0;
    G.fxReset('world'); G.fxPrime();
    for (var k = 0; k < 120; k++) { G.cam.ang = 0; G.runSimulationTick(DT); }
    var crossing = null, ox = G.windowOriginX;
    G.kbState.up = true;
    try {
      for (k = 0; k < 400 && !crossing; k++) {
        var world = {};
        for (var i = 0; i < S.count; i++) if (S.cls[i] === 0) world[S.seedA[i]] = [S.x[i] + G.windowOriginX, S.y[i] + G.windowOriginY, Math.hypot(S.vx[i], S.vy[i])];
        G.cam.ang = 0; G.runSimulationTick(DT);
        if (G.windowOriginX === ox) continue;
        var moved = [], tracked = 0, wraps = 0, box = 2 * G.FX_FIELD_SOURCE.weather.box.half;
        for (i = 0; i < S.count; i++) {
          var w = world[S.seedA[i]];
          if (!w || S.cls[i] !== 0) continue;
          tracked++;
          // Explained: its own motion this tick, or that plus a wrap across
          // the box (its width in x and/or y); anything else jumped.
          var dx = S.x[i] + G.windowOriginX - w[0], dy = S.y[i] + G.windowOriginY - w[1], tol = w[2] * DT + 0.5, ok = false;
          for (var ox2 = -box; ox2 <= box && !ok; ox2 += box) for (var oy2 = -box; oy2 <= box && !ok; oy2 += box) {
            if (Math.hypot(dx - ox2, dy - oy2) <= tol) { ok = true; if (ox2 || oy2) wraps++; }
          }
          if (!ok) moved.push([r3(dx), r3(dy)]);
        }
        crossing = {shift: G.windowOriginX - ox, tracked: tracked, wraps: wraps, jumped: moved.length, first: moved.slice(0, 3), live: kept('snow').live};
      }
    } finally { G.kbState.up = false; }
    if (!crossing) throw Error('SETUP crossing walk never crossed the chunk edge');
    check('weather members keep their world position across a chunk crossing', crossing.shift === 480 && crossing.tracked >= 300 && crossing.jumped === 0 &&
      crossing.live >= 0.95 * 450, crossing);
    restoreToggles(); G.fxState = liveState;
  });

  // ── B1 (shipping weather): Math.random and presentationRandom are
  // recording throwers for 600 ticks of rain, snow and ash, with 3D and 2D
  // fx frames, in Endless seed 424242.
  if (needed('B1', ['--weather-math-random'])) run('B1 weather random isolation', function () {
    startEndless(424242); G.fxReset('world'); G.fxPrime();
    var calls = {random: 0, presentation: 0}, savedPR = G.presentationRandom, S = G.fxState, f0 = failures(), s0 = S.stats.weatherSpawned, c0 = S.stats.children;
    function thrower(kind) { return function () { calls[kind]++; throw Error('cosmetic draw from ' + kind); }; }
    G.beginSceneDepthFrame(G.canvas.width, G.canvas.height);
    Math.random = thrower('random'); G.presentationRandom = thrower('presentation');
    try {
      for (var k = 0; k < 600; k++) {
        if (k % 200 === 0) toggle(['rain', 'snow', 'ash'][k / 200]);
        G.MODE3D = k % 100 < 80;
        G.updateEffects(DT);
        if (G.MODE3D) { G.beginEffectFrame(); G.drawEffectLayer3D(1); G.drawEffectLayer3D(0); } else G.drawEffectLayer2D();
      }
    } finally { Math.random = originalRandom; G.presentationRandom = savedPR; G.MODE3D = true; restoreToggles(); }
    var spawned = S.stats.weatherSpawned - s0, children = S.stats.children - c0 + S.stats.weatherSplashes2D;
    check('cosmetic weather never reads Math.random or presentationRandom', !calls.random && !calls.presentation && failures() === f0 &&
      spawned >= 300 && children > 0, {seed: 424242, ticks: 600, calls: calls, failures: failures() - f0, spawned: spawned, splashes: children});
    G.fxState = liveState;
  });

  // ── B3 (shipping rain): feedback bursts are admitted when rain fills the
  // pool. Rain refills to B after the tick's landings, so a tick starts
  // with the pool at B: three pickups in one tick (two tomes and a stat, 42
  // particles) find no free slot below it. B3a capacity 512 with a 64
  // reserve (B = 448): the rain and the ambient field fill B (the refill is
  // refused by the budget; the ambient field, a class above weather, takes
  // its slots by stealing rain), and the burst takes the reserve above B
  // without stealing; B3b with no reserve the burst steals, from the weather
  // class only. Steals are counted by the stealing class (fxSteal wrapped).
  if (needed('B3', ['--no-reserve', '--no-steal', '--weather-refill-steals'])) run('B3 feedback in rain', function () {
    authoredScene(flatMesh(61), 366, 250, Math.PI / 2); toggle('rain');
    function pool(reserve, seed) {
      var S = fresh(seed, {cap: 512, reserve: reserve});
      ticks(90);
      var full = {count: S.count, B: S.B, weather: S.classLive[0], budgetRefused: S.stats.refusedBudget};
      G.fxEvent('pickup', {x: 366, y: 300, renderFloorZ: 0}, 'tome', '#bb66ff');
      G.fxEvent('pickup', {x: 380, y: 300, renderFloorZ: 0}, 'tome', '#bb66ff');
      G.fxEvent('pickup', {x: 352, y: 300, renderFloorZ: 0}, 'stat', '#ff4444');
      births = []; steals = []; var byClass0 = Array.from(S.stolenByClass);
      try { G.updateEffects(DT); } finally { var b = births, st = steals; births = null; steals = null; }
      var fb = b.filter(function (p) { return p.cls === 4; }), alive = 0, mine = st.filter(function (e) { return e.by === 4; });
      for (var i = 0; i < S.count; i++) if (S.cls[i] === 4) alive++;
      // The pool size right after each feedback spawn: above B only through the reserve.
      return {full: full, feedback: alive, spawned: fb.length, aboveB: fb.filter(function (p) { return p.count > p.B; }).length,
        stolen: mine.length, byClass: Array.from(S.stolenByClass).map(function (v, c) { return v - byClass0[c]; }),
        otherSteals: st.length - mine.length, refusedCap: S.stats.refusedCap};
    }
    var a = pool(64, 3001), b = pool(0, 3002);
    check('B3a on shipping rain: rain fills B and three pickups take the reserve without stealing', a.full.B === 448 && a.full.budgetRefused > 0 &&
      a.full.weather >= 380 && a.feedback === 42 && a.aboveB >= 1 && a.stolen === 0, a);
    check('B3b on shipping rain: with no reserve the pickups steal from the weather class', b.full.B === 512 && b.full.budgetRefused > 0 &&
      b.feedback === 42 && b.stolen >= 1 && b.byClass[0] === b.stolen + b.otherSteals, b);
    // S9: weather never steals (spec 6.2), so a refill that meets the full
    // budget stops: no draw (a column lookup and an admission's steal scan)
    // is spent on a member the budget refuses. 30 ticks of rain at B.
    var S = fresh(3003, {cap: 512, reserve: 64}), realSpawn = G.fxWeatherSpawn, draws = 0, atBudget = 0;
    ticks(90);
    var refused0 = S.stats.refusedBudget;
    G.fxWeatherSpawn = function (S2) { draws++; if (S2.count >= S2.B) atBudget++; return realSpawn.apply(G, arguments); };
    try { ticks(30); } finally { G.fxWeatherSpawn = realSpawn; }
    check('a weather refill at the full budget spends no draw on a refused member', draws > 0 && atBudget === 0 && S.stats.refusedBudget > refused0,
      {seed: 3003, draws: draws, atBudget: atBudget, refused: S.stats.refusedBudget - refused0, B: S.B, count: S.count});
    restoreToggles(); G.fxState = liveState;
  });

  // ── Profiles and the studio: a browser profile primes clear weather
  // unless its job names a kind ('auto' follows the Weather switch), and a
  // casting-studio pool is always clear, whatever the switch says (here:
  // rain), so their measurements and casts compare.
  if (needed('profile', ['--profile-weather-unforced', '--studio-weather-unforced'])) run('profile and studio weather', function () {
    authoredScene(flatMesh(61), 366, 250, Math.PI / 2); toggle('rain');
    function primed(weather) {
      var job = {randomSeed: 77};
      if (weather) job.weather = weather;
      try { G.effectProfilePrime(job); return {weather: weather || null, live: weatherLive(G.fxState), mode: G.effectWeatherState().mode}; }
      finally { G.fxState = liveState; }
    }
    var plain = primed(), rain = primed('rain'), snow = primed('snow'), auto = primed('auto');
    check('a browser profile primes clear weather unless its job names it', plain.live === 0 && plain.mode === 'clear' && rain.live >= 500 &&
      snow.live >= 400 && auto.live >= 500, [plain, rain, snow, auto]);
    var live = {}; G.fxStudioInstall(live, {seed: 5});
    var studio = G.fxState = live.fxState;
    try { ticks(60); } finally { G.fxState = liveState; }
    check('a casting-studio pool stays clear under any Weather switch', weatherLive(studio) === 0 && studio.stats.weatherSpawned === 0 && studio.pinned,
      {live: weatherLive(studio), spawned: studio.stats.weatherSpawned});
    restoreToggles(); G.fxState = liveState;
  });

  // ── A step outside (0, 1] s (a console call with none, NaN, Infinity, a
  // negative one) is a counted failure that changes nothing; the sim time
  // stays finite, so the weather schedule never stalls (a NaN sim time kept
  // its front loop from ending before the S7 fix) and the next tick runs.
  if (needed('bad step', ['--no-dt-guard'])) run('bad step', function () {
    authoredScene(flatMesh(61), 366, 250, Math.PI / 2); toggle('rain');
    var S = fresh(1921), fx = G.effectStats.failures, f0 = fx.updateEffects || 0;
    ticks(30);
    var t0 = S.simTime, spawned0 = S.stats.weatherSpawned;
    try {
      G.updateEffects(NaN); G.updateEffects(); G.updateEffects(Infinity); G.updateEffects(-DT);
      var counted = (fx.updateEffects || 0) - f0, still = S.simTime;
      ticks(30);
    } finally { fx.updateEffects = f0; }                                      // counted on purpose here: not a hidden failure
    check('a step outside (0, 1] s is a counted failure and the next tick runs', counted === 4 && still === t0 && near(S.simTime, t0 + 30 * DT, 1e-9) &&
      S.weather.t === S.simTime && S.stats.weatherSpawned > spawned0, {counted: counted, simTimeAfterBadSteps: still, before: r3(t0), after: S.simTime,
        weatherAdvancedTo: S.weather.t, spawnedSince: S.stats.weatherSpawned - spawned0});
    restoreToggles(); G.fxState = liveState;
  });

  // ── C9 (T20) on shipping rain: Ultra (Particles 60) forced rain, the
  // ambient field and debris bursts, over 2,000 live particles, 120 frames
  // of the fx stages over a real depth frame of Endless seed 424242. Gates
  // (spec 12.1): clip calls <= 2% of drawn, mask px within budget, path
  // calls per drawn <= 2.5, buckets <= 96 a pass, no typed array built after
  // warm-up, no shadow blur.
  if (needed('C9', ['--per-particle-billboard'])) run('C9 rain gates', function () {
    startEndless(424242); G.settings.particles = 60; toggle('rain'); G.fxReset('world'); G.fxPrime();
    var S = G.fxState, c = Math.cos(G.cam.ang), s = Math.sin(G.cam.ang), feet = G.playerFeetSpatialZ();
    function debris(k) {
      if (k % 6) return;
      ['impact.chip', 'impact.spark', 'impact.dust'].forEach(function (id, j) {
        var d = 40 + ((k / 6 + j * 7) % 9) * 12, x = G.cam.x + c * d - s * (j - 1) * 20, y = G.cam.y + s * d + c * (j - 1) * 20;
        G.fxEmit(id, x, y, feet + 8, {count: 30, nx: 0, ny: 0, nz: 1, dx: -c, dy: -s, dz: -0.3, color: '#ffcc66'});
      });
    }
    for (var k = 0; k < 150; k++) { debris(k); G.runSimulationTick(DT); }
    frame(/^$/);                                                          // one real frame fills the scene depth
    var clipCalls = 0, savedClip = G.withSceneDepthClip, names = ['Float64Array', 'Float32Array', 'Int32Array', 'Uint32Array', 'Int16Array', 'Uint16Array', 'Uint8Array'], saved = {};
    var worst = {clipShare: 0, maskPx: 0, pathPerDrawn: 0, bucketsMax: 0}, typed = 0, blur = 0, drawnMin = Infinity, liveMin = Infinity;
    G.withSceneDepthClip = function () { clipCalls++; return savedClip.apply(G, arguments); };
    try {
      for (var f = 0; f < 120; f++) {
        debris(150 + f); G.updateEffects(DT);
        liveMin = Math.min(liveMin, S.count);
        if (f === 20) names.forEach(function (n) {
          var Orig = saved[n] = G[n], wrapped = function (a, b, c2) { typed++; return new Orig(a, b, c2); };
          Object.getOwnPropertyNames(Orig).forEach(function (p) { try { if (!(p in wrapped)) wrapped[p] = Orig[p]; } catch (e) {} });
          wrapped.prototype = Orig.prototype; G[n] = wrapped;
        });
        clipCalls = 0;
        stage('fx', function () { G.beginEffectFrame(); G.drawEffectLayer3D(1); G.drawEffectLayer3D(0); });
        if (f === 20) typed = 0;
        if (f < 20) continue;
        var st = G.getEffectStats().frame;
        drawnMin = Math.min(drawnMin, st.drawn);
        worst.clipShare = Math.max(worst.clipShare, clipCalls / Math.max(1, st.drawn));
        worst.maskPx = Math.max(worst.maskPx, st.maskPx);
        worst.pathPerDrawn = Math.max(worst.pathPerDrawn, rec.pathCalls / Math.max(1, st.drawn));
        worst.bucketsMax = Math.max(worst.bucketsMax, st.bucketsMax);
        blur += rec.blurSets;
      }
    } finally {
      G.withSceneDepthClip = savedClip; names.forEach(function (n) { if (saved[n]) G[n] = saved[n]; });
      G.settings.particles = 25; restoreToggles();
    }
    var byCls = Array.from(S.classLive);
    check('the C9 rain scene holds over 2,000 particles and draws them', liveMin >= 2000 && drawnMin >= 400 && byCls[0] >= 1400,
      {liveMin: liveMin, drawnMin: drawnMin, byClass: byCls});
    check('count-based performance gates hold under Ultra rain', worst.clipShare <= 0.02 && worst.maskPx <= 60000 && worst.pathPerDrawn <= 2.5 &&
      worst.bucketsMax <= 96 && !typed && !blur,
      {worst: worst, typedArrays: typed, blurSets: blur, gates: {clipShare: 0.02, maskPx: 60000, pathPerDrawn: 2.5, bucketsPerPass: 96}});
    G.fxState = liveState;
  });

  // Settle: the live pool is back, no runtime failure was hidden.
  G.fxState = liveState; G.fxSpawn = realSpawn; G.fxSteal = realSteal; G.ctx = hostCtx; Math.random = originalRandom;
  var fx = G.getEffectStats().failures, failedKeys = Object.keys(fx).filter(function (k) { return fx[k]; });
  check('no effect runtime failures were counted', !failedKeys.length, {failures: fx, warnings: warnings.slice(0, 3)});
  check('no console errors or stage errors from the game', !G.__weatherErrors.length && !stageErrors.length,
    {errors: G.__weatherErrors.slice(0, 3), stageErrors: stageErrors.slice(0, 3)});
  output('WEATHER_RESULT ' + (failed ? 'FAIL ' + failed + '/' + checked : 'PASS ' + checked));
}());
