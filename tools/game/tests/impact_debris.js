// Impact debris and sparks (unified effects V1, slice S5). A full-game host
// loads the real manifest; the scenes are authored (projectile_sweeps.js
// style): a flat floor, a 20 degree ramp z = x tan 20 and a two-layer cave
// (floor 0, ceiling 4 H, cap 5 H) under a 24 x 24 wall grid of 15 u cells,
// with one wall cell at (10, 10) (x and y 150..165, top 240). The producers
// are the game's own: real projectiles through updateProjectiles (walls, ore
// veins, floors, the cave ceiling and roof, enemies, spawners, a poison lob,
// a slime bolt) and real NPC strikes through npcUpdateAction (an enemy on
// the player after its windup, a garrison ally on an enemy, a tower bolt);
// the debris comes from the real fxEvent readers, engine and renderer.
// Risks covered: debris thrown out of the far side of the wall (inside it,
// hidden), or wall dust puffed into the rock (F1), a wall top struck like a
// face, a contact emitting on every sweep step or never (F2), chips
// knocked out of bodies (F3), chips sinking through or floating above a
// slope (F4), sparks fired into a steep hillside, debris in the wrong stratum
// of a cave (F4b: chips, sparks and dust), ore chips in the wall's colours
// because the vein was read after the hit spliced it, or a slime bolt taken
// for a miner (F5), melee sparks at the windup or from a ranged tower,
// invisible to a struck first-person player, or pulled in front of the
// camera from a fight behind it (F6), a debris switch that drops gameplay
// impact records, ignores the Unified switch or still reads every contact
// (F7), a reader that writes the producer's records and so changes gameplay
// (F8), debris counts off the section 9.2 table (contacts and melee
// commits), debris spawned off the struck surface (floors, roofs, ceilings,
// lob landings, bodies), sparks not in the spell's colours, chips and dust
// not in the struck surface's, a where.spell binding that never fires, a
// dust puff filling the view next to the camera, and a contact cap that
// keeps far or late contacts over near ones, never starts again, or holds a
// tick's contacts back although they fit its spawn cap.
// Oracles: the authored geometry (the wall's cell bounds and top, the ramp
// and hillside planes, the cave's floor, ceiling and cap heights, the body
// envelopes of 10-projectile-queries.js), the section 9.2 and 4.4 tables and
// material literals restated here (the ore painter's colours,
// 07-decorations-lighting.js; the spell materials; BIOME_PALETTE), NPC commit
// counters, recorded Canvas commands, and casting_presentation.js's own
// scenario scripts with a recorder in place of the engine.
// Mutations are applied to slurped sources only (anchors match exactly once):
//   --debris-far-side       --contact-every-substep --chips-on-enemy
//   --chips-ignore-floor    --ore-after-splice      --emit-on-windup
//   --toggle-drops-impacts  --reader-writes-projectile
//   --preset-ignores-unified --melee-spark-source   --spark-flat-colour
//   --floor-chips-wall-colour --chips-surface-stratum --no-contact-cap
//   --contact-cap-keeps-first --contact-cap-keeps-latest --contact-cap-per-session
//   --melee-front-for-all   --contact-spell-unset   --floor-normal-up
//   --wall-dust-floor-colour --dust-into-wall       --dust-unclamped
//   --sparks-surface-stratum --dust-surface-stratum --terrain-spawn-at-centre
//   --lob-spawn-centre      --body-spawn-at-centre  --companion-mines-ore
//   --wall-top-as-face      --inside-top-as-face    --melee-no-dust         --melee-spark-count
//   --melee-spark-feet      --melee-at-attacker     --event-max-all-bindings
//   --read-contacts-while-off
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
  var HOOK = "      if (typeof fxEvent === 'function') fxEvent('projectileContact', p, contact, nx, ny, nz);\n";
  G.__debrisSource = function (path, source) {
    if (path === 'src/11-fx-engine.js') {
      // The wall normal pointing into the struck cell: debris on the far side.
      source = mutate(source, '--debris-far-side', '    sx = qx + nx * 0.75; sy = qy + ny * 0.75; sz = qz + nz * 0.75;',
        '    nx = -nx; ny = -ny; nz = -nz; sx = qx + nx * 0.75; sy = qy + ny * 0.75; sz = qz + nz * 0.75;');
      // A reader that writes the projectile it reads: a wall hit's projectile
      // relabelled a lob, which the gameplay branch right after the hook reads.
      source = mutate(source, '--reader-writes-projectile', '  ev.kind[k] = code < 0 ? 30 : code; ev.ore[k] = ore;',
        "  ev.kind[k] = code < 0 ? 30 : code; ev.ore[k] = ore; if (kind === 'wall') p.isLob = true;");
      // Sparks in the spell's flat colour instead of its light and core roles.
      source = mutate(source, '--spark-flat-colour', '  if (mat) { ev.rgb[k] = mat.packed.light; ev.rgb2[k] = mat.packed.core; } else ev.rgb[k] = fxParseColor(spell.color);',
        '  ev.rgb[k] = fxParseColor(spell.color);');
      // No per-tick contact cap, or a cap that keeps the first contacts, the
      // latest ones (always replaces), or never starts again (one per session).
      source = mutate(source, '--no-contact-cap', '  if (n < FX_CONTACTS_PER_TICK) { S.contactSlot[n] = k;', '  if (true) { S.contactSlot[n] = k;');
      source = mutate(source, '--contact-cap-keeps-first', '  if (d < S.contactD[far]) { fxRingCopy(ev, k, S.contactSlot[far]); S.contactD[far] = d; }\n', '');
      source = mutate(source, '--contact-cap-keeps-latest', '  if (d < S.contactD[far]) { fxRingCopy(', '  if (true) { fxRingCopy(');
      source = mutate(source, '--contact-cap-per-session', "    S.contactN = 0;                       // contacts since the last tick are queued: a new tick's cap starts\n", '');
      // where.spell: the ring's spell code never set (it stays 0).
      source = mutate(source, '--contact-spell-unset', '  ev.spell[k] = spell.id && _fxHas(S.C.SPELLS, spell.id) ? S.C.SPELLS[spell.id] : 0;\n', '');
      // Terrain contacts with a flat +-z normal whatever the struck triangle's slope.
      source = mutate(source, '--floor-normal-up', "    var tn = fxSurfaceNormalInto(contact, x, y, kind === 'ceiling' ? -1 : 1, _fxN);",
        "    var tn = [0, 0, kind === 'ceiling' ? -1 : 1];");
      // Terrain debris at the sweep's point (the sphere's centre, r off the
      // surface) plus the normal, as a body contact's used to be.
      source = mutate(source, '--terrain-spawn-at-centre', '    sx = x - nx * (r - 0.75); sy = y - ny * (r - 0.75); sz = z - nz * (r - 0.75);',
        '    sx = x + nx * 0.75; sy = y + ny * 0.75; sz = z + nz * 0.75;');
      source = mutate(source, '--lob-spawn-centre', '    sz = Number.isFinite(floorZ) ? floorZ + 0.75 : z - r + 0.75;', '    sz = z + 0.75;');
      source = mutate(source, '--body-spawn-at-centre', 'sx = x + dx * (r - 0.75); sy = y + dy * (r - 0.75); sz = z + dz * (r - 0.75); }',
        'sx = x - dx * 0.75; sy = y - dy * 0.75; sz = z - dz * 0.75; }');
      // A slime bolt into an ore wall classed as ore (companions never mine).
      source = mutate(source, '--companion-mines-ore', "if (kind === 'wall' && !spell.isCompanion && typeof oreVeins", "if (kind === 'wall' && typeof oreVeins");
      // A hit on the wall's top taken for its nearest side face.
      source = mutate(source, '--wall-top-as-face', 'if (ax >= ay && ax >= az) nx = ex > 0 ? 1 : -1; else if (ay >= az) ny = ey > 0 ? 1 : -1; else nz = ez > 0 ? 1 : -1;',
        'if (ax >= ay) nx = ex > 0 ? 1 : -1; else ny = ey > 0 ? 1 : -1;');
      source = mutate(source, '--inside-top-as-face', '} else if (span && z >= hi - 1) { nz = 1; qz = hi; }', '} else if (false) { nz = 1; qz = hi; }');
      // Melee sparks at the attacker, not between the bodies.
      source = mutate(source, '--melee-at-attacker', 'ev.x[k] = actor.x + dx * 0.65; ev.y[k] = actor.y + dy * 0.65;', 'ev.x[k] = actor.x; ev.y[k] = actor.y;');
      // A queued event sized by every binding of its type, whatever its kind.
      source = mutate(source, '--event-max-all-bindings', '    if (!S.gate[list[b].r] || !fxBindingMatches(list[b], ev, k)) continue;\n', '');
      // Producers' calls read and queued while every bound recipe is off.
      source = mutate(source, '--read-contacts-while-off', "    if (!fxEventOpen(S, FX_EVENT_CODE[type])) { S.stats.eventsGated++; return; }\n", '');
    }
    if (path === 'src/02-effect-registry.js') {
      source = mutate(source, '--preset-ignores-unified', "function effectPresetOn(key) { return effectToggleOn(key) && effectToggleOn('fxUnified'); }",
        'function effectPresetOn(key) { return effectToggleOn(key); }');
    }
    if (path === 'src/11-fx-recipes.js') {
      source = mutate(source, '--chips-on-enemy', "    trigger:[{event:'projectileContact', where:{kind:['wall']}, count:5},",
        "    trigger:[{event:'projectileContact', where:{kind:['wall', 'enemy']}, count:5},");
      var chipCollision = "    collision:{mode:'bounce', stratum:'reference', restitution:0.35, friction:0.6, bounces:2, restSeconds:[0.4, 0.7], wall:true},";
      source = mutate(source, '--chips-ignore-floor', chipCollision, chipCollision.replace("mode:'bounce'", "mode:'none'"));
      source = mutate(source, '--chips-surface-stratum', chipCollision, chipCollision.replace("stratum:'reference'", "stratum:'surface'"));
      source = mutate(source, '--floor-chips-wall-colour', "      {event:'projectileContact', where:{kind:['floor', 'cap']}, count:3, color:'surfaceFloor'},",
        "      {event:'projectileContact', where:{kind:['floor', 'cap']}, count:3},");
      // A strike on the player held at its source; every strike moved in front.
      source = mutate(source, '--melee-spark-source', "count:4, at:'torso', place:'sourceOrFront'}", "count:4, at:'torso', place:'source'}");
      source = mutate(source, '--melee-front-for-all', "    placeParams:{near:20, distance:26, drop:6}, spawn:{spread:1.0, speed:[60, 140]}}",
        "    place:'sourceOrFront', placeParams:{near:20, distance:26, drop:6}, spawn:{spread:1.0, speed:[60, 140]}}");
      // The melee row: no dust at the target's feet; two sparks; sparks at the feet.
      source = mutate(source, '--melee-no-dust', ",\n      {event:'meleeCommit', count:1, at:'feet'}]", ']');
      source = mutate(source, '--melee-spark-count', "{event:'meleeCommit', where:{self:false}, count:4, at:'torso'}", "{event:'meleeCommit', where:{self:false}, count:2, at:'torso'}");
      source = mutate(source, '--melee-spark-feet', "{event:'meleeCommit', where:{self:false}, count:4, at:'torso'}", "{event:'meleeCommit', where:{self:false}, count:4, at:'feet'}");
      // Sparks or dust colliding with the surface stratum (the roof above a cave).
      source = mutate(source, '--sparks-surface-stratum', "gravity:300, drag:2}, collision:{mode:'kill', stratum:'reference', wall:true}",
        "gravity:300, drag:2}, collision:{mode:'kill', stratum:'surface', wall:true}");   // the spark's (S8's flame.ember shares the collision text)
      source = mutate(source, '--dust-surface-stratum', "drag:3}, collision:{mode:'clamp', stratum:'reference'}", "drag:3}, collision:{mode:'clamp', stratum:'surface'}");
      // Wall dust in the floor's dust colour (grass green on a stone wall).
      source = mutate(source, '--wall-dust-floor-colour', "where:{kind:['wall', 'ore', 'ceiling']}, count:1, color:'surfaceWall'}", "where:{kind:['wall', 'ore', 'ceiling']}, count:1}");
      // Dust anywhere in its sphere (into the wall), and with no size clamp.
      source = mutate(source, '--dust-into-wall', "radius:[0, 1.5], halfSpace:true, direction:'normal'", "radius:[0, 1.5], direction:'normal'");
      source = mutate(source, '--dust-unclamped', "alpha:[0.22, 0.32], maxPx:16}", 'alpha:[0.22, 0.32]}');
    }
    if (path === 'src/10-combat.js') {
      // The hook on every sweep step instead of each blocked contact.
      if (has('--contact-every-substep')) {
        source = mutate(source, '--contact-every-substep', HOOK, '');
        source = mutate(source, '--contact-every-substep', "    if (contact.status==='blocked') {\n", HOOK.slice(2) + "    if (contact.status==='blocked') {\n");
      }
      // The hook after the ore branch: a vein spliced by this hit is gone.
      if (has('--ore-after-splice')) {
        source = mutate(source, '--ore-after-splice', HOOK, '');
        source = mutate(source, '--ore-after-splice', '      if (!hitOre) { impacts.push(', HOOK + '      if (!hitOre) { impacts.push(');
      }
      // Turning debris off also drops the wall hit's impact flash record.
      source = mutate(source, '--toggle-drops-impacts', '      if (!hitOre) { impacts.push(', "      if (!hitOre) { if (effectToggleOn('fxDebris')) impacts.push(");
    }
    if (path === 'src/10-npc-controller.js' && has('--emit-on-windup')) {
      // The strike's feedback at the start of its windup, not at the commit.
      source = mutate(source, '--emit-on-windup', "      if (ability.melee && typeof fxEvent === 'function') fxEvent('meleeCommit', actor, recipient);\n", '');
      source = mutate(source, '--emit-on-windup', "    actor.attackState='windup';actor.attackStateUntil=now+ability.windupMs;\n",
        "    actor.attackState='windup';actor.attackStateUntil=now+ability.windupMs;\n    if (ability.melee && typeof fxEvent === 'function') fxEvent('meleeCommit', actor, target);\n");
    }
    return source;
  };
  G.__debrisLoad = function (path) {
    try { (0, eval)(G.__debrisSource(path, slurp('assets/games/' + path))); } catch (e) {
      if (/^MUTATION_ANCHOR/.test(e.message)) throw e;
      loadErrors.push(path + ': ' + e.message);
    }
  };
  var host = slurp('tools/game/tests/cave_occlusion_integration.js');
  var end = host.indexOf('  function check(name, okay) {');
  if (end < 0) throw Error('SETUP debris host boundary missing');
  host = host.slice(0, end);
  var load = "manifest.parts.MAIN.forEach(function (path) { (0, eval)(slurp('assets/games/' + path)); });";
  if (host.split(load).length !== 2) throw Error('SETUP debris manifest boundary missing');
  host = host.replace(load, 'manifest.parts.MAIN.forEach(G.__debrisLoad);');
  (0, eval)(host + 'G.__debrisErrors = errors; }());');
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
  if (loadErrors.length) { output('IMPACT_DEBRIS_RESULT FAIL ' + failed + '/' + checked + ' (load failed)'); return; }

  // ── Recording Canvas (as effect_producers.js): the drawing state with a
  // real save/restore stack and translation, and every fill, stroke and
  // image of the watched frame stages with its path and style.
  var hostCtx = G.ctx, rec = {stage: null, watch: null, draws: [], path: [], stack: [], calls: {}, blurSets: 0};
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
      if (k === 'shadowBlur' && v > 0 && watching()) rec.blurSets++;
      state[k] = v; return true;
    }
  });
  var realPt = G._pt, stageErrors = [];
  // One real frame (renderFrame); the stages named by `watch` are recorded.
  function frame(watch) {
    rec.draws = []; rec.calls = {}; rec.path = []; rec.watch = watch || /^(fxCombat3D|fx2D)$/;
    G._pt = function (name, fn) {
      var prev = rec.stage; rec.stage = name;
      try { return fn(); } catch (e) { stageErrors.push(name + ': ' + e.message); } finally { rec.stage = prev; }
    };
    try { G.renderFrame(); } finally { G._pt = realPt; rec.stage = null; rec.watch = null; }
    return rec.draws;
  }
  function inCanvas(x, y) { return x >= 0 && x <= G.canvas.width && y >= 0 && y <= G.canvas.height; }
  function rgbText(v) { return 'rgb(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ')'; }
  function hex(h) { return parseInt(h.slice(1), 16); }
  // Distinct line pieces (moveTo then lineTo) of strokes in `styles` inside the canvas.
  function lines(draws, stageName, styles) {
    var seen = {}, n = 0;
    draws.forEach(function (d) {
      if (d.stage !== stageName || d.kind !== 'stroke' || (styles && styles.indexOf(d.style) < 0)) return;
      for (var i = 0; i + 1 < d.path.length; i++) {
        var a = d.path[i], b = d.path[i + 1];
        if (a[0] !== 'moveTo' || b[0] !== 'lineTo' || !inCanvas(a[1], a[2])) continue;
        var key = Math.round(a[1] * 2) + ',' + Math.round(a[2] * 2) + ',' + Math.round(b[1] * 2) + ',' + Math.round(b[2] * 2);
        if (!seen[key]) { seen[key] = 1; n++; }
      }
    });
    return n;
  }
  // Filled triangles (moveTo, lineTo, lineTo: the chip shape) inside the canvas.
  function triangles(draws, stageName) {
    var n = 0;
    draws.forEach(function (d) {
      if (d.stage !== stageName || d.kind !== 'fill') return;
      for (var i = 0; i + 2 < d.path.length; i++)
        if (d.path[i][0] === 'moveTo' && d.path[i + 1][0] === 'lineTo' && d.path[i + 2][0] === 'lineTo' && inCanvas(d.path[i][1], d.path[i][2])) n++;
    });
    return n;
  }
  function images(draws, stageName) { return draws.filter(function (d) { return d.stage === stageName && d.kind === 'image' && inCanvas(d.x + d.w / 2, d.y + d.h / 2); }).length; }
  function dots(draws, stageName) {
    var n = 0;
    draws.forEach(function (d) {
      if (d.stage !== stageName || d.kind !== 'fill') return;
      d.path.forEach(function (c) { if ((c[0] === 'arc' && inCanvas(c[1], c[2])) || (c[0] === 'rect' && inCanvas(c[1] + c[3] / 2, c[2] + c[4] / 2))) n++; });
    });
    return n;
  }

  // Every effect event, counted by type on its way to the real fxEvent.
  var events = {}, eventLog = [], realEvent = G.fxEvent;
  G.fxEvent = function (type) { events[type] = (events[type] || 0) + 1; eventLog.push(type); return realEvent.apply(G, arguments); };
  function failures() { var f = G.getEffectStats().failures, n = 0; for (var k in f) n += f[k]; return n; }
  function byRecipe(S, id) {
    var r = S.C.ID[id], out = [];
    for (var i = 0; i < S.count; i++) if (S.rec[i] === r) out.push(i);
    return out;
  }
  function palRGB(S, pal) { return pal < S.C.PAL.count ? S.C.PAL.rgb[pal] : S.dynPal[pal - S.C.PAL.count]; }
  var DEBRIS = ['impact.spark', 'impact.chip', 'impact.chipFall', 'impact.dust', 'impact.slimeSplat', 'melee.spark'];
  function debrisCount(S) { return DEBRIS.reduce(function (n, id) { return n + byRecipe(S, id).length; }, 0); }
  // Debris spawned in the tick just run: its first integrate step made its age one tick.
  function newDebris(S) { return DEBRIS.reduce(function (n, id) { return n + byRecipe(S, id).filter(function (i) { return S.age[i] <= DT * 1.5; }).length; }, 0); }

  // ── Authored scenes ───────────────────────────────────────────────────────
  var MW = 31, GS = 12, CELL = 15, GW = 24, WALL = [10, 10];
  function mesh(kind) {
    var m = {w: MW, h: MW, gridSize: GS, layerCount: new Uint8Array(MW * MW)};
    for (var l = 0; l < 5; l++) {
      m['l' + l + 'Type'] = new Uint8Array(MW * MW); m['l' + l + 'TopZ'] = new Float64Array(MW * MW); m['l' + l + 'Meta'] = new Uint8Array(MW * MW);
      m['l' + l + 'Color'] = new Array(MW * MW).fill('#6f6a5e');                // the floor renderer's per-layer base colour
    }
    for (var y = 0; y < MW; y++) for (var x = 0; x < MW; x++) {
      var i = y * MW + x;
      m.layerCount[i] = kind === 'cave' ? 3 : 1; m.l0Type[i] = 1; m.l0Meta[i] = kind === 'cave' ? 2 : 1;
      m.l0TopZ[i] = kind === 'ramp' ? x * GS * TAN20 / 25 : 0;
      if (kind === 'cave') { m.l1Type[i] = 2; m.l1TopZ[i] = 4; m.l2Type[i] = 4; m.l2TopZ[i] = 5; m.l2Meta[i] = 3; }
    }
    return m;
  }
  function freshFx() { return (G.fxState = G.createFxState(G.EFFECT_CONFIG.capacity, 5005, {pinned: true})); }
  // opts: {kind, wall, walls, camX, camY, camAng, under}
  function authored(opts) {
    opts = opts || {};
    G.floorMesh = mesh(opts.kind || 'flat'); G.ENDLESS_MODE = false; G.CAVE_TEST_MODE = false; G.level = 1; G.terrain = 'ground';
    G.cell = CELL; G.gridW = G.gridH = GW; G.grid = new Uint8Array(GW * GW); G.wallHeights = new Float64Array(GW * GW).fill(1);
    G.wallFaceBase = G.wallMaxTopZ = null; G.oreVeins = []; G.pointLights = [];
    if (opts.wall !== false) G.grid[WALL[1] * GW + WALL[0]] = 1;
    (opts.walls || []).forEach(function (w) { G.grid[w[1] * GW + w[0]] = 1; });
    G.buildWalkCandZ(G.floorMesh);                                  // the renderers' per-cell masks
    G.deepCaveRegions = []; G.windowOriginX = G.windowOriginY = 0; G.playerUnderground = !!opts.under;
    var cx = opts.camX === undefined ? 60 : opts.camX, cy = opts.camY === undefined ? 157 : opts.camY;
    var feet = opts.kind === 'ramp' ? cx * TAN20 : 0;
    G.pos = {x: cx, y: cy, floorZ: 60 + 40 * feet / 25}; G.vel = {x: 0, y: 0};
    G.cam = {x: cx, y: cy, z: G.pos.floorZ, ang: opts.camAng || 0, pitch: 0, fov: G.GAME_CONFIG.player.baseFov};
    G.MODE3D = true; G.CAM_FOLLOW = true; G.running = true; G.gameOverState = false; G.settings.particles = 25;
    G.viewCam = {x: cx - G.canvas.width / 2, y: cy - G.canvas.height / 2};
    G.enemies = []; G.enemySpawners = []; G.projectiles = []; G.impacts = []; G.deathEffects = []; G.soulOrbs = []; G.coinDrops = [];
    G.groundEffects = []; G.chainEffects = []; G.novaEffects = []; G.companions = []; G.fortressAllies = []; G.shopMarker = null;
    G.equipment = {robes: null, relic: null, armor: null}; G.dmgBoostUntil = 0; G.health = G.HEALTH_MAX; G.mana = G.MANA_MAX;
    G.renderPresentationAlpha = 1; G.goalSpawned = true; G.renderSurfaceAmbient = 0.9;
    events = {}; eventLog = [];
    return freshFx();
  }
  var BOLT = {id: 'missile', damage: 1, color: '#4db6ff'};           // the player's missile without homing
  function shot(v) {
    var p = {x: 30, y: 157, z: 55, ang: 0, speed: 240, hz: 240, vz: 0, r: 8, spell: BOLT, spawnMs: G.gameTimeNow() - 100,
      lifeMs: 1500, renderFloorZ: 0};
    Object.keys(v || {}).forEach(function (k) { p[k] = v[k]; });
    G.projectiles.push(p);
    return p;
  }
  function enemyAt(x, y, health) {
    var e = {x: x, y: y, z: 0, health: health === undefined ? 10 : health, underground: false, vx: 0, vy: 0,
      enemyType: {id: 'normal', size: 1, speed: 0, chaseRange: 0, attackDamage: 0, attackWindup: 300, attackCooldown: 900}};
    G.enemies.push(e); G.npcEnsure(e, 'enemy');
    return e;
  }
  // The pool at the first integrate pass after `fn` runs one updateEffects:
  // the spawn positions and initial velocities of this tick's particles (age 0).
  function spawnsOf(S, fn) {
    var real = G.fxIntegrate, seen = null;
    G.fxIntegrate = function (T) {
      if (!seen && T === S) {
        seen = {};
        DEBRIS.forEach(function (id) {
          seen[id] = byRecipe(T, id).filter(function (i) { return T.age[i] === 0; })
            .map(function (i) { return {x: T.x[i], y: T.y[i], z: T.z[i], vx: T.vx[i], vy: T.vy[i], vz: T.vz[i], pal: palRGB(T, T.pal[i])}; });
        });
      }
      return real.apply(G, arguments);
    };
    try { fn(); G.updateEffects(DT); } finally { G.fxIntegrate = real; }
    if (!seen) throw Error('SETUP no integrate pass ran');
    return seen;
  }
  // Chips: the thrown chips and a ceiling's falling chips.
  function counts(sp) {
    var out = {};
    DEBRIS.forEach(function (id) { out[id === 'melee.spark' ? 'melee' : id.split('.')[1]] = sp[id].length; });
    out.chip += out.chipFall; delete out.chipFall;
    return out;
  }

  // ── F1: debris leaves the shooter's side of the wall ─────────────────────
  if (needed('F1', ['--debris-far-side', '--dust-into-wall'])) run('F1 near side', function () {
    // West: contact x = 150 - r = 142 (projectile_sweeps.js); east mirrored:
    // 165 + 8 = 173. The face planes come from the wall cell's bounds. Sixty
    // shots per side across the face (three pools of twenty, each with its
    // own seed), so many hashed offsets of the dust's sphere are tried, not
    // one seed's.
    var DUST_REACH = 0.75 + 1.5;                       // stand-off plus impact.dust's authored sphere radius
    function side(east) {
      var face = east ? (WALL[0] + 1) * CELL : WALL[0] * CELL, out = [], all = 0, dust = 0, chips = 0, away = 0, impacts = [], inside = 0, S;
      for (var t = 0; t < 3; t++) {
        authored({camX: east ? 180 : 135, camAng: east ? Math.PI : 0});   // within the LOD near distance
        S = G.fxState = G.createFxState(G.EFFECT_CONFIG.capacity, 5005 + 7919 * t, {pinned: true});
        for (var j = 0; j < 20; j++) shot(east ? {x: 330, ang: Math.PI, y: 150.4 + 0.7 * j} : {y: 150.4 + 0.7 * j});
        var sp = spawnsOf(S, function () { G.updateProjectiles(1); });
        if (G.projectiles.length || events.projectileContact !== 20) throw Error('SETUP the ' + (east ? 'east' : 'west') + ' shots made ' + events.projectileContact + ' wall contacts');
        G.impacts.forEach(function (im) { impacts.push(r3(im.x)); });
        DEBRIS.forEach(function (id) {
          sp[id].forEach(function (q) {
            var depth = east ? q.x - face : face - q.x, reach = id === 'impact.dust' ? DUST_REACH : 1;   // off the face, shooter side positive
            all++; if (id === 'impact.dust') dust++;
            if (!(depth > 0 && depth <= reach + 1e-9)) out.push({id: id, x: r3(q.x), depth: r3(depth)});
          });
        });
        sp['impact.chip'].forEach(function (q) { chips++; if ((east ? -q.vx : q.vx) < 0) away++; });
        // Thirty ticks later no debris is inside the wall cell below its top.
        for (var k = 0; k < 30; k++) G.updateEffects(DT);
        DEBRIS.forEach(function (id) { byRecipe(S, id).forEach(function (i) {
          if (S.x[i] >= WALL[0] * CELL && S.x[i] <= (WALL[0] + 1) * CELL && S.y[i] >= WALL[1] * CELL && S.y[i] <= (WALL[1] + 1) * CELL && S.z[i] < 240) inside++;
        }); });
      }
      var impactX = impacts.filter(function (x, i, a) { return a.indexOf(x) === i; });
      return {face: face, spawns: all, dust: dust, offCount: out.length, off: out.slice(0, 4), chips: chips, away: away, insideLater: inside, impactX: impactX};
    }
    var west = side(false), east = side(true);
    function ok(s) { return s.spawns === 720 && s.chips === 300 && s.dust === 60 && !s.off.length && s.away >= 0.8 * s.chips && s.insideLater === 0; }
    check('debris leaves the shooter\'s side of the wall', ok(west) && ok(east) && west.impactX.join() === '142' && east.impactX.join() === '173',
      {need: 'every spawn on the shooter side: sparks and chips within 1 u of the face, dust within its 1.5 u sphere of the 0.75 u point; 80% of chips away from the wall',
        west: west, east: east});
  });

  // ── Wall tops and shots from inside a wall cell ──────────────────────────
  if (needed('wall top', ['--wall-top-as-face', '--inside-top-as-face'])) run('wall top', function () {
    // A shot straight down onto the top (240) at the cell's centre, and one
    // whose start lies inside the cell 0.5 u under the top: debris on the top,
    // within 1 u above it and inside the cell's footprint; sparks thrown up.
    // Control: a shot starting inside the cell at mid-height, 2 u from the
    // west face, leaves by that face.
    function hit(v, face) {
      var S = authored({camX: 135});
      shot(v);
      var sp = spawnsOf(S, function () { G.updateProjectiles(1); }), all = [];
      if (events.projectileContact !== 1) throw Error('SETUP the wall-top shot made ' + (events.projectileContact || 0) + ' contacts');
      DEBRIS.forEach(function (id) { sp[id].forEach(function (q) { all.push({id: id, x: r3(q.x), y: r3(q.y), z: r3(q.z), vz: r3(q.vz)}); }); });
      return {spawns: all.length, sample: all.slice(0, 3), off: all.filter(function (q) {
        return face ? !(q.x < 150 && q.x >= 150 - (q.id === 'impact.dust' ? 2.25 : 1)) :
          !(q.x >= 150 && q.x <= 165 && q.y >= 150 && q.y <= 165 && q.z > 240 && q.z <= 240 + (q.id === 'impact.dust' ? 2.25 : 1));
      }).slice(0, 3), sparksUp: sp['impact.spark'].every(function (q) { return q.vz > 0; }) && sp['impact.spark'].length > 0};
    }
    var down = hit({x: 157, y: 157, z: 300, speed: 0, hz: 0, vz: -150}), inTop = hit({x: 157, y: 157, z: 239.5, speed: 0, hz: 0, vz: -150});
    var inFace = hit({x: 152, y: 157, z: 55, speed: 0, hz: 0, vz: 150}, true);
    check('a hit on a wall\'s top throws its debris up off the top', down.spawns >= 8 && !down.off.length && down.sparksUp &&
      inTop.spawns >= 8 && !inTop.off.length && inTop.sparksUp && inFace.spawns >= 8 && !inFace.off.length,
      {need: 'top: inside the 150..165 footprint, 240 < z <= 241 (dust 242.25); face: within 1 u west of x 150', down: down, insideAtTop: inTop, insideAtFace: inFace});
  });

  // ── F2: each blocked contact emits exactly once ───────────────────────────
  if (needed('F2', ['--contact-every-substep'])) run('F2 once per contact', function () {
    // Each projectile flies in 1/60 s steps until it is consumed or expires.
    function fly(scene, v, setup) {
      authored(scene);
      if (setup) setup();
      var p = shot(v), ticks = 0;
      while (G.projectiles.indexOf(p) >= 0 && ticks < 200) { G.advanceGameClock(DT); G.updateProjectiles(DT); ticks++; }
      if (G.projectiles.indexOf(p) >= 0) throw Error('SETUP a projectile never ended');
      return {events: events.projectileContact || 0, ticks: ticks, impacts: G.impacts.length};
    }
    var got = {
      wall: fly({}, {}),
      floor: fly({wall: false}, {x: 100, z: 150, speed: 0, hz: 0, vz: -150}),
      enemy: fly({wall: false}, {}, function () { enemyAt(230, 157, 50); }),
      lob: fly({wall: false}, {isLob: true, gravZ: -200, speed: 30, hz: 30, spell: {id: 'poison', damage: 0.4, color: '#88ff44', cloudRadius: 50, cloudDuration: 4000}}),
      expiry: fly({wall: false}, {z: 200, lifeMs: 400, spawnMs: G.gameTimeNow()})
    };
    var blocked = ['wall', 'floor', 'enemy', 'lob'].every(function (k) { return got[k].events === 1 && got[k].ticks > 1 && got[k].impacts === 1; });
    check('each blocked contact emits exactly once', blocked && got.expiry.events === 0 && got.expiry.ticks > 10 && got.expiry.impacts === 0,
      {need: 'one projectileContact per blocked contact after a multi-tick flight, none for an expiry in the open', got: got});
  });

  // ── The section 9.2 table: sparks, chips and dust per contact kind ──────
  // Counts at s = 1 (Particles 25) with the camera within the LOD's near
  // distance, taken at spawn (before the first integration step).
  var TABLE = {wall: [6, 5, 1, 0], ore: [8, 6, 1, 0], floor: [3, 3, 2, 0], cap: [3, 3, 2, 0], ceiling: [6, 2, 1, 0], lob: [3, 0, 2, 0],
    enemy: [4, 0, 0, 0], spawner: [5, 4, 0, 0], slimeWall: [0, 0, 0, 3], slimeOre: [0, 0, 0, 3], slimeEnemy: [0, 0, 0, 0]};
  var SLIME = {id: 'slime', color: '#63c25c', damage: 1, isNpc: true, isCompanion: true, npcKnockback: 0};
  var POISON = {id: 'poison', damage: 0.4, color: '#88ff44', cloudRadius: 50, cloudDuration: 4000};
  var CONTACTS = {
    wall: {scene: {camX: 135}, v: {}},
    ore: {scene: {camX: 135}, v: {}, setup: function () { G.oreVeins = [{gx: WALL[0], gy: WALL[1], hp: 3, veinType: 'gold', side: 'west'}]; }},
    floor: {scene: {wall: false, camX: 90}, v: {x: 100, z: 150, speed: 0, hz: 0, vz: -150}},
    cap: {scene: {kind: 'cave', wall: false, camX: 90}, v: {x: 100, z: 180, speed: 0, hz: 0, vz: -150, renderFloorZ: 125}},
    ceiling: {scene: {kind: 'cave', wall: false, camX: 90, under: true}, v: {x: 100, speed: 1, hz: 1, vz: 200, underground: true}},
    lob: {scene: {wall: false, camX: 40}, v: {isLob: true, gravZ: -200, speed: 30, hz: 30, spell: POISON}},
    enemy: {scene: {wall: false, camX: 180}, v: {}, setup: function () { enemyAt(230, 157, 50); }},
    spawner: {scene: {wall: false, camX: 140}, v: {}, setup: function () { G.enemySpawners = [{x: 190, y: 157, active: true, hp: 5}]; }},
    slimeWall: {scene: {camX: 135}, v: {spell: SLIME, r: 4}},
    // A slime bolt into a gold vein: companions never mine (10-combat.js), so no ore debris.
    slimeOre: {scene: {camX: 135}, v: {spell: SLIME, r: 4}, setup: function () { G.oreVeins = [{gx: WALL[0], gy: WALL[1], hp: 3, veinType: 'gold', side: 'west'}]; }},
    slimeEnemy: {scene: {wall: false, camX: 180}, v: {spell: SLIME, r: 4}, setup: function () { enemyAt(230, 157, 50); }}
  };
  // One contact of `name` (or `repeat` in a row, one tick apart, in one
  // state: later serials), with the spawns of each merged.
  function contact(name, repeat) {
    var c = CONTACTS[name], S = authored(c.scene), sp = null;
    for (var t = 0; t < (repeat || 1); t++) {
      if (c.setup) c.setup();
      shot(c.v);
      var one = spawnsOf(S, function () { G.updateProjectiles(1); });
      if (events.projectileContact !== t + 1) throw Error('SETUP the ' + name + ' shot made ' + (events.projectileContact || 0) + ' contacts');
      if (!sp) sp = one; else DEBRIS.forEach(function (id) { sp[id] = sp[id].concat(one[id]); });
    }
    return {S: S, sp: sp};
  }
  // A garrison ally at (140, 200) strikes an enemy at (160, 200) through the
  // real npcUpdateAction; the camera is 15 u from the strike (inside every
  // debris recipe's LOD near distance), facing it.
  var ALLY_AT = [140, 200], FOE_AT = [160, 200];
  function allyStrike(scene) {
    var S = authored(scene || {wall: false, camX: 153, camY: 185, camAng: Math.PI / 2});
    var T = enemyAt(FOE_AT[0], FOE_AT[1], 50);
    var A = {x: ALLY_AT[0], y: ALLY_AT[1], z: 0, health: 6, maxHealth: 6, attackRange: 28, attackDamage: 1, attackCooldown: 1000, lastAttackMs: 0, vx: 0, vy: 0};
    G.fortressAllies = [A]; G.npcEnsure(A, 'garrison');
    var sp = spawnsOf(S, function () {
      G.advanceGameClock(DT);
      G.npcUpdateAction(A, T, {range: 28, windupMs: 0, cooldownMs: 1000, melee: true}, G.gameTimeNow(), G.commitGarrisonStrike);
    });
    if (A.npc.commits !== 1) throw Error('SETUP the garrison strike did not commit (' + A.npc.commits + ')');
    return {S: S, sp: sp, feet: G.entityFeetSpatialZ(T)};
  }
  var TABLE_GOT = {};
  if (needed('table', ['--chips-on-enemy', '--companion-mines-ore', '--melee-no-dust', '--melee-spark-count', '--melee-spark-feet', '--melee-at-attacker']))
    run('section 9.2 table', function () {
    var off = [];
    Object.keys(TABLE).forEach(function (name) {
      var sp = contact(name).sp, c = counts(sp), want = TABLE[name];
      TABLE_GOT[name] = c;
      if (c.spark !== want[0] || c.chip !== want[1] || c.dust !== want[2] || c.slimeSplat !== want[3] || c.melee !== 0) off.push({kind: name, want: want, got: c});
    });
    // The melee row (sections 9.2 and 4.4): 4 melee sparks at the torso of
    // a point 0.65 of the way from attacker to target (h = 66: feet + 29.7),
    // one dust puff at the target's feet (within its 1.5 u sphere), nothing else.
    var m = allyStrike(), c = counts(m.sp), px = ALLY_AT[0] + 0.65 * (FOE_AT[0] - ALLY_AT[0]), py = ALLY_AT[1] + 0.65 * (FOE_AT[1] - ALLY_AT[1]);
    var sparksAt = m.sp['melee.spark'].filter(function (q) { return Math.hypot(q.x - px, q.y - py) < 0.01 && Math.abs(q.z - (m.feet + 0.45 * 66)) < 0.01; }).length;
    var dustAt = m.sp['impact.dust'].filter(function (q) { return Math.hypot(q.x - px, q.y - py, q.z - m.feet) <= 1.5 + 1e-9; }).length;
    var melee = {sparks: c.melee, sparksAtTorso: sparksAt, dust: c.dust, dustAtFeet: dustAt, other: c.spark + c.chip + c.slimeSplat,
      sparkAt: m.sp['melee.spark'].slice(0, 1).map(function (q) { return [r3(q.x), r3(q.y), r3(q.z)]; })[0] || null, feet: r3(m.feet)};
    if (!(melee.sparks === 4 && sparksAt === 4 && melee.dust === 1 && dustAt === 1 && melee.other === 0)) off.push({kind: 'melee', want: '4 sparks at (153, 200, feet + 29.7), 1 dust at the feet', got: melee});
    check('each contact kind throws its section 9.2 sparks, chips and dust', !off.length, {off: off});
  });

  // ── Where debris starts: the struck surface, on the shooter's side ───────
  if (needed('surfaces', ['--terrain-spawn-at-centre', '--lob-spawn-centre', '--body-spawn-at-centre'])) run('struck surfaces', function () {
    // Authored surfaces: the floor at 0 and the roof (cap) at 125; the cave
    // ceiling at 100 (4 H) struck from below; the lob's landing floor at 0;
    // the enemy's and spawner's hit envelopes, radius 28 about x 230 and 25
    // about x 190 (10-projectile-queries.js), struck head-on from the west.
    // Sparks and chips start within 1 u of the surface, dust within its
    // 1.5 u sphere of that 0.75 u point, always on the shooter's side.
    var SURF = {floor: {axis: 'z', at: 0, side: 1}, cap: {axis: 'z', at: 125, side: 1}, ceiling: {axis: 'z', at: 100, side: -1},
      lob: {axis: 'z', at: 0, side: 1}, enemy: {axis: 'x', at: 230 - 28, side: -1}, spawner: {axis: 'x', at: 190 - 25, side: -1}};
    var off = [], seen = {};
    Object.keys(SURF).forEach(function (name) {
      var s = SURF[name], sp = contact(name).sp, n = 0;
      DEBRIS.forEach(function (id) {
        sp[id].forEach(function (q) {
          var d = (q[s.axis] - s.at) * s.side, reach = id === 'impact.dust' ? 2.25 : 1;
          n++;
          if (!(d > 0 && d <= reach + 1e-9) && off.length < 6) off.push({kind: name, id: id, got: r3(q[s.axis]), surface: s.at});
        });
      });
      seen[name] = n;
    });
    check('each contact kind\'s debris starts at the struck surface, on the shooter\'s side', !off.length && Object.keys(seen).every(function (k) { return seen[k] >= 2; }),
      {off: off, spawns: seen});
  });

  // ── F3: enemy hits spark but throw no chips ───────────────────────────────
  if (needed('F3', ['--chips-on-enemy'])) run('F3 bodies', function () {
    var enemy = counts(contact('enemy').sp), wall = counts(contact('wall').sp);
    check('enemy hits spark but throw no chips', enemy.spark > 0 && enemy.chip === 0 && wall.chip > 0, {enemy: enemy, wall: wall});
  });

  // ── F4: chips come to rest on the sloped floor ────────────────────────────
  if (needed('F4', ['--chips-ignore-floor'])) run('F4 slope', function () {
    var S = authored({kind: 'ramp', wall: false, camX: 150, camY: 170}), seen = {}, below = [], shots = [[165, 150], [185, 170], [205, 190], [175, 200]];
    shots.forEach(function (q) { shot({x: q[0], y: q[1], z: q[0] * TAN20 + 100, speed: 0, hz: 0, vz: -150}); });
    G.updateProjectiles(1);
    if (events.projectileContact !== 4) throw Error('SETUP the ramp shots made ' + events.projectileContact + ' contacts');
    for (var k = 0; k < 120; k++) {
      G.updateEffects(DT);
      byRecipe(S, 'impact.chip').forEach(function (i) {
        var s = seen[S.seedA[i]] || (seen[S.seedA[i]] = {rest: null}), gap = S.z[i] - S.x[i] * TAN20;
        if (gap < -0.5) below.push({tick: k, x: r3(S.x[i]), gap: r3(gap)});
        if ((S.flags[i] & 1) && !s.rest) s.rest = r3(gap);
      });
    }
    var keys = Object.keys(seen), rested = keys.filter(function (s) { return seen[s].rest !== null; }).map(function (s) { return seen[s].rest; });
    var offRest = rested.filter(function (g) { return Math.abs(g) > 0.5; });
    check('chips come to rest on the sloped floor', keys.length >= 8 && rested.length >= 6 && !below.length && !offRest.length,
      {tolerance: 0.5, chips: keys.length, rested: rested.length, restGaps: rested, below: below.length, firstBelow: below[0] || null});
  });

  // ── Steep hillsides: debris leaves the struck slope ──────────────────────
  if (needed('hillside', ['--floor-normal-up'])) run('hillside', function () {
    // Authored hillsides rising in +x from x = 40 (z = (x - 40) tan a), hit
    // by a level missile ('floor' contacts): every spark, chip and dust puff
    // starts above the plane and moves away from it (velocity along the
    // plane's normal (-sin a, 0, cos a) positive), and the sparks live on
    // (0.15 s at least) instead of dying in the hill. Controls: a 45 degree
    // hill (reflected straight up) and a vertical shot onto flat ground. A
    // grazing hit (under about 35 degrees) may still spray some sparks back
    // into the slope: reflection plus the recipe's 0.7 rad spread, as on flat
    // ground.
    function hill(deg, v) {
      var S = authored({wall: false, camX: 20, camY: 157}), a = deg * Math.PI / 180, t = Math.tan(a), n = [-Math.sin(a), 0, Math.cos(a)];
      for (var y = 0; y < MW; y++) for (var x = 0; x < MW; x++) G.floorMesh.l0TopZ[y * MW + x] = Math.max(0, (x * GS - 40) * t) / 25;
      G.buildWalkCandZ(G.floorMesh);
      G.pos.floorZ = 60; G.cam.z = 60;
      shot(v);
      var sp = spawnsOf(S, function () { G.updateProjectiles(1); }), into = [], below = [], all = 0;
      if (events.projectileContact !== 1) throw Error('SETUP the hillside shot made ' + (events.projectileContact || 0) + ' contacts');
      DEBRIS.forEach(function (id) {
        sp[id].forEach(function (q) {
          all++;
          if (q.vx * n[0] + q.vy * n[1] + q.vz * n[2] <= 0) into.push(id);
          if (!(q.z > Math.max(0, (q.x - 40) * t))) below.push(id);
        });
      });
      var alive = [];
      for (var k = 0; k < 6; k++) { G.updateEffects(DT); alive.push(byRecipe(S, 'impact.spark').length); }
      return {deg: deg, contact: [r3(G.impacts[0].x), r3(G.impacts[0].z)], spawns: all, sparks: sp['impact.spark'].length, intoHill: into, belowPlane: below, sparksAlive: alive};
    }
    var steep = hill(60, {x: 20, y: 157, z: 45}), half = hill(45, {x: 20, y: 157, z: 45}), flat = hill(0, {x: 100, z: 150, speed: 0, hz: 0, vz: -150});
    function ok(h) { return h.spawns >= 6 && h.sparks >= 3 && !h.intoHill.length && !h.belowPlane.length && h.sparksAlive[5] === h.sparks; }
    check('debris from a steep hillside hit leaves the slope', ok(steep) && ok(half) && ok(flat),
      {need: 'every spawn above the plane moving off it; all sparks alive 6 ticks later', steep: steep, deg45: half, flat: flat});
  });

  // ── F4b: debris in a cave lands in its own stratum ───────────────────────
  if (needed('F4b', ['--chips-surface-stratum', '--sparks-surface-stratum', '--dust-surface-stratum'])) run('F4b strata', function () {
    // A ceiling hit (99 u, under the 125 u roof): its chips fall to the cave
    // floor (0); its sparks fly down through the cave, still alive a tick
    // later and never above the ceiling (100); its dust stays under the
    // ceiling, within 15 u of it (a puff drifts at most 6 u: 18 u/s against
    // drag 3). A hit on the roof above: its chips rest on the cap (125), its
    // sparks fly above it and its dust stays on it.
    function settle(name) {
      var c = contact(name), S = c.S, rests = [], low = Infinity, sparks = [], sparkZ = [Infinity, -Infinity], dustZ = [Infinity, -Infinity];
      for (var k = 0; k < 90; k++) {
        G.updateEffects(DT);
        byRecipe(S, 'impact.chip').concat(byRecipe(S, 'impact.chipFall')).forEach(function (i) { if (S.flags[i] & 1) rests.push(r3(S.z[i])); if (S.z[i] < low) low = S.z[i]; });
        var sp = byRecipe(S, 'impact.spark');
        if (k < 3) sparks.push(sp.length);
        sp.forEach(function (i) { sparkZ[0] = Math.min(sparkZ[0], S.z[i]); sparkZ[1] = Math.max(sparkZ[1], S.z[i]); });
        byRecipe(S, 'impact.dust').forEach(function (i) { dustZ[0] = Math.min(dustZ[0], S.z[i]); dustZ[1] = Math.max(dustZ[1], S.z[i]); });
      }
      var uniq = {};
      rests.forEach(function (z) { uniq[z] = 1; });
      return {rests: Object.keys(uniq).map(Number), lowest: r3(low), sparksSpawned: c.sp['impact.spark'].length, sparksAlive: sparks,
        sparkZ: sparkZ.map(r3), dust: c.sp['impact.dust'].length, dustZ: dustZ.map(r3)};
    }
    var ceiling = settle('ceiling'), cap = settle('cap');
    check('debris in a cave lands in its own stratum', ceiling.rests.length >= 1 && ceiling.rests.every(function (z) { return Math.abs(z) <= 0.5; }) &&
      cap.rests.length >= 1 && cap.rests.every(function (z) { return Math.abs(z - 125) <= 0.5; }) && cap.lowest >= 124.5,
      {need: 'ceiling chips rest at 0, roof chips at 125', ceiling: {rests: ceiling.rests, lowest: ceiling.lowest}, cap: {rests: cap.rests, lowest: cap.lowest}});
    function sparksOk(s, lo, hi) { return s.sparksSpawned >= 3 && s.sparksAlive[1] === s.sparksSpawned && s.sparkZ[0] >= lo && s.sparkZ[1] <= hi; }
    function dustOk(s, lo, hi) { return s.dust >= 1 && s.dustZ[0] >= lo && s.dustZ[1] <= hi; }
    check('sparks and dust fly and settle in their own stratum', sparksOk(ceiling, 0, 100) && sparksOk(cap, 125, Infinity) &&
      dustOk(ceiling, 85, 100) && dustOk(cap, 125, 140),
      {need: 'every spark alive a tick later; ceiling sparks under 100, roof ones over 125; ceiling dust 85..100, roof dust 125..140',
        ceiling: {sparksSpawned: ceiling.sparksSpawned, sparksAlive: ceiling.sparksAlive, sparkZ: ceiling.sparkZ, dust: ceiling.dust, dustZ: ceiling.dustZ},
        cap: {sparksSpawned: cap.sparksSpawned, sparksAlive: cap.sparksAlive, sparkZ: cap.sparkZ, dust: cap.dust, dustZ: cap.dustZ}});
  });

  // ── F5: ore hits use the ore's colours ───────────────────────────────────
  var ORE = {gold: [hex('#c8a000'), hex('#ffe066')], teal: [hex('#00a89a'), hex('#00ddc8')]};   // the ore painter's literals
  if (needed('F5', ['--ore-after-splice'])) run('F5 ore', function () {
    function oreHit(type, hp) {
      var S = authored({camX: 135});
      if (type) G.oreVeins = [{gx: WALL[0], gy: WALL[1], hp: hp, veinType: type, side: 'west'}];
      shot();
      var sp = spawnsOf(S, function () { G.updateProjectiles(1); });
      var chips = sp['impact.chip'].map(function (q) { return q.pal; });
      return {chips: chips.length, colours: chips.map(function (c) { return '#' + ('00000' + c.toString(16)).slice(-6); }),
        veinsLeft: G.oreVeins.length, coins: G.coinDrops.length, sparks: sp['impact.spark'].length};
    }
    var wallRGB = G.BIOME_PALETTE.ground.wallBaseRGB, wall = (wallRGB[0] << 16) | (wallRGB[1] << 8) | wallRGB[2];
    var teal = oreHit('teal', 1), gold = oreHit('gold', 2), bare = oreHit(null, 0);
    if (teal.veinsLeft !== 0 || teal.coins < 3) throw Error('SETUP the one-hp teal vein was not mined out by the hit');
    function all(list, allowed) { return list.chips > 0 && list.colours.every(function (c) { return allowed.indexOf(hex(c)) >= 0; }); }
    check('ore hits use the ore\'s colours', all(teal, ORE.teal) && all(gold, ORE.gold) && all(bare, [wall]) && gold.veinsLeft === 1 && teal.sparks === 8 && bare.sparks === 6,
      {need: 'teal ' + ORE.teal.map(function (c) { return c.toString(16); }) + ', gold ' + ORE.gold.map(function (c) { return c.toString(16); }) + ', bare wall ' + wall.toString(16),
        splicedTeal: teal, gold: gold, bareWall: bare});
  });

  // ── Colours: sparks in the spell's light and core, chips in the surface's ─
  if (needed('colours', ['--spark-flat-colour', '--floor-chips-wall-colour', '--wall-dust-floor-colour'])) run('debris colours', function () {
    function mat(name) { var m = G.GAME_MATERIALS[name].hex; return [hex(m.light), hex(m.core)]; }
    function colours(name, ids) {
      var out = {}, sp = contact(name, 4).sp;
      [].concat(ids).forEach(function (id) { sp[id].forEach(function (q) { out[q.pal.toString(16)] = 1; }); });
      return Object.keys(out).map(function (c) { return parseInt(c, 16); });
    }
    function within(list, allowed, both) { return list.length > 0 && list.every(function (c) { return allowed.indexOf(c) >= 0; }) && (!both || list.length === 2); }
    var missile = colours('wall', 'impact.spark'), lob = colours('lob', 'impact.spark'), splat = colours('slimeWall', 'impact.slimeSplat');
    var band = G.BIOME_PALETTE.ground.floorBands[5], floor = colours('floor', 'impact.chip'), wallRGB = G.BIOME_PALETTE.ground.wallBaseRGB;
    var stone = G.GAME_MATERIALS.caveStone.hex, ceiling = colours('ceiling', ['impact.chip', 'impact.chipFall']);
    check('sparks take the spell\'s light and core colours', within(missile, mat('missileMagic'), true) && within(lob, mat('venomMagic'), true) &&
      within(splat, mat('slimeMagic'), true), {missile: missile.map(String), lob: lob.map(String), splat: splat.map(String),
        want: {missile: mat('missileMagic'), venom: mat('venomMagic'), slime: mat('slimeMagic')}});
    var spawner = colours('spawner', 'impact.chip');                  // the spawner's legacy bone colour (10-combat.js)
    check('chips take the struck surface\'s colour', within(floor, [hex(band)]) && within(ceiling, [hex(stone.base)]) &&
      within(spawner, [hex('#3a1520')]) && hex(band) !== ((wallRGB[0] << 16) | (wallRGB[1] << 8) | wallRGB[2]),
      {floor: floor.map(String), wantFloor: hex(band), ceiling: ceiling.map(String), wantCeiling: hex(stone.base), spawner: spawner.map(String)});
    // Dust: a wall's (and an ore vein's) in the wall's rock colour, the cave
    // ceiling's in the cave stone, the floor's in its floor band. In the
    // ground biome the floor band is grass green, far from the wall's brown.
    var wall = (wallRGB[0] << 16) | (wallRGB[1] << 8) | wallRGB[2];
    var dust = {wall: colours('wall', 'impact.dust'), ore: colours('ore', 'impact.dust'), ceiling: colours('ceiling', 'impact.dust'), floor: colours('floor', 'impact.dust')};
    check('dust takes the struck surface\'s colour', within(dust.wall, [wall]) && within(dust.ore, [wall]) && within(dust.ceiling, [hex(stone.base)]) &&
      within(dust.floor, [hex(band)]), {wall: dust.wall.map(String), ore: dust.ore.map(String), ceiling: dust.ceiling.map(String), floor: dust.floor.map(String),
        want: {wall: wall, ceiling: hex(stone.base), floor: hex(band)}});
  });

  // ── Debris shows in 3D and in 2D ──────────────────────────────────────────
  if (needed('views', ['--debris-far-side'])) run('3D and 2D', function () {
    // The camera 60 u short of the wall face (and of the ore vein in it),
    // 110 u short of a floor hit (the nearest ground its view reaches from
    // eye height 60) and 104 u short of an enemy hit, facing them.
    function view(setup, v, at) {
      var S = authored({camX: 90, wall: at !== 'open'});
      if (setup) setup();
      shot(v); G.updateProjectiles(1); G.updateEffects(DT); G.updateEffects(DT);
      var d3 = frame(), three = {sparks: lines(d3, 'fxCombat3D'), chips: triangles(d3, 'fxCombat3D'), puffs: images(d3, 'fxCombat3D')};
      var hx = G.impacts.length ? G.impacts[0].x : 150;
      G.MODE3D = false; G.viewCam = {x: hx - G.canvas.width / 2, y: 157 - G.canvas.height / 2};
      var d2 = frame(), two = {sparks: lines(d2, 'fx2D'), chips: dots(d2, 'fx2D'), puffs: images(d2, 'fx2D')};
      G.MODE3D = true;
      return {live: debrisCount(S), threeD: three, twoD: two};
    }
    var got = {wall: view(null, {}), ore: view(function () { G.oreVeins = [{gx: WALL[0], gy: WALL[1], hp: 3, veinType: 'teal', side: 'west'}]; }, {}),
      floor: view(null, {x: 200, z: 150, speed: 0, hz: 0, vz: -150}, 'open'), enemy: view(function () { enemyAt(230, 157, 50); }, {}, 'open')};
    function full(g) { return g.threeD.sparks >= 2 && g.threeD.chips >= 2 && g.threeD.puffs >= 1 && g.twoD.sparks >= 2 && g.twoD.chips >= 2 && g.twoD.puffs >= 1; }
    check('wall, ore, floor and enemy hit debris shows in 3D and in 2D', full(got.wall) && full(got.ore) && full(got.floor) && got.enemy.threeD.sparks >= 2 && got.enemy.twoD.sparks >= 2 &&
      rec.blurSets === 0, {need: 'sparks, chips and dust (sparks only on the enemy) drawn in both views', got: got, blur: rec.blurSets});
  });

  // ── F6: melee sparks once per committed strike ───────────────────────────
  var SPARK = [rgbText(hex('#fff1c8'))], GOLD = hex('#c8a028');
  if (needed('F6', ['--emit-on-windup', '--melee-spark-source', '--melee-front-for-all'])) run('F6 melee', function () {
    var S = authored({wall: false, camX: 60});
    // An enemy 20 u ahead of the player (reach 24), a garrison ally 20 u from
    // an enemy (reach 28) and a tower 60 u from another (a ranged commit).
    var E = enemyAt(80, 157, 10), T = enemyAt(160, 200, 50), T2 = enemyAt(260, 100, 50);
    var A = {x: 140, y: 200, z: 0, health: 6, maxHealth: 6, attackRange: 28, attackDamage: 1, attackCooldown: 1000, lastAttackMs: 0, vx: 0, vy: 0};
    var W = {x: 200, y: 100, z: 0, health: 1, npcAimHeight: 40};
    G.fortressAllies = [A]; G.npcEnsure(A, 'garrison'); G.npcEnsure(W, 'tower'); W.npc.spell = Object.assign({}, G.towerSpell, {isNpc: true, ownerId: W.npc.id});
    var enemyAbility = {range: 24, windupMs: 300, cooldownMs: 900, melee: true}, allyAbility = {range: 28, windupMs: 0, cooldownMs: 1000, melee: true};
    var towerAbility = {range: 300, windupMs: 0, cooldownMs: 1500, melee: false}, commits0 = G.npcStats.commits;
    var byActor = {E: 0, A: 0, W: 0}, duringWindup = 0, colours = {}, windupTicks = 0, realEvent2 = G.fxEvent;
    G.fxEvent = function (type, actor) {
      if (type === 'meleeCommit') byActor[actor === E ? 'E' : actor === A ? 'A' : 'W']++;
      return realEvent2.apply(G, arguments);
    };
    try {
      for (var k = 0; k < 150; k++) {
        G.advanceGameClock(DT);
        var now = G.gameTimeNow(), before = byActor.E, commitsE = E.npc.commits;
        G.npcUpdateAction(E, G.pos, enemyAbility, now, G.npcEnemyStrike);
        if (E.attackState === 'windup') windupTicks++;
        if (byActor.E > before && E.npc.commits === commitsE) duringWindup++;       // an event with no commit this tick
        G.npcUpdateAction(A, T, allyAbility, now, G.commitGarrisonStrike);
        G.npcUpdateAction(W, T2, towerAbility, now, G.commitGuardTowerShot);
        G.updateEffects(DT);
        byRecipe(S, 'melee.spark').forEach(function (i) { colours[palRGB(S, S.pal[i]).toString(16)] = 1; });
      }
    } finally { G.fxEvent = realEvent2; }
    var total = G.npcStats.commits - commits0, melee = E.npc.commits + A.npc.commits;
    if (!(E.npc.commits >= 1 && A.npc.commits >= 2 && W.npc.commits >= 1 && windupTicks >= 10)) throw Error('SETUP the strikes did not commit (' + JSON.stringify({E: E.npc.commits, A: A.npc.commits, W: W.npc.commits, windup: windupTicks}) + ')');
    check('melee sparks once per committed strike', byActor.E === E.npc.commits && byActor.A === A.npc.commits && byActor.W === 0 &&
      byActor.E + byActor.A === melee && total === melee + W.npc.commits && duringWindup === 0 &&
      colours[hex('#fff1c8').toString(16)] === 1 && colours[GOLD.toString(16)] === 1,
      {events: byActor, commits: {enemy: E.npc.commits, garrison: A.npc.commits, tower: W.npc.commits, total: total}, duringWindup: duringWindup,
        windupTicks: windupTicks, colours: Object.keys(colours)});

    // A strike on the first-person player: the sparks show in front of the
    // camera within 0.2 s. Control: the same strike held at its source
    // (between the bodies, under the eye) draws none.
    function struck(place) {
      var S2 = authored({wall: false, camX: 60}), E2 = enemyAt(80, 157, 10), seen = [];
      if (place) G.setEffectPlacementOverride('melee.spark', place);
      try {
        var ability = {range: 24, windupMs: 0, cooldownMs: 5000, melee: true};
        G.advanceGameClock(DT); G.npcUpdateAction(E2, G.pos, ability, G.gameTimeNow(), G.npcEnemyStrike);
        if (E2.npc.commits !== 1) throw Error('SETUP the strike on the player did not commit');
        for (var j = 0; j < 12; j++) { G.updateEffects(DT); if (j % 3 === 0) seen.push(lines(frame(), 'fxCombat3D', SPARK)); }
        return {frames: seen, best: Math.max.apply(null, seen), spawned: S2.stats.spawned};
      } finally { if (place) G.setEffectPlacementOverride('melee.spark', null); }
    }
    var front = struck(null), held = struck('source');
    check('a strike on the player shows sparks in front of the camera', front.best >= 2 && held.best === 0 && held.spawned > 0,
      {need: '2 of 4 sparks drawn within 0.2 s', front: front, heldAtSource: held});

    // A fight behind the first-person camera (fortress mode): a garrison
    // ally strikes an enemy 150 u behind it. Its sparks stay between the
    // bodies (x 153, the 0.65 point) and nothing of them is drawn. Control:
    // the same strike ahead of the camera is drawn.
    function fight(camX) {
      var m = allyStrike({wall: false, camX: camX, camY: 157, camAng: 0}), seen = [];
      var at = m.sp['melee.spark'].map(function (q) { return [r3(q.x), r3(q.y), r3(q.z)]; });
      for (var j = 0; j < 12; j++) { G.updateEffects(DT); if (j % 3 === 0) seen.push(lines(frame(), 'fxCombat3D', [rgbText(GOLD)])); }
      return {sparks: at.length, atSource: at.filter(function (q) { return Math.abs(q[0] - 153) < 0.01 && q[1] === 200; }).length, first: at[0] || null,
        drawn: Math.max.apply(null, seen)};
    }
    var behind = fight(300), ahead = fight(20);
    check('a fight behind the camera keeps its sparks where it happens', behind.sparks >= 2 && behind.atSource === behind.sparks && behind.drawn === 0 &&
      ahead.atSource === ahead.sparks && ahead.drawn >= 2, {need: 'sparks at (153, 200), none drawn from behind; drawn from ahead', behind: behind, ahead: ahead});
  });

  // ── F7: the debris toggle removes debris only; Unified effects too ────────
  if (needed('F7', ['--toggle-drops-impacts', '--preset-ignores-unified', '--read-contacts-while-off'])) run('F7 toggle', function () {
    // One script of contacts (a wall, an ore vein, the floor, an enemy, a
    // lob) with Impact debris on, off, and on with Unified effects off. Off,
    // each producer call is counted and skipped before the reader runs.
    function script(toggles) {
      Object.keys(toggles).forEach(function (k) { G.setEffectToggle(k, toggles[k]); });
      var reader = G.FX_EVENT_READERS.projectileContact, reads = 0;
      G.FX_EVENT_READERS.projectileContact = function () { reads++; return reader.apply(G, arguments); };
      try {
        var S = authored({camX: 110, walls: [[WALL[0], 4]]}), refused0 = S.stats.refusedToggle, most = 0;
        G.oreVeins = [{gx: WALL[0], gy: 4, hp: 3, veinType: 'teal', side: 'west'}];
        var E = enemyAt(120, 110, 50);
        shot(); shot({y: 67}); shot({y: 110}); shot({x: 100, y: 200, z: 150, speed: 0, hz: 0, vz: -150});
        shot({x: 60, y: 230, isLob: true, gravZ: -200, speed: 30, hz: 30, spell: POISON});
        for (var k = 0; k < 60; k++) { G.advanceGameClock(DT); G.updateProjectiles(DT); G.updateEffects(DT); most = Math.max(most, debrisCount(S)); }
        var gameplay = JSON.stringify({impacts: G.impacts.map(function (im) { return [r3(im.x), r3(im.y), r3(im.z), im.lifeMs, im.spellId || null]; }),
          ores: G.oreVeins.map(function (o) { return o.hp; }), enemy: [E.health, r3(E.vx)], clouds: G.groundEffects.length, projectiles: G.projectiles.length});
        return {gameplay: gameplay, debris: most, contacts: events.projectileContact || 0, gated: S.stats.eventsGated, refused: S.stats.refusedToggle - refused0, reads: reads};
      } finally {
        G.FX_EVENT_READERS.projectileContact = reader;
        G.EFFECT_TOGGLE_DEFS.forEach(function (d) { G.setEffectToggle(d.key, d.default); });
      }
    }
    var on = script({}), off = script({fxDebris: false}), legacy = script({fxUnified: false});
    if (on.contacts !== 5 || JSON.parse(on.gameplay).ores[0] !== 2) throw Error('SETUP the F7 script made ' + on.contacts + ' contacts ' + on.gameplay);
    check('the debris toggle removes debris only', on.debris >= 10 && off.debris === 0 && off.gated + off.reads === off.contacts && off.gameplay === on.gameplay &&
      off.contacts === on.contacts, {on: {debris: on.debris, contacts: on.contacts}, off: {debris: off.debris, gated: off.gated, refused: off.refused, contacts: off.contacts},
        sameGameplay: off.gameplay === on.gameplay, onGameplay: on.gameplay, offGameplay: off.gameplay});
    check('debris follows the Unified effects switch', legacy.debris === 0 && legacy.gated === legacy.contacts && legacy.gameplay === on.gameplay,
      {unifiedOff: {debris: legacy.debris, gated: legacy.gated, contacts: legacy.contacts}, sameGameplay: legacy.gameplay === on.gameplay});
    // With the preset off the gameplay tick does no debris work per contact:
    // no reader call, nothing queued. Control: on, every contact is read.
    check('a switched-off debris preset skips the contact reader', off.reads === 0 && off.gated === off.contacts && legacy.reads === 0 && on.reads === on.contacts && on.gated === 0,
      {on: {reads: on.reads, gated: on.gated}, off: {reads: off.reads, gated: off.gated, refused: off.refused}, unifiedOff: {reads: legacy.reads, gated: legacy.gated}});
  });

  // ── The contact cap: 24 per tick, the nearest kept ───────────────────────
  if (needed('cap', ['--no-contact-cap', '--contact-cap-keeps-first', '--contact-cap-keeps-latest'])) run('contact cap', function () {
    // Thirty floor contacts in one tick (8..240 u ahead), queued farthest
    // first and then, in a fresh state, nearest first: either way the 24
    // nearest are kept and 6 dropped.
    function flood(order) {
      var S = authored({wall: false, camX: 30, camY: 180}), dist = [];
      for (var j = 0; j < 30; j++) { var d = order === 'far' ? 240 - 8 * j : 8 + 8 * j; dist.push(d); shot({x: 30 + d, y: 180, z: 120, speed: 0, hz: 0, vz: -150}); }
      G.updateProjectiles(1);
      if (events.projectileContact !== 30) throw Error('SETUP the flood made ' + events.projectileContact + ' contacts');
      var queued = [], ev = S.ev;
      for (var e = 0; e < ev.count; e++) { var k = (ev.head + e) % ev.n; if (ev.type[k] === G.FX_EVENT_CODE.projectileContact) queued.push(Math.round(ev.x[k] - 30)); }
      queued.sort(function (a, b) { return a - b; });
      var out = {queued: queued, want: dist.slice().sort(function (a, b) { return a - b; }).slice(0, 24), dropped: S.stats.contactsDropped};
      G.updateEffects(DT);
      return out;
    }
    var far = flood('far'), near = flood('near');
    function ok(f) { return JSON.stringify(f.queued) === JSON.stringify(f.want) && f.dropped === 6; }
    check('a contact flood keeps the nearest 24 contacts of the tick', ok(far) && ok(near), {farFirst: far, nearFirst: near});
  });

  // ── The cap starts again every tick ──────────────────────────────────────
  if (needed('cap ticks', ['--contact-cap-per-session'])) run('contact cap per tick', function () {
    // One floor contact per tick for 40 ticks in one state (a steady fight):
    // every tick's contact spawns its full debris (3 sparks, 3 chips, 2 dust
    // at s = 1, the camera within the LOD near distance), none is dropped.
    var S = authored({wall: false, camX: 60, camY: 180}), per = [];
    for (var t = 0; t < 40; t++) {
      shot({x: 70 + (t % 5) * 2, y: 180, z: 10, speed: 0, hz: 0, vz: -150});
      G.advanceGameClock(DT); G.updateProjectiles(DT); G.updateEffects(DT);
      per.push(newDebris(S));
    }
    if (events.projectileContact !== 40) throw Error('SETUP the steady fight made ' + events.projectileContact + ' contacts');
    check('the contact cap starts again every tick', per.every(function (n) { return n === 8; }) && S.stats.contactsDropped === 0,
      {need: '8 spawns in each of 40 ticks', spawnedPerTick: per.join(','), dropped: S.stats.contactsDropped});
  });

  // ── A tick's contacts that fit its spawn cap all spawn in it ─────────────
  if (needed('drain', ['--event-max-all-bindings'])) run('drain', function () {
    // Particles 60 (combat scale 1.5): a wall contact spawns at most
    // ceil(6 x 1.5) + ceil(5 x 1.5) + ceil(1 x 1.5) = 19 (section 9.2 row x
    // section 6.1 scale), so twenty wall contacts (380) fit the tick's spawn
    // cap of 384 and all spawn in the tick they are drained.
    try {
      var S = authored({camX: 135}), ev = S.ev;
      G.settings.particles = 60;
      for (var j = 0; j < 20; j++) shot({y: 150.4 + 0.7 * j});
      G.updateProjectiles(1);
      if (events.projectileContact !== 20) throw Error('SETUP the twenty wall shots made ' + events.projectileContact + ' contacts');
      G.updateEffects(DT);
      var left = 0;
      for (var e = 0; e < ev.count; e++) if (ev.type[(ev.head + e) % ev.n] === G.FX_EVENT_CODE.projectileContact) left++;
      var first = newDebris(S);
      check('a tick\'s contacts that fit its spawn cap all spawn in it', left === 0 && first === 380, {waiting: left, spawnedInTick: first, want: 380});
    } finally { G.settings.particles = 25; }
  });

  // ── where.spell on projectile contacts (section 15, case 1) ──────────────
  if (needed('spell', ['--contact-spell-unset'])) run('where.spell', function () {
    // The spec's frost-shard example compiled with the real compiler next to
    // the shipping table: a frost bolt into the wall throws its 4 shards
    // (the camera within the LOD near distance), a missile none; both throw
    // their chips.
    var table = G.compileFxRecipes(Object.assign({}, G.FX_RECIPE_SOURCE, {'impact.iceShard': {extends: 'impact.chip',
      trigger: {event: 'projectileContact', where: {kind: ['wall', 'floor', 'cap'], spell: ['ice']}, count: 4},
      color: {material: 'frostMagic', roles: ['core', 'light']}, lighting: 'emissive',
      render: {primitive: 'chip', size: [0.3, 0.6], alpha: [0.9, 1]}}}), G.FX_MATERIALS);
    function hit(spell) {
      authored({camX: 135});
      var S = G.fxState = G.createFxState(G.EFFECT_CONFIG.capacity, 5005, {pinned: true, compiled: table});
      shot({spell: spell});
      G.updateProjectiles(1); G.updateEffects(DT);
      if (events.projectileContact !== 1) throw Error('SETUP the ' + spell.id + ' bolt made no wall contact');
      return {spell: spell.id, shards: byRecipe(S, 'impact.iceShard').length, chips: byRecipe(S, 'impact.chip').length};
    }
    var ice = hit(G.spells.ice), missile = hit(G.spells.missile);
    check('a where.spell binding fires for its spell only', ice.shards === 4 && missile.shards === 0 && ice.chips === 5 && missile.chips === 5,
      {ice: ice, missile: missile});
  });

  // ── A hit next to the camera draws a small dust puff ─────────────────────
  if (needed('close dust', ['--dust-unclamped'])) run('close dust', function () {
    // The camera 15 u from the wall face; six hits, one every 6 ticks. No
    // puff sprite may be wider than a sixth of the canvas height (a puff,
    // not a haze over the view). Control: the puffs are drawn.
    var S = authored({camX: 135}), widest = 0, puffs = 0;
    for (var t = 0; t < 36; t++) {
      if (t % 6 === 0) { shot({y: 152 + t / 6}); G.updateProjectiles(1); }
      G.updateEffects(DT);
      frame().forEach(function (d) { if (d.stage === 'fxCombat3D' && d.kind === 'image') { puffs++; widest = Math.max(widest, d.w); } });
    }
    check('a hit next to the camera draws a small dust puff', puffs >= 6 && widest <= G.canvas.height / 6,
      {puffs: puffs, widestPx: r3(widest), limitPx: r3(G.canvas.height / 6), canvas: [G.canvas.width, G.canvas.height]});
  });

  // ── F8: debris never changes gameplay ─────────────────────────────────────
  // casting_presentation.js's own scenario scripts, reset and snapshot, run
  // on this full host twice: with a recorder standing in for fxEvent (its
  // partial host) and with the real engine. Its golden hashes and spatial
  // contracts check that this is the same replay; the gameplay hashes of the
  // two runs must be identical.
  if (needed('F8', ['--reader-writes-projectile'])) run('F8 gameplay', function () {
    var cp = slurp('tools/game/tests/casting_presentation.js');
    function between(a, b) {
      var i = cp.indexOf(a), j = cp.indexOf(b, i);
      if (i < 0 || j < 0 || cp.indexOf(a, i + 1) >= 0) throw Error('SETUP casting_presentation.js boundary ' + JSON.stringify(a));
      return cp.slice(i, j);
    }
    var config = slurp('assets/games/src/01-config-state.js');
    var spellDefinitions = config.slice(config.indexOf('var spells = {'), config.indexOf('var currentSpellIdx'));
    var body = between('  function reset() {', '  try {\n    var productionWindup');
    var factory = new Function('G', 'spellDefinitions',
      'var clock = 1000, randomCalls = 0, rng = 1234567, relicHits = [], presentationEvents = [], fxEvents = [];\n' +
      'function evaluate(text) { (0, eval)(text); }\n' +
      'function recorded(events, type) { return (events || []).filter(function (t) { return t === type; }).length; }\n' +
      body + '\nreturn {reset: reset, snapshot: snapshot, hash: hash, scenarios: scenarios, expected: expected, contracts: spatialContracts,\n' +
      '  clock: function () { return clock; }, random: function () { randomCalls++; rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; },\n' +
      '  presentation: function (spell, now) { presentationEvents.push({id: spell.id, now: now, projectileCount: G.projectiles.length, mana: G.mana}); },\n' +
      '  relic: function (damage, entity, companion) { relicHits.push([damage, entity.x, entity.y, companion]); },\n' +
      '  events: function () { return fxEvents; }, record: function (type) { fxEvents.push(type); }};');
    var saved = {castCurrentSpell: G.castCurrentSpell, _tryCastSpell: G._tryCastSpell, noteFirstPersonCast: G.noteFirstPersonCast,
      applyRelicOnHit: G.applyRelicOnHit, getEntityRenderFloorZ: G.getEntityRenderFloorZ, sampleEntitySupportRenderZ: G.sampleEntitySupportRenderZ,
      MISSILE_CAST_WINDUP_MS: G.MISSILE_CAST_WINDUP_MS, clockOrigin: G._gameClockOriginMs, elapsed: G._gameClockElapsedMs, spells: G.spells,
      spatialSimulationTick: G.spatialSimulationTick, projectileConsumedMotionTick: G.projectileConsumedMotionTick};
    function replay(engine) {
      var X = factory(G, spellDefinitions), out = {hashes: {}, outcomes: {}, events: {}, contacts: 0, debris: 0, failures: 0};
      Date.now = X.clock; Math.random = X.random;
      G.noteFirstPersonCast = X.presentation; G.applyRelicOnHit = X.relic;
      G.getEntityRenderFloorZ = function (entity) { return entity.renderFloorZ || 0; };
      G.sampleEntitySupportRenderZ = function (x, y, z) { return z; };
      G._gameClockOriginMs = null; G.spatialSimulationTick = undefined; G.projectileConsumedMotionTick = undefined;
      G.MISSILE_CAST_WINDUP_MS = 0;
      function release() { G.servicePendingMissileCasts(X.clock()); G.projectiles.forEach(function (p) { delete p._castReleaseAt; }); }
      G.castCurrentSpell = function () { saved.castCurrentSpell(); release(); };
      G._tryCastSpell = function (now) { saved._tryCastSpell(now); release(); };
      var f0 = failures();
      try {
        Object.keys(X.scenarios).forEach(function (name) {
          var S = engine ? freshFx() : null, before = eventLog.length;
          G.fxEvent = engine ? function (type) { X.record(type); if (type === 'projectileContact') out.contacts++; return realEvent.apply(G, arguments); } : X.record;
          X.reset();
          out.outcomes[name] = X.scenarios[name]() || X.snapshot(); out.hashes[name] = X.hash(out.outcomes[name]); out.events[name] = X.events().slice();
          if (engine) {                                         // after the snapshot: the queued debris spawns
            G.cam.x = G.pos.x; G.cam.y = G.pos.y; G.cam.z = 60; G.cam.fov = G.GAME_CONFIG.player.baseFov;
            G.updateEffects(DT); out.debris += debrisCount(S);
          }
        });
      } finally {
        G.fxEvent = function (type) { events[type] = (events[type] || 0) + 1; eventLog.push(type); return realEvent.apply(G, arguments); };
        Date.now = originalNow; Math.random = originalRandom;
        G.castCurrentSpell = saved.castCurrentSpell; G._tryCastSpell = saved._tryCastSpell; G.noteFirstPersonCast = saved.noteFirstPersonCast;
        G.applyRelicOnHit = saved.applyRelicOnHit; G.getEntityRenderFloorZ = saved.getEntityRenderFloorZ; G.sampleEntitySupportRenderZ = saved.sampleEntitySupportRenderZ;
        G.MISSILE_CAST_WINDUP_MS = saved.MISSILE_CAST_WINDUP_MS; G._gameClockOriginMs = saved.clockOrigin; G._gameClockElapsedMs = saved.elapsed;
        G.spatialSimulationTick = saved.spatialSimulationTick; G.projectileConsumedMotionTick = saved.projectileConsumedMotionTick;
      }
      out.failures = failures() - f0;
      out.golden = Object.keys(X.scenarios).filter(function (name) {
        return X.contracts[name] ? !X.contracts[name](out.outcomes[name], out.events[name]) : out.hashes[name] !== X.expected[name];
      });
      return out;
    }
    var recorder = replay(false), engine = replay(true);
    G.spells = saved.spells;
    var differ = Object.keys(recorder.hashes).filter(function (name) { return recorder.hashes[name] !== engine.hashes[name]; });
    check('the F8 host replays casting_presentation.js exactly (goldens and contracts)', !recorder.golden.length && Object.keys(recorder.hashes).length >= 20,
      {offGolden: recorder.golden, scenarios: Object.keys(recorder.hashes).length});
    check('debris never changes gameplay', !differ.length && engine.contacts >= 4 && engine.debris >= 10 && engine.failures === 0 && !engine.golden.length,
      {differ: differ, contacts: engine.contacts, debris: engine.debris, failures: engine.failures, offGolden: engine.golden});
  });

  check('no effect runtime failures were counted', !failures(), {failures: G.getEffectStats().failures});
  check('no frame stage threw and no console errors from the game', !stageErrors.length && !G.__debrisErrors.length,
    {stages: stageErrors.slice(0, 3), errors: G.__debrisErrors.slice(0, 3)});
  Math.random = originalRandom; Date.now = originalNow;
  output('IMPACT_DEBRIS_RESULT ' + (failed ? 'FAIL ' + failed + '/' : 'PASS ') + checked);
}());
