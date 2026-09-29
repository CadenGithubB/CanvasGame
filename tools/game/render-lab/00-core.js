// Render lab core. Developer page only (/render-lab.html from dev.py serve);
// never part of the shipped header or /game.html. It drives the real game:
// frozen Date.now and Math.random, the game loop stopped through _loopGen,
// steered world seeds, and A/B/B/A render timing with the game's own _pt
// stage timers and render-feature counters. Timing and pixel readback must run
// in separate fresh tabs. Callback style (no async) so jsc can drive it.
var RenderLab = (function () {
  var saved = null, runs = 0;
  var DEBUG_FLAGS = ['DEBUG_POLY_TYPES', 'DEBUG_HIDE_CEIL', 'DEBUG_HIDE_PLATS', 'DEBUG_HIDE_WALLS',
    'DEBUG_LAYER_TYPES', 'DEBUG_CAVE_COLORS', 'DEBUG_CEIL_WIRE', 'DEBUG_PERF_HUD', 'DEBUG_CAVE'];
  function write(text) {
    var el = document.getElementById('renderLabResult');
    if (el) el.textContent = text;
    return text;
  }
  function mulberry32(seed) {
    var s = seed | 0 || 1;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Frozen presentation inputs. performance.now stays real: it is the timer.
  function freeze(seed) {
    if (!saved) {
      saved = {now: Date.now, random: Math.random, flags: {}};
      DEBUG_FLAGS.forEach(function (k) { saved.flags[k] = window[k]; });
    }
    var frozen = 2000000000000;
    Date.now = function () { return frozen; };
    Math.random = mulberry32(seed || 1234567);
    DEBUG_FLAGS.forEach(function (k) { window[k] = false; });
  }
  function unfreeze() {
    if (!saved) return;
    Date.now = saved.now; Math.random = saved.random;
    DEBUG_FLAGS.forEach(function (k) { window[k] = saved.flags[k]; });
    saved = null;
  }
  function stopLoop() { _loopGen = (_loopGen || 0) + 1; }
  function settle() {
    stopLoop();
    if (overviewActive) toggleOverview();
    MODE3D = true; calibrating = false; hasBaseline = true; CAM_FOLLOW = true;
    menuOpen = false; settingsOpen = false; shopOpen = false; inventoryOpen = false; forgeOpen = false;
    kbState.up = kbState.down = kbState.left = kbState.right = false;
    dayTime = 0.5; daySpeed = 0; settings.dayNight = true;
    if (typeof resetRenderInterpolation === 'function') resetRenderInterpolation();
  }
  // WORLD_SEED = floor(random * 999999) + 1, so one steered draw selects it.
  function startEndless(seed) {
    seed = Math.max(1, Math.min(999999, seed | 0));
    var target = (seed - 0.5) / 999999, restore = Math.random, used = false;
    if (typeof prepareGameRun === 'function') prepareGameRun();
    Math.random = function () { if (!used) { used = true; return target; } return restore(); };
    CAVE_TEST_MODE = false; ENDLESS_MODE = true; gameOverState = false; running = true;
    try { resetEndlessMode(); } finally { Math.random = restore; }
    settle();
    if (WORLD_SEED !== seed) throw Error('startEndless wanted seed ' + seed + ', got ' + WORLD_SEED);
    return WORLD_SEED;
  }
  function startCaveTest(seed) {
    if (typeof prepareGameRun === 'function') prepareGameRun();
    window._caveTestSeedOverride = seed || 12345; window._caveTestKindOverride = 'descending';
    for (var k in caveTestFlags) caveTestFlags[k] = k === 'caveChests';
    CAVE_TEST_MODE = true; ENDLESS_MODE = true; gameOverState = false; running = true; terrain = 'plains';
    resetEndlessMode();
    settle();
    return WORLD_SEED;
  }
  // Camera pose in window-local world units; the player is settled on the
  // top walkable layer there, like a spawn, and interpolation is reset.
  function place(x, y, ang, pitch) {
    stopLoop();
    pos.x = x; pos.y = y; vel.x = 0; vel.y = 0;
    settlePlayerAtSpawn(true);
    cam.ang = ang || 0; cam.pitch = pitch || 0;
    resetRenderInterpolation();
    return {x: pos.x, y: pos.y, floorZ: pos.floorZ, ang: cam.ang};
  }
  function applyConfig(config) {
    if (config === 'recommended' || config === 'legacy') { applyRenderPreset(config); return config; }
    if (config && config.preset) applyRenderPreset(config.preset);
    if (config && config.features) setRenderFeatures(config.features);
    return renderPresetName();
  }
  function errorTotal() { var n = 0; for (var k in _ptErrors) n += _ptErrors[k]; return n; }
  function percentile(values, p) {
    if (!values.length) return NaN;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p / 100 * sorted.length) - 1))];
  }
  function stats(values) {
    return {n: values.length, p50: percentile(values, 50), p95: percentile(values, 95),
      max: values.length ? Math.max.apply(null, values) : NaN};
  }
  // Frames per display refresh, from the median against the fastest (p10)
  // interval: 1 = every vsync, 2 = every second vsync, and so on.
  function vsyncClass(intervals) {
    if (intervals.length < 4) return {median: NaN, divisor: NaN, label: 'too few intervals'};
    var median = percentile(intervals, 50), fastest = percentile(intervals, 10);
    var divisor = fastest > 0 ? Math.max(1, Math.round(median / fastest)) : NaN;
    return {median: median, divisor: divisor, label: 'every ' + divisor + ' vsync (median ' + median.toFixed(2) + ' ms)'};
  }
  // One measured frame: this ring slot is zeroed first, so _pt stage times
  // read afterwards belong to this frame only.
  function measureFrame() {
    _perfRingIdx = (_perfRingIdx + 1) % PERF_HISTORY_LEN;
    for (var name in _perfStageHistory) _perfStageHistory[name][_perfRingIdx] = 0;
    var t0 = performance.now();
    renderFrame();
    var ms = performance.now() - t0, stages = {};
    for (var stage in _perfStageHistory) {
      var v = _perfStageHistory[stage][_perfRingIdx];
      if (v > 0) stages[stage] = v;
    }
    return {ms: ms, stages: stages, counters: getRenderFeatureStats().frame};
  }
  // phases: [{label, config}]; each gets warm-up then measured rAF frames.
  function runPhases(phases, warmup, measured, done) {
    var results = [], phaseIndex = -1, frame = 0, current = null, lastTs = null;
    var errorsBefore = errorTotal(), consoleErrors = 0, originalError = console.error;
    console.error = function () { consoleErrors++; return originalError.apply(console, arguments); };
    function nextPhase() {
      phaseIndex++;
      if (phaseIndex >= phases.length) return finish();
      applyConfig(phases[phaseIndex].config);
      current = {label: phases[phaseIndex].label, preset: renderPresetName(), renderMs: [], intervals: [], stages: {}, counters: {}};
      results.push(current); frame = 0; lastTs = null;
      requestAnimationFrame(step);
    }
    function step(ts) {
      var sample = measureFrame();
      if (frame >= warmup) {
        current.renderMs.push(sample.ms);
        if (lastTs !== null && ts > lastTs) current.intervals.push(ts - lastTs);
        for (var s in sample.stages) (current.stages[s] || (current.stages[s] = [])).push(sample.stages[s]);
        for (var c in sample.counters) if (typeof sample.counters[c] === 'number') current.counters[c] = (current.counters[c] || 0) + sample.counters[c];
      }
      lastTs = ts; frame++;
      if (frame < warmup + measured) requestAnimationFrame(step); else nextPhase();
    }
    function finish() {
      console.error = originalError;
      done({phases: results, ptErrors: errorTotal() - errorsBefore, consoleErrors: consoleErrors});
    }
    nextPhase();
  }
  function summarize(run, measured) {
    var lines = [], byLabel = {};
    run.phases.forEach(function (p) {
      var entry = byLabel[p.label] || (byLabel[p.label] = {label: p.label, preset: p.preset, renderMs: [], intervals: [], stages: {}, counters: {}, frames: 0});
      entry.renderMs = entry.renderMs.concat(p.renderMs); entry.intervals = entry.intervals.concat(p.intervals);
      entry.frames += p.renderMs.length;
      for (var s in p.stages) entry.stages[s] = (entry.stages[s] || []).concat(p.stages[s]);
      for (var c in p.counters) entry.counters[c] = (entry.counters[c] || 0) + p.counters[c];
    });
    var complete = run.phases.every(function (p) { return p.renderMs.length === measured; });
    var pass = complete && run.ptErrors === 0 && run.consoleErrors === 0;
    lines.push((pass ? 'PASS' : 'FAIL') + ' A/B/B/A: ' + run.phases.map(function (p) { return p.label + '=' + p.preset; }).join(' ') +
      ' · frames complete ' + complete + ' · _ptErrors ' + run.ptErrors + ' · console errors ' + run.consoleErrors);
    Object.keys(byLabel).forEach(function (label) {
      var e = byLabel[label], r = stats(e.renderMs), v = vsyncClass(e.intervals);
      lines.push(label + ' (' + e.preset + '): renderFrame p50 ' + r.p50.toFixed(2) + ' p95 ' + r.p95.toFixed(2) +
        ' max ' + r.max.toFixed(2) + ' ms over ' + e.frames + ' frames; rAF ' + v.label);
      ['draw()', 'walls3D', 'structureModels3D', 'landmarkOpaque3D', 'sceneEntities', 'structures3D', 'ruins3D'].forEach(function (s) {
        if (!e.stages[s]) return;
        var st = stats(e.stages[s]);
        lines.push('  ' + s + ' p50 ' + st.p50.toFixed(3) + ' p95 ' + st.p95.toFixed(3) + ' max ' + st.max.toFixed(3));
      });
      var counters = Object.keys(e.counters).filter(function (c) { return c !== 'frame'; });
      if (counters.length) lines.push('  counters/frame ' + counters.map(function (c) { return c + '=' + (e.counters[c] / Math.max(1, e.frames)).toFixed(1); }).join(' '));
    });
    lines.push('Same seed, pose, canvas ' + canvas.width + 'x' + canvas.height + ' and devicePixelRatio ' + (window.devicePixelRatio || 1) +
      ' in every phase. Compare only runs from fresh tabs with no pixel readback.');
    return {pass: pass, byLabel: byLabel, text: lines.join('\n')};
  }
  function abba(a, b, options, done) {
    options = options || {};
    var warmup = options.warmup === undefined ? 20 : options.warmup, measured = options.measured === undefined ? 90 : options.measured;
    freeze(options.seed); runs++;
    runPhases([{label: 'A', config: a}, {label: 'B', config: b}, {label: 'B', config: b}, {label: 'A', config: a}], warmup, measured, function (run) {
      unfreeze();
      var summary = summarize(run, measured);
      write(summary.text);
      if (done) done(summary, run);
    });
  }
  // Presses G through the page's own keydown listener every `every` frames.
  function pressG() {
    if (typeof KeyboardEvent === 'function' && document.dispatchEvent) document.dispatchEvent(new KeyboardEvent('keydown', {key: 'g', bubbles: true}));
    else handleRenderPresetHotkey({key: 'g', target: canvas, preventDefault: function () {}});
  }
  function gPressRun(frames, every, done) {
    frames = frames || 600; every = every || 60;
    var n = 0, presses = 0, presets = {}, errorsBefore = errorTotal(), consoleErrors = 0, originalError = console.error;
    console.error = function () { consoleErrors++; return originalError.apply(console, arguments); };
    freeze(7);
    function step() {
      if (n > 0 && n % every === 0) { pressG(); presses++; }
      presets[renderPresetName()] = (presets[renderPresetName()] || 0) + 1;
      renderFrame(); n++;
      if (n < frames) requestAnimationFrame(step);
      else {
        console.error = originalError; unfreeze();
        var ptErrors = errorTotal() - errorsBefore, pass = ptErrors === 0 && consoleErrors === 0 && presses === Math.floor((frames - 1) / every);
        var text = (pass ? 'PASS' : 'FAIL') + ' ' + frames + ' frames, G pressed ' + presses + ' times: _ptErrors ' + ptErrors +
          ', console errors ' + consoleErrors + ', frames per preset ' + JSON.stringify(presets);
        write(text);
        if (done) done({pass: pass, presses: presses, ptErrors: ptErrors, consoleErrors: consoleErrors, presets: presets, text: text});
      }
    }
    requestAnimationFrame(step);
  }
  function fnv(data) {
    var h = 0x811c9dc5;
    for (var i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 0x01000193);
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }
  // Pixel capture: one frozen frame per configuration, compared with the first.
  function capture(configs) {
    freeze(99);
    var shots = [];
    try {
      configs.forEach(function (config) {
        applyConfig(config); renderFrame();
        var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        shots.push({config: typeof config === 'string' ? config : JSON.stringify(config), preset: renderPresetName(), hash: fnv(data), data: data});
      });
    } finally { unfreeze(); }
    var lines = ['Pixel capture (this tab is now unsuitable for timing):'];
    shots.forEach(function (s, i) {
      var diff = 0, base = shots[0].data;
      for (var p = 0; p < s.data.length; p += 4) if (s.data[p] !== base[p] || s.data[p + 1] !== base[p + 1] || s.data[p + 2] !== base[p + 2]) diff++;
      lines.push(s.config + ' (' + s.preset + ') fnv ' + s.hash + ' · pixels differing from ' + shots[0].config + ': ' + (i ? diff : 0));
    });
    write(lines.join('\n'));
    return shots.map(function (s) { return {config: s.config, preset: s.preset, hash: s.hash}; });
  }
  function fullscreenReport() {
    var fs = document.fullscreenElement || document.webkitFullscreenElement;
    var want = fullscreenCanvasTargetSize();
    var ok = fs === canvas && canvas.width === want.width && canvas.height === want.height;
    return write((fs === canvas ? (ok ? 'PASS' : 'FAIL') : 'NOT FULLSCREEN') + ' canvas ' + canvas.width + 'x' + canvas.height +
      ', expected ' + want.width + 'x' + want.height + ' (viewport ' + window.innerWidth + 'x' + window.innerHeight +
      ', resolution ' + settings.resolution + ', rows ' + settings.fullscreenRows + ')');
  }
  return {freeze: freeze, unfreeze: unfreeze, stopLoop: stopLoop, startEndless: startEndless, startCaveTest: startCaveTest, place: place,
    applyConfig: applyConfig, measureFrame: measureFrame, runPhases: runPhases, summarize: summarize, abba: abba,
    gPressRun: gPressRun, capture: capture, fullscreenReport: fullscreenReport, percentile: percentile,
    vsyncClass: vsyncClass, write: write};
}());

