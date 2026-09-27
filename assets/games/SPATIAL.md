# Shared 2.5D: implemented boundary

Both views use the same gameplay queries. This is an incremental migration, not
a new rigid-body engine. Shared spatial queries and upright-body motion now sit
under the existing arcade controllers. UI, authored art, acceleration constants,
jump tuning are retained. The later shared NPC migration (`AI.md`) separates
staggered decisions from 60 Hz locomotion. Input and gameplay clocks
now use fixed ticks, intentionally repairing display-rate-dependent movement.
Read `TESTING.md` before extending this boundary.

## Contract

- `06-spatial-geometry.js` owns camera-independent semantic strata, ceiling
  matching, NW–SE terrain diagonals, the existing 4.5-mesh-unit stitch clamp,
  support sampling, and cave wall-closure endpoint heights. Render adapters
  delegate to these helpers; a draw pass is never needed to answer a query.
- `06-spatial-queries.js` accepts **window-local X/Y, canonical world-distance
  Z**, where `z = meshH * 25`. Legacy player `floorZ = meshH * 40 + 60` stays
  behind conversion helpers. Camera height is not feet height.
- `spatialRaycast(from, to, optionalWorkCounters)` returns `clear`, `blocked`,
  `unloaded`, or `invalid`. A blocked result has normalized segment time `t`,
  hit point, kind, and a world-coordinate surface ID. Missing geometry is not
  automatically an unobstructed ray or floor zero.
- Fixed levels without a height mesh explicitly use their existing flat ground;
  missing Endless geometry does not. Entities bootstrap from actual terrain
  support rather than stale `entity.z = 0`, then carry canonical `feetZ` and a
  world-coordinate `supportId`. Cave identity is a bootstrap hint, not authority
  to ignore walls. Enemy window save/assembly preserves those fields.
- Rays test finite wall spans, exposed wall-to-ceiling closures, both terrain
  triangles, and rock between a ceiling and its nearest upper support. An open
  upper passage must not be swallowed by a lower ceiling's distant cap.
- Walls use their authored 240-unit height scale, not current canvas resolution
  or the incompatible legacy player `getWallTopZ` formula. Grid cells are closed
  solids: corner touches, final endpoint touches, and travel along wall faces
  are blocked. Queries visit both sides of exact grid boundaries.
- The floor and wall grids can have different cell sizes. Exact traversals
  inspect crossed cells, not the entire map or a distance-sampling approximation.
- There is no ray-result cache. Rebuilt windows, changed origins, and live
  geometry edits are visible immediately. Hit IDs include origin-adjusted world
  coordinates, so translating a window does not relabel an unchanged surface.
  IDs currently include the layer slot and are not persistent body IDs across
  arbitrary terrain topology edits.

## Migrated consumers

- Chest opening/targeting: existing horizontal 90-unit reach plus vertical reach
  and an unobstructed segment from player body to chest. Empty lists clear stale
  targets. `collectChest` validates again when invoked, before granting rewards,
  and rejects obsolete chest objects replaced during world-window assembly.
- Enemy → player chase visibility and melee: physical rays, including a fresh
  check of the actual player recipient when a remembered windup lands. A newly
  closer ally cannot authorize a through-roof strike on the player.
- Player, enemy patrol/chase/knockback/separation, companion following, and
  fortress-ally following/chasing use `06-spatial-motion.js`. Circular horizontal
  footprints plus body-height/headroom checks share finite wall spans. Separation
  cannot push actors on different storeys or embed them via a center-only test.
  Coincident enemy spawns separate without a zero-length normal.
- Actor travel uses bounded axis-separated substeps smaller than an authored
  cell, preserving sliding and preventing skipped wall cells. This is **not** an
  analytic swept-cylinder solver. Extraordinary travel is capped at 128 steps
  and reports remaining motion, rather than teleporting through unchecked space.
- Support retains the existing discrete cell-height/step policy. Smooth triangle
  sampling remains the render/geometry-query policy; continuous slope following
  is not claimed. The player's vertical jump/fall controller and ground-height
  smoothing remain behind the legacy-unit adapter. Enemies/allies/companions
  update canonical support as they move. Companion bounce is cosmetic.
  Footprint queries deduplicate only identical discrete mesh cells within that
  single call; every distinct sampled cell still receives a headroom/support
  check. Live edits and later calls never reuse that temporary result. This
  optimization must be revisited if continuous triangle support is introduced.
