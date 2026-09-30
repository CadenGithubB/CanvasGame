// Effect registry (unified effects V1, S1): one validated table drives every
// effect lifecycle list. Only the compiler throws; runtime entries count, warn.
// S2 adds the shared services: engine configuration, the live Particles
// budget, in-game toggles, A/B family modes and the private legacy stream.
var EFFECT_CONFIG = Object.freeze({
  capacity: 3072, reserve: 256, studioCapacity: 512,
  spawnPerTick: 384, budgetPerSetting: 48, eventRing: 256, anchors: 64, childQueue: 256,
  dynamicPalette: 64, stealScan: 64, cullFadeSeconds: 0.25,
  classCapShare: Object.freeze({combat: 0.35, locomotion: 0.10, ambientExtra: 0.05}),
  maskBudgetPx: 60000, footprintBudgetPx: 50000, glowPerFrame: 256, mixedPerFrame: 256,
  governor: Object.freeze({targetMs: 1.0, lowMs: 0.6, down: 0.97, up: 1.01, floor: 0.35, rasterMsPerMpx: 14})
});
var EFFECT_FAMILY_SOURCE = {
impacts:{storage:'array',life:'lifeMs',prune:'sim',keep:'lt',rebase:'xy',reset:'level world',studio:'clear',owner:'spell-visuals',draw3D:'impacts3D',draw2D:'impacts2D'},
coneEffects:{storage:'array',life:'lifeMs',prune:'sim',keep:'lt',rebase:'xy',reset:'level world',studio:'clear',owner:'spell-visuals',status:'dead',draw3D:'coneFX3D',draw2D:'coneFX2D'},
groundEffects:{storage:'array',life:'duration',prune:'owner',rebase:'xy',reset:'level world',studio:'clear',owner:'spell-visuals',draw3D:'groundFX3D',draw2D:'groundFX2D'},
chainEffects:{storage:'array',life:'lifeMs',prune:'sim',keep:'le',rebase:'chain',reset:'level world',studio:'clear',owner:'spell-visuals',draw3D:'chainFX3D',draw2D:'chainFX2D'},
novaEffects:{storage:'array',life:'lifeMs',prune:'sim',keep:'le',rebase:'xy',reset:'level world',studio:'clear',owner:'spell-visuals',draw3D:'novaFX3D',draw2D:'novaFX2D'},
deathEffects:{storage:'array',life:'lifeMs',prune:'sim',keep:'lt',step:'legacyBones',rebase:'xy',reset:'level world',interp:'pose',studio:'clear',family:'bones',status:'legacy',draw3D:{none:'legacy bones were 2D-only; New bones are particles in fxCombat3D'},draw2D:'draw()'},
soulOrbs:{storage:'array',prune:'owner',rebase:'xy',reset:'level world',interp:'pose',studio:'clear',owner:'gameplay',draw3D:'soulOrbs3D',draw2D:'fx2D'},
coinDrops:{storage:'array',prune:'owner',rebase:'xy',reset:'level world',interp:'pose',studio:'clear',owner:'gameplay',draw3D:'coins3D',draw2D:'coins2D'},
statPickups:{storage:'array',prune:'owner',rebase:'rebuilt',reset:'level world',interp:'pose',studio:'clear',owner:'gameplay',draw3D:'statPickups3D',draw2D:{none:'pre-existing: no 2D stat art'}},
arcaneTomes:{storage:'array',prune:'owner',rebase:'xy',reset:'level world',interp:'pose',studio:'clear',owner:'gameplay',draw3D:'arcaneTomes3D',draw2D:{none:'pre-existing: no 2D tome art'}},
flameStream:{storage:'globals',globals:'flameStreamActive flameStreamLastTick flameStreamStartMs flameStreamAng flameStreamRange',resetValues:{flameStreamActive:false,flameStreamLastTick:0,flameStreamStartMs:0},reset:'run world',studio:'copy',owner:'spell-visuals',draw3D:'coneFX3D',draw2D:'coneFX2D'},
ambientParticles:{storage:'array',prune:'owner',reset:'level world',interp:'pose',studio:'copy',family:'ambient',status:'legacy',hooks:{prime:effectAmbientLegacyPrime,studio:effectAmbientLegacyStudio},draw3D:'ambientFX3D',draw2D:{none:'pre-existing: no 2D ambient'}},
torchGlow:{storage:'painter',family:'torchGlow',draw3D:'torchGlow3D',draw2D:{none:'3D light cue'}}
};
var _EFFECT_KEYS = 'storage life keep prune rebase reset interp studio status step family owner globals resetValues hooks draw3D draw2D'.split(' ');
var _EFFECT_ENUMS = {storage:'array globals engine painter', life:'lifeMs duration none engine', keep:'lt le',
  prune:'sim owner none', rebase:'xy chain rebuilt engine none', interp:'pose none', studio:'clear copy fresh none',
  status:'dead legacy', step:'legacyBones'};

