"""Enemy AI in the Endless crawler: movement, collision and awareness.

Runs tools/webui/harness/game_enemies_harness.js against the shipping game in
components/hardwareone/WebPage_Games.h. The harness builds five worlds (normal
Endless seeds 424242 and 777000 at spawn, the same two seeds with the window
re-centred onto their nearest cave network, and Cave Test 12345 with
caveEnemies on) plus ten extra spawn windows for the generation survey only,
and checks, aggregated over them:

  - generation: no enemy stands on a wall cell; no enemy on an open cell has a
    wall inside its footprint at the radius the game's own movement code uses
    (recorded by spying moveSpatialActor); every patrol's waypoints span at least
    twice the game's arrival radius (measured by bisection on updateEnemies),
    else it can freeze; no waypoint lies inside a wall cell;
  - patrol: every patrolling enemy keeps walking (> 20 u of its own movement in
    10 s, after a 15 s warm-up, held out of chase by the market safe zone);
  - chase (regression guard): a lone enemy chasing a player HELD IN PLACE (the
    enemy pipeline only -- no push-back; landing hits in play is physics' N2
    check) reaches attack windup within 10 s in >= 95% of trials;
  - return after a chase (F2): an enemy that chased the player past a wall gets
    back to its patrol route within 20 s in >= 95% of trials;
  - separation: separateEnemies() never leaves an enemy with a wall in its
    footprint (sites taken next to real enemies);
  - collision parity, both ways: a surface enemy can follow a path a surface
    player walked across cave-wall cells, and never walks into a plain wall
    cell that stopped the surface player;
  - awareness (F7): a cave enemy does not chase a player on the roof above it; a
    surface enemy does not chase a player in the cave below it; a cave enemy
    cannot reach a player on open ground away from every cave mouth (it walks
    out through rock today);
  - Cave Test start (N6): the first physics tick neither re-centres the window
    nor clears the cave enemies' underground flags;
  - across a window re-centre: underground enemies keep their Z; and a moving
    cave enemy stands on the cave floor before AND after a re-centre (after it,
    the flag D19 dropped stops the floor tracking -- a consumer of D19, which
    the persistence suite owns).

Review disposition: render owns F5's camera-distance walk-cycle observable; E7
remains a suspected cache issue rather than a game-lab verdict because the
reviewer's isolated-corner sweep reproduced 0/64 visible flickers (it did find
2/241 stale cache answers). The chase guard is deliberately named as an enemy-
pipeline test with a held player; physics owns N2's real-play hit observable.
The D19 flag-preservation verdict was removed because persistence owns it; this
suite retains the distinct moving-enemy floor-tracking consumer after re-centre.

Most of these FAIL on today's code on purpose; KNOWN_BUGS below names each with
its audit finding and header lines, plus a regex its FAIL detail must match so
a known bug failing for another reason (a PRECONDITION, a new mechanism) is not
"expected". A known bug that starts passing fails test_known_bugs_still_fail --
delete its entry, keep the check.

    python3 -m unittest tools.webui.tests.test_game_enemies -v
    HW1_GAME_PROBES=1 python3 -m unittest tools.webui.tests.test_game_enemies -v   # + mutation probes
    python3 -m tools.webui.game_lab enemies -v --endless-seeds 424242,777000,1,777 --seeds 12345,1   # seed sweep
"""

from __future__ import annotations

import unittest

from tools.webui.game_lab import probe_testcase, suite_testcase

