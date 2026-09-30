// Particle render contracts (unified effects V1, slice S2b: the render side).
// A full-game host loads the real manifest; the Canvas is a recording context
// that honours save/restore, alpha, composite and clips, and scene depth is
// the real buffer, written with the production depth helpers. Every case
// installs its own state with a test-local recipe table compiled by the real
// compileFxRecipes (spec 11.1; C3's second run: the shipping table), and
// places particles at chosen screen points.
// Risks covered: a depth fast path that disagrees with the billboard mask
// (C1), a tile summary that calls hidden pixels visible (C1 tiles), particles
// drawn through terrain or under a stall (C2), streaks through walls (C3;
// its second run draws the shipping rain recipe, S7),
// shadow blur and leaked Canvas state (C4), batches that drop, duplicate or
// restyle particles (C5), unbounded exact clips (C6), a glow that ignores the
// terrain in front of it (C6 corona), lit particles that ignore night (C7),
// uncull 2D particles (C8), per-particle clip regressions (C9, T20), an
// in-game Effects page that leaves its panel or does not switch (C11), a
// paused toggle that waits for a tick (C12), empty stages that touch the
// Canvas and a Legacy ambient that changes (C13), and presentation writing the
// pool or depending on frame cadence or the governor (B9). Added in the S2b
// fix: a tiles clip that leaks, drops visible pixels, ignores its budget or
// grows with the item's area (C2, C6), resting particles drawn off their
// support (C2), receding and long streaks (C3), camera-local particles drawn
// in 2D (C4), the corona radius, caps that are not counted (C6), cave ambient,
// fog and night boost (C7), a 2D pass that refills an open frame (C8), a
// scratch that reallocates as the count rises (C9), drawn positions off the
// interpolation timeline (B8 drawn), and a governor that thins pinned pools,
// combat or feedback, or reacts to legacy stages (governor). Added in the S8
// fix: a hidden torch glow past the screen edge that flares up, or an open
// one that pops off (corona samples off the frame), glows culled at their
// centre or kept with no pixel, wall torches tested at straight-line
// distance, hidden near lights that take the nearest-12 slots, the 10 px
// floor, the flicker law, the mixed-item cap under the tiles override, a
// grid-clipped glow that leaks past one grid cell (C6 torch), and a frame
// loop that never reaches the torch stage (C10 frame). Added in S9: a
// governor blind to the raster of a large canvas, one that takes canvas
// size alone for load, and one fed the pixels of pinned (studio, profile)
// passes (governor raster); point reads above 1.5 px, an off-frame centre
// visible past the mixed cap, an empty tile box drawn, tiles without the
// depth bias and far dots on the tile summary (S9 occlusion). Added in the
// S9 fix: raster pricing wrong for any primitive category (sprites, halos,
// rings, chips, rect dots, discs, sampled streak runs, clipped items, the
// overlay pass), a governor input that is not JS time plus raster, a 2D
// view whose pixels and fx2D time the governor never sees, a glow cap
// that ignores the governor (governor raster categories), and items up to
// 12 px sent to tiles once the 12-24 px footprint budget is spent (S9 fix
// occlusion).
// Oracles: authored depth geometry, the production withSceneDepthBillboard
// decision, a full per-pixel scan written here, analytic projection restated
// here, recorded command streams, the settings panel geometry restated here,
// the engine's own ticked positions, and the spec's budget rules applied to
// pixel counts taken here.
// Mutations are applied to slurped sources only (anchors match exactly once):
//   --footprint-open-interval --footprint-drop-bias --tile-min-max-swapped
//   --tile-summary-sampled    --skip-depth          --combat-before-stalls
//   --segment-endpoints-only  --particle-shadow-blur --leak-composite
//   --bucket-collision        --no-batch            --ignore-mask-budget
//   --leak-over-budget        --corona-ignores-depth --emissive-lit
//   --no-2d-cull              --per-particle-billboard --fx-page-offpanel
//   --toggle-in-tick-only     --empty-stage-save    --render-mutates-pool
//   --governor-scales-spawn   --tiles-no-merge      --tiles-drop-mixed
//   --tiles-ignore-budget     --tiles-leak-over-budget --corona-full-radius
//   --segment-const-depth     --under-uses-surface  --no-fog
//   --no-night-boost          --glow-cap-ignored    --mixed-cap-ignored
//   --foot-budget-ignored     --eye-in-2d-draw      --thin-ignores-pin
//   --thin-every-class        --governor-counts-legacy --governor-frozen
//   --draw-no-backproject     --draw-ignores-snap   --scratch-exact-fit
//   --rest-drawn-lifted       --2d-reopens-frame    --rain-point-occl
//   --streak-short            --glow-width-radius   --torch-stage-always-new
//   --torch-keep-first        --flicker-index       --flicker-local
//   --torch-save-always       --corona-offframe-visible --corona-offframe-hidden
//   --torch-cull-centre       --torch-cull-open     --torch-depth-distance
//   --torch-occlusion-after-selection --torch-no-min-radius --flicker-fast
//   --torch-mixed-cap-ignored --torch-over-cap-hidden --torch-stage-bypassed
//   --governor-raster-blind --raster-canvas-area    --raster-counts-pinned
//   --point-up-to-3px       --over-cap-edge-visible --tile-empty-box-visible
//   --tile-no-bias          --far-dot-tiles
// S9 fix (governor raster categories):
//   --raster-sprite-uncounted --raster-sprite-r2    --raster-ring-no-width
//   --raster-chip-zero      --raster-rect-r2        --raster-disc-linear
//   --raster-sampled-full-len --raster-skip-mixed   --raster-skip-overlay
//   --raster-skip-2d        --governor-ignores-2d   --governor-input-max
//   --governor-input-half   --glow-cap-not-scaled   --small-foot-budgeted
(function () {
  var G = (0, eval)('this'), output = (__engine === 'node' || __engine === 'deno') ? console.log.bind(console) : __out;
  var checked = 0, failed = 0, loadErrors = [], warnings = [], originalRandom = Math.random;
  function has(flag) { return __argv.indexOf(flag) >= 0; }
  var mutationRun = __argv.some(function (a) { return /^--/.test(a); });
  // A mutation run aimed at another case skips the slow cases and says so.
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
  G.__renderSource = function (path, source) {
    if (path === 'src/14-fx-render.js') {
      source = mutate(source, '--footprint-open-interval',
        'var sx = Math.max(0, Math.ceil(x0 - 0.5)), ex = Math.min(W - 1, Math.floor(x1 - 0.5));\n  var sy = Math.max(0, Math.ceil(y0 - 0.5)), ey = Math.min(H - 1, Math.floor(y1 - 0.5)), vis = 0, hid = 0;\n  for (var y',
        'var sx = Math.max(0, Math.floor(x0 - 0.5) + 1), ex = Math.min(W - 1, Math.ceil(x1 - 0.5) - 1);\n  var sy = Math.max(0, Math.floor(y0 - 0.5) + 1), ey = Math.min(H - 1, Math.ceil(y1 - 0.5) - 1), vis = 0, hid = 0;\n  for (var y');
      source = mutate(source, '--footprint-drop-bias', 'if (iz * (1 + inv * 0.15) + 1e-9 >= inv) vis++; else hid++;', 'if (iz + 1e-9 >= inv) vis++; else hid++;');
      source = mutate(source, '--tile-min-max-swapped', 'if (iz * (1 + hi * 0.15) + 1e-9 >= hi) vis = 1;\n    else if (iz * (1 + lo * 0.15) + 1e-9 < lo) hid = 1;',
        'if (iz * (1 + lo * 0.15) + 1e-9 >= lo) vis = 1;\n    else if (iz * (1 + hi * 0.15) + 1e-9 < hi) hid = 1;');
      source = mutate(source, '--tile-summary-sampled', 'for (var y = y0; y < y1; y++) for (var j = y * W + x0, e = j + x1 - x0; j < e; j++) {',
        'for (var y = y0; y < y1; y += 7) for (var j = y * W + x0, e = j + x1 - x0; j < e; j += 7) {');
      source = mutate(source, '--skip-depth', 'var cls = 1, aux = 0, occ = space || twoD ? FXO_NONE : R.occ[r];', 'var cls = 1, aux = 0, occ = FXO_NONE;');
      source = mutate(source, '--segment-endpoints-only', 'ks = ks < 2 ? 2 : ks > 9 ? 9 : ks;', 'ks = 2;');
      source = mutate(source, '--particle-shadow-blur', 'ctx.save(); _fxSaved = true; ctx.shadowBlur = 0;', 'ctx.save(); _fxSaved = true; ctx.shadowBlur = 4;');
      source = mutate(source, '--leak-composite', 'ctx.save(); _fxSaved = true;', '_fxSaved = true;');
      source = mutate(source, '--leak-composite', 'function fxClose() { if (_fxSaved) { _fxSaved = false; ctx.restore(); } }', 'function fxClose() { _fxSaved = false; }');
      source = mutate(source, '--bucket-collision', 'for (var h = (Math.imul(key, 0x9e3779b1) >>> 21) & 2047;', 'for (var h = (Math.imul(key & 0xffff, 0x9e3779b1) >>> 21) & 2047;');
      source = mutate(source, '--bucket-collision', 'if (_fxHashKey[h] === key) return _fxHashVal[h];', 'if ((_fxHashKey[h] & 0xffff) === (key & 0xffff)) return _fxHashVal[h];');
      source = mutate(source, '--no-batch', 'var k = _fxItems++, b = mixed ? -2 : fxBucket(key);', 'var k = _fxItems++, b = mixed ? -2 : -1;');
      source = mutate(source, '--ignore-mask-budget', '<= F.maskLeft) { F.maskLeft -= cost; st.maskPx += cost; }', '<= Infinity) { F.maskLeft -= cost; st.maskPx += cost; }');
      source = mutate(source, '--leak-over-budget', 'else { mmode = 1; st.grid++; }', 'else { cls = fxDepthPoint(sx, ty, iz, 0); if (!cls) continue; }');
      source = mutate(source, '--corona-ignores-depth', 'function fxCorona(x, y, iz, q) {\n  return fxDepthNearest', 'function fxCorona(x, y, iz, q) {\n  return 5; return fxDepthNearest');
      source = mutate(source, '--emissive-lit', 'if (lt === FXL_AMBIENT || lt === FXL_GRID) L =', 'if (lt === FXL_AMBIENT || lt === FXL_GRID || lt === FXL_EMISSIVE) L =');
      source = mutate(source, '--no-2d-cull', '    if (bx1 < 0 || bx0 > W || by1 < 0 || by0 > H) { st.offscreen++; continue; }\n', '');
      source = mutate(source, '--per-particle-billboard', '    var mmode = 0, cost;\n    if (cls === 2) {', '    var mmode = 0, cost;\n    if (!space && !twoD) cls = 2;\n    if (cls === 2) {');
      source = mutate(source, '--fx-page-offpanel', 'var rowY = curY;', 'var rowY = curY + 120;');
      source = mutate(source, '--toggle-in-tick-only', "G.gate[r] = t && !effectPresetOn(C.TOGGLES[t]) || f && effectFamilyMode(C.FAMILIES[f]) !== 'new' ? 0 : 1;", 'G.gate[r] = S.gate[r];');
      source = mutate(source, '--empty-stage-save', '  if (!S || !S.count) return;\n  try { fxRunPass(S, mode); }', '  try { fxOpen(); if (!S || !S.count) return; fxRunPass(S, mode); }');
      source = mutate(source, '--render-mutates-pool', 'var alpha = S.alpha[i] * fxEnvelope(R, r, t, a, S.phase[i]);', 'var alpha = S.alpha[i] * fxEnvelope(R, r, t, a, S.phase[i] += 0.01);');
      source = mutate(source, '--governor-scales-spawn', '  F.g = !S || S.pinned ? 1 : G.governor;\n', '  F.g = !S || S.pinned ? 1 : G.governor;\n  if (S) S.B = Math.floor(S.B * F.g);\n');
      source = mutate(source, '--tiles-no-merge', 'if (fxVis(_fxTileMax[t], iz)) { if (run < 0) run = ax; end = bx; continue; }',
        'if (fxVis(_fxTileMax[t], iz)) { ctx.rect(ax, ay, bx - ax + 1, by - ay + 1); n++; continue; }');
      source = mutate(source, '--tiles-drop-mixed', 'var mixed = fxVis(_fxTileMin[t], iz),', 'var mixed = false,');
      source = mutate(source, '--tiles-ignore-budget', 'exact = mixed && cnt <= F.maskLeft,', 'exact = mixed,');
      source = mutate(source, '--tiles-leak-over-budget', 'else { gridded = true; n += fxGridPath(sx, sy, ex, ey, ax, ay, bx, by, iz); }',
        'else { ctx.rect(ax, ay, bx - ax + 1, by - ay + 1); n++; }');
      source = mutate(source, '--corona-full-radius', 'fxCorona(sx, ty, iz, rr * 0.5)', 'fxCorona(sx, ty, iz, rr)');
      source = mutate(source, '--segment-const-depth', 'iz + (iz2 - iz) * u, 0)', 'iz, 0)');
      source = mutate(source, '--under-uses-surface', 'a = under ? F.ambC : F.ambS', 'a = F.ambS');
      source = mutate(source, '--no-fog', 'alpha *= fog > ff ? fog : ff; }', '}');
      source = mutate(source, '--no-night-boost', 'alpha *= 1 + R.nightBoost[r] * F.night;', 'alpha *= 1;');
      source = mutate(source, '--glow-cap-ignored', 'capped = halo && F.glowLeft <= 0', 'capped = false');
      source = mutate(source, '--mixed-cap-ignored', 'if (F.mixedLeft <= 0) { st.mixedSkipped++;', 'if (false) { st.mixedSkipped++;');
      source = mutate(source, '--foot-budget-ignored', 'hx <= 12 || hx <= 24 && F.footLeft > 0 ? FXO_FOOT : FXO_TILES', 'hx <= 24 ? FXO_FOOT : FXO_TILES');
      source = mutate(source, '--eye-in-2d-draw', 'if (twoD) { if (space || R.view2D[r] === FXV_NONE) continue; }', 'if (twoD) { if (R.view2D[r] === FXV_NONE) continue; }');
      source = mutate(source, '--thin-ignores-pin', '(S.seedA[i] & 1023) >= F.g * 1024)', '(S.seedA[i] & 1023) >= _fxRender.governor * 1024)');
      source = mutate(source, '--thin-every-class', 'if (S.cls[i] <= 2 && (S.seedA[i]', 'if (S.cls[i] <= 4 && (S.seedA[i]');
      source = mutate(source, '--governor-counts-legacy',
        "(effectFamilyMode('ambient') === 'new' ? fxStageMs('ambientFX3D', prev) : 0) + (effectFamilyMode('torchGlow') === 'new' ? fxStageMs('torchGlow3D', prev) : 0)",
        "fxStageMs('ambientFX3D', prev) + fxStageMs('torchGlow3D', prev)");
      source = mutate(source, '--governor-frozen', 'if (G.ema > gv.targetMs) G.governor', 'if (false) G.governor');
      // S9 occlusion hand mutants: point reads up to 3 px, an off-frame
      // centre visible past the mixed cap, an empty tile box visible, tiles
      // without the depth bias, far dots tested on the tile summary.
      source = mutate(source, '--point-up-to-3px', 'occ = line ? FXO_SEG : hx <= 1.5 ? FXO_POINT :', 'occ = line ? FXO_SEG : hx <= 3 ? FXO_POINT :');
      source = mutate(source, '--over-cap-edge-visible', '      if (F.mixedLeft <= 0) { st.mixedSkipped++; cls = fxDepthPoint(sx, ty, iz, 0); if (!cls) continue; }',
        '      if (F.mixedLeft <= 0) { st.mixedSkipped++; cls = fxDepthPoint(sx, ty, iz, 1); if (!cls) continue; }');
      source = mutate(source, '--tile-empty-box-visible', '  if (sx > ex || sy > ey) return 0;\n  fxTilesReady(W, H);', '  if (sx > ex || sy > ey) return 1;\n  fxTilesReady(W, H);');
      source = mutate(source, '--tile-no-bias', '    if (iz * (1 + hi * 0.15) + 1e-9 >= hi) vis = 1;', '    if (iz + 1e-9 >= hi) vis = 1;');
      source = mutate(source, '--far-dot-tiles', '    else if (occ === FXO_SEG && !line) occ = FXO_POINT;', '    else if (occ === FXO_SEG && !line) occ = FXO_TILES;');
      // S9: the governor blind to raster (JS stage times only, as before S9);
      // its input weighted by canvas area instead of the pixels painted; the
      // pixels of pinned (studio, profile) passes fed to the live governor.
      source = mutate(source, '--governor-raster-blind', 'G.rasterMs = G.rasterAcc * gv.rasterMsPerMpx * 1e-6;', 'G.rasterMs = 0;');
      source = mutate(source, '--raster-canvas-area', 'G.input = last + G.rasterMs;', 'G.input = last * canvas.width * canvas.height / (CANVAS_BASE_W * CANVAS_BASE_H);');
      source = mutate(source, '--raster-counts-pinned', '  if (!S.pinned) G.rasterAcc += st.rasterPx - px0;', '  if (S) G.rasterAcc += st.rasterPx - px0;');
      // S9 fix (the S9 review's survivors): each primitive category priced
      // wrong or not at all (sprites, rings without their width, chips,
      // rect dots at a quarter, discs by radius, sampled streak runs at full
      // length), the mixed (clipped) items, the overlay pass or the 2D pass
      // left out of the governor's pixels, the fx2D stage left out of its
      // time, the input's two terms combined by max or with raster halved,
      // and a glow cap that ignores the governor.
      source = mutate(source, '--raster-sprite-uncounted', '      _fxStats.rasterPx += px;\n      return;\n    }\n    _fxStats.spriteFallback', '      return;\n    }\n    _fxStats.spriteFallback');
      source = mutate(source, '--raster-sprite-r2', 'ctx.drawImage(spr, X[k] - r, Y[k] - r, r * 2, r * 2); px += 4 * r * r; }', 'ctx.drawImage(spr, X[k] - r, Y[k] - r, r * 2, r * 2); px += r * r; }');
      source = mutate(source, '--raster-ring-no-width', 'px += 6.283185307179586 * Math.sqrt((RR[k] * RR[k] + X2[k] * X2[k]) / 2) * lw;',
        'px += 6.283185307179586 * Math.sqrt((RR[k] * RR[k] + X2[k] * X2[k]) / 2);');
      source = mutate(source, '--raster-chip-zero', '        px += 0.9725 * r * r;\n', '');
      source = mutate(source, '--raster-rect-r2', 'ctx.rect(X[k] - r, Y[k] - r, r * 2, r * 2); px += 4 * r * r; }', 'ctx.rect(X[k] - r, Y[k] - r, r * 2, r * 2); px += r * r; }');
      source = mutate(source, '--raster-disc-linear', 'px += 3.141592653589793 * r * r; }', 'px += 3.141592653589793 * r; }');
      source = mutate(source, '--raster-sampled-full-len', '      px += (u1 - u0) * len * lw;\n', '      px += len * lw;\n');
      source = mutate(source, '--raster-skip-mixed', '  for (var mi = 0; mi < _fxMixN; mi++) fxDrawMixed(mi);\n  if (!S.pinned) G.rasterAcc += st.rasterPx - px0;',
        '  if (!S.pinned) G.rasterAcc += st.rasterPx - px0;\n  for (var mi = 0; mi < _fxMixN; mi++) fxDrawMixed(mi);');
      source = mutate(source, '--raster-skip-overlay', '  if (!S.pinned) G.rasterAcc += st.rasterPx - px0;', '  if (!over && !S.pinned) G.rasterAcc += st.rasterPx - px0;');
      source = mutate(source, '--raster-skip-2d', '  if (!S.pinned) G.rasterAcc += st.rasterPx - px0;', '  if (!twoD && !S.pinned) G.rasterAcc += st.rasterPx - px0;');
      source = mutate(source, '--governor-ignores-2d', " + fxStageMs('fx2D', prev) +\n", " +\n");
      source = mutate(source, '--governor-input-max', 'G.input = last + G.rasterMs;', 'G.input = Math.max(last, G.rasterMs);');
      source = mutate(source, '--governor-input-half', 'G.input = last + G.rasterMs;', 'G.input = last + 0.5 * G.rasterMs;');
      source = mutate(source, '--glow-cap-not-scaled', 'F.glowLeft = Math.floor(cfg.glowPerFrame * F.g);', 'F.glowLeft = cfg.glowPerFrame;');
      // Items up to 12 px sent to tiles once the 12-24 px footprint budget is spent.
      source = mutate(source, '--small-foot-budgeted', 'occ = line ? FXO_SEG : hx <= 1.5 ? FXO_POINT : hx <= 12 || hx <= 24 && F.footLeft > 0 ? FXO_FOOT : FXO_TILES;',
        'occ = line ? FXO_SEG : hx <= 1.5 ? FXO_POINT : hx <= 24 && F.footLeft > 0 ? FXO_FOOT : FXO_TILES;');
      source = mutate(source, '--draw-no-backproject', 'var px = X[i] - VX[i] * b, py = Y[i] - VY[i] * b, pz = Z[i] - VZ[i] * b', 'var px = X[i], py = Y[i], pz = Z[i]');
      source = mutate(source, '--draw-ignores-snap', 'b = (fl & FX_SNAP) ? 0 : age < back ? age : back', 'b = age < back ? age : back');
      source = mutate(source, '--scratch-exact-fit', 'fxScratch(2 * S.cap);', 'fxScratch(2 * n);');
      source = mutate(source, '--rest-drawn-lifted', '} else if (!fxProject(space, px, py, pz)) { st.offscreen++; continue; }',
        '} else if (!fxProject(space, px, py, pz + up)) { st.offscreen++; continue; }');
      source = mutate(source, '--rest-drawn-lifted', 'iz = 1 / fwd; lift = up * F.projScale / fwd;', 'iz = 1 / fwd; lift = 0;');
      source = mutate(source, '--2d-reopens-frame', 'if (!(MODE3D && _fxFrame.threeD)) {', 'if (true) {');
      // S8 torch glow: the legacy width-based radius (18.5% larger at 16:9);
      // New mode for a Legacy family; the first 12 lights instead of the
      // nearest; a flicker phase keyed by list index (world-13) or by
      // window-local position; a stage that opens its state with no glow.
      source = mutate(source, '--glow-width-radius', 'R = Math.floor(ps * 0.24 * (sm / fwd));', 'R = Math.floor(w * 0.12 * (sm / fwd));');
      source = mutate(source, '--torch-stage-always-new', "  if (effectFamilyMode('torchGlow') === 'legacy') { drawTorchGlow3D(); return; }\n", '');
      source = mutate(source, '--torch-keep-first', 'if (n === FX_TORCH_GLOWS && d >= _fxTorchD[n - 1]) { st.torchDropped++; continue; }',
        'if (n === FX_TORCH_GLOWS) { st.torchDropped++; continue; }');
      source = mutate(source, '--flicker-index', 'qx = Math.round(L.x + ox), qy = Math.round(L.y + oy)', 'qx = lights.indexOf(L), qy = 0');
      source = mutate(source, '--flicker-local', 'qx = Math.round(L.x + ox), qy = Math.round(L.y + oy)', 'qx = Math.round(L.x), qy = Math.round(L.y)');
      source = mutate(source, '--torch-save-always', "  try { fxTorchGlows(); } catch (e) { effectFailure('render', e); }",
        "  try { fxOpen(); fxTorchGlows(); } catch (e) { effectFailure('render', e); }");
      // S8 review fixes. Corona samples off the depth frame counted visible
      // (a hidden light past the screen edge flares up) or hidden (a glow in
      // the open pops off as it leaves the screen); the torch cull at the
      // centre (no radius margin) or open (a glow covering no pixel kept);
      // the glow's depth as its straight-line distance (a wall torch off the
      // screen centre tests as behind its own wall); occlusion tested after
      // the nearest 12 are chosen (hidden near lights take the slots); no
      // 10 px floor; a 10x flicker; the mixed-item cap not spent, or an
      // over-cap mixed glow hidden instead of centre-gated.
      var clampLine = '  px = px < 0 ? 0 : px >= W ? W - 1 : px; py = py < 0 ? 0 : py >= H ? H - 1 : py;\n';
      source = mutate(source, '--corona-offframe-visible', clampLine, '  if (px < 0 || py < 0 || px >= W || py >= H) return 1;\n');
      source = mutate(source, '--corona-offframe-hidden', clampLine, '  if (px < 0 || py < 0 || px >= W || py >= H) return 0;\n');
      source = mutate(source, '--torch-cull-centre', 'if (sx + R <= 0 || sx - R >= w || sy + R <= 0 || sy - R >= h)', 'if (sx < 0 || sx > w || sy < 0 || sy > h)');
      source = mutate(source, '--torch-cull-open', 'if (sx + R <= 0 || sx - R >= w || sy + R <= 0 || sy - R >= h)', 'if (sx + R < 0 || sx - R > w || sy + R < 0 || sy - R > h)');
      source = mutate(source, '--torch-depth-distance', 'var iz = 1 / fwd, qx = Math.round(L.x + ox)', 'var iz = 1 / d, qx = Math.round(L.x + ox)');
      source = mutate(source, '--torch-occlusion-after-selection', '      if (!cls || alpha < 0.002) { st.torchHidden++; continue; }\n      if (n === FX_TORCH_GLOWS) st.torchDropped++;',
        '      if (n === FX_TORCH_GLOWS) st.torchDropped++;');
      source = mutate(source, '--torch-no-min-radius', 'R = R < 10 ? 10 : R > cap ? cap : R;', 'R = R > cap ? cap : R;');
      source = mutate(source, '--flicker-fast', 'Math.sin(now * 0.007 + 6.283185307179586', 'Math.sin(now * 0.07 + 6.283185307179586');
      source = mutate(source, '--torch-mixed-cap-ignored', '      F.mixedLeft--;\n      var W = _sceneDepthW', '      var W = _sceneDepthW');
      source = mutate(source, '--torch-over-cap-hidden', 'if (cls === 2 && F.mixedLeft <= 0) { st.mixedSkipped++; cls = fxDepthPoint(sx, sy, iz, 0); }',
        'if (cls === 2 && F.mixedLeft <= 0) { st.mixedSkipped++; cls = 0; }');
    }
    if (path === 'src/11-fx-recipes.js') {
      // Shipping rain (S7) tested at its head only, or drawn 14 x too short.
      source = mutate(source, '--rain-point-occl', "    occlusion:'segment', lighting:'lightGrid', view2D:'none', mode2D:'splashOnly',",
        "    occlusion:'point', lighting:'lightGrid', view2D:'none', mode2D:'splashOnly',");
      source = mutate(source, '--streak-short', "render:{primitive:'streak', size:[0.3, 0.3], streakSeconds:0.028,", "render:{primitive:'streak', size:[0.3, 0.3], streakSeconds:0.002,");
    }
    // S8 review fix: the frame loop's torchGlow3D stage calls the legacy
    // drawer directly, so New mode never reaches the game.
    if (path === 'src/21-frame-loop.js') source = mutate(source, '--torch-stage-bypassed',
      "_pt('torchGlow3D', function(){ if (typeof drawTorchGlowStage3D === 'function') drawTorchGlowStage3D(); else drawTorchGlow3D(); });",
      "_pt('torchGlow3D', function(){ drawTorchGlow3D(); });");
    if (path === 'src/21-frame-loop.js' && has('--combat-before-stalls')) {
      var line = "    _pt('fxCombat3D', function(){ if (typeof drawEffectLayer3D === 'function') drawEffectLayer3D(1); });\n";
      source = mutate(source, '--combat-before-stalls', line, '');
      source = mutate(source, '--combat-before-stalls', "    _pt('impacts3D', function(){ drawImpacts3D(); });\n", "    _pt('impacts3D', function(){ drawImpacts3D(); });\n" + line);
    }
    return source;
  };
  G.__renderLoad = function (path) {
    try { (0, eval)(G.__renderSource(path, slurp('assets/games/' + path))); } catch (e) {
      if (/^MUTATION_ANCHOR/.test(e.message)) throw e;
      loadErrors.push(path + ': ' + e.message);
    }
  };
  var host = slurp('tools/game/tests/cave_occlusion_integration.js');
  var end = host.indexOf('  function check(name, okay) {');
  if (end < 0) throw Error('SETUP render host boundary missing');
  host = host.slice(0, end);
  var load = "manifest.parts.MAIN.forEach(function (path) { (0, eval)(slurp('assets/games/' + path)); });";
  if (host.split(load).length !== 2) throw Error('SETUP render manifest boundary missing');
  host = host.replace(load, 'manifest.parts.MAIN.forEach(G.__renderLoad);');
  (0, eval)(host + 'G.__renderErrors = errors; }());');
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
  if (loadErrors.length) { output('PARTICLE_RENDER_RESULT FAIL ' + failed + '/' + checked + ' (load failed)'); return; }
  // Merge with the 3D integration: the torches below are synthetic sprite-era
  // lights 0.5 u off their wall with no model drawn, so wall prop models stay
  // off and the torch-glow corona tests the light. The base checks pass either
  // way (no model writes depth here); the pin is load-bearing for
  // --torch-depth-distance, whose named cause reads the corona at the light's
  // forward depth: with models on the corona re-derives its depth at the
  // flame point and never sees the mutated one. The modelled torch's
  // flame-point test and its forward-depth mutation are in wall_decor_driver.js (glow).
  if (typeof G.setRenderFeatures === 'function') G.setRenderFeatures({wallPropModels: false});

  // ── Recording Canvas: calls, property sets, a real save/restore stack for
  // the drawing state, the active clip, and every fill/stroke/image with the
  // path and style it used. Unknown methods fall through to the host stub.
  var hostCtx = G.ctx, STATE0 = {globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000000', strokeStyle: '#000000',
    lineWidth: 1, shadowBlur: 0, shadowColor: 'rgba(0,0,0,0)', font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
    lineCap: 'butt', lineJoin: 'miter', imageSmoothingEnabled: true, filter: 'none', miterLimit: 10, lineDashOffset: 0};
  var STATE_KEYS = Object.keys(STATE0), PATH = {moveTo: 1, lineTo: 1, arc: 1, rect: 1, ellipse: 1, closePath: 1, arcTo: 1, quadraticCurveTo: 1, bezierCurveTo: 1};
  var rec = {logging: false};
  var state = Object.assign({}, STATE0);
  function arg(v) { return v && typeof v === 'object' ? (typeof v.width === 'number' ? 'image' + v.width : 'object') : v; }
  function drawRecord(kind, extra) {
    var d = {kind: kind, alpha: state.globalAlpha, op: state.globalCompositeOperation, clipped: rec.clipped, path: rec.path.slice(), seq: rec.calls};
    for (var k in extra) d[k] = extra[k];
    rec.draws.push(d);
  }
  var own = {
    save: function () { rec.stack.push({s: STATE_KEYS.map(function (k) { return state[k]; }), clipped: rec.clipped}); },
    restore: function () {
      var f = rec.stack.pop();
      if (!f) { rec.underflow++; return; }
      STATE_KEYS.forEach(function (k, i) { state[k] = f.s[i]; }); rec.clipped = f.clipped;
    },
    beginPath: function () { rec.path = []; },
    clip: function () { rec.clips++; rec.clipped = true; rec.clipPaths.push(rec.path.slice()); },
    fill: function () { drawRecord('fill', {style: state.fillStyle}); },
    stroke: function () { drawRecord('stroke', {style: state.strokeStyle, width: state.lineWidth}); },
    drawImage: function (img, x, y, w, h) { drawRecord('image', {img: img && img.width, x: x, y: y, w: w, h: h, src: rec.imgs.push(img) - 1}); },
    fillRect: function (x, y, w, h) { drawRecord('fillRect', {style: state.fillStyle, x: x, y: y, w: w, h: h}); },
    strokeRect: function (x, y, w, h) { drawRecord('strokeRect', {style: state.strokeStyle, x: x, y: y, w: w, h: h}); },
    fillText: function (t, x, y) { rec.texts.push({text: String(t), x: x, y: y, font: state.font, align: state.textAlign}); },
    measureText: function (t) { var m = /(\d+(?:\.\d+)?)px/.exec(state.font); return {width: String(t).length * (m ? +m[1] : 10) * 0.55}; },
    createRadialGradient: function () {                  // recorded (C10): its circles and colour stops
      var g = {args: Array.prototype.slice.call(arguments), stops: []};
      rec.gradients.push(g);
      return {addColorStop: function (o, c) { g.stops.push([o, c]); }, rec: g};
    },
    createLinearGradient: function () { return {addColorStop: function () {}}; }
  };
  var wrappers = {};
  var recCtx = new Proxy(state, {
    get: function (t, k) {
      if (typeof k !== 'string') return undefined;
      if (Object.prototype.hasOwnProperty.call(state, k)) return state[k];
      if (wrappers[k]) return wrappers[k];
      var impl = own[k] || (PATH[k] ? function () { rec.path.push([k].concat(Array.prototype.slice.call(arguments))); } : null);
      var hv = hostCtx[k];
      if (!impl && typeof hv !== 'function') return hv;
      wrappers[k] = function () {
        rec.calls++; if (PATH[k]) rec.pathCalls++;
        if (rec.logging) { var a = [k]; for (var i = 0; i < arguments.length; i++) a.push(arg(arguments[i])); rec.log.push(a); }
        return impl ? impl.apply(null, arguments) : hv.apply(hostCtx, arguments);
      };
      return wrappers[k];
    },
    set: function (t, k, v) {
      rec.sets++; if (k === 'shadowBlur' && v > 0) rec.blurSets++;
      if (rec.logging) rec.log.push(['=', k, arg(v)]);
      state[k] = v; return true;
    }
  });
  function recReset() {
    rec.calls = rec.sets = rec.clips = rec.blurSets = rec.pathCalls = rec.underflow = 0;
    rec.log = []; rec.draws = []; rec.texts = []; rec.path = []; rec.stack = []; rec.clipPaths = []; rec.clipped = false;
    rec.gradients = []; rec.imgs = [];
  }
  recReset();
  G.ctx = recCtx;

  // ── Test-local recipe table (compiled by the shipping compiler) ─────────
  function R(extra) {
    var base = {class: 'combat', layer: 'combat', trigger: {api: true}, color: {material: 'fxDebris', roles: ['spark']}, motion: {model: 'static'},
      life: {seconds: [100, 100]}, render: {primitive: 'dot', size: [0.5, 0.5]}, lighting: 'none', view2D: 'dot'};
    Object.keys(extra).forEach(function (k) { base[k] = extra[k]; });
    return base;
  }
  var TEST_RECIPES = {
    'r.dot': R({}),
    'r.dotB': R({color: {material: 'fxFeedback', roles: ['mana']}}),
    'r.dotC': R({color: {material: 'fxFeedback', roles: ['tome']}}),
    'r.world': R({layer: 'world'}),
    'r.point': R({occlusion: 'point'}),
    'r.foot': R({occlusion: 'footprint'}),
    'r.tiles': R({occlusion: 'tiles', render: {primitive: 'dot', size: [0.5, 0.5], maxPx: 100}}),
    'r.clip': R({occlusion: 'clip'}),
    'r.corona': R({render: {primitive: 'glowDot', size: [0.5, 0.5], glow: 2, glowAlpha: 0.5, blend: 'add'}, occlusion: 'corona'}),
    'r.glow': R({layer: 'world', render: {primitive: 'glowDot', size: [0.5, 0.5], glow: 3, glowAlpha: 0.4, blend: 'add'}}),
    'r.streak': R({render: {primitive: 'streak', size: [0.3, 0.3], streakSeconds: 0.05}, view2D: 'line'}),
    'r.bone': R({color: {material: 'fxBone', roles: ['enemy']}, render: {primitive: 'segment', size: [0.5, 0.5], length: [10, 10]}, view2D: 'segment'}),
    'r.chip': R({color: {material: 'fxDebris', roles: ['chip']}, render: {primitive: 'chip', size: [0.5, 0.5]}}),
    'r.chipS': R({render: {primitive: 'chip', size: [0.5, 0.5]}}),
    'r.puff': R({layer: 'world', color: {material: 'fxDebris', roles: ['dust']}, render: {primitive: 'puff', size: [1, 1]}, view2D: 'puff'}),
    'r.ring': R({layer: 'world', color: {material: 'fxWeather', roles: ['splash']}, render: {primitive: 'ring', size: [1, 1]}, view2D: 'ring'}),
    'r.lit': R({color: {material: 'fxMote', roles: ['dust']}, lighting: 'ambient'}),
    'r.emissive': R({color: {material: 'fxMote', roles: ['firefly']}, lighting: 'emissive', nightBoost: 0.3}),
    'r.debris': R({toggle: 'fxDebris', spawn: {shape: 'disc', radius: [0, 4]}}),
    'r.amb': R({class: 'ambient', layer: 'world', color: {material: 'fxMote', roles: ['dust']}}),
    'r.eye': R({class: 'feedback', place: 'eye', occlusion: 'none', view2D: 'none', layer: 'overlay',
      spawn: {shape: 'ring', radius: [1, 2]}, render: {primitive: 'glowDot', size: [0.5, 0.5], glow: 3, glowAlpha: 0.4, blend: 'add'}}),
    'r.screen': R({class: 'locomotion', place: 'screen', occlusion: 'none', view2D: 'none', layer: 'overlay', render: {primitive: 'puff', size: [0.05, 0.05]}}),
    'r.walker': R({spawn: {direction: 'along', speed: [600, 600]}, motion: {model: 'drift'}, life: {seconds: [10, 10]}}),
    'r.bouncer': R({spawn: {direction: 'along', speed: [60, 60], up: [40, 40]}, motion: {model: 'ballistic', gravity: 420, drag: 0.4},
      collision: {mode: 'bounce', stratum: 'reference', restitution: 0.35, friction: 0.6, bounces: 2, restSeconds: [5, 5]}, life: {seconds: [10, 10]}}),
    'r.clsW': R({class: 'weather'}), 'r.clsA': R({class: 'ambient'}), 'r.clsL': R({class: 'locomotion'}), 'r.clsF': R({class: 'feedback'}),
    'r.rainW': R({class: 'weather', layer: 'world', render: {primitive: 'streak', size: [0.3, 0.3], streakSeconds: 0.028}, view2D: 'line'}),
    'r.farStreak': R({render: {primitive: 'streak', size: [0.3, 0.3], streakSeconds: 0.05}, occlusion: 'segment', view2D: 'line', lod: {near: 10, far: 50, farKeep: 1, cull: 400}})
  };
  var T = G.compileFxRecipes(TEST_RECIPES, G.FX_MATERIALS);
  var W = 360, H = 240, GS = 12, MW = 61;
  function flatMesh() {
    var m = {w: MW, h: MW, gridSize: GS, layerCount: new Uint8Array(MW * MW)};
    for (var l = 0; l < 5; l++) { m['l' + l + 'Type'] = new Uint8Array(MW * MW); m['l' + l + 'TopZ'] = new Float64Array(MW * MW); m['l' + l + 'Meta'] = new Uint8Array(MW * MW); }
    m.layerCount.fill(1); m.l0Type.fill(1); m.l0Meta.fill(1);
    return m;
  }
  var FLAT = flatMesh();
  // A flat authored scene: camera at (300, 300), eye height 60, looking +x.
  function scene(w, h) {
    G.floorMesh = FLAT; G.ENDLESS_MODE = false; G.CAVE_TEST_MODE = false;
    G.cell = GS; G.gridW = G.gridH = MW; G.grid = new Uint8Array(MW * MW); G.wallHeights = G.wallFaceBase = G.wallMaxTopZ = null;
    G.windowOriginX = G.windowOriginY = 0; G.deepCaveRegions = [];
    G.pos = {x: 300, y: 300, floorZ: 60}; G.cam = {x: 300, y: 300, z: 60, ang: 0, pitch: 0, fov: G.GAME_CONFIG.player.baseFov};
    G.viewCam = {x: 0, y: 0};
    G.MODE3D = true; G.CAM_FOLLOW = true; G.playerUnderground = false; G.terrain = 'ground'; G.level = 1;
    G.settingsOpen = false; G.menuOpen = false; G.overviewActive = false; G.running = true;
    G.canvas.width = w || W; G.canvas.height = h || H;
    G.projScale = G.canvas.height * 0.75; G.resScale = G.canvas.height / 240;
    G.renderSurfaceAmbient = 0.9; G.renderCaveAmbient = 0.45; G.renderSurfaceSunIntensity = 0.6; G.renderSurfaceFogFloor = 0.3;
    G.renderCaveFogFloor = 0.15; G._lightGrid = null;
    G.ambientParticles = []; G.settings.particles = 25; G.renderPresentationAlpha = 1;
    G._fxRender.governor = 1; G._fxRender.ema = 0;
  }
  function install(cap, seed, opts) {
    var o = {compiled: T, pinned: true, reserve: 16};
    Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
    return (G.fxState = G.createFxState(cap, seed, o));
  }
  // The analytic projection restated (01-config-state.js getCam3D/projToScreen,
  // without the floor): the world point that lands on (sx, sy) at depth fwd.
  function cam3() {
    var h = G.canvas.height, w = G.canvas.width, ps = G.projScale;
    return {w: w, h: h, inv: 1 / Math.tan(G.cam.fov / 2), hy: Math.floor(h / 2) + Math.floor(-(G.cam.pitch || 0) * ps), cz: 60 + (G.cam.z - 60) * 0.625, ps: ps};
  }
  function at(sx, sy, fwd) {
    var c = cam3(), right = (sx / c.w - 0.5) * 2 * fwd / c.inv, z = c.cz - (sy - c.hy) * fwd / c.ps;
    return {x: G.cam.x + fwd, y: G.cam.y + right, z: z};
  }
  function toScreen(x, y, z) {
    var c = cam3(), fwd = x - G.cam.x, right = y - G.cam.y;
    return {x: (0.5 + right / fwd * c.inv * 0.5) * c.w, y: c.hy + (c.cz - z) / fwd * c.ps, fwd: fwd};
  }
  // A particle written straight into the pool (as fxSpawn books it), with a
  // painted radius of rpx device pixels at its depth.
  function put(S, id, sx, sy, fwd, o) {
    o = o || {};
    var r = S.C.ID[id], i = S.count++, Rr = S.R, p = at(sx, sy, fwd), P = S.C.PAL;
    S.x[i] = p.x; S.y[i] = p.y; S.z[i] = o.z !== undefined ? o.z : p.z; S.vx[i] = o.vx || 0; S.vy[i] = o.vy || 0; S.vz[i] = o.vz || 0;
    S.age[i] = o.age !== undefined ? o.age : 1; S.life[i] = o.life || 100;
    S.size[i] = o.rpx !== undefined ? o.rpx * fwd / G.projScale : Rr.size0[r]; S.alpha[i] = o.alpha !== undefined ? o.alpha : 1;
    S.rot[i] = o.rot || 0; S.spin[i] = 0; S.phase[i] = o.phase || 0; S.gcell[i] = -1; S.owner[i] = -1;
    S.seedA[i] = o.seed !== undefined ? o.seed : Math.imul(i + 1, 2654435761) >>> 0;
    S.rec[i] = r; S.pal[i] = o.pal !== undefined ? o.pal : P.cand[P.specStart[Rr.colorSpec[r]]];
    S.flags[i] = o.flags || 0; S.bounces[i] = 0; S.cls[i] = Rr.cls[r];
    S.classLive[Rr.cls[r]]++; S.recipeLive[r]++;
    return i;
  }
  function depthFrame() { G.beginSceneDepthFrame(G.canvas.width, G.canvas.height); }
  function wall(x0, x1, y0, y1, depth) {
    G.writeSceneDepthPolygon([{x: x0, y: y0, depth: depth}, {x: x1, y: y0, depth: depth}, {x: x1, y: y1, depth: depth}, {x: x0, y: y1, depth: depth}]);
  }
  function frameStats() { return G.getEffectStats().frame; }
  function pixelOf(p) { return {x: Math.floor(p.x), y: Math.floor(p.y)}; }
  // Draws (fills/strokes/images) of the recorder whose paths or images touch
  // a screen point (within tol px).
  function drawsNear(x, y, tol) {
    return rec.draws.filter(function (d) {
      if (d.kind === 'image') return Math.abs(d.x + d.w / 2 - x) <= tol && Math.abs(d.y + d.h / 2 - y) <= tol;
      return d.path.some(function (c) {
        if (c[0] === 'arc' || c[0] === 'ellipse') return Math.abs(c[1] - x) <= tol && Math.abs(c[2] - y) <= tol;
        if (c[0] === 'rect') return Math.abs(c[1] + c[3] / 2 - x) <= tol && Math.abs(c[2] + c[4] / 2 - y) <= tol;
        if (c[0] === 'moveTo' || c[0] === 'lineTo') return Math.abs(c[1] - x) <= tol + 12 && Math.abs(c[2] - y) <= tol + 12;
        return false;
      });
    });
  }
  function failures() { var f = G.getEffectStats().failures, n = 0; for (var k in f) n += f[k]; return n; }
  var liveState = G.fxState;

  // ── C1: the footprint fast path equals the billboard mask decision, and
  // the tile summary is exact where it is decisive (section 5.3a).
  var C1_FLAGS = ['--footprint-open-interval', '--footprint-drop-bias', '--tile-min-max-swapped', '--tile-summary-sampled'];
  // A recorded depth frame: a sloped floor, walls at several depths, a
  // diagonal occluder, 1-px pillars and random triangles.
  function recordedDepth(rand) {
    depthFrame();
    G.writeSceneDepthPolygon([{x: 0, y: 130, depth: 300}, {x: W, y: 130, depth: 300}, {x: W, y: H, depth: 30}, {x: 0, y: H, depth: 30}]);
    wall(40, 90.5, 20, 200, 60); wall(250, 330, 60.5, 150, 120); wall(120, 121, 0, H, 25); wall(203, 204, 0, H, 20);
    G.writeSceneDepthPolygon([{x: 140, y: 10, depth: 45}, {x: 230, y: 110, depth: 90}, {x: 150, y: 120, depth: 70}]);
    for (var k = 0; k < 12; k++) {
      var cx = rand() * W, cy = rand() * H, d = 5 + rand() * 300;
      G.writeSceneDepthPolygon([{x: cx, y: cy, depth: d}, {x: cx + (rand() - 0.5) * 120, y: cy + (rand() - 0.5) * 120, depth: d * (0.8 + rand() * 0.4)},
        {x: cx + (rand() - 0.5) * 120, y: cy + (rand() - 0.5) * 120, depth: d * (0.8 + rand() * 0.4)}]);
    }
  }
  function billboardDecision(x0, y0, x1, y1, fwd) {
    var called = false, clips = rec.clips;
    G.withSceneDepthBillboard({x: x0, y: y0, width: x1 - x0, height: y1 - y0}, fwd, function () { called = true; });
    return !called ? 0 : rec.clips > clips ? 2 : 1;
  }
  // The oracle scan: every pixel whose centre lies in the closed rectangle.
  function scan(x0, y0, x1, y1, iz) {
    var vis = 0, hid = 0, D = G._sceneDepthInv;
    for (var y = 0; y < H; y++) {
      if (y + 0.5 < y0 || y + 0.5 > y1) continue;
      for (var x = 0; x < W; x++) {
        if (x + 0.5 < x0 || x + 0.5 > x1) continue;
        var inv = D[y * W + x];
        if (iz * (1 + inv * 0.15) + 1e-9 >= inv) vis++; else hid++;
      }
    }
    return {vis: vis, hid: hid};
  }
  // The same pixel-centre rule at any canvas size: the item's pixel box, and
  // a recorded clip path's rect coverage over it compared pixel by pixel with
  // the depth predicate (covered hidden pixels leak; uncovered visible ones
  // are holes).
  function pixelBox(x0, y0, x1, y1) {
    var Wd = G._sceneDepthW, Hd = G._sceneDepthH;
    var sx = Math.max(0, Math.ceil(x0 - 0.5)), ex = Math.min(Wd - 1, Math.floor(x1 - 0.5));
    var sy = Math.max(0, Math.ceil(y0 - 0.5)), ey = Math.min(Hd - 1, Math.floor(y1 - 0.5));
    return {sx: sx, sy: sy, ex: ex, ey: ey, w: ex - sx + 1, h: ey - sy + 1};
  }
  function coverageDiff(path, box, iz) {
    var cov = new Uint8Array(box.w * box.h), D = G._sceneDepthInv, Wd = G._sceneDepthW, out = {rects: 0, vis: 0, hid: 0, leaks: [], holes: []};
    path.forEach(function (c) {
      if (c[0] !== 'rect') return;
      out.rects++;
      var x0 = Math.max(box.sx, Math.ceil(c[1] - 0.5)), x1 = Math.min(box.ex, Math.floor(c[1] + c[3] - 0.5));
      var y0 = Math.max(box.sy, Math.ceil(c[2] - 0.5)), y1 = Math.min(box.ey, Math.floor(c[2] + c[4] - 0.5));
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) cov[(y - box.sy) * box.w + x - box.sx] = 1;
    });
    for (var y = box.sy; y <= box.ey; y++) for (var x = box.sx; x <= box.ex; x++) {
      var inv = D[y * Wd + x], v = iz * (1 + inv * 0.15) + 1e-9 >= inv, c = cov[(y - box.sy) * box.w + x - box.sx];
      if (v) out.vis++; else out.hid++;
      if (c && !v) out.leaks.push([x, y]); else if (!c && v) out.holes.push([x, y]);
    }
    return out;
  }
  // Chebyshev distance from a pixel to the nearest pixel of the other
  // visibility within reach (reach + 1 when there is none).
  function distToOther(x, y, visible, iz, reach) {
    var D = G._sceneDepthInv, Wd = G._sceneDepthW, Hd = G._sceneDepthH, best = reach + 1;
    for (var dy = -reach; dy <= reach; dy++) for (var dx = -reach; dx <= reach; dx++) {
      var qx = x + dx, qy = y + dy;
      if (qx < 0 || qy < 0 || qx >= Wd || qy >= Hd) continue;
      var inv = D[qy * Wd + qx], v = iz * (1 + inv * 0.15) + 1e-9 >= inv;
      if (v !== visible) best = Math.min(best, Math.max(Math.abs(dx), Math.abs(dy)));
    }
    return best;
  }
  if (needed('C1', C1_FLAGS)) run('C1 depth classification', function () {
    scene(); install(64, 11); var rand = lcg(20260927);
    recordedDepth(rand); G.beginEffectFrame();
    var D = G._sceneDepthInv, mismatches = [], classes = [0, 0, 0], kinds = {half: 0, onePx: 0, partial: 0, nearOne: 0, nearDepth: 0};
    for (var n = 0; n < 30000; n++) {
      var kind = n % 6, x0, y0, wd, ht, fwd;
      if (kind === 0) { x0 = Math.floor(rand() * W) + 0.5; y0 = Math.floor(rand() * H) + 0.5; wd = Math.floor(1 + rand() * 30); ht = Math.floor(1 + rand() * 30); kinds.half++; }
      else if (kind === 1) { x0 = Math.floor(rand() * W) + rand() * 0.2; y0 = Math.floor(rand() * H) + rand() * 0.2; wd = 0.6 + rand() * 0.8; ht = 0.6 + rand() * 0.8; kinds.onePx++; }
      else if (kind === 2) { x0 = -30 + rand() * 60 + (rand() < 0.5 ? 0 : W - 30); y0 = -20 + rand() * (H + 20); wd = 5 + rand() * 50; ht = 5 + rand() * 50; kinds.partial++; }
      else { x0 = rand() * W; y0 = rand() * H; wd = 0.2 + rand() * 60; ht = 0.2 + rand() * 60; }
      if (kind === 3) { fwd = 1 + rand() * 0.01; kinds.nearOne++; }
      else if (kind === 4) {                                         // the depth of a pixel inside the box, nudged
        var px = Math.min(W - 1, Math.max(0, Math.floor(x0 + wd / 2))), py = Math.min(H - 1, Math.max(0, Math.floor(y0 + ht / 2))), inv = D[py * W + px];
        fwd = inv > 0 ? Math.max(1, (1 / inv) * (1 + (rand() - 0.5) * 0.2)) : 50; kinds.nearDepth++;
      } else fwd = 1 + rand() * 350;
      var x1 = x0 + wd, y1 = y0 + ht, iz = 1 / fwd;
      var fast = G.fxDepthFootprint(x0, y0, x1, y1, iz), slow = billboardDecision(x0, y0, x1, y1, fwd);
      classes[slow]++;
      if (fast !== slow && mismatches.length < 5) mismatches.push({rect: [x0, y0, x1, y1], fwd: fwd, footprint: fast, billboard: slow});
      else if (fast !== slow) mismatches.push(1);
    }
    check('the C1 fixture reaches every decision and every adversarial kind', classes[0] > 1000 && classes[1] > 1000 && classes[2] > 1000 &&
      kinds.half > 4000 && kinds.onePx > 4000 && kinds.partial > 4000 && kinds.nearOne > 4000 && kinds.nearDepth > 4000, {classes: classes, kinds: kinds});
    check('the footprint fast path equals the billboard mask', !mismatches.length,
      {seed: 20260927, rects: 30000, mismatches: mismatches.length, first: mismatches.slice(0, 3)});
    // The shared diagonal: the mask rasterises the box as two triangles that
    // both visit the pixels on their common edge. One hidden pixel centred on
    // that diagonal must still make both paths say "mixed".
    var diagonal = [];
    for (n = 0; n < 60; n++) {
      var d0 = 20 + (n % 12) * 25 + 0.5, e0 = 20 + Math.floor(n / 12) * 40 + 0.5, side = 6 + (n % 5) * 3, k = 1 + (n % (side - 1));
      depthFrame(); wall(d0 + k - 0.4, d0 + k + 0.4, e0 + k - 0.4, e0 + k + 0.4, 10);      // covers only pixel (d0 + k - 0.5, e0 + k - 0.5)
      var fd = G.fxDepthFootprint(d0, e0, d0 + side, e0 + side, 1 / 60), bd = billboardDecision(d0, e0, d0 + side, e0 + side, 60);
      if (fd !== 2 || bd !== 2) diagonal.push({box: [d0, e0, side], pixel: k, footprint: fd, billboard: bd});
    }
    check('one hidden pixel on the shared diagonal makes both paths mixed', !diagonal.length, {cases: 60, wrong: diagonal.slice(0, 3)});
    recordedDepth(lcg(20260927)); G.beginEffectFrame();
    // Tiles: conservative and exact where decisive, against the full scan.
    var wrong = [], tileClasses = [0, 0, 0], conservative = 0;
    for (n = 0; n < 6000; n++) {
      var tx0 = rand() * (W + 40) - 20, ty0 = rand() * (H + 40) - 20, tw = 1 + rand() * 90, th = 1 + rand() * 90, tf = 1 + rand() * 350;
      var got = G.fxTileClass(tx0, ty0, tx0 + tw, ty0 + th, 1 / tf), truth = scan(tx0, ty0, tx0 + tw, ty0 + th, 1 / tf);
      tileClasses[got]++;
      if (got === 1 && truth.hid || got === 0 && truth.vis) { if (wrong.length < 5) wrong.push({rect: [tx0, ty0, tx0 + tw, ty0 + th], fwd: tf, tiles: got, scan: truth}); else wrong.push(1); }
      if (got === 2 && !(truth.vis && truth.hid)) conservative++;
    }
    check('the tiles leg reaches all three classes', tileClasses[0] > 300 && tileClasses[1] > 300 && tileClasses[2] > 300, {classes: tileClasses});
    check('tiles never call a footprint with a hidden pixel all visible, or one with a visible pixel hidden', !wrong.length,
      {seed: 20260927, rects: 6000, wrong: wrong.length, first: wrong.slice(0, 3), conservativeMixed: conservative});
    // The thin pillar (pixel column 203, depth 20) through a 60-px particle
    // at depth 80 whose centre is 1.3 px off the pillar: the old 'sampled'
    // rule (centre, and +-r/2, +-r on both axes) never reads column 203.
    depthFrame(); wall(203, 204, 0, H, 20); G.beginEffectFrame();
    var cx = 204.8, cy = 100, rad = 30, iz = 1 / 80, truth = scan(cx - rad, cy - rad, cx + rad, cy + rad, iz), sampledHidden = 0;
    [[0, 0], [-0.5, 0], [0.5, 0], [-1, 0], [1, 0], [0, -0.5], [0, 0.5], [0, -1], [0, 1]].forEach(function (s) {
      if (!G.fxDepthPoint(cx + s[0] * rad, cy + s[1] * rad, iz, 1)) sampledHidden++;
    });
    check('a thin pillar the old sampled rule misses is classified mixed', truth.vis > 0 && truth.hid === 60 && sampledHidden === 0 &&
      G.fxTileClass(cx - rad, cy - rad, cx + rad, cy + rad, iz) === 2, {scan: truth, sampledRuleHidden: sampledHidden,
        tiles: G.fxTileClass(cx - rad, cy - rad, cx + rad, cy + rad, iz)});
  });

  // ── C2: particles behind terrain are not drawn, the same particles in the
  // open are, for each strategy; a half wall clips each mixed item once; the
  // combat layer follows the depth-writing stall stage; 1-px columns are seen.
  var C2_FLAGS = ['--skip-depth', '--combat-before-stalls', '--tiles-drop-mixed', '--rest-drawn-lifted'];
  if (needed('C2', C2_FLAGS)) run('C2 occlusion', function () {
    scene(); var S = install(256, 22);
    var ids = ['r.point', 'r.foot', 'r.tiles', 'r.clip', 'r.corona', 'r.streak', 'r.dot'], sizes = {'r.point': 1, 'r.foot': 8, 'r.tiles': 30, 'r.clip': 10, 'r.corona': 6, 'r.dot': 5};
    ids.forEach(function (id, k) {
      for (var j = 0; j < 4; j++) {
        var sx = 40 + 45 * k, sy = 40 + 45 * j;
        if (id === 'r.streak') {                                    // 20 px long, horizontal on screen
          var head = at(sx + 10, sy, 80), tail = at(sx - 10, sy, 80);
          var i = put(S, id, sx + 10, sy, 80); S.vy[i] = (head.y - tail.y) / 0.05;
        } else put(S, id, sx, sy, 80, {rpx: sizes[id]});
      }
    });
    function drawAt(withWall) {
      depthFrame(); if (withWall) wall(0, W, 0, H, 50); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1);
      return {drawn: frameStats().drawn, draws: rec.draws.length};
    }
    var open = drawAt(false), walled = drawAt(true);
    check('particles behind terrain are not drawn; the same particles in the open are', open.drawn === 28 && open.draws > 0 &&
      walled.drawn === 0 && walled.draws === 0, {open: open, walled: walled, particles: 28});
    // Half wall: left of x = 180 at depth 50; each item straddles the edge.
    S.count = 0; S.classLive.fill(0); S.recipeLive.fill(0);
    var straddle = {'r.foot': 8, 'r.tiles': 30, 'r.clip': 10};
    Object.keys(straddle).forEach(function (id, k) { for (var j = 0; j < 3; j++) put(S, id, 180.3, 30 + 70 * j + 20 * k, 80, {rpx: straddle[id]}); });
    depthFrame(); wall(0, 180, 0, H, 50); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1);
    var st = frameStats(), unclipped = rec.draws.filter(function (d) { return !d.clipped; }).length;
    check('a half wall gives exactly one clip per mixed item', rec.clips === 9 && unclipped === 0 && st.drawn === 9 &&
      st.occ.footprint === 3 && st.occ.tiles === 3 && st.occ.clip === 3, {clips: rec.clips, unclipped: unclipped, occ: st.occ, drawn: st.drawn});
    // The stall: an opaque quad written by a stand-in structures3D stage with
    // fillSceneDepthPolygon at depth 60, debris in front (40) and behind (90);
    // the stages run in renderFrame's order, read from the source.
    var stages = [], savedPt = G._pt;
    G._pt = function (name, fn) { stages.push({name: name, fn: fn}); };
    try { G.renderFrame(); } finally { G._pt = savedPt; }
    var order = stages.map(function (s) { return s.name; }).filter(function (n) { return n === 'structures3D' || n === 'fxCombat3D'; });
    S.count = 0; S.classLive.fill(0); S.recipeLive.fill(0);
    var front = put(S, 'r.dot', 150, 100, 40, {rpx: 4}), behind = put(S, 'r.dot', 210, 100, 90, {rpx: 4});
    depthFrame(); G.beginEffectFrame(); recReset();
    stages.forEach(function (s) {
      if (s.name === 'structures3D') {
        G.ctx.save(); G.ctx.fillStyle = '#123456';
        G.fillSceneDepthPolygon([{x: 120, y: 60, depth: 60}, {x: 240, y: 60, depth: 60}, {x: 240, y: 140, depth: 60}, {x: 120, y: 140, depth: 60}]);
        G.ctx.restore();
      } else if (s.name === 'fxCombat3D') s.fn();
    });
    var stallAt = -1, frontAt = -1, behindDrawn = drawsNear(210, 100, 1).length;
    rec.draws.forEach(function (d, k) {
      if (d.style === '#123456') stallAt = k;
      else if (d.kind === 'fill' && d.path.some(function (c) { return c[0] === 'arc' && near(c[1], 150, 1e-6); })) frontAt = k;
    });
    check('debris behind a stall is hidden and debris in front of it is drawn over it', stallAt >= 0 && frontAt > stallAt && behindDrawn === 0,
      {order: order, stallDraw: stallAt, frontDraw: frontAt, behindDraws: behindDrawn});
    // 1-px column (pixel 203, depth 20) through 16-, 30- and 60-px particles
    // at depth 80: detected as mixed and excluded from the drawn clip.
    [8, 15, 30].forEach(function (rad) {
      S.count = 0; S.classLive.fill(0); S.recipeLive.fill(0);
      put(S, 'r.dot', 205.2, 120, 80, {rpx: rad});
      depthFrame(); wall(203, 204, 0, H, 20); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1);
      var o = frameStats().occ, covered = 0, clipRects = 0;
      rec.clipPaths.forEach(function (p) { p.forEach(function (c) {
        if (c[0] !== 'rect') return; clipRects++;
        if (c[1] <= 203 && c[1] + c[3] >= 204 && c[2] < 120 + rad && c[2] + c[4] > 120 - rad) covered++;
      }); });
      var strategy = rad <= 24 ? 'footprint' : 'tiles';                 // spec 5.3: footprint up to r = 24 px while its budget lasts
      check('the 1-px column is always detected through a ' + (rad * 2) + '-px particle (' + strategy + ')',
        o[strategy] === 1 && rec.clips === 1 && clipRects > 0 && covered === 0 && rec.draws.length === 1 && rec.draws[0].clipped,
        {radius: rad, occ: o, clips: rec.clips, clipRects: clipRects, columnCovered: covered, draws: rec.draws.length});
    });
    // The tiles clip of a mixed 60-px item covers exactly its visible pixels
    // (oracle: the per-pixel scan over the item's pixel box), for a diagonal
    // occluder edge and for the 1-px column; the mask budget covers both.
    var exactness = [];
    [['diagonal', function () { G.writeSceneDepthPolygon([{x: 150, y: 60, depth: 40}, {x: 215, y: 180, depth: 40}, {x: 150, y: 180, depth: 40}]); }],
     ['column', function () { wall(203, 204, 0, H, 20); }]].forEach(function (occluder) {
      S.count = 0; S.classLive.fill(0); S.recipeLive.fill(0);
      put(S, 'r.tiles', 180.3, 120.2, 80, {rpx: 30});
      depthFrame(); occluder[1](); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1);
      var box = pixelBox(150.3, 90.2, 210.3, 150.2), o = frameStats().occ, d = rec.clipPaths.length === 1 ? coverageDiff(rec.clipPaths[0], box, 1 / 80) : null;
      exactness.push({occluder: occluder[0], clips: rec.clips, tiles: o.tiles, grid: o.grid, rects: d && d.rects, vis: d && d.vis, hid: d && d.hid,
        leaks: d ? d.leaks.length : -1, holes: d ? d.holes.length : -1, firstHoles: d ? d.holes.slice(0, 3) : null});
    });
    check('the tiles clip covers exactly the visible pixels of a mixed item', exactness.every(function (e) {
      return e.clips === 1 && e.tiles === 1 && e.grid === 0 && e.vis > 0 && e.hid > 0 && e.leaks === 0 && e.holes === 0;
    }), {items: exactness});
    // A ground-resting particle is drawn where it rests and depth-tested 0.5 u
    // above it: at depth 30 that is 3 px up, so its own pixel row (hidden by a
    // wall across rows 121+) does not hide it; unflagged, the row does.
    function restDraw(flags) {
      S.count = 0; S.classLive.fill(0); S.recipeLive.fill(0);
      var i = put(S, 'r.point', 180.5, 122.5, 30, {rpx: 1, flags: flags});
      depthFrame(); wall(0, W, 121, H, 20); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1);
      var fill = rec.draws.filter(function (d) { return d.kind === 'fill'; })[0], c = fill && fill.path[0], p = toScreen(S.x[i], S.y[i], S.z[i]);
      return {draws: rec.draws.length, drawn: c ? [c[1] + c[3] / 2, c[2] + c[4] / 2] : null, rests: [p.x, p.y]};
    }
    var rested = restDraw(1), loose = restDraw(0);
    check('a ground-resting particle is drawn where it rests and depth-tested 0.5 u above it',
      rested.draws === 1 && !!rested.drawn && near(rested.drawn[0], rested.rests[0], 1e-6) && near(rested.drawn[1], rested.rests[1], 1e-6) && loose.draws === 0,
      {resting: rested, unflagged: loose, liftPx: 0.5 * G.projScale / 30});
  });

  // ── C3: streaks stop at the occluder edge (segment sampling). The spec's
  // sample count k = clamp(ceil(len/4), 2, 9) makes the tolerance one sample
  // spacing, len/(k-1): 4.3 px for a 30-px streak, 12.5 px for a 100-px one.
  if (needed('C3', ['--segment-endpoints-only', '--segment-const-depth'])) run('C3 streak edges', function () {
    scene(); var S = install(64, 33);
    // A streak whose head is at screen (hx, hy) and depth hf and whose tail
    // (streakSeconds back along its velocity) is at (tx, ty) and depth tf.
    function streak(hx, hy, hf, tx, ty, tf) {
      S.count = 0; S.classLive.fill(0); S.recipeLive.fill(0);
      var head = at(hx, hy, hf), tail = at(tx, ty, tf), i = put(S, 'r.streak', hx, hy, hf);
      S.vx[i] = (head.x - tail.x) / 0.05; S.vy[i] = (head.y - tail.y) / 0.05; S.vz[i] = (head.z - tail.z) / 0.05;
      return {head: head, tail: tail};
    }
    function segs(occluder) {
      depthFrame(); if (occluder) occluder(); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1);
      var out = [];
      rec.draws.filter(function (d) { return d.kind === 'stroke'; }).forEach(function (d) {
        for (var k = 0; k + 1 < d.path.length; k++) if (d.path[k][0] === 'moveTo' && d.path[k + 1][0] === 'lineTo')
          out.push([d.path[k][1], d.path[k][2], d.path[k + 1][1], d.path[k + 1][2]]);
      });
      return out;
    }
    function spans(list) { return list.map(function (g) { return [Math.min(g[0], g[2]), Math.max(g[0], g[2])]; }).sort(function (a, b) { return a[0] - b[0]; }); }
    function spacing(len) { var k = Math.min(9, Math.max(2, Math.ceil(len / 4))); return len / (k - 1); }
    var legs = [], ok = true;
    // Horizontal streaks at one depth through an occluder column [c0, c1).
    [[210, 180, 190, 200], [260, 160, 195, 225]].forEach(function (g) {
      streak(g[0], 100, 60, g[1], 100, 60);
      var full = spans(segs(null)), cut = spans(segs(function () { wall(g[2], g[3], 0, H, 30); })), sp = spacing(g[0] - g[1]);
      var good = full.length === 1 && near(full[0][0], g[1], 1e-6) && near(full[0][1], g[0], 1e-6) &&
        cut.length === 2 && near(cut[0][0], g[1], 1e-6) && Math.abs(cut[0][1] - g[2]) <= sp && Math.abs(cut[1][0] - g[3]) <= sp && near(cut[1][1], g[0], 1e-6);
      ok = ok && good;
      legs.push({length: g[0] - g[1], segments: cut, full: full, column: [g[2], g[3]], spacing: sp, ok: good});
    });
    // A receding streak (head at depth 40, tail at 120) in front of and then
    // behind a full-screen wall at depth 75: drawn from the head to where the
    // line crosses depth 75 (the analytic 3D crossing, projected), not beyond.
    var rs = streak(150, 150, 40, 200, 130, 120), s75 = (75 - 40) / (120 - 40);
    var cross = toScreen(rs.head.x + (rs.tail.x - rs.head.x) * s75, rs.head.y + (rs.tail.y - rs.head.y) * s75, rs.head.z + (rs.tail.z - rs.head.z) * s75);
    var full3 = segs(null), cut3 = segs(function () { wall(0, W, 0, H, 75); }), len3 = Math.hypot(50, 20), sp3 = spacing(len3);
    var end3 = cut3.length === 1 ? [cut3[0][2], cut3[0][3]] : null;
    var recede = full3.length === 1 && cut3.length === 1 && near(cut3[0][0], 150, 1e-6) && near(cut3[0][1], 150, 1e-6) &&
      Math.hypot(end3[0] - cross.x, end3[1] - cross.y) <= sp3;
    legs.push({receding: true, segments: cut3, crossing: [cross.x, cross.y], spacing: sp3, ok: recede});
    check('an unoccluded streak draws its full length', legs.every(function (l) { return l.receding || l.full.length === 1; }) && full3.length === 1, {legs: legs});
    check('streaks stop at the occluder edge within one sample spacing (len/(k-1), k <= 9)', ok && recede, {legs: legs});
  });

  // ── C3 on the shipping rain (S7): weather.rain from the shipping table (its
  // own streak length and occlusion, spec 9.1 restated: a streak of
  // |v| x 0.028 s behind the head, segment occlusion). A falling drop, head
  // at screen (200, 160) and its point 0.028 s back at (192, 96), both at
  // depth 60: unoccluded it draws one piece from head to that point; behind
  // a band of rows [115, 130) at depth 30 it draws two pieces that stop at
  // the band's edges within one sample spacing (len/(k-1), k <= 9).
  if (needed('C3 shipping', ['--rain-point-occl', '--streak-short'])) run('C3 shipping rain', function () {
    scene(); G.setEffectToggle('fxWeather', 'rain');
    try {
      var S = install(64, 35, {compiled: G.FX_COMPILED}), head = at(200, 160, 60), tail = at(192, 96, 60);
      var i = put(S, 'weather.rain', 200, 160, 60);
      S.vx[i] = (head.x - tail.x) / 0.028; S.vy[i] = (head.y - tail.y) / 0.028; S.vz[i] = (head.z - tail.z) / 0.028;
      function segs(occluder) {
        depthFrame(); if (occluder) occluder(); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(0);
        var out = [];
        rec.draws.filter(function (d) { return d.kind === 'stroke'; }).forEach(function (d) {
          for (var k = 0; k + 1 < d.path.length; k++) if (d.path[k][0] === 'moveTo' && d.path[k + 1][0] === 'lineTo')
            out.push([d.path[k][1], d.path[k][2], d.path[k + 1][1], d.path[k + 1][2]].map(function (v) { return Math.round(v * 1000) / 1000; }));
        });
        return out.map(function (g) { return g[1] <= g[3] ? g : [g[2], g[3], g[0], g[1]]; }).sort(function (a, b) { return a[1] - b[1]; });   // top end first
      }
      var len = Math.hypot(8, 64), k = Math.min(9, Math.max(2, Math.ceil(len / 4))), sp = len / (k - 1);
      var full = segs(null), cut = segs(function () { wall(0, W, 115, 130, 30); });
      function onLine(y) { return 192 + (y - 96) / 64 * 8; }                    // the streak's screen line, restated
      var whole = full.length === 1 && near(full[0][0], 192, 1e-6) && near(full[0][1], 96, 1e-6) && near(full[0][2], 200, 1e-6) && near(full[0][3], 160, 1e-6);
      check('the shipping rain streak spans |v| x 0.028 s behind its head', whole, {pieces: full, want: [[192, 96, 200, 160]]});
      var stops = cut.length === 2 && near(cut[0][1], 96, 1e-6) && Math.abs(cut[0][3] - 115) <= sp && Math.abs(cut[1][1] - 130) <= sp && near(cut[1][3], 160, 1e-6) &&
        cut.every(function (g) { return near(g[0], onLine(g[1]), 1e-6) && near(g[2], onLine(g[3]), 1e-6); });
      check('a shipping rain streak stops at an occluder band within one sample spacing', stops, {pieces: cut, band: [115, 130], spacing: sp});
    } finally { G.EFFECT_TOGGLE_DEFS.forEach(function (d) { if (d.key === 'fxWeather') G.setEffectToggle(d.key, d.default); }); }
  });

  // ── C4: every layer at N = 500 across all primitives: no blur, balanced
  // state, restored alpha and composite; no cosmetic random draw; camera-local
  // particles never drawn outside first person.
  if (needed('C4', ['--particle-shadow-blur', '--leak-composite', '--eye-in-2d-draw'])) run('C4 canvas state', function () {
    scene(); var S = install(1024, 44), rand = lcg(4444);
    var ids = ['r.dot', 'r.world', 'r.glow', 'r.streak', 'r.bone', 'r.chip', 'r.puff', 'r.ring', 'r.clip', 'r.tiles', 'r.corona'];
    for (var n = 0; n < 480; n++) {
      var id = ids[n % ids.length], sx = 10 + rand() * 340, sy = 10 + rand() * 220, fwd = 20 + rand() * 200, i = put(S, id, sx, sy, fwd, {rpx: 1 + rand() * 20, rot: rand() * 6, alpha: 0.3 + rand() * 0.7});
      if (id === 'r.streak') { S.vy[i] = (rand() - 0.5) * 900; S.vz[i] = (rand() - 0.5) * 900; }
    }
    for (n = 0; n < 10; n++) { var e = put(S, 'r.eye', 180, 120, 30, {rpx: 3}); S.x[e] = 30; S.y[e] = (n - 5) * 2; S.z[e] = 0; S.flags[e] = 4; }
    for (n = 0; n < 10; n++) { var q = put(S, 'r.screen', 180, 120, 30); S.x[q] = n % 2 ? 0.7 : -0.7; S.y[q] = 0.4; S.z[q] = 0; S.flags[q] = 8; }
    function sentinel() { recCtx.globalAlpha = 0.37; recCtx.globalCompositeOperation = 'multiply'; recCtx.shadowBlur = 0; }
    var savedPR = G.presentationRandom, calls = {random: 0, presentation: 0}, report = {}, byPrim = {arc: 0, rect: 0, stroke: 0, ellipse: 0, image: 0, chip: 0};
    Math.random = function () { calls.random++; throw Error('cosmetic draw from Math.random'); };
    G.presentationRandom = function () { calls.presentation++; throw Error('cosmetic draw from presentationRandom'); };
    try {
      [['fxCombat3D', function () { G.drawEffectLayer3D(1); }], ['ambientFX3D', function () { G.drawEffectLayer3D(0); }], ['fxOverlay', function () { G.drawEffectOverlay(); }],
       ['fx2D', function () { G.MODE3D = false; G.viewCam = {x: S.x[0] - 180, y: S.y[0] - 120}; G.drawEffectLayer2D(); G.MODE3D = true; }]].forEach(function (stage) {
        depthFrame(); wall(0, 170, 0, H, 60); G.beginEffectFrame(); recReset(); sentinel(); rec.sets = 0; rec.blurSets = 0;
        stage[1]();
        rec.draws.forEach(function (d) {
          if (d.kind === 'image') byPrim.image++;
          if (d.kind === 'stroke') { byPrim.stroke++; if (d.path.some(function (c) { return c[0] === 'ellipse'; })) byPrim.ellipse++; }
          if (d.kind === 'fill') d.path.forEach(function (c) { if (c[0] === 'arc') byPrim.arc++; if (c[0] === 'rect') byPrim.rect++; });
          if (d.kind === 'fill' && d.path.length >= 3 && d.path[0][0] === 'moveTo' && d.path[1][0] === 'lineTo') byPrim.chip++;
        });
        report[stage[0]] = {draws: rec.draws.length, blur: rec.blurSets, depth: rec.stack.length, underflow: rec.underflow,
          alpha: recCtx.globalAlpha, op: recCtx.globalCompositeOperation, drawn: frameStats().drawn};
      });
    } finally { Math.random = originalRandom; G.presentationRandom = savedPR; }
    var names = Object.keys(report), bad = names.filter(function (k) {
      var r = report[k]; return r.blur || r.depth || r.underflow || r.alpha !== 0.37 || r.op !== 'multiply';
    });
    check('the C4 stages each drew, across every primitive', names.every(function (k) { return report[k].draws > 0; }) &&
      byPrim.arc > 0 && byPrim.rect > 0 && byPrim.stroke > 0 && byPrim.ellipse > 0 && byPrim.image > 0 && byPrim.chip > 0, {report: report, byPrim: byPrim});
    check('effect layers never blur and restore Canvas state', !bad.length, {bad: bad, report: report});
    check('drawing never reads Math.random or presentationRandom', !calls.random && !calls.presentation, {calls: calls});
    // Camera-local particles: not in the 2D view, not outside first person.
    G.MODE3D = false; G.beginEffectFrame(); recReset(); G.drawEffectLayer2D();
    var eye2D = drawsNear(180, 120, 400).filter(function (d) { return d.op === 'lighter' && d.kind === 'image'; }).length;
    G.MODE3D = true; G.CAM_FOLLOW = false; depthFrame(); G.beginEffectFrame(); recReset(); G.drawEffectOverlay();
    var eyeNonFollow = rec.draws.length;
    G.CAM_FOLLOW = true; depthFrame(); G.beginEffectFrame(); recReset(); G.drawEffectOverlay();
    var eyeFollow = rec.draws.length;
    check('eye and screen particles are never drawn in 2D or a non-follow camera', eye2D === 0 && eyeNonFollow === 0 && eyeFollow > 0,
      {twoD: eye2D, nonFollow: eyeNonFollow, firstPerson: eyeFollow});
    // Camera-local particles of recipes that do have a 2D form (a placement
    // override, or the fade after a view switch): flagged EYE or SCREEN they
    // draw nothing in the 2D view, whose coordinates they would be misread
    // in; the same particles unflagged draw (positive control).
    var S2 = install(64, 45);
    for (n = 0; n < 5; n++) { var e2 = put(S2, 'r.dot', 180, 120, 50, {rpx: 2}); S2.x[e2] = 30; S2.y[e2] = (n - 2) * 3; S2.z[e2] = 0; S2.flags[e2] = 4; }
    for (n = 0; n < 5; n++) { var q2 = put(S2, 'r.puff', 180, 120, 50, {rpx: 3}); S2.x[q2] = 0.2 * n; S2.y[q2] = 0.1; S2.z[q2] = 0; S2.flags[q2] = 8; }
    G.MODE3D = false; G.viewCam = {x: -100, y: -100};
    recReset(); G.drawEffectLayer2D(); var flagged = {draws: rec.draws.length, calls: rec.calls, drawn: frameStats().drawn};
    for (n = 0; n < S2.count; n++) S2.flags[n] = 0;
    recReset(); G.drawEffectLayer2D(); var plain = {draws: rec.draws.length, drawn: frameStats().drawn};
    G.MODE3D = true;
    check('camera-local particles never draw in the 2D view, whatever their recipe', flagged.draws === 0 && flagged.calls === 0 && flagged.drawn === 0 &&
      plain.draws > 0 && plain.drawn === 10, {flagged: flagged, unflagged: plain});
  });

  // ── C5: batches draw each visible particle exactly once, in its style.
  if (needed('C5', ['--bucket-collision', '--no-batch'])) run('C5 batching', function () {
    scene(); var S = install(256, 55), rand = lcg(5555), expected = [], keys = {};
    var ids = ['r.dot', 'r.dotB', 'r.dotC', 'r.chipS'];
    for (var n = 0; n < 200; n++) {
      var id = ids[n % 4], sx = 12 + rand() * 336, sy = 12 + rand() * 216, fwd = 30 + rand() * 150, rpx = n % 3 ? 0.6 + rand() * 0.6 : 1.5 + rand() * 5;
      var alpha = [0.25, 0.5, 1][n % 3], i = put(S, id, sx, sy, fwd, {rpx: rpx, alpha: alpha});
      var rgb = S.C.PAL.rgb[S.pal[i]], style = 'rgb(' + ((rgb >> 16) & 255) + ',' + ((rgb >> 8) & 255) + ',' + (rgb & 255) + ')';
      var A = alpha >= 1 ? 15 : Math.floor(alpha * 16), qa = (A + 0.5) / 16, p = toScreen(S.x[i], S.y[i], S.z[i]);
      expected.push([id === 'r.chipS' ? 'chip' : 'disc', p.x.toFixed(4), p.y.toFixed(4), rpx.toFixed(4), style, qa].join('|'));
      keys[[id === 'r.chipS' ? 'chip' : 'disc', style, qa].join('|')] = 1;
    }
    depthFrame(); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1);
    var got = [], fills = 0;
    rec.draws.forEach(function (d) {
      if (d.kind !== 'fill') return;
      fills++;
      for (var k = 0; k < d.path.length; k++) {
        var c = d.path[k];
        if (c[0] === 'rect') got.push(['disc', (c[1] + c[3] / 2).toFixed(4), (c[2] + c[4] / 2).toFixed(4), (c[3] / 2).toFixed(4), d.style, d.alpha].join('|'));
        else if (c[0] === 'arc') got.push(['disc', c[1].toFixed(4), c[2].toFixed(4), c[3].toFixed(4), d.style, d.alpha].join('|'));
        else if (c[0] === 'moveTo' && d.path[k + 1] && d.path[k + 1][0] === 'lineTo' && d.path[k + 2] && d.path[k + 2][0] === 'lineTo') {
          var r = (c[1] - d.path[k + 1][1]) / 1.6;                  // rot 0: tip (x + r, y), second (x - 0.6 r, y + 0.55 r)
          got.push(['chip', (c[1] - r).toFixed(4), c[2].toFixed(4), r.toFixed(4), d.style, d.alpha].join('|')); k += 2;
        }
      }
    });
    expected.sort(); got.sort();
    var missing = expected.filter(function (e) { return got.indexOf(e) < 0; }), extra = got.filter(function (g) { return expected.indexOf(g) < 0; });
    check('batches draw each visible particle exactly once', got.length === 200 && !missing.length && !extra.length && fills <= Object.keys(keys).length,
      {drawn: got.length, missing: missing.slice(0, 3), extra: extra.slice(0, 3), fills: fills, styles: Object.keys(keys).length});
  });

  // ── C6: the exact clip spends at most its pixel budget; the excess uses the
  // bounded grid clip and every mixed item stays clipped. The same holds for
  // the tiles clip, whose path grows with the occluder edge, not the item's
  // area. Corona fades a glow by the visible fraction of its core samples.
  // Every per-frame cap is counted when hit.
  var C6_FLAGS = ['--ignore-mask-budget', '--leak-over-budget', '--corona-ignores-depth', '--corona-full-radius', '--tiles-no-merge',
    '--tiles-ignore-budget', '--tiles-leak-over-budget', '--glow-cap-ignored', '--mixed-cap-ignored', '--foot-budget-ignored'];
  if (needed('C6', C6_FLAGS)) run('C6 clip budget', function () {
    scene(); var S = install(256, 66), n;
    depthFrame();                                                          // pixel boxes clamp to this frame
    // Expected spend: the budget rule applied, in pass order, to each item's
    // pixel count (pixel centres in its box), taken here.
    var costs = [];
    for (n = 0; n < 100; n++) {
      var cy = 35.2 + (n % 20) * 8.5, pb = pixelBox(150.3, cy - 30, 210.3, cy + 30);
      put(S, 'r.clip', 180.3, cy, 80, {rpx: 30}); costs.push(pb.w * pb.h);
    }
    var left = 60000, exact = 0, all = 0;
    costs.forEach(function (c) { all += c; if (c <= left) { left -= c; exact++; } });
    function pass() { depthFrame(); wall(0, 180, 0, H, 50); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1); return frameStats(); }
    var st = pass(), unclipped = rec.draws.filter(function (d) { return !d.clipped; }).length;
    check('exact-clip cost is bounded per frame', st.maskPx <= 60000 && st.maskPx === 60000 - left && st.occ.clip === 100 && st.occ.grid === 100 - exact &&
      unclipped === 0 && rec.draws.length === 100,
      {maskPx: st.maskPx, expected: 60000 - left, budget: 60000, grid: st.occ.grid, exact: exact, unclipped: unclipped, draws: rec.draws.length});
    var savedCfg = G.EFFECT_CONFIG, cfg = {};
    Object.keys(savedCfg).forEach(function (k) { cfg[k] = savedCfg[k]; }); cfg.maskBudgetPx = 1e9; G.EFFECT_CONFIG = Object.freeze(cfg);
    try { st = pass(); } finally { G.EFFECT_CONFIG = savedCfg; }
    check('with the budget raised every mixed item uses the exact clip', st.occ.grid === 0 && st.maskPx === all &&
      rec.draws.every(function (d) { return d.clipped; }), {grid: st.occ.grid, maskPx: st.maskPx, expected: all});
    // Corona: a glow (core 10 px, 5 samples at 0 and +-5 px, half the core
    // radius) behind a full wall draws nothing; a wall ending at x < sx - 2
    // covers only the left sample (4/5); one ending at x < sx - 7 covers none
    // of the samples (it would cover a sample at the full radius). Visible
    // samples are counted here from the authored wall.
    S.count = 0; S.classLive.fill(0); S.recipeLive.fill(0);
    var sx = 180.5, sy = 120.5, rad = 10, alpha = 0.9;
    put(S, 'r.corona', sx, sy, 80, {rpx: rad, alpha: alpha});
    depthFrame(); wall(0, W, 0, H, 50); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1);
    var behind = rec.draws.length, legs = [];
    var samples = [[sx, sy], [sx - rad / 2, sy], [sx + rad / 2, sy], [sx, sy - rad / 2], [sx, sy + rad / 2]];
    [2, 7].forEach(function (gap) {
      depthFrame(); wall(0, sx - gap, 0, H, 50); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1);
      var visible = samples.filter(function (p) { return Math.floor(p[0]) + 0.5 > sx - gap; }).length;
      var level = Math.floor(alpha * visible / 5 * 16), core = rec.draws.filter(function (d) { return d.kind === 'fill'; })[0];
      legs.push({wallEndsAt: sx - gap, visibleSamples: visible, coreAlpha: core && core.alpha, expected: (level + 0.5) / 16,
        ok: !!core && near(core.alpha, (level + 0.5) / 16, 1e-12) && !core.clipped && frameStats().occ.corona === 1});
    });
    check('a glow behind terrain fades by its visible core fraction', behind === 0 && legs[0].visibleSamples === 4 && legs[1].visibleSamples === 5 &&
      legs.every(function (l) { return l.ok; }), {behindWallDraws: behind, legs: legs});
    // Tiles under budget pressure: 100 identical 60-px items over a comb of
    // 14-px bars with 2-px gaps (x mod 16 in {7, 8} visible), so every 8x8
    // tile of every item is mixed and each item costs its whole pixel box.
    S.count = 0; S.classLive.fill(0); S.recipeLive.fill(0);
    for (n = 0; n < 100; n++) put(S, 'r.tiles', 180.3, 120.2, 80, {rpx: 30});
    depthFrame(); for (var bx = -16; bx < W + 16; bx += 16) wall(bx + 9, bx + 23, 0, H, 50);
    G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1);
    var tb = pixelBox(150.3, 90.2, 210.3, 150.2), fit = Math.floor(60000 / (tb.w * tb.h)), ts = frameStats();
    var first = rec.clipPaths.length === 100 ? coverageDiff(rec.clipPaths[0], tb, 1 / 80) : null;
    check('exact tiles clips spend at most the mask budget; the rest fall back to the grid rule', ts.occ.tiles === 100 && ts.maskPx <= 60000 &&
      ts.maskPx > 60000 - 64 && ts.occ.grid === 100 - fit && rec.clips === 100 && rec.draws.length === 100 && rec.draws.every(function (d) { return d.clipped; }) &&
      !!first && first.vis > 0 && first.hid > 0 && !first.leaks.length && !first.holes.length,
      {maskPx: ts.maskPx, budget: 60000, itemPx: tb.w * tb.h, exactItems: fit, grid: ts.occ.grid, tiles: ts.occ.tiles, clips: rec.clips,
        firstItem: first && {leaks: first.leaks.length, holes: first.holes.length}});
    // The last item is past the budget: its clip may err only within one of
    // its 12 x 12 grid cells (5 px here) of the exact visible set.
    var reach = Math.ceil(Math.max(tb.w, tb.h) / 12) - 1, lastPath = rec.clipPaths[rec.clipPaths.length - 1], worst = {leak: 0, hole: 0};
    var last = lastPath ? coverageDiff(lastPath, tb, 1 / 80) : null;
    if (last) {
      last.leaks.forEach(function (q) { worst.leak = Math.max(worst.leak, distToOther(q[0], q[1], false, 1 / 80, reach + 4)); });
      last.holes.forEach(function (q) { worst.hole = Math.max(worst.hole, distToOther(q[0], q[1], true, 1 / 80, reach + 4)); });
    }
    check('over-budget tiles clip within one grid cell of the exact visible set', !!last && last.rects > 0 && worst.leak <= reach && worst.hole <= reach,
      {reach: reach, worstLeakDistance: worst.leak, worstHoleDistance: worst.hole, rects: last && last.rects, leaks: last && last.leaks.length, holes: last && last.holes.length});
    // At native 1920x1080 a mixed tiles item's clip grows with the occluder
    // edge inside it, not with its area: radii 200 and 400 px behind a wall
    // edge mid-tile (bound: two rects per tile row), and radius 200 behind a
    // 45-degree edge (bound: two rects per pixel row plus two per tile row).
    var big = [];
    [[200, 'vertical'], [400, 'vertical'], [200, 'diagonal']].forEach(function (leg) {
      var rpx = leg[0];
      scene(1920, 1080); var SB = install(16, 67), cx = 960.3, cy = 540.2, xe = 8 * Math.floor((cx - 0.4 * rpx) / 8) + 3.5;
      put(SB, 'r.tiles', cx, cy, 80, {rpx: rpx});
      depthFrame();
      if (leg[1] === 'vertical') G.writeSceneDepthPolygon([{x: 0, y: 0, depth: 20}, {x: xe, y: 0, depth: 20}, {x: xe, y: 1080, depth: 20}, {x: 0, y: 1080, depth: 20}]);
      else G.writeSceneDepthPolygon([{x: 0, y: 0, depth: 20}, {x: cx - rpx + 540.2, y: 0, depth: 20}, {x: cx - rpx - 539.8, y: 1080, depth: 20}, {x: 0, y: 1080, depth: 20}]);
      G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1);
      var bb = pixelBox(cx - rpx, cy - rpx, cx + rpx, cy + rpx), d = rec.clipPaths.length === 1 ? coverageDiff(rec.clipPaths[0], bb, 1 / 80) : null;
      big.push({rpx: rpx, edge: leg[1], clips: rec.clips, rects: d ? d.rects : -1,
        bound: (leg[1] === 'vertical' ? 0 : 2 * bb.h) + 2 * Math.ceil(bb.h / 8) + 2, pathCalls: rec.pathCalls, grid: frameStats().occ.grid,
        leaks: d ? d.leaks.length : -1, holes: d ? d.holes.length : -1, vis: d && d.vis, hid: d && d.hid});
    });
    scene();
    check("a mixed tiles item's clip grows with its occluder edge, not its area (1920x1080)", big.every(function (e) {
      return e.clips === 1 && e.rects > 0 && e.rects <= e.bound && e.grid === 0 && e.vis > 0 && e.hid > 0 && e.leaks === 0 && e.holes === 0;
    }), {items: big});
    // Caps: 300 glows against 256 halo draws; 300 mixed items against 256
    // clips (the rest centre-gated); footprint reads for 40-px items against
    // their 50,000 budget, the rule applied here to each item's pixel box.
    var SC = install(1024, 68);
    for (n = 0; n < 300; n++) put(SC, 'r.glow', 20 + (n % 30) * 11, 20 + Math.floor(n / 30) * 20, 60, {rpx: 2});
    depthFrame(); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(0);
    var glow = frameStats();
    SC.count = 0; SC.classLive.fill(0); SC.recipeLive.fill(0);
    for (n = 0; n < 300; n++) put(SC, 'r.clip', 180.3, 10 + (n % 60) * 3.7, 60, {rpx: 3});
    depthFrame(); wall(0, 180, 0, H, 30); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1);
    var mixed = frameStats(), mixedClips = rec.clips, unclippedMixed = 0;
    rec.draws.forEach(function (d) { if (!d.clipped) d.path.forEach(function (q) { if (q[0] === 'arc') unclippedMixed++; }); });
    SC.count = 0; SC.classLive.fill(0); SC.recipeLive.fill(0);
    var footLeft = 50000, footExpected = 0;
    for (n = 0; n < 100; n++) {
      var fx = 25 + (n % 10) * 31, fy = 25 + Math.floor(n / 10) * 19;
      put(SC, 'r.dot', fx, fy, 60, {rpx: 20});
      var fb = pixelBox(fx - 20, fy - 20, fx + 20, fy + 20);
      if (footLeft > 0) { footExpected++; footLeft -= fb.w * fb.h; }
    }
    depthFrame(); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1);
    var foot = frameStats();
    check('the glow, mixed-item and footprint caps hold and are counted when hit', glow.drawn === 300 && glow.glowDraws === 256 && glow.glowCapped === 44 &&
      mixed.occ.clip === 300 && mixed.occ.mixedSkipped === 44 && mixedClips === 256 && unclippedMixed === 44 && mixed.drawn === 300 &&
      foot.occ.footprint === footExpected && foot.occ.tiles === 100 - footExpected && foot.drawn === 100,
      {glow: {drawn: glow.drawn, glowDraws: glow.glowDraws, glowCapped: glow.glowCapped},
        mixed: {clip: mixed.occ.clip, mixedSkipped: mixed.occ.mixedSkipped, clips: mixedClips, unclipped: unclippedMixed, drawn: mixed.drawn},
        footprint: {footprint: foot.occ.footprint, tiles: foot.occ.tiles, expected: footExpected, drawn: foot.drawn}});
  });

  // A torch light (07-decorations-lighting.js buildPointLights) whose flame
  // lands on screen point (sx, sy) at depth fwd (S8 cases).
  function torchAt(sx, sy, fwd) {
    var p = at(sx, sy, fwd);
    return {x: p.x, y: p.y, z: p.z, radius: 90, intensity: 0.55, r: 255, g: 180, b: 80, kind: 'torch', nx: -1, ny: 0};
  }
  // ── C6 re-run with torch glows (S8): under the tiles override a mixed torch
  // glow spends what the particle layers left of the frame's mask budget
  // (exact clips of its mixed tiles only), then falls back to the grid rule;
  // every mixed glow is clipped, the exact ones exactly and the rest within
  // one of their 12 x 12 grid cells; with the budget raised all are exact.
  // In the default corona mode the same glows cost no mask pixel and no
  // clip, and fade by the visible share of their samples.
  // Twelve torches at 172 u (radius 30 px: a 60 px box, 5 px grid cells)
  // behind a wall at 50 u over x < 183: its edge crosses every glow one
  // pixel before a tile boundary (tiles 176-183), so a whole-tile fill would
  // leak 7 px past it, more than one grid cell (4 px). A glow's exact cost is
  // its mixed 8 x 8 tiles (a tile with visible and hidden pixels, read here
  // pixel by pixel), clamped to its box; the budget rule is applied here to
  // those counts.
  var C6T_FLAGS = ['--tiles-ignore-budget', '--tiles-leak-over-budget', '--corona-ignores-depth'];
  if (needed('C6 torch', C6T_FLAGS)) run('C6 torch glows', function () {
    scene(); G.startGameClock(); G.ambientLight = 0.5;
    var S = install(64, 606), n, savedOcc = G.fxTorchGlowOcclusion, FWD = 172, IZ = 1 / FWD;
    var lights = [];
    for (n = 0; n < 12; n++) lights.push(torchAt(180.5, 120.5, FWD));
    function edge183() { wall(0, 183, 0, H, 50); }
    var box = pixelBox(150, 90, 210, 150), reach = Math.ceil(Math.max(box.w, box.h) / 12) - 1;
    depthFrame(); edge183();
    var D = G._sceneDepthInv, cost = 0, mixedTiles = 0;
    for (var ty = box.sy >> 3; ty <= box.ey >> 3; ty++) for (var tx = box.sx >> 3; tx <= box.ex >> 3; tx++) {
      var vis = 0, hid = 0;
      for (var y = ty * 8; y < ty * 8 + 8; y++) for (var x = tx * 8; x < tx * 8 + 8; x++) {
        var inv = D[y * W + x]; if (IZ * (1 + inv * 0.15) + 1e-9 >= inv) vis++; else hid++;
      }
      if (vis && hid) { mixedTiles++; cost += (Math.min(box.ex, tx * 8 + 7) - Math.max(box.sx, tx * 8) + 1) * (Math.min(box.ey, ty * 8 + 7) - Math.max(box.sy, ty * 8) + 1); }
    }
    // fxCombat3D first: exact particle clips (their pixel boxes taken here)
    // until about 4.5 glows' worth of budget is left.
    var spent = 0, clipItems = 0;
    for (n = 0; spent + 3721 <= 60000 - 4.5 * cost; n++) {
      var cy = 35.2 + (n % 8) * 21, pb = pixelBox(150.3, cy - 30, 210.3, cy + 30);
      put(S, 'r.clip', 180.3, cy, 80, {rpx: 30}); spent += pb.w * pb.h; clipItems++;
    }
    var left = 60000 - spent, exact = Math.floor(left / cost);
    function pass(occ, walls, budget) {
      var savedCfg = G.EFFECT_CONFIG;
      if (budget) { var cfg = {}; Object.keys(savedCfg).forEach(function (k) { cfg[k] = savedCfg[k]; }); cfg.maskBudgetPx = budget; G.EFFECT_CONFIG = Object.freeze(cfg); }
      G.fxTorchGlowOcclusion = occ; G.pointLights = lights;
      try {
        depthFrame(); if (walls) walls(); G.beginEffectFrame(); recReset();
        G.drawEffectLayer3D(1); var afterFx = {clips: rec.clips, maskPx: frameStats().maskPx, draws: rec.draws.length};
        G.drawTorchGlowStage3D();
        var images = rec.draws.filter(function (d) { return d.kind === 'image'; });
        return {st: frameStats(), afterFx: afterFx, images: images, clipPaths: rec.clipPaths.slice(afterFx.clips), draws: rec.draws.slice()};
      } finally { G.fxTorchGlowOcclusion = savedOcc; G.pointLights = []; G.EFFECT_CONFIG = savedCfg; }
    }
    function judged(p) {
      var clips = [], worst = 0;
      p.clipPaths.forEach(function (path, k) {
        var d = coverageDiff(path, box, IZ), w = 0;
        d.leaks.forEach(function (q) { w = Math.max(w, distToOther(q[0], q[1], false, IZ, reach + 4)); });
        d.holes.forEach(function (q) { w = Math.max(w, distToOther(q[0], q[1], true, IZ, reach + 4)); });
        worst = Math.max(worst, w);
        clips.push({k: k, leaks: d.leaks.length, holes: d.holes.length, worst: w, vis: d.vis, hid: d.hid});
      });
      return {clips: clips, worst: worst};
    }
    var tp = pass('tiles', edge183), tj = judged(tp), c0 = tj.clips[0] || {};
    check("torch glows under the tiles override share the frame's mask budget; the rest use the grid rule, all clipped",
      cost > 0 && exact >= 1 && exact <= 11 && tp.afterFx.maskPx === spent && tp.st.maskPx <= 60000 &&
      tp.st.maskPx > 60000 - 64 && tp.st.occ.grid === 12 - exact && tp.st.occ.tiles === 12 && tp.st.torch.drawn === 12 && tp.images.length === 12 &&
      tp.images.every(function (d) { return d.clipped; }) && tj.clips.length === 12 && c0.leaks === 0 && c0.holes === 0 && c0.vis > 0 && c0.hid > 0 &&
      tj.worst <= reach,
      {maskPx: tp.st.maskPx, overBudgetBy: Math.max(0, tp.st.maskPx - 60000), particles: spent, particleItems: clipItems, budget: 60000, glowCost: cost, mixedTiles: mixedTiles,
        exactGlows: exact, grid: tp.st.occ.grid, torch: tp.st.torch, images: tp.images.length, unclipped: tp.images.filter(function (d) { return !d.clipped; }).length,
        reach: reach, worstDistance: tj.worst, clips: tj.clips.filter(function (c) { return c.worst > reach || c.k === 0; }).slice(0, 3)});
    var rp = pass('tiles', edge183, 1e9), rj = judged(rp);
    check('with the budget raised every mixed torch glow uses the exact clip', rp.st.occ.grid === 0 && rp.st.maskPx === spent + 12 * cost &&
      rj.clips.length === 12 && rj.clips.every(function (c) { return c.leaks === 0 && c.holes === 0 && c.vis > 0 && c.hid > 0; }) &&
      rp.images.length === 12 && rp.images.every(function (d) { return d.clipped; }),
      {grid: rp.st.occ.grid, maskPx: rp.st.maskPx, expected: spent + 12 * cost, clips: rj.clips.filter(function (c) { return c.leaks || c.holes; }).slice(0, 3)});
    // Corona: the same glows over the same edge; five samples at the centre
    // (180, 120) and 6 px (half the 0.4 R core) around it, visible where the
    // pixel centre lies right of the authored edge x = 183.
    var q = 0.2 * 30, pts = [[180, 120], [180 - q, 120], [180 + q, 120], [180, 120 - q], [180, 120 + q]];
    var seen = pts.filter(function (p) { return Math.floor(p[0]) + 0.5 > 183; }).length;
    var open = pass('corona'), cp = pass('corona', edge183), a0 = open.images.length ? open.images[0].alpha : NaN;
    check('corona torch glows cost no mask pixel and no clip, and fade by their visible samples',
      seen >= 1 && seen <= 4 && open.images.length === 12 && cp.st.maskPx === spent && cp.clipPaths.length === 0 && cp.st.occ.corona === 12 &&
      cp.images.length === 12 && cp.images.every(function (d) { return !d.clipped && near(d.alpha, a0 * seen / 5, 1e-12); }),
      {visibleSamples: seen, openAlpha: a0, alphas: cp.images.map(function (d) { return d.alpha; }).slice(0, 3), maskPx: cp.st.maskPx, particles: spent,
        torchClips: cp.clipPaths.length, corona: cp.st.occ.corona});
  });

  // ── C7: lit particles darken at night; emissive ones do not. Underground
  // particles take the cave ambient; distance fog and the emissive night
  // boost scale alpha (section 5.6).
  if (needed('C7', ['--emissive-lit', '--under-uses-surface', '--no-fog', '--no-night-boost'])) run('C7 lighting', function () {
    scene(); var S = install(64, 77);
    put(S, 'r.lit', 100, 100, 60, {rpx: 3}); put(S, 'r.emissive', 250, 100, 60, {rpx: 3});
    put(S, 'r.lit', 100, 180, 60, {rpx: 3, flags: 32});                                  // underground
    put(S, 'r.emissive', 250, 60, 600, {rpx: 3});                                        // far
    put(S, 'r.emissive', 300, 140, 60, {rpx: 3, alpha: 0.5});                            // half alpha
    function styles(surface, cave) {
      G.renderSurfaceAmbient = surface; G.renderCaveAmbient = cave; depthFrame(); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1);
      var lit = drawsNear(100, 100, 0.5)[0], em = drawsNear(250, 100, 0.5)[0], under = drawsNear(100, 180, 0.5)[0], far = drawsNear(250, 60, 0.5)[0], half = drawsNear(300, 140, 0.5)[0];
      return {lit: lit && lit.style, em: em && em.style, under: under && under.style, emAlpha: em && em.alpha, farAlpha: far && far.alpha, halfAlpha: half && half.alpha};
    }
    function channel(style) { return +/rgb\((\d+),/.exec(style)[1]; }
    var day = styles(0.9, 0.45), night = styles(0.32, 0.45), cave = styles(0.9, 0.2), bright = styles(0.9, 0.9);
    function spriteLight(a) { return a < 0.85 ? 0.3 + 0.7 * a : 1; }
    var levels = [0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92, 1.0], want = spriteLight(0.32) / spriteLight(0.9), got = channel(night.lit) / channel(day.lit);
    check('lit particles darken at night; emissive ones do not', !!day.lit && !!night.lit && Math.abs(got - want) <= 0.06 + 1 / 180 &&
      levels.some(function (l) { return Math.abs(got - l) <= 0.01; }) && day.em === night.em,
      {day: day, night: night, litRatio: got, spriteLightRatio: want});
    var underRatio = channel(cave.under) / channel(cave.lit), underWant = spriteLight(0.2) / spriteLight(0.9);
    check('underground particles take the cave ambient', !!cave.under && Math.abs(underRatio - underWant) <= 0.06 + 1 / 180 &&
      bright.under === bright.lit && cave.lit === bright.lit, {surfaceAmbient: 0.9, underRatio: underRatio, spriteLightRatio: underWant,
        caveAmbient02: {under: cave.under, surface: cave.lit}, caveAmbient09: {under: bright.under, surface: bright.lit}});
    // Alpha levels are quantised to 16 (section 5.4); fog is the wall formula
    // max(0.3, 1 - fwd * 0.0008) at the surface; night = 1 at ambient 0.32.
    function level(a) { var A = a >= 1 ? 15 : Math.floor(a * 16); return (A + 0.5) / 16; }
    function fog(fwd) { return Math.max(0.3, 1 - fwd * 0.0008); }
    var expect = {near: level(fog(60)), far: level(fog(600)), halfDay: level(0.5 * fog(60)), halfNight: level(0.5 * fog(60) * 1.3)};
    check('distant particles fade with the wall fog and emissive ones brighten at night', near(day.emAlpha, expect.near, 1e-12) &&
      near(day.farAlpha, expect.far, 1e-12) && near(day.halfAlpha, expect.halfDay, 1e-12) && near(night.halfAlpha, expect.halfNight, 1e-12) &&
      expect.far < expect.near && expect.halfNight > expect.halfDay,
      {day: {near: day.emAlpha, far: day.farAlpha, half: day.halfAlpha}, night: {half: night.halfAlpha}, expected: expect});
    G.renderSurfaceAmbient = 0.9; G.renderCaveAmbient = 0.45;
  });

  // ── C8: the 2D particle stage culls off-screen particles.
  if (needed('C8', ['--no-2d-cull', '--2d-reopens-frame'])) run('C8 2D cull', function () {
    scene(); var S = install(1024, 88), rand = lcg(8888);
    G.MODE3D = false; G.viewCam = {x: 1000, y: 1000};
    for (var n = 0; n < 500; n++) {
      var i = put(S, 'r.dot', 180, 120, 50), side = n % 4;
      S.x[i] = side === 0 ? 1000 - 20 - rand() * 400 : side === 1 ? 1000 + W + 20 + rand() * 400 : 1000 + rand() * W;
      S.y[i] = side === 2 ? 1000 - 20 - rand() * 400 : side === 3 ? 1000 + H + 20 + rand() * 400 : 1000 + rand() * H;
      S.size[i] = 2;
    }
    for (n = 0; n < 50; n++) { var j = put(S, 'r.dot', 180, 120, 50); S.x[j] = 1010 + rand() * (W - 20); S.y[j] = 1010 + rand() * (H - 20); S.size[j] = 2; }
    recReset(); G.drawEffectLayer2D();
    var discs = 0;
    rec.draws.forEach(function (d) { if (d.kind === 'fill') d.path.forEach(function (c) { if (c[0] === 'arc' || c[0] === 'rect') discs++; }); });
    check('the 2D particle stage culls off-screen particles', discs === 50 && frameStats().drawn === 50 && frameStats().offscreen === 500,
      {discs: discs, drawn: frameStats().drawn, offscreen: frameStats().offscreen});
    G.MODE3D = true;
    // A 2D pass inside an open 3D frame (an inset, a debug view) joins that
    // frame: its counters and per-frame budgets are not refilled, which would
    // double every cap. Six particles drawn in 3D, then the same six in 2D.
    scene(); var S3 = install(64, 89);
    for (n = 0; n < 6; n++) put(S3, 'r.glow', 60 + n * 40, 120, 60, {rpx: 2});
    depthFrame(); G.beginEffectFrame(); G.drawEffectLayer3D(0);
    var in3D = {drawn: frameStats().drawn, glowDraws: frameStats().glowDraws, glowLeft: G._fxFrame.glowLeft};
    G.viewCam = {x: S3.x[0] - 180, y: S3.y[0] - 120}; G.drawEffectLayer2D();
    var joined = {drawn: frameStats().drawn, glowDraws: frameStats().glowDraws, glowLeft: G._fxFrame.glowLeft};
    check('a 2D pass inside an open 3D frame shares its counters and budgets', in3D.drawn === 6 && in3D.glowDraws === 6 && joined.drawn === 12 &&
      joined.glowDraws === 6 && joined.glowLeft === in3D.glowLeft, {after3D: in3D, after2D: joined});
  });

  // ── C9 (T20): count-based gates for 2,000 particles over 120 frames.
  var gateResult = null;
  function t20(drawFrame, frames, warm) {
    var clipCalls = 0, savedClip = G.withSceneDepthClip, names = ['Float64Array', 'Float32Array', 'Int32Array', 'Uint32Array', 'Int16Array', 'Uint16Array', 'Uint8Array'], saved = {};
    var worst = {clipShare: 0, maskPx: 0, pathPerDrawn: 0, bucketsMax: 0}, typed = 0, blur = 0, drawnMin = Infinity;
    G.withSceneDepthClip = function () { clipCalls++; return savedClip.apply(G, arguments); };
    try {
      for (var f = 0; f < frames; f++) {
        if (f === warm) names.forEach(function (n) {
          var Orig = saved[n] = G[n], wrapped = function (a, b, c) { typed++; return new Orig(a, b, c); };
          Object.getOwnPropertyNames(Orig).forEach(function (p) { try { if (!(p in wrapped)) wrapped[p] = Orig[p]; } catch (e) {} });
          wrapped.prototype = Orig.prototype; G[n] = wrapped;
        });
        clipCalls = 0; recReset();
        var drawn = drawFrame(f);
        if (f < warm) continue;
        var st = frameStats();
        drawnMin = Math.min(drawnMin, drawn);
        worst.clipShare = Math.max(worst.clipShare, clipCalls / Math.max(1, drawn));
        worst.maskPx = Math.max(worst.maskPx, st.maskPx);
        worst.pathPerDrawn = Math.max(worst.pathPerDrawn, rec.pathCalls / Math.max(1, drawn));
        worst.bucketsMax = Math.max(worst.bucketsMax, st.bucketsMax);
        blur += rec.blurSets;
      }
    } finally { G.withSceneDepthClip = savedClip; names.forEach(function (n) { if (saved[n]) G[n] = saved[n]; }); }
    return {worst: worst, typed: typed, blur: blur, drawnMin: drawnMin};
  }
  function t20Pass(r) { return r.worst.clipShare <= 0.02 && r.worst.maskPx <= 60000 && r.worst.pathPerDrawn <= 2.5 && r.worst.bucketsMax <= 96 && !r.typed && !r.blur; }
  if (needed('C9', ['--per-particle-billboard', '--scratch-exact-fit'])) run('C9 count gates', function () {
    scene(); var S = install(3072, 99, {reserve: 256}), rand = lcg(9999);
    var mix = [['r.dot', 0.8, 2.2], ['r.world', 0.8, 2], ['r.streak', 0.8, 1.2], ['r.puff', 2, 5], ['r.ring', 2, 4], ['r.chip', 1, 2.5], ['r.glow', 1, 2], ['r.dotB', 0.8, 1.2]];
    for (var n = 0; n < 2000; n++) {
      var m = mix[n % mix.length], sx = 5 + rand() * 350, sy = 5 + rand() * 230, i = put(S, m[0], sx, sy, 20 + rand() * 250,
        {rpx: m[1] + rand() * (m[2] - m[1]), alpha: [0.4, 0.8][n % 2], rot: rand() * 6});
      if (m[0] === 'r.streak') { S.vy[i] = (rand() - 0.5) * 300; S.vz[i] = -200 - rand() * 200; }
    }
    function frame() { depthFrame(); wall(0, 120, 0, H, 25); G.beginEffectFrame(); G.drawEffectLayer3D(1); G.drawEffectLayer3D(0); return frameStats().drawn; }
    gateResult = t20(frame, 120, 20);
    check('the T20 scene draws its particles', gateResult.drawnMin >= 1000, {drawnMin: gateResult.drawnMin});
    check('count-based performance gates hold for 2,000 particles', t20Pass(gateResult),
      {worst: gateResult.worst, typedArrays: gateResult.typed, blurSets: gateResult.blur,
        gates: {clipShare: 0.02, maskPx: 60000, pathPerDrawn: 2.5, bucketsPerPass: 96}});
    // Sensitivity: the legacy mote drawer at N = 2,000 fails these gates.
    S.count = 0; S.classLive.fill(0); S.recipeLive.fill(0);
    var motes = [];
    for (n = 0; n < 2000; n++) {
      var p = at(5 + rand() * 350, 5 + rand() * 230, 20 + rand() * 250);
      motes.push({x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, alpha: 0.3, maxAlpha: 0.3, life: 3, maxLife: 5, size: 1.5, type: 'dust', r: 180, g: 160, b: 120});
    }
    G.ambientParticles = motes;
    var legacy = t20(function () { depthFrame(); wall(0, 120, 0, H, 25); G.beginEffectFrame(); G.drawAmbientParticles3D(); return rec.draws.length; }, 4, 1);
    G.ambientParticles = [];
    check('the legacy mote drawer at 2,000 fails the same gates', !t20Pass(legacy) && legacy.worst.clipShare > 0.5, {worst: legacy.worst});
    // The live count rises across frames (a burst or weather ramping up) on
    // a fresh page: the pass scratch is sized from the pool's capacity at the
    // first frame, so no typed array is built after it.
    S.count = 0; S.classLive.fill(0); S.recipeLive.fill(0);
    for (n = 0; n < 600; n++) put(S, 'r.dot', 5 + rand() * 350, 5 + rand() * 230, 20 + rand() * 250, {rpx: 1});
    G._fxCapItems = 0;                                                     // a fresh page: no scratch yet
    var grow = t20(function () {
      for (var q = 0; q < 4; q++) put(S, 'r.dot', 5 + rand() * 350, 5 + rand() * 230, 20 + rand() * 250, {rpx: 1});
      depthFrame(); G.beginEffectFrame(); G.drawEffectLayer3D(1); return frameStats().drawn;
    }, 202, 2);
    check('the pass scratch never grows while the live count rises', grow.typed === 0 && S.count === 1408 && grow.drawnMin >= 600,
      {typedArraysAfterWarmUp: grow.typed, count: S.count, drawnMin: grow.drawnMin});
  });

  // ── C10 (S8): the torch glow stage on the shared primitives (section 5.9,
  // Revision 3). Against the legacy drawTorchGlow3D on the same light: the
  // torch sprite's gradient (stop positions, colours and alpha ratios; its
  // circle covers the drawn square), the centre, and the radius at 3:2 (and
  // at 0.6 h near a torch, where the legacy radius outgrows the canvas); a
  // sprite miss draws the same stops as a gradient. At 16:9 the radius
  // follows projScale (the legacy width-based one is 18.5% larger). The
  // legacy alpha law (day/night base, distance) holds with a flicker phase
  // keyed by the light's world position, unchanged by a reordered list or a
  // 480 u window shift. Corona: a glow whose centre and core are behind a
  // wall is not drawn; one partly covered draws at the visible share of its
  // five samples, unclipped. The nearest 12 on-screen lights within 400 u
  // are drawn; Legacy mode is the legacy command stream; the Canvas state is
  // restored with no blur; with no light on screen there is no Canvas call.
  var C10_FLAGS = ['--glow-width-radius', '--corona-ignores-depth', '--torch-stage-always-new', '--torch-keep-first', '--flicker-index',
    '--flicker-local', '--leak-composite', '--torch-save-always', '--corona-offframe-visible', '--corona-offframe-hidden', '--torch-cull-centre',
    '--torch-cull-open', '--torch-depth-distance', '--torch-occlusion-after-selection', '--torch-no-min-radius', '--flicker-fast',
    '--torch-mixed-cap-ignored', '--torch-over-cap-hidden'];
  if (needed('C10', C10_FLAGS)) run('C10 torch glow', function () {
    function rgba(str) { var m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(str); return m ? [+m[1], +m[2], +m[3], +m[4]] : null; }
    var builds = [], states = [];
    // A document whose sprite canvases record their radial gradient.
    function spriteDoc() {
      return {createElement: function () {
        var b = {args: null, stops: [], el: {width: 0, height: 0}};
        b.el.getContext = function () {
          return {fillRect: function () {}, createRadialGradient: function () {
            b.args = Array.prototype.slice.call(arguments);
            return {addColorStop: function (o, c) { b.stops.push([o, c]); }};
          }};
        };
        builds.push(b); return b.el;
      }};
    }
    function spriteOf(f, d) { var el = f.imgs[d.src]; return builds.filter(function (b) { return b.el === el; })[0]; }
    function images(f) { return f.draws.filter(function (d) { return d.kind === 'image'; }); }
    // One torchGlow3D frame: mode 'legacy' or null (the default, New); walls
    // write scene depth; doc stands in for the document of sprite builds.
    function glowFrame(mode, walls, doc) {
      var savedDoc = G.document, op0 = state.globalCompositeOperation, a0 = state.globalAlpha;
      G.setEffectFamilyMode('torchGlow', mode);
      if (doc) G.document = doc;
      G._fxSprites.clear(); G._fxSpriteBytes = 0;
      try {
        depthFrame(); if (walls) walls(); G.beginEffectFrame(); recReset(); G.drawTorchGlowStage3D();
        var f = {draws: rec.draws.slice(), grads: rec.gradients.slice(), imgs: rec.imgs.slice(), st: frameStats(), clips: rec.clips};
        if (!mode) states.push({blur: rec.blurSets, depth: rec.stack.length, underflow: rec.underflow, op: state.globalCompositeOperation, opBefore: op0,
          alpha: state.globalAlpha, alphaBefore: a0, lighter: f.draws.every(function (d) { return d.op === 'lighter'; })});
        return f;
      } finally { G.document = savedDoc; G.setEffectFamilyMode('torchGlow', null); G._fxSprites.clear(); G._fxSpriteBytes = 0; }
    }
    scene(); G.startGameClock(); install(16, 1010); G.ambientLight = 0.5;
    var mode0 = G.effectFamilyMode('torchGlow');
    // (1) 3:2: the sprite against the legacy gradient of the same light.
    var legs = [], cap = Math.floor(0.6 * H);
    [20, 40, 55, 80, 120, 200, 320, 390].forEach(function (fwd) {
      G.pointLights = [torchAt(150.5, 100.5, fwd)];
      var Lf = glowFrame('legacy'), Nf = glowFrame(null, null, spriteDoc()), Ff = glowFrame(null, null, {});
      var gr = Lf.grads[0], img = images(Nf)[0], b = img && spriteOf(Nf, img), fb = Ff.grads[0];
      var fr = Ff.draws.filter(function (d) { return d.kind === 'fillRect'; })[0];
      var Lt = G.pointLights[0], d = Math.hypot(Lt.x - G.cam.x, Lt.y - G.cam.y), now = G.gameTimeNow();
      // The legacy law restated (15-render-hud-menu.js drawTorchGlow3D, list index 0).
      var base = 0.08 + 0.22 * Math.max(0, 1 - G.ambientLight), dist = Math.max(0.2, 1 - d / 400);
      var aL = base * (0.95 + 0.03 * Math.sin(now * 0.007) + 0.02 * Math.sin(now * 0.013)) * dist;
      function stops(g) { return g ? g.stops.map(function (s) { return [s[0], rgba(s[1])]; }) : []; }
      var ls = stops(gr), ss = stops(b), fs = stops(fb), R = gr ? gr.args[5] : NaN, want = Math.min(R, cap);
      var px = 2 * want <= 16 ? 16 : 2 * want <= 32 ? 32 : 2 * want <= 64 ? 64 : 128;    // the sprite buckets (section 5.5)
      // Same positions and colours; each stop's alpha x the legacy alpha is the
      // legacy stop's alpha (toFixed(3) there).
      function sameStops(t) {
        return t.length === 3 && ls.length === 3 && ls.every(function (s, k) {
          var u = t[k];
          return !!s[1] && !!u[1] && s[0] === u[0] && s[1][0] === u[1][0] && s[1][1] === u[1][1] && s[1][2] === u[1][2] &&
            Math.abs(s[1][3] - u[1][3] * aL) <= 0.0005 + 1e-12;
        });
      }
      var ok = !!gr && !!img && !!b && !!fb && !!fr && Math.abs(ls[0][1][3] - aL * 0.7) <= 0.0005 + 1e-12 && sameStops(ss) &&
        img.x + img.w / 2 === gr.args[0] && img.y + img.h / 2 === gr.args[1] && img.w === img.h && img.w / 2 === want && !img.clipped &&
        b.el.width === px && b.el.height === px && b.args.join() === [px / 2, px / 2, 0, px / 2, px / 2, px / 2].join() &&
        img.alpha / (base * dist) >= 0.9 - 1e-12 && img.alpha / (base * dist) <= 1 + 1e-12 &&
        fb.args.join() === [gr.args[0], gr.args[1], 0, gr.args[0], gr.args[1], want].join() && sameStops(fs) &&
        fr.x === gr.args[0] - want && fr.y === gr.args[1] - want && fr.w === 2 * want && Ff.st.spriteFallback === 1;
      legs.push({fwd: fwd, legacyR: R, newR: img && img.w / 2, cap: cap, spritePx: b && b.el.width, legacyStops: ls, spriteStops: ss,
        fallbackStops: fs, alphaLegacy: aL, alphaNew: img && img.alpha, ok: ok});
    });
    check('the torch glow sprite matches the legacy gradient (stops, colours, alpha, centre and radius at 3:2)', mode0 === 'new' &&
      legs.every(function (l) { return l.ok; }) && legs[0].legacyR > cap && legs[0].newR === cap &&
      legs.slice(1).every(function (l) { return l.legacyR <= cap; }),
      {familyMode: mode0, legs: legs.filter(function (l, k) { return !l.ok || !k; })});
    // (2) 16:9 (640 x 360, projScale 270): the radius is 28.8 projScale smGlow
    // / fwd in whole px (at least 10, at most 0.6 h); the legacy radius is
    // width-based, (640 x 0.12) / (270 x 0.24) = 1.185 times that before the
    // floor, and larger than the canvas near a torch.
    scene(640, 360); install(16, 1011); G.ambientLight = 0.5;
    var wide = [], ps = G.projScale, cap2 = Math.floor(0.6 * 360);
    [12, 60, 100, 200, 300].forEach(function (fwd) {
      G.pointLights = [torchAt(320.5, 150.5, fwd)];
      var gr = glowFrame('legacy').grads[0], img = images(glowFrame(null, null, spriteDoc()))[0];
      var v = 28.8 * ps / fwd, expect = Math.min(Math.max(10, Math.floor(v)), cap2), got = img ? img.w / 2 : NaN;
      wide.push({fwd: fwd, expected: expect, got: got, legacy: gr ? gr.args[5] : NaN,
        ok: got === expect || Math.abs(v - Math.round(v)) < 1e-9 && Math.abs(got - expect) <= 1});
    });
    check('at 16:9 the torch glow radius follows projScale, not the width (capped at 0.6 h)', wide.every(function (l) { return l.ok; }) &&
      wide.every(function (l) { return l.legacy === Math.max(10, Math.floor(640 * 0.12 * (120 / l.fwd))) && l.legacy > l.got; }) &&
      wide[0].got === cap2 && wide[0].legacy > 640,
      {legs: wide, projScale: ps, cap: cap2});
    // (2b) A small canvas (240 x 160, projScale 120): a torch 390 u away keeps
    // the legacy 10 px floor (8.86 px before it, New and legacy alike at 3:2).
    scene(240, 160); install(16, 1018); G.ambientLight = 0.5;
    G.pointLights = [torchAt(120.5, 80.5, 390)];
    var smallL = glowFrame('legacy').grads[0], smallN = images(glowFrame(null, null, spriteDoc()))[0];
    check('on a small canvas a far torch glow keeps the legacy 10 px radius floor', !!smallL && !!smallN && smallL.args[5] === 10 &&
      smallN.w / 2 === 10 && Math.floor(28.8 * 120 / 390) < 10,
      {legacyR: smallL && smallL.args[5], newR: smallN && smallN.w / 2, beforeFloor: Math.floor(28.8 * 120 / 390)});
    // (3) The alpha law and the flicker phase, three lights at 3:2.
    scene(); install(16, 1012); G.ambientLight = 0.5;
    var A = torchAt(120.5, 100.5, 70), B = torchAt(200.5, 110.5, 90), C3 = torchAt(260.5, 95.5, 110);
    function alphaByCentre(list) {
      G.pointLights = list; var out = {};
      images(glowFrame(null, null, spriteDoc())).forEach(function (d) { out[(d.x + d.w / 2) + ',' + (d.y + d.h / 2)] = d.alpha; });
      return out;
    }
    function one(m) { return m[Object.keys(m)[0]]; }
    function sameMap(a, b) { var ka = Object.keys(a); return ka.length === 3 && Object.keys(b).length === 3 && ka.every(function (k) { return b[k] === a[k]; }); }
    function df(cx) { return Math.max(0.2, 1 - Math.hypot(A.x - cx, A.y - G.cam.y) / 400); }
    G.ambientLight = 1.0; var day = one(alphaByCentre([A])); G.ambientLight = 0.2; var night = one(alphaByCentre([A])); G.ambientLight = 0.5;
    var camX = G.cam.x, near1 = one(alphaByCentre([A])); G.cam.x = camX - 60; var far1 = one(alphaByCentre([A])); G.cam.x = camX;
    var flick = [], times = [], base5 = 0.08 + 0.22 * 0.5;
    for (var t = 0; t < 40; t++) { times.push(G.gameTimeNow()); flick.push(one(alphaByCentre([A])) / (base5 * df(camX))); G.advanceGameClock(0.075); }
    var fmin = Math.min.apply(null, flick), fmax = Math.max.apply(null, flick);
    // The legacy flicker restated, 0.95 + 0.03 sin(0.007 t + p1) + 0.02 sin(0.013 t + p2)
    // (t in game ms), with its two phases free: a least-squares fit on the
    // sines and cosines of both frequencies; the amplitudes and the residual
    // pin the law, whatever phase the light's position gives it.
    function fitFlicker(ts, fs) {
      var M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], v = [0, 0, 0, 0], x = [0, 0, 0, 0], i, j, c, r;
      function basis(tt) { return [Math.sin(0.007 * tt), Math.cos(0.007 * tt), Math.sin(0.013 * tt), Math.cos(0.013 * tt)]; }
      ts.forEach(function (tt, k) { var b = basis(tt); for (i = 0; i < 4; i++) { v[i] += b[i] * (fs[k] - 0.95); for (j = 0; j < 4; j++) M[i][j] += b[i] * b[j]; } });
      for (c = 0; c < 4; c++) {
        var piv = c; for (r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
        var tm = M[c]; M[c] = M[piv]; M[piv] = tm; var tv = v[c]; v[c] = v[piv]; v[piv] = tv;
        for (r = c + 1; r < 4; r++) { var f = M[r][c] / M[c][c]; for (j = c; j < 4; j++) M[r][j] -= f * M[c][j]; v[r] -= f * v[c]; }
      }
      for (i = 3; i >= 0; i--) { var sum = v[i]; for (j = i + 1; j < 4; j++) sum -= M[i][j] * x[j]; x[i] = sum / M[i][i]; }
      var res = 0;
      ts.forEach(function (tt, k) { var b = basis(tt); res = Math.max(res, Math.abs(0.95 + x[0] * b[0] + x[1] * b[1] + x[2] * b[2] + x[3] * b[3] - fs[k])); });
      return {a1: Math.hypot(x[0], x[1]), a2: Math.hypot(x[2], x[3]), residual: res};
    }
    var fit = fitFlicker(times, flick);
    var order1 = alphaByCentre([A, B, C3]), order2 = alphaByCentre([C3, B, A]);
    // A 480 u window shift in Endless: lights and camera -480 u, origin +480 u.
    function shifted(L) { var o = Object.assign({}, L); o.x -= 480; return o; }
    var before, after;
    G.ENDLESS_MODE = true; G.windowOriginX = 0;
    try {
      before = alphaByCentre([A, B, C3]);
      G.cam.x -= 480; G.windowOriginX = 480;
      after = alphaByCentre([shifted(A), shifted(B), shifted(C3)]);
    } finally { G.cam.x = camX; G.windowOriginX = 0; G.ENDLESS_MODE = false; }
    var wantBase = (0.08 + 0.22 * 0.8) / 0.08, wantDist = df(camX - 60) / df(camX);
    check('torch glow alpha keeps the legacy law with a flicker phase keyed by world position', near(night / day, wantBase, 1e-9) &&
      near(far1 / near1, wantDist, 1e-9) && fmin >= 0.9 - 1e-9 && fmax <= 1 + 1e-9 && fmax - fmin > 0.01 && near(fit.a1, 0.03, 1e-9) &&
      near(fit.a2, 0.02, 1e-9) && fit.residual < 1e-9 && sameMap(order1, order2) && sameMap(before, after),
      {baseRatio: night / day, wantBase: wantBase, distRatio: far1 / near1, wantDist: wantDist, flicker: [fmin, fmax], fit: fit,
        reordered: [order1, order2], shift: [before, after]});
    // (4) Corona: a glow 80 u away (R 64 px; samples at its centre and 12.8
    // px, half its 0.4 R core, around it) behind walls at 40 u over x < edge.
    scene(); install(16, 1013); G.ambientLight = 0.5;
    G.pointLights = [torchAt(180.5, 120.5, 80)];
    var open = images(glowFrame(null, null, spriteDoc()))[0], Rr = open ? open.w / 2 : NaN, q = 0.2 * Rr, cx = open ? open.x + Rr : NaN, cy = open ? open.y + Rr : NaN;
    var samples = [[cx, cy], [cx - q, cy], [cx + q, cy], [cx, cy - q], [cx, cy + q]], corona = [];
    [W, 175, 187].forEach(function (edge) {
      var f = glowFrame(null, function () { wall(0, edge, 0, H, 40); }, spriteDoc()), img = images(f)[0];
      var visible = samples.filter(function (p) { return Math.floor(p[0]) + 0.5 > edge; }).length;
      corona.push({wallEndsAt: edge, visibleSamples: visible, drawn: images(f).length, alpha: img ? img.alpha : 0, clipped: !!img && img.clipped,
        expected: open ? open.alpha * visible / 5 : NaN, clips: f.clips, hidden: f.st.torch.hidden, maskPx: f.st.maskPx, corona: f.st.occ.corona});
    });
    check('a torch glow behind terrain fades by its visible core fraction (corona)', !!open && Rr === 64 && corona[0].drawn === 0 &&
      corona[0].hidden === 1 && corona[1].visibleSamples === 4 && corona[2].visibleSamples === 1 && corona.every(function (c) { return c.corona === 1; }) &&
      corona.slice(1).every(function (c) { return c.drawn === 1 && near(c.alpha, c.expected, 1e-12) && !c.clipped && c.clips === 0 && c.maskPx === 0; }),
      {behindWallDraws: corona[0].drawn, radius: Rr, legs: corona});
    // (4b) Off the frame's edge: a torch 80 u away (R 64) centred 19 px (0.3
    // R) past the left, right or top edge, all five corona samples off the
    // frame. Behind a full-screen wall at 40 u (the on-screen part of its box
    // hidden, as the legacy clip finds it) it is not drawn; in the open it is
    // not culled and draws its on-screen fringe at the full alpha (the tiles
    // override's unscaled alpha for the same light). A glow whose box ends
    // exactly at the left edge covers no pixel: culled, no Canvas call; one
    // pixel further in it is drawn.
    scene(); install(16, 1015); G.ambientLight = 0.5;
    var offLegs = [];
    [[-18.5, 120.5, 'left'], [W + 19.5, 120.5, 'right'], [180.5, -18.5, 'top']].forEach(function (e) {
      G.pointLights = [torchAt(e[0], e[1], 80)];
      var hid = glowFrame(null, function () { wall(0, W, 0, H, 40); }, spriteDoc()), opn = glowFrame(null, null, spriteDoc()), full;
      G.fxTorchGlowOcclusion = 'tiles';
      try { full = images(glowFrame(null, null, spriteDoc()))[0]; } finally { G.fxTorchGlowOcclusion = 'corona'; }
      var im = images(opn)[0];
      offLegs.push({edge: e[2], hiddenDrawn: images(hid).length, hiddenCounted: hid.st.torch.hidden, openDrawn: images(opn).length, openCulled: opn.st.torch.culled,
        openAlpha: im ? im.alpha : 0, fullAlpha: full ? full.alpha : NaN, centre: im ? [im.x + im.w / 2, im.y + im.h / 2] : null});
    });
    G.pointLights = [torchAt(-63.5, 120.5, 80)];
    var zero = glowFrame(null, null, spriteDoc()), zeroCalls = zero.draws.length;
    G.pointLights = [torchAt(-62.5, 120.5, 80)];
    var one1 = glowFrame(null, null, spriteDoc());
    check('a hidden torch glow just past the screen edge stays hidden (corona samples judged at the frame\'s nearest pixel)',
      offLegs.every(function (l) { return l.hiddenDrawn === 0 && l.hiddenCounted === 1; }), {legs: offLegs});
    check('a torch glow centred off screen draws its fringe at full alpha; one covering no pixel is culled',
      offLegs.every(function (l) { return l.openDrawn === 1 && l.openCulled === 0 && l.openAlpha > 0 && near(l.openAlpha, l.fullAlpha, 1e-12); }) &&
      zero.st.torch.culled === 1 && zeroCalls === 0 && images(one1).length === 1 && one1.st.torch.culled === 0,
      {legs: offLegs, zeroCoverage: {culled: zero.st.torch.culled, draws: zeroCalls}, onePixel: {drawn: images(one1).length, culled: one1.st.torch.culled}});
    // (5) Selection: 14 lights on screen (listed farthest first), 3 behind or
    // at the camera, 2 beyond 400 u and 3 whose glow box is off screen.
    scene(); install(16, 1014); G.ambientLight = 0.5;
    var on = [];
    for (var k = 0; k < 14; k++) { var Lk = torchAt(40 + (k * 97) % 280, 60 + (k * 53) % 120, 30 + k * 19); on.push({L: Lk, d: Math.hypot(Lk.x - G.cam.x, Lk.y - G.cam.y)}); }
    G.pointLights = on.map(function (e) { return e.L; }).reverse().concat([torchAt(180, 120, -50), torchAt(180, 120, 2), torchAt(180, 120, 4.9),
      torchAt(180, 120, 410), torchAt(180, 120, 450), torchAt(W + 100, 120, 100), torchAt(-150, 120, 100), torchAt(180, -200, 100)]);
    var sel = glowFrame(null, null, spriteDoc()), drawn = images(sel).map(function (d) { return [d.x + d.w / 2, d.y + d.h / 2]; });
    var want12 = on.slice().sort(function (a, b) { return a.d - b.d; }).slice(0, 12).map(function (e) {
      var p = toScreen(e.L.x, e.L.y, e.L.z); return [Math.floor(p.x), Math.floor(p.y)];
    });
    var missing = want12.filter(function (p) { return !drawn.some(function (c) { return Math.abs(c[0] - p[0]) <= 1 && Math.abs(c[1] - p[1]) <= 1; }); });
    check('the torch glow stage draws the nearest 12 on-screen lights within 400 u', on.every(function (e) { return e.d < 400; }) &&
      drawn.length === 12 && !missing.length && sel.st.torch.drawn === 12 && sel.st.torch.culled === 3 && sel.st.torch.dropped === 2,
      {drawn: drawn.length, missing: missing, torch: sel.st.torch});
    // (5b) Occlusion before selection: 6 near torches (25-40 u) behind a
    // wall at 20 u over x < 150, all their samples on it, and 12 farther ones
    // (60-192 u) in the open right half: the 12 open ones are drawn, the 6
    // hidden ones counted, none dropped.
    scene(); install(16, 1019); G.ambientLight = 0.5;
    var hiddenL = [], openL = [];
    for (k = 0; k < 6; k++) hiddenL.push(torchAt(45 + k * 12, 70 + k * 18, 25 + k * 3));
    for (k = 0; k < 12; k++) openL.push(torchAt(215 + (k % 4) * 35, 60 + Math.floor(k / 4) * 50, 60 + k * 12));
    G.pointLights = hiddenL.concat(openL);
    var occF = glowFrame(null, function () { wall(0, 150, 0, H, 20); }, spriteDoc()), gotC = images(occF).map(function (d) { return [d.x + d.w / 2, d.y + d.h / 2]; });
    var missingOpen = openL.map(function (L) { var p = toScreen(L.x, L.y, L.z); return [Math.floor(p.x), Math.floor(p.y)]; }).filter(function (p) {
      return !gotC.some(function (c) { return Math.abs(c[0] - p[0]) <= 1 && Math.abs(c[1] - p[1]) <= 1; });
    });
    check('hidden near torches take no slot: the nearest 12 visible glows are drawn', gotC.length === 12 && !missingOpen.length &&
      occF.st.torch.hidden === 6 && occF.st.torch.dropped === 0, {drawn: gotC.length, missingOpen: missingOpen, torch: occF.st.torch});
    // (6) Legacy mode draws the legacy command stream (a wall makes one glow mixed).
    scene(); install(16, 1016); G.ambientLight = 0.5;
    G.pointLights = [torchAt(120.5, 100.5, 70), torchAt(220.5, 110.5, 150)];
    function logged(fn) {
      depthFrame(); wall(0, 60, 0, H, 30); G.beginEffectFrame(); recReset(); rec.logging = true;
      try { fn(); } finally { rec.logging = false; }
      return JSON.stringify(rec.log);
    }
    var viaStage;
    G.setEffectFamilyMode('torchGlow', 'legacy');
    try { viaStage = logged(G.drawTorchGlowStage3D); } finally { G.setEffectFamilyMode('torchGlow', null); }
    var direct = logged(G.drawTorchGlow3D), asNew = logged(G.drawTorchGlowStage3D);
    check('Legacy mode draws the torch glow stage as drawTorchGlow3D', direct.indexOf('createRadialGradient') >= 0 && viaStage === direct &&
      asNew !== direct && asNew.indexOf('drawImage') >= 0 && asNew.indexOf('createRadialGradient') < 0,
      {stage: viaStage.length, direct: direct.length, legacyGradients: direct.split('createRadialGradient').length - 1, newDraws: asNew.split('drawImage').length - 1});
    // (7) Every New frame above left the Canvas state as it found it, with no
    // blur, drawing 'lighter'; no light on screen makes no Canvas call.
    scene(); install(16, 1017);
    G.pointLights = []; depthFrame(); G.beginEffectFrame(); recReset(); G.drawTorchGlowStage3D();
    var none = {calls: rec.calls, sets: rec.sets};
    G.pointLights = [torchAt(180, 120, -40), torchAt(W + 200, 120, 60)]; depthFrame(); G.beginEffectFrame(); recReset(); G.drawTorchGlowStage3D();
    var off = {calls: rec.calls, sets: rec.sets};
    G.pointLights = []; G.ambientLight = 0.9;
    var bad = states.filter(function (s) { return s.blur || s.depth || s.underflow || s.op !== s.opBefore || s.alpha !== s.alphaBefore || !s.lighter; });
    check('the torch glow stage never blurs and restores Canvas state', states.length >= 20 && !bad.length, {frames: states.length, bad: bad.slice(0, 3)});
    check('the torch glow stage makes no Canvas call with no light on screen', none.calls === 0 && none.sets === 0 && off.calls === 0 && off.sets === 0,
      {none: none, offscreen: off});
    // (8) Wall torches: torches 80 u ahead at screen x 20.5, 60.5 and 180.5
    // (straight-line distance about 100, 92 and 80 u), 0.5 u in front of a wall
    // facing the camera (depth 80.5 over the screen), as buildPointLights
    // places a torch 0.5 u off its wall (07-decorations-lighting.js). The
    // legacy clip draws each (forward depth); the New stage draws each at
    // its open corona alpha, and the tiles override classifies each visible.
    scene(); install(16, 1020); G.ambientLight = 0.5;
    var wallT = [[20.5, 120.5], [60.5, 120.5], [180.5, 120.5]].map(function (p) {
      G.pointLights = [torchAt(p[0], p[1], 80)];
      var L0 = G.pointLights[0], wf = function () { wall(0, W, 0, H, 80.5); }, ti;
      var lg = glowFrame('legacy', wf), co = glowFrame(null, wf, spriteDoc()), op = glowFrame(null, null, spriteDoc());
      G.fxTorchGlowOcclusion = 'tiles';
      try { ti = glowFrame(null, wf, spriteDoc()); } finally { G.fxTorchGlowOcclusion = 'corona'; }
      var a = images(co)[0], b = images(op)[0], c = images(ti)[0];
      return {x: p[0], dist: Math.round(Math.hypot(L0.x - G.cam.x, L0.y - G.cam.y) * 1000) / 1000,
        legacyFills: lg.draws.filter(function (d) { return d.kind === 'fillRect'; }).length, corona: a ? a.alpha : 0, open: b ? b.alpha : NaN,
        tilesDrawn: images(ti).length, tilesClipped: !!c && c.clipped, tilesClass: ti.st.torch};
    });
    check('wall torches off the screen centre are depth-tested at forward depth, as the legacy clip is', wallT[0].dist > 81 && wallT[1].dist > 81 &&
      wallT.every(function (l) { return l.legacyFills === 1 && l.corona > 0 && near(l.corona, l.open, 1e-12) && l.tilesDrawn === 1 && !l.tilesClipped; }),
      {torches: wallT});
    // (9) The mixed-item cap under the tiles override (mixedPerFrame 3 here):
    // ten torches whose boxes straddle a wall edge at 50 u over x < 170, the
    // nearest eight centred on its open side, the two farthest on its hidden
    // side. The nearest three are clipped; past the cap a glow is
    // centre-gated as a particle is (drawn unclipped when its centre is
    // visible, not drawn otherwise), each counted.
    scene(); install(16, 1021); G.ambientLight = 0.5;
    var capL = [];
    for (k = 0; k < 8; k++) capL.push(torchAt(185.5, 100.5 + k * 5, 80 + k));
    capL.push(torchAt(150.5, 110.5, 90), torchAt(150.5, 130.5, 92));
    G.pointLights = capL;
    var capCfg0 = G.EFFECT_CONFIG, capCfg = {}, capF;
    Object.keys(capCfg0).forEach(function (key) { capCfg[key] = capCfg0[key]; }); capCfg.mixedPerFrame = 3;
    G.EFFECT_CONFIG = Object.freeze(capCfg); G.fxTorchGlowOcclusion = 'tiles';
    try { capF = glowFrame(null, function () { wall(0, 170, 0, H, 50); }, spriteDoc()); } finally { G.EFFECT_CONFIG = capCfg0; G.fxTorchGlowOcclusion = 'corona'; }
    var capImgs = images(capF), capClipped = capImgs.filter(function (d) { return d.clipped; }).length;
    var capOpen = capImgs.filter(function (d) { return !d.clipped && d.x + d.w / 2 > 170; }).length;
    check('past the mixed-item cap a torch glow under the tiles override is centre-gated, as particles are', capImgs.length === 8 && capClipped === 3 &&
      capOpen === 5 && capF.st.occ.mixedSkipped === 7 && capF.st.torch.hidden === 2 && capF.clips === 3,
      {drawn: capImgs.length, clipped: capClipped, unclippedOpenCentre: capOpen, mixedSkipped: capF.st.occ.mixedSkipped, torch: capF.st.torch, clips: capF.clips});
  });

  // ── C11: the Effects settings page fits and works at 360x240 and 1920x1080.
  if (needed('C11', ['--fx-page-offpanel'])) run('C11 settings page', function () {
    [[360, 240], [1920, 1080]].forEach(function (size) {
      scene(size[0], size[1]); install(64, 111);
      var w = size[0], h = size[1], S = h / 240, label = w + 'x' + h;
      var panW = Math.min(320 * S, w * 0.85), panH = Math.min(260 * S, h * 0.92), px = (w - panW) / 2, py = (h - panH) / 2;   // restated panel
      function overlay() { recReset(); G.settingsOpen = true; G.drawSettingsOverlay(); return G._settingsClickAreas.slice(); }
      function inside(a) { return a.x >= px - 1e-9 && a.y >= py - 1e-9 && a.x + a.w <= px + panW + 1e-9 && a.y + a.h <= py + panH + 1e-9; }
      function overlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
      G.beginEffectFrame();                                   // settings closed: the page is the main one
      var saved = G.drawEffectSettingsPage; G.drawEffectSettingsPage = undefined;
      var bare = overlay(); G.drawEffectSettingsPage = saved;
      var main = overlay(), chip = main.filter(function (a) { return a.action === 'fx'; }), title = rec.texts.filter(function (t) { return t.text === 'Settings'; })[0];
      var titleW = title ? title.text.length * (+/(\d+)px/.exec(title.font)[1]) * 0.55 : 0;
      var titleBox = title ? {x: title.x - titleW / 2, y: title.y - (+/(\d+)px/.exec(title.font)[1]), w: titleW, h: +/(\d+)px/.exec(title.font)[1]} : null;
      var mainOthers = main.filter(function (a) { return a.action !== 'fx'; });
      check('the main settings page gains one Effects chip on the title row and keeps its own click areas (' + label + ')',
        chip.length === 1 && chip[0].key === 'page' && chip[0].value === 1 && inside(chip[0]) && !!titleBox && !overlap(chip[0], titleBox) &&
        JSON.stringify(mainOthers) === JSON.stringify(bare), {chip: chip, title: titleBox, main: mainOthers.length, bare: bare.length});
      G.handleSettingsClick(chip[0].x + chip[0].w / 2, chip[0].y + chip[0].h / 2);
      var page = overlay(), rows = page.filter(function (a) { return a.key !== 'page'; }), back = page.filter(function (a) { return a.key === 'page'; })[0];
      var hint = rec.texts.filter(function (t) { return /to close/.test(t.text); })[0], hf = hint ? +/(\d+)px/.exec(hint.font)[1] : 0;
      var hintBox = hint ? {x: hint.x - hint.text.length * hf * 0.55 / 2, y: hint.y - hf, w: hint.text.length * hf * 0.55, h: hf * 1.25} : null;
      var rowsInside = rows.every(inside), clash = [];
      rows.forEach(function (a, k) {
        page.forEach(function (b, j) { if (j !== page.indexOf(a) && overlap(a, b)) clash.push([a.key, b.key]); });
        if (hintBox && overlap(a, hintBox)) clash.push([a.key, 'close hint']);
      });
      check('the Effects page shows four toggle rows and a Back chip (' + label + ')', rows.length === 4 && !!back && back.value === 0 &&
        rows.map(function (a) { return a.key; }).join(' ') === 'fxWeather fxDebris fxFootDust fxUnified', {areas: page});
      check('every effects row fits inside the settings panel at ' + label, rowsInside && !clash.length && !!hintBox && inside(back),
        {panel: {x: px, y: py, w: panW, h: panH}, rows: rows, clash: clash, back: back});
      // Clicks: Weather cycles off -> auto -> rain -> snow -> ash -> off; bools flip.
      function click(key) { var a = G._settingsClickAreas.filter(function (b) { return b.key === key; })[0]; return G.handleSettingsClick(a.x + a.w / 2, a.y + a.h / 2); }
      var order = ['off', 'auto', 'rain', 'snow', 'ash'], v0 = G.effectToggleValue('fxWeather'), seen = [];
      for (var k = 0; k < 5; k++) { click('fxWeather'); seen.push(G.effectToggleValue('fxWeather')); overlay(); }
      var cycle = seen.every(function (v, j) { return v === order[(order.indexOf(v0) + j + 1) % 5]; }) && seen[4] === v0;
      var flips = ['fxDebris', 'fxFootDust', 'fxUnified'].map(function (key) {
        var before = G.effectToggleValue(key), ok1 = click(key), mid = G.effectToggleValue(key); overlay(); click(key); overlay();
        return ok1 === true && mid === !before && G.effectToggleValue(key) === before;
      });
      check('the Effects rows switch their toggles (' + label + ')', cycle && flips.every(Boolean), {start: v0, weather: seen, flips: flips});
      G.handleSettingsClick(back.x + back.w / 2, back.y + back.h / 2);
      var again = overlay().filter(function (a) { return a.action === 'fx'; });
      G.handleSettingsClick(again[0].x + 1, again[0].y + 1); overlay();
      G.settingsOpen = false; G.beginEffectFrame();         // closing the overlay
      var reopened = overlay().filter(function (a) { return a.action === 'fx'; });
      check('Back and closing the overlay return to the main settings page (' + label + ')', again.length === 1 && again[0].key === 'page' &&
        reopened.length === 1 && reopened[0].value === 1, {afterBack: again, afterReopen: reopened});
      G.settingsOpen = false;
    });
    scene();
  });

  // ── C12: a preset switched off while paused disappears on the next frame.
  if (needed('C12', ['--toggle-in-tick-only'])) run('C12 paused toggle', function () {
    scene(); var S = install(256, 1212);
    var p = at(180, 120, 70);
    G.fxEmit('r.debris', p.x, p.y, p.z, {count: 12}); G.updateEffects(1 / 60);
    function draw() { depthFrame(); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1); return frameStats().drawn; }
    function bytes() { return JSON.stringify([S.count, Array.prototype.slice.call(S.flags, 0, S.count), Array.prototype.slice.call(S.life, 0, S.count), S.tick]); }
    var before = draw();
    G.setGameSettingsOpen(true);
    var paused = G.simulationPaused(), pool = bytes();
    G.setEffectToggle('fxDebris', false);
    var off = draw(), poolOff = bytes();
    G.setEffectToggle('fxDebris', true);
    var back = draw();
    G.setEffectToggle('fxDebris', false);
    G.updateEffects(1 / 60);
    var dying = 0; for (var i = 0; i < S.count; i++) if (S.flags[i] & 16) dying++;
    G.setGameSettingsOpen(false); G.setEffectToggle('fxDebris', true);
    check('the C12 fixture has a live debris burst while the overlay pauses the game', before === 12 && paused, {drawn: before, paused: paused});
    check('a preset switched off while paused disappears on the next frame', off === 0 && poolOff === pool && back === 12,
      {drawnOff: off, poolUnchanged: poolOff === pool, drawnBackOn: back});
    check('the next tick marks the switched-off particles DYING', dying === 12, {dying: dying});
  });

  // ── C13: empty fx stages make no Canvas call; Legacy ambient is the same
  // command stream as drawAmbientParticles3D on the same array.
  if (needed('C13', ['--empty-stage-save'])) run('C13 empty stages and legacy ambient', function () {
    var next = lcg(424242 * 7919 + 13), used = false;
    Math.random = function () { if (!used) { used = true; return (424242 - 0.5) / 999999; } return next(); };
    G.setEffectFamilyMode('ambient', 'legacy');            // Legacy ambient (S3 migrated the family); cleared below
    try {
      G.CAVE_TEST_MODE = false; G.ENDLESS_MODE = true; G.running = true; G.gameOverState = false;
      G.menuOpen = G.settingsOpen = G.shopOpen = G.inventoryOpen = G.forgeOpen = G.overviewActive = false;
      G.MODE3D = true; G.CAM_FOLLOW = true; G.canvas.width = W; G.canvas.height = H;
      G.resetEndlessMode();
    } finally { Math.random = originalRandom; }
    G.fxState = liveState;
    if (G.fxState.count) throw Error('SETUP live pool not empty');
    // Motes in view: the legacy array keeps its records; a few move in front.
    var legacy = G.ambientParticles;
    for (var k = 0; k < 6 && k < legacy.length; k++) {
      legacy[k].x = G.cam.x + Math.cos(G.cam.ang) * (30 + 10 * k) - Math.sin(G.cam.ang) * (k - 3) * 4;
      legacy[k].y = G.cam.y + Math.sin(G.cam.ang) * (30 + 10 * k) + Math.cos(G.cam.ang) * (k - 3) * 4;
      legacy[k].z = G.getFloorHeightAt(legacy[k].x, legacy[k].y) * 25 + 30; legacy[k].alpha = 0.3;
    }
    var logs = {}, savedPt = G._pt;
    function frame() {
      logs = {};
      G._pt = function (name, fn) {
        var mark = rec.log.length, calls = rec.calls, sets = rec.sets;
        rec.logging = /^(fxCombat3D|ambientFX3D|fxOverlay|fx2D)$/.test(name);
        try { fn(); } finally { logs[name] = {log: rec.log.slice(mark), calls: rec.calls - calls, sets: rec.sets - sets}; rec.logging = false; }
      };
      try { recReset(); G.renderFrame(); } finally { G._pt = savedPt; rec.logging = false; }
    }
    frame();
    recReset(); rec.logging = true; G.beginEffectFrame(); rec.logging = false;
    var begin = {calls: rec.calls, sets: rec.sets};
    var three = {combat: logs.fxCombat3D, overlay: logs.fxOverlay, ambient: logs.ambientFX3D};
    // Reference: the legacy drawer on the same array, same frame state.
    recReset(); rec.logging = true; G.drawAmbientParticles3D(); rec.logging = false;
    var reference = rec.log.slice();
    G.MODE3D = false; frame(); var twoD = logs.fx2D; G.MODE3D = true;
    var motesDrawn = reference.filter(function (c) { return c[0] === 'arc' || c[0] === 'fillRect'; }).length;
    check('the C13 frame draws legacy motes and runs every fx stage', motesDrawn >= 3 && !!three.combat && !!three.overlay && !!twoD,
      {motesDrawn: motesDrawn, stages: Object.keys(logs)});
    check('empty fx stages make zero Canvas calls', begin.calls === 0 && begin.sets === 0 && three.combat.calls === 0 && three.combat.sets === 0 &&
      three.overlay.calls === 0 && three.overlay.sets === 0 && twoD.calls === 0 && twoD.sets === 0,
      {beginEffectFrame: begin, fxCombat3D: three.combat && three.combat.log.slice(0, 4), fxOverlay: three.overlay && three.overlay.log.slice(0, 4),
        fx2D: twoD && twoD.log.slice(0, 4)});
    check('Legacy ambient draws the command stream of drawAmbientParticles3D', JSON.stringify(three.ambient.log) === JSON.stringify(reference),
      {stage: three.ambient.log.length, reference: reference.length});
    // One live particle makes the combat stage draw.
    var S = install(64, 1313), c = G.getCam3D();
    var i = S.count++, r = S.C.ID['r.dot'];
    S.x[i] = G.cam.x + Math.cos(G.cam.ang) * 50; S.y[i] = G.cam.y + Math.sin(G.cam.ang) * 50; S.z[i] = c.cameraZ; S.age[i] = 1; S.life[i] = 100;
    S.size[i] = 0.5; S.alpha[i] = 1; S.rec[i] = r; S.cls[i] = S.R.cls[r]; S.pal[i] = 1; S.flags[i] = 0; S.classLive[S.cls[i]]++; S.recipeLive[r]++;
    frame();
    check('one live particle makes the combat stage draw', logs.fxCombat3D.calls > 0, {calls: logs.fxCombat3D.calls});
    G.fxState = liveState; G.setEffectFamilyMode('ambient', null);
  });

  // ── C10 frame (S8 review fix): the frame loop's torchGlow3D stage reaches
  // drawTorchGlowStage3D. Endless 424242 with one torch light 40 u ahead of
  // the camera at eye height and the real renderFrame (its depth frame from
  // draw()); the stage's own commands are recorded. New mode draws the
  // torch sprite additively with no gradient; Legacy mode draws the legacy
  // gradient under its scene-depth clip and no sprite.
  if (needed('C10 frame', ['--torch-stage-bypassed'])) run('C10 frame loop', function () {
    var next = lcg(424242 * 7919 + 13), used = false;
    Math.random = function () { if (!used) { used = true; return (424242 - 0.5) / 999999; } return next(); };
    try {
      G.CAVE_TEST_MODE = false; G.ENDLESS_MODE = true; G.running = true; G.gameOverState = false;
      G.menuOpen = G.settingsOpen = G.shopOpen = G.inventoryOpen = G.forgeOpen = G.overviewActive = false;
      G.MODE3D = true; G.CAM_FOLLOW = true; G.canvas.width = W; G.canvas.height = H;
      G.resetEndlessMode();
    } finally { Math.random = originalRandom; }
    G.fxState = liveState; G.ambientLight = 0.5;
    var c = G.getCam3D(), savedDoc = G.document;
    G.pointLights = [{x: G.cam.x + Math.cos(G.cam.ang) * 40, y: G.cam.y + Math.sin(G.cam.ang) * 40, z: c.cameraZ, radius: 90, intensity: 0.55,
      r: 255, g: 180, b: 80, kind: 'torch', nx: -Math.cos(G.cam.ang), ny: -Math.sin(G.cam.ang)}];
    // A document whose sprite canvases build (the headless host has none).
    G.document = {createElement: function () {
      var el = {width: 0, height: 0};
      el.getContext = function () { return {fillRect: function () {}, createRadialGradient: function () { return {addColorStop: function () {}}; }}; };
      return el;
    }};
    function stageLog(mode) {
      var log = null, savedPt = G._pt;
      G.setEffectFamilyMode('torchGlow', mode); G._fxSprites.clear(); G._fxSpriteBytes = 0;
      G._pt = function (name, fn) {
        if (name !== 'torchGlow3D') return fn();
        var mark = rec.log.length; rec.logging = true;
        try { return fn(); } finally { log = rec.log.slice(mark); rec.logging = false; }
      };
      try { recReset(); G.renderFrame(); } finally { G._pt = savedPt; rec.logging = false; G.setEffectFamilyMode('torchGlow', null); }
      return log || [];
    }
    var newLog, legacyLog;
    try { newLog = stageLog(null); legacyLog = stageLog('legacy'); }
    finally { G.document = savedDoc; G.pointLights = []; G._fxSprites.clear(); G._fxSpriteBytes = 0; }
    function calls(log, name) { return log.filter(function (e) { return e[0] === name; }).length; }
    var lighterNew = newLog.some(function (e) { return e[0] === '=' && e[1] === 'globalCompositeOperation' && e[2] === 'lighter'; });
    var got = {new: {drawImage: calls(newLog, 'drawImage'), gradients: calls(newLog, 'createRadialGradient'), lighter: lighterNew},
      legacy: {drawImage: calls(legacyLog, 'drawImage'), gradients: calls(legacyLog, 'createRadialGradient'), fillRect: calls(legacyLog, 'fillRect')}};
    check("the frame loop's torchGlow3D stage draws through drawTorchGlowStage3D (New: the torch sprite; Legacy: the legacy gradient)",
      got.new.drawImage === 1 && got.new.gradients === 0 && got.new.lighter && got.legacy.gradients === 1 && got.legacy.drawImage === 0 && got.legacy.fillRect === 1,
      got);
    G.fxState = liveState;
  });

  // ── B9: presentation never mutates the pool or depends on frame rate; the
  // governor (unpinned, forced to 0.35) only thins drawing.
  if (needed('B9', ['--render-mutates-pool', '--governor-scales-spawn'])) run('B9 presentation is read-only', function () {
    function runScene(framesPerTick, script) {
      scene(); var S = install(1024, 909, {pinned: false, reserve: 64});
      G._fxRender.governor = 0.35;
      var p = at(180, 120, 80), acc = 0, thinned = 0;
      for (var t = 0; t < 120; t++) {
        if (t % 10 === 0) { G.fxEmit('r.amb', p.x, p.y + (t % 30), p.z, {count: 40 + script}); G.fxEmit('r.debris', p.x, p.y, p.z, {count: 8}); }
        G.updateEffects(1 / 60);
        for (acc += framesPerTick; acc >= 1; acc--) {
          G.renderPresentationAlpha = (acc % 1) || 0.5;
          depthFrame(); G.beginEffectFrame(); G.drawEffectLayer3D(0); G.drawEffectLayer3D(1); thinned += frameStats().thinned;
        }
      }
      G.renderPresentationAlpha = 1;
      var cols = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'age', 'life', 'size', 'alpha', 'rot', 'spin', 'phase', 'seedA', 'rec', 'pal', 'flags'];
      var h = 2166136261, text = JSON.stringify([S.count, S.serial, S.B].concat(cols.map(function (c) { return Array.prototype.slice.call(S[c], 0, S.count); })));
      for (var k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), 16777619);
      return {hash: (h >>> 0).toString(16), count: S.count, thinned: thinned};
    }
    // The reference is the same script with no frame drawn at all.
    var none = runScene(0, 0), r30 = runScene(0.5, 0), r60 = runScene(1, 0), r144 = runScene(2.4, 0), other = runScene(0, 3);
    G._fxRender.governor = 1;
    check('the B9 fixture thins drawing with the governor at 0.35', none.count > 100 && none.thinned === 0 && r30.thinned > 0 &&
      r144.thinned > r60.thinned, {none: none, r30: r30, r60: r60, r144: r144});
    check('presentation never mutates the pool or depends on frame rate', [r30, r60, r144].every(function (r) { return r.hash === none.hash; }) &&
      other.hash !== none.hash, {unrendered: none, r30: r30, r60: r60, r144: r144, differentScript: other.hash});
  });

  // ── B8 (drawn): the renderer draws each particle on the interpolation
  // timeline, from the engine's own ticked positions: a constant-velocity
  // particle at blend alpha lands at lerp(previous tick, current tick,
  // alpha); a particle that bounced this tick is drawn in its contact state
  // (section 3.7), never below its support.
  if (needed('B8', ['--draw-no-backproject', '--draw-ignores-snap'])) run('B8 drawn presentation', function () {
    scene(); var S = install(64, 818), p = at(180, 120, 80);
    function centre() {
      var c = null;
      rec.draws.forEach(function (d) { if (d.kind === 'fill') d.path.forEach(function (q) {
        if (q[0] === 'rect') c = {x: q[1] + q[3] / 2, y: q[2] + q[4] / 2}; else if (q[0] === 'arc') c = {x: q[1], y: q[2]};
      }); });
      return c;
    }
    function drawAt(alpha) { G.renderPresentationAlpha = alpha; depthFrame(); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1); G.renderPresentationAlpha = 1; return centre(); }
    G.fxEmit('r.walker', p.x, p.y, p.z, {count: 1, dx: 0, dy: 1, dz: 0});
    G.updateEffects(1 / 60); G.updateEffects(1 / 60);
    var prev = [S.x[0], S.y[0], S.z[0]]; G.updateEffects(1 / 60);
    var cur = [S.x[0], S.y[0], S.z[0]], bad = [];
    [0, 0.25, 0.5, 1].forEach(function (alpha) {
      var got = drawAt(alpha), want = toScreen(prev[0] + (cur[0] - prev[0]) * alpha, prev[1] + (cur[1] - prev[1]) * alpha, prev[2] + (cur[2] - prev[2]) * alpha);
      if (!got || !near(got.x, want.x, 1e-6) || !near(got.y, want.y, 1e-6)) bad.push({alpha: alpha, drawn: got, expected: want});
    });
    check('drawn particles follow the interpolation timeline', S.count === 1 && cur[1] - prev[1] > 5 && !bad.length,
      {seed: 818, count: S.count, prev: prev, cur: cur, bad: bad, tolerance: 1e-6});
    // A chip dropped from z 20 onto the flat ground (support z 0) at depth
    // 150, where the ground is on screen; the tick of its first bounce.
    S = install(64, 819); var b0 = at(180, 150, 150), bounced = false, k;
    G.fxEmit('r.bouncer', b0.x, b0.y, 20, {count: 1, dx: 0, dy: 1, dz: 0});
    for (k = 0; k < 240 && !bounced; k++) { G.updateEffects(1 / 60); bounced = S.count === 1 && !!(S.flags[0] & 2) && S.vz[0] > 0 && !(S.flags[0] & 1); }
    var got = bounced ? drawAt(0) : null, contact = toScreen(S.x[0], S.y[0], S.z[0]), support = toScreen(S.x[0], S.y[0], 0);
    check('a just-bounced particle is drawn at its contact state, never below its support', bounced && !!got && near(got.x, contact.x, 1e-6) &&
      near(got.y, contact.y, 1e-6) && got.y <= support.y + 1e-9, {seed: 819, tick: k, alpha: 0, drawn: got, contact: contact, supportY: support.y, z: S.z[0], vz: S.vz[0]});
  });

  // ── Governor (section 6.4): pinned pools are never thinned; unpinned
  // thinning takes only weather, ambient and locomotion particles, stably by
  // seed; the control law sinks under fx load and recovers, and ignores the
  // time of stages still drawn by legacy families.
  if (needed('Governor', ['--thin-ignores-pin', '--thin-every-class', '--governor-counts-legacy', '--governor-frozen'])) run('Governor', function () {
    var ids = ['r.clsW', 'r.clsA', 'r.clsL', 'r.dot', 'r.clsF'];            // weather, ambient, locomotion, combat, feedback
    function classFrame(pinned) {
      scene(); var S = install(256, 4242, {pinned: pinned});
      ids.forEach(function (id, row) { for (var j = 0; j < 20; j++) put(S, id, 20 + j * 16, 30 + row * 40, 60, {rpx: 1}); });
      G._fxRender.governor = 0.35; G._fxRender.ring = G._perfRingIdx;      // no control step this frame: the governor stays 0.35
      depthFrame(); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1);
      var rows = [0, 0, 0, 0, 0], expectThin = 0;
      rec.draws.forEach(function (d) { if (d.kind === 'fill') d.path.forEach(function (q) {
        var y = q[0] === 'rect' ? q[2] + q[4] / 2 : q[0] === 'arc' ? q[2] : NaN, row = Math.round((y - 30) / 40);
        if (row >= 0 && row < 5) rows[row]++;
      }); });
      for (var i = 0; i < S.count; i++) if (S.cls[i] <= 2 && (S.seedA[i] & 1023) >= 0.35 * 1024) expectThin++;
      var f = frameStats();
      return {rows: rows, thinned: f.thinned, drawn: f.drawn, expectThin: expectThin};
    }
    var pinnedFrame = classFrame(true), liveFrame = classFrame(false);
    G._fxRender.governor = 1;
    check('pinned pools are never thinned; unpinned thinning skips combat and feedback', pinnedFrame.thinned === 0 && pinnedFrame.drawn === 100 &&
      pinnedFrame.rows.every(function (r) { return r === 20; }) && liveFrame.expectThin > 0 && liveFrame.thinned === liveFrame.expectThin &&
      liveFrame.rows[3] === 20 && liveFrame.rows[4] === 20 && liveFrame.rows[0] + liveFrame.rows[1] + liveFrame.rows[2] === 60 - liveFrame.expectThin,
      {pinned: pinnedFrame, unpinned: liveFrame, governor: 0.35, rows: 'weather ambient locomotion combat feedback'});
    // Control law: stage times written into the profiler's ring as the frame
    // loop does, one slot per frame; the governor reads the previous slot.
    scene(); var S = install(64, 4343, {pinned: false}); put(S, 'r.dot', 180, 120, 60);
    var hist = G._perfStageHistory, names = ['fxCombat3D', 'fxOverlay', 'ambientFX3D', 'torchGlow3D', 'fx2D'], savedHist = {}, savedRing = G._perfRingIdx;
    names.forEach(function (nm) { savedHist[nm] = hist[nm]; hist[nm] = new Float32Array(G.PERF_HISTORY_LEN); });
    function frames(count, ms) {
      for (var f = 0; f < count; f++) {
        names.forEach(function (nm) { hist[nm][G._perfRingIdx] = ms[nm] || 0; });
        G._perfRingIdx = (G._perfRingIdx + 1) % G.PERF_HISTORY_LEN;
        G.beginEffectFrame();
      }
      return G._fxRender.governor;
    }
    var law = {};
    try {
      G._fxRender.governor = 1; G._fxRender.ema = 0; G._fxRender.ring = -1;
      law.loaded = frames(80, {fxCombat3D: 3});
      law.loadedFrame = G.getEffectStats().governor;
      law.recovered = frames(250, {});
      G.setEffectFamilyMode('ambient', 'legacy'); G.setEffectFamilyMode('torchGlow', 'legacy');
      law.legacyOnly = frames(120, {ambientFX3D: 3, torchGlow3D: 6});
      law.families = {ambient: G.effectFamilyMode('ambient'), torchGlow: G.effectFamilyMode('torchGlow')};
      G.setEffectFamilyMode('ambient', null);
      law.newAmbient = frames(120, {ambientFX3D: 3});                        // New ambient (S3) is thinnable: it counts
      law.recovered2 = frames(250, {});
      G.setEffectFamilyMode('torchGlow', null);
      law.newTorch = frames(120, {torchGlow3D: 3});                          // New torch glow (S8) counts as well
    } finally {
      G.setEffectFamilyMode('ambient', null); G.setEffectFamilyMode('torchGlow', null);
      names.forEach(function (nm) { if (savedHist[nm]) hist[nm] = savedHist[nm]; else delete hist[nm]; });
      G._perfRingIdx = savedRing; G._fxRender.governor = 1; G._fxRender.ema = 0; G._fxRender.ring = -1;
    }
    var floor = G.EFFECT_CONFIG.governor.floor;
    check('the governor sinks under fx load, recovers, and ignores legacy stages it cannot thin', law.loaded === floor && law.loadedFrame === floor &&
      law.recovered === 1 && law.legacyOnly === 1 && law.families.ambient === 'legacy' && law.families.torchGlow === 'legacy' &&
      law.newAmbient === floor && law.recovered2 === 1 && law.newTorch === floor,
      {law: law, floor: floor, loadMs: 3, legacyMs: {ambientFX3D: 3, torchGlow3D: 6}});
  });

  // ── Governor raster input (S9). Stage times are JS only; the Canvas raster
  // behind them grows with the pixels painted (1920 x 1080 Ultra rain in
  // Chrome: 0.45 ms JS, 2.5 ms flushed, and a JS-only governor never thins),
  // so the input adds the device pixels the previous frame's unpinned
  // passes painted at EFFECT_CONFIG.governor.rasterMsPerMpx. Fixture: one
  // world scene, 600 rain-like weather streaks 30-220 u ahead falling at
  // 420 u/s and a row each of combat and feedback dots, drawn at 360 x 240
  // and at 1920 x 1080 (the same world points: projScale is 0.75 h, so a
  // point keeps its place as a share of the canvas) with the same JS stage
  // time, 0.2 ms, written into the profiler's ring as the frame loop does.
  // Oracle: the area of the recorded Canvas commands (line length x width,
  // rect, disc), computed here from the recorder. At 1080p the input crosses
  // the target and the governor thins the weather, never a combat or
  // feedback dot; at 360 x 240 it stays at 1. Controls: the same 1080p scene
  // pinned (studio, browser profile, tests) draws at 1 and feeds nothing to
  // the live governor; an idle 1080p frame (the two dot rows and 25 ambient
  // motes, Medium's) is never thinned, so canvas size alone is no load.
  if (needed('Governor raster', ['--governor-raster-blind', '--raster-canvas-area', '--raster-counts-pinned'])) run('Governor raster', function () {
    var gv = G.EFFECT_CONFIG.governor, JS_MS = 0.2, hist = G._perfStageHistory, names = ['fxCombat3D', 'fxOverlay', 'ambientFX3D', 'torchGlow3D', 'fx2D'];
    var savedHist = {}, savedRing = G._perfRingIdx, rnd = lcg(9091), rain = [], k;
    for (k = 0; k < 600; k++) rain.push({sx: rnd() * W, sy: rnd() * H * 0.9, fwd: 30 + rnd() * 190});
    function build(w, h, pinned, idle) {
      scene(w, h);
      var S = install(1024, 5151, {pinned: pinned}), fx = w / W, fy = h / H;
      if (!idle) rain.forEach(function (q) { put(S, 'r.rainW', q.sx * fx, q.sy * fy, q.fwd, {vz: -420}); });
      else rain.slice(0, 25).forEach(function (q) { put(S, 'r.clsA', q.sx * fx, q.sy * fy, q.fwd); });   // Medium's 25 motes
      for (var j = 0; j < 10; j++) { put(S, 'r.dot', (20 + j * 32) * fx, 200 * fy, 60); put(S, 'r.clsF', (20 + j * 32) * fx, 222 * fy, 60); }
      G._fxRender.ring = -1; G._fxRender.rasterAcc = 0;
      return S;
    }
    // The painted area of recorded draws: strokes (moveTo/lineTo pairs) as
    // length x width, fills as their rects and discs.
    function paintedPx(draws) {
      var px = 0;
      draws.forEach(function (d) {
        var p = d.path, i;
        if (d.kind === 'image') px += Math.abs(d.w * d.h);
        else if (d.kind === 'stroke') {
          for (i = 0; i + 1 < p.length; i++) if (p[i][0] === 'moveTo' && p[i + 1][0] === 'lineTo') px += Math.hypot(p[i + 1][1] - p[i][1], p[i + 1][2] - p[i][2]) * d.width;
        } else if (d.kind === 'fill') p.forEach(function (c) { if (c[0] === 'rect') px += Math.abs(c[3] * c[4]); else if (c[0] === 'arc') px += Math.PI * c[3] * c[3]; });
      });
      return px;
    }
    function dotsDrawn(draws) {
      var n = 0;
      draws.forEach(function (d) { if (d.kind === 'fill') d.path.forEach(function (c) { if (c[0] === 'rect' || c[0] === 'arc') n++; }); });
      return n;
    }
    // count frames: the stage time of the frame just drawn goes into its ring
    // slot, the ring advances, the frame opens (the governor steps on the
    // previous slot and the previous frame's pixels) and both 3D passes draw.
    function frames(count) {
      var out = {gov: [], rasterMs: [], input: [], oracle: [], stat: [], thinned: 0, lastThinned: 0, dots: [], acc: []};
      for (var f = 0; f < count; f++) {
        names.forEach(function (nm) { hist[nm][G._perfRingIdx] = nm === 'ambientFX3D' ? JS_MS : 0; });
        G._perfRingIdx = (G._perfRingIdx + 1) % G.PERF_HISTORY_LEN;
        depthFrame(); G.beginEffectFrame();
        out.gov.push(G._fxFrame.g); out.rasterMs.push(G._fxRender.rasterMs); out.input.push(G._fxRender.input);
        recReset(); G.drawEffectLayer3D(1); G.drawEffectLayer3D(0);
        var st = frameStats();
        out.oracle.push(paintedPx(rec.draws)); out.stat.push(st.rasterPx); out.dots.push(dotsDrawn(rec.draws)); out.acc.push(G._fxRender.rasterAcc);
        out.thinned += st.thinned; out.lastThinned = st.thinned;
      }
      return out;
    }
    function r4(v) { return Math.round(v * 1e4) / 1e4; }
    // The governor's raster input at frame f + 1 is frame f's painted area at
    // the configured rate; the frame's rasterPx counter is its area.
    function inputErr(o) {
      var worst = 0;
      for (var f = 0; f + 1 < o.oracle.length; f++) {
        var want = o.oracle[f] * gv.rasterMsPerMpx * 1e-6, got = o.rasterMs[f + 1];
        worst = Math.max(worst, Math.abs(got - want) / Math.max(want, 1e-9), Math.abs(o.stat[f] - o.oracle[f]) / Math.max(o.oracle[f], 1e-9));
      }
      return worst;
    }
    var small, big, pinned, pinnedStep, idle;
    names.forEach(function (nm) { savedHist[nm] = hist[nm]; hist[nm] = new Float32Array(G.PERF_HISTORY_LEN); });
    try {
      build(W, H, false); small = frames(80);
      build(1920, 1080, false); big = frames(80);
      // Pinned: the studio, the browser profile and tests; then the live
      // (unpinned) pool of an idle frame takes its first control step.
      build(1920, 1080, true); pinned = frames(40);
      var live = install(1024, 5152, {pinned: false});
      for (k = 0; k < 10; k++) { put(live, 'r.dot', 20 + k * 170, 900, 60); put(live, 'r.clsF', 20 + k * 170, 990, 60); }
      names.forEach(function (nm) { hist[nm][G._perfRingIdx] = 0; });
      G._perfRingIdx = (G._perfRingIdx + 1) % G.PERF_HISTORY_LEN;
      depthFrame(); G.beginEffectFrame();
      pinnedStep = {rasterMs: G._fxRender.rasterMs, governor: G._fxRender.governor, ema: G._fxRender.ema};
      build(1920, 1080, false, true); idle = frames(80);
    } finally {
      names.forEach(function (nm) { if (savedHist[nm]) hist[nm] = savedHist[nm]; else delete hist[nm]; });
      G._perfRingIdx = savedRing; G._fxRender.governor = 1; G._fxRender.ema = 0; G._fxRender.ring = -1; G._fxRender.rasterAcc = 0;
      scene();
    }
    // The fixture must reach the mechanism: the 360 x 240 frame's raster
    // leaves the input under the recovery threshold, the 1080p frame's alone
    // lifts it over the target.
    var small0 = JS_MS + small.oracle[0] * gv.rasterMsPerMpx * 1e-6, big0 = JS_MS + big.oracle[0] * gv.rasterMsPerMpx * 1e-6;
    if (!(small0 < gv.lowMs && big0 > gv.targetMs * 1.2 && JS_MS < gv.lowMs && big.dots[0] === 20 && small.dots[0] === 20))
      throw Error('SETUP governor raster fixture ' + JSON.stringify({small0: small0, big0: big0, dots: [small.dots[0], big.dots[0]], rate: gv.rasterMsPerMpx}));
    var summary = {rate: gv.rasterMsPerMpx, jsMs: JS_MS,
      small: {px0: Math.round(small.oracle[0]), input: r4(small.input[79]), govMin: Math.min.apply(null, small.gov), thinned: small.thinned},
      big: {px0: Math.round(big.oracle[0]), input0: r4(big0), input: r4(big.input[79]), govEnd: r4(big.gov[79]), lastThinned: big.lastThinned,
        dotsMin: Math.min.apply(null, big.dots)}};
    check('the governor thins weather at 1920 x 1080 by its raster and not at 360 x 240, never combat or feedback',
      small.gov.every(function (g) { return g === 1; }) && small.thinned === 0 && big.gov[79] < 1 && big.lastThinned > 0 &&
      big.dots.every(function (n) { return n === 20; }), summary);
    var errs = {small: inputErr(small), big: inputErr(big), idle: inputErr(idle)};
    check('the governor\'s raster input is the painted area of the previous frame at the configured rate',
      errs.small < 1e-6 && errs.big < 1e-6 && errs.idle < 1e-6 && big.rasterMs[1] > 0, {errors: errs, rate: gv.rasterMsPerMpx,
        big: {oracle0: Math.round(big.oracle[0]), stat0: Math.round(big.stat[0]), rasterMs1: r4(big.rasterMs[1])}});
    check('pinned frames draw at 1 and feed no pixels to the live governor; an idle large canvas is not thinned',
      pinned.gov.every(function (g) { return g === 1; }) && pinned.thinned === 0 && pinned.acc.every(function (a) { return a === 0; }) &&
      pinnedStep.rasterMs === 0 && pinnedStep.governor === 1 && idle.gov.every(function (g) { return g === 1; }) && idle.thinned === 0 &&
      idle.dots.every(function (n) { return n === 45; }),
      {pinned: {govMin: Math.min.apply(null, pinned.gov), thinned: pinned.thinned, accMax: Math.max.apply(null, pinned.acc), firstLiveStep: pinnedStep},
        idle: {govMin: Math.min.apply(null, idle.gov), thinned: idle.thinned, input: r4(idle.input[79]), px0: Math.round(idle.oracle[0])}});
  });

  // ── Governor raster by primitive (S9 fix). The section above draws only
  // streaks and dots, which left most of the pricing untested. Here each
  // primitive category is drawn alone in one unpinned 1920 x 1080 frame:
  // puff sprites; a glowDot's core and halo; rings; chips; rect dots (<= 1.25
  // px); discs; streaks, one half behind a wall (its visible run); a
  // clipped (mixed) item; a screen-space puff in the overlay pass; and 2D
  // dots, rings, puffs and lines in the 2D pass. The pixels handed to the
  // governor (rasterAcc) are compared with the painted area of the recorded
  // Canvas commands, computed here: images w x h, rects w x h, discs pi r^2,
  // triangles by the shoelace formula on their recorded corners, lines as
  // length x width per recorded segment, and ellipses as their perimeter
  // (the exact integral, summed here) x width, within 3% (the renderer's
  // RMS-radius perimeter is a model; no ring here is flatter than 0.5). A
  // pinned 2D pass hands over nothing. The input law: a control step's
  // input is the JS stage time plus rasterAcc at rasterMsPerMpx, and the
  // EMA takes a tenth of it. The 2D view (S9 fix): its fx2D stage time
  // counts, so a loaded 2D frame thins its weather (the seeds above the
  // floor's share, restated here) and never its combat dots; at 0.2 ms it
  // stays at 1. The glow cap: 256 halos a frame x the governor for every
  // class, combat glows included (89 at the 0.35 floor). The rate itself
  // (rasterMsPerMpx) is a Chrome-calibrated constant read from EFFECT_CONFIG
  // here; its value rests on the browser evidence, not on these checks.
  var RASTER_FIX = ['--raster-sprite-uncounted', '--raster-sprite-r2', '--raster-ring-no-width', '--raster-chip-zero', '--raster-rect-r2', '--raster-disc-linear',
    '--raster-sampled-full-len', '--raster-skip-mixed', '--raster-skip-overlay', '--raster-skip-2d', '--governor-ignores-2d', '--governor-input-max',
    '--governor-input-half', '--glow-cap-not-scaled'];
  if (needed('Governor raster categories', RASTER_FIX)) run('Governor raster categories', function () {
    var gv = G.EFFECT_CONFIG.governor, GR = G._fxRender, hist = G._perfStageHistory, names = ['fxCombat3D', 'fxOverlay', 'ambientFX3D', 'torchGlow3D', 'fx2D'];
    var savedHist = {}, savedRing = G._perfRingIdx, savedOrbs = G.soulOrbs, BW = 1920, BH = 1080;
    function perimeter(a, b) {
      var n = 4096, sum = 0;
      for (var k = 0; k < n; k++) { var t = (k + 0.5) / n * 2 * Math.PI, sn = Math.sin(t), cs = Math.cos(t); sum += Math.sqrt(a * a * sn * sn + b * b * cs * cs); }
      return sum * 2 * Math.PI / n;
    }
    // The painted area of recorded draws, by kind; ellipses kept apart.
    function areaOf(draws) {
      var out = {px: 0, ellipsePx: 0, kinds: {}, lines: []};
      function add(kind, v) { out.px += v; if (kind === 'ellipse') out.ellipsePx += v; out.kinds[kind] = (out.kinds[kind] || 0) + 1; }
      draws.forEach(function (d) {
        var p = d.path, i;
        if (d.kind === 'image') { add('image', Math.abs(d.w * d.h)); return; }
        if (d.kind === 'stroke') {
          for (i = 0; i < p.length; i++) {
            if (p[i][0] === 'ellipse') add('ellipse', perimeter(p[i][3], p[i][4]) * d.width);
            else if (p[i][0] === 'moveTo' && p[i + 1] && p[i + 1][0] === 'lineTo') {
              var len = Math.hypot(p[i + 1][1] - p[i][1], p[i + 1][2] - p[i][2]);
              out.lines.push({x: p[i][1], len: len}); add('line', len * d.width);
            }
          }
          return;
        }
        if (d.kind !== 'fill') return;
        for (i = 0; i < p.length; i++) {
          var c = p[i];
          if (c[0] === 'rect') add('rect', Math.abs(c[3] * c[4]));
          else if (c[0] === 'arc') add('disc', Math.PI * c[3] * c[3]);
          else if (c[0] === 'moveTo' && p[i + 1] && p[i + 1][0] === 'lineTo' && p[i + 2] && p[i + 2][0] === 'lineTo') {
            var A = c, B = p[i + 1], C = p[i + 2];
            add('triangle', Math.abs((B[1] - A[1]) * (C[2] - A[2]) - (C[1] - A[1]) * (B[2] - A[2])) / 2); i += 2;
          }
        }
      });
      return out;
    }
    // One frame of the pool, with no control step (the ring is current):
    // the 3D passes (combat, world, overlay) or the 2D pass, from rasterAcc 0.
    function drawFrame(twoD, depth) {
      GR.ring = G._perfRingIdx; GR.rasterAcc = 0;
      if (twoD) { G.MODE3D = false; recReset(); G.drawEffectLayer2D(); }
      else { depthFrame(); if (depth) depth(); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1); G.drawEffectLayer3D(0); G.drawEffectOverlay(); }
      var st = frameStats(), a = areaOf(rec.draws);
      return {acc: GR.rasterAcc, stat: st.rasterPx, oracle: a.px, ellipsePx: a.ellipsePx, kinds: a.kinds, lines: a.lines, drawn: st.drawn, clip: st.occ.clip,
        fallback: st.spriteFallback};
    }
    var CATS = [
      {name: 'sprites', kind: 'image', n: 2, fill: function (S) { put(S, 'r.puff', 400, 300, 60, {rpx: 30}); put(S, 'r.puff', 700, 300, 60, {rpx: 3}); }},
      {name: 'glow', kind: 'image', n: 1, fill: function (S) { put(S, 'r.glow', 1000, 300, 60, {rpx: 6}); }},
      {name: 'rings', kind: 'ellipse', n: 2, fill: function (S) { put(S, 'r.ring', 900, 1000, 60, {rpx: 40}); put(S, 'r.ring', 1300, 1040, 60, {rpx: 12}); }},
      {name: 'chips', kind: 'triangle', n: 2, fill: function (S) { put(S, 'r.chip', 1200, 300, 60, {rpx: 8}); put(S, 'r.chip', 1300, 300, 60, {rpx: 12, rot: 1.1}); }},
      {name: 'rects', kind: 'rect', n: 2, fill: function (S) { put(S, 'r.dot', 1600, 300, 60, {rpx: 1}); put(S, 'r.dot', 1650, 300, 60, {rpx: 1.2}); }},
      {name: 'discs', kind: 'disc', n: 2, fill: function (S) { put(S, 'r.dot', 1700, 300, 60, {rpx: 5}); put(S, 'r.dot', 1750, 300, 60, {rpx: 9}); }},
      {name: 'streaks', kind: 'line', n: 2, fill: function (S) { put(S, 'r.streak', 200, 500, 60, {vz: -420}); put(S, 'r.streak', 600, 500, 60, {vz: -420}); },
        depth: function () { wall(590, 610, 0, 360, 30); }},
      {name: 'clip', kind: 'disc', n: 1, fill: function (S) { put(S, 'r.clip', 300, 700, 60, {rpx: 10}); }},
      {name: 'overlay', kind: 'image', n: 1, fill: function (S) { var i = put(S, 'r.screen', 0, 0, 60); S.x[i] = 0.2; S.y[i] = 0.2; S.z[i] = 0; S.flags[i] = 8; }}
    ];
    var got = {}, law = null, twoD = null, load2D = null, idle2D = null, glow = null, k;
    names.forEach(function (nm) { savedHist[nm] = hist[nm]; hist[nm] = new Float32Array(G.PERF_HISTORY_LEN); });
    try {
      G.soulOrbs = [];
      CATS.forEach(function (c, ci) {
        scene(BW, BH); var S = install(64, 9301 + ci, {pinned: false});
        c.fill(S);
        got[c.name] = drawFrame(false, c.depth);
      });
      // The input law, one control step after the sprite frame.
      scene(BW, BH); var SL = install(64, 9311, {pinned: false}); CATS[0].fill(SL);
      var A = drawFrame(false).acc, ambient = G.effectFamilyMode('ambient');
      names.forEach(function (nm) { hist[nm][G._perfRingIdx] = nm === 'ambientFX3D' ? 0.3 : 0; });
      G._perfRingIdx = (G._perfRingIdx + 1) % G.PERF_HISTORY_LEN;
      GR.ema = 0.5; GR.governor = 1;
      depthFrame(); G.beginEffectFrame();
      law = {acc: A, js: Math.fround(0.3), rasterMs: GR.rasterMs, input: GR.input, ema: GR.ema, ambient: ambient};
      law.wantRaster = A * gv.rasterMsPerMpx * 1e-6; law.wantInput = law.js + law.wantRaster; law.wantEma = 0.5 * 0.9 + law.wantInput * 0.1;
      // The 2D pass: dots, a ring, a puff and a line at world points in the
      // view (1 u = 1 px), unpinned and pinned.
      function fill2D(S) {
        put(S, 'r.dot', 960, 540, 60, {rpx: 30}); put(S, 'r.ring', 960, 540, 200, {rpx: 20}); put(S, 'r.puff', 960, 540, 400, {rpx: 12});
        put(S, 'r.streak', 960, 540, 600, {vx: 300});
      }
      scene(BW, BH); fill2D(install(64, 9312, {pinned: false})); var live2D = drawFrame(true);
      scene(BW, BH); fill2D(install(64, 9313, {pinned: true})); var pinned2D = drawFrame(true);
      twoD = {live: live2D, pinned: pinned2D};
      // A loaded 2D frame: 60 weather and 10 combat dots; fx2D at 3 ms (or
      // 0.2 ms) in the ring for 80 frames.
      function loaded(ms) {
        scene(BW, BH); var S = install(128, 9314, {pinned: false});
        for (var j = 0; j < 60; j++) put(S, 'r.clsW', 20 + j * 30, 300, 60 + j * 4, {rpx: 20});
        for (j = 0; j < 10; j++) put(S, 'r.dot', 20 + j * 170, 600, 60 + j * 20, {rpx: 20});
        G.MODE3D = false; GR.governor = 1; GR.ema = 0; GR.ring = -1; GR.rasterAcc = 0;
        for (var f = 0; f < 80; f++) {
          names.forEach(function (nm) { hist[nm][G._perfRingIdx] = nm === 'fx2D' ? ms : 0; });
          G._perfRingIdx = (G._perfRingIdx + 1) % G.PERF_HISTORY_LEN;
          recReset(); G.drawEffectLayer2D();
        }
        var st = frameStats(), expect = 0, g = GR.governor;
        for (var i = 0; i < S.count; i++) if (S.cls[i] <= 2 && (S.seedA[i] & 1023) >= g * 1024) expect++;
        return {ms: ms, governor: g, ema: Math.round(GR.ema * 1e4) / 1e4, thinned: st.thinned, expectThin: expect, drawn: st.drawn, considered: st.considered};
      }
      load2D = loaded(3); idle2D = loaded(0.2);
      // The glow cap at the floor: 60 and 120 combat glowDots, and 120 pinned.
      function glowFrame(n, pinned) {
        scene(BW, BH); var S = install(256, 9315, {pinned: pinned});
        for (var j = 0; j < n; j++) put(S, 'r.glow', 40 + (j % 30) * 60, 100 + Math.floor(j / 30) * 120, 60, {rpx: 4});
        GR.governor = gv.floor; GR.ring = G._perfRingIdx;
        depthFrame(); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(0);
        var f = frameStats();
        return {n: n, pinned: pinned, glowDraws: f.glowDraws, glowCapped: f.glowCapped, drawn: f.drawn,
          halos: rec.draws.filter(function (d) { return d.kind === 'image'; }).length};
      }
      glow = [glowFrame(60, false), glowFrame(120, false), glowFrame(120, true)];
    } finally {
      names.forEach(function (nm) { if (savedHist[nm]) hist[nm] = savedHist[nm]; else delete hist[nm]; });
      G._perfRingIdx = savedRing; GR.governor = 1; GR.ema = 0; GR.ring = -1; GR.rasterAcc = 0; G.soulOrbs = savedOrbs;
      scene();
    }
    // The fixtures reach their mechanisms: each category drew what it names
    // (sprites built, no fallback), the clip item went through its clip, the
    // half-hidden streak drew a shorter run than the open one.
    var setup = [];
    CATS.forEach(function (c) {
      var g = got[c.name];
      if ((g.kinds[c.kind] || 0) !== c.n || g.fallback || !(g.oracle > 0)) setup.push({cat: c.name, kinds: g.kinds, fallback: g.fallback, oracle: g.oracle});
    });
    var runs = got.streaks.lines.slice().sort(function (a, b) { return a.x - b.x; });
    if (runs.length !== 2 || !(runs[1].len > 0.1 * runs[0].len && runs[1].len < 0.9 * runs[0].len)) setup.push({cat: 'streaks', runs: runs});
    if (got.clip.clip !== 1) setup.push({cat: 'clip', clip: got.clip.clip});
    ['disc', 'ellipse', 'image', 'line'].forEach(function (kd) { if (!twoD.live.kinds[kd]) setup.push({cat: '2D', missing: kd, kinds: twoD.live.kinds}); });
    if (law.ambient !== 'new') setup.push({law: law});
    if (setup.length) throw Error('SETUP raster categories ' + JSON.stringify(setup));
    function rel(a, b) { return Math.abs(a - b) / Math.max(Math.abs(b), 1e-9); }
    // Exact categories to 1e-6; ellipses (their share of the frame) to 3%.
    function priced(g) { return Math.abs(g.acc - g.oracle) <= 1e-6 * g.oracle + 0.03 * g.ellipsePx && Math.abs(g.stat - g.acc) <= 1e-6 * g.oracle; }
    var wrong = CATS.filter(function (c) { return !priced(got[c.name]); }).map(function (c) {
      var g = got[c.name]; return {cat: c.name, acc: Math.round(g.acc * 100) / 100, oracle: Math.round(g.oracle * 100) / 100, stat: Math.round(g.stat * 100) / 100};
    });
    check('the governor is handed the painted area of every primitive category', !wrong.length,
      {wrong: wrong, all: CATS.map(function (c) { return c.name + ':' + Math.round(got[c.name].oracle); })});
    check('a governor step takes the JS stage time plus the raster estimate', law.acc > 0 && rel(law.rasterMs, law.wantRaster) < 1e-9 &&
      Math.abs(law.input - law.wantInput) < 1e-12 && Math.abs(law.ema - law.wantEma) < 1e-12, law);
    check('a 2D pass hands the governor its painted area; a pinned one hands over nothing', priced(twoD.live) && twoD.live.acc > 0 && twoD.pinned.acc === 0,
      {live: {acc: twoD.live.acc, oracle: twoD.live.oracle, stat: twoD.live.stat, kinds: twoD.live.kinds}, pinned: {acc: twoD.pinned.acc, stat: twoD.pinned.stat}});
    check('a loaded 2D frame thins its weather and never its combat dots', load2D.governor === gv.floor && load2D.expectThin > 0 &&
      load2D.thinned === load2D.expectThin && load2D.drawn === 70 - load2D.expectThin && idle2D.governor === 1 && idle2D.thinned === 0 && idle2D.drawn === 70,
      {loaded: load2D, idle: idle2D, floor: gv.floor});
    var cap = Math.floor(256 * gv.floor);
    check('the glow cap follows the governor for every class, combat glows included', glow[0].glowDraws === 60 && glow[0].glowCapped === 0 &&
      glow[1].glowDraws === cap && glow[1].glowCapped === 120 - cap && glow[1].drawn === 120 && glow[1].halos === cap &&
      glow[2].glowDraws === 120 && glow[2].glowCapped === 0, {cap: cap, frames: glow});
  });

  // S9 fix: the footprint read is exact and cheap up to 12 px at any load;
  // only 12-24 px items draw on its per-frame budget (50,000 device px,
  // spec 6.5) and then fall back to tiles. Fixture: 40 dots of 20 px radius
  // (a 40 x 40 box each) spend the budget and the last of them go to tiles;
  // ten 8 px dots drawn after them in the same frame are still footprint
  // read (the frame's counts with and without them, restated here).
  if (needed('S9 fix occlusion', ['--small-foot-budgeted'])) run('S9 fix occlusion', function () {
    function frame(small) {
      scene(); var S = install(128, 9321);
      for (var j = 0; j < 40; j++) put(S, 'r.dot', 20 + (j % 10) * 34, 30 + Math.floor(j / 10) * 50, 60, {rpx: 20});
      for (j = 0; j < small; j++) put(S, 'r.dot', 20 + j * 34, 225, 60, {rpx: 8});
      depthFrame(); G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(1);
      var f = frameStats();
      return {small: small, footprint: f.occ.footprint, tiles: f.occ.tiles, point: f.occ.point, drawn: f.drawn};
    }
    var big = frame(0), both = frame(10);
    if (!(big.tiles > 0 && big.footprint > 0 && big.drawn === 40)) throw Error('SETUP footprint budget ' + JSON.stringify(big));
    check('items up to 12 px are footprint-read after the 12-24 px budget is spent', both.footprint === big.footprint + 10 && both.tiles === big.tiles &&
      both.drawn === 50, {bigOnly: big, withSmall: both});
    scene();
  });

  // ── S9 occlusion contracts: hand mutants of occlusion selection and tile
  // classification that no case above detected, each recreated here.
  if (needed('S9 occlusion', ['--point-up-to-3px', '--over-cap-edge-visible', '--tile-empty-box-visible', '--tile-no-bias', '--far-dot-tiles']))
    run('S9 occlusion', function () {
    function arcsNear(x, y, tol) {
      var out = [];
      rec.draws.forEach(function (d) { if (d.kind === 'fill') d.path.forEach(function (c) {
        if ((c[0] === 'arc' && Math.abs(c[1] - x) <= tol && Math.abs(c[2] - y) <= tol) ||
            (c[0] === 'rect' && Math.abs(c[1] + c[3] / 2 - x) <= tol && Math.abs(c[2] + c[4] / 2 - y) <= tol)) out.push(c[0] === 'arc' ? c[3] : c[3] / 2);
      }); });
      return out;
    }
    function drawOnce(layer) { G.beginEffectFrame(); recReset(); G.drawEffectLayer3D(layer === undefined ? 1 : layer); return frameStats(); }
    // Auto occlusion reads the footprint above 1.5 px (spec 6.3): a 2-3 px
    // dot whose centre pixel is behind a 1 px pillar still shows on both
    // sides of it, as the billboard mask decides (mixed: drawn clipped).
    scene(); var S = install(64, 9201);
    put(S, 'r.dot', 179.5, 120, 60, {rpx: 2.5});
    depthFrame(); drawOnce();
    var R0 = arcsNear(179.5, 120, 0.01)[0];
    depthFrame(); wall(179, 180, 0, H, 20);
    var f1 = drawOnce(), got = arcsNear(179.5, 120, 0.01), dec = billboardDecision(179.5 - R0, 120 - R0, 179.5 + R0, 120 + R0, 60);
    if (!(R0 > 1.5 && R0 <= 3)) throw Error('SETUP pillar dot radius ' + R0);
    check('a dot over 1.5 px behind a 1 px pillar is footprint-tested and drawn', dec === 2 && got.length === 1 && f1.occ.footprint === 1 && f1.occ.point === 0,
      {radius: R0, billboard: dec, drawn: got.length, occ: f1.occ});
    // Past the mixed-item cap (256) a mixed item is gated by its centre
    // pixel, and a centre off the frame is hidden: 256 clip items fill the
    // cap over open ground, then one centred 2 px off the left edge, whose
    // on-frame part lies behind a wall, is not drawn over the wall.
    S = install(512, 9202);
    for (var k = 0; k < 256; k++) put(S, 'r.clip', 200 + (k % 16) * 9, 20 + Math.floor(k / 16) * 12, 60, {rpx: 2});
    put(S, 'r.clip', -2, 120, 60, {rpx: 5});
    depthFrame(); wall(0, 180, 0, H, 20);
    var f2 = drawOnce(), leak = arcsNear(-2, 120, 0.5);
    check('past the mixed cap an item centred off the frame stays hidden behind the wall', f2.occ.mixedSkipped === 1 && !leak.length && f2.drawn === 256,
      {mixedSkipped: f2.occ.mixedSkipped, leak: leak, drawn: f2.drawn});
    // Tiles on a box with no pixel centre on the frame (spec 5.3a): hidden,
    // as the billboard decides (skipped); 1 px further in it covers pixel
    // column 0 and is drawn.
    S = install(64, 9203); put(S, 'r.tiles', 60, 120, 60, {rpx: 30}); depthFrame(); drawOnce();
    var RT = arcsNear(60, 120, 0.01)[0], tiles = [];
    [0.2, 1.2].forEach(function (edgeX) {
      var sx = edgeX - RT;
      S = install(64, 9204); put(S, 'r.tiles', sx, 120, 60, {rpx: 30});
      depthFrame();
      var fr = drawOnce();
      tiles.push({edge: edgeX, drawn: arcsNear(sx, 120, 0.01).length, tiles: fr.occ.tiles, billboard: billboardDecision(sx - RT, 120 - RT, sx + RT, 120 + RT, 60)});
    });
    if (!(RT > 24)) throw Error('SETUP tile dot radius ' + RT);
    check('tiles hide a box with no pixel centre on the frame and draw one with a pixel', tiles[0].billboard === 0 && tiles[0].drawn === 0 &&
      tiles[1].billboard === 1 && tiles[1].drawn === 1 && tiles[0].tiles === 1, {radius: RT, cases: tiles});
    // Tiles are decisive where every pixel passes the biased depth test: a
    // resting-sized glow 0.1 u behind a wall 5 u away (inside the 0.15
    // inverse-depth bias) is all visible and drawn with no clip.
    S = install(64, 9205); put(S, 'r.tiles', 180, 120, 5.1, {rpx: 30});
    depthFrame(); wall(0, W, 0, H, 5);
    var f4 = drawOnce(), bias = {billboard: billboardDecision(180 - RT, 120 - RT, 180 + RT, 120 + RT, 5.1), clips: rec.clips, drawn: arcsNear(180, 120, 0.01).length,
      scan: scan(180 - RT, 120 - RT, 180 + RT, 120 + RT, 1 / 5.1), tiles: f4.occ.tiles};
    check('tiles draw a box whose every pixel passes the biased test without a clip', bias.billboard === 1 && bias.scan.hid === 0 && bias.scan.vis > 100 &&
      bias.drawn === 1 && bias.clips === 0, bias);
    // Far streaks are drawn as dots (LOD, spec 6.3) with one point read, the
    // shipping rain's authored occlusion ('segment') included.
    S = install(64, 9206); put(S, 'r.farStreak', 180, 100, 120, {vz: -300});
    depthFrame();
    var f5 = drawOnce(), strokes = rec.draws.filter(function (d) { return d.kind === 'stroke'; }).length;
    check('a far streak drawn as a dot costs one point read', f5.drawn === 1 && strokes === 0 && f5.occ.point === 1 && f5.occ.tiles === 0 && f5.occ.segment === 0,
      {drawn: f5.drawn, strokes: strokes, occ: f5.occ});
    scene();
  });

  // Settle: the live pool is back, no runtime failure was hidden.
  G.fxState = liveState;
  var fx = G.getEffectStats().failures, failedKeys = Object.keys(fx).filter(function (k) { return fx[k]; });
  check('no effect runtime failures were counted', !failedKeys.length, {failures: fx, warnings: warnings.slice(0, 3)});
  check('no console errors from the game', !G.__renderErrors.length, {errors: G.__renderErrors.slice(0, 3)});
  output('PARTICLE_RENDER_RESULT ' + (failed ? 'FAIL ' + failed + '/' + checked : 'PASS ' + checked));
}());
undefined;
