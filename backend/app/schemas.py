from __future__ import annotations
from typing import Optional, Any, List, Dict
from datetime import date, datetime
from pydantic import BaseModel, Field


class ClassAssignConfigIn(BaseModel):
    student_assign_limit: int = Field(ge=0, le=100)
    student_assign_random: bool


class ClassAssignConfigOut(BaseModel):
    class_id: int
    student_assign_limit: int
    student_assign_random: bool


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class StudentLoginIn(BaseModel):
    code: str = Field(min_length=7, max_length=7)


class AdminLoginIn(BaseModel):
    username: str
    password: str


class StudentOut(BaseModel):
    id: int
    name: str
    code: str
    class_id: int
    class_name: str


class ClassRoomCreate(BaseModel):
    name: str


class ClassRoomOut(BaseModel):
    id: int
    name: str


class StudentCreate(BaseModel):
    name: str
    code: str = Field(min_length=7, max_length=7)
    class_id: int


class StudentBulkItem(BaseModel):
    name: str
    code: Optional[str] = Field(default=None, min_length=7, max_length=7)


class StudentsBulkIn(BaseModel):
    class_id: int
    items: List[StudentBulkItem] = Field(default_factory=list)


class StudentsBulkOut(BaseModel):
    created_count: int
    created: List[dict]
    errors: List[dict]


# ─── Задания ───────────────────────────────────────────────────────────────

class FileAssignmentOut(BaseModel):
    id: str
    title: str
    description_latex: str
    max_score: int
    time_limit_minutes: int = 0


class FileQuestionOut(BaseModel):
    id: str
    qtype: str
    prompt_latex: str
    # options: строки ИЛИ объекты {id, label, image_url}
    options: Optional[List[Any]] = None
    # Для drag_drop: зоны и элементы
    zones: Optional[List[dict]] = None
    items: Optional[List[dict]] = None
    # Для matching: левая и правая колонки
    left_items: Optional[List[dict]] = None
    right_items: Optional[List[dict]] = None
    # Для ordering: элементы для расстановки (строки или {id,label,image_url})
    order_items: Optional[List[Any]] = None
    # Для fill_blank: текст с пропусками
    blank_text: Optional[str] = None
    # Для rating: диапазон
    rating_min: Optional[int] = None
    rating_max: Optional[int] = None
    rating_labels: Optional[List[str]] = None
    points: int
    image: Optional[str] = None
    image_url: Optional[str] = None
    hint: Optional[str] = None  # подсказка для ученика
    # Для table_fill и table_select
    table_headers: Optional[List[str]] = None   # заголовки столбцов
    table_rows: Optional[List[dict]] = None      # строки {id, label, cells:[{id,editable,options}]}
    table_options: Optional[List[str]] = None    # варианты для table_select


class FileAssignmentWithQuestions(BaseModel):
    id: str
    title: str
    description_latex: str
    max_score: int
    time_limit_minutes: int = 0
    questions_limit: int = 0
    questions_random: bool = False
    max_attempts: int = 0
    show_correct_answers: bool = True
    questions: List[FileQuestionOut]
    # Обучающий материал прикреплённый к заданию
    material_ids: List[int] = Field(default_factory=list)


class SubmitIn(BaseModel):
    answers: Dict[str, Any] = Field(default_factory=dict)
    started_at: Optional[str] = None   # ISO datetime когда начали
    time_spent_seconds: Optional[int] = None  # сколько секунд потрачено


class SubmitOut(BaseModel):
    attempt_id: int
    total_score: int
    max_score: int
    details: List[dict]
    show_correct_answers: bool = True


# ─── Расписание ────────────────────────────────────────────────────────────

class ScheduleSetIn(BaseModel):
    class_id: int
    date: date
    assignment_id: str
    time_limit_minutes: int = Field(default=0, ge=0)
    questions_limit: int = Field(default=0, ge=0)
    questions_random: bool = False
    student_assign_limit: Optional[int] = Field(default=None, ge=0)
    student_assign_random: bool = False


class ScheduleItemOut(BaseModel):
    id: int
    class_id: int
    class_name: str
    date: date
    assignment_id: str
    title: str
    max_score: int
    time_limit_minutes: int = 0
    questions_limit: int = 0
    questions_random: bool = False
    student_assign_limit: Optional[int] = None
    student_assign_random: bool = False


class StudentScheduleItemOut(BaseModel):
    date: date
    assignment_id: str
    title: str
    max_score: int
    time_limit_minutes: int = 0


# ─── Журнал и аналитика ────────────────────────────────────────────────────

class AnswerDetailOut(BaseModel):
    question_key: str
    is_correct: bool
    score: int
    max_score: int = 1
    student_answer: Any
    correct_answer: Any
    prompt_latex: str
    qtype: str
    points: int
    hint: Optional[str] = None
    image_url: Optional[str] = None
    # Дополнительные поля для отображения тела задания
    options: Optional[List[Any]] = None
    order_items: Optional[List[Any]] = None
    zones: Optional[List[Any]] = None
    items: Optional[List[Any]] = None
    left_items: Optional[List[Any]] = None
    right_items: Optional[List[Any]] = None
    table_headers: Optional[List[str]] = None
    table_rows: Optional[List[dict]] = None
    table_options: Optional[List[str]] = None


