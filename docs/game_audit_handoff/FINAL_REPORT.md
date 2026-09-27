# Endless crawler audit and test-lab final report

Date: 2026-09-20
Scope: `components/hardwareone/WebPage_Games.h`, its audit/test lab, and the supporting README update
Game source disposition: inspected only; no game H/CPP file was edited
Current-task disposition: no audit/test-lab file was staged or committed, and this task did not push, stash, reset, or rebase

## Executive result

The audit, suite implementations, adversarial reviews, seed closeouts,
real-browser checks, frozen-tree cross-suite matrix, and final aggregate gates
are complete. The matrix contains all 1,134 expected mutation/target cells with
zero structural errors; it records 20 collateral regressions and 53 beneficial
cross-suite flips. Two repeated all-suite snapshots have identical verdicts,
complete check records, and non-timing metrics.

The main conclusion is not that the game needs lower visual quality. It needs one
authoritative definition of world position, layer, floor, ceiling, volume, and
visibility. Today generation, physics, rendering, AI, loot, persistence, and
debug tooling often answer those questions independently. That duplicated
semantic work produces both the confirmed defects and much of the unnecessary
calculation.

## A. What is there to fix?

Fix one shared world/layer/entrance contract first, then hard state and gameplay
bugs, then entities and persistence, and finally performance and tooling.
Treat the findings as four repair waves, not a flat bug list.

1. **P0 — make spatial/layer truth authoritative.** Fix the cave entrance and
   layered-world contract first: D1/D2/D6/N14, followed by visibility and
   lighting D3–D10 and N13/N15. `queryCaveGeometry` is described as the single
   source of truth at `WebPage_Games.h:4628-4657`, but later systems bypass it:
   layer storage is at 6539-6570, `getFloorHeightAt` blindly returns l0 at
   7804-7822, physics selects separately at 7831-7901, and render has its own
   entrance/camera rules at 12550-12608 and 12691-12694.
2. **P0/P1 — repair hard gameplay and state failures.** D21 permits effective
   immortality: attacks clamp health to zero at 11271-11283, `step()` regenerates
   it at 10090 before the death check at 10333-10353; D23
   lets Settings Apply duplicate enemies; D24/N9 cover fixed-level rendering,
   Endless-state leakage, and clock-dependent goal spawning; N10/N11 cover the
   overlapping Apply hit area and first-frame control toggle; N1 makes movement
   and turning render-rate-dependent because input runs once per rendered frame
   at 21909-21910 while physics is fixed-step at 21912-21921.
3. **P1 — collision, entities, and rewards.** Fix D11/D12/D14 and N3/N4
   (fabricated h=0, micro-falls, missing cave sides, ceiling tunnelling, landing
   snap); D19/D20 and H2-H8 (identity, rebase, eviction, reset, bounded
   persistence); D22/N8 and the two newly confirmed loot defects. A surface-cap
   player can loot an invisible cave-floor chest because interaction is XY-only
   at 19426-19447. A same-ID/different-quality prompt says `Take` at 9395-9415
   while collection swaps, and can downgrade, at 20195-20211. Then address
   F1-F4/N2/F6/F7 for patrol, recovery, spawn footprints, attack reach, and
   layer-aware movement/LOS. N2 is concrete: push-out uses `12 + radius` at
   10034-10050, larger than attack reach `6 + radius` at 11370-11374.
4. **P2 — performance, tooling, and legacy cleanup after correctness.** Address
   G1-G8 and I1-I7, then isolate or remove fixed-level legacy. One confirmed
   visibility defect, D5, accounts for roughly 70% of the inside-cave quads, so
   correct occlusion should improve image quality and speed together.

## B. What is missing from a game-engine standpoint?

- A canonical spatial query such as
  `sampleWorld(wx, wy, actorZ) -> {layerId, floorZ, ceilingZ, volume, wallMask, material, visibility}`.
  Physics, render, AI, loot, lighting, and debug tools should all consume it.
  The current cave query and layer metadata at 4628-4789, 6539-6570, and
  6795-6825 are a strong start, but are not yet the universal contract.
- A real entrance/portal object. Entrances begin as only `{x,y,angle}` at
  4477-4486; depth, roof, ramp, mouth, cap hole, arch, and cull dimensions are
  re-derived in several systems. One immutable portal record and mask should own
  those values.
