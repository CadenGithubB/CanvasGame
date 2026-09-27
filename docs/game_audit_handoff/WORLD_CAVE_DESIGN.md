# World and cave design — working decisions

Date: 2026-09-20
Status: product discussion; no gameplay implementation authorized by these notes.
Local working/handoff material: do not stage or commit this document.

## Confirmed by the user

1. Cave entry must be seamless, not a doorway/loading transition.
2. When an entrance exists, the surrounding environment should be shaped to
   fit that entrance. Where there is no entrance, ordinary terrain generation
   should continue as before.
3. The initial target is mostly winding tunnels and chambers. Keep the
   architecture open to future expansion without implementing that expansion
   now.
4. Walking back out is sufficient for this phase. Normalize the existing world,
   make it work reliably, and make it look good before adding more elaborate
   traversal and world-enrichment features.
5. Support both entrances that descend into the ground and surface-level
   entrances where the terrain allows them, such as a hillside.
6. Cave floors may rise after entering: the user explicitly permits a passage
   rising from an entrance elevation of -10 toward -5, provided there is
   adequate ceiling/space to accommodate it. There is no rule that floors must
   remain at or below the mouth. Terrain, passage height, and roof must fit
   together; a floor at +10 against ground at 0 was their invalid example.
7. Entrance appearance should vary automatically along a natural-to-constructed
   continuum, not through a player-facing slider. The user suggested seed /
   generation as the basis for choosing the appearance.
8. Custom cave design should mean choosing themes and characteristics together,
   then generating the layout, rather than manually specifying exact rooms and
   connections. The user prefers this approach to keep designs custom. This
   remains a design-discussion request, not authorization to build an editor.
9. Generate a mixture of sizes: most caves should be smaller, while the less
   common larger caves should be more impressive.
10. Rubble blockages are permanent. The current design direction is fixed
    terrain and cave layouts, with no world-changing mechanics such as digging,
    clearing collapsed passages, terrain destruction, or building. The user's
    wording leaves future reconsideration possible; none of these mechanics is
    part of this phase. Ordinary enemy/chest state is separate; see decision 14.
11. Caves should become darker, but only to a readable limit; pitch-black
    navigation is not wanted. Build on the existing lighting system. The exact
    visual brightness level should be tuned in a prototype, not assumed from
    a numerical ambient setting.
12. Most caves should have one entrance. Larger caves may have two, with the
    openings close together, far apart, or anywhere between. Two entrances
    are an allowed variation for large caves, not mandatory for all of them;
    no exact spacing or frequency has been set.
13. Enemies may follow the player through cave entrances in either direction
    when a connected path exists and they physically fit. The entrance is not
    a special safety barrier. Normal chase-distance rules can still apply;
    their exact limits remain undecided. Enemies should not see or attack
    through the surrounding rock.
14. During the same run, defeated cave enemies should stay gone and looted
    chests should not refill. The user's reason is to encourage continued
    exploration of the map. Leaving, travelling far enough to unload an area,
    and returning must not reset cleared progress. See decision 20 for the
    subsequently confirmed cross-session resume requirement.
15. The user wants the wider map to gain meaningful places and a sense of scale
    beyond its current endless-expanse feel. They suggested multiple places,
    monuments, or civilizations amid the existing biome variety. This opens a
    world-design discussion. See decision 18 for the selected initial inhabited
    scale; detailed factions, roads, and progression remain unspecified.
16. The user is interested in a mixture of inhabited places and remnants of
    past civilizations. Their initial feasibility concern was addressed by
    comparing simple outposts with larger town simulation; see decision 18.
17. The user approves occasional recognizable landmarks to travel toward,
    with smaller unexpected discoveries along the way. Rendering distant
    landmarks at the desired scale still needs technical validation.
18. Start with the smaller inhabited-world version: occasional small occupied
    camps/outposts with simple residents/services amid wilderness and older
    ruins. Bustling towns and full civilization simulation are deferred. Exact
    population and resident roles remain open; see decision 19 for protection.
19. Inhabited outposts should be protected trading places. Enemy pursuit/attacks
    must not endanger the player or residents within their protected area.
    This is distinct from seamless cave entrances, which still permit pursuit.
    The exact boundary, hostile movement, and projectile/attack behavior across
    that boundary need an implementation policy; protection is a requirement,
    not proof that the current market safety code already enforces it fully.
20. Reopening the game should resume the existing world and progress by default.
    The user also asked whether saving already exists; inspection found no
    durable game save/load path. See decision 21 for save location; the exact
    New World/reset UI remains open.
