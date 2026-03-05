from __future__ import annotations

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Корень проекта: backend/
BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    # Путь к SQLite-базе данных (относительно папки backend/)
    database_url: str = f"sqlite:///{BASE_DIR / 'lyceum.db'}"

    # JWT / безопасность
    jwt_secret: str = "CHANGE_ME_IN_PRODUCTION_VERY_SECRET_KEY"
    jwt_alg: str = "HS256"
    access_token_minutes: int = 60 * 24 * 7  # 7 дней

    # Логин/пароль администратора по умолчанию (создаётся при первом запуске)
    admin_username: str = "admin"
    admin_password: str = "admin123"

    # URL фронтенда для QR-кодов (если пусто — QR кодирует только код входа)
    frontend_url: str = ""

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
