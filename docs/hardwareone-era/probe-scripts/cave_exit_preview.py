"""Task-local browser QA; never part of the shipping game or commit."""
import argparse
import sys
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

parser = argparse.ArgumentParser()
parser.add_argument('--repo', type=Path, required=True)
parser.add_argument('--port', type=int, required=True)
args = parser.parse_args()
sys.path.insert(0, str(args.repo))
from tools.game.dev import check, preview_html

overlay = Path(__file__).with_name('cave_exit_preview.js')

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != '/':
            self.send_error(404)
            return
        try:
            page = preview_html(check())
            extra = b'<script>' + overlay.read_bytes() + b'</script>'
            page = page.replace(b'</body>', extra + b'</body>')
        except Exception as exc:
            self.send_error(409, str(exc))
            return
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(page)

print('Cave exit QA on http://127.0.0.1:%s/' % args.port, flush=True)
ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
