// Shared NPC contracts. Profiles select capabilities; renderers keep their
// existing actor shapes. Only fixed simulation updates may call these helpers.
var NPC_PROFILES = {
  enemy: {faction:'hostile',targetable:true,thinkMs:100,meleeReach:4,memoryMs:3000,
    traits:{patrol:true,pursue:true,melee:true,navigation:true,remember:true}},
  slime: {faction:'party',targetable:false,invulnerable:true,thinkMs:100,memoryMs:0,
    traits:{followOwner:true,orbit:true,ranged:true,catchUp:true,navigation:true}},
  garrison: {faction:'party',targetable:true,thinkMs:100,memoryMs:3000,
    traits:{followOwner:true,pursue:true,melee:true,catchUp:true,navigation:true,remember:true}},
  tower: {faction:'party',targetable:false,thinkMs:100,memoryMs:0,traits:{stationary:true,ranged:true}}
};
var npcStats = {decisions:0,candidates:0,sightTests:0,moves:0,actions:0,commits:0,invalidations:0};
var _npcNextId = 1;

function resetNpcSystem() {
  _npcNextId=1;
  Object.keys(npcStats).forEach(function(key){npcStats[key]=0;});
  if(typeof resetNpcNavigation==='function')resetNpcNavigation();
}

function npcEnsure(actor,role) {
  if (actor.npc) return actor.npc;
  var saved=actor.npcSaved;
  var profile=actor.npcProfile || (actor.enemyType && actor.enemyType.npcProfile) ||
    (saved && saved.profile) || role;
  if (!NPC_PROFILES[profile] || !(NPC_PROFILES[profile].thinkMs>0))throw Error('Unknown/invalid NPC profile: '+profile);
  var id=saved && Number.isFinite(saved.id)?saved.id:_npcNextId++;
  _npcNextId=Math.max(_npcNextId,id+1);
  actor.npc={id:id,role:profile,target:null,seen:null,pursuitGoal:null,nextThinkAt:0,state:'idle',
    attackTargetId:saved?saved.attackTargetId:null,commits:0};
  delete actor.npcSaved;
  return actor.npc;
}

function npcSnapshot(actor) {
  var n=npcEnsure(actor,'enemy');
  return {id:n.id,profile:n.role,attackTargetId:n.attackTargetId};
}

function npcHasTrait(actor,name) {
  var n=actor.npc;
  if(actor.npcTraits && Object.prototype.hasOwnProperty.call(actor.npcTraits,name))return !!actor.npcTraits[name];
  return !!(n && NPC_PROFILES[n.role].traits[name]);
}

function npcMarkState(actor,state) { if(actor.npc) actor.npc.state=state; }

function npcForgetTarget(actor) {
  var n=actor.npc;
  if(!n)return;
  n.target=null;n.seen=null;n.pursuitGoal=null;n.nextThinkAt=0;
  npcResetNavigation(actor);
}

function npcRememberTarget(actor,target,now) {
  var n=actor.npc,seen=n.seen;
  if(!seen)seen=n.seen={};
  // Store immutable observed world coordinates. A target's current hidden pose
  // must never leak into steering, including between perception decisions.
  seen.targetId=target===pos?0:target.npc.id;seen.targetRef=target;
  seen.worldX=target.x+windowOriginX;seen.worldY=target.y+windowOriginY;
  seen.feetZ=target===pos?playerFeetSpatialZ():entityFeetSpatialZ(target);
  seen.aimZ=npcAimPoint(target).z;
  seen.observedAt=now;seen.expiresAt=now+(NPC_PROFILES[n.role].memoryMs||0);
}

function npcPursuitGoal(actor,now) {
  var n=actor.npc,seen=n && n.seen;
  if(!seen)return null;
  if(!npcTargetPresent(actor,seen.targetRef)) {npcForgetTarget(actor);return null;}
  var remembered=n.target!==seen.targetRef;
  var x=seen.worldX-windowOriginX,y=seen.worldY-windowOriginY;
  if(remembered && (!npcHasTrait(actor,'remember') || now>=seen.expiresAt)) {
    npcForgetTarget(actor);return null;
  }
  if(remembered && Math.hypot(x-actor.x,y-actor.y)<=12 &&
      Math.abs(seen.feetZ-entityFeetSpatialZ(actor))<=.01) {
    // Being close on the other side of a wall is not reaching the last seen
    // location. This ray uses the stored sight height, never the hidden target.
    npcStats.sightTests++;
    if(spatialRaycast(npcAimPoint(actor),{x:x,y:y,z:seen.aimZ}).status==='clear') {
      npcForgetTarget(actor);return null;
    }
  }
  var goal=n.pursuitGoal;
  if(!goal)goal=n.pursuitGoal={};
  goal.x=x;goal.y=y;goal.feetZ=seen.feetZ;goal.targetId=seen.targetId;goal.remembered=remembered;
  return goal;
}