(function () {
  function on(id, fn) {
    var el = document.getElementById(id);
    if (el && el.addEventListener) el.addEventListener('click', function () {
      try { fn(); } catch (e) { RenderLab.write('FAIL ' + (e && e.message || e)); }
    });
  }
  function value(id, fallback) { var el = document.getElementById(id); return el && el.value !== undefined && el.value !== '' ? el.value : fallback; }
  on('renderLabEndless', function () {
    var seed = RenderLab.startEndless(parseInt(value('renderLabSeed', '424242'), 10));
    RenderLab.freeze(seed); renderFrame(); RenderLab.unfreeze();
    RenderLab.write('Endless seed ' + seed + ' ready; loop stopped.');
  });
  on('renderLabCave', function () {
    RenderLab.startCaveTest(12345); RenderLab.freeze(12345); renderFrame(); RenderLab.unfreeze();
    RenderLab.write('Cave Test 12345 ready; loop stopped.');
  });
  on('renderLabLandmark', function () {
    var r = goToNearestLandmark({type: value('renderLabLandmarkType', '') || undefined});
    RenderLab.stopLoop(); RenderLab.freeze(1); renderFrame(); RenderLab.unfreeze();
    RenderLab.write(r.ok ? r.message : 'FAIL ' + r.reason);
  });
  on('renderLabRender', function () { RenderLab.freeze(1); renderFrame(); RenderLab.unfreeze(); RenderLab.write('Rendered one frozen frame at ' + renderPresetName() + '.'); });
  on('renderLabAbba', function () {
    RenderLab.write('Timing A/B/B/A...');
    RenderLab.abba(value('renderLabA', 'legacy'), value('renderLabB', 'legacy'),
      {warmup: parseInt(value('renderLabWarmup', '20'), 10), measured: parseInt(value('renderLabMeasured', '90'), 10)});
  });
  on('renderLabCapture', function () { RenderLab.capture([value('renderLabA', 'legacy'), value('renderLabB', 'legacy')]); });
  on('renderLabGPress', function () { RenderLab.write('Pressing G...'); RenderLab.gPressRun(600, 60); });
  on('renderLabFullscreen', function () { RenderLab.fullscreenReport(); });
}());