- Explicit state ownership and subsystem boundaries. The game is one inline
  raw-script block from 214-22516 with broad mutable globals beginning around
  705 and recurring through 950-1203. It needs small `World`, `Physics`,
  `Input`, `AI`, `Render`, `Persistence`, and `UI` modules operating on an
  explicit `GameState`; this does not require a full ECS.
- A deterministic input/simulation boundary. Capture actions once, consume them
  in fixed ticks, and render with interpolation. The current fixed-step loop is
  only half-finished because input remains render-rate-driven (21880-21921).
- A shared render contract: scene items and material IDs with explicit
  visibility/depth/painter rules across floor, ceiling, walls, and entities.
  They are currently independent passes at 18969-18980 and 21777-21800.
- Stable entity lifecycle plus versioned persistence: durable IDs,
  serialize/restore hooks, schema migration, and bounded ownership. Live
  enemies are rewritten into chunks at 7346-7385, partial deltas are saved at
  7388-7459, and chunks are deleted at 7463-7470; omitted state, array-index
  identity, and unbounded cache/delta ownership account for D19/H2/H3/H8.
- A normal source/build layer and observability. Author JavaScript modules,
  bundle/minify them into the firmware header, and generate the embedded
  artifact. Add seed/position/camera capture and replay, assertions, and
  truthful profiler/debug views.

## C. Would this be easy to develop for?

**Easy to experiment in; hard to evolve safely.** A localized content or visual
tweak is quick because everything is globally reachable and seeded terrain and
chunk generation are largely deterministic and order-independent. H7's
equipment-dependent relic selection and N9's clock-dependent goal spawn are
important exceptions. A cross-system feature is risky because coordinates,
height units, layers, visibility, and lifecycle rules are duplicated.

The probes provide direct evidence of hidden coupling: focused physics and cave
geometry mutations change checks in transition, render, loot, persistence, and
browser suites. That is an architecture problem, not a developer-skill problem.

The outlook is still good. The suite-local lab supplies seeded checks, causal
FIX and BREAK mutations, two-engine parity, real-browser pixels, and a complete
cross-suite mutation matrix. That is enough safety net to improve the design
incrementally. A rewrite or full ECS migration should not be the first move.

## D. How to make it shared and simpler without lowering quality

The useful phrase is **simplify semantics and data flow, not the visible result**.

1. Make the shared `WorldSample`/layer-query API the only route to spatial facts.
   Add common world/window, height/camera-Z, chunk, and cell transforms.
2. Generate each entrance once into an `EntrancePortal` record and precompute
   its mouth, cap, collision, and visibility masks during chunk assembly.
3. Split the source into modules while retaining one generated firmware payload.
   Centralize configuration and data tables; pass each subsystem only the state
   it owns.
4. Preserve pixels while removing redundant render work:
   - fix D5 and omit surfaces proven occluded;
   - precompute packed material/color and biome/noise values during assembly;
     the current floor path creates per-layer closures at 12703, parses color at
     12856, constructs RGB at 12872, and fills each quad through 12876;
   - batch only order-compatible quads/materials, move remaining per-face
     projection/offscreen rejection before buffering, and reuse typed scratch
     buffers (the coarse floor/wall frustum culls already run early);
   - add chunk-boundary hysteresis and incremental/double-buffered rebuilds.
     `updateChunks` synchronously rebuilds at 7474-7501; a 7×7 rebuild is
     estimated at about 17 MB, while measured rebuilds hitch 44-121 ms at 7×7,
     63-206 ms at 9×9, and 536 ms when switching to Ultra;
   - bound RGB/network/delta caches, keep debug views opt-in, and permit only one
     in-flight request in the 16 ms gamepad poll at 9772-9800;
   - gzip and cache the embedded page (current raw JS body 1,013,814 bytes,
     `gzip -9` 270,209 bytes)
     without any visual compromise.
5. Use stable entity IDs and a versioned semantic delta journal: for example,
   `enemy:<id> dead` or `chest:<id> swapped quality`, not mutable array indices.
6. Snapshot keyboard/mouse/gamepad actions and drive them from simulation time;
   this fixes N1 and enables deterministic replay without reducing response.

Do **not** begin by lowering view distance, resolution, effects, or cave density;
enlarging the floor buffer; caching the incorrect l0 answer; deleting the painter
sort wholesale; or launching a full ECS/WebGL rewrite. The audit found enough
wasted work and duplicated logic to gain speed and simplicity while preserving,
and likely improving, visual quality.

