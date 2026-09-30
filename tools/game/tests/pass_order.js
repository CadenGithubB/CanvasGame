// Opaque-first pass order (integration stage G2): draw()'s landmarkOpaque3D
// stage (landmarkOpaqueEarly) and sceneEntities' opaque-then-overlay phases,
// with the water system's water3D stage between those phases (merge of
// codex/water-system: water is translucent and writes no depth),
// through one real renderFrame() of the MAIN manifest (render_host.js) on an
// authored flat world. Every scene is a nearer thing in front of a farther
// opaque part: a treasure chest (model), an enemy-style billboard (a solid
// rectangle drawn by the enemies3D stage through withSceneDepthBillboard at
// its anchor depth, as drawEnemies3D does) and a shrine in front of a ruin's
// waypost; a billboard in front of a fortress gate lintel (legacy shell); a
// chest in front of a modelled wall torch. The oracle is the recorded command
// stream interpreted per pixel (the paint log below, copied from
// structure_model_draw.js): a farther part "overpaints" a nearer pixel when it
// fills that pixel after the nearer thing did. Depth order is authored (the
// positions are written here, camera-forward distances noted per scene).
// Headless commands and scene depth, not browser pixels or timing.
// Checks print PASS/FAIL and keep going, so a mutation names what it broke.
// Mutations (evaluated copies only; each anchor must match exactly once):
//   --late-landmarks    draw() loses its landmarkOpaque3D stage: the ruin and
//                       structure opaque parts draw in the late stages again
//   --family-order      sceneEntities calls each family with no argument
//                       (both phases per family, the pre-G2 order)
//   --overlay-unclipped the structures3D overlays are never depth-clipped
//   --water-before-props water3D runs before sceneEntities' opaque phase (the
//                       water branch's slot, after walls, before every prop)
//   --water-after-props water3D runs after sceneEntities' overlay phase
//   --timer-per-call    _pt counts every call again, so the Perf HUD shows
//                       sceneEntities' two halves as two calls a frame
// --sections a,b runs only: ruin, lintel, entities, overlays, calls, legacy,
// water, timer, lab (render-lab/50-pass-order.js on Endless 2024).
(function () {
  (0, eval)(slurp('tools/game/tests/render_host.js'));
  var H = createRenderTestHost(), G = H.G, out = H.output, checked = 0, failed = 0;
  function check(name, ok, detail) {
    checked++; if (!ok) failed++;
    out((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + JSON.stringify(detail === undefined ? null : detail)));
  }
  function flag(name) { return __argv.indexOf(name) >= 0; }
  var sectionArg = __argv.indexOf('--sections') >= 0 ? __argv[__argv.indexOf('--sections') + 1].split(',') : null;
  function section(name) { return !sectionArg || sectionArg.indexOf(name) >= 0; }
  function swap(source, name, before, after) {
    if (!flag(name)) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + name);
    return source.replace(before, after);
  }
  var DRAW = 'src/16-draw-overview.js', HUD = 'src/15-render-hud-menu.js', DIAG = 'src/20-diagnostics.js';
  var LANDMARK_STAGE = "    if (typeof landmarkOpaqueEarlyOn === 'function' && landmarkOpaqueEarlyOn())\n" +
    "      _pt('landmarkOpaque3D', function(){ drawLandmarkOpaque3D(); });\n";
  var FAMILIES = ['drawFloorScatter3D', 'drawTreasureChests3D', 'drawEnemySpawners3D', 'drawOreVeins', 'drawWallDecorations'];
  // sceneEntities runs in two halves around water3D (one timer name): the
  // opaque phase, then water, then the overlay phase.
  var OPAQUE_PHASE = FAMILIES.map(function (f) { return "      " + f + "('opaque');\n"; }).join('');
  var OVERLAY_PHASE = FAMILIES.map(function (f) { return "      " + f + "('overlay');\n"; }).join('');
  var FAMILY_ORDER = FAMILIES.map(function (f) { return "      " + f + "();\n"; }).join('');
  var SCENE_OPEN = "    _pt('sceneEntities', function(){\n";
  var WATER_STAGE = "    _pt('water3D', function(){ if (typeof drawWater3D === 'function') drawWater3D(); });\n";
  var GOAL_STAGE = "    _pt('goalMarker3D', function(){ drawGoalMarker3D(); });\n";
  var loaded = H.loadManifest(function (path, source) {
    if (path === DRAW) {
      source = swap(source, '--late-landmarks', LANDMARK_STAGE, '');
      // Each family draws both phases in the first half (the pre-G2 order).
      source = swap(source, '--family-order', OPAQUE_PHASE, FAMILY_ORDER);
      source = swap(source, '--family-order', OVERLAY_PHASE, '');
      source = swap(source, '--water-before-props', WATER_STAGE, '');
      source = swap(source, '--water-before-props', SCENE_OPEN + OPAQUE_PHASE, WATER_STAGE + SCENE_OPEN + OPAQUE_PHASE);
      source = swap(source, '--water-after-props', WATER_STAGE, '');
      source = swap(source, '--water-after-props', GOAL_STAGE, WATER_STAGE + GOAL_STAGE);
    }
    if (path === HUD) source = swap(source, '--overlay-unclipped', '  if (!clip) { draw(); return 1; }\n', '  { draw(); return 1; }\n');
    if (path === DIAG) source = swap(source, '--timer-per-call', '  var sameFrame = bd.slot === _perfRingIdx && arr[_perfRingIdx] === bd.mark;\n', '  var sameFrame = false;\n');
    return source;
  });
  check('real manifest loads with the landmark pass and no console errors',
    loaded > 40 && typeof G.drawLandmarkOpaque3D === 'function' && typeof G.landmarkLatePhase === 'function' && H.errors.length === 0,
    {loaded: loaded, errors: H.errors.slice(0, 3)});

  // The water section's lake: the real drawWater3D (13-render-water.js) reads
  // the global floorMesh, which the authored world leaves null (no terrain
  // depth); while waterMesh is set it runs with that mesh, and only it.
  var waterMesh = null, realWater = G.drawWater3D;
  G.drawWater3D = function () {
    if (!waterMesh) return realWater.apply(this, arguments);
    var savedMesh = G.floorMesh;
    G.floorMesh = waterMesh;
    try { return realWater.apply(this, arguments); } finally { G.floorMesh = savedMesh; }
  };
  // ── Stage tags: each family marks its span (and phase) in the stream ──
  var TAGS = {drawRuins3D: 'ruin', drawStructures3D: 'structure', drawShrines3D: 'shrine',
    drawTreasureChests3D: 'chest', drawWallDecorations: 'wall', drawEnemySpawners3D: 'spawner',
    drawFloorScatter3D: 'scatter', drawOreVeins: 'ore', drawWater3D: 'water'};
  var calls = [], curStage = '', beforeLate = {};
  Object.keys(TAGS).forEach(function (name) {
    var real = G[name];
    G[name] = function () {
      var tag = TAGS[name] + ':' + (arguments.length ? String(arguments[0]) : 'late');
      calls.push(tag);
      if (!arguments.length && beforeLate[name]) beforeLate[name]();
      G.ctx.__stage(tag); curStage = tag;
      try { return real.apply(this, arguments); } finally { G.ctx.__stage(''); curStage = ''; }
    };
  });
  // Visible-pixel masks: while `masks` is an array, every withSceneDepthClip
  // callback first records the pixels that passed its depth test, the stage
  // and whether it writes depth (an opaque face) or not (a billboard).
  var masks = null, realClip = G.withSceneDepthClip;
  G.withSceneDepthClip = function (points, drawCallback, options) {
    if (!masks || typeof drawCallback !== 'function') return realClip.apply(this, arguments);
    var stage = curStage;
    return realClip.call(this, points, function () {
      var gen = G._sceneDepthClipGeneration, marks = G._sceneDepthClipMarks, list = [], w = G.canvas.width;
      for (var y = G._sceneDepthClipMinY; y <= G._sceneDepthClipMaxY; y++)
        for (var x = G._sceneDepthClipMinX; x <= G._sceneDepthClipMaxX; x++) if (marks[y * w + x] === gen) list.push(y * w + x);
      masks.push({stage: stage, opaque: !!(options && options.writeDepth), px: list});
      return drawCallback.apply(this, arguments);
    }, options);
  };
  // The enemy-style billboard: the enemies3D stage draws each authored
  // billboard as a solid rectangle from its anchor up, depth-tested at the
  // anchor's forward depth like drawEnemies3D's sprites.
  var bills = [], realEnemies = G.drawEnemies3D;
  G.drawEnemies3D = function () {
    G.ctx.__stage('enemy');
    try {
      var C = G.getCam3D();
      bills.forEach(function (b) {
        var base = G.projToScreen(b.x, b.y, b.z, C), top = G.projToScreen(b.x, b.y, b.z + b.h, C);
        if (!base || !top) return;
        var half = b.w * 0.5 * C.invTanHalf * 0.5 * C.w / base.fwd;
        var r = {x: base.sx - half, y: top.sy, width: half * 2, height: base.sy - top.sy};
        G.ctx.fillStyle = '#ff00ff'; G.ctx.globalAlpha = 1;
        G.withSceneDepthBillboard(r, base.fwd, function () { G.ctx.fillRect(r.x, r.y, r.width, r.height); });
      });
    } finally { G.ctx.__stage(''); }
  };

  // ── Paint log (structure_model_draw.js): one recorded stream per pixel ──
  // visit(event, pixelIndex) runs for every pixel a fill paints, in order.
  // Pixel-centre rules: rect [x, x+w), arc disk, polygon even-odd; the clip
  // is the path's pixel set.
  function paintLog(entries, visit) {
    var W = G.canvas.width, Hh = G.canvas.height, stamp = new Int32Array(W * Hh), gen = 0, ctxId = null;
    var path = [], stack = [], alpha = 1, fill = '', clip = null, stage = '', events = 0, unknown = 0, cur = null;
    function num(list) { return list.map(Number); }
    function eachPathPixel(fn) {
      gen++;
      function hit(px, py) {
        var i = py * W + px;
        if (stamp[i] === gen || (clip && !clip[i])) return;
        stamp[i] = gen; fn(i);
      }
      path.forEach(function (el) {
        var x0, x1, y0, y1, px, py;
        if (el.t === 'rect') {
          x0 = Math.max(0, Math.ceil(el.x - 0.5)); x1 = Math.min(W - 1, Math.ceil(el.x + el.w - 0.5) - 1);
          y0 = Math.max(0, Math.ceil(el.y - 0.5)); y1 = Math.min(Hh - 1, Math.ceil(el.y + el.h - 0.5) - 1);
          for (py = y0; py <= y1; py++) for (px = x0; px <= x1; px++) hit(px, py);
        } else if (el.t === 'arc') {
          x0 = Math.max(0, Math.floor(el.x - el.r)); x1 = Math.min(W - 1, Math.ceil(el.x + el.r));
          y0 = Math.max(0, Math.floor(el.y - el.r)); y1 = Math.min(Hh - 1, Math.ceil(el.y + el.r));
          for (py = y0; py <= y1; py++) for (px = x0; px <= x1; px++) {
            var dx = px + 0.5 - el.x, dy = py + 0.5 - el.y;
            if (dx * dx + dy * dy <= el.r * el.r) hit(px, py);
          }
        } else if (el.t === 'poly' && el.pts.length >= 3) {
          var pts = el.pts, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          pts.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
          x0 = Math.max(0, Math.floor(minX)); x1 = Math.min(W - 1, Math.ceil(maxX));
          y0 = Math.max(0, Math.floor(minY)); y1 = Math.min(Hh - 1, Math.ceil(maxY));
          for (py = y0; py <= y1; py++) for (px = x0; px <= x1; px++) {
            var cx = px + 0.5, cy = py + 0.5, inside = false;
            for (var a = 0, b = pts.length - 1; a < pts.length; b = a++) {
              if ((pts[a][1] > cy) !== (pts[b][1] > cy) &&
                  cx < (pts[b][0] - pts[a][0]) * (cy - pts[a][1]) / (pts[b][1] - pts[a][1]) + pts[a][0]) inside = !inside;
            }
            if (inside) hit(px, py);
          }
        } else if (el.t === 'other') unknown++;
      });
    }
    entries.forEach(function (text) {
      var m = /^(c\d+)\.([A-Za-z_]\w*)(?:\((.*)\)|=(.*))$/.exec(text);
      if (!m) return;
      if (m[2] === '__stage' && ctxId === null) ctxId = m[1];
      if (m[1] !== ctxId) return;
      var name = m[2], args = m[3] !== undefined ? (m[3] === '' ? [] : m[3].split(',')) : null;
      if (m[4] !== undefined) {
        if (name === 'globalAlpha') alpha = Number(m[4]);
        else if (name === 'fillStyle') fill = m[4];
        return;
      }
      switch (name) {
        case '__stage': stage = JSON.parse(m[3]); break;
        case 'beginPath': path = []; cur = null; break;
        case 'rect': var r = num(args); path.push({t: 'rect', x: r[0], y: r[1], w: r[2], h: r[3]}); cur = null; break;
        case 'arc': var c = num(args); path.push(Math.abs(c[4] - c[3]) >= 6.28 ? {t: 'arc', x: c[0], y: c[1], r: c[2]} : {t: 'other'}); cur = null; break;
        case 'moveTo': cur = {t: 'poly', pts: [num(args)]}; path.push(cur); break;
        case 'lineTo': if (!cur) { cur = {t: 'poly', pts: []}; path.push(cur); } cur.pts.push(num(args)); break;
        case 'closePath': break;
        case 'ellipse': case 'quadraticCurveTo': case 'bezierCurveTo': case 'arcTo': case 'roundRect': path.push({t: 'other'}); break;
        case 'save': stack.push({alpha: alpha, clip: clip, fill: fill}); break;
        case 'restore': if (stack.length) { var s = stack.pop(); alpha = s.alpha; clip = s.clip; fill = s.fill; } break;
        case 'clip':
          var mask = new Uint8Array(W * Hh);
          eachPathPixel(function (i) { mask[i] = 1; });
          clip = mask; break;
        case 'fill':
          var ev = {id: ++events, stage: stage, alpha: alpha, fill: fill, kinds: path.map(function (e) { return e.t; }).join(''),
            shape: path.length === 1 ? path[0] : null};
          eachPathPixel(function (i) { visit(ev, i); });
          break;
        case 'fillRect':
          var saved = path, fr = num(args);
          path = [{t: 'rect', x: fr[0], y: fr[1], w: fr[2], h: fr[3]}];
          var evr = {id: ++events, stage: stage, alpha: alpha, fill: fill, kinds: 'fillRect'};
          eachPathPixel(function (i) { visit(evr, i); });
          path = saved; break;
      }
    });
    return {events: events, unknown: unknown};
  }

  // ── Authored world: flat, empty grid (no terrain depth); camera eye 20 up ──
  // Cells outside the grid count as solid, so every scene keeps its camera
  // and parts inside it (opts.n cells a side, 48 by default).
  var W = 320, HT = 240, WALL_ROW = 24;
  function world(opts) {
    var N = opts.n || 48;
    G.cell = 12; G.gridW = G.gridH = N; G.grid = new Uint8Array(N * N);
    G.wallHeights = new Float32Array(N * N); G.wallHeights.fill(1);
    G.wallMaxTopZ = new Float32Array(N * N); G.wallMaxTopZ.fill(Infinity);
    G.wallFaceBase = new Float32Array(N * N * 4);
    if (opts.wall) for (var x = 0; x < N; x++) G.grid[WALL_ROW * N + x] = 1;
    G.floorMesh = null; G.gridCave = null; G.deepCaveRegions = []; G.deepCaveEntrances = [];
    G.windowOriginX = G.windowOriginY = 0; G.CANVAS_BASE_H = 240; G.viewDist = 1400;
    G.canvas.width = W; G.canvas.height = HT; G.projScale = 180; G.MODE3D = true; G.DEBUG_DECORATIONS = false;
    G.ruins = opts.ruins || []; G.treasureChests = opts.chests || []; G.shrines = opts.shrines || [];
    G.largeStructures = opts.structures || []; G.wallDecorations = opts.decor || [];
    G.floorScatter = opts.scatter || []; G.enemySpawners = opts.spawners || []; G.oreVeins = []; G.enemies = opts.enemies || [];
    G.completedFortresses = {}; G.nearestFortressInteract = opts.interact || null; G.fortressLockedNear = opts.locked || null;
    G.nearestShrine = null;
    bills = opts.bills || [];
    G.applyRenderPreset(opts.preset || 'recommended');
    // Restated in Stage J2: landmarkModels and landmarkBoundsGate are default
    // ON. These scenes measure the G2 order with the legacy shrine painter and
    // the legacy structure overlays as the nearer and late things, so they pin
    // both OFF unless a scene sets them (the ruin section adds one scene with
    // both on; the model path's order is landmark_models.js 'frame', the gate
    // landmark_bounds.js).
    G.setRenderFeatures({landmarkModels: false, landmarkBoundsGate: false});
    G.setRenderFeatures(opts.features || {});
    // cam.z -4 puts the eye (getCam3D().cameraZ) 20 above the floor; opts.eye overrides it.
    var eye = opts.eye === undefined ? 20 : opts.eye;
    G.cam.x = opts.cam[0]; G.cam.y = opts.cam[1]; G.cam.ang = opts.cam[2]; G.cam.pitch = 0; G.cam.z = 60 + (eye - 60) * 40 / 25;
    G.pos.x = G.cam.x; G.pos.y = G.cam.y;
    G.updateDayNight(0);
  }
  function frame(withMasks) {
    G._lightGridFrameCount = 1; G._presentationRandomState = 1234567; H.clock.seed = 0x0badcafe;
    calls = []; masks = withMasks ? [] : null;
    H.record(true, true); G.ctx.__stage('');
    try { G.renderFrame(); } finally { var rec = H.record(false); }
    return rec.all;
  }
  // The recorded entries between a stage's markers (all spans with that tag).
  function stageEntries(entries, stage) {
    var list = [], inside = false;
    entries.forEach(function (t) {
      var m = /^c\d+\.__stage\((.*)\)$/.exec(t);
      if (m) { inside = JSON.parse(m[1]) === stage; return; }
      if (inside) list.push(t);
    });
    return list;
  }
  function countCalls(list, method) {
    var re = new RegExp('^c\\d+\\.' + method + '\\(');
    return list.filter(function (t) { return re.test(t); }).length;
  }
  // Mask-based overpaint: pixels of a `far` mask recorded after a `near` mask
  // already held them, per near stage tag.
  function maskOverpaint(list, isNear, isFar) {
    var n = W * HT, nearSeen = new Uint8Array(n), over = new Uint8Array(n), shared = new Uint8Array(n), farSeen = new Uint8Array(n);
    var res = {near: 0, far: 0, shared: 0, over: 0};
    list.forEach(function (m) {
      var near = isNear(m), far = isFar(m);
      m.px.forEach(function (i) {
        if (near) { nearSeen[i] = 1; if (farSeen[i]) shared[i] = 1; }
        if (far) { farSeen[i] = 1; if (nearSeen[i]) { over[i] = 1; shared[i] = 1; } }
      });
    });
    for (var i = 0; i < n; i++) { res.near += nearSeen[i]; res.far += farSeen[i]; res.shared += shared[i]; res.over += over[i]; }
    return res;
  }
  function tagOf(stage) { return stage.split(':')[0]; }
  // Per near tag: unique pixels it painted, pixels a far tag's opaque fills
  // (fillSceneDepthPolygon's rect-run paths) also painted (in either order)
  // and pixels they painted after it (overpainted).
  function analyse(entries, nearTags, farTags) {
    var n = W * HT, nearBits = new Uint8Array(n), farPx = new Uint8Array(n), overBits = new Uint8Array(n);
    var alphaBad = [], res = {near: {}, shared: {}, over: {}, far: 0, overAll: 0};
    paintLog(entries, function (ev, i) {
      var tag = tagOf(ev.stage), k = nearTags.indexOf(tag);
      if (k >= 0) nearBits[i] |= 1 << k;
      else if (farTags.indexOf(tag) >= 0 && /^(rect)+$/.test(ev.kinds)) { farPx[i] = 1; overBits[i] |= nearBits[i]; }
    });
    nearTags.forEach(function (tag, k) {
      var bit = 1 << k, near = 0, shared = 0, over = 0;
      for (var i = 0; i < n; i++) {
        if (!(nearBits[i] & bit)) continue;
        near++; if (farPx[i]) shared++; if (overBits[i] & bit) over++;
      }
      res.near[tag] = near; res.shared[tag] = shared; res.over[tag] = over;
    });
    for (var j = 0; j < n; j++) { if (farPx[j]) res.far++; if (overBits[j]) res.overAll++; }
    return res;
  }
  function opaqueAlphas(entries, stages) {
    var bad = 0, fills = 0;
    paintLog(entries, function (ev) {
      if (stages.indexOf(ev.stage) < 0 || ev.kinds.replace(/rect/g, '') !== '' || ev._seen) return;
      ev._seen = true; fills++;
      if (ev.alpha !== 1) bad++;
    });
    return {fills: fills, bad: bad};
  }
  function chest(x, y, extra) {
    var c = {x: x, y: y, renderFloorZ: 0, tier: 'common', facing: 0, lidAngle: 0, opened: false, gold: 12, seed: 3};
    for (var k in extra || {}) c[k] = extra[k];
    return c;
  }

  // ── ruin: chest, billboard and shrine in front of the waypost ──
  // Hut facing 1 at (150, 200): its waypost stands at (189, 218) (18 right,
  // 39 out along +x). The camera at (270, 218) looks along -x: the post is 81
  // ahead, the shrine 25, the billboard 45 and the chest 55.
  var RY = 200, RUIN = {x: 150, y: RY, ruinType: 'hut', facing: 1}, RCAM = [270, RY + 18, Math.PI];
  function ruinScene(features, aside) {
    // aside: the negative control moves each thing sideways until its screen
    // extent (the chest's glow halo, the shrine's glow) clears the post.
    var sc = aside ? 40 : 0, se = aside ? 20 : 0, ss = aside ? -38 : 0;
    world({cam: RCAM, features: features, ruins: [RUIN],
      chests: [chest(215, RY + 10 + sc)], shrines: [{x: 245, y: RY + 26 + ss, buffType: 'damage', used: false}],
      bills: [{x: 225, y: RY + 18 + se, z: 0, w: 10, h: 24}]});
    return frame();
  }
  if (section('ruin')) {
    var post = G.getRuinPostWorld(RUIN, {});
    check('ruin: the authored waypost is where the scene assumes (189, 218)', post.x === 189 && post.y === RY + 18, post);
    var NEAR = ['chest', 'enemy', 'shrine'], FAR = ['ruin'];
    var early = ruinScene({landmarkOpaqueEarly: true, chestModel: true});
    var earlyCalls = calls.slice();
    var e = analyse(early, NEAR, FAR);
    var late = ruinScene({landmarkOpaqueEarly: false, chestModel: true});
    var l = analyse(late, NEAR, FAR);
    out('NOTE ruin early ' + JSON.stringify(e) + ' late ' + JSON.stringify(l));
    check('ruin: the frame runs the ruin opaque phase in landmarkOpaque3D (before sceneEntities and the billboards) and the late ruins3D call draws only overlays',
      earlyCalls.indexOf('ruin:opaque') >= 0 && earlyCalls.indexOf('ruin:opaque') < earlyCalls.indexOf('chest:opaque') &&
      earlyCalls.indexOf('ruin:late') > earlyCalls.indexOf('shrine:late'), earlyCalls);
    check('ruin: every nearer thing overlaps the post on screen (chest, billboard and shrine each share >= 20 px with ruin faces)',
      NEAR.every(function (t) { return e.shared[t] >= 20; }), e);
    check('ruin: with landmarkOpaqueEarly the farther ruin post overpaints 0 nearer pixels (chest, billboard, shrine)',
      e.overAll === 0 && NEAR.every(function (t) { return e.over[t] === 0; }) && e.far > 0, e);
    check('ruin: control, the late opaque order (landmarkOpaqueEarly off) overpaints the billboard, the shrine and the chest overlays',
      NEAR.every(function (t) { return l.over[t] > 0; }), l);
    // Stage J2 defaults (landmark models and bounds gate on): the shrine model
    // writes depth, so the farther post overpaints no nearer pixel early, and
    // even the late order (landmarkOpaqueEarly off) leaves the shrine alone.
    var J2 = {chestModel: true, landmarkModels: true, landmarkBoundsGate: true};
    var jEarly = analyse(ruinScene(Object.assign({landmarkOpaqueEarly: true}, J2)), NEAR, FAR);
    var jLate = analyse(ruinScene(Object.assign({landmarkOpaqueEarly: false}, J2)), NEAR, FAR);
    out('NOTE ruin J2 defaults early ' + JSON.stringify(jEarly) + ' late ' + JSON.stringify(jLate));
    check('ruin: with the stage J2 defaults (landmark models, bounds gate) the post overpaints 0 nearer pixels early, and even the late order does not overpaint the shrine model (the post is depth-tested against it)',
      jEarly.overAll === 0 && jEarly.far > 0 && NEAR.every(function (t) { return jEarly.shared[t] >= 20; }) &&
      jLate.near.shrine > 0 && jLate.far > 0 && jLate.over.shrine === 0, {early: jEarly, late: jLate});
    var shifted = ruinScene({landmarkOpaqueEarly: false, chestModel: true}, true), sh = analyse(shifted, NEAR, FAR);
    out('NOTE ruin aside (late order) ' + JSON.stringify(sh));
    check('ruin: negative control, moved aside (chest 40, billboard 20, shrine -38) the same things paint but share no pixel with the ruin, so even the late order overpaints 0',
      NEAR.every(function (t) { return sh.near[t] > 0 && sh.shared[t] === 0 && sh.over[t] === 0; }), sh);
    // A billboard behind the post (camera-forward 121): the early post hides it.
    var BEHIND = [{x: 149, y: RY + 18, z: 0, w: 10, h: 24}];
    world({cam: RCAM, features: {landmarkOpaqueEarly: true}, ruins: [RUIN], bills: BEHIND});
    var behind = analyse(frame(), ['enemy'], ['ruin']);
    world({cam: RCAM, features: {landmarkOpaqueEarly: false}, ruins: [RUIN], bills: BEHIND});
    var behindLate = analyse(frame(), ['enemy'], ['ruin']);
    out('NOTE ruin behind ' + JSON.stringify(behind) + ' late order ' + JSON.stringify(behindLate));
    check('ruin: a billboard behind the post (forward 121) is hidden where the post is: it paints none of the post pixels drawn before it, draws beside it, and its rectangle does cross the post (late order: the post covers ' + behindLate.over.enemy + ' px of it)',
      behind.near.enemy > 0 && behind.shared.enemy === 0 && behind.far > 0 && behindLate.over.enemy > 0, {early: behind, late: behindLate});
    var alphas = opaqueAlphas(early, ['ruin:opaque', 'chest:opaque']);
    check('ruin: opaque world-face fills outside the fade band (ruin faces, chest model) are all at globalAlpha 1',
      alphas.fills >= 20 && alphas.bad === 0, alphas);
  }

  // ── lintel: a billboard in front of a fortress gate lintel (legacy shell) ──
  // The synthetic world is not Endless, so structureModels has no pass and
  // drawStructures3D draws the legacy shell: in landmarkOpaque3D with
  // landmarkOpaqueEarly, late otherwise. A 200-cell grid holds the fortress
  // at (1200, 1200); its south gate lintel is a box 798 south of it
  // (gateInset = 1.7 CHUNK_SIZE - 1.5 cell), 0.68..0.90 of the 216-unit
  // wall. The camera 150 south of the lintel, eye 170, looks north; the
  // billboard hangs 60 in front of the lintel across its lower edge.
  if (section('lintel')) {
    var FORT = {type: 'fortress', x: 1200, y: 1200, scale: 1, numBuildings: 2, rotation: 0, regionX: 7, regionY: 7};
    var metrics = G.getStructureShellMetrics(FORT), inset = G.CHUNK_SIZE * 1.7 - G.cell * 1.5;
    var z0 = metrics.wallWorldH * 0.68, z1 = metrics.wallWorldH * 0.90;
    check('lintel: the gate lintel is where the scene assumes (798 south of the centre, z 146.9..194.4)',
      inset === 798 && Math.abs(z0 - 146.88) < 1e-9 && Math.abs(z1 - 194.4) < 1e-9, {inset: inset, z0: z0, z1: z1});
    function lintelScene(early, aside) {
      world({n: 200, cam: [1200, 1200 - inset - 150, Math.PI / 2], eye: 170, features: {landmarkOpaqueEarly: early, structureModels: true},
        structures: [FORT], bills: [{x: aside ? 1260 : 1200, y: 1200 - inset - 60, z: z0 - 10, w: 16, h: 30}]});
      return frame();
    }
    var le = analyse(lintelScene(true), ['enemy'], ['structure']), ll = analyse(lintelScene(false), ['enemy'], ['structure']);
    var la = analyse(lintelScene(false, true), ['enemy'], ['structure']);
    out('NOTE lintel early ' + JSON.stringify(le) + ' late ' + JSON.stringify(ll) + ' aside (late) ' + JSON.stringify(la));
    check('lintel: with landmarkOpaqueEarly the legacy shell draws in landmarkOpaque3D and its farther lintel overpaints 0 of the billboard\'s ' + le.shared.enemy + ' shared pixels',
      calls.length > 0 && le.shared.enemy >= 20 && le.over.enemy === 0 && le.far > 0, le);
    check('lintel: control, the late order overpaints the billboard; negative control, moved 60 aside it shares no pixel with the shell',
      ll.over.enemy > 0 && la.near.enemy > 0 && la.shared.enemy === 0 && la.over.enemy === 0, {late: ll, aside: la});
  }

  // ── entities: a chest (model) in front of a modelled wall torch ──
  // Wall row gy = 24 (y 288..300), torch on its north face at (294, 287.5),
  // z 132 (flame 140.8). The camera at (294, 168), eye 132, looks south: the
  // torch is 116..119.5 ahead. The chest stands 60 ahead on a ledge at 124
  // (renderFloorZ), its lock towards the camera, so its body covers the
  // torch's lower half and its glow halo (depth-tested at the glow anchor + 11,
  // 71) the rest. Masks are the depth-tested pixels of each draw.
  if (section('entities')) {
    var TORCH = {worldX: 24 * 12 + 6, worldY: 24 * 12, side: 'north', type: 'torch', gridX: 24, gridY: 24};
    function torchScene(features, withChest, extra) {
      world({wall: true, cam: [294, 168, Math.PI / 2], eye: 132, features: features, decor: [TORCH],
        chests: withChest ? [chest(294, 228, {renderFloorZ: 124, facing: -Math.PI / 2})] : [],
        spawners: extra || []});
      frame(true);
      return masks;
    }
    function tagIs(tag) { return function (m) { return m.stage.split(':')[0] === tag; }; }
    function union(list, pred) { var set = {}; list.forEach(function (m) { if (pred(m)) m.px.forEach(function (i) { set[i] = 1; }); }); return set; }
    function count(set) { return Object.keys(set).length; }
    var models = {chestModel: true, wallPropModels: true, landmarkOpaqueEarly: true};
    var on = torchScene(models, true);
    var ov = maskOverpaint(on, function (m) { return m.stage.split(':')[0] === 'chest' && !m.opaque; },
      function (m) { return m.stage.split(':')[0] === 'wall' && m.opaque; });
    out('NOTE entities opaque-first chest overlays vs torch faces ' + JSON.stringify(ov));
    var modelCalls = calls.slice();
    check('entities: sceneEntities draws every family\'s opaque phase before any overlay phase (chest and wall props)',
      modelCalls.indexOf('wall:opaque') >= 0 && modelCalls.indexOf('wall:opaque') < modelCalls.indexOf('chest:overlay') &&
      modelCalls.indexOf('chest:opaque') < modelCalls.indexOf('wall:opaque'), modelCalls);
    check('entities: opaque first, the farther torch model overpaints 0 of the nearer chest overlays\' ' + ov.shared + ' shared pixels',
      ov.near > 0 && ov.far > 0 && ov.shared >= 20 && ov.over === 0, ov);
    // The chest hides the flame (moved here from stage F): the flame's
    // visible mask misses every pixel the chest model wrote.
    var chestPx = union(on, function (m) { return tagIs('chest')(m) && m.opaque; });
    var flame = union(on, function (m) { return tagIs('wall')(m) && !m.opaque; });
    var flameOnChest = Object.keys(flame).filter(function (i) { return chestPx[i]; }).length;
    var bare = torchScene(models, false), bareFlame = union(bare, function (m) { return tagIs('wall')(m) && !m.opaque; });
    var bareOnChest = Object.keys(bareFlame).filter(function (i) { return chestPx[i]; }).length;
    var legacyChest = torchScene({chestModel: false, wallPropModels: true, landmarkOpaqueEarly: true}, true);
    var legacyChestPx = union(legacyChest, function (m) { return tagIs('chest')(m); });
    var legacyFlame = union(legacyChest, function (m) { return tagIs('wall')(m) && !m.opaque; });
    var legacyOnChest = Object.keys(legacyFlame).filter(function (i) { return legacyChestPx[i]; }).length;
    out('NOTE entities flame: chest px ' + count(chestPx) + ', flame over the chest ' + flameOnChest + ' (no chest ' + bareOnChest +
      ', legacy chest ' + legacyOnChest + ' of ' + count(legacyChestPx) + ')');
    check('entities: the chest model in front hides the overlay-phase flame (0 flame pixels on its ' + count(chestPx) + ' px; without the chest the flame covers ' + bareOnChest + ' of them)',
      count(chestPx) > 0 && flameOnChest === 0 && bareOnChest >= 20 && count(flame) > 0, {chest: count(chestPx), flame: flameOnChest, bare: bareOnChest});
    check('entities: control, the legacy chest (chestModel off) writes no depth, so the flame paints over it (' + legacyOnChest + ' px)',
      legacyOnChest > 0, legacyOnChest);
  }

  // ── overlays: structures3D's label, interactables, prompt and sealed ring ──
  // A fortress 400 ahead with its forge prompt, sealed ring (an enemy inside)
  // and SEALED text. Just before the late structures3D call an authored
  // occluder is written across the whole view: a wall at forward 100, or a
  // stand-in for the fortress's own keep at forward 390 (inside the keep's
  // 120 radius). Forward depths: forge 352 (its prompt too), ring front 316,
  // SEALED text 400, lectern and garrison 424; the label is tested at the
  // keep's front, 400 - 120 = 280.
  if (section('overlays')) {
    var OFORT = {type: 'fortress', x: 1200, y: 1200, scale: 1, numBuildings: 2, rotation: 0, regionX: 3, regionY: 3};
    function overlayScene(early, occluder, occluderY) {
      world({n: 200, cam: [1200, 800, Math.PI / 2], features: {landmarkOpaqueEarly: early}, structures: [OFORT],
        enemies: [{x: 1205, y: 1205, health: 10}], interact: {type: 'forge', structure: OFORT}, locked: {structure: OFORT}});
      beforeLate.drawStructures3D = occluder ? function () {
        var C = G.getCam3D(), s = 5000;
        var oy = occluderY || 900;
        G.writeSceneDepthPolygon(G.projectSceneWorldPolygon([{x: -s, y: oy, z: -s}, {x: s, y: oy, z: -s},
          {x: s, y: oy, z: s}, {x: -s, y: oy, z: s}], C));
      } : null;
      try { var entries = frame(); } finally { beforeLate.drawStructures3D = null; }
      var late = stageEntries(entries, 'structure:late');
      return {text: countCalls(late, 'fillText'), stroke: countCalls(late, 'stroke'), fill: countCalls(late, 'fill') + countCalls(late, 'fillRect')};
    }
    var open = overlayScene(true, false), hidden = overlayScene(true, true), legacyOpen = overlayScene(false, false), legacyHidden = overlayScene(false, true);
    out('NOTE overlays early ' + JSON.stringify(open) + ' behind a wall ' + JSON.stringify(hidden) +
      ' / late order ' + JSON.stringify(legacyOpen) + ' behind a wall ' + JSON.stringify(legacyHidden));
    check('overlays: in view, the late structures3D stage draws the label (2 lines), the forge prompt and SEALED text, the ring and garrison pole strokes and the interactables',
      open.text === 4 && open.stroke === 2 && open.fill >= 3 && legacyOpen.text === 4 && legacyOpen.stroke === 2, {early: open, late: legacyOpen});
    check('overlays: with landmarkOpaqueEarly, overlays behind a wall are hidden (no text, ring or interactable drawn)',
      hidden.text === 0 && hidden.stroke === 0 && hidden.fill === 0, hidden);
    check('overlays: control, the legacy late order keeps them unclipped (drawn through the wall, as before)',
      legacyHidden.text === 4 && legacyHidden.stroke === 2, legacyHidden);
    var keep = overlayScene(true, true, 1190);
    out('NOTE overlays behind a keep stand-in at 390 ' + JSON.stringify(keep));
    check('overlays: a wall at forward 390 (inside the keep) hides the SEALED text, the lectern and the garrison pole but not the nearer forge, its prompt and the ring, nor the label (tested at the keep\'s front)',
      keep.text === 3 && keep.stroke === 1 && keep.fill >= 3 && keep.fill < open.fill, {keep: keep, open: open});
  }

  // ── calls: no-argument calls draw both phases outside the early frame ──
  if (section('calls')) {
    world({cam: RCAM, features: {landmarkOpaqueEarly: true}, ruins: [RUIN]});
    var entries = frame();
    var lateRuin = stageEntries(entries, 'ruin:late');
    function direct(fn) { H.record(true, true); G.ctx.__stage(''); try { fn(); } finally { var r = H.record(false); } return r.all; }
    // Same render frame (no beginRenderFrameStats), fresh depth for each call.
    G.beginSceneDepthFrame(W, HT);
    var after = direct(function () { G.drawRuins3D(); });
    G.beginSceneDepthFrame(W, HT);
    var again = direct(function () { G.drawRuins3D(); });
    G.beginSceneDepthFrame(W, HT); G.beginRenderFrameStats();
    var opq = direct(function () { G.drawRuins3D('opaque'); });
    G.beginSceneDepthFrame(W, HT);
    var ovl = direct(function () { G.drawRuins3D('overlay'); });
    G.beginSceneDepthFrame(W, HT);
    var both = direct(function () { G.drawRuins3D(); });
    var shape = function (list) { return {fill: countCalls(list, 'fill'), text: countCalls(list, 'fillText')}; };
    out('NOTE calls late ' + JSON.stringify(shape(lateRuin)) + ' after ' + JSON.stringify(shape(after)) + ' opaque ' + JSON.stringify(shape(opq)) +
      ' overlay ' + JSON.stringify(shape(ovl)) + ' both ' + JSON.stringify(shape(both)));
    check('calls: after the early pass the frame\'s late ruins3D call draws only the label; a later no-argument call in that frame draws both phases (the answer is used once)',
      shape(lateRuin).fill === 0 && shape(lateRuin).text === 1 && shape(after).fill === shape(opq).fill && shape(after).text === 1 &&
      JSON.stringify(after) === JSON.stringify(again), {late: shape(lateRuin), after: shape(after)});
    check('calls: outside the early frame a no-argument call draws the opaque phase\'s faces and the overlay phase\'s label',
      shape(opq).fill >= 30 && shape(opq).text === 0 && shape(ovl).fill === 0 && shape(ovl).text === 1 &&
      shape(both).fill === shape(opq).fill && shape(both).text === 1, {opaque: shape(opq), overlay: shape(ovl), both: shape(both)});
    // Restated in Stage H: the spawner now has a model (spawnerModel, default
    // ON), so this contract holds for its legacy path (switched off here);
    // spawner_model.js covers the model's opaque/overlay split.
    // Restated in Stage I2: likewise the floor scatter's boulder
    // (floorPropModels, default ON since I2) keeps its sprite path here;
    // floor_prop_models.js covers the models' opaque/overlay split.
    world({cam: RCAM, features: {spawnerModel: false, floorPropModels: false}, ruins: [RUIN],
      scatter: [{x: 230, y: RY + 10, type: 'boulder', variant: 0, seed: 0.25}],
      spawners: [{x: 230, y: RY + 30, hp: 5, maxHp: 10, active: true, type: 'basic'}]});
    G.beginSceneDepthFrame(W, HT); G.beginRenderFrameStats();
    var fams = ['drawFloorScatter3D', 'drawEnemySpawners3D', 'drawOreVeins'];
    var opaqueCmds = fams.map(function (f) { return direct(function () { G[f]('opaque'); }).filter(function (t) { return t.indexOf('__stage') < 0; }).length; });
    var plainCmds = fams.map(function (f) { return direct(function () { G[f](); }).filter(function (t) { return t.indexOf('__stage') < 0; }).length; });
    var overlayCmds = fams.map(function (f) { return direct(function () { G[f]('overlay'); }).filter(function (t) { return t.indexOf('__stage') < 0; }).length; });
    out('NOTE calls legacy families opaque ' + JSON.stringify(opaqueCmds) + ' plain ' + JSON.stringify(plainCmds) + ' overlay ' + JSON.stringify(overlayCmds));
    check('calls: floor scatter sprites (floorPropModels off), ore veins (no models yet) and the legacy spawner (spawnerModel off) record nothing in the opaque phase; overlay and no argument draw them',
      opaqueCmds.every(function (n) { return n === 0; }) && plainCmds[0] > 0 && plainCmds[1] > 0 &&
      plainCmds.join() === overlayCmds.join(), {opaque: opaqueCmds, plain: plainCmds, overlay: overlayCmds});
  }

  // ── legacy: no early stage, no opaque-phase commands ──
  // The ruin scene plus the chest and a torch in view on the wall row's
  // north face (x 102, 168 ahead and 70 to the side).
  if (section('legacy')) {
    var TORCH2 = {worldX: 8 * 12 + 6, worldY: 24 * 12, side: 'north', type: 'torch', gridX: 8, gridY: 24};
    function legacyScene(preset, features) {
      world({preset: preset, features: features, wall: true, cam: RCAM, ruins: [RUIN], chests: [chest(215, RY + 10)], decor: [TORCH2]});
      return frame();
    }
    var legacyEntries = legacyScene('legacy'), legacyCalls = calls.slice();
    var earlyEntries = legacyScene('recommended', {landmarkOpaqueEarly: true});
    var opaqueStages = ['scatter:opaque', 'chest:opaque', 'spawner:opaque', 'ore:opaque', 'wall:opaque'];
    var opaqueDraws = opaqueStages.map(function (st) { return stageEntries(legacyEntries, st).length; });
    var overlayDraws = ['chest:overlay', 'wall:overlay'].map(function (st) { return stageEntries(legacyEntries, st).length; });
    var lateFills = countCalls(stageEntries(legacyEntries, 'ruin:late'), 'fill');
    var earlyFills = countCalls(stageEntries(earlyEntries, 'ruin:opaque'), 'fill');
    out('NOTE legacy late ruin fills ' + lateFills + ' (early pass ' + earlyFills + '), overlay commands ' + JSON.stringify(overlayDraws));
    check('legacy: under Legacy there is no landmarkOpaque3D pass and the late ruins3D call draws the faces the early pass draws; every sceneEntities opaque phase records nothing and the chest and torch draw in the overlay phase',
      legacyCalls.indexOf('ruin:opaque') < 0 && legacyCalls.indexOf('structure:opaque') < 0 && lateFills > 0 && lateFills === earlyFills &&
      opaqueStages.every(function (st) { return legacyCalls.indexOf(st) >= 0; }) && opaqueDraws.every(function (n) { return n === 0; }) &&
      overlayDraws.every(function (n) { return n > 0; }),
      {calls: legacyCalls, opaque: opaqueDraws, overlay: overlayDraws, lateFills: lateFills, earlyFills: earlyFills});
    var def = G.RENDER_FEATURE_DEFS.filter(function (d) { return d.key === 'landmarkOpaqueEarly'; })[0];
    var chestDef = G.RENDER_FEATURE_DEFS.filter(function (d) { return d.key === 'chestModel'; })[0];
    check('legacy: landmarkOpaqueEarly and chestModel are registered default ON (flipped in G2) and OFF in Legacy',
      !!def && def.type === 'bool' && def.default === true && def.legacy === false && G.renderFeaturePreset('legacy').landmarkOpaqueEarly === false &&
      G.renderFeaturePreset('recommended').landmarkOpaqueEarly === true && !!chestDef && chestDef.default === true &&
      G.renderFeaturePreset('legacy').chestModel === false && G.renderFeaturePreset('recommended').chestModel === true, {landmark: def, chest: chestDef});
  }

  // ── water: a model chest standing in a lake, a sprite on its near shore ──
  // A still lake (the water system's arrays on a flat mesh, ground 0) covers
  // mesh points x 240-348, y 216-300 at 0.24 H (surface z 6). The camera at
  // (294, 168), eye 20, looks south. The common chest (model, 11 tall) stands
  // in the lake 92 ahead on the bed (renderFloorZ 0): its lower 6 units are
  // under the surface, its lid above it. A wildflower sprite (no model) stands
  // on the dry shore 28 ahead, the lake behind it. Water writes no depth, so
  // the chest must write depth before the water (the surface then tints only
  // its submerged part) and the sprite must draw after it.
  if (section('water')) {
    function lakeMesh() {
      var N = 49, n = N * N, m = {w: N, h: N, gridSize: 12, layerCount: new Uint8Array(n).fill(1), l0Type: new Uint8Array(n).fill(1),
        l0TopZ: new Float32Array(n), water: new Uint8Array(n), waterSurface: new Float32Array(n), waterDepth: new Float32Array(n),
        waterSpeed: new Float32Array(n), waterFlags: new Uint8Array(n), waterBody: new Int32Array(n),
        waterDirX: new Float32Array(n), waterDirY: new Float32Array(n)};
      for (var gy = 18; gy <= 25; gy++) for (var gx = 20; gx <= 29; gx++) {
        var v = gy * N + gx;
        m.water[v] = G.WATER_KIND.still; m.waterSurface[v] = 0.24; m.waterDepth[v] = 0.24; m.waterBody[v] = 1;
      }
      return m;
    }
    var FLOWER = {x: 294, y: 196, type: 'wildflower', variant: 0, seed: 0.35};
    function lakeScene() {
      world({cam: [294, 168, Math.PI / 2], features: {chestModel: true, floorPropModels: true},
        chests: [chest(294, 260, {facing: -Math.PI / 2})], scatter: [FLOWER]});
      waterMesh = lakeMesh();
      try { return {entries: frame(true), masks: masks, calls: calls.slice()}; } finally { waterMesh = null; }
    }
    var lake = lakeScene(), wl = lake.calls;
    var isWater = function (m) { return tagOf(m.stage) === 'water'; };
    var chestFaces = function (m) { return m.stage === 'chest:opaque' && m.opaque; };
    var flower = function (m) { return m.stage === 'scatter:overlay' && !m.opaque; };
    var sub = maskOverpaint(lake.masks, isWater, chestFaces), shore = maskOverpaint(lake.masks, flower, isWater);
    var chestPx = {}, waterPx = {};
    lake.masks.forEach(function (m) { m.px.forEach(function (i) { if (chestFaces(m)) chestPx[i] = 1; if (isWater(m)) waterPx[i] = 1; }); });
    var dry = Object.keys(chestPx).filter(function (i) { return !waterPx[i]; }).length;
    out('NOTE water chest ' + JSON.stringify(sub) + ' above the surface ' + dry + ' px; shore sprite ' + JSON.stringify(shore) +
      ' calls ' + JSON.stringify(wl));
    var wi = wl.indexOf('water:late'), firstOverlay = -1, lastOpaque = -1;
    wl.forEach(function (c, k) {
      if (/:opaque$/.test(c)) lastOpaque = k;
      if (/:overlay$/.test(c) && firstOverlay < 0) firstOverlay = k;
    });
    check('water: the water3D stage runs after every family\'s opaque phase and before any overlay phase',
      wi >= 0 && wl.lastIndexOf('water:late') === wi && lastOpaque >= 0 && lastOpaque < wi && firstOverlay > wi, wl);
    check('water: a model chest standing in the lake writes depth before the water, which tints its submerged part (' + sub.shared +
      ' px) and overpaints none of its ' + dry + ' px above the surface; the chest overpaints no water pixel',
      sub.near > 0 && sub.far > 0 && sub.shared >= 20 && sub.over === 0 && dry >= 20, {chest: sub, dry: dry});
    check('water: a sprite on the near shore draws after the water, which overpaints 0 of its ' + shore.shared + ' shared pixels',
      shore.near >= 20 && shore.far > 0 && shore.shared >= 20 && shore.over === 0, shore);
  }

  // ── timer: the Perf HUD's stage table and sceneEntities' two halves ──
  // sceneEntities is timed by two _pt calls (one name) around water3D. On
  // the host's performance clock the wall-decoration family's opaque call
  // costs 3 ms and its overlay call 5 ms, water 2 ms and walls 1 ms, over
  // four frames whose ring slots advance as the game loop advances them. The
  // oracle is the authored cost: sceneEntities 8 ms a frame, one call, max 8
  // (per call it was 4 ms average and max 5), as the ring's per-frame sum
  // says; water3D and walls3D (one call each) keep 2 and 1. The HUD's text
  // panel (drawPerfHud) prints the same sceneEntities row.
  if (section('timer')) {
    world({cam: RCAM, ruins: [RUIN]});
    var cost = {opaque: 3, overlay: 5}, tDecor = G.drawWallDecorations, tWater = G.drawWater3D, tWalls = G.drawWalls3D;
    var ringSums = [], hudText = '', FRAMES = 4;
    G.drawWallDecorations = function (phase) { H.clock.perf += cost[phase] || 0; return tDecor.apply(this, arguments); };
    G.drawWater3D = function () { H.clock.perf += 2; return tWater.apply(this, arguments); };
    G.drawWalls3D = function () { H.clock.perf += 1; return tWalls.apply(this, arguments); };
    try {
      G._perfBreakdown = {}; G._hudAllTimeMax = {}; G._perfBreakdownLog = Date.now();   // no 5 s dump mid-run
      for (var tf = 0; tf < FRAMES; tf++) {
        G._perfRingIdx = (G._perfRingIdx + 1) % G.PERF_HISTORY_LEN;
        for (var tk in G._perfStageHistory) G._perfStageHistory[tk][G._perfRingIdx] = 0;
        frame();
        ringSums.push(G._perfStageHistory.sceneEntities[G._perfRingIdx]);
      }
      H.clock.now += 1000; G.drawPerfHud(); hudText = H.element('perfHudText').textContent;
    } finally { G.drawWallDecorations = tDecor; G.drawWater3D = tWater; G.drawWalls3D = tWalls; }
    function row(name) {
      var v = G._perfBreakdown[name];
      return v ? {count: v.count, avg: v.total / v.count, max: v.max} : null;
    }
    var se = row('sceneEntities'), wa = row('water3D'), wl3 = row('walls3D');
    var ringMean = ringSums.reduce(function (a, b) { return a + b; }, 0) / FRAMES;
    var hudRow = (hudText.split('\n').filter(function (l) { return l.indexOf('sceneEntities ') === 0; })[0] || '').trim().split(/\s+/).slice(1).map(Number);
    var timer = {sceneEntities: se, water3D: wa, walls3D: wl3, ringSums: ringSums, hudRow: hudRow};
    out('NOTE timer ' + JSON.stringify(timer));
    check('timer: the Perf HUD times sceneEntities\' two halves (opaque 3 ms, overlay 5 ms) as one 8 ms call a frame, its average and max equal to the ring\'s per-frame sum; water3D (2 ms) and walls3D (1 ms) keep one call a frame',
      !!se && se.count === FRAMES && Math.abs(se.avg - 8) < 0.2 && Math.abs(se.avg - ringMean) < 1e-3 && Math.abs(se.max - 8) < 0.2 &&
      ringSums.every(function (v) { return Math.abs(v - 8) < 0.2; }) &&
      !!wa && wa.count === FRAMES && Math.abs(wa.avg - 2) < 0.2 && !!wl3 && wl3.count === FRAMES && Math.abs(wl3.avg - 1) < 0.2 &&
      hudRow.length === 2 && Math.abs(hudRow[0] - se.avg) < 0.006 && Math.abs(hudRow[1] - se.max) < 0.006, timer);
  }

  // ── lab: render-lab/50-pass-order.js on Endless 2024 (its nearest ruin) ──
  if (section('lab')) {
    (0, eval)(slurp('tools/game/render-lab/00-core.js'));
    (0, eval)(slurp('tools/game/render-lab/50-pass-order.js'));
    G.drawEnemies3D = realEnemies;
    H.startEndless(2024);
    G.applyRenderPreset('recommended');
    var ownChests = G.treasureChests, snapBefore = JSON.stringify(G.renderFeatureSnapshot()), wrappers = {now: Date.now, random: Math.random};
    var foe = G.enemies.filter(function (e) { return e.health > 0; })[0], foeAt = foe ? [foe.x, foe.y] : null;
    calls = []; var earlyText = G.RenderLabPassOrder.ruinPose(true), earlyCalls = calls.slice();
    calls = []; var lateText = G.RenderLabPassOrder.ruinPose(false), lateCalls = calls.slice();
    G.RenderLabPassOrder.restore();
    out('NOTE lab ' + earlyText);
    var cfg = G.RenderLabPassOrder.CONFIGS;
    check('lab: ruinPose() frames the nearest ruin with landmarkOpaqueEarly on (ruin faces in landmarkOpaque3D) and off (late only); restore() puts the chests, the enemy and the switches back',
      String(earlyText).indexOf('FAIL') !== 0 && earlyCalls.indexOf('ruin:opaque') >= 0 && earlyCalls.indexOf('ruin:opaque') < earlyCalls.indexOf('ruin:late') &&
      lateCalls.indexOf('ruin:opaque') < 0 && lateCalls.indexOf('ruin:late') >= 0 && G.treasureChests === ownChests &&
      JSON.stringify(G.renderFeatureSnapshot()) === snapBefore && (!foe || (foe.x === foeAt[0] && foe.y === foeAt[1])) &&
      Date.now === wrappers.now && Math.random === wrappers.random &&
      cfg.late.features.landmarkOpaqueEarly === false && cfg.early.features.landmarkOpaqueEarly === true,
      {early: earlyText, late: lateText, earlyCalls: earlyCalls.slice(0, 12), lateCalls: lateCalls.slice(0, 12)});
  }

  check('no console errors', H.errors.length === 0, H.errors.slice(0, 3));
  out('PASS_ORDER_RESULT ' + (failed ? 'FAIL' : 'PASS') + ' ' + (checked - failed) + ' failed ' + failed);
}());
undefined;
