# HardwareOne game development workflow

The workflow is ready on the Mac mini's `codex/html-game` branch.
The initial source split reproduces the original firmware header byte for byte;
no gameplay behavior was changed.

## Where to edit

Repository: `~/Documents/Codex/Projects/hardwareone`

- `assets/games/src/`: 24 named JavaScript sections.
- `assets/games/page.html` and `page.css`: markup and styles.
- `assets/games/manifest.json`: explicit JavaScript assembly order.
- `assets/games/README.md`: detailed instructions and source navigation.
- `components/hardwareone/WebPage_Games.h`: generated firmware artifact.

The sections preserve the existing shared JavaScript scope. Encapsulating
subsystems is a later change.

## Normal edit cycle

Run from the repository root:

```sh
python3 tools/game/dev.py build
python3 tools/game/dev.py test --suite smoke
python3 tools/game/dev.py serve --port 8001
```

Open `http://127.0.0.1:8001/`. After editing, run `build` again and refresh.
Stop the server with Ctrl-C. The preview has no physical device backend.

Additional commands:

```sh
python3 tools/game/dev.py check
python3 tools/game/dev.py where 7831
python3 tools/game/dev.py test --suite physics
```

`check` rejects a stale header or invalid JavaScript. `where` converts a header
line into an editable source location. The example currently resolves to
`assets/games/src/06-floor-queries.js:40`.

The core `test` command works without the local audit lab. `--suite` adds a
selected audit suite when installed. Use focused suites during repairs; the
full investigation matrix is reserved for changes requiring that coverage.

## Verification

- 23 workflow tests plus 6 smoke unittests: all 29 pass in 1.161 seconds.
- Core tooling independently passes in a checkout copy without audit files.
- Manual browser check: Endless Mode and 3D rendering work; no errors observed.
- Original, current, and regenerated firmware header bytes match exactly.
- No G2/audio or shared firmware configuration files changed.

Nothing was staged, committed, or pushed. For future commits, include source
edits and their regenerated header together, using explicit paths; keep the
local audit and handoff files excluded as agreed.
