"""
Auth dependencies: get current user from Bearer token.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.firebase import verify_id_token
from app.database import get_db
from app.models.db_user import User

security = HTTPBearer(auto_error=False)


def get_current_user_claims(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    """Verify Firebase ID token and return decoded claims. Use for protected routes."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return verify_id_token(credentials.credentials)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


def get_current_user(
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
) -> User:
    """Verify token and return the User from DB (upserts if first login)."""
    uid = claims.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token claims")

    user = db.query(User).filter(User.id == uid).first()
    if user is None:
        user = User(id=uid, email=claims.get("email"), display_name=claims.get("name"))
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        if claims.get("email") is not None:
            user.email = claims.get("email")
        if claims.get("name") is not None:
            user.display_name = claims.get("name")
        db.commit()
        db.refresh(user)
    return user
