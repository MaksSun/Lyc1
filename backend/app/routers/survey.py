"""Роутер для публичных тестов и анкет (без привязки к классу)."""
from __future__ import annotations
from pathlib import Path
from typing import Any
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_admin
from ..models import Survey, SurveyParticipant, Attempt, Answer
from ..schemas import (
    SurveyCreate, SurveyOut, SurveySubmitIn, SurveyResultOut, TokenOut,
)
from ..services.assignment_store import AssignmentStore
from ..services.grading import grade
import random

router = APIRouter(prefix="/api/survey", tags=["survey"])

# Папка для публичных тестов — отдельная от assignments
SURVEY_DIR = Path(__file__).resolve().parents[2] / "surveys"
STORE = AssignmentStore(base_dir=SURVEY_DIR)


def _ensure_survey_dir():
    SURVEY_DIR.mkdir(parents=True, exist_ok=True)


# ─── Публичный доступ ──────────────────────────────────────────────────────

@router.get("/info/{access_code}")
def get_survey_info(access_code: str, session: Session = Depends(get_session)):
    """Получить информацию о тесте по публичному коду (без авторизации)."""
    survey = session.exec(select(Survey).where(Survey.access_code == access_code.upper())).first()
    if not survey or not survey.is_active:
        raise HTTPException(status_code=404, detail="Тест не найден или неактивен")
    return {
        "id": survey.id,
        "access_code": survey.access_code,
        "title": survey.title,
        "description": survey.description,
        "survey_type": survey.survey_type,
        "time_limit_minutes": survey.time_limit_minutes,
        "show_results": survey.show_results,
    }


@router.get("/assignment/{access_code}")
def get_survey_assignment(access_code: str, session: Session = Depends(get_session)):
    """Получить вопросы теста по публичному коду."""
    survey = session.exec(select(Survey).where(Survey.access_code == access_code.upper())).first()
    if not survey or not survey.is_active:
        raise HTTPException(status_code=404, detail="Тест не найден или неактивен")

    _ensure_survey_dir()
    # assignment_path — это путь относительно папки surveys, например "teachers/intro_test"
    # или абсолютный путь к файлу
    path_str = survey.assignment_path
    if "/" in path_str or "\\" in path_str:
        parts = path_str.replace("\\", "/").split("/")
        class_part = "/".join(parts[:-1]) if len(parts) > 1 else "."
        file_part = parts[-1]
    else:
        class_part = "."
        file_part = path_str

    try:
        # Пробуем загрузить из папки surveys
        if class_part == ".":
            yml_path = SURVEY_DIR / f"{file_part}.yml"
        else:
            yml_path = SURVEY_DIR / class_part / f"{file_part}.yml"

        if not yml_path.exists():
            raise FileNotFoundError(str(yml_path))

        import yaml
        with yml_path.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Файл задания не найден: {survey.assignment_path}")

    questions_out = []
    for q in data.get("questions", []):
        qid = q.get("id", "")
        qtype = q.get("type", "shorttext")
        q_out: dict[str, Any] = {
            "id": qid,
            "qtype": qtype,
            "prompt_latex": q.get("prompt_latex", q.get("prompt", "")),
            "points": q.get("points", 1),
            "hint": q.get("hint"),
        }
        if qtype == "mcq":
            q_out["options"] = q.get("options", [])
        elif qtype == "multichoice":
            q_out["options"] = q.get("options", [])
        elif qtype == "drag_drop":
            q_out["zones"] = q.get("zones", [])
            q_out["items"] = q.get("items", [])
        elif qtype == "matching":
            q_out["left_items"] = q.get("left_items", [])
            q_out["right_items"] = q.get("right_items", [])
        elif qtype == "ordering":
            items = q.get("order_items", [])
            # Перемешиваем для отображения
            shuffled = items.copy()
            random.shuffle(shuffled)
            q_out["order_items"] = shuffled
        elif qtype == "rating":
            q_out["rating_min"] = q.get("answer", {}).get("min", 1)
            q_out["rating_max"] = q.get("answer", {}).get("max", 5)
            q_out["rating_labels"] = q.get("rating_labels", [])
        elif qtype == "fill_blank":
            q_out["blank_text"] = q.get("blank_text", "")

        questions_out.append(q_out)

    return {
        "id": survey.access_code,
        "title": data.get("title", survey.title),
        "description_latex": data.get("description_latex", survey.description),
        "max_score": sum(q.get("points", 1) for q in data.get("questions", [])),
        "time_limit_minutes": survey.time_limit_minutes,
        "questions": questions_out,
    }


