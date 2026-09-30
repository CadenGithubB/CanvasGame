// Spell visual archetypes. Presentation only: every spell, tower bolt and
// companion bolt is a data recipe over shared GAME_MATERIALS roles rather than
// a per-id branch inside a draw loop. Painters run inside the existing
// billboard/segment depth clips from 14-render-entities.js, so nothing here
// writes opaque scene depth, mutates a gameplay record, reads Math.random or
// enables Canvas shadow blur. Time comes from the caller's clock; periodic
// motion is a pure function of that clock and of each record's spawn time.
// SPELL_VISUALS_ENABLED is the review kill switch for the casting studio A/B;
// the legacy bodies it selects are scheduled for removal after browser sign-off.
var SPELL_VISUALS_ENABLED = true;

var SPELL_VISUAL_ROLES = Object.freeze(['core','light','mid','deep','rune']);
var SPELL_VISUAL_HEADS = Object.freeze({spindle:1, shard:1, spark:1, spore:1, bead:1, blob:1});
var SPELL_VISUAL_BURSTS = Object.freeze({starFracture:1, shatterRing:1, sparkFan:1, sporeRing:1, emberPuff:1, runeFlash:1});

// World units for sizes and wake length; screen pixels are derived per frame
// from projScale / forward depth and clamped by resScale, as the missile art
// does. wakeSeconds caps how much travel the wake describes; wakeUnits caps its
// world length so a fast bolt never trails a ribbon back through a wall.
var SPELL_VISUAL_RECIPE_SOURCE = {
  missile:   {material:'missileMagic',
              bolt:{head:'spindle', radiusWorld:3.1, wakeSeconds:0.115, wakeUnits:42, runes:true},
              burst:{style:'starFracture', sizeWorld:6.2}},
  fire:      {material:'fireMagic', burst:{style:'emberPuff', sizeWorld:5.5}},
  ice:       {material:'frostMagic',
              bolt:{head:'shard', radiusWorld:3.4, wakeSeconds:0.1, wakeUnits:34, runes:false},
              burst:{style:'shatterRing', sizeWorld:6.8}},
  lightning: {material:'stormMagic',
              bolt:{head:'spark', radiusWorld:2.6, wakeSeconds:0.07, wakeUnits:30, runes:false},
              burst:{style:'sparkFan', sizeWorld:6.4}},
  poison:    {material:'venomMagic',
              bolt:{head:'spore', radiusWorld:3.6, wakeSeconds:0.16, wakeUnits:26, runes:false},
              burst:{style:'sporeRing', sizeWorld:7.2}},
  arcane:    {material:'arcaneMagic', burst:{style:'runeFlash', sizeWorld:7}},
  tower:     {material:'towerMagic',
              bolt:{head:'bead', radiusWorld:2.7, wakeSeconds:0.09, wakeUnits:30, runes:false},
              burst:{style:'runeFlash', sizeWorld:5.2}},
  slime:     {material:'slimeMagic',
              bolt:{head:'blob', radiusWorld:2.4, wakeSeconds:0.08, wakeUnits:18, runes:false},
              burst:{style:'sporeRing', sizeWorld:4.6}}
};

function spellVisualRgbaPrefixes(hex) {
  var out = Object.create(null);
  SPELL_VISUAL_ROLES.forEach(function(role) {
    var rgb = parseInt(hex[role].slice(1), 16);
    out[role] = 'rgba(' + ((rgb >> 16) & 255) + ',' + ((rgb >> 8) & 255) + ',' + (rgb & 255) + ',';
  });
  return Object.freeze(out);
}
function spellVisualNumber(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Spell visual recipe ' + name + ' must be a positive number');
  return value;
}
// Pure compiler; invalid recipes fail at startup instead of silently drawing
// the legacy circle. Materials are the compiled GAME_MATERIALS table.
function compileSpellVisualRecipes(source, materials) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Spell visual recipes must be an object');
  if (!materials || typeof materials !== 'object') throw new Error('Spell visual recipes need compiled materials');
  var recipes = Object.create(null);
  Object.keys(source).forEach(function(id) {
    var def = source[id];
    if (!def || typeof def !== 'object' || Array.isArray(def)) throw new Error('Spell visual recipe ' + id + ' must be an object');
    var material = materials[def.material];
    if (!material || !material.hex) throw new Error('Spell visual recipe ' + id + ' names unknown material ' + def.material);
    SPELL_VISUAL_ROLES.forEach(function(role) {
      if (typeof material.hex[role] !== 'string') throw new Error('Spell material ' + def.material + ' lacks role ' + role);
    });
    var compiled = {id:id, material:def.material, hex:material.hex, rgba:spellVisualRgbaPrefixes(material.hex), bolt:null, burst:null};
    if (def.bolt) {
      if (!SPELL_VISUAL_HEADS[def.bolt.head]) throw new Error('Spell visual recipe ' + id + ' has unknown bolt head ' + def.bolt.head);
      compiled.bolt = Object.freeze({head:def.bolt.head,
        radiusWorld:spellVisualNumber(def.bolt.radiusWorld, id + '.bolt.radiusWorld'),
        wakeSeconds:spellVisualNumber(def.bolt.wakeSeconds, id + '.bolt.wakeSeconds'),
        wakeUnits:spellVisualNumber(def.bolt.wakeUnits, id + '.bolt.wakeUnits'),
        runes:!!def.bolt.runes});
    }
    if (def.burst) {
      if (!SPELL_VISUAL_BURSTS[def.burst.style]) throw new Error('Spell visual recipe ' + id + ' has unknown burst style ' + def.burst.style);
      compiled.burst = Object.freeze({style:def.burst.style,
        sizeWorld:spellVisualNumber(def.burst.sizeWorld, id + '.burst.sizeWorld')});
    }
    recipes[id] = Object.freeze(compiled);
  });
  return Object.freeze(recipes);
}
var SPELL_VISUAL_RECIPES = compileSpellVisualRecipes(SPELL_VISUAL_RECIPE_SOURCE, GAME_MATERIALS);

