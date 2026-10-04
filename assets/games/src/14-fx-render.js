// Shared render primitives (unified effects V1, S2): the particle layers of
// the 3D view (combat after structures3D, world at the ambient slot), the
// first-person overlay (eye and screen space, under the arms) and the 2D view,
// which also draws the soul orbs (S4), and the torch glow stage (S8).
// They read fxState and never write it. Occlusion is chosen per particle by
// its device-pixel footprint: a point read, an exact footprint scan, a lazily
// built 8x8 tile min/max summary, a soft corona, segment sampling, a budgeted
// exact clip and a bounded grid clip. Visible particles are batched by style
// bucket over a bounded style table; glows and puffs come from a small sprite
// LRU of their own; nothing sets shadowBlur. A presentation-only governor
// thins cosmetic classes. A stage with nothing to draw makes no Canvas call.
// Entry points catch, count and warn once; none throws into the frame.
var FX_LIGHT = [0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92, 1.0];
var FX_ALPHA = (function () { var a = new Float64Array(16); for (var k = 0; k < 16; k++) a[k] = (k + 0.5) / 16; return a; }());
var FX_WIDTH = [0.75, 1.5, 2, 3], FX_SPRITE_PX = [16, 32, 64, 128];
var FXP_DOT = _fxCode('primitive', 'dot'), FXP_GLOW = _fxCode('primitive', 'glowDot'), FXP_STREAK = _fxCode('primitive', 'streak'),
  FXP_SEG = _fxCode('primitive', 'segment'), FXP_CHIP = _fxCode('primitive', 'chip'), FXP_PUFF = _fxCode('primitive', 'puff'),
  FXP_RING = _fxCode('primitive', 'ring'), FXP_HALO = FX_ENUMS.primitive.length;     // a glowDot's halo: its own sprite item
if (FXP_HALO > 7) throw new Error('Particle render: the bucket key holds 8 primitives');
var FX_PRIM_CAT = new Uint8Array(8);                                                   // 0 fill, 1 stroke, 2 sprite
FX_PRIM_CAT[FXP_STREAK] = FX_PRIM_CAT[FXP_SEG] = FX_PRIM_CAT[FXP_RING] = 1; FX_PRIM_CAT[FXP_PUFF] = FX_PRIM_CAT[FXP_HALO] = 2;
var FXO_AUTO = _fxCode('occlusion', 'auto'), FXO_POINT = _fxCode('occlusion', 'point'), FXO_FOOT = _fxCode('occlusion', 'footprint'),
  FXO_TILES = _fxCode('occlusion', 'tiles'), FXO_CORONA = _fxCode('occlusion', 'corona'), FXO_SEG = _fxCode('occlusion', 'segment'),
  FXO_CLIP = _fxCode('occlusion', 'clip'), FXO_NONE = _fxCode('occlusion', 'none');
var FXL_AMBIENT = _fxCode('lighting', 'ambient'), FXL_GRID = _fxCode('lighting', 'lightGrid'), FXL_EMISSIVE = _fxCode('lighting', 'emissive'),
  FXL_SUN = _fxCode('lighting', 'sun'), FXL_NONE = _fxCode('lighting', 'none');
var FXE_FLASH = _fxCode('envelope', 'flash'), FXE_PULSE = _fxCode('envelope', 'pulse'), FXE_QUAD = _fxCode('envelope', 'quadOut'),
  FXE_LINEAR = _fxCode('envelope', 'linear');
var FXV_NONE = _fxCode('view2D', 'none'), FXV_DOT = _fxCode('view2D', 'dot'), FXV_RING = _fxCode('view2D', 'ring'), FXV_LINE = _fxCode('view2D', 'line'), FXV_PUFF = _fxCode('view2D', 'puff');
var FXM_STATIC = _fxCode('model', 'static');

// Render-side records: never part of fxState, so pools stay a function of
// sim inputs. _fxFrame is refilled once per frame; _fxStats are frame counters.
// The governor's raster input (S9): rasterAcc sums the device pixels that
// unpinned passes (3D, overlay and 2D) painted since its last step; rasterMs
// and input are that step's raster estimate and total (JS stage time +
// raster).
var _fxRender = {governor:1, ema:0, ring:-1, rasterAcc:0, rasterMs:0, input:0, gate:new Uint8Array(0), tier:new Float64Array(0), gateGen:-1, gateC:null, page:0};
var _fxFrame = {gen:1, threeD:false, w:0, h:0, su:0, cos:1, sin:0, invTanHalf:1, horizonY:0, cameraZ:60, projScale:180, RS:1, RS3:1, fp:false,
  ambS:0.9, ambC:0.45, night:0, sun:1, fogS:0.3, fogC:0.15, g:1, maskLeft:0, footLeft:0, glowLeft:0, mixedLeft:0};
var _fxStats = {considered:0, gated:0, thinned:0, offscreen:0, subpixel:0, drawn:0, buckets:0, bucketsMax:0, bucketOverflow:0,
  point:0, footprint:0, tiles:0, corona:0, segment:0, clip:0, grid:0, mixedSkipped:0, maskPx:0, rasterPx:0,
  glowDraws:0, glowCapped:0, spriteHits:0, spriteBuilds:0, spriteFallback:0,
  torchDrawn:0, torchHidden:0, torchCulled:0, torchDropped:0};

// ── Per-frame setup (both views): camera, back-projection, light inputs,
// budgets, governor, counters and the per-recipe draw gate. No Canvas call.
// renderFrame calls beginEffectFrame once at the start of every 3D frame (the
// casting studio's own frame loop included), so it opens the frame; the 2D
// branch has no such call and its fx2D stage opens the 2D frame itself.
function beginEffectFrame() {
  try { fxFrameSetup(true); } catch (e) { effectFailure('render', e); }
}
function fxStageMs(name, slot) {
  var h = typeof _perfStageHistory !== 'undefined' && _perfStageHistory[name];
  return h ? h[slot] : 0;
}
function fxFrameSetup(threeD) {
  var F = _fxFrame, G = _fxRender, S = fxState, st = _fxStats, cfg = EFFECT_CONFIG, gv = cfg.governor;
  F.gen = (F.gen + 1) >>> 0 || 1; F.threeD = threeD;
  F.w = canvas.width; F.h = canvas.height; F.projScale = projScale; F.RS3 = resScale; F.fp = !!(MODE3D && CAM_FOLLOW);
  // Screen-space unit: the canvas height, or 3/4 of the width on a canvas
  // narrower than 4:3 (a portrait phone), so screen-placed x and sizes stay
  // inside the frame; y stays in canvas heights.
  F.su = Math.min(F.h, 0.75 * F.w);
  if (threeD) {
    var C = getCam3D();
    F.cos = C.cosAng; F.sin = C.sinAng; F.invTanHalf = C.invTanHalf; F.horizonY = C.horizonY; F.cameraZ = C.cameraZ;
  }
  F.ambS = typeof renderSurfaceAmbient === 'number' ? renderSurfaceAmbient : 0.9;
  F.ambC = typeof renderCaveAmbient === 'number' ? renderCaveAmbient : 0.45;
  F.night = Math.max(0, Math.min(1, (0.9 - F.ambS) / 0.58));
  F.sun = typeof renderSurfaceSunIntensity === 'number' ? Math.max(0, Math.min(1, renderSurfaceSunIntensity / 0.6)) : 1;
  F.fogS = typeof renderSurfaceFogFloor === 'number' ? renderSurfaceFogFloor : 0.3;
  F.fogC = typeof renderCaveFogFloor === 'number' ? renderCaveFogFloor : 0.15;
  // Governor (section 6.4): the previous frame's fx stage times, one perf ring
  // slot back, smoothed. It only thins drawing; pinned states draw at 1. A
  // stage drawn by a family in Legacy mode (the ambient motes, the torch
  // glow) is left out: thinning cannot reduce its cost. Stage times are JS
  // only, and the Canvas raster behind them grows with the pixels painted
  // (1080p Ultra rain: 0.45 ms JS, 2.5 ms flushed), so the input adds the
  // previous frame's painted device pixels (its unpinned particle passes,
  // not the torch glows it cannot thin) at rasterMsPerMpx, calibrated in
  // Chrome with the flush protocol (section 12.2). At 360 x 240 that term is
  // small. The 2D view's fx2D stage and its pixels count too (S9 fix): its
  // pass thins the same classes, and a frame draws either view, never both.
  if (S && !S.pinned && typeof _perfRingIdx === 'number' && G.ring !== _perfRingIdx) {
    var prev = (_perfRingIdx + PERF_HISTORY_LEN - 1) % PERF_HISTORY_LEN;
    var last = fxStageMs('fxCombat3D', prev) + fxStageMs('fxOverlay', prev) + fxStageMs('fx2D', prev) +
      (effectFamilyMode('ambient') === 'new' ? fxStageMs('ambientFX3D', prev) : 0) + (effectFamilyMode('torchGlow') === 'new' ? fxStageMs('torchGlow3D', prev) : 0);
    G.rasterMs = G.rasterAcc * gv.rasterMsPerMpx * 1e-6; G.rasterAcc = 0; G.input = last + G.rasterMs;
    G.ring = _perfRingIdx; G.ema = G.ema * 0.9 + G.input * 0.1;
    if (G.ema > gv.targetMs) G.governor = Math.max(gv.floor, G.governor * gv.down);
    else if (G.ema < gv.lowMs) G.governor = Math.min(1, G.governor * gv.up);
  }
  F.g = !S || S.pinned ? 1 : G.governor;
  F.maskLeft = cfg.maskBudgetPx; F.footLeft = cfg.footprintBudgetPx; F.mixedLeft = cfg.mixedPerFrame;
  F.glowLeft = Math.floor(cfg.glowPerFrame * F.g); _fxSpriteBuildsLeft = 3;
  for (var k in st) st[k] = 0;
  if (typeof settingsOpen !== 'undefined' && !settingsOpen) G.page = 0;   // reopening the overlay shows its main page
  if (S) fxDrawGate(S);
}
// Draw gate (section 5.2): rebuilt only when a toggle, family mode or table
// changes, so a preset switched off while paused vanishes on the next frame.
function fxDrawGate(S) {
  var G = _fxRender, gen = effectToggleGeneration(), C = S.C, R = S.R;
  if (G.gateGen === gen && G.gateC === C) return;
  if (G.gate.length < C.count) { G.gate = new Uint8Array(C.count); G.tier = new Float64Array(C.count); }
  for (var r = 0; r < C.count; r++) {
    var t = R.toggle[r], f = R.family[r];
    G.gate[r] = t && !effectPresetOn(C.TOGGLES[t]) || f && effectFamilyMode(C.FAMILIES[f]) !== 'new' ? 0 : 1;
    G.tier[r] = R.sizeTier[r] ? getScale3D(C.TIERS[R.sizeTier[r]]) : SCALE_3D_GLOBAL;
  }
  G.gateGen = gen; G.gateC = C;
}

