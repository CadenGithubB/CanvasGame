// =============================================
// ARENA CHALLENGE SYSTEM
// =============================================

function startArenaChallenge(altar) {
  if (arenaChallenge) return; // already in a challenge
  var key = altar.regionX + ',' + altar.regionY;
  if (completedArenas[key]) return;
  var sc = altar.scale || 1.0;
  var ringR = CHUNK_SIZE * 1.1 * sc;
  arenaChallenge = {
    centerX: altar.x,
    centerY: altar.y,
    regionX: altar.regionX,
    regionY: altar.regionY,
    ringRadius: ringR,
    wave: 0,
    maxWaves: 3,
    state: 'spawning', // 'spawning', 'fighting', 'waveDelay', 'complete'
    waveDelayUntil: 0,
    startMs: gameTimeNow()
  };
  spawnArenaWave(arenaChallenge);
  pushToast('Arena Challenge — Wave 1/3', '#cc9944', 3000);
  console.log('[ARENA] Challenge started at region (' + altar.regionX + ',' + altar.regionY + ')');
}

function spawnArenaWave(ac) {
  ac.wave++;
  ac.state = 'fighting';
  // Wave composition: escalating difficulty
  var comp;
  if (ac.wave === 1) comp = [{type:'fast',n:3},{type:'normal',n:1}];        // 4
  else if (ac.wave === 2) comp = [{type:'fast',n:2},{type:'normal',n:3},{type:'tank',n:1}]; // 6
  else comp = [{type:'fast',n:3},{type:'normal',n:3},{type:'tank',n:2}];     // 8

  for (var ci = 0; ci < comp.length; ci++) {
    var entry = comp[ci];
    var eType = enemyTypes[entry.type];
    for (var ei = 0; ei < entry.n; ei++) {
      var angle = Math.random() * Math.PI * 2;
      var dist = 30 + Math.random() * (ac.ringRadius * 0.6);
      var ex = ac.centerX + Math.cos(angle) * dist;
      var ey = ac.centerY + Math.sin(angle) * dist;
      var wps = generatePatrolWaypoints(ex, ey, eType.chaseRange * 0.5);
      enemies.push({
        x: ex, y: ey, z: 0,
        enemyType: eType, health: eType.health, maxHealth: eType.health,
        speed: eType.speed, chaseRange: eType.chaseRange,
        lastUpdate: 0, damageFlash: 0, damageFlashColor: '#ffffff',
        slowUntil: 0, burnUntil: 0, burnDmgLast: 0,
        iceHits: 0, fireHits: 0, lightningHits: 0,
        vx: 0, vy: 0, aggroAt: 0,
        attackState: 'idle', attackStateUntil: 0,
        patrolWaypoints: wps, patrolIdx: 0, facing: 0,
        arenaEnemy: true
      });
      npcEnsure(enemies[enemies.length - 1], 'enemy');
    }
  }
  console.log('[ARENA] Wave ' + ac.wave + '/' + ac.maxWaves + ' spawned');
}

