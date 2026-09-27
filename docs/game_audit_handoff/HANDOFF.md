# Endless crawler (WebPage_Games.h): audit findings, methods, and test-lab handoff

Date of work: 2026-09-18 to 2026-09-20. Target: `components/hardwareone/WebPage_Games.h`
(the game is one ~1 MB JavaScript raw string, header lines 215-22515) and
`WebPage_Games.cpp` (31 lines, registers only `GET /games`). `WebPage_DarkRoom.h`
was deliberately out of scope and never read.

**Every `L####` below is a header line number of WebPage_Games.h** at the time of
the audit. The test lab pads the extracted JavaScript so that extracted line N ==
header line N, so the same numbers appear in stack traces and check details.

---

## 0. Status in one screen

- **Audit: complete.** Report sections A-K were delivered, then refined by the
  test lab (corrections in 3.12).
- **Test lab: complete, including every suite-local revision gate, the final
  frozen-tree cross-suite matrix, real-browser evidence, and aggregate
  integration pass on the dedicated Mac mini.**
  - Phase 1 (authoring 10 suites): done.
  - My independent re-run of all 105 mutation probes: done, 105/105 flip as claimed.
  - Phase 2 (adversarial review + completeness critic): done.
  - Phase 3 (revision): the original run was cut off by a machine sleep and then
    an app quit. Work resumed on 2026-09-19 with resource-safe defaults and was
    completed on 2026-09-20. Section 4.6 is the final suite evidence record.
- **The game itself was never modified.** Every lab file is still untracked:
  see 0.2. (After this handoff was written, release v0.99.94.1 was committed and
  tagged: deployment profiles plus four-part OTA versions. It does not touch
  `WebPage_Games.h` or any lab file, so every line reference here still holds.)

### 0.1 Rerun guidance
Read section 6 (resource limits) before running anything, then use the commands
and evidence record in sections 4.1, 4.6, and 4.8.

### 0.2 Files that must travel with this doc (all untracked in git)

```
tools/webui/game_lab.py              runner, unittest bridge, probe helpers, worker pool
tools/webui/game_probe_matrix.py     cross-suite probe matrix (run each probe against every suite)
tools/webui/game_page.py             builds the standalone in-browser visual test page
tools/webui/harness/_game_env.js     headless host (LAB API) shared by every game harness
tools/webui/harness/game_smoke_harness.js
tools/webui/harness/game_caves_geometry_harness.js
tools/webui/harness/game_caves_transition_harness.js
tools/webui/harness/game_physics_harness.js
tools/webui/harness/game_render_harness.js
tools/webui/harness/game_enemies_harness.js
tools/webui/harness/game_persistence_harness.js
tools/webui/harness/game_loot_harness.js
tools/webui/harness/game_perf_harness.js
tools/webui/harness/game_tools_harness.js
tools/webui/harness/game_browser_harness.js
tools/webui/harness/game_browser_driver.js
tools/webui/tests/test_game_*.py     (12 files: smoke + the 10 suites + test_game_page.py)
docs/game_audit_handoff/             (this folder)
```

The pre-existing `tools/webui/` infrastructure (`extract_js.py`, `js_engine.py`,
`harness/_bootstrap.js`, the non-game harnesses and tests) is tracked in git and
unchanged. `.claude/launch.json` (gitignored) got a `game-visual-page` entry
serving a temp dir. It is machine-specific and not needed.

---

## 1. Scope and ground rules that applied

- The audit was READ-ONLY on the game. The later test-lab work added files under
  `tools/webui/` and `docs/` only. No edits to `WebPage_Games.h`, no commits.
- The repo owner's standing rules: never commit or push without explicit
  per-instance approval; never `git add -A` (untracked docs and capture data are
  normal here and must not be swept in); commit style is `vX.Y.Z: what it does`,
  in plain English.
- Evidence standard used throughout: a claim counts as CONFIRMED only when the
  source shows it (line refs) or an executed experiment reproduces it. Anything
  else is SUSPECTED and names the runtime evidence that would settle it. Agent
  reports were never taken on their word: they were spot-checked against source,
  or their probes were re-run independently.

---

## 2. Methodology

### 2.1 Static audit
1. Extract the JS with its line numbers preserved: replace every header line
   outside 215-22515 with an empty line (awk, see `evidence/audit_scripts/README.md`).
   Grep that file, and line numbers match the header.
2. Build a function index (grep for `function NAME(` and `window.X = function`).
3. Read every function on the cave path IN FULL, not by single-line grep:
   generateCaveNetwork, queryCaveGeometry, the dead query functions,
   generateChunk's cave stamping and layer conversion, assembleWindow (caps, sort,
   gridCave, wallFaceBase, wallCapZ), getFloorHeightAt, getWalkableLayerTopAt,
   step, updateDayNight, and the draw passes (floor, ceiling, walls, entrance arch).
4. Call-site greps settled liveness. `queryEntranceZone`, `queryEntranceRamp` and
   `queryEntranceApproach` have no live callers. `isEntrance` feeds only a debug
   counter. `_camNearAnyEnt` is written and never read.

### 2.2 Execute the real game headless (the step that found the non-obvious bugs)
macOS JavaScriptCore (`jsc`) was available; node was not (deno was, and the lab
later preferred it). The whole game script was loaded into jsc with a small DOM
and canvas stub (`evidence/audit_scripts/prelude.js`). The game's OWN functions
were then called directly: `resetEndlessMode` in Cave Test mode with a fixed seed,
`gameUpdate`/`handleInput` for walking, the draw passes against a recording 2D
context, `getWalkableLayerTopAt` for transition scans. The scripts in
`evidence/audit_scripts/` produced every number in section 3 that carries "RUN".
Principle: never re-implement the thing being measured. The audit found that the
game's own debug tool `caveGaps` does exactly that and reports 0 by construction.

### 2.3 Parallel read-only sub-audits
Six agents audited one area each: enemy movement, persistence/seed, rendering
performance, chest rewards + legacy levels, debug tools, and an entrance-constants
inventory. Their full final reports are in `evidence/audit_agents/`. Their claims
were spot-checked against source before use. Several of them also ran the game
headless (jsc or deno) or in the built-in Chromium pane.

### 2.4 The test lab (tools/webui) and why it is built this way
Goal: turn every finding into an executable check that says how the game SHOULD
behave, so today's bugs FAIL and a real fix flips them to PASS.

- **Engine portability.** It reuses the repo's existing `tools/webui` layer:
  `js_engine.py` finds node/deno/bun/qjs/jsc/osascript, and `_bootstrap.js`
  gives every engine `__out`, `slurp`, `__argv`. Verdicts are stdout sentinel lines
  (`PASS id`, `FAIL id [detail]`, `METRIC id value`, `NOTE`, one `HARNESS_RESULT`),
  never exit codes, because exit codes differ across engines.
- **`harness/_game_env.js` (the `LAB` object).** It loads the game by indirect
  eval, so the game's top-level vars become globals and the harness can read and
  write them by name even on deno, where the harness is an ES module. It provides:
  - Proxy DOM/canvas stubs;
  - a recording 2D context (`LAB.record`) that counts fills and classifies them
    with the game's own `DEBUG_POLY_TYPES` palette;
  - a VIRTUAL clock (enemy AI is gated on wall time at L11405, so a real clock
    makes runs machine-dependent);
  - a seeded `Math.random`;
  - captured timers (on deno the game's real 16 ms interval would keep the process
    alive);
  - world starters (`startCaveTest`, `startEndless(seed)` steers the one
    `Math.random` call at L7522, `startLevel`);
  - movement (`tick`, `frame`, `frameAt`, `walkTo` with an `fps` option);
  - world readers (`layers`, `topWalkable`, entrance frames, `placeWorld`);
  - page-lifetime helpers (`freshPage`, `releasePad`, error marks, `countCalls`,
    `fx`, `cellWorld`, `standingLayer`).
- **Extraction** (`game_lab.game_js`). It uses the repo's `extract_js.page_js` and
  asserts a single constant line offset, then pads the text so that line N equals
  header line N.
- **KNOWN_BUGS** (per test module). Each entry maps a check id to
  `(reason, detail_regex)`. The unittest bridge (`game_lab.suite_testcase`) fails
  when:
  - a check that is not listed fails (a regression);
  - a listed check passes (fixed: remove the entry);
  - a listed id no longer exists;
  - a listed check fails with `PRECONDITION` in its detail, or with a detail that
    does not match the regex (it is failing for a different reason than documented).
- **Mutation probes** (`PROBES`, validated by `probe_testcase`, opt-in with
  `HW1_GAME_PROBES=1`). A probe is an in-memory edit of a COPY of the game: one
  (anchor, replacement) pair, or a list of pairs, with each anchor required to
  occur exactly once. It declares which checks must flip. A FIX probe removes a
  bug's cause and its check must go PASS. A BREAK probe injects a defect and a
  passing check must go FAIL. This is how the lab proves a check is neither
  vacuous nor failing for an unrelated reason. The pattern follows the repo's
  existing `test_harness_detects_regressions.py`.
- **Cross-suite probe matrix** (`game_probe_matrix.py`). It runs a probe against
  EVERY suite and reports collateral flips. It exists because one suite's FIX can
  break another suite's check (measured: the physics D11 FIX breaks a
  caves_transition check).
- **Determinism and engines.** Two runs must print identical PASS/FAIL/METRIC
  lines (excluding `*_ms` timing metrics). deno and jsc must print identical
  PASS/FAIL lines. Both held for every phase-1 suite.
