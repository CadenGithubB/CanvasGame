// Particle engine (unified effects V1): one fixed-capacity typed pool with
// dense swap-remove, stepped once per fixed tick by updateEffects. Every path
// reads the compiled recipe table installed in its own state (S.C, S.R), so
// tests and the studio can run their own tables. Cosmetic only: no gameplay
// code reads fxState, particles draw stateless hash noise (never Math.random
// or presentationRandom), and producers only queue work that the next tick
// spawns. Runtime entry points catch, count and warn once; the only throw is
// the load-time check that every event and anchor name has code here.
var FX_CLASS_MAX_SCALE = [2.4, 2.4, 1.5, 1.5, 1.25];   // class scale at the top of the Particles slider
// Particle flags.
var FX_REST = 1, FX_SNAP = 2, FX_EYE = 4, FX_SCREEN = 8, FX_DYING = 16, FX_UNDER = 32, FX_FIELD = 64, FX_SELF = 128;
// Event flags.
var FX_EV_SELF = 1, FX_EV_UNDER = 2, FX_EV_LOB = 4, FX_EV_COMPANION = 8;
var FX_EMIT = -1;                                        // ring type of a direct fxEmit burst
var FX_CONTACTS_PER_TICK = 24;                            // projectile contacts per tick that become debris
var FX_EVENT_CODE = {};
FX_EVENT_NAMES.forEach(function (name, i) { FX_EVENT_CODE[name] = i; });
// Movement observers (section 9.3), here because the load-time fxState below
// sizes its observer tables with them: a stride, a teleport, the step's side
// offset, a step's reach (1 H: the walk step-up), a landing's airborne ticks
// and speed; the NPC radius (3D), body and burst caps, the 2D view margin.
var FX_STEP_STRIDE = 22, FX_STEP_JUMP = 64, FX_STEP_SIDE = 3, FX_STEP_REACH = 25, FX_LAND_TICKS = 6, FX_LAND_VZ = 200;
var FX_NPC_RADIUS = 240, FX_NPC_BODIES = 24, FX_NPC_BURSTS = 12, FX_VIEW2D_MARGIN = 16;
var FX_CODE_FOOTSTEP = FX_EVENT_CODE.footstep, FX_CODE_DASH = FX_EVENT_CODE.dashStart, FX_CODE_LAND = FX_EVENT_CODE.land;
function _fxCode(list, name) {
  var i = FX_ENUMS[list].indexOf(name);
  if (i < 0) throw new Error('Particle engine: ' + list + ' has no ' + name);
  return i;
}
var FX_MODE_NONE = _fxCode('mode', 'none'), FX_MODE_CLAMP = _fxCode('mode', 'clamp'), FX_MODE_KILL = _fxCode('mode', 'kill'),
  FX_MODE_BOUNCE = _fxCode('mode', 'bounce'), FX_STRATUM_REFERENCE = _fxCode('stratum', 'reference');
var FX_SHAPE_SPHERE = _fxCode('shape', 'sphere'), FX_SHAPE_DISC = _fxCode('shape', 'disc'), FX_SHAPE_RING = _fxCode('shape', 'ring'),
  FX_SHAPE_COLUMN = _fxCode('shape', 'column'), FX_SHAPE_SEGMENT = _fxCode('shape', 'segment'),
  FX_SHAPE_CONE = _fxCode('shape', 'cone'), FX_SHAPE_CORNERS = _fxCode('shape', 'screenCorners');
var FX_SUPPORT_OPENSKY = _fxCode('support', 'openSky'), FX_SUPPORT_CEILING = _fxCode('support', 'ceiling');
var FX_DIR_RANDOM = _fxCode('direction', 'random'), FX_DIR_UP = _fxCode('direction', 'up'), FX_DIR_RADIAL = _fxCode('direction', 'radial'),
  FX_DIR_NORMAL = _fxCode('direction', 'normal'), FX_DIR_REFLECT = _fxCode('direction', 'reflect'),
  FX_DIR_ALONG = _fxCode('direction', 'along'), FX_DIR_WIND = _fxCode('direction', 'wind'), FX_DIR_BACKWARD = _fxCode('direction', 'backward');
var FX_PLACE_SOURCE = _fxCode('place', 'source'), FX_PLACE_FRONT = _fxCode('place', 'sourceOrFront'),
  FX_PLACE_RING = _fxCode('place', 'frontRing'), FX_PLACE_SIDES = _fxCode('place', 'frontSides'),
  FX_PLACE_EYE = _fxCode('place', 'eye'), FX_PLACE_SCREEN = _fxCode('place', 'screen');
var FX_SELF_SKIP = _fxCode('selfView', 'skip'), FX_SELF_IFVISIBLE = _fxCode('selfView', 'ifVisible');
var FX_AT_TORSO = _fxCode('at', 'torso'), FX_AT_SHRINE = _fxCode('at', 'shrineCrystal'), FX_AT_PLAYER = _fxCode('at', 'playerFeet');
var FX_COLOR_ORE = _fxCode('colorSource', 'ore');
var FX_ANCHOR_ENTITY = FX_ANCHOR_NAMES.indexOf('entity'), FX_ANCHOR_POINT = FX_ANCHOR_NAMES.indexOf('point'),
  FX_ANCHOR_TORCH = FX_ANCHOR_NAMES.indexOf('torch');
var FX_ANCHOR_DASH = FX_ANCHOR_NAMES.indexOf('dashTrail'), FX_ANCHOR_FLAME = FX_ANCHOR_NAMES.indexOf('flameStream');
var FX_VIS_DAY = _fxCode('visible', 'day'), FX_VIS_NIGHT = _fxCode('visible', 'night'), FX_MODE2D_NONE = _fxCode('mode2D', 'none'),
  FX_VIEW2D_NONE = _fxCode('view2D', 'none');
var FX_WEATHER_RAIN = _fxCode('weatherKind', 'rain'), FX_TORCH_SLOTS = 8, FX_PRIM_SEGMENT = _fxCode('primitive', 'segment');
var FX_CLASS_LOCO = _fxCode('class', 'locomotion');
var FX_MODE_REST = _fxCode('mode', 'rest'), FX_STRATUM_OPENSKY = _fxCode('stratum', 'openSky'), FX_MODE2D_SIM = _fxCode('mode2D', 'simulate');
// Weather modes (section 9.1): the Weather switch or Unified effects off,
// forced clear, the auto schedule, a forced kind (kind code + 1: rain 1,
// snow 2, ash 3) and the dev 'biome' force (the biome's kind, active); a
// state with no dev force holds FX_WF_NONE. The salt keys the front draws.
var FX_WM_OFF = -2, FX_WM_CLEAR = -1, FX_WM_AUTO = 0, FX_WM_BIOME = 4, FX_WF_NONE = -9, FX_WEATHER_SALT = 0x3c6ef372;
// A weather member's owner is field code | set << 8: sets 0-2 are the kinds,
// set 3 holds rain's snow-line swaps (snow over columns above the line),
// whose chance draws use their own salt. In 2D the weather box is the view
// plus the 2D margin, and its population grows with the view's area over
// the authored canvas (360 x 240) up to FX_VIEW2D_AREA_CAP times.
var FX_WEATHER_SWAP = 3, FX_WEATHER_SWAP_SALT = 0x2545f491, FX_VIEW2D_AREA_CAP = 3;

function fxCreateEventRing(n) {
  function F() { return new Float64Array(n); }
  function I() { return new Int32Array(n); }
  return {n:n, head:0, count:0, type:I(), rec:I(), x:F(), y:F(), z:F(), h:F(), dx:F(), dy:F(), dz:F(),
    nx:F(), ny:F(), nz:F(), vx:F(), vy:F(), vz:F(), scale:F(), num:F(), kind:I(), spell:I(), rgb:I(), rgb2:I(), ore:I(), surf:I(),
    flags:new Uint8Array(n)};
}
// The per-event columns, for moving one queued event onto another's slot.
var _fxRingProbe = fxCreateEventRing(1), FX_RING_COLUMNS = Object.keys(_fxRingProbe).filter(function (c) { return ArrayBuffer.isView(_fxRingProbe[c]); });
function fxRingCopy(ev, from, to) {
  for (var c = 0; c < FX_RING_COLUMNS.length; c++) { var col = ev[FX_RING_COLUMNS[c]]; col[to] = col[from]; }
}
function fxCreateAnchorTable(n) {
  function F() { return new Float64Array(n); }
  return {n:n, live:0, used:new Uint8Array(n), seg:new Uint8Array(n), kind:new Uint8Array(n), gen:new Uint32Array(n),
    rec:new Int32Array(n), ref:new Array(n), x:F(), y:F(), z:F(), x2:F(), y2:F(), z2:F(), until:F(), rate:F(), acc:F()};
}
function fxCreateStats() {
  return {spawned:0, killed:0, stolen:0, children:0, eventsIn:0, eventsDropped:0, eventsGated:0, groundMiss:0, fieldWraps:0,
    fieldSpawned:0, fieldDropped:0, torchSpawned:0,
    unknownEvents:0, unknownRecipes:0, badEvents:0, palOverflow:0, anchorsRefused:0,
    refusedToggle:0, refusedFamily:0, refusedCap:0, refusedBudget:0, refusedLod:0, refusedSpawnCap:0,
    refusedOffscreenSelf:0, refusedView:0, refusedNoSupport:0, refusedChildQueue:0, contactsDropped:0,
    obsSteps:0, obsNpcSteps:0, obsNpcCapped:0, obsDashes:0, obsLands:0, weatherSpawned:0, weatherSnowLine:0, weatherSplashes2D:0};
}
// Weather state (section 9.1), sim-owned: the per-kind levels (rain, snow,
// ash), their goals, the goal each level's crossfade aims at and its rate,
// the current front (index, start and end in sim seconds, its roll,
// intensity and wind; the previous front's wind for the ease), the sim time
// the levels were last advanced to, the mode they were advanced under, and a
// dev force (kept across world resets). kind and intensity summarise the
// strongest kind; windX/Y blow for every front.
function fxCreateWeather() {
  return {kind:0, intensity:0, windX:0, windY:0, visibility:1, level:new Float64Array(3), goal:new Float64Array(3),
    aim:new Float64Array(3), rate:new Float64Array(3),
    front:-1, start:0, end:0, roll:1, frontI:0, wx0:0, wy0:0, wx1:0, wy1:0, t:0, mode:-9, modeI:-1, fresh:true, snapped:false,
    force:FX_WF_NONE, forceI:1};
}
// Per field: the box of this tick (centre, half size; a weather box's half
// extents in x and y and the width of its edge fade), its set and stratum,
// its target and live members, and a pending prewarm (after 2D, for
// example); members of each set that died since the field counted them
// (fxKill). A weather field also keeps each set's target, live members and
// refill allowance (sets 0-2 the kinds, 3 rain's snow-line swaps), rain's
// virtual slots above the snow line, whether any kind is open, and the view
// it last ran in (2 or 3).
function fxCreateField() {
  return {cx:0, cy:0, half:0, hx:0, hy:0, fade:0, set:-1, under:false, target:0, live:0, prewarm:false,
    targets:new Int32Array(4), lives:new Int32Array(4), acc:new Float64Array(3), gone:new Int32Array(4), swapV:0, open:false, view:0};
}
// The nearest torch lights of the viewer's floor, reselected every 0.25 s of
// sim time; rate accumulators follow their light across reselections.
function fxCreateTorchTable(recipes) {
  var n = FX_TORCH_SLOTS, m = n * Math.max(1, recipes);
  return {n:0, lights:null, ref:new Array(n), d:new Float64Array(n), acc:new Float64Array(m),
    oldRef:new Array(n), oldAcc:new Float64Array(m), oldN:0};
}

function createFxState(capacity, seed, opts) {
  var n = capacity | 0, C = (opts && opts.compiled) || FX_COMPILED;
  function F() { return new Float64Array(n); }
  var reserve = opts && Number.isFinite(opts.reserve) ? opts.reserve | 0 : EFFECT_CONFIG.reserve;
  return {
    cap:n, reserve:reserve, count:0, tick:0, simTime:0, serial:0, seed:seed | 0, lastDt:1 / 60, prewarm:true,
    pinned:!!(opts && opts.pinned), mesh:null, R:C.R, C:C,
    legacyRng:((seed | 0) ^ 0x5bd1e995) >>> 0,           // private LCG for Legacy A/B code; reseeded only by fxReset
    dynPal:new Int32Array(EFFECT_CONFIG.dynamicPalette), dynCount:0,   // event colours, per state
    childQ:new Float64Array(EFFECT_CONFIG.childQueue * 5), childCount:0,
    torchRefreshAt:0, torch:fxCreateTorchTable(C.anchorRecipes[FX_ANCHOR_TORCH].length),
    fields:C.FIELDS.map(fxCreateField), fieldSerial:0, feetH:0, viewUnder:false,
    // Live particles occupy [0, count); the tail is the free list.
    x:F(), y:F(), z:F(), vx:F(), vy:F(), vz:F(),          // window-local world units; z = spatial Z (mesh H x 25)
    age:F(), life:F(), size:F(), alpha:F(), rot:F(), spin:F(), phase:F(),
    g0:F(), g1:F(), g2:F(), g3:F(),                       // cached support-triangle corners x 25
    gcell:new Int32Array(n), owner:new Int32Array(n), seedA:new Uint32Array(n),
    rec:new Uint16Array(n), pal:new Uint16Array(n), flags:new Uint8Array(n), bounces:new Uint8Array(n), cls:new Uint8Array(n),
    classLive:new Int32Array(5), classDying:new Int32Array(5), recipeLive:new Int32Array(C.count), stolenByClass:new Int32Array(5),
    ev:fxCreateEventRing(EFFECT_CONFIG.eventRing), anchors:fxCreateAnchorTable(EFFECT_CONFIG.anchors),
    contactN:0, contactSlot:new Int32Array(FX_CONTACTS_PER_TICK), contactD:new Float64Array(FX_CONTACTS_PER_TICK),   // this tick's contacts
    obs:fxCreateObservers(), obsEv:fxCreateEventRing(1),  // movement observers and their one-slot event
    weather:fxCreateWeather(), stats:fxCreateStats(),
    // Tick-local state: live budget, spawn gates, drag factors, scratch.
    B:0, P:0, caps:new Int32Array(5), scale:new Float64Array(5), qGen:-1, spawnLeft:0, noSteal:false, stealCursor:0, eyeCount:0,
    gate:new Uint8Array(C.count), gateWhy:new Uint8Array(C.count), placeOver:new Int8Array(C.count).fill(-1), toggleGen:-1, ambientMode:null,
    weatherToggle:FX_WM_OFF,                              // the Weather switch as a mode, read with the other toggles
    evGen:-1, evOpen:new Uint8Array(C.bindings.length),   // per event code: any bound recipe can spawn (fxEventOpen)
    KDdt:-1, KD:new Float64Array(C.count), KF:new Float64Array(C.count), KGV:new Float64Array(C.count), KGX:new Float64Array(C.count),
    sortIdx:new Int32Array(n), sortKey:new Float64Array(n)
  };
}
// flags: 1 REST, 2 SNAP (no back-projection this frame), 4 EYE, 8 SCREEN, 16 DYING, 32 UNDER, 64 FIELD, 128 SELF
var fxState = createFxState(EFFECT_CONFIG.capacity, WORLD_SEED);

// ── The one tick entry point: live game after every producer of the tick
// (17-input-lighting-update.js), studio after tickEffects (20-casting-preview.js).
// A step that is not in (0, 1] s (a console call without one, NaN) is a
// counted failure that changes nothing: sim time stays finite.
function updateEffects(dt) {
  var t0 = physicsStageStart(), S = fxState;
  try {
    if (!(dt > 0 && dt <= 1)) throw new Error('updateEffects needs a step of (0, 1] s, got ' + dt);
    effectSyncToggles(S);
    if (effectFamilyMode('ambient') === 'legacy' && typeof updateAmbientParticles === 'function')
      effectWithLegacyRandom(updateAmbientParticles, dt);
    S.tick++; S.simTime += dt; S.lastDt = dt;
    if (S.mesh !== floorMesh) { S.gcell.fill(-1, 0, S.count); S.mesh = floorMesh; }
    S.feetH = playerFeetSpatialZ() / 25; S.viewUnder = !!playerUnderground;   // the viewer's stratum, for anchors and fields
    fxClearSnap(S);
    S.spawnLeft = Math.ceil(EFFECT_CONFIG.spawnPerTick * dt * 60 - 1e-9);
    fxUpdateQuality(S);
    fxUpdateWeather(S);
    fxViewTick(S);
    S.contactN = 0;                       // contacts since the last tick are queued: a new tick's cap starts
    fxDrainEvents(S);
    fxRunObservers(S);
    fxWatchFlame(S);
    fxRunAnchors(S, dt);
    fxRunTorches(S, dt);
    fxRunFields(S, dt);
    fxIntegrate(S, dt);
    fxAdmitChildren(S);
    fxRefillFields(S, dt);                // weather refills after its landings, so the tick ends at its population
    S.prewarm = false;                    // the fields consumed the prewarm request
  } catch (e) { effectFailure('updateEffects', e); }
  physicsStageEnd('effectsSim', t0);
}

// Toggle and family-mode changes: rebuild the per-recipe spawn gate and apply
// the diff inside the tick (particles of a switched-off recipe fade out).
function effectSyncToggles(S) {
  var gen = effectToggleGeneration(), mode = effectFamilyMode('ambient');
  if (S.toggleGen !== gen) {
    var R = S.R, C = S.C, off = false;
    S.toggleGen = gen;
    for (var r = 0; r < C.count; r++) {
      var why = fxRecipeGateWhy(C, R, r), id = C.LIST[r].id;
      if (S.gate[r] && why) off = true;
      S.gate[r] = why ? 0 : 1; S.gateWhy[r] = why;
      S.placeOver[r] = _fxPlaceOverride.hasOwnProperty(id) ? _fxPlaceOverride[id] : -1;
    }
    if (off) for (var i = 0; i < S.count; i++) if (!S.gate[S.rec[i]]) fxMarkDying(S, i);
    var wv = effectToggleValue('fxWeather');
    S.weatherToggle = !effectPresetOn('fxWeather') ? FX_WM_OFF : wv === 'auto' ? FX_WM_AUTO : FX_ENUMS.weatherKind.indexOf(wv) + 1;
  }
  // The legacy ambient array follows its family: re-initialised when it
  // returns to Legacy, emptied when New takes over.
  if (S.ambientMode !== null && mode !== S.ambientMode && typeof initAmbientParticles === 'function') {
    if (mode === 'legacy') effectWithLegacyRandom(initAmbientParticles);
    else { ambientParticles = []; S.prewarm = true; }
  }
  S.ambientMode = mode;
}
// 0 spawns, 1 its preset (or Unified effects) is off, 2 its family is Legacy.
function fxRecipeGateWhy(C, R, r) {
  var t = R.toggle[r], f = R.family[r];
  return t && !effectPresetOn(C.TOGGLES[t]) ? 1 : f && effectFamilyMode(C.FAMILIES[f]) !== 'new' ? 2 : 0;
}
// Whether any recipe bound to event code e can spawn under the current
// toggles and family modes, rebuilt when their generation changes: while
// every binding is off the producer's call is skipped before the reader runs
// (counted), so a switched-off preset adds no work to the gameplay tick.
function fxEventOpen(S, e) {
  var gen = effectToggleGeneration();
  if (S.evGen !== gen) {
    var C = S.C, list;
    S.evGen = gen;
    for (var t = 0; t < C.bindings.length; t++) {
      list = C.bindings[t]; S.evOpen[t] = 0;
      for (var b = 0; b < list.length; b++) if (!fxRecipeGateWhy(C, S.R, list[b].r)) { S.evOpen[t] = 1; break; }
    }
  }
  return S.evOpen[e] === 1;
}

