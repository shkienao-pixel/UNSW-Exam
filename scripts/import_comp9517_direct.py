"""
Direct import of COMP9517 PDFs — bypasses FastAPI, writes directly to Supabase.
Uses service role key so no RLS or NOT NULL issues.
"""

import hashlib
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / "backend" / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "artifacts")

COURSE_ID = "ac100448-2472-413b-87f9-44cc28d434a2"  # COMP9517

PDF_DIR = ROOT / "data" / "courses" / "aac57340-6fa4-4aea-a5b4-72681ad59328" / "artifacts"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def upload_pdf(pdf_path: Path) -> bool:
    name = pdf_path.name
    parts = name.split("_", 1)
    clean_name = parts[1] if len(parts) == 2 and len(parts[0]) == 12 else name

    data = pdf_path.read_bytes()
    file_hash = hashlib.sha256(data).hexdigest()
    storage_path = f"{COURSE_ID}/{file_hash[:12]}_{clean_name}"

    # 1. Upload to Supabase Storage
    try:
        supabase.storage.from_(BUCKET).upload(
            path=storage_path,
            file=data,
            file_options={"content-type": "application/pdf", "upsert": "true"},
        )
    except Exception as e:
        if "already exists" not in str(e).lower():
            print(f"Storage error: {e}")
            return False

    # 2. Get signed URL
    try:
        signed = supabase.storage.from_(BUCKET).create_signed_url(
            storage_path, expires_in=60 * 60 * 24 * 365
        )
        storage_url = signed.get("signedURL") or signed.get("signed_url") or ""
    except Exception:
        storage_url = ""

    # 3. Insert record directly (no user_id — admin upload)
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    try:
        resp = (
            supabase.table("artifacts")
            .upsert(
                {
                    "course_id": COURSE_ID,
                    "file_name": clean_name,
                    "file_hash": file_hash,
                    "file_type": "pdf",
                    "status": "approved",
                    "file_path": storage_path,
                    "storage_path": storage_path,
                    "storage_url": storage_url,
                    "created_at": now,
                },
                on_conflict="course_id,file_hash",
            )
            .execute()
        )
        return bool(resp.data)
    except Exception as e:
        print(f"DB error: {e}")
        return False


if __name__ == "__main__":
    pdfs = sorted(PDF_DIR.glob("*.pdf"))
    print(f"Found {len(pdfs)} PDFs in {PDF_DIR}")
    print(f"Uploading to course: {COURSE_ID}\n")

    ok = fail = 0
    for pdf in pdfs:
        name = pdf.name
        parts = name.split("_", 1)
        clean = parts[1] if len(parts) == 2 and len(parts[0]) == 12 else name
        print(f"  {clean} ...", end=" ", flush=True)
        if upload_pdf(pdf):
            print("✓")
            ok += 1
        else:
            print("✗")
            fail += 1

    print(f"\nDone: {ok} uploaded, {fail} failed")
