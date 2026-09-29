// World textures in production (integration stage E): the structure model's
// opaque faces painted through TexturePilot with the structure study's
// verified optimum (hybrid mapping, tie-broken triangles, owner-mask edges,
// 128 px tiles, a 2,048-primitive budget). A pure colour change: coverage and
// depth come from exactly fillSceneDepthPolygon's withSceneDepthClip call, so
// the mask and _sceneDepthInv are identical with textures on or off.
// Inert at load: declarations and the feature registrations only. The catalog
// is built by prepareGameRun (22-lifecycle.js) or lazily by the first engaged
// frame. Fail open: every decline or failure repaints the face's prepared mean
// inside the same scene-depth callback, and no exception leaves the sink.
// Headless hosts whose getImageData returns alpha 0 (the audit lab) fail the
// catalog build once per session and always render the flat model.

var WORLD_TEXTURE_DEFAULTS = Object.freeze({
  mapping: 'hybrid', tile: 128, ownedPixels: true, filter: 'stable', maxStrips: 384, maxTriangles: 256,
  tessellation: typeof TexturePilot !== 'undefined' && TexturePilot.STRUCTURE_TESSELLATION ||
    Object.freeze({maxTriangles: 256, maxDepth: 10, errorPixels: 0.4}),
  budget: 2048, maxRows: 360, wash: 0.32, minOwnedPx: 64, leaveOwnedPx: 48, fadeStart: 0.72, fadeEnd: 0.82
});

// Texture catalog material per world material id. Keys are GAME_MATERIALS ids
// (01-materials.js; model parts carry them) plus the structure model's face
// materials (12-structure-models.js: stone, wood, cloth). Values are catalog
// materials; null (and any id not listed) paints the flat authored colour.
// The diagnostic checker is never mapped.
var WORLD_TEXTURE_MATERIALS = Object.freeze({
  stone: 'stone', wood: 'wood', cloth: null,
  caveStone: 'stone', entranceStone: 'stone', rubbleStone: 'stone',
  crateWood: 'wood', palisadeWood: 'wood', wallPropWood: 'wood', floorPropWood: 'wood',
  wallPropIron: 'iron', floorPropIron: 'iron',
  wallHeraldry: null, wallFlame: null, floorFoliage: null, bone: null,
  floorStone: 'stone', barrelWood: 'wood'   // stage I floor props (sandstone, mesaRock stay flat)
});
var WORLD_TEXTURE_CATALOG_USED = ['stone', 'wood', 'iron'];
function worldTextureMaterialName(id) {
  return Object.prototype.hasOwnProperty.call(WORLD_TEXTURE_MATERIALS, id) ? WORLD_TEXTURE_MATERIALS[id] : null;
}

// ── Catalog (once per tile size; session failure flag like _floorArtworkFailed) ──
var _worldTextureCatalogs = {};
var _worldTextureCatalogFailed = false;
var _worldTextureCatalogStats = {builds: 0, failures: 0, bytes: 0, ms: 0, lastFailure: '', lastBuildMs: 0};
var _worldTextureOverride = null;   // test/console hook: {textureBudget: 64, ...} wins over the registry
function _worldTextureNow() { return typeof performance !== 'undefined' && performance.now ? performance.now() : 0; }
function _worldTextureSetting(key, fallback) {
  if (_worldTextureOverride && Object.prototype.hasOwnProperty.call(_worldTextureOverride, key)) return _worldTextureOverride[key];
  if (typeof RENDER_FEATURES === 'object' && RENDER_FEATURES && Object.prototype.hasOwnProperty.call(RENDER_FEATURES, key)) return RENDER_FEATURES[key];
  return fallback;
}
function _worldTextureTile() {
  var tile = +_worldTextureSetting('textureTile', WORLD_TEXTURE_DEFAULTS.tile);
  return tile === 64 ? 64 : 128;
}
function worldTexturesWanted() {
  return typeof renderFeatureOn === 'function' && (renderFeatureOn('structureTextures') || renderFeatureOn('propTextures')) &&
    USE_TEXTURES === true;
}
// Returns {size, materials, means, bytes, buildMs} or null. Never throws.
function ensureWorldTextureCatalog(size) {
  if (size === undefined) size = _worldTextureTile();
  size = size === 64 ? 64 : 128;
  var have = _worldTextureCatalogs[size];
  if (have) return have;
  if (_worldTextureCatalogFailed || typeof TexturePilot === 'undefined' || !TexturePilot) return null;
  var start = _worldTextureNow();
  try {
    var built = TexturePilot.createCatalog(size), means = {};
    for (var i = 0; i < WORLD_TEXTURE_CATALOG_USED.length; i++) {
      var name = WORLD_TEXTURE_CATALOG_USED[i], material = built.materials[name];
      // The coarsest prepared level is one texel: the exact tile mean.
      var prepared = TexturePilot.prepareMaterial(material), level = prepared.levels[prepared.levels.length - 1];
      var px = level.source.getContext('2d').getImageData(0, 0, 1, 1).data;
      if (level.size !== 1 || !px || px[3] !== 255) throw new Error('no opaque mean for ' + name);
      means[name] = [px[0], px[1], px[2]];
    }
    var entry = {size: size, materials: built.materials, means: means, bytes: built.bytes, buildMs: _worldTextureNow() - start};
    _worldTextureCatalogs[size] = entry;
    _worldTextureCatalogStats.builds++;
    _worldTextureCatalogStats.bytes += entry.bytes;
    _worldTextureCatalogStats.ms += entry.buildMs;
    _worldTextureCatalogStats.lastBuildMs = entry.buildMs;
    return entry;
  } catch (e) {
    _worldTextureCatalogFailed = true;
    _worldTextureCatalogStats.failures++;
    _worldTextureCatalogStats.lastFailure = e && e.message ? e.message : String(e);
    // Silent, like _floorArtworkFailed: with structureTextures ON by default a
    // headless host fails here every session, and steady-state console checks
    // (the audit lab's) must stay quiet. The HUD line reads 'flat:catalog', the
    // frame counts texFlatCatalog, and getWorldTextureState().lastFailure says why.
    return null;
  }
}
// Drops every catalog and clears the session failure flag (tests, console).
function resetWorldTextureCatalog() {
  _worldTextureCatalogs = {};
  _worldTextureCatalogFailed = false;
  _worldTextureCatalogStats = {builds: 0, failures: 0, bytes: 0, ms: 0, lastFailure: '', lastBuildMs: 0};
}

