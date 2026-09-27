# Sub-audit report: Chest rewards and legacy levels

Final report of a read-only audit agent (first session phase). The orchestrator spot-checked its claims against source; see HANDOFF.md for which were confirmed, refined or refuted. Line numbers are header lines of components/hardwareone/WebPage_Games.h.

The cave-chest claim holds for Endless and Cave Test but not for fixed levels. Fixed levels can be treated as secondary without affecting Endless generation. Nothing in the repo was modified.

Source: `./components/hardwareone/WebPage_Games.h` (line numbers checked identical to `game_lines.js`). Check scripts are in `<task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/agent_chests/`: `harness.js`, `harness2.js`, `harness3.js`, `callgraph.py`, `reach2.py`.

## TASK 1 — Cave terminal chests

**Verdict: CONFIRMED for Endless and Cave Test, REFUTED for fixed levels. There is no lazy roll at collection time.**

| Site (lines) | Mode | Fields (verbatim) | Reward |
|---|---|---|---|
| generateCaveInteractables 3783-3794 | Fixed L4 Expanse only (chambers come from generateDeepCaves, 7729 `if (terrain === 'expanse')`) | `gold: Math.round(30 * cTierDef.goldMult) ... tier: cTier, quality: cQual, relicId: null, equipId: null`, then `if (cTier === 'epic') { chestData.relicId = pickRandomRelic(rng); chestData.gold = 0; } else if (rng() < cTierDef.equipChance)` sets equipId | relic, equipment at quality, or gold × mult |
| generateSurfaceChests 3895-3910 | Fixed L1-3 (3827 `if (terrain === 'expanse') return;`) | same shape and logic | full loot |
| generateChunk surface 5844-5865 | Endless, Cave Test | `equipId: chEquipId, relicId: chRelicId, tier: chTier, quality: chQual` | full loot |
| generateChunk cave terminal 5967-5977 | Endless, Cave Test | `gold: Math.floor(10 + caveChestRng() * 30 * difficulty), ... equipId: null, relicId: null, tier: cTier, quality: 0.7 + caveChestRng() * 0.3` | **gold only, always** |
| assembleWindow copy 7037-7041 | Endless | `equipId: tc.equipId, ... tier: tc.tier || 'common', quality: tc.quality || 1.0, relicId: tc.relicId || null` | pass-through, no roll |

- **Collection (CONFIRMED):** collectChest 20175-20220 branches `if (ch.relicId && RELIC_DEFS[ch.relicId])` / `else if (ch.equipId)` / `else { coins += ch.gold;`. It never reads `tier` and contains no RNG.
- **Executed check:** I ran the verbatim lines under jsc for 20,000 cave chests.
  - Every one paid gold only.
  - Tiers came out 15/35/20/30% common/uncommon/rare/epic (5967 `tierRoll = caveChestRng() + 0.15`, comment "shift toward higher tiers").
  - Mean gold was 24.4 for every tier because goldMult is never applied. Surface gold chests average 29.6/44.3/59.6 for common/uncommon/rare; surface epic is 100% relic.
  - So an "epic" cave chest pays less than a common surface chest.
- **Volume:** across 500 generated networks there were 11.4 terminal chambers and 10.3 cave chests per network. Each chamber has 2-3 enemies with 1.2× health (5926, 5938).
- **Visual promise broken:**
  - 9190 `CHEST_TIER_DEFS[ch.tier || 'common']` drives glow and palette.
  - 9351 `if ((ch.tier === 'epic') && sparkP)` adds orbit particles.
  - 1320 says "Relic Definitions (Epic chests only)", yet the open label is `'+' + ch.gold + ' Gold'` (9418).
- **Scaling:** cave tier thresholds are constants, independent of `difficulty` and `_cch2.depth`. Only gold scales (4432 `1.0 + dist / 5000`). Fixed levels use plain 50/30/15/5 weights with no scaling.
- **Determinism:** all rolls happen at generation with seeded LCGs (`chunkRng(cx, cy, 103)`, `seedFor(14)`); there is no Math.random.
  - pickRandomRelic filters on `equipment.relic` (3688), so chunk content depends on player state at generation.
  - The endless equipment pick (5852-5853) skips the ownership filter that fixed-level pickRandomEquipment applies.
- **`quality`:** read only when equipId is set (9397, 20198). On cave chests it is dead data, and its 0.7-1.0 range ignores the tier's qualityMin/Max.

