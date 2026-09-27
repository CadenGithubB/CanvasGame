# Shared game physics: proposal and implementation gates

Status: shared spatial queries, actor-motion adapters, and main-projectile sweeps
implemented, 2026-09-26. Later phases and unmet exit gates remain proposals.
See `assets/games/SPATIAL.md` for the implemented boundary and verification
commands. Keep the existing UI and visual style. Improve the consistency and
feel of the world without assuming a heavyweight rigid-body engine is needed.
Read `assets/games/TESTING.md` before implementing or extending the tests.

## 1. Recommendation

Build a small **2.5D simulation**: bodies have horizontal position, a real feet
height, vertical extent, velocity and collision policy; Canvas remains the
renderer. The same simulation feeds the first-person projection and top-down
view. Canvas being a 2D drawing API does not limit the dimensionality of game
state. Neither pixels nor sprite size should decide physical collisions.

Start with consistent character movement, support, combat queries and projectiles.
Then add a bounded set of dynamic objects and force interactions. Do not begin
with arbitrary rotating 3D rigid bodies, general cloth, fluid simulation,
terrain destruction or large rubble piles. Those are separate projects, not
prerequisites for a convincing world.

“Shared” means common space, clock, queries and event semantics—not identical
behavior for every object. An actor can use an arcade controller; a thrown prop
can bounce; a banner can remain a cosmetic effect. Both actors and thrown props
must still agree about where a wall and floor are.

## 2. What the code already provides, and where it diverges

These observations come from the current sources, not an assumption that the
game has no physics:

| Current code | Useful foundation / remaining mismatch |
| --- | --- |
| `21-frame-loop.js` | Fixed-step accumulator and capped catch-up already exist; `handleInput(FIXED_DT)` still runs per render frame and applies movement impulses there. |
| `06-floor-queries.js` | Layer-aware support/headroom and cave-space queries exist. Legacy player Z is `40*h+60`; renderer/entity floor Z is `25*h`. |
| `09-physics.js` | Horizontal movement and repulsion use the shared body controller. Legacy-unit jumping/falling/smoothing remain. |
| `11-enemies.js` | Patrol/chase/knockback share body motion and carry feet height through streaming. Knockback uses `dt`; chase retains its 80 ms cadence and `speed * 0.08`. |
| `17-input-lighting-update.js` | Spatial-hash separation uses shared height/footprint checks. Chest reach is height-aware. Opt-in bounded coarse-stage timing is available. |
| `08-sensors-input-los.js` | Legacy XY LOS remains for patrol/navigation and unmigrated consumers. Enemy-to-player chase and melee now use uncached shared 2.5D rays. |
| `06-spatial-geometry.js`, `06-spatial-queries.js`, `06-spatial-motion.js` | Canonical adapters, shared semantic strata/triangles, wall/roof rays, world-space IDs, bounded body substeps and support/headroom. Actor support retains legacy discrete cell heights. |
| `10-combat.js`, `10-projectile-queries.js` | Main projectiles sweep their radius against world geometry and moving bodies, resolving earliest contact. AoE/chain/ground effects remain legacy. |
| `19-companions-loot.js`, `18-arena-fortress.js` | Follower motion and validated catch-up placement share the controller; their attacks/pickups need subsequent migration. |
| `12-scene-depth.js` | Renderer support sampling now delegates to camera-independent shared terrain geometry; its legacy no-mesh rendering fallback remains unchanged. |

Confirmed audit findings such as roof-separated chest pickup and enemy/player
contact-versus-attack reach disagreement are useful first acceptance scenarios.
Other proposed risks below are preventive tests, not claims that every one is
currently a confirmed defect.

## 3. Spatial contract: establish this before adding forces

Choose one canonical simulation unit for X, Y and Z. Recommended: retain current
horizontal world units and use `z = meshHeight * 25`, matching render-world
geometry. Store **feet Z**, not an eye-offset value. A separate body height and
eye offset remove the current ambiguity.

For migration, convert legacy player values through named boundary adapters:

- Feet Z = `(legacyFloorZ - 60) * 25 / 40`.
- Legacy player Z = `feetZ * 40 / 25 + 60`.
- Legacy vertical velocity and gravity also need the `25/40` scale; converting
  positions alone would change jump height and duration.
