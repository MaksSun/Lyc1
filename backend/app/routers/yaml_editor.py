"""Роутер для управления YAML-файлами заданий через API."""
from __future__ import annotations
from pathlib import Path
from typing import Optional

import yaml
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..deps import get_current_admin
from ..services.assignment_store import AssignmentStore

router = APIRouter(prefix="/api/yaml", tags=["yaml-editor"])

ASSIGNMENTS_DIR = Path(__file__).resolve().parents[2] / "assignments"
SURVEYS_DIR = Path(__file__).resolve().parents[2] / "surveys"


def _get_store(base: str = "assignments") -> tuple[AssignmentStore, Path]:
    if base == "surveys":
        return AssignmentStore(base_dir=SURVEYS_DIR), SURVEYS_DIR
    return AssignmentStore(base_dir=ASSIGNMENTS_DIR), ASSIGNMENTS_DIR


class YamlSaveIn(BaseModel):
    class_name: str
    assignment_id: str
    content: str          # YAML-текст
    base: str = "assignments"  # "assignments" или "surveys"


class YamlCreateIn(BaseModel):
    class_name: str
    assignment_id: str
    base: str = "assignments"


# ─── Чтение ────────────────────────────────────────────────────────────────

@router.get("/list")
def list_yaml_files(
    base: str = Query(default="assignments"),
    _=Depends(get_current_admin),
):
    """Список всех YAML-файлов."""
    _, base_dir = _get_store(base)
    if not base_dir.exists():
        return []
    result = []
    for class_dir in sorted(base_dir.iterdir()):
        if not class_dir.is_dir():
            continue
        for f in sorted(class_dir.glob("*.yml")):
            result.append({
                "class_name": class_dir.name,
                "assignment_id": f.stem,
                "path": f"{class_dir.name}/{f.stem}",
            })
    return result


@router.get("/read")
def read_yaml(
    path: Optional[str] = Query(default=None),
    class_name: Optional[str] = Query(default=None),
    assignment_id: Optional[str] = Query(default=None),
    base: str = Query(default="assignments"),
    _=Depends(get_current_admin),
):
    """Прочитать YAML-файл как текст.
    Принимает либо path='ClassName/assignment_id', либо class_name + assignment_id отдельно.
    """
    # Разбираем path если передан
    if path:
        parts = path.split("/", 1)
        if len(parts) != 2:
            raise HTTPException(status_code=422, detail="Параметр path должен быть в формате 'ClassName/assignment_id'")
        class_name, assignment_id = parts[0], parts[1]
    elif not class_name or not assignment_id:
        raise HTTPException(status_code=422, detail="Укажите path или class_name + assignment_id")

    _, base_dir = _get_store(base)
    if not base_dir.exists():
        raise HTTPException(status_code=404, detail="Папка заданий не найдена")

    # Ищем папку класса
    class_dir = None
    for d in base_dir.iterdir():
        if d.is_dir() and d.name == class_name:
            class_dir = d
            break
    if not class_dir:
        raise HTTPException(status_code=404, detail=f"Папка класса '{class_name}' не найдена")

    file_path = class_dir / f"{assignment_id}.yml"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Файл не найден")

    return {"content": file_path.read_text(encoding="utf-8"), "path": f"{class_name}/{assignment_id}"}


@router.get("/template/{qtype}")
def get_template(qtype: str, _=Depends(get_current_admin)):
    """Получить шаблон вопроса для указанного типа."""
    templates = {
        "number": {
            "id": "q_001",
            "type": "number",
            "points": 1,
            "prompt_latex": "Вычислите $2 + 2$",
            "hint": "Подсказка для ученика (необязательно)",
            "answer": {"value": 4, "tol": 0},
        },
        "mcq": {
            "id": "q_001",
            "type": "mcq",
            "points": 1,
            "prompt_latex": "Выберите правильный ответ",
            "options": ["Вариант A", "Вариант B", "Вариант C", "Вариант D"],
            "answer": {"index": 0},
        },
        "multichoice": {
            "id": "q_001",
            "type": "multichoice",
            "points": 2,
            "prompt_latex": "Выберите все правильные ответы",
            "options": ["Вариант A", "Вариант B", "Вариант C", "Вариант D"],
            "answer": {"indices": [0, 2], "total_options": 4},
        },
        "shorttext": {
            "id": "q_001",
            "type": "shorttext",
            "points": 1,
            "prompt_latex": "Введите ответ",
            "answer": {"value": "правильный ответ"},
        },
        "text_long": {
            "id": "q_001",
            "type": "text_long",
            "points": 1,
            "prompt_latex": "Напишите развёрнутый ответ",
        },
        "expr": {
            "id": "q_001",
            "type": "expr",
            "points": 1,
            "prompt_latex": "Упростите выражение $x^2 - 1$",
            "answer": {"value": "(x-1)*(x+1)"},
        },
        "drag_drop": {
            "id": "q_001",
            "type": "drag_drop",
            "points": 3,
            "prompt_latex": "Распределите элементы по категориям",
            "zones": [
                {"id": "zone_a", "label": "Категория A"},
                {"id": "zone_b", "label": "Категория B"},
            ],
            "items": [
                {"id": "item_1", "label": "Элемент 1"},
                {"id": "item_2", "label": "Элемент 2"},
                {"id": "item_3", "label": "Элемент 3"},
            ],
            "answer": {
                "zones": {
                    "zone_a": ["item_1", "item_3"],
                    "zone_b": ["item_2"],
                }
            },
        },
        "matching": {
            "id": "q_001",
            "type": "matching",
            "points": 3,
            "prompt_latex": "Соедините понятия с определениями",
            "left_items": [
                {"id": "L1", "label": "Понятие 1"},
                {"id": "L2", "label": "Понятие 2"},
                {"id": "L3", "label": "Понятие 3"},
            ],
            "right_items": [
                {"id": "R1", "label": "Определение 1"},
                {"id": "R2", "label": "Определение 2"},
                {"id": "R3", "label": "Определение 3"},
            ],
            "answer": {"pairs": [["L1", "R1"], ["L2", "R3"], ["L3", "R2"]]},
        },
        "ordering": {
            "id": "q_001",
            "type": "ordering",
            "points": 2,
            "prompt_latex": "Расставьте шаги в правильном порядке",
            "order_items": [
                {"id": "step1", "label": "Шаг 1"},
                {"id": "step2", "label": "Шаг 2"},
                {"id": "step3", "label": "Шаг 3"},
            ],
            "answer": {"order": ["step1", "step2", "step3"]},
        },
        "rating": {
            "id": "q_001",
            "type": "rating",
            "points": 1,
            "prompt_latex": "Оцените по шкале от 1 до 5",
            "rating_labels": ["Очень плохо", "Плохо", "Нейтрально", "Хорошо", "Отлично"],
            "answer": {"min": 1, "max": 5},
        },
        "fill_blank": {
            "id": "q_001",
            "type": "fill_blank",
            "points": 2,
            "prompt_latex": "Заполните пропуски",
            "blank_text": "Столица России — ___, а столица Франции — ___.",
            "answer": {"blanks": ["Москва", "Париж"]},
        },
    }
    if qtype not in templates:
        raise HTTPException(status_code=404, detail=f"Шаблон для типа '{qtype}' не найден")
    return {"qtype": qtype, "template": yaml.dump(templates[qtype], allow_unicode=True, default_flow_style=False)}