Extra defects found while tracing:
1. **Quality laundering (CONFIRMED, jsc).** saveAllEntityDeltas 7397-7401 writes collected/opened/lidAngle/equipId/relicId but not quality, while a swap sets `ch.quality = oldItem.quality` (20204). Poor 0.70 armor swapped into a 1.30 chest, window reassembled, swapped back, returns as Superior 1.30. The same gap erases forge-boosted quality.
2. **Item duplication (CONFIRMED).** Swaps never set `collected` (20183-20187, 20200-20206) and entityDeltas records only `chestsCollected` (6304-6308). After eviction (7463-7471) the chest regenerates its original item.
3. **No Z gate (CONFIRMED in source; reachability SUSPECTED, needs runtime).**
   - updateTreasureChests 19433-19434 checks XY only, `dist < 90`.
   - Caves carry a walkable cap (6722, type 4), and entityVisible3D hides underground entities from the surface (511).
   - So invisible cave chests can be looted from above, and E doubles as attack (22337 precedes 22344).
4. **No spacing rule for cave chests.** Fixed levels use MIN_CHEST_SPACING = 200 (3748). Endless networks average about one chest pair under 90px apart.
5. **Set-never-read and stale comments.** `bobPhase` (3784, 3899) and chunk `caveInterior` (6296) are written and never read. Comments at 928 and 3735 ("Chests contain 30 gold") are stale.

## TASK 2 — Are fixed levels secondary?

**Startup.**
- btnStart → startGame → `ENDLESS_MODE = false; ... resetLevel(1)` (22023-22026), so the default is fixed Level 1.
- btnEndless (22163-22186) is self-contained: it calls resetEndlessMode, starts its own loop, and forces `USE_KEYBOARD = true; USE_MOUSE = true`. Endless does not require a fixed level.
- IMU calibration and startGamepadPolling bring-up exist only in startGame, so the device-gamepad path lands in fixed levels or Cave Test.
- The terrain dropdown is vestigial: every level pins `terrain` (1949/1959/1971/1987) and 7702-7705 overwrites the selection. As a result generateCaveWalls (7718) is unreachable, 7665-7671 is dead, and step's terrain cycling (10358-10361) is dead.
- Expanse is the sole user of legacy deep caves, ore veins and fixed cave chests. It is reachable only by clearing L1-3 (resetLevel call sites: 9854, 10364, 22026).

**Call graph** (271 top-level functions).
- Fixed-only (25 functions, about 1,890 lines): buildGrid, applyIrregularBorder, generateBorderPolygon, generateBorderVariation, isInBorderVariation, generateCaveWalls, generateDeepCaves, buildCaveSpatialGrid, generateOpenAreaObstacles, generateBlendedFloor, generateFloorMesh, generateWaterFeatures, findRandomOpenSpawn, createWallDecorations, findWallSurfaces, generateOreVeins, generateFloorScatter, generateCaveInteractables, generateSurfaceChests, pickRandomEquipment, spawnEnemies, spawnShop, initMinimap, seedFor, resetLevel.
- Endless-only (about 3,100 lines): generateChunk, generateCaveNetwork, queryCaveGeometry, queryEndlessCave, assembleWindow and helpers, saveAllEntityDeltas, saveEnemyStateToChunks, evictDistantChunks, updateChunks, chunkRng, chunkSeedFor, getFloorColorBlended, getFloorColorForBiome, resetEndlessMode.
- Shared and load-bearing for Endless:
  - Functions: buildPointLights, buildWalkCandZ, renderMinimapBase, inEntranceReserve, rollChestTier, rollQuality, pickRandomRelic, createEquipInstance, terrainNoise/smoothNoise/hashNoise, getFloorColor, applyPreset, initAmbientParticles, toggleOverview, findSafeSpawn, generatePatrolWaypoints, isInGridWall, getWallTopZ.
  - Globals: deepCaveEntrances, terrain, worldW/H, the floorMesh layer schema, noiseSeed/_ampBoost.

**State coupling.**
- **Fixed → Endless is clean (CONFIRMED).** resetEndlessMode 7529-7537 zeroes the legacy structures. assembleWindow reallocates grid, wallHeights, worldW/H and viewDist (6343-6347, 6458-6462) and creates minimapCanvas itself (7330).
- **Endless → Fixed leaks (CONFIRMED in source; visual severity SUSPECTED).**
  - gridCave, wallCapZ, wallMaxTopZ, wallFaceBase and meshCave are assigned only in assembleWindow (6608, 6758, 6834, 6924, 6930). marketStalls, shrines, ruins and largeStructures are assigned only in assembleWindow and resetEndlessMode.
  - resetLevel and buildGrid reset none of them.
  - Shared code consumes them unguarded with the new gridW: isInGridWall 9999 (collision skip), drawWalls3D 12051-12052 (wall cull), 12068, 12148 (wall bases), repelFromStalls, drawShrines3D.
  - Playing Endless and then pressing Start reads stale data.