// ── Per-frame pass ──
// beginWorldTexturePass(C) runs once at the start of the structure model pass
// (12-structure-models.js). The whole frame is textured or flat; a flat frame
// counts its reason. Faces then call fillSceneDepthTexturedPolygon near to far,
// so the budget admits the nearest faces first (skip-not-stop: a face that
// does not fit is painted with its mean and later faces may still fit).
var _WORLD_TEXTURE_CLIP = {writeDepth: true, _paintsDepthPixels: true};
var WORLD_TEXTURE_FLAT_KEYS = {master: 'texFlatMaster', debug: 'texFlatDebug', rows: 'texFlatRows', composite: 'texFlatComposite',
  filter: 'texFlatFilter', shadow: 'texFlatShadow', transform: 'texFlatTransform', catalog: 'texFlatCatalog'};
var _worldTexturePass = {active: false, begun: false, props: false, reason: 'off', C: null, catalog: null, mapping: 'hybrid', owned: true, budget: 2048,
  used: 0, minPx: 64, leavePx: 48, fadeStart: 0, fadeEnd: 0, w: 0, h: 0, points: null, buildMs: 0,
  stats: null, mapperStats: null, declines: null};
var _worldTextureSurface = null;
var _worldTextureShown = typeof WeakMap === 'function' ? new WeakMap() : null; // face -> textured last time (hysteresis)
var _worldTexturePlanarOptions = {width: 0, height: 0, maxStrips: 384, filter: 'stable', stats: null, ownedPixels: true,
  rowsOnly: true, visibleBounds: null};
var _worldTextureTessOptions = {width: 0, height: 0, maxTriangles: 256, maxDepth: 10, errorPixels: 0.4};
var _worldTextureTriangleOptions = {filter: 'stable', stats: null, ownedPixels: true, boundary: null};
var _worldTextureEmitMaterial = null, _worldTextureEmitDraws = 0, _worldTextureEmitFailed = 0;
var _worldTextureDeclineKeys = {};