// ── Stages ────────────────────────────────────────────────────────────────
// 1 combat (after structures3D), 0 world (the ambient slot: in Legacy mode
// it first draws the legacy array exactly as drawAmbientParticles3D does).
function drawEffectLayer3D(layer) {
  if (layer === 0 && typeof drawAmbientParticles3D === 'function' && effectFamilyMode('ambient') === 'legacy') drawAmbientParticles3D();
  fxStage(layer);
}
function drawEffectOverlay() { fxStage(2); }
// The 2D view's frame opens here; a 2D pass inside an open 3D frame (MODE3D)
// joins that frame, so its budgets and counters are never refilled twice.
// Soul orbs (gameplay pickups, the soulOrbs family's 2D stage) draw first,
// under the particles.
function drawEffectLayer2D() {
  drawSoulOrbs2D();
  if (!(MODE3D && _fxFrame.threeD)) { try { fxFrameSetup(false); } catch (e) { effectFailure('render', e); return; } }
  fxStage(3);
}
// Soul orbs had no 2D renderer (combat-16): the pulsing disc and highlight of
// drawSoulOrbs3D (19-companions-loot.js) without its shadowBlur, culled to
// the view. No Canvas call when no orb is in view.
function drawSoulOrbs2D() {
  var list = typeof soulOrbs !== 'undefined' ? soulOrbs : null, open = false;
  if (!list || !list.length) return;
  try {
    var now = gameTimeNow(), x0 = viewCam.x - 8, y0 = viewCam.y - 8, x1 = viewCam.x + canvas.width + 8, y1 = viewCam.y + canvas.height + 8;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (!o || !(o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1)) continue;
      var ph = Number.isFinite(o.bob) ? o.bob : 0, r = 5 * (0.75 + 0.25 * Math.sin(now * 0.005 + ph)), y = o.y + Math.sin(now * 0.003 + ph) * 2;
      if (!open) { open = true; ctx.save(); ctx.translate(-viewCam.x, -viewCam.y); ctx.shadowBlur = 0; ctx.globalAlpha = 0.92; }
      ctx.fillStyle = '#cc88ff';
      ctx.beginPath(); ctx.arc(o.x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.arc(o.x - r * 0.28, y - r * 0.28, r * 0.28, 0, Math.PI * 2); ctx.fill();
    }
  } catch (e) { effectFailure('render', e); }
  finally { if (open) ctx.restore(); }
}
function fxStage(mode) {
  var S = fxState;
  if (!S || !S.count) return;
  try { fxRunPass(S, mode); } catch (e) { effectFailure('render', e); }
  finally { fxClose(); }
}
var _fxSaved = false, _fxBlend = -1, _fxPassS = null;
function fxOpen() {                                   // the first draw of a pass opens its save()
  if (_fxSaved) return;
  ctx.save(); _fxSaved = true; ctx.shadowBlur = 0; _fxBlend = -1;
}
function fxClose() { if (_fxSaved) { _fxSaved = false; ctx.restore(); } }

