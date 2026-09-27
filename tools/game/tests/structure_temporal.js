// Analytic projected line areas and shared temporal measurement contracts.
// These are numeric tests, not simulated Canvas appearance or frame-time claims.
(function () {
  var G=(0,eval)('this'),checked=0,failed=0;
  var out=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
  function check(name,okay,detail) {checked++;if(!okay)failed++;out((okay?'PASS ':'FAIL ')+name+(okay?'':' '+JSON.stringify(detail)));}
  function near(a,b) {return Number.isFinite(a)&&Math.abs(a-b)<1e-10;}
  function mutate(source,flag,before,after) {
    if(__argv.indexOf(flag)<0)return source;
    if(source.split(before).length!==2)throw Error('MUTATION_ANCHOR '+flag);
    return source.replace(before,after);
  }
  var temporal=slurp('tools/game/texture-temporal.js');
  temporal=mutate(temporal,'--ignore-local-shimmer','if (peak > lineThresholds.maxLocalTemporalRms)','if (false)');
  (0,eval)(temporal);
  var source=slurp('tools/game/structure-temporal.js');
  source=mutate(source,'--lose-denominator-slope',
    'var upperA=upper*den[0]-num[0], upperB=upper*den[1]-num[1], upperC=upper*d0-n0;',
    'var upperA=upper*den[0]-num[0], upperB=-num[1], upperC=upper*d0-n0;');
  source=mutate(source,'--ignore-lower-band-edge','polygon=clip(polygon,lowerA,lowerB,lowerC);','/* lost lower half-plane */');
  source=mutate(source,'--double-coverage-area','area+=Math.abs(twiceArea)*0.5;','area+=Math.abs(twiceArea);');
  source=mutate(source,'--truncate-negative-period',
    'var firstBand=Math.floor(minimum/period), lastBand=Math.floor(maximum/period);',
    'var firstBand=Math.trunc(minimum/period), lastBand=Math.trunc(maximum/period);');
  source=mutate(source,'--accept-backward-plane','if(!Number.isFinite(d)||d<=0)','if(!Number.isFinite(d))');
  source=mutate(source,'--unbounded-band-work','var maxBands = 128;','var maxBands = 256;');
  source=mutate(source,'--cancel-all-observed-motion',
    'return TextureTemporal.analyzeLocal(actualFrames,referenceFrames,width,height,settings);',
    'return TextureTemporal.analyzeLocal(actualFrames,actualFrames,width,height,settings);');
  source=mutate(source,'--relax-global-threshold',
    'settings.maxTemporalRms=TextureTemporal.thresholds.maxTemporalRms;',
    'settings.maxTemporalRms=1;');
  (0,eval)(source);var T=G.StructureTemporal;
  var motionSource=slurp('tools/game/structure-motion.js');
  motionSource=mutate(motionSource,'--wrong-legacy-camera-height',
    'var origin=[camera.x,camera.y,60+(camera.z-60)*25/40],',
    'var origin=[camera.x,camera.y,camera.z],');
  motionSource=mutate(motionSource,'--wrong-denominator-sign','var sign=k<0?-1:1;','var sign=1;');
  motionSource=mutate(motionSource,'--omit-horizontal-uv-gradient',
    'base*q[0]+k*dot(g,rx)','base*q[0]');
  (0,eval)(motionSource);var M=G.StructureMotion;
  function plane(numerator,denominator,period,width) {
    return {numerator:numerator,denominator:denominator,period:period===undefined?1:period,darkWidth:width===undefined?1/16:width};
  }
  function coverage(n,d,p,w,x,y) {return T.coverage(x||0,y||0,plane(n,d,p,w));}
  function rejects(callback) {try{callback();return false;}catch(error){return error instanceof RangeError;}}

  check('constant stripe interiors distinguish fully dark and fully light pixels',
    coverage([0,0,1/32],[0,0,1])===1&&coverage([0,0,1/2],[0,0,1])===0);
  check('constant coordinates honor the authored half open stripe edge',
    coverage([0,0,0],[0,0,1])===1&&coverage([0,0,1/16],[0,0,1])===0&&coverage([0,0,1],[0,0,1])===1);
  check('one and several complete stripe periods integrate their exact duty cycle',
    near(coverage([1,0,0],[0,0,1]),1/16)&&near(coverage([4,0,0],[0,0,1]),1/16));
  check('axis aligned subpixel stripe covers an independently authored half pixel',
    near(coverage([1/8,0,0],[0,0,1]),.5)&&near(coverage([0,1/8,0],[0,0,1]),.5));
  // x+y <= 1/2 cuts a right triangle with two half-unit legs: area=1/8.
  check('oblique affine stripe integrates a one eighth pixel triangle',near(coverage([1,1,0],[0,0,1],4,.5),1/8));
  // 0 <= x-y <= 1/2 has area 1/2 - (1/2)^2/2 = 3/8.
  check('both projected band edges bound the authored diagonal strip',near(coverage([1,-1,0],[0,0,1],4,.5),3/8));
  // x/(1+y) <= 1/2 yields x <= (1+y)/2, a trapezoid of area3/4.
  check('perspective denominator slope integrates a three quarter pixel trapezoid',near(coverage([1,0,0],[0,1,1],2,.5),3/4));
  // (x+y)/(1+x+y) <= 1/3 reduces to x+y <= 1/2.
  check('two axis perspective denominator retains its exact projected wedge',near(coverage([1,1,0],[1,1,1],2,1/3),1/8));
  // 1/(1+y) <= 3/4 iff y>=1/3: the covered rectangle has area2/3.
  check('reciprocal perspective coordinate integrates its independent two thirds area',near(coverage([0,0,1],[0,1,1],2,.75),2/3));
  // For x/(1+y), period1/2,width1/4: first band area3/8,
  // second band area5/24, total7/12 (integrate at y=1/3).
  check('multiple receding stripe bands sum exact independent polygon areas',near(coverage([1,0,0],[0,1,1],.5,.25),7/12));
  check('negative texture periods keep the authored three quarter dark overlap',
    near(coverage([1/16,0,-63/64],[0,0,1]),.75));
  check('negative screen pixels and reversed texture direction preserve duty cycle',
    near(coverage([1,0,0],[0,0,1],1,1/16,-1,-2),1/16)&&near(coverage([-1,0,0],[0,0,1]),1/16));
  check('whole period texture translation cannot move stripe coverage',
    near(coverage([1,0,0],[0,1,1],2,.5),coverage([1,8,8],[0,1,1],2,.5)));
  check('joint coefficient scaling leaves projective coverage unchanged',
    near(coverage([7,7,0],[7,7,7],2,1/3),1/8));
  check('pixel translation changes only coefficient origin not coverage',
    near(coverage([1,0,-12],[0,1,8],2,.5,12,-7),3/4));
  check('zero and full duty artwork has exact empty and complete coverage',
    coverage([1,1,0],[0,0,1],1,0)===0&&coverage([1,1,0],[0,0,1],1,1)===1);
  check('typed coefficient arrays use the same numeric plane contract',
    near(T.coverage(0,0,plane(new Float64Array([1,0,0]),new Float64Array([0,1,1]),2,.5)),3/4));
  var phase=[-.5,-.25,0,.25,.5,.75,1],expected=[0,.25,.5,.5,.5,.25,0];
  var measured=phase.map(function(p){return coverage([1/8,0,-p/8],[0,0,1]);});
  check('slow subpixel motion follows independently authored pixel overlap rather than point samples',
    measured.every(function(value,index){return near(value,expected[index]);}),measured);
  check('one hundred twenty eight candidate bands retain exact bounded area',
    near(coverage([127.5,0,0],[0,0,1]),16/255));
  check('oversized footprint fails explicitly rather than sampling or silently truncating bands',
    rejects(function(){coverage([128.5,0,0],[0,0,1]);}));
  check('unrepresentable period indices fail before a nonadvancing band loop',
    rejects(function(){coverage([1,0,1e20],[0,0,1]);}));
  var malformed=[null,plane([1,0],[0,0,1]),plane([1,0,NaN],[0,0,1]),plane([1,0,0],[0,Infinity,1]),
    plane([1,0,0],[0,0,1],0,.1),plane([1,0,0],[0,0,1],1,-.1),plane([1,0,0],[0,0,1],1,2)];
  check('missing nonfinite and malformed oracle planes cannot fabricate stable evidence',
    malformed.every(function(p){return rejects(function(){T.coverage(0,0,p);});})&&
    rejects(function(){T.coverage(NaN,0,plane([1,0,0],[0,0,1]));}));
  check('horizon crossings zero denominators and backward planes reject instead of becoming quality failures',
    [[1,0,-.5],[0,1,0],[0,0,0],[0,0,-1]].every(function(d){return rejects(function(){coverage([0,0,-1/32],d);});}));

  // Authored camera: legacy z28 means render/world z40. With w128,h97,
  // FOV90deg and pitch.03, focal64 and separately quantized horizon46.
  // Screen(80,62) therefore has forward-normalized direction(1,1/4,-1/4).
  // The expected intersections below are solved from these literal rays and
  // authored plane equations, never from planeFor coefficients or the mapper.
  var camera={x:3,y:-5,z:28,ang:0,pitch:.03,fov:Math.PI/2};
  function face(points,uv) {return {vertices:points.map(function(p){var q=uv(p);return{x:p[0],y:p[1],z:p[2],u:q[0],v:q[1]};})};}
  function at(coefficients,x,y) {return coefficients[0]*x+coefficients[1]*y+coefficients[2];}
  function value(p,x,y) {return at(p.numerator,x,y)/at(p.denominator,x,y);}
  function closePoint(hit,point) {return !!hit&&hit.point.every(function(value,index){return near(value,point[index]);});}
  var floor=face([[-200,-200,8],[300,-200,8],[300,300,8],[-200,300,8]],function(p){return[p[0]/32+.25,p[1]/16-.125];});
  var floorU=M.planeFor(floor,camera,'u',128,97),floorV=M.planeFor(floor,camera,'v',128,97);
  var floorHit=M.hit(floorU,80,62,true);
  check('floor reference converts legacy camera height and quantized horizon into authored forward depth',
    near(floorU.origin[2],40)&&floorHit&&near(floorHit.depth,128)&&closePoint(floorHit,[131,27,8]),floorHit);
  check('floor coefficient ratio matches independently authored world UV at the exact ray hit',
    near(value(floorU,80,62),139/32)&&near(value(floorV,80,62),25/16));
  var wall=face([[67,-100,-20],[67,100,-20],[67,100,100],[67,-100,100]],function(p){return[p[1]/16+.25,-p[2]/32+.5];});
  var wallU=M.planeFor(wall,camera,'u',128,97),wallV=M.planeFor(wall,camera,'v',128,97),wallHit=M.hit(wallU,80,62,true);
  check('axis wall coefficients retain horizontal UV gradient and forward rather than Euclidean depth',
    wallHit&&near(wallHit.depth,64)&&closePoint(wallHit,[67,11,24])&&
    near(value(wallU,80,62),15/16)&&near(value(wallV,80,62),-.25),wallHit);
  // Roof z=12+x/2: 40-t/4=12+(3+t)/2 => t=106/3.
  var roof=face([[-40,-80,-8],[80,-80,52],[80,80,52],[-40,80,-8]],function(p){return[p[0]/32+.125,p[1]/16+.25];});
  var roofU=M.planeFor(roof,camera,'u',128,97),roofV=M.planeFor(roof,camera,'v',128,97),roofHit=M.hit(roofU,80,62,true);
  check('sloped roof reference agrees with independent ray plane and UV solutions',
    roofHit&&near(roofHit.depth,106/3)&&closePoint(roofHit,[115/3,23/6,187/6])&&
    near(value(roofU,80,62),127/96)&&near(value(roofV,80,62),47/96),roofHit);
  var northWall=face([[-100,59,-20],[100,59,-20],[100,59,100],[-100,59,100]],function(p){return[p[0]/16+1,p[2]/32];});
  var turned=M.planeFor(northWall,Object.assign({},camera,{ang:Math.PI/2}),'u',128,97),turnedHit=M.hit(turned,80,62,true);
  check('quarter turn camera uses the authored right vector without swapping world axes',
    turnedHit&&near(turnedHit.depth,64)&&closePoint(turnedHit,[-13,59,24])&&near(value(turned,80,62),3/16),turnedHit);
  var reversed=M.planeFor({vertices:floor.vertices.slice().reverse()},camera,'u',128,97),reverseHit=M.hit(reversed,80,62,true);
  check('visible floor coefficient denominator stays positive for either face winding',
    at(floorU.denominator,80,62)>0&&at(reversed.denominator,80,62)>0&&
    near(value(reversed,80,62),139/32)&&reverseHit&&near(reverseHit.depth,128));
  check('finite plane hit outside the source polygon is rejected only when inside proof is requested',
    M.hit(wallU,2000,62,true)===null&&M.hit(wallU,2000,62,false)!==null&&M.hit(wallU,80,62,true)!==null);
  var behind=face([[-10,-100,-20],[-10,100,-20],[-10,100,100],[-10,-100,100]],function(p){return[p[1]/32,p[2]/32];});
  var nearWall=face([[3.5,-100,-20],[3.5,100,-20],[3.5,100,100],[3.5,-100,100]],function(p){return[p[1]/32,p[2]/32];});
  check('behind camera and before near plane intersections cannot become visible subjects',
    M.hit(M.planeFor(behind,camera,'u',128,97),80,62,true)===null&&
    M.hit(M.planeFor(nearWall,camera,'u',128,97),80,62,true)===null&&M.hit(floorU,64,46,true)===null);
  var invalidFaces=[{vertices:floor.vertices.map(function(p,i){return Object.assign({},p,i===3?{z:9}:{});})},
    {vertices:floor.vertices.map(function(p,i){return Object.assign({},p,i===3?{u:p.u+.5}:{});})},
    {vertices:[floor.vertices[0],floor.vertices[0],floor.vertices[0]]}];
  check('nonplanar geometry inconsistent UVs and degenerate faces fail before reference capture',
    invalidFaces.every(function(f){try{M.planeFor(f,camera,'u',128,97);return false;}catch(error){return /Degenerate|not planar/.test(error.message);}}));

  function frame(value,size) {var f=new Float64Array(size||64);f.fill(value);return f;}
  var stationary=[frame(.4),frame(.4)],stationaryResult=T.analyze(stationary,stationary,8,8);
  check('stationary uniform control reaches the shared analyzer without invented shimmer',
    stationaryResult.valid&&stationaryResult.status==='PASS'&&near(stationaryResult.temporalResidualRms,0));
  var moving=expected.map(function(dark){return frame(1-dark);});
  var movingResult=T.analyze(moving,moving,8,8,{requireMotion:true});
  check('real expected stripe motion is subtracted before global and local shimmer measurements',
    movingResult.valid&&movingResult.status==='PASS'&&movingResult.actualMotionRms>.1&&movingResult.referenceMotionRms>.1&&
    near(movingResult.temporalResidualRms,0)&&near(movingResult.maxLocalTemporalRms,0));
  var pulse=T.analyze([frame(.4),frame(.6),frame(.4)],[frame(.4),frame(.4),frame(.4)],8,8);
  check('unexplained intensity pulse remains a real quality failure with independent residual units',
    pulse.valid&&pulse.status==='QUALITY_FAILURE'&&near(pulse.temporalResidualRms,.2)&&near(pulse.spatialMae,1/15),pulse);
  var large=[frame(.4,4096),frame(.4,4096)],reference=[frame(.4,4096),frame(.4,4096)];
  for(var y=20;y<28;y++)for(var x=12;x<20;x++)large[1][y*64+x]=.6;
  var local=T.analyze(large,reference,64,64);
  check('localized line pulse cannot hide behind a passing whole image average',
    local.valid&&near(local.temporalResidualRms,.025)&&near(local.maxLocalTemporalRms,.2)&&local.status==='QUALITY_FAILURE'&&
    local.worstLocal.frame===1&&local.worstLocal.x===12&&local.worstLocal.y===20,local);
  var frozen=T.analyze([frame(.4),frame(.4)],[frame(.3),frame(.5)],8,8,{requireMotion:true});
  check('frozen actual capture fails setup even when its reference legitimately moves',!frozen.valid&&frozen.status==='SETUP_FAILURE');
  var invalid=[T.analyze([],[],8,8),T.analyze([frame(.4)], [frame(.4)],8,8),
    T.analyze([frame(.4),frame(NaN)],stationary,8,8),T.analyze(stationary,stationary,12,8),
    T.analyze(stationary,stationary,8,8,{minSamples:65}),
    T.analyze(stationary,stationary,8,8,{setupFailures:['No opaque target pixels were drawn']})];
  check('missing malformed and absent opaque workload stays setup failure not known shimmer',
    invalid.every(function(result){return !result.valid&&result.status==='SETUP_FAILURE';}));
  var pinned=T.analyze([frame(.4),frame(.46)],stationary,8,8,{maxTemporalRms:1,maxSpatialMae:1});
  check('structure diagnostics cannot relax established temporal and spatial quality gates',
    pinned.status==='QUALITY_FAILURE'&&near(pinned.temporalResidualRms,.06)&&
    pinned.thresholds.maxTemporalRms===.05&&pinned.thresholds.maxSpatialMae===.08&&
    pinned.localThresholds.maxLocalTemporalRms===.12&&pinned.localThresholds.maxFrameTemporalRms===.08,pinned);
  var quantized=T.analyze([frame(1),frame(1+1/160)],[frame(1),frame(1)],8,8);
  check('shared one byte Canvas allowance still contributes its full measured error',
    quantized.valid&&near(quantized.temporalResidualRms,1/160)&&near(quantized.spatialMae,1/320));
  var dependency=G.TextureTemporal,missing=false;
  try {G.TextureTemporal=undefined;T.analyze(stationary,stationary,8,8);}catch(error){missing=/requires TextureTemporal/.test(error.message);}finally{G.TextureTemporal=dependency;}
  check('missing shared analyzer is an explicit setup error rather than a silent green fallback',missing);
  out('STRUCTURE_TEMPORAL_RESULT '+(failed?'FAIL '+failed+'/':'PASS ')+checked);
}());
undefined;
