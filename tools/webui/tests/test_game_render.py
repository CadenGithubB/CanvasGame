"""Production render-pass and scene-depth regression scenarios.

The headless host records submitted geometry, not final browser pixels.
Flat cap backfaces, a visible outward ceiling/ground pair, and an on-screen
buried target hidden by composed terrain are distinct contracts. Sloped
surface tops above the horizon are not automatically exposed undersides.

Fixtures cover cave floors/ceilings and portals, ceiling-dependent wall
closure, real wall-mounted ore, surface actors/chests/goals, whole-loop walks,
and fixed-level rendering. Current known defects remain explicit below:
enemy walk-cycle selection (with a FIX probe that drives it from the enemy's
own motion). The shop tower's literal-zero height defect and
the fixed-level floor crash (audit D24: classic floor meshes had no per-layer
colours) are repaired; BREAK probes reintroduce them.

Run the baseline, then its causal mutations:
    python3 -m unittest tools.webui.tests.test_game_render -v
    HW1_GAME_PROBES=1 python3 -m unittest tools.webui.tests.test_game_render -v

The shipping terrain_facing and cave_occlusion_integration tests additionally
cover sloped-face geometry and partially occluded portal samples. Actual
browser composition and performance still require separate browser checks.
"""

from __future__ import annotations

import unittest

from tools.webui.game_lab import probe_testcase, suite_testcase

_CEIL = "render: inside the tunnel the ceiling pass draws the tunnel ceiling"
_OVER = "render: inside the tunnel the floor pass draws no cap undersides overhead"
_INFLOOR = "render: inside the tunnel the floor pass draws the tunnel floor"
_OUT = "render: looking back out from inside the tunnel draws its ceiling and open ground"
_RAMP = "render: from the open approach ramp the cave floor ahead is drawn"
_ARCHV = "render: standing in the archway the tunnel floor ahead is drawn"
_ABOVE = "render: composed terrain hides a buried target from a camera on the cap"
_WALLS = "render: a camera on the cap above the cave draws no buried cave walls"
_ARCHSEEN = "render: the archway is drawn to a player on the open approach ramp"
_ROCK = "render: the rock drawn above a cave wall follows the cave ceiling beside it"
_WALK = "render: a real frame loop walking into the cave and back out raises no render errors"
_WALK_BAL = "render: canvas save/restore stays balanced through the cave walk"
_LOW = "render: surface enemies standing below h=0 are visible to a camera 60 u away facing them"
_HIGH = "render: surface enemies standing at or above h=0 are visible to a camera 60 u away facing them"
_CHESTS = "render: surface treasure chests are visible to a camera 60 u away facing them"
_ORE_ZERO = "render: ore attached to a real wall remains visible at every terrain height"
_GOAL_ZERO = "render: the exit goal remains visible on open surface at every terrain height"
_SHOP_ZERO = "render: the shop tower remains visible on open surface at every terrain height"
_BURIED = "render: enemies on a capped tunnel floor stay hidden from a camera on the ground above"
_CYCLE = "render: an enemy's walk-cycle frame advances only while the enemy itself moves"
_LV_ERR = "render: fixed level 1 renders 3D frames without render-pass exceptions"
_LV_FILL = "render: fixed level 1 floor pass draws ground quads"
_LV_BAL = "render: fixed level 1 keeps canvas save/restore balanced across frames"
_LOAD = "render: game script evaluates without throwing"

# check id -> (why it fails today, regex its FAIL detail must match).
KNOWN_BUGS: dict[str, tuple[str, str]] = {
    _CYCLE: (
        "audit F5 (U4 'enemies look stuck'): drawEnemies3D (14-render-entities.js) sets isMoving from the CAMERA "
        "distance, dist in (10, chaseRange), not from the enemy's own motion, so an idle enemy 60 u away walks in "
        "place (5-7 frames in 8 draws 100 ms of game time apart) and a walking enemy beyond chaseRange is frozen "
        "on frame 0.",
        r"idle@60u frames=[2-9].*walking@\d+u frames=1 "),
    # _LV_ERR, _LV_FILL and _LV_BAL (audit D24's fixed-level floor) were
    # repaired by codex/floor-render-crash: buildClassicFloorLayerColors gives
    # a classic floor mesh the per-layer colours (l0Color) the 3D floor pass
    # reads, so the pass no longer throws, draws its quads and restores what
    # it saved. Their BREAK probe below removes that step again.
}

