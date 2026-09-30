# Unified effects (particle system): handoff (2026-09-28)

Status: slices S1-S8 of the unified effects plan and the S9 engineering and
tooling fixes are implemented and tested. The rest of S9 remains: the
visible-foreground measurements and the per-family art review. S10 (cleanup)
waits for the user's sign-off.

It is committed as `4fd4c69` on the local branch `codex/particle-system`, on
top of spell-visuals slice 1 (`cdbdf0f`, branch `codex/spell-visuals`, created
from `main` at `c6851a4`), and both are merged with the other work branches on
`codex/merge-all`. Section 6 ("Spell session") lists the spell-only files and
the files that mix both. The effect recipes depend on spell slice 1's
materials (section 6, "Hard dependency"), which the commit order keeps first.
Nothing has been pushed or tagged. Publishing requires the user's explicit
authorization (root `AGENTS.md`).

Read these first: root `AGENTS.md`, `assets/games/AGENTS.md`,
`assets/games/TESTING.md`, and the README section "Unified effects V1
(2026-09-28)" in `assets/games/README.md`. That section covers the layers,
occlusion, switches, the Particles budget, the governor, stats and how to add an
effect. Then read this file.

The full design spec and the per-slice review records were kept outside the
repository. Code comments that say "section N" refer to that spec. Everything
load-bearing from it is restated in the README section or here. Whether to
publish a sanitized copy under `docs/` is the user's call.

## 1. What the user asked for and decided

The user asked for one effects system and set four tests for it: is it
efficient, modular and dynamic, quick, and applicable to a wide range of
effects? The design answers with recipes whose strategy flags choose the
behaviour per scenario. Every existing effect goes under the system, and three
new presets each ship behind an in-game switch:
- weather (rain, snow, ash);
- impact debris and sparks;
- footstep and dash dust.

The user answered two open questions (2026-09-27):
- **Q1: clear all three.** Soul orbs, arcane tomes and stat pickups are now
  cleared on a classic level change (`reset:'level world'`), as coins already
  were. This is a gameplay-visible change.
- **Q11: code size is not a constraint.** The game is no longer served from the
  ESP32, so no comment-strip build step is added. The size gate in
  `test_effect_registry.py` is informational: it prints the measured bytes and
  fails only above a 400 KB runaway cap. The user answered on the spec's
  estimate of 110-125 KB. The effect code now measures 274,969 B: the four new
  files plus a 3,000 B allowance for the hook lines. That is 2.2-2.5 times the
  estimate, and under the runaway cap.

The lead made these decisions under that direction. They are open to the
user's review:
- **Q2:** fix the double shift of stat pickups on a chunk crossing (a verified
  bug). This is gameplay-visible: it moves where a stat pickup is collected.
- **Q3 (weather):**
  - `auto` is the default, with fronts of 2-5 minutes and ash in the expanse.
  - **`snowLineH` is 1.5 H.** This supersedes the 0.5 H of an earlier
    revision. On seed 424242, 0.5 H is the median surface height, so half the
    world's rain would have fallen as snow. 1.5 H is the 84th percentile
    (16% of cells), which gives snow on peaks.
- **Q4:** fireflies appear at night, and shimmer and sparkle by day.
- **Q5 (first-person placement):** world bursts in front of the camera
  (`sourceOrFront`), an eye-space Phoenix ring, screen puffs for a dash, and
  no puff for the player's own landing. `setEffectPlacementOverride` exists for
  the review.
- **Q6:** ownership moves to this system; see section 7.
- **Q7:** add the Settings → Effects page.
- **Q8:** the dead cone code is left to spell slice 6.
- **Q9, Q10:** out of v1. Cosmetic fields on gameplay records, and coin/orb
  expiry, pickup through roofs and a 2D coin cull, are separate proposals.
- **Q12:** whether `fxUnified` stays after sign-off is decided at sign-off.
- **Accepted amendments:**
  - The governor counts the ambient and torch-glow stages only while those
    families are in New mode.
  - A slime hop lands on a phase crossing.
  - Dash dust is refused when the ground is more than 1 H below.
  - `render.minPx2D` sets a minimum dot size in 2D.
  - Flame embers use `corona` occlusion.

