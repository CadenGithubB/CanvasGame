"""Endless crawler: STATIC geometry invariants of the assembled world around caves
(WebPage_Games.h). Nothing walks here -- caves_transition owns the dynamic walks.

The harness (tools/webui/harness/game_caves_geometry_harness.js) builds each
world with the game's own start path, then only READS what the game computed --
the window floorMesh layer stacks, surfaceH, grid[], endlessCaveNetworks, the
per-chunk meshes generateChunk returns -- and calls the game's own queries
(getFloorHeightAt, getWalkableLayerTopAt, queryCaveGeometry, generateChunk,
generateCaveNetwork). Geometry is never re-derived.

Worlds: Cave Test seeds 12345, 1, 777, 424242 (--seeds overrides) plus normal
Endless seeds 424242, 999983 and 123 (--endless-seeds overrides), each
re-centred on its nearest cave network. Cave Test forces plains and one network
at region (0,0), so it is not representative on its own; seed 123 is in the
defaults because it is the one that reaches N14. `--networks N|all` visits the
N nearest networks per Endless seed instead of one (a triage sweep; game_lab's
CLI does not forward it, so pass it through
game_lab.run_harness("caves_geometry", ["--networks", "all"])).

What is checked, and why ANY correct implementation meets the threshold:

  layer stacks      sorted by Z; the lowest layer walkable (a ceiling under all
                    ground is not a ceiling of anything); getFloorHeightAt, the
                    "ground here" query ~25 systems use, never returns a
                    ceiling; every cap strictly above the ceiling it covers.
  headroom          ceiling minus the floor directly below it >= EYE_H 2.4 h in
                    every open (non grid[] wall) cell: the camera eye sits 60
                    render units = 2.4 h above the feet (cameraZ = 60 + 25h,
                    L454; layers render at 25z), so less is an eye inside rock.
  lifted caps (E4)  a cap the clamp at L6693 lifted above the natural surface
                    never stands more than STEP_UP 1.0 h (L7844) above the open
                    ground beside it where the natural surface would not have:
                    a correct roof over a cave is the terrain that was there.
  entrance paths    per entrance, the axis from along +470 to the arch, then the
                    corridor starting at the entrance for 150 u (6 u samples).
                    Roof: the roof (ceiling or cap) starts no more than 40 u
                    outside the arch, which is drawn AT the entrance point
                    (drawCaveEntrance3D L16411). The game's own
                    getWalkableLayerTopAt carried cell to cell from the TOP
                    walkable at +470 (where a player arriving over the surface
                    is): the layer it stands on never changes by more than
                    STEP_UP between neighbouring cells, since a path has to be
                    walkable both ways; it reaches the cave floor with no idx -1
                    ("unsupported") answer; and carried back out it reaches a
                    layer with open sky above it at +470 with none either. When
                    the picker has no layer at or below the player (a step up
                    it refuses), the chain stops: carrying on would carry on
                    from the h=0 sentinel, which is physics' D11.
  mouth             ceiling and cap layers exactly match queryCaveGeometry's
                    covered footprint at the stamped mesh corner. Exterior
                    approaches have neither; the covered side has both.
  floor under roof  between 4-neighbour open cells that both have a ceiling the
                    lowest walkable layer never steps more than STEP_UP; and a
                    chunk border adds no seam (the worst border "spike" -- step
                    minus the larger continuing step either side -- stays within
                    0.25 h of the same statistic on lines 10/20/30 cells into
                    each chunk, 3x the samples of the same geometry).
  surface seam      the same border-vs-control spike statistic on surfaceH (the
                    open ground, and what every cap is built from) within 300 u
                    of an entrance. generateChunk used to blur that ground chunk
                    by chunk (E2, a per-chunk 3x3 blur that skipped neighbours
                    outside the chunk); that blur has been deleted and entrance
                    shaping is now sampled in world space, so this check guards
                    against chunk-by-chunk surface shaping coming back.
                    Tolerance 0.05 h: a seamless surface puts border lines in
                    the same distribution as control lines; 0.05 h is 2.5x the
                    largest control spike in any default world (<= 0.020 h) and
                    under half the smallest border spike the old blur left
                    (0.113 h). The surface is judged BEFORE the water system's
                    river carve: carveWaterRivers (06-water.js) reshapes
                    surfaceH over the whole window after assembly, knows
                    nothing of chunks, and its levees land on border and control
                    lines alike (up to 0.49 h). It records every value it
                    changed in mesh.waterCarveSaved (what _waterRestoreCarve
                    writes back), and that record put back equals a
                    water-off rebuild of the same window cell for cell. River
                    levees are excluded here on purpose and judged by the levee
                    check. A window that carries river water but no record is
                    a PRECONDITION, never a pass; a window with no river keeps
                    no record because nothing was carved. The carved surface's
                    spikes stay METRICs.
  river levees      between 4-neighbour single-layer ground points that the
                    river carve changed, the carved ground never steps more than
                    STEP_UP 1.0 h where the natural ground (the carve record)
                    stepped no more than that: the carve must not build a step
                    the player's picker refuses. Default worlds plus three fixed
                    windows a seed sweep found to reach the defect (Endless 3 at
                    (9611,-6196), 777000 at (7954,3843), 8 at (3856,3691));
                    the fixture must reach >= 1000 carved pairs and >= 50 levee
                    points raised >= 0.5 h. Each failing pair names the
                    picker's answer (getWalkableLayerTopAt) for a player
                    stepping from the low point onto the high one.
  truncation        every mesh cell of every chunk that could hold a network,
                    where queryCaveGeometry asked with every network of the 5x5
                    surrounding regions says "cave" (fade >= 0.05), was stamped
                    by generateChunk (a ceiling, or the floor moved off the
                    pre-stamp surface snapshot). Independent of the ceiling
                    policy, so a D6 fix does not read as truncation. The chunks
                    scanned cover each corridor and chamber (+108 u) and each
                    entrance's approach footprint (sampleCavePortal's reach:
                    approachLength out of the mouth, halfWidth + 42 + 48 u
                    either side). winding-chamber-v1 networks stay inside their
                    region; only the descending approach reaches 480 u out of
                    the mouth, into the neighbouring region, so without the
                    approach box no truncation of a neighbouring region's
                    network could be seen.
  walls in water    at most 0.25% of water cells carry a grid wall, over chunks
                    -8..8 of every Endless seed. The generator's own rule is
                    "skip walls in water zones" (L4986-4987); its water proxy
                    (terrainNoise + geography at the wall cell centre) is not the
                    water rule (cHeights < -3.0 at the mesh corner), so a few
                    boundary cells may disagree -- with the D17 fix applied it is
                    0 of 39,758 today, 0.25% leaves room for that.
  mouth bearing     the winding-chamber-v1 recipe fixes the entrance count at 1
                    (`entrances: [entrance]`), so the old "some networks have
                    exactly one entrance" contract can no longer fail and is
                    retired. D16's shared stream (rng2 and rng are both
                    chunkRng(rx, ry, 100), and a network exists only when the
                    30% gate draws rng2() <= 0.30) still shows: the first rng()
                    draw is then <= 0.30 and entryAngle = rng() * 2 pi stays in
                    [0, 108 deg]. Each region's network comes from its own
                    seed, so an unbiased generator gives independent, uniform
                    bearings. A fixed census (normal Endless seeds 424242,
                    999983, 123, 777000, 777, 1, 3, 8, 55555, 31337, 12345,
                    98765, 2024, 4242, 99; every network within 20 regions of
                    spawn, about 450; --endless-seeds does not change it) is
                    binned in 12 x 30 deg bins of the mouth's bearing from its
                    region centre, and the chi-square against uniform must be
                    at most 31.26, its 0.999 quantile on 11 degrees of freedom:
                    a correct generator fails with probability 0.001. At least
                    240 networks are required (20 expected per bin). This
                    replaced a one-sided contract ("some bearing in 180-360
                    deg") that a gate drawn from chunkRng stream 101 passed
                    although its first draw still tracks stream 100's: that
                    census has 303 of 447 mouths in 180-360 deg and chi-square
                    97.3. A gate drawn from a hash of the region's own seed
                    gives 7.5.

METRIC lines (never verdicts): per-world bad counts for the aggregated checks,
roof start per entrance, caps raised above the natural surface and by how much,
grid-wall cells under a cave ceiling (F6), cells where queryCaveGeometry gives
a ceilZ but no ceiling was stamped, interior step maxima, border/control seam
spikes (of the surface before and after the river carve), points the carve
moved, levee steps per window, how close any network's feather comes to
generateChunk's 3x3-region reach, networks without exactly one entrance, and
cave rarity in normal Endless.

Checks with no probe of their own: none -- every check below is flipped by at
least one probe in PROBES.

Not checked here, on purpose:
  - F6 (grid walls left standing under a cave ceiling, fade <= 0.3): only a
    METRIC. Its observable -- the surface player and enemies disagree about
    those walls -- is owned by enemies ("a surface enemy can follow where a
    surface player walks across cave-wall cells"); whether a wall under a cave
    ceiling is itself wrong (a pillar) is a design choice, so a geometry-only
    verdict would encode a guess.
  - D11 (the picker's {topH: 0, idx: -1} sentinel): owned by physics. The walk
    checks stop at it instead of carrying its fabricated h=0 forward.
  - An approach that runs through another part of its own network (Cave Test
    777 entrance #1: the +470 start is a chamber feather, along 350-404 a
    corridor core): not a check of its own -- it is the roof-start quantity at
    its extreme ("the whole approach is roofed"), and the path-step and
    walk-out checks judge what it does to a player (a 7.90 h plunge through the
    cap hole; ending under a roof). METRIC entrances_with_roofed_approach_start.

Run:
    python3 -m unittest tools.webui.tests.test_game_caves_geometry -v
    HW1_GAME_PROBES=1 python3 -m unittest tools.webui.tests.test_game_caves_geometry -v
    python3 -m tools.webui.game_lab caves_geometry -v
    python3 -m tools.webui.game_lab caves_geometry --seeds 12345,1,777,424242 --endless-seeds 424242,999983,123
"""