KNOWN_BUGS: dict[str, tuple[str, str]] = {
    "enemies: no enemy spawns on a wall cell": (
        "phase-1 enemies finding (ruin order; not in the audit index): the spawn loop checks only that the "
        "enemy's cell is open (L5885), then the chunk's ruin walls are stamped later (L6179-6183) and can land "
        "on it -- a Wolf on endless 55555 stands inside a ruin wall and can never move",
        r"[1-9]\d*/\d+ enemies stand on a wall cell e\.g\. .*u from a \w+ ruin\)"),
    "enemies: no enemy on an open cell spawns with a wall inside its footprint (the game's movement radius)": (
        "audit F3; L1340 Brute size 1.4 -> movement radius 8*size*0.6 = 6.72 u (L11360, L11303/L11363/L11443) "
        "> the 6 u half-cell, and the spawn check L5885 tests only its own cell: 7/914 enemies, all surface "
        "Brutes (2 on the default worlds, 5 on the extra spawn windows)",
        r"[1-9]\d*/\d+ embedded \{\"surface\.tank\":\d+\} .*tank 6\.72"),
    "enemies: every enemy's patrol waypoints span at least twice the game's waypoint arrival radius": (
        "audit F1/D18; L5904-5905 / L5947-5948 draw two unvalidated waypoints within +-50 u / +-30 u, arrival "
        "radius 14 u at L11295: 226/914 enemies get a pair < 28 u apart, so once within 14 u of one waypoint "
        "they are within 14 u of both and patrolIdx flips forever",
        r"[1-9]\d*/\d+ patrols span < 28\.00 u \(arrival radius 14\.00 u"),
    "enemies: no patrol waypoint lies inside a wall cell": (
        "audit F1 (waypoints unvalidated, L5904/L5947; generatePatrolWaypoints L11211 checks the cell and LOS "
        "but Endless chunks never call it): 42/914 enemies, all surface, have a waypoint inside a wall cell. "
        "With F1 fixed, the endless-55555 Wolf the ruin order put on a wall cell still fails it (its first "
        "generated waypoint is its spawn point), so the F1 FIX probe carries the ruin-order fix too",
        r"[1-9]\d*/\d+ enemies have a waypoint inside a wall cell \{\"surface\":"),
    "enemies: every patrolling enemy keeps walking (> 20 u travelled per 10 s of patrol)": (
        "audit F1 + F3 + no wall slide at L11307: degenerate waypoint pairs (L11295-11297), wall hits that only "
        "advance patrolIdx, and embedded Brutes leave 73/340 patrolling enemies walking <= 20 u (most 0.0 u); "
        "every part of the F1+F3+slide FIX probe is needed (reviewer: F1+slide 2, F3+slide 78, F1+F3 3)",
        r"[1-9]\d*/\d+ frozen .*excluded: chased 0, left 350 u 0, died 0.* walked 0\.0"),
    "enemies: the first physics tick after a Cave Test start neither re-centres the window nor clears cave enemies' underground flag": (
        "Direct resetEndlessMode followed by step still re-centres the Cave Test window on its first tick. "
        "Underground flags now survive; this remaining startup-work finding is not the old flag-loss bug. "
        "The lab calls the reset API, not the newer UI preview path.",
        r"first tick re-centred the window [1-9]\d* times?; still underground: (\d+)/\1; .*re-centred the window 1 time"),
}

# Reusable probe sites.
_F1_VALIDATED_WAYPOINTS = (
    "          patrolWaypoints: en.patrolWaypoints.map(function(wp) {\n"
    "            return {x: wp.x - windowOriginX, y: wp.y - windowOriginY};\n          }),",
    "          patrolWaypoints: generatePatrolWaypoints(en.x - windowOriginX, en.y - windowOriginY, en.chaseRange),")
_F3_BRUTE_SIZE = (
    "tank:   {id:'tank',  name:'Brute',   color:'#cc0000',size:1.4,",
    "tank:   {id:'tank',  name:'Brute',   color:'#cc0000',size:1.2,")
_RUIN_ORDER = (
    "        if (ruinType === 'hut') {\n          cGrid[ruY * CHUNK_CELLS + ruX] = 0;\n        }\n",
    "        if (ruinType === 'hut') {\n          cGrid[ruY * CHUNK_CELLS + ruX] = 0;\n        }\n"
    "        cEnemies = cEnemies.filter(function (en) {\n"
    "          var egx = Math.floor((en.x - cx * CHUNK_SIZE) / cell), egy = Math.floor((en.y - cy * CHUNK_SIZE) / cell);\n"
    "          return !cGrid[egy * CHUNK_CELLS + egx];\n        });\n")
_D19_SAVE_FLAG = (
    "      patrolIdx: e.patrolIdx || 0, facing: e.facing || 0\n    });",
    "      patrolIdx: e.patrolIdx || 0, facing: e.facing || 0, underground: e.underground || false\n    });")
_CHASE_COND = "var chasing = !inMarketSafe && dist < e.chaseRange && dist > 10 && enemyCanSeePlayer(e);"

_ROOF = "enemies: a cave enemy does not chase a player standing on the cave roof"
_RROOF = "enemies: a surface enemy does not chase a player standing in the cave below it"
_LATERAL = "enemies: a cave enemy cannot reach a player on open ground away from every cave mouth"
_CHASE = ("enemies: a lone enemy chasing a player held in place (no push-back) reaches attack windup "
          "within 10 s in >= 95% of trials")
