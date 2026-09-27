# Game audit lab

This directory contains the extended CanvasGame audit lab plus the portable
JavaScript host and embedded-source extractor needed by the core tooling.
The historical directory name is retained for import compatibility. Unrelated
HardwareOne web-interface harnesses are not included.

Read `assets/games/TESTING.md` before changing tests. Fixtures must exercise real
failure risks, prove their setup, use independent expectations, and detect
plausible mutations. Known-defect baselines are not declarations of correctness.

From the repository root:

```sh
python3 -m unittest discover -s tools/webui/tests -t . -p 'test_game*.py'
python3 -m unittest tools.webui.tests.test_js_engine
python3 tools/game/dev.py test --suite physics --probes
python3 -m tools.webui.game_lab physics -v
python3 -m tools.webui.game_page --out /tmp/canvasgame-browser-check
```

The lab supports smoke, browser, cave milestone/geometry/transition, physics,
rendering, enemies, persistence, loot, performance, and tools suites. The
per-suite Python modules document known defects, prerequisites, and controls.
Native browser-result import and most mutation sweeps are opt-in. Skipped
checks are unverified; a recording Canvas cannot certify native pixels or FPS.

`game_probe_matrix.py` and historical audit scripts support broader
investigations. Do not run the full matrix for every small edit. Historical
evidence under `docs/game_audit_handoff/` is sanitized and deliberately retains
failures and earlier scope limitations.

See `docs/game_lab_guide.md` for detailed seed, provenance, matrix, and native
browser workflows. `docs/releases/VALIDATION-0.0.md` records the eight failing
extended-audit assertions in this snapshot; this is not an all-green lab release.
