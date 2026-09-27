# Shared 2.5D implementation checkpoint — 2026-09-26

User authorized continuing implementation without routine approval checkpoints,
preserving the two views and UI. Shared queries now also underpin actor movement
and main-projectile sweeps. This is not the full physics roadmap. Current runtime
boundary and commands are in
`assets/games/SPATIAL.md`; future phases remain in `docs/game_physics_plan.md`.

The sections below first record the query slice; the subsequent motion/sweep
verification is appended afterward. Earlier next-step notes are historical.

## Query-slice verification

- Regenerated `components/hardwareone/WebPage_Games.h`; source/header match and
  both classic scripts parse.
- Default `python3 tools/game/dev.py test`: **108 tests pass**. New suites are
  explicitly registered in that command's module list, not merely discoverable.
- New query harness: **50 analytic assertions**, including nearest hit, unequal
  grid sizes, roof/cap/slab, stacked passages, slopes, closed wall boundaries,
  world-coordinate identity, live edits and bounded work growth.
- New consumer harness: **75 assertions**, both views, real targeting/payment,
  real pursuit/windup/damage, stale targets and obsolete window objects. Actual
  generated cave chest seeds 12345/424242 and hillside closure seed 5668.
- **17 targeted source mutations** are detected at intended assertions without
  setup crashes (10 query mutations, seven consumer mutations).
- Existing render tests retained their behavioral assertions; direct-load
  harnesses gained the shared geometry include.
- Independent review compared 20,000 continuous and 20,000 integer-coordinate
  wall rays with exhaustive closed-AABB nearest-hit oracles. Initial boundary
  misses were fixed; the final integer sweep had no mismatches.

Review found and fixed a real seed-5668 ceiling-closure visibility hole, a
remembered melee-recipient bypass when a new ally moves nearer, and an obsolete
window chest that could otherwise still pay at coincident local coordinates.

## Local audit integration

The optional enemy/loot lab remains local. Removed repaired roof-awareness and
roof-pickup entries from its expected-bug ledgers. Replaced historical fix
probes with sensitivity probes restoring height-blind consumers. Reintroducing
old awareness produces 7/7 cave-to-roof and 3/3 roof-to-cave violations while
407/414 positive chases still reach windup. Restoring horizontal-only chest
targeting wrongly offers 7/7 roof-separated chests; same-floor offers and all
three real-loop entrance-to-chest walks continue passing.

Final `HW1_GAME_JOBS=1 python3 -m unittest tools.webui.tests.test_game_enemies
tools.webui.tests.test_game_loot`: 53 cases, 10 passing baseline/ledger checks,
43 opt-in probes skipped. The two repaired-consumer lab probes above were run
separately; the full historical mutation matrix was not run.

Reward-copy setup now establishes a valid local support position and active
chest identity before calling production collection, restoring state afterward.
Paired rarity controls convert chunk-world coordinates to window-local XY.
No collision/LOS/reward decisions are mocked. Unrelated known patrol, traversal,
startup, rarity/reward and Take/Swap defects remain documented; the audit is not
a claim that all game behavior is correct.

## Boundaries / next work

- UI and art were not redesigned, and the user's live browser was not refreshed.
- No new external dependencies, heavy physics engine, prop simulation, or
  per-query production timers. Counters are opt-in; no stale time-based ray cache.
- Browser pixels and target-client frame time were not measured. Query timing
  is a separate real-clock microbenchmark, not a whole-game or mobile budget.
- Next slice: canonical actor/support state and shared movement/sweep policies,
  preserving arcade tuning; then projectile first-hit sweeps. Do not silently
  migrate all remaining systems just because a common ray helper now exists.
- No commit or push. Existing unrelated local files preserved. New source,
  tests and docs scanned for personal paths/usernames, email/token patterns and
  private-key markers: no matches. Review exact staged content/metadata again
  before any future publish; keep optional lab/handoff uncommitted as agreed.

## Query timing snapshot (not a frame budget)