_EMBED = "enemies: no enemy on an open cell spawns with a wall inside its footprint (the game's movement radius)"
_SPAN = "enemies: every enemy's patrol waypoints span at least twice the game's waypoint arrival radius"
_WPWALL = "enemies: no patrol waypoint lies inside a wall cell"
_PATROL = "enemies: every patrolling enemy keeps walking (> 20 u travelled per 10 s of patrol)"
_F2 = "enemies: after chasing the player past a wall an enemy gets back to its patrol route within 20 s (>= 95% of trials)"
_N6 = "enemies: the first physics tick after a Cave Test start neither re-centres the window nor clears cave enemies' underground flag"
_FLOOR_BEFORE = "enemies: a cave enemy chasing through its cave stands on the cave floor under it"
_FLOOR_AFTER = "enemies: after a window re-centre a cave enemy chasing through its cave still stands on the cave floor"
_TRV = "enemies: a surface enemy can follow where a surface player walks across cave-wall cells"
_TRV_REV = "enemies: a surface enemy never walks into a plain wall cell that stops the surface player"

# Focused sensitivity controls for the shared-body migration. The obsolete
# F2/F4/F6 FIX snippets below have been replaced by defect reintroductions.
# Keep the controls separately runnable without the older investigation matrix.
MOTION_PROBES: list[tuple] = [
    ("BREAK F4: separation collides only at the actor centre",
     [("  moveSpatialActor(a,-px,-py,8*(a.enemyType.size||1)*0.6);",
       "  moveSpatialActor(a,-px,-py,0);"),
      ("  moveSpatialActor(b,px,py,8*(b.enemyType.size||1)*0.6);",
       "  moveSpatialActor(b,px,py,0);")], None,
     {"enemies: separation never pushes an enemy into a wall": "FAIL"}),
    ("BREAK F6: shared actor movement also applies the old height-blind wall veto",
     "function moveSpatialActor(entity,dx,dy,radius) {\n",
     "function moveSpatialActor(entity,dx,dy,radius) {\n"
     "  if (isInGridWall(entity.x+dx,entity.y+dy,radius)) return {hitX:true,hitY:true,status:'blocked'};\n",
     {_TRV: "FAIL", _TRV_REV: "PASS"}),
    ("BREAK F2: patrol rejects the full diagonal before the shared solver can slide",
     "  moveSpatialActor(e,pnx-e.x,pny-e.y,eRad*0.6);",
     "  if (!spatialBodyBlocked(spatialActorBody(e,eRad*0.6),pnx,pny)) "
     "moveSpatialActor(e,pnx-e.x,pny-e.y,eRad*0.6);",
     {_F2: "FAIL", _TRV: "PASS"}),
]

