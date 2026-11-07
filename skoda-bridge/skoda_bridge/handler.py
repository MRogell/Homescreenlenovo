"""Själva förfrågan: kontroll av token, spärr mot för många inloggningar och svar. Inget HTTP-specifikt här."""
from __future__ import annotations

import sys
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any

from skoda_bridge.guard import RateGuard, authorized

Fetch = Callable[[str, str, str | None], Awaitable[dict[str, Any]]]


@dataclass
class BridgeState:
    guard: RateGuard
    last: dict[str, Any] | None = None


def _text(code: str) -> dict[str, str]:
    return {
        "unauthorized": {"error": "Ej behörig"},
        "misconfigured": {"error": "Bryggan är inte konfigurerad"},
        "throttled": {"error": "För många förfrågningar, försök igen senare"},
        "failed": {"error": "Škoda svarade inte"},
    }[code]


async def handle_request(
    auth_header: str | None,
    env: Mapping[str, str],
    state: BridgeState,
    fetch: Fetch,
    now: Callable[[], str],
) -> tuple[int, dict[str, Any]]:
    token = env.get("BRIDGE_TOKEN", "")
    # Utan en tillräckligt lång token vägrar bryggan svara alls, även om anroparen skickar samma korta värde.
    if len(token) < 32:
        return 500, _text("misconfigured")
    if not authorized(auth_header, token):
        return 401, _text("unauthorized")
    email, password = env.get("SKODA_USERNAME", ""), env.get("SKODA_PASSWORD", "")
    if not email or not password:
        return 500, _text("misconfigured")

    if state.guard.too_soon():
        # Skydd av kontot: ingen ny inloggning, utan senast kända svar om det finns.
        return (200, state.last) if state.last is not None else (429, _text("throttled"))

    state.guard.mark()  # även misslyckade försök räknas, så att Škoda inte hamras
    try:
        result = await fetch(email, password, env.get("SKODA_VIN") or None)
    except Exception as e:  # noqa: BLE001
        # Bara typnamnet loggas: bibliotekets meddelande kan innehålla inloggningsuppgifter.
        print(f"[skoda-bridge] hämtning misslyckades: {type(e).__name__}", file=sys.stderr)
        return 502, _text("failed")
    state.last = {**result, "fetchedAt": now()}
    return 200, state.last
