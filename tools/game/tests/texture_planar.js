// Submitted Canvas transforms for perspective planar strips, not a rasterizer.
// Expectations come from independently authored world planes and camera rays.
(function () {
  var G=(0,eval)('this'),checked=0,failed=0;
  var out=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
  function check(name,okay,detail) { checked++; if(!okay)failed++; out((okay?'PASS ':'FAIL ')+name+(okay?'':' '+JSON.stringify(detail))); }
  function near(a,b,tolerance) { return Number.isFinite(a)&&Math.abs(a-b)<(tolerance||1e-8); }
  function mutate(source,flag,before,after) {
    if(__argv.indexOf(flag)<0)return source;
    if(source.split(before).length!==2)throw Error('MUTATION_ANCHOR '+flag);
    return source.replace(before,after);
  }
  var source=slurp('tools/game/texture-mapping.js');
  source=mutate(source,'--omit-perspective-division',
    'var u = uq / inverse, v = vq / inverse;', 'var u = uq, v = vq;');
  source=mutate(source,'--shift-strip-phase',
    'var line = band + 0.5, minimum = Infinity, maximumSpan = -Infinity;',
    'var line = band, minimum = Infinity, maximumSpan = -Infinity;');
  source=mutate(source,'--skip-strip-rows',
    'for (var band = begin; band < end; band++) {', 'for (var band = begin; band < end; band += 2) {');
  source=mutate(source,'--ignore-strip-budget',
    "if (bands.length >= maximum) return decline('strip-budget');", "if (false) return decline('strip-budget');");
  source=mutate(source,'--ignore-plane-consistency',
    "if (!Number.isFinite(value) || Math.abs(value - expected[channel]) > 1e-8 * Math.max(1e-6, Math.abs(expected[channel]))) return decline('nonplanar-depth-or-uv');",
    "if (!Number.isFinite(value)) return decline('nonplanar-depth-or-uv');");
  source=mutate(source,'--accept-general-depth-gradient',
    "if (xChanges && yChanges) return decline('general-perspective');", "if (false) return decline('general-perspective');");
  source=mutate(source,'--ignore-convex-halfplanes',
    "if (!Number.isFinite(cross) || cross * winding < -Math.abs(signedArea) * 1e-9) return decline('nonconvex-face');",
    "if (!Number.isFinite(cross)) return decline('nonconvex-face');");
  source=mutate(source,'--stretch-filter-repeat-size',
    'var ratio = material.size / level.size;', 'var ratio = 1;');
  source=mutate(source,'--double-weight-strip-opacity',
    'ctx.globalAlpha=originalAlpha*weight/(1-originalAlpha*remainingWeight);',
    'ctx.globalAlpha=originalAlpha*weight;');
  source=mutate(source,'--disable-directional-filter',
    'if (options.directional !== false) {', 'if (false) {');
  source=mutate(source,'--use-screen-space-tap-axis',
    'var first=a*a+b*b, second=c*c+d*d, cross=a*c+b*d;',
    'var first=a*a+c*c, second=b*b+d*d, cross=a*b+c*d;');
  source=mutate(source,'--omit-tap-variance',
    'var offset=Math.sqrt(Math.max(0,major*major-footprintWidth*footprintWidth)/12);',
    'var offset=0;');
  source=mutate(source,'--unstable-endpoint-tap-axis',
    'offsetU:Math.cos(mid.angle)*offset,offsetV:Math.sin(mid.angle)*offset',
    'offsetU:Math.cos(lo.major>=hi.major?lo.angle:hi.angle)*offset,offsetV:Math.sin(lo.major>=hi.major?lo.angle:hi.angle)*offset');
  source=mutate(source,'--ignore-isotropic-axis-fade',
    'var footprintWidth=Math.max(1,minor,major*0.5,major*mid.minor/mid.major);',
    'var footprintWidth=Math.max(1,minor,major*0.5);');
  source=mutate(source,'--tap-offset-in-mip-pixels',
    'matrix.e-matrix.a*offsetU-matrix.c*offsetV,matrix.f-matrix.b*offsetU-matrix.d*offsetV',
    'matrix.e-matrix.a*offsetU*ratio-matrix.c*offsetV*ratio,matrix.f-matrix.b*offsetU*ratio-matrix.d*offsetV*ratio');
  source=mutate(source,'--omit-offset-fill-bounds',
    'var minU=(item.minU+offsetU/material.size)*level.size, maxU=(item.maxU+offsetU/material.size)*level.size;',
    'var minU=item.minU*level.size, maxU=item.maxU*level.size;');
  source=mutate(source,'--ignore-virtual-planar-levels',
    "var levels = filter === 'stable' ? (directional?prepared.planarLevels:prepared.levels) : [material], bands = [];",
    "var levels = filter === 'stable' ? prepared.levels : [material], bands = [];");
  source=mutate(source,'--leave-virtual-offset-unscaled',
    'sampling.offsetU*=material.size/samplingSize; sampling.offsetV*=material.size/samplingSize;',
    'sampling.offsetU*=1; sampling.offsetV*=1;');
  source=mutate(source,'--ignore-visible-bounds', 'if (visibleBounds) {', 'if (false) {');
  source=mutate(source,'--exclude-last-visible-band',
    'end = Math.min(end, (rows ? visibleBounds.maxY : visibleBounds.maxX) + 1);',
    'end = Math.min(end, (rows ? visibleBounds.maxY : visibleBounds.maxX));');
  source=mutate(source,'--occluder-changes-footprint',
    'var midpoint = (minimum + maximumSpan) * 0.5;',
    'if (visibleBounds) { minimum = Math.max(minimum, rows ? visibleBounds.minX : visibleBounds.minY); maximumSpan = Math.min(maximumSpan, (rows ? visibleBounds.maxX : visibleBounds.maxY) + 1); }\n'+
    '      var midpoint = (minimum + maximumSpan) * 0.5;');
  source=mutate(source,'--accept-invalid-visible-bounds',
    'if (visibleBounds !== undefined && (!visibleBounds ||', 'if (false && visibleBounds !== undefined && (!visibleBounds ||');
  (0,eval)(source); var T=G.TexturePilot;

  // Authored singular values and rotations give independent closed-form
  // expectations. These assert submitted sampling math, not browser pixels.
  function derivative(major,minor,angle) {
    var c=Math.cos(angle||0),s=Math.sin(angle||0);
    return {ux:major*c/64,uy:-minor*s/64,vx:major*s/64,vy:minor*c/64};
  }
  function footprint(center,left,right) { return T.planarFootprint(center,left||center,right||center,64,6); }
  var longAxis=footprint(derivative(8,2,0));
  check('directional footprint retains cross axis detail while matching major axis second moment',
    longAxis&&near(longAxis.footprint,8)&&near(longAxis.minor,2)&&near(longAxis.width,4)&&
    longAxis.taps===2&&near(longAxis.offsetU,2)&&near(longAxis.offsetV,0)&&
    near(longAxis.width*longAxis.width/12+longAxis.offsetU*longAxis.offsetU,64/12),longAxis);
  var diagonal=footprint(derivative(8,2,Math.PI/6));
  check('directional offsets follow the source covariance not the screen rotation',
    diagonal&&near(diagonal.offsetU,Math.sqrt(3))&&near(diagonal.offsetV,1)&&near(diagonal.width,4),diagonal);
  var rotatedScreen={ux:8*Math.cos(.4)/64,uy:8*Math.sin(.4)/64,vx:-2*Math.sin(.4)/64,vy:2*Math.cos(.4)/64};
  var screenFootprint=footprint(rotatedScreen);
  check('rotating only screen derivatives cannot rotate the texture sampling axis',
    screenFootprint&&near(screenFootprint.offsetU,2)&&near(screenFootprint.offsetV,0),screenFootprint);
  var conservative=footprint(derivative(4,1,0),derivative(12,2,0),derivative(8,3,0));
  check('endpoint footprints bound the whole strip while two taps avoid isotropic overblur',
    conservative&&near(conservative.footprint,12)&&near(conservative.minor,3)&&near(conservative.width,6)&&
    near(conservative.offsetU,3)&&conservative.taps===2,conservative);
  var leftWinner=footprint(derivative(5,1,0),derivative(8.0000001,1,.7),derivative(8,1,-.7));
  var rightWinner=footprint(derivative(5,1,0),derivative(8,1,.7),derivative(8.0000001,1,-.7));
  check('changing the winning endpoint cannot rotate or flip a stationary center sampling kernel',
    leftWinner&&rightWinner&&near(leftWinner.offsetU,rightWinner.offsetU)&&near(leftWinner.offsetV,0)&&near(rightWinner.offsetV,0));
  var isotropic=footprint(derivative(3,3,0),derivative(8,1,.2),derivative(8,1,-.2));
  var almostIsotropic=footprint(derivative(3.0000001,3,1.2),derivative(8,1,.2),derivative(8,1,-.2));
  check('undefined isotropic center orientation fades tap displacement continuously to zero',
    isotropic&&isotropic.taps===1&&near(isotropic.width,8)&&near(isotropic.offsetU,0)&&near(isotropic.offsetV,0)&&
    almostIsotropic&&Math.hypot(almostIsotropic.offsetU,almostIsotropic.offsetV)<0.001,{isotropic:isotropic,near:almostIsotropic});
  var beforeOctave=footprint(derivative(7.999999,1,0)),afterOctave=footprint(derivative(8.000001,1,0));
  check('directional mip transitions preserve continuous width and offset across an octave',
    beforeOctave&&afterOctave&&beforeOctave.lower===1&&beforeOctave.upper===2&&beforeOctave.blend>.99999&&
    afterOctave.lower===2&&afterOctave.upper===3&&afterOctave.blend<.00001&&
    Math.abs(beforeOctave.offsetU-afterOctave.offsetU)<.000001);
  var close=footprint(derivative(.8,.2,0)),distant=footprint(derivative(256,1,0));
  check('magnification stays crisp and terminal average never draws redundant displaced copies',
    close&&close.lower===0&&close.upper===0&&close.taps===1&&!close.minifying&&
    distant&&distant.lower===6&&distant.upper===6&&distant.taps===1&&near(distant.offsetU,0));
  var malformed=[null,{},derivative(0,0),{ux:NaN,uy:1,vx:0,vy:1},{ux:1,uy:2,vx:2,vy:4}];
  check('invalid or singular directional footprints cannot select an apparently valid mip',
    malformed.every(function(value){return footprint(value)===null;})&&
    T.planarFootprint(derivative(8,1),derivative(8,1),derivative(8,1),64,8)===null);

  var canvases=0,reads=0,writes=0;
  function pixelCanvas() {
    var c={width:0,height:0},data=new Uint8ClampedArray(0),w=0,h=0; canvases++;
    function storage(){if(w!==c.width||h!==c.height){w=c.width;h=c.height;data=new Uint8ClampedArray(w*h*4);}return data;}
    var context={createImageData:function(width,height){return{width:width,height:height,data:new Uint8ClampedArray(width*height*4)};},
      getImageData:function(x,y,width,height){
        var pixels=storage(),image=this.createImageData(width,height);reads++;
        for(var py=0;py<height;py++)for(var px=0;px<width;px++)for(var ch=0;ch<4;ch++)
          image.data[(py*width+px)*4+ch]=pixels[((y+py)*w+x+px)*4+ch];
        return image;
      },putImageData:function(image,x,y){
        var pixels=storage();writes++;
        for(var py=0;py<image.height;py++)for(var px=0;px<image.width;px++)for(var ch=0;ch<4;ch++)
          pixels[((y+py)*w+x+px)*4+ch]=image.data[(py*image.width+px)*4+ch];
      }};
    c.getContext=function(){return context;};return c;
  }
  G.document={createElement:function(tag){if(tag!=='canvas')throw Error('SETUP unexpected element');return pixelCanvas();}};
  function material(size) {
    var c=pixelCanvas();c.width=c.height=size;
    var image=c.getContext().createImageData(size,size);
    for(var i=0;i<size*size;i++)image.data.set([i%17*8,80,120,255],i*4);
    c.getContext().putImageData(image,0,0);
    return {source:c,size:size,color:'#405078'};
  }
  var mat=material(64),preparedMat=T.prepareMaterial(mat);

  function drawHost() {
    var records=[],patterns=[],stack=[],path=[];
    var state={matrix:[1,0,0,1,0,0],fillStyle:'#decafe',globalAlpha:0.4,
      imageSmoothingEnabled:false,imageSmoothingQuality:'high',clips:[{caller:true}]};
    function point(x,y){var m=state.matrix;return{x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]};}
    function snapshot(){return{matrix:state.matrix.slice(),fillStyle:state.fillStyle,globalAlpha:state.globalAlpha,
      imageSmoothingEnabled:state.imageSmoothingEnabled,imageSmoothingQuality:state.imageSmoothingQuality,clips:state.clips.slice()};}
    var host={records:records,patterns:patterns,stack:stack,snapshot:snapshot,
      save:function(){stack.push(snapshot());},
      restore:function(){var prior=stack.pop();if(!prior)throw Error('SETUP unbalanced Canvas state');Object.assign(state,prior);},
      beginPath:function(){path=[];},moveTo:function(x,y){path.push(point(x,y));},lineTo:function(x,y){path.push(point(x,y));},closePath:function(){},
      rect:function(x,y,w,h){path.push(point(x,y),point(x+w,y),point(x+w,y+h),point(x,y+h));},
      clip:function(){
        var xs=path.map(function(p){return p.x;}),ys=path.map(function(p){return p.y;});
        state.clips.push({x0:Math.min.apply(null,xs),y0:Math.min.apply(null,ys),x1:Math.max.apply(null,xs),y1:Math.max.apply(null,ys)});
      },
      createPattern:function(source,repeat){var pattern={source:source,repeat:repeat};patterns.push(pattern);return pattern;},
      setTransform:function(a,b,c,d,e,f){state.matrix=[a,b,c,d,e,f];},
      transform:function(a,b,c,d,e,f){var m=state.matrix;state.matrix=[m[0]*a+m[2]*b,m[1]*a+m[3]*b,m[0]*c+m[2]*d,m[1]*c+m[3]*d,m[0]*e+m[2]*f+m[4],m[1]*e+m[3]*f+m[5]];},
      fillRect:function(x,y,w,h){records.push({matrix:state.matrix.slice(),pattern:state.fillStyle,alpha:state.globalAlpha,
        smoothing:state.imageSmoothingEnabled,rect:[x,y,w,h],clips:state.clips.slice()});}};
    ['fillStyle','globalAlpha','imageSmoothingEnabled','imageSmoothingQuality'].forEach(function(key){Object.defineProperty(host,key,{get:function(){return state[key];},set:function(value){state[key]=value;}});});
    return host;
  }
  function options(extra) { return Object.assign({width:64,height:48,maxStrips:64,filter:'stable',stats:{}},extra||{}); }
  function draw(host,points,extra,asset) { return T.drawPlanarFace(host,points,asset||mat,options(extra)); }
  function floorAt(x,y) {
    // Camera at world (0,0,12), yaw0, focal32, principal point (32,4).
    // Intersect its screen ray with the authored world z=0 plane.
    var forward=12/((y-4)/32),right=(x-32)/32*forward;
    return {x:x,y:y,depth:forward,u:forward/8,v:right/8};
  }
  function wallAt(x,y) {
    // Independent ray-plane intersection: worldX + 0.5*worldY = 32.
    var rayRight=(x-32)/32,rayDown=(y-4)/32;
    var forward=32/(1+0.5*rayRight),right=rayRight*forward,z=12-rayDown*forward;
    return {x:x,y:y,depth:forward,u:right/8,v:z/8};
  }
  var floor=[[8,28],[56,28],[38,10],[26,10]].map(function(p){return floorAt(p[0],p[1]);});
  var wall=[[16,8],[48,8],[48,24],[16,24]].map(function(p){return wallAt(p[0],p[1]);});
  check('authored floor and wall fixtures reach genuine varying forward depth',
    floor[0].depth===16&&floor[2].depth===64&&wall[0].depth!==wall[1].depth&&near(wall[0].depth,wall[3].depth));
  var hostControl=drawHost();hostControl.save();hostControl.transform(2,0,0,3,5,7);
  hostControl.beginPath();hostControl.rect(1,2,4,3);hostControl.clip();hostControl.globalAlpha=0.7;
  hostControl.fillRect(0,0,1,1);hostControl.restore();
  check('recording host retains transformed clips and restores caller drawing state',
    JSON.stringify(hostControl.records[0].matrix)==='[2,0,0,3,5,7]'&&
    JSON.stringify(hostControl.records[0].clips[1])==='{"x0":7,"y0":13,"x1":15,"y1":22}'&&
    hostControl.records[0].alpha===0.7&&JSON.stringify(hostControl.snapshot())===JSON.stringify(drawHost().snapshot()));

  function band(record) {
    for(var i=record.clips.length-1;i>=0;i--){
      var clip=record.clips[i];
      if(near(clip.x1-clip.x0,1)||near(clip.y1-clip.y0,1))return clip;
    }
    return null;
  }
  function bands(host) {
    var result=[];
    host.records.forEach(function(record){
      var b=band(record);if(!b)return;
      var key=[b.x0,b.y0,b.x1,b.y1].join(',');
      var existing=result.filter(function(row){return row.key===key;})[0];
      if(existing)existing.records.push(record);else result.push({key:key,band:b,records:[record]});
    });
    return result;
  }
  function inverseUV(record,x,y) {
    var m=record.matrix,det=m[0]*m[3]-m[1]*m[2],size=record.pattern&&record.pattern.source&&record.pattern.source.width;
    if(!Number.isFinite(det)||Math.abs(det)<1e-14||!size)return null;
    var dx=x-m[4],dy=y-m[5];
    return {u:(m[3]*dx-m[2]*dy)/det/size,v:(m[0]*dy-m[1]*dx)/det/size};
  }
  function compositeWeights(records) {
    var remaining=1,weights=new Array(records.length);
    for(var i=records.length-1;i>=0;i--){weights[i]=records[i].alpha*remaining;remaining*=1-records[i].alpha;}
    return weights;
  }
  function mappingMatches(host,axis,oracle,range) {
    var samples=0,maxError=0;
    var okay=host.records.length>0&&bands(host).every(function(row){
      var b=row.band,weights=compositeWeights(row.records),opacity=weights.reduce(function(a,b){return a+b;},0);
      if(!b||opacity<=0)return false;
      var center=axis==='row'?(b.y0+b.y1)/2:(b.x0+b.x1)/2;
      var extent=range(center);
      return [0.2,0.5,0.8].every(function(fraction){
        var along=Math.floor(extent[0]+(extent[1]-extent[0])*fraction)+0.5;
        var x=axis==='row'?along:center,y=axis==='row'?center:along;
        var expected=oracle(x,y),actual={u:0,v:0};samples++;
        for(var i=0;i<row.records.length;i++){
          var tap=inverseUV(row.records[i],x,y);if(!tap)return false;
          actual.u+=tap.u*weights[i]/opacity;actual.v+=tap.v*weights[i]/opacity;
        }
        var error=Math.max(Math.abs(actual.u-expected.u),Math.abs(actual.v-expected.v));maxError=Math.max(maxError,error);
        return error<1e-8;
      });
    });
    return {okay:okay,samples:samples,maxError:maxError};
  }
  var floorHost=drawHost(),floorStats={},floorResult=draw(floorHost,floor,{maxStrips:18,stats:floorStats});
  var floorBands=bands(floorHost),floorMap=mappingMatches(floorHost,'row',floorAt,function(y){return[36-y,28+y];});
  check('floor strip centers retain exact perspective UV from independent camera rays',
    floorResult.handled&&!floorResult.failed&&floorResult.strips===18&&floorMap.okay&&floorMap.samples>=54,{result:floorResult,mapping:floorMap});
  check('row bands cover every visible pixel row once without gaps or two pixel strides',
    floorBands.length===18&&floorBands.every(function(row){return near(row.band.y1-row.band.y0,1)&&Number.isInteger(row.band.y0);})&&
    Array.from({length:18},function(_,i){return i+10;}).every(function(y){return floorBands.some(function(row){return row.band.y0===y;});}),floorBands.map(function(row){return row.band;}));
  check('floor strips preserve the inherited outer depth clip and viewport bounds',floorHost.records.length>0&&floorHost.records.every(function(record){
    var b=band(record);return record.clips[0].caller&&b&&b.x0>=0&&b.y0>=0&&b.x1<=64&&b.y1<=48;
  }));
  var wallHost=drawHost(),wallResult=draw(wallHost,wall,{maxStrips:32});
  var wallBands=bands(wallHost),wallMap=mappingMatches(wallHost,'column',wallAt,function(){return[8,24];});
  check('wall column centers retain exact perspective UV from a different world plane',
    wallResult.handled&&!wallResult.failed&&wallResult.strips===32&&wallMap.okay&&wallMap.samples>=96,{result:wallResult,mapping:wallMap});
  check('column bands cover every visible pixel column once without row substitution',
    wallBands.length===32&&wallBands.every(function(row){return near(row.band.x1-row.band.x0,1)&&Number.isInteger(row.band.x0);})&&
    Array.from({length:32},function(_,i){return i+16;}).every(function(x){return wallBands.some(function(row){return row.band.x0===x;});}));
  check('planar filtering remains bounded to at most four actual pattern fills per strip',
    floorBands.length>0&&wallBands.length>0&&floorBands.concat(wallBands).every(function(row){return row.records.length>=1&&row.records.length<=4;}));
  check('planar work counters equal submitted pattern fills rather than inferred triangle counts',
    floorStats.patternFills===floorHost.records.length&&floorStats.patternFills>=18&&floorStats.patternFills<=72&&
    floorStats.minifiedStrips===18&&floorStats.anisotropicStrips===18&&
    (floorStats.blendedStrips||0)===floorBands.filter(function(row){return row.records.some(function(record){return record.pattern!==row.records[0].pattern;});}).length,{stats:floorStats,fills:floorHost.records.length});
  check('blended strips preserve one logical draw opacity instead of leaking their base',floorBands.length>0&&floorBands.every(function(row){
    return near(row.records.reduce(function(alpha,record){return record.alpha+alpha*(1-record.alpha);},0),0.4);
  }));
  function expectedFloorKernel(y) {
    // Differentiate the authored ray intersection directly. At x=32 the
    // source major axis is u. The two symmetric silhouette endpoints have
    // the same singular values, computable from trace and determinant.
    var d=y-4,a=3072/(d*d),b=96/d,c=96*(y-4)/(d*d);
    var trace=a*a+b*b+c*c,det=a*a*b*b;
    var major=Math.sqrt((trace+Math.sqrt(trace*trace-4*det))/2),minor=a*b/major;
    var width=Math.max(1,minor,major/2,major*d/32);
    return {width:width,offset:Math.sqrt((major*major-width*width)/12),lower:Math.floor(Math.log2(width)),blend:Math.log2(width)%1};
  }
  check('directional rendering actually submits displaced taps instead of only reporting a helper result',
    floorBands.length===18&&floorBands.every(function(row){
      var y=row.band.y0+.5,expected=floorAt(32,y),weights=compositeWeights(row.records),positive=0,negative=0;
      row.records.forEach(function(record,index){var uv=inverseUV(record,32,y);if(uv.u>expected.u+1e-7)positive+=weights[index];if(uv.u<expected.u-1e-7)negative+=weights[index];});
      return near(positive,.2)&&near(negative,.2);
    }));
  check('each mip keeps symmetric tap offsets in original source texels rather than physical mip pixels',
    floorBands.length===18&&floorBands.every(function(row){
      var y=row.band.y0+.5,expected=floorAt(32,y),kernel=expectedFloorKernel(y);
      return row.records.every(function(record){var uv=inverseUV(record,32,y);
        return uv&&near(Math.abs(uv.u-expected.u)*64,kernel.offset)&&near(uv.v,expected.v);
      });
    }));
  check('displaced sample fill rectangles cover every corner of their clipped pixel strip',
    floorHost.records.concat(wallHost.records).every(function(record){
      var b=band(record),rect=record.rect,size=record.pattern.source.width;
      return [[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]].every(function(point){
        var p=inverseUV(record,point[0],point[1]),u=p.u*size,v=p.v*size;
        return u>=rect[0]-1e-8&&u<=rect[0]+rect[2]+1e-8&&v>=rect[1]-1e-8&&v<=rect[1]+rect[3]+1e-8;
      });
    }));
  check('submitted source over contributions give equal tap weight and the independently expected mip blend',
    floorBands.length===18&&floorBands.every(function(row){
      var weights=compositeWeights(row.records),expected=expectedFloorKernel(row.band.y0+.5),blend=expected.blend;
      return row.records.length===4&&weights.every(function(weight,index){
        var image=row.records[index].pattern.source;
        return image===preparedMat.levels[expected.lower].source?near(weight,.2*(1-blend)):
          image===preparedMat.levels[expected.lower+1].source&&near(weight,.2*blend);
      });
    }));
  var opacityCases=[0,.15,1].map(function(alpha){
    var host=drawHost();host.globalAlpha=alpha;var before=host.snapshot(),result=draw(host,floor,{maxStrips:18});
    return result.handled&&!result.failed&&bands(host).length===18&&bands(host).every(function(row){
      return row.records.every(function(record){return Number.isFinite(record.alpha)&&record.alpha>=0&&record.alpha<=1;})&&
        near(compositeWeights(row.records).reduce(function(a,b){return a+b;},0),alpha);
    })&&JSON.stringify(before)===JSON.stringify(host.snapshot());
  });
  check('transparent translucent and opaque callers retain their exact logical opacity',opacityCases.every(Boolean));
  var isotropicHost=drawHost(),isotropicStats={},isotropicResult=draw(isotropicHost,floor,{directional:false,stats:isotropicStats,maxStrips:18});
  check('explicit isotropic control preserves old centered sampling and its two pass bound',
    isotropicResult.handled&&!isotropicResult.failed&&isotropicResult.strips===18&&!isotropicStats.anisotropicStrips&&
    bands(isotropicHost).every(function(row){return row.records.length<=2&&row.records.every(function(record){
      var y=row.band.y0+.5,actual=inverseUV(record,32,y),expected=floorAt(32,y);return near(actual.u,expected.u)&&near(actual.v,expected.v);
    });}));
  function subTexelAt(x,y){var p=floorAt(x,y);p.u/=8;p.v/=8;return p;}
  var subTexelFace=[[30,24],[34,24],[34,26],[30,26]].map(function(p){return subTexelAt(p[0],p[1]);});
  var subTexelHost=drawHost(),subTexelResult=draw(subTexelHost,subTexelFace,{maxStrips:2});
  check('subtexel planar footprints actually draw both virtual levels with unchanged material phase',
    subTexelResult.handled&&!subTexelResult.failed&&subTexelResult.strips===2&&subTexelHost.records.length===8&&
    subTexelHost.records.every(function(record){return record.pattern.source===preparedMat.planarLevels[0].source||record.pattern.source===preparedMat.planarLevels[1].source;})&&
    subTexelHost.records.some(function(record){return record.pattern.source===preparedMat.planarLevels[0].source;})&&
    subTexelHost.records.some(function(record){return record.pattern.source===preparedMat.planarLevels[1].source;})&&
    mappingMatches(subTexelHost,'row',subTexelAt,function(){return[30,34];}).okay,subTexelResult);
  var rawSubTexel=drawHost(),isoSubTexel=drawHost();
  var rawSubResult=draw(rawSubTexel,subTexelFace,{filter:'legacy',maxStrips:2});
  var isoSubResult=draw(isoSubTexel,subTexelFace,{directional:false,maxStrips:2});
  check('subtexel legacy and isotropic controls retain the original source without virtual expansion',
    rawSubResult.handled&&isoSubResult.handled&&rawSubTexel.records.length===2&&isoSubTexel.records.length===2&&
    rawSubTexel.records.concat(isoSubTexel.records).every(function(record){return record.pattern.source===mat.source&&!record.smoothing;}));
  check('strip rendering restores caller opacity smoothing style transform and clip state',
    JSON.stringify(floorHost.snapshot())===JSON.stringify(drawHost().snapshot())&&floorHost.stack.length===0&&
    JSON.stringify(wallHost.snapshot())===JSON.stringify(drawHost().snapshot())&&wallHost.stack.length===0);

  var before={canvases:canvases,reads:reads,writes:writes,patterns:floorHost.patterns.length};
  for(var frame=0;frame<8;frame++)draw(floorHost,floor,{maxStrips:18});
  check('repeated planar frames reuse prepared images and context patterns without pixel baking',
    canvases===before.canvases&&reads===before.reads&&writes===before.writes&&floorHost.patterns.length===before.patterns,{before:before,after:{canvases:canvases,reads:reads,writes:writes,patterns:floorHost.patterns.length}});
  check('separate Canvas contexts do not accidentally share context specific pattern caches',
    floorHost.patterns.length>0&&wallHost.patterns.length>0&&floorHost.patterns.every(function(pattern){return wallHost.patterns.indexOf(pattern)<0;}));
  var legacyHost=drawHost(),legacyResult=draw(legacyHost,floor,{filter:'legacy',maxStrips:18});
  check('legacy sampling remains an explicit single pass perspective mapping control',legacyResult.handled&&!legacyResult.failed&&legacyHost.records.length===18&&legacyHost.records.every(function(record){return record.pattern.source===mat.source;})&&mappingMatches(legacyHost,'row',floorAt,function(y){return[36-y,28+y];}).okay);
  var reversedHost=drawHost(),reversedResult=draw(reversedHost,floor.slice().reverse(),{maxStrips:18});
  check('reversing convex winding preserves the same independently expected mapping',reversedResult.handled&&reversedResult.strips===18&&mappingMatches(reversedHost,'row',floorAt,function(y){return[36-y,28+y];}).okay);
  function ceilingAt(x,y) {
    // Horizon44, same focal32 and cameraheight12, ceiling world z=20.
    var forward=8/((44-y)/32),right=(x-32)/32*forward;
    return{x:x,y:y,depth:forward,u:forward/8,v:right/8};
  }
  var ceiling=[[8,8],[56,8],[56,40],[8,40]].map(function(p){return ceilingAt(p[0],p[1]);});
  var ceilingHost=drawHost(),ceilingResult=draw(ceilingHost,ceiling,{maxStrips:32});
  check('ceiling rows support the opposite reciprocal depth slope without flipped UV phase',
    ceilingResult.handled&&!ceilingResult.failed&&ceilingResult.strips===32&&mappingMatches(ceilingHost,'row',ceilingAt,function(){return[8,56];}).okay,ceilingResult);

  function declined(points,extra,asset) {
    var host=drawHost(),before=host.snapshot(),result=draw(host,points,extra,asset);
    return {okay:!result.handled&&!result.failed&&result.strips===0&&host.records.length===0&&host.patterns.length===0&&host.stack.length===0&&JSON.stringify(host.snapshot())===JSON.stringify(before),result:result,draws:host.records.length};
  }
  var budget=declined(floor,{maxStrips:17});
  check('insufficient strip budget declines the complete face before any painting',budget.okay,budget);
  function sameBandCommands(actual,original) {
    return actual.records.length===original.records.length&&actual.records.every(function(record,index){
      var other=original.records[index];
      return record.pattern.source===other.pattern.source&&near(record.alpha,other.alpha)&&record.smoothing===other.smoothing&&
        record.matrix.every(function(value,component){return near(value,other.matrix[component]);})&&
        record.rect.every(function(value,component){return near(value,other.rect[component]);});
    });
  }
  var visibleFloor=drawHost(),floorBounds={minX:31,maxX:32,minY:14,maxY:18};
  var visibleFloorResult=draw(visibleFloor,floor,{maxStrips:5,visibleBounds:floorBounds});
  var visibleFloorBands=bands(visibleFloor);
  check('inclusive depth visibility bounds budget only the five retained floor rows',
    visibleFloorResult.handled&&!visibleFloorResult.failed&&visibleFloorResult.strips===5&&visibleFloorBands.length===5&&
    visibleFloorBands.every(function(row){return row.band.y0>=14&&row.band.y0<=18;}),visibleFloorResult);
  check('occluder bounds cannot change UV phase footprint mip levels or tap commands on retained rows',
    visibleFloorBands.length===5&&visibleFloorBands.every(function(row){
      var original=floorBands.filter(function(item){return item.key===row.key;})[0];
      return original&&sameBandCommands(row,original);
    }));
  var visibleWall=drawHost(),visibleWallResult=draw(visibleWall,wall,{maxStrips:4,visibleBounds:{minX:20,maxX:23,minY:13,maxY:14}});
  var visibleWallBands=bands(visibleWall);
  check('column visibility uses inclusive x bounds without changing remaining sampling',
    visibleWallResult.handled&&!visibleWallResult.failed&&visibleWallResult.strips===4&&visibleWallBands.length===4&&
    visibleWallBands.every(function(row){
      var original=wallBands.filter(function(item){return item.key===row.key;})[0];
      return row.band.x0>=20&&row.band.x0<=23&&original&&sameBandCommands(row,original);
    }),visibleWallResult);
  var hidden=declined(floor,{maxStrips:1,visibleBounds:{minX:0,maxX:63,minY:30,maxY:31}});
  check('visibility bounds outside the face paint no empty bands or hidden workload',hidden.okay,hidden);
  var invalidBounds=[null,{}, {minX:0,maxX:63,minY:14.5,maxY:18},{minX:-1,maxX:63,minY:14,maxY:18},
    {minX:0,maxX:64,minY:14,maxY:18},{minX:0,maxX:63,minY:19,maxY:18},
    {minX:0,maxX:63,minY:14,maxY:NaN},{minX:4,maxX:3,minY:14,maxY:18}];
  check('malformed empty inverted or out of viewport depth bounds decline before paint',
    invalidBounds.every(function(bounds){return declined(floor,{visibleBounds:bounds}).okay;}));
  check('malformed directional option declines before any pattern cache or draw work',
    [null,0,1,'false',{}].every(function(value){return declined(floor,{directional:value}).okay;}));
  var visibleBudget=declined(floor,{maxStrips:4,visibleBounds:floorBounds});
  check('one strip too little still declines after hidden bands have been removed',visibleBudget.okay,visibleBudget);
  var offscreen=[[-20,8],[84,8],[84,60],[-20,60]].map(function(p){return floorAt(p[0],p[1]);});
  var clippedHost=drawHost(),clippedResult=draw(clippedHost,offscreen,{maxStrips:40});
  check('viewport clipping precedes budgeting on a partly offscreen projected face',
    clippedResult.handled&&!clippedResult.failed&&clippedResult.strips===40&&bands(clippedHost).length===40&&
    clippedHost.records.every(function(record){var b=band(record);return b&&b.x0>=0&&b.x1<=64&&b.y0>=8&&b.y1<=48;}),clippedResult);
  var clippedBudget=declined(offscreen,{maxStrips:39});
  check('partially offscreen faces cannot exceed the visible strip budget',clippedBudget.okay,clippedBudget);
  var invisible=[[80,10],[100,10],[100,20],[80,20]].map(function(p){return floorAt(p[0],p[1]);});
  var invisibleHost=drawHost(),invisibleResult=draw(invisibleHost,invisible,{maxStrips:1});
  check('fully offscreen faces cannot manufacture a painted strip workload',invisibleResult.strips===0&&!invisibleResult.failed&&invisibleHost.records.length===0,invisibleResult);
  var thin=[[20,10.05],[40,10.05],[40,10.4],[20,10.4]].map(function(p){return floorAt(p[0],p[1]);});
  var thinHost=drawHost(),thinResult=draw(thinHost,thin,{maxStrips:1});
  check('subpixel face without an interior pixel center produces no strip draws',thinResult.strips===0&&thinHost.records.length===0,thinResult);
  var brokenDepth=floor.map(function(p){return Object.assign({},p);});brokenDepth[3].depth*=0.8;
  var inconsistentDepth=declined(brokenDepth);
  check('inconsistent reciprocal depth at a fourth vertex declines before painting',inconsistentDepth.okay,inconsistentDepth);
  var brokenUV=floor.map(function(p){return Object.assign({},p);});brokenUV[3].v+=0.1;
  var inconsistentUV=declined(brokenUV);
  check('inconsistent UV perspective plane cannot enter the strip fast path',inconsistentUV.okay,inconsistentUV);
  var mixed=[[8,8],[56,8],[56,40],[8,40]].map(function(p){var q=0.02+0.001*p[0]+0.001*p[1];return{x:p[0],y:p[1],depth:1/q,u:0.02*p[0]/q,v:0.03*p[1]/q};});
  var tilted=declined(mixed);
  check('general reciprocal depth gradients fall back instead of taking a false axis shortcut',tilted.okay,tilted);
  var affine=floor.map(function(p){return{x:p.x,y:p.y,depth:20,u:p.x/8,v:p.y/8};});
  var affineFallback=declined(affine);
  check('already affine constant depth faces remain with the ordinary mapper',affineFallback.okay,affineFallback);
  var concave=[[8,28],[56,28],[32,18],[38,10],[26,10]].map(function(p){return floorAt(p[0],p[1]);});
  var concaveFallback=declined(concave),crossedFallback=declined([floor[0],floor[2],floor[1],floor[3]]);
  check('concave and self crossing inputs cannot masquerade as a convex strip surface',concaveFallback.okay&&crossedFallback.okay,{concave:concaveFallback,crossed:crossedFallback});
  var unprepared=material(64),unpreparedHost=drawHost(),cold={canvases:canvases,reads:reads,writes:writes};
  var unpreparedResult=draw(unpreparedHost,floor,{},unprepared);
  check('unprepared materials never trigger hidden image preparation during planar drawing',
    (!unpreparedResult.handled||unpreparedResult.failed)&&unpreparedHost.records.length===0&&canvases===cold.canvases&&reads===cold.reads&&writes===cold.writes,unpreparedResult);
  out('TEXTURE_PLANAR_RESULT '+(failed?'FAIL '+failed+'/':'PASS ')+checked);
}());
undefined;
