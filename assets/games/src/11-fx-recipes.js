// Particle recipes (unified effects V1): effect materials, the name tables the
// recipe compiler validates against, the recipe table and its compiler.
// Recipes are backend-neutral data (world units, material roles, primitive
// names). compileFxRecipes validates every key, enum, range, role, event and
// anchor at load and packs each recipe into typed columns; it is the only
// code here that throws. Randomness is not a recipe flag: particles draw
// stateless hash noise (effectNoise) and never Math.random.
var FX_MATERIAL_COLORS = {
  fxMote: {dust:'#b4a078', sand:'#c8b48c', firefly:'#96ff50', snow:'#d2e6ff', sparkle:'#b4dcff',
    drip:'#5078c8', spore:'#78be50', shimmer:'#fff0c8', caveDust:'#8a8378'},
  fxEmber: {e1:'#ff8c14', e2:'#ffa014', e3:'#ffb414', e4:'#ffc814'},
  fxWeather: {rain:'#9fb4c8', rainLit:'#c9d6e4', splash:'#c8d8e8', snow:'#eef4fa', ash:'#6e6a66', ashLit:'#a39c94', cinder:'#ff8a3a'},
  fxDebris: {spark:'#fff1c8', sparkHot:'#ffb347', dust:'#a89880', chip:'#6a6258', kickedUp:'#d8cfbd'},
  fxBone: {enemy:'#cfc8b8', spawner:'#3a1520'},
  fxOre: {gold:'#c8a000', goldLit:'#ffe066', teal:'#00a89a', tealLit:'#00ddc8'},
  fxFeedback: {phoenix:'#ff8020', thunder:'#ffff66', garrison:'#c8a028', tome:'#bb66ff', heart:'#ff4444', mana:'#4488ff',
    move:'#44dd55', shrineDamage:'#ff4444', shrineSpeed:'#44ffff', shrineRegen:'#44ff44', shrineArmor:'#ffaa44'}
};
var FX_MATERIALS = compileGameMaterials(FX_MATERIAL_COLORS);

// Semantic events: the A/B family whose Legacy mode runs the verbatim legacy
// adapter instead, and the where.kind vocabulary. Every name needs a reader
// in 11-fx-engine.js (asserted at load). S5 adds projectile contacts and NPC
// melee commits (no family: the fxDebris preset); S6 the locomotion
// observers' events (no family: the fxFootDust preset): a footstep of the
// player or an NPC, the player's dash and landing.
var FX_EVENTS = {
  enemyDeath: {family:'bones', kinds:[]},
  spawnerDeath: {family:'bones', kinds:[]},
  pickup: {family:'pickupBursts', kinds:['tome', 'stat']},
  shrine: {family:'pickupBursts', kinds:[]},
  phoenix: {family:'pickupBursts', kinds:[]},
  thunderCore: {family:'pickupBursts', kinds:[]},
  allyDeath: {family:'pickupBursts', kinds:[]},
  projectileContact: {family:null, kinds:['wall', 'floor', 'cap', 'ceiling', 'enemy', 'spawner', 'ore', 'lob']},
  meleeCommit: {family:null, kinds:[]},
  footstep: {family:null, kinds:[]},
  dashStart: {family:null, kinds:[]},
  land: {family:null, kinds:[]}
};
var FX_EVENT_NAMES = Object.keys(FX_EVENTS);
// Anchor resolvers live in the engine (PARTICLE_ANCHORS); dashTrail (S6:
// the player's feet while a dash lasts), flameStream (S8: the flame stream's
// segment from the casting hand while the beam is drawn).
var FX_ANCHOR_NAMES = ['entity', 'point', 'torch', 'dashTrail', 'flameStream'];
// Camera-relative fields (section 4.7): a box centred ahead of the camera
// holds a target population that wraps at the box edge and fades there.
// Ambient: the Particles setting; set choice: underground wins over any
// biome, each other set names its biomes. Weather (S7, target 'weather'):
// one set per weather kind, each kind's population x s x its level x the
// cave-mouth visibility, over open-sky columns; in 2D (1 u a pixel, the box
// on the view) it keeps twoDScale of that at the authored canvas (more on a
// larger view, 11-fx-engine.js), and rain (mode2D splashOnly) spawns only
// its splashes.
var FX_FIELD_SOURCE = {
  ambient: {box:{half:170, bias:100}, edgeFade:0.15, target:'setting',
    sets:{meadow:['ground', 'plains'], forest:['forest'], frost:['ice'], dunes:['expanse'], caveSurface:['cave'],
      underground:'playerUnderground'},
    mode2D:'none'},
  weather: {box:{half:200, bias:90}, edgeFade:0.1, target:'weather', twoDScale:0.35}
};
var FX_FIELD_NAMES = Object.keys(FX_FIELD_SOURCE);
// Weather (section 9.1). Fronts of 2-5 minutes of sim time; a front is
// active in the current biome when its roll is under the biome's chance, at
// an intensity eased in and out over crossfadeSeconds (kinds crossfade when
// the biome changes mid-front); wind per front, eased over windEaseSeconds.
// Population per kind at Particles 25 and intensity 1. Rain columns whose
// open sky (highest walkable surface, or a capless cave roof) is at least
// snowLineH (mesh heights) snow instead, at snow's density, while rain keeps
// its density over the rest: 1.5 H is the 84th percentile of the surface
// heights of seed 424242's spawn window (80th of a 48k x 48k area; S7
// histogram), so peaks snow while valleys rain (approved by the lead after
// S8; Revision 3 Q3 had said 0.5 H). Visibility falls over renderCameraCaveBlend
// 0.5-1 (smoothstep), so a cave mouth still shows the rain outside. Refill
// runs at refillBoost x the turnover rate. The ambient coupling: drips
// multiply while raining; fireflies hide in weather; while no weather wind
// blows (the Weather switch off), spawn direction 'wind' takes the calm
// direction, +x: the way legacy blown sand drifted.
var FX_WEATHER_RULES = {
  frontSeconds:[120, 300], crossfadeSeconds:8,
  biomes:{ground:{kind:'rain', chance:0.45}, plains:{kind:'rain', chance:0.5}, forest:{kind:'rain', chance:0.6},
    cave:{kind:'rain', chance:0.3}, ice:{kind:'snow', chance:0.65}, expanse:{kind:'ash', chance:0.35}},
  intensity:[0.35, 1.0], windSpeed:[4, 30], windEaseSeconds:10,
  population:{rain:600, snow:450, ash:360}, snowLineH:1.5, caveVisibility:[0.5, 1.0], refillBoost:1.25,
  rainFedDrips:1.5, fireflySuppress:0.3, calmDirection:[1, 0]
};

// Strategy flags; a column stores the index in its list (defaults first).
var FX_ENUMS = {
  class: ['weather', 'ambient', 'locomotion', 'combat', 'feedback'],   // priority = index + 1
  layer: ['world', 'combat', 'overlay'],
  shape: ['point', 'sphere', 'disc', 'ring', 'column', 'segment', 'cone', 'screenCorners'],
  support: ['event', 'viewer', 'openSky', 'ceiling'],
  direction: ['none', 'random', 'up', 'radial', 'normal', 'reflect', 'along', 'wind', 'backward'],
  model: ['drift', 'static', 'ballistic', 'fall', 'rise'],
  mode: ['none', 'clamp', 'kill', 'rest', 'bounce'],
  stratum: ['reference', 'surface', 'openSky'],
  envelope: ['fade', 'flash', 'pulse', 'hold', 'quadOut', 'linear'],
  primitive: ['dot', 'glowDot', 'streak', 'segment', 'chip', 'puff', 'ring'],
  blend: ['normal', 'add'],
  occlusion: ['auto', 'point', 'footprint', 'tiles', 'corona', 'segment', 'clip', 'none'],
  lighting: ['ambient', 'lightGrid', 'emissive', 'sun', 'none'],
  place: ['source', 'sourceOrFront', 'frontRing', 'frontSides', 'eye', 'screen'],
  selfView: ['world', 'ifVisible', 'skip'],
  view2D: ['none', 'dot', 'ring', 'segment', 'line', 'puff'],
  mode2D: ['simulate', 'splashOnly', 'none'],
  at: ['point', 'feet', 'torso', 'itemFloor', 'shrineCrystal', 'playerFeet'],
  visible: ['always', 'day', 'night'],
  colorSource: ['static', 'event', 'spell', 'ore', 'surfaceWall', 'surfaceFloor', 'surfaceDust', 'surfaceStep'],
  weatherKind: ['rain', 'snow', 'ash']
};