from __future__ import annotations

import unittest

from tools.webui.game_lab import probe_testcase, suite_testcase

_P = "caves_geometry: "

C_LOAD = _P + "game script evaluates without throwing"
C_WORLD = _P + "every world under test has a cave entrance inside its window"
C_SORTED = _P + "every cell's layer stack is sorted by ascending Z"
C_LOWEST = _P + "the lowest layer of every cell is walkable ground, never a ceiling"
C_GFH = _P + "getFloorHeightAt never returns a ceiling's height"
C_HEAD = _P + "every open cell under a ceiling has eye-height (LAB.EYE_H 2.4 h) headroom above its cave floor"
C_CAP = _P + "every surface cap sits strictly above the ceiling it covers"
C_E4 = _P + "a cap lifted above the natural surface never stands more than STEP_UP (1.0 h) above the open ground beside it"
C_ROOF = _P + "the cave roof starts no more than 40 u outside the entrance arch"
C_STEP = (_P + "walking in along every entrance path, the floor the player stands on never changes by more "
          "than STEP_UP (1.0 h) between neighbouring cells")
C_IN = _P + "getWalkableLayerTopAt carries a player from the surface down to the cave floor with no unsupported step"
C_OUT = _P + "getWalkableLayerTopAt carries a player from the cave floor back out to the surface with no unsupported step"
C_MOUTH = _P + "ceiling and cap layers exactly match queryCaveGeometry's covered footprint"
C_INTERIOR = _P + "the floor under a cave ceiling never steps more than STEP_UP (1.0 h) between neighbouring open cells"
C_SEAM = _P + "chunk borders add no seam to the floor under cave ceilings"
C_SURF = _P + "chunk borders add no seam to the ground surface within 300 u of a cave entrance"
C_TRUNC = (_P + "every chunk stamps every cell that queryCaveGeometry over all nearby networks calls cave "
           "(no network truncation)")
