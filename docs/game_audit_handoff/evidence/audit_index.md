# Audit finding index (WebPage_Games.h; line refs are header lines)

This is the id list the test-lab reviewers and the completeness critic worked
against (see lab_runs/phase2_reviews_and_critic.json). HANDOFF.md section 3 has
the full text, evidence and later corrections for every id.

## User-observed problems (the reason the audit exists)
U1 bad cave entrances; U2 player falling through floors; U3 slow rendering; U4 enemies getting stuck;
U5 surface textures/terrain blocking sight into and out of caves; U6 janky surface<->underground transitions.

## Confirmed (D)
D1  approach trench depth always 5 (e.depth undefined, L4486/L4741) vs corridor 6.0-8.5 (L4496): floor step -1.64 (seeds -0.81..-2.15) at the handover; +0.74 h jump in one tick walking out.
D2  roof (ceiling+cap) starts 162-384 u outside the arch (feather hw+108 L4684/L4702, ceiling wherever fade>0 L4756-4771, L5621, caps L6680); ceiling below outside floor at roof edge; min headroom 0.58 / 0.13 vs eye 2.4.
D3  playerUnderground = "cap above my layer" (L19355-19360): flips 3x walking in; ambient 0.90->0.45->0.81->0.45; false at the arch.
D4  cap-above floor cull ignores camera height (L12691): 3 cave-floor quads from the trench, 0 in the arch.
D5  ceilings with any walkable layer above never draw (L13045-13050): 2833 stitched / 0 drawn inside; underground floor pass submits caps + surface overhead (2786 + 2713 vs 2313 cave floor).
D6  getFloorHeightAt returns l0 blindly (L7816); l0 is the ceiling in 1226/6189 cave cells after the Z sort (L6724); feeds enemy Z (L11459), getWallTopZ, wall bases, arch base.
D7  entity cull `!playerUnderground && fh < -0.1` (L511) hides 10-95% of surface entities in normal Endless.
D8  caveCeilAt `_ch > 0.1` (L12129): every ceiling <= 0.1 -> wall-to-ceiling extension dead.
D9  ambient blend inverted and entrance-centred (L19380-19384).
D10 underground detection after dayNight early return (L19294): flag frozen when day/night off.
D11 no-candidate fallback returns topH 0 (L7901) -> step() falls to h=0 (L10172-10183): player ends under terrain (repro world (246,720) seed 12345 cave test).
D12 edge-fall threshold 3 phys units = 0.075 h (L10179) + flat per-cell Z -> micro-falls on downhill edges (refined: not every edge).
D13 Cave Test spawn at h=0 between layers (L7600, L7612-7617) (refined: free-fall only on some seeds).
D14 caves laterally open: walk sideways out through the feather, above the ceiling, inside rock.
D15 floor-height cache tick only bumped in draw() (L18967) (refined: stale reads only inside assembleWindow -> wrong wallFaceBase faces).
D16 rng2/rng share chunkRng(rx,ry,100) (L4465/L4472): normal mode always 2 entrances.
D17 terrainNoise under the wall seed (L4978->L4987): water-zone wall test reads wrong noise.
D18 patrol freeze: 2 unvalidated waypoints within +-50/+-30 (L5904/L5947), arrival radius 14 (L11295).
D19 enemy save drops underground/arenaEnemy/fromSpawner (L7369-7382 vs L7063).
D20 stat pickups rebased twice (L7117-7119 + L7320-7322); fortressAllies not rebased.
D21 player cannot die: regen (L10090) before death check (L10334); only damage write clamps at 0 (L11282).
D22 cave terminal chests gold only, no tier multiplier (L5967-5977; collectChest L20175-20220 never reads tier).
D23 WINDOW_CHUNKS 7 vs settings.chunkWindow 5; Apply duplicates enemies (L17756 vs L6334).
D24 legacy leaks into Endless: goal spawn unguarded (L11495); onCalibUpdate resetLevel(1) (L9854); fixed-level 3D floor throws every frame at L12788 (no lNColor), ctx save leak L12472.
D25 floor render buffer 40,000 cells, unguarded write L12643: Endless worst 74%; fixed Level 4 overflows by up to ~6.6k cells at pitch 1.4 + dash.

## Suspected (E)
E1 what the mouth looks like (screenshots). E2 chunk-border seams inside caves (NOT reproduced by caves_geometry). E3 networks truncated at the 3x3 region lookup (NOT reproduced).
E4 caves under low terrain: cap lifted above terrain (L6693) -> side entry / false underground. E5 _pt swallows exceptions mid-tick.
E6 16 ms gamepad polling without in-flight guard (L9799) saturates the single-task ESP32 httpd. E7 LOS flicker at corners. E8 arch pops (mixed units in canSeePoint L16465).