// Ore vein types (oreVeins[].veinType), in the order of PAL.ore's pairs.
var FX_ORE_TYPES = ['gold', 'teal'];
// Contact and step surfaces per biome: wall base, floor band 5, dust (ice
// snow, expanse sand); underground uses the cave stone. Step dust is that
// dust kicked up into the air: 60% of the way to fxDebris.kickedUp, so it
// reads lighter than the ground it rises from (the S6 browser check: a puff
// in the floor band itself is lost against the lit floor); dust already
// lighter than kickedUp (Rec. 709 luma: the snow on ice) stays as it is.
var FX_SURFACE = (function () {
  var out = {}, up = FX_MATERIALS.fxDebris.packed.kickedUp;
  function packed(rgb) { return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]; }
  function luma(c) { return 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255); }
  function kicked(c) {
    if (luma(c) >= luma(up)) return c;
    var v = 0;
    for (var sh = 16; sh >= 0; sh -= 8) { var a = (c >> sh) & 255; v = v << 8 | Math.round(a + (((up >> sh) & 255) - a) * 0.6); }
    return v;
  }
  function surface(wall, floor, dust) { return {wall:wall, floor:floor, dust:dust, step:kicked(dust)}; }
  Object.keys(BIOME_PALETTE).forEach(function (b) {
    var p = BIOME_PALETTE[b], floor = parseInt(p.floorBands[5].slice(1), 16);
    out[b] = surface(packed(p.wallBaseRGB), floor,
      b === 'ice' ? FX_MATERIALS.fxWeather.packed.snow : b === 'expanse' ? FX_MATERIALS.fxMote.packed.sand : floor);
  });
  var stone = GAME_MATERIALS.caveStone.packed;
  out.underground = surface(stone.base, stone.worn, stone.damp);
  return out;
}());