function _worldTextureNewStats() {
  return {faces: 0, meanBudget: 0, meanSmall: 0, meanFade: 0, meanDecline: 0, meanFailed: 0, triangles: 0, strips: 0,
    clips: 0, capped: 0, planarDeclines: 0, failedDraws: 0, mappingMs: 0, debugTints: 0};
}
// The first reason this frame cannot texture, or ''. State reads first; the
// transform check (one getTransform call) runs after the catalog check in
// beginWorldTexturePass, so a host without a catalog makes no context call.
function _worldTextureFlatReason() {
  if (USE_TEXTURES !== true) return 'master';
  if ((typeof DEBUG_POLY_TYPES !== 'undefined' && DEBUG_POLY_TYPES) ||
      (typeof DEBUG_CAVE_COLORS !== 'undefined' && DEBUG_CAVE_COLORS) ||
      (typeof DEBUG_LAYER_TYPES !== 'undefined' && DEBUG_LAYER_TYPES)) return 'debug';
  var rows = _worldTextureSetting('textureMaxRows', WORLD_TEXTURE_DEFAULTS.maxRows);
  if (rows !== 'unlimited' && canvas.height > +rows) return 'rows';
  if (ctx.globalCompositeOperation !== 'source-over') return 'composite';
  if (ctx.filter !== undefined && ctx.filter !== 'none') return 'filter';
  if ((ctx.shadowBlur || 0) !== 0 || (ctx.shadowOffsetX || 0) !== 0 || (ctx.shadowOffsetY || 0) !== 0) return 'shadow';
  return '';
}
function _worldTextureIdentityTransform() {
  if (typeof ctx.getTransform !== 'function') return false;
  var t = ctx.getTransform();
  return !!t && t.a === 1 && t.b === 0 && t.c === 0 && t.d === 1 && t.e === 0 && t.f === 0;
}
function beginWorldTexturePass(C) {
  var pass = _worldTexturePass;
  pass.active = false; pass.reason = 'off'; pass.used = 0; pass.buildMs = 0; pass.begun = true; pass.props = false;
  pass.stats = _worldTextureNewStats(); pass.mapperStats = {}; pass.declines = {};
  if (!(typeof renderFeatureOn === 'function' && renderFeatureOn('structureTextures'))) return false;
  return _worldTextureEngage(pass, C);
}
// The engage rules and parameters of a begun pass (structure or prop).
function _worldTextureEngage(pass, C) {
  var reason = _worldTextureFlatReason(), catalog = null;
  if (!reason) {
    var builds = _worldTextureCatalogStats.builds;
    catalog = ensureWorldTextureCatalog(_worldTextureTile());
    if (_worldTextureCatalogStats.builds !== builds) pass.buildMs = _worldTextureCatalogStats.lastBuildMs;
    if (!catalog) reason = 'catalog';
    else if (!_worldTextureIdentityTransform()) reason = 'transform';
  }
  pass.reason = reason;
  if (reason) return false;
  var mapping = _worldTextureSetting('textureMapping', WORLD_TEXTURE_DEFAULTS.mapping);
  var minPx = +_worldTextureSetting('textureMinPixels', WORLD_TEXTURE_DEFAULTS.minOwnedPx);
  var budget = +_worldTextureSetting('textureBudget', WORLD_TEXTURE_DEFAULTS.budget);
  pass.mapping = mapping === 'triangles' || mapping === 'planar' ? mapping : 'hybrid';
  pass.owned = _worldTextureSetting('textureOwnedEdges', WORLD_TEXTURE_DEFAULTS.ownedPixels) !== false;
  pass.budget = budget > 0 ? Math.floor(budget) : WORLD_TEXTURE_DEFAULTS.budget;
  pass.minPx = minPx > 0 ? minPx : 0;
  pass.leavePx = minPx > 0 ? Math.round(minPx * WORLD_TEXTURE_DEFAULTS.leaveOwnedPx / WORLD_TEXTURE_DEFAULTS.minOwnedPx) : 0;
  pass.fadeStart = viewDist * WORLD_TEXTURE_DEFAULTS.fadeStart;
  pass.fadeEnd = viewDist * WORLD_TEXTURE_DEFAULTS.fadeEnd;
  pass.w = canvas.width; pass.h = canvas.height; pass.C = C; pass.catalog = catalog;
  pass.active = true;
  return true;
}
function _worldTextureStat(name, amount) {
  if (typeof addRenderFrameStat === 'function') addRenderFrameStat(name, amount);
}
// Publishes this pass's counters to the frame stats and ends the pass.
function endWorldTexturePass() {
  var pass = _worldTexturePass, s = pass.stats;
  var wasActive = pass.active, begun = pass.begun;
  pass.active = false; pass.begun = false; pass.C = null; pass.points = null; _worldTextureSurface = null;
  if (begun) _worldTextureFrameNote(pass, wasActive);   // stage L: the props continue this frame's budget
  if (!begun || pass.reason === 'off' || !s) return;
  if (pass.buildMs) _worldTextureStat('texCatalogMs', Math.round(pass.buildMs * 1000) / 1000);
  if (!wasActive) {
    _worldTextureStat('texFlat', 1);
    _worldTextureStat(WORLD_TEXTURE_FLAT_KEYS[pass.reason] || 'texFlatOther', 1);
    return;
  }
  var fallbacks = s.meanBudget + s.meanDecline + s.meanFailed;
  _worldTextureStat('texFaces', s.faces);
  _worldTextureStat('texMean', fallbacks + s.meanSmall + s.meanFade);
  _worldTextureStat('texMeanBudget', s.meanBudget); _worldTextureStat('texMeanSmall', s.meanSmall);
  _worldTextureStat('texMeanFade', s.meanFade); _worldTextureStat('texMeanDecline', s.meanDecline);
  _worldTextureStat('texMeanFailed', s.meanFailed); _worldTextureStat('texFallbacks', fallbacks);
  _worldTextureStat('texTriangles', s.triangles); _worldTextureStat('texStrips', s.strips);
  _worldTextureStat('texPatternFills', pass.mapperStats.patternFills || 0);
  _worldTextureStat('texClips', s.clips); _worldTextureStat('texCapped', s.capped);
  _worldTextureStat('texPlanarDeclines', s.planarDeclines); _worldTextureStat('texFailedDraws', s.failedDraws);
  _worldTextureStat('texMappingMs', Math.round(s.mappingMs * 1000) / 1000);
  _worldTextureStat('texPrims', pass.used); _worldTextureStat('texBudget', pass.budget);
  _worldTextureStat('texCatalogBytes', pass.catalog ? pass.catalog.bytes : 0);
  for (var reason in pass.declines) _worldTextureStat(reason, pass.declines[reason]);
  if (s.debugTints) _worldTextureStat('texDebugTints', s.debugTints);
}
function getWorldTextureState() {
  var pass = _worldTexturePass, c = _worldTextureCatalogStats;
  return {active: pass.active, reason: pass.reason, mapping: pass.mapping, budget: pass.budget, used: pass.used,
    catalogFailed: _worldTextureCatalogFailed, catalogBuilds: c.builds, catalogFailures: c.failures,
    catalogBytes: c.bytes, catalogMs: Math.round(c.ms * 1000) / 1000, lastFailure: c.lastFailure,
    catalogs: Object.keys(_worldTextureCatalogs).map(Number)};
}

