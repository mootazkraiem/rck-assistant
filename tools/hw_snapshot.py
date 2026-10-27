"""Machine resource baseline for the benchmark runner (Q1.10).

Writes audit/hardware.json: CPU, RAM, GPU, free disk, OS build, and the
Python/Node/Ollama versions available on this machine. Every probe below
fails soft -- on any problem it returns its fields as null plus an "error"
string explaining what went wrong, and this script never raises. Standard
library only: subprocess calls to PowerShell CIM, nvidia-smi and the
`node`/`ollama` CLIs, plus shutil.disk_usage for disk space.

Run:  python tools/hw_snapshot.py
"""
import json
import platform
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

NVIDIA_SMI_FALLBACK_PATH = r"C:\Windows\System32\nvidia-smi.exe"
SUBPROCESS_TIMEOUT_SECONDS = 10


def _run(cmd):
    """Run a command, return (stdout, None) or (None, error_string). Never raises."""
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=SUBPROCESS_TIMEOUT_SECONDS
        )
    except FileNotFoundError:
        return None, f"{cmd[0]} not found on PATH"
    except subprocess.TimeoutExpired:
        return None, f"{cmd[0]} timed out after {SUBPROCESS_TIMEOUT_SECONDS}s"
    except OSError as e:
        return None, f"{cmd[0]} failed to start: {e}"
    if result.returncode != 0:
        return None, f"{cmd[0]} exited {result.returncode}: {result.stderr.strip()[:200]}"
    return result.stdout, None


def _cim(class_name):
    """Query a WMI/CIM class via PowerShell. Returns (first_record_dict, None)
    or (None, error_string). Never raises -- a denied or missing PowerShell
    is just another soft failure for the caller to fall back from."""
    out, err = _run(["powershell", "-NoProfile", "-NonInteractive", "-Command",
                      f"Get-CimInstance {class_name} | ConvertTo-Json -Compress"])
    if err:
        return None, err
    try:
        data = json.loads(out)
    except json.JSONDecodeError as e:
        return None, f"could not parse PowerShell/CIM output for {class_name}: {e}"
    if isinstance(data, list):
        data = data[0] if data else {}
    return data, None


def probe_os():
    data, err = _cim("Win32_OperatingSystem")
    if err:
        # Fall back to the platform module -- no build number, but at least
        # the OS family/version, with no dependency on CIM being allowed.
        return {
            "caption": platform.system(), "version": platform.version(),
            "build": None, "architecture": platform.machine(),
            "error": f"CIM unavailable ({err}); used platform module fallback (no build number)",
        }
    return {
        "caption": data.get("Caption"), "version": data.get("Version"),
        "build": data.get("BuildNumber"), "architecture": data.get("OSArchitecture"),
        "error": None,
    }


def probe_cpu():
    data, err = _cim("Win32_Processor")
    if err:
        # platform.processor() is a crude fallback (often just the raw
        # PROCESSOR_IDENTIFIER string) and os.cpu_count() is logical, not
        # physical, cores -- reduced fidelity, but still stdlib-only.
        import os
        name = platform.processor() or None
        return {
            "name": name, "cores": None, "logical_processors": os.cpu_count(),
            "error": f"CIM unavailable ({err}); used platform/os fallback "
                     f"(no physical core count, name may be a raw identifier string)",
        }
    name = data.get("Name")
    return {
        "name": name.strip() if name else None,
        "cores": data.get("NumberOfCores"),
        "logical_processors": data.get("NumberOfLogicalProcessors"),
        "error": None,
    }


def probe_ram():
    data, err = _cim("Win32_OperatingSystem")
    if err:
        return {"total_gb": None, "free_gb": None,
                "error": f"CIM unavailable ({err}); the platform/os modules expose no "
                         f"portable memory query on Windows, so RAM cannot be determined"}
    total_kb, free_kb = data.get("TotalVisibleMemorySize"), data.get("FreePhysicalMemory")
    if total_kb is None or free_kb is None:
        return {"total_gb": None, "free_gb": None,
                "error": "Win32_OperatingSystem did not return TotalVisibleMemorySize/FreePhysicalMemory"}
    return {"total_gb": round(int(total_kb) / 1024 / 1024, 2),
            "free_gb": round(int(free_kb) / 1024 / 1024, 2), "error": None}


