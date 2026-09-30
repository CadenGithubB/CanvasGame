# Spell visual archetypes: handoff (2026-09-27)

Status: slice 1 of 6 is implemented, tested and partly reviewed in a browser.
It is committed as `cdbdf0f` on the local branch `codex/spell-visuals`
(created from `main` at `c6851a4`) and merged with the other work branches on
`codex/merge-all`. Nothing has been pushed or tagged. Publishing requires the
user's explicit authorization (root `AGENTS.md`).

Read first: root `AGENTS.md`, `assets/games/AGENTS.md`, `assets/games/TESTING.md`,
`tools/webui/AGENTS.md`. Then this file, then the source files named below.

## 1. What the user asked for and decided

- The user found the magic visuals poor and wants distinct visual types:
  projectiles, area effects, auras "etc". Decisions confirmed in chat:
  1. **Art direction: "crafted arcane" for every spell**, extending the existing
     Magic Missile art in `assets/games/src/14-missile-art.js`: faceted heads,
     calligraphic hairlines, rune marks, restrained glow from cached sprites,
     per-spell material palettes, no `shadowBlur`.
  2. **Auras = visualize existing statuses AND add a new player-centred aura
     spell** to gameplay (name/colour placeholders: "Radiant Halo", `id:'halo'`,
     warm ivory-gold; toggled on cast, persists across spell switching, auto-off
     at mana exhaustion; user may rename or change to a held channel).
- Earlier in the session the user asked whether the 3D object/model studies
  (hand rig, structure/texture study) should be used for magic. Answer given and
  accepted: no. Magic stays billboards, world-velocity ribbons and
  terrain-conforming polygons through the existing scene-depth helpers.
- The user approved the six-slice plan in section 7 (plan mode approval).

## 2. What exists now (slice 1)

### Shipping source (all in `assets/games/src/`, manifest updated)
- `14-spell-visuals.js` (new, inserted in `manifest.json` after
  `14-missile-art.js`, before `14-render-entities.js`):
  - `SPELL_VISUALS_ENABLED = true` review kill switch (studio A/B only; delete
    in the cleanup slice together with legacy bodies).
  - `SPELL_VISUAL_RECIPE_SOURCE` → `compileSpellVisualRecipes(source, GAME_MATERIALS)`
    → frozen `SPELL_VISUAL_RECIPES` keyed by spell id (`missile fire ice
    lightning poison arcane tower slime`). Fields: `material`, `bolt {head,
    radiusWorld, wakeSeconds, wakeUnits, runes}`, `burst {style, sizeWorld}`.
    Invalid recipes throw at load. `spellVisualRecipe(spell)` returns the table
    entry or a cached generic five-role palette derived from `spell.color`.
  - Glow sprites: `spellGlowSprite`, `drawSpellGlow(x, y, radiusPx, recipe,
    role, alpha)` (draw only inside a caller's depth clip; `lighter` compositing;
    flat-disc fallback without `document`), LRU with byte/entry limits
    (`SPELL_GLOW_BYTE_LIMIT`, `SPELL_GLOW_ENTRY_LIMIT`, `SPELL_GLOW_BUILDS_PER_FRAME`),
    `beginSpellVisualFrame()` (called once per 3D frame from `21-frame-loop.js`),
    `getSpellVisualStats()`, `clearSpellVisualCache()`.
  - `renderSpellBolt(p, C, now)`: missile delegates to `renderMissileProjectileArt`;
    other ids use shared wake ribbons (`drawSpellWorldSegment`) plus head painters
    in `SPELL_BOLT_PAINTERS` (`spindle shard spark spore bead blob`) inside
    `drawSpellBillboard`. Returns `true` when handled (even if culled), `false`
    when no bolt recipe (caller uses legacy body).
  - `renderSpellBurst(im, C, now)`: missile delegates to `renderMissileImpactArt`;
    records with `spellId` use `SPELL_BURST_PAINTERS` (`starFracture shatterRing
    sparkFan sporeRing emberPuff runeFlash`). `spellImpactProgress(im, now)`
    normalizes `{spawnMs,lifeMs}`, `{t,dur}`, `{life,maxLife}`. Records with
    `type` (steam/shatter/frostnova) or `isCompanionProj` return `false`
    (legacy) until slice 2.
  - `spellVisualGalleryScenes()`: one `bolt:<id>` scene per recipe with a bolt,
    `burst:<id>` for the rest.
  - Contracts kept everywhere: presentation only, no gameplay writes, no
    `Math.random`, `presentationRandom`/deterministic noise only, `ctx.save`/
    `try/finally/restore`, never writes opaque scene depth, never sets
    `shadowBlur > 0`.
