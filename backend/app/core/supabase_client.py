"""Supabase client singleton (service-role key — bypasses RLS)."""

from __future__ import annotations

import httpx
from supabase import Client, create_client

from app.core.config import get_settings

_client: Client | None = None


def get_supabase() -> Client:
    """Return the shared Supabase client using the service-role key.

    The service-role key bypasses Row Level Security; user-level isolation is
    enforced in the service layer via explicit ``user_id`` filters.
    """
    global _client
    if _client is None:
        cfg = get_settings()
        _client = create_client(cfg.supabase_url, cfg.supabase_service_role_key)
        # 默认 storage httpx timeout 仅 20s，大文件上传会超时
        # 上调至 120s（大 PDF 通过 VPS→Supabase 链路需要更长时间）
        try:
            _client.storage._client.timeout = httpx.Timeout(120.0)
        except Exception:
            pass  # 版本差异时静默忽略，不影响主流程
    return _client
