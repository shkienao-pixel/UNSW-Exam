"""Supabase client singleton (service-role key — bypasses RLS)."""

from __future__ import annotations

import logging
import time

import httpx
from supabase import Client, create_client

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_client: Client | None = None
_created_at: float = 0.0
# 重建间隔：45 分钟（Supabase session JWT 有效期约 1 小时）
_TTL = 45 * 60


def _build_client() -> Client:
    cfg = get_settings()
    client = create_client(cfg.supabase_url, cfg.supabase_service_role_key)
    try:
        client.storage._client.timeout = httpx.Timeout(120.0)
    except Exception:
        pass
    return client


def get_supabase() -> Client:
    """Return a Supabase client using the service-role key.

    Rebuilds the client every 45 minutes so the internal session JWT never
    expires mid-flight (Supabase issues ~1-hour session tokens on first use).
    The service-role key bypasses Row Level Security; user-level isolation is
    enforced in the service layer via explicit ``user_id`` filters.
    """
    global _client, _created_at
    now = time.monotonic()
    if _client is None or (now - _created_at) > _TTL:
        _client = _build_client()
        _created_at = now
        logger.debug("Supabase client (re)created")
    return _client


def restore_service_role_auth() -> None:
    """Reset PostgREST AND Storage auth headers back to the service-role key.

    supabase-py v2 listens to auth state changes and replaces both the PostgREST
    and Storage Authorization headers with the newly signed-in user's JWT whenever
    auth.sign_up() / auth.verify_otp() is called on the shared singleton client.
    This causes subsequent operations to run under the user's JWT, which triggers
    RLS violations for both DB and Storage even though service-role bypasses RLS.

    Call this immediately after any supabase.auth.sign_up() / verify_otp() call,
    and at the start of background tasks that do Storage operations.
    """
    global _client
    if _client is not None:
        cfg = get_settings()
        bearer = f"Bearer {cfg.supabase_service_role_key}"
        # Restore PostgREST
        _client.postgrest.auth(cfg.supabase_service_role_key)
        # Restore Storage client auth header (supabase-py v2)
        try:
            _client.storage._client.headers["Authorization"] = bearer
        except Exception:
            pass
        logger.debug("PostgREST + Storage auth restored to service-role key")
