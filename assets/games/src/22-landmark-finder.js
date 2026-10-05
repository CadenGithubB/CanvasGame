// =============================================
// LANDMARK FINDER (developer action)
// =============================================
// "Go to nearest landmark" finds the nearest fortress, arena or watchtower
// with the generator's own region rule (05-endless-world.js, "Multi-chunk
// structures"), assembles that window as a walk-in would, and lands the
// player on an open, walkable surface cell outside the structure footprint.
// It is user-invoked only (Graphics row or window.goToNearestLandmark); the
// only load-time work is registering the action. On any failure the player
// is returned to the starting window and position.
var LANDMARK_REGION_CHUNKS = 3;      // generator: every 3x3 chunks is a region
var LANDMARK_FINDER_MAX_RINGS = 24;  // regions searched outward from the player
var LANDMARK_LANDING_GAP = {min: 48, target: 160, max: 480, far: 720}; // world units outside the footprint
var LANDMARK_SPAWNER_GAP = 340;      // spawners wake within 300 u with line of sight (19-companions-loot.js)
var LANDMARK_SAFE_SECONDS = 4;       // preferred straight-line walk time for the nearest enemy
// Per run: landmarks already visited (the next press cycles onward) and ones
// that could not be reached (skipped until the cycle wraps).
var _landmarkFinderVisited = {seed: null, keys: [], failed: []};
function resetLandmarkFinder() { _landmarkFinderVisited = {seed: null, keys: [], failed: []}; }

// The generator's presence rule, biome exclusion and type roll for one
// region, without generating any chunk. Null when the region has none.
// The rule lives with the generator (05-endless-world.js), which the water
// reserve also uses.
function landmarkRegionStructure(rX, rY) {
  return largeStructureForRegion(rX, rY);
}

// Nearest structure centre by straight-line distance, ring by ring. A region
// k rings out is at least (k - 0.5) region spans away, so the search stops
// once a closer candidate cannot exist.
function findNearestLandmarkRegion(fromWX, fromWY, options) {
  options = options || {};
  var span = LANDMARK_REGION_CHUNKS * CHUNK_SIZE, exclude = options.exclude || [];
  var baseX = Math.floor(fromWX / span), baseY = Math.floor(fromWY / span);
  var maxRings = options.maxRings || LANDMARK_FINDER_MAX_RINGS, best = null, bestDist = Infinity;
  for (var ring = 0; ring <= maxRings; ring++) {
    if (best && (ring - 1) * span > bestDist) break;
    for (var dy = -ring; dy <= ring; dy++) {
      for (var dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        var found = landmarkRegionStructure(baseX + dx, baseY + dy);
        if (!found || (options.type && found.type !== options.type)) continue;
        if (exclude.indexOf(found.regionX + ',' + found.regionY) >= 0) continue;
        var d = Math.hypot(found.centerWX - fromWX, found.centerWY - fromWY);
        if (d < bestDist) { best = found; bestDist = d; }
      }
    }
  }
  if (best) best.distance = bestDist;
  return best;
}

function landmarkFinderBlockedReason() {
  if (!ENDLESS_MODE || !grid || !floorMesh || !floorMesh.layerCount) return 'Start Endless Mode first.';
  if (gameOverState) return 'The run is over.';
  if (CAVE_TEST_MODE && !caveTestFlags.structures) return 'Cave Test has structures turned off.';
  if (arenaChallenge) return 'Finish the arena challenge first.';
  if (shopOpen || forgeOpen || settingsOpen) return 'Close the open panel first.';
  if (typeof _caveBrowserProfile !== 'undefined' && _caveBrowserProfile) return 'A browser profile is running.';
  if (typeof _castingStudio !== 'undefined' && _castingStudio) return 'Close Casting studio first.';
  if (typeof caveVisibilityFixturesEnabled === 'function' && caveVisibilityFixturesEnabled()) return 'Turn off visibility fixtures first.';
  return '';
}

