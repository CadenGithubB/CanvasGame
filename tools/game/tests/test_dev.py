"""Guard the source-to-firmware boundary without freezing future game content."""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path
import re
import tempfile
import unittest

from tools.game import dev


class SourceFixtureTests(unittest.TestCase):
    """Use a tiny complete source tree so invalid builds cannot touch firmware."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory(prefix="hw1_game_source_test_")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / "game"
        (self.root / "src").mkdir(parents=True)
        self.header = Path(self.tmp.name) / "generated.h"
        self.template = (
            '// fixture header\nR"CSS(@@CSS@@)CSS"\n'
            'R"HTML(@@HTML@@)HTML"\n'
            'R"JS(<script>@@BOOTSTRAP@@</script>\n'
            '<script>@@MAIN@@</script>)JS"\n'
        )
        self.manifest = {
            "format": 1,
            "template": "header.h.in",
            "parts": {
                "CSS": ["page.css"],
                "HTML": ["page.html"],
                "BOOTSTRAP": ["src/00-errors.js"],
                "MAIN": ["src/10-start.js", "src/20-end.js"],
            },
        }
        self.put("header.h.in", self.template)
        self.put("page.css", ".game { color: green; }")
        self.put("page.html", "<div class='game'>Game</div>")
        self.put("src/00-errors.js", "window.fixtureReady = true;\n")
        # A newline inserted between fragments would change this string value.
        self.put("src/10-start.js", 'var fixtureValue = "left')
        self.put("src/20-end.js", 'right";\n')
        self.save_manifest()

    def put(self, relative: str, text: str) -> None:
        (self.root / relative).write_text(text, encoding="utf-8")

    def save_manifest(self) -> None:
        self.put("manifest.json", json.dumps(self.manifest))

    def test_assembly_preserves_exact_bytes_and_manifest_order(self) -> None:
        result = dev.assemble(self.root)
        expected = self.template
        for name, paths in self.manifest["parts"].items():
            content = b"".join((self.root / path).read_bytes() for path in paths)
            expected = expected.replace("@@" + name + "@@", content.decode("utf-8"))
        self.assertEqual(expected.encode("utf-8"), result.header)
        self.assertEqual(
            ("window.fixtureReady = true;\n", 'var fixtureValue = "leftright";\n'),
            result.scripts,
        )

    def test_missing_fragment_is_rejected(self) -> None:
        (self.root / "src/20-end.js").unlink()
        with self.assertRaises(dev.SourceError):
            dev.assemble(self.root)

    def test_duplicate_fragment_is_rejected(self) -> None:
        self.manifest["parts"]["MAIN"].append("src/10-start.js")
        self.save_manifest()
        with self.assertRaises(dev.SourceError):
            dev.assemble(self.root)

    def test_fragment_cannot_be_shared_between_parts(self) -> None:
        self.manifest["parts"]["MAIN"].append("src/00-errors.js")
        self.save_manifest()
        with self.assertRaises(dev.SourceError):
            dev.assemble(self.root)

    def test_missing_unknown_and_duplicate_template_tokens_are_rejected(self) -> None:
        variants = {
            "missing": self.template.replace("@@MAIN@@", ""),
            "unknown": self.template + "@@SURPRISE@@",
            "duplicate": self.template + "@@MAIN@@",
        }
        for name, template in variants.items():
            with self.subTest(name=name):
                self.put("header.h.in", template)
                with self.assertRaises(dev.SourceError):
                    dev.assemble(self.root)

    def test_cpp_raw_string_and_html_script_terminators_are_rejected(self) -> None:
        collisions = [
            ("page.css", ')CSS"'),
            ("page.html", ')HTML"'),
            ("src/10-start.js", ')JS"'),
            ("src/00-errors.js", 'var text = "</script>";'),
            ("src/00-errors.js", 'var text = "</ScRiPt>";'),
        ]
        for relative, content in collisions:
            with self.subTest(relative=relative, content=content):
                original = (self.root / relative).read_text(encoding="utf-8")
                try:
                    self.put(relative, content)
                    with self.assertRaises(dev.SourceError):
                        dev.assemble(self.root)
                finally:
                    self.put(relative, original)

    def test_outside_source_paths_are_rejected(self) -> None:
        outside = Path(self.tmp.name) / "outside.css"
        outside.write_text("outside {}", encoding="utf-8")
        for path in ("../outside.css", str(outside)):
            with self.subTest(path=path):
                self.manifest["parts"]["CSS"] = [path]
                self.save_manifest()
                with self.assertRaises(dev.SourceError):
                    dev.assemble(self.root)

    def test_terminator_split_across_fragments_is_rejected(self) -> None:
        self.put("src/10-start.js", ")J")
        self.put("src/20-end.js", 'S"')
        with self.assertRaises(dev.SourceError):
            dev.assemble(self.root)

    def test_source_symlink_cannot_escape_root(self) -> None:
        outside = Path(self.tmp.name) / "outside.css"
        outside.write_text("outside {}", encoding="utf-8")
        (self.root / "escape.css").symlink_to(outside)
        self.manifest["parts"]["CSS"] = ["escape.css"]
        self.save_manifest()
        with self.assertRaises(dev.SourceError):
            dev.assemble(self.root)

    def test_symlink_alias_cannot_include_a_fragment_twice(self) -> None:
        (self.root / "src/alias.js").symlink_to(self.root / "src/10-start.js")
        self.manifest["parts"]["MAIN"].append("src/alias.js")
        self.save_manifest()
        with self.assertRaises(dev.SourceError):
            dev.assemble(self.root)

    def test_unlisted_javascript_is_rejected(self) -> None:
        self.put("src/30-forgotten.js", "var forgotten = true;\n")
        with self.assertRaises(dev.SourceError):
            dev.assemble(self.root)

    def test_stale_check_does_not_rewrite_the_header(self) -> None:
        self.header.write_bytes(b"existing firmware header\n")
        before = self.header.stat().st_mtime_ns
        with self.assertRaises(dev.SourceError):
            dev.check(self.root, self.header)
        self.assertEqual(b"existing firmware header\n", self.header.read_bytes())
        self.assertEqual(before, self.header.stat().st_mtime_ns)

    def test_build_is_idempotent_and_check_accepts_built_header(self) -> None:
        self.assertTrue(dev.build(self.root, self.header))
        expected = dev.assemble(self.root).header
        self.assertEqual(expected, self.header.read_bytes())
        before = self.header.stat().st_mtime_ns
        self.assertFalse(dev.build(self.root, self.header))
        self.assertEqual(before, self.header.stat().st_mtime_ns)
        self.assertEqual(expected, dev.check(self.root, self.header).header)

    def test_validation_failure_preserves_previous_header(self) -> None:
        self.assertTrue(dev.build(self.root, self.header))
        before = self.header.read_bytes()
        self.put("page.css", ')CSS"')
        with self.assertRaises(dev.SourceError):
            dev.build(self.root, self.header)
        self.assertEqual(before, self.header.read_bytes())

    def test_syntax_failure_preserves_previous_header(self) -> None:
        self.assertTrue(dev.build(self.root, self.header))
        before = self.header.read_bytes()
        self.put("src/10-start.js", "var fixtureValue = ;\n")
        self.put("src/20-end.js", "// end\n")
        with self.assertRaises(dev.SourceError):
            dev.build(self.root, self.header)
        self.assertEqual(before, self.header.read_bytes())

    def test_check_rejects_invalid_javascript_even_when_header_matches(self) -> None:
        self.put("src/10-start.js", "var fixtureValue = ;\n")
        self.put("src/20-end.js", "// end\n")
        self.header.write_bytes(dev.assemble(self.root).header)
        before = self.header.read_bytes()
        with self.assertRaises(dev.SourceError):
            dev.check(self.root, self.header)
        self.assertEqual(before, self.header.read_bytes())

    def test_source_map_rejects_out_of_range_lines(self) -> None:
        assembled = dev.assemble(self.root)
        for line in (0, -1, len(assembled.header.splitlines()) + 100):
            with self.subTest(line=line):
                with self.assertRaises(dev.SourceError):
                    dev.source_location(assembled, line)


class TexturePreviewSourceTests(unittest.TestCase):
    """Fail closed when a standalone pilot loses or corrupts its real imports."""

    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory(prefix="hw1-texture-preview-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.source = self.root / "game"
        self.tooling = self.root / "tools"
        (self.source / "src").mkdir(parents=True)
        self.tooling.mkdir()
        self.camera = "function getCam3D() { return {w: canvas.width}; }\n\n"
        self.config = ("var unrelatedBefore = true;\n" + self.camera +
                       "// Projects a world point to screen coordinates.\n" +
                       "function unrelatedAfter() {}\n")
        self.page = ("<!doctype html><script>\n/* @PRODUCTION_CAMERA@ */\n"
                     "/* @PRODUCTION_DEPTH@ */\n/* @TEXTURE_MAPPING@ */\n"
                     "/* @TEXTURE_TEMPORAL@ */\n</script>")
        self.paths = {
            "config": self.source / "src/01-config-state.js",
            "depth": self.source / "src/12-scene-depth.js",
            "mapping": self.tooling / "texture-mapping.js",
            "temporal": self.tooling / "texture-temporal.js",
            "page": self.tooling / "texture-preview.html",
        }
        for name, text in (("config", self.config), ("depth", "function beginSceneDepthFrame() {}\n"),
                           ("mapping", "var TexturePilot = {};\n"),
                           ("temporal", "var TextureTemporal = {};\n"), ("page", self.page)):
            self.paths[name].write_text(text, encoding="utf-8")

    def preview(self) -> str:
        return dev.texture_preview_html(self.source, self.tooling).decode("utf-8")

    def test_camera_import_is_exact_and_does_not_start_other_game_state(self) -> None:
        page = self.preview()
        self.assertIn(self.camera, page)
        self.assertIn(self.paths["depth"].read_text(encoding="utf-8"), page)
        self.assertIn(self.paths["mapping"].read_text(encoding="utf-8"), page)
        self.assertIn(self.paths["temporal"].read_text(encoding="utf-8"), page)
        self.assertNotIn("unrelatedBefore", page)
        self.assertNotIn("unrelatedAfter", page)
        self.assertNotIn("@PRODUCTION_", page)

    def test_missing_duplicate_and_unknown_injection_markers_fail_closed(self) -> None:
        markers = ("/* @PRODUCTION_CAMERA@ */", "/* @PRODUCTION_DEPTH@ */",
                   "/* @TEXTURE_MAPPING@ */", "/* @TEXTURE_TEMPORAL@ */")
        invalid_pages = [page for marker in markers
                         for page in (self.page.replace(marker, ""), self.page + marker)]
        invalid_pages.extend((self.page + "/* @UNREVIEWED_IMPORT@ */", self.page + "@UNRESOLVED@"))
        for page in invalid_pages:
            with self.subTest(page=page):
                self.paths["page"].write_text(page, encoding="utf-8")
                with self.assertRaises(dev.SourceError):
                    self.preview()

    def test_camera_anchor_drift_or_ambiguity_does_not_silently_fork_import(self) -> None:
        end = "// Projects a world point to screen coordinates."
        for config in (self.config.replace("function getCam3D() {", "function renamedCamera() {"),
                       self.config.replace(end, "// New boundary"), self.config + self.camera,
                       self.config + end, end + "\n" + self.camera):
            with self.subTest(config=config):
                self.paths["config"].write_text(config, encoding="utf-8")
                with self.assertRaises(dev.SourceError):
                    self.preview()

    def test_injected_code_cannot_close_script_or_reinject_another_fragment(self) -> None:
        for name in ("config", "depth", "mapping", "temporal"):
            original = self.paths[name].read_text(encoding="utf-8")
            for token in ('var bad = "</ScRiPt>";\n', "/* @TEXTURE_MAPPING@ */\n"):
                with self.subTest(fragment=name, token=token):
                    mutated = (original.replace("return {w:", token + "return {w:")
                               if name == "config" else original + token)
                    self.paths[name].write_text(mutated, encoding="utf-8")
                    with self.assertRaises(dev.SourceError):
                        self.preview()
                    self.paths[name].write_text(original, encoding="utf-8")


class RepositorySourceTests(unittest.TestCase):
    def test_preview_rejects_duplicate_raw_string_blocks(self) -> None:
        assembled = dev.assemble()
        duplicated = replace(assembled, header=assembled.header + b'\nR"CSS(duplicate)CSS"\n')
        with self.assertRaises(dev.SourceError):
            dev.preview_html(duplicated)

    def test_checked_in_header_matches_editable_sources(self) -> None:
        self.assertEqual(dev.HEADER.read_bytes(), dev.assemble().header)

    def test_real_function_maps_to_its_editable_source_line(self) -> None:
        assembled = dev.assemble()
        marker = "function getWalkableLayerTopAt("
        header_lines = assembled.header.decode("utf-8").splitlines()
        matches = [i + 1 for i, line in enumerate(header_lines) if line.startswith(marker)]
        self.assertEqual(1, len(matches), "choose a unique real function for the source-map check")
        relative, source_line = dev.source_location(assembled, matches[0])
        source = dev.SOURCE_ROOT / relative
        self.assertTrue(source.is_relative_to(dev.SOURCE_ROOT))
        self.assertEqual(".js", source.suffix)
        source_lines = source.read_text(encoding="utf-8").splitlines()
        self.assertEqual(header_lines[matches[0] - 1], source_lines[source_line - 1])

    def test_preview_preserves_both_actual_script_bodies(self) -> None:
        assembled = dev.assemble()
        preview = dev.preview_html(assembled).decode("utf-8")
        scripts = re.findall(r"(?is)<script\b[^>]*>(.*?)</script\s*>", preview)
        self.assertEqual(3, len(scripts), "preview adds one hardware stub before the two game scripts")
        self.assertEqual(assembled.scripts, tuple(scripts[1:]))
        self.assertIn(assembled.css, preview)
        self.assertIn(assembled.html, preview)

    def test_texture_pilot_uses_real_camera_and_depth_but_does_not_enter_shipping_page(self) -> None:
        assembled = dev.assemble()
        normal = dev.preview_html(assembled).decode("utf-8")
        fixture = dev.texture_preview_html().decode("utf-8")
        config = (dev.SOURCE_ROOT / "src/01-config-state.js").read_text(encoding="utf-8")
        camera = config[config.index("function getCam3D() {"):
                        config.index("// Projects a world point to screen coordinates.")]
        depth = (dev.SOURCE_ROOT / "src/12-scene-depth.js").read_text(encoding="utf-8")
        mapping = (dev.REPO_ROOT / "tools/game/texture-mapping.js").read_text(encoding="utf-8")
        temporal = (dev.REPO_ROOT / "tools/game/texture-temporal.js").read_text(encoding="utf-8")
        self.assertEqual(1, fixture.count(camera), "pilot camera must remain the exact production implementation")
        self.assertEqual(1, fixture.count(depth), "pilot depth buffer must remain the entire unmodified production implementation")
        self.assertEqual(1, fixture.count(mapping))
        self.assertEqual(1, fixture.count(temporal))
        self.assertNotIn(temporal, normal)
        self.assertNotIn(temporal, assembled.header.decode("utf-8"))
        self.assertIn("TexturePilot", fixture)
        self.assertNotIn("TexturePilot", normal)
        self.assertNotIn("TexturePilot", assembled.header.decode("utf-8"))
        self.assertNotIn(assembled.scripts[1], fixture, "standalone materials must not bootstrap gameplay")
        self.assertIsNone(re.search(r"(?i)<script\b[^>]*\bsrc\s*=", fixture))
        self.assertIsNone(re.search(r"@[A-Za-z_][A-Za-z_0-9]*@", fixture))
        scripts = re.findall(r"(?is)<script\b[^>]*>(.*?)</script\s*>", fixture)
        self.assertTrue(scripts, "pilot must contain executable preview code")
        # Parse every script independently, with an empty companion where needed
        # because the existing classic-script syntax gate accepts pairs.
        for index in range(0, len(scripts), 2):
            pair = scripts[index:index + 2]
            if len(pair) == 1:
                pair.append("// no second preview script\n")
            dev.syntax_check(replace(assembled, scripts=tuple(pair)))

    def test_physics_fixture_is_separate_from_shipping_and_normal_preview(self) -> None:
        assembled = dev.assemble()
        normal = dev.preview_html(assembled).decode("utf-8")
        fixture = dev.physics_preview_html(assembled).decode("utf-8")
        marker = 'id="physics-browser-profile"'
        self.assertNotIn(marker, normal)
        self.assertNotIn(marker, assembled.header.decode("utf-8"))
        self.assertEqual(1, fixture.count(marker))
        interpolation_control = 'id="physics-profile-interpolation"'
        self.assertNotIn(interpolation_control, normal)
        self.assertNotIn(interpolation_control, assembled.header.decode("utf-8"))
        self.assertEqual(1, fixture.count(interpolation_control))
        mixed_control = 'id="physics-profile-mixed-npcs"'
        self.assertNotIn(mixed_control, normal)
        self.assertNotIn(mixed_control, assembled.header.decode("utf-8"))
        self.assertEqual(1, fixture.count(mixed_control))
        navigation_control = 'id="physics-profile-navigation"'
        self.assertNotIn(navigation_control, normal)
        self.assertNotIn(navigation_control, assembled.header.decode("utf-8"))
        self.assertEqual(1, fixture.count(navigation_control))
        scripts = re.findall(r"(?is)<script\b[^>]*>(.*?)</script\s*>", fixture)
        self.assertEqual(4, len(scripts), "fixture script must follow both unmodified game scripts")
        self.assertEqual(assembled.scripts, tuple(scripts[1:3]))
        self.assertIn("gameUpdate(FIXED_DT)", scripts[-1])
        self.assertIn("renderFrame()", scripts[-1])
        # The normal shipping syntax gate cannot see these two developer-only
        # scripts. Parse them too so a broken benchmark cannot silently ship as
        # the only way to measure a rendering change.
        dev.syntax_check(replace(assembled, scripts=(scripts[0], scripts[-1])))

    def test_npc_benchmark_rejects_vacuous_or_lost_workloads(self) -> None:
        """Exercise report validity, not fake-clock performance or game behavior."""
        from tools.webui.js_engine import run_js

        fixture = (dev.REPO_ROOT / "tools/game/physics-profile.html").read_text(encoding="utf-8")
        script = re.findall(r"(?is)<script\b[^>]*>(.*?)</script\s*>", fixture)[0]

        def section(start: str, end: str) -> str:
            self.assertEqual(1, script.count(start))
            self.assertEqual(1, script.count(end))
            return script[script.index(start):script.index(end)]

        validation = section("  var npcCounterNames=", "  function interpolationCounters()")
        sampling = section("  function resetFriendlyMotion(job)", "  function prepare(job)")
        npc_core = (dev.SOURCE_ROOT / "src/10-npc-controller.js").read_text(encoding="utf-8")
        self.assertEqual(1, npc_core.count("function npcCancelAction(actor)"))
        self.assertEqual(1, npc_core.count("function npcUpdateAction(actor,"))
        cancel_action = npc_core[npc_core.index("function npcCancelAction(actor)"):
                                npc_core.index("function npcUpdateAction(actor,")]
        cancel_action += npc_core[npc_core.index("function npcForgetTarget(actor)"):
                                 npc_core.index("function npcRememberTarget(actor,")]
        nav_core = (dev.SOURCE_ROOT / "src/10-npc-navigation.js").read_text(encoding="utf-8")
        cancel_action += nav_core[nav_core.index("function npcResetNavigation(actor)"):
                                 nav_core.index("function npcNavWorldCheck()")]
        probe = r"""
