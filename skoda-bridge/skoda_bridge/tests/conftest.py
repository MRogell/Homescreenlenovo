"""Testdata byggd med bibliotekets egna modeller (myskoda 2.17.2), så att kartläggningen testas mot de verkliga typerna."""
from myskoda.models.charging import Charging
from myskoda.models.driving_range import DrivingRange
from myskoda.models.position import ParkingPositionV3
from myskoda.models.status import Status

_RM = {"oneX": "", "oneAndHalfX": "", "twoX": "", "threeX": ""}


def charging(soc=78, range_m=312_000, state="READY_FOR_CHARGING", battery=True, power_kw=None, minutes_left=None, target=None, captured=None):
    status = {"battery": {"stateOfChargeInPercent": soc, "remainingCruisingRangeInMeters": range_m}, "state": state} if battery else None
    if status is not None:
        if power_kw is not None:
            status["chargePowerInKw"] = power_kw
        if minutes_left is not None:
            status["remainingTimeToFullyChargedInMinutes"] = minutes_left
    settings = {"availableChargeModes": []}
    if target is not None:
        settings["targetStateOfChargeInPercent"] = target
    data = {"errors": [], "settings": settings, "isVehicleInSavedLocation": True}
    if captured is not None:
        data["carCapturedTimestamp"] = captured
    if status:
        data["status"] = status
    return Charging.from_dict(data)


def status(locked="YES", doors="CLOSED", windows="CLOSED", trunk="CLOSED", bonnet="CLOSED", captured=None):
    data = {
        "detail": {"bonnet": bonnet, "sunroof": "CLOSED", "trunk": trunk},
        "overall": {"doors": doors, "doorsLocked": locked, "lights": "OFF", "locked": locked, "windows": windows},
        "renders": {"lightMode": _RM, "darkMode": _RM},
    }
    if captured is not None:
        data["carCapturedTimestamp"] = captured
    return Status.from_dict(data)


def parking(address="Storgatan 1, Stockholm"):
    return ParkingPositionV3.from_dict({"parkingPosition": {"gpsCoordinates": {"latitude": 59.3, "longitude": 18.0}, "formattedAddress": address}})


def driving_range(total=312, fuel_pct=78, engine="electric", soc=None, captured=None):
    engine_range = {"engineType": engine, "currentFuelLevelInPercent": fuel_pct, "remainingRangeInKm": total}
    if soc is not None:
        engine_range["currentSoCInPercent"] = soc
    data = {"primaryEngineRange": engine_range, "totalRangeInKm": total, "carType": engine}
    if captured is not None:
        data["carCapturedTimestamp"] = captured
    return DrivingRange.from_dict(data)


def air_conditioning(state="OFF", target=21.0, ready_at=None, captured=None):
    from myskoda.models.air_conditioning import AirConditioning
    data = {"timers": [], "errors": [], "state": state}
    if target is not None:
        data["targetTemperature"] = {"temperatureValue": target, "unitInCar": "CELSIUS"}
    if ready_at is not None:
        data["estimatedDateTimeToReachTargetTemperature"] = ready_at
    if captured is not None:
        data["carCapturedTimestamp"] = captured
    return AirConditioning.from_dict(data)


def positions(in_motion=False):
    from myskoda.models.position import Positions
    errors = [{"type": "VEHICLE_IN_MOTION", "description": "Vehicle is in motion"}] if in_motion else []
    pos = [] if in_motion else [{"gpsCoordinates": {"latitude": 59.3, "longitude": 18.0}, "type": "VEHICLE"}]
    return Positions.from_dict({"errors": errors, "positions": pos})
