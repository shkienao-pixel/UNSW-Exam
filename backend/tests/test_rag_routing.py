"""Tests for data-centric RAG routing logic.

Covers:
  - _resolve_artifact_ids() priority / fallback / None-return logic
  - get_artifact_ids_by_doc_type() DB query behaviour
  - Per-endpoint routing rules (strict vs. fallback)
  - Knowledge router revision-strict routing
  - Error messages when no matching doc_type found
"""

from __future__ import annotations

import sys
import os
from unittest.mock import MagicMock, patch, call

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("SUPABASE_URL",              "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY",         "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("OPENAI_API_KEY",            "test-openai")
os.environ.setdefault("ADMIN_SECRET",              "test-admin-secret")

from app.routers.generate import _resolve_artifact_ids
from app.services.rag_service import get_artifact_ids_by_doc_type
from app.core.exceptions import AppError


# ── Supabase mock helpers ─────────────────────────────────────────────────────

def _make_sb(rows: list[dict]) -> MagicMock:
    """Mock supabase client whose .table().select()...execute() returns rows."""
    sb = MagicMock()
    exec_mock = MagicMock()
    exec_mock.data = rows
    (sb.table.return_value
       .select.return_value
       .eq.return_value
       .eq.return_value
       .in_.return_value
       .execute.return_value) = exec_mock
    return sb


# ── get_artifact_ids_by_doc_type ──────────────────────────────────────────────

class TestGetArtifactIdsByDocType:
    def test_returns_ids_for_matching_doc_type(self):
        sb = _make_sb([{"id": 1}, {"id": 2}, {"id": 3}])
        result = get_artifact_ids_by_doc_type(sb, "course-1", ["revision"])
        assert result == [1, 2, 3]

    def test_returns_empty_list_when_no_matches(self):
        sb = _make_sb([])
        result = get_artifact_ids_by_doc_type(sb, "course-1", ["revision"])
        assert result == []

    def test_returns_empty_list_for_empty_doc_types(self):
        sb = _make_sb([])
        result = get_artifact_ids_by_doc_type(sb, "course-1", [])
        assert result == []

    def test_multiple_doc_types_passed(self):
        """Multiple types (e.g. lecture+tutorial) should be passed to .in_()."""
        sb = MagicMock()
        exec_mock = MagicMock()
        exec_mock.data = [{"id": 10}, {"id": 11}]
        chain = (sb.table.return_value
                   .select.return_value
                   .eq.return_value
                   .eq.return_value
                   .in_.return_value)
        chain.execute.return_value = exec_mock

        result = get_artifact_ids_by_doc_type(sb, "course-2", ["lecture", "tutorial"])
        assert result == [10, 11]
        # .in_ was called with "doc_type" and the list
        sb.table.return_value.select.return_value.eq.return_value.eq.return_value.in_.assert_called_once_with(
            "doc_type", ["lecture", "tutorial"]
        )

    def test_queries_only_approved_status(self):
        """Must filter status=approved to avoid using un-reviewed files."""
        sb = MagicMock()
        exec_mock = MagicMock()
        exec_mock.data = []
        # We capture the .eq calls
        eq_chain = MagicMock()
        eq_chain.eq.return_value = eq_chain
        eq_chain.in_.return_value.execute.return_value = exec_mock
        sb.table.return_value.select.return_value.eq.return_value = eq_chain

        get_artifact_ids_by_doc_type(sb, "course-3", ["revision"])
        # Verify eq was called with "status", "approved"
        eq_calls = [str(c) for c in eq_chain.eq.call_args_list]
        assert any("approved" in c for c in eq_calls)


# ── _resolve_artifact_ids ─────────────────────────────────────────────────────

class TestResolveArtifactIds:
    """Test resolution priority: explicit > scope_set > doc_type routing > None."""

    # 1. Explicit artifact_ids always win
    def test_explicit_artifact_ids_returned_directly(self):
        sb = MagicMock()
        result = _resolve_artifact_ids(sb, "u1", "c1", None, [1, 2, 3])
        assert result == [1, 2, 3]
        sb.table.assert_not_called()   # no DB hit needed

    def test_explicit_ids_override_scope_set(self):
        sb = MagicMock()
        result = _resolve_artifact_ids(sb, "u1", "c1", scope_set_id=5, artifact_ids=[9])
        assert result == [9]

    def test_explicit_ids_override_doc_type_routing(self):
        sb = MagicMock()
        result = _resolve_artifact_ids(
            sb, "u1", "c1", None, [7],
            priority_doc_types=["revision"],
        )
        assert result == [7]

    # 2. Scope set resolution
    def test_scope_set_ids_returned_when_no_explicit(self):
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{"id": 5, "artifact_ids": [10, 11], "course_id": "c1", "name": "s", "is_default": False,
                   "created_at": "2025-01-01", "updated_at": "2025-01-01"}]
        )
        with patch("app.routers.generate.get_scope_set", return_value={"artifact_ids": [10, 11]}):
            result = _resolve_artifact_ids(sb, "u1", "c1", scope_set_id=5, artifact_ids=None)
        assert result == [10, 11]

    def test_scope_set_empty_returns_none(self):
        with patch("app.routers.generate.get_scope_set", return_value={"artifact_ids": []}):
            sb = MagicMock()
            result = _resolve_artifact_ids(sb, "u1", "c1", scope_set_id=5, artifact_ids=None)
        assert result is None

    # 3. Doc-type priority routing
    def test_priority_doc_type_found_returns_ids(self):
        sb = MagicMock()
        with patch(
            "app.routers.generate.get_artifact_ids_by_doc_type",
            return_value=[20, 21],
        ):
            result = _resolve_artifact_ids(
                sb, "u1", "c1", None, None,
                priority_doc_types=["revision"],
            )
        assert result == [20, 21]

    def test_priority_not_found_fallback_used(self):
        sb = MagicMock()
        call_results = {
            ("revision",): [],
            ("lecture", "tutorial"): [30, 31],
        }
        def fake_get(sb_, course_id, doc_types):
            return call_results.get(tuple(doc_types), [])

        with patch("app.routers.generate.get_artifact_ids_by_doc_type", side_effect=fake_get):
            result = _resolve_artifact_ids(
                sb, "u1", "c1", None, None,
                priority_doc_types=["revision"],
                fallback_doc_types=["lecture", "tutorial"],
            )
        assert result == [30, 31]

    def test_priority_not_found_no_fallback_returns_none(self):
        """When fallback_doc_types=None, return None (full corpus search)."""
        sb = MagicMock()
        with patch("app.routers.generate.get_artifact_ids_by_doc_type", return_value=[]):
            result = _resolve_artifact_ids(
                sb, "u1", "c1", None, None,
                priority_doc_types=["past_exam"],
                fallback_doc_types=None,
            )
        assert result is None

    def test_both_priority_and_fallback_empty_returns_none(self):
        sb = MagicMock()
        with patch("app.routers.generate.get_artifact_ids_by_doc_type", return_value=[]):
            result = _resolve_artifact_ids(
                sb, "u1", "c1", None, None,
                priority_doc_types=["revision"],
                fallback_doc_types=["lecture"],
            )
        assert result is None

    def test_no_filters_returns_none_full_corpus(self):
        sb = MagicMock()
        result = _resolve_artifact_ids(sb, "u1", "c1", None, None)
        assert result is None


