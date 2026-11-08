"""Själva förfrågan: kontroll av token, spärr mot för många inloggningar och svar. Inget HTTP-specifikt här."""
from __future__ import annotations

import math
import sys
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

from skoda_bridge.guard import RateGuard, authorized

# fetch(email, password, vin, command=None): command är ett validerat klimatkommando eller None (bara avläsning).
Fetch = Callable[..., Awaitable[dict[str, Any]]]

MIN_COMMAND_INTERVAL_S = 30
MIN_TEMP_C, MAX_TEMP_C = 16.0, 29.5


@dataclass
class BridgeState:
    guard: RateGuard
    last: dict[str, Any] | None = None
    last_failed: bool = False
    # Egen spärr för kommandon: lässpärren får inte neka en knapptryckning, men kommandon får inte heller hamra Škoda.
    commands: RateGuard = field(default_factory=lambda: RateGuard(MIN_COMMAND_INTERVAL_S))


def _text(code: str) -> dict[str, str]:
    return {
        "unauthorized": {"error": "Ej behörig"},
        "misconfigured": {"error": "Bryggan är inte konfigurerad"},
        "throttled": {"error": "För många förfrågningar, försök igen senare"},
        "failed": {"error": "Škoda svarade inte"},
        "invalid": {"error": "Ogiltigt kommando"},
        "command_throttled": {"error": "Vänta en halv minut och försök igen"},
        "command_failed": {"error": "Bilen tog inte emot kommandot"},
    }[code]


def _check_access(auth_header: str | None, env: Mapping[str, str]) -> tuple[int, dict[str, str]] | tuple[str, str]:
    """Token och inloggningsuppgifter. Ger (status, felsvar) vid fel, annars (e-post, lösenord)."""
    # Samma variabel som hemskärmen läser. BRIDGE_TOKEN stöds för fristående drift.
    token = env.get("SKODA_BRIDGE_TOKEN") or env.get("BRIDGE_TOKEN", "")
    # Utan en tillräckligt lång token vägrar bryggan svara alls, även om anroparen skickar samma korta värde.
    if len(token) < 32:
        # Orsaken (aldrig värdet) visas, så att fel i Vercels variabler går att hitta utan loggar.
        reason = "SKODA_BRIDGE_TOKEN saknas" if not token else "SKODA_BRIDGE_TOKEN är kortare än 32 tecken"
        return 500, {**_text("misconfigured"), "reason": reason}
    if not authorized(auth_header, token):
        return 401, _text("unauthorized")
    email, password = env.get("SKODA_USERNAME", ""), env.get("SKODA_PASSWORD", "")
    if not email or not password:
        missing = [k for k, v in (("SKODA_USERNAME", email), ("SKODA_PASSWORD", password)) if not v]
        return 500, {**_text("misconfigured"), "reason": " och ".join(missing) + " saknas"}
    return email, password


async def handle_request(
    auth_header: str | None,
    env: Mapping[str, str],
    state: BridgeState,
    fetch: Fetch,
    now: Callable[[], str],
) -> tuple[int, dict[str, Any]]:
    checked = _check_access(auth_header, env)
    if isinstance(checked[0], int):
        return checked  # type: ignore[return-value]
    email, password = checked

    if state.guard.too_soon():
        # Skydd av kontot: ingen ny inloggning, utan senast kända svar om det finns.
        if state.last_failed:
            return 502, _text("failed")  # samma orsak som senaste försöket, ingen ny inloggning
        return (200, state.last) if state.last is not None else (429, _text("throttled"))

    state.guard.mark()  # även misslyckade försök räknas, så att Škoda inte hamras
    try:
        result = await fetch(email, password, env.get("SKODA_VIN") or None)
    except Exception as e:  # noqa: BLE001
        # Bara typnamnet loggas: bibliotekets meddelande kan innehålla inloggningsuppgifter.
        print(f"[skoda-bridge] hämtning misslyckades: {type(e).__name__}", file=sys.stderr)
        state.last_failed = True
        return 502, _text("failed")
    state.last_failed = False
    state.last = {**result, "fetchedAt": now()}
    return 200, state.last


def parse_command(body: object) -> dict[str, Any] | None:
    """Strikt kontroll av ett klimatkommando. None betyder ogiltigt (inget anrop görs)."""
    if not isinstance(body, dict):
        return None
    if body == {"climate": "stop"}:
        return {"climate": "stop"}
    if set(body) != {"climate", "temperatureC"} or body["climate"] != "start":
        return None
    t = body["temperatureC"]
    if isinstance(t, bool) or not isinstance(t, (int, float)) or not math.isfinite(t):
        return None
    if not MIN_TEMP_C <= t <= MAX_TEMP_C or (t * 2) != int(t * 2):
        return None
    return {"climate": "start", "temperatureC": float(t)}


async def handle_command(
    auth_header: str | None,
    env: Mapping[str, str],
    state: BridgeState,
    fetch: Fetch,
    now: Callable[[], str],
    body: object,
) -> tuple[int, dict[str, Any]]:
    """Skickar klimatkommandot och returnerar ny sammanfattning från samma inloggning."""
    checked = _check_access(auth_header, env)
    if isinstance(checked[0], int):
        return checked  # type: ignore[return-value]
    email, password = checked
    command = parse_command(body)
    if command is None:
        return 400, _text("invalid")
    if state.commands.too_soon():
        return 429, _text("command_throttled")
    # Kommandot räknas som en inloggning: avläsningar strax efter använder svaret nedan.
    state.commands.mark()
    state.guard.mark()
    try:
        result = await fetch(email, password, env.get("SKODA_VIN") or None, command=command)
    except Exception as e:  # noqa: BLE001
        print(f"[skoda-bridge] kommando misslyckades: {type(e).__name__}", file=sys.stderr)
        return 502, _text("command_failed")
    state.last_failed = False
    state.last = {**result, "fetchedAt": now()}
    return 200, state.last
