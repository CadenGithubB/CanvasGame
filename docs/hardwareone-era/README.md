# HardwareOne-era history of the game

Before CanvasGame became its own project (snapshot `c6851a4`, 2026-09-27), the
game was developed inside the HardwareOne firmware repository as a browser
game served by the device (`assets/games/`, `tools/game/`, `WebPage_Games.h`).
It was removed from HardwareOne on 2026-09-28. This folder keeps that history.

- `hardwareone-html-game-2026-09.bundle` - the three commits of the
  HardwareOne branch `codex/html-game` (2026-09-20 to 2026-09-26: workflow and
  cave rendering checkpoint, a WIP checkpoint, "polish HUD and pause
  lifecycle"). About 98% of their added lines are in this repository's
  initial snapshot. The branch was deleted and these commits were otherwise
  reachable only from a local reflog. The bundle needs HardwareOne history up
  to `8391047d` (tag `v0.99.94.1`) as its base:

  ```sh
  git clone https://github.com/CadenGithubB/HardwareOne.git hw1 && cd hw1
  git fetch /path/to/hardwareone-html-game-2026-09.bundle refs/archive/codex-html-game:html-game
  ```

- `milestones/` - checkpoint reports and measurements from the 2026-09-19 to
  09-20 work: workflow, cave milestone and rendering repair, entity
  visibility, fullscreen performance, cave-exit repair, artwork cache, hand rig.
- `probe-scripts/` - the browser and Python probes and benchmark results used
  for those checkpoints.

Local paths in these files were replaced with placeholders.
