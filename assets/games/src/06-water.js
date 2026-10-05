// Water system: one model for every spring, river, lake and pool.
// Water is solved, not simulated. A source routes downhill over the loaded
// terrain, fills the first basin it meets up to that basin's spill point,
// then continues from the spill, until its strength budget is spent, it joins
// standing water, or it leaves the loaded window. The result is written once
// per window into per-cell arrays that every consumer reads through
// waterAt(): rendering, movement and the 2D map. Nothing here runs per frame.
//
// Heights are mesh height units (floorMesh). Surfaces are flat for lakes and
// follow the bed for rivers. The solver is pure: it reads a field, writes the
// field's output arrays and makes no RNG draws, so a window rebuilt from the
// same seed produces identical water.
var WATER_KIND = {none: 0, still: 1, flowing: 2};
var WATER_RIVER_DEPTH = 0.35;     // river surface above its bed
var WATER_MIN_DEPTH = 0.03;       // shallower lake cells stay dry banks
var WATER_FALL_DROP = 0.6;        // bed drop in one step that reads as a waterfall
var WATER_WET_EPS = 0.001;        // water this little above the ground leaves it dry
var WATER_FLAG_FALLS = 1, WATER_FLAG_SOURCE = 2, WATER_FLAG_SPILL = 4, WATER_FLAG_DRAIN = 8;
var _waterNeighbours = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];

// Binary min-heap of cell indices keyed by a Float32 array; reused per solve.
function _waterHeap(capacity) {
  return {items: new Int32Array(Math.max(16, capacity)), keys: new Float64Array(Math.max(16, capacity)), size: 0};
}
function _waterHeapPush(heap, item, key) {
  if (heap.size === heap.items.length) {
    var items = new Int32Array(heap.size * 2), keys = new Float64Array(heap.size * 2);
    items.set(heap.items); keys.set(heap.keys); heap.items = items; heap.keys = keys;
  }
  var i = heap.size++;
  while (i > 0) {
    var p = (i - 1) >> 1;
    if (heap.keys[p] <= key) break;
    heap.items[i] = heap.items[p]; heap.keys[i] = heap.keys[p]; i = p;
  }
  heap.items[i] = item; heap.keys[i] = key;
}
function _waterHeapPop(heap) {
  var top = heap.items[0], last = --heap.size;
  if (last > 0) {
    var item = heap.items[last], key = heap.keys[last], i = 0;
    for (;;) {
      var l = i * 2 + 1, r = l + 1, m = i;
      var mk = key;
      if (l < last && heap.keys[l] < mk) { m = l; mk = heap.keys[l]; }
      if (r < last && heap.keys[r] < mk) m = r;
      if (m === i) break;
      heap.items[i] = heap.items[m]; heap.keys[i] = heap.keys[m]; i = m;
    }
    heap.items[i] = item; heap.keys[i] = key;
  }
  return top;
}

// A field is {w, h, height, sink, water, surface, dirX, dirY, speed, flags,
// body}. height[i] is the walkable surface height, or NaN where water may not
// go (walls, cave interiors, reserved ground). sink[i] is the ground height
// of closed ground that water drains into (reserved ground), NaN elsewhere:
// water whose surface stands above it where it reaches it leaves the solved
// area there, as at the window edge, so no river or lake stands above it.
// The solve adds rim and rimCells (_waterBuildRim). Output arrays may already
// hold standing water (water[i] with a finite surface[i]); rivers join it.
function createWaterField(w, h) {
  var n = w * h;
  return {w: w, h: h, height: new Float32Array(n), sink: new Float32Array(n).fill(NaN), water: new Uint8Array(n),
    surface: new Float32Array(n), dirX: new Float32Array(n), dirY: new Float32Array(n), speed: new Float32Array(n),
    flags: new Uint8Array(n), body: new Int32Array(n)};
}

function _waterPassable(field, i) { return field.height[i] === field.height[i]; }
// Ground a source has already claimed (its river cells and every basin it
// filled, deep or not) is solid to its later steps. Otherwise a spill can
// walk straight back into a shallow dip it just left and refill it forever.
function _waterOpen(field, i, scratch) {
  return field.height[i] === field.height[i] && scratch.claim[i] !== scratch.claimSerial;
}
function _waterJoins(field, i, bodyId) {
  return field.water[i] === WATER_KIND.still && field.body[i] !== bodyId && field.surface[i] >= field.height[i];
}

// A river's surface never rises along its flow: it is the lower of its own
// bed plus river depth and the surface upstream (a lake's level when the
// river leaves one), and never below its bed. Just past a spill lip it can
// be a very thin sheet; it deepens as the bed falls away.
function _waterMarkRiver(field, i, bodyId, stats, upstream) {
  if (field.water[i]) return false;
  var surface = Math.min(field.height[i] + WATER_RIVER_DEPTH, upstream);
  field.water[i] = WATER_KIND.flowing;
  field.surface[i] = Math.max(surface, field.height[i]);
  field.body[i] = bodyId;
  stats.river++;
  return true;
}
function _waterSetDir(field, from, to, drop) {
  var w = field.w, dx = (to % w) - (from % w), dy = ((to / w) | 0) - ((from / w) | 0), len = Math.hypot(dx, dy) || 1;
  field.dirX[from] = dx / len; field.dirY[from] = dy / len;
  field.speed[from] = Math.min(1, 0.25 + Math.max(0, drop) * 1.5);
}

// Solve one source. `scratch` holds reusable per-window work arrays.
function solveWaterSource(field, source, bodyId, scratch, stats) {
  var w = field.w, h = field.h, n = w * h, H = field.height;
  var budget = Math.max(0, source.strength | 0), ops = 0, maxOps = source.maxOps || budget * 40 + 2000;
  var c = source.cell;
  if (c < 0 || c >= n || !_waterPassable(field, c)) { stats.rejected++; return 'rejected'; }
  field.flags[c] |= WATER_FLAG_SOURCE;
  scratch.claimSerial++;
  var upstream = Infinity;
  for (;;) {
    if (ops++ > maxOps) { stats.capped++; return 'capped'; }
    // Joining other standing water ends the run; rivers merge and continue.
    if (_waterJoins(field, c, bodyId)) { stats.joins++; return 'joined'; }
    if (budget <= 0) { stats.exhausted++; return 'exhausted'; }
    if (_waterMarkRiver(field, c, bodyId, stats, upstream)) budget--;
    if (field.water[c]) upstream = Math.min(upstream, field.surface[c]);
    scratch.claim[c] = scratch.claimSerial;
    // Water that reaches reserved ground lower than its surface drains into
    // it there (_waterReachesSink), as at the window edge.
    if (field.water[c] && _waterReachesSink(field, c, field.surface[c], source.reach || 0)) {
      stats.outflows++; _waterDrained(field, c, stats); return 'outflow';
    }
    var cx = c % w, cy = (c / w) | 0, best = -1, bestSlope = 0, edge = false;
    for (var k = 0; k < 8; k++) {
      var nx = cx + _waterNeighbours[k][0], ny = cy + _waterNeighbours[k][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) { edge = true; continue; }
      var ni = ny * w + nx;
      if (!_waterOpen(field, ni, scratch)) continue;
      var slope = (H[c] - H[ni]) / (k < 4 ? 1 : Math.SQRT2);
      if (slope > bestSlope) { bestSlope = slope; best = ni; }
    }
    if (best >= 0) {
      var drop = H[c] - H[best];
      _waterSetDir(field, c, best, drop);
      if (drop > WATER_FALL_DROP) { field.flags[c] |= WATER_FLAG_FALLS; stats.falls++; }
      c = best; continue;
    }
    if (edge) { stats.outflows++; return 'outflow'; }
    // Local minimum: fill the basin by priority flood until it spills.
    var result = _waterFillBasin(field, c, bodyId, scratch, stats, budget, maxOps - ops);
    budget = result.budget; ops += result.ops; upstream = result.level;
    if (result.drain >= 0) _waterDrained(field, result.from, stats);
    if (result.spill < 0) return result.end;
    c = result.spill;
  }
}
// The run left the solved area into reserved ground next to `from`, its last
// cell (a river ending there falls to where it ends; see _waterRiverObject).
function _waterDrained(field, from, stats) {
  if (from >= 0) field.flags[from] |= WATER_FLAG_DRAIN;
  stats.drains++;
}
// Open cells beside reserved ground (field.rim[i]: the lowest reserved ground
// among a cell's 8 neighbours, NaN elsewhere; field.rimCells lists them).
// Built per solve from field.height and field.sink.
function _waterBuildRim(field) {
  var w = field.w, h = field.h, n = w * h, H = field.height, sink = field.sink;
  var rim = field.rim && field.rim.length === n ? field.rim : new Float32Array(n), cells = [];
  rim.fill(NaN);
  for (var i = 0; i < n; i++) {
    var z = sink[i];
    if (!(z === z)) continue;
    var x = i % w, y = (i / w) | 0;
    for (var k = 0; k < 8; k++) {
      var nx = x + _waterNeighbours[k][0], ny = y + _waterNeighbours[k][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      var ni = ny * w + nx;
      if (!(H[ni] === H[ni])) continue;
      if (!(rim[ni] === rim[ni])) cells.push(ni);
      if (!(rim[ni] <= z)) rim[ni] = z;
    }
  }
  field.rim = rim; field.rimCells = cells;
  return cells.length;
}
// Whether water standing at `surface` around cell c reaches reserved ground
// lower than that surface: some open cell within `reach` cells of c (c itself
// for a one-cell trickle; a river's half-width for a carved river) would be
// under that water and lies beside such ground.
function _waterReachesSink(field, c, surface, reach) {
  if (!field.rimCells || !field.rimCells.length) return false;
  var w = field.w, h = field.h, H = field.height, rim = field.rim, cx = c % w, cy = (c / w) | 0, r = Math.floor(reach);
  for (var dy = -r; dy <= r; dy++) {
    for (var dx = -r; dx <= r; dx++) {
      var x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h || dx * dx + dy * dy > reach * reach) continue;
      var q = y * w + x;
      if (rim[q] < surface && H[q] + WATER_WET_EPS < surface) return true;
    }
  }
  return false;
}

