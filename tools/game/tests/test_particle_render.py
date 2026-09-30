"""Particle render (unified effects S2b): occlusion, tiles clips, batching, state, caps, lighting, presentation, governor, the Effects page and empty stages; S8: the torch glow stage and its frame-loop wiring; S9: the governor's raster input (every primitive category, the input law, the 2D view, the glow cap) and occlusion contracts.

Merge with the 3D integration: the harness's torches are synthetic sprite-era
lights with no model drawn, so it pins wallPropModels off and the corona tests
the light. The base checks pass without the pin (no model writes depth here);
the pin is what keeps --torch-depth-distance failing for its named cause (the
corona at the light's forward depth): with models on the corona re-derives
its depth at the flame point and bypasses the mutated one. The modelled
torch's flame-point corona, with its own forward-depth mutation
(--glow-flame-depth-distance), is covered in wall_decor_driver.js (glow). No
count change."""

from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import re
import unittest

from tools.webui.js_engine import JS_ENGINE, run_js

HARNESS = Path(__file__).with_name("particle_render.js")
PASS_COUNT = 98                       # 64 at S2b; S7 fix: C3 on the shipping rain (2); S8: C6 torch (2), C10 (8); S8 fix: C6 torch (1), C10 (6), C10 frame (1); S9: governor raster (3), occlusion contracts (5); S9 fix: raster categories, input law, 2D pixels and load, glow cap (5), small items footprint-read past the budget (1)
SENTINEL = f"PARTICLE_RENDER_RESULT PASS {PASS_COUNT}"