- **Seeds convention.** `--seeds` means Cave Test worlds; `--endless-seeds` means
  normal Endless worlds. This was decided centrally before phase 3 and adopted
  by every final suite.

### 2.5 Verification protocol that was followed
1. Phase 1: one author agent per suite wrote the harness and unittest wrapper, ran
   both engines, triaged every FAIL against the audit, and validated probes.
2. Orchestrator check: I re-ran all 105 probes independently. At first 7 appeared
   to fail. The cause was a thread-safety race in MY runner (`extracted_path`: two
   threads created temp dirs, or two threads wrote different mutations to one file
   name). After fixing it with a lock and content-hash file names: **105/105 flip
   exactly as declared.**
3. Shared-code changes were proven inert with before/after snapshots of every
   suite's verdict lines (`snap_verdicts.py`). The env consolidation patch changed
   0 checks and 0 deterministic metrics in 11 suites.
4. Phase 2: one adversarial reviewer per suite (default stance: a check is
   UNPROVEN until shown otherwise; evidence required), plus a completeness critic
   mapping every finding id and user complaint to checks. Full output:
   `evidence/lab_runs/phase2_reviews_and_critic.json`.
5. Phase 3 (revision) was interrupted, then resumed and completed: every flagged
   check was resolved or dispositioned, the duplicate-ownership map (4.4) was
   applied, missing checks were added, and probes were re-proven on both engines.

---

## 3. Findings

### 3.1 Executive conclusion
Verdict on the previous AI audit's nine claims:

| # | Previous claim | Verdict |
|---|---|---|
| 1 | Many independent systems interpret the transition | Partly right, wrong list: 3 of the named functions are dead code. One live generator (queryCaveGeometry), then ~20 consumers each re-derive "am I in a cave?" |
| 2 | Conflicting entrance constants (60/480/48 vs zone widths) | Wrong as stated: queryEntranceZone never runs. The real conflicts are different (3.4) |
| 3 | `_camNearAnyEnt` unused | Correct (L12557-12564, never read) but explains nothing. The real gates are a camera-blind cap-above cull and a global boolean |
| 4 | Falling from floor selection | Right area, wrong mechanism: a fabricated h=0 fallback (D11) plus micro-falls (D12). Physics is fixed-step 1/60 (max 4 steps), so there is no dt tunnelling |
| 5 | Enemies stuck from no pathfinding | Overstated: chase is LOS-gated and jams in <=0.25% of trials. Freezes come from patrol (F1-F4) |
| 6 | Floor buffer overflow | Endless: unreachable (worst 74%). Fixed Level 4: overflows by up to ~6.6k cells, but invisible because fixed-level 3D floors throw (D24) |
| 7 | Cave chests gold-only | Correct and understated: they also skip the tier gold multiplier (D22) |
| 8 | No persistence across reloads | Correct; "session-level persistence" is overstated (3.9) |
| 9 | Fixed levels secondary | True for generation (disjoint pipelines). Legacy code still leaks into Endless at runtime (D24), and fixed-level 3D rendering is broken outright |

**Central architectural problem.** The world is a layered heightfield: per mesh
cell up to 5 layers, types 1 floor, 2 ceiling, 3 ledge (never generated), 4 surface
cap. But only the player's floor picker (`getWalkableLayerTopAt`) understands layers.
Everything else collapses the stack to one of three things:

- `l0TopZ` via `getFloorHeightAt` (L7816). After the Z sort that is frequently the
  CEILING, or the cave floor under the grass.
- the single global boolean `playerUnderground`.
- the old heuristic "height < -0.1 means cave".

This affects entity Z, entity culling, wall bases and tops, which walls are solid,
lighting, and all three painter passes. On top of that, the generator never defines
a cave MOUTH. The "entrance" is just where three unrelated things overlap:
a feathered round corridor end (radius hw+108), an approach trench with its own
depth (always 5), and a 30 u hole punched in the cap. Nothing in the data can
express "surface and cave are both visible and walkable here", so every subsystem
patches that with its own radius.

A second structural fact: normal Endless has caves only in `cave`-biome regions,
and only 30% of those. That is 1.1-3.7% of 1440 u regions, and the nearest entrance
is 3,200-14,600 u from spawn. Cave Test mode forces plains terrain and a network at
region (0,0), so it is not representative of normal play.

### 3.2 Surface-to-cave pipeline (as traced)

1. **generateCaveNetwork L4439.**
   - Entrances are stored as `{x, y, angle}` with NO depth (L4486); `angle` faces INTO the cave.
   - Corridors are 90-140 u wide and 6.0-8.5 h deep; ceilH 5.0-6.5.
   - `rng2` and `rng` share `chunkRng(rx,ry,100)` (L4465/L4472), so normal mode ALWAYS gets 2 entrances.
2. **queryCaveGeometry L4658** (the only live geometry query).
   - Corridor and chamber feather is hw+108 / r+108 (L4684, L4702).
   - Any cell with fade>0 gets a ceiling (L4756-4771).
   - The approach trench uses `e.depth || 5`, i.e. always 5 (L4741).
   - Walls are carved only where fade>0.3 (L4773).
3. **generateChunk stamping.**
   - The wall carve samples cell centres with surface fixed at 2.0 (L5410).
   - The floor stamp samples mesh corners, with the chunk-clipped 21x21 MAX surface clamped to >=1 (L5593-5606).
   - The floor is lerped by fade (L5618); the ceiling is stamped at full value regardless of fade (L5621).
   - Layers are written in index order, l0=floor and l1=ceiling (L6267-6280).
4. **assembleWindow L6324.**
   - Every ceilinged cell gets a cap (type 4) except within CAP_EXCL 30 u of an entrance (L6647, L6680).
   - The cap is clamped to at least ceiling+0.25 (L6693).
   - The stack is then Z-sorted (L6724), so **l0 can become the ceiling**.
   - Also built here: gridCave (L6757), wallFaceBase via getFloorHeightAt (L6834), wallCapZ/wallMaxTopZ (L6924) with `_seaZ = 0` (L6984), buildWalkCandZ.
5. **Collision.**
   - There is one 2D `grid`; caves only DELETE walls (L5411).
   - "Cave walls" are surface noise walls that sit next to a ceilinged cell.
   - The surface player skips them (L9999/L10014/L10314); enemies never do (F6).
6. **Player Z.**
   - `getWalkableLayerTopAt` L7831 picks the nearest walkable within [h-1, h+1]. STEP_DOWN is 10 within 260 u of an entrance (L7853). Ceilings are not solid (L7877).
   - If nothing is in range it falls to the highest layer below. **If there is none, it returns topH 0** (L7901).
   - `step()` eases Z 30%/tick (L10277) and starts a fall when above ground by >3 physics units = 0.075 h (L10179).
7. **Underground detection** (L19342-19360) lives inside `updateDayNight`, after an early return when day/night is off (L19294). It means "a cap is above my layer".
8. **Rendering.** Separate painter passes: skybox, ceilings, floors, walls, entities (L18969-18979), with no shared depth.
   - Floor pass: a surface player skips any floor with a cap above, regardless of camera height (L12691).
   - Ceiling pass: skips any ceiling with a walkable layer above (L13045-13050).
   - Walls: a capped-wall cull compares `cam.z` (40-scale) with `Z*25` (L12052); mixed units.

### 3.3 Axis profile, Cave Test seed 12345, entrance[0] (along>0 = outside)
- Open trench from along +468 to +228: floor 3.4 -> -0.8 (target -5).
- At about +222 the record switches from `approach` to `chamber`/`corridor`: the floor steps -1.64 in one cell, the ceiling -1.86 appears BELOW the outside floor, and the cap +3.45 appears.
- The roof covers +216 .. +36. The cap hole spans |along| <= 24. The cap resumes at -36.
- Across seeds, the roof starts 162/180/222/384 u outside the arch (1/777/12345/424242).
- Worst single-cell floor step on the axis is -0.81 .. -2.15. Minimum headroom outside the arch is 0.13 .. 3.2 h, against an eye height of 2.4 h.

### 3.4 Entrance constants (condensed; the full 40-row inventory is in evidence/audit_agents/entrance_constants_inventory.md)
E = entrance point. u = world units. h = mesh height.

| Line | Rule | Controls | Conflict |
|---|---|---|---|
| L4481-4486 | entrance on a 240-480 ring, facing in | placement | record has no `depth`, which breaks L4741 |
| L4660/L4721 | MOUTH_RADIUS 60 sets isEntrance | nothing live | only a debug counter (L5613) |
| L4661-4666 | approach 480 long, half-width 48 -> 150, feather x0.8 | open trench | its inner 160-380 u are under ceiling + cap |
| L4741 | `e.depth \|\| 5` | trench depth | always 5 vs cave 6.0-8.5, giving a step at the handover |
| L4684/L4702 | feather hw+108 / r+108, ceiling where fade>0 | ceiling + cap footprint | the round corridor end extends 162-384 u outside the arch |
| L4773 | carve walls where fade>0.3 | walls removed | leaves a 40-52 u ring of ceiling with uncarved walls (F6) |
| L6647 | CAP_EXCL 30 u disc | the only cap hole | 17 of 6,189 ceilinged cells uncapped; underground flips false here |
| L6652 | APPROACH_DEPTH_THRESH 1.0 | nothing | never read |
| L779 | reserve box along<44, cross<34 | entity/decor filter | comment assumes ARCH_W 56; actual 90 (L16427) |
| L12579 | _entHalf 22 (44x44 square) | floor-quad hole in render | different shape from the physics hole (disc 30) |
| L12551 | _entRadSq 100^2 | nothing | never read |
| L7853 | STEP_DOWN 10 within 260 u | player drops | 260 is a stale number; the approach is 480 u (N14) |
| L19380-19384 | ambient blend within 120 u | lighting | inverted, and centred on E, not the roof edge |
| L5525/L5541 | surface smoothing | height blur | disc of 300 u clipped to the chunk; comment says 10 cells |
| L4828 | ENTRANCE_ZONE_REACH 520 | chunk inclusion | live, but documented against dead code |
| L16427-16433, L16547 | arch 90 wide, 110 tall, base at cave floor | arch graphic | top sits ~5 h below ground, inside the real roof edge |
| L6984 | _seaZ 0 | mouth wall-top clamp | assumes surface ~0; terrain is about +-6 |
| L12052, L13041, L16465 | cam.z vs Z*25 | wall/ceiling/arch culls | mixed units (correct conversion at L454) |
| L4811, L4851-4856 | 180; 480/220/150/120/110 | dead functions | harmless |

