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
                    of an entrance, where generateChunk blurs it chunk by chunk.
                    Tolerance 0.05 h: a seamless surface puts border lines in
                    the same distribution as control lines; 0.05 h is 2.5x the
                    largest control spike in any default world (<= 0.020 h with
                    or without the blur) and under half the smallest border
                    spike the blur leaves (0.113 h).
  truncation        every mesh cell of every chunk that could hold a network,
                    where queryCaveGeometry asked with every network of the 5x5
                    surrounding regions says "cave" (fade >= 0.05), was stamped
                    by generateChunk (a ceiling, or the floor moved off the
                    pre-stamp surface snapshot). Independent of the ceiling
                    policy, so a D6 fix does not read as truncation.
  walls in water    at most 0.25% of water cells carry a grid wall, over chunks
                    -8..8 of every Endless seed. The generator's own rule is
                    "skip walls in water zones" (L4986-4987); its water proxy
                    (terrainNoise + geography at the wall cell centre) is not the
                    water rule (cHeights < -3.0 at the mesh corner), so a few
                    boundary cells may disagree -- with the D17 fix applied it is
                    0 of 39,758 today, 0.25% leaves room for that.
  entrance count    normal Endless asks for 1 or 2 entrances (L4478); over >= 10
                    networks a correct implementation gives at least one
                    single-entrance network (P(no 1s) = 0.4^n).

METRIC lines (never verdicts): per-world bad counts for the aggregated checks,
roof start per entrance, caps raised above the natural surface and by how much,
grid-wall cells under a cave ceiling (F6), cells where queryCaveGeometry gives
a ceilZ but no ceiling was stamped, interior step maxima, border/control seam
spikes, how close any network's feather comes to generateChunk's 3x3-region
reach, and cave rarity in normal Endless.

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
KNOWN_BUGS = {C_WATER: AUDIT_KNOWN_BUGS[C_WATER]}

# ── probe anchors (each must occur exactly once in the extracted game JS) ──
_CEIL = "if (cg.ceilZ !== null) { cCaveCeilH[cmIdx] = cg.ceilZ; cCaveHasCeil[cmIdx] = 1; }"
_LERP = "cHeights[cmIdx] = _surfH * (1 - cg.fade) + cg.caveFloorZ * cg.fade;"
_RELAX = "if (_wsldx * _wsldx + _wsldy * _wsldy < 260 * 260) { STEP_DOWN = 10.0; break; }"
# D1/N14: each entrance carries its tree's depth (the approach reads e.depth,
# L4741) and the second tree reuses the first tree's depth (rng() still drawn).
_TREE_DEPTH = ("depth: 6.0 + rng() * 2.5,   // 6.0-8.5 height units deep",
               "depth: (ent.depth = (si === 0 ? (_hw1D0 = 6.0 + rng() * 2.5) : (rng(), _hw1D0))),   // 6.0-8.5 height units deep")
_NO_APPROACH_CEIL = ("ceilZ: ceilZ,", "ceilZ: (approachFade > 0 ? null : ceilZ),")

