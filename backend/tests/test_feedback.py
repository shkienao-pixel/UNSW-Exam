"""Tests for the user feedback system.

Covers:
  - FeedbackCreate Pydantic validation (content length, page_url length)
  - FeedbackStatusUpdate regex pattern
  - POST /feedback   — auth required, inserts row, returns ok+id
  - GET  /admin/feedback — requires X-Admin-Secret, optional status filter
  - PATCH /admin/feedback/{id} — requires X-Admin-Secret, 404 on missing
"""

from __future__ import annotations

import sys
import os
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("SUPABASE_URL",              "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY",         "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("OPENAI_API_KEY",            "test-openai")
os.environ.setdefault("ADMIN_SECRET",              "test-admin-secret")

from pydantic import ValidationError
from app.routers.feedback import FeedbackCreate, FeedbackStatusUpdate


# ── FeedbackCreate validation ─────────────────────────────────────────────────

class TestFeedbackCreate:
    def test_valid_minimal(self):
        f = FeedbackCreate(content="bug", page_url="/courses")
        assert f.content == "bug"
        assert f.page_url == "/courses"

    def test_valid_max_content(self):
        f = FeedbackCreate(content="x" * 2000, page_url="/")
        assert len(f.content) == 2000

    def test_content_empty_rejected(self):
        with pytest.raises(ValidationError):
            FeedbackCreate(content="", page_url="/courses")

    def test_content_too_long_rejected(self):
        with pytest.raises(ValidationError):
            FeedbackCreate(content="x" * 2001, page_url="/courses")

    def test_page_url_empty_rejected(self):
        with pytest.raises(ValidationError):
            FeedbackCreate(content="good feedback", page_url="")

    def test_page_url_too_long_rejected(self):
        with pytest.raises(ValidationError):
            FeedbackCreate(content="feedback", page_url="/p" + "x" * 500)

    def test_page_url_max_boundary_accepted(self):
        url = "/" + "a" * 498  # total 499 chars
        f = FeedbackCreate(content="ok", page_url=url)
        assert len(f.page_url) == 499

    def test_unicode_content_accepted(self):
        f = FeedbackCreate(content="这个功能很棒！", page_url="/courses/c1")
        assert "棒" in f.content


# ── FeedbackStatusUpdate validation ──────────────────────────────────────────

class TestFeedbackStatusUpdate:
    def test_pending_accepted(self):
        s = FeedbackStatusUpdate(status="pending")
        assert s.status == "pending"

    def test_in_progress_accepted(self):
        s = FeedbackStatusUpdate(status="in_progress")
        assert s.status == "in_progress"

    def test_resolved_accepted(self):
        s = FeedbackStatusUpdate(status="resolved")
        assert s.status == "resolved"

    def test_invalid_status_rejected(self):
        with pytest.raises(ValidationError):
            FeedbackStatusUpdate(status="closed")

    def test_empty_status_rejected(self):
        with pytest.raises(ValidationError):
            FeedbackStatusUpdate(status="")

    def test_uppercase_rejected(self):
        with pytest.raises(ValidationError):
            FeedbackStatusUpdate(status="Pending")

    def test_typo_rejected(self):
        with pytest.raises(ValidationError):
            FeedbackStatusUpdate(status="in progress")  # space not underscore


# ── Endpoint tests ────────────────────────────────────────────────────────────

def _make_client():
    from fastapi.testclient import TestClient
    from app.main import app
    from app.core.dependencies import get_current_user, get_db
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-uuid-1", "email": "t@t.com"}
    app.dependency_overrides[get_db] = lambda: MagicMock()
    return TestClient(app, raise_server_exceptions=False)


class TestSubmitFeedback:
    """POST /feedback"""

    def test_submit_returns_201_with_id(self):
        client = _make_client()
        sb = MagicMock()
        sb.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": "fb-uuid-1"}]
        )
        from app.core.dependencies import get_db
        from app.main import app
        app.dependency_overrides[get_db] = lambda: sb

        resp = client.post("/feedback", json={"content": "找到了一个bug", "page_url": "/courses/c1"})
        assert resp.status_code == 201
        body = resp.json()
        assert body["ok"] is True
        assert body["id"] == "fb-uuid-1"

    def test_submit_inserts_correct_fields(self):
        """user_id, content, page_url must be in the insert payload."""
        client = _make_client()
        sb = MagicMock()
        sb.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": "uuid-2"}]
        )
        from app.core.dependencies import get_db
        from app.main import app
        app.dependency_overrides[get_db] = lambda: sb

        client.post("/feedback", json={"content": "test", "page_url": "/page"})
        insert_call = sb.table.return_value.insert.call_args[0][0]
        assert insert_call["content"] == "test"
        assert insert_call["page_url"] == "/page"
        assert "user_id" in insert_call

    def test_submit_without_auth_returns_401(self):
        from fastapi.testclient import TestClient
        from app.main import app
        from app.core.dependencies import get_current_user, get_db
        # Remove override so real auth runs
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides[get_db] = lambda: MagicMock()
        client = TestClient(app, raise_server_exceptions=False)

        resp = client.post("/feedback", json={"content": "hi", "page_url": "/"})
        assert resp.status_code in (401, 403)

    def test_submit_content_too_short_returns_422(self):
        client = _make_client()
        resp = client.post("/feedback", json={"content": "", "page_url": "/page"})
        assert resp.status_code == 422

    def test_submit_content_too_long_returns_422(self):
        client = _make_client()
        resp = client.post("/feedback", json={"content": "x" * 2001, "page_url": "/page"})
        assert resp.status_code == 422

    def test_empty_insert_data_returns_ok_with_none_id(self):
        """When DB returns no rows, id should be None but ok=True."""
        client = _make_client()
        sb = MagicMock()
        sb.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[])
        from app.core.dependencies import get_db
        from app.main import app
        app.dependency_overrides[get_db] = lambda: sb

        resp = client.post("/feedback", json={"content": "hello", "page_url": "/"})
        assert resp.status_code == 201
        assert resp.json()["ok"] is True
        assert resp.json()["id"] is None


