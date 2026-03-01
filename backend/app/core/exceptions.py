"""Application-level exceptions."""

from __future__ import annotations

from fastapi import HTTPException, status


class AppError(HTTPException):
    def __init__(self, detail: str, status_code: int = status.HTTP_400_BAD_REQUEST) -> None:
        super().__init__(status_code=status_code, detail=detail)


class NotFoundError(AppError):
    def __init__(self, resource: str = "Resource") -> None:
        super().__init__(f"{resource} not found", status.HTTP_404_NOT_FOUND)


class AuthError(AppError):
    def __init__(self, detail: str = "Authentication failed") -> None:
        super().__init__(detail, status.HTTP_401_UNAUTHORIZED)


class ForbiddenError(AppError):
    def __init__(self, detail: str = "Access denied") -> None:
        super().__init__(detail, status.HTTP_403_FORBIDDEN)


class RateLimitError(AppError):
    def __init__(self, detail: str = "Rate limit exceeded") -> None:
        super().__init__(detail, status.HTTP_429_TOO_MANY_REQUESTS)
