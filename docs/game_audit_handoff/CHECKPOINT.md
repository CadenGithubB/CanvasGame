# HardwareOne game audit checkpoint

Date: 2026-09-20
Repository: `.`

## Current state

### Cave-exit uphill terrain repair — 2026-09-20

The user paused art work after observing green terrain popping and surface
clutter visible through the missing bank while climbing out of a cave. This
was reproduced at identical walked positions on committed baseline `7d81615`.
The cause was whole-quad height rejection, not bad scatter provenance. Source13
now tests each floor triangle against its actual plane and each ceiling
triangle against the opposite side. Uphill banks write depth even below their
vertices; flat caps remain hidden from below. Geometry, movement, materials,
resolution and the stitching cache are unchanged by this repair.

New terrain-facing and real-input exit regressions are registered in dev.py;
scatter tests cover full/partial bank occlusion without a cave-mode hiding
workaround. Current integrated core48 PASS; smoke54 PASS; cave-milestone53 PASS
(overlapping counts, including the existing material test). Isolated shipping
copy core48 PASS. Native browser walk-out sequences pass for descending and
hillside profiles. Restoring the old height gate fails both synthetic and real
world regression checks. The user reviewed the improved result positively.

Native 1280×720 Look out sanity check: command median29.6→32.1 ms, p9533.8→33.3;
animation-frame median33.3 ms unchanged. More terrain is correctly rendered;
this is not a speed improvement or 60 FPS claim. Details and limitations are in
task outputs `cave-exit-repair-checkpoint.md` and `cave-exit-performance.json`.
Existing material-system edits were preserved and included in integration
checks; the user confirmed nothing else was actively editing the game.
No staging/commit/push/merge or G2/audio/shared firmware edits during this repair.
Normal8001 preview is stopped at descending Look out, fixtures off. Art pass
remains paused. Generated header SHA-256:
`f87851c40121a51d12548de78f99176f500a91586e43ec0206bf59d1aa1dbe71`.

### Committed baseline and visual-direction discussion — 2026-09-20

At the user's explicit request, baseline commit `7d81615` was created on
`codex/html-game`: "Checkpoint HTML game workflow, cave rendering, and
performance". It contains the editable game sources, shipping build/test tools,
and generated header (69 files). The 43 core tests pass. Nothing was pushed or
merged, and no G2/audio/shared firmware files were included. Handoff documents,
optional audit lab and its modified `tools/webui/README.md` remain local and
uncommitted. Earlier "nothing committed" statements below are historical.
The newly tracked script fragments retain intentional blank boundaries to
preserve classic-script assembly; a staged whitespace check excluding the
blank-at-EOF warning passes. Git used this Mac's automatically configured
committer identity; no identity configuration was changed.

The user next asked for a graphic-designer-led visual improvement proposal with
Canvas2D a hard requirement. No visual redesign has been implemented yet. The
initial recommendation is a cohesive atmospheric fantasy direction: quieter
world-seeded material patches, shared palette and lighting across terrain/walls/
props, colored distance haze, stronger silhouettes, unified prop/sprite/UI style,
and an actual cave-approach comparison before wider rollout. A source review
found fixed sunlight baked into terrain versus moving wall sunlight, and scalar
2D light baking despite light records containing RGB/Z. Prefer cached material/
normal/lighting data and sprite art, not per-frame full-image filters or a move
to WebGL. Mood and freedom to replace the current blocky/retro look have been
asked of the user and are still pending at this checkpoint.

### Fullscreen performance follow-up — 2026-09-20

The first performance pass is implemented on `codex/html-game`. Static semantic
floor/ceiling corner joins are cached with mesh/derived-buffer invalidation and
a 4 MiB numeric tile cap (plus scratch/bookkeeping). Opaque depth-mask painting
coalesces identical adjacent spans; transparent clips keep the original rows to
preserve native Canvas antialiasing. No resolution, geometry, texture, lighting,
particle or effect quality reduction was applied. Hidden Cave Test control-map
work is skipped, and FPS now reports actual animation-frame cadence.