// Priority flood from a basin floor. Cells join in order of height; the level
// rises to each joined cell. The first frontier cell lower than the level is
// the spill point. Cells deeper than WATER_MIN_DEPTH become lake; the
// shallow path from the entry to the spill becomes river so a flat never
// leaves a gap.
function _waterFillBasin(field, start, bodyId, scratch, stats, budget, opsLeft) {
  var w = field.w, h = field.h, H = field.height, stamp = scratch.stamp, parent = scratch.parent, heap = scratch.heap;
  var mark = ++scratch.serial, members = scratch.members, count = 0, level = H[start], ops = 0;
  heap.size = 0;
  stamp[start] = mark; parent[start] = -1; members[count++] = start;
  _waterPushNeighbours(field, start, mark, scratch);
  var spill = -1, spillFrom = -1, end = 'exhausted', edgeHit = false, drain = -1;
  while (heap.size > 0) {
    if (ops++ > opsLeft) { end = 'capped'; stats.capped++; break; }
    var cell = _waterHeapPop(heap), own = scratch.claim[cell] === scratch.claimSerial;
    // Reserved ground joins in height order like the rest of the rim; when
    // the water reaches it the basin drains there, so its level rises to
    // that ground at most (the window edge, below, ends it the same way).
    if (!(H[cell] === H[cell])) {
      if (field.sink[cell] > level) level = field.sink[cell];
      drain = cell; edgeHit = true; spillFrom = parent[cell]; end = 'outflow'; stats.outflows++; break;
    }
    // A rising lake may drown this source's own upstream river or an earlier
    // basin (they merge), but it can only spill onto unclaimed ground, so
    // every spill makes progress and the solve always ends.
    if (!own && H[cell] < level) { spill = cell; spillFrom = parent[cell]; break; }
    if (_waterJoins(field, cell, bodyId)) { end = 'joined'; stats.joins++; break; }
    if (H[cell] > level) level = H[cell];
    members[count++] = cell;
    if (field.water[cell] === 0 && level - H[start] > WATER_MIN_DEPTH) budget--;
    if (budget <= 0) { end = 'exhausted'; stats.exhausted++; break; }
    if (_waterPushNeighbours(field, cell, mark, scratch)) { edgeHit = true; spillFrom = cell; end = 'outflow'; stats.outflows++; break; }
  }
  if (heap.size === 0 && spill < 0 && end === 'exhausted' && budget > 0) end = 'enclosed';
  // Lake: every member below the final level by more than the minimum depth.
  var lake = 0;
  for (var m = 0; m < count; m++) {
    var ci = members[m];
    scratch.claim[ci] = scratch.claimSerial;
    // This source's own river and earlier lakes are drowned into the new level.
    if (field.water[ci] && field.body[ci] !== bodyId) continue;
    if (level - H[ci] > WATER_MIN_DEPTH) {
      field.water[ci] = WATER_KIND.still; field.surface[ci] = level; field.body[ci] = bodyId;
      field.dirX[ci] = 0; field.dirY[ci] = 0; field.speed[ci] = 0; lake++;
    } else if (field.water[ci] && field.surface[ci] < level) {
      field.surface[ci] = level;  // shallow own water rises with the merged lake
    }
  }
  if (lake) stats.lakes++;
  stats.lake += lake;
  if (spill >= 0 || edgeHit) {
    // Shallow members on the path from the entry to the exit (the spill, or
    // the window edge) carry the river across; every path cell, lake or
    // river, points on toward the exit.
    for (var p = spillFrom, next = spill; p >= 0; next = p, p = parent[p]) {
      if (!field.water[p]) _waterMarkRiver(field, p, bodyId, stats, level);
      // The crossing is one sheet at the lake's level, flat to the exit.
      if (field.body[p] === bodyId) field.surface[p] = Math.max(level, H[p]);
      if (next >= 0) _waterSetDir(field, p, next, H[p] - H[next]);
      if (field.water[p] === WATER_KIND.still) field.speed[p] = 0.08;
    }
    if (spill >= 0) field.flags[spillFrom >= 0 ? spillFrom : start] |= WATER_FLAG_SPILL;
  }
  return {spill: spill, budget: budget, ops: ops, end: end, level: level, edge: edgeHit, drain: drain, from: spillFrom};
}
// Pushes unvisited passable 8-neighbours (the same connectivity as the
// downhill step, so a diagonal outlet is never missed) and reserved ground
// (keyed by its own height); returns true when the basin touches the window
// edge (water leaves the solved area there).
function _waterPushNeighbours(field, cell, mark, scratch) {
  var w = field.w, h = field.h, cx = cell % w, cy = (cell / w) | 0, edge = false;
  for (var k = 0; k < 8; k++) {
    var nx = cx + _waterNeighbours[k][0], ny = cy + _waterNeighbours[k][1];
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) { edge = true; continue; }
    var ni = ny * w + nx;
    if (scratch.stamp[ni] === mark) continue;
    var key = _waterPassable(field, ni) ? field.height[ni] : field.sink[ni];
    if (!(key === key)) continue;
    scratch.stamp[ni] = mark; scratch.parent[ni] = cell;
    _waterHeapPush(scratch.heap, ni, key);
  }
  return edge;
}

function createWaterScratch(n) {
  return {stamp: new Int32Array(n), parent: new Int32Array(n), members: new Int32Array(n), claim: new Int32Array(n), best: new Float32Array(n),
    heap: _waterHeap(1024), serial: 0, claimSerial: 0};
}

// Solves sources in order (strongest first is the caller's choice); rivers
// that reach earlier water join it. Returns per-solve stats.
function solveWaterSources(field, sources, scratch) {
  var stats = {sources: sources.length, river: 0, lake: 0, lakes: 0, joins: 0, outflows: 0, drains: 0, exhausted: 0,
    capped: 0, rejected: 0, falls: 0, ends: {}};
  scratch = scratch || createWaterScratch(field.w * field.h);
  _waterBuildRim(field);
  for (var s = 0; s < sources.length; s++) {
    var end = solveWaterSource(field, sources[s], s + 1, scratch, stats);
    stats.ends[end] = (stats.ends[end] || 0) + 1;
    sources[s].end = end;
  }
  return stats;
}

