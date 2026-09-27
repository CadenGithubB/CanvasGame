# Sub-audit report: Entrance constants inventory

Final report of a read-only audit agent (first session phase). The orchestrator spot-checked its claims against source; see HANDOFF.md for which were confirmed, refined or refuted. Line numbers are header lines of components/hardwareone/WebPage_Games.h.

## Cave-entrance constant inventory — `./components/hardwareone/WebPage_Games.h`

Nothing in the repo was modified, and `WebPage_DarkRoom.h` was not read. Line numbers are header lines; I spot-checked four lines of `game_lines.js` against the header and they match.

**Units.**
- wu = world unit. Grid cell = mesh cell = 12 wu (`GAME_CONFIG.world.cellSize/meshGridSize`, 294–295). `12` is re-hard-coded at 6666, 6759, 19345, 21189, 21670.
- Chunk = 480 wu = 40 cells. Region = 3 chunks (`REGION_CHUNKS = 3` 4443, duplicated as `REGION_CHUNKS_CV = 3` 5341).
- hu = mesh height unit. Render Z = hu×25. `cam.z`/`pos.floorZ` = hu×40+60 (10148, 18953). `C.cameraZ` = hu×25+60 (454).
- EC = entrance centre `ent.x,ent.y`. `net.entrances` and `chunk.caveEntrances` are absolute world coordinates; `capEntrances` and `deepCaveEntrances` are window-local (6626, 7160).
- `along` is +OUTWARD in queryCaveGeometry/queryEntranceZone but +INWARD (cosA,sinA) in inEntranceReserve, the cull mask and the label.
- `GAME_CONFIG` (244–348) has no cave/entrance sub-object. Only cell/chunk sizes are config refs (C); everything else is a literal (L inline, LV named local, G named global).

**Previous-audit check.** The 60 / 480 / 48 values in queryCaveGeometry are confirmed. They are function-local literals, and 48 is a HALF-width. queryEntranceZone's different dimensions are real, but that function is dead code.

### 1. Table