- Convert step/headroom/ceiling tolerances once into canonical units. Preserve
  current player feel initially, with measured trajectories as a reference.

Keep world positions distinct from window-local positions. Use stable body and
surface IDs, including chunk ownership. Local indices may change when the
window moves and may never serve as persistent identity. Adapters can mirror
legacy output temporarily, but only one representation owns simulation state.

The world query interface should expose:

- `querySupport(body, targetXY)`: support ID, height, normal, material,
  headroom and explicit `supported / falling / blocked / unloaded` result.
- `sweepBody(body, displacement, mask)`: earliest time of impact, normal,
  other body/surface ID and material; handles starting overlap explicitly.
- `raycast(fromXYZ, toXYZ, mask)`: first obstruction, including floors,
  ceilings, cap slabs and walls—not just XY walls.
- `overlapVolume(shape, mask)` and a reachability query for interactions.

API names are illustrative. Resolve ownership before adding more globals. Keep
classic-script manifest order; this does not require a module-system rewrite.

Terrain queries and rendering must consume the same authored layer roles,
triangle diagonal and portal boundaries. A roof is a solid slab separating two
open spaces. Missing/unloaded geometry is a distinct state, never fabricated
ground at zero. Surface/cave flags describe geometry-derived state; they are not
an independent substitute for height checks.

## 4. Bodies, contacts and motion

Use lightweight shapes and explicit categories:

| Category | Initial representation and policy |
| --- | --- |
| World | Grid-indexed wall spans, terrain triangles, ceiling/cap slabs; oriented boxes for fixtures such as stalls. Static until a geometry revision changes. |
| Player/enemies/allies | Upright cylinders: XY circle plus vertical interval. Shared controller with per-type radius, height, speed, step and slope settings. |
| Projectiles | Swept sphere or small cylinder; gravity/homing are motion policies, not alternate collision systems. |
| Dynamic props | Small bounded pool of cylinders/boxes; mass, velocity, damping, restitution and sleep state. No arbitrary 3D rotation required for v1. |
| Pickups/triggers | Non-solid volumes, with explicit reachability and height policy. |
| Cosmetic debris | Limited physical subset; remaining particles are visual and never apply gameplay damage. |

Use collision layers/masks for player, enemies, allies, world, projectiles,
props and triggers. Friendly fire, owner immunity, trigger reach and projectile
piercing are explicit rules. Height separation filters candidates before narrow
collision checks, so cave and surface bodies do not repel or damage each other
merely because their XY positions coincide.

Actor movement: desired velocity → acceleration/friction → sweep → move to
first contact → remove inward normal motion → use remaining time to slide.
Bound contact iterations, but expose exhaustion and conservatively stop rather
than move through a wall. Resolve starting overlap separately; use stable
contact ordering to avoid array-order jitter. Test acute corners and opposing
contacts, not only single walls.

Vertical movement: integrate gravity; sweep the body against floor and ceiling
over its path; select reachable support in the same open space. Steps require
both valid foot support and full headroom. Small supported downhill changes
remain grounded; real ledges cause falling. Do not snap to whichever layer is
closest after passing through a roof. Camera smoothing is visual only: it must
not move the collision body or alter attack range.

Projectile movement: sweep the complete travel segment each tick; select the
earliest valid world or body hit. Test moving targets through relative motion
where needed. Include the projectile radius and vertical overlap through time.
Damage, ricochet, piercing, destruction and explosion events consume remaining
travel in a bounded, explicit order. A wall behind a nearer enemy and a wall
in front of a farther enemy must give opposite outcomes.

Dynamic props receive impulses with tunable mass/restitution/friction. Keep
kinematic actors responsive; they need not become full rigid bodies. Sleeping
props stop consuming solver time until touched. Sleep never disables hit tests
or removes their collider. Constraints and moving platforms are later extensions
with their own relative-motion and support-velocity tests.

## 5. Tick order, clock and lifecycle

