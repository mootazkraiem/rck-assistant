"""Move Questline's shared folder on this PC: copy, verify, then switch. Never deletes anything.

    python questline\\desktop\\migrate_shared.py --to "C:\\Users\\me\\Questline-Shared"

1. Refuses while Questline is running (the app keeps the old folder in memory and would
   keep saving there).
2. Refuses if the destination already holds Questline files (nothing is overwritten).
3. Backs up the team file, every progress file and config.json to
   %APPDATA%\\Questline\\backups\\migration-<time>, and checks the copies byte for byte.
4. Copies questline-team.js and progress\\*.js to the destination and checks them again
   (identical bytes, and each file still decodes).
5. Only then points config.json at the destination (atomic write).
6. Republishes the manager's read-only view there (owner only).
The old folder is left as it was; remove its team/progress/app files yourself after checking.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from store import PROGRESS_DIR, TEAM_FILE, Store, StoreError, atomic_write, decode  # noqa: E402

WEB_ROOT = Path(__file__).resolve().parent.parent


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def questline_running() -> bool:
    """True if Questline.exe or `python ... questline ... app.py` is running (Windows)."""
    if sys.platform != "win32":
        return False
    script = ("Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Questline.exe' -or "
              "($_.Name -match 'python' -and $_.CommandLine -match 'questline.*app\\.py') } | Measure-Object | "
              "Select-Object -ExpandProperty Count")
    out = subprocess.run(["powershell", "-NoProfile", "-Command", script], capture_output=True, text=True, timeout=60)
    return out.stdout.strip() not in ("", "0")


def _copy_verified(files, src_root: Path, dst_root: Path) -> list[str]:
    report = []
    for rel in files:
        src, dst = src_root / rel, dst_root / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        if sha256(src) != sha256(dst):
            raise StoreError(f"Copy check failed for {rel}")
        decode(dst.read_text(encoding="utf-8"))  # still a valid Questline file
        report.append(f"{rel}  {sha256(dst)[:12]}  verified")
    return report


def migrate(store: Store, dest: str, is_running=questline_running, web_root: Path = WEB_ROOT) -> dict:
    s = store.session()
    if not s.get("configured"):
        raise StoreError("Questline is not set up on this PC: nothing to migrate.")
    old, new = Path(s["sync_folder"]).resolve(), Path(dest).expanduser().resolve()
    if old == new:
        raise StoreError("The destination is the current shared folder.")
    if is_running():
        raise StoreError("Questline is running. Close every Questline window, then run this again.")
    if new.exists() and ((new / TEAM_FILE).exists() or (new / PROGRESS_DIR).exists()):
        raise StoreError(f"{new} already contains Questline files: refusing to overwrite.")
    files = [TEAM_FILE] + sorted(f"{PROGRESS_DIR}/{p.name}" for p in (old / PROGRESS_DIR).glob("*.js"))

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = store.config_dir / "backups" / f"migration-{stamp}"
    log = [f"Backup: {backup}"] + _copy_verified(files, old, backup)
    shutil.copy2(store.config_path, backup / "config.json")
    if sha256(store.config_path) != sha256(backup / "config.json"):
        raise StoreError("Config backup check failed")

    new.mkdir(parents=True, exist_ok=True)
    log += [f"Copy to: {new}"] + _copy_verified(files, old, new)

    store.config["sync_folder"] = str(new)
    atomic_write(store.config_path, json.dumps(store.config, indent=2))
    after = store.session()
    if not after.get("configured") or Path(after["sync_folder"]) != new:
        raise StoreError(f"Switch check failed; restore {backup / 'config.json'} to {store.config_path}")
    if after["role"] == "owner":
        log.append("Manager view: " + store.publish_app(web_root))
    log.append(f"Old folder left untouched: {old}")
    return {"from": str(old), "to": str(new), "backup": str(backup), "files": files, "log": log}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--to", required=True, help="new shared folder")
    args = parser.parse_args()
    try:
        result = migrate(Store(), args.to)
    except (StoreError, OSError) as e:
        print(f"Migration stopped, nothing switched: {e}")
        return 1
    print("\n".join(result["log"]))
    print(f"\nDone. Questline now uses {result['to']}. Start Questline and check your quests.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