class AttemptDetailOut(BaseModel):
    attempt_id: int
    student_id: Optional[int] = None
    student_name: str
    student_code: str
    class_name: str
    assignment_id: str
    assignment_title: str
    submitted_at: datetime
    total_score: int
    max_score: int
    percent: float
    duration_seconds: Optional[int] = None
    answers: List[AnswerDetailOut] = Field(default_factory=list)


class JournalRowOut(BaseModel):
    student_id: int
    student_name: str
    student_code: str
    assignment_id: str
    assignment_title: str
    attempts_count: int
    best_score: int
    max_score: int
    best_percent: float
    last_submitted_at: Optional[datetime] = None
    last_attempt_id: Optional[int] = None
    status: str  # "not_started" | "in_progress" | "done" | "perfect"


class ClassJournalOut(BaseModel):
    class_id: int
    class_name: str
    date: Optional[str] = None  # строка "YYYY-MM-DD" или None
    assignments: List[str]
    assignment_titles: Dict[str, str]
    rows: List[JournalRowOut]


class StudentStatsOut(BaseModel):
    student_id: int
    student_name: str
    total_attempts: int
    total_assignments_done: int
    avg_percent: float
    best_percent: float
    total_score: int
    total_max_score: int
    recent_attempts: List[dict]


class AssignmentStatsOut(BaseModel):
    assignment_id: str
    assignment_title: str
    class_name: str
    students_attempted: int
    students_total: int
    avg_score: float
    max_score: int
    avg_percent: float
    question_stats: List[dict]


# ─── Матрица результатов (ученик × вопрос) ──────────────────────────────────

class CellAnswerOut(BaseModel):
    """One cell in the results matrix: student's answer to one question."""
    is_correct: bool
    score: int
    max_score: int
    student_answer: Any = None   # нормализованный ответ ученика
    correct_answer: Any = None   # нормализованный правильный ответ
    qtype: str = ""
    attempt_id: Optional[int] = None


class StudentRowOut(BaseModel):
    """One row in the results matrix: one student."""
    student_id: int
    student_name: str
    student_code: str
    attempt_id: Optional[int] = None
    total_score: int = 0
    max_score: int = 0
    percent: float = 0.0
    submitted_at: Optional[datetime] = None
    cells: Dict[str, Optional[CellAnswerOut]] = Field(default_factory=dict)


class QuestionColOut(BaseModel):
    """Column header: question metadata."""
    question_key: str
    prompt_latex: str
    qtype: str
    max_score: int
    # Статистика по вопросу
    correct_count: int = 0
    total_count: int = 0
    avg_score: float = 0.0
    percent_correct: float = 0.0


class ResultMatrixOut(BaseModel):
    """Full results matrix for one assignment + class."""
    class_id: int
    class_name: str
    assignment_id: str
    assignment_title: str
    questions: List[QuestionColOut]   # столбцы в порядке YAML
    rows: List[StudentRowOut]          # строки — ученики
    students_attempted: int
    students_total: int
    avg_percent: float
    max_score: int


# ─── Обучающие материалы ───────────────────────────────────────────────────

class MaterialCreate(BaseModel):
    title: str
    description: str = ""
    material_type: str = "text"   # text | video | pdf | link | image
    content: Optional[str] = None
    class_id: Optional[int] = None
    assignment_id: Optional[str] = None
    sort_order: int = 0


class MaterialOut(BaseModel):
    id: int
    title: str
    description: str
    material_type: str
    content: Optional[str]
    class_id: Optional[int]
    assignment_id: Optional[str]
    sort_order: int
    created_at: datetime


# ─── Публичные тесты и анкеты ──────────────────────────────────────────────

class SurveyCreate(BaseModel):
    access_code: str = Field(min_length=4, max_length=20)
    title: str
    description: str = ""
    survey_type: str = "test"   # test | survey
    assignment_path: str        # путь к YAML файлу
    time_limit_minutes: int = Field(default=0, ge=0)
    show_results: bool = True
    is_active: bool = True


class SurveyOut(BaseModel):
    id: int
    access_code: str
    title: str
    description: str
    survey_type: str
    assignment_path: str
    time_limit_minutes: int
    show_results: bool
    is_active: bool
    created_at: datetime
    participants_count: int = 0


class SurveyParticipantIn(BaseModel):
    name: str
    email: str = ""
    extra_data: Optional[Dict[str, Any]] = None


class SurveySubmitIn(BaseModel):
    participant: SurveyParticipantIn
    answers: Dict[str, Any] = Field(default_factory=dict)
    started_at: Optional[str] = None
    time_spent_seconds: Optional[int] = None


class SurveyResultOut(BaseModel):
    attempt_id: int
    participant_name: str
    total_score: int
    max_score: int
    percent: float
    survey_type: str
    show_results: bool
    details: List[dict] = Field(default_factory=list)