// Templates (trigger {api:true}: they spawn only through fxEmit/fxAttach or
// as extends bases), then the family recipes of each slice: S3 the ambient
// motes (field 'ambient') and torch embers (anchor 'torch'); S4 the death
// bones (family 'bones') and the feedback bursts (family 'pickupBursts'),
// placed where first person can see them; S5 the impact debris preset
// (toggle fxDebris): sparks in the spell's colours, chips in the struck
// surface's (wall, floor, ore vein, spawner; none from bodies; a ceiling's
// fall, never up into the rock) and dust (a wall's in its rock colour, on
// the struck side only, a small puff even next to the camera), from
// projectile contacts and NPC melee commits. Melee sparks move in front of
// the first-person camera only when the player is struck; strikes between
// NPCs stay where they happen. S6 the footstep and dash dust preset
// (toggle fxFootDust), from the movement observers: a puff per stride, a
// ring of dust on landing, a larger burst and a trail on a dash, in the
// stepped surface's dust kicked up (lighter, so it reads on its own ground)
// and on its stratum (a dash needs ground within a step below the feet);
// in 2D a puff or landing ring is at least minPx2D in radius (1 u = 1 px),
// while in 3D a far puff shrinks with distance. The player's own step,
// landing and dash puffs sit at the feet, never in first-person view, so
// they are refused there (selfView ifVisible, counted); a dash shows puffs
// in the lower third of the screen, beside the arms, instead. S7 the weather
// preset (toggle fxWeather; field 'weather'): rain streaks that splash on
// the floor they hit (a cap, a wall top, a slope), snow (also rain's swap
// above the snow line) and ash with cinders that settle and fade; all start
// at the wind's speed and follow it through drag. Rain's lod sets only its
// far distance, where streaks draw as dots: the field keeps its population
// over the whole box (no spawn keep), and its splash has its own. Snow
// brightens a little at night (nightBoost), grey ash does not; cinders glow.
// S8 the flame stream's embers (family flameEmbers, anchor flameStream):
// glowing fire-palette dots spawned along the beam from the casting hand,
// on its arc over the floor under each one, fanning out as the beam does
// and carrying the player's motion, in place of the shadow-blurred
// billboards (none at Particles 0: combat class); sized, counted (about 24
// live) and haloed as the legacy ones read (S8 browser A/B at 360 x 240:
// about 0.9 x the light and 0.96 x the pixels the shadow-blurred ones add).
// Corona occlusion (five reads, alpha x the visible share) keeps their cost
// flat at any canvas size; a 6 px 2D floor carries about the light of the
// legacy 2D embers, as unblurred dots.
// Radii are the legacy size x 0.15 before the size tier, which is applied
// once, at draw. maxLive: population x 2.4 (Ultra) with a margin, above 2D's
// largest share; a 2D splash lives 0.24 s at T / meanLife x 0.35 x the
// view's area a second (up to 3 x the authored canvas).
var FX_RECIPE_SOURCE = {
  mote: {class:'ambient', family:'ambient', layer:'world', trigger:{api:true}, sizeTier:'particle',
    spawn:{shape:'column', support:'viewer', direction:'random'}, motion:{model:'drift'},
    collision:{mode:'clamp', stratum:'reference'}, life:{seconds:[3, 7], fade:[0.2, 0.3]},
    render:{primitive:'dot', size:[0.15, 0.3], alpha:[0.18, 0.3], minPx:1, maxPx:4},
    occlusion:'auto', lighting:'ambient', view2D:'none', mode2D:'none', lod:{near:60, far:220, farKeep:0.5, cull:260}},
  feedbackBurst: {class:'feedback', family:'pickupBursts', layer:'world', trigger:{api:true},
    place:'sourceOrFront', placeParams:{near:48, distance:34, drop:10},
    spawn:{shape:'ring', radius:[1, 2], direction:'radial', speed:[22, 34], up:[8, 22], inherit:1},
    motion:{model:'drift', gravity:-6, drag:1.8}, collision:{mode:'none'}, life:{seconds:[0.8, 1.0], fade:[0.05, 0.5]},
    render:{primitive:'glowDot', size:[0.5, 0.8], alpha:[0.85, 1], glow:3, glowAlpha:0.35, blend:'add', minPx:2},
    occlusion:'auto', lighting:'emissive', view2D:'dot', lod:{near:80, far:500, farKeep:1, cull:900}},
  'ambient.dust': {extends:'mote', trigger:{field:'ambient', sets:{meadow:0.8, forest:0.7, caveSurface:0.5}},
    color:{material:'fxMote', roles:['dust']}, spawn:{height:[5, 25], speed:[0, 3], up:[-1, 1]},
    motion:{turbulence:1.5, turbHz:0.5}},
  'ambient.firefly': {extends:'mote', trigger:{field:'ambient', sets:{meadow:0.2, forest:0.3}, visible:'night'},
    color:{material:'fxMote', roles:['firefly']}, spawn:{height:[8, 28], speed:[0, 5], up:[-2.5, 2.5]},
    motion:{turbulence:3, turbHz:0.6}, life:{seconds:[3, 8], envelope:'pulse', pulseHz:0.8, pulseDepth:1},
    render:{primitive:'glowDot', size:[0.225, 0.225], alpha:[0.3, 0.6], glow:4, glowRole:'firefly', glowAlpha:0.15, blend:'add'},
    lighting:'emissive', nightBoost:0.3, lod:{glowFar:180}},
  'ambient.snowflake': {extends:'mote', trigger:{field:'ambient', sets:{frost:0.6}},
    color:{material:'fxMote', roles:['snow']}, spawn:{height:[30, 70], speed:[0, 4], up:[-15, -5]},
    motion:{model:'fall', turbulence:2, turbHz:0.7}, collision:{mode:'rest', restSeconds:[0.4, 0.8]},
    life:{seconds:[4, 7]}, render:{size:[0.15, 0.45], alpha:[0.25, 0.45]}},
  'ambient.sparkle': {extends:'mote', trigger:{field:'ambient', sets:{frost:0.4}, visible:'day'},
    color:{material:'fxMote', roles:['sparkle']}, spawn:{height:[2, 17]}, motion:{model:'static'},
    life:{seconds:[0.8, 2], envelope:'flash'}, render:{alpha:[0.4, 0.7]}, lighting:'sun'},
  'ambient.sandDust': {extends:'mote', trigger:{field:'ambient', sets:{dunes:0.7}},
    color:{material:'fxMote', roles:['sand']}, spawn:{height:[3, 23], direction:'wind', speed:[8, 20], up:[-1.5, 1.5]},
    life:{seconds:[3, 6]}, render:{size:[0.15, 0.375], alpha:[0.15, 0.3]}},
  'ambient.shimmer': {extends:'mote', trigger:{field:'ambient', sets:{dunes:0.3}, visible:'day'},
    color:{material:'fxMote', roles:['shimmer']}, spawn:{height:[5, 20], up:[1, 4]}, motion:{model:'rise', gravity:-2.5},
    collision:{mode:'none'}, life:{seconds:[2, 4]}, render:{primitive:'puff', size:[0.3, 0.6], alpha:[0.08, 0.16]}, lighting:'sun'},
  'ambient.drip': {extends:'mote', trigger:{field:'ambient', sets:{underground:0.45}},
    color:{material:'fxMote', roles:['drip']}, spawn:{support:'ceiling', height:[0, 0], up:[-35, -20]},
    motion:{model:'fall', gravity:220}, collision:{mode:'kill', onFloor:'ambient.dripRipple', onFloorChance:0.5, childNear:90},
    life:{seconds:[1.5, 3], untilGround:true, fade:[0.05, 0.05]},
    render:{primitive:'streak', size:[0.16, 0.16], streakSeconds:0.05, alpha:[0.35, 0.5]}, occlusion:'segment', lighting:'lightGrid'},
  'ambient.dripRipple': {class:'ambient', family:'ambient', trigger:{child:true}, color:{material:'fxMote', roles:['drip']},
    motion:{model:'static'}, life:{seconds:[0.25, 0.35], fade:[0, 0.8], envelope:'flash'},
    render:{primitive:'ring', size:[0.4, 0.6], grow:2.5, alpha:[0.35, 0.45]}, occlusion:'footprint', lighting:'lightGrid', view2D:'none'},
  'ambient.spore': {extends:'mote', trigger:{field:'ambient', sets:{underground:0.35, caveSurface:0.5}},
    color:{material:'fxMote', roles:['spore']}, spawn:{height:[3, 13], speed:[0, 2.5], up:[2, 6]},
    motion:{model:'rise', gravity:-4, drag:0.6, turbulence:1.5, turbHz:0.4}, life:{seconds:[4, 8]},
    render:{size:[0.15, 0.375], alpha:[0.2, 0.35]}, lighting:'lightGrid'},
  'ambient.caveDust': {extends:'mote', trigger:{field:'ambient', sets:{underground:0.2}},
    color:{material:'fxMote', roles:['caveDust']}, spawn:{height:[3, 20], speed:[0, 3]}, motion:{drag:0.6},
    render:{size:[0.15, 0.27], alpha:[0.18, 0.28]}, lighting:'lightGrid'},
  'torch.ember': {class:'ambient', family:'torchEmbers', layer:'world', trigger:{anchor:'torch', rate:6, maxAnchors:4, radius:220}, sizeTier:'particle',
    color:{material:'fxEmber', roles:['e1', 'e2', 'e3', 'e4']}, spawn:{shape:'sphere', radius:[0, 2], direction:'normal', spread:0.9, speed:[2, 8], up:[8, 20]},
    motion:{model:'rise', gravity:-14, drag:1.2, turbulence:4, turbHz:1.4}, collision:{mode:'none', wall:true},
    life:{seconds:[0.8, 2], fade:[0.15, 0.4], envelope:'pulse', pulseHz:1.6, pulseDepth:0.8},
    render:{primitive:'glowDot', size:[0.15, 0.3], alpha:[0.4, 0.7], glow:4, glowRole:'e2', glowAlpha:0.15, blend:'add'},
    occlusion:'auto', lighting:'emissive', nightBoost:0.3, view2D:'none', lod:{near:40, far:220, farKeep:0.25, cull:260, glowFar:160}},
  'bone.enemy': {class:'feedback', family:'bones', layer:'combat', trigger:{event:'enemyDeath', count:7, at:'feet', lift:24},
    color:{material:'fxBone', roles:['enemy']}, jitter:1,
    spawn:{shape:'disc', radius:[0, 3], direction:'radial', speed:[50, 160], up:[60, 120]},
    motion:{model:'ballistic', gravity:420, drag:1.2, spin:[-5, 5]},
    collision:{mode:'bounce', stratum:'reference', restitution:0.3, friction:0.55, bounces:2, restSeconds:[0.3, 0.5]},
    life:{seconds:[1.4, 1.8], fade:[0, 0.35], envelope:'quadOut'},
    render:{primitive:'segment', length:[7, 20], size:[0.5, 0.8], alpha:[1, 1], minPx:1.2, maxPx:3},
    occlusion:'segment', lighting:'ambient', view2D:'segment', lod:{near:80, far:400, farKeep:0.6, cull:600}},
  'bone.spawner': {extends:'bone.enemy', trigger:{event:'spawnerDeath', count:5, at:'feet', lift:30},
    color:{material:'fxBone', roles:['spawner']}, spawn:{speed:[40, 120]}, life:{seconds:[1.0, 1.4]}, render:{length:[8, 18]}},
  'burst.tome': {extends:'feedbackBurst', trigger:{event:'pickup', where:{kind:['tome']}, count:15, at:'itemFloor', lift:10},
    color:{material:'fxFeedback', roles:['tome']}},
  'burst.stat': {extends:'feedbackBurst', trigger:{event:'pickup', where:{kind:['stat']}, count:12, at:'itemFloor', lift:8},
    color:'event', spawn:{speed:[22, 30]}},
  'burst.shrine': {extends:'feedbackBurst', trigger:{event:'shrine', count:12, at:'shrineCrystal'}, color:'event',
    spawn:{speed:[35, 45], up:[30, 50]}, motion:{model:'ballistic', gravity:60, drag:0.8}, life:{seconds:[0.8, 0.8]}},
  'burst.phoenixRing': {extends:'feedbackBurst', layer:'overlay', place:'eye', trigger:{event:'phoenix', count:16},
    color:{material:'fireMagic', roles:['core', 'light', 'mid']}, spawn:{shape:'ring', radius:[1, 2], direction:'radial', speed:[22, 30], up:[0, 0]},
    life:{seconds:[0.7, 0.9]}, occlusion:'none', lighting:'none', view2D:'none'},
  'burst.phoenixEmbers': {extends:'feedbackBurst', place:'source', trigger:{event:'phoenix', count:16, at:'playerFeet', lift:20},
    color:{material:'fireMagic', roles:['light', 'mid']}, spawn:{shape:'ring', radius:[6, 14], speed:[10, 30], up:[10, 30]},
    motion:{gravity:-70, drag:1, turbulence:6, turbHz:1.6}, life:{seconds:[0.8, 1.2], envelope:'pulse', pulseHz:2, pulseDepth:0.4}},
  'burst.thunder': {extends:'feedbackBurst', place:'source', trigger:{event:'thunderCore', count:8, at:'torso'},
    color:{material:'stormMagic', roles:['core', 'light']}, spawn:{shape:'sphere', radius:[0, 3], speed:[90, 170], up:[0, 20]},
    motion:{model:'ballistic', gravity:150, drag:3}, life:{seconds:[0.2, 0.35], envelope:'flash'},
    render:{primitive:'streak', size:[0.3, 0.3], streakSeconds:0.025, minPx:0}, occlusion:'segment', view2D:'line'},
  'burst.allyDeath': {extends:'feedbackBurst', place:'source', trigger:{event:'allyDeath', count:8, at:'torso'},
    color:{material:'fxFeedback', roles:['garrison']}, spawn:{shape:'sphere', radius:[0, 5], speed:[15, 40], up:[10, 30]},
    motion:{gravity:-30, drag:1.5}, life:{seconds:[0.7, 1.0]}},
  'impact.spark': {class:'combat', toggle:'fxDebris', layer:'combat',
    trigger:[{event:'projectileContact', where:{kind:['wall', 'ceiling']}, count:6},
      {event:'projectileContact', where:{kind:['floor', 'cap', 'lob']}, count:3},
      {event:'projectileContact', where:{kind:['enemy']}, count:4},
      {event:'projectileContact', where:{kind:['spawner']}, count:5},
      {event:'projectileContact', where:{kind:['ore']}, count:8}],
    color:'spell', spawn:{shape:'point', direction:'reflect', spread:0.7, speed:[80, 180], up:[10, 50]},
    motion:{model:'ballistic', gravity:300, drag:2}, collision:{mode:'kill', stratum:'reference', wall:true},
    life:{seconds:[0.15, 0.35], fade:[0, 0.6], envelope:'linear'},
    render:{primitive:'streak', size:[0.35, 0.35], streakSeconds:0.02, alpha:[0.85, 1], minPx:0.8, maxPx:2, blend:'add'},
    occlusion:'segment', lighting:'emissive', view2D:'line', lod:{near:20, far:260, farKeep:0.4, cull:420}},
  'impact.chip': {class:'combat', toggle:'fxDebris', layer:'combat',
    trigger:[{event:'projectileContact', where:{kind:['wall']}, count:5},
      {event:'projectileContact', where:{kind:['floor', 'cap']}, count:3, color:'surfaceFloor'},
      {event:'projectileContact', where:{kind:['ore']}, count:6, color:'ore'},
      {event:'projectileContact', where:{kind:['spawner']}, count:4, color:{material:'fxBone', roles:['spawner']}}],
    color:'surfaceWall', jitter:1, spawn:{shape:'point', direction:'normal', spread:0.95, speed:[40, 110], up:[20, 60]},
    motion:{model:'ballistic', gravity:420, drag:0.4, spin:[-14, 14]},
    collision:{mode:'bounce', stratum:'reference', restitution:0.35, friction:0.6, bounces:2, restSeconds:[0.4, 0.7], wall:true},
    life:{seconds:[0.9, 1.4], fade:[0, 0.25], envelope:'hold'},
    render:{primitive:'chip', size:[0.35, 0.7], alpha:[1, 1], minPx:1, maxPx:5},
    occlusion:'auto', lighting:'lightGrid', view2D:'dot', lod:{near:20, far:200, farKeep:0.3, cull:360}},
  'impact.chipFall': {extends:'impact.chip', trigger:{event:'projectileContact', where:{kind:['ceiling']}, count:2},
    spawn:{spread:0.6, speed:[10, 40], up:[-20, 0]}},
  'impact.dust': {class:'combat', toggle:'fxDebris', layer:'combat',
    trigger:[{event:'projectileContact', where:{kind:['wall', 'ore', 'ceiling']}, count:1, color:'surfaceWall'},
      {event:'projectileContact', where:{kind:['floor', 'cap', 'lob']}, count:2},
      {event:'meleeCommit', count:1, at:'feet'}],
    color:'surfaceDust', spawn:{shape:'sphere', radius:[0, 1.5], halfSpace:true, direction:'normal', spread:1.2, speed:[6, 18]},
    motion:{model:'drift', gravity:-6, drag:3}, collision:{mode:'clamp', stratum:'reference'},
    life:{seconds:[0.45, 0.8], fade:[0.1, 0.6]}, render:{primitive:'puff', size:[1.2, 2.2], grow:1.8, alpha:[0.22, 0.32], maxPx:16},
    occlusion:'auto', lighting:'ambient', view2D:'puff', lod:{near:20, far:200, farKeep:0.3, cull:360}},
  'impact.slimeSplat': {extends:'impact.dust',
    trigger:{event:'projectileContact', where:{kind:['wall', 'floor', 'cap', 'ceiling'], companion:true}, count:3},
    color:'spell', spawn:{speed:[10, 26], up:[4, 12]}, render:{primitive:'glowDot', size:[0.4, 0.7], glow:2, glowAlpha:0.2, blend:'normal'}},
  'melee.spark': {extends:'impact.spark', trigger:[{event:'meleeCommit', where:{self:true}, count:4, at:'torso', place:'sourceOrFront'},
      {event:'meleeCommit', where:{self:false}, count:4, at:'torso'}], color:'event',
    placeParams:{near:20, distance:26, drop:6}, spawn:{spread:1.0, speed:[60, 140]}},
  'step.dust': {class:'locomotion', toggle:'fxFootDust', layer:'world', trigger:{event:'footstep'}, selfView:'ifVisible',
    color:'surfaceStep', spawn:{shape:'disc', radius:[0, 2], direction:'backward', spread:1.0, speed:[6, 14], up:[3, 9]},
    motion:{model:'drift', gravity:-3, drag:4}, collision:{mode:'clamp', stratum:'reference'},
    life:{seconds:[0.35, 0.6], fade:[0.1, 0.6]}, render:{primitive:'puff', size:[1.2, 2.2], grow:1.6, alpha:[0.35, 0.6], minPx2D:3},
    occlusion:'auto', lighting:'ambient', view2D:'puff', lod:{near:15, far:160, farKeep:0.25, cull:240}},
  'step.land': {extends:'step.dust', trigger:{event:'land', count:[8, 12]},
    spawn:{shape:'ring', radius:[2, 4], direction:'radial', speed:[30, 80], up:[2, 8]},
    render:{size:[1.4, 2.9], grow:1.8, alpha:[0.45, 0.8]}, view2D:'ring'},
  'step.dash': {extends:'step.dust', trigger:{event:'dashStart', count:[8, 12]}, placeParams:{distance:160, arc:0.45},
    spawn:{shape:'disc', radius:[0, 4], direction:'backward', spread:1.3, speed:[20, 60], up:[4, 14]},
    render:{size:[2.2, 4.1], grow:2, alpha:[0.55, 0.9]}},
  'step.dashTrail': {extends:'step.dash', trigger:{anchor:'dashTrail', rate:45},
    spawn:{speed:[20, 50]}, render:{alpha:[0.35, 0.6]}},
  'screen.dashDust': {class:'locomotion', toggle:'fxFootDust', layer:'overlay', place:'screen',
    trigger:{event:'dashStart', where:{self:true}, count:6}, color:'surfaceStep',
    spawn:{shape:'screenCorners', direction:'radial', speed:[0.2, 0.5]},
    motion:{model:'drift', drag:2}, collision:{mode:'none'}, life:{seconds:[0.3, 0.45], fade:[0.1, 0.8]},
    render:{primitive:'puff', size:[0.06, 0.12], grow:1.5, alpha:[0.25, 0.4]},
    occlusion:'none', lighting:'ambient', view2D:'none'},
  'weather.rain': {class:'weather', toggle:'fxWeather', layer:'world', trigger:{field:'weather', kind:'rain', aboveSnowLine:'weather.snow'},
    color:{material:'fxWeather', roles:['rain', 'rainLit'], weights:[0.8, 0.2]},
    spawn:{shape:'column', support:'openSky', height:[70, 150], direction:'wind', up:[-460, -380]},
    motion:{model:'fall', drag:0.05, wind:0.35},
    collision:{mode:'kill', stratum:'openSky', wall:true, onFloor:'weather.splash', onFloorChance:0.45, childNear:120},
    life:{seconds:[1.4, 1.4], untilGround:true, fade:[0.03, 0.03], envelope:'hold'},
    render:{primitive:'streak', size:[0.3, 0.3], streakSeconds:0.028, alpha:[0.25, 0.45], minPx:0.7, maxPx:1.6},
    occlusion:'segment', lighting:'lightGrid', view2D:'none', mode2D:'splashOnly',
    lod:{near:30, far:170}, budget:{maxLive:1600}},
  'weather.splash': {class:'weather', toggle:'fxWeather', trigger:{child:true}, color:{material:'fxWeather', roles:['splash']},
    motion:{model:'static'}, life:{seconds:[0.18, 0.3], fade:[0, 0.8], envelope:'flash'},
    render:{primitive:'ring', size:[0.7, 1.3], grow:2.5, alpha:[0.35, 0.5]}, occlusion:'footprint', lighting:'lightGrid',
    view2D:'ring', budget:{maxLive:720}},
  'weather.snow': {class:'weather', toggle:'fxWeather', layer:'world', trigger:{field:'weather', kind:'snow'},
    color:{material:'fxWeather', roles:['snow']},
    spawn:{shape:'column', support:'openSky', height:[40, 110], direction:'wind', up:[-45, -25]},
    motion:{model:'fall', drag:0.8, wind:0.8, turbulence:6, turbHz:1.1},
    collision:{mode:'rest', stratum:'openSky', wall:true, restSeconds:[1, 1.6]}, life:{seconds:[6, 9], untilGround:true, fade:[0.1, 0.15]},
    render:{primitive:'dot', size:[0.12, 0.3], alpha:[0.55, 0.85], minPx:1, maxPx:3}, occlusion:'auto',
    lighting:'ambient', nightBoost:0.1, view2D:'dot', mode2D:'simulate', budget:{maxLive:1300}},
  'weather.ash': {extends:'weather.snow', trigger:{field:'weather', kind:'ash', weight:0.92},
    color:{material:'fxWeather', roles:['ash', 'ashLit'], weights:[0.65, 0.35]}, spawn:{up:[-20, -10]},
    motion:{drag:0.9, wind:1, turbulence:5, turbHz:0.6}, collision:{restSeconds:[1.2, 1.8]}, life:{seconds:[6, 10]},
    render:{size:[0.12, 0.25], alpha:[0.35, 0.6]}, nightBoost:0, budget:{maxLive:950}},
  'weather.cinder': {extends:'weather.ash', trigger:{field:'weather', kind:'ash', weight:0.08},
    color:{material:'fxWeather', roles:['cinder']}, collision:{mode:'kill'}, life:{seconds:[3, 6], envelope:'pulse', pulseHz:1.2, pulseDepth:0.5},
    render:{primitive:'glowDot', size:[0.12, 0.2], alpha:[0.6, 0.9], glow:2.5, glowRole:'cinder', glowAlpha:0.3, blend:'add'},
    lighting:'emissive', nightBoost:0.4, budget:{maxLive:80}},
  'flame.ember': {class:'combat', family:'flameEmbers', layer:'combat', trigger:{anchor:'flameStream', rate:50},
    color:{material:'fireMagic', roles:['core', 'light', 'mid'], weights:[0.3, 0.35, 0.35]},
    spawn:{shape:'segment', direction:'along', spread:0.35, speed:[50, 100], up:[0, 12], inherit:1},
    motion:{model:'ballistic', gravity:-20, drag:2, turbulence:10, turbHz:3}, collision:{mode:'kill', stratum:'reference', wall:true},
    life:{seconds:[0.35, 0.6], fade:[0.05, 0.7]},
    render:{primitive:'glowDot', size:[0.8, 1.2], grow:0.35, alpha:[0.6, 0.9], glow:3.2, glowRole:'mid', glowAlpha:0.4, blend:'add',
      maxPx:16, minPx2D:6},
    occlusion:'corona', lighting:'emissive', view2D:'dot', budget:{maxLive:96}}
};

