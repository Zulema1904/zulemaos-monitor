"""
Recolector de métricas del sistema.

Usa psutil para leer CPU, memoria, discos, red y procesos, y lo devuelve
como diccionarios listos para convertirse en JSON.

Pruébalo en la terminal:  python -m monitor.collector
"""

from __future__ import annotations

import platform
import socket
import time

import psutil

TOP_PROCESSES = 8


def cpu_model() -> str:
    """
    Nombre comercial del procesador (p. ej. "Intel Core i7-10700").
    platform.processor() en Windows sólo da algo como "Intel64 Family 6…",
    así que se busca donde cada sistema operativo lo guarda.
    """
    system = platform.system()
    try:
        if system == "Windows":
            import winreg
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
            return winreg.QueryValueEx(key, "ProcessorNameString")[0].strip()
        if system == "Linux":
            with open("/proc/cpuinfo", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("model name"):
                        return line.split(":", 1)[1].strip()
        if system == "Darwin":
            import subprocess
            out = subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"], capture_output=True, text=True)
            if out.stdout.strip():
                return out.stdout.strip()
    except OSError:
        pass
    return platform.processor() or platform.machine()


def system_info() -> dict:
    """Datos que no cambian mientras el equipo está encendido."""
    return {
        "hostname": socket.gethostname(),
        "os": f"{platform.system()} {platform.release()}",
        "os_version": platform.version(),
        "cpu_model": cpu_model(),
        "cores_physical": psutil.cpu_count(logical=False),
        "cores_logical": psutil.cpu_count(logical=True),
        "ram_total": psutil.virtual_memory().total,
        "boot_time": psutil.boot_time(),
    }


class NetSpeed:
    """
    psutil da los bytes totales enviados/recibidos desde el arranque.
    Para saber la velocidad guardamos la lectura anterior y calculamos
    cuántos bytes han pasado por segundo desde entonces.
    """

    def __init__(self) -> None:
        self._last = psutil.net_io_counters()
        self._last_time = time.monotonic()

    def read(self) -> dict:
        now = psutil.net_io_counters()
        now_time = time.monotonic()
        elapsed = max(now_time - self._last_time, 1e-6)
        speed = {
            "up": (now.bytes_sent - self._last.bytes_sent) / elapsed,
            "down": (now.bytes_recv - self._last.bytes_recv) / elapsed,
            "total_sent": now.bytes_sent,
            "total_recv": now.bytes_recv,
        }
        self._last, self._last_time = now, now_time
        return speed


def disks() -> list[dict]:
    """Uso de cada partición montada (se saltan unidades vacías, como un lector de DVD)."""
    result = []
    for part in psutil.disk_partitions(all=False):
        if not part.fstype:
            continue
        try:
            usage = psutil.disk_usage(part.mountpoint)
        except (PermissionError, OSError):
            continue
        result.append({
            "mount": part.mountpoint,
            "fstype": part.fstype,
            "total": usage.total,
            "used": usage.used,
            "percent": usage.percent,
        })
    return result


def top_processes(limit: int = TOP_PROCESSES) -> list[dict]:
    """
    Procesos que más CPU consumen.

    El % de CPU de un proceso se mide entre dos llamadas, así que la
    primera vez sale 0. process_iter() reutiliza los objetos Process
    entre llamadas, por eso a partir de la segunda lectura ya es real.
    psutil lo da sumando todos los núcleos (puede pasar de 100 %), así
    que lo dividimos entre el número de núcleos.
    """
    cores = psutil.cpu_count(logical=True) or 1
    procs = []
    for p in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent"]):
        info = p.info
        if info["pid"] == 0:  # "System Idle Process" en Windows: no es un proceso real
            continue
        procs.append({
            "pid": info["pid"],
            "name": info["name"] or "?",
            "cpu": round((info["cpu_percent"] or 0.0) / cores, 1),
            "mem": round(info["memory_percent"] or 0.0, 1),
        })
    procs.sort(key=lambda x: (x["cpu"], x["mem"]), reverse=True)
    return procs[:limit]


class Collector:
    """Junta todas las lecturas en una "foto" del sistema."""

    def __init__(self) -> None:
        self.net = NetSpeed()
        # Primera llamada "en vacío": psutil necesita una lectura previa
        psutil.cpu_percent(interval=None)
        psutil.cpu_percent(interval=None, percpu=True)
        top_processes()

    def snapshot(self) -> dict:
        mem = psutil.virtual_memory()
        swap = psutil.swap_memory()
        return {
            "time": time.time(),
            "cpu": {
                "total": psutil.cpu_percent(interval=None),
                "per_core": psutil.cpu_percent(interval=None, percpu=True),
            },
            "memory": {
                "total": mem.total,
                "used": mem.total - mem.available,
                "percent": mem.percent,
                "swap_percent": swap.percent,
            },
            "disks": disks(),
            "network": self.net.read(),
            "uptime": time.time() - psutil.boot_time(),
            "processes": top_processes(),
        }


# ---------- Mini panel en la terminal para probar el recolector ----------

def _bar(percent: float, width: int = 20) -> str:
    filled = round(percent / 100 * width)
    return "█" * filled + "░" * (width - filled)


def _human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} PB"


def main() -> None:
    info = system_info()
    collector = Collector()
    print(f"ZulemaOS Monitor · {info['hostname']} · {info['os']}")
    print(f"{info['cores_physical']} núcleos físicos / {info['cores_logical']} lógicos · RAM {_human(info['ram_total'])}")
    print("Ctrl+C para salir\n")
    try:
        while True:
            time.sleep(1)
            s = collector.snapshot()
            net = s["network"]
            top = s["processes"][0] if s["processes"] else None
            line = (
                f"CPU {_bar(s['cpu']['total'])} {s['cpu']['total']:5.1f}%  "
                f"RAM {_bar(s['memory']['percent'], 10)} {s['memory']['percent']:5.1f}%  "
                f"↑ {_human(net['up'])}/s ↓ {_human(net['down'])}/s  "
                f"top: {top['name'] if top else '-'}"
            )
            print(f"\r{line:<120}", end="", flush=True)
    except KeyboardInterrupt:
        print("\n¡Hasta luego! 🐾")


if __name__ == "__main__":
    main()