// ── World integration ──
// The toggle selects the solved system; off keeps the legacy flags exactly.
var WATER_SYSTEM_ENABLED = true;
var WATER_LAKE_LEVEL = -3.0;       // Endless valley pools: the legacy wet threshold, now a flat surface
var WATER_SPRING_MIN_H = 2.5;      // a chunk's highest open ground must reach this to hold a spring
var WATER_SPRING_CHANCE = 0.35;
var WATER_SPRING_STRENGTH = [260, 900];
// Rivers are objects composited into the terrain: a smoothed centreline with
// a surface that falls downstream and is level across, a width from the
// spring's strength, and a channel carved into the ground beneath.
var WATER_RIVER_HALF_WIDTH = [18, 30];  // world units, weakest to strongest spring (several height points across)
var WATER_RIVER_BED_DEPTH = 0.45;       // mesh units below the surface at the centreline
var WATER_BANK_WIDTH = 18;              // world units over which a cut bank rises to higher ground
var WATER_BANK_LIP = 0.25;              // mesh units a levee stands above the water
var WATER_LEVEE_WIDTH = 20;             // world units of levee shelf beside the water (wider than the height grid)
var WATER_LEVEE_FALL = 18;              // world units over which a levee falls back to lower ground
var WATER_BANK_REACH = Math.max(WATER_BANK_WIDTH, WATER_LEVEE_WIDTH + WATER_LEVEE_FALL);
// Carving never moves ground more than these (mesh units) above or below its
// natural height. A levee holding a river above lower ground, or a channel
// cut through higher ground, needs up to about 1 on ordinary terrain; only
// the steps the generator leaves where a structure's levelled ground meets
// natural terrain ask for more.
var WATER_MAX_FILL = 1.0, WATER_MAX_CUT = 1.0;
var WATER_RIVER_STEP = 6;               // world units between river cross-sections
// Reserved ground: the levelled floor of every fortress, arena and watchtower
// (05-endless-world.js, largeStructureFlatRadii's inner zone) plus this margin
// in world units. It covers the widest river half-width and a ribbon's reach
// into its bank (30 + 7), in whole height-grid steps, so neither a channel,
// its banks nor its drawn surface reaches the floor.
var WATER_RESERVE_MARGIN = 48;
var waterStats = {builds: 0, lastSolveMs: 0, maxSolveMs: 0, springs: 0, river: 0, lake: 0, lakes: 0,
  standing: 0, joins: 0, outflows: 0, drains: 0, exhausted: 0, capped: 0, falls: 0, rivers: 0, carved: 0, reserved: 0};
var waterSources = [];             // current window's solved sources, window-local cells
var waterRivers = [];              // current window's river objects (world-space centrelines)
var _waterScratch = null, _waterField = null;

// Rivers carve the terrain, so switching rebuilds the window from its chunks
// (the carve runs during assembly, before walk data is derived from heights).
function setWaterSystemEnabled(on) {
  WATER_SYSTEM_ENABLED = !!on;
  if (typeof ENDLESS_MODE !== 'undefined' && ENDLESS_MODE && floorMesh && floorMesh.water && typeof assembleWindow === 'function') {
    var half = Math.floor(WINDOW_CHUNKS / 2);
    assembleWindow(windowCX + half, windowCY + half);
  }
}
function _waterNow() {
  return typeof performance === 'object' && performance && performance.now ? performance.now() : Date.now();
}
// A height point stands for the floor square to its south-east (waterAt and
// the ground colours read a square's first corner), so it is closed when the
// wall cell under that square's centre is solid. Found in world units, so the
// wall grid and the height grid need not share a cell size.
function _waterWallAt(mesh, i) {
  if (!grid) return false;
  var gs = mesh.gridSize, gx = Math.floor((i % mesh.w + 0.5) * gs / cell), gy = Math.floor((((i / mesh.w) | 0) + 0.5) * gs / cell);
  return gx >= 0 && gy >= 0 && gx < gridW && gy < gridH && !!grid[gy * gridW + gx];
}
// Plain surface ground at a height point, or NaN: walls, cave interiors,
// carved entrance ramps and cave caps are never water's ground.
function _waterPlainGround(mesh, i) {
  if (_waterWallAt(mesh, i)) return NaN;
  if (!mesh.layerCount || mesh.layerCount[i] !== 1 || mesh.l0Type[i] !== 1) return NaN;
  var top = mesh.l0TopZ[i];
  return mesh.surfaceH && top === mesh.surfaceH[i] ? top : NaN;
}
// Open ground for water: plain surface ground that is not reserved
// (mesh.waterReserve, built per window by _waterReserveMask).
function _waterWindowBed(mesh, i) {
  return mesh.waterReserve && mesh.waterReserve[i] ? NaN : _waterPlainGround(mesh, i);
}
// Ground water keeps off: every large structure's levelled floor plus
// WATER_RESERVE_MARGIN. Each structure comes from the generator's own region
// rule (largeStructureForRegion) with the generator's radii and distance, so
// a point is reserved the same way in every window that holds it, a chunk
// that recorded a neighbouring structure is covered too, and nothing waits
// for the window's largeStructures list (assembled after the water). Legacy
// valley pools there keep their water. Built once per window build.
function _waterReserveMask(mesh) {
  var w = mesh.w, h = mesh.h, gs = mesh.gridSize, n = w * h, span = STRUCTURE_REGION_CHUNKS;
  var mask = mesh.waterReserve && mesh.waterReserve.length === n ? mesh.waterReserve : new Uint8Array(n);
  mask.fill(0);
  var rx0 = Math.floor(windowCX / span) - 1, rx1 = Math.floor((windowCX + WINDOW_CHUNKS - 1) / span) + 1;
  var ry0 = Math.floor(windowCY / span) - 1, ry1 = Math.floor((windowCY + WINDOW_CHUNKS - 1) / span) + 1;
  for (var ry = ry0; ry <= ry1; ry++) {
    for (var rx = rx0; rx <= rx1; rx++) {
      var st = largeStructureForRegion(rx, ry);
      if (!st) continue;
      var reach = largeStructureFlatRadii(st.type, st.scale).inner + WATER_RESERVE_MARGIN;
      var lx = st.centerWX - windowOriginX, ly = st.centerWY - windowOriginY;
      var x0 = Math.max(0, Math.floor((lx - reach) / gs)), x1 = Math.min(w - 1, Math.ceil((lx + reach) / gs));
      var y0 = Math.max(0, Math.floor((ly - reach) / gs)), y1 = Math.min(h - 1, Math.ceil((ly + reach) / gs));
      for (var y = y0; y <= y1; y++) {
        for (var x = x0; x <= x1; x++) {
          if (largeStructureFlatDistance(st.type, x * gs - lx, y * gs - ly) < reach) mask[y * w + x] = 1;
        }
      }
    }
  }
  for (var i = 0; i < n; i++) {
    if (!mask[i] || !mesh.waterLegacy[i]) continue;
    var g = _waterPlainGround(mesh, i);
    if (g === g && g < WATER_LAKE_LEVEL) mask[i] = 0;
  }
  return mask;
}
// One spring per qualifying chunk at its highest open cell. Chunk coordinates
// seed the draws, so a chunk's spring is the same in every window.
function _waterWindowSprings(mesh, field) {
  var springs = [], cells = CHUNK_CELLS, w = mesh.w;
  for (var dy = 0; dy < WINDOW_CHUNKS; dy++) {
    for (var dx = 0; dx < WINDOW_CHUNKS; dx++) {
      var ccx = windowCX + dx, ccy = windowCY + dy, rng = chunkRng(ccx, ccy, 71);
      if (rng() >= WATER_SPRING_CHANCE) continue;
      var strength = Math.round(WATER_SPRING_STRENGTH[0] + rng() * (WATER_SPRING_STRENGTH[1] - WATER_SPRING_STRENGTH[0]));
      var best = -1, bestH = -Infinity;
      for (var y = 1; y < cells - 1; y++) {
        for (var x = 1; x < cells - 1; x++) {
          var i = (dy * cells + y) * w + dx * cells + x, hgt = field.height[i];
          if (hgt === hgt && hgt > bestH && !field.water[i]) { bestH = hgt; best = i; }
        }
      }
      if (best < 0 || bestH < WATER_SPRING_MIN_H) continue;
      // The solver drains a spring's water where its river, as wide as
      // carving makes it, would reach reserved ground (_waterReachesSink).
      springs.push({cell: best, strength: strength, chunk: ccx + ',' + ccy, kind: 'spring', height: bestH,
        reach: _waterRiverHalfWidth(strength) / mesh.gridSize});
    }
  }
  // Stronger springs claim their valleys first; ties break by chunk order.
  springs.sort(function(a, b) { return b.strength - a.strength || a.cell - b.cell; });
  return springs;
}
function _waterEnsureArrays(mesh) {
  var n = mesh.w * mesh.h;
  if (!mesh.waterSurface || mesh.waterSurface.length !== n) {
    mesh.waterSurface = new Float32Array(n); mesh.waterDepth = new Float32Array(n);
    mesh.waterSpeed = new Float32Array(n); mesh.waterFlags = new Uint8Array(n); mesh.waterBody = new Int32Array(n);
  }
  if (!mesh.waterDirX || mesh.waterDirX.length !== n) { mesh.waterDirX = new Float32Array(n); mesh.waterDirY = new Float32Array(n); }
  if (!mesh.waterLegacy || mesh.waterLegacy.length !== n) mesh.waterLegacy = new Uint8Array(mesh.water);
  if (!mesh.waterShore || mesh.waterShore.length !== n) mesh.waterShore = new Int32Array(n);
}
// Runs once per window assembly (and on toggle). Legacy valley pools become
// flat lakes at WATER_LAKE_LEVEL; springs then route over the window.
function buildWindowWater() {
  var mesh = floorMesh;
  if (!mesh || !mesh.water || !mesh.surfaceH) return null;
  var started = _waterNow(), n = mesh.w * mesh.h;
  _waterEnsureArrays(mesh);
  _waterRestoreBeds(mesh);
  _waterRestoreCarve(mesh);
  mesh.water.set(mesh.waterLegacy);
  // Dry cells hold 0, never NaN: water[i] says whether a cell is wet, and
  // finite values keep generic mesh snapshot comparisons valid.
  mesh.waterSurface.fill(0); mesh.waterDepth.fill(0); mesh.waterSpeed.fill(0); mesh.waterFlags.fill(0);
  mesh.waterBody.fill(0); mesh.waterDirX.fill(0); mesh.waterDirY.fill(0); mesh.waterShore.fill(-1);
  waterSources = []; waterRivers = [];
  if (!WATER_SYSTEM_ENABLED) { mesh.waterReserve = null; waterStats.lastSolveMs = 0; return null; }
  if (!_waterField || _waterField.w !== mesh.w || _waterField.h !== mesh.h) {
    _waterField = createWaterField(mesh.w, mesh.h); _waterScratch = createWaterScratch(n);
  }
  var field = _waterField, standing = 0, reserve = mesh.waterReserve = _waterReserveMask(mesh), reserved = 0;
  // The field writes straight into the mesh's arrays; only the bed is its own.
  field.water = mesh.water; field.surface = mesh.waterSurface; field.dirX = mesh.waterDirX; field.dirY = mesh.waterDirY;
  field.speed = mesh.waterSpeed; field.flags = mesh.waterFlags; field.body = mesh.waterBody;
  for (var i = 0; i < n; i++) {
    // Reserved ground is closed to water but drains it (field.sink).
    var plain = _waterPlainGround(mesh, i), bed = reserve[i] ? NaN : plain;
    field.height[i] = bed; field.sink[i] = reserve[i] ? plain : NaN;
    if (reserve[i]) reserved++;
    if (mesh.water[i]) {
      if (bed === bed && bed < WATER_LAKE_LEVEL) { mesh.water[i] = WATER_KIND.still; mesh.waterSurface[i] = WATER_LAKE_LEVEL; standing++; }
      else mesh.water[i] = 0;
    }
  }
  waterSources = _waterWindowSprings(mesh, field);
  var stats = solveWaterSources(field, waterSources, _waterScratch);
  waterRivers = buildWaterRivers(mesh, waterSources, field);
  stats.carved = carveWaterRivers(mesh, field, waterRivers);
  for (var j = 0; j < n; j++) if (mesh.water[j]) mesh.waterDepth[j] = mesh.waterSurface[j] - field.height[j];
  _waterTintBeds(mesh);
  var ms = _waterNow() - started;
  waterStats.builds++; waterStats.lastSolveMs = ms; waterStats.maxSolveMs = Math.max(waterStats.maxSolveMs, ms);
  waterStats.springs = waterSources.length; waterStats.standing = standing; waterStats.reserved = reserved;
  ['river', 'lake', 'lakes', 'joins', 'outflows', 'drains', 'exhausted', 'capped', 'falls', 'carved'].forEach(function(k) { waterStats[k] = stats[k] || 0; });
  waterStats.rivers = waterRivers.length;
  return stats;
}
function getWaterStats() { return Object.assign({}, waterStats); }

