"""Sync-folder storage for the Questline desktop app.

Layout of the shared (OneDrive / SharePoint-synced) folder:

    questline-team.js            team members and roles (written by the owner only)
    progress/<user>.js     each member's progress, written ONLY by that member
    app/                   read-only copy of the dashboard (published by the owner)
    Open Questline.html    what the project manager double-clicks

One writer per file means the sync client never has to merge two people's edits;
the dashboard merges all progress files itself (latest change per field wins, with
role permissions applied — see mergeStates in js/logic.js).

Files are JavaScript (``window.QUESTLINE_SYNC.push({...});``) instead of JSON so the
read-only dashboard can load them from file:// without a server. The payload is
strict JSON, so Python reads them by stripping the wrapper.

Local, per-machine data (which folder, who you are, daily backups) lives in
%APPDATA%\\Questline.
"""
import datetime as dt
import json
import os
import re
import shutil
import time
from pathlib import Path

PREFIX = "window.QUESTLINE_SYNC.push("
SUFFIX = ");"
TEAM_FILE = "questline-team.js"
PROGRESS_DIR = "progress"
APP_DIR = "app"
LAUNCHER = "Open Questline.html"
# "agent" = Claude Code. It never runs this app: it writes progress\<id>.js only through
# tools\ql.js, and the merge (js/logic.js) limits what that file can change.
ROLES = ("owner", "contributor", "agent", "viewer")
MAX_BACKUPS = 15
# Dashboard files copied into the shared folder for the read-only view.
PUBLISHED = ["index.html", "css", "js", "data"]


class StoreError(Exception):
    """An error the UI shows to the user as-is."""


def default_config_dir() -> Path:
    """%APPDATA%\\Questline, or QUESTLINE_CONFIG_DIR (tests, or a second profile on one PC)."""
    if os.environ.get("QUESTLINE_CONFIG_DIR"):
        return Path(os.environ["QUESTLINE_CONFIG_DIR"])
    base = os.environ.get("APPDATA") or str(Path.home())
    return Path(base) / "Questline"


def slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").strip().lower()).strip("-")[:40]
    return s or "user"


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def encode(obj) -> str:
    return PREFIX + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + SUFFIX + "\n"


def decode(text: str):
    text = text.strip()
    if not (text.startswith(PREFIX) and text.endswith(SUFFIX)):
        raise ValueError("not an RCK sync file")
    return json.loads(text[len(PREFIX):-len(SUFFIX)])


