// Load-time contract for the shipped texture mapper (src/12-texture-mapping.js).
// The real MAIN manifest is evaluated in order under a counting stub host. The
// Python test runs it with and without the fragment and compares every host
// side effect, so "inert at load" is measured rather than assumed. This is not
// rendering or performance evidence.
//   --omit-mapping        skip the fragment (the comparison run)
//   --mapping-source P    evaluate file P in the fragment's slot (temp-copy mutants)
//   --no-control          skip the post-load catalog-build positive control
(function () {
  var G = (0, eval)('this');
  // The portable bootstrap's Node/Deno writer resolves console.log lazily;
  // keep a real stdout function before silencing production debug logs.
  var output = (__engine === 'node' || __engine === 'deno') ? console.log.bind(console) : __out;
  var MAPPING = 'src/12-texture-mapping.js';
  function option(name) { var i = __argv.indexOf(name); return i >= 0 ? __argv[i + 1] : null; }
  var omit = __argv.indexOf('--omit-mapping') >= 0, override = option('--mapping-source');
  var counts = {};
  function count(key) { counts[key] = (counts[key] || 0) + 1; }
  function snapshot() { var copy = {}; for (var k in counts) copy[k] = counts[k]; return copy; }
  function noop() {}
  // Unknown methods are counted under their owner so any load-time drawing,
  // DOM or context work shows up in the comparison.
  function stub(values, label) {
    return new Proxy(values || {}, {get: function (obj, key) {
      if (key === 'then') return undefined;
      if (key in obj) return obj[key];
      if (typeof key !== 'string') return undefined;
      return function () { count(label + '.' + key); };
    }});
  }
  function gradient() { count('ctx.gradient'); return {addColorStop: noop}; }
  function pixels(w, h) {
    // Opaque pixels, so a catalog built by a mutant (or the control) runs to
    // completion and is judged by its side effects, not by a crash.
    var data = new Uint8ClampedArray(w * h * 4);
    for (var i = 3; i < data.length; i += 4) data[i] = 255;
    return data;
  }
  var context = stub({
    measureText: function (s) { count('ctx.measureText'); return {width: String(s).length * 6}; },
    createLinearGradient: gradient, createRadialGradient: gradient,
    createPattern: function () { count('ctx.createPattern'); return {setTransform: noop}; },
    createImageData: function (w, h) { count('ctx.createImageData'); return {data: new Uint8ClampedArray(w * h * 4)}; },
    getImageData: function (x, y, w, h) { count('ctx.getImageData'); return {data: pixels(w, h)}; },
    putImageData: function () { count('ctx.putImageData'); }
  }, 'ctx');
  function canvas(counted) {
    if (counted) count('canvas.created');
    return stub({width: 360, height: 240, style: {},
      getContext: function () { count('canvas.getContext'); return context; },
      getBoundingClientRect: function () { return {left: 0, top: 0, width: this.width, height: this.height}; }}, 'canvas');
  }
  var elements = {maze: canvas(false)};
  function element(id) {
    count('document.getElementById');
    if (!elements[id]) elements[id] = stub({id: id, checked: false, value: '', textContent: '',
      style: {}, classList: stub({}, 'classList'), dataset: {}}, 'element');
    return elements[id];
  }
  G.window = G;
  G.document = stub({getElementById: element,
    createElement: function (tag) {
      count('document.createElement:' + tag);
      return tag === 'canvas' ? canvas(true) : stub({style: {}}, 'element');
    },
    querySelectorAll: function () { count('document.querySelectorAll'); return []; },
    querySelector: function () { count('document.querySelector'); return null; },
    body: stub({style: {}}, 'body'), documentElement: stub({style: {}}, 'documentElement')}, 'document');
  G.console = {log: noop, info: noop, warn: noop, error: function () { count('console.error'); }};
  G.setTimeout = G.setInterval = function () { count('timer'); return 1; };
  G.requestAnimationFrame = function () { count('requestAnimationFrame'); return 1; };
  G.clearTimeout = G.clearInterval = G.cancelAnimationFrame = noop;
  G.addEventListener = function () { count('addEventListener'); };
  G.removeEventListener = noop;
  G.innerWidth = 1280; G.innerHeight = 720; G.devicePixelRatio = 1;
  G.hw = {fetchJSON: function () { count('hw'); return new Promise(noop); },
    postFormText: function () { count('hw'); return new Promise(noop); }, _auth401: noop};
  // Deterministic clocks and random stream: the comparison is by count, and a
  // load-time loop that depended on a random value must not add noise.
  var seed = 0x2545f491;
  Math.random = function () { count('Math.random'); seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  var dateNow = Date.now;
  Date.now = function () { count('Date.now'); return 1700000000000 + (counts['Date.now'] || 0); };
  try {
    Object.defineProperty(G, 'performance', {configurable: true, writable: true,
      value: {now: function () { count('performance.now'); return counts['performance.now'] || 0; }}});
  } catch (error) { output('SETUP performance override failed: ' + error); }

  var manifest = JSON.parse(slurp('assets/games/manifest.json'));
  var main = manifest.parts.MAIN, loaded = 0, mappingSeen = false, loadError = null;
  var before = null, after = null, namesBefore = null, namesAfter = null;
  for (var i = 0; i < main.length && !loadError; i++) {
    var path = main[i], isMapping = path === MAPPING;
    if (isMapping) {
      mappingSeen = true;
      if (omit) continue;
      before = snapshot(); namesBefore = Object.getOwnPropertyNames(G);
    }
    try {
      (0, eval)(slurp(isMapping && override ? override : 'assets/games/' + path));
      loaded++;
    } catch (error) {
      // One classic script: a throwing fragment stops everything after it.
      loadError = path + ': ' + (error && error.message || error);
    }
    if (isMapping) { after = snapshot(); namesAfter = Object.getOwnPropertyNames(G); }
  }
  output('LOADED ' + loaded + ' of ' + main.length + ' mapping=' + (omit ? 'omitted' : override ? 'override' : 'shipped'));
  if (!mappingSeen) output('SETUP manifest does not list ' + MAPPING);
  if (loadError) output('LOAD_ERROR ' + loadError);
  Object.keys(counts).sort().forEach(function (key) { output('COUNT ' + key + ' ' + counts[key]); });
  if (before && after) {
    var total = 0;
    Object.keys(after).sort().forEach(function (key) {
      var delta = after[key] - (before[key] || 0);
      if (delta) { total += delta; output('FRAGMENT_DELTA ' + key + ' ' + delta); }
    });
    output('FRAGMENT_DELTA_TOTAL ' + total);
    var known = {};
    namesBefore.forEach(function (name) { known[name] = true; });
    output('FRAGMENT_GLOBALS ' + namesAfter.filter(function (name) { return !known[name]; }).sort().join(','));
  }
  output('TEXTURE_PILOT ' + typeof G.TexturePilot);
  if (G.TexturePilot && typeof G.TexturePilot === 'object') {
    output('API ' + Object.keys(G.TexturePilot).sort().join(','));
  }
  // Positive control: prove this host observes a real catalog build. Run
  // after every load-time measurement so it cannot contaminate them.
  if (!omit && !loadError && __argv.indexOf('--no-control') < 0 && G.TexturePilot) {
    var canvasesBefore = counts['canvas.created'] || 0;
    try {
      var catalog = G.TexturePilot.createCatalog(64);
      output('CONTROL_CANVASES ' + ((counts['canvas.created'] || 0) - canvasesBefore) +
        ' materials=' + Object.keys(catalog.materials).length);
    } catch (error) {
      output('CONTROL_ERROR ' + (error && error.message || error));
    }
  }
  Date.now = dateNow;
  output('TEXTURE_FRAGMENT_LOAD_RESULT DONE');
})();
undefined;