// settings.particles is live: class caps follow it on the next tick and the
// excess fades out (oldest first).
function fxUpdateQuality(S) {
  var q = effectQuality(S.cap, S.reserve);
  if (q.gen !== S.qGen) {
    S.qGen = q.gen; S.B = q.B; S.P = q.P;
    for (var c = 0; c < 5; c++) { S.caps[c] = q.caps[c]; S.scale[c] = q.scale[c]; }
  }
  for (var k = 0; k < 5; k++) {
    var excess = S.classLive[k] - S.classDying[k] - S.caps[k];
    if (excess > 0) fxDyingOldest(S, k, excess, -1);
  }
}
// The k oldest (normalized age) live particles of class c, or of field
// `field` when it is >= 0, fade out. One pass keeps the k oldest in a
// bounded min-heap (typed scratch, no allocation), O(n log k): a cave mouth
// fading the rain a few members a tick no longer sorts the whole pool.
// Ties go to the lower slot, as a full sort by (age desc, slot asc) would.
function fxDyingOldest(S, c, k, field) {
  var h = S.sortIdx, key = S.sortKey, m = 0;
  if (!(k > 0)) return;
  for (var i = 0; i < S.count; i++) {
    if ((S.flags[i] & FX_DYING) || (field >= 0 ? !(S.flags[i] & FX_FIELD) || S.owner[i] !== field : S.cls[i] !== c)) continue;
    key[i] = S.age[i] / S.life[i];
    if (m < k) { h[m] = i; fxHeapUp(h, key, m++); }
    else if (fxYounger(key, h[0], i)) { h[0] = i; fxHeapDown(h, key, m); }
  }
  for (var j = 0; j < m; j++) fxMarkDying(S, h[j]);
}
// a ranks after b among the oldest: younger, or as old in a higher slot.
function fxYounger(key, a, b) { return key[a] < key[b] || key[a] === key[b] && a > b; }
function fxHeapUp(h, key, j) {
  var v = h[j];
  while (j > 0) {
    var p = (j - 1) >> 1;
    if (!fxYounger(key, v, h[p])) break;
    h[j] = h[p]; j = p;
  }
  h[j] = v;
}
function fxHeapDown(h, key, m) {
  var j = 0, v = h[0];
  for (;;) {
    var l = 2 * j + 1, s = l;
    if (l >= m) break;
    if (l + 1 < m && fxYounger(key, h[l + 1], h[l])) s = l + 1;
    if (!fxYounger(key, h[s], v)) break;
    h[j] = h[s]; j = s;
  }
  h[j] = v;
}
function fxMarkDying(S, i) {
  if (S.flags[i] & FX_DYING) return;
  S.flags[i] |= FX_DYING; S.classDying[S.cls[i]]++;
  var end = S.age[i] + EFFECT_CONFIG.cullFadeSeconds;
  if (S.life[i] > end) S.life[i] = end;
}
// Eye and screen particles hold camera-local coordinates: outside the
// first-person view they fade instead of being drawn as world positions.
function fxViewTick(S) {
  if (!S.eyeCount || (MODE3D && CAM_FOLLOW)) return;
  for (var i = 0; i < S.count; i++) if (S.flags[i] & (FX_EYE | FX_SCREEN)) fxMarkDying(S, i);
  S.eyeCount = 0;
}

// ── Producers: queue only; the next tick spawns ─────────────────────────
function fxParseColor(c) {
  if (typeof c === 'number' && c >= 0 && c <= 0xffffff) return c | 0;
  if (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) return parseInt(c.slice(1), 16);
  return -1;
}
function fxRingSlot(S) {
  var ev = S.ev;
  if (ev.count >= ev.n) { S.stats.eventsDropped++; return -1; }  // a full ring drops the newest
  var k = (ev.head + ev.count) % ev.n;
  fxRingClear(ev, k);
  return k;
}
function fxRingClear(ev, k) {
  ev.type[k] = FX_EMIT; ev.rec[k] = -1; ev.x[k] = ev.y[k] = ev.z[k] = ev.h[k] = 0;
  ev.dx[k] = ev.dy[k] = ev.dz[k] = ev.nx[k] = ev.ny[k] = 0; ev.nz[k] = 1;
  ev.vx[k] = ev.vy[k] = ev.vz[k] = 0; ev.scale[k] = 1; ev.num[k] = -1;
  ev.kind[k] = 0; ev.spell[k] = 0; ev.rgb[k] = ev.rgb2[k] = ev.ore[k] = -1; ev.surf[k] = -1; ev.flags[k] = 0;
}
function fxRingCommit(S, k) {
  var ev = S.ev;
  if (!Number.isFinite(ev.x[k]) || !Number.isFinite(ev.y[k]) || !Number.isFinite(ev.z[k])) { S.stats.badEvents++; return false; }
  ev.count++; S.stats.eventsIn++;
  return true;
}
function fxEvent(type, a, b, c, d, e) {
  try {
    var S = fxState;
    if (!FX_EVENTS.hasOwnProperty(type)) { S.stats.unknownEvents++; return; }
    var family = FX_EVENTS[type].family;
    if (family && effectFamilyMode(family) === 'legacy') {
      var adapter = FX_LEGACY_ADAPTERS[type];               // verbatim legacy body (S4), private stream
      if (adapter) effectWithLegacyRandom(adapter, a, b, c);
      return;
    }
    if (!fxEventOpen(S, FX_EVENT_CODE[type])) { S.stats.eventsGated++; return; }
    var k = fxRingSlot(S);
    if (k < 0) return;
    S.ev.type[k] = FX_EVENT_CODE[type];
    if (FX_EVENT_READERS[type](S, k, a, b, c, d, e) !== false) fxRingCommit(S, k);   // false: not queued
  } catch (err) { effectFailure('fxEvent', err); }
}
// Direct burst; opts {nx, ny, nz, dx, dy, dz, vx, vy, vz, color, scale, count, self, under}.
function fxEmit(recipeId, x, y, z, opts) {
  try {
    var S = fxState, r = S.C.ID[recipeId];
    if (r === undefined) { S.stats.unknownRecipes++; return false; }
    var k = fxRingSlot(S), ev = S.ev;
    if (k < 0) return false;
    ev.rec[k] = r; ev.x[k] = x; ev.y[k] = y; ev.z[k] = z;
    if (opts) {
      if (Number.isFinite(opts.nx)) { ev.nx[k] = opts.nx; ev.ny[k] = opts.ny || 0; ev.nz[k] = opts.nz || 0; }
      if (Number.isFinite(opts.dx)) { ev.dx[k] = opts.dx; ev.dy[k] = opts.dy || 0; ev.dz[k] = opts.dz || 0; }
      if (Number.isFinite(opts.vx)) { ev.vx[k] = opts.vx; ev.vy[k] = opts.vy || 0; ev.vz[k] = opts.vz || 0; }
      if (opts.color !== undefined) ev.rgb[k] = fxParseColor(opts.color);
      if (Number.isFinite(opts.scale)) ev.scale[k] = opts.scale;
      if (Number.isFinite(opts.count) && opts.count >= 0) ev.num[k] = Math.min(4096, opts.count | 0);
      ev.flags[k] = (opts.self ? FX_EV_SELF : 0) | (opts.under ? FX_EV_UNDER : 0);
    }
    return fxRingCommit(S, k);
  } catch (e) { effectFailure('fxEmit', e); return false; }
}
// Continuous emitter; opts {until (game ms), rate (per s), lift, follow}.
// The rate is opts.rate or the recipe's anchor trigger rate; an api recipe
// needs opts.rate, e.g. fxAttach('status.burnEmber', enemy, {until, rate}).
// A body with a numeric health, or any object with opts.follow, is followed
// every tick at its feet plus lift (gameplay rebases it; a body ends with its
// health). Anything else is a static point {x, y, z} or segment {.., x2, y2, z2}.
// Returns a handle, or -1 (counted) for a bad anchor, no rate or a full table.
function fxAttach(recipeId, anchor, opts) {
  try {
    var S = fxState, A = S.anchors, r = S.C.ID[recipeId];
    if (r === undefined) { S.stats.unknownRecipes++; return -1; }
    var rate = opts && Number.isFinite(opts.rate) ? opts.rate : S.R.anchorRate[r];
    if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || !(rate > 0)) { S.stats.badEvents++; return -1; }
    var k = A.used.indexOf(0);
    if (k < 0) { S.stats.anchorsRefused++; return -1; }
    var entity = typeof anchor.health === 'number' || !!(opts && opts.follow);
    A.used[k] = 1; A.live++; A.gen[k] = (A.gen[k] + 1) & 0xffffff; A.rec[k] = r; A.acc[k] = 0;
    A.kind[k] = entity ? FX_ANCHOR_ENTITY : FX_ANCHOR_POINT; A.ref[k] = entity ? anchor : null;
    A.x[k] = anchor.x; A.y[k] = anchor.y;
    A.z[k] = entity ? (opts && Number.isFinite(opts.lift) ? opts.lift : 0) : Number.isFinite(anchor.z) ? anchor.z : 0;
    A.seg[k] = !entity && Number.isFinite(anchor.x2) && Number.isFinite(anchor.y2) ? 1 : 0;
    A.x2[k] = anchor.x2 || 0; A.y2[k] = anchor.y2 || 0; A.z2[k] = Number.isFinite(anchor.z2) ? anchor.z2 : A.z[k];
    A.rate[k] = rate;
    A.until[k] = opts && Number.isFinite(opts.until) ? opts.until : 0;
    return A.gen[k] * 256 + k;
  } catch (e) { effectFailure('fxAttach', e); return -1; }
}
function fxDetach(handle) {
  try {
    var A = fxState.anchors, k = handle & 255;
    if (!(handle >= 0) || k >= A.n || !A.used[k] || A.gen[k] !== Math.floor(handle / 256)) return false;
    fxFreeAnchor(A, k);
    return true;
  } catch (e) { effectFailure('fxDetach', e); return false; }
}
function fxFreeAnchor(A, k) { A.used[k] = 0; A.ref[k] = null; A.live--; }

// Readers normalise a producer's arguments into one ring slot; they never
// keep or write the producer's objects. z is the natural anchor (feet or
// item floor), h the body height (torso = z + 0.45 h). A reader returning
// false leaves its slot unqueued.
function _fxReadBody(S, k, body, h) {
  var ev = S.ev;
  ev.x[k] = body.x; ev.y[k] = body.y; ev.z[k] = entityFeetSpatialZ(body); ev.h[k] = h;
  if (body.underground) ev.flags[k] |= FX_EV_UNDER;
}
var FX_EVENT_READERS = {
  enemyDeath: function (S, k, e) { _fxReadBody(S, k, e, 40 * ((e.enemyType && e.enemyType.size) || 1)); },
  spawnerDeath: function (S, k, sp) { _fxReadBody(S, k, sp, 60); },
  pickup: function (S, k, item, kind, color) {
    var ev = S.ev, at = FX_EVENTS.pickup.kinds.indexOf(kind);
    ev.x[k] = item.x; ev.y[k] = item.y; ev.z[k] = getEntityRenderFloorZ(item);
    ev.kind[k] = at < 0 ? 30 : at; ev.rgb[k] = fxParseColor(color);
    if (item.underground) ev.flags[k] |= FX_EV_UNDER;
  },
  shrine: function (S, k, shr) {
    _fxReadBody(S, k, shr, 0);
    var role = {damage:'shrineDamage', speed:'shrineSpeed', regen:'shrineRegen'}[shr.buffType] || 'shrineArmor';
    S.ev.rgb[k] = FX_MATERIALS.fxFeedback.packed[role];
  },
  phoenix: function (S, k) {
    var ev = S.ev;
    ev.x[k] = pos.x; ev.y[k] = pos.y; ev.z[k] = playerFeetSpatialZ(); ev.h[k] = 60;
    ev.flags[k] = FX_EV_SELF | (playerUnderground ? FX_EV_UNDER : 0);
  },
  thunderCore: function (S, k, e) { _fxReadBody(S, k, e, 40 * ((e.enemyType && e.enemyType.size) || 1)); },
  allyDeath: function (S, k, ally) { _fxReadBody(S, k, ally, 50); },
  projectileContact: _fxReadContact,
  // An NPC melee strike that committed (10-npc-controller.js): between the
  // bodies, 0.65 of the way to the target, at the target's feet (torso =
  // feet + 30); direction attacker to target, normal back toward the
  // attacker; warm white, or garrison gold. SELF when the player is struck.
  meleeCommit: function (S, k, actor, target) {
    var ev = S.ev, self = target === pos, dx = target.x - actor.x, dy = target.y - actor.y, l = Math.hypot(dx, dy);
    ev.x[k] = actor.x + dx * 0.65; ev.y[k] = actor.y + dy * 0.65; ev.z[k] = self ? playerFeetSpatialZ() : entityFeetSpatialZ(target); ev.h[k] = 66;
    if (l > 1e-9) { ev.dx[k] = dx / l; ev.dy[k] = dy / l; ev.nx[k] = -dx / l; ev.ny[k] = -dy / l; ev.nz[k] = 0; }
    ev.rgb[k] = actor.npc && actor.npc.role === 'garrison' ? FX_MATERIALS.fxFeedback.packed.garrison : FX_MATERIALS.fxDebris.packed.spark;
    ev.flags[k] = (self ? FX_EV_SELF : 0) | ((self ? playerUnderground : target.underground) ? FX_EV_UNDER : 0);
  },
  // Locomotion (section 9.3): the movement observers emit these themselves
  // (fxObsEmit); a producer may also pass a body (the player: pos) and a scale.
  footstep: function (S, k, body, scale) { _fxReadStep(S, k, body, scale); },
  dashStart: function (S, k, body) { _fxReadStep(S, k, body, 1); },
  land: function (S, k, body, scale) { _fxReadStep(S, k, body, scale); }
};
// A step at the body's feet on its own stratum, moving the way it moves.
function _fxReadStep(S, k, body, scale) {
  var ev = S.ev, self = body === pos, feet = self ? playerFeetSpatialZ() : entityFeetSpatialZ(body);
  var under = self ? !!playerUnderground : fxUnderAt(body.x, body.y, feet), vx = self ? vel.x : body.vx || 0, vy = self ? vel.y : body.vy || 0;
  var v = Math.hypot(vx, vy);
  ev.x[k] = body.x; ev.y[k] = body.y; ev.z[k] = fxStepZ(body.x, body.y, feet);
  if (v > 1e-9) { ev.dx[k] = vx / v; ev.dy[k] = vy / v; }
  if (Number.isFinite(scale)) ev.scale[k] = scale;
  ev.flags[k] = (self ? FX_EV_SELF : 0) | (under ? FX_EV_UNDER : 0); ev.surf[k] = fxSurfaceAt(S, body.x, body.y, under);
}
// Projectile contacts (section 9.2), called once per blocked contact before
// the gameplay branches consume the projectile, mine the vein or hurt the
// body. Kind: 'lob' for a lob, 'ore' for a wall cell holding an ore vein
// (the vein is read before the ore branch damages or splices it; slime bolts
// never mine), else the sweep's kind. The sweep's point is the sphere's
// centre, r off the surface; the spawn point is the struck surface point
// plus the normal x 0.75, on the shooter's side. Normal: floor and cap the
// struck terrain triangle's (up), ceiling its downward one; a lob's cloud
// point on the floor below, +z; bodies against the incoming direction, with
// the sphere's leading point as the struck point; a wall's from the struck
// point of its cell box (the closest point to the sphere's centre: a face,
// its top or an edge). Colours: the spell's recipe light and core roles
// (else its colour); the vein type. where.spell: the spell id's bit in the
// installed table. Only reads its arguments.
var FX_CONTACT_KINDS = FX_EVENTS.projectileContact.kinds;
// The outward normal of a struck terrain triangle (sign +1 up for floors and
// caps, -1 down for ceilings): the contact's mesh cell and layer (its
// surfaceId ends in the layer), split along 0->3 as the sweep's triangles;
// +-z where no triangle exists (the authored flat floor, a mesh edge).
var _fxN = new Float64Array(3);
function fxSurfaceNormalInto(contact, x, y, sign, out) {
  var m = floorMesh, id = contact.surfaceId, gx = contact.gx, gy = contact.gy, c = _fxCorners;
  out[0] = 0; out[1] = 0; out[2] = sign;
  if (!m || !m.layerCount || typeof id !== 'string' || !Number.isInteger(gx) || !Number.isInteger(gy) ||
      gx < 0 || gy < 0 || gx >= m.w || gy >= m.h || !spatialLayerCornersInto(m, gy * m.w + gx, +id.slice(id.lastIndexOf(':') + 1), c)) return out;
  var gs = m.gridSize, tx = x / gs - gx, ty = y / gs - gy, k = SPATIAL_Z_SCALE / gs, zx, zy;
  if (tx >= ty) { zx = (c[1] - c[0]) * k; zy = (c[3] - c[1]) * k; } else { zx = (c[3] - c[2]) * k; zy = (c[2] - c[0]) * k; }
  var l = Math.sqrt(zx * zx + zy * zy + 1) * sign;
  out[0] = -zx / l; out[1] = -zy / l; out[2] = 1 / l;
  return out;
}
function _fxReadContact(S, k, p, contact, x, y, z) {
  var ev = S.ev, spell = p.spell || (typeof spells !== 'undefined' && spells.missile) || _fxNoSpell;
  var hs = p.hz || p.speed || 0, ang = Number.isFinite(p.ang) ? p.ang : 0;
  var dx = Math.cos(ang) * hs, dy = Math.sin(ang) * hs, dz = p.vz || 0, dl = Math.hypot(dx, dy, dz);
  if (dl > 1e-9) { dx /= dl; dy /= dl; dz /= dl; } else dx = dy = dz = 0;
  var kind = p.isLob ? 'lob' : contact.kind, r = Number.isFinite(p.r) ? Math.max(0, p.r) : 8, ore = -1;
  var nx = 0, ny = 0, nz = 1, sx = x, sy = y, sz = z;
  var gx = Number.isFinite(contact.gx) ? contact.gx : Math.floor((x + Math.cos(ang) * 1e-6) / cell);
  var gy = Number.isFinite(contact.gy) ? contact.gy : Math.floor((y + Math.sin(ang) * 1e-6) / cell);
  if (kind === 'wall' && !spell.isCompanion && typeof oreVeins !== 'undefined' && oreVeins && oreVeins.length) {
    for (var o = 0; o < oreVeins.length; o++) {
      var vein = oreVeins[o];
      if (vein && vein.gx === gx && vein.gy === gy) { kind = 'ore'; ore = vein.veinType === 'gold' ? 0 : 1; break; }
    }
  }
  if (kind === 'wall' || kind === 'ore') {
    var span = spatialWallSpan(gx, gy), x0 = gx * cell, y0 = gy * cell, x1 = x0 + cell, y1 = y0 + cell;
    var lo = span ? span.baseZ : z, hi = span ? span.topZ : z;
    var qx = x < x0 ? x0 : x > x1 ? x1 : x, qy = y < y0 ? y0 : y > y1 ? y1 : y, qz = z < lo ? lo : z > hi ? hi : z;
    var ex = x - qx, ey = y - qy, ez = z - qz, ax = Math.abs(ex), ay = Math.abs(ey), az = Math.abs(ez);
    nz = 0;
    if (ax + ay + az > 0) {                                    // outside the box: its closest point's face
      if (ax >= ay && ax >= az) nx = ex > 0 ? 1 : -1; else if (ay >= az) ny = ey > 0 ? 1 : -1; else nz = ez > 0 ? 1 : -1;
    } else if (span && z >= hi - 1) { nz = 1; qz = hi; }      // the centre inside the cell: the top,
    else {                                                     // else the nearest face
      var u = x / cell - gx, v = y / cell - gy, m = Math.min(u, 1 - u, v, 1 - v);
      if (m === u) { nx = -1; qx = x0; } else if (m === 1 - u) { nx = 1; qx = x1; } else if (m === v) { ny = -1; qy = y0; } else { ny = 1; qy = y1; }
    }
    sx = qx + nx * 0.75; sy = qy + ny * 0.75; sz = qz + nz * 0.75;
  } else if (kind === 'enemy' || kind === 'spawner') {
    if (dl > 1e-9) { nx = -dx; ny = -dy; nz = -dz; sx = x + dx * (r - 0.75); sy = y + dy * (r - 0.75); sz = z + dz * (r - 0.75); }
    else sz = z + 0.75;
  } else if (kind === 'lob') {                                 // on the floor under the cloud the lob leaves
    var floorZ = floorMesh ? sampleSpatialSupportZ(x, y, p.renderFloorZ, p.underground) : 0;
    sz = Number.isFinite(floorZ) ? floorZ + 0.75 : z - r + 0.75;
  } else {                                                     // floor, cap, ceiling: the struck triangle
    var tn = fxSurfaceNormalInto(contact, x, y, kind === 'ceiling' ? -1 : 1, _fxN);
    nx = tn[0]; ny = tn[1]; nz = tn[2];
    sx = x - nx * (r - 0.75); sy = y - ny * (r - 0.75); sz = z - nz * (r - 0.75);
  }
  ev.x[k] = sx; ev.y[k] = sy; ev.z[k] = sz;
  ev.dx[k] = dx; ev.dy[k] = dy; ev.dz[k] = dz; ev.nx[k] = nx; ev.ny[k] = ny; ev.nz[k] = nz;
  var code = FX_CONTACT_KINDS.indexOf(kind);
  ev.kind[k] = code < 0 ? 30 : code; ev.ore[k] = ore;
  ev.spell[k] = spell.id && _fxHas(S.C.SPELLS, spell.id) ? S.C.SPELLS[spell.id] : 0;
  var visual = spell.id && typeof SPELL_VISUAL_RECIPES !== 'undefined' ? SPELL_VISUAL_RECIPES[spell.id] : null;
  var mat = visual && GAME_MATERIALS[visual.material];
  if (mat) { ev.rgb[k] = mat.packed.light; ev.rgb2[k] = mat.packed.core; } else ev.rgb[k] = fxParseColor(spell.color);
  ev.flags[k] = (p.underground ? FX_EV_UNDER : 0) | (spell.isCompanion ? FX_EV_COMPANION : 0);
  return fxContactAdmit(S, k);
}
var _fxNoSpell = {};
// The contact cap: the first FX_CONTACTS_PER_TICK contacts since the last
// tick are queued; each further one takes the slot of the farthest of them
// if it is nearer the camera, else it is dropped (both counted).
function fxContactAdmit(S, k) {
  var ev = S.ev, n = S.contactN, far = 0;
  if (!Number.isFinite(ev.x[k] + ev.y[k] + ev.z[k])) return true;            // the commit counts it as bad
  var d = Math.hypot(ev.x[k] - cam.x, ev.y[k] - cam.y);
  if (!(d >= 0)) d = Infinity;
  if (n < FX_CONTACTS_PER_TICK) { S.contactSlot[n] = k; S.contactD[n] = d; S.contactN = n + 1; return true; }
  for (var j = 1; j < n; j++) if (S.contactD[j] > S.contactD[far]) far = j;
  S.stats.contactsDropped++;
  if (d < S.contactD[far]) { fxRingCopy(ev, k, S.contactSlot[far]); S.contactD[far] = d; }
  return false;
}
// Legacy mode (the A/B reference until S10): the producers' old bodies,
// re-scoped into functions (the pickup body split by kind, the producer's
// tick-local `now` read as gameTimeNow(), equal inside a session), run by
// fxEvent on the private legacy stream (11-enemies.js, 10-combat.js and
// 18-arena-fortress.js before S4). The shrine, Phoenix,
// Thunder Core and garrison-death producers pushed {life,maxLife} or {t,dur}
// records that were pruned before any frame drew them, so their Legacy mode
// shows nothing, as before (section 4.4), and has no adapter.
var FX_LEGACY_ADAPTERS = {
  enemyDeath: function (e) {
    var now = gameTimeNow();
    // Bone scatter — 7 tumbling segments fly outward
    for (var b = 0; b < 7; b++) {
      var bang = Math.random() * Math.PI * 2;
      var bspd = 50 + Math.random() * 110;
      deathEffects.push({x:e.x, y:e.y, vx:Math.cos(bang)*bspd, vy:Math.sin(bang)*bspd,
        rot:Math.random()*Math.PI*2, rotVel:(Math.random()-0.5)*10,
        len:7+Math.random()*13, spawnMs:now, lifeMs:800, color:'#cfc8b8'});
    }
  },
  spawnerDeath: function (sp2) {
    var now = gameTimeNow();
    // Death burst
    for (var sb = 0; sb < 5; sb++) {
      var sba = Math.random() * Math.PI * 2, sbs = 40 + Math.random() * 80;
      deathEffects.push({x:sp2.x, y:sp2.y, vx:Math.cos(sba)*sbs, vy:Math.sin(sba)*sbs,
        rot:Math.random()*Math.PI*2, rotVel:(Math.random()-0.5)*8,
        len:8+Math.random()*10, spawnMs:now, lifeMs:600, color:'#3a1520'});
    }
  },
  // Arcane tomes and stat pickups: stacked rings at the item.
  pickup: function (item, kind, pColor) {
    var pi, ang;
    if (kind === 'tome') {
      var tome = item;
      for (pi = 0; pi < 15; pi++) {
        ang = (pi / 15) * Math.PI * 2;
        impacts.push({x: tome.x, y: tome.y, z: getEntityRenderFloorZ(tome) + 10,
          vx: Math.cos(ang) * 50, vy: Math.sin(ang) * 50, vz: 20 + Math.random() * 30,
          spawnMs: gameTimeNow(), lifeMs: 1000, color: '#bb66ff', size: 5});
      }
    } else if (kind === 'stat') {
      var sp = item;
      for (pi = 0; pi < 12; pi++) {
        ang = (pi / 12) * Math.PI * 2;
        impacts.push({x: sp.x, y: sp.y, z: getEntityRenderFloorZ(sp) + 8,
          vx: Math.cos(ang) * 45, vy: Math.sin(ang) * 45, vz: 15 + Math.random() * 25,
          spawnMs: gameTimeNow(), lifeMs: 800, color: pColor, size: 4});
      }
    }
  }
};