Implemented timing slice: both views now consume gameplay input on 60 Hz ticks,
including authoritative gyro/keyboard aiming and sampled sensor intent. Gameplay
deadlines share a pause-aware clock; overload work is capped and counted. Real
loop replays cover display cadence, combat, pause and stalls with causal mutation
controls. See `assets/games/SPATIAL.md` for exact pause and clock contracts.
The event-order redesign below is still a proposal: the existing `gameUpdate`
subsystem order has not been replaced and damage-before-regeneration remains a
separate known repair. A subsequent render-only interpolation slice now blends
camera/player/actor/projectile transforms without changing authoritative state;
its on/off replays and discontinuity/allocation tests are in the shipping gate.
General dynamic props are not implemented.

Keep the existing fixed-step foundation, initially 60 simulation ticks/second.
Do not use frame rate or `Date.now()` as the authority for physics duration.
Rendering can interpolate previous/current snapshots without writing back.

Each tick should have a documented order:

1. Consume a tick-stamped input snapshot and AI movement intentions.
2. Apply queued spawns, world changes and validated streaming updates.
3. Update forces and desired motion; refresh affected spatial buckets.
4. Sweep/move actors and props; solve contacts and support.
5. Sweep projectiles against the appropriate body trajectories; collect hits.
6. Resolve ordered gameplay events: damage/death before regeneration, then
   triggers and rewards, with exactly-once IDs.
7. Publish render/debug snapshots and stage counters.

This ordering is a proposal to validate, especially simultaneous attacks and
moving-target hits. Do not silently preserve accidental array-order behavior.
Input acquisition may run per render frame, but motion impulses must be consumed
once per simulation tick. Simulation-owned cooldowns/attack phases use tick time;
UI-only animation can use wall time. Pause/restart cancels or preserves pending
events according to an explicit policy, without delayed attacks on resume.

Cap catch-up work and count dropped simulation time. Rendering slows before
collision correctness is sacrificed. After a stall, the player may observe
temporary slow simulation; they must not tunnel because the solver took one
giant timestep. Clear previous interpolation state on teleport/restart.

Chunk changes are atomic spatial revisions between ticks. Invalidate query
caches by revision; retain body IDs and world coordinates; rebuild local indices.
Pin a safety margin for active body sweeps. If a destination is unloaded,
stop/queue travel and expose the reason rather than assuming empty space. A
streaming stress case must be measured separately from warm physics throughput.

## 6. What can make it feel impressive

Prioritize readable interactions that reinforce a consistent world:

- Weight: light enemies move farther from a blast than heavy ones; knockback
  stops/slides at actual walls and does not push targets through roofs.
- Spell character: a controlled ricochet, arcing poison shot, or radial shove
  follows a predictable contact rule. A blast cannot affect an enemy through
  solid cover unless that spell explicitly permits it.
- Contact feedback: impact sound, brief sparks/dust and restrained camera/weapon
  reaction come from the resolved contact point and normal. Do not add UI work.
- Material response: stone/wood/metal affect friction, restitution and feedback
  through one material table; avoid making every collision a special case.
- Physical aftermath: a few bones/fragments tumble, hit the correct floor and
  settle. Pool and sleep them. Thousands of simulated fragments are not needed.
- Environmental motion: anchored banner sway or shield wobble can remain cheap
  secondary animation, driven by nearby impulses without full cloth simulation.

Each feature gets a correctness scenario and a measured budget before its entity
count grows. Consistency, responsiveness and clear feedback matter more than
simulating every visible item.

## 7. Test matrix: credible failures, explicit oracles

Every row needs a positive/negative control and demonstrated defect sensitivity,
not simply a test that the API returns an object. Use authored geometry first,
then replay equivalent situations in real generated worlds.