// ── Depth tests (predicate and pixel-centre rule of 12-scene-depth.js) ─────
function fxVis(inv, iz) { return iz * (1 + inv * 0.15) + 1e-9 >= inv; }
// 0 hidden, 1 all visible, 2 mixed: the decision withSceneDepthBillboard makes
// for the same rectangle (callback skipped, called unclipped, called clipped).
function fxDepthFootprint(x0, y0, x1, y1, iz) {
  var W = _sceneDepthW, H = _sceneDepthH, D = _sceneDepthInv;
  if (!W || !H) return 0;
  var sx = Math.max(0, Math.ceil(x0 - 0.5)), ex = Math.min(W - 1, Math.floor(x1 - 0.5));
  var sy = Math.max(0, Math.ceil(y0 - 0.5)), ey = Math.min(H - 1, Math.floor(y1 - 0.5)), vis = 0, hid = 0;
  for (var y = sy; y <= ey; y++) for (var j = y * W + sx, x = sx; x <= ex; x++, j++) {
    var inv = D[j];
    if (iz * (1 + inv * 0.15) + 1e-9 >= inv) vis++; else hid++;
    if (vis && hid) return 2;
  }
  return vis ? 1 : 0;
}
// One pixel; outside the depth frame counts as `edge`.
function fxDepthPoint(x, y, iz, edge) {
  var W = _sceneDepthW, px = Math.floor(x), py = Math.floor(y);
  if (!W) return 0;
  if (px < 0 || py < 0 || px >= W || py >= _sceneDepthH) return edge;
  return fxVis(_sceneDepthInv[py * W + px], iz) ? 1 : 0;
}
// Corona (section 5.3a): how many of five samples, the centre and four at q
// px from it, pass the depth test. A sample off the depth frame is judged at
// the frame's nearest pixel, where the glow actually lands, so a light hidden
// behind terrain just past the screen edge stays hidden and one in the open
// keeps its glow. A soft glow scales its alpha by that share and draws
// unclipped: it fades behind terrain instead of being cut at its edge, at a
// constant cost.
function fxCorona(x, y, iz, q) {
  return fxDepthNearest(x, y, iz) + fxDepthNearest(x - q, y, iz) + fxDepthNearest(x + q, y, iz) +
    fxDepthNearest(x, y - q, iz) + fxDepthNearest(x, y + q, iz);
}
function fxDepthNearest(x, y, iz) {
  var W = _sceneDepthW, H = _sceneDepthH, px = Math.floor(x), py = Math.floor(y);
  if (!W || !H) return 0;
  px = px < 0 ? 0 : px >= W ? W - 1 : px; py = py < 0 ? 0 : py >= H ? H - 1 : py;
  return fxVis(_sceneDepthInv[py * W + px], iz) ? 1 : 0;
}
// Tile summary (section 5.3a): per 8x8 tile min/max inverse depth, built on a
// tile's first query in a frame. The predicate is monotone in the depth
// value, so "all visible" holds iff it holds at the tile's max and "all
// hidden" iff it fails at its min; anything else is mixed (conservative).
var _fxTileMin = new Float32Array(0), _fxTileMax = new Float32Array(0), _fxTileGen = new Uint32Array(0), _fxTileRuns = new Int32Array(0);
var _fxTilesW = 0, _fxTileW = 0, _fxTileH = 0;
function fxTilesReady(W, H) {
  if (W === _fxTileW && H === _fxTileH) return;
  var tw = (W + 7) >> 3, n = tw * ((H + 7) >> 3);
  if (_fxTileGen.length < n) { _fxTileMin = new Float32Array(n); _fxTileMax = new Float32Array(n); _fxTileGen = new Uint32Array(n); }
  else _fxTileGen.fill(0, 0, n);
  if (_fxTileRuns.length < 24 * tw) _fxTileRuns = new Int32Array(24 * tw);   // two tile rows of runs, <= 4 per tile
  _fxTilesW = tw; _fxTileW = W; _fxTileH = H;
}
function fxTileBuild(t, tx, ty) {
  var W = _sceneDepthW, D = _sceneDepthInv, x0 = tx << 3, y0 = ty << 3, x1 = Math.min(W, x0 + 8), y1 = Math.min(_sceneDepthH, y0 + 8);
  var lo = Infinity, hi = -Infinity;
  for (var y = y0; y < y1; y++) for (var j = y * W + x0, e = j + x1 - x0; j < e; j++) { var v = D[j]; if (v < lo) lo = v; if (v > hi) hi = v; }
  _fxTileMin[t] = lo; _fxTileMax[t] = hi; _fxTileGen[t] = _fxFrame.gen;
}
// 0 hidden, 1 all visible, 2 mixed; never "all visible" over a hidden pixel
// and never "hidden" over a visible one.
function fxTileClass(x0, y0, x1, y1, iz) {
  var W = _sceneDepthW, H = _sceneDepthH;
  if (!W || !H) return 0;
  var sx = Math.max(0, Math.ceil(x0 - 0.5)), ex = Math.min(W - 1, Math.floor(x1 - 0.5));
  var sy = Math.max(0, Math.ceil(y0 - 0.5)), ey = Math.min(H - 1, Math.floor(y1 - 0.5)), vis = 0, hid = 0;
  if (sx > ex || sy > ey) return 0;
  fxTilesReady(W, H);
  for (var ty = sy >> 3; ty <= ey >> 3; ty++) for (var tx = sx >> 3; tx <= ex >> 3; tx++) {
    var t = ty * _fxTilesW + tx;
    if (_fxTileGen[t] !== _fxFrame.gen) fxTileBuild(t, tx, ty);
    var lo = _fxTileMin[t], hi = _fxTileMax[t];
    if (iz * (1 + hi * 0.15) + 1e-9 >= hi) vis = 1;
    else if (iz * (1 + lo * 0.15) + 1e-9 < lo) hid = 1;
    else return 2;
    if (vis && hid) return 2;
  }
  return vis ? 1 : 0;
}
// Clip path of a mixed item under 'tiles'. Fully visible tiles merge into one
// run per stretch of a tile row, and a run carries down while the next tile
// row has the same span, so the path grows with the occluder edge inside the
// item, not with its area or the canvas size. A mixed tile is read exactly
// while the mask budget lasts (the grid rule beyond it): when all its rows
// have the same visible runs (a vertical edge or pillar) those runs join the
// tile row's runs; otherwise it gets per-row rects, identical rows coalesced.
// The item's box is in whole pixels. Returns the rect count.
function fxTilePath(sx, sy, ex, ey, iz) {
  var F = _fxFrame, st = _fxStats, V = _fxTileRuns, Q = _fxQ, n = 0, gridded = false;
  var prev = 0, pn = 0, cur = 12 * _fxTilesW, cn, c, j, o;              // run lists (x0, x1, top row) of two tile rows
  for (var ty = sy >> 3; ty <= ey >> 3; ty++) {
    var ay = Math.max(sy, ty << 3), by = Math.min(ey, (ty << 3) + 7), run = -1, end = -1;
    for (var tx = sx >> 3, cn = 0; tx <= ex >> 3; tx++) {
      var t = ty * _fxTilesW + tx, ax = Math.max(sx, tx << 3), bx = Math.min(ex, (tx << 3) + 7);
      if (_fxTileGen[t] !== F.gen) fxTileBuild(t, tx, ty);
      if (fxVis(_fxTileMax[t], iz)) { if (run < 0) run = ax; end = bx; continue; }     // all visible: extends the run
      var mixed = fxVis(_fxTileMin[t], iz), cnt = (bx - ax + 1) * (by - ay + 1), exact = mixed && cnt <= F.maskLeft, alike = false, k = 0;
      if (exact) {
        F.maskLeft -= cnt; st.maskPx += cnt;
        for (var y = ay + 1, k = fxTileRowRuns(ax, bx, ay, iz, 0); y <= by && fxTileRowRuns(ax, bx, y, iz, 8) === k && fxRunsSame(k); y++);
        alike = y > by;
      }
      if (alike) {                                                             // its runs join the tile row's
        for (c = 0; c < k; c++) {
          if (run >= 0 && Q[2 * c] === end + 1) { end = Q[2 * c + 1]; continue; }
          if (run >= 0) { o = cur + 3 * cn++; V[o] = run; V[o + 1] = end; }
          run = Q[2 * c]; end = Q[2 * c + 1];
        }
        if (run < 0 || end === bx) continue;                                   // a run ending at bx may go on
      }
      if (run >= 0) { o = cur + 3 * cn++; V[o] = run; V[o + 1] = end; run = -1; }
      if (!mixed || alike) continue;                                           // hidden, or alike and closed
      if (exact) n += fxTileRows(ax, bx, ay, by, iz);
      else { gridded = true; n += fxGridPath(sx, sy, ex, ey, ax, ay, bx, by, iz); }
    }
    if (run >= 0) { o = cur + 3 * cn++; V[o] = run; V[o + 1] = end; }
    // A run with the same span as one in the row above continues it; the
    // runs of the row above that do not continue are closed here.
    for (c = 0, j = 0; c < cn; c++) {
      o = cur + 3 * c; V[o + 2] = ay;
      while (j < pn && (V[prev + 3 * j] < V[o] || V[prev + 3 * j] === V[o] && V[prev + 3 * j + 1] !== V[o + 1])) n += fxRunRect(V, prev + 3 * j++, ay);
      if (j < pn && V[prev + 3 * j] === V[o]) V[o + 2] = V[prev + 3 * j++ + 2];
    }
    while (j < pn) n += fxRunRect(V, prev + 3 * j++, ay);
    o = prev; prev = cur; cur = o; pn = cn;
  }
  for (j = 0; j < pn; j++) n += fxRunRect(V, prev + 3 * j, ey + 1);
  if (gridded) st.grid++;
  return n;
}
function fxRunRect(V, o, bottom) { ctx.rect(V[o], V[o + 2], V[o + 1] - V[o] + 1, bottom - V[o + 2]); return 1; }
// The visible runs (x0, x1) of one row of a tile, into _fxQ at off; at most
// four in 8 px. fxRunsSame compares the runs at 0 and at 8.
var _fxQ = new Int32Array(16);
function fxTileRowRuns(ax, bx, y, iz, off) {
  var D = _sceneDepthInv, row = y * _sceneDepthW, k = 0;
  for (var x = ax; x <= bx;) {
    while (x <= bx && !fxVis(D[row + x], iz)) x++;
    if (x > bx) break;
    _fxQ[off + 2 * k] = x;
    while (x <= bx && fxVis(D[row + x], iz)) x++;
    _fxQ[off + 2 * k++ + 1] = x - 1;
  }
  return k;
}
function fxRunsSame(k) { for (var j = 0; j < 2 * k; j++) if (_fxQ[j] !== _fxQ[8 + j]) return false; return true; }
// Exact rows of a mixed tile; a row with the same runs as the one above
// extends its rects.
function fxTileRows(ax, bx, ay, by, iz) {
  var n = 0, top = ay, k = fxTileRowRuns(ax, bx, ay, iz, 0);
  for (var y = ay + 1; y <= by + 1; y++) {
    var k2 = y <= by ? fxTileRowRuns(ax, bx, y, iz, 8) : -1;
    if (k2 === k && fxRunsSame(k)) continue;
    for (var c = 0; c < k; c++) { ctx.rect(_fxQ[2 * c], top, _fxQ[2 * c + 1] - _fxQ[2 * c] + 1, y - top); n++; }
    _fxQ.copyWithin(0, 8, 16); k = k2; top = y;
  }
  return n;
}
// Pixel centres inside a box, clamped to the depth frame: what the exact mask
// rasterises and what a footprint scan reads at most.
function fxPixels(x0, y0, x1, y1) {
  var w = Math.min(_sceneDepthW - 1, Math.floor(x1 - 0.5)) - Math.max(0, Math.ceil(x0 - 0.5)) + 1;
  var h = Math.min(_sceneDepthH - 1, Math.floor(y1 - 0.5)) - Math.max(0, Math.ceil(y0 - 0.5)) + 1;
  return w > 0 && h > 0 ? w * h : 0;
}
// The bounded fallback: the box's 12 x 12 cells, each read once at its
// centre, restricted to [ax..bx] x [ay..by]; visible cells merge into runs.
function fxGridPath(sx, sy, ex, ey, ax, ay, bx, by, iz) {
  var cw = (ex - sx + 1) / 12, ch = (ey - sy + 1) / 12, W = _sceneDepthW, D = _sceneDepthInv, n = 0;
  for (var gj = 0; gj < 12; gj++) {
    var y0 = Math.max(ay, sy + Math.floor(gj * ch)), y1 = Math.min(by, sy + Math.floor((gj + 1) * ch) - 1);
    if (y0 > y1) continue;
    var cy = (y0 + y1) >> 1, run = -1, end = -1;
    for (var gi = 0; gi < 12; gi++) {
      var x0 = Math.max(ax, sx + Math.floor(gi * cw)), x1 = Math.min(bx, sx + Math.floor((gi + 1) * cw) - 1);
      if (x0 > x1) continue;
      if (fxVis(D[cy * W + ((x0 + x1) >> 1)], iz)) { if (run < 0) run = x0; end = x1; }
      else if (run >= 0) { ctx.rect(run, y0, end - run + 1, y1 - y0 + 1); n++; run = -1; }
    }
    if (run >= 0) { ctx.rect(run, y0, end - run + 1, y1 - y0 + 1); n++; }
  }
  return n;
}

// ── Lighting, fog and envelopes (sections 5.6, 4.1) ───────────────────────
// Field members fade over the outer edge of their box (edgeFade of its half
// size; a 2D weather box over its margin beyond the view), so a member wraps
// where it is invisible (the box of the last tick, section 4.3).
function fxFieldFade(S, code, x, y) {
  var st = S.fields[code & 255];                                      // a weather member's owner also holds its set
  if (!st || !(st.fade > 0) || !(st.hx > 0)) return 1;
  var e = st.fade, dx = st.hx - Math.abs(x - st.cx), dy = st.hy - Math.abs(y - st.cy), d = dx < dy ? dx : dy;
  return d >= e ? 1 : d > 0 ? d / e : 0;
}
function fxLightLevel(under, grid, x, y) {
  var F = _fxFrame, a = under ? F.ambC : F.ambS, v = a < 0.85 ? 0.3 + 0.7 * a : 1;   // spriteLight
  if (grid && _lightGrid) {
    var gx = Math.floor(x / _lightCellSize), gy = Math.floor(y / _lightCellSize);
    if (gx >= 0 && gx < _lightGridW && gy >= 0 && gy < _lightGridH) { var p = _lightGrid[gy * _lightGridW + gx]; v += p < 0.6 ? p : 0.6; }
  }
  var L = Math.round((v - 0.2) / 0.12);
  return L < 0 ? 0 : L > 7 ? 7 : L;
}
function fxEnvelope(R, r, t, a, phase) {
  var fi = R.fadeIn[r], fo = R.fadeOut[r], e = 1, env = R.envelope[r];
  if (fi > 0 && t < fi) e = t / fi;
  if (fo > 0 && t > 1 - fo) { var o = (1 - t) / fo; if (o < e) e = o; }
  if (env === FXE_FLASH) e *= (1 - t) * (1 - t);
  else if (env === FXE_QUAD) e *= 1 - t * t;
  else if (env === FXE_LINEAR) e *= 1 - t;
  else if (env === FXE_PULSE) e *= 1 - R.pulseD[r] * (0.5 - 0.5 * Math.cos(R.pulseW[r] * a + phase));
  return e < 0 ? 0 : e > 1 ? 1 : e;
}