function npcRelationship(actor,target,role) {
  var source=NPC_PROFILES[actor.npc.role];
  if(target===pos)return source.faction==='hostile' && health>0 && !NOCLIP;
  if(!target || target===actor || !(target.health>0))return false;
  var other=NPC_PROFILES[npcEnsure(target,role).role];
  return other.targetable && source.faction!==other.faction;
}

function npcTargetPresent(actor,target) {
  if (!target || target===actor) return false;
  if (target===pos) return npcRelationship(actor,target,'player');
  if (!(target.health>0)) return false;
  // Membership is checked at use, not just acquisition: removed objects cannot
  // receive remembered attacks after despawn or window assembly.
  var enemy=enemies.indexOf(target)>=0, ally=!enemy && fortressAllies.indexOf(target)>=0;
  if (!enemy && !ally) return false;
  return npcRelationship(actor,target,enemy?'enemy':'garrison');
}

function npcAimPoint(actor) {
  var feet=actor===pos?playerFeetSpatialZ():entityFeetSpatialZ(actor);
  var height=Number.isFinite(actor.npcAimHeight)?actor.npcAimHeight:(actor.bodyHeight||70)*.5;
  return {x:actor.x,y:actor.y,z:feet+height};
}

function npcTargetValid(actor,target,range,melee) {
  return npcTargetPresent(actor,target) && npcTargetGeometry(actor,target,range,melee);
}

function npcTargetGeometry(actor,target,range,melee) {
  if (!Number.isFinite(range) || Math.hypot(target.x-actor.x,target.y-actor.y)>=range) return false;
  var a=npcAimPoint(actor),b=npcAimPoint(target);
  if (!Number.isFinite(a.z) || !Number.isFinite(b.z)) return false;
  if (melee) {
    var af=a.z-(Number.isFinite(actor.npcAimHeight)?actor.npcAimHeight:(actor.bodyHeight||70)*.5);
    var bf=target===pos?playerFeetSpatialZ():entityFeetSpatialZ(target);
    if (af>=bf+(target.bodyHeight||70) || bf>=af+(actor.bodyHeight||70)) return false;
  }
  npcStats.sightTests++;
  return spatialRaycast(a,b).status==='clear';
}

function npcDecisionDue(actor,now) {
  var n=actor.npc,period=NPC_PROFILES[n.role].thinkMs;
  if (now<n.nextThinkAt) return false;
  // Spread decisions across six physics ticks. Initial acquisition is immediate;
  // subsequent work is staggered by stable actor identity, never render count.
  var phase=(n.id%6)*period/6;
  n.nextThinkAt=Math.floor(now/period)*period+phase;
  if(n.nextThinkAt<=now+.001)n.nextThinkAt+=period;
  npcStats.decisions++;
  return true;
}

function npcSelectTarget(actor,range) {
  var start=physicsStageStart(),n=actor.npc,best=null,bestD=range*range,bestId=Infinity;
  var retained=null,retainedD=Infinity;
  try {
    var hostile=NPC_PROFILES[n.role].faction==='hostile';
    var list=hostile?fortressAllies:enemies;
    for(var i=hostile?-1:0;i<list.length;i++) {
      var target=i<0?pos:list[i];
      npcStats.candidates++;
      // The market only suppresses hostile acquisition of the player, not
      // damage from a strike already committed or defense against other units.
      if(target===pos && shopMarker && Math.hypot(pos.x-shopMarker.x,pos.y-shopMarker.y)<100)continue;
      if(!npcRelationship(actor,target,hostile?'garrison':'enemy'))continue;
      var dx=target.x-actor.x,dy=target.y-actor.y,d=dx*dx+dy*dy;
      var id=target===pos?0:target.npc.id;
      // Coordinates break initial ties even in legacy/test actors initialized
      // in a different array order. Persistent IDs break truly coincident ties.
      var tie=best && (target.x>best.x || target.x===best.x &&
        (target.y>best.y || target.y===best.y && id>=bestId));
      if(target!==n.target && (d>bestD || d===bestD && tie))continue;
      if(!npcTargetGeometry(actor,target,range,false))continue;
      if(target===n.target) {retained=target;retainedD=d;}
      if(d>bestD || d===bestD && tie)continue;
      best=target;bestD=d;bestId=id;
    }
    // Avoid changing targets for a negligible distance advantage. Never retain
    // a dead, removed, blocked, out-of-range or newly friendly recipient.
    if(retained && retained!==best && retainedD<=bestD*1.15*1.15)best=retained;
    n.target=best;
    if(best)npcRememberTarget(actor,best,gameTimeNow());
    return best;
  } finally {physicsStageEnd('npcPerception',start);}
}

