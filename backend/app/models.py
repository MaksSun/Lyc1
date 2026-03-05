"""Модели БД (SQLModel).

ВАЖНО: здесь намеренно НЕТ `from __future__ import annotations`.

С ним аннотации отношений превращаются в строки (например, "list['Student']"),
и SQLAlchemy 2 пытается трактовать это как аргумент relationship(), из-за чего
падает на старте. Самый совместимый вариант — обычные аннотации + forward refs.
"""

from datetime import datetime, date as dt_date
from typing import Optional, List

from sqlmodel import SQLModel, Field, Relationship, Column
from sqlalchemy import JSON, UniqueConstraint, Text


class ClassRoom(SQLModel, table=True):
    __tablename__ = "classrooms"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)

    # Настройки выдачи заданий ученику (глобально для класса, перекрываются настройками DailyAssignment)
    student_assign_limit: int = Field(default=0)
    student_assign_random: bool = Field(default=False)

    students: List["Student"] = Relationship(back_populates="classroom")


class Student(SQLModel, table=True):
    __tablename__ = "students"
    __table_args__ = (UniqueConstraint("code", name="uq_student_code"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    code: str = Field(index=True, min_length=7, max_length=7)

    class_id: int = Field(foreign_key="classrooms.id", index=True)
    classroom: Optional["ClassRoom"] = Relationship(back_populates="students")

    attempts: List["Attempt"] = Relationship(back_populates="student")
    login_logs: List["LoginLog"] = Relationship(back_populates="student")


class LoginLog(SQLModel, table=True):
    """Журнал входов учеников в систему."""
    __tablename__ = "login_logs"
    id: Optional[int] = Field(default=None, primary_key=True)
    student_id: int = Field(foreign_key="students.id", index=True)
    student_name: str = Field(default="")
    class_name: str = Field(default="")
    logged_in_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    ip_address: Optional[str] = Field(default=None)
    user_agent: Optional[str] = Field(default=None)
    device_type: Optional[str] = Field(default=None)   # mobile / tablet / pc
    browser: Optional[str] = Field(default=None)
    os: Optional[str] = Field(default=None)
    student: Optional["Student"] = Relationship(back_populates="login_logs")


class AdminUser(SQLModel, table=True):
    __tablename__ = "admins"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str


class Attempt(SQLModel, table=True):
    __tablename__ = "attempts"

    id: Optional[int] = Field(default=None, primary_key=True)
    student_id: Optional[int] = Field(default=None, foreign_key="students.id", index=True)

    # Для публичных тестов student_id может быть None, тогда используем participant_id
    participant_id: Optional[int] = Field(default=None, foreign_key="survey_participants.id", index=True)

    class_name: str = Field(index=True, default="")
    assignment_id: str = Field(index=True)
    assignment_title: str = ""

    submitted_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = Field(default=None)
    time_spent_seconds: Optional[int] = Field(default=None)  # сколько секунд потрачено

    total_score: int = 0
    max_score: int = 0

    student: Optional["Student"] = Relationship(back_populates="attempts")
    answers: List["Answer"] = Relationship(back_populates="attempt")


class Answer(SQLModel, table=True):
    __tablename__ = "answers"

    id: Optional[int] = Field(default=None, primary_key=True)
    attempt_id: int = Field(foreign_key="attempts.id", index=True)

    question_key: str = Field(index=True)
    answer_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))

    is_correct: bool = False
    score: int = 0
    max_score: int = 1  # максимум баллов за этот вопрос

    attempt: Optional["Attempt"] = Relationship(back_populates="answers")


