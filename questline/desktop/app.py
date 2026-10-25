"""Questline: desktop app (pywebview 6).

    python questline\\desktop\\app.py          (from source)
    Questline.exe                              (built by build_exe.py)

On first run it asks for the shared sync folder and your name. Progress is saved to
<sync folder>\\progress\\<you>.js. See store.py for the folder layout and the README for
the team workflow.
"""
import functools
import http.server
import os
import sys
import threading
from pathlib import Path

import webview

sys.path.insert(0, str(Path(__file__).resolve().parent))
from store import Store, StoreError  # noqa: E402

# In the .exe, the dashboard files are unpacked to sys._MEIPASS; from source, they are in questline/.
WEB_ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
PREFERRED_PORT = 8766


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def start_server() -> int:
    """Serve the dashboard on 127.0.0.1. A fixed port keeps browser-side UI preferences."""
    handler = functools.partial(QuietHandler, directory=str(WEB_ROOT))
    for port in (PREFERRED_PORT, 0):
        try:
            server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
            break
        except OSError:
            continue
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server.server_address[1]


def _guard(fn):
    """Return {ok, result} or {ok: False, error} so the page can show the message."""
    @functools.wraps(fn)
    def wrapper(self, *args):
        try:
            return {"ok": True, "result": fn(self, *args)}
        except StoreError as e:
            return {"ok": False, "error": str(e)}
        except OSError as e:
            return {"ok": False, "error": f"File access failed: {e}"}
    return wrapper


class Api:
    """Methods callable from the page as window.pywebview.api.<name>(...)."""

    def __init__(self, store: Store):
        self._store = store
        self._window = None

    @_guard
    def session(self):
        return self._store.session()

    @_guard
    def choose_folder(self):
        result = self._window.create_file_dialog(webview.FileDialog.FOLDER)
        return result[0] if result else None

    @_guard
    def setup(self, folder, name):
        s = self._store.setup(folder, name)
        if s.get("role") == "owner":
            self._store.publish_app(WEB_ROOT)
        return s

    @_guard
    def disconnect(self):
        self._store.disconnect()
        return True

    @_guard
    def load(self):
        return self._store.load()

    @_guard
    def save(self, state):
        return self._store.save(state)

    @_guard
    def team_add(self, name, role):
        return self._store.add_member(name, role)

    @_guard
    def team_set_role(self, uid, role):
        return self._store.set_role(uid, role)

    @_guard
    def team_remove(self, uid):
        return self._store.remove_member(uid)

    @_guard
    def publish(self):
        return self._store.publish_app(WEB_ROOT)

    @_guard
    def list_backups(self):
        return self._store.list_backups()

    @_guard
    def add_backup(self, reason, state):
        return self._store.add_backup(reason, state)

    @_guard
    def read_backup(self, name):
        return self._store.read_backup(name)

    @_guard
    def save_text(self, filename, text):
        result = self._window.create_file_dialog(webview.FileDialog.SAVE, save_filename=filename)
        if not result:
            return None
        path = result if isinstance(result, str) else result[0]
        Path(path).write_text(text, encoding="utf-8")
        return path

    @_guard
    def open_uri(self, uri):
        # Only VS Code links: the page never gets a general "run anything" bridge.
        if not str(uri).startswith(("vscode://anthropic.claude-code/", "vscode://file/")):
            raise StoreError("Only VS Code links can be opened.")
        os.startfile(uri)
        return True

    @_guard
    def open_folder(self):
        s = self._store.session()
        if s.get("sync_folder"):
            os.startfile(s["sync_folder"])
        return True


def main():
    store = Store()
    api = Api(store)
    if store.session().get("role") == "owner":
        try:
            store.publish_app(WEB_ROOT)  # keep the manager's read-only copy current
        except (StoreError, OSError):
            pass
    port = start_server()
    window = webview.create_window(
        "Questline · RCK AI Assistant", f"http://127.0.0.1:{port}/index.html?desktop=1",
        js_api=api, width=1400, height=900, min_size=(900, 600), text_select=True,
        hidden=os.environ.get("QUESTLINE_HIDDEN") == "1",  # automated tests only
    )
    api._window = window
    # Persistent profile so UI preferences (theme, filters, project folder) survive restarts.
    webview.start(debug="--debug" in sys.argv, private_mode=False,
                  storage_path=str(store.config_dir / "webview"))


if __name__ == "__main__":
    main()
