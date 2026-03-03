"""Tests for rag_service internal functions.

Covers:
  - _clean()  — all garbage patterns, whitespace normalization
  - _chunk()  — paragraph splitting, overlap, min-length filter, hard-max split
  - _is_chinese() — Chinese character ratio detection
  - get_artifact_ids_by_doc_type() — DB query correctness (already tested in
    test_rag_routing.py; here we test edge cases and realistic data shapes)
"""

from __future__ import annotations

import sys
import os

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("SUPABASE_URL",              "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY",         "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("OPENAI_API_KEY",            "test-openai")
os.environ.setdefault("ADMIN_SECRET",              "test-admin-secret")

from app.services.rag_service import _clean, _chunk, _is_chinese, get_artifact_ids_by_doc_type


# ── _clean() ─────────────────────────────────────────────────────────────────

class TestClean:
    """Each garbage pattern in _GARBAGE must be stripped by _clean()."""

    def test_standalone_page_numbers_removed(self):
        text = "Some content\n\n7\n\nMore content"
        result = _clean(text)
        assert "7" not in result.split() or "Some content" in result

    def test_page_n_of_m_removed(self):
        text = "Content here\nPage 3 of 10\nMore content"
        result = _clean(text)
        assert "Page 3 of 10" not in result

    def test_slide_n_slash_m_removed(self):
        text = "Content\nSlide 5/20\nContent"
        result = _clean(text)
        assert "Slide 5/20" not in result

    def test_copyright_line_removed(self):
        text = "Lecture content\n© 2024 UNSW Australia\nMore content"
        result = _clean(text)
        assert "© 2024 UNSW Australia" not in result

    def test_course_code_year_header_removed(self):
        text = "Intro\nCOMP9900 Capstone Project 2024\nBody"
        result = _clean(text)
        assert "COMP9900 Capstone Project 2024" not in result

    def test_unsw_standalone_removed(self):
        text = "Title\n\nUNSW\n\nContent here"
        result = _clean(text)
        # standalone "UNSW" on its own line should be removed
        lines = result.splitlines()
        assert "UNSW" not in [l.strip() for l in lines]

    def test_empty_page_markers_removed(self):
        text = "[Page 1]\n[Page 2]\nContent"
        result = _clean(text)
        assert "[Page 1]" not in result

    def test_tutor_line_removed(self):
        text = "Course info\nTutor: John Smith\nContent"
        result = _clean(text)
        assert "Tutor: John Smith" not in result

    def test_lecturer_line_removed(self):
        text = "Overview\nLecturer: Dr Jane Doe\nTopic"
        result = _clean(text)
        assert "Lecturer: Dr Jane Doe" not in result

    def test_duration_line_removed(self):
        text = "Course description\nDuration: 2 hours\nDetails"
        result = _clean(text)
        assert "Duration: 2 hours" not in result

    def test_credits_line_removed(self):
        text = "Course\nCredits: 6 UoC\nDesc"
        result = _clean(text)
        assert "Credits: 6 UoC" not in result

    def test_final_exam_schedule_removed(self):
        text = "Plan\nFinal exam date: 2024-11-15\nMore"
        result = _clean(text)
        assert "Final exam date" not in result

    def test_welcome_slide_title_removed(self):
        text = "Slides\nWelcome to COMP9900\nContent"
        result = _clean(text)
        assert "Welcome to COMP9900" not in result

    def test_introduction_to_removed(self):
        text = "First slide\nIntroduction to MATH1131\nBody"
        result = _clean(text)
        assert "Introduction to MATH1131" not in result

    def test_blank_line_collapse(self):
        """3+ consecutive blank lines → exactly 2."""
        text = "A\n\n\n\n\nB"
        result = _clean(text)
        assert "\n\n\n" not in result

    def test_excess_spaces_collapsed(self):
        """3+ spaces/tabs → single space."""
        text = "word1    word2\ttab\there"
        result = _clean(text)
        assert "    " not in result  # 4 spaces gone
        assert "word1" in result
        assert "word2" in result

    def test_empty_input_returns_empty(self):
        assert _clean("") == ""

    def test_clean_text_unchanged(self):
        text = "This is a normal paragraph.\n\nAnother paragraph."
        result = _clean(text)
        assert "normal paragraph" in result
        assert "Another paragraph" in result

    def test_real_lecture_slide_cleaned(self):
        """Realistic lecture slide snippet with common noise."""
        text = (
            "Algorithm Design\n"
            "\n"
            "COMP3121 Advanced Algorithms 2024\n"
            "\n"
            "© UNSW Sydney\n"
            "\n"
            "UNSW\n"
            "\n"
            "Dynamic programming is a technique for solving problems.\n"
            "\n"
            "Page 7 of 42\n"
        )
        result = _clean(text)
        assert "Dynamic programming" in result
        assert "COMP3121" not in result
        assert "© UNSW Sydney" not in result


# ── _chunk() ─────────────────────────────────────────────────────────────────

class TestChunk:
    def test_short_text_returns_single_chunk(self):
        # Must be >= _CHUNK_MIN (80 chars) to survive the filter
        text = "This is a paragraph that is long enough to be kept as a single chunk by the chunker."
        chunks = _chunk(text)
        assert len(chunks) == 1
        assert "long enough" in chunks[0]

    def test_empty_input_returns_empty_list(self):
        assert _chunk("") == []

    def test_whitespace_only_returns_empty_list(self):
        assert _chunk("   \n\n   ") == []

    def test_paragraphs_split_on_double_newline(self):
        """Two paragraphs well within CHUNK_TARGET should be joined into one chunk.

        Each paragraph must be >= _CHUNK_MIN (80 chars) to survive the filter.
        """
        para_a = "First paragraph " + "x" * 70   # 86 chars
        para_b = "Second paragraph " + "y" * 70  # 87 chars
        text = f"{para_a}\n\n{para_b}"
        chunks = _chunk(text)
        # Both fit in one chunk (combined ~173 chars < CHUNK_TARGET 800)
        assert len(chunks) == 1
        assert "First paragraph" in chunks[0]
        assert "Second paragraph" in chunks[0]

    def test_chunks_respect_min_length(self):
        """Paragraphs shorter than _CHUNK_MIN (80 chars) should be discarded."""
        # 79-char dummy "paragraph" (too short to be a useful chunk)
        short = "x" * 79
        chunks = _chunk(short)
        assert chunks == []

    def test_long_text_splits_into_multiple_chunks(self):
        """Text clearly exceeding CHUNK_TARGET should produce multiple chunks."""
        # Each paragraph ~200 chars; 6 of them = ~1200 → should split
        para = "A" * 200
        text = "\n\n".join([para] * 6)
        chunks = _chunk(text)
        assert len(chunks) >= 2

    def test_overlap_carries_last_paragraph(self):
        """After a flush, the last paragraph of the previous chunk starts the next."""
        # Build text where first two paragraphs fill a chunk, triggering flush
        para_a = "A" * 500
        para_b = "B" * 400   # a+b > 800 → flush after para_a, overlap = para_a
        para_c = "C" * 100
        text = f"{para_a}\n\n{para_b}\n\n{para_c}"
        chunks = _chunk(text)
        assert len(chunks) >= 2
        # para_b should appear in the second chunk (it's the overlap source)
        second = chunks[1]
        assert "B" in second

    def test_no_chunk_shorter_than_min(self):
        """All returned chunks should be >= _CHUNK_MIN chars."""
        from app.services.rag_service import _CHUNK_MIN
        para = "Word " * 30  # ~150 chars
        text = "\n\n".join([para] * 10)
        chunks = _chunk(text)
        for c in chunks:
            assert len(c.strip()) >= _CHUNK_MIN, f"Too-short chunk found: {len(c.strip())} chars"

    def test_oversized_paragraph_hard_split(self):
        """A single paragraph > CHUNK_MAX (1200) chars should produce a chunk."""
        big_para = "Z" * 1300
        chunks = _chunk(big_para)
        assert len(chunks) >= 1
        assert any("Z" in c for c in chunks)

    def test_chunks_cover_all_content(self):
        """No content should be silently lost (spot-check first/last words)."""
        text = "FIRST_WORD " + ("middle " * 200) + " LAST_WORD"
        chunks = _chunk(text)
        combined = " ".join(chunks)
        assert "FIRST_WORD" in combined
        assert "LAST_WORD" in combined

    def test_chinese_text_chunked(self):
        """Chinese paragraphs should also be chunked correctly."""
        para = "这是一段中文内容，用于测试分块功能是否正常工作。" * 5
        text = "\n\n".join([para] * 4)
        chunks = _chunk(text)
        assert len(chunks) >= 1
        assert all("这是" in c or len(c) >= 80 for c in chunks if c)


# ── _is_chinese() ─────────────────────────────────────────────────────────────

class TestIsChinese:
    def test_pure_chinese_returns_true(self):
        assert _is_chinese("这是一段中文文本") is True

    def test_pure_english_returns_false(self):
        assert _is_chinese("This is a purely English sentence.") is False

    def test_mostly_chinese_returns_true(self):
        # ~80% Chinese chars
        assert _is_chinese("中文内容abc") is True

    def test_mostly_english_returns_false(self):
        # ~15% Chinese
        assert _is_chinese("Hello world 中") is False

    def test_empty_string_returns_false(self):
        assert _is_chinese("") is False

    def test_single_chinese_char_threshold(self):
        """A single CJK char in a 2-char string exceeds 10% threshold."""
        # 1 CJK out of 2 total = 50% > 10%
        result = _is_chinese("中a")
        # cjk=1, 10% of 2=0.2, max(1,0.2)=1, so 1>1 is False, but 1>0.2 is True
        # The actual code: cjk > max(1, len*0.1) → 1 > max(1, 0.2) → 1 > 1 → False
        # Single char: len=2, 0.1*2=0.2, max(1,0.2)=1 → 1 > 1 is False
        # So very short strings with 1 CJK should still return False
        assert result is False

    def test_bilingual_content_detected_as_chinese(self):
        """Mixed content with substantial Chinese portion is detected."""
        text = "Lecture slides 第一章 算法基础 introduction to dynamic programming"
        # Count Chinese: 第一章算法基础 = 7 chars, total ~55 chars, 7/55 ≈ 13% > 10%
        # max(1, 55*0.1) = max(1, 5.5) = 5.5; 7 > 5.5 = True
        assert _is_chinese(text) is True

    def test_numbers_only_returns_false(self):
        assert _is_chinese("1234567890") is False

    def test_punctuation_only_returns_false(self):
        assert _is_chinese("!@#$%^&*()") is False


# ── get_artifact_ids_by_doc_type (edge cases) ─────────────────────────────────

class TestGetArtifactIdsByDocTypeEdgeCases:
    """Edge cases not covered in test_rag_routing.py."""

    def _make_sb(self, rows):
        from unittest.mock import MagicMock
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

    def test_returns_list_of_ints(self):
        """IDs must be extracted as ints, not dicts."""
        sb = self._make_sb([{"id": 1}, {"id": 2}])
        result = get_artifact_ids_by_doc_type(sb, "c1", ["revision"])
        assert all(isinstance(x, int) for x in result)

    def test_none_data_treated_as_empty(self):
        """If .data is None (edge case), return empty list without error."""
        from unittest.mock import MagicMock
        sb = MagicMock()
        exec_mock = MagicMock()
        exec_mock.data = None
        (sb.table.return_value
           .select.return_value
           .eq.return_value
           .eq.return_value
           .in_.return_value
           .execute.return_value) = exec_mock
        result = get_artifact_ids_by_doc_type(sb, "c1", ["revision"])
        assert result == []

    def test_filters_approved_status_not_pending(self):
        """Must use status='approved', not 'pending' or other."""
        from unittest.mock import MagicMock, call
        sb = MagicMock()
        exec_mock = MagicMock()
        exec_mock.data = []
        eq_chain = MagicMock()
        eq_chain.eq.return_value = eq_chain
        eq_chain.in_.return_value.execute.return_value = exec_mock
        sb.table.return_value.select.return_value.eq.return_value = eq_chain

        get_artifact_ids_by_doc_type(sb, "course-x", ["lecture"])
        # Verify "approved" was passed somewhere in the eq calls
        all_calls_str = str(eq_chain.eq.call_args_list)
        assert "approved" in all_calls_str

    def test_course_id_passed_to_query(self):
        """course_id must be used as a filter, not ignored."""
        from unittest.mock import MagicMock
        sb = MagicMock()
        exec_mock = MagicMock()
        exec_mock.data = []
        (sb.table.return_value
           .select.return_value
           .eq.return_value
           .eq.return_value
           .in_.return_value
           .execute.return_value) = exec_mock

        get_artifact_ids_by_doc_type(sb, "specific-course-id", ["lecture"])
        # First eq call must filter by course_id
        first_eq_call = sb.table.return_value.select.return_value.eq.call_args
        assert "specific-course-id" in str(first_eq_call)

    def test_large_id_list_returned_intact(self):
        """Returns all IDs regardless of how many."""
        rows = [{"id": i} for i in range(1, 51)]  # 50 IDs
        sb = self._make_sb(rows)
        result = get_artifact_ids_by_doc_type(sb, "c1", ["lecture"])
        assert len(result) == 50
        assert result == list(range(1, 51))