var checked=0;
function check(name,okay) { if (!okay) throw Error(name); checked++; }
function fixtureJob() {
  return {mixedNPCs:true,workload:{companions:{min:1,max:1},allies:{min:2,max:2}},
    friendlyActivity:[{kind:'slime',movementTicks:12,attackCommits:3},
      {kind:'soldier-1',movementTicks:8,attackCommits:2},{kind:'soldier-2',movementTicks:7,attackCommits:1}]};
}
var npcStats={decisions:24,candidates:80,sightTests:40,moves:120,actions:10,commits:9,invalidations:0};
var baseline=npcCounters(); npcStats.decisions+=2; npcStats.commits+=1;
check('measured counter delta excludes warmup',npcCounterDelta(baseline).decisions===2&&npcCounterDelta(baseline).commits===1);
check('unmeasured counters are not invented',npcCounterDelta(null)===null);
var work={decisions:24,candidates:80,sightTests:40,moves:120,actions:10,commits:9,invalidations:0};
check('active mixed subjects accepted',npcWorkloadProblem(fixtureJob(),work)===null);
var idle=Object.assign({},work,{commits:0});
check('idle action phase rejected',npcWorkloadProblem(fixtureJob(),idle)==='No measured NPC commits work.');
var reset=Object.assign({},work,{sightTests:-1});
check('counter reset rejected',npcWorkloadProblem(fixtureJob(),reset)==='NPC counters reset or became invalid: sightTests');
var lost=fixtureJob(); lost.workload.allies.min=1;
check('missing soldier rejected',npcWorkloadProblem(lost,work)==='Required one-slime/two-soldier workload was not maintained.');
var blocked=fixtureJob(); blocked.friendlyActivity[1].movementTicks=0;
check('stationary soldier rejected',npcWorkloadProblem(blocked,work)==='No measured movement or committed attack for soldier-1.');
var passive=fixtureJob(); passive.friendlyActivity[0].attackCommits=0;
check('passive slime rejected',npcWorkloadProblem(passive,work)==='No measured movement or committed attack for slime.');
var enemyOnly=fixtureJob(); enemyOnly.mixedNPCs=false; enemyOnly.friendlyActivity=[];
check('enemy-only control does not require followers',npcWorkloadProblem(enemyOnly,work)===null);
var actor={x:3,y:4,feetZ:0,health:100,npc:{commits:5}}, companions=[],fortressAllies=[actor];
var row={kind:'soldier-1',actor:actor,previousX:0,previousY:0,previousCommits:2,movementTicks:0,distanceMoved:0,attackCommits:0};
var job={measuring:true,friendlyActivity:[row]}; sampleFriendlyActivity(job);
check('real displacement and multiple commits counted',row.movementTicks===1&&row.distanceMoved===5&&row.attackCommits===3);
sampleFriendlyActivity(job);
check('idle resample does not manufacture activity',row.movementTicks===1&&row.distanceMoved===5&&row.attackCommits===3);
fortressAllies=[{x:3,y:4,feetZ:0,health:100,npc:{commits:5}}];
var error=''; try { sampleFriendlyActivity(job); } catch(e) { error=e.message; }
check('replacement actor cannot hide lost subject',error==='Mixed NPC subject disappeared or died: soldier-1');
fortressAllies=[actor]; actor.x=0; actor.y=0;
actor.attackState='cooldown'; actor.attackStateUntil=7777; actor.lastAttackMs=100;
actor.npc.target={}; actor.npc.nextThinkAt=777;
var pendingRoute={cancelled:false};actor.npc.navigation={job:pendingRoute};actor.npc.seen={worldX:999,worldY:999};
row.resetPosition={x:72,y:0,feetZ:0}; row.fixtureResets=0; row.fixtureResetDistance=0;
var supportCalls=0,historyResets=0,blockedReset=false;
function spatialQuerySupport(body,x,y) { supportCalls++; return {status:'walk',feetZ:0,supportId:'authored'}; }
function spatialBodyBlocked() { return blockedReset; }
function resetRenderInterpolation(body) { if(body!==actor)throw Error('wrong reset actor'); historyResets++; }
job.mixedNPCs=true; job.ticks=299; resetFriendlyMotion(job);
check('soldier relocation waits for simulation cadence',actor.x===0&&supportCalls===0&&row.fixtureResets===0);
job.ticks=300; resetFriendlyMotion(job);
check('supported soldier relocation is accounted separately',actor.x===72&&actor.y===0&&row.fixtureResets===1&&row.fixtureResetDistance===72&&supportCalls===1&&historyResets===1);
check('relocation preserves cooldown and clears target',actor.attackState==='cooldown'&&actor.attackStateUntil===7777&&actor.lastAttackMs===100&&actor.npc.target===null&&actor.npc.nextThinkAt===0);
check('relocation forgets memory and cancels queued route',actor.npc.seen===null&&actor.npc.navigation===null&&pendingRoute.cancelled);
actor.x=75; sampleFriendlyActivity(job);
check('teleport distance is excluded from locomotion evidence',row.movementTicks===2&&row.distanceMoved===8);
blockedReset=true; job.ticks=600; error='';
try { resetFriendlyMotion(job); } catch(e) { error=e.message; }
check('newly blocked reset cannot move soldier',error==='Soldier reset placement is no longer supported and clear: soldier-1'&&actor.x===75&&row.fixtureResets===1&&historyResets===1);
blockedReset=false; actor.attackState='windup'; actor.attackStateUntil=9000; actor.npc.attackTargetId=5;
resetFriendlyMotion(job);
check('relocation cancels pending windup without fabricating a commit',actor.attackState==='idle'&&actor.npc.attackTargetId===null&&actor.npc.commits===5&&row.attackCommits===3);
__out('NPC_FIXTURE_VALIDITY PASS '+checked);
"""
        sources = [(validation + sampling + cancel_action, "NPC_FIXTURE_VALIDITY PASS 19")]
        mutation = "if (!activity.movementTicks || !activity.attackCommits)"
        self.assertEqual(1, validation.count(mutation))
        sources.append((validation.replace(mutation, "if (false)") + sampling + cancel_action,
                        "Error: stationary soldier rejected"))
        mutation = "if (work[npcCounterNames[j]]===0)"
        self.assertEqual(1, validation.count(mutation))
        sources.append((validation.replace(mutation, "if (false)") + sampling + cancel_action,
                        "Error: idle action phase rejected"))
        mutation = "row.previousX=actor.x; row.previousY=actor.y;"
        self.assertEqual(2, sampling.count(mutation))
        sources.append((validation + sampling.replace(mutation, "/* omit relocation origin reset */", 1) + cancel_action,
                        "Error: teleport distance is excluded from locomotion evidence"))
        mutation = "npcForgetTarget(actor);"
        self.assertEqual(1, sampling.count(mutation))
        sources.append((validation + sampling.replace(mutation, "actor.npc.target=null; actor.npc.nextThinkAt=0;") + cancel_action,
                        "Error: relocation forgets memory and cancels queued route"))
        with tempfile.TemporaryDirectory(prefix="hw1-npc-fixture-") as directory:
            for index, (source, expected) in enumerate(sources):
                with self.subTest(variant=index):
                    path = Path(directory) / f"validity-{index}.js"
                    path.write_text(source + probe, encoding="utf-8")
                    result = run_js(path)
                    output = result.stdout + result.stderr
                    self.assertIn(expected, output)
                    if index:
                        self.assertNotIn("NPC_FIXTURE_VALIDITY PASS", output)

    def test_navigation_profile_rejects_vacuous_crossings_and_overbudget_ticks(self) -> None:
        """Report eligibility is distinct from navigation correctness and timings."""
        from tools.webui.js_engine import run_js

        fixture = (dev.REPO_ROOT / "tools/game/physics-profile.html").read_text(encoding="utf-8")
        start, end = "  var navigationCounterNames=", "  function interpolationCounters()"
        self.assertEqual(1, fixture.count(start))
        self.assertEqual(1, fixture.count(end))
        validation = fixture[fixture.index(start):fixture.index(end)]
        probe = r"""
