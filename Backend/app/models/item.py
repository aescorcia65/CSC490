"""
Item-related request/response schemas.

COMPONENT: Models (Schemas)
  - Used by routers to validate incoming data and shape responses
  - FastAPI uses these for automatic validation and OpenAPI docs
"""

from pydantic import BaseModel, Field


class ItemCreate(BaseModel):
    """What the client sends when creating an item."""

    name: str = Field(..., min_length=1, description="Item name")
    description: str | None = None


class ItemResponse(BaseModel):
    """What the API returns for an item."""

    id: int
    name: str
    description: str | None = None

    class Config:
        from_attributes = True  # for ORM models later