## Lab evidence summary

| Suite | Checks / documented FAILs | Probes | Final local evidence |
|---|---:|---:|---|
| physics | 16 / 12 | 15 total; 10 unique matrix FIX | base 12.189 s; probes 48.826 s; deterministic jsc; JXA status parity; final sweep 4/16 with no flips or preconditions |
| caves_geometry | 19 / 13 | 21 (13 FIX) | base 12.467 s; probes 246.498 s; deterministic jsc; JXA status parity; final sweep 6/19 with no flips or preconditions |
| caves_transition | 33 / 24 | 21 (10 FIX) | base 5.7 s; probes 120.2 s; jsc 5.79/5.76 s; JXA 67.2 s; final sweep 12/33 with three explained seed-dependent flips |
| render | 24 / 18 | 26 (16 FIX, 7 BREAK, 3 OTHER) | base 19.287 s; probes 425.082 s; jsc 16.747/18.770 s; JXA 222.886 s |
| enemies | 18 / 13 | 18 (12 FIX, 6 BREAK) | base 15.012 s; probes 275.998 s; jsc 15.243/17.635 s; JXA 182.471 s |
| persistence | 31 / 23 | 36 (24 FIX, 12 BREAK) | base 9.99 s; probes 369.25 s; jsc 9.784/9.977 s; JXA 152.840 s |
| loot | 18 / 5 | 25 (9 FIX, 15 BREAK, 1 OTHER) | base 16.98 s; probes 413.11 s; jsc 22.585/17.944 s; JXA 258.058 s |
| perf | 20 / 16 | 28 (15 FIX, 7 BREAK, 6 OTHER) | base 35.296 s; probes 889.417 s; jsc 36.159/37.664 s; JXA 272.205 s |
| tools | 25 / 19 | 29 (17 FIX, 12 BREAK) | base 5.717 s; probes 163.236 s; jsc 5.520/5.458 s; JXA about 63.5 s |
| browser headless | 11 / 0 | 5 BREAK; 0 FIX | base 4.998 s; probes 28.103 s; jsc 4.533/4.823 s; JXA 51.587 s |
| browser Chrome | 14 / 7 | 13 mutation pages | strict default grader 4/4 OK; all targeted mutation statuses matched |
| smoke | 13 / 0 | N/A | final 13/13 PASS in 0.7 s; included identically in both frozen snapshots and both discovery gates |

Every default jsc run was below the 60-second suite budget. Engine parity means
identical check IDs and PASS/FAIL status; JXA-specific NOTE text is not treated
as a game verdict. Seed coverage and dispositions, review resolutions, and
threshold rationales are retained in `HANDOFF.md` section 4.6; commands whose
exact spelling matters are reproduced in this report's completed evidence
sections.

The final prescribed closeout commands were:

```sh
HW1_GAME_JOBS=1 python3 -m tools.webui.game_lab physics -v \
  --seeds 12345,1 --endless-seeds 424242,777,31337
HW1_GAME_JOBS=1 python3 -m tools.webui.game_lab caves_geometry -v \
  --seeds 12345,1,777,424242 --endless-seeds 424242,999983,123
HW1_GAME_JOBS=1 python3 -m tools.webui.game_lab caves_transition \
  --seeds 12345,1,777,424242
```

Physics retained 4/16 PASS in 20.784 s versus 13.267 s for its comparison
default, with no verdict flips or `PRECONDITION`. Caves geometry retained 6/19
PASS in 12.132 s versus 12.170 s, also with no flips or preconditions. Caves
transition produced 12/33 PASS in 6.500 s versus the default 9/33 in 5.668 s,
with no preconditions. Its three expected FAIL-to-PASS changes were seed-set
dependent: the cap walk, jump landing, and walk-in sink defects remain pinned by
the default ct31337/ct98765 coverage and were not reclassified.

## Reproducible command set

For each headless suite `<suite>` (including `browser`; `smoke` has no probe
registry):

```sh
HW1_GAME_JOBS=1 python3 -m unittest tools.webui.tests.test_game_<suite> -v
HW1_GAME_JOBS=1 HW1_GAME_PROBES=1 \
  python3 -m unittest tools.webui.tests.test_game_<suite> -v
HW1_GAME_JOBS=1 python3 -m tools.webui.game_lab <suite> -v
```

Fresh JXA parity run (replace `<suite>`):

