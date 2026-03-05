from __future__ import annotations

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
import secrets

# Корень проекта: backend/
BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Application settings with environment variable support.
    
    All settings can be overridden via .env file or environment variables.
    For production, make sure to set proper values for security-critical settings.
    """
    
    # Database
    database_url: str = f"sqlite:///{BASE_DIR / 'lyceum.db'}"

    # JWT / Security
    # IMPORTANT: Change this in production! Use: secrets.token_urlsafe(32)
    jwt_secret: str = "CHANGE_ME_IN_PRODUCTION_VERY_SECRET_KEY"
    jwt_alg: str = "HS256"
    access_token_minutes: int = 60 * 24 * 7  # 7 дней

    # Admin credentials (for initial setup only)
    # After first login, change password via admin panel
    admin_username: str = "admin"
    admin_password: str = "admin123"

    # CORS settings
    # In production, replace with specific frontend URLs
    cors_origins: list[str] = ["*"]  # WARNING: "*" allows all origins - unsafe for production!
    cors_allow_credentials: bool = True
    cors_allow_methods: list[str] = ["*"]
    cors_allow_headers: list[str] = ["*"]

    # Frontend URL for QR codes
    frontend_url: str = ""

    # Rate limiting (requests per minute)
    rate_limit_login: int = 5  # Max 5 login attempts per minute per IP
    rate_limit_api: int = 60   # Max 60 API requests per minute per user

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

# Security validation on startup
if settings.jwt_secret == "CHANGE_ME_IN_PRODUCTION_VERY_SECRET_KEY":
    import warnings
    warnings.warn(
        "⚠️  WARNING: Using default JWT secret! "
        "Generate a secure secret with: python -c 'import secrets; print(secrets.token_urlsafe(32))'",
        UserWarning,
        stacklevel=2
    )
