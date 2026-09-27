#!/usr/bin/env python3
"""game_page -- the Games page as one standalone HTML file, for REAL-browser checks.

The headless suites (tools/webui/game_lab.py + harness/game_*_harness.js) run the
Endless crawler against a stub canvas: they can count which polygons a draw pass
SUBMITS, but not what ends up on screen. This module builds a page a real
browser can open with no device attached, so the rendered pixels themselves can
be checked:

  - the CSS, HTML and JS raw-string blocks of components/hardwareone/
    WebPage_Games.h, read with extract_js.extract_blocks -- the REAL shipping
    source, never a copy;
  - a stub window.hw whose every call returns a promise that never settles
    (the device API; keyboard/mouse Endless makes no requests, and the page's
    sensor probe at load simply never answers);
  - tools/webui/harness/game_browser_driver.js, injected after the game, which
    defines window.GameVisual (see that file).

LINE NUMBERS: the game's JS starts at the same line of the built page as it
does in WebPage_Games.h (the page before it is padded to fit), so a browser
error "line 7831" is header line 7831 -- the same convention as game_lab.

Usage:
    python3 -m tools.webui.game_page --out <dir> [--autorun] [--seeds 12345,424242]
        writes <dir>/game_visual.html and prints its file:// URL. Without --out
        the page goes to a fresh temp directory. With --autorun the page runs
        GameVisual on load and writes PASS/FAIL lines into its results <pre>
        (#gameVisualResults) and window.__gameVisualResult.

    The same can be asked of any built page with a query string:
        game_visual.html?autorun=1&seeds=12345,777&views=inside_in,arch_in&shots=0

    Mutation probe (tests/test_game_browser.py BROWSER_PROBES): --mutate FILE
    takes a JSON list [[anchor, replacement], ...] and builds the page from an
    in-memory copy of the game JS with those edits applied.

    To grade a browser run against the suite's known bugs, save the results
    text (the page's "save results" link, or the <pre> contents) and run
        HW1_GAME_BROWSER_RESULTS=<file> python3 -m unittest tools.webui.tests.test_game_browser

Nothing here writes into components/ -- build_page refuses an --out inside it.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import tempfile

from tools.webui import extract_js

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
PAGE = REPO_ROOT / "components" / "hardwareone" / "WebPage_Games.h"
DRIVER = REPO_ROOT / "tools" / "webui" / "harness" / "game_browser_driver.js"
PAGE_NAME = "game_visual.html"

# The device API stub. Every property of window.hw is a function returning a
# promise that never settles -- the same contract as _game_env.js's stub, but
# total (a Proxy), so a later hw.* call the stub did not anticipate cannot throw
# "is not a function" in a page that has no device behind it.
HW_STUB = (
    "window.__HW_STUB__ = true; window.hw = new Proxy({}, { get: function (t, k) {"
    " if (k === 'then' || typeof k === 'symbol') return undefined;"
    " if (!(k in t)) t[k] = function () { return new Promise(function () {}); };"
    " return t[k]; } });"
)

# Shell styling the device's page frame normally supplies (WebServer_Utils).
# Cosmetic only: nothing the game or the driver measures reads these.
SHELL_CSS = (
    ":root{--panel-bg:#15191e;--panel-fg:#d8dde3;--border:#3a4450}"
    " body{background:#0c0e11;color:#d8dde3;font:13px system-ui,sans-serif;margin:12px}"
    " .btn{background:#26303a;color:#d8dde3;border:1px solid #3a4450;border-radius:4px;padding:3px 8px;cursor:pointer}"
    " .text-muted{color:#889} #gvBar{padding:6px 8px;margin-bottom:8px;background:#1b2530;border:1px solid #3a4450;border-radius:4px}"
    " #gameVisualResults{white-space:pre-wrap;font:11px monospace;background:#0a0a14;border:1px solid #557;padding:6px;max-height:420px;overflow:auto}"
    " #gameVisualShots figure{display:inline-block;margin:4px;vertical-align:top;font:10px monospace;max-width:740px}"
    " #gameVisualShots img{border:1px solid #334;background:#000;margin-right:2px}"
)

TOOLBAR = (
    "<div id='gvBar'><b>Endless visual checks</b> "
    "<button class='btn' id='gvRun'>Run visual checks</button> "
    "<span id='gvStatus' class='text-muted'>idle -- standalone build of WebPage_Games.h, "
    "window.hw is a stub (no device)</span></div>"
)

RESULTS = (
    "<div id='gameVisualPanel' style='margin-top:10px'>"
    "<h3>Visual check results</h3><pre id='gameVisualResults'>(not run)</pre>"
    "<div id='gameVisualShots'></div></div>"
)


class GamePageError(Exception):
    """The header changed shape, or a build would not be what it claims."""


def _blocks(page: pathlib.Path = PAGE) -> tuple[extract_js.Block, extract_js.Block, extract_js.Block]:
    blocks = extract_js.extract_blocks(page)
    by = {}
    for b in blocks:
        if b.delim in by:
            raise GamePageError(f"{page.name}: more than one R\"{b.delim}( block")
        by[b.delim] = b
    missing = [d for d in ("CSS", "HTML", "JS") if d not in by]
    if missing:
        raise GamePageError(f"{page.name}: missing raw-string block(s) {missing}")
    js = by["JS"]
    if "<script>" not in js.body or "function resetEndlessMode" not in js.body:
        raise GamePageError(f"{page.name}: the R\"JS( block does not look like the game")
    if "id='maze'" not in by["HTML"].body:
        raise GamePageError(f"{page.name}: the R\"HTML( block has no canvas#maze")
    return by["CSS"], by["HTML"], js


def driver_js() -> str:
    text = DRIVER.read_text(encoding="utf-8")
    if "</script" in text.lower():
        raise GamePageError(f"{DRIVER.name} contains '</script' -- it would close its own tag")
    return text


def mutate_js(body: str, mutations: list[tuple[str, str]] | None) -> str:
    """Apply (anchor, replacement) edits to an in-memory copy of the game JS.

    For mutation probes only (see tests/test_game_browser.py BROWSER_PROBES):
    each anchor must occur exactly once, so a page edit that moves the code
    fails loudly instead of silently mutating nothing. The header is never
    touched.
    """
    for anchor, replacement in mutations or []:
        count = body.count(anchor)
        if count != 1:
            raise GamePageError(f"mutation anchor must occur exactly once in the game JS, found {count}: {anchor[:80]!r}")
        body = body.replace(anchor, replacement)
    return body


def page_html(*, autorun: bool = False, seeds: list[int] | None = None,
              mutations: list[tuple[str, str]] | None = None,
              page: pathlib.Path = PAGE) -> str:
    """The standalone page as one string (optionally with a mutated game JS)."""
    css, html, js = _blocks(page)
    js_body = mutate_js(js.body, mutations)
    config = {"autorun": bool(autorun)}
    if seeds:
        config["seeds"] = [int(s) for s in seeds]
    if mutations:
        config["mutated"] = [a[:60] for a, _ in mutations]
    head = [
        "<!DOCTYPE html>",
        "<html lang='en'><head><meta charset='utf-8'><title>Endless visual checks</title>",
        # Header line numbers of the pieces below, for a human reading the file.
        f"<!-- built by tools/webui/game_page.py from {page.relative_to(REPO_ROOT) if page.is_relative_to(REPO_ROOT) else page}:"
        f" CSS from line {css.start_line}, HTML from line {html.start_line}, JS from line {js.start_line}"
        " (page line N == header line N inside the game JS) -->",
        "<style>" + SHELL_CSS + "</style>",
        "<style>" + css.body + "</style>",
        "<script>" + HW_STUB + "</script>",
        "<script>window.__GAME_VISUAL_CONFIG__ = " + json.dumps(config, sort_keys=True).replace("<", "\\u003c") + ";</script>",
        "</head><body>",
        TOOLBAR,
        html.body,
    ]
    prefix = "\n".join(head)
    # The JS block's body opens on header line js.start_line (right after
    # R"JS( ), so body line k is header line js.start_line + k - 1. Start it on
    # page line js.start_line by padding with blank lines.
    want_newlines = js.start_line - 1
    have = prefix.count("\n") + 1          # +1: the newline that ends the prefix
    if have > want_newlines:
        raise GamePageError(
            f"page prefix is {have} lines but the game JS opens on header line {js.start_line}; "
            "line alignment would be lost -- shorten the prefix")
    prefix += "\n" * (want_newlines - have + 1)
    tail = "\n".join([
        "",
        "<script>\n" + driver_js() + "\n</script>",
        RESULTS,
        "</body></html>",
        "",
    ])
    return prefix + js_body + tail


def build_page(out_dir: str | pathlib.Path | None = None, *, autorun: bool = False,
               seeds: list[int] | None = None,
               mutations: list[tuple[str, str]] | None = None) -> pathlib.Path:
    """Write the page into out_dir (a fresh temp dir if None); return its path."""
    if out_dir is None:
        out_dir = tempfile.mkdtemp(prefix="hw1_game_page_")
    out = pathlib.Path(out_dir).resolve()
    comps = (REPO_ROOT / "components").resolve()
    if out == comps or comps in out.parents:
        raise GamePageError(f"refusing to write into {comps}: generated pages never live in components/")
    out.mkdir(parents=True, exist_ok=True)
    path = out / PAGE_NAME
    path.write_text(page_html(autorun=autorun, seeds=seeds, mutations=mutations), encoding="utf-8")
    return path


def _main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="python3 -m tools.webui.game_page",
                                 description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", help="output directory (default: a new temp dir)")
    ap.add_argument("--autorun", action="store_true", help="run the visual checks on page load")
    ap.add_argument("--seeds", help="comma-separated Cave Test seeds (browser-driver default 12345,424242)")
    ap.add_argument("--mutate", metavar="JSON",
                    help="probe build: a JSON file holding [[anchor, replacement], ...] applied to an "
                         "in-memory copy of the game JS (each anchor must occur exactly once)")
    ns = ap.parse_args(argv)
    seeds = [int(s) for s in ns.seeds.split(",") if s.strip()] if ns.seeds else None
    try:
        mutations = None
        if ns.mutate:
            mutations = [(a, r) for a, r in json.loads(pathlib.Path(ns.mutate).read_text(encoding="utf-8"))]
        path = build_page(ns.out, autorun=ns.autorun, seeds=seeds, mutations=mutations)
    except (GamePageError, extract_js.ExtractionError, OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(f"wrote {path}")
    print(f"open  {path.as_uri()}" + ("" if ns.autorun else "?autorun=1"))
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
