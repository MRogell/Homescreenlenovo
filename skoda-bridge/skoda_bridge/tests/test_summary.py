from skoda_bridge.summary import summarize
from conftest import charging, driving_range, parking, status


def test_electric_car_full_data():
    r = summarize(charging(), status(), parking(), driving_range())
    assert r == {"rangeKm": 312, "levelPct": 78, "levelKind": "battery", "locked": True, "charging": False, "parked": "Storgatan 1, Stockholm"}


def test_charging_state_sets_charging_flag():
    assert summarize(charging(state="CHARGING"), status(), parking(), driving_range())["charging"] is True


def test_petrol_car_without_charging_data_uses_fuel_level():
    r = summarize(None, status(), parking(), driving_range(total=640, fuel_pct=55, engine="gasoline"))
    assert r["levelKind"] == "fuel"
    assert r["levelPct"] == 55
    assert r["rangeKm"] == 640
    assert r["charging"] is False


def test_charging_response_without_status_falls_back_to_driving_range():
    r = summarize(charging(battery=False), status(), parking(), driving_range(total=500, fuel_pct=40, engine="gasoline"))
    assert r["levelKind"] == "fuel" and r["levelPct"] == 40


def test_range_falls_back_to_battery_range_in_km():
    r = summarize(charging(range_m=250_400), status(), parking(), None)
    assert r["rangeKm"] == 250
    assert r["levelPct"] == 78


def test_locked_states():
    assert summarize(None, status("YES"), None, None)["locked"] is True
    assert summarize(None, status("NO"), None, None)["locked"] is False
    assert summarize(None, status("OPENED"), None, None)["locked"] is False
    assert summarize(None, status("TRUNK_OPENED"), None, None)["locked"] is False


def test_unknown_lock_state_is_none_not_false():
    assert summarize(None, status("UNKNOWN"), None, None)["locked"] is None


def test_everything_missing_gives_nulls():
    assert summarize(None, None, None, None) == {"rangeKm": None, "levelPct": None, "levelKind": "fuel", "locked": None, "charging": False, "parked": None}


def test_partial_failure_keeps_the_other_fields():
    r = summarize(charging(), None, None, None)
    assert r["levelPct"] == 78 and r["locked"] is None and r["parked"] is None


def test_blank_address_becomes_none():
    assert summarize(None, None, parking(address="  "), None)["parked"] is None
