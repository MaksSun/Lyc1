from __future__ import annotations
from typing import Any, Tuple, Optional, List

from sympy import sympify, simplify
from sympy.core.sympify import SympifyError

ALLOWED_SYMBOLS = {"pi": __import__("sympy").pi, "E": __import__("sympy").E}


def _as_float(x: Any) -> float:
    if isinstance(x, (int, float)):
        return float(x)
    if isinstance(x, str):
        return float(x.replace(",", ".").strip())
    raise ValueError("not a number")


def grade(qtype: str, correct: Optional[dict], answer: Any, points: int = 1) -> Tuple[bool, int, dict]:
    """
    Проверяет ответ студента.
    Возвращает (is_correct, score, meta).
    score может быть дробным (для частично правильных ответов).
    """
    correct = correct or {}
    meta: dict = {}

    # ─── Числовой ответ ──────────────────────────────────────────────────
    if qtype == "number":
        try:
            cv = _as_float(correct.get("value"))
            tol = float(correct.get("tol", 0.0))
            av = _as_float(answer.get("value") if isinstance(answer, dict) else answer)
            ok = abs(av - cv) <= tol
            meta.update({"student": av, "correct": cv, "tol": tol})
            return ok, (points if ok else 0), meta
        except Exception as e:
            return False, 0, {"error": f"bad number answer: {e}"}

    # ─── Одиночный выбор (MCQ) ───────────────────────────────────────────
    if qtype == "mcq":
        try:
            ai = int(answer.get("index")) if isinstance(answer, dict) else int(answer)
            ci = int(correct.get("index"))
            ok = (ai == ci)
            meta.update({"student_index": ai, "correct_index": ci})
            return ok, (points if ok else 0), meta
        except Exception:
            return False, 0, {"error": "bad mcq answer"}

    # ─── Множественный выбор (несколько правильных) ──────────────────────
    if qtype == "multichoice":
        try:
            # correct: {"indices": [0, 2, 3]}
            # answer: {"indices": [0, 2, 3]} или [0, 2, 3]
            correct_set = set(int(i) for i in (correct.get("indices") or []))
            if isinstance(answer, dict):
                student_set = set(int(i) for i in (answer.get("indices") or []))
            elif isinstance(answer, list):
                student_set = set(int(i) for i in answer)
            else:
                student_set = set()

            # Частичный балл: за каждый правильно выбранный/не выбранный вариант
            total_options = correct.get("total_options", max(correct_set) + 1 if correct_set else len(student_set) or 1)
            # Пустой ответ — всегда 0 баллов
            if len(student_set) == 0:
                meta.update({"student_indices": [], "correct_indices": sorted(correct_set), "ratio": 0.0})
                return False, 0, meta

            if not correct_set:
                # Нет правильных вариантов — правильно если студент тоже ничего не выбрал
                ok = (len(student_set) == 0)
                meta.update({"student_indices": sorted(student_set), "correct_indices": [], "ratio": 1.0 if ok else 0.0})
                return ok, (points if ok else 0), meta
            ok = (student_set == correct_set)
            # 1 балл — только «всё или ничего»
            if points <= 1:
                sc = points if ok else 0
                ratio = 1.0 if ok else 0.0
            else:
                # 2+ балла: за каждый правильно выбранный +1, за каждый неправильный -1, мин 0
                correct_selected = len(correct_set & student_set)
                wrong_selected = len(student_set - correct_set)
                ratio = max(0.0, (correct_selected - wrong_selected) / len(correct_set))
                sc = round(points * ratio)
            meta.update({
                "student_indices": sorted(student_set),
                "correct_indices": sorted(correct_set),
                "ratio": ratio,
            })
            return ok, sc, meta
        except Exception as e:
            return False, 0, {"error": f"bad multichoice answer: {e}"}

    # ─── Короткий текст ──────────────────────────────────────────────────
    if qtype == "shorttext":
        cv = str(correct.get("value", "")).strip().casefold()
        av = str(answer.get("value") if isinstance(answer, dict) else answer).strip().casefold()
        # Поддержка нескольких правильных ответов через список
        correct_values = correct.get("values")
        if correct_values:
            ok = av in [str(v).strip().casefold() for v in correct_values]
        else:
            ok = (av == cv and cv != "")
        meta.update({"student": av, "correct": cv})
        return ok, (points if ok else 0), meta

    # ─── Длинный текст (анкета — всегда засчитывается) ───────────────────
    if qtype == "text_long":
        av = str(answer.get("value") if isinstance(answer, dict) else answer).strip()
        # Для анкет нет правильного ответа — засчитываем если не пустой
        ok = len(av) > 0
        meta.update({"student": av})
        return ok, (points if ok else 0), meta

    # ─── Математическое выражение ────────────────────────────────────────
    if qtype == "expr":
        try:
            cv = str(correct.get("value", "")).strip()
            av = str(answer.get("value") if isinstance(answer, dict) else answer).strip()
            if not cv or not av:
                return False, 0, {"error": "empty expr"}
            ce = sympify(cv, locals=ALLOWED_SYMBOLS)
            ae = sympify(av, locals=ALLOWED_SYMBOLS)
            ok = simplify(ae - ce) == 0
            meta.update({"student": av, "correct": cv})
            return ok, (points if ok else 0), meta
        except (SympifyError, Exception) as e:
            return False, 0, {"error": f"bad expr: {e}"}

    # ─── Drag & Drop (перетаскивание в зоны) ─────────────────────────────
    if qtype == "drag_drop":
        """
        correct: {"zones": {"zone_a": "item_1", "zone_b": "item_2"}}
           или  {"zones": {"zone_a": ["item_1", "item_2"], "zone_b": ["item_3"]}}
        answer:  {"zones": {"zone_a": "item_1", "zone_b": "item_2"}}
        """
        try:
            # Поддерживаем два формата:
            # 1) {zones: {zone_a: [...], zone_b: [...]}}  — старый формат
            # 2) {zone_a: [...], zone_b: [...]}           — плоский YAML-формат
            if isinstance(correct, dict) and "zones" in correct:
                correct_zones = correct.get("zones") or {}
            elif isinstance(correct, dict):
                correct_zones = correct  # плоский формат
            else:
                correct_zones = {}

            if isinstance(answer, dict):
                if "zones" in answer:
                    student_zones = answer.get("zones") or {}
                else:
                    student_zones = answer  # плоский формат
            else:
                return False, 0, {"error": "bad drag_drop answer format"}

            if not correct_zones:
                return False, 0, {"error": "no correct zones defined"}

            correct_count = 0
            total = len(correct_zones)
            zone_results = {}

            for zone_id, correct_items in correct_zones.items():
                student_items = student_zones.get(zone_id)
                # Нормализуем к множеству строк
                if isinstance(correct_items, list):
                    c_set = set(str(x) for x in correct_items)
                else:
                    c_set = {str(correct_items)}
                if isinstance(student_items, list):
                    s_set = set(str(x) for x in student_items)
                elif student_items is not None:
                    s_set = {str(student_items)}
                else:
                    s_set = set()

                zone_ok = (c_set == s_set)
                if zone_ok:
                    correct_count += 1
                zone_results[zone_id] = {
                    "correct": sorted(c_set),
                    "student": sorted(s_set),
                    "ok": zone_ok,
                }

            ok = (correct_count == total)
            sc = round(points * correct_count / total) if total > 0 else 0
            meta.update({"zones": zone_results, "correct_count": correct_count, "total": total})
            return ok, sc, meta
        except Exception as e:
            return False, 0, {"error": f"bad drag_drop answer: {e}"}

    # ─── Matching (соединение пар, 1-к-1) ──────────────────────────────────────
    if qtype == "matching":
        """
        correct: {"pairs": [["A", "1"], ["B", "2"], ["C", "3"]]}
           или   {l1: r2, l2: r3, l3: r1}  (плоский формат YAML)
        answer:  {"pairs": {"A": "1", "B": "2", "C": "3"}}
           или   {"A": "1", "B": "2"}
        """
        try:
            correct_pairs_raw = correct.get("pairs") or correct
            # Нормализуем к словарю {left: right}
            if isinstance(correct_pairs_raw, list):
                correct_map = {str(p[0]): str(p[1]) for p in correct_pairs_raw if len(p) >= 2}
            elif isinstance(correct_pairs_raw, dict):
                correct_map = {str(k): str(v) for k, v in correct_pairs_raw.items()}
            else:
                correct_map = {}

            if isinstance(answer, dict):
                pairs_raw = answer.get("pairs") or answer
                if isinstance(pairs_raw, list):
                    student_map = {str(p[0]): str(p[1]) for p in pairs_raw if len(p) >= 2}
                else:
                    student_map = {str(k): str(v) for k, v in pairs_raw.items()}
            else:
                return False, 0, {"error": "bad matching answer format"}

            if not correct_map:
                return False, 0, {"error": "no correct pairs defined"}

            total = len(correct_map)
            correct_count = sum(
                1 for left, right in correct_map.items()
                if student_map.get(left) == right
            )
            ok = (correct_count == total)
            sc = round(points * correct_count / total) if total > 0 else 0
            meta.update({
                "correct_map": correct_map,
                "student_map": student_map,
                "correct_count": correct_count,
                "total": total,
            })
            return ok, sc, meta
        except Exception as e:
            return False, 0, {"error": f"bad matching answer: {e}"}

    # ─── Matching многие-к-одному (один элемент → несколько) ──────────────────
    if qtype == "matching_multi":
        """
        correct: {l1: [r1, r2], l2: [r3]}  (один левый → несколько правых)
        answer:  {l1: [r1, r2], l2: [r3]}
        Баллы: по количеству правильных пар (каждая пара left_id+right_id)
        """
        try:
            # Строим множество правильных пар (left_id, right_id)
            correct_pairs: set = set()
            if isinstance(correct, dict):
                for lid, rids in correct.items():
                    if lid == "pairs":  # если завёрнуто в {pairs: {...}}
                        inner = rids
                        if isinstance(inner, dict):
                            for l2, r2s in inner.items():
                                if isinstance(r2s, list):
                                    for r2 in r2s:
                                        correct_pairs.add((str(l2), str(r2)))
                                else:
                                    correct_pairs.add((str(l2), str(r2s)))
                        continue
                    if isinstance(rids, list):
                        for rid in rids:
                            correct_pairs.add((str(lid), str(rid)))
                    else:
                        correct_pairs.add((str(lid), str(rids)))

            # Строим множество ответов студента
            student_pairs: set = set()
            if isinstance(answer, dict):
                ans_data = answer.get("pairs", answer)
                if isinstance(ans_data, dict):
                    for lid, rids in ans_data.items():
                        if isinstance(rids, list):
                            for rid in rids:
                                student_pairs.add((str(lid), str(rid)))
                        else:
                            student_pairs.add((str(lid), str(rids)))

            if not correct_pairs:
                return False, 0, {"error": "no correct pairs defined"}

            total = len(correct_pairs)
            correct_count = len(correct_pairs & student_pairs)
            ok = (correct_count == total and len(student_pairs) == total)
            sc = round(points * correct_count / total) if total > 0 else 0
            meta.update({
                "correct_pairs": sorted(correct_pairs),
                "student_pairs": sorted(student_pairs),
                "correct_count": correct_count,
                "total": total,
            })
            return ok, sc, meta
        except Exception as e:
            return False, 0, {"error": f"bad matching_multi answer: {e}"}

    # ─── Ordering (расстановка в порядке) ────────────────────────────────
    if qtype == "ordering":
        """
        correct: {"order": ["step1", "step2", "step3", "step4"]}
        answer:  {"order": ["step1", "step3", "step2", "step4"]}
        """
        try:
            correct_order = [str(x) for x in (correct.get("order") or [])]
            if isinstance(answer, dict):
                student_order = [str(x) for x in (answer.get("order") or [])]
            elif isinstance(answer, list):
                student_order = [str(x) for x in answer]
            else:
                return False, 0, {"error": "bad ordering answer format"}

            if not correct_order:
                return False, 0, {"error": "no correct order defined"}

            total = len(correct_order)
            correct_count = sum(
                1 for i, item in enumerate(correct_order)
                if i < len(student_order) and student_order[i] == item
            )
            ok = (student_order == correct_order)
            sc = round(points * correct_count / total) if total > 0 else 0
            meta.update({
                "correct_order": correct_order,
                "student_order": student_order,
                "correct_count": correct_count,
                "total": total,
            })
            return ok, sc, meta
        except Exception as e:
            return False, 0, {"error": f"bad ordering answer: {e}"}

    # ─── Шкала оценки (для анкет) ────────────────────────────────────────
    if qtype == "rating":
        """
        correct: {"min": 1, "max": 5}  (просто диапазон, всегда засчитывается)
        answer:  {"value": 4}
        """
        try:
            av = int(answer.get("value") if isinstance(answer, dict) else answer)
            min_val = int(correct.get("min", 1))
            max_val = int(correct.get("max", 5))
            ok = (min_val <= av <= max_val)
            meta.update({"student": av, "min": min_val, "max": max_val})
            return ok, (points if ok else 0), meta
        except Exception as e:
            return False, 0, {"error": f"bad rating answer: {e}"}

    # ─── Заполнение пропусков ────────────────────────────────────────────
    if qtype == "fill_blank":
        """
        correct: {"blanks": ["ответ1", "ответ2"]}
        answer:  {"blanks": ["ответ1", "ответ2"]}
        """
        try:
            correct_blanks = [str(v).strip().casefold() for v in (correct.get("blanks") or [])]
            if isinstance(answer, dict):
                student_blanks = [str(v).strip().casefold() for v in (answer.get("blanks") or [])]
            elif isinstance(answer, list):
                student_blanks = [str(v).strip().casefold() for v in answer]
            else:
                return False, 0, {"error": "bad fill_blank format"}

            if not correct_blanks:
                return False, 0, {"error": "no correct blanks defined"}

            total = len(correct_blanks)
            correct_count = sum(
                1 for i, cb in enumerate(correct_blanks)
                if i < len(student_blanks) and student_blanks[i] == cb
            )
            ok = (correct_count == total)
            sc = round(points * correct_count / total) if total > 0 else 0
            meta.update({
                "correct_blanks": correct_blanks,
                "student_blanks": student_blanks,
                "correct_count": correct_count,
            })
            return ok, sc, meta
        except Exception as e:
            return False, 0, {"error": f"bad fill_blank: {e}"}

    # ─── Table fill (заполнение таблицы текстом) ─────────────────────────────────────
    if qtype == "table_fill":
        """
        correct: {"cells": {"row_id:col_id": "answer", ...}}
        answer:  {"cells": {"row_id:col_id": "student_answer", ...}}
                 или плоский: {"row_id:col_id": "student_answer", ...}
        Баллы: по количеству правильно заполненных ячеек
        """
        try:
            correct_cells = correct.get("cells") or {}
            if isinstance(answer, dict):
                # Принимаем оба формата: {cells: {...}} и плоский {key: val}
                if "cells" in answer:
                    student_cells = answer.get("cells") or {}
                else:
                    student_cells = answer
            else:
                return False, 0, {"error": "bad table_fill format"}

            if not correct_cells:
                return False, 0, {"error": "no correct cells defined"}

            total = len(correct_cells)
            correct_count = 0
            cell_results = {}
            for cell_key, cv in correct_cells.items():
                sv = student_cells.get(cell_key, "")
                cell_ok = str(sv).strip().casefold() == str(cv).strip().casefold()
                if cell_ok:
                    correct_count += 1
                cell_results[cell_key] = {"correct": cv, "student": sv, "ok": cell_ok}

            ok = (correct_count == total)
            sc = round(points * correct_count / total) if total > 0 else 0
            meta.update({
                "cells": cell_results,
                "correct_count": correct_count,
                "total": total,
            })
            return ok, sc, meta
        except Exception as e:
            return False, 0, {"error": f"bad table_fill: {e}"}

    # ─── Table select (выбор из списка для ячеек) ─────────────────────────────────
    if qtype == "table_select":
        """
        correct: {"cells": {"row_id:col_id": "option_id", ...}}
        answer:  {"cells": {"row_id:col_id": "option_id", ...}}
                 или плоский: {"row_id:col_id": "option_id", ...}
        То же что table_fill, но сравнение точное (не casefold)
        """
        try:
            correct_cells = correct.get("cells") or {}
            if isinstance(answer, dict):
                # Принимаем оба формата: {cells: {...}} и плоский {key: val}
                if "cells" in answer:
                    student_cells = answer.get("cells") or {}
                else:
                    student_cells = answer
            else:
                return False, 0, {"error": "bad table_select format"}

            if not correct_cells:
                return False, 0, {"error": "no correct cells defined"}

            total = len(correct_cells)
            correct_count = 0
            cell_results = {}
            for cell_key, cv in correct_cells.items():
                sv = student_cells.get(cell_key, "")
                cell_ok = str(sv).strip() == str(cv).strip()
                if cell_ok:
                    correct_count += 1
                cell_results[cell_key] = {"correct": cv, "student": sv, "ok": cell_ok}

            ok = (correct_count == total)
            sc = round(points * correct_count / total) if total > 0 else 0
            meta.update({
                "cells": cell_results,
                "correct_count": correct_count,
                "total": total,
            })
            return ok, sc, meta
        except Exception as e:
            return False, 0, {"error": f"bad table_select: {e}"}

    return False, 0, {"error": f"unknown qtype: {qtype}"}