Final run used JavaScriptCore and monotonic `performance.now`, after root's
heavy checks finished. Five serial repetitions, 30 adaptive batches per mode,
8,192 warmup queries per mode. Authored 161×161 terrain / 128×128 wall-grid
workload: 64 rays, 32 clear and 32 blocked, lengths 480/840 world units. The
unchanged legacy and new implementations first had to agree with that analytic
clear/blocked fixture. Engine/OS versions and a lowest-supported client have
not been calibrated; these are local preliminary measurements only.

| Query mode | Range of repeat p50 (µs/query) | Range of repeat p95 | Worst batch average |
| --- | ---: | ---: | ---: |
| Legacy cached XY LOS | 0.0955–0.1004 | 0.1013–0.2136 | 0.3052 |
| Legacy cold XY LOS, including cache reset | 0.3571–0.3632 | 0.3650–0.3992 | 1.5247 |
| Shared 2.5D, counters off | 14.53–15.47 | 15.68–63.91 | 127.21 |
| Shared 2.5D, counters on | 15.31–17.58 | 15.59–21.52 | 24.59 |

These percentiles describe **batch-normalized costs**, not individual ray or
frame latency. With 30 samples, the reported nearest-rank p99 is the maximum.
Counters-off repeat p99 ranged 15.78–127.21 µs/query; significant timing noise
remains and was not removed. Do not infer that counters improve performance
from an outlier in the counters-off run. The simpler legacy query does not test
terrain/roofs, so the cost increase buys different correctness, not an equivalent
query speedup.

One 64-ray workload visits 3,648 terrain cells, tests 7,296 triangles, visits
2,891 wall cells and tests 39 occupied walls. Counters and the analytic complexity
gate provide portable evidence of bounded work. Browser stage timing/GC analysis
is still required to assess end-to-end impact. Rerun with:

```sh
python3 -m tools.webui.js_engine tools/game/tests/spatial_queries.js --benchmark
```

The harness emits full JSON; no machine-local path or user identifier is embedded
in the source/report.

## Continued slice: actor motion and projectile sweeps

Added canonical `feetZ`/support identity to moving enemies and followers, shared
bounded upright-body horizontal movement, height-aware repulsion/separation,
validated follower catch-up placement, and main-spell radius sweeps with first
world/body contact ordering. Enemy trajectories support relative moving-target
hits and partial-tick missile release. The generated header is regenerated.
Both views use the same rules; UI/art remain unchanged.

Real bugs covered include skipped thin walls, wall-first versus enemy-first
ordering, projectile-radius edge contact, cross-roof hits, stale actor height,
coincident separation, low headroom, body footprints at corners, and followers
moving in world space during a window rebase. Casting Studio's target now carries
explicit feet height and its scoped state includes both motion tick fields.

New shipping evidence:

- Motion: 74 authored/real-consumer assertions and nine defect controls, including
  actual `step`, patrol, separation, and player repulsion in both views.
- Projectile sweeps: 44 assertions and seven defect controls, including moving
  targets and a shot released after the target had already crossed its path.
- Profiler: 19 deterministic accounting assertions and four controls. These use
  a controlled clock to test accounting, **not** to claim runtime performance.
- Browser fixture is excluded from the shipping header and ordinary preview;
  it runs the same unmodified game scripts in a separate developer route.

Optional lab migrations preserve prerequisites and independent expectations:

- Enemy separation uses an independent circle/prism oracle instead of the old
  square-corner oracle. Zero embeds among 292 bodies at 74 sites, 290 genuinely
  moved. Return-to-patrol 60/63 meets the existing 95% threshold; buried-wall
  surface traversal 15/15. Cave support has zero off-floor samples among 1080
  pre-recenter and 780 post-recenter samples. All three defect restorations fail
  their intended assertions before removing F2/F4/F6 expected failures.
- Physics A/D mutations now target shared support/wall paths instead of removed
  rectangle rollback. All three focused controls pass sensitivity.
