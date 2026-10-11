# Changelog

## Unreleased

- Fixes chest face order, so the lock and trim never show through the back, and
  market stalls: facings are normalized at the window boundary so stalls no
  longer vanish, collision matches the drawn table, and stalls and the guard
  tower stand on their sampled terrain height and are hidden by terrain in
  front.
- Closes the texture pilot's antialiased seams with owner-mask edge coverage,
  stops near-equal split edges from flipping between frames, and makes hybrid
  mapping (planar row strips, triangles elsewhere) the structure study default,
  with recorded tessellation and tile-size evidence.
- Brings 3D models for wall props, chests, spawner obelisks, floor props,
  landmarks and structures into the game, with hybrid-mapped structure textures
  and triangle-mapped prop textures (chest wood, obelisk stone) from the
  procedural material catalog on a per-frame budget. Every new path is a render
  feature: the Recommended preset turns them on, Legacy (the pre-integration
  reference) turns them off, G switches presets, the Graphics row sets single
  switches, and with Show FPS on the HUD shows the preset and texture counters.
  Adds the `/render-lab.html` developer page and a developer "go to nearest
  landmark" action.
- Adds spell visuals slice 1: per-spell visual recipes, a cached glow sprite
  layer without shadow blur, bolts and bursts drawn in front of enemies, and a
  Spell gallery mode in the casting studio.
- Adds a unified, recipe-driven effects system that owns every transient effect
  list, with occlusion tiers and a performance governor. Ambient motes, torch
  embers and glow, bones, pickup bursts and flame embers move onto it, and
  Settings > Effects adds weather (rain, peak snow, ash), impact debris (sparks,
  chips, dust) and footstep, landing and dash dust presets. Adds the
  `/fx-bench.js` effects benchmark.
- Adds a held staff casting rig to the casting studio (preview only; normal
  play still draws the original arms). The spell HUD panel now shows on a spell
  change or cast, stays while the spell is busy or mana is short, and otherwise
  fades.
- Adds a solved water system: springs run downhill and fill basins as flat
  lakes, rivers are carved into the terrain with banks, one solved water model
  feeds a 3D pass that draws lakes and rivers, and wading slows actors while
  currents carry the player; movement, enemies and effects read that model
  through one `waterAt` query. No spring, river, spring-fed lake or carve
  touches fortress, arena and watchtower floors or a 48 u margin around them
  (legacy valley pools there keep their water), carving is bounded, and rivers
  drain where they would reach that reserved ground.
- Fixes the classic-level 3D floor crash (audit D24): classic levels now build
  the per-layer floor colors the 3D floor pass reads.
- Stops silently dropping 3D floor cells and sprites: the floor cell buffer
  grows to the view's scan rectangle (audit D25) and renderEntities3D's sort
  buffers grow past 512 entities. A classic level keeps its boosted view
  distance when settings are applied.
- Integration follow-ups: the Perf HUD counts each stage once per rendered
  frame and keeps casting-studio and cave-profile frames out of the live table,
  a modeled wall sconce's torch glow tests visibility at its own flame, and
  fx-bench and the browser profile record the render preset and effect family
  modes.
- Refreshes the audit lab: page reloads restore the simulation clock, probes
  can expect a precondition failure, entries for repaired defects (D19, D24's
  fixed-level floor crash, D25, G7/N1, G8, N2, N5 and N11) are retired while
  D24's Endless goal-spawn and calibration parts remain known bugs, the missing
  near-chest prompt in caves is recorded as a known game defect, and stale
  fixtures and probes are repaired or re-anchored. The harness runs under Deno
  as well as jsc, and the core gate grows from 160 to 367 tests.
- Continues the audit lab refresh. The enemies lab now steps enemies the way
  gameUpdate does, which exposes a patrol route-planning defect (patrol plans
  to the enemy's own feet height, and the planner refuses a height change on
  its first off-grid hop) that leaves two enemies stuck after a chase. The
  cave geometry lab judges the ground surface before the river carve and
  records that the carve can leave a step too tall to climb, and that every
  normal Endless cave mouth bears 0-108 degrees from its region centre
  (audit D16). The return-to-patrol check gives each enemy its own walking
  budget to the waypoint it is steering to instead of a fixed 20 s, so it is
  looser for slow or wading enemies and tighter for fast ones, and its detail
  lists every return later than 20 s. Vacuous fix probes became defect
  reintroductions, every cave milestone and retired cave transition check has
  a probe that fails it, and a probe can pin a detail regex.

## 0.0 — 2026-09-27

- Initial standalone game snapshot, including the source assembly, generated
  compatibility header, procedural artwork/textures, and developer previews.
- Includes shared spatial queries/motion, fixed-tick simulation, presentation
  interpolation, NPC controllers/navigation, and their regression suites.
- Includes game audit tools, design/testing guidance, and sanitized historical
  evidence. No unrelated firmware or original repository history is imported.
- Keeps experimental texture mapping opt-in and records unresolved visual and
  performance issues. LOD and coverage-first texture budgeting remain planned.

See [release notes](docs/releases/0.0.md) for scope and known limitations.
