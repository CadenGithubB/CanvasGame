# Sub-audit report: Cave debug tools audit

Final report of a read-only audit agent (first session phase). The orchestrator spot-checked its claims against source; see HANDOFF.md for which were confirmed, refined or refuted. Line numbers are header lines of components/hardwareone/WebPage_Games.h.

No cave debug tool compares the generator's intended geometry against the assembled mesh, and the mesh-reading tools rest on two assumptions that are false at runtime. `debugCaveAt` re-queries the generator only; every other tool reads the assembled mesh only.

**Method.** I did a full static read, then ran the unmodified game JS (lines 227–22514) headless in Deno with DOM stubs, in the scratch dir only. **RT** means confirmed at runtime in that sandbox. For walks, the real `updateDayNight` + `step()` ran at 1/60 s with velocity driven at 90 u/s. Seeds: Cave Test 12345; normal Endless 424200, 111100, 777700 (via patched `Math.random`). Everything else is CONFIRMED by code reading unless marked SUSPECTED.

## Core verdict
- No tool uses physics floor selection. Reported "floorH" is always `l0TopZ`, never `getWalkableLayerTopAt(x,y,playerH)`.
- False assumption 1: "l0 is the floor."
  - The generator stamps a ceiling wherever `bestFade>0` (5621), but the floor is only fade-blended (5618).
  - Cap insertion then Z-sorts the stack (6724–29), so the ceiling can end up at l0.
  - RT: l0 is the ceiling in 1,226 cells (12345) and 1,118–1,451 cells on normal seeds.
  - RT, seed 12345: `getFloorHeightAt` (7816) is up to 5.48u wrong there; 688 of those cells have their real floor at surface level.
- False assumption 2: "has ceiling ⇔ ceilZ > 0.1."
  - The generator itself warns "ceiling Z can be zero or negative" (5580–83).
  - RT: 6,189/6,189 ceilings are ≤ 0.1 on seed 12345; 100% / 99.8% / 82% on normal seeds.
- Coordinates:
  - Every tool except `debugCaveAt` works in window-local coordinates, which is correct at call time.
  - No capture prints `windowOrigin`, so outputs can't be compared across window shifts.

## Per tool
**caveDiag (1418) — USEFUL-WITH-CAVEATS, half DEAD.**
- `window.__caveDebugLast` is read (1419) but never written, so `lastTransitionSnapshot` is always null (RT).
- The header promises "config thresholds, and a 21×21 ASCII grid" (1416–17); neither exists.
- It reports no floorZ or angle.
- "ceilH" means absolute Z for the player but headroom for entrances (a generator value, 5390–92).

**caveGaps (1476) — MISLEADING (tautology).**
- It re-samples the same three points (1552–54) whose minimum defined `wallFaceBase` (6859–65), then reports `baseFh - minSample`.
  - That is ≤ 0 by construction.
  - gridCave walls are further clamped to window-min − 0.5 (6882–91).
  - RT: 277 faces checked, max gap exactly 0.
- It is a wall-skirt check, not a floor-hole check.
- `floorZAt`/`ceilZAt` differ from physics (7831–7902):
  - l0 only, no playerH, and it ignores type-4 caps.
  - No STEP_UP/STEP_DOWN (1.0 each; STEP_DOWN 10 within 260u, 7853) and no walk/fall/unsupported result.
  - Out-of-bounds returns NaN vs 0, and "no ceiling" returns 0 (ambiguous).
- Header fields `wallBaseZ, cornerZ[4], neighborZ[4], worstGap` don't exist.

**caveCapture (1592; the "Capture state" button, 1901) — MISLEADING as evidence.**
- RT, standing on the grass cap over a corridor: `floorH -7.62, onSurface false, underground false`.
- `config:{entranceVisRadius:14, deferMaxDist:350, ceilEntranceDist:200, undergroundEntrDist:120, ceilBlendStart:60}` (1670–71) are literals used nowhere else.
- Missing from the capture: floorZ, cam angle/pitch, window origin, airborne state, mode, flags, layer stack.
- `ct` sums per-cell and per-layer counters, so the percentages are meaningless.
- There is no loader: `__caveCaptureLast` is write-only.
- The seed is not settable in normal Endless (7522):
  - `CAVE_TEST_MODE ? (window._caveTestSeedOverride || 12345) : Math.floor(Math.random()*999999)+1`
  - The override has no UI.

