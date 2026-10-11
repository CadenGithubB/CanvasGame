"""Chest rewards and looting rules in the Endless crawler (WebPage_Games.h).

What the suite covers, all through the game's own code (generateChunk,
assembleWindow, collectChest, gameUpdate/updateTreasureChests, the gamepad-A
loot path in handleInput, the chest draw pass in a real loop() frame):

  - rewards match the tier a chest advertises: epic chests pay a relic or
    equipment, gold rises with tier (difficulty-matched pairs), equipment
    carries the chest's quality inside its tier's range -- judged on the WINDOW
    copy of every chest (the object the player loots), for cave chests (Cave
    Test 12345/424242/777 with caveChests on, and every network within 12
    regions of spawn in normal Endless 424242) and, as a regression guard, for
    surface chests (Endless 424242);
  - every terminal cave chamber holds a chest ON its centre in the window a
    player standing there gets (so a neighbour's chest cannot stand in for it);
  - a cave chest is offered from the cave floor beside it, pays exactly what
    its floating text (read from the real canvas calls) names, once; it is
    reached on foot from the entrance at 30 fps (a known defect today: the
    walker that comes to rest beside the chest is offered it with no prompt
    on screen, see KNOWN_BUGS); and it is NOT offered to a player on the
    surface cap directly above it;
  - the "[E] Take" / "[E] Swap" prompt says what pressing A actually does;
  - a looted chest stays looted across a measured window re-centre;
  - chests inside a cave entrance reserve are filtered out of the window.

Moved to the persistence suite (it owns them): swapped-item quality/identity
across a re-centre or an eviction (H3) and collected-chest-after-eviction.

Run it:

    python3 -m unittest tools.webui.tests.test_game_loot -v
    HW1_GAME_PROBES=1 python3 -m unittest tools.webui.tests.test_game_loot -v   # + mutation probes
    python3 -m tools.webui.game_lab loot -v --seeds 12345,1,777 --endless-seeds 424242,8

Header line numbers below are WebPage_Games.h lines (== extracted-JS lines).
"""

from __future__ import annotations

import re
import unittest

from tools.webui.game_lab import probe_testcase, suite_testcase

_LOAD = "loot: game script evaluates without throwing"
_TERMPRE = "loot: precondition: every world has terminal cave chambers to judge"
_TERM = "loot: every terminal cave chamber holds a lootable chest"
_SAMPLEPRE = "loot: precondition: the cave reward sample contains epic chests and paired rarity controls"
_EPIC = "loot: every epic cave chest yields a relic or equipment"
_CGOLD = "loot: cave chest gold rises with chest tier"
_SGOLD = "loot: surface chest gold rises with chest tier"
_SEPIC = "loot: every epic surface chest yields a relic"
_EQQ = "loot: chest equipment carries the chest's quality, inside its tier's range"
_FLOOR = "loot: a cave chest is offered to a player standing beside it on the cave floor"
_PAY = "loot: looting a cave chest from the floor pays its advertised reward exactly once"
_CAPPRE = "loot: precondition: at least 5 floor-lootable cave chests were tested from the cap above them"
_CAP = "loot: a cave chest is not offered to a player standing on the surface cap above it"
_KEEP_RE = "loot: a looted chest stays looted after the window re-centres"
_WALK = "loot: a cave chest is reached on foot from the entrance and offered, with the player on the cave floor"
_PROMPTPRE = "loot: precondition: the prompt scenario offers an equipment chest and draws its prompt in every case"
_PROMPT = "loot: the chest prompt says Take or Swap exactly as pressing A takes or swaps"
_RESERVE = "loot: chests inside a cave entrance reserve are filtered out of the window"

