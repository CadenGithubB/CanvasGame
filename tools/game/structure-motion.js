// DEV ONLY: native full-structure motion tests. The renderer is called through
// an explicit capture hook; expected pixels never use its projection or UV code.
var StructureMotion = (function () {
  var width=360,height=240,frames=16;
  function xyz(p){return[p.x,p.y,p.z];}
  function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function sub(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
  function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function bounds(face){var b={minX:Infinity,minY:Infinity,minZ:Infinity,maxX:-Infinity,maxY:-Infinity,maxZ:-Infinity};face.vertices.forEach(function(p){['X','Y','Z'].forEach(function(a){b['min'+a]=Math.min(b['min'+a],p[a.toLowerCase()]);b['max'+a]=Math.max(b['max'+a],p[a.toLowerCase()]);});});return b;}
  function centroid(face){var c={x:0,y:0,z:0};face.vertices.forEach(function(p){c.x+=p.x;c.y+=p.y;c.z+=p.z;});c.x/=face.vertices.length;c.y/=face.vertices.length;c.z/=face.vertices.length;return c;}
  function normal(face){return cross(sub(xyz(face.vertices[1]),xyz(face.vertices[0])),sub(xyz(face.vertices[2]),xyz(face.vertices[0])));}

  // q(world)=gradient dot world + offset, fitted from the source face. The
  // camera ray has forward depth exactly1, not unit Euclidean length.
  function planeFor(face,camera,axis,w,h){
    var a=face.vertices[0],b=face.vertices[1],c=face.vertices[2],e1=sub(xyz(b),xyz(a)),e2=sub(xyz(c),xyz(a));
    var n=cross(e1,e2),aa=dot(e1,e1),bb=dot(e2,e2),ab=dot(e1,e2),det=aa*bb-ab*ab;
    if(!(det>1e-10))throw Error('Degenerate oracle face');
    var du=b[axis]-a[axis],dv=c[axis]-a[axis],s=(du*bb-dv*ab)/det,t=(dv*aa-du*ab)/det;
    var g=e1.map(function(value,i){return s*value+t*e2[i];}),offset=a[axis]-dot(g,xyz(a)),d=dot(n,xyz(a));
    face.vertices.forEach(function(p){if(Math.abs(dot(n,xyz(p))-d)>Math.hypot.apply(null,n)*1e-6||Math.abs(dot(g,xyz(p))+offset-p[axis])>1e-6)throw Error('Oracle face is not planar with affine UVs');});
    var origin=[camera.x,camera.y,60+(camera.z-60)*25/40],f=w/(2*Math.tan(camera.fov/2));
    var horizon=Math.floor(h/2)+Math.floor(-camera.pitch*f),co=Math.cos(camera.ang),si=Math.sin(camera.ang);
    var rx=[-si/f,co/f,0],ry=[0,0,-1/f],r0=[co+si*w/(2*f),si-co*w/(2*f),horizon/f];
    var q=[dot(n,rx),dot(n,ry),dot(n,r0)],k=d-dot(n,origin),base=dot(g,origin)+offset;
    var numerator=[base*q[0]+k*dot(g,rx),base*q[1]+k*dot(g,ry),base*q[2]+k*dot(g,r0)];
    var sign=k<0?-1:1;
    return {numerator:numerator.map(function(v){return v*sign;}),denominator:q.map(function(v){return v*sign;}),period:1,darkWidth:1/16,
      n:n,k:k,origin:origin,rx:rx,ry:ry,r0:r0,face:face};
  }
  function hit(plane,x,y,inside){var dir=plane.r0.map(function(v,i){return v+x*plane.rx[i]+y*plane.ry[i];}),den=dot(plane.n,dir),depth=plane.k/den;if(!Number.isFinite(depth)||depth<1)return null;
    var point=plane.origin.map(function(v,i){return v+depth*dir[i];});
    if(inside){var ps=plane.face.vertices;for(var i=0;i<ps.length;i++){var a=xyz(ps[i]),b=xyz(ps[(i+1)%ps.length]);if(dot(cross(sub(b,a),sub(point,a)),plane.n)<-1e-6)return null;}}
    return {depth:depth,point:point};
  }
  function maskFor(plane,capture){var mask=new Uint8Array(width*height),count=0;
    for(var y=0;y<height;y++)for(var x=0;x<width;x++){var index=y*width+x,p=hit(plane,x+.5,y+.5,true);if(!p||Math.abs(capture.depth[index]-1/p.depth)>Math.max(1e-7,1/p.depth*1e-5))continue;
      if(!hit(plane,x,y,true)||!hit(plane,x+1,y,true)||!hit(plane,x+1,y+1,true)||!hit(plane,x,y+1,true))continue;mask[index]=1;count++;}
    return {pixels:mask,count:count};}
  function roiFor(first,last,w,h,preferred){var candidates=[];
    for(var y=4;y+h<=height-4;y+=4)for(var x=4;x+w<=width-4;x+=4)candidates.push({x:x,y:y,width:w,height:h,score:Math.hypot(x+w/2-preferred[0],y+h/2-preferred[1])});
    candidates.sort(function(a,b){return a.score-b.score;});
    for(var i=0;i<candidates.length;i++){var r=candidates[i],okay=true;for(var yy=r.y;yy<r.y+h&&okay;yy++)for(var xx=r.x;xx<r.x+w;xx++)if(!first.pixels[yy*width+xx]||!last.pixels[yy*width+xx]){okay=false;break;}if(okay)return{x:r.x,y:r.y,width:w,height:h};}
    throw Error('No fully visible '+w+'x'+h+' target patch; subjects first/last='+first.count+'/'+last.count);
  }
  // Full byte-range artwork makes every native byte a valid measurement,
  // including compositor rounding. No clamping or widened analysis margin.
  function material(size,axis,uniform){var c=document.createElement('canvas');c.width=c.height=size;var ctx=c.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size,size);if(!uniform){ctx.fillStyle='#000000';ctx.fillRect(0,0,axis==='u'?size/16:size,axis==='v'?size/16:size);}var m={source:c,size:size,color:'#000000'};TexturePilot.prepareMaterial(m);return m;}
  function choose(model,kind){var selected=model.faces.filter(function(f){var b=bounds(f),n=normal(f);
    if(kind==='chest-front'||kind==='chest-lid')return f.kind===kind;
    if(kind==='floor')return f.kind==='floor';
    if(kind==='fortress-wall')return f.kind==='wall'&&Math.abs(b.minX-b.maxX)<1e-7&&n[0]<0&&b.minX<-900&&b.maxY-b.minY>500&&b.maxZ<250;
    if(kind==='arena-wall')return f.kind==='wall'&&Math.abs(b.minX-b.maxX)<1e-7&&n[0]>0&&b.minX<-500&&b.maxY-b.minY>100&&b.maxZ>150;
    if(kind==='tower-wall')return f.kind==='wall'&&n[0]<0&&b.maxZ>330&&b.minX<0&&Math.abs(b.maxX-b.minX)<1e-7;
    if(kind==='roof')return f.kind==='shell'&&f.vertices.length===3&&b.maxZ>model.bodyBounds.maxZ-1&&b.minZ<b.maxZ-5&&centroid(f).x<0&&centroid(f).y<0;
    return false;
  });selected.sort(function(a,b){var x=bounds(a),y=bounds(b);return(y.maxY-y.minY)-(x.maxY-x.minY);});if(!selected.length)throw Error('Missing authored surface '+kind);return selected[0];}
  function cameraFor(model,face,fixture){var c=centroid(face),n=normal(face),x,y,z,angle,pitch=0;
    if(fixture.chest)return chestCamera(face,fixture);
    if(fixture.kind==='floor'){x=-model.bodyBounds.maxX*.38;y=-model.bodyBounds.maxY*.30;z=18;angle=.26;}
    else if(fixture.kind==='roof'){var radius=Math.hypot(c.x,c.y)||1;x=c.x+c.x/radius*85;y=c.y+c.y/radius*85;z=c.z+65;angle=Math.atan2(c.y-y,c.x-x);pitch=(z-c.z)/85;}
    else{var length=Math.hypot(n[0],n[1]),nx=n[0]/length,ny=n[1]/length;var travel=fixture.front?0:fixture.kind==='tower-wall'?42:fixture.kind==='arena-wall'?100:220,away=fixture.front?180:fixture.kind==='tower-wall'?65:fixture.kind==='arena-wall'?100:40;
      x=c.x+nx*away-ny*travel;y=c.y+ny*away+nx*travel;z=Math.round(c.z/32)*32-1;angle=Math.atan2(c.y-y,c.x-x);}
    return{x:x,y:y,z:60+(z-60)*40/25,ang:angle,pitch:pitch,fov:Math.PI/2.5,stepX:fixture.walk?.65:.08,stepY:fixture.walk?.3:.035,stepZ:fixture.kind.indexOf('wall')>=0?.04:0};}
  function stepped(camera,frame,stationary){return Object.assign({},camera,{x:camera.x+(stationary?0:frame*camera.stepX),y:camera.y+(stationary?0:frame*camera.stepY),z:camera.z+(stationary?0:frame*camera.stepZ*40/25)});}
  function publicResult(r){var copy=Object.assign({},r);delete copy.actual;delete copy.expected;return copy;}
  function sampledStone(x,y,u,v,source,size,samples){var sum=0;for(var sy=0;sy<samples;sy++)for(var sx=0;sx<samples;sx++){var px=x+(sx+.5)/samples,py=y+(sy+.5)/samples;
    var uu=(u.numerator[0]*px+u.numerator[1]*py+u.numerator[2])/(u.denominator[0]*px+u.denominator[1]*py+u.denominator[2]);
    var vv=(v.numerator[0]*px+v.numerator[1]*py+v.numerator[2])/(v.denominator[0]*px+v.denominator[1]*py+v.denominator[2]);
    var tx=((Math.floor(uu*size)%size)+size)%size,ty=((Math.floor(vv*size)%size)+size)%size;sum+=source[(ty*size+tx)*4]/255;}return sum/(samples*samples);}
  async function stoneDiagnostic(hooks,fixture,model,mode){var face=choose(model,fixture.kind),camera=cameraFor(model,face,fixture),stone=TexturePilot.createCatalog(128).materials.stone,source=stone.source.getContext('2d').getImageData(0,0,128,128).data;
    var target=document.createElement('canvas');target.width=width;target.height=height;target.getContext('2d',{willReadFrequently:false});
    function capture(frame){return hooks.capture(target,stepped(camera,frame,false),model,{mode:mode,budget:2048,transparentBackground:true,diagnostic:{material:stone,unlit:true,filter:'stable',targetFace:face}});}
    for(var warm=0;warm<4;warm++)capture(0);var first=capture(0),last=capture(frames-1),fp=planeFor(face,camera,'u',width,height),lp=planeFor(face,stepped(camera,frames-1,false),'u',width,height);
    var roi=roiFor(maskFor(fp,first),maskFor(lp,last),32,16,fixture.kind==='floor'?[180,166]:[180,120]),actual=[],coarse=[],fine=[],trace=[];
    for(var frame=0;frame<frames;frame++){await hooks.next();if(hooks.cancelled())throw Error('Cancelled');var pos=stepped(camera,frame,false),sample=frame===0?first:frame===frames-1?last:capture(frame),u=planeFor(face,pos,'u',width,height),v=planeFor(face,pos,'v',width,height),a=new Float64Array(512),b=new Float64Array(512),c=new Float64Array(512);
      for(var y=0;y<16;y++)for(var x=0;x<32;x++){var px=roi.x+x,py=roi.y+y,i=y*32+x,screen=py*width+px,p=hit(u,px+.5,py+.5,true);if(!p||Math.abs(sample.depth[screen]-1/p.depth)>Math.max(1e-7,1/p.depth*1e-5)||sample.pixels[screen*4+3]!==255)throw Error('Real-stone target became hidden or nonopaque');a[i]=sample.pixels[screen*4]/255;b[i]=sampledStone(px,py,u,v,source,128,8);c[i]=sampledStone(px,py,u,v,source,128,16);}
      for(var gy=0;gy<3;gy++)for(var gx=0;gx<3;gx++){var xx=roi.x+Math.floor(31*gx/2),yy=roi.y+Math.floor(15*gy/2),targetHit=hit(u,xx+.5,yy+.5,true),nearest=hooks.rayDepth(model,pos,xx,yy,width,height);if(!targetHit||Math.abs(nearest-targetHit.depth)>Math.max(1e-5,targetHit.depth*1e-6))throw Error('Real-stone independent nearest surface differs');}
      if(sample.work.failedDraws||!sample.work.targetWork||!(sample.work.targetWork.triangles+sample.work.targetWork.strips)||sample.work.targetWork.fallbackFaces)throw Error('Real-stone target has no successful mapped workload');actual.push(a);coarse.push(b);fine.push(c);trace.push(sample.work.targetWork);}
    var residual=StructureTemporal.analyze(actual,fine,32,16,{requireMotion:true}),convergence=StructureTemporal.analyze(coarse,fine,32,16,{requireMotion:true});
    if(!residual.valid||!convergence.valid)throw Error('Real-stone numerical reference has no valid motion subjects');
    return{id:fixture.id+'-real-stone-128-'+mode,descriptor:model.descriptor,camera:camera,cameraStep:[camera.stepX,camera.stepY,camera.stepZ],roi:roi,frames:frames,resolution:[width,height],mapping:mode,filter:'stable',normalization:'red channel /255, not diagnostic stripe contrast',classification:'DESCRIPTIVE_NUMERICAL_REFERENCE',residualAgainst16x16:residual,reference8x8Against16x16:convergence,targetWork:trace,limitations:'Original stone texels sampled through independent ray/plane UVs. Finite8x8/16x16 quadrature, not exact pixel integration; convergence is empirical, not a proven error bound. Not included in analytic pass/fail totals.'};
  }
  function occlusionControl(hooks,model,result){var face=choose(model,'floor'),camera=result.camera,roi=result.roi,x=roi.x+Math.floor(roi.width/2),y=roi.y+Math.floor(roi.height/2),plane=planeFor(face,camera,'v',width,height),p=hit(plane,x+.5,y+.5,true);
    if(!p||p.depth<=4)throw Error('Occluder control has no forward floor');var center=p.point.map(function(v,i){return(v+plane.origin[i])/2;}),right=[-Math.sin(camera.ang),Math.cos(camera.ang),0],half=30;
    var blocker={kind:'diagnostic-occluder',material:'stone',color:'#ffffff',light:1,vertices:[[-1,-1],[1,-1],[1,1],[-1,1]].map(function(s){return{x:center[0]+right[0]*s[0]*half,y:center[1]+right[1]*s[0]*half,z:center[2]+s[1]*half,u:(s[0]+1)/2,v:(s[1]+1)/2};})};
    var blocked=Object.assign({},model,{faces:model.faces.concat([blocker])}),openDepth=hooks.rayDepth(model,camera,x,y,width,height),blockedDepth=hooks.rayDepth(blocked,camera,x,y,width,height),target=document.createElement('canvas');target.width=width;target.height=height;
    var capture=hooks.capture(target,camera,blocked,{mode:'triangles',budget:2048,diagnostic:{material:material(128,'v',false),unlit:true,filter:'stable',targetFace:face}}),observed=capture.depth[y*width+x];
    return{id:'nearer-occluder-rejects-hidden-subject',pass:Math.abs(openDepth-p.depth)<1e-5&&Math.abs(blockedDepth-p.depth/2)<1e-5&&Math.abs(observed-1/blockedDepth)<1e-7&&Math.abs(observed-1/p.depth)>1e-5,openDepth:openDepth,blockedDepth:blockedDepth,expectedTargetDepth:p.depth,renderedInverseDepth:observed};
  }
  async function measure(hooks,fixture,model,size,mode,extra){extra=extra||{};var face=choose(model,fixture.kind),camera=cameraFor(model,face,fixture),mat=material(size,fixture.axis,extra.uniform),target=document.createElement('canvas');target.width=width;target.height=height;
    target.getContext('2d',{willReadFrequently:false});
    function capture(frame){return hooks.capture(target,stepped(camera,frame,extra.stationary),model,{mode:mode,budget:extra.budget||2048,transparentBackground:true,diagnostic:{material:mat,unlit:true,filter:extra.filter||'stable',targetFace:face}});}
    // Warm both rendering and native readback before the stationary control.
    // These captures are diagnostics, explicitly not benchmark measurements.
    for(var warm=0;warm<4;warm++)capture(0);
    var first=capture(0),last=capture(frames-1),fp=planeFor(face,camera,fixture.axis,width,height),lp=planeFor(face,stepped(camera,frames-1,extra.stationary),fixture.axis,width,height);
    var roi=fixture.roi||roiFor(maskFor(fp,first),maskFor(lp,last),fixture.roiSize?fixture.roiSize[0]:fixture.kind==='roof'?32:64,fixture.roiSize?fixture.roiSize[1]:fixture.kind==='roof'?16:32,fixture.kind==='floor'?[180,166]:[180,120]);fixture.roi=roi;
    var actual=[],expected=[],trace=[],prerequisites=[];
    for(var frame=0;frame<frames;frame++){if(hooks.cancelled())throw Error('Cancelled');if(frame%4===0)await hooks.next();var pos=stepped(camera,frame,extra.stationary),sample=frame===0?first:frame===frames-1?last:capture(frame),plane=planeFor(face,pos,fixture.axis,width,height),a=new Float64Array(roi.width*roi.height),e=new Float64Array(a.length);var missing=0,alpha=0;
      for(var y=0;y<roi.height;y++)for(var x=0;x<roi.width;x++){var sx=roi.x+x,sy=roi.y+y,index=y*roi.width+x,screen=sy*width+sx,p=hit(plane,sx+.5,sy+.5,true);if(!p||Math.abs(sample.depth[screen]-1/p.depth)>Math.max(1e-7,1/p.depth*1e-5))missing++;if(sample.pixels[screen*4+3]!==255)alpha++;a[index]=sample.pixels[screen*4]/255;e[index]=extra.uniform?1:1-StructureTemporal.coverage(sx,sy,plane);}
      for(var gy=0;gy<3;gy++)for(var gx=0;gx<3;gx++){var xx=roi.x+Math.floor((roi.width-1)*gx/2),yy=roi.y+Math.floor((roi.height-1)*gy/2),targetHit=hit(plane,xx+.5,yy+.5,true),nearest=hooks.rayDepth(model,pos,xx,yy,width,height);if(!targetHit||Math.abs(nearest-targetHit.depth)>Math.max(1e-5,targetHit.depth*1e-6))prerequisites.push('Independent nearest-surface mismatch at frame '+frame+', '+xx+','+yy);}
      if(missing||alpha)prerequisites.push('Frame '+frame+': target depth misses='+missing+', alpha holes='+alpha);
      if(!sample.work.patternFills||sample.work.failedDraws||!sample.work.targetWork||!(sample.work.targetWork.triangles+sample.work.targetWork.strips)||sample.work.targetWork.fallbackFaces)prerequisites.push('Frame '+frame+': missing target texture work, fallback or draw failure');
      if(sample.work.triangles+sample.work.strips>(extra.budget||2048))prerequisites.push('Frame '+frame+': view mapping budget exceeded');
      actual.push(a);expected.push(e);trace.push({frame:frame,triangles:sample.work.triangles,strips:sample.work.strips,patternFills:sample.work.patternFills,cappedFaces:sample.work.cappedFaces,fallbackFaces:sample.work.fallbackFaces,target:sample.work.targetWork});}
    var analysis=StructureTemporal.analyze(actual,expected,roi.width,roi.height,{requireMotion:!extra.stationary&&!extra.uniform,minFrames:frames,minSamples:roi.width*roi.height,setupFailures:prerequisites});
    return {id:fixture.id+'-'+size+'-'+mode+(extra.filter==='legacy'?'-raw':''),structure:model.descriptor.type,descriptor:model.descriptor,surface:fixture.kind,axis:fixture.axis,tileSize:size,mapping:mode,filter:extra.filter||'stable',budget:extra.budget||2048,resolution:[width,height],frames:frames,roi:roi,camera:camera,cameraStep:[camera.stepX,camera.stepY,camera.stepZ],independentRaySamples:9*frames,face:{kind:face.kind,bounds:bounds(face),vertices:face.vertices},analysis:analysis,work:trace,actual:actual,expected:expected};
  }
  function evidence(result,target){var roi=result.roi,frame=result.analysis.worstLocal?result.analysis.worstLocal.frame:result.analysis.worstTemporalFrame||1,canvases=[result.actual[frame-1],result.actual[frame],result.expected[frame-1],result.expected[frame]];
    target.width=roi.width*4;target.height=roi.height;var c=target.getContext('2d'),data=c.createImageData(target.width,target.height);canvases.forEach(function(values,panel){for(var y=0;y<roi.height;y++)for(var x=0;x<roi.width;x++){var at=(y*target.width+panel*roi.width+x)*4,value=Math.round(Math.max(0,Math.min(1,values[y*roi.width+x]))*255);data.data[at]=data.data[at+1]=data.data[at+2]=value;data.data[at+3]=255;}});c.putImageData(data,0,0);
    return {id:result.id,frame:frame,layout:'Actual previous / actual current / exact expected previous / exact expected current',worstLocal:result.analysis.worstLocal};}
  async function run(hooks){var report={kind:'native-structure-motion',fixtureVersion:2,complete:false,status:'SETUP_FAILURE',thresholds:TextureTemporal.thresholds,localThresholds:TextureTemporal.lineThresholds,cases:[],controls:[],setupFailures:[],artwork:{dark:0,light:255,darkWidth:1/16},limitations:'Diagnostic 1/16-tile mortar bands on real full-structure geometry, unlit to isolate mapping. Independent exact pixel-area oracle; not a whole-game FPS benchmark or all-material certification.'};
    var fixtures=[{id:'fortress-floor',type:'fortress',kind:'floor',axis:'v'},{id:'arena-floor',type:'arena',kind:'floor',axis:'v'},{id:'fortress-grazing-wall',type:'fortress',kind:'fortress-wall',axis:'v'},{id:'fortress-front-wall',type:'fortress',kind:'fortress-wall',axis:'v',front:true},{id:'arena-inner-wall',type:'arena',kind:'arena-wall',axis:'v'},{id:'tower-tall-wall',type:'watchtower',kind:'tower-wall',axis:'v'},{id:'fortress-sloped-roof',type:'fortress',kind:'roof',axis:'u'},{id:'tower-sloped-roof',type:'watchtower',kind:'roof',axis:'u'}];
    fixtures.push({id:'fortress-floor-walk',type:'fortress',kind:'floor',axis:'v',walk:true},{id:'tower-roof-walk',type:'watchtower',kind:'roof',axis:'u',walk:true});
    var models={},worst=null,first=null;['fortress','arena','watchtower'].forEach(function(type){models[type]=hooks.build(type,1.15);});
    try{for(var fixture of fixtures)for(var size of [64,128])for(var mode of ['triangles','planar','hybrid']){hooks.progress('Motion test: '+fixture.id+' · '+size+'px · '+mode);try{var result=await measure(hooks,fixture,models[fixture.type],size,mode);report.cases.push(publicResult(result));if(!result.analysis.valid)report.setupFailures.push(result.id+': '+result.analysis.failures.join('; '));if(!first&&result.analysis.valid)first=result;if(result.analysis.valid&&(!worst||result.analysis.maxLocalTemporalRms>worst.analysis.maxLocalTemporalRms))worst=result;}catch(e){if(hooks.cancelled())throw e;report.setupFailures.push(fixture.id+'-'+size+'-'+mode+': '+e.message);}}
      if(!first)throw Error('No valid full-structure motion subjects');
      hooks.progress('Motion controls: stationary, uniform and localized injected pulse');
      var controlFixture=fixtures[0],controlModel=models.fortress;
      var stationary=await measure(hooks,controlFixture,controlModel,128,'triangles',{stationary:true});
      report.controls.push({id:'stationary-scene',pass:stationary.analysis.valid&&stationary.analysis.actualMotionRms===0&&stationary.analysis.temporalResidualRms===0,analysis:stationary.analysis});
      var uniform=await measure(hooks,controlFixture,controlModel,128,'triangles',{uniform:true});
      report.controls.push({id:'uniform-moving-surface',pass:uniform.analysis.valid&&uniform.analysis.temporalResidualRms<1/160&&uniform.analysis.spatialMae<1/160,analysis:uniform.analysis});
      var planarStationary=await measure(hooks,controlFixture,controlModel,128,'planar',{stationary:true});
      report.controls.push({id:'planar-stationary-scene',pass:planarStationary.analysis.valid&&planarStationary.analysis.actualMotionRms===0&&planarStationary.analysis.temporalResidualRms===0,analysis:planarStationary.analysis});
      var planarUniform=await measure(hooks,controlFixture,controlModel,128,'planar',{uniform:true});
      report.controls.push({id:'planar-uniform-moving-surface',pass:planarUniform.analysis.valid&&planarUniform.analysis.temporalResidualRms<1/160&&planarUniform.analysis.spatialMae<1/160,analysis:planarUniform.analysis});
      var injected=first.expected.map(function(values,f){var a=new Float64Array(values);for(var y=0;y<8;y++)for(var x=0;x<8;x++){var i=y*first.roi.width+x;a[i]=values[i]*.7+(f%2?.3:0);}return a;});
      var pulse=StructureTemporal.analyze(injected,first.expected,first.roi.width,first.roi.height,{requireMotion:true});
      report.controls.push({id:'localized-eight-pixel-pulse',pass:pulse.valid&&pulse.maxLocalTemporalRms>.12&&pulse.status==='QUALITY_FAILURE',analysis:pulse});
      var raw=await measure(hooks,controlFixture,controlModel,128,'triangles',{filter:'legacy'});report.controls.push({id:'raw-sampling-comparison',analysis:raw.analysis,work:raw.work,descriptiveComparison:true});if(!raw.analysis.valid)report.setupFailures.push('Raw comparison invalid: '+raw.analysis.failures.join('; '));
      report.controls.push(occlusionControl(hooks,controlModel,first));
      report.diagnostics=[];for(var fi of [fixtures[8],fixtures[9]])for(var stoneMode of ['triangles','planar']){hooks.progress('Real-stone diagnostic: '+fi.id+' · '+stoneMode);try{report.diagnostics.push(await stoneDiagnostic(hooks,fi,models[fi.type],stoneMode));}catch(e){if(hooks.cancelled())throw e;report.setupFailures.push(fi.id+' real-stone '+stoneMode+': '+e.message);}}
      if(report.controls.some(function(c){return c.pass===false;}))report.setupFailures.push('An analysis sensitivity control failed');
      if(worst&&hooks.evidence)report.evidence=hooks.evidence(worst,evidence);
      report.temporalFailures=report.cases.filter(function(c){var a=c.analysis;return a.valid&&(a.temporalResidualRms>.05||a.maxFrameTemporalRms>.08||a.maxLocalTemporalRms>.12);}).map(function(c){return c.id;});
      report.spatialFailures=report.cases.filter(function(c){return c.analysis.valid&&c.analysis.spatialMae>.08;}).map(function(c){return c.id;});
      report.mappingResults={};['triangles','planar','hybrid'].forEach(function(mode){var cases=report.cases.filter(function(c){return c.mapping===mode;}),group={expectedCases:20,cases:cases.length,passed:cases.filter(function(c){return c.analysis.status==='PASS';}).length,qualityFailures:cases.filter(function(c){return c.analysis.status==='QUALITY_FAILURE';}).map(function(c){return c.id;}),setupFailures:cases.filter(function(c){return !c.analysis.valid;}).map(function(c){return c.id;})};group.status=group.cases!==group.expectedCases||group.setupFailures.length||report.setupFailures.length?'SETUP_FAILURE':group.qualityFailures.length?'QUALITY_FAILURE':'PASS';report.mappingResults[mode]=group;});
      report.complete=true;report.status=report.setupFailures.length?'SETUP_FAILURE':report.temporalFailures.length||report.spatialFailures.length?'QUALITY_FAILURE':'PASS';
    }catch(e){report.status=hooks.cancelled()?'CANCELLED':'SETUP_FAILURE';report.setupFailures.push(e.message);}return report;
  }
  // Stage L (prop textures): the magnified band. The chest at production
  // size (12-prop-models.js CHEST_MODEL_DIMS: 14 wide, 10 deep, body 8, lid
  // 3, wood at uvScale 14, so one tile spans 14 units) seen from 20 to 90
  // units. At this 360x240 view (focal 247.8 px) a 128 px texel covers about
  // 1.35 screen pixels at 20 units and 0.30 at 90, where run() starts at
  // about 62 units on 32-unit tiles. Two surfaces: the body front seen level
  // from its own centre height (a vertical band, axis u, crossing under a
  // sideways walk) and the lid top seen from the standing eye (cameraZ 60
  // over the chest's floor, looking down with the game's y-shear pitch,
  // within CAM_PITCH_MAX 1.4; a horizontal band, axis v, under a forward
  // walk). Triangles only (props never use planar strips), tiles 64 and 128,
  // with run()'s oracle, thresholds and prerequisites. Unlit diagnostic
  // bands, not the wood art: mapping and shimmer, not the look.
  var CHEST_PANEL=Object.freeze({hw:7,hd:5,bodyH:8,lidH:3,uvScale:14});
  var MAGNIFIED_FRONT=Object.freeze([[20,64,32],[30,64,32],[45,48,24],[62,32,16],[90,24,12]]);
  var MAGNIFIED_LID=Object.freeze([[45,48,24],[62,32,12],[90,24,8]]);
  var STANDING_EYE=60,PITCH_MAX=1.4;
  // One face per model: the body front at y=-hd facing the camera at -y,
  // or the lid top at z=bodyH+lidH. UVs in tiles; each diagnostic band
  // crosses the face's centre (u=0 at x=0; v=0 at the front's mid height or
  // the lid's centre line).
  function chestModel(kind){var D=CHEST_PANEL,S=D.uvScale,W=D.hw,L=D.hd,H=D.bodyH,top=D.bodyH+D.lidH,mid=H/2;
    function v(x,y,z,u,w){return{x:x,y:y,z:z,u:u,v:w};}
    var vertices=kind==='chest-front'?[v(-W,-L,0,-W/S,mid/S),v(W,-L,0,W/S,mid/S),v(W,-L,H,W/S,(mid-H)/S),v(-W,-L,H,-W/S,(mid-H)/S)]:
      [v(-W,-L,top,-W/S,-L/S),v(W,-L,top,W/S,-L/S),v(W,L,top,W/S,L/S),v(-W,L,top,-W/S,L/S)];
    var face={kind:kind,material:'wood',color:'#a06830',light:1,vertices:vertices},b=bounds(face);
    return{descriptor:{type:'chest',surface:kind,dims:CHEST_PANEL},faces:[face],bounds:b,bodyBounds:b};}
  // Camera on the -y side looking +y. Front: eye at the front's centre
  // height, pitch 0, walking sideways (+x) 0.3 px a frame at the face. Lid:
  // the standing eye, pitch (eye - lid)/distance to centre the lid, walking
  // forward (+y) 1/1200 of the distance a frame (the band moves 0.1-0.2 px).
  function chestCamera(face,fixture){var c=centroid(face),d=fixture.distance,eye=fixture.kind==='chest-front'?c.z:STANDING_EYE;
    var pitch=fixture.kind==='chest-front'?0:Math.min(PITCH_MAX,(eye-c.z)/d);
    return{x:c.x,y:c.y-d,z:60+(eye-60)*40/25,ang:Math.PI/2,pitch:pitch,fov:Math.PI/2.5,
      stepX:fixture.kind==='chest-front'?d*.0012:0,stepY:fixture.kind==='chest-front'?0:d/1200,stepZ:0};}
  function magnifiedFixtures(){var list=[];
    MAGNIFIED_FRONT.forEach(function(f){list.push({id:'chest-front-'+f[0],kind:'chest-front',axis:'u',chest:true,distance:f[0],roiSize:[f[1],f[2]]});});
    MAGNIFIED_LID.forEach(function(f){list.push({id:'chest-lid-'+f[0],kind:'chest-lid',axis:'v',chest:true,distance:f[0],roiSize:[f[1],f[2]]});});
    return list;}
  async function runMagnified(hooks){var report={kind:'native-chest-magnified-band',fixtureVersion:1,complete:false,status:'SETUP_FAILURE',chest:CHEST_PANEL,
      thresholds:TextureTemporal.thresholds,localThresholds:TextureTemporal.lineThresholds,mapping:'triangles',tileSizes:[64,128],cases:[],controls:[],setupFailures:[],
      limitations:'Diagnostic 1/16-tile bands on one chest-sized face at a time, unlit, in the structure study renderer (the game sink adds the wash, light and owned-pixel mask). Independent exact pixel-area oracle; not a timing claim.'};
    try{var fixtures=magnifiedFixtures(),models={'chest-front':chestModel('chest-front'),'chest-lid':chestModel('chest-lid')};report.expectedCases=fixtures.length*2;
      for(var fixture of fixtures)for(var size of [64,128]){hooks.progress('Magnified band: '+fixture.id+' · '+size+'px · triangles');
        try{var result=await measure(hooks,fixture,models[fixture.kind],size,'triangles');var entry=publicResult(result);entry.distance=fixture.distance;
          entry.screenPixelsPerTexel=Math.round(CHEST_PANEL.uvScale*width/(2*Math.tan(Math.PI/5))/(size*fixture.distance)*1000)/1000;report.cases.push(entry);
          if(!result.analysis.valid)report.setupFailures.push(result.id+': '+result.analysis.failures.join('; '));}
        catch(e){if(hooks.cancelled())throw e;report.setupFailures.push(fixture.id+'-'+size+'-triangles: '+e.message);}}
      hooks.progress('Magnified band controls: stationary and uniform at 20 units');
      var near=magnifiedFixtures()[0],nearModel=models['chest-front'];
      var stationary=await measure(hooks,near,nearModel,128,'triangles',{stationary:true});
      report.controls.push({id:'stationary-magnified',pass:stationary.analysis.valid&&stationary.analysis.actualMotionRms===0&&stationary.analysis.temporalResidualRms===0,analysis:stationary.analysis});
      var uniform=await measure(hooks,near,nearModel,128,'triangles',{uniform:true});
      report.controls.push({id:'uniform-magnified',pass:uniform.analysis.valid&&uniform.analysis.temporalResidualRms<1/160&&uniform.analysis.spatialMae<1/160,analysis:uniform.analysis});
      if(report.controls.some(function(c){return c.pass===false;}))report.setupFailures.push('A magnified-band sensitivity control failed');
      report.temporalFailures=report.cases.filter(function(c){var a=c.analysis;return a.valid&&(a.temporalResidualRms>.05||a.maxFrameTemporalRms>.08||a.maxLocalTemporalRms>.12);}).map(function(c){return c.id;});
      report.spatialFailures=report.cases.filter(function(c){return c.analysis.valid&&c.analysis.spatialMae>.08;}).map(function(c){return c.id;});
      report.passed=report.cases.filter(function(c){return c.analysis.status==='PASS';}).length;
      if(report.cases.length!==report.expectedCases)report.setupFailures.push('Expected '+report.expectedCases+' cases, measured '+report.cases.length);
      report.complete=true;report.status=report.setupFailures.length?'SETUP_FAILURE':report.temporalFailures.length||report.spatialFailures.length?'QUALITY_FAILURE':'PASS';
    }catch(e){report.status=hooks.cancelled()?'CANCELLED':'SETUP_FAILURE';report.setupFailures.push(e.message);}return report;
  }
  // Hooks from global render, next and rayDepth, for a page that exposes
  // them. /structures.html does not (its page script is closed over), so this
  // throws there: run the case with its 'Test prop magnified band' button.
  function pageHooks(){if(typeof render!=='function'||typeof rayDepth!=='function'||typeof next!=='function')throw Error('pageHooks needs global render, rayDepth and next; on /structures.html use the Test prop magnified band button');
    var stopped=false;
    return{next:next,rayDepth:rayDepth,cancelled:function(){return stopped;},cancel:function(){stopped=true;},
      progress:function(text){if(typeof status==='function')status(text);},
      capture:function(target,position,m,options){var work=render(target,true,position,m,options);
        return{work:work,pixels:target.getContext('2d').getImageData(0,0,target.width,target.height).data,depth:_sceneDepthInv.slice(0,target.width*target.height)};}};}
  return {run:run,planeFor:planeFor,hit:hit,runMagnified:runMagnified,magnifiedFixtures:magnifiedFixtures,chestModel:chestModel,
    chestCamera:chestCamera,CHEST_PANEL:CHEST_PANEL,pageHooks:pageHooks};
}());
