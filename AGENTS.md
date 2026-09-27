# CanvasGame development

- This is the standalone game repository. Keep work scoped to the game,
  developer previews, documentation, and its test infrastructure.
- Read `assets/games/AGENTS.md` and `assets/games/TESTING.md` before changing
  gameplay or tests. Read `tools/webui/AGENTS.md` for the extended audit lab.
- Edit `assets/games/` and regenerate `components/hardwareone/WebPage_Games.h`
  with `python3 tools/game/dev.py build`; never hand-edit the generated header.
- Preserve classic-script order and scope. Do not broadly reformat source or
  convert fragments to modules as incidental cleanup.
- Run `python3 tools/game/dev.py test` and relevant focused behavioral checks.
  Browser pixel/performance claims require real browser evidence. Never refresh
  a user's positioned game to run diagnostics; use a separate test page.
- The game audit lab and sanitized historical docs are intentionally included
  starting with version 0.0. Old notes saying to leave them uncommitted describe
  the prior HardwareOne workflow and are not the current publication policy.
- Keep secrets, personal paths, usernames, private emails, raw browser profiles,
  session transcripts, and unsanitized logs out of commits. Preserve required
  public copyright/license notices. Inspect exact staged content and commit/tag
  metadata before publication; stage explicit paths, not `git add -A`.
- Keep model/material data independent of future rendering backends. The LOD
  and coverage-first mapping discussion is a plan, not implemented behavior.
- Use `codex/` for new work branches. Publishing requires user authorization.