Cave Test includes repeatable preview/native-fullscreen profiling and safe
cancellation/restoration. Pixel verification is optional and off by default;
timing comparisons need fresh loads without readback. Clean 12-warmup/60-frame
comparisons at DPR1 show command medians: preview mouth 13.60→10.00 ms;
1280×720 descending mouth 44.80→39.65 ms; roof edge 29.90→25.70 ms; hillside
mouth 41.50→37.50 ms. The preview gain includes ~2.5 ms of test-only hidden-map
work. Native mouth cadence remains uneven around 33/50 ms, not stable 60 FPS.
These frozen render fixtures are not a full gameplay or physical-device claim.

Final core43 PASS; core+smoke49 PASS; core+cave-milestone48 PASS (overlapping
totals). Isolated shipping-only copy core43 PASS. Native same-page old/new
opaque-mask comparisons at mouth and roof edge match exactly. Separate whole
image hashes match three views; a cross-load roof-edge tile differs, so do not
claim universal pixel identity. Full methodology and raw results are in task
outputs `fullscreen-performance-checkpoint.md` and
`fullscreen-performance-results.json`.

The next renderer target is repeated wall/terrain/depth work. Combat, persistent
clearing/save-resume and broader content remain separate. No G2/audio/shared
firmware changes; nothing staged, committed or pushed. Keep handoff/lab local.
Final generated header SHA-256:
`160d02827a63f01dff55a91e18786f6e635f5895f297e5f8399a8b32bf88c66b`.

### Actor, loot, and spell visibility follow-up — 2026-09-20

The approved follow-up is implemented on `codex/html-game`. Enemies and their
health/status visuals, pickups, companions/allies, spawners, floor clutter, ore,
chests, projectiles, impacts, ground effects, chains, novas, cones, flame streams,
and ambient particles now read shared opaque terrain depth. Partial visibility
is clipped per pixel; transparent sprite bounds never write opaque depth.
Chest faces and extended effects retain per-corner/per-segment depth. Ground
decals follow the actual floor triangles, with geometry cached by effect and
mesh identity.

Height fixes accompany the migration: finite zero remains valid; surface and
cave support are selected from object provenance rather than player mode;
player stored Z converts once into projectile render units; impacts use absolute
render Z; companion bounce is relative to its own support. Fixed-mode cave
clutter and cave drops retain their underground provenance.

The optional Cave Test `Visibility fixtures` checkbox pauses simulation and
temporarily draws a skeleton, chest, and fire orb at stable entrance positions.
It restores gameplay arrays after rendering and restarts normal Cave Test when
disabled. Descending and hillside fixtures passed runtime checks. Browser
inspection verified open-mouth visibility, burial from above, and oblique
occlusion; the fixture remains a developer aid, not additional gameplay content.

Final frozen verification: core39 PASS; core+smoke45 PASS;
core+cave-milestone44 PASS. These totals overlap. An isolated shipping-only copy
also passes all39 without the handoff or optional audit lab. Focused actor,
loot, and spell regressions include deliberate depth-bypass mutations. Final
header SHA-256:
`916535f4cb66249c2643da00675f3e65b1dd8f66c0f128821c176145a518cac6`.

This is world occlusion, not a completed general entity-to-entity renderer or
combat line-of-sight/AI repair. Some structure/shop renderers remain legacy.
Larger-canvas optimization, save/resume and permanent clearing, richer cave
recipes, and world content remain later work. No G2/audio or shared firmware
configuration changes. Nothing staged, committed, or pushed. Performance
methodology and the final measurements are in the task output
`entity-visibility-checkpoint.md`; local raw measurements remain under task work.

### Rendering repair follow-up — 2026-09-20