function npcFindTarget(id) {
  if(id===0)return pos;
  if(id===null || id===undefined)return null;
  var lists=[enemies,fortressAllies];
  for(var l=0;l<lists.length;l++)for(var i=0;i<lists[l].length;i++) {
    var actor=lists[l][i];
    if(npcEnsure(actor,l===0?'enemy':'garrison').id===id)return actor;
  }
  return null;
}

function npcCancelAction(actor) {
  if(actor.attackState==='windup') {actor.attackState='idle';actor.attackStateUntil=0;}
  if(actor.npc)actor.npc.attackTargetId=null;
  actor._attackTarget=null;
}

function npcUpdateAction(actor,target,ability,now,commitFn) {
  var start=physicsStageStart(),n=actor.npc;
  npcStats.actions++;
  try {
    if(!actor.attackState) {
      var ready=(actor.lastAttackMs||0)+ability.cooldownMs;
      actor.attackState=ready>now?'cooldown':'idle';actor.attackStateUntil=ready;
    }
    if(actor.attackState==='cooldown' && now>=actor.attackStateUntil)actor.attackState='idle';
    if(actor.health<=0 || now<(actor.stunUntil||0)) {npcCancelAction(actor);return;}
    if(actor.attackState==='cooldown')return;
    if(actor.attackState==='windup') {
      var recipient=n.attackTargetId===0?pos:actor._attackTarget;
      if(!recipient || !recipient.npc || recipient.npc.id!==n.attackTargetId)recipient=npcFindTarget(n.attackTargetId);
      // Cheap liveness checks each tick; full spatial validation at impact.
      if(!npcTargetPresent(actor,recipient)) {npcStats.invalidations++;npcCancelAction(actor);return;}
      if(now<actor.attackStateUntil)return;
      actor.attackState='cooldown';actor.attackStateUntil=now+ability.cooldownMs;
      n.attackTargetId=null;actor._attackTarget=null;
      if(!npcTargetValid(actor,recipient,ability.range,ability.melee)) {npcStats.invalidations++;return;}
      npcStats.commits++;n.commits++;actor.lastAttackMs=now;
      commitFn(actor,recipient,now);
      return;
    }
    if(!npcTargetValid(actor,target,ability.range,ability.melee))return;
    n.attackTargetId=target===pos?0:target.npc.id;
    actor._attackTarget=target===pos?null:target;
    actor.attackState='windup';actor.attackStateUntil=now+ability.windupMs;
    if(ability.windupMs<=0) {
      actor.attackState='cooldown';actor.attackStateUntil=now+ability.cooldownMs;
      n.attackTargetId=null;actor._attackTarget=null;
      npcStats.commits++;n.commits++;actor.lastAttackMs=now;
      commitFn(actor,target,now);
    }
  } finally {physicsStageEnd('npcActions',start);}
}

function npcMoveToward(actor,x,y,speed,dt,radius,stopDistance) {
  if(gameTimeNow()<(actor.stunUntil||0))return false;
  var dx=x-actor.x,dy=y-actor.y,d=Math.hypot(dx,dy),stop=stopDistance||0;
  if(!Number.isFinite(d) || !Number.isFinite(speed) || !(dt>0) || d<=stop || speed<=0)return false;
  var start=physicsStageStart(),travel=Math.min(d-stop,speed*dt),oldX=actor.x,oldY=actor.y;
  try {
    npcStats.moves++;
    actor.facing=Math.atan2(dy,dx);
    moveSpatialActor(actor,dx/d*travel,dy/d*travel,radius);
    return actor.x!==oldX || actor.y!==oldY;
  } finally {physicsStageEnd('npcLocomotion',start);}
}