| Risk / scenario | Required result and how to prove sensitivity |
| --- | --- |
| High-speed shot crosses a one-cell wall between ticks | Analytic first contact lies on the near face, no damage behind it; replacing sweep with endpoint overlap must fail. |
| Near enemy / farther wall, then near wall / farther enemy | Only the earliest permitted contact resolves; reverse collection order and verify the result is unchanged. |
| Actor presses diagonally into a corner | No penetration, bounded iterations, useful sliding where space exists; disable normal projection or one wall and observe the intended failure. |
| Player, enemy and ally traverse the same ramp/door | Same support/headroom contract with their declared dimensions; deliberately losing enemy height tracking fails on a changing support, not a flat room. |
| Jump under a low ceiling, then jump beside a ledge | Head contact cancels upward velocity; landing happens on reachable support, without roof teleport or upward snap. |
| Cave enemy directly below a surface player/chest | No cross-roof contact, pickup or ordinary attack; same-height unobstructed control must succeed. |
| Crowd pushes the player against a wall | Player remains outside solids and attacks remain physically reachable; catch mismatched repel radius and weapon reach. |
| Lethal hit with regeneration enabled | Death event occurs once; next tick cannot revive through normal regeneration; explicit revival mechanic gets a separate case. |
| Projectile hits two bodies or overlapping colliders in one tick | One ordinary hit, or the declared piercing count; never duplicate damage due to collider enumeration. |
| Same recorded input at 30/60/120 render FPS and jitter | Same simulation-tick outcome within declared tolerances; changing render-rate input consumption must fail. Compare equal simulated time, not just equal frames. |
| Pause/restart during dash, attack windup or projectile release | No paused advancement, no stale action firing later, one active loop, reset accumulator and interpolation. |
| Chunk boundary during a jump, push or projectile flight | Stable world position/support/ID, no duplicated hit; stale cache and origin-sign mutations must fail. Include negative coordinates. |
| Coincident spawns, zero-length rays, absent support, NaN input | Finite output or explicit rejection; bounded recovery, no invented floor and no silent success. |
| Sleeping prop is struck after many quiet ticks | It wakes and collides correctly; resting bodies remain stable rather than jitter forever. |
| Dense arena and widely distributed population | Candidate growth and measured tick cost are explainable; replacing the spatial index with all-pairs must trip the workload gate. |

Add metamorphic checks: translating all bodies and terrain by whole chunks must
not change relative outcomes; permuting the body array must not change contact
resolution; changing render resolution must not change gameplay. Compare
deterministic results within the same engine/build first. Across engines, use
explicit numeric tolerances rather than promise bit-identical floating point.

Long-run replays check finite state, bounded penetration, bounded object/cache
counts, event uniqueness and eventual rest. Property-based seed sweeps should
save the smallest failing world/input trace. They supplement—not replace—the
readable hand-authored regressions. Do not bless new golden output without
explaining whether the behavioral change is intended.

## 8. Benchmark design and provisional budgets

Query microbenchmarks and a developer browser profile are available; see the
implementation checkpoint for measured results and limitations. The values below
are initial engineering targets, not established budgets for this machine, a
phone, or the current game. Benchmark where JavaScript runs: the browser client,
not the device merely serving the HTML. Confirm the lowest supported device
before finalizing hard performance gates.

At 60 FPS the frame deadline is about 16.67 ms; at 30 FPS it is 33.33 ms.
Provisional **whole-physics-tick** target on the chosen reference client: p95 at
or below 2 ms and p99 at or below 4 ms for the agreed normal workload. Rendering,
AI, generation and GC still need room in the frame. At 30 render FPS, two 60 Hz
physics ticks may share a frame: report per-tick and per-frame totals separately.

Instrument coarse stages with `performance.now()` and preallocated ring buffers:
input/intent, static query, broad phase, actor sweeps, support, pair solving,
projectile CCD, triggers/events, and streaming updates. Track calls, candidates,
contacts, iterations, active/sleeping bodies, pool misses and cache invalidations.
Separate nested timings from exclusive timings; never sum stage percentiles to
claim a total. Report p50/p95/p99/max, raw samples and deadline misses.

Proposed reproducible scene ladder (tune counts after the first baseline):

| Scene | Population / risk |
| --- | --- |
| Empty walk | Player plus terrain; fixed overhead and query cost. |
| Typical fight | Player, 20 enemies, 12 shots, 8 props; normal target budget. |
| Dense doorway | 60 actors concentrated in a few buckets; worst contact density, not just total count. |
| Spell storm | 120 projectiles plus 60 actors; CCD and target-query cost. |
| Settling debris | 100 props, then at least 80 asleep; verify sleeping reduces work without losing collisions. |
| Streaming traversal | Repeated positive/negative chunk crossings during motion and combat; report cold generation/assembly separately. |
| Extended replay | At least ten simulated minutes; cache/pool growth, stale IDs, slow leaks and worst spikes. |