### 3.5 Confirmed bugs (D). RUN = reproduced by execution.

**Geometry and visibility**
- **D1** The approach trench is always depth 5 (L4486, L4741) while corridors are 6.0-8.5 (L4496). RUN: a -1.64 floor step within one cell at +222, and a +0.74 h jump in one tick walking out. Lab: the path-step check fails on 8/9 entrances. Fixing the depth alone fixes 5/8; the rest are the feather slope (N14).
- **D2** The roof (ceiling + cap) starts 162-384 u outside the arch (L4684/L4702/L4756-4771/L5621/L6680). The ceiling sits below the outside floor at the roof edge. Headroom is as low as 0.58 / 0.13 against an eye of 2.4. Lab: 8,419/43,470 open cells under a ceiling have less than 2.4 h headroom.
- **D3** `playerUnderground` really means "a cap is above me" (L19355-19360). RUN: it flips 3 times walking in; ambient goes 0.90 -> 0.45 -> 0.81 (rising to ~0.89 at the arch) -> 0.45. It is false at the arch.
- **D4** The cap-above floor cull ignores camera height (L12691). RUN: 3 cave-floor quads visible from the trench, 0 from the arch, ~2,300 once inside. Lab: all of those 3 are the open pit; 0 buried-tunnel quads are drawn from outside.
- **D5** A ceiling with any walkable layer above never draws (L13045-13050). RUN: deep inside, 2,833 stitched and 0 drawn. Underground, the floor pass also submits 2,786 cap + 2,713 open-surface quads overhead, against 2,313 cave-floor quads.
- **D6** `getFloorHeightAt` returns l0 blindly (L7816). After the sort, l0 is the ceiling in 1,226/6,189 cave cells (seed 12345; 9,123/52,757 over 6 worlds). This feeds enemy Z (L11459), getWallTopZ, wall bases, and the arch base.
- **D7** The entity cull `!playerUnderground && fh < -0.1` (L511) hides 10/55 up to 84/90 enemies and up to 16/17 chests in normal Endless, because 13-95% of normal terrain is below -0.1.
- **D8** `caveCeilAt` requires `_ch > 0.1` (L12129). Every ceiling is <= 0.1, so the wall-to-ceiling extension is dead.
- **D9** The ambient blend (L19380-19384) is inverted and centred on the entrance point. It is masked today by D2; with the D3 and D2 fixes applied, its signature appears on every walk.
- **D10** Underground detection sits after the day/night early return (L19294). RUN: with day/night off, the flag freezes (stays true 450 u out on open ground).

**Physics**
- **D11** The no-candidate fallback returns topH 0 (L7901), and `step()` falls to it (L10172-10183). RUN (seed 12345): walking north from world (246,756), a 1.02 h rise at (246,720) exceeds STEP_UP. The player ends at h=0.00 under terrain 3.62, with the eye below ground for 160/200 ticks. The whole window has 24 such pairs; lab worlds have more.
- **D12** The edge-fall threshold is 0.075 h (L10179) and per-cell Z is flat, so micro-falls happen on downhill edges. Lab: 45 airborne episodes across 238 downhill edges; not every edge. RUN: 27 airborne toggles walking down the trench.
- **D13** Cave Test spawns at h=0 between layers (L7600, L7612-7617). Seeds 12345/424242 free-fall; seeds 1/777 are eased up onto the cap.
- **D14** Caves have no solid sides. RUN: walked 573 u sideways with no wall, in jolts of +1.70 h per tick, passing through the ceiling layer into rock under the cap. Lab: on the + side of seed 12345 the player stalls at grid cave walls at perp +225, under the surface.
- **D15** The floor-height cache is only invalidated in 3D `draw()` (L18967). Lab refinement: stale reads happen only INSIDE `assembleWindow`'s wallFaceBase precompute, and leave 16-22 wrong faces per shift. No stale reads after it returns.

**Generation**
- **D16** `rng2`/`rng` share a seed (L4465/L4472): 134/134 normal-mode networks have 2 entrances. Cave Test skips the gate and gets 1 or 2.
- **D17** The water check for wall placement calls `terrainNoise` under the WALL seed (L4978 -> L4987), so it reads the wrong noise field. Critic measured 102-313 walls on water cells per seed; 0-4 with the fix.

**Enemies, persistence, legacy**
- **D18** Patrol freeze: each enemy gets 2 unvalidated waypoints within +-50 u (surface) / +-30 u (cave) (L5904, L5947), and the arrival radius is 14 (L11295).
- **D19** The enemy save drops `underground`/`arenaEnemy`/`fromSpawner` (L7369-7382), while the restore reads them (L7063).
- **D20** Stat pickups are rebased twice (L7117-7119 then L7320-7322), so they sit exactly 480 u off their ruin. `fortressAllies` are not rebased at all.
- **D21** The player cannot die: health regen (L10090) runs before the death check (L10334), and the only damage write clamps at 0 (L11282).
- **D22** Cave terminal chests pay gold only, with no tier multiplier (L5967-5977). `collectChest` (L20175-20220) never reads `tier`. Sim: 24.4 gold mean for every tier, against 29.6 for a common surface chest.
- **D23** `WINDOW_CHUNKS` defaults to 7 (L293/L965) while `settings.chunkWindow` is 5 (L1186). Pressing Apply duplicates enemies, e.g. 41->74 (the size changes at L17756 before the save pass at L6334).
- **D24** Legacy code leaks into Endless:
  - the goal spawn has no mode guard (L11495);
  - `onCalibUpdate` calls `resetLevel(1)` (L9854);
  - **every fixed level's 3D floor throws on its first quad every frame**: the level mesh has no `lNColor` (L12788). `_pt` swallows the error, and one ctx.save() leaks per frame (L12472).
- **D25** The floor render buffer holds 40,000 cells and its write is unguarded (L12643). Endless worst case is 29,632-29,792 cells (74%). Fixed Level 4 (4320x2880, view distance 2304) overflows by up to ~6.6k cells at pitch 1.4 plus dash. The dropped cells are the last in scan order.

### 3.6 Suspected (E) and their status
- **E1** What the mouth looks like: screenshot-only; the browser half of the lab does this.
- **E2** Chunk-border seams: **NOT reproduced** (border pairs 3.4% over STEP_UP against 4.2% overall).
- **E3** Networks truncated by the 3x3 region lookup: **NOT reproduced** (0/45,762 probe points; nearest 792 u from the reach).
- **E4** Cap lifted above terrain (L6693): 4,555 caps raised, up to +2.24 h. Cliffs > STEP_UP form 0-18 times per world. Metric only.
- **E5** `_pt` swallows exceptions mid-tick: partially covered.
- **E6** 16 ms gamepad polling with no in-flight guard (L9799) against the single-task ESP32 httpd: 10 ticks issue 10 requests.
- **E7** LOS flicker at corners: 0/64 sweeps flickered, so not reproduced. The 200 ms LOS cache returned 2/241 stale answers.
- **E8** Arch pops (mixed units in `canSeePoint` L16465): 0 toggles on the axis. Pops, if real, are off-axis.

### 3.7 Enemies (F) -- details in evidence/audit_agents/enemy_movement.md
- **F1 (=D18) patrol ping-pong.** On an empty grid 18.9% of surface and 42.6% of cave enemies freeze. In play the cave figure is 22.9%, because separation shoves keep some moving.
- **F2 no slide in patrol** (L11307). After losing LOS, enemies alternate between two blocked waypoints: 13.6% (plains) to 53.5% (cave biome) of displaced enemies froze.
- **F3 Brute wall radius 6.72 > half cell 6.** They spawn embedded (seed-dependent 2.3-11.4%), and embedded Brutes never patrol. Ruin walls stamped after enemy placement (L6181 vs L5885) can embed any enemy.
- **F4 `_separatePair` tests only the centre cell** (L19282): 41/240 cluster members embedded (tank 32, fast 7, normal 2).
- **F5 walk animation keyed to camera distance** (L14070): frozen enemies play the walk cycle.
- **F6 ring of ceilinged-but-uncarved walls.** Invisible and passable for a surface player; solid and LOS-blocking for enemies. Enemies call `isInGridWall` without Z, so both exemptions are skipped (737 disagreement points measured).
- **F7 LOS is 2D only** (L9950-9955), so enemies aggro through the cave roof.
- Chase with LOS works: at least 98.75% of trials reach the player. Cave passages are at least 149 u wide against bodies of 9.6-13.4 u. **Pathfinding is not the problem.**
- **N2** In open ground enemies cannot land a hit: `repelFromEnemies` pushes out to 12+8*size (L10042), beyond the windup range 6+8*size (L11372). The closest approach is 16.3-22.4 u against reach 12.4-17.2 u, so hits land only when the player is pinned against a wall.

