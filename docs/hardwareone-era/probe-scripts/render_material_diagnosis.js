(0, eval)(slurp('tools/webui/harness/_game_env.js'));
LAB.init(__out, slurp, __engine, __argv);
var diagSource = slurp(__argv[0]);
var diagAnchor = '    // Texture-like color variation using position along face';
if (diagSource.split(diagAnchor).length !== 2) throw new Error('ambiguous wall diagnostic anchor');
diagSource = diagSource.replace(diagAnchor,
  '    window.__diagFaces.push({x:(wx1+wx2)/2+windowOriginX,y:(wy1+wy2)/2+windowOriginY,cave:inCave,r:faceR,g:faceG,b:faceB});\n' + diagAnchor);
LAB.init(__out, function(path) { return path === __argv[0] ? diagSource : slurp(path); }, __engine, __argv);
if (!LAB.load(__argv[0])) throw new Error(LAB.loadError);
window.__diagFaces = [];
LAB.startCaveTest(12345);
LAB.freezeDay(0.5);
var diagE = LAB.entrances()[0];
var diagRows = [];
[300,200,100,60,30,0,-20,-60,-90].forEach(function(a) {
  var p = LAB.axisWorld(diagE, a, 0);
  LAB.placeWorld(p.x, p.y, 'bottom'); LAB.tick(8);
  cam.ang = diagE.angle; cam.pitch = 0; LAB.prepCamera();
  window.__diagFaces = [];
  var rec = LAB.record(drawWalls3D);
  var caveFaces = window.__diagFaces.filter(function(f) { return f.cave; });
  diagRows.push({along:a,feetH:LAB.h(),eyeH:getCam3D().cameraZ/25,underground:playerUnderground,
    wallFaces:window.__diagFaces.length,caveFaces:caveFaces.length,cavePalette:caveFaces[0] || null,error:rec.error});
});
__out(JSON.stringify(diagRows));
undefined;
