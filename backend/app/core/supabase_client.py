"""Supabase client singleton (service-role key — bypasses RLS)."""

from __future__ import annotations

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
    return _client