# Each mutation must fail its named check; setup failures and crashes do not count.
MUTATIONS = {
    "--footprint-open-interval": "the footprint fast path equals the billboard mask",
    "--footprint-drop-bias": "the footprint fast path equals the billboard mask",
    "--tile-min-max-swapped": "tiles never call a footprint with a hidden pixel all visible, or one with a visible pixel hidden",
    "--tile-summary-sampled": "a thin pillar the old sampled rule misses is classified mixed",
    "--skip-depth": "particles behind terrain are not drawn; the same particles in the open are",
    "--combat-before-stalls": "debris behind a stall is hidden and debris in front of it is drawn over it",
    "--segment-endpoints-only": "streaks stop at the occluder edge within one sample spacing (len/(k-1), k <= 9)",
    # S7 fix: the shipping rain's own streak (occlusion segment, 0.028 s).
    "--rain-point-occl": "a shipping rain streak stops at an occluder band within one sample spacing",
    "--streak-short": "the shipping rain streak spans |v| x 0.028 s behind its head",
    "--particle-shadow-blur": "effect layers never blur and restore Canvas state",
    "--leak-composite": "effect layers never blur and restore Canvas state",
    "--bucket-collision": "batches draw each visible particle exactly once",
    "--no-batch": "batches draw each visible particle exactly once",
    "--ignore-mask-budget": "exact-clip cost is bounded per frame",
    "--leak-over-budget": "exact-clip cost is bounded per frame",
    "--corona-ignores-depth": "a glow behind terrain fades by its visible core fraction",
    "--emissive-lit": "lit particles darken at night; emissive ones do not",
    "--no-2d-cull": "the 2D particle stage culls off-screen particles",
    "--per-particle-billboard": "count-based performance gates hold for 2,000 particles",
    "--fx-page-offpanel": "every effects row fits inside the settings panel at 360x240",
    "--toggle-in-tick-only": "a preset switched off while paused disappears on the next frame",
    "--empty-stage-save": "empty fx stages make zero Canvas calls",
    "--render-mutates-pool": "presentation never mutates the pool or depends on frame rate",
    "--governor-scales-spawn": "presentation never mutates the pool or depends on frame rate",
    # S2b review fixes: the tiles clip, caps, lighting, presentation, governor.
    "--tiles-no-merge": "a mixed tiles item's clip grows with its occluder edge, not its area (1920x1080)",
    "--tiles-drop-mixed": "the tiles clip covers exactly the visible pixels of a mixed item",
    "--tiles-ignore-budget": "exact tiles clips spend at most the mask budget; the rest fall back to the grid rule",
    "--tiles-leak-over-budget": "over-budget tiles clip within one grid cell of the exact visible set",
    "--corona-full-radius": "a glow behind terrain fades by its visible core fraction",
    "--segment-const-depth": "streaks stop at the occluder edge within one sample spacing (len/(k-1), k <= 9)",
    "--under-uses-surface": "underground particles take the cave ambient",
    "--no-fog": "distant particles fade with the wall fog and emissive ones brighten at night",
    "--no-night-boost": "distant particles fade with the wall fog and emissive ones brighten at night",
    "--glow-cap-ignored": "the glow, mixed-item and footprint caps hold and are counted when hit",
    "--mixed-cap-ignored": "the glow, mixed-item and footprint caps hold and are counted when hit",
    "--foot-budget-ignored": "the glow, mixed-item and footprint caps hold and are counted when hit",
    "--eye-in-2d-draw": "camera-local particles never draw in the 2D view, whatever their recipe",
    "--thin-ignores-pin": "pinned pools are never thinned; unpinned thinning skips combat and feedback",
    "--thin-every-class": "pinned pools are never thinned; unpinned thinning skips combat and feedback",
    "--governor-counts-legacy": "the governor sinks under fx load, recovers, and ignores legacy stages it cannot thin",
    "--governor-frozen": "the governor sinks under fx load, recovers, and ignores legacy stages it cannot thin",
    # S9: the governor's raster input (1920 x 1080 against 360 x 240).
    "--governor-raster-blind": "the governor thins weather at 1920 x 1080 by its raster and not at 360 x 240, never combat or feedback",
    "--raster-canvas-area": "pinned frames draw at 1 and feed no pixels to the live governor; an idle large canvas is not thinned",
    "--raster-counts-pinned": "pinned frames draw at 1 and feed no pixels to the live governor; an idle large canvas is not thinned",
    # S9 fix: the rest of the raster pricing, the input law, the 2D view and the glow cap.
    "--raster-sprite-uncounted": "the governor is handed the painted area of every primitive category",
    "--raster-sprite-r2": "the governor is handed the painted area of every primitive category",
    "--raster-ring-no-width": "the governor is handed the painted area of every primitive category",
    "--raster-chip-zero": "the governor is handed the painted area of every primitive category",
    "--raster-rect-r2": "the governor is handed the painted area of every primitive category",
    "--raster-disc-linear": "the governor is handed the painted area of every primitive category",
    "--raster-sampled-full-len": "the governor is handed the painted area of every primitive category",
    "--raster-skip-mixed": "the governor is handed the painted area of every primitive category",
    "--raster-skip-overlay": "the governor is handed the painted area of every primitive category",
    "--raster-skip-2d": "a 2D pass hands the governor its painted area; a pinned one hands over nothing",
    "--governor-ignores-2d": "a loaded 2D frame thins its weather and never its combat dots",
    "--governor-input-max": "a governor step takes the JS stage time plus the raster estimate",
    "--governor-input-half": "a governor step takes the JS stage time plus the raster estimate",
    "--glow-cap-not-scaled": "the glow cap follows the governor for every class, combat glows included",
    "--small-foot-budgeted": "items up to 12 px are footprint-read after the 12-24 px budget is spent",
    "--draw-no-backproject": "drawn particles follow the interpolation timeline",
    "--draw-ignores-snap": "a just-bounced particle is drawn at its contact state, never below its support",
    "--scratch-exact-fit": "the pass scratch never grows while the live count rises",
    "--rest-drawn-lifted": "a ground-resting particle is drawn where it rests and depth-tested 0.5 u above it",
    "--2d-reopens-frame": "a 2D pass inside an open 3D frame shares its counters and budgets",
    # S8: the torch glow stage (C10) and C6 re-run with torch glows.
    "--glow-width-radius": "at 16:9 the torch glow radius follows projScale, not the width (capped at 0.6 h)",
    "--torch-stage-always-new": "Legacy mode draws the torch glow stage as drawTorchGlow3D",
    "--torch-keep-first": "the torch glow stage draws the nearest 12 on-screen lights within 400 u",
    "--flicker-index": "torch glow alpha keeps the legacy law with a flicker phase keyed by world position",
    "--flicker-local": "torch glow alpha keeps the legacy law with a flicker phase keyed by world position",
    "--torch-save-always": "the torch glow stage makes no Canvas call with no light on screen",
    # S8 review fixes: corona samples off the frame, the torch cull, forward
    # depth, occlusion before selection, the 10 px floor, the flicker law,
    # the mixed-item cap under tiles, and the frame loop's stage wiring.
    "--corona-offframe-visible": "a hidden torch glow just past the screen edge stays hidden (corona samples judged at the frame's nearest pixel)",
    "--corona-offframe-hidden": "a torch glow centred off screen draws its fringe at full alpha; one covering no pixel is culled",
    "--torch-cull-centre": "a torch glow centred off screen draws its fringe at full alpha; one covering no pixel is culled",
    "--torch-cull-open": "a torch glow centred off screen draws its fringe at full alpha; one covering no pixel is culled",
    "--torch-depth-distance": "wall torches off the screen centre are depth-tested at forward depth, as the legacy clip is",
    "--torch-occlusion-after-selection": "hidden near torches take no slot: the nearest 12 visible glows are drawn",
    "--torch-no-min-radius": "on a small canvas a far torch glow keeps the legacy 10 px radius floor",
    "--flicker-fast": "torch glow alpha keeps the legacy law with a flicker phase keyed by world position",
    "--torch-mixed-cap-ignored": "past the mixed-item cap a torch glow under the tiles override is centre-gated, as particles are",
    "--torch-over-cap-hidden": "past the mixed-item cap a torch glow under the tiles override is centre-gated, as particles are",
    "--torch-stage-bypassed": "the frame loop's torchGlow3D stage draws through drawTorchGlowStage3D (New: the torch sprite; Legacy: the legacy gradient)",
    # S9: occlusion hand mutants no case above detected.
    "--point-up-to-3px": "a dot over 1.5 px behind a 1 px pillar is footprint-tested and drawn",
    "--over-cap-edge-visible": "past the mixed cap an item centred off the frame stays hidden behind the wall",
    "--tile-empty-box-visible": "tiles hide a box with no pixel centre on the frame and draw one with a pixel",
    "--tile-no-bias": "tiles draw a box whose every pixel passes the biased test without a clip",
    "--far-dot-tiles": "a far streak drawn as a dot costs one point read",
}
# Checks a mutation must fail as well as its named one, each with its own
# cause (None: the check name only): the shared corona, tiles clip and pass
# state also serve the torch glow stage (S8).
TORCH_TILES = "torch glows under the tiles override share the frame's mask budget; the rest use the grid rule, all clipped"
ALSO_FAILS = {
    "--corona-ignores-depth": [
        ("a torch glow behind terrain fades by its visible core fraction (corona)", r'"behindWallDraws":1,'),
        ("corona torch glows cost no mask pixel and no clip, and fade by their visible samples", r'"openAlpha":([\d.]+),"alphas":\[\1,'),
        ("a hidden torch glow just past the screen edge stays hidden (corona samples judged at the frame's nearest pixel)", r'"hiddenDrawn":1,'),
    ],
    # Every glow exact: past the budget.
    "--tiles-ignore-budget": [(TORCH_TILES, r'"overBudgetBy":[1-9]')],
    # Over-budget mixed tiles filled whole: 7 px past the wall edge (one grid cell is 4).
    "--tiles-leak-over-budget": [(TORCH_TILES, r'"worstDistance":([5-9]|\d\d),')],
    "--leak-composite": [("the torch glow stage never blurs and restores Canvas state", r'"op":"(source-over|lighter)"')],
    # S9 fix: sprites priced in the 2D pass too, and the input law's frame is a sprite frame.
    "--raster-sprite-uncounted": [
        ("a governor step takes the JS stage time plus the raster estimate", r'"acc":0,'),
        ("a 2D pass hands the governor its painted area; a pinned one hands over nothing", None),
    ],
    "--raster-ring-no-width": [("a 2D pass hands the governor its painted area; a pinned one hands over nothing", None)],
}
# The failure detail must also show the intended cause, not merely the check name.
CAUSES = {
    "--footprint-open-interval": r'"mismatches":[1-9]',
    "--footprint-drop-bias": r'"mismatches":[1-9]',
    "--tile-min-max-swapped": r'"tiles":1,"scan":\{"vis":\d+,"hid":[1-9]',
    "--tile-summary-sampled": r'"tiles":1\}',
    "--skip-depth": r'"walled":\{"drawn":28,',
    "--combat-before-stalls": r'"order":\["fxCombat3D","structures3D"\]',
    "--segment-endpoints-only": r'"segments":\[\[180,210',
    # Tested at its head only, the drop is drawn whole across the band.
    "--rain-point-occl": r'"pieces":\[\[192,96,200,160\]\],"band"',
    # 0.002 s: a 4.6 px streak from the head instead of 64 px.
    "--streak-short": r'"pieces":\[\[199\.\d+,155\.\d+,200,160\]\],"want"',
    "--particle-shadow-blur": r'"blur":1,',
    "--leak-composite": r'"op":"(source-over|lighter)"',
    "--bucket-collision": r'"missing":\["chip',
    "--no-batch": r'"fills":200,',
    "--ignore-mask-budget": r'"maskPx":\d{6,},',
    "--leak-over-budget": r'"unclipped":[1-9]',
    "--corona-ignores-depth": r'"behindWallDraws":[1-9]',
    "--emissive-lit": r'"day":\{"lit":"[^"]+","em":"rgb\(150,255,80\)",[^}]*\},"night":\{"lit":"[^"]+","em":"rgb\((?!150,255,80)',
    "--no-2d-cull": r'"discs":550,',
    "--per-particle-billboard": r'"clipShare":0\.(0[3-9]|[1-9])',
    "--fx-page-offpanel": r'"y":167\.6',
    "--toggle-in-tick-only": r'"drawnOff":12,"poolUnchanged":true',
    "--empty-stage-save": r'"fxCombat3D":\[\["save"\]',
    "--render-mutates-pool": r'"unrendered":\{"hash":"(\w+)","count":\d+,"thinned":0\},"r30":\{"hash":"(?!\1)',
    "--governor-scales-spawn": r'"unrendered":\{"hash":"\w+","count":169,"thinned":0\},"r30":\{"hash":"\w+","count":(?!169)\d+',
    "--tiles-no-merge": r'"edge":"vertical","clips":1,"rects":\d{4,},',
    "--tiles-drop-mixed": r'"leaks":0,"holes":[1-9]',
    "--tiles-ignore-budget": r'"maskPx":\d{6,},"budget":60000',
    "--tiles-leak-over-budget": r'"worstLeakDistance":([5-9]|\d\d),',
    "--corona-full-radius": r'"wallEndsAt":173\.5,"visibleSamples":5,"coreAlpha":0\.71875',
    "--segment-const-depth": r'"receding":true,"segments":\[\[150[\d.]*,150,200[\d.]*,130\]\]',
    "--under-uses-surface": r'"underRatio":1,',
    "--no-fog": r'"day":\{"near":0\.96875,"far":0\.96875,',
    "--no-night-boost": r'"night":\{"half":0\.46875\}',
    "--glow-cap-ignored": r'"glowDraws":300,"glowCapped":0\}',
    "--mixed-cap-ignored": r'"mixedSkipped":0,',
    "--foot-budget-ignored": r'"footprint":\{"footprint":100,',
    "--eye-in-2d-draw": r'"flagged":\{"draws":[1-9]',
    "--thin-ignores-pin": r'"pinned":\{"rows":\[\d+,\d+,\d+,20,20\],"thinned":[1-9]',
    "--thin-every-class": r'"unpinned":\{"rows":\[\d+,\d+,\d+,(1?\d),',
    "--governor-counts-legacy": r'"recovered":1,"legacyOnly":0\.35,',
    "--governor-frozen": r'"law":\{"loaded":1,',
    "--draw-no-backproject": r'"bad":\[\{"alpha":0,',
    "--draw-ignores-snap": r'"drawn":\{"x":[\d.]+,"y":192\.874',
    "--scratch-exact-fit": r'"typedArraysAfterWarmUp":[1-9]',
    "--rest-drawn-lifted": r'"resting":\{"draws":1,"drawn":\[[\d.]+,119\.49',
    "--2d-reopens-frame": r'"after2D":\{"drawn":6,',
    # The legacy width-based radius at 16:9: 153 px at 60 u instead of 129.
    "--glow-width-radius": r'\{"fwd":60,"expected":129,"got":153,',
    "--torch-stage-always-new": r'"stage":\d+,"direct":\d+,"legacyGradients":2,',
    # The first 12 listed (the farthest) drawn: the two nearest are missing.
    "--torch-keep-first": r'"drawn":12,"missing":\[\[\d+,\d+\],\[\d+,\d+\]\]',
    "--torch-save-always": r'"none":\{"calls":2,',
    # A light hidden behind the wall with its samples off the frame drawn.
    "--corona-offframe-visible": r'"legs":\[\{"edge":"left","hiddenDrawn":1,',
    # An open light centred off the frame not drawn.
    "--corona-offframe-hidden": r'"legs":\[\{"edge":"left","hiddenDrawn":0,"hiddenCounted":1,"openDrawn":0,"openCulled":0,',
    "--torch-cull-centre": r'"openDrawn":0,"openCulled":1,',
    "--torch-cull-open": r'"zeroCoverage":\{"culled":0,"draws":[1-9]',
    # Tested at their straight-line distance, the side torches fall behind their own wall.
    "--torch-depth-distance": r'\{"x":20\.5,"dist":[\d.]+,"legacyFills":1,"corona":0,',
    # Six hidden near lights take six of the twelve slots.
    "--torch-occlusion-after-selection": r'"drawn":6,"missingOpen":\[\[',
    "--torch-no-min-radius": r'"legacyR":10,"newR":8,',
    # Ten times the legacy flicker frequency: the legacy terms do not fit.
    "--flicker-fast": r'"fit":\{"a1":[\d.e-]+,"a2":[\d.e-]+,"residual":0\.0[1-9]',
    "--torch-mixed-cap-ignored": r'"drawn":10,"clipped":10,',
    "--torch-over-cap-hidden": r'"drawn":3,"clipped":3,"unclippedOpenCentre":0,',
    # The legacy drawer in New mode: a gradient and no sprite.
    "--torch-stage-bypassed": r'"new":\{"drawImage":0,"gradients":1,',
    # JS time alone at 1080p: the governor stays at 1 and nothing thins.
    "--governor-raster-blind": r'"big":\{"px0":\d+,"input0":[\d.]+,"input":0\.2,"govEnd":1,"lastThinned":0,',
    # Canvas area x JS time: the idle 1080p frame sinks to the floor and thins its motes.
    "--raster-canvas-area": r'"idle":\{"govMin":0\.35,"thinned":[1-9]\d*,',
    # The pinned frames' pixels reach the live governor's first step.
    "--raster-counts-pinned": r'"accMax":[1-9][\d.e+]*,"firstLiveStep":\{"rasterMs":[1-9]',
    # S9 occlusion. The pillar dot judged by its hidden centre pixel.
    "--point-up-to-3px": r'"billboard":2,"drawn":0,"occ":\{"point":1,',
    "--over-cap-edge-visible": r'"leak":\[[\d.]+\],"drawn":257\}',
    "--tile-empty-box-visible": r'\{"edge":0\.2,"drawn":1,"tiles":1,"billboard":0\}',
    "--tile-no-bias": r'"billboard":1,"clips":[1-9]',
    "--far-dot-tiles": r'"point":0,"footprint":0,"tiles":1,',
    # S9 fix. Each mutant's category is off its recorded area (the first wrong one listed).
    "--raster-sprite-uncounted": r'"wrong":\[\{"cat":"sprites","acc":0,"oracle":3636,',
    "--raster-sprite-r2": r'"wrong":\[\{"cat":"sprites","acc":909,"oracle":3636,',
    "--raster-ring-no-width": r'"wrong":\[\{"cat":"rings","acc":267\.\d+,"oracle":1563\.\d+,',
    "--raster-chip-zero": r'"wrong":\[\{"cat":"chips","acc":0,"oracle":202\.\d+,',
    "--raster-rect-r2": r'"wrong":\[\{"cat":"rects","acc":2\.44,"oracle":9\.76,',
    "--raster-disc-linear": r'\{"cat":"discs","acc":43\.98,"oracle":333\.01,',
    # The half-hidden streak priced at its full length.
    "--raster-sampled-full-len": r'"wrong":\[\{"cat":"streaks","acc":5103,"oracle":3667\.78,',
    # The clipped item drawn and counted in the frame, not handed to the governor.
    "--raster-skip-mixed": r'"wrong":\[\{"cat":"clip","acc":0,"oracle":314\.16,"stat":314\.16\}\]',
    "--raster-skip-overlay": r'"wrong":\[\{"cat":"overlay","acc":0,"oracle":11664,"stat":11664\}\]',
    "--raster-skip-2d": r'"live":\{"acc":0,"oracle":225\.\d+,',
    # The 2D frame at 3 ms stays at 1: nothing thinned.
    "--governor-ignores-2d": r'"loaded":\{"ms":3,"governor":1,',
    "--governor-input-max": r'"input":0\.30000001192092896,',
    "--governor-input-half": r'"rasterMs":0\.050904,"input":0\.3254',
    "--glow-cap-not-scaled": r'\{"n":120,"pinned":false,"glowDraws":120,"glowCapped":0,',
    # The ten 8 px dots read on tiles instead.
    "--small-foot-budgeted": r'"withSmall":\{"small":10,"footprint":(\d+),"tiles":(\d+),',
}


