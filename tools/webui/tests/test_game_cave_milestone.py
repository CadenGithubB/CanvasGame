"""Local behavioral acceptance for the first shared cave geometry milestone.

The harness (tools/webui/harness/game_cave_milestone_harness.js) walks the real
input path from the approach into the chamber and back on Cave Test 12345
(descending mouth) and the two natural hillside sites 5668 and 6290, renders
inside and above the cave, checks chamber content on a chunk edge, and checks
that a network regenerates identically. It has no known failures.

PROBES (opt-in, HW1_GAME_PROBES=1) show the checks can fail: each BREAK puts a
plausible defect into a copy of the game and lists only the checks it is aimed
at. Collateral flips are not asserted. A chamber-content inset change (18 ->
-60) was tried as a probe for the chunk-edge content checks and flips nothing,
so it is not listed: it does not reach its subjects.

Run:
    python3 -m unittest tools.webui.tests.test_game_cave_milestone -v
    HW1_GAME_PROBES=1 python3 -m unittest tools.webui.tests.test_game_cave_milestone -v
"""
from tools.webui.game_lab import probe_testcase, suite_testcase

_P = "cave_milestone: "
C_D_SUPPORT = _P + "descending 12345 walk has continuous support"
C_D_FALLS = _P + "descending 12345 walking does not trigger falls"
C_D_PORTAL = _P + "descending 12345 portal has finite floor and clearance"
C_H_PORTAL = _P + "hillside 5668 portal has finite floor and clearance"
C_D_REGEN = _P + "descending 12345 network regenerates deterministically"

PROBES: list = [
    ("BREAK steep approach: the descending ramp drops over 15% of its length",
     "var axial = along > 0 ? 1 - caveSmooth01(along / outer) : 1;",
     "var axial = along > 0 ? 1 - caveSmooth01(along / (outer * 0.15)) : 1;",
     {C_D_SUPPORT: "FAIL", C_D_FALLS: "FAIL"}),
    ("BREAK headroom: cave networks get 2.2-2.6 h of headroom instead of 3.8-4.2 (RNG draw kept)",
     "var headroom = 3.8 + rng() * 0.4, minCover = 1.0;",
     "var headroom = 2.2 + rng() * 0.4, minCover = 1.0;",
     {C_D_PORTAL: "FAIL", C_H_PORTAL: "FAIL"}),
    ("BREAK determinism: the mouth bearing draws from Math.random (the seeded stream's draw is kept)",
     "var entryAngle = rng() * Math.PI * 2;",
     "var entryAngle = (rng(), Math.random()) * Math.PI * 2;",
     {C_D_REGEN: "FAIL"}),
]

CaveMilestoneTests = suite_testcase("cave_milestone", {}, min_checks=30)
CaveMilestoneProbes = probe_testcase("cave_milestone", PROBES)
