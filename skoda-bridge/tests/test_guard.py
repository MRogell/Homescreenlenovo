from skoda_bridge.guard import RateGuard, authorized

TOKEN = "t" * 40


def test_authorized_accepts_exact_bearer():
    assert authorized(f"Bearer {TOKEN}", TOKEN) is True


def test_authorized_rejects_missing_wrong_and_malformed():
    for h in (None, "", "Bearer ", "Bearer fel", f"Basic {TOKEN}", TOKEN, f"bearer {TOKEN}x", f"Bearer {TOKEN} extra"):
        assert authorized(h, TOKEN) is False, h


def test_authorized_rejects_short_configured_token():
    assert authorized("Bearer kort", "kort") is False
    assert authorized("Bearer ", "") is False


def test_guard_allows_first_call_then_blocks_until_interval_passes():
    now = [1000.0]
    g = RateGuard(600, lambda: now[0])
    assert g.too_soon() is False
    g.mark()
    assert g.too_soon() is True
    now[0] += 599
    assert g.too_soon() is True
    now[0] += 1
    assert g.too_soon() is False