// ── Colour: the prepared mean and the luma-normalised light ──
// The flat model paints P = worldFaceColor(authored A). A textured face is the
// tile (mean M) under a 32% wash of A, so its mean is W = 0.68 M + 0.32 A per
// channel. Light k = (P / A) * luma(A) / luma(W) per channel keeps the
// production light (sun, point lights, warmth, fog) and brings the textured
// face's luma to the flat face's. It is applied as one 'multiply' fill with
// min(k, 1) plus, where k > 1, one 'lighter' fill of (k - 1) W. The prepared
// mean W k is what budget, small, fade, decline and failure paint instead.
var _worldTextureColour = {mean: '', wash: '', multiply: '', lighter: '', amount: 0};
function _worldTextureLuma(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }
// washAmount: the surface's wash fraction (stage L props); otherwise 0.32.
function _worldTextureColours(meanRGB, tint, lit, washAmount) {
  var wash = typeof washAmount === 'number' && washAmount >= 0 && washAmount <= 1 ? washAmount : WORLD_TEXTURE_DEFAULTS.wash;
  var ar = (tint >>> 16) & 255, ag = (tint >>> 8) & 255, ab = tint & 255;
  var pr = (lit >>> 16) & 255, pg = (lit >>> 8) & 255, pb = lit & 255;
  var wr = meanRGB[0] * (1 - wash) + ar * wash, wg = meanRGB[1] * (1 - wash) + ag * wash, wb = meanRGB[2] * (1 - wash) + ab * wash;
  var lumaA = _worldTextureLuma(ar, ag, ab), lumaW = _worldTextureLuma(wr, wg, wb);
  var fl = lumaA > 0 ? _worldTextureLuma(pr, pg, pb) / lumaA : 0, norm = lumaW > 0 ? lumaA / lumaW : 0;
  var kr = (ar > 0 ? pr / ar : fl) * norm, kg = (ag > 0 ? pg / ag : fl) * norm, kb = (ab > 0 ? pb / ab : fl) * norm;
  var out = _worldTextureColour;
  out.mean = rgbQ(Math.round(wr * kr), Math.round(wg * kg), Math.round(wb * kb));
  out.wash = rgbQ(ar, ag, ab);
  out.multiply = rgbQ(Math.round(255 * Math.min(1, kr)), Math.round(255 * Math.min(1, kg)), Math.round(255 * Math.min(1, kb)));
  out.lighter = kr > 1 || kg > 1 || kb > 1 ?
    rgbQ(Math.round(Math.max(0, kr - 1) * wr), Math.round(Math.max(0, kg - 1) * wg), Math.round(Math.max(0, kb - 1) * wb)) : '';
  out.amount = wash;
  return out;
}

