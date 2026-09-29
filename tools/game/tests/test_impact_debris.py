"""Impact debris and sparks from projectile contacts and NPC melee commits on the unified particle engine (slice S5)."""

from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

HARNESS = Path(__file__).with_name("impact_debris.js")
# F1-F8 (F1 over sixty shots a side plus wall tops; F4 with a steep
# hillside and cave strata for chips, sparks and dust; F6 with the struck
# first-person player and a fight behind the camera; F7 with the Unified
# switch and the skipped reader; F8 with its host's golden replay), the
# section 9.2 table with its melee row, the struck surfaces, spark, chip and
# dust colours, 3D and 2D views of wall, ore, floor and enemy hits, the
# contact cap (nearest kept, per tick), the drain, where.spell and the close
# dust puff, plus load, runtime failures and stage/console errors: 31 at S5.
PASS_COUNT = 31
SENTINEL = f"IMPACT_DEBRIS_RESULT PASS {PASS_COUNT}"

# Each mutation must fail every named check; setup failures and crashes do not count.
MUTATIONS = {
    "--debris-far-side": ["debris leaves the shooter's side of the wall", "wall, ore, floor and enemy hit debris shows in 3D and in 2D"],
    "--contact-every-substep": ["each blocked contact emits exactly once"],
    "--chips-on-enemy": ["enemy hits spark but throw no chips", "each contact kind throws its section 9.2 sparks, chips and dust"],
    "--chips-ignore-floor": ["chips come to rest on the sloped floor"],
    "--ore-after-splice": ["ore hits use the ore's colours"],
    "--emit-on-windup": ["melee sparks once per committed strike"],
    "--toggle-drops-impacts": ["the debris toggle removes debris only"],
    "--reader-writes-projectile": ["debris never changes gameplay"],
    "--preset-ignores-unified": ["debris follows the Unified effects switch"],
    "--melee-spark-source": ["a strike on the player shows sparks in front of the camera"],
    "--spark-flat-colour": ["sparks take the spell's light and core colours"],
    "--floor-chips-wall-colour": ["chips take the struck surface's colour"],
    "--chips-surface-stratum": ["debris in a cave lands in its own stratum"],
    "--no-contact-cap": ["a contact flood keeps the nearest 24 contacts of the tick"],
    "--contact-cap-keeps-first": ["a contact flood keeps the nearest 24 contacts of the tick"],
    "--contact-cap-keeps-latest": ["a contact flood keeps the nearest 24 contacts of the tick"],
    "--contact-cap-per-session": ["the contact cap starts again every tick"],
    "--melee-front-for-all": ["a fight behind the camera keeps its sparks where it happens"],
    "--contact-spell-unset": ["a where.spell binding fires for its spell only"],
    "--floor-normal-up": ["debris from a steep hillside hit leaves the slope"],
    "--wall-dust-floor-colour": ["dust takes the struck surface's colour"],
    "--dust-into-wall": ["debris leaves the shooter's side of the wall"],
    "--dust-unclamped": ["a hit next to the camera draws a small dust puff"],
    "--sparks-surface-stratum": ["sparks and dust fly and settle in their own stratum"],
    "--dust-surface-stratum": ["sparks and dust fly and settle in their own stratum"],
    "--terrain-spawn-at-centre": ["each contact kind's debris starts at the struck surface, on the shooter's side"],
    "--lob-spawn-centre": ["each contact kind's debris starts at the struck surface, on the shooter's side"],
    "--body-spawn-at-centre": ["each contact kind's debris starts at the struck surface, on the shooter's side"],
    "--companion-mines-ore": ["each contact kind throws its section 9.2 sparks, chips and dust"],
    "--wall-top-as-face": ["a hit on a wall's top throws its debris up off the top"],
    "--inside-top-as-face": ["a hit on a wall's top throws its debris up off the top"],
    "--melee-no-dust": ["each contact kind throws its section 9.2 sparks, chips and dust"],
    "--melee-spark-count": ["each contact kind throws its section 9.2 sparks, chips and dust"],
    "--melee-spark-feet": ["each contact kind throws its section 9.2 sparks, chips and dust"],
    "--melee-at-attacker": ["each contact kind throws its section 9.2 sparks, chips and dust"],
    "--event-max-all-bindings": ["a tick's contacts that fit its spawn cap all spawn in it"],
    "--read-contacts-while-off": ["a switched-off debris preset skips the contact reader"],
}
# The failure detail must also show the intended cause: a string applies to
# the first named check, a dict names the check each pattern belongs to.
CAUSES = {
    # Spawned 0.75 u inside the wall (x 150.75 behind the west face at 150);
    # its chips are killed inside the wall, so no chip or puff is drawn.
    "--debris-far-side": {
        "debris leaves the shooter's side of the wall":
            r'"west":\{"face":150,"spawns":720,"dust":60,"offCount":720,"off":\[\{"id":"impact\.spark","x":150\.75,"depth":-0\.75\}',
        "wall, ore, floor and enemy hit debris shows in 3D and in 2D": r'"wall":\{"live":\d+,"threeD":\{"sparks":\d+,"chips":0,"puffs":0\}',
    },
    # One event per sweep step of the whole flight.
    "--contact-every-substep": r'"wall":\{"events":(\d+),"ticks":\1,',
    "--chips-on-enemy": r'"enemy":\{"spark":4,"chip":5,',
    # Chips fall through the ramp: none rests, hundreds of samples below it.
    "--chips-ignore-floor": r'"rested":0,"restGaps":\[\],"below":[1-9]',
    # The one-hp teal vein spliced before the reader: the plain wall's chips
    # (the ground biome's wall base #b48c64) and six wall sparks, not eight.
    "--ore-after-splice": r'"splicedTeal":\{"chips":\d+,"colours":\["#b48c64"(,"#b48c64")*\],"veinsLeft":0,"coins":\d+,"sparks":6\}',
    "--emit-on-windup": r'"duringWindup":[1-9]',
    # Debris off loses the plain wall hit's impact record (142, 157).
    "--toggle-drops-impacts": r'"offGameplay":"\{\\"impacts\\":\[\[84,110,55,220,\\"missile\\"\],\[142,67,',
    # The projectile of a wall hit relabelled a lob: the gameplay branch right
    # after the hook lands it as a lob (a poison-cloud landing, a 400 ms impact).
    "--reader-writes-projectile": r'"differ":\["wall hit location and lifetime"\]',
    "--preset-ignores-unified": r'"unifiedOff":\{"debris":[1-9]\d*,"gated":0,',
    "--melee-spark-source": r'"front":\{"frames":\[0,0,0,0\],"best":0,',
    # The missile's flat colour #4db6ff (5093119) instead of its light and core roles.
    "--spark-flat-colour": r'"missile":\["5093119"\]',
    # Floor chips in the wall base #b48c64 (11832420), not floor band 5.
    "--floor-chips-wall-colour": r'"floor":\["11832420"\]',
    # Ceiling chips lifted onto the roof (125) instead of the cave floor.
    "--chips-surface-stratum": r'"ceiling":\{"rests":\[125\.3\]',
    "--no-contact-cap": r'"farFirst":\{"queued":\[8,(\d+,){28}240\],"want":\[[\d,]+\],"dropped":0\}',
    # The first 24 (the farthest) kept, the six nearest dropped.
    "--contact-cap-keeps-first": r'"farFirst":\{"queued":\[56,64,.*"dropped":6\}',
    # Nearest first, always replacing: the latest (240) displaces the 192.
    "--contact-cap-keeps-latest": r'"nearFirst":\{"queued":\[8,(\d+,){22}240\],',
    # The 25th contact of the session is dropped, and every one after it.
    "--contact-cap-per-session": r'"spawnedPerTick":"(8,){24}(0,){15}0","dropped":16\}',
    # The fight 150 u behind the camera is moved 26 u in front of it and drawn.
    "--melee-front-for-all": r'"behind":\{"sparks":\d+,"atSource":0,"first":\[326,170,54\],"drawn":[1-9]',
    # The ring's spell code stays 0: the frost bolt throws no shards.
    "--contact-spell-unset": r'"ice":\{"spell":"ice","shards":0,"chips":5\}',
    # Sparks reflected about +z keep flying into the 60 degree hill and die.
    "--floor-normal-up": r'"steep":\{"deg":60,"contact":\[56\.743,45\],"spawns":\d+,"sparks":3,"intoHill":\["impact\.spark"',
    # Wall dust in the ground's floor band 5 green #6a9a79 (6986361).
    "--wall-dust-floor-colour": r'"wall":\["6986361"\]',
    # Some of the sixty wall puffs start behind the west face.
    "--dust-into-wall": r'"off":\[\{"id":"impact\.dust","x":150\.\d+,"depth":-0\.\d+\}',
    # The default 64 px clamp: a puff about a third of the canvas height.
    "--dust-unclamped": r'"widestPx":(4[1-9]|[5-9]\d|\d{3,})(\.\d+)?,"limitPx":40,',
    # Ceiling sparks collide with the roof above the cave and die at once.
    "--sparks-surface-stratum": r'"ceiling":\{"sparksSpawned":6,"sparksAlive":\[0,0,0\]',
    # Ceiling dust clamped onto the roof (125.5), above the cave.
    "--dust-surface-stratum": r'"ceiling":\{"sparksSpawned":6,"sparksAlive":\[6,6,6\],"sparkZ":\[[\d.]+,[\d.]+\],"dust":1,"dustZ":\[125\.5',
    # Floor debris at the sphere's centre (8 u up) plus 0.75.
    "--terrain-spawn-at-centre": r'\{"kind":"floor","id":"impact\.spark","got":8\.75,"surface":0\}',
    "--lob-spawn-centre": r'\{"kind":"lob","id":"impact\.spark","got":8\.75,"surface":0\}',
    # Enemy sparks 8.75 u short of the body (the sphere's centre minus 0.75).
    "--body-spawn-at-centre": r'\{"kind":"enemy","id":"impact\.spark","got":193\.25,"surface":202\}',
    # The slime bolt into a vein is classed ore: no binding matches, nothing shows.
    "--companion-mines-ore": r'\{"kind":"slimeOre","want":\[0,0,0,3\],"got":\{"spark":0,"chip":0,"dust":0,"slimeSplat":0,',
    # The shot down onto the top taken for the west face: debris at z 240, x 156.25.
    "--wall-top-as-face": r'"down":\{"spawns":\d+,"sample":\[\{"id":"impact\.spark","x":156\.25,"y":157,"z":240,',
    "--inside-top-as-face": r'"insideAtTop":\{"spawns":\d+,"sample":\[\{"id":"impact\.spark","x":149\.25,"y":157,"z":239\.5,',
    "--melee-no-dust": r'"got":\{"sparks":4,"sparksAtTorso":4,"dust":0,',
    "--melee-spark-count": r'"got":\{"sparks":2,"sparksAtTorso":2,',
    "--melee-spark-feet": r'"sparksAtTorso":0,.*"sparkAt":\[153,200,0\]',
    "--melee-at-attacker": r'"sparkAt":\[140,200,29\.7\]',
    # Every projectileContact binding counted (81 a contact): 16 of 20 drain.
    "--event-max-all-bindings": r'"waiting":4,"spawnedInTick":304,"want":380',
    "--read-contacts-while-off": r'"off":\{"reads":5,"gated":0,',
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
class ImpactDebrisTests(unittest.TestCase):
    def test_debris_contracts(self) -> None:
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
                self.assertTrue(any(line.startswith("IMPACT_DEBRIS_RESULT FAIL ") for line in lines), output)
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
