// Real dev-pilot mapper with authored numeric oracles. The Canvas recorder only
// checks deterministic preparation commands, not rasterization or frame time.
(function () {
  var G = (0, eval)('this'), checked = 0, failed = 0;
  var out = (__engine === 'node' || __engine === 'deno') ? console.log.bind(console) : __out;
  function check(name, okay, detail) {
    checked++;
    if (!okay) failed++;
    out((okay ? 'PASS ' : 'FAIL ') + name + (okay ? '' : ' ' + JSON.stringify(detail)));
  }
  function near(a, b) { return Number.isFinite(a) && Math.abs(a - b) < 1e-7; }
  function mutate(source, flag, before, after) {
    if (__argv.indexOf(flag) < 0) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + flag);
    return source.replace(before, after);
  }
  var source = slurp('tools/game/texture-mapping.js');
  source = mutate(source, '--affine-uv',
    'var u = (wa * a.u / a.depth + wb * b.u / b.depth + wc * c.u / c.depth) / inverse;',
    'var u = wa * a.u + wb * b.u + wc * c.u;');
  source = mutate(source, '--drop-near-uv',
    'u: previous.u + t * (current.u - previous.u),', 'u: previous.u,');
  source = mutate(source, '--wrong-near-plane', 'var nearDepth = 1;', 'var nearDepth = 2;');
  source = mutate(source, '--affine-viewport-uv',
    'u: ((1 - t) * a.u / a.depth + t * b.u / b.depth) / denominator,', 'u: (1 - t) * a.u + t * b.u,');
  source = mutate(source, '--unbounded-triangles',
    'var maxTriangles = options.maxTriangles === undefined ? 256 : options.maxTriangles;',
    'var maxTriangles = Math.max(64, options.maxTriangles === undefined ? 256 : options.maxTriangles);');
  source = mutate(source, '--global-random',
    'return function () { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };',
    'return function () { return Math.random(); };');
  source = mutate(source, '--transpose-material-transform',
    'ctx.transform(m11, m12, m21, m22, dx, dy);', 'ctx.transform(m11, m21, m12, m22, dx, dy);');
  source = mutate(source, '--leak-canvas-state',
    'ctx.restore();\n    return true;', '/* mutation: leak material transform and fill state */\n    return true;');
  (0, eval)(source);
  (0, eval)(slurp('assets/games/src/12-scene-depth.js'));
  var T = G.TexturePilot;
  function vertex(x, y, depth, u, v) { return {x:x, y:y, depth:depth, u:u, v:v}; }
  var a = vertex(0, 0, 2, 0, 0), b = vertex(12, 0, 6, 1, 0), c = vertex(0, 12, 6, 0, 1);
  var sample = T.perspectiveUV(a, b, c, 3, 3);
  // At (3,3), screen weights are 1/2,1/4,1/4. A physical planar
  // surface at depths 2,6,6 therefore has UV 1/8,1/8 and depth 3.
  check('receding surface samples perspective UV rather than sliding affine UV',
    sample && near(sample.u, 0.125) && near(sample.v, 0.125) && near(sample.depth, 3), sample);
  sample = T.perspectiveUV(a, vertex(12, 0, 2, 1, 0), vertex(0, 12, 2, 0, 1), 3, 3);
  check('equal depth control agrees with affine texture coordinates',
    sample && near(sample.u, 0.25) && near(sample.v, 0.25) && near(sample.depth, 2), sample);
  var corners = [a, b, c].map(function (p) { return T.perspectiveUV(a, b, c, p.x, p.y); });
  check('texture triangle vertices retain their authored material coordinates',
    corners.every(function (p, i) { return p && near(p.u, [0,1,0][i]) && near(p.v, [0,0,1][i]); }), corners);
  check('collinear screen triangle cannot produce misleading texture coordinates',
    T.perspectiveUV(a, vertex(6, 6, 2, 1, 0), vertex(12, 12, 2, 0, 1), 3, 3) === null);

  G.cam = {x:0, y:0}; G.projScale = 50;
  var C = {cosAng:1, sinAng:0, invTanHalf:1, w:100, h:100, horizonY:50, cameraZ:10};
  var crossing = [{x:-1,y:-2,z:0,u:0,v:0}, {x:3,y:-2,z:0,u:1,v:0}, {x:3,y:2,z:4,u:1,v:1}];
  var crossingBefore = JSON.stringify(crossing);
  var clipped = T.clipNear(crossing, G.cam, C, G.projScale);
  var production = G.projectSceneWorldPolygon(crossing, C);
  check('near plane fixture crosses the camera plane and retains visible geometry',
    crossing[0].x < 1 && crossing[1].x > 1 && clipped.length === 4 && production.length === 4,
    {clipped:clipped, production:production});
  check('texture pilot projects exactly the same clipped footprint as the game',
    clipped.length === production.length && clipped.every(function (p, i) {
      return near(p.x, production[i].x) && near(p.y, production[i].y) && near(p.depth, production[i].depth);
    }), {clipped:clipped, production:production});
  var cuts = clipped.filter(function (p) { return near(p.depth, 1); });
  check('near clipping interpolates material coordinates along the actual cut edge',
    cuts.length === 2 && cuts.every(function (p) { return near(p.u, 0.5); }) &&
    cuts.some(function (p) { return near(p.v, 0); }) && cuts.some(function (p) { return near(p.v, 0.5); }), cuts);
  check('clipping leaves source model vertices and material coordinates untouched', JSON.stringify(crossing) === crossingBefore);
  var hidden = [{x:-3,y:-2,z:0,u:0,v:0}, {x:-2,y:-2,z:0,u:1,v:0}, {x:-2,y:2,z:4,u:1,v:1}];
  check('entirely behind camera control has no projected texture surface', T.clipNear(hidden, G.cam, C, G.projScale).length === 0);
  G.cam = {x:12, y:-7};
  var rotatedC = Object.assign({}, C, {cosAng:Math.cos(0.63), sinAng:Math.sin(0.63)});
  var translated = crossing.map(function (p) {
    return {x:12 + p.x * rotatedC.cosAng - p.y * rotatedC.sinAng,
      y:-7 + p.x * rotatedC.sinAng + p.y * rotatedC.cosAng, z:p.z, u:p.u, v:p.v};
  });
  var rotated = T.clipNear(translated, G.cam, rotatedC, G.projScale);
  check('camera translation and yaw preserve the same material attachment and footprint',
    rotated.length === clipped.length && rotated.every(function (p, i) {
      return near(p.x, clipped[i].x) && near(p.y, clipped[i].y) && near(p.u, clipped[i].u) && near(p.v, clipped[i].v);
    }), rotated);

  function tessellate(polygon, options) {
    var triangles = [];
    var stats = T.tessellate(polygon, Object.assign({width:100,height:100,maxTriangles:256,maxDepth:6,errorPixels:0.01}, options),
      function (x, y, z) { triangles.push([x,y,z]); });
    return {stats:stats, triangles:triangles};
  }
  function area(triangles) {
    return triangles.reduce(function (sum, t) {
      return sum + Math.abs((t[1].x-t[0].x)*(t[2].y-t[0].y) - (t[1].y-t[0].y)*(t[2].x-t[0].x)) / 2;
    }, 0);
  }
  var plane = [vertex(0,0,2,0,0),vertex(32,0,20,1,0),vertex(32,32,20,1,1),vertex(0,32,2,0,1)];
  var unsplit = tessellate(plane, {maxDepth:0}), refined = tessellate(plane, {maxTriangles:256});
  check('receding face genuinely exercises adaptive subdivision', unsplit.triangles.length === 2 && refined.triangles.length > 2 && refined.stats.splits > 0,
    {unsplit:unsplit.stats, refined:refined.stats});
  check('adaptive splits preserve the complete authored screen area', near(area(refined.triangles), 1024), {area:area(refined.triangles), stats:refined.stats});
  var budgetRuns = [2,3,8,13].map(function (cap) { return {cap:cap, result:tessellate(plane, {maxTriangles:cap,maxDepth:12,errorPixels:0.000001})}; });
  check('hard triangle budget preserves whole visible face without exceeding the cap', budgetRuns.every(function (run) {
    return run.result.triangles.length >= 2 && run.result.triangles.length <= run.cap &&
      run.result.stats.triangles === run.result.triangles.length && near(area(run.result.triangles), 1024) && run.result.stats.capped > 0;
  }), budgetRuns.map(function (run) { return {cap:run.cap, stats:run.result.stats, area:area(run.result.triangles)}; }));
  var rejected = tessellate(plane, {maxTriangles:1});
  check('budget below a whole face rejects it explicitly instead of leaving half a hole',
    rejected.triangles.length === 0 && rejected.stats.rejected > 0, rejected.stats);

  // The authored triangle fills the 30x30 viewport but extends far beyond it.
  // At its viewport corner (30,30), weights .4,.3,.3 imply UV 1/6,1/6.
  var viewportTriangle = [vertex(0,0,2,0,0),vertex(100,0,6,1,0),vertex(0,100,6,0,1)];
  var cropped = tessellate(viewportTriangle, {width:30,height:30,maxDepth:0,maxTriangles:8});
  var viewportCuts = [].concat.apply([], cropped.triangles).filter(function (p) { return near(p.x,30) && near(p.y,30); });
  check('viewport fixture reaches its cut corner and emits only bounded coordinates',
    viewportCuts.length > 0 && near(area(cropped.triangles),900) && cropped.triangles.every(function (t) {
      return t.every(function (p) { return p.x>=-1e-8 && p.y>=-1e-8 && p.x<=30+1e-8 && p.y<=30+1e-8; });
    }), {stats:cropped.stats,area:area(cropped.triangles)});
  check('viewport clipping preserves perspective material coordinates', viewportCuts.length > 0 && viewportCuts.every(function (p) {
    return near(p.u,1/6) && near(p.v,1/6) && near(p.depth,10/3);
  }), viewportCuts);
  var outside = tessellate([vertex(120,120,2,0,0),vertex(140,120,2,1,0),vertex(120,140,2,0,1)]);
  check('fully offscreen negative control performs no texture triangle work', outside.triangles.length === 0, outside.stats);

  G.cam = {x:0,y:0};
  var nearFace = T.clipNear([{x:-1,y:-0.4,z:10.5,u:0,v:0}, {x:3,y:-0.4,z:10.5,u:1,v:0}, {x:3,y:0.4,z:10.5,u:1,v:1}],G.cam,C,G.projScale);
  var nearBounded = tessellate(nearFace,{maxTriangles:2,maxDepth:12,errorPixels:0.000001});
  check('near plane expanded face stays visible and obeys the same hard triangle cap',
    nearFace.length === 4 && nearBounded.triangles.length === 2 && nearBounded.stats.triangles === 2 && area(nearBounded.triangles)>1,
    {face:nearFace,stats:nearBounded.stats,area:area(nearBounded.triangles)});

  var invalid = [[], [a,b], [a,b,vertex(NaN,12,2,0,1)], [a,b,vertex(0,12,0,0,1)],
    [a,b,{x:0,y:12,depth:2,u:0}], [a,vertex(6,6,2,1,0),vertex(12,12,2,0,1)]];
  check('invalid depths coordinates UVs and degenerate faces never reach drawing', invalid.every(function (p) {
    return tessellate(p).triangles.length === 0;
  }));
  var inverted = tessellate(plane.slice().reverse(), {maxTriangles:8});
  check('reversed winding preserves full material surface rather than culling it accidentally',
    inverted.triangles.length > 0 && near(area(inverted.triangles),1024), inverted.stats);

  var recordings = [], created = [], patternCount = 0, sourceRecords = new WeakMap();
  function recordingContext(owner) {
    var calls = [], state = {fillStyle:'#decafe', strokeStyle:'#123456', globalAlpha:owner ? 1 : 0.4, sx:1, sy:1}, stack = [];
    var storage = new Uint8ClampedArray(0), storageW=0, storageH=0;
    function pixels() {
      if (!owner) throw Error('SETUP pixel operation needs a Canvas owner');
      if (storageW!==owner.width || storageH!==owner.height) {
        storageW=owner.width; storageH=owner.height; storage=new Uint8ClampedArray(storageW*storageH*4);
      }
      return storage;
    }
    function color(value) {
      var hex=/^#([0-9a-f]{6})$/i.exec(value), rgba=/^rgba\(([^)]+)\)$/.exec(value);
      if (hex) { var packed=parseInt(hex[1],16); return [packed>>16,(packed>>8)&255,packed&255,1]; }
      if (rgba) return rgba[1].split(',').map(Number);
      throw Error('SETUP unsupported recorded color '+value);
    }
    var methods = {
      canvas:owner,
      save:function () { stack.push(Object.assign({}, state)); calls.push(['save']); },
      restore:function () {
        var restored = stack.pop();
        if (!restored) throw Error('SETUP unbalanced Canvas state');
        Object.keys(state).forEach(function (key) { delete state[key]; });
        Object.assign(state, restored); calls.push(['restore']);
      },
      createPattern:function () { patternCount++; calls.push(['createPattern']); return {pattern:true}; },
      scale:function (x,y) { state.sx*=x; state.sy*=y; calls.push(['scale',x,y]); },
      // The recipe host keeps real rectangle RGBA storage so mip preparation
      // can read/write typed data. It deliberately does not rasterize strokes,
      // arcs, transformed patterns or antialiasing: native quality is separate.
      fillRect:function (x,y,w,h) {
        calls.push(['fillRect',x,y,w,h]);
        if (!owner) return;
        var data=pixels(), ink=color(state.fillStyle), alpha=ink[3]*state.globalAlpha;
        var left=Math.max(0,Math.ceil(x*state.sx-.5)), right=Math.min(storageW,Math.ceil((x+w)*state.sx-.5));
        var top=Math.max(0,Math.ceil(y*state.sy-.5)), bottom=Math.min(storageH,Math.ceil((y+h)*state.sy-.5));
        for (var py=top;py<bottom;py++) for (var px=left;px<right;px++) {
          var i=(py*storageW+px)*4, oldAlpha=data[i+3]/255, outAlpha=alpha+oldAlpha*(1-alpha);
          for (var channel=0;channel<3;channel++) data[i+channel]=outAlpha ? Math.round((ink[channel]*alpha+data[i+channel]*oldAlpha*(1-alpha))/outAlpha) : 0;
          data[i+3]=Math.round(outAlpha*255);
        }
      },
      createImageData:function (w,h) { return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)}; },
      getImageData:function (x,y,w,h) {
        var source=pixels(), result={width:w,height:h,data:new Uint8ClampedArray(w*h*4)};
        for (var py=0;py<h;py++) for (var px=0;px<w;px++) {
          if (x+px<0 || y+py<0 || x+px>=storageW || y+py>=storageH) continue;
          var src=((y+py)*storageW+x+px)*4,dst=(py*w+px)*4;
          for (var ch=0;ch<4;ch++) result.data[dst+ch]=source[src+ch];
        }
        calls.push(['getImageData',x,y,w,h]); return result;
      },
      putImageData:function (image,x,y) {
        var dest=pixels();
        for (var py=0;py<image.height;py++) for (var px=0;px<image.width;px++) {
          if (x+px<0 || y+py<0 || x+px>=storageW || y+py>=storageH) continue;
          var dst=((y+py)*storageW+x+px)*4,src=(py*image.width+px)*4;
          for (var ch=0;ch<4;ch++) dest[dst+ch]=image.data[src+ch];
        }
        calls.push(['putImageData',image.width,image.height,x,y]);
      }
    };
    var context = new Proxy(state, {
      set:function (target, key, value) { calls.push(['set',key,value]); target[key] = value; return true; },
      get:function (target, key) {
        if (key in target) return target[key];
        if (key in methods) return methods[key];
        return function () { calls.push([key].concat(Array.prototype.slice.call(arguments))); };
      }
    });
    var recording={calls:calls, context:context, stack:stack}; recordings.push(recording);
    if (owner) sourceRecords.set(owner,recording);
    return context;
  }
  G.document = {createElement:function (tag) {
    if (tag !== 'canvas') throw Error('SETUP unexpected element ' + tag);
    var canvas = {width:0,height:0}, context=recordingContext(canvas);
    canvas.getContext=function () { return context; };
    created.push(canvas); return canvas;
  }};
  // Preparation duration is deliberately not evidence here. Native browser
  // measurements belong to the owned test scene, not this recording host.
  G.performance = {now:function () { return 0; }};
  var oldRandom = Math.random, randomCalls = 0;
  Math.random = function () { randomCalls++; return 0.5; };
  var first, second, large;
  try { first = T.createCatalog(64); second = T.createCatalog(64); large = T.createCatalog(128); }
  finally { Math.random = oldRandom; }
  check('material baking never consumes gameplay random state', randomCalls === 0, {randomCalls:randomCalls});
  var names = ['wood','stone','iron','checker'];
  check('catalog prepares four real reusable tile sources at the requested resolution',
    names.every(function (name) {
      var small = first.materials[name], big = large.materials[name];
      return small && big && small.source.width === 64 && small.source.height === 64 && small.size === 64 &&
        big.source.width === 128 && big.source.height === 128 && big.size === 128;
    }), {created:created.length});
  check('reported texture bytes account for every decoded RGBA tile', first.baseBytes === 65536 && large.baseBytes === 262144 && first.bytes === 939024 && large.bytes === 873488,
    {small:first.bytes,large:large.bytes});
  check('rebuilding the same catalog produces identical authored texture commands', names.every(function (name) {
    return JSON.stringify(sourceRecords.get(first.materials[name].source).calls) === JSON.stringify(sourceRecords.get(second.materials[name].source).calls);
  }));
  var recipeRecords=names.map(function (name) { return sourceRecords.get(first.materials[name].source); });
  var signatures = recipeRecords.map(function (recording) { return JSON.stringify(recording.calls); });
  check('materials contain distinct repeatable detail rather than four flat placeholders',
    new Set(signatures).size === 4 && recipeRecords.every(function (recording) {
      var colors = recording.calls.filter(function (call) { return call[0] === 'set' && call[1] === 'fillStyle'; });
      return new Set(colors.map(function (call) { return call[2]; })).size > 2 &&
        recording.calls.filter(function (call) { return call[0] === 'fillRect'; }).length > 4;
    }));
  var beforeInvalid = created.length;
  check('unsupported tile sizes fail before allocating unbounded canvas storage', [0,32,63,256,NaN,Infinity].every(function (size) {
    try { T.createCatalog(size); return false; } catch (error) { return error instanceof RangeError; }
  }) && created.length === beforeInvalid);

  var paintContext = recordingContext(), paintRecord = recordings[recordings.length-1];
  var mapped = [vertex(8,12,2,0.25,0.5),vertex(40,20,2,1.25,0.5),vertex(20,60,2,0.25,1.5)];
  var firstDraw = T.drawTriangle(paintContext,mapped[0],mapped[1],mapped[2],first.materials.wood,{filter:'legacy'});
  var transform = paintRecord.calls.filter(function (call) { return call[0] === 'transform'; })[0];
  check('actual Canvas material transform maps authored tile coordinates to all screen corners',
    firstDraw && transform && mapped.every(function (p) {
      var x = p.u * 64, y = p.v * 64;
      return near(transform[1]*x+transform[3]*y+transform[5],p.x) && near(transform[2]*x+transform[4]*y+transform[6],p.y);
    }), transform);
  T.drawTriangle(paintContext,mapped[0],mapped[1],mapped[2],first.materials.wood,{filter:'legacy'});
  check('warm face drawing shares one Canvas pattern without rebaking source textures', patternCount === 1 && created.length === beforeInvalid,
    {patterns:patternCount,created:created.length});
  check('material drawing restores caller Canvas color alpha and state stack',
    paintContext.fillStyle === '#decafe' && paintContext.globalAlpha === 0.4 && paintRecord.stack.length === 0);
  var secondContext = recordingContext();
  T.drawTriangle(secondContext,mapped[0],mapped[1],mapped[2],first.materials.wood,{filter:'legacy'});
  check('separate Canvas contexts obtain their own cached material pattern', patternCount === 2);
  var callsBefore = paintRecord.calls.length;
  check('degenerate UV triangle cannot issue an invalid Canvas transform',
    !T.drawTriangle(paintContext,mapped[0],mapped[0],mapped[2],first.materials.wood,{filter:'legacy'}) && paintRecord.calls.length === callsBefore);
  out('TEXTURE_MAPPING_RESULT ' + (failed ? 'FAIL '+failed+'/' : 'PASS ') + checked);
}());
undefined;
