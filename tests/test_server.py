"""Tests de la API y el WebSocket con el cliente de pruebas de FastAPI."""

import time

import pytest
from fastapi.testclient import TestClient

from monitor.server import app, compact


@pytest.fixture(scope="module")
def client():
    # "with" arranca el lifespan, es decir, la tarea que toma lecturas
    with TestClient(app) as c:
        deadline = time.monotonic() + 5
        while not c.get("/api/history").json() and time.monotonic() < deadline:
            time.sleep(0.1)
        yield c


def test_system_endpoint(client):
    r = client.get("/api/system")
    assert r.status_code == 200
    assert {"hostname", "os", "cpu_model", "cores_logical", "ram_total"} <= r.json().keys()


def test_metrics_and_history_fill_up(client):
    metrics = client.get("/api/metrics").json()
    assert "cpu" in metrics and "processes" in metrics

    history = client.get("/api/history").json()
    assert history
    assert set(history[0]) == {"time", "cpu", "mem", "up", "down"}


def test_websocket_sends_hello_then_metrics(client):
    with client.websocket_connect("/ws/metrics") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello"
        assert hello["system"]["hostname"]
        assert isinstance(hello["history"], list)

        msg = ws.receive_json()
        assert msg["type"] == "metrics"
        assert 0 <= msg["data"]["cpu"]["total"] <= 100


def test_cors_allows_portfolio_only(client):
    ok = client.get("/api/system", headers={"Origin": "https://zulema1904.github.io"})
    assert ok.headers.get("access-control-allow-origin") == "https://zulema1904.github.io"

    other = client.get("/api/system", headers={"Origin": "https://otra-web.example"})
    assert "access-control-allow-origin" not in other.headers


def test_web_interface_is_served(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "ZulemaOS Monitor" in r.text


def test_compact_keeps_only_chart_fields():
    snap = {
        "time": 1.0,
        "cpu": {"total": 12.5, "per_core": [10, 15]},
        "memory": {"percent": 40.0},
        "network": {"up": 1.0, "down": 2.0},
    }
    assert compact(snap) == {"time": 1.0, "cpu": 12.5, "mem": 40.0, "up": 1.0, "down": 2.0}
