"""Open Questline in your browser (solo mode).

    python questline/launch.py            # serve on http://127.0.0.1:8765 and open the browser
    python questline/launch.py --port 9000

Serves only the dashboard assets on localhost (standard library, nothing installed,
nothing sent anywhere; see desktop/webserver.py). Always use the same port: progress is
stored per browser *origin*, so http://127.0.0.1:8765 and a double-clicked index.html
keep separate progress. Stop with Ctrl+C.
"""
import argparse
import sys
import threading
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "desktop"))
from webserver import make_server  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    server = make_server(HERE, args.port)
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
