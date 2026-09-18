import os

# Lecturas más rápidas durante los tests (se lee al importar monitor.server)
os.environ.setdefault("MONITOR_INTERVAL", "0.2")
