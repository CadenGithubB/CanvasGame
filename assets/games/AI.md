# Shared NPC controller and local navigation

Read `TESTING.md` before changing behavior. `10-npc-controller.js` is the common
decision/action/movement layer; `10-npc-navigation.js` supplies bounded local
route search. Neither is a new physics engine or renderer. Both views run these
functions on the existing fixed 60 Hz simulation clock.

## Profiles and traits

`NPC_PROFILES` defines faction, targetability, decision period, and capabilities.
Existing unit adapters retain their balance data and visual shapes:

| Profile | Enabled behavior | Existing policy retained |
| --- | --- | --- |
| enemy | patrol, pursue, melee, navigation, remember | Four enemy stat sets and telegraphed attacks |
| slime | followOwner, orbit, ranged, catchUp, navigation | Untargetable pet, cosmetic bounce, no player damage bonuses |
| garrison | followOwner, pursue, melee, catchUp, navigation, remember | Mortal ally, immediate melee, supported catch-up |
| tower | stationary, ranged | Elevated muzzle, market defense, shared bolt sweeps |

An actor's `npcProfile`, or an enemy archetype's `npcProfile`, can select another
registered, adapter-compatible profile. `npcTraits` overrides individual capabilities for one actor.
For example, `{patrol:false, pursue:false, melee:true}` makes an enemy stand its
ground without changing its faction or duplicating its attack code. Profiles
are selected at initialization; change traits for live capability toggles rather
than replacing an initialized actor's profile key. A new capability still needs
an implemented adapter and tests; an arbitrary trait name does not invent behavior.
Profiles do not move behavior between adapters: an enemy given the slime profile
does not automatically execute follower or ranged code. Candidate collections
and bolt targets still reflect the current enemy/party arrangement. New faction
arrangements or hostile ranged actors require integration and regression tests.

`npcEnsure` creates one reusable controller per actor, with a stable run-local ID,
selected target, next decision deadline, diagnostic state and action recipient ID.
Ability and spell descriptors are cached on the controller, not recreated every
tick. `npcMarkState` is developer-readable state, not an extra shipping UI.

## Perception, movement and actions

- New actors acquire immediately. Subsequent decisions are staggered by identity
  over approximately 100 ms. Movement, stun checks and attack deadlines execute
  every fixed tick; never multiply displacement by the old 80 ms think interval.
- Selection filters living hostile candidates using canonical body-height rays.
  A blocked nearer candidate cannot mask a farther eligible one. Coordinates,
  then stable IDs, break ties; an eligible retained target is kept unless another
  is more than roughly 15% closer. Dead, removed or occluded targets never get
  this retention exemption. No target can be hit using another target's visibility.
- Candidate acquisition uses known list membership; it does not repeatedly scan
  the whole actor list inside the candidate loop. This is a linear candidate scan
  per decision, not a spatial-indexed crowd AI. Dense mixed armies still require
  measurement before increasing population limits.
- Attack state progresses `idle -> windup -> cooldown -> idle`, independently of
  whether a target remains close. Death/stun cancels a windup. Recipient identity
  is locked, and life, membership, faction, range, vertical overlap (melee) and
  occlusion are checked at melee impact or ranged release. A geometric failure
  when windup completes consumes recovery; earlier death/despawn/stun interruption
  cancels to idle. A pending melee strike cannot silently transfer to a different
  creature or the player. Released bolts instead resolve physical first contact
  and can intercept another enemy; they do not lock the originally selected victim
  or perform generalized faction revalidation at collision.
- Desired movement goes through `npcMoveToward` and the existing shared body
  controller. It clamps arrival travel and cannot bypass walls/headroom/support.
  Only one primary steering choice runs per unit; separation and knockback remain
  explicit physical responses. Follower catch-up retains validated supported
  placement and clears old target/windup state.
- Hostile melee reach includes the existing player-separation boundary plus a
  small reach allowance. The previous shorter radius allowed physical separation
  to prevent all hits in unobstructed play. This is an intentional combat repair,
  not a claim that balance is numerically unchanged.
- Enemy interest is a simulation radius (at least 900 units, also considering
  living allies), not render `viewDist`. Burn damage advances for loaded actors
  outside that radius. Unloaded chunks still do not simulate autonomous life.
  Returning actors re-acquire instead of releasing a stale distant windup.

Slime bolts now live in `projectiles`, not `impacts`. They use the real sphere
sweep and canonical body-center aim; bounce is cosmetic. Their 15-unit horizontal
enemy envelope and no-knockback damage are retained. NPC damage cannot inherit
player robes, boosts, relic healing, synergies or mana effects. Slime shots are
absorbed by terrain/spawners without mining or spawner rewards. Tower bolts retain
their previous knockback/environment interaction, with corrected spatial aiming.

