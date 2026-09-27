// _game_env.js -- headless host for the Endless crawler in WebPage_Games.h.
//
// A game harness loads this file, then the game, then drives the game's OWN
// functions (resetEndlessMode, gameUpdate, step, getWalkableLayerTopAt, the draw
// passes). Nothing here re-implements game logic: a replica would only ever
// prove the replica works. The audit behind this package found exactly that
// failure in the game's in-page debug tools -- caveGaps() re-derives the value it
// then "checks", so it reports a gap of 0 by construction.
//
// HOW IT IS LOADED
//   js_engine.run_js() concatenates _bootstrap.js + the harness into one file.
//   The harness then does:
//
//       (0, eval)(slurp("tools/webui/harness/_game_env.js"));
//       LAB.init(__out, slurp, __engine, __argv);
//       LAB.load(__argv[0]);          // the extracted, line-padded game JS
//
//   Indirect eval runs the text as a SLOPPY GLOBAL SCRIPT on every engine, so
//   the game's ~2,000 top-level `var`s and functions become properties of the
//   global object and the harness can read and assign them by bare name -- even
//   under deno, where the harness itself is an ES module. The game has no
//   top-level let/const (they would be scoped to the eval and invisible).
//
//   LAB.init is not optional. Under deno the bootstrap's __out and slurp are
//   MODULE-scoped: code evaluated through indirect eval (this file, the game)
//   cannot see them, so they are handed in. And on deno __out IS console.log,
//   which this file replaces to keep the game's ~150 log calls off stdout -- so
//   init swaps in the ORIGINAL console.log, captured before patching.
//
//   Harness code must therefore never call __out or console.log itself: use
//   LAB.check / LAB.metric / LAB.note, which always reach real stdout.
//
// WHAT IS STUBBED, AND WHY EACH ONE MATTERS
//   - document / canvas / 2D context: Proxy stubs. Every canvas call is a no-op
//     unless a recorder is installed (LAB.useRecorder), which captures each
//     fill() with its fillStyle and path -- that is how render checks count
//     which geometry a pass actually submitted.
//   - setTimeout / setInterval / requestAnimationFrame: CAPTURED, never run by
//     the engine. On deno the real ones would keep the process alive (the game
//     starts a 16 ms gamepad interval) or fire after the verdict was printed.
//     LAB.runTimers() / LAB.flushRaf() run them on purpose.
//   - Date.now / performance.now: a VIRTUAL clock. Enemy AI is gated on wall
//     time (80 ms per decision, WebPage_Games.h:11405), so with a real clock the
//     same test moves enemies differently on a fast and a slow machine.
//     LAB.realNow() is the real clock, for performance metrics only.
//   - Math.random: a seeded PRNG (mulberry32). Normal Endless picks WORLD_SEED
//     from Math.random (WebPage_Games.h:7522); LAB.startEndless(seed) steers
//     that one call to hit an exact seed.
//   - hw.*: promises that never settle. Keyboard/mouse Endless makes no requests.
//
// COORDINATES -- the single most common way to write a wrong check here:
//   pos, cam, enemies, chests, deepCaveEntrances, floorMesh indices are all
//   WINDOW-LOCAL. endlessCaveNetworks[...] (corridors, chambers, entrances) is
//   WORLD. world = local + windowOrigin{X,Y}. The window re-centres whenever the
//   player crosses a chunk line (assembleWindow), which rebases pos -- so cache
//   WORLD coordinates across ticks and convert at the point of use.
//
// HEIGHT UNITS
//   mesh layer Z ("h") is the unit of floorMesh.lNTopZ. Physics Z is
//   pos.floorZ = 60 + 40*h (WebPage_Games.h:10148). Render Z is 25*h. The
//   camera eye sits at pos.floorZ, i.e. EYE_H = 0 above the feet in physics
//   terms, but projection uses cameraZ = 60 + 25*(cam.z-60)/40 (line 454).
//   LAB.EYE_H (2.4 h) is the eye height the audit used for headroom checks.
//
// Every harness must end with a bare `undefined;` (see _bootstrap.js, JXA).

