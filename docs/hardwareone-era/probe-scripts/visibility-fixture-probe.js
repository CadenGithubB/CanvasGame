(function () {
  var source=slurp('tools/game/tests/cave_occlusion_integration.js');
  var extra="\n  [[12345,'descending'],[5668,'hillside']].forEach(function(fixture){\n"+
    "    start(fixture[0],fixture[1]); elements.controlMapCanvas=canvas(); element('ctVisibilityFixtures').checked=true;\n"+
    "    var original=G.drawEnemies3D, originalFixture=G.drawCaveVisibilityFixtures, count=0;\n"+
    "    G.drawCaveVisibilityFixtures=function(){var oldE=G.enemies,oldC=G.treasureChests,oldP=G.projectiles; originalFixture();check(fixture[1]+' fixture restores original entity arrays',G.enemies===oldE&&G.treasureChests===oldC&&G.projectiles===oldP);};\n"+
    "    G.drawEnemies3D=function(){count++;var e=G.enemies[0]; check(fixture[1]+' fixture enemy grounded and open',Number.isFinite(e.z)&&!G.isInGridWall(e.x,e.y,4)); original();};\n"+
    "    var before=errors.length, gen=G._loopGen; G.previewCaveView('mouth'); G.previewCaveView('inside');\n"+
    "    G.drawEnemies3D=original; check(fixture[1]+' fixture remains frozen across views',!G.running&&G._loopGen>gen&&count===2);\n"+
    "    G.drawCaveVisibilityFixtures=originalFixture;\n"+
    "    if(errors.length>before)output('FIXTURE_ERRORS '+errors.slice(before).join('\\n'));\n"+
    "    check(fixture[1]+' fixture actual draw has no errors',errors.length===before);\n"+
    "    element('ctVisibilityFixtures').checked=false;\n"+
    "  });\n";
  (0,eval)(source.replace("  output('CAVE_OCCLUSION_INTEGRATION_RESULT PASS '",extra+"  output('CAVE_OCCLUSION_INTEGRATION_RESULT PASS '"));
}());