### 3.8 Performance (G) -- details in evidence/audit_agents/rendering_performance.md

**Per-frame JS cost, headless jsc (no raster).**

| Scenario | Floor pass | Fills |
|---|---|---|
| view distance 900 | 2.7 ms | 5,146 |
| view distance 1300 | 4.2 ms | 10,783 |
| view distance 1800 | 8.1 ms | 19,831 |
| inside the cave at 900 | 7.4 ms | 6,745 |

About 70% of the inside-cave quads are overhead undersides (D5).

**Chromium main thread per frame at 360x240.**

| Preset | Time | Fills |
|---|---|---|
| low | 1.9 ms | 1.7k |
| medium | 6.3 ms | 5.4k |
| high | 13.0 ms | 11.4k |
| ultra | 24.6 ms | 22k |

With raster forced, the default preset takes 9.9 ms at 360x240 and 28.6 ms at 1080p.

- **G1 floor pass.** One `fill()` per quad, no batching. It creates a closure per layer per cell per frame (L12703), a new array per `layerAt` (L12504), and a `parseInt` plus an rgb string per quad (L12856, L12872). The comb sort runs per frame (L12650).
- **G2 walls pass.** An object per face plus a sort (L12248). Generation noise runs at render time per visible wall cell (`getWallBiomeRGB` L12083, `getBiomeAt` L12100): 1,067 calls each per pass. The gradient cache misses 82%.
- **G3 window rebuild.** Synchronous; about 17 MB estimated per rebuild, including an estimated `Float32Array` per mesh cell (L843). Timings: 44-121 ms (7x7) and 63-206 ms (9x9) in Chromium, 536 ms when switching to Ultra. There is no hysteresis (L7483), so a 1 u wiggle rebuilds every time. It writes 20-27 console lines per shift.
- **G4** Fullscreen ignores `settings.resolution` (L691).
- **G5** Every Endless start opens the debug overview (L7648): 78,418 `fillRect` per frame.
- **G6** `_rgbCache` is unbounded: 28-52k entries in far biomes (the comment says 1-3k).
- **G7 / N1** Turn rate AND walking speed scale with frame rate: 100.6 u/s at 60 fps, 50.4 at 30, 33.6 at 20. `handleInput(FIXED_DT)` runs once per rendered frame (L21910), while damping runs per physics step.
- **G8 ESP32.** The current 1,013,814-byte script body is sent in one `httpd_resp_send_chunk`; gzip -9 makes it 270,209 bytes. There are no gzip or cache headers, and the single-task httpd is held for the whole transfer. The Perf HUD "fps" is 1000/JS-time (L20777), so it cannot see raster. Keyboard/mouse play makes no requests after load.

### 3.9 Persistence (H) -- details in evidence/audit_agents/persistence_and_seed.md
- **H1** No storage of any kind: no localStorage, IndexedDB, cookies or server saves. Reload, browser restart or device reboot loses everything.
- **H2** Enemy deaths are lost when a chunk is evicted (more than WINDOW_CHUNKS+2 chunks away). Enemies respawn at full health.
- **H3** Chest swaps: `quality` is not saved (L7397-7401), and after eviction the chest reverts to its original item, duplicating it.
- **H4** Spell upgrades are never reset on a new world.
- **H5** The seed cannot be set in normal Endless. `_caveTestSeedOverride` works from the console only, in Cave Test.
- **H6 / N12** The guaranteed market/shrine applies only on the first run per page load (`!grid`, L6358). The injected feature vanishes once its chunk is evicted.
- **H7** `pickRandomRelic` depends on the equipped relic (L3688), so chunk content depends on player state.
- **H8** `entityDeltas` grows by about 11.2 KB per crossing (882 keys / 1.41 MB after 120 crossings), and `endlessCaveNetworks` is never evicted.
- Generation is otherwise deterministic and order-independent: 0 diffs over 243 chunks across visit orders.

### 3.10 Debug tools (I) -- details in evidence/audit_agents/debug_tools.md
- **I1** `caveDiag().lastTransitionSnapshot` is always null: `__caveDebugLast` is read but never written.
- **I2** `caveGaps` is a tautology: it compares `wallFaceBase` with the same samples that defined it.
- **I3** `caveCapture` reports l0 as the floor. Its `config` block is literals that exist nowhere else. It has no reproduce fields and no loader.
- **I4** `caveTest` is dead and stale.
- **I5** `__caveStats` is mislabelled (e.g. `ceilSkipEntrRange` counts stitch failures).
- **I6** The profile chart draws ceilings only if > 0.1, i.e. never.
- **I7** The layer-types legend is swapped, the cave-colours legend is never shown, and the `DEBUG_FLOOR`/`DEBUG_FLOOR_LINE`/`DEBUG_TEXTURE` checkboxes are dead.
- **Only `DEBUG_POLY_TYPES` is truthful.** `debugCaveAt` agrees with the mesh except where the real smoothed surface is below its hard-coded 2.0 (seed 1).

### 3.11 New findings made by the lab authors (each backed by a validated probe or run)
- **N1** walking speed and turn rate depend on frame rate (see G7).
- **N2** enemies can't hit in open ground (see 3.7).
- **N3** jumps pass through cave ceilings: 10/127 axis jumps. The airborne integrator (L10137) never tests a ceiling.
- **N4** an airborne landing snaps UP onto a floor within STEP_UP in one tick (L10146-10159).
- **N5** `resetEndlessMode` does not reset `jumpAirborne`/`jumpVelZ`, `fortressAllies`, or `completedFortresses`.
- **N6** the Cave Test spawn teleport skips `updateChunks`, so the first tick re-centres and D19 wipes all 25 cave enemies' underground flags.
- **N7** surface enemies (z:0) on ground above h 1.6 are hidden by the below-floor cull (L508).
- **N8** terminal chambers in a chunk's outer cell ring get no chest (L5966). A cave chest inside the entrance reserve is silently dropped (L7180).
- **N9** `spawnGoal` throws when int32(Date.now()^0xBEEF) < 0 (L4085/L4104), about half of all clock values, and is never retried.
- **N10** the Settings Day/Night toggle's hit area covers the upper 55% of the Apply button.
- **N11** the first frame toggles CONTROL_MODE to gyro-aim for keyboard players: `gpLast.buttons` 0 is active-low and reads as SELECT held (L998, L19000-19010).
- **N13** capped cave walls show through from the cap on seed 1 (the L12052 unit mismatch).
- **N14** two entrance trees of one network get independent depths, giving cliffs. The feather slope exceeds STEP_UP. STEP_DOWN is relaxed within 260 u, but the approach is 480 u.
- **N15** inside the tunnel, sky still shows overhead even with both D5 causes removed (browser pixels: 30.4% sky).
- **N16** more tool defects:
  - `caveCapture` reports the buried ceiling as overhead while you stand on the cap;
  - the profile chart and control map follow l0;
  - `ceilSkipLowCeil` counts every non-ceiling layer;
  - `caveGaps`/`wallFaceBase` sample one cell past the W/N face vertex.
- **N17** `[STATE]` console.warn spam appears beyond 1500 u or after any render error (L21953).
- **Also found:** the first `loop()` frame at page load toggles gyro mode (N11), and Chrome's canvas output changes after the second `getImageData` readback (the driver warms up 4 readbacks before measuring).

### 3.12 Corrections to the original audit report (the lab was right, the report was not)
- **E2 and E3:** not reproduced (see 3.6).
- **D12:** micro-falls happen on many downhill edges, not "every" edge.
- **D13:** the free-fall is seed-specific.
- **D15:** the lasting damage is wallFaceBase; there are no stale reads after `assembleWindow` returns.
- **D24:** the Endless goal spawn works only when the clock's int32 is non-negative; otherwise `spawnGoal` throws (N9).
- **D23:** the enemy counts are seed-dependent (e.g. 36 -> 60 on seed 424242).
- **D25:** the Level 4 overflow is up to 6,596, not 6,546.
- **Cave rarity:** 2.08-3.68% of regions within 12 regions of spawn (the original said 1.1-2.1% over 20).
- **F3:** Brute embedding is seed-dependent (2.3-8.6%).
- **D4:** the 3-8 cave-floor quads drawn from the ramp/arch all belong to the open pit.

---

## 4. The test lab: inventory, final results, and rerun instructions

### 4.1 Running it (read section 6 first)
```
python3 -m tools.webui.game_lab --list
HW1_GAME_JOBS=1 python3 -m tools.webui.game_lab caves_geometry -v          # one suite, readable
HW1_GAME_JOBS=1 python3 -m unittest tools.webui.tests.test_game_physics -v  # one suite via unittest
HW1_GAME_JOBS=1 HW1_GAME_PROBES=1 python3 -m unittest tools.webui.tests.test_game_physics   # + its probes
python3 -m tools.webui.game_lab physics --seeds 12345,1 --endless-seeds 424242,777000     # seed sweep
python3 -m tools.webui.game_page --out /tmp/gamepage --autorun   # browser half; serve it over http, open in Chrome
HW1_GAME_BROWSER_RESULTS=/path/results.txt python3 -m unittest tools.webui.tests.test_game_browser
```
A JavaScript engine is required: node, deno, bun, qjs, macOS jsc or osascript.
`js_engine.py` picks one; without any, the tests skip. The browser half needs a real
browser. Chromium's pane refused `file://`, so the page was served with
`python3 -m http.server`.

### 4.2 Phase-1 results (before revision)

