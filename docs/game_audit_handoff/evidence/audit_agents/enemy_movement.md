# Sub-audit report: Enemy movement audit

Final report of a read-only audit agent (first session phase). The orchestrator spot-checked its claims against source; see HANDOFF.md for which were confirmed, refined or refuted. Line numbers are header lines of components/hardwareone/WebPage_Games.h.

Both halves of the prior claim are partly wrong: most freezes happen in patrol and need no walls, and the surface/cave wall problem is real but only in one direction.

I verified this by running the game's own functions (verbatim line extracts) in `jsc` on wall grids built by the game's own generator. Nothing in the repo was touched.

## Verdict on the prior claim
- **"No pathfinding" is true as a fact but wrong as the cause.** Chase is gated on line of sight, so direct steering almost never jams. In simulation ≥98.75% of LOS chases reach attack range, and ≤0.25% jam while LOS still holds.
- **Most freezes are in patrol.** Patrol has no axis slide at all, and the biggest freeze needs no walls.
- **The surface/cave wall confusion is CONFIRMED, and stronger than claimed.** Some walls are invisible and non-solid to a surface player but solid and LOS-opaque to every enemy.
- **The inverse is REFUTED.** A cave enemy cannot be blocked by surface walls overhead, because carving the cave deletes those walls.

## 1. Movement (all CONFIRMED)
- **Tick gating.** The AI tick is gated by wall clock, not `dt`: 11405 `if (now - e.lastUpdate < 80) {…continue; }`.
- **Step size.** The step is a constant per tick: 11441 `var moveSpeed = e.speed * 0.08;`. That is 2.8u for the Soldier, 1.6u for the Brute, 4.4u for the Scout and 5.6u for the Wolf. `dt` only scales knockback (11362), so effective speed depends on frame rate.
- **Chase condition.** 11423 `dist < e.chaseRange && dist > 10 && hasLineOfSight(…)`. The enemy steers along the unit vector to the player. It tries the full move, then X-only, then Y-only (11445–11449). Because the Y test runs after `e.x` has changed, this is effectively X-priority.
- **Patrol** (11291–11309). The enemy walks a straight line at `e.speed * 0.38 * 0.08` with no slide. A waypoint counts as reached at `wpDist < 14`. On a wall hit it only does `e.patrolIdx = (…+1) % …length; return 0;`. Patrol runs only when `dist < 350` (11453).
- **No recovery logic.** Enemies have no stuck detection, unstick, teleport, timeout, leash or last-seen memory.
  - A grep for `astar|pathfind|bfs|dijkstra|flow|navmesh|stuck|unstick` finds only player code. The hits are `findSafeSpawn` (4010), a water-pool BFS (2593) and the player's "Active unstuck" (10215).
  - Companions and allies do teleport (20043, 19812).
- **Ally chase has no LOS test.** 11430–11431 sets `chasing = true` toward a fortress ally without checking LOS, so the enemy walks into walls. This only matters when allies exist.

## 2. Collision
- **Arguments differ.** The player calls 10209 `isInGridWall(pos.x, pos.y, 6, _collideZ)` and also has a spiral unstick. Enemies call 11445 `isInGridWall(nx, ny, eWallRad)` with `eRad * 0.6` (4.8u Soldier, 6.72u Brute). The calls at 11303, 11363 and 20266 also pass no 4th argument.
- **Every wall cell is solid for enemies.** Both exemptions in `isInGridWall` sit behind `if (playerZ !== undefined)` (9994, 9999). With `playerZ` undefined, every truthy `grid` cell blocks. CONFIRMED.
- **One grid for both layers.** 6472 `grid[gi] = ch.grid[ci];`. Caves never add walls; they only delete them: 5411–5412 `if (_cgCarve && _cgCarve.wallCarve) { cGrid[cidx] = 0;`.
- **What a "cave wall" is.** It is a surviving surface noise wall within ±1 mesh cell of a ceilinged cell. It is tagged in `gridCave` (6762–6776), `walls[].cave` and `wallCapZ`. `wallHeights` plays no part. Only the player and the renderer read these tags.
- **The ring of invisible walls.**
  - The ceiling reaches `hw + 108` from a passage centre (4684), but carving only happens where `combinedFade > 0.3` (4773). That leaves a ring 40–52u wide (computed in `jsc`) that has a ceiling but was never carved.
  - Noise walls in that ring are hidden from a surface camera: 12052 `if (_wcap > -Infinity && cam.z > _wcap * 25 - 2) continue;`.
  - They are also non-solid for a surface player (9999, 10014, 10314).
  - For every enemy they are solid and block LOS. CONFIRMED.
  - The per-window count is already logged as `[CAVE-META] gridCave: N/…` (6793).
