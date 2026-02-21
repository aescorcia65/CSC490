"""
Firebase Admin SDK: verify ID tokens from the frontend.
"""

import os

import firebase_admin
from firebase_admin import credentials, auth as firebase_auth

from app.config import settings

_firebase_app = None


def get_firebase_app():
    """Initialize and return Firebase app (uses service account JSON)."""
    global _firebase_app
    if _firebase_app is None:
        cred_path = settings.firebase_credentials_path or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if not cred_path or not os.path.isfile(cred_path):
            raise RuntimeError(
                "Firebase credentials not found. Set FIREBASE_CREDENTIALS_PATH or GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path."
            )
        cred = credentials.Certificate(cred_path)
        _firebase_app = firebase_admin.initialize_app(cred)
    return _firebase_app


def verify_id_token(token: str) -> dict:
    """
    Verify a Firebase ID token and return decoded claims.
    Raises firebase_admin.auth.InvalidIdTokenError if invalid.
    """
    get_firebase_app()
    return firebase_auth.verify_id_token(token)
