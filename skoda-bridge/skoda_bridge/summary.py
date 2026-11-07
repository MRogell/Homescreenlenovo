"""Kartlägger myskoda-modellerna till det enkla svar hemskärmen läser. Ren logik, inget nätverk."""
from __future__ import annotations

from typing import Any

from myskoda.models.charging import ChargingState
from myskoda.models.common import DoorLockedState


def _locked(status: Any) -> bool | None:
    if status is None:
        return None
    state = status.overall.locked
    if state == DoorLockedState.LOCKED:
        return True
    if state in (DoorLockedState.UNLOCKED, DoorLockedState.OPENED, DoorLockedState.TRUNK_OPENED):
        return False
    return None  # okänt läge visas aldrig som "olåst"


def summarize(charging: Any, status: Any, parking: Any, driving_range: Any) -> dict[str, Any]:
    """Alla fyra argument får vara None (anropet misslyckades eller bilen saknar funktionen)."""
    battery = charging.status.battery if charging is not None and charging.status is not None else None

    level: int | None = None
    kind = "fuel"
    if battery is not None and battery.state_of_charge_in_percent is not None:
        level, kind = battery.state_of_charge_in_percent, "battery"
    elif driving_range is not None:
        level = driving_range.primary_engine_range.current_fuel_level_in_percent

    range_km: int | None = None
    if driving_range is not None and driving_range.total_range_in_km is not None:
        range_km = driving_range.total_range_in_km
    elif battery is not None and battery.remaining_cruising_range_in_meters is not None:
        range_km = round(battery.remaining_cruising_range_in_meters / 1000)

    is_charging = bool(charging is not None and charging.status is not None and charging.status.state == ChargingState.CHARGING)

    address = parking.parking_position.formatted_address.strip() if parking is not None else ""
    return {
        "rangeKm": range_km,
        "levelPct": level,
        "levelKind": kind,
        "locked": _locked(status),
        "charging": is_charging,
        "parked": address or None,
    }
