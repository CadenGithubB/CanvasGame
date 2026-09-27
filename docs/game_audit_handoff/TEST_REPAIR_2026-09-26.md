# Audit-test repair and physics planning checkpoint

This checkpoint describes local test/tooling changes, not new shipping gameplay.
No commit or push was made for this repair. Keep the optional audit lab and local
handoff material uncommitted under the current project agreement.

## What changed

- The headless host now restores nested Canvas drawing state and initializes
  fresh scene depth for individual pass tests. Its tick helper honors Settings
  pause. New host tests deliberately break restoration/depth setup and reject it.
- Render fixtures use visible portal stand-off, an actual ore-bearing wall,
  downward camera aim for floor-level objects, and changing ceiling geometry
  rather than historical hard-coded closure colors.
- Terrain bleed is checked against an on-screen buried target before/after
  composed terrain depth. Merely counting submitted buried polygons is not a
  valid final-visibility oracle. Sloped surface tops above the horizon are not
  automatically backfaces; flat cap undersides retain their own check.
- Enemy floor tracking uses a restored-after-use shallow ramp. Flat procedural
  chambers could not expose a frozen height. Occlusion fixtures no longer require
  an unobstructed sight line as a prerequisite for testing occlusion.
- Cave chests are associated with unique chamber identities plus geometric
  containment. Current chunk-edge inset placement is legitimate; exact-center
  matching was stale. Multiple matching chest identities still fail.
- Cave reward scaling uses same-seed, same-reward-draw rarity interventions.
  The random-sample comparison had falsely suggested tier-blind gold scaled
  with tier. The new test retains the actual gold-scaling defect as a known bug.
- Broader deterministic samples preserve minimum coverage for cap loot, enemy
  worlds and every wall-face direction. Camera pitch now makes chest prompts
  visible in their real-frame interaction scenarios.
- Repeated wall-performance passes clear depth between views/frames instead of
  accumulating unrelated previous coverage. No browser frame-time claim is made.
- Removed verified fixed-defect entries, including underground-flag persistence
  and jump reset; added current BREAK probes for both repaired behaviors.
- Replaced obsolete render mutation snippets and browser mutation-page anchors.
  The latter were only built/checked headlessly, not validated against new pixels.
- Probe grading now rejects crashes, missing target IDs and setup failures as
  evidence of successful detection. Four focused protocol tests verify that rule.

## Verification

- Shipping gate: `python3 tools/game/dev.py test` — 95 tests passed.
- Full default web tooling/audit discovery — 329 cases, 121 passed and 208
  opt-in cases skipped. Known gameplay defects remain explicitly recorded; this
  does not mean every raw harness check passes.
- Four additional protocol-verdict checks, added after that discovery started,
  passed in a focused 22-test host/page/protocol run.
- Seven current render mutations were detected: missing floor, ceiling, enemy,
  ore, goal and portal paths, and missing opaque scene-depth writes.
- Rarity control: applying gold tier multipliers made all 44 paired cases pass.
- Enemy control: disabling real height tracking failed both ramp scenarios,
  without losing their fixture preconditions.
- Persistence controls: dropping the saved underground flag and omitting jump
  reset each reproduced their intended failure, with valid subjects.
- Exact source/header consistency remains intact. No production JS was edited.
- Pattern scan of 23 touched guidance/tooling/test files found no personal home
  paths, local username, email, private-key marker or common credential patterns.
  No values were exposed by the scan. This is not a complete security audit.

## Remaining work, not disguised as passing coverage

The historical opt-in matrix has **31 stale probe entries** in the inspected
top-level probe collections: browser 2, cave geometry 11, cave transition 9,
loot 5, performance 1, diagnostic tools 3. Other probes having valid anchors
does not prove their expected outcomes remain correct. Do not blanket-run or
claim that entire matrix is green; refresh one scenario family at a time and
prove causal behavior. The stricter grader may reveal additional invalid
historical expectations, especially probes whose intended purpose is testing
fixture validation itself.

Native browser pixel baselines/mutation outcomes and calibrated performance
benchmarks were not run. The user's live browser game was not refreshed.
Current game defects still include cross-roof interaction/awareness, loot reward
rules, enemy contact/attack behavior, fixed-level rendering and debug reporting.
Read the relevant `KNOWN_BUGS` plus current harness details, not old header line
numbers alone, before treating any of them as a current diagnosis.

## User's next direction

`assets/games/TESTING.md` records the requirement for meaningful, adversarial
tests. It is linked from game and web-tooling agent instructions.
`docs/game_physics_plan.md` is the proposed shared 2.5D spatial/physics system,
feature sequence, test matrix and benchmark protocol. Physics implementation
has not started. The lowest supported browser/client device is still needed
to calibrate the provisional timing budgets.
