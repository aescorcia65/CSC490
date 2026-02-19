"""
Item business logic.

COMPONENT: Service
  - Holds the "how" (create item, get by id, list)
  - In a real app this would use a database; here we use in-memory store
  - Easy to unit test without HTTP
"""

from app.models.item import ItemResponse

# In-memory store for the skeleton (replace with DB later)
_store: list[ItemResponse] = []
_next_id = 1


def get_all() -> list[ItemResponse]:
    """Return all items."""
    return list(_store)


def get_by_id(item_id: int) -> ItemResponse | None:
    """Return one item by id, or None."""
    for item in _store:
        if item.id == item_id:
            return item
    return None


def create(name: str, description: str | None = None) -> ItemResponse:
    """Create a new item and return it."""
    global _next_id
    item = ItemResponse(id=_next_id, name=name, description=description)
    _next_id += 1
    _store.append(item)
    return item
