(function(){
var G=(0,eval)('this'),output=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
var host=slurp('tools/game/tests/cave_occlusion_integration.js'),end=host.indexOf('  function check(name, okay) {');
(0,eval)(host.slice(0,end)+'G.__coverErrors=errors;}());');
G._caveTestSeedOverride=12345;G._caveTestKindOverride='descending';G.CAVE_TEST_MODE=G.ENDLESS_MODE=G.running=true;G.gameOverState=false;G.terrain='plains';
Object.keys(G.caveTestFlags).forEach(function(k){G.caveTestFlags[k]=false;});G.resetEndlessMode();G.previewCaveView('mouth');
var m=G.floorMesh,e=G.deepCaveEntrances[0],gs=m.gridSize,co=Math.cos(e.angle),si=Math.sin(e.angle);
function frame(x,y){return{along:(x-e.x)*co+(y-e.y)*si,cross:-(x-e.x)*si+(y-e.y)*co};}
function surface(x,y){var gx=Math.floor(x/gs),gy=Math.floor(y/gs),i=gy*m.w+gx,tx=x/gs-gx,ty=y/gs-gy;
 var z=m.surfaceH[i],z1=m.surfaceH[i+1],z2=m.surfaceH[i+m.w],z3=m.surfaceH[i+m.w+1];
 return tx>=ty?z+tx*(z1-z)+ty*(z3-z1):z+ty*(z2-z)+tx*(z3-z2);}
var coverMin=Infinity,ceilCount=0,capCount=0,missing=[];
for(var i=0;i<m.w*m.h;i++){
 var ceil=null,cap=null;
 for(var li=0;li<m.layerCount[i];li++){var t=m['l'+li+'Type'][i],z=m['l'+li+'TopZ'][i];if(t===2)ceil=z;if(t===4){cap=z;capCount++;}}
 if(ceil!==null){ceilCount++;coverMin=Math.min(coverMin,cap-ceil);}
 if(cap===null||i%m.w===m.w-1||i>=m.w*(m.h-1))continue;
 var zs=[i+1,i+m.w,i+m.w+1].map(function(ni){return G.findFloorRenderRoleZ(m,ni,3,cap,i);});
 if(zs.some(function(z){return !Number.isFinite(z);})){var x=(i%m.w+.5)*gs,y=(Math.floor(i/m.w)+.5)*gs,f=frame(x,y);missing.push({i:i,x:x,y:y,along:f.along,cross:f.cross,z:cap,neighbors:zs});}
}
output(JSON.stringify({entrance:e,coverMin:coverMin,ceilCount:ceilCount,capCount:capCount,missingCount:missing.length,missing:missing}));
var faces=[],project=G.projectSceneWorldPolygon;
G.projectSceneWorldPolygon=function(points,C){faces.push(points.map(function(p){return{x:p.x,y:p.y,z:p.z};}));return project(points,C);};
G.beginSceneDepthFrame(G.canvas.width,G.canvas.height);G.drawCaveEntrance3D();G.projectSceneWorldPolygon=project;
var tops=[];[4,9,14].forEach(function(fi){faces[fi].forEach(function(p){var f=frame(p.x,p.y),top=p.z/25,sh=surface(p.x,p.y),support=G.sampleEntitySupportRenderZ(p.x,p.y,NaN,false,true)/25;tops.push({face:fi,along:f.along,cross:f.cross,top:top,surface:sh,protrusion:top-sh,support:support});});});
output(JSON.stringify({rockTopPoints:tops}));
var seamSamples=[],band=faces[14];
for(var cross=-e.halfWidth;cross<=e.halfWidth;cross+=6){
 var t=(cross+e.halfWidth)/(2*e.halfWidth),rock=(band[0].z*(1-t)+band[1].z*t)/25;
 var x=e.x-si*cross+co*16,y=e.y+co*cross+si*16;
 seamSamples.push({cross:cross,rock:rock,cover:surface(x,y),gap:surface(x,y)-rock,support:G.sampleEntitySupportRenderZ(x,y,NaN,false,true)/25});
}
output(JSON.stringify({seamSamples:seamSamples}));
var wallRows=[],wallBase=G.CANVAS_BASE_H/25;
for(var wy=0;wy<G.gridH;wy++)for(var wx=0;wx<G.gridW;wx++){
 var wi=wy*G.gridW+wx;if(!G.grid[wi]||!Number.isFinite(G.wallMaxTopZ[wi]))continue;
 var cx=(wx+.5)*G.cell,cy=(wy+.5)*G.cell,top=Math.min(G.getFloorHeightAt(cx,cy)+wallBase*G.wallHeights[wi],G.wallMaxTopZ[wi]);
 var shs=[],minRoof=Infinity,maxRoof=-Infinity;
 for(var iy=0;iy<=2;iy++)for(var ix=0;ix<=2;ix++){
  var sx=(wx+ix/2)*G.cell,sy=(wy+iy/2)*G.cell;shs.push(surface(sx,sy));
  var mi=Math.floor(sy/gs)*m.w+Math.floor(sx/gs);for(var li=0;li<m.layerCount[mi];li++)if(m['l'+li+'Type'][mi]===2){minRoof=Math.min(minRoof,m['l'+li+'TopZ'][mi]);maxRoof=Math.max(maxRoof,m['l'+li+'TopZ'][mi]);}
 }
 var minS=Math.min.apply(Math,shs),f=frame(cx,cy);
 wallRows.push({wi:wi,x:cx,y:cy,along:f.along,cross:f.cross,top:top,minSurface:minS,protrusion:top-minS,minRoof:minRoof,maxRoof:maxRoof,cave:G.gridCave[wi]});
}
wallRows.sort(function(a,b){return b.protrusion-a.protrusion;});
output(JSON.stringify({cell:G.cell,wallRows:wallRows.slice(0,5),cappedWalls:wallRows.length,protruding:wallRows.filter(function(w){return w.protrusion>0.001;}).length}));
['approach','above','roofedge','mouth','oblique'].forEach(function(view){G.previewCaveView(view);output(JSON.stringify({view:view,cam:G.cam,eye:G.getCam3D(),playerUnderground:G.playerUnderground}));});
output('COVER_PROBE_DONE');
}());