For each steady-state case: warm up for at least five seconds, measure at least
30 seconds, run five paired repetitions of baseline/candidate with the same
seed and input. Alternate order to reduce thermal bias. Record engine/version,
device, power mode, resolution, render preset, counts and revision. Run serially
for timing claims. Background load and parallel test processes invalidate fine
millisecond comparisons. Cold runs get their own report.

Start with a candidate regression warning when p95 grows by both over 10% and
over 0.2 ms on the same device, or an absolute budget is exceeded. These numbers
must be calibrated against measured noise. Investigate repeated warnings; do
not silently move the threshold. Portable CI should also gate deterministic
work counts (candidates per body, iteration cap, pool growth) independent of
hardware speed.

Measure instrumentation-on versus off overhead, aiming below 2% initially. Keep
per-contact tracing opt-in and bounded; time broad stages, not every vector
operation. Use browser profiling for attribution and GC diagnosis; memory API
availability differs, so allocation counters and retained pool sizes are the
portable evidence. A headless engine benchmark isolates simulation cost but
cannot prove smooth Canvas rendering. Finish with actual browser frame cadence
and an interactive check on the slow reference client.

When over budget: identify the costly stage and its operation count; reproduce
it with a focused benchmark; optimize storage, query reuse, broad-phase density
or sleeping; rerun correctness and timing controls. Never discard gameplay
contacts to make the chart green. Scale cosmetic debris first. Consider a worker
or a third-party engine only if measured needs justify synchronization, transfer
and maintenance cost; neither is required for the initial design.

## 9. Delivery sequence and exit gates

1. **Baseline and contract.** Record existing movement/jump/reach behavior,
   agreed intentional changes, real browser baseline, workload sizes and target
   device. Add replay format and stage counters. Exit: baseline is repeatable;
   known defects are separated from desired behavior.
2. **Shared spatial queries.** Introduce canonical units, stable IDs, support,
   height-aware rays/overlaps and geometry revisions behind adapters. Migrate
   chest reach and one LOS consumer. Exit: cross-roof and origin-shift controls
   pass, with their mutations detected and no material query-cost regression.
3. **Shared actor controller.** Migrate player, then one enemy archetype, then
   all enemies/allies/companions. Exit: ramp, corner, headroom, crowd and
   frame-schedule tests pass; player feel is reviewed, not inferred from tests.
4. **Swept combat.** Migrate projectiles, melee reach and damage event ordering.
   Exit: thin-wall, first-hit, moving-target and exactly-once cases pass under
   spell-storm load. Resolve current lethal-hit/regen ordering explicitly.
5. **Bounded dynamic props.** Add impulses, material response, sleeping and
   pooling for one prop type. Exit: no penetration/energy growth, stable rest,
   wake-up correct, measured savings when sleeping.
6. **Polish and stress.** Add selected spell/contact feedback, long replays,
   streaming stress and reference-device performance gates. Exit: agreed
   workload fits its frame budget, controls still detect defects, no UI changes.

Ship in small reviewable slices. Keep old/new controller selection only as a
short-lived migration aid, not two permanent physics systems. Run relevant
shipping tests and adjacent integration suites per slice; avoid the full
cross-suite mutation matrix for every edit. Remove compatibility state only
after every consumer and saved-state path is accounted for.

## 10. Decisions before implementation

Recommended defaults: responsive arcade movement; 60 Hz simulation; current
movement feel preserved initially; projectiles/actors before props; a small
simulated debris budget; no new UI. Confirm the lowest supported browser/device,
desired simultaneous combat scale, which environmental objects should actually
move, and whether moving platforms/destruction belong in a later version.
Those choices affect budgets and scope, not the need for common spatial rules.

Delivered slices establish the spatial contract, cross-roof pickup/LOS, common
actor motion, and swept main projectiles. Do not mark whole roadmap phases done:
render-rate input parity, player feel review, full vertical sweeps, remaining
combat consumers/event ordering, and calibrated reference-device budgets still
need their own work and exit evidence. Dynamic props come after that foundation.
