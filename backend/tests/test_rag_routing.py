"""Tests for data-centric RAG routing logic.

Covers:
  - _resolve_artifact_ids() priority / fallback / None-return logic
  - get_artifact_ids_by_doc_type() DB query behaviour
  - Per-endpoint routing rules (strict vs. fallback) — tested at service layer
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

from app.services.generate_service import _resolve_artifact_ids
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

_PASS_THROUGH = "app.services.generate_service.filter_accessible_artifact_ids"


class TestResolveArtifactIds:
    """Test resolution priority: explicit > scope_set > doc_type routing > None.

    filter_accessible_artifact_ids is patched to be transparent (return all IDs)
    so these tests focus purely on routing logic, not access control.
    """

    # 1. Explicit artifact_ids always win
    def test_explicit_artifact_ids_returned_directly(self):
        sb = MagicMock()
        with patch(_PASS_THROUGH, side_effect=lambda sb_, uid, ids: ids):
            result = _resolve_artifact_ids(sb, "u1", "c1", None, [1, 2, 3])
        assert result == [1, 2, 3]

    def test_explicit_ids_override_scope_set(self):
        sb = MagicMock()
        with patch(_PASS_THROUGH, side_effect=lambda sb_, uid, ids: ids):
            result = _resolve_artifact_ids(sb, "u1", "c1", scope_set_id=5, artifact_ids=[9])
        assert result == [9]

    def test_explicit_ids_override_doc_type_routing(self):
        sb = MagicMock()
        with patch(_PASS_THROUGH, side_effect=lambda sb_, uid, ids: ids):
            result = _resolve_artifact_ids(
                sb, "u1", "c1", None, [7],
                priority_doc_types=["revision"],
            )
        assert result == [7]

    # 2. Scope set resolution
    def test_scope_set_ids_returned_when_no_explicit(self):
        sb = MagicMock()
        with patch("app.services.generate_service.get_scope_set", return_value={"artifact_ids": [10, 11]}), \
             patch(_PASS_THROUGH, side_effect=lambda sb_, uid, ids: ids):
            result = _resolve_artifact_ids(sb, "u1", "c1", scope_set_id=5, artifact_ids=None)
        assert result == [10, 11]

    def test_scope_set_empty_returns_none(self):
        with patch("app.services.generate_service.get_scope_set", return_value={"artifact_ids": []}):
            sb = MagicMock()
            result = _resolve_artifact_ids(sb, "u1", "c1", scope_set_id=5, artifact_ids=None)
        assert result is None

    # 3. Doc-type priority routing
    def test_priority_doc_type_found_returns_ids(self):
        sb = MagicMock()
        with patch(
            "app.services.generate_service.get_artifact_ids_by_doc_type",
            return_value=[20, 21],
        ), patch(_PASS_THROUGH, side_effect=lambda sb_, uid, ids: ids):
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

        with patch("app.services.generate_service.get_artifact_ids_by_doc_type", side_effect=fake_get), \
             patch(_PASS_THROUGH, side_effect=lambda sb_, uid, ids: ids):
            result = _resolve_artifact_ids(
                sb, "u1", "c1", None, None,
                priority_doc_types=["revision"],
                fallback_doc_types=["lecture", "tutorial"],
            )
        assert result == [30, 31]

    def test_priority_not_found_no_fallback_returns_none(self):
        """When fallback_doc_types=None, return None (full corpus search)."""
        sb = MagicMock()
        with patch("app.services.generate_service.get_artifact_ids_by_doc_type", return_value=[]):
            result = _resolve_artifact_ids(
                sb, "u1", "c1", None, None,
                priority_doc_types=["past_exam"],
                fallback_doc_types=None,
            )
        assert result is None

    def test_both_priority_and_fallback_empty_returns_none(self):
        sb = MagicMock()
        with patch("app.services.generate_service.get_artifact_ids_by_doc_type", return_value=[]):
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
    """Verify each generate_service function calls _resolve_artifact_ids with
    the correct doc_type config.

    Tests run at the service layer (not HTTP layer) because the router endpoints
    now return {job_id} immediately and delegate to background asyncio tasks.
    """

    def _body(self, **kwargs):
        b = MagicMock()
        b.scope_set_id = None
        b.artifact_ids = None
        b.num_questions = 5
        b.exclude_topics = []
        for k, v in kwargs.items():
            setattr(b, k, v)
        return b

    def _call_service(self, fn_name: str):
        from app.services import generate_service
        fn = getattr(generate_service, fn_name)
        sb = MagicMock()
        body = self._body()
        with (
            patch("app.services.generate_service._resolve_artifact_ids", return_value=None) as mock_resolve,
            patch("app.services.generate_service._get_context", return_value=("", [])),
            patch("app.services.generate_service.get_course_chunks_sampled", return_value=("", [])),
            patch("app.services.generate_service._get_openai_key", return_value="key"),
        ):
            try:
                fn(sb, "u1", "c1", body)
            except Exception:
                pass  # we only care about mock_resolve call args
        return mock_resolve

    # quiz → past_exam strict
    def test_quiz_uses_past_exam_priority_no_fallback(self):
        mock_resolve = self._call_service("run_quiz")
        assert mock_resolve.called
        _, kwargs = mock_resolve.call_args
        assert kwargs.get("priority_doc_types") == ["past_exam"]
        assert kwargs.get("fallback_doc_types") is None

    # outline → revision strict
    def test_outline_uses_revision_priority_no_fallback(self):
        mock_resolve = self._call_service("run_outline")
        assert mock_resolve.called
        _, kwargs = mock_resolve.call_args
        assert kwargs.get("priority_doc_types") == ["revision"]
        assert kwargs.get("fallback_doc_types") is None

    # summary → lecture with tutorial fallback
    def test_summary_uses_lecture_priority_with_fallback(self):
        mock_resolve = self._call_service("run_summary")
        assert mock_resolve.called
        _, kwargs = mock_resolve.call_args
        assert kwargs.get("priority_doc_types") == ["lecture"]
        assert kwargs.get("fallback_doc_types") == ["tutorial"]

    # flashcards → lecture with tutorial fallback
    def test_flashcards_uses_lecture_priority_with_fallback(self):
        mock_resolve = self._call_service("run_flashcards")
        assert mock_resolve.called
        _, kwargs = mock_resolve.call_args
        assert kwargs.get("priority_doc_types") == ["lecture"]
        assert kwargs.get("fallback_doc_types") == ["tutorial"]


# ── Error messages when no matching docs ──────────────────────────────────────

class TestDocTypeErrorMessages:
    """Verify that when no docs of the required type exist, a meaningful
    Chinese error message is raised (AppError.detail)."""

    def _body(self):
        b = MagicMock()
        b.scope_set_id = None
        b.artifact_ids = None
        b.num_questions = 5
        b.exclude_topics = []
        return b

    def test_quiz_no_past_exam_returns_meaningful_error(self):
        from app.services import generate_service
        sb = MagicMock()
        with (
            patch("app.services.generate_service._resolve_artifact_ids", return_value=None),
            patch("app.services.generate_service.get_course_chunks_sampled", return_value=("", [])),
        ):
            with pytest.raises(AppError) as exc_info:
                generate_service.run_quiz(sb, "u1", "c1", self._body())
        detail = exc_info.value.detail
        assert "往年考题" in detail or "past_exam" in detail

    def test_outline_no_revision_returns_meaningful_error(self):
        from app.services import generate_service
        sb = MagicMock()
        with (
            patch("app.services.generate_service._resolve_artifact_ids", return_value=None),
            patch("app.services.generate_service._get_context", return_value=("", [])),
        ):
            with pytest.raises(AppError) as exc_info:
                generate_service.run_outline(sb, "u1", "c1", self._body())
        detail = exc_info.value.detail
        assert "复习总结" in detail or "revision" in detail


# TestKnowledgeRoutingRevisionStrict removed — knowledge router was deleted
