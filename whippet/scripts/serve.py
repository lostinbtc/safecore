#!/usr/bin/env python3
"""Loopback-only, allowlisted static preview. Never serves the repository root."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1] / 'www'
FILES = {'index.html', 'styles.css', 'engine.js', 'viewport.js', 'recovery.js', 'receive.js', 'library.js', 'transactions.js', 'komodo.js', 'scanner.js', 'network.js', 'reporting.js', 'app.js', 'native.js',
         'assets/pepecoin.png', 'assets/whippet.png', 'assets/corevault.svg', 'assets/safecore.LICENSE', 'assets/ethers.umd.min.js',
         'assets/qrcode.min.js', 'assets/whippet-legacy.js', 'assets/jsQR.js', 'assets/jsQR.LICENSE', 'assets/ethers.LICENSE', 'assets/qrcode.LICENSE'}
FILES |= {f'assets/icons/safecore-{i:02d}.svg' for i in range(1, 31)}

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if not self.valid_host():
            self.send_error(403)
            return
        path = urlsplit(self.path).path.lstrip('/') or 'index.html'
        if path not in FILES:
            self.send_error(404)
            return
        self.path = '/' + path
        super().do_GET()

    def do_HEAD(self):
        if not self.valid_host():
            self.send_error(403)
            return
        path = urlsplit(self.path).path.lstrip('/') or 'index.html'
        if path not in FILES:
            self.send_error(404)
            return
        self.path = '/' + path
        super().do_HEAD()

    def valid_host(self):
        # Reject alternate Host names (including DNS-rebinding origins).
        host = self.headers.get('Host', '')
        port = self.server.server_port
        return host in {f'localhost:{port}', f'127.0.0.1:{port}'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()')
        super().end_headers()

    def log_message(self, format, *args):
        # No request paths/queries in logs: never accidentally log pasted data.
        pass

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8787)
    args = parser.parse_args()
    print(f'SafeCore development preview: http://localhost:{args.port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
