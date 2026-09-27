# Texture and structure material studies

These are isolated experiments, not shipping renderer integration or a complete
shared object/model system. The small material study uses `texture-preview.html`,
`texture-mapping.js` and the isolated `texture-temporal.js` regression harness.
The production-size structure study uses `structure-preview.html` and
`structure-model.js`, sharing the material mapper. `structure-motion.js` and
`structure-temporal.js` provide its native motion replay and independent
projected-stripe oracle. All stay outside the game manifest and generated header.

Current status: the directional planar candidate passes all 20 selected
structure-motion cases, but stays experimental and off by default because of
measured cost and unresolved readback-context compositing differences. Earlier
failed baselines below are retained as evidence, not silently replaced.

## Run

```sh
python3 tools/game/dev.py serve --port 8003
```

Open `http://127.0.0.1:8003/textures.html` in its own tab; do not refresh a
positioned game. Camera presets, orbit/approach sliders and the camera sweep
show flat and textured versions of the same authored room corner and hollow
chest proxy. Try both tile sizes, smooth/crisp sampling, small/large chests,
opening the lid and the foreground pillar. **Anti-shimmer** is on by default;
turn it off to compare the original raw sampler. The diagnostic checker exposes
mapping errors more clearly than natural textures. **Stable long lines** is a
separate candidate mapping path for eligible planar faces; its quality evidence is
tracked separately from texture filtering below.

Open `http://127.0.0.1:8003/structures.html` for the separate production-size
fortress, arena and watchtower study described below. Neither route starts or
refreshes the live game.

## Architecture and bounds

- The preview assembler imports the exact production `getCam3D()` function and
  complete `12-scene-depth.js`; fail-closed assembly tests guard their boundaries.
  No gameplay lifecycle, hardware, save data or gameplay RNG is started.
- `TexturePilot.clipNear` follows the production projection convention while
  retaining UVs at near-plane cuts. Screen clipping/refinement interpolates
  reciprocal depth and UV/depth. UVs are measured in tile repeats.
- Four original procedural bitmap recipes are baked only on startup or a tile
  resolution change. Each source and its prepared filtering levels are shared
  across objects; repeated Canvas patterns are weakly cached per context/level.
  There are no runtime image
  requests or third-party art. Separate file-image decoding/failure handling is
  not implemented or tested by this procedural-source pilot.
- Convex faces ordinarily use adaptive affine Canvas triangles. Per-face
  maximum: 256; refinement depth: 7; target mapping error: 0.65 screen pixels.
  The optional planar path instead allows up to 384 one-pixel strips per face.
  Both paths share a 2,048 triangle-plus-strip budget per view. Reaching a cap
  is reported, not a guarantee that the target was met. Scene-budget exhaustion
  leaves the complete solid material fallback visible.
- The outer face is clipped once to the actual production integer-pixel depth
  mask and receives an opaque base. Expanded triangle clips reduce internal
  antialias seams without leaking through occluders. No nested depth-mask call.
- Texture density uses authored physical dimensions. Lid UVs stay in its local
  coordinates through the hinge transformation; world surfaces use authored
  world coordinates. This scene does not stream chunks and therefore does not
  validate production rebase integration.
- Four source tiles contain 64 KiB at 64px or 256 KiB at 128px. Current prepared
  levels add 873,488 or 611,344 bytes, respectively: retained base-plus-filter
  pixels total 939,024 bytes (917.02 KiB) or 873,488 bytes (853.02 KiB). The 64px
  option now costs more retained pixels because of its directional phase
  support described below; it is not a low-memory preset. These are
  **not** measured browser memory: source/backing copies, four swatch canvases,
  CanvasPatterns, depth buffers, preparation scratch and temporary triangle
  allocations add overhead. The catalog prepares these levels even when the
  legacy comparison is selected, so its timing isolates sampling, not asset
  preparation or a reduced-memory configuration.

The 64px directional path preserves the original piecewise-constant artwork
with a nearest-expanded virtual 128px base and a centered one-source-pixel
footprint level, both prepared once. Existing coarser levels are shared by
identity rather than duplicated. Its first ordinary filtered level also uses
128 phase positions instead of 64. These are sampling-resolution additions,
not invented image detail or runtime texture generation; UV scale/phase stay
in original-source coordinates. The two added virtual images cost 131,072
bytes per material. Before these additions, the historical 64px catalog used
218,128 bytes; that number is not the current retained-memory cost.

Lighting and fog are deliberately fixed study settings, not the full production
lighting system. Chest geometry is an authored proxy, not a migration of the
existing chest renderer. Solid materials only; no alpha texture depth policy,
normal maps, physically based shading or GPU renderer replacement.

### Anti-shimmer sampling

Thin mortar can cover only part of a screen pixel. Sampling one source texel
can therefore alternate between dark mortar and light stone as the camera
moves, even when the geometry and UVs are correct. More triangles alone do not
fix that case.

Prepared levels integrate centered, periodic box footprints directly from the
original tile. They retain up to four sample positions per footprint along each
axis, rather than keeping only one coarse average whose location loses a thin
feature's phase. This deliberately uses more memory than an ordinary mip pyramid.
Each level is generated from the original source, avoiding repeated rounding;
periodic wrapping includes the opposite tile edge. The full-period level stores
the constant tile mean in one pixel.

Per triangle, the inverse texture-to-screen transform estimates the largest
source footprint of a screen pixel, including oblique views. The renderer
chooses neighboring prefiltered levels and crossfades them continuously, with
at most two cached pattern fills per triangle. UV repeat size and phase do not
change with the selected level. The first opaque level is drawn fully and the
second is blended over it; the general opacity calculation preserves caller
alpha. Lighting and fog still apply once to the complete face afterward.

**Crisp** and **Smooth** retain their meaning when a texture is magnified. With
Anti-shimmer enabled, minified surfaces always use smooth prefiltered sampling;
preserving distant nearest-neighbor flicker is not part of the crisp option.
Turning Anti-shimmer off restores the raw sampler for an explicit comparison.
Pixel readbacks, filter construction and new filter canvases happen only during
material preparation, never in the drawing path. Existing per-triangle geometry
allocations remain; this is not an allocation-free renderer.

