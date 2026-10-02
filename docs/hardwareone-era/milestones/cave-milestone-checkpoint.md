# HardwareOne — first playable cave checkpoint

2026-09-20 · branch `codex/html-game`

The first cave prototype is implemented. This is the cave foundation, not the
entire world/outpost/save roadmap.

## Working now

- Seeded, connected small caves: descending entrances and naturally supported
  hillside entrances, a winding passage, a chamber, and walking back outside.
- Shared entrance geometry for terrain, collision, ceiling, roof, and lighting.
- Correct floor support, real drops, jump/ceiling handling, and restart height.
- Gradual cave lighting with a readable minimum; exterior daylight stays intact.
- Sealed entrance rock edges and separate floor/roof rendering.
- Reliable chamber chest/enemy placement even at chunk boundaries.
- Cave Test entrance selection and repeatable viewpoint buttons.

## Verification

27 core tests pass, including 102 focused cave assertions. The same tests pass
without the local handoff/audit files. Smoke plus core: 33 tests pass.

The full-runtime cave route passes **60/60 checks** across a descending cave and
two naturally supported hillside caves. Browser review also caught and corrected
terrain spikes and gaps around the mouth.

The broader targeted suites still expose four existing failures: water/wall
placement, repeated rebuilding at chunk borders, death regeneration, and enemy
attack reach. This is not an all-engine clean bill of health. Broader historical
audit fixtures also need adaptation to the smaller cave recipe. Physical-device
and ESP32 performance have not been tested.

## Still to do

1. Your visual review: entrance proportions, rock shapes, lighting, and cave
   frequency. Steep banks remain visibly faceted; hillside fits are currently
   very rare in ordinary generation.
2. Actor/loot/line-of-sight consistency and the remaining combat/rendering bugs.
3. Same-browser automatic save/resume and permanent clearing of enemies/loot.
   Saving has **not** been implemented yet.
4. Larger/multiple-exit caves, rising interior layouts, landmarks, and small
   protected outposts. The current interior is one constant-height route.

## Try the prototype

From `~/Documents/Codex/Projects/hardwareone`:

```sh
python3 tools/game/dev.py build
python3 tools/game/dev.py serve --port 8001
```

Open http://127.0.0.1:8001/, choose **Cave Test**, then **Descending** or
**Hillside**. Use the viewpoint buttons to compare and Keyboard + Mouse to walk.
This preview has no hardware backend. It does not save progress yet.

No G2/audio/shared firmware configuration was changed. Nothing was staged,
committed, or pushed. Handoff and optional lab material remain outside any commit.