// ── The sink ──
// surface: {vertices (world, with u/v), material (catalog name), tint (packed
// authored colour), lit (packed flat colour), dist (camera depth of the face),
// horizontal (bool), key (object for the owned-pixel hysteresis)}.
// Returns withSceneDepthClip's visible pixel count, like fillSceneDepthPolygon.
function fillSceneDepthTexturedPolygon(points, surface) {
  var pass = _worldTexturePass;
  if (!pass.active || !surface) {
    if (surface) ctx.fillStyle = rgbQ((surface.lit >>> 16) & 255, (surface.lit >>> 8) & 255, surface.lit & 255);
    return fillSceneDepthPolygon(points);
  }
  _worldTextureSurface = surface; pass.points = points;
  try {
    return withSceneDepthClip(points, _worldTexturePaintFace, _WORLD_TEXTURE_CLIP);
  } finally {
    _worldTextureSurface = null; pass.points = null;
  }
}
function _worldTextureMean(stats, key, style, gen, minY, maxY, reason) {
  if (reason === 'budget') stats.meanBudget++;
  else if (reason === 'small') stats.meanSmall++;
  else if (reason === 'fade') stats.meanFade++;
  else if (reason === 'failed') stats.meanFailed++;
  else stats.meanDecline++;
  if (_worldTextureShown && key) _worldTextureShown.set(key, false);
  try {
    ctx.fillStyle = style;
    _traceSceneDepthPixelMask(gen, minY, maxY);
    ctx.fill();
  } catch (e) {
    stats.failedDraws++;
  }
  _worldTextureDebugTint(stats, 'mean', gen, minY, maxY);
}
// Texture debug (the page's checkbox, DEBUG_TEXTURE, default unchecked): a
// translucent tint over each face's own mask by the path that painted it in
// an engaged frame. A flat frame has no path and no tint (its reason is on
// the HUD render line).
var WORLD_TEXTURE_DEBUG_TINTS = Object.freeze({strip: 'rgb(0,200,255)', triangle: 'rgb(255,60,200)', mean: 'rgb(255,190,0)'});
var WORLD_TEXTURE_DEBUG_ALPHA = 0.45;
function _worldTextureDebugTint(stats, path, gen, minY, maxY) {
  if (!(typeof DEBUG_TEXTURE !== 'undefined' && DEBUG_TEXTURE === true)) return;
  var alpha = ctx.globalAlpha;
  try {
    ctx.globalAlpha = alpha * WORLD_TEXTURE_DEBUG_ALPHA;
    ctx.fillStyle = WORLD_TEXTURE_DEBUG_TINTS[path];
    _traceSceneDepthPixelMask(gen, minY, maxY);
    ctx.fill();
    stats.debugTints++;
  } catch (e) {
    stats.failedDraws++;
  } finally {
    ctx.globalAlpha = alpha;
  }
}
function _worldTextureEmit(a, b, c, edges) {
  _worldTextureTriangleOptions.boundary = edges;
  if (TexturePilot.drawTriangle(ctx, a, b, c, _worldTextureEmitMaterial, _worldTextureTriangleOptions)) _worldTextureEmitDraws++;
  else _worldTextureEmitFailed++;
}
function _worldTextureDecline(pass, reason) {
  var key = _worldTextureDeclineKeys[reason];
  if (!key) key = _worldTextureDeclineKeys[reason] = 'texDecl' + String(reason).replace(/(^|-)([a-z])/g, function (m, d, ch) { return ch.toUpperCase(); });
  pass.declines[key] = (pass.declines[key] || 0) + 1;
}
// The scene-depth callback: paints this face's integer mask and nothing else.
function _worldTexturePaintFace() {
  var pass = _worldTexturePass, stats = pass.stats, surface = _worldTextureSurface;
  var gen = _sceneDepthClipGeneration, minY = _sceneDepthClipMinY, maxY = _sceneDepthClipMaxY;
  var minX = _sceneDepthClipMinX, maxX = _sceneDepthClipMaxX, owned = _sceneDepthClipCount;
  var key = surface.key, dist = surface.dist, catalog = pass.catalog;
  var material = catalog.materials[surface.material], meanRGB = catalog.means[surface.material];
  if (!material || !meanRGB) {
    ctx.fillStyle = rgbQ((surface.lit >>> 16) & 255, (surface.lit >>> 8) & 255, surface.lit & 255);
    return _worldTextureMean(stats, key, ctx.fillStyle, gen, minY, maxY, 'decline');
  }
  var colours = _worldTextureColours(meanRGB, surface.tint, surface.lit, surface.wash), meanStyle = colours.mean;
  // Stage L: a prop face drawn at a fade alpha below 1 cannot composite its
  // wash and light fills over what is behind it; it paints the mean.
  if (surface.meanOnly) return _worldTextureMean(stats, key, meanStyle, gen, minY, maxY, 'fade');
  if (dist >= pass.fadeEnd) return _worldTextureMean(stats, key, meanStyle, gen, minY, maxY, 'fade');
  if (pass.minPx > 0) {
    var shown = _worldTextureShown && key ? _worldTextureShown.get(key) === true : false;
    if (owned < (shown ? pass.leavePx : pass.minPx)) return _worldTextureMean(stats, key, meanStyle, gen, minY, maxY, 'small');
  }
  var planar = pass.mapping === 'planar' || (pass.mapping === 'hybrid' && surface.horizontal);
  if (surface.triangles) planar = false;
  if (pass.budget - pass.used < (planar ? 1 : 8)) return _worldTextureMean(stats, key, meanStyle, gen, minY, maxY, 'budget');
  var baseAlpha = ctx.globalAlpha, dash = ctx.lineDashOffset, failed = false, meanReason = '';
  var washStyle = colours.wash, multiplyStyle = colours.multiply, lighterStyle = colours.lighter, washAmount = colours.amount;
  ctx.save();
  try {
    // Sentinel for a balanced restore if a mapper call throws between its
    // own save and restore (drawTriangleLegacy has no finally).
    ctx.lineDashOffset = dash + 0.5;
    _traceSceneDepthPixelMask(gen, minY, maxY); ctx.clip(); stats.clips++;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
    var tp = TexturePilot.clipNear(surface.vertices, cam, pass.C, projScale);
    if (!tp || tp.length !== pass.points.length) { meanReason = 'decline'; _worldTextureDecline(pass, 'uv'); }
    else {
      var start = _worldTextureNow(), remaining = pass.budget - pass.used, handled = false;
      if (planar) {
        var po = _worldTexturePlanarOptions;
        po.width = pass.w; po.height = pass.h; po.maxStrips = Math.min(WORLD_TEXTURE_DEFAULTS.maxStrips, remaining);
        po.stats = pass.mapperStats; po.ownedPixels = pass.owned; po.rowsOnly = pass.mapping === 'hybrid';
        po.visibleBounds = {minX: minX, maxX: maxX, minY: minY, maxY: maxY};
        var result = TexturePilot.drawPlanarFace(ctx, tp, material, po);
        if (result.handled) { handled = true; pass.used += result.strips; stats.strips += result.strips; }
        else { stats.planarDeclines++; _worldTextureDecline(pass, result.reason); }
        if (result.failed) { failed = true; stats.failedDraws++; }
      }
      if (!handled && !failed) {
        remaining = pass.budget - pass.used;
        if (remaining < 8) meanReason = 'budget';
        else {
          var T = WORLD_TEXTURE_DEFAULTS.tessellation, to = _worldTextureTessOptions;
          to.width = pass.w; to.height = pass.h; to.maxTriangles = Math.min(T.maxTriangles, remaining);
          to.maxDepth = T.maxDepth; to.errorPixels = T.errorPixels;
          var tri = _worldTextureTriangleOptions;
          tri.stats = pass.mapperStats; tri.ownedPixels = pass.owned;
          _worldTextureEmitMaterial = material; _worldTextureEmitDraws = 0; _worldTextureEmitFailed = 0;
          var work = TexturePilot.tessellate(tp, to, _worldTextureEmit);
          _worldTextureEmitMaterial = null;
          pass.used += work.triangles; stats.triangles += work.triangles;
          if (work.capped) stats.capped++;
          if (work.rejected) { if (work.capped) meanReason = 'budget'; else { meanReason = 'decline'; _worldTextureDecline(pass, 'tessellation'); } }
          else if (_worldTextureEmitFailed || !_worldTextureEmitDraws) { failed = true; stats.failedDraws += _worldTextureEmitFailed || 1; }
        }
      }
      stats.mappingMs += _worldTextureNow() - start;
      if (!failed && !meanReason) {
        var bw = maxX - minX + 1, bh = maxY - minY + 1;
        ctx.globalAlpha = baseAlpha * washAmount; ctx.fillStyle = washStyle; ctx.fillRect(minX, minY, bw, bh);
        ctx.globalAlpha = baseAlpha;
        ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = multiplyStyle; ctx.fillRect(minX, minY, bw, bh);
        if (lighterStyle) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = lighterStyle; ctx.fillRect(minX, minY, bw, bh); }
        ctx.globalCompositeOperation = 'source-over';
        if (dist > pass.fadeStart) {
          ctx.globalAlpha = baseAlpha * Math.min(1, (dist - pass.fadeStart) / (pass.fadeEnd - pass.fadeStart));
          ctx.fillStyle = meanStyle; ctx.fillRect(minX, minY, bw, bh);
        }
      }
    }
  } catch (e) {
    failed = true; stats.failedDraws++;
  } finally {
    ctx.restore();
    for (var guard = 0; guard < 32 && ctx.lineDashOffset !== dash; guard++) ctx.restore();
  }
  if (failed || meanReason) return _worldTextureMean(stats, key, meanStyle, gen, minY, maxY, failed ? 'failed' : meanReason);
  stats.faces++;
  if (_worldTextureShown && key) _worldTextureShown.set(key, true);
  _worldTextureDebugTint(stats, handled ? 'strip' : 'triangle', gen, minY, maxY);
}