class TestListFeedback:
    """GET /admin/feedback"""

    def _make_admin_client(self):
        from fastapi.testclient import TestClient
        from app.main import app
        from app.core.dependencies import get_current_user, get_db
        app.dependency_overrides[get_current_user] = lambda: {"id": "u1", "email": "t@t.com"}
        app.dependency_overrides[get_db] = lambda: MagicMock()
        return TestClient(app, raise_server_exceptions=False)

    def test_requires_admin_secret(self):
        client = self._make_admin_client()
        sb = MagicMock()
        sb.table.return_value.select.return_value.order.return_value.execute.return_value = MagicMock(data=[])
        from app.core.dependencies import get_db
        from app.main import app
        app.dependency_overrides[get_db] = lambda: sb

        resp = client.get("/admin/feedback")
        assert resp.status_code == 403

    def test_valid_secret_returns_list(self):
        client = self._make_admin_client()
        rows = [
            {"id": "1", "content": "issue", "page_url": "/", "status": "pending",
             "user_id": "u1", "created_at": "2025-01-01T00:00:00"},
        ]
        sb = MagicMock()
        (sb.table.return_value
           .select.return_value
           .order.return_value
           .execute.return_value) = MagicMock(data=rows)
        from app.core.dependencies import get_db
        from app.main import app
        app.dependency_overrides[get_db] = lambda: sb

        resp = client.get("/admin/feedback", headers={"X-Admin-Secret": "test-admin-secret"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_wrong_secret_returns_403(self):
        client = self._make_admin_client()
        resp = client.get("/admin/feedback", headers={"X-Admin-Secret": "wrong-secret"})
        assert resp.status_code == 403

    def test_status_filter_passed_to_query(self):
        """When ?status=pending is given, .eq('status', 'pending') must be called."""
        client = self._make_admin_client()
        sb = MagicMock()
        eq_mock = MagicMock()
        eq_mock.execute.return_value = MagicMock(data=[])
        (sb.table.return_value
           .select.return_value
           .order.return_value
           .eq.return_value) = eq_mock
        from app.core.dependencies import get_db
        from app.main import app
        app.dependency_overrides[get_db] = lambda: sb

        resp = client.get("/admin/feedback?status=pending",
                          headers={"X-Admin-Secret": "test-admin-secret"})
        assert resp.status_code == 200
        # eq must have been called with "status" filter
        sb.table.return_value.select.return_value.order.return_value.eq.assert_called_once_with(
            "status", "pending"
        )

    def test_no_status_filter_skips_eq(self):
        """Without ?status=, .eq() must NOT be called."""
        client = self._make_admin_client()
        sb = MagicMock()
        (sb.table.return_value
           .select.return_value
           .order.return_value
           .execute.return_value) = MagicMock(data=[])
        from app.core.dependencies import get_db
        from app.main import app
        app.dependency_overrides[get_db] = lambda: sb

        resp = client.get("/admin/feedback", headers={"X-Admin-Secret": "test-admin-secret"})
        assert resp.status_code == 200
        sb.table.return_value.select.return_value.order.return_value.eq.assert_not_called()


class TestUpdateFeedbackStatus:
    """PATCH /admin/feedback/{id}"""

    def _make_admin_client(self):
        from fastapi.testclient import TestClient
        from app.main import app
        from app.core.dependencies import get_current_user, get_db
        app.dependency_overrides[get_current_user] = lambda: {"id": "u1", "email": "t@t.com"}
        app.dependency_overrides[get_db] = lambda: MagicMock()
        return TestClient(app, raise_server_exceptions=False)

    def test_update_status_returns_ok(self):
        client = self._make_admin_client()
        sb = MagicMock()
        row_data = [{"id": "fb-1", "status": "resolved", "content": "bug", "page_url": "/"}]
        # update step — return value unused by code
        # select step — must return the row
        (sb.table.return_value
           .select.return_value
           .eq.return_value
           .execute.return_value) = MagicMock(data=row_data)
        from app.core.dependencies import get_db
        from app.main import app
        app.dependency_overrides[get_db] = lambda: sb

        resp = client.patch(
            "/admin/feedback/fb-1",
            json={"status": "resolved"},
            headers={"X-Admin-Secret": "test-admin-secret"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["status"] == "resolved"

    def test_update_missing_id_returns_404(self):
        client = self._make_admin_client()
        sb = MagicMock()
        # select step returns empty list → 404
        (sb.table.return_value
           .select.return_value
           .eq.return_value
           .execute.return_value) = MagicMock(data=[])
        from app.core.dependencies import get_db
        from app.main import app
        app.dependency_overrides[get_db] = lambda: sb

        resp = client.patch(
            "/admin/feedback/nonexistent-id",
            json={"status": "resolved"},
            headers={"X-Admin-Secret": "test-admin-secret"},
        )
        assert resp.status_code == 404

    def test_update_requires_admin_secret(self):
        client = self._make_admin_client()
        resp = client.patch("/admin/feedback/fb-1", json={"status": "resolved"})
        assert resp.status_code == 403

    def test_invalid_status_body_returns_422(self):
        client = self._make_admin_client()
        resp = client.patch(
            "/admin/feedback/fb-1",
            json={"status": "deleted"},  # not in enum
            headers={"X-Admin-Secret": "test-admin-secret"},
        )
        assert resp.status_code == 422

    def test_all_three_valid_transitions(self):
        """pending, in_progress, resolved all pass validation."""
        for status in ("pending", "in_progress", "resolved"):
            client = self._make_admin_client()
            sb = MagicMock()
            (sb.table.return_value
               .update.return_value
               .eq.return_value
               .execute.return_value) = MagicMock(
                   data=[{"id": "fb-1", "status": status, "content": "x", "page_url": "/"}]
               )
            from app.core.dependencies import get_db
            from app.main import app
            app.dependency_overrides[get_db] = lambda: sb

            resp = client.patch(
                "/admin/feedback/fb-1",
                json={"status": status},
                headers={"X-Admin-Secret": "test-admin-secret"},
            )
            assert resp.status_code == 200, f"status={status} should return 200"