- Persistence interaction setup now approaches genuinely reachable active-world
  chests at the right height before real collection/swapping. Restores the pose
  afterward; never bypasses reach or uses obsolete objects. Four focused controls
  verify ally-rebase omission, swapped item/quality, restart coins, and collected
  chest resurrection. Ally rebase expected failure is removed only after proof.
- Enemy, physics, persistence, and loot baseline protocol checks pass with their
  remaining documented defects, not as an all-game-bugs-fixed claim. The entire
  historical cross-suite mutation matrix was not rerun.

## Browser profile and targeted optimization

`tools/game/physics-profile.html` is appended only at the developer route
`/physics-profile.html`. It runs five native seconds of warm-up then 30 seconds
of actual `gameUpdate`/Canvas rendering on a seeded cave fixture. Twenty supported
enemies receive health refills and normal missiles are directly released every
six simulation ticks, three at a time. It reports this synthetic workload
maintenance separately. It is neither a full playthrough nor a spell-storm test:
the dense close fight only retains zero to three live projectiles, despite 900
releases per run. Production shot console logging remains included.

The first actual-browser profile identified separation as the largest simulation
stage. Support/headroom is currently discrete per authored cell: nine footprint
points often query the same cell repeatedly. Deduplicating those cell IDs **only
within one footprint call** preserves all distinct-cell checks and has no stale
cross-tick cache. Independent tests count real support calls for a one-cell body
and a four-cell corner, retain a neighboring low roof, and verify a live roof edit
is visible on the next call. Removing dedup fails the work regression. Review
confirmed this optimization is valid only while actor support remains discrete.

Serial desktop measurements (native monotonic clock, no concurrent CPU test
processes) use Chrome 153, 360×240 canvas, 1280×720 viewport, DPR 1, medium preset,
view distance 900, seven-chunk window, particle setting 25, seed 12345. Canvas was
fully visible throughout. A prior concurrent-load preflight is not included in
the comparison. Values below are rounded milliseconds, not a portable budget.

| 3D run | gameUpdate p50 / p95 / p99 / max | separation p50 / p95 | Canvas submission p95 | RAF p95 / p99 |
| --- | --- | --- | --- | --- |
| Before support dedup | 1.6 / 2.2 / 2.4 / 23.1 | 1.2 / 1.4 | 11.8 | 16.9 / 18.5 |
| After support dedup | 0.8 / 1.1 / 1.3 / 1.5 | 0.5 / 0.6 | 11.7 | 16.8 / 18.2 |

The baseline's 23.1 ms update outlier remains reported; it was in enemy AI/motion,
not silently trimmed. This is one serial before/after pair, not the roadmap's
five paired device-calibration repetitions. Both runs had zero errors and zero
discarded simulation time. The optimized run had 1800 simulation ticks, 20 active
enemies, 900 missile releases, and projectile-CCD p95 0.2 ms. Rendering remains
the larger cost in this fixture. `simulationSpan` and child stage percentiles
are not summed. Mobile, fullscreen, streaming, long replay, and dense projectile
stress still require separate calibrated runs.

## Additional browser finding and final checks

The first real top-down run exposed a pre-existing `drawPlatforms2D` crash: it
dereferenced `mesh.heights`, absent from generated layered Endless terrain.
Fixed the renderer to select actual top walkable strata and colors, keep legacy
height-buffer compatibility, clamp finite alpha for negative/tall heights, and
submit only visible cells. Terrain now draws before actors rather than over
them. Fifteen regression assertions cover actual generated and authored terrain,
the full 2D frame, old buffers and water; five targeted mutations fail correctly.
The invalid browser run was not used for timing claims.

Final shipping gate after the production changes: **125 tests pass** in 25.9 s,
including explicit registration of all new suites. Header/source match, classic
scripts parse, and `git diff --check` is clean.

