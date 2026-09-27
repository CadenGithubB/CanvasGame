"""Physics of the Endless crawler: falling, floor picking, landing and collision,
on the open surface as much as at cave mouths.

tools/webui/harness/game_physics_harness.js drives the shipping game from
components/hardwareone/WebPage_Games.h through its own functions -- step() via
the real keyboard input path, loop() at 60 and 30 fps, assembleWindow across a
real chunk crossing, getWalkableLayerTopAt, getFloorHeightAt, isInGridWall,
updateEnemies/_applyEnemyAttack -- over Cave Test seed 12345 (--seeds) and
normal Endless seeds 424242 and 777000 (--endless-seeds; spawn window + a far
window at the nearest cave network). What it checks:

  - the floor picker never returns its "no walkable layer" sentinel (h=0) for a
    cell that has ground; walking at a rise steeper than STEP_UP never leaves
    the feet inside rock or the eye inside the terrain, never lifts the player
    onto it (the picker's own "curb" contract), and a jump toward one never
    lands below the ground                                          [D11]
  - walking down a gentle open-ground slope never makes the player airborne,
    while walking off a real drop (> STEP_DOWN) does start a fall   [D12]
  - landing from a jump never snaps the player up more than a walking step
    can rise in one tick                                            [N4]
  - a window shift keeps the player and the ground under them where they were
    (regression guard); getFloorHeightAt never serves a stale cached height
    across the shift; wallFaceBase built during the shift, or when a new world
    is started after another, matches a rebuild with the cache invalidated
                                                                    [D15]
  - walking into ordinary surface walls never puts the player inside one
    (regression guard)
  - a lethal enemy hit ends the game within 2 s                    [D21]
  - every enemy type chasing a player in open ground can land an attack [N2]
  - a new world does not inherit a jump in progress               [N5]

Frame-rate dependence of walking speed and turn rate (N1/G7) is owned by the
perf suite (tools/webui/tests/test_game_perf.py) and is not measured here.

Many checks FAIL on today's code on purpose; KNOWN_BUGS holds them, each with a
regex its FAIL detail must match, so a known bug that starts failing for another
reason (a precondition, a crash, a different mechanism) stops being "expected".
Run:

    python3 -m unittest tools.webui.tests.test_game_physics -v
    HW1_GAME_PROBES=1 python3 -m unittest tools.webui.tests.test_game_physics -v   # + mutation probes
    python3 -m tools.webui.game_lab physics -v --seeds 12345,1 --endless-seeds 424242,777,31337

A default run takes about 30 s of CPU on deno (wall time depends on what else
the machine is running).
"""

from __future__ import annotations

import unittest

from tools.webui.game_lab import probe_testcase, suite_testcase

L0 = "physics: game script evaluates without throwing"
A1 = "physics: floor picker never fabricates ground at h=0 for a cell that has walkable layers"
A2 = ("physics: walking up a rise steeper than STEP_UP never sinks the feet below the ground "
      "or the eye into the terrain")
A3 = ("physics: walking into a rise steeper than STEP_UP never lifts a grounded player onto it "
      "(a rise that high is a wall, not a curb)")
A4 = "physics: a jump toward a rise steeper than STEP_UP never lands the player below the ground"
B1 = ("physics: walking down a gentle open-ground slope (every step within STEP_DOWN) never makes "
      "the player airborne")
B2 = ("physics: walking off a drop larger than STEP_DOWN on open ground starts a fall within 3 "
      "physics steps")
N4 = ("physics: landing from a jump never lifts the player more in one tick than walking up a step "
      "can (0.35 h)")
C1 = "physics: a window shift leaves the player's world position and the ground under them unchanged"
C2 = "physics: getFloorHeightAt never returns a stale floor height across a window shift"
C3 = ("physics: wallFaceBase after a window shift matches a rebuild of that window with the "
      "floor-height cache invalidated")
C4 = ("physics: a new world's wallFaceBase matches a rebuild of that window with the floor-height "
      "cache invalidated, after another world was played")
D1 = "physics: walking into an ordinary surface wall never puts the player's position inside a wall cell"
E1 = "physics: a lethal enemy hit ends the game within 2 s when no phoenix relic is equipped"
F1 = "physics: every enemy type chasing a stationary player in open ground lands an attack"
N5 = "physics: a new world starts with the player on the ground even if the previous world ended mid-jump"

# check id -> (why it fails today, regex the FAIL detail must match). The regex
# pins the documented mechanism; "PRECONDITION" in a detail always fails the
# suite (game_lab.suite_testcase).
KNOWN_BUGS: dict[str, tuple[str, str]] = {
    E1: ("D21 -- _applyEnemyAttack clamps health to 0 (L11282) and step() regenerates (L10090) "
         "before its death check (L10334 health <= 0), so health is 0.05 at the check and the "
         "game never ends",
         r"_applyEnemyAttack\(11272\): hit landed, health after 2 s (?!0\.00)[\d.]+, gameOverState=false"),
    F1: ("N2 -- repelFromEnemies pushes the player out to 12 + 8*size (L10042) while an enemy "
         "attacks only inside 6 + 8*size (L11372); in open ground no type gets inside its reach "
         "(closest Scout 16.3 / Soldier 18.7 / Brute 22.4 / Wolf 16.6 u vs reach 12.4 / 14 / 17.2 / "
         "13.2) and none lands a hit -- enemies connect only once the shoved player is pinned "
         "against a wall",
         r"Scout 0 hits in [\d.]+ s of open ground \(ended: (wall|10 s);"),
}