var checked=0,NPC_NAV_MAX_EDGES_PER_TICK=48;
function check(name,okay) { if(!okay)throw Error(name); checked++; }
function routeJob() {
  return {navigationWorkload:true,navigationTickSamples:1800,navigationMaxEdges:48,navigationOverlapTicks:0,
    workload:{enemies:{min:20,max:20}},navigationActivity:Array.from({length:20},function(){
      return {movementTicks:1000,distanceMoved:800,crossings:8,completedRoutes:8};})};
}
var npcNavigationStats={requests:70,edges:3000,expanded:450,completed:60,failed:2,deferred:40,invalidations:1,probeSteps:8000};
var before=navigationCounters();npcNavigationStats.edges+=48;npcNavigationStats.completed+=1;
var delta=navigationCounterDelta(before);
check('navigation deltas exclude warmup',delta.edges===48&&delta.completed===1);
check('missing measurement is not a zero-work pass',navigationCounterDelta(null)===null);
var work=navigationCounters(),job=routeJob();
check('complete authored workload accepted',navigationWorkloadProblem(job,work)===null);
job.navigationMaxEdges=49;
check('per-tick budget excess rejected',navigationWorkloadProblem(job,work)==='Navigation per-tick budget evidence is missing or exceeded.');
job=routeJob();job.navigationActivity[19].crossings=0;
check('planned but untraversed path rejected',navigationWorkloadProblem(job,work)==='Missing measured movement, detour crossing or completed route for navigator-19.');
job=routeJob();job.navigationActivity[3].completedRoutes=0;
check('movement without a completed route rejected',navigationWorkloadProblem(job,work)==='Missing measured movement, detour crossing or completed route for navigator-3.');
job=routeJob();job.navigationOverlapTicks=1;
check('wall penetration invalidates workload',navigationWorkloadProblem(job,work)==='Authored navigation body overlapped a wall.');
job=routeJob();job.workload.enemies.min=19;
check('lost navigator invalidates workload',navigationWorkloadProblem(job,work)==='Required twenty-actor navigation workload was not maintained.');
job=routeJob();
check('zero completed searches rejected',navigationWorkloadProblem(job,Object.assign({},work,{completed:0}))==='Authored navigation did not perform measured successful route work.');
check('navigation reset rejected',navigationWorkloadProblem(job,Object.assign({},work,{edges:-1}))==='Navigation counters reset or became invalid: edges');
job.navigationWorkload=false;job.navigationActivity=[];
check('cave fixture does not manufacture a route claim',navigationWorkloadProblem(job,Object.assign({},work,{edges:0,completed:0}))===null);
__out('NAV_PROFILE_VALIDITY PASS '+checked);
"""
        variants = [(validation, "NAV_PROFILE_VALIDITY PASS 11")]
        for before, after, expected in (
            ("job.navigationMaxEdges>NPC_NAV_MAX_EDGES_PER_TICK", "false", "per-tick budget excess rejected"),
            ("row.crossings>0", "true", "planned but untraversed path rejected"),
            ("if (job.navigationOverlapTicks)", "if (false)", "wall penetration invalidates workload"),
        ):
            self.assertEqual(1, validation.count(before))
            variants.append((validation.replace(before, after), "Error: " + expected))
        with tempfile.TemporaryDirectory(prefix="hw1-nav-profile-validity-") as directory:
            for index, (source, expected) in enumerate(variants):
                path = Path(directory) / f"validity-{index}.js"
                path.write_text(source + probe, encoding="utf-8")
                result = run_js(path)
                output = result.stdout + result.stderr
                self.assertIn(expected, output)
                if index:
                    self.assertNotIn("NAV_PROFILE_VALIDITY PASS", output)

    def test_authored_navigation_profile_runs_real_patrols_and_detours(self) -> None:
        """Hosted Canvas validates subjects/geometry, never browser frame time."""
        from tools.webui.js_engine import run_js

        source = r"""