// ── Spawning ──────────────────────────────────────────────────────────────
// sky: z is already the open-sky support at (x, y) (a weather column). A
// segment resolver may widen the lateral spread by segW at the far end
// (growing with u squared, as a fanning beam does) and bow the height with
// segQ: z + (floor + 1 - z) u squared, the flame's arc from the hand down to
// 1 u above the floor under each particle's own point (fxSegPoint), which
// is the walkable layer nearest `feet` (the caster's), as the beam's is.
var _fxCtx = {x:0, y:0, z:0, h:0, nx:0, ny:0, nz:1, dx:0, dy:0, dz:0, vx:0, vy:0, vz:0,
  x2:0, y2:0, z2:0, seg:false, segW:0, segQ:false, feet:0, pal:-1, pal2:-1, ore:-1, surf:-1, flags:0, spec:0, space:0, frame:0, owner:-1, sky:false};
function fxCtxReset(ctx) {
  ctx.x = ctx.y = ctx.z = ctx.h = 0; ctx.nx = ctx.ny = 0; ctx.nz = 1; ctx.dx = ctx.dy = ctx.dz = 0;
  ctx.vx = ctx.vy = ctx.vz = 0; ctx.seg = false; ctx.segW = 0; ctx.segQ = false; ctx.feet = 0;
  ctx.pal = ctx.pal2 = ctx.ore = -1; ctx.surf = -1; ctx.flags = 0; ctx.space = 0; ctx.frame = 0;
  ctx.owner = -1; ctx.sky = false;
}
function fxBiomeIndex(S) {
  var i = S.C.PAL.surfBiomes.indexOf(terrain);
  return i < 0 ? 0 : i;
}
// Event colours are interned inside the tick into this state's dynamic table,
// so palette indices depend only on the seed and the events since the reset.
function fxInternColor(S, rgb) {
  var P = S.C.PAL, d = S.dynPal, n = S.dynCount, best = 0, bestD = Infinity;
  for (var k = 0; k < n; k++) if (d[k] === rgb) return P.count + k;
  if (n < d.length) { d[n] = rgb; S.dynCount = n + 1; return P.count + n; }
  S.stats.palOverflow++;
  for (var j = 0; j < n; j++) {
    var dr = ((d[j] >> 16) & 255) - ((rgb >> 16) & 255), dg = ((d[j] >> 8) & 255) - ((rgb >> 8) & 255), db = (d[j] & 255) - (rgb & 255);
    var dist = dr * dr + dg * dg + db * db;
    if (dist < bestD) { bestD = dist; best = j; }
  }
  return P.count + best;
}
function fxPickPal(S, spec, u, ctx) {
  var P = S.C.PAL, src = P.specSrc[spec];
  if (src === 0) {
    var s0 = P.specStart[spec], last = s0 + P.specCount[spec] - 1;
    for (var k = s0; k < last; k++) if (u < P.cum[k]) return P.cand[k];
    return P.cand[last];
  }
  if (src === FX_COLOR_ORE && ctx.ore >= 0) return P.ore[ctx.ore * 2 + (u < 0.6 ? 0 : 1)];   // the vein's base or lit entry
  // Event and spell colours: the event's colour, or either of its two (a spell's light and core roles).
  if (src <= FX_COLOR_ORE) return ctx.pal2 >= 0 && u >= 0.5 ? ctx.pal2 : ctx.pal >= 0 ? ctx.pal : 0;
  var biome = ctx.flags & FX_EV_UNDER ? P.surfBiomes.length - 1 : ctx.surf >= 0 ? ctx.surf : fxBiomeIndex(S);
  return P.surf[biome * 4 + src - FX_COLOR_ORE - 1];
}
// First-person in-view test from the sim camera (same geometry as projToScreen).
function fxInView(px, py, pz, margin) {
  var dx = px - cam.x, dy = py - cam.y, c = Math.cos(cam.ang), s = Math.sin(cam.ang), fwd = dx * c + dy * s;
  if (fwd < 1) return false;
  if (Math.abs((-dx * s + dy * c) / fwd) > Math.tan(cam.fov / 2) * margin) return false;
  var eyeZ = 60 + ((Number.isFinite(cam.z) ? cam.z : 60) - 60) * 0.625;
  return Math.abs((eyeZ - pz) / fwd - (cam.pitch || 0)) < (2 / 3) * margin;
}
// Spawn keep: 1 up to near, farKeep at far, 0 beyond cull.
function fxKeep(R, r, d) {
  if (d <= R.near[r]) return 1;
  if (d > R.cull[r]) return 0;
  if (d >= R.far[r]) return R.farKeep[r];
  return 1 + (R.farKeep[r] - 1) * (d - R.near[r]) / (R.far[r] - R.near[r]);
}
// The keep of a spawn of recipe r at (x, y), from the sim camera. Locomotion
// dust in the 2D view, where nothing shrinks with distance: 1 inside the view
// (viewCam and the canvas, 1 u a pixel, both kept by the tick) and 0 outside.
function fxSpawnKeep(R, r, x, y) {
  if (MODE3D || R.cls[r] !== FX_CLASS_LOCO) return fxKeep(R, r, Math.hypot(x - cam.x, y - cam.y));
  var m = FX_VIEW2D_MARGIN, vx = viewCam.x, vy = viewCam.y;
  return x >= vx - m && y >= vy - m && x <= vx + canvas.width + m && y <= vy + canvas.height + m ? 1 : 0;
}
// A burst's spawn count for x nominal particles: rounded; under one, its
// first serial spawns when that serial's own draw u (attribute 22 of its
// seed) is below x, so a sparser setting or a farther event shows a subset
// of the same particles and a one-particle burst thins instead of vanishing.
function fxRoundCount(x, u) { return x >= 1 ? Math.round(x) : x > 0 && u < x ? 1 : 0; }
// First-person placement, decided once per burst from the sim camera.
// Returns 0 (placed), 1 (self event out of view) or 2 (no screen space).
function fxPlace(S, r, place, ctx) {
  var R = S.R, fp = MODE3D && CAM_FOLLOW;
  if (S.placeOver[r] >= 0) place = S.placeOver[r];
  ctx.space = 0; ctx.frame = 0;
  // A burst of the player's own event that would sit at its source (the
  // feet): selfView decides (section 5.7). A placement that moves it in front
  // of the camera (an override such as frontSides, or screen) is always seen.
  if ((ctx.flags & FX_EV_SELF) && fp && place === FX_PLACE_SOURCE) {
    var sv = R.selfView[r];
    if (sv === FX_SELF_SKIP || sv === FX_SELF_IFVISIBLE && !fxInView(ctx.x, ctx.y, ctx.z, 1.1)) return 1;
  }
  if (!fp) return place === FX_PLACE_SCREEN ? 2 : 0;          // eye bursts fall back to their source
  if (place === FX_PLACE_EYE) { ctx.space = 1; return 0; }
  if (place === FX_PLACE_SCREEN) { ctx.space = 2; return 0; }
  if (place === FX_PLACE_SIDES) { ctx.frame = 2; return 0; }
  if (place === FX_PLACE_SOURCE) return 0;
  var c = Math.cos(cam.ang), s = Math.sin(cam.ang), dist = R.pDist[r], eyeZ = 60 + ((Number.isFinite(cam.z) ? cam.z : 60) - 60) * 0.625;
  if (place === FX_PLACE_FRONT && Math.hypot(ctx.x - cam.x, ctx.y - cam.y) >= R.pNear[r] && fxInView(ctx.x, ctx.y, ctx.z, 0.9)) return 0;
  // In front: `distance` along the pitched view ray (the screen centre is
  // where (eyeZ - z) / fwd = pitch), and `drop` below it scaled with the
  // forward distance, so the burst keeps its pitch-0 screen offset below the
  // crosshair when the player looks down or up.
  var p = Number.isFinite(cam.pitch) ? cam.pitch : 0, fd = dist / Math.sqrt(1 + p * p);
  var lateral = place === FX_PLACE_FRONT ? -(ctx.x - cam.x) * s + (ctx.y - cam.y) * c : 0, half = fd / 2;
  lateral = lateral < -half ? -half : lateral > half ? half : lateral;
  ctx.x = cam.x + c * fd - s * lateral; ctx.y = cam.y + s * fd + c * lateral; ctx.z = eyeZ - p * fd - R.pDrop[r] * fd / dist;
  if (place === FX_PLACE_RING) ctx.frame = 1;
  else fxFrontVelocity(ctx);
  return 0;
}
// A burst moved in front of a walking player carries the player's velocity
// (recipes take a share with spawn.inherit; drag decays it), so the player
// does not walk through it within its life. Capped at twice the base walking
// speed: a dash impulse decays much faster than particle drag.
function fxFrontVelocity(ctx) {
  var vx = Number.isFinite(vel.x) ? vel.x : 0, vy = Number.isFinite(vel.y) ? vel.y : 0, v = Math.hypot(vx, vy);
  var cap = 2 * GAME_CONFIG.player.baseSpeed, k = v > cap ? cap / v : 1;
  ctx.vx = vx * k; ctx.vy = vy * k; ctx.vz = 0;
}
// Console/dev A/B of first-person placement (spec 5.7, Revision 3 Q5): every
// state places recipeId with `place` from the next tick; null restores the
// recipe's own. Never persisted. Camera-local particles skip collision.
var _fxPlaceOverride = {};
function setEffectPlacementOverride(recipeId, place) {
  if (!fxState.C.ID.hasOwnProperty(recipeId)) throw new Error('effect placement: unknown recipe ' + recipeId);
  if (place !== null && FX_ENUMS.place.indexOf(place) < 0) throw new Error('effect placement: place must be one of ' + FX_ENUMS.place.join(' ') + ' or null');
  if (place === null) delete _fxPlaceOverride[recipeId]; else _fxPlaceOverride[recipeId] = FX_ENUMS.place.indexOf(place);
  _effectToggleGen++;
  return place;
}
// A burst of n authored particles. Every serial of the burst is consumed, so
// a lower density or a farther event shows a prefix of the same particles.
// Anchor and child spawns (exact) are already rate-scaled.
function fxBurst(S, r, n, place, ctx, exact) {
  var R = S.R, c = R.cls[r], st = S.stats, serial = S.serial, m = n, spawned = 0;
  if (!exact) {
    var nominal = n * S.scale[c], keep = fxSpawnKeep(R, r, ctx.x, ctx.y), total = Math.ceil(n * FX_CLASS_MAX_SCALE[c]);
    var u = nominal < 1 || nominal * keep < 1 ? effectNoise((effectNoise(R.salt[r] ^ S.seed, serial) * 4294967296) >>> 0, 22) : 0;
    var base = fxRoundCount(nominal, u);                         // the count at keep 1: the distance LOD refuses the rest
    m = fxRoundCount(nominal * keep, u);
    if (c === 4 && m < 1 && keep > 0 && n > 0) m = 1;             // feedback never disappears
    if (m > total) m = total;
    S.serial = (serial + Math.max(total, m)) >>> 0;
    if (base > m) st.refusedLod += base - m;
  } else S.serial = (serial + n) >>> 0;
  if (m <= 0) return 0;
  if (ctx.z !== ctx.z) { st.refusedNoSupport += m; return 0; }    // no ground under a movement observer's event
  var why = fxPlace(S, r, place, ctx);
  if (why) { if (why === 1) st.refusedOffscreenSelf += m; else st.refusedView += m; return 0; }
  for (var j = 0; j < m; j++) {
    if (S.spawnLeft <= 0) { st.refusedSpawnCap += m - j; break; }
    var got = fxSpawn(S, r, (serial + j) >>> 0, j, n, ctx);
    if (got >= 0) { S.spawnLeft--; spawned++; continue; }
    // A gate or cap refusal holds for the rest of the burst: count it once.
    // A refused steal scan uses up spawn-cap work, so later events wait.
    if (got >= -2) { fxRefuse(S, r, got, m - j); break; }
    fxRefuse(S, r, got, 1);
    if (got === -3 && !S.noSteal) S.spawnLeft--;
  }
  return spawned;
}
// Admission (section 3.6): gate, per-recipe and class caps, then the budget,
// with a bounded steal from a lower class. Returns the free slot or a
// refusal: -1 gate, -2 cap, -3 budget.
function fxAdmit(S, r) {
  var R = S.R, c = R.cls[r];
  if (!S.gate[r]) return -1;
  if (S.recipeLive[r] >= R.maxLive[r] || S.classLive[c] - S.classDying[c] >= S.caps[c]) return -2;
  if (S.count >= (c === 4 ? S.cap : S.B)) {
    if (S.noSteal || !fxSteal(S, c)) return -3;
  }
  return S.count;
}
// Counts n refused spawns by reason (-4: no support at the spawn column).
function fxRefuse(S, r, why, n) {
  var st = S.stats;
  if (why === -1) { if (S.gateWhy[r] === 1) st.refusedToggle += n; else st.refusedFamily += n; }
  else if (why === -2) st.refusedCap += n;
  else if (why === -3) st.refusedBudget += n;
  else st.refusedNoSupport += n;
}
// 64-slot scan from a rotating cursor: the lowest class below the spawn's,
// then the oldest normalized age.
function fxSteal(S, c) {
  var n = S.count;
  if (!n) return false;
  var scan = Math.min(n, EFFECT_CONFIG.stealScan), at = S.stealCursor % n, best = -1, bestC = c, bestAge = -1;
  for (var k = 0; k < scan; k++) {
    var i = (at + k) % n, vc = S.cls[i];
    if (vc >= c) continue;
    var a = S.age[i] / S.life[i];
    if (best < 0 || vc < bestC || vc === bestC && a > bestAge) { best = i; bestC = vc; bestAge = a; }
  }
  S.stealCursor = (at + scan) % n;
  if (best < 0) return false;
  S.stolenByClass[bestC]++; S.stats.stolen++;
  fxKill(S, best);
  return true;
}
// The unit vector b tilted by th around a perpendicular at azimuth ph.
var _fxDir = new Float64Array(3);
function fxConeInto(out, bx, by, bz, th, ph) {
  var ex, ey, ez;
  if (Math.abs(bz) < 0.9) { ex = -by; ey = bx; ez = 0; } else { ex = 0; ey = -bz; ez = by; }
  var el = Math.hypot(ex, ey, ez); ex /= el; ey /= el; ez /= el;
  var fx = by * ez - bz * ey, fy = bz * ex - bx * ez, fz = bx * ey - by * ex;
  var ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
  out[0] = bx * ct + (ex * cp + fx * sp) * st; out[1] = by * ct + (ey * cp + fy * sp) * st; out[2] = bz * ct + (ez * cp + fz * sp) * st;
}
// Serial j of a burst in bit-reversed order (0, 1/2, 1/4, 3/4, 1/8, ...):
// any prefix of a ring burst spreads evenly round it.
function fxRadicalInverse(j) {
  var v = j & 0xffff;
  v = ((v & 0x5555) << 1) | ((v >> 1) & 0x5555); v = ((v & 0x3333) << 2) | ((v >> 2) & 0x3333);
  v = ((v & 0x0f0f) << 4) | ((v >> 4) & 0x0f0f); v = ((v & 0x00ff) << 8) | ((v >> 8) & 0x00ff);
  return v / 65536;
}
// Attribute k of a particle is effectNoise(seedA, k): 0 life, 1 size, 2 alpha,
// 3-5 shape, 6 speed, 7 up, 8 spread, 9 rotation, 10 palette, 11 light
// jitter, 12 phase, 13 child chance, 14-15 direction, 16 height, 17 lift,
// 18 spin, 19 rest time, 20 stick length (21 a prewarm's point, 22 a burst's
// thinning draw, fxBurst). n is the burst's authored count.
// A segment emitter's point at u = n3 (lateral by n4, the fan by segW) into
// _fxSegP[0..1]; for a bowed segment (segQ) [2] is the floor under that
// point by the beam's rule (NaN where there is none), else 0. No allocation.
var _fxSegP = new Float64Array(3);
function fxSegPoint(ctx, rad, n3, n4) {
  var sdx = ctx.x2 - ctx.x, sdy = ctx.y2 - ctx.y, sl = Math.hypot(sdx, sdy) || 1, lat = (rad + ctx.segW * n3) * n3 * (2 * n4 - 1);
  _fxSegP[0] = ctx.x + sdx * n3 - sdy / sl * lat; _fxSegP[1] = ctx.y + sdy * n3 + sdx / sl * lat;
  _fxSegP[2] = ctx.segQ ? fxNearestLayerZ(_fxSegP[0], _fxSegP[1], ctx.feet) : 0;
}
function fxSpawn(S, r, serial, j, n, ctx) {
  var R = S.R, st = S.stats, seed = (effectNoise(R.salt[r] ^ S.seed, serial) * 4294967296) >>> 0;
  var n3 = effectNoise(seed, 3), n4 = effectNoise(seed, 4), c = Math.cos(cam.ang), s = Math.sin(cam.ang), wx = 0, wy = 0, wz = 0;
  if (ctx.frame === 2) {
    // A frontSides wedge point (section 5.7): alternately left and right,
    // 0.6-1 x `distance` along the ground, shortened as the view pitches down
    // (as sourceOrFront), so at pitch 0 most of it is past the ~90 u of
    // ground hidden below the canvas. Its ground is found before admission:
    // a puff with none there (refused) never takes a live particle's slot.
    var pw = Number.isFinite(cam.pitch) ? cam.pitch : 0, side = (j & 1) ? 1 : -1, sa = cam.ang + side * R.pArc[r] * (0.5 + 0.5 * n4);
    var sd = R.pDist[r] / Math.sqrt(1 + pw * pw) * (0.6 + 0.4 * n3);
    wx = cam.x + Math.cos(sa) * sd; wy = cam.y + Math.sin(sa) * sd; wz = fxWedgeZ(S, wx, wy);
    if (!Number.isFinite(wz)) return -4;
  }
  // A bowed segment's point and the floor under it, before admission: a
  // point where the beam has no floor is skipped, as the beam skips it.
  if (ctx.segQ && ctx.seg && !ctx.space && !ctx.frame && R.shape[r] === FX_SHAPE_SEGMENT) {
    fxSegPoint(ctx, R.rad0[r] + (R.rad1[r] - R.rad0[r]) * n3, n3, n4);
    if (!Number.isFinite(_fxSegP[2])) return -4;
  }
  var i = fxAdmit(S, r);
  if (i < 0) return i;
  var shape = R.shape[r], ang = 2 * Math.PI * n4;
  var rad = R.rad0[r] + (R.rad1[r] - R.rad0[r]) * n3, ox = 0, oy = 0, oz = 0;
  if (shape === FX_SHAPE_SPHERE) {
    var u = 2 * effectNoise(seed, 5) - 1, w = Math.sqrt(1 - u * u);
    ox = rad * w * Math.cos(ang); oy = rad * w * Math.sin(ang); oz = rad * u;
    if (R.halfSpace[r]) {                                   // mirrored to the event normal's side: never into the surface
      var on = ox * ctx.nx + oy * ctx.ny + oz * ctx.nz;
      if (on < 0) { ox -= 2 * on * ctx.nx; oy -= 2 * on * ctx.ny; oz -= 2 * on * ctx.nz; }
    }
  } else if (shape === FX_SHAPE_DISC || shape === FX_SHAPE_COLUMN) {
    var rr = R.rad0[r] + (R.rad1[r] - R.rad0[r]) * Math.sqrt(n3);
    ox = rr * Math.cos(ang); oy = rr * Math.sin(ang);
    if (shape === FX_SHAPE_COLUMN) oz = R.hgt0[r] + (R.hgt1[r] - R.hgt0[r]) * effectNoise(seed, 16);
  } else if (shape === FX_SHAPE_RING) {
    // A heading depends only on the serial and its own hash, never on how
    // many of the burst spawn (a lower density shows the same particles).
    var ra = 2 * Math.PI * (fxRadicalInverse(j) + n4 / (n > 0 ? n : 1)), ringR = ctx.frame === 1 && R.pRadius[r] > 0 ? R.pRadius[r] : rad;
    ox = ringR * Math.cos(ra); oy = ringR * Math.sin(ra);
  } else if (shape === FX_SHAPE_CONE) {
    // rad from the apex, within the spread cone around the event direction
    // (the camera's forward when the event has none).
    var al = Math.hypot(ctx.dx, ctx.dy, ctx.dz), cone = _fxDir;
    if (al > 1e-9) fxConeInto(cone, ctx.dx / al, ctx.dy / al, ctx.dz / al, R.spread[r] * Math.sqrt(effectNoise(seed, 5)), ang);
    else fxConeInto(cone, Math.cos(cam.ang), Math.sin(cam.ang), 0, R.spread[r] * Math.sqrt(effectNoise(seed, 5)), ang);
    ox = rad * cone[0]; oy = rad * cone[1]; oz = rad * cone[2];
  } else if (shape === FX_SHAPE_CORNERS) {
    // Screen units from the centre (canvas heights; x in 3/4 widths on a
    // canvas narrower than 4:3, so a half width is at least 0.67 units),
    // alternately left and right of the arms in the lower third, above the
    // HUD's corner panels and inside the frame: radial motion then carries
    // each puff out past its lower corner.
    ox = ((j & 1) ? 1 : -1) * (0.42 + 0.2 * n3); oy = 0.12 + 0.14 * n4;
  }
  var lift = R.lift0[r] + (R.lift1[r] - R.lift0[r]) * effectNoise(seed, 17), px, py, pz;
  if (ctx.space === 1) { px = R.pDist[r] + oz; py = ox; pz = oy + lift; }
  else if (ctx.space === 2) { px = ox; py = oy; pz = 0; }
  else if (ctx.frame === 1) { px = ctx.x - s * ox; py = ctx.y + c * ox; pz = ctx.z + oy + lift; }
  else if (ctx.frame === 2) { px = wx; py = wy; pz = wz + lift; }       // on the wedge's ground
  else {
    px = ctx.x + ox; py = ctx.y + oy; pz = ctx.z + oz + lift;
    if (shape === FX_SHAPE_SEGMENT && ctx.seg) {
      if (!ctx.segQ) fxSegPoint(ctx, rad, n3, n4);
      px = _fxSegP[0]; py = _fxSegP[1];
      pz = (ctx.segQ ? ctx.z + (_fxSegP[2] + 1 - ctx.z) * n3 * n3 : ctx.z + (ctx.z2 - ctx.z) * n3) + lift;
    }
    var support = R.support[r];
    if (support === FX_SUPPORT_OPENSKY) pz = (ctx.sky && px === ctx.x && py === ctx.y ? ctx.z : fxSurfaceZ(px, py)) + oz + lift;
    else if (support === FX_SUPPORT_CEILING) {
      var cave = getCaveSpaceAt(px, py, ctx.z / 25);
      pz = cave.underground ? cave.ceilingH * 25 - 2 + oz + lift : NaN;
    }
    if (!Number.isFinite(pz)) return -4;
  }
  // Velocity: a direction basis within the spread cone, times speed, plus up.
  var dir = R.direction[r], bx = 0, by = 0, bz = 0, n8 = effectNoise(seed, 8), n14 = effectNoise(seed, 14);
  if (dir === FX_DIR_RANDOM) {
    var ru = 2 * n8 - 1, rw = Math.sqrt(1 - ru * ru); bx = rw * Math.cos(2 * Math.PI * n14); by = rw * Math.sin(2 * Math.PI * n14); bz = ru;
  } else if (dir === FX_DIR_UP) bz = 1;
  else if (dir === FX_DIR_RADIAL) {
    var oh = Math.hypot(ox, oy);
    if (oh > 1e-9) { bx = ox / oh; by = oy / oh; } else { bx = Math.cos(2 * Math.PI * n14); by = Math.sin(2 * Math.PI * n14); }
  } else if (dir === FX_DIR_NORMAL) { bx = ctx.nx; by = ctx.ny; bz = ctx.nz; }
  else if (dir === FX_DIR_REFLECT) {
    var dn = ctx.dx * ctx.nx + ctx.dy * ctx.ny + ctx.dz * ctx.nz;
    bx = ctx.dx - 2 * dn * ctx.nx; by = ctx.dy - 2 * dn * ctx.ny; bz = ctx.dz - 2 * dn * ctx.nz;
  } else if (dir === FX_DIR_ALONG) { bx = ctx.dx; by = ctx.dy; bz = ctx.dz; }
  else if (dir === FX_DIR_WIND) {                                      // calm air: the prevailing direction
    var wl = Math.hypot(S.weather.windX, S.weather.windY), calm = FX_WEATHER_RULES.calmDirection;
    if (wl > 0) { bx = S.weather.windX / wl; by = S.weather.windY / wl; } else { bx = calm[0]; by = calm[1]; }
  } else if (dir === FX_DIR_BACKWARD) {
    if (ctx.frame === 2) { bx = -c; by = -s; } else { bx = -ctx.dx; by = -ctx.dy; }
  }
  var bl = Math.hypot(bx, by, bz);
  if (bl > 1e-9) {
    bx /= bl; by /= bl; bz /= bl;
    var spread = R.spread[r];
    if (spread > 0 && dir !== FX_DIR_RANDOM) {
      fxConeInto(_fxDir, bx, by, bz, spread * Math.sqrt(n8), 2 * Math.PI * n14);
      bx = _fxDir[0]; by = _fxDir[1]; bz = _fxDir[2];
    }
  }
  var speed = R.spd0[r] + (R.spd1[r] - R.spd0[r]) * effectNoise(seed, 6);
  var upv = R.up0[r] + (R.up1[r] - R.up0[r]) * effectNoise(seed, 7), inh = R.inherit[r];
  var vx = bx * speed + inh * ctx.vx, vy = by * speed + inh * ctx.vy, vz = bz * speed + upv + inh * ctx.vz;
  // Wind-borne particles start at the air's speed (wind x their coupling,
  // the speed drag relaxes them to), so rain and snow slant from birth.
  if (dir === FX_DIR_WIND) { vx += S.weather.windX * R.wind[r]; vy += S.weather.windY * R.wind[r]; }
  if (ctx.space === 1) { vx = bz * speed; vy = bx * speed; vz = by * speed + upv; }       // camera-local fwd, right, up
  else if (ctx.space === 2) { vx = bx * speed; vy = by * speed; vz = 0; }
  var life = R.life0[r] + (R.life1[r] - R.life0[r]) * effectNoise(seed, 0), cls = R.cls[r];
  S.x[i] = px; S.y[i] = py; S.z[i] = pz; S.vx[i] = vx; S.vy[i] = vy; S.vz[i] = vz;
  S.age[i] = 0; S.life[i] = life;
  S.size[i] = R.size0[r] + (R.size1[r] - R.size0[r]) * effectNoise(seed, 1);
  S.alpha[i] = R.alpha0[r] + (R.alpha1[r] - R.alpha0[r]) * effectNoise(seed, 2);
  S.rot[i] = 2 * Math.PI * effectNoise(seed, 9);
  S.spin[i] = R.spin0[r] + (R.spin1[r] - R.spin0[r]) * effectNoise(seed, 18);
  S.phase[i] = 2 * Math.PI * effectNoise(seed, 12);
  S.gcell[i] = -1; S.owner[i] = ctx.owner; S.seedA[i] = seed; S.rec[i] = r;
  S.pal[i] = fxPickPal(S, ctx.spec, effectNoise(seed, 10), ctx);
  S.flags[i] = (ctx.space === 1 ? FX_EYE : ctx.space === 2 ? FX_SCREEN : 0) |
    (ctx.flags & FX_EV_UNDER ? FX_UNDER : 0) | (ctx.flags & FX_EV_SELF ? FX_SELF : 0);
  S.bounces[i] = R.bounces[r]; S.cls[i] = cls;
  S.count++; S.classLive[cls]++; S.recipeLive[r]++; st.spawned++;
  if (ctx.space) S.eyeCount++;
  return i;
}