Serial JavaScriptCore projectile microbenchmark (native clock, no concurrent
test processes): 1 s warm-up, five 1 s repetitions, 120 sweeps per batch against
60 targets. Repeat p50 was 0.96 ms/batch, p95 1.28–1.34 ms, p99 1.54–1.66 ms;
worst batch 2.42 ms. This is a short-path query microbenchmark, **not** a complete
spell-storm browser frame or the longer reference-device calibration protocol.
One batch checks 7200 body candidates but only 366 narrow body tests; 1180 swept
terrain cells, 672 swept wall cells, and 32 swept triangles. Center-ray work is
additional: 380 terrain cells, 760 triangles, 502 wall cells, one occupied wall.

The browser page's stable fixture is now **v2**: a supported player anchor at
least 30 units from chunk boundaries is restored before each actual update,
with cumulative pin correction distance reported. Enemy/player collision still
runs, and an unexpected rebuild or render error invalidates the run immediately.
This prevents unplanned crowd-driven streaming in a steady-scene benchmark.
Do not compare its timings directly with unpinned v1 above. Streaming and free
movement have their own correctness/performance scenarios.

Initial serial v2 results (same browser/settings, 5 s warm-up +30 s measurement;
20 active enemies, zero to three live shots, 900 releases, no errors/discarded
simulation time):

| View / coarse timers | gameUpdate p50 / p95 / p99 / max | separation p95 | projectile CCD p95 | Canvas submission p95 | RAF p95 / p99 |
| --- | --- | --- | --- | --- | --- |
| 2D, on, first run | 2.2 / 3.4 / 5.0 / 35.0 | 2.1 | 0.5 | 1.9 | 17.6 / 17.7 |
| 3D, on | 0.7 / 1.1 / 1.2 / 2.9 | 0.6 | 0.2 | 11.5 | 16.8 / 17.2 |
| 3D, off | 0.7 / 1.1 / 1.3 / 1.4 | off | off | 11.3 | 16.8 / 17.1 |
| 2D, on, repeat | 2.1 / 3.3 / 3.7 / 4.1 | 2.0 | 0.4 | 2.0 | 17.5 / 17.6 |

The first 2D run had a larger outlier, which is retained rather than explained
away as a proven browser cause. Its maximum separation sample was
32.2 ms, and one RAF interval exceeded 33.83 ms (the report uses a 0.5 ms tolerance
around nominal frame deadlines). The repeat retained a higher 3.3 ms p95 update
cost, so this is not dismissed as one outlier. The physics queries do not branch
on view mode, while
whole-game wall-clock AI/randomness and browser warm-up can vary across runs.

The 3D on/off mean update costs were 0.753 / 0.756 ms, indistinguishable at this
sample/noise scale; this does **not** prove a precise <2% instrumentation budget.
Outer frame/update/render measurement remains active in both. The slower 2D
sample exceeds the roadmap's provisional 2 ms p95/4 ms p99 simulation goals;
those goals are not declared met on a calibrated reference device. Desktop
fixture timing cannot certify a phone or fullscreen resolution.

Additional **counters-on diagnostic** runs distinguish algorithmic work from
timing; do not mix these instrumented timings into the counters-off comparison:

| v2 view | ticks | movement calls | movement substeps | support samples | projectile calls | body candidates / narrow tests |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2D | 1800 | 131317 | 133674 | 758705 | 900 | 17880 / 12039 |
| 3D | 1801 | 130939 | 132789 | 772966 | 903 | 17942 / 11901 |

Both completed without errors or discarded time. Normalized movement calls are
about 73/tick in both, and support sample counts differ by under 2%; the 3D run
actually has slightly more support work. Yet update p95 stayed 3.4 ms in 2D and
1.1 ms in 3D. This rules out a threefold increase in these measured collision
operations; it does not prove which browser/JIT/host scheduling or clock behavior
causes the elapsed-time difference. Do not change collision quality or declare a
performance regression from that ratio alone. The full 2D callback remains far
cheaper than the full 3D callback because Canvas rendering is lighter.

## Handoff boundary

- No UI redesign or changes to the user's positioned browser tab. Testing used
  its own local page/tab on port 8002.
- No commit/push in this continuation. Source, tests, developer page and durable
  guidance were scanned for personal paths/usernames and credential patterns;
  no matches in new/added task content. Review exact staged diff and author
  metadata again before publishing; optional lab/handoff remain local as agreed.
