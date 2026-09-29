// Render lab: culling, early reject and counters (integration stage K).
// Developer page only.
//   courtyard(seed)   starts Endless `seed` (default 259) and stands the
//                     camera in its fortress courtyard: the open cell nearest
//                     0.45 of the curtain extent south of the fortress centre
//                     (between the keep and the curtain wall), facing the keep
//   counts(label)     one frozen frame per configuration (off, on) and the
//                     per-family counters: clip<Family> (depth-clip calls
//                     inside scatter, wall decorations, ore, chests and
//                     spawners), terr<Family>/hit<Family> (anchor-cache
//                     terrain queries and hits; only while decorAnchorCache
//                     is on) and mdl<Family>Faces/Drawn/Rejected
//   timeView()        A/B/B/A with both switches off (A) and on (B), fresh
//                     tab only; the summary prints the counters per frame
// The switches are restored after counts().
var RenderLabCulling = (function () {
  var CONFIGS = {
    off: {preset: 'recommended', features: {modelEarlyReject: false, decorAnchorCache: false}},
    on: {preset: 'recommended', features: {modelEarlyReject: true, decorAnchorCache: true}}
  };
  var KEYS = /^(clip|terr|hit)[A-Z]|^mdl\w+(Faces|Drawn|Rejected)$/;
  function courtyard(seed) {
    seed = seed || 259;
    RenderLab.startEndless(seed);
    var st = largeStructures.filter(function (s) {
      return s.type === 'fortress' && s.x > 0 && s.y > 0 && s.x < gridW * cell && s.y < gridH * cell;
    })[0];
    if (!st) return RenderLab.write('FAIL seed ' + seed + ' has no fortress inside its window; try 259, 204 or 162.');
    var extent = CHUNK_SIZE * 1.7 * st.scale, tx = st.x, ty = st.y + extent * 0.45, best = null;
    var gx0 = Math.floor(tx / cell), gy0 = Math.floor(ty / cell);
    for (var gy = gy0 - 12; gy <= gy0 + 12; gy++) for (var gx = gx0 - 12; gx <= gx0 + 12; gx++) {
      if (gx < 3 || gy < 3 || gx >= gridW - 3 || gy >= gridH - 3 || getTopWalkableLayerIdx(gx, gy) < 0) continue;
      var open = true;
      for (var oy = -1; oy <= 1 && open; oy++) for (var ox = -1; ox <= 1; ox++) if (grid[(gy + oy) * gridW + gx + ox]) { open = false; break; }
      var d = Math.hypot(gx - gx0, gy - gy0);
      if (open && (!best || d < best.d)) best = {x: (gx + 0.5) * cell, y: (gy + 0.5) * cell, d: d};
    }
    if (!best) return RenderLab.write('FAIL no open courtyard cell near the fortress of seed ' + seed + '.');
    RenderLab.place(best.x, best.y, Math.atan2(st.y - best.y, st.x - best.x));
    RenderLab.freeze(4242); try { renderFrame(); } finally { RenderLab.unfreeze(); }
    return RenderLab.write('Fortress courtyard, seed ' + seed + ': camera ' + Math.round(Math.hypot(best.x - st.x, best.y - st.y)) +
      ' u south of the fortress centre, facing the keep. Turn to taste, then time A/B/B/A in a fresh tab.');
  }
  function frozenCount(config) {
    RenderLab.freeze(4242);
    try { RenderLab.applyConfig(config); renderFrame(); } finally { RenderLab.unfreeze(); }
    var frame = getRenderFeatureStats().frame, out = {};
    Object.keys(frame).sort().forEach(function (k) { if (KEYS.test(k) && frame[k]) out[k] = frame[k]; });
    return out;
  }
  function counts(label) {
    var snap = renderFeatureSnapshot(), preset = renderPresetName(), off, on;
    try {
      off = frozenCount(CONFIGS.off); on = frozenCount(CONFIGS.on);
    } finally {
      if (preset === 'legacy' || preset === 'recommended') applyRenderPreset(preset);
      setRenderFeatures(snap);
    }
    function line(o) { return Object.keys(o).map(function (k) { return k + '=' + o[k]; }).join(' '); }
    var text = (label || 'view') + ':\n  off: ' + line(off) + '\n  on:  ' + line(on);
    RenderLab.write(text);
    return {off: off, on: on, text: text};
  }
  function timeView(options, done) { RenderLab.abba(CONFIGS.off, CONFIGS.on, options || {}, done); }
  return {CONFIGS: CONFIGS, courtyard: courtyard, counts: counts, timeView: timeView};
}());

(function () {
  var box = document.getElementById('renderLab'), pre = document.getElementById('renderLabResult');
  if (!box || !pre || !document.createElement || typeof box.insertBefore !== 'function') return;
  var row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px';
  function button(text, fn) {
    var b = document.createElement('button');
    b.className = 'btn'; b.textContent = text;
    b.addEventListener('click', function () { try { fn(); } catch (e) { RenderLab.write('FAIL ' + (e && e.message || e)); } });
    row.appendChild(b);
  }
  button('Culling: fortress courtyard (seed 259)', function () { RenderLabCulling.courtyard(259); });
  button('Culling: counters off/on', function () { RenderLabCulling.counts('this view'); });
  button('Culling: time A/B/B/A (fresh tab)', function () { RenderLabCulling.timeView(); });
  box.insertBefore(row, pre);
}());
