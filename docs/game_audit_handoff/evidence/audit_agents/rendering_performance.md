# Sub-audit report: Rendering performance audit

Final report of a read-only audit agent (first session phase). The orchestrator spot-checked its claims against source; see HANDOFF.md for which were confirmed, refined or refuted. Line numbers are header lines of components/hardwareone/WebPage_Games.h.

# Performance audit of the games page (WebPage_Games.h)

Line numbers below refer to the header `./components/hardwareone/WebPage_Games.h`.

**Bottom line:** the slowness comes from the floor pass issuing 5k–22k individually styled path fills per frame, a count that grows roughly with viewDist². Full-resolution fullscreen and the auto-overview multiply it. The floor buffer, the debug flags and the ESP32 are not the cause.

**Method:** I read the source and ran the unmodified JS (L227–22514) two ways:
- Headless in jsc with DOM/canvas stubs, which gives exact call counts.
- In Chromium 152 in a hidden pane, stepping frames manually. This measures main-thread JS plus canvas-command time; GPU raster time was not observable.

The repo was not touched. Harness files are in `<task-temp>/local-project/c716b5be-a242-4f76-851e-24d7f9c34109/scratchpad/agent_perf/`: `stub.js`, `drive2.js`–`drive7.js`, `cullsim.js`, `oobtest.js`, `sortcost.js`, `www/game.html`.

## 1. Floor buffer: the previous claim is mostly wrong

**Stride and capacity (CONFIRMED).** The buffer stores 3 floats per cell, not per quad: L12642 "Pack [distSq, x, y]". 120000 / 3 = 40,000 cells. The layer loop runs later (L12680), so the "×5 layers" factor never applies.

**Bounds check (CONFIRMED absent).** L12643-46: `_cellBuf[_cellCnt * 3] = distSq; … _cellCnt++;`. The distance and FOV culls run before the write, so the real bound is the circle-and-wedge intersection, not the window size.

**Maximum fill.** I swept an exact replica of the cull loop over all camera angles at pitch 1.4 with dash FOV (max cells buffered against the 40,000 capacity):

| Case | Level camera | Worst case | Overflow? |
|---|---|---|---|
| Endless, launch default | 6,146 | 10,022 (25%) | No |
| Endless, high | 12,700 | 17,173 | No |
| Endless, ultra (1800, 9×9) | 24,269 | 29,792 (74%) | No |
| Fixed L1 (mesh 240×160, gs 6, L2480) | — | 38,001 cells in the mesh | Impossible |
| Fixed L2/L3 | — | 21,301 cells in the mesh | Impossible |
| Fixed L4 (vd = max(settings, 2880×0.8) = 2304, L7677) | 39,703 (99.3%) | 46,547 (43,122 at pitch 1.4 alone) | Yes, by up to 6,547 |

Endless cannot overflow: the render-distance slider tops out at 1400 (L17880) and ultra is the highest preset.

**What overflow does (executed replica).**
- There is no throw and no corruption.
- Out-of-range writes are ignored. Reads return undefined, so `mesh.layerCount[NaN]` makes the layer loop skip the cell.
- The in-range portion still sorts correctly.
- The cells lost are the last in scan order (y ascending, L12623), which means the southern rows regardless of distance.
  - Facing north, that is the floor at your feet, and the dark ground fill (L12479) shows through.
  - Facing south, it is the fog-faded far rows.

**Overflow has no effect today (CONFIRMED by execution).** The fixed-level 3D floor never draws at all, so L4 overflow is currently invisible.
- `generateFloorMesh` (L2485-93) never creates `l0Color`.
- L12788 `baseCol = mesh.l0Color[idx0]` therefore throws every frame.
- Start → "3D View" gave `_ptErrors={"platforms3D":30}` after 30 frames.
- `ctx.save` was called 810 times against 780 `restore` calls: the save at L12472 leaks one state per frame because L12926 is skipped.
- The `_pt` try/catch (L20578) hides it after 3 `console.error` calls.
- This is the real "see-through terrain" in fixed levels.