- Remaining work is explicit in `SPATIAL.md`: area/follower/tower combat,
  vertical sweep/controller unification, stable body
  IDs, dynamic props/material response, and calibrated mobile/fullscreen/streaming
  budgets. Do not mark the complete physics roadmap finished.

## Completed timing continuation

The user selected timing consistency next. Added `02-simulation-clock.js` and
fixed-tick input/camera consumption, with game-time producer/consumer migration
through combat, AI, effects, buffs, spawners and matching render deadlines.
Input events latch short taps; sensor responses sample rather than accelerate.
IMU intent expires at 250 ms of native request age; stale run/out-of-order
responses are rejected. Render spell jitter no longer consumes gameplay RNG.

The first RAF anchors time without a tick. Four-tick catch-up cap discards excess
whole ticks, retains fractions and exposes `simulationTiming` counters. Pause,
settings and overview boundaries clear input/accumulated time and cancel/refund
pending missiles immediately, even if opened and closed before a RAF. Existing
projectiles/cooldowns/enemy windups/DOT freeze. See `SPATIAL.md` for the contract.

Shipping gate: **129 tests passed** after regeneration; both scripts parse and
the generated header matches. New timing/input suites contain **113 behavior
checks and 12 source-exact mutation controls**. They exercise both views,
30/60/120 Hz and jitter, actual missile and melee/burn damage, live-projectile
pause, hidden return, overload, same-frame overlay transitions, actual DOM taps,
mouse/gyro authority and sensor transport faults. Seed 12345 cave replay has
real enemies and changing support. Legacy direct loaders now load the real clock.

Fresh browser performance verification was attempted in a new test tab, but
the browser returned `net::ERR_BLOCKED_BY_CLIENT` for the local profiling page.
The server was listening; no browser bypass was attempted. No new native Canvas
frame-time claim is justified. Earlier measurements above are historical.
The isolated physics profiling page advances game time explicitly and mirrors
the new overload policy. UI/art unchanged. No commit/push. Added task content
passed the personal-path/username/email/credential-pattern scan; review staged
content and author metadata again before any future publication.

## Completed render-interpolation continuation

The user asked to explore and implement interpolation now. It is enabled by
default through `02-render-interpolation.js`, ordered after the fixed clock.
`runSimulationTick` captures previous transforms before input/update and finishes
afterward; the ordinary frame loop blends using its accumulator remainder.
Player/cameras, enemies, missiles, followers/allies, moving effects and loot use
reusable visual views keyed by source identity. Original coordinates are never
temporarily changed, and all draw references restore in `finally`. Camera follow
authority moved from `draw()` into the tick. Static geometry, hitboxes, damage,
input consumption and gameplay deadlines remain authoritative current state.

Reset/pause, changed worlds/origins/views, explicit teleports (including the two
player unstuck paths and spatial catch-up placement), new bodies and large
discontinuities snap. Stable objects reuse records and arrays. No extra spatial
queries or shipping performance-clock calls were introduced. Direct
`renderFrame()` and Casting Studio remain current-state paths. No shipping UI
changes, no refresh of the user's positioned game, and no commit/push.

Final shipping gate: **131 tests passed in 47.795 seconds**; generated header is
current and both classic scripts parse. The new interpolation suite has
**66 behavioral assertions and 10 targeted source mutation controls**, including
authored fractional poses, shortest-angle crossing, real 120 Hz no-tick Canvas
submission, on/off real physics and damage replay at 30/60/120 Hz in both views,
seeded cave rendering, spawn/removal/reordering, teleport/world reset, exception
restoration, allocation reuse and no additional collision queries. Mutants must
fail their intended contract with intact fixture setup. `git diff --check` and
the added-content privacy/credential-pattern scan passed.

