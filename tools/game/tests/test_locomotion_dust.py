"""Footstep, landing and dash dust from the movement observers on the unified particle engine (slice S6)."""

from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

HARNESS = Path(__file__).with_name("locomotion_dust.js")
# G1-G5 (G1: the 2D stride and feet, steps, a dash, its trail, a landing and
# an NPC's steps on a slope, wall tops, a walk step down, 2D drawing and the
# kick-back of steps, the dash burst, its trail and an NPC's steps, a
# non-follow camera looking at the feet and one facing away, first person at
# pitch 0 and +1.4, a player-owned puff in view, airborne; the density,
# distance-LOD accounting and Particles 0 idling of one-puff steps, the 2D
# view's bounds, corners and centre, far 3D puffs; G2: the first-person dash
# and its trail, the 2D trail, a portrait canvas and its puff sizes, the
# frontSides override in view, with no ground (no eviction, no allocation),
# an airborne dash and its screen puffs; G3: the scaled landing, the 6-tick
# threshold, the clamp, the first-person refusal, the 2D landing rings; G4:
# the chunk crossing, the teleport and the walk after it; G5: NPC strides and
# strata, their sides, unwritten records and colours, a stunned body
# released, the radius, the per-tick caps with a slime, the hopping slime
# idle and following, the roof test), the load-time observer tables, the
# Endless and authored surface colours, the player's cave dust, the preset
# and Unified switches, the random streams, plus load, runtime failures and
# stage/console errors: 58 after the second S6 review round. S9 (the S6
# verifier's surviving hand mutants): steps over a cave's walls (the
# gridCave wall-top fixture), the airborne dash's support in real jumps and
# on authored geometry (2), Particles 0 and back (3), another body's dash,
# the frontSides wedge's sides, pitch and walls (3), no NPC scan with the
# preset off, and the portrait screen height: 70. The S9 fix (the S9
# review's surviving hand mutants): an airborne dash in a real jump inside a
# cave, an NPC teleport's stride restart, and a support reach of one step
# with 25 u included (the dash support rule table gained five rows in its
# existing check): 73. The water system merge: no ground dust under a water
# surface (wading) for the player's steps and landing (with a water-off
# control), a dash's burst and trail, and an enemy's steps: 76.
PASS_COUNT = 76
SENTINEL = f"LOCOMOTION_DUST_RESULT PASS {PASS_COUNT}"

WADE_PLAYER = ("wading: the player's steps and landing laid under a lake's surface kick up no dust (counted); "
               "the steps either side of it do, and with the water system off so do those in the band")
WADE_DASH = "wading: a dash into a lake lays no burst where it starts in the water and no trail puff while it runs through it"
WADE_NPC = "wading: an enemy walking through the lake lays no dust in it and its puffs either side"