Two deviations from earlier lead decisions have been implemented since S2 and
need the user's sign-off:
1. **Own sprite cache.** Particle glow and puff sprites use their own small LRU
   (64 entries, 1 MB), not the spell glow cache, so lit dust palettes cannot
   evict spell glows in combat. A later merge into one sprite LRU is offered to
   the spell session.
2. **Back-projection.** Particles are drawn by back-projection on the
   interpolation timeline (`pos − vel·back`), not by forward extrapolation, so a
   spark from a fast bolt stays at its source.

## 2. What exists now

### New shipping source (`assets/games/src/`, manifest updated)
- **`02-effect-registry.js`** (after `02-render-interpolation.js`):
  - `EFFECT_CONFIG` holds capacity, reserve, caps, budgets and the governor
    constants.
  - The family table `EFFECT_FAMILY_SOURCE` compiles through
    `compileEffectFamilies` into `EFFECT_FAMILIES`. New families register with
    `registerEffectFamily`.
  - Lifecycle entry points: `effectRegistryPrune`, `Rebase`, `Reset`, `Prime`,
    `StudioKeys`, `StudioReset` and `Report`.
  - Stats: `effectStats`, `effectFailure` and `getEffectStats`. Noise:
    `effectNoise`.
  - Switches: `EFFECT_TOGGLE_DEFS`, `effectToggleValue`, `effectToggleOn`,
    `effectPresetOn`, `setEffectToggle`, `effectTogglesSnapshot` and
    `effectToggleGeneration`.
  - Family modes: `EFFECT_FAMILY_MIGRATED`, `EFFECT_FAMILY_FOLLOWS`,
    `effectFamilyMode` and `setEffectFamilyMode`.
  - Also `effectQuality` (the live Particles budget) and
    `effectWithLegacyRandom`.
- **`11-fx-recipes.js`** (after `11-enemies.js`):
  - Materials and name tables: `FX_MATERIAL_COLORS` (compiled to
    `FX_MATERIALS`), `FX_EVENTS`, `FX_ANCHOR_NAMES`, `FX_FIELD_SOURCE`,
    `FX_WEATHER_RULES` and `FX_ENUMS` (every strategy flag).
  - `FX_RECIPE_SOURCE` holds the templates `mote` and `feedbackBurst` and the
    shipping recipes: `ambient.*`, `torch.ember`, `bone.*`, `burst.*`,
    `impact.*`, `melee.spark`, `step.*`, `screen.dashDust`, `weather.*` and
    `flame.ember`.
  - The compilers: `compileFxRecipes` (to `FX_COMPILED`) and
    `compileFxWeatherRules` (to `FX_WEATHER`).
- **`11-fx-engine.js`** (after `11-fx-recipes.js`):
  - Pool and tick: `createFxState`, `fxState` and `updateEffects`.
  - Producer API: `fxEvent`, `fxEmit`, `fxAttach` and `fxDetach`.
  - `FX_EVENT_READERS`, `FX_LEGACY_ADAPTERS`, `PARTICLE_ANCHORS`, and the
    observers, fields and weather schedule.
  - Console and reset: `effectWeatherForce`, `effectWeatherState`,
    `setEffectPlacementOverride`, `fxRebase`, `fxReset`, `effectProfilePrime`
    and `fxEngineStats`.
- **`14-fx-render.js`** (after `14-render-entities.js`):
  - Stages: `beginEffectFrame`, `drawEffectLayer3D(layer)`, `drawEffectOverlay`,
    `drawEffectLayer2D`, `drawSoulOrbs2D` and `drawTorchGlowStage3D`.
  - `fxTorchGlowOcclusion`, the dev override for the torch glow's occlusion.
  - `fxRenderStats`.
  - The settings page: `drawEffectSettingsPage` and
    `handleEffectSettingsClick`.
  - The governor, in `fxFrameSetup`.