# (description, anchor, replacement, {check_id: expected verdict}) or the
# multi-site form (description, [(anchor, replacement), ...], None, {...}).
PROBES: list[tuple] = [
    ("FIX D19: saveEnemyStateToChunks keeps the underground flag",
     [_D19_SAVE_FLAG], None,
     {_FLOOR_AFTER: "PASS"}),
    ("FIX N6: Cave Test assembles its first window around the chunk the spawn teleport lands in",
     [("  // Build initial window\n  assembleWindow(0, 0);\n",
       "  // Build initial window\n  var _spawnCX = 0, _spawnCY = 0;\n"
       "  if (CAVE_TEST_MODE) {\n"
       "    var _n6 = generateCaveNetwork(0, 0);\n"
       "    if (_n6 && _n6.entrances && _n6.entrances.length > 0) {\n"
       "      var _n6e = _n6.entrances[0];\n"
       "      _spawnCX = Math.floor((_n6e.x - Math.cos(_n6e.angle) * 60) / CHUNK_SIZE);\n"
       "      _spawnCY = Math.floor((_n6e.y - Math.sin(_n6e.angle) * 60) / CHUNK_SIZE);\n"
       "    }\n  }\n"
       "  assembleWindow(_spawnCX, _spawnCY);\n")], None,
     {_N6: "PASS"}),
    ("FIX F3: Brute footprint fits inside half a cell (size 1.4 -> 1.2)",
     [_F3_BRUTE_SIZE], None,
     {_EMBED: "PASS"}),
    ("FIX F3 at the spawn site: require the 3x3 block around the spawn cell open (L5885)",
     "      if (!cGrid[ey * CHUNK_CELLS + ex]) {",
     "      if (" + " && ".join("!cGrid[(ey + %d) * CHUNK_CELLS + ex + %d]" % (dy, dx)
                              for dy in (-1, 0, 1) for dx in (-1, 0, 1)) + ") {",
     {_EMBED: "PASS"}),
    # The harness observes the radius passed to the shared movement adapter.
    ("FIX F3 in the movement code: every enemy wall test at eRad*0.5 (Brute 5.6 u < the 6 u half-cell)",
     [("  moveSpatialActor(e,pnx-e.x,pny-e.y,eRad*0.6);", "  moveSpatialActor(e,pnx-e.x,pny-e.y,eRad*0.5);"),
      ("      moveSpatialActor(e,kbx-e.x,kby-e.y,eRad*0.6);", "      moveSpatialActor(e,kbx-e.x,kby-e.y,eRad*0.5);"),
      ("      var eWallRad = eRad * 0.6;", "      var eWallRad = eRad * 0.5;")], None,
     {_EMBED: "PASS"}),
    ("FIX ruin order: drop chunk enemies a ruin wall was stamped onto",
     [_RUIN_ORDER], None,
     {"enemies: no enemy spawns on a wall cell": "PASS"}),
    # Recreate the actual historical height-blind consumer; the same-floor
    # control must keep working while both roof-separated cases fail.
    ("BREAK F7: restore height-blind enemy-player awareness",
     _CHASE_COND,
     _CHASE_COND.replace("enemyCanSeePlayer(e)", "hasLineOfSight(e.x, e.y, pos.x, pos.y)"),
     {_ROOF: "FAIL", _RROOF: "FAIL", _CHASE: "PASS"}),
    # Endless chunks get two raw random waypoints; the fixed levels already use the
    # validated generator (open cell, LOS, >= 0.18*chaseRange apart). Swap it in where
    # assembleWindow hands every enemy to the window.
    # + the ruin-order fix: generatePatrolWaypoints makes the spawn point the first
    # waypoint, so the endless-55555 Wolf standing on a ruin wall would keep a
    # waypoint in a wall.
    ("FIX F1: Endless enemies get validated waypoints from generatePatrolWaypoints (+ ruin order)",
     [_F1_VALIDATED_WAYPOINTS, _RUIN_ORDER], None,
     {_SPAN: "PASS", _WPWALL: "PASS"}),
    ("FIX patrol freeze: F1 validated waypoints + F3 Brute size + ruin order (shared movement supplies wall slide)",
     [_F1_VALIDATED_WAYPOINTS, _F3_BRUTE_SIZE, _RUIN_ORDER], None,
     {_PATROL: "PASS", _EMBED: "PASS", _SPAN: "PASS", _WPWALL: "PASS", _F2: "PASS"}),
    ("BREAK chase: enemies never close in",
     "      var moveSpeed = e.speed * 0.08;",
     "      var moveSpeed = 0;",
     {_CHASE: "FAIL"}),
    ("BREAK chase: enemies close in but stop 25 u out, short of the 6+8*size attack reach",
     _CHASE_COND,
     _CHASE_COND.replace("dist > 10", "dist > 25"),
     {_CHASE: "FAIL"}),
    ("BREAK re-centre: saveEnemyStateToChunks drops z",
     "      x: worldX, y: worldY, z: e.z || 0,",
     "      x: worldX, y: worldY, z: 0,",
     {"enemies: underground cave enemies keep their Z across a window re-centre": "FAIL"}),
    ("BREAK load: the game script throws at top level",
     "var _losCache = {};",
     "var _losCache = {}; throw new Error('probe: game load broken');",
     {"enemies: game script evaluates without throwing": "FAIL"}),
    # An over-permissive collision fix: patrol ignores walls. The forward parity
    # check turns PASS (the enemy walks through the cave-wall cell) -- which is why
    # the reverse check exists: it must catch this.
    ("BREAK collision: patrol steps ignore walls",
     "  moveSpatialActor(e,pnx-e.x,pny-e.y,eRad*0.6);",
     "  e.x=pnx; e.y=pny;",
     {_TRV_REV: "FAIL", _TRV: "PASS"}),
    ("BREAK floor tracking: an underground enemy's z follows the TOP walkable layer (the roof)",
     "  var feet=entityFeetSpatialZ(entity);",
     "  var feet=floorMesh?sampleSpatialSupportZ(entity.x,entity.y,NaN,false):entityFeetSpatialZ(entity);",
     {_FLOOR_BEFORE: "FAIL"}),
    ("BREAK floor tracking: enemy height freezes before and after a re-centre",
     [("    if (!body.airborne && body.updateFeet!==false && support.status==='walk') body.feetZ=support.feetZ;",
       "    /* mutation: floor tracking lost during movement */"),
      ("  if (support.status==='walk') body.feetZ=support.feetZ;",
       "  /* mutation: floor tracking lost during actor preparation */")], None,
     {_FLOOR_BEFORE: "FAIL", _FLOOR_AFTER: "FAIL"}),
]

EnemiesSuite = suite_testcase("enemies", KNOWN_BUGS, min_checks=18)
EnemiesProbes = probe_testcase("enemies", PROBES)
EnemiesMotionProbes = probe_testcase("enemies", MOTION_PROBES)
EnemiesMotionProbes.__name__ = EnemiesMotionProbes.__qualname__ = "Game_enemies_MotionProbes"

if __name__ == "__main__":
    unittest.main()