## Lifecycle

Enemy chunk save/rebuild preserves NPC ID/profile/trait overrides, locked attack
recipient ID, stun deadline, attack deadlines and arena/spawner ownership flags.
Targets for movement are re-acquired after reconstruction. IDs identify actors
within the run; they are not durable database IDs or references to render views.
Window-local coordinates remain behind the existing rebase path.

Last-seen locations use world XY plus observed canonical feet/aim height. Existing
actors retain that observation when the window origin shifts, while local paths
are invalidated. Reconstructed enemies intentionally reacquire: transient memory
and search trees are not serialized. Supported catch-up clears memory and routes.

New-run paths clear companions, garrison allies and fortress completion state
along with the NPC serial/counters. `resetNpcSystem` is bookkeeping reset; callers
must clear old run-owned actor collections before reusing IDs. Window assembly
does not reset the tower fire deadline. Pause remains the shared simulation pause:
there is no separate AI wall clock or hidden-tab catch-up.

## Navigation and last-seen investigation

Perception stores an observed position, never a pointer whose live coordinates
can leak through a wall. Enemy and garrison profiles remember it for 3000 ms of
simulation time after the last observation. Between perception decisions they
also steer toward that snapshot. Once sight is lost, `npcPursuitGoal` returns the
stored location with `remembered:true`; the adapter enters `search`. It does not
authorize attacks. Death, despawn, changed faction, expiry, explicit forgetting,
or arrival on the observed floor with a clear short ray ends the investigation.
Reacquisition refreshes the observation. Slime and tower do not investigate lost
combat targets. Owner following is an explicit companion relationship, not enemy
perception or hidden-target tracking.

`npcNavigateToward` first uses ordinary movement, with no full-route ray or search
in open space. Blocked/no-progress movement requests a local A* detour. Each edge
probes a cloned upright body through `spatialMoveBody`; only a complete traversal
is accepted. Radius, headroom, steps, unsupported ground, finite wall spans and
the final goal's exact support height remain authoritative. Node identity includes
XY and feet height, so overlapping storeys cannot collapse into one location.
Height-changing diagonal edges (including final connections) are rejected: a
coarse diagonal probe could skip an intermediate stair tread that small movement
ticks enter. Cardinal stair legs retain the reachable route without that shortcut.
Movement along the result still calls the live body controller every fixed tick.
An old path can never permit travel through a newly closed wall.

The deterministic work limits are shared by the whole simulation, not multiplied
by actor count: at most **48 edge probes per tick**, eight probes per queue turn,
64 pending jobs and 384 distinct nodes per request. Nodes use a grid spacing up
to 12 world units; edges are short body traversals, never unbounded direct sweeps.
Search extent is bounded to a 96-unit margin around endpoints and at most 384
units from its starting point; goals beyond 384 units fail safely. A queued actor
waits for its route. Failed searches retry after roughly 750 ms, staggered by ID;
queue overflow uses a 250 ms retry. These are operation bounds, not calibrated
millisecond promises. Search failure is not evidence that no global route exists.

Geometry object replacement, origin shifts, explicit `invalidateNpcNavigation()`,
body-size changes and large actor discontinuities invalidate local advice.
Call the explicit invalidation hook after future in-place geometry edits; identity
checks cannot detect arbitrary array writes. Live movement rechecks blocked routes,
and failed searches eventually retry when passages open. `npcResetNavigation`
cancels an actor's queued work; new-run reset also clears the global queue.

Enemies use navigation for pursuit, investigation and patrol. Generated patrol
waypoints are still XY-only; explicit `feetZ` waypoints are supported, but generated
waypoint/spawn validation is not fixed by this slice. Without an authored waypoint
height, planning conservatively targets the actor's current floor. Garrison allies
navigate toward observed opponents or the owner's supported position. Slimes
navigate when beyond their follow distance; nearby same-floor orbit motion stays
direct and cheap. Both followers request navigation when the owner is on another
floor even if horizontally adjacent. Owner goals use actual support rather than
jump height or smoothed legacy floor height. Existing validated far-distance
catch-up remains intentional.

`npcNavigationStats` records requests, edge probes, expanded nodes, completions,
failures, deferred work, invalidations, probe substeps and peak per-tick probes.
The optional native-clock `npcNavigation` stage measures the shared scheduler;
do not add it to enclosing update timings. Regression tests gate work counts and
actual traversed routes; native browser experiments supply elapsed-time evidence.

