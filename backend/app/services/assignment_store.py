from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

import yaml


# Минимальная "нормализация" похожих кириллических/латинских букв.
# Этого достаточно, чтобы "5А" (кирилл) находил папку "5A" (лат).
_CONFUSABLES = str.maketrans({
    "А": "A", "а": "a",
    "В": "B", "в": "b",
    "Е": "E", "е": "e",
    "К": "K", "к": "k",
    "М": "M", "м": "m",
    "Н": "H", "н": "h",
    "О": "O", "о": "o",
    "Р": "P", "р": "p",
    "С": "C", "с": "c",
    "Т": "T", "т": "t",
    "Х": "X", "х": "x",
})


def _norm_key(s: str) -> str:
    return (s or "").translate(_CONFUSABLES).strip().casefold()


# ─── Нормализация вопроса ──────────────────────────────────────────────────────

def _normalize_question(q: Dict[str, Any]) -> Dict[str, Any]:
    """
    Нормализует вопрос из YAML — поддерживает альтернативные имена полей:
    - prompt / prompt_latex / text → prompt_latex
    - type: choice → mcq
    - type: select → mcq
    - answer как строка/число → answer: {value: ...} или {index: ...}
    - items (для ordering) → order_items
    - randomize / random_count → нормализуются на уровне задания
    """
    q = dict(q)  # копия чтобы не мутировать оригинал

    # Нормализуем поле текста вопроса
    if "prompt_latex" not in q:
        for alt in ("prompt", "text", "question", "label"):
            if alt in q:
                q["prompt_latex"] = str(q[alt])
                break
    if "prompt_latex" not in q:
        q["prompt_latex"] = ""

    # Нормализуем тип вопроса
    qtype = str(q.get("type", "number")).strip().lower()
    type_aliases = {
        "choice": "mcq",
        "select": "mcq",
        "single": "mcq",
        "single_choice": "mcq",
        "multiple": "multichoice",
        "multiple_choice": "multichoice",
        "multi": "multichoice",
        "text": "shorttext",
        "short_text": "shorttext",
        "short": "shorttext",
        "long_text": "text_long",
        "essay": "text_long",
        "order": "ordering",
        "sort": "ordering",
        "drag": "drag_drop",
        "match": "matching",
        "pairs": "matching",
        "matching_multiple": "matching_multi",
        "match_multi": "matching_multi",
        "table": "table_fill",
        "table_input": "table_fill",
        "table_dropdown": "table_select",
        "fill": "fill_blank",
        "blank": "fill_blank",
        "fill_in": "fill_blank",
        "expression": "expr",
        "formula": "expr",
        "numeric": "number",
        "num": "number",
        "integer": "number",
        "float": "number",
    }
    qtype = type_aliases.get(qtype, qtype)
    q["type"] = qtype

    # Нормализуем items для ordering: items → order_items
    if qtype == "ordering" and "items" in q and "order_items" not in q:
        q["order_items"] = q["items"]

    # Нормализуем table_rows: добавляем id строкам и ячейкам если их нет
    if qtype in ("table_fill", "table_select") and "table_rows" in q:
        normalized_rows = []
        for row_idx, row in enumerate(q["table_rows"]):
            if isinstance(row, dict):
                row = dict(row)
                # Генерируем id строки если нет
                if "id" not in row or not row["id"]:
                    row["id"] = f"row{row_idx + 1}"
                # Нормализуем ячейки
                raw_cells = row.get("cells", [])
                norm_cells = []
                for cell_idx, cell in enumerate(raw_cells):
                    if isinstance(cell, str):
                        # Строка "?" → объект {id: "c1", placeholder: "?"}
                        norm_cells.append({"id": f"c{cell_idx + 1}", "placeholder": cell if cell != "?" else ""})
                    elif isinstance(cell, dict):
                        cell = dict(cell)
                        if "id" not in cell or not cell["id"]:
                            cell["id"] = f"c{cell_idx + 1}"
                        norm_cells.append(cell)
                    else:
                        norm_cells.append({"id": f"c{cell_idx + 1}", "placeholder": ""})
                row["cells"] = norm_cells
            normalized_rows.append(row)
        q["table_rows"] = normalized_rows

    # Нормализуем table_headers: если первый заголовок пустой или является меткой строк — убираем его
    # (первый столбец в TableQuestion уже занят метками строк)
    if qtype in ("table_fill", "table_select") and "table_headers" in q:
        headers = q["table_headers"]
        if isinstance(headers, list) and len(headers) > 0:
            first = str(headers[0]).strip()
            # Убираем первый заголовок если он пустой или содержит слова "Устройство", "Название", "Элемент"
            # или если количество заголовков на 1 больше количества ячеек в строке
            num_cells = max((len(r.get("cells", [])) for r in q.get("table_rows", []) if isinstance(r, dict)), default=0)
            if first == "" or (len(headers) == num_cells + 1):
                q["table_headers"] = headers[1:]

    # Нормализуем answer
    raw_answer = q.get("answer")
    if raw_answer is not None:
        q["answer"] = _normalize_answer(qtype, raw_answer, q)

    # Нормализуем options: если список объектов {id, label} — оставляем как есть
    # (student.py уже умеет их нормализовать при отдаче фронтенду)

    return q