# Each mutation must fail every named check; setup failures and crashes do not count.
MUTATIONS = {
    "--dust-every-tick": ["walking lays one puff per stride"],
    "--ignore-airborne": ["no footstep while airborne"],
    "--self-world": ["the player's own footsteps are refused in first person at pitch 0 and at the maximum look-down"],
    "--dash-every-tick": ["a dash emits one burst plus a trail and is visible in first person",
                          "the dash trail lasts the dash and the dash burst outweighs a step"],
    "--land-every-tick": ["landing emits once, scaled by fall speed", "the player's own landing is refused in first person"],
    "--land-reads-current-vz": ["landing emits once, scaled by fall speed"],
    "--local-coords": ["a chunk crossing is not a footstep"],
    "--no-teleport-reset": ["a teleport is not a footstep"],
    "--tp-kill": ["after a teleport the stride starts afresh at the destination"],
    "--tp-keep-acc": ["after a teleport the stride starts afresh at the destination"],
    "--npc-surface-z": ["NPC dust follows real NPC motion on the NPC's stratum",
                        "NPC dust takes its stepped surface's colour and stays on its floor"],
    "--npc-steps-every-tick": ["NPC dust follows real NPC motion on the NPC's stratum"],
    "--npc-ignores-stun": ["NPC dust follows real NPC motion on the NPC's stratum"],
    "--no-dormant": ["NPC dust follows real NPC motion on the NPC's stratum"],
    "--no-dead": ["NPC dust follows real NPC motion on the NPC's stratum"],
    "--npc-no-alternate": ["NPC steps alternate sides of the body's path"],
    "--writes-body": ["the observers write nothing to NPC records"],
    "--no-fresh": ["a stunned body starts afresh where it is released"],
    "--npc-radius-250": ["NPC dust is observed within 240 u of the camera and not beyond"],
    "--npc-radius-230": ["NPC dust is observed within 240 u of the camera and not beyond"],
    "--npc-no-cap": ["NPC dust is capped at 12 bursts from the 24 nearest bodies a tick"],
    "--npc-list-order": ["NPC dust is capped at 12 bursts from the 24 nearest bodies a tick"],
    "--dust-fixed-colour": ["step dust takes the stepped surface's colour",
                            "NPC dust takes its stepped surface's colour and stays on its floor",
                            "Endless step dust takes the biome of the chunk it is laid on"],
    "--dust-ignores-under": ["NPC dust takes its stepped surface's colour and stays on its floor"],
    "--player-not-under": ["the player's dust in a cave lies on the cave floor in cave stone"],
    "--under-allocates": ["the NPC step's roof test agrees with getCaveSpaceAt and never calls it"],
    "--roof-ignores-caps": ["the NPC step's roof test agrees with getCaveSpaceAt and never calls it"],
    "--dust-ignores-toggle": ["footstep dust follows its switch and the Unified effects switch"],
    "--dust-math-random": ["locomotion dust never reads Math.random or presentationRandom"],
    "--step-at-feet": ["the player's steps lie on the slope at their own point"],
    "--dash-at-feet": ["a dash, its trail and a landing on the slope lie on it"],
    "--trail-at-feet": ["a dash, its trail and a landing on the slope lie on it"],
    "--land-at-feet": ["a dash, its trail and a landing on the slope lie on it"],
    "--npc-step-at-feet": ["an NPC's steps on a slope lie on it"],
    "--no-wall-support": ["a wall top carries the landing, steps, dash and trail laid on it"],
    "--step-no-reach": ["a wall top carries the landing, steps, dash and trail laid on it"],
    "--puff-2d-world-size": ["in 2D every step spawns its puff, drawn where the step was laid"],
    "--dust-forward": ["step dust is kicked back against the walk"],
    "--selfview-any-3d": ["a non-follow camera spawns the player's own dust wherever the feet are, and no screen puffs"],
    "--ifvisible-skip": ["a player-owned puff in first-person view spawns under ifVisible; one out of view is refused"],
    "--round-small-bursts": ["a lower Particles setting thins step puffs to a subset instead of dropping them"],
    "--2d-perspective-lod": ["in 2D, NPC dust spawns anywhere in the view, at any distance, and nowhere outside it"],
    "--2d-npc-radius": ["in 2D, NPC dust spawns anywhere in the view, at any distance, and nowhere outside it"],
    "--lod-uncounted": ["every step puff the distance LOD drops is counted"],
    "--trail-not-self": ["a dash emits one burst plus a trail and is visible in first person"],
    "--trail-world": ["a dash emits one burst plus a trail and is visible in first person"],
    "--screen-canvas-heights": ["first-person dash puffs stay inside a portrait canvas"],
    "--selfview-any-place": ["a frontSides dash burst spawns in first person, in view and on the ground ahead"],
    "--wedge-at-feet": ["a frontSides dash burst spawns in first person, in view and on the ground ahead"],
    "--land-after-7": ["a landing needs 6 airborne ticks: a 5-tick hop lays none, a 6-tick hop one"],
    "--land-after-5": ["a landing needs 6 airborne ticks: a 5-tick hop lays none, a 6-tick hop one"],
    "--no-clamp": ["the landing scale is clamped to 0.4-1.6"],
    "--late-observer-constants": ["the load-time pool's NPC observer tables hold 24 bodies"],
    "--dash-air-feet": ["an airborne dash lays its dust on the ground within a step below the feet, or none",
                        "a first-person dash with no ground under it shows no screen puffs"],
    "--dash-air-any-height": ["an airborne dash lays its dust on the ground within a step below the feet, or none",
                              "a first-person dash with no ground under it shows no screen puffs"],
    "--dash-dust-forward": ["the dash burst is kicked back against the dash"],
    "--trail-dust-forward": ["the dash trail is kicked back against the dash"],
    "--npc-dust-forward": ["an NPC's step dust is kicked back against its walk"],
    "--land-2d-puff": ["a 2D landing draws growing stroked rings"],
    "--dust-3d-floor": ["far step dust in 3D shrinks with distance"],
    "--wedge-near": ["a frontSides dash burst spawns in first person, in view and on the ground ahead"],
    "--wedge-admit-first": ["a frontSides wedge puff with no ground never takes a live particle's slot"],
    "--wedge-allocates": ["the frontSides wedge never calls the allocating getCaveSpaceAt"],
    "--hop-z-test": ["a companion slime puffs where each hop lands"],
    "--slime-at-player": ["a companion slime puffs where each hop lands"],
    "--slime-uncapped": ["NPC dust is capped at 12 bursts from the 24 nearest bodies a tick"],
    "--reach-8": ["a walk step down lays its dust on the lower floor, not at the easing feet"],
    "--2d-keep-no-y": ["in 2D, NPC dust spawns anywhere in the view, at any distance, and nowhere outside it"],
    "--2d-radius-halfwidth": ["in 2D, NPC dust spawns anywhere in the view, at any distance, and nowhere outside it"],
    "--2d-centre-cam": ["in 2D, NPC dust spawns anywhere in the view, at any distance, and nowhere outside it"],
    "--screen-size-canvas-height": ["portrait dash puffs are sized by the screen unit, no larger than on a 4:3 canvas"],
    "--lod-counts-density": ["density thinning is not counted as a distance loss"],
    "--observers-at-p0": ["at Particles 0 the movement observers do no work"],
    "--player-no-alternate": ["the player's steps are laid at the feet on the ground, alternating sides"],
    "--nonfollow-no-draw": ["in a non-follow camera the player's steps spawn and draw at the feet"],
    # S9: the S6 verifier's surviving hand mutants and the gridCave step fixture.
    "--dash-support-above": ["the airborne dash support rule holds on authored geometry"],
    "--dash-support-through-roof": ["the airborne dash support rule holds on authored geometry"],
    "--dash-support-wall-underground": ["the airborne dash support rule holds on authored geometry"],
    "--dash-support-cave-wall": ["the airborne dash support rule holds on authored geometry"],
    "--dash-support-no-wall": ["an airborne dash above a wall top or on a mesh-less level lays its dust on that support within a step, or none",
                               "the airborne dash support rule holds on authored geometry"],
    "--dash-support-lowest": ["an airborne dash above a wall top or on a mesh-less level lays its dust on that support within a step, or none",
                              "the airborne dash support rule holds on authored geometry"],
    "--dash-support-no-flat-floor": ["an airborne dash above a wall top or on a mesh-less level lays its dust on that support within a step, or none",
                                     "the airborne dash support rule holds on authored geometry"],
    "--step-cave-wall": ["steps over a cave's walls lie on the surface, not on a wall top buried under it"],
    "--step-no-cap": ["steps over a cave's walls lie on the surface, not on a wall top buried under it"],
    "--p0-keeps-position": ["back from Particles 0 the player's stride restarts where the observer resumes"],
    "--resume-dash-zero": ["back from Particles 0 an earlier dash lays no second burst"],
    "--resume-air-zero": ["a jump the observer resumes on lands after 6 observed airborne ticks and not after 5"],
    "--wedge-ignores-pitch": ["looking fully down, a frontSides dash burst still draws mostly on the canvas"],
    "--wedge-one-side": ["a frontSides dash burst spreads to both sides of the view"],
    "--wedge-ignores-walls": ["a frontSides puff over a wall starts on the wall top, not inside the wall"],
    "--npc-scan-when-off": ["with footstep dust switched off no NPC body is scanned"],
    "--screen-y-width-unit": ["first-person dash puffs sit 0.12-0.26 canvas heights below the centre on a portrait canvas too"],
    "--screen-dash-any-body": ["another body's dash throws world dust at it and no first-person screen puffs"],
    # S9 fix: the S9 review's surviving hand mutants.
    "--dash-support-ceiling-units": ["an airborne dash inside a cave lays its dust on the cave floor within a step",
                                     "the airborne dash support rule holds on authored geometry"],
    "--dash-support-floor-over-wall": ["the airborne dash support rule holds on authored geometry"],
    "--dash-support-tol-2": ["the airborne dash support rule holds on authored geometry"],
    "--dash-support-tol-0": ["the airborne dash support rule holds on authored geometry"],
    "--dash-support-wall-tol-0": ["the airborne dash support rule holds on authored geometry"],
    "--npc-tp-keep-acc": ["an NPC teleport is no stride and its stride restarts where it lands"],
    "--dash-reach-open": ["a dash's support reach is one step, 25 u included"],
    "--step-reach-open": ["a dash's support reach is one step, 25 u included"],
    # The water system merge (wading).
    "--dust-while-wading": [WADE_PLAYER, WADE_DASH, WADE_NPC],
    "--trail-while-wading": [WADE_DASH],
}
# The failure detail must also show the intended cause: a string applies to
# the first named check, a dict names the check each pattern belongs to.
CAUSES = {
    # A step on every walking tick from the first one (the walk starts at tick 21).
    "--dust-every-tick": r'"still":0,"steps":\[21,22,23,24,25,',
    # Steps inside the jump's airborne ticks.
    "--ignore-airborne": r'"inAir":\[\d+',
    # The self puffs spawn in first person: none refused.
    "--self-world": r'"dust":[1-9]\d*,"refused":0,',
    # dashStart in the tick dashUntil rose and again on every dashing tick
    # (12 ticks of 200 ms); the 2D dash tick records the last of them.
    "--dash-every-tick": {
        "a dash emits one burst plus a trail and is visible in first person": r'"rose":\[(\d+)\],"dashes":\[\1,\d+,\d+',
        "the dash trail lasts the dash and the dash burst outweighs a step": r'"dashes":12\}',
    },
    # Landings on the grounded ticks before the jump, at the minimum scale.
    "--land-every-tick": r'"lands":\[\{"tick":\d+,"scale":0\.4\},\{"tick":\d+,"scale":0\.4\}',
    # The landing tick's jumpVelZ (0): the minimum scale for both jumps.
    "--land-reads-current-vz": r'"want":1\.4,"lands":\[\{"tick":\d+,"scale":0\.4\}\].*"want":0\.65,"lands":\[\{"tick":\d+,"scale":0\.4\}\]',
    # The shift restarts the stride (480 u of window-local motion is a
    # teleport): the steps before the crossing are on time, the first one
    # after it comes late.
    "--local-coords": r'"beforeOk":true,"lateAfter":true,',
    # 1,000 u / 22 u: 45 strides at once.
    "--no-teleport-reset": r'"teleportSteps":45,',
    # No step at all after the teleport, or the first one early (the stride
    # before the teleport carried over).
    "--tp-kill": r'"steps":\[\],',
    "--tp-keep-acc": r'"firstEarly":true\}',
    # The cave enemy's steps on the cap (125) above it.
    "--npc-surface-z": {
        "NPC dust follows real NPC motion on the NPC's stratum": r'\{"name":"cave","path":100,"stride":24,"want":4,"got":4,"z":\[125\]',
        "NPC dust takes its stepped surface's colour and stays on its floor": r'"cave":\[\],',
    },
    # A step on every moving tick: 100 of them for 100 u at 1 u a tick.
    "--npc-steps-every-tick": r'"want":4,"got":100,',
    # The stunned, dormant or dead enemy's slide lays four steps.
    "--npc-ignores-stun": r'\{"name":"stunned","path":100,"stride":24,"want":0,"got":4,',
    "--no-dormant": r'\{"name":"dormant","path":100,"stride":24,"want":0,"got":4,',
    "--no-dead": r'\{"name":"dead","path":100,"stride":24,"want":0,"got":4,',
    # Every step on the same side of the path.
    "--npc-no-alternate": r'"oneSided":\[\{"name":"\w+","sides":\[(1,)+1\]',
    # The observer's stride written onto the records.
    "--writes-body": r'"changed":\["fxStride"\]',
    # The first tick after the release resumes the pre-stun stride and
    # position: a step while standing.
    "--no-fresh": r'"released":\{"path":0,"steps":1\}',
    # The 245 u walker observed, or the 235 u walker not.
    "--npc-radius-250": r'\{"name":"outside","dmin":245,"dmax":[\d.]+,"steps":2\}',
    "--npc-radius-230": r'\{"name":"inside","dmin":235,"dmax":[\d.]+,"steps":0\}',
    # The 23 walkers among the 24 nearest all puff; only the slime (its own
    # hop cap, 13th after them) is counted.
    "--npc-no-cap": r'"emitted":\[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22\],"capped":1,',
    # The enemies listed farthest first: the first 12 listed (bodies 18-29) puff.
    "--npc-list-order": r'"emitted":\[18,19,20,21,22,23,24,25,26,27,28,29\]',
    # Every puff in fxDebris dust #a89880 whatever the surface.
    "--dust-fixed-colour": {
        "step dust takes the stepped surface's colour": r'"plains":\["#a89880"\],"ice":\["#a89880"\],"expanse":\["#a89880"\]',
        "NPC dust takes its stepped surface's colour and stays on its floor": r'"cave":\[\[0\.5,"#a89880"\]',
        "Endless step dust takes the biome of the chunk it is laid on": r'"wrong":\[\{"tick":\d+,"biome":"\w+","rgb":"#a89880"\}',
    },
    # The cave enemy's dust in the plains step colour (floor band 5 kicked
    # up), not the cave stone's.
    "--dust-ignores-under": r'"cave":\[\[0\.5,"#b5b591"\]',
    # The cave player's steps not flagged underground, in the plains colour.
    "--player-not-under": r'"off":\[\{"type":"footstep","z":0,"under":false\}.*"colours":\["#b5b591"\]',
    # The observer's roof test calls getCaveSpaceAt (and agrees with it).
    "--under-allocates": r'"wrong":\[\],"getCaveSpaceAtCalls":[1-9]\d*,',
    # A cap with no ceiling over the feet not taken for a roof.
    "--roof-ignores-caps": r'"wrong":\[\{"kind":"overhang","x":\d+,"y":\d+,"z":\d+,"want":true,"got":false\}',
    "--dust-ignores-toggle": r'"off":\{"toggles":\{"fxFootDust":false,"fxUnified":true\},"spawned":[1-9]\d*,',
    "--dust-math-random": r'"calls":[1-9]\d*,',
    # Walking up the ramp the feet lag the rising floor: steps below the plane.
    "--step-at-feet": r'"off":\[\{"walk":"right","x":[\d.]+,"y":[\d.]+,"z":[\d.]+,"plane":[\d.]+\}',
    # The dash, a trail burst or the landing off the plane at the feet.
    "--dash-at-feet": r'"wrong":\[\{"kind":"dash","x":[\d.]+,"z":[\d.]+,"plane":[\d.]+\}',
    "--trail-at-feet": r'"wrong":\[\{"kind":"trail","x":[\d.]+,"z":[\d.]+,"plane":[\d.]+\}',
    "--land-at-feet": r'"wrong":\[\{"kind":"land","x":[\d.]+,"z":[\d.]+,"plane":[\d.]+\}',
    # The enemy's steps at its feet (the cell corner's height), off the plane.
    "--npc-step-at-feet": r'"wrong":\[\{"kind":"npc","x":[\d.]+,"z":([\d.]+),"plane":[\d.]+\}.*"feet":\1\}',
    # A foot over the lower row laid at the feet (A's top), not on B's.
    "--no-wall-support": r'\{"kind":"step","cell":"B","tick":\d+,"z":33\.6,"want":28\.8\}',
    # A foot beside the wall's edge laid on the ground 33.6 u below.
    "--step-no-reach": r'\{"kind":"step","cell":"ground","tick":\d+,"z":0,"want":33\.6\}',
    # Puffs of their 1.2-2.2 u radius (grown up to x1.6) in 2D, under 3 px.
    "--puff-2d-world-size": r'"far":\[\],"radiiUnder3px":\[[12]\.\d+',
    # Puffs thrown east with the walk.
    "--dust-forward": r'"forward":\[\[[\d.]+,',
    # The feet behind a non-follow camera refused as the player's own, and
    # screen puffs spawned outside first person.
    "--selfview-any-3d": r'"refusedSelf":[1-9]\d*,.*"screenPuffs":[1-9]',
    # The in-view burst refused like the one behind.
    "--ifvisible-skip": r'"ahead":\{"spawned":0,"refused":[1-9]\d*\}',
    # Particles 10: 0.4 of a puff rounds to none.
    "--round-small-bursts": r'\{"P":10,"steps":\d+,"spawned":0\}',
    # The on-screen walker 150 u away loses puffs to the perspective LOD, or
    # the one 400 u away in the fullscreen view is never observed.
    "--2d-perspective-lod": r'\{"name":"onScreen150","steps":4,"spawned":[0-3],"lod":[1-4]\}',
    "--2d-npc-radius": r'\{"name":"onScreen400","steps":0,',
    # Steps dropped by the distance LOD with nothing counted.
    "--lod-uncounted": r'"steps":5,"spawned":\d+,"lod":0\}',
    # Trail puffs spawned at the first-person feet on the dash ticks.
    "--trail-not-self": r'"worldFresh":\[[\d,]*[1-9][\d,]*\],.*"trail":\{"bursts":\d+,"spawned":[1-9]\d*,"refused":0\}',
    "--trail-world": r'"worldFresh":\[[\d,]*[1-9][\d,]*\],.*"trail":\{"bursts":\d+,"spawned":[1-9]\d*,"refused":0\}',
    # 0.42-0.62 canvas heights either side on a 390 px wide canvas: none inside.
    "--screen-canvas-heights": r'"puffs":[3-9]\d*,"drawn":\d+,"inside":0,',
    # The frontSides burst refused as the player's own.
    "--selfview-any-place": r'"flat":\{"spawned":0,"drawn":0\},"rampPuffs":0,',
    # The downhill wedge at the feet's height, 20-50 u above the slope.
    "--wedge-at-feet": r'"floating":\[\{"x":[\d.]+,"above":[1-9]\d\.\d+',
    # The 6-tick hop lays no landing, or the 5-tick hop lays one.
    "--land-after-7": r'"hop6":\{"airborne":6,[^}]*"lands":\[\]',
    "--land-after-5": r'"hop5":\{"airborne":5,[^}]*"lands":\[\{"tick":\d+',
    # The unclamped scale: the 6-tick hop's and the cliff fall's raw values.
    "--no-clamp": r'"hop6":\{"raw":([\d.]+),"lands":\[\{"tick":\d+,"scale":\1\}\]\},"fall":\{"raw":([\d.]+),"lands":\[\{"tick":\d+,"scale":\2\}\]',
    # The load-time pool's tables sized before the constants: one slot, none.
    "--late-observer-constants": r'\{"ref":1,"d":0,"hop":0\}',
    # A dash 38 u up laid at the feet, or on the floor below: 8-12 puffs
    # spawned out of reach, none refused; its 6 screen puffs spawn too.
    "--dash-air-feet": {
        "an airborne dash lays its dust on the ground within a step below the feet, or none":
            r'\{"scene":"jump","id":"step\.dash","tick":\d+,"reach":"outOfReach","feet":([\d.]+),"ground":0,"spawned":\d+,"noSupport":0,"z":\[\1,',
        "a first-person dash with no ground under it shows no screen puffs": r'"spawned":6,"noSupport":0\}',
    },
    "--dash-air-any-height": {
        "an airborne dash lays its dust on the ground within a step below the feet, or none":
            r'\{"scene":"jump","id":"step\.dash","tick":\d+,"reach":"outOfReach","feet":[\d.]+,"ground":0,"spawned":[1-9]\d*,"noSupport":0,"z":\[0,',
        "a first-person dash with no ground under it shows no screen puffs": r'"spawned":6,"noSupport":0\}',
    },
    # Every puff of the burst, the trail or the NPC's steps thrown forward.
    "--dash-dust-forward": r'"puffs":(\d+),"forward":\1,',
    "--trail-dust-forward": r'"puffs":(\d+),"forward":\1,',
    "--npc-dust-forward": r'"puffs":(\d+),"forward":\1,',
    # The landing drawn as sprites (puffs), no ring.
    "--land-2d-puff": r'"live":(\d+),"rings":0,"images":\1,',
    # Far puffs held at the 3 px floor (x resScale); the radii barely shrink.
    "--dust-3d-floor": r'"res":"360x240","RS":1,"n100":\d+,"n200":\d+,"r200max":3,"ratio":1\.',
    # The first wedge (0.4-1 x 140 u): half of it below the canvas at pitch 0.
    "--wedge-near": r'"flat":\{"spawned":1[0-2],"drawn":[0-6]\}',
    # A wedge puff with no ground admitted first: one mote stolen for nothing.
    "--wedge-admit-first": r'\{"facing":"east","full":\{[^}]*\},"spawned":0,"stolen":[1-9]',
    # The wedge's stratum test allocating: a getCaveSpaceAt call per puff.
    "--wedge-allocates": r'\{"facing":"west","full":\{[^}]*\},"spawned":[1-9]\d*,"stolen":\d+,"noSupport":0,"caveCalls":[1-9]',
    # The squash test misses the following slime's hops (and lands one tick
    # early at idle); or the puff laid at the player, ~45-55 u away.
    "--hop-z-test": r'"scene":"follow","lands":\d+,"zLands":(\d+),"events":\1,"missed":[1-9]',
    "--slime-at-player": r'"far":\[\{"tick":\d+,"off":[4-6]\d\.',
    # The slime puffs past the cap in the walkers' tick.
    "--slime-uncapped": r'"emitted":\[0,1,2,3,4,5,6,7,8,9,10,11,"s"\],"capped":11,',
    # A step or trail burst on the lower floor laid at the easing feet.
    "--reach-8": r'"wrong":\[\{"run":\d+,"kind":"\w+","x":[\d.]+,"z":([\d.]+),"want":0,"feet":\1\}',
    # The off-screen north and south walkers' dust spawned.
    "--2d-keep-no-y": r'\{"name":"north150","steps":4,"spawned":4,"lod":0\},\{"name":"south150","steps":4,"spawned":4,"lod":0\}',
    # The corner walker (beyond the half width, 1289 u from the camera) unseen.
    "--2d-radius-halfwidth": r'\{"name":"corner","steps":0,',
    "--2d-centre-cam": r'\{"name":"corner","steps":0,',
    # Portrait puffs sized by the canvas height: every one larger than allowed.
    "--screen-size-canvas-height": r'"over":\[[\d.]+,[\d.]+,[\d.]+,[\d.]+,[\d.]+,[\d.]+\]',
    # Particles 10's thinned puffs counted as distance losses.
    "--lod-counts-density": r'\{"P":10,"steps":\d+,"spawned":\d+,"lod":[1-9]',
    # The observers see every step at Particles 0.
    "--observers-at-p0": r'"P0":\{"steps":[1-9]\d*,"observed":[1-9]',
    # Every step on one side of the path.
    "--player-no-alternate": r'"sides":\[(-1,)+-1\]|"sides":\[(1,)+1\]',
    # The steps spawn but nothing is drawn in the non-follow camera.
    "--nonfollow-no-draw": r'"spawned":[1-9]\d*,"lodRefused":\d+,"drawn":0,',
    # S9. A cap 15 u over airborne feet taken for their support.
    "--dash-support-above": r'\{"case":"cap 15 u over the feet","feet":110,"under":false,"want":"none","got":125\}',
    # The floor under a roof 10 u up taken through the roof.
    "--dash-support-through-roof": r'\{"case":"a floor under a roof 10 u up","feet":20,"under":false,"want":"none","got":0\}',
    # A cave player's dust on a wall top, or the surface player's on a cave's wall cell.
    "--dash-support-wall-underground": r'\{"case":"a wall top for a cave player","feet":24,"under":true,"want":0,"got":20\}',
    "--dash-support-cave-wall": r'\{"case":"a cave\'s wall cell","feet":24,"under":false,"want":0,"got":20\}',
    # No wall top: the trail over wall A in reach of its top is refused, and
    # the authored wall cases go to the floor or none.
    "--dash-support-no-wall": {
        "an airborne dash above a wall top or on a mesh-less level lays its dust on that support within a step, or none":
            r'\{"scene":"wallTop","id":"step\.dash(Trail)?","tick":\d+,"reach":"inReach","feet":[\d.]+,"ground":33\.6,"spawned":0,"noSupport":[1-9]',
        "the airborne dash support rule holds on authored geometry": r'\{"case":"a wall top 10 u down","feet":30,"under":false,"want":20,"got":"none"\}',
    },
    # The lowest support: the ground 57 u under the wall-top jumper (out of reach).
    "--dash-support-lowest": {
        "an airborne dash above a wall top or on a mesh-less level lays its dust on that support within a step, or none":
            r'\{"scene":"wallTop","id":"step\.dash(Trail)?","tick":\d+,"reach":"inReach","feet":[\d.]+,"ground":33\.6,"spawned":0,"noSupport":[1-9]',
        "the airborne dash support rule holds on authored geometry": r'\{"case":"a wall top over a floor, both in reach","feet":24,"under":false,"want":20,"got":0\}',
    },
    # A mesh-less level has no support at all: the dust in reach of its floor refused.
    "--dash-support-no-flat-floor": {
        "an airborne dash above a wall top or on a mesh-less level lays its dust on that support within a step, or none":
            r'\{"scene":"noMesh","id":"step\.dash(Trail)?","tick":\d+,"reach":"inReach","feet":[\d.]+,"ground":0,"spawned":0,"noSupport":[1-9]',
        "the airborne dash support rule holds on authored geometry": r'\{"case":"a mesh-less fixed level","feet":20,"under":false,"want":0,"got":"none"\}',
    },
    # On the slope the lagging feet (125) are nearer the buried wall top (118.75) than the cap.
    "--step-cave-wall": r'"wrong":\[\{"start":\d+,"x":[\d.]+,"z":118\.75,"want":[\d.]+,"feet":125,',
    # The cap ignored: the step falls back to the lagging feet, off the cap.
    "--step-no-cap": r'"wrong":\[\{"start":\d+,"x":[\d.]+,"z":([\d.]+),"want":[\d.]+,"feet":\1,',
    # The distance walked at Particles 0 dumped as steps in the tick back.
    "--p0-keeps-position": r'"back":(\d+),"steps":\[\1,',
    "--resume-dash-zero": r'"dashesBack":1,',
    # Six observed airborne ticks counted as five: no landing.
    "--resume-air-zero": r'"six":0,"five":0\}',
    # At the pitch-0 distances the wedge lies above the top edge.
    "--wedge-ignores-pitch": r'"pitch":1\.4,"puffs":\d+,"drawn":0,',
    "--wedge-one-side": r'"left":0,|"right":0,',
    # Puffs over the walls laid on the ground inside them.
    "--wedge-ignores-walls": r'"off":\[\{"x":[\d.]+,"y":[\d.]+,"z":0,"top":28\.8\}',
    "--npc-scan-when-off": r'"off":[1-9]\d*,"unified":[1-9]\d*,',
    # Portrait y in 3/4 widths: 0.54-0.59 of the height.
    "--screen-y-width-unit": r'"outside":\[0\.5[0-9]*,',
    "--screen-dash-any-body": r'"screen":[1-9]\d*\}',
    # S9 fix. The cave floor refused (its ceiling, 4 H, taken as below feet read in units).
    "--dash-support-ceiling-units": {
        "an airborne dash inside a cave lays its dust on the cave floor within a step":
            r'\{"scene":"cave","id":"step\.dash(Trail)?","tick":\d+,"reach":"inReach","feet":[\d.]+,"ground":0,"spawned":0,"noSupport":[1-9]',
        "the airborne dash support rule holds on authored geometry":
            r'\{"case":"a cave player over the cave floor \(ceiling 4 H up\)","feet":10,"under":true,"want":0,"got":"none"\}',
    },
    # The flat floor at 0 put over the wall top: 30 u below the feet, out of reach.
    "--dash-support-floor-over-wall": r'\{"case":"a mesh-less level with a wall top under the feet","feet":30,"under":false,"want":20,"got":"none"\}',
    "--dash-support-tol-2": r'\{"case":"a cap 2 u over the feet","feet":123,"under":false,"want":"none","got":125\}',
    "--dash-support-tol-0": r'\{"case":"a cap 0\.5 u over the feet \(inside the 1 u tolerance\)","feet":124\.5,"under":false,"want":125,"got":"none"\}',
    # The wall top 0.5 u up refused: the floor 19.5 u down (in reach) taken instead.
    "--dash-support-wall-tol-0": r'\{"case":"a wall top 0\.5 u over the feet \(inside the 1 u tolerance\)","feet":19\.5,"under":false,"want":20,"got":0\}',
    # The 20 u walked before the jump plus 20 after it make a step.
    "--npc-tp-keep-acc": r'"walkOn":\{"path":20,"steps":1\}',
    "--dash-reach-open": r'"wrong":\[\{"case":"airborne: the floor 25 u below","feet":25,"want":0,"got":"none"\}\]',
    # The wall top exactly a step down refused: the step falls back to the feet.
    "--step-reach-open": r'"wrong":\[\{"case":"grounded: a wall top 25 u below","feet":45,"want":20,"got":45\}\]',
    # The water system merge. Steps, the landing, the dash burst and the
    # enemy's steps in the lake puff; or only the dash trail does.
    "--dust-while-wading": {
        WADE_PLAYER: r'"wet":\{[^}]*"puffsInside":[1-9]\d*,',
        WADE_DASH: r'"dashPuffs":[1-9]\d*,',
        WADE_NPC: r'"puffsInBand":[1-9]\d*\}',
    },
    "--trail-while-wading": r'"dashPuffs":0,"trailWet":[1-9]\d*,',
}


