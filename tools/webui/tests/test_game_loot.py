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
        "draws above the chest (legacy pass floorZ+bodyH+lidH+8, chest-model pass its 'label' anchor); within "
        "~18-22 u of the chest it projects wholly below the canvas even at full downward pitch, so "
        "withSceneDepthBillboard culls it, while updateTreasureChests still offers the chest (dist < 90 && "
        "canReachChest) and A/E loots it. The walker releases W ~70 u out at ~120 u/s and cave damping (0.975 per "
        "60 Hz step) slides it to 6-17 u from the chest: offered=true, no prompt.",
        r"^0/\d+ walks at 30 fps (?!.*STUCK)(?!.*underground=false)(?!.*offered=false)(?!.*prompt ')"
        r"(?!.*render errors [1-9])(?!.*rest (?:2[2-9]|[3-9]\d|\d{3,})\.\d u from the chest)"
        r".*offered=true prompt no prompt drawn; render errors 0$"),
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
    ("Re-centre hysteresis alone (a plausible G3 perf change, L7483): the 4-chunk trip still re-centres, "
     "so the re-centre check's precondition holds and it stays PASS",
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
     {_WALK: "FAIL", _FLOOR: "PASS"}),
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
     {_WALK: "FAIL", _FLOOR: "FAIL"}),
]

LootSuite = suite_testcase("loot", KNOWN_BUGS, min_checks=18)
LootProbes = probe_testcase("loot", PROBES)

if __name__ == "__main__":
    unittest.main()
