# Version 0.0 migration validation

Date: 2026-09-27. This record distinguishes migration correctness from existing
gameplay and test-lab issues. No gameplay, mapper, or test expectation was edited
as part of this extraction.

## Completed checks

| Check | Result |
| --- | --- |
| `python3 tools/game/dev.py build` | Generated header already current |
| `python3 tools/game/dev.py test` | 160 tests passed, 76.413 s |
| `python3 -m unittest tools.webui.tests.test_js_engine -v` | 1 test passed, 0.430 s; JavaScriptCore/JXA contract |
| `python3 -m unittest discover -s tools/webui/tests -t . -p 'test_game*.py'` | 294 tests, 8 failures, 207 skips, 172.859 s |
| Original-working-copy comparison | All eight failing assertions reproduced before migration, 167.167 s; no test expectations changed |
| HTTP preview smoke | All six routes returned 200 with assembled scripts; isolated loopback server stopped afterward |
| Executable/source comparison | 218 imported executable/source files byte-identical to the original working copy |
| Publication review | Staged content checked for personal home paths, specific temporary profiles, private identifiers/emails/network addresses, common credential patterns, private keys, symlinks, unexpected binaries, and local artifacts; no unresolved matches |
| Structured evidence | All 24 imported JSON files parsed successfully |
| License | Byte-identical to the source repository; existing public copyright attribution retained |

The core and extended suites ran concurrently; elapsed durations are test-run
records, not controlled rendering/performance comparisons. The migration did not
rerun the native pixel/motion suites or the exhaustive mutation matrix. Their
previous evidence is preserved with its original limitations. Opt-in skips are
unverified, not passing tests.

Generated game-header SHA-256:

`0ac57283ae45e63b062cc8e55f1be0f1786fa7a45260a4e897e1eb8d26cc9d17`

Checked routes: `/`, `/game.html`, `/artwork.html`, `/textures.html`,
`/structures.html`, and `/physics-profile.html`. HTTP delivery does not prove
native visual correctness.

## Extended audit: eight failing assertions

| Suite / assertion | Observed issue |
| --- | --- |
| Enemies / no unexpected failures | Patrol recovery reached 41/44 trials (93.2%), below the existing 95% requirement. |
| Loot / no unexpected failures | Three cave-chest walks reached an offered chest but the harness recorded no prompt draw. Gameplay versus fixture cause needs investigation. |
| Performance / known-bug reason | First-frame control-mode fixture failed its prerequisite: input was not exercised as expected. |
| Performance / known bugs still fail | Four historical 30/60 FPS input-rate defects now pass; their old expected-failure entries are stale. |
| Persistence / known-bug reason | Endless clearing still spawned a goal, but the old expectation also required a throw that was not observed. |
| Persistence / known bugs still fail | Restart/allied-progress and arena/spawner identity cases now pass against old expected-failure entries. |
| Physics / known-bug reason | The lethal-attack fixture failed its prerequisite; it cannot establish the intended death behavior. |
| Rendering / known-bug reason | Walk-cycle observations no longer match the historical idle/walking failure signature. |

These assertions remain failing in the published snapshot. Setup failures were
not relabeled as product defects or waived. Repaired historical expectations
need targeted sensitivity checks before removal; unexpected gameplay observations
need their own investigation. The newly identified structure zoom/budget failure
is separately documented in `0.0.md` and is not fixed by this migration.

The original-working-copy comparison reran the two failing methods in each of
`PerfSuite` and `PersistenceSuite`, and the failing method in each of
`EnemiesSuite`, `LootSuite`, `PhysicsSuite`, and `RenderSuite`, from their
`tools.webui.tests.test_game_*` modules. All eight failed there as well. Together
with byte-identical game/harness files, this establishes that the migration did
not introduce those failures; it does not resolve their underlying causes.

## Privacy and provenance

The standalone repository starts with a clean game-only snapshot rather than
importing unrelated firmware history. Historical documentation was sanitized;
the original private records and HardwareOne working copy were left in place.
All game source, texture-study files, game regressions, game audit harnesses,
and historical game evidence were checked for migration completeness.

Commit/tag identity is the nonpersonal project identity `CanvasGame Import`.
The pattern review is a publication safeguard, not a guarantee that automated
secret detection can find every possible sensitive value.
