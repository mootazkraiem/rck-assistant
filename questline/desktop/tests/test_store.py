"""Sync-folder store: run with  python -m pytest -q questline/desktop/tests"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from store import (LAUNCHER, PREFIX, Store, StoreError, decode, encode,  # noqa: E402
                   slug)

WEB_ROOT = Path(__file__).resolve().parents[2]
STATE = {"schema": 1, "quests": {"Q0.1": {"status": "in_progress", "_t": {"status": "2026-10-25T10:00:00Z"}}}, "adrs": {}, "assumptions": {}}


@pytest.fixture
def shared(tmp_path):
    d = tmp_path / "OneDrive" / "RCK"
    d.mkdir(parents=True)
    return d


def pc(tmp_path, name):
    """A separate machine = a separate local config dir."""
    return Store(tmp_path / f"appdata-{name}")


def test_encode_decode_roundtrip_with_unicode():
    obj = {"kind": "progress", "text": 'Nicht genügend Informationen; ");', "n": 1}  # wrapper chars inside data
    text = encode(obj)
    assert text.startswith(PREFIX)
    assert decode(text) == obj
    with pytest.raises(ValueError):
        decode('{"kind": "progress"}')


def test_slug():
    assert slug("Jeeef") == "jeeef"
    assert slug("  Ana-Maria Pop ") == "ana-maria-pop"
    assert slug("!!!") == "user"


def test_first_setup_makes_owner_and_creates_layout(tmp_path, shared):
    s = pc(tmp_path, "me").setup(str(shared), "Jeeef")
    assert s == {"configured": True, "sync_folder": str(shared), "user": "jeeef", "name": "Jeeef", "role": "owner"}
    assert (shared / "questline-team.js").exists() and (shared / "progress").is_dir()
    # config persisted for the next start
    assert Store(tmp_path / "appdata-me").session()["role"] == "owner"


def test_setup_accepts_copy_as_path_quotes_and_env_vars(tmp_path, shared, monkeypatch):
    s = pc(tmp_path, "me").setup(f'  "{shared}"  ', "Jeeef")
    assert s["sync_folder"] == str(shared)
    monkeypatch.setenv("QL_TEST_ROOT", str(shared.parent))
    assert pc(tmp_path, "me2").setup("%QL_TEST_ROOT%\\RCK", "Jeeef")["sync_folder"] == str(shared)


def test_setup_errors(tmp_path, shared):
    st = pc(tmp_path, "me")
    with pytest.raises(StoreError):
        st.setup(str(shared / "missing"), "Jeeef")
    with pytest.raises(StoreError):
        st.setup(str(shared), "  ")


def test_join_requires_membership(tmp_path, shared):
    owner = pc(tmp_path, "me"); owner.setup(str(shared), "Jeeef")
    colleague = pc(tmp_path, "sam")
    with pytest.raises(StoreError, match="not in this team"):
        colleague.setup(str(shared), "Sam")
    owner.add_member("Sam", "contributor")
    s = colleague.setup(str(shared), "sam")  # name match is case-insensitive
    assert s["role"] == "contributor" and s["user"] == "sam"


def test_each_member_writes_only_their_own_file_and_load_sees_all(tmp_path, shared):
    owner = pc(tmp_path, "me"); owner.setup(str(shared), "Jeeef")
    owner.add_member("Sam", "contributor")
    sam = pc(tmp_path, "sam"); sam.setup(str(shared), "Sam")
    owner.save(STATE)
    sam.save({**STATE, "quests": {}})
    assert sorted(p.name for p in (shared / "progress").iterdir()) == ["jeeef.js", "sam.js"]
    res = owner.load()
    assert {e["user"] for e in res["entries"]} == {"jeeef", "sam"}
    assert res["entries"][0]["state"]["quests"]["Q0.1"]["status"] == "in_progress"


def test_viewer_cannot_save_and_only_owner_manages_team(tmp_path, shared):
    owner = pc(tmp_path, "me"); owner.setup(str(shared), "Jeeef")
    owner.add_member("Pat PM", "viewer"); owner.add_member("Sam", "contributor")
    pm = pc(tmp_path, "pm"); pm.setup(str(shared), "Pat PM")
    with pytest.raises(StoreError, match="viewer"):
        pm.save(STATE)
    sam = pc(tmp_path, "sam"); sam.setup(str(shared), "Sam")
    with pytest.raises(StoreError):
        sam.add_member("Eve", "owner")
    with pytest.raises(StoreError):
        owner.set_role("jeeef", "viewer")  # cannot demote yourself
    with pytest.raises(StoreError):
        owner.remove_member("jeeef")


def test_conflict_copies_and_corrupt_files_are_reported_not_used(tmp_path, shared):
    owner = pc(tmp_path, "me"); owner.setup(str(shared), "Jeeef")
    owner.save(STATE)
    (shared / "progress" / "jeeef-LAPTOP-1234.js").write_text(encode({"kind": "progress", "user": "jeeef", "state": {}}), encoding="utf-8")
    owner.add_member("Sam", "contributor")
    (shared / "progress" / "sam.js").write_text("garbage", encoding="utf-8")
    res = owner.load()
    assert [e["user"] for e in res["entries"]] == ["jeeef"]
    assert res["ignored"] == ["jeeef-LAPTOP-1234.js"]
    assert res["errors"] and res["errors"][0].startswith("sam.js")


def test_file_claiming_another_user_is_rejected(tmp_path, shared):
    owner = pc(tmp_path, "me"); owner.setup(str(shared), "Jeeef")
    owner.add_member("Sam", "contributor")
    (shared / "progress" / "sam.js").write_text(encode({"kind": "progress", "user": "jeeef", "state": {}}), encoding="utf-8")
    assert owner.load()["errors"] == ["sam.js: wrong owner or kind"]


def test_removed_member_is_disconnected(tmp_path, shared):
    owner = pc(tmp_path, "me"); owner.setup(str(shared), "Jeeef")
    owner.add_member("Sam", "contributor")
    sam = pc(tmp_path, "sam"); sam.setup(str(shared), "Sam")
    owner.remove_member("sam")
    assert sam.session()["configured"] is False
    with pytest.raises(StoreError):
        sam.save(STATE)


def test_invalid_state_is_refused(tmp_path, shared):
    owner = pc(tmp_path, "me"); owner.setup(str(shared), "Jeeef")
    with pytest.raises(StoreError):
        owner.save({"quests": {}})


def test_backups_daily_and_rotation(tmp_path, shared):
    owner = pc(tmp_path, "me"); owner.setup(str(shared), "Jeeef")
    owner.save(STATE); owner.save(STATE)
    assert [b["reason"] for b in owner.list_backups()] == ["Automatic daily snapshot"]
    for i in range(20):
        owner.add_backup(f"manual {i}", STATE)
    backups = owner.list_backups()
    assert len(backups) == 15 and backups[0]["reason"] == "manual 19"
    assert owner.read_backup(backups[0]["name"])["state"] == STATE
    with pytest.raises(OSError):
        owner.read_backup("../config.json")  # traversal stripped to a missing file


def test_publish_app_for_manager(tmp_path, shared):
    owner = pc(tmp_path, "me"); owner.setup(str(shared), "Jeeef")
    path = owner.publish_app(WEB_ROOT)
    assert Path(path).name == LAUNCHER
    for f in ["app/index.html", "app/js/sync.js", "app/js/app.js", "app/data/adrs.js", "app/css/app.css"]:
        assert (shared / f).exists(), f
    assert not (shared / "app" / "desktop").exists()  # Python code is not published
    owner.add_member("Sam", "contributor")
    sam = pc(tmp_path, "sam"); sam.setup(str(shared), "Sam")
    with pytest.raises(StoreError):
        sam.publish_app(WEB_ROOT)


def test_atomic_write_leaves_no_temp_files(tmp_path, shared):
    owner = pc(tmp_path, "me"); owner.setup(str(shared), "Jeeef")
    for _ in range(5):
        owner.save(STATE)
    assert not [p for p in shared.rglob("*.tmp")]
    json.loads(json.dumps(owner.load()))  # everything returned is JSON-serializable for pywebview
