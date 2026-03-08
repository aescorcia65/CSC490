"""
Auth endpoints: verify Supabase token, get current user.

Frontend sends a Supabase access token; backend verifies it and optionally stores
the user in Postgres.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.auth.deps import get_current_user
from app.auth.supabase_jwt import SupabaseJWTError, verify_supabase_token
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
    Verify a Supabase access token and return user info.
    Creates or updates the user in the database.
    """
    try:
        claims = verify_supabase_token(body.id_token)
    except SupabaseJWTError as e:
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
