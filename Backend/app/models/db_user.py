"""
SQLAlchemy User model for PostgreSQL.

Stores users after first Firebase login (uid, email, display_name).
"""

from sqlalchemy import Column, DateTime, String, func

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String(128), primary_key=True)  # Firebase UID
    email = Column(String(255), nullable=True, index=True)
    display_name = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
