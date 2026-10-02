var G = (0,eval)('this');
G.window = {}; G.CHUNK_SIZE = 480; G.ENDLESS_MODE = true; G.CAVE_TEST_MODE = false;
G._biomeSeed = 0;
(0,eval)(slurp('assets/games/src/03-level-generation.js'));
(0,eval)(slurp('assets/games/src/05-endless-world.js'));
var found = [], normal = 0;
for (var seed=1; seed<=10000 && !found.length; seed++) {
  G.WORLD_SEED=seed; G.noiseSeed=(seed*7+42)|0; G._biomeSeed=(seed*13+999)|0;
  G._geoSeed=(seed*19+5555)|0; G._ampBoost=1.2; G.endlessCaveNetworks={};
  for(var x=-12;x<=12 && !found.length;x++)for(var y=-12;y<=12 && !found.length;y++) {
    var n=generateCaveNetwork(x,y);if(!n)continue;normal++;
    if(n.entrances[0].kind==='hillside')found.push({seed:seed,region:[x,y],portal:n.entrances[0]});
  }
}
__out('NORMAL_HILLSIDE '+JSON.stringify(found)+' after '+normal+' generated caves');
undefined;
