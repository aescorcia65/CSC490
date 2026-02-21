"""Pydantic schemas for auth endpoints."""

from pydantic import BaseModel


class TokenVerifyRequest(BaseModel):
    """Body for POST /api/auth/verify."""

    id_token: str


class UserResponse(BaseModel):
    """User info returned after auth."""

    id: str
    email: str | None
    display_name: str | None

    class Config:
        from_attributes = True
