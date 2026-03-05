from __future__ import annotations
from pathlib import Path
from typing import Optional
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlmodel import Session, select, func
from ..core.security import create_access_token, verify_password
from ..core.config import settings
from ..db import get_session
from ..deps import get_current_admin
from ..models import Answer, Attempt, ClassRoom, Student, DailyAssignment, AdminUser
from ..schemas import (
    AdminLoginIn,
    ClassAssignConfigIn,
    ClassAssignConfigOut,
    ClassRoomCreate,
    ClassRoomOut,
    StudentCreate,
    StudentOut,
    StudentsBulkIn,
    StudentsBulkOut,
    ScheduleSetIn,
    ScheduleItemOut,
    TokenOut,
    ClassJournalOut,
    JournalRowOut,
    AttemptDetailOut,
    AnswerDetailOut,
    AssignmentStatsOut,
    ResultMatrixOut,
    StudentRowOut,
    QuestionColOut,
    CellAnswerOut,
)
from ..services.assignment_store import AssignmentStore
import random
import string
from urllib.parse import quote

router = APIRouter(prefix="/api/admin", tags=["admin"])
STORE = AssignmentStore(base_dir=Path(__file__).resolve().parents[2] / "assignments")


def _gen_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=7))


@router.post("/login", response_model=TokenOut)
def admin_login(data: AdminLoginIn, session: Session = Depends(get_session)):
    admin = session.exec(select(AdminUser).where(AdminUser.username == data.username)).first()
    if not admin or not verify_password(data.password, admin.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный логин/пароль")
    token = create_access_token(subject=str(admin.id), role="admin")
    return TokenOut(access_token=token)


# ─── Классы ────────────────────────────────────────────────────────────────

@router.get("/classes", response_model=list[ClassRoomOut])
def list_classes(session: Session = Depends(get_session), _=Depends(get_current_admin)):
    return session.exec(select(ClassRoom).order_by(ClassRoom.name)).all()


@router.post("/classes", response_model=ClassRoomOut)
def create_class(data: ClassRoomCreate, session: Session = Depends(get_session), _=Depends(get_current_admin)):
    existing = session.exec(select(ClassRoom).where(ClassRoom.name == data.name)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Класс с таким именем уже существует")
    cl = ClassRoom(name=data.name)
    session.add(cl)
    session.commit()
    session.refresh(cl)
    return cl


@router.delete("/classes/{class_id}")
def delete_class(class_id: int, session: Session = Depends(get_session), _=Depends(get_current_admin)):
    cl = session.get(ClassRoom, class_id)
    if not cl:
        raise HTTPException(status_code=404, detail="Класс не найден")
    session.delete(cl)
    session.commit()
    return {"ok": True}


# ─── Ученики ───────────────────────────────────────────────────────────────

@router.get("/students", response_model=list[StudentOut])
def list_students(
    class_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    q = select(Student)
    if class_id:
        q = q.where(Student.class_id == class_id)
    students = session.exec(q.order_by(Student.name)).all()
    result = []
    for s in students:
        cl = session.get(ClassRoom, s.class_id)
        result.append(StudentOut(
            id=s.id, name=s.name, code=s.code,
            class_id=s.class_id, class_name=cl.name if cl else "—"
        ))
    return result


@router.post("/students", response_model=StudentOut)
def create_student(data: StudentCreate, session: Session = Depends(get_session), _=Depends(get_current_admin)):
    if session.exec(select(Student).where(Student.code == data.code)).first():
        raise HTTPException(status_code=400, detail="Код уже занят")
    s = Student(name=data.name, code=data.code, class_id=data.class_id)
    session.add(s)
    session.commit()
    session.refresh(s)
    cl = session.get(ClassRoom, s.class_id)
    return StudentOut(id=s.id, name=s.name, code=s.code, class_id=s.class_id, class_name=cl.name if cl else "—")


@router.post("/students/bulk", response_model=StudentsBulkOut)
def bulk_create_students(data: StudentsBulkIn, session: Session = Depends(get_session), _=Depends(get_current_admin)):
    created = []
    errors = []
    for item in data.items:
        code = item.code or _gen_code()
        while session.exec(select(Student).where(Student.code == code)).first():
            code = _gen_code()
        try:
            s = Student(name=item.name, code=code, class_id=data.class_id)
            session.add(s)
            session.flush()
            created.append({"name": item.name, "code": code, "id": s.id})
        except Exception as e:
            errors.append({"name": item.name, "error": str(e)})
    session.commit()
    return StudentsBulkOut(created_count=len(created), created=created, errors=errors)


@router.delete("/students/{student_id}")
def delete_student(student_id: int, session: Session = Depends(get_session), _=Depends(get_current_admin)):
    s = session.get(Student, student_id)
    if not s:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    session.delete(s)
    session.commit()
    return {"ok": True}


@router.patch("/students/{student_id}", response_model=StudentOut)
def update_student(
    student_id: int,
    data: dict,
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    s = session.get(Student, student_id)
    if not s:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    if "name" in data:
        s.name = data["name"]
    if "code" in data:
        existing = session.exec(select(Student).where(Student.code == data["code"])).first()
        if existing and existing.id != student_id:
            raise HTTPException(status_code=400, detail="Код уже занят")
        s.code = data["code"]
    session.add(s)
    session.commit()
    session.refresh(s)
    cl = session.get(ClassRoom, s.class_id)
    return StudentOut(id=s.id, name=s.name, code=s.code, class_id=s.class_id, class_name=cl.name if cl else "—")


# ─── Задания ───────────────────────────────────────────────────────────────

@router.get("/assignments")
def list_assignments(class_name: str = Query(...), _=Depends(get_current_admin)):
    try:
        assignments = STORE.list_class(class_name)
        return [
            {
                "id": a["id"],
                "title": a["title"],
                "max_score": a["max_score"],
                "description_latex": a.get("description_latex", ""),
            }
            for a in assignments
        ]
    except Exception:
        return []


# ─── Расписание ────────────────────────────────────────────────────────────

@router.get("/schedule", response_model=list[ScheduleItemOut])
def list_schedule(
    class_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    q = select(DailyAssignment)
    if class_id:
        q = q.where(DailyAssignment.class_id == class_id)
    items = session.exec(q.order_by(DailyAssignment.date.desc())).all()
    result = []
    for it in items:
        cl = session.get(ClassRoom, it.class_id)
        result.append(ScheduleItemOut(
            id=it.id,
            class_id=it.class_id,
            class_name=cl.name if cl else "—",
            date=it.date,
            assignment_id=it.assignment_id,
            title=it.assignment_title,
            max_score=it.max_score,
            time_limit_minutes=getattr(it, "time_limit_minutes", 0) or 0,
            questions_limit=getattr(it, "questions_limit", 0) or 0,
            questions_random=bool(getattr(it, "questions_random", False)),
            student_assign_limit=getattr(it, "student_assign_limit", None),
            student_assign_random=bool(getattr(it, "student_assign_random", False)),
        ))
    return result


@router.post("/schedule", response_model=ScheduleItemOut)
def add_schedule(data: ScheduleSetIn, session: Session = Depends(get_session), _=Depends(get_current_admin)):
    cl = session.get(ClassRoom, data.class_id)
    if not cl:
        raise HTTPException(status_code=404, detail="Класс не найден")
    try:
        a = STORE.get(cl.name, data.assignment_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Задание не найдено")

    item = DailyAssignment(
        class_id=data.class_id,
        date=data.date,
        assignment_id=data.assignment_id,
        assignment_title=a.title,
        max_score=a.max_score,
        time_limit_minutes=data.time_limit_minutes,
        questions_limit=data.questions_limit,
        questions_random=data.questions_random,
        student_assign_limit=data.student_assign_limit,
        student_assign_random=data.student_assign_random,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return ScheduleItemOut(
        id=item.id, class_id=item.class_id, class_name=cl.name,
        date=item.date, assignment_id=item.assignment_id,
        title=item.assignment_title, max_score=item.max_score,
        time_limit_minutes=item.time_limit_minutes,
        questions_limit=item.questions_limit,
        questions_random=item.questions_random,
        student_assign_limit=item.student_assign_limit,
        student_assign_random=item.student_assign_random,
    )


@router.patch("/schedule/{item_id}", response_model=ScheduleItemOut)
def update_schedule(
    item_id: int,
    data: dict,
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    """Обновить настройки назначенного задания."""
    item = session.get(DailyAssignment, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Не найдено")
    for field in ["time_limit_minutes", "questions_limit", "questions_random",
                  "student_assign_limit", "student_assign_random"]:
        if field in data:
            setattr(item, field, data[field])
    session.add(item)
    session.commit()
    session.refresh(item)
    cl = session.get(ClassRoom, item.class_id)
    return ScheduleItemOut(
        id=item.id, class_id=item.class_id, class_name=cl.name if cl else "—",
        date=item.date, assignment_id=item.assignment_id,
        title=item.assignment_title, max_score=item.max_score,
        time_limit_minutes=item.time_limit_minutes,
        questions_limit=item.questions_limit,
        questions_random=item.questions_random,
        student_assign_limit=item.student_assign_limit,
        student_assign_random=item.student_assign_random,
    )


@router.delete("/schedule/{item_id}")
def delete_schedule(item_id: int, session: Session = Depends(get_session), _=Depends(get_current_admin)):
    item = session.get(DailyAssignment, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Не найдено")
    session.delete(item)
    session.commit()
    return {"ok": True}


@router.get("/classes/{class_id}/assign-config", response_model=ClassAssignConfigOut)
def get_assign_config(class_id: int, session: Session = Depends(get_session), _=Depends(get_current_admin)):
    cl = session.get(ClassRoom, class_id)
    if not cl:
        raise HTTPException(status_code=404)
    return ClassAssignConfigOut(
        class_id=cl.id,
        student_assign_limit=getattr(cl, "student_assign_limit", 0) or 0,
        student_assign_random=bool(getattr(cl, "student_assign_random", False)),
    )


@router.put("/classes/{class_id}/assign-config", response_model=ClassAssignConfigOut)
def set_assign_config(
    class_id: int,
    data: ClassAssignConfigIn,
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    cl = session.get(ClassRoom, class_id)
    if not cl:
        raise HTTPException(status_code=404)
    cl.student_assign_limit = data.student_assign_limit
    cl.student_assign_random = data.student_assign_random
    session.add(cl)
    session.commit()
    session.refresh(cl)
    return ClassAssignConfigOut(
        class_id=cl.id,
        student_assign_limit=cl.student_assign_limit,
        student_assign_random=cl.student_assign_random,
    )


# ─── Журнал ────────────────────────────────────────────────────────────────

@router.get("/journal/{class_id}", response_model=ClassJournalOut)
def get_class_journal(
    class_id: int,
    date_filter: Optional[date] = Query(default=None),
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    """Журнал класса: все ученики × все задания с результатами."""
    cl = session.get(ClassRoom, class_id)
    if not cl:
        raise HTTPException(status_code=404, detail="Класс не найден")

    students = session.exec(
        select(Student).where(Student.class_id == class_id).order_by(Student.name)
    ).all()

    sched_q = select(DailyAssignment).where(DailyAssignment.class_id == class_id)
    if date_filter:
        sched_q = sched_q.where(DailyAssignment.date == date_filter)
    schedule_items = session.exec(sched_q.order_by(DailyAssignment.date.desc())).all()

    assignment_ids = list(dict.fromkeys(it.assignment_id for it in schedule_items))
    assignment_titles = {it.assignment_id: it.assignment_title for it in schedule_items}
    assignment_max = {it.assignment_id: it.max_score for it in schedule_items}

    attempts = session.exec(
        select(Attempt).where(Attempt.class_name == cl.name)
    ).all()

    from collections import defaultdict
    attempts_map: dict = defaultdict(list)
    for a in attempts:
        attempts_map[(a.student_id, a.assignment_id)].append(a)

    rows = []
    for s in students:
        for aid in assignment_ids:
            student_attempts = attempts_map.get((s.id, aid), [])
            max_score = assignment_max.get(aid, 0)
            if not student_attempts:
                rows.append(JournalRowOut(
                    student_id=s.id,
                    student_name=s.name,
                    student_code=s.code,
                    assignment_id=aid,
                    assignment_title=assignment_titles.get(aid, aid),
                    attempts_count=0,
                    best_score=0,
                    max_score=max_score,
                    best_percent=0.0,
                    last_submitted_at=None,
                    last_attempt_id=None,
                    status="not_started",
                ))
            else:
                best = max(student_attempts, key=lambda a: a.total_score)
                best_pct = round(best.total_score / max_score * 100, 1) if max_score else 0
                last_attempt = max(student_attempts, key=lambda a: a.submitted_at)
                last_at = last_attempt.submitted_at
                if best_pct >= 100:
                    status_val = "perfect"
                elif best_pct >= 60:
                    status_val = "done"
                else:
                    status_val = "in_progress"
                rows.append(JournalRowOut(
                    student_id=s.id,
                    student_name=s.name,
                    student_code=s.code,
                    assignment_id=aid,
                    assignment_title=assignment_titles.get(aid, aid),
                    attempts_count=len(student_attempts),
                    best_score=best.total_score,
                    max_score=max_score,
                    best_percent=best_pct,
                    last_submitted_at=last_at,
                    last_attempt_id=last_attempt.id,
                    status=status_val,
                ))

    return ClassJournalOut(
        class_id=class_id,
        class_name=cl.name,
        date=date_filter.isoformat() if date_filter else None,
        assignments=assignment_ids,
        assignment_titles=assignment_titles,
        rows=rows,
    )


# ─── Попытки и аналитика ───────────────────────────────────────────────────

@router.get("/attempts")
def list_attempts(
    class_id: Optional[int] = Query(default=None),
    student_id: Optional[int] = Query(default=None),
    assignment_id: Optional[str] = Query(default=None),
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    q = select(Attempt)
    if class_id:
        cl = session.get(ClassRoom, class_id)
        if cl:
            q = q.where(Attempt.class_name == cl.name)
    if student_id:
        q = q.where(Attempt.student_id == student_id)
    if assignment_id:
        q = q.where(Attempt.assignment_id == assignment_id)
    attempts = session.exec(q.order_by(Attempt.submitted_at.desc())).all()

    result = []
    for a in attempts:
        s = session.get(Student, a.student_id) if a.student_id else None
        result.append({
            "id": a.id,
            "attempt_id": a.id,
            "student_id": a.student_id,
            "student_name": s.name if s else "—",
            "student_code": s.code if s else "—",
            "class_name": a.class_name or "—",
            "assignment_id": a.assignment_id,
            "assignment_title": a.assignment_title or a.assignment_id,
            "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
            "total_score": a.total_score,
            "max_score": a.max_score,
            "percent": round(a.total_score / a.max_score * 100, 1) if a.max_score else 0,
            "time_spent_seconds": a.time_spent_seconds,
        })
    return result


@router.get("/attempts/{attempt_id}", response_model=AttemptDetailOut)
def get_attempt_detail(
    attempt_id: int,
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    attempt = session.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Попытка не найдена")

    s = session.get(Student, attempt.student_id) if attempt.student_id else None

    questions_map: dict = {}
    try:
        a = STORE.get(attempt.class_name, attempt.assignment_id)
        raw = a.raw if hasattr(a, "raw") else {}
        for q in raw.get("questions", []):
            questions_map[q.get("id", "")] = q
    except Exception:
        pass

    answers = session.exec(select(Answer).where(Answer.attempt_id == attempt_id)).all()

    answer_details = []
    for ans in answers:
        q_data = questions_map.get(ans.question_key, {})
        student_ans = None
        correct_ans = None
        if ans.answer_json:
            student_ans = ans.answer_json.get("student")
        correct_raw = q_data.get("answer")
        qtype = q_data.get("type", "number")

        def _opt_label_a(opt, idx):
            if isinstance(opt, dict):
                return str(opt.get("label", opt.get("id", str(idx))))
            return str(opt)

        if qtype in ("number", "numeric", "expr"):
            if isinstance(correct_raw, dict):
                correct_ans = correct_raw.get("value", correct_raw)
            else:
                correct_ans = correct_raw
        elif qtype in ("choice", "mcq", "single", "single_choice", "select"):
            raw_options = q_data.get("options", [])
            if isinstance(correct_raw, dict) and "index" in correct_raw:
                idx = correct_raw["index"]
                correct_ans = _opt_label_a(raw_options[idx], idx) if 0 <= idx < len(raw_options) else str(idx)
            elif isinstance(correct_raw, str):
                for i, opt in enumerate(raw_options):
                    if isinstance(opt, dict) and str(opt.get("id", "")) == correct_raw:
                        correct_ans = _opt_label_a(opt, i); break
                else:
                    correct_ans = correct_raw
            else:
                correct_ans = correct_raw
            if student_ans is not None and raw_options:
                sa = str(student_ans)
                for i, opt in enumerate(raw_options):
                    if isinstance(opt, dict) and str(opt.get("id", "")) == sa:
                        student_ans = _opt_label_a(opt, i); break
                else:
                    try:
                        idx_s = int(sa)
                        if 0 <= idx_s < len(raw_options):
                            student_ans = _opt_label_a(raw_options[idx_s], idx_s)
                    except (ValueError, TypeError):
                        pass
        elif qtype in ("multichoice", "multiple", "multiple_choice", "multi"):
            raw_options = q_data.get("options", [])
            if isinstance(correct_raw, dict) and "indices" in correct_raw:
                correct_ans = [_opt_label_a(raw_options[i], i) for i in correct_raw["indices"] if 0 <= i < len(raw_options)]
            else:
                correct_ans = correct_raw
            if isinstance(student_ans, list) and raw_options:
                normalized_sa = []
                for sa_item in student_ans:
                    sa_str = str(sa_item)
                    found = False
                    for i, opt in enumerate(raw_options):
                        if isinstance(opt, dict) and str(opt.get("id", "")) == sa_str:
                            normalized_sa.append(_opt_label_a(opt, i)); found = True; break
                    if not found:
                        try:
                            idx_s = int(sa_str)
                            normalized_sa.append(_opt_label_a(raw_options[idx_s], idx_s) if 0 <= idx_s < len(raw_options) else sa_str)
                        except (ValueError, TypeError):
                            normalized_sa.append(sa_str)
                student_ans = normalized_sa
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
                correct_ans = [id_to_label.get(str(oid), str(oid)) for oid in correct_raw["order"]]
            else:
                correct_ans = correct_raw
            if isinstance(student_ans, list):
                student_ans = [id_to_label.get(str(sa_item), str(sa_item)) for sa_item in student_ans]
        elif qtype in ("drag_drop", "drag"):
            raw_items = q_data.get("items", [])
            raw_zones = q_data.get("zones", [])
            item_id_to_label = {str(it.get("id", "")): str(it.get("label", it.get("id", ""))) for it in raw_items if isinstance(it, dict)}
            zone_id_to_label = {str(z.get("id", "")): str(z.get("label", z.get("id", ""))) for z in raw_zones if isinstance(z, dict)}
            def _conv_zones(d):
                if not isinstance(d, dict): return d
                return {zone_id_to_label.get(str(zid), str(zid)): [item_id_to_label.get(str(x), str(x)) for x in (lst if isinstance(lst, list) else [lst])] for zid, lst in d.items()}
            correct_ans = _conv_zones(correct_raw)
            if isinstance(student_ans, dict):
                student_ans = _conv_zones(student_ans)
        elif qtype in ("shorttext", "text", "text_long", "string", "short_answer", "fill", "expr"):
            if isinstance(correct_raw, dict):
                vals = correct_raw.get("values")
                if vals and isinstance(vals, list):
                    correct_ans = " / ".join(str(v) for v in vals)
                else:
                    correct_ans = correct_raw.get("value", correct_raw)
            else:
                correct_ans = correct_raw
            # Нормализуем ответ студента
            if isinstance(student_ans, dict):
                student_ans = student_ans.get("value", student_ans)
        elif qtype in ("matching", "match", "pairs", "correspondence"):
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

            def _conv_matching_a(d):
                if not isinstance(d, dict):
                    return d
                pairs = d.get("pairs", d) if "pairs" in d else d
                if isinstance(pairs, list):
                    pairs = {str(p[0]): str(p[1]) for p in pairs if len(p) >= 2}
                result = {}
                for lid, rid in pairs.items():
                    lbl = left_id_to_label.get(str(lid), str(lid))
                    rbl = right_id_to_label.get(str(rid), str(rid))
                    result[lbl] = rbl
                return result

            correct_ans = _conv_matching_a(correct_raw) if isinstance(correct_raw, dict) else correct_raw
            student_ans = _conv_matching_a(student_ans) if isinstance(student_ans, dict) else student_ans

        elif qtype == "matching_multi":
            raw_left_m = q_data.get("left") or q_data.get("left_items") or []
            raw_right_m = q_data.get("right") or q_data.get("right_items") or []
            left_id_lbl_m = {str(it.get("id", "")): str(it.get("label", it.get("text", it.get("id", "")))) for it in raw_left_m if isinstance(it, dict)}
            right_id_lbl_m = {str(it.get("id", "")): str(it.get("label", it.get("text", it.get("id", "")))) for it in raw_right_m if isinstance(it, dict)}
            def _conv_mm_a(d):
                if not isinstance(d, dict): return d
                result = {}
                for lid, rids in d.items():
                    lbl = left_id_lbl_m.get(str(lid), str(lid))
                    if isinstance(rids, list):
                        result[lbl] = [right_id_lbl_m.get(str(rid), str(rid)) for rid in rids]
                    else:
                        result[lbl] = right_id_lbl_m.get(str(rids), str(rids))
                return result
            correct_ans = _conv_mm_a(correct_raw) if isinstance(correct_raw, dict) else correct_raw
            student_ans = _conv_mm_a(student_ans) if isinstance(student_ans, dict) else student_ans

        elif qtype in ("table_fill", "table_select"):
            raw_rows_t = q_data.get("table_rows", [])
            cell_key_lbl = {}
            for row in raw_rows_t:
                if isinstance(row, dict):
                    row_label = str(row.get("label", row.get("id", "")))
                    for cell in row.get("cells", []):
                        if isinstance(cell, dict):
                            cell_key = f"{row.get('id', '')}:{cell.get('id', '')}"
                            cell_label = f"{row_label} / {cell.get('placeholder', cell.get('id', ''))}"
                            cell_key_lbl[cell_key] = cell_label
            def _conv_table_a(d):
                if not isinstance(d, dict): return d
                cells_d = d.get("cells", d) if "cells" in d else d
                if not isinstance(cells_d, dict): return d
                return {cell_key_lbl.get(str(k), str(k)): v for k, v in cells_d.items()}
            correct_ans = _conv_table_a(correct_raw) if isinstance(correct_raw, dict) else correct_raw
            student_ans = _conv_table_a(student_ans) if isinstance(student_ans, dict) else student_ans

        else:
            if isinstance(correct_raw, dict):
                correct_ans = correct_raw.get("value", correct_raw)
            else:
                correct_ans = correct_raw

        answer_details.append(AnswerDetailOut(
            question_key=ans.question_key,
            is_correct=ans.is_correct,
            score=ans.score,
            max_score=(ans.max_score if ans.max_score else None) or q_data.get("points", 1),
            student_answer=student_ans,
            correct_answer=correct_ans,
            prompt_latex=q_data.get("prompt_latex", "") or q_data.get("prompt", "") or q_data.get("text", ""),
            qtype=qtype,
            points=q_data.get("points", 1),
            hint=q_data.get("hint"),
            options=q_data.get("options"),
            order_items=q_data.get("order_items") or q_data.get("items"),
            zones=q_data.get("zones"),
            items=q_data.get("items"),
        ))

    return AttemptDetailOut(
        attempt_id=attempt.id,
        student_id=attempt.student_id,
        student_name=s.name if s else "—",
        student_code=s.code if s else "—",
        class_name=attempt.class_name,
        assignment_id=attempt.assignment_id,
        assignment_title=attempt.assignment_title,
        submitted_at=attempt.submitted_at,
        total_score=attempt.total_score,
        max_score=attempt.max_score,
        percent=round(attempt.total_score / attempt.max_score * 100, 1) if attempt.max_score else 0,
        duration_seconds=attempt.time_spent_seconds,
        answers=answer_details,
    )


@router.get("/stats/assignment/{class_id}/{assignment_id}", response_model=AssignmentStatsOut)
def get_assignment_stats(
    class_id: int,
    assignment_id: str,
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    cl = session.get(ClassRoom, class_id)
    if not cl:
        raise HTTPException(status_code=404)

    students = session.exec(select(Student).where(Student.class_id == class_id)).all()
    total_students = len(students)

    attempts = session.exec(
        select(Attempt)
        .where(Attempt.class_name == cl.name)
        .where(Attempt.assignment_id == assignment_id)
    ).all()

    attempted_student_ids = set(a.student_id for a in attempts)
    students_attempted = len(attempted_student_ids)

    max_score = attempts[0].max_score if attempts else 0
    avg_score = sum(a.total_score for a in attempts) / len(attempts) if attempts else 0
    avg_percent = round(avg_score / max_score * 100, 1) if max_score else 0

    attempt_ids = [a.id for a in attempts]
    question_stats_map: dict = {}
    if attempt_ids:
        all_answers = session.exec(
            select(Answer).where(Answer.attempt_id.in_(attempt_ids))
        ).all()
        from collections import defaultdict
        q_correct: dict = defaultdict(int)
        q_total: dict = defaultdict(int)
        for ans in all_answers:
            q_total[ans.question_key] += 1
            if ans.is_correct:
                q_correct[ans.question_key] += 1
        for qk in q_total:
            question_stats_map[qk] = {
                "question_key": qk,
                "total_answers": q_total[qk],
                "correct_answers": q_correct[qk],
                "percent_correct": round(q_correct[qk] / q_total[qk] * 100, 1) if q_total[qk] else 0,
            }

    assignment_title = assignment_id
    try:
        a = STORE.get(cl.name, assignment_id)
        assignment_title = a.title
    except Exception:
        pass

    return AssignmentStatsOut(
        assignment_id=assignment_id,
        assignment_title=assignment_title,
        class_name=cl.name,
        students_attempted=students_attempted,
        students_total=total_students,
        avg_score=round(avg_score, 2),
        max_score=max_score,
        avg_percent=avg_percent,
        question_stats=list(question_stats_map.values()),
    )


@router.delete("/attempts/{attempt_id}")
def delete_attempt(
    attempt_id: int,
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    attempt = session.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404)
    answers = session.exec(select(Answer).where(Answer.attempt_id == attempt_id)).all()
    for ans in answers:
        session.delete(ans)
    session.delete(attempt)
    session.commit()
    return {"ok": True}


# ─── Матрица результатов (ученик × вопрос) ──────────────────────────────────

@router.get("/results/matrix", response_model=ResultMatrixOut)
def get_results_matrix(
    class_id: int = Query(...),
    assignment_id: str = Query(...),
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    """
    Возвращает матрицу результатов для одного задания и одного класса.
    Строки — ученики, столбцы — вопросы (в порядке YAML).
    Каждая ячейка содержит нормализованный ответ ученика, правильный ответ и балл.
    """
    cl = session.get(ClassRoom, class_id)
    if not cl:
        raise HTTPException(status_code=404, detail="Класс не найден")

    # Загружаем задание из YAML
    questions_map: dict = {}   # question_key -> q_data
    questions_order: list = [] # порядок вопросов из YAML
    assignment_title = assignment_id
    try:
        a = STORE.get(cl.name, assignment_id)
        assignment_title = a.title
        raw = a.raw if hasattr(a, "raw") else {}
        for q in raw.get("questions", []):
            qid = q.get("id", "")
            questions_map[qid] = q
            questions_order.append(qid)
    except Exception:
        pass

    # Все ученики класса
    students = session.exec(select(Student).where(Student.class_id == class_id)).all()

    # Все попытки для этого задания и класса (берём последнюю попытку каждого ученика)
    all_attempts = session.exec(
        select(Attempt)
        .where(Attempt.class_name == cl.name)
        .where(Attempt.assignment_id == assignment_id)
        .order_by(Attempt.submitted_at.desc())
    ).all()

    # Для каждого студента — последняя попытка
    student_attempt: dict = {}  # student_id -> Attempt
    for att in all_attempts:
        if att.student_id and att.student_id not in student_attempt:
            student_attempt[att.student_id] = att

    # Все ответы для найденных попыток
    attempt_ids = [att.id for att in student_attempt.values()]
    all_answers: list = []
    if attempt_ids:
        all_answers = session.exec(
            select(Answer).where(Answer.attempt_id.in_(attempt_ids))
        ).all()

    # Группируем ответы по попытке и вопросу
    answers_by_attempt: dict = {}  # attempt_id -> {question_key -> Answer}
    for ans in all_answers:
        answers_by_attempt.setdefault(ans.attempt_id, {})[ans.question_key] = ans

    # Вспомогательная функция нормализации (копия логики из get_attempt_detail)
    def _opt_label(opt, idx):
        if isinstance(opt, dict):
            return str(opt.get("label", opt.get("id", str(idx))))
        return str(opt)

    def _normalize_cell(ans: Answer, q_data: dict):
        """Нормализует ответ ученика и правильный ответ для одной ячейки."""
        student_ans = None
        correct_ans = None
        if ans.answer_json:
            student_ans = ans.answer_json.get("student")
        correct_raw = q_data.get("answer")
        qtype = q_data.get("type", "number")

        if qtype in ("number", "numeric", "expr"):
            if isinstance(correct_raw, dict):
                correct_ans = correct_raw.get("value", correct_raw)
            else:
                correct_ans = correct_raw

        elif qtype in ("choice", "mcq", "single", "single_choice", "select"):
            raw_options = q_data.get("options", [])
            if isinstance(correct_raw, dict) and "index" in correct_raw:
                idx = correct_raw["index"]
                correct_ans = _opt_label(raw_options[idx], idx) if 0 <= idx < len(raw_options) else str(idx)
            elif isinstance(correct_raw, str):
                for i, opt in enumerate(raw_options):
                    if isinstance(opt, dict) and str(opt.get("id", "")) == correct_raw:
                        correct_ans = _opt_label(opt, i); break
                else:
                    correct_ans = correct_raw
            else:
                correct_ans = correct_raw
            if student_ans is not None and raw_options:
                sa = str(student_ans)
                for i, opt in enumerate(raw_options):
                    if isinstance(opt, dict) and str(opt.get("id", "")) == sa:
                        student_ans = _opt_label(opt, i); break
                else:
                    try:
                        idx_s = int(sa)
                        if 0 <= idx_s < len(raw_options):
                            student_ans = _opt_label(raw_options[idx_s], idx_s)
                    except (ValueError, TypeError):
                        pass

        elif qtype in ("multichoice", "multiple", "multiple_choice", "multi"):
            raw_options = q_data.get("options", [])
            if isinstance(correct_raw, dict) and "indices" in correct_raw:
                correct_ans = [_opt_label(raw_options[i], i) for i in correct_raw["indices"] if 0 <= i < len(raw_options)]
            else:
                correct_ans = correct_raw
            if isinstance(student_ans, list) and raw_options:
                normalized_sa = []
                for sa_item in student_ans:
                    sa_str = str(sa_item)
                    found = False
                    for i, opt in enumerate(raw_options):
                        if isinstance(opt, dict) and str(opt.get("id", "")) == sa_str:
                            normalized_sa.append(_opt_label(opt, i)); found = True; break
                    if not found:
                        try:
                            idx_s = int(sa_str)
                            normalized_sa.append(_opt_label(raw_options[idx_s], idx_s) if 0 <= idx_s < len(raw_options) else sa_str)
                        except (ValueError, TypeError):
                            normalized_sa.append(sa_str)
                student_ans = normalized_sa

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
                correct_ans = [id_to_label.get(str(oid), str(oid)) for oid in correct_raw["order"]]
            else:
                correct_ans = correct_raw
            if isinstance(student_ans, list):
                student_ans = [id_to_label.get(str(sa_item), str(sa_item)) for sa_item in student_ans]

        elif qtype in ("drag_drop", "drag"):
            raw_items = q_data.get("items", [])
            raw_zones = q_data.get("zones", [])
            item_id_to_label = {str(it.get("id", "")): str(it.get("label", it.get("id", ""))) for it in raw_items if isinstance(it, dict)}
            zone_id_to_label = {str(z.get("id", "")): str(z.get("label", z.get("id", ""))) for z in raw_zones if isinstance(z, dict)}
            def _conv_zones(d):
                if not isinstance(d, dict): return d
                return {zone_id_to_label.get(str(zid), str(zid)): [item_id_to_label.get(str(x), str(x)) for x in (lst if isinstance(lst, list) else [lst])] for zid, lst in d.items()}
            correct_ans = _conv_zones(correct_raw)
            if isinstance(student_ans, dict):
                student_ans = _conv_zones(student_ans)

        elif qtype in ("shorttext", "text", "text_long", "string", "short_answer", "fill"):
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
                if not isinstance(d, dict): return d
                pairs = d.get("pairs", d) if "pairs" in d else d
                if isinstance(pairs, list):
                    pairs = {str(p[0]): str(p[1]) for p in pairs if len(p) >= 2}
                return {left_id_to_label.get(str(lid), str(lid)): right_id_to_label.get(str(rid), str(rid)) for lid, rid in pairs.items()}
            correct_ans = _conv_matching(correct_raw) if isinstance(correct_raw, dict) else correct_raw
            student_ans = _conv_matching(student_ans) if isinstance(student_ans, dict) else student_ans

        else:
            if isinstance(correct_raw, dict):
                correct_ans = correct_raw.get("value", correct_raw)
            else:
                correct_ans = correct_raw

        return student_ans, correct_ans, qtype

    # Если нет вопросов из YAML — собираем ключи из ответов
    if not questions_order:
        keys_seen = set()
        for ans_map in answers_by_attempt.values():
            for k in ans_map:
                if k not in keys_seen:
                    questions_order.append(k)
                    keys_seen.add(k)

    # Строим столбцы (QuestionColOut)
    q_correct_count: dict = {}
    q_total_count: dict = {}
    q_score_sum: dict = {}
    for qk in questions_order:
        q_correct_count[qk] = 0
        q_total_count[qk] = 0
        q_score_sum[qk] = 0

    # Строим строки (StudentRowOut)
    rows = []
    for student in sorted(students, key=lambda s: s.name):
        att = student_attempt.get(student.id)
        if att is None:
            # Ученик не сдавал — пустая строка
            rows.append(StudentRowOut(
                student_id=student.id,
                student_name=student.name,
                student_code=student.code,
                attempt_id=None,
                total_score=0,
                max_score=0,
                percent=0.0,
                submitted_at=None,
                cells={qk: None for qk in questions_order},
            ))
            continue

        ans_map = answers_by_attempt.get(att.id, {})
        cells = {}
        for qk in questions_order:
            ans = ans_map.get(qk)
            if ans is None:
                cells[qk] = None
                continue
            q_data = questions_map.get(qk, {})
            student_ans, correct_ans, qtype = _normalize_cell(ans, q_data)
            cells[qk] = CellAnswerOut(
                is_correct=ans.is_correct,
                score=ans.score,
                max_score=ans.max_score or q_data.get("points", 1),
                student_answer=student_ans,
                correct_answer=correct_ans,
                qtype=qtype,
                attempt_id=att.id,
            )
            # Обновляем статистику по вопросу
            q_total_count[qk] += 1
            q_score_sum[qk] += ans.score
            if ans.is_correct:
                q_correct_count[qk] += 1

        rows.append(StudentRowOut(
            student_id=student.id,
            student_name=student.name,
            student_code=student.code,
            attempt_id=att.id,
            total_score=att.total_score,
            max_score=att.max_score,
            percent=round(att.total_score / att.max_score * 100, 1) if att.max_score else 0.0,
            submitted_at=att.submitted_at,
            cells=cells,
        ))

    # Строим заголовки столбцов с агрегированной статистикой
    questions_cols = []
    for qk in questions_order:
        q_data = questions_map.get(qk, {})
        total = q_total_count.get(qk, 0)
        correct = q_correct_count.get(qk, 0)
        score_sum = q_score_sum.get(qk, 0)
        max_q = q_data.get("points", 1)
        questions_cols.append(QuestionColOut(
            question_key=qk,
            prompt_latex=q_data.get("prompt_latex", "") or q_data.get("prompt", "") or q_data.get("text", "") or qk,
            qtype=q_data.get("type", ""),
            max_score=max_q,
            correct_count=correct,
            total_count=total,
            avg_score=round(score_sum / total, 2) if total else 0.0,
            percent_correct=round(correct / total * 100, 1) if total else 0.0,
        ))

    attempted_ids = set(student_attempt.keys())
    students_attempted = len(attempted_ids)
    all_percents = [r.percent for r in rows if r.attempt_id is not None]
    avg_percent = round(sum(all_percents) / len(all_percents), 1) if all_percents else 0.0
    max_score = all_attempts[0].max_score if all_attempts else 0

    return ResultMatrixOut(
        class_id=class_id,
        class_name=cl.name,
        assignment_id=assignment_id,
        assignment_title=assignment_title,
        questions=questions_cols,
        rows=rows,
        students_attempted=students_attempted,
        students_total=len(students),
        avg_percent=avg_percent,
        max_score=max_score,
    )


# ─── Массовое удаление учеников ───────────────────────────────────────────────

@router.post("/students/bulk-delete")
def bulk_delete_students(
    data: dict,
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    """Удаляет список учеников по их ID."""
    ids = data.get("ids") or data.get("student_ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="Список ID пуст")
    deleted = 0
    for sid in ids:
        s = session.get(Student, int(sid))
        if s:
            session.delete(s)
            deleted += 1
    session.commit()
    return {"ok": True, "deleted": deleted}


# ─── Журнал входов ────────────────────────────────────────────────────────────

@router.get("/login-logs")
def get_login_logs(
    class_id: Optional[int] = Query(None),
    student_id: Optional[int] = Query(None),
    limit: int = Query(100, le=1000),
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    """Возвращает журнал входов учеников."""
    from ..models import LoginLog
    q = select(LoginLog).order_by(LoginLog.logged_in_at.desc()).limit(limit)
    logs = session.exec(q).all()
    result = []
    for log in logs:
        if class_id is not None:
            st = session.get(Student, log.student_id)
            if not st or st.class_id != class_id:
                continue
        if student_id is not None and log.student_id != student_id:
            continue
        result.append({
            "id": log.id,
            "student_id": log.student_id,
            "student_name": log.student_name,
            "class_name": log.class_name,
            "logged_in_at": log.logged_in_at.isoformat() if log.logged_in_at else None,
            "ip_address": log.ip_address,
            "device_type": log.device_type,
            "browser": log.browser,
            "os": log.os,
        })
    return result


# ─── Все попытки ученика ──────────────────────────────────────────────────────

@router.get("/students/{student_id}/attempts")
def get_student_attempts(
    student_id: int,
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    """Возвращает все попытки конкретного ученика с временными данными."""
    attempts = session.exec(
        select(Attempt)
        .where(Attempt.student_id == student_id)
        .order_by(Attempt.submitted_at.desc())
    ).all()
    result = []
    for att in attempts:
        result.append({
            "id": att.id,
            "assignment_id": att.assignment_id,
            "assignment_title": att.assignment_title,
            "class_name": att.class_name,
            "submitted_at": att.submitted_at.isoformat() if att.submitted_at else None,
            "started_at": att.started_at.isoformat() if att.started_at else None,
            "time_spent_seconds": att.time_spent_seconds,
            "total_score": att.total_score,
            "max_score": att.max_score,
            "percent": round(att.total_score / att.max_score * 100, 1) if att.max_score else 0,
        })
    return result


# ─── Карточка ученика (PDF с QR-кодом) ───────────────────────────────────────

@router.get("/students/{student_id}/card")
def get_student_card(
    student_id: int,
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    """Генерирует PDF-карточку ученика с QR-кодом для входа."""
    import io
    import qrcode
    from fastapi.responses import StreamingResponse
    from reportlab.lib.pagesizes import A6
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import os

    s = session.get(Student, student_id)
    if not s:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    cl = session.get(ClassRoom, s.class_id)
    class_name = cl.name if cl else "—"

    # Генерируем QR-код с кодом ученика
    _frontend_url = settings.frontend_url.rstrip("/")
    qr_data = f"{_frontend_url}/login?code={s.code}" if _frontend_url else s.code
    qr = qrcode.QRCode(version=1, box_size=6, border=2)
    qr.add_data(qr_data)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    qr_buf = io.BytesIO()
    qr_img.save(qr_buf, format="PNG")
    qr_buf.seek(0)

    # Генерируем PDF
    pdf_buf = io.BytesIO()
    doc = SimpleDocTemplate(
        pdf_buf,
        pagesize=A6,
        leftMargin=1*cm, rightMargin=1*cm,
        topMargin=1*cm, bottomMargin=1*cm,
    )

    styles = getSampleStyleSheet()
    # Пробуем зарегистрировать шрифт с кириллицей
    # Сначала ищем в папке fonts рядом с модулем (для Windows-совместимости)
    _fonts_dir = Path(__file__).resolve().parent.parent / "fonts"
    font_name = "Helvetica"
    font_bold_name = "Helvetica-Bold"
    for font_path in [
        str(_fonts_dir / "DejaVuSans.ttf"),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    ]:
        if os.path.exists(font_path):
            try:
                pdfmetrics.registerFont(TTFont("CyrFont", font_path))
                font_name = "CyrFont"
                break
            except Exception:
                pass
    bold_path = str(_fonts_dir / "DejaVuSans-Bold.ttf")
    if os.path.exists(bold_path) and font_name == "CyrFont":
        try:
            pdfmetrics.registerFont(TTFont("CyrFontBold", bold_path))
            font_bold_name = "CyrFontBold"
        except Exception:
            font_bold_name = font_name
    else:
        font_bold_name = font_name

    title_style = ParagraphStyle("title", fontName=font_bold_name, fontSize=12, leading=16, alignment=1, spaceAfter=4, textColor=colors.HexColor("#1a3a6b"))
    sub_style = ParagraphStyle("sub", fontName=font_name, fontSize=9, leading=12, alignment=1, spaceAfter=3)
    code_style = ParagraphStyle("code", fontName=font_bold_name, fontSize=18, leading=22, alignment=1, spaceAfter=6, textColor=colors.HexColor("#1a56db"))

    # Логотип школы
    logo_path = str(_fonts_dir / "lyceum_logo.png")
    story = []
    if os.path.exists(logo_path):
        story.append(RLImage(logo_path, width=2*cm, height=2*cm))
        story.append(Spacer(1, 0.1*cm))
    story += [
        Paragraph("МАОУ Лицей №1", title_style),
        Paragraph("г. Красноярск", ParagraphStyle("city", fontName=font_name, fontSize=7, leading=9, alignment=1, textColor=colors.grey, spaceAfter=4)),
        Spacer(1, 0.2*cm),
        Paragraph(s.name, ParagraphStyle("name", fontName=font_bold_name, fontSize=12, leading=15, alignment=1, spaceAfter=3)),
        Paragraph(f"Класс: {class_name}", sub_style),
        Spacer(1, 0.2*cm),
        Paragraph("Код для входа:", sub_style),
        Paragraph(s.code, code_style),
        Spacer(1, 0.2*cm),
        RLImage(qr_buf, width=3.5*cm, height=3.5*cm),
        Spacer(1, 0.1*cm),
        Paragraph("Отсканируйте QR-код или введите код вручную", ParagraphStyle("hint", fontName=font_name, fontSize=7, leading=9, alignment=1, textColor=colors.grey)),
    ]

    doc.build(story)
    pdf_buf.seek(0)

    filename = f"card_{s.code}.pdf"
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/classes/{class_id}/cards")
def get_class_cards(
    class_id: int,
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    """Генерирует PDF со всеми карточками учеников класса (по 4 на странице A4)."""
    import io
    import qrcode
    from fastapi.responses import StreamingResponse
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, Table, TableStyle, PageBreak
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import os

    cl = session.get(ClassRoom, class_id)
    if not cl:
        raise HTTPException(status_code=404, detail="Класс не найден")
    students = session.exec(
        select(Student).where(Student.class_id == class_id).order_by(Student.name)
    ).all()
    if not students:
        raise HTTPException(status_code=404, detail="В классе нет учеников")

    _fonts_dir_cls = Path(__file__).resolve().parent.parent / "fonts"
    font_name = "Helvetica"
    font_bold_name = "Helvetica-Bold"
    for font_path in [
        str(_fonts_dir_cls / "DejaVuSans.ttf"),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    ]:
        if os.path.exists(font_path):
            try:
                pdfmetrics.registerFont(TTFont("CyrFont2", font_path))
                font_name = "CyrFont2"
                break
            except Exception:
                pass
    bold_path_cls = str(_fonts_dir_cls / "DejaVuSans-Bold.ttf")
    if os.path.exists(bold_path_cls) and font_name == "CyrFont2":
        try:
            pdfmetrics.registerFont(TTFont("CyrFontBold2", bold_path_cls))
            font_bold_name = "CyrFontBold2"
        except Exception:
            font_bold_name = font_name
    else:
        font_bold_name = font_name

    logo_path_cls = str(_fonts_dir_cls / "lyceum_logo.png")

    pdf_buf = io.BytesIO()
    doc = SimpleDocTemplate(pdf_buf, pagesize=A4, leftMargin=1*cm, rightMargin=1*cm, topMargin=1*cm, bottomMargin=1*cm)

    name_style = ParagraphStyle("name", fontName=font_bold_name, fontSize=10, leading=13, alignment=1)
    class_style = ParagraphStyle("cls", fontName=font_name, fontSize=8, leading=11, alignment=1, textColor=colors.grey)
    code_style = ParagraphStyle("code", fontName=font_bold_name, fontSize=14, leading=18, alignment=1, textColor=colors.HexColor("#1a56db"))
    hint_style = ParagraphStyle("hint", fontName=font_name, fontSize=7, leading=9, alignment=1, textColor=colors.grey)
    school_style = ParagraphStyle("school", fontName=font_bold_name, fontSize=8, leading=10, alignment=1, textColor=colors.HexColor("#1a3a6b"))

    def make_card(st):
        _frontend_url2 = settings.frontend_url.rstrip("/")
        qr_data2 = f"{_frontend_url2}/login?code={st.code}" if _frontend_url2 else st.code
        qr = qrcode.QRCode(version=1, box_size=5, border=2)
        qr.add_data(qr_data2)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white")
        qr_buf = io.BytesIO()
        qr_img.save(qr_buf, format="PNG")
        qr_buf.seek(0)
        # Build inner table for each card (single column, multiple rows)
        inner_rows = []
        if os.path.exists(logo_path_cls):
            inner_rows.append([RLImage(logo_path_cls, width=1.2*cm, height=1.2*cm)])
        inner_rows += [
            [Paragraph("МАОУ Лицей №1", school_style)],
            [Paragraph(st.name, name_style)],
            [Paragraph(f"Класс: {cl.name}", class_style)],
            [Paragraph(st.code, code_style)],
            [RLImage(qr_buf, width=3*cm, height=3*cm)],
            [Paragraph("Отсканируйте QR или введите код", hint_style)],
        ]
        inner_t = Table(inner_rows, colWidths=[8.5*cm])
        inner_t.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        return inner_t

    # Разбиваем на группы по 4 (2x2 на странице A4)
    story = []
    cards = [make_card(st) for st in students]
    empty_cell = Paragraph("", name_style)
    for i in range(0, len(cards), 4):
        batch = cards[i:i+4]
        # Дополняем до 4 если нечётное количество
        while len(batch) < 4:
            batch.append(empty_cell)
        rows = [[batch[0], batch[1]], [batch[2], batch[3]]]
        t = Table(rows, colWidths=[9.5*cm, 9.5*cm], rowHeights=[13*cm, 13*cm])
        t.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(t)
        if i + 4 < len(cards):
            story.append(PageBreak())

    doc.build(story)
    pdf_buf.seek(0)
    filename = f"cards_{cl.name}.pdf"
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename*=UTF-8\'\'{quote(filename)}'},
    )


# ─── Онлайн-присутствие учеников ──────────────────────────────────────────────

@router.get("/classes/{class_id}/online")
def get_class_online(
    class_id: int,
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    """Возвращает список учеников класса с их онлайн-статусом."""
    from datetime import timezone
    from ..models import StudentHeartbeat

    cl = session.get(ClassRoom, class_id)
    if not cl:
        raise HTTPException(status_code=404, detail="Класс не найден")

    students = session.exec(
        select(Student).where(Student.class_id == class_id).order_by(Student.name)
    ).all()

    now = datetime.utcnow()
    result = []
    for s in students:
        hb = session.exec(
            select(StudentHeartbeat).where(StudentHeartbeat.student_id == s.id)
        ).first()
        if hb:
            diff_seconds = (now - hb.last_seen).total_seconds()
            is_online = diff_seconds <= 60  # онлайн если был активен менее 60 секунд назад
            last_seen_str = hb.last_seen.isoformat()
            assignment_id = hb.assignment_id
            # Получаем название задания из STORE
            assignment_title = None
            if assignment_id and cl:
                try:
                    from ..services.assignment_store import STORE
                    a_obj = STORE.get(cl.name, assignment_id)
                    if a_obj:
                        assignment_title = a_obj.title
                except Exception:
                    pass
        else:
            is_online = False
            last_seen_str = None
            assignment_id = None
            assignment_title = None
        result.append({
            "id": s.id,
            "name": s.name,
            "code": s.code,
            "is_online": is_online,
            "last_seen": last_seen_str,
            "assignment_id": assignment_id,
            "assignment_title": assignment_title,
        })

    return result


# ─── Информация о сервере (IP для QR-кодов) ───────────────────────────────────
@router.get("/server-info")
def get_server_info(request: Request, _=Depends(get_current_admin)):
    """Возвращает IP-адрес сервера и порт для формирования URL входа."""
    import socket
    # 1. Если задан FRONTEND_URL в конфиге — используем его
    if settings.frontend_url:
        base = settings.frontend_url.rstrip("/")
        return {
            "ip": None,
            "port": None,
            "frontend_url": base,
            "login_url": f"{base}/login",
        }
    # 2. Определяем локальный IP через сокет
    server_ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        server_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass
    # 3. Определяем порт из заголовка Host
    host_header = request.headers.get("host", "")
    port = 8000
    if ":" in host_header:
        try:
            port = int(host_header.split(":")[-1])
        except ValueError:
            port = 8000
    if port in (80, 443):
        base_url = f"http://{server_ip}"
    else:
        base_url = f"http://{server_ip}:{port}"
    return {
        "ip": server_ip,
        "port": port,
        "frontend_url": base_url,
        "login_url": f"{base_url}/login",
    }


# ─── 10 карточек на листе A4 ──────────────────────────────────────────────────
@router.get("/classes/{class_id}/cards10")
def get_class_cards_10(
    class_id: int,
    base_url: str = Query(default="", description="Базовый URL сервера для QR-кодов"),
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    """Генерирует PDF с 10 карточками учеников на листе A4 (5 строк × 2 столбца)."""
    import io
    import qrcode
    from fastapi.responses import StreamingResponse
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm, mm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, PageBreak
    from reportlab.platypus import Image as RLImage
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import os

    cl = session.get(ClassRoom, class_id)
    if not cl:
        raise HTTPException(status_code=404, detail="Класс не найден")
    students = session.exec(
        select(Student).where(Student.class_id == class_id).order_by(Student.name)
    ).all()
    if not students:
        raise HTTPException(status_code=404, detail="В классе нет учеников")

    # Шрифты с кириллицей
    _fonts_dir = Path(__file__).resolve().parent.parent / "fonts"
    font_name = "Helvetica"
    font_bold_name = "Helvetica-Bold"
    for font_path in [
        str(_fonts_dir / "DejaVuSans.ttf"),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]:
        if os.path.exists(font_path):
            try:
                pdfmetrics.registerFont(TTFont("CyrFont10", font_path))
                font_name = "CyrFont10"
                break
            except Exception:
                pass
    bold_path = str(_fonts_dir / "DejaVuSans-Bold.ttf")
    if os.path.exists(bold_path) and font_name == "CyrFont10":
        try:
            pdfmetrics.registerFont(TTFont("CyrFontBold10", bold_path))
            font_bold_name = "CyrFontBold10"
        except Exception:
            font_bold_name = font_name
    else:
        font_bold_name = font_name

    logo_path = str(_fonts_dir / "lyceum_logo.png")

    # Определяем URL для QR-кодов
    _base = (base_url or settings.frontend_url or "").rstrip("/")

    # Стили текста
    school_style = ParagraphStyle("school10", fontName=font_bold_name, fontSize=6, leading=8, alignment=1, textColor=colors.HexColor("#1a3a6b"))
    name_style = ParagraphStyle("name10", fontName=font_bold_name, fontSize=8, leading=10, alignment=1)
    class_style = ParagraphStyle("cls10", fontName=font_name, fontSize=7, leading=9, alignment=1, textColor=colors.grey)
    code_style = ParagraphStyle("code10", fontName=font_bold_name, fontSize=11, leading=14, alignment=1, textColor=colors.HexColor("#1a56db"))
    hint_style = ParagraphStyle("hint10", fontName=font_name, fontSize=5.5, leading=7, alignment=1, textColor=colors.grey)

    def make_card_10(st):
        """Создаёт содержимое одной карточки для сетки 10-на-листе."""
        qr_data = f"{_base}/login?code={st.code}" if _base else st.code
        qr = qrcode.QRCode(version=1, box_size=4, border=2)
        qr.add_data(qr_data)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white")
        qr_buf = io.BytesIO()
        qr_img.save(qr_buf, format="PNG")
        qr_buf.seek(0)

        inner_rows = []
        if os.path.exists(logo_path):
            inner_rows.append([RLImage(logo_path, width=0.8*cm, height=0.8*cm)])
        inner_rows += [
            [Paragraph("МАОУ Лицей №1", school_style)],
            [Paragraph(st.name, name_style)],
            [Paragraph(f"Класс: {cl.name}", class_style)],
            [Paragraph(st.code, code_style)],
            [RLImage(qr_buf, width=2.2*cm, height=2.2*cm)],
            [Paragraph("Скан QR или введите код", hint_style)],
        ]
        if _base:
            url_short = _base.replace("http://", "").replace("https://", "")
            inner_rows.append([Paragraph(url_short, hint_style)])

        inner_t = Table(inner_rows, colWidths=[9*cm])
        inner_t.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ]))
        return inner_t

    # A4: 210×297 мм, поля 5мм, 2 колонки × 5 строк = 10 карточек
    CARD_W = 9.5 * cm
    CARD_H = 5.4 * cm

    pdf_buf = io.BytesIO()
    doc = SimpleDocTemplate(
        pdf_buf, pagesize=A4,
        leftMargin=5*mm, rightMargin=5*mm,
        topMargin=5*mm, bottomMargin=5*mm,
    )

    story = []
    cards = [make_card_10(st) for st in students]
    # Заполняем пустыми ячейками до кратного 10
    empty_cell = Paragraph("", name_style)
    while len(cards) % 10 != 0:
        cards.append(empty_cell)

    for page_start in range(0, len(cards), 10):
        page_cards = cards[page_start:page_start + 10]
        # 5 строк по 2 карточки
        rows = []
        for row_i in range(5):
            rows.append([page_cards[row_i * 2], page_cards[row_i * 2 + 1]])

        t = Table(
            rows,
            colWidths=[CARD_W, CARD_W],
            rowHeights=[CARD_H] * 5,
        )
        t.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(t)
        if page_start + 10 < len(cards):
            story.append(PageBreak())

    doc.build(story)
    pdf_buf.seek(0)
    filename = f"cards10_{cl.name}.pdf"
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename*=UTF-8\'\'{quote(filename)}'},
    )