C_WATER = _P + "no more than 0.25% of water cells carry a grid wall"
C_LEVEE = (_P + "river carving never leaves a step the player cannot climb (STEP_UP 1.0 h) between neighbouring "
           "open ground points where the natural ground had none")
C_ANGLE = (_P + "normal Endless cave mouth bearings from the region centre are uniform (chi-square over 30-degree "
           "bins of the bearing census at most 31.26, p = 0.001)")
# Retired: winding-chamber-v1 always builds one entrance, so this contract can
# no longer fail. Its id is kept only to key the audit history below; D16 is
# now judged by C_ANGLE.
C_ENTCOUNT = _P + "normal Endless generates some cave networks with exactly one entrance"

AUDIT_KNOWN_BUGS: dict[str, tuple[str, str]] = {
    C_LOWEST: (
        "audit D6: chunk stamping lerps the floor toward the surface by fade (L5618) but writes "
        "the ceiling at full value wherever fade>0 (L5621, queryCaveGeometry L4756-4771); in the "
        "feather the ceiling ends up below the floor and the cap insertion re-sorts the stack "
        "(assembleWindow L6724) so l0 is the CEILING: 10,989 of 63,476 ceilinged cells over the "
        "seven default worlds (1,226/6,189 on Cave Test 12345)",
        r"\b[1-9]\d*/\d+ ceilinged cells have a ceiling lowest e\.g\. \([-\d]+,[-\d]+\) 2@"),
    C_GFH: (
        "audit D6: getFloorHeightAt returns l0TopZ blindly (L7816), which is the ceiling in every "
        "re-sorted feather cell above (10,989 cells); it also returns the cave floor under a cap in "
        "~52,000 more (detail only). The BREAK probe that skips the re-sort turns this check PASS, "
        "which is the mechanism: the ceiling only becomes l0 through the sort",
        r"ceilingZ=[1-9]\d* caveFloorUnderCap=\d+ e\.g\. \([-\d]+,[-\d]+\) returned \S+ stack 2@"),
    C_HEAD: (
        "audit D2: same cause as D6 -- floor lerped by fade (L5618), ceiling stamped whole "
        "(L5621) and clamped only to floor+2.0 (L4758); 9,741 of 52,300 open ceilinged cells "
        "have < 2.4 h, down to ~0.00 h (e.g. 1@-1.47 2@-1.47 at (1230,1218), Cave Test 12345). "
        "The causal FIX probe (ceiling = lerped floor + the record's own headroom) passes it",
        r"[1-9]\d*/\d+ cells, min headroom [0-2]\.\d\d h"),
    C_E4: (
        "audit E4 (confirmed here): the depth gate uses the 21x21 MAX of the chunk-clipped surface "
        "(L5595-5604), so over a valley the ceiling may sit above the local surface; the clamp "
        "(L6693) then lifts the cap to ceiling+0.25, above the natural terrain, and where the roof "
        "ends that lift is a cliff of more than STEP_UP to the open ground beside it: 43 of 4,170 "
        "roof-edge pairs (Cave Test 1 and 777, Endless 424242 and 999983); the natural surface "
        "there is within STEP_UP. Dropping the clamp or gating on the cell's own surface passes it",
        r"cliffs made by the lift [1-9]\d*/\d+ roof-edge pairs.*\(natural surface \S+\) over open ground"),
    C_ROOF: (
        "audit D2: queryCaveGeometry returns a ceiling wherever a corridor/chamber feather fade>0 "
        "(hw+108 / r+108, L4684/L4702; L4756-4771), which reaches far out of the arch at the "
        "entrance point: roof starts +152..+380 u out on 10 of 11 entrances, and Cave Test 777 "
        "entrance #1's whole approach runs under its own network's roof (+470: a chamber feather "
        "at the start, a corridor core at along 350-404)",
        r"roof starts at along \+(4[1-9]|[5-9]\d|\d{3})\b"),
    C_STEP: (
        "audit D1 + N14 + D2: the approach ramp targets e.depth||5 (L4741; entrances carry no "
        "depth, L4486) while the cave feature targets its tree's corridor depth 6.0-8.5 (L4496) "
        "at the same fade, so the floor drops 1.07-2.38 h in one cell where the record switches "
        "(-0.80 -> -2.44 at along +224, Cave Test 12345); where the approach is under a chamber "
        "feather the feather's smoothstep (L4702) is steeper than the ramp (n999983: 1.35 / 1.26 "
        "h, with depths unified); and on Cave Test 777 entrance #1 the player walks the roof cap "
        "over its own network until along 32, then drops 7.90 h through the cap hole. 10 of 11 "
        "entrances. Needs all three parts of the multi-site FIX probe",
        r"max step ([2-9]|1\.(0[1-9]|[1-9]))\S* h at along \d+->\d+"),
    C_IN: (
        "audit N14: STEP_DOWN is relaxed to 10 only within 260 u of an entrance (L7853) but the "
        "approach ramp is 480 u long (APPROACH_LEN L4661): on Endless 123 entrance #0 the ramp "
        "drops 1.53 h at along +284 and the picker answers 'fall' (-2.21 -> -3.74). Widening the "
        "radius to 500 passes it",
        r"in: unsupported=[1-9]\d* first along (2[6-9]\d|[34]\d\d) "),
    C_OUT: (
        "audit D1: the same 1.1-2.4 h floor steps are a step UP on the way out, above STEP_UP "
        "1.0 (L7844); with no layer at or below the player the picker has nothing to offer "
        "({topH:0, idx:-1, type:0}, L7901) and the player is blocked -- 10 of 11 entrances "
        "(Cave Test 777 entrance #1 is blocked at along 74 inside its roofed approach, and would "
        "end under that roof even if it were not)",
        r"out: unsupported=[1-9]\d* first blocked at along \d+ \S+: step up from"),
    C_MOUTH: (
        "audit C table: queryCaveGeometry's mouth is a 60 u disc (MOUTH_RADIUS L4660, used only "
        "for a debug counter L5613) while assembleWindow leaves caps off only within CAP_EXCL "
        "30 u (L6647/L6670): 52-139 ceilinged cells per world are capped although flagged "
        "isEntrance; none the other way. Either constant moved to the other passes it",
        r"capped though isEntrance=[1-9]"),
    C_INTERIOR: (
        "audit 'caves are laterally open' + D6 + N14: the feather is hw+108 / r+108 "
        "(L4684/L4702) for an 8-11 h drop and grid walls are carved away wherever fade>0.3 "
        "(L4773), so the cave's side slopes are open ground steeper than STEP_UP (up to 3.17 h "
        "per cell); plus flat-to-flat cliffs where two entrance trees of different depth meet "
        "(n999983 1.58 h): 5,057 of 121,775 pairs, not concentrated on chunk borders",
        r"[1-9]\d*/\d+ steps>1 worst [1-9]\.\d\d"),
    C_SURF: (
        "audit E2, reproduced in the SURFACE (not the cave floor): generateChunk's entrance blur "
        "(3 passes of a 3x3 box within 300 u of an entrance, L5524-5562) skips neighbours outside "
        "the chunk, so the two sides of a chunk line are blurred differently: border spikes "
        "0.113-0.207 h vs <= 0.018 h on mid-chunk control lines in all 7 worlds. Removing the "
        "blur passes it",
        r"border max \S+ > control max"),
    C_WATER: (
        "audit D17: the 'skip walls in water zones' test (L4987) calls terrainNoise while "
        "noiseSeed is the WALL seed (set at L4978), so it reads the wrong terrain: 365 of 39,758 "
        "water cells carry a wall (0.92%; Endless 999983 168, 123 196). Restoring the seed around "
        "that call gives 0",
        r"wall-on-water [1-9]\d*/\d+"),
    C_ENTCOUNT: (
        "audit D16: rng2 and rng are both chunkRng(rx,ry,100) (L4465/L4472), so the 30% gate "
        "rng2() <= 0.30 forces the first rng() < 0.4 and every network gets 2 entrances (L4478): "
        "35 of 35 networks within 12 regions of spawn on seeds 424242, 999983 and 123",
        r"\b0/[1-9]\d* networks have exactly 1 entrance"),
}

