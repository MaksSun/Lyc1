from __future__ import annotations
from pathlib import Path
from typing import Any
from datetime import date, datetime
import calendar
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select
from ..core.security import create_access_token
from ..db import get_session
from ..deps import get_current_student
from ..models import Answer, Attempt, ClassRoom, Student, DailyAssignment, LoginLog, StudentHeartbeat
from ..schemas import (
    FileAssignmentOut,
    FileAssignmentWithQuestions,
    FileQuestionOut,
    StudentLoginIn,
    StudentOut,
    SubmitIn,
    SubmitOut,
    TokenOut,
    StudentScheduleItemOut,
    AttemptDetailOut,
    AnswerDetailOut,
)
from ..services.assignment_store import AssignmentStore
from ..services.grading import grade
import random
from urllib.parse import quote

router = APIRouter(prefix="/api/student", tags=["student"])

STORE = AssignmentStore(base_dir=Path(__file__).resolve().parents[2] / "assignments")


@router.post("/login", response_model=TokenOut)
def student_login(data: StudentLoginIn, request: Request, session: Session = Depends(get_session)):
    st = session.exec(select(Student).where(Student.code == data.code.strip())).first()
    if not st:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный код")
    token = create_access_token(subject=str(st.id), role="student")
    # Записываем вход в журнал
    try:
        cl = session.exec(select(ClassRoom).where(ClassRoom.id == st.class_id)).first()
        ua_str = request.headers.get("user-agent", "")
        ip = request.headers.get("x-forwarded-for", request.client.host if request.client else None)
        if ip and "," in ip:
            ip = ip.split(",")[0].strip()
        device_type = None
        browser = None
        os_name = None
        try:
            from user_agents import parse as ua_parse
            ua = ua_parse(ua_str)
            device_type = "mobile" if ua.is_mobile else ("tablet" if ua.is_tablet else "pc")
            browser = ua.browser.family
            os_name = ua.os.family
        except Exception:
            pass
        log = LoginLog(
            student_id=st.id,
            student_name=st.name,
            class_name=cl.name if cl else "",
            ip_address=ip,
            user_agent=ua_str[:500] if ua_str else None,
            device_type=device_type,
            browser=browser,
            os=os_name,
        )
        session.add(log)
        session.commit()
    except Exception:
        pass
    return TokenOut(access_token=token)


@router.get("/me", response_model=StudentOut)
def student_me(student: Student = Depends(get_current_student), session: Session = Depends(get_session)):
    cl = session.exec(select(ClassRoom).where(ClassRoom.id == student.class_id)).first()
    return StudentOut(
        id=student.id,
        name=student.name,
        code=student.code,
        class_id=student.class_id,
        class_name=cl.name if cl else "—",
    )


@router.get("/assignments", response_model=list[FileAssignmentOut])
def list_assignments(student: Student = Depends(get_current_student), session: Session = Depends(get_session)):
    cl = session.exec(select(ClassRoom).where(ClassRoom.id == student.class_id)).first()
    if not cl:
        return []
    today = date.today()
    items = session.exec(
        select(DailyAssignment)
        .where(DailyAssignment.class_id == cl.id)
        .where(DailyAssignment.date == today)
    ).all()
    limit_n = int(getattr(cl, "student_assign_limit", 0) or 0)
    do_random = bool(getattr(cl, "student_assign_random", False))
    arr = sorted(items, key=lambda x: (x.assignment_id, x.id or 0))
    if do_random and len(arr) > 1:
        rng = random.Random(f"{student.id}:{student.code}:{today.isoformat()}")
        rng.shuffle(arr)
    if limit_n > 0:
        arr = arr[:limit_n]
    class_name = cl.name
    out = []
    for it in arr:
        try:
            a = STORE.get(class_name, it.assignment_id)
            out.append(FileAssignmentOut(
                id=a.assignment_id,
                title=a.title,
                description_latex=a.description_latex,
                max_score=a.max_score,
            ))
        except Exception:
            continue
    return out


@router.get("/schedule", response_model=list[StudentScheduleItemOut])
def student_schedule(
    student: Student = Depends(get_current_student),
    session: Session = Depends(get_session),
):
    cl = session.exec(select(ClassRoom).where(ClassRoom.id == student.class_id)).first()
    if not cl:
        return []
    today = date.today()
    first_day = today.replace(day=1)
    last_day_num = calendar.monthrange(today.year, today.month)[1]
    last_day = today.replace(day=last_day_num)
    items = session.exec(
        select(DailyAssignment)
        .where(DailyAssignment.class_id == cl.id)
        .where(DailyAssignment.date >= first_day)
        .where(DailyAssignment.date <= last_day)
        .order_by(DailyAssignment.date.asc())
    ).all()
    return [
        StudentScheduleItemOut(
            date=it.date,
            assignment_id=it.assignment_id,
            title=it.assignment_title,
            max_score=it.max_score,
        )
        for it in items
    ]


