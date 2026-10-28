"""Regression tests: the local server must expose only dashboard assets.

Run with  python -m pytest -q questline/desktop/tests
"""
import socket
import sys
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from webserver import allowed_path, make_server, start_in_background  # noqa: E402


@pytest.fixture
def site(tmp_path):
    """A folder laid out like questline/ with a shared folder inside it (the risky case)."""
    files = {
        "index.html": "<html>ok</html>",
        "css/app.css": "body{}",
        "js/app.js": "app()",
        "data/adrs.js": "adrs()",
        "progress/mootaz.js": "window.QUESTLINE_SYNC.push({secret:1});",
        "questline-team.js": "team()",
        "desktop/store.py": "source",
        "README.md": "readme",
        "app/index.html": "published copy",
        "js/notes.txt": "not js",
        "data/sub/x.js": "nested",
    }
    for rel, text in files.items():
        p = tmp_path / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
    server = make_server(tmp_path, 0)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()


def get(url):
    try:
        with urllib.request.urlopen(url) as r:
            return r.status, r.read().decode(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, "", dict(e.headers)


@pytest.mark.parametrize("path", ["/", "/index.html", "/css/app.css", "/js/app.js", "/data/adrs.js", "/index.html?desktop=1"])
def test_dashboard_assets_are_served(site, path):
    status, body, headers = get(site + path)
    assert status == 200 and body
    assert headers["Cross-Origin-Resource-Policy"] == "same-origin"
    assert headers["X-Content-Type-Options"] == "nosniff"


@pytest.mark.parametrize("path", [
    "/progress/mootaz.js", "/questline-team.js", "/desktop/store.py", "/README.md", "/app/index.html",
    "/js/notes.txt", "/data/sub/x.js", "/js/", "/progress/", "/data",
    "/js/../progress/mootaz.js", "/js/%2e%2e/progress/mootaz.js", "/%2e%2e/README.md",
    "/js/..%5cprogress%5cmootaz.js", "/js\\..\\progress\\mootaz.js", "//progress/mootaz.js",
    "/js/./app.js", "/.git/config", "/js/app.js%00.txt",
])
def test_everything_else_is_404(site, path):
    status, body, _ = get(site + path)
    assert status == 404
    assert "secret" not in body


def test_write_methods_refused(site):
    req = urllib.request.Request(site + "/index.html", data=b"x", method="POST")
    with pytest.raises(urllib.error.HTTPError) as e:
        urllib.request.urlopen(req)
    assert e.value.code == 405


def test_allowed_path_unit():
    assert allowed_path("/data/quests-p0-p2.js") == "data/quests-p0-p2.js"
    assert allowed_path("/") == "index.html"
    assert allowed_path("/progress/x.js") is None
    assert allowed_path("/js/../js/app.js") is None


def test_binds_loopback_only_and_refuses_port_sharing(tmp_path):
    (tmp_path / "index.html").write_text("x", encoding="utf-8")
    first = make_server(tmp_path, 0)
    host, port = first.server_address
    assert host == "127.0.0.1"
    try:
        with pytest.raises(OSError):
            make_server(tmp_path, port)  # a second program must not share the port
        # start_in_background falls back to another free port instead
        other = start_in_background(tmp_path, (port, 0))
        assert other != port
    finally:
        first.server_close()


def test_not_reachable_on_other_interfaces(tmp_path):
    (tmp_path / "index.html").write_text("x", encoding="utf-8")
    server = make_server(tmp_path, 0)
    port = server.server_address[1]
    try:
        lan_ip = socket.gethostbyname(socket.gethostname())
        if lan_ip.startswith("127."):
            pytest.skip("no non-loopback address on this machine")
        s = socket.socket()
        s.settimeout(1)
        assert s.connect_ex((lan_ip, port)) != 0
        s.close()
    finally:
        server.server_close()
