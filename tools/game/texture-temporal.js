// Development-only native pixel regression for material shimmer. This does not
// alter the mapper. Legacy sampling is retained as a real negative control.
// Pure analysis functions are usable without a browser; run() requires the real
// Canvas rasterizer and uses private canvases, never the preview/depth globals.
var TextureTemporal = (function () {
  var thresholds = Object.freeze({maxTemporalRms: 0.05, maxSpatialMae: 0.08});
  var fixture = Object.freeze({width: 128, height: 96, frames: 16, roiX: 16, roiY: 16,
    roiWidth: 96, roiHeight: 64, tileScreenSize: 9.6, stepPixels: 1 / 16,
    dark: 48, light: 208});
  // Fixed before measuring the long-line baseline. These additional gates do
  // not replace or relax the original .05 RMS / .08 spatial-error limits.
  // Eight-pixel neighborhoods prevent a coherent line defect being diluted by
  // a mostly unchanging floor. Half-window overlap avoids tile-edge blind spots.
  var lineThresholds = Object.freeze({maxFrameTemporalRms: 0.08,
    maxLocalTemporalRms: 0.12, tileSize: 8, stride: 4});
  var lineFixture = Object.freeze({width: 128, height: 96, frames: 16,
    roiX: 16, roiY: 20, roiWidth: 96, roiHeight: 32,
    focal: 64, horizon: 8, centerX: 64, period: 8, darkWidth: 1});

  // Independently integrate the known dark interval [k*period,k*period+width]
  // over a screen pixel footprint. This is not point sampling or mapper code.
  function integratedStripe(start, end, period, darkWidth) {
    if (![start, end, period, darkWidth].every(Number.isFinite) || end <= start ||
        period <= 0 || darkWidth < 0 || darkWidth > period) throw new RangeError('Invalid stripe interval');
    function primitive(x) {
      var periods = Math.floor(x / period), remainder = x - periods * period;
      return periods * darkWidth + Math.min(darkWidth, Math.max(0, remainder));
    }
    return Math.max(0, Math.min(1, (primitive(end) - primitive(start)) / (end - start)));
  }

  function referenceStripeFrame(width, height, period, darkWidth, phase) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
        width * height > 1048576 || !Number.isFinite(phase)) throw new RangeError('Invalid stripe frame');
    var result = new Float64Array(width * height);
    for (var y = 0; y < height; y++) {
      var value = 1 - integratedStripe(y - phase, y + 1 - phase, period, darkWidth);
      result.fill(value, y * width, (y + 1) * width);
    }
    return result;
  }

  function clipOracleHalfPlane(polygon, a, b, c) {
    var output = [], previous = polygon[polygon.length - 1];
    var previousValue = a * previous.x + b * previous.y + c;
    for (var i = 0; i < polygon.length; i++) {
      var current = polygon[i], value = a * current.x + b * current.y + c;
      if ((previousValue >= 0) !== (value >= 0)) {
        var t = previousValue / (previousValue - value);
        output.push({x: previous.x + t * (current.x - previous.x),
          y: previous.y + t * (current.y - previous.y)});
      }
      if (value >= 0) output.push(current);
      previous = current; previousValue = value;
    }
    return output;
  }

  // Exact coverage of periodic world-space stripe bands on z=0. The independent
  // ray/plane equation is q=base+height*(along*focal+across*(x-centerX))/(y-horizon).
  // A constant-q boundary is a straight line in screen space: clip the unit
  // pixel square against both band boundaries and integrate its polygon area.
  // No renderer projection, UV interpolation, tessellation or texture sampler
  // is consulted. Texture artwork must be authored axis-aligned integer bands;
  // rotate their WORLD UV axis, not a pre-rasterized diagonal bitmap.
  function projectedStripeCoverage(x, y, settings) {
    var s = settings;
    if (!s || ![x,y,s.centerX,s.horizon,s.focal,s.height,s.cameraX,s.cameraY,
        s.angle,s.axisX,s.axisY,s.period,s.darkWidth].every(Number.isFinite) ||
        s.focal <= 0 || s.height <= 0 || y <= s.horizon || s.period <= 0 ||
        s.darkWidth < 0 || s.darkWidth > s.period || (!s.axisX && !s.axisY)) {
      throw new RangeError('Invalid projected stripe footprint');
    }
    var cos = Math.cos(s.angle), sin = Math.sin(s.angle);
    var along = s.axisX * cos + s.axisY * sin;
    var across = -s.axisX * sin + s.axisY * cos;
    var base = s.axisX * s.cameraX + s.axisY * s.cameraY;
    var min = Infinity, max = -Infinity;
    for (var cy = 0; cy < 2; cy++) for (var cx = 0; cx < 2; cx++) {
      var coordinate = base + s.height * (along * s.focal + across * (x + cx - s.centerX)) / (y + cy - s.horizon);
      min = Math.min(min, coordinate); max = Math.max(max, coordinate);
    }
    var firstBand = Math.floor(min / s.period), lastBand = Math.floor(max / s.period);
    if (!Number.isFinite(min) || !Number.isFinite(max) || lastBand - firstBand > 64) {
      throw new RangeError('Projected stripe footprint exceeds oracle band budget');
    }
    var coverage = 0;
    for (var band = firstBand; band <= lastBand; band++) {
      var lower = band * s.period, upper = lower + s.darkWidth;
      var polygon = [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
      var horizontal = s.height * across;
      var lowerConstant = s.height * (along * s.focal + across * (x - s.centerX)) - (lower - base) * (y - s.horizon);
      polygon = clipOracleHalfPlane(polygon, horizontal, -(lower - base), lowerConstant);
      if (!polygon.length) continue;
      var upperConstant = s.height * (along * s.focal + across * (x - s.centerX)) - (upper - base) * (y - s.horizon);
      polygon = clipOracleHalfPlane(polygon, -horizontal, upper - base, -upperConstant);
      if (!polygon.length) continue;
      var twiceArea = 0;
      for (var p = 0; p < polygon.length; p++) {
        var next = polygon[(p + 1) % polygon.length];
        twiceArea += polygon[p].x * next.y - next.x * polygon[p].y;
      }
      coverage += Math.abs(twiceArea) * 0.5;
    }
    return Math.max(0, Math.min(1, coverage));
  }

  // Samples are normalized brightness in [0,1], not bytes. Subtract analytic
  // expected motion BEFORE measuring consecutive-frame residual differences.
  // A constant wrong color is a spatial error; real expected motion is not a
  // temporal defect. Missing/flat/frozen subjects must not produce a green gate.
  function analyze(actualFrames, referenceFrames, options) {
    options = options || {};
    var settings = {maxTemporalRms: options.maxTemporalRms === undefined ? thresholds.maxTemporalRms : options.maxTemporalRms,
      maxSpatialMae: options.maxSpatialMae === undefined ? thresholds.maxSpatialMae : options.maxSpatialMae,
      minFrames: options.minFrames === undefined ? 2 : options.minFrames,
      minSamples: options.minSamples === undefined ? 1 : options.minSamples,
      actualQuantizationMargin: options.actualQuantizationMargin === undefined ? 0 : options.actualQuantizationMargin};
    var result = {valid: false, status: 'SETUP_FAILURE', failures: [], frames: 0, samplesPerFrame: 0,
      temporalResidualRms: null, spatialMae: null, actualMotionRms: null, referenceMotionRms: null,
      maxFrameTemporalRms: null, worstTemporalFrame: null, temporalTrace: [], thresholds: settings};
    if (!Number.isFinite(settings.maxTemporalRms) || settings.maxTemporalRms < 0 ||
        !Number.isFinite(settings.maxSpatialMae) || settings.maxSpatialMae < 0 ||
        !Number.isInteger(settings.minFrames) || settings.minFrames < 2 ||
        !Number.isInteger(settings.minSamples) || settings.minSamples < 1 ||
        !Number.isFinite(settings.actualQuantizationMargin) || settings.actualQuantizationMargin < 0 || settings.actualQuantizationMargin > 1/160 ||
        (options.requireMotion !== undefined && typeof options.requireMotion !== 'boolean') ||
        (options.setupFailures !== undefined && (!Array.isArray(options.setupFailures) ||
          options.setupFailures.some(function (reason) { return typeof reason !== 'string' || !reason; })))) {
      result.failures.push('Invalid analysis settings'); return result;
    }
    if (options.setupFailures && options.setupFailures.length) {
      result.failures = options.setupFailures.slice(); return result;
    }
    if (!Array.isArray(actualFrames) || !Array.isArray(referenceFrames) ||
        actualFrames.length < settings.minFrames || actualFrames.length !== referenceFrames.length) {
      result.failures.push('Missing or mismatched frame sequence'); return result;
    }
    var count = actualFrames[0] && actualFrames[0].length;
    if (!Number.isInteger(count) || count < settings.minSamples) {
      result.failures.push('Missing pixel subjects'); return result;
    }
    var absolute = 0, residualDeltaSquared = 0, actualDeltaSquared = 0, referenceDeltaSquared = 0, peak = 0;
    for (var frame = 0; frame < actualFrames.length; frame++) {
      var actual = actualFrames[frame], expected = referenceFrames[frame];
      if (!actual || !expected || actual.length !== count || expected.length !== count) {
        result.failures.push('Ragged pixel subjects at frame ' + frame); return result;
      }
      var frameSquared = 0;
      for (var pixel = 0; pixel < count; pixel++) {
        if (!Number.isFinite(actual[pixel]) || !Number.isFinite(expected[pixel]) ||
            actual[pixel] < -settings.actualQuantizationMargin || actual[pixel] > 1 + settings.actualQuantizationMargin || expected[pixel] < 0 || expected[pixel] > 1) {
          result.failures.push('Invalid normalized pixel at frame ' + frame + ', sample ' + pixel +
            ': actual=' + actual[pixel] + ', expected=' + expected[pixel]); return result;
        }
        var residual = actual[pixel] - expected[pixel];
        absolute += Math.abs(residual);
        if (frame) {
          var actualDelta = actual[pixel] - actualFrames[frame - 1][pixel];
          var referenceDelta = expected[pixel] - referenceFrames[frame - 1][pixel];
          var residualDelta = actualDelta - referenceDelta;
          frameSquared += residualDelta * residualDelta;
          actualDeltaSquared += actualDelta * actualDelta;
          referenceDeltaSquared += referenceDelta * referenceDelta;
        }
      }
      if (frame) {
        var frameRms = Math.sqrt(frameSquared / count);
        residualDeltaSquared += frameSquared;
        if (frameRms > peak || result.worstTemporalFrame === null) { peak = frameRms; result.worstTemporalFrame = frame; }
        result.temporalTrace.push({frame: frame, residualRms: frameRms});
      }
    }
    var pairs = (actualFrames.length - 1) * count;
    result.frames = actualFrames.length; result.samplesPerFrame = count;
    result.temporalResidualRms = Math.sqrt(residualDeltaSquared / pairs);
    result.maxFrameTemporalRms = peak;
    result.spatialMae = absolute / (actualFrames.length * count);
    result.actualMotionRms = Math.sqrt(actualDeltaSquared / pairs);
    result.referenceMotionRms = Math.sqrt(referenceDeltaSquared / pairs);
    if (options.requireMotion && (result.actualMotionRms <= 1e-5 || result.referenceMotionRms <= 1e-5)) {
      result.failures.push('Motion fixture did not reach observable actual and expected change'); return result;
    }
    result.valid = true;
    if (result.temporalResidualRms > settings.maxTemporalRms) result.failures.push('Temporal residual exceeds contrast-normalized RMS limit');
    if (result.spatialMae > settings.maxSpatialMae) result.failures.push('Spatial residual exceeds contrast-normalized mean absolute limit');
    result.status = result.failures.length ? 'QUALITY_FAILURE' : 'PASS';
    return result;
  }

  function analyzeLocal(actualFrames, referenceFrames, width, height, options) {
    // Native opaque source-over blending produced 209 from authored208 in the
    // long-line baseline (all alpha255). Preserve this measured one-byte error
    // in every residual; only validation admits that bounded quantization. Old
    // affine cases continue to call analyze() with its strict0..1 default.
    var settings = Object.assign({},options,{actualQuantizationMargin:1/160});
    var result = analyze(actualFrames, referenceFrames, settings);
    result.localThresholds = lineThresholds;
    result.maxLocalTemporalRms = null; result.worstLocal = null; result.localTrace = [];
    if (!result.valid) return result;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8 ||
        width * height !== result.samplesPerFrame || (width - 8) % 4 || (height - 8) % 4) {
      result.valid = false; result.status = 'SETUP_FAILURE';
      result.failures.push('Invalid long-line neighborhood dimensions'); return result;
    }
    var peak = 0;
    for (var frame = 1; frame < actualFrames.length; frame++) {
      var framePeak = 0;
      for (var top = 0; top <= height - 8; top += 4) for (var left = 0; left <= width - 8; left += 4) {
        var squared = 0;
        for (var y = top; y < top + 8; y++) for (var x = left; x < left + 8; x++) {
          var index = y * width + x;
          var difference = (actualFrames[frame][index] - referenceFrames[frame][index]) -
            (actualFrames[frame - 1][index] - referenceFrames[frame - 1][index]);
          squared += difference * difference;
        }
        var rms = Math.sqrt(squared / 64);
        framePeak = Math.max(framePeak, rms);
        if (rms > peak || result.worstLocal === null) {
          peak = rms; result.worstLocal = {frame:frame,x:left,y:top,width:8,height:8,residualRms:rms};
        }
      }
      result.localTrace.push({frame:frame,maxNeighborhoodRms:framePeak});
    }
    result.maxLocalTemporalRms = peak;
    if (result.maxFrameTemporalRms > lineThresholds.maxFrameTemporalRms) result.failures.push('Worst-frame temporal residual exceeds long-line limit');
    if (peak > lineThresholds.maxLocalTemporalRms) result.failures.push('Local 8x8 temporal residual exceeds long-line limit');
    result.status = result.failures.length ? 'QUALITY_FAILURE' : 'PASS';
    return result;
  }

  function freshCanvas(width, height) {
    var canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    return canvas;
  }
  function stripeMaterial(size, uniform) {
    var source = freshCanvas(size, size), ctx = source.getContext('2d');
    ctx.fillStyle = uniform ? '#808080' : '#d0d0d0'; ctx.fillRect(0, 0, size, size);
    if (!uniform) {
      ctx.fillStyle = '#303030';
      for (var y = 0; y < size; y += size / 4) ctx.fillRect(0, y, size, size / 32);
    }
    var material = {source: source, size: size, color: '#808080'};
    TexturePilot.prepareMaterial(material);
    return material;
  }
  function vertex(x, y, depth, u, v) { return {x: x, y: y, depth: depth, u: u, v: v}; }
  function drawStripe(ctx, material, phase, smooth, tileScreenSize, filter) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, fixture.width, fixture.height);
    ctx.imageSmoothingEnabled = smooth; ctx.imageSmoothingQuality = 'low';
    // Both triangles have one identical affine map. No perspective subdivision,
    // near clipping, depth competition or changing topology can explain a fail.
    var coordinates = [[-16,-16],[144,-16],[144,112],[-16,112]];
    var p = coordinates.map(function (point) {
      return vertex(point[0], point[1], 20, point[0] / tileScreenSize,
        (point[1] - phase) / tileScreenSize);
    });
    var drawn = 0;
    if (TexturePilot.drawTriangle(ctx, p[0], p[1], p[2], material, {filter: filter})) drawn++;
    if (TexturePilot.drawTriangle(ctx, p[0], p[2], p[3], material, {filter: filter})) drawn++;
    return drawn;
  }
  function readStripe(ctx) {
    var bytes = ctx.getImageData(fixture.roiX, fixture.roiY, fixture.roiWidth, fixture.roiHeight).data;
    var values = new Float64Array(bytes.length / 4), opaque = 0, low = Infinity, high = -Infinity;
    for (var i = 0; i < values.length; i++) {
      if (bytes[i * 4 + 3] === 255) opaque++;
      var value = (bytes[i * 4] - fixture.dark) / (fixture.light - fixture.dark);
      values[i] = value; low = Math.min(low, value); high = Math.max(high, value);
    }
    return {values: values, opaque: opaque, low: low, high: high};
  }
  function yieldTurn() { return new Promise(function (resolve) { setTimeout(resolve, 0); }); }
  function assertActive(options) {
    if (options.cancelled && options.cancelled()) throw new Error('TEMPORAL_CANCELLED');
  }
  function progress(options, text) { if (options.onProgress) options.onProgress(text); }

  async function stripeCase(size, smooth, kind, options, filter) {
    filter = filter || 'stable';
    var canvas = freshCanvas(fixture.width, fixture.height), ctx = canvas.getContext('2d', {willReadFrequently: true});
    var material = stripeMaterial(size, kind === 'uniform'), actual = [], expected = [];
    var submitted = 0, opaque = 0, low = Infinity, high = -Infinity;
    var phases = [], tileSizes = [];
    for (var frame = 0; frame < fixture.frames; frame++) {
      assertActive(options);
      var phase = kind === 'stationary' ? 0 : frame * fixture.stepPixels;
      // Additional replay crosses an integer mip boundary at eight screen
      // pixels per tile. Original translation fixture above stays unchanged.
      var tileScreenSize = kind === 'zoom' ? 7.5 + frame / 16 : fixture.tileScreenSize;
      tileSizes.push(tileScreenSize);
      phases.push(phase); submitted += drawStripe(ctx, material, phase, smooth, tileScreenSize, filter);
      var pixels = readStripe(ctx); actual.push(pixels.values); opaque += pixels.opaque;
      low = Math.min(low, pixels.low); high = Math.max(high, pixels.high);
      var reference = kind === 'uniform' ? new Float64Array(fixture.roiWidth * fixture.roiHeight).fill(0.5) :
        referenceStripeFrame(fixture.roiWidth, fixture.roiHeight, tileScreenSize / 4,
          tileScreenSize / 32, phase - fixture.roiY);
      expected.push(reference);
      if (frame % 4 === 3) await yieldTurn();
    }
    var failures = [], expectedPixels = fixture.frames * fixture.roiWidth * fixture.roiHeight;
    if (submitted !== fixture.frames * 2) failures.push('Actual texture draw calls did not complete');
    if (opaque !== expectedPixels) failures.push('Fixture lost opaque pixels: ' + opaque + '/' + expectedPixels);
    if (kind !== 'uniform' && high - low < 0.05) failures.push('Actual mortar contrast disappeared; no material subject');
    var result = analyze(actual, expected, {minFrames: fixture.frames, minSamples: fixture.roiWidth * fixture.roiHeight,
      requireMotion: kind === 'moving' || kind === 'zoom', setupFailures: failures,
      // A static aliased image can have spatial error while remaining stationary.
      maxTemporalRms: kind === 'stationary' ? 1e-9 : thresholds.maxTemporalRms,
      maxSpatialMae: kind === 'stationary' ? 1 : thresholds.maxSpatialMae});
    return {id: (filter === 'legacy' ? 'legacy-' : '') + kind + '-' + size + '-' + (smooth ? 'smooth' : 'crisp'), analysis: result,
      workload: {frames: fixture.frames, submittedTriangles: submitted, opaqueSamples: opaque,
        filtering: filter, firstTileScreenSize: tileSizes[0], lastTileScreenSize: tileSizes[tileSizes.length - 1],
        expectedOpaqueSamples: expectedPixels, normalizedRange: [low, high], firstPhase: phases[0], lastPhase: phases[phases.length - 1],
        firstColumnSample: actual[0] ? Array.from({length: 12}, function (_, y) {
          return {screenY: fixture.roiY + y, actual: actual[0][y * fixture.roiWidth], expected: expected[0][y * fixture.roiWidth]};
        }) : []},
      samples: {actual: actual, expected: expected}};
  }
  function publicCase(result) { return {id: result.id, analysis: result.analysis, workload: result.workload}; }

  async function longLineCase(height, diagonal, options, mapping, transpose, graphics) {
    mapping=mapping||'planar'; transpose=!!transpose;
    var f = lineFixture, drawWidth=transpose?f.height:f.width, drawHeight=transpose?f.width:f.height;
    var canvas = freshCanvas(drawWidth, drawHeight);
    var ctx = canvas.getContext('2d', {willReadFrequently:!graphics}), material = stripeMaterial(128, false);
    var actual = [], expected = [], counts = [], cameraTrace = [], failures = [];
    var axisX = diagonal ? 0.5 : 0, axisY = diagonal ? Math.sqrt(3) * 0.5 : 1;
    var bounds = {x0:-80,y0:-200,x1:240,y1:200};
    var vertices = [[bounds.x0,bounds.y0],[bounds.x1,bounds.y0],[bounds.x1,bounds.y1],[bounds.x0,bounds.y1]].map(function (p) {
      return {x:p[0],y:p[1],z:0,u:(axisY*p[0]-axisX*p[1])/32,v:(axisX*p[0]+axisY*p[1])/32};
    });
    var workload = {frames:f.frames,submittedTriangles:0,submittedStrips:0,handledFrames:0,declinedFrames:0,failedDraws:0,cappedFrames:0,
      opaqueSamples:0,expectedOpaqueSamples:f.frames*f.roiWidth*f.roiHeight,
      insidePlaneFrames:0,contrastFrames:0,patternFills:0,topologyTriangleCounts:counts,
      cameraTrace:cameraTrace,axis:[axisX,axisY],cameraHeight:height,mapping:mapping,willReadFrequently:!graphics,
      mappingOrientation:transpose?'columns':'rows',canvasSize:[drawWidth,drawHeight],stripCounts:[],
      normalizedRange:[Infinity,-Infinity],rawRedRange:[255,0],outOfAuthoredRangeSamples:[],
      actualQuantizationMargin:1/160};
    var C = {w:f.width,h:f.height,cosAng:1,sinAng:0,invTanHalf:1,horizonY:f.horizon,cameraZ:height};
    for (var frame = 0; frame < f.frames; frame++) {
      assertActive(options);
      var camera = {x:-60+frame*0.08,y:frame*0.035}; cameraTrace.push({x:camera.x,y:camera.y});
      var settings = {centerX:f.centerX,horizon:f.horizon,focal:f.focal,height:height,
        cameraX:camera.x,cameraY:camera.y,angle:0,axisX:axisX,axisY:axisY,
        period:f.period,darkWidth:f.darkWidth};
      var inside = true;
      [[f.roiX,f.roiY],[f.roiX+f.roiWidth,f.roiY],
       [f.roiX+f.roiWidth,f.roiY+f.roiHeight],[f.roiX,f.roiY+f.roiHeight]].forEach(function (p) {
        var forward = f.focal * height / (p[1] - f.horizon);
        var wx = camera.x + forward, wy = camera.y + (p[0] - f.centerX) * forward / f.focal;
        if (!(forward>1 && wx>bounds.x0 && wx<bounds.x1 && wy>bounds.y0 && wy<bounds.y1)) inside=false;
      });
      if (inside) workload.insidePlaneFrames++;
      ctx.setTransform(1,0,0,1,0,0); ctx.globalAlpha=1; ctx.clearRect(0,0,drawWidth,drawHeight);
      ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='low';
      var polygon=TexturePilot.clipNear(vertices,camera,C,f.focal), filterStats={};
      if (polygon.length<3) throw Error('Long-line fixture lost its projected floor');
      // Transposing the exact same projective plane exercises vertical scan
      // bands without changing material content, motion, oracle or thresholds.
      if(transpose)polygon=polygon.map(function(p){return{x:p.y,y:p.x,depth:p.depth,u:p.u,v:p.v};});
      ctx.beginPath(); polygon.forEach(function (p,i) { if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y); });
      ctx.closePath(); ctx.fillStyle=material.color;ctx.fill();ctx.save();ctx.clip();
      var work;
      try {
        if(mapping==='legacy-mesh') {
          work=TexturePilot.tessellate(polygon,{width:drawWidth,height:drawHeight,maxTriangles:256,maxDepth:7,errorPixels:0.65},function (a,b,c) {
            if(TexturePilot.drawTriangle(ctx,a,b,c,material,{stats:filterStats}))workload.submittedTriangles++;
            else workload.failedDraws++;
          });
          counts.push(work.triangles);if(work.capped)workload.cappedFrames++;
        } else {
          work=TexturePilot.drawPlanarFace(ctx,polygon,material,{width:drawWidth,height:drawHeight,maxStrips:256,stats:filterStats});
          workload.stripCounts.push(work.strips);
          if(work.handled)workload.handledFrames++;else workload.declinedFrames++;
          if(work.failed)workload.failedDraws++;
          workload.submittedStrips+=work.strips;
          if(!work.handled||work.failed||work.strips<=0||work.strips>256||work.axis!==(transpose?'x':'y')) {
            failures.push('Planar long-line mapping did not handle frame '+frame+': '+(work.reason||'invalid strip workload'));
          }
          if(!(filterStats.patternFills>=work.strips&&filterStats.patternFills<=4*work.strips)) {
            failures.push('Planar long-line frame exceeded its bounded material-pass contract');
          }
        }
      } finally { ctx.restore(); }
      workload.patternFills+=filterStats.patternFills||0;
      var bytes=transpose?ctx.getImageData(f.roiY,f.roiX,f.roiHeight,f.roiWidth).data:
        ctx.getImageData(f.roiX,f.roiY,f.roiWidth,f.roiHeight).data;
      var samples=new Float64Array(f.roiWidth*f.roiHeight), reference=new Float64Array(samples.length);
      var low=Infinity,high=-Infinity;
      for(var y=0;y<f.roiHeight;y++)for(var x=0;x<f.roiWidth;x++) {
        var index=y*f.roiWidth+x;
        var byteIndex=(transpose?x*f.roiHeight+y:index)*4;
        if(bytes[byteIndex+3]===255)workload.opaqueSamples++;
        samples[index]=(bytes[byteIndex]-fixture.dark)/(fixture.light-fixture.dark);
        low=Math.min(low,samples[index]);high=Math.max(high,samples[index]);
        reference[index]=1-projectedStripeCoverage(f.roiX+x,f.roiY+y,settings);
        workload.rawRedRange[0]=Math.min(workload.rawRedRange[0],bytes[byteIndex]);
        workload.rawRedRange[1]=Math.max(workload.rawRedRange[1],bytes[byteIndex]);
        if((!Number.isFinite(samples[index])||samples[index]<0||samples[index]>1||
            !Number.isFinite(reference[index])||reference[index]<0||reference[index]>1)&&workload.outOfAuthoredRangeSamples.length<8) {
          workload.outOfAuthoredRangeSamples.push({frame:frame,index:index,x:transpose?f.roiY+y:f.roiX+x,y:transpose?f.roiX+x:f.roiY+y,
            rgba:Array.from(bytes.slice(byteIndex,byteIndex+4)),actual:samples[index],expected:reference[index]});
        }
      }
      workload.normalizedRange[0]=Math.min(workload.normalizedRange[0],low);
      workload.normalizedRange[1]=Math.max(workload.normalizedRange[1],high);
      if(high-low>0.05)workload.contrastFrames++;
      actual.push(samples);expected.push(reference);
      progress(options,'Long-line regression: '+mapping+' '+(transpose?'columns ': '')+(diagonal?'diagonal':'longitudinal')+' / height '+height+' / '+(frame+1)+'/'+f.frames);
      await yieldTurn();
    }
    if(workload.failedDraws || counts.some(function(count){return count<2;}))failures.push('Long-line texture workload missing or failed');
    if(mapping!=='legacy-mesh'&&(workload.handledFrames!==f.frames||workload.declinedFrames))failures.push('Planar long-line fixture fell back or left an unhandled frame');
    if(workload.opaqueSamples!==workload.expectedOpaqueSamples)failures.push('Long-line capture contains transparent pixels');
    if(workload.insidePlaneFrames!==f.frames)failures.push('Long-line crop is not inside its authored floor');
    if(workload.contrastFrames!==f.frames)failures.push('Long-line subject disappeared into the flat fallback');
    var analysis=analyzeLocal(actual,expected,f.roiWidth,f.roiHeight,{minFrames:f.frames,minSamples:f.roiWidth*f.roiHeight,
      requireMotion:true,setupFailures:failures});
    if(analysis.worstLocal) {
      var worst=analysis.worstLocal,frame=worst.frame,row=worst.y*f.roiWidth+worst.x;
      workload.worstLocalSample={screenX:transpose?f.roiY+worst.y:f.roiX+worst.x,screenY:transpose?f.roiX+worst.x:f.roiY+worst.y,frame:frame,
        actualPrevious:Array.from(actual[frame-1].slice(row,row+8)),actualCurrent:Array.from(actual[frame].slice(row,row+8)),
        expectedPrevious:Array.from(expected[frame-1].slice(row,row+8)),expectedCurrent:Array.from(expected[frame].slice(row,row+8))};
    }
    return {id:(mapping==='legacy-mesh'?'legacy-mesh-':'')+'perspective-long-line-'+(diagonal?'diagonal':'longitudinal')+'-height-'+height+(transpose?'-transposed-columns':'')+(graphics?'-graphics-context':''),
      analysis:analysis,workload:workload,
      oracle:'Exact projected world-stripe/pixel polygon overlap; opaque 128px axis-aligned source bands, world-UV rotation only.'};
  }

  // Descriptive real-stone comparison. Independent ray/plane sampling averages
  // 8x8 source-pixel samples per output pixel. Unlike the exact stripe oracle,
  // this finite supersampling is an approximation, so it never sets a hard gate.
  function stoneOracle(sourcePixels, size, cameraX, cameraY, samples) {
    var roi = {x: 16, y: 20, width: 96, height: 20};
    var result = new Float64Array(roi.width * roi.height), index = 0;
    for (var y = roi.y; y < roi.y + roi.height; y++) for (var x = roi.x; x < roi.x + roi.width; x++) {
      var total = 0;
      for (var sy = 0; sy < samples; sy++) for (var sx = 0; sx < samples; sx++) {
        // Authored plane z=0; focal64, horizon8, cameraheight18, yaw0.
        var forward = 64 * 18 / (y + (sy + 0.5) / samples - 8);
        var wx = cameraX + forward, wy = cameraY + (x + (sx + 0.5) / samples - 64) * forward / 64;
        var u = ((Math.floor(wx / 32 * size) % size) + size) % size;
        var v = ((Math.floor(wy / 32 * size) % size) + size) % size;
        var offset = (v * size + u) * 4;
        total += (sourcePixels[offset] * 0.2126 + sourcePixels[offset + 1] * 0.7152 + sourcePixels[offset + 2] * 0.0722) / 255;
      }
      result[index++] = total / (samples * samples);
    }
    return result;
  }
  function stoneVertices(x0, y0, x1, y1) {
    return [{x: x0, y: y0, z: 0, u: x0 / 32, v: y0 / 32},
      {x: x1, y: y0, z: 0, u: x1 / 32, v: y0 / 32},
      {x: x1, y: y1, z: 0, u: x1 / 32, v: y1 / 32},
      {x: x0, y: y1, z: 0, u: x0 / 32, v: y1 / 32}];
  }
  function stonePixels(ctx) {
    var bytes = ctx.getImageData(16, 20, 96, 20).data, result = new Float64Array(96 * 20), opaque = 0;
    for (var i = 0; i < result.length; i++) {
      if (bytes[i * 4 + 3] === 255) opaque++;
      result[i] = (bytes[i * 4] * 0.2126 + bytes[i * 4 + 1] * 0.7152 + bytes[i * 4 + 2] * 0.0722) / 255;
    }
    return {values: result, opaque: opaque};
  }
  async function stoneDiagnostic(options) {
    var material = TexturePilot.createCatalog(128).materials.stone;
    var source = material.source.getContext('2d').getImageData(0, 0, 128, 128).data;
    var fixed = freshCanvas(128, 96).getContext('2d', {willReadFrequently: true});
    var adaptive = freshCanvas(128, 96).getContext('2d', {willReadFrequently: true});
    var actualFixed = [], actualAdaptive = [], references = [], coarseReferences = [];
    var totals = {fixedTriangles: 0, adaptiveTriangles: 0, cappedFrames: 0, fixedOpaque: 0, adaptiveOpaque: 0, failedDraws: 0,
      insidePlaneFrames: 0, baseFaceFrames: 0, fixedContrastFrames: 0, adaptiveContrastFrames: 0};
    var camera = {x: -48, y: 0}, C = {w: 128, h: 96, cosAng: 1, sinAng: 0, invTanHalf: 1, horizonY: 8, cameraZ: 18};
    var face = stoneVertices(-20, -150, 160, 150), fixedFaces = [];
    for (var gy = 0; gy < 16; gy++) for (var gx = 0; gx < 16; gx++) {
      fixedFaces.push(stoneVertices(-20 + gx * 180 / 16, -150 + gy * 300 / 16,
        -20 + (gx + 1) * 180 / 16, -150 + (gy + 1) * 300 / 16));
    }
    for (var frame = 0; frame < fixture.frames; frame++) {
      assertActive(options); camera.x = -48 + frame * 0.08; camera.y = frame * 0.035;
      // Independently ray-cast the ROI's four outer footprint corners. On this
      // axis-aligned plane the extrema lie at these corners. The complete ROI
      // must be inside authored geometry, not rescued by a canvas-wide base.
      var insidePlane = true;
      [[16,20],[112,20],[112,40],[16,40]].forEach(function (corner) {
        var forward = 64 * 18 / (corner[1] - 8);
        var worldX = camera.x + forward, worldY = camera.y + (corner[0] - 64) * forward / 64;
        if (!(forward > 1 && worldX > -20 && worldX < 160 && worldY > -150 && worldY < 150)) insidePlane = false;
      });
      if (insidePlane) totals.insidePlaneFrames++;
      var projectedFace = TexturePilot.clipNear(face, camera, C, 64);
      if (projectedFace.length >= 3) totals.baseFaceFrames++;
      [fixed, adaptive].forEach(function (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 128, 96);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
        // The material study paints an opaque base beneath expanded texture
        // triangles. Mirror that contract over the actual projected face, and
        // keep texture overlap inside it. The measured ROI is strictly interior
        // so Canvas boundary AA is outside this temporal sampling diagnostic.
        ctx.beginPath();
        projectedFace.forEach(function (point, index) {
          if (!index) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
        });
        ctx.closePath(); ctx.fillStyle = material.color; ctx.fill();
        ctx.save(); ctx.clip();
      });
      fixedFaces.forEach(function (vertices) {
        var polygon = TexturePilot.clipNear(vertices, camera, C, 64);
        for (var i = 1; i + 1 < polygon.length; i++) {
          if (TexturePilot.drawTriangle(fixed, polygon[0], polygon[i], polygon[i + 1], material)) totals.fixedTriangles++;
          else totals.failedDraws++;
        }
      });
      var work = TexturePilot.tessellate(projectedFace,
        {width: 128, height: 96, maxTriangles: 256, maxDepth: 7, errorPixels: 0.65}, function (a, b, c) {
          if (TexturePilot.drawTriangle(adaptive, a, b, c, material)) totals.adaptiveTriangles++;
          else totals.failedDraws++;
        });
      if (work.capped) totals.cappedFrames++;
      fixed.restore(); adaptive.restore();
      var a = stonePixels(fixed), b = stonePixels(adaptive);
      // Base fill alone cannot satisfy a real-stone workload: each frame must
      // retain visible material contrast, and analyze() also requires motion.
      if (Math.max.apply(null, a.values) - Math.min.apply(null, a.values) > 0.025) totals.fixedContrastFrames++;
      if (Math.max.apply(null, b.values) - Math.min.apply(null, b.values) > 0.025) totals.adaptiveContrastFrames++;
      actualFixed.push(a.values); actualAdaptive.push(b.values); totals.fixedOpaque += a.opaque; totals.adaptiveOpaque += b.opaque;
      references.push(stoneOracle(source, 128, camera.x, camera.y, 8));
      coarseReferences.push(stoneOracle(source, 128, camera.x, camera.y, 4));
      progress(options, 'Shimmer diagnostic: real stone ' + (frame + 1) + '/' + fixture.frames);
      await yieldTurn();
    }
    var failures = [], expectedPixels = fixture.frames * 96 * 20;
    if (totals.fixedTriangles !== fixture.frames * 512 || !totals.adaptiveTriangles || totals.failedDraws) failures.push('Stone diagnostic mapping workload missing or failed');
    if (totals.fixedOpaque !== expectedPixels || totals.adaptiveOpaque !== expectedPixels) failures.push('Stone diagnostic lost opaque region coverage');
    if (totals.insidePlaneFrames !== fixture.frames || totals.baseFaceFrames !== fixture.frames) failures.push('Stone diagnostic ROI is not inside its authored plane');
    if (totals.fixedContrastFrames !== fixture.frames || totals.adaptiveContrastFrames !== fixture.frames) failures.push('Stone diagnostic shows only a blank material fallback');
    var diagnosticOptions = {minFrames: fixture.frames, minSamples: 96 * 20, requireMotion: true,
      maxTemporalRms: 1, maxSpatialMae: 1, setupFailures: failures};
    function describe(actual, expected, settings) {
      var metrics = analyze(actual, expected, settings);
      metrics.qualityGated = false;
      if (metrics.valid) metrics.status = 'DESCRIPTIVE';
      return metrics;
    }
    return {id: 'oblique-real-stone-fixed-vs-adaptive', descriptiveOnly: true,
      fixed: describe(actualFixed, references, diagnosticOptions), adaptive: describe(actualAdaptive, references, diagnosticOptions),
      referenceConvergence4x4vs8x8: describe(coarseReferences, references, {maxTemporalRms: 1, maxSpatialMae: 1}),
      workload: totals, setupFailures: failures,
      units: 'Absolute normalized sRGB luminance, not stripe material-contrast units',
      limitations: 'Finite 8x8 supersampling is an approximate independent ray-plane reference. Fixed512-world-triangle and adaptive-capped topologies have different approximation errors; this comparison describes behavior, not proof of a single cause or performance.'};
  }

  async function run(options) {
    options = options || {};
    var report = {kind: 'native-texture-temporal-regression', fixtureVersion: 4, complete: false, pass: false,
      status: 'RUNNING', knownIssue: 'TEX-SHIMMER-001', fixture: fixture, thresholds: thresholds,
      longLineFixture:lineFixture,longLineThresholds:lineThresholds,
      cases: [], controls: [], diagnostics: [], setupFailures: [], qualityFailures: [],
      limitations: 'Private native Canvas pixel readbacks, not a performance benchmark. Exact analytic stripe tests isolate temporal sampling from perspective subdivision. Real stone comparison is descriptive. CSS enlargement and full-game timing are outside this test.'};
    try {
      if (typeof TexturePilot === 'undefined' || !TexturePilot.drawTriangle || typeof document === 'undefined') throw new Error('Native Canvas and TexturePilot are required');
      if ((options.cancelled !== undefined && typeof options.cancelled !== 'function') ||
          (options.onProgress !== undefined && typeof options.onProgress !== 'function')) throw new Error('Invalid run callbacks');
      var first = null;
      for (var kind of ['moving', 'zoom']) for (var size of [64, 128]) for (var smooth of [false, true]) {
        assertActive(options); progress(options, 'Shimmer regression: ' + kind + ' ' + size + 'px ' + (smooth ? 'smooth' : 'crisp'));
        var result = await stripeCase(size, smooth, kind, options);
        if (!first) first = result;
        report.cases.push(publicCase(result));
        if (!result.analysis.valid) report.setupFailures.push(result.id + ': ' + result.analysis.failures.join('; '));
        else if (result.analysis.status !== 'PASS') report.qualityFailures.push(result.id);
      }
      for(var lineHeight of [18,30])for(var diagonal of [false,true]) {
        var lineResult=await longLineCase(lineHeight,diagonal,options);
        report.cases.push(lineResult);
        if(!lineResult.analysis.valid)report.setupFailures.push(lineResult.id+': '+lineResult.analysis.failures.join('; '));
        else if(lineResult.analysis.status!=='PASS')report.qualityFailures.push(lineResult.id);
      }
      var columnResult=await longLineCase(18,false,options,'planar',true);
      report.cases.push(columnResult);
      if(!columnResult.analysis.valid)report.setupFailures.push(columnResult.id+': '+columnResult.analysis.failures.join('; '));
      else if(columnResult.analysis.status!=='PASS')report.qualityFailures.push(columnResult.id);
      // Keep the original readback-optimized captures above as compatibility
      // gates. Also exercise the context preference used by the real preview;
      // browser CPU/GPU raster paths need not round four-pass blends alike.
      // The authored scene, contrast, ROI, oracle and thresholds are identical.
      for(var gpuFixture of [[18,false,false],[18,true,false],[30,false,false],[30,true,false],[18,false,true]]){
        var graphicsResult=await longLineCase(gpuFixture[0],gpuFixture[1],options,'planar',gpuFixture[2],true);
        report.cases.push(graphicsResult);
        if(!graphicsResult.analysis.valid)report.setupFailures.push(graphicsResult.id+': '+graphicsResult.analysis.failures.join('; '));
        else if(graphicsResult.analysis.status!=='PASS')report.qualityFailures.push(graphicsResult.id);
      }
      var meshControl=await longLineCase(18,false,options,'legacy-mesh');
      var meshDetected=meshControl.analysis.valid&&meshControl.analysis.status==='QUALITY_FAILURE'&&
        meshControl.analysis.maxLocalTemporalRms>lineThresholds.maxLocalTemporalRms;
      report.controls.push(Object.assign(meshControl,{negativeControl:true,expectedStatus:'QUALITY_FAILURE',controlPass:meshDetected,detected:meshDetected}));
      if(!meshDetected)report.setupFailures.push('Legacy adaptive-mesh long-line defect was not detected');
      progress(options, 'Shimmer regression: stationary and uniform controls');
      var stationary = await stripeCase(128, false, 'stationary', options);
      var uniform = await stripeCase(128, false, 'uniform', options);
      report.controls.push(publicCase(stationary), publicCase(uniform));
      var exact = analyze(first.samples.expected, first.samples.expected, {requireMotion: true, minFrames: fixture.frames, minSamples: fixture.roiWidth * fixture.roiHeight});
      report.controls.push({id: 'analytic-moving-reference', analysis: exact});
      var pulse = first.samples.expected.map(function (frame, index) {
        var output = new Float64Array(frame.length), amount = index % 2 ? 0.18 : -0.18;
        for (var i = 0; i < frame.length; i++) output[i] = Math.max(0, Math.min(1, frame[i] + amount));
        return output;
      });
      var injected = analyze(pulse, first.samples.expected, {requireMotion: true, minFrames: fixture.frames, minSamples: fixture.roiWidth * fixture.roiHeight});
      var detected = injected.valid && injected.status === 'QUALITY_FAILURE' && injected.temporalResidualRms > thresholds.maxTemporalRms;
      report.controls.push({id: 'injected-pulse-negative-control', negativeControl: true,
        expectedStatus: 'QUALITY_FAILURE', controlPass: detected, detected: detected, analysis: injected});
      [stationary.analysis, uniform.analysis, exact].forEach(function (control, index) {
        if (!control.valid || control.status !== 'PASS') report.setupFailures.push('Positive control failed: ' + ['stationary','uniform','analytic motion'][index]);
      });
      if (!detected) report.setupFailures.push('Injected temporal defect was not detected');
      var legacy = await stripeCase(128, false, 'moving', options, 'legacy');
      var legacyDetected = legacy.analysis.valid && legacy.analysis.status === 'QUALITY_FAILURE' &&
        legacy.analysis.temporalResidualRms > thresholds.maxTemporalRms;
      report.controls.push(Object.assign(publicCase(legacy), {detected: legacyDetected, negativeControl: true,
        expectedStatus: 'QUALITY_FAILURE', controlPass: legacyDetected}));
      if (!legacyDetected) report.setupFailures.push('Legacy raw sampling defect was not detected');
      assertActive(options); progress(options, 'Shimmer diagnostic: oblique real stone');
      var diagnostic = await stoneDiagnostic(options); report.diagnostics.push(diagnostic);
      if (!diagnostic.fixed.valid || !diagnostic.adaptive.valid) report.setupFailures.push('Real-stone diagnostic setup failed');
      report.complete = true;
      report.status = report.setupFailures.length ? 'SETUP_FAILURE' : report.qualityFailures.length ? 'QUALITY_FAILURE' : 'PASS';
      report.pass = report.status === 'PASS';
    } catch (error) {
      if (error.message === 'TEMPORAL_CANCELLED') report.status = 'CANCELLED';
      else { report.status = 'SETUP_FAILURE'; report.setupFailures.push(error.message); }
    }
    return report;
  }

  return {integratedStripe: integratedStripe, referenceStripeFrame: referenceStripeFrame,
    projectedStripeCoverage:projectedStripeCoverage,analyzeLocal:analyzeLocal,
    analyze: analyze, run: run, thresholds: thresholds,lineThresholds:lineThresholds};
}());
