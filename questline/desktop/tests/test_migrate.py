"""Shared-folder migration: copy → verify → switch, never delete, refuse when unsafe."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from migrate_shared import migrate, sha256  # noqa: E402
from store import Store, StoreError, decode  # noqa: E402

WEB_ROOT = Path(__file__).resolve().parents[2]
STATE = {"schema": 1, "quests": {"Q0.1": {"status": "done", "ack": {"0": True}, "fields": {"report": "r"},
                                          "history": [{"at": "2026-10-27T09:00:00Z", "from": "todo", "to": "done", "by": "jeeef"}]}},
         "adrs": {}, "assumptions": {}}


@pytest.fixture
def owner(tmp_path):
    old = tmp_path / "repo" / "questline"   # the risky layout: shared folder inside the repo
    old.mkdir(parents=True)
    st = Store(tmp_path / "cfg")
    st.setup(str(old), "Jeeef")
    st.add_member("Claude", "agent")
    st.save(STATE)
    return st, old, tmp_path


def test_migrates_and_preserves_everything(owner):
    st, old, tmp = owner
    before = {rel: sha256(old / rel) for rel in ["questline-team.js", "progress/jeeef.js"]}
    res = migrate(st, str(tmp / "Questline-Shared"), is_running=lambda: False, web_root=WEB_ROOT)
    new = Path(res["to"])
    for rel, h in before.items():
        assert sha256(new / rel) == h                  # identical bytes at the destination
        assert sha256(old / rel) == h                  # old folder untouched
        assert sha256(Path(res["backup"]) / rel) == h  # verified backup
    assert (Path(res["backup"]) / "config.json").exists()
    s = Store(tmp / "cfg").session()                    # config switched, same identity and role
    assert s["sync_folder"] == str(new) and s["user"] == "jeeef" and s["role"] == "owner"
    state = decode((new / "progress" / "jeeef.js").read_text("utf-8"))["state"]
    assert state["quests"]["Q0.1"]["status"] == "done" and state["quests"]["Q0.1"]["history"]
    assert (new / "Open Questline.html").exists()


def test_refuses_while_questline_runs(owner):
    st, old, tmp = owner
    with pytest.raises(StoreError, match="running"):
        migrate(st, str(tmp / "dest"), is_running=lambda: True)
    assert Store(tmp / "cfg").session()["sync_folder"] == str(old)
    assert not (tmp / "dest").exists()


def test_refuses_to_overwrite_existing_questline_folder(owner):
    st, old, tmp = owner
    dest = tmp / "dest"
    (dest / "progress").mkdir(parents=True)
    with pytest.raises(StoreError, match="refusing to overwrite"):
        migrate(st, str(dest), is_running=lambda: False)
    assert Store(tmp / "cfg").session()["sync_folder"] == str(old)


def test_refuses_same_folder_and_unconfigured(tmp_path, owner):
    st, old, tmp = owner
    with pytest.raises(StoreError, match="current shared folder"):
        migrate(st, str(old), is_running=lambda: False)
    with pytest.raises(StoreError, match="not set up"):
        migrate(Store(tmp_path / "empty"), str(tmp_path / "x"), is_running=lambda: False)
