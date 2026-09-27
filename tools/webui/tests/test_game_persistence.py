"""Persistence of the Endless crawler across window shifts, chunk eviction,
Settings changes and restarts within one page session.

The game keeps nothing in browser storage (audit H1). That is reported as a
NOTE/METRIC (``persistence.storage_refs``), never as a verdict: H1 is an audit
PROBLEM, so a check rewarding "no storage" would call its fix a regression.
"Persistence" here therefore means in-memory mechanisms of WebPage_Games.h:

  - the chunk cache ``chunks{}``, which assembleWindow (6324) rebuilds on every
    chunk crossing and evictDistantChunks (7463) prunes beyond WINDOW_CHUNKS+2;
  - the per-chunk delta store ``entityDeltas`` (969), which only records
    chestsCollected, spawnersDestroyed (by array index), explored and shrineUsed;
  - the cave-network memo ``endlessCaveNetworks`` (1153);
  - the globals resetEndlessMode (7511) does or does not reset on a restart.

What the harness (tools/webui/harness/game_persistence_harness.js) drives, all
through the game's own functions: same-seed restarts (also mid-jump), generation
in different visit orders and at different clock times, chunk regeneration under
different player equipment, evict-and-revisit round trips (kills, collected
chests, destroyed spawners, used shrines, swapped chests, explored cells, the
spawn window's market/shrine), a straight walk across chunk lines (delta-store
growth), a 42-chunk walk (cave-network memo growth), enemy flags / stat pickups /
fortress allies across a window shift, Settings clicks (a resize Apply, a click
at the Apply button's centre), clearing an Endless window (real loop() frames)
and IMU calibration inside a Cave Test world.

Seeds: --endless-seeds (normal Endless, default 424242) and --seeds (Cave Test,
default 12345: the underground-enemy and calibration checks).

This suite OWNS (other suites removed their copies): enemy flags across a window
shift (D19: underground/arenaEnemy/fromSpawner), chest-swap quality/item
persistence and collected-chest-after-eviction (H3).

Two review suggestions are deliberately not emitted as headless verdicts:

  - H5 (a player-selectable normal-Endless seed): ``LAB.startEndless(seed)``
    steers the game's one ``Math.random`` call as test scaffolding; it is not a
    player control. The env returns a stub for every ``getElementById`` and
    discards every ``addEventListener`` registration, so a headless "seed UI"
    check would be a source-text convention, not a behavior test. The real page
    has only ``btnEndless`` (HTML L88), and its handler calls the random-seed
    ``resetEndlessMode`` path (L22163-22183).
  - the critic's proposed *normal Endless* calibration scenario: normal
    Endless's button explicitly sets ``calibrating=false`` and never calls
    ``startCalibration`` (L22163-22183). Its only call sites are ``startGame``'s
    fixed-level and Cave Test hardware paths (L22004/L22036). Synthesizing
    calibration after a normal-Endless start would test an unreachable state.
    The suite instead covers the reachable Cave Test hardware path.

Run:

    python3 -m unittest tools.webui.tests.test_game_persistence -v
    HW1_GAME_PROBES=1 python3 -m unittest tools.webui.tests.test_game_persistence -v   # + mutation probes
    python3 -m tools.webui.game_lab persistence --endless-seeds 424242,31337,99 --seeds 12345,777 -v

Each KNOWN_BUGS entry is (reason, detail regex): the check FAILS on today's code
and its FAIL detail must match the regex, which pins the documented mechanism
(a known bug that starts failing for another reason is not "expected"). A PROBES
entry proves a check fails (or passes) for the reason given, by mutating a temp
copy of the game JS and watching the check flip.
"""

from __future__ import annotations

import unittest

from tools.webui.game_lab import probe_testcase, suite_testcase

P = "persistence: "

