"""Particle engine (simulation side): pool, admission, motion, ground cache, events and presentation."""

from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import re
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

HARNESS = Path(__file__).with_name("particle_engine.js")
# 72 after S2b; S3 added "field definitions fail at load with a named
# error" (the ambient field's compiler); S4 added B3a and B17 runs on the
# shipping tome burst and Phoenix ring. The S4 review fixes added five: the
# rest of sourceOrFront placement (a visible source kept, the lean aside,
# the pitched view ray, the walking player's velocity) and ring bursts that
# keep their headings at a lower density. S9 added ten core contracts that
# hand mutants had passed (the event ring's order, non-finite events, wind
# in eye space, turbulence, the clamp's fall speed, the mesh edge, caps
# and fading particles, maxLive, a preset switched on mid-session, and
# where.underground). The S9 fix added five more the S9 review found
# surviving: a class cap after its faded particles die, a lower Particles
# setting that fades only the excess, a fade that never lengthens a life,
# collision.wall with collision mode none, the 1 u support tolerance under
# an overhang, an event open while any of its bindings is, a particle
# marked to fade again counted once, and a bounce's friction.
PASS_COUNT = 98
SENTINEL = f"PARTICLE_ENGINE_RESULT PASS {PASS_COUNT}"

# Each mutation must fail its named check; setup failures and crashes do not count.
MUTATIONS = {
    "--engine-math-random": "cosmetic particles never read Math.random or presentationRandom",
    "--budget-at-init-only": "the Particles setting applies within a quarter second",
    "--no-reserve": "B3a: the flood fills B and feedback is admitted above it from the reserve",
    "--no-steal": "B3b: with no reserve feedback steals from the weather class",
    "--per-tick-drag": "motion is independent of tick rate",
    "--stale-ground-cache": "particles rest on the exact sloped support",
    "--ground-cell-constant": "particles rest on the exact sloped support",
    "--ground-kill-edge": "support is finite on the last row and column",
    "--lowest-layer": "a roof mote lands on the cap",
    "--nearest-reference": "a drip at ceiling - 2 lands on the cave floor",
    "--forward-extrapolate": "particles share the interpolation timeline",
    "--no-contact-snap": "a just-bounced particle is never below its support",
    "--global-dynamic-palette": "event colours are interned per state since its reset",
    "--accept-unknown-keys": "recipe typos fail at load with a named error",
    "--drop-recipe": "the shipping table has every recipe this slice requires",
    "--merge-color": "the extends merge replaces color whole",
    # Applied to a copy of the compiler that only B11's direct case uses: the
    # shipping table (whose Phoenix ring overrides its template's place)
    # would otherwise fail at load before that case runs.
    "--merged-keys-substring": "extends replaces scalars and merges plain objects key by key",
    "--allocate-per-spawn": "the fx paths create no per-particle arrays or objects that the harness can observe",
    "--corner-alloc": "the fx paths create no per-particle arrays or objects that the harness can observe",
    "--emit-immediately": "keyboard shrine particles spawn inside the fixed tick",
    "--global-compiled": "the engine reads only the recipe table installed in its state",
    "--corners-off-by-one": "the non-allocating corner fill equals the shared helper",
    "--eye-in-2d": "eye and screen particles fade out when the view leaves first person",
    "--admit-children-inline": "children never disturb the integration pass",
    "--surface-ignores-under": "surface colours follow the biome and the stratum",
    "--lod-ignored": "spawn counts follow the distance LOD and thin to a subset",
    "--no-spawn-cap": "spawns per tick stay within the cap and later events wait in the queue",
    "--segment-at-start": "a segment anchor emits along its whole segment",
    "--entity-outlives-body": "an entity anchor follows its body and ends with it or at its deadline",
    "--no-nearest-fallback": "a particle below every support in its cell takes the nearest layer",
    "--eye-in-nonfollow": "eye and screen particles fade out in a non-follow camera",
    "--steal-not-lowest": "feedback steals the lowest class first, oldest normalized age first",
    "--steal-same-class": "a burst never steals from its own class",
    "--steal-youngest": "feedback steals the lowest class first, oldest normalized age first",
    "--ground-kill-last-row": "support is finite on the last row and column",
    "--burst-retries-refused": "a gated burst costs one attempt and counts the rest",
    "--budget-refusal-free": "refused steal scans use up the spawn cap and later events wait",
    "--event-max-ignores-scale": "an event whose scaled bursts do not fit waits whole for the next tick",
    "--attach-zero-rate": "an attach without a positive rate is refused and counted",
    "--attach-follow-ignored": "an attached object follows its source when asked; a plain point stays put",
    "--cone-at-apex": "a cone burst spawns within its radius and spread around the event direction",
    "--wall-span-per-tick": "the wall top is read once per wall cell, not per particle tick",
    "--placement-override-ignored": "a placement override moves a recipe into eye space and back",
    "--eye-collides": "camera-local particles never collide with the world",
    "--accept-eye-wall": "recipe typos fail at load with a named error",
    "--accept-any-weather-kind": "recipe typos fail at load with a named error",
    # S4 review: first-person placement and ring headings.
    "--front-always": "a feedback burst far enough ahead and in view stays at its source",
    "--front-no-lateral": "a burst moved in front leans toward its source, at most half its distance aside",
    "--front-ignores-pitch": "a burst moved in front keeps its screen offset below the crosshair at any pitch",
    "--front-inherit-uncapped": "a burst moved in front carries the walking player velocity, capped at twice the walking speed",
    "--ring-scaled-count": "a lower density shows the same ring particles, spread round the ring",
    "--ring-prefix-arc": "a lower density shows the same ring particles, spread round the ring",
    # S9: core hand mutants that no case above detected.
    "--ring-drops-oldest": "a full event ring drops the newest events and keeps the queued ones",
    "--bad-event-queued": "an event with no finite position is refused and counted, and spawns nothing",
    "--wind-on-eye": "eye-space particles ignore the weather wind that carries world particles",
    "--no-turbulence": "a mote wanders along its authored turbulence",
    "--clamp-keeps-fall": "a clamped particle slides off a ledge from rest",
    "--offmesh-survives": "a colliding particle dies as it leaves the mesh",
    "--cap-counts-dying": "a fading preset leaves its class cap to new particles",
    "--maxlive-plus-one": "a recipe holds exactly its maxLive",
    "--event-gate-stale": "a preset switched on mid-session opens its events at once",
    "--where-under-ignored": "a where.underground binding bursts for cave events only",
    # S9 fix: core mutants the S9 review found surviving every effects suite.
    "--kill-keeps-dying": "a class cap holds again after its faded particles have died",
    "--excess-counts-dying": "a lower Particles setting fades only the excess over the new class cap",
    "--fade-extends-life": "a fade never lengthens a particle's life",
    "--wall-needs-mode": "a mote with collision mode none still dies at a wall",
    "--support-tolerance-wide": "a mote under an overhang's cap falls to the floor below it",
    "--event-open-first-binding": "an event with a switched-off first binding still bursts its open one",
    "--mark-dying-twice": "a fading particle marked again counts once as fading",
    "--bounce-no-friction": "a bounce keeps friction x the horizontal speed",
}
# The failure detail must also show the intended cause, not merely the check name.
CAUSES = {
    "--engine-math-random": r'"calls":\{"random":[1-9]',
    "--no-reserve": r'"stolen":15\}',
    "--lowest-layer": r'"roof":0\.3,',
    "--nearest-reference": r'"drip":125\.3,',
    "--accept-unknown-keys": r'"accepted":\["unknown top-level key","unknown nested key"\]',
    # The renamed S4 burst missing (S5's impact recipes follow it in the list).
    "--drop-recipe": r'"burst\.thunder","droppedBurst",',
    "--merged-keys-substring": r'"result":"Particle recipe eye: place \[object Object\] is not one of',
    "--merge-color": r'color\.weights must match roles',
    "--allocate-per-spawn": r'"typed":[1-9]',
    "--corner-alloc": r'"corners":[1-9]',
    "--emit-immediately": r'"before":12,',
    "--global-compiled": r'"a":500,"b":500',
    "--eye-in-2d": r'"dying":false',
    "--no-nearest-fallback": r'"alive":false',
    "--eye-in-nonfollow": r'"dying":false',
    "--steal-same-class": r'"stolen":5,',
    "--steal-youngest": r'"first":\{"ok":false',
    "--steal-not-lowest": r'"first":\{"ok":false',
    "--ground-kill-last-row": r'"cell":"last row","z":"killed"',
    "--burst-retries-refused": r'"attempts":32768,',
    "--budget-refusal-free": r'"queued":0,',
    "--event-max-ignores-scale": r'"firstTick":24,"cutByCap":12,',
    "--attach-zero-rate": r'"zeroRate":\d',
    "--attach-follow-ignored": r'"followed":\{"n":\d+,"min":190,"max":190\}',
    "--cone-at-apex": r'"len":0,',
    "--wall-span-per-tick": r'"spanReads":\d{2,},',
    "--placement-override-ignored": r'"eyeSpace":0,',
    "--eye-collides": r'"flags":\d*[13579],',
    "--accept-eye-wall": r'"accepted":\["eye with a wall collision"\]',
    "--accept-any-weather-kind": r'"accepted":\["unknown weather kind"\]',
    # The visible source 80 u ahead was moved to 34 u.
    "--front-always": r'"kept":\[\[34,6,',
    "--front-no-lateral": r'"wide":\[\[34,0\]\],"slight":\[\[34,0\]\]',
    # Looking down 1.2: the historical front point is above the top of the view.
    "--front-ignores-pitch": r'\{"pitch":1\.2,"n":8,"fwd":34,"offset":-0\.9\d+,"onScreen":false',
    "--front-inherit-uncapped": r'"dash":\[500,0\]',
    "--ring-scaled-count": r'"low":8,"sameHeading":0,',
    # Same headings, but the 8 survivors cover about half the ring.
    "--ring-prefix-arc": r'"sameHeading":8,"moved":\[\],"maxGap":[2-4]\.',
    # S9. The ring keeps its newest events: bursts 44-299 spawn.
    "--ring-drops-oldest": r'"first":64,"last":319\}',
    "--bad-event-queued": r'"returned":\[true,true,true\],"bad":0,"queued":3,',
    # Eye particles blown off their drag law by the wind.
    "--wind-on-eye": r'"eyeOff":\[\{"seed":\d+,"x":',
    "--no-turbulence": r'"dx":0,"dy":0,',
    # Off the ledge with the speed gathered while clamped: 4 u below free fall after one tick.
    "--clamp-keeps-fall": r'"fall":\[\{"n":1,"z":14[0-9]\.',
    "--offmesh-survives": r'"offMesh":\[37\d',
    "--cap-counts-dying": r'"admitted":40,"cap":420,"refused":260\}',
    "--maxlive-plus-one": r'"live":6,',
    "--event-gate-stale": r'"afterOn":0\}',
    "--where-under-ignored": r'"surface":3,"cave":3\}',
    # S9 fix. The leaked fading count admits both bursts whole (600 over the 420 cap).
    "--kill-keeps-dying": r'"dyingAfter":380,"admitted":600,',
    # The excess marked again every tick: the whole class fades.
    "--excess-counts-dying": r'"dying1":180,"dying3":540,"live25":0,',
    # The older spark, 0.1 s from its end, is given 0.25 s more.
    "--fade-extends-life": r'"life":5\.14\d*,"want":5\}',
    "--wall-needs-mode": r'"wallRow":\{"y":186,"maxX":2\d\d\.\d+,"inWall":[1-9]\d*,"alive":true\}',
    "--support-tolerance-wide": r'"under5":125\.3,',
    # The event closed by its switched-off first binding: gated, nothing bursts.
    "--event-open-first-binding": r'"result":\{"gated":1,"open":0,',
    # Marked again by the second switch: 600 fading counted for 300, 300 left after they die.
    "--mark-dying-twice": r'"fade":\{"first":300,"second":600,"fading":300,"after":300,"left":0\}',
    # Only the drag across the bounce tick.
    "--bounce-no-friction": r'"ratio":0\.99335[\d]*,"want":0\.5960',
}