// ── Style table and sprites (sections 5.4, 5.5) ───────────────────────────
// 'rgb(r,g,b)' per (palette entry, light level), built once; a slot is rebuilt
// only when the colour behind its index changes (dynamic entries, tables).
var _fxStyleStr = new Array(8192), _fxStyleRGB = new Int32Array(8192).fill(-1);
function fxPalRGB(S, pal) { var P = S.C.PAL; return pal < P.count ? P.rgb[pal] : S.dynPal[pal - P.count]; }
function fxStyle(S, pal, L) {
  var k = pal * 8 + L, rgb = fxPalRGB(S, pal);
  if (_fxStyleRGB[k] !== rgb) {
    var f = FX_LIGHT[L];
    _fxStyleStr[k] = 'rgb(' + Math.round(((rgb >> 16) & 255) * f) + ',' + Math.round(((rgb >> 8) & 255) * f) + ',' + Math.round((rgb & 255) * f) + ')';
    _fxStyleRGB[k] = rgb;
  }
  return _fxStyleStr[k];
}
// Particle sprite LRU: 64 entries, 1 MB, 3 builds per frame; keyed by colour,
// lit level (0..3), size bucket (16/32/64/128 px) and kind (glow, puff, torch).
var _fxSprites = new Map(), _fxSpriteBytes = 0, _fxSpriteBuildsLeft = 3, _fxSpriteFailed = false;
var FX_SPRITE_STOPS = [[0.55, 0.42, 0.2], [0.9, 0.5, 0.5], [0.7, 0.4, 0.3]];    // centre alpha, mid offset, mid alpha
function fxSpriteBucket(r) { var d = r * 2; return d <= 16 ? 0 : d <= 32 ? 1 : d <= 64 ? 2 : 3; }
function fxSprite(rgb, level4, bucket, kind) {
  var key = ((rgb * 4 + level4) * 4 + bucket) * 3 + kind, e = _fxSprites.get(key), st = _fxStats;
  if (e) { st.spriteHits++; _fxSprites.delete(key); _fxSprites.set(key, e); return e.canvas; }
  var px = FX_SPRITE_PX[bucket], bytes = px * px * 4, el;
  if (_fxSpriteFailed || _fxSpriteBuildsLeft <= 0 || typeof document === 'undefined' || !document || typeof document.createElement !== 'function') return null;
  try {
    el = document.createElement('canvas'); el.width = el.height = px;
    var g = el.getContext('2d');
    if (!g || typeof g.createRadialGradient !== 'function') throw new Error('no 2D context');
    var f = FX_LIGHT[level4 * 2 + 1], r = Math.round(((rgb >> 16) & 255) * f), gg = Math.round(((rgb >> 8) & 255) * f), b = Math.round((rgb & 255) * f);
    var s = FX_SPRITE_STOPS[kind], h = px / 2, c = 'rgba(' + r + ',' + gg + ',' + b + ',';
    var mid = kind === 2 ? 'rgba(' + r + ',' + Math.floor(gg * 0.7) + ',' + Math.floor(b * 0.3) + ',' : c;   // legacy torch stops
    var grad = g.createRadialGradient(h, h, 0, h, h, h);
    grad.addColorStop(0, c + s[0] + ')'); grad.addColorStop(s[1], mid + s[2] + ')'); grad.addColorStop(1, c + '0)');
    g.fillStyle = grad; g.fillRect(0, 0, px, px);
  } catch (err) { _fxSpriteFailed = true; return null; }
  while (_fxSprites.size && (_fxSprites.size >= 64 || _fxSpriteBytes + bytes > 1048576)) {
    var oldest = _fxSprites.keys().next().value, old = _fxSprites.get(oldest);
    _fxSprites.delete(oldest); _fxSpriteBytes -= old.bytes;
  }
  _fxSprites.set(key, {canvas:el, bytes:bytes}); _fxSpriteBytes += bytes; _fxSpriteBuildsLeft--; st.spriteBuilds++;
  return el;
}

// ── Pass scratch: typed items, a bounded bucket table and mixed items ─────
var _fxCapItems = 0, _fxItems = 0, _fxX, _fxY, _fxR, _fxX2, _fxY2, _fxK, _fxBk, _fxM, _fxOrder;
function fxScratch(n) {
  if (n <= _fxCapItems) return;
  n = _fxCapItems = Math.max(1024, n);
  _fxK = new Int32Array(n); _fxBk = new Int32Array(n); _fxM = new Int32Array(n); _fxOrder = new Int32Array(n);
  _fxX = new Float64Array(n); _fxY = new Float64Array(n); _fxR = new Float64Array(n); _fxX2 = new Float64Array(n); _fxY2 = new Float64Array(n);
}
// Key: ((((blend*8 + prim)*1024 + pal)*8 + L)*16 + A)*4 + W, bit-packed. An
// open-addressed table maps keys to at most 512 buckets per pass.
var FX_BUCKETS = 512, _fxHashKey = new Int32Array(2048), _fxHashGen = new Uint32Array(2048), _fxHashVal = new Int16Array(2048), _fxHashStamp = 0;
var _fxBucketKey = new Int32Array(FX_BUCKETS), _fxBucketN = new Int32Array(FX_BUCKETS), _fxBucketAt = new Int32Array(FX_BUCKETS), _fxBuckets = 0;
function fxBucket(key) {
  for (var h = (Math.imul(key, 0x9e3779b1) >>> 21) & 2047; ; h = (h + 1) & 2047) {
    if (_fxHashGen[h] !== _fxHashStamp) {
      if (_fxBuckets >= FX_BUCKETS) return -1;
      _fxHashGen[h] = _fxHashStamp; _fxHashKey[h] = key; _fxBucketKey[_fxBuckets] = key; _fxBucketN[_fxBuckets] = 0;
      return (_fxHashVal[h] = _fxBuckets++);
    }
    if (_fxHashKey[h] === key) return _fxHashVal[h];
  }
}
function fxAddItem(key, x, y, r, x2, y2, aux, mixed) {
  var k = _fxItems++, b = mixed ? -2 : fxBucket(key);
  _fxK[k] = key; _fxX[k] = x; _fxY[k] = y; _fxR[k] = r; _fxX2[k] = x2; _fxY2[k] = y2; _fxM[k] = aux; _fxBk[k] = b;
  if (b >= 0) _fxBucketN[b]++; else if (b === -1) _fxStats.bucketOverflow++;
  return k;
}
// Mixed items: drawn after the batches, each through its own clip. Mode 0
// exact mask (withSceneDepthClip over preallocated corners), 1 grid, 2 tiles.
// The box is the tested (lifted) box; a lifted item's clip is moved down by
// its lift onto the drawn item.
var _fxMixN = 0, _fxMixCore = new Int32Array(256), _fxMixHalo = new Int32Array(256), _fxMixMode = new Uint8Array(256), _fxMixBox = new Float64Array(256 * 6);
var _fxQuad = [{x:0, y:0, depth:1}, {x:0, y:0, depth:1}, {x:0, y:0, depth:1}, {x:0, y:0, depth:1}], _fxClipOpts = {depthBias:0.15}, _fxMixedIndex = 0;
var _fxOne = new Int32Array(1), _fxP = {x:0, y:0, f:0};
function fxMixedDraw() {
  var m = _fxMixedIndex, lift = _fxMixBox[m * 6 + 5];
  _fxStats.drawn++;
  if (lift) ctx.translate(0, -lift);                  // inside the clip: back to drawn coordinates
  fxEmitOne(_fxMixCore[m]);
  if (_fxMixHalo[m] >= 0) fxEmitOne(_fxMixHalo[m]);
}
function fxDrawMixed(m) {
  var o = m * 6, B = _fxMixBox, x0 = B[o], y0 = B[o + 1], x1 = B[o + 2], y1 = B[o + 3], iz = B[o + 4], lift = B[o + 5], mode = _fxMixMode[m];
  _fxMixedIndex = m;
  if (!mode) {
    var q = _fxQuad;
    q[0].x = q[3].x = x0; q[1].x = q[2].x = x1; q[0].y = q[1].y = y0; q[2].y = q[3].y = y1;
    q[0].depth = q[1].depth = q[2].depth = q[3].depth = 1 / iz;
    if (!lift) { withSceneDepthClip(q, fxMixedDraw, _fxClipOpts); return; }
  }
  var W = _sceneDepthW, H = _sceneDepthH;
  var sx = Math.max(0, Math.ceil(x0 - 0.5)), ex = Math.min(W - 1, Math.floor(x1 - 0.5));
  var sy = Math.max(0, Math.ceil(y0 - 0.5)), ey = Math.min(H - 1, Math.floor(y1 - 0.5));
  if (sx > ex || sy > ey) return;
  ctx.save();
  try {
    if (lift) ctx.translate(0, lift);
    if (!mode) { withSceneDepthClip(_fxQuad, fxMixedDraw, _fxClipOpts); return; }
    ctx.beginPath();
    if (mode === 2 ? fxTilePath(sx, sy, ex, ey, iz) : fxGridPath(sx, sy, ex, ey, sx, sy, ex, ey, iz)) { ctx.clip(); fxMixedDraw(); }
  } finally { ctx.restore(); }
}
// World (0), eye (4) or screen (8) point to canvas pixels in _fxP.
function fxProject(space, x, y, z) {
  var F = _fxFrame, P = _fxP, fwd, rgt;
  if (space === 8) { P.x = F.w * 0.5 + x * F.su; P.y = F.h * 0.5 + y * F.h; P.f = 1; return true; }
  if (space === 4) { fwd = x; rgt = y; if (fwd < 1) return false; P.y = F.horizonY - z / fwd * F.projScale; }
  else {
    var dx = x - cam.x, dy = y - cam.y;
    fwd = dx * F.cos + dy * F.sin;
    if (fwd < 1) return false;
    rgt = -dx * F.sin + dy * F.cos; P.y = F.horizonY + (F.cameraZ - z) / fwd * F.projScale;
  }
  P.x = (0.5 + rgt / fwd * F.invTanHalf * 0.5) * F.w; P.f = fwd;
  return true;
}

