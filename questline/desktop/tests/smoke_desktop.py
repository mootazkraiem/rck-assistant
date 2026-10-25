"""End-to-end smoke test of the real pywebview app, in a hidden window.

    python questline\\desktop\\tests\\smoke_desktop.py

Uses a temporary config dir and a temporary "shared" folder (never your real ones):
owner opens the app → changes a status → assigns a quest → a colleague saves from
another "PC" → the owner's window picks it up. Prints a JSON report; exit code 1 on failure.
"""
import json
import sys
import tempfile
import time
from pathlib import Path

import webview

DESKTOP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DESKTOP))
import app as desk  # noqa: E402
from store import Store, decode, now  # noqa: E402

tmp = Path(tempfile.mkdtemp(prefix="questline-smoke-"))
shared = tmp / "shared"
shared.mkdir()
owner = Store(tmp / "pc-owner")
owner.setup(str(shared), "Jeeef")
owner.add_member("Sam", "contributor")
api = desk.Api(owner)
port = desk.start_server()
window = webview.create_window("smoke", f"http://127.0.0.1:{port}/index.html?desktop=1#quest/Q0.1", js_api=api, hidden=True)
api._window = window
report, checks = {}, {}


def js(code):
    return window.evaluate_js(code)


def wait_for(code, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if js(code):
                return True
        except Exception:
            pass
        time.sleep(0.25)
    return False


def my_file(user="jeeef"):
    return decode((shared / "progress" / f"{user}.js").read_text(encoding="utf-8"))["state"]


def run():
    try:
        checks["app_started_in_desktop_mode"] = wait_for("window.__questline && window.__questline.store && window.__questline.store.kind === 'desktop'")
        report["session"] = json.loads(js("JSON.stringify({role: window.__questline.store.session.role, user: window.__questline.store.session.user})"))
        checks["owner_session"] = report["session"] == {"role": "owner", "user": "jeeef"}
        checks["team_nav_and_badge"] = bool(js("!!document.querySelector('[data-nav=\"team\"]') && document.querySelector('.user-badge').textContent.includes('Owner')"))

        js("document.querySelector('[data-action=\"set-status\"][data-status=\"in_progress\"]').click()")
        checks["status_saved_to_shared_folder"] = wait_for("true") and _poll(lambda: my_file()["quests"]["Q0.1"]["status"] == "in_progress")

        js("location.hash = '#quest/Q1.3'")
        wait_for("!!document.querySelector('[data-action=\"assign\"]')")
        js("const s = document.querySelector('[data-action=\"assign\"]'); s.value = 'sam'; s.dispatchEvent(new Event('change', {bubbles: true}));")
        checks["assignment_saved"] = _poll(lambda: my_file()["quests"]["Q1.3"].get("assignee") == "sam")

        # Colleague on another PC marks the assigned quest in progress and adds a note.
        sam = Store(tmp / "pc-sam")
        sam.setup(str(shared), "Sam")
        t = now()
        sam.save({"schema": 1, "quests": {
            "Q1.3": {"status": "in_progress", "fields": {"notes": "started by Sam"}, "_t": {"status": t, "f.notes": t}, "_b": {"status": "sam", "f.notes": "sam"},
                     "history": [{"at": t, "from": "todo", "to": "in_progress", "by": "sam"}]},
            "Q0.2": {"status": "done", "_t": {"status": t}, "_b": {"status": "sam"}}},  # not assigned to Sam → must be ignored
            "adrs": {}, "assumptions": {}, "updatedAt": t})
        js("document.activeElement && document.activeElement.blur(); window.dispatchEvent(new Event('focus'))")
        checks["sees_colleague_change"] = wait_for("window.__questline.getState().quests['Q1.3'].status === 'in_progress' && window.__questline.getState().quests['Q1.3'].fields.notes === 'started by Sam'")
        checks["ignores_unassigned_colleague_change"] = js("!(window.__questline.getState().quests['Q0.2'] && window.__questline.getState().quests['Q0.2'].status === 'done')")

        res = api.open_uri("https://example.com")
        checks["open_uri_rejects_non_vscode"] = res["ok"] is False
        js("location.hash = '#team'")
        checks["team_page_lists_members"] = wait_for("document.body.innerText.includes('Sam') && document.body.innerText.includes('Contributor')")
        js("location.hash = '#backup'")
        checks["backup_snapshots_listed"] = wait_for("document.querySelector('#snapList table') !== null")
        report["console_errors"] = js("window.__smokeErrors || []")
    except Exception as e:  # report instead of hanging
        report["exception"] = repr(e)
    finally:
        window.destroy()


def _poll(pred, timeout=10):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if pred():
                return True
        except (OSError, KeyError, ValueError):
            pass
        time.sleep(0.25)
    return False


webview.start(run, private_mode=True)
report["checks"] = checks
report["shared_folder"] = str(shared)
print(json.dumps(report, indent=2))
sys.exit(0 if checks and all(checks.values()) and "exception" not in report else 1)