// Unknown spells (future NPC bolts, modded colors) derive a restrained five
// role palette from their own color rather than falling back to a neon circle.
var SPELL_VISUAL_GENERIC_BOLT = Object.freeze({head:'bead', radiusWorld:2.6, wakeSeconds:0.09, wakeUnits:28, runes:false});
var SPELL_VISUAL_GENERIC_BURST = Object.freeze({style:'runeFlash', sizeWorld:5.2});
var _spellGenericRecipes = new Map();
function spellVisualHexMix(a, b, t) {
  var av = parseInt(a.slice(1), 16), bv = parseInt(b.slice(1), 16);
  var r = Math.round(((av >> 16) & 255) * (1 - t) + ((bv >> 16) & 255) * t);
  var g = Math.round(((av >> 8) & 255) * (1 - t) + ((bv >> 8) & 255) * t);
  var bl = Math.round((av & 255) * (1 - t) + (bv & 255) * t);
  return '#' + ('000000' + ((r << 16) | (g << 8) | bl).toString(16)).slice(-6);
}
function spellVisualRecipe(spell) {
  var id = spell && spell.id;
  if (id && SPELL_VISUAL_RECIPES[id]) return SPELL_VISUAL_RECIPES[id];
  var color = spell && typeof spell.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(spell.color) ? spell.color.toLowerCase() : '#ffd54f';
  var cached = _spellGenericRecipes.get(color);
  if (cached) return cached;
  var hex = Object.freeze({core:'#fff8e6', light:spellVisualHexMix(color, '#ffffff', 0.55), mid:color,
    deep:spellVisualHexMix(color, '#101018', 0.55), rune:spellVisualHexMix(color, '#e0bf69', 0.5)});
  var recipe = Object.freeze({id:'generic', material:null, hex:hex, rgba:spellVisualRgbaPrefixes(hex),
    bolt:SPELL_VISUAL_GENERIC_BOLT, burst:SPELL_VISUAL_GENERIC_BURST});
  if (_spellGenericRecipes.size >= 64) _spellGenericRecipes.clear();
  _spellGenericRecipes.set(color, recipe);
  return recipe;
}

// =============================================
// Glow sprites (visual pipeline plan V05)
// =============================================
// A few tiny radial images per material replace per-primitive shadow blur.
// They are drawn only inside a caller's depth clip and never cached as screen
// patches. Without a document (headless hosts) the same call paints one flat
// low-alpha disc so geometry tests still see a draw.
var SPELL_GLOW_BYTE_LIMIT = 1536 * 1024;
var SPELL_GLOW_ENTRY_LIMIT = 96;
var SPELL_GLOW_BUILDS_PER_FRAME = 4;
var _spellGlowCache = new Map();
var _spellGlowBytes = 0;
var _spellGlowFailed = false;
var _spellGlowFrameBuilds = 0;
var _spellVisualStats = {bolts:0, bursts:0, fields:0, beams:0, arcs:0, auras:0,
  glowHits:0, glowMisses:0, glowBuilds:0, glowEvictions:0, glowFallbacks:0, glowBuildMs:0};