The triangle path's widest-footprint approximation is conservative and can
soften grazing surfaces. It is not anisotropic filtering, a cure for capped
perspective error, or proof that changing adaptive triangle boundaries can never
become visible. The optional planar path below now has a separate directional
filter; the triangle drawing algorithm remains unchanged.

### Stable long-line mapping candidate

Filtering addresses undersampled texture detail; it cannot correct a line whose
position changes because different affine triangles approximate perspective
differently. The capped triangle mapper can still show this residual defect,
even after the original sampling regression passes.

`drawPlanarFace` fits and validates screen-space planes for reciprocal depth
and UV divided by depth. With the current yaw/horizon-offset camera, horizontal
planes have reciprocal depth varying only by row; vertical planes only by
column. At an integer pixel band's center, perspective-correct UV coordinates
are exactly affine along that entire band. Screen-anchored, nonoverlapping
one-pixel strips avoid camera-selected internal triangle boundaries.

The current directional candidate approximates an elongated pixel footprint
with two symmetric source-space taps. Each tap uses the same prepared filter
levels with continuous neighboring-level blending: at most four cached pattern
fills per strip. The center derivative determines direction, endpoint
derivatives bound footprint width, and tap separation fades to zero as the
footprint becomes circular. Symmetric offsets retain the analytical UV center;
weighted source-over passes preserve the caller's total opacity. This is a
bounded two-tap approximation, not general high-sample anisotropic filtering.
The explicit `directional: false` comparison retains the earlier isotropic
two-pass policy.

The UI tries this path when **Stable long lines** is enabled. There is no
projected-size cutoff that would abruptly change mappers as a face approaches.
The complete visible band list,
convex ordering, depth/UV planarity, filter availability and strip budget are
validated before painting. Unsupported/general perspective, constant depth and
over-budget faces remain on the ordinary triangle path. Both paths stay within
the same outer opaque depth mask; strips also clip to the actual convex face.
Decline reasons, successful strip faces, strip counts and actual pattern fills
are reported rather than inferred from triangle totals.

No source readbacks, image generation or new filter canvases occur during
drawing. Preparation can add phase-resolution levels, as noted in the memory
accounting; prepared assets and per-context patterns are reused. Per-band
scalar fill bounds are calculated once and reused for tap/mip passes, avoiding
per-pass corner arrays. Plane fitting, band preparation, clip work and up to
four fills still cost time. The 2,048 triangle-plus-strip limit is a geometry
work cap, not a 2,048-fill cap: a fully directional workload could issue up to
8,192 pattern fills, plus base, palette and lighting paint. Reports count actual
fills separately. Fewer triangles alone does not establish lower cost.

**Directional planar mapping remains experimental and off by default.** Native
quality, browser compositing compatibility and full-model performance are
separate gates. No projected-size shortcut, changed threshold or default
enablement is justified by passing selected quality patches alone.

## Verification

```sh
python3 -m unittest tools.game.tests.test_texture_mapping -v
python3 -m unittest tools.game.tests.test_texture_filtering -v
python3 -m unittest tools.game.tests.test_texture_planar -v
python3 -m unittest tools.game.tests.test_texture_temporal -v
python3 tools/game/dev.py build
python3 tools/game/dev.py test
```

The mapping suite has 31 behavioral contracts and eight exact-once,
temporary-source mutation controls: perspective UVs, UV-preserving near cuts,
production near-plane parity, perspective viewport cuts, hard triangle caps,
gameplay RNG independence, Canvas transform layout and state restoration.
Geometry fixtures include analytic numeric expectations and full-area controls.
Recording-Canvas tests do not claim real raster or performance correctness.

The filtering suite has 38 contracts and 15 exact-source mutants against the
actual prefilter and draw path: independent area averages, centered feature
phase, fractional footprint coverage, periodic seams, skew/anisotropic footprint
selection, continuous level blending, fixed UV repeat size, opacity restoration,
actual pattern-pass counters, virtual-64px phase levels and bounded
preparation/cache reuse. These portable
checks validate data and submitted commands, not native browser shimmer or speed.

The planar suite has 51 contracts and 22 exact-source mutants. Independent
floor, wall and ceiling ray intersections validate submitted sampling at strip
centers, including the weighted centroid and bounded separation of directional
taps. It covers one-pixel phase/stride, both orientations, reversed
winding, visible-only budgets, convex half-planes, consistent depth/UV planes,
general-perspective rejection, unchanged UV scale, opacity/state preservation,
actual pass counts, virtual-source coordinate scaling and reuse without hidden
image baking. Inclusive depth-mask
bounds skip invisible bands without changing the retained bands' UVs, filter
footprints or mip choices. Invalid/empty bounds and insufficient remaining
budgets must decline before painting. It does not substitute a recording Canvas
for browser pixels.

The page's **Verify pixels & occlusion** runs nine real-browser checks using
fresh canvases, separate from timing canvases. A textured visible control must
contain several colors; partial depth occlusion must hide exactly the blocked
half; intentionally bypassing depth must be detected. Receding faces must paint
every opaque depth pixel without alpha cracks or exterior leaks. Near-plane
crossings must retain on-screen pixels. Invalid texture drawing must produce
an explicitly counted opaque fallback, never a successful textured workload.
Rebuilt catalogs must match actual pixels. These coverage checks do not prove
absence of texture-color seams, temporal shimmer or perspective error at caps.
The added strip check independently exercises both rows and columns regardless
of the preview toggle: each orientation covers 6,400 opaque pixels without the
blocker and exactly 3,200 with it, preserving texture contrast with no exterior
leaks. All nine checks also passed on the final directional candidate. Its
expected work bound is now four pattern fills per strip instead of two; opaque
coverage, alpha, exterior-leak and color assertions were unchanged. This does
not certify the separate midtone-compositing compatibility cases below.

