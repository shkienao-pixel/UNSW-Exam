"""Unified text extraction for PDF, Word, and plain text files.

Replaces the duplicated extraction logic that existed in both
content.py (for raw display) and rag_service.py (for RAG indexing).
"""

from __future__ import annotations

import io


def extract_pdf(data: bytes, page_markers: bool = False) -> str:
    """Extract text from a PDF.

    Args:
        data: Raw PDF bytes.
        page_markers: If True, prefix each page with '[Page N]' (used by RAG).
    """
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        pages: list[str] = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if not text.strip():
                continue
            pages.append(f"[Page {i + 1}]\n{text}" if page_markers else text)
        return "\n\n".join(pages)
    except Exception as exc:
        return f"[PDF extraction failed: {exc}]"


def extract_word(data: bytes) -> str:
    """Extract paragraph text from a Word (.docx) file."""
    try:
        from docx import Document
        doc = Document(io.BytesIO(data))
        return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except Exception as exc:
        return f"[Word extraction failed: {exc}]"


def extract_text(file_type: str, data: bytes, file_name: str = "", *, page_markers: bool = False) -> str:
    """Dispatch extraction by file type.

    Args:
        file_type: One of 'pdf', 'word', 'python', 'url', or any text type.
        data: Raw file bytes.
        file_name: Used for fallback error messages.
        page_markers: Passed to extract_pdf (enables '[Page N]' prefixes for RAG).
    """
    if file_type == "pdf":
        return extract_pdf(data, page_markers=page_markers)
    if file_type == "word":
        return extract_word(data)
    if file_type == "url":
        return "[URL reference: see storage_url field]"
    try:
        return data.decode("utf-8", errors="replace")
    except Exception:
        return f"[Binary file: {file_name}]"