# Preserve the original investigation explanations/probe history above, but
# repaired cave contracts must now pass rather than becoming expected failures.
# The unrelated surface-water seed bug remains outside this cave milestone.
# The FIX probes for contracts the cave milestone repaired (C table, D2, D6,
# N14, D1, E4 and the E2 surface blur) passed vacuously once the repair
# shipped; they are now BREAK probes that put each defect back.
KNOWN_BUGS = {
    C_WATER: AUDIT_KNOWN_BUGS[C_WATER],
    C_LEVEE: (
        "river levees (06-water.js carveWaterRivers, added with the water system): the carve can "
        "raise a levee point by up to WATER_MAX_FILL (1.0 h) next to a point it leaves almost "
        "unchanged, which makes a step taller than STEP_UP 1.0 that the game's own picker refuses "
        "(getWalkableLayerTopAt answers 'blocked'). Two mechanisms: (a) the levee rises beside ground "
        "_waterCarvable refuses to shape, which keeps its height; (b) the levee falls back over "
        "WATER_LEVEE_FALL = 18 u, 1.5 height-grid steps. Endless 3 window (9611,-6196): "
        "(10278,-6138)->(10278,-6150) 0.989->2.096, natural 0.989->1.217 (the low point is not "
        "carvable), plus two more pairs; Endless 777000 (7954,3843): (8370,2658)->(8358,2658) "
        "3.220->4.231, natural 3.220->3.313; Endless 8 (3856,3691): (2622,2358)->(2610,2358) "
        "2.679->3.709, natural 2.599->2.791. The largest carve-made step in the seven default worlds is "
        "0.933 h (Cave Test 12345), so they never reach it. "
        "FIX C (cap a carved point at its lowest natural 4-neighbour + 0.75) and FIX B "
        "(WATER_MAX_FILL 0.6) pass it; a 36 u levee fall alone still fails on mechanism (a)",
        r"unclimbable carve steps [1-9]\d*/\d+ e\.g\. n\d+@\S+ \([-\d]+,[-\d]+\)->\([-\d]+,[-\d]+\) "
        r"\S+->\S+ \(natural \S+->\S+, picker blocked\)"),
    C_ANGLE: (
        "audit D16, current symptom: rng2 and rng are both chunkRng(regionX, regionY, 100) in "
        "generateCaveNetwork, so a network exists only when the shared stream's first draw is "
        "<= 0.30, and entryAngle = rng() * 2 pi then reuses that draw: every mouth bears 0-108 deg "
        "from its region centre. Over the bearing census 0 of 461 mouths bear 180-360 deg (largest "
        "107.7 deg; bins 130/125/131/75 then eight empty), chi-square 978.8. Gating on a hash of the "
        "region's own seed passes it (FIX D16, chi-square 7.5); gating on chunkRng stream 101 does not "
        "(chi-square 97.3, 303 of 447 mouths in 180-360 deg: that stream's first draw still tracks "
        "stream 100's)",
        r"\b0/[1-9]\d* mouths in 180-360 deg, largest bearing (?:\d{1,2}|10[0-7])\.\d deg"),
}