| Line | Function | Expression | Type | Controls | Frame / metric | Region |
|---|---|---|---|---|---|---|
| 4478–4486 | generateCaveNetwork | `rng() < 0.4 ? 2 : 1`; `CHUNK_SIZE * (0.5 + rng() * 0.5)`; `angle: inwardAng` | C+L | count, placement | world, polar from region centre | 1–2 entrances on ring 240–480 wu; record is `{x,y,angle}` only |
| 4495–4497, 4516 | 〃 | `width: 90 + rng() * 50`; `depth: 6.0 + rng() * 2.5`; `ceilH: 5.0 + rng() * 1.5`; `× (0.8 + rng() * 0.4)` | L | first corridor, starts AT EC | wu / hu | width 72–168 (hw 36–84); floor −6.0…−8.5; headroom 5.0–6.5 |
| 4660, 4721 | queryCaveGeometry | `MOUTH_RADIUS = 60`; `edSq < MOUTH_RADIUS * MOUTH_RADIUS` | LV | `isEntrance` | world, Euclidean from EC | disc r=60. Sole consumer is debug counter 5613, so no effect |
| 4661, 4725, 4737 | 〃 | `APPROACH_LEN = 480`; `along >= 0 && along <= APPROACH_LEN`; `axialT = 1.0 - along / APPROACH_LEN` | LV | ramp length + blend | along outward axis from EC | 0–480 wu; blend 1→0 |
| 4662–4666, 4732–4734 | 〃 | `APPROACH_W = 150`; `APPROACH_MOUTH_W = 48`; `APPROACH_FEATHER = 0.8`; `perp <= coreW + featherW` | LV | ramp HALF-width | perpendicular to axis | funnel: core ±48→±150, with feather ±86.4→±270 |
| 4741, 4780 | 〃 | `approachDepth = e.depth \|\| 5`; `smoothedSurface - 0.5` | L | ramp floor target | hu | `e` has no `depth` (4486), so always −5; cave is −6.0…−8.5 |
| 4773, 4787 | 〃 | `combinedFade > 0.3`; `approachFade > 0.3` | L | grid-wall carve | — | on-axis along < 336; around EC r≈101–144 |
| 4684, 4702 (old: 4589, 4609) | 〃 (queryEndlessCave) | `outerHW = hw + 108`; old `hw + 20` | L | corridor influence; `ceilZ` non-null whenever bestFade>0 | capsule distance, clamped → round end-cap at EC | disc r=144–192 around EC gets a ceiling in every direction, incl. over the ramp |
| 4659, 4754–4760 | 〃 | `MIN_COVER = 1.0`; `smoothedSurface - 0.5`; `floorZ + 2.0` | LV/L | floor/ceiling clamps | hu | ceilZ = −depth+ceilH ≈ −3.5…+0.5 |
| 4828, 5374–5389 | generateChunk | `ENTRANCE_ZONE_REACH = 520` | G | chunk↔entrance inclusion | world, axis-aligned box ±520 vs chunk rect | cone corner at 45° reaches ≈530 per axis (fade≈0) |
| 5392 | 〃 | `_eq.depth : 3.0`; `_eq.ceilH : 3.5` | L | entrance record depth/ceilH | hu | read only by debug tools |
| 5405–5410; 5589–5606; 5664–5667 | 〃 | `cgx * cell + cell * 0.5`; `cmx * meshGridSize`; `+ meshGridSize * 0.5`; surface arg `2.0` / 21×21 max, `< 1.0 → 1.0` | C+L | sample point of carve / stamp / water-skip | grid-cell CENTRE / mesh-cell CORNER / mesh-cell centre | carve and stamp sample 6 wu apart, different surface inputs (debugCaveAt 4802 passes `2.0`; comment says 0) |
| 5525, 5541 | 〃 | `_smrRadius = 10`; `_smrRadius * meshGridSize * 2.5` | LV | surface smoothing ×3 | Euclidean EC→cell corner | disc r=300 wu (25 cells; comment says 10) |
| 5627 | 〃 | `cg.fade > 0.7 && cg.source !== 'approach'` | L | cave-floor tint | — | ramp never tinted |
| 6647, 6666–6680, 6693 | assembleWindow | `CAP_EXCL_SQ = 30 * 30`; `(gxN + 0.5) * 12`; `if (!nearEntr && _hasCeilAbove) needsCap[iN] = 1`; `cz + 0.25` | LV/L | cap exclusion | window-local, Euclidean EC→cell centre | disc r=30 (~5 cells); every other ceilinged cell is capped |
| 6652 | 〃 | `APPROACH_DEPTH_THRESH = 1.0` | LV | nothing | — | never read |
| 6759–6776; 6949–6957; 6984–6985 | 〃 | `_mcMeshGS = 12`; 3×3 loops; `_seaZ = 0.0`, `Math.min(_wclCeilZ, _seaZ)` | L | `gridCave`; `wallCapZ` (MAX of 3×3 caps); "mouth wall" top clamp | Chebyshev 1 mesh cell; hu | uncapped+ceilinged wall top ≤ 0 (comment: "lowest neighbor cap") |
| 7155–7156 | 〃 | `Math.abs(…) < 1` | L | entrance dedupe | window-local box | ±1 wu |
| 779 | inEntranceReserve | `Math.abs(_iAlong) < 44 && Math.abs(_iCross) < 34` | L | filters: ore 3440/7179, scatter 3493/3580/7177, decor 7178/8007, chests 7180, enemies 7181; wall-ignore in canSeePoint 16521 | entrance frame, origin EC | oriented box 88×68 wu. Comment 764 assumes ARCH_W=56 (actual 90); comment 761 lists mesh blend, grid walls, lights, but none of them call it; structures/markets/shrines/spawners unfiltered |
| 7844–7853 | getWalkableLayerTopAt | `STEP_UP = 1.0`; `STEP_DOWN = 1.0`; `< 260 * 260` → `STEP_DOWN = 10.0` | LV/L | drop tolerance | window-local, Euclidean EC→player | disc r=260 (same number as old reach, comment 5384) |
| 8044–8046; 15615; 15654 | buildPointLights; updateAmbientParticles; drawTorchGlow3D | `Math.cos(_ea) * 10`; `radius: 80, intensity: 0.45`; `_tl.r < 200`; `wz = 15` | L | entrance light; ember filter "skip cave entrances"; glow height | 10 wu INWARD of EC; world Z | disc r=80; entrance light r=255 so not skipped; glow at Z 15 vs floor −150…−212 |
| 19345–19358 | updateDayNight | `pos.x / 12`; `_walk_u.idx < _topWalk` | L/rule | `playerUnderground` | topological, per mesh cell | true under any cap, incl. ramp cells r≈30…144–192 (comment 16747 agrees) |
| 19343, 19380–19384 | 〃 | `= 999`; `< 120`; `1.0 - _playerEntranceDist / 120`; `* (1.0 - _entrBlend)` | L | ambient blend | window-local, Euclidean EC→player | disc r=120; cave-ambient weight = d/120: 0 at EC, 1 just inside 120, 0 beyond (step) |
| 19377–19379; 8128–8129; 12834 | 〃; updateLightGrid; drawLayersFloor3D | `Math.min(ambientLight, 0.45)`; `fogFloor = 0.15`; `_plRadius = 120`; `_plIntensity = 0.6`; `playerUnderground ? 0.3 : 0.65` | L | cave light levels | — | log 7251 and comment 12830 both say 0.35 |
| 511 | entityVisible3D | `!playerUnderground && fh < -0.1` | L | hide entity | l0 floor hu at entity | any floor < −0.1, incl. open ramp. Same literal: 9111/9113, 9655/9657, 1522, 1641, 21197, 21325, 21649 |
| 12052, 12058; 13041 | drawWalls3D; drawLayersCeiling3D | `cam.z > _wcap * 25 - 2`; `playerUnderground && _wcap <= -Infinity`; `cam.z > _cz0 * 25` | L | capped-wall / surface-wall / ceiling culls | `cam.z` is 40-scale, RHS 25-scale | mixed units |
| 12063, 11849/11864 | drawWalls3D | `_isEntrWall = _wcap > -Infinity` | rule | skips wall-base clamp | — | true for CAPPED walls; per comment 12049 mouth walls are −Infinity → false |
| 12129 | caveCeilAt | `_ch > 0.1` | L | wall ceiling extension | hu | ceilings ≤0.1 ignored (5581: ceilings can be ≤0) |
| 12551, 12564 | drawLayersFloor3D | `_entRadSq = 100 * 100` | LV | sets `_camNearAnyEnt` only | Euclidean cam→EC | disc r=100; no effect |
| 12579–12606, 12747–12748 | 〃 | `_entHalf = 22`; `Math.ceil((_entHalf * 1.5) / gs)`; `_ecAlong < _entHalf && _ecCross < _entHalf`; `_entryMaxZ < -0.5` | LV/L | floor-quad skip (`_entCullMask`) | entrance frame, EC→cell centre | oriented square 44×44 wu; only layer-0 quads fully below −0.5 hu, player on surface |
| 12691–12692; 13045–13050 | 〃; drawLayersCeiling3D | skip if `capAboveMask`; `if (hasCapAbove) continue` | rule | cave floor (player on surface); ceiling quads (always) | — | both drawn only in uncapped ceilinged cells = r<30 of EC |
| 16427–16433 | drawCaveEntrance3D | `ARCH_W = 90`; `ARCH_H = 110`; `PILLAR_W = 14`; `PILLAR_D = 14`; `LINTEL_H = 18`; `LINTEL_OVERHANG = 8`; `OPENING_W = ARCH_W - 2 * PILLAR_W` | LV | arch | cross ⟂(cosA,sinA), origin EC; heights world-Z | opening ±31; pillars cross 31–45, along ±7; lintel cross ±53, along ±9; top = base+128 Z (5.12 hu) |
| 16547–16548 | 〃 | `gz = fh * 25` at `(ce.x, ce.y)` | — | arch base | EC's mesh cell | −150…−212 Z → lintel top −22…−84 Z, below level 0 |
| 16616–16629 | 〃 | `FLANK_LEN = 140`; `FLANK_THK = PILLAR_D`; `FLANK_H = ARCH_H`; `NUM_PLANKS = 7` | LV | flanks (drawn only; no collision) | cross | 45→185 each side, along ±7 |
| 16535; 16736–16739; 16755 | 〃 | `dist > 900`; `dist < 500`, `(500 - dist) / 200`; `_lblAlong < -40 ? 'CAVE' : 'EXIT'` | L | draw range; label fade; label text | Euclidean cam→EC; inward-positive along | 'CAVE' only when >40 wu OUTSIDE |
| 16459–16513 | canSeePoint | `dmin + 6`; `step = 8`; `rayLen - 20`; `layerZ > 30`; `sightZ + 2`; `eyeZ + 10` | L | arch occlusion | `eyeZ = cam.z` (40-scale) vs 25-scale | mixed units |
| 16774/16777; 17205; 18575; 21699 | markers | `13`, `7`; `3`; `7`; `5 * sc` | L | 2D ring (wu); map dots (px) | EC | — |
| 3143–3182 (3025) | generateDeepCaves, level mode | `entrRad = 5`; `angle: 0, cosA: 1, sinA: 0`; `ANTE_OFFSET = entrRad * cell + 70`; `ANTE_RADIUS = 55`; `ANTE_CEIL = 85`; `_neckHalfW = 30` (border vein `entrRad = 2`) | LV | mouth punch, antechamber | grid cells, Euclidean; ceil world-Z | disc r=5 cells (60 wu); orientation fixed 0 although tunnel follows `inDirX/Y`; ante centre 130 wu in |
| 7615 | resetEndlessMode | `outDX * 60` | L | CAVE_TEST spawn | outward axis | 60 wu outside EC |
| 4811–4818 | queryEntranceRamp (0 callers) | `rampLen = 180` | LV | dead | Euclidean from EC | disc r=180 |
| 4851–4856, 4903–4904 | queryEntranceZone (only caller is queryEntranceApproach 4915, which has 0 callers) | `OUTER_LEN = 480`; `INNER_LEN = 220`; `MOUTH_W = 150`; `OUTER_W = 120`; `INNER_W = 110`; `FEATHER = 0.8`; fallbacks `3.0`, `5.5` | LV | dead | outward-positive along | reversed funnel: ±150 mouth → ±120 at 480 out / ±110 at 220 in |
| 1670–1671 | caveCapture | `entranceVisRadius: 14, deferMaxDist: 350, ceilEntranceDist: 200, undergroundEntrDist: 120, ceilBlendStart: 60` | L | reported "config" | — | none backed by a live variable |
| 21589, 21712; 21201; 21363 | drawCaveControlMap; drawCaveDebug; profile chart | `viewRadius = 500`; `visR = 14 * gs`; `< 150 * 150`; `-60`, `_pdLen + 300` | L | debug circle; "nearEntrance(<150)"; profile span | Euclidean from EC | r=168 (`_entranceVisRadius` does not exist); 150 replicates a removed clamp |
| 1412, 22350–22359; 1768–1780 | T key; caveTest | `[300, 200, 150, 100, 75, 50, 30, 15]`; dist/tol `400/80, 200/80, 50/40, 150/60, 250/100`; `ch <= 0.1`, `> -0.5` | G/L | test probes | Euclidean from entrance[0] | comment 1775 "requires entrDist > 120" is stale vs 19358 |

