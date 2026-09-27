#!/usr/bin/env python3
"""Cross-suite probe matrix: what does each probe do to EVERY suite?

A FIX probe is validated in its own suite (probe_testcase): the check it
targets flips to PASS. That says nothing about the other suites, and the
audit review measured exactly that gap: physics' FIX for the floor-picker
sentinel (D11) also turned caves_transition's "walk-in: the player never sinks
more than a step height below every floor" from PASS to FAIL. Probes are the
closest thing this lab has to candidate fixes, so before one is applied to
the game for real, run it here.

    python3 -m tools.webui.game_probe_matrix                  # FIX probes x every suite
    python3 -m tools.webui.game_probe_matrix --kind all       # BREAK probes too
    python3 -m tools.webui.game_probe_matrix --probes physics --against caves_transition
    python3 -m tools.webui.game_probe_matrix --json matrix.json

For each probe it reports, per suite, the checks whose verdict differs from
the unmutated baseline: the flips the probe declared (expected) and every
other flip (collateral). A collateral PASS->FAIL anywhere is a regression the
candidate fix would cause. Opt-in and slow: one full harness run per
(probe, suite) pair, spread over the game_lab worker pool (HW1_GAME_JOBS).
"""

from __future__ import annotations

import argparse
import importlib
import json
import re
import sys
import time

from tools.webui import game_lab
from tools.webui.js_engine import JS_ENGINE


def load_probes(suite_names: list[str]) -> list[tuple[str, int, tuple]]:
    out = []
    for s in suite_names:
        try:
            mod = importlib.import_module(f"tools.webui.tests.test_game_{s}")
        except ModuleNotFoundError:
            continue
        for i, probe in enumerate(getattr(mod, "PROBES", [])):
            out.append((s, i, probe))
    return out


def kind_of(probe: tuple) -> str:
    # Probe authors deliberately use NON-FIX for a control that must not be
    # treated as a candidate product fix.  Keep supporting qualified labels
    # such as "UNSAFE FIX" and "N8 ... fix ALONE", but match whole words so
    # FIXTURE is not accepted. BREAK takes precedence when its description also
    # names the fix it is breaking.
    head = probe[0].split(":", 1)[0].strip().upper()
    if re.search(r"\bBREAK\b", head):
        return "BREAK"
    if re.search(r"\bNON-FIX\b", head):
        return "OTHER"
    if re.search(r"\bFIX\b", head):
        return "FIX"
    return "OTHER"


def verdicts(run: game_lab.HarnessRun) -> dict[str, bool]:
    return {c.id: c.ok for c in run.checks}


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="python3 -m tools.webui.game_probe_matrix", description=__doc__.split("\n\n")[0])
    ap.add_argument("--probes", nargs="*", help="suites whose PROBES to run (default: all)")
    ap.add_argument("--against", nargs="*", help="suites to run each probe against (default: all)")
    ap.add_argument("--kind", choices=["fix", "break", "all"], default="fix",
                    help="which probes (by their description prefix); default fix")
    ap.add_argument("--json", help="write the full matrix here")
    ns = ap.parse_args(argv)
    if JS_ENGINE is None:
        print("no JavaScript engine found", file=sys.stderr)
        return 2
    all_suites = [s for s in game_lab.suites() if s != "smoke"]
    against = ns.against or all_suites
    probes = [p for p in load_probes(ns.probes or all_suites)
              if ns.kind == "all" or kind_of(p[2]).lower() == ns.kind]
    base_text = game_lab.game_js()
    t0 = time.monotonic()
    print(f"engine {JS_ENGINE[0]}; {len(probes)} probes x {len(against)} suites = "
          f"{len(probes) * len(against)} runs on {game_lab._jobs()} workers", flush=True)

    baseline = {s: game_lab.submit(s) for s in against}
    jobs = {}
    skipped = []
    for (ps, i, probe) in probes:
        desc, anchor, replacement, expect = probe
        mutated, bad = game_lab.apply_probe(base_text, anchor, replacement)
        if bad:
            skipped.append(f"{ps}#{i} {desc[:70]}: {bad}")
            continue
        for s in against:
            jobs[(ps, i, s)] = (probe, game_lab.submit(s, js_text=mutated))
    base_v = {s: verdicts(f.result()) for s, f in baseline.items()}

    report, regressions = [], 0
    for (ps, i, s), (probe, fut) in sorted(jobs.items(), key=lambda kv: kv[0]):
        run = fut.result()
        desc, _a, _r, expect = probe
        if len(run.verdicts) != 1:
            report.append({"probe": f"{ps}#{i}", "desc": desc, "suite": s, "error": "no verdict",
                           "stderr": run.stderr[-400:]})
            regressions += 1
            continue
        now = verdicts(run)
        flips = []
        for cid, ok in now.items():
            was = base_v[s].get(cid)
            if was is None or was == ok:
                continue
            flips.append({"check": cid, "to": "PASS" if ok else "FAIL",
                          "expected": cid in expect and expect[cid] == ("PASS" if ok else "FAIL")})
        missing = [cid for cid in expect if s == ps and cid not in now]
        collateral_breaks = [f for f in flips if not f["expected"] and f["to"] == "FAIL"]
        regressions += len(collateral_breaks)
        report.append({"probe": f"{ps}#{i}", "kind": kind_of(probe), "desc": desc, "suite": s,
                       "flips": flips, "missing_expected": missing})

    by_probe: dict[str, list] = {}
    for r in report:
        by_probe.setdefault(r["probe"], []).append(r)
    for key, rows in by_probe.items():
        head = rows[0]
        print(f"\n{key} [{head.get('kind', '?')}] {head['desc'][:100]}")
        for r in rows:
            if "error" in r:
                print(f"   {r['suite']}: HARNESS DID NOT FINISH  {r['stderr'][-160:]!r}")
                continue
            for f in r["flips"]:
                tag = "expected " if f["expected"] else ("COLLATERAL REGRESSION " if f["to"] == "FAIL" else "collateral ")
                print(f"   {r['suite']}: {tag}-> {f['to']}  {f['check']}")
    for s in skipped:
        print(f"\nSKIPPED (anchor problem): {s}")
    print(f"\n{len(report)} runs in {time.monotonic() - t0:.0f}s; collateral PASS->FAIL flips: {regressions}")
    if ns.json:
        with open(ns.json, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=1)
        print(f"wrote {ns.json}")
    return 1 if regressions else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
