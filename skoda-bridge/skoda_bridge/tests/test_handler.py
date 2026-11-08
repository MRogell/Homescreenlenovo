import asyncio

from skoda_bridge.guard import RateGuard
from skoda_bridge.handler import BridgeState, handle_request

TOKEN = "t" * 40
ENV = {"SKODA_BRIDGE_TOKEN": TOKEN, "SKODA_USERNAME": "anna@example.com", "SKODA_PASSWORD": "hemligt-lösen-123", "SKODA_VIN": "TMBXXX"}
AUTH = f"Bearer {TOKEN}"
RESULT = {"rangeKm": 300, "levelPct": 70, "levelKind": "battery", "locked": True, "charging": False, "parked": "Hemma"}


class Fetch:
    def __init__(self, result=None, error=None):
        self.calls = []
        self.result, self.error = result, error

    async def __call__(self, email, password, vin):
        self.calls.append((email, password, vin))
        if self.error:
            raise self.error
        return dict(self.result)


def run(auth=AUTH, env=ENV, state=None, fetch=None):
    state = state or BridgeState(RateGuard(600, lambda: 0.0))
    fetch = fetch or Fetch(RESULT)
    return asyncio.run(handle_request(auth, env, state, fetch, lambda: "2026-11-07T20:00:00+00:00")), fetch, state


def test_success_returns_fields_and_timestamp_and_passes_credentials_to_fetch():
    (status, body), fetch, _ = run()
    assert status == 200
    assert body == {**RESULT, "fetchedAt": "2026-11-07T20:00:00+00:00"}
    assert fetch.calls == [("anna@example.com", "hemligt-lösen-123", "TMBXXX")]


def test_unauthorized_is_401_and_never_calls_skoda():
    for auth in (None, "Bearer fel", "Basic abc"):
        (status, body), fetch, _ = run(auth=auth)
        assert status == 401 and fetch.calls == [] and "error" in body


def test_short_or_missing_bridge_token_is_500_even_with_matching_header():
    for env in ({**ENV, "SKODA_BRIDGE_TOKEN": "kort"}, {k: v for k, v in ENV.items() if k != "SKODA_BRIDGE_TOKEN"}):
        (status, _), fetch, _ = run(auth="Bearer kort", env=env)
        assert status == 500 and fetch.calls == []


def test_missing_skoda_credentials_is_500():
    for missing in ("SKODA_USERNAME", "SKODA_PASSWORD"):
        (status, body), fetch, _ = run(env={k: v for k, v in ENV.items() if k != missing})
        assert status == 500 and fetch.calls == []
        assert missing not in body["error"]


def test_vin_is_optional():
    env = {k: v for k, v in ENV.items() if k != "SKODA_VIN"}
    _, fetch, _ = run(env=env)
    assert fetch.calls[0][2] is None


def test_second_call_within_interval_returns_cached_without_new_login():
    state = BridgeState(RateGuard(600, lambda: 0.0))
    fetch = Fetch(RESULT)
    first = asyncio.run(handle_request(AUTH, ENV, state, fetch, lambda: "2026-11-07T20:00:00+00:00"))
    second = asyncio.run(handle_request(AUTH, ENV, state, fetch, lambda: "2026-11-07T20:05:00+00:00"))
    assert first[0] == second[0] == 200
    assert second[1]["fetchedAt"] == "2026-11-07T20:00:00+00:00"  # det gamla svaret, inte en ny hämtning
    assert len(fetch.calls) == 1


def test_call_after_interval_logs_in_again():
    now = [0.0]
    state = BridgeState(RateGuard(600, lambda: now[0]))
    fetch = Fetch(RESULT)
    asyncio.run(handle_request(AUTH, ENV, state, fetch, lambda: "a"))
    now[0] = 601
    asyncio.run(handle_request(AUTH, ENV, state, fetch, lambda: "b"))
    assert len(fetch.calls) == 2


def test_failure_gives_502_and_does_not_leak_credentials():
    fetch = Fetch(error=RuntimeError("login misslyckades för anna@example.com med hemligt-lösen-123"))
    (status, body), _, _ = run(fetch=fetch)
    assert status == 502
    text = str(body)
    assert "anna@example.com" not in text and "hemligt" not in text and "misslyckades" not in text


def test_failed_attempt_still_counts_so_skoda_is_not_hammered():
    state = BridgeState(RateGuard(600, lambda: 0.0))
    bad = Fetch(error=RuntimeError("x"))
    assert asyncio.run(handle_request(AUTH, ENV, state, bad, lambda: "t"))[0] == 502
    status, body = asyncio.run(handle_request(AUTH, ENV, state, bad, lambda: "t"))
    # Ingen ny inloggning, och samma felorsak som nyss (inte "väntar"), så att användaren ser det verkliga problemet.
    assert status == 502 and body == {"error": "Škoda svarade inte"} and len(bad.calls) == 1


def test_throttled_without_any_previous_attempt_result_is_429():
    state = BridgeState(RateGuard(600, lambda: 0.0))
    state.guard.mark()  # t.ex. en annan förfrågan som fortfarande pågår
    status, _ = asyncio.run(handle_request(AUTH, ENV, state, Fetch(RESULT), lambda: "t"))
    assert status == 429


def test_after_a_failure_old_data_is_not_served_as_fresh():
    now = [0.0]
    state = BridgeState(RateGuard(600, lambda: now[0]))
    asyncio.run(handle_request(AUTH, ENV, state, Fetch(RESULT), lambda: "t"))
    now[0] = 700
    assert asyncio.run(handle_request(AUTH, ENV, state, Fetch(error=RuntimeError("x")), lambda: "t"))[0] == 502
    now[0] = 710
    # Appen har egen senast kända data och visar den som "Ej tillgänglig"; bryggan ska inte låtsas att gammal data är ny.
    assert asyncio.run(handle_request(AUTH, ENV, state, Fetch(RESULT), lambda: "t"))[0] == 502
    now[0] = 1301
    status, body = asyncio.run(handle_request(AUTH, ENV, state, Fetch(RESULT), lambda: "ny"))
    assert status == 200 and body["fetchedAt"] == "ny"  # efter spärren: ny inloggning och färsk data


def test_old_bridge_token_name_still_works():
    env = {k: v for k, v in ENV.items() if k != "SKODA_BRIDGE_TOKEN"} | {"BRIDGE_TOKEN": TOKEN}
    (status, _), _, _ = run(env=env)
    assert status == 200


def test_misconfigured_reason_names_variable_but_never_value():
    short = {**ENV, "SKODA_BRIDGE_TOKEN": "kort-hemligt"}
    (_, body), _, _ = run(auth="Bearer kort-hemligt", env=short)
    assert body["reason"] == "SKODA_BRIDGE_TOKEN är kortare än 32 tecken"
    assert "kort-hemligt" not in str(body)
    (_, body), _, _ = run(env={k: v for k, v in ENV.items() if k != "SKODA_BRIDGE_TOKEN"})
    assert body["reason"] == "SKODA_BRIDGE_TOKEN saknas"
    (_, body), _, _ = run(env={k: v for k, v in ENV.items() if k != "SKODA_PASSWORD"})
    assert body["reason"] == "SKODA_PASSWORD saknas"
    assert ENV["SKODA_USERNAME"] not in str(body)