The user's side-angle screenshots revealed that the earlier milestone's
movement/head-on checks did not prove terrain occlusion. The active repair now
uses shared per-pixel depth for terrain, ceilings, wall sides/tops and entrance
solids, replacing the entrance's top-point visibility workaround. Camera-mode
culls are removed from these passes. Terrain cells are triangulated before
near-plane projection so painted geometry agrees with interpolated depth.

Cave albedo is authored by world position and shared by floor, ceiling, walls
and rock cut; it blends from surface color at the mouth to deeper neutral stone.
Torch/decor ownership is rebased with chunks, attached to actual wall spans,
and clipped by the same depth field. New Cave Test side/oblique/roof-edge views
and Fixed noon support repeatable inspection. Regression coverage includes a
mutation test that recreates the buried-jamb bug when terrain depth is removed.

The repair is scoped: generic actors, pickups and some effects still use legacy
visibility paths; this is not an all-engine rendering fix. Full-canvas depth is
more expensive at high resolution. No reduced-resolution shortcut is used;
fullscreen performance still needs a dedicated budget. Saving, world content,
G2/audio and firmware configuration remain unchanged. Final verification and
limitations are recorded in the task output `cave-rendering-repair-checkpoint.md`.
Nothing is staged or committed; keep this directory and the optional lab local.

Final repair verification: 32 core tests pass (195 focused assertions plus the
mutation guard); isolated shipping-only copy also passes32. Core+smoke38 and
core+cave-milestone37 pass; totals overlap. Browser review verified both
entrance profiles and caught/fixed triangle-edge coverage cracks. Final header
SHA-256: `5bf14050aac224af48c48ae9455a3b6901a7f5c8b2a7edd7b4cea6e1d3c06880`.

### Earlier cave milestone (historical)

The audit/test-lab and developer-workflow milestones are complete. Following
the design discussion, the user authorized gameplay implementation. The first
playable cave prototype is implemented on `codex/html-game`, with parallel
geometry, movement, and rendering work integrated. Focused runtime and browser
checks have completed; broader engine repairs and visual polish remain.
Nothing was staged, committed, or pushed, and the handoff/lab
files remain local as requested. Earlier sections below describe historical
checkpoints, not the current source state.

### Implemented first playable cave scope

- One connected, small seeded cave: descending or terrain-supported hillside
  entrance, winding passage, terminal chamber, and walking back out.
- Shared entrance geometry, walkable support/headroom, and readable lighting.
- Cave Test viewpoints and focused regressions for both entrance profiles.
- Browser-local save/resume, protected outposts, residents, larger dual-exit
  caves, and the broader world-content plan remain later milestones.
- G2/audio and shared firmware configuration remain outside this branch's work.

New shipping sources/tooling must be staged explicitly when a commit is
requested; do not include this handoff directory or the optional local lab.

### Cave milestone verification — 2026-09-20

- Core: 27 tests pass, including 102 focused geometry, support, lighting, and
  semantic-render assertions. A separate temporary copy containing only
  shipping sources/tooling and tracked JS-runner infrastructure also passes all
  27 tests with no handoff or optional audit files.
- `dev.py test --suite smoke`: 33 tests pass.
- Full-runtime cave acceptance: 60/60 checks pass. Actual input/physics walks
  descend, traverse the winding passage, enter the chamber, and return outside
  for descending seed 12345 and naturally supported hillside seeds 5668/6290.
  Covers floor continuity, no unintended falls, headroom, readable day/night
  lighting, day/night-off topology, rendering without caught errors, intact
  surface above the cave, and deterministic network regeneration.
- Default seed 12345's chamber sits on a chunk edge. It now receives its one
  chest and 2–3 enemies with unique deterministic ownership and open spawn cells;
  the old margin guard no longer silently drops the sole chamber's contents.
- Broader targeted raw results: geometry 18/19, transition 32/33, physics 14/16.
  Remaining failures are existing water/wall placement, chunk-border rebuild
  churn, lethal-hit regeneration, and enemy attack reach. Their explicit
  known-bug expectations remain; repaired failures were promoted to required
  passes. See `evidence/milestone_final_targeted.json`.