// FIFO drain inside the tick; an event that no longer fits this tick's spawn
// cap waits for the next tick (the first event of a tick always runs). Its
// size is the most its matching, open bindings can spawn.
function fxEventMax(S, k) {
  var ev = S.ev, R = S.R, type = ev.type[k], sc = ev.scale[k], total = 0;
  if (type === FX_EMIT) {
    var r = ev.rec[k], n = ev.num[k] >= 0 ? ev.num[k] : R.api1[r];
    return Math.ceil(Math.round(n * sc) * FX_CLASS_MAX_SCALE[R.cls[r]]);
  }
  var list = S.C.bindings[type];
  for (var b = 0; b < list.length; b++) {
    if (!S.gate[list[b].r] || !fxBindingMatches(list[b], ev, k)) continue;
    total += Math.ceil(Math.round(list[b].c1 * sc) * FX_CLASS_MAX_SCALE[R.cls[list[b].r]]);
  }
  return total;
}
// A binding's where predicates (kind, spell, self, companion, underground)
// against queued event k.
function fxBindingMatches(bind, ev, k) {
  var fl = ev.flags[k];
  if (!(bind.kindMask & (1 << ev.kind[k])) || bind.spellMask && !(bind.spellMask & ev.spell[k])) return false;
  if (bind.self && (bind.self === 1) !== !!(fl & FX_EV_SELF)) return false;
  if ((bind.companion === 1) !== !!(fl & FX_EV_COMPANION)) return false;
  return !(bind.under && (bind.under === 1) !== !!(fl & FX_EV_UNDER));
}
function fxDrainEvents(S) {
  var ev = S.ev, full = S.spawnLeft;
  while (ev.count > 0 && S.spawnLeft > 0) {
    var k = ev.head;
    if (S.spawnLeft < full && fxEventMax(S, k) > S.spawnLeft) break;
    ev.head = (k + 1) % ev.n; ev.count--;
    fxRunEvent(S, k);
  }
}
function fxLoadCtx(S, k, ctx, ring) {
  var ev = ring || S.ev;
  fxCtxReset(ctx);
  ctx.x = ev.x[k]; ctx.y = ev.y[k]; ctx.z = ev.z[k]; ctx.h = ev.h[k];
  ctx.nx = ev.nx[k]; ctx.ny = ev.ny[k]; ctx.nz = ev.nz[k]; ctx.dx = ev.dx[k]; ctx.dy = ev.dy[k]; ctx.dz = ev.dz[k];
  ctx.vx = ev.vx[k]; ctx.vy = ev.vy[k]; ctx.vz = ev.vz[k]; ctx.flags = ev.flags[k];
  ctx.surf = ev.surf[k] >= 0 ? ev.surf[k] : fxBiomeIndex(S);
  ctx.pal = ev.rgb[k] >= 0 ? fxInternColor(S, ev.rgb[k]) : -1;
  ctx.pal2 = ev.rgb2[k] >= 0 ? fxInternColor(S, ev.rgb2[k]) : -1; ctx.ore = ev.ore[k];
}
function fxBurstCount(S, r, c0, c1) {
  return c0 + Math.min(c1 - c0, Math.floor(effectNoise(S.R.salt[r] ^ S.seed, S.serial) * (c1 - c0 + 1)));
}
// Event k of the ring (the queue, or an observer's one-slot event) through
// its bindings.
function fxRunEvent(S, k, ring) {
  var ev = ring || S.ev, R = S.R, ctx = _fxCtx, type = ev.type[k];
  fxLoadCtx(S, k, ctx, ev);
  if (type === FX_EMIT) {
    var r = ev.rec[k], n = ev.num[k] >= 0 ? ev.num[k] : fxBurstCount(S, r, R.api0[r], R.api1[r]);
    ctx.spec = R.colorSpec[r];
    fxBurst(S, r, Math.round(n * ev.scale[k]), R.place[r], ctx, false);
    return;
  }
  var list = S.C.bindings[type], x = ctx.x, y = ctx.y, z = ctx.z;
  for (var b = 0; b < list.length; b++) {
    var bind = list[b];
    if (!fxBindingMatches(bind, ev, k)) continue;
    ctx.x = x; ctx.y = y; ctx.z = z; ctx.vx = ev.vx[k]; ctx.vy = ev.vy[k]; ctx.vz = ev.vz[k];   // placement may replace both
    if (bind.at === FX_AT_TORSO) ctx.z = z + 0.45 * ev.h[k];
    else if (bind.at === FX_AT_SHRINE) ctx.z = z + 28;
    else if (bind.at === FX_AT_PLAYER) { ctx.x = pos.x; ctx.y = pos.y; ctx.z = playerFeetSpatialZ(); }
    ctx.z += bind.lift;
    ctx.spec = bind.spec >= 0 ? bind.spec : R.colorSpec[bind.r];
    fxBurst(S, bind.r, Math.round(fxBurstCount(S, bind.r, bind.c0, bind.c1) * ev.scale[k]),
      bind.place >= 0 ? bind.place : R.place[bind.r], ctx, false);
  }
}

// Anchors: rate accumulators resolved every tick.
var PARTICLE_ANCHORS = {
  // 0 detach, 1 emit, 2 skip this tick (support not loaded).
  entity: function (S, A, k, ctx) {
    var e = A.ref[k];
    if (!e || typeof e.health === 'number' && !(e.health > 0) || !Number.isFinite(e.x) || !Number.isFinite(e.y)) return 0;
    var z = entityFeetSpatialZ(e);
    if (!Number.isFinite(z)) return 2;
    fxCtxReset(ctx);
    ctx.x = e.x; ctx.y = e.y; ctx.z = z + A.z[k]; ctx.flags = e.underground ? FX_EV_UNDER : 0;
    ctx.vx = e.vx || 0; ctx.vy = e.vy || 0;
    return 1;
  },
  point: function (S, A, k, ctx) {
    fxCtxReset(ctx);
    ctx.x = A.x[k]; ctx.y = A.y[k]; ctx.z = A.z[k];
    if (A.seg[k]) {
      ctx.seg = true; ctx.x2 = A.x2[k]; ctx.y2 = A.y2[k]; ctx.z2 = A.z2[k];
      var dx = ctx.x2 - ctx.x, dy = ctx.y2 - ctx.y, dz = ctx.z2 - ctx.z, l = Math.hypot(dx, dy, dz) || 1;
      ctx.dx = dx / l; ctx.dy = dy / l; ctx.dz = dz / l;
    }
    return 1;
  },
  // A selected torch light (A = S.torch): embers leave the real flame, 2 u out
  // along the wall normal and 2 u up (07-decorations-lighting.js), on the
  // viewer's own floor, so they share the viewer's stratum (set at tick start).
  torch: function (S, A, k, ctx) {
    var L = A.ref[k];
    if (!L || !Number.isFinite(L.x) || !Number.isFinite(L.y) || !Number.isFinite(L.z)) return 0;
    var nx = Number.isFinite(L.nx) ? L.nx : 0, ny = Number.isFinite(L.ny) ? L.ny : 0;
    fxCtxReset(ctx);
    ctx.x = L.x + nx * 2; ctx.y = L.y + ny * 2; ctx.z = L.z + 2;
    ctx.nx = nx; ctx.ny = ny; ctx.nz = nx || ny ? 0 : 1; ctx.flags = S.viewUnder ? FX_EV_UNDER : 0;
    return 1;
  },
  // The player's feet while a dash lasts (gameTimeNow() < dashUntil, set at
  // 09-physics.js), moving the way the player moves, on the ground under
  // them (none while airborne out of reach of it: fxDashZ). Player-owned:
  // SELF, so selfView applies (section 5.7). Attached by the player observer.
  dashTrail: function (S, A, k, ctx) {
    if (!(gameTimeNow() < dashUntil)) return 0;
    var feet = playerFeetSpatialZ(), under = !!playerUnderground, v = Math.hypot(vel.x, vel.y);
    if (!Number.isFinite(feet)) return 2;
    fxCtxReset(ctx);
    ctx.x = pos.x; ctx.y = pos.y; ctx.z = fxDashZ(pos.x, pos.y, feet, !!jumpAirborne, under);
    if (v > 1e-9) { ctx.dx = vel.x / v; ctx.dy = vel.y / v; }
    ctx.flags = FX_EV_SELF | (under ? FX_EV_UNDER : 0); ctx.surf = fxSurfaceAt(S, pos.x, pos.y, under);
    return 1;
  },
  // The flame stream (S8) while its beam is drawn (a stream tick within 180
  // ms, drawFlameStream3D's own test): the segment from the casting hand (14 u
  // along the aim and 6 u right, 55 u above the feet) to the beam's end (its
  // range times the 0.3 s ramp), each ember bowing down to 1 u above the
  // floor under its own point as the beam does (height by u squared: segQ;
  // the walkable layer nearest the feet, so a beam that ends in a wall or on
  // rising ground keeps its embers on the beam) and fanning to the beam's
  // half width at its end (segW). Along the aim; it carries the player's motion.
  flameStream: function (S, A, k, ctx) {
    var now = gameTimeNow();
    if (!(now - flameStreamLastTick <= 180)) return 0;
    var ramp = Math.min(1, (now - flameStreamStartMs) / 300), range = flameStreamRange * ramp, ang = flameStreamAng, feet = playerFeetSpatialZ();
    if (!(range > 0) || !Number.isFinite(ang + pos.x + pos.y + feet)) return 2;
    var fire = typeof spells !== 'undefined' && spells.fire || _fxNoSpell, hw = fire.tier >= 2 ? 0.55 : fire.streamWidth || 0.4;
    var c = Math.cos(ang), s = Math.sin(ang);
    fxCtxReset(ctx);
    ctx.x = pos.x + c * 14 - s * 6; ctx.y = pos.y + s * 14 + c * 6; ctx.z = feet + 55; ctx.feet = feet;
    ctx.seg = true; ctx.segQ = true; ctx.x2 = ctx.x + c * range; ctx.y2 = ctx.y + s * range;
    ctx.segW = (1 + range * Math.tan(hw)) * ramp; ctx.dx = c; ctx.dy = s;
    ctx.vx = Number.isFinite(vel.x) ? vel.x : 0; ctx.vy = Number.isFinite(vel.y) ? vel.y : 0;
    ctx.flags = playerUnderground ? FX_EV_UNDER : 0;
    return 1;
  }
};
// The walkable layer at (x, y) nearest ref (spatial Z), on its support
// triangle: the beam's floor rule (spellFloorRenderZ with the player's floor
// as the reference, a triangle required); 0 on a fixed level with no mesh,
// NaN off the mesh or with no triangle (the beam skips that point). No allocation.
function fxNearestLayerZ(x, y, ref) {
  var m = floorMesh;
  if (!m || !m.layerCount) return 0;
  var gs = m.gridSize, gx = Math.floor(x / gs), gy = Math.floor(y / gs), li = -1, best = Infinity;
  if (gx < 0 || gy < 0 || gx >= m.w || gy >= m.h) return NaN;
  var ci = gy * m.w + gx;
  for (var k = 0; k < m.layerCount[ci]; k++) {
    var type = m[SPATIAL_LAYER_TYPE_KEYS[k]][ci], h = m[SPATIAL_LAYER_TOP_KEYS[k]][ci];
    if (type !== 1 && type !== 3 && type !== 4 || !Number.isFinite(h) || !(Math.abs(h * 25 - ref) < best)) continue;
    best = Math.abs(h * 25 - ref); li = k;
  }
  return li < 0 || !spatialLayerCornersInto(m, ci, li, _fxCorners) ? NaN : fxLayerZ(m, ci, li, x, y);
}
function fxRunAnchors(S, dt) {
  var A = S.anchors, R = S.R, ctx = _fxCtx, now = -1;
  if (!A.live) return;
  for (var k = 0; k < A.n; k++) {
    if (!A.used[k]) continue;
    if (A.until[k] > 0) {
      if (now < 0) now = gameTimeNow();
      if (now > A.until[k]) { fxFreeAnchor(A, k); continue; }
    }
    var state = PARTICLE_ANCHORS[FX_ANCHOR_NAMES[A.kind[k]]](S, A, k, ctx), r = A.rec[k];
    if (!state) { fxFreeAnchor(A, k); continue; }
    if (state === 2 || !S.gate[r]) { A.acc[k] = 0; continue; }
    A.acc[k] += A.rate[k] * S.scale[R.cls[r]] * fxSpawnKeep(R, r, ctx.x, ctx.y) * dt;
    var due = Math.floor(A.acc[k]);
    if (due <= 0) continue;
    A.acc[k] -= due;
    ctx.spec = R.colorSpec[r]; ctx.owner = k;
    fxBurst(S, r, due, R.place[r], ctx, true);
  }
}