# Causal probes against the current renderer. Each disables a real path,
# leaving geometry/seed preconditions intact. No obsolete D4/D5 cull anchors.
PROBES = [
    ("BREAK: missing ceiling pass", "function drawLayersCeiling3D() {",
     "function drawLayersCeiling3D() { return;", {_CEIL: "FAIL", _OUT: "FAIL", _INFLOOR: "PASS"}),
    ("BREAK: missing floor pass", "function drawLayersFloor3D() {",
     "function drawLayersFloor3D() { return;", {_INFLOOR: "FAIL", _RAMP: "FAIL"}),
    ("BREAK: opaque scene surfaces no longer write depth",
     "}, {writeDepth: true, _paintsDepthPixels: true});",
     "}, {writeDepth: false, _paintsDepthPixels: true});", {_ABOVE: "FAIL"}),
    ("BREAK: missing enemy draw pass", "function drawEnemies3D() {",
     "function drawEnemies3D() { return;", {_LOW: "FAIL", _HIGH: "FAIL"}),
    ("BREAK: missing ore wall attachment", "function drawOreVeins() {",
     "function drawOreVeins() { return;", {_ORE_ZERO: "FAIL"}),
    ("BREAK: missing exit goal", "function drawGoalMarker3D() {",
     "function drawGoalMarker3D() { return;", {_GOAL_ZERO: "FAIL"}),
    ("BREAK: missing portal geometry", "function drawCaveEntrance3D() {",
     "function drawCaveEntrance3D() { return;", {_ARCHSEEN: "FAIL"}),
    # Audit D24's fixed-level floor, repaired: classic meshes lose their
    # per-layer colours again, so the floor pass throws on its first quad
    # every frame. The Endless tunnel floor (chunk-authored colours) is an
    # unaffected control.
    ("BREAK: classic floor meshes are built without per-layer colours again",
     "  buildClassicFloorLayerColors(floorMesh);\n", "",
     {_LV_ERR: "FAIL", _LV_FILL: "FAIL", _LV_BAL: "FAIL", _INFLOOR: "PASS"}),
    # Audit D7 + N7, repaired: restores the tower's literal world-Z 0 call and
    # its legacy column/hill gates. The exit goal is an unaffected control.
    ("BREAK: shop tower asks about world height 0 again",
     "  var towerVis = entityVisible3D(shopMarker.x, shopMarker.y, bgz, C, {maxDist: 900, sceneDepth: true, fadeFraction: 0.8});",
     "  var towerVis = entityVisible3D(shopMarker.x, shopMarker.y, 0, C, {maxDist: 900, depthOffset: 5, checkMidpoint: true, fadeFraction: 0.8});",
     {_SHOP_ZERO: "FAIL", _GOAL_ZERO: "PASS"}),
    # Audit F5, still present: the walk cycle follows the enemy's own motion
    # between draws instead of the camera distance. Appended so the slots
    # above keep their test_probe_NN.
    ("FIX F5: the walk cycle follows the enemy's own motion between draws (drawEnemies3D isMoving)",
     "    var isMoving = (dist > 10 && dist < eType.chaseRange);",
     "    var isMoving = e._f5x !== undefined && Math.hypot(e.x - e._f5x, e.y - e._f5y) > 0.01; e._f5x = e.x; e._f5y = e.y;",
     {_CYCLE: "PASS"}),
]

RenderSuite = suite_testcase("render", KNOWN_BUGS, min_checks=24)
RenderProbes = probe_testcase("render", PROBES)

if __name__ == "__main__":
    unittest.main()
