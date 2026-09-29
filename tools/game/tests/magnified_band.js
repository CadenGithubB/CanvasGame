// The magnified-band motion case (integration stage L, prop textures):
// StructureMotion.runMagnified in tools/game/structure-motion.js, headless.
// The case itself is a native browser check (/structures.html, real Canvas);
// this contract drives it through stand-in hooks to prove the fixture and
// its wiring: chest dimensions equal the game's CHEST_MODEL_DIMS (read from
// src/12-prop-models.js as text), the band covers 20-90 units with the
// texel footprint crossing from magnified to minified, every case finds a
// fully visible ROI, an exact renderer (pixels from the analytic
// coverage oracle, depth from the ray/plane hit) passes with its controls,
// and wrong-scale or frozen renderers do not. Projection for the footprint
// is written out here from the study camera (focal w / (2 tan(fov/2)),
// y-shear pitch), not taken from planeFor.
// Mutations (evaluated copies; each anchor must match exactly once):
//   --wrong-panel-scale   the study chest uses uvScale 32
//   --no-magnified-front  the front cases start at 62 units (the old floor)
//   --roi-default         the chest cases ignore their ROI sizes (64 x 32)
(function () {
  var G = (0, eval)('this'), checked = 0, failed = 0;
  var out = (__engine === 'node' || __engine === 'deno') ? console.log.bind(console) : __out;
  function check(name, okay, detail) { checked++; if (!okay) failed++; out((okay ? 'PASS ' : 'FAIL ') + name + (okay ? '' : ' ' + JSON.stringify(detail))); }
  function mutate(source, flag, before, after) {
    if (__argv.indexOf(flag) < 0) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + flag);
    return source.replace(before, after);
  }
  // Stand-in canvas: records fills so the stand-in renderer knows the band.
  function Canvas() { this.width = 0; this.height = 0; this.rects = []; }
  Canvas.prototype.getContext = function () {
    var canvas = this;
    return {fillStyle: '#000000', fillRect: function (x, y, w, h) { canvas.rects.push({style: this.fillStyle, x: x, y: y, w: w, h: h}); }};
  };
  G.document = {createElement: function () { return new Canvas(); }};
  G.TexturePilot = {prepareMaterial: function () {}};
  (0, eval)(slurp('tools/game/texture-temporal.js'));
  (0, eval)(slurp('tools/game/structure-temporal.js'));
  var source = slurp('tools/game/structure-motion.js');
  source = mutate(source, '--wrong-panel-scale', 'var CHEST_PANEL=Object.freeze({hw:7,hd:5,bodyH:8,lidH:3,uvScale:14});',
    'var CHEST_PANEL=Object.freeze({hw:7,hd:5,bodyH:8,lidH:3,uvScale:32});');
  source = mutate(source, '--no-magnified-front', 'var MAGNIFIED_FRONT=Object.freeze([[20,64,32],[30,64,32],[45,48,24],[62,32,16],[90,24,12]]);',
    'var MAGNIFIED_FRONT=Object.freeze([[62,32,16],[70,32,16],[80,32,16],[85,24,12],[90,24,12]]);');
  source = mutate(source, '--roi-default', 'fixture.roiSize?fixture.roiSize[0]:', '');
  (0, eval)(source);
  var M = G.StructureMotion, T = G.StructureTemporal, W = 360, H = 240, F = W / (2 * Math.tan(Math.PI / 5));

  // ── The game's chest dimensions, read from the shipping source as text ──
  var props = slurp('assets/games/src/12-prop-models.js');
  var dims = /var CHEST_MODEL_DIMS = Object\.freeze\(\{([^}]*)\}\);/.exec(props), game = {};
  if (dims) dims[1].split(',').forEach(function (kv) { var p = kv.split(':'); game[p[0].trim()] = +p[1]; });
  var P = M.CHEST_PANEL, fixtures = M.magnifiedFixtures();
  var front = fixtures.filter(function (f) { return f.kind === 'chest-front'; }), lid = fixtures.filter(function (f) { return f.kind === 'chest-lid'; });
  var frontD = front.map(function (f) { return f.distance; }), lidD = lid.map(function (f) { return f.distance; });
  check('fixture: the study chest is the game\'s CHEST_MODEL_DIMS (half 7 x 5, body 8, lid 3, uvScale 14) and the front cases span 20 to 90 units, the lid cases 45 to 90',
    !!dims && ['hw', 'hd', 'bodyH', 'lidH', 'uvScale'].every(function (k) { return P[k] === game[k]; }) &&
    Math.min.apply(null, frontD) === 20 && Math.max.apply(null, frontD) === 90 && Math.min.apply(null, lidD) === 45 && Math.max.apply(null, lidD) === 90,
    {panel: P, game: game, front: frontD, lid: lidD});

  // ── Camera and footprint from the study camera, written out ──
  function screen(p, cam) {
    var co = Math.cos(cam.ang), si = Math.sin(cam.ang), oz = 60 + (cam.z - 60) * 25 / 40, horizon = Math.floor(H / 2) + Math.floor(-cam.pitch * F);
    var dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - oz, t = dx * co + dy * si, lat = -dx * si + dy * co;
    return {x: W / 2 + F * lat / t, y: horizon - F * dz / t, depth: t};
  }
  var cams = fixtures.map(function (f) {
    var face = M.chestModel(f.kind).faces[0], cam = M.chestCamera(face, f);
    var pts = face.vertices.map(function (v) { return screen(v, cam); });
    var width = Math.max.apply(null, pts.map(function (q) { return q.x; })) - Math.min.apply(null, pts.map(function (q) { return q.x; }));
    var cz = face.vertices.reduce(function (s, v) { return s + v.z; }, 0) / face.vertices.length;
    return {id: f.id, eye: 60 + (cam.z - 60) * 25 / 40, pitch: cam.pitch, cz: cz, width: width, texel: width / 128};
  });
  var bad = cams.filter(function (c) {
    return /front/.test(c.id) ? !(Math.abs(c.eye - c.cz) < 1e-9 && c.pitch === 0) : !(Math.abs(c.eye - 60) < 1e-9 && c.pitch > 0 && c.pitch <= 1.4);
  });
  check('camera: the front is seen level from its mid height; the lid from the standing eye (cameraZ 60) looking down within CAM_PITCH_MAX 1.4',
    bad.length === 0, bad);
  var nearest = cams[0], farthest = cams.filter(function (c) { return c.id === 'chest-front-90'; })[0];
  check('footprint: at 20 units a 128 px texel spans more than 1.2 screen pixels (magnified); at 90 units under 0.4 (minified)',
    nearest.id === 'chest-front-20' && nearest.texel > 1.2 && farthest.texel < 0.4, {nearest: nearest, farthest: farthest});

  // ── Stand-in hooks: an exact renderer from the oracle, and faulty ones ──
  function bandAxis(material) {
    var dark = material.source.rects.filter(function (r) { return r.style === '#000000'; })[0];
    if (!dark) return null;   // the uniform control
    return dark.w < dark.h ? 'u' : 'v';
  }
  function scaled(face, k) { return {vertices: face.vertices.map(function (v) { return {x: v.x, y: v.y, z: v.z, u: v.u * k, v: v.v * k}; })}; }
  function hooks(variant) {
    var frozen = null;
    return {
      next: function () { return Promise.resolve(); }, cancelled: function () { return false; }, progress: function () {},
      rayDepth: function (m, pos, x, y, w, h) {
        var hit = M.hit(M.planeFor(m.faces[0], pos, 'u', w, h), x + 0.5, y + 0.5, true);
        return hit ? hit.depth : Infinity;
      },
      capture: function (target, camera, model, options) {
        var face = options.diagnostic.targetFace, axis = bandAxis(options.diagnostic.material);
        if (variant === 'frozen' && (!frozen || frozen.face !== face)) frozen = {face: face, camera: camera};
        var cam = variant === 'frozen' ? frozen.camera : camera;
        var shade = variant === 'wrong-scale' ? scaled(face, P.uvScale / 32) : face;
        var plane = M.planeFor(face, cam, 'u', W, H), band = axis ? M.planeFor(shade, cam, axis, W, H) : null;
        var pixels = new Uint8ClampedArray(W * H * 4), depth = new Float32Array(W * H);
        var pts = face.vertices.map(function (v) { return screen(v, cam); });
        var x0 = Math.max(0, Math.floor(Math.min.apply(null, pts.map(function (q) { return q.x; }))) - 1);
        var x1 = Math.min(W - 1, Math.ceil(Math.max.apply(null, pts.map(function (q) { return q.x; }))) + 1);
        var y0 = Math.max(0, Math.floor(Math.min.apply(null, pts.map(function (q) { return q.y; }))) - 1);
        var y1 = Math.min(H - 1, Math.ceil(Math.max.apply(null, pts.map(function (q) { return q.y; }))) + 1);
        for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
          var hit = M.hit(plane, x + 0.5, y + 0.5, true);
          if (!hit) continue;
          var i = y * W + x, value = band ? 1 - T.coverage(x, y, band) : 1;
          depth[i] = 1 / hit.depth;
          pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = Math.round(value * 255); pixels[i * 4 + 3] = 255;
        }
        var work = {triangles: 2, strips: 0, patternFills: 1, cappedFaces: 0, fallbackFaces: 0, failedDraws: 0};
        work.targetWork = {triangles: 2, strips: 0, patternFills: 1, cappedFaces: 0, fallbackFaces: 0};
        return {work: work, pixels: pixels, depth: depth};
      }
    };
  }
  var reports = {};
  ['exact', 'wrong-scale', 'frozen'].forEach(function (variant) {
    M.runMagnified(hooks(variant)).then(function (r) { reports[variant] = r; }, function (e) { reports[variant] = {status: 'THREW', error: String(e)}; });
  });
  // jsc drains promise jobs when the top-level script ends; report then.
  Promise.resolve().then(function () { return new Promise(function (resolve) { var n = 0; (function wait() { if (Object.keys(reports).length === 3 || ++n > 1e5) resolve(); else Promise.resolve().then(wait); })(); }); })
    .then(function () {
      var exact = reports.exact || {}, wrong = reports['wrong-scale'] || {}, frozen = reports.frozen || {};
      function brief(r) { return {status: r.status, cases: r.cases && r.cases.length, passed: r.passed, setup: (r.setupFailures || []).slice(0, 3),
        temporal: (r.temporalFailures || []).length, spatial: (r.spatialFailures || []).length, controls: (r.controls || []).map(function (c) { return c.id + ':' + c.pass; })}; }
      out('NOTE magnified exact ' + JSON.stringify(brief(exact)));
      out('NOTE magnified ROIs ' + JSON.stringify((exact.cases || []).filter(function (c) { return /-128-/.test(c.id); }).map(function (c) { return c.id + ' ' + c.roi.width + 'x' + c.roi.height + ' ' + c.screenPixelsPerTexel; })));
      check('exact renderer: all 16 cases (5 front + 3 lid distances x tiles 64 and 128, triangles) find a fully visible ROI and PASS, with the stationary and uniform controls passing',
        exact.status === 'PASS' && exact.complete === true && exact.cases.length === 16 && exact.expectedCases === 16 && exact.passed === 16 &&
        exact.controls.length === 2 && exact.controls.every(function (c) { return c.pass === true; }) &&
        exact.cases.every(function (c) { return c.mapping === 'triangles' && c.analysis.valid && c.analysis.actualMotionRms > 0; }), brief(exact));
      check('wrong tile length (a 32-unit tile on the 14-unit chest): every valid case is a spatial quality failure, status QUALITY_FAILURE',
        wrong.status === 'QUALITY_FAILURE' && wrong.spatialFailures.length >= 12, brief(wrong));
      check('frozen renderer (ignores the camera walk): the report is not PASS', frozen.status !== 'PASS' && !!frozen.status, brief(frozen));
      var threw = '';
      try { M.pageHooks(); } catch (e) { threw = e.message; }
      // Restated at the flip: pageHooks said it served a console run on
      // /structures.html, but that page closes over render, rayDepth and
      // next, so it throws there too; its message now names the page's
      // 'Test prop magnified band' button, which builds the hooks itself.
      check('pageHooks refuses to run without global render/rayDepth/next and names the /structures.html button',
        /structures\.html/.test(threw) && /Test prop magnified band button/.test(threw), threw);
      out('MAGNIFIED_BAND_RESULT ' + (failed ? 'FAIL ' + failed + '/' : 'PASS ') + checked);
    });
}());
undefined;