// ── Movement observers (section 9.3): footstep, dash and landing dust read
// from the state that step() and the NPC movers leave behind, after every
// mover of the tick has run; they never write gameplay state and add nothing
// to the movers. Positions are kept in world coordinates (the window origin
// added), so a chunk shift is no step; more than 64 u in one tick is a
// teleport or unstick push and restarts the stride. Per NPC body a small
// array in a WeakMap (world x, y, stride, side, tick last seen, hop count),
// never a field on the gameplay record; a body not observed in the last tick
// (out of range, one of more than the 24 nearest, stunned) starts afresh.
// step() zeroes jumpVelZ in the landing tick itself, so the landing reads
// the vertical speed kept from the last airborne tick. (Constants at the top.)
function fxCreateObservers() {
  return {seen:false, x:0, y:0, acc:0, side:1, air:0, vz:0, dash:0, npc:new WeakMap(),
    n:0, ref:new Array(FX_NPC_BODIES), d:new Float64Array(FX_NPC_BODIES), hop:new Uint8Array(FX_NPC_BODIES)};
}
function fxRunObservers(S) {
  // At Particles 0 the locomotion cap is 0 and nothing can spawn: the
  // observers idle, and the player (like any body unseen for a tick) starts
  // afresh when the setting rises.
  if (S.caps[FX_CLASS_LOCO] <= 0) { S.obs.seen = false; return; }
  fxObservePlayer(S, S.obs);
  if (fxEventOpen(S, FX_CODE_FOOTSTEP)) fxObserveNpcs(S, S.obs);   // a switched-off preset scans no body
}
function fxObservePlayer(S, O) {
  var ox = ENDLESS_MODE ? windowOriginX : 0, oy = ENDLESS_MODE ? windowOriginY : 0;
  var wx = pos.x + ox, wy = pos.y + oy, air = !!jumpAirborne;
  if (!Number.isFinite(wx + wy)) { O.seen = false; return; }
  if (!O.seen) { O.seen = true; O.x = wx; O.y = wy; O.acc = 0; O.air = air ? 1 : 0; O.vz = air ? jumpVelZ : 0; O.dash = dashUntil; return; }
  var dx = wx - O.x, dy = wy - O.y, d = Math.sqrt(dx * dx + dy * dy), under = !!playerUnderground;
  var flags = FX_EV_SELF | (under ? FX_EV_UNDER : 0), feet = playerFeetSpatialZ();
  O.x = wx; O.y = wy;
  // A dash starts where dashUntil rose since the last tick; its trail follows.
  if (dashUntil > O.dash) {
    var v = Math.hypot(vel.x, vel.y);
    fxObsEmit(S, FX_CODE_DASH, pos.x, pos.y, fxDashZ(pos.x, pos.y, feet, air, under), v > 1e-9 ? vel.x / v : 0, v > 1e-9 ? vel.y / v : 0, 1, flags);
    fxAttachDashTrail(S);
  }
  O.dash = dashUntil;
  if (air) { O.air++; O.vz = jumpVelZ; }                        // every airborne tick
  else {
    if (O.air >= FX_LAND_TICKS) {
      var s = -O.vz / FX_LAND_VZ;
      fxObsEmit(S, FX_CODE_LAND, pos.x, pos.y, fxStepZ(pos.x, pos.y, feet), 0, 0, s < 0.4 ? 0.4 : s > 1.6 ? 1.6 : s, flags);
    }
    O.air = 0;
  }
  if (d > FX_STEP_JUMP) { O.acc = 0; return; }                  // a teleport or unstick push, not a stride
  if (air) return;                                              // only grounded travel strides
  O.acc += d;
  while (O.acc >= FX_STEP_STRIDE) {
    O.acc -= FX_STEP_STRIDE;
    var ux = dx / d, uy = dy / d, side = O.side * FX_STEP_SIDE, x = pos.x - uy * side, y = pos.y + ux * side;
    O.side = -O.side;
    fxObsEmit(S, FX_CODE_FOOTSTEP, x, y, fxStepZ(x, y, feet), ux, uy, 1, flags);
  }
}
// Enemies, companions and garrison allies within 240 u of the camera (in the
// 2D view: of the view's centre, out to its corners), the 24 nearest (dead,
// stunned and dormant bodies skipped), at most 12 bursts a tick (the rest
// counted). Walkers step every 14 + 10 size u (wolves x 0.8); a hopping
// companion puffs where each hop lands: its bounce is |sin(phase)| x its
// height (19-companions-loot.js), so a hop lands whenever floor(phase / pi)
// rises between observed ticks (the S6 amendment: the gameplay squash test,
// z from above 0.5 to 0.5 or less, misses a hop whose phase steps over that
// window, about half of them while the slime follows a walking player).
function fxHopCount(b) { return Number.isFinite(b.phase) ? Math.floor(b.phase / Math.PI) : 0; }
function fxObserveNpcs(S, O) {
  var ox = ENDLESS_MODE ? windowOriginX : 0, oy = ENDLESS_MODE ? windowOriginY : 0, now = gameTimeNow(), bursts = 0;
  var hw = canvas.width / 2, hh = canvas.height / 2, cx = MODE3D ? cam.x : viewCam.x + hw, cy = MODE3D ? cam.y : viewCam.y + hh;
  var radius = MODE3D ? FX_NPC_RADIUS : Math.max(FX_NPC_RADIUS, Math.sqrt(hw * hw + hh * hh) + FX_VIEW2D_MARGIN);
  O.n = 0;
  fxObsNearest(O, typeof enemies !== 'undefined' ? enemies : null, 0, now, cx, cy, radius);
  fxObsNearest(O, typeof companions !== 'undefined' ? companions : null, 1, now, cx, cy, radius);
  fxObsNearest(O, typeof fortressAllies !== 'undefined' ? fortressAllies : null, 0, now, cx, cy, radius);
  for (var j = 0; j < O.n; j++) {
    var b = O.ref[j], st = O.npc.get(b), wx = b.x + ox, wy = b.y + oy;
    O.ref[j] = null;
    if (!st) { st = new Float64Array(6); st[4] = -2; O.npc.set(b, st); }
    var fresh = st[4] !== S.tick - 1, hops = O.hop[j] ? fxHopCount(b) : 0;
    st[4] = S.tick;
    if (fresh) { st[0] = wx; st[1] = wy; st[2] = 0; st[3] = 1; st[5] = hops; continue; }
    var dx = wx - st[0], dy = wy - st[1], d = Math.sqrt(dx * dx + dy * dy), ux = d > 1e-9 ? dx / d : 0, uy = d > 1e-9 ? dy / d : 0;
    st[0] = wx; st[1] = wy;
    if (O.hop[j]) {
      var landed = hops > st[5];
      st[5] = hops;
      if (!landed) continue;
      if (bursts < FX_NPC_BURSTS) { bursts++; fxObsBodyStep(S, b, b.x, b.y, ux, uy); } else S.stats.obsNpcCapped++;
      continue;
    }
    if (d > FX_STEP_JUMP) { st[2] = 0; continue; }
    st[2] += d;
    var stride = fxNpcStride(b);
    while (st[2] >= stride) {
      st[2] -= stride;
      var side = st[3] * FX_STEP_SIDE;
      st[3] = -st[3];
      if (bursts >= FX_NPC_BURSTS) { S.stats.obsNpcCapped++; continue; }
      bursts++;
      fxObsBodyStep(S, b, b.x - uy * side, b.y + ux * side, ux, uy);
    }
  }
}
// Keeps the FX_NPC_BODIES candidates nearest (cx, cy) within radius, sorted
// by distance (ties in list order), with no allocation.
function fxObsNearest(O, list, hop, now, cx, cy, radius) {
  if (!list) return;
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    if (!b || typeof b.health === 'number' && !(b.health > 0) || now < (b.stunUntil || 0) || b.npc && b.npc.state === 'dormant') continue;
    var d = Math.hypot(b.x - cx, b.y - cy), n = O.n;
    if (!(d <= radius) || n === FX_NPC_BODIES && d >= O.d[n - 1]) continue;
    for (var j = n < FX_NPC_BODIES ? O.n++ : n - 1; j > 0 && O.d[j - 1] > d; j--) { O.d[j] = O.d[j - 1]; O.ref[j] = O.ref[j - 1]; O.hop[j] = O.hop[j - 1]; }
    O.d[j] = d; O.ref[j] = b; O.hop[j] = hop;
  }
}
function fxNpcStride(b) {
  var t = b.enemyType, s = 14 + 10 * ((t && t.size) || 1);
  return t && t.id === 'wolf' ? s * 0.8 : s;
}
// A body's footstep at (x, y): on the support of its own stratum there.
function fxObsBodyStep(S, b, x, y, ux, uy) {
  var feet = entityFeetSpatialZ(b), under = fxUnderAt(b.x, b.y, feet);
  fxObsEmit(S, FX_CODE_FOOTSTEP, x, y, fxStepZ(x, y, feet), ux, uy, 1, under ? FX_EV_UNDER : 0);
}
// A step's support at (x, y) on the stepping body's own stratum: of the
// walkable layers there (each exact on its slope) and the top of a grid wall
// standing there (the player lands and walks on wall tops, 09-physics.js;
// not a wall cell a cave runs under, which the surface walks over), the one
// nearest the feet, if it is within a step of them (1 H, the walk step-up:
// grounded feet ease onto a layer that far away); else the feet (a foot
// beside a wall top's edge, no mesh). No allocation.
function fxStepZ(x, y, feet) {
  if (!Number.isFinite(feet)) return feet;
  var m = floorMesh, z = NaN, best = FX_STEP_REACH;
  if (grid && cell) {
    var wx = Math.floor(x / cell), wy = Math.floor(y / cell), wi = wy * gridW + wx;
    if (wx >= 0 && wy >= 0 && wx < gridW && wy < gridH && grid[wi] && !(gridCave && gridCave[wi])) {
      var top = fxWallTopZ(wi, wx, wy);
      if (Math.abs(top - feet) <= best) { best = Math.abs(top - feet); z = top; }
    }
  }
  if (m && m.layerCount) {
    var gs = m.gridSize, gx = Math.floor(x / gs), gy = Math.floor(y / gs);
    if (gx >= 0 && gy >= 0 && gx < m.w && gy < m.h) {
      var ci = gy * m.w + gx;
      for (var k = 0; k < m.layerCount[ci]; k++) {
        var type = m[SPATIAL_LAYER_TYPE_KEYS[k]][ci];
        if (type !== 1 && type !== 3 && type !== 4 || !Number.isFinite(m[SPATIAL_LAYER_TOP_KEYS[k]][ci])) continue;
        var h = fxLayerZ(m, ci, k, x, y);
        if (Math.abs(h - feet) < best) { best = Math.abs(h - feet); z = h; }
      }
    }
  }
  return z === z ? z : feet;
}
// The ground a dash kicks its dust up from (the S6 fix): a grounded player's
// step support (fxStepZ); an airborne player's support at or below the feet
// in the player's stratum (fxSupportBelow), if it is within a step (1 H) of
// them. Else NaN: no ground contact (a dash at the top of a jump, or off a
// ledge), and fxBurst refuses the dash burst, its screen puffs and that
// tick's trail puffs, counted as refused.noSupport.
function fxDashZ(x, y, feet, air, under) {
  if (!air) return fxStepZ(x, y, feet);
  var z = fxSupportBelow(x, y, feet, under);
  return feet - z <= FX_STEP_REACH ? z : NaN;
}
// The highest support at or below feet (spatial Z, 1 u tolerance) at (x, y):
// a walkable layer (exact on its slope) that no ceiling separates from the
// feet (fxFillGround's rule), and on the surface a grid wall's top (not a
// cave's wall cell, which the surface walks over; 09-physics.js); a fixed
// level with no mesh has its flat floor at 0. NaN where there is none. No
// allocation.
function fxSupportBelow(x, y, feet, under) {
  if (!Number.isFinite(feet)) return NaN;
  var m = floorMesh, top = feet + 1, best = -Infinity;
  if (!under && grid && cell) {
    var wx = Math.floor(x / cell), wy = Math.floor(y / cell), wi = wy * gridW + wx;
    if (wx >= 0 && wy >= 0 && wx < gridW && wy < gridH && grid[wi] && !(gridCave && gridCave[wi])) {
      var wt = fxWallTopZ(wi, wx, wy);
      if (wt <= top) best = wt;
    }
  }
  if (!m || !m.layerCount) { if (!ENDLESS_MODE && 0 <= top && best < 0) best = 0; }
  else {
    var gs = m.gridSize, gx = Math.floor(x / gs), gy = Math.floor(y / gs);
    if (gx >= 0 && gy >= 0 && gx < m.w && gy < m.h) {
      var ci = gy * m.w + gx, n = m.layerCount[ci];
      for (var k = 0; k < n; k++) {
        var type = m[SPATIAL_LAYER_TYPE_KEYS[k]][ci], h = m[SPATIAL_LAYER_TOP_KEYS[k]][ci];
        if (type !== 1 && type !== 3 && type !== 4 || !Number.isFinite(h) || fxCeilingBetween(m, ci, n, h, feet / 25)) continue;
        var z = fxLayerZ(m, ci, k, x, y);
        if (z <= top && z > best) best = z;
      }
    }
  }
  return best > -Infinity ? best : NaN;
}
// Whether feet (spatial Z) at (x, y) are under a roof: getCaveSpaceAt's rule
// (a ceiling, or a cap more than 1 H above the feet), with no allocation;
// fxUnderAtH takes the feet in mesh heights (H), as getCaveSpaceAt does.
function fxUnderAt(x, y, feet) { return fxUnderAtH(x, y, feet / 25); }
function fxUnderAtH(x, y, fh) {
  var m = floorMesh;
  if (!m || !m.layerCount || !Number.isFinite(fh)) return false;
  var gs = m.gridSize, gx = Math.floor(x / gs), gy = Math.floor(y / gs);
  if (gx < 0 || gy < 0 || gx >= m.w || gy >= m.h) return false;
  var ci = gy * m.w + gx;
  for (var k = 0; k < m.layerCount[ci]; k++) {
    var type = m[SPATIAL_LAYER_TYPE_KEYS[k]][ci], h = m[SPATIAL_LAYER_TOP_KEYS[k]][ci];
    if ((type === 2 || type === 4 && h > fh + 1.0) && h > fh + 0.001 && h < Infinity) return true;
  }
  return false;
}
// A frontSides wedge point's ground (section 5.7): the viewer's-stratum
// support there (fxViewerSupport, the field rule), or on the surface the top
// of a grid wall standing there; NaN (refused, counted) where there is none.
function fxWedgeZ(S, x, y) {
  if (!S.viewUnder && grid && cell) {
    var wx = Math.floor(x / cell), wy = Math.floor(y / cell), wi = wy * gridW + wx;
    if (wx >= 0 && wy >= 0 && wx < gridW && wy < gridH && grid[wi] && !(gridCave && gridCave[wi])) {
      var top = fxWallTopZ(wi, wx, wy);
      if (top < Infinity) return top;
    }
  }
  return fxViewerSupport(S, x, y);
}
// The stepped surface's dust set (section 9.3): cave stone underground, else
// the biome of the chunk under the step in Endless (its floor's biome,
// 05-endless-world.js generateChunk), the level's terrain otherwise.
function fxSurfaceAt(S, x, y, under) {
  var P = S.C.PAL, b = terrain;
  if (under) return P.surfBiomes.length - 1;
  if (ENDLESS_MODE && typeof getBiomeAt === 'function') {
    var cs = CHUNK_SIZE, wx = x + windowOriginX, wy = y + windowOriginY;
    b = getBiomeAt((Math.floor(wx / cs) + 0.5) * cs, (Math.floor(wy / cs) + 0.5) * cs);
  }
  var i = P.surfBiomes.indexOf(b);
  return i < 0 ? fxBiomeIndex(S) : i;
}
// An observer's event runs through its bindings at once (the observers run
// after the queue's drain, inside the tick), from a private one-slot ring.
// z NaN: no ground under the event (fxDashZ); its bindings count their
// puffs as refused.noSupport (fxBurst).
function fxObsEmit(S, code, x, y, z, dx, dy, scale, flags) {
  var st = S.stats, ev = S.obsEv;
  if (!fxEventOpen(S, code)) { st.eventsGated++; return; }
  if (!Number.isFinite(x + y) || z === Infinity || z === -Infinity) { st.badEvents++; return; }
  fxRingClear(ev, 0);
  ev.type[0] = code; ev.x[0] = x; ev.y[0] = y; ev.z[0] = z; ev.dx[0] = dx; ev.dy[0] = dy; ev.scale[0] = scale; ev.flags[0] = flags;
  ev.surf[0] = fxSurfaceAt(S, x, y, flags & FX_EV_UNDER);
  st.eventsIn++;
  if (code === FX_CODE_DASH) st.obsDashes++; else if (code === FX_CODE_LAND) st.obsLands++;
  else if (flags & FX_EV_SELF) st.obsSteps++; else st.obsNpcSteps++;
  fxRunEvent(S, 0, ev);
}
// The dash trail: one anchor slot per dashTrail recipe until dashUntil (a
// new dash takes over its slot).
function fxAttachDashTrail(S) { fxAttachOwned(S, FX_ANCHOR_DASH, dashUntil); }
// The flame stream's embers (S8): one anchor slot per flameStream recipe
// while the beam is drawn; the resolver frees it when the stream stops.
function fxWatchFlame(S) {
  if (S.C.anchorRecipes[FX_ANCHOR_FLAME].length && gameTimeNow() - flameStreamLastTick <= 180) fxAttachOwned(S, FX_ANCHOR_FLAME, 0);
}
// One slot of anchor kind `code` per recipe of that anchor (its own slot kept,
// so its rate accumulator carries on), until `until` (0: the resolver ends it).
function fxAttachOwned(S, code, until) {
  var A = S.anchors, list = S.C.anchorRecipes[code];
  for (var q = 0; q < list.length; q++) {
    var r = list[q], k = -1;
    if (!S.gate[r]) continue;
    for (var a = 0; a < A.n && k < 0; a++) if (A.used[a] && A.kind[a] === code && A.rec[a] === r) k = a;
    if (k < 0) {
      if ((k = A.used.indexOf(0)) < 0) { S.stats.anchorsRefused++; continue; }
      A.used[k] = 1; A.live++; A.gen[k] = (A.gen[k] + 1) & 0xffffff; A.acc[k] = 0;
    }
    A.kind[k] = code; A.rec[k] = r; A.ref[k] = null; A.seg[k] = 0; A.rate[k] = S.R.anchorRate[r]; A.until[k] = until;
  }
}