| Suite | Checks | Known-bug FAILs | Probes | Engines agree | Deterministic |
|---|---|---|---|---|---|
| caves_geometry | 16 | 9 | 10 | yes | yes |
| caves_transition | 23 | 15 | 11 | yes | yes |
| physics | 11 | 8 | 8 | yes | yes |
| render | 17 | 11 | 10 | yes | yes |
| enemies | 11 | 8 | 8 | yes | yes |
| persistence | 24 | 17 | 17 | yes | yes |
| loot | 15 | 6 | 13 | yes | yes |
| perf | 12 | 8 | 10 | yes | yes |
| tools | 22 | 18 | 16 | yes | yes |
| browser (headless half) | 22 | 0 (+5 in BROWSER_KNOWN_BUGS) | 10 (+8 browser probes) | yes | yes |
| smoke | 13 | 0 | - | yes | yes |

- 186 checks in total.
- The whole unittest set ran in 30 s wall on the worker pool (101 s serial).
- 105/105 probes were independently confirmed.
- Pre-revision baseline verdicts: `evidence/lab_runs/phase1_author_reports.json`
  (every check with status, rationale, audit ref, and measured detail).

### 4.3 Phase-2 adversarial review (full JSON: evidence/lab_runs/phase2_reviews_and_critic.json)

**Verdicts over 173 checks.**

| Verdict | Count |
|---|---|
| SOUND | 118 |
| VACUOUS | 19 |
| WRONG_TARGET | 9 |
| OVERFIT | 9 |
| FRAGILE | 9 |
| REPLICATES_LOGIC | 7 |
| SCAFFOLD_DISTORTS | 1 |
| UNPROVEN | 1 |

The worst suites were tools (7 vacuous) and perf (3 vacuous, 2 wrong target).
Each review carries per-check evidence, new probes (with exact anchors, flagged
whether observed to flip), missing checks, harness bugs, and seed-sweep flips.

**Critic coverage over the finding ids:**

| Coverage | Count |
|---|---|
| FULL | 47 |
| PARTIAL | 20 |
| NONE | 12 |
| NOT_TESTABLE_HEADLESS | 1 |

The critic also found 12 cross-suite duplicates and proposed 23 concrete new checks
(render 4, enemies 2, persistence 4, perf 7, caves_geometry 2, caves_transition 2,
physics 1, tools 1).

**Critic structural issues (the important ones):**
1. KNOWN_BUGS asserted only "still fails", not "fails for the documented reason".
   FIXED before phase 3 with the tuple + regex and the PRECONDITION rule.
2. FIX probes were validated only in their own suite. The physics D11 FIX breaks
   caves_transition's "walk-in: never sinks more than a step height". Hence
   `game_probe_matrix.py`.
3. caves_transition's D3 FIX turns the ambient check green only because D2 masks
   D9. D2 plus D3 fixed reveals D9.
4. physics C2 (stale floor reads) originally used `l0TopZ` as its oracle, so a
   D6 fix broke it. The final check compares against a second read after bumping
   `_floorCacheTick`.
5. caves_transition originally detected re-centres by floorMesh object identity.
   The final check uses `windowOriginX/Y` instead.
6. `LAB.frame()` missed `_pt`-caught exceptions. FIXED before phase 3.
7. The env originally hid page-level defects on every start by cancelling the
   auto-overview timer and skipping the page-load pad state. The final perf suite
   covers that first frame. Element stubs still discard `addEventListener`, so
   real button/key DOM handlers remain browser/device coverage; LAB starters are
   replicas of those handlers.
8. The helpers added after authoring were initially unused while suites drifted
   private copies. The final harnesses adopted the shared helpers.
9. Every walk originally ran at an idealised 60 Hz. This was fixed in the env
   with `walkTo({fps})` and adopted by the final suites that need rate coverage.
10. The seed flags were inconsistent. The final convention was adopted by all
    suites: `--seeds` for Cave Test and `--endless-seeds` for normal Endless.
11. persistence's "no storage" check originally encoded H1 (no saves) as
    DESIRED. The final revision converted it to a product-scope NOTE/METRIC.
12. What a green run would NOT mean:
    - a green headless game-lab unittest does not validate pixels; the opt-in
      `BrowserResultsGrading` unittest only grades results saved by a real browser;
    - ESP32 transport, real gamepad/IMU, mouse/touch and 2D mode are untested;
    - there is no frame-time budget (all `*_ms` values are metrics);
    - normal Endless covers only the nearest cave network per seed;
    - Cave Test forces plains;
    - fixed levels other than 1 and 4 are untested;
    - sessions are under ~40 s of virtual play.
13. The enemies chase guard originally skipped `step()`, so the player push (N2)
    never applied. The final guard runs `step()` and covers the real interaction.

### 4.4 Duplicate ownership map (decided and applied in the final revisions)
- **persistence** owns:
  - enemy flags across a window shift (D19); **enemies** removes its underground-flag check.
  - chest swap quality/item and collected-after-eviction (H3); **loot** removes its three copies.
- **perf** owns frame-rate dependence (N1/G7); **physics** removes its 20 fps distance check.
- **render** owns fixed-level 3D rendering (D24); **perf** keeps only the Level 4 buffer check.
- **physics** owns:
  - slope micro-falls (D12); caves_transition keeps its ramp-airborne check, citing D1 + D12.
  - the picker sentinel (D11); caves_transition keeps its lateral check, citing D11 + D14.
- **caves_geometry** owns:
  - roof-start distance (D2); **render** removes "archway stands where the roof begins", and keeps "archway drawn to a player on the ramp", citing D2.
  - D6; tools keeps its control-map observable, citing D6.
- **caves_transition** owns the underground flip count (D3); render's archway-floor check cites D3/D4.
- **render** owns the headless in-tunnel D4/D5 verdicts; **browser** keeps its pixel confirmations as the opt-in half.

### 4.5 Changes made to shared code before and during phase 3
- `LAB.frame()` / `frameAt(ms)` return ALL new render errors (loop + `_pt`).
- `LAB.seeds(defaults, name)`: `--seeds` for Cave Test, `--endless-seeds` for normal Endless.
- `LAB.walkTo(..., {fps})` drives the real `loop()` at a render rate.
- Additive helpers: `freshPage`, `releasePad`, `renderErrorMark`/`renderErrorsSince`,
  `setClock`, `countCalls`, `fx`, `cellWorld`/`cellCorner`, `standingLayer`,
  `logCount`/`errorCount`, `record(fn, {keepOnThrow, fillRects, strokes, texts})`,
  ctx `arcTo`/`roundRect`/`fillText` counting. Optional recorders remain opt-in;
  `fillRects` adds rectangle style/geometry without changing existing consumers.
- `game_lab`:
  - KNOWN_BUGS tuple + regex and the PRECONDITION test;
  - multi-site probes (`apply_probe`);
  - thread-safe content-hashed extraction;
  - a shared worker pool (`submit`, `prefetch_default_suites`), which is the cause of the overload (section 6).
- 2026-09-19 follow-up on the new machine:
  - whole-suite prefetch is now opt-in with `HW1_GAME_PREFETCH=1`;
  - the default worker count is `max(1, CPUs // 4)` (explicit
    `HW1_GAME_JOBS=1` remains the rule for this audit);
  - before/after snapshots have identical check lists and non-timing metrics in
    all 11 suites for the resource-default changes. The later additive
    `fillRects` recorder was covered by the final repeated frozen-tree snapshot
    and aggregate gates in 4.8; no isolated pre-`fillRects` artifact was kept.

### 4.6 Final state of each suite
The interrupted revisers' own notes, edits and last results are in
`evidence/interrupted_revisers/progress_<suite>.md`.