// Pure. Absent enum keys mean 'none'.
function compileEffectFamilies(source) {
  var out = {list:[], byName:{}, rebase:[], reset:{run:[], level:[], world:[]},
    prime:{run:[], level:[], world:[]}, prune:[], studio:[], pose:[]};
  Object.keys(source).forEach(function(name) {
    var s = source[name] || {}, d = {name:name};
    function no(why) { throw new Error('Effect family ' + name + ': ' + why); }
    Object.keys(s).forEach(function(k) {
      var e = _EFFECT_ENUMS[k];
      if (_EFFECT_KEYS.indexOf(k) < 0 || e && e.split(' ').indexOf(s[k]) < 0) no('unknown ' + k + ' ' + s[k]);
    });
    'storage life keep prune rebase interp studio status step family owner'.split(' ').forEach(function(k) {
      d[k] = s[k] || (/none/.test(_EFFECT_ENUMS[k]) ? 'none' : null);
    });
    d.reset = String(s.reset || '').split(' ').filter(Boolean);
    d.globals = String(s.globals || '').split(' ').filter(Boolean);
    d.resetValues = Object.assign({}, s.resetValues);
    d.hooks = Object.freeze(Object.assign({}, s.hooks));
    if (!d.storage) no('no storage');
    if (d.prune === 'sim' && !(/^(lifeMs|duration)$/.test(d.life) && d.keep)) no('sim prune needs life, keep');
    if (d.step && d.prune !== 'sim') no('step needs sim prune');
    if ((d.interp === 'pose' || d.rebase === 'chain') && d.storage !== 'array') no('pose/chain need arrays');
    if (d.status === 'legacy' && !d.family) no('legacy needs family');
    if ((d.storage === 'globals') !== !!d.globals.length) no('globals mismatch');
    if (d.storage === 'engine' && !s.hooks) no('engine needs hooks');
    for (var h in d.hooks) if ('rebase reset prime studio'.split(' ').indexOf(h) < 0 || typeof d.hooks[h] !== 'function') no('bad hook ' + h);
    if (d.hooks.prime && d.rebase === 'rebuilt') no('prime hook on rebuilt');
    Object.keys(d.resetValues).forEach(function(k) { if (d.globals.indexOf(k) < 0) no('resetValues ' + k); });
    ['draw3D', 'draw2D'].forEach(function(v) {
      var x = d[v] = s[v];
      if (!(typeof x === 'string' && x || x && typeof x.none === 'string' && x.none)) no('missing ' + v + ' decision');
    });
    out.list.push(Object.freeze(d)); out.byName[name] = d;
    if (/^(xy|chain|engine)$/.test(d.rebase) || d.hooks.rebase) out.rebase.push(d);
    d.reset.forEach(function(r) {
      if (!out.reset.hasOwnProperty(r)) no('unknown reset scope ' + r);
      out.reset[r].push(d); if (d.hooks.prime) out.prime[r].push(d);
    });
    if (d.prune === 'sim') out.prune.push(d);
    if (d.studio !== 'none') out.studio.push.apply(out.studio, d.globals.length ? d.globals : [name]);
    if (d.interp === 'pose') out.pose.push(name);
  });
  return Object.freeze(out);
}

