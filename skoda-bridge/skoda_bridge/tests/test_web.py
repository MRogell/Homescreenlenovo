import json
import threading
import urllib.error
import urllib.request
from http.server import HTTPServer

from skoda_bridge.guard import RateGuard
from skoda_bridge.handler import BridgeState
from skoda_bridge.web import build_handler

TOKEN = "t" * 40
ENV = {"SKODA_BRIDGE_TOKEN": TOKEN, "SKODA_USERNAME": "a@example.com", "SKODA_PASSWORD": "pw"}


def serve(fetch):
    cls = build_handler(BridgeState(RateGuard(600, lambda: 0.0)), fetch, ENV)
    srv = HTTPServer(("127.0.0.1", 0), cls)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


async def ok_fetch(email, password, vin, command=None):
    return {"rangeKm": 1, "levelPct": 2, "levelKind": "battery", "locked": None, "charging": False, "parked": None}


def get(url, token=None):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"} if token else {})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read()), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read()), dict(e.headers)


def test_authorized_get_returns_json_with_no_store():
    srv, base = serve(ok_fetch)
    try:
        status, body, headers = get(base + "/api/skoda", TOKEN)
        assert status == 200 and body["levelPct"] == 2 and "fetchedAt" in body
        assert headers["Content-Type"].startswith("application/json")
        assert headers["Cache-Control"] == "no-store"
    finally:
        srv.shutdown()


def test_missing_token_is_401():
    srv, base = serve(ok_fetch)
    try:
        assert get(base + "/api/skoda")[0] == 401
    finally:
        srv.shutdown()


def test_unknown_path_is_404_without_calling_skoda():
    calls = []

    async def f(*a):
        calls.append(a)
        return {}

    srv, base = serve(f)
    try:
        assert get(base + "/annat", TOKEN)[0] == 404
        assert calls == []
    finally:
        srv.shutdown()


def post(url, data, token=TOKEN, ctype="application/json"):
    req = urllib.request.Request(url, data=data, method="POST", headers={"Authorization": f"Bearer {token}", "Content-Type": ctype})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def test_post_command_round_trip():
    seen = []

    async def fetch(email, password, vin, command=None):
        seen.append(command)
        return await ok_fetch(email, password, vin)

    srv, base = serve(fetch)
    try:
        status, body = post(base + "/api/skoda", json.dumps({"climate": "start", "temperatureC": 21}).encode())
        assert status == 200 and body["levelPct"] == 2 and seen == [{"climate": "start", "temperatureC": 21.0}]
    finally:
        srv.shutdown()


def test_post_non_json_is_400():
    srv, base = serve(ok_fetch)
    try:
        assert post(base + "/api/skoda", b"inte json")[0] == 400
    finally:
        srv.shutdown()


def test_post_body_over_4kb_is_400():
    srv, base = serve(ok_fetch)
    try:
        big = json.dumps({"climate": "stop", "pad": "x" * 5000}).encode()
        assert post(base + "/api/skoda", big)[0] == 400
    finally:
        srv.shutdown()


def test_post_other_path_is_404():
    srv, base = serve(ok_fetch)
    try:
        assert post(base + "/api/annat", b"{}")[0] == 404
    finally:
        srv.shutdown()
