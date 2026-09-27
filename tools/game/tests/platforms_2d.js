// Real layered world plus authored map strata; Canvas APIs alone are recorded.
(function(){
  var G=(0,eval)('this'),output=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
  var host=slurp('tools/game/tests/cave_occlusion_integration.js');
  var end=host.indexOf('  function check(name, okay) {');
  if(end<0)throw Error('shipping browser host boundary missing');
  (0,eval)(host.slice(0,end)+'G.__platformErrors=errors; }());');
  var source=slurp('assets/games/src/13-render-floors-ceilings.js'),checked=0,failed=0;
  function mutate(flag,before,after){
    if(__argv.indexOf(flag)<0)return;
    if(source.split(before).length!==2)throw Error('MUTATION_ANCHOR '+flag);
    source=source.replace(before,after);
  }
  mutate('--legacy-heights','height=meshLayerHeight(mesh,ci,li);','height=mesh.heights[ci];');
  mutate('--skip-layered','if (mesh.layerCount) {','if (mesh.layerCount) { continue;');
  mutate('--ceiling-as-floor','var li=getTopWalkableLayerIdx(x,y);','var li=mesh.layerCount[ci]-1;');
  mutate('--unbounded-alpha','Math.max(0.15,Math.min(0.9,0.4 + height * 0.5))','0.4 + height * 0.5');
  (0,eval)(source);
  if(__argv.indexOf('--floor-after-actors')>=0) {
    source=slurp('assets/games/src/16-draw-overview.js');
    var anchor='  drawPlatforms2D();\n  ctx.save(); ctx.translate(-viewCam.x, -viewCam.y);';
    if(source.split(anchor).length!==2 || source.split('    draw2D();').length!==2)throw Error('MUTATION_ANCHOR floor-after-actors');
    source=source.replace(anchor,'  ctx.save(); ctx.translate(-viewCam.x, -viewCam.y);').replace('    draw2D();','    draw2D(); drawPlatforms2D();');
    (0,eval)(source);
  }
  function check(name,okay){if(!okay)failed++;checked++;output((okay?'PASS ':'FAIL ')+name);}
  var records=[],states=[],oldFill=G.ctx.fillRect,oldSave=G.ctx.save,oldRestore=G.ctx.restore;
  G.ctx.fillRect=function(x,y,w,h){records.push({x:x,y:y,w:w,h:h,color:this.fillStyle,alpha:this.globalAlpha});return oldFill.apply(this,arguments);};
  G.ctx.save=function(){states.push({alpha:this.globalAlpha,color:this.fillStyle});return oldSave.apply(this,arguments);};
  G.ctx.restore=function(){var s=states.pop();if(s){this.globalAlpha=s.alpha;this.fillStyle=s.color;}return oldRestore.apply(this,arguments);};
  function draw(){records=[];var error=null;try{G.drawPlatforms2D();}catch(e){error=e;}return error;}
  G._caveTestSeedOverride=12345;G._caveTestKindOverride='descending';G.CAVE_TEST_MODE=G.ENDLESS_MODE=G.running=true;
  G.gameOverState=false;G.terrain='plains';Object.keys(G.caveTestFlags).forEach(function(k){G.caveTestFlags[k]=false;});
  G.resetEndlessMode();G.MODE3D=false;G.overviewActive=false;G.USE_MOUSE=true;G.USE_GAMEPAD=false;
  var m=G.floorMesh,cap=-1,capLayer=-1;
  for(var i=0;i<m.layerCount.length&&cap<0;i++)for(var li=0;li<m.layerCount[i];li++)if(m['l'+li+'Type'][i]===4){cap=i;capLayer=li;break;}
  check('generated cave fixture contains layered cap but no legacy height array',!!m.layerCount&&!m.heights&&cap>=0);
  var cx=cap%m.w,cy=Math.floor(cap/m.w),gs=m.gridSize;
  G.viewCam={x:cx*gs,y:cy*gs};G.canvas.width=120;G.canvas.height=96;
  G.ctx.globalAlpha=0.73;var error=draw();
  check('generated layered platform draw completes without missing-height crash',error===null);
  var first=records.filter(function(r){return r.x===cx*gs&&r.y===cy*gs;})[0];
  check('generated cap contributes its actual authored floor color',!!first&&first.color===m['l'+capLayer+'Color'][cap]&&first.alpha>0);
  check('generated visible floor draw stays bounded by viewport rather than world window',records.length>0&&records.length<=2*10*8);
  check('generated heights always produce finite valid nonzero alpha',records.every(function(r){return Number.isFinite(r.alpha)&&r.alpha>=0.15&&r.alpha<=0.9;}));
  check('platform pass restores caller alpha',G.ctx.globalAlpha===0.73&&states.length===0);
  var errorsBefore=G.__platformErrors.length,fullError=null,order=[],oldArc=G.ctx.arc,platformPass=G.drawPlatforms2D;
  G.drawPlatforms2D=function(){order.push('floor');return platformPass();};
  G.ctx.arc=function(x,y,r){if(x===G.pos.x&&y===G.pos.y&&r===6)order.push('player');return oldArc.apply(this,arguments);};
  try{G.renderFrame();}catch(e){fullError=e;}
  G.drawPlatforms2D=platformPass;G.ctx.arc=oldArc;
  check('real generated top-down frame completes without thrown or swallowed errors',fullError===null&&G.__platformErrors.length===errorsBefore);
  check('real top-down frame paints terrain before player rather than covering actors',order.indexOf('floor')>=0&&order.indexOf('player')>order.indexOf('floor')&&order.filter(function(v){return v==='floor';}).length===1);
  // Reset host Canvas state after a deliberately caught crashing mutation so
  // independent legacy controls still execute on an uncontaminated context.
  states=[];G.ctx.globalAlpha=1;

  // Authored two-storey cell: the highest item is a ceiling, not walkable.
  m={w:2,h:2,gridSize:12,layerCount:new Uint8Array([4,4,4,4]),colors:['#badbad','#badbad','#badbad','#badbad']};
  [[1,-6,'#221100'],[2,-2,'#665544'],[4,3,'#447722'],[2,7,'#ee0000']].forEach(function(l,k){
    m['l'+k+'Type']=new Uint8Array(4);m['l'+k+'Type'].fill(l[0]);
    m['l'+k+'TopZ']=new Float64Array(4);m['l'+k+'TopZ'].fill(l[1]);m['l'+k+'Color']=[l[2],l[2],l[2],l[2]];
  });
  G.floorMesh=m;G.viewCam={x:0,y:0};error=draw();
  check('top-down terrain selects cap beneath ceiling instead of cave floor or ceiling',error===null&&records.length===1&&records[0].color==='#447722');
  m.layerCount.fill(1);error=draw();
  check('negative cave floor remains visibly drawn with a valid alpha',error===null&&records.length===1&&records[0].color==='#221100'&&records[0].alpha>=0.15);
  m.l0Type.fill(2);error=draw();
  check('ceiling-only cell does not fabricate walkable terrain',error===null&&records.length===0);

  // Actual fixed-level generation still owns heights[] compatibility data.
  G.ENDLESS_MODE=G.CAVE_TEST_MODE=false;G.worldW=120;G.worldH=96;G.deepCaveRegions=[];
  G.platforms=[{x:20,y:20,w:30,h:30,heightPercent:0.4}];G.generateFloorMesh();
  var generated=G.floorMesh;G.viewCam={x:0,y:0};error=draw();
  check('real fixed-level mesh continues drawing its generated terrain',!!generated.heights&&error===null&&records.length>0);
  // The exact same real height/color buffers presented through the legacy shape.
  G.floorMesh={w:generated.w,h:generated.h,gridSize:generated.gridSize,heights:generated.heights,colors:generated.colors,water:generated.water};
  error=draw();
  check('legacy unlayered mesh remains supported without inventing geometry',error===null&&records.length===(generated.w-1)*(generated.h-1));
  G.floorMesh={w:3,h:2,gridSize:12,heights:[0,0.5,0,0,0,0],colors:['#112233','#445566','#000000','#000000','#000000','#000000'],water:[1,2,0,0,0,0]};
  error=draw();
  check('legacy pool and stream overlays retain their distinct colors',error===null&&records.length===4&&records[1].color==='#3388bb'&&records[3].color==='#55aaee');
  check('legacy ordinary height opacity is unchanged',records[0].alpha===0.4&&records[2].alpha===0.65);
  G.ctx.fillRect=oldFill;G.ctx.save=oldSave;G.ctx.restore=oldRestore;
  output('PLATFORMS_2D_RESULT '+(failed?'FAIL ':'PASS ')+checked);
})();
