# Game source editing

- Before changing gameplay or its tests, read `TESTING.md` here. It defines
  the user's requirement for realistic failure scenarios, independent oracles,
  non-vacuous fixtures, mutation controls, and honest performance evidence.
- The shared-physics proposal lives in `docs/game_physics_plan.md` at the
  repository root. It is a staged design, not blanket implementation approval.
- `SPATIAL.md` describes the implemented shared queries/motion/sweeps, unit conversions,
  fixed-tick clock/input and pause policy, intentionally unmigrated systems, and
  regression/benchmark commands. Gameplay deadlines use `gameTimeNow()`; keep
  real-time hardware/performance clocks separate. Never apply gameplay movement
  or authoritative aiming from a render function or asynchronous sensor response.
- Rendering interpolation lives in `02-render-interpolation.js`. Keep it strictly
  presentation-only; never pass visual views to simulation, mutate source poses,
  or retain a draw scope across an asynchronous boundary. Mark teleports explicitly
  and keep the on/off replay and allocation-reuse tests in the shipping gate.
- `AI.md` describes the shared NPC profiles, targeting/action contracts, identity
  lifecycle and measurement boundary. Extend these helpers for new NPC behaviors;
  do not create another height-blind attack loop or tie movement to thought rate.
  Local route searches share one fixed-tick work budget. Probe real body motion,
  keep height in route state, and never steer toward a hidden target's live pose.
  New in-place geometry edits must invalidate navigation advice explicitly.

- Treat this directory as the editable source for
  `components/hardwareone/WebPage_Games.h`. Regenerate the header with
  `python3 tools/game/dev.py build`; do not hand-edit the generated header.
- Preserve the manifest's fragment order, both original script regions, and
  classic-script scope. Fragments are not independent modules. Do not casually
  reorder or reformat them, enable strict mode, or convert them to ES modules.
- Keep behavior changes focused. After editing, run `build` and then
  `python3 tools/game/dev.py test` from the repository root. A successful tooling
  test validates generation and syntax; use the relevant behavioral suite for
  gameplay changes when the local audit lab is available.
- Update focused tests and known-bug expectations for intentional repairs. Do
  not run the full cross-suite investigation matrix for every small edit.
- Review the source and generated-header diffs together. Include both in any
  authorized commit, staging explicit paths only; never use `git add -A` here.
- The standalone CanvasGame repository includes the audit lab and sanitized
  handoff documents starting at 0.0. Core tooling must still work without the
  optional lab. Review personal information and secrets before publishing docs.
- Keep work within the game source/tooling paths. Unrelated HardwareOne firmware
  and third-party games are not part of this repository.
- See `README.md` for the local preview, syntax-engine requirements, optional
  suite commands, and generated-header line-to-source lookup.
