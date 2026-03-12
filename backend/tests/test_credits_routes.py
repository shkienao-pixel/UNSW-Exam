"""Tests for credits check/deduct route behavior."""

from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")

from app.main import app
from app.core.dependencies import get_current_user, get_db

client = TestClient(app, raise_server_exceptions=False)


def override_auth() -> dict[str, str]:
    return {"id": "user-123", "email": "test@example.com"}


def override_db() -> MagicMock:
    return MagicMock()


def test_check_credits_ok():
    app.dependency_overrides[get_current_user] = override_auth
    app.dependency_overrides[get_db] = override_db
    try:
        with patch("app.routers.credits.credit_service.get_balance", return_value=10):
            resp = client.post("/credits/check", json={"type_": "gen_ask"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["required"] == 3
        assert body["balance"] == 10
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


def test_check_credits_insufficient_returns_402():
    app.dependency_overrides[get_current_user] = override_auth
    app.dependency_overrides[get_db] = override_db
    try:
        with patch("app.routers.credits.credit_service.get_balance", return_value=1):
            resp = client.post("/credits/check", json={"type_": "gen_ask"})
        assert resp.status_code == 402
        body = resp.json()
        assert body["required"] == 3
        assert body["balance"] == 1
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)