# ── Per-endpoint routing rules ────────────────────────────────────────────────

class TestEndpointRoutingRules:
    """Verify each endpoint calls _resolve_artifact_ids with the correct doc_type config.

    We patch _resolve_artifact_ids and check which priority_doc_types / fallback_doc_types
    it receives when scope_set_id and artifact_ids are both None.
    """

    def _make_route_client(self):
        from fastapi.testclient import TestClient
        from app.main import app
        from app.core.dependencies import get_current_user, get_db
        app.dependency_overrides[get_current_user] = lambda: {"id": "u1", "email": "t@t.com"}
        app.dependency_overrides[get_db] = lambda: MagicMock()
        return TestClient(app, raise_server_exceptions=False)

    def _call_generate(self, client, endpoint: str):
        with (
            patch("app.services.course_service.get_course", return_value={"id": "c1"}),
            patch("app.routers.generate._resolve_artifact_ids", return_value=None) as mock_resolve,
            patch("app.routers.generate._get_context", return_value=("", [])),
            patch("app.routers.generate._get_openai_key", return_value="key"),
        ):
            client.post(f"/courses/c1/generate/{endpoint}", json={})
            return mock_resolve

    # quiz → past_exam strict
    def test_quiz_uses_past_exam_priority_no_fallback(self):
        client = self._make_route_client()
        mock_resolve = self._call_generate(client, "quiz")
        _, kwargs = mock_resolve.call_args
        assert kwargs.get("priority_doc_types") == ["past_exam"]
        assert kwargs.get("fallback_doc_types") is None

    # outline → revision strict
    def test_outline_uses_revision_priority_no_fallback(self):
        client = self._make_route_client()
        mock_resolve = self._call_generate(client, "outline")
        _, kwargs = mock_resolve.call_args
        assert kwargs.get("priority_doc_types") == ["revision"]
        assert kwargs.get("fallback_doc_types") is None

    # summary → lecture with tutorial fallback
    def test_summary_uses_lecture_priority_with_fallback(self):
        client = self._make_route_client()
        mock_resolve = self._call_generate(client, "summary")
        _, kwargs = mock_resolve.call_args
        assert kwargs.get("priority_doc_types") == ["lecture"]
        assert kwargs.get("fallback_doc_types") == ["tutorial"]

    # flashcards → lecture with tutorial fallback
    def test_flashcards_uses_lecture_priority_with_fallback(self):
        client = self._make_route_client()
        mock_resolve = self._call_generate(client, "flashcards")
        _, kwargs = mock_resolve.call_args
        assert kwargs.get("priority_doc_types") == ["lecture"]
        assert kwargs.get("fallback_doc_types") == ["tutorial"]


