(function(){
  var G=(0,eval)('this'),out=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
  var host=slurp('tools/game/tests/cave_occlusion_integration.js'),end=host.indexOf('  function check(name, okay) {');
  (0,eval)(host.slice(0,end)+'}());');
  var n=64,m={w:8,h:8,gridSize:12,layerCount:new Uint8Array(n),surfaceH:new Float32Array(n)};
  for(var k=0;k<5;k++){m['l'+k+'Type']=new Uint8Array(n);m['l'+k+'TopZ']=new Float32Array(n);m['l'+k+'Meta']=new Uint8Array(n);}
  for(var i=0;i<n;i++){var x=i%8,y=Math.floor(i/8);m.layerCount[i]=1;m.l0Type[i]=1;m.l0Meta[i]=1;m.l0TopZ[i]=Math.sin(x)*2+Math.cos(y)*2;m.surfaceH[i]=m.l0TopZ[i];
    if(x>=2&&x<=6&&y>=2&&y<=6){m.layerCount[i]=3;m.l0Meta[i]=2;m.l1Type[i]=2;m.l1TopZ[i]=7+.1*x;m.l2Type[i]=4;m.l2Meta[i]=3;m.l2TopZ[i]=9+.1*x;m.surfaceH[i]=m.l2TopZ[i];}}
  G.buildWalkCandZ(m);var cache=G.getFloorStitchCache(m),triangles=[];
  for(var y=0;y<7;y++)for(var x=0;x<7;x++){var ci=y*8+x;for(var li=0;li<m.layerCount[ci];li++){
    var type=m['l'+li+'Type'][ci],h=m['l'+li+'TopZ'][ci],tile=G.getFloorStitchTile(m,cache,ci,li,type===2?0:G.getFloorRenderLayerRole(m,ci,li,type),h,type===2),o=(ci&255)*3;
    var a=tile.values[o],b=tile.values[o+1],c=tile.values[o+2];if(!Number.isFinite(a)||!Number.isFinite(b)||!Number.isFinite(c))continue;
    if(type!==2){a=Math.max(h-4.5,Math.min(h+4.5,a));b=Math.max(h-4.5,Math.min(h+4.5,b));c=Math.max(h-4.5,Math.min(h+4.5,c));}
    var v0=[x*12,y*12,h*25],v1=[(x+1)*12,y*12,a*25],v2=[(x+1)*12,(y+1)*12,c*25],v3=[x*12,(y+1)*12,b*25];triangles.push([v0,v1,v2],[v0,v2,v3]);
  }}
  function sub(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
  function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function hit(a,b,tri){var d=sub(b,a),e1=sub(tri[1],tri[0]),e2=sub(tri[2],tri[0]),p=cross(d,e2),det=dot(e1,p);if(Math.abs(det)<1e-9)return false;
    var tvec=sub(a,tri[0]),u=dot(tvec,p)/det;if(u< -1e-8||u>1+1e-8)return false;var q=cross(tvec,e1),v=dot(d,q)/det;if(v< -1e-8||u+v>1+1e-8)return false;var t=dot(e2,q)/det;return t>1e-7&&t<.9999999;}
  var seed=571,count=0,mismatch=[];function rng(){seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;}
  function check(a,b){var actual=G.surfaceLightRayBlocked(a[0],a[1],a[2],b[0],b[1],b[2],m),expected=triangles.some(function(tri){return hit(a,b,tri);});count++;if(actual!==expected)mismatch.push({a:a,b:b,actual:actual,expected:expected});}
  for(var i=0;i<1000;i++)check([rng()*144-24,rng()*144-24,rng()*400-100],[rng()*144-24,rng()*144-24,rng()*400-100]);
  for(var x=-12;x<=108;x+=12)for(var y=-12;y<=108;y+=12){check([x,y,-100],[x,y,400]);check([x,y,-100],[x+60,y+60,400]);check([x,y,-100],[x-60,y+60,400]);}
  out(JSON.stringify({rays:count,triangles:triangles.length,mismatchCount:mismatch.length,nonverticalMismatches:mismatch.filter(function(r){return r.a[0]!==r.b[0]||r.a[1]!==r.b[1];}),firstMismatches:mismatch.slice(0,8)}));
  out('SURFACE_RAY_REVIEW_DONE');
}());
