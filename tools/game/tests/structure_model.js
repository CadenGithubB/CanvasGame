// Independently rasterize mesh boundary rectangles into authored cell edges.
// The oracle is the existing production stamp, not the adapter's grid/face data.
// This checks geometry and workload only. Native texture appearance and browser
// frame times belong to the isolated scene's real Canvas checks.
(function () {
  var G=(0,eval)('this'),checked=0,failed=0;
  var out=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
  function check(name,okay,detail) {
    checked++; if(!okay)failed++;
    out((okay?'PASS ':'FAIL ')+name+(okay?'':' '+JSON.stringify(detail)));
  }
  function near(a,b,tolerance) { return Number.isFinite(a)&&Math.abs(a-b)<(tolerance||1e-7); }
  function uniqueSlice(source,start,end) {
    if(source.split(start).length!==2||source.split(end).length!==2||source.indexOf(start)>=source.indexOf(end))
      throw Error('SETUP production reference extraction anchors changed');
    return source.slice(source.indexOf(start),source.indexOf(end));
  }
  function mutate(source,flag,before,after) {
    if(__argv.indexOf(flag)<0)return source;
    if(source.split(before).length!==2)throw Error('MUTATION_ANCHOR '+flag);
    return source.replace(before,after);
  }
  var config=slurp('assets/games/src/01-config-state.js');
  (0,eval)(uniqueSlice(config,'var GAME_CONFIG = {','var CANVAS_BASE_H = canvas.height;'));
  var world=G.GAME_CONFIG.world;
  check('fixtures use the current twelve unit cells and four hundred eighty unit chunks',
    world.cellSize===12&&world.chunkSize===480&&world.chunkCells===40);
  var stampSource=uniqueSlice(slurp('assets/games/src/05-endless-world.js'),
    '  if (cStructure) {\n    var sWX = cStructure.centerWX, sWY = cStructure.centerWY;',
    '  // ── Underground cave network carving');
  var originalStamp=new Function('cStructure','cx','cy','initial',
    'var cell=12,CHUNK_SIZE=480,CHUNK_CELLS=40,n=1600;'+
    'var cGrid=initial?initial.grid.slice():new Uint8Array(n),'+
    'cWallH=initial?initial.wallHeights.slice():new Float32Array(n),'+
    'cWallCR=initial?initial.wallColorR.slice():new Uint8Array(n),'+
    'cWallCG=initial?initial.wallColorG.slice():new Uint8Array(n),'+
    'cWallCB=initial?initial.wallColorB.slice():new Uint8Array(n);'+stampSource+
    'return {grid:cGrid,wallHeights:cWallH,wallColorR:cWallCR,wallColorG:cWallCG,wallColorB:cWallCB};');
  var imported=slurp(__argv[0]);
  imported=mutate(imported,'--clear-untouched-grid','var cGrid=initial.grid||new Uint8Array(n),',
    'var cGrid=new Uint8Array(n),');
  (0,eval)(imported);
  var source=slurp('tools/game/structure-model.js');
  source=mutate(source,'--drop-west-boundaries',"edge('W',wx,wy,zAt(x-1,y),z1,color);",'/* lost west boundary */');
  source=mutate(source,'--hide-height-steps','return solid[index] ? heights[index]*baseH : 0;',
    'return solid[index] ? Infinity : 0;');
  source=mutate(source,'--shift-chunk-cell',
    'var dest=((cy+chunksEachSide)*constants.chunkCells+y)*width+(cx+chunksEachSide)*constants.chunkCells+x;',
    'var dest=((cy+chunksEachSide)*constants.chunkCells+y)*width+(cx+chunksEachSide)*constants.chunkCells+x+1;');
  source=mutate(source,'--lose-local-origin','wx=(grid.minCellX+x)*cell, wy=(grid.minCellY+y)*cell;',
    'wx=x*cell, wy=y*cell;');
  source=mutate(source,'--stretch-textures','var repeats = 32;','var repeats = 64;');
  source=mutate(source,'--reset-wall-phase','else if (verticalX) { u=p.y/repeats; v=-p.z/repeats; }',
    'else if (verticalX) { u=(p.y-first.y)/repeats; v=-p.z/repeats; }');
  source=mutate(source,'--drop-shell',"faces.push(texturedFace(face.vertices,material,face.color,'shell'));",'/* lost authored shell */');
  source=mutate(source,'--merge-across-colors',
    'return solid[n] && !visited[n] && heights[n]===heights[i] && colors[n]===color;',
    'return solid[n] && !visited[n] && heights[n]===heights[i];');
  source=mutate(source,'--bridge-hollow-top',
    'return solid[n] && !visited[n] && heights[n]===heights[i] && colors[n]===color;',
    'return !visited[n] && heights[n]===heights[i] && colors[n]===color;');
  source=mutate(source,'--wrong-world-height','var baseH=StructureProduction.constants.canvasBaseH;',
    'var baseH=StructureProduction.constants.canvasBaseH/25;');
  (0,eval)(source);
  var S=G.StructureModel,P=G.StructureProduction;
  function equalArrays(a,b) {
    return a.length===b.length&&Array.prototype.every.call(a,function(value,index){return value===b[index];});
  }
  function sameStamp(a,b) {
    return ['grid','wallHeights','wallColorR','wallColorG','wallColorB'].every(function(key){return equalArrays(a[key],b[key]);});
  }
  function initialGrid() {
    var initial={grid:new Uint8Array(1600),wallHeights:new Float32Array(1600),
      wallColorR:new Uint8Array(1600),wallColorG:new Uint8Array(1600),wallColorB:new Uint8Array(1600)};
    for(var i=0;i<1600;i++) {
      initial.grid[i]=i%3?1:0;initial.wallHeights[i]=0.375;
      initial.wallColorR[i]=17;initial.wallColorG[i]=39;initial.wallColorB[i]=61;
    }
    return initial;
  }
  check('injected production constants retain source unit conversions',
    P.constants.cell===12&&P.constants.chunkSize===480&&P.constants.chunkCells===40&&P.constants.canvasBaseH===240);

  // The original generator's result is intentionally independently assembled
  // by absolute chunk coordinate; model-local array addressing cannot supply
  // its own expected result or erase a negative-coordinate seam defect.
  function referenceGrid(descriptor) {
    var chunks={};
    function sample(gx,gy) {
      var cx=Math.floor(gx/40),cy=Math.floor(gy/40),key=cx+','+cy;
      if(!chunks[key])chunks[key]=originalStamp(descriptor,cx,cy);
      var index=(gy-cy*40)*40+(gx-cx*40),chunk=chunks[key];
      return {solid:chunk.grid[index]===1,height:chunk.wallHeights[index]*240,
        color:[chunk.wallColorR[index],chunk.wallColorG[index],chunk.wallColorB[index]]};
    }
    return sample;
  }
  function packed(color) {
    if(/^#[a-f0-9]{6}$/i.test(color))return parseInt(color.slice(1),16);
    var rgb=/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(color);
    return rgb?(+rgb[1]*65536 + +rgb[2]*256 + +rgb[3]):NaN;
  }
  function bounds(vertices) {
    var b={minX:Infinity,minY:Infinity,minZ:Infinity,maxX:-Infinity,maxY:-Infinity,maxZ:-Infinity};
    vertices.forEach(function(p){
      b.minX=Math.min(b.minX,p.x);b.maxX=Math.max(b.maxX,p.x);
      b.minY=Math.min(b.minY,p.y);b.maxY=Math.max(b.maxY,p.y);
      b.minZ=Math.min(b.minZ,p.z);b.maxZ=Math.max(b.maxZ,p.z);
    });return b;
  }
  function key(axis,position,span,sign) { return axis+':'+position+':'+span+':'+sign; }
  function expectedBoundary(sample) {
    var result={},occupied=0,steps=0;
    for(var gy=-100;gy<100;gy++)for(var gx=-100;gx<100;gx++) {
      var cell=sample(gx,gy);if(!cell.solid)continue;
      occupied++;var color=cell.color[0]*65536+cell.color[1]*256+cell.color[2];
      result['top:'+gx+':'+gy]={z0:cell.height,z1:cell.height,color:color};
      [[-1,0,'x',gx,gy,-1],[1,0,'x',gx+1,gy,1],
       [0,-1,'y',gy,gx,-1],[0,1,'y',gy+1,gx,1]].forEach(function(edge){
        var neighbor=sample(gx+edge[0],gy+edge[1]),low=neighbor.solid?neighbor.height:0;
        if(cell.height>low+1e-7) {
          if(neighbor.solid)steps++;
          result[key(edge[2],edge[3],edge[4],edge[5])]={z0:low,z1:cell.height,color:color};
        }
      });
    }
    return {surfaces:result,occupied:occupied,steps:steps};
  }
  function actualBoundary(faces) {
    var surfaces={},errors=[],walls=0,tops=0;
    function add(k,z0,z1,color) {
      if(surfaces[k])errors.push('duplicate '+k);
      surfaces[k]={z0:z0,z1:z1,color:color};
    }
    faces.forEach(function(face){
      if(face.kind!=='wall'&&face.kind!=='top')return;
      var v=face.vertices,b=bounds(v),a=v[0],p=v[1],q=v[2],color=packed(face.color);
      if(v.length!==4||!Number.isFinite(color)){errors.push('invalid rectangle/material');return;}
      var nx=(p.y-a.y)*(q.z-a.z)-(p.z-a.z)*(q.y-a.y);
      var ny=(p.z-a.z)*(q.x-a.x)-(p.x-a.x)*(q.z-a.z);
      var nz=(p.x-a.x)*(q.y-a.y)-(p.y-a.y)*(q.x-a.x);
      if(face.kind==='top') {
        tops++;
        if(!near(b.minZ,b.maxZ)||nz<=0)errors.push('top has wrong plane or winding');
        for(var gy=Math.round(b.minY/12);gy<Math.round(b.maxY/12);gy++)
          for(var gx=Math.round(b.minX/12);gx<Math.round(b.maxX/12);gx++)add('top:'+gx+':'+gy,b.minZ,b.maxZ,color);
      } else {
        walls++;var axis=near(b.minX,b.maxX)?'x':near(b.minY,b.maxY)?'y':null;
        if(!axis||!(b.maxZ>b.minZ)){errors.push('wall is not an axis aligned interval');return;}
        var position=(axis==='x'?b.minX:b.minY)/12,lo=(axis==='x'?b.minY:b.minX)/12;
        var hi=(axis==='x'?b.maxY:b.maxX)/12,normal=axis==='x'?nx:ny;
        if(!near(position,Math.round(position))||!near(lo,Math.round(lo))||!near(hi,Math.round(hi))||!normal)
          errors.push('wall leaves authored cell edges');
        for(var span=Math.round(lo);span<Math.round(hi);span++)add(key(axis,Math.round(position),span,Math.sign(normal)),b.minZ,b.maxZ,color);
      }
    });
    return {surfaces:surfaces,errors:errors,walls:walls,tops:tops};
  }
  function compareBoundary(expected,actual) {
    var keys=Object.keys(expected),other=Object.keys(actual),first=null;
    keys.forEach(function(k){var a=actual[k],e=expected[k];
      if(!first&&(!a||!near(a.z0,e.z0,1e-4)||!near(a.z1,e.z1,1e-4)||a.color!==e.color))first={surface:k,expected:e,actual:a||null};
    });
    if(!first&&keys.length!==other.length)first={unexpected:other.filter(function(k){return !expected[k];}).slice(0,3)};
    return {okay:!first,detail:first};
  }
  function gridCell(model,gx,gy) {
    var grid=model.grid,x=gx-grid.minCellX,y=gy-grid.minCellY;
    if(x<0||y<0||x>=grid.width||y>=grid.height)return {solid:false,height:0};
    var index=y*grid.width+x;
    return {solid:!!grid.solid[index],height:grid.wallHeights[index]*240,color:grid.colors?grid.colors[index]:grid.color[index]};
  }
  function metricUV(faces) {
    return faces.filter(function(f){return f.kind==='wall'||f.kind==='top'||f.kind==='floor';}).every(function(face){
      return face.vertices.every(function(a,index){
        var b=face.vertices[(index+1)%face.vertices.length];
        return near(Math.hypot(a.u-b.u,a.v-b.v)*32,Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),1e-5);
      });
    });
  }
  function anchoredUV(faces) {
    return faces.filter(function(f){return f.kind==='wall'||f.kind==='top'||f.kind==='floor';}).every(function(face){
      var b=bounds(face.vertices),horizontal=near(b.minZ,b.maxZ),verticalX=near(b.minX,b.maxX);
      return face.vertices.every(function(p){
        return near(p.u,(horizontal?p.x:verticalX?p.y:p.x)/32)&&near(p.v,(horizontal?p.y:-p.z)/32);
      });
    });
  }
  function modelDigest(model) {
    return JSON.stringify({faces:model.faces,bounds:model.bounds,grid:{width:model.grid.width,height:model.grid.height,
      minCellX:model.grid.minCellX,minCellY:model.grid.minCellY,solid:Array.from(model.grid.solid),wallHeights:Array.from(model.grid.wallHeights)}});
  }
  var specs=[{type:'fortress',scale:1,rotation:0,numBuildings:2,numPillars:12,armCount:3},
    {type:'arena',scale:1,rotation:0,numBuildings:2,numPillars:12,armCount:3},
    {type:'watchtower',scale:1,rotation:0,numBuildings:2,numPillars:12,armCount:3}];
  var models={};
  specs.forEach(function(spec){
    var model=S.build(spec);models[spec.type]=model;
    var label=spec.type+' ',reference=referenceGrid(model.descriptor),expected=expectedBoundary(reference);
    check(label+'reference contains actual occupied walls and a hollow traversal core',
      expected.occupied>40&&!reference(0,0).solid,{occupied:expected.occupied});
    var stampParity=true;
    [-2,-1,0,1].forEach(function(cy){[-2,-1,0,1].forEach(function(cx){
      [false,true].forEach(function(prefill){
        var base=prefill?initialGrid():null,expected=originalStamp(model.descriptor,cx,cy,base);
        if(!sameStamp(P.stamp(model.descriptor,cx,cy,base),expected))stampParity=false;
      });
    });});
    check(label+'injected stamp preserves original clean and prefilled chunk semantics',stampParity);
    var parity=true,first=null;
    for(var gy=-100;gy<100;gy++)for(var gx=-100;gx<100;gx++) {
      var e=reference(gx,gy),a=gridCell(model,gx,gy);
      if(e.solid!==a.solid||(e.solid&&!near(e.height,a.height,1e-4))) {
        parity=false;if(!first)first={cell:[gx,gy],expected:e,actual:a};
      }
    }
    check(label+'local grid preserves all original occupancy across positive and negative chunks',parity,first);
    var actual=actualBoundary(model.faces),comparison=compareBoundary(expected.surfaces,actual.surfaces);
    check(label+'merged surfaces exactly cover original solid boundary without internal faces or lost steps',
      actual.errors.length===0&&comparison.okay,{errors:actual.errors.slice(0,3),first:comparison.detail});
    check(label+'model has body top shell and floor subjects',actual.walls>0&&actual.tops>0&&
      model.faces.some(function(f){return f.kind==='shell';})&&model.faces.some(function(f){return f.kind==='floor';}));
    check(label+'merging reduces actual body submissions without discarding occupied surface area',
      actual.walls+actual.tops<Object.keys(expected.surfaces).length*.75,
      {faces:actual.walls+actual.tops,cellSurfaces:Object.keys(expected.surfaces).length});
    check(label+'body and ground keep thirty two world units per texture repeat',metricUV(model.faces));
    check(label+'texture phase is continuous across merged faces and chunk boundaries',anchoredUV(model.faces));
    var all=[];model.faces.forEach(function(f){all=all.concat(f.vertices);});var measured=bounds(all);
    check(label+'declared bounds enclose every finite body roof and ground vertex',
      all.length>0&&all.every(function(p){return [p.x,p.y,p.z,p.u,p.v].every(Number.isFinite);})&&
      Object.keys(measured).every(function(k){return near(model.bounds[k],measured[k],1e-5);}),
      {declared:model.bounds,measured:measured});
    var random=Math.random;Math.random=function(){throw Error('SETUP mesh consumed gameplay RNG');};
    var again;try {G.cam={x:519,y:-238,ang:1.8};G.windowOriginX=960;G.windowOriginY=-480;again=S.build(spec);}finally{Math.random=random;}
    check(label+'camera window origin and gameplay randomness do not change local model geometry',modelDigest(model)===modelDigest(again));
  });
  check('fortress cardinal gates stay open while their adjacent outer wall remains solid',
    !gridCell(models.fortress,0,67).solid&&!gridCell(models.fortress,0,-68).solid&&
    !gridCell(models.fortress,67,0).solid&&!gridCell(models.fortress,-68,0).solid&&gridCell(models.fortress,4,67).solid);
  check('fortress internal building has a real hollow core and surrounding wall',
    !gridCell(models.fortress,30,-28).solid&&gridCell(models.fortress,34,-28).solid);
  check('arena keeps both rotated gate approaches distinct from its enclosing ring',
    !gridCell(models.arena,0,44).solid&&!gridCell(models.arena,0,-45).solid&&gridCell(models.arena,44,0).solid);
  check('watchtower central and terminal room voids survive surrounding walls and arms',
    !gridCell(models.watchtower,0,0).solid&&gridCell(models.watchtower,1,0).solid&&
    gridCell(models.watchtower,3,0).solid&&!gridCell(models.watchtower,16,0).solid&&gridCell(models.watchtower,18,0).solid);
  ['fortress','arena','watchtower'].forEach(function(type){
    var small=S.build({type:type,scale:0.85,rotation:0.37,numBuildings:2,numPillars:15,armCount:4});
    var large=S.build({type:type,scale:1.15,rotation:0.37,numBuildings:2,numPillars:15,armCount:4});
    check(type+' source layout scale changes footprint without stretching material density',
      large.bounds.maxX-large.bounds.minX>small.bounds.maxX-small.bounds.minX&&metricUV(small.faces)&&metricUV(large.faces));
    var requested=Object.assign({},large.descriptor,{scale:1.15,rotation:0.37,numBuildings:2,numPillars:15,armCount:4});
    var expected=expectedBoundary(referenceGrid(requested)),actual=actualBoundary(large.faces);
    var comparison=compareBoundary(expected.surfaces,actual.surfaces);
    check(type+' scaled rotated maximum layout preserves the original solid boundary',
      actual.errors.length===0&&comparison.okay,{first:comparison.detail,errors:actual.errors.slice(0,3)});
  });
  var hud=slurp('assets/games/src/15-render-hud-menu.js');
  var originalShell=new Function('st','floor','wood',
    'var cell=12,CHUNK_SIZE=480,CANVAS_BASE_H=240,ctx={globalAlpha:.37},faces=[];'+
    'var GAME_MATERIALS={floorPropWood:{hex:wood}};'+
    "function rgbQ(r,g,b){return 'rgb('+r+','+g+','+b+')';}"+
    'function drawRuinDecorFace(vertices,color){faces.push({vertices:vertices,color:color});}'+
    uniqueSlice(hud,'function drawRuinDecorBox(','function drawRuins3D()')+
    uniqueSlice(hud,'function getStructureShellMetrics(','function drawStructures3D()')+
    'drawStructureShellWorld(st,{floorZ:floor},{});return faces;');
  function shellGeometry(faces,dx,dy,dz) {
    return faces.map(function(f){return {color:f.color,vertices:f.vertices.map(function(p){
      return [p.x-(dx||0),p.y-(dy||0),p.z-(dz||0)].map(function(v){return Math.round(v*1e7)/1e7;});
    })};});
  }
  specs.forEach(function(spec){
    var model=models[spec.type],st=Object.assign({},model.descriptor,{x:120,y:-84});
    var actual=model.faces.filter(function(f){return f.kind==='shell';});
    var expected=originalShell(st,75,P.woodColors);
    check(spec.type+' roofs lintels and standards match the original floor anchored shell geometry',
      expected.length>10&&JSON.stringify(shellGeometry(actual))===JSON.stringify(shellGeometry(expected,120,-84,75)));
  });
  function authoredGrid(heights,colors,solid) {
    return {width:2,height:2,minCellX:-1,minCellY:-1,cell:12,
      solid:new Uint8Array(solid),wallHeights:new Float32Array(heights),colors:new Uint32Array(colors)};
  }
  var step=authoredGrid([1,.5,1,1],[0x994433,0x994433,0x336699,0x336699],[1,1,1,0]);
  var stepMesh=S.meshGrid(step),stepRaster=actualBoundary(stepMesh.faces);
  function stepSample(x,y) {
    if(x< -1||y< -1||x>0||y>0)return {solid:false,height:0,color:[0,0,0]};
    var i=(y+1)*2+x+1,color=step.colors[i];
    return {solid:!!step.solid[i],height:step.wallHeights[i]*240,color:[color>>16,(color>>8)&255,color&255]};
  }
  var stepExpected=expectedBoundary(stepSample),stepComparison=compareBoundary(stepExpected.surfaces,stepRaster.surfaces);
  check('authored adjacent heights expose only the upper riser and retain cavity walls',
    stepExpected.steps===1&&stepRaster.errors.length===0&&stepComparison.okay,
    {steps:stepExpected.steps,first:stepComparison.detail,errors:stepRaster.errors});
  check('authored upper riser has independent one hundred twenty to two hundred forty height endpoints',
    !!stepRaster.surfaces['x:0:-1:1']&&near(stepRaster.surfaces['x:0:-1:1'].z0,120)&&near(stepRaster.surfaces['x:0:-1:1'].z1,240));
  check('cleared cell with stale height metadata cannot receive a bridged top',!stepRaster.surfaces['top:0:0']);
  check('adjacent equal height different materials retain their authored top colors',
    !!stepRaster.surfaces['top:-1:-1']&&!!stepRaster.surfaces['top:-1:0']&&
    stepRaster.surfaces['top:-1:-1'].color===0x994433&&stepRaster.surfaces['top:-1:0'].color===0x336699);
  var repeated=S.meshGrid(authoredGrid([1,1,1,1],[0x994433,0x994433,0x994433,0x994433],[1,1,1,1]));
  var rectangleRaster=actualBoundary(repeated.faces);
  check('uniform two by two block emits five merged surfaces and no hidden interior sheets',
    repeated.faces.length===5&&rectangleRaster.errors.length===0&&Object.keys(rectangleRaster.surfaces).length===12);
  var rejected=0;
  [{type:'hut'},{type:'arena',scale:0},{type:'arena',scale:NaN},{type:'watchtower',armCount:5},
   {type:'fortress',numBuildings:1.5},{type:'arena',numPillars:0}].forEach(function(options){try{S.build(options);}catch(_){rejected++;}});
  check('unsupported recipes and invalid source parameter ranges reject explicitly',rejected===6);
  out('STRUCTURE_MODEL_RESULT '+(failed?'FAIL '+failed+'/':'PASS ')+checked);
}());
undefined;
