"""
Import COMP9517 PDFs into the new system.

Usage (after running Migrations 003 & 004):
  python scripts/import_comp9517.py

This script:
  1. Creates the COMP9517 course via admin API
  2. Uploads all PDFs from data/courses/aac57340.../artifacts/
"""

import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / "backend" / ".env")

API_URL = os.getenv("API_URL", "http://localhost:8000")
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "unsw-admin-secret-2024")

HEADERS = {"X-Admin-Secret": ADMIN_SECRET}

# The old COMP9517 course folder (with all the PDFs)
OLD_COURSE_DIR = ROOT / "data" / "courses" / "aac57340-6fa4-4aea-a5b4-72681ad59328" / "artifacts"


def create_course() -> str:
    """Get or create COMP9517 course, return its ID."""
    # Check if already exists via admin courses list
    existing = requests.get(f"{API_URL}/admin/courses", headers=HEADERS, timeout=10)
    if existing.ok:
        for c in existing.json():
            if c["code"] == "COMP9517":
                print(f"Course already exists: {c['id']} — {c['code']} {c['name']}")
                return c["id"]

    # Create it
    resp = requests.post(
        f"{API_URL}/admin/courses",
        headers=HEADERS,
        json={"code": "COMP9517", "name": "计算机视觉"},
        timeout=10,
    )
    resp.raise_for_status()
    course = resp.json()
    print(f"Created course: {course['id']} — {course['code']} {course['name']}")
    return course["id"]


def upload_pdfs(course_id: str) -> None:
    """Upload all PDFs to the course."""
    if not OLD_COURSE_DIR.exists():
        print(f"PDF directory not found: {OLD_COURSE_DIR}")
        return

    pdfs = sorted(OLD_COURSE_DIR.glob("*.pdf"))
    print(f"Found {len(pdfs)} PDF files to upload")

    ok = 0
    fail = 0
    for pdf in pdfs:
        # Extract clean filename (remove hash prefix like "abc123def456_filename.pdf")
        name = pdf.name
        parts = name.split("_", 1)
        clean_name = parts[1] if len(parts) == 2 and len(parts[0]) == 12 else name

        print(f"  Uploading: {clean_name} ...", end=" ", flush=True)
        try:
            with open(pdf, "rb") as f:
                resp = requests.post(
                    f"{API_URL}/admin/courses/{course_id}/artifacts",
                    headers=HEADERS,
                    files={"file": (clean_name, f, "application/pdf")},
                    timeout=60,
                )
            if resp.ok:
                print("✓")
                ok += 1
            else:
                print(f"✗ {resp.status_code}: {resp.text[:100]}")
                fail += 1
        except Exception as e:
            print(f"✗ ERROR: {e}")
            fail += 1

    print(f"\nDone: {ok} uploaded, {fail} failed")


if __name__ == "__main__":
    print(f"API: {API_URL}")
    print(f"Admin Secret: {'*' * len(ADMIN_SECRET)}")
    print()

    # COMP9517 already created: ac100448-2472-413b-87f9-44cc28d434a2
    KNOWN_COURSE_ID = "ac100448-2472-413b-87f9-44cc28d434a2"
    try:
        upload_pdfs(KNOWN_COURSE_ID)
    except requests.HTTPError as e:
        print(f"HTTP Error: {e.response.status_code} — {e.response.text[:200]}")
        sys.exit(1)