// ── Prop textures (integration stage L, propTextures, default ON) ──
// drawWorldModel (12-prop-models.js) paints the opaque faces of the materials
// and roles below through fillSceneDepthTexturedPolygon: the chest body and
// lid (every tier) in wood at uvScale 14 with the structures' 32% wash, and
// the spawner obelisk's body in stone at uvScale 32 under a dark wash (50%
// of its dark violet albedo, meant to keep the obelisk's colour; natively, in
// Chromium, the stone replaces most of the purple at 0.5 (TEXTURES.md); the
// mean brightness is still normalised to the flat face). uvScale is world
// units per tile; a part authored at another UV scale is rescaled (the
// obelisk's parts carry 24). Triangles only: props never use planar strips,
// whatever textureMapping says. The same engage rules, parameters and
// per-frame primitive budget as the structure pass: props continue from the
// primitives the structure pass used this frame (structureModels3D draws
// first, then each prop family near to far). The same counters, plus
// texPropFaces, texPropMean, texPropPrims, texPropDraws (engaged prop
// passes) and texPropFlat (flat prop passes); a frame's flat reason is
// counted once, texBudget and texCatalogBytes once per frame. A face drawn
// at a fade alpha below 1 (the chest and obelisk range fade) paints the
// prepared mean. The frame is _renderFrameStats.frame: a host that draws
// props without beginRenderFrameStats keeps one budget across its draws.
var PROP_TEXTURE_WOOD = Object.freeze({material: 'wood', uvScale: 14, wash: 0.32});
var PROP_TEXTURE_OBELISK_STONE = Object.freeze({material: 'stone', uvScale: 32, wash: 0.5});
var PROP_TEXTURE_SPECS = Object.freeze({
  chestCommon: Object.freeze({body: PROP_TEXTURE_WOOD, lid: PROP_TEXTURE_WOOD}),
  chestUncommon: Object.freeze({body: PROP_TEXTURE_WOOD, lid: PROP_TEXTURE_WOOD}),
  chestRare: Object.freeze({body: PROP_TEXTURE_WOOD, lid: PROP_TEXTURE_WOOD}),
  chestEpic: Object.freeze({body: PROP_TEXTURE_WOOD, lid: PROP_TEXTURE_WOOD}),
  spawnerObelisk: Object.freeze({body: PROP_TEXTURE_OBELISK_STONE})
});
var _worldTextureFrame = {stamp: NaN, used: 0, reported: false, budgetShown: false};
function _worldTextureFrameNow() {
  var f = _worldTextureFrame;
  var stamp = typeof _renderFrameStats === 'object' && _renderFrameStats ? _renderFrameStats.frame : -1;
  if (f.stamp !== stamp) { f.stamp = stamp; f.used = 0; f.reported = false; f.budgetShown = false; }
  return f;
}
// endWorldTexturePass: the structure pass's primitives count against the props.
function _worldTextureFrameNote(pass, wasActive) {
  var frame = _worldTextureFrameNow();
  if (pass.reason === 'off') return;
  frame.reported = true;
  if (wasActive) { frame.used = pass.used; frame.budgetShown = true; }
}
var _worldTexturePropModels = typeof WeakMap === 'function' ? new WeakMap() : null;
function _worldTexturePropModel(model) {
  var known = _worldTexturePropModels ? _worldTexturePropModels.get(model) : undefined;
  if (known === undefined) {
    known = false;
    for (var i = 0; i < model.parts.length; i++) {
      if (Object.prototype.hasOwnProperty.call(PROP_TEXTURE_SPECS, model.parts[i].material)) known = true;
    }
    if (_worldTexturePropModels) _worldTexturePropModels.set(model, known);
  }
  return known;
}
// Begins a prop pass for one model's opaque faces; true when it engaged. A
// flat pass is counted and ended here. Never inside a structure pass; a prop
// pass left begun (drawWorldModel threw mid-model) is simply replaced.
function beginWorldTexturePropPass(model, C) {
  var pass = _worldTexturePass;
  if (((pass.active || pass.begun) && !pass.props) || !model || !model.parts || !C ||
      !(typeof renderFeatureOn === 'function' && renderFeatureOn('propTextures')) || !_worldTexturePropModel(model)) return false;
  var frame = _worldTextureFrameNow();
  pass.active = false; pass.reason = 'off'; pass.buildMs = 0; pass.begun = true; pass.props = true;
  pass.stats = _worldTextureNewStats(); pass.mapperStats = {}; pass.declines = {};
  pass.used = frame.used; pass.propStart = frame.used;
  if (_worldTextureEngage(pass, C)) return true;
  endWorldTexturePropPass();
  return false;
}
var _worldTexturePropSurface = {vertices: null, material: '', tint: 0, lit: 0, dist: 0, horizontal: false, key: null,
  wash: 0, triangles: true, meanOnly: false};
