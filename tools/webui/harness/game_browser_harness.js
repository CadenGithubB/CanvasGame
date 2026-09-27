(0, eval)(slurp("tools/webui/harness/_game_env.js"));
LAB.init(__out, slurp, __engine, __argv);
LAB.check("browser: game script evaluates without throwing", LAB.load(__argv[0]), LAB.loadError || "");

// game_browser_harness.js -- the HEADLESS half of the browser suite.
//
// The rendered-pixel checks live in tools/webui/harness/game_browser_driver.js
// and only mean something in a real browser (tools/webui/game_page.py builds
// the page; the stub canvas here has no pixels). This harness loads that same
// driver file into the LAB stub environment, next to the real game, and tests
// every part of it that does not need pixels, so a driver regression is caught
// by `python3 -m unittest` before anyone opens a browser:
//
//   - its entrance frame (along/perp) round-trips exactly and points from the
//     approach into corridor/chamber geometry reported by queryCaveGeometry;
//   - every view it defines puts the player where it says, on the layer it
//     names, and the view's scene precondition holds (checked with LAB's own
//     readings, not the driver's);
//   - its hue classifier agrees with LAB.polyClass on every colour the game's
//     floor and ceiling passes really submit at those views (DEBUG_POLY_TYPES,
//     WebPage_Games.h:12817-12824, 13085-13088), and on the debug palette at
//     every light level;
//   - its pixel accounting (pass attribution, top/bottom split) is exact on a
//     synthetic frame set;
//   - its check logic FAILS a view that never reached its scene or either a
//     debug/normal blank frame, and grades ideal and audit-D5-like fractions
//     the right way round;
//   - a whole driver run completes headlessly and reports every frame blank
//     (so no pixel check can pass without a real canvas).
//
// usage (via tools/webui/game_lab.py): <extracted game js> [--seeds a,b]
// Line numbers are WebPage_Games.h header lines.