### Sampling regression: TEX-SHIMMER-001, affine and zoom replay

Reported behavior: dark brick mortar appears to crawl, pulse, widen and narrow
during camera motion. Smooth sampling and the 64px source appear less affected
than crisp sampling and 128px. Those observations are not universal acceptance
rules: the test does not require 64px to beat 128px in every scene.

**Test texture shimmer** runs a fixed fractional-pixel motion replay on isolated
native canvases, independent of the current preview settings. A diagnostic
mortar tile has known dark-band widths, spacing and contrast. Its expected
appearance is calculated by integrating how much mortar covers each pixel,
not by calling the texture mapper under test. Measured frame-to-frame errors
subtract the expected change from legitimate camera motion. Thus a moving
surface is not penalized merely because it moves.

The equal-depth case uses the actual texture drawing path without changing
adaptive subdivisions, isolating texture sampling from geometry boundaries.
Both 64/128px sources and crisp/smooth preferences run the identical replay.
An additional zoom replay crosses an integer filtering-level boundary at eight
screen pixels per tile; it checks for level-transition popping that translation
at a constant scale cannot expose. Its independent oracle integrates the new
pixel footprint on every frame.
Static, uniform and independently integrated moving controls guard against an
oracle that fails all images; an injected brightness pulse must be detected.
Missing subjects, transparent pixels, cancelled runs and exceptions are setup
failures, not acceptable instances of the known rendering defect.

The prepared sampler passes the unchanged original replay and quality limits,
plus the new zoom replay. Native quality failures remain visible even when the
test harness and its unit/mutation tests pass. Do not relax thresholds to make
a future renderer change green. The original raw 128px crisp sampler remains
a deliberately failing negative control; detecting it is a control pass, not
a claim that its rendering quality passes.
The native test is opt-in from the page; the standard command runs its portable
oracle and sensitivity tests, not a pretend headless browser-quality check.

Fixture v2 retains 16 frames, 1/16-pixel translation per step, 128×96 private
canvases and a 96×64 interior crop. The diagnostic tile covers 9.6 screen pixels
per repeat; its mortar bands are 0.3 pixels wide. Intensities are normalized by
the authored light-minus-dark contrast (208−48). The predefined quality limits
are temporal residual RMS ≤0.05 and spatial mean absolute error ≤0.08. These are
explicit targets for this fixture, not a universal perceptual guarantee. The
added zoom replay uses `7.5 + frame/16` screen pixels per tile, ending at 8.4375.

Historical raw-sampler result, native Chromium153, 2026-09-26: no setup failures,
**QUALITY_FAILURE** in all four moving cases:

| Source / sampling | Temporal residual RMS | Spatial mean absolute error |
| --- | ---: | ---: |
| 64px crisp | 0.2256 | 0.1759 |
| 64px smooth | 0.1409 | 0.1490 |
| 128px crisp | 0.2256 | 0.1759 |
| 128px smooth | 0.1835 | 0.1625 |

Each case submitted 32 successful triangles and captured all 98,304 expected
opaque pixel samples. Stationary/uniform/integrated-motion controls passed;
the injected pulse was rejected. Smooth improved this replay without passing
its limits. The equal crisp results are valid: the geometric mortar pattern is
identical at both resolutions; the real artwork's fine-detail baking differs.

Filtered native result, fixture v2, 2026-09-26: **PASS**, no setup or quality
failures in all eight cases:

| Replay, each at 64/128px and crisp/smooth | Temporal residual RMS | Spatial mean absolute error |
| --- | ---: | ---: |
| Original translation | 0.0211795 | 0.0255629 |
| Zoom across filtering-level boundary | 0.0413551 | 0.0186344 |

Each case submitted 32 successful triangles, captured all 98,304 expected
opaque samples and retained observable actual and expected motion. The four
variants in each row had equal results: they encode the same diagnostic band
geometry and use the same minification policy. Stationary, uniform and analytic
motion controls passed. The injected pulse and original raw crisp sampler both
failed quality as required; the latter retained temporal RMS 0.2256. A first
ordinary coarse box-pyramid attempt failed these unchanged limits and was not
accepted; the centered, oversampled levels address its loss of feature position.

A separate oblique real-stone diagnostic compares fixed world triangles with
adaptive subdivision against independent ray/plane source-pixel integration.
It reports 4×4-versus-8×8 reference convergence and color/motion errors as
**DESCRIPTIVE**, not quality passes: finite supersampling and different mesh
approximations do not isolate every triangle-boundary cause. Both paths must
show contrast and motion over a fully covered, independently validated crop.
The filtered native run captured all 30,720 samples per path with no failed draw
calls: 8,192 fixed and 4,096 adaptive triangle draws, with all 16 adaptive frames
reaching their cap. These descriptive outputs are not an uncapped accuracy claim.
Its opaque projected-face base matches the material study; a missing base was
initially caught as a fixture setup error and corrected without relaxing limits.

CSS enlargement, actual game-loop interpolation, arbitrary material patterns,
all oblique/adaptive-topology artifacts and target-device performance remain
outside this quality-only test. TEX-SHIMMER-001 is repaired for the demonstrated
pilot regression, not declared impossible throughout the main game.

### Perspective long-line regression

The earlier eight cases remain unchanged and passing. A new native perspective
replay exposes a separate failure: a long mortar line can crawl locally while
the rest of a large floor hardly changes. Whole-crop average RMS can hide that
coherent defect. Fixture v3 therefore adds worst-frame RMS ≤0.08 and worst
overlapping 8×8-neighborhood RMS ≤0.12, with a four-pixel neighborhood stride.
These limits were fixed before measuring the baseline. They supplement, rather
than replace, the original overall RMS ≤0.05 and spatial MAE ≤0.08.

