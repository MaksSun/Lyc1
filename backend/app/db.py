from sqlmodel import SQLModel, Session, create_engine
from .core.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, echo=False, connect_args=connect_args)

def init_db() -> None:
    SQLModel.metadata.create_all(engine)

def get_db_path() -> str:
    """Возвращает путь к файлу SQLite БД для прямых миграций."""
    url = settings.database_url
    if url.startswith("sqlite:///"):
        return url.replace("sqlite:///", "")
    # Для других БД возвращаем пустую строку (миграции не применяются)
    return ""

def get_session():
    with Session(engine) as session:
        yield session
