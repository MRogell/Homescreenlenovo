"""Vercel-funktion: GET /api/skoda. All logik ligger i skoda_bridge/ (testad).

Vercel kräver en klass som heter `handler` direkt i filen (den läser filen innan den körs), därför definieras den här.
Kräver Python 3.13 (myskoda). Miljövariabler: SKODA_BRIDGE_TOKEN, SKODA_USERNAME, SKODA_PASSWORD, valfri SKODA_VIN.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from skoda_bridge.web import default_handler  # noqa: E402

_Handler = default_handler()


class handler(_Handler):  # noqa: N801  (namnet måste vara exakt "handler")
    pass
