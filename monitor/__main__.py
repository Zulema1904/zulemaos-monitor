"""
Arranque:  python -m monitor  [--port 8000] [--host 127.0.0.1] [--no-browser]
"""

import argparse
import threading
import webbrowser

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m monitor", description="ZulemaOS Monitor")
    parser.add_argument("--host", default="127.0.0.1",
                        help="dirección de escucha (por defecto sólo este equipo)")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true", help="no abrir el navegador al arrancar")
    args = parser.parse_args()

    url = f"http://{'127.0.0.1' if args.host == '0.0.0.0' else args.host}:{args.port}"
    print(f"\n  🖥️  ZulemaOS Monitor en {url}   (API: {url}/docs)\n  Ctrl+C para parar\n")
    if not args.no_browser:
        threading.Timer(1.5, webbrowser.open, [url]).start()
    uvicorn.run("monitor.server:app", host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