- Follower catch-up teleport remains intentional, but checks a bounded set of
  supported, clear placements on the player's storey before moving the follower.
- Main spell projectiles use `10-projectile-queries.js`: sphere sweeps over the
  travelled segment against terrain triangles, finite wall faces/edges, ceilings,
  and exposed closures. The first world/enemy/spawner contact wins. World geometry
  wins exact ties; non-coincident body ordering is independent of array order.
  Enemy target envelopes retain spell hit-radius tuning and conservatively
  expand an upright cylinder in XY/Z; they are not exact rounded cylinder edges.
- Moving-target queries use enemy pre/post positions for the current simulation
  tick. A wind-up released partway through a tick tests only target motion after
  release. Repeated projectile-only updates cannot consume the same motion twice.
  Lobs hit walls/ceilings as well as ground; homing uses canonical body heights.
  Both views launch at the same physical hand height (3D still accepts pitch).
- Casting Studio gives its practice target explicit support height and isolates
  projectile motion-tick state, so previewing a spell cannot consume live motion.

These gates apply equally in top-down and first-person modes. They intentionally
fix through-wall/roof interactions; this is not a promise of identical behavior
where the old rules were inconsistent. Patrol waypoint generation still uses its
existing XY LOS; local route planning now probes cloned spatial bodies and
actual movement remains height-aware. Bounded navigation and last-seen memory
are described in `AI.md`; route advice never bypasses these collision contracts.
Shared NPC melee, slime shots
and tower acquisition/aiming now use the spatial contracts described in `AI.md`.
Cone/chain/nova/ground effects, dropped pickups and cosmetic debris are not fully
migrated spatially. General rigid bodies, dynamic props,
material impulses, continuous actor vertical sweeps, and persistent body IDs are
future slices, not features delivered by this change.

## Simulation timing

`02-simulation-clock.js` owns `gameTimeNow()` and `runSimulationTick(dt)`.
The page-monotonic clock starts with a real-time origin once, then advances only
by fixed steps. It is not reset between runs; run timers use their own origin.
Before activation, isolated subsystem fixtures can still supply `Date.now()`.
Whole-game replays must exercise the activated clock, not replace it with wall
time. Record the initial clock/state, random seed and tick-indexed input for replay.

The production loop anchors its first RAF without inventing a tick. Each 1/60 s
tick advances the clock, updates authoritative camera/sensor intent, consumes
input, then runs the existing `gameUpdate` order. Keyboard, arrows, mouse,
gamepad and IMU no longer apply impulses once per render or transport callback.
Mouse displacement and jump/dash/attack taps are consumed once; held controls
repeat on ticks. Rejected jump/dash taps do not wait for boots, landing or cooldown.
Gamepad Start/Select remain UI controls available while paused.
IMU intent expires after 250 ms of native monotonic request age; late/out-of-order
responses cannot revive disconnected input or overwrite a newer sample.

Menu, settings, overview, game over and hidden tabs stop simulation. Boundaries
clear stale input and accumulated time; entering a blocking overlay cancels and
refunds an unreleased missile. Existing projectiles, cooldowns, attack windups,
damage-over-time and buffs freeze. Shop/inventory/forge retain their prior live
world policy, but block casting. Restart invalidates old loop/sensor callbacks.

Catch-up is capped at four ticks per rendered frame. Excess whole ticks are
discarded, retaining only the fractional remainder, with no giant physics step
or wall-time deadline jump. `simulationTiming` reports lifetime `ticks`,
`droppedMs` (discarded active-frame wall time) and `maxStepsPerFrame`. Ordinary
paused time is not counted as overload. Under sustained overload the game slows;
it does not simulate missed damage or fast-forward projectiles.

Rendering reads gameplay time for gameplay-owned effects. Decorative spell
jitter uses a separate random stream so extra redraws do not change gameplay
random draws. Performance clocks, hardware polling/freshness, log labels, toast
lifetimes and some cosmetic sky/water animation remain real-time. This is not
a claim of deterministic browser pixels.