Excluded keyword false-positives: flame `rampT` (14915+), companion "mouth" (20454), structure pillars (5125–5283), level-mode ceiling `ramp` (12114). caveDiag (1418) has no entrance constants; caveGaps has only `-0.1` (1522).

### 2. Constant groups

Tags: (a) same literal duplicated in several places; (b) different values for the same concept; (c) same value but different shape, origin or units.

- **Mouth disc / render cull**
  - (b) `MOUTH_RADIUS` 60 (inert) vs `CAP_EXCL_SQ` 30 (live). 60 is also the level-mode `entrRad` and the CAVE_TEST spawn offset.
  - (c) The render "mouth hole" is an oriented 44×44 square, not a disc. The camera gate r=100 is inert; arch draw r=900; debug circle r=168.
- **Mouth width** (half-widths about EC)
  - (b) cull 22 < opening 31 < reserve 34 < pillar outer 45 < ramp core 48 < lintel 53 < ramp+feather 86.4 < dead zone 150 < flank tip 185.
  - The reserve has a single definition (779) and covers 3 of each pillar's 14 wu. Its box is 88×68 against arch 90, lintel 106, flank span 370.
  - Along-axis: reserve ±44, cull ±22, pillar ±7.
- **Approach length**
  - (a) `480` appears at 4661 and 4851 (dead), plus comments 4826/5371. The 520 reach is documented against the dead copy.
  - (b)/(c) Three rules use discs about EC instead of the corridor: 180 (dead ramp), 260 (step-down), 300 (smoothing).
  - (c) The funnel direction is opposite: live 48→150, dead 150→120.