**The 512-entry buffers.**
- `renderEntities3D` is guarded: L580 `if (count >= 512) break; // safety cap`. It drops by array/chunk order, not by distance. Measured max visible scatter is 15 / 30 / 87 (medium / high / ultra), so the cap is unreachable.
- `drawEnemies3D` is unguarded (theoretical; enemy counts never get there):
  - L14010 `var vc = _eVisCache[_eVisCount];` throws a TypeError at the 513th visible enemy, and the whole enemy pass is skipped.
  - Slot 511 is also used as the sort temp (L14019).
  - Enemies are capped at 4 per chunk (L5875); measured totals are 46–111.

## 2. Sorting per frame

- **Floor:** an in-place comb sort per cell (L12650-66); layers within a cell draw in index order. The replica measured 188k compares / 0.49 ms at default and 841k / 2.24 ms at ultra, about 20% of floor JS.
- **Walls:** one sort per face list, L12248 `wallFaces.sort(function(a, b) { return b.dist - a.dist; });`.
  - Each frame builds a fresh array and a 16-property object literal per face (L12149).
  - The comparator is a new closure each frame; the key is precomputed.
  - The list holds 178–910 faces.
- **Ceiling:** no sort (quadrant iteration, L12964).
- **Small `Array.sort` with closures:** L9179, 9549, 9667, 16173, 16345, 16540. Insertion sorts of ≤512: L591, L14020.
- **Key recomputed in the comparator:** only L20706 `parseFloat(b.avg) - parseFloat(a.avg)`, every 5 s, and the result is discarded because the logs at L20707 are commented out.
- **One-time sorts:** L1574, 3856, 4102, 6518, 10800. **Dead code:** L20633, 21020.

## 3. Per-frame allocations

Default has about 6.1k floor cell-layers per frame; ultra about 24k.

- L12504 `return [z, t];` allocates an array per cell-layer. The ceiling pass does the same (L12981) even when there are no caves (0 fills measured).
- L12703 `function _clampNeighborZ(i, tz) {` is declared inside the layer loop, so a closure is created per cell-layer.
- L12856 `parseInt(baseCol.slice(1), 16)` runs per quad, contradicting the L12785-86 comment "no per-frame conversion".
- L12872 `'rgb(' + …` builds a unique string per quad, bypassing `rgbQ`.
- Smaller per-frame sources:
  - Wall face objects, and L12108 `function caveCeilAt` per wall cell.
  - `projToScreen` (L470) returns an object per point.
  - Options literal per enemy (L14007), despite the comment "no per-frame allocations" (L13992).
  - About 45 `_pt` closures per frame.
  - Skybox lookup objects plus an IIFE (L11567-99).
  - `drawFloorScatter3D` rebuilds `_fsScatter` from all 705–2,286 window items.
- `_rgbCache` grows without bound. L1927 says "~1000-3000 entries"; I measured 16,769 after 360 frames and 33,787 later.

Impact is SUSPECTED moderate. Chromium p95 was 7.5 ms against a median of 6.3, so GC is not the main problem. To settle it, check Minor GC frequency in DevTools Performance.

## 4. Per-frame loops and generation queries at render time

- **Floor (L12623):** the bounding box scan covers (2·75+1)² = 22,801 cells at viewDist 900, and 90,601 at ultra. Each quad does 3 `findMatchZ`, 4 projections, 1 sqrt (L12863) and 4 AO reads. There is no trig or noise per quad.
- **Under-foot skirt waste (CONFIRMED):** L12630-41 buffers cells behind the camera, but any corner with `cfwd < 1` rejects the whole quad (L12757). At pitch 1.4 the buffer holds 9,638 cells instead of 6,142, while fills are unchanged (5,193 vs 5,201). That is 57% more cell work for zero pixels.
- **Generation noise at render time (CONFIRMED, walls only):**
  - L12100 `getBiomeAt(...)` and L12083 `getWallBiomeRGB(...)` run per visible wall cell per frame; both call `biomeNoise` (L2448).
  - L11851-75 calls `getFloorHeightAt` up to 10 times per face, despite the L1221 comment "zero per-frame sampling cost".
  - These are single-octave and cheap: the wall pass is 12–16% of the frame.
  - `queryCaveGeometry`, `terrainNoise` and `queryEntranceZone` are generation-only.