class DailyAssignment(SQLModel, table=True):
    """Привязка файла задания к конкретной дате для конкретного класса."""

    __tablename__ = "daily_assignments"
    __table_args__ = (
        UniqueConstraint("class_id", "date", "assignment_id", name="uq_daily_assignment"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    class_id: int = Field(foreign_key="classrooms.id", index=True)

    date: dt_date = Field(index=True)

    assignment_id: str = Field(index=True)
    assignment_title: str = ""
    max_score: int = 0

    # Настройки на уровне конкретного назначения (перекрывают настройки класса)
    student_assign_limit: Optional[int] = Field(default=None)
    student_assign_random: bool = Field(default=False)

    # Ограничение времени (в минутах, 0 = без ограничения)
    time_limit_minutes: int = Field(default=0)

    # Количество случайных вопросов из задания (0 = все)
    questions_limit: int = Field(default=0)
    questions_random: bool = Field(default=False)

    # Ограничение попыток (0 = без ограничения)
    max_attempts: int = Field(default=0)

    # Показывать ли подробные результаты с правильными ответами ученику
    show_correct_answers: bool = Field(default=True)


# ─── Публичные тесты и анкеты ──────────────────────────────────────────────

class Survey(SQLModel, table=True):
    """Публичный тест/анкета — не привязан к классу."""

    __tablename__ = "surveys"

    id: Optional[int] = Field(default=None, primary_key=True)
    # Уникальный публичный код для доступа (например, "TEACH2024")
    access_code: str = Field(index=True, unique=True)
    title: str
    description: str = Field(default="")

    # Тип: "test" (с баллами) или "survey" (анкета, без оценки)
    survey_type: str = Field(default="test")

    # Путь к YAML-файлу задания (относительно папки assignments)
    assignment_path: str = Field(default="")

    # Ограничение времени (в минутах, 0 = без ограничения)
    time_limit_minutes: int = Field(default=0)

    # Показывать ли результаты участнику после прохождения
    show_results: bool = Field(default=True)

    # Активен ли тест
    is_active: bool = Field(default=True)

    created_at: datetime = Field(default_factory=datetime.utcnow)

    participants: List["SurveyParticipant"] = Relationship(back_populates="survey")


class SurveyParticipant(SQLModel, table=True):
    """Участник публичного теста/анкеты."""

    __tablename__ = "survey_participants"

    id: Optional[int] = Field(default=None, primary_key=True)
    survey_id: int = Field(foreign_key="surveys.id", index=True)

    name: str
    email: str = Field(default="")
    extra_data: Optional[dict] = Field(default=None, sa_column=Column(JSON))  # доп. поля анкеты

    created_at: datetime = Field(default_factory=datetime.utcnow)

    survey: Optional["Survey"] = Relationship(back_populates="participants")


# ─── Обучающие материалы ───────────────────────────────────────────────────

class Material(SQLModel, table=True):
    """Обучающий материал, прикреплённый к заданию или классу."""

    __tablename__ = "materials"

    id: Optional[int] = Field(default=None, primary_key=True)

    title: str
    description: str = Field(default="")

    # Тип материала: "text", "video", "pdf", "link", "image"
    material_type: str = Field(default="text")

    # Содержимое (для text — markdown, для остальных — URL или путь к файлу)
    content: Optional[str] = Field(default=None, sa_column=Column(Text))

    # Привязка к классу (None = доступен всем)
    class_id: Optional[int] = Field(default=None, foreign_key="classrooms.id")

    # Привязка к конкретному заданию (например, "algebra_01")
    assignment_id: Optional[str] = Field(default=None, index=True)

    # Порядок отображения
    sort_order: int = Field(default=0)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ─── Онлайн-присутствие учеников ──────────────────────────────────────────

class StudentHeartbeat(SQLModel, table=True):
    """Хранит последнее время активности ученика (heartbeat) для отслеживания онлайн-статуса."""

    __tablename__ = "student_heartbeats"

    id: Optional[int] = Field(default=None, primary_key=True)
    student_id: int = Field(foreign_key="students.id", index=True, unique=True)
    last_seen: datetime = Field(default_factory=datetime.utcnow, index=True)
    assignment_id: Optional[str] = Field(default=None)  # текущее задание (если выполняет)
    class_id: Optional[int] = Field(default=None, foreign_key="classrooms.id")