// Torch anchors (section 4.3): every 0.25 s of sim time, and at once after a
// rebase, a reset or a rebuilt light list, the nearest torch lights (kind
// 'torch', never cave-mouth lights) within the recipe radius in 3D and on the
// viewer's own floor: flame height -40..260 u from the feet, which keeps cave
// torches under a surface player out. Each emits at its recipe rate x
// min(s, 1.5) x the distance keep.
function fxSelectTorches(S, lights, maxN, radius) {
  var T = S.torch, count = lights ? lights.length : 0, n = 0, i, j;
  var feet = playerFeetSpatialZ(), per = T.acc.length / FX_TORCH_SLOTS;
  for (i = 0; i < T.n; i++) { T.oldRef[i] = T.ref[i]; for (j = 0; j < per; j++) T.oldAcc[j * FX_TORCH_SLOTS + i] = T.acc[j * FX_TORCH_SLOTS + i]; }
  T.oldN = T.n;
  for (i = 0; i < count; i++) {
    var L = lights[i];
    if (!L || L.kind !== 'torch') continue;
    var dz = L.z - feet;
    if (!(dz >= -40 && dz <= 260)) continue;
    var d = Math.hypot(L.x - cam.x, L.y - cam.y, dz);
    if (!(d < radius) || n === maxN && d >= T.d[n - 1]) continue;
    for (j = n < maxN ? n++ : n - 1; j > 0 && T.d[j - 1] > d; j--) { T.d[j] = T.d[j - 1]; T.ref[j] = T.ref[j - 1]; }
    T.d[j] = d; T.ref[j] = L;
  }
  for (i = 0; i < n; i++) {
    var from = T.oldRef.indexOf(T.ref[i]);
    for (j = 0; j < per; j++) T.acc[j * FX_TORCH_SLOTS + i] = from >= 0 && from < T.oldN ? T.oldAcc[j * FX_TORCH_SLOTS + from] : 0;
  }
  for (i = n; i < FX_TORCH_SLOTS; i++) T.ref[i] = null;
  for (i = 0; i < T.oldN; i++) T.oldRef[i] = null;
  T.n = n; T.lights = lights; S.torchRefreshAt = S.simTime + 0.25;
}
function fxRunTorches(S, dt) {
  var list = S.C.anchorRecipes[FX_ANCHOR_TORCH], R = S.R, T = S.torch, ctx = _fxCtx, maxN = 0, radius = 0, q, k;
  var lights = typeof pointLights !== 'undefined' ? pointLights : null;
  if (!list.length) return;
  for (q = 0; q < list.length; q++) { maxN = Math.max(maxN, R.anchorMax[list[q]] || FX_TORCH_SLOTS); radius = Math.max(radius, R.anchorRadius[list[q]] || 220); }
  if (S.simTime >= S.torchRefreshAt || T.lights !== lights) fxSelectTorches(S, lights, Math.min(maxN, FX_TORCH_SLOTS), radius);
  for (q = 0; q < list.length; q++) {
    var r = list[q], n = Math.min(T.n, R.anchorMax[r] || FX_TORCH_SLOTS), rad = R.anchorRadius[r] || radius;
    // A recipe with no 2D form idles in the 2D view, as the field does (mode2D 'none').
    var idle = !S.gate[r] || !MODE3D && R.view2D[r] === FX_VIEW2D_NONE;
    for (k = 0; k < n; k++) {
      var a = q * FX_TORCH_SLOTS + k;
      if (idle || !(T.d[k] < rad) || !PARTICLE_ANCHORS.torch(S, T, k, ctx)) { T.acc[a] = 0; continue; }
      T.acc[a] += R.anchorRate[r] * Math.min(S.scale[R.cls[r]], 1.5) * fxKeep(R, r, Math.hypot(ctx.x - cam.x, ctx.y - cam.y)) * dt;
      var due = Math.floor(T.acc[a]);
      if (due <= 0) continue;
      T.acc[a] -= due;
      ctx.spec = R.colorSpec[r];
      S.stats.torchSpawned += fxBurst(S, r, due, R.place[r], ctx, true);
    }
  }
}

// ── Fields (section 4.7): a box centred ahead of the sim camera keeps the
// target population, the Particles setting. Members spawn over the viewer's
// own stratum, wrap at the box edge keeping their age and height above
// support, fade near it (drawn), and leave with the viewer's stratum. Refill
// per tick is min(deficit, ceil(T dt / life 1.25) + 1), turnover-correct at
// any step; a prewarm fills the target at once in its steady-state mix, with
// hash-staggered ages (ground-ended lives: hash-staggered heights).
function fxRunFields(S, dt) {
  var F = S.C.FIELDS;
  for (var f = 0; f < F.length; f++) fxRunField(S, F[f], S.fields[f], dt);
}
function fxRunField(S, F, st, dt) {
  if (F.weather) { fxRunWeather(S, F, st, dt); return; }
  var code = F.code, half = F.half, lim = 3 * half, c = Math.cos(cam.ang), s = Math.sin(cam.ang), R = S.R;
  var on = MODE3D || F.mode2D !== FX_MODE2D_NONE, under = S.viewUnder;
  var set = under ? F.underSet : _fxHas(F.biomeSet, terrain) ? F.biomeSet[terrain] : -1;
  st.cx = cam.x + c * F.bias; st.cy = cam.y + s * F.bias; st.half = st.hx = st.hy = half; st.fade = F.edgeFade * half; st.set = set; st.under = under;
  st.target = on && set >= 0 ? Math.floor(S.P) : 0;
  if (!on) st.prewarm = true;
  var live = 0, fl = S.flags;
  for (var i = 0; i < S.count;) {
    var f = fl[i];
    if (!(f & FX_FIELD) || S.owner[i] !== code || (f & FX_DYING)) { i++; continue; }
    if (!on || !!(f & FX_UNDER) !== under) { fxMarkDying(S, i); i++; continue; }   // 2D, or the viewer changed stratum
    var dx = S.x[i] - st.cx, dy = S.y[i] - st.cy;
    if (dx > half || dx < -half || dy > half || dy < -half) {
      // Beyond one box of the edge is a teleport or a new window: the member
      // leaves. A ground-ended life (a drip) leaves at the edge.
      if (dx > lim || dx < -lim || dy > lim || dy < -lim || R.untilGround[S.rec[i]] ||
          !fxFieldWrap(S, i, dx > half ? -2 * half : dx < -half ? 2 * half : 0, dy > half ? -2 * half : dy < -half ? 2 * half : 0)) {
        fxKill(S, i); S.stats.fieldDropped++; continue;
      }
    }
    live++; i++;
  }
  if (live > st.target) { fxDyingOldest(S, -1, live - st.target, code); live = st.target; }
  st.live = live;
  var list = set >= 0 ? F.sets[set] : null, want = st.target - live, pre = S.prewarm || st.prewarm, open = false;
  if (!on || !list) return;
  for (var k = 0; k < list.r.length; k++) if (S.gate[list.r[k]]) open = true;
  if (!open) return;                                    // Legacy mode: the members are gated off
  st.prewarm = false;
  if (want <= 0) return;
  if (!pre) want = Math.min(want, Math.ceil(st.target * dt / list.life * 1.25) + 1);
  for (var tries = 0, got = 0; got < want && tries < 2 * want && S.spawnLeft > 0; tries++) got += fxFieldSpawn(S, F, st, list, pre);
  st.live = live + got;
}
// Wraps member i by (ox, oy): same age, same height above its support, the
// ground cache invalid and no back-projection this frame. False when the new
// column has no support in the viewer's stratum.
function fxFieldWrap(S, i, ox, oy) {
  var g = fxGroundZ(S, i, S.x[i], S.y[i]), x = S.x[i] + ox, y = S.y[i] + oy, h = fxViewerSupport(S, x, y);
  if (g !== g || h !== h) return false;
  var z = h + (S.z[i] - g);
  if (S.viewUnder && !(z < getCaveSpaceAt(x, y, h / 25).ceilingH * 25 - 1)) return false;   // under a lower roof there
  S.x[i] = x; S.y[i] = y; S.z[i] = z;
  S.gcell[i] = -1; S.flags[i] |= FX_SNAP; S.stats.fieldWraps++;
  return true;
}
// Spawn support 'viewer' (section 3.5): in the column's cell, the walkable
// layer nearest the viewer's feet, exact on its support triangle; NaN (the
// column is resampled) when that layer is in the other stratum, or, for an
// underground viewer, more than 1.5 H from the feet (another cave level).
function fxViewerSupport(S, x, y) {
  var m = floorMesh;
  if (!m || !m.layerCount) return ENDLESS_MODE ? NaN : 0;
  var gs = m.gridSize, gx = Math.floor(x / gs), gy = Math.floor(y / gs);
  if (gx < 0 || gy < 0 || gx >= m.w || gy >= m.h) return NaN;
  var ci = gy * m.w + gx, feet = S.feetH, li = -1, best = Infinity;
  for (var k = 0; k < m.layerCount[ci]; k++) {
    var type = m[SPATIAL_LAYER_TYPE_KEYS[k]][ci], h = m[SPATIAL_LAYER_TOP_KEYS[k]][ci];
    if ((type !== 1 && type !== 3 && type !== 4) || !Number.isFinite(h)) continue;
    var d = h > feet ? h - feet : feet - h;
    if (d < best) { best = d; li = k; }
  }
  if (li < 0) return NaN;
  if (fxUnderAtH(x, y, m[SPATIAL_LAYER_TOP_KEYS[li]][ci]) !== S.viewUnder) return NaN;   // getCaveSpaceAt's rule, no allocation
  if (S.viewUnder && best > 1.5) return NaN;
  return fxLayerZ(m, ci, li, x, y);
}
// One field member: up to 4 columns in the box, a member of the set drawn by
// weight (a hidden member's weight goes to the first shown one, so the count
// is unchanged), then one spawn. Returns 1 if it spawned. Noise keys: base x 9
// + 0..7 the columns' x and y, + 8 the member, so the member never depends on
// where a column landed.
function fxFieldSpawn(S, F, st, list, pre) {
  var base = S.fieldSerial, salt = F.salt ^ S.seed, x = 0, y = 0, h = NaN, ctx = _fxCtx;
  S.fieldSerial = (base + 1) >>> 0;
  for (var a = 0; a < 4 && h !== h; a++) {
    x = st.cx + (2 * effectNoise(salt, base * 9 + 2 * a) - 1) * F.half;
    y = st.cy + (2 * effectNoise(salt, base * 9 + 2 * a + 1) - 1) * F.half;
    h = fxViewerSupport(S, x, y);
  }
  if (h !== h) { S.stats.refusedNoSupport++; return 0; }
  var r = fxFieldMember(S, list, effectNoise(salt, base * 9 + 8), pre);
  if (r < 0) return 0;
  fxCtxReset(ctx);
  ctx.x = x; ctx.y = y; ctx.z = h; ctx.flags = S.viewUnder ? FX_EV_UNDER : 0; ctx.spec = S.R.colorSpec[r];
  var serial = S.serial;
  S.serial = (serial + 1) >>> 0;
  var i = fxSpawn(S, r, serial, 0, 1, ctx);
  if (i < 0) { fxRefuse(S, r, i, 1); return 0; }
  S.spawnLeft--; S.flags[i] |= FX_FIELD; S.owner[i] = F.code; S.stats.fieldSpawned++;
  if (pre) {
    // A ground-ended life (a drip) starts at a hashed point of its fall at
    // age 0, since its life is a cap, not its length; others at a hashed age.
    // Nothing in a prewarmed field falls, splashes or fades in step.
    var u = effectNoise(S.seedA[i], 21);
    if (S.R.untilGround[r]) S.z[i] -= (S.z[i] - h) * 0.9 * u;
    else S.age[i] = S.life[i] * 0.95 * u;
  }
  return 1;
}
// Weighted member choice under the day/night and weather gates (section 4.7):
// night members need night > 0.35 and no weather above fireflySuppress, day
// members an outdoor ambient above 0.6; ceiling members (drips) multiply
// while raining. A prewarm draws by the steady-state share (weight x mean
// life), so a short-lived member is not over-represented at the start.
var _fxGate = {night:false, day:true, hideNight:false, rain:false};
function fxFieldHidden(list, k, g) {
  var v = list.vis[k];
  return v === FX_VIS_NIGHT ? !g.night || g.hideNight : v === FX_VIS_DAY && !g.day;
}
function fxFieldMember(S, list, u, pre) {
  var amb = typeof renderSurfaceAmbient === 'number' ? renderSurfaceAmbient : 0.9, wt = S.weather, g = _fxGate;
  g.night = (0.9 - amb) / 0.58 > 0.35; g.day = amb > 0.6;
  g.rain = wt.kind === FX_WEATHER_RAIN && wt.intensity > 0; g.hideNight = wt.intensity > FX_WEATHER_RULES.fireflySuppress;
  var n = list.r.length, W = pre ? list.steady : list.w, total = 0, moved = 0, first = -1, k;
  for (k = 0; k < n; k++) {
    var wk = W[k] * (g.rain && list.ceiling[k] ? FX_WEATHER_RULES.rainFedDrips : 1);
    total += wk;
    if (fxFieldHidden(list, k, g)) moved += wk;
    else if (first < 0 && wk > 0) first = k;
  }
  if (first < 0) return -1;
  var at = u * total, acc = 0;
  for (k = 0; k < n; k++) {
    if (fxFieldHidden(list, k, g)) continue;
    acc += W[k] * (g.rain && list.ceiling[k] ? FX_WEATHER_RULES.rainFedDrips : 1) + (k === first ? moved : 0);
    if (at < acc) return list.r[k];
  }
  return list.r[first];
}