Native browser access succeeded in this continuation. The isolated developer
profile is now fixture **v3**, with interpolation on/off and separately measured
snapshot and draw-adapter work. Six serial runs used 5 seconds warm-up +30 seconds
measurement: 3D off/on/on/off, then 2D off/on. Seed 12345, 20 enemies, repeated
normal missiles, medium quality, 360 x 240 backing canvas, coarse timers and
detailed counters off. All completed without reported browser/render errors or
discarded simulation time. `assets/games/SPATIAL.md` records the comparison table.

Snapshot plus adapter means were approximately **0.14 ms/frame in 3D** and
**0.24 ms/frame in 2D**, at this near-one-tick-per-frame cadence. The enabled 3D
full callback means were 9.68/9.95 ms versus 9.41/9.54 ms disabled; p95 was
12.8/13.1 versus 12.4/12.6 ms. The 2D enabled/disabled callback means were
3.05/3.17 ms: that variation is not evidence that interpolation speeds up drawing.
Measurements include timer overhead and limited clock precision. Never add
stage percentiles or attribute all full-callback variation to the adapter.

Limits: one tick (up to 16.7 ms) of visual latency; no prediction. Enemy chase/
patrol still changes movement on its existing roughly 80 ms cadence, and legacy
sprite rates/pixel rounding remain. The browser delivered roughly 60 Hz; 120 Hz
intermediate-pose correctness is covered by controlled tests, not a high-refresh
display benchmark. Both enabled 3D runs had one approximately 33 ms RAF interval;
none of the six runs exceeded 33.83 ms. The benchmark pins player translation and
scripts heading before capture, so it does not measure camera-translation
smoothness. Timings are CPU/Canvas submission, not GPU completion, streaming,
mobile/fullscreen certification, or a before/after comparison of the clock
migration. Do not compare fixture versions directly.

## Completed shared-NPC continuation

The user approved the shared-controller foundation after the enemy/friendly AI
audit. `10-npc-controller.js` now provides reusable profiles and trait overrides,
staggered perception, stable run-local identity, spatial target validation,
locked-recipient action timing and fixed-tick movement. Existing enemies, slime,
garrison soldiers and tower use these contracts. Unit adapters keep their balance
data and visual shapes. Read `assets/games/AI.md` for extension boundaries.

Intentional repairs include cooldowns that recover out of range, stun-cancelled
windups, actual impact-time height/visibility/liveness validation, melee reach
compatible with player separation, and movement independent of render distance
and decision cadence. Slime bolts now use projectile sweeps without inheriting
player buffs/relic rewards; tower aims from its elevated canonical muzzle.
Streaming preserves NPC identity, deadlines, traits and ownership flags; new
runs clear old party state and IDs. No shipping UI/art change or new navigation
planner is included. Direct steering and invalid generated patrol waypoints are
still explicit limitations, not silently declared solved.

The NPC regression suite passes **64 behavior checks and 15 source-exact mutation
controls**, including real 30/60/120 Hz combat, pause/interruption, chunk rebuild,
wall/roof pairs, trait toggles, damage isolation and candidate-scan complexity.
Old movement/spatial consumers were updated to exercise the shared paths without
weakening their spatial contracts. The shipping gate passes **134 tests** with
current generated header and both classic scripts parsing (final rerun: 60.097
seconds). An independent
read-only review found no blocking lifecycle/action/movement defect.

Developer benchmark fixture v4 adds an opt-in 20-enemy/one-slime/two-soldier mixed
workload. Its first native run was rejected: soldiers attacked but stopped moving
during warm-up. The revised fixture requires actual movement and attacks from
every friendly and periodically relocates soldiers to revalidated starting
positions. Relocations preserve cooldowns, clear windups/history and are excluded
from movement evidence; fixture overhead is separately timed. Focused tooling
checks cover invalid workloads and relocation-accounting sensitivity. Native
results and qualification limits are recorded in `assets/games/AI.md`.

