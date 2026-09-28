"""
Servidor web del monitor (FastAPI).

  GET  /api/system    Información fija del equipo
  GET  /api/metrics   Última lectura
  GET  /api/history   Historial reciente (para pintar las gráficas al abrir)
  WS   /ws/metrics    Lecturas en tiempo real, una por segundo
  GET  /              Interfaz web (carpeta web/)
  GET  /docs          Documentación automática de la API
"""

from __future__ import annotations

import asyncio
import os
import time
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .collector import Collector, system_info

INTERVAL = float(os.environ.get("MONITOR_INTERVAL", "1.0"))  # segundos entre lecturas
HISTORY_SECONDS = 120
WEB_DIR = Path(__file__).resolve().parent.parent / "web"

# Páginas que pueden consultar la API: la propia interfaz local y el portfolio publicado
ALLOWED_ORIGINS = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "https://zulemagutierrez.com",
    "https://www.zulemagutierrez.com",
]


def compact(snapshot: dict) -> dict:
    """Versión reducida de una lectura, suficiente para las gráficas del historial."""
    return {
        "time": snapshot["time"],
        "cpu": snapshot["cpu"]["total"],
        "mem": snapshot["memory"]["percent"],
        "up": snapshot["network"]["up"],
        "down": snapshot["network"]["down"],
    }


class Hub:
    """
    Toma una lectura cada INTERVAL segundos y la reparte a todos los
    navegadores conectados. Así hay un único Collector: si cada cliente
    midiera por su cuenta, los % de CPU se pisarían entre sí.
    """

    def __init__(self, interval: float = INTERVAL) -> None:
        self.interval = interval
        self.clients: set[WebSocket] = set()
        self.latest: dict | None = None
        self.history: deque[dict] = deque(maxlen=int(HISTORY_SECONDS / interval))

    async def run(self) -> None:
        # psutil es bloqueante: se ejecuta en un hilo para no congelar el servidor
        collector = await asyncio.to_thread(Collector)
        while True:
            started = time.monotonic()
            snapshot = await asyncio.to_thread(collector.snapshot)
            self.latest = snapshot
            self.history.append(compact(snapshot))
            await self.broadcast({"type": "metrics", "data": snapshot})
            # Se descuenta lo que ha tardado la lectura para mantener el ritmo
            await asyncio.sleep(max(0.0, self.interval - (time.monotonic() - started)))

    async def broadcast(self, message: dict) -> None:
        for ws in list(self.clients):
            try:
                await ws.send_json(message)
            except Exception:
                self.clients.discard(ws)


hub = Hub()
SYSTEM = system_info()


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(hub.run())
    yield
    task.cancel()


app = FastAPI(
    title="ZulemaOS Monitor",
    description="Monitor de sistema en tiempo real: CPU, memoria, discos, red y procesos.",
    version="0.2.0",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["GET"])


@app.get("/api/system", summary="Información del equipo")
def get_system() -> dict:
    return SYSTEM


@app.get("/api/metrics", summary="Última lectura")
def get_metrics() -> dict:
    return hub.latest or {}


@app.get("/api/history", summary="Historial reciente")
def get_history() -> list[dict]:
    return list(hub.history)


def origin_allowed(ws: WebSocket) -> bool:
    """El CORS no protege los WebSocket: sin esto, cualquier web abierta en el navegador
    podría leer los procesos y el nombre del equipo mientras el monitor está en marcha."""
    origin = ws.headers.get("origin")
    if origin is None:  # no viene de un navegador (scripts, tests)
        return True
    return origin in ALLOWED_ORIGINS or origin == f"http://{ws.headers.get('host', '')}"


@app.websocket("/ws/metrics")
async def ws_metrics(ws: WebSocket) -> None:
    if not origin_allowed(ws):
        await ws.close(code=1008)  # 1008 = rechazada por política
        return
    await ws.accept()
    hub.clients.add(ws)
    try:
        # Al conectar se envía todo lo necesario para pintar la pantalla de golpe
        await ws.send_json({"type": "hello", "system": SYSTEM, "history": list(hub.history), "interval": hub.interval})
        while True:
            await ws.receive_text()  # sólo sirve para enterarnos de cuándo se desconecta
    except WebSocketDisconnect:
        pass
    finally:
        hub.clients.discard(ws)


# La interfaz web se monta al final para que no tape las rutas /api y /ws
if WEB_DIR.is_dir():
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
