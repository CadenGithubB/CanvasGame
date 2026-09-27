# Sub-audit report: Persistence and seed audit

Final report of a read-only audit agent (first session phase). The orchestrator spot-checked its claims against source; see HANDOFF.md for which were confirmed, refined or refuted. Line numbers are header lines of components/hardwareone/WebPage_Games.h.

Your prior audit's claim holds (no persistence across reloads), but "session-level" overstates it, and I found seven in-session defects. Most were reproduced by executing the real game code.

# Persistence audit: `./components/hardwareone/WebPage_Games.h` (Endless mode)

**Method.** I read the source and also ran it. The unmodified JS (header lines 227–22514) was loaded headless under macOS `jsc` with DOM stubs. Scripts t1–t12 are in `<task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/agent_persist/`. **RT** means reproduced at runtime in that harness. The repo is untouched. Every finding is CONFIRMED unless marked SUSPECTED.

**Prior claim: CONFIRMED, but imprecise.**
- There are zero hits for localStorage, sessionStorage, indexedDB, cookie, caches, serviceWorker, history, location, URLSearchParams, WebSocket, XHR, sendBeacon or raw `fetch`. There is no `beforeunload` handler.
- The only network calls are `hw.*` (9709–9864, 22062–22079). They carry sensor and debug CLI strings, never game state.
- The server registers only GET /games (`WebPage_Games.cpp:27`).
- "Session-level" is really per-Endless-run: every Endless click runs `chunks = {}; entityDeltas = {};` (7518–7519). Some state also outlives the run it belongs to (see below).

## Survival matrix

Cells are S (survives), L (lost) or P (partial).

- **c, d** both go through the Start button → `startGame()` 22020–22026 (`ENDLESS_MODE = false; … resetLevel(1)`). There is no resume path, and Stop is terminal: `running = true` is set only at 22022, 22135 and 22167.
- **e** is the Endless button, the `cavetest` dropdown value, or a cave-test flag checkbox. All call `resetEndlessMode()`. Picking a normal terrain mid-run resets nothing (22148–22151).
- **f, g**: everything is L, because all state lives in the JS heap.
- **h**: S in the open tab, since nothing is server-side. The exception is active sensor polling: web sessions are RAM-only (`HardwareOne.cpp:1785`), and any 401 runs `w.location.href='/login'` (`hw._auth401`, `WebServer_Utils.cpp:777`), which is L. SUSPECTED; not run.

| Row | a: cached | b: evicted | c, d: Start | e: Endless |
|---|---|---|---|---|
| Position/Z | S 7290 | S | L 7707 | L 7597 |
| HP/mana/gold (no XP system exists) | S | S | gold L 7753; HP/mana NOT reset; HEALTH_MAX and speed bonuses leak (reset only at 7579–7583) RT | L 7545, 7582 |
| Equipment/relic (no inventory, just 5 slots) | S | S | L 22024 | L 7585 |
| Spell unlock/tier 2 | S | S | S | S: never reset (`spells` assigned only at 1080; mutated at 4225/4229) RT |
| Explored fog | S 7441–7455 | S 7458→6316 | L | L |
| Enemy deaths | S 7358 | L: no enemy delta exists (6302–6318); all respawn at full HP RT | L | L |
| Enemy position/HP | P: saved at 7369–7382, but flags stripped RT | L | L | L |
| Chest collected | S | S: index delta 7403–7408→6304 RT | L | L |
| Chest swapped contents | P: `quality` omitted at 7397–7401 (1.30→1.134 RT) | L: reverts to original, duplicating the item RT | L | L |
| Shrine used | S | S 7438→6317 RT | L | L |
| Spawner | S 7417–7420 | destroyed S (7422→6310); hp/spawnCount L, so it refills RT | L | L |
| Arena completed | S 19568 | S | kept | L 7574 |
| Fortress/garrison/lectern, allies | S | S | S | S: assigned only at 1144–1145, never reset; leaks into the next seed's world RT |
| Shop | No per-shop stock. The list is derived from player state (4169–4191). Companions reset only at 7584, so they leak into Level mode RT | | | |
| Day-night | S | S | S | S (`dayTime` touched only at 1197/19302) |
| WORLD_SEED | S | S | kept, unused | L: re-rolled at 7522 (cave test uses 12345) |
| Cave networks | S | S: cache never evicted (4441; cleared at 7536/7725), deterministic | L | L |

## Findings

1. **Column c is unreachable: the player cannot die.**
   - `updateEnemies` (19406) applies the only damage write, `health = Math.max(0, health - rawDmg)` (11282).
   - `step` (19412) then regenerates health (10090) before the only death check, `if (health <= 0 && running)` (10334).
   - RT: 600 ticks of 9999 damage left `gameOverState=false` and HP at 0.05.
   - If death were reachable, "Press Start to play again" (18118) would leave Endless mode. Neither `startGame` nor `resetLevel` assigns `health`, so the restart begins at 0.05/110 RT.

2. **Every chunk crossing strips enemy flags.**
   - The save writes a fixed field list (7369–7382). The restore reads `en.underground` (7063), which the save never writes.
   - RT, after one crossing: `arenaEnemy` went 4→0 and the arena moved to `state=waveDelay` with every enemy still alive (19559–19563).
   - In practice, crossing one chunk boundary per wave wins the tome without a kill. The boundary is 240px from the altar.
   - `fromSpawner` also went 1→0, which defeats the global spawner cap (20238).