function landmarkInWindow(target) {
  for (var i = 0; i < largeStructures.length; i++) {
    var st = largeStructures[i];
    if (st.regionX === target.regionX && st.regionY === target.regionY) return st;
  }
  return null;
}

// Open, flat, walkable surface at a window cell centre: returns the support
// height, or null. The 5x5 block is free of solid cells (at least 30 u to the
// nearest wall), the top walkable layer has no roof over it (the test that
// sets playerUnderground; open ground may sit below height 0), its 3x3
// neighbours are within 0.3 of it, and no water, entrance reserve, stall or
// enemy is there, nor a live spawner within waking range.
function landmarkLandingCell(gx, gy) {
  if (gx < 2 || gy < 2 || gx >= gridW - 2 || gy >= gridH - 2) return null;
  for (var oy = -2; oy <= 2; oy++) {
    for (var ox = -2; ox <= 2; ox++) if (grid[(gy + oy) * gridW + gx + ox]) return null;
  }
  var mesh = floorMesh;
  if (!mesh || !mesh.layerCount || mesh.gridSize !== cell || gx >= mesh.w || gy >= mesh.h) return null;
  var li = getTopWalkableLayerIdx(gx, gy);
  if (li < 0) return null;
  var i = gy * mesh.w + gx, h = meshLayerHeight(mesh, i, li);
  if (!Number.isFinite(h)) return null;
  var x = (gx + 0.5) * cell, y = (gy + 0.5) * cell;
  if (getCaveSpaceAt(x, y, h).underground) return null;
  if (mesh.water && mesh.water[i]) return null;
  if (inEntranceReserve(x, y)) return null;
  for (var ny = -1; ny <= 1; ny++) {
    for (var nx = -1; nx <= 1; nx++) {
      var lj = getTopWalkableLayerIdx(gx + nx, gy + ny);
      if (lj < 0 || Math.abs(meshLayerHeight(mesh, (gy + ny) * mesh.w + gx + nx, lj) - h) > 0.3) return null;
    }
  }
  for (var si = 0; si < marketStalls.length; si++) {
    if (Math.hypot(marketStalls[si].x - x, marketStalls[si].y - y) < 48) return null;
  }
  for (var ei = 0; ei < enemies.length; ei++) {
    if (Math.hypot(enemies[ei].x - x, enemies[ei].y - y) < 36) return null;
  }
  for (var pi = 0; pi < enemySpawners.length; pi++) {
    var sp = enemySpawners[pi];
    if (sp.active && sp.hp > 0 && Math.hypot(sp.x - x, sp.y - y) < LANDMARK_SPAWNER_GAP) return null;
  }
  return h;
}

// Seconds the quickest live enemy needs to walk straight to within 40 u of
// (x, y); walls are ignored, which errs toward caution.
function landmarkEnemyArrival(x, y) {
  var soonest = Infinity;
  for (var ei = 0; ei < enemies.length; ei++) {
    var e = enemies[ei];
    if (!(e.health > 0) || !(e.speed > 0)) continue;
    soonest = Math.min(soonest, Math.max(0, Math.hypot(e.x - x, e.y - y) - 40) / e.speed);
  }
  return soonest;
}

