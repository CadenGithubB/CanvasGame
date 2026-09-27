"""Re-run every PROBES entry of every game suite and check each flips as declared.

Usage (repo root):  HW1_GAME_JOBS=2 OUT=probes.json python3 docs/game_audit_handoff/evidence/audit_scripts/run_probes.py [suite ...]

Worker count comes from game_lab (HW1_GAME_JOBS; default CPUs-2 capped at 8).
Keep it LOW on a machine you are using: each worker is a CPU-bound JS engine
process. The original session ran this with 8 workers (105 probes in ~4 min).
"""
import sys, importlib, json, time, os
from concurrent.futures import ThreadPoolExecutor, as_completed
sys.path.insert(0, os.getcwd())
from tools.webui import game_lab
base = game_lab.game_js()
suites = sys.argv[1:] or [s for s in game_lab.suites() if s not in ('smoke',)]
jobs = []
for s in suites:
    try: mod = importlib.import_module(f'tools.webui.tests.test_game_{s}')
    except ModuleNotFoundError: continue
    for i, (desc, anchor, repl, expect) in enumerate(getattr(mod, 'PROBES', [])):
        jobs.append((s, i, desc, anchor, repl, expect))
print(f'{len(jobs)} probes across {len(set(j[0] for j in jobs))} suites, {game_lab._jobs()} workers', flush=True)
def run(job):
    s, i, desc, anchor, repl, expect = job
    text, bad = game_lab.apply_probe(base, anchor, repl)
    if bad: return (s, i, desc, 'ANCHOR ' + '; '.join(bad), [])
    r = game_lab.run_harness(s, None, js_text=text, timeout=900)
    if len(r.verdicts) != 1: return (s, i, desc, 'NO-VERDICT rc=%d %s' % (r.returncode, r.stderr[-300:]), [])
    by = {c.id: c for c in r.checks}
    wrong = []
    for cid, want in expect.items():
        got = ('PASS' if by[cid].ok else 'FAIL') if cid in by else 'MISSING'
        if got != want: wrong.append(f'{cid}: want {want} got {got}')
    return (s, i, desc, 'OK' if not wrong else 'WRONG', wrong)
t = time.time(); out = []
with ThreadPoolExecutor(max_workers=game_lab._jobs()) as ex:
    futs = [ex.submit(run, j) for j in jobs]
    for f in as_completed(futs):
        res = f.result(); out.append(res)
        if res[3] != 'OK': print('  !!', res[0], res[1], res[2][:90], res[3], res[4], flush=True)
print(f'done in {time.time()-t:.0f}s')
from collections import Counter
print(Counter((r[0], r[3]) for r in out))
if os.environ.get('OUT'): json.dump(out, open(os.environ['OUT'], 'w'), indent=1)