## Verification and measurement

Run `python3 tools/game/dev.py build` and `python3 tools/game/dev.py test`.
The focused suite is `python3 -m unittest tools.game.tests.test_npc_controller -v`.
Its authored fixtures and real-loop/generated-cave scenarios cover repeated
attacks, interruption, recipient changes, roofs/walls, projectile obstruction,
NPC damage isolation, trait effects, decision work, frame-rate parity and lifecycle.
Source-exact mutations must fail intended assertions without breaking setup.
`python3 -m unittest tools.game.tests.test_npc_navigation -v` additionally exercises
actual detours, corner/body clearance, missing support, fair global work bounds,
live geometry changes, route lifecycle, follower adapters, lost-sight paired
replays and 30/60/120 Hz navigation parity. It requires identical authoritative
poses and search work, not merely similar final locations.

Developer `/physics-profile.html` fixture v5 has an optional mixed workload:
20 enemies, one slime and two soldiers. All friendlies must genuinely move and
commit attacks; missing actors, work categories or runtime errors invalidate it.
Tower is tested separately for correctness, not included in that cave benchmark
because adding a market marker changes hostile behavior.
Soldiers start on supported outer-ring positions and are relocated there every
300 simulation ticks to keep following and fighting active after warm-up.
Relocation preserves cooldowns, cancels pending attacks and snaps interpolation;
it is separately timed fixture maintenance, explicitly excluded from movement
evidence. Reports disclose reset counts and distances. This is a controlled
workload, not a claim about the distribution of ordinary player encounters.

Optional native-clock stages are `npcPerception`, `npcDecision`, `npcActions` and
`npcLocomotion`. `npcDecision` wraps enemy targeting only, including its perception
call; the other three are shared across relevant adapters. Outer enemy/follower
stages include these children. Do not sum overlapping stages or percentiles.
Stage buffers are bounded and clock reads are disabled in normal play. `npcStats`
holds cheap work counters; the benchmark reports deltas and actual subject counts.
Compare repeated v5 runs with identical workload, settings and instrumentation;
older fixture versions are not before/after baselines for this behavior change.

The separate authored-navigation option uses 20 short-wall patrol stations,
without combat or teleports. Each subject must move, complete routes and cross
outside its wall's blocked span during measurement. Body overlap, missing
subjects, no completed routes or a per-tick budget violation invalidate the run.
Navigation work and fixture validation overhead are reported separately. This
isolates repeatable detours from crowd congestion; it is not the cave workload.

### Native navigation sample (fixture v5, 2026-09-26)

Serial desktop Chromium 153 runs used medium quality, a visible 360 x 240 canvas,
view distance 900, interpolation on, detailed query counters off, five seconds
warm-up and 30 seconds measurement. Test processes were stopped. Authored mode
uses 20 independent short-wall patrol stations, without combat or teleports;
it measures repeatable detours, not crowded chokepoints. All timing is native
CPU/Canvas submission, not fake-clock or GPU completion timing.

| Workload / view | Coarse timers | Navigation p95 per tick | Whole update mean per tick | Full callback mean / p95 |
| --- | --- | ---: | ---: | ---: |
| Authored / 3D A | on | 0.1 ms | 0.204 ms | 3.653 / 5.5 ms |
| Authored / 3D B | off | unmeasured | 0.157 ms | 3.474 / 5.7 ms |
| Authored / 2D C | on | 0.1 ms | 0.238 ms | 0.613 / 0.9 ms |
| Mixed cave / 3D D | on | no search work | 1.024 ms | 9.999 / 13.3 ms |

Each authored 3D run recorded exactly 392 completed routes, 19600 edge probes,
55272 probe substeps and zero failed searches. Every actor crossed its wall
19–20 times during measurement. The measured peak was exactly 48 edge probes per
tick, never multiplied by actor count. Both had no reported errors, body overlaps
or discarded catch-up; maximum RAF gaps were 18.8/18.7 ms. Navigation's coarse-on
maximum was 0.2 ms/tick. The approximately 0.047 ms/tick update difference includes
all coarse stage instrumentation; one pair does not isolate a universal timer
overhead budget. Outer timers and fixture validation remain active in both runs.
The 2D run repeated the exact same routing work and all subject checks; its
navigation maximum was 0.3 ms/tick, RAF maximum 18.7 ms, with no reported errors,
overlap or discarded time. Differences in drawing cost are not navigation speedups.
The mixed cave run validated movement and attacks for all three friendlies,
without reported errors or discarded catch-up (RAF maximum 33.3 ms). Its actors
needed no route requests during measurement: zero search edges is integration
evidence, not layered-cave pathfinding performance. Complex layered search cost
remains unmeasured. An earlier cave attempt was cancelled to update fixture-only
soldier relocation to clear the newly introduced memory and queued routes; it
is not included as a completed measurement.