```sh
python3 -c 'import tools.webui.js_engine as j; j.JS_ENGINE=("jxa","/usr/bin/osascript"); from tools.webui import game_lab; r=game_lab.run_harness("<suite>"); print(r.stdout)'
```

Real-browser grading:

```sh
python3 -m tools.webui.game_page \
  --out /private/tmp/hw1-browser-final/default --autorun
python3 -m http.server 8000 --bind 127.0.0.1 \
  --directory /private/tmp/hw1-browser-final
HW1_GAME_BROWSER_RESULTS=docs/game_audit_handoff/evidence/lab_runs/final_browser_default.txt \
  python3 -m unittest tools.webui.tests.test_game_browser.BrowserResultsGrading -v
```

The 13 mutation pages were generated from the test-owned mutations and exact
per-page seed metadata with:

```sh
python3 -c 'from pathlib import Path; from tools.webui import game_page; from tools.webui.tests.test_game_browser import BROWSER_PROBES,browser_probe_page_kwargs; root=Path("/private/tmp/hw1-browser-final"); [game_page.build_page(root/("probe_%02d"%i),**browser_probe_page_kwargs(i)) for i in range(len(BROWSER_PROBES))]'
```

The saved output was an unmutated page-start run with seeds 12345/424242, all
seven views, Chrome 152 provenance, and `HARNESS_RESULT FAIL 7`; all seven
failures are the documented current browser defects. Its three repeated debug
frames were pixel-identical in all 14 seed/view scenes. The 13 raw mutation-page
results are in `evidence/lab_runs/final_browser_probes.txt`.

The browser work also found a lab-specific Chrome behavior: after the exact page
`renderFrame()` path, Canvas2D can move between raster/readback paths and blend
the first captured frame differently. The driver now performs four sacrificial
draw/readbacks for every placed view, not merely once per page; the unchanged
three-frame equality check still rejects continuing nondeterminism.

## Frozen-tree cross-suite matrix

All commands use `HW1_GAME_JOBS=2`, one filtered matrix process at a time. The
matrix intentionally returns exit status 1 when it records a collateral
PASS-to-FAIL flip, while still writing valid JSON.

Exact commands (line-wrapped here only for readability):

```sh
HW1_GAME_JOBS=2 python3 -m tools.webui.game_probe_matrix --probes loot --against caves_geometry caves_transition physics render enemies persistence perf tools browser --kind fix --json docs/game_audit_handoff/evidence/lab_runs/final_matrix_loot.json
HW1_GAME_JOBS=2 python3 -m tools.webui.game_probe_matrix --probes physics --against caves_geometry caves_transition render enemies persistence loot perf tools browser --kind fix --json docs/game_audit_handoff/evidence/lab_runs/final_matrix_physics.json
HW1_GAME_JOBS=2 python3 -m tools.webui.game_probe_matrix --probes caves_transition --against caves_geometry physics render enemies persistence loot perf tools browser --kind fix --json docs/game_audit_handoff/evidence/lab_runs/final_matrix_caves_transition.json
HW1_GAME_JOBS=2 python3 -m tools.webui.game_probe_matrix --probes enemies --against caves_geometry caves_transition physics render persistence loot perf tools browser --kind fix --json docs/game_audit_handoff/evidence/lab_runs/final_matrix_enemies.json
HW1_GAME_JOBS=2 python3 -m tools.webui.game_probe_matrix --probes caves_geometry --against caves_transition physics render enemies persistence loot perf tools browser --kind fix --json docs/game_audit_handoff/evidence/lab_runs/final_matrix_caves_geometry.json
HW1_GAME_JOBS=2 python3 -m tools.webui.game_probe_matrix --probes perf --against caves_geometry caves_transition physics render enemies persistence loot tools browser --kind fix --json docs/game_audit_handoff/evidence/lab_runs/final_matrix_perf.json
HW1_GAME_JOBS=2 python3 -m tools.webui.game_probe_matrix --probes render --against caves_geometry caves_transition physics enemies persistence loot perf tools browser --kind fix --json docs/game_audit_handoff/evidence/lab_runs/final_matrix_render.json
HW1_GAME_JOBS=2 python3 -m tools.webui.game_probe_matrix --probes tools --against caves_geometry caves_transition physics render enemies persistence loot perf browser --kind fix --json docs/game_audit_handoff/evidence/lab_runs/final_matrix_tools.json
HW1_GAME_JOBS=2 python3 -m tools.webui.game_probe_matrix --probes persistence --against caves_geometry caves_transition physics render enemies loot perf tools browser --kind fix --json docs/game_audit_handoff/evidence/lab_runs/final_matrix_persistence.json
```

