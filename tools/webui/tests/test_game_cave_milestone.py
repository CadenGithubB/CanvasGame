"""Local behavioral acceptance for the first shared cave geometry milestone.

The harness (tools/webui/harness/game_cave_milestone_harness.js) walks the real
input path from the approach into the chamber and back on Cave Test 12345
(descending mouth) and the two natural hillside sites 5668 and 6290, renders
inside and above the cave, checks chamber content on a chunk edge, and checks
that a network regenerates identically. It has no known failures.

PROBES (opt-in, HW1_GAME_PROBES=1) show the checks can fail: each BREAK puts a
plausible defect into a copy of the game and declares FAIL for the checks it is
aimed at. Every check the harness emits is declared FAIL by at least one probe
(the third October 2026 pass ran each probe and saw every declared check
fail). Collateral flips are not asserted: a walk that stops short also fails
the later checks of its fixture.

Two checks are guarded by more than one mechanism, so their probes need two or
three sites:
  - eye clearance (the 2.4 h eye under every roof the walk passes): the
    player's 2.8 h body (spatialPlayerBody's height and PLAYER_BODY_H) keeps
    the eye clear of any roof it lets the player under, so a roof stamped 2.0 h
    above the floor alone stops the walk short (it fails "walk reaches chamber"
    instead), and a short body alone finds no low roof. The probe applies both.
  - day/night off: a BREAK that only stops reclassifying the player keeps the
    flag the walk already set, so it passes; the probe treats the player as
    outdoors while the cycle is off.
Tried and not kept because they reach nothing: a chamber-content inset change
(18 -> -60); cutting the hillside floor 1.5 h or 3 h below its approach (the
ramp stays walkable); and the network sitting 1.5 h below its entrance floor
(the lowered roof blocks the walk at the mouth).

Run:
    python3 -m unittest tools.webui.tests.test_game_cave_milestone -v
    HW1_GAME_PROBES=1 python3 -m unittest tools.webui.tests.test_game_cave_milestone -v
"""
from tools.webui.game_lab import probe_testcase, suite_testcase

_P = "cave_milestone: "
_FIXTURES = ("descending 12345", "hillside 5668", "hillside 6290")


def _each(check: str, verdict: str = "FAIL", fixtures=_FIXTURES) -> dict:
    """{check id: verdict} for one per-fixture check in every listed fixture."""
    return {_P + f + " " + check: verdict for f in fixtures}


C_D_SUPPORT = _P + "descending 12345 walk has continuous support"
C_D_FALLS = _P + "descending 12345 walking does not trigger falls"
C_LOAD = _P + "page evaluates"
C_REWARD = _P + "chunk-edge chamber has its reward"
C_ENEMIES = _P + "chunk-edge chamber has its enemies"
C_IDS = _P + "chamber content has unique stable identities"
C_OPEN = _P + "chamber content spawns in open cells"
C_ZERO_CAM = _P + "camera preserves legitimate zero physics height"

_CEIL = "if (cg.ceilZ !== null) { cCaveCeilH[cmIdx] = cg.ceilZ; cCaveHasCeil[cmIdx] = 1; }"
_UG_STEP = "  playerUnderground = getCaveSpaceAt(pos.x, pos.y, getPlayerFloorH()).underground;\n}"
_UG_DAY = "    playerUnderground = !!getCaveSpaceAt(pos.x, pos.y, getPlayerFloorH()).underground;\n"
_DAY_OFF = "    ambientLight = 0.9; sunIntensity = 0.6; fogFloor = 0.3;\n    sunDirX = 0; sunDirZ = 1;"
_ROOF_TEST = ("      if ((type === 2 || (type === 4 && h > feetH + 1.0)) && h > feetH + 0.001 && h < ceilingH) "
              "ceilingH = h;")
_CAVE_AMBIENT = "  renderCaveAmbient = Math.max(0.40, Math.min(0.45, renderSurfaceAmbient));"

