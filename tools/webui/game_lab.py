#!/usr/bin/env python3
"""game_lab -- run the Endless-crawler test harnesses against the shipping game.

The game in components/hardwareone/WebPage_Games.h is ~1 MB of JavaScript inside
one C++ raw string. This module extracts it, pads it so that line N of the
extracted text IS line N of the header (so every stack trace and every line
reference in a check means the same thing in both), hands it to a harness in
tools/webui/harness/game_*_harness.js on whatever JS engine is present, and
parses the harness's verdict lines.

Two ways in:

  unittest (what the repo-wide sweep runs; quick, one seed per suite):
      python3 -m unittest discover -s tools/webui/tests -t . -p 'test_game*.py'

  by hand, with seed sweeps and a readable report:
      python3 -m tools.webui.game_lab                     # every suite, default seeds
      python3 -m tools.webui.game_lab caves physics       # named suites only
      python3 -m tools.webui.game_lab --seeds 12345,1,777,424242 --json out.json
      python3 -m tools.webui.game_lab --list

Harness protocol (same as every harness in this directory, plus two extras):
      PASS <check id>   [detail]
      FAIL <check id>   [detail]
      METRIC <id> <json value> [unit]     measured numbers; never a verdict
      NOTE <text>                         context for a human
      HARNESS_RESULT PASS | HARNESS_RESULT FAIL <n>

A FAIL here is not automatically a test failure: most of these checks were
written from an audit and encode how the game SHOULD behave, so on today's code
many of them fail on purpose. tools/webui/tests/test_game_*.py hold the list of
known failures (KNOWN_BUGS) and turn "a known bug is still there" into an
expected failure and "a known bug went away" into a loud unexpected success, so
the list is kept honest in both directions.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import tempfile
import time
from dataclasses import dataclass, field

from tools.webui import extract_js
from tools.webui.js_engine import JS_ENGINE, run_js

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
PAGE = REPO_ROOT / "components" / "hardwareone" / "WebPage_Games.h"
HARNESS_DIR = REPO_ROOT / "tools" / "webui" / "harness"

_LINE = re.compile(r"^(PASS|FAIL) (.+?)(?:   \[(.*)\])?$")
_METRIC = re.compile(r"^METRIC (\S+) (.+?)(?: ([A-Za-z%/_]+))?$")


class GameLabError(Exception):
    """Extraction or harness protocol failure -- never a silent empty result."""


def game_js(page: pathlib.Path = PAGE) -> str:
    """The game's JavaScript, padded so extracted line N == header line N.

    extract_js.page_js returns the text plus a map of (extracted line, source
    line) anchors. For this page the whole game is one R"JS( block, so the map
    must be a single constant offset; anything else means the page changed
    shape and padding would silently misnumber every line, so refuse.
    """
    text, line_map = extract_js.page_js(page, r"^JS$")
    offsets = {src - out for out, src in line_map}
    if len(offsets) != 1:
        raise GameLabError(
            f"{page.name}: extracted JS maps to the header with more than one "
            f"offset {sorted(offsets)} -- line padding would misnumber lines")
    offset = offsets.pop()
    if offset < 0:
        raise GameLabError(f"{page.name}: negative line offset {offset}")
    if "function resetEndlessMode" not in text or "function assembleWindow" not in text:
        raise GameLabError(f"{page.name}: extracted JS does not look like the game")
    return "\n" * offset + text


@dataclass
class Check:
    id: str
    ok: bool
    detail: str = ""


@dataclass
class HarnessRun:
    harness: str
    args: list[str]
    returncode: int
    seconds: float
    checks: list[Check] = field(default_factory=list)
    metrics: dict[str, object] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)
    verdicts: list[str] = field(default_factory=list)
    stdout: str = ""
    stderr: str = ""

    @property
    def verdict(self) -> str | None:
        return self.verdicts[0] if len(self.verdicts) == 1 else None

    def by_id(self) -> dict[str, Check]:
        out: dict[str, Check] = {}
        for c in self.checks:
            if c.id in out:
                raise GameLabError(f"{self.harness}: duplicate check id {c.id!r}")
            out[c.id] = c
        return out


def parse(harness: str, args: list[str], proc, seconds: float) -> HarnessRun:
    run = HarnessRun(harness, args, proc.returncode, seconds,
                     stdout=proc.stdout, stderr=proc.stderr)
    for line in proc.stdout.splitlines():
        if line.startswith("HARNESS_RESULT "):
            run.verdicts.append(line)
            continue
        m = _LINE.match(line)
        if m:
            run.checks.append(Check(m.group(2), m.group(1) == "PASS", m.group(3) or ""))
            continue
        m = _METRIC.match(line)
        if m:
            try:
                run.metrics[m.group(1)] = json.loads(m.group(2))
            except ValueError:
                run.metrics[m.group(1)] = m.group(2)
            continue
        if line.startswith("NOTE "):
            run.notes.append(line[5:])
    return run


_JS_CACHE: dict[str, pathlib.Path] = {}
_TMP: tempfile.TemporaryDirectory | None = None
_TMP_LOCK = __import__("threading").Lock()


def extracted_path(page: pathlib.Path = PAGE, text: str | None = None) -> pathlib.Path:
    """Write the (optionally mutated) padded game JS to a temp file, once.

    Thread-safe, and the file name is the content hash. Both matter: probe
    runs call this from worker threads, and an earlier version that created the
    temp dir lazily without a lock and numbered files by cache size let two
    threads each create a directory (the loser's was garbage-collected, deleting
    its file mid-run) or write two different mutations to the same name (so one
    probe silently ran another probe's code).
    """
    global _TMP
    import hashlib
    body = text if text is not None else game_js(page)
    key = hashlib.sha256(body.encode("utf-8")).hexdigest()[:20]
    with _TMP_LOCK:
        if _TMP is None:
            _TMP = tempfile.TemporaryDirectory(prefix="hw1_game_lab_")
        if key not in _JS_CACHE:
            path = pathlib.Path(_TMP.name) / f"game_{key}.js"
            path.write_text(body, encoding="utf-8")
            _JS_CACHE[key] = path
        return _JS_CACHE[key]


def run_harness(name: str, args: list[str] | None = None, *, js_text: str | None = None,
                timeout: int = 600) -> HarnessRun:
    """Run tools/webui/harness/game_<name>_harness.js; args follow the game path."""
    harness = HARNESS_DIR / f"game_{name}_harness.js"
    if not harness.exists():
        raise GameLabError(f"no harness {harness.relative_to(REPO_ROOT)}")
    game = extracted_path(PAGE, js_text)
    argv = [str(game), *(args or [])]
    t0 = time.monotonic()
    proc = run_js(harness, argv, timeout=timeout)
    return parse(name, argv, proc, time.monotonic() - t0)


# ── concurrency ───────────────────────────────────────────────────────────────
# Each harness is its own engine process (~1-25 s), and the suites are
# independent, so running them one after another wastes most of the machine.
# unittest itself is serial; instead the FIRST game suite to set up submits
# every default-argument suite to a shared pool, and later suites collect their
# already-running result. Pass/fail never depends on wall-clock time (checks use
# counts; *_ms METRICs are informational), so running side by side is safe.
#   HW1_GAME_JOBS=N      worker count (default: max(1, CPUs // 4); 1 = serial)
#   HW1_GAME_PREFETCH=1  opt in to starting every default suite in advance
import os as _os
import threading as _threading
from concurrent.futures import Future, ThreadPoolExecutor

_POOL: ThreadPoolExecutor | None = None
_FUTURES: dict[tuple, Future] = {}
_LOCK = _threading.Lock()
_PREFETCHED = False


def _jobs() -> int:
    try:
        return max(1, int(_os.environ.get("HW1_GAME_JOBS", "")))
    except ValueError:
        return max(1, (_os.cpu_count() or 4) // 4)


def submit(name: str, args: list[str] | None = None, *, js_text: str | None = None,
           timeout: int = 900) -> Future:
    """run_harness in the shared pool; identical requests share one run."""
    global _POOL
    game = extracted_path(PAGE, js_text)          # write the file on this thread
    key = (name, tuple(args or ()), str(game))
    with _LOCK:
        if key not in _FUTURES:
            if _POOL is None:
                _POOL = ThreadPoolExecutor(max_workers=_jobs(), thread_name_prefix="game_lab")
            _FUTURES[key] = _POOL.submit(run_harness, name, args, js_text=js_text, timeout=timeout)
        return _FUTURES[key]


def prefetch_default_suites() -> None:
    """Start every suite's default run once, so unittest's serial setUpClass calls overlap."""
    global _PREFETCHED
    if _PREFETCHED or _jobs() == 1 or _os.environ.get("HW1_GAME_PREFETCH") != "1":
        return
    _PREFETCHED = True
    for name in suites():
        submit(name)


def suite_testcase(suite: str, known_bugs: dict[str, str], *, args: list[str] | None = None,
                   min_checks: int = 1):
    """Build the unittest.TestCase for one game harness.

    `known_bugs` maps check id -> why it fails today (an audit reference). The
    rules, each its own test so a report says exactly which one broke:

      - the harness ran to one HARNESS_RESULT line and no scenario crashed;
      - every FAIL is listed in known_bugs      (a NEW failure is a regression);
      - every listed id still FAILs              (a PASS means someone fixed it --
                                                  delete the entry, keep the check);
      - every listed id still exists             (a renamed check would otherwise
                                                  turn its entry into dead weight).
    """
    import unittest

    @unittest.skipUnless(JS_ENGINE, "a JavaScript engine (node/deno/bun/qjs/jsc/osascript) is required")
    class GameSuite(unittest.TestCase):
        maxDiff = None

        @classmethod
        def setUpClass(cls) -> None:
            if args is None:
                prefetch_default_suites()
            cls.run_ = submit(suite, args).result()

        def _report(self) -> str:
            r = self.run_
            tail = "\n".join((r.stderr or "").strip().splitlines()[-20:])
            return f"\n--- stdout tail ---\n{r.stdout[-3000:]}\n--- stderr tail ---\n{tail}"

        def test_harness_completed(self) -> None:
            r = self.run_
            self.assertEqual(1, len(r.verdicts), f"expected exactly one HARNESS_RESULT line{self._report()}")
            crashed = [c.id for c in r.checks if c.id.endswith("scenario ran to completion") and not c.ok]
            self.assertEqual([], crashed, f"scenario crashed{self._report()}")
            self.assertGreaterEqual(len(r.checks), min_checks, f"too few checks ran{self._report()}")

        def test_no_unexpected_failures(self) -> None:
            new = [f"{c.id}\n      {c.detail}" for c in self.run_.checks
                   if not c.ok and c.id not in known_bugs]
            self.assertEqual([], new, "checks FAIL that are not in KNOWN_BUGS (a regression, "
                             "or a new check that needs triage):\n  " + "\n  ".join(new))

        def test_known_bugs_fail_for_the_documented_reason(self) -> None:
            # A known bug that starts failing for another reason -- a precondition,
            # a crashed scenario, a different mechanism -- must not stay green.
            # Entries may be "reason" or ("reason", r"detail regex").
            import re as _re
            by_id = self.run_.by_id()
            wrong = []
            for k, v in known_bugs.items():
                c = by_id.get(k)
                if c is None or c.ok:
                    continue            # covered by the two tests below
                if "PRECONDITION" in c.detail:
                    wrong.append(f"{k}\n      fails on a PRECONDITION, not the bug: {c.detail[:300]}")
                elif isinstance(v, tuple) and len(v) > 1 and not _re.search(v[1], c.detail):
                    wrong.append(f"{k}\n      detail does not match {v[1]!r}: {c.detail[:300]}")
            self.assertEqual([], wrong, "KNOWN_BUGS failing for an undocumented reason:\n  " + "\n  ".join(wrong))

        def test_known_bugs_still_fail(self) -> None:
            by_id = self.run_.by_id()
            fixed = [f"{k}  ({v})" for k, v in known_bugs.items() if k in by_id and by_id[k].ok]
            self.assertEqual([], fixed, "these KNOWN_BUGS now PASS -- if that is a real fix, "
                             "delete their KNOWN_BUGS entries:\n  " + "\n  ".join(fixed))

        def test_known_bug_ids_exist(self) -> None:
            ids = {c.id for c in self.run_.checks}
            missing = [k for k in known_bugs if k not in ids]
            self.assertEqual([], missing, "KNOWN_BUGS names checks the harness no longer emits "
                             "(renamed or removed?):\n  " + "\n  ".join(missing))

    GameSuite.__name__ = f"Game_{suite}_Suite"
    GameSuite.__qualname__ = GameSuite.__name__
    return GameSuite


def apply_probe(base: str, anchor, replacement) -> tuple[str, list[str]]:
    """Apply one probe to the game text. Returns (mutated, problems).

    `anchor` is a string (with `replacement`), or a list of (anchor, replacement)
    pairs applied in order. Each anchor must occur exactly once in the text as it
    stands when that pair is applied; otherwise it is reported, not applied.
    """
    pairs = anchor if isinstance(anchor, (list, tuple)) else [(anchor, replacement)]
    text, bad = base, []
    for a, r in pairs:
        n = text.count(a)
        if n != 1:
            bad.append(f"anchor occurs {n} times: {a[:80]!r}")
            continue
        text = text.replace(a, r)
    return text, bad


def probe_testcase(suite: str, probes: list[tuple[str, str, str, dict[str, str]]], *,
                   args: list[str] | None = None):
    """Mutation meta-test for one game harness. OPT-IN: set HW1_GAME_PROBES=1.

    A check that has never been seen to change its answer proves nothing (see
    test_harness_detects_regressions.py). Each probe edits a COPY of the game
    JS in a temp dir -- never the header -- and states which checks must flip:

        (description, anchor, replacement, {check_id: "PASS" | "FAIL"})
        (description, [(anchor, replacement), ...], None, {check_id: ...})   # multi-site


      - a FIX probe removes the cause of a known bug; its check must go PASS
        (proves the check fails for the reason the audit gave, not another);
      - a BREAK probe injects a bug; a passing check must go FAIL
        (proves the check is not vacuous).

    `anchor` must occur exactly once in the extracted game JS, so a page edit
    that moves the code fails loudly instead of silently mutating nothing.
    Opt-in because each probe is one more full harness run.
    """
    import os
    import unittest

    enabled = os.environ.get("HW1_GAME_PROBES") == "1"

    @unittest.skipUnless(JS_ENGINE, "a JavaScript engine is required")
    @unittest.skipUnless(enabled, "mutation probes are opt-in: HW1_GAME_PROBES=1")
    class GameProbes(unittest.TestCase):
        maxDiff = None

        @classmethod
        def setUpClass(cls) -> None:
            # Submit every probe of this suite at once; each test collects its own.
            base = game_js()
            cls.futures = {}
            for i, (_d, anchor, replacement, _e) in enumerate(probes):
                mutated, _bad = apply_probe(base, anchor, replacement)
                if not _bad:
                    cls.futures[i] = submit(suite, args, js_text=mutated)

    def make(i, desc, anchor, replacement, expect):
        def test(self) -> None:
            _mutated, bad = apply_probe(game_js(), anchor, replacement)
            self.assertEqual([], bad, "every probe anchor must occur exactly once in the extracted game JS")
            run = type(self).futures[i].result()
            self.assertEqual(1, len(run.verdicts), f"harness did not finish under probe\n{run.stdout[-2000:]}\n{run.stderr[-1500:]}")
            crashed = [c.id for c in run.checks if not c.ok and c.id.endswith("scenario ran to completion")]
            self.assertEqual([], crashed, "a crashed scenario is not evidence that the intended defect was detected")
            by_id = run.by_id()
            wrong = []
            for cid, want in expect.items():
                got = ("PASS" if by_id[cid].ok else "FAIL") if cid in by_id else "MISSING"
                if got != want:
                    wrong.append(f"{cid}: expected {want}, got {got}" + (f"  [{by_id[cid].detail}]" if cid in by_id else ""))
                elif want == "FAIL" and "PRECONDITION" in by_id[cid].detail.upper():
                    wrong.append(f"{cid}: setup failed instead of detecting the intended defect  [{by_id[cid].detail}]")
            self.assertEqual([], wrong, f"probe '{desc}' did not flip the checks it should:\n  " + "\n  ".join(wrong))
        test.__name__ = f"test_probe_{i:02d}"
        test.__doc__ = desc
        return test

    for i, (desc, anchor, replacement, expect) in enumerate(probes):
        setattr(GameProbes, f"test_probe_{i:02d}", make(i, desc, anchor, replacement, expect))
    GameProbes.__name__ = f"Game_{suite}_Probes"
    GameProbes.__qualname__ = GameProbes.__name__
    return GameProbes


def suites() -> list[str]:
    return sorted(p.name[len("game_"):-len("_harness.js")]
                  for p in HARNESS_DIR.glob("game_*_harness.js"))


def _main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="python3 -m tools.webui.game_lab",
                                 description=__doc__.split("\n\n")[0])
    ap.add_argument("suite", nargs="*", help="suite names (default: all)")
    ap.add_argument("--seeds", help="Cave Test world seeds (comma-separated), passed to every suite")
    ap.add_argument("--endless-seeds", help="normal Endless world seeds (comma-separated), passed to every suite")
    ap.add_argument("--json", help="write the full result set here")
    ap.add_argument("--list", action="store_true", help="list suites and exit")
    ap.add_argument("--verbose", "-v", action="store_true", help="print NOTE lines and metrics")
    ns = ap.parse_args(argv)
    if ns.list:
        print("\n".join(suites()))
        return 0
    if JS_ENGINE is None:
        print("no JavaScript engine found (node, deno, bun, qjs, jsc, osascript)", file=sys.stderr)
        return 2
    wanted = ns.suite or suites()
    extra = (["--seeds", ns.seeds] if ns.seeds else []) + \
            (["--endless-seeds", ns.endless_seeds] if ns.endless_seeds else [])
    print(f"engine: {JS_ENGINE[0]}   page: {PAGE.relative_to(REPO_ROOT)}")
    report, worst = {}, 0
    for name in wanted:
        run = run_harness(name, extra)
        fails = [c for c in run.checks if not c.ok]
        status = ("OK  " if run.verdict == "HARNESS_RESULT PASS"
                  else "FAIL" if run.verdict else "BROKEN")
        print(f"\n== {name}: {status}  {len(run.checks) - len(fails)}/{len(run.checks)} checks pass"
              f"  ({run.seconds:.1f}s)")
        if run.verdict is None:
            worst = max(worst, 2)
            print(f"   no single HARNESS_RESULT line (rc={run.returncode}); stderr tail:")
            print("   " + "\n   ".join((run.stderr or run.stdout).strip().splitlines()[-15:]))
        for c in run.checks:
            if not c.ok or ns.verbose:
                print(f"   {'PASS' if c.ok else 'FAIL'} {c.id}" + (f"\n        {c.detail}" if c.detail else ""))
        if ns.verbose:
            for k, v in run.metrics.items():
                print(f"   METRIC {k} = {v}")
            for n in run.notes:
                print(f"   NOTE {n}")
        if fails:
            worst = max(worst, 1)
        report[name] = {"verdict": run.verdict, "seconds": round(run.seconds, 2),
                        "checks": [c.__dict__ for c in run.checks],
                        "metrics": run.metrics, "notes": run.notes}
    if ns.json:
        pathlib.Path(ns.json).write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"\nwrote {ns.json}")
    return worst


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