def probe_gpu():
    """nvidia-smi first (accurate VRAM/driver for NVIDIA cards); falls back to
    the absolute System32 path if PATH doesn't have it; falls back to CIM for
    a name only if nvidia-smi is unavailable either way -- CIM's AdapterRAM
    is a known-unreliable 32-bit field for cards with more than 4 GB, so VRAM
    is deliberately left null rather than reported wrong."""
    query = ["--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"]
    out, err = _run(["nvidia-smi", *query])
    if err:
        out, err2 = _run([NVIDIA_SMI_FALLBACK_PATH, *query])
        if err2:
            data, cim_err = _cim("Win32_VideoController")
            nvidia_err = f"nvidia-smi unavailable (PATH: {err}; {NVIDIA_SMI_FALLBACK_PATH}: {err2})"
            if cim_err:
                return {"name": None, "vram_mb": None, "driver_version": None,
                        "error": f"{nvidia_err}; CIM fallback also failed ({cim_err})"}
            return {
                "name": data.get("Name"), "vram_mb": None, "driver_version": data.get("DriverVersion"),
                "error": f"{nvidia_err}; VRAM omitted -- Win32_VideoController.AdapterRAM "
                         f"is unreliable for GPUs with more than 4 GB",
            }
    line = (out or "").strip().splitlines()
    if not line:
        return {"name": None, "vram_mb": None, "driver_version": None,
                "error": "nvidia-smi returned no output"}
    parts = [p.strip() for p in line[0].split(",")]
    if len(parts) != 3:
        return {"name": None, "vram_mb": None, "driver_version": None,
                "error": f"unexpected nvidia-smi output: {line[0]!r}"}
    name, vram_mb, driver = parts
    try:
        vram_mb = float(vram_mb)
    except ValueError:
        vram_mb = None
    return {"name": name, "vram_mb": vram_mb, "driver_version": driver, "error": None}


def probe_disk():
    """Free/total space on the drive this repo lives on -- shutil.disk_usage
    is pure standard library, no subprocess or CIM involved."""
    try:
        drive = Path(__file__).resolve().drive or "C:"
        usage = shutil.disk_usage(drive + "\\")
    except OSError as e:
        return {"drive": None, "total_gb": None, "free_gb": None, "error": str(e)}
    return {"drive": drive, "total_gb": round(usage.total / 1024**3, 2),
            "free_gb": round(usage.free / 1024**3, 2), "error": None}


def probe_python():
    return {"version": sys.version.split()[0], "error": None}


def probe_node():
    out, err = _run(["node", "--version"])
    if err:
        return {"version": None, "error": err}
    return {"version": out.strip(), "error": None}


def probe_ollama():
    out, err = _run(["ollama", "--version"])
    if err:
        return {"version": None, "error": err}
    return {"version": out.strip(), "error": None}


# (probe function, its result dict's field names) -- used so that if a probe
# itself has an unexpected bug, snapshot() still returns a well-shaped,
# null-filled entry instead of letting the exception escape.
_PROBES = {
    "os": (probe_os, ("caption", "version", "build", "architecture")),
    "cpu": (probe_cpu, ("name", "cores", "logical_processors")),
    "ram": (probe_ram, ("total_gb", "free_gb")),
    "gpu": (probe_gpu, ("name", "vram_mb", "driver_version")),
    "disk": (probe_disk, ("drive", "total_gb", "free_gb")),
    "python": (probe_python, ("version",)),
    "node": (probe_node, ("version",)),
    "ollama": (probe_ollama, ("version",)),
}


def snapshot() -> dict:
    result = {"generated_at": datetime.now(timezone.utc).isoformat()}
    for key, (probe_fn, fields) in _PROBES.items():
        try:
            result[key] = probe_fn()
        except Exception as e:  # last-resort guard; probes already fail soft on their own
            result[key] = {**{f: None for f in fields}, "error": f"unexpected error: {e}"}
    return result


def main():
    data = snapshot()
    out_path = Path(__file__).resolve().parent.parent / "audit" / "hardware.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(json.dumps(data, indent=2))
    return data


if __name__ == "__main__":
    main()
