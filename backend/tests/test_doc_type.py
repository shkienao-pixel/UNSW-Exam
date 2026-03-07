"""Tests for doc_type metadata field — models, validation, defaults, constraints."""

from __future__ import annotations

import sys
import os
from datetime import datetime, timezone

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from pydantic import ValidationError
from app.models.course import ArtifactOut, DocType, _DOC_TYPE_LABELS


# ── DocType literal ───────────────────────────────────────────────────────────

class TestDocTypeLiteral:
    VALID = ["lecture", "tutorial", "revision", "past_exam", "assignment", "other"]

    def test_all_valid_values_accepted(self):
        now = datetime.now(timezone.utc)
        for dt in self.VALID:
            a = ArtifactOut(
                id=1, course_id="c", file_name="f.pdf",
                file_hash="h", created_at=now, doc_type=dt,
            )
            assert a.doc_type == dt

    def test_default_is_lecture(self):
        now = datetime.now(timezone.utc)
        a = ArtifactOut(
            id=1, course_id="c", file_name="f.pdf",
            file_hash="h", created_at=now,
        )
        assert a.doc_type == "lecture"

    def test_invalid_value_rejected(self):
        now = datetime.now(timezone.utc)
        with pytest.raises(ValidationError):
            ArtifactOut(
                id=1, course_id="c", file_name="f.pdf",
                file_hash="h", created_at=now, doc_type="slides",
            )

    def test_empty_string_rejected(self):
        now = datetime.now(timezone.utc)
        with pytest.raises(ValidationError):
            ArtifactOut(
                id=1, course_id="c", file_name="f.pdf",
                file_hash="h", created_at=now, doc_type="",
            )

    def test_case_sensitive_upper_rejected(self):
        now = datetime.now(timezone.utc)
        with pytest.raises(ValidationError):
            ArtifactOut(
                id=1, course_id="c", file_name="f.pdf",
                file_hash="h", created_at=now, doc_type="Lecture",
            )

    def test_past_exam_underscore_required(self):
        """past_exam uses underscore, not space."""
        now = datetime.now(timezone.utc)
        with pytest.raises(ValidationError):
            ArtifactOut(
                id=1, course_id="c", file_name="f.pdf",
                file_hash="h", created_at=now, doc_type="past exam",
            )


# ── _DOC_TYPE_LABELS completeness ─────────────────────────────────────────────

class TestDocTypeLabels:
    def test_all_types_have_labels(self):
        valid_types = ["lecture", "tutorial", "revision", "past_exam", "assignment", "other"]
        for dt in valid_types:
            assert dt in _DOC_TYPE_LABELS, f"Missing label for {dt}"

    def test_labels_are_non_empty_strings(self):
        for dt, label in _DOC_TYPE_LABELS.items():
            assert isinstance(label, str)
            assert label.strip(), f"Label for {dt} is blank"

    def test_label_count_matches_valid_types(self):
        assert len(_DOC_TYPE_LABELS) == 6


# ── ArtifactOut full field set ────────────────────────────────────────────────

class TestArtifactOutWithDocType:
    def test_all_doc_types_roundtrip(self):
        """doc_type survives model_dump → model_validate cycle."""
        now = datetime.now(timezone.utc)
        for dt in ["lecture", "tutorial", "revision", "past_exam", "assignment", "other"]:
            a = ArtifactOut(
                id=1, course_id="c1", file_name="f.pdf",
                file_hash="h", created_at=now, doc_type=dt,
            )
            dumped = a.model_dump()
            assert dumped["doc_type"] == dt
            restored = ArtifactOut.model_validate(dumped)
            assert restored.doc_type == dt

    def test_doc_type_included_in_serialization(self):
        now = datetime.now(timezone.utc)
        a = ArtifactOut(
            id=2, course_id="c2", file_name="exam.pdf",
            file_hash="hh", created_at=now, doc_type="past_exam",
        )
        d = a.model_dump()
        assert "doc_type" in d
        assert d["doc_type"] == "past_exam"

    def test_revision_is_valid_and_distinct_from_lecture(self):
        now = datetime.now(timezone.utc)
        a_rev = ArtifactOut(
            id=3, course_id="c3", file_name="rev.pdf",
            file_hash="r", created_at=now, doc_type="revision",
        )
        a_lec = ArtifactOut(
            id=4, course_id="c3", file_name="lec.pdf",
            file_hash="l", created_at=now, doc_type="lecture",
        )
        assert a_rev.doc_type != a_lec.doc_type

    def test_existing_fields_unaffected_by_doc_type(self):
        """Adding doc_type must not break existing field behaviour."""
        now = datetime.now(timezone.utc)
        a = ArtifactOut(
            id=5, course_id="c5", file_name="w.pdf",
            file_hash="ww", created_at=now,
            file_type="word", status="pending",
            storage_path="bucket/w.pdf",
            storage_url="https://cdn.example.com/w.pdf",
            reject_reason="Not good",
            uploaded_by="user-1",
        )
        assert a.file_type == "word"
        assert a.status == "pending"
        assert a.doc_type == "lecture"       # default
        assert a.reject_reason == "Not good"


# ── Router-level _VALID_DOC_TYPES constants ───────────────────────────────────

class TestValidDocTypesConstants:
    def test_artifacts_router_constant(self):
        from app.routers.artifacts import _VALID_DOC_TYPES
        assert "lecture"    in _VALID_DOC_TYPES
        assert "tutorial"   in _VALID_DOC_TYPES
        assert "revision"   in _VALID_DOC_TYPES
        assert "past_exam"  in _VALID_DOC_TYPES
        assert "assignment" in _VALID_DOC_TYPES
        assert "other"      in _VALID_DOC_TYPES
        assert len(_VALID_DOC_TYPES) == 6

    def test_admin_router_constant(self):
        from app.routers.admin import _VALID_DOC_TYPES as admin_valid
        assert admin_valid == {"lecture", "tutorial", "revision", "past_exam", "assignment", "other"}

    def test_invalid_doc_type_not_in_set(self):
        from app.routers.artifacts import _VALID_DOC_TYPES
        assert "slides"       not in _VALID_DOC_TYPES
        assert "exam"         not in _VALID_DOC_TYPES
        assert "LECTURE"      not in _VALID_DOC_TYPES
        assert ""             not in _VALID_DOC_TYPES
        assert "past exam"    not in _VALID_DOC_TYPES