function registerEffectFamily(name, def) {
  if (EFFECT_FAMILY_SOURCE.hasOwnProperty(name)) throw new Error('Effect family ' + name + ': already registered');
  var next = Object.assign({}, EFFECT_FAMILY_SOURCE);
  next[name] = def;
  EFFECT_FAMILIES = compileEffectFamilies(next);
  EFFECT_FAMILY_SOURCE = next;
  _effectRegisterPose();
  // A family registered after 20-casting-preview.js built its key list joins it here.
  if (typeof _castingStudioKeys !== 'undefined') _castingStudioKeys = _castingStudioKeys.concat(effectRegistryStudioKeys(_castingStudioKeys));
  return EFFECT_FAMILIES.byName[name];
}
function _effectRegisterPose() { EFFECT_FAMILIES.pose.forEach(function(n) { registerRenderInterpolationGroup(n); }); }

var _effectCounts = {pruned:0, rebased:0, cleared:0, primed:0, malformed:{}};
var effectStats = {registry:_effectCounts, failures:{prune:0, rebase:0, reset:0, prime:0, studio:0,
  updateEffects:0, fxEvent:0, fxEmit:0, fxAttach:0, fxDetach:0, toggles:0, render:0, settings:0}};
var _effectNone = {};
function _effectWarn(text) { if (typeof console !== 'undefined' && console.warn) console.warn('[effects] ' + text); }
// Counts never reset, so a key's first count is its one warning per session
// (no string is built for later records).
function effectFailure(entry, e) {
  var f = effectStats.failures;
  if ((f[entry] = (f[entry] || 0) + 1) === 1) _effectWarn(entry + ' failed: ' + (e && e.message));
}
function _effectMalformed(name, kept) {
  var m = _effectCounts.malformed;
  if ((m[name] = (m[name] || 0) + 1) === 1) _effectWarn('malformed ' + name + (kept ? ' left in place' : ' dropped'));
}
function getEffectStats() {
  var out = JSON.parse(JSON.stringify(effectStats));
  if (typeof fxEngineStats === 'function') fxEngineStats(out);
  if (typeof fxRenderStats === 'function') fxRenderStats(out);
  return out;
}
function effectLifetimeProgress(rec, now, life) {
  return (now - rec.spawnMs) / rec[life || 'lifeMs'];
}

// tickEffects: legacy keep predicates, compacted in place.
function effectRegistryPrune(now, dt) {
  var L = EFFECT_FAMILIES.prune;
  for (var f = 0; f < L.length; f++) {
    try {
      var d = L[f], a = window[d.name] || [], k = 0, le = d.keep === 'le', bones = d.step === 'legacyBones';
      for (var i = 0; i < a.length; i++) {
        var r = a[i] || _effectNone, age = now - r.spawnMs;
        if (le ? age <= r[d.life] : age < r[d.life]) {
          if (bones) { r.x += r.vx * dt; r.y += r.vy * dt; r.vy += 60 * dt; r.vx *= 0.96; r.vy *= 0.96; }
          a[k++] = r;
        } else {
          _effectCounts.pruned++;
          if (isNaN(effectLifetimeProgress(r, now, d.life))) _effectMalformed(d.name);
        }
      }
      a.length = k;
    } catch (e) { effectFailure('prune', e); }
  }
}

function _effectFinitePoint(p) { return !!p && Number.isFinite(p.x + p.y); }
// assembleWindow; 'rebuilt' families hold new-window coordinates.
function effectRegistryRebase(sx, sy) {
  var L = EFFECT_FAMILIES.rebase;
  for (var f = 0; f < L.length; f++) {
    try {
      var d = L[f], a = d.storage === 'array' && window[d.name] || [], chain = d.rebase === 'chain';
      for (var i = 0; i < a.length; i++) {
        var r = a[i];
        if (!chain) { if (!r) continue; r.x -= sx; r.y -= sy; }
        else if (r && Number.isFinite(r.fromX + r.fromY) && Array.isArray(r.targets) && r.targets.every(_effectFinitePoint)) {
          r.fromX -= sx; r.fromY -= sy;
          for (var t = 0; t < r.targets.length; t++) { r.targets[t].x -= sx; r.targets[t].y -= sy; }
        } else { _effectMalformed(d.name, true); continue; }
        _effectCounts.rebased++;
      }
      if (d.hooks.rebase) d.hooks.rebase(sx, sy);
    } catch (e) { effectFailure('rebase', e); }
  }
}