// Trace each spring downstream along the solved flow directions. A river
// ends at a confluence (ground another river already owns), at the window
// edge or where its water stops. Runs through lakes split it: each flowing
// run becomes one river object whose ends reach one point into the lake.
// A river ends where its water would stand above reserved ground beside it
// and drains there, at an end the land holds (see _waterRiverKeepOff and
// _waterRiverDrainFall).
function buildWaterRivers(mesh, sources, field) {
  var w = mesh.w, h = mesh.h, gs = mesh.gridSize, n = w * h, owner = new Int32Array(n), rivers = [];
  for (var s = 0; s < sources.length; s++) {
    var src = sources[s], id = s + 1, c = src.cell, path = [], guard = 0;
    if (c < 0 || !mesh.water[c]) continue;
    while (c >= 0 && guard++ < n) {
      if (owner[c] && owner[c] !== id) { path.push(c); break; }   // confluence
      if (owner[c] === id) break;                                  // loop guard
      owner[c] = id; path.push(c);
      var dx = Math.round(mesh.waterDirX[c]), dy = Math.round(mesh.waterDirY[c]);
      if (!dx && !dy) break;
      var x = c % w + dx, y = ((c / w) | 0) + dy;
      if (x < 0 || y < 0 || x >= w || y >= h || !mesh.water[y * w + x]) break;
      c = y * w + x;
    }
    var halfWidth = _waterRiverHalfWidth(src.strength), run = [];
    for (var k = 0; k <= path.length; k++) {
      var cell = k < path.length ? path[k] : -1, still = cell >= 0 && mesh.water[cell] === WATER_KIND.still;
      if (cell >= 0 && !still) { if (!run.length && k > 0) run.push(path[k - 1]); run.push(cell); continue; }
      if (cell >= 0 && run.length) run.push(cell);             // reach one point into the lake
      var last = run.length ? run[run.length - 1] : -1, drains = cell < 0 && last >= 0 && (mesh.waterFlags[last] & WATER_FLAG_DRAIN);
      var river = run.length >= 3 ? _waterRiverObject(mesh, run, halfWidth, id, rivers.length, run[0] === src.cell, !!drains, field) : null;
      if (river) rivers.push(river);
      run = [];
    }
  }
  return rivers;
}
// A river's half-width in world units, from its spring's strength.
function _waterRiverHalfWidth(strength) {
  var t = Math.max(0, Math.min(1, (strength || 0) / WATER_SPRING_STRENGTH[1]));
  return WATER_RIVER_HALF_WIDTH[0] + (WATER_RIVER_HALF_WIDTH[1] - WATER_RIVER_HALF_WIDTH[0]) * Math.sqrt(t);
}
// Relax the cell path, smooth it (two Chaikin passes), keep the surface
// non-increasing downstream, and resample every WATER_RIVER_STEP world units.
// Relaxing (repeated 1-2-1 neighbour averaging, ends fixed) turns the
// height grid's zigzags into meanders whose bends are wider than the river,
// so the channel reads as one smooth course and the ribbon's cross-sections
// do not fold over each other on the inside of a bend. The carve follows
// the relaxed line, so the channel moves with it.
var WATER_RIVER_RELAX = 10;
function _waterRiverObject(mesh, cells, halfWidth, body, index, fromSpring, drains, field) {
  var w = mesh.w, gs = mesh.gridSize, pts = [];
  for (var i = 0; i < cells.length; i++) pts.push([(cells[i] % w) * gs, ((cells[i] / w) | 0) * gs, mesh.waterSurface[cells[i]]]);
  for (var relax = 0; relax < WATER_RIVER_RELAX; relax++) {
    var before = pts.map(function(p) { return p.slice(); });
    for (var ri = 1; ri < pts.length - 1; ri++) {
      for (var c = 0; c < 3; c++) pts[ri][c] = (before[ri - 1][c] + 2 * before[ri][c] + before[ri + 1][c]) * 0.25;
    }
  }
  for (var pass = 0; pass < 2; pass++) {
    var out = [pts[0]];
    for (var j = 0; j < pts.length - 1; j++) {
      var a = pts[j], b = pts[j + 1];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25, a[2] * 0.75 + b[2] * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75, a[2] * 0.25 + b[2] * 0.75]);
    }
    out.push(pts[pts.length - 1]); pts = out;
  }
  var res = [[pts[0][0], pts[0][1], pts[0][2], 0]], carry = 0, arc = 0;
  for (var k = 0; k < pts.length - 1; k++) {
    var p = pts[k], q = pts[k + 1], len = Math.hypot(q[0] - p[0], q[1] - p[1]), d = WATER_RIVER_STEP - carry;
    while (d <= len) {
      var f = d / len;
      res.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f, arc + d]);
      d += WATER_RIVER_STEP;
    }
    carry = len - (d - WATER_RIVER_STEP); arc += len;
  }
  var last = pts[pts.length - 1];
  if (Math.hypot(last[0] - res[res.length - 1][0], last[1] - res[res.length - 1][1]) > 0.5) res.push([last[0], last[1], last[2], arc]);
  for (var m = 1; m < res.length; m++) if (res[m][2] > res[m - 1][2]) res[m][2] = res[m - 1][2];
  // Width per point (index 4): a river that starts at its spring widens over
  // its first few sections instead of opening at full width.
  for (var wI = 0; wI < res.length; wI++) res[wI][4] = halfWidth * (fromSpring ? Math.min(1, 0.4 + 0.12 * wI) : 1);
  var course = {points: res, drains: !!drains, heldBack: 0};
  if (field && field.rimCells && field.rimCells.length) _waterRiverKeepOff(mesh, field, course);
  if (course.drains) _waterRiverDrainFall(mesh, field, course);
  if (course.points.length < 2) return null;
  return {id: index, body: body, halfWidth: halfWidth, depth: WATER_RIVER_BED_DEPTH, points: course.points, drains: course.drains,
    heldBack: course.heldBack};
}
// No river stands above reserved ground beside its water. Its water is what
// carveWaterRivers writes: the points within its width of its course, its
// rounded ends included unless an end opens into a lake, wet where the
// surface stands above the ground. The carve never reshapes a point next to
// reserved ground (field.rim), so such a point keeps its own height. The
// river ends at the start of the first stretch whose water would stand above
// reserved ground beside it, and drains there; water standing above it only
// past its end means it drains; at its very start it means there is no river
// (course.points shorter than 2). A drained river's end is not tested here:
// its surface falls there to no higher than the reserved ground within its
// end's shore (_waterRiverDrainFall), which covers its rounded end.
function _waterRiverKeepOff(mesh, field, course) {
  var pts = course.points, gs = mesh.gridSize, w = mesh.w, H = field.height, rim = field.rim, cells = field.rimCells;
  var startLake = _waterLakeAt(mesh, pts[0]) >= 0;
  while (pts.length >= 2) {
    var last = pts.length - 1, endLake = _waterLakeAt(mesh, pts[last]) >= 0, first = Infinity;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, wide = 0;
    for (var k = 0; k <= last; k++) {
      var pk = pts[k];
      x0 = Math.min(x0, pk[0]); x1 = Math.max(x1, pk[0]); y0 = Math.min(y0, pk[1]); y1 = Math.max(y1, pk[1]); wide = Math.max(wide, pk[4]);
    }
    for (var c = 0; c < cells.length; c++) {
      var q = cells[c], px = (q % w) * gs, py = ((q / w) | 0) * gs;
      if (px <= x0 - wide || px >= x1 + wide || py <= y0 - wide || py >= y1 + wide || mesh.water[q] === WATER_KIND.still) continue;
      // The nearest point of the course, as the carve finds it.
      var bd = Infinity, bk = 0, bt = 0, braw = 0;
      for (var s = 0; s < last; s++) {
        var a = pts[s], b = pts[s + 1], sx = b[0] - a[0], sy = b[1] - a[1], l2 = sx * sx + sy * sy;
        var raw = l2 > 0 ? ((px - a[0]) * sx + (py - a[1]) * sy) / l2 : 0, t = Math.max(0, Math.min(1, raw));
        var d = Math.hypot(px - a[0] - sx * t, py - a[1] - sy * t);
        if (d < bd) { bd = d; bk = s; bt = t; braw = raw; }
      }
      var A = pts[bk], B = pts[bk + 1], pastStart = bk === 0 && braw < 0, pastEnd = bk === last - 1 && braw > 1;
      if (bd >= A[4] + (B[4] - A[4]) * bt || (pastStart && startLake) || (pastEnd && (course.drains || endLake))) continue;
      var S = A[2] + (B[2] - A[2]) * bt;
      if (!(S > rim[q]) || !(S - H[q] > WATER_WET_EPS)) continue;
      var at = pastStart ? -1 : pastEnd ? last : bk;
      if (at < first) first = at;
    }
    if (first === Infinity) return;
    course.drains = true;
    if (first < last) pts.length = first + 1;
  }
}
// A drained river ends in a rounded end like any other open end: the carve
// shapes it and writes its water, and the ribbon draws its cap. Its end must
// be one the land holds. The end's shore is the ground ahead of it within its
// half-width, its levee's width (WATER_LEVEE_WIDTH) and one height-grid step,
// and the reserved ground within that distance. The river's surface
// falls over its last WATER_DRAIN_FALL world units to the lowest ground of
// that shore, so its water meets the land there instead of stopping above it,
// but never below what its channel can hold (_waterRiverFloor), so its tail
// never runs dry. Where the shore cannot hold even that (_waterDrainEnd), the
// river ends a section earlier, until it can.
var WATER_DRAIN_FALL = 36;
// How far a drained river's surface may sink below the ground under its
// course where the carve shapes that ground: its channel, cut no deeper than
// WATER_MAX_CUT, still holds WATER_RIVER_BED_DEPTH of water there.
var WATER_DRAIN_SINK = WATER_MAX_CUT - WATER_RIVER_BED_DEPTH;
// Whether the carve may reshape height point v (it is open, as are its eight
// neighbours, and it is not on the window's border).
function _waterCarvable(mesh, H, v) {
  var w = mesh.w, x = v % w, y = (v / w) | 0;
  if (x < 1 || y < 1 || x >= w - 1 || y >= mesh.h - 1) return false;
  for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
    var o = v + oy * w + ox;
    if (!(H[o] === H[o])) return false;
  }
  return true;
}
// The lowest surface a river can hold at course point p, from the ground at
// its nearest height point: WATER_DRAIN_SINK below it where the carve shapes
// that point, and WATER_MIN_DEPTH above it where the carve leaves it as it is
// (a surface no higher than that ground would leave it dry); -Infinity off
// open ground or on a lake (no river water is written there).
function _waterRiverFloor(mesh, field, p) {
  var gs = mesh.gridSize, w = mesh.w, H = field.height;
  var gx = Math.max(0, Math.min(w - 1, Math.round(p[0] / gs))), gy = Math.max(0, Math.min(mesh.h - 1, Math.round(p[1] / gs))), v = gy * w + gx;
  if (!(H[v] === H[v]) || mesh.water[v] === WATER_KIND.still) return -Infinity;
  return _waterCarvable(mesh, H, v) ? H[v] - WATER_DRAIN_SINK : H[v] + WATER_MIN_DEPTH;
}
// The shore of the course's current end: its lowest ground (a lake there
// counts at its surface), and the highest surface it holds. Reserved ground
// and ground the carve leaves as it is hold water up to their own height; no
// water stands above them. Ground the carve shapes holds it up to
// WATER_MAX_FILL - WATER_BANK_LIP higher, where a levee as high as carving
// may raise it still stands WATER_BANK_LIP above the water.
function _waterDrainEnd(mesh, field, pts) {
  var e = pts[pts.length - 1], o = pts[pts.length - 2], gs = mesh.gridSize, w = mesh.w, h = mesh.h, H = field.height, sink = field.sink;
  var dx = e[0] - o[0], dy = e[1] - o[1];
  var ex = Math.max(0, Math.min(w - 1, Math.round(e[0] / gs))), ey = Math.max(0, Math.min(h - 1, Math.round(e[1] / gs)));
  var reach = e[4] + WATER_LEVEE_WIDTH + gs, r = Math.ceil(reach / gs), low = Infinity, hold = Infinity;
  for (var oy = -r; oy <= r; oy++) {
    for (var ox = -r; ox <= r; ox++) {
      var x = ex + ox, y = ey + oy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      var px = x * gs - e[0], py = y * gs - e[1];
      if (Math.hypot(px, py) > reach) continue;
      var v = y * w + x, reserved = sink[v] === sink[v], z = reserved ? sink[v] : H[v];
      if (!(z === z) || !(reserved || px * dx + py * dy > 0)) continue;
      var still = mesh.water[v] === WATER_KIND.still;
      if (still && mesh.waterSurface[v] > z) z = mesh.waterSurface[v];
      if (z < low) low = z;
      var held = reserved || still || !_waterCarvable(mesh, H, v) ? z : z + WATER_MAX_FILL - WATER_BANK_LIP;
      if (held < hold) hold = held;
    }
  }
  return {low: low, hold: hold, floor: _waterRiverFloor(mesh, field, e)};
}
function _waterRiverDrainFall(mesh, field, course) {
  var pts = course.points, end = null, arc = pts.length ? pts[pts.length - 1][3] : 0;
  while (pts.length >= 2) {
    end = _waterDrainEnd(mesh, field, pts);
    if (!(end.floor > end.hold)) break;
    pts.length--;
  }
  if (pts.length < 2) return;
  var e = pts[pts.length - 1], target = Math.max(end.low, end.floor);
  course.heldBack = arc - e[3];
  if (!(target < e[2])) return;
  // The surface never rises downstream, so no point falls below the floor of
  // any point after it.
  for (var k = pts.length - 1, floor = -Infinity; k >= 0; k--) {
    var f = (e[3] - pts[k][3]) / WATER_DRAIN_FALL;
    if (f >= 1) break;
    floor = Math.max(floor, _waterRiverFloor(mesh, field, pts[k]));
    var fall = Math.max(target + (pts[k][2] - target) * f * f * (3 - 2 * f), floor);
    if (fall < pts[k][2]) pts[k][2] = fall;
  }
}