| Suite | Final evidence/status | Resolution and evidence |
|---|---|---|
| caves_geometry | FINAL COMPLETE: 19 checks (13 documented FAILs), 21/21 probes; base unittest OK (12.467 s) and final probe unittest OK (246.498 s). Two clean jsc runs were deterministic (12.12/12.11 s; all 19 verdicts and 139 non-timing metrics identical), with exact 19-line agreement on JXA (165.0 s). | Review items resolved: the entrance chain follows the actual carried layer and requires open sky at the endpoint; ct777's roof ride is exposed rather than silently carried on from the zero sentinel; the step-feather, lowest-walkable/GFH, floor-relative headroom, D17 water-wall, E4 raised-cap cliff, surface-seam, and policy-independent full-cell truncation checks/probes are present; shared coordinate helpers and the zero-entrance guard are used. The load-error detail was flattened so the BREAK probe remains parseable. The final `--seeds 12345,1,777,424242 --endless-seeds 424242,999983,123` sweep retained 6/19 PASS in 12.132 s versus the 12.170 s comparison default, with zero verdict flips or PRECONDITION failures. The final frozen-tree 13-FIX x 9-suite matrix completed all 117 cells in 1,011 s with 6 collateral PASS->FAIL flips: widening the cap hole breaks two browser scene checks; opening the approach roof breaks the loot cave-chest offer in two probes; and the combined interior-depth fix breaks one caves_transition reach check and one render buried-floor/ceiling check. Nineteen collateral FAIL->PASS flips cover related transition, render, and tools observables. |
| caves_transition | FINAL COMPLETE: 33 checks (24 documented FAILs), 21/21 probes; base unittest OK (5.7 s) and final probe unittest OK (120.2 s). Two clean jsc runs were deterministic (5.79/5.76 s; all 33 check records and 153 non-timing metrics identical), with exact 33-line agreement on JXA (67.2 s). The final `--seeds 12345,1,777,424242` sweep produced 12/33 PASS in 6.500 s versus the default 9/33 in 5.668 s, with no PRECONDITION failures; the cap-walk, jump-landing, and walk-in-sink checks changed FAIL->PASS only because this sweep replaces the default ct31337/ct98765 defect seeds. | Review items resolved: origin-based re-centre detection with copied pre-shift stacks; settled walk endpoints; actual-walk exclusion of overlapping-corridor confounds with per-world coverage; `--endless-seeds`; ct31337/ct98765 seed coverage; raised-impulse solid-ceiling and natural-landing checks; N5 restart, mouth lateral, cap walk, 30 fps real-loop, network, G3 dither, open-ground D9 lighting, and sun/fog transition checks; single-line load diagnostics; mechanism regexes for every known failure. Rejected the review's D1/N4, D2, D1+D2, and D1+D14 FIX prescriptions: the expanded seeds left their advertised verdicts failing (ct31337/ct98765), and the containment version also exceeded the 60 s/run budget; they are not in the accepted FIX set. The final frozen-tree 10-FIX x 9-suite matrix completed all 90 cells in 804 s with 3 collateral PASS->FAIL flips: the D12 edge-fall guard breaks physics' real-drop check; capping the mouth breaks loot's entrance-to-chest walk and a tools underground-wireframe comparison. Five beneficial flips cover gentle slopes, render's arch floor, restart state, and perf's chunk-line jitter. |
| physics | FINAL COMPLETE: 16 checks (12 documented FAILs), 15/15 probes; base unittest OK (12.189 s), probe unittest OK (48.826 s); deterministic on two jsc runs (12.7/12.5 s), exact 16-line agreement with JXA (172.8 s). The final `--seeds 12345,1 --endless-seeds 424242,777,31337` sweep retained 4/16 PASS in 20.784 s versus the 13.267 s comparison default, with zero verdict flips or PRECONDITION failures. | Review items resolved: approach-based D11 precondition, cold-cache C2 oracle, targeted wall probe, guarded enemy/death trials, real-drop/N4/N5 checks, shared helpers, perf duplicate removed. The final frozen-tree 10-FIX x 9-suite matrix completed all 90 cells in 788 s with 3 collateral PASS->FAIL flips, all from the step-side D11 blocking probe: caves_transition's cave-floor reach check and render's cave-walk error plus canvas-balance checks. Twelve collateral FAIL->PASS flips cover related lateral, ramp, spawn, GFH, restart, and persistence observables. The fifteenth sweep-specific probe is byte-identical to physics probe 11, so the ten unique FIX mutations cover it. |
| render | FINAL COMPLETE: 24 checks (18 documented FAILs), 26/26 probes (16 FIX, 7 BREAK, 3 diagnostic OTHER). Base unittest: 31 tests, 26 skipped, OK in 19.287 s; final probe unittest: 31 tests, all 26 probes OK in 425.082 s. Two fresh jsc runs were deterministic (16.747/18.770 s; exact check ids, statuses, details, and all 141 non-timing metrics); JXA had identical 24 check ids and PASS/FAIL statuses (222.886 s). The defaults already cover Cave Test seeds 12345/424242 and normal-Endless defaults; the supplemental final `--seeds 1,777,31337` sweep ran in 12.646 s with no verdict flips or PRECONDITION failures. | Review/critic items resolved: inward, outward, ramp and arch render views; causal D4/D5 and D8 isolation; real-pass low/high enemy, chest, ore, goal and shop visibility; F5 walk-cycle ownership; fixed-level throw/fill/save balance; real-loop error/canvas balance; parseable load diagnostics; and duplicate ownership. The proposed `>=50` surface-below-horizon outward threshold was rejected empirically: the prescribed deep cameras had 796 and 400 open-approach cells in cone but zero quads wholly below the horizon, so final outward pixels remain browser-owned. E8 was rejected as one mixed-mechanism verdict; N15 remains browser-owned and F6 physics/enemies-owned. The final frozen-tree 16-FIX x 9-suite matrix completed all 144 cells in 1,160 s with 7 collateral PASS->FAIL regressions and 12 collateral FAIL->PASS flips, all grouped around entrance roof/cap state, transition/loot reachability, tools accounting, and enemy floor tracking. |
| enemies | FINAL COMPLETE: 18 checks (13 documented FAILs), 18/18 probes (12 FIX, 6 BREAK). Base unittest: 23 tests, 18 skipped, OK in 15.012 s; final probe unittest: all 18 probes OK in 275.998 s. Two fresh jsc runs were deterministic (15.243/17.635 s; exact check ids, statuses, details, and all 79 non-timing metrics); JXA had identical 18 check ids and PASS/FAIL statuses (182.471 s). | Review/critic items resolved: chase now runs `step()` so N2 push applies; F2 recovery requires >=40 u over >=30 trials with a >=95% threshold; F1 patrol separation and the F1/F2 composite are causal; N6 covers first-tick re-centre plus state retention; F7 exercises layer/roof/lateral cases; and the persistence-owned D19 duplicate was removed. The phase-2-equivalent `--seeds 31337,2024,98765 --endless-seeds 31337,2024,98765` sweep (27.565 s) and critic-expanded `--seeds 12345,1,777,424242 --endless-seeds 424242,777000,1,777` sweep (36.808 s) had no PRECONDITION failures, but both flipped only `no enemy spawns on a wall cell` FAIL->PASS because overriding `--endless-seeds` removes the default generation-only seed 55555. A targeted `--endless-seeds 55555` run (8.210 s) reproduced the documented defect (1/203 enemies, `surface.wolf@1638,-1218`, 24 u from a hall ruin). The final frozen-tree 12-FIX x 9-suite matrix completed all 108 cells in 903 s with no collateral PASS->FAIL regressions; preserving an enemy's underground flag beneficially fixes persistence's window-shift check. |
| persistence | FINAL COMPLETE: 31 checks (23 documented FAILs), 36/36 probes (24 FIX, 12 BREAK). Base unittest: 41 tests, 36 skipped, OK in 9.99 s; final probe unittest: all 36 probes OK in 369.25 s. Two fresh jsc runs were deterministic (9.784/9.977 s; exact check ids, statuses, details, and all 14 non-timing metrics); JXA had identical 31 check ids and PASS/FAIL statuses (152.840 s). | Review/critic items resolved: H1 became a product-scope NOTE/metric rather than desired no-storage behavior; D19 provenance flags, D20 rebasing, H2/H3/H4/H6/H7, N12, restart/reset state, settings Apply ownership, N5 airborne carry-over, N10 hit area, D24 calibration ownership, and H8's 42-chunk bound all have causal coverage. The split-semantics `--seeds 31337,2024,99 --endless-seeds 31337,2024,99` sweep (33.420 s) had no verdict flips, but 2024 and 99 fail the mid-jump precondition and are explicitly unsuitable for N5. Individual runs with both seed flags set to 31337 (15.377 s) and 1 (9.028 s) retained the 8 PASS/23 FAIL verdict set with no precondition failures. A seed-7 run (9.796 s) legitimately made the same-seed restart and guaranteed market/shrine eviction checks pass because nothing was injected/lost in that world, so it is not a stable aggregate replacement. Normal-Endless calibration and a headless user-seed UI check were rejected as unreachable scaffolds. The final frozen-tree 24-FIX x 9-suite matrix completed all 216 cells in 1,755 s with one collateral PASS->FAIL regression (the five-chunk initial window changes loot's surface-chest tier-gold comparison) and four beneficial flips covering enemy generation/state and fresh-world jump state. |
| loot | FINAL COMPLETE: 18 checks (5 documented FAILs), 25/25 probes (9 FIX, 15 BREAK, 1 diagnostic OTHER). Base unittest: 30 tests, 25 skipped, OK in 16.98 s; final probe unittest: all 25 probes OK in 413.11 s. Two fresh jsc runs were deterministic (22.585/17.944 s; exact check ids, statuses, details, and all 24 non-timing metrics); JXA had identical 18 check ids and PASS/FAIL statuses (258.058 s). The prescribed `--seeds 31337,90210,555` and `--seeds 2024,8` sweeps ran in 16.266/12.956 s with no verdict flips or PRECONDITION failures. | Review/critic items resolved: exact terminal-chamber ownership and edge/reserve causes; real prompt capture and Take/Swap behavior; constrained interaction sampling away from entrance reserves; recentering and reward checks; and removal of the three persistence-owned H3 duplicates. Two new game defects are pinned: a surface-cap player can loot an invisible cave-floor chest because interaction has no Z/layer gate (19426-19447), and a same-id/different-quality chest prompt says Take while collection swaps and may downgrade the item (9395-9415 vs 20195-20211). The final frozen-tree 9-FIX x 9-suite matrix completed all 81 cells in 673 s with no errors, missing cells, collateral regressions, or beneficial flips. |
| perf | FINAL COMPLETE: 20 checks (16 documented FAILs), 28/28 probes (15 FIX, 7 BREAK, 6 diagnostic/guard OTHER). Base unittest: 33 tests, 28 skipped, OK in 35.296 s; final probe unittest: all 28 probes OK in 889.417 s. Two fresh jsc runs were deterministic (36.159/37.664 s; exact check ids, statuses, details, and all 75 non-timing metrics); JXA had identical 20 check ids and PASS/FAIL statuses (272.205 s). The final `--endless-seeds 2,31337,99991` sweep ran in 77.998 s with no verdict flips or PRECONDITION failures. | Review/critic items resolved: N11 first-frame controller state; E6 one in-flight poll; overview fill cost; G1 per-quad parsing/allocation; G2 render-time biome/noise work; re-centre logging; user-facing HUD FPS; frame-rate-dependent input; cache/window/buffer/fullscreen checks; and removal of the render-owned fixed-level throw duplicate. Headless call/fill counts prove work structure, not device/GPU frame time; gzip/cache and hardware latency remain ESP32/browser measurements. The final frozen-tree 15-FIX x 9-suite matrix completed all 135 cells in 956 s with no errors, missing cells, collateral regressions, or beneficial flips. |
| tools | FINAL COMPLETE: 25 checks (19 documented FAILs), 29/29 probes (17 FIX, 12 BREAK); base unittest OK (5.717 s) and final probe unittest OK (163.236 s). Fresh jsc runs were deterministic (5.520/5.458 s; exact check ids, verdicts, details, and all 13 non-timing metrics), with exact 25-verdict JXA parity (~63.5 s). The primary `--seeds 7,31337,55555` sweep had zero flips or precondition failures. | Review/critic items resolved: standing-layer-aware `caveCapture`/`caveDiag`; profile height/ceiling oracles; seed/position/height/yaw and transition-state capture; outside-blend, histogram and empty-ceiling accounting; control-map, `debugCaveAt` and both cave-gap mechanisms; real two-scene checkbox observability (including underground ceiling wire); tuple-regex known failures and load BREAK; and I4's real asynchronous `window.caveTest` path on jsc with an explicit NOTE-only JXA timer/microtask limitation. Targeted seed-drop BREAKs now fail for seeds 100, 12 and 1; seed 275 alone cannot reach the cave floor or nearby wall faces and was rejected as unsuitable coverage. The final frozen-tree 17-FIX x 9-suite matrix completed all 153 cells in 1,274 s with no errors, missing cells, collateral regressions, or beneficial flips. |
| browser | FINAL COMPLETE: the headless harness has 11 checks and 5/5 BREAK probes (zero FIX probes). Base unittest: 18 tests, 9 skipped, OK in 4.998 s; probe unittest: all 5 probes OK in 28.103 s. Two fresh jsc runs were deterministic (4.533/4.823 s; exact check records and all 5 non-timing metrics); JXA had identical check ids and PASS/FAIL statuses (51.587 s). The `--seeds 1,424242,31337,99` sweep ran in 7.171 s with no verdict flips or PRECONDITION failures. The unmutated real-Chrome result (`HARNESS_RESULT FAIL 7`, all seven failures documented) passed all four strict provenance/grading tests, with identical-pixel redraws in all 14 seed/view scenes. All 13 current real-browser mutation pages were then run, and every targeted check matched its declared PASS/FAIL status. | Chrome can switch Canvas2D raster/readback paths after the exact page `renderFrame()`; the driver now warms each placed view rather than only the first view, while the three-frame equality check still catches continuing nondeterminism. Durable raw results are `evidence/lab_runs/final_browser_default.txt` and `final_browser_probes.txt`. A source matrix is N/A because the headless registry has zero FIX probes; browser remains an `--against` target for every other suite's frozen-tree matrix. |
| smoke | FINAL COMPLETE: 13/13 checks PASS in 0.7 s; no probe registry. It appears identically in both frozen snapshots. | The final serial `test_game*.py` discovery passed 299 tests in 149.090 s (228 expected skips), and full `tools/webui` discovery passed 337 tests in 143.389 s (228 expected skips). |