21. Limit saving/resuming to the same browser for the first version. No
    cross-device synchronization or HardwareOne-side save backend is requested.
    Browser-local storage details, recovery, and backup/export remain technical
    design work; no persistence implementation has occurred in this discussion.

## User ideas to prototype — tentative, not fixed requirements

- Larger caves might be the least run down. The relationship between size,
  grandeur, and condition is not yet a universal rule.
- Smaller caves could contain at least one hallway blocked by rubble, implying
  they once extended farther. This is the user's proposed small-cave detail;
  whether every small cave must have it remains unsettled. Any such rubble is
  confirmed to be permanent rather than clearable.
- Mix close passages and roomier spaces. The user is unsure of the exact feel;
  prefer a visual/walkthrough comparison later over demanding numeric ratios.

## Proposed interpretation — not yet confirmed

- Entrance shaping is a local blend into the surrounding terrain, with no
  hard seam at its outer boundary. Unaffected terrain retains its ordinary
  generated shape.
- Normal cave exploration should not require jumping, climbing, or dropping
  off a ledge that prevents walking back out.
- Preserve room in the spatial model for future vertically separated spaces;
  do not add multi-storey cave generation, bridges, shafts, or climbing now.
- Geometry shared by terrain, entrance visuals, collision, and lighting should
  describe the same opening and passage. This is an engineering recommendation,
  not a user choice of implementation.
- A surface-level entrance means walking into a hill at approximately the
  outside approach height, while the passage remains enclosed by the hill.
- Validate two separate clearances: enough floor-to-ceiling space for walking
  and enough terrain/rock above the ceiling to keep a covered tunnel enclosed.
  A visually valid ceiling alone does not establish physical player clearance.
  Exact headroom, slope limits, and cover thickness are engineering choices to
  propose and test, not numbers the user has supplied.
- Compute and retain entrance terrain shaping during chunk generation; measure
  its generation cost and runtime impact rather than promising a performance
  budget before implementation.
- An entrance-style continuum can range from untouched rock through roughly
  carved or partly reinforced openings to built masonry. Choose a stable,
  seeded style per cave so it does not reroll on revisiting. The exact visual
  stages remain proposals; no player-facing style slider is requested.
- Keep size, natural-to-built character, and condition as distinct recipe
  characteristics. Generation may correlate them (such as larger caves tending
  toward grander, more intact spaces) without making them identical concepts.
- For a permanent collapsed passage, generate a short visible branch with
  a solid rubble terminus. A full inaccessible network behind it is unnecessary.
  Collision, navigation, and item/enemy placement must recognize the boundary;
  do not place rewards in unreachable space or show a clearing prompt. No
  clearing/excavation interaction is planned.
- Initial passage-width variation should preserve comfortable upright walking,
  alternating narrower stretches with roomier sections/chambers. Judge the
  contrast in a later prototype, not through ungrounded numerical commitments.
- Use the existing lighting as the foundation for dim but readable cave
  interiors. Preserve visible nearby floor, wall shapes, and the route forward
  without requiring the player to find or maintain a light source. Local lights
  may add atmosphere and detail. Readability should survive night-time and
  entrance transitions; do not equate a nonzero ambient value with a verified
  final-image brightness floor.
- When a cave has two entrances, both must connect through the same walkable
  cave layout, respecting the agreed slope/headroom/cover constraints. Entrance
  placement and connecting routes must agree across chunk boundaries. Surface
  distance between openings and length of the interior route are distinct;
  nearby openings do not necessarily imply a tiny cave.

## Custom cave design sketch — proposal, not an implementation commitment

- Theme: materials, natural-to-built character, and decoration choices.
- Layout: generation rules describing desired winding passages, chambers,
  branching, scale, and slopes. Exact hand-authored room maps are not the
  current authoring target.
- Condition: degree of collapse, decay, and intact construction/rock. The
  relationship to cave size is a tentative design preference, not a hard rule.
- Placement: fit the chosen layout and entrances to the landscape using the
  same agreed elevation, cover, and walking-access rules as procedural caves.
- Seed: choose repeatable permitted variation; do not reroll an existing cave
  on revisiting it.

Custom recipes and default random caves should share the terrain/collision
construction path. Different seeds can produce different layouts from a recipe;
revisiting a particular generated cave should not create a new layout. No
editor UI, file format, scripting language, or specific theme library has been
agreed. The assistant owns those technical recommendations after understanding
the desired authoring experience.

## Wider-world identity — newly opened design direction

The user's aim is a more interesting world to explore, not merely additional
map area. A proposed direction is region-level recipes that relate major
destinations, smaller local sites, caves, architecture, and environmental clues.
These are proposals rather than agreed features:

