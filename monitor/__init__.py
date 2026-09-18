"""ZulemaOS Monitor: monitor de sistema con FastAPI y una interfaz web retro."""

import sys

# La consola de Windows puede usar cp1252, que no sabe escribir emojis ni "█".
# Forzamos UTF-8 (y si aun así algo no se puede mostrar, se sustituye en vez de fallar).
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")
