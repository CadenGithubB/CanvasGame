// fxBench: the unified effects browser measurement protocol (particle spec
// 12.2), one call per target T1-T10. Developer tooling only: this file is not
// in assets/games/manifest.json and never ships in the generated header.
//
// HOW TO USE (a separate, visible, foreground tab; never the tab holding a
// game you have positioned and care about, and never a hidden pane: hidden
// pages throttle requestAnimationFrame and pause the simulation)
//   1. From the repository root: python3 tools/game/dev.py serve --port 8083
//   2. Open http://127.0.0.1:8083/ in a NEW tab and start Endless in 3D (for
//      T8 stand 20-40 u from a wall torch, e.g. at a Cave Test mouth). Leave
//      the input idle and every menu closed. The page picks the Endless seed
//      at random and cannot be given one, so the seed is recorded, not
//      pinned: each run reports scene.seed, and scene.protocolSeed is true
//      only on 424242, the seed of the spec's reference figures. New and
//      Legacy of one report always share the page's seed.
//   3. Inject the bench from the same server, in that tab's console:
//        var s = document.createElement('script'); s.src = '/fx-bench.js'; document.head.appendChild(s);
//      Injecting it again while a run is active keeps the running copy (it
//      warns); abort that run first to load an edited bench.
//   4. Plan, then run one target (or 'all') and keep the JSON:
//        fxBench.plan({target:'T4'});            // runs, frames and minutes, nothing changed
//        fxBench.run({target:'T4', frames:600, flush:true, sizes:[[360,240],[1920,1080]], particles:[25,60]})
//          .then(function (r) { console.log(JSON.stringify(r)); });
//      fxBench.last keeps the latest report; fxBench.abort() stops a run and
//      restores the page at once; fxBench.status() says what is running.
//
// WHAT A RUN DOES. For each run of the plan (target x canvas size x Particles
// setting x governor x repeat x New/Legacy, alternated ABBA across repeats)
// it installs a fresh effect pool of its own, pinned unless the run measures
// the governor unpinned (the live pool is set aside untouched), applies the
// target's scene (weather, stress fill,
// synthetic hits and deaths, the flame beam's presentation state, facing a
// torch), lets the real game loop warm up, then reads the per-frame _pt stage
// ring (_perfStageHistory) for every measured frame, with the periodic
// dumpPerfBreakdown suppressed, the effectsSim tick samples of the physics
// profiler, and the frame's workload counters (plain numbers read from
// _fxStats and the pool; getEffectStats() runs only as a run ends, because
// it allocates). A menu or panel opened, or a canvas resized (fullscreen
// entered or left), during a run ends it. With flush:true it then times each
// target's fx stages on a scratch canvas of the same size (willReadFrequently
// false), in batches of
// flushFrames frames with one 1-pixel readback per batch, against a
// clear-only batch of the same length (the floor). JS time and flushed time
// are reported side by side; neither is summed across percentiles.
//
// WHAT IT CHANGES, AND RESTORES (try/finally, also on error and on abort):
// fxState, ambientParticles, AMBIENT_MAX, deathEffects, settings.particles,
// the fxUnified/fxWeather/fxDebris switches (through setEffectToggle, which
// bumps their generation), canvas width/height and CSS size, ctx (during a
// flush batch only), dumpPerfBreakdown, _perfBreakdown, physicsProfileEnabled,
// physicsStageSamples, dayTime, daySpeed, cam.ang and cam.pitch, the flame
// stream globals, and the governor record (_fxRender governor, ema, ring and
// its raster input rasterAcc, rasterMs, input). Every run starts the
// governor afresh: level 1, no EMA and no raster, so the pixels an earlier
// run or a flushed batch painted never reach a later run's governor.
// It never reloads or navigates, never starts a world, never touches the
// gameplay random stream (scene positions come from effectNoise) and never
// sets a blur. Every run is warm: the live game built the sprite caches
// before the bench started and runs share them (a cold figure needs a newly
// loaded tab and one run started right after Endless begins). Gameplay keeps
// running during the run: enemies that die put their bones in the bench's
// own deathEffects list.
//
// Time-based targets use real elapsed time (performance.now), not frames:
// T9's governor snapshot is taken at the first frame at least 2000 ms after
// the run's governor reset, T10 holds its scene for 30,000 ms of measured
// time; both report the elapsed ms. T10 (allocations) cannot be observed
// from a page: record DevTools Memory > Allocation sampling and a
// Performance trace during the run; the bench holds the scene and reports
// performance.memory where it exists.
var fxBench = (function (G, prev) {
  // A second injection while a run is active keeps the running copy: its
  // run is the one fxBench.abort() and fxBench.status() must reach, and a
  // second copy would start a run beside it.
  if (prev && typeof prev.status === 'function' && prev.status().active) {
    if (typeof G.console !== 'undefined' && G.console.warn) G.console.warn('fxBench: a run is active; the running copy stays loaded (fxBench.abort() it, then inject again)');
    return prev;
  }
  var VERSION = 1;
  var STAGES = ['draw()', 'coneFX3D', 'fxCombat3D', 'torchGlow3D', 'ambientFX3D', 'fxOverlay', 'fx2D'];
  // Per-frame sums of stages timed in the same frame (a percentile of the
  // sum, never a sum of percentiles).
  var SUMS = {allFx: ['fxCombat3D', 'torchGlow3D', 'ambientFX3D', 'fxOverlay'],
    t2: ['ambientFX3D', 'fxCombat3D', 'fxOverlay'], flame: ['coneFX3D', 'fxCombat3D']};
  var ALL_FX = ['fxCombat3D', 'torchGlow3D', 'ambientFX3D', 'fxOverlay'];
  // The bodies of the frame loop's fx stages (21-frame-loop.js), for the
  // flushed batches; looked up by name at call time.
  var STAGE_FNS = {
    coneFX3D: function () { G.drawConeEffects3D(); G.drawFlameStream3D(); },
    fxCombat3D: function () { G.drawEffectLayer3D(1); },
    torchGlow3D: function () { if (typeof G.drawTorchGlowStage3D === 'function') G.drawTorchGlowStage3D(); else G.drawTorchGlow3D(); },
    ambientFX3D: function () { G.drawEffectLayer3D(0); },
    fxOverlay: function () { G.drawEffectOverlay(); }
  };
  // Spec 12.1. P, sizes, governors and holdMs pin what a target defines;
  // the run options fill the rest.
  var TARGETS = {
    T1: {title: 'idle, 0 live (Endless 424242, noon)', P: [0], weather: 'clear', flush: ALL_FX,
      headline: 'effectsSim <= 0.01 ms/tick; all fx render stages (sum allFx) <= 0.02 ms/frame', legacyRef: 'ambient update 0.003 ms/tick'},
    T2: {title: 'Medium, clear', P: [25], weather: 'clear', flush: ['ambientFX3D', 'fxCombat3D', 'fxOverlay'],
      headline: 'ambientFX3D + fxCombat3D + fxOverlay (sum t2) <= 0.05 ms/frame', legacyRef: 'ambientFX3D 0.019 ms at 35 motes'},
    T3: {title: 'stress: live dots in view', stress: true, weather: 'clear', flush: ['ambientFX3D'],
      headline: 'render JS (sum allFx) <= 1.5 ms/frame; effectsSim <= 0.25 ms/tick', legacyRef: 'about 6 ms/frame with 3,000 legacy motes'},
    T4: {title: 'Medium heavy rain (600)', P: [25], weather: 'rain', flush: ['ambientFX3D'],
      headline: 'ambientFX3D JS <= 0.5 ms; flushed <= 1.0 ms/frame; effectsSim <= 0.08 ms/tick', legacyRef: 'none (Legacy has no weather)'},
    T5: {title: 'Ultra heavy rain (1,440)', P: [60], weather: 'rain', flush: ALL_FX,
      headline: 'all fx stages, flushed, <= 1.6 ms/frame', legacyRef: 'none (Legacy has no weather)'},
    T6: {title: 'combat: 20 wall hits/s + 3 deaths/s', combat: {hits: 20, deaths: 3}, weather: 'clear', flush: ['fxCombat3D'],
      headline: 'fxCombat3D <= 0.4 ms/frame', legacyRef: 'Legacy: no debris; bones 2D only'},
    T7: {title: 'flame stream held (presentation state driven, no damage or mana)', flame: true, weather: 'clear', flush: ['coneFX3D', 'fxCombat3D'],
      headline: 'flushed coneFX3D + fxCombat3D >= 0.3 ms/frame below Legacy; JS <= Legacy + 0.05 ms (sum flame)',
      legacyRef: 'JS 0.49 / 0.44 ms, flushed 1.12 / 0.99 ms (blurred legacy embers)'},
    T8: {title: 'torch glow, 20-40 u from a torch (Cave Test mouth)', torch: {near: 20, far: 40}, weather: 'clear', flush: ['torchGlow3D'],
      headline: 'torchGlow3D <= 0.7 x Legacy at 360x240; <= 1.5 ms at 1920x1080', legacyRef: '219 us windowed (9 glows)'},
    T9: {title: 'native fullscreen heavy rain, governor', sizes: [[1920, 1080]], weather: 'rain', governors: ['unpinned', 'pinned'], flush: ALL_FX,
      headline: 'unpinned: fx stage EMA <= 1.0 ms after 2 s, thinning reported; pinned <= 3 ms', legacyRef: 'none'},
    T10: {title: '30 s heavy rain: allocations', holdMs: 30000, weather: 'rain', flush: [],
      headline: 'no fx function among DevTools allocation-sampling sites after warm-up; minor GCs <= Legacy at N = 1,000',
      manual: 'Record DevTools Memory > Allocation sampling and a Performance trace (GC events) while this target runs; the page cannot ' +
        'observe allocation sites. During the measured hold the bench runs only fxBenchStep (step, guard, recordSlot), which reads numbers ' +
        'into arrays it allocated before warm-up and calls no fx function. Before warm-up it builds its own pool (createFxState); when a ' +
        'run ends it calls getEffectStats (getEffectStats, fxEngineStats, fxRenderStats and effectWeatherState allocate its result) and ' +
        'builds the report (fxBench functions). Exclude those sites, and only those.',
      legacyRef: 'none measured'}
  };
  var ORDER = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10'];
  var DEFAULTS = {target: 'all', frames: 600, warmup: 120, repeats: 5, flush: true, flushFrames: 30, flushBatches: 5,
    sizes: [[360, 240], [1920, 1080]], particles: [25, 60], modes: ['new', 'legacy'], stress: 3000, timeOfDay: 0.5,
    allowHidden: false, smoke: false, holdMs: null, onDone: null, onError: null, onProgress: null};
  var STRESS_SOURCE = {'bench.dot': {class: 'feedback', layer: 'world', trigger: {api: true},
    color: {material: 'fxMote', roles: ['dust']}, spawn: {shape: 'sphere', radius: [0, 40]}, motion: {model: 'static'},
    life: {seconds: [3600, 3600]}, render: {primitive: 'dot', size: [0.15, 0.3], alpha: [0.18, 0.3], minPx: 1, maxPx: 4},
    occlusion: 'auto', lighting: 'ambient', view2D: 'dot'}};
  // The scratch context stays on the GPU path the game's canvas uses.
  var SCRATCH_OPTS = {willReadFrequently: false};
  var _job = null, _stress = null, _last = null;

  function perfNow() { return G.performance.now(); }
  function r4(x) { return typeof x === 'number' && isFinite(x) ? Math.round(x * 1e4) / 1e4 : null; }
  function num(a, b) { return a - b; }
  function pct(a, p) { return a[Math.max(0, Math.ceil(a.length * p) - 1)]; }
  // p50/p95/p99 (nearest rank, as physicsProfileReport), mean and max of the
  // first n values.
  function summary(values, n) {
    if (!n) return {n: 0, p50: null, p95: null, p99: null, mean: null, max: null, nonzero: 0};
    var a = Array.prototype.slice.call(values, 0, n).sort(num), sum = 0, nz = 0;
    for (var i = 0; i < n; i++) { sum += a[i]; if (a[i] > 0) nz++; }
    return {n: n, p50: r4(pct(a, 0.5)), p95: r4(pct(a, 0.95)), p99: r4(pct(a, 0.99)), mean: r4(sum / n), max: r4(a[n - 1]), nonzero: nz};
  }
  function spread(list) {
    var a = list.filter(function (v) { return typeof v === 'number' && isFinite(v); }).sort(num);
    if (!a.length) return {n: 0, median: null, min: null, max: null};
    var m = a.length >> 1;
    return {n: a.length, median: r4(a.length & 1 ? a[m] : (a[m - 1] + a[m]) / 2), min: r4(a[0]), max: r4(a[a.length - 1])};
  }
  function fail(message) { var e = new Error('fxBench: ' + message); e.fxBench = true; return e; }

  // ── Options and plan ──────────────────────────────────────────────────────
  function isInt(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  function options(opts) {
    var o = {}, k;
    opts = opts || {};
    for (k in opts) if (!DEFAULTS.hasOwnProperty(k)) throw fail('unknown option ' + k + ' (options: ' + Object.keys(DEFAULTS).join(', ') + ')');
    for (k in DEFAULTS) o[k] = Object.prototype.hasOwnProperty.call(opts, k) ? opts[k] : DEFAULTS[k];
    if (o.target !== 'all' && !TARGETS.hasOwnProperty(o.target)) throw fail('target must be one of ' + ORDER.join(', ') + " or 'all'");
    if (!isInt(o.frames, 1, 100000)) throw fail('frames must be an integer 1..100000');
    if (!isInt(o.warmup, 0, 10000)) throw fail('warmup must be an integer 0..10000');
    if (!isInt(o.repeats, 1, 50)) throw fail('repeats must be an integer 1..50');
    if (!isInt(o.flushFrames, 1, 1000) || !isInt(o.flushBatches, 1, 100)) throw fail('flushFrames 1..1000 and flushBatches 1..100 must be integers');
    if (!isInt(o.stress, 1, 3072)) throw fail('stress must be an integer 1..3072 (the pool capacity)');
    if (o.holdMs !== null && !isInt(o.holdMs, 1, 600000)) throw fail("holdMs must be null (each target's own) or an integer 1..600000");
    if (!Array.isArray(o.sizes) || !o.sizes.length || !o.sizes.every(function (s) { return Array.isArray(s) && s.length === 2 && isInt(s[0], 16, 8192) && isInt(s[1], 16, 8192); }))
      throw fail('sizes must be a nonempty list of [width, height] integer pairs (16..8192)');
    if (!Array.isArray(o.particles) || !o.particles.length || !o.particles.every(function (p) { return isInt(p, 0, 60); }))
      throw fail('particles must be a nonempty list of Particles settings 0..60');
    if (!Array.isArray(o.modes) || !o.modes.length || !o.modes.every(function (m) { return m === 'new' || m === 'legacy'; }))
      throw fail("modes must be a nonempty list of 'new' and 'legacy'");
    if (o.timeOfDay !== null && !(typeof o.timeOfDay === 'number' && o.timeOfDay >= 0 && o.timeOfDay <= 1)) throw fail('timeOfDay must be 0..1 or null (leave the day cycle alone)');
    ['flush', 'allowHidden', 'smoke'].forEach(function (b) { if (typeof o[b] !== 'boolean') throw fail(b + ' must be true or false'); });
    return o;
  }
  // A smoke run (tooling checks) lets the options override a target's pinned
  // sizes and hold; its report says it is not a measurement.
  // In native fullscreen every run uses the page's own canvas size.
  // A held target (T10) measures until holdMs of time have passed; its
  // buffers hold one frame per 2 ms of the hold (a 500 Hz display), at least
  // frames.
  function plan(o, nativeSize) {
    var ids = o.target === 'all' ? ORDER : [o.target], cells = [];
    ids.forEach(function (id) {
      var T = TARGETS[id], sizes = nativeSize ? [nativeSize] : !o.smoke && T.sizes ? T.sizes : o.sizes, Ps = T.P || o.particles;
      var hold = !T.holdMs ? 0 : o.holdMs !== null ? o.holdMs : o.smoke ? 0 : T.holdMs;
      var govs = T.governors || ['pinned'], frames = hold ? Math.max(o.frames, Math.ceil(hold / 2)) : o.frames;
      sizes.forEach(function (size) {
        Ps.forEach(function (P) {
          govs.forEach(function (gov) {
            for (var r = 0; r < o.repeats; r++) {
              var modes = r & 1 ? o.modes.slice().reverse() : o.modes;     // ABBA across repeats
              modes.forEach(function (mode) {
                cells.push({target: id, size: [size[0], size[1]], P: P, governor: gov, mode: mode, repeat: r, frames: frames, holdMs: hold});
              });
            }
          });
        });
      });
    });
    return cells;
  }
  function nativeSize() {
    var cv = G.canvas;
    return cv && fullscreenElement() === cv ? [cv.width, cv.height] : null;
  }
  function publicPlan(opts) {
    var o = options(opts), cells = plan(o, nativeSize()), frames = 0;
    cells.forEach(function (c) { frames += o.warmup + (c.holdMs ? Math.ceil(c.holdMs * 0.06) : c.frames); });
    return {runs: cells.length, frames: frames, estimatedMinutesAt60Hz: r4(frames / 3600),
      cells: cells.map(function (c) { return c.target + ' ' + c.size[0] + 'x' + c.size[1] + ' P' + c.P + ' ' + c.governor + ' ' + c.mode + ' #' + c.repeat + (c.holdMs ? ' hold ' + c.holdMs + ' ms' : ''); })};
  }

  // ── Environment ───────────────────────────────────────────────────────────
  function timerResolution() {
    var d = [], last = perfNow(), t, guard = 0;
    while (d.length < 32 && guard++ < 1000000) { t = perfNow(); if (t !== last) { if (t > last) d.push(t - last); last = t; } }
    var s = spread(d);
    return {samples: d.length, minMs: d.length ? r4(Math.min.apply(null, d)) : null, medianMs: s.median};
  }
  function fullscreenElement() {
    var doc = G.document;
    return doc && (doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement) || null;
  }
  function env() {
    var nav = typeof navigator !== 'undefined' ? navigator : null, doc = G.document, cv = G.canvas, rect = null;
    try { rect = cv && cv.getBoundingClientRect ? cv.getBoundingClientRect() : null; } catch (e) { rect = null; }
    return {
      userAgent: nav && nav.userAgent || null, hardwareConcurrency: nav && nav.hardwareConcurrency || null,
      devicePixelRatio: G.devicePixelRatio || 1,
      canvas: {width: cv ? cv.width : null, height: cv ? cv.height : null, cssWidth: rect ? r4(rect.width) : null, cssHeight: rect ? r4(rect.height) : null},
      nativeFullscreen: !!cv && fullscreenElement() === cv,
      visibilityState: doc && typeof doc.visibilityState === 'string' ? doc.visibilityState : null,
      hidden: doc ? doc.hidden === true : null,
      timerResolution: timerResolution(),
      crossOriginIsolated: typeof crossOriginIsolated === 'boolean' ? crossOriginIsolated : null,
      game: {seed: typeof G.WORLD_SEED === 'number' ? G.WORLD_SEED : null, endless: !!G.ENDLESS_MODE, caveTest: !!G.CAVE_TEST_MODE,
        mode3D: !!G.MODE3D, camFollow: !!G.CAM_FOLLOW, particles: G.settings ? G.settings.particles : null,
        toggles: typeof G.effectTogglesSnapshot === 'function' ? G.effectTogglesSnapshot() : null,
        // The render preset and switches (3D integration): model and texture
        // passes change what particles are depth-tested against, so reports
        // taken under different switches must be told apart.
        render: typeof G.renderFeatureSnapshot === 'function' ? {preset: G.renderPresetName(), features: G.renderFeatureSnapshot()} : null,
        // Each migrated effect family's mode, as the cave profile's
        // canonicalInputs records it: a console setEffectFamilyMode override
        // sets a family apart from every switch, and the A/B flips only
        // Unified effects, so it holds through every New run.
        effectFamilies: effectFamilies()}
    };
  }
  function effectFamilies() {
    if (typeof G.effectFamilyMode !== 'function' || !G.EFFECT_FAMILY_MIGRATED) return null;
    var out = {};
    Object.keys(G.EFFECT_FAMILY_MIGRATED).forEach(function (f) { out[f] = G.effectFamilyMode(f); });
    return out;
  }

  // ── Touched state: saved once before its first change, restored in reverse ─
  function touchGlobal(job, name, flags) {
    var key = 'g:' + name;
    if (job.touched[key]) return;
    job.touched[key] = 1;
    job.touch.push({kind: 'global', label: name, name: name, had: name in G, value: G[name], world: !!(flags && flags.world),
      rebase: !!(flags && flags.rebase)});
  }
  function touchProp(job, obj, key, label) {
    if (!obj || job.touched['p:' + label]) return;
    job.touched['p:' + label] = 1;
    job.touch.push({kind: 'prop', label: label, obj: obj, key: key, had: key in obj, value: obj[key]});
  }
  function touchToggle(job, key) {
    if (job.touched['t:' + key]) return;
    job.touched['t:' + key] = 1;
    job.touch.push({kind: 'toggle', label: 'toggle ' + key, key: key, value: G.effectToggleValue(key)});
  }
  function setToggle(job, key, value) {
    touchToggle(job, key);
    if (G.effectToggleValue(key) !== value) G.setEffectToggle(key, value);
  }
  function restoreAll(job) {
    var errors = [], L = job.touch, worldReset = job.worldReset, sx = job.shiftX, sy = job.shiftY, live = null;
    for (var i = L.length - 1; i >= 0; i--) {
      var t = L[i];
      try {
        if (t.kind === 'toggle') { if (G.effectToggleValue(t.key) !== t.value) G.setEffectToggle(t.key, t.value); }
        else if (t.kind === 'prop') { if (t.had) t.obj[t.key] = t.value; else delete t.obj[t.key]; }
        else if (t.world && worldReset) continue;                    // the reset's fresh list stays
        else {
          if (t.rebase && (sx || sy) && Array.isArray(t.value))        // a window shift the list missed
            t.value.forEach(function (rec) { if (rec) { rec.x -= sx; rec.y -= sy; } });
          G[t.name] = t.value;
          if (t.name === 'fxState') live = t.value;
        }
      } catch (e) { errors.push(t.label + ': ' + (e && e.message)); }
    }
    try {
      // The live pool sat out the run: it follows a window shift or a world
      // reset that happened meanwhile.
      if (live && (sx || sy) && !worldReset) G.fxRebase(sx, sy, live);
      if (live && worldReset) { G.fxReset('world', live); G.effectRegistryPrime('world'); }
    } catch (e) { errors.push('live pool: ' + (e && e.message)); }
    return {ok: !errors.length, items: L.map(function (t) { return t.label; }), errors: errors,
      windowShift: sx || sy ? [sx, sy] : null, worldReset: !!worldReset};
  }

  // ── Scene helpers (window-local units; no gameplay stream) ────────────────
  function feetZ() { return typeof G.playerFeetSpatialZ === 'function' ? G.playerFeetSpatialZ() : 0; }
  function groundZ(x, y, feet) {
    var z = typeof G.sampleSpatialSupportZ === 'function' ? G.sampleSpatialSupportZ(x, y, feet, !!G.playerUnderground) : NaN;
    return isFinite(z) ? z : feet;
  }
  function wallCell(gx, gy) { return gx >= 0 && gy >= 0 && gx < G.gridW && gy < G.gridH && G.grid && G.grid[gy * G.gridW + gx]; }
  // The first wall cell on the view axis within maxD (the flame's own wall
  // stop, 10-combat.js castStreamAttack, restated for the presentation drive).
  function wallAhead(maxD) {
    var c = Math.cos(G.cam.ang), s = Math.sin(G.cam.ang), cell = G.cell, step = cell * 0.5;
    for (var d = step; d < maxD; d += step) {
      var x = G.cam.x + c * d, y = G.cam.y + s * d, gx = Math.floor(x / cell), gy = Math.floor(y / cell);
      if (wallCell(gx, gy)) return {d: d, gx: gx, gy: gy, span: typeof G.spatialWallSpan === 'function' ? G.spatialWallSpan(gx, gy) : null};
    }
    return null;
  }
  function nearestTorch() {
    var L = G.pointLights || [], best = null, bd = Infinity;
    for (var i = 0; i < L.length; i++) {
      var l = L[i];
      if (!l || l.kind !== 'torch') continue;
      var d = Math.hypot(l.x - G.cam.x, l.y - G.cam.y);
      if (d < bd) { bd = d; best = l; }
    }
    return best ? {light: best, d: bd} : null;
  }
  function stressTable() {
    if (!_stress) _stress = G.compileFxRecipes(STRESS_SOURCE, G.FX_MATERIALS, {});
    return _stress;
  }
  // T3: the stress count as 100 deterministic bursts over the view, 40-184 u
  // ahead; the spawn cap admits 384 a tick, so the warm-up fills the pool.
  function stressFill(o) {
    var q = G.effectQuality(G.fxState.cap, G.fxState.reserve), per = o.stress / 100, c = Math.cos(G.cam.ang), s = Math.sin(G.cam.ang), feet = feetZ();
    for (var i = 0; i < 100; i++) {
      var d = 40 + (i % 10) * 16, lat = (Math.floor(i / 10) - 4.5) * d * 0.09, x = G.cam.x + c * d - s * lat, y = G.cam.y + s * d + c * lat;
      var n = Math.floor(per * (i + 1)) - Math.floor(per * i);
      G.fxEmit('bench.dot', x, y, groundZ(x, y, feet) + 8 + 20 * G.effectNoise(i, 7), {count: n, scale: 1 / q.scale[4]});
    }
  }
  // T6: synthetic producers at their real call sites' contracts: projectile
  // contacts on the wall ahead (the floor 60 u ahead when there is none) and
  // enemy deaths 50-90 u ahead, at the requested rates.
  function combatFrame(job, T, dt) {
    var sc = job.scene, c = Math.cos(G.cam.ang), s = Math.sin(G.cam.ang), feet = feetZ(), under = !!G.playerUnderground;
    sc.hitAcc += T.combat.hits * dt; sc.deathAcc += T.combat.deaths * dt;
    for (; sc.hitAcc >= 1; sc.hitAcc--) {
      var k = sc.hits++, lat = (G.effectNoise(k, 11) - 0.5), p = {ang: G.cam.ang, speed: 300, r: 8, underground: under}, x, y, z, contact;
      if (sc.wall) {
        var w = sc.wall, lo = w.span ? w.span.baseZ : feet, hi = w.span ? Math.min(w.span.topZ, lo + 60) : feet + 60;
        x = G.cam.x + c * w.d - s * lat * G.cell * 0.8; y = G.cam.y + s * w.d + c * lat * G.cell * 0.8;
        z = lo + 5 + G.effectNoise(k, 12) * Math.max(0, hi - lo - 10); contact = {kind: 'wall', gx: w.gx, gy: w.gy};
      } else {
        x = G.cam.x + c * 60 - s * lat * 40; y = G.cam.y + s * 60 + c * lat * 40; z = groundZ(x, y, feet) + p.r; contact = {kind: 'floor'};
      }
      p.x = x; p.y = y;
      G.fxEvent('projectileContact', p, contact, x, y, z);
    }
    for (; sc.deathAcc >= 1; sc.deathAcc--) {
      var j = sc.deaths++, d = 50 + 40 * G.effectNoise(j, 13), l2 = (G.effectNoise(j, 14) - 0.5) * 40;
      var ex = G.cam.x + c * d - s * l2, ey = G.cam.y + s * d + c * l2;
      G.fxEvent('enemyDeath', {x: ex, y: ey, feetZ: groundZ(ex, ey, feet), enemyType: {size: 1}, underground: under, health: 0});
    }
  }
  // T7: the beam's presentation state as a held stream keeps it (the
  // globals drawFlameStream3D and the flameStream anchor read); no cast, so
  // no damage and no mana.
  function flameFrame(job) {
    var now = G.gameTimeNow(), fire = G.spells && G.spells.fire || {}, range = fire.tier >= 2 ? 180 : fire.streamRange || 160, w = wallAhead(range);
    G.flameStreamActive = true; G.flameStreamLastTick = now; G.flameStreamAng = G.cam.ang;
    G.flameStreamRange = w ? w.d : range;
    if (!job.scene.flameStart) job.scene.flameStart = G.flameStreamStartMs = now;
  }

  // ── A run: setup, warm-up, measurement, flushed batches ───────────────────
  function setupRun(job, cell) {
    var o = job.o, T = TARGETS[cell.target], legacy = cell.mode === 'legacy', stress = !!T.stress && !legacy, cv = G.canvas;
    job.scene = {valid: true, notes: [], hitAcc: 0, deathAcc: 0, hits: 0, deaths: 0, flameStart: 0, wall: null};
    if (!job.native) {
      touchProp(job, cv, 'width', 'canvas.width'); touchProp(job, cv, 'height', 'canvas.height');
      touchProp(job, cv.style, 'width', 'canvas.style.width'); touchProp(job, cv.style, 'height', 'canvas.style.height');
      if (cv.width !== cell.size[0] || cv.height !== cell.size[1]) { cv.width = cell.size[0]; cv.height = cell.size[1]; }
      cv.style.width = '100%'; cv.style.height = 'auto';
    }
    touchProp(job, G.settings, 'particles', 'settings.particles'); G.settings.particles = cell.P;
    // Legacy's count is AMBIENT_MAX (Apply copies the setting into it); the
    // Legacy stress reference is that many legacy motes.
    touchGlobal(job, 'AMBIENT_MAX'); G.AMBIENT_MAX = T.stress && legacy ? o.stress : cell.P;
    setToggle(job, 'fxUnified', !legacy);
    if (T.weather === 'rain' && G.effectToggleValue('fxWeather') === 'off') setToggle(job, 'fxWeather', 'auto');
    if (T.combat && G.effectToggleValue('fxDebris') !== true) setToggle(job, 'fxDebris', true);
    if (o.timeOfDay !== null) { touchGlobal(job, 'dayTime'); touchGlobal(job, 'daySpeed'); G.dayTime = o.timeOfDay; G.daySpeed = 0; }
    touchProp(job, G.cam, 'ang', 'cam.ang'); touchProp(job, G.cam, 'pitch', 'cam.pitch');
    if (T.torch) {
      var t = nearestTorch();
      if (!t) { job.scene.valid = false; job.scene.notes.push('no torch light in the window: stand 20-40 u from a wall torch (a Cave Test mouth)'); }
      else {
        G.cam.ang = Math.atan2(t.light.y - G.cam.y, t.light.x - G.cam.x); G.cam.pitch = 0;
        job.scene.torchDistance = r4(t.d);
        if (t.d < T.torch.near || t.d > T.torch.far) { job.scene.valid = false; job.scene.notes.push('nearest torch is ' + r4(t.d) + ' u away, outside 20-40 u'); }
      }
    }
    // A fresh pool of the bench's own; the live one is set aside untouched.
    touchGlobal(job, 'fxState');
    G.fxState = G.createFxState(G.EFFECT_CONFIG.capacity, (G.WORLD_SEED | 0) ^ 0x6a09e667,
      {pinned: cell.governor !== 'unpinned', reserve: stress ? 0 : G.EFFECT_CONFIG.reserve, compiled: stress ? stressTable() : G.FX_COMPILED});
    G.effectWeatherForce(T.weather === 'rain' ? 'rain' : 'clear', 1);
    touchGlobal(job, 'ambientParticles', {world: true});
    G.ambientParticles = [];
    if (legacy && typeof G.initAmbientParticles === 'function') G.effectWithLegacyRandom(G.initAmbientParticles);
    touchGlobal(job, 'deathEffects', {world: true, rebase: true}); G.deathEffects = [];
    // The governor starts afresh, raster input included: an unpinned pass
    // (a flushed batch too) adds its painted pixels to rasterAcc, which the
    // next governor step turns into input.
    var GR = G._fxRender;
    touchProp(job, GR, 'governor', '_fxRender.governor'); touchProp(job, GR, 'ema', '_fxRender.ema'); touchProp(job, GR, 'ring', '_fxRender.ring');
    touchProp(job, GR, 'rasterAcc', '_fxRender.rasterAcc'); touchProp(job, GR, 'rasterMs', '_fxRender.rasterMs'); touchProp(job, GR, 'input', '_fxRender.input');
    GR.governor = 1; GR.ema = 0; GR.ring = -1; GR.rasterAcc = 0; GR.rasterMs = 0; GR.input = 0;
    job.govReset = perfNow();
    if (T.flame) {
      ['flameStreamActive', 'flameStreamLastTick', 'flameStreamStartMs', 'flameStreamAng', 'flameStreamRange'].forEach(function (n) { touchGlobal(job, n); });
      flameFrame(job);
    }
    if (T.combat) {
      job.scene.wall = wallAhead(150);
      job.scene.contactKind = job.scene.wall ? 'wall' : 'floor';
      if (!job.scene.wall) job.scene.notes.push('no wall within 150 u ahead: projectile contacts hit the floor 60 u ahead');
    }
    if (stress) stressFill(o);                                  // New only: Legacy has its motes
    // The page picks the seed; it is recorded, not pinned (T8 has no protocol seed).
    job.scene.seed = G.WORLD_SEED;
    job.scene.protocolSeed = cell.target === 'T8' ? null : G.WORLD_SEED === 424242;
    if (job.scene.protocolSeed === false) job.scene.notes.push('world seed ' + G.WORLD_SEED + ', not the protocol seed 424242: compare with the spec figures with care');
    job.phase = 'warmup'; job.warm = 0; job.m = 0; job.cad = 0; job.statsN = 0; job.stall = 0; job.lost = 0;
    job.lastRing = G._perfRingIdx; job.lastTs = null;
    job.agg = {considered: 0, drawn: 0, thinned: 0, offscreen: 0, subpixel: 0, glowDraws: 0, maskPx: 0, torchDrawn: 0, live: 0};
    job.gov = {atTwoSeconds: null}; job.measureAt = 0;
    var n = cell.frames;
    if (!job.buf || job.buf.n < n) {
      job.buf = {n: n, stages: {}, sums: {}, frame: new Float64Array(n), cadence: new Float64Array(n + 64)};
      STAGES.forEach(function (s) { job.buf.stages[s] = new Float64Array(n); });
      Object.keys(SUMS).forEach(function (s) { job.buf.sums[s] = new Float64Array(n); });
    }
    job.seen = {};
  }
  // No getEffectStats here or while measuring: it allocates its result in fx
  // functions (T10 would see them). Plain reads only.
  function startMeasure(job, cell, now) {
    touchGlobal(job, 'physicsStageSamples'); touchGlobal(job, 'physicsProfileEnabled'); touchGlobal(job, '_perfBreakdown');
    G.physicsStageSamples = {}; G.physicsProfileEnabled = true; G._perfBreakdown = {};
    job.phase = 'measure'; job.measureAt = now;
    var live = G.fxState.count;
    job.start = {live: live, pt: copy(G._ptErrors), failures: copy(G.effectStats.failures),
      cam: {x: G.cam.x, y: G.cam.y, ang: G.cam.ang, pitch: G.cam.pitch || 0, ox: G.windowOriginX || 0, oy: G.windowOriginY || 0},
      memory: G.performance && G.performance.memory ? G.performance.memory.usedJSHeapSize : null, dropped: G.simulationTiming ? G.simulationTiming.droppedMs : null};
    if (TARGETS[cell.target].stress && cell.mode === 'new' && live < job.o.stress) {
      job.scene.notes.push('only ' + live + ' of ' + job.o.stress + ' stress dots live when measuring began (lengthen warmup)');
      job.scene.valid = false;
    }
  }
  function copy(o) { var out = {}; for (var k in o) out[k] = o[k]; return out; }
  // One completed game frame (its ring slot). The workload counters describe
  // the latest frame only (beginEffectFrame zeroes _fxStats), so they are
  // read for the slot of the current ring index.
  function recordSlot(job, cell, slot) {
    var H = G._perfStageHistory, b = job.buf, m = job.m;
    for (var i = 0; i < STAGES.length; i++) {
      var h = H[STAGES[i]];
      if (h) { b.stages[STAGES[i]][m] = h[slot]; job.seen[STAGES[i]] = 1; } else b.stages[STAGES[i]][m] = 0;
    }
    for (var s in SUMS) {
      var L = SUMS[s], v = 0;
      for (var j = 0; j < L.length; j++) { var hs = H[L[j]]; if (hs) v += hs[slot]; }
      b.sums[s][m] = v;
    }
    b.frame[m] = G._perfFrameTotals ? G._perfFrameTotals[slot] : 0;
    job.m = m + 1;
    if (slot === G._perfRingIdx) {
      var fr = G._fxStats, a = job.agg;
      a.considered += fr.considered; a.drawn += fr.drawn; a.thinned += fr.thinned; a.offscreen += fr.offscreen;
      a.subpixel += fr.subpixel; a.glowDraws += fr.glowDraws; a.maskPx += fr.maskPx; a.torchDrawn += fr.torchDrawn;
      a.live += G.fxState.count; job.statsN++;
    }
  }
  function frameHooks(job, cell, ts) {
    var T = TARGETS[cell.target], dt = job.lastTs === null ? 0 : Math.max(0, Math.min(0.1, (ts - job.lastTs) / 1000));
    if (T.flame) flameFrame(job);
    if (T.combat) combatFrame(job, T, dt);
  }
  function scratch(job, w, h) {
    var key = w + 'x' + h, sc = job.scratch[key];
    if (!sc) {
      var c = G.document.createElement('canvas');
      c.width = w; c.height = h;
      sc = job.scratch[key] = {canvas: c, ctx: c.getContext('2d', SCRATCH_OPTS)};
    }
    return sc;
  }
  // n frames of the stages (or of the clear alone), then one 1-pixel readback.
  function batch(c, w, h, n, fns) {
    var t0 = perfNow();
    for (var f = 0; f < n; f++) {
      c.clearRect(0, 0, w, h);
      if (!fns) continue;
      if (typeof G.beginSpellVisualFrame === 'function') G.beginSpellVisualFrame();
      G.beginEffectFrame();
      for (var i = 0; i < fns.length; i++) fns[i]();
    }
    var t1 = perfNow();
    c.getImageData(0, 0, 1, 1);
    var t2 = perfNow();
    return {js: (t1 - t0) / n, flushed: (t2 - t0) / n};
  }
  function flushed(job, cell) {
    var T = TARGETS[cell.target], o = job.o;
    if (!o.flush || !T.flush.length) return null;
    var w = G.canvas.width, h = G.canvas.height, sc = scratch(job, w, h), fns = T.flush.map(function (s) { return STAGE_FNS[s]; });
    var floor = [], js = [], fl = [], net = [];
    touchGlobal(job, 'ctx');
    var saved = G.ctx;
    G.ctx = sc.ctx;
    try {
      for (var b = 0; b < o.flushBatches; b++) {
        var f0 = batch(sc.ctx, w, h, o.flushFrames, null), f1 = batch(sc.ctx, w, h, o.flushFrames, fns);
        floor.push(f0.flushed); js.push(f1.js); fl.push(f1.flushed); net.push(f1.flushed - f0.flushed);
      }
    } finally { G.ctx = saved; }
    return {stages: T.flush.slice(), width: w, height: h, framesPerBatch: o.flushFrames, batches: o.flushBatches, readbacksPerBatch: 1,
      willReadFrequently: SCRATCH_OPTS.willReadFrequently, jsMsPerFrame: spread(js), flushedMsPerFrame: spread(fl), floorMsPerFrame: spread(floor), netFlushedMsPerFrame: spread(net)};
  }
  function endRun(job, cell, now) {
    var T = TARGETS[cell.target], b = job.buf, n = job.m, st = G.getEffectStats(), s0 = job.start, stages = {}, sums = {};
    STAGES.forEach(function (s) {
      if (!job.seen[s]) return;
      stages[s] = summary(b.stages[s], n);
      var bd = G._perfBreakdown && G._perfBreakdown[s];
      stages[s].breakdownMean = bd && bd.count ? r4(bd.total / bd.count) : null;
    });
    Object.keys(SUMS).forEach(function (s) { sums[s] = summary(b.sums[s], n); });
    var sim = G.physicsStageSamples && G.physicsStageSamples.effectsSim;
    var cad = summary(b.cadence, job.cad), dropped = 0;
    for (var i = 0; i < job.cad; i++) if (cad.p50 && b.cadence[i] > 1.5 * cad.p50) dropped++;
    cad.dropped = dropped; cad.fps = cad.mean ? r4(1000 / cad.mean) : null;
    var pt = {}, fx = {};
    for (var k in G._ptErrors) if (G._ptErrors[k] - (s0.pt[k] || 0)) pt[k] = G._ptErrors[k] - (s0.pt[k] || 0);
    for (k in st.failures) if (st.failures[k] - (s0.failures[k] || 0)) fx[k] = st.failures[k] - (s0.failures[k] || 0);
    var a = job.agg, sn = job.statsN || 1;
    var cam0 = s0.cam, shifted = (G.windowOriginX || 0) !== cam0.ox || (G.windowOriginY || 0) !== cam0.oy;
    var drift = {x: r4(G.cam.x + (G.windowOriginX || 0) - cam0.x - cam0.ox), y: r4(G.cam.y + (G.windowOriginY || 0) - cam0.y - cam0.oy),
      ang: r4(G.cam.ang - cam0.ang), pitch: r4((G.cam.pitch || 0) - cam0.pitch), chunkShift: shifted};
    if (Math.hypot(drift.x, drift.y) > 1 || Math.abs(drift.ang) > 1e-3) { job.scene.valid = false; job.scene.notes.push('the camera moved during the run (leave the input idle)'); }
    if (cell.governor === 'unpinned' && !job.gov.atTwoSeconds) job.scene.notes.push('the run ended less than 2000 ms after its governor reset: no atTwoSeconds snapshot');
    var run = {target: cell.target, size: cell.size.slice(), P: cell.P, mode: cell.mode, governor: cell.governor, repeat: cell.repeat,
      frames: {requested: cell.holdMs ? null : cell.frames, measured: n, warmup: job.o.warmup, lost: job.lost, holdMs: cell.holdMs || null,
        measuredMs: r4(now - job.measureAt)},
      stages: stages, sums: sums,
      effectsSim: sim ? summary(sim.values, Math.min(sim.count, sim.values.length)) : summary(null, 0),
      cadence: cad, frameJs: summary(b.frame, n), flushed: flushed(job, cell),
      workload: {liveAtStart: s0.live, live: st.live, legacyMotes: G.ambientParticles ? G.ambientParticles.length : null, budget: st.budget, byClass: st.byClass, weather: st.weather,
        meanPerFrame: {live: r4(a.live / sn), considered: r4(a.considered / sn), drawn: r4(a.drawn / sn), thinned: r4(a.thinned / sn),
          offscreen: r4(a.offscreen / sn), subpixel: r4(a.subpixel / sn), glowDraws: r4(a.glowDraws / sn), maskPx: r4(a.maskPx / sn),
          torchDrawn: r4(a.torchDrawn / sn)}, sampledFrames: job.statsN,
        governor: {pinned: cell.governor !== 'unpinned', atTwoSeconds: job.gov.atTwoSeconds, end: {ema: r4(G._fxRender.ema), governor: r4(G._fxRender.governor)}},
        events: T.combat ? {hits: job.scene.hits, deaths: job.scene.deaths} : null,
        memoryDeltaBytes: s0.memory !== null && G.performance.memory ? G.performance.memory.usedJSHeapSize - s0.memory : null,
        droppedSimMs: s0.dropped !== null ? r4(G.simulationTiming.droppedMs - s0.dropped) : null},
      scene: {valid: job.scene.valid, notes: job.scene.notes.slice(), seed: job.scene.seed, protocolSeed: job.scene.protocolSeed,
        torchDistance: job.scene.torchDistance === undefined ? null : job.scene.torchDistance,
        contactKind: job.scene.contactKind || null, drift: drift},
      errors: {pt: pt, effects: fx}};
    if (T.manual) run.manual = T.manual;
    job.runs.push(run);
    if (typeof job.o.onProgress === 'function') try { job.o.onProgress({done: job.runs.length, of: job.cells.length, run: run}); } catch (e) { /* the caller's */ }
  }
  function abSummary(runs) {
    var groups = {}, order = [];
    runs.forEach(function (r) {
      var key = r.target + '|' + r.size.join('x') + '|' + r.P + '|' + r.governor;
      if (!groups[key]) { groups[key] = {target: r.target, size: r.size, P: r.P, governor: r.governor, runs: {}}; order.push(key); }
      (groups[key].runs[r.mode] = groups[key].runs[r.mode] || []).push(r);
    });
    return order.map(function (key) {
      var g = groups[key], out = {target: g.target, size: g.size, P: g.P, governor: g.governor, modes: {}, deltaIs: 'new - legacy (of the medians over repeats)', delta: {}};
      Object.keys(g.runs).forEach(function (mode) {
        var L = g.runs[mode], m = {repeats: L.length, stages: {}, sums: {}, effectsSim: {}, flushed: null};
        function metrics(get) { var o = {}; ['p50', 'p95', 'mean'].forEach(function (q) { o[q] = spread(L.map(function (r) { var x = get(r); return x ? x[q] : null; })); }); return o; }
        STAGES.forEach(function (s) { if (L.some(function (r) { return r.stages[s]; })) m.stages[s] = metrics(function (r) { return r.stages[s]; }); });
        Object.keys(SUMS).forEach(function (s) { m.sums[s] = metrics(function (r) { return r.sums[s]; }); });
        m.effectsSim = metrics(function (r) { return r.effectsSim; });
        if (L.some(function (r) { return r.flushed; }))
          m.flushed = {js: spread(L.map(function (r) { return r.flushed && r.flushed.jsMsPerFrame.median; })),
            flushed: spread(L.map(function (r) { return r.flushed && r.flushed.flushedMsPerFrame.median; })),
            net: spread(L.map(function (r) { return r.flushed && r.flushed.netFlushedMsPerFrame.median; }))};
        out.modes[mode] = m;
      });
      var N = out.modes['new'], O = out.modes.legacy;
      if (N && O) {
        var d = function (a, b) { return a && b && a.median !== null && b.median !== null ? r4(a.median - b.median) : null; };
        Object.keys(N.sums).forEach(function (s) { out.delta['sum:' + s] = {p50: d(N.sums[s].p50, O.sums[s].p50), p95: d(N.sums[s].p95, O.sums[s].p95), mean: d(N.sums[s].mean, O.sums[s].mean)}; });
        Object.keys(N.stages).forEach(function (s) { if (O.stages[s]) out.delta[s] = {p50: d(N.stages[s].p50, O.stages[s].p50), p95: d(N.stages[s].p95, O.stages[s].p95), mean: d(N.stages[s].mean, O.stages[s].mean)}; });
        out.delta.effectsSim = {p50: d(N.effectsSim.p50, O.effectsSim.p50), p95: d(N.effectsSim.p95, O.effectsSim.p95), mean: d(N.effectsSim.mean, O.effectsSim.mean)};
        if (N.flushed && O.flushed) out.delta.flushed = {js: d(N.flushed.js, O.flushed.js), flushed: d(N.flushed.flushed, O.flushed.flushed), net: d(N.flushed.net, O.flushed.net)};
      }
      return out;
    });
  }
  function report(job, err) {
    var targets = {};
    job.ids.forEach(function (id) {
      var T = TARGETS[id], runs = job.runs.filter(function (r) { return r.target === id; });
      targets[id] = {id: id, title: T.title, headline: T.headline, legacyReference: T.legacyRef, flushStages: T.flush.slice(),
        pinned: {particles: T.P || null, sizes: !job.o.smoke && T.sizes || null, holdMs: !job.o.smoke && T.holdMs || null, governors: T.governors || null},
        manual: T.manual || null, runs: runs, ab: abSummary(runs)};
    });
    var o = job.o;
    return {tool: 'fxBench', version: VERSION, ok: !err, complete: !err && job.runs.length === job.cells.length,
      error: err ? String(err.message || err) : null, smoke: o.smoke,
      note: o.smoke ? 'smoke run: a tooling check, not a measurement' : 'JS stage times come from _pt (performance.now); flushed times include one 1-pixel readback per batch',
      protocol: {target: o.target, frames: o.frames, warmup: o.warmup, repeats: o.repeats, order: 'ABBA across repeats; every run warm', modes: o.modes.slice(),
        sizes: o.sizes.map(function (s) { return s.slice(); }), particles: o.particles.slice(), flush: o.flush, flushFrames: o.flushFrames,
        flushBatches: o.flushBatches, stress: o.stress, timeOfDay: o.timeOfDay, holdMs: o.holdMs, workloadEveryFrame: true, allowHidden: o.allowHidden,
        nativeFullscreen: job.native, stages: STAGES.slice(), sums: SUMS, dumpPerfBreakdownSuppressed: true},
      env: job.env, runsPlanned: job.cells.length, runsDone: job.runs.length, targets: targets, restored: job.restored};
  }
  function finish(job, err) {
    if (job.done) return;
    job.done = true;
    if (job.raf && typeof G.cancelAnimationFrame === 'function') try { G.cancelAnimationFrame(job.raf); } catch (e) { /* host */ }
    try { job.restored = restoreAll(job); }
    catch (e) { job.restored = {ok: false, items: [], errors: ['restore threw: ' + (e && e.message)]}; }
    finally {
      for (var k in job.scratch) try { job.scratch[k].canvas.width = job.scratch[k].canvas.height = 1; } catch (e) { /* host */ }
      if (_job === job) _job = null;
      var r = report(job, err);
      if (!job.restored.ok && !err) { err = fail('restore failed: ' + job.restored.errors.join('; ')); r.ok = false; r.error = err.message; }
      if (err && !err.fxBench && err.stack) r.errorStack = String(err.stack).split('\n').slice(0, 4);
      _last = r;
      if (err) {
        var e = err.fxBench ? err : fail(err.message || String(err));
        e.report = r;
        warn(e.message);
        if (typeof job.o.onError === 'function') try { job.o.onError(e); } catch (x) { /* the caller's */ }
        if (job.reject) job.reject(e);
      } else {
        if (typeof G.console !== 'undefined' && G.console.info) G.console.info('fxBench: ' + r.runsDone + ' runs done; the report is fxBench.last');
        if (typeof job.o.onDone === 'function') try { job.o.onDone(r); } catch (x) { /* the caller's */ }
        if (job.resolve) job.resolve(r);
      }
    }
  }
  // Conditions that invalidate every later frame end the run.
  function guard(job) {
    var doc = G.document;
    if (job.abortReason) throw fail('aborted: ' + job.abortReason);
    if (!job.o.allowHidden && (!doc || doc.visibilityState !== 'visible'))
      throw fail('the tab stopped being visible during the run; hidden tabs throttle requestAnimationFrame, so the results were discarded');
    if (G.gameOverState) throw fail('the game ended (game over) during the run');
    if (!G.running || G.overviewActive || !G.MODE3D) throw fail('the game left the running 3D view during the run');
    if (G.menuOpen || G.settingsOpen || G.shopOpen || G.inventoryOpen || G.forgeOpen)
      throw fail('a menu or panel opened during the run (the simulation pauses or the overlay draws), so the results were discarded');
    var cv = G.canvas, size = job.cells[job.index].size;
    if (cv && (cv.width !== size[0] || cv.height !== size[1]))
      throw fail('the canvas changed from ' + size[0] + 'x' + size[1] + ' to ' + cv.width + 'x' + cv.height + ' during the run (fullscreen entered or left, or a resize), so the results were discarded');
    if (G.effectStats.registry.cleared !== job.cleared0) { job.worldReset = true; throw fail('a world or level reset happened during the run'); }
    var ox = G.windowOriginX || 0, oy = G.windowOriginY || 0;
    if (ox !== job.originX || oy !== job.originY) { job.shiftX += ox - job.originX; job.shiftY += oy - job.originY; job.originX = ox; job.originY = oy; }
  }
  // Each run has its own frame callback: one still pending after an abort
  // (a host without cancelAnimationFrame) ends there and never drives a newer run.
  function step(job, ts) {
    if (job.done || _job !== job) return;
    try {
      job.raf = 0;
      guard(job);
      var cell = job.cells[job.index], now = perfNow();
      frameHooks(job, cell, ts);
      // T9: the governor as the first frame at least 2 s after its reset left it.
      if (cell.governor === 'unpinned' && !job.gov.atTwoSeconds && now - job.govReset >= 2000)
        job.gov.atTwoSeconds = {elapsedMs: r4(now - job.govReset), phase: job.phase, ema: r4(G._fxRender.ema), governor: r4(G._fxRender.governor)};
      if (job.phase === 'measure' && job.lastTs !== null && job.cad < job.buf.cadence.length) job.buf.cadence[job.cad++] = ts - job.lastTs;
      // A step delayed past most of the ring may have missed a wrap of it.
      if (job.lastTs !== null && ts - job.lastTs > (G.PERF_HISTORY_LEN - 8) * 1000 / 60) {
        job.lost++; job.scene.valid = false; job.scene.notes.push('a ' + r4(ts - job.lastTs) + ' ms gap between animation frames; ring slots may be lost');
      }
      job.lastTs = ts;
      var ring = G._perfRingIdx, L = G.PERF_HISTORY_LEN, adv = (ring - job.lastRing + L) % L;
      if (!adv) { if (++job.stall > 120) throw fail('the game loop is not advancing (is the game running, unpaused, in 3D?)'); }
      else job.stall = 0;
      for (var k = 1; k <= adv && job.phase !== 'ended'; k++) {
        var slot = (job.lastRing + k) % L;
        if (job.phase === 'warmup') { if (++job.warm >= job.o.warmup) startMeasure(job, cell, now); }
        else if (job.phase === 'measure') {
          recordSlot(job, cell, slot);
          if (cell.holdMs ? now - job.measureAt >= cell.holdMs : job.m >= cell.frames) job.phase = 'ended';
          else if (job.m >= cell.frames) {
            job.phase = 'ended'; job.scene.valid = false;
            job.scene.notes.push('the frame buffer (' + cell.frames + ' frames) filled before the ' + cell.holdMs + ' ms hold ended');
          }
        }
      }
      job.lastRing = ring;
      if (job.phase === 'ended') {
        endRun(job, cell, now);
        if (++job.index >= job.cells.length) { finish(job, null); return; }
        setupRun(job, job.cells[job.index]);
      }
      job.raf = G.requestAnimationFrame(job.stepFn);
    } catch (e) { finish(job, e); }
  }
  function warn(text) { if (typeof G.console !== 'undefined' && G.console.warn) G.console.warn(text); }
  // A refusal changes nothing and requests no frame. The rejected promise is
  // marked handled (the console still shows it); onError gets the error too.
  function refuse(o, message) {
    var e = fail('refusing to run: ' + message);
    warn(e.message);
    if (o && typeof o.onError === 'function') try { o.onError(e); } catch (x) { /* the caller's */ }
    if (typeof Promise !== 'function') return undefined;
    var p = Promise.reject(e);
    p.catch(function () {});
    return p;
  }
  function run(opts) {
    var o;
    try { o = options(opts); } catch (e) { return refuse(opts, e.message.replace(/^fxBench: /, '')); }
    var doc = G.document;
    if (!o.allowHidden && (!doc || doc.visibilityState !== 'visible'))
      return refuse(o, "document.visibilityState is '" + (doc && doc.visibilityState) + "', not 'visible'. Hidden tabs and panes throttle " +
        'requestAnimationFrame (and pause the game), which invalidates every frame time. Run it in a visible foreground tab, ' +
        'or pass {allowHidden:true} for a tooling check that is not a measurement.');
    if (_job) return refuse(o, 'a run is already in progress (fxBench.status(); fxBench.abort() stops it)');
    var need = ['createFxState', 'updateEffects', 'drawEffectLayer3D', 'getEffectStats', 'setEffectToggle', 'effectToggleValue',
      'effectWeatherForce', 'compileFxRecipes', 'fxRebase', 'fxReset', 'requestAnimationFrame'];
    var missing = need.filter(function (n) { return typeof G[n] !== 'function'; });
    ['_perfStageHistory', '_fxStats', '_fxRender', 'effectStats'].forEach(function (n) { if (typeof G[n] !== 'object' || !G[n]) missing.push(n); });
    if (missing.length || typeof G.PERF_HISTORY_LEN !== 'number')
      return refuse(o, 'this page has no unified effects engine or perf ring (missing ' + (missing.join(', ') || 'PERF_HISTORY_LEN') + ')');
    if (!G.running || G.overviewActive || !G.MODE3D || G.gameOverState || G.menuOpen || G.settingsOpen || G.shopOpen || G.inventoryOpen || G.forgeOpen)
      return refuse(o, 'the game is not running in the 3D view: start Endless in 3D and close every menu and panel first; fxBench never starts, resets or reloads a world');
    var native = nativeSize();
    var job = {o: o, ids: o.target === 'all' ? ORDER.slice() : [o.target], cells: plan(o, native), index: 0, runs: [], touch: [], touched: {}, scratch: {},
      done: false, raf: 0, lost: 0, abortReason: null, worldReset: false, shiftX: 0, shiftY: 0,
      originX: G.windowOriginX || 0, originY: G.windowOriginY || 0, native: !!native, restored: null, cleared0: G.effectStats.registry.cleared};
    job.env = env();
    job.stepFn = function fxBenchStep(ts) { step(job, ts); };
    var promise = typeof Promise === 'function' ? new Promise(function (res, rej) { job.resolve = res; job.reject = rej; }) : undefined;
    if (promise) promise.catch(function () { /* reported to the caller's own then/catch */ });
    _job = job;
    try {
      touchGlobal(job, 'dumpPerfBreakdown');
      G.dumpPerfBreakdown = function fxBenchSuppressedDump() {};
      setupRun(job, job.cells[0]);
      job.raf = G.requestAnimationFrame(job.stepFn);
    } catch (e) { finish(job, e); }
    return promise;
  }
  function abort(reason) {
    var job = _job;
    if (!job) return false;
    job.abortReason = reason || 'fxBench.abort()';
    finish(job, fail('aborted: ' + job.abortReason));
    return true;
  }
  function status() {
    var job = _job;
    if (!job) return {active: false};
    var c = job.cells[job.index] || {};
    return {active: true, index: job.index, runs: job.cells.length, phase: job.phase, target: c.target, size: c.size, P: c.P,
      mode: c.mode, governor: c.governor, repeat: c.repeat, measured: job.m, warm: job.warm};
  }
  return {version: VERSION, targets: TARGETS, order: ORDER, defaults: DEFAULTS, stages: STAGES, sums: SUMS, stageFns: STAGE_FNS,
    run: run, plan: publicPlan, abort: abort, status: status, env: env,
    get last() { return _last; }};
}(typeof window !== 'undefined' ? window : this, typeof fxBench !== 'undefined' ? fxBench : null));
