# Extended game-lab guide

Preserved game-specific workflow from the original tooling README. Refer to the
release validation notes for what was actually run for 0.0; the procedures below
are not a claim that every historical mutation or browser gate currently passes.

## Endless crawler game lab

Read `assets/games/TESTING.md` before extending the lab. Its contract requires
realistic risks, proven setup, independent expectations and causal controls.
The planned shared-physics architecture and benchmark gates are in
`docs/game_physics_plan.md`; that document does not describe implemented physics.

The September 2026 repair updated the default headless baseline and current
render mutations. In October 2026 the opt-in mutation collections were
refreshed against the merged tree in two passes: render, loot, browser,
performance, persistence and physics first, then cave geometry, cave
milestone, cave transition, enemies and the diagnostic tools (and physics
again, for its D15 wallFaceBase fixture). Each suite passed its base and
probe unittests on jsc when its pass landed, with known bugs failing for
their documented reasons. A FIX probe whose repair had already shipped
passes whether or not it is applied, so those became BREAK probes that put
the defect back. The frozen-tree FIX matrix below was run after the second
pass only for the FIX probes whose mutation it added or changed; a
re-targeted probe with an unchanged mutation (cave geometry's FIX D16) was
not re-matrixed until the third pass. Do not call the entire historical
mutation matrix validated. Browser pixel grading also needs a fresh browser
baseline, independent of the headless gate.

A third October pass answered a review of the second. The enemies
return-to-patrol budget now covers the walk to the waypoint the game is
steering to (with the F1 waypoint fix the spawn is waypoint 0, and the old
nearest-waypoint budget failed correctly patrolling enemies), its unchased
control must walk to a waypoint at least two arrival radii from the spawn,
and a probe applying every patrol fix passes it. The budget is per enemy,
not the old fixed 20 s: it is looser for slow or wading enemies and tighter
for fast ones, and the check's detail lists every return later than 20 s.
Vacuous FIX probes in the diagnostic tools (control map) and enemies (D19)
became BREAK probes; cave transition gained BREAK probes for its lateral,
mouth-rock and headroom checks and declares every retired check on a probe
that fails it; and every cave milestone check is now declared by a probe
aimed at it. Probe expectations may pin a detail regex (below), which the
partial-fix witnesses and BREAK-on-top-of-FIX probes use. The enemies,
diagnostic tools, cave transition, cave milestone, physics and cave geometry
suites passed their base and probe unittests on jsc at the end of this pass.
The cross-suite matrix was run only for cave geometry's FIX D16 and the new
enemies all-patrol-fixes probe, each against every non-smoke suite; D16's two
collateral PASS->FAIL flips are precondition voids and are recorded beside
that probe. The full frozen-tree FIX matrix was not rerun.

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
detection of the intended gameplay defect. A probe whose purpose is to void a
check -- a GUARD that removes its subjects, or a BREAK aimed at a precondition
gate -- declares `PRECONDITION` instead of `FAIL`: the check must then fail
with the `PRECONDITION` marker in its detail, and a marker-free failure or a
pass does not satisfy it.

An expectation may also be a `(verdict, r"detail regex")` pair: the verdict
must match and the regex must be found in the check's detail. Use it when the
declared verdict equals the baseline verdict -- a partial fix that still
fails, or a BREAK applied on top of a FIX -- because the verdict alone cannot
show that the probe changed anything; the regex states the witness (for
example, which enemies stay stuck).

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
