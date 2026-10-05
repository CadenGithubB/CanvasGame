// renderEntities3D capacity through the real MAIN manifest (render_host.js).
// Risk: the shared visibility/sort buffers held 512 entries and the loop
// stopped at the 512th visible entity ("safety cap"), in array order rather
// than by distance, and said nothing. Endless floor scatter at the Ultra
// preset (1800 u view, 9x9 window) puts up to ~700 sprites in view: at seed
// 899731 looking 90 deg, 47 of 559 in-view sprites never reached the depth
// test and 196 were drawn instead of 225 (floor-prop models off, looking
// 67.5 deg: 98 of 610, 191 drawn instead of 260). The buffers now double on
// demand; indices are Uint32.
// Oracles, independent of renderEntities3D:
//   authored  plain entities placed in front of / behind the camera within
//             range: exactly the front ones are drawn, each once, farthest
//             first; entities past index 65,535 are drawn as themselves;
//   prefilter the stage K floor-scatter prefilter (floorScatterInView, and
//             floorScatterSprites with floor-prop models on), which keeps
//             exactly the items entityVisible3D keeps by distance and
//             forward: every one of them must reach the depth-tested draw
//             (the scatter's bounds callback), each once, farthest first.
// Allocation: the index and distance buffers grow by doubling only (sampled
// at every entityVisible3D call of the first 2,000-entity call) and, once
// grown, later frames and calls that fit keep the same buffer objects.
// Commands and callbacks, not browser pixels or timing.
// Checks print PASS/FAIL and keep going, so a mutation names what it broke.
// Mutations (evaluated copies only; each anchor must match exactly once):
//   --cap-512        the fixed 512-entry cap (break at the 512th visible)
//   --uint16-index   Uint16 entity indices (wrap past 65,535)
//   --grow-no-copy   growth that does not copy the entries already kept
//   --shrink-each-call  every call starts from new 512-entry buffers
//   --grow-by-one    growth by one entry instead of doubling
(function () {
  (0, eval)(slurp('tools/game/tests/render_host.js'));
  var H = createRenderTestHost(), G = H.G, out = H.output, checked = 0, failed = 0;
  function check(name, ok, detail) {
    checked++; if (!ok) failed++;
    out((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + JSON.stringify(detail === undefined ? null : detail).slice(0, 2000)));
  }
  function flag(name) { return __argv.indexOf(name) >= 0; }
  function swap(source, name, before, after) {
    if (!flag(name)) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + name);
    return source.replace(before, after);
  }
  var loaded = H.loadManifest(function (path, source) {
    if (path !== 'src/01-config-state.js') return source;
    source = swap(source, '--cap-512', '    if (count === _reIdxBuf.length) growRenderEntityBuffers();\n',
      '    if (count >= 512) break; // safety cap\n');
    source = swap(source, '--uint16-index', 'var _reIdxBuf  = new Uint32Array(512);', 'var _reIdxBuf  = new Uint16Array(512);');
    source = swap(source, '--uint16-index', 'idx = new Uint32Array(n)', 'idx = new Uint16Array(n)');
    source = swap(source, '--shrink-each-call', '  var count = 0;\n',
      '  var count = 0; _reIdxBuf = new Uint32Array(512); _reDistBuf = new Float32Array(512);\n');
    source = swap(source, '--grow-by-one', '  var n = _reIdxBuf.length * 2,', '  var n = _reIdxBuf.length + 1,');
    return swap(source, '--grow-no-copy', '  idx.set(_reIdxBuf); dist.set(_reDistBuf);\n', '');
  });
  check('real manifest loads with no console errors',
    loaded > 40 && typeof G.renderEntities3D === 'function' && typeof G.floorScatterInView === 'function' && H.errors.length === 0,
    {loaded: loaded, errors: H.errors.slice(0, 3)});

  // ── Endless at the Ultra preset ──
  var SEED = 899731;
  function startUltra(seed) {
    G.settings.viewDist = 1800; G.settings.chunkWindow = 9;
    G.pendingSettings.viewDist = 1800; G.pendingSettings.chunkWindow = 9; G.WINDOW_CHUNKS = 9;
    H.startEndless(seed);
  }
  startUltra(SEED);
  G.setRenderFeature('floorPropModels', true);
  check('setup: Endless seed 899731 at the Ultra preset (1800 u view, 9x9 window), floor-prop models on (default)',
    G.WORLD_SEED === SEED && G.viewDist === 1800 && G.WINDOW_CHUNKS === 9 && G.floorPropModelsOn() && G.floorScatter.length > 2000,
    {seed: G.WORLD_SEED, viewDist: G.viewDist, window: G.WINDOW_CHUNKS, models: G.floorPropModelsOn(), scatter: G.floorScatter.length});

  // ── Real floor scatter: the prefilter's items vs what reaches the draw ──
  var art = G.drawFloorArtwork, drawn = 0;
  G.drawFloorArtwork = function () { drawn++; return art.apply(this, arguments); };
  var shippedRE = G.renderEntities3D;
  function scatterFrame(f) {
    G.setRenderFeature('floorPropModels', f.models);
    G.pos.x = f.x; G.pos.y = f.y; if (G.vel) { G.vel.x = 0; G.vel.y = 0; }
    G.settlePlayerAtSpawn(true);
    G.cam.ang = f.ang; G.cam.pitch = G.pos.pitch = f.pitch;
    var list = G.floorScatterInView(G.viewDist * 0.75);
    var inView = (f.models ? G.floorScatterSprites(list) : list).map(function (a) { return a._scatterItem || a; });
    var nearest = Infinity;
    inView.forEach(function (it) { nearest = Math.min(nearest, Math.hypot(it.x - G.cam.x, it.y - G.cam.y)); });
    var reached = [], dists = [], logged = H.errors.length;
    G.renderEntities3D = function (arr, opts, fn) {
      if (typeof opts.bounds !== 'function' || opts.fadeFraction !== 0.3 || !opts.groundAnchor) return shippedRE.apply(this, arguments);
      var bounds = opts.bounds, wrapped = Object.assign({}, opts);
      wrapped.bounds = function (item, vis) {
        reached.push(item._scatterItem || item); dists.push(Math.fround(vis.dist));
        return bounds.apply(this, arguments);
      };
      return shippedRE.call(this, arr, wrapped, fn);
    };
    drawn = 0;
    try { G.renderFrame(); } finally { G.renderEntities3D = shippedRE; }
    var expect = new Map(), dup = 0, stray = 0, order = true;
    inView.forEach(function (it) { expect.set(it, 0); });
    reached.forEach(function (it) {
      if (!expect.has(it)) { stray++; return; }
      if (expect.get(it)) dup++;
      expect.set(it, expect.get(it) + 1);
    });
    var missing = [];
    expect.forEach(function (n, it) { if (!n) missing.push(Math.round(Math.hypot(it.x - G.cam.x, it.y - G.cam.y))); });
    for (var i = 1; i < dists.length; i++) if (dists[i] > dists[i - 1]) { order = false; break; }
    missing.sort(function (a, b) { return a - b; });
    G.setRenderFeature('floorPropModels', true);
    return {name: f.name, inView: inView.length, reached: reached.length, missing: missing.length, nearestMissing: missing[0] || null,
      duplicates: dup, stray: stray, farthestFirst: order, drawnSprites: drawn, nearest: Math.round(nearest * 10) / 10,
      inWall: G.isInGridWall(f.x, f.y, 8), errors: H.errors.slice(logged, logged + 2)};
  }
  var DEFAULT = {name: 'default features, heading 90 deg', x: 2520, y: 3000, ang: Math.PI / 2, pitch: 0.3, models: true};
  var LEGACY = {name: 'floor-prop models off, heading 67.5 deg', x: 2520, y: 3000, ang: 3 * Math.PI / 8, pitch: 0.3, models: false};
  var rd = scatterFrame(DEFAULT), rl = scatterFrame(LEGACY);
  check('setup: both floor-scatter fixtures put more than 512 sprites in view (stage K prefilter), none nearer than 3 u, ' +
    'outside walls, with no console error',
    [rd, rl].every(function (r) { return r.inView > 512 && r.nearest >= 3 && !r.inWall && !r.errors.length; }),
    [rd, rl].map(function (r) { return {name: r.name, inView: r.inView, nearest: r.nearest, inWall: r.inWall, errors: r.errors}; }));
  function reachedAll(r) { return r.reached === r.inView && !r.missing && !r.duplicates && !r.stray && r.farthestFirst; }
  check('Endless Ultra: every in-view floor-scatter sprite reaches the depth-tested draw once, farthest first (default features)',
    reachedAll(rd), rd);
  check('Endless Ultra: every in-view floor-scatter sprite reaches the depth-tested draw once, farthest first (floor-prop models off)',
    reachedAll(rl), rl);

  // ── Authored entities: exact expectations from placement ──
  var C0 = {x: 2000, y: 2000};
  function aim() {
    G.cam.x = C0.x; G.cam.y = C0.y; G.cam.ang = 0; G.cam.pitch = 0; G.MODE3D = true;
  }
  function draw(arr) {
    var got = [], dist = [];
    G.renderEntities3D(arr, {maxDist: 1500, sceneDepth: true, sort: true}, function (e, vis) { got.push(e); dist.push(Math.fround(vis.dist)); });
    return {got: got, dist: dist};
  }
  aim();
  // 2,000 in front (fwd 5..1404 u, small lateral offsets) and 2,000 behind,
  // shuffled so the far-to-near sort has work to do.
  var front = [], arr = [];
  for (var k = 0; k < 2000; k++) {
    var lateral = ((k * 37) % 21) - 10;
    front.push({x: C0.x + 5 + k * 0.7, y: C0.y + lateral, z: 0, id: 'f' + k});
    arr.push(front[k], {x: C0.x - 5 - k * 0.7, y: C0.y + lateral, z: 0, id: 'b' + k});
  }
  for (var s = arr.length - 1, seed = 12345; s > 0; s--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    var j = seed % (s + 1), t = arr[s]; arr[s] = arr[j]; arr[j] = t;
  }
  // The index and distance buffers one call's visibility pass (where they
  // grow) works with, in order: sampled at every entityVisible3D call, from
  // the first, and once after the call; a new pair is recorded on change.
  function buffersDuring(fn) {
    var vis = G.entityVisible3D, seq = [], calls = 0;
    function sample() {
      var last = seq[seq.length - 1];
      if (!last || last.idx !== G._reIdxBuf || last.dist !== G._reDistBuf) seq.push({idx: G._reIdxBuf, dist: G._reDistBuf});
    }
    G.entityVisible3D = function () { calls++; sample(); return vis.apply(this, arguments); };
    var result;
    try { result = fn(); } finally { G.entityVisible3D = vis; }
    if (seq.length) sample();
    return {result: result, seq: seq, visCalls: calls};
  }
  var traced1 = buffersDuring(function () { return draw(arr); });
  var a1 = traced1.result, seen = new Set(), behind = 0, dupes = 0, ordered = true;
  a1.got.forEach(function (e) { if (e.id[0] === 'b') behind++; if (seen.has(e)) dupes++; seen.add(e); });
  for (var q = 1; q < a1.dist.length; q++) if (a1.dist[q] > a1.dist[q - 1]) { ordered = false; break; }
  var missingFront = front.filter(function (e) { return !seen.has(e); }).length;
  check('authored: of 2,000 entities in front and 2,000 behind, exactly the front ones are drawn, each once, farthest first',
    a1.got.length === 2000 && !missingFront && !behind && !dupes && ordered,
    {drawn: a1.got.length, missingFront: missingFront, behindDrawn: behind, duplicates: dupes, farthestFirst: ordered});
  // 70,000 entities; only the last 10 (indices 69,990..69,999) are in front.
  var big = [], last = [];
  for (var b = 0; b < 70000; b++) {
    var e = b >= 69990 ? {x: C0.x + 50 + (b - 69990) * 10, y: C0.y, z: 0, id: 'L' + b} : {x: C0.x - 50, y: C0.y + (b % 100), z: 0, id: 'B' + b};
    big.push(e); if (b >= 69990) last.push(e);
  }
  var a2 = draw(big);
  var exact = a2.got.length === 10 && last.every(function (e) { return a2.got.indexOf(e) >= 0; });
  check('authored: entities past index 65,535 are drawn as themselves',
    exact, {drawn: a2.got.length, ids: a2.got.slice(0, 12).map(function (e) { return e.id; })});

  // ── Growth doubles ──
  // The first 2,000-entity call keeps more than the buffers hold. From the
  // capacity its visibility pass starts with, each replacement must double
  // both buffers, ending with room for 2,000: ceil(log2(2000 / start))
  // replacements, not one per extra entity. (The authored check above covers
  // the copy of the entries already kept.)
  var grow = traced1.seq.map(function (b) { return {idx: b.idx.length, dist: b.dist.length}; });
  var doubled = grow.length > 0 && grow.every(function (b, i) {
    return b.idx === b.dist && (i === 0 || b.idx === 2 * grow[i - 1].idx);
  });
  var startCap = grow.length ? grow[0].idx : 0, finalCap = grow.length ? grow[grow.length - 1].idx : 0;
  var wantSteps = startCap ? Math.max(0, Math.ceil(Math.log2(2000 / startCap))) : null;
  check('growth doubles: the first 2,000-entity call replaces the index and distance buffers only by doubling, ' +
    'ending with room for 2,000',
    doubled && startCap < 2000 && finalCap >= 2000 && grow.length - 1 === wantSteps,
    {capacities: grow.slice(0, 8).map(function (b) { return b.idx + '/' + b.dist; }), replacements: grow.length - 1,
      expectedReplacements: wantSteps, startCapacity: startCap, finalCapacity: finalCap, visibilityCalls: traced1.visCalls});

  // ── Reuse: grown buffers are kept across calls and frames ──
  // Once grown, the buffers serve every later call that fits: three more
  // Endless Ultra scatter frames (each with more than 512 sprites in view, so
  // a reset to the 512-entry start would have to regrow) and a second
  // 2,000-entity call keep the same index and distance buffers.
  var idxKept = G._reIdxBuf, distKept = G._reDistBuf, again = [];
  [DEFAULT, LEGACY, DEFAULT].forEach(function (f) {
    var r = scatterFrame(f);
    again.push({name: r.name, inView: r.inView, reached: r.reached, sameIdx: G._reIdxBuf === idxKept, sameDist: G._reDistBuf === distKept});
  });
  aim();
  var a3 = draw(arr);
  again.push({name: 'second 2,000-entity call', drawn: a3.got.length, sameIdx: G._reIdxBuf === idxKept, sameDist: G._reDistBuf === distKept});
  check('grown buffers are reused: 3 more Endless Ultra frames and a second 2,000-entity call keep the same index and ' +
    'distance buffers',
    again.every(function (a) { return a.sameIdx && a.sameDist && (a.reached > 0 || a.drawn > 0); }) &&
      again.slice(0, 3).every(function (a) { return a.inView > 512; }),
    {entries: idxKept.length, calls: again});

  out('NOTE ' + JSON.stringify({bufferEntries: G._reIdxBuf.length, indexType: Object.prototype.toString.call(G._reIdxBuf),
    growth: {replacements: grow.length - 1, capacities: grow.slice(0, 6).map(function (b) { return b.idx; })},
    scatter: [rd, rl].map(function (r) { return [r.name, 'in view ' + r.inView, 'reached ' + r.reached, 'sprites drawn ' + r.drawnSprites]; })}));
  out('RENDER_ENTITIES_CAPACITY_RESULT ' + (failed ? 'FAIL ' + failed : 'PASS ' + checked));
}());