- Real browser: inspected descending approach/interior/chamber/lookback and
  hillside approach/lookback/surface above chamber. Corrected cross-layer
  spikes and open rock-edge gaps discovered during visual review. Remaining
  steep-bank faceting is visible prototype polish, not an accepted claim of
  final art quality.
- Performance audit remains broadly red on previously documented frame-rate
  input dependence, logging/cache/fullscreen/fixed-level issues. No ESP32 or
  physical-device performance claim is made. New semantic corner lookup scans
  at most five layers; reusing/precomputing role-aware candidates is a future
  optimization. Uncached scans are not reported as cache hits.
- Legacy broad enemy/loot/persistence/render fixtures and mutation matrices
  assume larger multi-room caves or old source anchors. Some now fail sampling
  preconditions; do not label those repaired product bugs or claim that the
  historical all-suite matrix still passes unchanged.

### Next decisions/work

1. Review the two Cave Test entrance profiles and tune their proportions,
   natural rock shape, lighting, and hillside frequency. Genuine hillside fits
   currently occur very rarely in normal generation; no artificial test hill
   was introduced.
2. Complete actor/loot/line-of-sight and death-state consistency before richer
   enemy pursuit/content. Some broader pre-existing rendering/combat failures
   remain outside this cave-foundation change.
3. Implement stable world identity and same-browser save/resume, including
   permanent enemy/chest clearing across unloading and reopening. New spawn IDs
   are groundwork, not a completed persistence system.
4. Add richer cave recipes, larger connected dual exits, landmarks, and small
   protected inhabited outposts. The current recipe has a constant interior
   floor and one entrance; rising passage layouts are not implemented yet.

Shipping source authority and contracts are documented in `assets/games/README.md`.
Generated header SHA-256 at closeout:
`b73a23b84fc31dd9965e1a6f96c708f8827266fc64a239681e2449cd189253f6`.

## Completed evidence

- All nine filtered FIX-probe matrices completed: 1,134/1,134 expected cells,
  zero missing/duplicate/error cells, 20 collateral regressions, and 53
  beneficial cross-suite flips.
- Two frozen all-suite snapshots completed in 142 s and 141 s. All 11 suite
  verdicts, complete ordered check records, and genuine non-timing metrics are
  identical.
- Final smoke: 13/13 PASS in 0.7 s.
- Serial game discovery: 299 tests, OK, 228 expected probe skips, 149.090 s.
- Full `tools/webui` discovery: 337 tests, OK, 228 expected probe skips,
  143.389 s.
- Real Chrome: the saved default result passed all four strict grading tests;
  all 13 mutation pages matched their declared targeted statuses; redraw pixels
  were identical across all 14 seed/view scenes.
- Final frozen source/lab fingerprint:
  `9ffbcf95a62ab0217fce616b2004725b38f5fe663602e669293549c1a8a11a6e`.

## Remaining work

No audit or lab implementation work remains. The next work is product code:
choose a repair wave from `FINAL_REPORT.md`, implement it in the game, and use
the completed lab/matrix to catch regressions. Real ESP32 performance,
transport, physical-input, and product-intent validation remain explicitly out
of scope for this checkpoint.

## Recommended first implementation checkpoint

Start with one authoritative world/layer/entrance contract (`WorldSample` plus
an immutable `EntrancePortal`). Migrate physics, render, AI, loot, lighting, and
debug tooling to that contract together before applying isolated cave fixes.
This addresses the matrix's strongest coupling signal without reducing visual
quality or beginning a risky rewrite.

## Developer workflow milestone — 2026-09-20

The user chose to prepare the editing workflow before gameplay repairs. This
milestone is complete on `codex/html-game`:

- Editable CSS, HTML and 24 JavaScript files now live in `assets/games/`.
  Ordered assembly retains both original classic-script regions and all shared
  globals. These are source sections; subsystem encapsulation is future work.