@router.post("/submit/{access_code}", response_model=SurveyResultOut)
def submit_survey(
    access_code: str,
    data: SurveySubmitIn,
    session: Session = Depends(get_session),
):
    """Отправить ответы на тест/анкету."""
    survey = session.exec(select(Survey).where(Survey.access_code == access_code.upper())).first()
    if not survey or not survey.is_active:
        raise HTTPException(status_code=404, detail="Тест не найден или неактивен")

    # Создаём участника
    participant = SurveyParticipant(
        survey_id=survey.id,
        name=data.participant.name,
        email=data.participant.email,
        extra_data=data.participant.extra_data,
    )
    session.add(participant)
    session.flush()

    # Загружаем задание
    path_str = survey.assignment_path
    if "/" in path_str or "\\" in path_str:
        parts = path_str.replace("\\", "/").split("/")
        class_part = "/".join(parts[:-1]) if len(parts) > 1 else "."
        file_part = parts[-1]
    else:
        class_part = "."
        file_part = path_str

    if class_part == ".":
        yml_path = SURVEY_DIR / f"{file_part}.yml"
    else:
        yml_path = SURVEY_DIR / class_part / f"{file_part}.yml"

    import yaml
    try:
        with yml_path.open("r", encoding="utf-8") as f:
            assignment_data = yaml.safe_load(f) or {}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Файл задания не найден")

    questions = assignment_data.get("questions", [])
    max_score = sum(q.get("points", 1) for q in questions)

    # Создаём попытку
    started_at = None
    if data.started_at:
        try:
            started_at = datetime.fromisoformat(data.started_at)
        except Exception:
            pass

    attempt = Attempt(
        student_id=None,
        participant_id=participant.id,
        class_name=f"survey:{survey.access_code}",
        assignment_id=survey.assignment_path,
        assignment_title=survey.title,
        submitted_at=datetime.utcnow(),
        started_at=started_at,
        time_spent_seconds=data.time_spent_seconds,
        total_score=0,
        max_score=max_score,
    )
    session.add(attempt)
    session.flush()

    # Проверяем ответы
    details = []
    total = 0
    for q in questions:
        qid = q.get("id", "")
        qtype = q.get("type", "shorttext")
        correct = q.get("answer")
        points = q.get("points", 1)
        student_answer = data.answers.get(qid)

        # Для анкет (survey_type == "survey") не проверяем правильность
        if survey.survey_type == "survey":
            ok = student_answer is not None
            sc = points if ok else 0
            meta = {"survey_mode": True}
        else:
            ok, sc, meta = grade(qtype, correct, student_answer, points)

        total += sc
        ans = Answer(
            attempt_id=attempt.id,
            question_key=qid,
            answer_json={"student": student_answer, "meta": meta},
            is_correct=ok,
            score=sc,
            max_score=points,
        )
        session.add(ans)
        details.append({
            "question_key": qid,
            "is_correct": ok,
            "score": sc,
            "max_score": points,
            "student_answer": student_answer,
            "correct_answer": correct.get("value") if isinstance(correct, dict) else correct,
            "prompt_latex": q.get("prompt_latex", q.get("prompt", "")),
            "qtype": qtype,
            **meta,
        })

    attempt.total_score = total
    session.add(attempt)
    session.commit()
    session.refresh(attempt)

    return SurveyResultOut(
        attempt_id=attempt.id,
        participant_name=participant.name,
        total_score=total,
        max_score=max_score,
        percent=round(total / max_score * 100, 1) if max_score else 0,
        survey_type=survey.survey_type,
        show_results=survey.show_results,
        details=details if survey.show_results else [],
    )


# ─── Административные эндпоинты ────────────────────────────────────────────

