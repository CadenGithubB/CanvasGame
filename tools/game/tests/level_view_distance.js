// A classic level's view distance across a mid-level settings Apply, through
// the real MAIN manifest (render_host.js).
// Risk: resetLevel gives a classic level the Render Distance setting but at
// least 0.8 of the map's shorter side -- Level 4 (the Expanse, 4320x2880)
// 2304 u, Level 1 (1440x960) at least 768 u -- while the settings panel's
// Apply ran applySettings, which assigned the raw setting. Choosing Ultra
// (1800) in the Expanse cut its draw distance (and every viewDist radius,
// including the 1.5 x viewDist enemy update radius) from 2304 to 1800 until
// the next level; 400 cut it to 400. Nothing was logged. Endless views its
// assembled window at the setting itself.
// Oracles, independent of the code under test:
//   analytic  0.8 x the authored level's shorter side (levels[] w/h): 2304 u
//             and 768 u; an applied setting above it (Ultra on Level 1) is
//             taken; Endless takes the setting (500, 400, 1800);
//   restart   the same level started again at the same committed settings;
//   frame     the floor quads a real Level 4 frame submits at a fixed pose
//             (cells are kept by centre distance <= viewDist), before and
//             after each Apply, with ground beyond 1800 u in view.
// Every Apply is the player's path: the O key (the document keydown
// listener) opens the panel and stages the settings, drawSettingsOverlay lays
// out its hit areas, canvas clicks pick a preset or slider value and press
// Apply at a point no earlier area claims (Apply's centre lies under the
// Day/Night toggle's area), then the rAF an Endless Apply schedules runs.
// Checks print PASS/FAIL and keep going, so a mutation names what it broke.
// Mutations (evaluated copies only; each anchor must match exactly once):
//   --raw-setting         applySettings assigns settings.viewDist (the defect)
//   --classic-everywhere  applySettings applies the classic rule in Endless too
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
  var MENU = 'src/15-render-hud-menu.js';
  var APPLY = '  viewDist = ENDLESS_MODE ? settings.viewDist : classicLevelViewDist();\n';
  var loaded = H.loadManifest(function (path, source) {
    if (path !== MENU) return source;
    source = swap(source, '--raw-setting', APPLY, '  viewDist = settings.viewDist;\n');
    return swap(source, '--classic-everywhere', APPLY, '  viewDist = classicLevelViewDist();\n');
  });
  check('setup: real manifest loads with no console errors', loaded > 40 && typeof G.applySettings === 'function' &&
    typeof G.handleSettingsClick === 'function' && H.errors.length === 0, {loaded: loaded, errors: H.errors.slice(0, 3)});

  // ── Start paths ──
  function seedRandom(seed) {
    var s = seed >>> 0;
    Math.random = function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  // No game loop: a start's queued loop frame finds itself stale and returns.
  function quiet() {
    G.running = true; G.gameOverState = G.menuOpen = G.settingsOpen = G.shopOpen = false;
    G.inventoryOpen = G.forgeOpen = G.overviewActive = false; G.calibrating = false;
    G.USE_KEYBOARD = G.USE_MOUSE = true; G.USE_GAMEPAD = false; G._loopGen++;
  }
  var P = G.QUALITY_PRESETS;
  // The committed settings a run starts with (as an earlier Apply leaves them).
  function commit(s, preset) {
    G.settings.viewDist = s.viewDist; G.settings.chunkWindow = s.chunkWindow;
    G.settings.particles = s.particles; G.settings.resolution = s.resolution;
    G.qualityPreset = preset; G.WINDOW_CHUNKS = s.chunkWindow; G.AMBIENT_MAX = s.particles;
  }
  var CUSTOM_400 = {viewDist: 400, chunkWindow: 5, particles: 25, resolution: 0.75};
  // Start for Level 1, the goal check's resetLevel for later levels; 3D, noon.
  function startClassic(lv, seed) {
    seedRandom(seed); quiet();
    G.CAVE_TEST_MODE = G.ENDLESS_MODE = false; G.terrain = 'ground'; G.MODE3D = true;
    if (lv === 1) G.startGame(); else G.resetLevel(lv);
    G.MODE3D = true; G.CAM_FOLLOW = true; G.settings.dayNight = true; G.dayTime = 0.5; G.daySpeed = 0; quiet();
    return G.viewDist;
  }
  function restartAt(lv, seed, s, preset) { commit(s, preset); return startClassic(lv, seed); }

  // ── The settings panel, as a player drives it ──
  function areaHit(a, x, y) { return x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h; }
  function layout() { G.drawSettingsOverlay(); return G._settingsClickAreas.slice(); }
  // A point of areas[idx] no earlier area claims (handleSettingsClick takes
  // the first area containing the click): at wantX when given, else nearest
  // the area's centre.
  function freePoint(areas, idx, wantX) {
    var a = areas[idx], best = null, xs = [];
    if (wantX !== undefined) xs.push(wantX); else for (var i = 0; i <= 40; i++) xs.push(a.x + a.w * i / 40);
    for (var yy = 0; yy <= 20; yy++) xs.forEach(function (px) {
      var py = a.y + a.h * yy / 20;
      for (var k = 0; k < idx; k++) if (areaHit(areas[k], px, py)) return;
      var score = Math.abs(px - (a.x + a.w / 2)) + Math.abs(py - (a.y + a.h / 2));
      if (!best || score < best.score) best = {x: px, y: py, score: score};
    });
    return best;
  }
  function click(match, valueOf) {
    var areas = layout(), idx = -1;
    for (var i = 0; i < areas.length; i++) if (match(areas[i])) { idx = i; break; }
    if (idx < 0) return 'no hit area';
    var p = freePoint(areas, idx, valueOf ? valueOf(areas[idx]) : undefined);
    if (!p) return 'hit area covered by earlier areas';
    H.fire(H.canvas, 'click', {clientX: p.x, clientY: p.y});
    return '';
  }
  // choice: a preset name, or a Render Distance slider value.
  function applyThroughPanel(choice) {
    var r = {choice: choice, why: ''}, preset = typeof choice === 'string';
    var want = preset ? P[choice] : {viewDist: choice, chunkWindow: G.settings.chunkWindow};
    H.fire(H.document, 'keydown', {key: 'o'});
    if (!(G.settingsOpen === true && G.pendingSettings.viewDist === G.settings.viewDist)) r.why = 'the O key did not open the panel';
    r.why = r.why || (preset ? click(function (a) { return a.action === 'preset' && a.value === choice; })
      : click(function (a) { return a.action === 'slider' && a.key === 'viewDist'; },
        function (a) { return a.trackX + a.trackW * (choice - a.min) / (a.max - a.min); }));
    if (!r.why && G.pendingSettings.viewDist !== want.viewDist) r.why = 'staged ' + G.pendingSettings.viewDist;
    r.why = r.why || click(function (a) { return a.action === 'apply'; });
    r.atApply = G.viewDist;
    r.rafs = H.flushRaf();
    r.viewDist = G.viewDist; r.setting = G.settings.viewDist; r.preset = G.qualityPreset; r.window = G.WINDOW_CHUNKS;
    if (!r.why && G.settingsOpen) r.why = 'the panel stayed open';
    if (!r.why && (r.setting !== want.viewDist || r.window !== want.chunkWindow || r.preset !== (preset ? choice : 'custom')))
      r.why = 'not committed';
    G.settingsOpen = false; quiet();
    return r;
  }

  // ── Level 4 floor quads at a fixed pose (one real renderFrame) ──
  var baseFov = G.GAME_CONFIG.player.baseFov, PI = Math.PI;
  var POSE = {x: 2160, y: 2400, ang: 3 * PI / 2, pitch: 0};   // level, north across the map from the south
  function floorQuads() {
    G.pos.x = POSE.x; G.pos.y = POSE.y; if (G.vel) { G.vel.x = 0; G.vel.y = 0; }
    G.settlePlayerAtSpawn(true);
    G.cam.ang = POSE.ang; G.cam.pitch = G.pos.pitch = POSE.pitch; G.dashFovPunch = 0; G.cam.fov = baseFov;
    var pass = G.drawLayersFloor3D, project = G.projectSceneWorldPolygon, m = G.floorMesh, gs = m.gridSize;
    var r = {keys: [], far: 0, passes: 0, errors: H.errors.length, inWall: G.isInGridWall(POSE.x, POSE.y, 8)};
    G.drawLayersFloor3D = function () {
      r.passes++;
      G.projectSceneWorldPolygon = function (vertices, C) {
        var gx = Math.round(vertices[0].x / gs), gy = Math.round(vertices[0].y / gs);
        r.keys.push(gy * m.w + gx);
        r.far = Math.max(r.far, Math.hypot((gx + 0.5) * gs - G.cam.x, (gy + 0.5) * gs - G.cam.y));
        return project(vertices, C);
      };
      try { return pass.apply(this, arguments); } finally { G.projectSceneWorldPolygon = project; }
    };
    try { G.renderFrame(); } finally { G.drawLayersFloor3D = pass; }
    r.errors = H.errors.slice(r.errors, r.errors + 2);
    r.far = Math.round(r.far);
    return r;
  }
  function same(a, b) {
    if (a.keys.length !== b.keys.length) return false;
    for (var i = 0; i < a.keys.length; i++) if (a.keys[i] !== b.keys[i]) return false;
    return true;
  }
  function brief(f) { return {quads: f.keys.length, farthest: f.far, passes: f.passes, errors: f.errors, inWall: f.inWall}; }

  // ── Level 4 (the Expanse) at Low, then Ultra and 400 applied mid-level ──
  var L1CFG = G.levels[0], L4CFG = G.levels[3], S4 = 9127 + 4, S1 = 9127 + 1;
  commit(P.low, 'low');
  var l4 = {start: startClassic(4, S4), world: [G.terrain, G.worldW, G.worldH]};
  var f0 = floorQuads(), f0b = floorQuads();
  var l4Ultra = applyThroughPanel('ultra'), fUltra = floorQuads();
  var l4Four = applyThroughPanel(400), fFour = floorQuads();
  var l4Restart = {ultra: restartAt(4, S4, P.ultra, 'ultra'), four: restartAt(4, S4, CUSTOM_400, 'custom')};

  // ── Level 1 at 400, then Ultra and 400 applied mid-level ──
  commit(CUSTOM_400, 'custom');
  var l1 = {start: startClassic(1, S1), world: [G.terrain, G.worldW, G.worldH]};
  var l1Ultra = applyThroughPanel('ultra');
  var l1Four = applyThroughPanel(400);
  var l1Restart = {ultra: restartAt(1, S1, P.ultra, 'ultra'), four: restartAt(1, S1, CUSTOM_400, 'custom')};

  // ── Endless at Medium, then Low, 400 and Ultra applied ──
  commit(P.medium, 'medium'); quiet();
  H.startEndless(899731); quiet();
  var en = {start: G.viewDist, world: [G.worldW, G.worldH], window: G.WINDOW_CHUNKS};
  var enLow = applyThroughPanel('low'), enFour = applyThroughPanel(400), enUltra = applyThroughPanel('ultra');

  var applies = [l4Ultra, l4Four, l1Ultra, l1Four, enLow, enFour, enUltra];
  check('setup: Level 4 (4320x2880 Expanse) starts at Low with 2304 u (0.8 x 2880) and Level 1 (1440x960) at 400 with 768 u (0.8 x 960)',
    L4CFG.w === 4320 && L4CFG.h === 2880 && l4.world.join() === 'expanse,4320,2880' && l4.start === 2304 &&
    L1CFG.w === 1440 && L1CFG.h === 960 && l1.world.join() === 'ground,1440,960' && l1.start === 768, {l4: l4, l1: l1});
  check('setup: every Apply went through the panel (O key, preset or slider click, Apply click) and committed its setting',
    applies.every(function (r) { return !r.why; }), applies.map(function (r) { return {choice: r.choice, why: r.why, setting: r.setting, preset: r.preset, window: r.window}; }));
  check('setup: the Level 4 pose sees ground beyond 2200 u (no farther than 2304 u), outside walls, with the same quads on two frames',
    f0.passes === 1 && !f0.errors.length && !f0.inWall && f0.far > 2200 && f0.far <= 2304 && same(f0, f0b), {first: brief(f0), second: brief(f0b)});
  check('setup: Endless starts at Medium (900 u) over a 5-chunk window whose 0.8 x shorter side (1920 u) exceeds Low and 400',
    en.start === 900 && en.window === 5 && en.world.join() === '2400,2400' && 0.8 * Math.min(en.world[0], en.world[1]) > 500, en);

  function vd(r) { return {choice: r.choice, atApply: r.atApply, viewDist: r.viewDist, setting: r.setting}; }
  check('Level 4 keeps its 2304 u view distance when Ultra (1800) or 400 is applied mid-level',
    l4Ultra.viewDist === 2304 && l4Four.viewDist === 2304, [vd(l4Ultra), vd(l4Four)]);
  check('Level 1 takes an applied setting above its 768 u floor (Ultra: 1800) and keeps the floor when 400 is applied',
    l1Ultra.viewDist === 1800 && l1Four.viewDist === 768, [vd(l1Ultra), vd(l1Four)]);
  check('applying settings mid-level gives each classic level the view distance a restart at the same settings gives',
    l4Ultra.viewDist === l4Restart.ultra && l4Four.viewDist === l4Restart.four &&
    l1Ultra.viewDist === l1Restart.ultra && l1Four.viewDist === l1Restart.four,
    {level4: {applied: [l4Ultra.viewDist, l4Four.viewDist], restart: l4Restart}, level1: {applied: [l1Ultra.viewDist, l1Four.viewDist], restart: l1Restart}});
  check('after Ultra or 400 is applied, Level 4 draws the same floor quads at the pose as before, ground beyond 1800 u included',
    same(fUltra, f0) && same(fFour, f0) && fUltra.far > 1800 && fFour.far > 1800,
    {before: brief(f0), afterUltra: brief(fUltra), after400: brief(fFour)});
  check('Endless views at the applied setting itself, at the Apply and after the window rebuild (Low 500, 400, Ultra 1800)',
    enLow.atApply === 500 && enLow.viewDist === 500 && enFour.atApply === 400 && enFour.viewDist === 400 &&
    enUltra.atApply === 1800 && enUltra.viewDist === 1800 && enUltra.rafs >= 1 && enUltra.window === 9,
    [vd(enLow), vd(enFour), vd(enUltra), {ultraRafs: enUltra.rafs}]);

  out('NOTE ' + JSON.stringify({level4: {start: l4.start, ultra: l4Ultra.viewDist, four: l4Four.viewDist, restart: l4Restart,
    quads: [f0.keys.length, fUltra.keys.length, fFour.keys.length], farthest: [f0.far, fUltra.far, fFour.far]},
    level1: {start: l1.start, ultra: l1Ultra.viewDist, four: l1Four.viewDist, restart: l1Restart},
    endless: {start: en.start, low: enLow.viewDist, four: enFour.viewDist, ultra: enUltra.viewDist}}));
  out('LEVEL_VIEW_DISTANCE_RESULT ' + (failed ? 'FAIL ' + failed : 'PASS ' + checked));
}());