var _worldTexturePropVerts = [], _worldTexturePropPool = [];
var _worldTexturePropKeys = typeof WeakMap === 'function' ? new WeakMap() : null;
// Owned-pixel hysteresis key: one object per (instance owner, face index).
function _worldTexturePropKey(owner, index) {
  if (!_worldTexturePropKeys || !owner || typeof owner !== 'object') return null;
  var keys = _worldTexturePropKeys.get(owner);
  if (!keys) { keys = []; _worldTexturePropKeys.set(owner, keys); }
  return keys[index] || (keys[index] = {});
}
// The sink surface for one opaque model face in an engaged prop pass, or
// null (paint it flat). part: the face's model part; index: its index in the
// model (inst.texOwner keys the hysteresis); packed: its authored colour;
// lit: its flat colour; alpha: the globalAlpha it is drawn at.
function worldTexturePropSurface(face, part, inst, index, packed, lit, dist, alpha) {
  if (!_worldTexturePass.active || !face || (face.flags && (face.flags.translucent || face.flags.emissive))) return null;
  var roles = Object.prototype.hasOwnProperty.call(PROP_TEXTURE_SPECS, face.material) ? PROP_TEXTURE_SPECS[face.material] : null;
  var spec = roles && roles[face.role];
  if (!spec) return null;
  var verts = face.vertices;
  var k = part && part.uvScale > 0 ? part.uvScale / spec.uvScale : 1;
  if (k !== 1) {
    var scaled = _worldTexturePropVerts, pool = _worldTexturePropPool;
    scaled.length = 0;
    for (var i = 0; i < verts.length; i++) {
      var v = verts[i], s = pool[i] || (pool[i] = {x: 0, y: 0, z: 0, u: 0, v: 0});
      s.x = v.x; s.y = v.y; s.z = v.z; s.u = v.u * k; s.v = v.v * k;
      scaled.push(s);
    }
    verts = scaled;
  }
  var out = _worldTexturePropSurface;
  out.vertices = verts; out.material = spec.material; out.tint = packed; out.lit = lit; out.dist = dist;
  out.horizontal = false; out.wash = spec.wash; out.triangles = true; out.meanOnly = !(alpha >= 1);
  out.key = _worldTexturePropKey(inst && inst.texOwner, index);
  return out;
}
// Publishes one prop pass's counters (added to the frame's) and ends it.
function endWorldTexturePropPass() {
  var pass = _worldTexturePass, s = pass.stats;
  var wasActive = pass.active, begun = pass.begun;
  pass.active = false; pass.begun = false; pass.C = null; pass.points = null; _worldTextureSurface = null;
  if (!begun || pass.reason === 'off' || !s) return;
  var frame = _worldTextureFrameNow();
  if (pass.buildMs) _worldTextureStat('texCatalogMs', Math.round(pass.buildMs * 1000) / 1000);
  if (!wasActive) {
    _worldTextureStat('texPropFlat', 1);
    if (!frame.reported) {
      frame.reported = true;
      _worldTextureStat('texFlat', 1);
      _worldTextureStat(WORLD_TEXTURE_FLAT_KEYS[pass.reason] || 'texFlatOther', 1);
    }
    return;
  }
  var prims = pass.used - pass.propStart, fallbacks = s.meanBudget + s.meanDecline + s.meanFailed;
  var means = fallbacks + s.meanSmall + s.meanFade;
  frame.used = pass.used; frame.reported = true;
  _worldTextureStat('texFaces', s.faces);
  _worldTextureStat('texMean', means);
  _worldTextureStat('texMeanBudget', s.meanBudget); _worldTextureStat('texMeanSmall', s.meanSmall);
  _worldTextureStat('texMeanFade', s.meanFade); _worldTextureStat('texMeanDecline', s.meanDecline);
  _worldTextureStat('texMeanFailed', s.meanFailed); _worldTextureStat('texFallbacks', fallbacks);
  _worldTextureStat('texTriangles', s.triangles); _worldTextureStat('texStrips', s.strips);
  _worldTextureStat('texPatternFills', pass.mapperStats.patternFills || 0);
  _worldTextureStat('texClips', s.clips); _worldTextureStat('texCapped', s.capped);
  _worldTextureStat('texPlanarDeclines', s.planarDeclines); _worldTextureStat('texFailedDraws', s.failedDraws);
  _worldTextureStat('texMappingMs', Math.round(s.mappingMs * 1000) / 1000);
  _worldTextureStat('texPrims', prims);
  if (!frame.budgetShown) {
    frame.budgetShown = true;
    _worldTextureStat('texBudget', pass.budget);
    _worldTextureStat('texCatalogBytes', pass.catalog ? pass.catalog.bytes : 0);
  }
  for (var reason in pass.declines) _worldTextureStat(reason, pass.declines[reason]);
  if (s.debugTints) _worldTextureStat('texDebugTints', s.debugTints);
  _worldTextureStat('texPropFaces', s.faces); _worldTextureStat('texPropMean', means);
  _worldTextureStat('texPropPrims', prims); _worldTextureStat('texPropDraws', 1);
}

