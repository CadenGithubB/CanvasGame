"""Level 4's floor pass keeps every floor cell it collects (audit D25).

Risk: drawLayersFloor3D packs one [distSq, x, y] triple per collected cell into
_drawFloorCellBuf before sorting and drawing. The buffer held a fixed 40,000
cells while the classic Expanse (Level 4: 2304 u view over a 360x240 mesh)
collects up to 46,596; typed-array writes past the end are silently dropped,
and since the scan is row-major the lost cells are the last rows scanned, not
the farthest. Looking down, the whole screen lost its floor; level with the
dash FOV, the ground just in front of the player. Nothing was logged. The pass
now grows the buffer, before collecting, to the largest scan rectangle its view
distance and mesh allow (once per growth, never per frame, never a shrink).

Oracles (floor_cell_buffer.js, real MAIN manifest through render_host.js, real
Level 4 start path, seed 9127+4): a reference copy of the same pass evaluated
from the unmutated source and given a buffer as large as the whole mesh -- its
stored cells (cross-checked with the pass's own cull counters), its projected
floor quads in order, and its scene depth from the same input; and an analytic
expectation: 80 degrees down at single-layer ground under open sky, with the
horizon above the canvas, every pixel is ground. Four fixtures each want more
than 40,000 cells; the first is the level's first 3D frame. Scene depth, not
browser pixels or timing. Reuse: frames that need no larger scan rectangle
allocate nothing, and a walk in from the map corner at the fixed 2304 u view
(13 open-ground stops, each scanning a larger rectangle by the pass's own
floorTotal counter, the first within 40,000 cells) replaces the game's
40,000-cell start buffer exactly once and never leaves it smaller than the
rectangle scanned.

Mutation controls (evaluated copies only): --fixed-capacity restores the fixed
40,000-cell buffer, --stale-local reads the buffer before growing it,
--exact-size grows only to the current frame's scan rectangle (12 replacements
on the walk instead of 1), --realloc-every-frame allocates a buffer every
frame. Each must fail exactly its named checks while every setup check still
passes.

Opt-in (not run by this suite; slow, about 4 minutes on jsc): `--sweep` adds
6,400 Level 4 poses at two seeds (25 positions x 16 headings x pitch
0/0.6/1.2/1.4 x base/dash FOV), each compared quad for quad with the reference:
    python3 -c "from tools.webui.js_engine import run_js; \\
      print(run_js('tools/game/tests/floor_cell_buffer.js', ['--sweep'], timeout=1800).stdout)"
"""
from pathlib import Path
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

SCRIPT = Path(__file__).with_name("floor_cell_buffer.js")
EXPECTED = 11
SETUP = (
    "PASS real manifest loads, with a reference copy of the floor pass, and no console errors",
    "PASS setup: the classic Expanse (Level 4) has a 2304 u view over a 360x240 layered mesh",
    "PASS setup: every fixture wants more than 40,000 floor cells (reference store = the pass's own cull counters)",
    "PASS setup: every fixture frame runs the floor pass once, outside walls, with no render crash or console error",
    "PASS setup: the first fixture is the level's first floor pass, looks down at single-layer ground under open sky "
    "(horizon above the canvas) and the reference floors every pixel",
    "PASS setup: walking in from the map corner (13 stops, fixed 2304 u view, fresh 40,000-cell buffer), the first "
    "stop scans within 40,000 cells and every later stop a larger rectangle, each frame running the floor pass once, "
    "outside walls, with no render crash or console error",
)
QUADS = "Level 4 draws every floor quad the unconstrained reference draws, in the same order, at every fixture"
ANALYTIC = "looking 80 deg down at open ground in the level's first 3D frame, every canvas pixel has floor depth"
DEPTH = "Level 4 floor depth equals the unconstrained reference at every fixture (no near ground lost)"
REUSE = ("the grown buffer is reused: 16 more Level 4 frames, a Level 2 frame and Level 4 again allocate no new "
         "buffer")
WALK = ("walking in from the map corner at a fixed view distance replaces the 40,000-cell start buffer once, never "
        "smaller than the rectangle scanned")
# flag -> the checks that must FAIL (and no others). The stale local still
# replaces the global once per growth, so the walk (which counts replacements
# and reads the global) passes under it; the fixture checks catch it.
MUTATIONS = {
    "--fixed-capacity": (QUADS, ANALYTIC, DEPTH, WALK),
    "--stale-local": (QUADS, ANALYTIC, DEPTH),
    "--exact-size": (WALK,),
    "--realloc-every-frame": (REUSE, WALK),
}


def run(*flags):
    result = run_js(SCRIPT, list(flags), timeout=300)
    output = result.stdout + result.stderr
    return output, result.stdout.splitlines()


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class FloorCellBufferTests(unittest.TestCase):
    def test_level4_floor_keeps_every_cell(self) -> None:
        output, lines = run()
        self.assertIn(f"FLOOR_CELL_BUFFER_RESULT PASS {EXPECTED}", lines, output)
        self.assertEqual(EXPECTED, sum(line.startswith("PASS ") for line in lines), output)
        for name in (QUADS, ANALYTIC, DEPTH, REUSE, WALK):
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
                failing = sorted(line[5:] for line in lines if line.startswith("FAIL "))
                self.assertEqual(len(names), len(failing), f"{flag}:\n{output}")
                for name in names:
                    self.assertTrue(any(line.startswith(name) for line in failing), f"{flag} did not fail '{name}'\n{output}")
                self.assertIn(f"FLOOR_CELL_BUFFER_RESULT FAIL {len(names)}", lines, output)


if __name__ == "__main__":
    unittest.main()
