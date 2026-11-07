"""Nätverksdelen: loggar in hos Škoda och hämtar fyra delar parallellt. Testas inte automatiskt (kräver riktigt konto)."""
from __future__ import annotations

import asyncio
from typing import Any

from aiohttp import ClientSession
from myskoda import MySkoda

from skoda_bridge.summary import summarize


async def fetch_summary(email: str, password: str, vin: str | None = None) -> dict[str, Any]:
    async with ClientSession() as session:
        api = MySkoda(session, mqtt_enabled=False)  # ingen MQTT: bryggan läser bara
        await api.connect(email=email, password=password)
        if not vin:
            vins = await api.list_vehicle_vins()
            if not vins:
                raise RuntimeError("Inga bilar på kontot")
            vin = vins[0]
        results = await asyncio.gather(
            api.get_charging(vin),
            api.get_status(vin),
            api.get_parking_position(vin),
            api.get_driving_range(vin),
            return_exceptions=True,
        )
        parts = [None if isinstance(r, BaseException) else r for r in results]
        if all(p is None for p in parts):
            raise RuntimeError("Inga svar från Škoda")
        return summarize(*parts)