// ── Weather (section 9.1): the schedule, then the weather field ───────────
// The schedule is sim-owned, keyed on the state's seed and its accumulated
// sim seconds (S.simTime), never the game clock or the tick count, so the
// studio's 120 Hz reaches the same weather as 60 Hz at the same sim time.
// Front k lasts lerp(120, 300 s) of draw 8k; it is active in the current
// biome when draw 8k+1 is under the biome's chance, at intensity
// lerp(0.35, 1) of draw 8k+2, with wind at angle 2 pi draw 8k+3 and speed
// lerp(4, 30) of draw 8k+4 (every front blows; the Weather switch off is
// calm). When a kind's goal changes (a front end, split exactly; a biome
// change, at the tick it is seen) its level eases linearly from where it is
// to the new goal over crossfadeSeconds, so a front and a biome change
// crossfade the kinds in 8 s whatever the step; the wind eases from the
// last front's over windEaseSeconds. A new mode (the Weather switch, a dev
// force) or a fresh state starts at its goals and prewarms the field.
// Visibility is 1 - smoothstep(0.5, 1, renderCameraCaveBlend).
function fxWeatherFront(S, W, k) {
  var rules = FX_WEATHER_RULES, salt = (S.seed ^ FX_WEATHER_SALT) | 0, fs = rules.frontSeconds, ws = rules.windSpeed, iv = rules.intensity;
  if (k > 0) { W.start = W.end; W.wx0 = W.wx1; W.wy0 = W.wy1; } else W.start = 0;
  W.front = k;
  W.end = W.start + fs[0] + (fs[1] - fs[0]) * effectNoise(salt, 8 * k);
  W.roll = effectNoise(salt, 8 * k + 1);
  W.frontI = iv[0] + (iv[1] - iv[0]) * effectNoise(salt, 8 * k + 2);
  var a = 2 * Math.PI * effectNoise(salt, 8 * k + 3), sp = ws[0] + (ws[1] - ws[0]) * effectNoise(salt, 8 * k + 4);
  W.wx1 = Math.cos(a) * sp; W.wy1 = Math.sin(a) * sp;
  if (k === 0) { W.wx0 = W.wx1; W.wy0 = W.wy1; }
}
// Each kind's goal level under `mode` in the current biome (terrain): clear;
// a forced kind (at 1, or the dev force's intensity); the biome's kind at
// the dev force's intensity; or auto: the front's intensity for the biome's
// kind when its roll is under the biome's chance, except in Cave Test.
function fxWeatherGoal(S, W, mode) {
  var G = W.goal, b = terrain;
  G[0] = G[1] = G[2] = 0;
  if (mode === FX_WM_CLEAR) return;
  if (mode >= 1 && mode <= 3) { G[mode - 1] = W.force !== FX_WF_NONE ? W.forceI : 1; return; }
  if (!_fxHas(FX_WEATHER.biomeKind, b)) return;
  if (mode === FX_WM_BIOME) G[FX_WEATHER.biomeKind[b]] = W.forceI;
  else if (!CAVE_TEST_MODE && W.roll < FX_WEATHER.biomeChance[b]) G[FX_WEATHER.biomeKind[b]] = W.frontI;
}
function fxUpdateWeather(S) {
  var W = S.weather, rules = FX_WEATHER_RULES, now = S.simTime, mode = S.weatherToggle, k;
  if (mode !== FX_WM_OFF && W.force !== FX_WF_NONE) mode = W.force;
  var cv = rules.caveVisibility, blend = typeof renderCameraCaveBlend === 'number' ? renderCameraCaveBlend : 0;
  var u = (blend - cv[0]) / (cv[1] - cv[0]);
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  W.visibility = 1 - u * u * (3 - 2 * u); W.snapped = false;
  if (!(now >= W.t && now < Infinity)) return;          // sim time runs forward and stays finite (updateEffects)
  if (mode === FX_WM_OFF) {                             // calm and clear; turning it on starts fresh
    W.level[0] = W.level[1] = W.level[2] = 0; W.kind = 0; W.intensity = 0; W.windX = W.windY = 0; W.mode = mode; W.t = now;
    return;
  }
  var modeI = W.force !== FX_WF_NONE ? W.forceI : 1, snap = W.fresh || W.mode !== mode || W.modeI !== modeI;
  var fade = rules.crossfadeSeconds, t = snap ? now : W.t, guard = 0;
  if (W.front < 0) fxWeatherFront(S, W, 0);
  W.mode = mode; W.modeI = modeI; W.fresh = false; W.snapped = snap;
  for (;;) {
    while (W.end <= t && guard++ < 64) fxWeatherFront(S, W, W.front + 1);
    var seg = now < W.end ? now : W.end, step = seg - t;
    if (!(step >= 0) || guard > 64) break;              // more fronts than a step can hold: never spins
    fxWeatherGoal(S, W, mode);
    for (k = 0; k < 3; k++) {
      var g = W.goal[k], v = W.level[k];
      if (snap) { W.level[k] = W.aim[k] = g; W.rate[k] = 0; continue; }
      if (g !== W.aim[k]) { W.aim[k] = g; W.rate[k] = (g > v ? g - v : v - g) / fade; }   // a new crossfade: 8 s from here
      var d = step * W.rate[k];
      W.level[k] = v < g ? (v + d < g ? v + d : g) : (v - d > g ? v - d : g);
    }
    if (seg >= now) break;
    t = seg;
  }
  while (W.end <= now && guard++ < 64) fxWeatherFront(S, W, W.front + 1);
  W.t = now;
  var e = (now - W.start) / rules.windEaseSeconds;
  e = e < 0 ? 0 : e > 1 ? 1 : e;
  W.windX = W.wx0 + (W.wx1 - W.wx0) * e; W.windY = W.wy0 + (W.wy1 - W.wy0) * e;
  var best = 0;
  for (k = 1; k < 3; k++) if (W.level[k] > W.level[best]) best = k;
  W.kind = best; W.intensity = W.level[best];
}
// The weather field: each kind's set keeps population x s x its level x
// visibility members over open-sky columns of the box ahead of the sim
// camera. In 2D the box is the view (1 u a pixel) plus the 2D margin, over
// which members fade and wrap, and the population is x twoDScale x the
// view's area over the authored 360 x 240 canvas (1 to FX_VIEW2D_AREA_CAP):
// the spec's count at the authored canvas, a sparser sky beyond 3 x its
// area (fullscreen) instead of a pool of thousands. A member leaving the
// box wraps to the far side at the same height above its column's open sky
// (a settled one leaves). The field runs in two passes: before the
// integrate pass it moves the box, counts and wraps its members and fades
// the excess (oldest first); after the tick's landings (fxRefillFields) it
// refills what the tick lost, so every tick ends at the population. The
// refill is an allowance of refillBoost x the turnover rate carried across
// ticks (at most one tick's plus one), so every step size refills at the
// same rate per second; a prewarm (the world's prime, a new weather mode,
// the return from 2D) fills at once, ground-ended lives at hashed points of
// their fall, and goes on next tick if the spawn cap cut it. Rain's snow
// line: fxWeatherSpawn. In 2D rain members leave and the rain set spawns
// its splashes over the view instead (fxWeatherSplashes2D).
function fxRunWeather(S, F, st, dt) {
  var W = S.weather, R = S.R, code = F.code, twoD = !MODE3D, view = twoD ? 2 : 3, pop = FX_WEATHER.population, k, i, q, area = 1;
  if (twoD) {
    var cw = canvas.width, ch = canvas.height;
    st.hx = cw / 2 + FX_VIEW2D_MARGIN; st.hy = ch / 2 + FX_VIEW2D_MARGIN; st.fade = FX_VIEW2D_MARGIN;
    st.cx = viewCam.x + cw / 2; st.cy = viewCam.y + ch / 2;
    area = cw * ch / (CANVAS_BASE_W * CANVAS_BASE_H);
    area = F.twoDScale * (area > FX_VIEW2D_AREA_CAP ? FX_VIEW2D_AREA_CAP : area > 1 ? area : 1);
  } else {
    st.hx = st.hy = F.half; st.fade = F.edgeFade * F.half;
    st.cx = cam.x + Math.cos(cam.ang) * F.bias; st.cy = cam.y + Math.sin(cam.ang) * F.bias;
  }
  var hx = st.hx, hy = st.hy, limX = 3 * hx, limY = 3 * hy;
  st.half = hx > hy ? hx : hy; st.under = false; st.set = W.intensity > 0 ? W.kind : -1;
  if (st.view !== view) { if (st.view) st.prewarm = true; st.view = view; }
  var T = st.targets, L = st.lives, scale = S.scale[0] * W.visibility * area, open = false;
  for (k = 0; k < 3; k++) {
    var list = F.sets[k], on = false;
    for (q = 0; q < list.r.length; q++) if (S.gate[list.r[q]]) on = true;
    open = open || on;
    T[k] = on ? Math.floor(pop[k] * scale * W.level[k] + 1e-9) : 0;
    L[k] = 0;
  }
  // Rain's swaps: at most snow's population at rain's level (every column above the line).
  T[FX_WEATHER_SWAP] = T[0] > 0 ? Math.floor(pop[1] * scale * W.level[0] + 1e-9) : 0; L[FX_WEATHER_SWAP] = 0;
  var fl = S.flags;
  for (i = 0; i < S.count;) {
    var f = fl[i], own = S.owner[i];
    if (!(f & FX_FIELD) || (own & 255) !== code || (f & FX_DYING)) { i++; continue; }
    if (twoD && R.mode2D[S.rec[i]] !== FX_MODE2D_SIM) { fxMarkDying(S, i); i++; continue; }   // rain drops leave the 2D view
    var dx = S.x[i] - st.cx, dy = S.y[i] - st.cy;
    if (dx > hx || dx < -hx || dy > hy || dy < -hy) {
      if ((f & FX_REST) || dx > limX || dx < -limX || dy > limY || dy < -limY ||
          !fxWeatherWrap(S, i, dx > hx ? -2 * hx : dx < -hx ? 2 * hx : 0, dy > hy ? -2 * hy : dy < -hy ? 2 * hy : 0)) {
        fxKill(S, i); S.stats.fieldDropped++; continue;
      }
    }
    L[own >> 8]++; i++;
  }
  for (k = 0; k < 4; k++) if (L[k] > T[k]) { fxDyingOldest(S, -1, L[k] - T[k], code | k << 8); L[k] = T[k]; }
  st.target = T[0] + T[1] + T[2]; st.live = L[0] + L[1] + L[2] + L[3];
  st.open = open; st.gone.fill(0);                    // members that die from here on are refilled after the tick's landings
  if (!open) { st.acc[0] = st.acc[1] = st.acc[2] = 0; st.swapV = 0; }
}
// After the tick's landings and splashes: every weather field refills what
// its sets lost since it counted them (fxKill counts them).
function fxRefillFields(S, dt) {
  var F = S.C.FIELDS;
  for (var f = 0; f < F.length; f++) if (F[f].weather) fxRefillWeather(S, F[f], S.fields[f], dt);
}
function fxRefillWeather(S, F, st, dt) {
  var W = S.weather, T = st.targets, L = st.lives, twoD = st.view === 2, k;
  for (k = 0; k < 4; k++) { L[k] -= st.gone[k]; st.live -= st.gone[k]; st.gone[k] = 0; }
  if (!st.open) return;
  var pre = S.prewarm || st.prewarm || W.snapped, cut = false;
  st.prewarm = false;
  st.swapV = pre ? 0 : st.swapV * Math.exp(-dt / F.sets[0].life);    // rain's virtual slots last one rain turnover
  for (k = 0; k < 3; k++) {
    var set = F.sets[k];
    if (!set.r.length) continue;
    var rate = T[k] * dt / set.life * FX_WEATHER_RULES.refillBoost, want = T[k] - L[k];
    if (twoD && set.splash >= 0) { fxWeatherSplashes2D(S, F, st, k, set, rate / FX_WEATHER_RULES.refillBoost); continue; }
    if (k === 0) want -= Math.round(st.swapV);
    if (pre) st.acc[k] = 0;
    else {
      var acc = st.acc[k] + rate;
      st.acc[k] = acc = acc > rate + 1 ? rate + 1 : acc;
      if (want > Math.floor(acc)) want = Math.floor(acc);
    }
    if (want <= 0) continue;
    for (var tries = 0, got = 0; got < want && tries < 2 * want && S.spawnLeft > 0; tries++) {
      if (S.count >= S.B) { S.stats.refusedBudget += want - got; break; }   // weather never steals: no column lookups for refusals
      got += fxWeatherSpawn(S, F, st, k, set, pre);
    }
    if (!pre) st.acc[k] -= got;
    else if (got < want && S.spawnLeft <= 0) cut = true;
  }
  if (cut) st.prewarm = true;
}
// One draw of kind set k: up to 4 columns of the box with open sky, a
// member of the set drawn by weight. Rain's per-drop snow line: over a
// column whose sky layer is at or above snowLineH, a rain draw takes a
// virtual rain slot for one rain turnover (so rain keeps its density over
// the valleys: the rain set holds T x the share of columns below the line)
// and spawns its snow swap (set 3) with the chance that gives the peaks
// forced snow's density (fxSwapChance). Noise keys as the ambient field's:
// the field serial x 9 + 0..7 the columns, + 8 the member; the swap chance
// on its own salt. Returns 1 when the draw used a slot (a member spawned or
// a virtual rain slot).
function fxWeatherSpawn(S, F, st, k, set, pre) {
  var serial = S.fieldSerial, key = F.salt ^ S.seed, x = 0, y = 0, z = NaN, R = S.R, sky = _fxSky, alt;
  S.fieldSerial = (serial + 1) >>> 0;
  for (var a = 0; a < 4 && z !== z; a++) {
    x = st.cx + (2 * effectNoise(key, serial * 9 + 2 * a) - 1) * st.hx;
    y = st.cy + (2 * effectNoise(key, serial * 9 + 2 * a + 1) - 1) * st.hy;
    z = fxSkyInto(x, y, sky);
  }
  if (z !== z) { S.stats.refusedNoSupport++; return 0; }
  var r = fxFieldMember(S, set, effectNoise(key, serial * 9 + 8), pre);
  if (r < 0) return 0;
  if ((alt = R.snowAlt[r]) >= 0 && sky.top >= FX_WEATHER_RULES.snowLineH * 25) {
    st.swapV++;
    if (st.lives[FX_WEATHER_SWAP] < st.targets[FX_WEATHER_SWAP] && effectNoise(key ^ FX_WEATHER_SWAP_SALT, serial) < fxSwapChance(S, set, alt, pre) &&
        fxWeatherMember(S, F, st, FX_WEATHER_SWAP, alt, x, y, z, pre)) S.stats.weatherSnowLine++;
    return 1;
  }
  return fxWeatherMember(S, F, st, k, r, x, y, z, pre);
}
// The chance that a rain draw above the snow line spawns its swap: snow's
// population share of rain's, x rain's turnover over the swap's own life
// span (its fall plus its rest), so the swaps hold forced snow's density
// over the peaks; a prewarm places the steady share at once.
function fxSwapChance(S, set, alt, pre) {
  var R = S.R, pop = FX_WEATHER.population, share = pop[0] > 0 ? pop[1] / pop[0] : 0;
  if (pre) return share;
  var span = R.meanLife[alt] + (R.collision[alt] === FX_MODE_REST ? (R.restMin[alt] + R.restMax[alt]) / 2 : 0);
  return share * set.life / span;
}
// Recipe r as a member of set k over the column (x, y), open sky at z (the
// column fxSkyInto just resolved into _fxSky, whose sky layer seeds the new
// particle's ground cache: its first collision needs no layer scan).
function fxWeatherMember(S, F, st, k, r, x, y, z, pre) {
  var ctx = _fxCtx, serial = S.serial, sky = _fxSky;
  fxCtxReset(ctx);
  ctx.x = x; ctx.y = y; ctx.z = z; ctx.sky = true; ctx.spec = S.R.colorSpec[r];
  S.serial = (serial + 1) >>> 0;
  var i = fxSpawn(S, r, serial, 0, 1, ctx);
  if (i < 0) { fxRefuse(S, r, i, 1); return 0; }
  S.spawnLeft--; S.flags[i] |= FX_FIELD; S.owner[i] = F.code | k << 8; S.stats.fieldSpawned++; S.stats.weatherSpawned++;
  st.lives[k]++; st.live++;
  if (sky.ci >= 0 && sky.x === S.x[i] && sky.y === S.y[i] && S.R.stratum[r] === FX_STRATUM_OPENSKY) {
    S.gcell[i] = sky.ci; S.g0[i] = sky.g[0]; S.g1[i] = sky.g[1]; S.g2[i] = sky.g[2]; S.g3[i] = sky.g[3];
  }
  if (pre) {
    var u = effectNoise(S.seedA[i], 21);
    if (S.R.untilGround[r]) S.z[i] -= (S.z[i] - z) * 0.9 * u; else S.age[i] = S.life[i] * 0.95 * u;
  }
  return 1;
}
// A wrapped member keeps its age and its height above the open sky of its
// column, moved to the far side of the box, with no back-projection this frame.
function fxWeatherWrap(S, i, ox, oy) {
  var x = S.x[i] + ox, y = S.y[i] + oy, g = fxSurfaceZ(S.x[i], S.y[i]), h = fxSurfaceZ(x, y);
  if (g !== g || h !== h) return false;
  S.z[i] = h + (S.z[i] - g); S.x[i] = x; S.y[i] = y;
  S.gcell[i] = -1; S.flags[i] |= FX_SNAP; S.stats.fieldWraps++;
  return true;
}
// 2D rain (mode2D splashOnly, section 5.8): no drops, only their splashes,
// scattered over the view at T / mean life per second (T already x
// twoDScale and the view's area); a point above the snow line spawns rain's
// snow swap with the 3D swap chance instead, while the swaps are under
// their cap. A splash that its recipe, class or budget cap would refuse is
// refused before its column is looked up.
function fxWeatherSplashes2D(S, F, st, k, set, perTick) {
  var acc = st.acc[k] + perTick, n = Math.floor(acc), R = S.R, ctx = _fxCtx, salt = F.salt ^ S.seed, sky = _fxSky;
  var w = canvas.width, h = canvas.height, line = FX_WEATHER_RULES.snowLineH * 25, alt = R.snowAlt[set.r[0]], sp = set.splash, c = R.cls[sp];
  var chance = alt >= 0 ? fxSwapChance(S, set, alt, false) : 0;
  st.acc[k] = acc - n;
  for (var j = 0; j < n && S.spawnLeft > 0; j++) {
    var base = S.fieldSerial;
    S.fieldSerial = (base + 1) >>> 0;
    var swap = alt >= 0 && st.lives[FX_WEATHER_SWAP] < st.targets[FX_WEATHER_SWAP] && effectNoise(salt ^ FX_WEATHER_SWAP_SALT, base) < chance;
    if (!swap) {
      if (S.recipeLive[sp] >= R.maxLive[sp] || S.classLive[c] - S.classDying[c] >= S.caps[c]) { S.stats.refusedCap++; continue; }
      if (S.count >= S.B) { S.stats.refusedBudget++; continue; }
    }
    var x = viewCam.x + effectNoise(salt, base * 9) * w, y = viewCam.y + effectNoise(salt, base * 9 + 1) * h, z = fxSkyInto(x, y, sky);
    if (z !== z) { S.stats.refusedNoSupport++; continue; }
    if (alt >= 0 && sky.top >= line) {
      if (swap && fxWeatherMember(S, F, st, FX_WEATHER_SWAP, alt, x, y, z, false)) S.stats.weatherSnowLine++;
      continue;
    }
    fxCtxReset(ctx);
    ctx.x = x; ctx.y = y; ctx.z = z; ctx.spec = R.colorSpec[sp];
    S.stats.weatherSplashes2D += fxBurst(S, sp, 1, FX_PLACE_SOURCE, ctx, true);
  }
}
// Console and fxBench: force 'rain' | 'snow' | 'ash' at intensity (0..1,
// default 1), 'biome' (the biome's kind, active at intensity), 'clear', or
// null (back to the Weather switch) on the live state. Kept across world
// resets; the Weather switch off still turns weather off. Throws on a bad
// value (console use); returns effectWeatherState().
var FX_WEATHER_MODE_NAMES = {'-2':'off', '-1':'clear', 0:'auto', 1:'rain', 2:'snow', 3:'ash', 4:'biome'};
function fxWeatherForceCode(kind) {
  if (kind === null || kind === undefined) return FX_WF_NONE;
  if (kind === 'clear') return FX_WM_CLEAR;
  if (kind === 'biome') return FX_WM_BIOME;
  var k = FX_ENUMS.weatherKind.indexOf(kind);
  return k >= 0 ? k + 1 : NaN;
}
function effectWeatherForce(kind, intensity) {
  var code = fxWeatherForceCode(kind), v = intensity === undefined ? 1 : Number(intensity);
  if (code !== code) throw new Error('effect weather: kind must be rain, snow, ash, biome, clear or null');
  if (!(v >= 0 && v <= 1)) throw new Error('effect weather: intensity must be 0..1');
  fxState.weather.force = code; fxState.weather.forceI = v;
  return effectWeatherState();
}
function effectWeatherState() {
  var W = typeof fxState === 'object' && fxState && fxState.weather;
  if (!W) return null;
  return {mode:FX_WEATHER_MODE_NAMES[W.mode] || 'off', kind:W.intensity > 0 ? FX_ENUMS.weatherKind[W.kind] : null, intensity:W.intensity,
    target:W.goal[W.kind], levels:{rain:W.level[0], snow:W.level[1], ash:W.level[2]}, front:W.front, frontStart:W.start, frontEnd:W.end,
    windX:W.windX, windY:W.windY, visibility:W.visibility, force:W.force === FX_WF_NONE ? null : FX_WEATHER_MODE_NAMES[W.force]};
}

// ── Hot loop ───────────────────────────────────────────────────────────────
// Exact per-step integration of dv/dt = drag (wind target - v) - gravity, so
// 60 Hz and the studio's 120 Hz follow the same analytic path. Factors are
// cached per recipe and recomputed only when dt changes.
function fxDragFactors(S, dt) {
  if (S.KDdt === dt) return;
  var R = S.R, n = S.C.count;
  for (var r = 0; r < n; r++) {
    var D = R.dragCoef[r], g = R.gravity[r], K = Math.exp(-D * dt), F = D > 0 ? (1 - K) / D : dt;
    S.KD[r] = K; S.KF[r] = F;
    S.KGV[r] = D > 0 ? g * (1 - K) / D : g * dt;
    S.KGX[r] = D > 0 ? g * (dt - F) / D : 0.5 * g * dt * dt;
  }
  S.KDdt = dt;
}
// SNAP (present the current state, no back-projection) lasts from the contact
// or field wrap that set it until the next tick starts; wraps run before the
// integrate pass, so the flag is cleared here, not per particle in it.
function fxClearSnap(S) {
  for (var i = 0, fl = S.flags, n = S.count; i < n; i++) fl[i] &= ~FX_SNAP;
}
function fxIntegrate(S, dt) {
  fxDragFactors(S, dt);
  var R = S.R, KD = S.KD, KF = S.KF, KGV = S.KGV, KGX = S.KGX, WR = R.wind, TA = R.turbAmp, TW = R.turbW, CO = R.collision;
  var x = S.x, y = S.y, z = S.z, vx = S.vx, vy = S.vy, vz = S.vz, age = S.age, life = S.life, rec = S.rec, fl = S.flags;
  var wx = S.weather.windX, wy = S.weather.windY, i = 0;
  while (i < S.count) {
    var r = rec[i], a = age[i] + dt, f = fl[i];
    if (a >= life[i]) { fxKill(S, i); continue; }                      // slot i now holds an unvisited particle
    age[i] = a;
    if (f & FX_REST) { i++; continue; }                                // resting: only ages and fades
    var k = KD[r], ff = KF[r], w = (f & (FX_EYE | FX_SCREEN)) ? 0 : WR[r], ux = wx * w, uy = wy * w;
    var ovx = vx[i], ovy = vy[i], ovz = vz[i], oz = z[i];
    var px = x[i] + ux * dt + (ovx - ux) * ff, py = y[i] + uy * dt + (ovy - uy) * ff, pz = oz + ovz * ff - KGX[r];
    vx[i] = ux + (ovx - ux) * k; vy[i] = uy + (ovy - uy) * k; vz[i] = ovz * k - KGV[r];
    var ta = TA[r];
    if (ta > 0) { var ph = S.phase[i] + a * TW[r]; px += Math.cos(ph) * ta * dt; py += Math.sin(ph * 1.3) * ta * dt; }
    S.rot[i] += S.spin[i] * dt;
    x[i] = px; y[i] = py; z[i] = pz;
    if ((CO[r] !== FX_MODE_NONE || R.wall[r]) && !(f & (FX_EYE | FX_SCREEN)) && fxCollide(S, i, r, CO[r], px, py, pz, oz)) continue;  // died: slot refilled
    i++;
  }
}
function fxKill(S, i) {
  var last = --S.count, c = S.cls[i], fl = S.flags[i];
  S.classLive[c]--; S.recipeLive[S.rec[i]]--;
  if (fl & FX_DYING) S.classDying[c]--;
  else if (fl & FX_FIELD) { var o = S.owner[i], fs = S.fields[o & 255]; if (fs) fs.gone[(o >> 8) & 3]++; }   // a counted field member
  S.stats.killed++;
  if (i === last) return;
  S.x[i] = S.x[last]; S.y[i] = S.y[last]; S.z[i] = S.z[last];
  S.vx[i] = S.vx[last]; S.vy[i] = S.vy[last]; S.vz[i] = S.vz[last];
  S.age[i] = S.age[last]; S.life[i] = S.life[last]; S.size[i] = S.size[last]; S.alpha[i] = S.alpha[last];
  S.rot[i] = S.rot[last]; S.spin[i] = S.spin[last]; S.phase[i] = S.phase[last];
  S.g0[i] = S.g0[last]; S.g1[i] = S.g1[last]; S.g2[i] = S.g2[last]; S.g3[i] = S.g3[last];
  S.gcell[i] = S.gcell[last]; S.owner[i] = S.owner[last]; S.seedA[i] = S.seedA[last]; S.rec[i] = S.rec[last];
  S.pal[i] = S.pal[last]; S.flags[i] = S.flags[last]; S.bounces[i] = S.bounces[last]; S.cls[i] = S.cls[last];
}

