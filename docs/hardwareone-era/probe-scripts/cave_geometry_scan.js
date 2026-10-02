(0, eval)(slurp('tools/webui/harness/_game_env.js'));
LAB.init(__out, slurp, __engine, __argv);
var mf = JSON.parse(slurp('assets/games/manifest.json'));
(0, eval)(mf.parts.MAIN.map(function(f){return slurp('assets/games/' + f);}).join('\n'));
CAVE_TEST_MODE = true;
ENDLESS_MODE = true;
window._caveTestKindOverride = 'hillside';
var found = [];
var maxRise = -100;
var maxOuterRise = -100;
var outerSeed = 0;
var bestFit=-100,fitSeed=0;
for (var seed = 1; seed <= 10000 && found.length < 3; seed++) {
  WORLD_SEED = seed;
  noiseSeed = (seed * 7 + 42) | 0;
  _biomeSeed = (seed * 13 + 999) | 0;
  _geoSeed = (seed * 19 + 5555) | 0;
  _ampBoost = 1.2;
  endlessCaveNetworks = {};
  var net = generateCaveNetwork(0,0), e = net.entrances[0];
  if(net.hillsideFitMargin>bestFit){bestFit=net.hillsideFitMargin;fitSeed=seed;}
  var rise = getEndlessNaturalSurfaceH(e.x+Math.cos(e.angle)*300,e.y+Math.sin(e.angle)*300)-getEndlessNaturalSurfaceH(e.x,e.y);
  maxRise = Math.max(maxRise,rise);
  for (var ang = 0; ang < 32; ang++) {
    var a = ang*Math.PI/16, tx = 720+Math.cos(a)*340, ty=720+Math.sin(a)*340;
    var o = getEndlessNaturalSurfaceH(tx+Math.cos(a)*180,ty+Math.sin(a)*180);
    var inside = getEndlessNaturalSurfaceH(tx-Math.cos(a)*300,ty-Math.sin(a)*300);
    if(inside-o>maxOuterRise){maxOuterRise=inside-o;outerSeed=seed;}
  }
  if (e.kind === 'hillside') {
    found.push(seed);
    LAB.note(JSON.stringify({seed:seed,entrance:e,route:net.route}));
  }
}
LAB.note('HILLSIDE_SEEDS ' + JSON.stringify(found));
LAB.note('MAXRISE ' + maxRise + ' CHUNK ' + CHUNK_SIZE);
LAB.note('MAXOUTER ' + maxOuterRise + ' SEED ' + outerSeed);
LAB.note('FIT '+ bestFit+' SEED '+fitSeed);
undefined;