| Source suite | FIX probes × targets | Seconds | Collateral PASS→FAIL | Beneficial flips | Evidence |
|---|---:|---:|---:|---:|---|
| loot | 9 × 9 | 673 | 0 | 0 | `evidence/lab_runs/final_matrix_loot.json` |
| physics | 10 × 9 | 788 | 3 | 12 | `evidence/lab_runs/final_matrix_physics.json` |
| caves_transition | 10 × 9 | 804 | 3 | 5 | `evidence/lab_runs/final_matrix_caves_transition.json` |
| enemies | 12 × 9 | 903 | 0 | 1 | `evidence/lab_runs/final_matrix_enemies.json` |
| caves_geometry | 13 × 9 | 1,011 | 6 | 19 | `evidence/lab_runs/final_matrix_caves_geometry.json` |
| perf | 15 × 9 | 956 | 0 | 0 | `evidence/lab_runs/final_matrix_perf.json` |
| render | 16 × 9 | 1,160 | 7 | 12 | `evidence/lab_runs/final_matrix_render.json` |
| tools | 17 × 9 | 1,274 | 0 | 0 | `evidence/lab_runs/final_matrix_tools.json` |
| persistence | 24 × 9 | 1,755 | 1 | 4 | `evidence/lab_runs/final_matrix_persistence.json` |

The browser harness has zero headless FIX probes, so a browser-source matrix is
not applicable; it remains a target in all nine rows. Physics has 14 ordinary
probes plus one sweep-only probe; that sweep mutation is byte-identical to
physics probe 11, so the ten unique FIX mutations provide complete matrix
coverage. Total frozen-tree scope is 1,134 mutation cells plus 81 baselines.
All 1,134 cells are present exactly once across the nine JSON files, with zero
harness-error rows, missing cells, duplicate cells, or missing expected checks.
The aggregate outcome is 20 collateral regressions and 53 beneficial flips;
`evidence/lab_runs/final_matrix_validation.txt` records the structural audit and
frozen-tree fingerprint.

Physics' three regressions all come from probe 2, which treats the D11
no-walkable sentinel as a wall: it prevents the transition suite's complete
walk-in/out route and makes the render suite's real cave-walk error and canvas
balance checks fail. Its 12 beneficial flips repair related lateral, ramp,
spawn, GFH, restart, and persistence observables. The matrix therefore says the
D11 step-side fix is directionally useful but must ship with coordinated
transition/render work, not alone.

Caves-transition likewise has three regressions: its D12 edge-fall guard makes
the physics suite miss a real large drop, while fully capping the entrance
mouth prevents the loot suite's walk-to-chest route and invalidates a tools
wireframe comparison. Five beneficial flips cover gentle-slope stability,
arch-floor rendering, clean restart state, and chunk-boundary hysteresis.

Enemies has no cross-suite regressions. Its only collateral flip is beneficial:
preserving an enemy's underground flag fixes persistence's window-shift check.

Caves-geometry has six regressions: widening the cap hole invalidates two
browser scene-placement checks; opening the approach roof prevents the loot
suite's floor-level cave-chest offer in two probes; and the combined interior
depth fix breaks one complete transition walk and one buried-surface render
check. Nineteen beneficial flips repair related transition, render, and tools
observables, so these geometry changes need one coordinated entrance contract.

Performance has no cross-suite verdict flips in either direction across its 15
FIX probes. That is strong evidence of behavioral isolation within the lab, but
it does not replace ESP32/browser frame-time measurement.

Render has seven regressions, all tied to changing the independently inferred
entrance roof/cap boundary: transition walk completion, loot reachability, and
one underground debug comparison fail under otherwise plausible visual fixes.
Its 12 beneficial flips improve geometry, transition/lighting, tools accounting,
and enemy floor tracking. This is the clearest matrix evidence for making the
entrance/visibility contract shared before repairing individual draw passes.

Tools has no cross-suite verdict flips in either direction. Its 17 fixes are
observability-only at the current lab surface, which is the desired isolation
for diagnostic code.