# One walk's detail (walkIn, game_loot_harness.js) when that walk fails ONLY on
# the near-chest prompt: it reached the chest (a STUCK clause would sit between
# 'fps' and '; end at'), stands on the chest cell's floor underground (the
# harness's own onFloor: |h - floor| < 0.5 and playerUnderground), rests under
# 18 u, is offered the chest, draws no prompt with the camera at the game's full
# downward pitch (chestPrompt reports the pitch the chest pass drew with) and
# logs 0 render errors. Every field is pinned inside each walk, so one walk
# cannot vouch for another. 18 u is the measured full-pitch cutoff of the
# shortest (2-line gold) label in the lab canvas: hidden at 18.0 u, drawn from
# 18.25 u. A no-prompt rest further out, or a read below CAM_PITCH_MAX, is not
# this defect: at pitch 1 the same label is hidden out to 21.75 u.
_NUM = r"-?\d+\.\d+"
_WALK_ONLY_PROMPT = (
    rf"\w+: entrance \({_NUM},{_NUM}\) -> chest \({_NUM},{_NUM}\) \d+ corridor nodes, {_NUM} u, \d+ frames at 30 fps; "
    rf"end at \({_NUM},{_NUM}\) h={_NUM} chest-cell floor {_NUM} underground=true onFloor=true "
    rf"airborne frames \d+ min h {_NUM}; rest (?:1[0-7]|\d)\.\d u from the chest; "
    rf"offered=true prompt no prompt drawn at camera pitch {_NUM} = CAM_PITCH_MAX; render errors 0")


def _all_walks(walk: str) -> str:
    """A walk-check FAIL detail in which every one of at least 2 walks matches `walk`."""
    return rf"^0/(?:[2-9]|[1-9]\d+) walks at 30 fps [^:|]*: {walk}(?: \| {walk})+$"


# Witnesses of the two walk BREAKs applied with the near-chest label FIX, so a
# probe that changed nothing (every walk still the prompt defect) cannot pass:
# every walk STUCK on its corridor route and never offered the chest; or every
# walk reached the chest floor, rests 5-18 u out (inside the game's 90 u reach,
# outside a 5 u one) and is not offered it.
_WALK_STUCK = (
    rf"\w+: entrance \({_NUM},{_NUM}\) -> chest \({_NUM},{_NUM}\) \d+ corridor nodes, {_NUM} u, \d+ frames at 30 fps; "
    rf"STUCK {_NUM} u short of node \d+ at \({_NUM},{_NUM}\); end at [^|]*; offered=false prompt [^|]*; render errors 0")
_WALK_NOT_OFFERED = (
    rf"\w+: entrance \({_NUM},{_NUM}\) -> chest \({_NUM},{_NUM}\) \d+ corridor nodes, {_NUM} u, \d+ frames at 30 fps; "
    rf"end at \({_NUM},{_NUM}\) h={_NUM} chest-cell floor {_NUM} underground=true onFloor=true "
    rf"airborne frames \d+ min h {_NUM}; rest (?:1[0-7]|[5-9])\.\d u from the chest; "
    rf"offered=false prompt no prompt drawn at camera pitch {_NUM} = CAM_PITCH_MAX; render errors 0")

