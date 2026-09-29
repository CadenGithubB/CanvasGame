// Render-feature registry, in-game A/B surfaces and fullscreen sizing, driven
// through the real MAIN manifest and its real listeners (render_host.js).
// Checks print PASS/FAIL and keep going, so a mutation names what it broke.
// Mutations (evaluated copies only; each anchor must match exactly once):
//   --g-ignores-page-controls   G handler loses its page-control guard
//   --legacy-fullscreen-size    fullscreen entry uses innerWidth x innerHeight again
//   --preset-reassembles        applying a preset reassembles the window
//   --preset-draws-rng          applying a preset draws from Math.random
//   --no-frame-stats-reset      draw() no longer resets the per-frame counters
//   --texture-button-inert      Toggle Textures changes its label only
//   --keep-control-focus        Graphics-row controls keep keyboard focus after use
// --skip-replay / --skip-lab leave out the slow sections (mutation runs only).
(function () {
  (0, eval)(slurp('tools/game/tests/render_host.js'));
  var H = createRenderTestHost(), G = H.G, out = H.output, checked = 0, failed = 0;
  function check(name, ok, detail) {
    checked++; if (!ok) failed++;
    out((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + JSON.stringify(detail === undefined ? null : detail)));
  }
  function flag(name) { return __argv.indexOf(name) >= 0; }
  function swap(source, name, before, after) {
    if (!flag(name)) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + name);
    return source.replace(before, after);
  }
  var PRESET_ANCHOR = "  _renderPresetSelected = name;\n";
  function mutate(path, source) {
    if (path === 'src/23-events-init.js') {
      source = swap(source, '--g-ignores-page-controls', '  if (e.defaultPrevented || isGamePageControlTarget(e.target)) return false;\n',
        '  if (e.defaultPrevented) return false;\n');
      source = swap(source, '--keep-control-focus', "  if (control && typeof control.blur === 'function') control.blur();\n", '');
      source = swap(source, '--texture-button-inert', '  USE_TEXTURES = !USE_TEXTURES;\n  this.textContent = USE_TEXTURES',
        '  this.textContent = !USE_TEXTURES');
    }
    if (path === 'src/01-config-state.js') {
      source = swap(source, '--legacy-fullscreen-size', '    requestAnimationFrame(function() { applyFullscreenCanvasSize(); });\n',
        '    requestAnimationFrame(function() {\n      canvas.width  = window.innerWidth  || screen.width;\n' +
        '      canvas.height = window.innerHeight || screen.height;\n    });\n');
      source = swap(source, '--preset-reassembles', PRESET_ANCHOR, PRESET_ANCHOR +
        '  if (grid && ENDLESS_MODE) assembleWindow(windowCX + Math.floor(WINDOW_CHUNKS / 2), windowCY + Math.floor(WINDOW_CHUNKS / 2));\n');
      source = swap(source, '--preset-draws-rng', PRESET_ANCHOR, PRESET_ANCHOR + '  Math.random();\n');
    }
    if (path === 'src/16-draw-overview.js')
      source = swap(source, '--no-frame-stats-reset', "    if (typeof beginRenderFrameStats === 'function') beginRenderFrameStats();\n", '');
    return source;
  }
  var loaded = H.loadManifest(mutate);
  var row = H.byId.renderFeaturesRow;
  function controls() { return G._renderFeaturesRowControls; }
  function inRow(node) { return !!(row && node && row.contains(node)); }
  function optionValues(select) { return select.children.map(function (o) { return o.value; }); }

  // ── Load, defaults, generated row ──
  var finderAction = G.RENDER_ACTIONS.filter(function (a) { return a.key === 'goToNearestLandmark'; })[0];
  check('real manifest loads with the registry, the finder action and no console errors',
    loaded > 40 && typeof G.defineRenderFeature === 'function' && !!finderAction && H.errors.length === 0, {loaded: loaded, errors: H.errors.slice(0, 3)});
  var texButton = H.byId.btnToggleTex, texDebug = H.byId.chkTexDebug;
  check('defaults: texture master on and labelled, Texture debug unchecked and off',
    G.USE_TEXTURES === true && texButton.textContent === 'Disable Textures' && texDebug.checked === false && G.DEBUG_TEXTURE === false,
    {tex: G.USE_TEXTURES, label: texButton.textContent, debug: [texDebug.checked, G.DEBUG_TEXTURE]});
  var c0 = controls();
  var buttons = [];
  (function walk(node) { if (node.tagName === 'BUTTON') buttons.push(node); node.children.forEach(walk); }(row));
  // Restated in Stage C: shipped features now exist (modelBackfaceCull first),
  // so the load-time row must hold one live control per shipped feature and
  // no empty-feature note. The note is only reachable with an empty registry,
  // which the shipping manifest no longer has; that branch stays checked
  // conditionally below in case a source tree without features is loaded.
  var shipped = G.RENDER_FEATURE_DEFS.map(function (d) { return d.key; });
  var shippedRow = shipped.length ? shipped.every(function (k) {
    var control = c0 && c0.features && c0.features[k];
    return inRow(control) && (control.type === 'checkbox' ? control.checked === G.RENDER_FEATURES[k] : control.value === String(G.RENDER_FEATURES[k]));
  }) && row.textContent.indexOf('no switchable render paths yet') < 0 : row.textContent.indexOf('no switchable render paths yet') >= 0;
  check('Graphics row is generated in #renderFeaturesRow: preset select, rows select, finder button, one live control per shipped feature',
    !!c0 && inRow(c0.preset) && JSON.stringify(optionValues(c0.preset)) === '["recommended","legacy","custom"]' &&
    c0.custom.disabled === true && inRow(c0.rows) && JSON.stringify(optionValues(c0.rows)) === '["native","360","480","540","720"]' &&
    buttons.length === 1 && buttons[0].textContent === 'Go to nearest landmark' && shipped.indexOf('modelBackfaceCull') >= 0 && shippedRow,
    {buttons: buttons.map(function (b) { return b.textContent; }), shipped: shipped, text: row.textContent});

  // ── Registry validation ──
  function rejects(def, needle) {
    var before = G.RENDER_FEATURE_DEFS.length, keys = Object.keys(G.RENDER_FEATURES).length;
    try { G.defineRenderFeature(def); } catch (e) {
      return String(e.message).indexOf(needle) >= 0 && G.RENDER_FEATURE_DEFS.length === before && Object.keys(G.RENDER_FEATURES).length === keys;
    }
    return false;
  }
  var rejections = {
    key: rejects({key: 'Bad-Key', label: 'x', type: 'bool', default: true, legacy: false}, 'invalid key'),
    label: rejects({key: 'labNoLabel', type: 'bool', default: true, legacy: false}, 'label required'),
    legacyOn: rejects({key: 'labOnInLegacy', label: 'x', type: 'bool', default: true, legacy: true}, 'must be false in Legacy'),
    enumDefault: rejects({key: 'labBadDefault', label: 'x', type: 'enum', values: ['a', 'b'], default: 'c', legacy: 'a'}, 'default is not'),
    enumLegacy: rejects({key: 'labBadLegacy', label: 'x', type: 'enum', values: ['a', 'b'], default: 'a', legacy: 'z'}, 'legacy is not'),
    enumDuplicate: rejects({key: 'labDup', label: 'x', type: 'enum', values: ['1', 1], default: 1, legacy: 1}, 'duplicate enum value'),
    type: rejects({key: 'labType', label: 'x', type: 'number', default: 1, legacy: 0}, 'type must be'),
    clash: rejects({key: 'goToNearestLandmark', label: 'x', type: 'bool', default: true, legacy: false}, 'duplicate key')
  };
  check('registry rejects malformed definitions and leaves the registry unchanged',
    Object.keys(rejections).every(function (k) { return rejections[k]; }), rejections);
  G.defineRenderFeature({key: 'labProbe', label: 'Lab probe', type: 'bool', default: true, legacy: false});
  G.defineRenderFeature({key: 'labMode', label: 'Lab mode', type: 'enum', values: ['low', 'high', 64], default: 'high', legacy: 'low'});
  var c1 = controls(), probeBox = c1.features.labProbe, modeSelect = c1.features.labMode;
  check('features registered after load rebuild the row with one control each, showing live values',
    inRow(probeBox) && probeBox.type === 'checkbox' && probeBox.checked === true && inRow(modeSelect) &&
    JSON.stringify(optionValues(modeSelect)) === '["low","high","64"]' && modeSelect.value === 'high' &&
    row.textContent.indexOf('no switchable render paths yet') < 0 && G.renderPresetName() === 'recommended');
  var rec = G.renderFeaturePreset('recommended'), leg = G.renderFeaturePreset('legacy');
  check('presets are derived from the definitions: Recommended uses defaults, Legacy has every bool feature off',
    rec.labProbe === true && rec.labMode === 'high' && leg.labProbe === false && leg.labMode === 'low' &&
    G.RENDER_FEATURE_DEFS.every(function (d) { return d.type !== 'bool' || leg[d.key] === false; }) && Object.isFrozen(rec) && Object.isFrozen(leg));
  function throwsWith(fn, needle) { try { fn(); } catch (e) { return String(e.message).indexOf(needle) >= 0; } return false; }
  check('an unknown key is rejected and nothing in that call is applied',
    throwsWith(function () { G.setRenderFeatures({labProbe: false, labMissing: true}); }, 'unknown feature labMissing') &&
    G.RENDER_FEATURES.labProbe === true);
  check('enum values are exact: an unlisted value or a numeric string is rejected, the listed number accepted',
    throwsWith(function () { G.setRenderFeatures({labMode: 'medium'}); }, 'is not one of') &&
    throwsWith(function () { G.setRenderFeatures({labMode: '64'}); }, 'is not one of') &&
    G.RENDER_FEATURES.labMode === 'high' && G.setRenderFeatures({labMode: 64}).labMode === 64);
  check('a single changed switch reports Custom, and the row selects the enabled Custom entry',
    G.renderPresetName() === 'custom' && c1.preset.value === 'custom' && c1.custom.disabled === false && modeSelect.value === '64');
  var unknownBefore = G._renderFeatureUnknownReads;
  check('renderFeatureOn is a guarded read: an unknown key reads off and is counted',
    G.renderFeatureOn('labNotRegistered') === false && G.renderFeatureValue('labNotRegistered', 'x') === 'x' &&
    G._renderFeatureUnknownReads === unknownBefore + 2 && G.renderFeatureOn('labProbe') === true);
  check('console renderPreset applies and reads presets and rejects unknown names',
    G.renderPreset('legacy') === 'legacy' && G.RENDER_FEATURES.labProbe === false && G.RENDER_FEATURES.labMode === 'low' &&
    G.renderPreset() === 'legacy' && throwsWith(function () { G.renderPreset('ultra'); }, 'unknown preset'));
  probeBox.checked = true; H.fire(probeBox, 'change');
  modeSelect.value = '64'; H.fire(modeSelect, 'change');
  var fromRow = [G.RENDER_FEATURES.labProbe, G.RENDER_FEATURES.labMode];
  c1.preset.value = 'recommended'; H.fire(c1.preset, 'change');
  G.setRenderFeatures({labProbe: false});
  check('row controls write the registry (enum strings map back to numbers) and console writes sync the row',
    fromRow[0] === true && fromRow[1] === 64 && G.RENDER_FEATURES.labMode === 'high' && probeBox.checked === false &&
    c1.preset.value === 'custom', {fromRow: fromRow, mode: G.RENDER_FEATURES.labMode, box: probeBox.checked});
  G.applyRenderPreset('recommended');

  // ── Texture master ──
  H.fire(texButton, 'click');
  var off = {tex: G.USE_TEXTURES, label: texButton.textContent, stats: G.getRenderFeatureStats().textures, line: G.renderHudStatusLine()};
  H.fire(texButton, 'click');
  check('Toggle Textures flips USE_TEXTURES and its label, and the stats and HUD line follow',
    off.tex === false && off.label === 'Enable Textures' && off.stats === false && off.line === 'R:Rec TEX off fb 0' &&
    G.USE_TEXTURES === true && texButton.textContent === 'Disable Textures' && G.renderHudStatusLine() === 'R:Rec TEX - fb 0',
    {off: off, on: [G.USE_TEXTURES, texButton.textContent, G.renderHudStatusLine()]});

  // ── Finder action through the row, before a world exists ──
  G.toasts.length = 0;
  H.fire(buttons[0], 'click');
  check('the row runs registered actions and reports a refusal without a world',
    c1.status.textContent === 'Not done: Start Endless Mode first.' && G.toasts.length === 1, c1.status.textContent);

  // ── Controls hand focus back to the game (Space would re-click a focused finder) ──
  var blurred = [], c2 = controls(), cullBox = c2.features.modelBackfaceCull, cullWas = G.RENDER_FEATURES.modelBackfaceCull;
  [[buttons[0], 'finder'], [cullBox, 'checkbox'], [c2.preset, 'preset'], [c2.rows, 'rows']].forEach(function (p) {
    p[0].blur = function () { blurred.push(p[1]); };
  });
  G.toasts.length = 0;
  H.fire(buttons[0], 'click');
  cullBox.checked = !cullWas; H.fire(cullBox, 'change'); cullBox.checked = cullWas; H.fire(cullBox, 'change');
  c2.preset.value = 'recommended'; H.fire(c2.preset, 'change');
  c2.rows.value = String(G.settings.fullscreenRows); H.fire(c2.rows, 'change');
  check('Graphics row controls release keyboard focus after use so game keys and Space return to the game',
    ['finder', 'checkbox', 'preset', 'rows'].every(function (n) { return blurred.indexOf(n) >= 0; }) &&
    G.RENDER_FEATURES.modelBackfaceCull === cullWas, {blurred: blurred, cull: G.RENDER_FEATURES.modelBackfaceCull});

  // ── G hotkey through the real keydown listener ──
  H.startEndless(2024);
  var world = {w: H.canvas.width, h: H.canvas.height, seed: G.WORLD_SEED, grid: G.grid, x: G.pos.x, y: G.pos.y, mesh: G.floorMesh};
  G.toasts.length = 0;
  var e1 = H.fire(H.document, 'keydown', {key: 'g', target: H.canvas});
  var afterFirst = [G.renderPresetName(), G.toasts.length, G.toasts.length && G.toasts[0].text, e1.defaultPrevented];
  H.fire(H.document, 'keydown', {key: 'G', target: H.canvas});
  check('G toggles Recommended and Legacy through the real keydown listener and toasts each switch',
    afterFirst[0] === 'legacy' && afterFirst[1] === 1 && /Legacy/.test(afterFirst[2]) && afterFirst[3] === true &&
    G.renderPresetName() === 'recommended' && G.toasts.length === 2 && /Recommended/.test(G.toasts[1].text),
    {first: afterFirst, now: G.renderPresetName(), toasts: G.toasts.map(function (t) { return t.text; })});
  function ignored(props, setup, cleanup) {
    var before = G.renderPresetName(), toasts = G.toasts.length;
    if (setup) setup();
    try { H.fire(H.document, 'keydown', Object.assign({key: 'g', target: H.canvas}, props)); }
    finally { if (cleanup) cleanup(); }
    return G.renderPresetName() === before && G.toasts.length === toasts;
  }
  var input = H.create('input'), button = H.create('button'), span = H.create('span');
  button.appendChild(span);
  check('G is ignored when the target is a page control (input, or text inside a button)',
    ignored({target: input}) && ignored({target: span}));
  check('G is ignored while the shop or the settings overlay is open',
    ignored({}, function () { G.shopOpen = true; }, function () { G.shopOpen = false; }) &&
    ignored({}, function () { G.settingsOpen = true; }, function () { G.settingsOpen = false; }));
  check('G is ignored on key repeat and on Ctrl, Meta or Alt chords',
    ignored({repeat: true}) && ignored({ctrlKey: true}) && ignored({metaKey: true}) && ignored({altKey: true}));
  G.applyRenderPreset('recommended');   // a failed ignore check must not cascade
  check('G never changes resolution, world data or position',
    H.canvas.width === world.w && H.canvas.height === world.h && G.WORLD_SEED === world.seed && G.grid === world.grid &&
    G.floorMesh === world.mesh && G.pos.x === world.x && G.pos.y === world.y);

  // ── Fullscreen sizing through the real listener ──
  var pure = [G.fullscreenCanvasSize(1920, 1080, 0.75, 360), G.fullscreenCanvasSize(1920, 1080, 0.75, 'native'),
    G.fullscreenCanvasSize(1920, 1080, 0.5, 720), G.fullscreenCanvasSize(2560, 1080, 1, 360)];
  check('fullscreen size rule: resolution first, then the row cap with the aspect kept',
    JSON.stringify(pure) === '[{"width":640,"height":360},{"width":1440,"height":810},{"width":960,"height":540},{"width":853,"height":360}]', pure);
  G.innerWidth = 1920; G.innerHeight = 1080; G.settings.resolution = 0.75; G.settings.fullscreenRows = 360;
  function fullscreen(element) { H.document.fullscreenElement = element; H.fire(H.document, 'fullscreenchange'); }
  fullscreen(H.canvas); H.flushRaf();
  var capped = [H.canvas.width, H.canvas.height];
  fullscreen(null);
  var exited = [H.canvas.width, H.canvas.height];
  G.settings.fullscreenRows = 'native'; fullscreen(H.canvas); H.flushRaf();
  var native = [H.canvas.width, H.canvas.height];
  check('entering fullscreen honours resolution and the row cap through the real listener (1920x1080 at 0.75)',
    capped.join('x') === '640x360' && native.join('x') === '1440x810', {capped: capped, native: native});
  check('exiting fullscreen restores the authored 360x240', exited.join('x') === '360x240', exited);
  fullscreen(null); fullscreen(H.canvas); fullscreen(null); H.flushRaf();
  check('a resize queued on entry is dropped when fullscreen already ended', H.canvas.width === 360 && H.canvas.height === 240,
    [H.canvas.width, H.canvas.height]);
  fullscreen(H.canvas); H.flushRaf();
  G.settings.fullscreenRows = 360; H.canvas.width = 5; H.canvas.height = 5; G.applySettings();
  var applied = [H.canvas.width, H.canvas.height];
  var rowsSelect = controls().rows; rowsSelect.value = '480'; H.fire(rowsSelect, 'change');
  check('Apply and the Graphics rows select resize fullscreen with the same rule',
    applied.join('x') === '640x360' && G.settings.fullscreenRows === 480 && H.canvas.width === 853 && H.canvas.height === 480,
    {applied: applied, rows: G.settings.fullscreenRows, now: [H.canvas.width, H.canvas.height]});
  fullscreen(null); G.settings.fullscreenRows = 'native'; G.innerWidth = 1280; G.innerHeight = 720;

  // ── Per-frame counters and HUD lines ──
  var order = [], realDepth = G.beginSceneDepthFrame, realStats = G.beginRenderFrameStats, realSky = G.drawSkybox3D;
  G.beginSceneDepthFrame = function () { order.push('depth'); return realDepth.apply(null, arguments); };
  G.beginRenderFrameStats = function () { order.push('stats'); return realStats.apply(null, arguments); };
  // A presentation-only lab switch: labProbe off skips the sky, so presets
  // visibly change drawing in the replay below.
  var skyDrawn = 0;
  G.drawSkybox3D = function () {
    order.push('sky'); G.addRenderFrameStat('labCounter', 3);
    if (G.renderFeatureOn('labProbe')) { skyDrawn++; return realSky.apply(null, arguments); }
  };
  G.addRenderFrameStat('labCounter', 100);
  var frameBefore = G._renderFrameStats.frame;
  G.renderFrame();
  check('draw() resets the per-frame counters right after beginSceneDepthFrame, before any pass adds to them',
    order.join(',') === 'depth,stats,sky' && G._renderFrameStats.labCounter === 3 && G._renderFrameStats.frame === frameBefore + 1,
    {order: order, counter: G._renderFrameStats.labCounter});
  G.DEBUG_PERF_HUD = true; G.renderFrame(); G.DEBUG_PERF_HUD = false;
  var hudText = H.byId.perfHudText.textContent;
  // Restated in Stage C: the features line lists every registered feature in
  // registration order, shipped ones (modelBackfaceCull, ...) before the lab's.
  var featuresLine = 'features: ' + G.RENDER_FEATURE_DEFS.map(function (d) { return d.key + '=' + G.RENDER_FEATURES[d.key]; }).join(' ');
  check('Perf HUD text prints the render section, every numeric per-frame counter and every feature value',
    /─── RENDER recommended · textures on · 360x240 ───/.test(hudText) && /\nlabCounter +3\n/.test(hudText) &&
    /\nframe +\d+\n/.test(hudText) && hudText.split('\n').indexOf(featuresLine) >= 0 &&
    / labProbe=true labMode=high$/.test(featuresLine), {want: featuresLine, got: hudText.split('\n').slice(-8)});
  var texts = [], realCtx = G.ctx;
  G.ctx = new Proxy(realCtx, {get: function (o, k) {
    if (k === 'fillText') return function (t) { texts.push(String(t)); return realCtx.fillText.apply(null, arguments); };
    return realCtx[k];
  }, set: function (o, k, v) { realCtx[k] = v; return true; }});
  function hudLines() { texts = []; G.renderFrame(); return texts.filter(function (t) { return t.indexOf('R:') === 0; }); }
  G.settings.showFPS = false; var hidden = hudLines();
  G.settings.showFPS = true; var shown = hudLines();
  G.applyRenderPreset('legacy'); var legacyLine = hudLines(); G.applyRenderPreset('recommended');
  G.setRenderFeatures({structureTextures: false}); var noPassLine = hudLines(); G.applyRenderPreset('recommended');
  G.settings.showFPS = false; G.ctx = realCtx;
  // Restated in Stage E2: structureTextures ships ON in Recommended, and this
  // host's getImageData returns alpha 0, so the texture catalog cannot build
  // and the frame stays flat with its reason on the line ('flat:catalog').
  // The pre-E2 '-' (no texture pass this frame) is still pinned by Legacy and
  // by Recommended with structureTextures off (Custom). The engaged format
  // (f<faces> m<mean>) is checked in world_textures.js, which has a catalog.
  check('with Show FPS on, the canvas HUD adds the compact render line (hidden with it off): Rec flat:catalog headless, Legacy and textures-off read -',
    hidden.length === 0 && JSON.stringify(shown) === '["R:Rec TEX flat:catalog fb 0"]' && JSON.stringify(legacyLine) === '["R:Legacy TEX - fb 0"]' &&
    JSON.stringify(noPassLine) === '["R:Custom TEX - fb 0"]',
    {hidden: hidden, shown: shown, legacy: legacyLine, noPass: noPassLine});
  var stats = G.getRenderFeatureStats();
  check('getRenderFeatureStats reports preset, features, textures, rows, canvas, actions and frame counters',
    stats.preset === 'recommended' && stats.features.labProbe === true && stats.textures === true && stats.fullscreenRows === 'native' &&
    stats.canvas === '360x240' && stats.actions.indexOf('goToNearestLandmark') >= 0 && stats.frame.labCounter === 3, stats);

  // ── Presentation-only replay: flipping presets never touches simulation ──
  function tag(object, id) { try { Object.defineProperty(object, '__replayId', {value: id, enumerable: false}); } catch (e) {} }
  function r6(v) { return typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v; }
  function snapshot() {
    return JSON.stringify({seed: G.WORLD_SEED, origin: [G.windowOriginX, G.windowOriginY],
      pos: [r6(G.pos.x), r6(G.pos.y), r6(G.pos.floorZ)], vel: [r6(G.vel.x), r6(G.vel.y)],
      cam: [r6(G.cam.x), r6(G.cam.y), r6(G.cam.z), r6(G.cam.ang), r6(G.cam.pitch)],
      health: r6(G.health), mana: r6(G.mana), time: r6(G.gameTimeNow()),
      enemies: G.enemies.map(function (e) { return [r6(e.x), r6(e.y), r6(e.z), r6(e.health), e.attackState, r6(e.facing)]; }),
      chests: G.treasureChests.map(function (c) { return [r6(c.x), r6(c.y), c.tier, c.gold, !!c.collected, !!c.opened, c._chunkKey]; }),
      spawners: G.enemySpawners.map(function (s) { return [r6(s.x), r6(s.y), s.hp, s.active, s.spawnCount]; }),
      projectiles: G.projectiles.length, chunks: Object.keys(G.chunks).sort(), assembled: assembled});
  }
  var assembled = 0, realAssemble = G.assembleWindow;
  G.assembleWindow = function () { assembled++; return realAssemble.apply(null, arguments); };
  function replay(flip) {
    G._gameClockOriginMs = null; G._gameClockElapsedMs = 0; G._presentationRandomState = 1234567;
    H.clock.seed = 0x5eed1234;
    H.startEndless(2024);
    G.applyRenderPreset('recommended');
    assembled = 0;
    var start = {pos: G.pos, grid: G.grid, mesh: G.floorMesh, enemies: G.enemies.slice(), x: G.pos.x, y: G.pos.y};
    start.enemies.forEach(function (e, i) { tag(e, i); });
    var random0 = H.clock.randomCalls, calls = [], presses = 0, presets = [];
    skyDrawn = 0;
    G.kbState.up = true;
    for (var t = 0; t < 240; t++) {
      if (flip && t > 0 && t % 30 === 0) { H.fire(H.document, 'keydown', {key: 'g', target: H.canvas}); presses++; }
      // Forward 90 ticks, strafe 90, then idle: inside the spawn chunk, so the
      // window never legitimately re-centres and object identity is meaningful.
      if (t === 90) { G.kbState.up = false; G.kbState.left = true; }
      if (t === 180) G.kbState.left = false;
      G.runSimulationTick(1 / 60);
      H.count(true); G.renderFrame(); calls.push(H.count(false).calls);
      presets.push(G.renderPresetName());
    }
    G.kbState.left = false;
    var identity = G.pos === start.pos && G.grid === start.grid && G.floorMesh === start.mesh &&
      start.enemies.every(function (e) { return G.enemies.indexOf(e) >= 0; });
    return {state: snapshot(), random: H.clock.randomCalls - random0, calls: calls, presses: presses, presets: presets,
      identity: identity, moved: Math.hypot(G.pos.x - start.x, G.pos.y - start.y), enemies: start.enemies.length,
      assembled: assembled, sky: skyDrawn, legacyFrames: presets.filter(function (p) { return p === 'legacy'; }).length};
  }
  if (__argv.indexOf('--skip-replay') < 0) {
  var steady = replay(false), flipped = replay(true), steadyAgain = replay(false);
  G.applyRenderPreset('recommended');
  // Draw-call counts are not compared between runs: presentation caches (the
  // 5-frame light-grid phase, lazily built artwork) legitimately differ.
  check('replay setup is deterministic and non-vacuous: two steady runs match, the player walks, enemies and RNG draws exist',
    steady.state === steadyAgain.state && steady.random === steadyAgain.random && steady.moved > 30 && steady.enemies > 0 && steady.random > 0 &&
    steady.identity && steady.assembled === 0,
    {moved: steady.moved, enemies: steady.enemies, random: [steady.random, steadyAgain.random], same: steady.state === steadyAgain.state,
      identity: steady.identity, assembled: steady.assembled});
  check('flipping presets with G every 30 ticks really changes drawing (7 presses; every Legacy frame skips the lab-probed sky)',
    flipped.presses === 7 && flipped.legacyFrames === 120 && steady.sky === 240 && flipped.sky === 240 - flipped.legacyFrames,
    {presses: flipped.presses, legacyFrames: flipped.legacyFrames, sky: [steady.sky, flipped.sky]});
  check('presentation only: 240 ticks with preset flips leave pos, cam, enemies, seed, RNG draws and chest/spawner records identical',
    flipped.state === steady.state && flipped.random === steady.random && flipped.identity && steady.identity,
    {random: [steady.random, flipped.random], identity: [steady.identity, flipped.identity],
      first: (function () { for (var i = 0; i < steady.state.length; i++) if (steady.state[i] !== flipped.state[i]) return steady.state.slice(Math.max(0, i - 60), i + 60) + ' || ' + flipped.state.slice(Math.max(0, i - 60), i + 60); return null; }())});
  }
  G.drawSkybox3D = realSky; G.beginSceneDepthFrame = realDepth; G.beginRenderFrameStats = realStats; G.assembleWindow = realAssemble;

  // ── Finder through the row, now in a world ──
  G.toasts.length = 0;
  H.fire(buttons[0], 'click');
  check('the row finder button teleports in Endless and reports the landing', /^Landed \d+ u outside (a|an) /.test(controls().status.textContent),
    controls().status.textContent);

  // ── Developer lab core (tools/game/render-lab/00-core.js) headless smoke ──
  if (__argv.indexOf('--skip-lab') < 0) {
  var hostNow = Date.now, hostRandom = Math.random;
  (0, eval)(slurp('tools/game/render-lab/00-core.js'));
  var loopGen = G._loopGen, labSeed = G.RenderLab.startEndless(424242);
  var placed = G.RenderLab.place(G.pos.x + 24, G.pos.y, 1.25, 0.1);
  check('lab starts a steered Endless seed, stops the game loop and places the camera on its support',
    labSeed === 424242 && G.WORLD_SEED === 424242 && G._loopGen > loopGen && G.cam.ang === 1.25 && G.cam.pitch === 0.1 &&
    G.cam.x === placed.x && G.pos.floorZ === G.meshHeightToPlayerZ(G.meshLayerHeight(G.floorMesh,
      G.meshCellAt(G.pos.x, G.pos.y), G.getTopWalkableLayerIdx(Math.floor(G.pos.x / 12), Math.floor(G.pos.y / 12)))));
  var abbaResult = null;
  H.flushRaf();   // callbacks queued before the lab run (stale game loops) are not lab frames
  G.RenderLab.abba('legacy', 'recommended', {warmup: 2, measured: 3}, function (summary, run) { abbaResult = {summary: summary, run: run}; });
  var rafs = H.flushRaf(200);
  check('lab A/B/B/A runs 4 phases of warm-up plus measured frames, times stages and restores clocks',
    !!abbaResult && abbaResult.summary.pass && rafs === 20 && abbaResult.run.phases.length === 4 &&
    abbaResult.run.phases.every(function (p) { return p.renderMs.length === 3 && !!p.stages['draw()'] && !!p.stages.walls3D; }) &&
    abbaResult.run.phases.map(function (p) { return p.preset; }).join() === 'legacy,recommended,recommended,legacy' &&
    /^PASS A\/B\/B\/A/.test(abbaResult.summary.text) && Date.now === hostNow && Math.random === hostRandom,
    abbaResult && {rafs: rafs, pass: abbaResult.summary.pass, frames: abbaResult.run.phases.map(function (p) { return p.renderMs.length; }),
      presets: abbaResult.run.phases.map(function (p) { return p.preset; }), clocks: [Date.now === hostNow, Math.random === hostRandom]});
  var gRun = null;
  G.RenderLab.gPressRun(24, 6, function (r) { gRun = r; });
  H.flushRaf(100);
  check('lab G-press run presses G through the page listener and counts render errors',
    !!gRun && gRun.pass && gRun.presses === 3 && gRun.ptErrors === 0 && gRun.consoleErrors === 0 && Object.keys(gRun.presets).length === 2, gRun);
  check('lab fullscreen report says when the canvas is not fullscreen', /^NOT FULLSCREEN canvas 360x240/.test(G.RenderLab.fullscreenReport()));
  }
  check('no console errors across the whole run', H.errors.length === 0, H.errors.slice(0, 3));
  out('RENDER_FEATURES_RESULT ' + (failed ? 'FAIL ' : 'PASS ') + checked + ' failed ' + failed);
}());
undefined;