def _run(args=()):
    result = run_js(HARNESS, list(args), timeout=240)
    return result.stdout + result.stderr, result.stdout.splitlines()


def _jobs() -> int:
    # dev.py test sets HW1_GAME_JOBS=1: full-game harnesses run one at a time.
    try:
        return max(1, int(os.environ.get("HW1_GAME_JOBS", "1")))
    except ValueError:
        return 1


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class LocomotionDustTests(unittest.TestCase):
    def test_dust_contracts(self) -> None:
        output, lines = _run()
        self.assertIn(SENTINEL, lines, output)
        self.assertFalse([line for line in lines if line.startswith("SKIP ")], output)
        self.assertEqual(PASS_COUNT, sum(line.startswith("PASS ") for line in lines), output)
        self.assertFalse([line for line in lines if line.startswith("FAIL ")], output)

    def test_mutations_fail_their_named_checks(self) -> None:
        self.assertEqual(set(MUTATIONS), set(CAUSES))
        with ThreadPoolExecutor(max_workers=_jobs()) as pool:
            results = dict(zip(MUTATIONS, pool.map(lambda flag: _run([flag]), MUTATIONS)))
        for flag, checks in MUTATIONS.items():
            output, lines = results[flag]
            with self.subTest(mutation=flag):
                self.assertNotIn(SENTINEL, lines, output)
                self.assertTrue(any(line.startswith("LOCOMOTION_DUST_RESULT FAIL ") for line in lines), output)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP ", output)
                self.assertNotIn("ran without an exception", output)
                for check in checks:
                    self.assertTrue([line for line in lines if line.startswith("FAIL " + check + " ")], output)
                causes = CAUSES[flag] if isinstance(CAUSES[flag], dict) else {checks[0]: CAUSES[flag]}
                for check, pattern in causes.items():
                    failing = next(line for line in lines if line.startswith("FAIL " + check + " "))
                    self.assertRegex(failing, pattern, output)


if __name__ == "__main__":
    unittest.main()
