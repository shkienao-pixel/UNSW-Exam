"""Dynamic LLM API key management.

Priority chain (per provider):
  1. DB table `api_keys` — active row for provider (allows runtime key rotation)
  2. Environment variables / config (OPENAI_API_KEY, GEMINI_API_KEY, DEEPSEEK_API_KEY)

A 60-second in-process TTL cache avoids hammering the DB on every request.
Call `invalidate_cache(provider)` after any DB write to force a fresh read.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

# ── In-process key cache ───────────────────────────────────────────────────────
# { provider: (api_key, expires_at_unix_ts) }
_cache: dict[str, tuple[str, float]] = {}
_CACHE_TTL = 60.0  # seconds


def get_api_key(provider: str, supabase=None) -> Optional[str]:
    """Return the active API key for *provider*.

    Checks the DB api_keys table first, then falls back to env/config.
    Returns None if no key is configured anywhere.

    Args:
        provider: One of ``'openai'``, ``'gemini'``, ``'deepseek'``.
        supabase: Supabase client instance. Pass ``None`` to skip DB lookup.
    """
    now = time.monotonic()
    cached = _cache.get(provider)
    if cached and cached[1] > now:
        return cached[0] or None

    key = _fetch_from_db(provider, supabase) or _fetch_from_env(provider)

    if key:
        _cache[provider] = (key, now + _CACHE_TTL)
    return key or None


def invalidate_cache(provider: Optional[str] = None) -> None:
    """Invalidate cached keys.

    Call this after inserting / activating / deleting a key in the DB
    so the next request re-reads from the source.

    Args:
        provider: Provider to invalidate. ``None`` clears the entire cache.
    """
    if provider:
        _cache.pop(provider, None)
    else:
        _cache.clear()


# ── Private helpers ────────────────────────────────────────────────────────────

def _fetch_from_db(provider: str, supabase) -> Optional[str]:
    """Query the api_keys table for the active key."""
    if supabase is None:
        return None
    try:
        result = (
            supabase.table("api_keys")
            .select("api_key")
            .eq("provider", provider)
            .eq("is_active", True)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]["api_key"]
    except Exception as exc:
        # Table may not exist yet (before migration) — log and fall through
        logger.debug("api_keys DB lookup failed for %s: %s", provider, exc)
    return None


def _fetch_from_env(provider: str) -> Optional[str]:
    """Read API key from environment / config file."""
    from app.core.config import get_settings
    cfg = get_settings()
    mapping = {
        "openai":   cfg.openai_api_key,
        "gemini":   cfg.gemini_api_key,
        "deepseek": cfg.deepseek_api_key,
    }
    return mapping.get(provider) or None