Five corrected native runs completed without reported errors: 3D coarse timers
on/off/on/off, then 2D on. 3D update means were 0.896–0.947 ms/tick, with callback
means 9.73–10.17 ms; the 2D callback mean was 3.04 ms and update mean 1.90 ms.
One 3D run had a 433.3 ms RAF gap and discarded 366.7 ms at the existing catch-up
cap; its cause was not isolated. All other runs had no discard. This is not a
claim of hitch-free, mobile/fullscreen or native 120 FPS performance. The added
content privacy/credential-pattern scan and `git diff --check` passed.

No live positioned game was refreshed; native profiling used an owned developer
tab. No commit/push. Recheck the exact staged diff and author metadata before any
future publication; this handoff and optional audit lab remain local.

## Local navigation and last-seen continuation

The user selected obstacle navigation and lost-target memory next. The new
`10-npc-navigation.js` implements body-probed local A* with one shared 48-edge
budget per fixed tick, eight-edge fair queue turns, 64 queued jobs and 384 distinct
nodes per search. Open-space steering stays direct; collisions request detours.
Search failure is bounded and retries, not permission to tunnel or teleport.
Route state includes feet height, geometry generation and origin; all movement
still goes through the authoritative body controller. Read `AI.md` for extent,
cache invalidation and generated-waypoint limitations.

Enemy/garrison observation stores world XY and canonical feet/aim height for a
three-second simulation-time investigation. Unseen live coordinates never steer
that investigation. Expiry, death/despawn/faction change or verified arrival clears
memory. Reconstructed enemies reacquire; transient trees/memory are not streamed.
Enemies navigate for patrol/pursuit/search. Followers route to actual owner support
even at the same XY on another floor, without chasing temporary jump height;
near-owner same-floor slime orbit remains direct. Catch-up explicitly forgets.

The new suite has **46 behavior checks and 20 exact fault mutations**, alongside
the existing NPC suite's 64 checks/15 mutants. It exercises actual corner/roof/wall
detours, missing support, fair crowd work bounds, map replacement/live edits,
trait toggles, real follower routes/stairs, hidden-target paired replays and
30/60/120 Hz authoritative trace parity. A real stair test found coarse diagonal
probes could skip a lower tread that small ticks enter, freezing followers. The
planner now rejects height-changing diagonals, including final goal connections;
reintroducing that exact shortcut fails the retained stair fixture.

Browser fixture v5 adds a separately named 20-station authored navigation mode.
All subjects must complete routes and cross around their wall without body
overlap, not just request a path. Its validator also samples the real shared
per-tick edge budget. No teleport or combat workload is mixed into this mode.
The generated-cave combat mode remains a separate integration measurement. Both
views passed hosted full-workload checks; native results belong in `AI.md` and
must not be compared directly with historical fixture versions.

Native v5 runs: authored 3D coarse on/off, authored 2D on, then mixed cave 3D on.
Each authored run completed 392 routes / 19600 edge probes, all 20 actors crossed
19–20 times, and measured peak work was 48 probes/tick. Coarse-on navigation p95
was 0.1 ms/tick (max 0.2 ms 3D / 0.3 ms 2D). No completed run reported errors or discarded
catch-up. Cave update mean 1.024 ms/tick, callback mean 9.999 ms / p95 13.3 ms, but zero
route requests: layered search performance is still unmeasured, not proved cheap
by that integration run. One cave attempt was cancelled to repair developer-only
teleport cleanup; a targeted fixture mutant now catches retained route/memory.

The user's next proposed focus is a reusable 3D object/model layer with scalable
chests, retaining the existing Canvas renderer. They asked whether the concept
makes sense, not to replace the renderer or implement that layer yet. Current
`drawTreasureChests3D` already projects world-space faces but hard-codes dimensions,
corners, lid shaping and draw ordering. A shared model/instance/transform/bounds
layer is the natural proposed next slice; no object-system changes were made here.

Final navigation shipping gate: **138 tests passed in 64.108 seconds** after
regeneration, with matching header and both classic scripts parsing. The final
navigation suite is 46 checks / 20 mutants; mixed-fixture cleanup adds a retained
route/memory mutation control. Added-content privacy-pattern and whitespace checks
passed. No commit/push, no shipping UI changes, and no positioned live game refresh.
