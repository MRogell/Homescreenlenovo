"""Skydd: tokenkontroll i konstant tid och en spärr som begränsar antalet inloggningar hos Škoda."""
from __future__ import annotations

import hmac
import time
from collections.abc import Callable

MIN_TOKEN_LENGTH = 32


def authorized(header: str | None, token: str) -> bool:
    """Sant bara för exakt `Bearer <token>`, och bara om den konfigurerade token är tillräckligt lång."""
    if len(token) < MIN_TOKEN_LENGTH or not header or not header.startswith("Bearer "):
        return False
    given = header[len("Bearer "):]
    return hmac.compare_digest(given.encode(), token.encode())


class RateGuard:
    """Högst ett anrop mot Škoda per `min_interval_s` sekunder (per processinstans)."""

    def __init__(self, min_interval_s: float, clock: Callable[[], float] = time.monotonic) -> None:
        self._min = min_interval_s
        self._clock = clock
        self._last: float | None = None

    def too_soon(self) -> bool:
        return self._last is not None and self._clock() - self._last < self._min

    def mark(self) -> None:
        self._last = self._clock()
