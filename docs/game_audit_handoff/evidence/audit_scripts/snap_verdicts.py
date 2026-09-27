"""Snapshot every game suite's full check records and non-timing METRICs to JSON.

Usage (repo root):  HW1_GAME_JOBS=2 python3 docs/game_audit_handoff/evidence/audit_scripts/snap_verdicts.py before.json
Diff two snapshots to prove a change to shared code (the env, game_lab) changed
no check id/status/detail or deterministic metric. The original session used
this to show the env consolidation patch changed 0 checks in 11 suites.
"""
import sys, os, json, time
sys.path.insert(0, os.getcwd())
from tools.webui import game_lab
t = time.time()
futs = {n: game_lab.submit(n) for n in game_lab.suites()}
out = {}
for n, f in futs.items():
    r = f.result()
    out[n] = {"verdict": r.verdict, "checks": [[c.id, c.ok, c.detail] for c in r.checks],
              "metrics": {
                  k: v for k, v in r.metrics.items()
                  if not (k.endswith('_ms') or '.ms.' in k or k.endswith('.ms'))
              }, "secs": round(r.seconds, 1)}
json.dump(out, open(sys.argv[1], 'w'), indent=1)
print(f"{len(out)} suites in {time.time()-t:.0f}s wall; per-suite secs:", {k: v['secs'] for k, v in out.items()})
print("verdicts:", {k: v['verdict'] for k, v in out.items()})
