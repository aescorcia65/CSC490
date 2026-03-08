"""
Supabase JWT verification helpers.

We verify Supabase access tokens issued by the Supabase Auth service using a
shared JWT secret. This keeps the rest of the auth pipeline very similar to
the existing Firebase-based flow by normalizing claims to a common shape.
"""

from typing import Any, Dict

from jose import JWTError, jwt

from app.config import settings


class SupabaseJWTError(Exception):
    """Raised when a Supabase JWT cannot be verified or is invalid."""


def _get_jwt_secret() -> str:
    if not settings.supabase_jwt_secret:
        raise SupabaseJWTError(
            "SUPABASE_JWT_SECRET is not configured. "
            "Set it in your Backend/.env to your Supabase JWT secret."
        )
    return settings.supabase_jwt_secret


def verify_supabase_token(token: str) -> Dict[str, Any]:
    """
    Verify a Supabase JWT access token and return normalized claims.

    Normalized claims:
        - uid: underlying user id (from `sub`)
        - email: user's email, if present
        - name: display name, if present (from user_metadata.full_name or similar)
    """
    secret = _get_jwt_secret()

    try:
        # Supabase uses HS256 by default for JWTs.
        decoded = jwt.decode(token, secret, algorithms=["HS256"])
    except JWTError as exc:
        raise SupabaseJWTError("Invalid or expired Supabase token") from exc

    sub = decoded.get("sub")
    if not sub:
        raise SupabaseJWTError("Supabase token missing 'sub' (user id) claim")

    email = decoded.get("email")
    user_metadata = decoded.get("user_metadata") or {}
    name = user_metadata.get("full_name") or user_metadata.get("name")

    return {
        "uid": sub,
        "email": email,
        "name": name,
        "_raw": decoded,
    }