**`__caveStats` (shown by capture and panel).**
- Labels versus what is counted:
  - `floorBlendRange++` is unconditional per drawn quad (12728).
  - `floorOutsideBlend` is never incremented.
  - `ceilSkipLowCeil` counts every non-ceiling layer (13021).
  - `ceilSkipEntrRange` is actually stitch failure (13030–34) — the one useful number, and it is mislabelled.
- The culls that matter have no counters: capAbove (12692), `_entCullMask` (12749), `cam.z >` (13041), `hasCapAbove` (13050), wallCap (12052).
- RT deep in a corridor: `collected 2364, rendered 0`, which the trace cannot explain.
- The stats freeze when a pass is hidden or in 2D mode.
- `__caveFloorRendered` is write-only.

**caveTest (1720) — DEAD; would mislead if run.**
- It is unwired ("currently unused", 1717).
- It teleports x,y (1816–26) but never sets floorZ and never walks.
- Predicates:
  - `underground` is invalid because floorZ is never set.
  - `onSurface` checks l0 > −0.5 on a cell chosen by l0 ≥ 0 — a tautology.
  - `blendRange '>0'` is a tautology; RT it was 6,132 on open ground 1,700u from any cave.
  - `ceilRendered '>0'` fails by design: the camera is uncontrolled, and capped ceilings never draw.
- `requireCave` needs `ch > 0.1` (1755); RT, no cell qualifies.
- The "drift problem" (1719): targets are cached window-local across awaits (1730) while `assembleWindow` shifts pos (7290).
- The 400 + 100 ms waits make it flaky.
- It verifies none of (a)–(d).
- Comment 1775 ("requires entrDist > 120") contradicts 19353 ("No thresholds").

**'T' stepper (22347) — USEFUL-WITH-CAVEATS.**
- It always uses entrance [0] and moves x/y only.
- `_caveTestLogNext` is never read, so "Logs rendering stats" (1407) is false.
- It is active in normal play.

**debugCaveAt (4796) — USEFUL-WITH-CAVEATS.**
- It takes WORLD coordinates, while every other tool prints window-local ones.
- It hardcodes surface `2.0`; the comment says "= 0".
- It returns target + fade, not the stamped height.

**drawCaveDebug (21125) — USEFUL-WITH-CAVEATS.**
- Truthful: playerZ, underground, gridCave/meshCave.
- Fiction:
  - The FLOOR CLAMP block (21194–203); no 150u/−0.1 rule exists in physics.
  - `deferred quads`: `_deferredCaveQuads` is never pushed.
  - `clamped` (`mc > 2.0`).
- The panel is never re-hidden.

**drawCaveProfileChart (21340) — MISLEADING.**
- The ceiling/void is drawn only `if (_ceils[i] > 0.1)` (21449); RT, that never happens.
- It draws no cap and no surfaceH.
- The axis is player→entrance, not `entrance.angle`.
- Sampling: 60 point samples give a step over 12u beyond 348u, so it can step over a one-cell hole.
- "Steep" means `atan(slope*25)` > 45°, about 0.48u/cell, versus STEP_UP 1.0.
- It returns before `clearRect`, leaving a stale image.

**drawCaveControlMap (21582) — USEFUL-WITH-CAVEATS.**
- It reads the mesh truthfully, but only runs in CAVE_TEST_MODE (21870).
- Wall red/green omits the `!playerUnderground && gridCave` pass-through (9999).
- `visR = 14*gs` is a fossil.
- The depth colour saturates at 4, while caves are 6–8.5 deep.
- It shows no caps, chunk lines, entrance axis, or the 30u cap-exclusion disc.

**Arch-Vis `_logVis` (16594) — USEFUL-WITH-CAVEATS.**
- It logs archway props only, not cave geometry.
- The key `'ent'+ci` indexes a distance-sorted list (16540/16592) and is never reset on a window shift.
  - SUSPECTED: this produces spurious transitions.
- `eyeZ = cam.z` (×40 scale) is compared with `maxZ*25` (16465/16495); the true eye is `cameraZ` (454).

**CAVE_TEST_MODE / caveTestFlags — USEFUL-WITH-CAVEATS.**
- It forces 'plains' (4304, wallThresh 0.88), but production caves only spawn in the 'cave' biome (4459, 0.74).
- The `caveEnemies:true` default (959) is always overwritten by the unchecked box (22129).

## Flags: what is coloured vs the legend
- **POLY_TYPES — USEFUL.** The colouring source matches the legend. Undocumented:
  - Yellow also marks a ceiling tilted ≥ 1u (13087).
  - The dirt skirt is suppressed (12883).
  - Colours are still multiplied by lighting.