# ── probe anchors (each must occur exactly once in the extracted game JS) ──
# The cave milestone (already in the 0.0 snapshot) repaired the C table, D1,
# D2, D6, N14, E4 and the E2 surface blur, so the old FIX probes' anchors are
# gone and the checks pass on their own. Each of those risks is now covered by
# a BREAK probe that puts the defect back into the current code.
_CEIL = "if (cg.ceilZ !== null) { cCaveCeilH[cmIdx] = cg.ceilZ; cCaveHasCeil[cmIdx] = 1; }"
_FLOOR = "        cHeights[cmIdx] = cg.floorH;"
_APPROACH_CEIL = "    surfaceH: surface, ceilZ: null, covered: false, portal: e,"
# D6: the feather floor lerps toward the surface (it can end above the
# ceiling) instead of bevelling toward the roof.
_D6 = ("var floor = best.floor + Math.max(0, ceiling - best.floor) * (1 - bestFade);",
       "var floor = best.floor + (surface - best.floor) * (1 - bestFade);")
# getFloorHeightAt's pre-milestone rule: report layer 0, whatever it is.
_GFH_L0 = ("      if (type === 1 || type === 3 || type === 4) lowest = Math.min(lowest, meshLayerHeight(mesh, cellIndex, li));",
           "      if (li === 0) lowest = Math.min(lowest, meshLayerHeight(mesh, cellIndex, li));")
_SORT = ("while (sj >= 0 && layerTmpZ[sj] > vz) {", "while (false) {")
_CAPSRC = "capH[iN] = needsCap[iN] ? floorMesh.surfaceH[iN] : fhN;"
_CLAMP = "if (capH[iC] < cz + 0.25) capH[iC] = cz + 0.25;"
_AXIAL = "var axial = along > 0 ? 1 - caveSmooth01(along / outer) : 1;"
_TARGET = "var target = typeof e.floorH === 'number' ? e.floorH : -e.depth;"
_WALLCARVE = "wallCarve: ceiling - floor >= 3.0 && floor - best.floor <= 0.75, source: best.source};"
_SPREAD = ("            if (_cellFloorMax - _cellFloorMin > 0.75) _cellWalkable = false;\n", "")
_NO_BLUR = ("  // Entrance shaping is sampled in world space below. Do not blur chunks\n"
            "  // independently: truncated kernels at chunk edges created floor seams.\n")
