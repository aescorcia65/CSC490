"""
Health check endpoints.

COMPONENT: Router
  - Use for load balancers, k8s probes, or "is the API up?" checks
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("")
def health():
    """Simple liveness check."""
    return {"status": "ok"}


@router.get("/ready")
def ready():
    """Readiness: extend here to check DB, external services, etc."""
    return {"ready": True}
