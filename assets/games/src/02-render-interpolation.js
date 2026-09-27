// Presentation only: views inherit current gameplay data and shadow transforms.
// Original objects are never moved, and no simulation runs inside the draw scope.
var renderInterpolationEnabled = true;
var renderInterpolationStats = {captures:0, entitiesCaptured:0, entitiesPresented:0, recordsCreated:0};
var _renderPoseFields = ['x','y','z','floorZ','feetZ','renderFloorZ','ang','facing','pitch','fov','phase','squash'];
var _renderPoseRecords = new WeakMap();
var _renderPoseSerial = 0, _renderHistoryReady = false, _renderCapturePending = false;
var _renderInterpolationActive = false;
var _renderHistory = {};
var _renderEndPos = [], _renderEndCam = [], _renderEndView = [];
var _renderGroups = ['enemies','projectiles','companions','fortressAllies','impacts',
  'deathEffects','soulOrbs','coinDrops','statPickups','arcaneTomes','ambientParticles'].map(function(name) {
    return {name:name, source:null, view:[]};
  });

function renderPoseRecord(body) {
  var record = _renderPoseRecords.get(body);
  if (!record) {
    record = {previous:[], view:Object.create(body), serial:-1};
    _renderPoseRecords.set(body, record);
    renderInterpolationStats.recordsCreated++;
  }
  return record;
}

function copyRenderPose(body, out) {
  for (var i=0;i<_renderPoseFields.length;i++) out[i] = body[_renderPoseFields[i]];
}

function captureRenderPose(body) {
  var record = renderPoseRecord(body);
  copyRenderPose(body, record.previous);
  record.serial = _renderPoseSerial;
  return record;
}

function renderWorldUnchanged() {
  return _renderHistory.pos === pos && _renderHistory.cam === cam && _renderHistory.viewCam === viewCam &&
    _renderHistory.mesh === floorMesh && _renderHistory.grid === grid &&
    _renderHistory.originX === windowOriginX && _renderHistory.originY === windowOriginY &&
    _renderHistory.mode === MODE3D && _renderHistory.follow === CAM_FOLLOW &&
    _renderHistory.underground === playerUnderground &&
    _renderHistory.width === canvas.width && _renderHistory.height === canvas.height;
}

function resetRenderInterpolation(entity) {
  if (entity) {
    var record = _renderPoseRecords.get(entity);
    if (record) record.serial = -1;
    return;
  }
  _renderHistoryReady = false; _renderCapturePending = false;
  _renderHistory.pos = _renderHistory.cam = _renderHistory.viewCam = null;
  _renderHistory.mesh = _renderHistory.grid = null;
}

function captureRenderInterpolation() {
  if (_renderInterpolationActive) throw Error('Cannot capture simulation during presentation');
  _renderHistoryReady = false; _renderCapturePending = false;
  if (!renderInterpolationEnabled) return;
  _renderPoseSerial++; renderInterpolationStats.captures++;
  _renderHistory.pos=pos; _renderHistory.cam=cam; _renderHistory.viewCam=viewCam;
  _renderHistory.mesh=floorMesh; _renderHistory.grid=grid;
  _renderHistory.originX=windowOriginX; _renderHistory.originY=windowOriginY;
  _renderHistory.mode=MODE3D; _renderHistory.follow=CAM_FOLLOW;
  _renderHistory.underground=playerUnderground;
  _renderHistory.width=canvas.width; _renderHistory.height=canvas.height;
  captureRenderPose(pos); captureRenderPose(viewCam);
  var camera = captureRenderPose(cam);
  if (CAM_FOLLOW) {
    camera.previous[0]=pos.x; camera.previous[1]=pos.y;
    if (Number.isFinite(pos.floorZ)) camera.previous[2]=pos.floorZ;
  }
  for (var g=0;g<_renderGroups.length;g++) {
    var source=window[_renderGroups[g].name];
    if (!source) continue;
    for (var i=0;i<source.length;i++) {
      captureRenderPose(source[i]); renderInterpolationStats.entitiesCaptured++;
    }
  }
  _renderCapturePending = true;
}