// The lake point a river end sits on (its nearest height point), or -1.
function _waterLakeAt(mesh, p) {
  var vx = Math.round(p[0] / mesh.gridSize), vy = Math.round(p[1] / mesh.gridSize);
  if (vx < 0 || vy < 0 || vx >= mesh.w || vy >= mesh.h) return -1;
  var v = vy * mesh.w + vx;
  return mesh.water[v] === WATER_KIND.still ? v : -1;
}
// Carving is undone before any rebuild of the same window, so building twice
// gives the same terrain as building once (plain surface points keep
// l0TopZ equal to surfaceH, so one saved value restores both).
function _waterRestoreCarve(mesh) {
  var saved = mesh.waterCarveSaved;
  if (!saved) return;
  for (var key in saved) { mesh.l0TopZ[key] = saved[key]; mesh.surfaceH[key] = saved[key]; }
  var colours = mesh.waterCarveColors;
  if (colours && mesh.l0Color) for (var c in colours) mesh.l0Color[c] = colours[c];
  mesh.waterCarveSaved = null; mesh.waterCarveColors = null;
}
// The natural colour of each river's banks along its course (ground just
// outside the channel, before any bed tint), smoothed along the river. The
// bed under a river is painted from it (see _waterTintBeds), so the colour
// changes gradually across the channel and along it instead of stepping
// between bank and bed at the height grid's squares.
function _waterRiverShores(mesh, H, rivers, bestD, bestW, bestR, bestK) {
  var n = mesh.w * mesh.h, gs = mesh.gridSize, sums = [];
  for (var r = 0; r < rivers.length; r++) sums.push(new Float64Array(rivers[r].points.length * 4));
  for (var v = 0; v < n; v++) {
    var ri = bestR[v];
    if (ri < 0 || !(H[v] === H[v]) || bestD[v] < bestW[v] || bestD[v] > bestW[v] + gs * 1.5) continue;
    var nat = _waterNaturalColour(mesh, v);
    if (!nat) continue;
    var rgb = _waterHex(nat), acc = sums[ri], o = bestK[v] * 4;
    acc[o] += rgb[0]; acc[o + 1] += rgb[1]; acc[o + 2] += rgb[2]; acc[o + 3]++;
  }
  for (var r2 = 0; r2 < rivers.length; r2++) {
    var count = rivers[r2].points.length, a = sums[r2], shore = new Int32Array(count).fill(-1), filled = [], k;
    for (k = 0; k < count; k++) filled.push(a[k * 4 + 3] ? [a[k * 4] / a[k * 4 + 3], a[k * 4 + 1] / a[k * 4 + 3], a[k * 4 + 2] / a[k * 4 + 3]] : null);
    // Points without a sampled bank borrow the nearest sampled one.
    for (k = 1; k < count; k++) if (!filled[k] && filled[k - 1]) filled[k] = filled[k - 1];
    for (k = count - 2; k >= 0; k--) if (!filled[k] && filled[k + 1]) filled[k] = filled[k + 1];
    for (k = 0; k < count; k++) {
      if (!filled[k]) continue;
      var sr = 0, sg = 0, sb = 0, sn = 0;
      for (var j = Math.max(0, k - 3); j <= Math.min(count - 1, k + 3); j++) { sr += filled[j][0]; sg += filled[j][1]; sb += filled[j][2]; sn++; }
      shore[k] = (Math.round(sr / sn) << 16) | (Math.round(sg / sn) << 8) | Math.round(sb / sn);
    }
    rivers[r2].shore = shore;
  }
}
// Composite each river into the terrain. For every open ground point near a
// river, find the closest centreline point (distance d, surface S): inside
// the channel (d < halfWidth) the bed is a parabola reaching
// WATER_RIVER_BED_DEPTH below S. It meets the surface at the channel edge
// with a steady slope and the bank keeps rising at that slope, so the ground
// is close to linear in d across the waterline and the rendered shoreline
// (where the interpolated ground crosses S) follows the channel edge instead
// of zigzagging along height-grid triangles. Beside the channel the bank is
// the higher of two shapes: a cut bank that rises from S to higher natural
// ground, and a levee shelf WATER_BANK_LIP above S that falls back to lower
// natural ground only after WATER_LEVEE_WIDTH. The shelf is wider than the
// height grid's spacing, so the rendered ground next to the water always
// stands above it and the river never hangs over a falling slope. Every
// open end, one that drains into reserved ground included, is rounded the
// same way. Walls, caves, reserved ground, lakes and points next to closed
// ground are left unchanged, and no ground rises more than WATER_MAX_FILL
// above or sinks more than WATER_MAX_CUT below its natural height (the bounds
// bind only at terrain steps, where the water may stand above a bank or run
// dry; a point that the cut bound would leave dry is not cut at all). Then
// river water is written from the channel: level across, falling downstream.
// Returns the points carved.
function carveWaterRivers(mesh, field, rivers) {
  var w = mesh.w, h = mesh.h, gs = mesh.gridSize, n = w * h, H = field.height;
  // Rivers replace the solver's per-point river marks.
  for (var i = 0; i < n; i++) {
    if (mesh.water[i] !== WATER_KIND.flowing) continue;
    mesh.water[i] = 0; mesh.waterSurface[i] = 0; mesh.waterDirX[i] = 0; mesh.waterDirY[i] = 0;
    mesh.waterSpeed[i] = 0; mesh.waterBody[i] = 0;
  }
  if (!rivers.length) return 0;
  var bestD = new Float32Array(n).fill(Infinity), bestS = new Float32Array(n), bestTX = new Float32Array(n),
    bestTY = new Float32Array(n), bestSlope = new Float32Array(n), bestW = new Float32Array(n), bestR = new Int32Array(n).fill(-1),
    bestK = new Int32Array(n), bestEnd = new Int8Array(n);
  for (var r = 0; r < rivers.length; r++) {
    var rv = rivers[r], pts = rv.points, reach = rv.halfWidth + WATER_BANK_REACH;
    rv.mouthLake = [_waterLakeAt(mesh, pts[0]), _waterLakeAt(mesh, pts[pts.length - 1])];
    for (var k = 0; k < pts.length - 1; k++) {
      var a = pts[k], b = pts[k + 1], sx = b[0] - a[0], sy = b[1] - a[1], len2 = sx * sx + sy * sy, len = Math.sqrt(len2) || 1;
      var slope = Math.max(0, (a[2] - b[2]) / len);
      var gx0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - reach) / gs)), gx1 = Math.min(w - 1, Math.ceil((Math.max(a[0], b[0]) + reach) / gs));
      var gy0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - reach) / gs)), gy1 = Math.min(h - 1, Math.ceil((Math.max(a[1], b[1]) + reach) / gs));
      for (var gy = gy0; gy <= gy1; gy++) for (var gx = gx0; gx <= gx1; gx++) {
        var v = gy * w + gx, px = gx * gs, py = gy * gs;
        var tRaw = len2 > 0 ? ((px - a[0]) * sx + (py - a[1]) * sy) / len2 : 0, t = Math.max(0, Math.min(1, tRaw));
        var d = Math.hypot(px - (a[0] + sx * t), py - (a[1] + sy * t));
        if (d >= reach || d >= bestD[v]) continue;
        bestD[v] = d; bestS[v] = a[2] + (b[2] - a[2]) * t; bestTX[v] = sx / len; bestTY[v] = sy / len;
        bestSlope[v] = slope; bestW[v] = a[4] + (b[4] - a[4]) * t; bestR[v] = r; bestK[v] = t < 0.5 ? k : k + 1;
        bestEnd[v] = k === pts.length - 2 && tRaw > 1 ? 1 : k === 0 && tRaw < 0 ? -1 : 0;
      }
    }
  }
  var carved = 0, saved = mesh.waterCarveSaved = {};
  for (var q = 0; q < n; q++) {
    var ri = bestR[q];
    if (ri < 0 || !(H[q] === H[q]) || mesh.water[q] === WATER_KIND.still) continue;
    var river = rivers[ri], hw = bestW[q], d2 = bestD[q], S = bestS[q];
    if (d2 >= hw + WATER_BANK_REACH) continue;
    // Points next to walls, caves or reserved ground keep their height (wall
    // caps and cave mouths are derived from it, and _waterRiverKeepOff counts
    // on it); points beside lakes may be shaped.
    var ground = H[q];
    if (_waterCarvable(mesh, H, q)) {
      var edgeSlope = 2 * river.depth / hw;   // mesh units per world unit where the bed meets the surface
      if (d2 < hw) { var u = d2 / hw; ground = S - river.depth * (1 - u * u); }
      else {
        var e = d2 - hw, T = H[q], lip = S + WATER_BANK_LIP;
        var c0 = Math.min(1, e / WATER_BANK_WIDTH), cut = S + (T - S) * c0 * c0 * (3 - 2 * c0);
        var levee;
        if (e < WATER_LEVEE_WIDTH) levee = S + Math.min(WATER_BANK_LIP, edgeSlope * e);
        else { var f0 = Math.min(1, (e - WATER_LEVEE_WIDTH) / WATER_LEVEE_FALL); levee = lip + (Math.min(T, lip) - lip) * f0 * f0 * (3 - 2 * f0); }
        ground = Math.max(cut, levee);
      }
      if (ground > H[q] + WATER_MAX_FILL) ground = H[q] + WATER_MAX_FILL;
      if (ground < H[q] - WATER_MAX_CUT) {
        ground = H[q] - WATER_MAX_CUT;
        // Ground cut as deep as the bound allows that still holds no water
        // here (a channel point, or a bank above the water) is not cut at
        // all: no dry pit or notch where the water runs below a terrain step.
        if (!(S - ground > WATER_WET_EPS)) ground = H[q];
      }
      if (ground !== H[q]) {
        saved[q] = mesh.l0TopZ[q];
        H[q] = ground; mesh.l0TopZ[q] = ground; mesh.surfaceH[q] = ground; carved++;
      }
    }
    // Past an end that opens into a lake the channel is part of that lake.
    var mouth = bestEnd[q] ? river.mouthLake[bestEnd[q] > 0 ? 1 : 0] : -1;
    if (d2 < hw && S - ground > WATER_WET_EPS && mouth >= 0) {
      mesh.water[q] = WATER_KIND.still; mesh.waterSurface[q] = mesh.waterSurface[mouth]; mesh.waterBody[q] = mesh.waterBody[mouth];
    } else if (d2 < hw && S - ground > WATER_WET_EPS) {
      mesh.water[q] = WATER_KIND.flowing; mesh.waterSurface[q] = S; mesh.waterBody[q] = river.body;
      mesh.waterDirX[q] = bestTX[q]; mesh.waterDirY[q] = bestTY[q];
      mesh.waterSpeed[q] = Math.max(0.25, Math.min(1, 0.25 + bestSlope[q] * 30));
    }
  }
  _waterRecolourCarved(mesh, H);
  _waterRiverShores(mesh, H, rivers, bestD, bestW, bestR, bestK);
  for (var s2 = 0; s2 < n; s2++) {
    if (mesh.water[s2] === WATER_KIND.flowing && bestR[s2] >= 0) mesh.waterShore[s2] = rivers[bestR[s2]].shore[bestK[s2]];
  }
  return carved;
}
// Ground colour follows height in this world, with slope shading baked in
// at generation. Carved ground takes the colour the generator would give it
// at its new height, shaded from its new neighbours, so a levee raised out of
// a dark valley reads as bank and the channel's sides shade like terrain.
// Originals are kept (mesh.waterCarveColors) and restored with the heights.
function _waterRecolourCarved(mesh, H) {
  var saved = mesh.waterCarveSaved, colours = mesh.waterCarveColors = {};
  if (!saved || !mesh.l0Color || typeof getFloorColorBlended !== 'function') return;
  var w = mesh.w, gs = mesh.gridSize;
  for (var key in saved) {
    var v = +key, x = v % w, y = (v / w) | 0, hc = H[v];
    if (mesh.waterLegacy[v] || typeof mesh.l0Color[v] !== 'string' || mesh.l0Color[v].charAt(0) !== '#') continue;
    var hN = H[v - w], hS = H[v + w], hE = H[v + 1], hW = H[v - 1];
    var base = _waterHex(getFloorColorBlended(x * gs + windowOriginX, y * gs + windowOriginY, hc));
    // The generator's slope shading (05-endless-world.js, chunk floor mesh).
    var slope = (hN + hS + hE + hW) * 0.25 - hc, sunDot = (-(hE - hW) * 0.5 - (hS - hN) * 0.5) * 0.5, shade = 0;
    if (slope > 0.15) shade -= Math.min(0.12, slope * 0.10);
    else if (slope < -0.15) shade += Math.min(0.10, -slope * 0.08);
    if (sunDot > 0.1) shade += Math.min(0.14, sunDot * 0.12);
    else if (sunDot < -0.1) shade -= Math.min(0.10, -sunDot * 0.08);
    var mult = shade < -0.02 || shade > 0.02 ? 1 + shade : 1;
    colours[v] = mesh.l0Color[v];
    mesh.l0Color[v] = _waterHexOut(Math.floor(base[0] * mult), Math.floor(base[1] * mult), Math.floor(base[2] * mult));
  }
}

