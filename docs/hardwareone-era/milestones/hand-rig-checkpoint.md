# Articulated hand checkpoint — 20 September 2026

The new work is a neutral-grey, single right-hand motion prototype, not approved
production artwork. It runs in the actual Canvas2D game at
[the local preview](http://127.0.0.1:8001/).

Choose **Cave Test → Casting studio → Hand motion study**. **Play hand study
(¼ speed)** runs the gesture; the phase selector, timeline and side/back views
allow inspection. All further checks stay in the small browser preview, as
requested. The rejected flat artwork is archived and off in normal gameplay.

Implemented: joint-driven finger curl, thumb opposition, wrist/forearm rotation,
deforming neutral cuff, perspective projection, moving surface shading, reusable
mesh topology, and isolated preview state. No WebGL, image pose atlas, reduced
resolution, world-depth bypass, or terrain/collision changes are used by this rig.

The 924-vertex/1704-triangle rig took 0.5–0.6 ms to build, and 0.9–1.0 ms median
render-command time in the Mac mini's 360×240 daylight/dusk previews (1.1 ms p95).
Whole-frame median increased from 10.6 to 11.6 ms; actual browser intervals were
16.7 ms median for both. This is one hand in a fixed scene, not a phone, full
gameplay, or two-hand/spell benchmark. [Recorded measurements](hand-rig-preview-measurements.json)
include first-use, steady command time and browser cadence separately.

Verification: 65 core plus optional smoke test cases passed. Focused rig checks
cover winding, joint deformation, bone lengths, wrist attachment, deterministic
poses, projection, and no gameplay/world-depth writes, with winding/deformation
mutation checks. Studio state/input restoration also has focused coverage.

Remaining before production: continuous finger/palm webbing and thumb saddle;
better joint contours; exact self-occlusion for intersecting/crossed-finger poses;
final skin/nails/cloth; and mapping the approved gesture onto actual missile
release. Small sorting errors remain around intersecting finger roots. The study
light is not a finished unified colored-lighting system.

The separate earlier, user-approved 120 ms missile wind-up remains on the game
branch with queue/cancellation regressions. The 2800 ms slow study does not cast
anything or alter that gameplay timing. The user's existing uncommitted material,
terrain-exit and prop-cache work remains preserved. No commit or push was made.

Next approval gate: judge the hand's volume and movement before investing in
final materials or extending the rig to both hands and the spell set.