3. **Stat pickups are rebased twice.**
   - They are rebuilt in new-origin coordinates (7004, 7117–7123) and then shifted again (7320–7322).
   - RT: the collectable point is always exactly ∓480px from its ruin.

4. **Settings "Apply" corrupts enemies.**
   - `WINDOW_CHUNKS = settings.chunkWindow` (17756) runs before the save pass inside the deferred `assembleWindow` (17767→6334).
   - The defaults disagree (7 at line 293, 5 at line 1186), so any Apply triggers it, even with the window size unchanged.
   - RT: 41 expected enemies became 74, with 14 exact duplicates and a killed enemy back alive.
   - The comment at 17757 ("intentionally NOT called here") contradicts the call at 17767.

5. **Enemies duplicate at the eviction boundary.**
   - Enemies are saved to the chunk they are in now (7361–7366, clamped to the window).
   - RT: with the home chunk evicted and the neighbour still cached, one enemy existed twice: a fresh 3/3 copy at its origin plus the hp=1 wanderer.

6. **The world is not a pure function of the seed.**
   - (a) The market/shrine guarantee is gated on `if (!grid)` (6358), and `grid` is null only at 910. It therefore applies only to the first run per page load.
     - RT, same seed 236456: run 1 had a market at −1,3; run 2 had none.
     - The injected market exists only in the cache. After eviction and regeneration `market=null`, while `discoveredMarkets` keeps a phantom minimap marker.
   - (b) `pickRandomRelic` excludes `equipment.relic` (3688). RT, same chunk: chrono_shard became phoenix_feather.

7. **The delta store grows without bound.**
   - `entityDeltas[key].explored = new Uint8Array(ch.exploredCells)` (7457–7458) runs for every window chunk on every shift, whether or not anything changed.
   - RT: +7 keys and +11.2KB per crossing, reaching 882 keys / 1.41MB after 120 crossings. Growth is linear and never pruned.
   - `endlessCaveNetworks` reached 225 keys over the same walk.

## Specific questions

**Q1. Seed control and determinism.**
- There is no way to choose a seed. The HTML (lines 1–214) has no seed element, and there is no URL parsing.
- A console-set `WORLD_SEED` is overwritten at 7522 on every launch. `_caveTestSeedOverride` is read at 7522 and written nowhere, so it is a console-only hook for Cave Test.
- The seed is shown only in the console (7640), the caveCapture snapshot (1649) and the Cave Debug panel (21241).
- `Math.random` does not appear anywhere in 4274–7346 or the helpers called from there.
- The only nondeterministic calls in that range are `Date.now()` at 6298, 6833/6895 and 7008. None affect content.
- Runtime spawns do use `Math.random` (11212–11220, 19516–19517, 20261–20268).
- `generateChunk` does not clobber `noiseSeed`. It saves and restores it (`var oldSeed = noiseSeed;` 4977 … `noiseSeed = oldSeed;` 4996). `biomeNoise` and `geographyNoise` do the same (2450–2453, 2459–2465).
- RT: 3 blocks of 81 chunks generated in row, reverse and shuffled order produced 0 differences. Generation is order-independent.
- Caveats:
  - There is no try/finally, and `updateChunks` swallows exceptions (7498). SUSPECTED trigger, since it needs an exception; RT showed that a leaked wall seed does change terrain.
  - `terrainNoise` at 4987 runs under the wall seed, so the water-zone wall test samples a different field than the real heights (5448).

**Q2. Delta keys.**
- Chests and spawners are keyed by `_chunkKey` plus the array index `_chunkIdx` (7041, 7048). The only guard is `if (ci2 < chunk.treasureChests.length)` (6307).
- Shrines are keyed by chunk. Stat pickups use `Math.floor(wx)+','+Math.floor(wy)` (7115). Arenas and fortresses use `regionX,regionY`.
- A delta can land on the wrong entity. RT: leaving Cave Test via the dropdown (`CAVE_TEST_MODE = false`, no reset), then evicting and returning, made delta `0,1#0` (cave chest @432,920) mark a never-opened chest @102,858 as collected.

**Q3. Cache bounds.**
- The eviction rule is `var maxDist = WINDOW_CHUNKS + 2;`, measured as Chebyshev distance from the window centre (7464–7470).
- That bounds the cache at 361 chunks for a 7×7 window and 529 for 9×9.
- `lastAccess` (6298, 7023) is written and never read.

**Q4.** See the two enemy rows of the matrix plus findings 2, 4 and 5.

**Q5. Contradictions and dead code.**
- All three save functions are live; their only call sites are 6334, 7390 and 7337. Nothing saves on Stop.
- The comment at 7391 ("deltas for eviction") covers only `collected` and `!active`.
- The comment at 4477 says "1-2 entrances". Lines 4465 and 4472 seed identical RNG streams, so the count is always 2 (RT 137/137).
- `fortressAllies` is missing from the rebase list (7295–7325).
- `stats` is never reset (1105).
- Level-mode `floorMesh` has no `l0Color` (written only at 6288/6566). A 3D draw in Level mode therefore throws at 12788 (caught by the render wrapper). RT: pressing Start after Endless, where `MODE3D` stays true, reproduced it.