function beginSpellVisualFrame() { _spellGlowFrameBuilds = 0; }
function getSpellVisualStats() {
  return Object.assign({glowBytes:_spellGlowBytes, glowEntries:_spellGlowCache.size}, _spellVisualStats);
}
function clearSpellVisualCache() {
  _spellGlowCache.forEach(function(entry) { try { entry.canvas.width = entry.canvas.height = 1; } catch (error) { /* detached host */ } });
  _spellGlowCache.clear(); _spellGlowBytes = 0; _spellGlowFailed = false; _spellGlowFrameBuilds = 0;
  _spellGenericRecipes.clear();
  _spellVisualStats = {bolts:0, bursts:0, fields:0, beams:0, arcs:0, auras:0,
    glowHits:0, glowMisses:0, glowBuilds:0, glowEvictions:0, glowFallbacks:0, glowBuildMs:0};
}
function spellVisualNow() { return typeof performance !== 'undefined' && performance && performance.now ? performance.now() : 0; }
function spellGlowBucket(radiusPx) {
  var d = radiusPx * 2;
  return d <= 16 ? 16 : d <= 32 ? 32 : d <= 64 ? 64 : 128;
}
function spellGlowSprite(recipe, role, bucket) {
  if (_spellGlowFailed || typeof document === 'undefined' || !document || typeof document.createElement !== 'function') return null;
  var key = (recipe.material || recipe.hex.mid) + ':' + role + ':' + bucket;
  var entry = _spellGlowCache.get(key);
  if (entry) {
    _spellVisualStats.glowHits++;
    _spellGlowCache.delete(key); _spellGlowCache.set(key, entry);
    return entry.canvas;
  }
  _spellVisualStats.glowMisses++;
  var bytes = bucket * bucket * 4;
  if (_spellGlowFrameBuilds >= SPELL_GLOW_BUILDS_PER_FRAME || bytes > SPELL_GLOW_BYTE_LIMIT || SPELL_GLOW_ENTRY_LIMIT < 1) return null;
  var start = spellVisualNow(), canvas;
  try {
    canvas = document.createElement('canvas');
    canvas.width = bucket; canvas.height = bucket;
    var g = canvas.getContext('2d');
    if (!g || typeof g.createRadialGradient !== 'function') throw new Error('no 2D context');
    var half = bucket / 2, prefix = recipe.rgba[role];
    var grad = g.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, prefix + '0.55)'); grad.addColorStop(0.42, prefix + '0.2)'); grad.addColorStop(1, prefix + '0)');
    g.fillStyle = grad; g.fillRect(0, 0, bucket, bucket);
  } catch (error) { _spellGlowFailed = true; return null; }
  while (_spellGlowCache.size && (_spellGlowBytes + bytes > SPELL_GLOW_BYTE_LIMIT || _spellGlowCache.size >= SPELL_GLOW_ENTRY_LIMIT)) {
    var oldestKey = _spellGlowCache.keys().next().value, oldest = _spellGlowCache.get(oldestKey);
    _spellGlowCache.delete(oldestKey); _spellGlowBytes -= oldest.bytes; _spellVisualStats.glowEvictions++;
    try { oldest.canvas.width = oldest.canvas.height = 1; } catch (error) { /* detached host */ }
  }
  _spellGlowCache.set(key, {canvas:canvas, bytes:bytes});
  _spellGlowBytes += bytes; _spellGlowFrameBuilds++;
  _spellVisualStats.glowBuilds++; _spellVisualStats.glowBuildMs += spellVisualNow() - start;
  return canvas;
}
// Must be called inside the caller's depth clip. Alpha multiplies the current
// globalAlpha; both the alpha and the compositing mode are restored.
function drawSpellGlow(x, y, radiusPx, recipe, role, alpha) {
  if (!(radiusPx > 0.5) || !(alpha > 0.005)) return;
  var sprite = spellGlowSprite(recipe, role, spellGlowBucket(radiusPx));
  var previousAlpha = ctx.globalAlpha, previousOp = ctx.globalCompositeOperation;
  ctx.globalAlpha = previousAlpha * alpha;
  if (sprite) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(sprite, x - radiusPx, y - radiusPx, radiusPx * 2, radiusPx * 2);
  } else {
    _spellVisualStats.glowFallbacks++;
    ctx.fillStyle = recipe.rgba[role] + '0.22)';
    ctx.beginPath(); ctx.arc(x, y, radiusPx, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = previousAlpha; ctx.globalCompositeOperation = previousOp;
}

// =============================================
// Shared geometry helpers
// =============================================
function spellVisualClamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
function spellVisualProject(x, y, z, C, out) {
  var dx = x - cam.x, dy = y - cam.y, fwd = dx * C.cosAng + dy * C.sinAng;
  if (!Number.isFinite(fwd) || fwd < 1 || !Number.isFinite(z)) return null;
  out.sx = (0.5 + (-dx * C.sinAng + dy * C.cosAng) / fwd * C.invTanHalf * 0.5) * C.w;
  out.sy = C.horizonY + (C.cameraZ - z) / fwd * projScale;
  out.fwd = fwd;
  return out;
}
// Deterministic unit noise from small integers: flicker that repeats exactly
// for the same clock tick, so studio replays and tests stay reproducible.
function spellVisualNoise(a, b) {
  var h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function spellVisualDiamond(x, y, ux, uy, length, width, backFraction) {
  var nx = -uy * width, ny = ux * width, back = Number.isFinite(backFraction) ? backFraction : 0.72;
  ctx.beginPath();
  ctx.moveTo(x + ux * length, y + uy * length);
  ctx.lineTo(x + nx, y + ny);
  ctx.lineTo(x - ux * length * back, y - uy * length * back);
  ctx.lineTo(x - nx, y - ny);
  ctx.closePath(); ctx.fill();
}
function spellVisualDisc(x, y, radius) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
}
function spellVisualStroke(x0, y0, x1, y1) {
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}

// =============================================
// Bolt archetype: head oriented by projected world velocity plus a short,
// depth-aware wake described by the current world velocity (never a screen
// angle or a frame-rate-dependent position history).
// =============================================
var _svHead = {sx:0, sy:0, fwd:0}, _svAhead = {sx:0, sy:0, fwd:0};
var _svWakeA = {x:0, y:0, z:0}, _svWakeB = {x:0, y:0, z:0};
var _svWake = {widthA:0, widthB:0, alphaA:0, alphaB:0, prefix:'', hairline:''};
var _svBolt = {recipe:null, x:0, y:0, ux:0, uy:0, nx:0, ny:0, length:0, width:0, radius:0, RS:1, now:0, phase:0, spawn:0};

function spellBoltWakeSegment(pa, pb) {
  var dx = pb.x - pa.x, dy = pb.y - pa.y, length = Math.hypot(dx, dy);
  if (length < 0.25) return;
  var nx = -dy / length, ny = dx / length, w = _svWake;
  var grad = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
  grad.addColorStop(0, w.prefix + w.alphaA + ')');
  grad.addColorStop(1, w.prefix + w.alphaB + ')');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(pa.x + nx * w.widthA, pa.y + ny * w.widthA);
  ctx.lineTo(pb.x + nx * w.widthB, pb.y + ny * w.widthB);
  ctx.lineTo(pb.x - nx * w.widthB, pb.y - ny * w.widthB);
  ctx.lineTo(pa.x - nx * w.widthA, pa.y - ny * w.widthA);
  ctx.closePath(); ctx.fill();
  // One hairline keeps the wake calligraphic instead of a soft smear.
  ctx.strokeStyle = grad; ctx.lineWidth = Math.max(0.5, resScale * 0.45);
  spellVisualStroke(pa.x + nx * w.widthA * 0.35, pa.y + ny * w.widthA * 0.35, pb.x + nx * w.widthB * 0.35, pb.y + ny * w.widthB * 0.35);
}

var SPELL_BOLT_PAINTERS = {
  // Translucent outer blade, silver edge and ivory centre; brackets when close.
  spindle: function(s) {
    var x = s.x, y = s.y, ux = s.ux, uy = s.uy, L = s.length, W = s.width, hex = s.recipe.hex, RS = s.RS;
    ctx.fillStyle = s.recipe.rgba.mid + '0.18)'; spellVisualDiamond(x, y, ux, uy, L * 1.05, W * 1.65);
    ctx.fillStyle = hex.deep; spellVisualDiamond(x, y, ux, uy, L, W);
    ctx.fillStyle = hex.light; spellVisualDiamond(x - uy * W * 0.1, y + ux * W * 0.1, ux, uy, L * 0.86, W * 0.68);
    ctx.fillStyle = hex.core; spellVisualDiamond(x, y, ux, uy, L * 0.64, Math.max(RS * 0.55, W * 0.25));
    if (s.recipe.bolt.runes && s.radius > RS * 3.2) {
      ctx.strokeStyle = s.recipe.rgba.light + '0.64)'; ctx.lineWidth = RS * 0.65;
      for (var side = -1; side <= 1; side += 2) {
        var nx = -uy * side, ny = ux * side, r = s.radius;
        ctx.beginPath();
        ctx.moveTo(x - ux * r * 0.35 + nx * r * 0.64, y - uy * r * 0.35 + ny * r * 0.64);
        ctx.lineTo(x + nx * r * 0.82, y + ny * r * 0.82);
        ctx.lineTo(x + ux * r * 0.3 + nx * r * 0.64, y + uy * r * 0.3 + ny * r * 0.64);
        ctx.stroke();
      }
    }
  },
  // Frost: a six-sided crystal with one lit facet, an axial hairline and two
  // trailing motes that drift on a deterministic phase.
  shard: function(s) {
    var x = s.x, y = s.y, ux = s.ux, uy = s.uy, nx = s.nx, ny = s.ny, L = s.length, W = s.width, hex = s.recipe.hex, RS = s.RS;
    drawSpellGlow(x, y, s.radius * 1.9, s.recipe, 'light', 0.3);
    ctx.fillStyle = hex.deep;
    ctx.beginPath();
    ctx.moveTo(x + ux * L, y + uy * L);
    ctx.lineTo(x + ux * L * 0.3 + nx * W, y + uy * L * 0.3 + ny * W);
    ctx.lineTo(x - ux * L * 0.55 + nx * W * 0.62, y - uy * L * 0.55 + ny * W * 0.62);
    ctx.lineTo(x - ux * L * 0.95, y - uy * L * 0.95);
    ctx.lineTo(x - ux * L * 0.55 - nx * W * 0.62, y - uy * L * 0.55 - ny * W * 0.62);
    ctx.lineTo(x + ux * L * 0.3 - nx * W, y + uy * L * 0.3 - ny * W);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = hex.light;
    ctx.beginPath();
    ctx.moveTo(x + ux * L * 0.9, y + uy * L * 0.9);
    ctx.lineTo(x + ux * L * 0.25 + nx * W * 0.5, y + uy * L * 0.25 + ny * W * 0.5);
    ctx.lineTo(x - ux * L * 0.5 + nx * W * 0.12, y - uy * L * 0.5 + ny * W * 0.12);
    ctx.lineTo(x - ux * L * 0.72, y - uy * L * 0.72);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = hex.core; ctx.lineWidth = Math.max(RS * 0.5, W * 0.18);
    spellVisualStroke(x - ux * L * 0.8, y - uy * L * 0.8, x + ux * L * 0.86, y + uy * L * 0.86);
    ctx.strokeStyle = s.recipe.rgba.rune + '0.7)'; ctx.lineWidth = Math.max(RS * 0.4, W * 0.1);
    spellVisualStroke(x + ux * L * 0.3 - nx * W, y + uy * L * 0.3 - ny * W, x - ux * L * 0.55 - nx * W * 0.62, y - uy * L * 0.55 - ny * W * 0.62);
    ctx.fillStyle = hex.light;
    for (var i = 0; i < 2; i++) {
      var drift = Math.sin(s.phase + s.now * 0.004 + i * 2.1) * W * 1.2, back = L * (1.5 + i * 0.9);
      var mx = x - ux * back + nx * drift, my = y - uy * back + ny * drift;
      ctx.globalAlpha *= 0.8; spellVisualDiamond(mx, my, ux, uy, s.radius * 0.24, s.radius * 0.14, 1); ctx.globalAlpha /= 0.8;
    }
  },
  // Storm: a bright bead leading a jagged tail whose kinks change on a fixed
  // 45 ms tick; a small cross flare marks the head.
  spark: function(s) {
    var x = s.x, y = s.y, ux = s.ux, uy = s.uy, nx = s.nx, ny = s.ny, L = s.length, W = s.width, hex = s.recipe.hex, RS = s.RS;
    drawSpellGlow(x, y, s.radius * 1.7, s.recipe, 'light', 0.28);
    var tick = Math.floor(s.now / 45) + (s.spawn | 0), px = x, py = y;
    ctx.strokeStyle = hex.light; ctx.lineWidth = Math.max(RS * 0.6, W * 0.22); ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x, y);
    for (var k = 1; k <= 5; k++) {
      var along = -k * L * 0.45, lateral = (k % 2 ? 1 : -1) * W * 0.9 * (0.5 + spellVisualNoise(tick, k));
      px = x + ux * along + nx * lateral; py = y + uy * along + ny * lateral;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.strokeStyle = hex.core; ctx.lineWidth = Math.max(RS * 0.4, W * 0.1);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (var m = 1; m <= 3; m++) {
      var along2 = -m * L * 0.45, lateral2 = (m % 2 ? 1 : -1) * W * 0.9 * (0.5 + spellVisualNoise(tick, m));
      ctx.lineTo(x + ux * along2 + nx * lateral2, y + uy * along2 + ny * lateral2);
    }
    ctx.stroke();
    ctx.fillStyle = hex.light; spellVisualDiamond(x, y, ux, uy, s.radius * 0.7, s.radius * 0.34, 1);
    spellVisualDiamond(x, y, nx, ny, s.radius * 0.5, s.radius * 0.2, 1);
    ctx.fillStyle = hex.core; spellVisualDiamond(x, y, ux, uy, s.radius * 0.42, s.radius * 0.16, 1);
  },
  // Venom: a heavy rounded spore with one lit shoulder and two orbiting
  // satellites; the wake reads as a thin drip rather than a comet tail.
  spore: function(s) {
    var x = s.x, y = s.y, ux = s.ux, uy = s.uy, nx = s.nx, ny = s.ny, W = s.width, R = s.radius, hex = s.recipe.hex;
    drawSpellGlow(x, y, R * 1.8, s.recipe, 'light', 0.26);
    ctx.fillStyle = hex.deep; spellVisualDisc(x, y, W * 1.35);
    ctx.fillStyle = hex.mid; spellVisualDisc(x - ux * W * 0.15, y - uy * W * 0.15, W * 1.0);
    ctx.fillStyle = hex.light; spellVisualDisc(x - ux * W * 0.35 - nx * W * 0.35, y - uy * W * 0.35 - ny * W * 0.35, W * 0.42);
    ctx.fillStyle = hex.core; spellVisualDisc(x - ux * W * 0.45 - nx * W * 0.45, y - uy * W * 0.45 - ny * W * 0.45, Math.max(s.RS * 0.5, W * 0.16));
    ctx.fillStyle = hex.light;
    for (var i = 0; i < 2; i++) {
      var a = s.phase + s.now * 0.005 + i * Math.PI;
      spellVisualDisc(x + Math.cos(a) * R * 1.4, y + Math.sin(a) * R * 0.9, R * 0.2);
    }
    ctx.strokeStyle = s.recipe.rgba.rune + '0.6)'; ctx.lineWidth = Math.max(s.RS * 0.4, W * 0.12);
    ctx.beginPath(); ctx.arc(x, y, W * 1.35, s.phase, s.phase + 1.4); ctx.stroke();
  },
  // Tower and generic: a warm bead with a four-point flare and a rune ring.
  bead: function(s) {
    var x = s.x, y = s.y, ux = s.ux, uy = s.uy, nx = s.nx, ny = s.ny, R = s.radius, hex = s.recipe.hex;
    drawSpellGlow(x, y, R * 1.9, s.recipe, 'light', 0.3);
    ctx.fillStyle = hex.deep; spellVisualDisc(x, y, R * 0.62);
    ctx.fillStyle = hex.light; spellVisualDisc(x - ux * R * 0.1 - nx * R * 0.1, y - uy * R * 0.1 - ny * R * 0.1, R * 0.42);
    ctx.fillStyle = hex.core;
    spellVisualDiamond(x, y, ux, uy, R * 1.6, R * 0.18, 1);
    spellVisualDiamond(x, y, nx, ny, R * 1.1, R * 0.16, 1);
    ctx.strokeStyle = s.recipe.rgba.rune + '0.6)'; ctx.lineWidth = Math.max(s.RS * 0.4, R * 0.1);
    ctx.beginPath(); ctx.arc(x, y, R * 0.8, 0, Math.PI * 2); ctx.stroke();
  },
  // Companion slime: a wobbling droplet with a bright highlight and two beads
  // of spray behind it.
  blob: function(s) {
    var x = s.x, y = s.y, ux = s.ux, uy = s.uy, nx = s.nx, ny = s.ny, R = s.radius, hex = s.recipe.hex;
    var wobble = Math.sin(s.now * 0.02 + s.phase) * 0.15, angle = Math.atan2(uy, ux);
    drawSpellGlow(x, y, R * 1.6, s.recipe, 'light', 0.24);
    ctx.fillStyle = hex.deep;
    ctx.beginPath(); ctx.ellipse(x, y, R * 0.78 * (1 + wobble), R * 0.6 * (1 - wobble), angle, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hex.mid;
    ctx.beginPath(); ctx.ellipse(x - ux * R * 0.12, y - uy * R * 0.12, R * 0.58 * (1 + wobble), R * 0.44 * (1 - wobble), angle, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hex.light; spellVisualDisc(x - ux * R * 0.25 - nx * R * 0.22, y - uy * R * 0.25 - ny * R * 0.22, R * 0.2);
    ctx.fillStyle = hex.core; spellVisualDisc(x - ux * R * 0.3 - nx * R * 0.28, y - uy * R * 0.3 - ny * R * 0.28, Math.max(s.RS * 0.5, R * 0.08));
    ctx.fillStyle = hex.mid;
    for (var i = 0; i < 2; i++) {
      var back = R * (1.3 + i * 0.7), side = (i ? -1 : 1) * R * 0.35 * (1 + wobble);
      spellVisualDisc(x - ux * back + nx * side, y - uy * back + ny * side, R * (0.16 - i * 0.05));
    }
  }
};

function spellBoltHeadCallback() {
  var s = _svBolt;
  SPELL_BOLT_PAINTERS[s.recipe.bolt.head](s);
}

// true means this layer handled the projectile, even when scenery hides all of
// it. false selects the caller's legacy renderer (no bolt recipe).
function renderSpellBolt(p, C, now) {
  if (!p || !C) return false;
  var spell = p.spell || null, id = spell && spell.id;
  if (id === 'missile' && !(spell && spell.isNpc)) {
    _spellVisualStats.bolts++;
    return typeof renderMissileProjectileArt === 'function' ? renderMissileProjectileArt(p, C, now) : false;
  }
  var recipe = spellVisualRecipe(spell || {id:'missile'});
  if (!recipe.bolt) return false;
  _spellVisualStats.bolts++;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z) || !Number.isFinite(p.ang)) return true;
  if (Math.hypot(p.x - cam.x, p.y - cam.y) > 600) return true;
  var time = Number.isFinite(now) ? now : gameTimeNow();
  var age = Number.isFinite(p.spawnMs) ? Math.max(0, time - p.spawnMs) : 0;
  var hz = Number.isFinite(p.hz) ? p.hz : Number.isFinite(p.speed) ? p.speed : 0;
  var vz = Number.isFinite(p.vz) ? p.vz : 0;
  var vx = Math.cos(p.ang) * hz, vy = Math.sin(p.ang) * hz;
  var bolt = recipe.bolt, speed = Math.hypot(hz, vz);
  var seconds = Math.min(bolt.wakeSeconds, age / 1000, bolt.wakeUnits / Math.max(1, speed));
  var RS = Math.max(0.1, Number.isFinite(resScale) ? resScale : 1);
  var headView = spellVisualProject(p.x, p.y, p.z, C, _svHead);
  ctx.save();
  try {
    ctx.shadowBlur = 0; ctx.globalAlpha *= 0.96;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var wakeWidth = bolt.radiusWorld * 0.45;
    _svWake.prefix = recipe.rgba.light;
    for (var i = 0; i < 3 && seconds > 0; i++) {
      var from = (3 - i) / 3, to = (2 - i) / 3, a = _svWakeA, b = _svWakeB;
      a.x = p.x - vx * seconds * from; a.y = p.y - vy * seconds * from; a.z = p.z - vz * seconds * from;
      b.x = p.x - vx * seconds * to; b.y = p.y - vy * seconds * to; b.z = p.z - vz * seconds * to;
      var da = (a.x - cam.x) * C.cosAng + (a.y - cam.y) * C.sinAng;
      var db = (b.x - cam.x) * C.cosAng + (b.y - cam.y) * C.sinAng;
      _svWake.widthA = spellVisualClamp(wakeWidth * projScale / Math.max(1, da), RS * 0.35, RS * 7) * (1 - from * 0.88);
      _svWake.widthB = spellVisualClamp(wakeWidth * projScale / Math.max(1, db), RS * 0.35, RS * 7) * (1 - to * 0.88);
      _svWake.alphaA = Math.pow(1 - from, 1.3) * 0.5; _svWake.alphaB = Math.pow(1 - to, 1.3) * 0.5;
      drawSpellWorldSegment(a, b, C, Math.max(_svWake.widthA, _svWake.widthB) * 2, 0, spellBoltWakeSegment);
    }
    if (headView) {
      // Project a world-velocity step to obtain screen orientation. p.ang is a
      // world heading; using it as a Canvas angle breaks when the camera turns.
      var ahead = spellVisualProject(p.x + vx * 0.025, p.y + vy * 0.025, p.z + vz * 0.025, C, _svAhead);
      var sx = ahead ? ahead.sx - headView.sx : 0, sy = ahead ? ahead.sy - headView.sy : 0;
      var motionLength = Math.hypot(sx, sy);
      var s = _svBolt;
      s.recipe = recipe; s.x = headView.sx; s.y = headView.sy;
      s.ux = motionLength > 0.04 ? sx / motionLength : 0; s.uy = motionLength > 0.04 ? sy / motionLength : -1;
      s.nx = -s.uy; s.ny = s.ux;
      s.radius = spellVisualClamp(bolt.radiusWorld * projScale / headView.fwd, 1.7 * RS, 13 * RS);
      var elongation = 1.05 + Math.min(0.75, motionLength / Math.max(1, s.radius));
      s.length = s.radius * elongation; s.width = s.radius * 0.48; s.RS = RS; s.now = time;
      s.spawn = Number.isFinite(p.spawnMs) ? p.spawnMs : 0; s.phase = (s.spawn % 997) * 0.0063;
      drawSpellBillboard(headView, Math.max(s.length, s.radius * 2) + RS * 2, 0, spellBoltHeadCallback);
    }
  } finally { ctx.restore(); }
  return true;
}

// =============================================
// Burst archetype: an impact at one point. Records come from several
// producers with different lifetime encodings; progress is normalized here and
// the record itself is never written.
// =============================================
function spellImpactProgress(im, now) {
  if (!im) return -1;
  if (Number.isFinite(im.spawnMs) && Number.isFinite(im.lifeMs) && im.lifeMs > 0) return (now - im.spawnMs) / im.lifeMs;
  if (Number.isFinite(im.t) && Number.isFinite(im.dur) && im.dur > 0) return (now - im.t) / im.dur;
  if (Number.isFinite(im.life) && Number.isFinite(im.maxLife) && im.maxLife > 0) return 1 - im.life / im.maxLife;
  return -1;
}
var _svBurst = {recipe:null, x:0, y:0, size:0, t:0, RS:1, phase:0, now:0};
var _svBurstPoint = {sx:0, sy:0, fwd:0};

var SPELL_BURST_PAINTERS = {
  // Six angular strokes fracture outward from a compressed seal.
  starFracture: function(s) {
    var x = s.x, y = s.y, size = s.size, t = s.t, RS = s.RS, hex = s.recipe.hex, angle = s.phase;
    var radius = size * (0.3 + 0.88 * (1 - Math.pow(1 - t, 3)));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var i = 0; i < 6; i++) {
      var a = angle + i * Math.PI / 3, ux = Math.cos(a), uy = Math.sin(a);
      var outer = radius * (i % 2 ? 0.76 : 1.14), inner = radius * (0.12 + 0.55 * t), bend = radius * 0.12 * (i % 2 ? -1 : 1);
      var bx = x + ux * (inner + outer) * 0.5 - uy * bend, by = y + uy * (inner + outer) * 0.5 + ux * bend;
      ctx.strokeStyle = i % 2 ? hex.mid : hex.light;
      ctx.lineWidth = Math.max(RS * 0.65, size * 0.065 * (1 - t * 0.45));
      ctx.beginPath(); ctx.moveTo(x + ux * inner, y + uy * inner); ctx.lineTo(bx, by); ctx.lineTo(x + ux * outer, y + uy * outer); ctx.stroke();
      if (i % 2 === 0 && t < 0.78) {
        ctx.strokeStyle = hex.core; ctx.lineWidth *= 0.7;
        spellVisualStroke(bx - uy * radius * 0.1, by + ux * radius * 0.1, bx + uy * radius * 0.09, by - ux * radius * 0.09);
      }
    }
    if (t < 0.5) {
      var flash = size * 0.47 * Math.pow(1 - t * 2, 1.1);
      ctx.fillStyle = hex.core; spellVisualDiamond(x, y, Math.cos(angle), Math.sin(angle), flash, flash * 0.32, 1);
      ctx.fillStyle = s.recipe.rgba.light + '0.76)'; spellVisualDiamond(x, y, -Math.sin(angle), Math.cos(angle), flash * 0.66, flash * 0.17, 1);
    }
  },
  // Frost: seven shards fly out while a thin rime ring expands and fades.
  shatterRing: function(s) {
    var x = s.x, y = s.y, size = s.size, t = s.t, RS = s.RS, hex = s.recipe.hex, ease = 1 - Math.pow(1 - t, 2.2);
    drawSpellGlow(x, y, size * (0.5 + 0.4 * t), s.recipe, 'light', 0.32 * (1 - t));
    for (var i = 0; i < 7; i++) {
      var a = s.phase + i * Math.PI * 2 / 7, ux = Math.cos(a), uy = Math.sin(a);
      var distance = size * (0.2 + 0.95 * ease) * (i % 2 ? 0.8 : 1);
      ctx.fillStyle = i % 2 ? hex.mid : hex.light;
      spellVisualDiamond(x + ux * distance, y + uy * distance, ux, uy, size * 0.34 * (1 - t * 0.5), size * 0.11 * (1 - t * 0.4), 0.6);
    }
    ctx.strokeStyle = s.recipe.rgba.rune + (0.7 * (1 - t)) + ')'; ctx.lineWidth = Math.max(RS * 0.5, size * 0.05);
    ctx.beginPath(); ctx.arc(x, y, size * (0.25 + 0.7 * ease), 0, Math.PI * 2); ctx.stroke();
    if (t < 0.3) {
      var flash = size * 0.4 * (1 - t / 0.3);
      ctx.fillStyle = hex.core; spellVisualDiamond(x, y, 1, 0, flash, flash * 0.3, 1); spellVisualDiamond(x, y, 0, 1, flash, flash * 0.3, 1);
    }
  },
  // Storm: five jagged strokes fan out from a white flash.
  sparkFan: function(s) {
    var x = s.x, y = s.y, size = s.size, t = s.t, RS = s.RS, hex = s.recipe.hex, tick = Math.floor(s.now / 45) + (s.phase * 1000 | 0);
    drawSpellGlow(x, y, size * (0.6 + 0.3 * t), s.recipe, 'light', 0.3 * (1 - t));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var reach = size * (0.35 + 0.8 * (1 - Math.pow(1 - t, 2)));
    for (var i = 0; i < 5; i++) {
      var a = s.phase + i * Math.PI * 2 / 5, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
      ctx.strokeStyle = i % 2 ? hex.light : hex.mid; ctx.lineWidth = Math.max(RS * 0.6, size * 0.06 * (1 - t * 0.5));
      ctx.beginPath(); ctx.moveTo(x, y);
      for (var k = 1; k <= 3; k++) {
        var along = reach * k / 3, lateral = (k % 2 ? 1 : -1) * size * 0.14 * (0.4 + spellVisualNoise(tick, i * 4 + k));
        ctx.lineTo(x + ux * along + nx * lateral, y + uy * along + ny * lateral);
      }
      ctx.stroke();
    }
    if (t < 0.4) {
      var flash = size * 0.45 * (1 - t / 0.4);
      ctx.fillStyle = hex.core; spellVisualDisc(x, y, flash * 0.5);
      spellVisualDiamond(x, y, 1, 0, flash, flash * 0.22, 1); spellVisualDiamond(x, y, 0, 1, flash, flash * 0.22, 1);
    }
  },
  // Venom and slime: a soft cloud with three drifting wisps and a faint ring.
  sporeRing: function(s) {
    var x = s.x, y = s.y, size = s.size, t = s.t, RS = s.RS, hex = s.recipe.hex, ease = 1 - Math.pow(1 - t, 2);
    drawSpellGlow(x, y, size * (0.4 + 0.8 * ease), s.recipe, 'mid', 0.38 * (1 - t));
    ctx.fillStyle = s.recipe.rgba.mid + (0.55 * (1 - t)) + ')';
    for (var i = 0; i < 3; i++) {
      var a = s.phase + i * 2.1, distance = size * (0.25 + 0.6 * ease);
      spellVisualDisc(x + Math.cos(a) * distance, y + Math.sin(a) * distance * 0.7 - size * 0.25 * ease, size * 0.28 * (1 - t * 0.45));
    }
    ctx.strokeStyle = s.recipe.rgba.rune + (0.45 * (1 - t)) + ')'; ctx.lineWidth = Math.max(RS * 0.5, size * 0.04);
    ctx.beginPath(); ctx.ellipse(x, y, size * (0.4 + 0.6 * ease), size * (0.28 + 0.42 * ease), 0, 0, Math.PI * 2); ctx.stroke();
    if (t < 0.3) { ctx.fillStyle = hex.core; spellVisualDisc(x, y, size * 0.18 * (1 - t / 0.3)); }
    ctx.fillStyle = hex.light;
    for (var m = 0; m < 3; m++) {
      var b = s.phase + 1.1 + m * 2.1, d2 = size * (0.35 + 0.75 * ease);
      spellVisualDisc(x + Math.cos(b) * d2, y + Math.sin(b) * d2 * 0.7 - size * 0.35 * ease, Math.max(RS * 0.5, size * 0.06 * (1 - t)));
    }
  },
  // Fire: five embers rise and scatter from a short bright flash.
  emberPuff: function(s) {
    var x = s.x, y = s.y, size = s.size, t = s.t, RS = s.RS, hex = s.recipe.hex, ease = 1 - Math.pow(1 - t, 2);
    drawSpellGlow(x, y - size * 0.2 * ease, size * (0.5 + 0.5 * ease), s.recipe, 'light', 0.36 * (1 - t));
    for (var i = 0; i < 5; i++) {
      var a = s.phase + i * 1.26, distance = size * (0.15 + 0.7 * ease) * (0.7 + spellVisualNoise(s.phase * 1000 | 0, i) * 0.6);
      var ex = x + Math.cos(a) * distance, ey = y + Math.sin(a) * distance * 0.5 - size * 0.8 * ease;
      ctx.fillStyle = i % 2 ? hex.light : hex.mid;
      spellVisualDiamond(ex, ey, 0, -1, size * 0.22 * (1 - t * 0.6), size * 0.09 * (1 - t * 0.5), 0.8);
    }
    if (t < 0.35) {
      var flash = size * 0.42 * (1 - t / 0.35);
      ctx.fillStyle = hex.core; spellVisualDisc(x, y, flash * 0.45);
      ctx.fillStyle = s.recipe.rgba.light + '0.7)'; spellVisualDisc(x, y, flash * 0.8);
    }
    ctx.strokeStyle = s.recipe.rgba.deep + (0.5 * (1 - t)) + ')'; ctx.lineWidth = Math.max(RS * 0.5, size * 0.04);
    ctx.beginPath(); ctx.ellipse(x, y + size * 0.1, size * (0.3 + 0.5 * ease), size * (0.12 + 0.2 * ease), 0, 0, Math.PI * 2); ctx.stroke();
  },
  // Arcane, tower and generic: a four-point flare, an expanding ring and four
  // rune ticks that rotate a quarter turn while they fade.
  runeFlash: function(s) {
    var x = s.x, y = s.y, size = s.size, t = s.t, RS = s.RS, hex = s.recipe.hex, ease = 1 - Math.pow(1 - t, 2.5);
    drawSpellGlow(x, y, size * (0.5 + 0.4 * ease), s.recipe, 'light', 0.34 * (1 - t));
    var flare = size * (0.9 - 0.5 * t), width = Math.max(RS * 0.6, size * 0.14 * (1 - t * 0.6));
    ctx.fillStyle = hex.light; spellVisualDiamond(x, y, 1, 0, flare, width, 1); spellVisualDiamond(x, y, 0, 1, flare * 0.8, width, 1);
    ctx.fillStyle = hex.core; spellVisualDiamond(x, y, 1, 0, flare * 0.6, width * 0.5, 1); spellVisualDiamond(x, y, 0, 1, flare * 0.48, width * 0.5, 1);
    ctx.strokeStyle = s.recipe.rgba.light + (0.8 * (1 - t)) + ')'; ctx.lineWidth = Math.max(RS * 0.5, size * 0.05);
    ctx.beginPath(); ctx.arc(x, y, size * (0.3 + 0.6 * ease), 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = s.recipe.rgba.rune + (0.75 * (1 - t)) + ')'; ctx.lineWidth = Math.max(RS * 0.5, size * 0.045);
    for (var i = 0; i < 4; i++) {
      var a = s.phase + t * Math.PI * 0.5 + i * Math.PI / 2, ux = Math.cos(a), uy = Math.sin(a), r0 = size * 0.62, r1 = size * (0.78 + 0.12 * ease);
      spellVisualStroke(x + ux * r0, y + uy * r0, x + ux * r1, y + uy * r1);
    }
  }
};

function spellBurstCallback() {
  var s = _svBurst;
  ctx.save();
  try {
    ctx.shadowBlur = 0; ctx.globalAlpha *= Math.pow(1 - s.t, 1.05);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    SPELL_BURST_PAINTERS[s.recipe.burst.style](s);
  } finally { ctx.restore(); }
}

// true means this layer handled the impact (possibly drawing nothing because
// it is expired, unborn or hidden). false selects the caller's legacy path:
// synergy impacts without a spell id and the companion orb branch stay legacy
// until later slices.
function renderSpellBurst(im, C, now) {
  if (!im || !C || !im.spellId || im.isCompanionProj) return false;
  var spellId = im.spellId;
  if (spellId === 'missile') {
    _spellVisualStats.bursts++;
    return typeof renderMissileImpactArt === 'function' ? renderMissileImpactArt(im, C, now) : false;
  }
  var recipe = spellVisualRecipe({id:spellId, color:im.color});
  if (!recipe.burst) return false;
  _spellVisualStats.bursts++;
  if (!Number.isFinite(im.x) || !Number.isFinite(im.y)) return true;
  var time = Number.isFinite(now) ? now : gameTimeNow();
  var t = spellImpactProgress(im, time);
  if (!Number.isFinite(t) || t < 0 || t >= 1) return true;
  if (Math.hypot(im.x - cam.x, im.y - cam.y) > viewDist) return true;
  var z = Number.isFinite(im.z) ? im.z : getEntityRenderFloorZ(im);
  var point = spellVisualProject(im.x, im.y, z, C, _svBurstPoint);
  if (!point) return true;
  var RS = Math.max(0.1, Number.isFinite(resScale) ? resScale : 1);
  var s = _svBurst;
  s.recipe = recipe; s.x = point.sx; s.y = point.sy; s.t = t; s.RS = RS; s.now = time;
  s.size = spellVisualClamp(recipe.burst.sizeWorld * projScale / point.fwd, RS * 4, RS * 24);
  var seed = Number.isFinite(im.spawnMs) ? im.spawnMs : Number.isFinite(im.t) ? im.t : Math.round(im.x * 7 + im.y * 13);
  s.phase = (seed % 997) * 0.0017;
  drawSpellBillboard(point, s.size * 1.5 + RS * 2, 0, spellBurstCallback);
  return true;
}

// Gallery cases for the casting studio: one scene per spell that owns a bolt
// (its burst follows the flight) plus burst-only scenes for the rest.
function spellVisualDisplayName(id) {
  if (typeof spells !== 'undefined' && spells && spells[id] && spells[id].name) return spells[id].name;
  return id === 'tower' ? 'Tower Bolt' : id === 'slime' ? 'Companion bolt' : id;
}
function spellVisualGalleryScenes() {
  var scenes = [];
  Object.keys(SPELL_VISUAL_RECIPES).forEach(function(id) {
    var recipe = SPELL_VISUAL_RECIPES[id], name = spellVisualDisplayName(id);
    if (recipe.bolt) scenes.push({id:'bolt:' + id, archetype:'bolt', spell:id, label:'Bolt + burst · ' + name});
    else if (recipe.burst) scenes.push({id:'burst:' + id, archetype:'burst', spell:id, label:'Burst · ' + name});
  });
  return scenes;
}