- `01-materials.js`: added `fireMagic frostMagic stormMagic venomMagic arcaneMagic
  towerMagic slimeMagic haloMagic`, five roles each (`core light mid deep rune`).
- `14-render-entities.js`: `drawProjectiles3D` and `drawImpacts3D` dispatch to
  the layer when `SPELL_VISUALS_ENABLED`; legacy per-id bodies remain after the
  dispatch (still gated on `CASTING_ART_ENABLED` for the old missile path).
- `21-frame-loop.js`: `beginSpellVisualFrame()` call; **frame order changed**:
  `proj3D` and `impacts3D` now run after `enemies3D` (bolts in flight sit between
  camera and target; bursts land on the target; both were being covered by the
  enemy sprite). 2D-view order untouched. Nothing in tools/docs referenced the order.
- `20-casting-preview.js`: third study mode `'gallery'`:
  `SPELL_GALLERY_CYCLE_MS = 2400`, `_castingStudioScene`, `setCastingStudioScene`,
  `castingStudioGalleryScene`, `castingStudioGallerySpell`,
  `castingStudioGallerySeed(job)` (records are pure functions of `job.time`;
  player bolts fly launch-offset → skeleton, NPC bolts skeleton → past the
  player's right shoulder; burst 300 ms after arrival; poison is a lob arc with
  `targetX/Y/Z` so the reticle draws), `castingStudioFindTarget(pose, camera,
  nearest)` (gallery uses the nearest valid lane, ≥96 units; casting study keeps
  the farthest), HUD shows the scene's spell via scoped `live.spells`/`currentSpellIdx`,
  Original/Redesigned toggles `live.SPELL_VISUALS_ENABLED`, describe text includes
  phase, skeleton distance and glow stats, recording filename
  `spell-gallery-<archetype>-<spell>-<original|redesigned>-<light>-WxH.webm`,
  profile works in gallery (no hit assertions). `_castingStudioKeys` gained
  `flameStreamLastTick flameStreamStartMs flameStreamAng flameStreamRange
  speedBoostUntil regenBoostUntil armorBoostUntil wardActive SPELL_VISUALS_ENABLED`.
  The dangling `getMagicMissileArtworkStats`/`clearMagicMissileArtworkCache`
  references were repointed to `getSpellVisualStats`/`clearSpellVisualCache`.
- `components/hardwareone/WebPage_Games.h` regenerated (`python3 tools/game/dev.py build`);
  `dev.py check` reports it current.

### Tests (all passing on this machine)
| Suite | File(s) | Count / mutation runs |
|---|---|---|
| New `test_spell_visuals` (registered in `tools/game/dev.py` module list) | `tools/game/tests/spell_visuals.js`, `test_spell_visuals.py` | `SPELL_VISUALS_RESULT PASS 58`; `--glow-no-document` → PASS 55 incl. "glow falls back to flat discs without a document"; `--bypass-spell-depth` must fail "ice bolt cannot paint through opaque terrain"; `--drop-recipe ice` must fail "every projectile or lob spell, tower and companion bolt has bolt and burst recipes"; `--burst-ignores-lifetime` must fail "ice burst ends at its lifetime and stays deterministic" |
| `test_spell_visibility` | `spell_visibility.js` (stub gained `drawImage fillRect createRadialGradient quadraticCurveTo bezierCurveTo globalCompositeOperation`; loads `01-materials`, `14-missile-art`, `14-spell-visuals`; new cases: slime bolt, eight bursts, kill-switch legacy parity) | 88 → **132**; `--bypass-spell-depth` first failure still "fire projectile cannot paint through opaque terrain" |
| `test_casting_studio` | `casting_studio.js` (gallery block before the hand-mode block) | 74 → **82** |
| `test_material_palette` | `material_palette.js` (+1 role check) | 34 → **35** |
| `test_casting_presentation` | unchanged (missile art untouched) | 76 / 22 |

