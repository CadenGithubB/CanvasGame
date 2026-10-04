"""renderEntities3D keeps every visible entity, however many (no silent 512 cap).

Risk: renderEntities3D's shared visibility/sort buffers held 512 entries and
its loop stopped at the 512th visible entity, in array order rather than by
distance, without a counter or a log line. Endless floor scatter at the Ultra
preset (1800 u view, 9x9 window) puts up to ~700 sprites in view; at seed
899731 looking 90 degrees, 47 of 559 in-view sprites never reached the depth
test and the frame drew 196 instead of 225. The buffers now double on demand
(no per-frame allocation once grown) and entity indices are Uint32, so arrays
longer than 65,535 cannot wrap.

Oracles (render_entities_capacity.js, real MAIN manifest through
render_host.js): authored entities in front of and behind the camera within
range (exactly the front ones drawn, each once, farthest first; entities past
index 65,535 drawn as themselves), and the stage K floor-scatter prefilter,
which keeps exactly the items entityVisible3D keeps by distance and forward:
each must reach the scatter's depth-tested draw (its bounds callback) once,
farthest first, with floor-prop models on (default) and off. Callbacks and
commands, not browser pixels or timing. Allocation: the index and distance
buffers, sampled at every entityVisible3D call of the first 2,000-entity call,
are replaced only by doubling (ceil(log2(2000 / start)) times, here 1,024 to
2,048), and once grown three more Endless Ultra scatter frames and a second
2,000-entity call keep the same buffer objects.

Mutation controls (evaluated copies only): --cap-512 restores the fixed cap,
--uint16-index restores Uint16 indices, --grow-no-copy grows without copying
the entries already kept, --shrink-each-call starts every call from new
512-entry buffers, --grow-by-one grows one entry at a time (1,390
replacements in one call). Each must fail exactly its named checks while the
setup checks still pass.
"""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("render_entities_capacity.js")
EXPECTED = 9
SETUP = (
    "PASS real manifest loads with no console errors",
    "PASS setup: Endless seed 899731 at the Ultra preset (1800 u view, 9x9 window), floor-prop models on (default)",
    "PASS setup: both floor-scatter fixtures put more than 512 sprites in view (stage K prefilter), none nearer than "
    "3 u, outside walls, with no console error",
)
DEFAULT = ("Endless Ultra: every in-view floor-scatter sprite reaches the depth-tested draw once, farthest first "
           "(default features)")
LEGACY = ("Endless Ultra: every in-view floor-scatter sprite reaches the depth-tested draw once, farthest first "
          "(floor-prop models off)")
AUTHORED = ("authored: of 2,000 entities in front and 2,000 behind, exactly the front ones are drawn, each once, "
            "farthest first")
INDEX = "authored: entities past index 65,535 are drawn as themselves"
DOUBLING = ("growth doubles: the first 2,000-entity call replaces the index and distance buffers only by doubling, "
            "ending with room for 2,000")
REUSE = ("grown buffers are reused: 3 more Endless Ultra frames and a second 2,000-entity call keep the same index "
         "and distance buffers")
# flag -> the checks that must FAIL (and no others). Growth without a copy
# bites only in the frame that grows, so the second scatter fixture, drawn
# after the first grew the buffers, still passes. The fixed cap never grows,
# so the call that needs 2,000 entries never gets room for them. A per-call
# reset still doubles from 512 within the call; growth by one still keeps
# what later calls need.
MUTATIONS = {
    "--cap-512": (DEFAULT, LEGACY, AUTHORED, DOUBLING),
    "--uint16-index": (INDEX,),
    "--grow-no-copy": (DEFAULT, AUTHORED),
    "--shrink-each-call": (REUSE,),
    "--grow-by-one": (DOUBLING,),
}


def run(*flags):
    result = run_js(SCRIPT, list(flags), timeout=300)
    output = result.stdout + result.stderr
    return output, result.stdout.splitlines()


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class RenderEntitiesCapacityTests(unittest.TestCase):
    def test_every_visible_entity_is_drawn(self) -> None:
        output, lines = run()
        self.assertIn(f"RENDER_ENTITIES_CAPACITY_RESULT PASS {EXPECTED}", lines, output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in lines), output)
        for name in (DEFAULT, LEGACY, AUTHORED, INDEX, DOUBLING, REUSE):
            self.assertIn("PASS " + name, lines, output)
        self.assertTrue(any(line.startswith("NOTE ") for line in lines), output)
        self.assertNotIn("SETUP", output)

    def test_each_mutation_fails_its_named_checks(self) -> None:
        for flag, names in MUTATIONS.items():
            with self.subTest(mutation=flag):
                output, lines = run(flag)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP", output)
                for line in SETUP:
                    self.assertIn(line, lines, f"{flag}: setup must still hold\n{output}")
                failing = [line[5:] for line in lines if line.startswith("FAIL ")]
                self.assertEqual(len(names), len(failing), f"{flag}:\n{output}")
                for name in names:
                    self.assertTrue(any(line.startswith(name) for line in failing), f"{flag} did not fail '{name}'\n{output}")
                self.assertIn(f"RENDER_ENTITIES_CAPACITY_RESULT FAIL {len(names)}", lines, output)


if __name__ == "__main__":
    unittest.main()