// ── One pass: mode 0 world, 1 combat, 2 overlay (eye/screen), 3 the 2D view.
// Pass 1 culls, lights, sizes, depth-tests and buckets every particle into
// typed scratch; emission then draws each bucket with one path.
function fxRunPass(S, mode) {
  var F = _fxFrame, G = _fxRender, R = S.R, st = _fxStats, n = S.count;
  if (G.gateC !== S.C) fxDrawGate(S);
  fxScratch(2 * S.cap);                                  // sized by capacity: a rising live count never reallocates
  _fxPassS = S; _fxItems = 0; _fxMixN = 0; _fxBuckets = 0;
  if (!(_fxHashStamp = (_fxHashStamp + 1) >>> 0)) { _fxHashGen.fill(0); _fxHashStamp = 1; }
  var gate = G.gate, tier = G.tier, twoD = mode === 3, over = mode === 2, W = F.w, H = F.h, back = fxPresentationBack(S);
  F.RS = twoD ? 1 : F.RS3;
  var X = S.x, Y = S.y, Z = S.z, VX = S.vx, VY = S.vy, VZ = S.vz, FL = S.flags, drawn0 = st.drawn, mask0 = st.maskPx, grid0 = st.grid, glow0 = st.glowDraws;
  for (var i = 0; i < n; i++) {
    var r = S.rec[i], fl = FL[i], space = fl & 12;
    if (twoD) { if (space || R.view2D[r] === FXV_NONE) continue; }
    else if (over) { if (space ? !F.fp : R.layer[r] !== 2) continue; }
    else if (space || R.layer[r] !== mode) continue;
    if (!gate[r]) { st.gated++; continue; }
    st.considered++;
    if (S.cls[i] <= 2 && (S.seedA[i] & 1023) >= F.g * 1024) { st.thinned++; continue; }   // weather, ambient, locomotion
    var age = S.age[i], b = (fl & FX_SNAP) ? 0 : age < back ? age : back, a = age - b, t = a / S.life[i];
    var alpha = S.alpha[i] * fxEnvelope(R, r, t, a, S.phase[i]);
    if (fl & FX_DYING) { var left = (S.life[i] - a) / EFFECT_CONFIG.cullFadeSeconds; if (left < 1) alpha *= left > 0 ? left : 0; }
    if (alpha < 0.01) continue;
    var px = X[i] - VX[i] * b, py = Y[i] - VY[i] * b, pz = Z[i] - VZ[i] * b, prim = R.prim[r];
    if (fl & FX_FIELD) { alpha *= fxFieldFade(S, S.owner[i], px, py); if (alpha < 0.01) continue; }
    var size = S.size[i] * (1 + (R.grow[r] - 1) * t), sx, sy, sx2 = 0, sy2 = 0, rr, ry = 0, iz = 0, iz2 = 0, fwd = 1, L = 7, hr = 0, Wl = 0;
    var lift = 0, lift2 = 0;                                                // depth-test offset in pixels (screen up)
    if (twoD) {
      var v2 = R.view2D[r];
      sx = px - viewCam.x; sy = py - viewCam.y;
      // 1 u = 1 px in 2D: dots, rings and puffs are at least the recipe's 2D floor (minPx2D; a dot 1 px) in radius.
      var lo2 = R.minPx2D[r];
      if (v2 === FXV_DOT) { prim = FXP_DOT; if (lo2 < 1) lo2 = 1; rr = size > lo2 ? size : lo2; }
      else if (v2 === FXV_RING) { prim = FXP_RING; rr = ry = size > lo2 ? size : lo2; }
      else if (v2 === FXV_PUFF) { prim = FXP_PUFF; rr = size > lo2 ? size : lo2; }
      else if (v2 === FXV_LINE) {
        var ls = R.streakS[r] > 0 ? R.streakS[r] : 0.05;
        prim = FXP_STREAK; rr = 0.75; Wl = 1; sx2 = sx - VX[i] * ls; sy2 = sy - VY[i] * ls;
      } else {
        var hl2 = fxStickHalf(R, r, S.seedA[i]), c2 = Math.cos(S.rot[i]) * hl2, s2 = Math.sin(S.rot[i]) * hl2;
        prim = FXP_SEG; rr = 1; Wl = 2; sx2 = sx + c2; sy2 = sy + s2; sx -= c2; sy -= s2;
      }
    } else {
      // Ground-resting items, and static rings (they stay where they touched
      // the ground), are depth-tested 0.5 u above their support so the ground
      // they lie on does not hide them (section 5.3a); they are drawn in place.
      var up = !space && ((fl & FX_REST) || prim === FXP_RING && R.motion[r] === FXM_STATIC) ? 0.5 : 0;
      if (prim === FXP_SEG) {
        // A resting stick lies at the support's tilt, which the engine keeps in spin (fxStickRest).
        var hl = fxStickHalf(R, r, S.seedA[i]), rot = (fl & FX_REST) ? S.spin[i] : S.rot[i], ph = S.phase[i];
        var cr = Math.cos(rot) * hl, ex = Math.cos(ph) * cr, ey = Math.sin(ph) * cr, ez = Math.sin(rot) * hl;
        if (!fxProject(space, px + ex, py + ey, pz + ez)) { st.offscreen++; continue; }
        sx2 = _fxP.x; sy2 = _fxP.y; iz2 = 1 / _fxP.f; lift2 = up * F.projScale * iz2;
        if (!fxProject(space, px - ex, py - ey, pz - ez)) { st.offscreen++; continue; }
      } else if (!fxProject(space, px, py, pz)) { st.offscreen++; continue; }
      sx = _fxP.x; sy = _fxP.y; fwd = _fxP.f; iz = 1 / fwd; lift = up * F.projScale / fwd;
      if (prim !== FXP_SEG) lift2 = lift;
      rr = size * (space === 8 ? F.su : tier[r] * F.projScale / fwd);
      var lo = R.minPx[r] * F.RS, hi = R.maxPx[r] * F.RS;
      rr = rr < lo ? lo : rr > hi ? hi : rr;
      if (prim === FXP_STREAK) {
        var ss = R.streakS[r];
        if (!space && fwd > R.far[r]) prim = FXP_DOT;                      // LOD: far streaks draw as dots
        else if (fxProject(space, px - VX[i] * ss, py - VY[i] * ss, pz - VZ[i] * ss)) { sx2 = _fxP.x; sy2 = _fxP.y; iz2 = 1 / _fxP.f; }
        else { sx2 = sx; sy2 = sy; iz2 = iz; }
      } else if (prim === FXP_RING) {
        var tilt = space ? 1 : (F.cameraZ - pz) / fwd;
        ry = rr * (tilt < 0.08 ? 0.08 : tilt > 1 ? 1 : tilt);
      } else if (prim === FXP_GLOW && R.glowA[r] > 0 && (space || fwd <= R.glowFar[r])) {
        hr = rr * R.glowMul[r]; if (hr > 0.5 * H) hr = 0.5 * H;
      }
    }
    // Screen box and cull.
    var line = prim === FXP_STREAK || prim === FXP_SEG, hx = hr > rr ? hr : rr, hy = prim === FXP_RING ? ry : hx;
    var bx0 = line ? Math.min(sx, sx2) - rr : sx - hx, bx1 = line ? Math.max(sx, sx2) + rr : sx + hx;
    var by0 = line ? Math.min(sy, sy2) - rr : sy - hy, by1 = line ? Math.max(sy, sy2) + rr : sy + hy;
    if (bx1 < 0 || bx0 > W || by1 < 0 || by0 > H) { st.offscreen++; continue; }
    if (rr < 0.25 && hr < 0.25 && !line) { st.subpixel++; continue; }
    // Lighting (level and alpha) and fog.
    if (!twoD) {
      var lt = R.light[r];
      if (lt === FXL_AMBIENT || lt === FXL_GRID) L = fxLightLevel(fl & FX_UNDER, !space && lt === FXL_GRID, px, py);
      else if (lt === FXL_EMISSIVE) alpha *= 1 + R.nightBoost[r] * F.night;
      else if (lt === FXL_SUN) alpha *= F.sun;
      if (R.nightBoost[r] > 0 && (lt === FXL_AMBIENT || lt === FXL_GRID)) alpha *= 1 + F.night * R.nightBoost[r];   // lit snow reads at night
      if (!space && lt !== FXL_NONE) { var fog = 1 - fwd * 0.0008, ff = (fl & FX_UNDER) ? F.fogC : F.fogS; alpha *= fog > ff ? fog : ff; }
      if (R.jitter[r]) { L += Math.floor(effectNoise(S.seedA[i], 11) * 3) - 1; L = L < 0 ? 0 : L > 7 ? 7 : L; }
    }
    if (alpha > 1) alpha = 1;
    // A glowDot's halo is decided here: one that will not be drawn (the glow
    // cap, or too faint) must not size the depth test, the mask cost or the
    // clip, so the item is then tested and drawn as its core.
    var halo = hr > 0 && alpha * R.glowA[r] >= 0.01, capped = halo && F.glowLeft <= 0;
    if (hr > 0 && (!halo || capped)) {
      hr = 0; hx = hy = rr; bx0 = sx - rr; bx1 = sx + rr; by0 = sy - rr; by1 = sy + rr;
      if (sx + rr < 0 || sx - rr > W || sy + rr < 0 || sy - rr > H) { st.offscreen++; continue; }
      if (rr < 0.25) { st.subpixel++; continue; }
    }
    // Occlusion (section 5.3), world space only; tested at the lifted box.
    var cls = 1, aux = 0, occ = space || twoD ? FXO_NONE : R.occ[r];
    var ty = sy - lift, ty0 = by0 - lift, ty1 = by1 - lift;
    if (occ === FXO_AUTO) occ = line ? FXO_SEG : hx <= 1.5 ? FXO_POINT : hx <= 12 || hx <= 24 && F.footLeft > 0 ? FXO_FOOT : FXO_TILES;
    else if (occ === FXO_FOOT && hx > 12 && F.footLeft <= 0) occ = FXO_TILES;
    else if (occ === FXO_SEG && !line) occ = FXO_POINT;
    if (occ === FXO_POINT) { st.point++; cls = fxDepthPoint(sx, ty, iz, 0); }
    else if (occ === FXO_FOOT) {
      st.footprint++;
      if (hx > 12) F.footLeft -= fxPixels(bx0, ty0, bx1, ty1);
      cls = fxDepthFootprint(bx0, ty0, bx1, ty1, iz);
    } else if (occ === FXO_TILES) { st.tiles++; cls = fxTileClass(bx0, ty0, bx1, ty1, iz); }
    else if (occ === FXO_CORONA) {                                          // soft: alpha x visible fraction of 5 core samples
      st.corona++;
      var seen = fxCorona(sx, ty, iz, rr * 0.5);
      alpha *= seen / 5; cls = seen ? 1 : 0;
    } else if (occ === FXO_SEG) {                                           // samples along the line; visible runs are drawn
      st.segment++;
      var lenPx = Math.sqrt((sx2 - sx) * (sx2 - sx) + (sy2 - sy) * (sy2 - sy)), ks = Math.ceil(lenPx / 4), bits = 0, ty2 = sy2 - lift2;
      ks = ks < 2 ? 2 : ks > 9 ? 9 : ks;
      for (var j = 0; j < ks; j++) {
        var u = j / (ks - 1);
        if (fxDepthPoint(sx + (sx2 - sx) * u, ty + (ty2 - ty) * u, iz + (iz2 - iz) * u, 0)) bits |= 1 << j;
      }
      cls = bits ? 1 : 0;
      if (bits && bits !== (1 << ks) - 1) aux = (ks << 10) | bits;
    } else if (occ === FXO_CLIP) { st.clip++; cls = 2; }
    if (!cls || alpha < 0.01) continue;
    var mmode = 0, cost;
    if (cls === 2) {
      if (F.mixedLeft <= 0) { st.mixedSkipped++; cls = fxDepthPoint(sx, ty, iz, 0); if (!cls) continue; }
      else if (occ === FXO_TILES) mmode = 2;
      else if ((cost = fxPixels(bx0, ty0, bx1, ty1)) <= F.maskLeft) { F.maskLeft -= cost; st.maskPx += cost; }
      else { mmode = 1; st.grid++; }
      if (cls === 2) F.mixedLeft--; else st.drawn++;
    } else st.drawn++;
    // Bucket keys and items: the core, then a glowDot's additive halo.
    var A = alpha >= 1 ? 15 : Math.floor(alpha * 16), pal = S.pal[i] & 1023, mixed = cls === 2, x2 = sx2, y2 = sy2;
    var core = prim === FXP_GLOW ? FXP_DOT : prim;
    if (line) Wl = twoD ? Wl : rr * 2 <= 1.1 * F.RS ? 0 : rr * 2 <= 1.75 * F.RS ? 1 : rr * 2 <= 2.5 * F.RS ? 2 : 3;
    else if (core === FXP_RING) { Wl = twoD || rr > 8 * F.RS ? 1 : 0; x2 = ry; }
    else if (core === FXP_PUFF) Wl = fxSpriteBucket(rr);
    else if (core === FXP_CHIP) x2 = S.rot[i];
    var k0 = fxAddItem(((((R.blend[r] * 8 + core) * 1024 + pal) * 8 + L) * 16 + A) * 4 + Wl, sx, sy, rr, x2, y2, aux, mixed), k1 = -1;
    var ha = halo ? alpha * R.glowA[r] : 0;                                 // corona may have dimmed it
    if (capped) st.glowCapped++;
    else if (ha >= 0.01) {
      var gp = R.glowPal[r], hp = gp >= 0 ? gp & 1023 : pal, hL = gp >= 0 ? L : L + 2 > 7 ? 7 : L + 2;
      F.glowLeft--; st.glowDraws++;
      k1 = fxAddItem((((((8 + FXP_HALO) * 1024 + hp) * 8 + hL) * 16 + (ha >= 1 ? 15 : Math.floor(ha * 16))) * 4) + fxSpriteBucket(hr),
        sx, sy, hr, 0, 0, 0, mixed);
    }
    if (mixed) {
      var m = _fxMixN++, o = m * 6;
      _fxMixCore[m] = k0; _fxMixHalo[m] = k1; _fxMixMode[m] = mmode;
      _fxMixBox[o] = bx0; _fxMixBox[o + 1] = ty0; _fxMixBox[o + 2] = bx1; _fxMixBox[o + 3] = ty1; _fxMixBox[o + 4] = iz; _fxMixBox[o + 5] = lift;
    }
  }
  if (!_fxItems) return;
  // Emission: counting sort by bucket; normal blend first (fills, strokes,
  // sprites), then additive; then items that overflowed the table; then the
  // mixed items, each through its own clip. The pixels a pass of an
  // unpinned state paints feed the governor (fxFrameSetup).
  var px0 = st.rasterPx;
  fxOpen();
  var nb = _fxBuckets, at = 0, k;
  for (var bk = 0; bk < nb; bk++) { _fxBucketAt[bk] = at; at += _fxBucketN[bk]; _fxBucketN[bk] = 0; }
  for (k = 0; k < _fxItems; k++) { var bb = _fxBk[k]; if (bb >= 0) _fxOrder[_fxBucketAt[bb] + _fxBucketN[bb]++] = k; }
  st.buckets += nb; if (nb > st.bucketsMax) st.bucketsMax = nb;
  for (var blend = 0; blend < 2; blend++) for (var cat = 0; cat < 3; cat++) for (bk = 0; bk < nb; bk++) {
    var key = _fxBucketKey[bk];
    if ((key >> 22) === blend && FX_PRIM_CAT[(key >> 19) & 7] === cat) fxEmitList(key, _fxOrder, _fxBucketAt[bk], _fxBucketAt[bk] + _fxBucketN[bk]);
  }
  for (k = 0; k < _fxItems; k++) if (_fxBk[k] === -1) fxEmitOne(k);
  for (var mi = 0; mi < _fxMixN; mi++) fxDrawMixed(mi);
  if (!S.pinned) G.rasterAcc += st.rasterPx - px0;
  if (typeof addRenderFrameStat === 'function') {
    addRenderFrameStat('fxDrawn', st.drawn - drawn0); addRenderFrameStat('fxMaskPx', st.maskPx - mask0);
    addRenderFrameStat('fxGrid', st.grid - grid0); addRenderFrameStat('fxGlow', st.glowDraws - glow0);
  }
}
function fxEmitOne(k) { _fxOne[0] = k; _fxBlend = -1; fxEmitList(_fxK[k], _fxOne, 0, 1); }
// One bucket: one style, one path, one fill or stroke (or one drawImage per
// sprite item). A missing sprite draws a flat disc in its place (counted).
// Each item's painted area in device pixels is summed into rasterPx: a
// sprite's square, a dot's rect or disc, a chip's triangle (0.9725 r^2), a
// line's length x width, a ring's perimeter x width.
function fxEmitList(key, list, from, to) {
  var S = _fxPassS, Wl = key & 3, A = (key >> 2) & 15, L = (key >> 6) & 7, pal = (key >> 9) & 1023, prim = (key >> 19) & 7, blend = key >> 22;
  var cat = FX_PRIM_CAT[prim], X = _fxX, Y = _fxY, RR = _fxR, X2 = _fxX2, Y2 = _fxY2, M = _fxM, j, k, r, px = 0;
  if (blend !== _fxBlend) { ctx.globalCompositeOperation = blend ? 'lighter' : 'source-over'; _fxBlend = blend; }
  ctx.globalAlpha = FX_ALPHA[A];
  if (cat === 2) {
    var spr = fxSprite(fxPalRGB(S, pal), L >> 1, Wl, prim === FXP_HALO ? 0 : 1);
    if (spr) {
      for (j = from; j < to; j++) { k = list[j]; r = RR[k]; ctx.drawImage(spr, X[k] - r, Y[k] - r, r * 2, r * 2); px += 4 * r * r; }
      _fxStats.rasterPx += px;
      return;
    }
    _fxStats.spriteFallback += to - from;
    ctx.globalAlpha = FX_ALPHA[A] * 0.6; cat = 0; prim = FXP_DOT;
  }
  var style = fxStyle(S, pal, L);
  ctx.beginPath();
  if (!cat) {
    ctx.fillStyle = style;
    for (j = from; j < to; j++) {
      k = list[j]; r = RR[k];
      if (prim === FXP_CHIP) {
        var c = Math.cos(X2[k]) * r, s = Math.sin(X2[k]) * r, x = X[k], y = Y[k];
        ctx.moveTo(x + c, y + s); ctx.lineTo(x - 0.6 * c - 0.55 * s, y - 0.6 * s + 0.55 * c); ctx.lineTo(x - 0.5 * c + 0.7 * s, y - 0.5 * s - 0.7 * c);
        px += 0.9725 * r * r;
      } else if (r <= 1.25) { ctx.rect(X[k] - r, Y[k] - r, r * 2, r * 2); px += 4 * r * r; }
      else { ctx.moveTo(X[k] + r, Y[k]); ctx.arc(X[k], Y[k], r, 0, 6.283185307179586); px += 3.141592653589793 * r * r; }
    }
    ctx.fill();
    _fxStats.rasterPx += px;
    return;
  }
  var lw = FX_WIDTH[Wl] * _fxFrame.RS;
  ctx.strokeStyle = style; ctx.lineWidth = lw;
  for (j = from; j < to; j++) {
    k = list[j];
    if (prim === FXP_RING) {
      ctx.moveTo(X[k] + RR[k], Y[k]); ctx.ellipse(X[k], Y[k], RR[k], X2[k], 0, 0, 6.283185307179586);
      px += 6.283185307179586 * Math.sqrt((RR[k] * RR[k] + X2[k] * X2[k]) / 2) * lw;
      continue;
    }
    var aux = M[k], x0 = X[k], y0 = Y[k], dx = X2[k] - x0, dy = Y2[k] - y0, len = Math.sqrt(dx * dx + dy * dy);
    if (!aux) { ctx.moveTo(x0, y0); ctx.lineTo(X2[k], Y2[k]); px += len * lw; continue; }
    for (var ks = aux >> 10, bits = aux & 1023, q = 0; q < ks; q++) {       // visible sample runs as sub-segments
      if (!(bits & (1 << q))) continue;
      var e = q;
      while (e + 1 < ks && (bits & (1 << (e + 1)))) e++;
      var u0 = (q - 0.5) / (ks - 1), u1 = (e + 0.5) / (ks - 1);
      u0 = u0 < 0 ? 0 : u0; u1 = u1 > 1 ? 1 : u1;
      ctx.moveTo(x0 + dx * u0, y0 + dy * u0); ctx.lineTo(x0 + dx * u1, y0 + dy * u1);
      px += (u1 - u0) * len * lw;
      q = e;
    }
  }
  ctx.stroke();
  _fxStats.rasterPx += px;
}