- Major landmarks can establish a recognizable region and orientation.
- Smaller ruins, caves, markets, and other places can share a region's visual
  identity and implied history, while biome and cultural identity remain
  distinct concepts.
- Terrain features, paths, or repeated architectural motifs could suggest
  relationships between sites and provide reasons to choose a direction.
- Preserve stretches of wilderness and contrast between small discoveries and
  rare impressive destinations; no density or travel-time targets are set.
- Use authored theme/region recipes with seeded local variation, consistent
  with the cave-recipe direction. Stable generated places do not by themselves
  require terrain modification or a simulated civilization/economy.

The user selected a mixture of small inhabited places and older remnants.
They approve recognizable travel destinations plus
smaller discoveries along the way. Distant landmark visibility is an aspiration
to evaluate against terrain and renderer limits, not an existing verified
capability or a promise to raise draw distance.

### Inhabited places — selected initial scale; details remain proposals

- A small outpost with a stationary trader, a keeper with a short authored line,
  and a few idle residents is a substantially narrower feature than a simulated
  town. It still needs character visuals, friendly-entity identity/lifecycle,
  interaction handling, valid placement, and collision/visibility integration.
- Existing shops and entity rendering provide reusable foundations. They do
  not already supply general settlement NPCs, conversations, or civilian AI.
- Wandering inhabitants additionally need bounded movement/pathing and robust
  terrain/layer handling. Stabilizing shared spatial behavior comes first.
- Schedules, branching dialogue/quests, faction relations, production/trade
  simulation, population growth, and large crowds would each expand scope and
  are not part of this proposal.
- The selected first world direction is sparse small inhabited camps/outposts
  among wilderness, monuments, and older ruins. Population size, resident roles,
  and settlement frequency are not yet chosen. Outposts are confirmed protected
  trading areas; detailed protection mechanics remain to be specified.
- Nearby NPCs could be active while distant sites retain lightweight state;
  no whole-world population simulation is implied. Costs need measurement.
- Proposed first integrated example, after shared terrain/collision repairs:
  one small outpost with a trader and a couple of simple residents, a nearby
  recognizable landmark, and a cave sharing the area's theme. Validate this
  small scene before expanding settlement distribution. This is a prototype
  recommendation, not a commitment to specific content or NPC counts.

Resume-by-default across sessions, limited to the same browser, is confirmed.
Cross-device continuation and device-backed game saving are outside this phase.

### Durable saving — proposed implementation direction

- Persist the world seed and generation version, player position/progression,
  equipment and inventory, discoveries, and durable changes such as defeated
  enemies and collected loot. Saving a seed alone does not preserve progress.
- Reconstruct unchanged generated terrain; use stable entity identities and
  saved changes instead of serializing the entire endless map or rendering
  buffers. Fix the known chunk-eviction gaps as part of state ownership.
- Autosave/checkpointing, save version validation, recovery, and explicit new-
  world behavior need design and tests. Do not overwrite an incompatible or
  unreadable save as if it were a deliberate new run.
- Browser-local storage is the chosen initial direction, keeping implementation
  within game-side code. Saves do not automatically follow another browser,
  browser profile, device, or game origin/address; deployment-address changes
  and development previews need an explicit migration/export story if required.
- Clearing browser site data can erase local saves. Consider manual backup /
  export/import as a safeguard; these controls are recommendations, not yet
  confirmed features. Detect storage/write failures and do not falsely claim
  progress has been saved.
- Device-backed saves, cloud services, and cross-device sync are out of scope.
  No particular browser-storage API or save-file format has been selected.

## Verified current implementation facts

- `assets/games/src/05-endless-world.js` already adds large-scale geography
  elevation to detailed terrain height (around lines 1170–1189). Hills/valleys
  are supported; the geography contribution is reduced near the spawn point.
- Current cave floors are based on negative depth (`floorZ = -bestDepth` in
  `queryCaveGeometry`), with additional cover clamping. This is not yet the
  terrain-aware selection of descending versus hillside entrances requested
  here. Existing height variation does not mean that feature already works.
- Existing lighting includes day/night ambient and sunlight, cave ambient
  adjustment (`17-input-lighting-update.js`), torch/sconce and entrance point
  lights, baked static light contributions, and an underground player light
  (`07-decorations-lighting.js`). This is existing code, not new work from the
  design discussion.
- Cave ambient currently uses `Math.min(ambientLight, 0.45)`: an upper cap,
  not a minimum-visibility guarantee. The night-time base ambient is 0.32.
  Disabling the day/night cycle also returns before underground detection and
  cave ambient handling in `updateDayNight`. Render shading still needs its
  own validation; a scalar ambient value is not final perceptual brightness.