# (description, anchor, replacement, {check id: expected verdict}), or the
# multi-site form (description, [(anchor, replacement), ...], None, {...}).
# Fixed movement/cache defects now have BREAK probes against the new contract.
# The audit's old FIX snippets no longer match this implementation.
# Movement probes mutate spatialBodyBlocked, the real shared-controller gate.
# D also disables player recovery so it cannot conceal penetration; the harness
# oracle isInGridWall stays intact, including its required sustained contact.
_D21_FIX = ("  health = Math.min(HEALTH_MAX, health + (HEALTH_REGEN_PER_S + hpRegenBonus) * dt);",
            "  if (health > 0) health = Math.min(HEALTH_MAX, health + (HEALTH_REGEN_PER_S + hpRegenBonus) * dt);")

# Probes grouped by the harness scenario that holds their checks; each group
# runs with `--only <scenario>` (scenarios are isolated: every world is built
# from a reloaded-page state), so a probe costs one scenario, not a full run.
PROBE_GROUPS: dict[str, list[tuple]] = {
    "X": [   # nothing but the load gate runs
        ("BREAK load: the page throws while it is evaluated -- the load gate must say so",
         "var NOCLIP = false;",
         "var NOCLIP = false; throw new Error('probe: page fails to load');",
         {L0: "FAIL"}),
    ],
    "A": [
        ("BREAK D11: fabricate a zero floor for blocked terrain",
         "  if (blocked) { blocked.supportIdx = blocked.idx; blocked.idx = -1; blocked.action = 'blocked'; return blocked; }",
         "  if (blocked) return {topH: 0, idx: -1, type: 0, action: 'blocked'};",
         {A1: "FAIL"}),
        ("BREAK terrain collision: allow horizontal travel into unwalkable rises",
         "  if (body.trackFloor===false) return false;",
         "  if (true) return false;",
         {A2: "FAIL"}),
    ],
    "B": [
        ("BREAK D12: treat tiny supported downhill steps as airborne",
         "      fallingOffEdge = walk_e.action === 'fall';",
         "      fallingOffEdge = walk_e.topH !== null && pos.floorZ > meshHeightToPlayerZ(walk_e.topH) + 3;",
         {B1: "FAIL"}),
        ("BREAK falling: disable both edge and post-move unsupported-fall paths",
         [("      fallingOffEdge = walk_e.action === 'fall';", "      fallingOffEdge = false;"),
          ("    } else if (walk_t.action === 'fall') {", "    } else if (false && walk_t.action === 'fall') {")], None,
         {B2: "FAIL", B1: "PASS"}),
    ],
    "N4": [
        ("BREAK landing: snap feet one height unit above the real landing floor",
         "    } else if (jumpVelZ <= 0 && pos.floorZ <= groundZ) {\n      pos.floorZ = groundZ;",
         "    } else if (jumpVelZ <= 0 && pos.floorZ <= groundZ) {\n      pos.floorZ = groundZ + 40;",
         {N4: "FAIL"}),
    ],
    "C": [
        ("BREAK D15: preserve the old mesh cache across window replacement",
         "  if (_floorCacheMesh !== mesh) {", "  if (false && _floorCacheMesh !== mesh) {",
         {C2: "FAIL", C3: "FAIL", C4: "FAIL"}),
        ("BREAK rebase: assembleWindow rebases pos.x 12 u short -- the shift check must notice",
         "    pos.x -= shiftX;",
         "    pos.x -= shiftX + 12;",
         {C1: "FAIL"}),
    ],
    "D": [
        ("BREAK walls: bypass shared footprint collision and the independent player unstuck recovery",
         [("  if (spatialBodyHitsWall(body,x,y,work)) return true;",
           "  if (false && spatialBodyHitsWall(body,x,y,work)) return true;"),
          ("  if (!NOCLIP && !aboveWalls && isInGridWall(pos.x, pos.y, 6, _collideZ)) {",
           "  if (false && !NOCLIP && !aboveWalls && isInGridWall(pos.x, pos.y, 6, _collideZ)) {")], None,
         {D1: "FAIL"}),
    ],
    "E": [
        ("FIX D21: no regen while dead, so the death check sees health 0",
         *_D21_FIX,
         {E1: "PASS"}),
    ],
    "F": [
        ("FIX enemy reach: push-apart radius inside the attack reach",
         "    var thresh = 12 + enemyRad;",
         "    var thresh = 4 + enemyRad;",
         {F1: "PASS"}),
    ],
    "N5": [
        ("BREAK N5: spawn placement carries airborne motion into the new world",
         "  jumpVelZ = 0;\n  jumpAirborne = false;\n  pos.floorZ = 60 + h * 40;",
         "  jumpVelZ = 200;\n  jumpAirborne = true;\n  pos.floorZ = 60 + h * 40;",
         {N5: "FAIL"}),
    ],
}
PROBES: list[tuple] = [p for group in PROBE_GROUPS.values() for p in group]

# The death check must flip whichever Endless seed comes first.
SWEEP_ARGS = ["--endless-seeds", "777,1,31337", "--only", "E"]
SWEEP_PROBES: list[tuple] = [
    ("FIX D21 on the sweep seeds: the death check must not depend on the seed's geometry",
     *_D21_FIX,
     {E1: "PASS"}),
]

PhysicsSuite = suite_testcase("physics", KNOWN_BUGS, min_checks=16)
for _group, _probes in PROBE_GROUPS.items():
    _cls = probe_testcase("physics", _probes, args=["--only", _group])
    _cls.__name__ = _cls.__qualname__ = f"Game_physics_Probes_{_group}"
    globals()[_cls.__name__] = _cls
PhysicsSweepProbes = probe_testcase("physics", SWEEP_PROBES, args=SWEEP_ARGS)
PhysicsSweepProbes.__name__ = PhysicsSweepProbes.__qualname__ = "Game_physics_SweepProbes"
del _group, _probes, _cls

if __name__ == "__main__":
    unittest.main()