// The ground under and around water is painted deliberately. Low valley
// ground is authored very dark (colour follows height), which reads as a void
// through translucent water, so squares fully under water become a wet
// sand-and-mud lakebed that grows muddier and darker with depth (so a
// channel's bed shades smoothly from its banks) but never turns black,
// and a square the shoreline crosses takes the natural colour of its highest
// (driest) corner, so a bank rising out of the water reads as land. A floor
// square takes its colour from its first corner, so only squares whose first
// corner is under water are recoloured; dry ground is never touched. Legacy
// pools were painted solid blue at generation; their natural pre-water
// colour (the window's surfaceBiome) is the starting point instead.
// Originals are kept so switching the system off restores them exactly.
var WATER_BED_TONE = [96, 84, 62];
var WATER_BED_MUD = [0.4, 0.75];   // share of bed tone in shallow and in deep water (grades the shoreline)
function _waterHex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function _waterHexOut(r, g, b) {
  return '#' + ((1 << 24) | (Math.round(Math.max(0, Math.min(255, r))) << 16) |
    (Math.round(Math.max(0, Math.min(255, g))) << 8) | Math.round(Math.max(0, Math.min(255, b)))).toString(16).slice(1);
}
function _waterNaturalColour(mesh, v) {
  if (mesh.waterLegacy && mesh.waterLegacy[v] && mesh.surfaceBiome && typeof mesh.surfaceBiome[v] === 'string') return mesh.surfaceBiome[v];
  var c = mesh.l0Color[v];
  return typeof c === 'string' && c.charAt(0) === '#' ? c : null;
}
function _waterTintBeds(mesh) {
  if (!mesh.l0Color) return;
  var saved = {}, w = mesh.w, h = mesh.h;
  for (var y = 0; y < h - 1; y++) {
    for (var x = 0; x < w - 1; x++) {
      var i = y * w + x, a = mesh.water[i], b = mesh.water[i + 1], c = mesh.water[i + w], d = mesh.water[i + w + 1];
      if (!a) continue;
      var original = mesh.l0Color[i];
      if (typeof original !== 'string' || original.charAt(0) !== '#') continue;
      var colour, shore = a === WATER_KIND.flowing && mesh.waterShore ? mesh.waterShore[i] : -1;
      if (shore >= 0) {
        // River bed: its own banks' colour at the waterline (so the squares
        // the shoreline crosses match the bank), muddier and darker toward
        // the deep middle of the channel.
        var t = Math.min(1, mesh.waterDepth[i] / WATER_RIVER_BED_DEPTH);
        var rMud = WATER_BED_MUD[1] * t * t, rKeep = 1 - rMud, dim = 1 - 0.15 * t;
        colour = _waterHexOut((((shore >> 16) & 255) * rKeep + WATER_BED_TONE[0] * rMud) * dim,
          (((shore >> 8) & 255) * rKeep + WATER_BED_TONE[1] * rMud) * dim, ((shore & 255) * rKeep + WATER_BED_TONE[2] * rMud) * dim);
      } else if (a && b && c && d) {
        var nat = _waterNaturalColour(mesh, i) || original, rgb = _waterHex(nat);
        var depth = mesh.waterDepth[i], dark = 1 - Math.min(0.3, depth * 0.18);
        var mud = WATER_BED_MUD[0] + (WATER_BED_MUD[1] - WATER_BED_MUD[0]) * Math.min(1, depth / 0.6), keep = 1 - mud;
        colour = _waterHexOut((rgb[0] * keep + WATER_BED_TONE[0] * mud) * dark,
          (rgb[1] * keep + WATER_BED_TONE[1] * mud) * dark, (rgb[2] * keep + WATER_BED_TONE[2] * mud) * dark);
      } else {
        // The driest corner's natural colour: the bank is land.
        var corners = [i, i + 1, i + w, i + w + 1], best = -1, bestZ = -Infinity;
        for (var k = 0; k < 4; k++) {
          var z = typeof _waterTerrainZ === 'function' ? _waterTerrainZ(mesh, corners[k]) : mesh.l0TopZ[corners[k]];
          if (z === z && z > bestZ && _waterNaturalColour(mesh, corners[k])) { bestZ = z; best = corners[k]; }
        }
        colour = best >= 0 ? _waterNaturalColour(mesh, best) : original;
      }
      saved[i] = original;
      mesh.l0Color[i] = colour;
    }
  }
  mesh.waterBedColors = saved;
}
function _waterRestoreBeds(mesh) {
  var saved = mesh.waterBedColors;
  if (!saved || !mesh.l0Color) return;
  for (var key in saved) mesh.l0Color[key] = saved[key];
  mesh.waterBedColors = null;
}

