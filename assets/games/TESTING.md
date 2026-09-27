# Game testing: evidence, not a green scoreboard

This is durable guidance for people and agents changing this game. The user's
priority is to catch plausible player-visible failures, including failures we
can anticipate, without buying unnecessary runtime cost. Test count is not a
quality target. The physics roadmap is in `docs/game_physics_plan.md` at the
repository root; it is a proposal, not permission to implement every feature.

## What earns a regression test

Start with a concrete risk: a fast missile crosses a wall, a chest is picked up
through a roof, a chunk shift changes support, an enemy freezes when a flag is
lost, or an expensive query becomes quadratic. Specify the observable contract
before implementation. A useful test has:

1. A named failure mechanism or player scenario.
2. A fixture that provably reaches it: movement actually occurs, a target is
   on-screen, a wall is crossed by the proposed motion, or the two bodies occupy
   different vertical spaces. Missing coverage is a setup failure, never PASS.
3. An independent expectation: authored geometry, an analytic answer, a player
   outcome, or an invariant. Do not compute the expected answer with the helper
   being tested, reproduce its algorithm, or merely assert its own output fields.
4. A positive control and a negative control where practical. An occlusion test
   must prove that the same target is visible without the occluder. A ramp test
   must prove support actually changes. A pickup test includes an accessible
   chest as well as one behind a solid barrier.
5. Evidence of sensitivity: recreate the historical defect or inject a small,
   plausible mutation into a temporary copy. The intended assertion must fail
   for the intended reason, not because the scenario crashed or generated no
   subjects. After a repair, the same scenario must pass without changing its
   expected outcome.
6. A useful failure artifact: seed, input tick, body IDs, geometry revision,
   expected/actual result, tolerance, and a short replay trace.

Do not mutate shipping files to run a mutation test. Anchors must match exactly
once, with a loud error when source changes. Do not silently drop stale probes.
An opt-in test that was not run is unverified, not coverage that passed.

## Test the actual game

Use the production query/movement code and seeded world generator. Small authored
fixtures are desirable for isolation, but also run representative generated-world
and real-loop integration scenarios. Mock browser/device transport and clocks as
needed; do not mock away the collision or support decision being tested.

Seeded randomness makes a scenario reproducible, not automatically valid. Assert
the scenario's prerequisites. Keep fixed regression seeds and add a separate
seed sweep that preserves and minimizes failures. Use paired inputs when testing
causality: holding all random draws fixed while changing chest rarity is stronger
than hoping two unrelated sample means differ enough.

The headless Canvas host is not a browser rasterizer. It must honor state that
affects recorded output (notably save/restore, alpha and fresh scene depth), and
its own tests must demonstrate failures when those contracts are broken. A count
of submitted polygons does not prove final visibility: later depth-tested draws
can cover them. Sloped terrain tops above the horizon are not necessarily exposed
undersides. Use geometry/depth tests for occlusion and actual browser pixels for
claims about final appearance, clipping, compositing, or frame time.

Do not weaken thresholds just because procedural content changed. First inspect
why the fixture no longer exercises the behavior. Replace stale assumptions with
valid geometry or sampling and rerun sensitivity controls. If an intended
contract changes, rename the test, explain the new contract, and account for the
old risk elsewhere. Example: ore must now attach to a real wall; a free-floating
ore record is no longer a valid visibility fixture.

## Layers of evidence

- Small analytic/unit contracts: support, height intervals, sweeps, contacts,
  unit conversion, deterministic ordering. Fast and exhaustive around boundaries.
- Real subsystem scenarios: actor slides, projectiles hit the first obstruction,
  loot is reachable, and events happen exactly once.
- Whole-game replays: input, fixed ticks, combat, pause/restart and chunk shifts.
- Browser checks: composed visuals, visible debug geometry, end-to-end cadence,
  allocations/GC effects and interactive feel. Do not refresh a user's positioned
  live game to run tests; use an explicitly separate test page.
- Performance experiments: controlled workload plus stage timings and operation
  counters. Separate cold generation, steady simulation, rendering, and streaming.

Characterization tests describe existing behavior; they do not automatically
declare it desirable. Named known defects belong in an explicit ledger with a
precise reason and reproducer. Setup failures and exceptions cannot be hidden
by that ledger. Remove a repaired defect's expected-failure entry only after
verifying its scenario still has subjects and detects a reintroduced defect.

## Performance and reporting rules

Use real monotonic elapsed time for performance; use a controlled simulation
clock for determinism. Never present timings from the headless fake clock or
stubbed Canvas as browser performance. Collect per-stage p50/p95/p99/max,
workload counts, frame deadlines missed, and instrumentation overhead. Do not
sum percentiles from different stages. A stage's percentage share alone is not
a regression budget.

Keep benchmark environment, resolution, seed, input replay, active body counts,
browser/engine version and warm-up identical for comparisons. Repeat runs and
report noise. Count-based complexity checks can gate portable CI; millisecond
budgets require a calibrated device. Physics may not drop contacts, damage,
collision candidates or support checks merely to meet a timing target. Reduce
optional cosmetic work first, with visible counters for every fallback.

Before a commit: inspect the exact staged diff and metadata for personal paths,
usernames, emails, tokens and machine-local artifacts. Stage explicit paths.
The standalone 0.0 snapshot includes the audit lab and sanitized handoff
material at the owner's request. Review future evidence for private data before
publishing; raw local captures do not belong in commits.

## Definition of done for a behavior change

Explain which risk is covered, show the unbroken scenario passing and its
targeted defect being detected, run the relevant neighboring scenarios, then
run the shipping gate (`python3 tools/game/dev.py test`). If production sources
changed, regenerate the header first. State known defects, skips, unrun browser
checks and unmeasured performance explicitly. Never summarize an expected-failure
audit as “the game has no bugs.”
