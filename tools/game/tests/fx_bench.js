// fxBench tooling contracts (unified effects V1, slice S9). The bench
// (tools/game/fx-bench.js) is injected into a separate browser tab and runs
// the spec 12.2 protocol against the live game; this harness loads the real
// shipping game under the headless audit host (tools/webui/harness/
// _game_env.js: stub DOM and Canvas, a virtual clock, captured
// requestAnimationFrame), loads the bench beside it and drives both through
// real game loop frames.
// Risks covered: a bench that leaves the page changed after it returns (a
// swapped pool, canvas size, Particles setting, switch, context, profiler,
// camera or governor raster input left behind, or the live pool changed
// while it sat out), after a completed, failed or aborted run (C2, C4, C13);
// a bench that measures a hidden tab, whose throttled frames are
// meaningless (C1, C3); stage percentiles read from the wrong ring slot, or
// sums of percentiles instead of per-frame sums, or frame totals from the
// wrong slot (C6); effectsSim samples that include warm-up or earlier runs
// (C7); a flushed timing that reads back every frame, forces a CPU canvas,
// never draws on the scratch canvas or keeps it allocated (C8); the periodic
// dumpPerfBreakdown resetting the aggregate mid-run (C9); A/B runs that
// measure the wrong mode (C10); a bench that draws from the gameplay random
// stream (C11); a torch scene that does not face the torch (C12); stage
// names or flushed stage bodies that drift from the frame loop (C14); blur,
// reload or navigation in the tool (C15); leaked globals and errors (C16); a
// report that is not plain JSON or misses metadata or runs (C5); a world
// reset mid-run that brings back the old world's pool or lists (C17); a
// chunk crossing mid-run that leaves the pool and lists set aside 480 u off
// (C18); an unpinned run whose governor starts with raster an earlier run or
// flush painted (C19); per-frame getEffectStats polling, which allocates in
// fx functions during T10's allocation hold (C20); workload counters read
// from the wrong frames (C21); scenes that never reach their workload: no
// rain, weather in a clear scene, an empty stress pool, missing or
// mis-rated hits and deaths, a flame beam that stops (C22-C24, C27);
// percentile and A/B arithmetic: the wrong quantile, an even-count median,
// a flipped or mixed-up delta, no ABBA order (C25, C26); frame-counted
// "2 s" and "30 s" (C28, C29); a camera that moves mid-run left valid (C30);
// a menu opened or the canvas resized mid-run left measuring (C31); a second
// injection that orphans the running copy (C32).
// Oracles: the global values captured here before each run; the spec's
// target definitions restated here (pinned Particles settings, governors,
// flush stage sets, rates); stage costs injected here on the virtual clock
// (dyadic, so exact), including 40-frame permutations whose percentiles are
// known by construction and mode-dependent costs whose A/B deltas are known;
// the frames the bench reported measuring and each loop frame's virtual
// time; the host's frame interval; the game's own counters, weather state,
// pool and flame globals read here at each frame; counts taken by spies on
// the scratch canvas, the gameplay random stream, dumpPerfBreakdown,
// getEffectStats and fxEvent; the torch placed here; world positions of the
// live pool and a bone record taken here before a crossing.
// Mutations are applied to the slurped fx-bench source only (anchors match
// exactly once):
//   --no-restore --no-visibility-gate --no-hidden-guard --ring-off-by-one
//   --sim-all-ticks --readback-per-frame --will-read-frequently
//   --no-suppress-dump --ab-single-mode --bench-random --no-face-torch
//   --stage-typo --bench-reload --shared-step --restore-stale-world
//   --no-live-reset --no-live-rebase --no-list-rebase
//   --no-raster-reset --no-raster-restore --weather-on-live --stats-poll
//   --workload-once --frame-total-wrong-slot --no-scratch-release
//   --rain-never-forced --no-weather-toggle --clear-not-forced
//   --no-stress-fill --stress-no-scale --legacy-stress-P --no-flame-refresh
//   --no-combat --hits-rate-x10 --no-debris-toggle --p95-is-max --p50-is-p60
//   --delta-sign --delta-wrong-quantile --median-even-upper --no-abba
//   --gov-2s-frames --hold-frames --no-hold-buffer-check
//   --stress-count-smoke-exempt --drift-check-off --no-menu-guard
//   --no-size-guard --replace-active --flush-stage-drift
(0, eval)(slurp('tools/webui/harness/_game_env.js'));
LAB.init(__out, slurp, __engine, __argv);
(function () {
  var G = (0, eval)('this'), out = LAB.out, checked = 0, failed = 0;
  function has(flag) { return __argv.indexOf(flag) >= 0; }
  // A mutation run skips the legs that cannot reach its check, and says so.
  var mutationRun = __argv.slice(1).some(function (a) { return /^--/.test(a); });
  function needed(name, flags) {
    if (!mutationRun || flags.some(has)) return true;
    out('SKIP ' + name + ' (mutation run for another check)');
    return false;
  }
  function check(name, okay, detail) {
    checked++; if (!okay) failed++;
    out((okay ? 'PASS ' : 'FAIL ') + name + (okay ? '' : ' ' + JSON.stringify(detail === undefined ? null : detail)));
  }
  function run(name, fn) {
    try { fn(); } catch (e) {
      check(name + ' ran without an exception', false, {message: e.message, stack: String(e.stack || '').split('\n').slice(0, 4)});
    }
  }
  function mutate(source, flag, before, after) {
    if (!has(flag)) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + flag);
    return source.replace(before, after);
  }
  function r4(x) { return typeof x === 'number' && isFinite(x) ? Math.round(x * 1e4) / 1e4 : null; }
  function near(a, b, tol) { return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= (tol || 1e-9); }

  if (!LAB.load(__argv[0])) { out('SETUP game failed to load: ' + LAB.loadError); out('FX_BENCH_RESULT FAIL load'); return; }
  var benchSource = slurp('tools/game/fx-bench.js');
  benchSource = mutate(benchSource, '--no-restore', 'try { job.restored = restoreAll(job); }', 'try { job.restored = {ok: true, items: [], errors: []}; }');
  benchSource = mutate(benchSource, '--no-visibility-gate', "if (!o.allowHidden && (!doc || doc.visibilityState !== 'visible'))\n      return refuse(o,",
    "if (false)\n      return refuse(o,");
  benchSource = mutate(benchSource, '--no-hidden-guard', "if (!job.o.allowHidden && (!doc || doc.visibilityState !== 'visible'))\n      throw fail(",
    "if (false)\n      throw fail(");
  benchSource = mutate(benchSource, '--ring-off-by-one', 'if (h) { b.stages[STAGES[i]][m] = h[slot];', 'if (h) { b.stages[STAGES[i]][m] = h[(slot + G.PERF_HISTORY_LEN - 1) % G.PERF_HISTORY_LEN];');
  benchSource = mutate(benchSource, '--sim-all-ticks', 'G.physicsStageSamples = {}; G.physicsProfileEnabled = true;', 'G.physicsProfileEnabled = true;');
  benchSource = mutate(benchSource, '--readback-per-frame', '      for (var i = 0; i < fns.length; i++) fns[i]();\n    }',
    '      for (var i = 0; i < fns.length; i++) fns[i]();\n      c.getImageData(0, 0, 1, 1);\n    }');
  benchSource = mutate(benchSource, '--will-read-frequently', 'var SCRATCH_OPTS = {willReadFrequently: false};', 'var SCRATCH_OPTS = {willReadFrequently: true};');
  benchSource = mutate(benchSource, '--no-suppress-dump', '      G.dumpPerfBreakdown = function fxBenchSuppressedDump() {};\n', '');
  benchSource = mutate(benchSource, '--ab-single-mode', "setToggle(job, 'fxUnified', !legacy);", "setToggle(job, 'fxUnified', true);");
  benchSource = mutate(benchSource, '--bench-random', '8 + 20 * G.effectNoise(i, 7)', '8 + 20 * Math.random()');
  benchSource = mutate(benchSource, '--no-face-torch', 'G.cam.ang = Math.atan2(t.light.y - G.cam.y, t.light.x - G.cam.x); G.cam.pitch = 0;', '');
  benchSource = mutate(benchSource, '--stage-typo', "'ambientFX3D', 'fxOverlay', 'fx2D'];", "'ambientFX3D', 'fxOverlays', 'fx2D'];");
  benchSource = mutate(benchSource, '--bench-reload', '  function abort(reason) {\n', '  function abort(reason) {\n    if (reason === 0) G.location.reload();\n');
  benchSource = mutate(benchSource, '--shared-step', '    if (job.done || _job !== job) return;', '    job = _job; if (!job || job.done) return;');
  benchSource = mutate(benchSource, '--restore-stale-world', "        else if (t.world && worldReset) continue;                    // the reset's fresh list stays\n", '');
  benchSource = mutate(benchSource, '--no-live-reset', "if (live && worldReset) { G.fxReset('world', live); G.effectRegistryPrime('world'); }", '');
  benchSource = mutate(benchSource, '--no-live-rebase', 'if (live && (sx || sy) && !worldReset) G.fxRebase(sx, sy, live);', '');
  benchSource = mutate(benchSource, '--no-list-rebase', 't.value.forEach(function (rec) { if (rec) { rec.x -= sx; rec.y -= sy; } });', 't.value.forEach(function (rec) {});');
  benchSource = mutate(benchSource, '--no-raster-reset', 'GR.governor = 1; GR.ema = 0; GR.ring = -1; GR.rasterAcc = 0; GR.rasterMs = 0; GR.input = 0;',
    'GR.governor = 1; GR.ema = 0; GR.ring = -1;');
  benchSource = mutate(benchSource, '--no-raster-restore',
    "    touchProp(job, GR, 'rasterAcc', '_fxRender.rasterAcc'); touchProp(job, GR, 'rasterMs', '_fxRender.rasterMs'); touchProp(job, GR, 'input', '_fxRender.input');\n", '');
  benchSource = mutate(benchSource, '--weather-on-live', "    touchGlobal(job, 'fxState');\n",
    "    G.effectWeatherForce(T.weather === 'rain' ? 'rain' : 'clear', 1);\n    touchGlobal(job, 'fxState');\n");
  benchSource = mutate(benchSource, '--stats-poll', '    job.m = m + 1;\n', '    job.m = m + 1;\n    G.getEffectStats();\n');
  benchSource = mutate(benchSource, '--workload-once', '    if (slot === G._perfRingIdx) {', '    if (job.m === cell.frames) {');
  benchSource = mutate(benchSource, '--frame-total-wrong-slot', 'b.frame[m] = G._perfFrameTotals ? G._perfFrameTotals[slot] : 0;',
    'b.frame[m] = G._perfFrameTotals ? G._perfFrameTotals[(slot + 1) % G.PERF_HISTORY_LEN] : 0;');
  benchSource = mutate(benchSource, '--no-scratch-release', "      for (var k in job.scratch) try { job.scratch[k].canvas.width = job.scratch[k].canvas.height = 1; } catch (e) { /* host */ }\n", '');
  benchSource = mutate(benchSource, '--rain-never-forced', "G.effectWeatherForce(T.weather === 'rain' ? 'rain' : 'clear', 1);", "G.effectWeatherForce('clear', 1);");
  benchSource = mutate(benchSource, '--no-weather-toggle', "    if (T.weather === 'rain' && G.effectToggleValue('fxWeather') === 'off') setToggle(job, 'fxWeather', 'auto');\n", '');
  benchSource = mutate(benchSource, '--clear-not-forced', "G.effectWeatherForce(T.weather === 'rain' ? 'rain' : 'clear', 1);", "if (T.weather === 'rain') G.effectWeatherForce('rain', 1);");
  benchSource = mutate(benchSource, '--no-stress-fill', '    if (stress) stressFill(o);', '');
  benchSource = mutate(benchSource, '--stress-no-scale', '{count: n, scale: 1 / q.scale[4]}', '{count: n}');
  benchSource = mutate(benchSource, '--legacy-stress-P', 'G.AMBIENT_MAX = T.stress && legacy ? o.stress : cell.P;', 'G.AMBIENT_MAX = cell.P;');
  benchSource = mutate(benchSource, '--no-flame-refresh', '    if (T.flame) flameFrame(job);\n', '');
  benchSource = mutate(benchSource, '--no-combat', '    if (T.combat) combatFrame(job, T, dt);\n', '');
  benchSource = mutate(benchSource, '--hits-rate-x10', 'sc.hitAcc += T.combat.hits * dt;', 'sc.hitAcc += T.combat.hits * dt * 10;');
  benchSource = mutate(benchSource, '--no-debris-toggle', "    if (T.combat && G.effectToggleValue('fxDebris') !== true) setToggle(job, 'fxDebris', true);\n", '');
  benchSource = mutate(benchSource, '--p95-is-max', 'p95: r4(pct(a, 0.95))', 'p95: r4(a[n - 1])');
  benchSource = mutate(benchSource, '--p50-is-p60', 'p50: r4(pct(a, 0.5))', 'p50: r4(pct(a, 0.6))');
  benchSource = mutate(benchSource, '--delta-sign', 'r4(a.median - b.median)', 'r4(b.median - a.median)');
  benchSource = mutate(benchSource, '--delta-wrong-quantile', 'p95: d(N.sums[s].p95, O.sums[s].p95)', 'p95: d(N.sums[s].p50, O.sums[s].p50)');
  benchSource = mutate(benchSource, '--median-even-upper', '(a[m - 1] + a[m]) / 2', 'a[m]');
  benchSource = mutate(benchSource, '--no-abba', 'var modes = r & 1 ? o.modes.slice().reverse() : o.modes;', 'var modes = o.modes;');
  benchSource = mutate(benchSource, '--gov-2s-frames', "if (cell.governor === 'unpinned' && !job.gov.atTwoSeconds && now - job.govReset >= 2000)",
    "if (cell.governor === 'unpinned' && !job.gov.atTwoSeconds && job.m === 120)");
  benchSource = mutate(benchSource, '--hold-frames', 'if (cell.holdMs ? now - job.measureAt >= cell.holdMs : job.m >= cell.frames)', 'if (job.m >= cell.frames)');
  benchSource = mutate(benchSource, '--no-hold-buffer-check', '          else if (job.m >= cell.frames) {\n', '          else if (false) {\n');
  benchSource = mutate(benchSource, '--stress-count-smoke-exempt', "stress dots live when measuring began (lengthen warmup)');\n      job.scene.valid = false;",
    "stress dots live when measuring began (lengthen warmup)');\n      if (!job.o.smoke) job.scene.valid = false;");
  benchSource = mutate(benchSource, '--drift-check-off', 'if (Math.hypot(drift.x, drift.y) > 1 || Math.abs(drift.ang) > 1e-3) {', 'if (false) {');
  benchSource = mutate(benchSource, '--no-menu-guard', 'if (G.menuOpen || G.settingsOpen || G.shopOpen || G.inventoryOpen || G.forgeOpen)\n      throw fail(',
    'if (false)\n      throw fail(');
  benchSource = mutate(benchSource, '--no-size-guard', 'if (cv && (cv.width !== size[0] || cv.height !== size[1]))\n      throw fail(', 'if (false)\n      throw fail(');
  benchSource = mutate(benchSource, '--replace-active', "if (prev && typeof prev.status === 'function' && prev.status().active) {", 'if (false) {');
  benchSource = mutate(benchSource, '--flush-stage-drift', 'coneFX3D: function () { G.drawConeEffects3D(); G.drawFlameStream3D(); },', 'coneFX3D: function () { G.drawConeEffects3D(); },');

  // ── Fixture: Endless 424242 in 3D, its real loop driven frame by frame ──
  LAB.startEndless(424242);
  LAB.freezeDay(0.35); G.daySpeed = 0.0004;           // a moving day the bench must freeze and give back
  G._scheduleLoop();
  // One host frame: the game's loop callback, then the others (the bench).
  // Costs injected inside a callback move the virtual clock (so _pt and the
  // physics profiler time them exactly); the next frame still starts one
  // frame interval later.
  var inLoop = false, frameNo = 0, frames = [], cur = null, stepLog = [], postLog = [];
  function isLoop(fn) { return String(fn).indexOf('loop(ts, gen)') >= 0; }
  function others() { return LAB.rafQueue.filter(function (fn) { return !isLoop(fn); }).length; }
  // The bench's state and the game's own counters are logged once per frame,
  // after the loop callback and before the first of the other callbacks
  // runs (so a measure-phase entry describes the frame that step measures),
  // and again after the frame's last callback (the bench's step).
  function preStep(base) {
    var st = G.fxBench ? G.fxBench.status() : {active: false};
    if (!st.active) return;
    var S = G.fxState, W = G.effectWeatherState(), F = G._fxStats, GR = G._fxRender;
    stepLog.push({frame: cur ? cur.k : 0, base: base, index: st.index, phase: st.phase, mode: st.mode, target: st.target, repeat: st.repeat,
      warm: st.warm, unified: G.effectToggleValue('fxUnified'), ang: G.cam.ang, pitch: G.cam.pitch, camX: G.cam.x, camY: G.cam.y,
      motes: G.ambientParticles.length, live: S.count, weatherLive: S.classLive[0], weatherKind: W ? W.kind : 'none', pinned: S.pinned,
      fx: {considered: F.considered, drawn: F.drawn, thinned: F.thinned, offscreen: F.offscreen, subpixel: F.subpixel, glowDraws: F.glowDraws,
        maskPx: F.maskPx, torchDrawn: F.torchDrawn},
      gov: {rasterMs: GR.rasterMs, input: GR.input, ema: GR.ema, governor: GR.governor}});
  }
  function postStep() {
    var st = G.fxBench ? G.fxBench.status() : {active: false};
    if (st.active) postLog.push({frame: cur ? cur.k : 0, index: st.index, phase: st.phase, mode: st.mode, target: st.target,
      flameActive: G.flameStreamActive, flameTick: G.flameStreamLastTick, now: G.gameTimeNow(), flameAng: G.flameStreamAng, ang: G.cam.ang});
  }
  function pump(n, until) {
    for (var f = 0; f < n; f++) {
      if (until && until()) return f;
      var base = LAB.clock + LAB.FRAME_MS, q = LAB.rafQueue, logged = false;
      LAB.clock = base; LAB.rafQueue = [];
      for (var i = 0; i < q.length; i++) {
        var loopCb = isLoop(q[i]);
        if (loopCb) { inLoop = true; cur = {k: ++frameNo, combat: 0, sim: 0, total: 0}; }
        else if (!logged) { logged = true; preStep(base); observe(); }
        try { q[i](base); } finally { inLoop = false; }
        if (loopCb) { cur.total = LAB.clock - base; frames[cur.k] = cur; }
        LAB.clock = base;
      }
      postStep();
      observe();
    }
    return n;
  }
  pump(6);
  var ring0 = G._perfRingIdx;
  pump(3);
  (0, eval)(benchSource);
  check('fxBench loads beside the real game, whose loop advances frames in 3D',
    typeof G.fxBench === 'object' && typeof G.fxBench.run === 'function' && G.running && G.MODE3D && G.WORLD_SEED === 424242 &&
    G._perfRingIdx === (ring0 + 3) % G.PERF_HISTORY_LEN && G.fxState && G.fxState.tick >= 8,
    {seed: G.WORLD_SEED, ring0: ring0, ring: G._perfRingIdx, tick: G.fxState && G.fxState.tick});

  // ── Spies (harness-owned; removed at the end) ────────────────────────────
  // Stage costs: fxCombat3D varies by frame, ambientFX3D is constant; in a
  // flushed batch (outside the loop) fxCombat3D costs 0.125 ms. The sim
  // integrate step costs 1/64 ms. A scratch readback costs 1 ms. A leg may
  // install its own cost model (the A/B leg).
  var COMBAT = function (k) { return 0.0625 * (k % 5 + 1); }, AMBIENT = 0.03125, FLUSH_COMBAT = 0.125, SIM = 0.015625, READBACK = 1;
  var model = null;
  var origLayer = G.drawEffectLayer3D, origIntegrate = G.fxIntegrate, origCreate = G.document.createElement, origRandom = Math.random;
  var origDump = G.dumpPerfBreakdown, origStats = G.getEffectStats, origEvent = G.fxEvent;
  var scratchCtxs = [], contexts = [], canvases = [], readbacks = [], outCalls = [], dumpCalls = 0, benchDraws = 0, loopDraws = 0;
  var statsCalls = [], events = [];
  G.drawEffectLayer3D = function (layer) {
    if (inLoop) {
      var c = model ? model.loop(layer, cur.k) : layer === 1 ? COMBAT(cur.k) : layer === 0 ? AMBIENT : 0;
      LAB.advance(c); if (layer === 1) cur.combat += c;
    } else {
      LAB.advance(model ? model.flush(layer) : layer === 1 ? FLUSH_COMBAT : layer === 0 ? AMBIENT : 0);
      outCalls.push({layer: layer, ctx: scratchCtxs.indexOf(G.ctx)});
      if (G.ctx !== ctx0) changed.ctx = true;
    }
    return origLayer.apply(this, arguments);
  };
  G.fxIntegrate = function () { LAB.advance(SIM); if (inLoop) cur.sim++; return origIntegrate.apply(this, arguments); };
  G.document.createElement = function (tag) {
    var el = origCreate.apply(this, arguments);
    if (tag !== 'canvas') return el;
    var getContext = el.getContext;
    el.getContext = function (type, opts) {
      var id = contexts.length, c = getContext.apply(el, arguments), wrapped = new Proxy(c, {
        get: function (t, k) {
          if (k !== 'getImageData') return t[k];
          return function (x, y, w, h) { LAB.advance(READBACK); readbacks.push([x, y, w, h, id]); return t.getImageData(x, y, w, h); };
        },
        set: function (t, k, v) { t[k] = v; return true; }
      });
      contexts.push({type: type, opts: opts === undefined ? null : JSON.parse(JSON.stringify(opts)), width: el.width, height: el.height});
      canvases.push(el);
      scratchCtxs.push(wrapped);
      return wrapped;
    };
    return el;
  };
  Math.random = function () { if (inLoop) loopDraws++; else benchDraws++; return origRandom.apply(this, arguments); };
  G.dumpPerfBreakdown = function () { dumpCalls++; return origDump.apply(this, arguments); };
  // Who asks for the (allocating) stats, and in which bench phase.
  G.getEffectStats = function () {
    var st = G.fxBench ? G.fxBench.status() : {active: false};
    if (st.active) statsCalls.push({index: st.index, phase: st.phase});
    return origStats.apply(this, arguments);
  };
  // The bench's own producer calls (outside the loop), and whether each one
  // reached the event ring.
  G.fxEvent = function (type) {
    if (inLoop || !G.fxBench || !G.fxBench.status().active) return origEvent.apply(this, arguments);
    var S = G.fxState, n0 = S.stats.eventsIn, st = G.fxBench.status(), r = origEvent.apply(this, arguments);
    events.push({type: type, index: st.index, mode: st.mode, queued: G.fxState === S && S.stats.eventsIn === n0 + 1});
    return r;
  };
  // A torch 30 u away at 0.7 rad to the left of the view (T8's scene).
  var torchAng = G.cam.ang + 0.7, torch = {x: G.cam.x + 30 * Math.cos(torchAng), y: G.cam.y + 30 * Math.sin(torchAng), z: 40,
    radius: 90, intensity: 0.55, r: 255, g: 180, b: 80, kind: 'torch', nx: 1, ny: 0};
  G.pointLights.push(torch);
  G.cam.pitch = 0.2; G._fxRender.governor = 0.5; G.flameStreamAng = G.cam.ang + 1.3;   // values the bench must change and give back
  var ctx0 = G.ctx;

  // ── What the bench may touch (the fx-bench header and spec 12.2) ─────────
  var WATCH = {
    fxState: function () { return G.fxState; }, ambientParticles: function () { return G.ambientParticles; },
    AMBIENT_MAX: function () { return G.AMBIENT_MAX; }, deathEffects: function () { return G.deathEffects; },
    'settings.particles': function () { return G.settings.particles; }, toggles: function () { return JSON.stringify(G.effectTogglesSnapshot()); },
    'canvas.width': function () { return G.canvas.width; }, 'canvas.height': function () { return G.canvas.height; },
    'canvas.style.width': function () { return G.canvas.style.width; }, 'canvas.style.height': function () { return G.canvas.style.height; },
    ctx: function () { return G.ctx; }, dumpPerfBreakdown: function () { return G.dumpPerfBreakdown; },
    _perfBreakdown: function () { return G._perfBreakdown; }, physicsProfileEnabled: function () { return G.physicsProfileEnabled; },
    physicsStageSamples: function () { return G.physicsStageSamples; }, dayTime: function () { return G.dayTime; }, daySpeed: function () { return G.daySpeed; },
    'cam.ang': function () { return G.cam.ang; }, 'cam.pitch': function () { return G.cam.pitch; },
    flameStreamActive: function () { return G.flameStreamActive; }, flameStreamLastTick: function () { return G.flameStreamLastTick; },
    flameStreamStartMs: function () { return G.flameStreamStartMs; }, flameStreamAng: function () { return G.flameStreamAng; },
    flameStreamRange: function () { return G.flameStreamRange; },
    '_fxRender.governor': function () { return G._fxRender.governor; }, '_fxRender.ema': function () { return G._fxRender.ema; },
    '_fxRender.ring': function () { return G._fxRender.ring; }, '_fxRender.rasterAcc': function () { return G._fxRender.rasterAcc; },
    '_fxRender.rasterMs': function () { return G._fxRender.rasterMs; }, '_fxRender.input': function () { return G._fxRender.input; }
  };
  var changed = {}, snap = null;
  function same(a, b) { return a === b || a !== a && b !== b; }
  // A snapshot also keeps the pool that was live and its state: a run must
  // leave that pool exactly as it was (it sits out every run).
  function snapshot() { var s = {}; for (var k in WATCH) s[k] = WATCH[k](); s.__pool = G.fxState; s.__live = JSON.stringify(live(G.fxState)); return s; }
  function diffs(s) {
    var d = []; for (var k in WATCH) if (!same(WATCH[k](), s[k])) d.push(k);
    if (JSON.stringify(live(s.__pool)) !== s.__live) d.push('live pool');
    return d;
  }
  function observe() { if (!snap) return; for (var k in WATCH) if (!same(WATCH[k](), snap[k])) changed[k] = true; }
  // Everything of the live pool a run could reach while it sits out: its
  // counters, streams, weather force, prewarm, anchors, queued events and
  // every live position (a checksum).
  function live(S) {
    var xy = 0;
    for (var i = 0; i < S.count; i++) xy += S.x[i] * (i + 1) + S.y[i] * (i + 7) + S.z[i] * (i + 13);
    return {count: S.count, tick: S.tick, simTime: S.simTime, serial: S.serial, seed: S.seed, legacyRng: S.legacyRng, prewarm: S.prewarm,
      pinned: S.pinned, force: [S.weather.force, S.weather.forceI], anchors: S.anchors.live, events: S.ev.count, xy: xy};
  }
  var ENGINE_STAGES = ['draw()', 'coneFX3D', 'fxCombat3D', 'torchGlow3D', 'ambientFX3D', 'fxOverlay'];
  var globalsBefore = Object.getOwnPropertyNames(G).sort();
  // Runs in a leg's log, by run index: its pre-step entries (all, and the
  // measured frames).
  function byRun(log) {
    var runs = [];
    log.forEach(function (s) {
      var r = runs[s.index] = runs[s.index] || {steps: [], measured: []};
      r.steps.push(s);
      if (s.phase === 'measure') r.measured.push(s);
    });
    return runs;
  }
  function startRun(opts) {
    var res = {report: null, error: null}, o = {};
    for (var k in opts) o[k] = opts[k];
    o.onDone = function (r) { res.report = r; }; o.onError = function (e) { res.error = e; };
    var p = G.fxBench.run(o);
    if (p && p.catch) p.catch(function () {});
    return res;
  }
  function allRuns(report) {
    var runs = [];
    if (report && report.targets) Object.keys(report.targets).forEach(function (id) { runs = runs.concat(report.targets[id].runs); });
    return runs;
  }

  // ── C1, C2: the visibility gate at the door ──────────────────────────────
  if (needed('the visibility gate', ['--no-visibility-gate', '--no-hidden-guard', '--shared-step', '--no-restore'])) run('the visibility gate', function () {
    var doc = G.document, legs = [];
    [undefined, 'hidden', 'prerender'].forEach(function (v) {
      doc.visibilityState = v;
      var before = snapshot(), q = LAB.rafQueue.length, err = null, p;
      p = G.fxBench.run({target: 'T2', onError: function (e) { err = e; }});
      if (p && p.catch) p.catch(function () {});
      var active = G.fxBench.status().active;
      legs.push({state: v === undefined ? null : v, message: err && err.message, changed: diffs(before), queued: LAB.rafQueue.length - q, active: active});
      if (active) G.fxBench.abort('harness cleanup');
    });
    check('a page that is not visible is refused with a message naming visibilityState and allowHidden; nothing changes and no frame is requested',
      legs.every(function (l) { return l.message && /visibilityState/.test(l.message) && /allowHidden/.test(l.message) && !l.changed.length && !l.queued && !l.active; }), legs);
    // Control: the same call on a visible page is accepted, then aborted.
    doc.visibilityState = 'visible';
    var before = snapshot(), q = LAB.rafQueue.length, err = null, p2 = G.fxBench.run({target: 'T2', frames: 50, warmup: 2, repeats: 1, sizes: [[400, 270]],
      smoke: true, onError: function (e) { err = e; }});
    if (p2 && p2.catch) p2.catch(function () {});
    var accepted = G.fxBench.status().active && LAB.rafQueue.length === q + 1;
    pump(3);
    var mid = diffs(before), aborted = G.fxBench.abort('harness'), after = diffs(before);
    // The host's cancelAnimationFrame is a no-op, so the frame the aborted
    // run requested still fires. A run started before it fires must still
    // get exactly one step per frame, and once that run is aborted too, the
    // frame after leaves no bench callback behind.
    var pending = others(), err2 = null, p4 = G.fxBench.run({target: 'T2', frames: 50, warmup: 20, repeats: 1, sizes: [[400, 270]], smoke: true,
      onError: function (e) { err2 = e; }});
    if (p4 && p4.catch) p4.catch(function () {});
    pump(2);
    var perFrame = others(), warm = G.fxBench.status().warm;
    G.fxBench.abort('harness');
    var afterAll = diffs(before);
    pump(1);
    var leftOver = others();
    check('a visible page is accepted and fxBench.abort() restores it at once',
      accepted && mid.length >= 5 && aborted && !G.fxBench.status().active && !after.length && err && /aborted/.test(err.message) &&
      err.report && err.report.restored && err.report.restored.ok && pending === 1 && perFrame === 1 && warm === 2 && leftOver === 0 &&
      !afterAll.length && err2 && /aborted/.test(err2.message),
      {accepted: accepted, changedMidRun: mid, notRestored: after, error: err && err.message, pendingAfterAbort: pending,
        benchCallbacksPerFrameOfTheNextRun: perFrame, warm: warm, leftOver: leftOver, notRestoredAfterBoth: afterAll});
    // C3: a tab hidden mid-run.
    before = snapshot(); err = null;
    var p3 = G.fxBench.run({target: 'T2', frames: 50, warmup: 2, repeats: 1, sizes: [[400, 270]], smoke: true, onError: function (e) { err = e; }});
    if (p3 && p3.catch) p3.catch(function () {});
    pump(4);
    var running = G.fxBench.status().active && !err;
    doc.visibilityState = 'hidden';
    pump(2, function () { return !G.fxBench.status().active; });
    var stopped = !G.fxBench.status().active, left = diffs(before);
    check('a tab hidden mid-run ends the run, discards its results and restores the page',
      running && stopped && err && /visible/.test(err.message) && /discarded/.test(err.message) && !left.length &&
      err.report && err.report.runsDone === 0,
      {running: running, stopped: stopped, error: err && err.message, notRestored: left});
    if (G.fxBench.status().active) G.fxBench.abort('harness cleanup');
    doc.visibilityState = undefined;
  });

  // ── The smoke pass: every target, both modes, one size and setting ──────
  // Particles 60, where the stress class scale (1.25) differs from 1, and a
  // 300-dot stress fill the warm-up admits in one tick. The Weather switch
  // is off and Impact debris is off, so the bench must turn them on.
  var SMOKE_FLAGS = ['--no-restore', '--ring-off-by-one', '--sim-all-ticks', '--readback-per-frame', '--will-read-frequently',
    '--no-suppress-dump', '--ab-single-mode', '--bench-random', '--no-face-torch', '--stage-typo', '--no-raster-reset', '--no-raster-restore',
    '--weather-on-live', '--stats-poll', '--workload-once', '--frame-total-wrong-slot', '--no-scratch-release', '--rain-never-forced',
    '--no-weather-toggle', '--no-stress-fill', '--stress-no-scale', '--legacy-stress-P', '--stress-count-smoke-exempt', '--no-flame-refresh',
    '--drift-check-off'];
  var OPTS = {target: 'all', frames: 3, warmup: 2, repeats: 1, sizes: [[400, 270]], particles: [60], stress: 300, flushFrames: 2, flushBatches: 1,
    allowHidden: true, smoke: true};
  var smokeRan = false, smokeOk = false, report = null, runs = [], smokeSteps = [], smokePost = [], smokeByRun = [], measured = {};
  if (needed('the smoke pass', SMOKE_FLAGS)) {
    smokeRan = true;
    var runError = null, liveBefore = live(G.fxState), liveState = G.fxState;
    var dumpAtStart, logReset, readbacksAtStart = readbacks.length, contextsAtStart = contexts.length, statsAtStart = statsCalls.length;
    stepLog = []; postLog = []; outCalls = []; benchDraws = 0; loopDraws = 0; changed = {};
    G.setEffectToggle('fxWeather', 'off'); G.setEffectToggle('fxDebris', false);
    run('the smoke pass', function () {
      G._perfBreakdownLog = 0;                            // the loop's 5 s dump is due on the next frame
      // Distinct raster input the bench must zero and give back.
      G._fxRender.rasterAcc = 4096; G._fxRender.rasterMs = 0.5; G._fxRender.input = 0.75;
      snap = snapshot(); dumpAtStart = dumpCalls;
      var res = startRun(OPTS);
      logReset = false;
      pump(400, function () { if (G._perfBreakdownLog > 0) logReset = true; return res.report || res.error; });
      report = res.report; runError = res.error;
    });
    var benchDumps = dumpCalls - dumpAtStart, notRestored = diffs(snap), smokeStats = statsCalls.slice(statsAtStart);
    smokeSteps = stepLog; smokePost = postLog;
    snap = null; stepLog = []; postLog = [];
    G.setEffectToggle('fxWeather', 'auto'); G.setEffectToggle('fxDebris', true);
    runs = allRuns(report);
    smokeOk = !!report && !runError;
    if (!smokeOk) out('SETUP smoke run did not complete: ' + (runError && runError.message) + ' ' + JSON.stringify(runError && runError.report && runError.report.errorStack));
    smokeByRun = byRun(smokeSteps);

    // Measured frames per run: a frame is measured when the bench step after it
    // begins in its measure phase.
    smokeSteps.forEach(function (s) { if (s.phase === 'measure') (measured[s.index] = measured[s.index] || []).push(frames[s.frame]); });

    // ── C4: restoration after a completed run ────────────────────────────────
    var MUST_CHANGE = Object.keys(WATCH);
    var unchanged = MUST_CHANGE.filter(function (k) { return !changed[k]; });
    check('every global the bench changes is restored after a completed run, and the live pool sat out',
      smokeOk && !notRestored.length && !unchanged.length && G.fxState === liveState &&
      JSON.stringify(live(G.fxState)) === JSON.stringify(liveBefore) && report.restored.ok,
      {notRestored: notRestored, neverChanged: unchanged, livePool: {before: liveBefore, after: live(G.fxState)}, restored: report && report.restored});

    // ── C5: the report's shape ───────────────────────────────────────────────
    run('the report shape', function () {
      var bad = [];
      (function walk(v, path) {
        if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
        if (typeof v === 'number') { if (!isFinite(v)) bad.push(path); return; }
        if (Array.isArray(v)) { v.forEach(function (x, i) { walk(x, path + '[' + i + ']'); }); return; }
        if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) { for (var k in v) walk(v[k], path + '.' + k); return; }
        bad.push(path + ':' + typeof v);
      }(report, 'report'));
      // Spec 12.1: T1 idle (P 0), T2 and T4 Medium (25), T5 Ultra (60), T9 with
      // the governor unpinned and pinned; the rest at the requested settings.
      var PINNED_P = {T1: [0], T2: [25], T4: [25], T5: [60]}, GOVS = {T9: 2}, IDS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10'], expected = 0;
      IDS.forEach(function (id) { expected += (PINNED_P[id] || OPTS.particles).length * (GOVS[id] || 1) * OPTS.sizes.length * OPTS.repeats * 2; });
      var e = report && report.env || {}, missing = [];
      ['userAgent', 'devicePixelRatio', 'canvas', 'visibilityState', 'timerResolution', 'crossOriginIsolated'].forEach(function (k) { if (!(k in e)) missing.push('env.' + k); });
      if (!e.canvas || e.canvas.width !== 360 || e.canvas.height !== 240) missing.push('env.canvas size');
      if (!e.timerResolution || !('minMs' in e.timerResolution) || !('medianMs' in e.timerResolution)) missing.push('env.timerResolution');
      if (!e.game || !e.game.render || typeof e.game.render.preset !== 'string' || !e.game.render.features ||
          e.game.render.features.wallPropModels !== G.renderFeatureSnapshot().wallPropModels) missing.push('env.game.render');
      var runProblems = [];
      runs.forEach(function (r, i) {
        var p = [];
        ENGINE_STAGES.forEach(function (s) { var x = r.stages[s]; if (!x || typeof x.p50 !== 'number' || typeof x.p95 !== 'number' || typeof x.mean !== 'number') p.push('stage ' + s); });
        if (r.frames.measured !== OPTS.frames || typeof r.frames.measuredMs !== 'number') p.push('frames');
        if (!r.effectsSim || typeof r.effectsSim.p95 !== 'number') p.push('effectsSim');
        // The host's frame interval, on a clock whose step is 2^-12 ms.
        if (!r.cadence || !near(r.cadence.p50, LAB.FRAME_MS, 5e-4) || r.cadence.n !== OPTS.frames) p.push('cadence ' + JSON.stringify(r.cadence));
        if (!r.workload || typeof r.workload.liveAtStart !== 'number' || !r.workload.sampledFrames || typeof r.workload.legacyMotes !== 'number') p.push('workload');
        if (!r.scene || !r.errors || Object.keys(r.errors.pt).length || Object.keys(r.errors.effects).length) p.push('scene/errors');
        // Seed 424242 is the protocol seed; T8 has none.
        if (r.scene.seed !== 424242 || r.scene.protocolSeed !== (r.target === 'T8' ? null : true)) p.push('seed');
        if ((r.target === 'T10') !== (r.flushed === null)) p.push('flushed presence');
        if (p.length) runProblems.push({i: i, target: r.target, mode: r.mode, problems: p});
      });
      var abProblems = [];
      report && Object.keys(report.targets).forEach(function (id) {
        var t = report.targets[id];
        t.ab.forEach(function (g) {
          if (!g.modes['new'] || !g.modes.legacy || !g.delta || !g.delta['sum:allFx'] || !g.delta.effectsSim || !/^new - legacy/.test(g.deltaIs))
            abProblems.push(id + ' ' + g.P + ' ' + g.governor);
        });
        if (t.ab.length * 2 !== t.runs.length) abProblems.push(id + ' groups');
      });
      check('the report is plain JSON: environment metadata, every planned run, stage p50/p95/mean, effectsSim, cadence, workload and A/B pairs',
        smokeOk && !bad.length && report.complete && report.smoke && /not a measurement/.test(report.note) && report.runsDone === expected &&
        runs.length === expected && report.runsPlanned === expected && !missing.length && !runProblems.length && !abProblems.length &&
        Object.keys(report.targets).join() === IDS.join(),
        {nonJson: bad.slice(0, 5), expectedRuns: expected, runsDone: report && report.runsDone, missing: missing, runs: runProblems.slice(0, 4), ab: abProblems.slice(0, 4)});
    });

    // ── C6, C7: stage and sim timings against the costs injected here ────────
    // Three measured frames: the nearest-rank p50 is the middle value, p95
    // and max the largest (C25 covers 40 frames).
    run('the timing plumbing', function () {
      function three(list) { var a = list.slice().sort(function (x, y) { return x - y; }); return {mid: a[1], top: a[2]}; }
      function mean(list) { var s = 0; list.forEach(function (v) { s += v; }); return s / list.length; }
      var bad = [], simBad = [], totalBad = [];
      runs.forEach(function (r, i) {
        var F = measured[i] || [], combat = F.map(function (f) { return f.combat; }), sum = combat.map(function (c) { return c + AMBIENT; });
        var got = r.stages.fxCombat3D, amb = r.stages.ambientFX3D, s = r.sums.allFx, c3 = three(combat), s3 = three(sum);
        var ok = F.length === 3 && got && got.p50 === r4(c3.mid) && got.p95 === r4(c3.top) && got.max === r4(c3.top) &&
          near(got.mean, r4(mean(combat)), 1.5e-4) && amb && amb.p50 === r4(AMBIENT) && amb.max === r4(AMBIENT) &&
          s && s.p50 === r4(s3.mid) && s.p95 === r4(s3.top) && near(s.mean, r4(mean(sum)), 1.5e-4);
        if (!ok) bad.push({run: i, target: r.target, mode: r.mode, frames: F.map(function (f) { return f && f.k; }), want: {combat: combat, sum: sum},
          got: {combat: got, ambient: amb && amb.p50, allFx: s}});
        // The loop's whole-frame time of the same frames (each loop callback's virtual time).
        var totals = F.map(function (f) { return f.total; }), t3 = three(totals), fj = r.frameJs;
        if (!(F.length === 3 && fj && fj.p50 === r4(t3.mid) && fj.max === r4(t3.top) && near(fj.mean, r4(mean(totals)), 1.5e-4) && t3.top > 0))
          totalBad.push({run: i, target: r.target, want: totals, got: fj});
        var ticks = 0; F.forEach(function (f) { ticks += f.sim; });
        var sim = r.effectsSim;
        if (!(ticks > 0 && sim.n === ticks && sim.p50 === r4(SIM) && sim.max === r4(SIM))) simBad.push({run: i, target: r.target, ticks: ticks, got: sim});
      });
      check('stage p50/p95/mean come from the _pt ring of each measured frame, per-frame sums and frame totals from the same frame',
        smokeOk && runs.length > 0 && !bad.length && !totalBad.length, {bad: bad.slice(0, 3), frameTotals: totalBad.slice(0, 3), runs: runs.length});
      check('effectsSim p50/p95/mean come from the physics profiler samples of the measured ticks only',
        smokeOk && runs.length > 0 && !simBad.length, {bad: simBad.slice(0, 3)});
    });

    // ── C8: flushed batches ──────────────────────────────────────────────────
    run('the flushed batches', function () {
      // Spec 12.1 flush stage sets: T1, T5, T9 every fx stage; T2 its three;
      // T3, T4 the world layer; T6 the combat layer; T7 the beam and the combat
      // layer; T8 the torch glow; T10 none. Costs injected: combat 0.125 and
      // world 0.03125 ms per flushed frame, 1 ms per readback.
      var NET = {T1: FLUSH_COMBAT + AMBIENT, T2: FLUSH_COMBAT + AMBIENT, T3: AMBIENT, T4: AMBIENT, T5: FLUSH_COMBAT + AMBIENT,
        T6: FLUSH_COMBAT, T7: FLUSH_COMBAT, T8: 0, T9: FLUSH_COMBAT + AMBIENT};
      var flushedRuns = runs.filter(function (r) { return r.flushed; }), rb = readbacks.slice(readbacksAtStart), bad = [], used = [];
      outCalls.forEach(function (c) { if (used.indexOf(c.ctx) < 0) used.push(c.ctx); });
      var ctxs = used.map(function (i) { return i >= 0 ? contexts[i] : null; });
      flushedRuns.forEach(function (r) {
        var f = r.flushed, n = f.framesPerBatch;
        if (!(f.batches === OPTS.flushBatches && n === OPTS.flushFrames && f.willReadFrequently === false && f.width === 400 && f.height === 270 &&
          f.netFlushedMsPerFrame.median === r4(NET[r.target]) && f.jsMsPerFrame.median === r4(NET[r.target]) &&
          f.floorMsPerFrame.median === r4(READBACK / n) && f.flushedMsPerFrame.median === r4(NET[r.target] + READBACK / n)))
          bad.push({target: r.target, mode: r.mode, flushed: f, wantNet: NET[r.target]});
      });
      var expectReadbacks = flushedRuns.length * OPTS.flushBatches * 2;
      // One scratch canvas (one size), created after the pass began; every
      // readback is one pixel of it; the pass gives its memory back (1 x 1).
      var onePixel = rb.every(function (a) { return a[0] === 0 && a[1] === 0 && a[2] === 1 && a[3] === 1 && used.length === 1 && a[4] === used[0]; });
      var gpu = ctxs.length === 1 && ctxs.every(function (c) { return c && c.type === '2d' && c.opts && c.opts.willReadFrequently === false && c.width === 400 && c.height === 270; });
      var onScratch = outCalls.length > 0 && used.length === 1 && used[0] >= contextsAtStart;
      var released = used.length === 1 && used[0] >= 0 && canvases[used[0]].width === 1 && canvases[used[0]].height === 1;
      check('flushed timings use a willReadFrequently:false scratch canvas with exactly one 1-pixel readback per batch, against a clear-only floor',
        smokeOk && flushedRuns.length === runs.length - 2 && rb.length === expectReadbacks && onePixel && gpu && onScratch && released && !bad.length && G.ctx === ctx0,
        {readbacks: rb.length, expected: expectReadbacks, onePixel: onePixel, scratch: ctxs, drawsOnScratch: onScratch,
          scratchAfter: used.length === 1 && used[0] >= 0 ? [canvases[used[0]].width, canvases[used[0]].height] : null, bad: bad.slice(0, 2)});
    });

    // ── C9: the periodic dump ────────────────────────────────────────────────
    run('the periodic dump', function () {
      var during = benchDumps;
      G._perfBreakdownLog = 0;                            // positive control: due again, now with the real one back
      var c0 = dumpCalls;
      pump(1);
      check('dumpPerfBreakdown is suppressed during the run and restored after',
        smokeOk && logReset && during === 0 && dumpCalls === c0 + 1 && G.dumpPerfBreakdown !== origDump,
        {callsDuringRun: during, loopReachedTheDump: logReset, controlCalls: dumpCalls - c0});
    });

    // ── C10: A/B modes ───────────────────────────────────────────────────────
    run('the A/B modes', function () {
      var wrong = [], seen = {}, labels = [];
      smokeSteps.forEach(function (s) {
        if (s.phase !== 'measure') return;
        seen[s.mode] = true;
        if (s.unified !== (s.mode === 'new')) wrong.push(s);
        labels[s.index] = s.mode;
      });
      var mismatched = runs.filter(function (r, i) { return labels[i] !== r.mode; }).length;
      check('each A/B run measures its own mode: Unified effects on for New, off for Legacy',
        smokeOk && seen['new'] && seen.legacy && !wrong.length && !mismatched && labels.length === runs.length,
        {wrong: wrong.slice(0, 3).map(function (s) { return {frame: s.frame, index: s.index, mode: s.mode, target: s.target, unified: s.unified}; }),
          mismatchedLabels: mismatched, seen: seen});
    });

    // ── C11: the gameplay random stream ──────────────────────────────────────
    // Non-vacuous: Legacy runs initialise their motes (legacy code that draws
    // random numbers) inside the bench's own steps, on the private stream.
    var legacyMotes = smokeSteps.filter(function (s) { return s.mode === 'legacy' && s.target === 'T2' && s.motes === 25; }).length;
    check('the bench never draws from the gameplay random stream', smokeOk && benchDraws === 0 && legacyMotes > 0,
      {benchDraws: benchDraws, legacyMoteSteps: legacyMotes, gameDrawsMeanwhile: loopDraws});

    // ── C12: T8 faces the torch ──────────────────────────────────────────────
    run('the torch scene', function () {
      var t8 = smokeSteps.filter(function (s) { return s.target === 'T8' && s.phase === 'measure'; }), off = [];
      t8.forEach(function (s) {
        var want = Math.atan2(torch.y - s.camY, torch.x - s.camX), d = Math.atan2(Math.sin(s.ang - want), Math.cos(s.ang - want));
        if (!(Math.abs(d) < 1e-9 && s.pitch === 0)) off.push({ang: s.ang, want: want, pitch: s.pitch});
      });
      var reported = runs.filter(function (r) { return r.target === 'T8'; }).map(function (r) { return r.scene; });
      check('T8 faces the nearest torch and records its distance',
        smokeOk && t8.length === 2 * OPTS.frames && !off.length && reported.length === 2 &&
        reported.every(function (s) { return near(s.torchDistance, 30, 1e-3) && s.valid; }),
        {measuredSteps: t8.length, off: off.slice(0, 2), scenes: reported});
    });

    // ── C19: the governor's raster input starts afresh in every run ──────────
    // The first frame of an unpinned run steps its governor from the pixels
    // painted since the reset (none) and the previous frame's New-mode stage
    // times: combat as injected here, plus the world layer when the ambient
    // family is New (torch glow and overlay cost nothing here). The run
    // before (T9 New, unpinned) painted raster in its frames and its flush.
    run('the raster input', function () {
      var rows = [], painted = false;
      smokeByRun.forEach(function (R, i) {
        if (!R || !runs[i] || runs[i].governor !== 'unpinned') return;
        var first = R.steps[0], prev = frames[first.frame - 1];
        var want = prev.combat + (first.unified ? AMBIENT : 0);
        rows.push({run: i, mode: runs[i].mode, warm: first.warm, rasterMs: first.gov.rasterMs, input: first.gov.input, wantInput: want});
        if (runs[i].mode === 'new') R.measured.forEach(function (s) { if (s.gov.rasterMs > 0) painted = true; });
      });
      check('every unpinned run starts its governor with no raster from earlier runs or flushed batches',
        smokeOk && rows.length === 2 && painted && rows.every(function (w) { return w.warm === 0 && w.rasterMs === 0 && near(w.input, w.wantInput, 1e-12); }),
        {firstFrames: rows, newRunPainted: painted});
    });

    // ── C20: no allocating stats while measuring ─────────────────────────────
    // Positive control: the one call each run makes as it ends is seen.
    var inMeasure = smokeStats.filter(function (c) { return c.phase === 'measure' || c.phase === 'warmup'; });
    var atEnd = smokeStats.filter(function (c) { return c.phase === 'ended'; });
    check('getEffectStats (which allocates in fx functions) is never called while a run warms up or measures, only once as each run ends',
      smokeOk && !inMeasure.length && atEnd.length === runs.length,
      {callsWhileMeasuring: inMeasure.length, first: inMeasure.slice(0, 2), callsAtRunEnd: atEnd.length, runs: runs.length});

    // ── C21: workload counters of the measured frames ────────────────────────
    run('the workload counters', function () {
      var KEYS = ['considered', 'drawn', 'thinned', 'offscreen', 'subpixel', 'glowDraws', 'maskPx', 'torchDrawn'], bad = [], varied = false, drawn = false;
      runs.forEach(function (r, i) {
        var M = smokeByRun[i] ? smokeByRun[i].measured : [], w = r.workload.meanPerFrame, n = M.length, p = [];
        if (!n || r.workload.sampledFrames !== n) p.push('sampledFrames ' + r.workload.sampledFrames + ' of ' + n);
        var sumLive = 0; M.forEach(function (s) { sumLive += s.live; });
        if (!near(w.live, r4(sumLive / n), 1.5e-4)) p.push('live ' + w.live + ' want ' + r4(sumLive / n));
        KEYS.forEach(function (k) {
          var sum = 0; M.forEach(function (s) { sum += s.fx[k]; });
          if (!near(w[k], r4(sum / n), 1.5e-4)) p.push(k + ' ' + w[k] + ' want ' + r4(sum / n));
        });
        if (n > 1 && M.some(function (s) { return s.fx.drawn !== M[0].fx.drawn; })) varied = true;
        if (M.some(function (s) { return s.fx.drawn > 0; })) drawn = true;
        if (p.length) bad.push({run: i, target: r.target, mode: r.mode, problems: p});
      });
      check("the workload counters are the means of the game's own per-frame counters over exactly the measured frames",
        smokeOk && varied && drawn && !bad.length, {bad: bad.slice(0, 3), drawnVaries: varied, anyDrawn: drawn});
    });

    // ── C23: T3's stress count ───────────────────────────────────────────────
    run('the stress scene', function () {
      var rows = [];
      runs.forEach(function (r, i) {
        if (r.target !== 'T3') return;
        var M = smokeByRun[i].measured;
        rows.push({mode: r.mode, valid: r.scene.valid, frames: M.length, live: M.map(function (s) { return s.live; }), motes: M.map(function (s) { return s.motes; })});
      });
      // A warm-up too short for the count (one tick admits at most 384) is
      // reported invalid, in a smoke run too.
      stepLog = [];
      var res = startRun({target: 'T3', modes: ['new'], stress: 1000, frames: 3, warmup: 1, repeats: 1, sizes: [[400, 270]], particles: [60],
        allowHidden: true, smoke: true});
      pump(40, function () { return res.report || res.error; });
      var sm = (byRun(stepLog)[0] || {measured: []}).measured, sr = allRuns(res.report)[0];
      var shortRun = sr ? {valid: sr.scene.valid, liveAtFirstFrame: sm.length ? sm[0].live : null, notes: sr.scene.notes} : null;
      stepLog = [];
      // New: the pool holds exactly the stress count of dots; Legacy: that many legacy motes.
      check('T3 measures the stress count: that many live dots in New and that many legacy motes in Legacy',
        smokeOk && rows.length === 2 && rows.every(function (w) {
          return w.frames === OPTS.frames && w.valid && (w.mode === 'new' ? w.live.every(function (v) { return v === OPTS.stress; }) :
            w.motes.every(function (v) { return v === OPTS.stress; }));
        }) && shortRun && shortRun.liveAtFirstFrame < 1000 && shortRun.valid === false && shortRun.notes.some(function (n) { return /of 1000 stress dots/.test(n); }),
        {stress: OPTS.stress, runs: rows, short: shortRun});
    });

    // ── C24: T7 holds the beam ───────────────────────────────────────────────
    run('the flame scene', function () {
      var t7 = smokePost.filter(function (s) { return s.target === 'T7'; });
      var bad = t7.filter(function (s) { return !(s.flameActive === true && s.flameTick === s.now && s.flameAng === s.ang); });
      check('T7 holds the flame beam: its presentation state is refreshed at the current game time on every step',
        smokeOk && t7.length >= 2 * (OPTS.warmup + OPTS.frames) && !bad.length,
        {steps: t7.length, stale: bad.slice(0, 3).map(function (s) { return {index: s.index, phase: s.phase, flameTick: s.flameTick, now: s.now, active: s.flameActive}; })});
    });
  }

  // ── The A/B leg: T6, 40 measured frames, two repeats, known costs ───────
  // Costs by construction (u = 1/16 ms): the combat layer of frame k costs
  // ((17 k) mod 40 + 1) u in New and twice that in Legacy, so any 40
  // consecutive frames hold 1..40 u (or 2..80 u); the world layer costs
  // (1 + 2 r) u in New and (4 + 2 r) u in Legacy in repeat r; a flushed
  // combat frame costs 0.125 ms in New and 0.25 ms in Legacy. The Weather
  // switch asks for snow and Impact debris is off.
  var AB_FLAGS = ['--p95-is-max', '--p50-is-p60', '--delta-sign', '--delta-wrong-quantile', '--median-even-upper', '--no-abba',
    '--no-combat', '--hits-rate-x10', '--no-debris-toggle', '--clear-not-forced'];
  var U = 0.0625, AB = {frames: 40, warmup: 2, repeats: 2};
  var abReport = null, abRuns = [], abByRun = [], abEvents = [], abOk = false, abRan = false;
  if (needed('the A/B leg', AB_FLAGS)) run('the A/B leg', function () {
    abRan = true;
    model = {
      loop: function (layer, k) {
        var unified = G.effectToggleValue('fxUnified') === true, st = G.fxBench.status(), r = st.active ? st.repeat : 0;
        if (layer === 1) return ((17 * k) % 40 + 1) * U * (unified ? 1 : 2);
        if (layer === 0) return U * (unified ? 1 + 2 * r : 4 + 2 * r);
        return 0;
      },
      flush: function (layer) { return layer === 1 ? (G.effectToggleValue('fxUnified') === true ? 0.125 : 0.25) : 0; }
    };
    stepLog = []; var e0 = events.length;
    G.setEffectToggle('fxWeather', 'snow'); G.setEffectToggle('fxDebris', false);
    var res = startRun({target: 'T6', frames: AB.frames, warmup: AB.warmup, repeats: AB.repeats, sizes: [[400, 270]], particles: [25],
      flushFrames: 2, flushBatches: 1, allowHidden: true, smoke: true});
    pump(400, function () { return res.report || res.error; });
    G.setEffectToggle('fxWeather', 'auto'); G.setEffectToggle('fxDebris', true);
    model = null;
    abReport = res.report; abRuns = allRuns(abReport); abByRun = byRun(stepLog); abEvents = events.slice(e0); stepLog = [];
    abOk = !!abReport && !res.error && abRuns.length === 4;
    if (!abOk) out('SETUP the A/B leg did not complete: ' + (res.error && res.error.message));
  });

  // ── C22: the weather each target measures ────────────────────────────────
  // Smoke: forced rain in New for T4, T5, T9 and T10 (the Weather switch was
  // off), none in Legacy, no weather elsewhere. A/B leg: T6 stays clear
  // although the Weather switch asks for snow.
  if (smokeRan || abRan) run('the weather scenes', function () {
    var RAIN = {T4: 1, T5: 1, T9: 1, T10: 1}, bad = [], rainFrames = 0, clearFrames = 0;
    runs.forEach(function (r, i) {
      (smokeByRun[i] ? smokeByRun[i].measured : []).forEach(function (s) {
        var ok = RAIN[r.target] && r.mode === 'new' ? s.weatherKind === 'rain' && s.weatherLive > 0 : s.weatherLive === 0;
        if (RAIN[r.target] && r.mode === 'new' && ok) rainFrames++;
        if (!ok) bad.push({leg: 'smoke', target: r.target, mode: r.mode, frame: s.frame, kind: s.weatherKind, weatherLive: s.weatherLive});
      });
    });
    abRuns.forEach(function (r, i) {
      (abByRun[i] ? abByRun[i].measured : []).forEach(function (s) {
        if (s.weatherKind === null && s.weatherLive === 0) clearFrames++;
        else bad.push({leg: 'A/B', target: r.target, mode: r.mode, frame: s.frame, kind: s.weatherKind, weatherLive: s.weatherLive});
      });
    });
    // Five New rain runs in the smoke pass (T4, T5, T9 unpinned and pinned,
    // T10); four clear A/B runs.
    check('rain targets measure forced rain in New and none in Legacy; clear targets stay clear whatever the Weather switch asks',
      (!smokeRan || smokeOk && rainFrames === 5 * OPTS.frames) && (!abRan || abOk && clearFrames === 4 * AB.frames) && !bad.length,
      {rainFrames: rainFrames, clearFrames: clearFrames, bad: bad.slice(0, 4)});
  });

  if (abRan) {
    // ── C25: percentiles of 40 known costs ───────────────────────────────────
    // Nearest rank over 40 values: p50 is the 20th, p95 the 38th, p99 and
    // max the 40th; the mean is 20.5 u (x2 in Legacy).
    run('the percentiles', function () {
      var bad = [];
      abRuns.forEach(function (r, i) {
        var m = r.mode === 'new' ? 1 : 2, c = r.stages.fxCombat3D, M = abByRun[i] ? abByRun[i].measured.length : 0;
        var want = {n: 40, p50: 20 * m * U, p95: 38 * m * U, p99: 40 * m * U, max: 40 * m * U, mean: r4(20.5 * m * U)};
        if (!(M === 40 && c && c.n === want.n && c.p50 === want.p50 && c.p95 === want.p95 && c.p99 === want.p99 && c.max === want.max && c.mean === want.mean))
          bad.push({run: i, mode: r.mode, measuredFrames: M, want: want, got: c});
      });
      check('stage p50/p95/p99/max/mean over 40 frames are the nearest-rank values of costs known by construction',
        abOk && !bad.length, {bad: bad.slice(0, 2)});
    });

    // ── C26: A/B medians, deltas and order ───────────────────────────────────
    run('the A/B arithmetic', function () {
      // Run order from the frames the harness saw: repeat 0 New then Legacy,
      // repeat 1 Legacy then New (ABBA).
      var order = abByRun.map(function (R) { return R && R.measured.length ? (R.measured[0].unified ? 'new' : 'legacy') + '#' + R.measured[0].repeat : null; });
      var g = abReport && abReport.targets.T6.ab[0], N = g && g.modes['new'], L = g && g.modes.legacy;
      // Per-run allFx p50 = 20 m u + world; p95 = 38 m u + world. Medians of
      // two repeats are their means.
      var want = {newP50: {median: 22 * U, min: 21 * U, max: 23 * U}, newP95: {median: 40 * U, min: 39 * U, max: 41 * U},
        legacyP50: {median: 45 * U, min: 44 * U, max: 46 * U}, legacyP95: {median: 81 * U, min: 80 * U, max: 82 * U},
        delta: {p50: -23 * U, p95: -41 * U}, combatDelta: {p50: -20 * U, p95: -38 * U}, flushed: {js: -0.125, flushed: -0.125, net: -0.125}};
      function spreadIs(s, w) { return s && s.n === 2 && s.median === w.median && s.min === w.min && s.max === w.max; }
      var got = g ? {deltaIs: g.deltaIs, newP50: N && N.sums.allFx.p50, newP95: N && N.sums.allFx.p95, legacyP50: L && L.sums.allFx.p50,
        legacyP95: L && L.sums.allFx.p95, delta: g.delta['sum:allFx'], combatDelta: g.delta.fxCombat3D, flushed: g.delta.flushed} : null;
      check('A/B medians over even repeats are the mean of the middle two, deltas are New minus Legacy per quantile, and runs alternate ABBA',
        abOk && JSON.stringify(order) === JSON.stringify(['new#0', 'legacy#0', 'legacy#1', 'new#1']) && got && /^new - legacy/.test(got.deltaIs) &&
        spreadIs(got.newP50, want.newP50) && spreadIs(got.newP95, want.newP95) && spreadIs(got.legacyP50, want.legacyP50) && spreadIs(got.legacyP95, want.legacyP95) &&
        got.delta && got.delta.p50 === want.delta.p50 && got.delta.p95 === want.delta.p95 &&
        got.combatDelta && got.combatDelta.p50 === want.combatDelta.p50 && got.combatDelta.p95 === want.combatDelta.p95 &&
        got.flushed && got.flushed.js === want.flushed.js && got.flushed.flushed === want.flushed.flushed && got.flushed.net === want.flushed.net,
        {order: order, want: want, got: got});
    });

    // ── C27: T6's synthetic hits and deaths ──────────────────────────────────
    // Rates on the frame clock: the first step of a run has no interval, so
    // a run of n steps spans n - 1 frames. New queues every contact (Impact
    // debris was off; the bench turns it on).
    run('the combat scene', function () {
      var rows = [], bad = [];
      abRuns.forEach(function (r, i) {
        var steps = abByRun[i] ? abByRun[i].steps.length : 0, T = (steps - 1) * LAB.FRAME_MS / 1000;
        var mine = abEvents.filter(function (e) { return e.index === i; }), hits = mine.filter(function (e) { return e.type === 'projectileContact'; });
        var deaths = mine.filter(function (e) { return e.type === 'enemyDeath'; }).length, queued = hits.filter(function (e) { return e.queued; }).length;
        var row = {run: i, mode: r.mode, seconds: r4(T), hits: hits.length, wantHits: r4(20 * T), deaths: deaths, wantDeaths: r4(3 * T), queuedHits: queued,
          reported: r.workload.events};
        rows.push(row);
        if (!(hits.length >= 10 && Math.abs(hits.length - 20 * T) < 1 && Math.abs(deaths - 3 * T) < 1 && deaths >= 1 &&
          (r.mode !== 'new' || queued === hits.length) && r.workload.events && r.workload.events.hits === hits.length && r.workload.events.deaths === deaths))
          bad.push(row);
      });
      check('T6 produces wall or floor hits at 20/s and enemy deaths at 3/s of frame time, and New queues every hit',
        abOk && rows.length === 4 && !bad.length, {bad: bad.slice(0, 2), runs: rows.length});
    });
  }

  // ── C28, C29: time-based targets ─────────────────────────────────────────
  // T9 without a flush (its reset is then at the frame clock): the governor
  // snapshot is the first frame at least 2000 ms after the reset, on the
  // harness's own clock. T10 held 250 ms of measured time.
  if (needed('the time-based targets', ['--gov-2s-frames', '--hold-frames', '--no-hold-buffer-check'])) run('the time-based targets', function () {
    stepLog = [];
    var resetBase = LAB.clock, res = startRun({target: 'T9', modes: ['new'], frames: 125, warmup: 20, repeats: 1, sizes: [[400, 270]], particles: [25],
      flush: false, allowHidden: true, smoke: true});
    pump(400, function () { return res.report || res.error; });
    var R9 = byRun(stepLog), r9 = allRuns(res.report), snap9 = r9[0] && r9[0].workload.governor.atTwoSeconds, first = null, prevBase = null;
    (R9[0] ? R9[0].steps : []).forEach(function (s) { if (first) return; if (s.base - resetBase >= 2000) first = s; else prevBase = s.base; });
    check('T9 records the governor at the first frame at least 2000 ms after its reset, with the elapsed time',
      !!res.report && r9.length === 2 && r9[0].governor === 'unpinned' && first && prevBase !== null && prevBase - resetBase < 2000 && snap9 &&
      snap9.elapsedMs === r4(first.base - resetBase) && snap9.ema === r4(first.gov.ema) && snap9.governor === r4(first.gov.governor) && first.gov.ema > 0 &&
      r9[1].governor === 'pinned' && r9[1].workload.governor.atTwoSeconds === null,
      {error: res.error && res.error.message, snapshot: snap9, want: first && {elapsedMs: r4(first.base - resetBase), ema: r4(first.gov.ema), governor: r4(first.gov.governor)},
        pinned: r9[1] && r9[1].workload.governor.atTwoSeconds});
    stepLog = [];
    var res10 = startRun({target: 'T10', modes: ['new'], holdMs: 250, frames: 3, warmup: 2, repeats: 1, sizes: [[400, 270]], particles: [25],
      allowHidden: true, smoke: true});
    pump(400, function () { return res10.report || res10.error; });
    // Measurement starts in the step that completes the warm-up (the last
    // warm-up step); each measured step is judged at its own frame time.
    var R10 = byRun(stepLog)[0] || {steps: [], measured: []}, M = R10.measured, r10 = allRuns(res10.report)[0];
    var warmSteps = R10.steps.filter(function (s) { return s.phase === 'warmup'; }), startBase = warmSteps.length ? warmSteps[warmSteps.length - 1].base : 0;
    var last = M.length ? M[M.length - 1].base - startBase : 0, before = M.length > 1 ? M[M.length - 2].base - startBase : 0;
    stepLog = [];
    // A display faster than the buffer allows (one frame per 2 ms of the
    // hold: 125 frames here) at 1000 Hz: the buffer fills after 125 ms, and
    // the run ends there, invalid.
    var frameMs = LAB.FRAME_MS, res11;
    LAB.FRAME_MS = 1;
    try {
      res11 = startRun({target: 'T10', modes: ['new'], holdMs: 250, frames: 3, warmup: 2, repeats: 1, sizes: [[400, 270]], particles: [25],
        allowHidden: true, smoke: true});
      pump(600, function () { return res11.report || res11.error; });
    } finally { LAB.FRAME_MS = frameMs; }
    var r11 = allRuns(res11.report)[0], fast = r11 ? {measured: r11.frames.measured, measuredMs: r11.frames.measuredMs, valid: r11.scene.valid, notes: r11.scene.notes} : null;
    stepLog = [];
    check('T10 holds its scene for holdMs of measured time, not a frame count, and reports the time',
      !!r10 && M.length >= 10 && last >= 250 && before < 250 && r10.frames.measured === M.length && r10.frames.holdMs === 250 &&
      r10.frames.measuredMs === r4(last) && r10.scene.valid &&
      fast && fast.measured === 125 && fast.measuredMs < 250 && fast.valid === false && fast.notes.some(function (n) { return /filled before the 250 ms hold/.test(n); }),
      {error: res10.error && res10.error.message, measuredFrames: M.length, lastMs: r4(last), previousMs: r4(before), frames: r10 && r10.frames, fast: fast});
  });

  // ── C30: a camera that moves mid-run ─────────────────────────────────────
  // Control: every run of the smoke pass kept its camera and is valid.
  if (needed('a camera that moves mid-run', ['--drift-check-off'])) run('a camera that moves mid-run', function () {
    stepLog = [];
    var res = startRun({target: 'T2', modes: ['new'], frames: 6, warmup: 2, repeats: 1, sizes: [[400, 270]], allowHidden: true, smoke: true});
    pump(4);
    var measuring = G.fxBench.status().phase === 'measure';
    G.cam.ang += 0.05;                                  // the developer touched the mouse
    pump(40, function () { return res.report || res.error; });
    stepLog = [];
    var r = allRuns(res.report)[0], invalidSmoke = runs.filter(function (x) { return !x.scene.valid; }).map(function (x) { return x.target + ' ' + x.mode; });
    check('a run whose camera turned while measuring is reported invalid, with the drift; unmoved runs stay valid',
      measuring && !!r && r.scene.valid === false && near(r.scene.drift.ang, 0.05, 1e-9) && r.scene.notes.some(function (n) { return /camera moved/.test(n); }) &&
      (!smokeRan || smokeOk && !invalidSmoke.length),
      {measuring: measuring, scene: r && r.scene, invalidSmokeRuns: invalidSmoke});
  });

  // ── C31: a menu opened, or the canvas resized, mid-run ───────────────────
  if (needed('menus and resizes mid-run', ['--no-menu-guard', '--no-size-guard'])) run('menus and resizes mid-run', function () {
    var legs = [];
    [['settingsOpen', function () { G.settingsOpen = true; }, function () { G.settingsOpen = false; }],
      ['canvas', function () { G.canvas.width = 640; G.canvas.height = 360; }, function () {}]].forEach(function (L) {
      var before = snapshot(), res = startRun({target: 'T2', frames: 50, warmup: 2, repeats: 1, sizes: [[400, 270]], allowHidden: true, smoke: true});
      pump(4);
      var measuring = G.fxBench.status().phase === 'measure';
      L[1]();
      pump(2, function () { return !G.fxBench.status().active; });
      var stopped = !G.fxBench.status().active;
      if (!stopped) G.fxBench.abort('harness cleanup');
      L[2]();
      legs.push({change: L[0], measuring: measuring, stopped: stopped, error: res.error && res.error.message, notRestored: diffs(before),
        restored: !!(res.error && res.error.report && res.error.report.restored.ok)});
    });
    check('a menu opened or the canvas resized during a run ends it with a message and restores the page',
      legs.length === 2 && legs.every(function (l) { return l.measuring && l.stopped && l.restored && !l.notRestored.length; }) &&
      /menu or panel/.test(legs[0].error) && /canvas changed from 400x270 to 640x360/.test(legs[1].error), legs);
  });

  // ── C32: a second injection while a run is active ────────────────────────
  if (needed('a second injection', ['--replace-active'])) run('a second injection', function () {
    var first = G.fxBench, res = startRun({target: 'T2', frames: 50, warmup: 2, repeats: 1, sizes: [[400, 270]], allowHidden: true, smoke: true});
    pump(2);
    var WARN = /running copy stays loaded/, warns0 = LAB.logsMatching(WARN).length;
    (0, eval)(benchSource);
    var kept = G.fxBench === first, warned = LAB.logsMatching(WARN).length === warns0 + 1;
    var res2 = startRun({target: 'T2', frames: 50, warmup: 2, repeats: 1, sizes: [[400, 270]], allowHidden: true, smoke: true});
    var refused = !!(res2.error && /already in progress/.test(res2.error.message));
    if (G.fxBench !== first && G.fxBench.status().active) G.fxBench.abort('harness cleanup');
    var aborted = first.abort('harness');
    pump(1);
    // Control: an idle copy is replaced by the next injection.
    (0, eval)(benchSource);
    var replaced = G.fxBench !== first && typeof G.fxBench.run === 'function' && !G.fxBench.status().active;
    check('injecting the bench again while a run is active keeps the running copy, which still refuses a second run and aborts',
      kept && warned && refused && aborted && !!(res.error && /aborted/.test(res.error.message)) && replaced,
      {kept: kept, warned: warned, refusedSecondRun: refused, aborted: aborted, replacedWhenIdle: replaced});
  });

  // ── C13: restoration after a failed run ──────────────────────────────────
  if (needed('a failed run', ['--no-restore'])) run('a failed run', function () {
    var before = snapshot(), err = null, armed = true;
    G.getEffectStats = function () {
      if (armed) { armed = false; throw new Error('injected getEffectStats failure'); }
      return origStats.apply(this, arguments);
    };
    var p = G.fxBench.run({target: 'T5', frames: 3, warmup: 2, repeats: 1, sizes: [[400, 270]], allowHidden: true, smoke: true,
      onError: function (e) { err = e; }});
    if (p && p.catch) p.catch(function () {});
    pump(20, function () { return err || !G.fxBench.status().active; });
    G.getEffectStats = origStats;
    var left = diffs(before);
    check('every global the bench changes is restored after a run that fails mid-way',
      !armed && err && /injected getEffectStats failure/.test(err.message) && !G.fxBench.status().active && !left.length &&
      err.report && err.report.restored.ok && err.report.complete === false,
      {error: err && err.message, notRestored: left});
  });

  // ── C17: a world reset mid-run (the developer starts the world again) ───
  // The pool and lists set aside belong to the old world: the live pool is
  // reinstated cleared and primed, the reset's fresh lists stay, and
  // everything else the bench changed is given back.
  var OWN = ['canvas.width', 'canvas.height', 'canvas.style.width', 'canvas.style.height', 'settings.particles', 'toggles', 'ctx',
    'dumpPerfBreakdown', '_perfBreakdown', 'physicsProfileEnabled', 'physicsStageSamples', '_fxRender.governor', '_fxRender.ema', '_fxRender.ring',
    '_fxRender.rasterAcc', '_fxRender.rasterMs', '_fxRender.input'];
  if (needed('a world reset mid-run', ['--restore-stale-world', '--no-live-reset'])) run('a world reset mid-run', function () {
    var liveS = G.fxState, oldAmbient = G.ambientParticles, oldDeaths = G.deathEffects, before = snapshot(), err = null, at = null;
    if (!(liveS.count > 0)) throw Error('SETUP the live pool is empty before the reset leg');
    // Judged as the run ends (onError runs right after the restore), before
    // the game's next frame advances the live pool and governor.
    var p = G.fxBench.run({target: 'T2', frames: 50, warmup: 2, repeats: 1, sizes: [[400, 270]], allowHidden: true, smoke: true,
      onError: function (e) {
        err = e;
        at = {reinstated: G.fxState === liveS, count: liveS.count, prewarm: liveS.prewarm, staleAmbient: G.ambientParticles === oldAmbient,
          staleDeaths: G.deathEffects === oldDeaths, own: diffs(before).filter(function (k) { return OWN.indexOf(k) >= 0; })};
      }});
    if (p && p.catch) p.catch(function () {});
    pump(3);
    var benchS = G.fxState, measuring = G.fxBench.status().active && benchS !== liveS;
    // LAB.startEndless drops the host's captured frame queue; a browser keeps
    // the bench's pending frame, so it is put back.
    var pending = LAB.rafQueue.filter(function (fn) { return !isLoop(fn); });
    LAB.startEndless(424242);
    LAB.rafQueue = LAB.rafQueue.concat(pending);
    G._scheduleLoop();
    pump(3, function () { return !G.fxBench.status().active; });
    check('a world reset mid-run ends the run, clears and primes the live pool, keeps the fresh lists and gives back the rest',
      measuring && err && /reset/.test(err.message) && !G.fxBench.status().active && at && at.reinstated && at.count === 0 && at.prewarm === true &&
      !at.staleAmbient && !at.staleDeaths && !at.own.length && err.report.restored.worldReset === true,
      {measuring: measuring, error: err && err.message, livePool: at && {reinstated: at.reinstated, count: at.count, prewarm: at.prewarm},
        staleAmbient: at && at.staleAmbient, staleDeaths: at && at.staleDeaths, notRestored: at && at.own});
  });

  // ── C18: a chunk crossing mid-run (the player walks during a long run) ──
  if (needed('a chunk crossing mid-run', ['--no-live-rebase', '--no-list-rebase'])) run('a chunk crossing mid-run', function () {
    pump(4);                                            // the reset world's fields fill again
    var liveS = G.fxState, ox = G.windowOriginX, oy = G.windowOriginY, n = liveS.count, world = [], err = null;
    for (var i = 0; i < n; i++) world.push([liveS.x[i] + ox, liveS.y[i] + oy]);
    var bone = {x: G.pos.x + 5, y: G.pos.y + 5, vx: 0, vy: 0, rot: 0, rotVel: 0, len: 10, spawnMs: G.gameTimeNow(), lifeMs: 1e9, color: '#cfc8b8'};
    var boneWorld = [bone.x + ox, bone.y + oy];
    G.deathEffects.push(bone);
    if (!(n > 0)) throw Error('SETUP the live pool is empty before the crossing leg');
    var p = G.fxBench.run({target: 'T2', frames: 50, warmup: 2, repeats: 1, sizes: [[400, 270]], allowHidden: true, smoke: true,
      onError: function (e) { err = e; }});
    if (p && p.catch) p.catch(function () {});
    pump(3);
    var w = LAB.worldPos();
    LAB.placeWorld(w.x + G.CHUNK_SIZE, w.y);
    var shift = [G.windowOriginX - ox, G.windowOriginY - oy];
    pump(2);
    G.fxBench.abort('harness');
    var off = 0, nx = G.windowOriginX, ny = G.windowOriginY;
    for (i = 0; i < n; i++) if (!near(liveS.x[i] + nx, world[i][0], 1e-6) || !near(liveS.y[i] + ny, world[i][1], 1e-6)) off++;
    var boneOff = [bone.x + nx - boneWorld[0], bone.y + ny - boneWorld[1]];
    G.deathEffects.splice(G.deathEffects.indexOf(bone), 1);
    check('the live pool and lists set aside during a run follow a chunk crossing that happened meanwhile',
      shift[0] === G.CHUNK_SIZE && shift[1] === 0 && G.fxState === liveS && off === 0 && near(boneOff[0], 0, 1e-6) && near(boneOff[1], 0, 1e-6) &&
      err && err.report && JSON.stringify(err.report.restored.windowShift) === JSON.stringify(shift),
      {shift: shift, live: n, offWorld: off, boneOffWorld: boneOff, reported: err && err.report && err.report.restored.windowShift});
  });

  // ── C14: stage names and the flushed stage bodies ────────────────────────
  // Each flushed stage function makes exactly the calls of its frame loop
  // stage body, once the typeof guards are resolved for this page (the
  // branch the page takes) and the G. prefix is dropped.
  run('the stage names', function () {
    var loopSource = String(G.renderFrame), names = G.fxBench.stages.concat(Object.keys(G.fxBench.stageFns));
    var absent = names.filter(function (n) { return loopSource.indexOf("_pt('" + n + "'") < 0; });
    function body(src, from) {
      var i = src.indexOf('{', from), depth = 0;
      for (var j = i; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) return src.slice(i + 1, j); }
      return '';
    }
    function calls(src) {
      var s = src.replace(/\bG\./g, '').replace(/\s+/g, ' ');
      s = s.replace(/if \(typeof (\w+) === 'function'\) ([^;]*;)(?: else ([^;]*;))?/g, function (m, fn, yes, no) { return typeof G[fn] === 'function' ? yes : (no || ''); });
      return s.match(/\b[A-Za-z_$][\w$]*\([^()]*\)/g) || [];
    }
    var drift = {};
    Object.keys(G.fxBench.stageFns).forEach(function (n) {
      var at = loopSource.indexOf("_pt('" + n + "'"), want = at < 0 ? [] : calls(body(loopSource, at)), got = calls(body(String(G.fxBench.stageFns[n]), 0));
      if (!want.length || JSON.stringify(want) !== JSON.stringify(got)) drift[n] = {loop: want, bench: got};
    });
    check('every stage the bench times or flushes is a _pt stage of the frame loop, and each flushed stage makes the calls of its loop body',
      names.length >= 7 && !absent.length && !Object.keys(drift).length, {absent: absent, drift: drift});
  });

  // ── C15: the tool's own source ───────────────────────────────────────────
  var banned = [/shadowBlur/, /presentationRandom/, /Math\s*\.\s*random/, /\blocation\s*\.\s*(reload|assign|replace|href)\b/, /\.reload\s*\(/,
    /\b(window|document|G)\s*\.\s*location\b/];
  var hits = banned.filter(function (re) { return re.test(benchSource); }).map(String);
  check('fx-bench source never blurs, reloads or navigates, and names no random stream', !hits.length, {matched: hits});

  // ── C16: leaks and errors ────────────────────────────────────────────────
  G.drawEffectLayer3D = origLayer; G.fxIntegrate = origIntegrate; G.document.createElement = origCreate; Math.random = origRandom;
  G.dumpPerfBreakdown = origDump; G.getEffectStats = origStats; G.fxEvent = origEvent; G.pointLights.splice(G.pointLights.indexOf(torch), 1);
  var globalsAfter = Object.getOwnPropertyNames(G).sort(), added = globalsAfter.filter(function (k) { return globalsBefore.indexOf(k) < 0; });
  var removed = globalsBefore.filter(function (k) { return globalsAfter.indexOf(k) < 0; }), ptErrors = 0, fails = 0, f = G.effectStats.failures;
  for (var k in G._ptErrors) ptErrors += G._ptErrors[k];
  for (k in f) fails += f[k];
  check('no global is left behind and no game or effect error was raised',
    !added.length && !removed.length && !ptErrors && !fails && !LAB.errors.length,
    {added: added, removed: removed, ptErrors: G._ptErrors, failures: f, consoleErrors: LAB.errors.slice(0, 3)});

  out('FX_BENCH_RESULT ' + (failed ? 'FAIL ' + failed + '/' + checked : 'PASS ' + checked));
}());
undefined;
