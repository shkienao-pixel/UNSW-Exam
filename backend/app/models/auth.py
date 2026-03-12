"""Auth request / response models."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    invite_code: str = Field(min_length=1)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RegisterResponse(BaseModel):
    """注册接口响应：需要邮箱验证时返回 otp_sent，否则直接返回 token。"""
    status: str  # "ok" | "otp_sent"
    email: str | None = None
    # 直接登录时才有以下字段
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int | None = None


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    token: str = Field(min_length=6, max_length=6)


class ResendOtpRequest(BaseModel):
    email: EmailStr


class ResendOtpResponse(BaseModel):
    ok: bool = True


class RequestResetRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    access_token: str
    new_password: str = Field(min_length=8)


class MessageResponse(BaseModel):
    message: str


class UserOut(BaseModel):
    id: str
    email: str
