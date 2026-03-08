"""
Configuration and environment settings.

Use this module for:
  - API keys, database URLs, feature flags
  - Values that change per environment (dev/staging/prod)

Load from env vars or a .env file (with python-dotenv).
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings; reads from environment variables."""

    app_name: str = "CSC490 Backend"
    debug: bool = False

    # PostgreSQL (point this to your Supabase Postgres connection string in .env)
    database_url: str = "postgresql://postgres:postgres@localhost:5432/csc490"

    # Supabase Auth: JWT secret used to verify access tokens issued by Supabase.
    # In Supabase dashboard, this is the JWT secret under Authentication settings.
    supabase_jwt_secret: str | None = None

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
