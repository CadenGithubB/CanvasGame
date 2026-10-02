(function () {
  var sourceRoot = 'assets/games/';
  var manifest = JSON.parse(slurp(sourceRoot + 'manifest.json'));
  var text = manifest.parts.MAIN.map(function (p) { return slurp(sourceRoot + p); }).join('');
  (0, eval)(slurp('tools/webui/harness/_game_env.js'));
  LAB.init(__out, function (p) { return p === 'material-source' ? text : slurp(p); }, __engine, __argv);
  if (!LAB.load('material-source')) throw new Error(LAB.loadError);
  [[12345, 'descending'], [5668, 'hillside'], [6290, 'hillside']].forEach(function (f) {
    window._caveTestKindOverride = f[1];
    LAB.startCaveTest(f[0]);
    var attached = 0, rejected = 0, torchCount = 0;
    for (var di = 0; di < wallDecorations.length; di++) {
      var dec = wallDecorations[di];
      var nx = dec.side === 'west' ? -1 : dec.side === 'east' ? 1 : 0;
      var ny = dec.side === 'north' ? -1 : dec.side === 'south' ? 1 : 0;
      if (Math.floor((dec.worldX - nx * 0.5) / cell) !== dec.gridX ||
          Math.floor((dec.worldY - ny * 0.5) / cell) !== dec.gridY) {
        throw new Error('wrong attachment cell ' + f + ' ' + JSON.stringify(dec));
      }
      var at = getWallDecorationAttachment(dec);
      if (!at) { rejected++; continue; }
      attached++;
      if (dec.type === 'torch' || dec.type === 'sconce') {
        torchCount++;
        if (at.z - at.size < at.baseZ || at.z + at.size * 0.75 > at.topZ ||
            !pointLights.some(function (light) { return light.x === at.x && light.y === at.y && light.z === at.flameZ; })) {
          throw new Error('unattached flame ' + f + ' ' + JSON.stringify(dec));
        }
      }
    }
    LAB.out('DECOR_RUNTIME PASS ' + f[0] + ' attached=' + attached + ' collapsed rejected=' + rejected + ' aligned flames=' + torchCount);
    var caveCells = 0, mismatches = 0;
    for (var i = 0; i < floorMesh.layerCount.length; i++) {
      if (floorMesh.l1Type[i] !== 2) continue;
      caveCells++;
      if (floorMesh.l0Color[i] !== caveMaterialColorHex(floorMesh.caveStone[i]) ||
          floorMesh.l1Color[i] !== floorMesh.l0Color[i]) mismatches++;
    }
    if (!caveCells || mismatches) throw new Error('authored palette mismatch ' + f + ' ' + mismatches);
    var e = deepCaveEntrances[0];
    var x = Math.floor((e.x + Math.cos(e.angle) * 70) / floorMesh.gridSize) * floorMesh.gridSize;
    var y = Math.floor((e.y + Math.sin(e.angle) * 70) / floorMesh.gridSize) * floorMesh.gridSize;
    var worldX = x + windowOriginX, worldY = y + windowOriginY;
    var before = getCaveMaterialColorAt(x, y);
    assembleWindow(windowCX + Math.floor(WINDOW_CHUNKS / 2) + 1, windowCY + Math.floor(WINDOW_CHUNKS / 2));
    var after = getCaveMaterialColorAt(worldX - windowOriginX, worldY - windowOriginY);
    if (before !== after) throw new Error('rebasing recolored rock ' + f + ' ' + before + ' ' + after);
    LAB.out('MATERIAL_RUNTIME PASS ' + f[0] + ' ' + f[1] + ' cavity vertices=' + caveCells + ' shared floor/ceiling and rebase invariant');
  });
}());
undefined;
