"""Authentication routes: register, login, refresh, logout, me."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Response
from supabase import Client

from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import AuthError
from app.models.auth import LoginRequest, RefreshRequest, RegisterRequest, TokenResponse, UserOut
from app.services import credit_service

router = APIRouter()


def _build_token_response(session: Any) -> TokenResponse:
    return TokenResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        expires_in=session.expires_in or 3600,
    )


def _use_invite(supabase: Client, code: str) -> None:
    """Validate and consume an invite code. Raises AuthError if invalid."""
    try:
        row = (
            supabase.table("invites")
            .select("*")
            .eq("code", code.strip().upper())
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise AuthError("Could not verify invite code") from exc

    if not row.data:
        raise AuthError("Invalid invite code")

    invite = row.data[0]

    if invite["use_count"] >= invite["max_uses"]:
        raise AuthError("This invite code has already been used")

    if invite.get("expires_at"):
        expires = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > expires:
            raise AuthError("This invite code has expired")

    # Consume one use
    supabase.table("invites").update(
        {"use_count": invite["use_count"] + 1}
    ).eq("id", invite["id"]).execute()


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(body: RegisterRequest, supabase: Client = Depends(get_db)) -> TokenResponse:
    """Create a new user account (requires valid invite code) and return tokens."""
    _use_invite(supabase, body.invite_code)

    try:
        resp = supabase.auth.sign_up({"email": body.email, "password": body.password})
    except Exception as exc:
        raise AuthError(f"Registration failed: {exc}") from exc

    if resp.session is None:
        raise AuthError(
            "Registration successful. Please check your email to confirm your account."
        )

    # 新用户 welcome bonus +5 积分
    try:
        user_id = resp.session.user.id
        credit_service.earn(supabase, user_id, 5, "welcome_bonus", note="新用户欢迎积分")
    except Exception:
        pass  # 积分失败不阻断注册

    return _build_token_response(resp.session)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, supabase: Client = Depends(get_db)) -> TokenResponse:
    """Authenticate with email + password and return JWT tokens."""
    try:
        resp = supabase.auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )
    except Exception as exc:
        raise AuthError(f"Login failed: {exc}") from exc

    if resp.session is None:
        raise AuthError("Login failed: no session returned")
    return _build_token_response(resp.session)


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, supabase: Client = Depends(get_db)) -> TokenResponse:
    """Exchange a refresh_token for a new access_token."""
    try:
        resp = supabase.auth.refresh_session(body.refresh_token)
    except Exception as exc:
        raise AuthError(f"Token refresh failed: {exc}") from exc

    if resp.session is None:
        raise AuthError("Token refresh failed")
    return _build_token_response(resp.session)


@router.post("/logout", status_code=204, response_class=Response)
def logout(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_db),
) -> Response:
    """Invalidate the current session."""
    try:
        supabase.auth.sign_out()
    except Exception:
        pass  # Best-effort logout
    return Response(status_code=204)


@router.get("/me", response_model=UserOut)
def me(current_user: dict = Depends(get_current_user)) -> UserOut:
    """Return the currently authenticated user."""
    return UserOut(id=current_user["id"], email=current_user["email"])
