"""Loopback-only scratch preview with visible same-frame pixel A/B controls."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

sys.path.insert(0, __import__('os').path.expanduser("~/Documents/Codex/Projects/hardwareone"))
from tools.game import dev

SCRIPT = Path(__file__).with_name("depth-mask-native-ab.js")


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/":
            self.send_error(404)
            return
        try:
            page = dev.preview_html(dev.check())
            extra = SCRIPT.read_bytes()
            page = page.replace(b"</body></html>", b"<script>" + extra + b"</script></body></html>")
        except Exception as exc:
            self.send_error(409, str(exc))
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(page)))
        self.end_headers()
        self.wfile.write(page)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8003), Handler).serve_forever()