// The one query every consumer uses. Window-local world coordinates, like
// getFloorHeightAt. Returns a shared record (copy it to keep it) or null.
// Heights are mesh units; surfaceZ is player units (h*40+60).
var _waterSample = {kind: 0, surface: 0, depth: 0, surfaceZ: 0, flowX: 0, flowY: 0, speed: 0, flags: 0, body: 0};
function waterAt(x, y) {
  var mesh = floorMesh;
  if (!WATER_SYSTEM_ENABLED || !mesh || !mesh.water || !mesh.waterSurface) return null;
  var gx = Math.floor(x / mesh.gridSize), gy = Math.floor(y / mesh.gridSize);
  if (gx < 0 || gy < 0 || gx >= mesh.w || gy >= mesh.h) return null;
  var i = gy * mesh.w + gx, kind = mesh.water[i], surface = mesh.waterSurface[i];
  if (!kind || !(surface === surface)) return null;
  var s = _waterSample;
  s.kind = kind; s.surface = surface; s.depth = mesh.waterDepth[i]; s.surfaceZ = surface * 40 + 60;
  s.flowX = mesh.waterDirX[i] * mesh.waterSpeed[i]; s.flowY = mesh.waterDirY[i] * mesh.waterSpeed[i];
  s.speed = mesh.waterSpeed[i]; s.flags = mesh.waterFlags[i]; s.body = mesh.waterBody[i];
  return s;
}