The authored 128px smooth-sampled tile uses world-space period 8 and band width
1. A 16-frame replay moves the camera by 0.08/0.035 world units per frame over
an independently validated plane. Native captures use a 128×96 canvas and a
96×32 interior crop. Expected dark coverage is independently integrated from
the perspective-projected stripe boundaries through each pixel, not sampled
from the mapper's own UV estimates. Stationary appearance, flat color or missing
subjects cannot manufacture success: the fixture requires contrast, motion,
opaque pixels, mapped workload and a crop entirely inside the authored plane.

Measured capped-mesh baseline, 2026-09-26, all four cases **QUALITY_FAILURE**:

| World stripe axis / camera height | Overall residual RMS | Spatial MAE | Worst local RMS |
| --- | ---: | ---: | ---: |
| (0, 1) / 18 | 0.036691 | 0.075652 | 0.235405 |
| (0.5, √3/2) / 18 | 0.033050 | 0.072345 | 0.143807 |
| (0, 1) / 30 | 0.030736 | 0.082676 | 0.195941 |
| (0.5, √3/2) / 30 | 0.031809 | 0.075643 | 0.187673 |

All overall RMS values pass the old aggregate limit, but every case fails the
new local limit. That is evidence for the missing coverage, not permission to
relax a threshold.

The earlier two-pass isotropic strip candidate (2026-09-26) passed the
temporal/local limits but failed spatial MAE in four of five native perspective
cases:

| Candidate case | Spatial MAE | Quality outcome |
| --- | ---: | --- |
| Rows, (0, 1), height 18 | 0.08634 | FAIL |
| Rows, (0.5, √3/2), height 18 | 0.07851 | PASS |
| Rows, (0, 1), height 30 | 0.09753 | FAIL |
| Rows, (0.5, √3/2), height 30 | 0.08801 | FAIL |
| Transposed columns, (0, 1), height 18 | 0.08644 | FAIL |

The ≤0.08 spatial threshold was not changed to accept that candidate. These
are retained historical failures, not results for the later directional filter.
Native coverage success and exact strip-center UVs alone did not guarantee
correct filtered appearance.

Native opaque compositing produced an observed red value of 209 from the
authored light value 208. The long-line analyzer admits only a one-byte
`1/160` margin when validating actual normalized captures; reference values
must still lie in [0, 1]. Actual samples are not clamped, so the full measured
quantization error remains in spatial and temporal residuals. This is a narrow
input-validation allowance, not a widened quality limit. The original affine
analyzer retains strict [0, 1] validation by default.

The two-tap directional follow-up adds five paired captures with the graphics
context preference used by the preview (`willReadFrequently: false`). Geometry,
camera paths, authored 48–208 contrast, crops, exact oracle and quality limits
are identical to the retained readback-optimized cases. All five graphics-
preference cases passed:

| Directional graphics-preference case | Overall residual RMS | Spatial MAE | Worst local RMS |
| --- | ---: | ---: | ---: |
| Rows, (0, 1), height 18 | 0.008528 | 0.032784 | 0.026204 |
| Rows, (0.5, √3/2), height 18 | 0.019697 | 0.042749 | 0.050658 |
| Rows, (0, 1), height 30 | 0.006351 | 0.039910 | 0.014528 |
| Rows, (0.5, √3/2), height 30 | 0.015565 | 0.051478 | 0.033543 |
| Transposed columns, (0, 1), height 18 | 0.008528 | 0.032784 | 0.026204 |

The original five readback-optimized (`willReadFrequently: true`) cases are
still run, not replaced: both height-30 cases pass, while three height-18 cases
remain **SETUP_FAILURE** because the native compositor can produce 210 from
authored white 208. That exceeds the existing one-byte validation allowance.
Consequently the overall small-scene report remains **SETUP_FAILURE**, not a
global pass. The added **Test filter compatibility** diagnostic reproduces
context-dependent drift on constant-color surfaces: graphics-preference
captures of 48, 128 and 208 retained those byte values exactly, while one
readback-preference directional capture of constant 48 produced a 46–48 range,
exceeding its one-byte allowance. Successive fractional composites can round
differently. Context preferences do not prove
which hardware backend every browser will use. Reordering passes was examined
and rejected after worsening results. Captures are not clamped and neither
contrast nor thresholds were changed to hide this compatibility limitation.

The portable temporal suite now has 39 independent analytic/classification
contracts and 13 exact-source mutants, including projected stripe coverage,
overlapping neighborhood sensitivity, worst-frame spikes and retained
quantization error alongside the original motion/oracle contracts. It does not
claim a native pixel-quality result when run headlessly.

## Native performance experiment

**Run paired benchmark** locks controls and serially runs flat/textured/textured/
flat. Every phase replays the identical authored room camera over 180 measured
frames after 30 warm-up frames. Only one view renders per benchmark frame;
side-by-side preview costs must not be confused with the single-view result.
Pixel reads are excluded from the timing canvases. Hidden-page/cancelled runs
are incomplete. Measured canvases must remain at least partially in view.

Outputs include p50/p95/p99/max whole submission and mapping time, submission
minus mapping, RAF intervals, triangle and strip counts, actual pattern fills,
minified/blended primitive counts, planar attempts/decline reasons and successful
faces, capped/fallback face-frames, visible-pixel
submissions and >60/120Hz submission-budget counts. These counts
are not GPU frame-deadline guarantees. Stage timing includes instrumentation;
do not add percentiles or treat RAF timing as just rendering cost.

Native filtering comparison, 2026-09-26, desktop in-app Chromium153:
360×240 internal pixels, 128px tiles, smooth sampling, devicePixelRatio 1.
Each mode used its own complete A/B/B/A run with the same authored camera and
180 measured frames per phase, 30 warm-up frames and identical prepared assets;
the automated test gate was not running.

| Texture sampler / repeat | Submission p50 | Submission p95 | Mapping p95 |
| --- | ---: | ---: | ---: |
| Original raw / B1 | 2.0 ms | 2.5 ms | — |
| Original raw / B2 | 2.0 ms | 2.3 ms | — |
| Anti-shimmer / B1 | 2.9 ms | 3.5 ms | 2.6 ms |
| Anti-shimmer / B2 | 2.9 ms | 3.3 ms | 2.5 ms |

