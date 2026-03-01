"""Integration-style route tests using FastAPI TestClient with mocked Supabase."""

from __future__ import annotations

import json
import sys
import os
from unittest.mock import MagicMock, patch
from typing import Any

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Patch settings before app import so it doesn't require real .env
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")

from fastapi.testclient import TestClient

from app.main import app
from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import AuthError


# ── Mock helpers ──────────────────────────────────────────────────────────────

MOCK_USER = {"id": "user-uuid-123", "email": "test@example.com"}

NOW_ISO = "2025-01-01T00:00:00"

MOCK_COURSE = {
    "id": "course-uuid-abc",
    "code": "COMP9900",
    "name": "Capstone Project",
    "created_at": NOW_ISO,
    "updated_at": NOW_ISO,
}


def mock_supabase() -> MagicMock:
    """Return a MagicMock that mimics the Supabase client interface."""
    sb = MagicMock()
    # table chain: .table(...).select(...).limit(...).execute()
    sb.table.return_value.select.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
    return sb


def override_auth() -> dict[str, Any]:
    return MOCK_USER


def override_db() -> MagicMock:
    return mock_supabase()


# Apply overrides for all tests
app.dependency_overrides[get_current_user] = override_auth
app.dependency_overrides[get_db] = override_db

client = TestClient(app, raise_server_exceptions=False)


# ── /health ───────────────────────────────────────────────────────────────────

class TestHealth:
    def test_returns_ok(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"

    def test_response_has_supabase_field(self):
        resp = client.get("/health")
        assert "supabase" in resp.json()


# ── /courses ──────────────────────────────────────────────────────────────────

class TestCourseList:
    def test_returns_list(self):
        with patch("app.services.course_service.list_courses", return_value=[MOCK_COURSE]):
            resp = client.get("/courses")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_unauthenticated_returns_401(self):
        # Temporarily remove auth override
        app.dependency_overrides.pop(get_current_user)
        try:
            resp = client.get("/courses")
            # Without a Bearer token, should get 401 or 403
            assert resp.status_code in (401, 403)
        finally:
            app.dependency_overrides[get_current_user] = override_auth


# ── /auth ─────────────────────────────────────────────────────────────────────

class TestAuthRoutes:
    def test_login_calls_supabase(self):
        """POST /auth/login should call sign_in_with_password."""
        mock_session = MagicMock()
        mock_session.access_token = "access-tok"
        mock_session.refresh_token = "refresh-tok"
        mock_session.expires_in = 3600

        mock_resp = MagicMock()
        mock_resp.session = mock_session

        sb = mock_supabase()
        sb.auth.sign_in_with_password.return_value = mock_resp

        app.dependency_overrides[get_db] = lambda: sb
        resp = client.post("/auth/login", json={"email": "a@b.com", "password": "pass123"})
        app.dependency_overrides[get_db] = override_db

        assert resp.status_code == 200
        body = resp.json()
        assert body["access_token"] == "access-tok"
        assert body["refresh_token"] == "refresh-tok"

    def test_login_invalid_credentials_returns_401(self):
        """If Supabase returns session=None, should 401."""
        mock_resp = MagicMock()
        mock_resp.session = None

        sb = mock_supabase()
        sb.auth.sign_in_with_password.return_value = mock_resp

        app.dependency_overrides[get_db] = lambda: sb
        resp = client.post("/auth/login", json={"email": "bad@bad.com", "password": "wrong"})
        app.dependency_overrides[get_db] = override_db

        assert resp.status_code == 401

    def test_me_returns_current_user(self):
        resp = client.get("/auth/me", headers={"Authorization": "Bearer fake-token"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == MOCK_USER["id"]
        assert body["email"] == MOCK_USER["email"]

    def test_logout_returns_204(self):
        sb = mock_supabase()
        app.dependency_overrides[get_db] = lambda: sb
        resp = client.post("/auth/logout", headers={"Authorization": "Bearer fake-token"})
        app.dependency_overrides[get_db] = override_db
        assert resp.status_code == 204


# ── /courses/{id}/generate/translate ─────────────────────────────────────────

class TestTranslateRoute:
    def test_empty_texts_returns_empty(self):
        """Empty input should return empty translations without calling OpenAI."""
        with patch("app.services.course_service.get_course", return_value=MOCK_COURSE):
            resp = client.post(
                f"/courses/{MOCK_COURSE['id']}/generate/translate",
                json={"texts": [], "target_lang": "en"},
            )
        assert resp.status_code == 200
        assert resp.json()["translations"] == []

    def test_translate_calls_openai(self):
        """Non-empty texts should hit OpenAI mock and return translations."""
        mock_openai = MagicMock()
        mock_choice = MagicMock()
        mock_choice.message.content = '["Hello","World"]'
        mock_openai.chat.completions.create.return_value = MagicMock(choices=[mock_choice])

        with (
            patch("app.services.course_service.get_course", return_value=MOCK_COURSE),
            patch("app.routers.generate.get_settings") as mock_settings,
            patch("openai.OpenAI", return_value=mock_openai),
        ):
            mock_settings.return_value.openai_api_key = "test-key"
            resp = client.post(
                f"/courses/{MOCK_COURSE['id']}/generate/translate",
                json={"texts": ["你好", "世界"], "target_lang": "en"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["translations"]) == 2


# ── 404 handling ──────────────────────────────────────────────────────────────

class TestNotFound:
    def test_unknown_route_returns_404(self):
        resp = client.get("/this/does/not/exist")
        assert resp.status_code == 404