Persistence has one regression: changing the initial window from the hard-coded
seven chunks to the saved five-chunk setting changes the seeded surface-chest
population enough to fail loot's tier-gold comparison. Its four beneficial
flips cover wall-safe enemy generation, underground-state preservation, and
fresh-world jump state in transition/physics.

## Review dispositions, corrections, and limits

- The rejected review prescriptions are: expanded cave-transition seeds
  disproved the proposed D1/N4, D2, D1+D2, and D1+D14 fixes (the containment
  version also exceeded the per-run budget); render's proposed `>=50`
  outward-pixel threshold had 796 and 400 open-approach cells but zero
  qualifying below-horizon quads; render E8 was rejected as one
  mixed-mechanism verdict; persistence's normal-Endless calibration and
  a headless user-seed UI check were unreachable scaffolds; and tools seed 275
  alone could not reach the cave floor or nearby wall faces, so it was rejected
  as unsuitable coverage. N15 and F6 were redirected to their owning suites,
  not dropped.
- New confirmed defects include N1-N17 plus the invisible cross-layer chest
  interaction and misleading same-item/different-quality Take/Swap prompt
  described above.
- Original audit claims E2 and E3 were not reproduced. D12, D13, D15, D23,
  D24, D25, cave rarity, F3, and D4 were corrected or narrowed; exact
  dispositions are in `HANDOFF.md` section 3.12.
- Headless performance checks establish work counts and allocation structure,
  not ESP32/browser GPU frame time. Hardware latency, gzip/cache behavior on the
  device, and product intent still require device/product decisions.
- Coverage does not include real ESP32 transport or physical gamepad, IMU,
  mouse, touch, and 2D-mode behavior; it imposes no end-device frame-time
  budget. Normal Endless coverage is seed-limited to selected/nearest cave
  networks, Cave Test forces a plains setup, fixed levels other than the
  targeted Level 1/4 paths are not broadly covered, and virtual sessions are
  generally shorter than about 40 seconds.
- The lab documents current bugs as expected failures; a green unittest run
  does not mean the game is bug-free or that those failures are acceptable.

## Final integration evidence

The final frozen-tree gates completed on 2026-09-20:

```sh
HW1_GAME_JOBS=1 python3 docs/game_audit_handoff/evidence/audit_scripts/snap_verdicts.py \
  docs/game_audit_handoff/evidence/lab_runs/final_snapshot_a.json
HW1_GAME_JOBS=1 python3 docs/game_audit_handoff/evidence/audit_scripts/snap_verdicts.py \
  docs/game_audit_handoff/evidence/lab_runs/final_snapshot_b.json
HW1_GAME_JOBS=1 python3 -m tools.webui.game_lab smoke -v
HW1_GAME_JOBS=1 python3 -m unittest discover -s tools/webui/tests -t . -p 'test_game*.py'
HW1_GAME_JOBS=1 python3 -m unittest discover -s tools/webui/tests -t .
HW1_GAME_BROWSER_RESULTS=docs/game_audit_handoff/evidence/lab_runs/final_browser_default.txt \
  python3 -m unittest tools.webui.tests.test_game_browser.BrowserResultsGrading -v
```

- Snapshots A and B ran all 11 suites serially in 142 s and 141 s. Their suite
  keys, verdicts, ordered `[id, ok, detail]` records, and all genuine non-timing
  metrics are identical. The durable comparison is
  `evidence/lab_runs/final_snapshot_validation.txt`.
- Smoke passed 13/13 checks in 0.7 s.
- Serial `test_game*.py` discovery passed 299 tests in 149.090 s with 228
  expected probe skips. Full `tools/webui` discovery passed 337 tests in
  143.389 s with the same 228 expected skips.
- The saved real-Chrome default result passed all four strict grading tests in
  0.004 s, and the separately saved 13 mutation-page runs all matched their
  declared targeted statuses.
- The final `tools/webui` plus `WebPage_Games.h` SHA-256 manifest fingerprint is
  `9ffbcf95a62ab0217fce616b2004725b38f5fe663602e669293549c1a8a11a6e`,
  unchanged from the matrix runs. `git diff --check` is clean; neither game
  H/CPP file has a diff; nothing is staged; and the lab, evidence, handoff, and
  visual-pipeline files remain untracked as requested. `tools/webui/README.md`
  is the sole tracked modification and its commands match the final CLIs.

Incomplete audit/lab work: none. Game fixes were intentionally not applied.
Real-device performance, transport, physical-input, and product-intent
validation remain outside this audit's scope.
