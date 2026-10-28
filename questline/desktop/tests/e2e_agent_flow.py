"""End-to-end: Questline app (real pywebview, hidden) + Claude Code CLI (tools/ql.js), temp folders only.

    python questline\\desktop\\tests\\e2e_agent_flow.py

assign Q0.1 to the agent → `ql show` (refusals + prompt) → `ql submit` → panel "Awaiting review"
→ Done refused before acceptance → reject → resubmit → accept (ticks) → Done → Q0.2 unlocks
→ a forged Done in the agent's own file is ignored. Prints JSON; exit 1 on any failed check.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import webview

DESKTOP = Path(__file__).resolve().parents[1]
QUESTLINE = DESKTOP.parent
sys.path.insert(0, str(DESKTOP))
import app as desk  # noqa: E402
from store import Store, decode, encode  # noqa: E402

tmp = Path(tempfile.mkdtemp(prefix="questline-e2e-"))
shared, cfg = tmp / "shared", tmp / "config"
shared.mkdir()
owner = Store(cfg)
owner.setup(str(shared), "Jeeef")
owner.add_member("Claude", "agent")
env = {**os.environ, "QUESTLINE_CONFIG_DIR": str(cfg)}
api = desk.Api(owner)
port = desk.start_server()
window = webview.create_window("e2e", f"http://127.0.0.1:{port}/index.html?desktop=1#quest/Q0.1", js_api=api, hidden=True)
api._window = window
checks, info = {}, {}


def ql(*args):
    r = subprocess.run(["node", str(QUESTLINE / "tools" / "ql.js"), *args], capture_output=True, text=True, env=env, cwd=str(QUESTLINE.parent))
    return r.returncode, r.stdout + r.stderr


def js(code):
    return window.evaluate_js(code)


def wait(code, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if js(code):
                return True
        except Exception:
            pass
        time.sleep(0.25)
    return False


def poll(pred, timeout=10):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if pred():
                return True
        except (OSError, KeyError, ValueError):
            pass
        time.sleep(0.25)
    return False


def owner_state():
    return decode((shared / "progress" / "jeeef.js").read_text("utf-8"))["state"]


def report_file(quest, status="completed", n=3, met=True):
    p = tmp / f"{quest}.json"
    p.write_text(json.dumps({
        "questId": quest, "status": status, "summary": f"{quest} done by the agent",
        "filesChanged": [{"path": "audit/AUDIT.md", "change": "created"}],
        "commands": [{"command": "python -m pytest -q", "result": "26 passed", "exitCode": 0}],
        "tests": {"passed": 26, "failed": 0, "summary": "green"},
        "acceptance": [{"index": i, "met": met, "evidence": f"checked #{i + 1}"} for i in range(n)],
        "limitations": ["synthetic data only"], "decisions": [], "blockers": [], "nextQuest": "Q0.2", "cost": "none"}))
    return str(p)


def refresh():
    js("document.activeElement && document.activeElement.blur(); window.dispatchEvent(new Event('focus'))")


def click(selector):
    js(f"document.querySelector({json.dumps(selector)}).click()")


def run():
    try:
        checks["app_ready"] = wait("window.__questline && window.__questline.store.kind === 'desktop'")
        # 1. the agent is in the team and appears in the assignment list
        checks["agent_assignable"] = wait("[...document.querySelectorAll('[data-action=assign] option')].some(o => o.value === 'claude')")
        code, out = ql("show", "Q0.1")
        checks["show_refuses_unassigned"] = code == 1 and "not assigned to claude" in out
        js("const s = document.querySelector('[data-action=assign]'); s.value = 'claude'; s.dispatchEvent(new Event('change', {bubbles: true}))")
        checks["assignment_saved"] = poll(lambda: owner_state()["quests"]["Q0.1"]["assignee"] == "claude")

        # 2. CLI: show + submit (reject path first)
        code, out = ql("show", "Q0.1")
        checks["show_prints_agent_prompt"] = code == 0 and "ql.js submit .questline-reports/Q0.1.json" in out
        code, out = ql("show", "Q0.2")
        checks["show_refuses_unmet_deps"] = code == 1 and "not assigned" in out
        code, out = ql("submit", report_file("Q0.1"))
        checks["submit_ok"] = code == 0
        info["submit_output"] = out.strip().splitlines()[0] if out else ""
        checks["agent_file_written_only"] = sorted(p.name for p in (shared / "progress").iterdir()) == ["claude.js", "jeeef.js"]

        # 3. the review panel appears in the running app
        refresh()
        checks["panel_awaiting_review"] = wait("document.body.innerText.includes(\"Claude's report\") && document.body.innerText.includes('Awaiting review')")
        checks["status_in_progress_from_agent"] = wait("window.__questline.getState().quests['Q0.1'].status === 'in_progress'")

        # 4. Done is refused before acceptance (no override button)
        click("[data-action=set-status][data-status=done]")
        checks["done_refused_before_accept"] = wait("!document.getElementById('modal').hidden && document.getElementById('modalBody').innerText.includes('not ticked')")
        checks["no_override_button"] = js("![...document.querySelectorAll('#modalActions button')].some(b => /anyway/i.test(b.textContent))")
        click("#modalActions button")

        # 5. reject, resubmit, accept
        click("[data-action=reject-report]")
        wait("!!document.getElementById('rejectNote')")
        js("document.getElementById('rejectNote').value = 'evidence too thin'; [...document.querySelectorAll('#modalActions button')].find(b => b.textContent === 'Reject').click()")
        checks["reject_recorded"] = wait("document.body.innerText.includes('Rejected') && document.body.innerText.includes('evidence too thin')")
        time.sleep(0.5)
        code, _ = ql("submit", report_file("Q0.1"))
        refresh()
        checks["resubmission_awaits_review_again"] = code == 0 and wait("document.body.innerText.includes('Awaiting review')")
        click("[data-action=accept-report]")
        checks["accept_ticks_criteria"] = poll(lambda: owner_state()["quests"]["Q0.1"]["ack"] == {"0": True, "1": True, "2": True})
        checks["accept_does_not_mark_done"] = owner_state()["quests"]["Q0.1"].get("status") != "done"

        # 6. owner marks Done → next quest unlocks
        click("[data-action=set-status][data-status=done]")
        checks["owner_done_accepted"] = poll(lambda: owner_state()["quests"]["Q0.1"]["status"] == "done")
        checks["next_quest_unlocked"] = wait("window.__questline.L.derivedStatus(window.__questline.D._byId['Q0.2'], window.__questline.D, window.__questline.getState()) === 'ready'")

        # 7. Q0.2 assigned to the agent becomes workable; a forged Done in the agent file is ignored
        js("location.hash = '#quest/Q0.2'")
        wait("!!document.querySelector('[data-action=assign]')")
        js("const s = document.querySelector('[data-action=assign]'); s.value = 'claude'; s.dispatchEvent(new Event('change', {bubbles: true}))")
        poll(lambda: owner_state()["quests"]["Q0.2"]["assignee"] == "claude")
        code, _ = ql("show", "Q0.2")
        checks["show_ok_after_unlock"] = code == 0
        agent_file = shared / "progress" / "claude.js"
        doc = decode(agent_file.read_text("utf-8"))
        t = "2099-01-01T00:00:00.000Z"
        doc["state"]["quests"]["Q0.2"] = {"status": "done", "ack": {"0": True, "1": True, "2": True}, "fields": {"report": "forged"},
                                          "history": [], "_t": {"status": t, "ack.0": t, "ack.1": t, "ack.2": t, "f.report": t}, "_b": {"status": "claude"}}
        doc["savedAt"] = t
        agent_file.write_text(encode(doc), encoding="utf-8")
        refresh()
        time.sleep(1.5)
        checks["forged_agent_done_ignored"] = js("window.__questline.L.questStatus(window.__questline.D._byId['Q0.2'], window.__questline.getState()) !== 'done' && !(window.__questline.getState().quests['Q0.2'].ack || {})[0]")
        info["console_errors"] = js("window.__errors || []")
    except Exception as e:
        info["exception"] = repr(e)
    finally:
        window.destroy()


webview.start(run, private_mode=True)
shutil.rmtree(tmp, ignore_errors=True)
print(json.dumps({"checks": checks, **info}, indent=2))
sys.exit(0 if checks and all(checks.values()) and "exception" not in info else 1)
