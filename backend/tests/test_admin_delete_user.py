"""Tests for admin delete-user behavior."""

from __future__ import annotations

import os
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import httpx
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")

from app.main import app
from app.core.dependencies import get_db

client = TestClient(app, raise_server_exceptions=False)


def override_db() -> MagicMock:
    return MagicMock()


def test_admin_delete_user_404_treated_as_already_deleted():
    fake_settings = SimpleNamespace(
        supabase_url="https://test.supabase.co",
        supabase_service_role_key="service-key",
        admin_secrets_set={"secret-1"},
    )

    req = httpx.Request("DELETE", "https://test.supabase.co/auth/v1/admin/users/u1")
    resp = httpx.Response(404, request=req, text='{"message":"Not Found"}')
    not_found = httpx.HTTPStatusError("Not Found", request=req, response=resp)

    app.dependency_overrides[get_db] = override_db
    try:
        with (
            patch("app.routers.admin.get_settings", return_value=fake_settings),
            patch("httpx.delete", side_effect=not_found),
        ):
            r = client.delete("/admin/users/u1", headers={"X-Admin-Secret": "secret-1"})

        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["id"] == "u1"
        assert body["already_deleted"] is True
    finally:
        app.dependency_overrides.pop(get_db, None)