// ── Torch glow (section 5.9, S8): the halos of pointLights on the shared
// primitives, at the torchGlow3D stage. Legacy mode calls drawTorchGlow3D
// unchanged. New mode: lights within 400 u with fwd >= 5, culled to the
// screen by their radius (a glow that covers no pixel is culled); radius
// 28.8 projScale smGlow / fwd in whole px, at least 10 and at most 0.6 h
// (the legacy width-based size at 3:2, no longer 18% larger at 16:9 nor
// unbounded near a torch); the legacy alpha with its flicker phase hashed
// from the light's world position, so a window shift or a rebuilt light
// list never makes it jump; the torch sprite (the legacy gradient's stops)
// drawn 'lighter' at that alpha, no per-light gradient or string.
// Occlusion, tested before selection so a hidden light never takes a slot
// from a visible one: corona by default (alpha x the visible share of five
// samples at half the gradient's core, whose inner stop is at 0.4 R, each
// at forward depth as the legacy clip tests it; unclipped, a constant cost
// at any resolution); the dev override fxTorchGlowOcclusion = 'tiles'
// (browser A/B) classifies the glow's box exactly on the tile summary and
// clips a mixed glow through the tiles path within the frame's mask budget
// (the grid rule beyond it; past the mixed-item cap, centre-gated). The
// nearest 12 visible glows are drawn (fixed arrays, no sort). A sprite miss
// (build budget, no document) draws the same stops as a gradient, counted
// spriteFallback.
var fxTorchGlowOcclusion = 'corona';
var FX_TORCH_GLOWS = 12, _fxTorchL = new Array(12), _fxTorchD = new Float64Array(12), _fxTorchX = new Float64Array(12),
  _fxTorchY = new Float64Array(12), _fxTorchR = new Float64Array(12), _fxTorchF = new Float64Array(12),
  _fxTorchA = new Float64Array(12), _fxTorchC = new Uint8Array(12);