The filtered run's flat controls measured p50 1.0/0.9 ms and p95 1.1/1.1 ms.
Filtered mapping p50 was 1.9 ms in both repeats; complete submission maxima
were 4.2/3.6 ms, versus 2.7/2.5 ms for the raw sampler. The observed additional
median submission work was about 0.9 ms, not zero-cost filtering. These short
desktop runs are an observation, not a portable millisecond budget.

Both samplers submitted 122,807 successful triangles per textured phase. Raw
sampling used 122,807 pattern fills; Anti-shimmer used 245,447 fills, including
122,640 blended and 122,807 minified triangles. Both recorded 352 capped
face-frames, zero solid fallbacks and no submission exceeding 8.33 ms. The
filtered run's maximum RAF interval was at most 18.6 ms; a 60Hz display and fast
Canvas submission do not certify actual 120Hz presentation.

Preparation for the filtered catalog took 34.9 ms once, before the measured
rendering phases, and retained 873,488 raw pixel bytes across all four base
tiles and their filtering levels. Browser copies and preparation scratch are
excluded. The raw comparison was rerun with the same final prepared catalog;
Anti-shimmer-off restores the original draw path but does not reclaim the filter
levels' memory. Thus these runs isolate sampling cost, not different asset
preparation or retained pixel allocations.

Earlier unfiltered pilot runs measured textured p50 1.7 ms and p95 2.0–2.1 ms.
Those are historical observations, not the paired filtering baseline: display
scale and concurrent testing differed between runs. Native coverage/fallback
checks passed, but those checks do not establish that shallow-angle checkerboard
distortion or every color seam is repaired. None of these runs measures game
FPS, firmware headroom, a 2D-view workload, GPU completion or a low-end device.

## Production-size structure study

`/structures.html` applies the same material path to the game's existing large
structure recipes. It is not an enlarged chest, a uniformly scaled miniature,
or a new building design. `dev.py` extracts the production wall-stamp block from
`05-endless-world.js` and decorative shell functions from
`15-render-hud-menu.js` verbatim, alongside their palette and dimension inputs.
The page also imports the exact production camera and complete scene-depth
helpers. Missing, ambiguous or unsafe source-injection boundaries fail assembly.

The adapter builds each structure at local origin on initially empty terrain.
The production cell is 12 world units, with 40 cells per 480-unit chunk. At
authored scale 1, the fortress's nominal outer width is 1,632 units; the arena's
outer seating radius is 582 units; the watchtower's central body is 72 units
wide with 168-unit arms. These are recipe dimensions, not exact cell-sampled
bounding boxes. The displayed bounds include the separate floor pad. Authored
size 0.85/1/1.15 changes the recipe: some widths remain cell-based and wall
height uses `0.9 + 0.1 * scale`, not uniform scaling. Height conversion retains
the game's authored 240-pixel canvas basis independently of preview resolution.

Occupied cells become exposed boundary faces. Internal faces are removed;
adjacent coplanar faces merge only when their height and color agree. Exposed
risers between unequal wall heights remain. Roofs, beams and standards from the
production shell join the same local-space face/material list. This geometry is
baked when the structure or size changes, not during camera movement. The
footprint displays the actual occupied cells. Stone/wood texture UVs repeat
every 32 world units, so increasing building size adds repeats rather than
stretching the texture. Accent flags retain their solid production colors.
Textured stone/wood receives a 32% wash of its authored face color, preserving
palette identity without creating a separate tile set per color. Directional
lighting also applies to textured shell faces so roof planes and beams retain
shape contrast. The diagnostic checker skips the palette wash. These final
paint operations are included in depth/paint timing, not mapping timing.

Both 360×240 views use identical geometry, camera and opaque pixel depth: one
is a flat-color control and the other uses the prepared texture catalog. Choose
exterior, entrance, courtyard, roof or grazing-floor viewpoints; orbit, change
distance, or run a camera sweep. Focus either view for WASD movement, Q/E height
and arrow-key look controls; Shift increases the movement step. This is an
inspection camera with no collision or gameplay physics. The UI uses a fixed
0.22-radian recipe rotation, two fortress buildings, twelve arena pillars and
three tower arms; only type and authored size are exposed as layout controls.

**Anti-shimmer is always on in the structure preview**, including both mapping
choices; there is no separate filtering switch on this page. The small material
study retains the on/off comparison. Anti-shimmer filtering and the experimental
planar mapping path are different things, and filtering does not remove all
geometry/subdivision shimmer.

The default remains filtered triangles with a 2,048-primitive per-view work budget.
Explicit 4,096/8,192 comparisons change allowed submissions, not model size.
The 256-triangle per-face cap remains. Experimental planar strips share the
same triangle-plus-strip budget, with at most 384 strips per face; they remain
off by default pending quality, compatibility and cost review. Caps and
solid fallbacks are visible counters, not successful full-quality texturing.
Merging geometry reduces face overhead but does not by itself solve perspective
mapping error on a large face. Distant mortar smaller than a pixel becomes a
filtered average rather than guaranteed individually resolved bricks.

The isolated floor is flat at Z=0. Terrain elevation, cave carving, streaming,
loot, enemies and interaction props are absent. Existing recipe quirks remain,
including shell features whose corresponding sampled support can be missing.
For example, an origin-centered arena pedestal radius can miss every cell
center while its decorative cap is still emitted. This study preserves and
exposes that geometry; it does not silently redesign it or certify walkability.
Its fixed lighting is not a migration of the complete game lighting system.

### Static structure verification and measurement

```sh
python3 -m unittest tools.game.tests.test_structure_model
python3 tools/game/dev.py test
```

