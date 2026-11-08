"""Kartlägger myskoda-modellerna till det enkla svar hemskärmen läser. Ren logik, inget nätverk."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from myskoda.models.air_conditioning import AirConditioningState
from myskoda.models.charging import ChargingState
from myskoda.models.common import DoorLockedState, OpenState
from myskoda.models.position import ErrorType


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


_CLIMATE_ON = {AirConditioningState.ON, AirConditioningState.HEATING, AirConditioningState.COOLING, AirConditioningState.VENTILATION, AirConditioningState.HEATING_AUXILIARY}


def _climate(air: Any) -> dict[str, Any]:
    """Klimatläge. INVALID eller saknat svar blir None, aldrig "av"."""
    state = air.state if air is not None else None
    on = True if state in _CLIMATE_ON else False if state == AirConditioningState.OFF else None
    target = air.target_temperature.temperature_value if air is not None and air.target_temperature is not None else None
    ready = air.estimated_date_time_to_reach_target_temperature if on and air is not None else None
    if ready is not None and ready.tzinfo is None:
        ready = ready.replace(tzinfo=UTC)
    return {"climateOn": on, "climateTargetC": target, "climateReadyAt": ready.isoformat() if ready else None}


def _ts(part: Any) -> datetime | None:
    t = getattr(part, "car_captured_timestamp", None) if part is not None else None
    if t is None:
        return None
    return t if t.tzinfo is not None else t.replace(tzinfo=UTC)


def _driving(positions: Any) -> bool | None:
    """Škodas moln anger själv när bilen körs (VEHICLE_IN_MOTION). Inget svar = okänt, aldrig "står still" på en gissning."""
    if positions is None:
        return None
    return any(e.type == ErrorType.VEHICLE_IN_MOTION for e in positions.errors)


def _level_and_range(battery: Any, charging: Any, driving_range: Any) -> tuple[int | None, int | None, str, datetime | None]:
    """Batterinivå och räckvidd från SAMMA källa, den som bilen rapporterade senast (som Škoda-appen visar dem).

    Laddningsdelen uppdateras ofta bara under laddning och kan vara gammal; räckviddsdelen är normalt färskast.
    Lika eller saknade tider: räckviddsdelen vinner.
    """
    ch = None
    if battery is not None and battery.state_of_charge_in_percent is not None:
        m = battery.remaining_cruising_range_in_meters
        ch = (battery.state_of_charge_in_percent, round(m / 1000) if m is not None else None, _ts(charging))
    dr = None
    if driving_range is not None and driving_range.primary_engine_range.current_soc_in_percent is not None:
        dr = (driving_range.primary_engine_range.current_soc_in_percent, driving_range.total_range_in_km, _ts(driving_range))

    chosen = None
    if ch and dr:
        newer_charging = ch[2] is not None and (dr[2] is None or ch[2] > dr[2])
        chosen = ch if newer_charging else dr
    else:
        chosen = ch or dr
    if chosen is not None:
        other = dr if chosen is ch else ch
        range_km = chosen[1] if chosen[1] is not None else (other[1] if other else None)
        if range_km is None and driving_range is not None:
            range_km = driving_range.total_range_in_km
        return chosen[0], range_km, "battery", chosen[2]

    # Ingen batterinivå: bränslebil (eller okänt).
    level = driving_range.primary_engine_range.current_fuel_level_in_percent if driving_range is not None else None
    range_km = driving_range.total_range_in_km if driving_range is not None else None
    return level, range_km, "fuel", _ts(driving_range)


def summarize(charging: Any, status: Any, parking: Any, driving_range: Any, air: Any = None, positions: Any = None) -> dict[str, Any]:
    """Alla argument får vara None (anropet misslyckades eller bilen saknar funktionen)."""
    battery = charging.status.battery if charging is not None and charging.status is not None else None

    level, range_km, kind, battery_at = _level_and_range(battery, charging, driving_range)

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
        "capturedAt": _captured_at(status, charging, air),
        # Batteriets egen rapporttid: statusdelarna (lås, dörrar) kan vara färskare än batteridelen.
        "batteryAt": battery_at.isoformat() if battery_at else None,
        "driving": _driving(positions),
        **_climate(air),
    }
