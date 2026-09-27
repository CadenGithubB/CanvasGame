"""The headless game host works: the game loads, worlds build, input moves the
player, the clock is virtual, the recorder sees draw passes.

Every other tools/webui/tests/test_game_*.py depends on these facts. If this
suite fails, do not read anything into the others.

    python3 -m unittest tools.webui.tests.test_game_smoke
"""

from __future__ import annotations

import unittest

from tools.webui.game_lab import PAGE, game_js, suite_testcase


class GameExtractionTests(unittest.TestCase):
    def test_extracted_game_is_padded_to_header_lines(self) -> None:
        lines = game_js().split("\n")
        marker = "function getWalkableLayerTopAt("
        header_lines = PAGE.read_text(encoding="utf-8").splitlines()
        locations = [i for i, line in enumerate(header_lines) if line.startswith(marker)]
        self.assertEqual(1, len(locations))
        self.assertEqual(header_lines[locations[0]], lines[locations[0]])
        self.assertNotIn("<script", game_js())


KNOWN_BUGS: dict[str, str] = {}

SmokeSuite = suite_testcase("smoke", KNOWN_BUGS, min_checks=13)

if __name__ == "__main__":
    unittest.main()