- **`getFloorHeightAt` "cache":** the comment says "32-slot" but the arrays are 1024 entries (L7799), and it fronts a single typed-array read (L7816). The cache is slower than the read it guards.

## 5. Canvas state cost

**Calls per frame at launch default (measured):**
- 5,614 `fill()` and 39.6k path calls.
- 5,645 `fillStyle` sets, 5,247 of them unique strings.
- 10,840 `globalAlpha` sets (L12868/12870/12922).
- 329 gradients and 55 save/restore pairs.
- One path per quad, no batching by colour (L12873-76).
- The wall gradient cache (L11961) misses 323 of 392 faces, 82%.
- No `getImageData`; `shadowBlur` only in effects; no `devicePixelRatio` handling.

**Chromium main-thread time per frame at 360×240** (about 1.1 µs per fill; the floor pass is 70–80% of each):

| Preset | ms/frame | Fills/frame |
|---|---|---|
| low | 1.9 | 1.7k |
| medium | 6.3 | 5.4k |
| high | 13.0 | 11.4k |
| ultra | 24.6 | 22k |

**With raster forced every frame** (hidden pane, probably CPU raster, so SUSPECTED for a GPU-accelerated visible tab): default 9.9 ms at 360×240 and 28.6 ms at 1080p; ultra 34.6 ms and 63 ms.

**Fullscreen resolution.** L691 `canvas.width = window.innerWidth || screen.width;` ignores `settings.resolution`. Only pressing Apply while already fullscreen scales the canvas (L17776), so the preset resolution has no effect on fullscreen entry.

**Auto-overview.**
- L7648 `setTimeout(function() { if (!overviewActive) toggleOverview(); }, 100);` flips every Endless start into the debug overview. I verified this in Chromium.
- L21778 then redraws it every frame, one `fillRect` per grid cell (L18305-31).
- That is 78,400 rects and 26 ms per frame at 1400×900, until the canvas is clicked.

**Window size at launch.** The game starts with a 7×7 chunk window, not the "medium 5×5" the settings show (L965 vs L1186). `applySettings` only runs from the Apply button (L18018).

## 6. Debug overhead is negligible

- `_pt` is always on (not gated by `DEBUG_PERF`). It costs 72 ns per call, about 3 µs per frame.
- `DEBUG_PERF` (L21926-49) pushes an object per frame, then averages into a commented-out log.
- `DEBUG_EFFECTS` only logs on projectile events (L10974).
- There are 149 `console.log`, 4 `warn` and 5 `error` calls. The per-frame ones are gated by debug flags.
- Ungated repeaters:
  - L21953 `[STATE…]` warn, probability 0.005 per frame.
  - Event logs at L11318, 11099, 10934 and 20279.
  - 20–27 logs per chunk crossing, whose arguments are computed even when console is a no-op: L6793 `meshCave.reduce(...)` and the full-mesh scans at L7211-43, about 5 ms per rebuild.
- The ESP32 firmware no-ops `console.log`/`warn` by default (WebServer_Utils.cpp:719), but the strings are still built.

**Diagnostic trap:**
- The Perf HUD "fps" is 1000 / JS-time (L20777), so it cannot see raster or vsync.
- Settings → Show FPS uses the real frame delta (L17546).
- Comparing the two tells you whether a frame is JS-bound or raster-bound.
- The floor stage is labelled `platforms3D` (L18971).

## 7. Chunk streaming hitches

The rebuild is synchronous, not time-sliced, and has no hysteresis. L7483 `if (pcx !== centerCX || pcy !== centerCY)` leads to L7491 `assembleWindow(pcx, pcy)` inside `step()` (L10306), and rebuilds every window array.

**Measured in Chromium:**
- 7×7: 44–98 ms with cached chunks, 54–121 ms with 7 new chunks.
- 9×9: 63–206 ms.
- 5×5: about 20 ms.
- Switching to ultra: 536 ms.
- A 1-unit wiggle back and forth across a chunk edge rebuilds every time.
- Walking straight crosses a boundary every 480 / 90 = 5.3 s.