var LAB = (function () {
    var G = (0, eval)("this");
    var L = {};

    // ── stdout + clocks, captured BEFORE anything is patched ─────────────────
    var _origLog = (typeof console !== "undefined" && console.log) ? console.log.bind(console) : null;
    L.realOut = function (s) { if (_origLog) _origLog(String(s)); };
    var _realPerf = (typeof performance !== "undefined" && performance.now) ? performance.now.bind(performance) : null;
    var _realDateNow = Date.now;
    L.realNow = _realPerf ? function () { return _realPerf(); } : function () { return _realDateNow.call(Date); };

    // Filled by init(): the bootstrap's helpers, which this file cannot reach
    // by name on an ES-module engine.
    L.out = function (s) { L.realOut(s); };
    var _slurp = null;
    L.init = function (out, slurpFn, engine, argv) {
        L.out = (engine === "deno" || engine === "node" || !out) ? L.realOut : out;
        _slurp = slurpFn;
        L.engine = engine;
        L.argv = argv || [];
    };
    // Command-line options after the game path: `--seeds 1,2,3`, `--quick`.
    L.opt = function (name, dflt) {
        var i = L.argv.indexOf("--" + name);
        if (i < 0) return dflt;
        var v = L.argv[i + 1];
        return (v === undefined || v.indexOf("--") === 0) ? true : v;
    };
    // Seeds for a multi-seed check. ONE convention for every suite:
    //   --seeds a,b          Cave Test worlds      LAB.seeds([12345, ...])
    //   --endless-seeds a,b  normal Endless worlds LAB.seeds([424242, ...], "endless-seeds")
    L.seeds = function (defaults, name) {
        var s = L.opt(name || "seeds", null);
        if (!s || s === true) return defaults;
        return String(s).split(",").map(function (x) { return parseInt(x, 10); }).filter(function (x) { return x > 0; });
    };

    L.EYE_H = 2.4;
    L.FIXED_DT = 1 / 60;
    L.FRAME_MS = 1000 / 60;

    // ── virtual clock ─────────────────────────────────────────────────────────
    L.clock = 1700000000000;
    Date.now = function () { return L.clock; };
    var _perfStub = { now: function () { return L.clock - 1700000000000; } };
    try { Object.defineProperty(G, "performance", { value: _perfStub, configurable: true, writable: true }); }
    catch (e) { G.performance = _perfStub; }
    L.advance = function (ms) { L.clock += ms; };

    // ── seeded Math.random ────────────────────────────────────────────────────
    var _rs = 1;
    function mulberry32() {
        _rs = (_rs + 0x6D2B79F5) | 0;
        var t = Math.imul(_rs ^ (_rs >>> 15), 1 | _rs);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    L.seedRandom = function (n) { _rs = (n | 0) || 1; Math.random = mulberry32; };
    L.seedRandom(1);

    // ── console capture ───────────────────────────────────────────────────────
    L.logs = [];
    L.errors = [];
    L.logCount = 0;                       // monotonic: every captured non-error line
    L.errorCount = 0;
    L.echo = false;                       // set true to see game logs live
    function _fmt(args) { return Array.prototype.map.call(args, function (a) {
        if (a && typeof a === "object") { try { return JSON.stringify(a); } catch (e) { return String(a); } }
        return String(a); }).join(" "); }
    var _con = (typeof console !== "undefined") ? console : {};
    function _cap(kind) { return function () {
        var s = _fmt(arguments);
        if (kind === "error") { L.errorCount++; L.errors.push(s); if (L.errors.length > 500) L.errors.shift(); }
        else { L.logCount++; L.logs.push(s); if (L.logs.length > 5000) L.logs.shift(); }
        if (L.echo) L.realOut("[game." + kind + "] " + s);
    }; }
    ["log", "info", "debug", "warn", "table", "group", "groupEnd"].forEach(function (k) {
        try { _con[k] = _cap(k === "warn" ? "warn" : "log"); } catch (e) {}
    });
    try { _con.error = _cap("error"); } catch (e) {}
    if (typeof console === "undefined") G.console = _con;
    L.logsMatching = function (re) { return L.logs.filter(function (s) { return re.test(s); }); };
    L.clearLogs = function () { L.logs.length = 0; L.errors.length = 0; };

    // ── timers: captured, run only on purpose ─────────────────────────────────
    L.timers = [];
    L.rafQueue = [];
    var _tid = 0;
    function _def(name, fn) {
        try { Object.defineProperty(G, name, { value: fn, configurable: true, writable: true }); }
        catch (e) { G[name] = fn; }
    }
    _def("setTimeout", function (fn, ms) { _tid++; L.timers.push({ id: _tid, fn: fn, ms: ms || 0, repeat: false }); return _tid; });
    _def("setInterval", function (fn, ms) { _tid++; L.timers.push({ id: _tid, fn: fn, ms: ms || 0, repeat: true }); return _tid; });
    _def("clearTimeout", function (id) { L.timers = L.timers.filter(function (t) { return t.id !== id; }); });
    _def("clearInterval", function (id) { L.timers = L.timers.filter(function (t) { return t.id !== id; }); });
    _def("requestAnimationFrame", function (fn) { _tid++; L.rafQueue.push(fn); return _tid; });
    _def("cancelAnimationFrame", function () {});
    L.flushRaf = function () { var q = L.rafQueue; L.rafQueue = []; q.forEach(function (fn) { fn(L.clock); }); return q.length; };
    L.dropTimers = function () { L.timers = []; L.rafQueue = []; };
    L.runTimers = function () {             // run one-shot timeouts once, in order
        var once = L.timers.filter(function (t) { return !t.repeat; });
        L.timers = L.timers.filter(function (t) { return t.repeat; });
        once.forEach(function (t) { if (typeof t.fn === "function") t.fn(); });
        return once.length;
    };

    // ── DOM + canvas stubs ────────────────────────────────────────────────────
    function stub(name, props) {
        var store = props || {};
        var fn = function () {};
        return new Proxy(fn, {
            get: function (t, k) {
                if (k === Symbol.toPrimitive) return function (hint) { return hint === "number" ? 0 : ""; };
                if (k === "toString" || k === "valueOf") return function () { return ""; };
                if (k === "then") return undefined;
                if (k in store) return store[k];
                if (k === "length") return 0;
                var s = stub(name + "." + String(k));
                store[k] = s;
                return s;
            },
            set: function (t, k, v) { store[k] = v; return true; },
            has: function () { return true; },
            apply: function () { return stub(name + "()"); },
            construct: function () { return stub("new " + name); }
        });
    }
    L.stub = stub;

    // The live 2D context. Its methods dispatch to the current SINK, so a
    // harness can switch between "discard everything" and "record every fill"
    // without the game ever re-fetching its ctx.
    var NOOP_SINK = { fill: null, stroke: null, fillRect: null, fillText: null };
    var sink = NOOP_SINK;
    var ctxState = { fillStyle: "#000000", strokeStyle: "#000000", globalAlpha: 1, lineWidth: 1, font: "10px sans-serif",
                     textAlign: "start", textBaseline: "alphabetic", globalCompositeOperation: "source-over",
                     shadowBlur: 0, shadowColor: "rgba(0,0,0,0)", imageSmoothingEnabled: true, lineCap: "butt", lineJoin: "miter" };
    var path = [];
    var contextStack = [];
    L.ctxCounters = { save: 0, restore: 0, fill: 0, fillRect: 0, stroke: 0, gradients: 0, drawImage: 0, fillText: 0 };
    function gradient() { return { addColorStop: function () {} }; }
    var ctxMethods = {
        save: function () { contextStack.push(Object.assign({}, ctxState)); L.ctxCounters.save++; },
        restore: function () {
            if (contextStack.length) ctxState = contextStack.pop();
            L.ctxCounters.restore++;
        },
        beginPath: function () { path = []; },
        moveTo: function (x, y) { path.push(x, y); },
        lineTo: function (x, y) { path.push(x, y); },
        closePath: function () {},
        rect: function (x, y, w, h) { path.push(x, y, x + w, y, x + w, y + h, x, y + h); },
        arc: function (x, y) { path.push(x, y); },
        arcTo: function (x1, y1, x2, y2) { path.push(x1, y1, x2, y2); },
        roundRect: function (x, y, w, h) { path.push(x, y, x + w, y, x + w, y + h, x, y + h); },
        ellipse: function (x, y) { path.push(x, y); },
        quadraticCurveTo: function (a, b, x, y) { path.push(x, y); },
        bezierCurveTo: function (a, b, c, d, x, y) { path.push(x, y); },
        fill: function () { L.ctxCounters.fill++; if (sink.fill) sink.fill(ctxState.fillStyle, ctxState.globalAlpha, path); },
        stroke: function () { L.ctxCounters.stroke++; if (sink.stroke) sink.stroke(ctxState.strokeStyle, path); },
        fillRect: function (x, y, w, h) { L.ctxCounters.fillRect++; if (sink.fillRect) sink.fillRect(ctxState.fillStyle, x, y, w, h); },
        strokeRect: function () {}, clearRect: function () {},
        fillText: function (t, x, y) { L.ctxCounters.fillText++; if (sink.fillText) sink.fillText(ctxState.fillStyle, String(t), x, y); },
        strokeText: function () {},
        measureText: function (s) { return { width: String(s).length * 6 }; },
        createLinearGradient: function () { L.ctxCounters.gradients++; return gradient(); },
        createRadialGradient: function () { L.ctxCounters.gradients++; return gradient(); },
        createPattern: function () { return {}; },
        drawImage: function () { L.ctxCounters.drawImage++; },
        getImageData: function (x, y, w, h) { w = Math.max(0, w | 0); h = Math.max(0, h | 0); return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
        createImageData: function (w, h) { w = Math.max(0, w | 0); h = Math.max(0, h | 0); return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
        putImageData: function () {}, setTransform: function () {}, resetTransform: function () {}, transform: function () {},
        translate: function () {}, rotate: function () {}, scale: function () {}, clip: function () {},
        setLineDash: function () {}, getLineDash: function () { return []; }, isPointInPath: function () { return false; }
    };
    L.saveDepth = function () { return contextStack.length; };
    var ctx2d = new Proxy({}, {
        get: function (t, k) {
            if (k in ctxMethods) return ctxMethods[k];
            if (k in ctxState) return ctxState[k];
            if (k === "canvas") return mainCanvas;
            return undefined;
        },
        set: function (t, k, v) { ctxState[k] = v; return true; }
    });

    function makeCanvas(w, h, ctx) {
        var el = { width: w, height: h, style: stub("style"), _ctx: ctx || null,
            getContext: function () { if (!this._ctx) this._ctx = new Proxy({}, { get: function (t, k) {
                    if (k in ctxMethods) return (k === "fill" || k === "fillRect" || k === "stroke" || k === "save" || k === "restore")
                        ? function () {} : ctxMethods[k];   // offscreen canvases never reach the recorder
                    return undefined; }, set: function () { return true; } });
                return this._ctx; },
            addEventListener: function () {}, removeEventListener: function () {},
            getBoundingClientRect: function () { return { left: 0, top: 0, width: this.width, height: this.height }; },
            requestPointerLock: function () {}, requestFullscreen: function () {}, focus: function () {},
            toDataURL: function () { return "data:,"; }, appendChild: function () {} };
        return el;
    }
    var mainCanvas = makeCanvas(360, 240, ctx2d);
    L.canvas = mainCanvas;

    var elements = { maze: mainCanvas };
    function element(id) {
        if (!elements[id]) {
            if (/canvas/i.test(id)) elements[id] = makeCanvas(320, 200);
            else elements[id] = stub("#" + id, { id: id, checked: false, value: "", textContent: "", innerHTML: "",
                style: stub("style"), classList: stub("classList"), dataset: {},
                addEventListener: function () {}, removeEventListener: function () {}, appendChild: function () {},
                dispatchEvent: function () { return true; }, setAttribute: function () {}, getAttribute: function () { return null; },
                focus: function () {}, blur: function () {} });
        }
        return elements[id];
    }
    L.element = element;
    var doc = {
        getElementById: element,
        createElement: function (tag) { return tag === "canvas" ? makeCanvas(300, 150) : stub("<" + tag + ">", {
            style: stub("style"), addEventListener: function () {}, appendChild: function () {}, setAttribute: function () {} }); },
        addEventListener: function () {}, removeEventListener: function () {},
        body: stub("body", { appendChild: function () {}, style: stub("style") }),
        documentElement: stub("html", { style: stub("style") }),
        querySelector: function () { return null; }, querySelectorAll: function () { return []; },
        fullscreenElement: null, webkitFullscreenElement: null, mozFullScreenElement: null, msFullscreenElement: null,
        pointerLockElement: null, exitPointerLock: function () {}, exitFullscreen: function () {},
        readyState: "complete", hidden: false
    };
    _def("document", doc);
    _def("window", G);
    G.innerWidth = 1280; G.innerHeight = 720; G.devicePixelRatio = 1;
    G.addEventListener = function () {}; G.removeEventListener = function () {};
    if (typeof G.screen === "undefined") _def("screen", { width: 1280, height: 720 });
    _def("Event", function Event(type) { this.type = type; });
    _def("alert", function () {});
    var never = function () { return new Promise(function () {}); };
    _def("hw", { fetchJSON: never, postFormText: never, fetchText: never, postForm: never, _auth401: function () {} });

    // ── loading the game ──────────────────────────────────────────────────────
    L.sourceLines = function () { return L._lines || (L._lines = (L.sourceText || "").split("\n")); };
    L.loaded = false;
    L.loadError = null;
    L.load = function (path) {
        if (!_slurp) throw new Error("LAB.load: call LAB.init(__out, slurp, __engine, __argv) first");
        var text = _slurp(path);
        L.sourceText = text;
        try {
            (0, eval)(text);
            L.loaded = true;
            L._snapshotPage();
        } catch (e) {
            L.loadError = String(e) + (e && e.line ? " (header line " + e.line + ")" : "") + (e && e.stack ? "\n" + e.stack : "");
        }
        // The page's own boot sequence schedules nothing we want (auto-overview
        // and sensor probes); start every scenario from a quiet queue.
        L.dropTimers();
        return L.loaded;
    };

    // ── starting a world ──────────────────────────────────────────────────────
    // Each start mirrors what the page's button handler does, minus the parts
    // that only touch the DOM. Line refs are to WebPage_Games.h.
    function _commonAfterStart() {
        MODE3D = true; hasBaseline = true; calibrating = false; lastUpdate = 0;
        CONTROL_MODE = MODE_STICK_AIM; USE_KEYBOARD = true; USE_MOUSE = true;
        overviewActive = false;
        L.dropTimers();                     // cancels the 100 ms auto-overview (7648)
        kbState.up = kbState.down = kbState.left = kbState.right = false;
        _loopGen = (_loopGen || 0) + 1;
    }
    // Cave Test (terrain dropdown 'cavetest', handler at 22117). Default seed 12345.
    L.startCaveTest = function (seed, flags) {
        G._caveTestSeedOverride = seed || 12345;
        var f = flags || {};
        for (var k in caveTestFlags) caveTestFlags[k] = (k in f) ? !!f[k] : false;
        CAVE_TEST_MODE = true; ENDLESS_MODE = true; gameOverState = false; running = true;
        equipment = { armor: null, hat: null, robes: null };
        inventoryOpen = false; inventorySelIdx = -1;
        health = HEALTH_MAX; mana = MANA_MAX; terrain = "plains";
        resetEndlessMode();
        _commonAfterStart();
        return WORLD_SEED;
    };
    // Normal Endless (btnEndless, 22163). WORLD_SEED = floor(random*999999)+1
    // (7522), so one steered Math.random() call lands exactly on `seed`.
    L.startEndless = function (seed, rngSeed) {
        seed = Math.max(1, Math.min(999999, seed | 0));
        var target = (seed - 0.5) / 999999;
        var restore = Math.random;
        var used = false;
        Math.random = function () { if (!used) { used = true; return target; } return restore(); };
        CAVE_TEST_MODE = false; ENDLESS_MODE = true; gameOverState = false; running = true;
        equipment = { armor: null, hat: null, robes: null };
        inventoryOpen = false; inventorySelIdx = -1;
        health = HEALTH_MAX; mana = MANA_MAX;
        try { resetEndlessMode(); } finally { Math.random = restore; }
        L.seedRandom(rngSeed || seed);
        _commonAfterStart();
        if (WORLD_SEED !== seed) throw new Error("startEndless: wanted seed " + seed + ", got " + WORLD_SEED);
        return WORLD_SEED;
    };
    // Fixed level via the Start button path (startGame, 22020-22026).
    L.startLevel = function (lv) {
        CAVE_TEST_MODE = false; ENDLESS_MODE = false; gameOverState = false; running = true;
        equipment = { armor: null, hat: null, robes: null };
        inventoryOpen = false; inventorySelIdx = -1;
        resetLevel(lv || 1);
        _commonAfterStart();
    };

    // ── stepping time ─────────────────────────────────────────────────────────
    // frame(): the REAL game loop body (loop(), 21897) for one 60 Hz frame:
    // handleInput, fixed-step gameUpdate, renderFrame (all draw passes, HUD,
    // minimap). Most faithful, slowest. Returns loop errors seen this frame.
    // Returns the number of NEW render errors this frame: loop() crashes AND
    // exceptions the per-stage wrapper _pt() swallowed (20576-20585), which a
    // loop-only count misses -- every draw pass and gameUpdate run inside _pt.
    L.frame = function () { return L.frameAt(L.FRAME_MS); };
    // tick(): physics only -- what loop() does minus renderFrame, plus the two
    // side effects of draw() that physics depends on: camera follow (18951)
    // and the per-frame floor-height cache invalidation (18967).
    L.tick = function (n) {
        n = n || 1;
        for (var i = 0; i < n; i++) {
            L.advance(L.FRAME_MS);
            handleInput(L.FIXED_DT);
            if (!menuOpen && !settingsOpen) gameUpdate(L.FIXED_DT);
            if (CAM_FOLLOW) { cam.x = pos.x; cam.y = pos.y; if (Number.isFinite(pos.floorZ)) cam.z = pos.floorZ; }
            _floorCacheTick = (_floorCacheTick + 1) | 0;
        }
    };
    // Stop the day/night cycle at time-of-day t (0.5 = noon; 7522 picks 0.35).
    // updateDayNight still runs every tick -- underground detection lives in
    // it (19342) -- only dayTime stops advancing, so lighting checks compare
    // like with like instead of drifting toward dusk mid-walk.
    L.freezeDay = function (t) { dayTime = (t === undefined) ? 0.5 : t; daySpeed = 0; settings.dayNight = true; };
    // Every cave network within `radius` regions (1 region = 3 chunks = 1440 u)
    // of region (0,0), in WORLD coordinates, nearest first. Cheap: networks are
    // generated from seeds alone (4439) without building any chunk.
    L.findCaveNetworks = function (radius) {
        radius = radius || 12;
        var out = [];
        for (var ry = -radius; ry <= radius; ry++) for (var rx = -radius; rx <= radius; rx++) {
            var net = generateCaveNetwork(rx, ry);
            if (!net) continue;
            var d = 1e18;
            net.entrances.forEach(function (e) { d = Math.min(d, Math.hypot(e.x - CHUNK_SIZE / 2, e.y - CHUNK_SIZE / 2)); });
            out.push({ rx: rx, ry: ry, net: net, dist: d });
        }
        out.sort(function (a, b) { return a.dist - b.dist; });
        return out;
    };
    L.keys = function (k) {
        k = k || {};
        kbState.up = !!k.up; kbState.down = !!k.down; kbState.left = !!k.left; kbState.right = !!k.right;
    };

    // ── reading the world ─────────────────────────────────────────────────────
    L.h = function () { return ((Number.isFinite(pos.floorZ) ? pos.floorZ : 60) - 60) / 40; };
    L.setH = function (h) { pos.floorZ = 60 + 40 * h; };
    L.worldPos = function () { return { x: pos.x + windowOriginX, y: pos.y + windowOriginY }; };
    L.toLocal = function (wx, wy) { return { x: wx - windowOriginX, y: wy - windowOriginY }; };
    L.meshIndex = function (lx, ly) {
        var m = floorMesh; if (!m) return -1;
        var gx = Math.floor(lx / m.gridSize), gy = Math.floor(ly / m.gridSize);
        if (gx < 0 || gy < 0 || gx >= m.w || gy >= m.h) return -1;
        return gy * m.w + gx;
    };
    // Layer stack of one mesh cell, bottom to top: [{t, z}], t: 1 floor,
    // 2 ceiling, 3 ledge, 4 surface cap.
    L.layers = function (i) {
        var m = floorMesh, out = [];
        if (!m || i < 0) return out;
        var Z = [m.l0TopZ, m.l1TopZ, m.l2TopZ, m.l3TopZ, m.l4TopZ];
        var T = [m.l0Type, m.l1Type, m.l2Type, m.l3Type, m.l4Type];
        for (var li = 0; li < m.layerCount[i]; li++) out.push({ t: T[li][i], z: Z[li][i] });
        return out;
    };
    L.layersAt = function (lx, ly) { return L.layers(L.meshIndex(lx, ly)); };
    L.fmtLayers = function (ls) { return ls.map(function (l) { return l.t + "@" + l.z.toFixed(2); }).join(" "); };
    L.walkable = function (t) { return t === 1 || t === 3 || t === 4; };
    L.topWalkable = function (ls) { for (var k = ls.length - 1; k >= 0; k--) if (L.walkable(ls[k].t)) return ls[k]; return null; };
    L.lowestWalkable = function (ls) { for (var k = 0; k < ls.length; k++) if (L.walkable(ls[k].t)) return ls[k]; return null; };
    L.ceilingOf = function (ls) { for (var k = 0; k < ls.length; k++) if (ls[k].t === 2) return ls[k]; return null; };
    L.capOf = function (ls) { for (var k = 0; k < ls.length; k++) if (ls[k].t === 4) return ls[k]; return null; };

    // Cave entrances of the current world, in WORLD coordinates, with the
    // entrance frame precomputed. angle faces INTO the cave (4485), so
    // along > 0 is OUTSIDE (the convention of queryCaveGeometry, 4723).
    L.entrances = function () {
        var out = [];
        for (var key in endlessCaveNetworks) {
            var net = endlessCaveNetworks[key];
            if (!net) continue;
            for (var i = 0; i < net.entrances.length; i++) {
                var e = net.entrances[i];
                out.push({ key: key, index: i, net: net, x: e.x, y: e.y, angle: e.angle,
                    outX: -Math.cos(e.angle), outY: -Math.sin(e.angle) });
            }
        }
        return out;
    };
    // World point at (along, perp) in an entrance frame. perp > 0 is to the
    // right of someone walking OUT of the cave.
    L.axisWorld = function (E, along, perp) {
        perp = perp || 0;
        return { x: E.x + E.outX * along + (-E.outY) * perp, y: E.y + E.outY * along + E.outX * perp };
    };
    L.alongOf = function (E) { var w = L.worldPos(); return (w.x - E.x) * E.outX + (w.y - E.y) * E.outY; };
    L.perpOf = function (E) { var w = L.worldPos(); return (w.x - E.x) * (-E.outY) + (w.y - E.y) * E.outX; };

    // Put the player at a WORLD point, re-centre the window if needed, and
    // stand them on a chosen layer: "top" (highest walkable), "bottom"
    // (lowest walkable) or a number (h). Velocity and airborne state cleared.
    L.placeWorld = function (wx, wy, layer) {
        pos.x = wx - windowOriginX; pos.y = wy - windowOriginY;
        vel.x = 0; vel.y = 0;
        updateChunks();                     // may re-centre and rebase pos
        var ls = L.layersAt(pos.x, pos.y);
        var h;
        if (typeof layer === "number") h = layer;
        else { var w = (layer === "bottom") ? L.lowestWalkable(ls) : L.topWalkable(ls); h = w ? w.z : 0; }
        L.setH(h);
        jumpAirborne = false; jumpVelZ = 0;
        cam.x = pos.x; cam.y = pos.y; cam.z = pos.floorZ;
        _floorCacheTick = (_floorCacheTick + 1) | 0;
        return h;
    };

    // Walk the player toward a WORLD target with the real input path (W held,
    // camera yaw steered each tick). Calls onTick(state) after every tick;
    // stops when within `arrive` units, or after maxTicks. Returns the trace.
    L.walkTo = function (wx, wy, opts) {
        opts = opts || {};
        // opts.fps: drive the REAL loop() at that render rate (L.frameAt) instead
        // of one 60 Hz physics tick per step. Below 60 fps the real page runs
        // several gameUpdates per rendered frame and handleInput once, which is
        // where frame-rate-dependent bugs live (N1); a 60 Hz tick cannot see them.
        // With fps, maxTicks counts RENDERED frames.
        var maxTicks = opts.maxTicks || 2000, arrive = opts.arrive || 8, trace = [];
        for (var t = 0; t < maxTicks; t++) {
            var p = L.worldPos();
            var dx = wx - p.x, dy = wy - p.y;
            if (Math.hypot(dx, dy) < arrive) break;
            cam.ang = Math.atan2(dy, dx); cam.pitch = 0;
            L.keys({ up: true });
            if (opts.fps) L.frameAt(1000 / opts.fps); else L.tick(1);
            var st = { t: t, x: L.worldPos().x, y: L.worldPos().y, h: L.h(), air: jumpAirborne,
                       ug: playerUnderground, amb: ambientLight, cell: L.meshIndex(pos.x, pos.y) };
            trace.push(st);
            if (opts.onTick) opts.onTick(st);
        }
        L.keys({});
        return trace;
    };

    // ── rendering: record what a pass actually submits ────────────────────────
    // Classification of fills when DEBUG_POLY_TYPES is on (palette at
    // 12817-12824, 13085-13088). Lighting multiplies all channels by one factor
    // so hue ORDER survives; the tests only need the class.
    L.polyClass = function (style) {
        if (typeof style !== "string") return "other";
        if (style === "rgb(60, 42, 28)") return "skirt";
        var m = style.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) return "other";
        var r = +m[1], g = +m[2], b = +m[3];
        if (r + g + b === 0) return "black";
        if (r <= 2 && b > g && g > r) return "cap";              // #0074d9
        if (b > g && r > g && b >= r * 0.8) return "ceiling";    // #b10dc9
        if (g > r && g > b) return "surface";                    // #2ecc40
        if (r > g && g > b) return (g / r > 0.7) ? "tilted" : "caveFloor"; // #ffdc00 / #ff851b
        return "other";
    };
    // Run fn() with fills recorded. Optional recorders are opt-in so existing
    // consumers do not pay to retain thousands of rectangles/text calls:
    //   {fillRects:true, strokes:true, texts:true, keepOnThrow:true}
    // Returns {fills, fillRects, strokes, texts, byClass, overheadByClass} --
    // "overhead" = every vertex above the horizon line, i.e. geometry the
    // camera sees from BELOW.
    L.record = function (fn, opts) {
        opts = opts || {};
        var fills = [], fillRects = [], strokes = [], texts = [], error = null;
        var prev = sink;
        sink = { fill: function (style, alpha, pts) { fills.push({ style: style, alpha: alpha, pts: pts.slice() }); },
                 fillRect: opts.fillRects ? function (style, x, y, w, h) {
                     fillRects.push({ style: style, x: x, y: y, w: w, h: h });
                 } : null,
                 stroke: opts.strokes ? function (style, pts) { strokes.push({ style: style, pts: pts.slice() }); } : null,
                 fillText: opts.texts ? function (style, t, x, y) { texts.push({ style: style, text: t, x: x, y: y }); } : null };
        try { fn(); }
        catch (e) { if (!opts.keepOnThrow) throw e; error = e; }
        finally { sink = prev; }
        var horizon = getCam3D().horizonY;
        var byClass = {}, overhead = {};
        fills.forEach(function (f) {
            var c = L.polyClass(f.style);
            byClass[c] = (byClass[c] || 0) + 1;
            var above = f.pts.length >= 6;
            for (var q = 1; q < f.pts.length; q += 2) if (f.pts[q] >= horizon) { above = false; break; }
            if (above) overhead[c] = (overhead[c] || 0) + 1;
        });
        return { fills: fills, fillRects: fillRects, strokes: strokes, texts: texts, error: error,
                 byClass: byClass, overheadByClass: overhead, horizon: horizon };
    };
    // Set up the camera exactly as draw() would before its passes (18908-18967),
    // without running the passes.
    L.prepCamera = function () {
        projScale = mainCanvas.height * (180 / CANVAS_BASE_H);
        resScale = mainCanvas.height / CANVAS_BASE_H;
        if (CAM_FOLLOW) { cam.x = pos.x; cam.y = pos.y; if (pos.floorZ) cam.z = pos.floorZ; }
        _floorCacheTick = (_floorCacheTick + 1) | 0;
        // Individual render-pass tests need the same fresh visibility field as
        // draw(). Without it the production depth helpers reject every face.
        beginSceneDepthFrame(mainCanvas.width, mainCanvas.height);
    };

    // ── page-lifetime state ───────────────────────────────────────────────────
    // Some game state lives for the whole page, not one world: the start
    // functions (resetEndlessMode, resetLevel) leave it alone, so scenario N
    // inherits it from scenario N-1. freshPage() restores the values captured
    // right after LAB.load, i.e. what a reloaded page would have. It is opt-in:
    // a suite TESTING such leaks must not call it before measuring them.
    var PAGE_KEYS = ["jumpAirborne", "jumpVelZ", "settings", "pendingSettings", "WINDOW_CHUNKS", "_ptErrors",
                     "_rgbCache", "spells", "fortressAllies", "completedFortresses", "CONTROL_MODE", "gpLast",
                     "lastSelectDown", "lastStartMenuDown", "menuOpen", "settingsOpen", "dayTime", "daySpeed", "_physicsAccum",
                     "lastUpdate", "phoenixFeatherUsed", "stats"];
    var _pageSnap = null;
    function _clone(v) { return (v && typeof v === "object") ? JSON.parse(JSON.stringify(v)) : v; }
    L._snapshotPage = function () {
        _pageSnap = {};
        PAGE_KEYS.forEach(function (k) { if (k in G) { try { _pageSnap[k] = _clone(G[k]); } catch (e) {} } });
        _pageSnap._loopErrCount = G._loopErrCount || 0;
    };
    L.freshPage = function () {
        if (!_pageSnap) return;
        PAGE_KEYS.forEach(function (k) { if (k in _pageSnap) G[k] = _clone(_pageSnap[k]); });
        G._loopErrCount = _pageSnap._loopErrCount;
        L.clearLogs();
        L.dropTimers();
    };
    // All buttons released (the pad reports active-low; the page's initial
    // gpLast {buttons:0} reads as EVERY button held -- a real page behaviour
    // that a suite can test by NOT calling this).
    L.releasePad = function () {
        gpLast = { x: 0, y: 0, buttons: -1, valid: false };
        lastSelectDown = false; lastStartMenuDown = false;
    };
    // Render-error bookkeeping: _ptErrors / _loopErrCount accumulate for the
    // whole page. Take a mark, act, then ask what is new.
    L.renderErrorMark = function () {
        var n = G._loopErrCount || 0;
        for (var k in (G._ptErrors || {})) n += G._ptErrors[k];
        return n;
    };
    L.renderErrorsSince = function (mark) { return L.renderErrorMark() - mark; };

    // One real loop() frame at an arbitrary render interval (ms). LAB.frame is
    // the 60 Hz special case. Frame-rate-dependence checks need this.
    L.frameAt = function (ms) {
        L.advance(ms);
        var mark = L.renderErrorMark();
        loop(L.clock, _loopGen);
        L.rafQueue = [];                    // loop() re-schedules itself; we drive it
        return L.renderErrorsSince(mark);
    };
    // Set the absolute virtual clock; refuses to go backwards (the game keeps
    // timestamps, and time running backwards is not a state the page can reach).
    L.setClock = function (ms) {
        if (ms < L.clock) throw new Error("LAB.setClock: refusing to move the clock backwards");
        L.clock = ms;
    };
    // Observe a game function the game calls BY NAME (assembleWindow, ...).
    // Returns {calls, restore()}. Always restore, e.g. in a finally.
    L.countCalls = function (name) {
        var orig = G[name], rec = { calls: 0, restore: function () { G[name] = orig; } };
        G[name] = function () { rec.calls++; return orig.apply(this, arguments); };
        return rec;
    };
    // Fixed-point text with no negative zero (engines differ in the last ulp
    // of sin/cos, which otherwise prints '-0.0' on one engine and '0.0' on
    // another and splits PASS lines).
    L.fx = function (x, d) {
        if (typeof x !== "number" || !isFinite(x)) return String(x);
        var s = x.toFixed(d === undefined ? 2 : d);
        return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s;
    };
    // WORLD coordinates of a window mesh cell: centre, and the NW corner the
    // chunk stamper samples queryCaveGeometry at (5589) -- capped status is
    // decided at the centre (6666). Capture these at scan time: after a
    // re-centre the same index means a different place.
    L.cellWorld = function (i) {
        var m = floorMesh, gx = i % m.w, gy = (i / m.w) | 0;
        return { x: (gx + 0.5) * m.gridSize + windowOriginX, y: (gy + 0.5) * m.gridSize + windowOriginY };
    };
    L.cellCorner = function (i) {
        var m = floorMesh, gx = i % m.w, gy = (i / m.w) | 0;
        return { x: gx * m.gridSize + windowOriginX, y: gy * m.gridSize + windowOriginY };
    };
    // The walkable layer the player is standing on (within tol of LAB.h()).
    L.standingLayer = function (tol) {
        tol = (tol === undefined) ? 0.15 : tol;
        var ls = L.layersAt(pos.x, pos.y), h = L.h(), best = null;
        ls.forEach(function (l) { if (L.walkable(l.t) && Math.abs(l.z - h) <= tol && (!best || Math.abs(l.z - h) < Math.abs(best.z - h))) best = l; });
        return best;
    };

    // ── reporting ─────────────────────────────────────────────────────────────
    // Same verdict protocol as every other harness in this directory: one
    // PASS/FAIL line per check, then exactly one HARNESS_RESULT line. METRIC
    // lines carry measured values for humans and for game_lab's report; they
    // never decide pass/fail.
    L.checks = [];
    L.check = function (id, ok, detail) {
        ok = !!ok;
        L.checks.push({ id: id, ok: ok, detail: detail || "" });
        L.out((ok ? "PASS " : "FAIL ") + id + (detail ? "   [" + detail + "]" : ""));
        return ok;
    };
    L.metric = function (id, value, unit) {
        var v = (typeof value === "number") ? +value.toFixed(4) : value;
        L.out("METRIC " + id + " " + JSON.stringify(v) + (unit ? " " + unit : ""));
    };
    L.note = function (s) { L.out("NOTE " + s); };
    L.finish = function () {
        var failed = L.checks.filter(function (c) { return !c.ok; }).length;
        if (L.errors.length) L.out("NOTE game console.error lines: " + L.errors.length + " -- first: " + L.errors[0].split("\n")[0]);
        L.out(failed ? "HARNESS_RESULT FAIL " + failed : "HARNESS_RESULT PASS");
    };
    // Guard a whole scenario: an exception becomes ONE failed check naming the
    // scenario, not a crash that loses every later verdict line.
    L.scenario = function (name, fn) {
        try { fn(); }
        catch (e) {
            var where = (e && e.line) ? " (header line " + e.line + ")" : "";
            var stack = (e && e.stack) ? String(e.stack).split("\n").slice(0, 4).join(" | ") : "";
            L.check(name + ": scenario ran to completion", false, String(e) + where + " " + stack);
        }
    };
    return L;
})();
undefined;