- **Ramp depth**
  - (b) 5 (always used) vs corridor 6.0–8.5 vs fallbacks 3.0 (5392, 4903). ceilH fallbacks are 3.5 vs 5.5.
- **Cap exclusion vs ceiling vs ramp**
  - The ceiling is stamped within r=144–192 of EC in all directions, the cap is excluded only for r<30, and the ramp spans 0–480 outward.
  - So ramp cells at r≈30…144–192 carry ceiling+cap. Open sky exists only at r<30 and beyond the end-cap.
  - In the feather the blended floor can exceed its own ceilZ. Example: surface 2, depth 7, ceilH 5.5 gives fade < 0.39, while carving needs > 0.3.
  - Chunk layers are index-ordered (6270–6275), but cap insertion sorts by Z (6724).
- **Underground detection**
  - The live rule is topological and has no radius. Radius 120 survives only in the caveCapture config and a caveTest comment; debug uses 150.
  - (a) The height literal −0.1 is duplicated on 11 lines. −0.5 appears at 12747, 1653, 1851, 7230.
- **Lighting**
  - Ambient disc r=120: the cave weight rises with distance and steps off at 120, while comment 19381 says "darkening near entrance".
  - Entrance light r=80 is placed 10 wu inside; player light r=120.
  - Ambient 0.45 vs logged 0.35; floor light 0.65 vs commented 0.35.