# ── Error messages when no matching docs ──────────────────────────────────────

class TestDocTypeErrorMessages:
    def _make_client(self):
        from fastapi.testclient import TestClient
        from app.main import app
        from app.core.dependencies import get_current_user, get_db
        app.dependency_overrides[get_current_user] = lambda: {"id": "u1", "email": "t@t.com"}
        app.dependency_overrides[get_db] = lambda: MagicMock()
        return TestClient(app, raise_server_exceptions=False)

    def test_quiz_no_past_exam_returns_meaningful_error(self):
        client = self._make_client()
        with (
            patch("app.services.course_service.get_course", return_value={"id": "c1"}),
            patch("app.routers.generate._resolve_artifact_ids", return_value=None),
            patch("app.routers.generate._get_context", return_value=("", [])),
            patch("app.routers.generate._get_openai_key", return_value="key"),
        ):
            resp = client.post("/courses/c1/generate/quiz", json={})
        assert resp.status_code in (400, 422)
        body = resp.json()
        detail = body.get("detail", "")
        assert "往年考题" in detail or "past_exam" in detail

    def test_outline_no_revision_returns_meaningful_error(self):
        client = self._make_client()
        with (
            patch("app.services.course_service.get_course", return_value={"id": "c1"}),
            patch("app.routers.generate._resolve_artifact_ids", return_value=None),
            patch("app.routers.generate._get_context", return_value=("", [])),
            patch("app.routers.generate._get_openai_key", return_value="key"),
        ):
            resp = client.post("/courses/c1/generate/outline", json={})
        assert resp.status_code in (400, 422)
        body = resp.json()
        detail = body.get("detail", "")
        assert "复习总结" in detail or "revision" in detail


# ── Knowledge router revision-strict routing ──────────────────────────────────

class TestKnowledgeRoutingRevisionStrict:
    def _make_client(self):
        from fastapi.testclient import TestClient
        from app.main import app
        from app.core.dependencies import get_current_user, get_db
        app.dependency_overrides[get_current_user] = lambda: {"id": "u1", "email": "t@t.com"}
        app.dependency_overrides[get_db] = lambda: MagicMock()
        return TestClient(app, raise_server_exceptions=False)

    def test_knowledge_build_uses_revision_when_available(self):
        client = self._make_client()
        with (
            patch("app.services.course_service.get_course", return_value={"id": "c1"}),
            patch("app.routers.knowledge.get_artifact_ids_by_doc_type", return_value=[5, 6]) as mock_gaid,
            patch("app.routers.knowledge._get_context", return_value=("some content here", [])),
            patch("app.routers.knowledge._stage_extract", return_value={"outline": {"nodes": []}, "graph": {"nodes": [], "edges": []}}),
            patch("app.routers.knowledge._save_knowledge"),
            patch("app.routers.knowledge.get_settings") as ms,
        ):
            ms.return_value.openai_api_key = "key"
            resp = client.post("/knowledge/build", json={"course_id": "c1", "allow_ai_fill": False})
        # Verify get_artifact_ids_by_doc_type was called with course_id and ["revision"]
        # (don't compare the supabase mock object directly — use call_args)
        assert mock_gaid.called
        _args, _kwargs = mock_gaid.call_args
        assert _args[1] == "c1"          # course_id
        assert _args[2] == ["revision"]  # doc_types

    def test_knowledge_build_no_revision_raises_app_error(self):
        """Revision-strict: when no revision docs found, return 400 with a helpful message."""
        client = self._make_client()
        with (
            patch("app.services.course_service.get_course", return_value={"id": "c1"}),
            patch("app.routers.knowledge.get_artifact_ids_by_doc_type", return_value=[]),
            patch("app.routers.knowledge._get_context", return_value=("", [])),
            patch("app.routers.knowledge.get_settings") as ms,
        ):
            ms.return_value.openai_api_key = "key"
            resp = client.post("/knowledge/build", json={"course_id": "c1", "allow_ai_fill": False})
        # Revision strict — no fallback — should return 400 with a meaningful Chinese error
        assert resp.status_code in (400, 422)
        detail = resp.json().get("detail", "")
        assert "复习" in detail or "revision" in detail
