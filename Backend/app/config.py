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

    # Example: add when you have a database
    # database_url: str = "sqlite:///./app.db"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
