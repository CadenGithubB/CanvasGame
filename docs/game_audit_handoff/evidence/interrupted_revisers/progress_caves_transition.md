# Progress digest of the INTERRUPTED previous reviser for suite caves_transition
(source transcript: <local-home>/.claude/projects/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/subagents/workflows/wf_0c7d2ccf-504/agent-add509aa5829446f4.jsonl; 273 records; last write 1789816578.4173255)

NOTE: I'll start by reading the required inputs.
BASH (Count lines of key files and list scratchpad) 'cd ./tools/webui && wc -l README.md harness/_game_env.js game_lab.py harness/game_caves_transition_harness.js tests/test_game_caves_transition.py && ls <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/'
BASH (List scratch dirs and file states) 'ls -la <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/review_caves_transition/ <task-temp>/-Users-'
BASH (Check prior revise attempt state) 'date; cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && diff orig_test.py ./tools/webui/tests/test_game_caves_transition.py && echo SAME_TEST; diff orig_harness.js <local-home>/esp'
NOTE: A prior revision attempt left a partly-modified harness. Let me read the review inputs, then diff against the original.
BASH (Dump caves_transition review from phase2.json) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/ && python3 -c "\nimport json\nd=json.load(open(\'phase2.json\'))\nprint(d.keys())\nr=d[\'reviews\'][\'caves_transition\']\nprint(r.keys() if isinstance(r,dict) else type(r))\nprint(json.dumps(r,indent=1'
BASH (Dump critic items naming caves_transition) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/ && python3 -c "\nimport json\nd=json.load(open(\'phase2.json\'))\nc=d[\'critic\']\nprint(c.keys())\ndef dump(x, path=\'\'):\n    s=json.dumps(x)\n    return s\nfor k,v in c.items():\n    if isinstance(v,li'
BASH (Read audit index) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/ && wc -l audit_index.md && cat audit_index.md | head -150'
BASH (View the original harness header) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && wc -l orig_harness.js && sed -n 1,80p orig_harness.js'
BASH (View prior probes.py and last run results) "cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && cat probes.py; echo ======; cat ex3.js; echo; grep -E '^(PASS|FAIL|HARNESS|ELAPSED)' new3.txt | cut -c1-400"
BASH (View last runs of prior revision attempt) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && cat ex3.js; echo; for f in new1.txt new2.txt new3.txt dbg3.txt; do echo "=== $f"; grep -E \'^(PASS|FAIL|HARNESS|ELAPSED)\' $f | cut -c1-300; done'
BASH (Inspect engine selection in js_engine) 'grep -n "def run_js\\|JS_ENGINE\\s*=\\|def _find\\|JSC_HELPER\\s*=\\|HW1_JS_ENGINE\\|environ" tools/webui/js_engine.py | head -30; which deno node jsc bun qjs'
BASH (Read engine discovery code) 'sed -n 55,120p tools/webui/js_engine.py && sed -n 185,200p tools/webui/js_engine.py'
NOTE: Let me run the current (partly revised) harness to see where it stands.
BASH (Run current harness on deno) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && python3 run.py --out cur0.txt --w 700 2>&1 | tail -60'
NOTE: The current harness takes 200 s, well over the 60 s budget. Let me look at per-phase timings.
BASH (Show timing and other metrics) "cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && grep -E '^METRIC .*_ms' cur0.txt; grep -E '^METRIC' cur0.txt | grep -v _ms | head -80"
NOTE: The time balloons in the Endless world (103 s). Let me check whether `findCaveNetworks` pollutes `endlessCaveNetworks`.
BASH (Find cave network generation and caching) 'grep -n "function generateCaveNetwork\\|endlessCaveNetworks\\[" components/hardwareone/WebPage_Games.h | head -20; grep -n "function queryCaveGeometry" components/hardwareone/WebPage_Games.h'
BASH (Find how networks are passed to queryCaveGeometry) 'grep -n "queryCaveGeometry(" components/hardwareone/WebPage_Games.h | head; grep -n "function getCaveNetworksNear\\|function getNearbyCaveNetworks\\|Networks(" components/hardwareone/WebPage_Games.h | head -20'
BASH (Check network iteration in chunk build) 'grep -n "cCaveNets\\s*=\\|cCaveNets.push" components/hardwareone/WebPage_Games.h | head; sed -n 4795,4805p components/hardwareone/WebPage_Games.h; grep -n "for (var _k in endlessCaveNetworks)\\|in endlessCaveNetworks)" components/hardwareone/WebPage_Games.h | head'
BASH (Inspect per-frame loops over all networks) 'sed -n 18380,18400p components/hardwareone/WebPage_Games.h; sed -n 18675,18690p components/hardwareone/WebPage_Games.h; grep -n "deepCaveEntrances\\s*=\\|deepCaveEntrances.push" components/hardwareone/WebPage_Games.h | head'
BASH (Compare timings of the original harness) "cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/ && grep -E '_ms' revise_caves_transition/base0.txt | head -30; grep -E '_ms|ELAPSED' review_caves_transition/run1.txt | head -30"
BASH (Check machine load and concurrent engines) 'uptime; sysctl -n hw.ncpu; ps aux | grep -E "deno|jsc" | grep -v grep | wc -l; ps aux | grep -E "deno" | grep -v grep | awk \'{print $3, $4, $10}\' | head -20'
BASH (Read chunk cave-network lookup) 'sed -n 5337,5385p components/hardwareone/WebPage_Games.h'
NOTE: The machine is heavily loaded (load avg ~60 on 10 cores), so wall time is inflated. I'll measure CPU time of the engine process to judge the budget.
BASH (Create timing runner script in scratch) "mkdir -p <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/r2 && cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && cat > rt.py <<'EOF"
NOTE: Let me check what the prior attempt found about ct31337/E1 (still flipping 5 times despite the single-roof filter).
BASH (Inspect prior debug output for ct31337/E1) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && grep -c . dbg3.txt; grep -E "^NOTE" dbg3.txt | head -5 | cut -c1-3000'
BASH (Scan ct31337/E1 approach stacks) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && cat > rx.py <<\'EOF\'\n"""Run a scratch JS script against the game: python3 rx.py script.js [--probe NAME] [--engine jsc] [-- args]"""\nimport sys, shutil, pathlib, ti'
BASH (Print full stacks along ct31337/E1 approach) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && sed -i \'\' \'s/LAB.note(line.join(" "));/line.forEach(function(s){LAB.note(s);});/\' ex_e1.js && python3 rx.py ex_e1.js 2>&1 | grep NOTE | sed -n \'1,52p\' | paste - - '
NOTE: Let me measure CPU time for the current harness and, in parallel, check whether Endless spawns enemies mid-walk (a possible slowdown and a fixture hole).
BASH (Measure CPU time of current harness) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && python3 rt.py --out cur1.txt --w 120 -- 2>&1 | tail -3'
BASH (Read gameUpdate and enemy push sites) 'sed -n 19395,19425p components/hardwareone/WebPage_Games.h; grep -n "enemies.push(" components/hardwareone/WebPage_Games.h | head -30'
BASH (Profile tick cost in Cave Test vs Endless) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && cat > ex_prof.js <<\'EOF\'\n(0, eval)(slurp("tools/webui/harness/_game_env.js"));\nLAB.init(__out, slurp, __engine, __argv);\nLAB.load(__argv[0]);\nfunction quiet() { en'
NOTE: While that runs, let me read the underground-detection code and the step() airborne/landing code to pin mechanisms.
BASH (Read updateDayNight underground logic) 'sed -n 19293,19300p components/hardwareone/WebPage_Games.h; echo ...; sed -n 19336,19392p components/hardwareone/WebPage_Games.h'
BASH (Trace ct31337/E1 approach walk per tick) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && cat > ex_e1w.js <<\'EOF\'\n(0, eval)(slurp("tools/webui/harness/_game_env.js"));\nLAB.init(__out, slurp, __engine, __argv);\nLAB.load(__argv[0]);\nLAB.freshPage(); LAB.r'
BASH (Check CPU timing run output) 'sleep 60; cat <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/tasks/bybua474q.output; uptime'
BASH (Check CPU timing run output) 'cat <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/tasks/bybua474q.output; uptime'
BASH (Read step() jump/landing/edge-fall code) 'sed -n 10100,10200p components/hardwareone/WebPage_Games.h'
BASH (Profile gameUpdate sub-functions per world) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && cat > ex_prof2.js <<\'EOF\'\n(0, eval)(slurp("tools/webui/harness/_game_env.js"));\nLAB.init(__out, slurp, __engine, __argv);\nLAB.load(__argv[0]);\nvar G = (0, eval)("t'
NOTE: `assembleWindow` dominates tick cost. Let me check the background CPU measurement.
BASH (Check timing run) 'cat <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/tasks/bybua474q.output | tail -3'
NOTE: Meanwhile I'll instrument per-phase `assembleWindow` counts in the harness so I can see where re-centres come from.
EDIT game_caves_transition_harness.js: -161c +259c :: new starts '        var PH = {}, PA = {};\n        function timed(name, fn) {\n            var t = LAB.realNow(), a = AW.calls;\n            try { return fn(); } finally { PH[name] = (PH[name] || 0) + LAB.realNow() - t; PA[name] = (PA['
EDIT game_caves_transition_harness.js: -102c +183c :: new starts '        for (var ph in PH) { LAB.metric("caves_transition." + W.label + "." + ph + "_ms", PH[ph], "ms"); LAB.metric("caves_transition." + W.label + "." + ph + ".assembles", PA[ph]); }'
EDIT game_caves_transition_harness.js: -82c +118c :: new starts '            try { timed("daynight", function () { W.nodn = axisWalk(W, W.ents[0], W.label + "/E0 dayNight-off"); }); }'
BASH (Run instrumented harness in background) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && (python3 rt.py --out cur2.txt -v --w 200 -- > cur2.log 2>&1 &) ; echo started'
NOTE: While those run, let me see how an already-revised sibling suite formats tuple KNOWN_BUGS and probes, to stay consistent.
BASH (Look at sibling suites' KNOWN_BUGS format) 'cd ./tools/webui/tests && grep -l \'", r"\' test_game_*.py; grep -n "KNOWN_BUGS" test_game_*.py | head; sed -n 1,20p test_game_physics.py | head -5; grep -n -A6 "^KNOWN_BUGS" test_game_physics.py | head -30'
BASH (Read physics KNOWN_BUGS style) 'cat ./tools/webui/tests/test_game_physics.py | sed -n 81,140p'
BASH (Check instrumented run progress) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && cat cur2.log | tail -3; uptime'
BASH (Show full dh and airborne details) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && grep -E "^FAIL caves_transition: walk-in: height" cur0.txt | tr \'|\' \'\\n\'; grep -E "^FAIL caves_transition: walk-in: the player never goes airborne" cur0.txt | tr \''
BASH (Check both runs) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && tail -3 cur2.log; cat <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/tasks/bybua474q.output | tail -2'
BASH (Read the floor picker) 'sed -n 7831,7905p components/hardwareone/WebPage_Games.h'
BASH (Read updateChunks re-centre logic) 'sed -n 7474,7512p components/hardwareone/WebPage_Games.h'
BASH (Check for partial results) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && cat <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/tasks/bybua474q.output | tail -2; grep -E "assembles|_ms" cur2.l'
NOTE: Let me prepare the candidate probe set (scratch) with the new mutations I'll need to test.
BASH (Locate probe anchors in the game source) 'grep -n "if (_walk_u.idx >= 0 && _topWalk >= 0 && _walk_u.idx < _topWalk) {" components/hardwareone/WebPage_Games.h; grep -n "if (pcx !== centerCX || pcy !== centerCY) {" components/hardwareone/WebPage_Games.h; grep -n "approachDepth = e.depth || 5;" components/hardwareone/WebPage_Games.h; grep -n "'
BASH (Read CPU timing result) 'tail -2 <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/tasks/bybua474q.output'
BASH (Inspect timing output file) 'cat <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/tasks/bybua474q.output; ls -la <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/cur1.txt; grep total_ms /private/tmp/cla'
NOTE: CPU time is 98 s (wall 779 s under load), so the suite must lose more than half its work. Let me look at the phase split from that run.
BASH (Compute phase share of total runtime) "cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && python3 - <<'EOF'\nimport re,collections\nph=collections.defaultdict(float); tot=0\nfor l in open('cur1.txt'):\n    m=re.match(r'METRIC caves_transition\\.(\\w+)\\.(\\w+)_"
NOTE: Crossings, network walks and cap walks are the biggest phases. While the assemble-count run finishes, I'll add the new candidate probes.
BASH (Add new candidate probes and validate anchors) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && cat >> probes2.py <<\'EOF\'\n\n# ── added in this revision ──\n_UG = ("      if (_walk_u.idx >= 0 && _topWalk >= 0 && _walk_u.idx < _topWalk) {\\n        playerUndergrou'
BASH (Check cur2 progress) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && tail -2 cur2.log; uptime'
BASH (List level-ground shifts per world) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && grep -E "^PASS caves_transition: window shift: crossing" cur1.txt | tr \'|\' \'\\n\' | sed \'s/origin.*|dh/|dh/\' ; grep -E "METRIC caves_transition.window" cur1.txt'
BASH (Per-phase assembleWindow counts) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && grep -E "assembles|first_tick|start_assembles|total_ms" cur2.log | sed \'s/METRIC caves_transition.//\' | paste - - - - - - - - - - '
EDIT game_caves_transition_harness.js: -490c +912c :: new starts '    // tx may be a list of WORLD waypoints [[x, y], ...] (ty ignored): one trace,\n    // one tracer, the keys held from one waypoint to the next; maxTicks is then\n    // per waypoint and `missed` is the worst arrival dis'
EDIT game_caves_transition_harness.js: -99c +115c :: new starts '        var res = { tag: tag, base: T.base, trace: T.tr, dist: dist, missed: missed, end: LAB.worldPos(), spr: spr,'
EDIT game_caves_transition_harness.js: -35c +812c :: new starts '    // Make sure every WORLD point in pts lies inside the loaded window (24 u\n    // margin), re-centring on the first one only if one does not. Scans read\n    // floorMesh / grid at those points; a re-centre costs a who'
EDIT game_caves_transition_harness.js: -184c +195c :: new starts '    function chooseStart(E) {\n        ensureWindow([LAB.axisWorld(E, 470, 0), LAB.axisWorld(E, 698, 0), LAB.axisWorld(E, 0, 0)]);\n        var cands = [], why = { roofed: 0, wall: 0, reopens: 0 };'
EDIT game_caves_transition_harness.js: -132c +186c :: new starts '        ensureWindow([LAB.axisWorld(E, INSIDE_ALONG, 0), LAB.axisWorld(E, INSIDE_ALONG, -CAPWALK_PERP), LAB.axisWorld(E, INSIDE_ALONG, CAPWALK_PERP)]);\n        for (var p = CAPWALK_PERP;'
BASH (Restructure crossings, network walks and driver) 'python3 - <<\'EOF\'\np=\'tools/webui/harness/game_caves_transition_harness.js\'\ns=open(p).read()\nold_start=s.index("    // Straight walks across chunk lines along corridor segments (world coords),")\nold_end=s.index("    // ── per-world driver")\nnew=\'\'\'    // One straight 30 fps walk through the real loop'
BASH (Reorder per-entrance scenarios; use waypoint miss) 'python3 - <<\'EOF\'\np=\'tools/webui/harness/game_caves_transition_harness.js\'\ns=open(p).read()\nold=\'\'\'            timed("lateral", function () {\n                W.lateral.push(lateralWalk(W, E, INSIDE_ALONG, -1, LATERAL_LEN, 520, lab + " lateral-"));\n                W.lateral.push(lateralWalk(W, E, INS'
BASH (Count corridors walked; launch timing run) 'python3 - <<\'EOF\'\np=\'tools/webui/harness/game_caves_transition_harness.js\'\ns=open(p).read()\ns=s.replace(\'\'\'            R.w = walk(W, null, pts, null, 150, R.label, { settle: "air" });\n            out.push(R);\'\'\',\'\'\'            R.n = ids.length;\n            R.w = walk(W, null, pts, null, 150, R.label'
NOTE: While the timing run goes, I'll trace the ct98765/E1 cap-walk drop (a U2 case) to pin its mechanism.
BASH (Trace ct98765/E1 cap walk in background) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && (python3 rt.py --out tr98765.txt --w 100 -- --seeds 98765 --endless-seeds 0 --trace "ct98765/E1 capwalk" > tr98765.log 2>&1 &); echo ok'
NOTE: While the runs go, I'll add the missing G3 hysteresis check from the review (dithering across a chunk line at the cave mouth re-centres every time).
BASH (Check chunk constants) 'grep -n "CHUNK_SIZE\\s*=" components/hardwareone/WebPage_Games.h | head -3; grep -n "var WINDOW_CHUNKS" components/hardwareone/WebPage_Games.h'
BASH (Add G3 dither scenario and widen fps crossing) 'python3 - <<\'EOF\'\np=\'tools/webui/harness/game_caves_transition_harness.js\'\ns=open(p).read()\nanchor="    // ── per-world driver"\nnew=\'\'\'    // G3: dithering across a chunk line at a cave mouth. On the first entrance\n    // axis that crosses a chunk line within DITHER_REACH u of the entrance\n    // po'
BASH (Add the dither check aggregation) "python3 - <<'EOF'\np='tools/webui/harness/game_caves_transition_harness.js'\ns=open(p).read()\nanchor='''    // Every real-loop frame must have run: gameUpdate and every draw pass sit'''\nnew='''    // G3: no hysteresis on the re-centre (updateChunks L7483 re-centres as soon\n    // as the player's chunk"
NOTE: Now the reviewer's robustness note for "stays under the roof" (a lateral walk may legitimately leave along another entrance's approach):
BASH (Excuse ticks on another entrance's approach) 'python3 - <<\'EOF\'\np=\'tools/webui/harness/game_caves_transition_harness.js\'\ns=open(p).read()\nold=\'\'\'        var R = { label: label, pre: [] };\n        var s = LAB.axisWorld(E, along, 0);\n        LAB.placeWorld(s.x, s.y, "bottom");\'\'\'\nnew=\'\'\'        var R = { label: label, pre: [], others: (W.ents || '
BASH (Check running jobs) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && tail -2 cur3.log tr98765.log; uptime'
BASH (Phase shares after first cut) "cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && python3 - <<'EOF'\nimport re,collections\nph=collections.defaultdict(float); asm=collections.defaultdict(int); tot=0\nfor l in open('cur3.txt'):\n    m=re.match(r'METR"
BASH (Per-world cost after the first cut) 'cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && grep -E "scenario_ms|total_ms|build_ms" cur3.txt; grep -E "^METRIC caves_transition.end424242\\.[a-z]+(_ms|\\.assembles)" cur3.txt | paste - - | head -20'
BASH (Trim the Endless world, network and fps work) "python3 - <<'EOF'\np='tools/webui/harness/game_caves_transition_harness.js'\ns=open(p).read()\n# 1. endless: axis + lateral only\nold='''            // Ordered so consecutive scenarios start near each other: the jump\n            // sweep ends at along -150, where the lateral and cap walks start.\n       "
NOTE: Now the chooseStart change (first open, wall-free, single-roof candidate scanning outward from +250):
NOTE: Before choosing further cuts, let me see which worlds each failing check actually depends on.
BASH (Which items fail per check) "cd <task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/revise_caves_transition/ && python3 - <<'EOF'\nimport sys,re\nsys.path.insert(0,'.')\nfrom tools.webui import game_lab as g\nclass P: pass\ntxt=open('cur3.txt').rea"
NOTE: ct424242 contributes no failure that another world doesn't also show, so I'll drop it from the default Cave Test list (still reachable via `--seeds`). Then I'll re-time.
BASH (Drop ct424242 default; relaunch; view cap-walk trace) 'sed -i \'\' \'s/    var CT_SEEDS = LAB.seeds(\\[12345, 424242, 31337, 98765\\]);/    var CT_SEEDS = LAB.seeds([12345, 31337, 98765]);/\' tools/webui/harness/game_caves_transition_harness.js && grep -n "CT_SEEDS = " tools/webui/harness/game_caves_transition_harness.js && cd <task-temp>/-Users-m'

## Last tool results before the interruption
RESULT: 588:        W.ents.forEach(function (E) {
RESULT: 290	                 oldS: r.shift.oldS ? LAB.fmtLayers(r.shift.oldS) : "(no pre-shift copy)", newS: LAB.fmtLayers(r.shift.newS),
291	                 from: r.shift.from, to: r.shift.to };
292	    }
293
294	    // First along in +470, +458 .. +250, then +482 .. +698, whose cell is open
295	    // surface (no ceiling, no cap), from which the straight path to the
296	    // entrance crosses no SURFACE wall cell (grid && !gridCave: cave-biome rock
297	    // the player cannot walk through), and whose approach is ONE roofed run:
298	    // scanning inward to along +40 (outside the CAP_EXCL mouth hole), once the
299	    // roof starts it never opens again. A branch corridor that roofs part of an
300	    // approach (Cave Test 31337 E1: roofed +472..+419, open, roofed from +344)
301	    // would otherwise make a correct game flip playerUnderground three times.
302	    function chooseStart(E) {
303	        ensureWindow([LAB.axisWorld(E, 470, 0), LAB.axisWorld(E, 698, 0), LAB.axisWorld(E, 0, 0)]);
304	        var cands = [], why = { roofed: 0, wall: 0, reopens: 0 };
305	        for (var a0 = 470; a0 >= 250; a0 -= 12) cands.push(a0);
306	        for (var a1 = 482; a1 <= 698; a1 += 12) cands.push(a1);
307	        for (var ci = 0; ci < cands.length; ci++) {
308	            var a = cands[ci];
309	            var w = LAB.axisWorld(E, a, 0), l = LAB.toLocal(w.x, w.y);
310	            var ls = LAB.layersAt(l.x, l.y);
311	            if (!ls.length || roofed(ls)) { why.roofed++; continue; }
RESULT: walk-in: height never changes by more than 0.35 h in one tick walking  ct12345/E0 ct424242/E0 ct31337/E1 ct98765/E0 ct98765/E1 end424242/E0 end424242/E1
walk-in: the player never goes airborne walking the entrance ramp      ct12345/E0 ct424242/E0 ct31337/E0 ct31337/E1 ct98765/E0 ct98765/E1 end424242/E0 end424242/E1
walk-in: playerUnderground changes exactly once going in and once comi ct12345/E0 ct424242/E0 ct31337/E0 ct31337/E1 ct98765/E0 ct98765/E1 end424242/E0 end424242/E1
walk-in: ambient light dims monotonically going in and brightens monot ct12345/E0 ct424242/E0 ct31337/E0 ct31337/E1 ct98765/E0 ct98765/E1 end424242/E0 end424242/E1
walk-in: ambient light never changes by more than 0.2 in one tick      ct12345/E0 ct424242/E0 ct31337/E0 ct31337/E1 ct98765/E0 ct98765/E1 end424242/E0 end424242/E1
walk-in: sunlight and fog change by at most 0.2 and 0.05 in one tick w ct12345/E0 ct424242/E0 ct31337/E0 ct31337/E1 ct98765/E0 ct98765/E1 end424242/E0 end424242/E1
walk-in: wherever a cave ceiling is above the player's floor, the eye  ct12345/E0 ct424242/E0 ct31337/E0 ct31337/E1 ct98765/E0 ct98765/E1 end424242/E0 end424242/E1
walk-in: the player is never inside rock between a cave ceiling and th ct12345/E0 ct424242/E0 ct31337/E1 ct98765/E0
walk-in: the player never sinks more than a step height below every fl ct98765/E0
entrance light: on open ground ambient light darkens gradually and nev end424242 open ground
lateral: walking sideways inside the corridor never puts the player in c