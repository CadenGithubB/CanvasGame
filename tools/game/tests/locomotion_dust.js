// Footstep and dash dust (unified effects V1, slice S6). A full-game host
// loads the real manifest; the scenes are authored (a flat floor, a 20
// degree ramp, a 6 H cliff, a 0.9 H ledge (a walk step down), two hut-ruin
// wall rows 0.14 and 0.12 x 240 u tall side by side, an overhang with a cap
// and no ceiling, and a two-layer cave with floor 0, ceiling 4 H and cap
// 5 H under every cell) or a generated Endless window (seed 777) for the
// chunk crossing. The movers are the game's own: the player walks, jumps
// and dashes through real fixed ticks (runSimulationTick: handleInput,
// step, updateChunks), enemies walk by npcMoveToward, a slime companion
// hops in updateCompanions; the dust comes from the engine's movement
// observers, recipes and renderer.
// Risks covered: dust on every tick or none per stride, strides counted in
// the air or through a teleport or chunk shift (window-local positions), a
// stride that never restarts or starts half-done after a teleport, steps at
// the feet's lagging height instead of the slope under them (the player's
// steps, dash, trail and landing, an NPC's steps), dust laid on the ground
// under a wall top the player stands on (or on the ground 33 u below a foot
// beside its edge), the player's own step and landing puffs spawned (hidden,
// wasted) in first person or missing in 2D (or a 1-2 px speck there) and
// other cameras, including a non-follow camera the feet are behind (G1), a
// self puff refused although it is in view, one-puff steps that vanish at
// the Low setting or on screen far from the player in 2D, distance losses
// left uncounted, dash screen puffs outside the lower half, on one side only
// or off a portrait canvas, a dash that bursts on every dashing tick, a
// world burst or trail spawned at the first-person player's feet, a trail
// that outlives the dash, a first-person dash with nothing on screen, a
// dash's dust in mid-air at airborne feet (at the top of a jump, off a
// wall's end) or on ground farther than a step below them, screen puffs
// for a dash with no ground under it, screen puffs half off the canvas or
// sized by canvas height, a frontSides override refused, mostly below the
// canvas at pitch 0, floating above the ground ahead, or evicting a live
// particle (or allocating) for a wedge point with no ground (G2), a
// landing that reads the vertical speed step() has already zeroed (a
// constant puff), lands on every grounded tick, after a hop shorter than 6
// ticks or not after one of 6, or scales past 0.4-1.6, a 2D landing drawn
// as discs instead of growing rings (G3), a crossing or teleport taken for
// a stride (G4), NPC dust off the NPC's stride or side, on the roof above
// a cave NPC, from a stunned, dormant, dead or distant
// body or from a stale position after a stun, uncapped, from list order
// instead of the nearest bodies, written onto the gameplay records, for a
// hopping slime never, only on the hops the squash test sees, away from
// the slime or past the cap (G5), a step on the lower floor of a walk step
// down laid at the easing feet (a reach under 1 H), 2D NPC dust spawned
// above or below the view, missed in its corners or centred on the camera
// instead of the view, far 3D dust held at the 2D floor, observers busy at
// Particles 0, density thinning counted as distance losses, a roof test
// that calls the allocating helper or disagrees with it, the observer
// tables sized before their constants load,
// dust kicked forward (a step, the dash burst, its trail, an NPC's step), in
// one fixed colour or the surface's colour underground (an NPC's or the
// player's own), a preset that ignores its switch or the Unified switch,
// and dust that draws a random number. Since S9 (fix): an airborne dash in
// a cave refused by a ceiling test read in world units, a mesh-less level's
// flat floor put over a wall top under the feet, a support tolerance other
// than 1 u over the feet, and an NPC's stride kept across a teleport; every
// authored scene starts at noon, so no check depends on earlier sections.
// The water system merge: steps, a landing, a dash and its trail, and an
// enemy's steps that kick up ground dust under a water surface (wading).
// Oracles: the authored geometry (floor, ramp plane, cliff, wall tops,
// ceiling and cap heights), the walked path measured here from the player's
// world position after every tick (window origin added), the spec's rules
// restated (22 u a stride for the player, 14 + 10 size u for enemies, wolves
// x 0.8; 6 airborne ticks; clamp(-vz / 200, 0.4, 1.6) from the jumpVelZ
// recorded here on the last airborne tick; a step within 1 H of the feet; a
// dash's ground within 1 H below airborne feet), the hop phases recorded
// from updateCompanions (a hop lands at each multiple of pi), material
// literals restated from 01-materials.js (kicked up 60% toward #d8cfbd
// unless already lighter, the S6 amendment), the perspective 1 / distance, the
// chunk generator's own biome field, the game's getCaveSpaceAt, the view
// rectangle at 1 u a pixel, recorded Canvas commands per frame stage, and
// throwing random streams.
// Mutations are applied to slurped sources only (anchors match exactly once):
//   --dust-every-tick       --ignore-airborne       --self-world
//   --dash-every-tick       --land-every-tick       --land-reads-current-vz
//   --local-coords          --no-teleport-reset     --npc-surface-z
//   --npc-steps-every-tick  --npc-ignores-stun      --npc-no-cap
//   --dust-fixed-colour     --dust-ignores-under    --dust-ignores-toggle
//   --dust-math-random      --step-at-feet          --puff-2d-world-size
//   --late-observer-constants --no-wall-support     --step-no-reach
//   --dash-at-feet          --land-at-feet          --trail-at-feet
//   --npc-step-at-feet      --trail-not-self        --trail-world
//   --selfview-any-3d       --selfview-any-place    --ifvisible-skip
//   --wedge-at-feet         --round-small-bursts    --2d-perspective-lod
//   --2d-npc-radius         --lod-uncounted         --screen-canvas-heights
//   --no-fresh              --npc-list-order        --writes-body
//   --player-not-under      --npc-radius-250        --npc-radius-230
//   --no-dormant            --no-dead               --npc-no-alternate
//   --dust-forward          --land-after-7          --land-after-5
//   --no-clamp              --tp-kill               --tp-keep-acc
//   --under-allocates       --roof-ignores-caps     --dash-air-feet
//   --dash-air-any-height   --dash-dust-forward     --trail-dust-forward
//   --npc-dust-forward      --land-2d-puff          --dust-3d-floor
//   --wedge-near            --wedge-admit-first     --wedge-allocates
//   --hop-z-test            --slime-at-player       --slime-uncapped
//   --reach-8               --2d-keep-no-y          --2d-radius-halfwidth
//   --2d-centre-cam         --screen-size-canvas-height
//   --lod-counts-density    --observers-at-p0       --player-no-alternate
//   --nonfollow-no-draw
// S9 (the S6 verifier's surviving hand mutants and the gridCave step fixture):
//   --dash-support-above    --dash-support-through-roof --dash-support-wall-underground
//   --dash-support-cave-wall --dash-support-no-wall  --dash-support-lowest
//   --dash-support-no-flat-floor --step-cave-wall   --step-no-cap
//   --p0-keeps-position     --resume-dash-zero      --resume-air-zero
//   --wedge-ignores-pitch   --wedge-one-side        --wedge-ignores-walls
//   --npc-scan-when-off     --screen-y-width-unit   --screen-dash-any-body
// S9 fix (the S9 review's surviving hand mutants):
//   --dash-support-ceiling-units --dash-support-floor-over-wall
//   --dash-support-tol-2    --dash-support-tol-0    --dash-support-wall-tol-0
//   --npc-tp-keep-acc       --dash-reach-open       --step-reach-open
// Water system merge (wading: no ground dust under a water surface):
//   --dust-while-wading     --trail-while-wading
(function () {
  var G = (0, eval)('this'), output = (__engine === 'node' || __engine === 'deno') ? console.log.bind(console) : __out;
  var checked = 0, failed = 0, loadErrors = [], warnings = [], originalRandom = Math.random, originalNow = Date.now;
  var DT = 1 / 60, TAN20 = Math.tan(20 * Math.PI / 180);
  function has(flag) { return __argv.indexOf(flag) >= 0; }
  var mutationRun = __argv.some(function (a) { return /^--/.test(a); });
  function needed(name, flags) {
    if (!mutationRun || flags.some(has)) return true;
    output('SKIP ' + name + ' (mutation run for another check)');
    return false;
  }
  function mutate(source, flag, before, after) {
    if (!has(flag)) return source;
    if (source.split(before).length !== 2) throw Error('MUTATION_ANCHOR ' + flag);
    return source.replace(before, after);
  }
  G.__dustSource = function (path, source) {
    if (path === 'src/11-fx-engine.js') {
      // Water system merge: steps, landings and dash starts under water puff anyway.
      source = mutate(source, '--dust-while-wading', '  if (fxWading(x, y, z)) { st.obsWading++; return; }             // under water: no ground dust (06-water.js)\n', '');
      // ... and the dash trail keeps puffing while it runs through water.
      source = mutate(source, '--trail-while-wading', '    if (fxWading(pos.x, pos.y, ctx.z)) return 2;                   // wading: no trail dust this tick\n', '');
      // A player puff on every moving tick instead of every stride.
      source = mutate(source, '--dust-every-tick', '  while (O.acc >= FX_STEP_STRIDE) {', '  if (d > 0) {');
      // Airborne travel counted as strides.
      source = mutate(source, '--ignore-airborne', '  if (air) return;                                              // only grounded travel strides\n', '');
      // The landing scale read from jumpVelZ in the landing tick (step() has zeroed it).
      source = mutate(source, '--land-reads-current-vz', '      var s = -O.vz / FX_LAND_VZ;', '      var s = -jumpVelZ / FX_LAND_VZ;');
      // A landing on every grounded tick.
      source = mutate(source, '--land-every-tick', '    if (O.air >= FX_LAND_TICKS) {', '    if (true) {');
      // A dash burst on every tick the dash lasts, not at its start.
      source = mutate(source, '--dash-every-tick', '  if (dashUntil > O.dash) {', '  if (gameTimeNow() < dashUntil) {');
      // Window-local player positions: a chunk shift looks like a 480 u move.
      source = mutate(source, '--local-coords', '  var wx = pos.x + ox, wy = pos.y + oy, air = !!jumpAirborne;', '  var wx = pos.x, wy = pos.y, air = !!jumpAirborne;');
      // No teleport rule: a 1,000 u jump counts as 45 strides.
      source = mutate(source, '--no-teleport-reset', '  if (d > FX_STEP_JUMP) { O.acc = 0; return; }                  // a teleport or unstick push, not a stride\n', '');
      // A teleport that kills the stride for good, or keeps the one before it.
      source = mutate(source, '--tp-kill', '  if (d > FX_STEP_JUMP) { O.acc = 0; return; }', '  if (d > FX_STEP_JUMP) { O.acc = -1e9; return; }');
      source = mutate(source, '--tp-keep-acc', '  if (d > FX_STEP_JUMP) { O.acc = 0; return; }', '  if (d > FX_STEP_JUMP) { return; }');
      // NPC dust on the surface (open-sky support) instead of the NPC's own stratum.
      source = mutate(source, '--npc-surface-z', '  fxObsEmit(S, FX_CODE_FOOTSTEP, x, y, fxStepZ(x, y, feet), ux, uy, 1, under ? FX_EV_UNDER : 0);',
        '  fxObsEmit(S, FX_CODE_FOOTSTEP, x, y, fxSurfaceZ(x, y), ux, uy, 1, under ? FX_EV_UNDER : 0);');
      // An NPC's step at its feet's height instead of the floor at the step.
      source = mutate(source, '--npc-step-at-feet', '  fxObsEmit(S, FX_CODE_FOOTSTEP, x, y, fxStepZ(x, y, feet), ux, uy, 1, under ? FX_EV_UNDER : 0);',
        '  fxObsEmit(S, FX_CODE_FOOTSTEP, x, y, feet, ux, uy, 1, under ? FX_EV_UNDER : 0);');
      // The player's step, dash, landing or trail at the feet's height instead of the floor there.
      source = mutate(source, '--step-at-feet', 'fxObsEmit(S, FX_CODE_FOOTSTEP, x, y, fxStepZ(x, y, feet), ux, uy, 1, flags);',
        'fxObsEmit(S, FX_CODE_FOOTSTEP, x, y, feet, ux, uy, 1, flags);');
      source = mutate(source, '--dash-at-feet', 'fxObsEmit(S, FX_CODE_DASH, pos.x, pos.y, fxDashZ(pos.x, pos.y, feet, air, under),', 'fxObsEmit(S, FX_CODE_DASH, pos.x, pos.y, feet,');
      source = mutate(source, '--land-at-feet', 'fxObsEmit(S, FX_CODE_LAND, pos.x, pos.y, fxStepZ(pos.x, pos.y, feet),', 'fxObsEmit(S, FX_CODE_LAND, pos.x, pos.y, feet,');
      source = mutate(source, '--trail-at-feet', 'ctx.x = pos.x; ctx.y = pos.y; ctx.z = fxDashZ(pos.x, pos.y, feet, !!jumpAirborne, under);', 'ctx.x = pos.x; ctx.y = pos.y; ctx.z = feet;');
      // An airborne dash laid at the feet (the step rule's fallback), or on
      // the ground below however far down it is.
      source = mutate(source, '--dash-air-feet', '  if (!air) return fxStepZ(x, y, feet);\n  var z = fxSupportBelow(', '  return fxStepZ(x, y, feet);\n  var z = fxSupportBelow(');
      source = mutate(source, '--dash-air-any-height', '  return feet - z <= FX_STEP_REACH ? z : NaN;', '  return z;');
      // The dash burst, its trail or an NPC's step dust thrown forward.
      source = mutate(source, '--dash-dust-forward', 'fxDashZ(pos.x, pos.y, feet, air, under), v > 1e-9 ? vel.x / v : 0, v > 1e-9 ? vel.y / v : 0,',
        'fxDashZ(pos.x, pos.y, feet, air, under), v > 1e-9 ? -vel.x / v : 0, v > 1e-9 ? -vel.y / v : 0,');
      source = mutate(source, '--trail-dust-forward', '    if (v > 1e-9) { ctx.dx = vel.x / v; ctx.dy = vel.y / v; }', '    if (v > 1e-9) { ctx.dx = -vel.x / v; ctx.dy = -vel.y / v; }');
      source = mutate(source, '--npc-dust-forward', '      fxObsBodyStep(S, b, b.x - uy * side, b.y + ux * side, ux, uy);', '      fxObsBodyStep(S, b, b.x - uy * side, b.y + ux * side, -ux, -uy);');
      // The frontSides wedge as first built: 0.4-1 x 140 u at any pitch (half of it below a pitch-0 canvas).
      source = mutate(source, '--wedge-near', '  var sd = R.pDist[r] / Math.sqrt(1 + pw * pw) * (0.6 + 0.4 * n3);', '  var sd = R.pDist[r] * (0.4 + 0.6 * n3);');
      // A wedge puff admitted (a steal) before its ground is known.
      if (has('--wedge-admit-first')) {
        source = mutate(source, '--wedge-admit-first', '    if (!Number.isFinite(wz)) return -4;\n  }\n',
          '    if (!Number.isFinite(wz)) { var i0 = fxAdmit(S, r); return i0 < 0 ? i0 : -4; }\n  }\n');
      }
      // The wedge's stratum test through the allocating getCaveSpaceAt.
      source = mutate(source, '--wedge-allocates', '  if (fxUnderAtH(x, y, m[SPATIAL_LAYER_TOP_KEYS[li]][ci]) !== S.viewUnder) return NaN;',
        '  if (getCaveSpaceAt(x, y, m[SPATIAL_LAYER_TOP_KEYS[li]][ci]).underground !== S.viewUnder) return NaN;');
      // A slime's hop found by the gameplay squash test (z from above 0.5 to
      // 0.5 or less), at the player, or past the per-tick cap.
      if (has('--hop-z-test')) {
        source = mutate(source, '--hop-z-test', 'hops = O.hop[j] ? fxHopCount(b) : 0;', 'hops = Number.isFinite(b.z) ? b.z : 0;');
        source = mutate(source, '--hop-z-test', '      var landed = hops > st[5];', '      var landed = st[5] > 0.5 && hops <= 0.5;');
      }
      source = mutate(source, '--slime-at-player', '{ bursts++; fxObsBodyStep(S, b, b.x, b.y, ux, uy); } else S.stats.obsNpcCapped++;',
        '{ bursts++; fxObsBodyStep(S, b, pos.x, pos.y, ux, uy); } else S.stats.obsNpcCapped++;');
      source = mutate(source, '--slime-uncapped', 'if (bursts < FX_NPC_BURSTS) { bursts++; fxObsBodyStep(S, b, b.x, b.y, ux, uy); } else S.stats.obsNpcCapped++;',
        '{ bursts++; fxObsBodyStep(S, b, b.x, b.y, ux, uy); }');
      // A step's reach of 8 u: a step down leaves steps at the easing feet.
      source = mutate(source, '--reach-8', 'FX_STEP_REACH = 25,', 'FX_STEP_REACH = 8,');
      // The 2D view keep blind to y, the 2D NPC radius to the view's half
      // width (not its corners), the 2D observer centred on the camera.
      source = mutate(source, '--2d-keep-no-y', '  return x >= vx - m && y >= vy - m && x <= vx + canvas.width + m && y <= vy + canvas.height + m ? 1 : 0;',
        '  return x >= vx - m && x <= vx + canvas.width + m ? 1 : 0;');
      source = mutate(source, '--2d-radius-halfwidth', 'Math.max(FX_NPC_RADIUS, Math.sqrt(hw * hw + hh * hh) + FX_VIEW2D_MARGIN)', 'Math.max(FX_NPC_RADIUS, Math.max(hw, hh) + FX_VIEW2D_MARGIN)');
      source = mutate(source, '--2d-centre-cam', 'cx = MODE3D ? cam.x : viewCam.x + hw, cy = MODE3D ? cam.y : viewCam.y + hh;', 'cx = cam.x, cy = cam.y;');
      // Density thinning counted as distance-LOD losses (the base count at u 0).
      source = mutate(source, '--lod-counts-density', '    var base = fxRoundCount(nominal, u);', '    var base = fxRoundCount(nominal, 0);');
      // The observers at work at Particles 0.
      source = mutate(source, '--observers-at-p0', '  if (S.caps[FX_CLASS_LOCO] <= 0) { S.obs.seen = false; return; }\n', '');
      // The player's steps all on one side.
      source = mutate(source, '--player-no-alternate', '    O.side = -O.side;\n', '');
      // Wall tops are no support (the step goes to the mesh or the feet).
      source = mutate(source, '--no-wall-support', '      if (Math.abs(top - feet) <= best) { best = Math.abs(top - feet); z = top; }',
        '      if (false) { best = Math.abs(top - feet); z = top; }');
      // No reach: a foot beside a wall top's edge goes to the ground 33 u below.
      source = mutate(source, '--step-no-reach', '  var m = floorMesh, z = NaN, best = FX_STEP_REACH;', '  var m = floorMesh, z = NaN, best = Infinity;');
      // An NPC puff on every moving tick.
      source = mutate(source, '--npc-steps-every-tick', '    while (st[2] >= stride) {', '    if (d > 0) {');
      // Stunned, dormant or dead bodies observed.
      source = mutate(source, '--npc-ignores-stun', ' || now < (b.stunUntil || 0) || b.npc &&', ' || b.npc &&');
      source = mutate(source, '--no-dormant', " || b.npc && b.npc.state === 'dormant') continue;", ') continue;');
      source = mutate(source, '--no-dead', 'typeof b.health === \'number\' && !(b.health > 0) || now <', 'now <');
      // A body observed again after a gap resumes from its stale position.
      source = mutate(source, '--no-fresh', '    var fresh = st[4] !== S.tick - 1,', '    var fresh = st[4] === -2,');
      // The observed bodies in list order, not the nearest.
      source = mutate(source, '--npc-list-order', 'j > 0 && O.d[j - 1] > d; j--)', 'false; j--)');
      // An observer field written onto the gameplay record.
      source = mutate(source, '--writes-body', '    st[0] = wx; st[1] = wy;\n    if (O.hop[j]) {', '    st[0] = wx; st[1] = wy; b.fxStride = st[2];\n    if (O.hop[j]) {');
      // NPC steps all on one side of the path.
      source = mutate(source, '--npc-no-alternate', '      st[3] = -st[3];\n', '');
      // The NPC radius at 250 u or 230 u.
      source = mutate(source, '--npc-radius-250', 'var FX_NPC_RADIUS = 240,', 'var FX_NPC_RADIUS = 250,');
      source = mutate(source, '--npc-radius-230', 'var FX_NPC_RADIUS = 240,', 'var FX_NPC_RADIUS = 230,');
      // No 12-burst cap per tick.
      source = mutate(source, '--npc-no-cap', '      if (bursts >= FX_NPC_BURSTS) { S.stats.obsNpcCapped++; continue; }\n', '');
      // A cave NPC's step taken for a surface step (surface colour and light).
      source = mutate(source, '--dust-ignores-under', '  var feet = entityFeetSpatialZ(b), under = fxUnderAt(b.x, b.y, feet);',
        '  var feet = entityFeetSpatialZ(b), under = false;');
      // The cave player's own dust taken for surface dust.
      source = mutate(source, '--player-not-under', 'd = Math.sqrt(dx * dx + dy * dy), under = !!playerUnderground;', 'd = Math.sqrt(dx * dx + dy * dy), under = false;');
      // The roof test through the allocating getCaveSpaceAt, or blind to caps.
      source = mutate(source, '--under-allocates', 'function fxUnderAtH(x, y, fh) {\n  var m = floorMesh;',
        'function fxUnderAtH(x, y, fh) {\n  if (floorMesh && floorMesh.layerCount && Number.isFinite(fh)) return getCaveSpaceAt(x, y, fh).underground;\n  var m = floorMesh;');
      source = mutate(source, '--roof-ignores-caps', '    if ((type === 2 || type === 4 && h > fh + 1.0) && h > fh + 0.001 && h < Infinity) return true;',
        '    if (type === 2 && h > fh + 0.001 && h < Infinity) return true;');
      // Cosmetic code drawing from the gameplay random stream.
      source = mutate(source, '--dust-math-random', '  fxRingClear(ev, 0);', '  Math.random(); fxRingClear(ev, 0);');
      // The dash trail is not the player's own (selfView never applies to it).
      source = mutate(source, '--trail-not-self', 'ctx.flags = FX_EV_SELF | (under ? FX_EV_UNDER : 0); ctx.surf = fxSurfaceAt(S, pos.x, pos.y, under);',
        'ctx.flags = under ? FX_EV_UNDER : 0; ctx.surf = fxSurfaceAt(S, pos.x, pos.y, under);');
      // selfView applied in every 3D camera, or to every placement, or ifVisible as skip.
      source = mutate(source, '--selfview-any-3d', '  var R = S.R, fp = MODE3D && CAM_FOLLOW;', '  var R = S.R, fp = MODE3D;');
      source = mutate(source, '--selfview-any-place', '  if ((ctx.flags & FX_EV_SELF) && fp && place === FX_PLACE_SOURCE) {', '  if ((ctx.flags & FX_EV_SELF) && fp) {');
      source = mutate(source, '--ifvisible-skip', 'sv === FX_SELF_IFVISIBLE && !fxInView(ctx.x, ctx.y, ctx.z, 1.1)', 'sv === FX_SELF_IFVISIBLE');
      // frontSides puffs at the feet's height, not on the ground ahead.
      source = mutate(source, '--wedge-at-feet', 'wz = fxWedgeZ(S, wx, wy);', 'wz = playerFeetSpatialZ();');
      // Burst counts rounded: a one-puff step under 0.5 vanishes.
      source = mutate(source, '--round-small-bursts', 'function fxRoundCount(x, u) { return x >= 1 ? Math.round(x) : x > 0 && u < x ? 1 : 0; }',
        'function fxRoundCount(x, u) { return Math.round(x); }');
      // The perspective distance LOD, and the 3D NPC radius, in the 2D view.
      source = mutate(source, '--2d-perspective-lod', '  if (MODE3D || R.cls[r] !== FX_CLASS_LOCO) return fxKeep(', '  if (true) return fxKeep(');
      source = mutate(source, '--2d-npc-radius', '  var radius = MODE3D ? FX_NPC_RADIUS : Math.max(', '  var radius = true ? FX_NPC_RADIUS : Math.max(');
      // Distance-LOD losses not counted.
      source = mutate(source, '--lod-uncounted', '    if (base > m) st.refusedLod += base - m;\n', '');
      // Kicked-up dust thrown forward, along the walk.
      source = mutate(source, '--dust-forward', '} else { bx = -ctx.dx; by = -ctx.dy; }', '} else { bx = ctx.dx; by = ctx.dy; }');
      // The landing's airborne threshold at 7 or 5 ticks; no scale clamp.
      source = mutate(source, '--land-after-7', 'FX_LAND_TICKS = 6,', 'FX_LAND_TICKS = 7,');
      source = mutate(source, '--land-after-5', 'FX_LAND_TICKS = 6,', 'FX_LAND_TICKS = 5,');
      source = mutate(source, '--no-clamp', ', s < 0.4 ? 0.4 : s > 1.6 ? 1.6 : s, flags);', ', s, flags);');
      // S9 (the S6 verifier's surviving hand mutants). The airborne dash's
      // support (fxSupportBelow): a layer up to 30 u above the feet, a floor
      // under a roof, wall tops for a cave player, a cave's wall cell, no
      // wall top at all, the lowest support instead of the highest, and no
      // flat floor on a mesh-less fixed level.
      source = mutate(source, '--dash-support-above', 'var m = floorMesh, top = feet + 1, best = -Infinity;', 'var m = floorMesh, top = feet + 30, best = -Infinity;');
      source = mutate(source, '--dash-support-through-roof', ' || fxCeilingBetween(m, ci, n, h, feet / 25)) continue;\n        var z = fxLayerZ(m, ci, k, x, y);',
        ') continue;\n        var z = fxLayerZ(m, ci, k, x, y);');
      var supportWall = '  if (!under && grid && cell) {\n    var wx = Math.floor(x / cell), wy = Math.floor(y / cell), wi = wy * gridW + wx;\n' +
        '    if (wx >= 0 && wy >= 0 && wx < gridW && wy < gridH && grid[wi] && !(gridCave && gridCave[wi])) {\n      var wt';
      source = mutate(source, '--dash-support-wall-underground', supportWall, supportWall.replace('  if (!under && grid && cell) {', '  if (grid && cell) {'));
      source = mutate(source, '--dash-support-cave-wall', supportWall, supportWall.replace(' && !(gridCave && gridCave[wi])) {', ') {'));
      source = mutate(source, '--dash-support-no-wall', '      if (wt <= top) best = wt;', '      if (false) best = wt;');
      source = mutate(source, '--dash-support-lowest', '        if (z <= top && z > best) best = z;', '        if (z <= top && (best === -Infinity || z < best)) best = z;');
      source = mutate(source, '--dash-support-no-flat-floor', '  if (!m || !m.layerCount) { if (!ENDLESS_MODE && 0 <= top && best < 0) best = 0; }', '  if (!m || !m.layerCount) { }');
      // S9 fix (the S9 review's survivors): the ceiling test fed the feet in
      // world units instead of mesh heights (a cave's own floor refused), a
      // mesh-less level's flat floor put over a wall top under the feet,
      // and a tolerance of 2 u (or none) over the feet instead of 1 u.
      source = mutate(source, '--dash-support-ceiling-units', 'fxCeilingBetween(m, ci, n, h, feet / 25)) continue;', 'fxCeilingBetween(m, ci, n, h, feet)) continue;');
      source = mutate(source, '--dash-support-floor-over-wall', '  if (!m || !m.layerCount) { if (!ENDLESS_MODE && 0 <= top && best < 0) best = 0; }',
        '  if (!m || !m.layerCount) { if (!ENDLESS_MODE && 0 <= top) best = 0; }');
      source = mutate(source, '--dash-support-tol-2', 'var m = floorMesh, top = feet + 1, best = -Infinity;', 'var m = floorMesh, top = feet + 2, best = -Infinity;');
      source = mutate(source, '--dash-support-tol-0', 'var m = floorMesh, top = feet + 1, best = -Infinity;', 'var m = floorMesh, top = feet, best = -Infinity;');
      source = mutate(source, '--dash-support-wall-tol-0', '      if (wt <= top) best = wt;', '      if (wt <= feet) best = wt;');
      // A reach open at exactly one step (25 u): the airborne dash's, or a grounded step's to a wall top.
      source = mutate(source, '--dash-reach-open', '  return feet - z <= FX_STEP_REACH ? z : NaN;', '  return feet - z < FX_STEP_REACH ? z : NaN;');
      source = mutate(source, '--step-reach-open', '      if (Math.abs(top - feet) <= best) { best = Math.abs(top - feet); z = top; }',
        '      if (Math.abs(top - feet) < best) { best = Math.abs(top - feet); z = top; }');
      // An NPC's stride kept across a teleport (the player's is --tp-keep-acc).
      source = mutate(source, '--npc-tp-keep-acc', '    if (d > FX_STEP_JUMP) { st[2] = 0; continue; }', '    if (d > FX_STEP_JUMP) { continue; }');
      // A step's support (fxStepZ) on the top of a cave's wall cell (buried
      // under the surface), or blind to walkable caps (the surface over a cave).
      source = mutate(source, '--step-cave-wall', 'grid[wi] && !(gridCave && gridCave[wi])) {\n      var top = fxWallTopZ(wi, wx, wy);\n      if (Math.abs(top - feet) <= best)',
        'grid[wi]) {\n      var top = fxWallTopZ(wi, wx, wy);\n      if (Math.abs(top - feet) <= best)');
      source = mutate(source, '--step-no-cap', '        if (type !== 1 && type !== 3 && type !== 4 || !Number.isFinite(m[SPATIAL_LAYER_TOP_KEYS[k]][ci])) continue;\n        var h = fxLayerZ(m, ci, k, x, y);',
        '        if (type !== 1 && type !== 3 || !Number.isFinite(m[SPATIAL_LAYER_TOP_KEYS[k]][ci])) continue;\n        var h = fxLayerZ(m, ci, k, x, y);');
      // The player observer resuming (Particles back from 0) at its old
      // position, taking an old dash for a new one, or not counting its
      // first airborne tick.
      source = mutate(source, '--p0-keeps-position', '  if (S.caps[FX_CLASS_LOCO] <= 0) { S.obs.seen = false; return; }', '  if (S.caps[FX_CLASS_LOCO] <= 0) { return; }');
      source = mutate(source, '--resume-dash-zero', 'O.vz = air ? jumpVelZ : 0; O.dash = dashUntil; return; }', 'O.vz = air ? jumpVelZ : 0; O.dash = 0; return; }');
      source = mutate(source, '--resume-air-zero', 'O.acc = 0; O.air = air ? 1 : 0; O.vz', 'O.acc = 0; O.air = 0; O.vz');
      // The frontSides wedge blind to pitch, all on one side, or through walls.
      source = mutate(source, '--wedge-ignores-pitch', '  var sd = R.pDist[r] / Math.sqrt(1 + pw * pw) * (0.6 + 0.4 * n3);', '  var sd = R.pDist[r] * (0.6 + 0.4 * n3);');
      source = mutate(source, '--wedge-one-side', 'side = (j & 1) ? 1 : -1, sa = cam.ang', 'side = 1, sa = cam.ang');
      source = mutate(source, '--wedge-ignores-walls', '  if (!S.viewUnder && grid && cell) {\n    var wx = Math.floor(x / cell), wy = Math.floor(y / cell), wi = wy * gridW + wx;\n' +
        '    if (wx >= 0 && wy >= 0 && wx < gridW && wy < gridH && grid[wi] && !(gridCave && gridCave[wi])) {\n      var top = fxWallTopZ(wi, wx, wy);\n      if (top < Infinity) return top;',
        '  if (false) {\n    var wx = Math.floor(x / cell), wy = Math.floor(y / cell), wi = wy * gridW + wx;\n' +
        '    if (wx >= 0 && wy >= 0 && wx < gridW && wy < gridH && grid[wi] && !(gridCave && gridCave[wi])) {\n      var top = fxWallTopZ(wi, wx, wy);\n      if (top < Infinity) return top;');
      // NPC bodies scanned while the dust preset is off.
      source = mutate(source, '--npc-scan-when-off', '  if (fxEventOpen(S, FX_CODE_FOOTSTEP)) fxObserveNpcs(S, S.obs);', '  fxObserveNpcs(S, S.obs);');
      // The NPC observer constants below the load-time createFxState call.
      if (has('--late-observer-constants')) {
        var line = 'var FX_NPC_RADIUS = 240, FX_NPC_BODIES = 24, FX_NPC_BURSTS = 12, FX_VIEW2D_MARGIN = 16;\n';
        source = mutate(source, '--late-observer-constants', line, '');
        source = mutate(source, '--late-observer-constants', 'function fxCreateObservers() {', line + 'function fxCreateObservers() {');
      }
    }
    if (path === 'src/14-fx-render.js') {
      // 2D puffs at their bare world radius (1-2 px at 1 u per px).
      source = mutate(source, '--puff-2d-world-size', 'else if (v2 === FXV_PUFF) { prim = FXP_PUFF; rr = size > lo2 ? size : lo2; }', 'else if (v2 === FXV_PUFF) { prim = FXP_PUFF; rr = size; }');
      // Screen-placed x in canvas heights on any canvas.
      source = mutate(source, '--screen-canvas-heights', '  if (space === 8) { P.x = F.w * 0.5 + x * F.su;', '  if (space === 8) { P.x = F.w * 0.5 + x * F.h;');
      // Screen-placed sizes in canvas heights (a portrait canvas's puffs grow).
      source = mutate(source, '--screen-size-canvas-height', 'rr = size * (space === 8 ? F.su : tier[r] * F.projScale / fwd);', 'rr = size * (space === 8 ? F.h : tier[r] * F.projScale / fwd);');
      // The 2D floor applied to 3D puffs: far dust stops shrinking.
      source = mutate(source, '--dust-3d-floor', '      var lo = R.minPx[r] * F.RS, hi = R.maxPx[r] * F.RS;', '      var lo = R.minPx2D[r] * F.RS, hi = R.maxPx[r] * F.RS;');
      // S9: screen-placed y in the screen unit (3/4 of a portrait's width) instead of canvas heights.
      source = mutate(source, '--screen-y-width-unit', 'P.y = F.h * 0.5 + y * F.h; P.f = 1; return true; }', 'P.y = F.h * 0.5 + y * F.su; P.f = 1; return true; }');
      // World particles skipped outside a following camera.
      source = mutate(source, '--nonfollow-no-draw', '    else if (space || R.layer[r] !== mode) continue;', '    else if (space || R.layer[r] !== mode || !CAM_FOLLOW) continue;');
    }
    if (path === 'src/11-fx-recipes.js') {
      // The player's own footstep puffs spawned in first person anyway.
      source = mutate(source, '--self-world', "trigger:{event:'footstep'}, selfView:'ifVisible',", "trigger:{event:'footstep'}, selfView:'world',");
      // The dash trail spawned at the first-person player's feet.
      source = mutate(source, '--trail-world', "'step.dashTrail': {extends:'step.dash', trigger:{anchor:'dashTrail', rate:45},",
        "'step.dashTrail': {extends:'step.dash', selfView:'world', trigger:{anchor:'dashTrail', rate:45},");
      // Step dust in one fixed dust colour whatever the surface.
      source = mutate(source, '--dust-fixed-colour', "    color:'surfaceStep', spawn:{shape:'disc', radius:[0, 2], direction:'backward', spread:1.0,",
        "    color:{material:'fxDebris', roles:['dust']}, spawn:{shape:'disc', radius:[0, 2], direction:'backward', spread:1.0,");
      // The dust recipes outside their preset switch.
      source = mutate(source, '--dust-ignores-toggle', "  'step.dust': {class:'locomotion', toggle:'fxFootDust', layer:'world',", "  'step.dust': {class:'locomotion', layer:'world',");
      // The landing drawn as a 2D puff (the view2D of step.dust).
      source = mutate(source, '--land-2d-puff', "grow:1.8, alpha:[0.45, 0.8]}, view2D:'ring'},", 'grow:1.8, alpha:[0.45, 0.8]}},');
      // S9: the first-person screen puffs for any body's dash, not only the player's.
      source = mutate(source, '--screen-dash-any-body', "trigger:{event:'dashStart', where:{self:true}, count:6}", "trigger:{event:'dashStart', count:6}");
      // The frontSides wedge as first built (140 u deep; see the engine half).
      source = mutate(source, '--wedge-near', "placeParams:{distance:160, arc:0.45},", "placeParams:{distance:140, arc:0.45},");
    }
    return source;
  };
  G.__dustLoad = function (path) {
    try { (0, eval)(G.__dustSource(path, slurp('assets/games/' + path))); } catch (e) {
      if (/^MUTATION_ANCHOR/.test(e.message)) throw e;
      loadErrors.push(path + ': ' + e.message);
    }
  };
  var host = slurp('tools/game/tests/cave_occlusion_integration.js');
  var end = host.indexOf('  function check(name, okay) {');
  if (end < 0) throw Error('SETUP dust host boundary missing');
  host = host.slice(0, end);
  var load = "manifest.parts.MAIN.forEach(function (path) { (0, eval)(slurp('assets/games/' + path)); });";
  if (host.split(load).length !== 2) throw Error('SETUP dust manifest boundary missing');
  host = host.replace(load, 'manifest.parts.MAIN.forEach(G.__dustLoad);');
  (0, eval)(host + 'G.__dustErrors = errors; }());');
  G.console.warn = function () { warnings.push(Array.prototype.join.call(arguments, ' ')); };

  function check(name, okay, detail) {
    checked++; if (!okay) failed++;
    output((okay ? 'PASS ' : 'FAIL ') + name + (okay ? '' : ' ' + JSON.stringify(detail === undefined ? null : detail)));
  }
  function run(name, fn) {
    try { fn(); } catch (e) {
      check(name + ' ran without an exception', false, {message: e.message, stack: String(e.stack || '').split('\n').slice(0, 4)});
    }
  }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  check('every game fragment loads without an error', !loadErrors.length, {loadErrors: loadErrors});
  if (loadErrors.length) { output('LOCOMOTION_DUST_RESULT FAIL ' + failed + '/' + checked + ' (load failed)'); return; }
  // The pool the manifest builds as it loads (var fxState = createFxState(..)
  // in 11-fx-engine.js) sizes its NPC observer tables from constants that
  // must be set by then: 24 bodies, each with a distance and a hop flag.
  var O0 = G.fxState.obs;
  check('the load-time pool\'s NPC observer tables hold 24 bodies', O0.ref.length === 24 && O0.d.length === 24 && O0.hop.length === 24,
    {ref: O0.ref.length, d: O0.d.length, hop: O0.hop.length});

  // ── Recording Canvas (as impact_debris.js): the drawing state with a real
  // save/restore stack and translation, and every fill, stroke and image of
  // the watched frame stages.
  var hostCtx = G.ctx, rec = {stage: null, watch: null, draws: [], path: [], stack: [], calls: {}};
  var state = {fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1,
    shadowBlur: 0, tx: 0, ty: 0};
  var STATE_KEYS = Object.keys(state);
  function watching() { return !!(rec.watch && rec.stage && rec.watch.test(rec.stage)); }
  function draw(kind, extra) {
    if (!watching()) return;
    var d = {kind: kind, stage: rec.stage, alpha: state.globalAlpha, path: rec.path.slice()};
    for (var k in extra) d[k] = extra[k];
    rec.draws.push(d);
  }
  function pathOp(name) {
    return function (a, b, c, d) {
      if (name === 'arc') rec.path.push(['arc', a + state.tx, b + state.ty, c]);
      else if (name === 'rect') rec.path.push(['rect', a + state.tx, b + state.ty, c, d]);
      else if (name === 'ellipse') rec.path.push(['ellipse', a + state.tx, b + state.ty, c, d]);
      else rec.path.push([name, a + state.tx, b + state.ty]);
    };
  }
  var own = {
    save: function () { rec.stack.push(STATE_KEYS.map(function (k) { return state[k]; })); },
    restore: function () { var f = rec.stack.pop(); if (f) STATE_KEYS.forEach(function (k, i) { state[k] = f[i]; }); },
    translate: function (x, y) { state.tx += x; state.ty += y; },
    beginPath: function () { rec.path = []; },
    moveTo: pathOp('moveTo'), lineTo: pathOp('lineTo'), arc: pathOp('arc'), rect: pathOp('rect'), ellipse: pathOp('ellipse'),
    fill: function () { draw('fill', {style: state.fillStyle}); },
    stroke: function () { draw('stroke', {style: state.strokeStyle}); },
    drawImage: function (img, x, y, w, h) { draw('image', {x: x + state.tx, y: y + state.ty, w: w, h: h}); }
  };
  var wrappers = {};
  G.ctx = new Proxy(state, {
    get: function (t, k) {
      if (typeof k !== 'string') return undefined;
      if (Object.prototype.hasOwnProperty.call(state, k)) return state[k];
      if (wrappers[k]) return wrappers[k];
      var impl = own[k], hv = hostCtx[k];
      if (!impl && typeof hv !== 'function') return hv;
      wrappers[k] = function () {
        if (rec.stage) rec.calls[rec.stage] = (rec.calls[rec.stage] || 0) + 1;
        return impl ? impl.apply(null, arguments) : hv.apply(hostCtx, arguments);
      };
      return wrappers[k];
    },
    set: function (t, k, v) {
      if (rec.stage) rec.calls[rec.stage] = (rec.calls[rec.stage] || 0) + 1;
      state[k] = v; return true;
    }
  });
  var realPt = G._pt, stageErrors = [];
  // One real frame (renderFrame); the stages named by `watch` are recorded.
  function frame(watch) {
    rec.draws = []; rec.calls = {}; rec.path = []; rec.watch = watch;
    G._pt = function (name, fn) {
      var prev = rec.stage; rec.stage = name;
      try { return fn(); } catch (e) { stageErrors.push(name + ': ' + e.message); } finally { rec.stage = prev; }
    };
    try { G.renderFrame(); } finally { G._pt = realPt; rec.stage = null; rec.watch = null; }
    return rec.draws;
  }
  function inCanvas(x, y) { return x >= 0 && x <= G.canvas.width && y >= 0 && y <= G.canvas.height; }
  // The fresh particles (tickSpawns rows) that a frame drew: the game's own
  // projection (projToScreen) puts each on the canvas and a sprite of the
  // stage is centred within 1.5 px of it.
  function drawnOf(parts, draws, stageName) {
    var C = G.getCam3D(), imgs = images(draws, stageName);
    return parts.filter(function (q) {
      var p = G.projToScreen(q.x, q.y, q.z, C);
      return p && inCanvas(p.sx, p.sy) && imgs.some(function (m) { return Math.abs(m.x - p.sx) <= 1.5 && Math.abs(m.y - p.sy) <= 1.5; });
    }).length;
  }
  // Sprite images (puffs) of a stage: centre and radius in canvas pixels.
  function images(draws, stageName) {
    return draws.filter(function (d) { return d.stage === stageName && d.kind === 'image'; })
      .map(function (d) { return {x: d.x + d.w / 2, y: d.y + d.h / 2, r: d.w / 2}; });
  }
  function hex(h) { return parseInt(h.slice(1), 16); }
  function rgbHex(v) { return '#' + ('00000' + v.toString(16)).slice(-6); }
  // The canvas at w x h for fn (the 3D frame rescales from it); restored after.
  function withCanvas(w, h, fn) {
    var w0 = G.canvas.width, h0 = G.canvas.height;
    G.canvas.width = w; G.canvas.height = h;
    try { return fn(); } finally { G.canvas.width = w0; G.canvas.height = h0; }
  }

  // Every observer event, logged on its way to the real emitter: the harness
  // tick, its type, point, direction, scale and flags (1 SELF, 2 UNDER).
  var TYPES = G.FX_EVENT_NAMES, events = [], tick = 0, realEmit = G.fxObsEmit;
  G.fxObsEmit = function (S, code, x, y, z, dx, dy, scale, flags) {
    events.push({tick: tick, type: TYPES[code], x: x, y: y, z: z, dx: dx, dy: dy, scale: scale, self: !!(flags & 1), under: !!(flags & 2),
      wx: x + (G.ENDLESS_MODE ? G.windowOriginX : 0), wy: y + (G.ENDLESS_MODE ? G.windowOriginY : 0)});
    return realEmit.apply(G, arguments);
  };
  // Every burst the engine runs, logged on its way in: the recipe, the point
  // it was handed (before placement), whether it is the player's own, and
  // what it spawned and lost to the out-of-view rule, the distance LOD and
  // a missing support (no ground under an airborne dash).
  var bursts = [], realBurst = G.fxBurst;
  G.fxBurst = function (S, r, n, place, ctx, exact) {
    var q = {tick: tick, id: S.C.LIST[r].id, x: ctx.x, y: ctx.y, z: ctx.z, self: !!(ctx.flags & 1), refusedSelf: S.stats.refusedOffscreenSelf,
      lod: S.stats.refusedLod, noSupport: S.stats.refusedNoSupport, first: S.count};
    var got = realBurst.apply(G, arguments);
    q.spawned = got; q.refusedSelf = S.stats.refusedOffscreenSelf - q.refusedSelf; q.lod = S.stats.refusedLod - q.lod;
    q.noSupport = S.stats.refusedNoSupport - q.noSupport;
    // The spawned particles as they were laid (x, y, z, vx, vy), when the
    // burst appended them (no steal moved a slot).
    q.parts = null;
    if (S.count - q.first === got) {
      q.parts = [];
      for (var i = q.first; i < S.count; i++) q.parts.push({x: S.x[i], y: S.y[i], z: S.z[i], vx: S.vx[i], vy: S.vy[i]});
    }
    bursts.push(q);
    return got;
  };
  function burstsOf(from, id) { return bursts.slice(from).filter(function (b) { return b.id === id; }); }
  function sum(list, key) { return list.reduce(function (n, b) { return n + b[key]; }, 0); }
  function of(type, self) { return events.filter(function (e) { return e.type === type && (self === undefined || e.self === self); }); }
  function failures() { var f = G.getEffectStats().failures, n = 0; for (var k in f) n += f[k]; return n; }
  function byRecipe(S, id) {
    var r = S.C.ID[id], out = [];
    for (var i = 0; i < S.count; i++) if (S.rec[i] === r) out.push(i);
    return out;
  }
  function palRGB(S, pal) { return pal < S.C.PAL.count ? S.C.PAL.rgb[pal] : S.dynPal[pal - S.C.PAL.count]; }
  var STEP = ['step.dust', 'step.land', 'step.dash', 'step.dashTrail', 'screen.dashDust'];
  // Particles of `id` spawned in the tick just run (one integrate step old).
  function newOf(S, id) { return byRecipe(S, id).filter(function (i) { return S.age[i] <= DT * 1.5; }); }

  // ── Authored scenes ───────────────────────────────────────────────────────
  var MW = 41, GS = 12, CELL = 15, GW = 32;                             // mesh 492 u, grid 480 u
  function mesh(kind) {
    var m = {w: MW, h: MW, gridSize: GS, layerCount: new Uint8Array(MW * MW)};
    if (kind === 'caveLedge') m.surfaceH = new Float64Array(MW * MW);   // the Endless mesh's cover height (getCaveWallRoofLimit)
    for (var l = 0; l < 5; l++) {
      m['l' + l + 'Type'] = new Uint8Array(MW * MW); m['l' + l + 'TopZ'] = new Float64Array(MW * MW); m['l' + l + 'Meta'] = new Uint8Array(MW * MW);
      m['l' + l + 'Color'] = new Array(MW * MW).fill('#6f6a5e');
    }
    for (var i = 0; i < MW * MW; i++) {
      m.layerCount[i] = kind === 'cave' ? 3 : kind === 'overhang' ? 2 : 1; m.l0Type[i] = 1; m.l0Meta[i] = kind === 'cave' ? 2 : 1;
      m.l0TopZ[i] = kind === 'ramp' ? (i % MW) * GS * TAN20 / 25 : 0;           // a 20 degree ramp: z = x tan 20
      if (kind === 'cliff') m.l0TopZ[i] = (i % MW) < 16 ? 6 : 0;               // a 6 H plateau west of x = 192
      if (kind === 'ledge') m.l0TopZ[i] = (i % MW) < 16 ? 0.9 : 0;             // a 0.9 H one (a walk step down)
      if (kind === 'cave') { m.l1Type[i] = 2; m.l1TopZ[i] = 4; m.l2Type[i] = 4; m.l2TopZ[i] = 5; m.l2Meta[i] = 3; }
      if (kind === 'overhang') { m.l1Type[i] = 4; m.l1TopZ[i] = 5; m.l1Meta[i] = 3; }   // a cap 5 H up, no ceiling
      if (kind === 'slab') { m.layerCount[i] = 2; m.l1Type[i] = 2; m.l1TopZ[i] = 0.4; }  // a roof 10 u over the floor, no cap
      if (kind === 'caveLedge') {                  // a cave under a cap at 5 H stepping up 0.9 H at x = 192 (x 180-192), cover 1 H
        var capH = (i % MW) < 16 ? 5 : 5.9;
        m.layerCount[i] = 3; m.l0Meta[i] = 2; m.l1Type[i] = 2; m.l1TopZ[i] = capH - 1; m.l2Type[i] = 4; m.l2TopZ[i] = capH; m.l2Meta[i] = 3;
        m.surfaceH[i] = capH;
      }
    }
    return m;
  }
  // opts: {kind, terrain, x, y, feetH, ang, pitch, mode ('fp' | '2d' | 'nonfollow'), cam, walls(grid, wallHeights)}
  function authored(o) {
    o = o || {};
    G.floorMesh = mesh(o.kind || 'flat'); G.ENDLESS_MODE = false; G.CAVE_TEST_MODE = false; G.level = 1;
    G.terrain = o.terrain || 'plains'; G.applyPreset();
    G.cell = CELL; G.gridW = G.gridH = GW; G.grid = new Uint8Array(GW * GW); G.wallHeights = new Float64Array(GW * GW).fill(1);
    G.wallFaceBase = G.wallMaxTopZ = null; G.gridCave = null; G.oreVeins = []; G.pointLights = []; G.walls = [];
    if (o.walls) o.walls(G.grid, G.wallHeights);
    G.buildWalkCandZ(G.floorMesh);
    G.deepCaveRegions = []; G.windowOriginX = G.windowOriginY = 0; G.worldW = G.worldH = GW * CELL;
    var x = o.x === undefined ? 60 : o.x, y = o.y === undefined ? 240 : o.y, feetH = o.feetH || 0;
    G.pos = {x: x, y: y, floorZ: 60 + 40 * feetH}; G.vel = {x: 0, y: 0};
    G.cam = o.cam || {x: x, y: y, z: G.pos.floorZ, ang: o.ang || 0, pitch: o.pitch || 0};
    G.cam.fov = G.GAME_CONFIG.player.baseFov;
    G.MODE3D = o.mode !== '2d'; G.CAM_FOLLOW = o.mode !== 'nonfollow'; G.overviewActive = false;
    G.viewCam = {x: x - G.canvas.width / 2, y: y - G.canvas.height / 2};
    G.enemies = []; G.enemySpawners = []; G.projectiles = []; G.impacts = []; G.deathEffects = []; G.soulOrbs = []; G.coinDrops = [];
    G.groundEffects = []; G.chainEffects = []; G.novaEffects = []; G.companions = []; G.fortressAllies = []; G.shopMarker = null;
    G.arcaneTomes = []; G.statPickups = []; G.shrines = []; G.treasureChests = []; G.goal = null;
    G.equipment = {robes: null, relic: null, armor: null, hat: null, boots: {canDash: true, canJump: true}};
    G.jumpAirborne = false; G.jumpVelZ = 0; G.dashUntil = 0; G.dashCooldownUntil = 0; G.dashFovPunch = 0;
    G.menuOpen = G.settingsOpen = G.shopOpen = G.inventoryOpen = G.forgeOpen = false;
    G.running = true; G.gameOverState = false; G.settings.particles = 25; G.health = G.HEALTH_MAX; G.mana = G.MANA_MAX;
    G.renderPresentationAlpha = 1; G.renderSurfaceAmbient = 0.9; G.goalSpawned = true;
    // Noon at every scene's start (the day advances 0.008 a second): a scene
    // never depends on how many ticks earlier sections ran (dusk fireflies).
    G.dayTime = 0.5;
    G.startGameClock(); G.clearGameplayInput();
    G.USE_KEYBOARD = true; G.USE_MOUSE = true; G.USE_GAMEPAD = false; G.CONTROL_MODE = G.MODE_STICK_AIM;
    G.updatePlayerCaveSpace();
    events = []; bursts = []; tick = 0;
    return (G.fxState = G.createFxState(G.EFFECT_CONFIG.capacity, 6006, {pinned: true}));
  }
  function releaseInput() {
    G.kbState.up = G.kbState.down = G.kbState.left = G.kbState.right = false; G.dashPressed = G.jumpPressed = false;
  }
  function worldXY() { return [G.pos.x + (G.ENDLESS_MODE ? G.windowOriginX : 0), G.pos.y + (G.ENDLESS_MODE ? G.windowOriginY : 0)]; }
  // n real fixed ticks; input(k) sets the keys of tick k. A row per tick: the
  // player's world position, airborne flag, jumpVelZ and dashUntil after it.
  function ticks(n, input) {
    var rows = [];
    try {
      for (var k = 0; k < n; k++) {
        releaseInput();
        if (input) input(k);
        tick++;
        G.runSimulationTick(DT);
        var w = worldXY();
        rows.push({tick: tick, x: w[0], y: w[1], air: G.jumpAirborne, vz: G.jumpVelZ, dashUntil: G.dashUntil, origin: G.windowOriginX});
      }
    } finally { releaseInput(); }
    return rows;
  }
  // The observers alone for one tick (the NPC scenes move their bodies by hand).
  function observe() { tick++; G.updateEffects(DT); }
  // The stride contract (spec 9.3), restated: grounded horizontal travel,
  // measured here between consecutive ticks, lays one step every 22 u.
  // Returns the ticks at which a step is due (ambiguous when the path is
  // within 1e-6 of a stride boundary, listed separately).
  function strideTicks(start, rows, stride) {
    var px = start[0], py = start[1], cum = 0, due = [], edge = [];
    rows.forEach(function (r) {
      var d = Math.hypot(r.x - px, r.y - py);
      px = r.x; py = r.y;
      if (r.air) return;
      var before = Math.floor(cum / stride);
      cum += d;
      for (var k = before + 1; k <= Math.floor(cum / stride); k++) due.push(r.tick);
      if (Math.abs(cum / stride - Math.round(cum / stride)) * stride < 1e-6) edge.push(r.tick);
    });
    return {due: due, edge: edge, path: cum};
  }
  function sameTicks(actual, predicted) {
    if (actual.length === predicted.due.length && actual.every(function (t, i) { return t === predicted.due[i]; })) return true;
    return predicted.edge.length > 0 && Math.abs(actual.length - predicted.due.length) <= 1;
  }
  // Distance of (x, y) from the nearest of a list of points (world units).
  function nearest(list, x, y) {
    return list.reduce(function (m, p) { return Math.min(m, Math.hypot(p.x - x, p.y - y)); }, Infinity);
  }

  // One tick at a time, with the puffs each tick spawned (their colours and
  // velocities) and the observer events of the tick.
  function tickSpawns(S, input, ids) {
    var n0 = events.length;
    ticks(1, input);
    var out = {events: events.slice(n0), fresh: {}};
    (ids || STEP).forEach(function (id) {
      out.fresh[id] = newOf(S, id).map(function (i) { return {i: i, x: S.x[i], y: S.y[i], z: S.z[i], vx: S.vx[i], vy: S.vy[i], seed: S.seedA[i], rgb: palRGB(S, S.pal[i])}; });
    });
    return out;
  }
  // Enemies as updateEnemies keeps them (11-enemies.js), on the NPC contract.
  function enemyAt(type, x, y, feetZ) {
    var t = Object.assign({}, G.enemyTypes[type]);
    var e = {x: x, y: y, z: feetZ, feetZ: feetZ, health: t.health, underground: false, vx: 0, vy: 0, enemyType: t, speed: t.speed, chaseRange: 0};
    e.underground = G.getCaveSpaceAt(x, y, feetZ / 25).underground;
    G.enemies.push(e); G.npcEnsure(e, 'enemy');
    return e;
  }
  function allyAt(x, y, feetZ) {
    var a = {x: x, y: y, z: 0, feetZ: feetZ, health: 6, maxHealth: 6, speed: 42, attackRange: 28, vx: 0, vy: 0, phase: 0, name: 'Test'};
    G.fortressAllies.push(a); G.npcEnsure(a, 'garrison');
    return a;
  }
  function strideOf(type) { var t = G.enemyTypes[type]; return (14 + 10 * (t ? t.size : 1)) * (type === 'wolf' ? 0.8 : 1); }

  // ── G1: walking lays one puff per stride ─────────────────────────────────
  // 2D: the player stands 20 ticks, then walks east 150 ticks. Standing adds
  // no step; the steps fall on the ticks the measured grounded path predicts;
  // each is on the floor, exactly 3 u beside the player (alternating sides).
  if (needed('G1', ['--dust-every-tick', '--player-no-alternate'])) run('G1 walking in 2D', function () {
    authored({mode: '2d'});
    ticks(20);
    var still = events.length, start = worldXY(), rows = ticks(150, function () { G.kbState.right = true; });
    var steps = of('footstep', true), predicted = strideTicks(start, rows, 22);
    if (predicted.path < 150) throw Error('SETUP the 2D walk covered ' + r3(predicted.path) + ' u');
    check('walking lays one puff per stride', still === 0 && steps.length >= 6 && sameTicks(steps.map(function (e) { return e.tick; }), predicted),
      {still: still, steps: steps.map(function (e) { return e.tick; }), due: predicted.due, path: r3(predicted.path), stride: 22});
    var sides = [], off = steps.filter(function (e) {
      var row = rows.filter(function (r) { return r.tick === e.tick; })[0], side = (e.x - row.x) * e.dy - (e.y - row.y) * e.dx;
      sides.push(side > 0 ? 1 : -1);
      return !(Math.abs(e.z) < 1e-9 && Math.abs(Math.hypot(e.x - row.x, e.y - row.y) - 3) < 1e-6 && e.self && !e.under);
    });
    var alternate = sides.every(function (v, i) { return !i || v === -sides[i - 1]; });
    check('the player\'s steps are laid at the feet on the ground, alternating sides', steps.length > 0 && !off.length && alternate,
      {off: off.slice(0, 3).map(function (e) { return {tick: e.tick, x: r3(e.x), y: r3(e.y), z: r3(e.z)}; }), sides: sides});
  });
  // A 20 degree ramp (z = x tan 20): walking up it with a dash (the player's
  // feet lag the rising floor) and across it with a jump (the feet sit on
  // the cell corner's height, 06-floor-queries.js; the steps sit 3 u up and
  // down the slope), every step, the dash, each trail burst and the landing
  // lie on the slope at their own point; so do an enemy's steps as it walks
  // across the slope (npcMoveToward; its feet also on the cell corner).
  if (needed('G1', ['--step-at-feet', '--dash-at-feet', '--trail-at-feet', '--land-at-feet', '--npc-step-at-feet'])) run('G1 ramp', function () {
    function plane(x) { return x * TAN20; }
    function offPlane(list, kind) {
      return list.filter(function (e) { return !(Math.abs(e.z - plane(e.x)) < 1e-6); })
        .map(function (e) { return {kind: kind, x: r3(e.x), z: r3(e.z), plane: r3(plane(e.x))}; });
    }
    var off = [], n = 0, dash = [], trail = [], land = [];
    [['right', 60, 40, -1], ['down', 200, -1, 30]].forEach(function (walk) {
      authored({kind: 'ramp', mode: '2d', x: walk[1], y: 120, feetH: walk[1] * TAN20 / 25});
      ticks(20);
      var n0 = events.length, b0 = bursts.length;
      ticks(120, function (k) { G.kbState[walk[0]] = true; G.dashPressed = k === walk[2]; G.jumpPressed = k === walk[3]; });
      events.slice(n0).forEach(function (e) {
        if (e.type === 'footstep' && e.self) {
          n++;
          if (!(Math.abs(e.z - plane(e.x)) < 1e-6)) off.push({walk: walk[0], x: r3(e.x), y: r3(e.y), z: r3(e.z), plane: r3(plane(e.x))});
        } else if (e.type === 'dashStart') dash.push(e);
        else if (e.type === 'land') land.push(e);
      });
      trail = trail.concat(burstsOf(b0, 'step.dashTrail'));
    });
    check('the player\'s steps lie on the slope at their own point', n >= 8 && !off.length, {steps: n, off: off.slice(0, 4)});
    var wrong = offPlane(dash, 'dash').concat(offPlane(trail, 'trail'), offPlane(land, 'land'));
    check('a dash, its trail and a landing on the slope lie on it', dash.length === 1 && trail.length >= 3 && land.length === 1 && !wrong.length,
      {dashes: dash.length, trailBursts: trail.length, lands: land.length, wrong: wrong.slice(0, 4)});
    // An enemy walks 100 u across the slope (along +y at x 250.5).
    authored({kind: 'ramp', mode: '2d', x: 200, y: 110, feetH: 200 * TAN20 / 25});
    var e = enemyAt('normal', 250.5, 60, plane(250.5)), path = 0;
    observe();
    var n1 = events.length;
    for (var k = 0; k < 110; k++) { var py = e.y; G.npcMoveToward(e, 250.5, 160, 60, DT, 6, 0); path += Math.abs(e.y - py); observe(); }
    var steps = events.slice(n1).filter(function (q) { return q.type === 'footstep' && !q.self; }), bad = offPlane(steps, 'npc');
    if (!(path > 99.9)) throw Error('SETUP the enemy walked ' + r3(path) + ' u across the ramp');
    check('an NPC\'s steps on a slope lie on it', steps.length >= 3 && !bad.length,
      {steps: steps.length, wrong: bad.slice(0, 4), feet: r3(G.entityFeetSpatialZ(e))});
  });
  // Wall tops (09-physics.js lands and keeps the player on a grid wall's
  // top; the mesh has only the ground under it). Hut-ruin rows side by side:
  // A 0.14 x 240 = 33.6 u and B 0.12 x 240 = 28.8 u tall (y 240-255 and
  // 255-270, x 120-405). A real jump from the ground lands on A; the player
  // walks east along it, dashes (the camera faces south, so the 'right' key
  // dashes east along the row) and walks on: once 1.5 u from A's join with
  // B, once 1.5 u from A's other edge (open ground). The landing, the dash
  // and each trail burst lie on A's top; each step on the top of the wall
  // cell its point is over (B's for a foot over B), and a foot over the
  // ground 33.6 u below (more than a step down) at the feet.
  function ruinRows(grid, wh) {
    for (var gx = 8; gx <= 26; gx++) { grid[16 * GW + gx] = 1; wh[16 * GW + gx] = 0.14; grid[17 * GW + gx] = 1; wh[17 * GW + gx] = 0.12; }
  }
  if (needed('G1', ['--no-wall-support', '--step-no-reach'])) run('G1 wall tops', function () {
    var topA = 0.14 * 240, wrong = [], seen = {land: 0, dash: 0, trail: 0, A: 0, B: 0, ground: 0}, onTopTicks = 0;
    [253.5, 241.5].forEach(function (y) {
      authored({mode: '2d', x: 100, y: y, walls: ruinRows, ang: -Math.PI / 2});
      var onTop = {}, b0 = bursts.length, n0 = events.length;
      for (var k = 0; k < 115; k++) {
        ticks(1, function () { G.kbState.right = true; G.jumpPressed = k === 2; G.dashPressed = k === 90; });
        if (!G.jumpAirborne && Math.abs(G.playerFeetSpatialZ() - topA) < 1e-6) { onTop[tick] = true; onTopTicks++; }
      }
      function want(kind, e) {
        if (!onTop[e.tick]) return;
        var gx = Math.floor(e.x / CELL), gy = Math.floor(e.y / CELL), wall = G.grid[gy * GW + gx] ? G.wallHeights[gy * GW + gx] : 0;
        var cellName = wall === 0.14 ? 'A' : wall === 0.12 ? 'B' : 'ground', z = wall ? wall * 240 : topA;   // the ground is 33.6 u down: the feet
        seen[kind === 'step' ? cellName : kind]++;
        if (!(Math.abs(e.z - z) < 1e-6)) wrong.push({kind: kind, cell: cellName, tick: e.tick, z: r3(e.z), want: r3(z)});
      }
      events.slice(n0).forEach(function (e) { want(e.type === 'footstep' ? 'step' : e.type === 'dashStart' ? 'dash' : 'land', e); });
      burstsOf(b0, 'step.dashTrail').forEach(function (b) { want('trail', b); });
    });
    if (onTopTicks < 120 || seen.land !== 2 || seen.dash !== 2 || seen.trail < 12 || seen.B < 3 || seen.ground < 3 || seen.A < 8)
      throw Error('SETUP wall walks ' + JSON.stringify({onTopTicks: onTopTicks, seen: seen}));
    check('a wall top carries the landing, steps, dash and trail laid on it', !wrong.length, {wrong: wrong.slice(0, 4), seen: seen});
  });
  // A walk step down (06-floor-queries.js: a drop of up to 1 H is walked and
  // the grounded feet ease 30% a tick onto the lower floor): a 0.9 H (22.5 u)
  // ledge, the mesh joining it to the floor at 0 by a ramp over x 180-192.
  // The player walks east over it from 24 start points (x 150-173) and, on
  // every other run, dashes across it: every step, the dash and each trail
  // burst lie on the authored surface at their own point, including those
  // laid on the lower floor while the feet are still easing down (some of
  // them more than 8 u above it: a reach under 1 H lays those at the feet).
  if (needed('G1', ['--reach-8'])) run('G1 step down', function () {
    function ground(x) { return x <= 180 ? 22.5 : x >= 192 ? 0 : 22.5 * (1 - (x - 180) / 12); }
    var wrong = [], laid = 0, easing = 0, deep = 0, dashes = 0;
    for (var run0 = 0; run0 < 24; run0++) {
      authored({kind: 'ledge', mode: '2d', x: 150 + run0, y: 240, feetH: 0.9, ang: -Math.PI / 2});
      ticks(5);
      var b0 = bursts.length, n0 = events.length, feetAt = {};
      for (var k = 0; k < 50; k++) {
        ticks(1, function () { G.kbState.right = true; G.dashPressed = (run0 & 1) === 1 && k === 10; });
        feetAt[tick] = G.playerFeetSpatialZ();
      }
      var mine = events.slice(n0).filter(function (e) { return e.self; }).map(function (e) { return {kind: e.type, tick: e.tick, x: e.x, z: e.z}; })
        .concat(burstsOf(b0, 'step.dashTrail').map(function (b) { return {kind: 'trail', tick: b.tick, x: b.x, z: b.z}; }));
      mine.forEach(function (e) {
        laid++; if (e.kind === 'dashStart') dashes++;
        var feet = feetAt[e.tick];
        if (e.x >= 192 && feet > 1) { easing++; if (feet > 8) deep++; }
        if (!(Math.abs(e.z - ground(e.x)) < 1e-6)) wrong.push({run: run0, kind: e.kind, x: r3(e.x), z: r3(e.z), want: r3(ground(e.x)), feet: r3(feet)});
      });
    }
    if (laid < 60 || dashes !== 12 || easing < 3 || deep < 1) throw Error('SETUP step down ' + JSON.stringify({laid: laid, dashes: dashes, easing: easing, deep: deep}));
    check('a walk step down lays its dust on the lower floor, not at the easing feet', !wrong.length,
      {laid: laid, easing: easing, deep: deep, wrong: wrong.slice(0, 4)});
  });
  // 2D drawing: every step spawns its puff in its own tick, and each drawn
  // fx2D puff lies within the spawn disc (2 u) plus its drift (< 4 u) of a
  // step's point, at least 3 px across its radius (the recipe's minPx: a
  // 1-2 u world radius alone is a speck at 1 u per px). Each puff is kicked
  // back against the walk (east): its velocity points west.
  if (needed('G1', ['--dust-every-tick', '--puff-2d-world-size', '--dust-forward'])) run('G1 2D draw', function () {
    var S = authored({mode: '2d'});
    ticks(20);
    var steps = 0, spawned = 0, drawn = 0, far = [], small = [], forward = [];
    for (var k = 0; k < 90; k++) {
      var t = tickSpawns(S, function () { G.kbState.right = true; }, ['step.dust']);
      steps += t.events.filter(function (e) { return e.type === 'footstep'; }).length; spawned += t.fresh['step.dust'].length;
      t.fresh['step.dust'].forEach(function (q) { if (!(q.vx < 0)) forward.push([r3(q.vx), r3(q.vy)]); });
      if (k % 15 === 14) images(frame(/^fx2D$/), 'fx2D').forEach(function (p) {
        var dist = nearest(events, p.x + G.viewCam.x, p.y + G.viewCam.y);
        drawn++; if (!(dist <= 6)) far.push(r3(dist));
        if (!(p.r >= 3 - 1e-9)) small.push(r3(p.r));
      });
    }
    check('in 2D every step spawns its puff, drawn where the step was laid', steps >= 4 && spawned === steps && drawn >= 3 && !far.length && !small.length,
      {steps: steps, spawned: spawned, drawn: drawn, far: far.slice(0, 4), radiiUnder3px: small.slice(0, 4)});
    check('step dust is kicked back against the walk', spawned >= 4 && !forward.length, {spawned: spawned, forward: forward.slice(0, 4)});
  });
  // Kick-back of the other dust (spec 9.3: against the mover's velocity): in
  // 2D the player walks east and dashes ('right' dashes along cam.ang +
  // pi/2, so the dash runs across the walk), and an enemy walks east 60 u
  // south of it. Every puff of the dash burst and of each trail burst, as
  // laid, moves against the player's velocity in its tick (after step()),
  // and every puff of the enemy's steps against the enemy's own move.
  if (needed('G1', ['--dash-dust-forward', '--trail-dust-forward', '--npc-dust-forward'])) run('G1 kick-back', function () {
    authored({mode: '2d'});
    var e = enemyAt('normal', 60, 300, 0), velAt = {}, moveAt = {};
    ticks(10);
    var b0 = bursts.length;
    for (var k = 0; k < 90; k++) {
      var ex = e.x, ey = e.y;
      G.npcMoveToward(e, 360, 300, 60, DT, 6, 0);
      ticks(1, function () { G.kbState.right = true; G.dashPressed = k === 30; });
      velAt[tick] = [G.vel.x, G.vel.y]; moveAt[tick] = [e.x - ex, e.y - ey];
    }
    function against(list, dirAt) {
      var n = 0, forward = [];
      list.forEach(function (b) {
        (b.parts || []).forEach(function (q) {
          var d = dirAt[b.tick]; n++;
          if (!(q.vx * d[0] + q.vy * d[1] < 0)) forward.push({tick: b.tick, v: [r3(q.vx), r3(q.vy)], mover: [r3(d[0]), r3(d[1])]});
        });
      });
      return {puffs: n, forward: forward.length, first: forward.slice(0, 3)};
    }
    var dash = against(burstsOf(b0, 'step.dash'), velAt), trail = against(burstsOf(b0, 'step.dashTrail'), velAt);
    var npc = against(burstsOf(b0, 'step.dust').filter(function (b) { return !b.self; }), moveAt);
    if (dash.puffs < 8 || trail.puffs < 5 || npc.puffs < 2) throw Error('SETUP kick-back ' + JSON.stringify({dash: dash.puffs, trail: trail.puffs, npc: npc.puffs}));
    check('the dash burst is kicked back against the dash', !dash.forward, dash);
    check('the dash trail is kicked back against the dash', !trail.forward, trail);
    check('an NPC\'s step dust is kicked back against its walk', !npc.forward, npc);
  });
  // A non-follow camera (a fixed 3D camera looking down at the player): the
  // steps spawn at the feet and draw in the world layer. Each step's one
  // puff is kept by the distance LOD (under one nominal puff: by its own
  // draw) or counted as refused.
  if (needed('G1', ['--self-world', '--nonfollow-no-draw'])) run('G1 non-follow camera', function () {
    var S = authored({mode: 'nonfollow', x: 100, y: 150, cam: {x: 40, y: 180, z: 60, ang: 0, pitch: 1.0}});
    ticks(20);
    var steps = [], spawned = 0, drawn = 0, far = [], b0 = bursts.length;
    for (var k = 0; k < 60; k++) {
      var t = tickSpawns(S, function () { G.kbState.right = true; }, ['step.dust']);   // 3D, not following: right strafes along +y
      steps = steps.concat(t.events.filter(function (e) { return e.type === 'footstep'; })); spawned += t.fresh['step.dust'].length;
      if (k % 12 === 11) {
        var C = G.getCam3D();
        images(frame(/^ambientFX3D$/), 'ambientFX3D').forEach(function (p) {
          // Back through the pixel to the floor (z 0): forward f from the
          // screen row, then the lateral offset from the column.
          var f = C.cameraZ / ((p.y - C.horizonY) / G.projScale), rgt = (p.x / G.canvas.width - 0.5) * 2 * f / C.invTanHalf;
          var wx = G.cam.x + f * C.cosAng - rgt * C.sinAng, wy = G.cam.y + f * C.sinAng + rgt * C.cosAng, dist = nearest(steps, wx, wy);
          drawn++; if (!(dist <= 8)) far.push(r3(dist));
        });
      }
    }
    var span = steps.map(function (e) { return r3(Math.hypot(e.x - G.cam.x, e.y - G.cam.y)); }), lod = sum(burstsOf(b0, 'step.dust'), 'lod');
    if (steps.length < 2 || span.some(function (d) { return d > 90; })) throw Error('SETUP non-follow steps at ' + JSON.stringify(span));
    check('in a non-follow camera the player\'s steps spawn and draw at the feet', spawned >= 2 && spawned + lod === steps.length && drawn >= 2 && !far.length,
      {steps: steps.length, spawned: spawned, lodRefused: lod, drawn: drawn, far: far.slice(0, 4), span: span});
  });
  // A non-follow camera facing away from the player (the feet behind it,
  // outside any view test): the player's own steps and dash burst still
  // spawn (selfView is a first-person rule), nothing is refused as the
  // player's own, and the first-person screen puffs are skipped.
  if (needed('G1', ['--selfview-any-3d'])) run('G1 non-follow camera facing away', function () {
    var S = authored({mode: 'nonfollow', x: 100, y: 150, cam: {x: 40, y: 180, z: 60, ang: Math.PI, pitch: 0}});
    ticks(20);
    var r0 = S.stats.refusedOffscreenSelf, b0 = bursts.length, n0 = events.length, screen = 0, dashPuffs = 0;
    for (var k = 0; k < 50; k++) {
      var t = tickSpawns(S, function () { G.kbState.right = true; G.dashPressed = k === 20; }, ['step.dust', 'step.dash', 'screen.dashDust']);
      screen += t.fresh['screen.dashDust'].length; dashPuffs += t.fresh['step.dash'].length;
    }
    var mine = events.slice(n0).filter(function (e) { return e.self; }), steps = mine.filter(function (e) { return e.type === 'footstep'; });
    var c = Math.cos(G.cam.ang), s = Math.sin(G.cam.ang), ahead = mine.filter(function (e) { return (e.x - G.cam.x) * c + (e.y - G.cam.y) * s >= 1; });
    var stepB = burstsOf(b0, 'step.dust'), dashes = mine.filter(function (e) { return e.type === 'dashStart'; });
    if (steps.length < 3 || dashes.length !== 1 || ahead.length) throw Error('SETUP facing-away walk ' + JSON.stringify({steps: steps.length, dashes: dashes.length, ahead: ahead.length}));
    check('a non-follow camera spawns the player\'s own dust wherever the feet are, and no screen puffs',
      S.stats.refusedOffscreenSelf - r0 === 0 && sum(stepB, 'spawned') >= 1 && sum(stepB, 'spawned') + sum(stepB, 'lod') === steps.length && dashPuffs >= 3 && screen === 0,
      {refusedSelf: S.stats.refusedOffscreenSelf - r0, steps: steps.length, stepPuffs: sum(stepB, 'spawned'), stepLod: sum(stepB, 'lod'), dashPuffs: dashPuffs, screenPuffs: screen});
  });
  // First person at pitch 0 and at the maximum look-down: the feet are never
  // in view (the nearest visible ground is ~29 u ahead at +1.4), so every
  // self puff is refused and counted, while the walk still emits its steps.
  if (needed('G1', ['--self-world'])) run('G1 first person', function () {
    var out = [0, G.CAM_PITCH_MAX].map(function (pitch) {
      var S = authored({mode: 'fp', pitch: pitch});
      ticks(20);
      var r0 = S.stats.refusedOffscreenSelf, start = worldXY(), drawn = 0;
      var rows = ticks(120, function (k) { G.kbState.up = true; G.cam.pitch = pitch; if (k % 30 === 29) drawn += images(frame(/^ambientFX3D$/), 'ambientFX3D').length; });
      var steps = of('footstep', true), predicted = strideTicks(start, rows, 22);
      return {pitch: pitch, steps: steps.length, match: sameTicks(steps.map(function (e) { return e.tick; }), predicted),
        dust: byRecipe(S, 'step.dust').length, refused: S.stats.refusedOffscreenSelf - r0, drawn: drawn};
    });
    check('the player\'s own footsteps are refused in first person at pitch 0 and at the maximum look-down',
      out.every(function (o) { return o.steps >= 4 && o.match && o.dust === 0 && o.refused === o.steps && o.drawn === 0; }), out);
  });
  // ifVisible's other branch: a player-owned (SELF) burst of ten step puffs
  // 40 u ahead on the floor, looking down (pitch +1.0: (60 - 0) / 40 - 1.0 =
  // 0.5, inside the 2/3 half-height of the view), spawns and draws on the
  // canvas; the same burst 40 u behind is refused and counted.
  if (needed('G1', ['--ifvisible-skip'])) run('G1 ifVisible', function () {
    var S = authored({mode: 'fp', pitch: 1.0}), out = {};
    [['ahead', 40], ['behind', -40]].forEach(function (q) {
      var r0 = S.stats.refusedOffscreenSelf;
      G.cam.pitch = 1.0;
      G.fxEmit('step.dust', G.pos.x + q[1], G.pos.y, 0, {self: true, count: 10});
      observe();
      out[q[0]] = {spawned: newOf(S, 'step.dust').length, refused: S.stats.refusedOffscreenSelf - r0};
      if (q[0] === 'ahead') out.drawn = images(frame(/^ambientFX3D$/), 'ambientFX3D').filter(function (p) { return inCanvas(p.x, p.y); }).length;
    });
    check('a player-owned puff in first-person view spawns under ifVisible; one out of view is refused',
      out.ahead.spawned >= 5 && out.ahead.refused === 0 && out.drawn >= 3 && out.behind.spawned === 0 && out.behind.refused >= 5, out);
  });
  // Airborne: a walking jump lays no step while in the air.
  if (needed('G1', ['--ignore-airborne'])) run('G1 airborne', function () {
    authored({mode: '2d'});
    ticks(20);
    var start = worldXY(), rows = ticks(150, function (k) { G.kbState.right = true; G.jumpPressed = k === 40; });
    var air = rows.filter(function (r) { return r.air; }).map(function (r) { return r.tick; });
    if (air.length < 30) throw Error('SETUP the jump lasted ' + air.length + ' ticks');
    var steps = of('footstep', true), inAir = steps.filter(function (e) { return air.indexOf(e.tick) >= 0; }), predicted = strideTicks(start, rows, 22);
    check('no footstep while airborne', !inAir.length && sameTicks(steps.map(function (e) { return e.tick; }), predicted),
      {inAir: inAir.map(function (e) { return e.tick; }), steps: steps.map(function (e) { return e.tick; }), due: predicted.due, airborne: [air[0], air[air.length - 1]]});
  });

  // ── Density and the distance LOD for one-puff steps ─────────────────────
  // The same 2D walk (16 steps, the camera at the feet) at Particles 40, 25,
  // 10 and 0: at 25 every step lays its one puff; at 10 (0.4 of a puff) a
  // share of them does, never none, and each is the very puff the same step
  // lays at 25 (its seed), as the puffs at 25 are among those at 40; at 0,
  // none, and the observers idle (no step is even observed). The camera
  // is at the feet, so no setting counts a distance-LOD loss.
  if (needed('density', ['--round-small-bursts', '--lod-counts-density', '--observers-at-p0'])) run('density', function () {
    function walk(P) {
      var S = authored({mode: '2d'}), steps = [], seeds = [];
      G.settings.particles = P;
      try {
        ticks(20);
        for (var k = 0; k < 240; k++) {
          var t = tickSpawns(S, function () { G.kbState.right = true; }, ['step.dust']);
          t.events.forEach(function (e) { if (e.type === 'footstep') steps.push(e.tick); });
          t.fresh['step.dust'].forEach(function (q) { seeds.push(q.seed); });
        }
      } finally { G.settings.particles = 25; }
      return {P: P, steps: steps.length, spawned: seeds.length, seeds: seeds, ticks: steps.join(), lod: S.stats.refusedLod, observed: S.stats.obsSteps};
    }
    var w40 = walk(40), w25 = walk(25), w10 = walk(10), w0 = walk(0);
    if (w25.steps < 14 || [w40, w10].some(function (w) { return w.ticks !== w25.ticks; })) throw Error('SETUP density walks ' + [w40, w25, w10, w0].map(function (w) { return w.steps; }));
    function within(a, b) { return a.seeds.every(function (s) { return b.seeds.indexOf(s) >= 0; }); }
    var share = w10.spawned / w10.steps;
    check('a lower Particles setting thins step puffs to a subset instead of dropping them', w25.spawned === w25.steps && w40.spawned > w25.spawned &&
      w10.spawned >= 1 && w10.spawned < w10.steps && share >= 0.15 && share <= 0.7 && within(w10, w25) && within(w25, w40) && w0.spawned === 0,
      [w40, w25, w10, w0].map(function (w) { return {P: w.P, steps: w.steps, spawned: w.spawned}; }).concat([{nested: [within(w10, w25), within(w25, w40)]}]));
    check('density thinning is not counted as a distance loss', [w40, w25, w10, w0].every(function (w) { return w.lod === 0; }),
      [w40, w25, w10, w0].map(function (w) { return {P: w.P, steps: w.steps, spawned: w.spawned, lod: w.lod}; }));
    check('at Particles 0 the movement observers do no work', w0.steps === 0 && w0.observed === 0 && w0.spawned === 0,
      {P0: {steps: w0.steps, observed: w0.observed, spawned: w0.spawned}, P25: {steps: w25.steps}});
  });
  // The 2D view is top-down at 1 u a pixel, so nothing shrinks with
  // distance, and NPC dust is observed out to the view's corners (half its
  // diagonal + 16 u from the view's centre, at least 240 u) and kept only
  // inside the view rectangle (+16 u). At 360 x 240 (the player standing at
  // the view's centre, 120, 200): an enemy walking 150-160 u east (on
  // screen) lays every step's puff; one 230-236 u east, one 150-162 u north
  // and one 150-162 u south (off screen, within 240 u) lay none, each loss
  // counted. At 1920 x 1080 the view's centre lags 300 u west of the player
  // (it eases after the player, 12-render-core-walls.js): an enemy 706 u
  // from it (on screen) and one in its south-west corner, 1015-1059 u from
  // it (moved by hand 24.5 u a tick west off the mesh; beyond the half
  // width + 16 = 976 u and 1289 u from the camera) are observed and lay
  // their puffs.
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  }
  if (needed('2D LOD', ['--2d-perspective-lod', '--2d-npc-radius', '--2d-keep-no-y', '--2d-radius-halfwidth', '--2d-centre-cam'])) run('2D view LOD', function () {
    function walkers(list, n) {
      var b0 = bursts.length, n0 = events.length;
      list.forEach(function (q) { q.e = enemyAt('normal', q.x, q.y, 0); if (q.hand) { q.tx = q.x + 2 * q.hand; q.ty = q.y; } });
      observe();
      for (var k = 0; k < n; k++) {
        list.forEach(function (q) { if (!q.hand) G.npcMoveToward(q.e, q.tx, q.ty, 60, DT, 6, 0); else if (k < 2) q.e.x += q.hand; });
        observe();
      }
      return list.map(function (q) {
        function near(p) { return segDist(p.x, p.y, q.x, q.y, q.tx, q.ty) <= 3 + 1e-6; }
        var mine = burstsOf(b0, 'step.dust').filter(function (b) { return !b.self && near(b); });
        return {name: q.name, steps: events.slice(n0).filter(function (e) { return !e.self && near(e); }).length,
          spawned: sum(mine, 'spawned'), lod: sum(mine, 'lod')};
      });
    }
    var small = withCanvas(360, 240, function () {
      authored({mode: '2d', x: 120, y: 200});
      return walkers([{name: 'onScreen150', x: 270, y: 150, tx: 270, ty: 246}, {name: 'offScreen230', x: 350, y: 150, tx: 350, ty: 246},
        {name: 'north150', x: 60, y: 50, tx: 156, ty: 50}, {name: 'south150', x: 60, y: 350, tx: 156, ty: 350}], 100);
    });
    var wide = withCanvas(1920, 1080, function () {
      authored({mode: '2d', x: 40, y: 240});
      G.viewCam = {x: -260 - 960, y: 240 - 540};
      return walkers([{name: 'onScreen400', x: 440, y: 150, tx: 440, ty: 246}, {name: 'corner', x: -1160, y: 710, hand: -24.5}], 100);
    });
    var all = small.concat(wide);
    if (small.some(function (w) { return w.steps < 4; })) throw Error('SETUP 2D walkers ' + JSON.stringify(all));
    function kept(w) { return w.spawned === w.steps && w.lod === 0; }
    function lost(w) { return w.spawned === 0 && w.lod === w.steps; }
    check('in 2D, NPC dust spawns anywhere in the view, at any distance, and nowhere outside it',
      kept(small[0]) && lost(small[1]) && lost(small[2]) && lost(small[3]) && wide[0].steps >= 4 && kept(wide[0]) && wide[1].steps === 2 && kept(wide[1]), all);
  });
  // 3D (first person, Particles 25): an enemy walking 150-170 u ahead, where
  // the step recipe keeps a quarter to a third of a puff: every step either
  // spawns its puff or is counted as refused by the distance LOD.
  if (needed('3D LOD', ['--lod-uncounted'])) run('3D LOD accounting', function () {
    authored({mode: 'fp', x: 60, y: 240});
    var e = enemyAt('normal', 210, 200, 0), b0 = bursts.length, n0 = events.length;
    observe();
    for (var k = 0; k < 120; k++) { G.npcMoveToward(e, 210, 320, 60, DT, 6, 0); observe(); }
    var steps = events.slice(n0).filter(function (q) { return !q.self; }).length, mine = burstsOf(b0, 'step.dust');
    if (steps < 4) throw Error('SETUP the far enemy stepped ' + steps + ' times');
    check('every step puff the distance LOD drops is counted', sum(mine, 'lod') >= 1 && sum(mine, 'spawned') + sum(mine, 'lod') === steps,
      {steps: steps, spawned: sum(mine, 'spawned'), lod: sum(mine, 'lod')});
  });
  // In 3D a far puff shrinks with distance: the 3 px floor is a 2D rule
  // (minPx2D). First person at pitch 0 on the flat floor, a burst of step
  // dust (40 nominal puffs, not the player's own) 100 u or 200 u ahead,
  // drawn in the next frame at 360 x 240 and at 1920 x 1080: every puff
  // 200 u away is drawn under the floor (3 px x resScale), and the mean
  // radius at 100 u is about twice that at 200 u (1 / distance).
  if (needed('3D far', ['--dust-3d-floor'])) run('3D far puffs', function () {
    var out = [[360, 240], [1920, 1080]].map(function (wh) {
      return withCanvas(wh[0], wh[1], function () {
        var r = {};
        [100, 200].forEach(function (dist) {
          authored({mode: 'fp', x: 60, y: 240});
          G.fxEmit('step.dust', 60 + dist, 240, 0, {count: 40});
          observe();
          r[dist] = images(frame(/^ambientFX3D$/), 'ambientFX3D').map(function (p) { return p.r; });
        });
        function mean(a) { return a.reduce(function (t, v) { return t + v; }, 0) / (a.length || 1); }
        return {res: wh[0] + 'x' + wh[1], RS: r3(G.resScale), n100: r[100].length, n200: r[200].length, r200max: r3(Math.max.apply(null, r[200])),
          ratio: r3(mean(r[100]) / mean(r[200]))};
      });
    });
    if (out.some(function (o) { return o.n100 < 8 || o.n200 < 5; })) throw Error('SETUP far puffs ' + JSON.stringify(out));
    check('far step dust in 3D shrinks with distance', out.every(function (o) { return o.r200max < 3 * o.RS && o.ratio >= 1.5 && o.ratio <= 2.5; }), out);
  });

  // ── G2: a dash bursts once, trails for its duration, reads in first person
  if (needed('G2', ['--dash-every-tick', '--trail-not-self', '--trail-world'])) run('G2 dash', function () {
    // First person: one dashStart, in the tick dashUntil rose; its world
    // burst (8-12 puffs) and every trail burst are the player's own, at the
    // feet: on no dash tick does a world puff spawn, and each is refused and
    // counted, burst and trail apart; the screen puffs are drawn inside the
    // canvas under the arms.
    var S = authored({mode: 'fp'});
    ticks(20);
    var b0 = bursts.length, rows = [], worldFresh = [], onCanvas = [], placed = null, screen = 0;
    for (var k = 0; k < 16; k++) {
      var t = tickSpawns(S, function () { G.kbState.up = true; G.dashPressed = k === 1; });
      rows.push({tick: tick, dashUntil: G.dashUntil});
      worldFresh.push(t.fresh['step.dash'].length + t.fresh['step.dashTrail'].length);
      screen += t.fresh['screen.dashDust'].length;
      if (k >= 1 && k <= 3) {
        var shown = images(frame(/^fxOverlay$/), 'fxOverlay').filter(function (p) { return inCanvas(p.x, p.y); });
        onCanvas.push(shown.length);
        // In the lower half, on both sides of the arms (left and right of centre).
        if (k === 1) placed = {left: shown.filter(function (p) { return p.x < G.canvas.width / 2; }).length, right: shown.filter(function (p) { return p.x > G.canvas.width / 2; }).length,
          upper: shown.filter(function (p) { return p.y < G.canvas.height / 2; }).length};
      }
    }
    var rose = rows.filter(function (r, i) { return r.dashUntil > (i ? rows[i - 1].dashUntil : 0); }).map(function (r) { return r.tick; });
    var dashes = of('dashStart'), burst = burstsOf(b0, 'step.dash'), trail = burstsOf(b0, 'step.dashTrail');
    check('a dash emits one burst plus a trail and is visible in first person', rose.length === 1 && dashes.length === 1 && dashes[0].tick === rose[0] &&
      dashes[0].self && screen >= 3 && onCanvas.every(function (n) { return n === screen; }) && placed.left >= 1 && placed.right >= 1 && placed.upper === 0 &&
      worldFresh.every(function (n) { return n === 0; }) && burst.length === 1 && burst[0].spawned === 0 && burst[0].refusedSelf >= 8 && burst[0].refusedSelf <= 12 &&
      trail.length >= 5 && sum(trail, 'spawned') === 0 && sum(trail, 'refusedSelf') >= 8,
      {rose: rose, dashes: dashes.map(function (e) { return e.tick; }), screenPuffs: screen, onCanvas: onCanvas, placed: placed, worldFresh: worldFresh,
        burst: burst.map(function (b) { return {spawned: b.spawned, refused: b.refusedSelf}; }),
        trail: {bursts: trail.length, spawned: sum(trail, 'spawned'), refused: sum(trail, 'refusedSelf')}});
    // 2D: the world burst (8-12 puffs, a step lays one) in the dash's tick,
    // and a 45/s trail only on ticks that end inside the dash (gameTimeNow()
    // < dashUntil), about 45 x 0.2 s = 9 puffs; no screen puffs in 2D.
    S = authored({mode: '2d'});
    ticks(20);
    var trail2 = [], burst2 = 0, dashTick = -1, steps = 0;
    for (k = 0; k < 40; k++) {
      var t2 = tickSpawns(S, function () { G.kbState.right = true; G.dashPressed = k === 2; });
      var inside = G.gameTimeNow() < G.dashUntil;
      if (t2.events.some(function (e) { return e.type === 'dashStart'; })) { dashTick = tick; burst2 = t2.fresh['step.dash'].length; }
      steps = Math.max(steps, t2.fresh['step.dust'].length);
      if (t2.fresh['step.dashTrail'].length) trail2.push({tick: tick, n: t2.fresh['step.dashTrail'].length, inside: inside});
    }
    var outside = trail2.filter(function (q) { return !q.inside; }), total = trail2.reduce(function (n, q) { return n + q.n; }, 0);
    check('the dash trail lasts the dash and the dash burst outweighs a step', dashTick > 0 && burst2 >= 8 && burst2 <= 12 && burst2 > steps &&
      total >= 8 && total <= 10 && !outside.length && byRecipe(S, 'screen.dashDust').length === 0 && of('dashStart').length === 1,
      {dashTick: dashTick, burst: burst2, stepPuffs: steps, trail: trail2, outside: outside, dashes: of('dashStart').length});
  });
  // A portrait phone in fullscreen (390 x 844): every first-person dash
  // puff is drawn inside the canvas, on both sides of its centre, and sized
  // in the screen unit su = min(h, 0.75 w) (292.5 px there): the same dash
  // on a 640 x 480 canvas (su 480) draws the same puffs, so each portrait
  // radius (sorted) is at most the 4:3 one x 292.5 / 480.
  if (needed('G2', ['--screen-canvas-heights', '--screen-size-canvas-height', '--screen-y-width-unit'])) run('G2 portrait', function () {
    function dash(w, h) {
      return withCanvas(w, h, function () {
        var S = authored({mode: 'fp'});
        ticks(20);
        ticks(2, function (k) { G.kbState.up = true; G.dashPressed = k === 1; });
        var all = images(frame(/^fxOverlay$/), 'fxOverlay'), shown = all.filter(function (p) { return inCanvas(p.x, p.y); });
        return {puffs: byRecipe(S, 'screen.dashDust').length, drawn: all.length, inside: shown.length,
          left: shown.filter(function (p) { return p.x < w / 2; }).length, right: shown.filter(function (p) { return p.x > w / 2; }).length,
          x: all.map(function (p) { return Math.round(p.x); }), r: all.map(function (p) { return p.r; }).sort(function (a, b) { return a - b; }),
          y: all.map(function (p) { return r3(p.y / h); }), su: Math.min(h, 0.75 * w)};
      });
    }
    var got = dash(390, 844), ref = dash(640, 480);
    if (got.puffs < 3 || ref.puffs !== got.puffs || ref.drawn !== ref.puffs) throw Error('SETUP portrait dash ' + JSON.stringify([got, ref]));
    check('first-person dash puffs stay inside a portrait canvas', got.inside === got.drawn && got.drawn === got.puffs && got.left >= 1 && got.right >= 1,
      {puffs: got.puffs, drawn: got.drawn, inside: got.inside, left: got.left, right: got.right, x: got.x});
    // Screen y is in canvas heights on any canvas (S9): the puffs spawn 0.12-0.26
    // of the height below the centre and drift under 0.02 of it in two ticks.
    var band = got.y.concat(ref.y).filter(function (v) { return !(v >= 0.6 && v <= 0.78); });
    check('first-person dash puffs sit 0.12-0.26 canvas heights below the centre on a portrait canvas too', got.y.length === got.puffs && !band.length,
      {portrait: got.y, landscape: ref.y, outside: band});
    var k = got.su / ref.su, over = got.r.filter(function (r, i) { return !(r <= ref.r[i] * k * (1 + 1e-9)); });
    check('portrait dash puffs are sized by the screen unit, no larger than on a 4:3 canvas', got.r.length === ref.r.length && !over.length,
      {unit: [got.su, ref.su], portrait: got.r.map(r3), landscape: ref.r.map(r3), over: over.map(r3)});
  });
  // The frontSides A/B override on the dash burst (setEffectPlacementOverride,
  // spec 5.7): in first person the burst moves into a wedge 96-160 u ahead at
  // pitch 0 (past the ~90 u of ground below the canvas), so it spawns
  // (selfView applies only at the source) and most of it draws on the canvas;
  // on a 20 degree ramp, facing downhill, every puff of it starts on the
  // slope ahead (at most 3 u above the plane after its first tick), not at
  // the feet's height 20-50 u above it.
  if (needed('G2', ['--selfview-any-place', '--wedge-at-feet', '--wedge-near'])) run('G2 frontSides', function () {
    G.setEffectPlacementOverride('step.dash', 'frontSides');
    try {
      var S = authored({mode: 'fp'}), flat = {spawned: 0, drawn: 0};
      ticks(20);
      for (var k = 0; k < 3; k++) {
        var t = tickSpawns(S, function () { G.kbState.up = true; G.dashPressed = k === 0; }, ['step.dash']);
        if (k === 0) { flat.spawned = t.fresh['step.dash'].length; flat.drawn = drawnOf(t.fresh['step.dash'], frame(/^ambientFX3D$/), 'ambientFX3D'); }
      }
      S = authored({kind: 'ramp', mode: 'fp', x: 300, y: 240, feetH: 300 * TAN20 / 25, ang: Math.PI});
      ticks(20);
      var t2 = tickSpawns(S, function () { G.kbState.up = true; G.dashPressed = true; }, ['step.dash']), feet = G.playerFeetSpatialZ();
      var ramp = t2.fresh['step.dash'].map(function (q) { return {x: r3(q.x), above: r3(q.z - q.x * TAN20), feetAbove: r3(feet - q.x * TAN20)}; });
      if (ramp.some(function (q) { return q.feetAbove < 15; })) throw Error('SETUP frontSides ramp ' + JSON.stringify(ramp.slice(0, 4)));
      var floating = ramp.filter(function (q) { return !(q.above >= -0.01 && q.above <= 3); });
      check('a frontSides dash burst spawns in first person, in view and on the ground ahead', flat.spawned >= 8 && flat.drawn * 2 > flat.spawned && ramp.length >= 8 && !floating.length,
        {flat: flat, rampPuffs: ramp.length, floating: floating.slice(0, 4)});
    } finally { G.setEffectPlacementOverride('step.dash', null); }
  });
  // A frontSides wedge point with no ground (off the mesh's east edge) is
  // refused before admission. A pool at its budget (capacity 300, no
  // reserve: 40 motes, the ambient cap, and 260 pickup-burst particles),
  // first person at (440, 240): 10 wedge puffs facing east (x 536-600, off
  // the mesh) take no live particle's slot and are counted as refused for
  // want of support; the same burst facing west (over the mesh) spawns, a
  // mote stolen for each puff (the fixture reaches the steal path; the
  // bounded steal scan finds motes for some of them). The wedge's stratum
  // test never calls the allocating getCaveSpaceAt.
  if (needed('G2', ['--wedge-admit-first', '--wedge-allocates'])) run('G2 frontSides without ground', function () {
    var realSpawn = G.fxSpawn, realCave = G.getCaveSpaceAt, inWedge = false, caveCalls = 0;
    G.setEffectPlacementOverride('step.dash', 'frontSides');
    G.fxSpawn = function (S, r) {
      var prev = inWedge;
      inWedge = S.C.LIST[r].id === 'step.dash';
      try { return realSpawn.apply(G, arguments); } finally { inWedge = prev; }
    };
    G.getCaveSpaceAt = function () { if (inWedge) caveCalls++; return realCave.apply(G, arguments); };
    try {
      var out = [['east', 0], ['west', Math.PI]].map(function (q) {
        authored({mode: 'fp', x: 440, y: 240, ang: q[1]});
        var S = G.fxState = G.createFxState(300, 6006, {pinned: true, reserve: 0});
        observe();
        G.fxEmit('ambient.dust', 440, 240, 5, {count: 40});
        G.fxEmit('burst.tome', 440, 240, 10, {count: 260});
        observe();
        var full = {count: S.count, B: S.B, ambient: S.classLive[1]}, st0 = S.stats.stolen, ns0 = S.stats.refusedNoSupport, c0 = caveCalls, b0 = bursts.length;
        G.fxEmit('step.dash', 440, 240, 0, {count: 10});
        observe();
        return {facing: q[0], full: full, spawned: sum(burstsOf(b0, 'step.dash'), 'spawned'), stolen: S.stats.stolen - st0,
          noSupport: S.stats.refusedNoSupport - ns0, caveCalls: caveCalls - c0};
      });
    } finally { G.fxSpawn = realSpawn; G.getCaveSpaceAt = realCave; G.setEffectPlacementOverride('step.dash', null); }
    if (out.some(function (o) { return o.full.count !== 300 || o.full.B !== 300 || o.full.ambient < 10; })) throw Error('SETUP full pool ' + JSON.stringify(out));
    check('a frontSides wedge puff with no ground never takes a live particle\'s slot', out[0].spawned === 0 && out[0].noSupport === 10 && out[0].stolen === 0 &&
      out[1].spawned >= 1 && out[1].stolen === out[1].spawned, out);
    check('the frontSides wedge never calls the allocating getCaveSpaceAt', out[1].spawned >= 1 && out[1].noSupport === 0 && out[1].caveCalls === 0, out);
  });
  // A dash needs ground (the S6 fix): its burst and trail lie on the
  // support within a step (1 H) below airborne feet, or are refused and
  // counted. 2D (every puff kept): a dash 40 ticks into a jump from the flat
  // floor (the feet ~40 u up, falling) lays no burst and no trail until the
  // feet come within 25 u of the floor, then trail puffs on it; a dash along
  // wall top A (33.6 u) off its east end (x 405) lays its burst and trail on
  // the top, then none over the ground 33.6 u below while the feet are more
  // than 25 u above it. Every spawned puff is laid on the authored ground
  // under its burst's point (the disc is flat; a grounded burst, by the
  // step rule, at the feet where that ground is more than 1 H from them:
  // the tick the player walks past the wall's end before step() lets it
  // fall), and every burst out of reach spawns none and counts its puffs as
  // refused for want of support.
  if (needed('G2', ['--dash-air-feet', '--dash-air-any-height'])) run('G2 airborne dash', function () {
    var seen = {grounded: 0, inReach: 0, outOfReach: 0}, bad = [];
    function groundAt(x, y) {
      var gx = Math.floor(x / CELL), gy = Math.floor(y / CELL), wi = gy * GW + gx;
      return gx >= 0 && gy >= 0 && gx < GW && gy < GW && G.grid[wi] ? G.wallHeights[wi] * 240 : 0;
    }
    function dash(name, setup, n, input) {
      setup();
      ticks(5);
      var b0 = bursts.length, at = {};
      for (var k = 0; k < n; k++) { ticks(1, function () { input(k); }); at[tick] = {feet: G.playerFeetSpatialZ(), air: G.jumpAirborne}; }
      burstsOf(b0, 'step.dash').concat(burstsOf(b0, 'step.dashTrail')).forEach(function (b) {
        var a = at[b.tick], ground = groundAt(b.x, b.y), reach = !a.air ? 'grounded' : a.feet - ground <= 25 ? 'inReach' : 'outOfReach';
        var want = reach === 'grounded' && Math.abs(a.feet - ground) > 25 ? a.feet : ground;
        seen[reach]++;
        var laid = (b.parts || []).filter(function (q) { return Math.abs(q.z - want) < 1e-6; }).length;
        var ok = reach === 'outOfReach' ? b.spawned === 0 && b.noSupport > 0 : b.spawned > 0 && b.parts && laid === b.spawned;
        if (!ok) bad.push({scene: name, id: b.id, tick: b.tick, reach: reach, feet: r3(a.feet), ground: ground, spawned: b.spawned, noSupport: b.noSupport,
          z: (b.parts || []).slice(0, 2).map(function (q) { return r3(q.z); })});
      });
    }
    dash('jump', function () { authored({mode: '2d', ang: -Math.PI / 2}); }, 70, function (k) { G.kbState.right = true; G.jumpPressed = k === 0; G.dashPressed = k === 40; });
    dash('wallEnd', function () { authored({mode: '2d', x: 370, y: 247.5, feetH: 0.14 * 240 / 25, walls: ruinRows, ang: -Math.PI / 2}); }, 30,
      function (k) { G.kbState.right = true; G.dashPressed = k === 0; });
    if (seen.grounded < 2 || seen.inReach < 1 || seen.outOfReach < 3) throw Error('SETUP airborne dashes ' + JSON.stringify(seen));
    check('an airborne dash lays its dust on the ground within a step below the feet, or none', !bad.length, {seen: seen, bad: bad.slice(0, 4)});
    // First person: the same jump and dash; its screen puffs (the view of
    // the same dust) are refused with the world burst.
    authored({mode: 'fp'});
    ticks(5);
    var b0 = bursts.length;
    ticks(70, function (k) { G.kbState.up = true; G.jumpPressed = k === 0; G.dashPressed = k === 40; });
    var sc = burstsOf(b0, 'screen.dashDust');
    check('a first-person dash with no ground under it shows no screen puffs', sc.length === 1 && sc[0].spawned === 0 && sc[0].noSupport === 6,
      {bursts: sc.map(function (b) { return {tick: b.tick, spawned: b.spawned, noSupport: b.noSupport}; })});
  });

  // ── G3: landing emits once, scaled by fall speed ─────────────────────────
  // 2D (the puffs spawn): jumps at the default impulse and at half of it, a
  // 3-tick hop, hops of exactly 5 and 6 airborne ticks, and a fall off a 6 H
  // (150 u) cliff. The scale comes from the jumpVelZ recorded here on the
  // last airborne tick, clamped to 0.4-1.6; the landing tick itself reads 0
  // (step() zeroed it).
  if (needed('G3', ['--land-every-tick', '--land-reads-current-vz', '--land-after-7', '--land-after-5', '--no-clamp'])) run('G3 landing', function () {
    var impulse = G.GAME_CONFIG.player.jumpImpulse;
    function landing(setup, input) {
      var S = setup(), rows = [], puffs = {}, lands = [];
      ticks(10);
      for (var k = 0; k < 120; k++) {
        var t = tickSpawns(S, function () { input(k); }, ['step.land']);
        rows.push({tick: tick, air: G.jumpAirborne, vz: G.jumpVelZ});
        if (t.fresh['step.land'].length) puffs[tick] = t.fresh['step.land'].length;
        lands = lands.concat(t.events.filter(function (e) { return e.type === 'land'; }));
      }
      var land = -1, last = null;
      for (var i = 1; i < rows.length; i++) if (rows[i - 1].air && !rows[i].air && land < 0) { land = rows[i].tick; last = rows[i - 1]; }
      var landRow = rows.filter(function (r) { return r.tick === land; })[0] || {}, raw = last ? -last.vz / 200 : null;
      return {airborne: rows.filter(function (r) { return r.air; }).length, landTick: land, lastVz: last && r3(last.vz), landTickVz: landRow.vz,
        raw: raw === null ? null : r3(raw), want: raw === null ? null : r3(Math.max(0.4, Math.min(1.6, raw))),
        lands: lands.map(function (e) { return {tick: e.tick, scale: r3(e.scale)}; }), puffs: puffs};
    }
    function jump(v) {
      G.GAME_CONFIG.player.jumpImpulse = v;
      try { var j = landing(function () { return authored({mode: '2d'}); }, function (k) { G.jumpPressed = k === 2; }); j.impulse = v; return j; }
      finally { G.GAME_CONFIG.player.jumpImpulse = impulse; }
    }
    var hi = jump(impulse), lo = jump(impulse / 2), hop = jump(25), hop5 = jump(33), hop6 = jump(38);
    var fall = landing(function () { return authored({kind: 'cliff', mode: '2d', x: 150, y: 240, feetH: 6}); }, function () { G.kbState.right = true; });
    if (hi.airborne < 30 || lo.airborne < 10 || hi.landTickVz !== 0 || lo.landTickVz !== 0 || !(hop.airborne >= 1 && hop.airborne < 5) ||
        hop5.airborne !== 5 || hop6.airborne !== 6 || !(hop6.raw < 0.4) || !(fall.raw > 1.6) || fall.landTickVz !== 0)
      throw Error('SETUP jumps ' + JSON.stringify([hi, lo, hop, hop5, hop6, fall]));
    // Puffs: round(8..12 x scale) at P 25 (class scale 1, the camera at the feet).
    function exact(j) {
      var n = j.puffs[j.landTick] || 0;
      return j.lands.length === 1 && j.lands[0].tick === j.landTick && Math.abs(j.lands[0].scale - j.want) < 1e-3 &&
        Object.keys(j.puffs).length === 1 && n >= Math.round(8 * j.want) && n <= Math.round(12 * j.want);
    }
    check('landing emits once, scaled by fall speed', exact(hi) && exact(lo) && hi.want > lo.want && !hop.lands.length,
      {high: hi, low: lo, hop: hop});
    check('a landing needs 6 airborne ticks: a 5-tick hop lays none, a 6-tick hop one', !hop5.lands.length &&
      hop6.lands.length === 1 && hop6.lands[0].tick === hop6.landTick, {hop5: hop5, hop6: hop6});
    check('the landing scale is clamped to 0.4-1.6', exact(hop6) && hop6.want === 0.4 && exact(fall) && fall.want === 1.6,
      {hop6: {raw: hop6.raw, lands: hop6.lands}, fall: {raw: fall.raw, lands: fall.lands, puffs: fall.puffs[fall.landTick]}});
    // First person: the same jump lands in the same tick; its puffs are the
    // player's own, so the whole scaled burst, round(8..12 x scale), is
    // refused and counted, and none spawns.
    var S = authored({mode: 'fp'});
    ticks(10);
    var r0 = S.stats.refusedOffscreenSelf;
    ticks(120, function (k) { G.jumpPressed = k === 2; });
    var fpLands = of('land'), refused = S.stats.refusedOffscreenSelf - r0;
    check('the player\'s own landing is refused in first person', fpLands.length === 1 && fpLands[0].tick === hi.landTick &&
      byRecipe(S, 'step.land').length === 0 && refused >= Math.round(8 * hi.want) && refused <= Math.round(12 * hi.want),
      {lands: fpLands.map(function (e) { return e.tick; }), landTick: hi.landTick, puffs: byRecipe(S, 'step.land').length, refused: refused, scale: hi.want});
  });
  // In 2D a landing draws as growing stroked rings (spec 4.6: view2D
  // 'ring'), one per landing puff and at least 3 px in radius (minPx2D),
  // not as discs: a jump in place, the fx2D stage 1 and 18 ticks after the
  // landing (every puff lives 21-36 ticks; no step, so the landing's are the
  // only puffs); the mean ring radius grows by over 10%.
  if (needed('G3', ['--land-2d-puff'])) run('G3 2D landing', function () {
    var S = authored({mode: '2d'}), landTick = -1, frames = [];
    ticks(10);
    for (var k = 0; k < 100 && frames.length < 2; k++) {
      ticks(1, function () { G.jumpPressed = k === 2; });
      if (landTick < 0 && of('land').length) landTick = tick;
      if (landTick > 0 && (tick === landTick + 1 || tick === landTick + 18)) {
        var draws = frame(/^fx2D$/), radii = [];
        draws.forEach(function (d) { if (d.kind === 'stroke') d.path.forEach(function (op) { if (op[0] === 'ellipse') radii.push(Math.min(op[3], op[4])); }); });
        frames.push({tick: tick, live: byRecipe(S, 'step.land').length, rings: radii.length, images: images(draws, 'fx2D').length,
          minR: radii.length ? r3(Math.min.apply(null, radii)) : null, meanR: radii.length ? r3(radii.reduce(function (t, v) { return t + v; }, 0) / radii.length) : null});
      }
    }
    if (landTick < 0 || frames.length !== 2 || frames[0].live < 6 || frames[1].live !== frames[0].live) throw Error('SETUP 2D landing ' + JSON.stringify({landTick: landTick, frames: frames}));
    check('a 2D landing draws growing stroked rings', frames.every(function (f) { return f.rings === f.live && f.images === 0 && f.minR >= 3 - 1e-9; }) &&
      frames[1].meanR > frames[0].meanR * 1.1, frames);
  });

  // ── G4: a chunk crossing or a teleport is not a footstep ─────────────────
  // Endless seed 777 (the real generator), in 2D so the puffs spawn: the
  // player walks east over the window's shift line on an open lane; the steps
  // fall on the ticks the world path predicts, through the 480 u shift, and
  // each puff takes the dust of its chunk's biome (the generator's own field).
  // Then a 1,000 u teleport east onto open ground (the window follows):
  // standing there lays no step, and walking on from there lays steps on
  // the ticks predicted from the destination (the stride starts afresh).
  function lcg(seed) { var s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function startEndless(seed) {
    var next = lcg(seed * 7919 + 13), used = false;
    Math.random = function () { if (!used) { used = true; return (seed - 0.5) / 999999; } return next(); };
    G.CAVE_TEST_MODE = false; G.ENDLESS_MODE = true; G.running = true; G.gameOverState = false;
    G.menuOpen = G.settingsOpen = G.shopOpen = G.inventoryOpen = G.forgeOpen = G.overviewActive = false;
    G.MODE3D = true; G.CAM_FOLLOW = true;
    G.resetEndlessMode();
    if (G.WORLD_SEED !== seed) throw Error('SETUP world seed ' + G.WORLD_SEED + ' is not ' + seed);
    G.startGameClock(); G.clearGameplayInput();
    G.USE_KEYBOARD = true; G.USE_MOUSE = true; G.USE_GAMEPAD = false; G.CONTROL_MODE = G.MODE_STICK_AIM;
    G.enemies = []; G.companions = []; G.fortressAllies = []; G.projectiles = [];
    G.health = G.HEALTH_MAX; G.settings.particles = 25; G.renderPresentationAlpha = 1;
  }
  // An open lane at y from x0 to x1: no wall cell, the top walkable layer
  // within 0.6 H of the start, never under a roof.
  function openLane(x0, x1, y) {
    var m = G.floorMesh, h0 = null;
    for (var x = x0; x <= x1; x += 3) {
      var gx = Math.floor(x / G.cell), gy = Math.floor(y / G.cell), mx = Math.floor(x / m.gridSize), my = Math.floor(y / m.gridSize);
      if (gx < 0 || gy < 0 || gx >= G.gridW || gy >= G.gridH || G.grid[gy * G.gridW + gx] || mx < 0 || my < 0 || mx >= m.w || my >= m.h) return null;
      var top = G.getTopWalkableLayerIdx(mx, my);
      if (top < 0) return null;
      var h = G.meshLayerHeight(m, my * m.w + mx, top);
      if (h0 === null) h0 = h;
      if (!Number.isFinite(h) || Math.abs(h - h0) > 0.6 || G.getCaveSpaceAt(x, y, h).underground) return null;
    }
    return h0;
  }
  function findLane(x0, x1, y0) {
    for (var dy = 0; dy < 400; dy += 7) for (var sgn = 1; sgn >= -1; sgn -= 2) {
      var y = y0 + sgn * dy, h = openLane(x0, x1, y);
      if (h !== null) return {y: y, h: h};
    }
    return null;
  }
  function place(x, lane) {
    G.pos.x = x; G.pos.y = lane.y; G.pos.floorZ = 60 + 40 * lane.h; G.vel.x = G.vel.y = 0; G.jumpAirborne = false; G.jumpVelZ = 0;
    G.cam.x = G.pos.x; G.cam.y = G.pos.y; G.cam.z = G.pos.floorZ; G.cam.ang = 0; G.cam.pitch = 0;
  }
  // Step dust colours: floor band 5 of each biome (01-materials.js
  // BIOME_PALETTE) with the spec 9.3 overrides (snow '#eef4fa' on ice, sand
  // '#c8b48c' in the expanse) and the cave stone's damp role underground,
  // kicked up: 60% of the way to '#d8cfbd' (the S6 browser amendment), each
  // channel rounded, unless already lighter than it (Rec. 709 luma: snow).
  function luma(v) { return 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255); }
  function kicked(h) {
    var c = hex(h), up = hex('#d8cfbd'), out = 0;
    if (luma(c) >= luma(up)) return h;
    for (var sh = 16; sh >= 0; sh -= 8) { var a = (c >> sh) & 255; out = out * 256 + Math.round(a + (((up >> sh) & 255) - a) * 0.6); }
    return rgbHex(out);
  }
  var BIOME_DUST = {cave: kicked('#8a8a90'), ground: kicked('#6a9a79'), plains: kicked('#808e50'), forest: kicked('#5a7a40'),
    expanse: kicked('#c8b48c'), ice: kicked('#eef4fa')};
  var CAVE_DAMP = kicked('#50595b');
  if (needed('G4', ['--local-coords', '--no-teleport-reset', '--dust-fixed-colour', '--tp-kill', '--tp-keep-acc'])) run('G4 crossing and teleport', function () {
    startEndless(777);
    bursts = [];
    var half = Math.floor(G.WINDOW_CHUNKS / 2), edge = (G.windowCX + half + 1) * G.CHUNK_SIZE - G.windowOriginX;
    var lane = findLane(edge - 60, edge + 80, G.pos.y);
    if (!lane) throw Error('SETUP no open lane across the shift line');
    place(edge - 55, lane);
    G.MODE3D = false;
    var S = G.fxState = G.createFxState(G.EFFECT_CONFIG.capacity, G.WORLD_SEED, {pinned: true});
    events = []; tick = 0;
    ticks(10);
    var origin0 = G.windowOriginX, start = worldXY(), rows = [], colours = [];
    for (var k = 0; k < 90; k++) {
      var t = tickSpawns(S, function () { G.kbState.right = true; }, ['step.dust']);
      rows.push({tick: tick, x: worldXY()[0], y: worldXY()[1], air: G.jumpAirborne, origin: G.windowOriginX});
      t.events.filter(function (e) { return e.type === 'footstep' && e.self; }).forEach(function (e) {
        var chunk = G.chunks[Math.floor(e.wx / G.CHUNK_SIZE) + ',' + Math.floor(e.wy / G.CHUNK_SIZE)];
        t.fresh['step.dust'].forEach(function (q) { colours.push({tick: tick, biome: chunk && chunk.biome, rgb: rgbHex(q.rgb)}); });
      });
    }
    var shifts = rows.filter(function (r, i) { return r.origin !== (i ? rows[i - 1].origin : origin0); });
    var predicted = strideTicks(start, rows, 22), steps = of('footstep', true).map(function (e) { return e.tick; });
    var crossTick = shifts.length ? shifts[0].tick : -1, before = steps.filter(function (x) { return x < crossTick; }).length;
    var jumps = rows.filter(function (r, i) { var p = i ? rows[i - 1] : {x: start[0], y: start[1]}; return Math.hypot(r.x - p.x, r.y - p.y) > 10 || r.air; });
    if (shifts.length !== 1 || G.windowOriginX - origin0 !== 480 || before < 2 || steps.length - before < 2 || jumps.length)
      throw Error('SETUP crossing ' + JSON.stringify({shifts: shifts.length, delta: G.windowOriginX - origin0, before: before, after: steps.length - before, jumps: jumps.length}));
    // The teleport: 1,000 u east; the window follows (updateChunks), then the
    // player stands on an open lane there (long enough to walk 90 u east),
    // found after the window moved.
    var o0 = G.windowOriginX, last = worldXY(), n0 = events.length;
    G.pos.x += 1000; G.cam.x = G.pos.x; G.updateChunks();
    var there = findLane(G.pos.x - 20, G.pos.x + 110, G.pos.y);
    if (!there || G.windowOriginX === o0) throw Error('SETUP no open ground after the teleport (origin ' + o0 + ' -> ' + G.windowOriginX + ')');
    place(G.pos.x, there);
    var after = ticks(20), moved = Math.hypot(after[0].x - last[0], after[0].y - last[1]);
    var still = after.every(function (r, i) { return !i || Math.hypot(r.x - after[i - 1].x, r.y - after[i - 1].y) < 1; });
    var tpSteps = events.slice(n0).filter(function (e) { return e.type === 'footstep' && e.self; }).length;
    if (!(moved > 900) || !still) throw Error('SETUP teleport moved ' + r3(moved) + ' u, standing ' + still);
    var n2 = events.length, from = worldXY(), walkOn = ticks(60, function () { G.kbState.right = true; });
    var onSteps = events.slice(n2).filter(function (e) { return e.type === 'footstep' && e.self; }).map(function (e) { return e.tick; });
    var onDue = strideTicks(from, walkOn, 22), onJumps = walkOn.filter(function (r, i) { var p = i ? walkOn[i - 1] : {x: from[0], y: from[1]}; return Math.hypot(r.x - p.x, r.y - p.y) > 10 || r.air; });
    if (onDue.path < 50 || onJumps.length) throw Error('SETUP the walk after the teleport covered ' + r3(onDue.path) + ' u');
    var dueBefore = predicted.due.filter(function (x) { return x < crossTick; }), gotBefore = steps.filter(function (x) { return x < crossTick; });
    var firstDue = predicted.due.filter(function (x) { return x >= crossTick; })[0], firstGot = steps.filter(function (x) { return x >= crossTick; })[0];
    check('a chunk crossing is not a footstep', sameTicks(steps, predicted),
      {crossTick: crossTick, beforeOk: gotBefore.join() === dueBefore.join(), lateAfter: firstGot > firstDue, steps: steps, due: predicted.due, path: r3(predicted.path)});
    check('a teleport is not a footstep', tpSteps === 0, {teleportSteps: tpSteps, teleported: r3(moved)});
    check('after a teleport the stride starts afresh at the destination', onSteps.length >= 2 && sameTicks(onSteps, onDue),
      {steps: onSteps, due: onDue.due, path: r3(onDue.path), firstEarly: onSteps.length > 0 && onSteps[0] < onDue.due[0]});
    var wrong = colours.filter(function (c) { return !c.biome || c.rgb !== BIOME_DUST[c.biome]; });
    check('Endless step dust takes the biome of the chunk it is laid on', colours.length >= 4 && !wrong.length,
      {puffs: colours.length, wrong: wrong.slice(0, 4), biomes: colours.map(function (c) { return c.biome; }).filter(function (b, i, a) { return a.indexOf(b) === i; })});
  });

  // ── G5: NPC dust follows real NPC motion on the NPC's stratum ─────────────
  // The two-layer cave under every cell (floor 0, ceiling 4 H, cap 5 H); the
  // first-person camera on the cap at (20, 240) looking east. npcMoveToward
  // walks each body 100 u east at 60 u/s: enemies on the cap (normal, wolf,
  // tank), a garrison ally on the cap, a normal enemy in the cave below; a
  // stunned, a dormant and a dead enemy slide 100 u (knockback,
  // moveSpatialActor); an enemy 280 u from the camera walks away. Rows are
  // 40 u apart; each step is within 3 u of its body's row, alternately
  // either side of it. Around every observer tick each body's own fields are
  // compared: the observers write nothing to them.
  function snap(b) {
    var out = {};
    Object.keys(b).forEach(function (k) {
      var v = b[k];
      out[k] = v && typeof v === 'object' ? Object.keys(v).map(function (q) { var w = v[q]; return q + ':' + (w && typeof w === 'object' ? '[o]' : String(w)); }).join(',') : String(v);
    });
    return out;
  }
  function changedKeys(a, b) {
    return Object.keys(a).concat(Object.keys(b)).filter(function (k, i, all) { return all.indexOf(k) === i && a[k] !== b[k]; });
  }
  if (needed('G5', ['--npc-surface-z', '--npc-steps-every-tick', '--npc-ignores-stun', '--dust-ignores-under', '--dust-fixed-colour', '--no-dormant',
      '--no-dead', '--npc-no-alternate', '--writes-body']))
    run('G5 NPC dust', function () {
      var S = authored({kind: 'cave', mode: 'fp', x: 20, y: 240, feetH: 5});
      var bodies = [
        {name: 'dormant', b: enemyAt('normal', 60, 80, 125), stride: 24, none: true, slide: true},
        {name: 'ally', b: allyAt(60, 120, 125), stride: 24}, {name: 'wolf', b: enemyAt('wolf', 60, 160, 125), stride: strideOf('wolf')},
        {name: 'normal', b: enemyAt('normal', 60, 200, 125), stride: strideOf('normal')},
        {name: 'cave', b: enemyAt('normal', 60, 280, 0), stride: strideOf('normal'), cave: true},
        {name: 'tank', b: enemyAt('tank', 60, 320, 125), stride: strideOf('tank')},
        {name: 'stunned', b: enemyAt('normal', 60, 360, 125), stride: 24, none: true, slide: true},
        {name: 'dead', b: enemyAt('normal', 60, 400, 125), stride: 24, none: true, slide: true},
        {name: 'far', b: enemyAt('normal', 300, 240, 125), stride: 24, none: true}];
      bodies[6].b.stunUntil = G.gameTimeNow() + 1e7;
      bodies[0].b.npc.state = 'dormant'; bodies[7].b.health = 0;
      if (!bodies[4].b.underground || bodies[3].b.underground) throw Error('SETUP strata ' + [bodies[4].b.underground, bodies[3].b.underground]);
      bodies.forEach(function (q) { q.x0 = q.b.x; q.y0 = q.b.y; q.path = 0; q.steps = []; });
      observe();                                                      // the observers see every body once
      var spawns = [], wrote = [];
      for (var k = 0; k < 110; k++) {
        var n0 = events.length;
        bodies.forEach(function (q) {
          var px = q.b.x, py = q.b.y;
          if (q.slide) G.moveSpatialActor(q.b, Math.min(1, q.x0 + 100 - q.b.x), 0, 6);
          else G.npcMoveToward(q.b, q.x0 + 100, q.y0, 60, DT, 6, 0);
          q.path += Math.hypot(q.b.x - px, q.b.y - py);
        });
        var before = bodies.map(function (q) { return snap(q.b); });
        observe();
        bodies.forEach(function (q, i) { var diff = changedKeys(before[i], snap(q.b)); if (diff.length && wrote.length < 4) wrote.push({name: q.name, tick: tick, changed: diff}); });
        events.slice(n0).forEach(function (e) {
          var q = bodies.filter(function (b) { return Math.abs(e.y - b.y0) <= 3 + 1e-6; })[0];
          if (q) q.steps.push(e); else spawns.push({stray: [r3(e.x), r3(e.y)]});
        });
        newOf(G.fxState, 'step.dust').forEach(function (i) { spawns.push({z: S.z[i], rgb: rgbHex(palRGB(S, S.pal[i]))}); });
      }
      var counts = bodies.map(function (q) {
        var want = q.none ? 0 : Math.floor(q.path / q.stride + 1e-9);
        return {name: q.name, path: r3(q.path), stride: r3(q.stride), want: want, got: q.steps.length,
          z: q.steps.map(function (e) { return r3(e.z); }).filter(function (z, i, a) { return a.indexOf(z) === i; }),
          under: q.steps.map(function (e) { return e.under; }).filter(function (u, i, a) { return a.indexOf(u) === i; }),
          sides: q.steps.map(function (e) { return e.y > q.y0 ? 1 : -1; })};
      });
      var moved = bodies.every(function (q) { return q.path > 99.9 && q.path < 100.1; });
      if (!moved) throw Error('SETUP bodies did not move 100 u: ' + JSON.stringify(counts));
      var strata = counts.every(function (c) {
        if (!c.got) return true;
        return c.name === 'cave' ? c.z.length === 1 && Math.abs(c.z[0]) < 1e-6 && c.under.join() === 'true' :
          c.z.length === 1 && Math.abs(c.z[0] - 125) < 1e-6 && c.under.join() === 'false';
      });
      check('NPC dust follows real NPC motion on the NPC\'s stratum', counts.every(function (c) { return c.got === c.want; }) && strata &&
        counts[4].got >= 4 && !spawns.some(function (s) { return s.stray; }),
        {counts: counts.map(function (c) { return {name: c.name, path: c.path, stride: c.stride, want: c.want, got: c.got, z: c.z, under: c.under}; }),
          stray: spawns.filter(function (s) { return s.stray; }).slice(0, 3)});
      var walkers = counts.filter(function (c) { return c.got >= 2; }), oneSided = walkers.filter(function (c) { return !c.sides.every(function (v, i) { return !i || v === -c.sides[i - 1]; }); });
      check('NPC steps alternate sides of the body\'s path', walkers.length >= 4 && !oneSided.length,
        {walkers: walkers.length, oneSided: oneSided.map(function (c) { return {name: c.name, sides: c.sides}; })});
      check('the observers write nothing to NPC records', !wrote.length, {wrote: wrote});
      // The spawned puffs: cave dust on the cave floor in the cave stone's
      // damp role; cap dust on the cap in the plains floor band 5.
      var caveP = spawns.filter(function (s) { return s.z < 50; }), capP = spawns.filter(function (s) { return s.z >= 100; });
      check('NPC dust takes its stepped surface\'s colour and stays on its floor', caveP.length >= 2 && capP.length >= 4 &&
        caveP.every(function (s) { return s.rgb === CAVE_DAMP && s.z >= 0.5 - 1e-6 && s.z < 12; }) &&
        capP.every(function (s) { return s.rgb === BIOME_DUST.plains && s.z >= 125.5 - 1e-6 && s.z < 137; }) &&
        spawns.length === caveP.length + capP.length,
        {cave: caveP.slice(0, 3).map(function (s) { return [r3(s.z), s.rgb]; }), cap: capP.slice(0, 3).map(function (s) { return [r3(s.z), s.rgb]; }),
          between: spawns.length - caveP.length - capP.length});
    });
  // A stunned body is not observed; when it is released it starts afresh
  // from where it stands: an enemy walks 10 u (under a stride), is stunned
  // and knocked back 30 u, released, stands 30 ticks and walks 30 u. No
  // step until the walk after its release, then floor(30 / 24) = 1.
  if (needed('G5', ['--no-fresh'])) run('G5 stun release', function () {
    authored({mode: 'fp', x: 20, y: 240});
    var e = enemyAt('normal', 60, 240, 0), log = {};
    observe();
    function phase(name, n, move) {
      var n0 = events.length, path = 0;
      for (var k = 0; k < n; k++) { var px = e.x, py = e.y; move(); path += Math.hypot(e.x - px, e.y - py); observe(); }
      log[name] = {path: r3(path), steps: events.slice(n0).filter(function (q) { return !q.self; }).length};
    }
    phase('walk', 10, function () { G.npcMoveToward(e, 200, 240, 60, DT, 6, 0); });
    e.stunUntil = G.gameTimeNow() + 1e7;
    phase('knockedBack', 30, function () { G.moveSpatialActor(e, -1, 0, 6); });
    e.stunUntil = 0;
    phase('released', 30, function () {});
    phase('walkAgain', 30, function () { G.npcMoveToward(e, 200, 240, 60, DT, 6, 0); });
    if (log.walk.path < 9.9 || log.knockedBack.path < 29.9 || log.walkAgain.path < 29.9) throw Error('SETUP stun release ' + JSON.stringify(log));
    check('a stunned body starts afresh where it is released', log.walk.steps === 0 && log.knockedBack.steps === 0 && log.released.steps === 0 &&
      log.walkAgain.steps === Math.floor(log.walkAgain.path / strideOf('normal')), log);
  });
  // An NPC teleport (over 64 u between observed ticks: a respawn or an
  // unstick push) is no stride, and the stride restarts where the body
  // lands, as the player's does (G4): an enemy walks 20 u (under its 24 u
  // stride), is moved 100 u east, walks 20 u (no step: the 20 u before the
  // jump are forgotten), then 10 u more (one step, at 24 u from the landing).
  if (needed('G5', ['--npc-tp-keep-acc'])) run('G5 NPC teleport', function () {
    authored({mode: 'fp', x: 20, y: 240});
    var e = enemyAt('normal', 40, 240, 0), log = {};
    observe();
    function phase(name, n, move) {
      var n0 = events.length, path = 0;
      for (var k = 0; k < n; k++) { var px = e.x, py = e.y; move(); path += Math.hypot(e.x - px, e.y - py); observe(); }
      log[name] = {path: r3(path), steps: events.slice(n0).filter(function (q) { return !q.self; }).length};
    }
    function walk() { G.npcMoveToward(e, 400, 240, 60, DT, 6, 0); }
    phase('walk', 20, walk);
    phase('teleport', 1, function () { e.x += 100; });
    phase('walkOn', 20, walk);
    phase('walkMore', 10, walk);
    var stride = strideOf('normal');
    if (Math.abs(log.walk.path - 20) > 0.1 || Math.abs(log.teleport.path - 100) > 1e-6 || Math.abs(log.walkOn.path - 20) > 0.1 ||
        Math.abs(log.walkMore.path - 10) > 0.1 || stride !== 24) throw Error('SETUP NPC teleport ' + JSON.stringify({log: log, stride: stride}));
    check('an NPC teleport is no stride and its stride restarts where it lands', log.walk.steps === 0 && log.teleport.steps === 0 &&
      log.walkOn.steps === 0 && log.walkMore.steps === 1, {stride: stride, log: log});
  });
  // The 240 u radius: two enemies walk 50 u tangentially round the camera
  // (first person at (240, 240)), one 235-236.3 u from it (two strides), one
  // 245-246.3 u (none).
  if (needed('G5', ['--npc-radius-250', '--npc-radius-230'])) run('G5 radius', function () {
    authored({mode: 'fp', x: 240, y: 240});
    var c = Math.SQRT1_2, list = [{name: 'inside', r: 235, a: -Math.PI / 4}, {name: 'outside', r: 245, a: Math.PI / 4}];
    list.forEach(function (q) {
      var px = 240 + q.r * Math.cos(q.a), py = 240 + q.r * Math.sin(q.a), tx = -Math.sin(q.a), ty = Math.cos(q.a);
      q.to = [px + 25 * tx, py + 25 * ty]; q.e = enemyAt('normal', px - 25 * tx, py - 25 * ty, 0); q.dmin = Infinity; q.dmax = 0; q.n0 = events.length;
    });
    var n0 = events.length;
    observe();
    for (var k = 0; k < 60; k++) {
      list.forEach(function (q) { G.npcMoveToward(q.e, q.to[0], q.to[1], 60, DT, 6, 0); var d = Math.hypot(q.e.x - 240, q.e.y - 240); q.dmin = Math.min(q.dmin, d); q.dmax = Math.max(q.dmax, d); });
      observe();
    }
    var got = list.map(function (q) {
      return {name: q.name, dmin: r3(q.dmin), dmax: r3(q.dmax), steps: events.slice(n0).filter(function (e) { return !e.self && Math.hypot(e.x - q.to[0], e.y - q.to[1]) < 60; }).length};
    });
    if (!(got[0].dmax < 237 && got[1].dmin > 244) || Math.hypot(list[0].e.x - list[0].to[0], list[0].e.y - list[0].to[1]) > 0.01) throw Error('SETUP radius walkers ' + JSON.stringify(got));
    check('NPC dust is observed within 240 u of the camera and not beyond', got[0].steps === 2 && got[1].steps === 0, got);
  });
  // The per-tick limits: 30 enemies 30-204 u from the camera, listed
  // farthest first, and a slime companion 141 u from it (between the 15th
  // and 16th nearest once they have moved), all moved in one tick: each enemy 24.5 u straight
  // away from the camera (one stride each, the order by distance kept), the
  // slime through a hop landing (its phase over pi). The 24 nearest bodies
  // (23 enemies and the slime) are observed, the 12 nearest puff and the
  // other 12 (the slime among them) are counted, the 7 farthest are not
  // seen. In a second tick only the slime lands again: under the cap now,
  // it puffs.
  if (needed('G5', ['--npc-no-cap', '--npc-list-order', '--slime-uncapped'])) run('G5 NPC cap', function () {
    var S = authored({mode: 'fp', x: 240, y: 240});
    var list = [];
    for (var i = 0; i < 30; i++) {
      var a = i * 2 * Math.PI / 30, d = 30 + 6 * i;
      list.push({a: a, d: d, x: 240 + Math.cos(a) * d, y: 240 + Math.sin(a) * d});
    }
    for (var j = 29; j >= 0; j--) list[j].e = enemyAt('normal', list[j].x, list[j].y, 0);   // the game's list: farthest first
    if (G.enemies[0] !== list[29].e || G.enemies[29] !== list[0].e) throw Error('SETUP enemy list order');
    var sa = 186 * Math.PI / 180, slime = {type: 'slime', x: 240 + Math.cos(sa) * 141, y: 240 + Math.sin(sa) * 141, z: 0, phase: Math.PI - 0.05,
      squash: 1.0, lastAttackMs: 0, wanderAng: 0};
    G.companions.push(slime); G.npcEnsure(slime, 'slime');
    observe();
    // Each observer event of a tick: the index of the nearest enemy, or 's' when it lies at the slime.
    function emitted(n0) {
      return events.slice(n0).filter(function (e) { return !e.self; }).map(function (e) {
        if (Math.hypot(slime.x - e.x, slime.y - e.y) < 1e-6) return 's';
        var best = 0;
        list.forEach(function (q, k) { if (Math.hypot(q.e.x - e.x, q.e.y - e.y) < Math.hypot(list[best].e.x - e.x, list[best].e.y - e.y)) best = k; });
        return best;
      }).sort(function (a, b) { return a === 's' ? 1 : b === 's' ? -1 : a - b; });
    }
    var n0 = events.length, c0 = S.stats.obsNpcCapped;
    list.forEach(function (q) { q.e.x += Math.cos(q.a) * 24.5; q.e.y += Math.sin(q.a) * 24.5; });
    slime.phase = Math.PI + 0.05;
    observe();
    var got = emitted(n0), capped = S.stats.obsNpcCapped - c0, n1 = events.length, c1 = S.stats.obsNpcCapped;
    slime.phase = 2 * Math.PI + 0.05;
    observe();
    var again = emitted(n1);
    check('NPC dust is capped at 12 bursts from the 24 nearest bodies a tick', got.join() === '0,1,2,3,4,5,6,7,8,9,10,11' && capped === 12 &&
      again.join() === 's' && S.stats.obsNpcCapped === c1, {emitted: got, capped: capped, next: {emitted: again, capped: S.stats.obsNpcCapped - c1}});
  });
  // A slime companion hops in updateCompanions (19-companions-loot.js): its
  // bounce is |sin(phase)| x its height, so a hop lands whenever
  // floor(phase / pi) rises (recorded here after every tick). One puff per
  // landing, in that tick, at the slime's own position on the floor; with
  // the player standing (the slime idles) and walking back and forth (the
  // slime follows, and its phase steps over the gameplay squash window, z
  // from above 0.5 to 0.5 or less, on some hops: asserted).
  if (needed('G5', ['--hop-z-test', '--slime-at-player'])) run('G5 slime hops', function () {
    var out = [['idle', 300, null], ['follow', 600, function (k) { G.kbState.right = Math.floor(k / 120) % 2 === 0; G.kbState.left = !G.kbState.right; }]].map(function (sc) {
      authored({mode: 'fp'});
      var c = {type: 'slime', x: G.pos.x + 45, y: G.pos.y, z: 0, phase: 0, squash: 1.0, lastAttackMs: 0, wanderAng: 0};
      G.companions.push(c); G.npcEnsure(c, 'slime');
      var n0 = events.length, lands = [], zLands = 0, prevPhase = c.phase, prevZ = c.z, at = {};
      for (var k = 0; k < sc[1]; k++) {
        ticks(1, sc[2] && function () { sc[2](k); });
        if (Math.floor(c.phase / Math.PI) > Math.floor(prevPhase / Math.PI)) lands.push(tick);
        if (prevZ > 0.5 && c.z <= 0.5) zLands++;
        at[tick] = [c.x, c.y]; prevPhase = c.phase; prevZ = c.z;
      }
      var mine = events.slice(n0).filter(function (e) { return !e.self; });
      var far = mine.filter(function (e) { var p = at[e.tick]; return !(p && Math.abs(e.x - p[0]) < 1e-9 && Math.abs(e.y - p[1]) < 1e-9 && Math.abs(e.z) < 1e-9); });
      return {scene: sc[0], lands: lands.length, zLands: zLands, events: mine.length, missed: lands.filter(function (t) { return !mine.some(function (e) { return e.tick === t; }); }).length,
        same: mine.map(function (e) { return e.tick; }).join() === lands.join(),
        far: far.slice(0, 3).map(function (e) { var p = at[e.tick] || [NaN, NaN]; return {tick: e.tick, off: r3(Math.hypot(e.x - p[0], e.y - p[1])), z: r3(e.z)}; })};
    });
    if (out[0].lands < 3 || out[1].lands < 10 || !(out[1].zLands < out[1].lands)) throw Error('SETUP slime hops ' + JSON.stringify(out));
    check('a companion slime puffs where each hop lands', out.every(function (o) { return o.same && !o.far.length; }), out);
  });
  // The NPC step's roof test (fxUnderAt) against the game's getCaveSpaceAt
  // over the cave, an overhang (a cap 5 H up with no ceiling) and the flat
  // floor, at feet heights around every layer; and a cave enemy's walk runs
  // it without calling the allocating getCaveSpaceAt from the observer.
  if (needed('G5', ['--under-allocates', '--roof-ignores-caps'])) run('G5 roof test', function () {
    var n = 0, wrong = [];
    ['cave', 'overhang', 'flat'].forEach(function (kind) {
      authored({kind: kind, mode: '2d'});
      [0, 20, 24.9, 25.1, 99, 100, 101, 124.9, 125, 125.1, 150, 300].forEach(function (z) {
        [[30, 30], [200, 120], [500, 20], [-5, 40]].forEach(function (p) {
          var want = G.getCaveSpaceAt(p[0], p[1], z / 25).underground, got = G.fxUnderAt(p[0], p[1], z);
          n++; if (want !== got && wrong.length < 4) wrong.push({kind: kind, x: p[0], y: p[1], z: z, want: want, got: got});
        });
      });
    });
    authored({kind: 'cave', mode: 'fp', x: 20, y: 240, feetH: 5});
    var e = enemyAt('normal', 60, 280, 0), inside = false, calls = 0, realStep = G.fxObsBodyStep, realCave = G.getCaveSpaceAt;
    G.fxObsBodyStep = function () { inside = true; try { return realStep.apply(G, arguments); } finally { inside = false; } };
    G.getCaveSpaceAt = function () { if (inside) calls++; return realCave.apply(G, arguments); };
    var n0 = events.length;
    try {
      observe();
      for (var k = 0; k < 110; k++) { G.npcMoveToward(e, 160, 280, 60, DT, 6, 0); observe(); }
    } finally { G.fxObsBodyStep = realStep; G.getCaveSpaceAt = realCave; }
    var steps = events.slice(n0).filter(function (q) { return !q.self; });
    if (steps.length < 3 || !steps.every(function (q) { return q.under; })) throw Error('SETUP cave walker ' + JSON.stringify(steps.slice(0, 2)));
    check('the NPC step\'s roof test agrees with getCaveSpaceAt and never calls it', n >= 100 && !wrong.length && calls === 0,
      {compared: n, wrong: wrong, getCaveSpaceAtCalls: calls, steps: steps.length});
  });

  // ── Surface colours (spec 9.3) in the authored scenes ─────────────────────
  // plains: floor band 5; ice: snow; expanse: sand (the dust overrides).
  if (needed('colours', ['--dust-fixed-colour'])) run('colours', function () {
    var got = {};
    ['plains', 'ice', 'expanse'].forEach(function (terrainName) {
      var S = authored({mode: '2d', terrain: terrainName}), seen = [];
      ticks(20);
      for (var k = 0; k < 90; k++) tickSpawns(S, function () { G.kbState.right = true; }, ['step.dust']).fresh['step.dust'].forEach(function (q) { seen.push(rgbHex(q.rgb)); });
      got[terrainName] = seen.filter(function (v, i, a) { return a.indexOf(v) === i; });
    });
    check('step dust takes the stepped surface\'s colour', got.plains.join() === BIOME_DUST.plains && got.ice.join() === BIOME_DUST.ice &&
      got.expanse.join() === BIOME_DUST.expanse, got);
  });
  // The player on the cave floor (2D, the ceiling 4 H up): the steps and a
  // dash lie on the floor (z 0), flagged underground, in the cave stone's
  // damp role, not the plains surface above.
  if (needed('colours', ['--player-not-under'])) run('player cave', function () {
    var S = authored({kind: 'cave', mode: '2d', x: 60, y: 240, feetH: 0}), seen = [], n0;
    if (!G.playerUnderground) throw Error('SETUP the player is not underground on the cave floor');
    ticks(20);
    n0 = events.length;
    for (var k = 0; k < 90; k++) {
      var t = tickSpawns(S, function () { G.kbState.right = true; G.dashPressed = k === 40; }, ['step.dust', 'step.dash']);
      t.fresh['step.dust'].concat(t.fresh['step.dash']).forEach(function (q) { seen.push(rgbHex(q.rgb)); });
    }
    var mine = events.slice(n0).filter(function (e) { return e.self; }), off = mine.filter(function (e) { return !(Math.abs(e.z) < 1e-6 && e.under); });
    var colours = seen.filter(function (v, i, a) { return a.indexOf(v) === i; });
    check('the player\'s dust in a cave lies on the cave floor in cave stone', mine.filter(function (e) { return e.type === 'footstep'; }).length >= 3 &&
      mine.filter(function (e) { return e.type === 'dashStart'; }).length === 1 && !off.length && seen.length >= 10 && colours.join() === CAVE_DAMP,
      {events: mine.length, off: off.slice(0, 3).map(function (e) { return {type: e.type, z: r3(e.z), under: e.under}; }), colours: colours, want: CAVE_DAMP});
  });

  // ── The preset switch and the Unified switch ──────────────────────────────
  // A 2D walk and a walking enemy: with Footstep dust off, and with Unified
  // effects off, no dust spawns and the observers emit nothing (the calls are
  // gated and counted); switched back on, both spawn. Live dust fades when
  // the switch goes off. With the preset off no NPC body is scanned at all
  // (S9: the observer's scan is skipped, not only its events).
  if (needed('toggles', ['--dust-ignores-toggle', '--npc-scan-when-off'])) run('toggles', function () {
    var realScan = G.fxObserveNpcs, scans = 0;
    function walk(toggles) {
      Object.keys(toggles).forEach(function (k) { G.setEffectToggle(k, toggles[k]); });
      var S = authored({mode: '2d'}), e = enemyAt('normal', 60, 200, 0), spawned = 0;
      ticks(20);
      scans = 0;
      for (var k = 0; k < 90; k++) {
        G.npcMoveToward(e, 60 + 200, 200, 60, DT, 6, 0);
        var t = tickSpawns(S, function () { G.kbState.right = true; G.dashPressed = k === 30; });
        spawned += STEP.reduce(function (n, id) { return n + t.fresh[id].length; }, 0);
      }
      return {toggles: toggles, spawned: spawned, steps: S.stats.obsSteps, npcSteps: S.stats.obsNpcSteps, dashes: S.stats.obsDashes, gated: S.stats.eventsGated,
        scans: scans, S: S};
    }
    G.fxObserveNpcs = function () { scans++; return realScan.apply(G, arguments); };
    try {
      var off = walk({fxFootDust: false, fxUnified: true}), unified = walk({fxFootDust: true, fxUnified: false}), on = walk({fxFootDust: true, fxUnified: true});
      // Live dust fades within the cull fade after the switch goes off.
      var S = on.S, live = STEP.reduce(function (n, id) { return n + byRecipe(S, id).length; }, 0);
      G.setEffectToggle('fxFootDust', false);
      ticks(1);
      var dying = STEP.reduce(function (n, id) { return n + byRecipe(S, id).filter(function (i) { return S.flags[i] & 16; }).length; }, 0);
      ticks(Math.ceil(G.EFFECT_CONFIG.cullFadeSeconds / DT) + 1);
      var left = STEP.reduce(function (n, id) { return n + byRecipe(S, id).length; }, 0);
      [off, unified, on].forEach(function (r) { delete r.S; });
      check('footstep dust follows its switch and the Unified effects switch', off.spawned === 0 && off.steps + off.npcSteps + off.dashes === 0 &&
        off.gated > 0 && unified.spawned === 0 && unified.steps + unified.npcSteps === 0 && on.spawned > 10 && on.steps >= 4 && on.npcSteps >= 3 &&
        on.dashes === 1 && live > 0 && dying === live && left === 0, {off: off, unified: unified, on: on, live: live, dying: dying, left: left});
      check('with footstep dust switched off no NPC body is scanned', off.scans === 0 && unified.scans === 0 && on.scans === 90,
        {off: off.scans, unified: unified.scans, on: on.scans});
    } finally { G.fxObserveNpcs = realScan; G.EFFECT_TOGGLE_DEFS.forEach(function (d) { G.setEffectToggle(d.key, d.default); }); }
  });

  // ── Randomness: the observers, their dust and its drawing never draw from
  // Math.random or presentationRandom (recording throwers; updateEffects
  // catches a throw, so the count is the verdict). The scene must spawn at
  // least 20 puffs (steps, an NPC, a slime, a dash, a landing) when nothing
  // throws, or it proves nothing.
  if (needed('random', ['--dust-math-random'])) run('random', function () {
    var S = authored({mode: '2d'}), calls = 0, savedPR = G.presentationRandom, realUpdate = G.updateEffects;
    var e = enemyAt('normal', 60, 200, 0), c = {type: 'slime', x: G.pos.x + 45, y: G.pos.y, z: 0, phase: 0, squash: 1.0, lastAttackMs: 0, wanderAng: 0};
    G.companions.push(c); G.npcEnsure(c, 'slime');
    function counting() { calls++; throw Error('a cosmetic path drew a random number'); }
    G.updateEffects = function (dt) {
      var saved = Math.random;
      Math.random = counting; G.presentationRandom = counting;
      try { return realUpdate(dt); } finally { Math.random = saved; G.presentationRandom = savedPR; }
    };
    var f0 = failures(), drawn = 0;
    try {
      ticks(10);
      for (var k = 0; k < 120; k++) {
        G.npcMoveToward(e, 60 + 200, 200, 60, DT, 6, 0);
        ticks(1, function () { G.kbState.right = true; G.dashPressed = k === 20; G.jumpPressed = k === 60; });
        if (k % 20 === 19) {
          var saved = Math.random;
          Math.random = counting; G.presentationRandom = counting;
          try { drawn += images(frame(/^fx2D$/), 'fx2D').length; } finally { Math.random = saved; G.presentationRandom = savedPR; }
        }
      }
    } finally { G.updateEffects = realUpdate; }
    var st = S.stats;
    if (!calls && st.spawned < 20) throw Error('SETUP the random scene spawned ' + st.spawned + ' puffs');
    check('locomotion dust never reads Math.random or presentationRandom', calls === 0 && failures() === f0 && st.obsSteps >= 4 &&
      st.obsNpcSteps >= 2 && st.obsDashes === 1 && st.obsLands === 1 && drawn > 0,
      {calls: calls, failures: failures() - f0, spawned: st.spawned, steps: st.obsSteps, npcSteps: st.obsNpcSteps, dashes: st.obsDashes, lands: st.obsLands, drawn: drawn});
  });

  // ── S9: the S6 verifier's surviving hand mutants and the gridCave step
  // fixture. These run last, so the scenes above keep the tick history
  // (and the time of day) they were written against.
  // A cave under the surface (S9): the cave floor at 0 and its ceiling 1 H
  // under a walkable cap (the Endless minimum cover), the cap stepping up
  // 0.9 H over x 180-192 (5 H to 5.9 H, the mesh's slope between the cell
  // corners), and the cave's boundary walls (gridCave) under the path, with
  // the game's roof-bound tops (getCaveWallRoofLimit: at most the highest
  // ceiling around the cell and 0.25 H under the lowest cover; the surface
  // walks over them, 09-physics.js). The player walks east up the slope from
  // 13 start points (x 150-174): its grounded feet lag the rising cap, so
  // on the slope a wall top buried under the grass (118.75 u) is nearer
  // them than the surface at the step's point. Every step lies on the cap
  // at its point (the authored plane), a surface step, never on the wall
  // top under it nor at the lagging feet.
  function caveWalls(grid, wh) {
    G.gridCave = new Uint8Array(GW * GW); G.wallMaxTopZ = new Float32Array(GW * GW).fill(Infinity);
    for (var gx = 0; gx < GW; gx++) for (var gy = 14; gy <= 18; gy++) {
      var wi = gy * GW + gx;
      grid[wi] = 1; wh[wi] = 1; G.gridCave[wi] = 1; G.wallMaxTopZ[wi] = G.getCaveWallRoofLimit(G.floorMesh, gx, gy, CELL);
    }
  }
  if (needed('G1', ['--step-cave-wall', '--step-no-cap'])) run('G1 cave walls', function () {
    function cap(x) { return x <= 180 ? 125 : x >= 192 ? 147.5 : 125 + 22.5 * (x - 180) / 12; }
    var wrong = [], steps = 0, nearer = [], slope = 0;
    for (var x0 = 150; x0 < 176; x0 += 2) {
      authored({kind: 'caveLedge', mode: '2d', x: x0, y: 247.5, feetH: 5, walls: caveWalls, ang: -Math.PI / 2});
      if (G.playerUnderground) throw Error('SETUP the player on the cap is underground');
      ticks(5);
      var n0 = events.length, feetAt = {};
      for (var k = 0; k < 50; k++) { ticks(1, function () { G.kbState.right = true; }); feetAt[tick] = G.playerFeetSpatialZ(); }
      events.slice(n0).filter(function (e) { return e.self && e.type === 'footstep'; }).forEach(function (e) {
        var wx = Math.floor(e.x / CELL), wy = Math.floor(e.y / CELL), span = G.grid[wy * GW + wx] ? G.spatialWallSpan(wx, wy) : null, feet = feetAt[e.tick];
        steps++;
        if (e.x > 180 && e.x < 192) slope++;
        if (span && Math.abs(span.topZ - feet) < Math.abs(cap(e.x) - feet)) nearer.push({x: r3(e.x), feet: r3(feet), cap: r3(cap(e.x)), wallTop: r3(span.topZ)});
        if (!(Math.abs(e.z - cap(e.x)) < 1e-6) || e.under) wrong.push({start: x0, x: r3(e.x), z: r3(e.z), want: r3(cap(e.x)), feet: r3(feet), under: e.under});
      });
    }
    if (steps < 20 || slope < 5 || nearer.length < 3) throw Error('SETUP cave walls ' + JSON.stringify({steps: steps, slope: slope, nearer: nearer.slice(0, 3)}));
    check('steps over a cave\'s walls lie on the surface, not on a wall top buried under it', !wrong.length,
      {steps: steps, slope: slope, nearer: nearer.length, wrong: wrong.slice(0, 4)});
  });
  // Particles 0 and back (S9): at 0 the observers idle and the player's
  // observer forgets its position; back above 0 it restarts. 2D: the player
  // walks east at Particles 25 and dashes, then 25 ticks at 0 (about 35 u,
  // under the 64 u teleport rule), then 25 again. After the return the steps
  // fall on the stride measured from the first tick back (the distance
  // walked at 0 is not dumped as steps at once), and the dash that ended
  // before lays no second burst. A jump taken at 0: with Particles back for
  // the last 6 of its airborne ticks (the first of them seen airborne) the
  // landing puffs; with the last 5, it does not (the 6-tick rule, G3).
  if (needed('resume', ['--p0-keeps-position', '--resume-dash-zero', '--resume-air-zero'])) run('resume', function () {
    function walk() { G.kbState.right = true; }
    authored({mode: '2d'});
    var n0 = events.length, back, after, predicted, dashes;
    try {
      ticks(60, function (k) { G.kbState.right = true; G.dashPressed = k === 10; });
      dashes = of('dashStart', true).length;
      G.settings.particles = 0;
      var zeroStart = worldXY(), zero = ticks(25, walk);
      G.settings.particles = 25;
      back = ticks(1, walk)[0];
      after = ticks(60, walk);
    } finally { G.settings.particles = 25; }
    predicted = strideTicks([back.x, back.y], after, 22);
    var zeroPath = Math.hypot(zero[zero.length - 1].x - zeroStart[0], zero[zero.length - 1].y - zeroStart[1]);
    var stepsBack = events.slice(n0).filter(function (e) { return e.type === 'footstep' && e.self && e.tick >= back.tick; }).map(function (e) { return e.tick; });
    var dashesBack = events.slice(n0).filter(function (e) { return e.type === 'dashStart' && e.tick >= back.tick; }).length;
    if (dashes !== 1 || !(zeroPath > 22 && zeroPath < 64) || predicted.due.length < 3) throw Error('SETUP resume walk ' + JSON.stringify({dashes: dashes, zeroPath: zeroPath, due: predicted.due}));
    check('back from Particles 0 the player\'s stride restarts where the observer resumes', sameTicks(stepsBack, predicted),
      {back: back.tick, steps: stepsBack, due: predicted.due, zeroPath: r3(zeroPath)});
    check('back from Particles 0 an earlier dash lays no second burst', dashesBack === 0, {dashesBack: dashesBack, before: dashes});
    // The jump: its landing tick found first (the same deterministic scene).
    function jump(resumeBefore) {
      authored({mode: '2d'});
      ticks(5);
      G.settings.particles = 0;
      var rows = [], landTick = -1, n1 = events.length;
      try {
        for (var k = 0; k < 80 && landTick < 0; k++) {
          if (resumeBefore && rows.length && rows.length === resumeBefore.at) G.settings.particles = 25;
          var r = ticks(1, function () { G.jumpPressed = k === 0; })[0];
          rows.push(r);
          if (k > 0 && !r.air && rows[k - 1].air) landTick = r.tick;
        }
        ticks(3);
      } finally { G.settings.particles = 25; }
      var airborne = rows.filter(function (r) { return r.air; }).length;
      return {rows: rows, airborne: airborne, landIndex: rows.map(function (r) { return r.tick; }).indexOf(landTick),
        lands: events.slice(n1).filter(function (e) { return e.type === 'land'; }).length};
    }
    var probe = jump(null);
    if (probe.airborne < 20 || probe.landIndex < 0 || probe.lands !== 0) throw Error('SETUP resume jump ' + JSON.stringify({airborne: probe.airborne, land: probe.landIndex, lands: probe.lands}));
    var six = jump({at: probe.landIndex - 6}), five = jump({at: probe.landIndex - 5});
    check('a jump the observer resumes on lands after 6 observed airborne ticks and not after 5', six.landIndex === probe.landIndex && five.landIndex === probe.landIndex &&
      six.lands === 1 && five.lands === 0, {landIndex: probe.landIndex, airborne: probe.airborne, six: six.lands, five: five.lands});
  });
  // Another body's dash (S9): a producer may pass any body to dashStart
  // (the reader takes one; a future NPC dash). In first person an enemy 60 u
  // ahead dashes: its world burst spawns at the enemy (within the 4 u disc
  // and a tick of drift of where it dashed; the distance keep thins it), and
  // no screen puff spawns (those are the view of the player's own dash only).
  if (needed('G2', ['--screen-dash-any-body'])) run('G2 NPC dash', function () {
    var S = authored({mode: 'fp'}), e = enemyAt('normal', G.pos.x + 60, G.pos.y, 0);
    ticks(5);
    e.vx = 90; e.vy = 0;
    var b0 = bursts.length, ex = e.x, ey = e.y;
    G.fxEvent('dashStart', e);
    ticks(1);
    var burst = burstsOf(b0, 'step.dash'), screen = burstsOf(b0, 'screen.dashDust');
    var atBody = (burst[0] && burst[0].parts || []).filter(function (q) { return Math.hypot(q.x - ex, q.y - ey) <= 5.5; }).length;
    check('another body\'s dash throws world dust at it and no first-person screen puffs', burst.length === 1 && burst[0].spawned >= 4 &&
      atBody === burst[0].spawned && !burst[0].self && sum(screen, 'spawned') === 0 && byRecipe(S, 'screen.dashDust').length === 0,
      {burst: burst.map(function (b) { return {spawned: b.spawned, self: b.self}; }), atBody: atBody, screen: sum(screen, 'spawned')});
  });
  // The frontSides wedge (S9): its puffs alternate left and right of the
  // view's centre line (pitch 0, flat floor); looking fully down (pitch
  // +1.4) its ground distance shrinks with the pitch as sourceOrFront's
  // does, so most of the burst still draws on the canvas (at the pitch-0
  // distances, 96-160 u, all of it lies above the top edge); facing a band
  // of hut-ruin walls 90-165 u ahead, every puff over a wall cell is laid on
  // the wall's top (the surface over it; its point as spawned, logged by the
  // burst spy), never on the ground inside the wall.
  if (needed('G2', ['--wedge-ignores-pitch', '--wedge-one-side', '--wedge-ignores-walls'])) run('G2 frontSides sides, pitch and walls', function () {
    function wedge(o) {
      var S = authored(o);
      ticks(20);
      var b0 = bursts.length, t = tickSpawns(S, function () { G.kbState.up = true; G.dashPressed = true; }, ['step.dash']), puffs = t.fresh['step.dash'];
      var c = Math.cos(G.cam.ang), s = Math.sin(G.cam.ang), laid = burstsOf(b0, 'step.dash');
      return {puffs: puffs, laid: laid.length === 1 && laid[0].parts || [], drawn: drawnOf(puffs, frame(/^ambientFX3D$/), 'ambientFX3D'),
        left: puffs.filter(function (q) { return -(q.x - G.cam.x) * s + (q.y - G.cam.y) * c < 0; }).length,
        right: puffs.filter(function (q) { return -(q.x - G.cam.x) * s + (q.y - G.cam.y) * c > 0; }).length};
    }
    function band(grid, wh) { for (var gx = 6; gx <= 10; gx++) for (var gy = 8; gy <= 23; gy++) { grid[gy * GW + gx] = 1; wh[gy * GW + gx] = 0.12; } }
    var flat, down, walls, onWalls = [], off = [];
    G.setEffectPlacementOverride('step.dash', 'frontSides');
    try {
      flat = wedge({mode: 'fp'});
      down = wedge({mode: 'fp', pitch: 1.4});
      walls = wedge({mode: 'fp', x: 0.5 * CELL, y: 240, walls: band});
      walls.laid.forEach(function (q) {
        var gx = Math.floor(q.x / CELL), gy = Math.floor(q.y / CELL), wi = gy * GW + gx;
        if (!(gx >= 0 && gy >= 0 && gx < GW && gy < GW && G.grid[wi])) return;
        var top = G.wallHeights[wi] * 240;
        onWalls.push(r3(q.z - top));
        if (!(Math.abs(q.z - top) < 1e-6)) off.push({x: r3(q.x), y: r3(q.y), z: r3(q.z), top: r3(top)});
      });
    } finally { G.setEffectPlacementOverride('step.dash', null); }
    if (flat.puffs.length < 8 || down.puffs.length < 8 || walls.laid.length < 8 || onWalls.length < 3)
      throw Error('SETUP frontSides wedges ' + JSON.stringify({flat: flat.puffs.length, down: down.puffs.length, walls: walls.laid.length, onWalls: onWalls.length}));
    check('a frontSides dash burst spreads to both sides of the view', flat.left >= 3 && flat.right >= 3 && Math.abs(flat.left - flat.right) <= 1,
      {left: flat.left, right: flat.right, puffs: flat.puffs.length});
    check('looking fully down, a frontSides dash burst still draws mostly on the canvas', down.drawn * 2 > down.puffs.length,
      {pitch: 1.4, puffs: down.puffs.length, drawn: down.drawn, flat: {puffs: flat.puffs.length, drawn: flat.drawn}});
    check('a frontSides puff over a wall starts on the wall top, not inside the wall', !off.length, {onWalls: onWalls.length, off: off.slice(0, 4)});
  });
  // An airborne dash's support (S9): the highest support at or below the
  // feet (1 u tolerance) with no roof between, a grid wall's top on the
  // surface (never a cave's wall cell, never for a cave player), and a
  // mesh-less fixed level's flat floor at 0, within a step (1 H) of the
  // feet. Real jumps in 2D (every puff kept): from wall A's top (33.6 u),
  // a dash 40 ticks into the jump, along the row, with the player landing
  // back on it; and on a classic level with no mesh (05-endless-world.js
  // resetLevel), a dash 40 ticks in. Each burst in reach lays every puff on
  // its support (A's top, the floor at 0); each out of reach spawns none and
  // counts its puffs as refused. Then the rule itself on authored geometry
  // (fxDashZ), including boundaries the player's 2.8 H body and the Endless
  // 1 H cover keep out of its reach today: a cap 15 u over the feet (never
  // a support), a floor under a roof 10 u up, a wall top for a cave player
  // and a cave's wall cell (none), and an Endless window with no mesh (none).
  // S9 fix: a jump inside a cave (the cave floor under a ceiling 4 H up is
  // the support: a ceiling test fed world units instead of mesh heights
  // would refuse it), and rule rows for that cave player, a mesh-less level
  // whose wall top is under the feet (not its flat floor), a cap 2 u and
  // 0.5 u over the feet and a wall top 0.5 u over them (the 1 u tolerance).
  if (needed('G2', ['--dash-support-above', '--dash-support-through-roof', '--dash-support-wall-underground', '--dash-support-cave-wall',
    '--dash-support-no-wall', '--dash-support-lowest', '--dash-support-no-flat-floor', '--dash-support-ceiling-units', '--dash-support-floor-over-wall',
    '--dash-support-tol-2', '--dash-support-tol-0', '--dash-support-wall-tol-0', '--dash-reach-open', '--step-reach-open'])) run('G2 dash support', function () {
    var seen = {wallTop: {inReach: 0, outOfReach: 0}, noMesh: {inReach: 0, outOfReach: 0}}, bad = [];
    function jumpDash(name, setup, ground, dashAt) {
      setup();
      ticks(5);
      var b0 = bursts.length, at = {};
      for (var k = 0; k < 75; k++) {
        ticks(1, function () { G.kbState.right = true; G.jumpPressed = k === 0; G.dashPressed = k === dashAt; });
        at[tick] = {feet: G.playerFeetSpatialZ(), air: G.jumpAirborne};
      }
      burstsOf(b0, 'step.dash').concat(burstsOf(b0, 'step.dashTrail')).forEach(function (b) {
        var a = at[b.tick];
        if (!a.air) return;
        var g = ground(b.x, b.y), reach = a.feet - g <= 25 ? 'inReach' : 'outOfReach';
        seen[name][reach]++;
        var laid = (b.parts || []).filter(function (q) { return Math.abs(q.z - g) < 1e-6; }).length;
        var ok = reach === 'outOfReach' ? b.spawned === 0 && b.noSupport > 0 : b.spawned > 0 && b.parts && laid === b.spawned;
        if (!ok) bad.push({scene: name, id: b.id, tick: b.tick, reach: reach, feet: r3(a.feet), ground: g, spawned: b.spawned, noSupport: b.noSupport,
          z: (b.parts || []).slice(0, 2).map(function (q) { return r3(q.z); })});
      });
    }
    function wallGround(x, y) {
      var gx = Math.floor(x / CELL), gy = Math.floor(y / CELL), wi = gy * GW + gx;
      return gx >= 0 && gy >= 0 && gx < GW && gy < GW && G.grid[wi] ? G.wallHeights[wi] * 240 : 0;
    }
    jumpDash('wallTop', function () { authored({mode: '2d', x: 150, y: 247.5, feetH: 0.14 * 240 / 25, walls: ruinRows, ang: -Math.PI / 2}); }, wallGround, 40);
    jumpDash('noMesh', function () { authored({mode: '2d', ang: -Math.PI / 2}); G.floorMesh = null; G.updatePlayerCaveSpace(); },
      function () { return 0; }, 40);
    if (seen.wallTop.inReach < 2 || seen.wallTop.outOfReach < 2 || seen.noMesh.inReach < 2 || seen.noMesh.outOfReach < 2)
      throw Error('SETUP airborne dash supports ' + JSON.stringify(seen));
    check('an airborne dash above a wall top or on a mesh-less level lays its dust on that support within a step, or none',
      !bad.length, {seen: seen, bad: bad.slice(0, 4)});
    // Inside the cave (floor 0, ceiling 4 H, cap 5 H under every cell): the
    // player jumps and dashes 3 ticks later; the cave floor is the support.
    bad = []; seen.cave = {inReach: 0, outOfReach: 0};
    jumpDash('cave', function () { authored({kind: 'cave', mode: '2d', ang: -Math.PI / 2}); if (!G.playerUnderground) throw Error('SETUP the cave player is not underground'); },
      function () { return 0; }, 3);
    if (seen.cave.inReach < 2) throw Error('SETUP airborne dash in a cave ' + JSON.stringify(seen.cave));
    check('an airborne dash inside a cave lays its dust on the cave floor within a step', !bad.length, {seen: seen.cave, bad: bad.slice(0, 4)});
    // The rule on authored geometry: [name, scene, x, y, feet, under, want].
    function wall20(grid, wh) { grid[16 * GW + 10] = 1; wh[16 * GW + 10] = 20 / 240; }
    function caveWall20(grid, wh) { wall20(grid, wh); G.gridCave = new Uint8Array(GW * GW); G.gridCave[16 * GW + 10] = 1; }
    var WX = 10 * CELL + 7.5, WY = 16 * CELL + 7.5, cases = [
      ['cap 15 u over the feet', {kind: 'overhang'}, 60, 240, 110, false, NaN],
      ['on the cap (0.4 u under the feet)', {kind: 'overhang'}, 60, 240, 125.4, false, 125],
      ['a floor under a roof 10 u up', {kind: 'slab'}, 60, 240, 20, false, NaN],
      ['a wall top 10 u down', {walls: wall20}, WX, WY, 30, false, 20],
      ['a wall top over a floor, both in reach', {walls: wall20}, WX, WY, 24, false, 20],
      ['a wall top for a cave player', {walls: wall20}, WX, WY, 24, true, 0],
      ['a cave\'s wall cell', {walls: caveWall20}, WX, WY, 24, false, 0],
      ['a mesh-less fixed level', {noMesh: true}, 60, 240, 20, false, 0],
      ['a mesh-less Endless window', {noMesh: true, endless: true}, 60, 240, 20, false, NaN],
      ['a cave player over the cave floor (ceiling 4 H up)', {kind: 'cave'}, 60, 240, 10, true, 0],
      ['a mesh-less level with a wall top under the feet', {noMesh: true, walls: wall20}, WX, WY, 30, false, 20],
      ['a cap 2 u over the feet', {kind: 'overhang'}, 60, 240, 123, false, NaN],
      ['a cap 0.5 u over the feet (inside the 1 u tolerance)', {kind: 'overhang'}, 60, 240, 124.5, false, 125],
      ['a wall top 0.5 u over the feet (inside the 1 u tolerance)', {walls: wall20}, WX, WY, 19.5, false, 20]
    ], wrongRule = [];
    cases.forEach(function (c) {
      var o = c[1];
      authored({kind: o.kind, mode: '2d', walls: o.walls});
      if (o.noMesh) G.floorMesh = null;
      if (o.endless) G.ENDLESS_MODE = true;
      var got = G.fxDashZ(c[2], c[3], c[4], true, c[5]);
      G.ENDLESS_MODE = false;
      if (!(got === c[6] || got !== got && c[6] !== c[6])) wrongRule.push({case: c[0], feet: c[4], under: c[5], want: c[6] === c[6] ? c[6] : 'none', got: got === got ? r3(got) : 'none'});
    });
    check('the airborne dash support rule holds on authored geometry', !wrongRule.length, {cases: cases.length, wrong: wrongRule});
    // The reach is one step, inclusive (1 H = 25 u; spec 9.3 and the S6
    // fix): ground exactly 25 u below is a support, 25.5 u is not, for an
    // airborne dash (the floor) and a grounded one (fxStepZ: a wall top;
    // beyond the reach the step falls back to the feet).
    var edge = [['airborne: the floor 25 u below', {}, 60, 240, 25, true, 0], ['airborne: the floor 25.5 u below', {}, 60, 240, 25.5, true, NaN],
      ['grounded: a wall top 25 u below', {walls: wall20}, WX, WY, 45, false, 20], ['grounded: a wall top 25.5 u below', {walls: wall20}, WX, WY, 45.5, false, 45.5]];
    var wrongEdge = [];
    edge.forEach(function (c) {
      authored({mode: '2d', walls: c[1].walls});
      var got = G.fxDashZ(c[2], c[3], c[4], c[5], false);
      if (!(got === c[6] || got !== got && c[6] !== c[6])) wrongEdge.push({case: c[0], feet: c[4], want: c[6] === c[6] ? c[6] : 'none', got: got === got ? r3(got) : 'none'});
    });
    check('a dash\'s support reach is one step, 25 u included', !wrongEdge.length, {cases: edge.length, wrong: wrongEdge});
  });

  // ── Wading (water system merge, 06-water.js; the particle handoff's
  // wading note). A still lake, the water system's own arrays on the flat
  // authored mesh, covers the height points x 192-288 of every row at 0.5 H
  // (surface z 12.5 over ground 0, knee deep: wading slows the walk).
  // waterAt samples a cell's north-west point, so the water stands over
  // ground x 192-300. 2D, so the player's own puffs spawn. The player walks
  // east from x 100 through it; jumps in place in it; dashes east from x
  // 196 into it; a normal enemy walks the same band (npcMoveToward, which
  // wading slows too). Oracle: the authored band, x in [192, 300): every
  // step, landing or dash laid there spawns no dust and is counted
  // (observers.wading); every step outside it spawns its puff. Control: the
  // same walk with the water system switched off puffs inside the band too.
  if (needed('wading', ['--dust-while-wading', '--trail-while-wading'])) run('wading', function () {
    function lake() {
      var m = G.floorMesh, n = m.w * m.h;
      ['waterSurface', 'waterDepth', 'waterSpeed', 'waterDirX', 'waterDirY'].forEach(function (k) { m[k] = new Float32Array(n); });
      m.water = new Uint8Array(n); m.waterFlags = new Uint8Array(n); m.waterBody = new Int32Array(n);
      for (var i = 0; i < n; i++) {
        var gx = i % m.w;
        if (gx >= 16 && gx <= 24) { m.water[i] = G.WATER_KIND.still; m.waterSurface[i] = 0.5; m.waterDepth[i] = 0.5; m.waterBody[i] = 1; }
      }
    }
    function inBand(x) { return x >= 192 && x < 300; }
    function walk(waterOn) {
      var S = authored({mode: '2d', x: 100, y: 240});
      lake(); G.WATER_SYSTEM_ENABLED = waterOn;
      try {
        ticks(10);
        var b0 = bursts.length, e0 = events.length, w0 = S.stats.obsWading;
        var rows = ticks(420, function () { G.kbState.right = true; });
        var steps = events.slice(e0).filter(function (e) { return e.type === 'footstep' && e.self; });
        var puffs = burstsOf(b0, 'step.dust').filter(function (b) { return b.self && b.spawned > 0; });
        var inside = steps.filter(function (e) { return inBand(e.x); }), outside = steps.filter(function (e) { return !inBand(e.x); });
        return {end: r3(rows[rows.length - 1].x), steps: steps.length, inside: inside.length,
          before: outside.filter(function (e) { return e.x < 192; }).length, after: outside.filter(function (e) { return e.x >= 300; }).length,
          puffsInside: puffs.filter(function (b) { return inBand(b.x); }).length, puffsOutside: puffs.filter(function (b) { return !inBand(b.x); }).length,
          outside: outside.length, wading: S.stats.obsWading - w0};
      } finally { G.WATER_SYSTEM_ENABLED = true; }
    }
    var wet = walk(true), dry = walk(false);
    if (wet.end < 320 || wet.inside < 3 || wet.before < 3 || wet.after < 1 || dry.inside < 3)
      throw Error('SETUP the wading walk ' + JSON.stringify({wet: wet, dry: dry}));
    // A jump in place in the lake: its landing is laid under the surface.
    var S = authored({mode: '2d', x: 240, y: 240});
    lake(); ticks(10);
    var b1 = bursts.length, e1 = events.length, w1 = S.stats.obsWading;
    ticks(120, function (k) { G.jumpPressed = k === 2; });
    var lands = events.slice(e1).filter(function (e) { return e.type === 'land'; }), landPuffs = sum(burstsOf(b1, 'step.land'), 'spawned');
    if (lands.length !== 1 || !inBand(lands[0].x)) throw Error('SETUP the lake landing ' + JSON.stringify(lands));
    check('wading: the player\'s steps and landing laid under a lake\'s surface kick up no dust (counted); the steps either side of it do, and with the water system off so do those in the band',
      wet.puffsInside === 0 && wet.puffsOutside === wet.outside && wet.wading === wet.inside + 0 && landPuffs === 0 &&
      S.stats.obsWading - w1 === 1 && dry.puffsInside === dry.inside && dry.wading === 0,
      {wet: wet, dry: dry, landPuffs: landPuffs, landWading: S.stats.obsWading - w1});
    // A dash east from x 196 into the lake: its start and every trail tick
    // inside the band lay no dust.
    S = authored({mode: '2d', x: 196, y: 240});
    lake(); ticks(10);
    var b2 = bursts.length, e2 = events.length, wetTicks = 0;
    for (var k = 0; k < 30; k++) {
      ticks(1, function () { G.kbState.right = true; G.dashPressed = k === 2; });
      if (G.gameTimeNow() < G.dashUntil && inBand(G.pos.x)) wetTicks++;
    }
    var dashes = events.slice(e2).filter(function (e) { return e.type === 'dashStart'; });
    var dashPuffs = sum(burstsOf(b2, 'step.dash'), 'spawned'), trailWet = burstsOf(b2, 'step.dashTrail').filter(function (b) { return inBand(b.x) && b.spawned > 0; });
    if (dashes.length !== 1 || !inBand(dashes[0].x) || wetTicks < 3) throw Error('SETUP the lake dash ' + JSON.stringify({dashes: dashes, wetTicks: wetTicks}));
    check('wading: a dash into a lake lays no burst where it starts in the water and no trail puff while it runs through it',
      dashPuffs === 0 && !trailWet.length, {dashPuffs: dashPuffs, trailWet: trailWet.length, wetTicks: wetTicks, start: r3(dashes[0].x)});
    // A normal enemy walks east along y 280 from x 100 to x 340.
    S = authored({mode: '2d', x: 60, y: 240});
    lake();
    var e = enemyAt('normal', 100, 280, 0);
    observe();
    var b3 = bursts.length, e3 = events.length;
    for (k = 0; k < 600 && e.x < 339.9; k++) { G.npcMoveToward(e, 340, 280, 60, DT, 6, 0); observe(); }
    var npcSteps = events.slice(e3).filter(function (q) { return q.type === 'footstep' && !q.self; });
    var npcPuffs = burstsOf(b3, 'step.dust').filter(function (b) { return !b.self && b.spawned > 0; });
    var npcIn = npcSteps.filter(function (q) { return inBand(q.x); }).length, npcOut = npcSteps.length - npcIn;
    if (e.x < 339.9 || npcIn < 3 || npcOut < 3) throw Error('SETUP the wading enemy ' + JSON.stringify({x: e.x, inBand: npcIn, outside: npcOut}));
    check('wading: an enemy walking through the lake lays no dust in it and its puffs either side',
      !npcPuffs.some(function (b) { return inBand(b.x); }) && npcPuffs.length === npcOut,
      {steps: npcSteps.length, inBand: npcIn, outside: npcOut, puffs: npcPuffs.length, puffsInBand: npcPuffs.filter(function (b) { return inBand(b.x); }).length});
  });

  check('no effect runtime failures were counted', !failures(), {failures: G.getEffectStats().failures});
  check('no frame stage threw and no console errors from the game', !stageErrors.length && !G.__dustErrors.length,
    {stages: stageErrors.slice(0, 3), errors: G.__dustErrors.slice(0, 3)});
  Math.random = originalRandom; Date.now = originalNow;
  output('LOCOMOTION_DUST_RESULT ' + (failed ? 'FAIL ' + failed + '/' : 'PASS ') + checked);
}());
