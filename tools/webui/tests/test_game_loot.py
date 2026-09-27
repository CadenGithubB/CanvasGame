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
    reached on foot from the entrance at 30 fps; and it is NOT offered to a
    player on the surface cap directly above it;
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
        "NEW (loot review, not in the audit index): the prompt branch (L9406-9413) says '[E] Swap' only "
        "when currentItem.id !== eInst.id, but collectChest (L20198-20207) swaps whenever the slot is "
        "occupied; wearing the chest's own item at another quality shows '[E] Take' and A silently "
        "swaps (a q1.27 hood is traded for the chest's q0.73 one)",
        r"MISMATCH wearing the same \w+ at q1\.27: prompt '[^']*\[E\] Take' -> A SWAP"),
}

# The cave-chest classifier, window assembly copy and reserve filter used by
# more than one probe (anchors each occur exactly once in the extracted JS).
_EDGE = "        if (_tcx2 < 1 || _tcx2 >= CHUNK_CELLS - 1 || _tcy2 < 1 || _tcy2 >= CHUNK_CELLS - 1) continue;"
_EDGE_FIXED = "        if (_tcx2 < 0 || _tcx2 >= CHUNK_CELLS || _tcy2 < 0 || _tcy2 >= CHUNK_CELLS) continue;"
_CAVE_TIER = "          tier: cTier, quality: 0.7 + caveChestRng() * 0.3,"
_WIN_COPY = "          tier: tc.tier || 'common', quality: tc.quality || 1.0, relicId: tc.relicId || null,"
_RES_FILTER = "    treasureChests = treasureChests.filter(function(it){ return !inEntranceReserve(it.x, it.y); });"
_IN_RANGE = "    var inRange = dist < 90 && canReachChest(ch);\n"
_SAVE_COLLECTED = "        tcChunk.treasureChests[tc._chunkIdx].collected = tc.collected;"
_RECENTRE = "  if (pcx !== centerCX || pcy !== centerCY) {"
_HYSTERESIS = "  if (Math.abs(pcx - centerCX) > 2 || Math.abs(pcy - centerCY) > 2) {"
_N8_FIX = [
    (_EDGE, _EDGE_FIXED),
    (_CAVE_TIER, _CAVE_TIER + " cave: true,"),
    (_WIN_COPY, _WIN_COPY + " cave: !!tc.cave,"),
    (_RES_FILTER, "    treasureChests = treasureChests.filter(function(it){ return it.cave || !inEntranceReserve(it.x, it.y); });"),
]

# (description, anchor | [(anchor, replacement), ...], replacement | None, {check id: verdict under the mutation})
PROBES: list = [
    # ── FIX probes: remove a known bug's cause, its check must go PASS ────────
    ("FIX N8, both causes: terminal chambers in a chunk's edge cells keep their chest (L5966), and "
     "cave chests -- tagged at generation, tag copied into the window -- are exempt from the entrance "
     "reserve filter (L7180). The injected reserve chest has no tag, so the reserve guard stays PASS.",
     _N8_FIX, None, {_TERM: "PASS", _RESERVE: "PASS", _TERMPRE: "PASS"}),
    ("N8 edge-ring fix ALONE: the reserve cause (Cave Test 777, Endless 424242) keeps the check failing, "
     "so the check detects the second cause on its own (compare the probe above)",
     _EDGE, _EDGE_FIXED, {_TERM: "FAIL"}),
    ("BREAK on top of the N8 fix: drop the chest of every terminal chamber that lies within its radius "
     "of a lower-index terminal chamber. The old radius match let the neighbour's chest (within the "
     "radius by construction) satisfy it (review probe p2: 20/20 PASS); the centre match must FAIL.",
     [(_EDGE, _EDGE_FIXED + "\n        if (_cn2.chambers.some(function (o, oi) { return oi < _cci2 && o.terminal && "
                           "Math.hypot(o.cx - _cch2.cx, o.cy - _cch2.cy) < _cch2.radius; })) continue;")] + _N8_FIX[1:],
     None, {_TERM: "FAIL"}),
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
    ("BREAK roof pickup targeting: restore horizontal-only chest prompt",
     _IN_RANGE,
     "    var inRange = dist < 90;\n",
     {_CAP: "FAIL", _FLOOR: "PASS", _WALK: "PASS"}),
    ("FIX the Take/Swap prompt: say Swap whenever the slot is occupied, as collectChest does (L9407)",
     "          if (currentItem && currentItem.id !== eInst.id) {",
     "          if (currentItem) {",
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
    ("BREAK: shrink the pickup radius to 20 u (L19434)",
     _IN_RANGE, "    var inRange = dist < 20;\n",
     {_FLOOR: "FAIL", _WALK: "FAIL"}),
    ("BREAK: a gold chest is never marked collected (L20215-20216)",
     "    coins += ch.gold;\n    ch.collected = true;", "    coins += ch.gold;",
     {_PAY: "FAIL"}),
    ("BREAK (review p3): the floating text advertises double the gold the chest pays (L9416)",
     "          textLines.push('+' + ch.gold + ' Gold');",
     "          textLines.push('+' + (ch.gold * 2) + ' Gold');",
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
    ("BREAK: corridors are not carved into the mesh (queryCaveGeometry corridor band, L4683). Chambers "
     "still are, so the teleport floor check stays PASS; walking in from the entrance must FAIL",
     "      var outerHW = hw + 108;  // 9-cell feather band (was 20u) — wider gradient",
     "      var outerHW = -1;",
     {_WALK: "FAIL", _FLOOR: "PASS"}),
    ("BREAK: no cave network gets a terminal chamber (L4537) -- every cave-chest precondition must FAIL",
     "      var isTerminal = (step === cur.stepsLeft - 1);", "      var isTerminal = false;",
     {_TERMPRE: "FAIL", _SAMPLEPRE: "FAIL", _CAPPRE: "FAIL"}),
    ("BREAK: surface chests never hold equipment (L5851) -- the prompt scenario's precondition must FAIL",
     "      } else if (chestRng() < chTierDef.equipChance) {", "      } else if (chestRng() < 0) {",
     {_PROMPTPRE: "FAIL"}),
    ("BREAK: the game script throws at load (and the one-line diagnostic keeps the real check id parseable)",
     "var spellOrder = ['missile','fire','ice','lightning','poison','arcane'];",
     "var spellOrder = ['missile','fire','ice','lightning','poison','arcane']; throw new Error('probe: loot load');",
     {_LOAD: "FAIL"}),
]

LootSuite = suite_testcase("loot", KNOWN_BUGS, min_checks=18)
LootProbes = probe_testcase("loot", PROBES)

if __name__ == "__main__":
    unittest.main()
