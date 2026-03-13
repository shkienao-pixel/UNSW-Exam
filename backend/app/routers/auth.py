"""Authentication routes: register, verify OTP, login, refresh, logout, me."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Response
from supabase import Client

import httpx

from fastapi.security import HTTPAuthorizationCredentials

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db, _bearer
from app.core.exceptions import AuthError
from app.models.auth import (
    LoginRequest,
    MessageResponse,
    RequestResetRequest,
    ResendOtpRequest,
    ResendOtpResponse,
    RefreshRequest,
    RegisterRequest,
    RegisterResponse,
    ResetPasswordRequest,
    TokenResponse,
    UserOut,
    VerifyOtpRequest,
)
from app.services import credit_service

router = APIRouter()
logger = logging.getLogger(__name__)


def _build_token_response(session: Any) -> TokenResponse:
    return TokenResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        expires_in=session.expires_in or 3600,
    )


def _friendly_auth_error(exc: Exception, action: str) -> str:
    raw = str(exc).strip()
    s = raw.lower()

    if "invalid login credentials" in s:
        return "Invalid email or password."
    if "email not confirmed" in s or "email not verified" in s:
        return "Email not verified. Please complete email verification first."
    if "already confirmed" in s or "already verified" in s:
        return "This email is already verified. Please log in."
    if "user already registered" in s or "already been registered" in s:
        return "This email is already registered. Please complete email verification or log in."
    if "invite" in s and "invalid" in s:
        return "Invalid invite code."
    if "invite" in s and "expired" in s:
        return "Invite code expired."
    if "invite" in s and ("used" in s or "max uses" in s):
        return "Invite code has already been used."
    if "password" in s and ("least" in s or "short" in s):
        return "Password must be at least 8 characters."
    if "otp" in s or "token" in s:
        return "Invalid or expired verification code."

    if raw:
        return f"{action} failed: {raw}"
    return f"{action} failed."


def _validate_invite(supabase: Client, code: str) -> dict[str, Any]:
    """Validate an invite code without consuming it."""
    try:
        row = (
            supabase.table("invites")
            .select("*")
            .eq("code", code.strip().upper())
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise AuthError("Could not verify invite code.") from exc

    if not row.data:
        raise AuthError("Invalid invite code.")

    invite = row.data[0]

    if invite["use_count"] >= invite["max_uses"]:
        raise AuthError("Invite code has already been used.")

    if invite.get("expires_at"):
        expires = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > expires:
            raise AuthError("Invite code expired.")

    return invite


def _consume_invite(supabase: Client, invite: dict[str, Any]) -> bool:
    """Atomically consume one invite use via DB RPC."""
    result = supabase.rpc(
        "consume_invite",
        {"p_id": invite["id"], "p_current_use_count": invite["use_count"]},
    ).execute()
    return result.data is True



@router.post("/register", response_model=RegisterResponse, status_code=201)
def register(body: RegisterRequest, supabase: Client = Depends(get_db)) -> RegisterResponse:
    """Start registration: validate invite (do NOT consume yet) and send OTP.

    Invite is consumed only after /auth/verify-otp succeeds.
    """
    invite = _validate_invite(supabase, body.invite_code)

    try:
        resp = supabase.auth.sign_up({
            "email": body.email,
            "password": body.password,
            "options": {"data": {"invite_id": str(invite["id"])}},
        })
    except Exception as exc:
        msg = str(exc).lower()
        if "user already registered" in msg or "already been registered" in msg:
            # Unverified account already exists — resend OTP so user can complete registration.
            try:
                supabase.auth.resend({"type": "signup", "email": body.email})
            except Exception as resend_exc:
                resend_msg = str(resend_exc).lower()
                if "already confirmed" in resend_msg or "already verified" in resend_msg:
                    raise AuthError("This email is already registered and verified. Please log in.") from resend_exc
            return RegisterResponse(status="otp_sent", email=body.email)
        raise AuthError(_friendly_auth_error(exc, "Registration")) from exc

    # Registration always requires OTP — never return tokens here.
    return RegisterResponse(status="otp_sent", email=body.email)


@router.post("/verify-otp", response_model=TokenResponse)
def verify_otp(body: VerifyOtpRequest, supabase: Client = Depends(get_db)) -> TokenResponse:
    """Verify signup OTP, consume invite code, and finalize registration."""
    try:
        resp = supabase.auth.verify_otp(
            {
                "email": body.email,
                "token": body.token,
                "type": "signup",
            }
        )
    except Exception as exc:
        raise AuthError(_friendly_auth_error(exc, "OTP verification")) from exc

    if resp.session is None:
        raise AuthError("Invalid or expired verification code.")

    user_id = resp.session.user.id

    # Consume the invite code that was stored in user metadata at registration time.
    try:
        metadata = resp.session.user.user_metadata or {}
        invite_id = metadata.get("invite_id")
        if invite_id:
            invite_row = (
                supabase.table("invites")
                .select("*")
                .eq("id", invite_id)
                .limit(1)
                .execute()
            )
            if invite_row.data:
                _consume_invite(supabase, invite_row.data[0])
    except Exception:
        logger.warning("Failed to consume invite after OTP verification for user %s", user_id)

    # Award welcome credits (only on first successful verification).
    try:
        credit_service.earn(supabase, user_id, 5, "welcome_bonus", note="welcome credits")
    except Exception:
        pass

    return _build_token_response(resp.session)


@router.post("/resend-otp", response_model=ResendOtpResponse)
def resend_signup_otp(
    body: ResendOtpRequest,
    supabase: Client = Depends(get_db),
) -> ResendOtpResponse:
    """Resend signup verification code to an email."""
    try:
        supabase.auth.resend({"type": "signup", "email": body.email})
    except Exception as exc:
        raise AuthError(_friendly_auth_error(exc, "Resend verification code")) from exc
    return ResendOtpResponse(ok=True)


@router.post("/guest-token", response_model=TokenResponse)
def guest_token(supabase: Client = Depends(get_db)) -> TokenResponse:
    """返回游客账号的 JWT，无需传入凭证（凭证仅在服务端保存）。

    前端应调此接口而非把 NEXT_PUBLIC_GUEST_* 暴露在客户端包里。
    """
    cfg = get_settings()
    if not cfg.guest_email or not cfg.guest_password:
        raise AuthError("Guest login is not configured on this server.")
    try:
        resp = supabase.auth.sign_in_with_password(
            {"email": cfg.guest_email, "password": cfg.guest_password}
        )
    except Exception as exc:
        raise AuthError("Guest login failed.") from exc
    if resp.session is None:
        raise AuthError("Guest login failed.")
    return _build_token_response(resp.session)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, supabase: Client = Depends(get_db)) -> TokenResponse:
    """Authenticate with email + password and return JWT tokens."""
    try:
        resp = supabase.auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )
    except Exception as exc:
        raise AuthError(_friendly_auth_error(exc, "Login")) from exc

    if resp.session is None:
        raise AuthError("Login failed. Please check email and password.")
    return _build_token_response(resp.session)


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, supabase: Client = Depends(get_db)) -> TokenResponse:
    """Exchange a refresh token for a new access token."""
    try:
        resp = supabase.auth.refresh_session(body.refresh_token)
    except Exception as exc:
        raise AuthError(f"Token refresh failed: {exc}") from exc

    if resp.session is None:
        raise AuthError("Token refresh failed.")
    return _build_token_response(resp.session)


@router.post("/request-reset", response_model=MessageResponse)
def request_reset(body: RequestResetRequest) -> MessageResponse:
    """Send a password reset email. Always returns success to prevent email enumeration."""
    cfg = get_settings()
    headers = {
        "apikey": cfg.supabase_anon_key,
        "Authorization": f"Bearer {cfg.supabase_anon_key}",
        "Content-Type": "application/json",
    }
    try:
        httpx.post(
            f"{cfg.supabase_url}/auth/v1/recover",
            headers=headers,
            json={"email": body.email},
            params={"redirect_to": "https://exammaster.tech/reset-password"},
            timeout=10,
        )
    except Exception:
        pass  # Silently ignore to prevent email enumeration
    return MessageResponse(message="If this email is registered, a reset link has been sent.")


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(body: ResetPasswordRequest) -> MessageResponse:
    """Update user password using the access token from the reset email link."""
    cfg = get_settings()
    admin_headers = {
        "apikey": cfg.supabase_service_role_key,
        "Authorization": f"Bearer {cfg.supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    try:
        r = httpx.get(
            f"{cfg.supabase_url}/auth/v1/user",
            headers={
                "apikey": cfg.supabase_service_role_key,
                "Authorization": f"Bearer {body.access_token}",
            },
            timeout=10,
        )
        if r.status_code != 200:
            raise AuthError("Reset link is invalid or expired. Please request a new one.")
        user_id = r.json().get("id")
        if not user_id:
            raise AuthError("Reset link is invalid or expired.")
    except AuthError:
        raise
    except Exception as exc:
        raise AuthError("Reset link is invalid or expired.") from exc

    try:
        r = httpx.put(
            f"{cfg.supabase_url}/auth/v1/admin/users/{user_id}",
            headers=admin_headers,
            json={"password": body.new_password},
            timeout=10,
        )
        if r.status_code >= 400:
            raise AuthError("Failed to reset password. Please try again.")
    except AuthError:
        raise
    except Exception as exc:
        raise AuthError("Failed to reset password.") from exc

    return MessageResponse(message="Password reset successfully. You can now log in.")


@router.post("/logout", status_code=204, response_class=Response)
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> Response:
    """Invalidate current session via Supabase /auth/v1/logout (scope=global).

    Uses the user's own Bearer token so Supabase can revoke the exact session,
    rather than calling sign_out() on the shared service-role client (which was a no-op).
    """
    if credentials:
        cfg = get_settings()
        try:
            httpx.post(
                f"{cfg.supabase_url}/auth/v1/logout?scope=global",
                headers={
                    "apikey": cfg.supabase_anon_key,
                    "Authorization": f"Bearer {credentials.credentials}",
                },
                timeout=5.0,
            )
        except Exception:
            pass  # best-effort — client-side token clear proceeds regardless
    return Response(status_code=204)


@router.get("/me", response_model=UserOut)
def me(current_user: dict[str, Any] = Depends(get_current_user)) -> UserOut:
    """Return current authenticated user."""
    return UserOut(id=current_user["id"], email=current_user["email"])
