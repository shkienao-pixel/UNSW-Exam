"""FastAPI dependency injection: current user, supabase client."""

from __future__ import annotations

from typing import Any

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.exceptions import AuthError
from app.core.supabase_client import get_supabase
from supabase import Client

_bearer = HTTPBearer(auto_error=False)


def get_db() -> Client:
    """Dependency: returns the shared Supabase client."""
    return get_supabase()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Validate Bearer JWT issued by Supabase Auth.

    Returns a dict with at minimum ``{"id": str, "email": str}``.
    Raises ``AuthError`` (HTTP 401) if the token is missing or invalid.
    """
    if credentials is None:
        raise AuthError("Missing Authorization header")

    token = credentials.credentials
    try:
        resp = supabase.auth.get_user(token)
    except Exception as exc:
        raise AuthError(f"Token validation failed: {exc}") from exc

    user = getattr(resp, "user", None)
    if user is None:
        raise AuthError("Invalid or expired token")

    return {
        "id": str(user.id),
        "email": str(user.email or ""),
    }