- Surface generation already contains markets, shrines, small hut/tower/hall
  ruins, and larger fortresses, arenas, and watchtowers. The large structures
  use seeded region placement with biome-influenced types and palettes;
  markets/shrines/ruins use separate seeded placement and spacing checks in
  `05-endless-world.js`. These existing ingredients do not establish a connected
  settlement, civilization, or region-history system.
- `04-shop.js` contains purchase/service logic; current markets use a shared
  shop marker/proximity interaction. `19-companions-loot.js` has moving/rendered
  companions and uses the shared entity-rendering helper. These are useful
  building blocks, not a complete friendly-NPC or settlement framework.
- `18-arena-fortress.js` already spawns named soldier allies and updates their
  following, movement, and combat. Allied characters are another reusable
  foundation, but following/teleporting companions are not resident behavior.
- Markets already have a player-chase suppression check near the shop marker
  (`11-enemies.js`) and a defensive tower (`10-combat.js`). These do not
  establish universal invulnerability. The newly confirmed protected-outpost
  policy will require validation beyond these existing checks; cave-entrance
  pursuit approval does not override outpost protection.
- There is no durable game save/load path in the inspected game sources.
  `entityDeltas` and chunk state are JavaScript memory only. `saveAllEntityDeltas`
  preserves some chest/shrine/exploration changes across chunk reassembly, but
  live enemy state is held in chunks and lacks equivalent eviction persistence.
- `resetEndlessMode()` clears chunks/deltas, generates a new seed, resets
  player progress, and starts at the origin. Endless launch calls that reset;
  ordinary Start resets a level. `stopGame()` stops polling/updates without
  writing a save. Game network calls concern sensors/system/debug operations,
  not game-state saving; no browser-storage or durable restore calls were found.

## Proposed visual acceptance checks

- In deep interiors without a nearby local light, nearby walkable floor,
  passage boundaries, and room shapes remain readable in daytime and at night.
  Distant recesses or small shadow details need not be uniformly illuminated.
- Walking through an entrance in either direction should change lighting
  smoothly; floor, walls, and ceiling should not switch brightness abruptly or
  disagree conspicuously. Looking back out should preserve a readable opening.

## Proposed implementation sequence — no gameplay work started

The high-level brief is sufficient to define the first technical milestone.
Remaining aesthetic choices should be evaluated in focused prototypes rather
than continuing to ask for unsupported numerical preferences.

1. Establish shared spatial/entrance facts and reliable traversal. Use small
   deterministic descending-entrance and hillside-entrance fixtures; verify
   terrain blending, walkable slopes, headroom, cover, and walking back out.
   Keep room in the model for future layered spaces without generating them.
2. Reconcile lighting, rendering, interactions, and actor use of those facts.
   Verify dim-but-readable caves and physically valid pursuit through mouths.
3. Establish stable generated identities and durable progress, then implement
   browser-local autosave/resume with validated/versioned saves. Clear-state
   persistence must survive chunk eviction as well as closing/reopening.
4. Build and review a small themed example with a cave, landmark, and protected
   outpost/simple residents before expanding seeded regional content variety.

The first milestone is geometry/traversal, not all new content at once. This
sequence is a recommendation for the next implementation plan, not a claim
that any listed feature has already been built or tested.

## Still open for later rounds

- How broad/gentle approaches and passages should feel at player scale.
- Prototype the tentative tendency for larger caves to be more intact/grand
  and smaller caves to feel like surviving fragments of larger places.
- Whether to raise local terrain to support an entrance or prefer relocation
  when the existing landscape cannot accommodate it naturally.
- Detailed branching/dead-end balance and exploration length; multiple-exit
  policy is settled, while frequency and spacing will need prototype tuning.
- Tune the confirmed dim-but-readable lighting target, daylight transitions,
  and visibility back outside in a prototype.
- Enemy chase distances and detailed combat behavior; crossing the mouth is
  allowed when the path and physical clearance permit it.
- Save recovery, backup/export, and fresh-world/reset semantics. Same-browser
  resume is confirmed; defeated enemies and collected loot must remain changed.

## Scope guardrails

- Continue discussion in short, concrete rounds, distinguishing confirmed
  decisions from suggested defaults and new capabilities.
- No gameplay edits in this design round. The completed source/workflow
  separation remains behavior-preserving.
- Keep this work on `codex/html-game`; do not touch the other Mac's G2/audio
  scope or shared firmware configuration.
- Existing test results describe the audited implementation, not proof that
  these proposed design requirements have been implemented or verified.