def _run(args=()):
    result = run_js(HARNESS, list(args), timeout=120)
    return result.stdout + result.stderr, result.stdout.splitlines()


def _jobs() -> int:
    # dev.py test sets HW1_GAME_JOBS=1: full-game harnesses run one at a time.
    try:
        return max(1, int(os.environ.get("HW1_GAME_JOBS", "1")))
    except ValueError:
        return 1


@unittest.skipIf(JS_ENGINE is None, "a supported JavaScript engine is required")
class ParticleRenderTests(unittest.TestCase):
    def test_render_contracts(self) -> None:
        output, lines = _run()
        self.assertIn(SENTINEL, lines, output)
        self.assertFalse([line for line in lines if line.startswith("SKIP ")], output)
        self.assertEqual(PASS_COUNT, sum(line.startswith("PASS ") for line in lines), output)
        self.assertFalse([line for line in lines if line.startswith("FAIL ")], output)

    def test_mutations_fail_their_named_checks(self) -> None:
        with ThreadPoolExecutor(max_workers=_jobs()) as pool:
            results = dict(zip(MUTATIONS, pool.map(lambda flag: _run([flag]), MUTATIONS)))
        for flag, check in MUTATIONS.items():
            output, lines = results[flag]
            with self.subTest(mutation=flag):
                self.assertNotIn(SENTINEL, lines, output)
                failing = [line for line in lines if line.startswith("FAIL " + check + " ")]
                self.assertTrue(failing, output)
                self.assertTrue(any(line.startswith("PARTICLE_RENDER_RESULT FAIL ") for line in lines), output)
                self.assertNotIn("MUTATION_ANCHOR", output)
                self.assertNotIn("SETUP ", output)
                self.assertNotIn("ran without an exception", output)
                if flag in CAUSES:
                    self.assertRegex(failing[0], CAUSES[flag], output)
                for also, cause in ALSO_FAILS.get(flag, []):
                    also_failing = [line for line in lines if line.startswith("FAIL " + also + " ")]
                    self.assertTrue(also_failing, output)
                    if cause:
                        self.assertRegex(also_failing[0], cause, output)


if __name__ == "__main__":
    unittest.main()