LOAD = P + "game script evaluates without throwing"
RESTART_SAME_WORLD = P + "restarting Endless with the same seed in the same page session rebuilds the same world"
SPAWN_FEATURES_SURVIVE = P + "the spawn window's markets and shrines are back at their world positions after a trip that evicts the spawn window"
RESTART_SPELLS = P + "a new Endless world starts with the page-load spell table (no unlocks or tier-2 upgrades carried over)"
RESTART_FORTRESS = P + "a new Endless world starts without the previous world's fortress allies or fortress progress"
RESTART_RESETS = P + "a new Endless world starts with no coins, equipment, stat bonuses, cleared arenas or chunk deltas from the previous world"
RESTART_MID_JUMP = P + "restarting Endless mid-jump starts the new world exactly as a start from rest (no carried-over jump)"
VISIT_ORDER = P + "the same seed builds identical chunks regardless of visit order"
RELIC_INDEPENDENT = P + "chunk contents do not depend on the relic the player has equipped"
KILLED_STAYS_DEAD = P + "a killed enemy stays dead after its chunk is evicted and revisited"
COLLECTED_STAYS = P + "a collected chest stays collected after its chunk is evicted and revisited"
EXPLORED_SURVIVES = P + "explored minimap cells survive chunk eviction and revisit"
SPAWNER_DESTROYED = P + "a destroyed spawner stays destroyed after its chunk is evicted and revisited"
SHRINE_USED = P + "a used shrine stays used after its chunk is evicted and revisited"
SWAP_SHIFT = P + "a chest whose item was swapped keeps the swapped item and quality across a window shift"
SWAP_EVICT = P + "a chest whose item was swapped keeps the swapped item and quality after its chunk is evicted and revisited"
DELTA_NOINFO = P + "walking across chunk lines without interacting stores no chunk delta that carries no information"
MEMO_BOUND = P + "the cave-network memo stays within the regions the chunk window can reach on a long walk"
STORE_BOUND = P + "the cave-network memo and delta store stay bounded on a 42-chunk no-interaction walk"
UNDERGROUND_FLAG = P + "a cave (underground) enemy is still underground after a window shift"
ARENA_FLAG = P + "an arena-wave enemy is still an arena enemy after a window shift"
SPAWNER_FLAG = P + "a spawner-born enemy is still spawner-born after a window shift"
WOUNDED_HEALTH = P + "a wounded enemy keeps its health after a window shift"
STAT_PICKUPS = P + "stat pickups stay at their world position across window shifts"
FORTRESS_ALLIES = P + "fortress allies stay at their world position across a window shift"
WINDOW_MATCHES_SETTINGS = P + "the chunk window in use at start is the size the settings panel shows"
APPLY_RESIZE = P + "a Settings Apply that changes the chunk window keeps every enemy exactly once (none lost, none duplicated, no kill revived)"
APPLY_CENTRE = P + "a click at the centre of the Settings Apply button applies the staged settings"
APPLY_UNCOVERED = P + "no other Settings hit area covers any part of the Apply button"
ENDLESS_NO_GOAL = P + "clearing every enemy in an Endless window neither spawns a fixed-level exit goal nor throws"
CALIBRATION = P + "completing IMU calibration after a Cave Test start keeps the Cave Test world (no switch to fixed level 1)"

