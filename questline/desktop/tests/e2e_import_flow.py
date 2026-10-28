"""End-to-end: report made in a PERSONAL workspace, exported, imported into a separate WORK workspace.

    python questline\\desktop\\tests\\e2e_import_flow.py

Both workspaces are temporary folders with their own config dirs; they share nothing.
personal: owner assigns Q0.1 to Claude → `ql submit` → `ql export` (CLI, personal config)
work (real pywebview app, hidden): Q0.1 → refuse import while unassigned → assign to Claude
→ import → awaiting review → duplicate refused → forged package refused → accept → Done
→ Q0.2 unlocks. Also checks no file other than the work owner's progress file changes.
This simulates the work workspace; it is NOT a test of the real work PC.
"""
import hashlib
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
from store import Store, decode, encode, now  # noqa: E402

tmp = Path(tempfile.mkdtemp(prefix="questline-e2e-import-"))
checks, info = {}, {}

# ── personal workspace: owner + Claude, report via CLI ──
p_shared, p_cfg = tmp / "personal-shared", tmp / "personal-config"
p_shared.mkdir()
personal = Store(p_cfg)
personal.setup(str(p_shared), "Mootaz")
personal.add_member("Claude", "agent")
t = now()
personal.save({"schema": 1, "quests": {"Q0.1": {"assignee": "claude", "_t": {"assignee": t}, "_b": {"assignee": "mootaz"}}},
               "adrs": {}, "assumptions": {}, "updatedAt": t})
p_env = {**os.environ, "QUESTLINE_CONFIG_DIR": str(p_cfg)}


def ql(env, *args):
    r = subprocess.run(["node", str(QUESTLINE / "tools" / "ql.js"), *args], capture_output=True, text=True, env=env, cwd=str(tmp))
    return r.returncode, r.stdout + r.stderr


rep = tmp / "Q0.1.json"
rep.write_text(json.dumps({
    "questId": "Q0.1", "status": "completed", "summary": "Audit done on the personal PC.",
    "filesChanged": [{"path": "audit/AUDIT.md", "change": "created"}],
    "commands": [{"command": "python -m pytest -q", "result": "26 passed", "exitCode": 0}],
    "tests": {"passed": 26, "failed": 0}, "acceptance": [{"index": i, "met": True, "evidence": f"ok {i}"} for i in range(3)],
    "limitations": [], "decisions": [], "blockers": [], "nextQuest": "Q0.2"}))
code, out = ql(p_env, "submit", str(rep))
checks["personal_submit"] = code == 0
package = tmp / "transfer" / "Q0.1.qlreport.json"
code, out = ql(p_env, "export", "Q0.1", "--out", str(package))
checks["personal_export"] = code == 0 and package.exists()
pkg_text = package.read_text("utf-8") if package.exists() else "{}"

# ── work workspace: separate folder + config, real app ──
w_shared, w_cfg = tmp / "work-shared", tmp / "work-config"
w_shared.mkdir()
work = Store(w_cfg)
work.setup(str(w_shared), "Jeeef")
work.add_member("Claude", "agent")
work.add_member("Sam", "contributor")
api = desk.Api(work)
port = desk.start_server()
window = webview.create_window("e2e-import", f"http://127.0.0.1:{port}/index.html?desktop=1#quest/Q0.1", js_api=api, hidden=True)
api._window = window


def sha_tree(root):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(Path(root).rglob("*")) if p.is_file()}


def js(c):
    return window.evaluate_js(c)


