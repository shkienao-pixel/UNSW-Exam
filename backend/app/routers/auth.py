"""Authentication routes: register, login, refresh, logout, me."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Response
from supabase import Client

from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import AuthError
from app.models.auth import LoginRequest, RefreshRequest, RegisterRequest, TokenResponse, UserOut

router = APIRouter()


def _build_token_response(session: Any) -> TokenResponse:
    return TokenResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        expires_in=session.expires_in or 3600,
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(body: RegisterRequest, supabase: Client = Depends(get_db)) -> TokenResponse:
    """Create a new user account and return tokens."""
    try:
        resp = supabase.auth.sign_up({"email": body.email, "password": body.password})
    except Exception as exc:
        raise AuthError(f"Registration failed: {exc}") from exc

    if resp.session is None:
        # Supabase email confirmation is enabled — user must confirm before logging in
        raise AuthError(
            "Registration successful. Please check your email to confirm your account."
        )
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
