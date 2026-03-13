"""FastAPI dependency injection: current user, supabase client."""

from __future__ import annotations

import base64
import json
import logging
import time
from typing import Any

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.exceptions import AuthError
from app.core.supabase_client import get_supabase
from supabase import Client

_bearer = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)


def get_db() -> Client:
    """Dependency: returns the shared Supabase client."""
    return get_supabase()


def _decode_jwt_payload(token: str) -> dict:
    """Local JWT decode with HS256 signature verification.

    Used ONLY as fallback when Supabase Auth API is unreachable (network
    timeout / "Server disconnected").  Verifies the HMAC-SHA256 signature
    against jwt_secret from config — rejects tokens with invalid signatures.

    Falls back to unsigned parse ONLY when jwt_secret is not configured
    (development / missing env var), logging a clear warning.
    """
    from app.core.config import get_settings
    secret = get_settings().jwt_secret

    if secret:
        # Verified path — requires PyJWT
        try:
            import jwt as pyjwt
            payload = pyjwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                options={"verify_aud": False},  # Supabase doesn't set aud always
            )
            return payload
        except Exception as exc:
            raise ValueError(f"JWT signature verification failed: {exc}") from exc

    # Unsigned fallback — only reached when jwt_secret is not configured
    # 在生产环境拒绝无签名解码，避免攻击者伪造 JWT
    cfg_env = get_settings().app_env
    if cfg_env == "production":
        raise ValueError(
            "JWT_SECRET not configured in production — refusing to decode unverified token. "
            "Set JWT_SECRET (SUPABASE_JWT_SECRET) in .env to fix this."
        )
    logger.warning(
        "JWT_SECRET not configured — falling back to UNVERIFIED payload decode (dev mode only). "
        "Set JWT_SECRET in environment to enable signature verification."
    )
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT structure")
    payload_b64 = parts[1]
    payload_b64 += "=" * (-len(payload_b64) % 4)
    payload_bytes = base64.urlsafe_b64decode(payload_b64)
    return json.loads(payload_bytes)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    supabase: Client = Depends(get_db),
) -> dict[str, Any]:
    """Validate Bearer JWT issued by Supabase Auth.

    Primary path  : supabase.auth.get_user(token) — validates signature + revocation.
    Fallback path : local JWT decode — used when Supabase Auth API is unreachable
                    (network timeout, "Server disconnected").  Checks expiry only.

    Returns a dict with at minimum ``{"id": str, "email": str}``.
    Raises ``AuthError`` (HTTP 401) if token is missing, invalid, or expired.
    """
    if credentials is None:
        raise AuthError("Missing Authorization header")

    token = credentials.credentials

    # ── Primary: network validation via Supabase Auth ─────────────────────────
    try:
        resp = supabase.auth.get_user(token)
        user = getattr(resp, "user", None)
        if user is None:
            raise AuthError("Invalid or expired token")
        from app.core.config import get_settings as _gs
        _cfg = _gs()
        email = str(user.email or "")
        is_guest = bool(_cfg.guest_email and email == _cfg.guest_email)
        return {
            "id":       str(user.id),
            "email":    email,
            "is_guest": is_guest,
        }
    except AuthError:
        raise
    except Exception as exc:
        err_msg = str(exc)
        logger.warning("Supabase Auth get_user failed: %s", err_msg[:200])

        # ── Fallback: local decode when Auth API is unreachable ───────────────
        is_network_err = any(
            kw in err_msg.lower()
            for kw in ("disconnected", "timeout", "connection", "network", "reset")
        )
        if is_network_err:
            try:
                payload = _decode_jwt_payload(token)
                exp = payload.get("exp", 0)
                if exp and exp < time.time():
                    raise AuthError("Token expired — please log in again")
                user_id = payload.get("sub")
                email = payload.get("email", "")
                if not user_id:
                    raise AuthError("Invalid token payload")
                logger.info(
                    "Auth fallback: local JWT decode accepted for user=%s (Supabase unreachable)",
                    user_id,
                )
                return {"id": user_id, "email": email, "is_guest": False}
            except AuthError:
                raise
            except Exception as local_exc:
                logger.error("Local JWT decode also failed: %s", local_exc)

        raise AuthError(f"Token validation failed: {err_msg[:120]}") from exc
