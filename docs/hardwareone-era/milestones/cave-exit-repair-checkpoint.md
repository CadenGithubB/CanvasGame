# Cave-exit terrain visibility repair

2026-09-20 · `codex/html-game` · baseline commit `7d81615`

The user's four-step exit sequence was reproduced on the committed baseline:
green uphill terrain disappeared below the camera-height threshold, exposing
sky and surface clutter, then popped back as the player climbed. The repaired
browser sequence keeps the bank present and correctly hides objects behind it.
The user reviewed the result and reported that it looks much better.

## Cause and repair

The renderer rejected an entire floor cell when the camera was below its
lowest corner. That is not a valid facing test for a slope: the uphill bank can
face the player even when all its corners are above the eye. Missing terrain
also meant missing depth, so otherwise-correct surface-scatter clipping could
not hide objects behind that bank.

`13-render-floors-ceilings.js` now tests the camera against each triangle's
actual plane. Nonplanar cells test both triangles independently; ceiling
undersides use the opposite side. Flat caps remain invisible from underneath.
No cave dimensions, movement, collision rules, material colors, resolution,
or scatter-hiding mode switches were introduced by this repair. The stitching
cache is unchanged. Existing separate material-system edits were preserved.

## Verification

- Current integrated core: 48 tests PASS. Core + smoke: 54 PASS. Core + cave
  milestone: 53 PASS. Totals overlap and include the existing material test.
- An isolated shipping-source/tooling copy also passes all 48 core tests,
  without the handoff documents or optional audit lab.
- New terrain-facing coverage: 15 assertions, plus a mutation restoring the
  old height gate. Covers uphill banks, flat caps, nonplanar cells, sloped
  ceilings, near-plane clipping, and independence from player cave state.
- New real keyboard/collision regression: 48 sampled views across descending
  seed 12345 and hillside seed 5668, with 12 acceptance assertions. The fixed
  renderer has zero missing expected uphill-depth pixels. Restoring the old
  guard loses 168,484 descending and 1,100 hillside pixel samples across the
  tested views and fails the regression.
- Six additional scatter assertions exercise full/partial bank occlusion,
  stable ground anchoring below surface, and unobstructed cave/surface clutter.
- Native browser: seven sequential snapshots per entrance profile, driven by
  real input/update/physics functions with collision enabled, from inside the
  cave through the approach to outside. Descending before/after positions and
  heights match exactly. This checks rendered output as well as depth data.
- Generated header matches editable sources; both classic scripts parse;
  `git diff --check` passes.

## Performance sanity check

Fresh-load native fullscreen, 1280×720, DPR1, descending Look out view:
12 warmups + 60 frames; pixel readback disabled. Command median was 29.6 ms on
the broken baseline and 32.1 ms after repair; p95 was 33.8 and 33.3 ms.
Animation-frame median remained 33.3 ms. More terrain is now correctly drawn;
this is a correctness repair, not a performance improvement or a 60 FPS claim.
The repaired run includes preserved material refactoring, so this single pair
is a sanity check, not an isolated attribution of all timing differences.

[Raw fullscreen results](~/Documents/Codex/2026-09-19/https-github-com-cadengithubb-hardwareone-tree/outputs/cave-exit-performance.json)

## Handoff

The normal preview remains at `http://127.0.0.1:8001/`, descending Look out,
stopped with visibility fixtures off. Press Start to walk out. The art pass
remains paused; no new art changes were made for this repair.

Nothing was staged, committed, pushed, or merged during this repair. G2/audio
and shared firmware configuration remain untouched. Handoff and scratch QA
files remain excluded from commits. The earlier checkpoint commit is intact.

Integrated generated header SHA-256:
`f87851c40121a51d12548de78f99176f500a91586e43ec0206bf59d1aa1dbe71`