Portable model checks compare the adapter with an independently assembled
production stamp across positive and negative chunks, including prefilled
terrain inputs. Boundary coverage, hollow interiors, open gates, unequal-height
steps, material boundaries, fixed UV density/phase and production shell
geometry have separate expectations. Temporary exact-source mutations exercise
lost boundaries, bad chunk offsets, stretched/reset UVs, missing shells and
invalid merging. These tests do not pretend to rasterize browser pixels.
The completed portable structure suite passes 51 geometry checks and detects
all 11 targeted mutations. Five assembly test methods additionally cover source
imports and isolation; together the Python runner reports seven passing tests.
The final core gate on 2026-09-26 passed all 158 unittest methods;
`dev.py build` confirmed the generated shipping header was already current.

**Verify structure visibility** now runs 18 native cases: the three structures
at scale 1, each in exterior, entrance and courtyard views with both triangle
and planar mapping. Independent ray/triangle intersections check nearest
surfaces at sampled pixels; flat and
textured depth buffers must agree, actual texture pixels must differ visibly
from flat color, and deliberately omitting the body must be detected. A
transparent background requires every covered pixel to be opaque and every
outside pixel to remain transparent. The fixture uses a 180×120 canvas, a
diagnostic checker, both filtered mapping paths and an 8,192-primitive budget,
not the currently selected preview settings. It is not
a temporal-quality, all-viewpoint or default-budget certification.

The original native verification on 2026-09-26 passed all nine triangle cases:
1,350 independent ray samples had zero depth mismatches; flat/textured depths
agreed; opaque
pixels equaled covered pixels with zero exterior leaks. All nine omitted-body
negative controls were detected. The shipping game/header were unchanged by
this study.

The final directional-mapper verification also passed all 18 cases at each
tile size, 64px and 128px: 36 checker checks across both mapping choices. This
remains a coverage and depth result, separate from motion quality and the
default 2,048-work budget.

**Run paired benchmark** measures the selected structure and viewpoint in
flat/textured/textured/flat order, with 20 warm-up and 90 measured frames per
phase. Each phase replays the same authored camera sweep; manual offsets are
not benchmark input. Only one view renders per timed frame. Reports separate
projection, mapping and remaining depth/paint submission, with p50/p95/p99/max,
RAF intervals, visible-work counts, caps, solid fallbacks and 60/120Hz submission
overruns. One-time model building and texture preparation are displayed outside
steady rendering. Hidden, offscreen, cancelled or failed-draw runs cannot be
reported complete. Results remain Canvas submission measurements, not GPU
completion, full-game FPS or a target-device guarantee.

Triangle-baseline exterior measurements, 2026-09-26, desktop in-app Chromium153:
360×240 internal pixels, devicePixelRatio 1, 128px smooth-sampled tiles, stable
filtered triangles, 2,048 primitives per view, scale 1 and the fixed layouts
above. Each model used a complete A/B/B/A run with 20 warm-up and 90 measured
frames per phase. Values separated by `/` are the two textured repeats.

| Structure | Submission p50 | Submission p95 | Submission max | Triangles/frame | Capped face-frames/repeat |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fortress | 1.9 / 1.9 ms | 2.2 / 2.2 ms | 2.4 / 2.4 ms | 436–517 | 52 |
| Arena | 5.1 / 5.0 ms | 5.8 / 5.8 ms | 5.9 / 6.0 ms | 1,097–1,220 | 81 |
| Watchtower | 2.2 / 2.3 ms | 2.5 / 2.6 ms | 2.6 / 2.7 ms | 334–375 | 0 |

All six textured phases had zero solid fallbacks. Capped face-frames count
faces reaching their refinement cap, summed over each 90-frame repeat, not
distinct failed frames or a fulfilled mapping-error target. Flat-control repeat
noise prevents claiming a precise texture-only cost difference from these
runs.

An additional fortress grazing-floor run with otherwise identical settings
measured textured p50 2.5/2.5 ms, p95 2.7/2.6 ms and maxima 2.8/2.8 ms. It
submitted 364–470 triangles and 693–898 pattern fills per frame, with zero solid
fallbacks or 60/120Hz submission overruns. One face reached its refinement cap
in every measured frame: 90 capped face-frames per repeat. Thus the floor can
hit its **per-face approximation cap while total work remains far below the
2,048-primitive scene budget**. This is not a maximum floor/object size or proof
of adequate perspective accuracy. These observations do not establish all
interior views, all-size performance, whole-game frame rate or actual 120Hz
presentation.

### Full-structure motion regression

**Test structure shimmer** runs a separate quality-only capture replay,
independent of the current preview controls. It renders each complete generated
model through the actual material/depth path, including its occluders, while
measuring a visible patch on a selected floor, wall or sloped roof. Diagnostic
black/white mortar bands use the model's real UVs: each dark band occupies 1/16
of a tile repeat. Lighting and palette tint are disabled only for these captures
so lighting changes cannot masquerade as mapping error.

The expected intensity is the exact fraction of each pixel covered by projected
stripe bands. A separate ray/plane derivation supplies rational UV coefficients;
the oracle clips projected band boundaries against the pixel square and
integrates area. It does not call the renderer's projection, tessellation,
texture transform or filter. Legitimate camera-induced appearance change is
subtracted from measured motion before computing residual shimmer.

Fixture v2 uses 360×240 private canvases, 16 frames, authored size 1.15,
rotation 0.22, two fortress buildings, twelve arena pillars and three tower
arms. The expanded runner now tests both 64px and 128px with both triangle and
experimental planar mapping: ten fixtures and four variants, 40 cases total.
The original baseline below used three variants, before the 64px planar case
was added. These include slow fortress/arena floors,
fortress front and grazing walls, an arena inner wall, the tall tower wall,
fortress/tower sloped roofs, and faster fortress-floor/tower-roof walks. The
usual camera step is (0.08, 0.035) world units per capture; walking cases use
(0.65, 0.3). Wall cases also move height by 0.04 units per capture. This is a
fixed image sequence, not a claim about a timed gameplay walking speed.

