"""Tests del recolector: forma de los datos y cálculos propios (velocidad de red, % por proceso)."""

import time
from types import SimpleNamespace

import psutil

from monitor import collector
from monitor.collector import Collector, NetSpeed, system_info, top_processes


def test_system_info_has_basic_fields():
    info = system_info()
    assert info["hostname"]
    assert info["cpu_model"]
    assert info["cores_logical"] >= 1
    assert info["ram_total"] > 0
    assert info["boot_time"] < time.time()


def test_snapshot_shape_and_ranges():
    c = Collector()
    time.sleep(0.2)
    s = c.snapshot()

    assert 0 <= s["cpu"]["total"] <= 100
    assert len(s["cpu"]["per_core"]) == psutil.cpu_count(logical=True)
    assert all(0 <= v <= 100 for v in s["cpu"]["per_core"])

    assert 0 <= s["memory"]["percent"] <= 100
    assert 0 < s["memory"]["used"] <= s["memory"]["total"]

    assert s["network"]["up"] >= 0 and s["network"]["down"] >= 0
    assert s["uptime"] > 0
    assert len(s["processes"]) <= collector.TOP_PROCESSES
    for d in s["disks"]:
        assert 0 <= d["percent"] <= 100


def test_net_speed_is_bytes_per_second(monkeypatch):
    readings = iter([
        SimpleNamespace(bytes_sent=1_000, bytes_recv=5_000),
        SimpleNamespace(bytes_sent=3_000, bytes_recv=15_000),
    ])
    clock = iter([100.0, 102.0])  # han pasado 2 segundos
    monkeypatch.setattr(collector.psutil, "net_io_counters", lambda: next(readings))
    monkeypatch.setattr(collector.time, "monotonic", lambda: next(clock))

    speed = NetSpeed().read()

    assert speed["up"] == 1_000     # (3000 - 1000) / 2
    assert speed["down"] == 5_000   # (15000 - 5000) / 2
    assert speed["total_recv"] == 15_000


def test_top_processes_are_normalised_sorted_and_limited(monkeypatch):
    def proc(pid, name, cpu, mem):
        return SimpleNamespace(info={"pid": pid, "name": name, "cpu_percent": cpu, "memory_percent": mem})

    fake = [
        proc(0, "System Idle Process", 900.0, 0.0),  # se ignora
        proc(10, "tranquilo.exe", 4.0, 1.0),
        proc(11, "glotón.exe", 400.0, 2.0),          # 4 núcleos al 100 % → 100 %
        proc(12, None, 40.0, 0.5),
    ]
    monkeypatch.setattr(collector.psutil, "process_iter", lambda attrs: iter(fake))
    monkeypatch.setattr(collector.psutil, "cpu_count", lambda logical=True: 4)

    procs = top_processes(limit=2)

    assert [p["pid"] for p in procs] == [11, 12]
    assert procs[0]["cpu"] == 100.0
    assert procs[1]["name"] == "?"