// A switch back on after a session catalog failure retries the build (lazily,
// in the next engaged frame); no catalog work happens here or at load.
// Stage L: either texture switch counts (structures or props).
var _worldTexturesWasOn = false;
function _worldTexturesFeatureChanged() {
  var on = typeof renderFeatureOn === 'function' && (renderFeatureOn('structureTextures') || renderFeatureOn('propTextures'));
  if (on && !_worldTexturesWasOn && _worldTextureCatalogFailed) {
    _worldTextureCatalogFailed = false;
  }
  _worldTexturesWasOn = on;
}
// Stage E2: structureTextures ships ON in Recommended (OFF in Legacy). The
// parameters below only shape an engaged pass; their Legacy value equals the
// default (bool switches must be false in Legacy), and Legacy never engages.
// Budgets above 2,048 are for comparison only.
if (typeof defineRenderFeature === 'function') {
  defineRenderFeature({key: 'structureTextures', label: 'Structure textures', type: 'bool', default: true, legacy: false,
    title: 'Stone and wood textures on the structure models (hybrid mapping, 2,048-primitive budget); a pure colour change over the same depth. Toggle Textures is the master switch.'});
  defineRenderFeature({key: 'textureMapping', label: 'Texture mapping', type: 'enum', values: ['hybrid', 'triangles', 'planar'],
    default: WORLD_TEXTURE_DEFAULTS.mapping, legacy: WORLD_TEXTURE_DEFAULTS.mapping,
    title: 'hybrid: planar strips on horizontal faces, tie-broken triangles elsewhere (the study optimum); triangles: every face; planar: strips on every face (experimental).'});
  defineRenderFeature({key: 'textureTile', label: 'Texture tile', type: 'enum', values: [128, 64],
    default: WORLD_TEXTURE_DEFAULTS.tile, legacy: WORLD_TEXTURE_DEFAULTS.tile,
    title: 'Texture tile size in pixels; each size builds its catalog once.'});
  defineRenderFeature({key: 'textureOwnedEdges', label: 'Texture owned edges', type: 'bool', default: WORLD_TEXTURE_DEFAULTS.ownedPixels, legacy: false,
    title: 'Owner-mask edge coverage: textured primitives cover the pixels their face owns, so no seams between primitives.'});
  defineRenderFeature({key: 'textureBudget', label: 'Texture budget', type: 'enum', values: [2048, 4096, 8192],
    default: WORLD_TEXTURE_DEFAULTS.budget, legacy: WORLD_TEXTURE_DEFAULTS.budget,
    title: 'Mapped primitives (strips plus triangles) per frame, nearest faces first; the rest paint their mean colour. 4,096 and 8,192 are for comparison only.'});
  defineRenderFeature({key: 'textureMaxRows', label: 'Texture max rows', type: 'enum', values: [360, 540, 720, 'unlimited'],
    default: WORLD_TEXTURE_DEFAULTS.maxRows, legacy: WORLD_TEXTURE_DEFAULTS.maxRows,
    title: 'Canvases taller than this many rows draw the flat model colours (reason rows on the HUD line).'});
  defineRenderFeature({key: 'textureMinPixels', label: 'Texture min pixels', type: 'enum', values: [64, 0],
    default: WORLD_TEXTURE_DEFAULTS.minOwnedPx, legacy: WORLD_TEXTURE_DEFAULTS.minOwnedPx,
    title: 'Faces owning fewer pixels paint their mean colour (64 to enter, 48 to leave); 0 disables the threshold.'});
  // Stage L: default ON since the native magnified-band case (chests at
  // 20-90 units, 16/16 in Chromium) and the lab A/B passed; Legacy OFF.
  defineRenderFeature({key: 'propTextures', label: 'Prop textures', type: 'bool', default: true, legacy: false,
    title: 'Wood on chest bodies and lids, stone on spawner obelisks (triangles only, on the same texture budget).'});
}
if (typeof onRenderFeaturesChange === 'function') {
  // Seeded after registration: the registration notices fire before this
  // listener exists, and a later unrelated switch must not count as off->on.
  _worldTexturesWasOn = typeof renderFeatureOn === 'function' && (renderFeatureOn('structureTextures') || renderFeatureOn('propTextures'));
  onRenderFeaturesChange(_worldTexturesFeatureChanged);
}
