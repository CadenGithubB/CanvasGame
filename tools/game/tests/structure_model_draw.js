// Structure render models, draw pass (integration stage D2,
// src/12-structure-models.js with its hooks in 12-render-core-walls.js,
// 15-render-hud-menu.js and 16-draw-overview.js). Real MAIN manifest through
// render_host.js on real fortress windows (seeds 31337 and 777000; 777000's
// fortress stands in forest).
// Oracles are independent of the pass:
// - a paint log: the recorded 2D-context command stream of one draw(),
//   interpreted per pixel (rect, arc and polygon paths, clip, save/restore,
//   globalAlpha), with the draw functions tagged by stage, so paint ORDER is
//   observed (who painted a pixel after whom), not assumed;
// - the Legacy frame (flag off) for walls3D's command stream, its depthBuffer
//   and the late shell's colours;
// - the production visibility gates themselves (chests' scene-depth clips,
//   shrines' renderEntities3D gate) with positive controls: the same probes
//   are visible once the wall cells in front are removed and the models rebuilt.
// The fixtures are real windows; where a line of sight needs it, natural
// (uncoloured, unowned) cells on the outside corridor are cleared or one is
// added, and the counts are printed. Not a browser rasterizer: no claims
// about antialiasing or final colours on screen.
// Mutations (evaluated copies; each anchor must match exactly once):
//   --after-walls-slot  the pass runs after walls3D (the plan's first slot) and
//                       walls3D skips owned cells whenever the model is current
//   --late-slot         the pass runs after sceneEntities (the late structures3D
//                       position), same skip rule
//   --canopy-unclipped  walls3D paints canopies without the depth clip
//   --no-column-merge   walls3D takes the pass without the column depth
//   --no-fail-open      walls3D skips owned cells whenever the model is current
//                       (no per-frame drawable check)
//   --far-shell-unfogged the far-band shell keeps its legacy colours
//   --backface-cull     restores D2's first cull of body faces turned away
//                       from the camera (outside 1.5 cells)
//   --canopy-no-bias    the canopy clip uses the default 0.15 depth bias
//   --shell-range-half  the model's shell range ends at 0.5 x viewDist
//   --far-shell-unguarded the far-band shell capture runs without try/catch
// Narrowing: --sections a,b (load, depth, canopy, bias, fade, gate, shell,
// coverage, failopen, stats).
(function () {
  (0, eval)(slurp('tools/game/tests/render_host.js'));
  var H = createRenderTestHost(), G = H.G, out = H.output, checked = 0, failed = 0;
  function check(name, ok, detail) {
    checked++; if (!ok) failed++;
    out((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + JSON.stringify(detail === undefined ? null : detail)));
  }
  function flag(name) { return __argv.indexOf(name) >= 0; }
  function option(name) { var i = __argv.indexOf(name); return i >= 0 ? __argv[i + 1] : null; }
  var sectionArg = option('--sections') ? option('--sections').split(',') : null;
  function section(name) { return !sectionArg || sectionArg.indexOf(name) >= 0; }
  function swap(source, name, before, after) {
    if (!flag(name)) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + name);
    return source.replace(before, after);
  }
  var MODELS = 'src/12-structure-models.js', WALLS = 'src/12-render-core-walls.js', DRAW = 'src/16-draw-overview.js';
  var PASS_STAGE = "    if (typeof structureModelsPassWanted === 'function' && structureModelsPassWanted())\n" +
    "      _pt('structureModels3D', function(){ if (!DEBUG_HIDE_WALLS) drawStructureModels3D(); });\n";
  var WALLS_STAGE = "    _pt('walls3D', function(){ if (!DEBUG_HIDE_WALLS) drawWalls3D(); });\n";
  var GOAL_STAGE = "    _pt('goalMarker3D', function(){ drawGoalMarker3D(); });\n";
  var TAKE_GATE = "  if (!pass.wallsPending) return null;\n  pass.wallsPending = false;\n  if (!structureModelsDrewThisFrame() || !structureModelsEnabled()";
  var TAKE_ALWAYS = "  pass.wallsPending = false;\n  if (!structureModelsEnabled()";
  var loaded = H.loadManifest(function (path, source) {
    if (path === DRAW) {
      source = swap(source, '--after-walls-slot', PASS_STAGE + WALLS_STAGE, WALLS_STAGE + PASS_STAGE);
      if (flag('--late-slot')) {
        source = swap(source, '--late-slot', PASS_STAGE, '');
        source = swap(source, '--late-slot', GOAL_STAGE, PASS_STAGE + GOAL_STAGE);
      }
    }
    if (path === MODELS) {
      source = swap(source, '--after-walls-slot', TAKE_GATE, TAKE_ALWAYS);
      source = swap(source, '--late-slot', TAKE_GATE, TAKE_ALWAYS);
      source = swap(source, '--no-fail-open', TAKE_GATE, TAKE_ALWAYS);
      source = swap(source, '--no-column-merge', '    for (var i = 0; i < width; i++) if (col[i] < columns[i]) columns[i] = col[i];\n', '');
      source = swap(source, '--far-shell-unfogged', '  ctx.fillStyle = packed < 0 ? color : rgbQ(', '  ctx.fillStyle = packed >= 0 ? color : rgbQ(');
      source = swap(source, '--shell-range-half', '  return (d < 1 ? 1 : d) <= viewDist;', '  return (d < 1 ? 1 : d) <= viewDist * 0.5;');
      source = swap(source, '--far-shell-unguarded',
        "  try {\n    captureRuinDecorFaces(function() { drawStructureShellWorld(st, vis, C); }, _structureModelFarShellFace);\n" +
        "  } catch (e) {\n    _structureModelsFail(e, 'far-shell');\n    return false;\n  }\n",
        "  captureRuinDecorFaces(function() { drawStructureShellWorld(st, vis, C); }, _structureModelFarShellFace);\n");
      source = swap(source, '--backface-cull', '      var side = n.x * (camX - v0.x) + n.y * (camY - v0.y) + n.z * (camZ - v0.z);\n',
        '      var side = n.x * (camX - v0.x) + n.y * (camY - v0.y) + n.z * (camZ - v0.z);\n' +
        '      if (!shell && side <= 0 && ((cosA >= 0 ? f.minX : f.maxX) - camX) * cosA + ((sinA >= 0 ? f.minY : f.maxY) - camY) * sinA >= 1 + cell * 1.5) { culled++; continue; }\n');
    }
    if (path === WALLS) {
      source = swap(source, '--canopy-unclipped',
        '    if (_smPass !== null && bx < _smPass.maxX && bx + bs > _smPass.minX && by < _smPass.maxY && by + bs > _smPass.minY) {\n',
        '    if (false) {\n');
      source = swap(source, '--canopy-no-bias', 'paint, {depthBias: cell});', 'paint);');
    }
    return source;
  });
  check('real manifest loads with the structure model pass and no console errors',
    loaded > 40 && typeof G.drawStructureModels3D === 'function' && typeof G.takeStructureModelWallPass === 'function' &&
    H.errors.length === 0, {loaded: loaded, errors: H.errors.slice(0, 3)});

  var CELL = G.cell;
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function limited(list) { return list.length > 6 ? list.slice(0, 6).concat(['... ' + list.length + ' total']) : list; }

  // ── Stage tags: each draw function marks its span in the command stream ──
  var TAGS = {drawLayersFloor3D: 'platforms3D', drawStructureModels3D: 'models', drawWalls3D: 'walls3D',
    drawCaveEntrance3D: 'caveEntrance3D', drawTreasureChests3D: 'chests', drawStructures3D: 'structures3D'};
  Object.keys(TAGS).forEach(function (name) {
    var real = G[name];
    G[name] = function () {
      G.ctx.__stage(TAGS[name]);
      try { return real.apply(this, arguments); } finally { G.ctx.__stage(''); }
    };
  });

  // ── Paint log: interpret one recorded command stream per pixel ──
  // visit(event, pixelIndex) runs for every pixel a fill paints, in order.
  // event: {id, stage, alpha, fill, kinds, shape (the path's only element, or
  // null)}. Pixel-centre rules: rect
  // [x, x+w), arc disk, polygon even-odd; the clip is the path's pixel set.
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

  // ── Scene helpers ──
  var BASE = {vd: G.viewDist};
  function floorH(x, y) { return G.floorMesh ? G.getFloorHeightAt(x, y) : 0; }
  function setCamera(x, y, ang) {
    G.cam.x = x; G.cam.y = y; G.cam.ang = ang; G.cam.pitch = 0; G.cam.z = 60 + 40 * floorH(x, y);
    G.pos.x = x; G.pos.y = y;
  }
  function centre(c) { return {x: (c.gx + 0.5) * CELL, y: (c.gy + 0.5) * CELL}; }
  function drawFrame(keep) {
    G._lightGridFrameCount = 1; G._presentationRandomState = 1234567; H.clock.seed = 0x0badcafe;
    H.record(true, keep !== false);
    G.ctx.__stage('');
    G.draw();
    return H.record(false);
  }
  function stageEntries(rec, name) {
    var list = [], inside = false;
    rec.all.forEach(function (t) {
      var m = /^c\d+\.__stage\((.*)\)$/.exec(t);
      if (m) { inside = JSON.parse(m[1]) === name; return; }
      if (inside) list.push(t);
    });
    return list;
  }
  function flagOn(on) { G.setRenderFeatures({structureModels: on}); }
  function loadFortress(seed) {
    H.startEndless(seed);
    var landed = G.goToNearestLandmark({type: 'fortress'});
    if (!landed || !landed.ok) { out('SETUP_FAILURE no fortress on seed ' + seed); throw Error('SETUP_FAILURE'); }
    flagOn(true); G.buildStructureModels();
    var st = G.largeStructures.filter(function (s) { return s.type === 'fortress' && Math.hypot(s.x - G.pos.x, s.y - G.pos.y) < 1400; })[0];
    if (!st || !G.structureModelsCurrent()) { out('SETUP_FAILURE fortress model on seed ' + seed); throw Error('SETUP_FAILURE'); }
    G.resetRenderInterpolation(); G.updateDayNight(0); G.updateLightGrid();
    return st;
  }
  function solid(x, y) { return x < 0 || y < 0 || x >= G.gridW || y >= G.gridH || !!G.grid[y * G.gridW + x]; }
  function owned(x, y) { return x >= 0 && y >= 0 && x < G.gridW && y < G.gridH && G.structureModelOwner[y * G.gridW + x] > 0; }
  function natural(x, y) { var i = y * G.gridW + x; return !solid(x, y) ? false : !owned(x, y) && !G.wallColorR[i]; }
  // A straight line through a curtain wall: owned cell W with an empty
  // outward neighbour along d, the wall's inner face and `inside` empty cells
  // behind it, and `outside` cells in front whose natural solids may be cleared.
  function findLine(opts) {
    var owner = G.structureModelOwner, best = null;
    for (var i = 0; i < owner.length && !best; i++) {
      if (!owner[i]) continue;
      var gx = i % G.gridW, gy = (i - gx) / G.gridW;
      for (var di = 0; di < 4 && !best; di++) {
        var d = DIRS[di];
        if (solid(gx + d[0], gy + d[1])) continue;
        var j = 1;
        while (j < 12 && owned(gx - d[0] * j, gy - d[1] * j)) j++;
        var ix = gx - d[0] * j, iy = gy - d[1] * j, ok = j < 12 && !solid(ix, iy);
        for (var q = 1; q <= opts.inside && ok; q++) if (solid(ix - d[0] * q, iy - d[1] * q)) ok = false;
        var clear = [];
        for (var k = 1; k <= opts.outside && ok; k++) {
          for (var s = -1; s <= 1 && ok; s++) {
            var ox = gx + d[0] * k + d[1] * s, oy = gy + d[1] * k + d[0] * s;
            if (!solid(ox, oy)) continue;
            if (natural(ox, oy) && !(opts.keep && opts.keep(ox, oy, k, s))) clear.push(oy * G.gridW + ox); else ok = false;
          }
        }
        if (ok && opts.accept && !opts.accept(gx, gy, d)) ok = false;
        if (ok) best = {w: {gx: gx, gy: gy}, d: d, thickness: j, inner: {gx: ix, gy: iy}, clear: clear};
      }
    }
    return best;
  }
  function cellAt(c, d, k) { return {gx: c.gx + d[0] * k, gy: c.gy + d[1] * k}; }
  function towards(from, to) { return Math.atan2(to.y - from.y, to.x - from.x); }
  function clearCells(list) { list.forEach(function (i) { G.grid[i] = 0; }); }

  // ── Load: default ON in Recommended, OFF in Legacy; pass order in draw() ──
  if (section('load')) {
    var drawSource = slurp('assets/games/' + DRAW);
    var at = {plat: drawSource.indexOf("_pt('platforms3D'"), pass: drawSource.indexOf("_pt('structureModels3D'"),
      walls: drawSource.indexOf("_pt('walls3D'"), cave: drawSource.indexOf("_pt('caveEntrance3D'")};
    check('draw() runs the structureModels3D stage between platforms3D and walls3D, gated on the pass and DEBUG_HIDE_WALLS',
      at.plat > 0 && at.plat < at.pass && at.pass < at.walls && at.walls < at.cave &&
      drawSource.indexOf(PASS_STAGE) >= 0 && drawSource.split("drawStructureModels3D()").length === 2, at);
    check('structureModels is default ON in Recommended and OFF in Legacy (stage D2 flip)',
      G.renderFeaturePreset('recommended').structureModels === true && G.renderFeaturePreset('legacy').structureModels === false);
  }

  var fx31337 = null;
  function depthFixture() {
    if (fx31337) return fx31337;
    var st = loadFortress(31337);
    var line = findLine({inside: 6, outside: 30});
    if (!line) { out('SETUP_FAILURE no clear curtain line on seed 31337'); throw Error('SETUP_FAILURE'); }
    clearCells(line.clear); G.buildStructureModels();
    fx31337 = {st: st, line: line};
    out('NOTE depth fixture seed 31337 wall ' + JSON.stringify(line.w) + ' dir ' + line.d + ' thickness ' + line.thickness +
      ' cleared natural cells ' + line.clear.length);
    return fx31337;
  }
  // Removes the wall cells of the line (3 wide, full thickness) and rebuilds.
  function openGap(line) {
    var removed = [];
    for (var k = 0; k < line.thickness; k++) for (var s = -1; s <= 1; s++) {
      var x = line.w.gx - line.d[0] * k + line.d[1] * s, y = line.w.gy - line.d[1] * k + line.d[0] * s, i = y * G.gridW + x;
      if (G.grid[i]) { removed.push({i: i, v: G.grid[i]}); G.grid[i] = 0; }
    }
    G.buildStructureModels();
    return function () { removed.forEach(function (r) { G.grid[r.i] = r.v; }); G.buildStructureModels(); };
  }

  // ── Depth oracle: probes behind the curtain are hidden; one in front is not overpainted ──
  if (section('depth')) {
    var fx = depthFixture(), line = fx.line, d = line.d;
    var camCell = cellAt(line.w, d, 8), camP = centre(camCell), wallP = centre(line.w);
    var behind = centre(cellAt(line.inner, d, -1)), enemyP = centre(cellAt(line.inner, d, -2));
    var front = centre(cellAt(line.w, d, 2));
    function chestAt(p) { return {x: p.x, y: p.y, bob: 0, tier: 'common', facing: towards(p, camP), lidAngle: 0, gold: 5, seed: 0.3}; }
    var realClip = G.withSceneDepthClip, chestVisible = 0, inChests = false;
    G.withSceneDepthClip = function () { var r = realClip.apply(null, arguments); if (inChests) chestVisible += r; return r; };
    var realChests = G.drawTreasureChests3D;
    G.drawTreasureChests3D = function () { inChests = true; try { return realChests.apply(this, arguments); } finally { inChests = false; } };
    function probeBehind() {
      G.treasureChests = [chestAt(behind)];
      setCamera(camP.x, camP.y, towards(camP, wallP));
      chestVisible = 0;
      var rec = drawFrame();
      var chest = chestVisible, C = G.getCam3D(), ez = floorH(enemyP.x, enemyP.y) * 25;
      var top = G.projToScreen(enemyP.x, enemyP.y, ez + 50, C), bot = G.projToScreen(enemyP.x, enemyP.y, ez, C);
      var enemy = top && bot ? G.withSceneDepthBillboard({x: bot.sx - 6, y: top.sy, width: 12, height: Math.max(1, bot.sy - top.sy)}, bot.fwd, function () {}) : -1;
      return {chest: chest, enemy: enemy, modelFills: stageEntries(rec, 'models').filter(function (t) { return /\.fill\(\)$/.test(t); }).length};
    }
    flagOn(true);
    var hidden = probeBehind();
    var restore = openGap(line), open = probeBehind();
    restore();
    flagOn(false);
    var legacyHidden = probeBehind();
    flagOn(true);
    check('depth: with the flag on, a chest and an enemy-style billboard behind a fortress curtain wall are hidden (the model painted)',
      hidden.chest === 0 && hidden.enemy === 0 && hidden.modelFills > 0, hidden);
    check('depth positive control: the same chest and billboard are visible once those wall cells are removed and the model rebuilt',
      open.chest > 0 && open.enemy > 0, open);
    check('depth: Legacy agrees (both hidden behind the per-cell walls)', legacyHidden.chest === 0 && legacyHidden.enemy === 0, legacyHidden);

    // A chest in front of the wall: no model fill may paint over its pixels after it.
    G.treasureChests = [chestAt(front)];
    setCamera(camP.x, camP.y, towards(camP, wallP));
    var rec = drawFrame(), W = G.canvas.width, Hh = G.canvas.height;
    var last = new Int32Array(W * Hh).fill(-1), lastStage = [], modelPainted = new Uint8Array(W * Hh);
    var chestPixels = 0, chestOverModel = 0, overpaint = 0;
    paintLog(rec.all, function (ev, i) {
      if (ev.stage === 'chests') { chestPixels++; if (modelPainted[i]) chestOverModel++; }
      if (ev.stage === 'models') {
        modelPainted[i] = 1;
        if (lastStage[i] === 'chests') overpaint++;
      }
      lastStage[i] = ev.stage;
    });
    G.withSceneDepthClip = realClip; G.drawTreasureChests3D = realChests; G.treasureChests = [];
    check('depth: a chest in front of the curtain wall paints over the model and no model fill paints over it afterwards',
      chestPixels > 0 && chestOverModel > 0 && overpaint === 0, {chestPixels: chestPixels, chestOverModel: chestOverModel, overpaint: overpaint});
  }

  // ── Legacy gate and column depth: shrines and labels keep the Legacy depthBuffer ──
  if (section('gate')) {
    var gfx = depthFixture(), gline = gfx.line, gd = gline.d;
    var gCam = centre(cellAt(gline.w, gd, 8)), gWall = centre(gline.w), shrineP = centre(cellAt(gline.inner, gd, -1));
    // Restated in Stage J2: landmarkModels and landmarkBoundsGate are default
    // ON. The legacy-gate checks pin the models off (the legacy painter keeps
    // its column gate); the shrine model, gated by its bounds, is judged by
    // its depth-tested fills against the structure model's scene depth.
    var realRE = G.renderEntities3D, shrineCalls = 0, wrapShrines = true;
    var realShrineFill = G.fillSceneDepthPolygon, shrinePainted = 0, countFills = false;
    G.renderEntities3D = function (arr, opts, cb) {
      if (wrapShrines && arr === G.shrines) return realRE(arr, opts, function () { shrineCalls++; });
      return realRE.apply(null, arguments);
    };
    G.fillSceneDepthPolygon = function () { var r = realShrineFill.apply(this, arguments); if (countFills && r > 0) shrinePainted++; return r; };
    function shrineVisible(models) {
      G.setRenderFeatures({landmarkModels: models});
      wrapShrines = !models;
      G.shrines = [{x: shrineP.x, y: shrineP.y, type: 'heal', used: false}];
      setCamera(gCam.x, gCam.y, towards(gCam, gWall));
      drawFrame(false);
      shrineCalls = 0; shrinePainted = 0; countFills = true;
      // The model's opaque phase (the pedestal), whatever this frame's pass left.
      try { if (models) G.drawShrines3D('opaque'); else G.drawShrines3D(); } finally { countFills = false; }
      return models ? shrinePainted : shrineCalls;
    }
    flagOn(true);
    var shrineHidden = shrineVisible(false), shrineModelHidden = shrineVisible(true);
    var reopen = openGap(gline), shrineOpen = shrineVisible(false), shrineModelOpen = shrineVisible(true);
    reopen();
    G.renderEntities3D = realRE; G.fillSceneDepthPolygon = realShrineFill; G.setRenderFeatures({landmarkModels: true}); G.shrines = [];
    check('legacy gate: a shrine behind a structure wall stays hidden with the flag on (merged column depth)', shrineHidden === 0, shrineHidden);
    check('legacy gate positive control: the shrine is visible once the wall cells are removed', shrineOpen > 0, shrineOpen);
    check('landmark models (stage J2 defaults): the shrine model behind the structure wall paints no pixel (scene depth), and paints once the wall cells are removed',
      shrineModelHidden === 0 && shrineModelOpen > 0, {hidden: shrineModelHidden, open: shrineModelOpen});
    // depthBuffer after draw() equals the Legacy one from views around the structure.
    var views = [], diffs = [];
    for (var a = 0; a < 8; a++) for (var r = 0; r < 3; r++) {
      var ang = a * Math.PI / 4 + 0.13, dist = 180 + r * 260;
      views.push({x: gfx.st.x + Math.cos(ang) * dist, y: gfx.st.y + Math.sin(ang) * dist, ang: ang + Math.PI + 0.05 * r});
    }
    var modelDrawn = 0;
    views.forEach(function (v, k) {
      setCamera(v.x, v.y, v.ang);
      flagOn(false); drawFrame(false); var off = G.depthBuffer.slice();
      flagOn(true); drawFrame(false); var on = G.depthBuffer.slice();
      if (G.getRenderFeatureStats().frame.structDrawn > 0) modelDrawn++;
      var n = 0; for (var i = 0; i < off.length; i++) if (off[i] !== on[i]) n++;
      if (n) diffs.push({view: k, columns: n});
    });
    check('column depth: the depthBuffer after draw() with the flag on equals Legacy from 24 views around the fortress (model drawn in most)',
      !diffs.length && modelDrawn >= 12, {diffs: limited(diffs), modelDrawn: modelDrawn});
  }

  // ── Forest canopy painter order ──
  // walls3D paints canopies as arcs that write no depth. From outside, a
  // real short forest tree stands 2..4 cells in front of the curtain (its
  // canopy below the wall top), the camera 15 cells beyond it with the
  // corridor cleared of other natural solids; from the courtyard, trees
  // behind the curtain. Every walls3D arc fill counts as canopy.
  if (section('canopy')) {
    var cst = loadFortress(777000);
    var forest = G.getBiomeAt(cst.centerWX, cst.centerWY) === 'forest';
    var tree = null, cline = null, owner = G.structureModelOwner;
    function forestAt(x, y) { return G.getBiomeAt((x + 0.5) * CELL + G.windowOriginX, (y + 0.5) * CELL + G.windowOriginY) === 'forest'; }
    function topZ(x, y) { return (floorH((x + 0.5) * CELL, (y + 0.5) * CELL) + G.CANVAS_BASE_H / 25 * G.wallHeights[y * G.gridW + x]) * 25; }
    for (var ci = 0; ci < owner.length && !cline; ci++) {
      if (!owner[ci]) continue;
      var wx = ci % G.gridW, wy = (ci - wx) / G.gridW;
      for (var di = 0; di < 4 && !cline; di++) {
        var d = DIRS[di];
        if (solid(wx + d[0], wy + d[1])) continue;
        var j = 1;
        while (j < 12 && owned(wx - d[0] * j, wy - d[1] * j)) j++;
        var ix = wx - d[0] * j, iy = wy - d[1] * j, ok = j < 12 && !solid(ix, iy);
        for (var q = 1; q <= 7 && ok; q++) if (solid(ix - d[0] * q, iy - d[1] * q)) ok = false;
        if (!ok) continue;
        for (var k = 2; k <= 4 && !cline; k++) {
          var tx = wx + d[0] * k, ty = wy + d[1] * k;
          if (!solid(tx, ty)) continue;
          if (!natural(tx, ty) || !forestAt(tx, ty) || topZ(tx, ty) + 40 > topZ(wx, wy)) break;
          var clear = [], good = true;
          for (var m = 1; m <= k + 16 && good; m++) for (var sd = -1; sd <= 1 && good; sd++) {
            var ox = wx + d[0] * m + d[1] * sd, oy = wy + d[1] * m + d[0] * sd;
            if ((ox === tx && oy === ty) || !solid(ox, oy)) continue;
            if (m < k && sd === 0) good = false;
            else if (natural(ox, oy)) clear.push(oy * G.gridW + ox); else good = false;
          }
          if (good) { tree = {gx: tx, gy: ty, k: k}; cline = {w: {gx: wx, gy: wy}, d: d, thickness: j, inner: {gx: ix, gy: iy}, clear: clear}; }
          break;
        }
      }
    }
    if (!cline || !forest) { out('SETUP_FAILURE no forest fortress curtain with a short tree in front on seed 777000'); throw Error('SETUP_FAILURE'); }
    clearCells(cline.clear); G.buildStructureModels();
    out('NOTE canopy fixture seed 777000 wall ' + JSON.stringify(cline.w) + ' top ' + Math.round(topZ(cline.w.gx, cline.w.gy)) +
      ' tree ' + JSON.stringify(tree) + ' top ' + Math.round(topZ(tree.gx, tree.gy)) + ' cleared natural cells ' + cline.clear.length);
    var cwall = centre(cline.w);
    function canopyRun(camP, lookAt, camZ) {
      setCamera(camP.x, camP.y, towards(camP, lookAt));
      if (camZ) G.cam.z = camZ;
      var rec = drawFrame(), W = G.canvas.width, Hh = G.canvas.height;
      var res = {pixels: 0, overModel: 0, overpainted: 0, arcs: [], modelPixels: 0, modelPainted: new Uint8Array(W * Hh), arcPixels: {}};
      var lastCanopy = new Uint8Array(W * Hh);
      stageEntries(rec, 'walls3D').forEach(function (t) {
        var a = /\.arc\((.*)\)$/.exec(t);
        if (a) { a = a[1].split(',').map(Number); res.arcs.push({x: a[0], y: a[1], r: a[2]}); }
      });
      paintLog(rec.all, function (ev, i) {
        if (ev.stage === 'walls3D' && ev.kinds === 'arc') {
          var key = ev.shape.x + ',' + ev.shape.y + ',' + ev.shape.r;
          res.arcPixels[key] = (res.arcPixels[key] || 0) + 1;
          res.pixels++; if (res.modelPainted[i]) res.overModel++; lastCanopy[i] = 1; return;
        }
        if (ev.stage === 'models') { if (!res.modelPainted[i]) res.modelPixels++; res.modelPainted[i] = 1; if (lastCanopy[i]) res.overpainted++; }
        lastCanopy[i] = 0;
      });
      return res;
    }
    function brief(r) { return {pixels: r.pixels, overModel: r.overModel, overpainted: r.overpainted, arcs: r.arcs.length, modelPixels: r.modelPixels}; }
    var frontCam = centre(cellAt(tree, cline.d, 15)), backCam = centre(cellAt(cline.inner, cline.d, -3));
    flagOn(true);
    var front = canopyRun(frontCam, cwall), back = canopyRun(backCam, cwall);
    flagOn(false);
    var legacyBack = canopyRun(backCam, cwall);
    // Positive control: Legacy canopy disks seen from the courtyard overlap the pixels the model paints there.
    var CW = G.canvas.width, overlap = 0;
    legacyBack.arcs.forEach(function (a) {
      for (var i = 0; i < back.modelPainted.length; i++) {
        if (!back.modelPainted[i]) continue;
        var px = i % CW + 0.5, py = Math.floor(i / CW) + 0.5;
        if ((px - a.x) * (px - a.x) + (py - a.y) * (py - a.y) <= a.r * a.r) overlap++;
      }
    });
    check('canopy: tree canopies in front of a forest fortress wall paint over the model and are never overpainted by it',
      front.pixels > 0 && front.overModel > 0 && front.overpainted === 0, brief(front));
    check('canopy: from the courtyard, canopies behind the curtain paint no pixel of the model (depth-clipped)',
      back.modelPixels > 0 && back.overModel === 0 && back.overpainted === 0, brief(back));
    check('canopy positive control: in Legacy those canopies are drawn and their disks overlap the model wall pixels',
      legacyBack.arcs.length > 0 && overlap > 0, {arcs: legacyBack.arcs.length, overlap: overlap});
    fx31337 = null;
  }

  // ── Canopy clip bias: walls3D's own faces never clip a canopy ──
  if (section('bias')) {
    // Canopies against walls3D's own faces (the clip's one-cell bias). Legacy
    // paints a canopy over every face walls3D drew before it (painter's
    // order), including its own cell's and its forest neighbours' faces, which
    // reach up to a cell nearer than the canopy's cell depth. The clip may take
    // only pixels that a surface drawn before walls3D (the model, terrain)
    // covers nearer than that depth. Views: a ring through the forest around
    // the fortress (seed 777000, radii 220 and 380), at player height and raised. For every canopy drawn
    // through the clip (the call's box and depth give its two disks exactly),
    // a Legacy disk pixel the model frame lacks is spurious unless the scene
    // depth written before walls3D is nearer there than the canopy.
    // Sensitivity: disk pixels whose depth at the call lies between the
    // canopy depth less one cell and less 0.15 (the default bias).
    var bst = loadFortress(777000);
    var realBB = G.withSceneDepthBillboard, realSM = G.drawStructureModels3D, realW3 = G.drawWalls3D;
    var bbCalls = null, preWalls = null, inWalls = false;
    G.withSceneDepthBillboard = function (box, depth) {
      if (bbCalls && inWalls) {
        var r0 = (box.width - 2) / 2, cx = box.x + r0 + 1, cy = box.y + r0 + 1, Wd = G._sceneDepthW, sens = 0, inside = 0;
        for (var py = Math.max(0, Math.floor(cy - r0)); py <= Math.min(G._sceneDepthH - 1, Math.ceil(cy + r0)); py++) {
          for (var px = Math.max(0, Math.floor(cx - r0)); px <= Math.min(Wd - 1, Math.ceil(cx + r0)); px++) {
            var e = G._sceneDepthInv[py * Wd + px];
            if ((px + 0.5 - cx) * (px + 0.5 - cx) + (py + 0.5 - cy) * (py + 0.5 - cy) > r0 * r0) continue;
            inside++;
            if (!(e > 0)) continue;
            if (depth > 1 / e + 0.15 && depth <= 1 / e + CELL) sens++;
          }
        }
        bbCalls.push({r: r0, x: cx, y: cy, depth: depth, sens: sens, inside: inside});
      }
      return realBB.apply(this, arguments);
    };
    G.drawStructureModels3D = function () {
      var result = realSM.apply(this, arguments);
      preWalls = G._sceneDepthInv.slice(0, G._sceneDepthW * G._sceneDepthH);
      return result;
    };
    G.drawWalls3D = function () {
      inWalls = true;
      try { return realW3.apply(this, arguments); } finally { inWalls = false; }
    };
    // The paint log reads walls3D's span only (canopies are drawn and clipped inside it).
    function arcSets() {
      var sets = {}, list = [], rec = drawFrame();
      var marker = rec.all.filter(function (t) { return /\.__stage\("walls3D"\)$/.test(t); })[0];
      paintLog([marker].concat(stageEntries(rec, 'walls3D')), function (ev, i) {
        if (ev.stage !== 'walls3D' || ev.kinds !== 'arc') return;
        var key = ev.shape.x + ',' + ev.shape.y + ',' + ev.shape.r;
        if (!sets[key]) { sets[key] = []; list.push(ev.shape); }
        sets[key].push(i);
      });
      return {sets: sets, list: list};
    }
    var audit = {views: 0, calls: 0, onscreen: 0, audited: 0, unmatched: 0, sensitive: 0, legit: 0, spurious: 0, worst: null};
    for (var aa = 0; aa < 8; aa++) for (var az = 0; az < 2; az++) {
      var aang = aa * Math.PI / 4 + 0.3, arad = 220 + (aa % 2) * 160;
      var ac = {x: bst.x + Math.cos(aang) * arad, y: bst.y + Math.sin(aang) * arad};
      if (solid(Math.floor(ac.x / CELL), Math.floor(ac.y / CELL))) continue;
      var alook = towards(ac, bst), araise = az ? 150 : 0;
      flagOn(true); bbCalls = []; preWalls = null;
      setCamera(ac.x, ac.y, alook); G.cam.z += araise;
      var aOn = arcSets(), aCalls = bbCalls, aPre = preWalls;
      bbCalls = null;
      flagOn(false);
      setCamera(ac.x, ac.y, alook); G.cam.z += araise;
      var aOff = arcSets();
      audit.views++;
      aCalls.forEach(function (c) {
        audit.calls++;
        if (c.inside) audit.onscreen++;
        if (c.sens) audit.sensitive += c.sens;
        // Base disk (x, y - 0.2r, r) and highlight (x - 0.15r, y - 0.45r, 0.6r); the box centre y is the canopy's y - 0.2r.
        var want = [[c.x, c.y, c.r], [c.x - 0.15 * c.r, c.y - 0.25 * c.r, 0.6 * c.r]], tol = 0.02 + 0.002 * c.r;
        function near(wv) { return function (a) { return Math.abs(a.x - wv[0]) < tol && Math.abs(a.y - wv[1]) < tol && Math.abs(a.r - wv[2]) < tol; }; }
        want.forEach(function (wv) {
          var shape = aOff.list.filter(near(wv))[0];
          if (!shape) { if (wv[2] === c.r && c.inside) audit.unmatched++; return; }
          if (wv[2] === c.r) audit.audited++;
          var key = shape.x + ',' + shape.y + ',' + shape.r, kept = {}, lostHere = 0;
          (aOn.sets[key] || []).forEach(function (i) { kept[i] = 1; });
          aOff.sets[key].forEach(function (i) {
            if (kept[i]) return;
            if (aPre && aPre[i] > 1 / c.depth) audit.legit++; else { audit.spurious++; lostHere++; }
          });
          if (lostHere && (!audit.worst || lostHere > audit.worst.lost)) audit.worst = {cam: [Math.round(ac.x), Math.round(ac.y), araise], depth: +c.depth.toFixed(1), lost: lostHere};
        });
      });
    }
    G.withSceneDepthBillboard = realBB; G.drawStructureModels3D = realSM; G.drawWalls3D = realW3;
    flagOn(true);
    check('canopy: walls3D\'s own faces never clip a canopy; only a surface drawn before walls3D and nearer than the canopy takes its pixels (Legacy disks, forest ring views)',
      audit.views >= 12 && audit.onscreen > 50 && audit.unmatched === 0 && audit.spurious === 0, audit);
    check('canopy positive control: those views clip canopies behind the model (legit losses) and put faces within one cell under canopy disks',
      audit.legit > 0 && audit.sensitive > 0, {legit: audit.legit, sensitive: audit.sensitive});
  }

  // ── Faded natural wall in front of a structure ──
  if (section('fade')) {
    var ffx = depthFixture(), fline = ffx.line, fd = fline.d;
    // An authored natural cell 3 cells in front of the curtain; the camera 28
    // cells out, and viewDist set so the natural cell sits in the fade band
    // while the curtain is still in range.
    var nat = cellAt(fline.w, fd, 3), ni = nat.gy * G.gridW + nat.gx, savedCell = {g: G.grid[ni], h: G.wallHeights[ni]};
    var fCam = centre(cellAt(fline.w, fd, 28)), fWall = centre(fline.w);
    var outsideClear = true;
    for (var k = 1; k <= 28; k++) if (solid(fline.w.gx + fd[0] * k, fline.w.gy + fd[1] * k)) outsideClear = false;
    if (!outsideClear) {
      var extra = findLine({inside: 0, outside: 28});
      out('SETUP_FAILURE fade corridor is not clear (' + (extra ? extra.clear.length : 'none') + ')'); throw Error('SETUP_FAILURE');
    }
    G.grid[ni] = 1; G.wallHeights[ni] = 1.4;
    G.buildStructureModels();
    setCamera(fCam.x, fCam.y, towards(fCam, fWall));
    var C0 = G.getCam3D();
    var natDist = Math.abs((centre(nat).x - fCam.x) * C0.cosAng + (centre(nat).y - fCam.y) * C0.sinAng) - CELL * 0.5;
    var wallDist = Math.abs((fWall.x - fCam.x) * C0.cosAng + (fWall.y - fCam.y) * C0.sinAng) - CELL * 0.5;
    G.viewDist = wallDist + 24;
    var fadeStart = G.viewDist * 0.82;
    flagOn(true);
    var frec = drawFrame(), FW = G.canvas.width, modelBefore = new Uint8Array(FW * G.canvas.height);
    var fade = {natural: 0, showsModel: 0, alphas: {}};
    var natScreen = G.projToScreen(centre(nat).x, centre(nat).y, floorH(centre(nat).x, centre(nat).y) * 25 + 20, C0);
    paintLog(frec.all, function (ev, i) {
      if (ev.stage === 'models') modelBefore[i] = 1;
      if (ev.stage === 'walls3D' && ev.alpha < 1 && ev.kinds.indexOf('rect') >= 0 && natScreen && Math.abs(i % FW - natScreen.sx) < 12) {
        fade.natural++; fade.alphas[ev.alpha.toFixed(2)] = 1;
        if (modelBefore[i]) fade.showsModel++;
      }
    });
    G.viewDist = BASE.vd; G.grid[ni] = savedCell.g; G.wallHeights[ni] = savedCell.h; G.buildStructureModels();
    check('fade: a natural wall in the fade band paints translucently over structure pixels the model painted first',
      natDist > fadeStart && natDist < wallDist && fade.natural > 0 && fade.showsModel > 0,
      {natDist: Math.round(natDist), wallDist: Math.round(wallDist), fadeStart: Math.round(fadeStart), natural: fade.natural,
        showsModel: fade.showsModel, alphas: Object.keys(fade.alphas)});
  }

  // ── Late shell: skipped in range, fogged in colour beyond it ──
  if (section('shell')) {
    var sfx = depthFixture(), sst = sfx.st;
    var realShell = G.drawStructureShellWorld, shellCalls = 0;
    G.drawStructureShellWorld = function () { shellCalls++; return realShell.apply(this, arguments); };
    function lateShell(camP, ang) {
      setCamera(camP.x, camP.y, ang);
      shellCalls = 0;
      H.record(true, true); G.ctx.__stage(''); G.draw(); G.drawStructures3D();
      var rec = H.record(false);
      var late = stageEntries(rec, 'structures3D');
      return {calls: shellCalls, fills: late.filter(function (t) { return /fillStyle=/.test(t); }).map(function (t) { return JSON.parse(t.split('=')[1]); }),
        stream: late.join('\n'), models: stageEntries(rec, 'models').length, dist: Math.hypot(sst.x - camP.x, sst.y - camP.y)};
    }
    var nearCam = {x: sst.x + 260, y: sst.y + 40}, nearAng = towards(nearCam, sst);
    flagOn(true);
    var nearOn = lateShell(nearCam, nearAng);
    flagOn(false);
    var nearOff = lateShell(nearCam, nearAng);
    // Far band: viewDist shrunk so the structure lies between viewDist and
    // 2.6 x viewDist, from the first of 8 directions where Legacy draws the shell.
    G.viewDist = 400;
    var farCam = null, farAng = 0, farOff = null, farOn = null;
    for (var fa = 0; fa < 8 && !farCam; fa++) {
      var cand = {x: sst.x + Math.cos(fa * Math.PI / 4 + 0.1) * 700, y: sst.y + Math.sin(fa * Math.PI / 4 + 0.1) * 700};
      farOff = lateShell(cand, towards(cand, sst));
      if (farOff.calls === 1) { farCam = cand; farAng = towards(cand, sst); }
    }
    if (!farCam) { out('SETUP_FAILURE no far view where Legacy draws the fortress shell'); throw Error('SETUP_FAILURE'); }
    flagOn(true);
    farOn = lateShell(farCam, farAng);
    // The far band is fail-open too: a throwing far-shell sink is counted,
    // sets the session flag and hands this shell back to the legacy draw, so
    // drawStructures3D completes with Legacy's late stream.
    var realFarSink = G._structureModelFarShellFace, farFailsBefore = G.getStructureModelStats().failures, farThrew = null, farFail = null;
    G._structureModelFarShellFace = function () { throw Error('injected far-shell failure'); };
    try { farFail = lateShell(farCam, farAng); } catch (e) { farThrew = String(e && e.message); }
    G._structureModelFarShellFace = realFarSink;
    var farFailState = G.getStructureModelDrawState();
    // The failed attempt may leave a state assignment (drawStructureShellWorld
    // sets globalAlpha before its first face); apart from at most a few such
    // lines the late stream is Legacy's, command for command.
    function legacyAfterFailure(got, want) {
      var A = got.split('\n'), B = want.split('\n'), i = 0, j = 0, extra = 0;
      while (i < A.length) {
        if (j < B.length && A[i] === B[j]) { i++; j++; continue; }
        if (!/^c\d+\.\w+=/.test(A[i])) return false;
        i++; extra++;
      }
      return j === B.length && extra <= 4;
    }
    flagOn(false); flagOn(true);
    // The seam sits at viewDist: a structure between 0.5 and 1.0 x viewDist
    // (here 0.8) is still the model's; Legacy draws its shell late.
    var midCam = null, midAng = 0, midOff = null, midOn = null;
    flagOn(false);
    for (var ma = 0; ma < 8 && !midCam; ma++) {
      var mc = {x: sst.x + Math.cos(ma * Math.PI / 4 + 0.1) * 320, y: sst.y + Math.sin(ma * Math.PI / 4 + 0.1) * 320};
      if (solid(Math.floor(mc.x / CELL), Math.floor(mc.y / CELL))) continue;
      midOff = lateShell(mc, towards(mc, sst));
      if (midOff.calls === 1) { midCam = mc; midAng = towards(mc, sst); }
    }
    if (!midCam) { out('SETUP_FAILURE no view at 0.8 x viewDist where Legacy draws the fortress shell'); throw Error('SETUP_FAILURE'); }
    flagOn(true);
    midOn = lateShell(midCam, midAng);
    var sModel = G.structureModels.filter(function (m) { return m.structure === sst; })[0];
    var midShellDrawn = !!sModel && sModel.shellSerial === G.getStructureModelDrawState().serial;
    G.viewDist = BASE.vd; G.drawStructureShellWorld = realShell;
    function rgb(s) {
      var m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(s), h = /^#([0-9a-fA-F]{6})$/.exec(s);
      if (h) { var v = parseInt(h[1], 16); return [v >> 16, (v >> 8) & 255, v & 255]; }
      return m ? [+m[1], +m[2], +m[3]] : null;
    }
    var farDarker = farOn.fills.length === farOff.fills.length && farOn.fills.length > 10 && farOn.fills.every(function (c, i) {
      var a = rgb(c), b = rgb(farOff.fills[i]);
      if (!a || !b) return c === farOff.fills[i];
      return a[0] <= b[0] && a[1] <= b[1] && a[2] <= b[2];
    }) && farOn.fills.some(function (c, i) { return c !== farOff.fills[i]; });
    check('shell: in range the model draws the shell and the late pass skips it (Legacy draws it late)',
      nearOn.dist < BASE.vd && nearOn.calls === 0 && nearOn.models > 0 && nearOff.calls === 1, {on: nearOn.calls, off: nearOff.calls, models: nearOn.models});
    check('shell: between 0.5 and 1.0 x viewDist the model still draws the shell and the late pass skips it (the seam is at viewDist)',
      midOn.dist > 400 * 0.5 && midOn.dist <= 400 && midOn.calls === 0 && midShellDrawn && midOn.models > 0 && midOff.calls === 1,
      {dist: Math.round(midOn.dist), calls: [midOn.calls, midOff.calls], modelShell: midShellDrawn});
    check('shell fail-open: a far-band shell exception is counted once and the legacy shell draws in its place (drawStructures3D completes as Legacy)',
      farThrew === null && !!farFail && farFailState.failed && farFailState.failures === farFailsBefore + 1 &&
      /^far-shell: injected far-shell failure/.test(farFailState.lastFailure) && legacyAfterFailure(farFail.stream, farOff.stream),
      {threw: farThrew, state: farFailState, legacy: !!farFail && legacyAfterFailure(farFail.stream, farOff.stream)});
    check('shell: beyond viewDist the late pass draws the legacy shell once, fogged in colour (every fill no brighter, some darker)',
      farOn.dist > 400 && farOn.dist < 400 * 2.6 && farOn.calls === 1 && farOff.calls === 1 && farDarker,
      {dist: Math.round(farOn.dist), calls: [farOn.calls, farOff.calls], fills: [farOn.fills.length, farOff.fills.length],
        sample: [farOn.fills.slice(0, 3), farOff.fills.slice(0, 3)]});
  }

  // ── Coverage: the model leaves no see-through hole where Legacy had a surface ──
  // Oracle: the per-pixel scene depth after draw(), Legacy (flag off) against
  // the model. A pixel Legacy covered must be covered at the same depth or
  // nearer with the model; farther or empty is a hole (sky or terrain behind
  // shows through). Pixels whose Legacy depth lies in the far fade band
  // (beyond 0.82 x viewDist, where faces fade to alpha 0) are left out.
  // The body is open where an owned cell borders a natural solid (that face
  // is walls3D's, which may skip it: its near-camera FOV cull, no risers
  // above lower natural cells), and Legacy fills such gaps with the
  // structure's inner faces. Views: cameras just outside curtain walls beside
  // those natural cells (fortresses, seeds 31337 and 424242), looking in,
  // along and at a slant, and player-height rings around a watchtower (seed
  // 777000). Positive control: a projector hook that drops the model's faces
  // turned away from the camera (outside 1.5 cells) makes holes in the same
  // view sets (run per view until it has).
  if (section('coverage')) {
    function depthSnap() { return G._sceneDepthInv.slice(0, G._sceneDepthW * G._sceneDepthH); }
    function holes(off, on) {
      var band = 1 / (G.viewDist * 0.82), n = 0;
      for (var p = 0; p < off.length; p++) {
        var a = off[p];
        if (a > band && !(on[p] >= a * (1 - 1e-3))) n++;
      }
      return n;
    }
    function loadLandmark(seed, type) {
      H.startEndless(seed);
      var landed = G.goToNearestLandmark({type: type});
      if (!landed || !landed.ok) { out('SETUP_FAILURE no ' + type + ' on seed ' + seed); throw Error('SETUP_FAILURE'); }
      flagOn(true); G.buildStructureModels();
      var st = G.largeStructures.filter(function (x) { return x.type === type; }).sort(function (a, b) {
        return Math.hypot(a.x - G.pos.x, a.y - G.pos.y) - Math.hypot(b.x - G.pos.x, b.y - G.pos.y); })[0];
      if (!st || !G.structureModelsCurrent()) { out('SETUP_FAILURE ' + type + ' model on seed ' + seed); throw Error('SETUP_FAILURE'); }
      G.resetRenderInterpolation(); G.updateDayNight(0); G.updateLightGrid();
      return st;
    }
    // The D2 cull, re-implemented outside the pass through its projector hook.
    var faceOf = null;
    function dropTurnedAway(vertices, C) {
      var f = faceOf.get(vertices);
      if (f && f.kind !== 'shell') {
        var n = f.normal, v = f.vertices[0], cosA = C.cosAng, sinA = C.sinAng;
        var side = n.x * (G.cam.x - v.x) + n.y * (G.cam.y - v.y) + n.z * (C.cameraZ - v.z);
        var near = ((cosA >= 0 ? f.minX : f.maxX) - G.cam.x) * cosA + ((sinA >= 0 ? f.minY : f.maxY) - G.cam.y) * sinA;
        if (side <= 0 && near >= 1 + CELL * 1.5) return null;
      }
      return G.projectSceneWorldPolygon(vertices, C);
    }
    function coverageRun(label, views) {
      faceOf = new Map();
      G.structureModels.forEach(function (m) { m.faces.forEach(function (f) { faceOf.set(f.vertices, f); }); });
      var res = {label: label, views: 0, drawn: 0, holeViews: 0, holes: 0, controlViews: 0, controlHoles: 0, worst: null};
      views.forEach(function (v) {
        if (solid(Math.floor(v.x / CELL), Math.floor(v.y / CELL))) return;
        function frame() { setCamera(v.x, v.y, v.ang); G.cam.z += v.z || 0; drawFrame(false); return depthSnap(); }
        flagOn(false); var off = frame();
        flagOn(true); var on = frame(), drew = G.getRenderFeatureStats().frame.structDrawn > 0;
        // The control runs until it has shown holes in this view set.
        var hc = 0;
        if (!res.controlHoles) { G._structureModelProject = dropTurnedAway; hc = holes(off, frame()); G._structureModelProject = null; }
        var h = holes(off, on);
        res.views++; if (drew) res.drawn++;
        if (h) { res.holeViews++; res.holes += h; if (!res.worst || h > res.worst.holes) res.worst = {tag: v.tag, cam: [Math.round(v.x), Math.round(v.y), +v.ang.toFixed(3), v.z || 0], holes: h}; }
        if (hc) { res.controlViews++; res.controlHoles += hc; }
      });
      return res;
    }
    // Owned cells with an empty outward neighbour that has a natural solid
    // among its 8 neighbours, spread over the structure; cameras 1.5, 6 and
    // 10 units off the face, looking in and along both ways.
    function nearWallViews(maxCells) {
      var owner = G.structureModelOwner, picked = [], views = [];
      for (var i = 0; i < owner.length && picked.length < maxCells; i++) {
        if (!owner[i]) continue;
        var gx = i % G.gridW, gy = (i - gx) / G.gridW;
        if (picked.some(function (c) { return Math.abs(c.gx - gx) + Math.abs(c.gy - gy) < 4; })) continue;
        for (var di = 0; di < 4; di++) {
          var d = DIRS[di];
          if (solid(gx + d[0], gy + d[1])) continue;
          var ex = gx + d[0], ey = gy + d[1], beside = false;
          for (var nx = -1; nx <= 1 && !beside; nx++) for (var ny = -1; ny <= 1 && !beside; ny++) beside = natural(ex + nx, ey + ny);
          if (!beside) continue;
          picked.push({gx: gx, gy: gy});
          var into = Math.atan2(-d[1], -d[0]);
          [1.5, 6, 10].forEach(function (off) {
            var fx = (gx + 0.5 + d[0] * 0.5) * CELL + d[0] * off, fy = (gy + 0.5 + d[1] * 0.5) * CELL + d[1] * off;
            [['in', 0], ['along+', Math.PI / 2 - 0.05], ['along-', -Math.PI / 2 + 0.05]].forEach(function (a) {
              views.push({x: fx, y: fy, ang: into + a[1], tag: a[0] + off});
            });
          });
          break;
        }
      }
      return views;
    }
    var covNear = [31337, 424242].map(function (seed) {
      loadLandmark(seed, 'fortress');
      return coverageRun('fortress ' + seed, nearWallViews(6));
    });
    var wst = loadLandmark(777000, 'watchtower'), ringViews = [];
    [150, 300, 450].forEach(function (rad) {
      for (var ra = 0; ra < 8; ra++) {
        var rang = ra * Math.PI / 4 + 0.21;
        ringViews.push({x: wst.x + Math.cos(rang) * rad, y: wst.y + Math.sin(rang) * rad, ang: rang + Math.PI + 0.1 * (ra % 3 - 1), tag: 'ring' + rad});
      }
    });
    var covRing = coverageRun('watchtower 777000', ringViews);
    function brief(r) { return {views: r.views, drawn: r.drawn, holeViews: r.holeViews, holes: r.holes, worst: r.worst}; }
    check('coverage: from near-wall views beside natural cells (fortresses, seeds 31337 and 424242) the model leaves no pixel farther or empty where Legacy had a surface (outside the far fade band)',
      covNear.every(function (r) { return r.views >= 36 && r.drawn >= r.views / 2 && r.holes === 0; }), covNear.map(brief));
    check('coverage: from player-height rings around a watchtower (seed 777000) the model leaves no pixel farther or empty where Legacy had a surface',
      covRing.views >= 16 && covRing.drawn >= covRing.views / 2 && covRing.holes === 0, brief(covRing));
    check('coverage positive control: dropping the model faces turned away from the camera (the D2 cull) makes holes in both view sets',
      covNear.some(function (r) { return r.controlHoles > 0; }) && covRing.controlHoles > 0,
      covNear.concat([covRing]).map(function (r) { return {label: r.label, controlViews: r.controlViews, controlHoles: r.controlHoles}; }));
    fx31337 = null;
  }

  // ── Fail-open: a throwing projector or builder leaves walls3D and the late shell drawing ──
  if (section('failopen')) {
    var ofx = depthFixture(), ost = ofx.st;
    var oCam = null, oAng = 0;
    function frameStages() {
      setCamera(oCam.x, oCam.y, oAng);
      G._lightGridFrameCount = 1; G._presentationRandomState = 1234567; H.clock.seed = 0x0badcafe;
      H.record(true, true); G.ctx.__stage(''); G.draw(); G.drawStructures3D();
      var rec = H.record(false);
      return {walls: stageEntries(rec, 'walls3D').join('\n'), shell: stageEntries(rec, 'structures3D').join('\n'),
        models: stageEntries(rec, 'models').length, marker: rec.all.filter(function (t) { return t.indexOf('__stage("models")') >= 0; }).length};
    }
    // A view where Legacy draws the late shell (its gate passes) and the model draws.
    var legacyFrame = null, modelFrame = null;
    for (var orad = 100; orad <= 340 && !oCam; orad += 60) for (var oa = 0; oa < 8 && !oCam; oa++) {
      var oc = {x: ost.x + Math.cos(oa * Math.PI / 4 + 0.2) * orad, y: ost.y + Math.sin(oa * Math.PI / 4 + 0.2) * orad};
      if (solid(Math.floor(oc.x / CELL), Math.floor(oc.y / CELL))) continue;
      oCam = oc; oAng = towards(oc, ost);
      flagOn(false); legacyFrame = frameStages();
      flagOn(true); modelFrame = frameStages();
      if (!legacyFrame.shell.length || !modelFrame.models) oCam = null;
    }
    if (!oCam) { out('SETUP_FAILURE no view where Legacy draws the late shell and the model draws'); throw Error('SETUP_FAILURE'); }
    var before = G.getStructureModelStats().failures, ptBefore = G._ptErrors.structureModels3D || 0;
    G._structureModelProject = function () { throw Error('injected projector failure'); };
    var failing = frameStages(), state1 = G.getStructureModelDrawState();
    var next = frameStages(), state2 = G.getStructureModelDrawState();
    G._structureModelProject = null;
    var stillFailed = frameStages();
    flagOn(false); flagOn(true);
    var retried = frameStages(), state3 = G.getStructureModelDrawState();
    check('fail-open precondition: with the model drawing, walls3D skips the owned cells and the late pass skips the shell (both differ from Legacy)',
      modelFrame.models > 0 && modelFrame.walls !== legacyFrame.walls && modelFrame.shell !== legacyFrame.shell && legacyFrame.shell.length > 0,
      {models: modelFrame.models, wallsDiffer: modelFrame.walls !== legacyFrame.walls, legacyShell: legacyFrame.shell.length, modelShell: modelFrame.shell.length});
    check('fail-open: a throwing projector is counted once, and walls3D and the late shell paint exactly as Legacy in that frame',
      state1.failed && state1.failures === before + 1 && /injected projector failure/.test(state1.lastFailure) &&
      (G._ptErrors.structureModels3D || 0) === ptBefore && failing.walls === legacyFrame.walls && failing.shell === legacyFrame.shell,
      {state: state1, wallsSame: failing.walls === legacyFrame.walls, shellSame: failing.shell === legacyFrame.shell});
    check('fail-open: later frames skip the pass (session flag) and keep the Legacy walls and shell until the feature is switched off and on',
      next.marker === 0 && next.walls === legacyFrame.walls && state2.failures === state1.failures &&
      stillFailed.marker === 0 && stillFailed.walls === legacyFrame.walls &&
      !state3.failed && retried.models > 0 && retried.walls === modelFrame.walls,
      {nextMarker: next.marker, stillMarker: stillFailed.marker, retried: retried.models, state3: state3});
    // A builder failure at window assembly: assembleWindow completes, walls3D draws.
    var realCapture = G.captureStructureShellFaces, failsBefore = G.getStructureModelStats().failures, threw = null;
    G.captureStructureShellFaces = function () { throw Error('injected build failure'); };
    try { G.assembleWindow(G.windowCX + 2, G.windowCY + 2); } catch (e) { threw = e.message; }
    G.captureStructureShellFaces = realCapture;
    var afterBuild = G.getStructureModelStats(), buildFrame = frameStages();
    check('fail-open: a builder exception during assembleWindow is counted, clears the models and leaves walls3D drawing every cell',
      threw === null && afterBuild.failures === failsBefore + 1 && /injected build failure/.test(afterBuild.lastFailure) &&
      G.structureModels.length === 0 && buildFrame.marker === 0 && G.grid !== null,
      {threw: threw, failures: [failsBefore, afterBuild.failures], models: G.structureModels.length, marker: buildFrame.marker});
    flagOn(false); flagOn(true);
    fx31337 = null;
  }

  // ── Counters, debug tint, presentation only ──
  if (section('stats')) {
    var tfx = depthFixture(), tst = tfx.st;
    setCamera(tst.x + 250, tst.y + 30, towards({x: tst.x + 250, y: tst.y + 30}, tst));
    flagOn(true);
    drawFrame(false);
    var fs = G.getRenderFeatureStats().frame;
    check('counters: per-frame model faces, culled, drawn and hidden, plus build ms, are reported',
      fs.structFaces > 0 && fs.structDrawn > 0 && fs.structCulled >= 0 && typeof fs.structBuildMs === 'number' &&
      fs.structFaces >= fs.structDrawn + fs.structCulled, fs);
    var savedGrid = G._lightGrid, rngBefore = H.clock.randomCalls, gridHash = Array.prototype.join.call(G.grid.subarray(0, 4096), '');
    G._lightGrid = null;
    var debugRec = drawFrame(), plainFills = stageEntries(debugRec, 'models').filter(function (t) { return /fillStyle=/.test(t); });
    G.DEBUG_POLY_TYPES = true;
    var greyRec = drawFrame(), greyFills = stageEntries(greyRec, 'models').filter(function (t) { return /fillStyle=/.test(t); });
    G.DEBUG_POLY_TYPES = false; G._lightGrid = savedGrid;
    var grey = greyFills.every(function (t) { var m = /rgb\((\d+),(\d+),(\d+)\)/.exec(t); return m && m[1] === m[2] && m[2] === m[3]; });
    var tinted = plainFills.some(function (t) { var m = /rgb\((\d+),(\d+),(\d+)\)/.exec(t); return m && !(m[1] === m[2] && m[2] === m[3]); });
    check('DEBUG_POLY_TYPES paints every model face the surface-wall grey (tinted otherwise)', greyFills.length > 10 && grey && tinted,
      {grey: greyFills.length, sample: greyFills.slice(0, 2), tinted: tinted});
    var rngMid = H.clock.randomCalls;
    G.drawStructureModels3D();
    check('the pass is presentation only: no RNG draws and the grid is unchanged',
      H.clock.randomCalls === rngMid && Array.prototype.join.call(G.grid.subarray(0, 4096), '') === gridHash,
      {rng: H.clock.randomCalls - rngMid});
  }

  check('no console errors', H.errors.filter(function (e) { return !/injected/.test(e); }).length === 0, H.errors.slice(0, 3));
  out('STRUCTURE_MODEL_DRAW_RESULT ' + (failed ? 'FAIL ' : 'PASS ') + checked + ' failed ' + failed);
}());
undefined;
