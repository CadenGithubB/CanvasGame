# HardwareOne fullscreen performance checkpoint

2026-09-20 · branch `codex/html-game` · first performance pass complete

The measured Cave Test render-command cost is lower without reducing canvas
resolution, textures, lighting, particles, effects, or geometry. Fullscreen is
still below a stable 60 FPS; this is an incremental optimization, not a completed
renderer overhaul. Nothing was staged, committed, or pushed. G2/audio and shared
firmware configuration were not changed; handoff and optional audit files remain
local and uncommitted.

## Clean browser measurements

| View | Canvas | Command median before → after | Reduction | Command p95 before → after |
| --- | --- | --- | --- | --- |
| Descending mouth, seed 12345 | 360×240 preview | 13.60 → 10.00 ms | 26.5% | 14.30 → 10.60 ms |
| Descending mouth, seed 12345 | 1280×720 native fullscreen | 44.80 → 39.65 ms | 11.5% | 51.30 → 40.30 ms |
| Descending roof edge, seed 12345 | 1280×720 native fullscreen | 29.90 → 25.70 ms | 14.0% | 30.50 → 26.20 ms |
| Hillside mouth, seed 5668 | 1280×720 native fullscreen | 41.50 → 37.50 ms | 9.6% | 42.40 → 38.70 ms |

These are short controlled measurements, not whole-game FPS guarantees. Each
run used a fresh page load, 12 warmups and 60 animation frames, DPR 1, identical
paused visibility fixtures, frozen render time/randomness, and canonical
lighting, particles and exploration. Pixel readback was disabled during timing.
The frozen original renderer was given the same profiling instrumentation.
Render-command timing can exclude deferred GPU work; it is not GPU completion
time. Stage measurements are inclusive and must not be added to their parents.

Actual animation-frame intervals stayed around 16.7 ms in the preview and
33.3 ms at the roof edge. Fullscreen mouth intervals shifted from roughly 50 ms
to a mixture of 33/50 ms (optimized p95 approximately 50 ms). That is still
uneven delivery, not stable 30 or 60 FPS. No physical-device/ESP32 or other
display-resolution performance claim is made.

The 26.5% preview improvement includes removing about 2.5 ms of hidden Cave Test
diagnostic-map work. That saving is test-mode specific, not a general gameplay
speedup. The renderer's own `draw()` median improved from 10.5 to 9.5 ms in the
preview; fullscreen renderer gains were smaller than total-command gains too.

## Changes

- Static floor/ceiling corner joins are cached per mesh/layer. Camera transforms,
  lighting, materials, alpha, triangle order and precision remain unchanged.
  Numeric tile storage is capped at 4 MiB, plus a 6 KiB scratch tile and object
  bookkeeping; overflow uses the original calculation. Mesh/derived-buffer
  replacement invalidates the cache. Future in-place geometry edits must rebuild
  derived geometry or explicitly invalidate it.
- Opaque depth masks merge identical adjacent scanline spans into taller
  rectangles. Transparent clipping retains the original one-pixel rows: merging
  those rows caused small native-Canvas antialiasing differences, so that part
  was reverted.
- The Cave Test control map draws only when its debug panel is visible. FPS
  displays now measure animation-frame cadence rather than labeling reciprocal
  JavaScript work time as FPS.
- Cave Test now has repeatable preview/fullscreen profiling, cancellation,
  restoration of temporary render inputs, and optional untimed pixel verification.
  Pixel verification is off by default because readback can affect subsequent
  Canvas performance. Instructions are in the game's source README.

## Verification and limits

- Generated header is current; both classic scripts parse; `git diff --check`
  passes.
- Core: 43 tests PASS. Core + smoke: 49 PASS. Core + cave milestone: 48 PASS.
  These totals overlap. An isolated shipping-only copy also passes all 43.
- New regressions cover cadence/visibility, profiler lifecycle, cache
  invalidation/budget, and depth masks (including 400 randomized exact mask/depth
  comparisons and an explicit legacy transparent-clip guard).
- Same-page native 1280×720 old/new opaque-mask comparisons at descending mouth
  and roof edge produced zero differing pixels. Separate canonical before/after
  full-image hashes matched the preview mouth and both fullscreen mouths.
  Cross-load roof-edge hashes differed in one image tile despite the controlled
  mask comparison matching; therefore universal pixel identity is not claimed.
- Browser cancellation restores controls and reports cancelled samples. Toggling
  Cave Debug shows/hides its panel while paused. The main preview is left at the
  descending mouth, stopped, with fixtures off; press Start to continue.

## Next useful work

The largest remaining fullscreen costs are wall, terrain and depth passes.
Another focused renderer pass should reduce repeated raster/coverage work while
retaining exact occlusion and full resolution. At the descending mouth, optimized
inclusive medians remain approximately 13.6 ms for walls, 9.1 ms for platforms,
and 8.4 ms for scene entities. Some stages overlap; these are prioritization
signals, not additive budgets.

Combat/AI consistency, browser-local save/resume and permanent clearing, larger
cave recipes, landmarks and protected outposts remain separate future work.

## Evidence

[Raw timing and pixel-validation results](~/Documents/Codex/2026-09-19/https-github-com-cadengithubb-hardwareone-tree/outputs/fullscreen-performance-results.json)

Original pre-performance header SHA-256:
`916535f4cb66249c2643da00675f3e65b1dd8f66c0f128821c176145a518cac6`

Instrumented baseline header SHA-256:
`52db7304dad4d8f5fc8f27473ea79170577f6cda37f561a90d61d08b49a3550e`

Final generated header SHA-256:
`160d02827a63f01dff55a91e18786f6e635f5895f297e5f8399a8b32bf88c66b`