- **Cave enemy under surface walls: REFUTED.** The carved footprint has no walls on either layer. The one edge case is ruins, which are stamped after carving (6181).

## 3. Line of sight
- LOS is 2D only. Lines 9950–9955 sample `grid` every half-cell, with no Z and no `gridCave` check. CONFIRMED.
- The ring walls therefore block LOS for surface enemies.
- Inside a carved footprint nothing blocks LOS, so a cave enemy can aggro a surface player through the roof, and the reverse.
- Attack range and player push are also 2D (11374 `Math.hypot(aPdx, aPdy)`, 10040). `underground` is read only at 11458.

## 4. Enemy Z
- **Surface enemies keep `z:0` forever.** The only update is 11458–11459 `if (e.underground && floorMesh) { e.z = getFloorHeightAt(e.x, e.y) * 25; }`. That reads `l0TopZ`, the lowest layer (7816), and snaps to it with no layer choice.
- **No layer logic for enemies.** `getWalkableLayerTopAt` has only player callers. Enemies never fall. They cross the entrance ramp in 2D only, because the ramp is carved open.
- **The `underground` flag is lost on save.**
  - The object saved at 7369–7382 has no `underground` key, and it is restored as `underground: en.underground || false` (7063).
  - After the first window shift (every 480u chunk crossing), a cave enemy's Z stops updating.
  - `fromSpawner`, `arenaEnemy` and `stunUntil` are lost the same way. CONFIRMED.
- **Side finding on visibility.** 511 `if (floorMesh && !playerUnderground && fh < -0.1) return null;` hides any enemy standing where `l0 < −0.1`.
  - That covers every cave footprint. Using the verbatim noise functions, it also covers 30–43% of ordinary surface.
  - Hidden enemies still chase and attack. The projectile hit test also uses `l0` (10898).
  - A cull this large is worth confirming in the running game.

## 5. Stuck scenarios
- **S1 Patrol ping-pong freeze — CONFIRMED + measured.**
  - `generateChunk` gives each enemy exactly 2 unvalidated waypoints (5904 `(enemyRng()-0.5)*100`; caves 5947 `*60`) and bypasses `generatePatrolWaypoints`.
  - If the two are under about 28u apart, both sit inside the 14u arrival radius. The index then flips forever and the enemy never moves.
  - On an empty grid, 18.9% of surface enemies and 42.6% of cave enemies froze (757/4000 and 1703/4000).
  - It is visible only while the enemy is not chasing: no LOS, the market safe zone (11420), or the 0.7× range ring for cave enemies.
- **S2 Return to patrol after a chase — CONFIRMED mechanism, measured on a proxy.**
  - When LOS is lost the enemy switches straight to patrol, heading for distant waypoints with no slide.
  - Both bearings hit the same wall, so it alternates forever. `e.facing` flips every tick because 11300 sets it before the wall test.
  - As a proxy I displaced 1,000 enemies per biome by 200–400u. The share that froze was 13.6% in plains, 29.7% in ground, 35.5% in forest and 53.5% in the cave biome.
- **S3 Walk animation plays while frozen — CONFIRMED.** 14070 `var isMoving = (dist > 10 && dist < eType.chaseRange);` is driven by camera distance. Every frozen enemy in range plays the walk cycle, so it looks like walking in place.
- **S4 Brute spawned embedded — CONFIRMED + measured.**
  - It spawns at a cell centre (5886–5887). Its 6.72u wall radius exceeds the 6u half-cell.
  - That embeds it at 5.4–11.4% of open cells.
  - Its patrol step of 0.61u at speed multiplier 1.0 is smaller than the 0.72u overlap, so none ever patrol (0/3236). While chasing a visible player, 45–49% never move.