PROBES: list = [
    ("BREAK steep approach: the descending ramp drops over 15% of its length",
     "var axial = along > 0 ? 1 - caveSmooth01(along / outer) : 1;",
     "var axial = along > 0 ? 1 - caveSmooth01(along / (outer * 0.15)) : 1;",
     {C_D_SUPPORT: "FAIL", C_D_FALLS: "FAIL"}),
    ("BREAK headroom: cave networks get 2.2-2.6 h of headroom instead of 3.8-4.2 (RNG draw kept)",
     "var headroom = 3.8 + rng() * 0.4, minCover = 1.0;",
     "var headroom = 2.2 + rng() * 0.4, minCover = 1.0;",
     _each("portal has finite floor and clearance")),
    ("BREAK determinism: the mouth bearing draws from Math.random (the seeded stream's draw is kept)",
     "var entryAngle = rng() * Math.PI * 2;",
     "var entryAngle = (rng(), Math.random()) * Math.PI * 2;",
     _each("network regenerates deterministically")),
    ("BREAK network: a generated network keeps no entrance record",
     "  var net = {corridors: layout.corridors, chambers: layout.chambers, entrances: [entrance],",
     "  var net = {corridors: layout.corridors, chambers: layout.chambers, entrances: [],",
     _each("requested entrance exists")),
    ("BREAK hillside fit: the uphill test demands 10 h more cover than a cave needs, so no hillside fits "
     "and the request falls back to a descent",
     "    if (uphill < th + headroom + minCover) continue;",
     "    if (uphill < th + headroom + minCover + 10) continue;",
     _each("requested entrance exists", fixtures=_FIXTURES[1:])),
    # D1-style trench: the walk falls in (unsupported, airborne) and cannot
    # climb a 1.2 h step back out, so it never reaches the chamber or returns.
    ("BREAK mouth trench: the floor of the first 24 u inside the mouth is stamped 1.2 h below the cave floor",
     "        cHeights[cmIdx] = cg.floorH;",
     "        cHeights[cmIdx] = cg.isEntrance && cg.covered ? cg.floorH - 1.2 : cg.floorH;",
     {**_each("walk has continuous support"), **_each("walking does not trigger falls"),
      **_each("walk reaches chamber"), **_each("walk returns to approach")}),
    ("BREAK eye clearance: the stamped cave roof sits 2.0 h above the floor and the player's body is 1.8 h tall "
     "(movement body and floor picker; either alone is masked, see the module docstring)",
     [(_CEIL, "if (cg.ceilZ !== null) { cCaveCeilH[cmIdx] = cg.floorH + 2.0; cCaveHasCeil[cmIdx] = 1; }"),
      ("var PLAYER_BODY_H = 2.8;", "var PLAYER_BODY_H = 1.8;"),
      ("radius:6,height:70,stepHeight:25,", "radius:6,height:45,stepHeight:25,")], None,
     {**_each("walk preserves eye clearance"), **_each("return preserves support and headroom"),
      **_each("chamber ceiling is above camera")}),
    ("BREAK roof detection: a ceiling more than 3.5 h above the feet does not count as overhead",
     _ROOF_TEST,
     _ROOF_TEST.replace("h > feetH + 0.001 && h < ceilingH", "h > feetH + 0.001 && h < feetH + 3.5 && h < ceilingH"),
     _each("chamber classifies underground")),
    ("BREAK sticky underground: once underground, step and updateDayNight never reclassify the player as outdoors",
     [(_UG_STEP, _UG_STEP.replace("playerUnderground = getCaveSpaceAt", "playerUnderground = playerUnderground || getCaveSpaceAt")),
      (_UG_DAY, _UG_DAY.replace("playerUnderground = !!getCaveSpaceAt", "playerUnderground = playerUnderground || !!getCaveSpaceAt"))],
     None,
     {**_each("return is outdoors at original height"), **_each("surface above chamber stays outdoors")}),
    ("BREAK D10 (outdoors): with the day/night cycle off the player is treated as outdoors",
     [(_DAY_OFF, _DAY_OFF + " playerUnderground = false; return;"),
      (_UG_STEP, _UG_STEP.replace("playerUnderground = getCaveSpaceAt", "playerUnderground = settings.dayNight && getCaveSpaceAt"))],
     None,
     _each("underground detection with day/night off")),
    ("BREAK cave light: the cave ambient follows the surface ambient (no cave clamp)",
     _CAVE_AMBIENT, "  renderCaveAmbient = renderSurfaceAmbient;",
     _each("readable ambient at 0.5")),
    ("BREAK cave light: the cave ambient is half the surface ambient (too dark at night)",
     _CAVE_AMBIENT, "  renderCaveAmbient = renderSurfaceAmbient * 0.5;",
     _each("readable ambient at 0.95")),
    ("BREAK render: the ceiling pass throws whenever the player is underground",
     "function drawLayersCeiling3D() {\n",
     "function drawLayersCeiling3D() {\n  if (playerUnderground) throw new Error('probe: ceiling pass');\n",
     _each("turning inside renders without errors")),
    ("BREAK render: the skybox pass throws whenever the player is outdoors",
     "function drawSkybox3D() {\n",
     "function drawSkybox3D() {\n  if (!playerUnderground) throw new Error('probe: skybox pass');\n",
     _each("surface viewpoint renders without errors")),
    ("BREAK chunk-edge content: every chunk a chamber's network touches spawns its content (owner test lost)",
     [("        if (_chOwner.ownerCX !== cx || _chOwner.ownerCY !== cy) continue;\n", ""),
      ("        if (_tcPoint.ownerCX !== cx || _tcPoint.ownerCY !== cy) continue;\n", "")], None,
     {C_REWARD: "FAIL", C_ENEMIES: "FAIL", C_IDS: "FAIL"}),
    ("BREAK content placement: chamber content is placed a chamber radius + 24 u from its centre (in the rock)",
     "    x: Math.max(cx * CHUNK_SIZE + inset, Math.min((cx + 1) * CHUNK_SIZE - inset, chamber.cx + offsetX)),",
     "    x: chamber.cx + offsetX + chamber.radius + 24,",
     {C_OPEN: "FAIL"}),
    ("BREAK camera: a zero physics height is treated as missing (cam.z || 60)",
     "  var cameraZ = 60 + ((Number.isFinite(cam.z) ? cam.z : 60) - 60) * (25 / 40);",
     "  var cameraZ = 60 + ((cam.z || 60) - 60) * (25 / 40);",
     {C_ZERO_CAM: "FAIL"}),
    ("BREAK load: the page script throws at top level",
     "var __caveStats = {",
     "throw new Error('probe: page load broken');\nvar __caveStats = {",
     {C_LOAD: "FAIL"}),
]

CaveMilestoneTests = suite_testcase("cave_milestone", {}, min_checks=30)
CaveMilestoneProbes = probe_testcase("cave_milestone", PROBES)
