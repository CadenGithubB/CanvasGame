# Original audit scripts (first session, before the test lab existed)

These are the throwaway JavaScriptCore scripts that produced the numbers in the
original audit report (HANDOFF.md section 3). They are SUPERSEDED by the test lab
in tools/webui/ (game_lab.py + harness/_game_env.js + harness/game_*_harness.js),
which re-measures the same things with a virtual clock, seeded randomness,
captured timers and a portable engine layer. Keep these only to reproduce the
original measurements exactly.

Differences from the lab that matter if you rerun them:
- They use the REAL clock (Date.now) and unseeded Math.random, so enemy AI and
  anything time-gated is not reproducible run to run. Terrain/cave generation is
  seeded by WORLD_SEED and IS reproducible.
- They run only under macOS jsc (`load()`, `print()`); the lab runs on
  node/deno/bun/qjs/jsc/osascript.
- They stub setTimeout etc. as no-ops and never run captured timers.

## How to run (macOS)

    cd <scratch dir>
    # 1. extract the game body with header line numbers preserved (script tags blanked)
    awk 'NR>=215 && NR<=22515 { if ($0 ~ /^<script>$/ || $0 ~ /^<\/script>$/) print ""; else print; next } {print ""}' \
        <repo>/components/hardwareone/WebPage_Games.h > game_body.js
    # 2. copy prelude.js and a t_*.js next to it, then:
    /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc t_axis.js

(Line 215 is the `<script>` line of the R"JS( block and 22515 the `</script>` line
at the time of the audit; re-check both if the header has changed.)

## What each script measured

| script | produced |
|---|---|
| t_axis.js | layer stack + generator record along entrance[0]'s axis (+516..-240, 12 u steps), seed 12345 Cave Test: roof starts +216, floor step -1.64, cap hole |
| t_walk.js | real step() walk in and out along the axis: underground flips, ambient jumps, 27 airborne toggles, +0.74 h jolt |
| t_scan.js | whole-window mesh statistics (l0-is-ceiling 1226/6189, headroom) + 4-neighbour transition scan with getWalkableLayerTopAt (42 fall-throughs, 24 no-candidate) |
| t_sink2.js | real-physics repro of the D11 sink at world (246,720) and the lateral walk out through the cave side (D14) |
| t_multi.js | cave rarity across 5 normal seeds (1.1-2.1% of regions) + entrance structure across 4 Cave Test seeds |
| t_render.js | recorded draw passes at 5 camera positions with DEBUG_POLY_TYPES: fills by class, overhead quads (D4/D5) |
| t_spawn.js | Cave Test spawn between layers (D13) and the day/night-off underground freeze (D10) |
| t_cull.js | fraction of surface entities hidden by the L511 cull in normal Endless (D7) |
| t_shift.js | assembleWindow timing for window 5/7/9 and log lines per shift (G3) |
| t_perf.js | JS-side cost and fills per draw pass per view distance (G1) |
| t_fixed_and_l4.js | fixed-level floor pass throws (no l0Color) and Level 4 floor-buffer overflow (D24/D25) |

run_probes.py / snap_verdicts.py are the orchestrator's helpers from the lab
phase: rerun every PROBES entry of every suite in parallel, and snapshot all
suites' PASS/FAIL lines for before/after diffs. Both take their worker count
from game_lab (HW1_GAME_JOBS, default CPUs-2 capped at 8). On a machine you are
using, set HW1_GAME_JOBS=1 or 2 (see HANDOFF.md section 6).