### Hook lines in existing files (additive and `typeof`-guarded)
| File:line (current) | Hook |
| --- | --- |
| `02-render-interpolation.js:11, 18, 142, 168` | `renderPresentationAlpha`; `registerRenderInterpolationGroup` |
| `03-level-generation.js:1583` | `fxEvent('thunderCore', …)` |
| `05-endless-world.js:3079` | lob `targetX/targetY` shifted with its projectile |
| `05-endless-world.js:3082` | `effectRegistryRebase` replaces the effect rebase loops |
| `05-endless-world.js:3381, 3422` | world clear before assembly; world prime after it |
| `05-endless-world.js:3566` | level clear and prime |
| `06-spatial-geometry.js:117, 143` | `spatialLayerCornersInto` (no allocation), with `spatialLayerCorners` as a wrapper around it |
| `07-decorations-lighting.js:275, 285` | point lights gain `kind` (and a torch's `nx`/`ny`) |
| `09-physics.js:409` | `fxEvent('phoenix')` |
| `10-combat.js:604` | `fxEvent('projectileContact', p, contact, nx, ny, nz)` |
| `10-combat.js:632` | `fxEvent('spawnerDeath', …)` |
| `10-combat.js:774` | guarded `effectRegistryPrune(now, dt)`, with the legacy blocks in its `else` branch |
| `10-npc-controller.js:218, 230` | `fxEvent('meleeCommit', …)` |
| `11-enemies.js:126` | `fxEvent('enemyDeath', e)` |
| `14-render-entities.js:2044, 2149` | legacy flame-ember loops, guarded by `effectFamilyMode('flameEmbers')` |
| `15-render-hud-menu.js:363` | `drawCoins2D` treats a missing or non-finite `bob` as 0, so those coins show in 2D |
| `15-render-hud-menu.js:2881, 3115` | Settings → Effects hooks |
| `17-input-lighting-update.js:581` | `updateEffects(dt)` in the slot `updateAmbientParticles` had |
| `17-input-lighting-update.js:622` | `fxEvent('shrine', …)` |
| `18-arena-fortress.js:337, 486, 511` | `fxEvent('allyDeath')` (garrison), `fxEvent('pickup', …, 'tome')`, `fxEvent('pickup', …, 'stat')` |
| `20-browser-profile.js:72-140` | the Cave Test profile swaps in a primed, pinned pool of its own and restores the live one |
| `20-casting-preview.js:39, 174, 268` | studio keys, studio reset, studio step |
| `21-frame-loop.js:11, 32-35, 92` | `beginEffectFrame`; stages `fxCombat3D`, `torchGlow3D`, `ambientFX3D`, `fxOverlay`, `fx2D` |
| `22-lifecycle.js:100` | `effectRegistryReset('run')` |

### Tooling
- `tools/game/fx-bench.js` is the browser measurement protocol for T1-T10. It is
  not in the manifest. `dev.py serve` serves it at `/fx-bench.js`, and its
  header comment gives the procedure.
- `tools/game/dev.py`: the `/fx-bench.js` route, and 10 new suites in the test
  list.
- `tools/webui/tests/test_game_persistence.py` (the optional lab): D20's
  stat-pickup known bug is retired. A BREAK probe checks that restoring a
  second shift fails. It anchors on the literal `statPickups` family line in
  `02-effect-registry.js`.

### Tests (exact PASS counts from the Python wrappers)
| Suite | Harness | PASS | Mutation flags |
| --- | --- | --- | --- |
| `test_effect_registry` | `effect_registry.js` | 76 | 36, plus the code-size report |
| `test_particle_engine` | `particle_engine.js` | 98 | 70 |
| `test_particle_render` | `particle_render.js` | 98 | 86 |
| `test_effect_ambient` | `effect_ambient.js` | 55 | 34 |
| `test_effect_producers` | `effect_producers.js` | 28 | 23 |
| `test_impact_debris` | `impact_debris.js` | 31 | 37 |
| `test_locomotion_dust` | `locomotion_dust.js` | 73 | 101 |
| `test_weather` | `weather.js` | 79 | 54 |
| `test_flame_embers` | `flame_embers.js` | 25 | 16 |
| `test_fx_bench` | `fx_bench.js` | 33 | 50; skips when the optional audit lab is absent |

Each mutation must fail its named check. Where a wrapper lists `CAUSES`, the
failing line must also match that regex. Setup failures and crashes do not
count as a kill.

These existing suites also changed:
- **`test_casting_studio`:** 74 on `main`, 82 with spell slice 1, 90 now. It
  gained 6 mutation flags: pool isolation, per-step integration, drift across
  cycles, and the governor pin.
- **`test_browser_profile`:** 32 → 38, for the pool swap and the canonical
  inputs.
- **`test_physics_profile`:** still 19. The pinned `gameUpdate` entry 16 is now
  `updateEffects`.
- **`test_projectile_sweeps`:** still 44. Spawner death is now one
  `spawnerDeath` event instead of five `deathEffects` records.
- **`test_casting_presentation`:** still 76 / 22. The spawner scenario's spatial
  contract changed and its reason is recorded; no hash moved.
- **`test_dev`:** the bench route, and a check that the bench never enters the
  manifest or the header.
- **Spell slice 1 suites:** `test_spell_visuals` 58, `test_spell_visibility`
  132 and `test_material_palette` 35 pass at the spell slice 1 counts.

The full gate has 195 tests. That was 160 on `main`, 165 with spell slice 1,
177 after S2, 182 after S4 and 190 after S8. Both S9 lanes ran it green. After
both lanes had finished, the combined tree passed it again on both engines:
195 tests OK on Deno (536 s) and on JavaScriptCore (407 s).

A note on JavaScript engines: `tools/webui/js_engine.py` prefers Deno whenever
it is on `PATH`. Putting the JavaScriptCore Helpers directory first on `PATH`
does not change that. To force JavaScriptCore, restrict `PATH` to the system
directories. Both engines were green through S8 and on the final S9 tree.

## 3. Browser evidence (summary)

Every check used a separate tab against the session's own `dev.py serve` on a
separate port, never the user's positioned game. The preview pane was hidden,
so `document.hidden` was shimmed in that tab only, and ticks or frames were
driven by hand. Raw rows and screenshots stay outside the repository.

- **S1-S2:**
  - Endless loads with no console errors, and `getEffectStats()` is clean.
  - Settings → Effects renders with Weather, Impact debris, Footstep dust and
    Unified effects.
- **S3-S4:**
  - At Medium the ambient field holds 25 members (legacy: 35), with 8 on
    screen.
  - A tome pickup shows a violet radial burst in front of the camera at pitch 0.
    Legacy drew stacked yellow rings that were off-screen.
  - Enemy bones and spawner shards arc and settle in 3D. Legacy drew them in 2D
    only.
  - Zero effect failures.
- **S5-S8:**
  - Auto weather picked rain in the forest: wind-slanted streaks, occluded by
    trunks.
  - Forced snow drifts and settles.
  - Ash at night shows darkened flakes and orange cinders.
  - An ice bolt into a trunk throws sparks and bark chips.
  - The flame jet carries corona-tested embers along the beam.
  - Zero failures and no console errors.
- **S9 engineering:** the governor A/B at 360×240 and 1920×1080, in 3D and 2D,
  with the 1-px readback protocol, in Chrome (version and DPR not recorded). The
  table is in the README section; its figures are means over 120 measured
  frames. The main findings:
  - At 1080p Ultra rain the governed fx stages cost 1.22-1.25 ms flushed,
    against 2.83-3.01 ms pinned, and the governor sits at its 0.35 floor.
  - At 1080p Medium rain the governor settles at about 0.7 and never recovers.
  - 2D rain splash rings cost 2.21 ms flushed while the governor stays at 1:
    the pixel model underprices small items by about 6-12×.
- **S9 tooling:** an `fxBench` smoke test. This checked the tooling, not
  performance.
  - A hidden tab was refused.
  - A T9 run with flushes restored every watched value exactly and called
    `getEffectStats` only as each run ended.
  - The 2-second snapshot landed at 2007.6 ms.
  - Opening settings mid-run ended the run and restored the page.
  - Injecting the bench again kept the running copy.

## 4. Measurements still owed

None of these can be taken from a hidden pane. The targets come from the spec
and none has been measured to its protocol yet. Unless noted, they apply to
Chrome on an M1, a windowed 360×240 canvas, a **visible foreground tab**, a warm
page, and p95 over at least 600 frames. Use `fxBench` (README section).

| ID | Scene | Target |
| --- | --- | --- |
| T1 | idle, 0 live | `effectsSim` ≤ 0.01 ms/tick; fx render stages ≤ 0.02 ms/frame |
| T2 | Medium, clear | `ambientFX3D + fxCombat3D + fxOverlay` ≤ 0.05 ms/frame |
| T3 | stress 3,000 live dots | render JS ≤ 1.5 ms/frame; `effectsSim` ≤ 0.25 ms/tick |
| T4 | Medium heavy rain | `ambientFX3D` JS ≤ 0.5 ms; flushed ≤ 1.0 ms/frame; `effectsSim` ≤ 0.08 ms/tick |
| T5 | Ultra heavy rain | all fx stages, flushed, ≤ 1.6 ms/frame |
| T6 | busy combat, 20 wall hits/s, 3 deaths/s | `fxCombat3D` ≤ 0.4 ms/frame |
| T7 | flame stream held | flushed at least 0.3 ms/frame below legacy; JS no worse than legacy + 0.05 ms |
| T8 | Cave Test mouth, 20-40 u from a torch | `torchGlow3D` ≤ 0.7× legacy at 360×240; ≤ 1.5 ms at native 1920×1080 |
| T9 | native 1920×1080, heavy rain | governor EMA ≤ 1.0 ms after 2 s, unpinned, with thinning counters; pinned ≤ 3 ms |
| T10 | 30 s heavy rain | Chrome allocation sampling: no fx function among the sampled sites after warm-up; minor GCs ≤ legacy. This is the only proof of the zero-allocation claim |

Also owed:
- **Other devices and sizes:** Safari; one phone; DPR; fullscreen after Apply at
  0.5, 0.75 and 1.0.
- **Raster calibration, a lead or user decision.** `rasterMsPerMpx = 14` was
  fitted on rain streaks in one hidden-pane Chrome session. The proposal:
  1. Switch to a two-term model: a per-item cost by primitive plus a per-pixel
     cost.
  2. Refit it, and re-derive the 1.0 / 0.6 ms thresholds for the combined
     input.
  3. Then run T9 in a visible tab.
- **`fxBench` wording.** The T9 headline still says "fx stage EMA", but the EMA
  now includes the modelled raster. Rewording it and reporting `governorInput`
  are left to the tooling owner.
- **Spec amendments.** The governor's input law and the new stats fields
  (`frame.rasterPx`, `governorInput`) are documented in the README section but
  not yet in the spec.

## 5. Art review list

- **Density and visibility:**
  - Torch embers run about 24 live at the Cave Test mouth. Legacy showed about
    2.4, because its spawn was broken.
  - Distant NPC dust is barely visible at 100-140 units.
  - Fullscreen 2D weather is sparser per world unit, because the 2D population
    grows with the view area only up to 3×.
- **Look:**
  - 2D flame embers draw as uniform 6 px dots.
  - Resting bones fade 0.3-0.5 s after they settle, and live longer overall
    than legacy (1.4-1.8 s against 0.8 s).
  - Spores still rise through cave roofs, because they collide with floors only.
  - Rain passes through stall and tower roofs that have no mesh. This is
    accepted and documented.
- **Governor effects:**
  - At 1080p Medium rain the governor stays near 0.7, so the thinning is always
    on.
  - At 1080p Ultra rain it sits at the 0.35 floor, where glow halos are capped
    at 89 per frame for every class, including combat and feedback.
  - The raster constant does not depend on the device, so it may over-thin on
    fast GPUs.
- **Changes that need a look in an A/B:**
  - The forward-biased ambient box, and the day/night gating of fireflies,
    shimmer and sparkle.
  - The first-person placements: world, eye and screen.
  - Batched same-style dots.
  - The torch radius from `projScale`, which is no longer 18% too large at
    16:9.
  - The grid clip at native fullscreen.
  - The corona fade, instead of a hard cut, for torch glows and flame embers.
  - Flame embers without `shadowBlur`.
- **Weather tuning (Q3):** front lengths, per-biome chances and populations.
- **The two deviations** in section 1, and **Q12**.

## 6. Merge notes

- **3d-int `HEADER_BYTE_BUDGET`.**
  - 3d-int's untracked `test_dev.py` pinned the header at 1,584,000 B when S2
    was built. The merged header was estimated at about 2.02 MB or more at S8.
  - Re-derive the pin from the actual merged header, built with `dev.py build`
    on the merged tree, rather than by adding estimates. Size is informational
    (Q11).
  - `test_effect_registry` prints this branch's effect-code total on every run:
    274,969 B now, including the 3,000 B hook allowance, against the spec's
    estimate of 110-125 KB.
- **Gameplay random stream.** Compared with `main`, the cosmetic draws left
  the gameplay `Math.random` stream, in both A/B modes:
  - S2 moved the legacy ambient motes (including their initial fill at world
    start) to a private stream;
  - S4 removed the bones (35 draws per enemy death, 25 per spawner death), the
    upward speeds of the shrine (12), Phoenix (16), tome (15) and stat (12)
    bursts, and the garrison-death velocities (10). Thunder Core drew none.

  Where a harness seeds `Math.random`, the gameplay draws after world assembly
  land on different values than on `main`, for example coin angles after a
  kill. The distributions are unchanged. This branch's gate is green, but other
  sessions' seeded goldens may move on the merged tree. Re-record them once,
  with that reason, never silently.
- **The 3d-int render-feature registry.**
  - The four switches call `defineRenderFeature` when it exists: booleans have
    `legacy:false`, and there are no render actions.
  - Its Graphics row expects exactly one button, so `fxBench` stays outside the
    manifest.
  - 3d-int's render-feature comment says a switch may "change drawing only:
    never simulation, world data or the random streams". The proposed wording
    is "never gameplay simulation", and it still needs that owner's sign-off.
  - The single Legacy `render_parity` re-pin foreseen for S2 was not needed: the
    merged-tree pins passed under JavaScriptCore.
  - Re-run 3d-int's suites, including its untracked tests, on the merged tree
    before merging.
- **Water system (wading).** Gate footstep dust while wading with a
  `typeof`-guarded `waterAt` check in the locomotion observers
  (`fxObservePlayer`, `fxObserveNpcs` and the step reader in
  `11-fx-engine.js`). Done at the water-system merge: `fxWading` gates the
  observers' one emitter (`fxObsEmit`) and the dash trail, and water
  surfaces are the particles' floor (`fxWaterFloor`); see the README's
  "Water system" section.
- **Spell session.**
  - **Hard dependency.** Four shipping recipes use spell slice 1's materials
    from `01-materials.js`: `burst.phoenixRing` uses `fireMagic` (`core`,
    `light`, `mid`), `burst.phoenixEmbers` uses `fireMagic` (`light`, `mid`),
    `burst.thunder` uses `stormMagic`
    (`core`, `light`), and `flame.ember` uses `fireMagic` (`core`, `light`,
    `mid`). Neither material exists on `main`. `compileFxRecipes` runs at load
    and throws on an unknown material or role, which stops the main script, so
    the game does not start. Spell slice 1 must therefore land first and keep
    those names and roles. Otherwise, move those colours into
    `FX_MATERIAL_COLORS` in `11-fx-recipes.js`. Met: spell slice 1
    (`cdbdf0f`) is this branch's base and keeps those names and roles.
  - **Base copy.** Done: `4fd4c69` is rebased onto spell slice 1 (`cdbdf0f`,
    its parent) and carries no spell-only files; `git diff cdbdf0f 4fd4c69`
    touches none of them, and the mixed files below hold only this branch's
    hunks. The instruction as written before the rebase: this branch carried
    a copy of spell slice 1. Once that slice was committed, the copy was to be
    diffed against it for drift, then rebased so the spell-only files come
    from its commit. The carried files were:
    - **Spell-only:** the `01-materials.js` hunk; `material_palette.js` and
      `spell_visibility.js` with their wrappers; the `_bootstrap.js` engine
      repair; `14-spell-visuals.js`; `spell_visuals.js` and
      `test_spell_visuals.py`; and `SPELL_VISUALS_2026-09-27.md`. The tracked
      hunks among these are byte-identical to the spell-visuals working tree's
      hunks at the time the copy was taken. The `_bootstrap.js` repair belongs
      in spell slice 1's first commit.
    - **Mixed, split hunk by hunk by the rebase:** `manifest.json`,
      `14-render-entities.js` (the spell dispatch and the flame-ember guards),
      `20-casting-preview.js` (the gallery and the studio hooks),
      `21-frame-loop.js` (the reorder and the effect stages), `dev.py`,
      `casting_studio.js` with `test_casting_studio.py`, and the generated
      header.
  - **`10-combat.js:604`.** The `projectileContact` hook sits immediately
    before the lob-landing block that spell slice 2 rewrites. S5 landed before
    spell slice 2, so it assumes this line is a shared hook. That is a request,
    not an agreement yet: spell slice 2 needs to keep the line verbatim when it
    rewrites the block, or move it with the rebase. Please pass this on through
    the user, with section 7.
  - **`14-render-entities.js:2044, 2149`.** The flame-ember guards; see section
    7.
  - **`21-frame-loop.js`.** The stage lines sit next to spell slice 1's reorder.
    `fxCombat3D` must stay after `structures3D` and every sprite stage.
  - **`20-casting-preview.js`.** Single added lines next to the gallery keys.
  - **`22-lifecycle.js:100`.** The run reset sits beside the halo resets spell
    slice 5 plans. Slice 5 can instead register its halo globals with
    `registerEffectFamily` using `reset:'run level world'`, and skip that file.
- **Trivial conflicts.** `manifest.json` and the `dev.py` test list are
  append-only.
- **Pre-existing and unrelated.** A `platforms3D` crash in `drawLayersFloor3D`
  on a hand-started classic level also happens on the pre-S1 page. Fixed at
  the floor-render-crash merge: `buildClassicFloorLayerColors` in
  `03-level-generation.js` gives classic meshes their layer colours
  (`classic_floor_render.js`).

## 7. Q6 ownership note for the spell session

Please pass this on through the user.

- **Producers and bone loops.** The unified effects system owns all eight, each
  now a one-line `typeof`-guarded `fxEvent` hook. They fall into two groups:
  - **With a legacy adapter.** The tome pickup (`18-arena-fortress.js:486`),
    the stat pickup (`18-arena-fortress.js:511`) and the bone loops
    (`11-enemies.js:126`, `enemyDeath`; `10-combat.js:632`, `spawnerDeath`).
    Their old bodies were moved verbatim into `FX_LEGACY_ADAPTERS` in
    `11-fx-engine.js`, which `fxEvent` runs on the private legacy stream while
    their family is Legacy.
  - **Deleted, with no adapter.** Phoenix (`09-physics.js:409`), Thunder Core
    (`03-level-generation.js:1583`), Shrine (`17-input-lighting-update.js:622`)
    and garrison death (`18-arena-fortress.js:337`). Their records were pruned
    before any frame drew them, so there is no body to recover, and Legacy
    mode draws nothing for them, as before.
- **Random stream.** The old loops drew from the gameplay `Math.random`, except
  Thunder Core's. The hooks no longer do, so seeded gameplay draws shift once
  (section 6, "Gameplay random stream").
- **Spell slice 2** keeps only the synergy `type` rings (steam, shatter,
  frostnova) and the lob ring. The bullet in `SPELL_VISUALS_2026-09-27.md`
  section 4 about converting those producers to `{spawnMs, lifeMs, ...}` is
  superseded. The spawn points of those bursts are off-screen in first person,
  which is why they are placed by this system.
- **Flame/cone embers** moved to this system (`flame.ember`, drawn in
  `fxCombat3D` and `fx2D`). The legacy ember loops in `drawFlameStream2D`
  (`14-render-entities.js:2044`) and `drawFlameStream3D` (`:2149`) run only
  while `effectFamilyMode('flameEmbers') === 'legacy'`. The beam ribbon is
  untouched and stays with the spell plan.
- **Spell slice 3** keeps that guard if it rewrites `drawFlameStream3D` (and
  `drawFlameStream2D`). Otherwise Unified mode would draw both ember sources.
- Geometry painters (ground decals, nova, chain arcs, flame ribbon) stay with
  the spell plan. They are registered in the effect registry for lifecycle
  only, and may attach emitters with `fxAttach`. The lob reticle has no family:
  it is drawn from its projectile's `targetX`/`targetY`, and its chunk-crossing
  fix is the target shift in the projectile rebase loop
  (`05-endless-world.js:3079`).

## 8. Contracts every later change must keep

- **Effects are cosmetic.** Gameplay never reads `fxState`. Cosmetic code never
  uses `Math.random`, `presentationRandom` or `shadowBlur`; use `effectNoise`.
  Legacy A/B bodies run under `effectWithLegacyRandom`.
- **Tick, frame and producer entry points never throw.** These are
  `updateEffects`, `fxEvent`, `fxEmit`, `fxAttach`, `fxDetach`, the registry's
  prune, rebase, reset, prime and studio calls, and the engine's render passes.
  They catch, count in `effectStats.failures` and warn once. Every effects
  harness asserts zero failures. The load-time compilers,
  `registerEffectFamily` and the console setters (`setEffectToggle`,
  `setEffectFamilyMode`, `effectWeatherForce`, `setEffectPlacementOverride`)
  throw on bad arguments by design. Call the setters from a `try`/`catch`, as
  `handleEffectSettingsClick` does.
- **New effects are recipes.** A new transient array or painter state registers
  with `registerEffectFamily` and is never added to a reset, rebase, studio or
  prune list by hand. A producer adds one `typeof`-guarded `fxEvent` line.
  Readers never keep or write the producer's object.
- **Pinned pools** (the studio, the browser profile, `fxBench` unless it
  measures the governor, and tests) draw at governor 1. The governor thins
  drawing only, never spawning or pool contents.
- **Recipes stay backend-neutral**: world units and material roles only (root
  `AGENTS.md`).
- **Tests follow `TESTING.md`**: a named mechanism, a fixture that reaches it,
  an independent oracle, controls, and a `--flag` mutation that must fail its
  named check. Update the exact PASS count in the wrapper. Performance claims
  need the flushed browser protocol, reported beside the JS-only number.

## 9. S10 cleanup (only after the user's sign-off)

Start S10 only after the user signs off each family on the visible-foreground
measurements and the art review, and after Q12 is decided. Check spell slices 2
and 3 first, because they touch the same hook lines.

1. **Legacy ambient and torch glow.** Delete the legacy block in
   `15-render-hud-menu.js`:
   - `AMBIENT_MAX` (`:399`, and its write at `:2816`);
   - `spawnAmbientParticle` (`:401`);
   - `initAmbientParticles` (`:496`) and `updateAmbientParticles` (`:507`);
   - `drawTorchGlow3D` (`:555`) and `drawAmbientParticles3D` (`:597`), to the
     end of that block.

   Then retire the `ambientParticles` family and its hooks
   (`effectAmbientLegacyPrime`, `effectAmbientLegacyStudio`), the legacy
   ambient swap in `20-browser-profile.js`, and the `else` fallbacks in
   `21-frame-loop.js:33-34` and `05-endless-world.js:3422, 3566`. Also delete
   the Legacy branches inside the new files. They are `typeof`-guarded or
   mode-guarded, so they would not fail once the functions above are gone:
   - `updateEffects`, `11-fx-engine.js:167-168` (runs `updateAmbientParticles`);
   - `effectSyncToggles`, `11-fx-engine.js:211-214` (re-initialises the legacy
     array);
   - `effectProfilePrime`, `11-fx-engine.js:2279` (the legacy init);
   - `drawEffectLayer3D`, `14-fx-render.js:121` (calls
     `drawAmbientParticles3D`);
   - `drawTorchGlowStage3D`, `14-fx-render.js:774` (calls `drawTorchGlow3D`).
2. **Legacy bones.** Delete the `deathEffects` global (`01-config-state.js:819`),
   its family, the 2D loop (`16-draw-overview.js:764`), the legacy bone step in
   `tickEffects`, and the studio and debug references (`20-casting-preview.js:26,
   173`; `11-enemies.js:219`).
3. **Legacy fallbacks.** Delete `FX_LEGACY_ADAPTERS` and the family-Legacy
   branch of `fxEvent` that runs them (`11-fx-engine.js:334-338`), the
   `tickEffects` `else` branch (`10-combat.js:774` onward) and the guarded
   ember loops (`14-render-entities.js:2044, 2149`).
4. **Redundant resets.** Delete the clears in `resetEndlessMode` that the
   registry's world clear now duplicates (around `05-endless-world.js:3336-3344`,
   registered families only). Delete the `flameStreamLastTick` and
   `flameStreamStartMs` resets in `22-lifecycle.js:96-97`, and the duplicate
   literal studio keys.
5. **A/B scaffolding.** Delete `EFFECT_FAMILY_MIGRATED`, and `fxUnified` if Q12
   says remove. Retire or rewrite the tests that compare New with Legacy, and
   the Legacy mutation flags, with the reasons recorded.
6. **Gate.** Rebuild the header and run the focused suites and the full gate.
   The header must be at least 18 KB smaller than at S9, and a grep test must
   find no reference to a deleted name. Update the PASS counts and the optional
   lab probes that anchor on deleted lines. Spot-check in a browser.

Cone deletion belongs to spell slice 6 (Q8), not S10.