@router.get("/admin/list", response_model=list[SurveyOut])
def list_surveys(session: Session = Depends(get_session), _=Depends(get_current_admin)):
    surveys = session.exec(select(Survey).order_by(Survey.created_at.desc())).all()
    result = []
    for s in surveys:
        count = len(session.exec(select(SurveyParticipant).where(SurveyParticipant.survey_id == s.id)).all())
        result.append(SurveyOut(
            id=s.id,
            access_code=s.access_code,
            title=s.title,
            description=s.description,
            survey_type=s.survey_type,
            assignment_path=s.assignment_path,
            time_limit_minutes=s.time_limit_minutes,
            show_results=s.show_results,
            is_active=s.is_active,
            created_at=s.created_at,
            participants_count=count,
        ))
    return result


@router.post("/admin/create", response_model=SurveyOut)
def create_survey(data: SurveyCreate, session: Session = Depends(get_session), _=Depends(get_current_admin)):
    existing = session.exec(select(Survey).where(Survey.access_code == data.access_code.upper())).first()
    if existing:
        raise HTTPException(status_code=400, detail="Код уже занят")
    survey = Survey(
        access_code=data.access_code.upper(),
        title=data.title,
        description=data.description,
        survey_type=data.survey_type,
        assignment_path=data.assignment_path,
        time_limit_minutes=data.time_limit_minutes,
        show_results=data.show_results,
        is_active=data.is_active,
    )
    session.add(survey)
    session.commit()
    session.refresh(survey)
    return SurveyOut(
        id=survey.id,
        access_code=survey.access_code,
        title=survey.title,
        description=survey.description,
        survey_type=survey.survey_type,
        assignment_path=survey.assignment_path,
        time_limit_minutes=survey.time_limit_minutes,
        show_results=survey.show_results,
        is_active=survey.is_active,
        created_at=survey.created_at,
        participants_count=0,
    )


@router.patch("/admin/{survey_id}")
def update_survey(
    survey_id: int,
    data: dict,
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    survey = session.get(Survey, survey_id)
    if not survey:
        raise HTTPException(status_code=404, detail="Тест не найден")
    for field in ["title", "description", "time_limit_minutes", "show_results", "is_active"]:
        if field in data:
            setattr(survey, field, data[field])
    session.add(survey)
    session.commit()
    return {"ok": True}


@router.delete("/admin/{survey_id}")
def delete_survey(survey_id: int, session: Session = Depends(get_session), _=Depends(get_current_admin)):
    survey = session.get(Survey, survey_id)
    if not survey:
        raise HTTPException(status_code=404, detail="Тест не найден")
    session.delete(survey)
    session.commit()
    return {"ok": True}


@router.get("/admin/{survey_id}/results")
def get_survey_results(
    survey_id: int,
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    """Результаты всех участников теста."""
    survey = session.get(Survey, survey_id)
    if not survey:
        raise HTTPException(status_code=404, detail="Тест не найден")

    participants = session.exec(
        select(SurveyParticipant).where(SurveyParticipant.survey_id == survey_id)
    ).all()

    result = []
    for p in participants:
        attempt = session.exec(
            select(Attempt)
            .where(Attempt.participant_id == p.id)
            .order_by(Attempt.submitted_at.desc())
        ).first()
        result.append({
            "participant_id": p.id,
            "name": p.name,
            "email": p.email,
            "created_at": p.created_at.isoformat(),
            "attempt_id": attempt.id if attempt else None,
            "total_score": attempt.total_score if attempt else 0,
            "max_score": attempt.max_score if attempt else 0,
            "percent": round(attempt.total_score / attempt.max_score * 100, 1)
                       if attempt and attempt.max_score else 0,
            "time_spent_seconds": attempt.time_spent_seconds if attempt else None,
        })
    return {
        "survey_id": survey_id,
        "title": survey.title,
        "participants_count": len(participants),
        "results": result,
    }


@router.get("/admin/files/list")
def list_survey_files(_=Depends(get_current_admin)):
    """Список YAML-файлов в папке surveys."""
    _ensure_survey_dir()
    files = []
    for p in sorted(SURVEY_DIR.rglob("*.yml")):
        rel = str(p.relative_to(SURVEY_DIR)).replace("\\", "/")
        files.append({"path": rel.replace(".yml", ""), "name": p.stem})
    return files
