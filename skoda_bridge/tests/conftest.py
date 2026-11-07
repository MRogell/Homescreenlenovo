"""Testdata byggd med bibliotekets egna modeller (myskoda 2.17.2), så att kartläggningen testas mot de verkliga typerna."""
from myskoda.models.charging import Charging
from myskoda.models.driving_range import DrivingRange
from myskoda.models.position import ParkingPositionV3
from myskoda.models.status import Status

_RM = {"oneX": "", "oneAndHalfX": "", "twoX": "", "threeX": ""}


def charging(soc=78, range_m=312_000, state="READY_FOR_CHARGING", battery=True):
    status = {"battery": {"stateOfChargeInPercent": soc, "remainingCruisingRangeInMeters": range_m}, "state": state} if battery else None
    data = {"errors": [], "settings": {"availableChargeModes": []}, "isVehicleInSavedLocation": True}
    if status:
        data["status"] = status
    return Charging.from_dict(data)


def status(locked="YES"):
    return Status.from_dict({
        "detail": {"bonnet": "CLOSED", "sunroof": "CLOSED", "trunk": "CLOSED"},
        "overall": {"doors": "CLOSED", "doorsLocked": locked, "lights": "OFF", "locked": locked, "windows": "CLOSED"},
        "renders": {"lightMode": _RM, "darkMode": _RM},
    })


def parking(address="Storgatan 1, Stockholm"):
    return ParkingPositionV3.from_dict({"parkingPosition": {"gpsCoordinates": {"latitude": 59.3, "longitude": 18.0}, "formattedAddress": address}})


def driving_range(total=312, fuel_pct=78, engine="electric"):
    return DrivingRange.from_dict({"primaryEngineRange": {"engineType": engine, "currentFuelLevelInPercent": fuel_pct, "remainingRangeInKm": total}, "totalRangeInKm": total, "carType": engine})
