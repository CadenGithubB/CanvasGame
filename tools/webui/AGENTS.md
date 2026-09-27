# Game audit work

When working on the optional game lab or its tests, read
`assets/games/TESTING.md` from the repository root first. Tests must exercise
real failure risks, prove their setup, and demonstrate sensitivity to plausible
defects. Do not convert broken fixtures into expected failures.

Respect `assets/games/AGENTS.md` for game sources and publication boundaries.
The audit lab is included in the standalone CanvasGame repository from 0.0;
sanitize new evidence and keep raw private captures out of version control.
The proposed shared-physics design is `docs/game_physics_plan.md`; do not treat
the roadmap as authorization to implement its later phases.