def atomic_write(path: Path, text: str, retries: int = 5):
    """Write via a temp file + rename so readers and the sync client never see half a file.
    Retries briefly because sync clients sometimes hold a short lock."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    for attempt in range(retries):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            if attempt == retries - 1:
                tmp.unlink(missing_ok=True)
                raise
            time.sleep(0.2 * (attempt + 1))


class Store:
    def __init__(self, config_dir: Path | None = None):
        self.config_dir = Path(config_dir) if config_dir else default_config_dir()
        self.config_path = self.config_dir / "config.json"
        self.config = self._read_config()

    # ── local config ──
    def _read_config(self) -> dict:
        try:
            return json.loads(self.config_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def _write_config(self):
        atomic_write(self.config_path, json.dumps(self.config, indent=2))

    @property
    def sync_dir(self) -> Path | None:
        d = self.config.get("sync_folder")
        return Path(d) if d else None

    @property
    def user(self) -> str | None:
        return self.config.get("user")

    def session(self) -> dict:
        """Who am I, where is the folder, what may I do. configured=False → show setup."""
        d = self.sync_dir
        if not d or not self.user:
            return {"configured": False}
        if not d.is_dir():
            return {"configured": False, "error": f"Sync folder not found: {d}", "sync_folder": str(d)}
        team = self.read_team()
        member = self._member(team, self.user) if team else None
        if not member:
            return {"configured": False, "error": "You are no longer listed in this folder's team.", "sync_folder": str(d)}
        return {"configured": True, "sync_folder": str(d), "user": member["id"], "name": member["name"], "role": member["role"]}

    def _require(self, *roles) -> dict:
        s = self.session()
        if not s.get("configured"):
            raise StoreError(s.get("error") or "Not set up yet.")
        if roles and s["role"] not in roles:
            raise StoreError(f"Your role ({s['role']}) does not allow this.")
        return s

    # ── team ──
    def read_team(self, folder: Path | None = None) -> dict | None:
        p = Path(folder or self.sync_dir) / TEAM_FILE
        if not p.exists():
            return None
        data = decode(p.read_text(encoding="utf-8"))
        if data.get("kind") != "team":
            raise StoreError(f"{p} is not a team file")
        return data

    @staticmethod
    def _member(team: dict, user: str) -> dict | None:
        return next((m for m in team.get("members", []) if m["id"] == user), None)

    def _write_team(self, team: dict, folder: Path | None = None):
        team["updatedAt"] = now()
        atomic_write(Path(folder or self.sync_dir) / TEAM_FILE, encode(team))

    def setup(self, folder: str, name: str) -> dict:
        """First run on a machine. Empty folder → you become its owner.
        Existing team → you must already be listed (the owner adds you)."""
        # Accept what Explorer's "Copy as path" gives: quoted, maybe with %ENV% variables.
        folder = os.path.expandvars((folder or "").strip().strip('"').strip("'").strip())
        folder_p = Path(folder)
        if not folder:
            raise StoreError("Paste the shared folder path first.")
        if not folder_p.is_dir():
            raise StoreError(f"This folder does not exist on this PC: {folder}")
        if not (name or "").strip():
            raise StoreError("Enter your name.")
        team = self.read_team(folder_p)
        if team is None:
            uid = slug(name)
            team = {"kind": "team", "created": now(), "members": [{"id": uid, "name": name.strip(), "role": "owner"}]}
            self._write_team(team, folder_p)
            (folder_p / PROGRESS_DIR).mkdir(exist_ok=True)
        else:
            uid = slug(name)
            member = self._member(team, uid) or next((m for m in team["members"] if m["name"].casefold() == name.strip().casefold()), None)
            if not member:
                names = ", ".join(m["name"] for m in team["members"])
                raise StoreError(f"'{name}' is not in this team. Ask the owner to add you. Members: {names}")
            uid = member["id"]
        self.config.update({"sync_folder": str(folder_p), "user": uid})
        self._write_config()
        return self.session()

    def disconnect(self):
        self.config.pop("user", None)
        self.config.pop("sync_folder", None)
        self._write_config()

    def add_member(self, name: str, role: str) -> dict:
        self._require("owner")
        if role not in ROLES:
            raise StoreError(f"Unknown role {role}")
        team = self.read_team()
        uid = slug(name)
        if self._member(team, uid):
            raise StoreError(f"{name} is already a member.")
        team["members"].append({"id": uid, "name": name.strip(), "role": role})
        self._write_team(team)
        return team

    def set_role(self, uid: str, role: str) -> dict:
        s = self._require("owner")
        if role not in ROLES:
            raise StoreError(f"Unknown role {role}")
        team = self.read_team()
        m = self._member(team, uid)
        if not m:
            raise StoreError("No such member.")
        if uid == s["user"] and role != "owner":
            raise StoreError("You cannot remove your own owner role.")
        m["role"] = role
        self._write_team(team)
        return team

    def remove_member(self, uid: str) -> dict:
        s = self._require("owner")
        if uid == s["user"]:
            raise StoreError("You cannot remove yourself.")
        team = self.read_team()
        team["members"] = [m for m in team["members"] if m["id"] != uid]
        self._write_team(team)
        return team

    # ── progress ──
    def load(self) -> dict:
        """Team plus every member's progress. Files that are not a member's own file
        (e.g. sync-client conflict copies like 'jeeef-LAPTOP.js') are listed, never used."""
        s = self._require()
        team = self.read_team()
        ids = {m["id"] for m in team["members"]}
        entries, ignored, errors = [], [], []
        pdir = self.sync_dir / PROGRESS_DIR
        for p in sorted(pdir.glob("*.js")) if pdir.is_dir() else []:
            uid = p.stem
            if uid not in ids:
                ignored.append(p.name)
                continue
            try:
                data = decode(p.read_text(encoding="utf-8"))
                if data.get("kind") == "progress" and data.get("user") == uid:
                    entries.append({"user": uid, "savedAt": data.get("savedAt"), "state": data.get("state") or {}})
                else:
                    errors.append(f"{p.name}: wrong owner or kind")
            except (OSError, ValueError) as e:
                errors.append(f"{p.name}: {e}")
        return {"session": s, "team": team, "entries": entries, "ignored": ignored, "errors": errors}

    def save(self, state: dict) -> dict:
        s = self._require("owner", "contributor")
        if not isinstance(state, dict) or state.get("schema") != 1:
            raise StoreError("Refusing to save an invalid state.")
        saved_at = now()
        atomic_write(self.sync_dir / PROGRESS_DIR / f"{s['user']}.js",
                     encode({"kind": "progress", "user": s["user"], "savedAt": saved_at, "state": state}))
        self._daily_backup(state)
        return {"ok": True, "savedAt": saved_at}

    # ── local backups (per machine, outside the sync folder) ──
    @property
    def backup_dir(self) -> Path:
        return self.config_dir / "backups"

    def add_backup(self, reason: str, state: dict) -> str:
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        name = f"{stamp}-{slug(reason)[:30]}.json"
        atomic_write(self.backup_dir / name, json.dumps({"at": now(), "reason": reason, "state": state}))
        for old in self._backup_files()[MAX_BACKUPS:]:
            old.unlink(missing_ok=True)
        return name

    def _backup_files(self) -> list[Path]:
        return sorted(self.backup_dir.glob("*.json"), reverse=True) if self.backup_dir.is_dir() else []

    def _daily_backup(self, state: dict):
        today = dt.datetime.now().strftime("%Y%m%d")
        if not any(p.name.startswith(today) for p in self._backup_files()):
            self.add_backup("Automatic daily snapshot", state)

    def list_backups(self) -> list[dict]:
        out = []
        for p in self._backup_files():
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                out.append({"name": p.name, "at": data.get("at"), "reason": data.get("reason")})
            except (OSError, ValueError):
                continue
        return out

    def read_backup(self, name: str) -> dict:
        p = self.backup_dir / Path(name).name  # no path traversal
        return json.loads(p.read_text(encoding="utf-8"))

    # ── read-only dashboard for the project manager ──
    def publish_app(self, src_dir: Path) -> str:
        """Copy the dashboard into <sync>/app and write the double-click launcher. Owner only."""
        self._require("owner")
        src_dir = Path(src_dir)
        dest = self.sync_dir / APP_DIR
        for item in PUBLISHED:
            src = src_dir / item
            if src.is_dir():
                shutil.copytree(src, dest / item, dirs_exist_ok=True)
            else:
                dest.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dest / item)
        launcher = ('<!doctype html><meta charset="utf-8"><title>Questline</title>'
                    '<meta http-equiv="refresh" content="0; url=app/index.html">'
                    '<p><a href="app/index.html">Open Questline</a></p>')
        atomic_write(self.sync_dir / LAUNCHER, launcher)
        return str(self.sync_dir / LAUNCHER)
