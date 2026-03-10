"""
Convenience script to run the backend server for local development/testing.

Usage:
    python run.py
"""

import uvicorn

from app.config import settings


def main() -> None:
    """Start the FastAPI server."""
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
    )


if __name__ == "__main__":
    main()