@router.get("/assignment-template")
def get_assignment_template(_=Depends(get_current_admin)):
    """Получить шаблон полного файла задания."""
    template = {
        "title": "Название задания",
        "description_latex": "Краткое описание задания для ученика.",
        "time_limit_minutes": 0,
        "questions_random": False,
        "questions_limit": 0,
        "questions": [
            {
                "id": "q_001",
                "type": "number",
                "points": 1,
                "prompt_latex": "Вычислите $2 + 2$",
                "answer": {"value": 4, "tol": 0},
            },
            {
                "id": "q_002",
                "type": "mcq",
                "points": 1,
                "prompt_latex": "Выберите правильный ответ",
                "options": ["Вариант A", "Вариант B", "Вариант C"],
                "answer": {"index": 0},
            },
        ],
    }
    return {"content": yaml.dump(template, allow_unicode=True, default_flow_style=False)}


# ─── Запись ────────────────────────────────────────────────────────────────

@router.post("/save")
def save_yaml(data: YamlSaveIn, _=Depends(get_current_admin)):
    """Сохранить YAML-файл (создать или обновить)."""
    _, base_dir = _get_store(data.base)

    # Валидируем YAML
    try:
        parsed = yaml.safe_load(data.content)
        if not isinstance(parsed, dict):
            raise ValueError("YAML должен быть словарём")
    except yaml.YAMLError as e:
        raise HTTPException(status_code=400, detail=f"Ошибка синтаксиса YAML: {e}")

    # Создаём папку класса если нужно
    class_dir = base_dir / data.class_name
    class_dir.mkdir(parents=True, exist_ok=True)

    path = class_dir / f"{data.assignment_id}.yml"
    path.write_text(data.content, encoding="utf-8")

    return {"ok": True, "path": f"{data.class_name}/{data.assignment_id}", "questions_count": len(parsed.get("questions", []))}


@router.post("/create-folder")
def create_folder(class_name: str, base: str = "assignments", _=Depends(get_current_admin)):
    """Создать папку для класса/группы."""
    _, base_dir = _get_store(base)
    folder = base_dir / class_name
    folder.mkdir(parents=True, exist_ok=True)
    return {"ok": True, "path": class_name}


@router.delete("/delete")
def delete_yaml(
    class_name: str = Query(...),
    assignment_id: str = Query(...),
    base: str = Query(default="assignments"),
    _=Depends(get_current_admin),
):
    """Удалить YAML-файл."""
    _, base_dir = _get_store(base)
    path = base_dir / class_name / f"{assignment_id}.yml"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Файл не найден")
    path.unlink()
    return {"ok": True}


@router.post("/validate")
def validate_yaml(data: dict, _=Depends(get_current_admin)):
    """Валидировать YAML-текст без сохранения."""
    content = data.get("content", "")
    try:
        parsed = yaml.safe_load(content)
        if not isinstance(parsed, dict):
            return {"valid": False, "error": "YAML должен быть словарём"}
        questions = parsed.get("questions", [])
        warnings = []
        for i, q in enumerate(questions):
            if not q.get("id"):
                warnings.append(f"Вопрос #{i+1}: отсутствует поле 'id'")
            if not q.get("type"):
                warnings.append(f"Вопрос #{i+1}: отсутствует поле 'type'")
        return {
            "valid": True,
            "title": parsed.get("title", ""),
            "questions_count": len(questions),
            "max_score": sum(q.get("points", 1) for q in questions),
            "warnings": warnings,
        }
    except yaml.YAMLError as e:
        return {"valid": False, "error": str(e)}