def wait(c, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if js(c):
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


def owner_q(qid):
    return decode((w_shared / "progress" / "jeeef.js").read_text("utf-8"))["state"]["quests"].get(qid, {})


def drop_file(text, name="Q0.1.qlreport.json"):
    """Put a file into the import <input> exactly as a user picking it would."""
    js(f"""(() => {{ const i = document.getElementById('importReport'); const dt = new DataTransfer();
      dt.items.add(new File([{json.dumps(text)}], {json.dumps(name)}, {{type: 'application/json'}}));
      i.files = dt.files; i.dispatchEvent(new Event('change', {{bubbles: true}})); }})()""")


def modal_text():
    return js("document.getElementById('modal').hidden ? '' : document.getElementById('modalBody').innerText") or ""


def close_modal():
    js("document.querySelector('#modalActions button').click()")


def run():
    try:
        checks["work_app_ready"] = wait("window.__questline && window.__questline.store.kind === 'desktop'")
        personal_before = sha_tree(p_shared)
        # import refused while Q0.1 is not assigned to an agent in the WORK workspace
        checks["import_button_shown"] = wait("!!document.getElementById('importReport')")
        drop_file(pkg_text)
        checks["refused_unassigned_in_work"] = wait("document.getElementById('modalBody').innerText.includes('not assigned to an Agent in this workspace')")
        close_modal()
        js("const s = document.querySelector('[data-action=assign]'); s.value = 'claude'; s.dispatchEvent(new Event('change', {bubbles: true}))")
        poll(lambda: owner_q("Q0.1").get("assignee") == "claude")
        before_import = sha_tree(w_shared)
        # valid import → confirm → awaiting review
        drop_file(pkg_text)
        checks["import_confirm_dialog"] = wait("document.getElementById('modalTitle').innerText.startsWith(\"Import Claude's report\")")
        js("[...document.querySelectorAll('#modalActions button')].find(b => b.textContent === 'Import').click()")
        checks["imported_awaiting_review"] = wait("document.body.innerText.includes('Awaiting review') && document.body.innerText.includes('Imported by')")
        checks["only_owner_file_changed"] = poll(lambda: {k for k, v in sha_tree(w_shared).items() if before_import.get(k) != v} == {"progress\\jeeef.js"} or
                                                 {k for k, v in sha_tree(w_shared).items() if before_import.get(k) != v} == {"progress/jeeef.js"})
        checks["no_agent_file_in_work"] = not (w_shared / "progress" / "claude.js").exists()
        checks["not_ticked_not_done"] = owner_q("Q0.1").get("ack", {}) == {} and owner_q("Q0.1").get("status") != "done"
        # duplicate import refused
        drop_file(pkg_text)
        checks["duplicate_refused"] = wait("document.getElementById('modalBody').innerText.includes('already imported')")
        close_modal()
        # forged package (claims Done + ticks) refused
        forged = json.loads(pkg_text); forged["status"] = "done"; forged["ack"] = {"0": True, "1": True, "2": True}
        forged["submittedAt"] = now()
        drop_file(json.dumps(forged), "forged.json")
        checks["forged_refused"] = wait("document.getElementById('modalBody').innerText.includes('Unexpected field in the package: status')")
        close_modal()
        # Done refused before acceptance; accept; Done; unlock
        js("document.querySelector('[data-action=set-status][data-status=done]').click()")
        checks["done_refused_before_accept"] = wait("document.getElementById('modalBody').innerText.includes('not ticked')")
        close_modal()
        js("document.querySelector('[data-action=accept-report]').click()")
        checks["accept_ticks"] = poll(lambda: owner_q("Q0.1").get("ack") == {"0": True, "1": True, "2": True})
        js("document.querySelector('[data-action=set-status][data-status=done]').click()")
        checks["owner_done"] = poll(lambda: owner_q("Q0.1").get("status") == "done")
        checks["next_unlocked"] = wait("window.__questline.L.derivedStatus(window.__questline.D._byId['Q0.2'], window.__questline.D, window.__questline.getState()) === 'ready'")
        checks["personal_workspace_untouched"] = sha_tree(p_shared) == personal_before
        checks["work_team_unchanged_by_import"] = sha_tree(w_shared).get("questline-team.js") == before_import.get("questline-team.js")
    except Exception as e:
        info["exception"] = repr(e)
    finally:
        window.destroy()


webview.start(run, private_mode=True)
shutil.rmtree(tmp, ignore_errors=True)
print(json.dumps({"checks": checks, **info}, indent=2))
sys.exit(0 if checks and all(checks.values()) and "exception" not in info else 1)