Direct subsystem tools that bypass `runSimulationTick` must advance the game
clock explicitly when simulating, or scope their own clock and restore it before
yielding. Casting Studio and the browser profiler follow this rule.

## Render interpolation

`02-render-interpolation.js` is enabled by default in the ordinary frame loop.
`runSimulationTick` captures previous transforms before input/update and finishes
the snapshot afterward. Rendering blends with the remaining accumulator fraction;
it never extrapolates. The tradeoff is up to one 60 Hz tick (16.7 ms) of visual
latency. It does not move hitboxes, reschedule attacks, or predict input.

The draw scope uses reusable presentation views of player/camera/top-down camera,
enemies, projectiles, companions/allies, moving impacts, debris, collectibles and
ambient particles. Each view inherits current non-transform data and shadows only
finite transform values. Angles use the shortest arc. Health, deadlines, targeting,
and collect/open decisions are not interpolated. All terrain, depth and actor
passes see the same presentation camera. Camera follow now synchronizes in the
simulation tick rather than writing authoritative coordinates from `draw()`.

Original object coordinates are never temporarily changed. Global draw references
are restored synchronously in `finally`, even on a throwing paint. No asynchronous
work or simulation may run inside this scope. A `WeakMap` keys history by object
identity, not array slot; new objects snap and removed objects disappear. Stable
objects reuse their records/views and output arrays; newly spawned objects need
new records. Work is linear in the existing moving-object lists, with no additional
collision, support, or projectile queries.

Pause/frame resets, teleports (including unstuck/catch-up placement), world/grid/
origin changes, view/follow-mode changes, and canvas resizing invalidate or bypass
old history. Out-of-tick player/camera edits also snap. Large unexplained transform
jumps use a conservative 64-unit snap threshold. Future short teleports must call
`resetRenderInterpolation(entity)` or the global form; distance alone is not a
complete teleport detector. Static world geometry is never interpolated.

Direct `renderFrame()` calls remain current-state draws, so Casting Studio cannot
borrow live interpolation history. Developer tools explicitly opt in using
`captureRenderInterpolation()`, `finishRenderInterpolation()`, then
`renderInterpolatedFrame(alpha, optionalDrawCallback)`. `renderInterpolationEnabled`
provides an internal A/B switch; the shipping UI has no new controls.
`renderInterpolationStats` counts captures, captured/presented entities and record
creation without recording per-frame arrays or reading a performance clock.

This smooths tick-driven transforms, not every legacy animation/controller.
The subsequent NPC migration now advances enemy chase/patrol each physics tick,
independently of the slower decision schedule. Existing pixel rounding and sprite
frame rates still remain.

## Verification and performance

Run from the repository root:

```sh
python3 tools/game/dev.py build
python3 tools/game/dev.py test
python3 -m unittest tools.game.tests.test_spatial_queries tools.game.tests.test_spatial_consumers -v
python3 -m unittest tools.game.tests.test_spatial_motion tools.game.tests.test_projectile_sweeps -v
python3 -m unittest tools.game.tests.test_simulation_timing tools.game.tests.test_input_timing -v
python3 -m unittest tools.game.tests.test_render_interpolation -v
python3 -m tools.webui.js_engine tools/game/tests/spatial_queries.js --benchmark
python3 -m tools.webui.js_engine tools/game/tests/projectile_sweeps.js --benchmark
```

The shipping tests use analytic authored geometry and real seeded cave content.
Positive controls retain genuine pickup, pursuit and damage. Negative controls
cover roofs, walls, corners, slopes, stacked passages, stale targets and window
translations. Targeted source mutations must trigger specific assertions without
breaking setup; they never edit the production files. Existing terrain/render
regressions keep their behavioral assertions.

Timing replays exercise actual input/movement/combat in both views at 30/60/120
Hz and jitter, plus a seeded cave with enemies and changing support. They check
real missile/enemy damage, pause during a live projectile or attack windup, hidden
return and overload accounting. Small source mutations must fail those exact
contracts without crashing setup. These controlled-clock tests establish behavior,
not frame-time performance. The timing migration's initial native-browser check
was blocked by the browser client. The later interpolation measurements below
succeeded; they compare interpolation on/off, not the old/new timing systems.

