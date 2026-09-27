# Prompt: take over the Endless-crawler audit + test lab (paste everything below the line)

---

You are taking over an in-progress engineering job in the `hardwareone-idf` repository (ESP-IDF
firmware for an ESP32 device that also serves a web UI). The job concerns a browser game embedded
in the firmware: `components/hardwareone/WebPage_Games.h`. The game is one ~1 MB JavaScript raw
string (header lines 215-22515), an endless procedural 3D dungeon/overworld crawler rendered with
Canvas 2D, with surface caves as the main feature. A previous agent audited it and built a
headless test lab for it. Its work was interrupted partway through the lab's final revision pass.
Your job is to finish that revision pass safely and report back. Do NOT start fixing the game
itself unless the user explicitly tells you to.

## 0. Read these first, in order
1. `docs/game_audit_handoff/HANDOFF.md`. This is the complete record: findings with line references,
   the methodology, the lab design, the current half-finished state, and the resource-usage lessons.
   Sections 0, 4.6 and 6 are mandatory before you run anything.
2. `tools/webui/README.md` (the repo's existing web-UI test conventions), then
   `tools/webui/harness/_game_env.js` and `tools/webui/game_lab.py` in full.
3. For each suite you work on: its harness `tools/webui/harness/game_<suite>_harness.js`, its test
   `tools/webui/tests/test_game_<suite>.py`, its adversarial review in
   `docs/game_audit_handoff/evidence/lab_runs/phase2_reviews_and_critic.json` (`reviews["<suite>"]`
   and every `critic` item naming the suite), and the interrupted reviser's digest
   `docs/game_audit_handoff/evidence/interrupted_revisers/progress_<suite>.md` (if it exists).
4. The finding ids (U1-U6, D1-D25, E1-E8, F1-F7, G1-G8, H1-H8, I1-I7, N1-N17) are listed in
   `docs/game_audit_handoff/evidence/audit_index.md`.

## 1. Hard rules
- Do NOT modify `components/hardwareone/WebPage_Games.h` or `WebPage_Games.cpp`. Do not read or touch
  `components/hardwareone/WebPage_DarkRoom.h`. Game changes are allowed ONLY as in-memory mutation
  probes (`tools.webui.game_lab.apply_probe` + `run_harness(..., js_text=...)`), never on disk.
- Do not commit, push, stash, reset or rebase. Never `git add -A` (this repo keeps untracked docs and
  capture data on purpose). The lab files are untracked; leave them untracked unless the user says otherwise.
- Only edit files under `tools/webui/` (the game-lab files listed in HANDOFF.md 0.2) and
  `docs/game_audit_handoff/`. Do not change other tracked files. In particular, `tools/webui/extract_js.py`,
  `js_engine.py` and `harness/_bootstrap.js` are shared with other test suites.
- Evidence standard: every claim you report must come from a command you ran (quote the key output
  line) or an exact code quote with line numbers. Mark anything else SUSPECTED. Do not report a check
  as PASS/FAIL unless you saw it in this machine's output.
- If you hit something ambiguous that is genuinely the user's decision (e.g. whether a behaviour is
  intended), stop and ask rather than guessing.

## 2. Resource rules (the previous run overloaded a 10-core laptop to load ~52, so these are not optional)
- In every shell that runs the lab: `export HW1_GAME_JOBS=1` (2 at most).
- Run ONE suite at a time. Never run several lab processes or agents concurrently.
- Your FIRST code change: in `tools/webui/game_lab.py`, make `prefetch_default_suites()` opt-in (only
  when `HW1_GAME_PREFETCH=1`), and lower the default of `_jobs()` to `max(1, (os.cpu_count() or 4) // 4)`.
  Prove the change is verdict-neutral: before and after, run
  `python3 docs/game_audit_handoff/evidence/audit_scripts/snap_verdicts.py <file>.json` and diff the
  check lists. Only suites you are not currently changing should be compared, since the half-revised
  suites may still move.
- `tools/webui/game_probe_matrix.py` must ALWAYS be filtered: `--probes <suite>` and preferably
  `--against <suites>`. Never run it unfiltered.

## 3. Setup on this machine
1. Confirm these untracked files exist (they were copied from the original machine): see the list in
   HANDOFF.md 0.2. If any are missing, stop and tell the user which ones.
2. A JavaScript engine must exist. `python3 -m tools.webui.js_engine` with no args prints usage; the
   game lab uses whichever of node, deno, bun, qjs, macOS jsc or osascript it finds.
   Run `python3 -m tools.webui.game_lab smoke -v`. All 13 smoke checks must PASS before you trust
   anything else.
3. Record which engine you are on. The lab requires identical PASS/FAIL lines across engines; if two
   engines are available, check both (see how `js_engine.run_js(..., engine=(name, path))` is used).

## 4. Task: finish the interrupted revision pass (per suite, one at a time)
Order: physics, caves_geometry, caves_transition, render, enemies, persistence, loot, perf, tools, browser.