// Convex hull (counter-clockwise) of the footprint: structure-coloured solid
// cells inside the generator's overlap box. Convex, so arena gates and
// courtyards count as inside. Null when no footprint cell is in the window.
function landmarkFootprintHull(st) {
  var half = CHUNK_SIZE * (st.type === 'fortress' ? 1.8 : st.type === 'arena' ? 1.3 : 1.5) * (st.scale || 1);
  var x0 = Math.max(0, Math.floor((st.x - half) / cell)), x1 = Math.min(gridW - 1, Math.floor((st.x + half) / cell));
  var y0 = Math.max(0, Math.floor((st.y - half) / cell)), y1 = Math.min(gridH - 1, Math.floor((st.y + half) / cell));
  var pts = [];
  for (var gy = y0; gy <= y1; gy++) {        // a row's outermost cells carry its hull corners
    var lo = -1, hi = -1;
    for (var gx = x0; gx <= x1; gx++) {
      var i = gy * gridW + gx;
      if (grid[i] && (wallColorR[i] | wallColorG[i] | wallColorB[i])) { if (lo < 0) lo = gx; hi = gx; }
    }
    if (lo >= 0) pts.push([lo * cell, gy * cell], [lo * cell, (gy + 1) * cell], [(hi + 1) * cell, gy * cell], [(hi + 1) * cell, (gy + 1) * cell]);
  }
  if (!pts.length) return null;
  pts.sort(function(a, b) { return a[0] - b[0] || a[1] - b[1]; });
  function turn(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
  var lower = [], upper = [];
  for (var k = 0; k < pts.length; k++) {
    while (lower.length > 1 && turn(lower[lower.length - 2], lower[lower.length - 1], pts[k]) <= 0) lower.pop();
    lower.push(pts[k]);
  }
  for (var j = pts.length - 1; j >= 0; j--) {
    while (upper.length > 1 && turn(upper[upper.length - 2], upper[upper.length - 1], pts[j]) <= 0) upper.pop();
    upper.push(pts[j]);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

// Distance from (x, y) to the hull; negative inside it.
function landmarkHullGap(hull, x, y) {
  var inside = true, best = Infinity;
  for (var k = 0; k < hull.length; k++) {
    var a = hull[k], b = hull[(k + 1) % hull.length], ex = b[0] - a[0], ey = b[1] - a[1], px = x - a[0], py = y - a[1];
    if (ex * py - ey * px < 0) inside = false;
    var t = Math.max(0, Math.min(1, (px * ex + py * ey) / (ex * ex + ey * ey)));
    best = Math.min(best, Math.hypot(px - t * ex, py - t * ey));
  }
  return inside ? -best : best;
}

// Pick a landing 48-480 u outside the footprint hull (up to `far`, inside
// viewDist, only when nothing nearer is safe). Safety comes first: a cell no
// enemy can reach within LANDMARK_SAFE_SECONDS beats every other; then the
// nearer ring; then the cell closest to 160 u out on the side the player
// came from. `hull` may be passed in (window coordinates) when the window no
// longer holds the whole footprint.
function chooseLandmarkLanding(st, approachAngle, bounds, hull) {
  hull = hull || landmarkFootprintHull(st);
  if (!hull) return null;
  var maxGap = Math.max(LANDMARK_LANDING_GAP.max, Math.min(LANDMARK_LANDING_GAP.far, viewDist - 120));
  var reach = 0, best = null;
  for (var k = 0; k < hull.length; k++) reach = Math.max(reach, Math.hypot(hull[k][0] - st.x, hull[k][1] - st.y));
  reach += maxGap + cell;
  var cx0 = Math.max(2, Math.floor((st.x - reach) / cell)), cx1 = Math.min(gridW - 3, Math.floor((st.x + reach) / cell));
  var cy0 = Math.max(2, Math.floor((st.y - reach) / cell)), cy1 = Math.min(gridH - 3, Math.floor((st.y + reach) / cell));
  if (bounds) {
    cx0 = Math.max(cx0, bounds.gx0); cx1 = Math.min(cx1, bounds.gx1);
    cy0 = Math.max(cy0, bounds.gy0); cy1 = Math.min(cy1, bounds.gy1);
  }
  for (var cy = cy0; cy <= cy1; cy++) {
    for (var cx = cx0; cx <= cx1; cx++) {
      var x = (cx + 0.5) * cell, y = (cy + 0.5) * cell, dx = x - st.x, dy = y - st.y;
      if (Math.hypot(dx, dy) > reach) continue;
      var gap = landmarkHullGap(hull, x, y);
      if (gap < LANDMARK_LANDING_GAP.min || gap > maxGap) continue;
      var score = Math.abs(gap - LANDMARK_LANDING_GAP.target) + (gap > LANDMARK_LANDING_GAP.max ? 1000 : 0);
      var off = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - approachAngle), Math.cos(Math.atan2(dy, dx) - approachAngle)));
      score += off * 120;
      if (best && score >= best.score) continue;
      var h = landmarkLandingCell(cx, cy);
      if (h === null) continue;
      var arrival = landmarkEnemyArrival(x, y);
      if (arrival < LANDMARK_SAFE_SECONDS) score += 3000 + (LANDMARK_SAFE_SECONDS - arrival) * 250;
      if (!best || score < best.score) best = {gx: cx, gy: cy, x: x, y: y, h: h, gap: gap, score: score, arrival: arrival};
    }
  }
  return best;
}