## Enemies (F)
F1 patrol ping-pong (D18). F2 post-chase wall alternation (no slide in patrol, L11307). F3 Brutes embedded (radius 6.72 > half cell). F4 separation tests centre cell only (L19282).
F5 walk animation driven by camera distance (L14070). F6 ring of ceilinged-but-uncarved walls: invisible+passable for surface player (L9999/L10014/L10314), solid+LOS-blocking for enemies. F7 LOS 2D only -> aggro through cave roof.

## Performance (G)
G1 floor pass: one fill per quad, 5k-22k fills/frame, per-quad closure (L12703), array per layerAt (L12504), parseInt+string per quad (L12856/L12872), comb sort per frame (L12650).
G2 walls pass: object per face + sort (L12248), getWallBiomeRGB/getBiomeAt noise at render time (L12083/L12100), gradient cache 82% misses.
G3 assembleWindow synchronous, ~17 MB allocated per rebuild, no hysteresis (L7483), 20-27 console lines per shift.
G4 fullscreen ignores settings.resolution (L691). G5 auto-overview on every Endless start (L7648) redraws 78,400 rects/frame.
G6 _rgbCache unbounded (L1927 comment says 1000-3000). G7 turn rate (and walk speed) depends on frame rate (handleInput(FIXED_DT) once per render frame L21910).
G8 ESP32: 1 MB page, no gzip/cache headers, single httpd task; Perf HUD fps = 1000/JS time (L20777).

## Persistence (H)
H1 no storage at all. H2 enemy deaths lost on eviction. H3 chest swap: quality not saved; swapped item reverts after eviction (duplication). H4 spell upgrades never reset on a new world.
H5 seed not user-settable in normal Endless; _caveTestSeedOverride console-only. H6 market/shrine guarantee only first run per page load (L6358); injected feature lost on eviction.
H7 pickRandomRelic depends on equipped relic (L3688). H8 entityDeltas / endlessCaveNetworks unbounded (+11 KB per crossing).

## Debug tools (I)
I1 caveDiag lastTransitionSnapshot always null (__caveDebugLast never written). I2 caveGaps tautology. I3 caveCapture reports l0 as floor; config block literals (L1670); no reproduce fields; no loader.
I4 caveTest dead/stale. I5 __caveStats mislabelled. I6 profile chart only draws ceilings > 0.1. I7 layer-types legend swapped; cave-colours legend never shown; DEBUG_FLOOR/_LINE dead.

## New findings from phase-1 lab authors (verified by probes; see HANDOFF.md 3.11)
N1 movement speed (not just turn rate) halves at 30 fps (applyGamepad impulse per render frame, damping per physics step).
N2 enemies cannot land a hit in open ground: repelFromEnemies pushes to 12+8*size (L10042) > attack windup range 6+8*size (L11372).
N3 jumps pass through cave ceilings (no ceiling test in airborne integrator L10137; picker ignores ceilings L7877).
N4 airborne landing snaps UP onto a floor within STEP_UP in one tick (L10146-10159).
N5 resetEndlessMode does not reset jumpAirborne/jumpVelZ; fortressAllies/completedFortresses not reset on a new world.
N6 Cave Test spawn teleport without updateChunks -> first tick re-centres -> D19 wipes all cave enemies' underground flags.
N7 surface enemies (z:0) on ground above h=1.6 hidden by the below-floor cull (L508).
N8 terminal chambers in a chunk's outer cell ring get no chest (L5966); cave chest in the entrance reserve silently dropped (L7180).
N9 spawnGoal throws when int32(Date.now()^0xBEEF) < 0 (L4085/L4104) -- about half of all clock values.
N10 Settings Day/Night toggle hit area overlaps Apply button.
N11 first frame toggles CONTROL_MODE to gyro-aim for keyboard players (gpLast.buttons 0 active-low reads SELECT held, L998/L19000-19010).
N12 guaranteed market/shrine vanishes after its chunk is evicted.
N13 capped cave walls show through from the cap (unit mismatch L12052) on seed 1.
N14 two entrance trees of one network get independent depths -> cliffs where they meet; steep feather slope > STEP_UP; STEP_DOWN relaxed only within 260 u but approach is 480 u.
N15 inside the tunnel, sky shows overhead even with D5 removed (tunnel ceiling ends / far end open).
N16 caveCapture reports buried ceiling as overhead when standing on the cap; profile chart floor follows l0; control map colours by l0; ceilSkipLowCeil counts every non-ceiling layer; caveGaps/wallFaceBase sample one cell past W/N face vertex; DEBUG_TEXTURE dead.
N17 [STATE] console.warn spam beyond 1500 u or after any render error (L21953); _rgbCache grows to 28-52k in far biomes.
