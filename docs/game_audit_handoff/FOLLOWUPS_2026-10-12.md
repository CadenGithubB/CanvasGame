# Follow-ups after the merged-tree lab refresh (2026-10-12)

This is the open-work list for `codex/merge-all` after the five feature branches
(3D integration, particle effects on spell visuals, held staff rig, water system,
classic floor fix) and the follow-up fixes (water reserve, D25 floor buffer) were
merged, and the audit lab was refreshed in six passes. Hand any item to an agent
on its own `codex/` branch from `codex/merge-all` (or from `main` once it has been
fast-forwarded). Nothing here is pushed.

Read first: root `AGENTS.md`, `assets/games/AGENTS.md`, `assets/games/TESTING.md`,
`tools/webui/AGENTS.md` and `docs/game_lab_guide.md`.

## State this list was written against

- `codex/merge-all` at `0be469b` ("Record the frozen-tree lab protocol results").
- Core gate: 367 tests OK under jsc
  (`PATH=/usr/bin:/bin:/usr/sbin:/sbin python3 tools/game/dev.py test`) and under
  Deno (normal PATH).
- Audit lab: all 15 `tools.webui.tests.test_game_*` modules pass in standard and
  probe mode (`HW1_GAME_PROBES=1`) with known bugs failing for their documented
  reasons. Command, from the tree root:
  `PATH=/usr/bin:/bin:/usr/sbin:/sbin HW1_GAME_JOBS=1 python3 -m unittest tools.webui.tests.test_game_<suite> -v`.
- Frozen-tree protocol (`docs/game_lab_guide.md`): full cross-suite FIX matrix,
  determinism pair and JXA parity were run for every suite; one problem remains
  (A4 below), and the guide lists what was not run.

## A. Audit lab follow-ups

