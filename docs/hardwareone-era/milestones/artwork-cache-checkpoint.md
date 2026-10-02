# Artwork cache pilot — 2026-09-20

Implemented locally in `hardwareone` on `codex/html-game`. Nothing committed or
pushed; unrelated game changes and G2/audio work were not edited by this pilot.

## Delivered

- Opt-in **Prop cache (pilot)** game checkbox for fern, fallen log, skull, rubble.
- Shared four-entry artwork registry, existing drawing recipes reused directly.
- Exact seed/variant/size identity, 2× backing resolution, fractional placement.
- LRU limits: 4 MiB retained RGBA pixels and 384 entries (browser overhead extra).
- Four-image/soft 1 ms cold-build budget per scatter pass; original rendering
  handles misses over budget, unsupported drawing state and allocation failures.
- Invalidation on compiled palette or drawing-function replacement; disabling
  releases retained images. Existing intrinsic alpha behavior is preserved.
- Projection, support, ordering and production scene-depth clipping stay live.
- Developer gallery at `/artwork.html` on the regular game preview server, plus
  the self-contained `artwork-cache-gallery.html` snapshot beside this note.

## Verified

- Generated firmware header current; both shipping scripts parse.
- `python3 -B tools/game/dev.py test --suite smoke`: 56 tests PASS (overlapping
  core + smoke total, not 56 additional tests).
- New cache harness: 29 checks, including identity, invalidation, LRU, byte and
  build limits, failure fallback, preserved caller state and production partial
  depth clipping. These are recording-host/geometry tests, not native pixels.
- Gallery embeds the shipping recipes and its assembled JavaScript parses.
- `git diff --check` passes.

## Not yet verified — keep opt-in

The session could not bind a local preview server. The Browser tool also
explicitly blocked navigation to the local HTML file; no workaround was used.
Consequently, native raster output and cached-versus-original performance have
**not** been measured. No FPS or drawing-time improvement is claimed.

The gallery's buttons provide the remaining checks:

1. Inspect original/cached panels on both daylight and dusk backdrops.
2. Run **Verify pixels and depth clipping**: 300 recipe/seed/size/fractional
   position cases, authored bounds, and actual scene-depth clipping. Small
   antialiasing differences are expected; pixel identity is not promised.
3. Reload, then **Measure 120 mixed props**. This compares command time at
   360×240 and 1280×720, fixed/changing sizes, with cold/warm results and cache
   hit/miss/build/memory statistics. It does not measure full-game FPS or GPU
   completion, nor include the game's projection/depth costs.
4. Finally compare the moving game with its checkbox off/on around an uphill
   bank/cave mouth. Look for edge softness, pop-in, opacity changes, clipping
   leaks, cold-cache stalls and size-change cache churn.

Only enable broadly after visual acceptance and a positive actual-game result.
If changing projected sizes causes excessive misses, keep the pilot disabled
and measure a revised size/reuse strategy before expanding it to other props.

## Designer entry points

`assets/games/src/07-decorations-lighting.js`: `paintFloorItem()` recipes.
`assets/games/src/07-artwork-cache.js`: registry, bounds and cache policy.
`assets/games/src/01-materials.js`: shared bone/rubble colors. Fern/log colors
remain local; this is not a full art/material migration.
`tools/game/artwork-preview.html`: reusable comparison gallery/measurement UI.
`assets/games/README.md`: authoring hooks, lifecycle and limitations.
