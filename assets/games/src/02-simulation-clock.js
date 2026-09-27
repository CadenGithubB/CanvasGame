// Gameplay deadlines share this clock. Wall time remains for hardware, logs and
// performance measurements. Before a session starts, standalone previews/tests
// can supply Date.now; once started, only simulation ticks advance game time.
var _gameClockOriginMs = null;
var _gameClockElapsedMs = 0;
var simulationTiming = {ticks:0, droppedMs:0, maxStepsPerFrame:0};
// Redrawing spell flicker must not consume the gameplay random stream.
var _presentationRandomState = 1234567;
function presentationRandom() {
  _presentationRandomState = (Math.imul(_presentationRandomState, 1664525) + 1013904223) | 0;
  return (_presentationRandomState >>> 0) / 4294967296;
}

function gameTimeNow() {
  return _gameClockOriginMs === null ? Date.now() : _gameClockOriginMs + _gameClockElapsedMs;
}

function startGameClock() {
  if (_gameClockOriginMs === null) _gameClockOriginMs = Date.now();
}

function advanceGameClock(dt) {
  startGameClock();
  _gameClockElapsedMs += dt * 1000;
  simulationTiming.ticks++;
}

function simulationPaused() {
  return !running || menuOpen || settingsOpen || overviewActive || gameOverState || document.hidden === true;
}

function runSimulationTick(dt) {
  captureRenderInterpolation();
  advanceGameClock(dt);
  _pt('handleInput', function(){ updateInputCamera(dt); handleInput(dt); });
  _pt('gameUpdate', function(){ gameUpdate(dt); });
  finishRenderInterpolation();
}
