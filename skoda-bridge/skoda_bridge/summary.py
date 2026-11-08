"""Kartlägger myskoda-modellerna till det enkla svar hemskärmen läser. Ren logik, inget nätverk."""
from __future__ import annotations

from datetime import UTC
from typing import Any

from myskoda.models.charging import ChargingState
from myskoda.models.common import DoorLockedState, OpenState


def _locked(status: Any) -> bool | None:
    if status is None:
        return None
    state = status.overall.locked
    if state == DoorLockedState.LOCKED:
        return True
    if state in (DoorLockedState.UNLOCKED, DoorLockedState.OPENED, DoorLockedState.TRUNK_OPENED):
        return False
    return None  # okänt läge visas aldrig som "olåst"


def _open(state: Any) -> bool | None:
    """Sant för öppen, falskt för stängd. Okänt eller ej stött blir None, så att kortet aldrig visar "stängd" på en gissning."""
    if state == OpenState.OPEN:
        return True
    if state == OpenState.CLOSED:
        return False
    return None


def _captured_at(*parts: Any) -> str | None:
    """Bilens egen rapporttid (inte när bryggan hämtade). Senaste tiden bland delarna."""
    times = [p.car_captured_timestamp for p in parts if p is not None and getattr(p, "car_captured_timestamp", None) is not None]
    times = [t if t.tzinfo is not None else t.replace(tzinfo=UTC) for t in times]  # tider utan zon antas vara UTC
    return max(times).isoformat() if times else None


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

    charge_status = charging.status if charging is not None else None
    minutes_left = charge_status.remaining_time_to_fully_charged_in_minutes if is_charging and charge_status is not None else None
    power = charge_status.charge_power_in_kw if is_charging and charge_status is not None else None
    target = charging.settings.target_state_of_charge_in_percent if charging is not None and charging.settings is not None else None

    overall = status.overall if status is not None else None
    detail = status.detail if status is not None else None

    address = parking.parking_position.formatted_address.strip() if parking is not None else ""
    return {
        "rangeKm": range_km,
        "levelPct": level,
        "levelKind": kind,
        "locked": _locked(status),
        "charging": is_charging,
        "parked": address or None,
        "chargeMinutesLeft": minutes_left if minutes_left else None,
        "chargeKw": round(power, 1) if power else None,
        "chargeTargetPct": target,
        "doorsOpen": _open(overall.doors) if overall is not None else None,
        "windowsOpen": _open(overall.windows) if overall is not None else None,
        "trunkOpen": _open(detail.trunk) if detail is not None else None,
        "bonnetOpen": _open(detail.bonnet) if detail is not None else None,
        "capturedAt": _captured_at(status, charging),
    }