The v4 measurements below are historical, not an old-vs-new speedup baseline.
These bounded local workloads do not certify dense crowds, every cave/biome,
streaming, mobile/fullscreen or native 120 FPS. Controlled refresh-rate tests
establish matching simulation traces rather than a high-refresh device budget.

### Historical controller sample, before navigation (fixture v4, 2026-09-26)

Serial runs on this desktop's in-app Chromium 153 used seed 12345, medium quality,
360 x 240 backing canvas, view distance 900, particle limit 25, interpolation on,
and detailed query counters off. Each used 5 seconds warm-up and 30 seconds
measurement. The corrected mixed fixture maintained 20 enemies, one slime and
two soldiers, with actual movement and committed attacks from all three friendlies.
Outer measurement timers and workload counters remain enabled in the coarse-off
comparison. The first, unrevised fixture run failed validation because soldiers
did not move during measurement; it is not performance evidence for this workload.

| Run | Coarse stages | Update mean / p95 (ms per tick) | Canvas mean (ms per frame) | Callback mean / p95 (ms) | Max RAF gap (ms) | Discarded catch-up (ms) |
| --- | --- | --- | --- | --- | --- | --- |
| 3D A | on | 0.940 / 1.2 | 8.598 | 9.732 / 13.2 | 33.3 | 0 |
| 3D B | off | 0.947 / 1.2 | 9.022 | 10.169 / 13.4 | 433.3 | 366.7 |
| 3D C | on | 0.931 / 1.1 | 8.942 | 10.068 / 13.2 | 33.3 | 0 |
| 3D D | off | 0.896 / 1.1 | 8.871 | 9.941 / 13.2 | 17.7 | 0 |
| 2D E | on | 1.901 / 3.2 | 0.847 | 3.043 / 5.2 | 17.7 | 0 |

All five runs had no reported browser/render errors. B completed its workload
checks but had a long frame gap and catch-up discard; its cause was not isolated.
It is retained here, not hidden or treated as a clean timer-overhead comparison.
The repeated C/D update difference was approximately 0.035 ms/tick; A/B reversed
that direction. These runs do not resolve a precise instrumentation-overhead
budget or prove the game is hitch-free.

In both coarse-on 3D runs, outer enemy AI/motion p95 was 0.4 ms/tick, separation
0.5 ms/tick and followers 0.1 ms/tick. Shared perception/locomotion p95 per call
was approximately 0.1 ms; action p95 was below the observed clock granularity,
not proof of zero cost. Inner stages retain the last 4096 samples; outer stages
covered all measured ticks. The four completed 3D runs recorded 6826–6922 decisions,
35710–36321 candidate checks, 35000+ movement attempts and 354–414 committed
actions. Fixture maintenance averaged 0.033–0.037 ms/tick. Rendering dominated
this small scene; the whole update number includes physics and is not standalone
AI cost, nor an old-vs-new implementation comparison.

The single 2D sample also passed mixed-workload validation, with 6916 decisions,
36252 candidates, 35487 movement attempts and 375 committed actions. Its outer
enemy AI/motion p95 was 1.4 ms/tick, separation 1.5 ms/tick and followers 0.2 ms/tick.
The higher update time is recorded, not assumed to be a view-specific AI defect
or a statistically established difference. The total callback was much shorter
because 2D drawing was cheaper; cross-view timing is not an isolated AI comparison.

This browser delivered approximately 60 Hz. Controlled 30/60/120 Hz tests prove
simulation behavior parity, not native 120 FPS performance. These are CPU/Canvas
submission measurements, not GPU completion, streaming, dense armies, tower
performance, mobile or fullscreen certification. Population/encounter outcomes
and warm-up boundaries can vary slightly with native scheduling; use work counts
alongside timing distributions rather than interpreting small differences as wins.

## Not yet implemented

There is no global navigation mesh, long-distance route hierarchy, crowd
reservation/avoidance, search-pattern sweep after reaching a last-seen point,
hearing, field-of-view cone, flee behavior, squad tactics or offscreen world
simulation yet. The bounded local grid can miss narrow or long routes; actors
stop/retry rather than tunnel or teleport through them. Generated patrol
waypoint/spawn validity remains a separate known issue. Creature-specific
animation rates remain presentation work. Extend these contracts rather than
introducing another independent targeting, movement or damage loop.
