"""Unit tests for Pydantic model validation."""

from __future__ import annotations

import sys
import os
from datetime import datetime

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from pydantic import ValidationError

from app.models.course import CourseCreate, CourseOut, ArtifactOut, ScopeSetCreate, ScopeSetOut
from app.routers.generate import GenerateRequest, TranslateRequest


# ── CourseCreate ──────────────────────────────────────────────────────────────

class TestCourseCreate:
    def test_valid(self):
        c = CourseCreate(code="COMP9900", name="Capstone Project")
        assert c.code == "COMP9900"
        assert c.name == "Capstone Project"

    def test_empty_code_rejected(self):
        with pytest.raises(ValidationError):
            CourseCreate(code="", name="Some Course")

    def test_empty_name_rejected(self):
        with pytest.raises(ValidationError):
            CourseCreate(code="COMP9900", name="")

    def test_code_too_long_rejected(self):
        with pytest.raises(ValidationError):
            CourseCreate(code="X" * 33, name="Course")

    def test_name_too_long_rejected(self):
        with pytest.raises(ValidationError):
            CourseCreate(code="COMP1", name="N" * 121)

    def test_max_boundaries_accepted(self):
        c = CourseCreate(code="X" * 32, name="N" * 120)
        assert len(c.code) == 32
        assert len(c.name) == 120


# ── CourseOut ─────────────────────────────────────────────────────────────────

class TestCourseOut:
    def test_valid(self):
        now = datetime.utcnow()
        c = CourseOut(id="abc123", code="COMP9900", name="Capstone", created_at=now, updated_at=now)
        assert c.id == "abc123"

    def test_serialization(self):
        now = datetime.utcnow()
        c = CourseOut(id="x", code="Y", name="Z", created_at=now, updated_at=now)
        d = c.model_dump()
        assert d["code"] == "Y"


# ── ArtifactOut ───────────────────────────────────────────────────────────────

class TestArtifactOut:
    def test_defaults(self):
        now = datetime.utcnow()
        a = ArtifactOut(
            id=1, course_id="c1", file_name="test.pdf",
            file_hash="abc", file_path=None, created_at=now
        )
        assert a.file_type == "pdf"
        assert a.status == "approved"
        assert a.storage_path is None
        assert a.storage_url is None

    def test_optional_fields(self):
        now = datetime.utcnow()
        a = ArtifactOut(
            id=2, course_id="c1", file_name="doc.pdf",
            file_hash="xyz", file_path="/path/file.pdf",
            file_type="pdf", status="pending",
            storage_path="bucket/doc.pdf",
            storage_url="https://cdn.example.com/doc.pdf",
            uploaded_by="user-uuid",
            created_at=now,
        )
        assert a.status == "pending"
        assert a.storage_url == "https://cdn.example.com/doc.pdf"

    def test_doc_type_defaults_to_lecture(self):
        now = datetime.utcnow()
        a = ArtifactOut(id=3, course_id="c1", file_name="f.pdf",
                        file_hash="h", created_at=now)
        assert a.doc_type == "lecture"

    def test_doc_type_revision_accepted(self):
        now = datetime.utcnow()
        a = ArtifactOut(id=4, course_id="c1", file_name="r.pdf",
                        file_hash="h", created_at=now, doc_type="revision")
        assert a.doc_type == "revision"

    def test_doc_type_past_exam_accepted(self):
        now = datetime.utcnow()
        a = ArtifactOut(id=5, course_id="c1", file_name="e.pdf",
                        file_hash="h", created_at=now, doc_type="past_exam")
        assert a.doc_type == "past_exam"

    def test_doc_type_invalid_rejected(self):
        now = datetime.utcnow()
        with pytest.raises(ValidationError):
            ArtifactOut(id=6, course_id="c1", file_name="x.pdf",
                        file_hash="h", created_at=now, doc_type="slides")

    def test_doc_type_in_serialization(self):
        now = datetime.utcnow()
        a = ArtifactOut(id=7, course_id="c1", file_name="f.pdf",
                        file_hash="h", created_at=now, doc_type="tutorial")
        d = a.model_dump()
        assert d["doc_type"] == "tutorial"


# ── ScopeSetCreate ────────────────────────────────────────────────────────────

class TestScopeSetCreate:
    def test_valid(self):
        s = ScopeSetCreate(name="Week 1-5")
        assert s.name == "Week 1-5"

    def test_empty_rejected(self):
        with pytest.raises(ValidationError):
            ScopeSetCreate(name="")

    def test_too_long_rejected(self):
        with pytest.raises(ValidationError):
            ScopeSetCreate(name="N" * 121)


# ── GenerateRequest ───────────────────────────────────────────────────────────

class TestGenerateRequest:
    def test_defaults(self):
        r = GenerateRequest()
        assert r.scope_set_id is None
        assert r.artifact_ids is None
        assert r.num_questions == 10

    def test_custom_values(self):
        r = GenerateRequest(scope_set_id=3, artifact_ids=[1, 2], num_questions=15)
        assert r.scope_set_id == 3
        assert r.artifact_ids == [1, 2]
        assert r.num_questions == 15


# ── TranslateRequest ──────────────────────────────────────────────────────────

class TestTranslateRequest:
    def test_defaults(self):
        r = TranslateRequest(texts=["hello"])
        assert r.target_lang == "en"

    def test_zh_target(self):
        r = TranslateRequest(texts=["hello", "world"], target_lang="zh")
        assert r.target_lang == "zh"
        assert len(r.texts) == 2

    def test_empty_texts(self):
        r = TranslateRequest(texts=[])
        assert r.texts == []