function finishRenderInterpolation() {
  if (!_renderCapturePending) return;
  _renderCapturePending = false;
  if (!renderWorldUnchanged()) return;
  copyRenderPose(pos, _renderEndPos); copyRenderPose(cam, _renderEndCam);
  copyRenderPose(viewCam, _renderEndView);
  _renderHistoryReady = true;
}

function renderPoseUnchanged(body, end) {
  for (var i=0;i<_renderPoseFields.length;i++) {
    var value=body[_renderPoseFields[i]];
    if (value !== end[i] && !(Number.isNaN(value) && Number.isNaN(end[i]))) return false;
  }
  return true;
}

function blendRenderAngle(previous, current, alpha) {
  var delta=(current-previous) % (Math.PI*2);
  if (delta>Math.PI) delta-=Math.PI*2;
  if (delta<-Math.PI) delta+=Math.PI*2;
  return previous + delta * alpha;
}

function renderPoseView(body, alpha) {
  var record=renderPoseRecord(body), view=record.view, old=record.previous;
  // New objects never inherit a removed object's pose. Large discontinuities
  // snap; explicit teleport callers invalidate even short teleport histories.
  var blend=record.serial === _renderPoseSerial ? alpha : 1;
  var dx=body.x-old[0], dy=body.y-old[1];
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || dx*dx+dy*dy>64*64) blend=1;
  for (var i=0;i<_renderPoseFields.length;i++) {
    var key=_renderPoseFields[i], current=body[key], previous=old[i];
    if (!Number.isFinite(current)) { delete view[key]; continue; }
    if (!Number.isFinite(previous) || blend===1 || Math.abs(current-previous)>64 && i>=2 && i<=5) view[key]=current;
    else if (key==='ang' || key==='facing' || key==='phase') view[key]=blendRenderAngle(previous,current,blend);
    else view[key]=previous + (current-previous) * blend;
  }
  return view;
}

function renderInterpolatedFrame(alpha, drawFn) {
  var drawFrame = drawFn || renderFrame;
  if (_renderInterpolationActive) return drawFrame();
  if (!renderInterpolationEnabled) return drawFrame();
  var blend = Number.isFinite(alpha) ? Math.max(0,Math.min(1,alpha)) : 1;
  if (!_renderHistoryReady || simulationPaused() || !renderWorldUnchanged() ||
      !renderPoseUnchanged(pos,_renderEndPos) || !renderPoseUnchanged(cam,_renderEndCam) ||
      !renderPoseUnchanged(viewCam,_renderEndView)) blend=1;
  var savedPos=pos, savedCam=cam, savedViewCam=viewCam;
  _renderInterpolationActive = true;
  try {
    pos=renderPoseView(savedPos,blend); cam=renderPoseView(savedCam,blend); viewCam=renderPoseView(savedViewCam,blend);
    if (CAM_FOLLOW) {
      cam.x=pos.x; cam.y=pos.y;
      if (Number.isFinite(pos.floorZ)) cam.z=pos.floorZ;
    }
    for (var g=0;g<_renderGroups.length;g++) {
      var group=_renderGroups[g], source=window[group.name];
      group.source=source;
      if (!source) continue;
      var visible=group.view;
      for (var i=0;i<source.length;i++) {
        visible[i]=renderPoseView(source[i],blend); renderInterpolationStats.entitiesPresented++;
      }
      visible.length=source.length;
      window[group.name]=visible;
    }
    return drawFrame();
  } finally {
    pos=savedPos; cam=savedCam; viewCam=savedViewCam;
    for (var r=0;r<_renderGroups.length;r++) {
      var restore=_renderGroups[r];
      if (restore.source) window[restore.name]=restore.source;
      restore.source=null;
    }
    _renderInterpolationActive = false;
  }
}
