"""Formerly dead feedback bursts, death bones and the 2D gaps on the unified particle engine (slice S4)."""

from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

HARNESS = Path(__file__).with_name("effect_producers.js")
# E1 6 bursts, E2 1, E3 2, E4 4, E5 3, E6 2, E7 1, plus load, runtime
# failures and stage/console errors: 22 at S4. The S4 review fixes added
# four: E1 looking down and up, and a player who keeps walking; E4 bounces;
# E5 pickup feedback in 2D. S5 closed two S4 test gaps in E4: a resting
# bone drawn at the slope's tilt and a rising bone lifted, not stopped.
PASS_COUNT = 28
SENTINEL = f"EFFECT_PRODUCERS_RESULT PASS {PASS_COUNT}"

# Each mutation must fail every named check; setup failures and crashes do not count.
MUTATIONS = {
    "--place-source-only": ["tome pickup burst is visible in first person",
                            "Phoenix revive ring is visible in first person, in eye space"],
    "--burst-zero-speed": ["pickup bursts are radial, not stacked rings"],
    "--push-legacy-shape": ["shrine burst is visible in first person on the keyboard and gamepad paths",
                            "no producer pushes malformed impact records"],
    "--bones-2d-only": ["death bones are drawn in 3D"],
    "--bone-no-ground": ["death bones rest on the sloped floor"],
    "--no-orb-2d": ["soul orbs are visible in 2D"],
    "--coin-nan-bob": ["spawner coins without a bob are visible in 2D"],
    "--legacy-unscoped-random": ["switching Unified effects off and on mid-session never changes the gameplay random stream"],
    "--legacy-rng-per-call": ["two legacy deaths in one tick throw different bones"],
    "--thunder-at-target": ["Thunder Core burst is visible at the struck body"],
    # S4 review fixes.
    "--front-ignores-pitch": ["tome pickup burst is visible in first person looking down and up"],
    "--front-no-inherit": ["a tome burst stays in front of a player who keeps walking"],
    "--shrine-source": ["shrine burst is visible in first person on the keyboard and gamepad paths"],
    "--bone-stick": ["death bones bounce before they settle"],
    "--bone-no-restitution": ["death bones bounce before they settle"],
    "--bone-centre-contact": ["death bones rest on the sloped floor"],
    "--bone-flat-rest": ["death bones rest on the sloped floor"],
    "--orb-save-always": ["an empty 2D fx stage makes no Canvas call"],
    "--orb-no-cull": ["soul orbs are visible in 2D", "an empty 2D fx stage makes no Canvas call"],
    "--feedback-2d-1px": ["pickup feedback reads in 2D"],
    # S5: the S4 test gaps (spec build notes S3-S4).
    "--rest-draws-tumble": ["a resting bone is drawn at the tilt of the slope it lies on"],
    "--rising-stick-rests": ["a bone whose end swings into the floor while it rises is lifted, not stopped"],
    "--lift-damps-vz": ["a bone whose end swings into the floor while it rises is lifted, not stopped"],
}
# The failure detail must also show the intended cause: a string applies to
# the first named check, a dict names the check each pattern belongs to.
CAUSES = {
    # Historical defect (combat-2): the burst exists (15 live) but at the
    # collected tome, below the canvas, so no frame draws it.
    "--place-source-only": r'"frames":\[0,0,0,0,0,0,0\],"live":15,',
    # No radial speed: the ring never grows.
    "--burst-zero-speed": r'"meanRadius":\[([\d.]+),\1,\1\]',
    # The historical shrine producer: 12 {life,maxLife} records exist between
    # the keydown and the next tick, no frame draws them, and the tick prunes
    # them (the shrine straight ahead); and 12 malformed records per activation.
    "--push-legacy-shape": {
        "shrine burst is visible in first person on the keyboard and gamepad paths":
            r'"ahead":\{"frames":\[0,0,0,0,0,0,0\],"best":0,"events":0,"live":0,"buff":true,"turned":0,'
            r'"legacy":\{"recordsBefore":12,"drawsBefore":0,"recordsAfter":0,"drawsAfter":0\}',
        "no producer pushes malformed impact records": r'"malformed":12,',
    },
    # Before S4: bones only as legacy 2D records, never drawn in 3D.
    "--bones-2d-only": r'"ramp":\[0,0\],"flat":\[0,0\]',
    # Bones fall through the ramp: none rests, many end below it.
    "--bone-no-ground": r'"rested":0,"off":\[\],"below":[1-9]',
    "--no-orb-2d": r'"orb":\[\]',
    # Historical defect (combat-16): the bob-less coin is drawn at a NaN height.
    "--coin-nan-bob": r'"bare":\["NaN"\]',
    "--legacy-unscoped-random": r'"drawsOn":(\d+),"drawsMid":(?!\1,)\d+,',
    # Review M12: both deaths replay one sequence, so only 7 distinct bones.
    "--legacy-rng-per-call": r'"legacy":\{"bones":14,"distinct":7\}',
    "--thunder-at-target": r'"atBody":\{"n":8,"off":\[\{"d":(1\d|[2-9]\d)',
    # The review's defect: looking down at the tome being collected (it was
    # on screen during the approach), the front burst is above the view.
    "--front-ignores-pitch": r'"down":\{"pitch":1\.2,"item":[1-9]\d*,"frames":\[0,0,0,0,0,0,0\],"live":15,',
    # Walked through: fewer than 12 of 15 dots before 0.4 s.
    "--front-no-inherit": r'"minThrough0p4s":([0-9]|1[01]),',
    # Beside and behind the camera the burst at the shrine is never drawn.
    "--shrine-source": r'"keyboard":\{"frames":\[0,0,0,0,0,0,0\],"best":0,"events":1,"live":12,',
    "--bone-stick": r'"ramp":\{"bounced":0,"rested":7\},"flat":\{"bounced":0,"rested":7\}',
    "--bone-no-restitution": r'"ramp":\{"bounced":0,"rested":7\},"flat":\{"bounced":0,"rested":7\}',
    # The review's defect: a flying stick's lower end dips below the floor.
    "--bone-centre-contact": r'"ramp":\{"bones":7,"rested":7,"off":\[\],"below":[1-9]\d*,"firstBelow":\{[^}]*"rest":false',
    # A level stick on the ramp: one resting end in the floor, one above it.
    "--bone-flat-rest": r'"ramp":\{"bones":7,"rested":7,"off":\[\{"x":[\d.]+,"z":[\d.]+,"plane":[\d.]+,"ends":\[',
    "--orb-save-always": r'\{"calls":2\}',
    "--orb-no-cull": r'"culled":1,',
    "--feedback-2d-1px": r'"tome":\{"minRadius":1,',
    # On flat ground every drawn resting bone is off (tilt 0 there, its
    # frozen tumble drawn instead).
    "--rest-draws-tumble": r'"flat":\{"compared":(\d+),"off":\[.*\],"missed":\1\}',
    # The rising bone stops dead with its lower end below the floor.
    "--rising-stick-rests": r'"resting":true,"vz":0,',
    # Lifted, but with a fifth of the free-flight bone's rise (91.089 u/s).
    "--lift-damps-vz": r'"resting":false,"vz":18\.218,"freeVz":91\.089,"xy":\[180,180\]',
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
class EffectProducerTests(unittest.TestCase):
    def test_producer_contracts(self) -> None:
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
                self.assertTrue(any(line.startswith("EFFECT_PRODUCERS_RESULT FAIL ") for line in lines), output)
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
