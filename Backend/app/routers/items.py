"""
Example CRUD-style endpoints for "items".

COMPONENT: Router
  - Defines URL paths and HTTP methods
  - Uses models for request/response
  - Delegates business logic to services
"""

from fastapi import APIRouter, HTTPException

from app.models.item import ItemCreate, ItemResponse
from app.services import item_service

router = APIRouter()


@router.get("", response_model=list[ItemResponse])
def list_items():
    """List all items (example: in-memory store)."""
    return item_service.get_all()


@router.get("/{item_id}", response_model=ItemResponse)
def get_item(item_id: int):
    """Get one item by id."""
    item = item_service.get_by_id(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.post("", response_model=ItemResponse, status_code=201)
def create_item(body: ItemCreate):
    """Create a new item."""
    return item_service.create(body.name, body.description)