For each suite:
1. Run it: `HW1_GAME_JOBS=1 python3 -m tools.webui.game_lab <suite> -v`. Note what fails and why.
   The files are HALF-REVISED; the progress digest tells you what the previous reviser changed,
   verified and was about to do. Verify its claims; do not assume they were finished.
2. Resolve every item the adversarial review raised for the suite. For each check it flagged
   (VACUOUS, WRONG_TARGET, OVERFIT, SCAFFOLD_DISTORTS, REPLICATES_LOGIC, FRAGILE, UNPROVEN):
   - fix it and re-verify empirically, or
   - delete it with a stated reason, or
   - reject the review item with evidence.

   Fix the listed `harness_bugs` after verifying each one. Integrate the reviewer's `new_probes`
   that were observed to flip, re-validating each yourself.
3. Apply the duplicate-ownership map (HANDOFF.md 4.4): remove a check from the non-owner suite when
   both measure the same quantity. If the observable differs, keep it and cite the owner in
   KNOWN_BUGS.
4. Add the missing checks for the suite: the critic's `proposed_checks` and the review's
   `missing_checks`, prioritising the user's problems U1-U6. Each check needs:
   - a non-vacuous precondition;
   - a threshold rationale any correct implementation meets without prescribing one fix;
   - only the game's own functions and data (never re-implement what is being measured);
   - a mutation probe that flips it.
5. Adopt the shared helpers instead of private copies (`LAB.freshPage`, `releasePad`, `frameAt`,
   `countCalls`, `fx`, `cellWorld`, `standingLayer`, `renderErrorMark/Since`, `walkTo({fps})`), and
   the seeds convention: `--seeds` = Cave Test worlds, `--endless-seeds` = normal Endless worlds.
6. KNOWN_BUGS: every entry is `(reason citing finding ids + header lines, r"regex that pins the
   documented FAIL detail")`. The bridge fails a known bug whose detail contains PRECONDITION or
   misses the regex.
7. Done means ALL of these, with the output quoted in your report:
   - `HW1_GAME_JOBS=1 python3 -m unittest tools.webui.tests.test_game_<suite> -v` OK
   - `HW1_GAME_JOBS=1 HW1_GAME_PROBES=1 python3 -m unittest tools.webui.tests.test_game_<suite>` OK
   - the default run is deterministic (run twice, identical PASS/FAIL/METRIC lines except `*_ms`
     metrics) and finishes in under 60 s
   - both engines agree, if two are available
   - `HW1_GAME_JOBS=1 python3 -m tools.webui.game_probe_matrix --probes <suite>` shows no collateral
     PASS->FAIL flip in any other suite. If it does, report the flip rather than "fixing" the
     other suite to hide it.
8. Update HANDOFF.md 4.6 (the per-suite state table) as you finish each suite.

The `browser` suite's pixel checks need a real browser. `python3 -m tools.webui.game_page --out <dir>
--autorun` builds the page; serve `<dir>` with `python3 -m http.server` (file:// may be refused), open
it, save the results text, and grade it with
`HW1_GAME_BROWSER_RESULTS=<file> python3 -m unittest tools.webui.tests.test_game_browser`.
If you cannot run a browser, finish the headless half and say clearly that the pixel half was not run.

## 5. After all suites
1. Run all game suites once, serially: `HW1_GAME_JOBS=1 python3 -m unittest discover -s tools/webui/tests -t . -p 'test_game*.py'`,
   and the existing web-UI tests: `python3 -m unittest discover -s tools/webui/tests -t .`. Both OK.
2. Add a concise "Game lab" section to `tools/webui/README.md` in the existing style:
   - what it is, and how to run it (including `HW1_GAME_JOBS`);
   - what KNOWN_BUGS and probes mean;
   - what a green run does NOT mean (HANDOFF.md 4.3 item 12).
3. Report to the user and STOP. Do not start fixing the game. The report covers:
   - per suite: checks, known-bug FAILs, probes, runtime, and what changed and why;
   - review items you rejected (with evidence);
   - anything not done;
   - every cross-suite collateral flip the matrix showed;
   - any NEW game defects you found (with evidence and header lines);
   - whether any finding in HANDOFF.md section 3 turned out to be wrong.

## 6. Context you should know
- Game fixes, when the user asks for them, follow HANDOFF.md section 5. Every candidate fix gets
  tried first as a probe through the cross-suite matrix.
- The game uses a virtual clock and seeded randomness only inside the lab. The real page uses
  wall time. Enemy AI and `spawnGoal` are time-dependent (N9: `spawnGoal` throws on about half of all
  clock values).
- Coordinates: `pos`, `cam`, entities and mesh indices are window-local; `endlessCaveNetworks` is world.
  The window re-centres on 480 u chunk crossings and rebuilds entity arrays. Units: mesh height h;
  physics Z = 60 + 40h; render Z = 25h; eye = 2.4 h above the feet.
- User working style: be direct and concise; do not start work the user did not ask for; confirm
  before anything irreversible.
