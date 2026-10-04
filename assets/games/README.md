# Game development

This source tree is now part of standalone CanvasGame 0.0. See the root README
for setup and current validation. The compatibility header path and historical
development measurements below are retained; no ESP-IDF or hardware is needed
for the browser preview.

The editable game page lives here. `components/hardwareone/WebPage_Games.h` is
the generated firmware artifact; edit the sources here and regenerate it instead
of editing that header directly. The firmware continues to consume the checked-in
header, so source changes and their regenerated header belong in the same commit.

This first split preserves the original header byte for byte. It changes where
we edit the game, without changing gameplay or the firmware build configuration.
The verified migration SHA-256 is
`3398802a20f09ac0f2064800d9b51999e3f72fb71b672cbfc8dd18007f0ecd8b`.
That records this migration only; future game edits should change the header, so
the hash is not a permanent test expectation.

## Source layout

- `manifest.json` defines the source assembly and JavaScript fragment order.
- `header.h.in` supplies the C++ wrapper.
- `page.html` supplies the page markup.
- `page.css` supplies the stylesheet.
- `src/*.js` contains the JavaScript in named, ordered sections.

Useful starting points within `src/`:

| Area | Files |
| --- | --- |
| Biome palette and shared object materials | `01-materials.js` |
| Configuration and shared state | `01-config-state.js` |
| World generation and floor queries | `03-level-generation.js`, `05-endless-world.js`, `06-floor-queries.js` |
| Shared geometry, body motion, projectile sweeps | `06-spatial-geometry.js`, `06-spatial-queries.js`, `06-spatial-motion.js`, `10-projectile-queries.js` (contract in `SPATIAL.md`) |
| Movement and combat | `09-physics.js`, `10-combat.js`, `11-enemies.js` |
| Rendering | `12-scene-depth.js`, `12-render-core-walls.js`, `13-render-floors-ceilings.js`, `14-render-entities.js`, `15-render-hud-menu.js` |
| Texture mapper (`TexturePilot`), called only through `12-world-textures.js`; also injected into `/textures.html` and `/structures.html` | `12-texture-mapping.js` (contracts in `tools/game/TEXTURES.md`) |
| World textures: `WORLD_TEXTURE_DEFAULTS` (the structure study's optimum), the catalog-to-`GAME_MATERIALS` table, the once-per-tile-size catalog with a session failure flag, per-frame engage rules (flat frames count their reason) and `fillSceneDepthTexturedPolygon`, which paints a face's own scene-depth mask (same options as `fillSceneDepthPolygon`) with hybrid mapping, a 32% wash and luma-normalised light, and repaints the prepared mean on any decline or failure; `structureTextures` is ON in Recommended (stage E2) with its parameters (mapping, tile, owned edges, budget, max rows, min pixels) on the Graphics row, Toggle Textures as the master, the Texture debug checkbox as a per-face path tint and the counters on the HUD render line. Headless hosts (the audit lab) fail the catalog build, so they never exercise the textured path. Stage L adds `propTextures` (default ON since the native magnified-band check passed; OFF in Legacy): chest body and lid in wood, the spawner obelisk's body in stone, through the same sink from `drawWorldModel`, triangles only, on the frame's shared budget and counters | `12-world-textures.js` (tests in `tools/game/tests/world_textures.js`, `prop_textures.js`) |
| Shared prop/landmark model core: frozen `definePropModel` records, `buildModelFaces`, bases/adapters, `worldFaceShade`/fog, exact-cull `drawWorldModel` and the ruin-decor capture sink (`modelBackfaceCull` switch); the wall-prop models drawn by `drawWallDecorations(phase)` (torch, sconce, and shield and banner per heraldry family; `wallPropModels` switch, default on); the treasure-chest models drawn by `drawTreasureChests3D(phase)` (open-top body, lid hinged at the back top edge, trim/strap/lock plate; `chestModel` switch, default on since stage G2); the spawner obelisks drawn by `drawEnemySpawners3D(phase)` (a square frustum capped by a pyramid inside the r 25 / h 90 projectile hit cylinder, emissive rune strips pulsing at each spawner's own phase, eye, glow and HP bar as billboards depth-tested against the body's analytic depth under them, and the legacy billboard for a spawner whose obelisk the camera is in or at, since spawners have no movement collision; `spawnerModel` switch, default on since stage H); the landmark opaque pass `drawLandmarkOpaque3D` (ruin faces and structure shells before `sceneEntities` and every billboard stage, the late stages keeping only depth-clipped overlays; `landmarkOpaqueEarly` switch, default on); the exact early reject of a model hidden by nearer scene depth at its bounds' nearest depth (`modelEarlyReject` switch, default on since stage K; counted as `mdl<Family>Rejected`) | `12-prop-models.js` (tests in `tools/game/tests/prop_models.js`, `wall_decor_driver.js`, `chest_model.js`, `pass_order.js`, `spawner_model.js`, `culling.js`) |
| Structure render models: one merged body+shell model per fortress, arena and watchtower from the window grid, with a walls3D ownership mask that leaves cave-touched cells to walls3D; while `structureModels` (default on, off in Legacy) is on, the `structureModels3D` stage draws them opaque between platforms3D and walls3D, walls3D skips the owned cells and merges their column depth, the late shell draws only beyond viewDist (colour-fogged), and any exception falls back to walls3D and the late shell for the session | `12-structure-models.js` (tests in `tools/game/tests/structure_models.js`, `structure_model_draw.js`) |
| Floor-prop models (stage I): crate, barrel, boulder, stone column, sand pillar, mesa boulder, stalagmite, tree stump, fallen log, rock spire, cave rubble pile and rock arch as closed, depth-writing models (`FLOOR_PROP_TYPES`, 8 shapes per type plus the sprite's broken-crate and mossy-boulder variants, jittered hulls as triangle meshes) sized in the sprite's unit s = 1500 x tierScale / 180, turned and shaped by `propInstanceKey`(type salt, rounded absolute x/y, stored seed) and standing on the lowest `getEntityRenderFloorZ` under their base outline, sunk 0.15; `drawFloorScatter3D(phase)` draws them in the opaque phase (`drawFloorPropModels3D`, near to far, colour fog, cached with the anchor cache) and drops them from the sprite pass; every other scatter type (rock_pile, skull, crystal and the rest) stays a sprite (`floorPropModels` switch, default on since I2, off in Legacy) | `12-prop-models.js`, `07-decorations-lighting.js` (tests in `tools/game/tests/floor_prop_models.js`; lab `tools/game/render-lab/60-floor-props.js`) |
| Prop culling and counters (stage K): with `decorAnchorCache` (default on) the floor-scatter, wall-decoration and ore loops reject by distance and view before any terrain query and cache the heights a prop stands on or hangs from; the cache drops on a new `floorMesh`, every window assembly and `noteWorldGeometryEdit()`, which code that edits the mesh in place must call. Per-family depth-clip counters `clip<Family>` and anchor counters `terr<Family>`/`hit<Family>` reach the Perf HUD | `07-decorations-lighting.js`, `05-endless-world.js` (tests in `tools/game/tests/culling.js`) |
| Landmark models (stage J1): shrines (pedestal plus a translucent, emissive crystal at the legacy bob), market stalls (slab over the collision box of `repelFromStalls`, legs, poles, awning and stripe, goods within 200 u) and the guard tower (box and merlons; a camera in or at it keeps the legacy painter, since the shop stands there), and the fortress forge, lectern and banner, standing on `getEntityRenderFloorZ` (the surface over a cave, not the lowest layer). They draw in the landmark opaque pass; the late `marketStalls3D`, `shrines3D` and `structures3D` stages keep the glows, labels and prompts as depth-clipped billboards. `landmarkModels` switch, default on since stage J2 | `12-prop-models.js`, `15-render-hud-menu.js` (tests in `tools/game/tests/landmark_models.js`, `stall_visibility.js`) |
| Landmark bounds gate (stage J2): shrines, stalls, the guard tower, structures, ruins and cave portals are culled by their world bounds (`entityVisible3D`'s `worldRadius` for scene-depth callers: wholly behind the depth-1 near plane or wholly out of range), not their centre point, so a camera past a landmark's centre or at a portal mouth keeps the part ahead; a centre behind the camera has no screen point. Structures keep the hill test only for bounds wholly beyond `viewDist`; opaque ruin dressing keeps its centre limit at `viewDist` (the bounds extend only its near-plane test); from inside a cave the roof's scene depth hides a surface landmark; the stall and tower keep their audited centre gates, re-asked with the bounds only for a centre behind or out of range; the legacy painters (models off) keep their gates (`landmarkBoundsGate` switch, default on) | `01-config-state.js`, `12-prop-models.js`, `15-render-hud-menu.js` (tests in `tools/game/tests/landmark_bounds.js`) |
| Loot and companions | `19-companions-loot.js` |
| Frame loop and lifecycle | `21-frame-loop.js`, `22-lifecycle.js`, `23-events-init.js` |
| Developer landmark finder ("Go to nearest landmark"; user-invoked only) | `22-landmark-finder.js` |

Use `manifest.json` for the complete ordered list, including the separate
`00-errors.js` bootstrap script.

The JavaScript sections are navigation boundaries, not independent modules. Both
original script regions are preserved. The main script's fragments are joined
without added bytes into one classic script with its existing shared scope.
Reordering them, introducing module syntax or strict mode, or broadly formatting
them can change behavior. Establish real subsystem interfaces in separate,
focused changes.

## Edit and verify

Run these commands from the repository root:

```sh
python3 tools/game/dev.py build
python3 tools/game/dev.py check
python3 tools/game/dev.py test
```

`build` assembles the sources, validates JavaScript syntax, and updates only the
generated header after validation succeeds. `check` checks that the header is
current and that the assembled JavaScript parses; it does not update the header.
`test` performs those checks and runs the tooling's unit tests plus the small
shipping cave geometry, support/headroom, lighting, and rendering regressions in
`tools/game/tests/`.
Those spatial tests are not a substitute for full-runtime movement and browser
checks when changing gameplay.

The tooling uses Python 3's standard library, without npm packages or ESP-IDF.
All commands shown here also validate syntax and need a supported JavaScript
engine. The existing portable runner finds Node, Deno, Bun, QuickJS, or macOS
JavaScriptCore/JXA automatically. A missing engine is an error, not a successful
check. This Mac can use JavaScriptCore without installing Node.

Keep a change small: edit the relevant source, run `build`, run `test`, and review
both the source diff and generated-header diff. For behavior changes, add or
update focused gameplay tests and update any known-bug expectations whose
behavior has intentionally changed.

## Browser preview

```sh
python3 tools/game/dev.py build
python3 tools/game/dev.py serve --port 8001
```

Open `http://127.0.0.1:8001/`. The server binds to loopback only. It assembles the
preview in memory for each request and requires the generated header to be
current. After another edit, run `build` and refresh the browser; there is no hot
reload. Stop the server with Ctrl-C.

For entrance comparisons, select **Cave Test** in the terrain menu, then choose
**Descending** or **Hillside**. Its named viewpoint buttons place the player at
the approach, mouth, inside, looking back, chamber, or surface above the chamber.
Side left/right, Oblique, and Roof edge exercise terrain occlusion. Fixed noon
keeps lighting constant for comparisons and restores the cycle when disabled
or leaving Cave Test. **Visibility fixtures** pauses simulation and temporarily
renders an enemy, chest, and fire orb inside the entrance. Compare Mouth/Inside
with Above cave/Oblique to check both visible content and occlusion. Fixture
objects are render-only: gameplay arrays are restored after each draw. Disabling
the checkbox restarts normal Cave Test; leaving Cave Test clears it.
Normal Endless play still
chooses cave sites and styles from its seed. Use Keyboard + Mouse to test walking
between viewpoints rather than relying on teleport views alone.

### Browser performance checks

The separate `/textures.html` route is a developer-only material study. It
compares identical flat/textured room and chest-proxy geometry using the real
camera and opaque-depth helpers, with 64/128px original bitmap tiles, camera
presets/sweep, filtering, chest scaling, lid motion and an occlusion pillar.
Anti-shimmer is enabled by default and uses prepared, periodically wrapped
filter levels; disable it for the original raw-sampling comparison. Crisp
sampling is preserved for magnification, while distant surfaces are filtered.
The separate **Directional long lines · experimental** candidate uses fixed
pixel-row/column mapping and bounded two-tap directional filtering on eligible
planes, with the old triangle path retained as a fallback. All five perspective
cases now pass on the preview's graphics-context preference. The original
readback-optimized captures remain gates: three still report invalid samples
from native two-byte color rounding, rather than being clamped or given looser
tolerances. The candidate remains opt-in because of this compatibility issue
and higher draw-call cost. **Test filter compatibility** isolates midtone drift.
It does not change the shipping UI or introduce textures into the main game.
Run its native pixel checks, **Test texture shimmer** motion regression and
serial A/B/B/A benchmark before deciding on a shipping material pipeline.
The shimmer check measures color stability against independent pixel-footprint
integration, with translation, zoom/LOD-boundary and perspective long-line
replays. Local overlapping neighborhoods catch line crawling hidden by a calm
whole-image average. The raw sampler remains a negative control; quality
failures are not relabeled as passes. The benchmark reports triangles plus
strips, actual pattern fills, fallback reasons and base/filter pixel memory. See
`tools/game/TEXTURES.md` for scope, tests, recorded measurements and limitations.

The separate `/structures.html` route applies those materials to the actual
fortress, arena and watchtower recipes, importing the production wall stamp,
decorative shell, camera and depth code. It bakes exposed local-space faces once,
merges compatible cell boundaries and keeps texture repeats at 32 world units.
Compare flat/textured views, authored size 0.85/1/1.15, five camera presets and
2,048/4,096/8,192 primitive budgets; inspection movement has no collision.
Anti-shimmer filtering is always on in this structure preview; planar mapping
is a separate experiment and remains off by default. Native visibility
checks and a separate 20-warm-up/90-measured-frame A/B/B/A benchmark distinguish
geometry correctness, texture quality and submission cost. Terrain, gameplay,
streaming and shipping integration are deliberately absent; existing recipe
quirks are preserved. The expanded 18-case visibility check passed for both
mapping paths. The historical triangle-path
exterior textured submission medians were 1.9 ms for the fortress, 5.0–5.1 ms
for the arena and 2.2–2.3 ms for the watchtower on the measured desktop setup.
These are isolated submission timings, not whole-game FPS or a texture-quality
pass. See `tools/game/TEXTURES.md` for conditions, caps and remaining limits.
**Test structure shimmer** adds native full-model motion captures against an
independent exact projected-stripe oracle. The original 30-case failing baseline
is retained. The expanded 40-case comparison now passes all 20 directional
candidate cases at 64/128px, while the triangle comparison still fails eight.
The floor-walk pass has little margin below its unchanged limits, so this is not
all-camera certification. The candidate remains off by default: the measured
fortress exterior p95 submission cost rose from 2.2 to 4.5 ms, and the
readback-path compatibility issue remains open. Historical failures occurred on
uncapped faces, so larger budgets alone are not an established fix. Four actual
stone comparisons are reported separately as finite-sampling diagnostics, not
exact quality passes or replacements for the failing stripe tests.
The recorded evidence is `tools/game/structure-motion-baseline.json`; it retains
`QUALITY_FAILURE` and is not a future CI golden. Portable oracle checks and the
160-method standard gate pass independently of those known visual failures.

The separate `/physics-profile.html` local-preview route runs an opt-in live
simulation/Canvas fixture, with five seconds of warm-up and 30 seconds of
measurement. Open it in a separate test tab, not over a positioned live game.
It reports native timing, actual entity counts, coarse simulation stages and
frame cadence. Fixture v5 has separate mixed cave-combat and authored navigation
workloads: validated friendly movement/attacks, or 20 actual short-wall detours.
It measures shared-controller/navigation stages, per-tick search work bounds and
real route crossings, plus render-interpolation snapshot/adapter overhead.
Compare v5 runs with identical options; earlier versions are not an A/B baseline.
The pinned-player workload measures overhead, not camera-translation smoothness.
This developer page is not included in the shipped game UI.
Use the same browser, resolution and workload for serial comparisons; its
desktop results are not a mobile budget guarantee. See `SPATIAL.md` for the
implemented physics boundary and microbenchmark commands, and `AI.md` for NPC
profiles, local navigation/memory contracts and deferred global routing work.

The **Graphics** row (and the G key) switches render paths in place for A/B:
**Recommended** uses every verified path, **Legacy** is the pre-integration
reference, and **Custom** appears after changing one switch. Switches are
presentation-only and in memory only. The row also sets **Fullscreen rows**
(fullscreen honours the Resolution setting, then caps rows with the aspect kept;
360 rows by default, Native selectable)
and runs developer actions such as **Go to nearest landmark**, which loads the
nearest fortress, arena or watchtower as a walk-in would and lands outside it,
out of every live spawner's waking range and, where such a cell exists, at
least four seconds' walk from every enemy (otherwise it says so). Each press
moves to the next landmark, skipping ones it could not reach; a new run starts
the cycle again.
Console: `renderPreset('legacy')`, `setRenderFeatures({...})`,
`getRenderFeatureStats()`, `runRenderAction(key)`, `goToNearestLandmark()`.
With Show FPS on, the canvas HUD adds `R:<preset> TEX <prims>/<budget> fb <n>`;
the Perf HUD text lists every per-frame render counter.

The separate `/render-lab.html` route (developer page, never shipped) freezes
time and randomness, stops the loop, steers seeds, and runs A/B/B/A render
timing (20 warm-up + 90 measured frames), a 600-frame G-press run and pixel
captures. Timing and pixel readback need separate fresh tabs. The Legacy
recording reference is pinned by `tools/game/tests/test_render_parity.py`.

In Cave Test, choose a viewpoint and use **Profile preview** or **Profile
fullscreen**. Each run pauses the three visibility fixtures, warms up 12 frames,
then samples 60 browser animation frames. Native fullscreen exits automatically;
the separately labelled viewport-size fallback is not native fullscreen.
**Cancel profile** and changes to the scene controls cancel the run safely.
Disable Visibility fixtures afterward to restart normal Cave Test.

The report separates render-command time from actual animation-frame intervals.
It includes inclusive subsystem times: do not add `draw()` to its child stages.
This is a frozen render workload, not a complete simulation or device benchmark.
The Perf HUD also uses animation-frame cadence for FPS, rather than the
reciprocal of CPU work time. Hidden Cave Debug maps are no longer redrawn.
The Perf HUD's stage table counts each stage once per rendered frame (its
average and max are per frame; a frame's simulation ticks are one call). The
profile's frames, like the casting studio's, time into their own tables and
never reach the live Perf HUD or its 5 s breakdown reset.

Particle, exploration, and lighting inputs are made repeatable temporarily and
the real world's references are restored afterward. **Verify pixels after
profiling** is off by default. Enabling it adds an untimed full-image/tile hash,
but browser pixel readback can affect later Canvas performance. Use fresh page
loads with pixel verification off for performance comparisons; keep pixel
verification as a separate correctness check.

## Shared palette and material authoring

`src/01-materials.js` is the appearance-data entry point. It loads before
`01-config-state.js` and has no DOM, Canvas or gameplay initialization. The
existing `BIOME_PALETTE` and floor-band thresholds moved there without changing
their values or public names. Biome colors still feed terrain, walls and sky;
`makePattern()` now reads `patternBase` instead of duplicating its base color.
Its existing four recipe choices/fallback and inline fine-detail colors remain.

`GAME_MATERIAL_COLORS` contains named base-color families. Approved visual
passes can extend a family with additional authored roles without changing its
consumer API:

| Material | Connected consumers |
| --- | --- |
| `caveStone` | Authored interior albedo, mineral variants and stable legacy fallback; cave floor/wall/ceiling/rock-cut readers consume the shared field |
| `entranceStone` | Constructed entrance pillars and lintels |
| `palisadeWood` | Entrance flanking planks |
| `rubbleStone` | Rubble and rock piles |
| `crateWood` | Crate body, bracing, broken interior and outline |
| `wallPropWood`, `wallPropIron` | Constructed wall mounts, shafts, frames, rims and bosses |
| `wallHeraldry`, `wallFlame` | Banner/shield fields and low-cost torch/sconce flame layers |
| `floorPropWood`, `floorPropIron` | Barrels, fallen timber, debris, chains and other floor clutter |
| `floorFoliage` | Grass, ferns and dry floor vegetation |
| `bone` | Bones, dry bones, skulls, rib cages and femurs |

Author six-digit hex colors in that object. `compileGameMaterials()` validates
them once at startup and derives the read-only `GAME_MATERIALS` catalog. Use
`.hex.role` for Canvas styles, `.rgb.role` for channel arithmetic, or
`.packed.role` for stored RGB integers; do not duplicate a color in each format.
For example, `GAME_MATERIALS.crateWood.hex.base` reads the crate's base color.
Ordered `.swatches` are reused by rubble/rock-pile variation; their order follows
the named colors in the source definition. Keep that order intentional.

After editing colors, run `build` and reload the page. Cave colors are authored
into chunk meshes and some artwork is cached: changing a global halfway through
a session is **not** a supported live-theme operation. Materials remain base
appearance rather than texture maps or geometry. Authored cave variation clamps
RGB channels so near-black/white material colors cannot overflow.

Crystals, many other props, larger structures, creature/hand sprites,
spells and HUD colors still have local definitions. Migrate those incrementally
as their art changes; do not mistake this initial catalog for complete engine
coverage. Materials describe base appearance, not a physically based renderer.

The shipping material regression records production drawing commands and checks
the approved command baseline for eight prop types, seven pattern inputs and
three entrance styles. It also verifies that editing shared definitions reaches actual
consumers, validates compiled forms, and checks black/white grain boundaries.
Its compatibility hashes are intentional visual baselines; update them only
when an approved art change warrants it. These are command-level checks, not a
replacement for native-browser visual review of a new art style.

### Indoor stone V1 (2026-09-20)

The layered cave renderer is currently the only world path with a unified
ground, wall and ceiling interior. Fortresses, arenas and watchtowers still use
surface terrain and grid walls beneath their world-authored exterior shell;
this pass does not pretend they are closed rooms.

The cave interior now uses the low-saturation **Ashen Reliquary** treatment:
the walkable floor is the lightest navigation plane, walls use a soot-dark roof
join/readable middle/contact-dark base, and the ceiling is the darkest enclosing
mass. Existing amber point lights warm all three roles consistently, while
ceiling light response stays restrained. This indoor-stone pass does not alter
the exterior cap, HUD, crosshair or any other UI rendering.

`sampleInteriorStoneAlbedo()` authors fine 12-unit grain plus broader 48/96-unit
base, damp, iron and worn-mineral fields into the existing packed `caveStone`
mesh value. Hashes use absolute world coordinates and no random/camera state,
so the material remains stable across yaw and streaming-window rebases. Mouth
rock still blends continuously from the pristine neighboring terrain palette.
`shadeCaveSurfaceColor()` applies allocation-free role, local-light, fog and AO
arithmetic at draw time and returns packed RGB for the existing `rgbQ()` cache.
That shared cache now rotates on a novel color after 4,096 retained entries;
hot colors remain hits, while long sessions cannot retain every fog/light mix.

This V1 adds no polygons, texture canvases, patterns, blur, dynamic lights,
collision changes or extra depth submissions. Walls retain one cached gradient
per quantized color/screen range; the interior/exterior ramp bit is part of the
cache key. Helper-level material tests cover role ordering, bounded mineral
fields, warm local-light response, deterministic authoring and safe fallbacks.
Debug-off production regressions pin the floor/ceiling colors and both wall
ramps, including an interior/exterior same-color cache-key collision; seeded
render regressions separately preserve geometry and depth.

Informal Indoor V1 checkpoint: the same seed-12345 Inside scene at 360×240 measured
10.1 / 10.7 ms median / p95 render commands before the pass and 10.2 / 10.7 ms
after it. Final wall and ceiling stages were 2.4 / 2.8 ms and 1.6 / 1.7 ms;
animation-frame cadence remained 16.7 ms median. Visual review covered the
descending Inside/Chamber/Look-out views and the hillside Chamber view. This is
one fresh-page native-browser sample, not a device/GPU/thermal benchmark; no
fullscreen check was run, and this indoor-stone pass made no UI changes.

### Ruined Hut V1 (2026-09-20)

Ruined Hut dressing is now authored in structure-local world space. Rubble,
the waypost and the two partial roof beams no longer depend on camera distance;
they follow terrain height, clip at the near plane and use the shared scene
depth field. This removes the old orbiting debris, hillside intersection and
whole-decoration pop as the player approaches. Only the depth-clipped label
fades; solid ruin pieces remain opaque when they write depth.

The hut footprint is a rotated broken 5×4 outline with a three-cell entrance,
several low wall heights and a deliberately missing corner. Generation selects
a nearby dry, reasonably level site, reserves a clear 7×7 pad, removes stale
scatter/decor/actors from that pad and assigns explicit rubble-stone colors.
Authored ruin and structure walls are excluded from the natural forest
bark/canopy path. The HUD and controls are unchanged.

### Wall Props V1 (2026-09-20)

Constructed wall items now read as mounted objects instead of flat symbols.
Torches have iron backplates/brackets, tapered wooden shafts, retaining bands
and three flat flame layers. Sconces have a separate plate, projecting arm,
bowl and flame. Shields use a pointed heater silhouette, rim, field, heraldry
and raised boss; banners use a crossbar, finials, cloth folds, swallowtail hem
and one of three deterministic heraldic treatments. Stable cell/side hashes
choose the variants, so they do not crawl or change as the camera moves.

The sweep also repairs a visibility bug in endless generation. Its former
`stalactite`, `crack`, `moss`, `frost_crack` and `vine` names did not match any
3D recipe. New chunks emit canonical types, and cached chunks normalize those
old names as they enter the active window. Cracks now have a real branched wall
recipe and a matching 2D overview mark. All twelve generated wall-prop types
have command-level coverage.

This remains a bounded Canvas path pass: no gradients, filters, blur, texture
canvases, pixel reads or new lights were added. On the native 360×240
seed-12345 Approach fixture, `sceneEntities` measured 1.0 / 1.1 ms median / p95
before the pass and 1.0–1.1 / 1.1–1.2 ms across two post-change runs. Whole-frame
render commands moved from 11.3 / 12.0 ms to 11.2–11.4 / 11.5–11.9 ms, with
16.7 ms median animation cadence. Treat these as single-host command timings,
not an ESP32/GPU/thermal guarantee. Wall geometry, collision, depth clipping,
controls and HUD are unchanged.

### Structure Shell & Floor Clutter V1 (2026-09-20)

Fortresses, arenas and watchtowers now have distinct world-authored silhouettes.
Fortresses gain gate lintels, capped corner towers, a six-sided central canopy,
gabled inner roofs and four standards. Arenas gain rotated gate lintels,
standards, a pillar entablature and a central pedestal. Watchtowers gain a tall
central cap plus rotated roofs and standards at each generated arm. These pieces
use the same sampled structure-floor height as the grid walls and write through
the scene-depth path; the former absolute-height gazebo and screen-space banner
arrays were removed. Rotation, palette and generated structure counts now
survive chunk-window assembly instead of being discarded.

The flattened courts also receive subtle structure-specific paving in their
generated color mesh: staggered fortress stones, arena rings and watchtower
spokes. Because this is baked while a chunk is generated, it adds no recurring
draw calls. Existing fortress interaction objects and sealed markers now project
from the same floor height instead of world zero.

Floor scatter now uses biome and structure-specific pools, stable four-cell
clusters and deliberately clear circulation cores. Raised clutter receives one
small contact ellipse, while puddles and ground cover do not. Shared wood, iron
and foliage material families cover the new sweep, and every generated floor
type has an explicit perspective tier. Prop recipes multiply rather than replace
the caller's alpha, fixing distant clutter that previously popped through fog,
lighting and spawn fades. The clustering, recipes and shell face counts are all
fixed and bounded; no particles, filters, gradients, pixel reads or additional
lights were added. UI, controls and collision are unchanged.

Native 360×240 seed-12345 Approach checks used 12 warmups and 60 frames. The
standard fixture measured 11.6 / 12.1 ms median / p95 render commands after the
pass versus 11.4 / 11.6 ms at its pre-pass checkpoint; `sceneEntities` remained
1.1 ms median (1.3 ms p95 versus 1.2 ms), and animation cadence remained 16.7 ms
median. A second run with the Structures fixture enabled measured 11.4 / 12.2 ms
overall and 1.1 / 1.2 ms for `sceneEntities`. These are native Canvas command
timings on this Mac mini, not an ESP32/GPU/thermal guarantee.

### Atmospheric Sky V1 (2026-09-20)

The surface sky now uses four zenith-to-horizon color stops blended across
biomes, time-coherent atmospheric mountain layers and a restrained horizon
haze. A visible world-oriented sun follows the same corrected solar phase as
directional lighting: sunrise is `0.25`, noon is `0.5` and sunset is `0.75`.
At night the opposite moon and a deterministic 48-star catalog fade in. Ten
fixed cloud clusters form two slow parallax bands with biome-specific coverage.
The day/night setting still fixes the scene at noon when disabled, and no HUD
or settings controls changed.

Sky work is bounded rather than particle-driven. Stars are submitted in two
paths and clouds in two paths; there are no texture canvases, per-pixel loops,
blur/shadow filters, image readbacks or weather simulation. Unit coverage pins
phase timing, deterministic commands, cave suppression and command-count caps.
On the native 360×240 seed-12345 Approach fixture, the sky stage measured
0.1 / 0.2 ms median / p95 both before and after this pass. Whole-frame render
commands were 11.3 / 11.5 ms before and 11.4–11.5 / 11.8–12.2 ms across two
post-change samples; median animation cadence remained 16.7 ms. These are
Canvas command timings on this Mac mini, not mobile GPU or thermal guarantees.

## Artwork cache pilot and gallery

The **Prop cache (pilot)** checkbox is opt-in and resets on reload. It caches
only 3D floor-scatter `fern`, `fallen_log`, `skull`, and `rubble` artwork. All
other props and the 2D map keep their original drawing paths. The four recipes
are still authored once in `paintFloorItem()` in `07-decorations-lighting.js`;
the original `drawFloorItem()` entry point remains available.

`07-artwork-cache.js` contains the small `FLOOR_ARTWORK` registry, with labels,
anchor-relative bounds and shared-material dependencies. Skull/rubble already
use `bone`/`rubbleStone`; fern/log colors are still local to their recipes. This
is a foundation for designer tooling, not a completed asset/theme system.

Run the regular preview server and visit `/artwork.html` for side-by-side
original/cached artwork on daylight/dusk backdrops. Its verification button
checks 300 native raster cases and the production terrain-depth clip. Its
measurement button compares 120 mixed props at 360×240 and 1280×720, with both
fixed and changing projected sizes. It reports first-frame cost, 80 warmup
frames, 60 alternating-order sample pairs, hit/miss/build counts and raw pixel
memory. It does not measure full gameplay FPS, GPU completion, or the cost of
the game's projection/depth passes. Reload before timing after pixel readback.

Implementation limits:

- Exact seeds/variants/integer sizes (6–70 px) retain procedural variety. No
  seed quantization. Each image is baked at twice its destination resolution;
  fractional placement and antialiasing can differ from direct vector drawing.
  Native visual acceptance is required before enabling the pilot by default.
- LRU eviction caps retained RGBA pixel storage at **4 MiB** and **384 entries**.
  Canvas/JS/driver overhead is additional, not included in that byte budget.
  Cold generation is limited to four images and a soft 1 ms per scatter pass;
  one build can exceed the time limit. A miss over budget uses the old recipe.
- Placement, support, ordering and the existing depth clip stay live. Cached
  transparent rectangles never write opaque depth. Nondefault transforms,
  compositing, filters, shadows, dashes or unsupported inputs keep the old path.
- The four legacy recipes override parent alpha. Cached drawing preserves that
  behavior; this change does not fix/reinterpret fog, spawn fade or lighting.
- Palette catalog replacement or painter-function replacement invalidates the
  cache. Normal source edits still require `build` and reload. In-place hot art
  changes must call `clearFloorArtworkCache()`; this does not rebuild cave meshes.

Developer hooks: `setFloorArtworkCacheEnabled(bool)`,
`getFloorArtworkCacheStats()` (cumulative counters, current retained bytes),
`clearFloorArtworkCache()`. Outside the game scatter pass, call
`beginFloorArtworkFrame()` once per render pass to reset the cold-build budget.
Unit checks cover identity, invalidation, LRU/budgets, allocation fallback,
caller state, production clipping and gallery script assembly. They cannot
substitute for the native-browser measurements and moving-game review.

Pilot checkpoint (2026-09-20): core + smoke tests pass, but native-browser
appearance/timing verification is still pending because this session could not
serve/open the local test page. No performance improvement is claimed yet.
Keep the checkbox off by default until that comparison and a moving-game
occlusion check have been reviewed.

## Articulated hand and robe V1 (2026-09-20, preview-only)

In **Cave Test → Casting studio**, **Hand motion study** is the default study.
Choose **Articulated hand** and **Play casting flourish (¼ speed)** to inspect one
material-finished right hand in the actual game canvas. The phase selector, timeline,
and player/side/back views expose finger curl, thumb opposition, wrist rotation,
forearm deformation, robe construction, and recovery without glow or textures
hiding the shape.
Selecting the hand, a style, or a resting template pauses at Ready. **Handle
grip** is the default: a closed upright fist for a vertical staff. The hand and
forearm cross-sections roll around their longitudinal axis while preserving the
arm's centerline; there is no camera-space twist bending the arm into a hook.
Its arm pose brings the forearm up beneath the wrist, not diagonally across from
the left. Grip orientation is shared across casting styles.
At maximum extension the wrist pitches about 20° forward, so an imagined staff
tips toward the cast, then smoothly returns to its upright resting orientation.
The handle's placement also thrusts away from the camera, slightly up/inward,
then recovers to rest. It shares this motion across styles instead of inheriting
Finger Guns' free-hand recoil; the approved wrist tilt and closed grip remain.
This changes the hand presentation only, not cast timing or projectile direction.
**Reach** remains available as the free-hand casting-flourish study. The Arcane
rest shows the back of the hand with fingers reaching away into the scene. The
palm stays facing away throughout its cast; gathering uses finger curl and a
small wrist flex, not a flip toward the camera or an idle flourish. **Resting pose**
offers Reach, Handle grip, and Cradle; these are shape templates, not new items.
Handle grip stays closed during playback; choose Reach to inspect finger opening.
**Palm study** in Hand inspection view presents the same mesh face-on, with a
fixed wrist orientation and placement, for reference-silhouette comparison.
It keeps the small game canvas and does not change the Player view animation.
**Original baseline** shows the original hands. **Cancel / restore game** returns
the previous gameplay state. This study does not cast spells or simulate damage.
Keep automated/native visual checks in the small preview; the user has explicitly
requested no further fullscreen tests. Manual fullscreen controls are optional.

`15-hand-rig.js` owns the cached mesh topology, authored 2800 ms motion study,
articulation, projection, and material-aware vertex lighting. It draws native Canvas2D
triangles, not a transformed image or WebGL surface. Normal gameplay does not
enable `HAND_RIG_PREVIEW`. The rejected flat drawing remains archived in the
studio mode selector, with `CASTING_ART_ENABLED` off by default.

The model has 1117 vertices and 2136 triangles. Four extra proximal sleeve rings
continue the arm beyond the player viewport without changing the original wrist
or forearm shape. Their width stays bounded; no screen mask hides the arm entry.
Four additional near-wrist rings shape a warm turned-linen edge, a fitted cuff,
and two narrow antique-gold trim bands while preserving every original forearm
station and the exact hand seam. The cloth uses asymmetric 3/5-lobe geometry
instead of a screen texture, so its long folds rotate and deform with the arm. A
two-sided cloth fan closes the normally cropped arm entry when the supported Back
inspection view turns it toward the camera.
Only topology and numeric working arrays are reused; this is not an
image/animation-frame cache. The 106,448-byte numeric working storage excludes
JS topology objects, temporary allocations, and browser/driver memory.
`getHandRigStats()` separates mesh build
and render-command times; `clearHandRigCache()` starts a fresh first-use check.

The robe/skin treatment is the V1 foreground look for evaluation, but this rig is
still a preview gate rather than a finished gameplay replacement. Finger
roots currently intersect the palm volume rather than forming a welded skin
mesh; webbing, thumb saddle, and joint contours need refinement. The wrist seam
has matching positions through deformation. Triangles are culled and sorted by
depth; this is not a general hand self-occlusion solution for arbitrary crossed
fingers or intersecting poses. The hand never changes the world scene-depth
buffer, and world-space spell effects still use its existing clipping helpers.
Lighting retains the study's ambient/diffuse/rim model, now mapped through shared
`casterSkin`, `casterCloth`, and `casterMetal` ramps. Equipped robe colors replace
cloth roles individually; malformed or partial roles fall back safely while
linen, trim, and skin stay shared. There are no nail details, skin textures, or
finished hand-to-missile release integration yet.

The separate combat work from the prior pass retains the user-approved 120 ms
Magic Missile wind-up. It reserves the existing route-specific cost/cooldown on
accepted input, snapshots projectile modifiers, samples aim/position at release,
and cancels/refunds pending reservations on pause/modal/hidden-page transitions.
Existing keyboard/gamepad differences in robe discounts and split-shot behavior
remain unchanged. The slow hand-study timeline is not that gameplay timing.

Verification covers generation, hand winding/deformation/seam/no-gameplay writes,
studio state restoration, and queued-cast/depth regressions. Native measurements
must be taken in fresh pages, without pixel readback before timing. Do not infer
phone, fullscreen, or complete two-hand/spell costs from the one-hand mini view.

Earlier native Mac mini checkpoint (before the outward-rest/style changes),
360×240 preview, seed 12345/Mouth, prop pilot off:

| Measurement | Daylight | Dusk |
| --- | --- | --- |
| Rig mesh first-use build | 0.5 ms | 0.6 ms |
| Rig render commands, median / p95 | 1.0 / 1.1 ms | 0.9 / 1.1 ms |
| Whole frame with original idle hands, median | 10.6 ms | 10.6 ms |
| Whole frame with moving right-hand rig, median / p95 | 11.6 / 13.2 ms | 11.6 / 13.1 ms |
| Browser frame interval, median, both versions | 16.7 ms | 16.7 ms |

Each version had one 144-frame cold/warmup cycle followed by 144 measured frames.
The original baseline is idle artwork, not a matching articulated pose workload.
The original version runs first; its first whole-frame time also includes colder
world rendering. Do not interpret that first-frame comparison as a startup win
for the rig. These are command-submission/cadence measurements, not GPU-fence or
mobile thermal results. A separate geometric depth audit found small painter
ordering errors at finger/palm junctions; production needs welded geometry or a
private hand-depth solution before detailed contact/crossed-finger poses.

### Casting Style preference and animation contract

**Casting Style** beside the main controls is a personal preference, not an
unlock, loot item, spell upgrade, or graphics preset. **Arcane (default)** and
**Finger Guns** are available immediately. The studio has a synchronized style
selector. The articulated mesh is still preview-only: this setting does not silently
replace normal-game hands with an unfinished model. Gameplay timing, effects,
equipment and the existing missile wind-up remain unchanged by style selection.

`01-casting-styles.js` owns stable IDs, labels and preference handling. Selection
is saved independently at `hardwareone.casting-style.v1` in localStorage; it is
browser/origin-local, not a world save or account sync. Unavailable/blocked
storage keeps the current session usable. Unknown IDs fall back to Arcane.
Use `getCastingStyleOptions()`, `getSelectedCastingStyle()`, and
`setSelectedCastingStyle(id)` rather than mutating `settings.castingStyle`.
`onCastingStyleChange(listener)` returns an unsubscribe function for controls.
The preference intentionally survives studio cancellation; temporary mesh,
world, light, and pose state do not.

`15-hand-rig.js` contains data-only `HAND_RIG_ANIMATIONS` recipes sharing one
skeleton and renderer. Add a descriptor in `CASTING_STYLES` and a matching
`handAnimation` recipe to extend the set; do not add style branches to combat.
Recipe frames are Ready / Gather / Release, with local-radian root rotations,
per-digit joint curls (index, middle, ring, little, thumb), thumb opposition/twist,
spread, distance and screen anchors. Finger Guns keeps the index and middle
extended together toward the crosshair through gather, release and recovery.
Ring and little fingers extend nearly straight from the palm, then fold at the
middle knuckle and return toward the palm at the tip joint; the curl no longer
starts with a deep bend at the palm. Finger Guns presses the thumb
with small wrist recoil. The player-view palm-radial axis stays upright; pitch
and yaw supply the aim instead of a sideways whole-hand cant. This does not
change the photo-referenced finger shapes, Palm study view, or Handle override.
The thumb now follows the user's raised/pressed photo
references: a broad radial base, an open L-shaped thumb/index gap at rest, and a
tip that folds forward above the index at release. The previous assumption that
the thumb should lift out of the palm in the fingers' flexion plane was wrong.
Its bend frame lies nearly in the palm outline plane, with a slight depth cant;
the planted base stays steady while the knuckle bends modestly and the distal
joint supplies most of the press. Both signed joint changes share the existing
release/recovery blend; there is no new gameplay timing or topology.
This is foreground pose alignment, not a change to projectile aim.
Handle/cradle digit constraints
remain independent of style and cannot be opened by a casting recipe. Actual
item contact targets and attachments are not implemented by these templates.
`handRigPlacementFrames()` gives an authored grip `placement` priority over the
style's distance/screen anchors. Handle uses this for its shared forward thrust;
Reach and Cradle still resolve their placement from the selected style.

Use `sampleHandRigAction(action, elapsedMs, grip, styleId)` for an explicit
`idle` or one-shot `cast` action. Idle ignores advancing time; completed casts
clamp to rest. `sampleHandRigRestPose(grip, styleId)` samples rest directly.
`sampleHandRigPose(timeMs, grip, styleId)` is the deliberately looping studio
sampler, **not** a gameplay idle driver. Its 2800 ms study timeline still needs
an approved combat-event adapter before production use; it is not permission to
delay projectiles by 2800 ms. World-space spell origins/impacts continue to use
existing world coordinates and depth clipping, not the foreground hand mesh.

This separation is also the foundation for item-use animation: the grip defines
how an item is held, the action defines what the hand does, and Casting Style
chooses a casting recipe. Future left/right instances should share topology and
action sampling while keeping independent pose buffers and correct mirrored
winding. Two-hand coordination, item attachment/contact points, and consume-event
adapters for food or potions are not implemented. Those adapters must connect
approved action events to gameplay, not apply healing from a drawing function.

Earlier style checkpoint (before the aim/sleeve adjustment): native Mac mini,
unchanged 360×240 canvas, seed 12345/Mouth,
Reach grip, prop pilot off, fresh page per run. Each version used 144 warmup
frames and 144 measured frames; no fullscreen, resizing or pixel readback.

| Style / light | Mesh build | Hand commands median / p95 | Whole frame median: original / rig |
| --- | --- | --- | --- |
| Arcane / daylight | 0.4 ms | 0.9 / 1.2 ms | 10.8 / 11.9 ms |
| Arcane / dusk | 0.4 ms | 0.9 / 1.0 ms | 11.0 / 11.8 ms |
| Finger Guns / daylight | 0.5 ms | 1.1 / 1.4 ms | 10.9 / 12.1 ms |
| Finger Guns / dusk | 0.5 ms | 1.1 / 1.3 ms | 11.0 / 12.1 ms |

Median animation-frame interval was 16.7 ms for both versions in these runs.
The first Arcane/dusk run overlapped background regression testing (whole-frame
medians 12.6 / 13.0 ms); the table uses a fresh repeat after tests finished.
These are one-hand render-command/cadence measurements, not GPU completion,
two-hand/effects costs or device-wide performance guarantees. Original hands
are idle and run first, so their cold whole-frame result is not a fair isolated
startup comparison. Native checks also exercised style/grip changes, return to
rest, synchronized controls and reload persistence; grey geometry remains an
unfinished study, with the finger-root and self-occlusion limitations above.

Aim/sleeve follow-up: one fresh-page Finger Guns/Reach daylight run at the same
360×240 size measured a 0.7 ms mesh build, 1.1 / 1.2 ms median / p95 hand commands,
and 10.5 / 11.7 ms original / rig whole-frame medians. Both versions retained a
16.7 ms median animation-frame interval. The four sleeve rings add 96 vertices,
192 triangles, and 9,216 numeric working bytes. This is one local measurement,
not evidence of a speedup or a new dusk/two-hand performance guarantee.
Native pose checks covered daylight and dusk without fullscreen or resizing.

Robe V1 checkpoint: one fresh-page Finger Guns/Reach daylight run at 360×240
measured a 0.7 ms mesh build and 1.3 / 1.4 ms median / p95 hand commands. Whole
frame render-command medians were 11.7 ms for the original baseline and 13.1 ms
for the finished rig; median animation-frame interval remained 16.7 ms. The four
cuff-shaping rings add 96 vertices, 192 triangles, and 9,216 numeric working
bytes over the preceding sleeve checkpoint; the Back-view closure adds one
vertex, 48 two-sided triangles, and 464 more bytes. This is one native local sample,
not a mobile, two-hand, GPU-completion, or thermal guarantee. Manual review
covered Player, Palm, and side views in daylight/dusk at the small preview size;
no fullscreen visual test or UI change was made.

### Staff casting rig (2026-09-27, preview-only)

In **Casting studio**, **Resting pose → Staff casting (held staff)** selects a
separate rig: the articulated right hand holds a 3D staff, then reaches and
points it forward on the shared 2800 ms timeline. Nothing is equipped, no spell
is cast, and normal gameplay still draws the original arms.

- `15-staff-rig.js` builds the staff once (gnarled wood, leather wrap with cord
  bands, brass collars, three prongs caging a faceted crystal) in hand units and
  registers it in `HAND_RIG_ITEMS`. The grip's `item` names it; the hand rig
  poses it rigidly with the palm and merges its faces into one painter order.
  Colors come from `casterStaff`, `casterMetal` and `missileMagic`.
- The leather wrap is the contact cylinder in `STAFF_RIG_GRIP`. The per-finger
  curls in `HAND_RIG_REST_POSES.staff` were solved offline so each phalanx pad
  meets it without entering it; the thumb lies over the index toward the shaft.
- `forearm`, `root` and `arm` separate the sleeve, wrist and rigid arm turn.
  The wrist bend spreads over a 5-unit cuff (`wristSpan`) and stays under 50°,
  so the staff can point forward without bending the sleeve like rubber.
- Rest keeps the rig in the right third of the view: the staff leans outward
  with its head near the right edge, clear of the crosshair. Gather draws it up
  and brightens the crystal; the thrust extends the arm and tips the staff about
  60° forward so its head lands below and right of the crosshair; recovery
  returns to the exact rest projection. A soft additive glow follows the crystal
  while charged.
- Like a real first-person arm, the sleeve always enters from the bottom edge or
  the bottom-right corner, never from the side, in every phase at 3:2 and 16:9.
  The staff's magic visuals are deliberately deferred to the particle system.

`tools/game/tests/staff_rig.js` checks grip contact against the authored
cylinder, rigid attachment in all views, wrist bend, the resting layout at three
canvas shapes, bottom-edge arm entry, the reach-and-point motion, painter order
and Canvas state, with six mutation controls. The existing hand-rig contracts (idle stability, seam,
off-screen sleeve end) also cover the staff grip.

Draw cost, one local Chrome sample on 2026-09-27 in a background tab at 360×240
(mean per draw over a timeline sweep, including the browser's periodic raster
flushes): Handle 3.5 ms, staff 7.3–7.5 ms. Visible faces rise from about 770 to
1,600 at rest and 1,900 while pointing. The staff mesh has 1,242 vertices and
2,310 triangles. This is not a frame-time or device measurement; the studio's
own profiler was not run with a visible pane.

### Spell HUD panel

The lower-right spell panel shows on a spell change or cast and stays while the
spell recharges, streams, or mana is short. Otherwise it holds for 2.5 s and
fades over 0.6 s (`SPELL_HUD_HOLD_MS`, `SPELL_HUD_FADE_MS`), clearing the corner
where the casting hand sits. It runs on game time, so pausing holds it.
`tools/game/tests/spell_hud_fade.js` drives the production HUD on a controlled clock.
A new run or level shows the panel for its first 2.5 s, then it fades.
In the casting studio the panel's spell-change time is studio state on the
studio clock: the spell gallery labels its scene's spell for the whole loop;
the casting study starts idle (not as a new run does), so the panel appears
with the practice cast; the hand study has no cast, so its panel stays hidden
(`casting_studio.js` checks all three).

## Water system (2026-09-27)

One model for every spring, river, lake and pool in Endless (`06-water.js`).
Water is solved, not simulated: a source routes downhill over the loaded
window, fills the first basin it meets to that basin's spill point (a flat
lake), then continues from the spill until its strength is spent, it joins
standing water, or it leaves the window. Each river then becomes an object
with a smooth course and is carved into the terrain (below). The solve runs
once per window build, before wall bases and walk data are derived from the
floor heights, and writes per-cell arrays on `floorMesh`: `water` (0 dry,
1 still, 2 flowing), `waterSurface`, `waterDepth`, `waterDirX/Y`,
`waterSpeed`, `waterFlags` and `waterBody`. Nothing runs per frame except
drawing and a lookup.

- **Sources.** Legacy valley pools (cells below height -3) are now lakes with
  a flat surface at -3 and real depth. Each window chunk may hold a seeded
  spring at its highest open cell above `WATER_SPRING_MIN_H`; chunk
  coordinates seed it, so the same spring appears in every window.
- **Open ground.** Plain surface terrain only: walls, cave interiors, carved
  entrance ramps and cave caps stay dry in this version. A height point
  stands for the floor square to its south-east (as `waterAt` and the ground
  colours read it), so it is closed when that square's wall cell, found in
  world units, is solid.
- **Reserved ground.** The levelled floor of every fortress, arena and
  watchtower stays dry and keeps its shape: the generator's flat zone
  (`largeStructureFlatRadii` in `05-endless-world.js`: 1.75, 1.25 and 1.55
  chunk sizes times the structure's scale from its centre, by the larger
  axis distance, straight-line for arenas) plus a `WATER_RESERVE_MARGIN`
  (48-unit) ring, the widest river half-width and a ribbon's reach into its
  bank in whole grid steps. No spring rises there, no river, lake or river
  surface covers it and carving never reshapes it, so courtyards, keep props
  and structure models stand at the same height with water on and off. The
  mask (`_waterReserveMask`, `mesh.waterReserve`) is built once per window
  build from the generator's own region rule (`largeStructureForRegion`),
  not from the window's `largeStructures` list, which is assembled after the
  water; a point is reserved the same way in every window that holds it,
  including a footprint chunk that recorded a neighbouring structure and was
  never levelled. Legacy valley pools there keep their water. Reserved
  ground drains water (`field.sink`), so no river or lake stands above it:
  water that reaches reserved ground lower than its surface ends there as
  an outflow, as at the window edge. The solver tests every open point
  within a river's half-width of its course that would lie under its water
  (`_waterReachesSink`, the spring's `reach`); a basin drains where its
  rising water meets reserved ground, its level at that ground's height;
  and once smoothed, a river ends at the start of the first stretch whose
  carved water would stand above reserved ground beside it
  (`_waterRiverKeepOff`; points next to reserved ground are never reshaped,
  so they keep their own height), or has no river at all when that is at
  its spring. Such a river (`drains` on its object) falls over its last
  `WATER_DRAIN_FALL` (36) units toward the reserved ground it drains into,
  but never below the ground at its end or under its course, so its tail
  never runs dry or sinks into a trench where that ground lies below a
  generator step; past its end there is no water and no end cap. Markets, shrines, ruin pads and the spawn clearing are not
  reserved; the transition ring beyond the margin, where the levelled floor
  blends back into natural terrain, stays open ground.
- **One query.** `waterAt(x, y)` returns kind, surface, depth, surface Z in
  player units and flow. Rendering, movement and enemies all read it.
- **Rivers are carved into the land** (`buildWaterRivers`,
  `carveWaterRivers`). Each spring's solved path becomes a river object: the
  cell path is relaxed (`WATER_RIVER_RELAX` passes of neighbour averaging) so
  grid zigzags become meanders, smoothed, resampled every 6 units, with a
  surface that never rises downstream and a width (18-30 units by spring
  strength) that opens up from the spring. Every open ground point near a
  river is then reshaped: a parabolic channel `WATER_RIVER_BED_DEPTH` deep at
  the centreline that meets the surface with a steady slope (so the rendered
  shoreline follows the channel edge instead of zigzagging along grid
  triangles), then the higher of a cut bank rising to higher ground and a
  levee shelf just above the water that falls back to lower ground only after
  `WATER_LEVEE_WIDTH` (so the river never sits perched above its banks).
  Points next to walls, caves and reserved ground keep their height, as do
  lakes. Carved ground takes
  the colour the generator would give its new height, with the generator's
  slope shading. Water past a river end that opens into a lake joins that
  lake. The walkable floor changes with the carve, so players and enemies wade
  down into rivers. Carving never moves ground more than `WATER_MAX_FILL`
  above or `WATER_MAX_CUT` below its natural height (1 mesh unit each:
  ordinary terrain needs up to about 1, only the steps the generator leaves
  at the edges of a structure's levelled ground ask for more, and there a
  bank may stand below the water or a channel run dry). Rebuilding restores
  the saved heights and colours first, so carving never compounds.
- **Rendering** (`13-render-water.js`, pass `water3D` after walls, the
  landmark pass and `sceneEntities`' opaque phase, before its overlay phase
  and every later billboard or sprite stage: water writes no depth, so a
  model standing in it must write depth first, and a sprite in front of it
  must draw after it; `pass_order.js` section `water`). Lakes are drawn per
  floor square: every square with a lake corner gets a surface at the lake
  level, the scene depth test cuts the shoreline
  where land rises out of the water, and a dry corner is lowered to the ground
  if the ground is lower, so lakes never hang over a drop; squares sharing one
  level merge into flat strips. Rivers are ribbons along their course, level
  across and falling downstream. Each side reaches 7 units past the channel
  edge into the bank (the depth test draws the waterline) but not out over
  ground clearly lower than the water. On the inside of a bend tighter than
  the ribbon it stops at the bend's centre (a fan, not a fold that paints
  twice), and open ends get one extra section. Each frame culls, sorts far to
  near and fills translucent through the scene-depth clip (no depth writes),
  with depth-tinted colour, a little distance sky, lake shimmer, river streaks
  and lake glints.
- **Ground under water.** Valley ground is authored very dark (colour follows
  height), which read as a void through the water. Squares fully under a lake
  become a lit sand-and-mud lakebed that grows muddier and darker with depth;
  a lake square that rises out of the water takes its driest corner's natural
  colour. River beds start from the colour of their own banks (sampled just
  outside the channel and smoothed along the river) at the waterline and grow
  muddier toward the deep middle, so the bed shades gradually instead of
  stepping between bank and mud at grid squares. Dry ground outside the
  carve is never recoloured; legacy pools start from their pre-water colour
  (`surfaceBiome`) instead of the old blue.
- **Movement.** In the fixed tick, water above the feet slows the player
  smoothly to 55% at knee depth (`WATER_FULL_DEPTH_Z`), and river currents add
  a push along the flow. Enemies moving through water slow the same way. Jumping
  clear of the surface ends both.
- **Effects** (`11-fx-engine.js`). Particles meet a water surface as their
  floor (`fxWaterFloor`): rain splashes on the water, and snow, ash and
  chips settle on it and fade, instead of reaching the bed and drawing over
  the water. A step, landing, dash or dash trail laid under a water surface
  kicks up no ground dust (`fxWading`, counted as `observers.wading`).
  Covered by `weather.js` and `locomotion_dust.js`.
- **Toggles and stats.** `setWaterSystemEnabled(false)` reassembles the
  window as if the system had never run (legacy water flags, ground heights
  and colours); `WATER_RENDER_ENABLED` hides only the
  surfaces. `getWaterStats()` (including `drains` and `reserved` points) and
  `getWaterRenderStats()` report counts and timings.

Tests: `water_system.js` checks the solver on authored terrain (a slope, a
notched bowl whose lake must be flat at its spill height and cover exactly
the expected cells, a weak spring, a walled gap, a flat plateau, the bowl
with a reserved patch on its slope, strictly below every open cell not yet
flooded, that it fills exactly up to, a river that drains into lower
reserved ground beside it, and a river as wide as carving makes it that
drains where its width first reaches a band two rows from its course) and
on real seeded
windows (legacy lakes, no water on closed ground, surfaces never rising
downstream along cells or river objects, carved channels measured on the
rendered ground: the bed dips at least 0.3 below the water across every
full-width section and dry banks never lie below it, rebuilds reproducing
water, heights and colours, and switching off giving back a world generated
without the system). Seven structure windows are entered from the home
window, as a walk-in is, and compared with themselves rebuilt with the
system off: the seed 11 fortress and seed 6 arena whose courtyards rivers
used to cross, the seed 3 fortress with a footprint chunk recorded by a
neighbouring watchtower, two watchtowers (seeds 10 and 8) beside the
generator's terrain steps, the seed 22 arena and fortress sharing chunks
(a channel cut to the bound at a terrain step) and the seed 14 arena
(carved water wider than the solver's estimate of it). Their levelled
floors, footprints and margins get no new water, reshaped ground, spring
or river surface; keep props, structure floors and structure models stand
the same; no water stands more than 0.001 above a reserved neighbour's
ground, while water comes within two points of reserved ground and every
drained river ends within its width, a section and a point and a half of
it; each drained river ends at the natural ground where it ends (or at
higher reserved ground) with water along its last 16 sections; both
carving bounds bind and hold; and a point is reserved the same way in a
window one region over. The suite has 19 mutation controls (including no
carving, banks without the levee, no reserve, a reserve read from the stale
`largeStructures` list, no margin, no basin or river drain, a drain level
or reach left out, no keep-off, no fall or a fall below the land at a
drained end and unbounded carving). `water_movement.js`
runs the real player step and
NPC locomotion: an idle player drifts downstream in a river but not on dry
ground, the same input covers 55% of the dry distance in deep water, enemies
wade, and switching the system off removes every effect, with two mutation
controls. `water_render.js` checks the built tiles in two seeded windows
and a window beside a fortress (seed 6 at 36,26):
every floor square touching lake water carries a lake surface, lakes never
hang above lower dry ground, ribbons never fold, every point of river water
lies under a water surface, ribbon edges never hang above dry open ground, no
bed under water is near-black, a river that drains into reserved ground
draws and leaves no water past its end, and the toggle restores every
ground colour, with nine mutation controls (one-square-per-point coverage,
unclamped lake edges, dark natural beds, half-width ribbons, unrelaxed
courses, no bend fan, banks without the levee, water and an end cap past a
drained end). `cave_surface_material.js` skips the river-bank
points the water system lists in `mesh.waterCarveColors`, as it already
accepts shoreline tint. Browser, one local run in the app's browser: a window
solve including carving took 6-23 ms and building the tiles 1-4 ms, once per
window build; drawing took about 1 ms per frame (at most 1.9 ms over 30
frames) with 148 visible tiles. Known limits: the terrain is coloured per
12-unit square, so up close a diagonal river still shows a faint staircase in
its bed and bank colours; rivers from springs outside the window appear when
the window moves; level (non-Endless) maps keep their legacy water for now.
The generator levels a structure's surroundings only in chunks that record
the structure, and a chunk records one structure, so steps of up to about 3
height units stand at the edges of some levelled floors (older than the
water system); the carving bounds keep rivers beside them from building dams
or trenches. Outside structure floors, carving and lakes leave generated
objects (floor props, chests, shrines) where chunk generation put them, so
some stand in water, a few deep under it (seeds 1, 15, 29 and 31: 6 of 69
chests and 1 of 6 shrine pedestals fully submerged, up to 42 units deep).
Their models draw before the water, whose
alpha rises from 0.64 at the shore to 0.94 at 1.2 H deep, so a deep chest or
pedestal shows only faintly through it, while its billboards (chest glow,
sparkle and label; shrine crystal, glow and prompt) and Legacy sprites draw
over the surface. Moving or skipping deep-water placements would change world
generation and is not done yet.

## Shared cave contracts

`05-endless-world.js` owns seeded networks and their entrance portals. Portal
coordinates are world-space; `deepCaveEntrances` contains window-local copies
with the same dimensions, floor, ceiling, cover, kind, and style. Use
`sampleCavePortal()` for the footprint and signed depth (positive outside),
rather than inventing another entrance-distance threshold.

`queryCaveGeometry()` describes the stamped floor, cover surface, and ceiling.
`covered`/`ceilZ` determine the roof; `isEntrance` is only a mouth-vicinity
diagnostic and does **not** mean “remove the cap.” A descending approach is open
sky outside the mouth. A hillside site must fit actual terrain cover; failed
fits use a descending entrance. Candidate searches run once per cached network.

`getCaveWallRoofLimit()` bounds each wall using ceiling and exterior-height
samples over its own footprint. Cave walls end inside the rock cover, at the
roof or at least 0.25 mesh units below the lowest exterior sample. A nearby
cap is only a cover tag, never permission to raise a wall to the highest grass
sample: that exposed the cave outline through sloping terrain. Walls without a
ceiling in their footprint retain their normal surface height. This is derived
once during window assembly; movement support and per-pixel occlusion are
unchanged, and the renderer still closes individual wall ends to the ceiling.
Seeded regressions check both above-ground occlusion and visible interior walls,
and deliberately restoring the highest-neighbor-cap limit must fail.

Known separate entrance detail: the broad, flat portal-rock top does not fully
join the curved terrain profile at its rear edge. Seed 12345 still shows a thin
dark lip seam there; reshaping that rock strip to the terrain profile remains
follow-up work. It is distinct from cave walls protruding through the ground.

`06-floor-queries.js` owns support and clearance. `getWalkableLayerTopAt()`
returns `walk`, `fall`, `blocked`, or `missing`; missing geometry has `topH:null`,
not height zero. Do not use a blocked/missing answer as movement support.
`getCaveSpaceAt()` determines underground state from overhead geometry, including
positive-height caves. The lighting cycle may be off without disabling topology.

Heights in those contracts are mesh units. Player and camera stored Z retain
the legacy `60 + 40 * height` encoding; `getCam3D()` converts to rendering's
`60 + 25 * height` eye position. Zero is a valid stored Z, never an absent value.

The first recipe is one connected passage and chamber, with a constant interior
floor and one entrance. Variable elevation, larger branching/dual-exit recipes,
save/load, and richer world content are separate future work.

### Shared rendering contracts

`12-scene-depth.js` owns per-pixel opaque-scene depth. Begin once per 3D frame
with `beginSceneDepthFrame(canvas.width, canvas.height)` before drawing any
geometry; isolated render tests must do the same. Floors, cap tops, ceilings,
wall sides/tops, and entrance solids use this field. Enemies, pickups, companions,
chests, spawners, ore, and spell effects now read the same field. Some structure,
shop, and other legacy rendering paths remain; this is not a complete replacement
of every renderer or a general entity-to-entity depth system.

`projectSceneWorldPolygon()` takes local XY and render-world Z (mesh height ×25),
clips the near plane, and returns screen XY plus camera-forward depth. Split
nonplanar terrain cells into triangles before projecting. Use
`fillSceneDepthPolygon()` for an opaque face after setting its material;
`withSceneDepthClip()` clips transparent decorations/glow without writing depth.
Its callback must only draw that face/effect, not nest another depth clip.
The legacy one-distance-per-column buffer is not terrain visibility authority.

For a billboard, use `withSceneDepthBillboard(bounds, forwardDepth, draw)` with
screen-space `{x, y, width, height}` covering its body, glow, labels, and strokes.
It never writes transparent bounding rectangles into opaque scene depth.
`renderEntities3D()` opts into this path with a `bounds(entity, vis, camera, now)`
callback and uses `groundAnchor:true` for floor-supported objects. Custom chest
faces and extended effects instead use projected world polygons with per-corner
depth. Beam endpoint glow can be unioned through `extraPolygons` in one depth
clip; do not nest clips. Ground effects follow actual terrain triangles rather
than placing one flat screen ellipse over varying terrain.

`sampleEntitySupportRenderZ(x, y, referenceZ, underground, requireTriangle)`
samples the same semantic layer and diagonal as the floor renderer. A finite
reference height selects the nearest support; otherwise underground selects the
lowest support and surface selects the highest. Missing support is `NaN`.
`requireTriangle:true` rejects incomplete triangles for ground decals.
`getEntityRenderFloorZ(entity)` honors finite absolute `renderFloorZ`, including
zero, then uses `underground`/`caveSpawnId` provenance. Do not use the player's
current stratum to position another entity or drop.

Projectiles and impacts store absolute render-world `z`; convert the player's
stored floor once with `(pos.floorZ - 60) * 0.625` before adding hand height.
Companion bounce is local to its sampled floor. Lob target/ground-effect support
must retain the caster's stratum rather than choosing an unrelated floor below
the surface. These are visual/height contracts, not a completed combat
line-of-sight or navigation system.

`getCaveMaterialColorAt(localX, localY)` reads preauthored packed RGB from the
current mesh. Cave floor, ceiling, walls, and rock cut share this world-position
palette; apply lighting separately. Do not use the camera's underground flag
to choose material or suppress an entire buried object. The mouth blends from
its surrounding terrain to deeper stone by signed portal depth. Material
generation and grain are world-coordinate-derived and stable across window rebuilding.

Shipping regressions include real seeded oblique/roof-edge renders, partial
entrance burial, an open doorway sightline, and a mutation check that fails if
terrain depth is omitted. Unit tests cover depth interpolation, clipping,
near-plane crossings, buffer reset/resize, and camera-independent material.
Actor, loot, and spell regressions exercise partial burial, zero height,
support strata, extended effects, and depth-bypass mutations.
The depth field preserves full canvas resolution; benchmark larger canvases
separately because cost scales with covered pixels.

Terrain facing is evaluated against each triangle's actual plane, not the
camera's absolute height relative to its corners. An uphill bank can face a
camera below every corner and must still write opaque depth while the player
walks out of a cave. Nonplanar cells test both triangles independently; ceiling
undersides use the opposite plane side. Flat caps remain invisible from below.
Do not replace this with a player-underground toggle or hide surface clutter
by camera height: visible fragments depend on the terrain's depth coverage.
The cave-exit regression drives keyboard/collision steps through both entrance
profiles and samples 48 views, with a mutation that restores the historical
whole-quad height gate and must fail.

Ground contact shading (AO) must compare a neighboring wall's vertical span
with the floor edge being shaded. A wall in the shared 2D collision grid is
not automatically beside every stacked floor at that XY location. Counting
buried cave walls against surface grass revealed the cave plan as dark bands
even after its geometry was fully hidden. Keep legitimate surface-wall and
interior contact shading; do not remove AO wholesale from caps or key it to
the player's underground state. Shading must not change geometry or depth.

The grass cap also reuses its saved pristine `surfaceBiome` color, without a
cave-only jitter pattern. Natural biome/elevation variation stays intact. Do
not paint a second material map over a buried cave: its cover should match the
same terrain at the same world coordinates.

Upper-terrain point lighting has a separate immutable, mesh-cell bake in
`07-decorations-lighting.js`. Short source-to-receiver rays test the actual
stitched floor/cap/ceiling triangles, including slopes, before adding a light.
This prevents cave torches revealing the cave through its cover while retaining
unobstructed outdoor lamps and entrance spill. Receivers use the rendered cell
center and the same diagonal/clamp as the floor pass. The per-frame multiplier
uses exterior ambient light, never the camera's cave blend. Rebuild with
`buildPointLights()` after static geometry or light changes; stale mesh/stitch
identity fails closed. The bake is shared read-only by profile/studio views,
whose animated multipliers remain isolated from gameplay.

This is **not** a unified shadow system: legacy interior/wall/entity lighting
still uses its existing XY grid, and actors/props are not baked occluders.
The new field is for the highest exposed terrain receiver, not arbitrary
stacked floors. Regression tests compare real seeded draws with buried lights
removed, preserve terrain coordinates and opaque depth, and reject restoration
of either through-roof lighting or cave-only cap colors.

Mini-preview checkpoint (2026-09-20, 360×240, native browser, no fullscreen or
quality reduction): Above cave rendered at 9.9 ms median / 10.6 ms p95;
Approach at 12.0 / 12.6 ms, both with 16.7 ms median animation-frame cadence.
Final Roof edge check after the stacked-layer guard: 10.6 / 11.5 ms with the
same 16.7 ms cadence. On that fresh page load, the first successful terrain-light
bake took 24.0 ms and the latest rebuild 16.4 ms, retaining 313,600 bytes. It
runs on world assembly, not every frame. A separate fresh headless JavaScriptCore
process measured 51.2 ms on its first bake versus 6.7–12.5 ms in warm runs;
those headless values are not native-browser timings. The browser profile
includes first/latest bake diagnostics separately from render timing. These
are single-host samples, not a statistically controlled speedup claim.

Opaque mask painting merges identical adjacent pixel spans into taller
rectangles. Transparent clipping retains the original one-pixel scanlines:
native Canvas antialiasing can differ slightly when those clip paths are merged.
The optimization changes neither depth sampling nor coverage. Shipping tests
compare randomized mask pixels and depth, including an explicit unmerged-clip
guard.

Floor/ceiling corner stitching is cached lazily in `13-render-floors-ceilings.js`.
Only static semantic corner heights are cached, never camera projections,
lighting, material, or draw order. Float64 values preserve the original
calculation precision. Numeric tile storage is capped at 4 MiB plus 6 KiB scratch
and object bookkeeping; a full cache falls back to uncached calculation without
reducing detail. Mesh/dimension changes and `buildWalkCandZ()` invalidate it.
Future in-place geometry edits must rebuild that derived data or explicitly
delete `mesh._floorRenderStitches` before rendering again.

This is a manual game/UI preview with local substitutes for device services. It
has no hardware backend, sensors, or device network connection, and cannot verify
ESP32 performance or hardware integration. Its JavaScript line numbers match the
generated header, which helps trace an error back to its editable source:

```sh
python3 tools/game/dev.py where 7831
```

Use the header line number from the error or investigation. `where` also requires
a current generated header, validates syntax, and reports the corresponding
source file and line.

## Unified effects V1 (2026-09-28)

Transient visual effects now run through one system. Before it, about ten
effect arrays were each hand-wired into eight lifecycle lists (interpolation
groups, the chunk-window rebase, the run/level/world resets, the studio keys and
reset, the stage lists and the prune sites), and those lists disagreed. The
system is cosmetic: gameplay never reads its state, and it never draws from the
gameplay random stream. Its tick, frame and producer entry points catch, count
and warn once (`console.warn`) instead of throwing into a tick or a frame. These
are `updateEffects`, `fxEvent`, `fxEmit`, `fxAttach`, `fxDetach`, the
registry's prune, rebase, reset, prime and studio calls, and the engine's render
passes. The load-time table compilers, `registerEffectFamily` and the console
setters do throw on bad arguments; call the setters from a `try`/`catch`, as
the settings page does. It has three layers:

- **Effect registry** (`src/02-effect-registry.js`). `EFFECT_FAMILY_SOURCE`
  declares each transient array, global group, painter or engine once: its
  lifetime and prune predicate, rebase rule, reset scopes (`run`, `level`,
  `world`; a clear phase runs before a world is assembled and a prime phase
  after the player is placed), interpolation, studio policy, owner, A/B family
  and 2D/3D stage. `effectRegistryPrune`, `Rebase`, `Reset`, `Prime`,
  `StudioKeys` and `StudioReset` replace the hand lists. The registry also owns
  the switches, the live Particles budget (`effectQuality`), stateless hash
  noise (`effectNoise`), the private legacy random scope and `getEffectStats()`.
- **Particle engine** (`src/11-fx-recipes.js`, `src/11-fx-engine.js`). One
  fixed-capacity pool of typed arrays (3,072 slots, 256 of them reserved for
  gameplay feedback) with dense swap-remove, stepped once per fixed tick by
  `updateEffects(dt)` at the old ambient-update call site and timed as the
  physics stage `effectsSim`. Recipes in `FX_RECIPE_SOURCE` are validated at
  load (a typo throws `Particle recipe <id>: ...`) and packed into typed columns.
  Ground contact uses an exact per-particle cache of the supporting terrain
  triangle. The emitters are:
  - event bursts: a producer's `fxEvent` call is queued, and the next
    `updateEffects` call spawns it. For producers inside `gameUpdate` that is
    the end of the same fixed tick; calls made outside the tick (input
    handlers, the console) wait for the next one;
  - anchors, which are continuous emitters: torches, the dash trail and the
    flame stream internally, or any entity or point through `fxAttach`;
  - camera-relative fields (ambient motes, weather);
  - movement observers (footsteps, dashes, landings);
  - child particles (splashes, drip ripples);
  - direct `fxEmit` bursts.
- **Shared render primitives** (`src/14-fx-render.js`). The `_pt` stages are
  `fxCombat3D` (after `structures3D`), `ambientFX3D` (the world layer, keeping
  the old stage name), `torchGlow3D` (the torch glow, re-hosted), `fxOverlay`
  (first-person eye and screen space, under the arms) and `fx2D`. Visible
  particles are batched by style bucket. Glows and puffs come from a small
  sprite LRU of the system's own (64 entries, 1 MB), not the spell glow cache.
  Lighting, fog and day/night are quantized, and nothing sets `shadowBlur`. A
  stage with nothing to draw makes no Canvas call.

These now run on the engine: ambient motes, torch embers, enemy and spawner
bones (now also drawn in 3D), flame-stream embers and the torch glow. So do the
tome and stat pickup bursts, whose stacked rings were usually off-screen in
first person; they now burst in front of the camera. The shrine, Phoenix,
Thunder Core and garrison-death bursts moved here too. They used to be pruned
on the tick they were pushed and never drew, so they have no legacy code and
draw nothing with `fxUnified` off. The new presets are weather, impact debris
and sparks, and footstep/dash/landing dust.

Geometry painters stay with the spell visuals and are registered for lifecycle
only: ground decals, nova, chain arcs and the flame ribbon. The lob reticle is
drawn from its projectile's target, which now shifts with the projectile when a
chunk is crossed. Coins, soul orbs, arcane tomes and stat pickups stay gameplay
entities, also registered for lifecycle only.

The work also fixes these bugs:
- Chain arcs, novas and the lob reticle keep their place across chunk
  crossings.
- Stat pickups are no longer shifted twice when a chunk is crossed.
- A classic level change clears leftover bones, soul orbs, arcane tomes and
  stat pickups.
- Soul orbs, and coins from spawners, ore and plague clouds, now appear in the
  2D view.

Two of these fixes change gameplay, and both were approved: the stat-pickup
position fix (Q2, a lead decision) and the clearing of soul orbs, arcane tomes
and stat pickups on a level change (Q1, the user's decision). The other fixes
are presentation only.

The gameplay `Math.random` stream also differs from `main`, in both A/B modes,
because the cosmetic draws left it:
- the legacy ambient motes, including their initial fill at world start;
- the bones: 35 draws per enemy death and 25 per spawner death;
- the upward speeds of the shrine, Phoenix, tome and stat bursts, and the
  garrison-death burst's velocities.

Legacy mode runs the kept old bodies (ambient, bones, tome and stat bursts) on
a private stream, and the other bursts have none. So wherever a harness seeds
`Math.random`, the gameplay draws after world assembly land on different values
than on `main`, for example the coin angles after a kill. The distributions are
unchanged. Re-record seeded goldens once, with that reason.

### Occlusion strategies

Each 3D particle chooses its depth test by its footprint in device pixels, so
the per-pixel JavaScript cost cannot grow with canvas size. With a recipe's
`occlusion:'auto'` the choice is:

| Strategy | When it applies | Result |
| --- | --- | --- |
| `point` | Painted radius at most 1.5 px | One depth read; exact |
| `footprint` | Up to 12 px, and up to 24 px while 50,000 reads per frame remain | Scans the footprint with an early exit: visible, hidden or mixed. This is the same decision the billboard mask makes |
| `tiles` | Above 24 px, or 12-24 px once the footprint budget is spent | A lazily built 8×8 min/max tile summary (one level of hierarchical Z). Exact when a box is fully visible or fully hidden, conservative otherwise; only mixed tiles are clipped |
| `segment` | Streaks and bones (rain, sparks) | 2-9 samples along the line; visible runs are drawn, so streaks stop at occluder edges, exact to the sample spacing |
| `corona` | Chosen explicitly for soft additive glows (flame embers, torch glow) | Alpha × the visible share of 5 core samples, drawn unclipped. Glows fade behind terrain instead of being cut, at a constant cost |
| `clip`, then `grid` | Mixed items | An exact clip while 60,000 mask pixels per frame remain, then a bounded 12×12 grid clip. At most 256 mixed items per frame; the rest are tested at their centre |
| `none` | Eye/screen overlay and the 2D view | No depth test |

Resting items (settled snow, chips, splash rings) are depth-tested 0.5 units
above their support so the ground beneath them does not hide them. Sprites
still write no scene depth, so world particles paint over nearer sprites, as
legacy motes did. The 3D-integration models (wall props, chests, spawners,
floor props, landmarks and structure models) do write scene depth: with those
switches on (Recommended) particles are depth-tested against them, and in
Legacy they are sprites again. In Recommended every depth-writing pass runs
inside `draw()`. With `landmarkOpaqueEarly` off (a Custom combination) the
ruin faces and structure shells, and with `landmarkModels` on the stall, guard
tower, shrine and keep-prop models, are written by the late `marketStalls3D`,
`shrines3D`, `ruins3D` and `structures3D` stages instead, as Legacy's ruin
faces and structure shells are. Those stages run before the unified fx stages
(`fxCombat3D`, `torchGlow3D`, `ambientFX3D`, `fxOverlay`), so keep every fx
stage after `structures3D` (`tools/game/tests/pass_order.js`, section
"depth").
In New mode the torch glow uses `corona`. With `wallPropModels` on, its samples
centre on the visible flame rather than on the light, which the modelled shaft
or bowl hides from in front and below: for a torch 2 units out and 2 up from
the light at full size (where embers leave it), for a sconce its flame body's
centre (the bowl axis, 0.19 size above the rim), whose lower flame the bowl
rim hides from below. The model and its flame scale with the prop's size
(clamped on walls spanning under about 117 units) while the light's 0.5 out
does not, so the point is set in model units and scales with the prop. Each
point light carries its point (`glowOut`, `glowUp`); the glow is still drawn
at the light. For the exact A/B, set
`fxTorchGlowOcclusion = 'tiles'` in the console.

### Switches and console controls

In the settings overlay, the **Effects ›** chip on the title row opens
**Settings → Effects** in the same panel. It works windowed and in fullscreen.
Switches apply at once and are not saved.

| Switch | Values (default) | Effect |
| --- | --- | --- |
| `fxWeather` | `off`, `auto`, `rain`, `snow`, `ash` (`auto`) | `auto` rolls 2-5 minute fronts by biome: rain in ground, plains, forest and cave biomes, snow on ice, ash in the expanse. Rain columns whose open sky is 1.5 H or higher fall as snow. Weather fades as the camera enters a cave, so a cave mouth still shows it outside. `auto` never starts weather in Cave Test; force a kind there |
| `fxDebris` | on | Sparks, chips and dust from projectile contacts (wall, floor, cap, ceiling, enemy, spawner, ore, lob) and NPC melee strikes |
| `fxFootDust` | on | Step, landing and dash puffs from the player and NPCs. In first person the player's own step and landing puffs are refused, because the feet are never in view, and a dash shows screen-corner puffs |
| `fxUnified` | on | The A/B master. Off draws the migrated families with their pre-migration code and turns the three presets off. That code runs on a private random stream, so switching never changes gameplay draws. The registry's lifecycle fixes stay on |

The console controls below are in memory only; none of them is saved.
- `setEffectToggle(key, value)` and `effectTogglesSnapshot()` set and read the
  switches.
- `setEffectFamilyMode(family, 'new' | 'legacy' | null)` sets the A/B mode of
  one family: `ambient`, `torchGlow`, `bones`, `pickupBursts` or `flameEmbers`.
  `torchEmbers` follows `ambient`.
- `effectWeatherForce(kind, intensity)` forces the weather. `kind` is `rain`,
  `snow`, `ash`, `biome` (the biome's kind), `clear`, or `null` to release it.
  Read the state with `effectWeatherState()`.
- `setEffectPlacementOverride(recipeId, place)` changes where a recipe spawns
  in first person, for review.

When the render-feature registry (`defineRenderFeature`) is present, the
switches register there and share its values.

### The Particles setting is live

`settings.particles` (Low 10, Medium 25, High 40, Ultra 60; the slider runs
0-60) is read every tick. A change applies on the tick after **Apply**, without
resetting the world. The budget is B = min(capacity − reserve, 48 × P): 1,200 at
Medium, 2,816 at Ultra. Each class has a cap:
- **Combat:** 35% of B.
- **Locomotion:** 10% of B.
- **Ambient:** P plus 5% of B. Ambient motes aim for P, so Medium starts with 25
  motes; the legacy code started with 35.
- **Weather:** whatever the others leave.

Feedback bursts scale by clamp(P/25, 0.5, 1.25) and may use the 256-slot
reserve, so gameplay acknowledgement never disappears, even at 0. When a class
is over a lowered cap, only the excess fades out, over 0.25 s. A spawn of higher
priority (feedback > combat > locomotion > ambient > weather) may steal a slot
from a lower class with a bounded 64-slot scan. Per-recipe distance LOD
(`lod:{near, far, farKeep, cull}`) thins spawns, and streaks draw as dots
beyond `far`.

### Governor

The governor is presentation-only. It thins drawing and nothing else: weather,
ambient and locomotion particles are skipped by a stable per-particle hash, and
the glow cap shrinks with it. Spawning, budgets and the pool never depend on
machine timing. Its input per frame is the sum of two parts:
- **Stage time:** the previous frame's `fxCombat3D + fxOverlay + fx2D` stage
  time, plus `ambientFX3D` and `torchGlow3D` while those families are in New
  mode.
- **Raster estimate:** the device pixels that the previous frame's unpinned
  particle passes painted, at 14 ms per megapixel
  (`EFFECT_CONFIG.governor.rasterMsPerMpx`).

The input is smoothed as `ema = 0.9 ema + 0.1 input`. Above 1.0 ms the level
drops by ×0.97 per frame, down to a floor of 0.35. Below 0.6 ms it recovers by
×1.01. At the floor, glow halos are capped at floor(256 × 0.35) = 89 per frame
for every class. The casting studio, the browser profile and `fxBench` (unless
a run measures the governor) use pinned pools, which draw at 1. Most tests pin
their pools too; the governor and raster checks run unpinned.

### Stats and profiling

`getEffectStats()` returns a copy. It allocates, so call it from the console,
not every frame. Its fields:
- **Pool:** `live`, `capacity`, `budget`, `P`, `s`, and `byClass.<class>.{live, cap}`.
- **`tick`** (cumulative since the last level or world reset, not per tick):
  spawned, killed, stolen, children, events in, dropped and gated, and the
  reasons for refused spawns (`refused.toggle`, `family`, `cap`,
  `budget`, `lod`, `spawnCap`, `offscreenSelf`, `view`, `noSupport`,
  `childQueue`).
- **`registry`:** pruned, rebased, cleared, primed, and `malformed` records per
  family.
- **`failures`:** failures per entry point. Any nonzero count is a bug; every
  effects harness asserts zero.
- **`frame`:** considered, gated, thinned, offscreen, subpixel and drawn counts;
  buckets; `occ` counts per strategy; `maskPx`; `rasterPx`; glow draws and caps;
  sprite hits and builds.
- **Governor and world:** `governor`, `governorInput {ema, input, rasterMs}`,
  and the `fields`, `weather` and `torches` state.

The render stages appear in the Perf HUD and in Cave Test **Profile preview**.
`physicsProfileReport()` reports `effectsSim` when `physicsProfileEnabled` is
set.

`tools/game/fx-bench.js` is the browser measurement protocol for targets T1-T10.
It is not in the manifest and never ships in the header. `dev.py serve` serves
it at `/fx-bench.js`, to be injected into a separate, visible, foreground test
tab. Its header comment gives the procedure. Its report's `env.game` records
the effect switches and the render preset and switches (`render`), as the
cave browser profile's `canonicalInputs` does: models and textures change what
particles are depth-tested against and the frame's work, so runs taken under
different switches can be told apart. The profile's `renderFeatures` hold the
effect switches too (they are registered as render features), and its
`effectFamilies` record each effect family's mode, which a console
`setEffectFamilyMode` override sets apart from every switch.

### Adding an effect

1. **An existing event, anchor or field** needs one recipe entry and no code.
   Base it on an existing recipe with `extends`. For example, a hypothetical
   `impact.iceShard`:

   ```js
   'impact.iceShard': {extends:'impact.chip',
     trigger:{event:'projectileContact', where:{kind:['wall', 'floor', 'cap'], spell:['ice']}, count:4},
     color:{material:'frostMagic', roles:['core', 'light']}, lighting:'emissive',
     render:{primitive:'chip', size:[0.3, 0.6], alpha:[0.9, 1]}},
   ```

   The recipe inherits its class, switch, LOD, occlusion, 2D form and stats from
   the base. `trigger` and `color` replace the base's values whole instead of
   merging with them.
2. **A new gameplay event** needs one guarded producer line, for example
   `if (typeof fxEvent === 'function') fxEvent('chestOpen', ch);`.
   - Add the name to `FX_EVENTS` in `11-fx-recipes.js`, with its A/B `family`
     (or `null`) and its `where.kind` vocabulary.
   - Add a reader to `FX_EVENT_READERS` in `11-fx-engine.js`. It copies position
     and colour into the event slot and never keeps or writes the producer's
     object. The engine checks at load that every event has a reader.
   - Add recipes with `trigger:{event:'chestOpen', ...}`.
3. **Something continuous on an entity** needs a recipe and one call, here
   for a hypothetical `status.burnEmber` recipe:
   `var h = fxAttach('status.burnEmber', enemy, {until:enemy.burnUntil, rate:12});`.
   - The rate comes from `opts.rate` or the recipe's anchor trigger, and it
     must be positive.
   - A body with a numeric `health` (or any object passed with
     `opts.follow`) is followed every tick and stops when it dies. Anything else
     is a static point.
   - `fxDetach(h)` ends the emitter early.
4. **A new transient array or painter state** needs one
   `registerEffectFamily(name, def)` call. The lifecycle lists and the studio
   keys pick it up. `def` must name a `draw3D` and a `draw2D` decision (a stage
   name, or `{none:'reason'}`) and use only the registry's keys and values. The
   call throws otherwise, or when the name is already registered. Input-release
   behaviour (for example, stopping when the
   fire button is released) stays with the owner's input handlers.

Every new effect also needs these:
- Cosmetic code never calls `Math.random`, `presentationRandom` or
  `shadowBlur`; use `effectNoise`.
- World units and material roles only.
- A class and priority that fit. Use feedback only for gameplay
  acknowledgement.
- A `view2D` decision.
- A first-person `place` for events at or near the player.
- A harness row per `TESTING.md`: a named mechanism, a fixture that reaches it,
  an independent oracle, a control and a `--flag` mutation. Update the exact
  PASS count.

Then run `build`, the focused suite and the full gate, and check the look in a
separate browser tab.

### Measurements so far

Headless suites check counts and contracts, not time. No browser figure so far
meets the spec's protocol: a visible foreground tab, p95 over 600 or more
frames. Every figure below comes from Chrome (version and DPR not recorded) in
a **hidden** preview pane on a loaded machine, with frames driven by hand. The
runs used Endless seed 424242 at noon and 240 frames, of which the first 120
were skipped. Each figure is a mean over the 120 measured frames, not a
percentile:
- **Stage JS time** is the fx stages' JavaScript time.
- **Flushed** is the fx stages plus one 1-px `getImageData` readback, which
  makes the canvas finish its queued drawing inside the timed span.

"Pinned" holds the governor at 1. That is how 3D behaved before the raster
estimate was added, because its JS-only input stayed below the threshold.

| Scene | Pinned, flushed | Governed, flushed | Stage JS time (pinned → governed) | Governor |
| --- | --- | --- | --- | --- |
| 3D 1920×1080, Ultra rain (3 interleaved pairs) | 2.83 / 2.92 / 3.01 ms | 1.22 / 1.23 / 1.25 ms | 0.52 → 0.28 ms | 0.35 (floor) |
| 3D 360×240, Ultra rain | 0.816 ms | 0.802 ms | about 0.32 ms | 1 |
| 3D 1920×1080, Medium rain | 1.31 ms | 0.93 ms | 0.25 → 0.19 ms | 0.715 |
| 2D 1920×1080, Ultra snow | 0.76-0.81 ms | 0.83-0.84 ms | about 0.16 ms | 1 |
| 2D 1920×1080, Ultra ash | not measured | 0.77 ms | 0.16 ms | 1 |
| 2D 1920×1080, Ultra rain (splash rings only) | not measured | 2.21 ms | 0.18 ms | 1 |

Before the raster estimate was added, the governor could not see raster cost.
At 1920×1080 Ultra rain, the fx stages took 2.46 ms flushed while the
governor's input, which was JS time only, read 0.43 ms.

The pixel model underprices small items. A 600-item flushed microbenchmark at
1080p measured 0.5-3.3 µs per item, against 0.06-0.32 µs modelled. This is why
2D rain splashes cost 2.2 ms while the governor stays at 1. At Medium rain in
1080p, the governor settles near 0.7 and never recovers, because its smoothed
input stays between the two thresholds.

### Still owed

These are owed before sign-off:
- The visible-foreground targets T1-T10.
- Chrome allocation sampling for T10. This is the only proof that the steady
  state allocates nothing.
- Safari and a phone.
- A decision on the raster calibration. A per-item cost by primitive plus a
  per-pixel cost is proposed.
- Each family's art review.

The legacy code paths, the `fxUnified` fallbacks and the A/B scaffolding are
removed only after the user signs off. See
`docs/game_audit_handoff/PARTICLE_SYSTEM_2026-09-28.md`.

## Optional local game audit

The existing local audit lab under `tools/webui` adds behavioral checks when it
is present:

```sh
python3 tools/game/dev.py test --suite smoke
python3 tools/game/dev.py test --suite physics
python3 tools/game/dev.py test --suite cave_milestone
python3 tools/game/dev.py test --suite physics --probes
```

Choose the suite for the behavior being changed. `--probes` requires a specific
suite. The full 1,134-cell investigation matrix is not an everyday edit check;
broaden testing when a change crosses subsystem boundaries or reveals a
regression. Known-bug results describe current behavior and need interpretation
when implementing a repair.

The core build/check/test workflow does not depend on the audit lab or handoff
documents. The standalone CanvasGame 0.0 snapshot includes both, with historical
records sanitized for publication.

## Standalone repository workflow

CanvasGame is now maintained separately from HardwareOne firmware. The generated
header's compatibility path is retained, but no firmware build configuration or
unrelated G2/audio code is included. Use `codex/` branches for new development.

Before a commit, inspect `git status --short` and stage explicit source, tooling,
docs, and generated-header paths. Avoid `git add -A`; private captures, local
credentials, and unsanitized evidence must stay out of commits. Check staged
content and commit metadata before publishing.
