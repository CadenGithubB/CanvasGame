// Contract checks for the headless host itself, not gameplay assertions.
(function () {
    var source = slurp("tools/webui/harness/_game_env.js");
    if (__argv.indexOf('--break-canvas-restore') >= 0) {
        var anchor = 'if (contextStack.length) ctxState = contextStack.pop();';
        if (source.split(anchor).length !== 2) throw new Error('host mutation anchor changed');
        source = source.replace(anchor, '/* state restore disabled */');
    }
    if (__argv.indexOf('--break-ms-metric-guard') >= 0) {
        var guard = 'if (unit === "ms" && !/_ms$/.test(id)) throw';
        if (source.split(guard).length !== 2) throw new Error('host mutation anchor changed');
        source = source.replace(guard, 'if (false) throw');
    }
    (0, eval)(source);
})();
LAB.init(__out, slurp, __engine, __argv);
LAB.check("env: game loads", LAB.load(__argv[0]), String(LAB.loadError || ""));
(function () {
    if (!LAB.loaded) return;
    var begin = beginSceneDepthFrame;
    if (__argv.indexOf('--break-depth-reset') >= 0) beginSceneDepthFrame = function () { return true; };
    LAB.scenario('env: canvas state', function () {
        ctx.fillStyle = '#123456'; ctx.globalAlpha = 0.7;
        var depth = LAB.saveDepth();
        ctx.save(); ctx.fillStyle = '#abcdef'; ctx.globalAlpha = 0.2;
        ctx.save(); ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 1;
        ctx.restore();
        var nested = ctx.fillStyle === '#abcdef' && ctx.globalAlpha === 0.2;
        ctx.restore();
        LAB.check('env: nested canvas restore preserves material and alpha',
            nested && ctx.fillStyle === '#123456' && ctx.globalAlpha === 0.7 && LAB.saveDepth() === depth);
    });
    LAB.scenario('env: isolated render passes', function () {
        var quad = [{x:10,y:10,depth:20},{x:30,y:10,depth:20},
                    {x:30,y:30,depth:20},{x:10,y:30,depth:20}];
        LAB.prepCamera();
        var visible = fillSceneDepthPolygon(quad);
        LAB.check('env: prepared pass writes real scene depth', visible > 0 && Math.abs(sceneDepthAt(20,20)-20) < 1e-4);
        var hidden = withSceneDepthBillboard({x:12,y:12,width:10,height:10}, 40, function () {});
        LAB.check('env: nearer geometry actually occludes a farther target', visible > 0 && hidden === 0);
        LAB.prepCamera();
        var reset = withSceneDepthBillboard({x:12,y:12,width:10,height:10}, 40, function () {});
        LAB.check('env: next isolated pass cannot inherit old occlusion', visible > 0 && reset > 0 && sceneDepthAt(20,20) === Infinity);
    });
    beginSceneDepthFrame = begin;
    // Lab protocol, not the game: two runs are compared check for check and
    // metric for metric except the *_ms metrics, so a timing ("ms") metric
    // must carry that suffix or every run would read as non-deterministic.
    LAB.scenario('env: metric ids', function () {
        function rejects(id) { try { LAB.metric(id, 0, 'ms'); return false; } catch (e) { return /_ms/.test(String(e.message)); } }
        var bad = rejects('env.probe.ms.timing'), good = rejects('env.probe.timing_ms');
        LAB.check('env: a timing (ms) metric whose id does not end in _ms is rejected',
            bad && !good, 'unsuffixed id rejected ' + bad + ', suffixed id rejected ' + good);
    });
})();
LAB.finish();