Full gate: `python3 tools/game/dev.py test` passed **165 tests** on the branch
(run before the last two small studio edits: skeleton-distance text and nearest
lane; `test_casting_studio` was re-run green afterwards). Re-run the full gate
before any commit.

### Test-harness repair (important, affects every suite)
On this machine the only JS engine is Deno 2.7, which runs harness files as ES
modules. `tools/webui/harness/_bootstrap.js` defined `__engine/__argv/__out/slurp`
with module-scoped `var`, so game code evaluated through indirect eval could not
see them, and `__out` looked up `console.log` lazily so a harness that replaces
the global console (the presentation test does) printed nothing. Result on
pristine `main`: 90 of 160 tests failing. Fix in `_bootstrap.js`: bind the real
`console.log` at bootstrap and publish the four names on `globalThis`. With only
that patch, pristine `main` passes all 160. Keep this change in the first commit.

## 3. Browser review procedure and findings

Never refresh the user's positioned game; use a separate tab/port. Port 8003 was
already occupied by another process on this machine; a `.claude/launch.json`
(gitignored) starts `python3 tools/game/dev.py serve --port 8017`.

Steps: open `http://127.0.0.1:8017/` → Terrain select "Cave Test" → click
"Mouth" → open "Casting studio" → Study mode "Spell gallery" → Gallery scene →
drag "Pose time" (range `#castingStudioTime`) → status line shows phase
(`flight`/`burst`/`pause`), skeleton distance and glow stats. The canvas is
360×240; in an automated browser a ~430 px wide viewport makes it fill the frame.

Timing at the 96-unit lane (flight ms = distance/speed): missile 360 → ~260,
ice 380 → ~245, lightning 450 → ~207, poison 200 → ~465 (lob arc), tower 320 and
slime 280 fly ~86 units from the skeleton (≈270 / ≈307 ms). Burst frames are
flight + ~60 ms.

Seen and judged good: Magic Missile flight + burst, Frost Bolt flight + burst,
Frost Bolt Original comparison (old cyan spoked circle). Not yet captured:
Chain Lightning, Poison, Tower, Companion, Flame Jet and Arcane bursts, dusk,
profile timings. Record measured p50/p95 for `proj3D`/`impacts3D` from
"Profile studio preview" and add a README section "Spell visual archetypes V1
(date)" (pattern: existing V1 sections in `assets/games/README.md`). Raw
screenshots stay out of the repo.

## 4. Known issues and follow-ups noted during slice 1
- Bolt impact height in the gallery is `target.z + 28` (pelvis); raise to about
  36 so bursts land on the torso (`castingStudioGallerySeed`, `z1`).
- Particle-style impact records from `09-physics.js:411`, `03-level-generation.js:1583`,
  `17-input-lighting-update.js:624` (`life/maxLife`) and `18-arena-fortress.js:338`
  (`t/dur`) are pruned by `tickEffects` (`10-combat.js`) the same tick they are
  pushed and never render. Slice 2 converts those producers to `{spawnMs,lifeMs,...}`
  and renders them as bursts (position = origin + velocity·age, computed, never stored).
- `isCompanionProj` is never set in shipping code; companion bolts are `spell.id==='slime'`.
- `drawChainEffects3D`/`drawNovaEffects3D` prune their arrays inside the renderer;
  keep identical pruning in both A/B paths (slice 3).
- `assembleWindow` rebases `projectiles/impacts/groundEffects` only; lob
  `targetX/Y` are not rebased (pre-existing reticle drift, out of scope).
- The optional lab probes `tools/webui/tests/test_game_loot.py:197-198` and
  `test_game_persistence.py:355-363` anchor on the literal
  `var spellOrder = ['missile','fire','ice','lightning','poison','arcane'];`.
  Adding `'halo'` (slice 5) must update those anchors.
- Two other assistant sessions were active on this repository (3D object
  rendering exploration; LOD/rendering-budget architecture). Before each slice,
  check `git status`/`git log` for concurrent edits to `14-render-entities.js`,
  `10-combat.js`, `21-frame-loop.js` and the manifest; rebase, never overwrite.

## 5. Contracts every later slice must keep
- Archetype renderers are presentation-only; `presentationRandom()` or
  `spellVisualNoise()` only; no `shadowBlur`; balanced Canvas state; draw only
  inside `drawSpellBillboard` / `drawSpellWorldSegment` / `withSceneDepthClip`
  / ground helpers so terrain occlusion is per pixel.