// ── Movement in water ──
// Wading slows a body; deeper water slows it more; river currents carry it
// along the flow. Everything reads waterAt at the body's feet in the fixed
// simulation tick, never from rendering. Jumping clear of the surface ends
// the effect. Lakes have no current (their speed is zero).
var WATER_WADE_SLOW = 0.45;        // speed lost at full depth
var WATER_FULL_DEPTH_Z = 24;       // player units (0.6 mesh units, about knee deep) for the full effect
var WATER_CURRENT_SPEED = 55;      // world units per second at full river speed and depth
var _waterCurrentScratch = {x: 0, y: 0};

// Water above the feet, in player units (0 when dry or clear of the surface).
function waterImmersionAt(x, y, feetZ) {
  var w = waterAt(x, y);
  if (!w) return 0;
  var depth = w.surfaceZ - feetZ;
  return depth > 0 ? depth : 0;
}
function waterSpeedFactorAt(x, y, feetZ) {
  var depth = waterImmersionAt(x, y, feetZ);
  return depth > 0 ? 1 - WATER_WADE_SLOW * Math.min(1, depth / WATER_FULL_DEPTH_Z) : 1;
}
// Current velocity (world units per second) felt by feet at feetZ.
function waterCurrentAt(x, y, feetZ, out) {
  out = out || _waterCurrentScratch;
  out.x = 0; out.y = 0;
  var w = waterAt(x, y);
  if (!w) return out;
  var depth = w.surfaceZ - feetZ;
  if (!(depth > 0)) return out;
  var k = WATER_CURRENT_SPEED * Math.min(1, depth / WATER_FULL_DEPTH_Z);
  out.x = w.flowX * k; out.y = w.flowY * k;
  return out;
}
// NPCs stand on the bed: their immersion is the cell's water depth.
function waterActorSpeedFactor(actor) {
  var w = actor ? waterAt(actor.x, actor.y) : null;
  return w ? 1 - WATER_WADE_SLOW * Math.min(1, w.depth * 40 / WATER_FULL_DEPTH_Z) : 1;
}
