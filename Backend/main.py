"""
Backend entry point.

Run with: uvicorn main:app --reload

This file creates the FastAPI app and mounts all routers.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import health, items

app = FastAPI(
    title="CSC490 Backend API",
    description="Template API for the group project",
    version="0.1.0",
)

# CORS: allow the WebUI (or other frontends) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers (each router = a group of related endpoints)
app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(items.router, prefix="/api/items", tags=["items"])


@app.get("/")
def root():
    """Root endpoint; useful for quick checks."""
    return {"message": "CSC490 Backend", "docs": "/docs"}
