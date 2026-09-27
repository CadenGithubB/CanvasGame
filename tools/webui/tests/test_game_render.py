"""Production render-pass and scene-depth regression scenarios.

The headless host records submitted geometry, not final browser pixels.
Flat cap backfaces, a visible outward ceiling/ground pair, and an on-screen
buried target hidden by composed terrain are distinct contracts. Sloped
surface tops above the horizon are not automatically exposed undersides.

Fixtures cover cave floors/ceilings and portals, ceiling-dependent wall
closure, real wall-mounted ore, surface actors/chests/goals, whole-loop walks,
and fixed-level rendering. Current known defects remain explicit below:
shop-tower height, enemy walk-cycle selection and fixed-level floor colors.

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
    _SHOP_ZERO: (
        "audit D7 + N7: drawGuardTower3D passes literal wz=0 to entityVisible3D (16290), so the real market "
        "tower pass is hidden at low and high open-surface terrain while its ordinary-height control draws. "
        "Market lifetime remains persistence-owned; this check judges only tower visibility.",
        r"measuredWorlds=[1-9]\d* .*s\d+ low\(h=-[\d.]+\): calls=1 wz=0 result=null cameraH=-?[\d.]+ fills=0->0.*"
        r"s\d+ mid\(h=[\d.]+\): calls=1 wz=0 result=visible cameraH=-?[\d.]+ fills=0->[1-9]\d*.*"
        r"s\d+ high\(h=[\d.]+\): calls=1 wz=0 result=null cameraH=-?[\d.]+ fills=0->0"),
    _CYCLE: (
        "audit F5 (U4 'enemies look stuck'): drawEnemies3D sets isMoving from the CAMERA distance, "
        "dist in (10, chaseRange) (14070), not from the enemy's own motion, so an idle enemy 60 u away walks in "
        "place (5-7 frames in 8 draws) and a walking enemy beyond chaseRange is frozen on frame 0.",
        r"idle@60u frames=[2-9].*walking@\d+u frames=1 "),
    _LV_ERR: (
        "audit D24: a fixed level's floorMesh has no l0Color, so drawLayersFloor3D throws a TypeError at 12788 "
        "on its first quad every frame (caught by _pt, 20576-20585): 30 errors in 30 frames, all in platforms3D.",
        r"l0Color=MISSING .*renderErrors\+=30 byPass=\{\"platforms3D\":30\}"),
    _LV_FILL: (
        "audit D24 (same root cause, 12788): the floor pass throws before its first fill(), 0 ground quads.",
        r"l0Color=MISSING .*floorFills=0 drawLayersFloor3D threw TypeError"),
    _LV_BAL: (
        "audit D24 (L12472): the throw at 12788 skips the ctx.restore() at 12926 matching ctx.save() at 12472: "
        "one leaked state per frame (save depth +30, 810 saves vs 780 restores over 30 frames).",
        r"saveDepthDelta=30 save=\d+ restore=\d+"),
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
]

RenderSuite = suite_testcase("render", KNOWN_BUGS, min_checks=24)
RenderProbes = probe_testcase("render", PROBES)

if __name__ == "__main__":
    unittest.main()