@router.get("/assignment/{assignment_id}", response_model=FileAssignmentWithQuestions)
def get_assignment(
    assignment_id: str,
    student: Student = Depends(get_current_student),
    session: Session = Depends(get_session),
):
    cl = session.exec(select(ClassRoom).where(ClassRoom.id == student.class_id)).first()
    if not cl:
        raise HTTPException(status_code=404, detail="Класс не найден")
    try:
        a = STORE.get(cl.name, assignment_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Задание не найдено")

    questions_out = []
    raw = a.raw if hasattr(a, "raw") else {}

    # Читаем настройки из DailyAssignment (если есть) или из YAML
    today = date.today()
    daily = session.exec(
        select(DailyAssignment)
        .where(DailyAssignment.class_id == cl.id)
        .where(DailyAssignment.assignment_id == assignment_id)
        .where(DailyAssignment.date == today)
    ).first()

    # time_limit: DailyAssignment > YAML > 0
    time_limit = 0
    if daily and daily.time_limit_minutes:
        time_limit = daily.time_limit_minutes
    elif raw.get("time_limit_minutes"):
        time_limit = int(raw["time_limit_minutes"])

    # questions_limit + questions_random: DailyAssignment > YAML > 0/False
    q_limit = 0
    q_random = False
    if daily:
        q_limit = daily.questions_limit or 0
        q_random = bool(daily.questions_random)
    if not q_limit and raw.get("questions_limit"):
        q_limit = int(raw["questions_limit"])
    if not q_random and raw.get("questions_random"):
        q_random = bool(raw["questions_random"])

    # max_attempts: DailyAssignment > YAML > 0
    max_attempts = 0
    if daily and daily.max_attempts:
        max_attempts = daily.max_attempts
    elif raw.get("max_attempts"):
        max_attempts = int(raw["max_attempts"])

    # show_correct_answers: DailyAssignment > YAML > True
    show_correct = True
    if daily is not None:
        show_correct = bool(daily.show_correct_answers)
    elif "show_correct_answers" in raw:
        show_correct = bool(raw["show_correct_answers"])

    # Проверяем ограничение попыток
    if max_attempts > 0:
        existing_attempts = session.exec(
            select(Attempt)
            .where(Attempt.student_id == student.id)
            .where(Attempt.assignment_id == assignment_id)
            .where(Attempt.class_name == cl.name)
        ).all()
        if len(existing_attempts) >= max_attempts:
            raise HTTPException(
                status_code=403,
                detail=f"Исчерпан лимит попыток ({max_attempts}). Вы не можете выполнить это задание ещё раз."
            )

    # Выбираем вопросы: случайно или все
    all_questions = raw.get("questions", [])
    if q_random and q_limit and 0 < q_limit < len(all_questions):
        rng = random.Random(f"{student.id}:{assignment_id}:{today.isoformat()}")
        selected_questions = rng.sample(all_questions, q_limit)
    else:
        selected_questions = all_questions

    for q in selected_questions:
        qid = q.get("id", "")
        qtype = q.get("type", "number")
        image_filename = q.get("image")
        image_url = None
        if image_filename:
            encoded_class = quote(cl.name)
            encoded_aid = quote(assignment_id)
            encoded_img = quote(image_filename)
            image_url = f"/assignment-images/{encoded_class}/{encoded_aid}/{encoded_img}"

        # prompt_latex уже нормализован через assignment_store._normalize_question
        prompt_text = q.get("prompt_latex") or q.get("prompt") or q.get("text") or ""

        # Вспомогательная функция: добавляет image_url к объекту {id, label, image}
        def _enrich_item(item, class_n, aid):
            """Добавляет image_url к элементу если есть поле image."""
            if not isinstance(item, dict):
                return item
            img = item.get("image")
            if img:
                ec = quote(class_n)
                ea = quote(aid)
                ei = quote(img)
                return {**item, "image_url": f"/assignment-images/{ec}/{ea}/{ei}"}
            return item

        # Нормализуем options: ВСЕГДА передаём {id, label} объекты (не строки),
        # чтобы фронтенд использовал реальные ID из YAML, а не позиционные индексы
        raw_options = q.get("options")
        options_normalized = None
        if raw_options is not None:
            options_normalized = []
            for i, opt in enumerate(raw_options):
                if isinstance(opt, dict):
                    enriched = _enrich_item(opt, cl.name, assignment_id)
                    out = {
                        "id": str(enriched.get("id", i)),
                        "label": str(enriched.get("label", enriched.get("id", str(i)))),
                    }
                    if enriched.get("image_url"):
                        out["image_url"] = enriched["image_url"]
                    options_normalized.append(out)
                else:
                    # Строка — создаём объект с позиционным id
                    options_normalized.append({"id": str(i), "label": str(opt)})

        # Нормализуем items для ordering: ВСЕГДА передаём {id, label} объекты,
        # чтобы фронтенд использовал реальные ID из YAML, а не позиционные индексы
        order_items = q.get("order_items") or q.get("items")
        order_items_normalized = None
        if order_items and isinstance(order_items, list):
            order_items_normalized = []
            for i, it in enumerate(order_items):
                if isinstance(it, dict):
                    enriched = _enrich_item(it, cl.name, assignment_id)
                    out = {
                        "id": str(enriched.get("id", i)),
                        "label": str(enriched.get("label", enriched.get("id", str(i)))),
                    }
                    if enriched.get("image_url"):
                        out["image_url"] = enriched["image_url"]
                    order_items_normalized.append(out)
                else:
                    # Строка — создаём объект с позиционным id
                    order_items_normalized.append({"id": str(i), "label": str(it)})

        # Нормализуем items для drag_drop (свой ключ items, не order_items)
        drag_items_raw = q.get("items")
        drag_items_normalized = None
        if drag_items_raw and isinstance(drag_items_raw, list):
            drag_items_normalized = []
            for it in drag_items_raw:
                if isinstance(it, dict):
                    enriched = _enrich_item(it, cl.name, assignment_id)
                    drag_items_normalized.append(enriched)
                else:
                    drag_items_normalized.append(str(it))

        # Нормализуем left_items и right_items для matching (с поддержкой картинок)
        def _enrich_items_list(lst):
            if not lst:
                return lst
            return [_enrich_item(it, cl.name, assignment_id) if isinstance(it, dict) else it for it in lst]

        left_items_enriched = _enrich_items_list(q.get("left_items"))
        right_items_enriched = _enrich_items_list(q.get("right_items"))

        # Нормализуем table_rows для table_fill/table_select
        table_rows = q.get("table_rows")
        table_headers = q.get("table_headers")
        table_options = q.get("table_options")

        # Передаём все поля для интерактивных типов вопросов
        questions_out.append(FileQuestionOut(
            id=qid,
            qtype=qtype,
            prompt_latex=prompt_text,
            options=options_normalized,
            zones=q.get("zones"),
            items=drag_items_normalized,  # items используется для drag_drop (items из YAML)
            left_items=left_items_enriched,
            right_items=right_items_enriched,
            order_items=order_items_normalized,
            blank_text=q.get("blank_text"),
            rating_min=q.get("rating_min"),
            rating_max=q.get("rating_max"),
            rating_labels=q.get("rating_labels"),
            points=q.get("points", 1),
            image=image_filename,
            image_url=image_url,
            hint=q.get("hint"),
            table_headers=table_headers,
            table_rows=table_rows,
            table_options=table_options,
        ))
    # Пересчитываем max_score если выбраны не все вопросы
    effective_max_score = sum(q.get("points", 1) for q in selected_questions)

    return FileAssignmentWithQuestions(
        id=a.assignment_id,
        title=a.title,
        description_latex=a.description_latex,
        max_score=effective_max_score,
        time_limit_minutes=time_limit,
        questions_limit=q_limit,
        questions_random=q_random,
        max_attempts=max_attempts,
        show_correct_answers=show_correct,
        questions=questions_out,
    )


@router.post("/assignment/{assignment_id}/submit", response_model=SubmitOut)
def submit_assignment(
    assignment_id: str,
    data: SubmitIn,
    student: Student = Depends(get_current_student),
    session: Session = Depends(get_session),
):
    cl = session.exec(select(ClassRoom).where(ClassRoom.id == student.class_id)).first()
    if not cl:
        raise HTTPException(status_code=404, detail="Класс не найден")
    try:
        a = STORE.get(cl.name, assignment_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Задание не найдено")

    raw = a.raw if hasattr(a, "raw") else {}

    # Читаем настройки из DailyAssignment или YAML
    today_submit = date.today()
    daily_submit = session.exec(
        select(DailyAssignment)
        .where(DailyAssignment.class_id == cl.id)
        .where(DailyAssignment.assignment_id == assignment_id)
        .where(DailyAssignment.date == today_submit)
    ).first()
    show_correct_submit = True
    if daily_submit is not None:
        show_correct_submit = bool(daily_submit.show_correct_answers)
    elif "show_correct_answers" in raw:
        show_correct_submit = bool(raw["show_correct_answers"])

    # Применяем ту же логику случайного выбора вопросов, что и при выдаче задания
    q_limit_submit = 0
    q_random_submit = False
    if daily_submit:
        q_limit_submit = daily_submit.questions_limit or 0
        q_random_submit = bool(daily_submit.questions_random)
    if not q_limit_submit and raw.get("questions_limit"):
        q_limit_submit = int(raw["questions_limit"])
    if not q_random_submit and raw.get("questions_random"):
        q_random_submit = bool(raw["questions_random"])

    all_questions_submit = raw.get("questions", [])
    if q_random_submit and q_limit_submit and 0 < q_limit_submit < len(all_questions_submit):
        rng_submit = random.Random(f"{student.id}:{assignment_id}:{today_submit.isoformat()}")
        questions = rng_submit.sample(all_questions_submit, q_limit_submit)
    else:
        questions = all_questions_submit

    effective_max_score_submit = sum(q.get("points", 1) for q in questions)

    attempt = Attempt(
        student_id=student.id,
        class_name=cl.name,
        assignment_id=assignment_id,
        assignment_title=a.title,
        submitted_at=datetime.utcnow(),
        total_score=0,
        max_score=effective_max_score_submit,
    )
    session.add(attempt)
    session.flush()

    def _opt_label_submit(opt, idx):
        if isinstance(opt, dict):
            return str(opt.get("label", opt.get("id", str(idx))))
        return str(opt)

    def _normalize_correct_for_display(qtype, correct_raw, q_data):
        """Нормализует правильный ответ в читаемый вид для отображения."""
        if qtype in ("number", "numeric", "expr"):
            if isinstance(correct_raw, dict):
                return correct_raw.get("value", correct_raw)
            return correct_raw
        elif qtype in ("choice", "mcq", "single", "single_choice", "select"):
            raw_options = q_data.get("options", [])
            if isinstance(correct_raw, dict) and "index" in correct_raw:
                idx = correct_raw["index"]
                if 0 <= idx < len(raw_options):
                    return _opt_label_submit(raw_options[idx], idx)
                return str(idx)
            elif isinstance(correct_raw, str):
                for i, opt in enumerate(raw_options):
                    if isinstance(opt, dict) and str(opt.get("id", "")) == correct_raw:
                        return _opt_label_submit(opt, i)
                return correct_raw
            return correct_raw
        elif qtype in ("multichoice", "multiple", "multiple_choice", "multi"):
            raw_options = q_data.get("options", [])
            if isinstance(correct_raw, dict) and "indices" in correct_raw:
                indices = correct_raw["indices"]
                return [_opt_label_submit(raw_options[i], i) for i in indices if 0 <= i < len(raw_options)]
            return correct_raw
        elif qtype in ("ordering", "order", "sort"):
            raw_items = q_data.get("order_items") or q_data.get("items", [])
            id_to_label = {}
            for i, it in enumerate(raw_items):
                if isinstance(it, dict):
                    id_to_label[str(it.get("id", i))] = str(it.get("label", it.get("id", i)))
                    id_to_label[str(i)] = str(it.get("label", it.get("id", i)))
                else:
                    id_to_label[str(i)] = str(it)
            if isinstance(correct_raw, dict) and "order" in correct_raw:
                return [id_to_label.get(str(oid), str(oid)) for oid in correct_raw["order"]]
            return correct_raw
        elif qtype in ("drag_drop", "drag"):
            raw_items = q_data.get("items", [])
            raw_zones = q_data.get("zones", [])
            item_id_to_label_n = {str(it.get("id", "")): str(it.get("label", it.get("id", ""))) for it in raw_items if isinstance(it, dict)}
            zone_id_to_label_n = {str(z.get("id", "")): str(z.get("label", z.get("id", ""))) for z in raw_zones if isinstance(z, dict)}
            def _conv_n(d):
                if not isinstance(d, dict): return d
                res = {}
                for zid, lst in d.items():
                    zlabel = zone_id_to_label_n.get(str(zid), str(zid))
                    if isinstance(lst, list):
                        res[zlabel] = [item_id_to_label_n.get(str(x), str(x)) for x in lst]
                    else:
                        res[zlabel] = item_id_to_label_n.get(str(lst), str(lst))
                return res
            return _conv_n(correct_raw)
        elif qtype in ("shorttext", "text", "text_long", "string", "short_answer", "fill", "expr"):
            # Для текстовых и expr ответов - извлекаем value из dict
            if isinstance(correct_raw, dict):
                vals = correct_raw.get("values")
                if vals and isinstance(vals, list):
                    return " / ".join(str(v) for v in vals)
                return correct_raw.get("value", correct_raw)
            return correct_raw
        elif qtype in ("matching", "match", "pairs", "correspondence"):
            # {left_id: right_id} → {left_label: right_label}
            raw_left_m = q_data.get("left") or q_data.get("left_items") or []
            raw_right_m = q_data.get("right") or q_data.get("right_items") or []
            left_id_lbl_m = {str(it.get("id", "")): str(it.get("label", it.get("text", it.get("id", "")))) for it in raw_left_m if isinstance(it, dict)}
            right_id_lbl_m = {str(it.get("id", "")): str(it.get("label", it.get("text", it.get("id", "")))) for it in raw_right_m if isinstance(it, dict)}
            if isinstance(correct_raw, dict):
                pairs = correct_raw.get("pairs", correct_raw) if "pairs" in correct_raw else correct_raw
                if isinstance(pairs, list):
                    pairs = {str(p[0]): str(p[1]) for p in pairs if len(p) >= 2}
                result = {}
                for lid, rid in pairs.items():
                    lbl = left_id_lbl_m.get(str(lid), str(lid))
                    rbl = right_id_lbl_m.get(str(rid), str(rid))
                    result[lbl] = rbl
                return result
            return correct_raw
        elif qtype == "matching_multi":
            # {left_id: [right_id1, right_id2]} → {left_label: [right_label1, right_label2]}
            raw_left_m = q_data.get("left") or q_data.get("left_items") or []
            raw_right_m = q_data.get("right") or q_data.get("right_items") or []
            left_id_lbl_m = {str(it.get("id", "")): str(it.get("label", it.get("id", ""))) for it in raw_left_m if isinstance(it, dict)}
            right_id_lbl_m = {str(it.get("id", "")): str(it.get("label", it.get("id", ""))) for it in raw_right_m if isinstance(it, dict)}
            if isinstance(correct_raw, dict):
                result = {}
                for lid, rids in correct_raw.items():
                    lbl = left_id_lbl_m.get(str(lid), str(lid))
                    if isinstance(rids, list):
                        result[lbl] = [right_id_lbl_m.get(str(rid), str(rid)) for rid in rids]
                    else:
                        result[lbl] = right_id_lbl_m.get(str(rids), str(rids))
                return result
            return correct_raw
        elif qtype in ("table_fill", "table_select"):
            # {row_id: [val1, val2, ...]} → {row_label / col_header: val}
            raw_rows_t = q_data.get("table_rows", [])
            table_headers_t = q_data.get("table_headers") or []
            cell_key_lbl = {}
            for row in raw_rows_t:
                if isinstance(row, dict):
                    row_label = str(row.get("label", row.get("id", "")))
                    for cell_idx, cell in enumerate(row.get("cells", [])):
                        if isinstance(cell, dict):
                            cell_key = f"{row.get('id', '')}:{cell.get('id', '')}"
                            # Use table_headers as column label when available
                            col_label = (
                                table_headers_t[cell_idx]
                                if cell_idx < len(table_headers_t)
                                else (cell.get('placeholder') or cell.get('id', ''))
                            )
                            cell_key_lbl[cell_key] = f"{row_label} / {col_label}"
            if isinstance(correct_raw, dict):
                # Поддерживаем формат {cells: {...}} и плоский
                cells_d = correct_raw.get("cells", correct_raw) if "cells" in correct_raw else correct_raw
                if isinstance(cells_d, dict):
                    return {cell_key_lbl.get(str(k), str(k)): v for k, v in cells_d.items()}
            return correct_raw
        return correct_raw

    details = []
    total = 0
    import sys
    for q in questions:
        qid = q.get("id", "")
        qtype = q.get("type", "number")
        correct = q.get("answer")
        student_answer = data.answers.get(qid)
        if qtype in ("table_fill", "table_select", "matching_multi", "matching", "match", "pairs"):
            print(f"[DEBUG] qid={qid} qtype={qtype} student_answer={student_answer!r} correct={correct!r}", file=sys.stderr, flush=True)
        q_points = int(q.get("points", 1))
        # Нормализуем ответ студента для mcq/multichoice (фронт шлёт ID, грейдер ждёт индексы)
        grading_answer = student_answer
        raw_options = q.get("options", [])
        if qtype in ("mcq", "choice", "select", "single", "single_choice") and student_answer is not None and not isinstance(student_answer, dict):
            sa_str = str(student_answer)
            found_idx = None
            for i, opt in enumerate(raw_options):
                if isinstance(opt, dict) and str(opt.get("id", "")) == sa_str:
                    found_idx = i
                    break
            if found_idx is None:
                try:
                    found_idx = int(sa_str)
                except (ValueError, TypeError):
                    found_idx = 0
            grading_answer = {"index": found_idx}
        elif qtype in ("multichoice", "multiple", "multiple_choice", "multi") and isinstance(student_answer, list):
            indices = []
            for item in student_answer:
                if isinstance(item, int):
                    indices.append(item)
                else:
                    for i, opt in enumerate(raw_options):
                        if isinstance(opt, dict) and str(opt.get("id", "")) == str(item):
                            indices.append(i)
                            break
            grading_answer = {"indices": indices, "total_options": len(raw_options)}
        ok, sc, meta = grade(qtype, correct, grading_answer, points=q_points)
        total += sc
        ans = Answer(
            attempt_id=attempt.id,
            question_key=qid,
            answer_json={"student": student_answer, "meta": meta},
            is_correct=ok,
            score=sc,
            max_score=int(q.get("points", 1)),
        )
        session.add(ans)
        # prompt_latex уже нормализован через assignment_store._normalize_question
        prompt_text = q.get("prompt_latex") or q.get("prompt") or q.get("text") or ""
        # Нормализуем правильный ответ для отображения
        correct_display = _normalize_correct_for_display(qtype, correct, q)
        # Нормализуем ответ ученика для отображения
        student_display = student_answer
        raw_options = q.get("options", [])
        if qtype in ("choice", "mcq", "single", "single_choice", "select") and student_answer is not None and raw_options:
            sa_str = str(student_answer)
            found = False
            for i, opt in enumerate(raw_options):
                if isinstance(opt, dict) and str(opt.get("id", "")) == sa_str:
                    student_display = _opt_label_submit(opt, i)
                    found = True
                    break
            if not found:
                try:
                    idx_s = int(sa_str)
                    if 0 <= idx_s < len(raw_options):
                        student_display = _opt_label_submit(raw_options[idx_s], idx_s)
                except (ValueError, TypeError):
                    pass
        elif qtype in ("multichoice", "multiple", "multiple_choice", "multi") and isinstance(student_answer, list) and raw_options:
            normalized_sa = []
            for sa_item in student_answer:
                sa_str = str(sa_item)
                found = False
                for i, opt in enumerate(raw_options):
                    if isinstance(opt, dict) and str(opt.get("id", "")) == sa_str:
                        normalized_sa.append(_opt_label_submit(opt, i))
                        found = True
                        break
                if not found:
                    try:
                        idx_s = int(sa_str)
                        if 0 <= idx_s < len(raw_options):
                            normalized_sa.append(_opt_label_submit(raw_options[idx_s], idx_s))
                        else:
                            normalized_sa.append(sa_str)
                    except (ValueError, TypeError):
                        normalized_sa.append(sa_str)
            student_display = normalized_sa
        elif qtype in ("ordering", "order", "sort") and isinstance(student_answer, list):
            raw_items = q.get("order_items") or q.get("items", [])
            id_to_label_s = {}
            for i, it in enumerate(raw_items):
                if isinstance(it, dict):
                    id_to_label_s[str(it.get("id", i))] = str(it.get("label", it.get("id", i)))
                    id_to_label_s[str(i)] = str(it.get("label", it.get("id", i)))
                else:
                    id_to_label_s[str(i)] = str(it)
            student_display = [id_to_label_s.get(str(sa_item), str(sa_item)) for sa_item in student_answer]
        elif qtype in ("drag_drop", "drag") and isinstance(student_answer, dict):
            raw_items_dd = q.get("items", [])
            raw_zones_dd = q.get("zones", [])
            item_id_lbl = {str(it.get("id", "")): str(it.get("label", it.get("id", ""))) for it in raw_items_dd if isinstance(it, dict)}
            zone_id_lbl = {str(z.get("id", "")): str(z.get("label", z.get("id", ""))) for z in raw_zones_dd if isinstance(z, dict)}
            conv_sa = {}
            for zid, lst in student_answer.items():
                zlabel = zone_id_lbl.get(str(zid), str(zid))
                if isinstance(lst, list):
                    conv_sa[zlabel] = [item_id_lbl.get(str(x), str(x)) for x in lst]
                else:
                    conv_sa[zlabel] = item_id_lbl.get(str(lst), str(lst))
            student_display = conv_sa
        elif qtype in ("shorttext", "text", "text_long", "string", "short_answer", "fill", "expr"):
            if isinstance(student_answer, dict):
                student_display = student_answer.get("value", student_answer)
        elif qtype in ("matching", "match", "pairs", "correspondence") and isinstance(student_answer, dict):
            raw_left_m2 = q.get("left") or q.get("left_items") or []
            raw_right_m2 = q.get("right") or q.get("right_items") or []
            left_id_lbl_m2 = {str(it.get("id", "")): str(it.get("label", it.get("text", it.get("id", "")))) for it in raw_left_m2 if isinstance(it, dict)}
            right_id_lbl_m2 = {str(it.get("id", "")): str(it.get("label", it.get("text", it.get("id", "")))) for it in raw_right_m2 if isinstance(it, dict)}
            pairs_sa = student_answer.get("pairs", student_answer) if "pairs" in student_answer else student_answer
            if isinstance(pairs_sa, dict):
                conv_m2 = {}
                for lid, rid in pairs_sa.items():
                    lbl = left_id_lbl_m2.get(str(lid), str(lid))
                    rbl = right_id_lbl_m2.get(str(rid), str(rid))
                    conv_m2[lbl] = rbl
                student_display = conv_m2
        elif qtype == "matching_multi" and isinstance(student_answer, dict):
            raw_left_m = q.get("left") or q.get("left_items") or []
            raw_right_m = q.get("right") or q.get("right_items") or []
            left_id_lbl_m = {str(it.get("id", "")): str(it.get("label", it.get("id", ""))) for it in raw_left_m if isinstance(it, dict)}
            right_id_lbl_m = {str(it.get("id", "")): str(it.get("label", it.get("id", ""))) for it in raw_right_m if isinstance(it, dict)}
            conv_mm = {}
            for lid, rids in student_answer.items():
                lbl = left_id_lbl_m.get(str(lid), str(lid))
                if isinstance(rids, list):
                    conv_mm[lbl] = [right_id_lbl_m.get(str(rid), str(rid)) for rid in rids]
                else:
                    conv_mm[lbl] = right_id_lbl_m.get(str(rids), str(rids))
            student_display = conv_mm
        elif qtype in ("table_fill", "table_select") and isinstance(student_answer, dict):
            raw_rows_t = q.get("table_rows", [])
            table_headers_t = q.get("table_headers") or []
            cell_key_lbl = {}
            for row in raw_rows_t:
                if isinstance(row, dict):
                    row_label = str(row.get("label", row.get("id", "")))
                    for cell_idx, cell in enumerate(row.get("cells", [])):
                        if isinstance(cell, dict):
                            cell_key = f"{row.get('id', '')}:{cell.get('id', '')}"
                            col_label = (
                                table_headers_t[cell_idx]
                                if cell_idx < len(table_headers_t)
                                else (cell.get('placeholder') or cell.get('id', ''))
                            )
                            cell_key_lbl[cell_key] = f"{row_label} / {col_label}"
            # Поддерживаем оба формата: плоский и {cells: {...}}
            cells_d = student_answer.get("cells", student_answer) if "cells" in student_answer else student_answer
            if isinstance(cells_d, dict):
                student_display = {cell_key_lbl.get(str(k), str(k)): v for k, v in cells_d.items()}
        details.append({
            "question_key": qid,
            "is_correct": ok,
            "score": sc,
            "student_answer": student_display,
            "correct_answer": correct_display,
            "prompt_latex": prompt_text,
            "qtype": qtype,
            "points": q.get("points", 1),
            "hint": q.get("hint"),
            "options": q.get("options"),
            "order_items": q.get("order_items") or q.get("items"),
            "zones": q.get("zones"),
            "items": q.get("items"),
            "left_items": q.get("left_items"),
            "right_items": q.get("right_items"),
            "table_headers": q.get("table_headers"),
            "table_rows": q.get("table_rows"),
            "table_options": q.get("table_options"),
            **meta,
        })

    attempt.total_score = total
    session.add(attempt)
    session.commit()
    session.refresh(attempt)

    return SubmitOut(
        attempt_id=attempt.id,
        total_score=total,
        max_score=effective_max_score_submit,
        details=details,
        show_correct_answers=show_correct_submit,
    )


@router.get("/attempts", response_model=list[dict])
def list_my_attempts(
    student: Student = Depends(get_current_student),
    session: Session = Depends(get_session),
):
    """История всех попыток ученика."""
    attempts = session.exec(
        select(Attempt)
        .where(Attempt.student_id == student.id)
        .order_by(Attempt.submitted_at.desc())
    ).all()
    return [
        {
            "attempt_id": a.id,
            "assignment_id": a.assignment_id,
            "assignment_title": a.assignment_title,
            "submitted_at": a.submitted_at.isoformat(),
            "total_score": a.total_score,
            "max_score": a.max_score,
            "percent": round(a.total_score / a.max_score * 100, 1) if a.max_score else 0,
        }
        for a in attempts
    ]


@router.get("/attempts/{attempt_id}", response_model=AttemptDetailOut)
def get_attempt_detail(
    attempt_id: int,
    student: Student = Depends(get_current_student),
    session: Session = Depends(get_session),
):
    """Детальный разбор попытки — где ошибся, правильные ответы."""
    attempt = session.exec(
        select(Attempt)
        .where(Attempt.id == attempt_id)
        .where(Attempt.student_id == student.id)
    ).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Попытка не найдена")

    cl = session.exec(select(ClassRoom).where(ClassRoom.id == student.class_id)).first()

    # Загружаем вопросы из файла задания для получения prompt_latex
    questions_map: dict = {}
    try:
        a = STORE.get(attempt.class_name, attempt.assignment_id)
        raw = a.raw if hasattr(a, "raw") else {}
        for q in raw.get("questions", []):
            questions_map[q.get("id", "")] = q
    except Exception:
        pass

    answers = session.exec(
        select(Answer).where(Answer.attempt_id == attempt_id)
    ).all()

    answer_details = []
    for ans in answers:
        q_data = questions_map.get(ans.question_key, {})
        student_ans = None
        correct_ans = None
        if ans.answer_json:
            student_ans = ans.answer_json.get("student")

        qtype = q_data.get("type", "number")
        correct_raw = q_data.get("answer")

        # Вспомогательная функция: нормализовать option в label
        def _opt_label(opt, idx):
            if isinstance(opt, dict):
                return str(opt.get("label", opt.get("id", str(idx))))
            return str(opt)

        # Нормализуем правильный ответ в читаемый вид
        if qtype in ("number", "numeric", "expr"):
            # Нормализованный ответ: {value: 5, tol: 0} → 5
            if isinstance(correct_raw, dict):
                correct_ans = correct_raw.get("value", correct_raw)
            else:
                correct_ans = correct_raw

        elif qtype in ("choice", "mcq", "single", "single_choice", "select"):
            # Нормализованный ответ: {index: 1} → label варианта
            raw_options = q_data.get("options", [])
            if isinstance(correct_raw, dict) and "index" in correct_raw:
                idx = correct_raw["index"]
                if 0 <= idx < len(raw_options):
                    correct_ans = _opt_label(raw_options[idx], idx)
                else:
                    correct_ans = str(idx)
            elif isinstance(correct_raw, str):
                # Может быть id варианта (a, b, c)
                for i, opt in enumerate(raw_options):
                    if isinstance(opt, dict) and str(opt.get("id", "")) == correct_raw:
                        correct_ans = _opt_label(opt, i)
                        break
                else:
                    correct_ans = correct_raw
            else:
                correct_ans = correct_raw

            # Нормализуем ответ ученика: id или индекс → label
            if student_ans is not None and raw_options:
                sa = str(student_ans)
                for i, opt in enumerate(raw_options):
                    if isinstance(opt, dict) and str(opt.get("id", "")) == sa:
                        student_ans = _opt_label(opt, i)
                        break
                else:
                    # Попробуем как числовой индекс
                    try:
                        idx_s = int(sa)
                        if 0 <= idx_s < len(raw_options):
                            student_ans = _opt_label(raw_options[idx_s], idx_s)
                    except (ValueError, TypeError):
                        pass

        elif qtype in ("multichoice", "multiple", "multiple_choice", "multi"):
            # Нормализованный ответ: {indices: [0,2], total_options: 4} → ["7", "11"]
            raw_options = q_data.get("options", [])
            if isinstance(correct_raw, dict) and "indices" in correct_raw:
                indices = correct_raw["indices"]
                correct_ans = [_opt_label(raw_options[i], i) for i in indices if 0 <= i < len(raw_options)]
            else:
                correct_ans = correct_raw

            # Нормализуем ответ ученика: ["0", "2"] → ["7", "11"]
            if isinstance(student_ans, list) and raw_options:
                normalized_sa = []
                for sa_item in student_ans:
                    sa_str = str(sa_item)
                    # Сначала ищем по id
                    found = False
                    for i, opt in enumerate(raw_options):
                        if isinstance(opt, dict) and str(opt.get("id", "")) == sa_str:
                            normalized_sa.append(_opt_label(opt, i))
                            found = True
                            break
                    if not found:
                        # Пробуем как числовой индекс
                        try:
                            idx_s = int(sa_str)
                            if 0 <= idx_s < len(raw_options):
                                normalized_sa.append(_opt_label(raw_options[idx_s], idx_s))
                            else:
                                normalized_sa.append(sa_str)
                        except (ValueError, TypeError):
                            normalized_sa.append(sa_str)
                student_ans = normalized_sa

        elif qtype in ("ordering", "order", "sort"):
            # Нормализованный ответ: {order: ["n3","n1","n2","n4"]} → ["-10", "-5", "0.5", "1"]
            raw_items = q_data.get("order_items") or q_data.get("items", [])
            # Строим map id → label
            id_to_label = {}
            for i, it in enumerate(raw_items):
                if isinstance(it, dict):
                    id_to_label[str(it.get("id", i))] = str(it.get("label", it.get("id", i)))
                    id_to_label[str(i)] = str(it.get("label", it.get("id", i)))
                else:
                    id_to_label[str(i)] = str(it)

            if isinstance(correct_raw, dict) and "order" in correct_raw:
                correct_ans = [id_to_label.get(str(oid), str(oid)) for oid in correct_raw["order"]]
            else:
                correct_ans = correct_raw

            # Нормализуем ответ ученика: ["0","2","3","1"] → ["-5", "0.5", "1", "-10"]
            if isinstance(student_ans, list):
                student_ans = [id_to_label.get(str(sa_item), str(sa_item)) for sa_item in student_ans]

        elif qtype in ("drag_drop", "drag"):
            # Нормализуем drag_drop: конвертируем id элементов в labels
            raw_items = q_data.get("items", [])
            raw_zones = q_data.get("zones", [])
            # Строим map id -> label для элементов
            item_id_to_label: dict = {}
            for it in raw_items:
                if isinstance(it, dict):
                    item_id_to_label[str(it.get("id", ""))] = str(it.get("label", it.get("id", "")))
            # Строим map id -> label для зон
            zone_id_to_label: dict = {}
            for z in raw_zones:
                if isinstance(z, dict):
                    zone_id_to_label[str(z.get("id", ""))] = str(z.get("label", z.get("id", "")))

            def _convert_zone_dict(d):
                if not isinstance(d, dict):
                    return d
                result = {}
                for zone_id, items_list in d.items():
                    zone_label = zone_id_to_label.get(str(zone_id), str(zone_id))
                    if isinstance(items_list, list):
                        result[zone_label] = [item_id_to_label.get(str(x), str(x)) for x in items_list]
                    else:
                        result[zone_label] = item_id_to_label.get(str(items_list), str(items_list))
                return result

            correct_ans = _convert_zone_dict(correct_raw)
            if isinstance(student_ans, dict):
                student_ans = _convert_zone_dict(student_ans)

        elif qtype in ("shorttext", "text", "text_long", "string", "short_answer", "fill", "expr"):
            if isinstance(correct_raw, dict):
                vals = correct_raw.get("values")
                if vals and isinstance(vals, list):
                    correct_ans = " / ".join(str(v) for v in vals)
                else:
                    correct_ans = correct_raw.get("value", correct_raw)
            else:
                correct_ans = correct_raw
            if isinstance(student_ans, dict):
                student_ans = student_ans.get("value", student_ans)

        elif qtype in ("matching", "match", "pairs", "correspondence"):
            # Конвертируем {left_id: right_id} в {left_label: right_label}
            raw_left = q_data.get("left") or q_data.get("left_items") or []
            raw_right = q_data.get("right") or q_data.get("right_items") or []
            left_id_to_label = {}
            right_id_to_label = {}
            for it in raw_left:
                if isinstance(it, dict):
                    left_id_to_label[str(it.get("id", ""))] = str(it.get("label", it.get("text", it.get("id", ""))))
            for it in raw_right:
                if isinstance(it, dict):
                    right_id_to_label[str(it.get("id", ""))] = str(it.get("label", it.get("text", it.get("id", ""))))

            def _conv_matching(d):
                if not isinstance(d, dict):
                    return d
                # Поддерживаем как {l1: r2} так и {pairs: {l1: r2}}
                pairs = d.get("pairs", d) if "pairs" in d else d
                if isinstance(pairs, list):
                    pairs = {str(p[0]): str(p[1]) for p in pairs if len(p) >= 2}
                result = {}
                for lid, rid in pairs.items():
                    lbl = left_id_to_label.get(str(lid), str(lid))
                    rbl = right_id_to_label.get(str(rid), str(rid))
                    result[lbl] = rbl
                return result

            correct_ans = _conv_matching(correct_raw) if isinstance(correct_raw, dict) else correct_raw
            student_ans = _conv_matching(student_ans) if isinstance(student_ans, dict) else student_ans

        elif qtype == "matching_multi":
            # Конвертируем {left_id: [right_id1, right_id2]} в {left_label: [right_label1, right_label2]}
            raw_left_m = q_data.get("left") or q_data.get("left_items") or []
            raw_right_m = q_data.get("right") or q_data.get("right_items") or []
            left_id_lbl_m = {}
            right_id_lbl_m = {}
            for it in raw_left_m:
                if isinstance(it, dict):
                    left_id_lbl_m[str(it.get("id", ""))] = str(it.get("label", it.get("text", it.get("id", ""))))
            for it in raw_right_m:
                if isinstance(it, dict):
                    right_id_lbl_m[str(it.get("id", ""))] = str(it.get("label", it.get("text", it.get("id", ""))))

            def _conv_matching_multi(d):
                if not isinstance(d, dict):
                    return d
                result = {}
                for lid, rids in d.items():
                    lbl = left_id_lbl_m.get(str(lid), str(lid))
                    if isinstance(rids, list):
                        result[lbl] = [right_id_lbl_m.get(str(rid), str(rid)) for rid in rids]
                    else:
                        result[lbl] = right_id_lbl_m.get(str(rids), str(rids))
                return result

            correct_ans = _conv_matching_multi(correct_raw) if isinstance(correct_raw, dict) else correct_raw
            student_ans = _conv_matching_multi(student_ans) if isinstance(student_ans, dict) else student_ans

        elif qtype in ("table_fill", "table_select"):
            # Конвертируем {row_id:cell_id: value} в {метка строки / заголовок столбца: value}
            raw_rows = q_data.get("table_rows", [])
            table_headers_t = q_data.get("table_headers") or []
            cell_key_to_label = {}
            for row in raw_rows:
                if isinstance(row, dict):
                    row_label = str(row.get("label", row.get("id", "")))
                    for cell_idx, cell in enumerate(row.get("cells", [])):
                        if isinstance(cell, dict):
                            cell_key = f"{row.get('id', '')}:{cell.get('id', '')}"
                            col_label = (
                                table_headers_t[cell_idx]
                                if cell_idx < len(table_headers_t)
                                else (cell.get('placeholder') or cell.get('id', ''))
                            )
                            cell_key_to_label[cell_key] = f"{row_label} / {col_label}"

            def _conv_table(d):
                if not isinstance(d, dict):
                    return d
                # Поддерживаем формат {cells: {...}} и плоский
                cells_d = d.get("cells", d) if "cells" in d else d
                if not isinstance(cells_d, dict):
                    return d
                result = {}
                for key, val in cells_d.items():
                    label = cell_key_to_label.get(str(key), str(key))
                    result[label] = val
                return result

            correct_ans = _conv_table(correct_raw) if isinstance(correct_raw, dict) else correct_raw
            student_ans = _conv_table(student_ans) if isinstance(student_ans, dict) else student_ans

        else:
            correct_ans = correct_raw

        answer_details.append(AnswerDetailOut(
            question_key=ans.question_key,
            is_correct=ans.is_correct,
            score=ans.score,
            max_score=ans.max_score if ans.max_score else q_data.get("points", 1),
            student_answer=student_ans,
            correct_answer=correct_ans,
            prompt_latex=q_data.get("prompt_latex") or q_data.get("prompt") or q_data.get("text") or "",
            qtype=qtype,
            points=q_data.get("points", 1),
            hint=q_data.get("hint"),
            image_url=None,  # TODO: add image support in attempt detail
            options=q_data.get("options"),
            order_items=q_data.get("order_items") or q_data.get("items"),
            zones=q_data.get("zones"),
            items=q_data.get("items"),
            left_items=q_data.get("left_items"),
            right_items=q_data.get("right_items"),
            table_headers=q_data.get("table_headers"),
            table_rows=q_data.get("table_rows"),
            table_options=q_data.get("table_options"),
        ))

    return AttemptDetailOut(
        attempt_id=attempt.id,
        student_id=student.id,
        student_name=student.name,
        student_code=student.code,
        class_name=attempt.class_name,
        assignment_id=attempt.assignment_id,
        assignment_title=attempt.assignment_title,
        submitted_at=attempt.submitted_at,
        total_score=attempt.total_score,
        max_score=attempt.max_score,
        percent=round(attempt.total_score / attempt.max_score * 100, 1) if attempt.max_score else 0,
        answers=answer_details,
    )


@router.post("/heartbeat")
def student_heartbeat(
    data: dict = {},
    student: Student = Depends(get_current_student),
    session: Session = Depends(get_session),
):
    """Обновляет время последней активности ученика (для отслеживания онлайн-статуса)."""
    assignment_id = data.get("assignment_id") if data else None
    cl = session.exec(select(ClassRoom).where(ClassRoom.id == student.class_id)).first()
    class_id = cl.id if cl else None

    hb = session.exec(
        select(StudentHeartbeat).where(StudentHeartbeat.student_id == student.id)
    ).first()
    if hb:
        hb.last_seen = datetime.utcnow()
        hb.assignment_id = assignment_id
        hb.class_id = class_id
    else:
        hb = StudentHeartbeat(
            student_id=student.id,
            last_seen=datetime.utcnow(),
            assignment_id=assignment_id,
            class_id=class_id,
        )
        session.add(hb)
    session.commit()
    return {"ok": True}