// ── Compiler ──────────────────────────────────────────────────────────────
// Leaf kinds: an enum (named by its key), a range, a number or a flag.
var _FX_SCHEMA = {
  extends:'id', class:'enum', toggle:'toggle', family:'family', layer:'enum', trigger:'trigger', color:'color',
  sizeTier:'tier', jitter:'bit', occlusion:'enum', lighting:'enum', nightBoost:'unit', place:'enum',
  placeParams:{near:'num0', distance:'num0', drop:'num', radius:'num0', arc:'num0'}, selfView:'enum',
  view2D:'enum', mode2D:'enum', budget:{maxLive:'maxLive'},
  spawn:{shape:'enum', radius:'range0', halfSpace:'bool', height:'range', lift:'range', support:'enum', direction:'enum',
    spread:'num0', speed:'range0', up:'range', inherit:'unit'},
  motion:{model:'enum', gravity:'num', drag:'num0', wind:'wind', turbulence:'num0', turbHz:'num0', spin:'range'},
  collision:{mode:'enum', stratum:'enum', restitution:'unit', friction:'unit', bounces:'bounces',
    restSeconds:'range0', wall:'bool', onFloor:'id', onFloorChance:'unit', childNear:'num0'},
  life:{seconds:'rangeLife', untilGround:'bool', fade:'fade', envelope:'enum', pulseHz:'num0', pulseDepth:'unit'},
  render:{primitive:'enum', size:'range0', grow:'num0', length:'range0', streakSeconds:'num0', alpha:'rangeUnit',
    minPx:'num0', minPx2D:'num0', maxPx:'num0', glow:'num0', glowRole:'role', glowAlpha:'unit', blend:'enum'},
  lod:{near:'num0', far:'num0', farKeep:'unit', cull:'num0', glowFar:'num0'}
};
var _FX_DEFAULTS = {toggle:null, family:null, layer:'world', color:'event', sizeTier:null, jitter:0, occlusion:'auto',
  lighting:'ambient', nightBoost:0, place:'source', selfView:'world', mode2D:'simulate',
  placeParams:{near:0, distance:30, drop:0, radius:0, arc:0.6}, budget:{},
  spawn:{shape:'point', radius:[0, 0], halfSpace:false, height:[0, 0], lift:[0, 0], support:'event', direction:'none', spread:0,
    speed:[0, 0], up:[0, 0], inherit:0},
  motion:{model:'drift', wind:0, turbulence:0, turbHz:0.5, spin:[0, 0]},
  collision:{mode:'none', stratum:'reference', restitution:0.3, friction:0.6, bounces:0, restSeconds:[0.5, 0.5],
    wall:false, onFloor:null, onFloorChance:1, childNear:1e9},
  life:{untilGround:false, fade:[0, 0], envelope:'fade', pulseHz:0, pulseDepth:0},
  render:{grow:1, length:[0, 0], streakSeconds:0, alpha:[1, 1], minPx:0, minPx2D:null, maxPx:64, glow:0, glowRole:null,
    glowAlpha:0, blend:'normal'},
  lod:{near:1e6, far:2e6, farKeep:1, cull:4e6, glowFar:4e6}
};
// Motion models are compile-time sugar over the gravity and drag columns:
// fall and rise keep their authored mean vertical speed as terminal speed.
var _FX_MODELS = {drift:{gravity:0, drag:0}, static:{gravity:0, drag:0}, ballistic:{gravity:300, drag:0},
  fall:{drag:0.5}, rise:{drag:0.5}};