function drawTorchGlowStage3D() {
  if (effectFamilyMode('torchGlow') === 'legacy') { drawTorchGlow3D(); return; }
  try { fxTorchGlows(); } catch (e) { effectFailure('render', e); }
  finally { fxClose(); }
}
function fxTorchGlows() {
  var lights = typeof pointLights !== 'undefined' ? pointLights : null, F = _fxFrame, st = _fxStats, n = 0, j, k;
  if (!lights || !lights.length || !MODE3D) return;
  var w = F.w, h = F.h, ps = F.projScale, sm = 120 * getScale3D('smGlow'), cap = Math.floor(0.6 * h);
  var amb = typeof ambientLight === 'number' ? ambientLight : 1, base = 0.08 + 0.22 * Math.max(0, 1 - amb), now = gameTimeNow();
  var ox = ENDLESS_MODE ? windowOriginX : 0, oy = ENDLESS_MODE ? windowOriginY : 0, tiles = fxTorchGlowOcclusion === 'tiles';
  // Merge fix (3D integration): with wallPropModels on, a torch's or sconce's
  // own depth-writing shaft or bowl stands in front of its light (0.5 u out;
  // the modelled flame hangs 2.2-2.7 u out), so from in front and below it
  // hid most corona samples. The corona then tests the visible flame at the
  // light's glowOut/glowUp (buildPointLights: a torch 2 out, 2 up, where
  // embers leave it; a sconce its flame body's centre above the bowl rim;
  // 2 and 2 when a light has none; full-size offsets on a smaller prop
  // too); the glow is still drawn at the light.
  // Sprite torches keep the test at the light.
  var atFlame = !tiles && typeof renderFeatureOn === 'function' && renderFeatureOn('wallPropModels');
  try {
    for (var i = 0; i < lights.length; i++) {
      var L = lights[i];
      if (!L) continue;
      var dx = L.x - cam.x, dy = L.y - cam.y, d2 = dx * dx + dy * dy, fwd = dx * F.cos + dy * F.sin;
      if (!(d2 <= 160000) || !(fwd >= 5)) continue;
      var sx = Math.floor(((-dx * F.sin + dy * F.cos) / fwd * F.invTanHalf * 0.5 + 0.5) * w);
      var wz = Number.isFinite(L.z) ? L.z : (floorMesh ? getFloorHeightAt(L.x, L.y) * 25 : 0) + 15;
      var sy = Math.floor(F.horizonY + (F.cameraZ - wz) / fwd * ps), R = Math.floor(ps * 0.24 * (sm / fwd));
      R = R < 10 ? 10 : R > cap ? cap : R;
      if (sx + R <= 0 || sx - R >= w || sy + R <= 0 || sy - R >= h) { st.torchCulled++; continue; }
      var d = Math.sqrt(d2);
      if (n === FX_TORCH_GLOWS && d >= _fxTorchD[n - 1]) { st.torchDropped++; continue; }   // 12 nearer glows are drawn
      var iz = 1 / fwd, qx = Math.round(L.x + ox), qy = Math.round(L.y + oy);
      var flicker = 0.95 + 0.03 * Math.sin(now * 0.007 + 6.283185307179586 * effectNoise(qx, qy)) +
        0.02 * Math.sin(now * 0.013 + 6.283185307179586 * effectNoise(qy, qx ^ 0x2545f491));
      var alpha = base * flicker * Math.max(0.2, 1.0 - d / 400), cls = 1;
      if (tiles) { st.tiles++; cls = fxTileClass(sx - R, sy - R, sx + R, sy + R, iz); }
      else {
        st.corona++;
        var csx = sx, csy = sy, ciz = iz, nx = L.nx, ny = L.ny;
        if (atFlame && L.kind === 'torch' && Number.isFinite(nx) && Number.isFinite(ny) && (nx || ny)) {
          var fo = Number.isFinite(L.glowOut) ? L.glowOut : 2, fu = Number.isFinite(L.glowUp) ? L.glowUp : 2;
          var fdx = dx + nx * fo, fdy = dy + ny * fo, ff = fdx * F.cos + fdy * F.sin;
          if (ff >= 1) {
            csx = Math.floor(((-fdx * F.sin + fdy * F.cos) / ff * F.invTanHalf * 0.5 + 0.5) * w);
            csy = Math.floor(F.horizonY + (F.cameraZ - wz - fu) / ff * ps); ciz = 1 / ff;
          }
        }
        var seen = fxCorona(csx, csy, ciz, 0.2 * R); alpha *= seen / 5; cls = seen ? 1 : 0;
      }
      if (!cls || alpha < 0.002) { st.torchHidden++; continue; }
      if (n === FX_TORCH_GLOWS) st.torchDropped++;                                        // the farthest kept one leaves
      for (j = n < FX_TORCH_GLOWS ? n++ : n - 1; j > 0 && _fxTorchD[j - 1] > d; j--) {
        _fxTorchL[j] = _fxTorchL[j - 1]; _fxTorchD[j] = _fxTorchD[j - 1]; _fxTorchX[j] = _fxTorchX[j - 1]; _fxTorchY[j] = _fxTorchY[j - 1];
        _fxTorchR[j] = _fxTorchR[j - 1]; _fxTorchF[j] = _fxTorchF[j - 1]; _fxTorchA[j] = _fxTorchA[j - 1]; _fxTorchC[j] = _fxTorchC[j - 1];
      }
      _fxTorchL[j] = L; _fxTorchD[j] = d; _fxTorchX[j] = sx; _fxTorchY[j] = sy; _fxTorchR[j] = R; _fxTorchF[j] = fwd; _fxTorchA[j] = alpha; _fxTorchC[j] = cls;
    }
    for (k = 0; k < n; k++) {
      L = _fxTorchL[k]; sx = _fxTorchX[k]; sy = _fxTorchY[k]; R = _fxTorchR[k]; alpha = _fxTorchA[k]; cls = _fxTorchC[k]; iz = 1 / _fxTorchF[k];
      if (cls === 2 && F.mixedLeft <= 0) { st.mixedSkipped++; cls = fxDepthPoint(sx, sy, iz, 0); }
      if (!cls) { st.torchHidden++; continue; }
      fxOpen();
      if (_fxBlend !== 1) { ctx.globalCompositeOperation = 'lighter'; _fxBlend = 1; }
      ctx.globalAlpha = alpha > 1 ? 1 : alpha;
      if (cls === 1) { st.torchDrawn++; fxTorchDraw(L, sx, sy, R); continue; }
      F.mixedLeft--;
      var W = _sceneDepthW, H = _sceneDepthH;
      ctx.save();
      try {
        ctx.beginPath();
        if (fxTilePath(Math.max(0, Math.ceil(sx - R - 0.5)), Math.max(0, Math.ceil(sy - R - 0.5)),
          Math.min(W - 1, Math.floor(sx + R - 0.5)), Math.min(H - 1, Math.floor(sy + R - 0.5)), iz)) { ctx.clip(); st.torchDrawn++; fxTorchDraw(L, sx, sy, R); }
        else st.torchHidden++;                                             // its mixed tiles hold no visible pixel
      } finally { ctx.restore(); }
    }
  } finally { for (k = 0; k < FX_TORCH_GLOWS; k++) _fxTorchL[k] = null; }
}
// One torch glow of radius R at (x, y), at the current alpha: the sprite, or
// on a miss its stops as a gradient (the same look, counted).
function fxTorchDraw(L, x, y, R) {
  var r = L.r & 255, g = L.g & 255, b = L.b & 255, spr = fxSprite((r << 16) | (g << 8) | b, 3, fxSpriteBucket(R), 2);
  if (spr) { ctx.drawImage(spr, x - R, y - R, 2 * R, 2 * R); return; }
  _fxStats.spriteFallback++;
  var s = FX_SPRITE_STOPS[2], c = 'rgba(' + r + ',' + g + ',' + b + ',', grad = ctx.createRadialGradient(x, y, 0, x, y, R);
  grad.addColorStop(0, c + s[0] + ')'); grad.addColorStop(s[1], 'rgba(' + r + ',' + Math.floor(g * 0.7) + ',' + Math.floor(b * 0.3) + ',' + s[2] + ')');
  grad.addColorStop(1, c + '0)');
  ctx.fillStyle = grad; ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
}