### 4.7 Workflow used and future maintenance order
1. Keep the resource-safe defaults in section 6 enabled.
2. For each suite, ONE AT A TIME: run it, read the progress digest and the review,
   finish the revision, then `unittest` + `HW1_GAME_PROBES=1 unittest`, both engines
   if available, twice for determinism.
3. `game_probe_matrix.py --probes <suite>` for each suite's FIX probes, with
   `HW1_GAME_JOBS=1` or `2`.
4. Keep the game-lab section now present in `tools/webui/README.md` aligned with
   the final runner, browser and resource-safety behavior.
5. Only then start fixing the game, in the order of section 5, using the
   matrix to catch cross-suite regressions.

### 4.8 Final integration gate (completed 2026-09-20)

Record each command and key output in section 4.6 or the final report; `/private/tmp`
and `/tmp` alone are not durable evidence.

- [x] Every suite row in 4.6 records its final check/documented-FAIL/probe counts,
  base and probe runtimes, prescribed seed sweep and dispositions, review
  dispositions, determinism, engine parity, and matrix status.
- [x] Every suite's base unittest, and every probe-bearing suite's opt-in probe
  unittest, pass with `HW1_GAME_JOBS=1`, one suite at a time.
- [x] Every default harness has two fresh, uncached `jsc` runs under 60 seconds;
  the complete check `(id, status, detail)` records and every non-`*_ms` metric
  are identical.
- [x] JXA and `jsc` have identical check ids and PASS/FAIL status for every suite.
  Engine-specific NOTE text may differ and is recorded. JXA parity runs are not
  subject to the 60-second `jsc` suite budget, but their runtimes are recorded.
- [x] Every prescribed seed sweep is rerun against the final harness. Any verdict
  flip, PRECONDITION, rejected seed, or seed-limited coverage is explained.
- [x] After all suite files and shared helpers stop changing, every suite's FIX
  probes are rerun through a serial, filtered matrix against every other
  non-smoke suite. Every PASS->FAIL collateral flip and beneficial flip is
  recorded. Earlier matrices are supporting evidence, not the final gate.
- [x] Two final frozen-tree all-suite snapshots have identical complete check
  records and non-timing metrics. This covers the final shared `_game_env.js`,
  including the additive `fillRects` recorder; the earlier resource-default
  change retains its separate before/after evidence in 4.5.
- [x] The serial `test_game*.py` discovery run passes.
- [x] The full `tools/webui` discovery run, including the pre-existing web-UI
  tests, passes.
- [x] The browser headless base/probe gates pass. The real-browser default visual
  result is graded with valid provenance, or the final report explicitly says
  that the pixel half was not run.
- [x] Every current `BROWSER_PROBES` mutation page is run in a real browser and
  every targeted check matches its declared PASS/FAIL status, or the final
  report explicitly lists that gate as unrun.
- [x] `tools/webui/README.md` matches the final commands and states the limits
  of a green headless game-lab run.
- [x] A final working-tree audit confirms the game H/CPP files are untouched;
  the handoff/lab evidence and visual-pipeline note remain untracked and are not
  staged, committed, or pushed.
- [x] The final report lists all rejected review prescriptions, new findings,
  corrected audit claims, incomplete work, and cross-suite collateral flips.

The two final snapshot JSON files and their exact comparison are in
`evidence/lab_runs/final_snapshot_{a,b}.json` and
`final_snapshot_validation.txt`. The matrix structural audit is in
`final_matrix_validation.txt`. Final smoke was 13/13 PASS; serial game discovery
was 299 tests, OK (228 expected skips); full web-UI discovery was 337 tests, OK
(228 expected skips); and the real-browser grader was 4/4, OK. The frozen
`tools/webui` plus `WebPage_Games.h` fingerprint remained
`9ffbcf95a62ab0217fce616b2004725b38f5fe663602e669293549c1a8a11a6e`.
Incomplete audit/lab work: none. Game fixes were intentionally not applied;
real-device/product validation remains out of scope.

---

## 5. Recommended order for fixing the GAME (after the lab is solid)
1. **Surface-to-cave geometry and visibility.**
   - Make the evidence trustworthy first: tools that read l0 lie (D6, I*).
   - Then define a real MOUTH in the data: where the roof starts relative to the
     arch, one trench depth equal to the corridor depth, cap hole = mouth region.
   - Then the camera-blind culls (D4/D5) and the binary underground flag
     (D3/D9/D10). Expect the arch, lighting and entity culls (D7/N7) to follow.
2. **Falling and collision.** D11 (fabricated h=0) and D12 (edge threshold) are
   self-contained. Then D14 (no cave sides), N3/N4 (jump through ceiling, landing
   snap). Re-scan after step 1, because the trench geometry changes.
3. **Enemies.** Patrol waypoints (F1), patrol slide (F2), Brute radius / ruin order
   (F3), separation (F4), then N2 (hit reach vs push-out). The ring asymmetry (F6)
   and roof LOS (F7) belong with step 1. Pathfinding last, if ever.
4. **Performance.** Re-measure after step 1 (the overhead undersides may vanish).
   Then the per-quad allocations (G1), render-time noise (G2), window default +
   hysteresis (D23/G3), log spam (G3/N17), fullscreen resolution (G4), frame-rate
   independence (N1). ESP32: gzip + caching for the page (G8).
5. **Persistence.** A seed input (H5) and a truthful capture/loader (I3) belong
   with step 1's tooling. Then decide what to save (H1-H8).
6. **Legacy.** Removing fixed levels is safe for Endless generation, but needs edits
   at `startGame`, `onCalibUpdate` (L9854), the goal block (L10356-10369), the
   goal spawn (L11495), and L12094/L12110. The fixed-level 3D floor is broken
   anyway (D24). Handle the `< -0.1` heuristic under steps 1 and 2, not here.

---

## 6. Why the original machine was overloaded, and safe settings

**Cause (my design error).** Parallelism multiplied three levels deep, with no
machine-wide cap:
1. The revision workflow ran 8 agents at once.
2. Each agent ran its suite through `game_lab`, whose worker pool defaults to
   `min(8, CPUs-2)` JavaScript-engine processes, per agent.
3. In the original implementation, `suite_testcase.setUpClass` called
   `prefetch_default_suites()`, which started ALL 11 suites whenever ANY suite
   was tested. With `HW1_GAME_PROBES=1`, every probe of the suite was also
   submitted at once. Two agents also ran `game_probe_matrix.py` (probes x
   suites).