- **Units** (c)
  - `cam.z` (40·hu+60) is compared with 25·hu at 12052, 13041, 16465–16513. Arch heights are world-Z; depths are hu.

### 3. Computed but never read

- **`_camNearAnyEnt`**: assigned 12557 (`false`) and 12564 (`true`). Reads: none.
- **`_camNearEntDist`**: assigned 12558 (`1e9`) and 12563. It holds the SQUARED distance, and the loop `break`s at 12564, so it is not a true minimum. The only "read" is its own compare on 12563, so it gates nothing. `_entRadSq` (12551) feeds only these two variables. The camera-proximity gate described in comment 12552–12556 does not exist.
- **Never read at all**: `APPROACH_DEPTH_THRESH` (6652); `PORTAL_DARK` (16439); `_lflkCX`, `_lflkCY`, `_rflkCX`, `_rflkCY`, `_flankTop` (16702–16706); `chunk.caveInterior` (6296); `_caveTestLogNext` (1413; set 22363).
- **Read only by debug code**:
  - `mouthFlag`/`isEntrance`/`MOUTH_RADIUS` (counter 5613/5639).
  - `_deferredCaveQuads` (21775, never populated; shown at 21238/21769).
  - Entrance `depth`/`ceilH` (5392→7161; read at 1442, 1615, 1730, 21295).
- **Misnamed**: `__caveStats.ceilSkipEntrRange` counts stitch failures (13030–13034, `_ctol = 0.8`), not an entrance range.
- **Zero live callers**: queryEntranceRamp, queryEntranceZone, queryEntranceApproach.

Working notes (`final.md`, `calc.py`) are under `<task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/agent_constants/`.