def _run(args=()):
    result = run_js(HARNESS, list(args), timeout=120)
    return result.stdout + result.stderr, result.stdout.splitlines()


def _jobs() -> int:
    # dev.py test sets HW1_GAME_JOBS=1: full-game harnesses run one at a time.
    try:
        return max(1, int(os.environ.get("HW1_GAME_JOBS", "1")))
    except ValueError:
        return 1


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class ParticleEngineTests(unittest.TestCase):
    def test_engine_contracts(self) -> None:
        output, lines = _run()
        self.assertIn(SENTINEL, lines, output)
        self.assertFalse([line for line in lines if line.startswith("SKIP ")], output)
        self.assertEqual(PASS_COUNT, sum(line.startswith("PASS ") for line in lines), output)
        self.assertFalse([line for line in lines if line.startswith("FAIL ")], output)

    def test_mutations_fail_their_named_checks(self) -> None:
        with ThreadPoolExecutor(max_workers=_jobs()) as pool:
            results = dict(zip(MUTATIONS, pool.map(lambda flag: _run([flag]), MUTATIONS)))
        for flag, check in MUTATIONS.items():
            output, lines = results[flag]
            with self.subTest(mutation=flag):
                self.assertNotIn(SENTINEL, lines, output)
                failing = [line for line in lines if line.startswith("FAIL " + check + " ")]
                self.assertTrue(failing, output)
                self.assertTrue(any(line.startswith("PARTICLE_ENGINE_RESULT FAIL ") for line in lines), output)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP ", output)
                self.assertNotIn("ran without an exception", output)
                if flag in CAUSES:
                    self.assertRegex(failing[0], CAUSES[flag], output)


if __name__ == "__main__":
    unittest.main()