Interpolation tests use authored quarter/half-tick values, angle-wrap boundaries,
spawn/removal/reordering, teleport/world reset, and actual 120 Hz Canvas submission.
Both views replay real input/physics/damage at 30/60/120 Hz with interpolation on
and off. Generated cave content exercises a real tick and interpolated draw.
Allocation-reuse and zero-extra-query controls accompany targeted source mutants;
these establish behavior and work counts, not browser frame-time performance.

The repeatable benchmark compares legacy cached/cold XY LOS and shared rays on
the same authored clear/blocked workload, using real monotonic `performance.now`.
It reports five serial repetitions of batched p50/p95/p99/max cost, with counters
on/off and deterministic terrain-cell/triangle/wall work totals. Percentiles are
**amortized query costs from batches**, not individual ray latency percentiles.
The legacy query does less work and cannot answer roof-separation questions.

Portable CI gates operation-count growth, not machine-dependent milliseconds.
This is a query microbenchmark, not browser frame time, whole-physics tick time,
or a phone performance certification. Target-client browser profiling remains
required before adopting the roadmap's provisional frame budgets.

For real Canvas profiling, run `python3 tools/game/dev.py serve --port 8002`,
then open `/physics-profile.html` in a **separate** browser tab. The developer
page is not part of the shipped UI. Its versioned steady-state fixture pins a
validated player anchor away from chunk boundaries before each real update,
refills health, and releases normal missiles at a reported cadence. Collision
and pushback still run; this is a performance fixture, not a movement-correctness
test or a streaming benchmark. It exercises real game updates/draws and
reports its fixture, counts, visibility, resolution, errors, warm-up, and measured
duration. Native `performance.now()` supplies all timings; no fake-clock timings.
The coarse opt-in profiler retains at most 4096 samples per stage and is off by
default. `simulationSpan` nests the other stages and includes intervening combat
and loot work; it is not all of `gameUpdate` or a sum of stage percentiles. Profile
generation/streaming separately. A desktop fixture is not a phone certification.

### Native interpolation measurements

On 2026-09-26, fixture v3 completed serial desktop-browser comparisons with
5 seconds of warm-up and 30 seconds measured per run. Settings: seed 12345,
20 enemies, repeated normal missiles, medium quality, 360 x 240 backing canvas,
visible tab; coarse-stage timers and detailed query counters off. The 3D order
was off/on/on/off, followed by 2D off/on. All six runs had zero reported browser/
render errors and zero discarded simulation time.

| View / interpolation | Snapshot mean per tick | Draw adapter mean per frame | Full callback mean | Full callback p95 |
| --- | ---: | ---: | ---: | ---: |
| 3D off, two runs | 0.001 ms | 0.003 ms | 9.41 / 9.54 ms | 12.4 / 12.6 ms |
| 3D on, two runs | 0.069 / 0.060 ms | 0.068 / 0.075 ms | 9.68 / 9.95 ms | 12.8 / 13.1 ms |
| 2D off | 0.002 ms | 0.002 ms | 3.17 ms | 5.3 ms |
| 2D on | 0.124 ms | 0.114 ms | 3.05 ms | 5.1 ms |

At this approximately one-tick-per-draw cadence, snapshot plus adapter means
amount to about 0.14 ms/frame in 3D and 0.24 ms/frame in 2D. Snapshot/adapter
p95 values were separately 0.2/0.2 ms in both 3D enabled runs and 0.2/0.3 ms in
2D; do not add percentiles. Small timings include instrumentation overhead and
have limited clock precision. Full callback differences include drawing and
run-to-run variation; the lower 2D enabled result does not mean interpolation
speeds up rendering.

RAF delivery was approximately 60 Hz, not a native 120 Hz display test. Each
enabled 3D run included a roughly 33 ms RAF interval; none of the six runs had an
interval over 33.83 ms. These samples do not promise perfect pacing. The fixture
pins player translation and scripts heading before capture, so it measures
moving-entity work, not camera-translation smoothness. The controlled 120 Hz
regressions separately verify intermediate Canvas poses and unchanged gameplay.
These are CPU/Canvas-submission timings, not GPU completion, fullscreen/mobile
certification, or streaming performance. Keep the version/settings identical
when repeating the developer page's interpolation on/off comparison.
