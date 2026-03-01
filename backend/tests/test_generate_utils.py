"""Unit tests for pure utility functions in generate.py."""

from __future__ import annotations

import json
import sys
import os

# Ensure app package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.routers.generate import _extract_json, _sources_note


# ── _extract_json ─────────────────────────────────────────────────────────────

class TestExtractJson:
    def test_plain_array(self):
        raw = '[{"question":"Q1","answer":"A"}]'
        assert _extract_json(raw) == raw

    def test_plain_object(self):
        raw = '{"questions":[],"sources":[]}'
        assert _extract_json(raw) == raw

    def test_strip_json_fence(self):
        raw = '```json\n[{"a":1}]\n```'
        result = _extract_json(raw)
        assert result == '[{"a":1}]'

    def test_strip_plain_fence(self):
        raw = '```\n[{"a":1}]\n```'
        result = _extract_json(raw)
        assert result == '[{"a":1}]'

    def test_leading_text_before_array(self):
        raw = 'Here are the questions:\n[{"q":"Q1"}]'
        result = _extract_json(raw)
        assert result.startswith('[')
        assert json.loads(result) == [{"q": "Q1"}]

    def test_leading_text_before_object(self):
        raw = 'Sure, here you go:\n{"key":"value"}'
        result = _extract_json(raw)
        assert result.startswith('{')
        assert json.loads(result) == {"key": "value"}

    def test_trailing_text_trimmed_from_array(self):
        raw = '[{"a":1}] \nSome extra text after'
        result = _extract_json(raw)
        # Should end at the last ]
        assert result.endswith(']')
        assert json.loads(result) == [{"a": 1}]

    def test_trailing_text_trimmed_from_object(self):
        raw = '{"x":2}\nExtra stuff'
        result = _extract_json(raw)
        assert result.endswith('}')
        assert json.loads(result) == {"x": 2}

    def test_empty_string(self):
        result = _extract_json("")
        assert result == ""

    def test_whitespace_only(self):
        result = _extract_json("   \n  ")
        assert result == ""

    def test_nested_array(self):
        raw = '[[1,2],[3,4]]'
        result = _extract_json(raw)
        assert json.loads(result) == [[1, 2], [3, 4]]

    def test_multiline_json_array(self):
        raw = '''```json
[
  {"question": "What is X?", "options": ["A", "B", "C", "D"], "answer": "A"},
  {"question": "What is Y?", "options": ["A", "B", "C", "D"], "answer": "B"}
]
```'''
        result = _extract_json(raw)
        data = json.loads(result)
        assert len(data) == 2
        assert data[0]["answer"] == "A"

    def test_real_llm_output_with_prefix(self):
        raw = 'Here are your flashcards:\n```json\n[{"type":"vocab","front":"OSI","back":"7-layer model"}]\n```\nLet me know!'
        result = _extract_json(raw)
        data = json.loads(result)
        assert data[0]["front"] == "OSI"


# ── _sources_note ─────────────────────────────────────────────────────────────

class TestSourcesNote:
    def test_empty_sources(self):
        assert _sources_note([]) == ""

    def test_single_source_with_url(self):
        sources = [{"file_name": "lecture1.pdf", "storage_url": "https://example.com/f.pdf"}]
        result = _sources_note(sources)
        assert "lecture1.pdf" in result
        assert "https://example.com/f.pdf" in result
        assert "参考来源" in result

    def test_single_source_no_url(self):
        sources = [{"file_name": "notes.pdf", "storage_url": ""}]
        result = _sources_note(sources)
        assert "notes.pdf" in result
        assert "参考来源" in result
        # No markdown link when no URL
        assert "[notes.pdf](" not in result

    def test_multiple_sources(self):
        sources = [
            {"file_name": "a.pdf", "storage_url": "https://a.com/a.pdf"},
            {"file_name": "b.pdf", "storage_url": "https://b.com/b.pdf"},
        ]
        result = _sources_note(sources)
        assert "a.pdf" in result
        assert "b.pdf" in result
        assert result.count("- ") == 2

    def test_missing_url_key(self):
        sources = [{"file_name": "x.pdf"}]
        result = _sources_note(sources)
        assert "x.pdf" in result