// ── Collision, strata and the exact ground cache (section 3.5) ────────────
var _fxCorners = new Float64Array(4);
function fxGroundZ(S, i, x, y) {
  var m = floorMesh;
  if (!m || !m.layerCount) return ENDLESS_MODE ? NaN : 0;     // authored flat fixed levels
  var gs = m.gridSize, gx = Math.floor(x / gs), gy = Math.floor(y / gs);
  if (gx < 0 || gy < 0 || gx >= m.w || gy >= m.h) return NaN;
  var ci = gy * m.w + gx;
  if (S.gcell[i] !== ci && !fxFillGround(S, i, m, ci)) return NaN;
  var tx = x / gs - gx, ty = y / gs - gy, c0 = S.g0[i];
  return tx >= ty ? c0 + tx * (S.g1[i] - c0) + ty * (S.g3[i] - S.g1[i])    // the 0->3 split of sampleSpatialSupportZ
                  : c0 + ty * (S.g2[i] - c0) + tx * (S.g3[i] - S.g2[i]);
}
// Miss path only (cell change or mesh swap). reference: the highest walkable
// layer at or below the particle that no ceiling separates from it (the
// player's own rule), else the nearest; surface: the highest walkable;
// openSky: the column's sky layer (fxSkyLayer).
function fxFillGround(S, i, m, ci) {
  var stratum = S.R.stratum[S.rec[i]], reference = stratum === FX_STRATUM_REFERENCE, ref = S.z[i] / 25, n = m.layerCount[ci];
  var sky = stratum === FX_STRATUM_OPENSKY, li = sky ? fxSkyLayer(m, ci) : -1, best = -Infinity, near = -1, nearD = Infinity;
  for (var k = 0; k < n && !sky; k++) {
    var type = m[SPATIAL_LAYER_TYPE_KEYS[k]][ci], h = m[SPATIAL_LAYER_TOP_KEYS[k]][ci];
    if ((type !== 1 && type !== 3 && type !== 4) || !Number.isFinite(h)) continue;
    if (!reference) { if (h > best) { best = h; li = k; } continue; }
    var d = Math.abs(h - ref);
    if (d < nearD) { nearD = d; near = k; }
    if (h > ref + 0.04 || h <= best) continue;                // support at or below the particle (1 u)
    if (fxCeilingBetween(m, ci, n, h, ref)) continue;
    best = h; li = k;
  }
  if (li < 0) li = near;
  if (li < 0) return false;
  if (!spatialLayerCornersInto(m, ci, li, _fxCorners)) {         // last row/column or stratum edge: flat
    S.g0[i] = S.g1[i] = S.g2[i] = S.g3[i] = m[SPATIAL_LAYER_TOP_KEYS[li]][ci] * 25;
  } else { S.g0[i] = _fxCorners[0] * 25; S.g1[i] = _fxCorners[1] * 25; S.g2[i] = _fxCorners[2] * 25; S.g3[i] = _fxCorners[3] * 25; }
  S.gcell[i] = ci; S.stats.groundMiss++;
  return true;
}
function fxCeilingBetween(m, ci, n, lo, hi) {
  for (var k = 0; k < n; k++) if (m[SPATIAL_LAYER_TYPE_KEYS[k]][ci] === 2) {
    var c = m[SPATIAL_LAYER_TOP_KEYS[k]][ci];
    if (c > lo + 0.001 && c <= hi + 0.001) return true;
  }
  return false;
}
// Grid wall tops (spatial Z) for collision.wall and open-sky spawns: one
// spatialWallSpan per wall cell per geometry (grid, mesh or wall arrays
// replaced), not one per particle tick. Infinity: a wall cell with no span.
var _fxWallTop = null, _fxWallKey = [];
function fxWallTopZ(ci, gx, gy) {
  var t = _fxWallTop, key = _fxWallKey;
  if (!t || t.length !== grid.length || key[0] !== grid || key[1] !== floorMesh || key[2] !== wallHeights ||
      key[3] !== wallFaceBase || key[4] !== wallMaxTopZ) {
    if (!t || t.length !== grid.length) t = _fxWallTop = new Float64Array(grid.length);
    t.fill(NaN);
    key[0] = grid; key[1] = floorMesh; key[2] = wallHeights; key[3] = wallFaceBase; key[4] = wallMaxTopZ;
  }
  var v = t[ci];
  if (v !== v) { var span = spatialWallSpan(gx, gy); v = t[ci] = span ? span.topZ : Infinity; }
  return v;
}
// The open sky of a mesh cell (weather): its highest layer, walkable or a
// cave ceiling. A walkable cap tops a roofed Endless cave; a classic level's
// deep cave has a floor and a ceiling but no walkable cap (03-level-
// generation.js), so its ceiling is the rock roof that ends the sky there.
function fxSkyLayer(m, ci) {
  var li = -1, best = -Infinity;
  for (var k = 0; k < m.layerCount[ci]; k++) {
    var type = m[SPATIAL_LAYER_TYPE_KEYS[k]][ci], h = m[SPATIAL_LAYER_TOP_KEYS[k]][ci];
    if (type >= 1 && type <= 4 && Number.isFinite(h) && h > best) { best = h; li = k; }
  }
  return li;
}
// Open-sky support at (x, y), spatial Z (weather spawns, wraps and 2D
// splashes): the column's sky layer, exact on its slope, or a grid wall's
// top where that is higher (a wall under a roof ends at the roof); NaN off
// the mesh or with no layer. A cave's wall cell is not a wall to the
// surface (the surface walks over it, 09-physics.js), so it takes the
// layers only. Into out: the point, the sky layer's height there (top:
// the snow line compares it, never a wall top), and its cell and corners
// x 25 (ci -1 without one), which seed a new member's ground cache.
var _fxSky = {x:NaN, y:NaN, top:NaN, ci:-1, g:new Float64Array(4)};
function fxSkyInto(x, y, out) {
  var m = floorMesh, top = NaN, g = out.g;
  out.x = x; out.y = y; out.ci = -1;
  if (!m || !m.layerCount) top = ENDLESS_MODE ? NaN : 0;               // authored flat fixed levels
  else {
    var gs = m.gridSize, gx = Math.floor(x / gs), gy = Math.floor(y / gs), ci = gy * m.w + gx, li;
    if (gx >= 0 && gy >= 0 && gx < m.w && gy < m.h && (li = fxSkyLayer(m, ci)) >= 0) {
      if (!spatialLayerCornersInto(m, ci, li, g)) g[0] = g[1] = g[2] = g[3] = m[SPATIAL_LAYER_TOP_KEYS[li]][ci];   // flat
      g[0] *= 25; g[1] *= 25; g[2] *= 25; g[3] *= 25;
      var tx = x / gs - gx, ty = y / gs - gy;                            // the 0->3 split of sampleSpatialSupportZ
      top = tx >= ty ? g[0] + tx * (g[1] - g[0]) + ty * (g[3] - g[1]) : g[0] + ty * (g[2] - g[0]) + tx * (g[3] - g[2]);
      out.ci = ci;
    }
  }
  out.top = top;
  if (grid && cell) {
    var wx = Math.floor(x / cell), wy = Math.floor(y / cell), wi = wy * gridW + wx;
    if (wx >= 0 && wy >= 0 && wx < gridW && wy < gridH && grid[wi] && !(gridCave && gridCave[wi])) {
      var wt = fxWallTopZ(wi, wx, wy);
      if (wt < Infinity && !(top >= wt)) return wt;
    }
  }
  return top;
}
function fxSurfaceZ(x, y) { return fxSkyInto(x, y, _fxSky); }
// Layer li of cell ci at (x, y), spatial Z: its exact support triangle, or
// its flat top where no triangle exists (last row/column, stratum edge).
function fxLayerZ(m, ci, li, x, y) {
  var gs = m.gridSize, tx = x / gs - (ci % m.w), ty = y / gs - Math.floor(ci / m.w), c = _fxCorners;
  if (!spatialLayerCornersInto(m, ci, li, c)) return m[SPATIAL_LAYER_TOP_KEYS[li]][ci] * 25;
  return 25 * (tx >= ty ? c[0] + tx * (c[1] - c[0]) + ty * (c[3] - c[1]) : c[0] + ty * (c[2] - c[0]) + tx * (c[3] - c[2]));
}
// Floor response per collision code; every contact sets SNAP so presentation
// never back-projects through the surface just hit. Returns true if died.
function fxCollide(S, i, r, mode, px, py, pz, oz) {
  var R = S.R;
  if (R.wall[r] && grid && cell) {
    var wx = Math.floor(px / cell), wy = Math.floor(py / cell), wi = wy * gridW + wx;
    // Open-sky particles (weather) cross a cave's wall cells to the surface
    // over them, as fxSurfaceZ does.
    if (wx >= 0 && wy >= 0 && wx < gridW && wy < gridH && grid[wi] &&
        !(R.stratum[r] === FX_STRATUM_OPENSKY && gridCave && gridCave[wi])) {
      var top = fxWallTopZ(wi, wx, wy);
      if (pz < top) {
        if (oz >= top && mode === FX_MODE_REST) {                // settles on the wall top (snow, ash)
          S.z[i] = top + 0.3; S.vx[i] = S.vy[i] = S.vz[i] = 0; S.flags[i] |= FX_REST | FX_SNAP;
          var settle = R.restMin[r] + (R.restMax[r] - R.restMin[r]) * effectNoise(S.seedA[i], 19);
          if (S.life[i] > S.age[i] + settle) S.life[i] = S.age[i] + settle;
          return false;
        }
        if (oz >= top) fxQueueChild(S, i, r, px, py, top);   // fell onto the wall top
        fxKill(S, i);
        return true;
      }
    }
  }
  if (mode === FX_MODE_NONE) return false;
  var gz = fxGroundZ(S, i, px, py), gc = gz, stick = R.prim[r] === FX_PRIM_SEGMENT;
  if (gz !== gz) { fxKill(S, i); return true; }                 // off the mesh or not loaded
  if (stick) gz = fxStickSupport(S, i, r, px, py, gc);           // a stick touches with its lower end
  if (mode === FX_MODE_CLAMP) {
    if (pz < gz + 0.5) { S.z[i] = gz + 0.5; if (S.vz[i] < 0) S.vz[i] = 0; S.flags[i] |= FX_SNAP; }
    return false;
  }
  if (pz > gz) return false;
  // An open-sky particle that drifted sideways into a higher column (a
  // cliff, the edge of a cave roof) ends against it: it never climbs on top.
  if (oz < gz - 1 && R.stratum[r] === FX_STRATUM_OPENSKY) { fxKill(S, i); return true; }
  if (mode === FX_MODE_KILL) { fxQueueChild(S, i, r, px, py, gz); fxKill(S, i); return true; }
  // A tumbling stick's end swung into the support while it rises: lift only.
  if (stick && S.vz[i] > 0) { S.z[i] = gz + 0.05; S.flags[i] |= FX_SNAP; return false; }
  if (mode === FX_MODE_BOUNCE && S.bounces[i] > 0) {
    var up = -S.vz[i] * R.restitution[r];
    if (up >= 8) {
      S.z[i] = gz + 0.05; S.vz[i] = up; S.vx[i] *= R.friction[r]; S.vy[i] *= R.friction[r];
      S.bounces[i]--; S.flags[i] |= FX_SNAP;
      return false;
    }
  }
  // rest (or a spent bounce): lie on the support, then fade.
  S.z[i] = gz + 0.3; S.vx[i] = S.vy[i] = S.vz[i] = 0; S.flags[i] |= FX_REST | FX_SNAP;
  if (stick) fxStickRest(S, i, r, px, py, gc);
  var rest = R.restMin[r] + (R.restMax[r] - R.restMin[r]) * effectNoise(S.seedA[i], 19);
  if (S.life[i] > S.age[i] + rest) S.life[i] = S.age[i] + rest;
  return false;
}
// Sticks (primitive segment, e.g. bones) are drawn from their centre along
// azimuth phase, tumbled by rot, half length fxStickHalf: the ends are
// centre +- (cos(phase) cos(rot) hl, sin(phase) cos(rot) hl, sin(rot) hl).
function fxStickHalf(R, r, seedA) { return (R.len0[r] + (R.len1[r] - R.len0[r]) * effectNoise(seedA, 20)) / 2; }
// The centre height at which stick i, as posed, touches the support under
// its lower end, or under its centre (gc) if that is higher. An end off the
// mesh adds nothing (NaN compares false).
function fxStickSupport(S, i, r, px, py, gc) {
  var hl = fxStickHalf(S.R, r, S.seedA[i]), cr = Math.cos(S.rot[i]) * hl, ez = Math.sin(S.rot[i]) * hl;
  var ex = Math.cos(S.phase[i]) * cr, ey = Math.sin(S.phase[i]) * cr, g = gc;
  var g1 = fxGroundZ(S, i, px + ex, py + ey) - ez, g2 = fxGroundZ(S, i, px - ex, py - ey) + ez;
  if (g1 > g) g = g1;
  if (g2 > g) g = g2;
  return g;
}
// Rest pose: the stick lies along its azimuth, tilted by the rise of the
// support between its ends, its centre 0.3 above the higher of the centre's
// support and the ends' mean. A resting particle no longer spins, so spin
// holds that tilt, which the renderer draws in place of rot.
function fxStickRest(S, i, r, px, py, gc) {
  var hl = fxStickHalf(S.R, r, S.seedA[i]), ex = Math.cos(S.phase[i]) * hl, ey = Math.sin(S.phase[i]) * hl;
  var g1 = fxGroundZ(S, i, px + ex, py + ey), g2 = fxGroundZ(S, i, px - ex, py - ey);
  if (g1 !== g1) g1 = gc;
  if (g2 !== g2) g2 = gc;
  var mid = (g1 + g2) / 2;
  S.spin[i] = Math.atan2(g1 - g2, 2 * hl);
  S.z[i] = (mid > gc ? mid : gc) + 0.3;
}

// Children are queued during the integrate pass and admitted after it,
// never by stealing, so the pass never visits a slot twice or skips one.
function fxQueueChild(S, i, r, x, y, z) {
  var R = S.R, child = R.child[r];
  if (child < 0) return;
  var d = Math.hypot(x - cam.x, y - cam.y);
  if (d > R.childNear[r] || !(effectNoise(S.seedA[i], 13) < R.onFloorChance[r] * fxKeep(R, child, d))) return;
  if (S.childCount >= EFFECT_CONFIG.childQueue) { S.stats.refusedChildQueue++; return; }
  var q = S.childQ, o = S.childCount++ * 5;
  q[o] = x; q[o + 1] = y; q[o + 2] = z; q[o + 3] = child; q[o + 4] = S.flags[i];
}
function fxAdmitChildren(S) {
  var q = S.childQ, n = S.childCount, ctx = _fxCtx;
  if (!n) return;
  S.childCount = 0; S.noSteal = true;
  try {
    for (var j = 0; j < n; j++) {
      var o = j * 5, r = q[o + 3];
      fxCtxReset(ctx);
      ctx.x = q[o]; ctx.y = q[o + 1]; ctx.z = q[o + 2]; ctx.flags = q[o + 4] & FX_UNDER ? FX_EV_UNDER : 0;
      ctx.surf = fxBiomeIndex(S); ctx.spec = S.R.colorSpec[r];
      S.stats.children += fxBurst(S, r, 1, FX_PLACE_SOURCE, ctx, true);
    }
  } finally { S.noSteal = false; }
}

// ── Presentation on the interpolation timeline (section 3.7): the camera and
// actors are drawn one tick behind the newest state, so particles
// back-project by (1 - alpha) ticks. Read-only.
function fxPresentationBack(S) {
  var a = typeof renderPresentationAlpha === 'number' ? renderPresentationAlpha : 1;
  return (1 - a) * S.lastDt;
}
// out: x, y, z, t (life fraction). A particle never appears before its birth;
// SNAP (a contact this tick) presents the current state.
function fxPresentInto(S, i, back, out) {
  var age = S.age[i], b = (S.flags[i] & FX_SNAP) ? 0 : age < back ? age : back;
  out[0] = S.x[i] - S.vx[i] * b; out[1] = S.y[i] - S.vy[i] * b; out[2] = S.z[i] - S.vz[i] * b;
  out[3] = (age - b) / S.life[i];
}

// ── Lifecycle hooks (the registry's engine family) ────────────────────────
// assembleWindow: pool, pending events and point anchors move with the window
// (events queued before step() are drained after the shift).
function fxRebase(sx, sy, target) {
  var S = target || fxState, n = S.count, fl = S.flags, ev = S.ev, A = S.anchors;
  for (var i = 0; i < n; i++) if (!(fl[i] & (FX_EYE | FX_SCREEN))) { S.x[i] -= sx; S.y[i] -= sy; }
  for (var e = 0; e < ev.count; e++) { var k = (ev.head + e) % ev.n; ev.x[k] -= sx; ev.y[k] -= sy; }
  for (var a = 0; a < A.n; a++) {
    if (!A.used[a] || A.kind[a] !== FX_ANCHOR_POINT) continue;
    A.x[a] -= sx; A.y[a] -= sy; A.x2[a] -= sx; A.y2[a] -= sy;
  }
  S.torchRefreshAt = 0; S.gcell.fill(-1, 0, n);
}
function fxWorldSeed() {
  if (ENDLESS_MODE) return WORLD_SEED | 0;
  var h = 0x811c9dc5, t = String(terrain);
  for (var k = 0; k < t.length; k++) h = Math.imul(h ^ t.charCodeAt(k), 16777619);
  return (effectNoise(level | 0, h) * 4294967296) | 0;
}
// Clear phase: pool, ring, anchors, children, colours, counters, seeds and a
// pending prewarm (the prime phase sets it again).
function fxReset(scope, target) {
  var S = target || fxState;
  S.count = 0; S.prewarm = false; S.classLive.fill(0); S.classDying.fill(0); S.recipeLive.fill(0); S.stolenByClass.fill(0);
  S.ev.head = S.ev.count = 0; S.childCount = 0; S.dynCount = 0; S.eyeCount = 0; S.stealCursor = 0; S.contactN = 0;
  for (var a = 0; a < S.anchors.n; a++) if (S.anchors.used[a]) fxFreeAnchor(S.anchors, a);
  S.seed = fxWorldSeed(); S.legacyRng = (S.seed ^ 0x5bd1e995) >>> 0; S.serial = 0; S.tick = 0; S.simTime = 0;
  var force = S.weather.force, forceI = S.weather.forceI;          // a dev weather force outlives the world
  S.mesh = null; S.torchRefreshAt = 0; S.weather = fxCreateWeather(); S.fieldSerial = 0;
  S.weather.force = force; S.weather.forceI = forceI;
  S.fields = S.C.FIELDS.map(fxCreateField); S.torch = fxCreateTorchTable(S.C.anchorRecipes[FX_ANCHOR_TORCH].length);
  S.obs = fxCreateObservers();
  var st = S.stats;
  for (var key in st) st[key] = 0;
}
// Prime phase (after the player is placed): fields fill on the first tick.
function fxPrime() { fxState.prewarm = true; }
// Every studio cycle gets a fresh pinned pool; studio casts never touch the
// live one. The studio's sky stays clear, so its casts compare.
function fxStudioInstall(live, job) {
  live.fxState = createFxState(EFFECT_CONFIG.studioCapacity, job && job.seed, {pinned:true});
  live.fxState.weather.force = FX_WM_CLEAR;
}
// Browser profile (20-browser-profile.js, section 10.4): a fresh pinned pool
// seeded from the profile, never the live one. New mode primes it with 120
// frozen-camera ticks; Legacy runs the old init and update under the
// profile's own seeded Math.random, already installed by the caller.
// Weather stays clear unless the job names it: 'rain', 'snow', 'ash',
// 'biome' (forced at 1) or 'auto' (the Weather switch's schedule).
function effectProfilePrime(job) {
  var legacy = effectFamilyMode('ambient') === 'legacy';
  if (legacy) { initAmbientParticles(); updateAmbientParticles(0); }
  fxState = createFxState(EFFECT_CONFIG.capacity, job.randomSeed, {pinned:true});
  var wf = job.weather === 'auto' ? FX_WF_NONE : fxWeatherForceCode(job.weather || 'clear');
  fxState.weather.force = wf === wf ? wf : FX_WM_CLEAR;
  if (!legacy) for (var k = 0; k < 120; k++) updateEffects(1 / 60);
}
function fxEngineStats(out) {
  var S = fxState, byClass = {};
  if (!S) return;
  var st = S.stats;
  FX_ENUMS.class.forEach(function (name, c) { byClass[name] = {live:S.classLive[c], cap:S.caps[c]}; });
  var q = effectQuality(S.cap, S.reserve);
  out.live = S.count; out.capacity = S.cap; out.budget = q.B; out.P = q.P; out.s = q.s; out.byClass = byClass;
  out.fields = {};
  S.C.FIELDS.forEach(function (F, f) {
    var fs = S.fields[f];
    out.fields[F.name] = {set:fs.set >= 0 ? F.setNames[fs.set] : null, under:fs.under, target:fs.target, live:fs.live};
    if (F.weather) {
      FX_ENUMS.weatherKind.forEach(function (kind, k) { out.fields[F.name][kind] = {target:fs.targets[k], live:fs.lives[k]}; });
      out.fields[F.name].snowLine = {cap:fs.targets[FX_WEATHER_SWAP], live:fs.lives[FX_WEATHER_SWAP]};   // rain's swaps above the line
    }
  });
  out.weather = effectWeatherState();
  out.weather.spawned = st.weatherSpawned; out.weather.snowLine = st.weatherSnowLine; out.weather.splashes2D = st.weatherSplashes2D;
  out.torches = S.torch.n;
  out.tick = {spawned:st.spawned, killed:st.killed, stolen:st.stolen, children:st.children, eventsIn:st.eventsIn,
    eventsDropped:st.eventsDropped, eventsGated:st.eventsGated, groundMiss:st.groundMiss, fieldWraps:st.fieldWraps, fieldSpawned:st.fieldSpawned,
    fieldDropped:st.fieldDropped, torchSpawned:st.torchSpawned, badEvents:st.badEvents, contactsDropped:st.contactsDropped,
    unknownRecipes:st.unknownRecipes, palOverflow:st.palOverflow, anchorsRefused:st.anchorsRefused,
    refused:{toggle:st.refusedToggle, family:st.refusedFamily, cap:st.refusedCap, budget:st.refusedBudget, lod:st.refusedLod,
      spawnCap:st.refusedSpawnCap, offscreenSelf:st.refusedOffscreenSelf, view:st.refusedView, noSupport:st.refusedNoSupport,
      childQueue:st.refusedChildQueue},
    observers:{steps:st.obsSteps, npcSteps:st.obsNpcSteps, npcCapped:st.obsNpcCapped, dashes:st.obsDashes, lands:st.obsLands}};
  out.registry.unknownEvents = st.unknownEvents;
}

// The only engine throw: every named event and anchor has code here.
function fxAssertEngineTables(events, anchors) {
  Object.keys(events).forEach(function (name) {
    if (typeof FX_EVENT_READERS[name] !== 'function') throw new Error('Particle engine: event ' + name + ' has no reader');
  });
  anchors.forEach(function (name) {
    if (typeof PARTICLE_ANCHORS[name] !== 'function') throw new Error('Particle engine: anchor ' + name + ' has no resolver');
  });
}
fxAssertEngineTables(FX_EVENTS, FX_ANCHOR_NAMES);
registerEffectFamily('fxState', {storage:'engine', life:'engine', prune:'none', rebase:'engine', reset:'level world',
  interp:'none', studio:'fresh', owner:'fx', hooks:{rebase:fxRebase, reset:fxReset, prime:fxPrime, studio:fxStudioInstall},
  draw3D:'fxCombat3D ambientFX3D fxOverlay', draw2D:'fx2D'});
