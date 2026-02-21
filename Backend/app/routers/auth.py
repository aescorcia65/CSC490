"""
Auth endpoints: verify Firebase token, get current user.

Frontend sends Firebase ID token; backend verifies with Firebase Admin and optionally stores user in Postgres.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.auth.deps import get_current_user
from app.auth.firebase import verify_id_token
from app.models.auth_schemas import TokenVerifyRequest, UserResponse
from app.models.db_user import User
from app.database import get_db
from sqlalchemy.orm import Session

router = APIRouter()


@router.post("/verify", response_model=UserResponse)
def verify_token(
    body: TokenVerifyRequest,
    db: Session = Depends(get_db),
):
    """
    Verify a Firebase ID token and return user info.
    Creates or updates the user in the database.
    """
    try:
        claims = verify_id_token(body.id_token)
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from e

    uid = claims.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token claims")

    user = db.query(User).filter(User.id == uid).first()
    if user is None:
        user = User(
            id=uid,
            email=claims.get("email"),
            display_name=claims.get("name"),
        )
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

    return UserResponse.model_validate(user)


@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user)):
    """Return the currently authenticated user (Bearer token required)."""
    return UserResponse.model_validate(user)
