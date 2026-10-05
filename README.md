# CanvasGame

A browser game with shared 2.5D gameplay, top-down and first-person Canvas views,
procedural worlds, combat, companions, and isolated rendering experiments.

The latest release is **0.0** (`VERSION`), the initial standalone snapshot
extracted from HardwareOne on 2026-09-27. This tree also carries the unreleased
work in the [changelog](CHANGELOG.md): 3D prop and structure models with world
textures, spell visuals, a unified effects system, a held-staff casting preview,
a solved water system, and renderer and audit-lab fixes. It is a development
baseline, not a claim that texture LOD or coverage-first texture budgeting is
done.

## Run locally

Requirements: Python 3.10+ and a supported JavaScript engine (Node.js, Deno,
Bun, QuickJS, or the supported macOS JavaScriptCore/JXA host). No npm packages,
firmware toolchain, device, or credentials are required.

```sh
python3 tools/game/dev.py build
python3 tools/game/dev.py serve --port 8003
```

Open <http://127.0.0.1:8003/> for the game. The server binds only to loopback.
Choose keyboard/mouse input when no hardware is connected.

Developer routes on the same server (`/game.html` serves the same game as `/`):

- `/artwork.html`: isolated first-person artwork.
- `/textures.html`: material, filtering, and motion-quality study.
- `/structures.html`: fortress, arena, and watchtower texture study.
- `/physics-profile.html`: opt-in simulation and rendering benchmark.
- `/render-lab.html`: render-feature lab with seeded scenes, Recommended/Legacy
  A/B/B/A timing, pixel captures, and a G-press run. Open it in a fresh tab.
- `/fx-bench.js`: effects benchmark script, loaded from the console of a
  separate game tab on the same server. It is not a page and never ships in the
  game.

Structure and prop textures are part of the main game. `structureTextures` and
`propTextures` are render features that the **Recommended** preset turns on; the
**Legacy** preset, the pre-integration reference, turns them off, as it does the
3D models and the unified effects. G switches between the two presets, the
Graphics row sets single switches, and the page's textures button stays the
master switch. The study pages remain separate experiments with their own
controls. Procedural bitmap tiles are generated in the page from the recipes
in `assets/games/src/12-texture-mapping.js`; no external image downloads are
needed.

## Verify

```sh
python3 tools/game/dev.py check
python3 tools/game/dev.py test
python3 -m unittest discover -s tools/webui/tests -t . -p 'test_game*.py'
```

The core gate (`dev.py test`) runs 367 tests. The last command runs the
extended game lab. It includes documented known-defect expectations and opt-in
mutation/browser checks; skips are not passing coverage. At the 0.0 snapshot the
core gate had 160 tests and the extended audit had eight failing assertions, and
no expectations were weakened for that release; see its
[validation details](docs/releases/VALIDATION-0.0.md). The audit-lab refresh in
the changelog has changed those lab results since, so rerun the lab rather than
relying on the 0.0 count. Use focused mutation runs when changing a subsystem,
for example:

```sh
python3 tools/game/dev.py test --suite physics --probes
```

Native pixel and performance checks are available in the developer pages. A
headless test pass is not evidence of native rendering quality or frame rate.
The audit lab's stub canvas returns empty pixels, so it cannot build the texture
catalog and its headless runs always draw the untextured models.

## Layout and guidance

- `assets/games/`: editable source, including the texture mapper and its
  procedural texture recipes, and the ordered assembly manifest.
- `components/hardwareone/WebPage_Games.h`: generated compatibility artifact.
  Its legacy path is retained so existing assembly and regression tools continue
  to work; the rest of the HardwareOne firmware is not part of this repository.
- `tools/game/`: build/server tooling, developer pages (previews, render lab),
  the effects benchmark script, texture-study helpers, and regressions.
- `tools/webui/`: game audit lab and its shared JavaScript execution helpers.
- `docs/`: physics/visual plans, historical investigations, work handoffs, and
  release notes.

Read [game development](assets/games/README.md),
[testing principles](assets/games/TESTING.md),
[shared spatial system](assets/games/SPATIAL.md),
[NPC AI](assets/games/AI.md), and [texture study](tools/game/TEXTURES.md).

## Current limitations

See [0.0 release notes](docs/releases/0.0.md) for the snapshot's limitations.
Texture work is capped per frame (2,048 primitives by default in the game). The
game textures structure faces nearest first, then each prop family near to far,
and paints a face that no longer fits with its material's flat mean color; the
structure study also spends its budget nearest first but leaves a face that does
not fit in its solid authored color. Texture LOD and coverage-first texture
allocation have been discussed but are not implemented. The held staff rig is a
casting-studio preview; normal play still draws the original arms. Historical
benchmark numbers are workload/device-specific, not FPS promises.

## License

The existing [PolyForm Noncommercial License 1.0.0](LICENSE.md) and copyright
notices are preserved. This extraction does not change the license.