- Each production `draw*3D` keeps its name and `_pt` stage slot; dispatch first,
  legacy body after, until the cleanup slice deletes the legacy bodies.
- Every new global must be added to `_castingStudioKeys` or the studio leaks it
  (`casting_studio.js` asserts restoration).
- New tests follow `TESTING.md`: named failure mechanism, fixture that provably
  reaches it, independent oracle, positive and negative control, `--flag`
  mutation run that must fail with the named error; never mutate shipping files.
- After edits: `python3 tools/game/dev.py build`, focused suites, then the full
  gate. Update exact PASS counts in the Python wrappers.

## 6. Where the next work goes (remaining slices)

| # | Slice | Touch points |
|---|---|---|
| 2 | Fields + impact normalization | `renderSpellField/renderSpellNova/renderSpellReticle` in `14-spell-visuals.js` over `drawSpellGroundPolygon`/`drawSpellGroundRing`/`spellGroundTriangles`; dispatch in `drawGroundEffects3D`, `drawNovaEffects3D`, `drawSpellLandingReticle`; synergy bursts (`type` steam/shatter/frostnova) and particle records; producer shape fixes listed above; gallery scenes for fire/ice/poison fields, nova, reticle; `spell_visibility.js` cases (sloped-terrain oracle exists at its line ~103) |
| 3 | Beams + arcs | flame stream (`drawFlameStream3D` keeps projected quads + `withSceneDepthClip`), ice cone (`drawConeEffects3D`), chain lightning (`drawChainEffects3D` via `drawSpellWorldSegment`, halo+core in one callback); keep in-renderer pruning parity |
| 4 | Status auras | enemy: `drawEnemies3D` anchor (`screenX`, `floorY`, `spriteTop`, `size`, `effectCY`, `_eFade`) inside its `withSceneDepthBillboard`; extend `getEnemyBillboardBounds` with the aura extents (mask computed once per enemy and reused for bounds and paint); statuses `slowUntil burnUntil stunUntil` + poison-cloud radius test against `groundEffects`; player: first-person hand-side shimmer + edge rune band from `dmgBoostUntil speedBoostUntil regenBoostUntil armorBoostUntil wardActive` and relic `frostAura`, never crossing the crosshair band; new stage after `fpsArms` or inside `drawFPSArms` |
| 5 | Radiant Halo spell | `spells.halo` + `spellOrder` in `01-config-state.js`; globals `haloActive haloStartMs haloLastTick` reset beside `flameStreamActive` (`05-endless-world.js`, `22-lifecycle.js`, `23-events-init.js`, studio keys/reset); toggle in `castCurrentSpell` (`attackType==='aura'`), `_tryCastSpell` ignores it; `updateHaloAura(now)` next to `updateGroundEffects` in `17-input-lighting-update.js` (drain `manaCost × robes reduction` per `auraTickMs`, slow + light damage in radius using the `updateGroundEffects` conventions); shop `spell_halo` (30) + `upg_halo` (40) in `04-shop.js` and `upgradeSpellToTier2` in `18-arena-fortress.js`; HUD buff strip in `15-render-hud-menu.js` (~line 2326); field recipe `haloRing` on the player; new `aura_spell.js` suite (toggle, drain, inside/outside/other-stratum, auto-off, held fire no re-toggle, reset; mutations `--aura-ignore-radius`, `--aura-free-mana`); lab anchor updates |
| 6 | Cleanup + docs | delete `*Legacy` bodies and `SPELL_VISUALS_ENABLED`, drop `CASTING_ART_ENABLED` coupling for missile art (optionally fold `14-missile-art.js` into recipes keeping `renderMissileProjectileArt/ImpactArt` wrappers and their `casting_presentation.js` contracts), README section, one-line note in `assets/games/AGENTS.md`, recount PASS totals, final gate |

Default balance numbers for the halo (tunable by the user): `damage 0.3,
manaCost 5 per 250 ms tick, auraRadius 70, auraSlowMs 450; tier 2: radius 100,
damage ×1.6, slow 700 ms`.

## 7. Original approved plan summary
Six slices as in section 6, one review and commit per slice on the user's
say-so, browser evidence per slice through the gallery, legacy spell drawing
removed only after browser sign-off. Mesh/texture studies stay out of magic.