function updateArenaChallenge() {
  if (!arenaChallenge) return;
  var ac = arenaChallenge;

  // Check if player left the arena (abandon)
  var pdx = pos.x - ac.centerX, pdy = pos.y - ac.centerY;
  if (Math.hypot(pdx, pdy) > ac.ringRadius * 2.5) {
    // Despawn arena enemies
    var kept = [];
    for (var i = 0; i < enemies.length; i++) {
      if (!enemies[i].arenaEnemy) kept.push(enemies[i]);
    }
    enemies = kept;
    arenaChallenge = null;
    pushToast('Arena abandoned', '#887766', 2000);
    console.log('[ARENA] Challenge abandoned — player left arena');
    return;
  }

  if (ac.state === 'fighting') {
    // Count surviving arena enemies
    var alive = 0;
    for (var i = 0; i < enemies.length; i++) {
      if (enemies[i].arenaEnemy && enemies[i].health > 0) alive++;
    }
    if (alive === 0) {
      if (ac.wave >= ac.maxWaves) {
        // Challenge complete!
        ac.state = 'complete';
        var key = ac.regionX + ',' + ac.regionY;
        completedArenas[key] = true;
        // Drop Arcane Tome at arena center
        arcaneTomes.push({
          x: ac.centerX, y: ac.centerY,
          spawnMs: gameTimeNow(), bob: Math.random() * Math.PI * 2
        });
        pushToast('Arena Cleared! Arcane Tome dropped!', '#cc88ff', 4000);
        console.log('[ARENA] Challenge complete! Arcane Tome dropped.');
        arenaChallenge = null;
      } else {
        // Wave cleared — brief delay then next wave
        ac.state = 'waveDelay';
        ac.waveDelayUntil = gameTimeNow() + 2000;
        pushToast('Wave ' + ac.wave + ' cleared!', '#cc9944', 2000);
      }
    }
  } else if (ac.state === 'waveDelay') {
    if (gameTimeNow() >= ac.waveDelayUntil) {
      spawnArenaWave(ac);
      pushToast('Arena Challenge — Wave ' + ac.wave + '/' + ac.maxWaves, '#cc9944', 3000);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// ── Fortress Interactables: Forge, Garrison, Lectern ──
// ══════════════════════════════════════════════════════════════

function activateFortressInteract(interact) {
  var key = interact.structure.regionX + ',' + interact.structure.regionY;
  if (!completedFortresses[key]) completedFortresses[key] = {};
  if (interact.type === 'forge') activateFortressForge(interact);
  else if (interact.type === 'garrison') activateFortressGarrison(interact);
  else if (interact.type === 'lectern') activateFortressLectern(interact);
}

// ── Enchantment Forge ──
function activateFortressForge(interact) {
  // Check player has at least 2 equipped items
  var equipped = 0;
  for (var i = 0; i < EQUIP_SLOTS.length; i++) {
    if (equipment[EQUIP_SLOTS[i].key]) equipped++;
  }
  if (equipped < 2) {
    pushToast('Need at least 2 equipped items to use the forge', '#cc6633', 3000);
    return;
  }
  forgeOpen = true;
  forgeStep = 0;
  forgeSacrificeIdx = -1;
  forgeEnhanceIdx = -1;
  forgeStructure = interact;
  kbState = {up:false, down:false, left:false, right:false};
}

function forgeConfirm() {
  if (!forgeOpen) return;
  if (forgeStep === 0) {
    // Confirm sacrifice selection
    if (forgeSacrificeIdx >= 0 && equipment[EQUIP_SLOTS[forgeSacrificeIdx].key]) {
      forgeStep = 1;
      forgeEnhanceIdx = -1;
    }
  } else if (forgeStep === 1) {
    // Confirm enhance selection — execute the forge
    if (forgeEnhanceIdx >= 0 && forgeEnhanceIdx !== forgeSacrificeIdx && equipment[EQUIP_SLOTS[forgeEnhanceIdx].key]) {
      var sacrificeSlot = EQUIP_SLOTS[forgeSacrificeIdx].key;
      var enhanceSlot = EQUIP_SLOTS[forgeEnhanceIdx].key;
      var enhanceItem = equipment[enhanceSlot];
      // Destroy sacrifice
      equipment[sacrificeSlot] = null;
      // Boost quality by 0.15–0.25
      var boost = 0.15 + Math.random() * 0.10;
      var newQuality = (enhanceItem.quality || 1.0) + boost;
      equipment[enhanceSlot] = createEquipInstance(enhanceItem.id, newQuality);
      // Mark completed
      var key = forgeStructure.structure.regionX + ',' + forgeStructure.structure.regionY;
      if (!completedFortresses[key]) completedFortresses[key] = {};
      completedFortresses[key].forge = true;
      // Close forge
      forgeOpen = false;
      forgeStep = 0;
      forgeSacrificeIdx = -1;
      forgeEnhanceIdx = -1;
      goalMessage = equipment[enhanceSlot].displayName + ' enhanced!';
      goalMessageUntil = gameTimeNow() + 3000;
    }
  }
}

function forgeSelectSlot(slotIdx) {
  if (!forgeOpen || slotIdx < 0 || slotIdx >= EQUIP_SLOTS.length) return;
  if (!equipment[EQUIP_SLOTS[slotIdx].key]) return; // can't select empty slot
  if (forgeStep === 0) {
    forgeSacrificeIdx = slotIdx;
  } else if (forgeStep === 1) {
    if (slotIdx !== forgeSacrificeIdx) {
      forgeEnhanceIdx = slotIdx;
    }
  }
}

function drawForgeOverlay() {
  if (!forgeOpen) return;
  var w = canvas.width, h = canvas.height;
  var S = resScale;
  ctx.save();
  // Dark backdrop
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1.0;
  // Panel
  var panW = Math.min(280 * S, w * 0.8);
  var panH = Math.min(220 * S, h * 0.7);
  var px = Math.floor((w - panW) / 2), py = Math.floor((h - panH) / 2);
  ctx.fillStyle = 'rgba(15,10,25,0.95)';
  ctx.fillRect(px, py, panW, panH);
  ctx.strokeStyle = '#ff8800'; ctx.lineWidth = 2 * S;
  ctx.strokeRect(px, py, panW, panH);
  // Title
  ctx.fillStyle = '#ff8800';
  ctx.font = 'bold ' + Math.floor(14 * S) + 'px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Enchantment Forge', w / 2, py + 20 * S);
  // Instruction
  ctx.fillStyle = '#cccccc';
  ctx.font = Math.floor(10 * S) + 'px monospace';
  var instrText = forgeStep === 0 ? 'Select item to SACRIFICE (1-5, then E)' : 'Select item to ENHANCE (1-5, then E)';
  ctx.fillText(instrText, w / 2, py + 36 * S);
  // Equipment slots
  var slotSize = 24 * S, gap = 6 * S;
  var totalW = EQUIP_SLOTS.length * (slotSize + gap) - gap;
  var slotX0 = Math.floor((w - totalW) / 2);
  var slotY = py + 52 * S;
  for (var si = 0; si < EQUIP_SLOTS.length; si++) {
    var sd = EQUIP_SLOTS[si];
    var sx = slotX0 + si * (slotSize + gap);
    var eqItem = equipment[sd.key];
    // Background
    ctx.globalAlpha = eqItem ? 0.9 : 0.4;
    ctx.fillStyle = 'rgba(20,20,40,0.8)';
    ctx.fillRect(sx, slotY, slotSize, slotSize);
    // Highlight
    if (si === forgeSacrificeIdx) {
      ctx.strokeStyle = '#ff3333'; ctx.lineWidth = 2.5 * S;
      ctx.strokeRect(sx - 1, slotY - 1, slotSize + 2, slotSize + 2);
    } else if (si === forgeEnhanceIdx && forgeStep === 1) {
      ctx.strokeStyle = '#ffdd00'; ctx.lineWidth = 2.5 * S;
      ctx.strokeRect(sx - 1, slotY - 1, slotSize + 2, slotSize + 2);
    } else {
      ctx.strokeStyle = eqItem ? (RARITY_COLORS[eqItem.rarity] || '#888') : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1 * S;
      ctx.strokeRect(sx, slotY, slotSize, slotSize);
    }
    // Icon
    ctx.globalAlpha = 1.0;
    if (eqItem) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.floor(12 * S) + 'px Arial'; ctx.textAlign = 'center';
      ctx.fillText(sd.icon, sx + slotSize / 2, slotY + slotSize - 5 * S);
    }
    // Number label
    ctx.fillStyle = '#888'; ctx.font = Math.floor(8 * S) + 'px monospace'; ctx.textAlign = 'center';
    ctx.fillText('' + (si + 1), sx + slotSize / 2, slotY + slotSize + 10 * S);
  }
  // Item info
  var infoY = slotY + slotSize + 20 * S;
  ctx.textAlign = 'center';
  if (forgeSacrificeIdx >= 0) {
    var sacItem = equipment[EQUIP_SLOTS[forgeSacrificeIdx].key];
    if (sacItem) {
      ctx.fillStyle = '#ff3333'; ctx.font = 'bold ' + Math.floor(10 * S) + 'px monospace';
      ctx.fillText('SACRIFICE: ' + (sacItem.displayName || sacItem.name), w / 2, infoY);
      infoY += 14 * S;
    }
  }
  if (forgeStep === 1 && forgeEnhanceIdx >= 0) {
    var enhItem = equipment[EQUIP_SLOTS[forgeEnhanceIdx].key];
    if (enhItem) {
      ctx.fillStyle = '#ffdd00'; ctx.font = 'bold ' + Math.floor(10 * S) + 'px monospace';
      ctx.fillText('ENHANCE: ' + (enhItem.displayName || enhItem.name), w / 2, infoY);
      infoY += 14 * S;
      var curQ = Math.round((enhItem.quality || 1.0) * 100);
      ctx.fillStyle = '#aaaaaa'; ctx.font = Math.floor(9 * S) + 'px monospace';
      ctx.fillText('Quality ' + curQ + '% → ~' + (curQ + 20) + '%', w / 2, infoY);
    }
  }
  // ESC hint
  ctx.fillStyle = '#666'; ctx.font = Math.floor(9 * S) + 'px monospace'; ctx.textAlign = 'center';
  ctx.fillText('[ESC] Cancel', w / 2, py + panH - 8 * S);
  ctx.restore();
}

// ── Garrison Allies ──
function activateFortressGarrison(interact) {
  var key = interact.structure.regionX + ',' + interact.structure.regionY;
  if (!completedFortresses[key]) completedFortresses[key] = {};
  completedFortresses[key].garrison = true;
  var _allyNames = ['Aldric', 'Sera', 'Borin', 'Mira', 'Thane', 'Lysa', 'Edric', 'Vorn'];
  // Spawn 2 soldier allies near the interact point
  for (var gi = 0; gi < 2; gi++) {
    var ang = gi * Math.PI + Math.random() * 0.5;
    var _aName = _allyNames[Math.floor(Math.random() * _allyNames.length)];
    fortressAllies.push({
      x: interact.x + Math.cos(ang) * 20,
      y: interact.y + Math.sin(ang) * 20,
      z: 0,
      health: 6, maxHealth: 6,
      speed: 42,
      attackRange: 28,
      attackDamage: 12,
      attackCooldown: 1000,
      lastAttackMs: 0,
      vx: 0, vy: 0,
      followDist: 90, followIdeal: 55, teleportDist: 400,
      wanderAng: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      damageFlash: 0,
      targetEnemy: null,
      name: _aName
    });
    npcEnsure(fortressAllies[fortressAllies.length - 1], 'garrison');
    pushToast(_aName + ' has joined your party', '#aaaaff', 3000);
  }
}

function commitGarrisonStrike(ally, target, now) {
  target.health -= ally.attackDamage;
  target.damageFlash = now + 150;
  target.damageFlashColor = '#ffcc44';
  var distance = Math.hypot(target.x - ally.x, target.y - ally.y) || 1;
  target.vx = (target.vx || 0) + (target.x - ally.x) / distance * 80;
  target.vy = (target.vy || 0) + (target.y - ally.y) / distance * 80;
  ally.lastAttackMs = now;
}

function updateFortressAllies(dt) {
  var now = gameTimeNow();
  for (var ai = fortressAllies.length - 1; ai >= 0; ai--) {
    var ally = fortressAllies[ai];
    // Death check
    if (ally.health <= 0) {
      // Death effect — small explosion of particles
      for (var pi = 0; pi < 5; pi++) {
        impacts.push({x: ally.x, y: ally.y, t: gameTimeNow(), dur: 400, r: 8, color: '#c8a028', vx: (Math.random()-0.5)*60, vy: (Math.random()-0.5)*60});
      }
      var _dName = ally.name || 'Ally';
      pushToast(_dName + ' has fallen', '#cc4444', 4000);
      fortressAllies.splice(ai, 1);
      continue;
    }
    var brain = npcEnsure(ally, 'garrison');
    if (!brain.ability) brain.ability = {range:ally.attackRange, windupMs:0,
      cooldownMs:ally.attackCooldown, melee:true};
    // Damage flash decay
    if (ally.damageFlash > 0) ally.damageFlash = Math.max(0, ally.damageFlash - dt * 4);
    // Teleport if too far from player
    var dx = pos.x - ally.x, dy = pos.y - ally.y;
    var dist = Math.hypot(dx, dy);
    var ownerFeet=npcOwnerSupportZ(),otherFloor=Number.isFinite(ownerFeet) && Math.abs(ownerFeet-entityFeetSpatialZ(ally))>.01;
    if (npcHasTrait(ally, 'catchUp') && dist > ally.teleportDist) {
      if (placeSpatialActorNear(ally,pos.x+(Math.random()-.5)*40,
          pos.y+(Math.random()-.5)*40,playerFeetSpatialZ(),6)) {
        npcCancelAction(ally); npcForgetTarget(ally); brain.nextThinkAt = 0;
        ally.targetEnemy = null;
        npcMarkState(ally, 'catchUp');
      }
      continue;
    }
    if (npcDecisionDue(ally, now)) brain.target = npcHasTrait(ally, 'melee') ? npcSelectTarget(ally, 120) : null;
    if (brain.target && !npcTargetPresent(ally, brain.target)) npcForgetTarget(ally);
    ally.targetEnemy = brain.target;
    if (!npcHasTrait(ally, 'melee')) npcCancelAction(ally);
    npcUpdateAction(ally, npcHasTrait(ally, 'melee') ? brain.target : null, brain.ability, now, commitGarrisonStrike);
    if (brain.target && !npcTargetPresent(ally, brain.target)) { npcForgetTarget(ally); ally.targetEnemy = null; }
    var chaseGoal = npcPursuitGoal(ally,now);
    if (chaseGoal && npcHasTrait(ally, 'pursue')) {
      npcNavigateToward(ally,chaseGoal.x,chaseGoal.y,chaseGoal.feetZ,ally.speed,dt,6,
        chaseGoal.remembered ? 5 : ally.attackRange * 0.5);
      npcMarkState(ally, chaseGoal.remembered ? 'search' : 'pursue');
    } else if (npcHasTrait(ally, 'followOwner') && (dist > ally.followIdeal || otherFloor)) {
      // Navigate toward the supported owner, not a random offset inside a wall.
      var speed = ally.speed * (dist > ally.followDist * 1.5 ? 1.5 : 1.0);
      npcNavigateToward(ally,pos.x,pos.y,ownerFeet,speed,dt,6,otherFloor?0:ally.followIdeal*.7);
      npcMarkState(ally, 'follow');
    } else {npcResetNavigation(ally);npcMarkState(ally, 'idle');}
    if (now < (ally.stunUntil || 0)) npcMarkState(ally, 'stunned');
    // Walking phase
    ally.phase += dt * 6;
  }
}

// ── Map Reveal Lectern ──
function activateFortressLectern(interact) {
  var key = interact.structure.regionX + ',' + interact.structure.regionY;
  if (!completedFortresses[key]) completedFortresses[key] = {};
  completedFortresses[key].lectern = true;
  // Convert fortress world center to grid coords
  var fwx = interact.structure.centerWX || interact.x;
  var fwy = interact.structure.centerWY || interact.y;
  // For endless mode, convert world coords to window-local then to grid
  var localX = ENDLESS_MODE ? (fwx - windowOriginX) : fwx;
  var localY = ENDLESS_MODE ? (fwy - windowOriginY) : fwy;
  var centerGX = Math.floor(localX / cell);
  var centerGY = Math.floor(localY / cell);
  mapRevealAnim = {
    startMs: gameTimeNow(),
    centerGX: centerGX,
    centerGY: centerGY,
    revealRadius: 90,
    duration: 3000,
    prevMode: minimapMode
  };
  minimapMode = 1; // force large map
  pushToast('Ancient knowledge reveals the land...', '#88bbff', 3000);
}

function updateMapRevealAnim() {
  if (!mapRevealAnim || !exploredCells) return;
  var elapsed = gameTimeNow() - mapRevealAnim.startMs;
  if (elapsed >= mapRevealAnim.duration) {
    // Animation complete — restore minimap mode
    minimapMode = mapRevealAnim.prevMode;
    mapRevealAnim = null;
    return;
  }
  // Phase 2 (500–2500ms): progressive fog reveal
  if (elapsed > 400 && elapsed < mapRevealAnim.duration - 400) {
    var revealT = (elapsed - 400) / (mapRevealAnim.duration - 800);
    var currentR = Math.floor(revealT * mapRevealAnim.revealRadius);
    var cgx = mapRevealAnim.centerGX, cgy = mapRevealAnim.centerGY;
    var changed = false;
    for (var dy = -currentR; dy <= currentR; dy++) {
      for (var dx = -currentR; dx <= currentR; dx++) {
        if (dx * dx + dy * dy > currentR * currentR) continue;
        var gx = cgx + dx, gy = cgy + dy;
        if (gx < 0 || gy < 0 || gx >= gridW || gy >= gridH) continue;
        var idx = gy * gridW + gx;
        if (!exploredCells[idx]) { exploredCells[idx] = 1; changed = true; }
      }
    }
    if (changed) minimapDirty = true;
  }
}

function upgradeSpellToTier2(spellId) {
  var sp = spells[spellId];
  if (!sp || sp.tier >= 2) return false;
  sp.tier = 2;
  if (spellId === 'fire') {
    sp.streamRange = 180; sp.streamWidth = 0.55; sp.damage = sp.damage * 1.3;
  } else if (spellId === 'arcane') {
    sp.novaRadius = 160; sp.stunDuration = 1600;
  } else if (spellId === 'poison') {
    sp.cloudRadius = 75; sp.cloudDuration = 5000;
  } else if (spellId === 'lightning') {
    sp.speed = 300;
  }
  return true;
}

function applyArcaneTome() {
  // Try to upgrade active spell first
  var unlocked = getUnlockedSpells();
  var activeId = unlocked[currentSpellIdx] || 'missile';
  if (spells[activeId].tier < 2) {
    upgradeSpellToTier2(activeId);
    goalMessage = spells[activeId].name + ' upgraded to Tier 2!';
    goalMessageUntil = gameTimeNow() + 4000;
    console.log('[TOME] Upgraded active spell: ' + activeId + ' → Tier 2');
    return;
  }
  // Else find first unlocked spell that's still tier 1
  for (var i = 0; i < spellOrder.length; i++) {
    var sid = spellOrder[i];
    if (spells[sid].unlocked && spells[sid].tier < 2) {
      upgradeSpellToTier2(sid);
      goalMessage = spells[sid].name + ' upgraded to Tier 2!';
      goalMessageUntil = gameTimeNow() + 4000;
      console.log('[TOME] Upgraded spell: ' + sid + ' → Tier 2');
      return;
    }
  }
  // All spells maxed — 50 coins fallback
  coins += 50;
  pushToast('All spells maxed! +50 coins', '#d4a820', 3000);
  console.log('[TOME] All spells tier 2, awarded 50 coins');
}

function updateArcaneTomes() {
  arcaneTomes = updateCollectibles(arcaneTomes,
    {collectRadius: 30, vacuumRadius: 100, vacuumPull: 4.0},
    function(tome) {
      applyArcaneTome();
      for (var pi = 0; pi < 15; pi++) {
        var ang = (pi / 15) * Math.PI * 2;
        impacts.push({x: tome.x, y: tome.y, z: getEntityRenderFloorZ(tome) + 10,
          vx: Math.cos(ang) * 50, vy: Math.sin(ang) * 50, vz: 20 + Math.random() * 30,
          spawnMs: gameTimeNow(), lifeMs: 1000, color: '#bb66ff', size: 5});
      }
    });
}

function updateStatPickups() {
  statPickups = updateCollectibles(statPickups,
    {collectRadius: 25, vacuumRadius: 100, vacuumPull: 3.5},
    function(sp) {
      var spKey = Math.floor(sp.wx) + ',' + Math.floor(sp.wy);
      collectedStatPickups[spKey] = true;
      var pColor, msg;
      if (sp.type === 'heartCrystal') {
        HEALTH_MAX += 10; health = Math.min(health + 10, HEALTH_MAX);
        permanentHealthBonus += 10;
        pColor = '#ff4444'; msg = 'Heart Crystal! Max HP +10 (now ' + HEALTH_MAX + ')';
      } else if (sp.type === 'manaStar') {
        MANA_MAX += 10; mana = Math.min(mana + 10, MANA_MAX);
        permanentManaBonus += 10;
        pColor = '#4488ff'; msg = 'Mana Star! Max Mana +10 (now ' + MANA_MAX + ')';
      } else {
        permanentSpeedBonus += 0.05;
        pColor = '#44dd55'; msg = 'Movement Tome! Speed +5%';
      }
      goalMessage = msg;
      goalMessageUntil = gameTimeNow() + 4000;
      for (var pi = 0; pi < 12; pi++) {
        var ang = (pi / 12) * Math.PI * 2;
        impacts.push({x: sp.x, y: sp.y, z: getEntityRenderFloorZ(sp) + 8,
          vx: Math.cos(ang) * 45, vy: Math.sin(ang) * 45, vz: 15 + Math.random() * 25,
          spawnMs: gameTimeNow(), lifeMs: 800, color: pColor, size: 4});
      }
      console.log('[STAT] Collected ' + sp.type + ' at (' + sp.wx.toFixed(0) + ',' + sp.wy.toFixed(0) + ')');
    });
}
