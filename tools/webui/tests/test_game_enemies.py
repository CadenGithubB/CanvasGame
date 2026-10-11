"""Enemy AI in the Endless crawler: movement, collision and awareness.

Runs tools/webui/harness/game_enemies_harness.js against the shipping game in
components/hardwareone/WebPage_Games.h. The harness builds nine worlds (normal
Endless seeds 424242, 777000 and 777 at spawn, the same three seeds with the
window re-centred onto their nearest cave network, and Cave Test 12345, 424242
and 777 with caveEnemies on) plus ten extra spawn windows for the generation
survey only, and checks, aggregated over them:

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
    back to its patrol route within its OWN walking budget in every trial. The
    budget is the enemy's remembered-target search (NPC_PROFILES.enemy.memoryMs)
    plus 1.5 x (the chase path it walked + its spawn's distance to the waypoint
    the game is steering it to when the return starts, patrolWaypoints[
    patrolIdx]) at its patrol speed (speed x PATROL_FACTOR, measured from the
    game's own patrol step) slowed by the slowest water on that path (the chase
    path and the spawn-to-waypoint line): retracing the chase and walking the
    spawn's clear sight line to that waypoint is a physical return path, and
    1.5x allows slides and route-planning delay. (An earlier budget used the
    spawn's NEAREST waypoint; with F1 repaired the spawn is waypoint 0, so it
    left out the walk to the waypoint actually targeted and failed correctly
    patrolling enemies.) The budget is per enemy, so it is NOT the old fixed
    20 s: it is looser for slow or wading enemies (17/44 baseline budgets exceed
    20 s, max 58 s) and tighter for fast ones; the detail lists every return
    later than 20 s with its route failures, so a route-planning delay the
    budget absorbs stays visible (KNOWN_BUGS names the two baseline cases).
    A trial whose chase ends within the arrival radius of a waypoint would
    return in 0 s and is excluded. Every subject must pass a positive control:
    unchased, from its spawn point, it walks to a waypoint at least twice the
    arrival radius away (so a spawn that is itself a waypoint cannot pass in
    0 s) within 1.5 x that distance at its patrol speed. A trial that misses its
    budget is walked on to a 60 s horizon so the detail tells stuck from slow.
    The trial set is fixed by the seeds, so a percentage threshold would buy no
    noise tolerance and would only hide permanently stuck enemies. The "FIX
    every patrol defect" probe (F1+F3+ruin order+R1+R2) passes it: the contract
    any correct implementation meets;
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
    cave enemy stands on the cave floor before AND after a re-centre (floor
    tracking needs a cave-stratum marker the re-centre's save pass keeps: the
    underground flag, repaired with D19 -- which the persistence suite owns --
    or the chamber spawn id; the BREAK probe that drops both fails this check,
    while dropping the flag alone does not reach it).

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

The harness steps enemies with gameUpdate's prologue (spatialSimulationTick++
and npcNavigationTick()) and resets an enemy's shared brain (e.npc) between
uses; without the prologue the route planner never advances and every enemy
that needs a route stays frozen (harness defect fixed in October 2026).

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
        "advance patrolIdx, and embedded Brutes leave 91/414 patrolling enemies walking <= 20 u (110/414 before the harness tick fix; most 0.0 u); "
        "every part of the F1+F3+slide FIX probe is needed (reviewer: F1+slide 2, F3+slide 78, F1+F3 3)",
        r"[1-9]\d*/\d+ frozen .*excluded: chased 0, left 350 u 0, died 0.* walked 0\.0"),
    "enemies: the first physics tick after a Cave Test start neither re-centres the window nor clears cave enemies' underground flag": (
        "Direct resetEndlessMode followed by step still re-centres the Cave Test window on its first tick. "
        "Underground flags now survive; this remaining startup-work finding is not the old flag-loss bug. "
        "The lab calls the reset API, not the newer UI preview path.",
        r"first tick re-centred the window [1-9]\d* times?; still underground: (\d+)/\1; .*re-centred the window 1 time"),
    "enemies: after chasing the player past a wall an enemy gets back to its patrol route within its own walking budget (every trial)": (
        "R1 + R2, route planning on slopes. R1: Endless patrol waypoints are plain {x,y} with no height "
        "(05-endless-world.js chunk spawns), so _patrolEnemy passes wpFeet = entityFeetSpatialZ(e), the enemy's "
        "CURRENT feet height (11-enemies.js), as the goal storey; the planner's final connection needs "
        "|feetZ - requiredZ| <= .01 (10-npc-navigation.js npcNavProbe), so it can never connect to a waypoint on "
        "ground at another height, and npcNavigateToward discards the route whenever that 'goal' height changes as "
        "the enemy walks. R2: npcNavProbe rejects any hop that changes height unless it is axis-aligned, and the "
        "first hop from the enemy's off-grid position to a neighbouring cell centre never is, so on a slope every "
        "request fails after expanding only its root (69 requests, 69 nodes expanded, 0 routes; a 60000-node "
        "budget changes nothing). While the route is 'failed', _patrolEnemy flips patrolIdx every frame and the "
        "enemy stands still: 42/44 return; endless 777000 cave Brute@-5250,738 (43.8 u from its route after its "
        "21.0 s budget, route failed 93% of frames, 1057 flips) and endless 777 cave Scout@16446,-702 (51.7 u after "
        "8.5 s, route failed 41% / pending 41%) are both still stuck at 60 s, and both walk their route unchased "
        "from spawn (4.0 s and 1.1 s). FIX R1+R2 passes it (44/44), and so does every patrol fix together "
        "(F1+F3+ruin order+R1+R2, 42/42); R1 alone leaves only the Brute stuck (43/44) and R2 alone leaves the "
        "same two as baseline (42/44); F1+F3+ruin order alone leaves the Brute stuck and two enemies late (39/42). "
        "The budget is per enemy, not the old fixed 20 s: 17/44 budgets exceed 20 s (max 58.0 s, a Brute wading "
        "at 0.55 speed), and two baseline returns take longer than 20 s and pass only because of that: 424242 "
        "cave Brute@282,2682 20.2 s (19.9 s under FIX R1+R2, water-slowed) and 777000 cave Brute@-5166,-30 22.5 s "
        "(16.3 s under FIX R1+R2), so part of R1's delay sits inside the budget; the detail lists every return "
        "later than 20 s with its route failures. The navigation code is unchanged since main, whose page shows "
        "the same two stuck enemies. Both stuck enemies sit in windows re-centred on the nearest cave network, so a "
        "change that moves cave networks moves them out of the fixture: under cave geometry's FIX D16 (an "
        "independent cave gate) 52/52 return and this check reads PASS with R1 and R2 untouched. After such a "
        "change a PASS here is not a route-planning repair until stuck subjects are found again",
        r"[1-9]\d*/\d+ returned .*stuck: .*after \d+\.\d s \(route failed [1-9]\d*% / pending \d+% of frames, "
        r"[1-9]\d* waypoint flips; still stuck at 60 s\)"),
}

# Reusable probe sites.
# F1 fix as the fixed levels do it, made storey-aware: generatePatrolWaypoints
# (open cell, line of sight, >= 0.18*chaseRange apart) keeping only waypoints
# within 1 h of the spawn's own support, and patrolIdx reset (the generator
# returns 2-4 points, so a saved index can point past the end).
_F1_VALIDATED_WAYPOINTS = (
    "          patrolWaypoints: en.patrolWaypoints.map(function(wp) {\n"
    "            return {x: wp.x - windowOriginX, y: wp.y - windowOriginY};\n"
    "          }),\n"
    "          patrolIdx: en.patrolIdx,",
    "          patrolWaypoints: (function () {\n"
    "            var _sx = en.x - windowOriginX, _sy = en.y - windowOriginY;\n"
    "            function _h(x, y) { var i = meshCellAt(x, y), b = NaN; if (i < 0) return NaN;\n"
    "              for (var li = 0; li < floorMesh.layerCount[i]; li++) { var t = meshLayerType(floorMesh, i, li); "
    "if (t !== 1 && t !== 3 && t !== 4) continue;\n"
    "                var z = meshLayerHeight(floorMesh, i, li); if (isNaN(b) || (en.underground ? z < b : z > b)) b = z; } "
    "return b; }\n"
    "            var _h0 = _h(_sx, _sy);\n"
    "            return generatePatrolWaypoints(_sx, _sy, en.chaseRange).filter(function (w) { "
    "return Math.abs(_h(w.x, w.y) - _h0) <= 1; });\n"
    "          })(),\n"
    "          patrolIdx: 0,")
_F3_BRUTE_SIZE = (
    "tank:   {id:'tank',  name:'Brute',   color:'#cc0000',size:1.4,",
    "tank:   {id:'tank',  name:'Brute',   color:'#cc0000',size:1.2,")
_RUIN_ORDER = (
    "        if (ruinType === 'hut') {\n          cGrid[ruY * CHUNK_CELLS + ruX] = 0;\n        }\n",
    "        if (ruinType === 'hut') {\n          cGrid[ruY * CHUNK_CELLS + ruX] = 0;\n        }\n"
    "        cEnemies = cEnemies.filter(function (en) {\n"
    "          var egx = Math.floor((en.x - cx * CHUNK_SIZE) / cell), egy = Math.floor((en.y - cy * CHUNK_SIZE) / cell);\n"
    "          return !cGrid[egy * CHUNK_CELLS + egx];\n        });\n")
# D19's underground half is repaired (saveEnemyStateToChunks saves
# `underground: e.underground || false`). For chamber enemies the flag is no
# longer the only stratum marker: entityFeetSpatialZ also reads caveSpawnId, so
# dropping the flag alone (persistence's D19 BREAK) leaves the floor tracking
# below intact (the check still passes; seen in the October refresh). The
# BREAK therefore drops both markers the save pass carries.
_D19_DROP_STRATUM = ("caveSpawnId: e.caveSpawnId || null, underground: e.underground || false,",
                     "caveSpawnId: null, underground: false,")
# Fix sites R1 and R2 for the F2 route-planning bug (see KNOWN_BUGS).
_R1_WAYPOINT_FEET = (
    "  if (npcNavigateToward(e,wp.x,wp.y,wpFeet,e.speed*.38,dt===undefined?.08:dt,eRad*.6,0)) return 1;",
    "  var _navFeet=wpFeet;\n"
    "  if(!Number.isFinite(wp.feetZ)){var _wb=spatialActorBody(e,eRad*.6),_ws=spatialQuerySupport({x:wp.x,y:wp.y,"
    "feetZ:_wb.feetZ,radius:_wb.radius,height:_wb.height,stepHeight:1000,trackFloor:_wb.trackFloor},wp.x,wp.y);"
    "if(_ws.status==='walk')_navFeet=_ws.feetZ;}\n"
    "  if (npcNavigateToward(e,wp.x,wp.y,_navFeet,e.speed*.38,dt===undefined?.08:dt,eRad*.6,0)) return 1;")
_R2_ROOT_HOP = (
    "  if(Math.abs(body.feetZ-from.z)>.01 && Math.abs(x-from.x)>.00001 && Math.abs(y-from.y)>.00001)return null;\n",
    "  if(from.parent && Math.abs(body.feetZ-from.z)>.01 && Math.abs(x-from.x)>.00001 && Math.abs(y-from.y)>.00001)return null;\n")
_PATROL_NAV = _R1_WAYPOINT_FEET[0]
# F2 witnesses: the stuck list closes the detail, one "...; still stuck at 60 s)"
# entry per enemy that never reaches its route.
_BRUTE_STUCK = r"endless 777000 cave surface\.tank@-5250,738 stopped [^;]+; still stuck at 60 s\)"
_SCOUT_STUCK = r"endless 777 cave surface\.fast@16446,-702 stopped [^;]+; still stuck at 60 s\)"
_STUCK_ONLY_BRUTE = r"; stuck: " + _BRUTE_STUCK + r"$"
_STUCK_BRUTE_AND_SCOUT = r"; stuck: " + _BRUTE_STUCK + r"; " + _SCOUT_STUCK + r"$"

_ROOF = "enemies: a cave enemy does not chase a player standing on the cave roof"
_RROOF = "enemies: a surface enemy does not chase a player standing in the cave below it"
_LATERAL = "enemies: a cave enemy cannot reach a player on open ground away from every cave mouth"
_CHASE = ("enemies: a lone enemy chasing a player held in place (no push-back) reaches attack windup "
          "within 10 s in >= 95% of trials")
_EMBED = "enemies: no enemy on an open cell spawns with a wall inside its footprint (the game's movement radius)"
_SPAN = "enemies: every enemy's patrol waypoints span at least twice the game's waypoint arrival radius"
_WPWALL = "enemies: no patrol waypoint lies inside a wall cell"
_PATROL = "enemies: every patrolling enemy keeps walking (> 20 u travelled per 10 s of patrol)"
_F2 = ("enemies: after chasing the player past a wall an enemy gets back to its patrol route within its own walking "
       "budget (every trial)")
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
    # The F2 check fails at baseline on R1/R2, so a BREAK that only expects FAIL
    # would be vacuous: the historical patrol replaces the navigation call (R1's
    # site) on top of FIX R2 (the FIX R1+R2 probe in PROBES is its PASS
    # control), and the detail regex pins its own witness: an enemy stuck with
    # no route use at all, flipping waypoints. Every baseline stuck enemy has
    # route failures, so the baseline detail does not match.
    ("BREAK F2 (on top of FIX R2): patrol has no route and no slide, rejects the whole step and flips waypoints",
     [_R2_ROOT_HOP,
      (_PATROL_NAV,
       "  var _st=Math.min(wpDist,e.speed*.38*(dt===undefined?.08:dt)),_nx=e.x+wpDx/wpDist*_st,_ny=e.y+wpDy/wpDist*_st;\n"
       "  if (!spatialBodyBlocked(spatialActorBody(e,eRad*.6),_nx,_ny)) { moveSpatialActor(e,_nx-e.x,_ny-e.y,eRad*.6); return 1; }\n"
       "  e.patrolIdx = ((e.patrolIdx || 0) + 1) % e.patrolWaypoints.length; return 0;")], None,
     {_F2: ("FAIL", r"stuck: .*\(route failed 0% / pending 0% of frames, [1-9]\d* waypoint flips; still stuck at 60 s\)"),
      _TRV: "PASS"}),
]

# (description, anchor, replacement, {check_id: expected verdict}) or the
# multi-site form (description, [(anchor, replacement), ...], None, {...}).
PROBES: list[tuple] = [
    # The old FIX D19 appended a second `underground` key to an object that
    # already saves the flag, so it changed nothing; the repaired save is now
    # shown to matter by putting the loss back (see _D19_DROP_STRATUM).
    ("BREAK D19 + caveSpawnId: saveEnemyStateToChunks drops both cave-stratum markers on a re-centre",
     [_D19_DROP_STRATUM], None,
     {_FLOOR_AFTER: "FAIL"}),
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
    ("FIX F3 in the movement code: every enemy body/wall radius at eRad*0.5 (Brute 5.6 u < 6 u half-cell)",
     [(_PATROL_NAV, _PATROL_NAV.replace("eRad*.6", "eRad*.5")),
      ("      moveSpatialActor(e,kbx-e.x,kby-e.y,eRad*0.6);", "      moveSpatialActor(e,kbx-e.x,kby-e.y,eRad*0.5);"),
      ("if(npcNavigateToward(e,pursuit.x,pursuit.y,pursuit.feetZ,moveSpeed,dt,eRad*.6,10))moved++;",
       "if(npcNavigateToward(e,pursuit.x,pursuit.y,pursuit.feetZ,moveSpeed,dt,eRad*.5,10))moved++;"),
      ("    var eBody=spatialActorBody(e,eRad*0.6);", "    var eBody=spatialActorBody(e,eRad*0.5);")], None,
     {_EMBED: "PASS"}),
    ("FIX ruin order: drop chunk enemies a ruin wall was stamped onto",
     [_RUIN_ORDER], None,
     {"enemies: no enemy spawns on a wall cell": "PASS"}),
    # Recreate the actual historical height-blind consumer; the same-floor
    # control must keep working while both roof-separated cases fail. Player
    # perception now runs through npcTargetGeometry's 3D spatialRaycast; the
    # probe hands the player case back to the 2D hasLineOfSight.
    ("BREAK F7: restore height-blind enemy-player awareness (player perception uses the 2D hasLineOfSight)",
     "  return spatialRaycast(a,b).status==='clear';\n}",
     "  return target===pos ? hasLineOfSight(actor.x,actor.y,target.x,target.y) : spatialRaycast(a,b).status==='clear';\n}",
     {_ROOF: "FAIL", _RROOF: "FAIL", _CHASE: "PASS"}),
    # Endless chunks get two raw random waypoints; the fixed levels already use the
    # validated generator (open cell, LOS, >= 0.18*chaseRange apart). Swap it in where
    # assembleWindow hands every enemy to the window.
    # + the ruin-order fix: generatePatrolWaypoints makes the spawn point the first
    # waypoint, so the endless-55555 Wolf standing on a ruin wall would keep a
    # waypoint in a wall.
    ("FIX F1: Endless enemies get storey-aware validated waypoints from generatePatrolWaypoints, patrolIdx "
     "reset (+ ruin order)",
     [_F1_VALIDATED_WAYPOINTS, _RUIN_ORDER], None,
     {_SPAN: "PASS", _WPWALL: "PASS"}),
    # F2 still fails under this probe: the route-planning bug (R1/R2) keeps the
    # Brute stuck (and two enemies late, re-planning while their goal height
    # moves). The probe after it adds R1+R2 and passes F2.
    ("FIX patrol freeze: F1 storey-aware validated waypoints, patrolIdx reset + F3 Brute size + ruin order "
     "(shared movement supplies wall slide)",
     [_F1_VALIDATED_WAYPOINTS, _F3_BRUTE_SIZE, _RUIN_ORDER], None,
     {_PATROL: "PASS", _EMBED: "PASS", _SPAN: "PASS", _WPWALL: "PASS", _F2: ("FAIL", r"stuck: .*" + _BRUTE_STUCK)}),
    # With F1 repaired the spawn is waypoint 0, so the F2 budget must cover the
    # walk to the waypoint the game actually steers to and the unchased
    # control must walk away from the spawn: this is the contract any correct
    # implementation meets once every patrol defect is repaired. Cross-suite
    # matrix (third October 2026 pass, this probe alone against all 12
    # non-smoke suites, jsc): no collateral PASS->FAIL flip; the one collateral
    # flip is "no enemy spawns on a wall cell" -> PASS, from its ruin-order part.
    ("FIX every patrol defect: F1 storey-aware validated waypoints + F3 Brute size + ruin order + R1 + R2",
     [_F1_VALIDATED_WAYPOINTS, _F3_BRUTE_SIZE, _RUIN_ORDER, _R2_ROOT_HOP, _R1_WAYPOINT_FEET], None,
     {_F2: "PASS", _PATROL: "PASS", _EMBED: "PASS", _SPAN: "PASS", _WPWALL: "PASS"}),
    ("BREAK chase: enemies never close in",
     "      var moveSpeed=e.speed;\n",
     "      var moveSpeed=0;\n",
     {_CHASE: "FAIL"}),
    # The chase stop distance is the pursuit call's last argument and the reach
    # is meleeRange = 16+8*size; route following walks to the goal node with
    # stop 0, so the stop must also hold inside npcNavigateToward.
    ("BREAK chase: enemies close in but stop 3 u outside their own melee reach (direct steering and routes)",
     [("if(npcNavigateToward(e,pursuit.x,pursuit.y,pursuit.feetZ,moveSpeed,dt,eRad*.6,10))moved++;",
       "if(npcNavigateToward(e,pursuit.x,pursuit.y,pursuit.feetZ,moveSpeed,dt,eRad*.6,meleeRange+3))moved++;"),
      ("function npcNavigateToward(actor,x,y,feetZ,speed,dt,radius,stopDistance) {\n  npcNavigationTick();\n",
       "function npcNavigateToward(actor,x,y,feetZ,speed,dt,radius,stopDistance) {\n  npcNavigationTick();\n"
       "  if(stopDistance && Math.hypot(x-actor.x,y-actor.y)<=stopDistance)return false;\n")], None,
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
    ("BREAK collision: patrol steps ignore walls (positions stepped directly)",
     _PATROL_NAV,
     "  var _st=Math.min(wpDist,e.speed*.38*(dt===undefined?.08:dt)); e.x+=wpDx/wpDist*_st; e.y+=wpDy/wpDist*_st; return 1;",
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
    # F2 (KNOWN_BUGS): both route-planning fixes are needed, and each alone is not enough.
    # The partial fixes FAIL like the baseline, so their witness (WHICH enemies
    # stay stuck) is pinned with a detail regex.
    ("FIX R1+R2: patrol plans to its waypoint's own support height; the planner root may change height on its "
     "first off-grid hop",
     [_R2_ROOT_HOP, _R1_WAYPOINT_FEET], None,
     {_F2: "PASS"}),
    ("PARTIAL FIX R1 only (witness that R2 is needed): the Brute on the slope stays stuck, the Scout returns",
     [_R1_WAYPOINT_FEET], None,
     {_F2: ("FAIL", _STUCK_ONLY_BRUTE)}),
    ("PARTIAL FIX R2 only (witness that R1 is needed): the same two enemies as baseline stay stuck",
     [_R2_ROOT_HOP], None,
     {_F2: ("FAIL", _STUCK_BRUTE_AND_SCOUT)}),
]

EnemiesSuite = suite_testcase("enemies", KNOWN_BUGS, min_checks=18)
EnemiesProbes = probe_testcase("enemies", PROBES)
EnemiesMotionProbes = probe_testcase("enemies", MOTION_PROBES)
EnemiesMotionProbes.__name__ = EnemiesMotionProbes.__qualname__ = "Game_enemies_MotionProbes"

if __name__ == "__main__":
    unittest.main()
