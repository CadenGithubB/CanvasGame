// Pure mip/LOD math and real typed pixel-array preparation. The small Canvas
// host records transforms/compositing; it does NOT assert browser raster quality.
(function () {
  var G=(0,eval)('this'),checked=0,failed=0;
  var out=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
  function check(name,okay,detail) { checked++; if(!okay)failed++; out((okay?'PASS ':'FAIL ')+name+(okay?'':' '+JSON.stringify(detail))); }
  function near(a,b) { return Number.isFinite(a)&&Math.abs(a-b)<1e-8; }
  function same(a,b) { return a.length===b.length&&Array.prototype.every.call(a,function(v,i){return v===b[i];}); }
  function mutate(source,flag,before,after) {
    if(__argv.indexOf(flag)<0)return source;
    if(source.split(before).length!==2)throw Error('MUTATION_ANCHOR '+flag);
    return source.replace(before,after);
  }
  var source=slurp('tools/game/texture-mapping.js');
  source=mutate(source,'--nearest-mip-texel',
    'output[out + color] = Math.round(sum / area);', 'output[out + color] = pixels[color];');
  source=mutate(source,'--wrong-row-pitch',
    'var source = (y * size + rowWeights[tap].index) * 4,', 'var source = (y * outputSize + rowWeights[tap].index) * 4,');
  source=mutate(source,'--disable-lod',
    'var lod = Math.max(0, Math.min(maxLevel, Math.log2(footprint)));', 'var lod = 0;');
  source=mutate(source,'--rebuild-prepared', 'var prior = preparedMaterials.get(material);', 'var prior = null;');
  source=mutate(source,'--stretch-mip-coordinates', 'var size = material.size;', 'var size = material.size * 2;');
  source=mutate(source,'--ignore-anisotropy', 'Math.hypot(first - second, 2 * cross)', '0');
  source=mutate(source,'--disable-level-blend', 'blend: upper === lower ? 0 : lod - lower,', 'blend: 0,');
  source=mutate(source,'--shift-filter-center',
    'var center = (coordinate + 0.5) * size / outputSize;', 'var center = coordinate * size / outputSize;');
  source=mutate(source,'--clamp-repeat-boundary',
    'index: ((sample % size) + size) % size', 'index: Math.max(0, Math.min(size - 1, sample))');
  source=mutate(source,'--discard-fractional-coverage',
    'var weight = Math.min(end, sample + 1) - Math.max(start, sample);', 'var weight = 1;');
  source=mutate(source,'--decimate-filter-phase',
    'var outputSize = footprint === size ? 1 : Math.min(128, size * 4 / footprint);',
    'var outputSize = footprint === size ? 1 : Math.min(size, size / footprint);');
  source=mutate(source,'--cap-phase-at-source',
    'var outputSize = footprint === size ? 1 : Math.min(128, size * 4 / footprint);',
    'var outputSize = footprint === size ? 1 : Math.min(size, size * 4 / footprint);');
  source=mutate(source,'--shift-virtual-base-texel',
    'expanded[to+ec]=sourcePixels[from+ec];',
    'expanded[to+ec]=sourcePixels[(from+4)%(size*size*4)+ec];');
  source=mutate(source,'--skip-virtual-unit-filter',
    'prefilterMipPixels(sourcePixels,size,1,128).data', 'expanded');
  source=mutate(source,'--wrong-virtual-level-reuse',
    'planarLevels=added.concat(levels.slice(1)); planarSize=128;',
    'planarLevels=added.concat(levels); planarSize=128;');
  (0,eval)(source); var T=G.TexturePilot;
  var pixels=new Uint8ClampedArray([0,40,80,255,40,80,120,255,80,120,160,255,120,160,200,255]);
  var reduced=T.prefilterMipPixels(pixels,2,2,1);
  check('mip texel averages every source RGBA sample instead of selecting one',
    reduced.width===1&&reduced.height===1&&same(reduced.data,[60,100,140,255]),Array.from(reduced.data));
  var rows=new Uint8ClampedArray(4*4*4),reds=[0,40,160,200,80,120,200,240,20,60,80,120,100,140,160,200];
  reds.forEach(function(r,i){rows.set([r,20,40,255],i*4);});
  var horizontal=T.prefilterMipPixels(rows,4,2,2);
  check('reduction uses source row pitch for separate horizontal output texels',
    horizontal.width===2&&horizontal.height===2&&same(horizontal.data,[60,20,40,255,200,20,40,255,80,20,40,255,140,20,40,255]),Array.from(horizontal.data));
  var rounded=T.prefilterMipPixels(new Uint8ClampedArray([0,0,0,255,1,1,1,255,1,1,1,255,1,1,1,255]),2,2,1);
  check('fractional channel averages round rather than systematically darkening small levels',same(rounded.data,[1,1,1,255]),Array.from(rounded.data));
  check('mip filtering leaves its source samples unchanged',same(pixels,[0,40,80,255,40,80,120,255,80,120,160,255,120,160,200,255]));
  check('invalid filter storage footprint and dimensions fail explicitly',[[pixels,3,2,1],[pixels,1,1,1],[pixels,2,4,1],[pixels,2,2,129],[pixels,2,2,256],[pixels,2,2,3],[pixels,2,0,1]].every(function(args){
    try{T.prefilterMipPixels.apply(null,args);return false;}catch(error){return error instanceof RangeError;}
  }));
  var impulse=new Uint8ClampedArray(4*4*4);
  for(var point=0;point<16;point++)impulse.set([point===0?200:0,0,0,255],point*4);
  var centered=T.prefilterMipPixels(impulse,4,2,4),centeredRed=[];
  for(var point=0;point<16;point++)centeredRed.push(centered.data[point*4]);
  // A width-two box centered on source texel0 covers it fully and each
  // neighboring texel by one half. The 2D footprint has area four.
  check('centered footprint preserves an authored feature instead of shifting its phase',
    same(centeredRed,[50,25,0,25,25,13,0,13,0,0,0,0,25,13,0,13]),centeredRed);
  check('periodic filtering carries a border feature across both repeat seams',
    centeredRed[3]===25&&centeredRed[12]===25&&centeredRed[15]===13,centeredRed);
  check('fractional footprint boundaries keep exact two dimensional overlap weights',
    centeredRed[0]===50&&centeredRed[1]===25&&centeredRed[5]===13,centeredRed);
  var finer=T.prefilterMipPixels(impulse,4,2,8),finerRed=[];
  for(var point=0;point<64;point++)finerRed.push(finer.data[point*4]);
  // Centers now .25,.75,1.25,... in original texels. Pixel0 contributes
  // lengths 1,1,.75,.25,0,0,.25,.75 on each axis; divide 2D area by4.
  var overlaps=[1,1,.75,.25,0,0,.25,.75],expectedFine=[];
  overlaps.forEach(function(y){overlaps.forEach(function(x){expectedFine.push(Math.round(50*x*y));});});
  check('denser than source phase grids integrate fractional original pixel coverage directly',
    finer.width===8&&finer.height===8&&same(finerRed,expectedFine)&&finerRed[2]===38&&finerRed[18]===28,finerRed);
  check('unit footprint preserves every source texel without unnecessary blur',same(T.prefilterMipPixels(impulse,4,1,4).data,impulse));

  var magnified=T.footprintLOD(2,0,0,2,6);
  check('magnified surface remains at the original material level',magnified&&near(magnified.footprint,0.5)&&magnified.lower===0&&magnified.upper===0&&!magnified.minifying,magnified);
  var minified=T.footprintLOD(0.25,0,0,0.25,6);
  check('minified material selects the independently expected mip level',minified&&near(minified.footprint,4)&&near(minified.lod,2)&&minified.lower===2&&near(minified.blend,0),minified);
  var transition=T.footprintLOD(1/Math.SQRT2,0,0,1/Math.SQRT2,6);
  check('between octave footprints blend continuously instead of popping to one level',transition&&near(transition.lod,0.5)&&transition.lower===0&&transition.upper===1&&near(transition.blend,0.5),transition);
  var stretched=T.footprintLOD(0.5,0,0,2,6),rotated=T.footprintLOD(0,0.5,-2,0,6);
  check('anisotropic minification is not hidden by an unchanged triangle area',stretched&&rotated&&near(stretched.footprint,2)&&near(stretched.lod,1)&&near(rotated.footprint,2),{stretched:stretched,rotated:rotated});
  var shear=T.footprintLOD(1,0,1,1,6),golden=(1+Math.sqrt(5))/2;
  check('skewed footprints account for cross axis pixel coverage',shear&&near(shear.footprint,golden)&&near(shear.lod,Math.log2(golden)),shear);
  var remote=T.footprintLOD(1/1024,0,0,1/1024,6);
  check('extreme minification stays inside the final prepared level',remote&&remote.lower===6&&remote.upper===6&&near(remote.lod,6),remote);
  check('singular and nonfinite footprints cannot issue invalid filtering advice',T.footprintLOD(0,0,0,1,6)===null&&T.footprintLOD(NaN,0,0,1,6)===null);

  var canvases=[],reads=0,writes=0;
  function pixelCanvas() {
    var c={width:0,height:0},data=new Uint8ClampedArray(0),w=0,h=0;
    function storage(){if(w!==c.width||h!==c.height){w=c.width;h=c.height;data=new Uint8ClampedArray(w*h*4);}return data;}
    var ctx={createImageData:function(width,height){return{width:width,height:height,data:new Uint8ClampedArray(width*height*4)};},
      getImageData:function(x,y,width,height){
        var src=storage(),copy=this.createImageData(width,height);reads++;
        for(var py=0;py<height;py++)for(var px=0;px<width;px++){
          if(x+px<0||x+px>=w||y+py<0||y+py>=h)continue;
          for(var ch=0;ch<4;ch++)copy.data[(py*width+px)*4+ch]=src[((y+py)*w+x+px)*4+ch];
        }return copy;
      },putImageData:function(image,x,y){
        var dst=storage();writes++;
        for(var py=0;py<image.height;py++)for(var px=0;px<image.width;px++){
          if(x+px<0||x+px>=w||y+py<0||y+py>=h)continue;
          for(var ch=0;ch<4;ch++)dst[((y+py)*w+x+px)*4+ch]=image.data[(py*image.width+px)*4+ch];
        }
      }};
    c.getContext=function(){return ctx;};canvases.push(c);return c;
  }
  G.document={createElement:function(tag){if(tag!=='canvas')throw Error('SETUP unexpected element');return pixelCanvas();}};
  function material(size,rgba){
    var c=pixelCanvas();c.width=c.height=size;
    var image={width:size,height:size,data:new Uint8ClampedArray(size*size*4)};
    for(var i=0;i<size*size;i++)image.data.set(rgba||[40,80,120,255],i*4);
    c.getContext().putImageData(image,0,0);return{source:c,size:size,color:'#285078'};
  }
  var tiny=material(2);tiny.source.getContext().putImageData({width:2,height:2,data:pixels},0,0);
  var keys=Object.keys(tiny).join(','),prepared=T.prepareMaterial(tiny);
  check('preparation creates a complete immutable base to one texel pyramid',prepared&&prepared.levels.length===2&&
    prepared.levels[0].source===tiny.source&&prepared.levels[0].size===2&&prepared.levels[1].size===1&&
    Object.isFrozen(prepared)&&Object.isFrozen(prepared.levels)&&Object.isFrozen(prepared.levels[1])&&Object.keys(tiny).join(',')===keys);
  check('prepared terminal level contains the independently expected RGBA average',same(prepared.levels[1].source.getContext().getImageData(0,0,1,1).data,[60,100,140,255]));
  var beforeReuse={canvases:canvases.length,reads:reads,writes:writes};
  var reused=T.prepareMaterial(tiny);
  check('prepared material reuse never rebuilds or rereads its pixel sources',reused===prepared&&canvases.length===beforeReuse.canvases&&reads===beforeReuse.reads&&writes===beforeReuse.writes,{before:beforeReuse,after:{canvases:canvases.length,reads:reads,writes:writes}});
  var full=material(128),fullPrepared=T.prepareMaterial(full),medium=material(64,[0,20,40,255]);
  var mediumPixels=medium.source.getContext().getImageData(0,0,64,64);mediumPixels.data[0]=200;
  medium.source.getContext().putImageData(mediumPixels,0,0);
  var mediumPrepared=T.prepareMaterial(medium);
  check('all mip backing stores are included in exact bounded byte accounting',prepared.baseBytes===16&&prepared.mipBytes===4&&prepared.bytes===20&&
    fullPrepared.levels.length===8&&fullPrepared.baseBytes===65536&&fullPrepared.mipBytes===152836&&fullPrepared.bytes===218372&&fullPrepared.bytes*4<1048576&&
    mediumPrepared.baseBytes===16384&&mediumPrepared.mipBytes===218372&&mediumPrepared.bytes===234756&&mediumPrepared.bytes*4<1048576,
    {tiny:prepared.bytes,medium:mediumPrepared.bytes,full:fullPrepared.bytes,levels:fullPrepared.levels.length});
  check('prepared levels retain four phase samples per filter footprint',
    same(fullPrepared.levels.map(function(level){return level.size;}),[128,128,128,64,32,16,8,1])&&
    same(fullPrepared.levels.map(function(level){return level.footprint;}),[1,2,4,8,16,32,64,128]));
  check('small materials retain four footprint phases without changing their original crisp base',
    mediumPrepared.levels[0].source===medium.source&&
    same(mediumPrepared.levels.map(function(level){return level.size;}),[64,128,64,32,16,8,1])&&
    same(mediumPrepared.levels.map(function(level){return level.footprint;}),[1,2,4,8,16,32,64]));
  var virtualBase=mediumPrepared.planarLevels[0].source.getContext().getImageData(0,0,128,128).data;
  check('virtual planar base exactly duplicates original piecewise constant texels without shifting artwork',
    mediumPrepared.planarSize===128&&mediumPrepared.planarLevels[0].footprint===.5&&
    Array.prototype.every.call(virtualBase,function(value,index){
      var pixel=Math.floor(index/4),x=pixel%128,y=Math.floor(pixel/128),source=(Math.floor(y/2)*64+Math.floor(x/2))*4+index%4;
      return value===mediumPixels.data[source];
    }));
  var virtualUnit=mediumPrepared.planarLevels[1].source.getContext().getImageData(0,0,128,128).data;
  check('virtual unit filter integrates quarter texel boundary areas rather than repeating its sharp base',
    mediumPrepared.planarLevels[1].footprint===1&&virtualUnit[0]===113&&virtualUnit[4]===113&&
    virtualUnit[8]===38&&virtualUnit[127*4]===38&&virtualUnit[(127*128+127)*4]===13&&virtualUnit[3]===255);
  check('virtual planar chain shares all existing coarse levels and leaves triangle base identity unchanged',
    mediumPrepared.planarLevels.length===8&&Object.isFrozen(mediumPrepared.planarLevels)&&
    mediumPrepared.planarLevels.every(Object.isFrozen)&&mediumPrepared.levels[0].source===medium.source&&
    mediumPrepared.planarLevels.slice(2).every(function(level,index){return level===mediumPrepared.levels[index+1];})&&
    fullPrepared.planarLevels===fullPrepared.levels&&fullPrepared.planarSize===128);
  var virtualSources=[];
  mediumPrepared.levels.concat(mediumPrepared.planarLevels).forEach(function(level){if(virtualSources.indexOf(level.source)<0)virtualSources.push(level.source);});
  var mediumWarm={canvases:canvases.length,reads:reads,writes:writes};
  check('virtual preparation counts unique backing images once and never rebuilds them on reuse',
    virtualSources.length===9&&virtualSources.reduce(function(sum,image){return sum+image.width*image.height*4;},0)===mediumPrepared.bytes&&
    T.prepareMaterial(medium)===mediumPrepared&&canvases.length===mediumWarm.canvases&&reads===mediumWarm.reads&&writes===mediumWarm.writes);
  var transparent=material(2,[80,80,80,0]),invalidRejected=false;
  try{invalidRejected=!T.prepareMaterial(transparent);}catch(error){invalidRejected=error instanceof RangeError;}
  check('transparent input cannot silently enter the opaque filtering pipeline',invalidRejected);

  function drawHost(){
    var records=[],patterns=[],stack=[],state={matrix:[1,0,0,1,0,0],fillStyle:'#decafe',globalAlpha:0.4,imageSmoothingEnabled:false,imageSmoothingQuality:'low'};
    var c={records:records,patterns:patterns,stack:stack,save:function(){stack.push({matrix:state.matrix.slice(),fillStyle:state.fillStyle,globalAlpha:state.globalAlpha,imageSmoothingEnabled:state.imageSmoothingEnabled,imageSmoothingQuality:state.imageSmoothingQuality});},
      restore:function(){var saved=stack.pop();if(!saved)throw Error('SETUP unbalanced draw state');Object.assign(state,saved);},
      beginPath:function(){},moveTo:function(){},lineTo:function(){},closePath:function(){},clip:function(){},
      createPattern:function(source,repeat){var p={source:source,repeat:repeat};patterns.push(p);return p;},
      transform:function(a,b,c,d,e,f){var m=state.matrix;state.matrix=[m[0]*a+m[2]*b,m[1]*a+m[3]*b,m[0]*c+m[2]*d,m[1]*c+m[3]*d,m[0]*e+m[2]*f+m[4],m[1]*e+m[3]*f+m[5]];},
      fillRect:function(){records.push({matrix:state.matrix.slice(),pattern:state.fillStyle,alpha:state.globalAlpha,smoothing:state.imageSmoothingEnabled});}};
    ['fillStyle','globalAlpha','imageSmoothingEnabled','imageSmoothingQuality'].forEach(function(key){Object.defineProperty(c,key,{get:function(){return state[key];},set:function(value){state[key]=value;}});});
    return c;
  }
  function tri(size,depth){return[{x:5,y:7,depth:depth||2,u:0.25,v:0.5},{x:5+size,y:7,depth:depth||2,u:1.25,v:0.5},{x:5,y:7+size,depth:depth||2,u:0.25,v:1.5}];}
  function draw(ctx,points,mat,options){return T.drawTriangle(ctx,points[0],points[1],points[2],mat,options);}
  var unprepared=material(64),emptyHost=drawHost(),beforeDraw={canvases:canvases.length,reads:reads,writes:writes};
  var missing=draw(emptyHost,tri(16),unprepared);
  check('drawing never secretly prepares an unprepared texture during a frame',!missing&&emptyHost.records.length===0&&canvases.length===beforeDraw.canvases&&reads===beforeDraw.reads&&writes===beforeDraw.writes);
  var active=T.prepareMaterial(unprepared),host=drawHost(),points=tri(16),okay=draw(host,points,unprepared);
  check('stable draw chooses the expected source image from screen footprint',okay&&host.records.length===1&&host.records[0].pattern.source===active.levels[2].source,host.records.map(function(r){return r.pattern.source.width;}));
  check('selected mip transform preserves material phase at every screen vertex',host.records.length>0&&host.records.every(function(record){
    var m=record.matrix,size=record.pattern.source.width;
    return points.every(function(p){return near(m[0]*p.u*size+m[2]*p.v*size+m[4],p.x)&&near(m[1]*p.u*size+m[3]*p.v*size+m[5],p.y);});
  }));
  var blendHost=drawHost(),blendPoints=tri(64/Math.pow(2,2.5)),blendStats={};draw(blendHost,blendPoints,unprepared,{stats:blendStats});
  check('fractional LOD stays bounded to two source samples with unchanged material phase',blendHost.records.length===2&&blendHost.records.every(function(record){
    var m=record.matrix,size=record.pattern.source.width;
    return blendPoints.every(function(p){return near(m[0]*p.u*size+m[2]*p.v*size+m[4],p.x)&&near(m[1]*p.u*size+m[3]*p.v*size+m[5],p.y);});
  }),blendHost.records.map(function(r){return{size:r.pattern.source.width,alpha:r.alpha};}));
  check('filter work counters count actual pattern passes rather than only triangles',
    blendStats.patternFills===blendHost.records.length&&blendStats.patternFills===2&&blendStats.minifiedTriangles===1&&blendStats.blendedTriangles===1,blendStats);
  var opacity=blendHost.records.reduce(function(alpha,record){return record.alpha+alpha*(1-record.alpha);},0);
  check('trilinear passes preserve the opacity of one logical material draw',blendHost.records.length===2&&near(opacity,0.4)&&near(blendHost.records[1].alpha/opacity,0.5),{combinedOpacity:opacity,passes:blendHost.records.map(function(r){return r.alpha;})});
  var nearHost=drawHost();draw(nearHost,tri(128),unprepared);
  check('close crisp view retains full resolution without forcing smoothing',nearHost.records.length===1&&nearHost.records[0].pattern.source===unprepared.source&&!nearHost.records[0].smoothing);
  var deepHost=drawHost();draw(deepHost,tri(16,2000),unprepared);
  check('LOD follows projected material size rather than raw camera depth',deepHost.records.length===1&&deepHost.records[0].pattern.source===host.records[0].pattern.source);
  var warm={canvases:canvases.length,reads:reads,writes:writes,patterns:host.patterns.length};
  for(var frame=0;frame<24;frame++)draw(host,points,unprepared);
  check('repeated filtered frames reuse all mip pixels and context patterns',canvases.length===warm.canvases&&reads===warm.reads&&writes===warm.writes&&host.patterns.length===warm.patterns);
  check('filtered draw restores caller opacity filtering and state stack',host.globalAlpha===0.4&&!host.imageSmoothingEnabled&&host.fillStyle==='#decafe'&&host.stack.length===0&&blendHost.stack.length===0);
  out('TEXTURE_FILTERING_RESULT '+(failed?'FAIL '+failed+'/':'PASS ')+checked);
}());
undefined;