var printResult=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out;
var host=slurp('tools/game/tests/cave_occlusion_integration.js');
var boundary=host.indexOf('  function check(name, okay) {');
if(boundary<0)throw Error('SETUP profile browser host boundary missing');
(0,eval)(host.slice(0,boundary)+'G.__profileErrors=errors; }());');
var fragment=slurp('tools/game/physics-profile.html');
var script=fragment.match(/<script>([\s\S]*?)<\/script>/)[1];
var stop=script.indexOf("  runButton.addEventListener('click'");
if(stop<0)throw Error('SETUP profile export boundary missing');
(0,eval)(script.slice(0,stop)+
  'window.__routeProfile={prepare:prepare,tick:fixtureTick,sample:sampleNavigationActivity,'+
  'counters:navigationCounters,delta:navigationCounterDelta,problem:navigationWorkloadProblem}; }());');
var checkCount=0;
function check(name,okay,detail){if(!okay)throw Error(name+' '+JSON.stringify(detail));checkCount++;}
['2d','3d'].forEach(function(view){
  var job={view:view,navigationWorkload:true,mixedNPCs:false,interpolation:true,detailedCounters:false,stageProfiling:false,
    errorBaseline:Object.assign({},_ptErrors),errors:[],ticks:0,measuring:false,workload:{},friendlyActivity:[],
    navigationActivity:[],navigationMaxEdges:0,navigationTickSamples:0,navigationOverlapTicks:0,playerPinResetDistance:0};
  __routeProfile.prepare(job);
  check(view+' authored fixture has real blocked patrol legs',enemies.length===20&&walls.length===20&&floorMesh===null&&ENDLESS_MODE===false);
  var before;
  for(var tick=0;tick<2100;tick++){
    if(tick===300){job.measuring=true;before=__routeProfile.counters();}
    __routeProfile.tick(job);
    var edges=npcNavigationStats.edges;
    advanceGameClock(1/60);gameUpdate(1/60);
    __routeProfile.sample(job,edges);
    if(tick%300===0)renderFrame();
  }
  var work=__routeProfile.delta(before),problem=__routeProfile.problem(job,work);
  check(view+' all20 actors perform measured route traversal',problem===null,{problem:problem,work:work,
    actors:job.navigationActivity.map(function(r){return [r.crossings,r.completedRoutes,r.distanceMoved];})});
  check(view+' global route budget exercised without body overlap',job.navigationMaxEdges===48&&job.navigationTickSamples===1800&&job.navigationOverlapTicks===0);
  check(view+' fixture produces no swallowed update/render error',__profileErrors.length===0&&Object.keys(_ptErrors).every(function(k){return _ptErrors[k]===(job.errorBaseline[k]||0);}),__profileErrors);
});
printResult('NAV_PROFILE_REAL_WORKLOAD PASS '+checkCount);
"""
        with tempfile.TemporaryDirectory(prefix="hw1-nav-profile-scene-") as directory:
            path = Path(directory) / "authored-scene.js"
            path.write_text(source, encoding="utf-8")
            result = run_js(path, timeout=90)
            output = result.stdout + result.stderr
            self.assertIn("NAV_PROFILE_REAL_WORKLOAD PASS 8", output)
            self.assertNotIn("Error:", output)

    def test_preview_keeps_the_games_original_header_line_numbers(self) -> None:
        assembled = dev.assemble()
        header = assembled.header.decode("utf-8")
        preview = dev.preview_html(assembled).decode("utf-8")
        header_lines = header.splitlines()
        preview_lines = preview.splitlines()
        for script in assembled.scripts:
            self.assertEqual(header[:header.index(script)].count("\n"),
                             preview[:preview.index(script)].count("\n"))
        function_line = next(i for i, line in enumerate(header_lines)
                             if line.startswith("function getWalkableLayerTopAt("))
        self.assertEqual(header_lines[function_line], preview_lines[function_line])

    def test_preview_loads_no_external_scripts_or_assets(self) -> None:
        preview = dev.preview_html(dev.assemble()).decode("utf-8")
        self.assertIsNone(re.search(r"(?i)<script\b[^>]*\bsrc\s*=", preview))
        self.assertIsNone(re.search(r"(?i)<link\b", preview))
        self.assertIsNone(re.search(r"(?i)@import\b", preview))
        self.assertIsNone(re.search(r"(?i)\b(?:https?|wss?|ftp)://", preview))
        styles = re.findall(r"(?is)<style\b[^>]*>(.*?)</style>", preview)
        urls = re.findall(r"(?i)url\(\s*['\"]?([^'\")]*)", "\n".join(styles))
        self.assertEqual([], [url for url in urls if url and not url.startswith("data:")])


if __name__ == "__main__":
    unittest.main()
