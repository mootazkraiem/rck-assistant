"""Q0.2: hw_snapshot must fail soft, never raise, even when a probe tool is
missing. Imports hw_snapshot as a plain module (tools/ added to sys.path)
rather than a package, since tools/__init__.py is not a file this quest
is allowed to add.
"""
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import hw_snapshot as hw  # noqa: E402


def test_gpu_probe_fails_soft_when_nvidia_smi_is_missing(monkeypatch):
    """Simulates a missing nvidia-smi (both the PATH lookup and the
    System32 fallback path) and a CIM query that still succeeds, so the
    probe falls all the way through to its name-only CIM fallback."""
    def fake_run(cmd, **kwargs):
        if "nvidia-smi" in cmd[0].lower():
            raise FileNotFoundError(f"[WinError 2] The system cannot find the file specified: {cmd[0]!r}")
        if cmd[0] == "powershell":
            fake_gpu = [{"Name": "Fake Integrated Graphics", "AdapterRAM": None, "DriverVersion": "1.2.3.4"}]
            return subprocess.CompletedProcess(cmd, 0, stdout=json.dumps(fake_gpu), stderr="")
        raise AssertionError(f"unexpected command in this test: {cmd}")

    monkeypatch.setattr(subprocess, "run", fake_run)
    result = hw.probe_gpu()

    assert result["vram_mb"] is None
    assert result["name"] == "Fake Integrated Graphics"
    assert result["driver_version"] == "1.2.3.4"
    assert result["error"] is not None and "nvidia-smi" in result["error"]


def test_gpu_probe_fails_soft_when_nothing_is_available(monkeypatch):
    """nvidia-smi and the CIM fallback both missing -- must still return a
    fully-shaped dict (all fields present, all null) and never raise."""
    def fake_run(cmd, **kwargs):
        raise FileNotFoundError(f"{cmd[0]} not found")

    monkeypatch.setattr(subprocess, "run", fake_run)
    result = hw.probe_gpu()

    assert result == {"name": None, "vram_mb": None, "driver_version": None, "error": result["error"]}
    assert result["error"]  # non-empty explanation, not a silent null


def test_snapshot_never_raises_even_when_every_subprocess_call_fails(monkeypatch):
    """Top-level guarantee: whatever goes wrong underneath, snapshot() always
    returns all eight sections, each either populated or null-with-error."""
    def fake_run(cmd, **kwargs):
        raise OSError("simulated total subprocess failure")

    monkeypatch.setattr(subprocess, "run", fake_run)
    data = hw.snapshot()

    assert set(data) == {"generated_at", "os", "cpu", "ram", "gpu", "disk", "python", "node", "ollama"}
    for key in ("os", "cpu", "ram", "gpu", "node", "ollama"):
        assert data[key]["error"], f"{key} probe should have recorded an error"
    # disk uses shutil.disk_usage directly, not subprocess, so it's unaffected
    assert data["disk"]["error"] is None
    # sys.version is read in-process, not subprocess, so it's unaffected too
    assert data["python"]["version"]