- `tools/game/dev.py` provides `build`, `check`, `test`, `serve`, and `where`.
  Generation validates sources and JavaScript before atomic header replacement;
  `check` rejects stale headers without rewriting them.
- `assets/games/README.md` and `AGENTS.md` document source authority, focused
  tests, manual preview, explicit staging, and G2/audio scope boundaries.
- The original, current, and regenerated `WebPage_Games.h` are byte-identical:
  SHA-256 `3398802a20f09ac0f2064800d9b51999e3f72fb71b672cbfc8dd18007f0ecd8b`.
- `python3 tools/game/dev.py test --suite smoke`: 29 tests OK, 1.161 s.
  An isolated checkout copy without the audit/handoff files passes all 23 core
  workflow tests (0.333 s), demonstrating that the local lab is optional.
- Browser verification exercised Endless Mode and the rendered 3D view through
  the actual page controls; no browser errors were observed. The local preview
  uses mocked device APIs. Its temporary server was stopped after verification.

No gameplay fixes, staging, commits, or pushes occurred. The new source/tooling
paths are intended repository changes; the existing handoff/lab material remains
local under the user's instruction. The next implementation work should edit
`assets/games/src/` and regenerate the header, rather than editing the header.

## World/cave design discussion — 2026-09-20

The user requested question-led design before gameplay changes. Confirmed so
far: seamless cave entry, terrain shaped to entrances where present (ordinary
terrain elsewhere), mostly winding tunnels/chambers with room for future
expansion, and walking back out as the current traversal target. Detailed
decisions, proposals, and open questions are in `WORLD_CAVE_DESIGN.md`.

This discussion has changed only local handoff notes, not game behavior. The
user has also confirmed descending and terrain-supported hillside entrances,
automatic natural-to-constructed style variation, uphill passages when ceiling
space permits, and custom theme/characteristic recipes with generated layouts.
Most caves should be small, with rarer larger caves more impressive. Better
preservation in large caves and collapsed hallway stubs in small caves are
tentative ideas; mixed passage widths should be judged in a later prototype.
Rubble is confirmed permanent, and terrain/layout changes such as digging,
destruction, or building are outside this phase. Lighting should use the
existing system and get
darker only to a readable limit, never pitch-black navigation. Most caves have
one entrance; large caves may have two, at varying distances, joined by the
same walkable cave. Enemies may follow through entrances in either direction
when they fit and a route exists, subject to as-yet-unspecified chase limits;
rock must block sight and attacks. Cleared caves stay cleared for the same run:
defeated enemies stay gone and looted chests do not refill, including after
area unloading/reloading. This should encourage continued map exploration.
The user broadened the discussion to the map's identity, suggesting places,
monuments, or civilizations amid the
biomes to make exploration feel more meaningful. Existing markets, shrines,
ruins, fortresses, arenas, and watchtowers provide ingredients; no new world
systems have been implemented. After reviewing feasibility, the user selected
small inhabited outposts with simple residents/services among wilderness and
older ruins; bustling towns/full civilization simulation are deferred. They
also approve recognizable landmarks to travel toward with smaller discoveries
along the way. Outposts are confirmed protected trading places for the player
and residents; this does not alter the cave-entrance pursuit rule. Protection
must be validated beyond the existing market chase suppression. The user then
confirmed resume-by-default across reopening. Inspection found only in-memory
chunk/session bookkeeping, not durable save/load; restarting Endless clears
progress and picks a new seed. The user selected same-browser saving for the
first version; no cross-device sync or device-side save backend. Clearing site
data remains a save-loss risk; backup/export is a proposed safeguard.

The high-level brief now supports an implementation plan: shared cave/world
geometry and traversal first, consistent lighting/actor interactions next,
stable identities and local save/resume, then a small themed cave/landmark/
protected-outpost example. Visual proportions and frequencies should be tuned
in prototypes. The work remains design notes only; no gameplay, NPC, or saving
implementation has occurred during this discussion.
