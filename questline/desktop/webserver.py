"""The local web server for Questline's pages, shared by desktop/app.py and launch.py.

Serves ONLY the dashboard assets: index.html, css/*.css, js/*.js, data/*.js. Everything
else (progress files, the team file, Python sources, README, backups) answers 404,
because the shared folder can sit next to these files and its .js files would otherwise
be readable by any web page open in the browser (they can be loaded with <script>).

Also:
- binds 127.0.0.1 only;
- refuses port sharing (Windows SO_REUSEADDR lets a second program bind the same port
  and receive the requests meant for Questline);
- sends Cross-Origin-Resource-Policy: same-origin, so other sites cannot embed the files;
- sends nosniff and no-store.
"""
import functools
import http.server
import posixpath
import socket
import sys
import threading
import urllib.parse

ALLOWED_FILES = {"index.html"}
ALLOWED_PREFIXES = {"css/": (".css",), "js/": (".js",), "data/": (".js",)}


def allowed_path(raw_path: str) -> str | None:
    """Return the normalized relative path if it may be served, else None."""
    path = urllib.parse.unquote(urllib.parse.urlsplit(raw_path).path)
    if "\\" in path or "\x00" in path:
        return None
    rel = path.lstrip("/") or "index.html"
    # Reject anything that normalization would change: '..', '.', '//', trailing '/'.
    if posixpath.normpath(rel) != rel or rel.startswith("."):
        return None
    if rel in ALLOWED_FILES:
        return rel
    for prefix, exts in ALLOWED_PREFIXES.items():
        rest = rel[len(prefix):]
        if rel.startswith(prefix) and rest and "/" not in rest and rest.endswith(exts):
            return rel
    return None


class AssetHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        super().end_headers()

    def send_head(self):
        if allowed_path(self.path) is None:
            self.send_error(404, "Not found")
            return None
        return super().send_head()

    def list_directory(self, path):  # never list folders
        self.send_error(404, "Not found")
        return None

    def do_POST(self):  # read-only server
        self.send_error(405, "Method not allowed")

    do_PUT = do_DELETE = do_PATCH = do_POST


class ExclusiveServer(http.server.ThreadingHTTPServer):
    """No port sharing: on Windows, SO_EXCLUSIVEADDRUSE; elsewhere, no SO_REUSEADDR."""
    allow_reuse_address = False
    daemon_threads = True

    def server_bind(self):
        if sys.platform == "win32" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def make_server(root, port: int) -> ExclusiveServer:
    handler = functools.partial(AssetHandler, directory=str(root))
    return ExclusiveServer(("127.0.0.1", port), handler)


def start_in_background(root, ports) -> int:
    """Try each port in order (0 = any free port); return the bound port."""
    last = None
    for port in ports:
        try:
            server = make_server(root, port)
            break
        except OSError as e:
            last = e
    else:
        raise last
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server.server_address[1]