PROBES: list = [
    # ── FIX probes: remove the audited cause, the check must go PASS ──
    ("FIX C-table: shrink queryCaveGeometry's mouth to the 30 u cap hole",
     "var MOUTH_RADIUS = 60;", "var MOUTH_RADIUS = 30;",
     {C_MOUTH: "PASS"}),
    ("FIX C-table, the other direction: grow the cap hole to the 60 u mouth (the check prescribes neither)",
     "var CAP_EXCL_SQ = 30 * 30;", "var CAP_EXCL_SQ = 60 * 60;",
     {C_MOUTH: "PASS"}),
    ("FIX D16: draw the 30% cave gate from its own RNG stream",
     "var rng2 = chunkRng(regionX, regionY, 100);", "var rng2 = chunkRng(regionX, regionY, 101);",
     {C_ENTCOUNT: "PASS"}),
    ("FIX D6: stamp a ceiling only where it is above the lerped floor (truncation must stay PASS: "
     "that check does not assume the ceiling policy)",
     _CEIL,
     "if (cg.ceilZ !== null && cg.ceilZ > cHeights[cmIdx]) { cCaveCeilH[cmIdx] = cg.ceilZ; cCaveHasCeil[cmIdx] = 1; }",
     {C_LOWEST: "PASS", C_GFH: "PASS", C_TRUNC: "PASS"}),
    ("FIX D6 isolation: getFloorHeightAt returns the lowest non-ceiling layer (stacks untouched)",
     "var v = mesh.l0TopZ[gridY * mesh.w + gridX];",
     "var _gi = gridY * mesh.w + gridX, _gZ = [mesh.l0TopZ, mesh.l1TopZ, mesh.l2TopZ, mesh.l3TopZ, mesh.l4TopZ], "
     "_gT = [mesh.l0Type, mesh.l1Type, mesh.l2Type, mesh.l3Type, mesh.l4Type]; var v = mesh.l0TopZ[_gi]; "
     "for (var _gl = 0; _gl < mesh.layerCount[_gi]; _gl++) { if (_gT[_gl][_gi] !== 2) { v = _gZ[_gl][_gi]; break; } }",
     {C_GFH: "PASS", C_LOWEST: "FAIL"}),
    ("FIX D2 (causal): the ceiling rides the lerped floor at the record's own headroom",
     _CEIL,
     "if (cg.ceilZ !== null) { cCaveCeilH[cmIdx] = cHeights[cmIdx] + (cg.ceilZ - cg.caveFloorZ); cCaveHasCeil[cmIdx] = 1; }",
     {C_HEAD: "PASS", C_LOWEST: "PASS", C_GFH: "PASS", C_TRUNC: "PASS"}),
    ("FIX D2 (roof): no ceiling where the approach cone reaches (open trench up to the arch)",
     *_NO_APPROACH_CEIL,
     {C_ROOF: "PASS"}),
    ("FIX interior (N14 + feather): both entrance trees share one depth, and a ceiling only in the flat core",
     [_TREE_DEPTH,
      (_CEIL, "if (cg.ceilZ !== null && cg.fade >= 0.999) { cCaveCeilH[cmIdx] = cg.ceilZ; cCaveHasCeil[cmIdx] = 1; }")],
     None,
     {C_INTERIOR: "PASS", C_HEAD: "PASS", C_LOWEST: "PASS", C_GFH: "PASS", C_E4: "PASS", C_TRUNC: "PASS"}),
    ("FIX N14: the STEP_DOWN relaxation radius covers the 480 u approach",
     _RELAX, _RELAX.replace("260 * 260", "500 * 500"),
     {C_IN: "PASS"}),
    ("FIX D1 + steep feather + D2 on the approach (three sites, each a documented cause): entrances "
     "carry their tree's depth and both trees share it; inside its cone the approach ramp's fade "
     "governs the floor (a linear ramp, not the feather's smoothstep); no ceiling over the cone",
     [_TREE_DEPTH,
      ("    if (approachFade > bestFade) combinedFade = approachFade;",
       "    if (approachFade > 0) combinedFade = approachFade;"),
      _NO_APPROACH_CEIL],
     None,
     {C_STEP: "PASS", C_IN: "PASS", C_OUT: "PASS", C_ROOF: "PASS"}),
    ("FIX E4: the depth gate uses the cell's own pre-stamp surface, not the 21x21 max",
     "var cg = queryCaveGeometry(cmwx, cmwy, cCaveNets, _smoothSurf);",
     "var cg = queryCaveGeometry(cmwx, cmwy, cCaveNets, cSurfaceH[cmIdx]);",
     {C_E4: "PASS"}),
    ("FIX E2-surface: no per-chunk entrance blur (demonstrates the mechanism; a real fix blurs a padded buffer)",
     "for (var _smrIt = 0; _smrIt < 3; _smrIt++) {", "for (var _smrIt = 0; _smrIt < 0; _smrIt++) {",
     {C_SURF: "PASS"}),
    ("FIX D17: the water-zone wall test reads terrainNoise under the terrain seed",
     "var wallTerrain = terrainNoise(wx, wy) + (geographyNoise(wx, wy) - 0.5) * 8.0;",
     "var _hw1Ws = noiseSeed; noiseSeed = oldSeed; var wallTerrain = terrainNoise(wx, wy) + "
     "(geographyNoise(wx, wy) - 0.5) * 8.0; noiseSeed = _hw1Ws;",
     {C_WATER: "PASS"}),
    # ── BREAK probes: inject a bug, a passing check must go FAIL ──
    ("BREAK: skip the cap insertion sort in assembleWindow (also shows D6's mechanism: "
     "without the re-sort l0 stays the floor and getFloorHeightAt passes)",
     "while (sj >= 0 && layerTmpZ[sj] > vz) {", "while (false) {",
     {C_SORTED: "FAIL", C_GFH: "PASS"}),
    ("BREAK: drop the cap >= ceiling + 0.25 clamp (and with it E4's lift)",
     "if (capH[iC] < cz + 0.25) capH[iC] = cz + 0.25;", "",
     {C_CAP: "FAIL", C_E4: "PASS"}),
    ("BREAK: raise every chunk's west column of stamped cave floor by 1 h (a seam)",
     _LERP, _LERP.replace("cg.fade;", "cg.fade + (cmx === 0 ? 1.0 : 0);"),
     {C_SEAM: "FAIL"}),
    ("BREAK sensitivity: the same seam at 0.4 h",
     _LERP, _LERP.replace("cg.fade;", "cg.fade + (cmx === 0 ? 0.4 : 0);"),
     {C_SEAM: "FAIL"}),
    ("BREAK: generateChunk consults only its own row of cave regions",
     "for (var cvdy = -1; cvdy <= 1; cvdy++) {", "for (var cvdy = 0; cvdy <= 0; cvdy++) {",
     {C_TRUNC: "FAIL"}),
    ("BREAK: generateChunk's network AABB margin 100 -> 0 (cuts corridor and chamber feathers at chunk lines)",
     "var margin = 100; // generous margin", "var margin = 0; // generous margin",
     {C_TRUNC: "FAIL"}),
    ("BREAK precondition: no cave entrances at all (RNG draw kept) -- nothing may pass vacuously",
     "var numEntrances = rng() < 0.4 ? 2 : 1;", "var numEntrances = (rng(), 0);",
     {C_WORLD: "FAIL", C_SORTED: "FAIL", C_CAP: "FAIL", C_SEAM: "FAIL", C_TRUNC: "FAIL"}),
    ("BREAK: the page throws while loading",
     "function resetEndlessMode() {", "throw new Error('probe: page fails to load'); function resetEndlessMode() {",
     {C_LOAD: "FAIL"}),
]

CavesGeometrySuite = suite_testcase("caves_geometry", KNOWN_BUGS, min_checks=19)
CavesGeometryProbes = probe_testcase("caves_geometry", PROBES)

if __name__ == "__main__":
    unittest.main()