// Clear phase (before content is built); prime runs after placement.
function effectRegistryReset(scope) {
  var L = EFFECT_FAMILIES.reset[scope] || [];
  for (var f = 0; f < L.length; f++) {
    try {
      var d = L[f];
      if (d.storage === 'array') window[d.name] = [];
      for (var k in d.resetValues) window[k] = d.resetValues[k];
      if (d.hooks.reset) d.hooks.reset(scope);
      _effectCounts.cleared++;
    } catch (e) { effectFailure('reset', e); }
  }
}
function effectRegistryPrime(scope) {
  var L = EFFECT_FAMILIES.prime[scope] || [];
  for (var f = 0; f < L.length; f++) {
    try { L[f].hooks.prime(scope); _effectCounts.primed++; } catch (e) { effectFailure('prime', e); }
  }
}
// While ambient is Legacy the old init runs at its old position, on the
// private legacy stream (S2); in New mode the engine's own prime fills fields.
function effectAmbientLegacyPrime() {
  if (effectFamilyMode('ambient') === 'legacy') effectWithLegacyRandom(initAmbientParticles);
}
// Studio: the tick moves the copied motes, so every cycle (reset or backwards
// scrub) restarts from the copy the studio opened with.
function effectAmbientLegacyStudio(live, job) {
  if (!job) return;
  if (!job.fxAmbientStart) job.fxAmbientStart = (live.ambientParticles || []).map(_effectCopyRecord);
  live.ambientParticles = job.fxAmbientStart.map(_effectCopyRecord);
}
function _effectCopyRecord(p) { return Object.assign({}, p); }

