// Shared headless host for the render-feature, render-parity and landmark
// finder harnesses. It supplies browser APIs only: a small DOM whose listeners
// really run, a 2D context that keeps save/restore state and can record every
// call and state set, a manual requestAnimationFrame queue, and deterministic
// clocks. Game behaviour comes from the real MAIN manifest. Not a rasterizer:
// recorded calls are evidence of drawing commands, not of final pixels.
// Usage: (0,eval)(slurp('tools/game/tests/render_host.js')); var H = createRenderTestHost();
function createRenderTestHost(options) {
  options = options || {};
  var G = (0, eval)('this');
  var output = (__engine === 'node' || __engine === 'deno') ? console.log.bind(console) : __out;
  function noop() {}
  var errors = [], rafQueue = [], docListeners = {}, winListeners = {}, contexts = [], tokens = 0;
  var recorder = null, counter = null;

  // ── Recording hash: two 32-bit FNV-1a lanes over every serialized entry ──
  function Recorder(keep) { this.h1 = 0x811c9dc5; this.h2 = 0x01000193 ^ 0x5bd1e995; this.entries = 0; this.counts = {}; this.sample = []; this.all = keep ? [] : null; }
  Recorder.prototype.add = function (text, method) {
    var h1 = this.h1, h2 = this.h2;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = Math.imul(h2 ^ c, 0x01000193) ^ (h2 >>> 13);
    }
    h1 = Math.imul(h1 ^ 10, 0x01000193); h2 = Math.imul(h2 ^ 10, 0x01000193);
    this.h1 = h1; this.h2 = h2; this.entries++;
    this.counts[method] = (this.counts[method] || 0) + 1;
    if (this.sample.length < 40) this.sample.push(text);
    if (this.all) this.all.push(text);
  };
  Recorder.prototype.hash = function () {
    function hex(v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }
    return hex(this.h1) + hex(this.h2);
  };
  function ser(v) {
    if (typeof v === 'number') {
      if (!isFinite(v)) return String(v);
      var r = Math.round(v * 1000) / 1000;
      return String(r === 0 ? 0 : r);
    }
    if (typeof v === 'string') return JSON.stringify(v);
    if (v === null || v === undefined || typeof v === 'boolean') return String(v);
    if (v && v.__token) return v.__token;
    if (Array.isArray(v) || (v && typeof v.length === 'number' && typeof v !== 'function' && v.BYTES_PER_ELEMENT)) {
      var parts = [];
      for (var i = 0; i < v.length && i < 64; i++) parts.push(ser(v[i]));
      return '[' + parts.join(',') + ']';
    }
    return typeof v;
  }
  function record(owner, name, args) {
    if (counter) counter.calls++;
    if (!recorder) return;
    var parts = [];
    for (var i = 0; i < args.length; i++) parts.push(ser(args[i]));
    recorder.add(owner + '.' + name + '(' + parts.join(',') + ')', name);
  }

  // ── Stateful 2D context ──
  var STATE = {fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, lineWidth: 1, font: '10px sans-serif',
    textAlign: 'start', textBaseline: 'alphabetic', globalCompositeOperation: 'source-over', lineCap: 'butt',
    lineJoin: 'miter', miterLimit: 10, shadowBlur: 0, shadowColor: 'rgba(0, 0, 0, 0)', shadowOffsetX: 0,
    shadowOffsetY: 0, imageSmoothingEnabled: true, imageSmoothingQuality: 'low', filter: 'none',
    lineDashOffset: 0, direction: 'ltr', letterSpacing: '0px'};
  function makeContext(canvasObj) {
    var id = 'c' + contexts.length, state = Object.assign({}, STATE), stack = [], cache = {};
    function paint(kind) {
      return function () {
        var token = {__token: kind + '#' + (++tokens)};
        token.addColorStop = function () { record(token.__token, 'addColorStop', arguments); };
        token.setTransform = function () { record(token.__token, 'setTransform', arguments); };
        return token;
      };
    }
    var methods = {
      save: function () { stack.push(Object.assign({}, state)); },
      restore: function () { if (stack.length) state = stack.pop(); },
      measureText: function (s) { return {width: String(s).length * 6, actualBoundingBoxAscent: 7, actualBoundingBoxDescent: 2}; },
      createLinearGradient: paint('lin'), createRadialGradient: paint('rad'), createConicGradient: paint('con'),
      createPattern: paint('pat'),
      getImageData: function (x, y, w, h) { return {width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4))}; },
      createImageData: function (w, h) { return {width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4))}; },
      getTransform: function () { return {a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, is2D: true, isIdentity: true}; },
      isPointInPath: function () { return false; }, getLineDash: function () { return []; }
    };
    var context = new Proxy({}, {
      get: function (o, key) {
        if (key === 'canvas') return canvasObj;
        if (key === 'then' || typeof key === 'symbol') return undefined;
        if (Object.prototype.hasOwnProperty.call(state, key)) return state[key];
        if (!cache[key]) {
          var impl = methods[key];
          cache[key] = function () { record(id, key, arguments); return impl ? impl.apply(null, arguments) : undefined; };
        }
        return cache[key];
      },
      set: function (o, key, value) {
        state[key] = value;
        if (recorder) recorder.add(id + '.' + String(key) + '=' + ser(value), 'set:' + String(key));
        return true;
      }
    });
    contexts.push(context);
    return context;
  }

  // ── Minimal DOM whose listeners run ──
  function Element(tag, id) {
    this.tagName = String(tag).toUpperCase(); this.id = id || ''; this.children = []; this.parentNode = null;
    this.style = {}; this.listeners = {}; this._text = ''; this.value = ''; this.checked = false; this.disabled = false;
    this.className = ''; this.title = ''; this.dataset = {}; this.type = ''; this.width = 360; this.height = 240;
    this._context = null;
    this.classList = {add: noop, remove: noop, toggle: noop, contains: function () { return false; }};
  }
  Object.defineProperty(Element.prototype, 'textContent', {
    get: function () { return this._text + this.children.map(function (c) { return c.textContent; }).join(''); },
    set: function (v) { this.children.forEach(function (c) { c.parentNode = null; }); this.children = []; this._text = String(v); }
  });
  Element.prototype.appendChild = function (child) { if (child) { child.parentNode = this; this.children.push(child); } return child; };
  Element.prototype.addEventListener = function (type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); };
  Element.prototype.removeEventListener = noop;
  Element.prototype.setAttribute = function (k, v) { this['attr:' + k] = String(v); };
  Element.prototype.getAttribute = function (k) { return this['attr:' + k] || null; };
  Element.prototype.contains = function (node) { for (; node; node = node.parentNode) if (node === this) return true; return false; };
  Element.prototype.closest = function (selector) {
    var tags = String(selector).split(',').map(function (s) { return s.trim().toUpperCase(); });
    for (var node = this; node; node = node.parentNode) if (tags.indexOf(node.tagName) >= 0) return node;
    return null;
  };
  Element.prototype.focus = noop; Element.prototype.blur = noop; Element.prototype.click = function () { fire(this, 'click'); };
  Element.prototype.getBoundingClientRect = function () { return {left: 0, top: 0, width: this.width, height: this.height}; };
  Element.prototype.getContext = function () { return this._context || (this._context = makeContext(this)); };
  Element.prototype.requestFullscreen = function () { return new Promise(noop); };
  Element.prototype.requestPointerLock = noop;
  function wrap(element) {
    return new Proxy(element, {get: function (o, key) {
      if (key === 'then') return undefined;
      if (key in o) return o[key];
      return typeof key === 'string' ? noop : undefined;
    }});
  }
  // Element tags, input types and initial checked state come from page.html,
  // so page-control guards see the real markup. Unknown ids are divs.
  var root = options.sourceRoot || 'assets/games/';
  var markup = {}, html = slurp(root + 'page.html'), tagPattern = /<(\w+)\b([^>]*)>/g, m;
  while ((m = tagPattern.exec(html))) {
    var idMatch = /\sid=['"]([^'"]+)['"]/.exec(m[2]);
    if (!idMatch) continue;
    var typeMatch = /\stype=['"]([^'"]+)['"]/.exec(m[2]);
    markup[idMatch[1]] = {tag: m[1], type: typeMatch ? typeMatch[1] : '', checked: /\schecked\b/.test(m[2])};
  }
  var byId = {};
  function create(tag, id) { var e = wrap(new Element(tag, id)); if (id) byId[id] = e; return e; }
  var canvas = create('canvas', 'maze');
  function element(id) {
    if (byId[id]) return byId[id];
    var spec = markup[id] || {tag: 'div', type: '', checked: false}, e = create(spec.tag, id);
    e.type = spec.type; e.checked = spec.checked;
    return e;
  }
  var documentObj = {
    getElementById: element, createElement: function (tag) { return create(tag); },
    createTextNode: function (text) { var e = create('#text'); e._text = String(text); return e; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    addEventListener: function (type, fn) { (docListeners[type] || (docListeners[type] = [])).push(fn); },
    removeEventListener: noop, exitPointerLock: noop, exitFullscreen: function () { return new Promise(noop); },
    fullscreenElement: null, pointerLockElement: null, hidden: false, readyState: 'complete',
    tagName: undefined, nodeName: '#document', isContentEditable: false, closest: undefined
  };
  documentObj.body = create('body'); documentObj.documentElement = create('html');
  var doc = new Proxy(documentObj, {get: function (o, key) {
    if (key === 'then') return undefined;
    if (key in o) return o[key];
    return typeof key === 'string' ? noop : undefined;
  }});
  function fire(target, type, props) {
    var event = Object.assign({type: type, target: target, key: '', repeat: false, ctrlKey: false, metaKey: false,
      altKey: false, shiftKey: false, button: 0, defaultPrevented: false}, props || {});
    event.preventDefault = function () { event.defaultPrevented = true; };
    event.stopPropagation = event.stopImmediatePropagation = noop;
    var list = target === doc ? docListeners[type] : target && target.listeners && target.listeners[type];
    (list || []).slice().forEach(function (fn) { fn.call(target, event); });
    return event;
  }

  // ── Globals ──
  G.window = G; G.document = doc; G.screen = {width: 1920, height: 1080};
  G.console = {log: noop, info: noop, warn: noop, error: function () { errors.push(Array.prototype.join.call(arguments, ' ')); }};
  G.setTimeout = G.setInterval = function () { return 1; };
  G.clearTimeout = G.clearInterval = noop;
  G.requestAnimationFrame = function (fn) { rafQueue.push(fn); return rafQueue.length; };
  G.cancelAnimationFrame = noop;
  G.addEventListener = function (type, fn) { (winListeners[type] || (winListeners[type] = [])).push(fn); };
  G.removeEventListener = noop;
  G.innerWidth = 1280; G.innerHeight = 720; G.devicePixelRatio = 1;
  G.hw = {fetchJSON: function () { return new Promise(noop); }, postFormText: function () { return new Promise(noop); }, _auth401: noop};
  // Deterministic clocks and random stream; counts Math.random draws.
  var clock = {now: 1700000000000, perf: 0, randomCalls: 0, seed: 0x2545f491};
  Date.now = function () { return clock.now; };
  try {
    Object.defineProperty(G, 'performance', {configurable: true, writable: true,
      value: {now: function () { clock.perf += 0.001; return clock.perf; }}});
  } catch (e) { output('SETUP performance override failed: ' + e); }
  Math.random = function () {
    clock.randomCalls++;
    clock.seed = (Math.imul(clock.seed, 1664525) + 1013904223) >>> 0;
    return clock.seed / 4294967296;
  };

  function loadManifest(mutate, beforeEach) {
    var manifest = JSON.parse(slurp(root + 'manifest.json'));
    manifest.parts.MAIN.forEach(function (path) {
      if (beforeEach) beforeEach(path);
      var source = slurp(root + path);
      (0, eval)(mutate ? mutate(path, source) : source);
    });
    return manifest.parts.MAIN.length;
  }
  function flushRaf(limit) {
    var n = 0;
    while (rafQueue.length && n < (limit || 1000)) { var fn = rafQueue.shift(); fn(clock.perf); n++; }
    return n;
  }
  // WORLD_SEED = floor(random * 999999) + 1: one steered draw lands on `seed`
  // (the reimplemented _game_env.js startEndless rule).
  function startEndless(seed) {
    var target = (seed - 0.5) / 999999, restore = Math.random, used = false;
    Math.random = function () { if (!used) { used = true; return target; } return restore(); };
    G.CAVE_TEST_MODE = false; G.ENDLESS_MODE = true; G.gameOverState = false; G.running = true;
    G.health = G.HEALTH_MAX; G.mana = G.MANA_MAX;
    try { G.resetEndlessMode(); } finally { Math.random = restore; }
    if (G.WORLD_SEED !== seed) throw Error('SETUP startEndless wanted seed ' + seed + ', got ' + G.WORLD_SEED);
    settle();
    return G.WORLD_SEED;
  }
  function startCaveTest(seed, flags) {
    G._caveTestSeedOverride = seed; G._caveTestKindOverride = 'descending';
    Object.keys(G.caveTestFlags).forEach(function (k) { G.caveTestFlags[k] = !!(flags && flags[k]); });
    G.CAVE_TEST_MODE = true; G.ENDLESS_MODE = true; G.gameOverState = false; G.running = true; G.terrain = 'plains';
    G.resetEndlessMode();
    settle();
    return G.WORLD_SEED;
  }
  function settle() {
    G.MODE3D = true; G.overviewActive = false; G.calibrating = false; G.hasBaseline = true; G.menuOpen = false;
    G.settingsOpen = G.shopOpen = G.inventoryOpen = G.forgeOpen = false;
    G.USE_KEYBOARD = G.USE_MOUSE = true; G.USE_GAMEPAD = false; G.CAM_FOLLOW = true;
    G.dayTime = 0.5; G.daySpeed = 0; G.settings.dayNight = true;
    G.kbState.up = G.kbState.down = G.kbState.left = G.kbState.right = false;
  }
  return {G: G, output: output, errors: errors, canvas: canvas, document: doc, element: element, byId: byId,
    docListeners: docListeners, winListeners: winListeners, fire: fire, flushRaf: flushRaf, rafQueue: rafQueue,
    clock: clock, loadManifest: loadManifest, startEndless: startEndless, startCaveTest: startCaveTest, settle: settle,
    create: create, markup: markup,
    record: function (on, keep) { var r = recorder; recorder = on ? new Recorder(keep) : null; tokens = 0; return r; },
    count: function (on) { var c = counter; counter = on ? {calls: 0} : null; return c; },
    recorder: function () { return recorder; }};
}