(function () {
    if (!LAB.loaded) return;
    var SEEDS = LAB.seeds([12345, 777, 424242]);   // 777: two entrances; 424242: N13 pixel case
    var DEFAULT_SEEDS = [12345, 424242];           // seeds the browser run uses by default
    var DEFAULT_SEED = DEFAULT_SEEDS[0];           // cheap headless full-run seed

    // Fixed-point without a negative zero: engines disagree in the last ulp of
    // cos/sin, which turns a 1e-14 into "-0.0" on one engine and "0.0" on another.
    function fx(x, d) { if (typeof x !== "number" || !isFinite(x)) return String(x); var v = +x.toFixed(d); return (v === 0 ? 0 : v).toFixed(d); }
    function f1(x) { return fx(x, 1); }
    function f2(x) { return fx(x, 2); }

    var GV = null;
    LAB.scenario("browser: load driver", function () {
        (0, eval)(slurp("tools/webui/harness/game_browser_driver.js"));
        GV = window.GameVisual;
        var ok = !!(GV && typeof GV.run === "function" && typeof GV.runSync === "function" && GV._internals && GV.VIEWS && GV.VIEWS.length >= 7);
        LAB.check("browser: the visual driver evaluates in the game's global scope and defines GameVisual", ok,
            GV ? "views=" + GV.VIEWS.map(function (v) { return v.id; }).join(",") : "window.GameVisual is " + typeof GV);
    });
    if (!GV) { return; }
    var I = GV._internals;

    // ── 1. entrance frame vs the game's cave query ───────────────────────────
    LAB.scenario("browser: entrance frame", function () {
        var worst = 0, n = 0, approaches = 0, overlaps = 0, rows = [], bad = [];
        SEEDS.forEach(function (seed) {
            LAB.startCaveTest(seed);
            var labE = LAB.entrances(), drvE = I.entrances();
            rows.push("s" + seed + " entrances LAB=" + labE.length + " driver=" + drvE.length);
            if (labE.length !== drvE.length) { worst = Infinity; return; }
            labE.forEach(function (E, k) {
                var D = drvE[k];
                [-300, -150, -60, 0, 60, 232, 260, 700].forEach(function (a) {
                    [-100, 0, 100].forEach(function (p) {
                        var w1 = LAB.axisWorld(E, a, p), w2 = I.axisWorld(D, a, p);
                        worst = Math.max(worst, Math.abs(w1.x - w2.x), Math.abs(w1.y - w2.y));
                        worst = Math.max(worst, Math.abs(I.alongOf(D, w2) - a), Math.abs(I.perpOf(D, w2) - p));
                        n++;
                    });
                });
                // The driver's positive axis must point OUT through the game's
                // approach, and its negative axis back into a real cave feature.
                // queryCaveGeometry is the shipping oracle; this is not a
                // comparison of the driver's frame with LAB's copy alone. Scan
                // the approach span instead of prescribing +400: on seed 777
                // entrance 1, another corridor/chamber in the SAME network
                // overlaps that entire span and wins queryCaveGeometry's source
                // priority. Round-trip agreement still proves that entrance's
                // axis; require real approach evidence on the unobscured ones.
                var net = endlessCaveNetworks[D.key], pi = I.axisWorld(D, -150, 0), qi = net ? queryCaveGeometry(pi.x, pi.y, [net], 2.0) : null;
                var sawApproach = false, sawOtherCave = false;
                for (var oa = 180; oa <= 460; oa += 20) {
                    var po = I.axisWorld(D, oa, 0), qo = net ? queryCaveGeometry(po.x, po.y, [net], 2.0) : null;
                    if (qo && qo.source === "approach" && qo.fade > 0) sawApproach = true;
                    else if (qo && (qo.source === "corridor" || qo.source === "chamber") && qo.fade > 0) sawOtherCave = true;
                }
                if (sawApproach) approaches++;
                else if (sawOtherCave) { overlaps++; rows.push("s" + seed + "e" + k + " outward approach obscured by same-network cave geometry"); }
                else bad.push("s" + seed + "e" + k + " has no outward approach evidence");
                if (!(qi && (qi.source === "corridor" || qi.source === "chamber") && qi.ceilZ !== null)) bad.push("s" + seed + "e" + k + " -150 is not inside cave geometry (" + JSON.stringify(qi) + ")");
            });
        });
        LAB.check("browser: the driver's entrance frame points from the game's approach into its cave geometry", n > 0 && approaches > 0 && worst < 1e-6 && bad.length === 0,
            rows.join("; ") + " points=" + n + " roundTripError=" + (worst < 1e-6 ? "<1e-6" : String(worst)) +
            " approachEntrances=" + approaches + " sameNetworkOverlap=" + overlaps +
            (bad.length ? " BAD " + bad.join("; ") : " queryCaveGeometry outside=approach inside=corridor/chamber"));
    });

    // ── 2. view placement and preconditions, read back with LAB helpers ──────
    LAB.scenario("browser: view placement", function () {
        var place = [], pre = [], labScenes = [];
        // The scene check covers every default browser seed even when --seeds
        // asks for extra placement coverage.
        var placeSeeds = DEFAULT_SEEDS.concat(SEEDS.filter(function (s) { return DEFAULT_SEEDS.indexOf(s) < 0; }));
        placeSeeds.forEach(function (seed) {
            LAB.seedRandom(seed);
            LAB.startCaveTest(seed);
            I.freeze(seed);
            try {
                I.settle();
                var labE = LAB.entrances(), drvE = I.entrances();
                if (labE.length !== drvE.length) {
                    var mismatch = "s" + seed + " entrance count LAB=" + labE.length + " driver=" + drvE.length;
                    place.push({ ok: false, d: mismatch });
                    if (DEFAULT_SEEDS.indexOf(seed) >= 0) {
                        pre.push({ ok: false, d: mismatch });
                        labScenes.push({ ok: false, d: mismatch });
                    }
                    return;
                }
                drvE.forEach(function (D, ei) {
                    var E = labE[ei], tag = "s" + seed + "e" + ei;
                    GV.VIEWS.forEach(function (view) {
                        var st = I.placeView(D, view);
                        if (!st.placed) {
                            var notPlaced = tag + " " + view.id + " NOT PLACED: " + st.why;
                            place.push({ ok: false, d: notPlaced });
                            if (DEFAULT_SEEDS.indexOf(seed) >= 0) {
                                pre.push({ ok: false, d: notPlaced });
                                labScenes.push({ ok: false, d: notPlaced });
                            }
                            return;
                        }
                        var ls = LAB.layersAt(pos.x, pos.y);
                        var want = (view.layer === "top") ? LAB.topWalkable(ls) : LAB.lowestWalkable(ls);
                        var a = LAB.alongOf(E), p = LAB.perpOf(E), h = LAB.h();
                        var ok = Math.abs(a - st.targetAlong) < 2 && Math.abs(p) < 2 && !!want && Math.abs(h - want.z) < 0.1;
                        var dd = tag + " " + view.id + " target along=" + f1(st.targetAlong) + " LAB along=" + f1(a) + " perp=" + f1(p) +
                            " h=" + f2(h) + " " + view.layer + "Walkable=" + (want ? want.t + "@" + f2(want.z) : "none") + " cell=[" + LAB.fmtLayers(ls) + "]";
                        place.push({ ok: ok, d: dd });
                        if (DEFAULT_SEEDS.indexOf(seed) >= 0) pre.push({ ok: st.pre.ok, d: tag + " " + view.id + (st.pre.ok ? " ok" : " " + st.pre.why) });
                        // Independent (LAB) reading of what makes each view meaningful.
                        if (DEFAULT_SEEDS.indexOf(seed) >= 0) {
                            var lo = LAB.lowestWalkable(ls), ce = LAB.ceilingOf(ls), cp = LAB.capOf(ls), tp = LAB.topWalkable(ls);
                            var labPre = true;
                            if (view.id === "inside_in" || view.id === "inside_out") labPre = !!(lo && lo.t === 1 && Math.abs(h - lo.z) < 0.1 && ce && ce.z > lo.z + LAB.EYE_H && cp);
                            else if (view.id === "arch_in" || view.ramp) {
                                var ahead = 0;
                                for (var aa = st.targetAlong - 12; aa >= st.targetAlong - 400; aa -= 12) {
                                    var ww = LAB.axisWorld(E, aa, 0), ll = LAB.toLocal(ww.x, ww.y);
                                    if (LAB.ceilingOf(LAB.layersAt(ll.x, ll.y))) ahead++;
                                }
                                labPre = !!(lo && Math.abs(h - lo.z) < 0.1 && ahead >= 10 &&
                                    (view.id === "arch_in" || (!ce && !cp)));
                            }
                            else if (view.id === "cap_along") labPre = !!(tp && tp.t === 4 && Math.abs(h - tp.z) < 0.1 && ce && lo && lo.z < ce.z && ce.z < tp.z);
                            else if (view.id === "far_surface") labPre = !!(!ce && !cp && tp && Math.abs(h - tp.z) < 0.1);
                            labScenes.push({ ok: labPre, d: tag + " " + view.id + (labPre ? " ok" : " LAB scene predicate failed") });
                            if (labPre !== st.pre.ok) pre.push({ ok: false, d: tag + " " + view.id + " driver precondition=" + st.pre.ok + " but LAB reading=" + labPre });
                        }
                    });
                });
            } finally { I.unfreeze(); }
        });
        function emit(id, list) {
            LAB.check(id, list.length > 0 && list.every(function (x) { return x.ok; }),
                list.map(function (x) { return (x.ok ? "ok " : "BAD ") + x.d; }).join(" | "));
        }
        emit("browser: every driver view places the player where it says, on the layer it names", place);
        emit("browser: every driver view reaches its scene on the default Cave Test seeds", pre);
        emit("browser: LAB independently confirms every driver view's scene on the default Cave Test seeds", labScenes);
    });

    // ── 3. hue classifier vs LAB.polyClass on the game's real fill colours ───
    LAB.scenario("browser: classifier vs game fills", function () {
        var agree = 0, disagree = 0, examples = [], seen = {}, skipped = 0, alphaZero = 0, alphaPartial = 0;
        var map = { cap: "cap", ceiling: "ceiling", surface: "surface", tilted: "tilted", caveFloor: "caveFloor" };
        // 12345/777 guarantee every required palette class. Command-line seeds
        // add coverage instead of replacing that classifier precondition.
        var classSeeds = [12345, 777].concat(SEEDS.filter(function (s) { return s !== 12345 && s !== 777; }));
        classSeeds.forEach(function (seed) {
            LAB.seedRandom(seed);
            LAB.startCaveTest(seed);
            LAB.freezeDay(0.5);
            I.freeze(seed);
            try {
                I.settle();
                var drvE = I.entrances();
                drvE.forEach(function (D) {
                    GV.VIEWS.forEach(function (view) {
                        var st = I.placeView(D, view);
                        if (!st.placed) return;
                        LAB.prepCamera();
                        [drawLayersFloor3D, drawLayersCeiling3D].forEach(function (pass) {
                            DEBUG_POLY_TYPES = true;
                            var rec;
                            try { rec = LAB.record(pass); } finally { DEBUG_POLY_TYPES = false; }
                            rec.fills.forEach(function (f) {
                                if (!(f.alpha > 0)) { alphaZero++; return; }
                                if (f.alpha < 0.999) alphaPartial++;
                                var lab = LAB.polyClass(f.style);
                                var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(String(f.style));
                                if (!m || !map[lab]) { skipped++; return; }
                                var r = +m[1], g = +m[2], b = +m[3];
                                if (Math.max(r, g, b) < I.DARK_MAX) { skipped++; return; }   // near-black: the driver's "dark" by design
                                var drv = I.classifyRGBA(r, g, b, 255);
                                seen[lab] = (seen[lab] || 0) + 1;
                                if (drv === map[lab]) agree++;
                                else { disagree++; if (examples.length < 6) examples.push(f.style + " LAB=" + lab + " driver=" + drv + " (" + view.id + ")"); }
                            });
                        });
                    });
                });
            } finally { I.unfreeze(); }
        });
        var classes = Object.keys(seen).sort();
        LAB.metric("browser.classifier.agree", agree);
        LAB.metric("browser.classifier.disagree", disagree);
        LAB.metric("browser.classifier.alpha_zero_skipped", alphaZero);
        LAB.metric("browser.classifier.alpha_partial", alphaPartial);
        var pre = (seen.cap || 0) > 0 && (seen.surface || 0) > 0 && (seen.caveFloor || 0) > 0 && (seen.tilted || 0) > 0;
        LAB.check("browser: the driver's hue classifier agrees with LAB.polyClass on every colour the floor and ceiling passes submit",
            pre && disagree === 0,
            "compared=" + (agree + disagree) + " agree=" + agree + " disagree=" + disagree + " skipped(dark/unclassified)=" + skipped +
            " alphaZeroSkipped=" + alphaZero + " alphaPartial=" + alphaPartial +
            " classesSeen=" + classes.map(function (c) { return c + ":" + seen[c]; }).join(",") +
            (pre ? "" : " PRECONDITION FAILED (cap, surface, caveFloor and tilted fills must all occur)") +
            (examples.length ? " e.g. " + examples.join("; ") : ""));
    });

    // ── 4. classifier on the documented palette at every light level ─────────
    LAB.scenario("browser: palette sweep", function () {
        // The debug palette as the header states it (12820-12824, 13087, 11904).
        var PAL = [["cap", 0x00, 0x74, 0xd9], ["caveFloor", 0xff, 0x85, 0x1b], ["tilted", 0xff, 0xdc, 0x00],
                   ["surface", 0x2e, 0xcc, 0x40], ["ceiling", 0xb1, 0x0d, 0xc9], ["caveWall", 255, 30, 30], ["gray", 170, 170, 170]];
        var bad = [], n = 0;
        PAL.forEach(function (p) {
            for (var k = 10; k <= 100; k += 5) {
                var L = k / 100, r = Math.floor(p[1] * L), g = Math.floor(p[2] * L), b = Math.floor(p[3] * L);
                var want = Math.max(r, g, b) < I.DARK_MAX ? "dark" : p[0];
                var got = I.classifyRGBA(r, g, b, 255);
                n++;
                if (got !== want) bad.push(p[0] + "x" + L.toFixed(2) + "=(" + r + "," + g + "," + b + ")->" + got);
            }
        });
        LAB.check("browser: the driver classifies every debug-palette colour at every light level from 0.10 to 1.00", bad.length === 0,
            "colours=" + n + (bad.length ? " misclassified: " + bad.slice(0, 8).join("; ") : ""));
    });

    // ── 5. pixel accounting on a synthetic frame set ─────────────────────────
    LAB.scenario("browser: pixel accounting", function () {
        // 4 x 4 frame: rows 0-1 top half, rows 2-3 bottom half.
        function img(fill) {
            var d = new Uint8ClampedArray(4 * 4 * 4);
            for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) { var c = fill(x, y), i = (y * 4 + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3]; }
            return { data: d, width: 4, height: 4 };
        }
        var SKY = [64, 64, 83, 255], CAP = [0, 104, 195, 255], ORANGE = [229, 119, 24, 255], RED = [240, 28, 28, 255], PURP = [80, 6, 90, 255], PLANE = [10, 9, 8, 255];
        // Truth per pixel, and what each pass-removed frame shows there.
        var T = [["sky", "sky", "sky", "ceiling"], ["cap", "cap", "caveWall", "arch"], ["caveFloor", "caveFloor", "floorDark", "void"], ["caveFloor", "sky", "dark", "caveFloor"]];
        var col = { sky: SKY, ceiling: PURP, cap: CAP, caveWall: RED, wall: [200, 170, 150, 255], arch: [120, 80, 40, 255], caveFloor: ORANGE, floorDark: PLANE, "void": [0, 0, 0, 0], dark: [8, 6, 4, 255] };
        var full = img(function (x, y) { var t = T[y][x]; return (t === "sky" && x === 1 && y === 3) ? [66, 69, 80, 255] : col[t]; });  // one sky pixel within SKY_TOL
        var noArch = img(function (x, y) { var t = T[y][x]; return t === "arch" ? SKY : full.data.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 4); });
        var noWalls = img(function (x, y) { var t = T[y][x]; return (t === "caveWall" || t === "wall") ? CAP : full.data.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 4); });
        var noFloor = img(function (x, y) { var t = T[y][x]; return (t === "cap" || t === "caveFloor" || t === "floorDark") ? [0, 0, 0, 0] : noWalls.data.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 4); });
        var noCeil = img(function (x, y) { var t = T[y][x]; return (t === "ceiling") ? SKY : noFloor.data.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 4); });
        var sky = img(function (x, y) { return y < 2 || (x === 1 && y === 3) ? SKY : [0, 0, 0, 0]; });
        var fr = { full: full, noArch: noArch, noWalls: noWalls, noFloor: noFloor, noCeil: noCeil, sky: sky };
        var wrong = [];
        for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) {
            var got = I.pixelClass(fr, (y * 4 + x) * 4);
            if (got !== T[y][x]) wrong.push("(" + x + "," + y + ") want " + T[y][x] + " got " + got);
        }
        var A = I.analyzeFrames(fr);
        var fracOk = A.top.sky === 3 / 8 && A.top.cap === 2 / 8 && A.top.ceiling === 1 / 8 && A.top.arch === 1 / 8 && A.bottom.caveFloor === 4 / 8 &&
                     A.all.caveFloor === 4 / 16 && A.all.sky === 4 / 16 && A.bottom["void"] === 1 / 8 && A.bottom.floorDark === 1 / 8;
        var sumAll = 0; GV.CLASSES.forEach(function (c) { sumAll += A.all[c]; });
        LAB.check("browser: the driver attributes each pixel to the pass that painted it and splits the frame at the horizon row",
            wrong.length === 0 && fracOk && Math.abs(sumAll - 1) < 1e-12,
            (wrong.length ? "misattributed: " + wrong.join("; ") + " " : "") + "top=" + JSON.stringify(A.counts.top) + " bottom=" + JSON.stringify(A.counts.bottom) +
            " sumAll=" + sumAll.toFixed(6));
    });

    // ── 6. the check logic, both directions ──────────────────────────────────
    LAB.scenario("browser: check logic", function () {
        function fr(o) { var f = {}; GV.CLASSES.forEach(function (c) { f[c] = o[c] || 0; }); return f; }
        function px(top, bottom) {
            var all = {}; GV.CLASSES.forEach(function (c) { all[c] = ((top[c] || 0) + (bottom[c] || 0)) / 2; });
            return { top: fr(top), bottom: fr(bottom), all: fr(all) };
        }
        var IDEAL = {
            inside_in: px({ ceiling: 0.6, caveWall: 0.2, dark: 0.2 }, { caveFloor: 0.9, dark: 0.1 }),
            inside_out: px({ ceiling: 0.3, sky: 0.2, arch: 0.5 }, { caveFloor: 0.5, arch: 0.5 }),
            arch_in: px({ ceiling: 0.5, sky: 0.5 }, { caveFloor: 0.4, floorDark: 0.6 }),
            ramp_far_in: px({ sky: 0.5, cap: 0.5 }, { caveFloor: 0.1, surface: 0.9 }),
            ramp_near_in: px({ sky: 0.5, cap: 0.5 }, { caveFloor: 0.1, surface: 0.9 }),
            cap_along: px({ sky: 1 }, { cap: 1 }),
            far_surface: px({ sky: 0.8, wall: 0.2 }, { surface: 0.9, wall: 0.1 })
        };
        // Audit D5: no ceiling drawn, the cap painted overhead (numbers from a real browser run).
        var D5 = { inside_in: px({ cap: 0.435, surface: 0.074, caveFloor: 0.38, caveWall: 0.094 }, { caveFloor: 0.95, caveWall: 0.05 }) };
        function rec(view, p, okPre, lumaIn, paint) {
            paint = paint || {};
            return { tag: "s1e0", state: { view: view, placed: true, along: 0, perp: 0, wx: 0, wy: 0, h: 0, ug: view === "inside_in", amb: 0.5, layers: [],
                                           pre: { ok: okPre, why: okPre ? "" : "synthetic: not in the scene" } },
                     render: { threw: null, renderFrameThrew: null, drawErrors: 0, redrawDiff: 0,
                               transparentDebug: paint.debug === false ? 1 : 0, transparentNormal: paint.normal === false ? 1 : 0,
                               px: p, luma: view === "inside_in" ? lumaIn : 80 } };
        }
        function run(pxs, okPre, paint) { return I.evaluate(Object.keys(IDEAL).map(function (v) { return rec(v, pxs[v] || IDEAL[v], okPre, 30, paint); })); }
        var specIds = I.SPECS.map(function (s) { return s.id; });
        var ideal = run(IDEAL, true), noPre = run(IDEAL, false), d5 = run(D5, true);
        var blankDebug = run(IDEAL, true, { debug: false, normal: true });
        var blankNormal = run(IDEAL, true, { debug: true, normal: false });
        function byId(cs) { var o = {}; cs.forEach(function (c) { o[c.id] = c; }); return o; }
        var bi = byId(ideal), bn = byId(noPre), bd = byId(d5), bbd = byId(blankDebug), bbn = byId(blankNormal);
        var idealBad = specIds.filter(function (id) { return !bi[id] || !bi[id].ok; });
        var preBad = specIds.filter(function (id) { return !bn[id] || bn[id].ok || bn[id].detail.indexOf("PRECONDITION FAILED") < 0; });
        var blankDebugBad = specIds.filter(function (id) { return !bbd[id] || bbd[id].ok || bbd[id].detail.indexOf("frame is blank") < 0; });
        var blankNormalBad = specIds.filter(function (id) { return !bbn[id] || bbn[id].ok || bbn[id].detail.indexOf("frame is blank") < 0; });
        var paintedId = "browser: every view's frame is painted (the canvas is not blank)";
        var blankGateOk = bbd[paintedId] && !bbd[paintedId].ok && bbn[paintedId] && !bbn[paintedId].ok;
        var CEIL = "browser: inside the tunnel the upper half of the view shows the tunnel ceiling";
        var OVER = "browser: inside the tunnel no sky, grass or surface cap is visible overhead";
        var d5Ok = bd[CEIL] && !bd[CEIL].ok && bd[OVER] && !bd[OVER].ok;
        LAB.check("browser: the driver's checks pass an ideal scene and reject D5, missing scenes, and a blank debug or normal frame",
            idealBad.length === 0 && preBad.length === 0 && blankDebugBad.length === 0 && blankNormalBad.length === 0 && blankGateOk && d5Ok && specIds.length >= 10,
            "specs=" + specIds.length + " idealFailing=[" + idealBad.join("; ") + "] notFailedOnPrecondition=[" + preBad.join("; ") +
            "] notFailedOnBlankDebug=[" + blankDebugBad.join("; ") + "] notFailedOnBlankNormal=[" + blankNormalBad.join("; ") +
            "] bothPaintGatesFailed=" + !!blankGateOk + " D5 ceiling/overhead failed=" + !!d5Ok);
    });

    // ── 7. a whole run, headless ─────────────────────────────────────────────
    LAB.scenario("browser: headless full run", function () {
        LAB.seedRandom(DEFAULT_SEED);
        var res = GV.runSync({ seeds: [DEFAULT_SEED], screenshots: false, startCaveTest: function (s) { LAB.startCaveTest(s); } });
        var ids = res.checks.map(function (c) { return c.id; });
        ids.forEach(function (id) { LAB.note("driver check id: " + id); });
        var painted = res.checks.filter(function (c) { return c.id === "browser: every view's frame is painted (the canvas is not blank)"; })[0];
        var specs = res.checks.filter(function (c) { return I.SPECS.some(function (s) { return s.id === c.id; }); });
        var allBlank = res.views.length === GV.VIEWS.length && res.views.every(function (v) {
            return v.transparentDebug >= 0.99 && v.transparentNormal >= 0.99;
        });
        var specsFailed = specs.length === I.SPECS.length && specs.every(function (c) { return !c.ok; });
        var rendered = res.checks.filter(function (c) { return c.id === "browser: every view renders through the page's renderFrame() without render-pass exceptions"; })[0];
        LAB.metric("browser.headless.views", res.views.length);
        LAB.check("browser: a headless driver run completes, renders every view without exceptions, and reports every frame blank",
            res.views.length === GV.VIEWS.length && !!painted && !painted.ok && allBlank && specsFailed && !!rendered && rendered.ok &&
            /^HARNESS_RESULT FAIL \d+$/.test(res.verdict),
            "views=" + res.views.length + " verdict=" + res.verdict + " paintedCheck=" + (painted ? (painted.ok ? "PASS" : "FAIL") : "missing") +
            " debugAndNormalBlank=" + allBlank + " pixelChecksFailed=" + specsFailed +
            " renderCheck=" + (rendered ? (rendered.ok ? "PASS" : "FAIL " + rendered.detail) : "missing"));
    });
})();

LAB.finish();
undefined;