A1. **Real-browser pixel gate cannot complete its default run.**
`startCaveTestViaPage` (`tools/webui/harness/game_browser_driver.js`, about
lines 312-329) sets `window._caveTestSeedOverride` and then dispatches the
`terrainSelect` change event; the page's handler
(`assets/games/src/23-events-init.js`, about line 76) then overwrites the override
with 12345 (5668 for hillside). The default two-seed autorun (12345 and 424242,
seven views) therefore aborts with "Cave Test did not start with seed 424242",
and BrowserResultsGrading fails all four tests. The headless browser suite cannot
see this because it injects `LAB.startCaveTest`. Present since 0.0.
A single-seed (12345) run graded against `BROWSER_KNOWN_BUGS`
(`tools/webui/tests/test_game_browser.py`) showed: five known bugs now pass
(ceiling inside the tunnel, no sky/grass/cap overhead, archway and ramp cave
floor, cap bleed); the inside_out ceiling entry fails with "top ceiling=0.22%",
which its regex `top ceiling=0\.00%` does not match; and "looking back out from
inside the tunnel includes the cave entrance arch" fails (arch=0.00% at
along=-60) and is not in the ledger. `BROWSER_PROBES` #5 ("BREAK: portal geometry
is missing") is vacuous (the baseline already fails it), and #4 meets two of its
declared FAILs only through "PRECONDITION FAILED: frame is blank".
To do: make the driver honour its seed (set the override after the handler, or
use the page's own Cave Test control), add a headless test that drives the real
`terrainSelect` path with a non-default seed, run both seeds in a real browser,
rebaseline `BROWSER_KNOWN_BUGS` (retire the five, re-pin the inside_out regex,
triage the arch failure as a game or driver defect), replace probe #5 and give #4
non-precondition witnesses. Never refresh a user's positioned game; use a
separate test page.

A2. **Physics seed sweep voids four checks; two hide the void.**
`game_lab physics --seeds 12345,1 --endless-seeds 424242,777,31337` turns four
checks PASS->FAIL (same at `c6851a4`): window-shift world position
("cave1@60fps/30fps: PRECONDITION FAILED no window shift in 600 frames"); stale
floor height across a shift and wallFaceBase after a shift, both failing with no
PRECONDITION marker and details showing 0 stale reads/faces; and the walk-off drop
check ("entered 3/3 drops ... need >= 5", all from the endless424242-far window).
Cause: `tools/webui/harness/game_physics_harness.js` (about line 667) counts a
world that never shifts against c1, c2 and c3 but writes the marker only into
c1's detail. Cave Test seed 1's line is chosen against `isInGridWall` only; the
player stops after about 12 u while holding W and never reaches it.
To do: mark (or gate out) worlds without a shift or line in the c2/c3 details;
make line selection reject starts the player cannot walk out of (a trial walk
with a minimum distance); give the drop fixture subjects outside the
cave-network-centred windows; rerun the sweep and record the result.

A3. **Cave transition seed sweep voids five checks.**
`game_lab caves_transition --seeds 12345,1,777,424242` voids both network
corridor-walk checks ("only 5 corridor(s) walked on a roofed floor": the gate in
`tools/webui/harness/game_caves_transition_harness.js`, about line 1239, needs at
least 6 per Cave Test world, but these networks have 5 corridors) and the three
window-shift motion checks ("ct777: no 60 Hz window re-centre on level ground
near or inside a cave", about line 1177). Same at `c6851a4`.
To do: gate corridors on each network's own corridor count (every corridor
walked); find a level 60 Hz re-centre for ct777 or prescribe seeds that reach
every check, with the reason recorded; rerun the sweep.

A4. **Enemies FIX F3 spawn-site probe voids the reverse-roof check (open
protocol item).** In `tools/webui/tests/test_game_enemies.py` (about lines
310-314) the probe "FIX F3 at the spawn site: require the 3x3 block around the
spawn cell open" declares only `{_EMBED: 'PASS'}`, but under it the reverse-roof
check fails with "PRECONDITION FAILED: only 2 valid pairs": the gate is
`RROOF.pairs >= 3` (`tools/webui/harness/game_enemies_harness.js`, about line
1247) and the baseline sits exactly at 3 ("0/3 chased the player through the
roof"). Both D16 probes void the same check. Also, both stuck F2 (patrol) enemies
sit in windows re-centred on cave networks, so FIX D16 makes the F2 known bug
read PASS (52/52).
To do: give the reverse-roof fixture more than its 3-pair floor (more worlds or a
larger per-world cap) and re-matrix FIX F3 and the D16 probes; until then record
the collateral beside the probes; pin the F2 witnesses to fixed windows that do
not depend on cave-network placement.

A5. **Cave geometry has no real seed sweep.** The sweep prescribed in
`tools/webui/tests/test_game_caves_geometry.py` (about line 182) repeats the
harness defaults (`game_caves_geometry_harness.js` lines 55-56). Prescribe seeds
outside the defaults (other Cave Test seeds; Endless such as 777000, 1, 31337),
run it, and record or repair any voids.

A6. **Lab guide points at a stale handoff.** `docs/game_lab_guide.md` (about lines
376-378) calls `docs/game_audit_handoff/HANDOFF.md` the home of "current
documented findings", but HANDOFF.md is the 0.0 record (for example it lists
render with 24 checks and claims clean physics and cave transition sweeps). Say
that HANDOFF.md is historical and that current findings are each suite's
`KNOWN_BUGS` plus the guide's frozen-tree section.

A7. **Protocol coverage still owed** (the guide lists these as not run):
own-suite matrix cells for the render, loot, perf, persistence and tools FIX
probes (an undeclared flip inside the probe's own suite was not looked for; that
is the kind of flip found in A4); env determinism and JXA parity; seed sweeps for
physics, enemies, cave milestone, cave geometry, cave transition and env; and the
real-browser pixel gate (A1). The loot `_WALK` known-bug regex requires every walk
to fail and does not match on the 12345,1,777 sweep (on seed 1 the walker rests
24.5 u out, beyond the 18 u cutoff, and sees the prompt); revisit it with B2.

A8. **`LAB.tick` never advances the simulation clock.** Making it advance broke
the persistence `RESTART_RESETS` setup in a trial; it needs cross-suite triage.
The env comment documents the current behaviour.

## B. Game defects recorded as known bugs (not fixed)

B1. **River carve leaves unclimbable steps** (caves_geometry `KNOWN_BUGS`
`C_LEVEE`; introduced with the water system). `carveWaterRivers`
(`assets/games/src/06-water.js`) can raise a levee point by up to
`WATER_MAX_FILL` (1.0 h) beside a point it leaves almost unchanged, a step above
`STEP_UP`; `getWalkableLayerTopAt` then answers "blocked", so the player cannot
climb some river banks.

B2. **No prompt beside a cave chest** (loot `KNOWN_BUGS` `_WALK`; present since
0.0). An offered chest (in range and reachable, so A/E loots it) shows no prompt
within about 18-22 u: its only prompt is the floating label from
`drawTreasureChestLabel` (`assets/games/src/07-decorations-lighting.js`), which
projects below the canvas even at full downward pitch.

B3. **Enemies stay stuck after a chase on sloped patrol routes** (enemies
`KNOWN_BUGS` F2; present since 0.0). Endless waypoints carry no height, so
`_patrolEnemy` (`assets/games/src/11-enemies.js`) plans to the enemy's own feet
height, and the route planner refuses a height change on its first off-grid hop.
See the F2 entry for the R1/R2 witnesses.

B4. **Cave mouths all face one way** (caves_geometry `KNOWN_BUGS` `C_ANGLE`, D16;
present since 0.0). In `generateCaveNetwork` both draws come from
`chunkRng(rx, ry, 100)`, and a network exists only when the first draw is at most
0.30, which `entryAngle = rng() * 2pi` reuses, so mouth bearings are biased.

## C. Decisions and sign-off owed by the owner

- **Unified effects** (`docs/game_audit_handoff/PARTICLE_SYSTEM_2026-09-28.md`):
  visible-foreground timing targets T1-T10 (T10 is allocation sampling), Safari
  and phone checks, the raster-cost calibration decision for the governor, the
  per-family art review, the two implemented deviations (own sprite LRU,
  back-projection), Q12, and S10 cleanup of the old effect code.
- **3D integration look**: spawner obelisk stone renders grey instead of purple;
  floor props look about twice as tall as the old half-sunk sprites; the
  fullscreen row cap (360) also applies in Legacy.
- **Water**: objects generated inside deep lakes (chests, shrines, sometimes
  market stalls) are nearly invisible under the Recommended preset; fixing it
  means changing seeded world generation. Also not done: fountains, an underwater
  tint, water outside Endless, and the 12 u colour squares that show as a faint
  staircase along diagonal river beds.
- **Classic levels in 3D**: on Ground and Ice the player's feet do not follow the
  terrain, so the eye can end up under hills; the stream-bed carve in classic
  water generation never takes effect. Both are gameplay decisions.

## D. Verification not yet done

- A real browser pass was made on a separate test page (Endless with both
  presets, a fortress, a lake and river, classic Expanse in 3D; no console
  errors), but the browser pane was hidden, so only CPU frame cost was measured
  (about 9 ms per frame at 360x240 under both presets). Visible-foreground frame
  timing and GPU cost are still owed.