KNOWN_BUGS: dict[str, tuple[str, str]] = {
    RESTART_SAME_WORLD: (
        "audit H6; WebPage_Games.h:6356-6435 -- the guaranteed market/shrine injection is gated on !grid (6358) and "
        "resetEndlessMode (7511) never clears grid, so only the page's first world gets it (seed 424242: shrine@-1,1 "
        "missing on restart)",
        r"differ after restart: -?\d+,-?\d+:\S*features.*injected in world 1: (market|shrine)@"),
    SPAWN_FEATURES_SURVIVE: (
        "audit N12; 6356-6435 + 7463-7471 -- the injected shrine/market is written straight into the cached chunk "
        "object, no delta records it and generateChunk cannot reproduce it, so evictDistantChunks deletes it for good",
        r"after the return GONE: (shrine|market)@"),
    RESTART_SPELLS: (
        "audit H4; spells are assigned once at 1080 and resetEndlessMode (7511-7589) never resets them -- shop unlocks "
        "(applyShopItem 4225) and tier-2 upgrades (4229/19937) carry into the next world",
        r"after restart: carried over .*(unlocked=true|tier=2)"),
    RESTART_FORTRESS: (
        "audit N5; resetEndlessMode (7511-7589) resets companions (7584) but not fortressAllies (1145) or "
        "completedFortresses (1144) -- a new world keeps the old garrison allies (stale window coords) and its "
        "fortresses pre-completed",
        r"after restart: allies=[1-9]\d* completedFortresses=[1-9]"),
    RELIC_INDEPENDENT: (
        "audit H7; pickRandomRelic (3685-3693) skips equipment.relic, and generateChunk rolls epic chests with it "
        "(5849) -- the same chunk rolls a different relic depending on what the player wears when it is first generated",
        r"chunk components that differ: chests"),
    KILLED_STAYS_DEAD: (
        "audit H2; 6302-6318 applies only chest/spawner/explored/shrine deltas -- there is no enemy delta, so an "
        "evicted chunk regenerates every enemy the player killed there",
        r"alive again at their spawn points after evict\+revisit: [1-9]\d*/\d+ \(no enemy delta"),
    SWAP_SHIFT: (
        "audit H3; saveAllEntityDeltas 7396-7401 writes equipId/relicId back to the chunk but not quality, so the "
        "reassembled chest (7036-7041) reverts to the generated quality",
        r"swapped to (\w+) q=([\d.]+); after a window shift: \1 q=(?!\2)"),
    SWAP_EVICT: (
        "audit H3; collectChest swaps (20183-20205) never set collected and no delta records the swap (7403-7409), so "
        "a regenerated chunk hands the original item back (a relic chest re-rolls via pickRandomRelic, 3688)",
        r"swapped to (\w+)(?: q=[\d.]+)?; after evict\+revisit: (?!\1\b)\w+"),
    DELTA_NOINFO: (
        "audit H8; saveAllEntityDeltas 7457-7458 stores a 1,600-byte explored snapshot for EVERY window chunk on every "
        "shift, all-zero ones included (seed 424242: 55 of 70 records carry no information after 4 new windows)",
        r"records carrying no information [1-9]\d*/\d+"),
    MEMO_BOUND: (
        "audit H8; endlessCaveNetworks (1153) is only ever added to (generateCaveNetwork 4441-4567) and reset only by "
        "resetEndlessMode (7536) -- seed 424242 reaches 95 memo entries on a 42-chunk walk vs a 64-region working set",
        r"memo entries every 3 regions (\d+/){4}\d+, max \d+ vs bound \d+ .*only ever added to"),
    STORE_BOUND: (
        "audit H8; the same 42-chunk, no-interaction walk exposes both unbounded stores: endlessCaveNetworks is never "
        "evicted (1153/4441-4567), while saveAllEntityDeltas snapshots a 1,600-byte explored array for every window "
        "chunk on every shift even when every cell is zero (7457-7458). A cache-scoped implementation needs at most "
        "the 64-region working set and 4 KiB of non-interaction deltas.",
        r"memo max \d+ vs bound \d+; delta bytes max [1-9]\d* vs bound 4096.*endlessCaveNetworks.*snapshots explored"),
    ARENA_FLAG: (
        "audit D19; arenaEnemy (spawnArenaWave 19531) is copied by neither saveEnemyStateToChunks (7369-7381) nor "
        "assembleWindow (7051-7063), so a wave counts as cleared (19548-19556) while its enemies still live",
        r"still arenaEnemy after the shift 0/[1-9]"),
    SPAWNER_FLAG: (
        "audit D19; fromSpawner (updateEnemySpawners 20275) is copied by neither saveEnemyStateToChunks (7369-7381) "
        "nor assembleWindow (7051-7063), so the spawner cap (20235-20241) stops counting it",
        r"fromSpawner=true before, fromSpawner=undefined after"),
    STAT_PICKUPS: (
        "audit D20; statPickups are built in the NEW origin's coordinates (7117-7119) and then shifted again with "
        "everything else (7320-7322), so each shift misplaces them by exactly the shift",
        r"off by \(-?(\d+)\.0,-?(\d+)\.0\) after shift \(-?\1,-?\2\)"),
    WINDOW_MATCHES_SETTINGS: (
        "audit D23; WINDOW_CHUNKS starts at GAME_CONFIG.world.windowChunks = 7 (293/965) while settings.chunkWindow "
        "and every quality preset below 'high' say 5 (1180-1186)",
        r"WINDOW_CHUNKS=7, settings\.chunkWindow=5"),
    APPLY_RESIZE: (
        "audit D23; applySettings (17752-17767) sets WINDOW_CHUNKS before the rAF assembleWindow runs its save pass "
        "(6334), so saveEnemyStateToChunks clears/clamps against the NEW window: seed 424242 loses 30 enemies growing "
        "7->9 and duplicates 22 shrinking back",
        r"(lost on grow [1-9]|duplicate pairs \d+/[1-9])"),
    APPLY_CENTRE: (
        "audit N10; the Day/Night toggle's hit area spans the panel width (17949) and overlaps the Apply button "
        "(55% of it); handleSettingsClick (18005) takes the first area containing the click, so a click at Apply's "
        "centre toggles Day/Night and leaves the panel open",
        r"went to the 'toggle dayNight' area"),
    APPLY_UNCOVERED: (
        "audit N10; drawSettingsOverlay registers the panel-wide Day/Night hit area before Apply (17949 vs 17982), "
        "and handleSettingsClick takes the first match (18005), covering 220/400 samples (55%) of Apply. Testing the "
        "whole rectangle prevents a partial narrowing that merely uncovers its centre from counting as fixed.",
        r"hidden samples [1-9]\d*/400, fraction 0\.55"),
    ENDLESS_NO_GOAL: (
        "audit D24 + N9; updateEnemies 11495 calls spawnGoal regardless of mode -- one clock phase spawns a "
        "fixed-level goal in Endless, the other throws a TypeError inside spawnGoal (its LCG goes negative when "
        "int32(Date.now()^0xBEEF) < 0, 4085-4104), swallowed by _pt (20576)",
        r"goalSpawned=true goal at world.*thrown inside spawnGoal"),
    CALIBRATION: (
        "audit D24; onCalibUpdate (9843-9855) calls resetLevel(1) whatever the mode, so finishing IMU calibration "
        "after btnStart's Cave Test path (21990-22009) replaces the Cave Test world with fixed level 1",
        r"cave networks [1-9]\d* -> 0"),
}