# E2 as it was: three passes of a 3x3 box blur of the chunk's own heights at
# mesh points within 300 u of an entrance, skipping neighbours outside the chunk.
_BLUR = (_NO_BLUR +
         "  for (var _bIt = 0; _bIt < 3; _bIt++) {\n"
         "    var _bSrc = new Float32Array(cHeights);\n"
         "    for (var _by = 0; _by < meshH; _by++) for (var _bx = 0; _bx < meshW; _bx++) {\n"
         "      var _bwx = cx * CHUNK_SIZE + _bx * meshGridSize, _bwy = cy * CHUNK_SIZE + _by * meshGridSize, _bNear = false;\n"
         "      for (var _be = 0; _be < cCaveEntrances.length; _be++) if (Math.hypot(_bwx - cCaveEntrances[_be].x, _bwy - cCaveEntrances[_be].y) < 300) _bNear = true;\n"
         "      if (!_bNear) continue;\n"
         "      var _bs = 0, _bn = 0;\n"
         "      for (var _bdy = -1; _bdy <= 1; _bdy++) for (var _bdx = -1; _bdx <= 1; _bdx++) {\n"
         "        var _bnx = _bx + _bdx, _bny = _by + _bdy;\n"
         "        if (_bnx < 0 || _bny < 0 || _bnx >= meshW || _bny >= meshH) continue;\n"
         "        _bs += _bSrc[_bny * meshW + _bnx]; _bn++;\n"
         "      }\n"
         "      cHeights[_by * meshW + _bx] = _bs / _bn;\n"
         "    }\n"
         "  }\n")
_LEVEE_CLAMP = "      if (ground > H[q] + WATER_MAX_FILL) ground = H[q] + WATER_MAX_FILL;\n"
# D16's gate, and a repair that draws it from the murmur3 finalizer of the
# region's own component-101 seed instead of a second chunkRng stream.
_GATE = "var rng2 = chunkRng(regionX, regionY, 100);"
_GATE_HASH = ("var _gh = chunkSeedFor(regionX, regionY, 101); _gh = Math.imul(_gh ^ (_gh >>> 16), 0x85ebca6b); "
              "_gh = Math.imul(_gh ^ (_gh >>> 13), 0xc2b2ae35); _gh = (_gh ^ (_gh >>> 16)) >>> 0; "
              "var rng2 = function () { return _gh / 4294967296; };")

