"""Lokal körning eller egen värd: `python -m skoda_bridge`. Samma kod som Vercel-funktionen api/skoda.py."""
import os
from http.server import HTTPServer

from skoda_bridge.web import default_handler

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    print(f"[skoda-bridge] lyssnar på :{port}")
    HTTPServer(("0.0.0.0", port), default_handler()).serve_forever()