# check id -> (why it fails today, regex its FAIL detail must match). The regex
# pins the documented mechanism, so a known bug that starts failing for another
# reason stops counting as "expected".
KNOWN_BUGS: dict[str, tuple[str, str]] = {
    _EPIC: (
        "audit D22: cave terminal chests are built with equipId:null, relicId:null (L5969-5977), "
        "assembleWindow copies that (L7037-7041) and collectChest (L20175-20220) has no lazy roll, so a "
        "purple 'epic' cave chest pays gold only (0/59 by default)",
        r"^0/\d+ epic cave chests .*failures: \d+ gold-only, 0 other"),
    _CGOLD: (
        "Cave gold ignores chest tier: changing only a deterministic chunk's cave tier roll "
        "from common to epic leaves the actual collectChest gold reward unchanged.",
        r"^0/[1-9]\d* same-seed common/epic pairs scale gold by at least 1\.2x$"),
    _PROMPT: (
        "NEW (loot review, not in the audit index): drawTreasureChestLabel's prompt branch says '[E] Swap' only "
        "when currentItem.id !== eInst.id, but collectChest (L20198-20207) swaps whenever the slot is "
        "occupied; wearing the chest's own item at another quality shows '[E] Take' and A silently "
        "swaps (a q1.27 hood is traded for the chest's q0.73 one)",
        r"MISMATCH wearing the same \w+ at q1\.27: prompt '[^']*\[E\] Take' -> A SWAP"),
    _WALK: (
        "NEW (loot lab walk, not in the audit index; present since the 0.0 snapshot): an offered chest can have no "
        "visible prompt. The only prompt is the floating label drawTreasureChestLabel (07-decorations-lighting.js) "
        "draws above the chest (legacy pass floorZ+bodyH+lidH+8, chest-model pass its 'label' anchor); closer "
        "than ~18 u it projects wholly below the canvas even at the game's full downward pitch (CAM_PITCH_MAX "
        "1.4, which the walk's prompt read uses), so withSceneDepthBillboard culls it, while updateTreasureChests "
        "still offers the chest (dist < 90 && canReachChest) and A/E loots it. Measured in the lab canvas on the "
        "walks' 2-line gold labels, the shortest label: hidden at 18.0 u and drawn from 18.25 u at CAM_PITCH_MAX "
        "(at pitch 1 hidden out to 21.75 u, so 18-22 u is the camera's choice, not this defect). The walker "
        "releases W ~70 u out at ~120 u/s and cave damping (0.975 per 60 Hz step) slides it to 6-17 u from the "
        "chest: offered=true, no prompt at CAM_PITCH_MAX. The check needs at least 2 walks, and every walk must "
        "fail only this way (_WALK_ONLY_PROMPT).",
        rf"^0/(?:[2-9]|[1-9]\d+) walks at 30 fps [^:|]*: {_WALK_ONLY_PROMPT}(?: \| {_WALK_ONLY_PROMPT})+$"),
}

# Window assembly copy, reserve filter and pickup texts used by more than one
# probe (anchors each occur exactly once in the extracted JS).
_WIN_COPY = "          tier: tc.tier || 'common', quality: tc.quality || 1.0, relicId: tc.relicId || null,"
_RES_FILTER = "    treasureChests = treasureChests.filter(function(it){ return !inEntranceReserve(it.x, it.y); });"
_IN_RANGE = "    var inRange = dist < 90 && canReachChest(ch);\n"
_SAVE_COLLECTED = "        tcChunk.treasureChests[tc._chunkIdx].collected = tc.collected;"
_RECENTRE = "  if (pcx !== centerCX || pcy !== centerCY) {"
_HYSTERESIS = "  if (Math.abs(pcx - centerCX) > 2 || Math.abs(pcy - centerCY) > 2) {"
# generateChunk's terminal-chamber chest: caveChamberContentPoint places it in
# its owner chunk (18 u inset), so N8's outer-ring guard no longer exists.
_TC_OWNER = "        if (_tcPoint.ownerCX !== cx || _tcPoint.ownerCY !== cy) continue;\n"
# queryCaveGeometry's corridor stamp.
_CORRIDOR_BAND = "      if (perpDist < hw + 36) {"
# The near-chest prompt (KNOWN_BUGS[_WALK]): the first line of
# drawTreasureChestLabel, and a candidate fix that keeps the label's anchor on
# the canvas. Probes whose walk control must reach the chest carry the fix, so
# the walk passes or fails on what they break, not on the known prompt defect.
_LABEL = "  var fontSize = Math.max(8, Math.min(14, Math.floor(1800 / textP.fwd)));\n"
_LABEL_FIX = ("  if (textP.sy > canvas.height - 4) textP = {sx: textP.sx, sy: canvas.height - 4, fwd: textP.fwd};\n"
              + _LABEL)

