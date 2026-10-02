var floorMesh = null, pos = {floorZ: 60};
(0, eval)(slurp('assets/games/src/06-floor-queries.js'));
var checked = 0;
function check(name, okay) { if (!okay) throw new Error(name); checked++; __out('PASS ' + name); }
function cell(layers) {
  floorMesh = {gridSize: 12, w: 1, h: 1, layerCount: [layers.length]};
  for (var n=0; n<5; n++) {
    floorMesh['l'+n+'Type'] = [layers[n] ? layers[n][0] : 0];
    floorMesh['l'+n+'TopZ'] = [layers[n] ? layers[n][1] : 0];
  }
}
cell([[1,-5],[2,-1],[4,0]]);
check('surface remains on roof', getWalkableLayerTopAt(6,6,0).idx===2);
check('cave remains below roof', getWalkableLayerTopAt(6,6,-5).idx===0);
check('roof is not underground', !getCaveSpaceAt(6,6,0).underground);
check('cave is underground', getCaveSpaceAt(6,6,-5).ceilingH===-1);
cell([[1,-5],[2,-1]]);
check('cannot fall through ceiling without cap', getWalkableLayerTopAt(6,6,0).action==='blocked');
cell([[1,4],[2,6]]);
check('low headroom blocked above sea level', getWalkableLayerTopAt(6,6,4).action==='blocked');
cell([[1,4],[2,8]]);
check('hillside cave positive elevation supported', getWalkableLayerTopAt(6,6,4).action==='walk');
cell([[1,-.5]]);
check('normal step down is walking', getWalkableLayerTopAt(6,6,0).action==='walk');
cell([[1,-3]]);
check('large drop still falls', getWalkableLayerTopAt(6,6,0).action==='fall');
cell([[1,2]]);
check('steep rise blocked with actual height', getWalkableLayerTopAt(6,6,0).action==='blocked' && getWalkableLayerTopAt(6,6,0).topH===2);
check('missing geometry is explicit, not ground0', getWalkableLayerTopAt(-1,6,0).action==='missing' && getWalkableLayerTopAt(-1,6,0).topH===null);
pos.floorZ=0;
check('legacy playerZ0 is legitimate height', getPlayerFloorH()===-1.5);
__out('TOTAL ' + checked);
