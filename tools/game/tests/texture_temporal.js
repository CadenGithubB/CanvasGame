// Pure temporal measurement/oracle contracts. Synthetic intensities establish
// the arithmetic; actual Canvas texture quality is checked in the native page.
(function () {
  var G=(0,eval)('this'), checked=0, failed=0;
  var out=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
  function check(name, okay, detail) {
    checked++; if (!okay) failed++;
    out((okay?'PASS ':'FAIL ')+name+(okay?'':' '+JSON.stringify(detail)));
  }
  function near(a,b) { return Number.isFinite(a) && Math.abs(a-b)<1e-10; }
  function equal(actual,expected) { return actual.length===expected.length && Array.prototype.every.call(actual,function (v,i) { return near(v,expected[i]); }); }
  function mutate(source,flag,before,after) {
    if (__argv.indexOf(flag)<0) return source;
    if (source.split(before).length!==2) throw Error('MUTATION_ANCHOR '+flag);
    return source.replace(before,after);
  }
  var source=slurp('tools/game/texture-temporal.js');
  source=mutate(source,'--count-expected-motion',
    'var residualDelta = actualDelta - referenceDelta;', 'var residualDelta = actualDelta;');
  source=mutate(source,'--wrong-normalization',
    'result.temporalResidualRms = Math.sqrt(residualDeltaSquared / pairs);',
    'result.temporalResidualRms = Math.sqrt(residualDeltaSquared / (actualFrames.length * count));');
  source=mutate(source,'--hide-invalid-workload',
    'if (options.setupFailures && options.setupFailures.length) {', 'if (false) {');
  source=mutate(source,'--reverse-oracle-phase',
    'integratedStripe(y - phase, y + 1 - phase, period, darkWidth)',
    'integratedStripe(y + phase, y + 1 + phase, period, darkWidth)');
  source=mutate(source,'--ignore-temporal-threshold',
    'if (result.temporalResidualRms > settings.maxTemporalRms)', 'if (false)');
  source=mutate(source,'--misclassify-setup-error',
    "var result = {valid: false, status: 'SETUP_FAILURE', failures: [], frames: 0, samplesPerFrame: 0,",
    "var result = {valid: false, status: 'QUALITY_FAILURE', failures: [], frames: 0, samplesPerFrame: 0,");
  source=mutate(source,'--lose-projected-line-slope',
    'polygon = clipOracleHalfPlane(polygon, -horizontal, upper - base, -upperConstant);',
    'polygon = clipOracleHalfPlane(polygon, -horizontal, 0, -upperConstant);');
  source=mutate(source,'--double-pixel-coverage', 'coverage += Math.abs(twiceArea) * 0.5;', 'coverage += Math.abs(twiceArea);');
  source=mutate(source,'--ignore-local-threshold', 'if (peak > lineThresholds.maxLocalTemporalRms)', 'if (false)');
  source=mutate(source,'--disjoint-local-windows',
    'top += 4) for (var left = 0; left <= width - 8; left += 4)',
    'top += 8) for (var left = 0; left <= width - 8; left += 8)');
  source=mutate(source,'--local-count-expected-motion',
    'var difference = (actualFrames[frame][index] - referenceFrames[frame][index]) -\n            (actualFrames[frame - 1][index] - referenceFrames[frame - 1][index]);',
    'var difference = actualFrames[frame][index] - actualFrames[frame - 1][index];');
  source=mutate(source,'--ignore-worst-frame',
    'if (result.maxFrameTemporalRms > lineThresholds.maxFrameTemporalRms)', 'if (false)');
  source=mutate(source,'--clamp-quantization-error',
    'var residual = actual[pixel] - expected[pixel];',
    'var residual = Math.min(1, Math.max(0, actual[pixel])) - expected[pixel];');
  (0,eval)(source);
  var T=G.TextureTemporal;

  // Authored stripe: dark [0,2), light [2,4), repeated in both directions.
  // These expected fractions come directly from interval lengths, not from a
  // second copy of the production antiderivative or reference sampler.
  check('stripe interior controls distinguish entirely dark and entirely light pixels',
    near(T.integratedStripe(0,1,4,2),1) && near(T.integratedStripe(2,3,4,2),0));
  check('fractional pixel crossing integrates the authored dark overlap', near(T.integratedStripe(0.5,2.5,4,2),0.75));
  check('period boundary and negative coordinates preserve exact half coverage',
    near(T.integratedStripe(3,5,4,2),0.5) && near(T.integratedStripe(-1,1,4,2),0.5) && near(T.integratedStripe(-3,-1,4,2),0.5));
  check('whole repeated intervals average duty cycle rather than sampling one point',
    near(T.integratedStripe(-1,11,4,2),0.5) && near(T.integratedStripe(0,12,3,1),1/3));
  var phase0=T.referenceStripeFrame(2,4,4,2,0), phaseHalf=T.referenceStripeFrame(2,4,4,2,0.5);
  check('analytic reference has independently authored row brightness and dimensions',
    equal(phase0,[0,0,0,0,1,1,1,1]),Array.from(phase0));
  check('analytic reference integrates fractional camera phase with correct sign',
    equal(phaseHalf,[0.5,0.5,0,0,0.5,0.5,1,1]) &&
    equal(T.referenceStripeFrame(2,4,4,2,-0.5),[0,0,0.5,0.5,1,1,0.5,0.5]),Array.from(phaseHalf));
  check('adding a whole stripe period does not alter the reference image',
    equal(T.referenceStripeFrame(2,4,4,2,4.5),Array.from(phaseHalf)));
  var invalidIntervals=[[0,0,4,2],[1,0,4,2],[0,1,0,0],[0,1,4,-1],[0,1,4,5],[NaN,1,4,2],[0,Infinity,4,2]];
  check('invalid oracle intervals fail explicitly instead of fabricating a stable image',invalidIntervals.every(function (args) {
    try { T.integratedStripe.apply(null,args); return false; } catch (error) { return error instanceof RangeError; }
  }));
  check('invalid reference dimensions and phase fail before making empty evidence',[[0,4,4,2,0],[2,0,4,2,0],[2.5,4,4,2,0],[2,4,4,2,NaN]].every(function (args) {
    try { T.referenceStripeFrame.apply(null,args); return false; } catch (error) { return error instanceof RangeError; }
  }));

  function analyze(actual,reference,options) { return T.analyze(actual,reference,options||{}); }
  var uniform=[[0.4,0.4],[0.4,0.4],[0.4,0.4]];
  var stable=analyze(uniform,uniform);
  check('stationary uniform control has no temporal shimmer', stable.valid && stable.status==='PASS' &&
    near(stable.temporalResidualRms,0) && near(stable.spatialMae,0),stable);
  var expected=[[0.1,0.2],[0.3,0.4],[0.6,0.8]];
  var moving=analyze(expected,expected,{requireMotion:true});
  check('expected camera motion is subtracted before measuring shimmer', moving.valid && moving.status==='PASS' &&
    moving.actualMotionRms>0.1 && moving.referenceMotionRms>0.1 && near(moving.temporalResidualRms,0),moving);
  var typed=analyze([phase0,phaseHalf],[phase0,phaseHalf],{requireMotion:true});
  check('actual typed pixel buffers exercise the same moving reference contract',
    typed.valid && typed.status==='PASS' && typed.samplesPerFrame===8 && near(typed.temporalResidualRms,0),typed);
  var pulse=analyze([[0,0],[0.2,0.2],[0,0]],[[0,0],[0,0],[0,0]]);
  check('temporal residual reports independently calculated channel units', pulse.valid &&
    near(pulse.temporalResidualRms,0.2) && near(pulse.spatialMae,1/15) && near(pulse.actualMotionRms,0.2) && near(pulse.referenceMotionRms,0),pulse);
  check('unexplained temporal pulse fails quality instead of passing a motion control', pulse.status==='QUALITY_FAILURE' && pulse.failures.length>0,pulse);
  var mixed=analyze([[0,0],[0.2,0],[0,0]],[[0,0],[0,0],[0,0]],{maxSpatialMae:1,maxTemporalRms:1});
  check('RMS normalizes across all frame transitions and sampled pixels',
    mixed.valid && near(mixed.temporalResidualRms,Math.sqrt(0.02)) && near(mixed.spatialMae,1/30),mixed);
  var biased=analyze([[0.2,0.3],[0.4,0.5],[0.7,0.9]],expected,{maxSpatialMae:0.2,requireMotion:true});
  check('constant material bias is spatial error rather than invented temporal shimmer', biased.valid && biased.status==='PASS' &&
    near(biased.temporalResidualRms,0) && near(biased.spatialMae,0.1),biased);
  var wrongStatic=analyze([[0.4,0.4],[0.4,0.4]],[[0.2,0.2],[0.2,0.2]]);
  check('a stable but wrong image cannot hide behind a zero shimmer metric', wrongStatic.valid &&
    wrongStatic.status==='QUALITY_FAILURE' && near(wrongStatic.temporalResidualRms,0) && near(wrongStatic.spatialMae,0.2),wrongStatic);
  var boundaryPass=analyze([[0],[0.2]],[[0],[0]],{maxTemporalRms:0.2,maxSpatialMae:1});
  var boundaryFail=analyze([[0],[0.2001]],[[0],[0]],{maxTemporalRms:0.2,maxSpatialMae:1});
  check('temporal quality threshold admits equality and rejects a genuine excess',
    boundaryPass.status==='PASS' && boundaryFail.status==='QUALITY_FAILURE',{equal:boundaryPass,above:boundaryFail});

  var invalidFrames=[{name:'missing capture',a:[],r:[]},{name:'single frame',a:[[0]],r:[[0]]},
    {name:'missing reference frame',a:[[0],[0]],r:[[0]]},{name:'no pixels',a:[[],[]],r:[[],[]]},
    {name:'ragged actual frame',a:[[0,0],[0]],r:[[0,0],[0,0]]},
    {name:'ragged reference frame',a:[[0,0],[0,0]],r:[[0,0],[0]]},
    {name:'nonfinite pixel',a:[[0],[NaN]],r:[[0],[0]]},
    {name:'invalid oracle pixel',a:[[0],[0]],r:[[0],[NaN]]},
    {name:'out of range pixel',a:[[0],[1.1]],r:[[0],[0]]}];
  check('missing malformed and nonfinite captures are setup failures not quality defects',invalidFrames.every(function (fixture) {
    var result=analyze(fixture.a,fixture.r);
    return !result.valid && result.status==='SETUP_FAILURE' && result.failures.length>0;
  }),invalidFrames.map(function (fixture) { return {name:fixture.name,result:analyze(fixture.a,fixture.r)}; }));
  var inadequate=analyze(uniform,uniform,{minFrames:4,minSamples:3});
  check('minimum evidence counts cannot pass with too few frames or samples',
    !inadequate.valid && inadequate.status==='SETUP_FAILURE',inadequate);
  var frozen=analyze(uniform,uniform,{requireMotion:true});
  check('required motion must actually reach the capture fixture',!frozen.valid && frozen.status==='SETUP_FAILURE',frozen);
  var frozenCapture=analyze([[0.1,0.2],[0.1,0.2],[0.1,0.2]],expected,{requireMotion:true});
  check('a moving oracle cannot conceal a frozen actual capture',
    !frozenCapture.valid && frozenCapture.status==='SETUP_FAILURE',frozenCapture);
  var badOptions=[{maxTemporalRms:NaN},{maxTemporalRms:-1},{maxSpatialMae:Infinity},
    {maxSpatialMae:-1},{minFrames:1.5},{minSamples:0}];
  check('invalid thresholds and evidence requirements cannot create vacuous passes',badOptions.every(function (options) {
    var result=analyze(uniform,uniform,options); return !result.valid && result.status==='SETUP_FAILURE';
  }));
  var absent=analyze(uniform,uniform,{setupFailures:['No textured triangles were drawn.']});
  check('missing rendered subjects cannot be classified as a known quality defect',
    !absent.valid && absent.status==='SETUP_FAILURE' && absent.failures.indexOf('No textured triangles were drawn.')>=0,absent);
  var transparent=analyze(expected,expected,{requireMotion:true,setupFailures:['Captured surface contains transparent pixels.']});
  check('transparent captures fail setup even when their intensity sequence matches the oracle',
    !transparent.valid && transparent.status==='SETUP_FAILURE' && transparent.failures.indexOf('Captured surface contains transparent pixels.')>=0,transparent);
  var brokenAndNoisy=analyze([[0],[1],[0]],[[0],[0],[0]],{setupFailures:['Reference floor did not cover the selected crop.']});
  check('setup failure takes precedence over a real temporal quality failure',
    !brokenAndNoisy.valid && brokenAndNoisy.status==='SETUP_FAILURE',brokenAndNoisy);

  var plane={centerX:0,horizon:0,focal:1,height:1,cameraX:0,cameraY:0,angle:0,axisX:0,axisY:1,period:10,darkWidth:0.5};
  // In this fixture q=x/y. The dark edge x=y/2 crosses the pixel square
  // x=[0,1],y=[1,2] at x=.5 and x=1: its dark trapezoid has area3/4.
  check('perspective line oracle integrates the authored three quarter pixel wedge',
    near(T.projectedStripeCoverage(0,1,plane),0.75),T.projectedStripeCoverage(0,1,plane));
  // With q=1/y, q<=.75 crosses the same square at y=4/3. Exactly2/3
  // of the pixel is dark; a screen-center sample cannot recover this answer.
  check('transverse perspective band has independently known two thirds coverage',
    near(T.projectedStripeCoverage(0,1,Object.assign({},plane,{axisX:1,axisY:0,darkWidth:0.75})),2/3));
  check('projected line positive and negative controls include full and empty pixels',
    near(T.projectedStripeCoverage(0,1,Object.assign({},plane,{darkWidth:2})),1)&&near(T.projectedStripeCoverage(1,1,plane),0));
  check('negative world stripe indices wrap without losing border coverage',
    near(T.projectedStripeCoverage(-1,1,Object.assign({},plane,{period:1})),0.25));
  check('camera yaw and world UV rotation preserve the same analytic stripe footprint',
    near(T.projectedStripeCoverage(0,1,Object.assign({},plane,{angle:Math.PI/2,axisX:-1,axisY:0})),0.75));
  check('invalid or unbounded perspective oracle inputs fail instead of inventing evidence',
    [{args:[0,0,plane]},{args:[0,1,Object.assign({},plane,{period:0})]},
     {args:[0,1,Object.assign({},plane,{period:0.000001,darkWidth:0.0000005})]}].every(function(fixture){
      try{T.projectedStripeCoverage.apply(null,fixture.args);return false;}catch(error){return error instanceof RangeError;}
    }));
  var calm=new Float64Array(64*64).fill(0.5),spot=calm.slice();
  for(var y=20;y<28;y++)for(var x=12;x<20;x++)spot[y*64+x]=0.7;
  var broad=T.analyze([calm,spot,calm],[calm,calm,calm]);
  var local=T.analyzeLocal([calm,spot,calm],[calm,calm,calm],64,64);
  check('localized long line pulse fails even when whole image RMS passes',
    broad.status==='PASS'&&near(broad.temporalResidualRms,0.025)&&local.valid&&local.status==='QUALITY_FAILURE'&&near(local.maxLocalTemporalRms,0.2),{broad:broad,local:local});
  check('overlapping local windows report the actual bad frame and screen neighborhood',
    local.worstLocal&&local.worstLocal.frame===1&&local.worstLocal.x===12&&local.worstLocal.y===20&&local.localTrace.length===2,local.worstLocal);
  var realMotion=[new Float64Array(64).fill(0.2),new Float64Array(64).fill(0.4),new Float64Array(64).fill(0.6)];
  var localMotion=T.analyzeLocal(realMotion,realMotion,8,8,{requireMotion:true});
  check('local windows subtract expected motion before claiming flicker',
    localMotion.valid&&localMotion.status==='PASS'&&near(localMotion.maxLocalTemporalRms,0),localMotion);
  var invalidLocal=T.analyzeLocal([calm,calm],[calm,calm],63,64);
  var missingLocal=T.analyzeLocal([calm,calm],[calm,calm],64,64,{setupFailures:['No opaque long-line subject']});
  check('local geometry and subject errors remain setup failures not known shimmer',
    !invalidLocal.valid&&invalidLocal.status==='SETUP_FAILURE'&&!missingLocal.valid&&missingLocal.status==='SETUP_FAILURE');
  var quietFrames=[],rareFrames=[];
  for(var frame=0;frame<20;frame++){quietFrames.push(new Float64Array(64).fill(0.5));rareFrames.push(new Float64Array(64).fill(frame===10?0.59:0.5));}
  var rare=T.analyzeLocal(rareFrames,quietFrames,8,8);
  check('rare full frame flicker cannot hide inside an otherwise calm replay',
    rare.valid&&rare.temporalResidualRms<0.05&&rare.maxLocalTemporalRms<0.12&&near(rare.maxFrameTemporalRms,0.09)&&rare.status==='QUALITY_FAILURE',rare);
  var white=new Float64Array(64).fill(1),oneByte=new Float64Array(64).fill(1+1/160),twoBytes=new Float64Array(64).fill(1+2/160);
  var measuredByte=T.analyzeLocal([white,oneByte],[white,white],8,8);
  check('one byte Canvas quantization remains in long line error metrics rather than being clamped',
    measuredByte.valid&&near(measuredByte.temporalResidualRms,1/160)&&near(measuredByte.spatialMae,1/320)&&near(measuredByte.maxLocalTemporalRms,1/160),measuredByte);
  var excessive=T.analyzeLocal([white,twoBytes],[white,white],8,8),strict=T.analyze([white,oneByte],[white,white]);
  check('larger overshoot and unchanged affine validation still fail setup',
    !excessive.valid&&excessive.status==='SETUP_FAILURE'&&!strict.valid&&strict.status==='SETUP_FAILURE');
  out('TEXTURE_TEMPORAL_RESULT '+(failed?'FAIL '+failed+'/':'PASS ')+checked);
}());
undefined;