# (description, anchor, replacement, {check id: expected verdict}), or the
# multi-site form (description, [(anchor, replacement), ...], None, {...}).
# Anchors must occur exactly once in game_lab.game_js(); replacements keep the
# line count so header line numbers stay true.
#
# Not probed on purpose:
#   - RESTART_RESETS' "equipment" clause: LAB.startEndless mirrors the btnEndless
#     handler, which replaces the whole equipment object itself (22168) before
#     resetEndlessMode runs, so no single mutation of the game text the harness
#     executes can make equipment survive a restart. The coins, stat-bonus,
#     cleared-arena and delta clauses each have their own BREAK probe below.
#   - COLLECTED_STAYS' "not offered again" clause follows from `collected`
#     (updateTreasureChests 19431 skips collected chests); the chestsCollected
#     BREAK flips the whole check.
PROBES = [
    # ── FIX probes: remove a known bug's cause, its check must PASS ──────────
    ("FIX [D23a]: start the window at the settings' size (5); the resize Apply bug (D23b) stays",
     "windowChunks:   7,", "windowChunks:   5,",
     {WINDOW_MATCHES_SETTINGS: "PASS", APPLY_RESIZE: "FAIL"}),
    ("FIX [D23b]: Apply saves entity state with the OLD window size and the rebuild skips its own save pass",
     [("    WINDOW_CHUNKS = settings.chunkWindow;",
       "    var _oldWC = WINDOW_CHUNKS; WINDOW_CHUNKS = settings.chunkWindow;"),
      ("      requestAnimationFrame(function() { assembleWindow(_rebuildPcx, _rebuildPcy); });",
       "      requestAnimationFrame(function() { var _nwc = WINDOW_CHUNKS; WINDOW_CHUNKS = _oldWC; if (grid) saveAllEntityDeltas();"
       " WINDOW_CHUNKS = _nwc; _skipWindowSave = true; assembleWindow(_rebuildPcx, _rebuildPcy); });"),
      ("  if (grid && ENDLESS_MODE) saveAllEntityDeltas();",
       "  if (grid && ENDLESS_MODE && !_skipWindowSave) saveAllEntityDeltas(); _skipWindowSave = false;"),
      ("function assembleWindow(centerCX, centerCY) {",
       "var _skipWindowSave = false; function assembleWindow(centerCX, centerCY) {")],
     None,
     {APPLY_RESIZE: "PASS", WINDOW_MATCHES_SETTINGS: "FAIL"}),
    ("FIX [N10]: the Day/Night toggle's hit area covers its checkbox and label, not the panel width",
     "_settingsClickAreas.push({x: dnX, y: dnY, w: panW - pad * 2, h: fpsBoxSize, action: 'toggle', key: 'dayNight'});",
     "_settingsClickAreas.push({x: dnX, y: dnY, w: Math.min(panW - pad * 2, fpsBoxSize + 116 * S), h: fpsBoxSize, action: 'toggle', key: 'dayNight'});",
     {APPLY_CENTRE: "PASS", APPLY_UNCOVERED: "PASS"}),
    ("BREAK [D19]: saveEnemyStateToChunks loses the repaired underground flag",
     "caveSpawnId: e.caveSpawnId || null, underground: e.underground || false,",
     "caveSpawnId: e.caveSpawnId || null, underground: false,",
     {UNDERGROUND_FLAG: "FAIL"}),
    ("FIX [D19]: arenaEnemy survives saveEnemyStateToChunks and assembleWindow",
     [("patrolIdx: e.patrolIdx || 0, facing: e.facing || 0",
       "patrolIdx: e.patrolIdx || 0, facing: e.facing || 0, arenaEnemy: e.arenaEnemy"),
      ("patrolIdx: en.patrolIdx, facing: en.facing || 0, underground: en.underground || false});",
       "patrolIdx: en.patrolIdx, facing: en.facing || 0, underground: en.underground || false, arenaEnemy: en.arenaEnemy});")],
     None,
     {ARENA_FLAG: "PASS", SPAWNER_FLAG: "FAIL", UNDERGROUND_FLAG: "FAIL"}),
    ("FIX [D19]: fromSpawner survives saveEnemyStateToChunks and assembleWindow",
     [("patrolIdx: e.patrolIdx || 0, facing: e.facing || 0",
       "patrolIdx: e.patrolIdx || 0, facing: e.facing || 0, fromSpawner: e.fromSpawner"),
      ("patrolIdx: en.patrolIdx, facing: en.facing || 0, underground: en.underground || false});",
       "patrolIdx: en.patrolIdx, facing: en.facing || 0, underground: en.underground || false, fromSpawner: en.fromSpawner});")],
     None,
     {SPAWNER_FLAG: "PASS", ARENA_FLAG: "FAIL"}),
    ("FIX [H2]: persist each window chunk's live enemy list as a delta and apply it on regeneration",
     [("  console.log('[ENEMY-SAVE] Saved ' + saved",
       "  for (var _kd = 0; _kd < WINDOW_CHUNKS * WINDOW_CHUNKS; _kd++) { var _kk = (windowCX + _kd % WINDOW_CHUNKS) + ',' +"
       " (windowCY + Math.floor(_kd / WINDOW_CHUNKS)); if (chunks[_kk]) { if (!entityDeltas[_kk]) entityDeltas[_kk] = {};"
       " entityDeltas[_kk].enemies = chunks[_kk].enemies; } } console.log('[ENEMY-SAVE] Saved ' + saved"),
      ("    if (deltas.explored) chunk.exploredCells = deltas.explored;",
       "    if (deltas.explored) chunk.exploredCells = deltas.explored; if (deltas.enemies) chunk.enemies = deltas.enemies.slice();")],
     None,
     {KILLED_STAYS_DEAD: "PASS"}),
    ("FIX [D20]: do not shift statPickups a second time",
     "statPickups[sp].x -= shiftX; statPickups[sp].y -= shiftY;",
     "/* statPickups are built in the new origin already */",
     {STAT_PICKUPS: "PASS"}),
    ("BREAK [D20]: omit the repaired fortress ally rebase",
     "fortressAllies[ai4].x -= shiftX; fortressAllies[ai4].y -= shiftY;",
     "/* mutation: fortress allies remain in the previous window coordinates */",
     {FORTRESS_ALLIES: "FAIL"}),
    ("FIX [H3] shift half only: save a swapped chest's quality back to its chunk; eviction still loses the swap",
     "tcChunk.treasureChests[tc._chunkIdx].relicId = tc.relicId;",
     "tcChunk.treasureChests[tc._chunkIdx].relicId = tc.relicId; tcChunk.treasureChests[tc._chunkIdx].quality = tc.quality;",
     {SWAP_SHIFT: "PASS", SWAP_EVICT: "FAIL"}),
    ("FIX [H3] eviction half only: a delta records the chest's item+quality and generateChunk re-applies it",
     [("tcChunk.treasureChests[tc._chunkIdx].relicId = tc.relicId;",
       "tcChunk.treasureChests[tc._chunkIdx].relicId = tc.relicId; if (!entityDeltas[tc._chunkKey]) entityDeltas[tc._chunkKey] = {};"
       " (entityDeltas[tc._chunkKey].chestItems = entityDeltas[tc._chunkKey].chestItems || {})[tc._chunkIdx] ="
       " {equipId: tc.equipId, relicId: tc.relicId, quality: tc.quality};"),
      ("    if (deltas.explored) chunk.exploredCells = deltas.explored;",
       "    if (deltas.explored) chunk.exploredCells = deltas.explored; if (deltas.chestItems) for (var _cik in deltas.chestItems) {"
       " var _cit = chunk.treasureChests[_cik]; if (_cit) { _cit.equipId = deltas.chestItems[_cik].equipId;"
       " _cit.relicId = deltas.chestItems[_cik].relicId; _cit.quality = deltas.chestItems[_cik].quality; } }")],
     None,
     {SWAP_EVICT: "PASS", SWAP_SHIFT: "FAIL"}),
    ("FIX [H3] complete: quality written back to the chunk AND the swap recorded as a chunk delta",
     [("tcChunk.treasureChests[tc._chunkIdx].relicId = tc.relicId;",
       "tcChunk.treasureChests[tc._chunkIdx].relicId = tc.relicId; tcChunk.treasureChests[tc._chunkIdx].quality = tc.quality;"
       " if (!entityDeltas[tc._chunkKey]) entityDeltas[tc._chunkKey] = {};"
       " (entityDeltas[tc._chunkKey].chestItems = entityDeltas[tc._chunkKey].chestItems || {})[tc._chunkIdx] ="
       " {equipId: tc.equipId, relicId: tc.relicId, quality: tc.quality};"),
      ("    if (deltas.explored) chunk.exploredCells = deltas.explored;",
       "    if (deltas.explored) chunk.exploredCells = deltas.explored; if (deltas.chestItems) for (var _cik in deltas.chestItems) {"
       " var _cit = chunk.treasureChests[_cik]; if (_cit) { _cit.equipId = deltas.chestItems[_cik].equipId;"
       " _cit.relicId = deltas.chestItems[_cik].relicId; _cit.quality = deltas.chestItems[_cik].quality; } }")],
     None,
     {SWAP_SHIFT: "PASS", SWAP_EVICT: "PASS"}),
    ("FIX [H7]: relic rolls ignore the equipped relic",
     "if (equipment.relic && equipment.relic.id === RELIC_KEYS[i]) continue;",
     "/* roll independent of equipment */",
     {RELIC_INDEPENDENT: "PASS"}),
    ("FIX [N5]: resetEndlessMode clears fortress allies and fortress progress",
     "  companions = [];\n  equipment = {armor: null, hat: null, robes: null, boots: null, relic: null};",
     "  companions = []; fortressAllies = []; completedFortresses = {};\n"
     "  equipment = {armor: null, hat: null, robes: null, boots: null, relic: null};",
     {RESTART_FORTRESS: "PASS"}),
    ("BREAK [N5]: spawn settling forgets to clear the old jump",
     "  jumpVelZ = 0;\n  jumpAirborne = false;\n  pos.floorZ = 60 + h * 40;",
     "  pos.floorZ = 60 + h * 40;",
     {RESTART_MID_JUMP: "FAIL"}),
    ("FIX [D24]: only fixed levels spawn an exit goal",
     "if (!goalSpawned && enemies.length === 0 && spawnersAlive === 0) {",
     "if (!ENDLESS_MODE && !goalSpawned && enemies.length === 0 && spawnersAlive === 0) {",
     {ENDLESS_NO_GOAL: "PASS"}),
    ("FIX [D24]: finishing calibration rebuilds fixed level 1 only outside Endless/Cave Test",
     "    calibrating = false;\n    resetLevel(1);",
     "    calibrating = false;\n    if (!ENDLESS_MODE) resetLevel(1);",
     {CALIBRATION: "PASS"}),
    ("FIX [H6]: resetEndlessMode clears grid, so every world gets the market/shrine guarantee; eviction still loses it",
     "  chunks = {};\n  entityDeltas = {};",
     "  chunks = {};\n  entityDeltas = {}; grid = null;",
     {RESTART_SAME_WORLD: "PASS", SPAWN_FEATURES_SURVIVE: "FAIL"}),
    ("FIX [N12] by delta: the injected market/shrine is recorded as a chunk delta and re-applied by generateChunk",
     [("        _rebuildChunkWalls(_mc);",
       "        _rebuildChunkWalls(_mc); if (!entityDeltas[_mk]) entityDeltas[_mk] = {}; entityDeltas[_mk].market = _mc.market;"),
      ("        _rebuildChunkWalls(_sc);",
       "        _rebuildChunkWalls(_sc); if (!entityDeltas[_sk]) entityDeltas[_sk] = {}; entityDeltas[_sk].shrine = _sc.shrine;"),
      ("    if (deltas.shrineUsed && chunk.shrine) chunk.shrine.used = true;",
       "    if (deltas.market && !chunk.market) chunk.market = deltas.market; if (deltas.shrine && !chunk.shrine) chunk.shrine = deltas.shrine;"
       " if (deltas.shrineUsed && chunk.shrine) chunk.shrine.used = true;")],
     None,
     {SPAWN_FEATURES_SURVIVE: "PASS", RESTART_SAME_WORLD: "FAIL"}),
    ("FIX [N12] by pinning: a chunk holding an injected market/shrine is never evicted",
     [("        _rebuildChunkWalls(_mc);", "        _rebuildChunkWalls(_mc); _mc._pinned = true;"),
      ("        _rebuildChunkWalls(_sc);", "        _rebuildChunkWalls(_sc); _sc._pinned = true;"),
      ("    if (Math.abs(ch.cx - centerCX) > maxDist || Math.abs(ch.cy - centerCY) > maxDist) {",
       "    if (!ch._pinned && (Math.abs(ch.cx - centerCX) > maxDist || Math.abs(ch.cy - centerCY) > maxDist)) {")],
     None,
     {SPAWN_FEATURES_SURVIVE: "PASS"}),
    ("FIX [H8]: store an explored delta only for a chunk with explored cells",
     "      if (!entityDeltas[key]) entityDeltas[key] = {};\n      entityDeltas[key].explored = new Uint8Array(ch.exploredCells);",
     "      if (ch.exploredCells.indexOf(1) >= 0) { if (!entityDeltas[key]) entityDeltas[key] = {};\n"
     "      entityDeltas[key].explored = new Uint8Array(ch.exploredCells); }",
     {DELTA_NOINFO: "PASS", EXPLORED_SURVIVES: "PASS"}),
    ("FIX [H8]: evictDistantChunks also drops cave-network memo entries more than 3 regions from the window centre",
     "function evictDistantChunks(centerCX, centerCY) {\n  var maxDist = WINDOW_CHUNKS + 2;",
     "function evictDistantChunks(centerCX, centerCY) { var _rcx = Math.floor(centerCX / 3), _rcy = Math.floor(centerCY / 3);"
     " for (var _nk in endlessCaveNetworks) { var _np = _nk.split(','); if (Math.abs(+_np[0] - _rcx) > 3 ||"
     " Math.abs(+_np[1] - _rcy) > 3) delete endlessCaveNetworks[_nk]; }\n  var maxDist = WINDOW_CHUNKS + 2;",
     {MEMO_BOUND: "PASS"}),
    ("FIX [H8] both stores: skip all-zero explored deltas and evict cave-network memo entries outside the reachable working set",
     [("      if (!entityDeltas[key]) entityDeltas[key] = {};\n      entityDeltas[key].explored = new Uint8Array(ch.exploredCells);",
       "      if (ch.exploredCells.indexOf(1) >= 0) { if (!entityDeltas[key]) entityDeltas[key] = {};\n"
       "      entityDeltas[key].explored = new Uint8Array(ch.exploredCells); }"),
      ("function evictDistantChunks(centerCX, centerCY) {\n  var maxDist = WINDOW_CHUNKS + 2;",
       "function evictDistantChunks(centerCX, centerCY) { var _rcx = Math.floor(centerCX / 3), _rcy = Math.floor(centerCY / 3);"
       " for (var _nk in endlessCaveNetworks) { var _np = _nk.split(','); if (Math.abs(+_np[0] - _rcx) > 3 ||"
       " Math.abs(+_np[1] - _rcy) > 3) delete endlessCaveNetworks[_nk]; }\n  var maxDist = WINDOW_CHUNKS + 2;")],
     None,
     {DELTA_NOINFO: "PASS", EXPLORED_SURVIVES: "PASS", MEMO_BOUND: "PASS", STORE_BOUND: "PASS"}),
    ("FIX [H4]: a restart restores the page-load spell table (resetEndlessMode wrapped at load time)",
     "var spellOrder = ['missile','fire','ice','lightning','poison','arcane'];",
     "var spellOrder = ['missile','fire','ice','lightning','poison','arcane']; var _sp0 = JSON.stringify(spells);"
     " var _rem0 = resetEndlessMode; resetEndlessMode = function () { var s0 = JSON.parse(_sp0);"
     " for (var k0 in s0) spells[k0] = s0[k0]; return _rem0.apply(this, arguments); };",
     {RESTART_SPELLS: "PASS"}),
    # ── BREAK probes: inject a bug, a passing check must FAIL ────────────────
    ("BREAK: the game script throws at load",
     "var spellOrder = ['missile','fire','ice','lightning','poison','arcane'];",
     "var spellOrder = ['missile','fire','ice','lightning','poison','arcane']; throw new Error('probe: load');",
     {LOAD: "FAIL"}),
    ("BREAK: chunk difficulty depends on how many chunks are cached",
     "  var difficulty = getDifficultyAt(cx * CHUNK_SIZE + CHUNK_SIZE / 2, cy * CHUNK_SIZE + CHUNK_SIZE / 2);",
     "  var difficulty = getDifficultyAt(cx * CHUNK_SIZE + CHUNK_SIZE / 2, cy * CHUNK_SIZE + CHUNK_SIZE / 2)"
     " + Object.keys(chunks).length * 0.001;",
     {VISIT_ORDER: "FAIL"}),
    ("BREAK: chunk generation depends on the wall clock (a later visit builds a different chunk)",
     "  var rng = chunkRng(cx, cy, 0);",
     "  var rng = chunkRng(cx, cy, Math.floor(Date.now() / 1000) % 2);",
     {VISIT_ORDER: "FAIL"}),
    ("BREAK: resetEndlessMode forgets to clear entityDeltas",
     "  chunks = {};\n  entityDeltas = {};",
     "  chunks = {};\n  void 0;",
     {RESTART_RESETS: "FAIL"}),
    ("BREAK: resetEndlessMode stops clearing coins",
     "  coins = 0;\n  projectiles = [];",
     "  void 0;\n  projectiles = [];",
     {RESTART_RESETS: "FAIL"}),
    ("BREAK: resetEndlessMode stops clearing the permanent stat bonuses",
     "  permanentSpeedBonus = 0;\n  permanentHealthBonus = 0;\n  permanentManaBonus = 0;",
     "  void 0;\n  void 0;\n  void 0;",
     {RESTART_RESETS: "FAIL"}),
    ("BREAK: resetEndlessMode stops clearing cleared arenas",
     "  completedArenas = {};",
     "  void 0;",
     {RESTART_RESETS: "FAIL"}),
    ("BREAK: the chestsCollected delta is not applied on regeneration",
     "if (ci2 < chunk.treasureChests.length) chunk.treasureChests[ci2].collected = true;",
     "if (false) chunk.treasureChests[ci2].collected = true;",
     {COLLECTED_STAYS: "FAIL"}),
    ("BREAK: the explored delta is not applied on regeneration",
     "    if (deltas.explored) chunk.exploredCells = deltas.explored;",
     "    if (false) chunk.exploredCells = deltas.explored;",
     {EXPLORED_SURVIVES: "FAIL"}),
    ("BREAK: the spawnersDestroyed delta is not applied on regeneration",
     "        if (si2 < chunk.enemySpawners.length) chunk.enemySpawners[si2].active = false;",
     "        if (false) chunk.enemySpawners[si2].active = false;",
     {SPAWNER_DESTROYED: "FAIL"}),
    ("BREAK: the shrineUsed delta is not applied on regeneration",
     "    if (deltas.shrineUsed && chunk.shrine) chunk.shrine.used = true;",
     "    if (false) chunk.shrine.used = true;",
     {SHRINE_USED: "FAIL"}),
    ("BREAK: saveEnemyStateToChunks heals every enemy",
     "      enemyType: e.enemyType, health: e.health, maxHealth: e.maxHealth,",
     "      enemyType: e.enemyType, health: e.maxHealth, maxHealth: e.maxHealth,",
     {WOUNDED_HEALTH: "FAIL"}),
]

PersistenceSuite = suite_testcase("persistence", KNOWN_BUGS, min_checks=31)
PersistenceProbes = probe_testcase("persistence", PROBES)

if __name__ == "__main__":
    unittest.main()