- **S5 Separation pushes enemies into walls — CONFIRMED.**
  - `_separatePair` tests only the centre cell (19282–19283), while movement uses a 5-point radius test.
  - Every later move must then clear the whole overlap in one step.
  - With two Soldiers, one became embedded in 2–12.5% of runs and stayed frozen in 0–4%.
- **S6 Chase jam while LOS holds — measured ≤0.25%.** This covers diagonal pinches and 1-cell gaps. A Soldier needs ±1.2u alignment to pass a 1-cell gap; a Brute cannot fit.
- **S7 Invisible ring walls (section 2) — CONFIRMED.** How often this bites needs runtime data.
- **S8 Spawn inside a later-stamped ruin wall — CONFIRMED possible, rare.**
  - Enemies are placed at 5880–5912, before ruins are stamped at 6181.
  - Spawner placement is safe (20266, radius 8).
  - "Restored into changed geometry" is REFUTED: chunks are deterministic and positions are preserved.
- **S9 LOS dithering at corners — SUSPECTED.** Runtime evidence would be the aggro marker (14188) firing again and again on the same enemy.

Game globals are reachable from the browser console, so this probe classifies live enemies:

`enemies.map(e=>({t:e.enemyType.id,wp:e.patrolWaypoints.map(w=>Math.hypot(w.x-e.x,w.y-e.y)|0),emb:isInGridWall(e.x,e.y,8*e.enemyType.size*.6),los:hasLineOfSight(e.x,e.y,pos.x,pos.y)}))`

| Probe result | Scenario |
|---|---|
| both `wp` < 14 | S1 |
| `wp` static and `los` false | S2 |
| `emb` true | S4 or S5 |
| `los` false with no visible wall | S7 |

## 6. Corridor geometry vs enemy radius
- The grid cell is 12u (294).
- Main cave corridors are 90–140u wide, scaled ×0.8–1.2 per segment. Branches are ×0.7–0.9 of the parent (4495, 4516, 4554). Chambers have radius 70–120 (4537).
- The carved half-width works out to 0.89·hw + 68.8. Even the narrowest possible branch is at least 149u wide, against enemy bodies of 9.6u and 13.4u.
- Cave interiors are wide open, so corridor width is not a cause.
- The tight spots are the surface noise-wall blobs (12.4% density in the cave biome at thresh 0.74).

## 7. Contradictions and dead code
- 11246–11247 says "separation physics will push them clear". Nothing pushes enemies out of walls.
- 14069 says "freeze on frame 0 when idle", but 14070 animates by camera distance.
- 10896 says "e.z is always 0", but 5936 sets `z: ceFloorZ, underground: true`.
- 6757 says "±2 margin", but the loops use ±1 (6769–6770). 6829 says "wall cell size (15u)", but it is 12.
- 7347 says "so reassembly preserves it", but several flags are dropped.
- 11463 `if (false && DEBUG_EFFECTS…` is dead code.
  - Only it reads `throttled`, `moved`, `burning`, `slowed` and the return value of `_patrolEnemy`.
  - `cspd` at 11335 is never used.

## How the numbers were produced
The command was `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc sim.js`, and likewise for `sim2.js` through `sim5.js`. `extract.js` holds `sed` extracts of lines 2430–2475, 9938–10006, 11291–11309, 11439–11450, 19273–19291 and 4959–5009.

Key outputs:
- `E1 chase… normal: {"reached":395,"frozenLOS":1,"frozenNoLOS":2,"moving":2}`
- `EMPTY GRID patrol freeze… soldier: 757/4000`, `…*60… 1703/4000`
- `displaced…: {"ok":393,"frozenProximity":72,"frozenWallAlternation":535…}`
- `embedded Brutes that EVER move while patrolling: 0/3236`
- `surface height < -0.1 at 30.0%`

Files are in <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/agent_enemy:
- extract.js
- sim.js
- sim2.js
- sim3.js
- sim4.js
- sim5.js