# N8 (terminal chambers in a chunk's outer cell ring had no chest; the review
# also named an entrance-reserve cause) was repaired before the 0.0 snapshot:
# generateChunk places every terminal chest with caveChamberContentPoint inside
# its owner chunk. Slot 00 is now the BREAK that reintroduces the ring guard.
# The old "edge fix ALONE" control (slot 01) cannot be expressed any more: the
# reserve cause is unreachable by construction (generateCaveNetwork's
# winding-chamber-v1 layout puts a network's only terminal chamber at least
# ~228 u along the inward axis from its mouth, against a 44 x 34 u reserve; 0 of
# 44 terminal chambers across the 7 default worlds lie in one), and the reserve
# filter itself stays guarded by probe 09 and the 'loot: entrance reserve'
# scenario. Slot 01 now holds the near-chest prompt FIX.

# (description, anchor | [(anchor, replacement), ...], replacement | None, {check id: verdict under the mutation})
PROBES: list = [
    ("BREAK N8 (repaired: caveChamberContentPoint places every terminal chest inside its owner chunk): a "
     "terminal chamber whose centre lies in its chunk's outer cell ring gets no chest again",
     _TC_OWNER,
     "        if (_tcPoint.ownerCX !== cx || _tcPoint.ownerCY !== cy) continue;"
     " var _tcx2 = Math.floor((_cch2.cx - cx * CHUNK_SIZE) / cell), _tcy2 = Math.floor((_cch2.cy - cy * CHUNK_SIZE) / cell);"
     " if (_tcx2 < 1 || _tcx2 >= CHUNK_CELLS - 1 || _tcy2 < 1 || _tcy2 >= CHUNK_CELLS - 1) continue;\n",
     {_TERM: "FAIL", _TERMPRE: "PASS", _RESERVE: "PASS"}),
    # ── FIX probes: remove a known bug's cause, its check must go PASS ────────
    ("FIX the near-chest prompt: keep the loot label on the canvas when the chest is close "
     "(drawTreasureChestLabel); the walker resting 6-17 u from the chest then sees '[E] Take'",
     _LABEL, _LABEL_FIX,
     {_WALK: "PASS", _FLOOR: "PASS", _PAY: "PASS", _CAP: "PASS"}),
    ("BREAK chamber identity (successor of review probe p2): every cave chest names the next chamber index, so "
     "a chest standing in a chamber that is not its own must not satisfy that chamber",
     "          caveSpawnId: _cn2.regionX + ',' + _cn2.regionY + ':chamber:' + _cci2 + ':chest',",
     "          caveSpawnId: _cn2.regionX + ',' + _cn2.regionY + ':chamber:' + (_cci2 + 1) + ':chest',",
     {_TERM: "FAIL"}),
    ("FIX D22 at generation: epic cave chests roll a relic like surface epics (L5974)",
     "          equipId: null, relicId: null,\n          tier: cTier,",
     "          equipId: null, relicId: (cTier === 'epic' ? pickRandomRelic(caveChestRng) : null),\n          tier: cTier,",
     {_EPIC: "PASS", _PAY: "PASS"}),
    ("FIX D22 where the player loots (the assembleWindow copy, L7040): an epic chest with no relic "
     "gets RELIC_KEYS[seed % n]. The epic check judges window copies, so it must PASS (review p9 "
     "showed the old chunk-data check stayed 0/51 under this fix).",
     _WIN_COPY,
     "          tier: tc.tier || 'common', quality: tc.quality || 1.0, relicId: tc.relicId || "
     "(tc.tier === 'epic' && !tc.equipId ? RELIC_KEYS[tc.seed % RELIC_KEYS.length] : null),",
     {_EPIC: "PASS", _PAY: "PASS"}),
    ("FIX D22 inside collectChest only (a lazy relic roll the floating text never shows): epic chests "
     "now pay a relic, but the prompt still says '+N Gold', so the pay check -- which reads the drawn "
     "text -- must FAIL",
     "  if (!ch || ch.collected || !canReachChest(ch)) return;",
     "  if (!ch || ch.collected || !canReachChest(ch)) return;\n"
     "  if (!ch.relicId && !ch.equipId && ch.tier === 'epic') ch.relicId = RELIC_KEYS[(ch.seed || 0) % RELIC_KEYS.length];",
     {_EPIC: "PASS", _PAY: "FAIL"}),
    ("FIX D22: cave chest gold applies the tier goldMult (L5971)",
     "          gold: Math.floor(10 + caveChestRng() * 30 * difficulty),",
     "          gold: Math.floor((10 + caveChestRng() * 30 * difficulty) * CHEST_TIER_DEFS[cTier].goldMult),",
     {_CGOLD: "PASS"}),
    ("BREAK roof pickup targeting: restore horizontal-only chest prompt (with the near-chest label FIX, so the "
     "walk control can pass)",
     [(_IN_RANGE, "    var inRange = dist < 90;\n"), (_LABEL, _LABEL_FIX)], None,
     {_CAP: "FAIL", _FLOOR: "PASS", _WALK: "PASS"}),
    ("FIX the Take/Swap prompt: say Swap whenever the slot is occupied, as collectChest does "
     "(drawTreasureChestLabel)",
     "    if (currentItem && currentItem.id !== eInst.id) {",
     "    if (currentItem) {",
     {_PROMPT: "PASS", _PROMPTPRE: "PASS"}),
    # ── BREAK probes: inject a bug, a passing check must go FAIL ──────────────
    ("BREAK: drop the entrance-reserve chest filter (L7180)",
     _RES_FILTER, "    treasureChests = treasureChests;",
     {_RESERVE: "FAIL"}),
    ("BREAK: saveAllEntityDeltas forgets that a chest was collected (L7397)",
     _SAVE_COLLECTED, "        tcChunk.treasureChests[tc._chunkIdx].collected = false;",
     {_KEEP_RE: "FAIL"}),
    ("CONTROL: re-centre hysteresis alone (a plausible G3 perf change, L7483): the 4-chunk trip still "
     "re-centres, so the re-centre check's precondition holds and it stays PASS",
     _RECENTRE, _HYSTERESIS, {_KEEP_RE: "PASS"}),
    ("BREAK under re-centre hysteresis (review p8): with the collected write-back broken, the check "
     "must FAIL because of ITS OWN trip (the 2-chunk trip it replaced did not re-centre under hysteresis)",
     [(_RECENTRE, _HYSTERESIS), (_SAVE_COLLECTED, "        tcChunk.treasureChests[tc._chunkIdx].collected = false;")],
     None, {_KEEP_RE: "FAIL"}),
    # The walk does not claim this one: its walker comes to rest 6-17 u from
    # the chest, inside 20 u, so it cannot tell a 20 u radius from 90 u (and
    # it fails on the known prompt defect anyway). The 5 u probe at the end
    # covers the walk.
    ("BREAK: shrink the pickup radius to 20 u (updateTreasureChests)",
     _IN_RANGE, "    var inRange = dist < 20;\n",
     {_FLOOR: "FAIL"}),
    ("BREAK: a gold chest is never marked collected (L20215-20216)",
     "    coins += ch.gold;\n    ch.collected = true;", "    coins += ch.gold;",
     {_PAY: "FAIL"}),
    ("BREAK (review p3): the floating text advertises double the gold the chest pays (drawTreasureChestLabel)",
     "    textLines.push('+' + ch.gold + ' Gold');",
     "    textLines.push('+' + (ch.gold * 2) + ' Gold');",
     {_PAY: "FAIL"}),
    ("BREAK: epic surface chests lose their relic (L5849)",
     "        chRelicId = pickRandomRelic(chestRng);", "        chRelicId = null;",
     {_SEPIC: "FAIL"}),
    ("BREAK: surface chest gold ignores the tier goldMult (L5847)",
     "chGold = Math.floor((15 + chestRng() * 30 * difficulty) * chTierDef.goldMult);",
     "chGold = Math.floor((15 + chestRng() * 30 * difficulty) * 1);",
     {_SGOLD: "FAIL"}),
    ("BREAK: createEquipInstance ignores the chest quality (L3655)",
     "  inst.quality = quality;\n", "  inst.quality = 1.0;\n",
     {_EQQ: "FAIL"}),
    ("BREAK (review p4): rollQuality rolls 0.25 below the tier's qualityMin; item quality still equals "
     "chest.quality, so only the range half of the check can catch it (L3640)",
     "  return td.qualityMin + rngFn() * (td.qualityMax - td.qualityMin);",
     "  return td.qualityMin - 0.25 + rngFn() * (td.qualityMax - td.qualityMin);",
     {_EQQ: "FAIL"}),
    ("BREAK: corridors are not stamped by queryCaveGeometry (its corridor band; with the near-chest label FIX "
     "so the walk fails by getting stuck, not on the known prompt defect). Chambers still are, so the teleport "
     "floor check stays PASS; walking in from the entrance must FAIL",
     [(_CORRIDOR_BAND, "      if (false) {"), (_LABEL, _LABEL_FIX)], None,
     {_WALK: ("FAIL", _all_walks(_WALK_STUCK)), _FLOOR: "PASS"}),
    # These two target precondition gates: each gate must FAIL with its
    # PRECONDITION marker (game_lab's "PRECONDITION" expectation).
    ("BREAK: no cave network gets a terminal chamber (generateCaveNetwork's layout) -- every cave-chest "
     "precondition must FAIL",
     "      radius: chamberRadius, ceilH: headroom + 0.6, terminal: true}]};",
     "      radius: chamberRadius, ceilH: headroom + 0.6, terminal: false}]};",
     {_TERMPRE: "PRECONDITION", _SAMPLEPRE: "PRECONDITION", _CAPPRE: "PRECONDITION"}),
    ("BREAK: surface chests never hold equipment (generateChunk) -- the prompt scenario's precondition must FAIL",
     "      } else if (chestRng() < chTierDef.equipChance) {", "      } else if (chestRng() < 0) {",
     {_PROMPTPRE: "PRECONDITION"}),
    ("BREAK: the game script throws at load (and the one-line diagnostic keeps the real check id parseable)",
     "var spellOrder = ['missile','fire','ice','lightning','poison','arcane'];",
     "var spellOrder = ['missile','fire','ice','lightning','poison','arcane']; throw new Error('probe: loot load');",
     {_LOAD: "FAIL"}),
    # Appended so the slots above keep their test_probe_NN: the walk's own
    # pickup-radius sensitivity, with the near-chest label FIX so the walk can
    # pass at baseline radius.
    ("BREAK: a 5 u pickup radius, with the near-chest label FIX: the walker resting 6-17 u from the chest is no "
     "longer offered it",
     [(_IN_RANGE, "    var inRange = dist < 5;\n"), (_LABEL, _LABEL_FIX)], None,
     {_WALK: ("FAIL", _all_walks(_WALK_NOT_OFFERED)), _FLOOR: "FAIL"}),
]