var _FX_TRIGGER_KEYS = {event:'event where count at lift place color', field:'field sets visible kind weight aboveSnowLine',
  anchor:'anchor rate maxAnchors radius', child:'child', api:'api count'};
var _FX_MERGED = ['spawn', 'motion', 'collision', 'life', 'render', 'lod', 'placeParams', 'budget'];
function _fxHas(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }   // materials are null-prototype

function compileFxRecipes(source, materials, fieldSource) {
  var ids = Object.keys(source), fields = fieldSource || FX_FIELD_SOURCE, merged = {};
  var toggles = EFFECT_TOGGLE_DEFS.map(function (d) { return d.key; }).filter(function (k) { return k !== 'fxUnified'; });
  var families = Object.keys(EFFECT_FAMILY_MIGRATED), tiers = Object.keys(SIZE_TIERS);
  function fail(id, why) { throw new Error('Particle recipe ' + id + ': ' + why); }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function material(name) { return name && (materials && materials[name] || GAME_MATERIALS[name]) || null; }
  function checkKeys(id, obj, allowed, path) {
    Object.keys(obj).forEach(function (k) {
      if (k === 'random') fail(id, path + 'random is not a flag (particles use hash noise)');
      if (allowed.indexOf(k) < 0) fail(id, 'unknown key ' + path + k);
    });
  }
  // Keys at every level of a raw entry, before merging.
  function checkRaw(id, raw) {
    if (!isObj(raw)) fail(id, 'not an object');
    checkKeys(id, raw, Object.keys(_FX_SCHEMA), '');
    Object.keys(raw).forEach(function (k) {
      if (isObj(_FX_SCHEMA[k])) {
        if (!isObj(raw[k])) fail(id, k + ' must be an object');
        checkKeys(id, raw[k], Object.keys(_FX_SCHEMA[k]), k + '.');
      }
    });
  }
  function resolve(id, stack) {
    if (merged[id]) return merged[id];
    if (!source.hasOwnProperty(id)) fail(stack[stack.length - 1] || id, 'unknown recipe ' + id);
    if (stack.indexOf(id) >= 0) fail(id, 'extends cycle ' + stack.concat(id).join(' > '));
    var raw = source[id], base = raw.extends ? resolve(raw.extends, stack.concat(id)) : null, out = {};
    if (base) Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    Object.keys(raw).forEach(function (k) {
      if (k === 'extends') return;
      // Plain objects merge key by key; trigger and color replace whole.
      out[k] = _FX_MERGED.indexOf(k) >= 0 && out[k] ? Object.assign({}, out[k], raw[k]) : raw[k];
    });
    return (merged[id] = out);
  }
  ids.forEach(function (id) { checkRaw(id, source[id]); });
  ids.forEach(function (id) { resolve(id, []); });

  var n = ids.length, ID = {}, LIST = [];
  ids.forEach(function (id, r) { ID[id] = r; });
  // Static palette: packed RGB, interned; entry 0 is the dynamic fallback.
  var palRGB = [0xfff1c8], palIndex = {0xfff1c8:0}, specSrc = [], specStart = [], specCount = [], cand = [], cum = [];
  function intern(rgb) {
    if (!palIndex.hasOwnProperty(rgb)) { palIndex[rgb] = palRGB.length; palRGB.push(rgb); }
    return palIndex[rgb];
  }
  var surfBiomes = Object.keys(FX_SURFACE), surf = [];
  surfBiomes.forEach(function (b) { var f = FX_SURFACE[b]; surf.push(intern(f.wall), intern(f.floor), intern(f.dust), intern(f.step)); });
  // Ore veins (colour source 'ore'): base and lit entries per vein type.
  var ore = FX_ORE_TYPES.map(function (t) { return [intern(FX_MATERIALS.fxOre.packed[t]), intern(FX_MATERIALS.fxOre.packed[t + 'Lit'])]; });
  function colorSpec(id, c) {
    var at = specSrc.length;
    if (typeof c === 'string') {
      var src = FX_ENUMS.colorSource.indexOf(c);
      if (src < 1) fail(id, 'unknown color source ' + c);
      specSrc.push(src); specStart.push(0); specCount.push(0);
      return at;
    }
    if (!isObj(c)) fail(id, 'color must be a source name or {material, roles}');
    checkKeys(id, c, ['material', 'roles', 'weights'], 'color.');
    var m = material(c.material);
    if (!m) fail(id, 'unknown material ' + c.material);
    if (!Array.isArray(c.roles) || !c.roles.length) fail(id, 'color.roles must list roles');
    if (c.weights !== undefined && (!Array.isArray(c.weights) || c.weights.length !== c.roles.length))
      fail(id, 'color.weights must match roles');
    var total = 0, start = cand.length;
    c.roles.forEach(function (role, k) {
      if (!_fxHas(m.packed, role)) fail(id, 'material ' + c.material + ' has no role ' + role);
      var w = c.weights ? c.weights[k] : 1;
      if (!(Number.isFinite(w) && w > 0)) fail(id, 'color.weights must be positive');
      total += w; cand.push(intern(m.packed[role])); cum.push(total);
    });
    for (var k = start; k < cand.length; k++) cum[k] /= total;
    specSrc.push(0); specStart.push(start); specCount.push(c.roles.length);
    return at;
  }
  function enumCode(id, list, v, path) {
    var i = FX_ENUMS[list].indexOf(v);
    if (i < 0) fail(id, path + ' ' + v + ' is not one of ' + FX_ENUMS[list].join(' '));
    return i;
  }
  function range(id, v, path, lo, hi, positive) {
    if (!Array.isArray(v) || v.length !== 2 || !Number.isFinite(v[0]) || !Number.isFinite(v[1])) fail(id, path + ' must be [min,max]');
    if (v[0] > v[1]) fail(id, path + ' is inverted');
    if (v[0] < lo || v[1] > hi || positive && v[0] <= 0) fail(id, path + ' is out of range');
    return v;
  }
  function leaf(id, kind, v, path, key) {
    switch (kind) {
      case 'enum': return enumCode(id, key, v, path);
      case 'range': return range(id, v, path, -Infinity, Infinity);
      case 'range0': return range(id, v, path, 0, Infinity);
      case 'rangeLife': return range(id, v, path, 0, Infinity, true);
      case 'rangeUnit': return range(id, v, path, 0, 1);
      case 'fade': range(id, v, path, 0, 1); if (v[0] + v[1] > 1) fail(id, path + ' in + out exceeds 1'); return v;
      case 'num': case 'num0': case 'unit': case 'wind':
        if (!Number.isFinite(v) || kind !== 'num' && v < 0 || kind === 'unit' && v > 1 || kind === 'wind' && v > 2)
          fail(id, path + ' ' + v + ' is out of range');
        return v;
      case 'bool': if (v !== true && v !== false) fail(id, path + ' must be true or false'); return v;
      case 'bit': if (v !== 0 && v !== 1) fail(id, path + ' must be 0 or 1'); return v;
      case 'bounces': if (!Number.isInteger(v) || v < 0 || v > 7) fail(id, path + ' must be 0..7'); return v;
      case 'maxLive': if (!Number.isInteger(v) || v < 1 || v > EFFECT_CONFIG.capacity) fail(id, path + ' is out of range'); return v;
      case 'id': if (v !== null && !source.hasOwnProperty(v)) fail(id, path + ' names unknown recipe ' + v); return v;
      case 'toggle': if (v !== null && toggles.indexOf(v) < 0) fail(id, 'unknown toggle ' + v); return v;
      case 'family': if (v !== null && families.indexOf(v) < 0) fail(id, 'unknown family ' + v); return v;
      case 'tier': if (v !== null && tiers.indexOf(v) < 0) fail(id, 'unknown sizeTier ' + v); return v;
      case 'role': if (v !== null && typeof v !== 'string') fail(id, path + ' must be a role name'); return v;
    }
    return v;
  }
  function count(id, v, path) {
    if (Number.isInteger(v) && v >= 0) return [v, v];
    if (Array.isArray(v) && v.length === 2 && Number.isInteger(v[0]) && Number.isInteger(v[1]) && v[0] >= 0 && v[0] <= v[1]) return v;
    fail(id, path + ' must be a count or [min,max]');
  }
  // Full recipe with defaults, every leaf validated; enums become codes.
  function complete(id) {
    var m = merged[id], d = {};
    Object.keys(_FX_SCHEMA).forEach(function (k) {
      var spec = _FX_SCHEMA[k];
      if (isObj(spec)) {
        var o = Object.assign({}, _FX_DEFAULTS[k], m[k]);
        Object.keys(o).forEach(function (s) { if (o[s] !== null && o[s] !== undefined) o[s] = leaf(id, spec[s], o[s], k + '.' + s, s); });
        d[k] = o;
      } else {
        var v = m.hasOwnProperty(k) ? m[k] : _FX_DEFAULTS[k];
        if (v === undefined) return;
        d[k] = spec !== 'trigger' && spec !== 'color' && v !== null ? leaf(id, spec, v, k, k) : v;
      }
    });
    if (d.class === undefined) fail(id, 'missing class');
    if (d.trigger === undefined) fail(id, 'missing trigger');
    if (d.view2D === undefined) fail(id, 'missing view2D');
    if (!d.life.seconds) fail(id, 'missing life.seconds');
    if (d.render.primitive === undefined) fail(id, 'missing render.primitive');
    if (!d.render.size) fail(id, 'missing render.size');
    return d;
  }

  var recipes = ids.map(complete), eventCodes = {}, anchorCodes = {}, spellBits = {}, spellCount = 0;
  FX_EVENT_NAMES.forEach(function (e, i) { eventCodes[e] = i; });
  FX_ANCHOR_NAMES.forEach(function (a, i) { anchorCodes[a] = i; });
  var bindings = FX_EVENT_NAMES.map(function () { return []; }), anchorRecipes = FX_ANCHOR_NAMES.map(function () { return []; });
  var fieldMembers = {};
  function tri(id, v, path) {
    if (v === undefined) return 0;
    if (v !== true && v !== false) fail(id, path + ' must be true or false');
    return v ? 1 : 2;
  }
  function triggerOf(id, r, t, d, cols) {
    if (!isObj(t)) fail(id, 'trigger must be an object or an array of objects');
    var forms = Object.keys(_FX_TRIGGER_KEYS).filter(function (f) { return t.hasOwnProperty(f); });
    if (forms.length !== 1) fail(id, 'trigger needs exactly one of event, field, anchor, child, api');
    var form = forms[0];
    checkKeys(id, t, _FX_TRIGGER_KEYS[form].split(' '), 'trigger.');
    if (form === 'api') {
      if (t.api !== true) fail(id, 'trigger.api must be true');
      var c = count(id, t.count === undefined ? 1 : t.count, 'trigger.count');
      cols.api0[r] = c[0]; cols.api1[r] = c[1]; cols.trig[r] |= 1;
    } else if (form === 'child') {
      if (t.child !== true) fail(id, 'trigger.child must be true');
      cols.trig[r] |= 2;
    } else if (form === 'event') {
      if (!FX_EVENTS.hasOwnProperty(t.event)) fail(id, 'unknown event ' + t.event);
      var w = t.where || {}, kinds = FX_EVENTS[t.event].kinds, kindMask = 0x7fffffff, spellMask = 0;
      if (!isObj(w)) fail(id, 'trigger.where must be an object');
      checkKeys(id, w, ['kind', 'spell', 'self', 'companion', 'underground'], 'trigger.where.');
      if (w.kind !== undefined) {
        if (!Array.isArray(w.kind) || !w.kind.length) fail(id, 'trigger.where.kind must list kinds');
        kindMask = 0;
        w.kind.forEach(function (k) {
          var i = kinds.indexOf(k);
          if (i < 0) fail(id, 'event ' + t.event + ' has no kind ' + k);
          kindMask |= 1 << i;
        });
      }
      if (w.spell !== undefined) {
        if (!Array.isArray(w.spell) || !w.spell.length) fail(id, 'trigger.where.spell must list spell ids');
        w.spell.forEach(function (s) {
          if (typeof s !== 'string' || !s) fail(id, 'trigger.where.spell must list spell ids');
          if (!spellBits.hasOwnProperty(s)) {
            if (spellCount >= 31) fail(id, 'more than 31 distinct where.spell ids');
            spellBits[s] = 1 << spellCount++;
          }
          spellMask |= spellBits[s];
        });
      }
      var bc = count(id, t.count === undefined ? 1 : t.count, 'trigger.count');
      var lift = t.lift === undefined ? 0 : t.lift;
      if (!Number.isFinite(lift)) fail(id, 'trigger.lift must be a number');
      bindings[eventCodes[t.event]].push(Object.freeze({r:r, kindMask:kindMask, spellMask:spellMask,
        self:tri(id, w.self, 'where.self'), companion:w.companion === true ? 1 : 2, under:tri(id, w.underground, 'where.underground'),
        c0:bc[0], c1:bc[1], at:enumCode(id, 'at', t.at === undefined ? 'point' : t.at, 'trigger.at'), lift:lift,
        place:t.place === undefined ? -1 : enumCode(id, 'place', t.place, 'trigger.place'),
        spec:t.color === undefined ? -1 : colorSpec(id, t.color)}));
      cols.trig[r] |= 4;
    } else if (form === 'anchor') {
      if (!anchorCodes.hasOwnProperty(t.anchor)) fail(id, 'unknown anchor ' + t.anchor);
      leaf(id, 'num0', t.rate, 'trigger.rate');
      if (t.radius !== undefined) leaf(id, 'num0', t.radius, 'trigger.radius');
      if (t.maxAnchors !== undefined && !(Number.isInteger(t.maxAnchors) && t.maxAnchors > 0)) fail(id, 'trigger.maxAnchors must be a positive integer');
      cols.anchorRate[r] = t.rate; cols.anchorMax[r] = t.maxAnchors || 0; cols.anchorRadius[r] = t.radius || 0;
      anchorRecipes[anchorCodes[t.anchor]].push(r); cols.trig[r] |= 8;
    } else {
      var f = fields[t.field], wf = !!f && f.target === 'weather';
      if (!f) fail(id, 'unknown field ' + t.field);
      if (t.visible !== undefined) enumCode(id, 'visible', t.visible, 'trigger.visible');
      if (t.kind !== undefined) {
        if (!wf) fail(id, 'trigger.kind is only for a weather field');
        enumCode(id, 'weatherKind', t.kind, 'trigger.kind');
      } else if (wf) fail(id, 'a weather field trigger needs kind');
      if (wf && t.sets !== undefined) fail(id, 'a weather field trigger takes kind, not sets');
      if (t.aboveSnowLine !== undefined) {
        if (!wf) fail(id, 'trigger.aboveSnowLine is only for a weather field');
        if (!source.hasOwnProperty(t.aboveSnowLine)) fail(id, 'trigger.aboveSnowLine names unknown recipe ' + t.aboveSnowLine);
        cols.snowAlt[r] = ID[t.aboveSnowLine];
      }
      var fm = fieldMembers[t.field] || (fieldMembers[t.field] = {});
      var sets = t.sets || (t.kind ? {} : null);
      if (!sets) fail(id, 'field trigger needs sets or kind');
      if (t.kind) sets = Object.assign({}, sets), sets[t.kind] = t.weight === undefined ? 1 : t.weight;
      Object.keys(sets).forEach(function (s) {
        if (t.sets && !(f.sets && f.sets.hasOwnProperty(s))) fail(id, 'field ' + t.field + ' has no set ' + s);
        if (!(Number.isFinite(sets[s]) && sets[s] >= 0)) fail(id, 'field weight for ' + s + ' must be >= 0');
        (fm[s] || (fm[s] = [])).push({r:r, weight:sets[s], visible:t.visible || 'always'});
      });
      cols.trig[r] |= 16;
    }
  }

  var U8 = 'cls layer prim motion collision stratum occ light view2D mode2D blend place selfView envelope toggle family sizeTier ' +
    'shape support direction wall untilGround jitter trig halfSpace';
  var F64 = 'gravity dragCoef wind turbAmp turbW restitution friction restMin restMax fadeIn fadeOut pulseW pulseD grow streakS ' +
    'glowMul glowA size0 size1 len0 len1 alpha0 alpha1 life0 life1 minPx minPx2D maxPx near far farKeep cull glowFar nightBoost ' +
    'onFloorChance childNear meanLife rad0 rad1 hgt0 hgt1 lift0 lift1 spread spd0 spd1 up0 up1 inherit spin0 spin1 ' +
    'anchorRate anchorRadius pNear pDist pDrop pRadius pArc';
  var R = {};
  U8.split(' ').forEach(function (k) { R[k] = new Uint8Array(n); });
  F64.split(' ').forEach(function (k) { R[k] = new Float64Array(n); });
  R.child = new Int16Array(n); R.maxLive = new Uint16Array(n); R.bounces = new Uint16Array(n); R.salt = new Uint32Array(n);
  R.colorSpec = new Int32Array(n); R.glowPal = new Int32Array(n);
  R.api0 = new Uint16Array(n).fill(1); R.api1 = new Uint16Array(n).fill(1);      // fxEmit count unless the call gives one
  R.anchorMax = new Uint16Array(n);
  R.snowAlt = new Int16Array(n).fill(-1);                                     // a weather member's swap above the snow line
  var TOGGLES = [null].concat(toggles), FAMILIES = [null].concat(families), TIERS = [null].concat(tiers);
  function mean(v) { return (v[0] + v[1]) / 2; }

  recipes.forEach(function (d, r) {
    var id = ids[r], sp = d.spawn, mo = d.motion, co = d.collision, li = d.life, re = d.render, lod = d.lod, pp = d.placeParams;
    var place = FX_ENUMS.place[d.place], screenSpace = place === 'eye' || place === 'screen';
    var noOcclusion = FX_ENUMS.occlusion[d.occlusion] === 'none';
    if (screenSpace && (!noOcclusion || co.mode !== 0 || co.wall || d.view2D !== 0))
      fail(id, 'place ' + place + ' needs occlusion none, collision none and view2D none');
    if (noOcclusion && !screenSpace) fail(id, 'occlusion none is only for eye and screen');
    if (lod.near >= lod.far) fail(id, 'lod.near must be below lod.far');
    var prim = FX_ENUMS.primitive[d.render.primitive];
    if (prim === 'streak' && !(re.streakSeconds > 0)) fail(id, 'streak needs render.streakSeconds');
    if (prim === 'segment' && !(re.length[1] > 0)) fail(id, 'segment needs render.length');
    if (prim === 'glowDot' && !(re.glow > 0)) fail(id, 'glowDot needs render.glow');
    if (FX_ENUMS.mode2D[d.mode2D] === 'splashOnly' && co.onFloor === null) fail(id, 'mode2D splashOnly needs collision.onFloor (its 2D splash)');
    R.colorSpec[r] = colorSpec(id, d.color);
    R.glowPal[r] = -1;
    if (re.glowRole !== null) {
      if (typeof d.color === 'string') fail(id, 'glowRole needs a fixed color material (dynamic source ' + d.color + ')');
      var gm = material(d.color.material);
      if (!_fxHas(gm.packed, re.glowRole)) fail(id, 'material ' + d.color.material + ' has no glowRole ' + re.glowRole);
      R.glowPal[r] = intern(gm.packed[re.glowRole]);
    }
    if (Array.isArray(d.trigger) && !d.trigger.length) fail(id, 'trigger list is empty');
    (Array.isArray(d.trigger) ? d.trigger : [d.trigger]).forEach(function (t) { triggerOf(id, r, t, d, R); });
    var model = FX_ENUMS.model[mo.model], md = _FX_MODELS[model], staticModel = model === 'static';
    var drag = mo.drag === undefined ? md.drag : mo.drag, up = staticModel ? [0, 0] : sp.up, speed = staticModel ? [0, 0] : sp.speed;
    var gravity = staticModel ? 0 : mo.gravity !== undefined ? mo.gravity :
      model === 'fall' ? drag * Math.max(0, -mean(up)) : model === 'rise' ? -drag * Math.max(0, mean(up)) : md.gravity;
    // The integrator couples wind through drag (v relaxes to wind x W), so a
    // wind coefficient without drag would do nothing.
    if (!staticModel && mo.wind > 0 && !(drag > 0)) fail(id, 'motion.wind needs drag > 0 (wind acts through drag)');
    R.cls[r] = d.class; R.layer[r] = screenSpace ? 2 : d.layer; R.prim[r] = d.render.primitive; R.motion[r] = mo.model;
    R.collision[r] = co.mode; R.stratum[r] = co.stratum; R.occ[r] = d.occlusion; R.light[r] = d.lighting;
    R.view2D[r] = d.view2D; R.mode2D[r] = d.mode2D; R.blend[r] = re.blend; R.place[r] = d.place; R.selfView[r] = d.selfView;
    R.envelope[r] = li.envelope; R.toggle[r] = TOGGLES.indexOf(d.toggle); R.family[r] = FAMILIES.indexOf(d.family);
    R.sizeTier[r] = TIERS.indexOf(d.sizeTier); R.shape[r] = sp.shape; R.support[r] = sp.support; R.direction[r] = sp.direction;
    R.wall[r] = co.wall ? 1 : 0; R.untilGround[r] = li.untilGround ? 1 : 0; R.jitter[r] = d.jitter; R.halfSpace[r] = sp.halfSpace ? 1 : 0;
    R.gravity[r] = gravity; R.dragCoef[r] = drag; R.wind[r] = staticModel ? 0 : mo.wind;
    R.turbAmp[r] = mo.turbulence; R.turbW[r] = 2 * Math.PI * mo.turbHz; R.spin0[r] = mo.spin[0]; R.spin1[r] = mo.spin[1];
    R.restitution[r] = co.restitution; R.friction[r] = co.friction; R.bounces[r] = co.bounces;
    R.restMin[r] = co.restSeconds[0]; R.restMax[r] = co.restSeconds[1]; R.onFloorChance[r] = co.onFloorChance; R.childNear[r] = co.childNear;
    R.fadeIn[r] = li.fade[0]; R.fadeOut[r] = li.fade[1]; R.pulseW[r] = 2 * Math.PI * li.pulseHz; R.pulseD[r] = li.pulseDepth;
    R.life0[r] = li.seconds[0]; R.life1[r] = li.seconds[1];
    R.grow[r] = re.grow; R.streakS[r] = re.streakSeconds; R.glowMul[r] = re.glow; R.glowA[r] = re.glowAlpha;
    R.size0[r] = re.size[0]; R.size1[r] = re.size[1]; R.len0[r] = re.length[0]; R.len1[r] = re.length[1];
    R.alpha0[r] = re.alpha[0]; R.alpha1[r] = re.alpha[1]; R.minPx[r] = re.minPx; R.maxPx[r] = re.maxPx;
    R.minPx2D[r] = re.minPx2D === null ? re.minPx : re.minPx2D;          // the 2D floor (1 u = 1 px): minPx unless set
    R.near[r] = lod.near; R.far[r] = lod.far; R.farKeep[r] = lod.farKeep; R.cull[r] = lod.cull; R.glowFar[r] = lod.glowFar;
    R.nightBoost[r] = d.nightBoost; R.maxLive[r] = d.budget.maxLive || EFFECT_CONFIG.capacity;
    R.rad0[r] = sp.radius[0]; R.rad1[r] = sp.radius[1]; R.hgt0[r] = sp.height[0]; R.hgt1[r] = sp.height[1];
    R.lift0[r] = sp.lift[0]; R.lift1[r] = sp.lift[1]; R.spread[r] = sp.spread; R.spd0[r] = speed[0]; R.spd1[r] = speed[1];
    R.up0[r] = up[0]; R.up1[r] = up[1]; R.inherit[r] = staticModel ? 0 : sp.inherit;
    R.pNear[r] = pp.near; R.pDist[r] = pp.distance; R.pDrop[r] = pp.drop; R.pRadius[r] = pp.radius; R.pArc[r] = pp.arc;
    var salt = 0x811c9dc5;
    for (var k = 0; k < id.length; k++) salt = Math.imul(salt ^ id.charCodeAt(k), 16777619);
    R.salt[r] = salt >>> 0;
    // Turnover (section 4.7): a ground-ended life is the fall time.
    var life = mean(li.seconds), support = FX_ENUMS.support[sp.support], meanLife = life;
    if (li.untilGround && support === 'ceiling') {
      var v0 = Math.max(0, -mean(up)), g = gravity;
      meanLife = Math.min(life, g > 0 ? (Math.sqrt(v0 * v0 + 200 * g) - v0) / g : v0 > 0 ? 100 / v0 : life);
    } else if (li.untilGround && (support === 'openSky' || support === 'viewer') && Math.abs(mean(up)) > 0) {
      meanLife = Math.min(life, mean(sp.height) / Math.abs(mean(up)));
    }
    if (!(meanLife > 0)) fail(id, 'mean life ' + meanLife + ' is not positive');
    R.meanLife[r] = meanLife;
    LIST.push(Object.freeze(Object.assign({id:id}, merged[id])));
  });
  // Children: onFloor targets must be child-triggered and acyclic.
  recipes.forEach(function (d, r) {
    var seen = [ids[r]], at = d.collision.onFloor;
    R.child[r] = at === null ? -1 : ID[at];
    while (at !== null) {
      if (!(R.trig[ID[at]] & 2)) fail(ids[r], 'onFloor target ' + at + ' needs trigger {child:true}');
      if (seen.indexOf(at) >= 0) fail(ids[r], 'onFloor cycle ' + seen.concat(at).join(' > '));
      seen.push(at); at = recipes[ID[at]].collision.onFloor;
    }
  });
  Object.keys(fieldMembers).forEach(function (f) {
    Object.keys(fieldMembers[f]).forEach(function (s) {
      if (!fieldMembers[f][s].some(function (m) { return m.weight > 0; })) fail(f, 'every weight of set ' + s + ' is zero');
    });
  });
  // Fields in source order (code = index): the box, the set of each biome
  // (or of an underground player; a weather field: of each weather kind) and
  // each set's members as typed columns. A set's refill life is
  // turnover-weighted: sum w / sum (w / mean life). A weather set's members
  // share one 2D policy; a splashOnly set spawns its splash (the members'
  // collision.onFloor) in 2D.
  var FIELDS = [], FIELD_ID = {};
  Object.keys(fields).forEach(function (name, code) {
    var f = fields[name], out = {name:name, code:code, biomeSet:{}, underSet:-1, sets:[], setNames:[], weather:false, twoDScale:1};
    function no(why) { throw new Error('Particle field ' + name + ': ' + why); }
    if (!isObj(f)) no('not an object');
    Object.keys(f).forEach(function (k) { if ('box edgeFade target sets mode2D twoDScale'.split(' ').indexOf(k) < 0) no('unknown key ' + k); });
    if (!isObj(f.box) || Object.keys(f.box).some(function (k) { return k !== 'half' && k !== 'bias'; }) ||
        !(f.box.half > 0) || !(Number.isFinite(f.box.bias) && f.box.bias >= 0)) no('box needs half > 0 and bias >= 0');
    if (!(f.edgeFade >= 0 && f.edgeFade <= 0.5)) no('edgeFade must be 0..0.5');
    if (f.target !== undefined && f.target !== 'setting' && f.target !== 'weather') no('target must be setting or weather');
    if (f.twoDScale !== undefined && !(f.twoDScale >= 0 && f.twoDScale <= 1)) no('twoDScale must be 0..1');
    out.weather = f.target === 'weather'; out.twoDScale = f.twoDScale === undefined ? 1 : f.twoDScale;
    if (out.weather && (f.sets !== undefined || f.mode2D !== undefined)) no('a weather field takes its sets from the weather kinds and its 2D policy from its members');
    out.half = f.box.half; out.bias = f.box.bias; out.edgeFade = f.edgeFade;
    out.mode2D = FX_ENUMS.mode2D.indexOf(f.mode2D === undefined ? 'simulate' : f.mode2D);
    if (out.mode2D < 0) no('mode2D ' + f.mode2D + ' is not one of ' + FX_ENUMS.mode2D.join(' '));
    out.salt = 0x811c9dc5;
    for (var k = 0; k < name.length; k++) out.salt = Math.imul(out.salt ^ name.charCodeAt(k), 16777619);
    out.salt >>>= 0;
    (out.weather ? FX_ENUMS.weatherKind : Object.keys(f.sets || {})).forEach(function (set, si) {
      var v = out.weather ? null : f.sets[set], m = (fieldMembers[name] || {})[set] || [], sw = 0, sl = 0;
      if (!out.weather) {                                                    // (weather set si is kind si)
        if (v === 'playerUnderground') { if (out.underSet >= 0) no('two underground sets'); out.underSet = si; }
        else if (Array.isArray(v) && v.length) v.forEach(function (b) {
          if (typeof b !== 'string' || out.biomeSet.hasOwnProperty(b)) no('set ' + set + ' repeats or misnames biome ' + b);
          out.biomeSet[b] = si;
        });
        else no('set ' + set + ' must list biomes or be playerUnderground');
      }
      var col = {name:set, r:new Int32Array(m.length), w:new Float64Array(m.length), steady:new Float64Array(m.length),
        vis:new Uint8Array(m.length), ceiling:new Uint8Array(m.length), life:0, mode2D:m.length ? R.mode2D[m[0].r] : 0, splash:-1};
      m.forEach(function (mem, j) {
        col.r[j] = mem.r; col.w[j] = mem.weight; col.steady[j] = mem.weight * R.meanLife[mem.r];   // live share
        col.vis[j] = FX_ENUMS.visible.indexOf(mem.visible);
        col.ceiling[j] = FX_ENUMS.support[R.support[mem.r]] === 'ceiling' ? 1 : 0;
        if (mem.weight > 0) { sw += mem.weight; sl += mem.weight / R.meanLife[mem.r]; }
        if (out.weather && R.mode2D[mem.r] !== col.mode2D) no('the ' + set + ' members disagree on mode2D');
      });
      if (out.weather && FX_ENUMS.mode2D[col.mode2D] === 'splashOnly') col.splash = R.child[m[0].r];
      col.life = sl > 0 ? sw / sl : 1;
      out.sets.push(Object.freeze(col)); out.setNames.push(set);
    });
    FIELD_ID[name] = code; FIELDS.push(Object.freeze(out));
  });
  var PAL = {count:palRGB.length, rgb:Int32Array.from(palRGB), specSrc:Uint8Array.from(specSrc),
    specStart:Int32Array.from(specStart), specCount:Int32Array.from(specCount), cand:Int32Array.from(cand),
    cum:Float64Array.from(cum), surf:Int32Array.from(surf), surfBiomes:Object.freeze(surfBiomes),
    ore:Int32Array.from([].concat.apply([], ore))};
  return Object.freeze({count:n, LIST:Object.freeze(LIST), ID:Object.freeze(ID), R:Object.freeze(R), PAL:Object.freeze(PAL),
    bindings:Object.freeze(bindings.map(Object.freeze)), anchorRecipes:Object.freeze(anchorRecipes.map(Object.freeze)),
    fieldMembers:fieldMembers, FIELDS:Object.freeze(FIELDS), FIELD_ID:Object.freeze(FIELD_ID),
    SPELLS:Object.freeze(spellBits), TOGGLES:Object.freeze(TOGGLES),
    FAMILIES:Object.freeze(FAMILIES), TIERS:Object.freeze(TIERS)});
}
var FX_COMPILED = compileFxRecipes(FX_RECIPE_SOURCE, FX_MATERIALS);
// Weather rules, validated at load (the only other throw here): each
// biome's kind code and chance, the population by kind code, and the ranges.
function compileFxWeatherRules(rules) {
  function no(why) { throw new Error('Weather rules: ' + why); }
  function pair(k, lo) {
    var v = rules[k];
    if (!Array.isArray(v) || v.length !== 2 || !(v[0] >= lo && v[1] >= v[0])) no(k + ' must be [min,max] from ' + lo);
    return v;
  }
  var out = {biomeKind:{}, biomeChance:{}, population:new Float64Array(3)};
  pair('frontSeconds', 1); pair('intensity', 0); pair('windSpeed', 0); pair('caveVisibility', 0);
  if (!(rules.caveVisibility[1] > rules.caveVisibility[0])) no('caveVisibility must rise');
  if (!(rules.crossfadeSeconds > 0) || !(rules.windEaseSeconds > 0) || !(rules.refillBoost >= 1)) no('crossfade, wind ease and refill boost must be positive');
  if (!Number.isFinite(rules.snowLineH)) no('snowLineH must be a number');
  Object.keys(rules.biomes).forEach(function (b) {
    var r = rules.biomes[b], kind = FX_ENUMS.weatherKind.indexOf(r && r.kind);
    if (kind < 0 || !(r.chance >= 0 && r.chance <= 1)) no('biome ' + b + ' needs a weather kind and a chance 0..1');
    out.biomeKind[b] = kind; out.biomeChance[b] = r.chance;
  });
  FX_ENUMS.weatherKind.forEach(function (kind, k) {
    if (!(rules.population[kind] >= 0)) no('population ' + kind + ' must be >= 0');
    out.population[k] = rules.population[kind];
  });
  return Object.freeze(out);
}
var FX_WEATHER = compileFxWeatherRules(FX_WEATHER_RULES);
