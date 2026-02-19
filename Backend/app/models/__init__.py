"""
Pydantic models (schemas) for request/response bodies.

These define:
  - What the API accepts (request body, query params)
  - What the API returns (response body)

They validate input and generate OpenAPI docs automatically.
"""

from app.models.item import ItemCreate, ItemResponse

__all__ = ["ItemCreate", "ItemResponse"]
