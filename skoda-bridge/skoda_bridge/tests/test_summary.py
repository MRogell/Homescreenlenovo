from skoda_bridge.summary import summarize
from conftest import air_conditioning, charging, driving_range, parking, status


def test_electric_car_full_data():
    r = summarize(charging(), status(), parking(), driving_range())
    assert r == {"rangeKm": 312, "levelPct": 78, "levelKind": "battery", "locked": True, "charging": False, "parked": "Storgatan 1, Stockholm",
                 "chargeMinutesLeft": None, "chargeKw": None, "chargeTargetPct": None,
                 "doorsOpen": False, "windowsOpen": False, "trunkOpen": False, "bonnetOpen": False, "capturedAt": None,
                 "climateOn": None, "climateTargetC": None, "climateReadyAt": None}


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
    assert summarize(None, None, None, None) == {"rangeKm": None, "levelPct": None, "levelKind": "fuel", "locked": None, "charging": False, "parked": None,
                                                 "chargeMinutesLeft": None, "chargeKw": None, "chargeTargetPct": None, "doorsOpen": None, "windowsOpen": None, "trunkOpen": None, "bonnetOpen": None, "capturedAt": None, "climateOn": None, "climateTargetC": None, "climateReadyAt": None}


def test_partial_failure_keeps_the_other_fields():
    r = summarize(charging(), None, None, None)
    assert r["levelPct"] == 78 and r["locked"] is None and r["parked"] is None


def test_blank_address_becomes_none():
    assert summarize(None, None, parking(address="  "), None)["parked"] is None


def test_charging_details_while_charging():
    r = summarize(charging(state="CHARGING", power_kw=11.04, minutes_left=95, target=80), status(), None, None)
    assert r["chargeMinutesLeft"] == 95 and r["chargeKw"] == 11.0 and r["chargeTargetPct"] == 80


def test_charge_time_and_power_are_hidden_when_not_charging_but_target_is_kept():
    r = summarize(charging(power_kw=0.0, minutes_left=0, target=80), status(), None, None)
    assert r["chargeMinutesLeft"] is None and r["chargeKw"] is None and r["chargeTargetPct"] == 80


def test_open_doors_windows_trunk_and_bonnet():
    r = summarize(None, status(doors="OPEN", windows="OPEN", trunk="OPEN", bonnet="OPEN"), None, None)
    assert (r["doorsOpen"], r["windowsOpen"], r["trunkOpen"], r["bonnetOpen"]) == (True, True, True, True)


def test_unsupported_or_unknown_openings_are_none_never_closed():
    r = summarize(None, status(doors="UNKNOWN", windows="UNSUPPORTED", trunk="UNKNOWN", bonnet="UNSUPPORTED"), None, None)
    assert (r["doorsOpen"], r["windowsOpen"], r["trunkOpen"], r["bonnetOpen"]) == (None, None, None, None)


def test_captured_at_is_iso_with_timezone():
    r = summarize(None, status(captured="2026-11-08T13:32:10.000Z"), None, None)
    assert r["capturedAt"].startswith("2026-11-08T13:32:10") and r["capturedAt"].endswith("+00:00")


def test_captured_at_falls_back_to_charging_timestamp():
    c = charging()
    c.car_captured_timestamp = status(captured="2026-11-08T12:00:00Z").car_captured_timestamp
    assert summarize(c, None, None, None)["capturedAt"].startswith("2026-11-08T12:00:00")


def test_climate_states():
    for st in ("ON", "HEATING", "COOLING", "VENTILATION", "HEATING_AUXILIARY"):
        assert summarize(None, None, None, None, air_conditioning(st))["climateOn"] is True
    assert summarize(None, None, None, None, air_conditioning("OFF"))["climateOn"] is False
    assert summarize(None, None, None, None, air_conditioning("INVALID"))["climateOn"] is None
    assert summarize(None, None, None, None, None)["climateOn"] is None


def test_climate_target_and_ready_at():
    r = summarize(None, None, None, None, air_conditioning("HEATING", target=21.5, ready_at="2026-11-08T06:45:00Z"))
    assert r["climateTargetC"] == 21.5
    assert r["climateReadyAt"].startswith("2026-11-08T06:45:00") and r["climateReadyAt"].endswith("+00:00")


def test_ready_at_hidden_when_climate_off():
    r = summarize(None, None, None, None, air_conditioning("OFF", ready_at="2026-11-08T06:45:00Z"))
    assert r["climateReadyAt"] is None and r["climateTargetC"] == 21.0


def test_level_and_range_come_from_the_same_newest_source_driving_range():
    # Laddningsdelen är gammal (89 % / 319 km), räckviddsdelen färsk (87 % / 314 km) som i Škoda-appen.
    r = summarize(charging(soc=89, range_m=319_000, captured="2026-11-08T08:00:00Z"), status(), None,
                  driving_range(total=314, soc=87, captured="2026-11-08T09:44:00Z"))
    assert (r["levelPct"], r["rangeKm"], r["levelKind"]) == (87, 314, "battery")


def test_newer_charging_data_wins_while_charging():
    r = summarize(charging(soc=60, range_m=220_000, state="CHARGING", captured="2026-11-08T10:00:00Z"), status(), None,
                  driving_range(total=200, soc=55, captured="2026-11-08T09:30:00Z"))
    assert (r["levelPct"], r["rangeKm"]) == (60, 220)


def test_same_or_missing_timestamps_prefer_driving_range():
    r = summarize(charging(soc=89, range_m=319_000), status(), None, driving_range(total=314, soc=87))
    assert (r["levelPct"], r["rangeKm"]) == (87, 314)


def test_driving_range_without_soc_falls_back_to_charging_level_but_keeps_pairing():
    r = summarize(charging(soc=78, range_m=312_000), status(), None, driving_range(total=300))
    assert (r["levelPct"], r["rangeKm"]) == (78, 312)