function effectRegistryStudioKeys(existing) {
  return EFFECT_FAMILIES.studio.filter(function(k) { return !(existing && existing.indexOf(k) >= 0); });
}
function effectRegistryStudioReset(live, job) {
  var L = EFFECT_FAMILIES.list;
  for (var f = 0; f < L.length; f++) {
    try {
      var d = L[f];
      if (d.studio === 'clear' && d.storage === 'array') live[d.name] = [];
      if (d.hooks.studio) d.hooks.studio(live, job);
    } catch (e) { effectFailure('studio', e); }
  }
}
function effectRegistryReport() {
  return EFFECT_FAMILIES.list.map(function(d) {
    var a = d.storage === 'array' ? window[d.name] : null;
    return {name:d.name, storage:d.storage, count:a ? a.length : null, malformed:_effectCounts.malformed[d.name] || 0,
      rebase:d.rebase, reset:d.reset.join(' '), interp:d.interp, studio:d.studio, draw3D:d.draw3D, draw2D:d.draw2D,
      mode:d.family ? effectFamilyMode(d.family) : null};
  });
}
// spellVisualNoise's mixer; the tick needs it before 14 loads.
function effectNoise(a, b) {
  var h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ── Toggles: presets behind in-game switches, in the render-feature
// definition shape (3d-int defineRenderFeature). In memory only, never saved.
var EFFECT_TOGGLE_DEFS = [
  {key:'fxUnified', label:'Unified effects', type:'bool', default:true, legacy:false,
   title:'Migrated effects use the particle engine (off = pre-migration reference; lifecycle fixes stay on)'},
  {key:'fxWeather', label:'Weather', type:'enum', values:['off', 'auto', 'rain', 'snow', 'ash'], default:'auto', legacy:'off',
   title:'Rain, snow and ash by biome, elevation and cover'},
  {key:'fxDebris', label:'Impact debris', type:'bool', default:true, legacy:false, title:'Sparks, chips and dust on projectile and melee hits'},
  {key:'fxFootDust', label:'Footstep dust', type:'bool', default:true, legacy:false, title:'Ground puffs from steps, dashes and landings'}
];
var EFFECT_TOGGLES = {};                 // values while no render-feature registry exists
var _effectToggleIndex = {}, _effectToggleShared = false, _effectToggleGen = 0;
// Families migrate slice by slice (S3 ambient and torchEmbers, S4 bones and
// pickupBursts, S8 torchGlow and flameEmbers); until then they stay Legacy.
var EFFECT_FAMILY_MIGRATED = {ambient:true, torchEmbers:true, torchGlow:true, bones:true, pickupBursts:true, flameEmbers:true};
// A family whose legacy code lives inside another family's legacy code has
// that family's mode: legacy torch embers are respawns of the legacy ambient
// array, so a split A/B would show both ember sources or neither.
var EFFECT_FAMILY_FOLLOWS = {torchEmbers:'ambient'};
var _effectFamilyOverride = {};
function _effectToggleAllows(def, v) { return def.type === 'bool' ? v === true || v === false : def.values.indexOf(v) >= 0; }
// The only read paths: once per tick (engine) and once per frame (renderer).
function effectToggleValue(key) {
  var def = _effectToggleIndex[key];
  if (!def) return undefined;
  return _effectToggleShared ? renderFeatureValue(key, def.default) : EFFECT_TOGGLES[key];
}
function effectToggleOn(key) {
  var def = _effectToggleIndex[key], v = effectToggleValue(key);
  return !!def && (def.type === 'bool' ? v === true : v !== def.legacy);
}
// A preset recipe (weather, debris, dust) spawns and draws only while its own
// switch and Unified effects are both on: Unified off is the pre-migration
// reference, which had no presets.
function effectPresetOn(key) { return effectToggleOn(key) && effectToggleOn('fxUnified'); }
// Console and in-game control; validates like setRenderFeatures.
function setEffectToggle(key, value) {
  var def = _effectToggleIndex[key];
  if (!def) throw new Error('effect toggles: unknown toggle ' + key);
  if (!_effectToggleAllows(def, value))
    throw new Error('effect toggles: ' + key + ': ' + JSON.stringify(value) + ' is not one of ' + JSON.stringify(def.values || [false, true]));
  if (_effectToggleShared) setRenderFeature(key, value);   // its change listener bumps the generation
  else if (EFFECT_TOGGLES[key] !== value) { EFFECT_TOGGLES[key] = value; _effectToggleGen++; }
  return effectTogglesSnapshot();
}
function effectTogglesSnapshot() {
  var out = {};
  EFFECT_TOGGLE_DEFS.forEach(function(d) { out[d.key] = effectToggleValue(d.key); });
  return out;
}
// Bumped by every toggle and family-mode change; readers rebuild gates on it.
function effectToggleGeneration() { return _effectToggleGen; }
function effectFamilyMode(family) {
  var o = _effectFamilyOverride[family], lead = EFFECT_FAMILY_FOLLOWS[family];
  if (o) return o;                                        // console/test override, never persisted
  if (!EFFECT_FAMILY_MIGRATED[family]) return 'legacy';
  if (lead) return effectFamilyMode(lead);
  return effectToggleOn('fxUnified') ? 'new' : 'legacy';
}
function setEffectFamilyMode(family, mode) {
  if (!EFFECT_FAMILY_MIGRATED.hasOwnProperty(family)) throw new Error('effect families: unknown family ' + family);
  if (mode !== 'new' && mode !== 'legacy' && mode !== null) throw new Error('effect families: mode must be new, legacy or null');
  if (mode && EFFECT_FAMILY_FOLLOWS.hasOwnProperty(family))
    throw new Error('effect families: ' + family + ' follows ' + EFFECT_FAMILY_FOLLOWS[family] + ' (its legacy code runs inside ' +
      EFFECT_FAMILY_FOLLOWS[family] + '); set ' + EFFECT_FAMILY_FOLLOWS[family]);
  if (mode) _effectFamilyOverride[family] = mode; else delete _effectFamilyOverride[family];
  _effectToggleGen++;
  return effectFamilyMode(family);
}
// At load: register with the render-feature registry when it exists (3d-int),
// otherwise keep the values here. Both paths share the same read functions.
// Safe to run again: keys the registry already holds are kept, local values
// are never reset, and the listener joins each registry once.
var _effectToggleListened = [];
function _effectToggleChanged() { _effectToggleGen++; }
function effectToggleInit() {
  EFFECT_TOGGLE_DEFS.forEach(function(d) {
    _effectToggleIndex[d.key] = d;
    if (!EFFECT_TOGGLES.hasOwnProperty(d.key)) EFFECT_TOGGLES[d.key] = d.default;
  });
  var shared = typeof defineRenderFeature === 'function' && typeof renderFeatureValue === 'function' && typeof setRenderFeature === 'function';
  if (shared) try {
    EFFECT_TOGGLE_DEFS.forEach(function(d) {
      try { defineRenderFeature(d); }
      catch (e) { if (renderFeatureValue(d.key, _effectNone) === _effectNone) throw e; }   // registered earlier: keep it
    });
    if (typeof onRenderFeaturesChange === 'function' && _effectToggleListened.indexOf(onRenderFeaturesChange) < 0) {
      onRenderFeaturesChange(_effectToggleChanged); _effectToggleListened.push(onRenderFeaturesChange);
    }
  } catch (e) { shared = false; effectFailure('toggles', e); }
  if (shared !== _effectToggleShared) { _effectToggleShared = shared; _effectToggleGen++; }
}
effectToggleInit();

// ── Live Particles budget (section 6.1): s = P / 25, B = min(capacity -
// reserve, 48 P). Class caps by code weather 0, ambient 1, locomotion 2,
// combat 3, feedback 4 (priority = code + 1); feedback may use the reserve.
// One object, recomputed only when an input changes.
var _effectQuality = {P:-1, capacity:-1, reserve:-1, s:0, B:0, gen:0, caps:new Int32Array(5), scale:new Float64Array(5)};
function effectQuality(capacity, reserve) {
  var q = _effectQuality, P = Number(settings && settings.particles);
  var cap = capacity === undefined ? EFFECT_CONFIG.capacity : capacity | 0;
  var res = reserve === undefined ? EFFECT_CONFIG.reserve : reserve | 0;
  if (!(P >= 0)) P = 0;
  if (P === q.P && cap === q.capacity && res === q.reserve) return q;
  var s = P / 25, B = Math.max(0, Math.min(cap - res, EFFECT_CONFIG.budgetPerSetting * P)), share = EFFECT_CONFIG.classCapShare;
  q.P = P; q.capacity = cap; q.reserve = res; q.s = s; q.B = B;
  q.caps[0] = B; q.caps[1] = Math.min(B, Math.floor(P) + Math.floor(share.ambientExtra * B));
  q.caps[2] = Math.floor(share.locomotion * B); q.caps[3] = Math.floor(share.combat * B); q.caps[4] = cap;
  q.scale[0] = q.scale[1] = s; q.scale[2] = q.scale[3] = Math.min(s, 1.5); q.scale[4] = Math.max(0.5, Math.min(1.25, s));
  q.gen++;
  return q;
}

// ── Legacy A/B code runs on a persistent private LCG (fxState.legacyRng,
// reseeded only by fxReset) installed as Math.random, so Legacy/New never
// changes the gameplay stream. One static function; no per-call closure.
var _effectLegacyHolder = {legacyRng: 0x5bd1e995}, _effectLegacyTarget = null;
function _effectLegacyRandom() {
  var S = _effectLegacyTarget;
  S.legacyRng = (Math.imul(S.legacyRng, 1664525) + 1013904223) >>> 0;
  return S.legacyRng / 4294967296;
}
function effectWithLegacyRandom(fn, a, b, c) {
  var saved = Math.random, prev = _effectLegacyTarget;
  _effectLegacyTarget = typeof fxState === 'object' && fxState ? fxState : _effectLegacyHolder;
  Math.random = _effectLegacyRandom;
  try { return fn(a, b, c); } finally { Math.random = saved; _effectLegacyTarget = prev; }
}

var EFFECT_FAMILIES = compileEffectFamilies(EFFECT_FAMILY_SOURCE);
_effectRegisterPose();
