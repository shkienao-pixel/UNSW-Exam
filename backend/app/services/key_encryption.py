"""Symmetric encryption for LLM API keys stored in the database.

Uses Fernet (AES-128-CBC + HMAC-SHA256) from the `cryptography` package.

Configuration:
    Set ``API_KEY_ENCRYPTION_KEY`` in .env to a Fernet key generated with:
        python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Backward compatibility:
    If the env var is not set, encrypt() is a no-op (returns plaintext) and
    decrypt() returns the value as-is.  This lets existing plaintext rows
    continue to work until you re-enter keys through the admin panel.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# Fernet sentinel — lazy-loaded to avoid import cost when encryption is off
_fernet = None
_fernet_loaded = False


def _get_fernet():
    global _fernet, _fernet_loaded
    if _fernet_loaded:
        return _fernet
    _fernet_loaded = True
    try:
        from app.core.config import get_settings
        key = get_settings().api_key_encryption_key.strip()
        if not key:
            return None
        from cryptography.fernet import Fernet
        _fernet = Fernet(key.encode())
    except Exception as exc:
        logger.error("key_encryption: failed to initialise Fernet: %s", exc)
        _fernet = None
    return _fernet


def encrypt(plaintext: str) -> str:
    """Encrypt *plaintext*. Returns ciphertext prefixed with 'enc:'.

    If no encryption key is configured, returns plaintext unchanged.
    """
    f = _get_fernet()
    if f is None:
        return plaintext
    ciphertext = f.encrypt(plaintext.encode()).decode()
    return f"enc:{ciphertext}"


def decrypt(value: str) -> str:
    """Decrypt a value previously produced by :func:`encrypt`.

    If the value does not start with 'enc:' it is returned as-is
    (plaintext stored before encryption was enabled).
    """
    if not value.startswith("enc:"):
        return value  # plaintext — backward compat
    f = _get_fernet()
    if f is None:
        # Key not configured but value is encrypted — log and return raw
        logger.warning("key_encryption: encrypted value found but API_KEY_ENCRYPTION_KEY is not set")
        return value
    try:
        return f.decrypt(value[4:].encode()).decode()
    except Exception as exc:
        logger.error("key_encryption: decryption failed: %s", exc)
        return value
