"""Shared pytest configuration for backend tests.

Sets required environment variables BEFORE any app module is imported,
preventing the settings cache from being initialized with wrong defaults.
"""

import os

# Must be set before any `from app.main import app` runs in any test file.
# get_settings() caches on first call — whichever test file imports app.main
# first wins, so we set these here to guarantee consistent values.
os.environ.setdefault("SUPABASE_URL",              "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY",         "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("OPENAI_API_KEY",            "test-openai-key")
os.environ.setdefault("ADMIN_SECRET",              "test-admin-secret")
