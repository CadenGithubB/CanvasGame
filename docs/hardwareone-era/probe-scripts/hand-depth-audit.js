(function(){
  var G=(0,eval)('this');function noop(){}
  G.performance={now:function(){return 0;}};G.MODE3D=true;G.shopOpen=false;G.ambientLight=.8;
  G.canvas={width:360,height:240};G.ctx={save:noop,restore:noop,beginPath:noop,moveTo:noop,lineTo:noop,closePath:noop,fill:noop,stroke:noop,
    createLinearGradient:function(){return{addColorStop:noop};}};
  (0,eval)(slurp('assets/games/src/15-hand-rig.js'));
  function raster(time,yaw){
    G.drawFirstPersonHandRig(time,yaw);var m=G.buildHandRigMesh(),S=m.screen,w=360,h=240;
    var nearest=new Float64Array(w*h),painted=new Float64Array(w*h);nearest.fill(Infinity);painted.fill(Infinity);
    m.order.forEach(function(fi){var f=m.faces[fi],a=f[0]*3,b=f[1]*3,c=f[2]*3;
      var ax=S[a],ay=S[a+1],bx=S[b],by=S[b+1],cx=S[c],cy=S[c+1];
      var area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
      var x0=Math.max(0,Math.floor(Math.min(ax,bx,cx))),x1=Math.min(w-1,Math.ceil(Math.max(ax,bx,cx)));
      var y0=Math.max(0,Math.floor(Math.min(ay,by,cy))),y1=Math.min(h-1,Math.ceil(Math.max(ay,by,cy)));
      for(var y=y0;y<=y1;y++)for(var x=x0;x<=x1;x++){
        var px=x+.5,py=y+.5,u=((bx-px)*(cy-py)-(by-py)*(cx-px))/area;
        var v=((cx-px)*(ay-py)-(cy-py)*(ax-px))/area,z=1-u-v;
        if(u<1e-8||v<1e-8||z<1e-8)continue;
        var depth=1/(u/S[a+2]+v/S[b+2]+z/S[c+2]),i=y*w+x;
        nearest[i]=Math.min(nearest[i],depth);painted[i]=depth;
      }
    });
    var pixels=0,wrong=0,maxError=0,box=[w,h,-1,-1];
    for(var i=0;i<nearest.length;i++)if(nearest[i]!==Infinity){pixels++;var error=painted[i]-nearest[i];
      if(error>.1){wrong++;maxError=Math.max(maxError,error);var x=i%w,y=Math.floor(i/w);box[0]=Math.min(box[0],x);box[1]=Math.min(box[1],y);box[2]=Math.max(box[2],x);box[3]=Math.max(box[3],y);}}
    return {time:time,yaw:yaw,faces:m.order.length,pixels:pixels,wrong:wrong,maxError:maxError,box:wrong?box:null};
  }
  var result=[];[0,800,1050,1280,1600,2200].forEach(function(t){[-1.2,0,1.2].forEach(function(yaw){result.push(raster(t,yaw));});});
  __out(JSON.stringify(result));
}());
