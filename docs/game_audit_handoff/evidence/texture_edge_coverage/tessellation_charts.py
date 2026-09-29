"""Build tessellation_tradeoff.svg and tile_size_tradeoff.svg from the saved sweep data."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
def load(*names):
    for n in names:
        p = os.path.join(HERE, n)
        if os.path.exists(p): return json.load(open(p))
    raise SystemExit('missing ' + names[0])
D = load('tessellation_tradeoff.json', 'data.json')
C = load('tessellation_cases.json', 'cases.json')
STYLE = '''<style>
svg{--surface:#fcfcfb;--t1:#0b0b0b;--t2:#52514e;--muted:#898781;--grid:#e1e0d9;--axis:#c3c2b7;--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;
font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-variant-numeric:tabular-nums}
@media (prefers-color-scheme:dark){svg{--surface:#1a1a19;--t1:#ffffff;--t2:#c3c2b7;--grid:#2c2c2a;--axis:#383835;--s1:#3987e5;--s2:#d95926;--s3:#199e70}}
.bg{fill:var(--surface)} .t1{fill:var(--t1)} .t2{fill:var(--t2)} .mu{fill:var(--muted)}
.grid{stroke:var(--grid);stroke-width:1} .axis{stroke:var(--axis);stroke-width:1}
.ln{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.s1 .ln{stroke:var(--s1)} .s2 .ln{stroke:var(--s2)} .s3 .ln{stroke:var(--s3)}
.mk{stroke:var(--surface);stroke-width:2} .s1 .mk{fill:var(--s1)} .s2 .mk{fill:var(--s2)} .s3 .mk{fill:var(--s3)}
.hit{fill:transparent} .pl{fill:var(--t1);stroke:var(--surface);stroke-width:2} .hy{fill:var(--surface);stroke:var(--t1);stroke-width:2} .hyl{stroke:var(--t1);stroke-width:1.5;stroke-dasharray:2 3}
.spot{fill:none;stroke:var(--t1);stroke-width:1.5;stroke-dasharray:3 3} .lead{stroke:var(--t2);stroke-width:1}
.h1{font-size:16px;font-weight:600} .h2{font-size:12.5px} .h3{font-size:13px;font-weight:600} .sm{font-size:11.5px} .xs{font-size:11px} .b{font-weight:600}
</style>'''
NAMES = {'s1': 'Current, depth 7 (today)', 's2': 'Current, depth 10', 's3': 'Tie-break fix, depth 10'}
def pct(t): return (t - 1) * 100
def series_points():
    s1 = sorted([r for r in D['rows'] if r['series'] == 'd7'], key=lambda r: r['time'])
    s2 = sorted([r for r in D['rows'] if r['series'] == 'd10'], key=lambda r: r['time'])
    s3 = sorted([r for r in D['g2'] if r['series'] == 'g2d10'], key=lambda r: r['time'])
    return {'s1': s1, 's2': s2, 's3': s3}
def key(r, g2=False):
    return ('G2 ' if g2 else '') + 'e%g d%d%s' % (r['e'], r['d'], '' if r.get('cap', 256) == 256 else ' c%d' % r['cap'])
def legend(w, y, x=24):
    for cl in ('s1', 's2', 's3'):
        w('<g class="%s"><line class="ln" x1="%d" y1="%d" x2="%d" y2="%d"/><circle class="mk" cx="%d" cy="%d" r="5"/></g>' % (cl, x, y, x + 22, y, x + 11, y))
        w('<text class="t1 sm" x="%d" y="%d">%s</text>' % (x + 30, y + 4, NAMES[cl])); x += 30 + int(len(NAMES[cl]) * 6.3) + 24
    x, y = 24, y + 20
    w('<rect class="hy" x="%d" y="%d" width="10" height="10"/><text class="t1 sm" x="%d" y="%d">Hybrid: planar floors + tie-break triangles (default)</text>' % (x + 6, y - 5, x + 30, y + 4))
    x += 30 + int(52 * 6.3) + 24
    w('<path class="pl" d="M%d %d l6 6 l-6 6 l-6 -6 z"/><text class="t1 sm" x="%d" y="%d">Planar everywhere</text>' % (x + 11, y - 6, x + 30, y + 4))
def axes(w, sx, sy, X0, X1, PT, PB, yticks, xticks):
    for v in yticks:
        if v != yticks[0]: w('<line class="grid" x1="%d" y1="%.1f" x2="%d" y2="%.1f"/>' % (X0, sy(v), X1, sy(v)))
        w('<text class="mu xs" x="%d" y="%.1f" text-anchor="end">%d</text>' % (X0 - 8, sy(v) + 4, v))
    for p in xticks:
        if p: w('<line class="grid" x1="%.1f" y1="%d" x2="%.1f" y2="%d"/>' % (sx(p), PT, sx(p), PB))
        w('<text class="mu xs" x="%.1f" y="%d" text-anchor="middle">%s</text>' % (sx(p), PB + 18, '0%' if p == 0 else '+%d%%' % p))
    w('<line class="axis" x1="%d" y1="%d" x2="%d" y2="%d"/><line class="axis" x1="%d" y1="%d" x2="%d" y2="%d"/>' % (X0, PB, X1, PB, X0, PT, X0, PB))
def draw_series(w, sx, sy, pts, passes, tipfmt):
    for cl in ('s1', 's2', 's3'):
        xy = [(pct(r['time']), passes(cl, r), r) for r in pts[cl]]
        w('<g class="%s"><polyline class="ln" points="%s"/>' % (cl, ' '.join('%.1f,%.1f' % (sx(x), sy(y)) for x, y, _ in xy)))
        for x, y, r in xy:
            w('<g><title>%s</title><circle class="hit" cx="%.1f" cy="%.1f" r="10"/><circle class="mk" cx="%.1f" cy="%.1f" r="5"/></g>' % (tipfmt(cl, r, x, y), sx(x), sy(y), sx(x), sy(y)))
        w('</g>')
def write(name, out): open(os.path.join(HERE, name), 'w').write('\n'.join(out) + '\n')

# ---------- chart 1: all 20 triangle cases ----------
def chart1():
    W, H = 760, 540; X0, X1, PT, PB = 72, 600, 142, 424; XMIN, XMAX, YMIN, YMAX = -3.0, 45.0, 10.0, 20.6
    sx = lambda p: X0 + (p - XMIN) / (XMAX - XMIN) * (X1 - X0)
    sy = lambda v: PB - (v - YMIN) / (YMAX - YMIN) * (PB - PT)
    pts = series_points(); out = []; w = out.append
    w('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" role="img" aria-labelledby="t d">' % (W, H, W, H))
    w('<title id="t">Tessellation settings: motion quality against frame cost</title>')
    w('<desc id="d">Connected scatter. X: extra median frame-submission time against today, -3 to 45 percent. Y: triangle-path motion cases passing, of 20. '
      'Current tessellator at depth 7 goes from 12 today to 16 at errorPixels 0.3 (+19%). At depth 10 it reaches 17 at 0.3 (+18%). '
      'With the split-edge tie-break fix it passes 16 at today\'s settings for no extra cost, and 17 with depth 10 and errorPixels 0.4 (+8%). '
      'Tighter targets add cost without more passes. The planar path passes 20 of 20 at +30%.</desc>')
    w(STYLE); w('<rect class="bg" width="%d" height="%d" rx="8"/>' % (W, H))
    w('<text class="t1 h1" x="24" y="32">Planar floors plus tie-break triangles pass all 20 for about +9%</text>')
    w('<text class="t2 h2" x="24" y="52">Structure motion cases passing (of 20) against extra median frame time. Hover a point for its setting.</text>')
    legend(w, 76)
    w('<text class="t2 sm" x="24" y="%d">Cases passing (of 20)</text>' % (PT - 14))
    axes(w, sx, sy, X0, X1, PT, PB, list(range(10, 21, 2)), list(range(0, 46, 10)))
    w('<text class="t2 sm" x="%.1f" y="%d" text-anchor="middle">Extra median frame-submission time vs today (errorPixels 0.65, depth 7, no tie-break)</text>' % ((X0 + X1) / 2, PB + 42))
    def passes(cl, r): return r['pass']
    def tip(cl, r, x, y):
        return '%s, errorPixels %g: %d of 20 pass, %s median time, %d triangles per view' % (NAMES[cl], r['e'], y, '%+.1f%%' % x if abs(x) > 0.05 else 'baseline', r['tri'])
    draw_series(w, sx, sy, pts, passes, tip)
    P = D['planar']; px, py = sx(pct(P['time'])), sy(20)
    w('<g><title>Planar path: 20 of 20 pass, +%.1f%% median time (+%d%% to +%d%% by view)</title><circle class="hit" cx="%.1f" cy="%.1f" r="11"/><path class="pl" d="M%.1f %.1f l7 7 l-7 7 l-7 -7 z"/></g>' % (
        pct(P['time']), round(pct(P['timeMin'])), round(pct(P['timeMax'])), px, py, px, py - 7))
    w('<text class="t2 sm" x="%.1f" y="%.1f">Planar everywhere: 20 of 20, +27 to +30%%</text>' % (px + 14, py + 4))
    g0 = [r for r in pts['s3'] if r['e'] == 0.65][0]; gk = [r for r in pts['s3'] if r['e'] == 0.4][0]
    ax, ay = sx(pct(g0['time'])), sy(g0['pass'])
    w('<text class="t1 sm b" x="%.1f" y="%.1f">Tie-break alone:</text><text class="t2 xs" x="%.1f" y="%.1f">16 of 20, no extra cost</text>' % (ax - 8, ay + 22, ax - 8, ay + 37))
    bx, by = sx(pct(gk['time'])), sy(gk['pass'])
    w('<text class="t1 sm b" x="%.1f" y="%.1f">Best triangles-only: depth 10, errorPixels 0.4</text><text class="t2 xs" x="%.1f" y="%.1f">17 of 20 for +8%% time</text>' % (bx - 6, by - 33, bx - 6, by - 18))
    H2 = D['hybrid']; hp = [(sx(pct(h['time'])), sy(h['pass']), h) for h in H2]
    w('<line class="hyl" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>' % (hp[0][0], hp[0][1], hp[1][0], hp[1][1]))
    for hx, hy, h in hp:
        w('<g><title>Hybrid, errorPixels %g, depth %d: 20 of 20 pass, +%.1f%% median time (%+.0f%% to %+.0f%% by view), %d triangles + %d strips per view</title><circle class="hit" cx="%.1f" cy="%.1f" r="11"/><rect class="hy" x="%.1f" y="%.1f" width="10" height="10"/></g>' % (
            h['e'], h['d'], pct(h['time']), pct(h['tmin']), pct(h['tmax']), h['tri'], h['strips'], hx, hy, hx - 5, hy - 5))
    dx, dy = hp[1][0], hp[1][1]
    w('<rect class="spot" x="%.1f" y="%.1f" width="28" height="28" rx="8"/>' % (dx - 14, dy - 14))
    w('<text class="t1 sm b" x="%.1f" y="%.1f">Hybrid default: 20 of 20 for +9%%</text>' % (dx + 20, dy + 4))
    w('<text class="t2 xs" x="%.1f" y="%.1f">(+5%% at today\'s tessellation)</text>' % (dx + 20, dy + 19))
    w('<text class="t2 xs" x="%.1f" y="%.1f">Without the fix, errorPixels 0.3 costs</text>' % (sx(19.5), sy(16) + 20))
    w('<text class="t2 xs" x="%.1f" y="%.1f">about +18%% for 16 to 17 of 20</text>' % (sx(19.5), sy(16) + 34))
    w('<text class="t2 xs" x="%.1f" y="%.1f">0.65 today</text>' % (sx(0) + 8, sy(12) + 18))
    w('<text class="t2 xs" x="%.1f" y="%.1f">Triangles alone still fail the floor walk</text>' % (sx(26), sy(13.2)))
    w('<text class="t2 xs" x="%.1f" y="%.1f">(both sizes) and the 64px roof walk;</text>' % (sx(26), sy(13.2) + 15))
    w('<text class="t2 xs" x="%.1f" y="%.1f">hybrid strips on floors fix all three.</text>' % (sx(26), sy(13.2) + 30))
    w('<text class="mu xs" x="24" y="%d">Chromium, owner-mask edge fix on. Cost: 6 views x 60 frames x 2 runs, median of per-view p50 ratios. Timer step is ~4%% of baseline.</text>' % (H - 46))
    w('<text class="mu xs" x="24" y="%d">Current-tessellator times are from the first run; tie-break times from a second run whose errorPixels 0.3 anchor read +16%% (vs +18%%).</text>' % (H - 30))
    w('<text class="mu xs" x="24" y="%d">Hybrid and its planar reference are from a third run. Tie-break at depth 7 stays at 16 for every target. Frame-time tails not shown.</text>' % (H - 14))
    w('</svg>'); write('tessellation_tradeoff.svg', out)

# ---------- chart 2: per tile size ----------
def chart2():
    W, H = 760, 540; PT, PB = 156, 406; XMIN, XMAX, YMIN, YMAX = -3.0, 45.0, 4.0, 10.6
    pts = series_points(); out = []; w = out.append
    w('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" role="img" aria-labelledby="t d">' % (W, H, W, H))
    w('<title id="t">Tessellation settings at 64px and 128px tiles</title>')
    w('<desc id="d">Two panels, same axes. Y: triangle-path motion cases passing, of 10 per tile size. X: extra median frame time. '
      '64px: current tessellator 7 today, 8 at errorPixels 0.3; tie-break fix 8 at no cost; nothing reaches 9. '
      '128px: current tessellator 5 today, 8 at 0.3 depth 7, 9 at 0.3 depth 10; tie-break fix 8 at no cost and 9 with depth 10 and 0.4 (+8%). '
      'Planar passes 10 of 10 at both sizes. Both sizes cost the same.</desc>')
    w(STYLE); w('<rect class="bg" width="%d" height="%d" rx="8"/>' % (W, H))
    w('<text class="t1 h1" x="24" y="32">Hybrid passes 10 of 10 at both sizes; triangles alone favour 128px</text>')
    w('<text class="t2 h2" x="24" y="52">Structure motion cases passing (of 10 per size) against extra median frame time. Both sizes cost the same.</text>')
    legend(w, 76)
    notes = {'64': [(4, 9.2, 'Tie-break fix: 8 of 10, no extra cost'), (4, 8.75, 'Triangles never reach 9: the roof walk is'), (4, 8.35, 'limited by magnifying the 64px tile')],
             '128': [(20.5, 8.5, 'Tie-break + d10 + 0.4: 9 of 10'), (12, 6.2, 'Today: 5 of 10'), (12, 5.8, '(re-meshing hits the sharper texture)')]}
    for size, X0, X1 in ((64, 70, 350), (128, 440, 720)):
        sx = lambda p, X0=X0, X1=X1: X0 + (p - XMIN) / (XMAX - XMIN) * (X1 - X0)
        sy = lambda v: PB - (v - YMIN) / (YMAX - YMIN) * (PB - PT)
        w('<text class="t1 h3" x="%d" y="%d">%dpx tiles</text>' % (X0, PT - 16, size))
        axes(w, sx, sy, X0, X1, PT, PB, [4, 6, 8, 10], [0, 10, 20, 30, 40])
        def passes(cl, r, size=size):
            k = key(r, cl == 's3'); return C[k]['split'][str(size)]['pass']
        def tip(cl, r, x, y, size=size):
            return '%dpx, %s, errorPixels %g: %d of 10 pass, %s median time' % (size, NAMES[cl], r['e'], y, '%+.1f%%' % x if abs(x) > 0.05 else 'baseline')
        draw_series(w, sx, sy, pts, passes, tip)
        P = D['planar']; px = sx(pct(P['time']))
        w('<g><title>Planar path at %dpx: 10 of 10 pass, +%.0f%% median time</title><circle class="hit" cx="%.1f" cy="%.1f" r="10"/><path class="pl" d="M%.1f %.1f l7 7 l-7 7 l-7 -7 z"/></g>' % (size, pct(P['time']), px, sy(10), px, sy(10) - 7))
        w('<text class="t2 xs" x="%.1f" y="%.1f">Planar 10/10</text>' % (px + 12, sy(10) + 4))
        hd = [h for h in D['hybrid'] if h.get('default')][0]; hx = sx(pct(hd['time']))
        w('<g><title>Hybrid default at %dpx: %d of 10 pass, +%.1f%% median time</title><circle class="hit" cx="%.1f" cy="%.1f" r="10"/><rect class="hy" x="%.1f" y="%.1f" width="10" height="10"/></g>' % (size, hd['pass%d' % size], pct(hd['time']), hx, sy(10), hx - 5, sy(10) - 5))
        w('<text class="t1 xs b" x="%.1f" y="%.1f">Hybrid 10/10</text>' % (hx + 10, sy(10) + 4))
        for x, y, text in notes[str(size)]:
            w('<text class="t2 xs" x="%.1f" y="%.1f">%s</text>' % (sx(x), sy(y), text))
    w('<text class="t2 sm" x="%d" y="%d" text-anchor="middle">Extra median frame-submission time vs today (errorPixels 0.65, depth 7, no tie-break)</text>' % (W / 2, PB + 42))
    w('<text class="mu xs" x="24" y="%d">Points left to right: errorPixels 0.65 (today), 0.5, 0.4, 0.3, 0.2; current depth 10 adds 0.15; the tie-break line has 0.65, 0.4, 0.3, 0.2.</text>' % (H - 46))
    w('<text class="mu xs" x="24" y="%d">64px measured within 1%% of 128px at every setting (A/B/B/A, 6 views), so both panels share the 128px timings.</text>' % (H - 30))
    w('<text class="mu xs" x="24" y="%d">Floor walk fails at both sizes on the triangle path; it needs the planar path\'s directional filtering.</text>' % (H - 14))
    w('</svg>'); write('tile_size_tradeoff.svg', out)

chart1(); chart2(); print('ok')