- **Two cave systems coexist, but the legacy one is inert in Endless.**
  - Its only runtime consumers (drawWalls3D 12094, 12110) are gated by `deepCaveRegions.length > 0`, and only generateDeepCaves pushes to that array.
  - `deepCaveEntrances` is the legacy-named global that Endless does depend on (7006, 7153, 7849, 19363, 766).
- **Legacy is already degraded by endless refactors (CONFIRMED).**
  - Fixed meshes hold one floor layer plus an optional type-2 ceiling (2566-2578, "No cap generation here"), so the test `_walk_u.idx < _topWalk` (19358) can never be true.
  - playerUnderground is therefore always false in Expanse caves, and the ceiling extension (11991) and cave ambient never apply.

**ENDLESS_MODE: 27 code references.** Most mode divergence is data-driven, not flag-driven.

| Category | Count | Lines |
|---|---|---|
| Lifecycle | 5 | 950, 7512, 22023, 22133, 22164 |
| Generation/streaming | 4 | 4365, 5340, 6334, 7475 (4365 and 5340 are vacuous: their callers are endless-only) |
| Physics (all in step) | 6 | 10141, 10174, 10266, 10298, 10306, 10356 |
| Rendering | 4 | 11588, 12075, 12100, 12199 |
| HUD/debug | 6 | 17501, 17552, 17761, 18626, 18722, 21953 |
| Lectern coordinates | 2 | 19890, 19891 |

**Legacy branches that can mask or contradict Endless fixes**
1. **caveCeilAt units (mismatch CONFIRMED; visuals SUSPECTED).** Legacy uses `fullCeilZ = ci.ceilZ / 25` (12115); endless uses `if (_ch > 0.1) return _ch * 25` (12129); projWall computes `cameraZ - wz * 25` (11823). The endless branch is inert wherever the cave ceiling sits below zero, and 25× too tall when it fires.
2. **Goal spawn has no mode guard (CONFIRMED in source; frequency SUSPECTED low).** updateEnemies 11495-11497: `if (!goalSpawned && enemies.length === 0 && spawnersAlive === 0) { spawnGoal(); }`. When the last enemy in the window dies, Endless shows "All enemies defeated! Find the exit!" plus a goal marker that assembleWindow never rebases. It is more likely in Cave Test.
3. **Calibration resets to a fixed level unguarded (CONFIRMED in source).** onCalibUpdate 9854 calls `resetLevel(1)`. Cave Test with IMU hardware (22003-22009) builds a fixed level while ENDLESS_MODE stays true, and generateFloorMesh overwrites noiseSeed/_ampBoost (2497, 2499), which later chunks use.
4. **Legacy only (CONFIRMED in source):** the floor-tracking gate (10266) omits ground and ice although 7710 builds meshes for them.

**Dead code (CONFIRMED, about 490 lines).** Each has zero call sites in the whole header; HTML 30-211 has no inline handlers, and there is no eval or `window[...]` dispatch.
- queryEntranceRamp 4810
- queryEntranceApproach 4914, and its only callee queryEntranceZone 4850
- getFloorColorAt 7923
- avgColor 7940
- shadeWall 11514
- drawSimpleWallSlice 11525
- worldToScreen3D 14641
- drawInventoryOverlay 17565
- detectPreset 17781
- drawPerfOverlay 20604
- _legacyDrawPerfHudOnCanvas_UNUSED 20991

Separately, window.caveTest 1720 (173 lines) describes itself as "currently unused". There is also an ungated debug teleport on the T key (22347-22369).

**Stale text:**
- Header: 13, 33, 37, 209 ("Tilt Maze", "Hold the device flat"); 85 "(beta)".
- JS: 928; 3735; 358 (cites drawSimpleWallSlice); 4631 ("Replaces queryEndlessCave", though it is still called at 5390).

**Conclusion.** The two generation pipelines are disjoint, and Endless reads nothing that only fixed-level code initialises. Fixed levels can therefore be treated as secondary, or removed, without changing Endless generation.

Removal needs edits at:
- startGame and its hardware bring-up (22020-22048)
- onCalibUpdate 9854
- the goal block 10356-10369
- the spawnGoal trigger 11495
- drawWalls3D 12094 and 12110-12118
- the legacy sections of drawDebugOverview
- window.caveGaps 1521
- the level/medal HUD

Keep the shared helpers listed above. Removal would lose the fixed-only features:
- ore veins (the only `oreVeins.push` is 3447)
- goal, medals and level progression
- spaced, fully-looted cave chests