// Particle engine contracts (unified effects V1, slice S2a: the simulation
// side). A full-game host loads the real manifest; every case installs its own
// state with a test-local recipe table compiled by the real compileFxRecipes
// (spec 11.1), on authored meshes (flat, a 20 degree ramp, a two-layer cave
// with floor 0, ceiling 4 H and cap 5 H, a 6 H cliff, an overhang with a cap
// at 5 H and no ceiling) or a generated Endless window.
// Risks covered: cosmetic code consuming a random stream (B1), a Particles
// setting that only applies at start (B2), feedback lost in a full pool (B3)
// or stolen from the wrong class (B3c), step-size dependent motion (B4),
// stale or per-cell-constant ground (B5), particles killed on the mesh's last
// row/column (B6), landing on another stratum (B7), presentation ahead of or
// below the drawn timeline (B8), history-dependent pools (B10), recipe typos
// (B11), per-particle allocation (B12), DOM-path events spawning outside the
// fixed tick (B13), a global recipe table (B14), a drifted corner fill (B16),
// camera-local particles surviving a view change or colliding (B17), child
// admission disturbing the integration pass (B18), unbounded refused spawn
// work, silent attaches, cone spawns at the apex and per-tick wall queries;
// since S4, first-person placement (a visible source kept, the lean toward
// the source, the pitched view ray, the walking player's velocity) and ring
// bursts that change shape at a lower density; since S9, core contracts that
// hand mutants had passed (the event ring, event gating and bindings, class
// and recipe caps, fading bookkeeping and a lower Particles setting, the
// integrator's wind and turbulence, the clamp, the mesh edge, collision.wall
// with collision mode none and the support tolerance under an overhang).
// Oracles are authored geometry, analytic motion, the spec's budget formulas
// restated here, the pre-S2 corner routine restated verbatim, spawn order
// recorded by the harness, and particle identities (seedA).
// Mutations are applied to slurped sources only (anchors match exactly once):
//   --engine-math-random    --budget-at-init-only   --no-reserve
//   --no-steal              --per-tick-drag         --stale-ground-cache
//   --ground-cell-constant  --ground-kill-edge      --lowest-layer
//   --nearest-reference     --forward-extrapolate   --no-contact-snap
//   --global-dynamic-palette --accept-unknown-keys  --drop-recipe
//   --merge-color           --allocate-per-spawn    --corner-alloc
//   --emit-immediately      --global-compiled       --corners-off-by-one
//   --eye-in-2d             --admit-children-inline --surface-ignores-under
//   --lod-ignored           --no-spawn-cap          --segment-at-start
//   --entity-outlives-body  --merged-keys-substring --no-nearest-fallback
//   --eye-in-nonfollow      --steal-not-lowest      --steal-same-class
//   --steal-youngest        --ground-kill-last-row  --burst-retries-refused
//   --budget-refusal-free   --event-max-ignores-scale --attach-zero-rate
//   --attach-follow-ignored --cone-at-apex          --wall-span-per-tick
//   --placement-override-ignored --eye-collides     --accept-eye-wall
//   --accept-any-weather-kind --front-always      --front-no-lateral
//   --front-ignores-pitch   --front-inherit-uncapped --ring-scaled-count
//   --ring-prefix-arc
// S9 (core hand mutants no case detected):
//   --ring-drops-oldest     --bad-event-queued      --wind-on-eye
//   --no-turbulence         --clamp-keeps-fall      --offmesh-survives
//   --cap-counts-dying      --maxlive-plus-one      --event-gate-stale
//   --where-under-ignored
// S9 fix (core mutants the S9 review and this fix's sweep found surviving):
//   --kill-keeps-dying      --excess-counts-dying   --fade-extends-life
//   --wall-needs-mode       --support-tolerance-wide --event-open-first-binding
//   --mark-dying-twice      --bounce-no-friction
(function () {
  var G = (0, eval)('this'), output = (__engine === 'node' || __engine === 'deno') ? console.log.bind(console) : __out;
  var checked = 0, failed = 0, loadErrors = [], warnings = [], originalRandom = Math.random;
  var DT = 1 / 60, TAN20 = Math.tan(20 * Math.PI / 180);
  function has(flag) { return __argv.indexOf(flag) >= 0; }
  // The default run executes every case. A mutation run aimed at another
  // check skips the two generated-world cases (about 10 s) and the S9 core
  // contracts, and says so.
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
  G.__engineSource = function (path, source) {
    if (path === 'src/11-fx-engine.js') {
      source = mutate(source, '--engine-math-random', '  var R = S.R, st = S.stats, seed = (effectNoise(',
        '  Math.random();\n  var R = S.R, st = S.stats, seed = (effectNoise(');
      source = mutate(source, '--budget-at-init-only', '  if (q.gen !== S.qGen) {', '  if (S.qGen < 0) {');
      source = mutate(source, '--no-reserve', '  if (S.count >= (c === 4 ? S.cap : S.B)) {', '  if (S.count >= S.B) {');
      source = mutate(source, '--no-steal', '    if (S.noSteal || !fxSteal(S, c)) return -3;', '    return -3;');
      // S9 core hand mutants: the ring drops its oldest events, a non-finite
      // event queued, eye space in the wind, no turbulence, a clamp that keeps
      // falling speed, a particle surviving off the mesh, class caps that
      // count fading particles, maxLive + 1, event gates never rebuilt, and
      // where.underground ignored.
      source = mutate(source, '--ring-drops-oldest', "  if (ev.count >= ev.n) { S.stats.eventsDropped++; return -1; }  // a full ring drops the newest",
        "  if (ev.count >= ev.n) { S.stats.eventsDropped++; ev.head = (ev.head + 1) % ev.n; ev.count--; }");
      source = mutate(source, '--bad-event-queued', "  if (!Number.isFinite(ev.x[k]) || !Number.isFinite(ev.y[k]) || !Number.isFinite(ev.z[k])) { S.stats.badEvents++; return false; }\n", '');
      source = mutate(source, '--wind-on-eye', 'w = (f & (FX_EYE | FX_SCREEN)) ? 0 : WR[r]', 'w = WR[r]');
      source = mutate(source, '--no-turbulence', '    if (ta > 0) { var ph = S.phase[i]', '    if (false) { var ph = S.phase[i]');
      source = mutate(source, '--clamp-keeps-fall', ' if (S.vz[i] < 0) S.vz[i] = 0; S.flags[i] |= FX_SNAP; }\n    return false;', ' S.flags[i] |= FX_SNAP; }\n    return false;');
      source = mutate(source, '--offmesh-survives', '  if (gz !== gz) { fxKill(S, i); return true; }                 // off the mesh or not loaded', '  if (gz !== gz) return false;');
      source = mutate(source, '--cap-counts-dying', '  if (S.recipeLive[r] >= R.maxLive[r] || S.classLive[c] - S.classDying[c] >= S.caps[c]) return -2;',
        '  if (S.recipeLive[r] >= R.maxLive[r] || S.classLive[c] >= S.caps[c]) return -2;');
      source = mutate(source, '--maxlive-plus-one', '  if (S.recipeLive[r] >= R.maxLive[r] ||', '  if (S.recipeLive[r] > R.maxLive[r] ||');
      source = mutate(source, '--event-gate-stale', '  if (S.evGen !== gen) {\n    var C = S.C, list;', '  if (S.evGen < 0) {\n    var C = S.C, list;');
      source = mutate(source, '--where-under-ignored', '  return !(bind.under && (bind.under === 1) !== !!(fl & FX_EV_UNDER));', '  return true;');
      // S9 fix (core mutants the S9 review found surviving): a kill that
      // leaves a faded particle in its class's fading count, a quality excess
      // that counts particles already fading, a fade that lengthens a life,
      // collision.wall ignored for collision mode none, and a reference
      // support tolerance of 0.4 H instead of 1 u.
      source = mutate(source, '--kill-keeps-dying', '  if (fl & FX_DYING) S.classDying[c]--;\n  else if', '  if (fl & FX_DYING) {}\n  else if');
      source = mutate(source, '--excess-counts-dying', '    var excess = S.classLive[k] - S.classDying[k] - S.caps[k];', '    var excess = S.classLive[k] - S.caps[k];');
      source = mutate(source, '--fade-extends-life', '  if (S.life[i] > end) S.life[i] = end;\n}', '  S.life[i] = end;\n}');
      source = mutate(source, '--wall-needs-mode', 'if ((CO[r] !== FX_MODE_NONE || R.wall[r]) && !(f & (FX_EYE | FX_SCREEN))', 'if ((CO[r] !== FX_MODE_NONE) && !(f & (FX_EYE | FX_SCREEN))');
      source = mutate(source, '--support-tolerance-wide', '    if (h > ref + 0.04 || h <= best) continue;', '    if (h > ref + 0.4 || h <= best) continue;');
      // A particle marked to fade again counted again; a bounce without its friction.
      source = mutate(source, '--mark-dying-twice', '  if (S.flags[i] & FX_DYING) return;\n  S.flags[i] |= FX_DYING;', '  S.flags[i] |= FX_DYING;');
      source = mutate(source, '--bounce-no-friction', 'S.vz[i] = up; S.vx[i] *= R.friction[r]; S.vy[i] *= R.friction[r];', 'S.vz[i] = up;');
      // An event opened by its first binding only.
      source = mutate(source, '--event-open-first-binding', '      for (var b = 0; b < list.length; b++) if (!fxRecipeGateWhy(C, S.R, list[b].r)) { S.evOpen[t] = 1; break; }',
        '      if (list.length && !fxRecipeGateWhy(C, S.R, list[0].r)) S.evOpen[t] = 1;');
      source = mutate(source, '--no-nearest-fallback', '  if (li < 0) li = near;\n', '');
      source = mutate(source, '--eye-in-nonfollow', '  if (!S.eyeCount || (MODE3D && CAM_FOLLOW)) return;', '  if (!S.eyeCount || MODE3D) return;');
      source = mutate(source, '--steal-not-lowest', 'if (best < 0 || vc < bestC || vc === bestC && a > bestAge)', 'if (best < 0 || a > bestAge)');
      source = mutate(source, '--steal-same-class', '    if (vc >= c) continue;', '    if (vc > c) continue;');
      source = mutate(source, '--steal-youngest', 'vc === bestC && a > bestAge)', 'vc === bestC && a < bestAge)');
      source = mutate(source, '--burst-retries-refused', '    if (got >= -2) { fxRefuse(S, r, got, m - j); break; }\n',
        '    if (got >= -2) { fxRefuse(S, r, got, 1); continue; }\n');
      source = mutate(source, '--budget-refusal-free', '    if (got === -3 && !S.noSteal) S.spawnLeft--;\n', '');
      source = mutate(source, '--event-max-ignores-scale', 'total += Math.ceil(Math.round(list[b].c1 * sc) * FX_CLASS_MAX_SCALE',
        'total += Math.ceil(list[b].c1 * FX_CLASS_MAX_SCALE');
      source = mutate(source, '--attach-zero-rate', ' || !(rate > 0)) { S.stats.badEvents++; return -1; }', ') { S.stats.badEvents++; return -1; }');
      source = mutate(source, '--attach-follow-ignored', "var entity = typeof anchor.health === 'number' || !!(opts && opts.follow);",
        "var entity = typeof anchor.health === 'number';");
      source = mutate(source, '--cone-at-apex', '    ox = rad * cone[0]; oy = rad * cone[1]; oz = rad * cone[2];', '    ox = oy = oz = 0;');
      source = mutate(source, '--wall-span-per-tick', '  var v = t[ci];\n', '  var v = NaN;\n');
      source = mutate(source, '--placement-override-ignored', '  if (S.placeOver[r] >= 0) place = S.placeOver[r];\n', '');
      source = mutate(source, '--eye-collides', ' && !(f & (FX_EYE | FX_SCREEN)) && fxCollide(', ' && fxCollide(');
      // S4 review: every sourceOrFront burst moved in front, even a visible one.
      source = mutate(source, '--front-always',
        '  if (place === FX_PLACE_FRONT && Math.hypot(ctx.x - cam.x, ctx.y - cam.y) >= R.pNear[r] && fxInView(ctx.x, ctx.y, ctx.z, 0.9)) return 0;\n', '');
      source = mutate(source, '--front-no-lateral', '  lateral = lateral < -half ? -half : lateral > half ? half : lateral;', '  lateral = 0;');
      // Before the S4 fix: the front point ignored pitch (eye height minus drop, distance ahead).
      source = mutate(source, '--front-ignores-pitch', '  var p = Number.isFinite(cam.pitch) ? cam.pitch : 0, fd = dist / Math.sqrt(1 + p * p);',
        '  var p = 0, fd = dist;');
      source = mutate(source, '--front-inherit-uncapped', '  var cap = 2 * GAME_CONFIG.player.baseSpeed, k = v > cap ? cap / v : 1;', '  var k = 1;');
      // Before the S4 fix: ring slots spaced by the spawned count, so a lower
      // density re-spaced the survivors.
      source = mutate(source, '--ring-scaled-count', '    var got = fxSpawn(S, r, (serial + j) >>> 0, j, n, ctx);', '    var got = fxSpawn(S, r, (serial + j) >>> 0, j, m, ctx);');
      source = mutate(source, '--ring-scaled-count', '    var ra = 2 * Math.PI * (fxRadicalInverse(j) + n4 / (n > 0 ? n : 1)),', '    var ra = 2 * Math.PI * (j + n4) / (n > 0 ? n : 1),');
      // The review's first proposal: slots of the authored count in serial
      // order, so a lower density shows only an arc of the ring.
      source = mutate(source, '--ring-prefix-arc', '    var ra = 2 * Math.PI * (fxRadicalInverse(j) + n4 / (n > 0 ? n : 1)),', '    var ra = 2 * Math.PI * (j + n4) / (n > 0 ? n : 1),');
      source = mutate(source, '--per-tick-drag', 'K = Math.exp(-D * dt)', 'K = Math.exp(-D / 60)');
      source = mutate(source, '--stale-ground-cache', '  if (S.gcell[i] !== ci && !fxFillGround(S, i, m, ci)) return NaN;',
        '  if (S.gcell[i] < 0 && !fxFillGround(S, i, m, ci)) return NaN;');
      source = mutate(source, '--ground-cell-constant',
        '  } else { S.g0[i] = _fxCorners[0] * 25; S.g1[i] = _fxCorners[1] * 25; S.g2[i] = _fxCorners[2] * 25; S.g3[i] = _fxCorners[3] * 25; }',
        '  } else { S.g0[i] = S.g1[i] = S.g2[i] = S.g3[i] = _fxCorners[0] * 25; }');
      source = mutate(source, '--ground-kill-edge', '  if (gx < 0 || gy < 0 || gx >= m.w || gy >= m.h) return NaN;\n  var ci = gy * m.w + gx;\n  if (S.gcell[i]',
        '  if (gx < 0 || gy < 0 || gx >= m.w - 1 || gy >= m.h - 1) return NaN;\n  var ci = gy * m.w + gx;\n  if (S.gcell[i]');
      source = mutate(source, '--ground-kill-last-row', '  if (gx < 0 || gy < 0 || gx >= m.w || gy >= m.h) return NaN;\n  var ci = gy * m.w + gx;\n  if (S.gcell[i]',
        '  if (gx < 0 || gy < 0 || gx >= m.w || gy >= m.h - 1) return NaN;\n  var ci = gy * m.w + gx;\n  if (S.gcell[i]');
      var referenceRule = '    var d = Math.abs(h - ref);\n    if (d < nearD) { nearD = d; near = k; }\n' +
        '    if (h > ref + 0.04 || h <= best) continue;                // support at or below the particle (1 u)\n' +
        '    if (fxCeilingBetween(m, ci, n, h, ref)) continue;\n    best = h; li = k;\n';
      source = mutate(source, '--lowest-layer', referenceRule, '    if (li < 0 || h < best) { best = h; li = k; }\n');
      source = mutate(source, '--nearest-reference', referenceRule, '    var d = Math.abs(h - ref);\n    if (d < nearD) { nearD = d; near = k; li = k; }\n');
      source = mutate(source, '--forward-extrapolate', '  return (1 - a) * S.lastDt;', '  return -a * S.lastDt;');
      source = mutate(source, '--no-contact-snap', 'b = (S.flags[i] & FX_SNAP) ? 0 : age < back ? age : back;', 'b = age < back ? age : back;');
      if (has('--global-dynamic-palette')) source = 'var _fxSessionPal = new Int32Array(64), _fxSessionPalCount = 0;\n' + source;
      source = mutate(source, '--global-dynamic-palette', 'var P = S.C.PAL, d = S.dynPal, n = S.dynCount, best = 0',
        'var P = S.C.PAL, d = _fxSessionPal, n = _fxSessionPalCount, best = 0');
      source = mutate(source, '--global-dynamic-palette', 'if (n < d.length) { d[n] = rgb; S.dynCount = n + 1; return P.count + n; }',
        'if (n < d.length) { d[n] = rgb; _fxSessionPalCount = n + 1; return P.count + n; }');
      source = mutate(source, '--allocate-per-spawn', '  var shape = R.shape[r], ang = 2 * Math.PI * n4;',
        '  var scratch = new Float64Array(3);\n  var shape = R.shape[r], ang = 2 * Math.PI * n4;');
      source = mutate(source, '--corner-alloc', '  if (!spatialLayerCornersInto(m, ci, li, _fxCorners)) {         // last row/column or stratum edge: flat',
        '  var corners = spatialLayerCorners(m, ci, li);\n  if (corners) { _fxCorners[0] = corners[0]; _fxCorners[1] = corners[1]; _fxCorners[2] = corners[2]; _fxCorners[3] = corners[3]; }\n  if (!corners) {');
      source = mutate(source, '--emit-immediately', "    if (FX_EVENT_READERS[type](S, k, a, b, c, d, e) !== false) fxRingCommit(S, k);   // false: not queued\n  } catch (err) { effectFailure('fxEvent', err); }",
        "    if (FX_EVENT_READERS[type](S, k, a, b, c, d, e) !== false && fxRingCommit(S, k)) { S.spawnLeft = 384; fxDrainEvents(S); }\n  } catch (err) { effectFailure('fxEvent', err); }");
      source = mutate(source, '--global-compiled', '  var R = S.R, n = S.C.count;', '  var R = FX_COMPILED.R, n = S.C.count;');
      source = mutate(source, '--surface-ignores-under', '  var biome = ctx.flags & FX_EV_UNDER ? P.surfBiomes.length - 1 :', '  var biome = false ? P.surfBiomes.length - 1 :');
      source = mutate(source, '--segment-at-start', '_fxSegP[0] = ctx.x + sdx * n3 - sdy / sl * lat; _fxSegP[1] = ctx.y + sdy * n3 + sdx / sl * lat;',
        '_fxSegP[0] = ctx.x - sdy / sl * lat; _fxSegP[1] = ctx.y + sdx / sl * lat;');
      source = mutate(source, '--segment-at-start', ': ctx.z + (ctx.z2 - ctx.z) * n3) + lift;', ': ctx.z) + lift;');
      source = mutate(source, '--entity-outlives-body', "    if (!e || typeof e.health === 'number' && !(e.health > 0) ||", '    if (!e ||');
      source = mutate(source, '--lod-ignored', '  if (d <= R.near[r]) return 1;\n', '  return 1;\n');
      source = mutate(source, '--no-spawn-cap', '    S.spawnLeft = Math.ceil(EFFECT_CONFIG.spawnPerTick * dt * 60 - 1e-9);', '    S.spawnLeft = 1e9;');
      source = mutate(source, '--eye-in-2d', '  if (!S.eyeCount || (MODE3D && CAM_FOLLOW)) return;', '  return;');
      source = mutate(source, '--admit-children-inline', '  if (mode === FX_MODE_KILL) { fxQueueChild(S, i, r, px, py, gz); fxKill(S, i); return true; }',
        '  if (mode === FX_MODE_KILL) {\n    fxKill(S, i);\n    if (R.child[r] >= 0) { fxCtxReset(_fxCtx); _fxCtx.x = px; _fxCtx.y = py; _fxCtx.z = gz; ' +
        '_fxCtx.spec = R.colorSpec[R.child[r]]; fxBurst(S, R.child[r], 1, FX_PLACE_SOURCE, _fxCtx, true); }\n    return true;\n  }');
    }
    if (path === 'src/11-fx-recipes.js') {
      source = mutate(source, '--accept-unknown-keys', "      if (allowed.indexOf(k) < 0) fail(id, 'unknown key ' + path + k);\n", '');
      // S4: the template feedbackBurst has children now (dropping it fails at
      // load, a named compiler error); the dropped recipe is a leaf burst.
      source = mutate(source, '--drop-recipe', "  'burst.allyDeath': {extends:'feedbackBurst',", "  'droppedBurst': {extends:'feedbackBurst',");
      source = mutate(source, '--accept-eye-wall', 'co.mode !== 0 || co.wall || d.view2D !== 0', 'co.mode !== 0 || d.view2D !== 0');
      source = mutate(source, '--accept-any-weather-kind', "        enumCode(id, 'weatherKind', t.kind, 'trigger.kind');\n", '');
    }
    if (path === 'src/06-spatial-geometry.js') {
      source = mutate(source, '--corners-off-by-one', '    z2 = findSpatialRoleZ(mesh, ci + mesh.w, role, z, ci);',
        '    z2 = findSpatialRoleZ(mesh, ci + mesh.w + 1, role, z, ci);');
    }
    return source;
  };
  G.__engineLoad = function (path) {
    try { (0, eval)(G.__engineSource(path, slurp('assets/games/' + path))); } catch (e) {
      if (/^MUTATION_ANCHOR/.test(e.message)) throw e;
      loadErrors.push(path + ': ' + e.message);
    }
  };
  var host = slurp('tools/game/tests/cave_occlusion_integration.js');
  var end = host.indexOf('  function check(name, okay) {');
  if (end < 0) throw Error('SETUP engine host boundary missing');
  host = host.slice(0, end);
  var load = "manifest.parts.MAIN.forEach(function (path) { (0, eval)(slurp('assets/games/' + path)); });";
  if (host.split(load).length !== 2) throw Error('SETUP engine manifest boundary missing');
  host = host.replace(load, 'manifest.parts.MAIN.forEach(G.__engineLoad);');
  (0, eval)(host + 'G.__engineErrors = errors; }());');
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
  function lcg(seed) { var s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  check('every game fragment loads without an error', !loadErrors.length, {loadErrors: loadErrors});
  if (loadErrors.length) { output('PARTICLE_ENGINE_RESULT FAIL ' + failed + '/' + checked + ' (load failed)'); return; }
  // B11's direct merge case compiles with a copy of the loaded compiler,
  // evaluated under no global name, so a merge defect injected into it
  // reaches that case instead of failing the shipping table at load.
  var compileUnderTest = (function () {
    var src = G.__engineSource('src/11-fx-recipes.js', slurp('assets/games/src/11-fx-recipes.js'));
    var at = src.indexOf('function compileFxRecipes('), end = src.indexOf('\nvar FX_COMPILED = ');
    if (at < 0 || end < at) throw Error('SETUP compiler boundary missing');
    // Before B11: a key list tested by substring, so place merged like placeParams.
    var fn = mutate(src.slice(at, end), '--merged-keys-substring', '_FX_MERGED.indexOf(k) >= 0',
      "'spawn motion collision life render lod placeParams budget'.indexOf(k) >= 0");
    // A deep-merged color (the prototype's defect). Since S7 the shipping
    // weather.cinder, which extends weather.ash, would itself fail to load
    // under it, so it is injected here, where B11's merge case reaches it.
    fn = mutate(fn, '--merge-color', "      out[k] = _FX_MERGED.indexOf(k) >= 0 && out[k] ?",
      "      out[k] = _FX_MERGED.concat('color').indexOf(k) >= 0 && out[k] && typeof out[k] === 'object' ?");
    return (0, eval)('(' + fn + ')');
  }());

  // ── Test-local recipe table (compiled by the shipping compiler) ─────────
  var TEST_RECIPES = {
    'test.flood': {class:'weather', trigger:{api:true}, color:{material:'fxWeather', roles:['rain']}, motion:{model:'static'},
      life:{seconds:[100, 100]}, render:{primitive:'dot', size:[0.3, 0.3]}, view2D:'none'},
    'test.feedback': {class:'feedback', trigger:{api:true, count:15}, color:'event',
      spawn:{shape:'ring', radius:[1, 2], direction:'radial', speed:[20, 30]}, motion:{model:'drift', drag:1.8},
      life:{seconds:[100, 100]}, render:{primitive:'glowDot', size:[0.5, 0.8], glow:3}, view2D:'dot'},
    'test.combat': {class:'combat', trigger:{api:true}, color:{material:'fxDebris', roles:['spark', 'sparkHot'], weights:[3, 1]},
      motion:{model:'static'}, life:{seconds:[100, 100]}, render:{primitive:'dot', size:[0.3, 0.3]}, view2D:'dot'},
    'test.bone': {class:'combat', trigger:{api:true}, color:{material:'fxBone', roles:['enemy']},
      spawn:{direction:'along', speed:[100, 100], up:[80, 80]}, motion:{model:'ballistic', gravity:420, drag:1.2},
      life:{seconds:[2, 2]}, render:{primitive:'segment', size:[0.5, 0.5], length:[7, 20]}, view2D:'segment'},
    'test.chip': {class:'combat', trigger:{api:true}, color:{material:'fxDebris', roles:['chip']},
      spawn:{direction:'along', speed:[60, 60], up:[40, 40]}, motion:{model:'ballistic', gravity:420, drag:0.4},
      collision:{mode:'bounce', stratum:'reference', restitution:0.35, friction:0.6, bounces:2, restSeconds:[5, 5]},
      life:{seconds:[10, 10]}, render:{primitive:'chip', size:[0.5, 0.5]}, view2D:'dot'},
    'test.faller': {class:'combat', trigger:{api:true}, color:{material:'fxMote', roles:['drip']}, motion:{model:'ballistic', gravity:200},
      collision:{mode:'rest', stratum:'reference', restSeconds:[5, 5]}, life:{seconds:[10, 10]},
      render:{primitive:'dot', size:[0.2, 0.2]}, view2D:'dot'},
    'test.glider': {class:'combat', trigger:{api:true}, color:{material:'fxMote', roles:['spore']},
      spawn:{direction:'along', speed:[30, 30]}, motion:{model:'drift'}, collision:{mode:'clamp', stratum:'reference'},
      life:{seconds:[10, 10]}, render:{primitive:'dot', size:[0.2, 0.2]}, view2D:'dot'},
    'test.drop': {class:'combat', trigger:{api:true}, color:{material:'fxWeather', roles:['rain']}, motion:{model:'ballistic', gravity:300},
      collision:{mode:'kill', stratum:'reference', onFloor:'test.splash', onFloorChance:1}, life:{seconds:[5, 5]},
      render:{primitive:'streak', size:[0.3, 0.3], streakSeconds:0.03}, view2D:'line'},
    'test.fbdrop': {class:'feedback', trigger:{api:true}, color:{material:'fxWeather', roles:['rain']}, motion:{model:'ballistic', gravity:300},
      collision:{mode:'kill', stratum:'reference', onFloor:'test.splash', onFloorChance:1}, life:{seconds:[5, 5]},
      render:{primitive:'streak', size:[0.3, 0.3], streakSeconds:0.03}, view2D:'line'},
    'test.splash': {class:'combat', trigger:{child:true}, color:{material:'fxWeather', roles:['splash']}, motion:{model:'static'},
      life:{seconds:[0.3, 0.3]}, render:{primitive:'ring', size:[0.7, 1.3], grow:2.5}, view2D:'ring'},
    'test.stream': {class:'combat', trigger:{anchor:'point', rate:200}, color:{material:'fxDebris', roles:['dust']}, motion:{model:'static'},
      life:{seconds:[0.5, 0.5]}, render:{primitive:'puff', size:[1, 1]}, view2D:'puff'},
    'test.eye': {class:'feedback', trigger:{api:true, count:16}, place:'eye', color:{material:'fireMagic', roles:['core', 'light']},
      spawn:{shape:'ring', radius:[1, 2], direction:'radial', speed:[22, 30]}, motion:{model:'drift', drag:1.8},
      life:{seconds:[0.8, 0.9]}, render:{primitive:'glowDot', size:[0.5, 0.8], glow:3}, occlusion:'none', view2D:'none'},
    'test.front': {class:'feedback', trigger:{api:true, count:8}, place:'sourceOrFront', placeParams:{near:48, distance:34, drop:10},
      color:{material:'fxFeedback', roles:['tome']}, motion:{model:'static'}, life:{seconds:[1, 1]},
      render:{primitive:'dot', size:[0.5, 0.5]}, view2D:'dot'},
    'test.carry': {class:'feedback', trigger:{api:true, count:4}, place:'sourceOrFront', placeParams:{near:48, distance:34, drop:10},
      color:{material:'fxFeedback', roles:['tome']}, spawn:{inherit:1}, motion:{model:'drift'}, life:{seconds:[1, 1]},
      render:{primitive:'dot', size:[0.5, 0.5]}, view2D:'dot'},
    'test.shrine': {class:'feedback', family:'pickupBursts', trigger:{event:'shrine', count:12, at:'shrineCrystal'}, color:'event',
      spawn:{shape:'ring', radius:[1, 2], direction:'radial', speed:[35, 45], up:[30, 50]}, motion:{model:'ballistic', gravity:60, drag:0.8},
      life:{seconds:[0.8, 0.8]}, render:{primitive:'glowDot', size:[0.5, 0.8], glow:3}, view2D:'dot'},
    'test.dust': {class:'combat', trigger:{api:true}, color:'surfaceDust', motion:{model:'static'}, life:{seconds:[5, 5]},
      render:{primitive:'puff', size:[1, 1]}, view2D:'puff'},
    'test.lod': {class:'combat', trigger:{api:true, count:20}, color:{material:'fxDebris', roles:['spark']}, motion:{model:'static'},
      life:{seconds:[5, 5]}, render:{primitive:'dot', size:[0.3, 0.3]}, view2D:'dot', lod:{near:50, far:250, farKeep:0.4, cull:400}},
    'test.seg': {class:'combat', trigger:{anchor:'point', rate:600}, color:{material:'fireMagic', roles:['light']},
      spawn:{shape:'segment', radius:[2, 2]}, motion:{model:'static'}, life:{seconds:[5, 5]}, render:{primitive:'dot', size:[0.3, 0.3]}, view2D:'dot'},
    'test.walker': {class:'combat', trigger:{api:true}, color:{material:'fxDebris', roles:['spark']},
      spawn:{direction:'along', speed:[50, 50]}, motion:{model:'drift'}, life:{seconds:[10, 10]},
      render:{primitive:'dot', size:[0.3, 0.3]}, view2D:'dot'},
    'test.mote': {class:'ambient', trigger:{api:true}, color:{material:'fxMote', roles:['dust']}, motion:{model:'static'},
      life:{seconds:[100, 100]}, render:{primitive:'dot', size:[0.2, 0.2]}, view2D:'none'},
    'test.gated': {class:'combat', toggle:'fxDebris', trigger:{api:true}, color:{material:'fxDebris', roles:['spark']},
      motion:{model:'static'}, life:{seconds:[5, 5]}, render:{primitive:'dot', size:[0.3, 0.3]}, view2D:'dot'},
    'test.cone': {class:'combat', trigger:{api:true}, color:{material:'fxDebris', roles:['spark']},
      spawn:{shape:'cone', radius:[5, 10], spread:0.4}, motion:{model:'static'}, life:{seconds:[5, 5]},
      render:{primitive:'dot', size:[0.3, 0.3]}, view2D:'dot'},
    'test.walldrop': {class:'combat', trigger:{api:true}, color:{material:'fxWeather', roles:['rain']}, motion:{model:'ballistic', gravity:300},
      collision:{mode:'kill', stratum:'surface', wall:true, onFloor:'test.splash', onFloorChance:1}, life:{seconds:[5, 5]},
      render:{primitive:'streak', size:[0.3, 0.3], streakSeconds:0.03}, view2D:'line'}
  };
  var T = G.compileFxRecipes(TEST_RECIPES, G.FX_MATERIALS);

  // ── Authored meshes (projectile_sweeps.js style) ──────────────────────────
  var W = 31, GS = 12;
  function mesh(kind) {
    var m = {w: W, h: W, gridSize: GS, layerCount: new Uint8Array(W * W)};
    for (var l = 0; l < 5; l++) { m['l' + l + 'Type'] = new Uint8Array(W * W); m['l' + l + 'TopZ'] = new Float64Array(W * W); m['l' + l + 'Meta'] = new Uint8Array(W * W); }
    for (var y = 0; y < W; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x;
      m.layerCount[i] = kind === 'cave' ? 3 : kind === 'overhang' ? 2 : 1; m.l0Type[i] = 1; m.l0Meta[i] = kind === 'cave' ? 2 : 1;
      m.l0TopZ[i] = kind === 'ramp' ? x * GS * TAN20 / 25 : 0;
      if (kind === 'cliff') m.l0TopZ[i] = x < 16 ? 6 : 0;                    // a 6 H plateau west of x = 180 (S9)
      if (kind === 'cave') { m.l1Type[i] = 2; m.l1TopZ[i] = 4; m.l2Type[i] = 4; m.l2TopZ[i] = 5; m.l2Meta[i] = 3; }
      if (kind === 'overhang') { m.l1Type[i] = 4; m.l1TopZ[i] = 5; m.l1Meta[i] = 3; }   // a cap 5 H up with no ceiling under it (S9 fix)
    }
    return m;
  }
  var MESHES = {flat: mesh('flat'), ramp: mesh('ramp'), cave: mesh('cave'), cliff: mesh('cliff'), overhang: mesh('overhang')};
  function scene(kind) {
    G.floorMesh = MESHES[kind]; G.ENDLESS_MODE = false; G.CAVE_TEST_MODE = false;
    G.cell = GS; G.gridW = G.gridH = W; G.grid = new Uint8Array(W * W); G.wallHeights = G.wallFaceBase = G.wallMaxTopZ = null;
    G.deepCaveRegions = []; G.windowOriginX = G.windowOriginY = 0;
    G.pos = {x: 180, y: 180, floorZ: 60}; G.cam = {x: 180, y: 180, z: 60, ang: 0, pitch: 0, fov: G.GAME_CONFIG.player.baseFov};
    G.MODE3D = true; G.CAM_FOLLOW = true; G.playerUnderground = false; G.terrain = 'ground'; G.level = 1;
    G.ambientParticles = []; G.settings.particles = 25; G.renderPresentationAlpha = 1;
  }
  // Small test pools keep a 16-slot feedback reserve unless a case sets one.
  function install(cap, seed, opts) {
    var o = {compiled: T, pinned: true, reserve: 16};
    Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
    return (G.fxState = G.createFxState(cap, seed, o));
  }
  function ticks(n, dt) { for (var k = 0; k < n; k++) G.updateEffects(dt || DT); }
  function byRecipe(S, id) {
    var r = S.C.ID[id], out = [];
    for (var i = 0; i < S.count; i++) if (S.rec[i] === r) out.push(i);
    return out;
  }
  function find(S, seed) { for (var i = 0; i < S.count; i++) if (S.seedA[i] === seed) return i; return -1; }
  function failures() { var f = G.getEffectStats().failures, n = 0; for (var k in f) n += f[k]; return n; }
  var liveState = G.fxState;

  // B1: every cosmetic draw comes from hash noise. Math.random and
  // presentationRandom are replaced by recording throwers for 600 ticks.
  run('B1 random isolation', function () {
    scene('flat'); var S = install(3072, 101);
    G.setEffectFamilyMode('ambient', 'legacy');          // the legacy half below (S3 migrated ambient)
    G.ambientParticles = [{x: 190, y: 180, z: 5, vx: 0, vy: 0, vz: 0, alpha: 0, maxAlpha: 0.25, life: 0.01, maxLife: 3, size: 1.5, type: 'dust', r: 180, g: 160, b: 120}];
    var calls = {random: 0, presentation: 0}, savedPR = G.presentationRandom, legacyRespawned = false, firstLegacy = G.ambientParticles[0];
    function thrower(kind) { return function () { calls[kind]++; throw Error('cosmetic draw from ' + kind); }; }
    var randomThrower = thrower('random'), afterLoop = null;
    Math.random = randomThrower; G.presentationRandom = thrower('presentation');
    var direct = false;
    try { Math.random(); } catch (e) { direct = /cosmetic draw/.test(e.message); }
    calls.random = 0;
    var f0 = failures();
    try {
      for (var k = 0; k < 600; k++) {
        if (k % 20 === 0) G.fxEmit('test.drop', 150 + (k % 60), 170, 40, {count: 3});
        if (k % 30 === 0) G.fxEmit('test.flood', 200, 190, 10, {count: 20});
        if (k % 45 === 0) G.fxEmit('test.chip', 170, 180, 30, {count: 4, dx: 1, dy: 0, dz: 0});
        G.updateEffects(DT);
      }
      legacyRespawned = G.ambientParticles[0] !== firstLegacy;
      afterLoop = Math.random === randomThrower;            // read before the finally restores it
    } finally { Math.random = originalRandom; G.presentationRandom = savedPR; G.setEffectFamilyMode('ambient', null); }
    var st = G.getEffectStats().tick;
    check('the thrower throws when called directly', direct);
    check('cosmetic particles never read Math.random or presentationRandom', !calls.random && !calls.presentation &&
      failures() === f0 && st.spawned >= 300 && st.children > 0,
      {seed: 101, ticks: 600, calls: calls, failures: failures() - f0, spawned: st.spawned, children: st.children});
    check('the legacy ambient update runs on its private stream, leaving the thrower installed', legacyRespawned && afterLoop === true,
      {seed: 101, respawned: legacyRespawned, throwerInstalledAfterLoop: afterLoop});
  });

  // B2: settings.particles is read every tick; the excess fades within
  // cullFadeSeconds + 1 tick and a raised budget refills within a second.
  run('B2 live Particles setting', function () {
    // No reset may stand in for the live knob: the state's tick counter
    // (zeroed by fxReset) must equal the ticks run here, the anchor must
    // survive, and the registry's reset entry is spied on.
    scene('flat'); var S = install(3072, 202, {reserve: 256}), resets = 0, savedReset = G.effectRegistryReset, ran = 0;
    function step(n) { ticks(n); ran += n; }
    G.effectRegistryReset = function () { resets++; return savedReset.apply(G, arguments); };
    try {
      var handle = G.fxAttach('test.stream', {x: 200, y: 180, z: 5});
      step(90);
      // Target = rate x life x class scale (combat: min(P/25, 1.5)), restated.
      function target(P) { return 200 * 0.5 * Math.min(P / 25, 1.5); }
      var at25 = S.recipeLive[S.C.ID['test.stream']];
      step(60);
      var still25 = S.recipeLive[S.C.ID['test.stream']];
      check('an unchanged setting keeps its population', near(at25, target(25), 0.05 * target(25)) && near(still25, at25, 0.05 * at25),
        {seed: 202, tick: ran, at25: at25, after: still25, target: target(25), tolerance: 0.05});
      G.settings.particles = 0;
      var within = Math.ceil(G.EFFECT_CONFIG.cullFadeSeconds / DT) + 1;
      step(within);
      var cap0 = S.caps[3], live0 = S.classLive[3];
      G.settings.particles = 60;
      step(60);
      var live60 = S.recipeLive[S.C.ID['test.stream']], cap60 = S.caps[3];
      var kept = S.tick === ran && S.anchors.live === 1 && S.anchors.used[handle & 255] === 1 && S.serial > 0;
      check('the Particles setting applies within a quarter second', live0 <= cap0 && cap0 === 0 &&
        live60 >= 0.9 * target(60) && cap60 === 985 && resets === 0 && kept,            // spec 6.1 table: combat cap 985 at P = 60
        {seed: 202, tick: ran, live0: live0, cap0: cap0, live60: live60, target60: target(60), tolerance: 0.9, cap60: cap60,
          resets: resets, stateTick: S.tick, anchors: S.anchors.live});
    } finally { G.effectRegistryReset = savedReset; G.settings.particles = 25; }
  });

  // B3: the feedback reserve (B3a) and the bounded steal (B3b).
  run('B3 feedback in a full pool', function () {
    function flood(S, n) { for (var k = 0; k < n; k += 100) G.fxEmit('test.flood', 190, 180, 5, {count: Math.min(100, n - k)}); ticks(4); }
    scene('flat'); var S = install(512, 303, {reserve: 64});
    G.fxEmit('test.feedback', 200, 180, 30, {color: '#bb66ff'}); ticks(1);
    check('no steals without pressure', S.stats.stolen === 0 && byRecipe(S, 'test.feedback').length === 15);
    S = install(512, 303, {reserve: 64});
    flood(S, 600);
    var B = Math.min(512 - 64, 48 * 25), floodLive = byRecipe(S, 'test.flood').length;
    G.fxEmit('test.feedback', 200, 180, 30, {color: '#bb66ff'}); ticks(1);
    var fb = byRecipe(S, 'test.feedback');
    check('B3a: the flood fills B and feedback is admitted above it from the reserve', floodLive === B && S.count === B + 15 &&
      fb.length === 15 && fb.every(function (i) { return i >= B; }) && S.stats.stolen === 0,
      {B: B, flood: floodLive, feedback: fb.length, slots: fb.slice(0, 3), stolen: S.stats.stolen});
    S = install(512, 304, {reserve: 0});
    flood(S, 600);
    var full = S.count;
    G.fxEmit('test.feedback', 200, 180, 30, {color: '#bb66ff'}); ticks(1);
    fb = byRecipe(S, 'test.feedback');
    check('B3b: with no reserve feedback steals from the weather class', full === 512 && fb.length === 15 &&
      S.stats.stolen >= 15 && S.stolenByClass[0] === S.stats.stolen, {full: full, feedback: fb.length, stolen: S.stats.stolen, byClass: Array.from(S.stolenByClass)});
    // S4: B3a again with the shipping tome burst (burst.tome) from a real
    // pickup event, on the shipping table plus the test flood; the 2D view
    // keeps the ambient field empty, so the flood alone fills B.
    var shipping = G.compileFxRecipes(Object.assign({}, G.FX_RECIPE_SOURCE, TEST_RECIPES), G.FX_MATERIALS), shipFlood = -1, tomes = [];
    G.MODE3D = false;
    try {
      S = install(512, 306, {reserve: 64, compiled: shipping});
      flood(S, 600); shipFlood = byRecipe(S, 'test.flood').length;
      G.fxEvent('pickup', {x: 200, y: 180, renderFloorZ: 10}, 'tome', '#bb66ff'); ticks(1);
      tomes = byRecipe(S, 'burst.tome');
    } finally { G.MODE3D = true; }
    check('B3a on the shipping tome burst: all 15 are admitted from the reserve above a full budget', shipFlood === B && tomes.length === 15 &&
      tomes.every(function (i) { return i >= B; }) && S.stats.stolen === 0, {seed: 306, B: B, flood: shipFlood, tome: tomes.length, stolen: S.stats.stolen});
    S = install(512, 305, {reserve: 64});
    var combatCap = Math.floor(0.35 * Math.min(512 - 64, 48 * 25));
    G.fxEmit('test.combat', 190, 180, 5, {count: 200}); ticks(1);
    check('debris at the combat cap is refused and counted', byRecipe(S, 'test.combat').length === combatCap &&
      S.stats.refusedCap === 200 - combatCap && S.stats.stolen === 0, {live: byRecipe(S, 'test.combat').length, cap: combatCap, refused: S.stats.refusedCap});
  });

  // B3c: the steal policy (spec 6.2): the lowest class below the spawn's
  // first, then the oldest normalized age; never the spawn's own class. A
  // 64-slot pool is scanned whole, so the choice does not depend on the
  // cursor. Oracle: the harness's own spawn order (all lives are 100 s, so
  // earlier spawned = older), by class.
  run('B3c steal order', function () {
    scene('flat'); var S = install(64, 313, {reserve: 0}), born = {}, tickNo = 0;
    function tag() { for (var i = 0; i < S.count; i++) if (!(S.seedA[i] in born)) born[S.seedA[i]] = {tick: tickNo, cls: S.cls[i]}; }
    G.fxEmit('test.combat', 150, 150, 5, {count: 12}); ticks(1); tag(); tickNo++;       // oldest of all
    for (var k = 0; k < 32; k++) {
      G.fxEmit('test.flood', 150, 150, 5, {count: 1});
      if (k < 20) G.fxEmit('test.mote', 150, 150, 5, {count: 1});
      ticks(1); tag(); tickNo++;
    }
    function seedsOf(c, pick) {
      return Object.keys(born).filter(function (s) { return born[s].cls === c; }).map(Number)
        .sort(function (a, b) { return born[a].tick - born[b].tick; }).filter(function (s, idx, all) { return pick(idx, all.length); });
    }
    function alive(s) { return find(S, s) >= 0; }
    var full = S.count, classes = Array.from(S.classLive);
    G.fxEmit('test.feedback', 150, 150, 20, {count: 10, color: '#bb66ff'}); ticks(1);
    var oldWeather = seedsOf(0, function (i) { return i < 10; }), youngWeather = seedsOf(0, function (i) { return i >= 10; });
    var firstOk = oldWeather.every(function (s) { return !alive(s); }) && youngWeather.every(alive) &&
      seedsOf(1, function () { return true; }).every(alive) && seedsOf(3, function () { return true; }).every(alive);
    var firstStolen = Array.from(S.stolenByClass);
    G.fxEmit('test.feedback', 150, 150, 20, {count: 30, color: '#bb66ff'}); ticks(1);
    var oldMotes = seedsOf(1, function (i) { return i < 8; }), youngMotes = seedsOf(1, function (i) { return i >= 8; });
    var secondOk = seedsOf(0, function () { return true; }).every(function (s) { return !alive(s); }) &&
      oldMotes.every(function (s) { return !alive(s); }) && youngMotes.every(alive) && seedsOf(3, function () { return true; }).every(alive);
    check('the B3c pool is full with weather, ambient and combat', full === 64 && classes[0] === 32 && classes[1] === 20 && classes[3] === 12,
      {seed: 313, count: full, byClass: classes});
    check('feedback steals the lowest class first, oldest normalized age first', firstOk && secondOk &&
      firstStolen.join() === '10,0,0,0,0' && Array.from(S.stolenByClass).join() === '32,8,0,0,0' && byRecipe(S, 'test.feedback').length === 40,
      {seed: 313, first: {ok: firstOk, byClass: firstStolen}, second: {ok: secondOk, byClass: Array.from(S.stolenByClass)},
        feedback: byRecipe(S, 'test.feedback').length});
    // A pool full of feedback and combat, combat below its class cap (22): a
    // combat burst reaches the steal scan, finds no lower class and is
    // refused; it never steals from its own class.
    S = install(64, 314, {reserve: 0});
    G.fxEmit('test.feedback', 150, 150, 20, {count: 50, color: '#bb66ff'}); G.fxEmit('test.combat', 150, 150, 5, {count: 14}); ticks(1);
    var fullFb = S.count, refused0 = S.stats.refusedBudget;
    G.fxEmit('test.combat', 150, 150, 5, {count: 5}); ticks(1);
    check('a burst never steals from its own class', fullFb === 64 && S.classLive[3] === 14 && S.stats.stolen === 0 &&
      S.stats.refusedBudget - refused0 === 5 && byRecipe(S, 'test.combat').length === 14,
      {seed: 314, full: fullFb, combat: S.classLive[3], stolen: S.stats.stolen, refused: S.stats.refusedBudget - refused0});
  });

  // B4: exp-drag ballistic motion, analytic against 60 Hz and 120 Hz steps.
  run('B4 tick-rate independence', function () {
    scene('flat');
    var D = 1.2, g = 420, T = 0.8, dir = [0.6, 0.8], v0 = [100 * dir[0], 100 * dir[1], 80], p0 = [100, 100, 300];
    function analytic(t) {
      var f = (1 - Math.exp(-D * t)) / D;
      return [p0[0] + v0[0] * f, p0[1] + v0[1] * f, p0[2] + (v0[2] + g / D) * f - g * t / D];
    }
    function runAt(dt) {
      var S = install(64, 404);
      G.fxEmit('test.bone', p0[0], p0[1], p0[2], {count: 1, dx: dir[0], dy: dir[1], dz: 0});
      ticks(Math.round(T / dt), dt);
      var i = byRecipe(S, 'test.bone')[0];
      return [S.x[i], S.y[i], S.z[i]];
    }
    var a = analytic(T), r60 = runAt(1 / 60), r120 = runAt(1 / 120);
    function err(p) { return Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]); }
    check('motion is independent of tick rate', err(r60) <= 0.5 && err(r120) <= 0.5 && Math.hypot(a[0] - p0[0], a[2] - p0[2]) > 50,
      {analytic: a, at60: r60, at120: r120, err60: err(r60), err120: err(r120)});
    // Legacy bone friction (x *= 0.96 per 60 Hz tick) restated: it diverges.
    function legacy(dt) { var x = 0, v = v0[0]; for (var t = 0; t < Math.round(T / dt); t++) { x += v * dt; v *= 0.96; } return x; }
    check('legacy per-tick friction diverges between 60 and 120 Hz (combat-14)', Math.abs(legacy(1 / 60) - legacy(1 / 120)) > 0.5,
      {at60: legacy(1 / 60), at120: legacy(1 / 120)});
  });

  // B5: a bouncing chip comes to rest on the ramp plane z = x tan 20 deg.
  run('B5 sloped support', function () {
    scene('ramp'); var S = install(64, 505);
    var x0 = 100, z0 = x0 * TAN20 + 30;
    G.fxEmit('test.chip', x0, 150, z0, {count: 1, dx: 1, dy: 0, dz: 0});
    ticks(1); var i = byRecipe(S, 'test.chip')[0], seed = S.seedA[i], rested = -1;
    for (var k = 0; k < 240 && rested < 0; k++) { ticks(1); i = find(S, seed); if (i >= 0 && (S.flags[i] & 1)) rested = k; }
    i = find(S, seed);
    var cells = i >= 0 ? Math.floor(S.x[i] / GS) - Math.floor(x0 / GS) : 0, plane = i >= 0 ? S.x[i] * TAN20 + 0.3 : NaN;
    check('the chip bounces across at least two cells before resting', rested >= 0 && cells >= 2 && S.stats.groundMiss >= 3,
      {seed: 505, restTick: rested, cells: cells, misses: S.stats.groundMiss});
    check('particles rest on the exact sloped support', i >= 0 && near(S.z[i], plane, 1e-9),
      {seed: 505, restTick: rested, z: i >= 0 ? S.z[i] : null, plane: plane, x: i >= 0 ? S.x[i] : null, tolerance: 1e-9});
    scene('flat'); S = install(64, 505);
    G.fxEmit('test.chip', x0, 150, 30, {count: 1, dx: 1, dy: 0, dz: 0});
    ticks(240); i = byRecipe(S, 'test.chip')[0];
    check('a flat mesh rests at 0 (plus the rest lift)', i >= 0 && (S.flags[i] & 1) && near(S.z[i], 0.3),
      {seed: 505, ticks: 240, z: i >= 0 ? S.z[i] : null, expected: 0.3, tolerance: 1e-9});
  });

  // B6: the last row/column has no triangle; support is the flat layer value
  // of the authored cell (column w-1, row h-1 and the corner).
  run('B6 mesh edge', function () {
    scene('ramp'); var S = install(64, 606), last = (W - 1) * GS + 6, mid = 15 * GS + 6, xIn = (W - 2) * GS + 6;
    function flat(cx, cy) { return MESHES.ramp.l0TopZ[cy * W + cx] * 25; }
    var cases = [{name: 'last column', x: last, y: mid, z: flat(W - 1, 15)}, {name: 'last row', x: mid, y: last, z: flat(15, W - 1)},
      {name: 'corner', x: last, y: last, z: flat(W - 1, W - 1)}];
    cases.forEach(function (c) { G.fxEmit('test.faller', c.x, c.y, c.z + 20, {count: 1}); });
    G.fxEmit('test.faller', xIn, mid, xIn * TAN20 + 20, {count: 1});
    ticks(60);
    var list = byRecipe(S, 'test.faller'), bad = [];
    function at(x, y) { return list.filter(function (i) { return Math.abs(S.x[i] - x) < 1e-6 && Math.abs(S.y[i] - y) < 1e-6; })[0]; }
    cases.forEach(function (c) {
      var i = at(c.x, c.y);
      if (i === undefined || !near(S.z[i], c.z + 0.3)) bad.push({cell: c.name, z: i === undefined ? 'killed' : S.z[i], expected: c.z + 0.3});
    });
    check('support is finite on the last row and column', !bad.length, {seed: 606, ticks: 60, alive: list.length, bad: bad, tolerance: 1e-9});
    var inner = at(xIn, mid);
    check('one cell in rests on the triangle', inner !== undefined && near(S.z[inner], xIn * TAN20 + 0.3),
      {seed: 606, z: inner !== undefined ? S.z[inner] : null, expected: xIn * TAN20 + 0.3, tolerance: 1e-9});
  });

  // B7: strata in a cave (floor 0, ceiling 100 u, cap 125 u).
  run('B7 strata', function () {
    scene('cave'); var S = install(64, 707), y = 150;
    function drop(x, z) { G.fxEmit('test.faller', x, y, z, {count: 1}); ticks(1); var l = byRecipe(S, 'test.faller'); return S.seedA[l[l.length - 1]]; }
    var roof = drop(60, 140), inside = drop(96, 50), dripAt = drop(132, 100 - 2), chip = drop(168, 99);
    ticks(120);
    function restZ(seed) { var i = find(S, seed); return i >= 0 && (S.flags[i] & 1) ? S.z[i] : NaN; }
    var got = {roof: restZ(roof), inside: restZ(inside), drip: restZ(dripAt), chip: restZ(chip)};
    got.seed = 707; got.expected = {roof: 125.3, inside: 0.3, drip: 0.3, chip: 0.3}; got.tolerance = 1e-9;
    check('a roof mote lands on the cap', near(got.roof, 125.3), got);
    check('the cave mote picks the floor', near(got.inside, 0.3), got);
    check('a drip at ceiling - 2 lands on the cave floor', near(got.drip, 0.3) && near(got.chip, 0.3), got);
    // A spore gliding past the midpoint (70 u) through several cells stays in the cave.
    G.fxEmit('test.glider', 60, y, 72, {count: 1, dx: 1, dy: 0, dz: 0}); ticks(1);
    var spore = S.seedA[byRecipe(S, 'test.glider')[0]], misses = S.stats.groundMiss;
    ticks(60);
    var si = find(S, spore);
    check('a spore past the midpoint keeps the cave floor as its support', si >= 0 && near(S.z[si], 72) && S.stats.groundMiss - misses >= 2,
      {seed: 707, z: si >= 0 ? S.z[si] : null, expected: 72, misses: S.stats.groundMiss - misses});
    // Ramp: a glider spawned inside cell gx, 3 u below that cell's own lowest
    // corner (authored), so no support is at or below it there: the fill must
    // fall back to the nearest layer and the clamp lifts it onto the plane.
    scene('ramp'); S = install(64, 708);
    var gx = 10, gyC = Math.floor(y / GS), x0 = gx * GS + 2, below = gx * GS * TAN20 - 3, cellFloor = MESHES.ramp.l0TopZ[gyC * W + gx] * 25;
    G.fxEmit('test.glider', x0, y, below, {count: 1, dx: 1, dy: 0, dz: 0}); ticks(1);
    var gi = byRecipe(S, 'test.glider')[0], first = gi === undefined ? null : {x: S.x[gi], z: S.z[gi], fills: S.stats.groundMiss};
    ticks(5); gi = byRecipe(S, 'test.glider')[0];
    check('the fallback fixture starts below every support of its own cell', Math.floor(x0 / GS) === gx && below < cellFloor - 1,
      {seed: 708, cell: gx, spawnZ: below, cellFloor: cellFloor});
    check('a particle below every support in its cell takes the nearest layer', first !== null && first.fills === 1 &&
      Math.floor(first.x / GS) === gx && near(first.z, first.x * TAN20 + 0.5) && gi !== undefined && near(S.z[gi], S.x[gi] * TAN20 + 0.5),
      {seed: 708, tick: 1, alive: gi !== undefined, first: first, plane: first && first.x * TAN20 + 0.5, tolerance: 1e-9});
  });

  // B8: presentation back-projects on the interpolation timeline.
  run('B8 presentation', function () {
    scene('flat'); var S = install(64, 808), out = new Float64Array(4);
    G.fxEmit('test.walker', 100, 100, 50, {count: 1, dx: 0.6, dy: 0.8, dz: 0});
    ticks(1);
    var i = byRecipe(S, 'test.walker')[0];
    G.renderPresentationAlpha = 0; G.fxPresentInto(S, i, G.fxPresentationBack(S), out);
    var born = [out[0], out[1], out[2]];
    ticks(9);
    var prev = [S.x[i], S.y[i], S.z[i]]; ticks(1);
    var cur = [S.x[i], S.y[i], S.z[i]], bad = [];
    [0, 0.25, 0.5, 1].forEach(function (alpha) {
      G.renderPresentationAlpha = alpha; G.fxPresentInto(S, i, G.fxPresentationBack(S), out);
      for (var a = 0; a < 3; a++) if (!near(out[a], prev[a] + (cur[a] - prev[a]) * alpha, 1e-9)) bad.push({alpha: alpha, axis: a, got: out[a]});
    });
    G.renderPresentationAlpha = 1;
    check('particles share the interpolation timeline', !bad.length && cur[0] - prev[0] > 0.4,
      {seed: 808, tick: 11, alphas: [0, 0.25, 0.5, 1], bad: bad, prev: prev, cur: cur, tolerance: 1e-9});
    check('a newborn draws at its spawn point', near(born[0], 100) && near(born[1], 100) && near(born[2], 50),
      {seed: 808, tick: 1, alpha: 0, born: born, expected: [100, 100, 50], tolerance: 1e-9});
    // A bounce this tick: never presented below the floor it just hit.
    S = install(64, 809);
    G.fxEmit('test.chip', 100, 150, 20, {count: 1, dx: 1, dy: 0, dz: 0});
    var bounced = -1;
    for (var k = 0; k < 120 && bounced < 0; k++) {
      ticks(1); var j = byRecipe(S, 'test.chip')[0];
      if (j !== undefined && (S.flags[j] & 2) && S.vz[j] > 0) bounced = j;
    }
    G.renderPresentationAlpha = 0; if (bounced >= 0) G.fxPresentInto(S, bounced, G.fxPresentationBack(S), out); G.renderPresentationAlpha = 1;
    check('a just-bounced particle is never below its support', bounced >= 0 && out[2] >= 0,
      {seed: 809, alpha: 0, z: out[2], support: 0, bounced: bounced});
    // The real interpolated frame publishes its blend and restores 1.
    G.running = true; G.menuOpen = G.settingsOpen = G.overviewActive = G.gameOverState = false;
    G.resetRenderInterpolation(); G.captureRenderInterpolation(); G.finishRenderInterpolation();
    var seen = null;
    G.renderInterpolatedFrame(0.25, function () { seen = G.renderPresentationAlpha; });
    var after = G.renderPresentationAlpha;
    G.resetRenderInterpolation();
    var snapped = null; G.renderInterpolatedFrame(0.25, function () { snapped = G.renderPresentationAlpha; });
    check('renderInterpolatedFrame publishes its blend and restores 1', seen === 0.25 && after === 1 && snapped === 1,
      {seen: seen, after: after, snapped: snapped});
  });

  // B10: the pool is a pure function of seed and inputs, palette included.
  function script(S, colours) {
    colours.forEach(function (c, k) { G.fxEmit('test.feedback', 150 + 10 * k, 180, 20, {color: c, count: 6}); });
    G.fxEmit('test.chip', 160, 180, 30, {count: 5, dx: 1, dy: 0, dz: 0});
    ticks(30);
  }
  function poolHash(S) {
    var parts = [S.count, S.serial, S.dynCount];
    for (var i = 0; i < S.count; i++) {
      parts.push(S.x[i].toFixed(9), S.y[i].toFixed(9), S.z[i].toFixed(9), S.vx[i].toFixed(9), S.vz[i].toFixed(9), S.age[i].toFixed(9),
        S.life[i].toFixed(9), S.size[i].toFixed(9), S.seedA[i], S.rec[i], S.pal[i], S.flags[i], S.cls[i]);
    }
    return parts.join(',');
  }
  // Oracle for palette indices: the k-th distinct event colour since a
  // state's creation or reset is entry PAL.count + k (spec 4.5).
  function eventPals(S) {
    var seen = {};
    byRecipe(S, 'test.feedback').forEach(function (i) { seen[S.pal[i]] = true; });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }
  run('B10 determinism', function () {
    scene('flat');
    var REF = ['#a1b2c3', '#c3a1b2', '#b2c3a1'];           // used by no other case
    var S = install(512, 1010); script(S, REF); var first = poolHash(S), P = S.C.PAL.count, want = JSON.stringify([P, P + 1, P + 2]);
    var firstPals = JSON.stringify(eventPals(S));
    // A studio-like pool and a different world intern other colours first.
    var studio = install(512, 7); script(studio, ['#123456', '#654321']);
    var other = install(512, 1011); script(other, ['#abcdef', '#c3a1b2', '#fedcba']);
    G.fxReset('world', other);
    var cleared = other.dynCount === 0 && other.count === 0;
    G.fxState = other; script(other, REF);
    var afterReset = JSON.stringify(eventPals(other));
    S = install(512, 1010); script(S, REF); var second = poolHash(S);
    var diff = install(512, 1012); script(diff, REF);
    check('the pool is a pure function of seed and inputs', first === second && S.dynCount === 3,
      {seed: 1010, ticks: 30, same: first === second, first: first.slice(0, 120), second: second.slice(0, 120), dyn: S.dynCount});
    check('event colours are interned per state since its reset', firstPals === want && JSON.stringify(eventPals(S)) === want &&
      afterReset === want && cleared, {want: want, first: firstPals, second: JSON.stringify(eventPals(S)), afterReset: afterReset, cleared: cleared});
    check('a different seed gives a different pool', poolHash(diff) !== first,
      {seeds: [1010, 1012], ticks: 30, first: first.slice(0, 120), other: poolHash(diff).slice(0, 120)});
  });

  // B11: recipe typos fail at load with named errors.
  run('B11 compiler', function () {
    var WEATHER = G.FX_FIELD_SOURCE.weather;                                          // S7's weather field (target 'weather')
    var base = {class:'combat', trigger:{api:true}, color:{material:'fxDebris', roles:['spark']}, motion:{model:'static'},
      life:{seconds:[1, 2]}, render:{primitive:'dot', size:[0.3, 0.3]}, view2D:'dot'};
    function variant(patch, drop) {
      var d = JSON.parse(JSON.stringify(base));
      Object.keys(patch).forEach(function (k) { d[k] = patch[k]; });
      (drop || []).forEach(function (k) { delete d[k]; });
      return d;
    }
    var bad = [
      ['unknown top-level key', {x: variant({colour: 'red'})}, /unknown key colour/],
      ['unknown nested key', {x: variant({spawn: {shape: 'point', speeed: [1, 2]}})}, /unknown key spawn\.speeed/],
      ['a random key', {x: variant({motion: {model: 'static', random: true}})}, /random is not a flag/],
      ['inverted range', {x: variant({life: {seconds: [2, 1]}})}, /life\.seconds is inverted/],
      ['negative size', {x: variant({render: {primitive: 'dot', size: [-1, 1]}})}, /render\.size is out of range/],
      ['fade over 1', {x: variant({life: {seconds: [1, 2], fade: [0.6, 0.6]}})}, /fade in \+ out exceeds 1/],
      ['unknown enum', {x: variant({occlusion: 'sampled'})}, /occlusion sampled is not one of/],
      ['unknown role', {x: variant({color: {material: 'fxDebris', roles: ['glitter']}})}, /has no role glitter/],
      ['unknown material', {x: variant({color: {material: 'fxNothing', roles: ['a']}})}, /unknown material fxNothing/],
      ['eye with footprint', {x: variant({place: 'eye', occlusion: 'footprint', view2D: 'none'})}, /place eye needs occlusion none/],
      ['eye with a 2D form', {x: variant({place: 'eye', occlusion: 'none', view2D: 'dot'})}, /place eye needs occlusion none/],
      ['onFloor cycle', {a: variant({trigger: {child: true}, collision: {mode: 'kill', onFloor: 'b'}}),
        b: variant({trigger: {child: true}, collision: {mode: 'kill', onFloor: 'a'}})}, /onFloor cycle/],
      ['onFloor target without child trigger', {x: variant({collision: {mode: 'kill', onFloor: 'y'}}), y: variant({})}, /needs trigger \{child:true\}/],
      ['extends cycle', {a: variant({extends: 'b'}), b: variant({extends: 'a'})}, /extends cycle/],
      ['unknown event', {x: variant({trigger: {event: 'chestOpen'}})}, /unknown event chestOpen/],
      ['unknown anchor', {x: variant({trigger: {anchor: 'beam', rate: 5}})}, /unknown anchor beam/],   // (flameStream is S8's anchor)
      ['unknown event kind', {x: variant({trigger: {event: 'pickup', where: {kind: ['coin']}}})}, /has no kind coin/],
      ['missing view2D', {x: variant({}, ['view2D'])}, /missing view2D/],
      ['glowRole with a dynamic colour', {x: variant({color: 'event', render: {primitive: 'glowDot', size: [1, 1], glow: 2, glowRole: 'light'}})}, /glowRole needs a fixed color material/],
      ['glowRole the material lacks', {x: variant({render: {primitive: 'glowDot', size: [1, 1], glow: 2, glowRole: 'core'}})}, /has no glowRole core/],
      ['weights of the wrong length', {x: variant({color: {material: 'fxDebris', roles: ['spark', 'dust'], weights: [1]}})}, /color\.weights must match roles/],
      ['streak without streakSeconds', {x: variant({render: {primitive: 'streak', size: [1, 1]}})}, /streak needs render\.streakSeconds/],
      ['non-positive mean life', {x: variant({motion: {model: 'fall'}, spawn: {support: 'openSky', height: [0, 0], up: [-10, -5]},
        life: {seconds: [1, 2], untilGround: true}})}, /mean life 0 is not positive/],
      ['unknown toggle', {x: variant({toggle: 'fxRain'})}, /unknown toggle fxRain/],
      ['lod near beyond far', {x: variant({lod: {near: 300, far: 200}})}, /lod\.near must be below lod\.far/],
      ['eye with a wall collision', {x: variant({place: 'eye', occlusion: 'none', view2D: 'none', collision: {mode: 'none', wall: true}})}, /place eye needs occlusion none/],
      ['unknown weather kind', {x: variant({trigger: {field: 'weather', kind: 'hail'}})}, /trigger\.kind hail is not one of rain snow ash/, {weather: WEATHER}],
      // S7: a weather member names its kind; the snow-line swap and a kind
      // belong to weather fields; 2D splashes need a splash; one 2D policy per kind.
      ['a weather member without a kind', {x: variant({trigger: {field: 'weather', sets: {rain: 1}}})}, /a weather field trigger needs kind/, {weather: WEATHER}],
      ['a kind on an ambient field', {x: variant({trigger: {field: 'ambient', kind: 'rain'}})}, /trigger\.kind is only for a weather field/],
      ['a snow-line swap on an ambient member', {x: variant({trigger: {field: 'ambient', sets: {meadow: 1}, aboveSnowLine: 'x'}})},
        /trigger\.aboveSnowLine is only for a weather field/],
      ['2D splashes with no splash', {x: variant({mode2D: 'splashOnly'})}, /mode2D splashOnly needs collision\.onFloor/],
      ['a set the field does not have', {x: variant({trigger: {field: 'ambient', sets: {swamp: 1}}})}, /field ambient has no set swamp/],
      // S3 fix: the integrator couples wind through drag; drift has none, so the coefficient was dead.
      ['wind without drag', {x: variant({motion: {model: 'drift', wind: 0.3}})}, /motion\.wind needs drag > 0/]
    ];
    var misses = bad.filter(function (b) {
      try { G.compileFxRecipes(b[1], G.FX_MATERIALS, b[3]); return true; } catch (e) { return !/^Particle recipe \w+: /.test(e.message) || !b[2].test(e.message); }
    }).map(function (b) { return b[0]; });
    // Positive controls: the same shapes, valid, compile.
    var good = [['eye without collision', {x: variant({place: 'eye', occlusion: 'none', view2D: 'none'})}],
      ['wind with drag', {x: variant({motion: {model: 'drift', drag: 0.5, wind: 0.3}})}],
      ['a rain member of the weather field', {x: variant({trigger: {field: 'weather', kind: 'rain'}})}, {weather: WEATHER}]];
    good.forEach(function (g) { try { G.compileFxRecipes(g[1], G.FX_MATERIALS, g[2]); } catch (e) { misses.push(g[0] + ' was rejected: ' + e.message); } });
    check('recipe typos fail at load with a named error', !misses.length, {accepted: misses});
    // Field definitions (S3) fail at load with their own named error.
    var fieldBad = [['a field without a box', {edgeFade: 0.1}, /box needs half > 0/],
      ['an unknown field key', {box: {half: 10, bias: 0}, edgeFade: 0.1, radius: 3}, /unknown key radius/],
      ['a biome in two sets', {box: {half: 10, bias: 0}, edgeFade: 0.1, sets: {a: ['ice'], b: ['ice']}}, /repeats or misnames biome ice/],
      ['two underground sets', {box: {half: 10, bias: 0}, edgeFade: 0.1, sets: {a: 'playerUnderground', b: 'playerUnderground'}}, /two underground sets/]];
    fieldBad.push(['a weather field with sets', {box: {half: 10, bias: 0}, edgeFade: 0.1, target: 'weather', sets: {a: ['ice']}}, /takes its sets from the weather kinds/],
      ['a weather field of disagreeing 2D policies', {box: {half: 10, bias: 0}, edgeFade: 0.1, target: 'weather'}, /the rain members disagree on mode2D/,
        {y: variant({trigger: {field: 'f', kind: 'rain'}, mode2D: 'none'})}]);
    var fieldMisses = fieldBad.filter(function (b) {
      try { G.compileFxRecipes(Object.assign({x: b[3] ? variant({trigger: {field: 'f', kind: 'rain'}}) : base}, b[3]), G.FX_MATERIALS, {f: b[1]}); return true; }
      catch (e) { return !/^Particle field f: /.test(e.message) || !b[2].test(e.message); }
    }).map(function (b) { return b[0]; });
    check('field definitions fail at load with a named error', !fieldMisses.length && G.FX_COMPILED.FIELDS.length === 2 &&
      G.FX_COMPILED.FIELDS[0].name === 'ambient' && G.FX_COMPILED.FIELDS[1].name === 'weather' && G.FX_COMPILED.FIELDS[1].weather,
      {accepted: fieldMisses, fields: G.FX_COMPILED.FIELDS.map(function (F) { return F.name; })});
    var loadError = null;
    try { G.fxAssertEngineTables(Object.assign({chestOpen: {family: null, kinds: []}}, G.FX_EVENTS), G.FX_ANCHOR_NAMES); } catch (e) { loadError = e.message; }
    check('the engine load assertion names an event without a reader', loadError === 'Particle engine: event chestOpen has no reader', {error: loadError});
    var required = ['mote', 'feedbackBurst', 'ambient.dust', 'ambient.firefly', 'ambient.snowflake', 'ambient.sparkle', 'ambient.sandDust',
      'ambient.shimmer', 'ambient.drip', 'ambient.dripRipple', 'ambient.spore', 'ambient.caveDust', 'torch.ember',          // through S3
      'bone.enemy', 'bone.spawner', 'burst.tome', 'burst.stat', 'burst.shrine', 'burst.phoenixRing', 'burst.phoenixEmbers',
      'burst.thunder', 'burst.allyDeath',                                                                                    // S4
      'impact.spark', 'impact.chip', 'impact.chipFall', 'impact.dust', 'impact.slimeSplat', 'melee.spark',                   // S5
      'step.dust', 'step.land', 'step.dash', 'step.dashTrail', 'screen.dashDust',                                           // S6
      'weather.rain', 'weather.splash', 'weather.snow', 'weather.ash', 'weather.cinder'];                                   // S7
    check('the shipping table has every recipe this slice requires', required.every(function (id) { return id in G.FX_COMPILED.ID; }) &&
      G.FX_COMPILED.count === Object.keys(G.FX_RECIPE_SOURCE).length, {ids: Object.keys(G.FX_COMPILED.ID)});
    // extends replaces color whole: a child naming one role never inherits its base's two weights.
    var merged = null;
    try {
      var t = compileUnderTest({a: variant({color: {material: 'fxWeather', roles: ['ash', 'ashLit'], weights: [0.65, 0.35]}}),
        b: {extends: 'a', color: {material: 'fxWeather', roles: ['cinder']}}}, G.FX_MATERIALS);
      merged = t.PAL.specCount[t.R.colorSpec[t.ID.b]];
    } catch (e) { merged = e.message; }
    check('the extends merge replaces color whole', merged === 1, {result: merged});
    // Scalars replace too: a child moves its base's burst into eye space.
    var placed = null;
    try {
      var tp = compileUnderTest({base: variant({place: 'sourceOrFront', placeParams: {near: 48, distance: 34}}),
        eye: {extends: 'base', place: 'eye', occlusion: 'none', view2D: 'none', placeParams: {distance: 20}}}, G.FX_MATERIALS);
      placed = [G.FX_ENUMS.place[tp.R.place[tp.ID.eye]], tp.R.pNear[tp.ID.eye], tp.R.pDist[tp.ID.eye], G.FX_ENUMS.place[tp.R.place[tp.ID.base]]];
    } catch (e) { placed = e.message; }
    check('extends replaces scalars and merges plain objects key by key', JSON.stringify(placed) === '["eye",48,20,"sourceOrFront"]', {result: placed});
  });

  // Surface colours (spec 4.5): the biome's floor band 5, snow on ice, the
  // cave stone when underground; anchors resolve the biome at spawn.
  run('palette sources', function () {
    scene('flat'); var S = install(256, 1313);
    function packed(hex) { return parseInt(hex.slice(1), 16); }
    function colours(filter) {
      return byRecipe(S, 'test.dust').filter(filter).map(function (i) { return S.C.PAL.rgb[S.pal[i]]; });
    }
    try {
      G.terrain = 'forest';
      G.fxEmit('test.dust', 150, 150, 10, {count: 4}); G.fxEmit('test.dust', 150, 150, 10, {count: 4, under: true});
      var h = G.fxAttach('test.dust', {x: 160, y: 150, z: 10}, {rate: 240}); ticks(1); G.fxDetach(h);
      var forest = colours(function (i) { return !(S.flags[i] & 32) && S.owner[i] < 0; });
      var anchored = colours(function (i) { return S.owner[i] >= 0; }), under = colours(function (i) { return S.flags[i] & 32; });
      G.terrain = 'ice'; G.fxEmit('test.dust', 150, 150, 10, {count: 4}); ticks(1);
      var ice = colours(function (i) { return S.age[i] < 0.02 && !(S.flags[i] & 32) && S.owner[i] < 0; });
    } finally { G.terrain = 'ground'; }
    var band = packed(G.BIOME_PALETTE.forest.floorBands[5]), damp = G.GAME_MATERIALS.caveStone.packed.damp, snow = packed(G.FX_MATERIAL_COLORS.fxWeather.snow);
    function all(list, v) { return list.length >= 4 && list.every(function (c) { return c === v; }); }
    check('surface colours follow the biome and the stratum', all(forest, band) && all(anchored, band) && all(under, damp) && all(ice, snow),
      {forest: forest, anchored: anchored, under: under, ice: ice, want: {band: band, damp: damp, snow: snow}});
  });

  // Distance LOD at spawn (spec 6.3): keep 1 to near, farKeep at far, 0
  // beyond cull; a farther burst shows a prefix of the same particles.
  run('LOD', function () {
    scene('flat');
    function keep(d) { return d <= 50 ? 1 : d > 400 ? 0 : d >= 250 ? 0.4 : 1 + (0.4 - 1) * (d - 50) / 200; }   // restated
    var got = [], seeds = [];
    [20, 150, 300, 500].forEach(function (d) {
      var S = install(512, 606);
      G.fxEmit('test.lod', G.cam.x + d, G.cam.y, 10); ticks(1);
      var list = byRecipe(S, 'test.lod');
      got.push({d: d, n: list.length, want: Math.round(20 * keep(d))});
      seeds.push(list.map(function (i) { return S.seedA[i]; }));
    });
    var prefix = seeds.every(function (list) { return list.every(function (x) { return seeds[0].indexOf(x) >= 0; }); });
    check('spawn counts follow the distance LOD and thin to a subset', got.every(function (g) { return g.n === g.want; }) &&
      got[1].n === 14 && got[3].n === 0 && prefix, {got: got, prefix: prefix});
    // Ring bursts (S4 review): a lower Particles setting keeps a prefix of the
    // same serials. Each survivor keeps its heading (the radial velocity's
    // direction), and the prefix still goes round the ring: no gap wider than
    // two even slots of the spawned count.
    function ringHeadings(P) {
      G.settings.particles = P;
      var S = install(512, 707), out = {};
      G.fxEmit('test.feedback', G.cam.x + 30, G.cam.y, 10, {count: 15}); ticks(1);
      byRecipe(S, 'test.feedback').forEach(function (i) { out[S.seedA[i]] = Math.atan2(S.vy[i], S.vx[i]); });
      G.settings.particles = 25;
      return out;
    }
    var full = ringHeadings(25), low = ringHeadings(10), lowKeys = Object.keys(low), sameHeading = 0, moved = [];
    lowKeys.forEach(function (k) {
      var d = k in full ? Math.abs(Math.atan2(Math.sin(full[k] - low[k]), Math.cos(full[k] - low[k]))) : Infinity;
      if (d < 1e-9) sameHeading++; else moved.push(Math.round(d * 1000) / 1000);
    });
    var around = lowKeys.map(function (k) { return (low[k] + 2 * Math.PI) % (2 * Math.PI); }).sort(function (a, b) { return a - b; }), maxGap = 0;
    around.forEach(function (h, q) { maxGap = Math.max(maxGap, (q + 1 < around.length ? around[q + 1] : around[0] + 2 * Math.PI) - h); });
    if (Object.keys(full).length !== 15 || !(lowKeys.length >= 3 && lowKeys.length < 15)) throw Error('SETUP the lower setting did not thin the ring (' + lowKeys.length + ')');
    check('a lower density shows the same ring particles, spread round the ring', sameHeading === lowKeys.length && maxGap < 2 * (2 * Math.PI / lowKeys.length),
      {seed: 707, full: Object.keys(full).length, low: lowKeys.length, sameHeading: sameHeading, moved: moved.slice(0, 3), maxGap: Math.round(maxGap * 1000) / 1000,
        limit: Math.round(4 * Math.PI / lowKeys.length * 1000) / 1000});
  });

  // Anchors (spec 4.3): a segment emits along its whole length; an entity
  // anchor follows its body and ends with it or at its deadline.
  run('anchors', function () {
    scene('flat'); var S = install(1024, 808), p0 = [100, 100, 20], p1 = [220, 160, 50];
    var hs = G.fxAttach('test.seg', {x: p0[0], y: p0[1], z: p0[2], x2: p1[0], y2: p1[1], z2: p1[2]}); ticks(12); G.fxDetach(hs);
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy), off = [], us = [];
    byRecipe(S, 'test.seg').forEach(function (i) {
      var u = ((S.x[i] - p0[0]) * dx + (S.y[i] - p0[1]) * dy) / (L * L), lateral = Math.abs((S.x[i] - p0[0]) * dy - (S.y[i] - p0[1]) * dx) / L;
      us.push(u);
      if (u < -1e-9 || u > 1 + 1e-9 || lateral > 2 * u + 1e-9 || !near(S.z[i], p0[2] + (p1[2] - p0[2]) * u, 1e-6)) off.push({u: u, lateral: lateral, z: S.z[i]});
    });
    check('a segment anchor emits along its whole segment', us.length >= 100 && !off.length && Math.min.apply(null, us) < 0.1 &&
      Math.max.apply(null, us) > 0.9, {n: us.length, off: off.slice(0, 3)});
    var body = {x: 150, y: 150, feetZ: 12, health: 5}, liveAnchors = S.anchors.live;
    var h = G.fxAttach('test.seg', body, {rate: 120, lift: 3}), before = byRecipe(S, 'test.seg').length;
    ticks(3); body.x = 180; ticks(3);
    var near150 = 0, near180 = 0;
    byRecipe(S, 'test.seg').forEach(function (i) { if (S.z[i] === 15) { if (Math.abs(S.x[i] - 150) <= 2) near150++; if (Math.abs(S.x[i] - 180) <= 2) near180++; } });
    body.health = 0; ticks(1); var afterDeath = S.anchors.live, n = byRecipe(S, 'test.seg').length; ticks(3);
    var timed = G.fxAttach('test.seg', {x: 150, y: 150, z: 5}, {rate: 120, until: G.gameTimeNow() - 1}); ticks(1);
    check('an entity anchor follows its body and ends with it or at its deadline', near150 >= 4 && near180 >= 4 && afterDeath === liveAnchors &&
      byRecipe(S, 'test.seg').length === n && S.anchors.live === liveAnchors && !G.fxDetach(h) && !G.fxDetach(timed),
      {seed: 808, near150: near150, near180: near180, afterDeath: afterDeath, live: S.anchors.live});
    // An api recipe has no anchor rate: attaching it without opts.rate would
    // never emit, so it is refused and counted; with a rate it attaches.
    var bad0 = S.stats.badEvents, live0 = S.anchors.live;
    var noRate = G.fxAttach('test.dust', {x: 150, y: 150, z: 5}), zeroRate = G.fxAttach('test.dust', {x: 150, y: 150, z: 5}, {rate: 0});
    var withRate = G.fxAttach('test.dust', {x: 150, y: 150, z: 5}, {rate: 30});
    var refusedOk = noRate === -1 && zeroRate === -1 && S.stats.badEvents - bad0 === 2 && withRate >= 0 && S.anchors.live === live0 + 1;
    G.fxDetach(withRate);
    check('an attach without a positive rate is refused and counted', refusedOk,
      {seed: 808, noRate: noRate, zeroRate: zeroRate, withRate: withRate, counted: S.stats.badEvents - bad0});
    // An object without health (a projectile, pos) follows its source when
    // asked; a plain point is copied and stays where it was attached.
    function trail(opts) {
      var T = install(512, 809), src = {x: 190, y: 180, z: 5}, xs = [];
      var hh = G.fxAttach('test.dust', src, opts);
      for (var k = 0; k < 30; k++) { src.x = 190 + 5 * k; ticks(1); }
      G.fxDetach(hh);
      byRecipe(T, 'test.dust').forEach(function (i) { xs.push(T.x[i]); });
      return {n: xs.length, min: Math.min.apply(null, xs), max: Math.max.apply(null, xs)};
    }
    var followed = trail({rate: 120, follow: true}), fixed = trail({rate: 120});
    check('an attached object follows its source when asked; a plain point stays put', followed.n >= 50 && followed.min <= 195 &&
      followed.max >= 330 && fixed.n >= 50 && fixed.min === 190 && fixed.max === 190,
      {seed: 809, followed: followed, point: fixed, expected: {from: 190, to: 335}});
  });

  // Spawn shapes: a cone burst lies between radius min and max from the event
  // point, within the spread angle of the event direction (the camera's
  // forward when the event has none).
  run('spawn shapes', function () {
    scene('flat'); var S = install(256, 909), bad = [], angles = [];
    function burst(dir, axis) {
      var before = byRecipe(S, 'test.cone').length;
      G.fxEmit('test.cone', 150, 150, 50, dir ? {count: 20, dx: dir[0], dy: dir[1], dz: dir[2]} : {count: 20}); ticks(1);
      var list = byRecipe(S, 'test.cone').slice(before);
      list.forEach(function (i) {
        var ox = S.x[i] - 150, oy = S.y[i] - 150, oz = S.z[i] - 50, len = Math.hypot(ox, oy, oz);
        var ang = Math.acos(Math.max(-1, Math.min(1, (ox * axis[0] + oy * axis[1] + oz * axis[2]) / (len || 1))));
        angles.push(ang);
        if (!(len >= 5 - 1e-9 && len <= 10 + 1e-9 && ang <= 0.4 + 1e-9)) bad.push({len: len, angle: ang, axis: axis});
      });
      return list.length;
    }
    var n1 = burst([0, 1, 0], [0, 1, 0]), n2 = burst(null, [Math.cos(G.cam.ang), Math.sin(G.cam.ang), 0]);
    check('a cone burst spawns within its radius and spread around the event direction', n1 === 20 && n2 === 20 && !bad.length &&
      Math.max.apply(null, angles) > 0.1, {seed: 909, counts: [n1, n2], bad: bad.slice(0, 3), maxAngle: Math.max.apply(null, angles), spread: 0.4});
  });

  // Grid walls (collision.wall): a drop falling onto a wall cell dies at the
  // wall top and leaves its child there; a drop inside the wall below its top
  // dies without one. The authored wall top is 240 (flat floor 0 plus one
  // 240-unit wall). The span is read once per wall cell, not per tick.
  run('grid walls', function () {
    scene('flat'); G.grid[15 * W + 15] = 1;
    var S = install(256, 1111), spans = 0, savedSpan = G.spatialWallSpan;
    G.spatialWallSpan = function () { spans++; return savedSpan.apply(G, arguments); };
    try {
      G.fxEmit('test.walldrop', 186, 186, 300, {count: 6}); G.fxEmit('test.walldrop', 186, 186, 100, {count: 2});
      G.fxEmit('test.walldrop', 150, 150, 50, {count: 2});
      ticks(45);                                   // every drop has landed (38 ticks); no splash has faded (18)
    } finally { G.spatialWallSpan = savedSpan; }
    var splashes = byRecipe(S, 'test.splash').map(function (i) { return Math.round(S.z[i] * 1e6) / 1e6; }).sort(function (a, b) { return a - b; });
    check('grid walls stop drops at the wall top', byRecipe(S, 'test.walldrop').length === 0 && JSON.stringify(splashes) === '[0,0,240,240,240,240,240,240]',
      {seed: 1111, splashes: splashes, expected: '2 at 0, 6 at 240', drops: byRecipe(S, 'test.walldrop').length});
    check('the wall top is read once per wall cell, not per particle tick', spans === 1, {seed: 1111, ticks: 45, spanReads: spans, wallCells: 1});
  });

  // Hard caps (spec 6.5): spawns per tick, the event ring, anchors and the
  // child queue; everything beyond is queued or counted, never dropped silently.
  run('hard caps', function () {
    scene('flat'); var S = install(3072, 707, {reserve: 256}), perTick = [];
    for (var e = 0; e < 3; e++) G.fxEmit('test.feedback', 150, 150, 20, {count: 200});
    for (var k = 0; k < 3; k++) { ticks(1); perTick.push(S.count); }
    check('spawns per tick stay within the cap and later events wait in the queue', JSON.stringify(perTick) === '[200,400,600]' &&
      S.stats.refusedSpawnCap === 0, {perTick: perTick, refused: S.stats.refusedSpawnCap});
    S = install(512, 708);
    for (e = 0; e < 300; e++) G.fxEmit('test.combat', 150, 150, 20, {count: 1});
    var ringFull = S.ev.count, dropped = S.stats.eventsDropped, handles = [];
    for (e = 0; e < 65; e++) handles.push(G.fxAttach('test.stream', {x: 150, y: 150, z: 5}));
    check('the event ring and the anchor table are bounded and count overflow', ringFull === 256 && dropped === 44 &&
      handles.filter(function (h) { return h >= 0; }).length === 64 && handles[64] === -1 && S.stats.anchorsRefused === 1,
      {ring: ringFull, dropped: dropped, refusedAnchors: S.stats.anchorsRefused});
    S = install(3072, 709, {reserve: 256});
    G.fxEmit('test.drop', 150, 150, 0.05, {count: 150}); G.fxEmit('test.drop', 160, 150, 0.05, {count: 150}); ticks(1);
    var falling = byRecipe(S, 'test.drop').length; ticks(1);
    check('the child queue is bounded and counts overflow', falling === 300 && byRecipe(S, 'test.drop').length === 0 &&
      byRecipe(S, 'test.splash').length === 256 && S.stats.refusedChildQueue === 44,
      {seed: 709, falling: falling, children: byRecipe(S, 'test.splash').length, refused: S.stats.refusedChildQueue});
    // Refused work is bounded (spec 3.6, 6.5): a gate or cap refusal ends its
    // burst after one attempt (the rest counted), and a refused steal scan
    // uses up the tick's spawn cap, so later events wait in the ring.
    // Oracle for the budget leg: bursts of 100 refused attempts, each event
    // bounded by ceil(100 x 1.5) = 150, fit three times into 384.
    var calls = 0, savedSpawn = G.fxSpawn, gated = null, budget = null;
    G.fxSpawn = function () { calls++; return savedSpawn.apply(G, arguments); };
    try {
      S = install(3072, 710, {reserve: 256});
      G.setEffectToggle('fxDebris', false);
      for (e = 0; e < 64; e++) G.fxEmit('test.gated', 150, 150, 20, {count: 512});
      calls = 0; ticks(1);
      gated = {seed: 710, attempts: calls, refused: S.stats.refusedToggle, queued: S.ev.count, expected: {attempts: 64, refused: 64 * 512}};
      G.setEffectToggle('fxDebris', true);
      S = install(64, 711, {reserve: 0});
      G.fxEmit('test.feedback', 150, 150, 20, {count: 64, color: '#bb66ff'}); ticks(1);
      for (e = 0; e < 20; e++) G.fxEmit('test.combat', 150, 150, 20, {count: 100});
      calls = 0; ticks(1);
      budget = {seed: 711, full: byRecipe(S, 'test.feedback').length, attempts: calls, refused: S.stats.refusedBudget, queued: S.ev.count,
        spawned: byRecipe(S, 'test.combat').length, expected: {attempts: 300, queued: 17}};
    } finally { G.fxSpawn = savedSpawn; G.setEffectToggle('fxDebris', true); }
    check('a gated burst costs one attempt and counts the rest', gated.attempts === 64 && gated.refused === 64 * 512 && gated.queued === 0, gated);
    check('refused steal scans use up the spawn cap and later events wait', budget.full === 64 && budget.spawned === 0 &&
      budget.attempts === 300 && budget.refused === 300 && budget.queued === 17, budget);
    // An event's size bound covers its scaled bursts: one that does not fit
    // the rest of the tick's spawn cap waits whole for the next tick. (No S2a
    // reader scales an event; the S6 observers will, so the slot is set here.)
    S = install(3072, 712, {reserve: 256}); G.setEffectFamilyMode('pickupBursts', 'new');
    var shrine1 = -1, cut = -1, shrine2 = -1;
    try {
      G.fxEmit('test.feedback', 150, 150, 20, {count: 360, color: '#bb66ff'});
      G.fxEvent('shrine', {x: 160, y: 150, buffType: 'speed'});
      S.ev.scale[(S.ev.head + S.ev.count - 1) % S.ev.n] = 3;
      ticks(1); shrine1 = byRecipe(S, 'test.shrine').length; cut = S.stats.refusedSpawnCap;
      ticks(1); shrine2 = byRecipe(S, 'test.shrine').length;
    } finally { G.setEffectFamilyMode('pickupBursts', null); }
    check('an event whose scaled bursts do not fit waits whole for the next tick', shrine1 === 0 && cut === 0 && shrine2 === 36,
      {seed: 712, firstTick: shrine1, cutByCap: cut, secondTick: shrine2, expected: 36, spawnCap: 384, usedFirst: 360});
  });

  // B12: no construction the harness can observe in 600 mixed ticks.
  run('B12 allocation', function () {
    scene('ramp'); var S = install(1024, 1212), counts = {typed: 0, array: 0}, corners = 0, cornersInto = 0;
    var names = ['Float64Array', 'Float32Array', 'Int32Array', 'Uint32Array', 'Int16Array', 'Uint16Array', 'Uint8Array', 'Array'], saved = {};
    var savedCorners = G.spatialLayerCorners, savedInto = G.spatialLayerCornersInto;
    function scriptTick(k) {
      if (k % 15 === 0) G.fxEmit('test.drop', 120 + (k % 90), 170, 60, {count: 4});
      if (k % 20 === 0) G.fxEmit('test.chip', 140, 180, 60, {count: 4, dx: 1, dy: 0, dz: 0});
      if (k % 25 === 0) G.fxEmit('test.feedback', 200, 180, 40, {count: 6, color: 0x44ffff});
      if (k % 10 === 0) G.fxEmit('test.flood', 210, 200, 20, {count: 30});
      G.updateEffects(DT);
    }
    var handle = G.fxAttach('test.stream', {x: 160, y: 190, z: 30});
    for (var k = 0; k < 60; k++) scriptTick(k);
    var ids = {x: S.x, gcell: S.gcell, childQ: S.childQ, ev: S.ev, KD: S.KD};
    G.spatialLayerCorners = function () { corners++; return savedCorners.apply(G, arguments); };
    G.spatialLayerCornersInto = function () { cornersInto++; return savedInto.apply(G, arguments); };
    names.forEach(function (n) {
      var Orig = saved[n] = G[n];
      var wrapped = function (a, b, c) { if (n === 'Array') counts.array++; else counts.typed++; return n === 'Array' ? Orig.apply(this, arguments) : new Orig(a, b, c); };
      Object.getOwnPropertyNames(Orig).forEach(function (p) { try { if (!(p in wrapped)) wrapped[p] = Orig[p]; } catch (e) {} });
      wrapped.prototype = Orig.prototype; wrapped.isArray = Orig.isArray; wrapped.from = Orig.from;
      G[n] = wrapped;
    });
    var control = 0, spawned0 = S.stats.spawned;
    try {
      new G.Float64Array(4); control = counts.typed; counts.typed = 0;
      for (k = 60; k < 660; k++) scriptTick(k);
    } finally {
      names.forEach(function (n) { G[n] = saved[n]; });
      G.spatialLayerCorners = savedCorners; G.spatialLayerCornersInto = savedInto;
    }
    G.fxDetach(handle);
    var same = ids.x === S.x && ids.gcell === S.gcell && ids.childQ === S.childQ && ids.ev === S.ev && ids.KD === S.KD;
    check('the constructor wrapper sees a construction', control === 1);
    check('the fx paths create no per-particle arrays or objects that the harness can observe', same && !counts.typed && !counts.array &&
      !corners && cornersInto > 0 && S.stats.spawned - spawned0 > 500 && S.stats.children > 0 && S.stats.stolen > 0,
      {same: same, counts: counts, corners: corners, cornersInto: cornersInto, spawned: S.stats.spawned - spawned0, children: S.stats.children,
        stolen: S.stats.stolen});
  });

  // B14: two states with different tables, stepped alternately.
  run('B14 installed tables', function () {
    scene('flat');
    function variantTable(gravity, colour) {
      var src = {'test.stone': {class:'combat', trigger:{api:true}, color:{material:'fxFeedback', roles:[colour]},
        motion:{model:'ballistic', gravity:gravity}, life:{seconds:[5, 5]}, render:{primitive:'dot', size:[0.3, 0.3]}, view2D:'dot'}};
      return G.compileFxRecipes(src, G.FX_MATERIALS);
    }
    var ta = variantTable(100, 'tome'), tb = variantTable(400, 'mana');
    var A = G.createFxState(64, 1, {compiled: ta, pinned: true, reserve: 0}), B = G.createFxState(64, 1, {compiled: tb, pinned: true, reserve: 0});
    [A, B].forEach(function (S) { G.fxState = S; G.fxEmit('test.stone', 100, 100, 500, {count: 1}); });
    for (var k = 0; k < 30; k++) { G.fxState = A; G.updateEffects(DT); G.fxState = B; G.updateEffects(DT); }
    var t = 30 * DT;
    function expected(g) { return 500 - 0.5 * g * t * t; }
    var palA = ta.PAL.rgb[A.pal[0]], palB = tb.PAL.rgb[B.pal[0]];
    check('the engine reads only the recipe table installed in its state', near(A.z[0], expected(100), 1e-6) && near(B.z[0], expected(400), 1e-6) &&
      palA === 0xbb66ff && palB === 0x4488ff, {a: A.z[0], b: B.z[0], ea: expected(100), eb: expected(400), palA: palA, palB: palB});
    var src = G.__engineSource('src/11-fx-engine.js', slurp('assets/games/src/11-fx-engine.js')), uses = src.split('FX_COMPILED').length - 1;
    check('FX_COMPILED appears only as the default table of createFxState', uses === 1 &&
      /C = \(opts && opts\.compiled\) \|\| FX_COMPILED;/.test(src), {uses: uses});
  });

  // B17: eye particles fade out when the view leaves first person.
  run('B17 eye and screen space', function () {
    scene('flat'); var S = install(256, 1717);
    G.fxEmit('test.eye', G.pos.x, G.pos.y, 60, {count: 16}); ticks(1);
    var eye = byRecipe(S, 'test.eye');
    check('a first-person eye burst spawns camera-local', eye.length === 16 && eye.every(function (i) { return (S.flags[i] & 4) && near(S.x[i], 30, 3); }),
      {count: eye.length, x: eye.length ? S.x[eye[0]] : null});
    G.MODE3D = false; ticks(1);
    var dying = byRecipe(S, 'test.eye').every(function (i) { return S.flags[i] & 16; });
    ticks(Math.ceil(G.EFFECT_CONFIG.cullFadeSeconds / DT));
    check('eye and screen particles fade out when the view leaves first person', dying && byRecipe(S, 'test.eye').length === 0,
      {dying: dying, left: byRecipe(S, 'test.eye').length});
    G.fxEmit('test.eye', G.pos.x, G.pos.y, 60, {count: 16}); ticks(1);
    var inTwoD = byRecipe(S, 'test.eye').filter(function (i) { return S.flags[i] & 4; }).length, twoDBurst = byRecipe(S, 'test.eye').length;
    G.MODE3D = true; G.fxEmit('test.eye', G.pos.x, G.pos.y, 60, {count: 16}); ticks(1);
    var backInFp = byRecipe(S, 'test.eye').filter(function (i) { return S.flags[i] & 4; }).length;
    check('outside first person an eye burst falls back to its source; back in first person it is camera-local again',
      inTwoD === 0 && twoDBurst === 16 && backInFp === 16, {seed: 1717, eyeIn2D: inTwoD, burstIn2D: twoDBurst, eyeBackInFirstPerson: backInFp});
    // A non-follow camera (the overview): the same camera-local ring fades.
    function eyeLive() { return byRecipe(S, 'test.eye').filter(function (i) { return S.flags[i] & 4; }); }
    var ring = eyeLive().length;
    G.CAM_FOLLOW = false; ticks(1);
    var nfDying = eyeLive().length === ring && eyeLive().every(function (i) { return S.flags[i] & 16; });
    ticks(Math.ceil(G.EFFECT_CONFIG.cullFadeSeconds / DT));
    var nfLeft = eyeLive().length;
    G.CAM_FOLLOW = true;
    check('eye and screen particles fade out in a non-follow camera', ring === 16 && nfDying && nfLeft === 0,
      {seed: 1717, ring: ring, dying: nfDying, left: nfLeft, fadeTicks: Math.ceil(G.EFFECT_CONFIG.cullFadeSeconds / DT)});
    // S4: the shipping Phoenix ring from a real phoenix event: camera-local in
    // first person, gone within the cull fade once the view is 2D (its life
    // is 0.7-0.9 s, so only the fade can remove it that early).
    var S17 = install(256, 1718, {compiled: G.FX_COMPILED});
    G.fxEvent('phoenix'); ticks(1);
    var shipRing = byRecipe(S17, 'burst.phoenixRing').filter(function (i) { return S17.flags[i] & 4; }).length;
    G.MODE3D = false; ticks(Math.ceil(G.EFFECT_CONFIG.cullFadeSeconds / DT) + 1);
    var shipLeft = byRecipe(S17, 'burst.phoenixRing').length;
    G.MODE3D = true; S = install(256, 1717);
    check('the shipping Phoenix ring is camera-local and fades when the view leaves first person', shipRing === 16 && shipLeft === 0,
      {seed: 1718, eyeSpace: shipRing, leftAfterFade: shipLeft});
    // sourceOrFront: behind the camera the burst moves in front of it.
    G.fxEmit('test.front', G.cam.x - 80, G.cam.y + 5, 20, {count: 8}); ticks(1);
    var front = byRecipe(S, 'test.front'), inView = front.filter(function (i) { return G.fxInView(S.x[i], S.y[i], S.z[i], 1); }).length;
    check('a feedback burst behind the camera is placed in front of it', front.length === 8 && inView === 8,
      {seed: 1717, count: front.length, inView: inView});
    // setEffectPlacementOverride (spec 5.7, Revision 3 Q5): a recipe moves to
    // eye space from the next tick and back with null; camera-local particles
    // never collide with the world (a bouncing chip keeps falling in eye space).
    var errors = [], gen0 = G.effectToggleGeneration();
    [['test.nothing', 'eye'], ['test.front', 'overhead']].forEach(function (p) { try { G.setEffectPlacementOverride(p[0], p[1]); } catch (e) { errors.push(e.message); } });
    G.setEffectPlacementOverride('test.front', 'eye'); G.setEffectPlacementOverride('test.chip', 'eye');
    G.fxEmit('test.front', G.cam.x + 60, G.cam.y, 20, {count: 8}); G.fxEmit('test.chip', G.cam.x + 60, G.cam.y, 20, {count: 3, dx: 1, dy: 0, dz: 0});
    ticks(1);
    var eyeFront = byRecipe(S, 'test.front').filter(function (i) { return (S.flags[i] & 4) && near(S.x[i], 34, 1e-9); }).length;
    ticks(30);
    var chips = byRecipe(S, 'test.chip'), chipsFree = chips.length === 3 && chips.every(function (i) { return (S.flags[i] & 4) && !(S.flags[i] & 1); });
    G.setEffectPlacementOverride('test.front', null); G.setEffectPlacementOverride('test.chip', null);
    var worldBefore = byRecipe(S, 'test.front').filter(function (i) { return !(S.flags[i] & 4); }).length;
    G.fxEmit('test.front', G.cam.x + 60, G.cam.y, 20, {count: 8}); ticks(1);
    var worldAfter = byRecipe(S, 'test.front').filter(function (i) { return !(S.flags[i] & 4); }).length - worldBefore;
    check('placement overrides are validated and bump the toggle generation', errors.length === 2 && /unknown recipe test\.nothing/.test(errors[0]) &&
      /place must be one of/.test(errors[1]) && G.effectToggleGeneration() === gen0 + 4, {errors: errors, generations: G.effectToggleGeneration() - gen0});
    check('a placement override moves a recipe into eye space and back', eyeFront === 8 && worldAfter === 8,
      {seed: 1717, eyeSpace: eyeFront, expectedX: 34, worldAfterReset: worldAfter});
    check('camera-local particles never collide with the world', chipsFree,
      {seed: 1717, ticks: 30, chips: chips.map(function (i) { return {flags: S.flags[i], z: S.z[i]}; })});

    // sourceOrFront, the rest of spec 5.7 (S4 review). Oracles restated from
    // projToScreen: fwd and lat are the view-axis coordinates; the eye is
    // 60 + (cam.z - 60) 0.625; the screen offset below the crosshair, in
    // units of projScale, is (eyeZ - z) / fwd - pitch, on screen within 2/3.
    function placed(id, x, y, z, count) {
      var before = {};
      byRecipe(S, id).forEach(function (i) { before[S.seedA[i]] = 1; });
      G.fxEmit(id, x, y, z, {count: count}); ticks(1);
      var c = Math.cos(G.cam.ang), sn = Math.sin(G.cam.ang), eyeZ = 60 + (G.cam.z - 60) * 0.625;
      return byRecipe(S, id).filter(function (i) { return !before[S.seedA[i]]; }).map(function (i) {
        var dx = S.x[i] - G.cam.x, dy = S.y[i] - G.cam.y, fwd = dx * c + dy * sn;
        return {x: S.x[i], y: S.y[i], z: S.z[i], fwd: fwd, lat: -dx * sn + dy * c, offset: (eyeZ - S.z[i]) / fwd - (G.cam.pitch || 0), vx: S.vx[i], vy: S.vy[i]};
      });
    }
    function r6(v) { return Math.round(v * 1e6) / 1e6; }
    // A source 80 u ahead and in view keeps its burst; one 40 u ahead (inside
    // near, 48) moves to 34 u.
    var kept = placed('test.front', G.cam.x + 80, G.cam.y + 6, 20, 8), nearIn = placed('test.front', G.cam.x + 40, G.cam.y + 6, 20, 8);
    check('a feedback burst far enough ahead and in view stays at its source', kept.length === 8 &&
      kept.every(function (q) { return near(q.x, G.cam.x + 80) && near(q.y, G.cam.y + 6) && near(q.z, 20); }) &&
      nearIn.length === 8 && nearIn.every(function (q) { return near(q.fwd, 34, 1e-9); }),
      {seed: 1717, kept: kept.slice(0, 2).map(function (q) { return [r6(q.fwd), r6(q.lat), r6(q.z)]; }), insideNear: nearIn.slice(0, 1).map(function (q) { return r6(q.fwd); })});
    // Behind the camera, 60 u and -8 u aside: the burst leans the same way,
    // at most half its forward distance.
    var wide = placed('test.front', G.cam.x - 80, G.cam.y + 60, 20, 8), slight = placed('test.front', G.cam.x - 80, G.cam.y - 8, 20, 8);
    check('a burst moved in front leans toward its source, at most half its distance aside', wide.length === 8 && slight.length === 8 &&
      wide.every(function (q) { return near(q.lat, q.fwd / 2, 1e-9) && q.fwd > 0; }) && slight.every(function (q) { return near(q.lat, -8, 1e-9); }),
      {seed: 1717, wide: wide.slice(0, 1).map(function (q) { return [r6(q.fwd), r6(q.lat)]; }), slight: slight.slice(0, 1).map(function (q) { return [r6(q.fwd), r6(q.lat)]; })});
    // Looking down (1.2) and up (-0.6): the burst sits on the pitched view
    // ray, as far below the crosshair on screen as at pitch 0 (drop/distance),
    // not collapsed onto the camera, and still leaning at most fwd/2 aside.
    var pitches = [0, 1.2, -0.6, 1.4].map(function (pitch) {
      G.cam.pitch = pitch;
      var q = placed('test.front', G.cam.x - 80, G.cam.y + 60, 20, 8);
      G.cam.pitch = 0;
      return {pitch: pitch, n: q.length, fwd: q.length ? r6(q[0].fwd) : null, offset: q.length ? r6(q[0].offset) : null,
        onScreen: q.length === 8 && q.every(function (u) { return Math.abs(u.offset) < 2 / 3; }),
        steady: q.every(function (u) { return near(u.offset, 10 / 34, 1e-9) && u.fwd >= 14 && u.fwd <= 34 + 1e-9 && near(u.lat, u.fwd / 2, 1e-9); })};
    });
    check('a burst moved in front keeps its screen offset below the crosshair at any pitch', pitches.every(function (q) { return q.onScreen && q.steady; }),
      {seed: 1717, pitches: pitches});
    // The walking player's velocity rides along (inherit 1, no drag here);
    // a dash is capped at twice the base walking speed; a kept source takes none.
    var cap = 2 * G.GAME_CONFIG.player.baseSpeed;
    G.vel.x = 60; G.vel.y = 30; var walk = placed('test.carry', G.cam.x - 80, G.cam.y, 20, 4), keptVel = placed('test.carry', G.cam.x + 80, G.cam.y, 20, 4);
    G.vel.x = 500; G.vel.y = 0; var dash = placed('test.carry', G.cam.x - 80, G.cam.y, 20, 4);
    G.vel.x = G.vel.y = 0;
    check('a burst moved in front carries the walking player velocity, capped at twice the walking speed', walk.length === 4 && dash.length === 4 && keptVel.length === 4 &&
      walk.every(function (q) { return near(q.vx, 60) && near(q.vy, 30); }) && dash.every(function (q) { return near(q.vx, cap) && near(q.vy, 0); }) &&
      keptVel.every(function (q) { return q.vx === 0 && q.vy === 0; }),
      {seed: 1717, cap: cap, walk: walk.length ? [r6(walk[0].vx), r6(walk[0].vy)] : null, dash: dash.length ? [r6(dash[0].vx), r6(dash[0].vy)] : null,
        kept: keptVel.length ? [keptVel[0].vx, keptVel[0].vy] : null});
  });

  // B18: children never disturb the integration pass and never steal.
  run('B18 children', function () {
    scene('flat');
    var S = install(64, 1818, {reserve: 8}), B = 56;
    G.fxEmit('test.flood', 200, 200, 10, {count: B}); ticks(1);
    // Two feedback drops (in the reserve) land next tick; their combat
    // children rank above weather, so admitting them would need a steal.
    G.fxEmit('test.fbdrop', 150, 150, 0.05, {count: 2}); ticks(1);
    var before = {}, drops = byRecipe(S, 'test.fbdrop');
    for (var i = 0; i < S.count; i++) before[S.seedA[i]] = S.age[i];
    var floods = byRecipe(S, 'test.flood'), last = S.seedA[floods[floods.length - 1]], refused0 = S.stats.refusedBudget;   // the last live weather slot
    ticks(1);
    var wrong = [], survivors = 0;
    for (i = 0; i < S.count; i++) {
      var s = S.seedA[i];
      if (!(s in before)) { wrong.push({newcomer: s, age: S.age[i], rec: S.rec[i]}); continue; }
      survivors++;
      if (!near(S.age[i], before[s] + DT, 1e-12)) wrong.push({seed: s, before: before[s], after: S.age[i]});
    }
    check('the B18 fixture fills B and lands two parents', drops.length === 2 && byRecipe(S, 'test.fbdrop').length === 0 &&
      S.count === B && S.classLive[0] === B && survivors === B,
      {drops: drops.length, count: S.count, weather: S.classLive[0]});
    check('children never disturb the integration pass', !wrong.length && find(S, last) >= 0 && S.stats.stolen === 0 &&
      S.stats.refusedBudget - refused0 === 2, {wrong: wrong.slice(0, 3), stolen: S.stats.stolen, refused: S.stats.refusedBudget - refused0});
    // With room, a child is admitted after the pass and first integrated next tick.
    S = install(256, 1819);
    G.fxEmit('test.drop', 150, 150, 0.05, {count: 1}); ticks(2);                // lands in the second tick
    var kids = byRecipe(S, 'test.splash'), age0 = kids.length ? S.age[kids[0]] : -1;
    ticks(1); kids = byRecipe(S, 'test.splash');
    check('the child appears on the next tick', age0 === 0 && kids.length === 1 && near(S.age[kids[0]], DT, 1e-12) && near(S.z[kids[0]], 0),
      {age0: age0, kids: kids.length});
  });

  // ── S9 core contracts: hand mutants of the core paths that no case above
  // detected (the event ring, event gating and bindings, class and recipe
  // caps, the integrator's wind and turbulence, the clamp and the mesh
  // edge), each recreated here with its own fixture, oracle and flag. A
  // second test table (the one above plus these recipes) keeps every case
  // above on its own compiled table.
  var S9_RECIPES = {
    'test.eyeWind': {class:'feedback', trigger:{api:true, count:8}, place:'eye', color:{material:'fireMagic', roles:['core']},
      spawn:{shape:'ring', radius:[1, 2], direction:'radial', speed:[20, 30]}, motion:{model:'drift', drag:2, wind:1},
      life:{seconds:[5, 5]}, render:{primitive:'dot', size:[0.3, 0.3]}, occlusion:'none', view2D:'none'},
    'test.windy': {class:'combat', trigger:{api:true}, color:{material:'fxDebris', roles:['spark']}, spawn:{direction:'up', speed:[0, 0]},
      motion:{model:'drift', drag:2, wind:1}, life:{seconds:[5, 5]}, render:{primitive:'dot', size:[0.3, 0.3]}, view2D:'dot'},
    'test.wander': {class:'ambient', trigger:{api:true}, color:{material:'fxMote', roles:['dust']}, spawn:{speed:[0, 0]},
      motion:{model:'drift', turbulence:6, turbHz:1}, life:{seconds:[100, 100]}, render:{primitive:'dot', size:[0.2, 0.2]}, view2D:'none'},
    'test.slider': {class:'combat', trigger:{api:true}, color:{material:'fxDebris', roles:['spark']}, spawn:{direction:'along', speed:[40, 40]},
      motion:{model:'ballistic', gravity:300, drag:0}, collision:{mode:'clamp', stratum:'reference'}, life:{seconds:[10, 10]},
      render:{primitive:'dot', size:[0.3, 0.3]}, view2D:'dot'},
    'test.capped': {class:'combat', trigger:{api:true}, color:{material:'fxDebris', roles:['spark']}, motion:{model:'static'},
      life:{seconds:[5, 5]}, render:{primitive:'dot', size:[0.3, 0.3]}, view2D:'dot', budget:{maxLive:5}},
    'test.wallMote': {class:'ambient', trigger:{api:true}, color:{material:'fxMote', roles:['dust']}, spawn:{direction:'along', speed:[80, 80]},
      motion:{model:'drift'}, collision:{mode:'none', wall:true}, life:{seconds:[10, 10]}, render:{primitive:'dot', size:[0.2, 0.2]}, view2D:'dot'},
    'test.gatedCore': {class:'combat', toggle:'fxDebris', trigger:{event:'thunderCore', count:5}, color:{material:'fxDebris', roles:['spark']},
      motion:{model:'static'}, life:{seconds:[5, 5]}, render:{primitive:'dot', size:[0.3, 0.3]}, view2D:'dot'},
    'test.caveHit': {class:'combat', trigger:{event:'meleeCommit', where:{underground:true}, count:3}, color:{material:'fxDebris', roles:['spark']},
      motion:{model:'static'}, life:{seconds:[5, 5]}, render:{primitive:'dot', size:[0.3, 0.3]}, view2D:'dot'}
  };
  // A mutation run aimed at another check skips these (their fixtures rest
  // on the ground and wall rules other mutations break).
  if (needed('S9 core', ['--ring-drops-oldest', '--bad-event-queued', '--wind-on-eye', '--no-turbulence', '--clamp-keeps-fall', '--offmesh-survives',
    '--cap-counts-dying', '--maxlive-plus-one', '--event-gate-stale', '--where-under-ignored'])) run('S9 core contracts', function () {
    var T9 = G.compileFxRecipes(Object.assign({}, TEST_RECIPES, S9_RECIPES), G.FX_MATERIALS), S, k, i;
    function install9(cap, seed, opts) {
      var o = {compiled: T9, pinned: true, reserve: 16};
      Object.keys(opts || {}).forEach(function (key) { o[key] = opts[key]; });
      return (G.fxState = G.createFxState(cap, seed, o));
    }
    // A full event ring (256) drops the newest events (spec 6.5), so the
    // queue keeps its order: 300 one-particle bursts at x = 20, 21, ... 319
    // in one frame spawn those at x 20-275.
    scene('flat'); S = install9(3072, 9101, {reserve: 256});
    for (k = 0; k < 300; k++) G.fxEmit('test.combat', 20 + k, 150, 20, {count: 1});
    var dropped = S.stats.eventsDropped;
    ticks(1);
    var xs = byRecipe(S, 'test.combat').map(function (j) { return Math.round(S.x[j]); }).sort(function (a, b) { return a - b; });
    check('a full event ring drops the newest events and keeps the queued ones', dropped === 44 && xs.length === 256 && xs[0] === 20 && xs[255] === 275,
      {seed: 9101, dropped: dropped, spawned: xs.length, first: xs[0], last: xs[xs.length - 1]});
    // An event with no finite position is refused at the producer and
    // counted; nothing spawns and no particle holds a non-finite coordinate.
    S = install9(512, 9102);
    var bad0 = S.stats.badEvents, rets = [G.fxEmit('test.combat', NaN, 150, 20, {count: 3}), G.fxEmit('test.combat', 150, 150, Infinity, {count: 3}),
      G.fxEmit('test.combat', 150, -Infinity, 20, {count: 3})], queued = S.ev.count;
    ticks(1);
    var nonFinite = 0;
    for (i = 0; i < S.count; i++) if (!Number.isFinite(S.x[i] + S.y[i] + S.z[i])) nonFinite++;
    check('an event with no finite position is refused and counted, and spawns nothing', rets.every(function (r) { return r === false; }) &&
      S.stats.badEvents - bad0 === 3 && queued === 0 && S.count === 0 && nonFinite === 0,
      {seed: 9102, returned: rets, bad: S.stats.badEvents - bad0, queued: queued, live: S.count, nonFinite: nonFinite});
    // Wind (forced rain; front 0 blows 4-30 u/s): a world particle relaxes
    // toward it, v(t) = w + (v1 - w) e^(-D t); eye-space particles hold
    // camera-local coordinates and follow the same drag law with no wind.
    // Oracle: the closed form from each particle's state after its first tick.
    scene('flat'); S = install9(256, 9103);
    var force0 = S.weather.force, forceI0 = S.weather.forceI, eyeOff = [], world = null, wind = null;
    try {
      G.effectWeatherForce('rain', 1);
      ticks(2);
      wind = [S.weather.windX, S.weather.windY];
      G.fxEmit('test.eyeWind', 230, 180, 20, {count: 8}); G.fxEmit('test.windy', 230, 180, 20, {count: 1});
      ticks(1);
      var eyes = byRecipe(S, 'test.eyeWind').map(function (j) { return {seed: S.seedA[j], x: S.x[j], y: S.y[j], vx: S.vx[j], vy: S.vy[j]}; });
      var wj = byRecipe(S, 'test.windy')[0], w0 = {seed: S.seedA[wj], x: S.x[wj], y: S.y[wj], vx: S.vx[wj], vy: S.vy[wj]};
      ticks(60);
      var t = 60 * DT, f = (1 - Math.exp(-2 * t)) / 2;
      eyes.forEach(function (p) {
        var j = find(S, p.seed);
        if (j < 0 || !near(S.x[j], p.x + p.vx * f, 1e-6) || !near(S.y[j], p.y + p.vy * f, 1e-6))
          eyeOff.push({seed: p.seed, x: j < 0 ? 'gone' : S.x[j], want: p.x + p.vx * f});
      });
      var wk = find(S, w0.seed);
      world = {x: wk < 0 ? null : S.x[wk], wantX: w0.x + wind[0] * t + (w0.vx - wind[0]) * f, y: wk < 0 ? null : S.y[wk], wantY: w0.y + wind[1] * t + (w0.vy - wind[1]) * f,
        eyes: eyes.length};
    } finally { S.weather.force = force0; S.weather.forceI = forceI0; }
    check('eye-space particles ignore the weather wind that carries world particles', Math.hypot(wind[0], wind[1]) >= 4 && world.eyes === 8 &&
      !eyeOff.length && near(world.x, world.wantX, 1e-6) && near(world.y, world.wantY, 1e-6), {seed: 9103, wind: wind, world: world, eyeOff: eyeOff.slice(0, 3)});
    // Turbulence (a mote's wander, spec 4.1): velocity turbulence x
    // (cos(ph + w a), sin(1.3 (ph + w a))), w = 2 pi turbHz, a the age. Oracle:
    // its integral in closed form over half a period, within the step
    // sum's error bound (amplitude x w x span x dt / 2).
    S = install9(64, 9104);
    G.fxEmit('test.wander', 200, 200, 10, {count: 1}); ticks(1);
    var mj = byRecipe(S, 'test.wander')[0], m0 = {x: S.x[mj], y: S.y[mj], a: S.age[mj], ph: S.phase[mj]};
    ticks(30);
    var amp = 6, w = 2 * Math.PI, a1 = S.age[mj], tol = amp * w * (a1 - m0.a) * DT / 2 + 1e-9;
    var ex = amp / w * (Math.sin(m0.ph + w * a1) - Math.sin(m0.ph + w * m0.a));
    var ey = -amp / (1.3 * w) * (Math.cos(1.3 * (m0.ph + w * a1)) - Math.cos(1.3 * (m0.ph + w * m0.a)));
    var moved = {dx: S.x[mj] - m0.x, dy: S.y[mj] - m0.y, wantX: ex, wantY: ey, tol: tol, phase: m0.ph};
    if (!(Math.hypot(ex, ey) > 4 * tol)) throw Error('SETUP turbulence fixture ' + JSON.stringify(moved));
    check('a mote wanders along its authored turbulence', near(moved.dx, ex, tol) && near(moved.dy, ey, tol), moved);
    // The clamp (collision mode clamp, spec 3.5): a particle held on its
    // support carries no downward speed, so when it slides off a ledge it
    // falls from rest: 6 H plateau (150 u) west of x = 180, gravity 300 u/s2,
    // 40 u/s east; after its last tick on the plateau its height is
    // 150.5 - 150 (n dt)^2 for the next ten ticks (the ramp below drops away
    // faster than it falls).
    scene('cliff'); S = install9(64, 9105);
    G.fxEmit('test.slider', 150, 180, 150.5, {count: 1, dx: 1, dy: 0, dz: 0});
    var zs = [];
    for (k = 0; k < 70; k++) { ticks(1); var sj = byRecipe(S, 'test.slider')[0]; zs.push(sj === undefined ? NaN : S.z[sj]); }
    var lastHeld = -1;
    for (k = 0; k < zs.length; k++) if (zs[k] === 150.5) lastHeld = k;
    var fall = [];
    for (k = 1; k <= 10 && lastHeld >= 0 && lastHeld + k < zs.length; k++) fall.push({n: k, z: zs[lastHeld + k], want: 150.5 - 150 * (k * DT) * (k * DT)});
    if (lastHeld < 30 || fall.length < 10) throw Error('SETUP ledge slide ' + JSON.stringify({lastHeld: lastHeld, zs: zs.slice(0, 5)}));
    check('a clamped particle slides off a ledge from rest', fall.every(function (q) { return near(q.z, q.want, 1e-9); }), {seed: 9105, lastHeld: lastHeld, fall: fall.slice(0, 4)});
    // The mesh edge: a particle that collides dies the tick it leaves the
    // mesh (its support is unknown there); it lived up to the edge.
    scene('flat'); S = install9(64, 9106);
    G.fxEmit('test.glider', W * GS - 6, 180, 0.5, {count: 1, dx: 1, dy: 0, dz: 0});
    var edge = {lastX: -1, offMesh: []};
    for (k = 0; k < 30; k++) { ticks(1); var gj = byRecipe(S, 'test.glider')[0]; if (gj === undefined) break; edge.lastX = S.x[gj]; if (S.x[gj] >= W * GS) edge.offMesh.push(S.x[gj]); }
    check('a colliding particle dies as it leaves the mesh', edge.lastX > W * GS - 1 && !edge.offMesh.length && byRecipe(S, 'test.glider').length === 0,
      {seed: 9106, meshEdge: W * GS, lastX: edge.lastX, offMesh: edge.offMesh.slice(0, 3)});
    // Class caps count what is not fading (spec 6.1): 380 debris switched
    // off fade for 0.25 s while 300 new combat particles are admitted under
    // the combat cap (420 at Particles 25; a cap counting the fading ones
    // would admit 40).
    S = install9(3072, 9107, {reserve: 256});
    var capCase = null;
    try {
      G.fxEmit('test.gated', 150, 150, 20, {count: 380}); ticks(1);
      var gatedLive = byRecipe(S, 'test.gated').length;
      G.setEffectToggle('fxDebris', false); ticks(1);
      var dying = S.classDying[3];
      G.fxEmit('test.combat', 150, 150, 20, {count: 300}); ticks(1);
      capCase = {gated: gatedLive, dying: dying, admitted: byRecipe(S, 'test.combat').length, cap: S.caps[3], refused: S.stats.refusedCap};
    } finally { G.setEffectToggle('fxDebris', true); }
    check('a fading preset leaves its class cap to new particles', capCase.gated === 380 && capCase.dying === 380 && capCase.cap === 420 &&
      capCase.admitted === 300 && capCase.refused === 0, capCase);
    // A recipe's maxLive is exact.
    S = install9(256, 9108);
    G.fxEmit('test.capped', 150, 150, 20, {count: 10}); ticks(1);
    check('a recipe holds exactly its maxLive', byRecipe(S, 'test.capped').length === 5 && S.stats.refusedCap === 5,
      {seed: 9108, live: byRecipe(S, 'test.capped').length, refused: S.stats.refusedCap, maxLive: 5});
    // Event gating follows the switches (spec 10.2): a preset switched on
    // mid-session opens its events at once (a Thunder Core kill with Impact
    // debris off is gated; after switching it on, the next one bursts).
    S = install9(512, 9109);
    var gate = null, core = {x: 200, y: 180, feetZ: 0, enemyType: {size: 1}};
    try {
      G.setEffectToggle('fxDebris', false);
      G.fxEvent('thunderCore', core); ticks(1);
      gate = {gated: S.stats.eventsGated, whileOff: byRecipe(S, 'test.gatedCore').length};
      G.setEffectToggle('fxDebris', true);
      G.fxEvent('thunderCore', core); ticks(1);
      gate.afterOn = byRecipe(S, 'test.gatedCore').length;
    } finally { G.setEffectToggle('fxDebris', true); }
    check('a preset switched on mid-session opens its events at once', gate.gated === 1 && gate.whileOff === 0 && gate.afterOn === 5, gate);
    // A binding's where.underground predicate selects by the event's stratum.
    S = install9(512, 9110);
    var actor = {x: 190, y: 180};
    G.fxEvent('meleeCommit', actor, {x: 200, y: 180, feetZ: 0, underground: false}); ticks(1);
    var onSurface = byRecipe(S, 'test.caveHit').length;
    G.fxEvent('meleeCommit', actor, {x: 200, y: 180, feetZ: 0, underground: true}); ticks(1);
    check('a where.underground binding bursts for cave events only', onSurface === 0 && byRecipe(S, 'test.caveHit').length === 3,
      {seed: 9110, surface: onSurface, cave: byRecipe(S, 'test.caveHit').length - onSurface});
  });

  // S9 fix: core mutants the S9 review found surviving every effects suite,
  // each recreated with its own fixture, oracle and flag. Fading (DYING)
  // bookkeeping (spec 6.1): a kill must take a faded particle out of its
  // class's fading count, or the count leaks and the class cap stops
  // holding; a lower Particles setting fades only the excess over the new
  // cap, not the fading ones again every tick; a fade never lengthens a
  // particle's life. collision.wall with collision mode 'none' (torch
  // embers): the mote still dies at a wall. A reference support within 1 u
  // at or below the particle (fxFillGround), not 0.4 H: a mote 5 u under an
  // overhang's cap (no ceiling under it) falls to the floor. An event is
  // open while any of its bindings is (a recipe added to an existing event,
  // spec 15): a switched-off first binding does not gate a later open one.
  // A particle marked to fade again (a second switch change during a fade)
  // counts once. A bounce keeps friction x the horizontal speed.
  // Accepted as equivalent in reachable states (no check): fxFillGround
  // without its ceiling test differs only for a particle inside rock
  // (between a ceiling and the floor above it), which no spawn rule places
  // there; the clamp's rest SNAP (one tick of envelope time) and a tile
  // summary kept across a resize to the same canvas size (rebuilt on the
  // next frame) are negligible.
  if (needed('S9 fix core', ['--kill-keeps-dying', '--excess-counts-dying', '--fade-extends-life', '--wall-needs-mode', '--support-tolerance-wide',
    '--event-open-first-binding', '--mark-dying-twice', '--bounce-no-friction']))
    run('S9 fix core', function () {
    var T9 = G.compileFxRecipes(Object.assign({}, TEST_RECIPES, S9_RECIPES), G.FX_MATERIALS), S, k;
    function install9(cap, seed, opts) {
      var o = {compiled: T9, pinned: true, reserve: 16};
      Object.keys(opts || {}).forEach(function (key) { o[key] = opts[key]; });
      return (G.fxState = G.createFxState(cap, seed, o));
    }
    // A class cap holds again once its faded particles have died: 380
    // debris switched off fade (0.25 s) and die; switched back on, two
    // combat bursts of 300 (under the 384 per-tick spawn cap) admit exactly
    // the combat cap, 420 at Particles 25 (spec 6.1 table), and refuse 180.
    scene('flat'); S = install9(3072, 9111, {reserve: 256});
    var died = null;
    try {
      G.fxEmit('test.gated', 150, 150, 20, {count: 380}); ticks(1);
      died = {gated: byRecipe(S, 'test.gated').length};
      G.setEffectToggle('fxDebris', false); ticks(1);
      died.dying = S.classDying[3]; ticks(29);
      died.gone = byRecipe(S, 'test.gated').length; died.dyingAfter = S.classDying[3];
      G.setEffectToggle('fxDebris', true);
      var refused0 = S.stats.refusedCap;
      G.fxEmit('test.combat', 150, 150, 20, {count: 300}); ticks(1); G.fxEmit('test.combat', 150, 150, 20, {count: 300}); ticks(1);
      died.admitted = byRecipe(S, 'test.combat').length; died.refused = S.stats.refusedCap - refused0; died.cap = S.caps[3];
    } finally { G.setEffectToggle('fxDebris', true); }
    if (!(died.gated === 380 && died.dying === 380 && died.gone === 0)) throw Error('SETUP faded debris ' + JSON.stringify(died));
    check('a class cap holds again after its faded particles have died', died.dyingAfter === 0 && died.cap === 420 && died.admitted === 420 &&
      died.refused === 180, died);
    // Particles 60 -> 25 with 600 combat particles live (4 bursts of 100 at
    // the combat scale min(60 / 25, 1.5) = 1.5): the 180 over the new cap
    // (420) fade, oldest first, and stay the only fading ones on the next
    // ticks; after the fade 420 remain.
    scene('flat'); S = install9(3072, 9112, {reserve: 256});
    var lower = {};
    try {
      G.settings.particles = 60; ticks(1);
      for (k = 0; k < 4; k++) { G.fxEmit('test.combat', 150, 150, 20, {count: 100}); ticks(1); }
      lower.live60 = byRecipe(S, 'test.combat').length; lower.cap60 = S.caps[3];
      G.settings.particles = 25; ticks(1);
      lower.dying1 = S.classDying[3]; ticks(2);
      lower.dying3 = S.classDying[3]; ticks(30);
      lower.live25 = byRecipe(S, 'test.combat').length; lower.cap25 = S.caps[3];
    } finally { G.settings.particles = 25; }
    if (!(lower.live60 === 600 && lower.cap60 === 985)) throw Error('SETUP Particles 60 pool ' + JSON.stringify(lower));
    check('a lower Particles setting fades only the excess over the new class cap', lower.dying1 === 180 && lower.dying3 === 180 &&
      lower.live25 === 420 && lower.cap25 === 420, lower);
    // A fade shortens a life and never lengthens it: two debris sparks (life
    // 5 s), one spawned 4 s before the other, switched off when the older is
    // 0.1 s from its end: the older keeps its life and dies at 5 s; the
    // younger fades within 0.25 s.
    S = install9(512, 9113);
    var ages = null;
    try {
      G.fxEmit('test.gated', 150, 150, 20, {count: 1}); ticks(240);
      G.fxEmit('test.gated', 160, 150, 20, {count: 1}); ticks(54);
      var list = byRecipe(S, 'test.gated').map(function (j) { return {seed: S.seedA[j], age: S.age[j], life: S.life[j]}; })
        .sort(function (a, b) { return b.age - a.age; });
      if (list.length !== 2) throw Error('SETUP fade sparks ' + JSON.stringify(list));
      G.setEffectToggle('fxDebris', false);
      G.updateEffects(0.0001);                                            // the toggle applies; the pool barely ages
      ages = list.map(function (p) {
        var j = find(S, p.seed);
        return {age: p.age, life0: p.life, dying: j >= 0 && !!(S.flags[j] & 16), life: j >= 0 ? S.life[j] : null,
          want: Math.min(p.life, p.age + G.EFFECT_CONFIG.cullFadeSeconds)};
      });
    } finally { G.setEffectToggle('fxDebris', true); }
    if (!(ages[0].life0 - ages[0].age > 0.05 && ages[0].life0 - ages[0].age < G.EFFECT_CONFIG.cullFadeSeconds && ages[1].life0 - ages[1].age > 1))
      throw Error('SETUP fade ages ' + JSON.stringify(ages));
    check('a fade never lengthens a particle\'s life', ages.every(function (a) { return a.dying && near(a.life, a.want, 2e-4); }) &&
      near(ages[0].life, ages[0].life0, 1e-9), {seed: 9113, sparks: ages});
    // collision.wall with collision mode none (torch embers): a mote gliding
    // east from 80 u/s at 20 u into a 240 u wall cell (x 180-192, y 180-192)
    // dies on entering it; one on the next row of cells (y 170) glides past.
    scene('flat'); G.grid[15 * W + 15] = 1; S = install9(64, 9114);
    G.fxEmit('test.wallMote', 150, 186, 20, {count: 1, dx: 1, dy: 0, dz: 0}); G.fxEmit('test.wallMote', 150, 170, 20, {count: 1, dx: 1, dy: 0, dz: 0});
    ticks(1);
    var motes = byRecipe(S, 'test.wallMote').map(function (j) { return {seed: S.seedA[j], y: S.y[j]}; }), track = {};
    motes.forEach(function (m) { track[m.seed] = {y: Math.round(m.y), maxX: -1, inWall: 0, alive: true}; });
    for (k = 0; k < 60; k++) {
      ticks(1);
      motes.forEach(function (m) {
        var j = find(S, m.seed), t = track[m.seed];
        if (j < 0) { t.alive = false; return; }
        t.maxX = Math.max(t.maxX, S.x[j]);
        if (S.x[j] >= 180 && S.x[j] < 192 && S.y[j] >= 180 && S.y[j] < 192) t.inWall++;
      });
    }
    var rows = motes.map(function (m) { return track[m.seed]; }).sort(function (a, b) { return b.y - a.y; });
    if (rows.length !== 2 || !(rows[1].maxX > 200)) throw Error('SETUP wall motes ' + JSON.stringify(rows));
    rows.forEach(function (t) { t.maxX = Math.round(t.maxX * 1e6) / 1e6; });
    check('a mote with collision mode none still dies at a wall', !rows[0].alive && rows[0].inWall === 0 && rows[0].maxX < 180 &&
      rows[1].alive && rows[1].maxX > 200, {seed: 9114, wallRow: rows[0], openRow: rows[1], wallCell: [180, 192]});
    // Overhang (floor 0, a cap 5 H up, no ceiling): a drip 5 u under the cap
    // falls to the floor; one 0.5 u under it (inside the 1 u tolerance)
    // lands on the cap.
    scene('overhang'); S = install9(64, 9115);
    function restAt(z) {
      G.fxEmit('test.faller', 150, 150, z, {count: 1}); ticks(1);
      var l = byRecipe(S, 'test.faller'), seed = S.seedA[l[l.length - 1]];
      return seed;
    }
    var under = restAt(120), skin = restAt(124.5);
    ticks(150);
    function restZ(seed) { var j = find(S, seed); return j >= 0 && (S.flags[j] & 1) ? S.z[j] : NaN; }
    var over = {under5: restZ(under), under05: restZ(skin), want: {under5: 0.3, under05: 125.3}};
    check('a mote under an overhang\'s cap falls to the floor below it', near(over.under5, 0.3) && near(over.under05, 125.3), over);
    // A Thunder Core kill with two bindings, the first (Impact debris) off
    // and a second one with no switch: the event stays open, the second
    // bursts 4 and the first is refused by its switch.
    var TF = G.compileFxRecipes(Object.assign({}, TEST_RECIPES, S9_RECIPES, {
      'test.openCore': {class:'combat', trigger:{event:'thunderCore', count:4}, color:{material:'fxDebris', roles:['dust']},
        motion:{model:'static'}, life:{seconds:[5, 5]}, render:{primitive:'dot', size:[0.3, 0.3]}, view2D:'dot'}}), G.FX_MATERIALS);
    scene('flat'); S = G.fxState = G.createFxState(512, 9116, {compiled: TF, pinned: true, reserve: 16});
    var both = null, ids = TF.LIST.map(function (q) { return q.id; });
    try {
      G.setEffectToggle('fxDebris', false);
      var gated0 = S.stats.eventsGated;
      G.fxEvent('thunderCore', {x: 200, y: 180, feetZ: 0, enemyType: {size: 1}}); ticks(1);
      both = {gated: S.stats.eventsGated - gated0, open: byRecipe(S, 'test.openCore').length, switchedOff: byRecipe(S, 'test.gatedCore').length,
        firstIsGated: ids.indexOf('test.gatedCore') >= 0 && ids.indexOf('test.gatedCore') < ids.indexOf('test.openCore')};
    } finally { G.setEffectToggle('fxDebris', true); }
    if (!both.firstIsGated) throw Error('SETUP binding order ' + JSON.stringify(both));
    check('an event with a switched-off first binding still bursts its open one', both.gated === 0 && both.open === 4 && both.switchedOff === 0,
      {seed: 9116, event: 'thunderCore', result: both});
    // A switch change while a fade runs marks the gated particles again
    // (effectSyncToggles): 300 debris switched off, then the Pickup bursts
    // family set to Legacy on the next tick (another recipe gated); the 300
    // count once as fading, and 0 once they died.
    scene('flat'); S = install9(3072, 9117, {reserve: 256});
    var fade = {};
    try {
      G.fxEmit('test.gated', 150, 150, 20, {count: 300}); ticks(1);
      G.setEffectToggle('fxDebris', false); ticks(1);
      fade.first = S.classDying[3];
      G.setEffectFamilyMode('pickupBursts', 'legacy'); ticks(1);
      fade.second = S.classDying[3];
      fade.fading = byRecipe(S, 'test.gated').filter(function (j) { return S.flags[j] & 16; }).length;
      ticks(30);
      fade.after = S.classDying[3]; fade.left = byRecipe(S, 'test.gated').length;
    } finally { G.setEffectToggle('fxDebris', true); G.setEffectFamilyMode('pickupBursts', null); }
    if (fade.first !== 300 || fade.fading !== 300) throw Error('SETUP repeated fade ' + JSON.stringify(fade));
    check('a fading particle marked again counts once as fading', fade.second === 300 && fade.after === 0 && fade.left === 0, {seed: 9117, fade: fade});
    // A bounce (spec 3.5): test.chip (drag 0.4, restitution 0.35, friction
    // 0.6) thrown along +x over the flat floor; across the tick of its first
    // bounce vx goes from v to v e^(-0.4 dt) x 0.6 (the drag, then the
    // friction), and on the tick before by the drag alone.
    scene('flat'); S = install9(64, 9118);
    G.fxEmit('test.chip', 150, 180, 10, {count: 1, dx: 1, dy: 0, dz: 0}); ticks(1);
    var cj = byRecipe(S, 'test.chip')[0], chipSeed = S.seedA[cj], vx0 = S.vx[cj], b0 = S.bounces[cj], KD = Math.exp(-0.4 * DT), hop = null, air = [];
    for (k = 0; k < 120 && !hop; k++) {
      ticks(1);
      var q = find(S, chipSeed);
      if (q < 0) break;
      if (S.bounces[q] < b0) hop = {tick: k + 1, before: vx0, after: S.vx[q], ratio: S.vx[q] / vx0, want: KD * 0.6};
      else air.push(S.vx[q] / vx0);
      vx0 = S.vx[q]; b0 = S.bounces[q];
    }
    if (!hop || !(hop.before > 10) || !air.length) throw Error('SETUP chip bounce ' + JSON.stringify({hop: hop, air: air.length}));
    check('a bounce keeps friction x the horizontal speed', near(hop.ratio, hop.want, 1e-9) && air.every(function (a) { return near(a, KD, 1e-9); }),
      {seed: 9118, bounce: hop, airRatio: air[air.length - 1], drag: KD});
  });

  // ── Cases on a generated world ─────────────────────────────────────────
  function startEndless(seed) {
    var next = lcg(seed * 7919 + 13), used = false;
    Math.random = function () { if (!used) { used = true; return (seed - 0.5) / 999999; } return next(); };
    G.CAVE_TEST_MODE = false; G.ENDLESS_MODE = true; G.running = true; G.gameOverState = false;
    G.menuOpen = G.settingsOpen = G.shopOpen = G.inventoryOpen = G.forgeOpen = G.overviewActive = false;
    G.MODE3D = true; G.CAM_FOLLOW = true;
    G.fxState = liveState;
    G.resetEndlessMode();
    if (G.WORLD_SEED !== seed) throw Error('SETUP world seed ' + G.WORLD_SEED + ' is not ' + seed);
  }

  // B13: a DOM-handler event (keyboard shrine) and the same event inside
  // handleInput (gamepad path) spawn in the same fixed tick with the same serials.
  if (needed('B13', ['--emit-immediately'])) run('B13 event timing', function () {
    function trial(path) {
      startEndless(777); G.startGameClock(); G.clearGameplayInput();
      var S = install(512, G.WORLD_SEED), shrine = {x: G.pos.x + 60, y: G.pos.y, buffType: 'speed'}, before = -1, fired = false;
      G.setEffectFamilyMode('pickupBursts', 'new');
      var savedInput = G.handleInput;
      G.handleInput = function () { if (path === 'gamepad' && !fired && S.tick === 3) { fired = true; G.fxEvent('shrine', shrine); } return savedInput.apply(G, arguments); };
      try {
        for (var k = 0; k < 6; k++) {
          if (path === 'dom' && S.tick === 3 && !fired) { fired = true; G.fxEvent('shrine', shrine); before = S.count; }
          G.runSimulationTick(DT);
        }
      } finally { G.handleInput = savedInput; G.setEffectFamilyMode('pickupBursts', null); }
      var seeds = [], spawnTick = -1;
      for (var i = 0; i < S.count; i++) seeds.push(S.seedA[i]);
      if (S.count) spawnTick = S.tick - Math.round(S.age[0] / DT) + 1;
      return {seeds: seeds.sort().join(','), count: S.count, before: before, spawnTick: spawnTick, serial: S.serial};
    }
    var dom = trial('dom'), pad = trial('gamepad');
    check('keyboard shrine particles spawn inside the fixed tick', dom.before === 0 && dom.count === 12 && pad.count === 12 &&
      dom.seeds === pad.seeds && dom.spawnTick === pad.spawnTick && dom.spawnTick === 4 && dom.serial === pad.serial,
      {dom: {before: dom.before, count: dom.count, tick: dom.spawnTick}, pad: {count: pad.count, tick: pad.spawnTick}, same: dom.seeds === pad.seeds});
    G.fxState = liveState;
  });

  // B16: the non-allocating corner fill equals the pre-S2 routine, restated
  // verbatim from c6851a4 06-spatial-geometry.js:112-135.
  function legacyCorners(mesh, ci, li) {
    if (!mesh || !mesh.layerCount || !Number.isInteger(ci) || ci < 0 ||
        ci >= mesh.w * mesh.h || !Number.isInteger(li) || li < 0 ||
        li >= mesh.layerCount[ci] || ci % mesh.w >= mesh.w - 1 ||
        Math.floor(ci / mesh.w) >= mesh.h - 1) return null;
    var type = mesh['l' + li + 'Type'][ci], z = mesh['l' + li + 'TopZ'][ci];
    if ((type !== 1 && type !== 2 && type !== 3 && type !== 4) || !Number.isFinite(z)) return null;
    var z1, z2, z3;
    if (type === 2) {
      z1 = G.findSpatialCeilingZ(mesh, ci + 1, z); z2 = G.findSpatialCeilingZ(mesh, ci + mesh.w, z); z3 = G.findSpatialCeilingZ(mesh, ci + mesh.w + 1, z);
    } else {
      var role = G.getSpatialLayerRole(mesh, ci, li, type);
      z1 = G.findSpatialRoleZ(mesh, ci + 1, role, z, ci); z2 = G.findSpatialRoleZ(mesh, ci + mesh.w, role, z, ci); z3 = G.findSpatialRoleZ(mesh, ci + mesh.w + 1, role, z, ci);
    }
    if (!Number.isFinite(z1) || !Number.isFinite(z2) || !Number.isFinite(z3)) return null;
    var tolerance = G.SPATIAL_CORNER_MAX_DELTA_H;
    return [z, Math.max(z - tolerance, Math.min(z + tolerance, z1)), Math.max(z - tolerance, Math.min(z + tolerance, z2)),
      Math.max(z - tolerance, Math.min(z + tolerance, z3))];
  }
  if (needed('B16', ['--corners-off-by-one'])) run('B16 corner fill', function () {
    startEndless(424242);
    var meshes = [MESHES.flat, MESHES.ramp, MESHES.cave, G.floorMesh], out = new Float64Array(4), bad = [], compared = 0, triangles = 0, layered = 0;
    meshes.forEach(function (m, mi) {
      for (var ci = 0; ci < m.w * m.h; ci++) for (var li = 0; li < m.layerCount[ci]; li++) {
        var want = legacyCorners(m, ci, li), got = G.spatialLayerCornersInto(m, ci, li, out), wrap = G.spatialLayerCorners(m, ci, li);
        compared++; if (want) triangles++; if (li > 0 && want) layered++;
        var ok = want ? got === true && want.every(function (v, k) { return v === out[k]; }) && JSON.stringify(wrap) === JSON.stringify(want) : got === false && wrap === null;
        if (!ok && bad.length < 3) bad.push({mesh: mi, ci: ci, li: li, want: want, got: got && Array.from(out)});
      }
    });
    check('the non-allocating corner fill equals the shared helper', !bad.length && compared > 10000 && triangles > 5000 && layered > 100,
      {bad: bad, compared: compared, triangles: triangles, layered: layered});
  });

  G.fxState = liveState;
  var st = G.getEffectStats().failures, total = 0;
  for (var key in st) total += st[key];
  check('no effect runtime failures were counted', total === 0, st);
  check('no console errors from the game', G.__engineErrors.length === 0, G.__engineErrors.slice(0, 3));
  Math.random = originalRandom;
  output('PARTICLE_ENGINE_RESULT ' + (failed ? 'FAIL ' + failed + '/' : 'PASS ') + checked);
}());
undefined;
