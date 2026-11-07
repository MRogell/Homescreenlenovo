import asyncio

from skoda_bridge.guard import RateGuard
from skoda_bridge.handler import BridgeState, handle_request

TOKEN = "t" * 40
ENV = {"BRIDGE_TOKEN": TOKEN, "SKODA_USERNAME": "anna@example.com", "SKODA_PASSWORD": "hemligt-lösen-123", "SKODA_VIN": "TMBXXX"}
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
    for env in ({**ENV, "BRIDGE_TOKEN": "kort"}, {k: v for k, v in ENV.items() if k != "BRIDGE_TOKEN"}):
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
    assert status == 429 and len(bad.calls) == 1


def test_cached_result_is_kept_after_a_later_failure_window():
    now = [0.0]
    state = BridgeState(RateGuard(600, lambda: now[0]))
    asyncio.run(handle_request(AUTH, ENV, state, Fetch(RESULT), lambda: "t"))
    now[0] = 700
    assert asyncio.run(handle_request(AUTH, ENV, state, Fetch(error=RuntimeError("x")), lambda: "t"))[0] == 502
    now[0] = 710
    status, body = asyncio.run(handle_request(AUTH, ENV, state, Fetch(RESULT), lambda: "t"))
    assert status == 200 and body["levelPct"] == 70  # senast kända svar före spärrens slut