**Bytes allocated per rebuild at 7×7 (N = 78,400 cells):**
- 627,200 (grid group)
- 3,057,600 (mesh typed arrays)
- 7 × 78,400 × 4 = 2,195,200 (colour pointer arrays)
- 470,400 + 78,400 + 392,000
- 1,254,400 (`wallFaceBase`)
- 627,200 + 470,400 + 156,800
- That sums to 9.3 MB.
- In addition, L843 `new Float32Array(cnt)` allocates one typed array per cell, 78,400 objects, an estimated 8 MB.
- The total is about 17 MB per rebuild, and 1.65× that at 9×9.
- L16990-17010 also issues 78,400 `fillRect` calls onto a 90×65 minimap canvas.

## 8. Loop timing

- The loop uses `requestAnimationFrame` (L21894) with a fixed 1/60 physics step, at most 4 steps per frame: L21916 `while (_physicsAccum >= FIXED_DT_MS && steps < MAX_PHYSICS_STEPS)` and L21921 `if (_physicsAccum > FIXED_DT_MS * MAX_PHYSICS_STEPS) _physicsAccum = 0;`.
- The step dt never grows, so a slow frame cannot make the player tunnel through the floor. Below 15 fps the simulation runs in slow motion instead.
- L21910 `handleInput(FIXED_DT)` runs once per render frame. With L19080 `var arrowSpeed = 2.0 * (dt || 0.016);`, turn rate therefore scales with frame rate: at 30 fps turning is half speed.

## 9. ESP32-hosted versus desktop

Rendering is 100% browser-side. Keyboard/mouse Endless makes no requests after the page loads, so the ESP32 cannot affect frame rate. The ESP32-specific costs are:

- **Page send.**
  - The whole game goes out in one `httpd_resp_send_chunk(req, R"JS(…)JS", HTTPD_RESP_USE_STRLEN)` call (L214–22516), 1,013,225 bytes.
  - gzip -9 would reduce that to 269,892 bytes (3.75×); 156 KB is full-line comments and 98 KB is indentation.
  - Only `httpd_resp_set_type` is set (WebServer_Utils.cpp:668), so there are no gzip or cache headers.
  - Because the script is inline in an authenticated chunked page, it is re-downloaded on every visit.
  - The send blocks the single httpd task for the whole transfer, with `gMeshActivitySuspended = true` (WebServer_Server.cpp:1560).
  - Load time is SUSPECTED at 2–15 s; measure it in the DevTools Network tab.
- **Hardware input modes.**
  - L9799 `gpPoll = setInterval(tick, 16);` plus L22007 `setInterval(pollIMU, 60)` demand about 79 requests/s, with no in-flight guard and a cache-busting `ts=` on every URL.
  - Against a single-task server that queues up and shows as input lag (SUSPECTED; check the Network waterfall).
  - The log poller (800 ms, FW-debug only) re-downloads the whole log each time (L22079-83).

## 10. Dead code and comments that contradict the code

- Eleven top-level functions are never called, 18.2 KB in total:
  - `drawPerfOverlay` (L20604)
  - `_legacyDrawPerfHudOnCanvas_UNUSED` (L20991)
  - `drawInventoryOverlay`, `drawSimpleWallSlice`, `shadeWall`, `worldToScreen3D`, `avgColor`, `getFloorColorAt`, `detectPreset`, `queryEntranceRamp`, `queryEntranceApproach`
- `_cacheCommitFrame()` is only called from `drawPerfHud` (L20966), so the cache counters never reset with the HUD off (6.65 M after 360 frames).
- Stale comments:
  - L12451 "Currently a minimal stub" sits on the production floor renderer.
  - L1397 cites `drawFloor3D`, which no longer exists.
  - L6829 says "(15u)" while `cellSize` is 12.
  - L784's sizing formula "(2 * viewDist/gs + 2)^2 ~ 200^2" gives 91,204 at ultra, not 40,000.