Floor/wall crops are 64×32 pixels; roof crops are 32×16. Their placement is
chosen from visible geometry, not from whichever region has the lowest error,
and is reused across compared mapping/tile variants. Every captured crop must
remain on the intended opaque surface, with target draw work and matching
depth. Nine independent nearest-surface rays per frame check that a hidden
target cannot be mistaken for the visible surface. Whole-scene and target-only
triangle/strip counts, caps and fallbacks remain in each frame's trace; choosing
planar mode is not proof that a particular target used strips rather than its
triangle fallback.

The established limits are unchanged: temporal residual RMS ≤0.05, spatial MAE
≤0.08, worst-frame temporal RMS ≤0.08, and worst overlapping 8×8-neighborhood
RMS ≤0.12, with neighborhood stride 4. Both expected and actual contrast/motion
must be present. Stationary and uniform moving controls must remain stable;
an injected alternating pulse in an 8×8 patch must fail the local quality gate.
The raw sampler is a **descriptive comparison**, not an assumed failing control:
some patches are easy for the raw path too.

Original native v2 analytic baseline, 2026-09-27: **QUALITY_FAILURE**, with nine
temporal failures out of 30 valid cases, zero spatial-limit failures and zero
setup failures. All cases below used anti-shimmer filtering:

| Failed surface / mode | Overall residual RMS | Worst local RMS |
| --- | ---: | ---: |
| Tower tall wall / 64px triangles | — | 0.19548 |
| Tower tall wall / 128px triangles | — | 0.20784 |
| Fortress sloped roof / 128px triangles | — | 0.12922 |
| Tower sloped roof / 128px triangles | — | 0.12079 |
| Fortress floor walk / 64px triangles | 0.07533 | 0.22678 |
| Fortress floor walk / 128px triangles | 0.07513 | 0.23216 |
| Fortress floor walk / 128px planar | 0.07376 | 0.17875 |
| Tower roof walk / 64px triangles | 0.07105 | 0.22183 |
| Tower roof walk / 128px triangles | 0.06794 | 0.25590 |

The dashes omit aggregate values not reproduced here; local failures alone
exceed the acceptance limit. Slow-floor and sampled fortress/arena wall cases
passed, but that is not evidence that those entire structures are shimmer-free.
The earlier isotropic planar wall/roof variants passed these particular patches;
the faster floor still failed alongside the earlier spatial-clarity failures.
No renderer repair was made as part of recording that baseline. The directional
candidate's later results must be compared separately, not substituted into
this historical table.

A complete repeat reproduced all 30 analytic results exactly, including the
same nine failures. `structure-motion-baseline.json` records the 2026-09-27
30-case evidence, including camera paths, crops, target bounds/work, metrics
and control results, with `QUALITY_FAILURE` retained. It is an observation for
reproduction and comparison, not a golden file that future CI should match.
All main cases had zero solid fallbacks. Failures were not
limited to cap exhaustion: the tall-wall target used 86 uncapped triangles,
and the slow tower-roof target used 75 uncapped triangles. The walking floor
hit the 256-triangle cap in all 16 frames, but its planar comparison still
failed while using 117 uncapped strips. The walking roof used 65–89 triangles
and reported refinement caps in five frames. Thus merely increasing a scene
budget is not an established repair. These observations do not isolate how
much error comes from affine approximation versus texture-footprint filtering.
Actual target-path counters matter: planar tower-roof cases used 183–214 strips,
whereas the head-on fortress wall in planar mode took the two-triangle fallback.

Stationary and uniform controls measured zero temporal residual RMS. The
injected pulse produced local RMS 0.3 and was detected. The raw comparison had
overall RMS 0.01691 and worst local RMS 0.05122 and passed its sampled patch;
it must not be reported as a deliberately failing negative control. The report
includes worst-region evidence panels showing actual previous/current and exact
expected previous/current images for diagnosis.

The 30 main cases validated 4,320 independent nearest-surface ray samples. An
additional nearer-occluder control changed the selected ray's nearest depth
from 100.2129758 to 50.1064879, with the rendered depth matching the nearer
blocker instead of the hidden floor. This control passed and guards the
assumption that an apparently stable but occluded target is not valid evidence.

The original two supplementary **DESCRIPTIVE_NUMERICAL_REFERENCE** captures used
the actual prepared 128px stone tile on the walking floor and walking tower
roof, with lighting disabled and the stable triangle mapper. The current
runner pairs triangle and planar variants for four diagnostic cases. Each
measures 16 frames
in a 32×16 patch. Independent ray/plane UVs sample the wrapped original source
texels at 8×8 and 16×16 positions per pixel. Values use the red channel divided
by 255, not normalization by the artwork's smaller observed contrast.

| Real-stone diagnostic / comparison | Temporal residual RMS | Worst local RMS | Spatial MAE |
| --- | ---: | ---: | ---: |
| Floor walk, actual versus 16×16 reference | 0.0493112 | 0.0803473 | 0.0403459 |
| Floor walk, 8×8 versus 16×16 reference | 0.0054894 | 0.0108222 | 0.0021932 |
| Tower roof walk, actual versus 16×16 reference | 0.0167670 | 0.0620637 | 0.0060231 |
| Tower roof walk, 8×8 versus 16×16 reference | 0.0038543 | 0.0079138 | 0.0010446 |

Both actual/reference comparisons fall below the numerical limits in these
captures, but they are not exact-oracle quality passes. Finite supersampling
has no proven error bound here; the 8×8/16×16 comparison demonstrates empirical
convergence only. These two cases are excluded from the 30 analytic pass/fail
totals and do not negate the stripe failures or certify arbitrary stone views.

The portable oracle suite passes 41 numerical contracts and detects 12 targeted
temporary source mutations. It checks projected area, boundary/horizon handling
and temporal-analysis sensitivity without claiming native pixel quality:

```sh
python3 -m unittest tools.game.tests.test_structure_temporal
```

The earlier baseline's full standard gate passed all 160 test methods in
73.835 seconds, with the generated header already current. That tooling/contract
result does not turn the nine native visual-quality failures into passes.