// ── Stats (merged into getEffectStats) ────────────────────────────────────
function fxRenderStats(out) {
  var s = _fxStats, G = _fxRender;
  out.governor = _fxFrame.g;
  out.governorInput = {ema:G.ema, input:G.input, rasterMs:G.rasterMs};
  out.frame = {considered:s.considered, gated:s.gated, thinned:s.thinned, offscreen:s.offscreen, subpixel:s.subpixel, drawn:s.drawn,
    buckets:s.buckets, bucketsMax:s.bucketsMax, bucketOverflow:s.bucketOverflow,
    occ:{point:s.point, footprint:s.footprint, tiles:s.tiles, corona:s.corona, segment:s.segment, clip:s.clip, grid:s.grid, mixedSkipped:s.mixedSkipped},
    maskPx:s.maskPx, rasterPx:s.rasterPx, glowDraws:s.glowDraws, glowCapped:s.glowCapped, spriteHits:s.spriteHits, spriteBuilds:s.spriteBuilds,
    spriteFallback:s.spriteFallback, sprites:_fxSprites.size, spriteBytes:_fxSpriteBytes,
    torch:{drawn:s.torchDrawn, hidden:s.torchHidden, culled:s.torchCulled, dropped:s.torchDropped, occlusion:fxTorchGlowOcclusion}};
}

// ── In-game control: Settings -> Effects (section 10.2.1). A chip on the
// settings title row opens a page in the same panel; switches apply at once
// and are not saved (the render-feature contract). Canvas only, no DOM.
var FX_SETTINGS_ROWS = ['fxWeather', 'fxDebris', 'fxFootDust', 'fxUnified'];
function fxSettingsChip(x, y, w, h, text, on, font) {
  ctx.fillStyle = on ? '#3a3a5a' : '#2a2a4a'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = on ? '#6688bb' : '#444466'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#e0e0e0'; ctx.font = 'bold ' + font + 'px Arial'; ctx.textAlign = 'center';
  ctx.fillText(text, x + w / 2, y + h * 0.7);
}
// Called by drawSettingsOverlay right after it clears its click areas. On the
// main page: draws the chip and returns false. On the Effects page: draws the
// page in the panel and returns true (the overlay then returns early).
function drawEffectSettingsPage(px, py, panW, panH, S) {
  var open = false;
  ctx.save();
  try {
    var pad = 12 * S, leftX = px + pad, rightX = px + panW - pad, curY = py + 8 * S;
    var fontTitle = Math.max(9, Math.floor(14 * S)), fontLabel = Math.max(7, Math.floor(10 * S)), fontSmall = Math.max(6, Math.floor(8 * S));
    if (!_fxRender.page) {
      var cw = 52 * S, ch = 14 * S;
      fxSettingsChip(rightX - cw, curY, cw, ch, 'Effects ›', false, fontSmall);
      _settingsClickAreas.push({x:rightX - cw, y:curY, w:cw, h:ch, action:'fx', key:'page', value:1});
      return false;
    }
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold ' + fontTitle + 'px Arial'; ctx.textAlign = 'center';
    ctx.fillText('Effects', px + panW / 2, curY + fontTitle);
    curY += fontTitle + 10 * S;
    ctx.strokeStyle = '#333355'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(leftX, curY); ctx.lineTo(rightX, curY); ctx.stroke();
    curY += 6 * S;
    var rowH = 18 * S, valW = 60 * S;
    for (var k = 0; k < FX_SETTINGS_ROWS.length; k++) {
      var def = _effectToggleIndex[FX_SETTINGS_ROWS[k]], v = effectToggleValue(def.key);
      var rowY = curY;
      ctx.fillStyle = '#e0e0e0'; ctx.font = fontLabel + 'px Arial'; ctx.textAlign = 'left';
      ctx.fillText(def.label, leftX, rowY + rowH * 0.68);
      fxSettingsChip(rightX - valW, rowY + 2 * S, valW, rowH - 4 * S, def.type === 'bool' ? (v ? 'On' : 'Off') : String(v),
        def.type === 'bool' ? v === true : v !== def.legacy, fontSmall);
      _settingsClickAreas.push({x:leftX, y:rowY, w:rightX - leftX, h:rowH, action:'fx', key:def.key});
      curY = rowY + rowH + 4 * S;
    }
    ctx.fillStyle = '#778899'; ctx.font = fontSmall + 'px Arial'; ctx.textAlign = 'left';
    ctx.fillText('Applies now · not saved', leftX, curY + fontSmall);
    var bw = Math.floor(60 * S), bh = Math.floor(18 * S), bx = px + panW - pad - bw, by = py + panH - pad - bh;
    fxSettingsChip(bx, by, bw, bh, '‹ Back', false, fontSmall);
    _settingsClickAreas.push({x:bx, y:by, w:bw, h:bh, action:'fx', key:'page', value:0});
    ctx.font = fontSmall + 'px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#778899';
    ctx.fillText('[O] or [ESC] to close', px + panW / 2, py + panH - 4 * S);
    open = true;
  } catch (e) { effectFailure('settings', e); } finally { ctx.restore(); }
  return open;
}
// handleSettingsClick forwards action 'fx' here: page chips switch the view,
// rows flip a bool or cycle an enum through setEffectToggle.
function handleEffectSettingsClick(a) {
  try {
    if (a.key === 'page') { _fxRender.page = a.value; return true; }
    var def = _effectToggleIndex[a.key], v = effectToggleValue(a.key);
    if (!def) return false;
    setEffectToggle(a.key, def.type === 'bool' ? !v : def.values[(def.values.indexOf(v) + 1) % def.values.length]);
  } catch (e) { effectFailure('settings', e); }
  return true;
}