def _normalize_answer(qtype: str, raw: Any, q: Dict[str, Any]) -> Dict[str, Any]:
    """
    Нормализует поле answer к стандартному формату dict.
    Поддерживает сокращённые форматы:
    - number: answer: 5  →  answer: {value: 5, tol: 0}
    - mcq: answer: b  →  answer: {index: <индекс опции b>}
    - mcq: answer: 1  →  answer: {index: 1}
    - multichoice: answer: [a, c]  →  answer: {indices: [<индексы>], total_options: N}
    - ordering: answer: [id1, id2]  →  answer: {order: [id1, id2]}
    - shorttext: answer: "текст"  →  answer: {value: "текст"}
    - expr: answer: "x+1"  →  answer: {value: "x+1"}
    """
    # Для table_fill/table_select нужно обернуть плоский dict в {cells: {...}}
    if qtype in ("table_fill", "table_select") and isinstance(raw, dict):
        if "cells" in raw:
            return raw  # уже нормализован
        # Проверяем: если значения являются массивами — это формат {label: [val1, val2, ...]}
        # нужно преобразовать в {cells: {"rowId:c1": val1, "rowId:c2": val2}}
        if any(isinstance(v, list) for v in raw.values()):
            table_rows = q.get("table_rows") or []
            # Строим словарь label → row_id
            label_to_row = {}
            for row in table_rows:
                if isinstance(row, dict):
                    label_to_row[str(row.get("label", ""))] = row.get("id", "")
            cells = {}
            for label_key, vals in raw.items():
                row_id = label_to_row.get(str(label_key), str(label_key))
                if isinstance(vals, list):
                    for i, val in enumerate(vals):
                        cells[f"{row_id}:c{i + 1}"] = str(val)
                else:
                    cells[f"{row_id}:c1"] = str(vals)
            return {"cells": cells}
        return {"cells": {str(k): str(v) for k, v in raw.items()}}

    if isinstance(raw, dict):
        return raw  # уже нормализован

    if qtype == "number":
        try:
            return {"value": float(str(raw).replace(",", ".")), "tol": 0}
        except Exception:
            return {"value": raw, "tol": 0}

    if qtype in ("mcq", "choice", "select"):
        # Если ответ — строка (id варианта), ищем индекс в options
        options = q.get("options") or []
        if isinstance(raw, str):
            for i, opt in enumerate(options):
                if isinstance(opt, dict):
                    if str(opt.get("id", "")).strip() == raw.strip():
                        return {"index": i}
                    if str(opt.get("label", "")).strip().casefold() == raw.strip().casefold():
                        return {"index": i}
                else:
                    if str(opt).strip().casefold() == raw.strip().casefold():
                        return {"index": i}
            # Если не нашли по id — пробуем как число
            try:
                return {"index": int(raw)}
            except Exception:
                return {"index": 0}
        if isinstance(raw, int):
            return {"index": raw}
        return {"index": 0}

    if qtype == "multichoice":
        options = q.get("options") or []
        if isinstance(raw, list):
            indices = []
            for item in raw:
                if isinstance(item, int):
                    indices.append(item)
                else:
                    # Ищем по id
                    for i, opt in enumerate(options):
                        if isinstance(opt, dict):
                            if str(opt.get("id", "")).strip() == str(item).strip():
                                indices.append(i)
                                break
                        else:
                            if str(opt).strip().casefold() == str(item).strip().casefold():
                                indices.append(i)
                                break
            return {"indices": indices, "total_options": len(options)}
        return {"indices": [], "total_options": len(options)}

    if qtype == "ordering":
        if isinstance(raw, list):
            return {"order": [str(x) for x in raw]}
        return {"order": []}

    if qtype in ("shorttext", "text_long", "expr"):
        return {"value": str(raw)}

    if qtype == "fill_blank":
        if isinstance(raw, list):
            return {"blanks": [str(x) for x in raw]}
        return {"blanks": [str(raw)]}

    if qtype in ("table_fill", "table_select"):
        # Поддерживаем оба формата: уже {cells: {...}} или плоский {key: val}
        if isinstance(raw, dict):
            if "cells" in raw:
                return raw  # уже нормализован
            return {"cells": {str(k): str(v) for k, v in raw.items()}}
        return {"cells": {}}

    if qtype == "matching_multi":
        # Поддерживаем {left_id: [right_id1, right_id2]} — уже правильный формат
        if isinstance(raw, dict):
            return raw
        return {}

    if qtype in ("matching", "match", "pairs", "correspondence"):
        # Поддерживаем {left_id: right_id} — уже правильный формат
        if isinstance(raw, dict):
            return raw
        return {}

    # Для остальных типов — возвращаем как есть
    return {"value": raw}


