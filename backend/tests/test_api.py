"""Request handling that runs before any database call: auth, signatures, error shape."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_protected_routes_require_bearer_token():
    for method, path in [("post", "/api/match"), ("post", "/api/apply/smart"), ("get", "/api/usage/me"),
                         ("get", "/api/admin/users"), ("post", "/api/hire/activate"),
                         ("get", "/api/ai/settings"), ("post", "/api/ai/key"), ("delete", "/api/ai/key")]:
        res = client.request(method.upper(), path, json={} if method == "post" else None)
        assert res.status_code == 401, path
        assert res.json() == {"error": "Unauthorized"}


def test_webhooks_reject_bad_signatures():
    assert client.post("/api/webhooks/razorpay", content=b"{}", headers={"x-razorpay-signature": "nope"}).status_code == 401
    assert client.post("/api/webhooks/lemonsqueezy", content=b"{}", headers={"x-signature": "nope"}).status_code == 401


def test_cron_requires_secret():
    assert client.post("/api/cron/sync").status_code == 401
    assert client.post("/api/cron/sync", headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_cors_allows_frontend_origin_only():
    ok = client.options("/api/match", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    bad = client.options("/api/match", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in bad.headers
