// DEV ONLY: exact projected-stripe coverage, independent of the renderer's
// projection, subdivision, affine mapper, mip filters and Canvas rasterizer.
// Native structure-motion captures supply their own camera/plane coefficients.
var StructureTemporal = (function () {
  var maxBands = 128;

  function clip(polygon, a, b, c) {
    var output=[], previous=polygon[polygon.length-1];
    var previousValue=a*previous.x+b*previous.y+c;
    for(var i=0;i<polygon.length;i++) {
      var current=polygon[i], value=a*current.x+b*current.y+c;
      if((previousValue>=0)!==(value>=0)) {
        var t=previousValue/(previousValue-value);
        output.push({x:previous.x+t*(current.x-previous.x),y:previous.y+t*(current.y-previous.y)});
      }
      if(value>=0)output.push(current);
      previous=current;previousValue=value;
    }
    return output;
  }

  // q(screenX,screenY) = numerator(screenX,screenY) / denominator(...).
  // Arrays contain [xCoefficient,yCoefficient,constant]. Dark bands occupy
  // [k*period,k*period+darkWidth). All four pixel corners must be in the same
  // positive-denominator half-space; crossing a horizon is not valid evidence.
  function coverage(x,y,plane) {
    var num=plane&&plane.numerator, den=plane&&plane.denominator;
    var period=plane&&plane.period, darkWidth=plane&&plane.darkWidth;
    if(!Number.isFinite(x)||!Number.isFinite(y)||!num||!den||num.length!==3||den.length!==3||
        !Array.prototype.every.call(num,Number.isFinite)||!Array.prototype.every.call(den,Number.isFinite)||
        !Number.isFinite(period)||period<=0||!Number.isFinite(darkWidth)||darkWidth<0||darkWidth>period) {
      throw new RangeError('Invalid projected stripe plane');
    }
    // Translate to pixel-local coordinates before clipping and area integration.
    var n0=num[0]*x+num[1]*y+num[2], d0=den[0]*x+den[1]*y+den[2];
    var minimum=Infinity, maximum=-Infinity;
    for(var cy=0;cy<2;cy++)for(var cx=0;cx<2;cx++) {
      var n=n0+num[0]*cx+num[1]*cy, d=d0+den[0]*cx+den[1]*cy;
      if(!Number.isFinite(d)||d<=0)throw new RangeError('Projected stripe pixel crosses a horizon');
      var q=n/d;
      if(!Number.isFinite(q))throw new RangeError('Nonfinite projected stripe coordinate');
      minimum=Math.min(minimum,q);maximum=Math.max(maximum,q);
    }
    if(darkWidth===0)return 0;
    if(darkWidth===period)return 1;
    var firstBand=Math.floor(minimum/period), lastBand=Math.floor(maximum/period);
    if(!Number.isSafeInteger(firstBand)||!Number.isSafeInteger(lastBand)||lastBand-firstBand+1>maxBands) {
      throw new RangeError('Projected stripe pixel exceeds oracle band budget');
    }
    // A constant coordinate exactly on a band edge covers positive area. Honor
    // the artwork's half-open interval instead of double-counting that boundary.
    if(minimum===maximum)return minimum-firstBand*period<darkWidth?1:0;
    var area=0;
    for(var band=firstBand;band<=lastBand;band++) {
      var lower=band*period, upper=lower+darkWidth;
      var lowerA=num[0]-lower*den[0], lowerB=num[1]-lower*den[1], lowerC=n0-lower*d0;
      var upperA=upper*den[0]-num[0], upperB=upper*den[1]-num[1], upperC=upper*d0-n0;
      if(![lowerA,lowerB,lowerC,upperA,upperB,upperC].every(Number.isFinite)) {
        throw new RangeError('Unrepresentable projected stripe boundary');
      }
      var polygon=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
      polygon=clip(polygon,lowerA,lowerB,lowerC);
      if(!polygon.length)continue;
      polygon=clip(polygon,upperA,upperB,upperC);
      if(!polygon.length)continue;
      var twiceArea=0;
      for(var vertex=0;vertex<polygon.length;vertex++) {
        var next=polygon[(vertex+1)%polygon.length];
        twiceArea+=polygon[vertex].x*next.y-next.x*polygon[vertex].y;
      }
      area+=Math.abs(twiceArea)*0.5;
    }
    // Clipping roundoff may leave a few ulps outside the physical area range.
    return Math.max(0,Math.min(1,area));
  }

  // Keep one temporal analyzer and its established quality limits. Callers may
  // strengthen subject prerequisites, but cannot quietly loosen quality gates.
  // The existing analyzer retains its explicit one-byte quantization policy.
  function analyze(actualFrames,referenceFrames,width,height,options) {
    if(typeof TextureTemporal==='undefined'||typeof TextureTemporal.analyzeLocal!=='function') {
      throw new Error('Structure temporal analysis requires TextureTemporal');
    }
    var settings=Object.assign({},options);
    settings.maxTemporalRms=TextureTemporal.thresholds.maxTemporalRms;
    settings.maxSpatialMae=TextureTemporal.thresholds.maxSpatialMae;
    return TextureTemporal.analyzeLocal(actualFrames,referenceFrames,width,height,settings);
  }

  return {coverage:coverage,analyze:analyze};
}());