def _normalize_assignment(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Нормализует весь файл задания:
    - randomize / shuffle → questions_random
    - random_count / count / limit → questions_limit
    - time_limit / time / duration → time_limit_minutes
    - description / desc → description_latex
    - questions: нормализует каждый вопрос
    """
    data = dict(data)

    # Нормализуем поля задания
    if "questions_random" not in data:
        for alt in ("randomize", "shuffle", "random", "shuffle_questions"):
            if alt in data:
                data["questions_random"] = bool(data[alt])
                break

    if "questions_limit" not in data:
        for alt in ("random_count", "count", "limit", "questions_count", "num_questions"):
            if alt in data:
                try:
                    data["questions_limit"] = int(data[alt])
                except Exception:
                    data["questions_limit"] = 0
                break

    if "time_limit_minutes" not in data:
        for alt in ("time_limit", "time", "duration", "duration_minutes", "minutes"):
            if alt in data:
                try:
                    data["time_limit_minutes"] = int(data[alt])
                except Exception:
                    data["time_limit_minutes"] = 0
                break

    if "description_latex" not in data:
        for alt in ("description", "desc", "subtitle", "intro"):
            if alt in data:
                data["description_latex"] = str(data[alt])
                break

    # Нормализуем вопросы
    questions = data.get("questions") or []
    data["questions"] = [_normalize_question(q) for q in questions]

    return data


@dataclass
class AssignmentMeta:
    class_name: str
    assignment_id: str
    title: str
    description_latex: str
    max_score: int
    raw: Dict[str, Any]


class AssignmentStore:
    def __init__(self, base_dir: Path):
        self.base_dir = Path(base_dir)

    def _resolve_class_dir(self, class_name: str) -> Path:
        # 1) точное совпадение
        direct = self.base_dir / class_name
        if direct.exists() and direct.is_dir():
            return direct

        # 2) поиск по нормализованному ключу
        key = _norm_key(class_name)
        candidates: List[Path] = []
        for d in self.base_dir.iterdir():
            if d.is_dir() and _norm_key(d.name) == key:
                candidates.append(d)

        if len(candidates) == 1:
            return candidates[0]

        if len(candidates) > 1:
            for c in candidates:
                if c.name.casefold() == (class_name or "").casefold():
                    return c
            return candidates[0]

        raise FileNotFoundError(f"Class folder not found for '{class_name}' in {self.base_dir}")

    def list_classes(self) -> List[str]:
        if not self.base_dir.exists():
            return []
        return sorted([d.name for d in self.base_dir.iterdir() if d.is_dir()])

    def _load_yaml(self, path: Path) -> Dict[str, Any]:
        with path.open("r", encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
        return _normalize_assignment(raw)

    def _meta_from_yaml(self, class_name: str, assignment_id: str, data: Dict[str, Any]) -> AssignmentMeta:
        title = str(data.get("title") or assignment_id)
        description_latex = str(data.get("description_latex") or "")
        questions = data.get("questions") or []
        max_score = 0
        try:
            for q in questions:
                max_score += int(q.get("points", 1))
        except Exception:
            max_score = 0

        return AssignmentMeta(
            class_name=class_name,
            assignment_id=assignment_id,
            title=title,
            description_latex=description_latex,
            max_score=max_score,
            raw=data,
        )

    def list_all(self) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for class_dir in self.list_classes():
            out.extend(self.list_class(class_dir))
        return out

    def list_class(self, class_name: str) -> List[Dict[str, Any]]:
        class_dir = self._resolve_class_dir(class_name)
        res: List[Dict[str, Any]] = []
        for p in sorted(class_dir.glob("*.yml")):
            assignment_id = p.stem
            data = self._load_yaml(p)
            meta = self._meta_from_yaml(class_dir.name, assignment_id, data)
            res.append({
                "class_name": meta.class_name,
                "id": meta.assignment_id,
                "title": meta.title,
                "description_latex": meta.description_latex,
                "max_score": meta.max_score,
            })
        return res

    # Backward-compat alias (older code used this name)
    def list_for_class(self, class_name: str) -> List[Dict[str, Any]]:
        return self.list_class(class_name)

    def get(self, class_name: str, assignment_id: str) -> AssignmentMeta:
        class_dir = self._resolve_class_dir(class_name)
        path = class_dir / f"{assignment_id}.yml"
        if not path.exists():
            raise FileNotFoundError(str(path))
        data = self._load_yaml(path)
        return self._meta_from_yaml(class_dir.name, assignment_id, data)

    def delete_file(self, class_name: str, assignment_id: str) -> None:
        class_dir = self._resolve_class_dir(class_name)
        path = class_dir / f"{assignment_id}.yml"
        if not path.exists():
            raise FileNotFoundError(str(path))
        path.unlink()