LootSuite = suite_testcase("loot", KNOWN_BUGS, min_checks=18)
LootProbes = probe_testcase("loot", PROBES)


class WalkKnownBugDetailTests(unittest.TestCase):
    """KNOWN_BUGS[_WALK] accepts the near-chest prompt defect and nothing else (no JS engine needed).

    The positive control is the walk detail a real run prints today (jsc, Cave
    Test 12345/424242/777). Each negative control changes one walk the way the
    harness would report one more failure condition of the walk check
    (rec.ok = reached && onFloor && offered && drawn && errs === 0, and at
    least 2 walks), or one way the "no prompt" could come from the fixture's
    camera instead of the game (a read below CAM_PITCH_MAX, or a rest of 18 u
    or more, at or past the label's full-pitch cutoff), while the other walks
    stay the documented defect.
    """

    HEAD = ("walks at 30 fps (real loop) reached the chest, stood on its cave floor underground, were offered it "
            "and saw its prompt, with 0 render errors: ")
    WALKS = [
        "cavetest12345: entrance (865.3,426.9) -> chest (699.5,978.0) 8 corridor nodes, 570.7 u, 181 frames at "
        "30 fps; end at (704.8,962.0) h=-4.77 chest-cell floor -4.77 underground=true onFloor=true airborne "
        "frames 0 min h -4.77; rest 16.8 u from the chest; offered=true prompt no prompt drawn at camera pitch 1.40 = "
        "CAM_PITCH_MAX; render errors 0",
        "cavetest424242: entrance (1028.4,604.1) -> chest (615.6,785.5) 6 corridor nodes, 452.2 u, 150 frames at "
        "30 fps; end at (616.9,779.3) h=-6.45 chest-cell floor -6.45 underground=true onFloor=true airborne "
        "frames 0 min h -6.45; rest 6.3 u from the chest; offered=true prompt no prompt drawn at camera pitch 1.40 = "
        "CAM_PITCH_MAX; render errors 0",
        "cavetest777: entrance (545.3,916.0) -> chest (934.4,576.1) 7 corridor nodes, 521.9 u, 168 frames at "
        "30 fps; end at (928.3,576.0) h=-7.57 chest-cell floor -7.57 underground=true onFloor=true airborne "
        "frames 0 min h -7.57; rest 6.1 u from the chest; offered=true prompt no prompt drawn at camera pitch 1.40 = "
        "CAM_PITCH_MAX; render errors 0",
    ]

    def detail(self, walks, ok=0):
        return f"{ok}/{len(walks)} " + self.HEAD + " | ".join(walks)

    def matches(self, detail):
        return re.search(KNOWN_BUGS[_WALK][1], detail) is not None

    def test_the_documented_defect_matches(self):
        self.assertTrue(self.matches(self.detail(self.WALKS)))
        self.assertTrue(self.matches(self.detail(self.WALKS[:2])), "2 walks satisfy the check's W.length >= 2")
        edge = [self.WALKS[0], self.WALKS[1].replace("rest 6.3 u", "rest 17.9 u"), self.WALKS[2]]
        self.assertNotEqual(edge[1], self.WALKS[1], "the substitution did not apply")
        self.assertTrue(self.matches(self.detail(edge)), "17.9 u is inside the 18.0 u full-pitch cutoff")

    def test_too_few_walks_or_a_passing_walk_do_not_match(self):
        self.assertFalse(self.matches(self.detail(self.WALKS[:1])), "0/1: the check also fails on W.length < 2")
        self.assertFalse(self.matches("0/0 " + self.HEAD + "PRECONDITION: no walk ran"))
        self.assertFalse(self.matches(self.detail(self.WALKS, ok=1)))

    def test_every_other_failure_condition_of_one_walk_does_not_match(self):
        w = self.WALKS[1]
        cases = {
            "off the cave floor, above it": w.replace("h=-6.45 chest-cell floor -6.45 underground=true onFloor=true",
                                                      "h=-2.50 chest-cell floor -6.45 underground=true onFloor=false"),
            "on the surface cap": w.replace("h=-6.45 chest-cell floor -6.45 underground=true onFloor=true",
                                            "h=3.10 chest-cell floor -6.45 underground=false onFloor=false"),
            "no walkable floor in the chest cell": w.replace("chest-cell floor -6.45 underground=true onFloor=true",
                                                             "chest-cell floor none underground=true onFloor=false"),
            "on the floor height but not underground": w.replace("underground=true onFloor=true",
                                                                 "underground=false onFloor=false"),
            "the detail no longer reports onFloor": w.replace(" onFloor=true", ""),
            "stuck in a corridor": w.replace("30 fps; end at",
                                             "30 fps; STUCK 30.2 u short of node 3 at (700.1,900.2); end at"),
            "not offered": w.replace("offered=true", "offered=false"),
            "a prompt drawn": w.replace("prompt no prompt drawn", "prompt '[E] Take / +12 Gold'"),
            "render errors": w.replace("render errors 0", "render errors 2"),
            # 18.0 u is still hidden at full pitch, but r1 prints 17.95-18.05 u as
            # 18.0 and the label is drawn from 18.25 u, so the regex stops below
            # 18.0. From 18.25 to 21.75 u only the old pitch-1 cap hid the label.
            **{f"at rest {d} u": w.replace("rest 6.3 u", f"rest {d} u")
               for d in ("18.0", "18.2", "19.0", "19.5", "20.0", "20.5", "21.0", "21.9", "22.0", "35.0")},
            "read below the full downward pitch": w.replace("at camera pitch 1.40 = CAM_PITCH_MAX",
                                                            "at camera pitch 1.00 vs CAM_PITCH_MAX 1.40"),
            "the chest pass did not draw in the read frame": w.replace("at camera pitch 1.40 = CAM_PITCH_MAX",
                                                                       "at camera pitch null vs CAM_PITCH_MAX 1.40"),
            "the detail no longer reports the pitch": w.replace(" at camera pitch 1.40 = CAM_PITCH_MAX", ""),
            "a walk without a route": "cavetest424242: PRECONDITION: cavetest424242: no corridor path from an "
                                      "entrance to a chamber holding a window chest",
        }
        for name, bad in cases.items():
            with self.subTest(name):
                self.assertNotEqual(w, bad, "the substitution did not apply")
                walks = [self.WALKS[0], bad, self.WALKS[2]]
                self.assertFalse(self.matches(self.detail(walks)), self.detail(walks))
                self.assertFalse(self.matches(self.detail([bad, self.WALKS[0]])), "first walk")
                self.assertFalse(self.matches(self.detail([self.WALKS[0], bad])), "last walk")

    # A walk the corridor BREAK prints (jsc, Cave Test 12345, with the label FIX).
    STUCK = ("cavetest12345: entrance (865.3,426.9) -> chest (699.5,978.0) 8 corridor nodes, 570.7 u, 352 frames at "
             "30 fps; STUCK 177.7 u short of node 1 at (858.0,426.0); end at (858.1,425.7) h=-4.77 chest-cell floor "
             "-4.77 underground=false onFloor=false airborne frames 0 min h -4.77; rest 574.7 u from the chest; "
             "offered=false prompt no prompt drawn at camera pitch 0.07 vs CAM_PITCH_MAX 1.40; render errors 0")

    def test_break_witnesses_reject_the_unbroken_walks(self):
        # The two walk BREAKs declare the walk's baseline verdict (FAIL), so
        # their regexes must reject today's prompt-defect walks: a probe whose
        # mutation changed nothing cannot satisfy them.
        stuck, not_offered = _all_walks(_WALK_STUCK), _all_walks(_WALK_NOT_OFFERED)
        base = self.detail(self.WALKS)
        self.assertIsNone(re.search(stuck, base))
        self.assertIsNone(re.search(not_offered, base))
        self.assertIsNotNone(re.search(stuck, self.detail([self.STUCK] * 3)))
        self.assertIsNone(re.search(stuck, self.detail([self.STUCK, self.WALKS[1], self.STUCK])), "one walk not stuck")
        unoffered = [w.replace("offered=true", "offered=false") for w in self.WALKS]
        self.assertIsNotNone(re.search(not_offered, self.detail(unoffered)))
        self.assertIsNone(re.search(not_offered, self.detail([unoffered[0], self.WALKS[1], unoffered[2]])),
                          "one walk still offered")
        self.assertIsNone(re.search(not_offered, self.detail(
            [unoffered[0], unoffered[1].replace("rest 6.3 u", "rest 4.9 u"), unoffered[2]])), "a rest inside 5 u")


if __name__ == "__main__":
    unittest.main()