function landmarkFinderReturnHome(home) {
  try {
    var half = Math.floor(WINDOW_CHUNKS / 2);
    if (windowCX + half !== home.cx || windowCY + half !== home.cy) assembleWindow(home.cx, home.cy);
  } catch (e) {
    console.error('[LANDMARK] could not restore the starting window:', e && e.message);
  }
  pos.x = home.x - windowOriginX; pos.y = home.y - windowOriginY; pos.floorZ = home.floorZ;
  vel.x = 0; vel.y = 0;
  cam.x = pos.x; cam.y = pos.y; cam.z = pos.floorZ; cam.ang = home.ang; cam.pitch = home.pitch;
  resetRenderInterpolation();
}

function goToNearestLandmark(options) {
  options = options || {};
  var blocked = landmarkFinderBlockedReason();
  if (blocked) return {ok: false, reason: blocked};
  var memo = _landmarkFinderVisited;
  if (memo.seed !== WORLD_SEED) { resetLandmarkFinder(); memo = _landmarkFinderVisited; memo.seed = WORLD_SEED; }
  var fromX = pos.x + windowOriginX, fromY = pos.y + windowOriginY;
  var search = {type: options.type, maxRings: options.maxRings, exclude: options.revisit ? [] : memo.keys.concat(memo.failed)};
  var target = findNearestLandmarkRegion(fromX, fromY, search);
  if (!target && search.exclude.length) {
    memo.keys = []; memo.failed = []; search.exclude = [];   // all visited or failed: start the cycle again
    target = findNearestLandmarkRegion(fromX, fromY, search);
  }
  if (!target) {
    return {ok: false, reason: 'No ' + (options.type || 'landmark') + ' within ' +
      (options.maxRings || LANDMARK_FINDER_MAX_RINGS) + ' regions.'};
  }
  var half = Math.floor(WINDOW_CHUNKS / 2), key = target.regionX + ',' + target.regionY;
  var home = {cx: windowCX + half, cy: windowCY + half, x: fromX, y: fromY,
    floorZ: pos.floorZ, ang: cam.ang, pitch: cam.pitch};
  if (typeof cancelPendingMissileCasts === 'function') cancelPendingMissileCasts(true);
  var st = null, landing = null, failure = '';
  try {
    assembleWindow(target.centerCX, target.centerCY);
    st = landmarkInWindow(target);
    var hull = st && landmarkFootprintHull(st), hullOX = windowOriginX, hullOY = windowOriginY;   // whole footprint in this window
    if (!st) failure = 'the generator placed no structure there';
    else landing = chooseLandmarkLanding(st, Math.atan2(fromY - st.centerWY, fromX - st.centerWX), null, hull);
    if (st && !landing) failure = 'no open walkable surface cell outside it';
    if (landing) {
      // Centre the window on the landing chunk, exactly as walking there would.
      var lwx = landing.x + windowOriginX, lwy = landing.y + windowOriginY;
      var lcx = Math.floor(lwx / CHUNK_SIZE), lcy = Math.floor(lwy / CHUNK_SIZE);
      if (lcx !== windowCX + half || lcy !== windowCY + half) assembleWindow(lcx, lcy);
      st = landmarkInWindow(target);
      var gx = Math.floor((lwx - windowOriginX) / cell), gy = Math.floor((lwy - windowOriginY) / cell);
      // Keep the cell if it is still open and no newly loaded enemy is closer in time.
      if (st && landmarkLandingCell(gx, gy) !== null &&
          landmarkEnemyArrival(lwx - windowOriginX, lwy - windowOriginY) >= Math.min(landing.arrival, LANDMARK_SAFE_SECONDS)) {
        landing = {gx: gx, gy: gy, x: lwx - windowOriginX, y: lwy - windowOriginY, gap: landing.gap};
      } else if (st) {
        // Choose again inside the new window's centre chunk only, so the next
        // updateChunks() does not re-centre again, against the first window's
        // hull (this window may cut the footprint off).
        var c0 = half * CHUNK_CELLS;
        landing = chooseLandmarkLanding(st, Math.atan2(fromY - st.centerWY, fromX - st.centerWX),
          {gx0: c0, gx1: c0 + CHUNK_CELLS - 1, gy0: c0, gy1: c0 + CHUNK_CELLS - 1},
          hull.map(function(p) { return [p[0] + hullOX - windowOriginX, p[1] + hullOY - windowOriginY]; }));
        if (!landing) failure = 'the landing cell changed after re-centring';
      } else {
        landing = null; failure = 'the structure left the window after re-centring';
      }
    }
  } catch (e) {
    landing = null; failure = 'window assembly failed: ' + (e && e.message || e);
  }
  if (!landing) {
    landmarkFinderReturnHome(home);
    if (memo.failed.indexOf(key) < 0) memo.failed.push(key);   // the next press moves on
    return {ok: false, reason: 'Could not reach the ' + target.type + ' in region ' + key + ': ' + failure + '.', target: target};
  }
  pos.x = landing.x; pos.y = landing.y;
  settlePlayerAtSpawn(true);                 // support height, no vertical motion, camera follows
  if (typeof clearGameplayInput === 'function') clearGameplayInput();
  vel.x = 0; vel.y = 0; jumpVelZ = 0; jumpAirborne = false; jumpPressed = false; dashPressed = false;
  cam.ang = Math.atan2(st.y - pos.y, st.x - pos.x); cam.pitch = 0;
  updateChunks();                            // walk-in bookkeeping (biome physics); already centred
  resetRenderInterpolation();                // a teleport, not motion to blend
  memo.keys.push(key);
  var arrival = landmarkEnemyArrival(pos.x, pos.y), safe = arrival >= LANDMARK_SAFE_SECONDS;
  var message = 'Landed ' + Math.round(landing.gap) + ' u outside ' + (st.type === 'arena' ? 'an ' : 'a ') + st.type + ' (region ' + key + ', ' +
    Math.round(Math.hypot(st.x - pos.x, st.y - pos.y)) + ' u to its centre).' +
    (safe ? '' : ' No calmer spot: an enemy can reach you in ' + arrival.toFixed(1) + ' s.');
  if (typeof pushToast === 'function') pushToast('Landmark: ' + st.type + ' ahead' + (safe ? '' : ' (enemies close)'), '#ffd27f', 2500);
  return {ok: true, message: message, type: st.type, predictedType: target.type, safe: safe, enemySeconds: arrival,
    regionX: target.regionX, regionY: target.regionY, gap: landing.gap,
    landing: {x: pos.x, y: pos.y, wx: pos.x + windowOriginX, wy: pos.y + windowOriginY, floorZ: pos.floorZ},
    centerDistance: Math.hypot(st.x - pos.x, st.y - pos.y)};
}

if (typeof defineRenderAction === 'function') {
  defineRenderAction({key: 'goToNearestLandmark', label: 'Go to nearest landmark',
    title: 'Developer teleport: loads the nearest fortress, arena or watchtower as a walk-in would and lands outside it. Press again for the next one.',
    run: function(options) { return goToNearestLandmark(options); }});
}
// Console: goToNearestLandmark({type:'arena'}) is already a window property.