PROBES: list = [
    # ── the roof footprint (C table) ──
    ("BREAK mouth: no ceiling on the covered side within 24 u of the portal plane (a second mouth exclusion)",
     _CEIL, _CEIL.replace("cg.ceilZ !== null)", "cg.ceilZ !== null && !cg.isEntrance)"),
     {C_MOUTH: "FAIL", C_ROOF: "PASS"}),
    ("BREAK mouth, the other direction: a roof 30 u out over the approach (inside the 40 u roof tolerance, "
     "so the footprint contract is stricter than the roof-start check)",
     _APPROACH_CEIL, _APPROACH_CEIL.replace("ceilZ: null,", "ceilZ: (approach.along < 30 ? target + e.ceilH : null),"),
     {C_MOUTH: "FAIL", C_ROOF: "PASS"}),
    # ── D16 ──
    # Cross-suite matrix (fourth October 2026 pass, this probe alone against
    # all 12 non-smoke suites, jsc, 387 s): two collateral PASS->FAIL flips,
    # both PRECONDITION voids, not detections, and one collateral FAIL->PASS
    # that is not a repair. Moving the gate changes which normal-Endless
    # regions hold a network, so the windows those suites re-centre on the
    # nearest network land elsewhere:
    #   - physics "walking off a drop larger than STEP_DOWN on open ground
    #     starts a fall within 3 physics steps": the baseline finds exactly
    #     its 5 required drops, all in the two re-centred windows
    #     (endless424242-far 3, endless777000-far 2); under the fix every
    #     world finds 0;
    #   - enemies "a surface enemy does not chase a player standing in the
    #     cave below it": 3 valid enemy/player pairs at baseline, 0 under the
    #     fix;
    #   - enemies' return-to-patrol known bug (F2) reads PASS, 52/52: its two
    #     stuck enemies were in re-centred cave windows, and the
    #     route-planning bug is untouched (its KNOWN_BUGS entry says so).
    # A real D16 repair must give those fixtures subjects again first. The
    # third pass ran the old stream-101 gate (now the NOT A FIX probe at the
    # end) and saw the same two voids without the F2 flip.
    ("FIX D16: draw the 30% cave gate from a hash of the region's own seed, independent of the network stream",
     _GATE, _GATE_HASH,
     {C_ANGLE: "PASS"}),
    # ── D6 / D2 headroom ──
    ("BREAK D6: the feather floor lerps toward the surface (above the ceiling); getFloorHeightAt's walkable "
     "filter still holds",
     *_D6,
     {C_LOWEST: "FAIL", C_GFH: "PASS"}),
    ("BREAK D6 + getFloorHeightAt returns l0 again (its pre-milestone rule): both the stacks and the query fail",
     [_D6, _GFH_L0], None,
     {C_GFH: "FAIL", C_LOWEST: "FAIL"}),
    ("CONTROL: getFloorHeightAt returns l0 again with correct stacks (l0 is then the floor)",
     *_GFH_L0,
     {C_GFH: "PASS"}),
    ("BREAK D2 headroom: the ceiling sits 2.0 h above the stamped floor",
     _CEIL, "if (cg.ceilZ !== null) { cCaveCeilH[cmIdx] = cg.floorH + 2.0; cCaveHasCeil[cmIdx] = 1; }",
     {C_HEAD: "FAIL", C_LOWEST: "PASS", C_CAP: "PASS"}),
    # ── D2 roof ──
    ("BREAK D2 roof: the roof reaches 120 u out over the approach",
     _APPROACH_CEIL, _APPROACH_CEIL.replace("ceilZ: null,", "ceilZ: (approach.along < 120 ? target + e.ceilH : null),"),
     {C_ROOF: "FAIL", C_MOUTH: "FAIL"}),
    # ── interior ──
    ("BREAK interior: bevel cells carved open and the corner-spread wall rule gone (caves laterally open again; "
     "either site alone is masked by the other)",
     [(_WALLCARVE, "wallCarve: true, source: best.source};"), _SPREAD], None,
     {C_INTERIOR: "FAIL", C_HEAD: "FAIL"}),
    # ── N14 / steep feather and D1 on the approach ──
    ("BREAK N14/steep feather: the approach ramp descends over 15% of its length",
     _AXIAL, _AXIAL.replace("along / outer", "along / (outer * 0.15)"),
     {C_STEP: "FAIL", C_IN: "FAIL", C_OUT: "FAIL"}),
    ("BREAK D1: the approach ramp targets 1.5 h above the cave floor",
     _TARGET, "var target = (typeof e.floorH === 'number' ? e.floorH : -e.depth) + 1.5;",
     {C_STEP: "FAIL", C_IN: "FAIL", C_OUT: "FAIL"}),
    # ── E4 ──
    ("BREAK E4: the cap clamp lifts every cap to 3.0 h above its ceiling",
     _CLAMP, "if (capH[iC] < cz + 3.0) capH[iC] = cz + 3.0;",
     {C_E4: "FAIL", C_CAP: "PASS"}),
    # ── E2 in the surface, and the river carve record it reads ──
    ("BREAK E2-surface: the per-chunk 3x3 entrance blur that skips neighbours outside the chunk, put back",
     _NO_BLUR, _BLUR,
     {C_SURF: "FAIL"}),
    ("BREAK surface seam: every odd chunk column's pre-stamp surface 0.1 h higher",
     _NO_BLUR, _NO_BLUR + "  for (var _sk = 0; _sk < cHeights.length; _sk++) cHeights[_sk] += (cx & 1) ? 0.1 : 0;\n",
     {C_SURF: "FAIL"}),
    ("CONTROL surface seam: the same offset at 0.03 h (inside the 0.05 h tolerance)",
     _NO_BLUR, _NO_BLUR + "  for (var _sk = 0; _sk < cHeights.length; _sk++) cHeights[_sk] += (cx & 1) ? 0.03 : 0;\n",
     {C_SURF: "PASS"}),
    ("GUARD: the river carve keeps no record of the ground it changed",
     "  var carved = 0, saved = mesh.waterCarveSaved = {};", "  var carved = 0, saved = {};",
     {C_SURF: "PRECONDITION", C_LEVEE: "PRECONDITION"}),
    ("CONTROL: water system off (no carve): the surface verdict is unchanged, the levee check has no subjects",
     "var WATER_SYSTEM_ENABLED = true;", "var WATER_SYSTEM_ENABLED = false;",
     {C_SURF: "PASS", C_LEVEE: "PRECONDITION"}),
    # ── river levees ──
    ("FIX levee C: no carved point rises more than 0.75 h above a 4-neighbour's natural ground",
     _LEVEE_CLAMP,
     _LEVEE_CLAMP +
     "      var _lvN = Infinity; [q - 1, q + 1, q - w, q + w].forEach(function (o) { var z = o in saved ? saved[o] : H[o]; if (z === z && z < _lvN) _lvN = z; });\n"
     "      if (ground > H[q] && ground > _lvN + 0.75) ground = Math.max(H[q], _lvN + 0.75);\n",
     {C_LEVEE: "PASS"}),
    ("FIX levee B: carving raises ground at most 0.6 h",
     "var WATER_MAX_FILL = 1.0, WATER_MAX_CUT = 1.0;", "var WATER_MAX_FILL = 0.6, WATER_MAX_CUT = 1.0;",
     {C_LEVEE: "PASS"}),
    ("PARTIAL FIX levee A (mechanism witness): a 36 u levee fall alone still leaves the steps beside ground "
     "_waterCarvable refuses to shape",
     "var WATER_LEVEE_FALL = 18;", "var WATER_LEVEE_FALL = 36;",
     {C_LEVEE: "FAIL"}),
    ("FIX D17: the water-zone wall test reads terrainNoise under the terrain seed",
     "var wallTerrain = terrainNoise(wx, wy) + (geographyNoise(wx, wy) - 0.5) * 8.0;",
     "var _hw1Ws = noiseSeed; noiseSeed = oldSeed; var wallTerrain = terrainNoise(wx, wy) + "
     "(geographyNoise(wx, wy) - 0.5) * 8.0; noiseSeed = _hw1Ws;",
     {C_WATER: "PASS"}),
    # ── layer stacks and caps ──
    ("BREAK D6 + skip the cap insertion sort: stacks stay unsorted and l0 stays the floor (the cap is always "
     "appended last and highest, so the sort binds only once D6 puts a ceiling under the floor)",
     [_D6, _SORT], None,
     {C_SORTED: "FAIL", C_GFH: "PASS"}),
    ("BREAK: the cap is built from the cave floor and the clamp that lifts it above the ceiling is gone",
     [(_CAPSRC, "capH[iN] = needsCap[iN] ? fhN : fhN;"), (_CLAMP, "")], None,
     {C_CAP: "FAIL"}),
    ("CONTROL: the cap is built from the cave floor but the clamp still lifts it above the ceiling",
     _CAPSRC, "capH[iN] = needsCap[iN] ? fhN : fhN;",
     {C_CAP: "PASS"}),
    # ── chunk seams in the cave floor ──
    ("BREAK: every odd chunk column's stamped cave floor 1 h higher (a seam)",
     _FLOOR, _FLOOR.replace("cg.floorH;", "cg.floorH + ((cx & 1) ? 1.0 : 0);"),
     {C_SEAM: "FAIL"}),
    ("BREAK sensitivity: the same seam at 0.4 h",
     _FLOOR, _FLOOR.replace("cg.floorH;", "cg.floorH + ((cx & 1) ? 0.4 : 0);"),
     {C_SEAM: "FAIL"}),
    # ── truncation ──
    ("BREAK: generateChunk consults only its own row of cave regions",
     "for (var cvdy = -1; cvdy <= 1; cvdy++) {", "for (var cvdy = 0; cvdy <= 0; cvdy++) {",
     {C_TRUNC: "FAIL"}),
    ("BREAK: generateChunk consults only its own column of cave regions",
     "for (var cvdx = -1; cvdx <= 1; cvdx++) {", "for (var cvdx = 0; cvdx <= 0; cvdx++) {",
     {C_TRUNC: "FAIL"}),
    ("BREAK: generateChunk's entrance reach 0 (approach chunks in the next region miss the network)",
     "var entReach = ENTRANCE_ZONE_REACH;", "var entReach = 0;",
     {C_TRUNC: "FAIL"}),
    ("BREAK: generateChunk's network AABB margin 100 -> 0 (cuts corridor and chamber feathers at chunk lines)",
     "var margin = 100; // generous margin", "var margin = 0; // generous margin",
     {C_TRUNC: "FAIL"}),
    # ── preconditions and load ──
    ("BREAK precondition: no cave networks at all -- nothing may pass vacuously",
     "  var rng = chunkRng(regionX, regionY, 100);\n  var entryAngle",
     "  endlessCaveNetworks[netKey] = null; return null;\n  var rng = chunkRng(regionX, regionY, 100);\n  var entryAngle",
     {C_WORLD: "FAIL", C_SORTED: "PRECONDITION", C_CAP: "PRECONDITION", C_SEAM: "PRECONDITION",
      C_TRUNC: "PRECONDITION", C_SURF: "PRECONDITION", C_ANGLE: "PRECONDITION"}),
    ("BREAK: the page throws while loading",
     "function resetEndlessMode() {", "throw new Error('probe: page fails to load'); function resetEndlessMode() {",
     {C_LOAD: "FAIL"}),
    # Appended in the fourth October 2026 pass, so the slots above keep their
    # test_probe_NN. The old FIX D16 is not a repair: stream 101's first draw
    # still tracks stream 100's, so its gate still selects a band of entry
    # angles. The regex shows it puts mouths in 180-360 deg, which the old
    # one-sided contract took for a repair.
    ("NOT A FIX D16: draw the 30% cave gate from chunkRng stream 101 (the bearings stay biased)",
     _GATE, "var rng2 = chunkRng(regionX, regionY, 101);",
     {C_ANGLE: ("FAIL", r"\b[1-9]\d*/\d+ mouths in 180-360 deg")}),
]

CavesGeometrySuite = suite_testcase("caves_geometry", KNOWN_BUGS, min_checks=20)
CavesGeometryProbes = probe_testcase("caves_geometry", PROBES)

if __name__ == "__main__":
    unittest.main()