Initial v1 trials had invalid subjects or unstable capture setup and are not
counted as quality results. V2 uses explicit `willReadFrequently: false`, four
warm captures, and the full 0–255 artwork range so native byte values are valid
without clamping measured pixels or relaxing quality thresholds. Capture/readback
work belongs only to the opt-in diagnostic; its duration is not a rendering
benchmark. Arbitrary art, all viewpoints, terrain transitions and moving-game
integration remain outside this exact stripe-quality claim.

### Directional follow-up: current results and readiness

The directional path remains a selectable prototype, not the structure
preview's default or a shipping change. Passing selected quality cases is
insufficient: native context compatibility and measured submission cost also
matter. The triangle baseline is still available with identical source models,
camera and scene budgets.

The final expanded 40-case native structure run passed **20/20 directional
planar cases**, covering all ten fixtures at both 64px and 128px. The retained
triangle comparison passed 12/20 and still had eight temporal-quality failures.
All 40 cases had zero spatial-limit failures, setup failures or solid fallbacks.
This is success for the selected candidate path in the measured fixture, not
a claim that every path or the entire report is quality-clean.

The 64px virtual sampling chain resolved the remaining moving-roof failure
without changing its artwork, camera, oracle or thresholds. Its diagnostic
result now matches 128px:

| Directional case, each at 64/128px | Overall residual RMS | Worst local RMS | Spatial MAE |
| --- | ---: | ---: | ---: |
| Fortress floor walk | 0.0494820 | 0.1191881 | 0.0212726 |
| Tower roof walk | 0.0177176 | 0.0560098 | 0.0034755 |

The floor improves from the 128px triangle baseline's RMS 0.075126 and local
RMS 0.232158, but has little remaining margin below the 0.05 overall and 0.12
local limits. Passing this fixed replay is not a robustness guarantee for
unseen motion, material detail, pitches or resolutions.

The four real-stone diagnostics retain finite numerical references and remain
descriptive, not exact quality gates. For 128px stone, actual-versus-16×16
reference temporal RMS changed from 0.049311 to 0.031408 on the walking floor,
and from 0.016767 to 0.007192 on the walking roof when switching from triangles
to directional planar mapping. Neither those lower errors nor the 20 analytic
passes resolve the separate readback-context compatibility failures above.

The post-scalar-bound-cache fortress exterior comparison used 128px tiles,
360×240 pixels, devicePixelRatio 1, the same desktop browser and a complete
20-warm-up/90-measured-frame A/B/B/A run per mapping mode. Repeat pairs were:

| Mapping | Submission p50 | Submission p95 | Submission max |
| --- | ---: | ---: | ---: |
| Filtered triangles | 1.9 / 1.9 ms | 2.2 / 2.2 ms | 3.0 / 2.4 ms |
| Directional planar candidate | 3.5 / 3.5 ms | 4.5 / 4.5 ms | 4.8 / 4.6 ms |

Directional mapping itself measured p50 2.6 ms and p95 3.4 ms. Each measured
frame submitted 812–936 strips, 16–22 fallback triangles and 3,250–3,773 actual
pattern fills. There were no capped faces or solid fallbacks. Each 90-frame
repeat recorded 1,456 general-perspective declines: these used the normal
triangle fallback, not missing or solid-colored geometry. Submission p95 was
about twice the triangle baseline despite fewer triangles. This is direct
evidence against enabling the candidate by default on quality results alone;
it is not a full-game frame-rate or device-independent budget measurement.

Further final directional runs used the same 128px tiles, 360×240 resolution,
scale 1, 2,048-primitive budget and 20/90-frame A/B/B/A method:

| Directional view | Submission p50 | Submission p95 | Submission max | >8.33 ms submissions/repeat |
| --- | ---: | ---: | ---: | ---: |
| Arena exterior | 6.9 / 6.8 ms | 9.0 / 8.7 ms | 10.0 / 9.3 ms | 10/90, 13/90 |
| Watchtower exterior | 2.6 / 2.5 ms | 3.4 / 3.3 ms | 3.7 / 4.1 ms | 0/90, 0/90 |
| Fortress grazing floor | 2.5 / 2.5 ms | 3.2 / 3.3 ms | 3.5 / 3.9 ms | 0/90, 0/90 |

The arena submitted 1,321–1,594 strips, no triangles and 5,272–6,370 actual
pattern fills per frame; mapping p95 was 5.9/5.8 ms. The tower submitted
427–506 strips, 8–12 triangles and 1,726–2,045 fills. The grazing floor submitted
494–580 strips, 0–8 triangles and 1,878–2,222 fills, with mapping p95 2.1/2.0 ms.
These runs recorded no solid fallbacks; the arena and grazing floor also
recorded no refinement caps. None exceeded the
16.67 ms submission deadline, but the arena exceeded 8.33 ms before any
whole-game simulation or GPU completion cost was included. The preserved
triangle-only measurements above remain the historical comparison; do not
infer a precise paired texture-cost delta across separate sessions.

After the sampler and portable tests were frozen, the standard gate passed
all 160 methods in 71.215 seconds and again in 80.864 seconds. This verifies the tooling and portable
contracts, not universal native quality or performance; the browser-specific
compatibility and cost limitations above remain unresolved.

`structure-motion-repair.json` retains the final native comparison, both context
preferences, midtone compatibility failures, 64/128px visibility checks and
paired performance reports, with source hashes and the standard-gate result.
Its decision is explicitly `EXPERIMENTAL_OPT_IN_NOT_SHIPPING`. It is measured
evidence, not a passing CI golden; the original failure baseline remains intact.

## Before shipping integration

Review the samples in motion and select the desired art style. Extend filtering
coverage to varied materials, grazing angles and budget-capped distortion;
measure camera close-ups and larger scene counts on target devices. Add production lighting,
world-rebase and main-game occlusion/replay checks. Decide the texture-source
packaging contract before introducing imported images. Then let a shared
object system consume material IDs and local UVs rather than adding bespoke
texture drawing to every object.