- **LAYER_TYPES — legend wrong.** The tooltip says "green=cave floor(1)". In code, green is open-sky surface and ORANGE is cave floor (12803–04).
  - Ramp cells read as "surface".
  - Type 3 is never generated (RT: 0).
- **CAVE_COLORS — MISLEADING.** The legend lists cyan/yellow/blue/magenta, and the tooltip adds green=edge. The only real effect is green cave walls (11907–09), and `caveColorLegend` is never shown.
- **HIDE_CEIL — near no-op.** Ceilings draw only in uncapped mouth cells (17 on seed 12345).
- **HIDE_PLATS** hides the whole floor, caps included.
- **HIDE_WALLS:** the tooltip "(also includes the floor)" is false. It also freezes `depthBuffer`, which is written only at 11792/12017, corrupting entity and arch occlusion.
- **CEIL_WIRE** outlines rendered quads only.
- **DEBUG_FLOOR / DEBUG_FLOOR_LINE — DEAD** (never read).
- **DEBUG_CAVE:** `[CAVE-GEOM]` logs only for chunks generated while the flag is on (5636).

## Dead or contradictory code
- `__cvDbgLast`, `__cvDeferLast`, `__cvTransLast` (1393–95) are dead.
- `queryEntranceZone`, `queryEntranceRamp` and `queryEntranceApproach` have no live callers; only `queryCaveGeometry` is used.
- `APPROACH_DEPTH_THRESH` (6652) is unused.
- The picker's comment "Uses the precomputed lXMeta" (7866) is contradicted by "No ceiling-reachability check" (7877).

## What truthful instrumentation shows (RT: real `step()`, walking the entrance axis in and out)
- `playerUnderground` flips 6–10 times per trip.
  - The 1200 comment "ceiling overhead" is wrong.
  - It is false at the arch (cave-floor depth, rock overhead) because it means "cap above" (19358) and caps are excluded within 30u (6647).
  - It is also false whenever the picker returns 'fall' mid-cave.
- 14–17 airborne episodes occur descending the ramp (10179: `> groundZ2 + 3`, i.e. 0.075u).
- The floor steps by −1.64 / −2.1 / −1.28 in one cell where `approach` hands over to the cave feature.
  - `approachDepth = e.depth || 5` (4741), but network entrances carry no `depth` (4486; RT).
  - Corridors are 6–8.5 deep.
- The "shouldn't happen" return `{topH:0, idx:-1}` (7901) fires while climbing out on 3 of 4 seeds. The player pops +0.74 to +2.42u in one step.
- Ceiling and cap begin 168–420u out on the supposedly open ramp. The eye sits between ceiling and cap for 7–107 steps.
- Stale floor cache: the tick bumps only in 3D `draw()` (18967), not in `assembleWindow`.
  - RT: 22 wrong `wallFaceBase` faces after a shift, and 0 with invalidation.
- SUSPECTED visual impact: culls at 13041 and 12052 compare ×40 `cam.z` against ×25 Z.

## Missing instrumentation
1. A per-step ring buffer, auto-dumped on a 3rd-path return, |ΔH| > 0.5, H below the lowest layer, an underground flip, or a window shift. Fields:
   - world x/y, H, vel, airborne
   - picker result and return path, STEP_DOWN in force
   - full layer stack, underground, windowCX/CY
2. A mesh invariant check after `assembleWindow`: l0Type == 1, ascending Z, ceiling ≥ floor + 2.4 (eye height), cap > ceiling, and per-cell step ≤ STEP_UP on the axis.
3. A generator-vs-mesh diff map showing `source`, chunk lines, the entrance axis and the cull rectangles.
4. A per-cell axis profile showing all layers plus the eye line.
5. Counters for every cull listed above, per-layer-type hide flags, and a crosshair ray probe in painter order.
6. A capture holding seed, world pos, floorZ, angle, window, mode and flags, with a `caveLoad()` to restore it. The seed override must be honoured in normal Endless.
7. A headless multi-seed walk test (already prototyped in the sandbox).
8. A visible render-crash indicator: `_pt` currently swallows exceptions (20578–86).

**Files.**
- Source: ./components/hardwareone/WebPage_Games.h
- Harnesses, all in <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/agent_debugtools/:
  - run_deno.js
  - stubs.js
  - harness1.js through harness6.js

Nothing in the repo was modified.