# Extended game-lab guide

Preserved game-specific workflow from the original tooling README. Refer to the
release validation notes for what was actually run for 0.0; the procedures below
are not a claim that every historical mutation or browser gate currently passes.

## Endless crawler game lab

Read `assets/games/TESTING.md` before extending the lab. Its contract requires
realistic risks, proven setup, independent expectations and causal controls.
The planned shared-physics architecture and benchmark gates are in
`docs/game_physics_plan.md`; that document does not describe implemented physics.

The September 2026 repair updates the default headless baseline and current
render mutations. Older opt-in mutation collections are not all refreshed:
an anchor inventory still finds stale entries in browser, cave geometry/cave
transition, loot, performance and diagnostic-tools probes. They fail loudly;
do not call the entire historical mutation matrix validated. Browser pixel
grading also needs a fresh browser baseline, independent of the headless gate.

`game_lab.py` extracts the shipping JavaScript from
`components/hardwareone/WebPage_Games.h`, preserves its header line numbers,
and runs focused harnesses against the real game functions. The lab covers cave
geometry and transitions, physics, rendering, enemies, loot, persistence,
performance, diagnostics, and a browser-facing visual driver. Its checks state
the behavior the game should have, so a reported `FAIL` may be a documented
product defect rather than a broken test.

Run one suite at a time from the repository root:

```sh
HW1_GAME_JOBS=1 python3 -m tools.webui.game_lab render -v
HW1_GAME_JOBS=1 python3 -m unittest tools.webui.tests.test_game_render -v
```

The unittest layer validates that every current failure is named in that
suite's `KNOWN_BUGS`, still fails for its documented mechanism, and has not
silently disappeared or changed identity. Mutation probes are deliberately
opt-in because each probe runs another complete copy of the suite:

```sh
HW1_GAME_JOBS=1 HW1_GAME_PROBES=1 \
  python3 -m unittest tools.webui.tests.test_game_render -v
```

A target reporting `PRECONDITION` or a scenario crash is rejected as mutation
evidence even when a probe expects `FAIL`. Missing subjects are not successful
detection of the intended gameplay defect.

The common seed arguments have one meaning everywhere: `--seeds` supplies Cave
Test worlds and `--endless-seeds` supplies normal Endless worlds. A readable
seed sweep and a machine-readable result use the same runner:

```sh
HW1_GAME_JOBS=1 python3 -m tools.webui.game_lab render \
  --seeds 12345,1,777,424242 --endless-seeds 424242,777000 \
  --json /tmp/render.json
```

Before calling a suite complete, run its base and opt-in probe unittests
serially; run the prescribed seed sweep; compare two fresh, uncached `jsc`
runs for identical check ids, statuses, details, and non-`*_ms` metrics; and
require identical check ids and PASS/FAIL status on JXA. The two `jsc` runs
must each stay under the 60-second suite budget. Record JXA's runtime, but do
not apply that budget to the slower compatibility engine.

Candidate fixes are temporary string mutations of an extracted copy; they
never modify the header. After every suite file and shared helper has stopped
changing, rerun each suite's FIX probes against every other non-smoke suite.
This frozen-tree run is the final matrix; earlier matrices are supporting
evidence only.

```sh
HW1_GAME_JOBS=1 python3 -m tools.webui.game_probe_matrix \
  --probes render --kind fix \
  --against caves_geometry caves_transition physics enemies persistence loot \
  perf tools browser --json /tmp/render-matrix.json
```

The JSON path above is convenient scratch output. Summarize the command,
runtime, and every collateral flip in durable handoff/final-report evidence.
The matrix command intentionally exits 1 when it finds collateral PASS-to-FAIL
regressions even after writing a complete JSON report; inspect the report and
final runtime line rather than treating that exit status alone as a broken run.
The `browser` matrix target is only the headless browser harness;
`game_probe_matrix` does not execute `BROWSER_PROBES` or validate canvas
pixels. Those are separate real-browser gates below.

A matrix is probes × suites, and each cell builds a world in a separate
JavaScript process. Whole-suite prefetch is disabled unless
`HW1_GAME_PREFETCH=1`; keep `HW1_GAME_JOBS=1` and run one matrix at a time on a
shared or memory-constrained machine.

The browser half starts with a generated page:

```sh
python3 -m tools.webui.game_page --out /tmp/gamepage --autorun
python3 -m http.server 8000 --bind 127.0.0.1 --directory /tmp/gamepage
```

Open `http://127.0.0.1:8000/game_visual.html` in a real browser, save its result
text, then stop the server with Ctrl-C. A gradable default result must come from
the unmutated page-start path with seeds `12345,424242` and all seven views;
partial `seeds`/`views`, injected-start, and mutation-probe results are rejected
by provenance rather than mistaken for a full run. Grade only the saved text,
without rerunning the headless harness, using:

```sh
HW1_GAME_BROWSER_RESULTS=/path/to/results.txt \
  python3 -m unittest \
  tools.webui.tests.test_game_browser.BrowserResultsGrading -v
```

That command grades only the unmutated default page. The mutation pages in
`test_game_browser.py::BROWSER_PROBES` are a separate manual gate: build each
page from its listed in-memory mutations, run the seed/view prescription in
`BROWSER_PROBE_RUNS` (the helpers `browser_probe_page_kwargs()` and
`browser_probe_query()` expose the exact inputs), and verify that every targeted
check matches its declared PASS/FAIL status. Some declarations are non-flip
controls. Headless probes and the cross-suite matrix do not satisfy this pixel
gate. If it is not run, say so explicitly in the final report.

The audit methodology, current documented findings, probe collateral, and
browser reproduction recipes live in `docs/game_audit_handoff/HANDOFF.md`.
