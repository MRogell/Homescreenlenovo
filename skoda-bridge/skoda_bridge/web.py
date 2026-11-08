"""Tunn HTTP-adapter över handle_request. Används av api/skoda.py (Vercel) och `python -m skoda_bridge` (egen värd)."""
from __future__ import annotations

import asyncio
import json
import os
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler
from typing import Any, Mapping

from skoda_bridge.guard import RateGuard
from skoda_bridge.handler import BridgeState, Fetch, handle_command, handle_request

# Hemskärmen frågar var 2:a minut när bilen laddar, annars var 15:e. Spärren ligger strax under 2 min så att den inte krockar.
MIN_LOGIN_INTERVAL_S = 100
MAX_BODY_BYTES = 4096


def _now() -> str:
    return datetime.now(UTC).isoformat()


def build_handler(state: BridgeState, fetch: Fetch, env: Mapping[str, str]) -> type[BaseHTTPRequestHandler]:
    class BridgeHandler(BaseHTTPRequestHandler):
        def _send(self, status: int, body: dict[str, Any]) -> None:
            data = json.dumps(body, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:  # noqa: N802
            if self.path.split("?")[0] not in ("/api/skoda", "/api/status", "/"):
                return self._send(404, {"error": "Hittas inte"})
            status, body = asyncio.run(handle_request(self.headers.get("Authorization"), env, state, fetch, _now))
            self._send(status, body)

        def do_POST(self) -> None:  # noqa: N802
            if self.path.split("?")[0] != "/api/skoda":
                return self._send(404, {"error": "Hittas inte"})
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                length = -1
            if not 0 < length <= MAX_BODY_BYTES:
                return self._send(400, {"error": "Ogiltigt kommando"})
            try:
                body: Any = json.loads(self.rfile.read(length))
            except (ValueError, UnicodeDecodeError):
                return self._send(400, {"error": "Ogiltigt kommando"})
            status, result = asyncio.run(handle_command(self.headers.get("Authorization"), env, state, fetch, _now, body))
            self._send(status, result)

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            pass  # inga förfrågningsrader i loggen

    return BridgeHandler


def default_state() -> BridgeState:
    return BridgeState(RateGuard(MIN_LOGIN_INTERVAL_S))


def default_handler() -> type[BaseHTTPRequestHandler]:
    from skoda_bridge.client import fetch_summary

    return build_handler(default_state(), fetch_summary, os.environ)
