"""Supabase client for the Streamlit admin layer.

Uses SERVICE_ROLE_KEY so all queries bypass RLS — the admin UI can
see all users' data. User-level filtering is done explicitly when needed.

For Streamlit user sessions: after login, store the user's JWT in
st.session_state["supabase_token"] and call ``get_user_client()``
to get an anon-key client scoped to that user.
"""

from __future__ import annotations

import os
from functools import lru_cache

from supabase import Client, create_client


@lru_cache(maxsize=1)
def get_admin_db() -> Client:
    """Return a service-role Supabase client (bypasses RLS, admin use only)."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def get_user_db(access_token: str) -> Client:
    """Return a user-scoped Supabase client using the user's JWT.

    This client respects RLS — users can only see their own data.
    """
    url = os.environ["SUPABASE_URL"]
    anon_key = os.environ["SUPABASE_ANON_KEY"]
    client = create_client(url, anon_key)
    client.auth.set_session(access_token, "")
    return client
