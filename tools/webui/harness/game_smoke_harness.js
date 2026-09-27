// game_smoke_harness.js -- proves the headless host itself works before any
// behavioural suite is believed. Every other game_*_harness.js depends on
// these facts; if one fails here, a FAIL elsewhere means nothing.
//
// usage (via tools/webui/game_lab.py): <extracted game js> [--seeds a,b]

(0, eval)(slurp("tools/webui/harness/_game_env.js"));
LAB.init(__out, slurp, __engine, __argv);

LAB.check("smoke: game script evaluates without throwing", LAB.load(__argv[0]), LAB.loadError || "");

if (LAB.loaded) {
    // Line N of the extracted text must be line N of WebPage_Games.h, or every
    // "(header line N)" in a failure report points at the wrong code.
    var _lines = LAB.sourceLines();
    var _headerLines = slurp('components/hardwareone/WebPage_Games.h').split('\n');
    var _floorLine = _lines.findIndex(function(l) { return /^function getWalkableLayerTopAt\(/.test(l); });
    var _resetLine = _lines.findIndex(function(l) { return /^function resetEndlessMode\(/.test(l); });
    LAB.check("smoke: extracted text is padded to header line numbers",
        _floorLine >= 0 && _resetLine >= 0 &&
        _headerLines[_floorLine] === _lines[_floorLine] && _headerLines[_resetLine] === _lines[_resetLine],
        "floor query line=" + (_floorLine + 1) + " reset line=" + (_resetLine + 1));

    LAB.scenario("smoke: cave test world", function () {
        var t0 = LAB.realNow();
        var seed = LAB.startCaveTest(12345);
        LAB.metric("smoke.cavetest.build_ms", LAB.realNow() - t0, "ms");
        LAB.check("smoke: cave test honours the seed override", seed === 12345, "WORLD_SEED=" + seed);
        LAB.check("smoke: cave test world has a floor mesh", !!floorMesh && floorMesh.w > 0,
            floorMesh ? floorMesh.w + "x" + floorMesh.h : "none");
        var ents = LAB.entrances();
        LAB.check("smoke: cave test generates at least one entrance", ents.length >= 1, "entrances=" + ents.length);
        LAB.check("smoke: auto-overview timer was cancelled", !overviewActive && LAB.timers.length === 0,
            "timers=" + LAB.timers.length);

        // Walking moves the player by roughly speed*time (90 u/s base).
        var start = LAB.worldPos();
        var E = ents[0];
        var far = LAB.axisWorld(E, 460, 0);
        LAB.placeWorld(far.x, far.y, "top");
        var p0 = LAB.worldPos();
        var tgt = LAB.axisWorld(E, 300, 0);
        var trace = LAB.walkTo(tgt.x, tgt.y, { maxTicks: 240 });
        var p1 = LAB.worldPos();
        var moved = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        LAB.metric("smoke.walk.ticks", trace.length);
        LAB.check("smoke: keyboard input moves the player through the real input path",
            moved > 100, "moved " + moved.toFixed(0) + "u in " + trace.length + " ticks");

        // Virtual clock: 60 ticks advance exactly one second.
        var c0 = Date.now(); LAB.tick(60);
        LAB.check("smoke: virtual clock advances 1000 ms per 60 ticks", Math.abs(Date.now() - c0 - 1000) < 0.05,
            "advanced " + (Date.now() - c0));

        // The recorder sees the floor pass.
        LAB.prepCamera();
        DEBUG_POLY_TYPES = true;
        var rec = LAB.record(function () {
            // An isolated geometry pass must start the same depth frame that
            // draw() initializes before the normal scene passes.
            beginSceneDepthFrame(canvas.width, canvas.height);
            drawLayersFloor3D();
        });
        DEBUG_POLY_TYPES = false;
        LAB.metric("smoke.floor.fills", rec.fills.length);
        LAB.check("smoke: recorder captures floor-pass fills", rec.fills.length > 100, JSON.stringify(rec.byClass));
        LAB.check("smoke: DEBUG_POLY_TYPES palette is classifiable", (rec.byClass.surface || 0) > 0,
            JSON.stringify(rec.byClass));

        // A real frame through loop()/renderFrame runs without render crashes.
        var errs = LAB.frame();
        LAB.check("smoke: one real loop() frame runs with no loop crash", errs === 0, "loopErrs=" + errs);
        LAB.check("smoke: no render-pass exceptions in that frame",
            Object.keys(_ptErrors).length === 0, JSON.stringify(_ptErrors));
    });

    LAB.scenario("smoke: normal endless seed steering", function () {
        var s = LAB.startEndless(424242);
        LAB.check("smoke: startEndless lands on the requested seed", s === 424242, "WORLD_SEED=" + s);
    });
}
LAB.finish();
undefined;