Each process is CPU-bound, and each builds a 280x280 multi-layer world (tens to
hundreds of MB), on a 10-core laptop. The agents themselves measured a load
average of about 52 and runs going about 24x slower than normal.

**Rules for the new machine:**
- Set `HW1_GAME_JOBS=1` (or 2) in every shell that runs the lab.
- Completed 2026-09-19: `prefetch_default_suites()` is opt-in only when
  `HW1_GAME_PREFETCH=1`, and the default worker count is
  `max(1, CPUs // 4)`. The before/after `snap_verdicts.py` artifacts have
  identical check lists and non-timing metrics for all 11 suites.
- Never run several agents or processes on the lab concurrently unless the total
  (agents x jobs) stays at or below about half the cores.
- Never run `game_probe_matrix.py` unfiltered: always `--probes <suite>`, and
  preferably `--against <suites>`.
- Typical single-suite cost when not overloaded: 5-25 s per run. Probes: 1 run
  each, 8-17 per suite.

---

## 7. Reproduction recipes in the real page (browser DevTools console)

If the page is served by the device, run `__restoreConsole()` first: the page shell
turns `console.log/warn/debug` into no-ops unless the web-console debug setting is
on (`WebServer_Utils.cpp:719`). `console.error` is never suppressed.

**Probe.** Paste once to log position, layers and state every 250 ms:
```js
window.__probe=setInterval(function(){var m=floorMesh,i=Math.floor(pos.y/12)*m.w+Math.floor(pos.x/12),L=[];for(var k=0;k<m.layerCount[i];k++)L.push(m['l'+k+'Type'][i]+'@'+m['l'+k+'TopZ'][i].toFixed(2));var h=(pos.floorZ-60)/40,w=getWalkableLayerTopAt(pos.x,pos.y,h);console.log((pos.x+windowOriginX)|0,(pos.y+windowOriginY)|0,'h',h.toFixed(2),'pick',w.action,w.idx,w.topH.toFixed(2),'UG',playerUnderground,'air',jumpAirborne,'amb',ambientLight.toFixed(2),'['+L.join(' ')+']')},250);
```

1. **D11 sink.** Start Cave Test (default seed 12345), then run:
   ```js
   pos.x=246-windowOriginX;pos.y=760-windowOriginY;pos.floorZ=400;cam.ang=-Math.PI/2;cam.pitch=0;
   ```
   Hold W. Expect `pick fall -1 0.00` near world y=720, and h=0.00 under a `1@2.91..3.62` stack.
2. **Entrance walk.** Cave Test, then run:
   ```js
   var E=endlessCaveNetworks['0,0'].entrances[0],A=470;pos.x=E.x-Math.cos(E.angle)*A-windowOriginX;pos.y=E.y-Math.sin(E.angle)*A-windowOriginY;pos.floorZ=400;cam.ang=E.angle;cam.pitch=0;
   ```
   Hold W. Expect UG to flip at about +224/+22/-28, ambient 0.90->0.45->0.81->0.45, and a -1.64 step near +222. Repeat with `window._caveTestSeedOverride=424242` (and 777), set BEFORE choosing Cave Test.
3. **Which pass draws what.** At along -150, tick "Poly types". Expect blue and green overhead and no purple. Compare `__caveStats.ceilCollected` with `ceilRendered`; "Hide ceil" changes nothing.
4. **Spawn.** Start Cave Test with the probe running. Expect `air true` and h 0 -> -6.65 on seed 12345.
5. **Flag freeze.** Settings -> Day/Night off -> Apply (careful: N10, Apply's upper half hits Day/Night). Walk in and out: UG never changes.
6. **Hidden entities.** Normal Endless:
   ```js
   enemies.filter(function(e){return getFloorHeightAt(e.x,e.y)<-0.1}).length+'/'+enemies.length
   ```
7. **Enemy freezes.** After 30 s, run:
   ```js
   enemies.map(function(e){return{t:e.enemyType.id,wp:e.patrolWaypoints.map(function(w){return Math.hypot(w.x-e.x,w.y-e.y)|0}),emb:isInGridWall(e.x,e.y,8*(e.enemyType.size||1)*.6),los:hasLineOfSight(e.x,e.y,pos.x,pos.y)}})
   ```
   Both wp under 14 = ping-pong. `emb` true = embedded. `los` false with no visible wall = the F6 ring.
8. **Performance.** Perf HUD `platforms3D` on the surface vs inside the cave. `[ENDLESS] Window assembled OK in … ms` per shift. Jitter across a world x that is a multiple of 480 (no hysteresis). Check `WINDOW_CHUNKS` before and after Apply.
9. **Persistence.** Kill an enemy, swap a chest item, walk more than 4,320 u away and come back. The enemy is back and the chest reverts.
10. **Force a normal-mode seed.** Before clicking Endless:
    ```js
    var S=123456,r=Math.random;Math.random=function(){return (S-0.5)/999999};
    ```
    Then click Endless and restore with `Math.random=r`. `WORLD_SEED===S`.
11. **Cave rarity.** In normal Endless:
    ```js
    var n=0;for(var y=-20;y<=20;y++)for(var x=-20;x<=20;x++){var t=generateCaveNetwork(x,y);if(t){n++;if(t.entrances.length!==2)console.log('!')}}n
    ```

---

## 8. Gotchas learned the hard way
- **deno.** The bootstrap's `__out`/`slurp`/`__argv` are MODULE-scoped. Code
  loaded by indirect eval (the env, the game) cannot see them, hence
  `LAB.init(__out, slurp, __engine, __argv)`. On deno, `__out` IS `console.log`,
  which the env captures, so harness code must only use `LAB.check/metric/note`.
- **Harness top-level `var`s.** jsc makes them globals (and they can shadow game
  globals); deno does not. Wrap harness bodies in a function.
- **Timers.** Capture `setInterval`/`setTimeout`/`requestAnimationFrame`, or deno
  never exits. `applySettings` rebuilds the window in a rAF: `LAB.flushRaf()`.
- **Virtual clock.** It uses 1000/60 ms steps, which accumulate float drift, so
  compare with a tolerance. `spawnGoal` is seeded from `Date.now()` and throws on
  half the clock values (N9). Use absolute clocks (`LAB.setClock`) for such tests.
- **Coordinates.** `pos`/`cam`/entities/`deepCaveEntrances`/mesh indices are
  WINDOW-LOCAL. `endlessCaveNetworks` is WORLD. The window re-centres on chunk
  crossings and entity arrays are rebuilt as new objects, so keep world coords and
  re-find objects after a shift.
- **Units.** Mesh h; physics Z = 60+40h; render Z = 25h; eye = 2.4 h above the
  feet (cameraZ = 60 + 25*(cam.z-60)/40, L454).
- **Pad state.** `gpLast.buttons` 0 (page load) reads as EVERY button held
  (active-low): SELECT toggles the control mode, START toggles the menu once the
  pad is valid.
- **Leaks between worlds.** `resetEndlessMode` does not reset: spells,
  fortressAllies, completedFortresses, jumpAirborne/jumpVelZ, WINDOW_CHUNKS (after
  an Apply), `_ptErrors`, `_rgbCache`. Use `LAB.freshPage()`, except in checks that
  measure these leaks.
- **Floor cache.** Only `draw()` bumps `_floorCacheTick`; `LAB.tick`/`prepCamera`
  bump it too.
- **Engine float differences.** `-0.0` vs `0.0` in the last ulp of sin/cos splits
  PASS lines across engines, so use `LAB.fx`.
- **Chrome canvas.** Rendering switches GPU->CPU after about 2 `getImageData`
  calls; warm up before measuring pixels.
- **`game_lab.extracted_path` must stay thread-safe** (lock + content hash), or
  probes silently run other probes' code.
- **The scratchpad is not durable.** The original session's temp folder was wiped
  when the app quit; this folder is the durable copy.

---

## 9. Evidence index (this folder)
- `evidence/audit_index.md` -- the finding id list (U, D, E, F, G, H, I, N) used by reviewers and the critic.
- `evidence/audit_agents/*.md` -- the six sub-audit final reports (enemy movement,
  persistence and seed, rendering performance, chest rewards and legacy levels,
  debug tools, entrance constants inventory).
- `evidence/audit_scripts/` -- the original jsc scripts that produced the RUN numbers (README explains).
- `evidence/lab_runs/phase1_author_reports.json` -- every phase-1 check with status,
  rationale, measured detail, probes, env requests, new findings, concerns.
- `evidence/lab_runs/phase2_reviews_and_critic.json` -- per-check adversarial verdicts
  with evidence, new probes with exact anchors, missing checks, harness bugs; the
  critic's coverage map, user-problem mapping, duplicates, proposed checks,
  structural issues.
- `evidence/interrupted_revisers/progress_<suite>.md` -- what each phase-3 reviser
  had done when it was cut off (its notes, edits, commands, last results).
- `evidence/lab_runs/final_matrix_*.json` and `final_matrix_validation.txt` --
  all nine final filtered matrices and the 1,134-cell structural audit.
- `evidence/lab_runs/final_snapshot_{a,b}.json` and
  `final_snapshot_validation.txt` -- the repeated frozen-tree suite records and
  exact non-timing comparison.
- `evidence/lab_runs/final_browser_default.txt` and
  `final_browser_probes.txt` -- real-Chrome default and all 13 mutation-page
  results.
- `FINAL_REPORT.md` -- the prioritized A-D answer and final evidence summary;
  `CHECKPOINT.md` -- the short resumption/status record.
