"""Open Questline in your browser (solo mode).

    python questline/launch.py            # serve on http://127.0.0.1:8765 and open the browser
    python questline/launch.py --port 9000

Serves this folder on localhost only (standard library, nothing installed, nothing sent
anywhere). Always use the same port: progress is stored per browser *origin*, so
http://127.0.0.1:8765 and a double-clicked index.html keep separate progress.
Stop with Ctrl+C.
"""
import argparse
import functools
import http.server
import threading
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def end_headers(self):
        # Always serve the latest data files after you edit them.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    handler = functools.partial(QuietHandler, directory=str(HERE))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    url = f"http://127.0.0.1:{args.port}/index.html"
    print(f"Questline: {url}  (Ctrl+C to stop)")
    if not args.no_browser:
        threading.Timer(0.5, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
