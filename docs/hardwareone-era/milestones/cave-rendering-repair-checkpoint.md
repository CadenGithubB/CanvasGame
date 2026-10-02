# Cave rendering repair checkpoint

2026-09-20 · `codex/html-game`

## What changed

- Ground, roof, ceiling, wall faces and entrance solids now share per-pixel
  depth. A visible lintel no longer makes buried pillar sections paint over
  foreground terrain. The entrance's height thresholds and top-point ray
  workaround are removed.
- Complete polygons clip at the near plane; nonplanar terrain cells are
  triangulated before projection. Cave visibility no longer switches wholesale
  when the camera crosses an underground/above-cap threshold.
- Cave floor, ceiling, walls and entrance rock share world-authored material
  colors: surrounding ground at the mouth, gradually changing to deeper stone.
  The camera does not select the material. Lighting remains separate and
  readable. Constructed frames retain their own material.
- Wall decorations retain correct supporting-cell ownership after chunk
  assembly, fit the actual wall span, and place glow at the flame. Terrain
  clips the decorations and glow rather than letting them float through it.
- Added Side left, Side right, Oblique, Roof edge and Fixed noon test controls.

## Verification scope

Focused tests exercise partial burial (hidden lower face, visible upper face),
the open doorway sightline, both seeded entrance kinds, camera-independent
material, wall/flame attachment, depth interpolation, near-plane clipping,
buffer reuse/resizing, and triangulation. A mutation test intentionally omits
terrain depth and must reproduce the original buried-jamb failure.

Final verification:

- Core build/check/test: 32 tests pass, including 195 focused gameplay/render
  assertions and the terrain-depth mutation regression.
- Core plus smoke: 38 tests pass. Core plus cave traversal milestone: 37 tests
  pass. These command totals overlap; they are not separate test inventories.
- An isolated shipping-only copy also passes all 32 core tests without handoff
  documents or the optional audit lab.
- Browser: descending side/approach/mouth/interior/above-cave and hillside
  side/roof-edge/interior/look-back inspected. Visual review caught and repaired
  floating wall decorations and triangle-edge coverage cracks during this pass.
- Generated header matches source; JavaScript syntax and diff checks pass.

Final generated-header SHA-256:
`5bf14050aac224af48c48ae9455a3b6901a7f5c8b2a7edd7b4cea6e1d3c06880`.

## Still open

- Generic actors, pickups and some effects still use legacy visibility paths.
  This repair establishes shared opaque geometry visibility; it does not claim
  every engine rendering bug is solved.
- Full-resolution depth adds CPU work and scales with canvas size. Storage is
  about 1 MiB at 360×240, 4 MiB at 720×480 and 24 MiB at 1080p, retained for reuse.
  Desktop fullscreen performance needs further profiling; no ESP32 or physical
  hardware performance claim is made.
- Coarse terrain/cave faceting and art quality still need polish. The interior
  remains one small constant-height route with one entrance.
- Same-browser save/resume, permanent loot/enemy clearing, richer cave layouts,
  landmarks and protected outposts are not implemented yet.

## Try it

Open [the local preview](http://127.0.0.1:8001/), refresh, select Cave Test, and
compare Descending and Hillside with the named view buttons. Fixed noon makes
material comparisons repeatable. Keyboard + Mouse enables walking between them.

No G2/audio or shared firmware configuration was changed. Nothing was staged,
committed or pushed. Handoff documents and the optional audit lab remain local
and must not be included in a future commit.
