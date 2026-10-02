# Entity visibility checkpoint

Date: September 20, 2026  
Project: `~/Documents/Codex/Projects/hardwareone`  
Branch: `codex/html-game`

## Outcome

The approved actor/loot/spell rendering pass is implemented and verified.
Enemies, pickups, companions, chests, and spell effects now use the opaque
terrain depth established by the cave repair. Objects can remain partly visible
through an opening without their buried portions, health bars, labels, or glow
showing through the surrounding terrain.

Three parallel implementation passes were integrated with shared visibility and
height helpers. No canvas-resolution or visual-quality reduction was introduced.
The generated firmware header is current. Nothing is staged, committed, or
pushed. G2/audio and shared firmware configuration were not changed. Handoff and
audit files remain local and uncommitted.

## Changes

- Enemies and goal markers: terrain clipping includes sprites, health/status
  indicators, shadows, and attack telegraphs.
- Loot and props: coins, souls, tomes, stat pickups, companions/allies, spawners,
  floor clutter, and ore use the same visibility rules. Chest faces retain their
  own corner depths; labels and glow are clipped too.
- Spells: projectiles and impacts use padded sprite bounds; chains, novas,
  cones, and flame streams retain depth along their geometry. Ground effects
  and landing indicators conform to actual terrain triangles.
- Height consistency: zero is valid; cave drops and clutter retain their cave
  floor; surface objects use their surface. Projectiles convert the player's
  stored height into render units once, impacts use absolute render height, and
  companions bounce relative to their own support.
- Shared implementation: transparent bounds only read opaque depth, never
  obstruct other objects by writing an invisible rectangle. Ground-effect
  geometry is cached against its effect bounds, support reference, and mesh.

The source guide in `assets/games/README.md` documents these contracts for future
development. Some structure/shop renderers still use legacy paths. This pass is
not a complete entity-to-entity depth, collision, or combat line-of-sight system.

## Verification

| Check | Result |
| --- | --- |
| Core build, syntax, and regression suite | 39 tests passed |
| Isolated shipping-only copy, without handoff/audit lab | 39 tests passed |
| Core plus smoke suite | 45 tests passed |
| Core plus cave milestone suite | 44 tests passed |
| Frozen fixture runtime checks, both entrance kinds | 36 assertions passed |
| Final comparative CPU benchmark | 16 cases, no rendering errors |

Suite totals overlap. The new shared/entity, actor, loot, and spell checks cover
21, 23, 43, and 88 focused assertions respectively. Deliberately bypassing actor,
loot, or projectile depth causes the corresponding regression test to fail.

Browser-skill inspection checked descending and hillside entrances, including
open-mouth visibility, partial side-angle views, and terrain hiding the objects
from above. It is visual coverage of these fixtures, not an exhaustive sweep of
every seed, spell, and camera angle.

Final generated-header SHA-256:
`916535f4cb66249c2643da00675f3e65b1dd8f66c0f128821c176145a518cac6`

## Performance findings

These measurements are JavaScript CPU timings on this Mac's JavaScriptCore test
runner with a no-op Canvas. They exclude real Canvas/GPU painting, browser
compositing, input, and device costs. They are not measured browser FPS or an
ESP32 performance claim.

Both versions used the same seeded inputs: descending 12345 and hillside 5668,
mouth and mostly-hidden roof-edge views, two canvas sizes, 12 warmups and 12
samples per case. The render payload contains enemies, pickups, chests, bolts,
impacts, ground patches, a chain, a nova, and a cone. The final measurement was
run after concurrent testing stopped. Small sample size and run-to-run noise
still apply.

Current entity/effect payload cost, ranges across the two seeds:

| View | 360×240 median / p95 | 720×480 median / p95 |
| --- | --- | --- |
| Through the entrance | 1.16–1.58 / 2.50–2.60 ms | 3.60–4.32 / 5.54–6.26 ms |
| Mostly hidden by terrain | 0.26–0.42 / 0.58–1.12 ms | 0.34–0.70 / 0.68–1.44 ms |

The measured terrain-plus-payload CPU median spans 9.70–12.40 ms at 360×240 and
15.52–23.06 ms at 720×480, compared with 8.20–10.66 ms and 15.14–18.52 ms before
this pass. The two versions do not produce equivalent pictures: the old code
incorrectly discarded much legitimate cave content and leaked some buried
content. At the doorway, paint operations rose from 21 to 74/63; in mostly-hidden
views they fell from 34 to 12–27. A simple speedup/slowdown ratio would obscure
that correctness difference.

No measured billboard requested a full-canvas mask; the largest visible-screen
footprint was about 36%. Support-query count stayed at 89 at either resolution,
so floor sampling is not being repeated per screen pixel. Pixel-depth work still
scales with coverage. Larger-canvas performance needs further work before making
a smooth-fullscreen claim.

Local raw results and reproduction script:

- `work/entity-visibility-bench-results.json`
- `work/entity-visibility-bench.js`

Those paths are relative to this task folder and are not repository files.

## Try it

Open the running local preview at <http://127.0.0.1:8001/>. Select **Cave Test**,
then enable **Visibility fixtures**. It pauses the simulation and temporarily
places a skeleton, chest, and fire orb inside the entrance. Compare **Mouth**,
**Inside**, **Oblique**, and **Above cave**, then switch entrance kind.

Disable **Visibility fixtures** to restart normal Cave Test and walk around.
The fixture objects do not enter gameplay or saved state.

## Remaining work

1. Profile actual browser drawing at the intended fullscreen size. Optimize
   visibility/geometry reuse and unnecessary work while preserving full-quality
   pixels. CPU timings already identify pixel coverage as a scaling concern.
2. Migrate remaining legacy structure/shop render paths and address ordering
   between entities where needed.
3. Repair broader combat line-of-sight, pursuit, and death-state consistency.
4. Continue the separately agreed world milestones: stable identity and
   same-browser save/resume with permanent clearing, richer cave layouts, and
   landmarks/small protected outposts. Those features are not implemented by
   this rendering pass.
