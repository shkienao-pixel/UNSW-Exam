"""Unit tests for custom HTTP exception classes."""

from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.exceptions import AppError, AuthError, ForbiddenError, NotFoundError, RateLimitError


class TestAppError:
    def test_default_status(self):
        err = AppError("something went wrong")
        assert err.status_code == 400
        assert err.detail == "something went wrong"

    def test_custom_status(self):
        err = AppError("teapot", status_code=418)
        assert err.status_code == 418


class TestAuthError:
    def test_default_message(self):
        err = AuthError()
        assert err.status_code == 401
        assert "Authentication" in err.detail

    def test_custom_message(self):
        err = AuthError("Token expired")
        assert err.status_code == 401
        assert err.detail == "Token expired"


class TestNotFoundError:
    def test_default_resource(self):
        err = NotFoundError()
        assert err.status_code == 404
        assert "not found" in err.detail.lower()

    def test_named_resource(self):
        err = NotFoundError("Course")
        assert err.status_code == 404
        assert "Course" in err.detail


class TestForbiddenError:
    def test_status(self):
        err = ForbiddenError()
        assert err.status_code == 403

    def test_custom_message(self):
        err = ForbiddenError("Admins only")
        assert err.detail == "Admins only"


class TestRateLimitError:
    def test_status(self):
        err = RateLimitError()
        assert err.status_code == 429
