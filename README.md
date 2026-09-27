# CanvasGame 0.0

A browser game with shared 2.5D gameplay, top-down and first-person Canvas views,
procedural worlds, combat, companions, and isolated rendering experiments.

Version **0.0** is the initial standalone snapshot extracted from HardwareOne.
It includes the current game, procedural textures, developer previews, docs,
tests, and sanitized historical audit evidence. It is a development baseline,
not a claim that the experimental texture renderer or planned LOD work is done.

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

Developer routes on the same server:

- `/artwork.html`: isolated first-person artwork.
- `/textures.html`: material, filtering, and motion-quality study.
- `/structures.html`: fortress, arena, and watchtower texture study.
- `/physics-profile.html`: opt-in simulation and rendering benchmark.

The study pages are separate experiments; their textures are not automatically
enabled in the main game. Procedural bitmap tiles are generated from the included
recipes; no external image downloads are needed.

## Verify

```sh
python3 tools/game/dev.py check
python3 tools/game/dev.py test
python3 -m unittest discover -s tools/webui/tests -t . -p 'test_game*.py'
```

The last command runs the extended game lab. It includes documented known-defect
expectations and opt-in mutation/browser checks; skips are not passing coverage.
The 0.0 snapshot has eight failing extended-audit assertions; the core 160-test
gate passes. See [validation details](docs/releases/VALIDATION-0.0.md) before
interpreting the extended result. No expectations were weakened for this release.
Use focused mutation runs when changing a subsystem, for example:

```sh
python3 tools/game/dev.py test --suite physics --probes
```

Native pixel and performance checks are available in the developer pages. A
headless test pass is not evidence of native rendering quality or frame rate.

## Layout and guidance

- `assets/games/`: editable source and ordered assembly manifest.
- `components/hardwareone/WebPage_Games.h`: generated compatibility artifact.
  Its legacy path is retained so existing assembly and regression tools continue
  to work; the rest of the HardwareOne firmware is not part of this repository.
- `tools/game/`: build/server tooling, previews, texture recipes, and regressions.
- `tools/webui/`: game audit lab and its shared JavaScript execution helpers.
- `docs/`: physics/visual plans, historical investigations, and release notes.

Read [game development](assets/games/README.md),
[testing principles](assets/games/TESTING.md),
[shared spatial system](assets/games/SPATIAL.md),
[NPC AI](assets/games/AI.md), and [texture study](tools/game/TEXTURES.md).

## Current limitations

See [0.0 release notes](docs/releases/0.0.md). In particular, close-up structure
views can exhaust the texture-work budget and fall back to solid colors. LOD
and coverage-first texture allocation have been discussed but are not implemented.
Historical benchmark numbers are workload/device-specific, not FPS promises.

## License

The existing [PolyForm Noncommercial License 1.0.0](LICENSE.md) and copyright
notices are preserved. This extraction does not change the license.
