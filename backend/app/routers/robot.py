"""
Роутер для игры «Робот-Исполнитель».

Эндпоинты:
  POST /api/robot/attempt          — сохранить результат запуска
  GET  /api/robot/attempts         — история попыток ученика
  GET  /api/robot/leaderboard      — топ по уровням (класс)
  GET  /api/robot/trends           — тренды: топ уровней по запускам
  GET  /api/robot/levels           — библиотека уровней (класс + ученик)
  POST /api/robot/levels           — создать/обновить уровень
  DELETE /api/robot/levels/{id}    — удалить уровень
  GET  /api/admin/robot/attempts   — все попытки (администратор)
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_student, get_current_admin
from ..models import Student, ClassRoom

router = APIRouter(tags=["robot"])


# ─── Pydantic schemas ────────────────────────────────────────────────────────

class RobotAttemptIn(BaseModel):
    level_id: str
    level_name: str
    success: bool
    steps: int
    code: str
    time_seconds: int = 0


class RobotAttemptOut(BaseModel):
    id: int
    student_id: int
    student_name: str
    class_name: str
    level_id: str
    level_name: str
    success: bool
    steps: int
    code: str
    time_seconds: int
    created_at: datetime


class RobotLeaderboardItem(BaseModel):
    student_name: str
    class_name: str
    level_id: str
    level_name: str
    best_steps: int
    attempts_count: int
    last_success_at: Optional[datetime]


class RobotTrendItem(BaseModel):
    level_id: str
    level_name: str
    total_runs: int
    success_runs: int
    unique_students: int
    avg_steps: float


class RobotLevelIn(BaseModel):
    name: str
    description: str = ""
    rows: int = 7
    cols: int = 9
    robot_start_row: int = 0
    robot_start_col: int = 0
    walls_h: List[str] = []   # ["h:row:col", ...]
    walls_v: List[str] = []
    targets: List[str] = []   # ["row:col", ...]
    initial_code: str = ""
    is_public: bool = False   # виден всему классу
    visibility: str = "personal"  # "personal" | "class" | "school"


class RobotLevelOut(BaseModel):
    id: int
    name: str
    description: str
    rows: int
    cols: int
    robot_start_row: int
    robot_start_col: int
    walls_h: List[str]
    walls_v: List[str]
    targets: List[str]
    initial_code: str
    is_public: bool
    visibility: str
    author_name: str
    class_name: str
    created_at: datetime
    run_count: int


# ─── Table creation ──────────────────────────────────────────────────────────

_TABLES_CREATED = False

def _ensure_tables(session: Session):
    global _TABLES_CREATED
    if _TABLES_CREATED:
        return
    conn = session.connection()
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS robot_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            student_name TEXT NOT NULL DEFAULT '',
            class_name TEXT NOT NULL DEFAULT '',
            level_id TEXT NOT NULL DEFAULT '',
            level_name TEXT NOT NULL DEFAULT '',
            success BOOLEAN NOT NULL DEFAULT 0,
            steps INTEGER NOT NULL DEFAULT 0,
            code TEXT NOT NULL DEFAULT '',
            time_seconds INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS robot_levels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            student_name TEXT NOT NULL DEFAULT '',
            class_name TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL DEFAULT 'Без названия',
            description TEXT NOT NULL DEFAULT '',
            rows INTEGER NOT NULL DEFAULT 7,
            cols INTEGER NOT NULL DEFAULT 9,
            robot_start_row INTEGER NOT NULL DEFAULT 0,
            robot_start_col INTEGER NOT NULL DEFAULT 0,
            walls_h TEXT NOT NULL DEFAULT '[]',
            walls_v TEXT NOT NULL DEFAULT '[]',
            targets TEXT NOT NULL DEFAULT '[]',
            initial_code TEXT NOT NULL DEFAULT '',
            is_public BOOLEAN NOT NULL DEFAULT 0,
            visibility TEXT NOT NULL DEFAULT 'personal',
            run_count INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """))
    # Add visibility column if it doesn't exist (migration for existing DBs)
    try:
        conn.execute(text("ALTER TABLE robot_levels ADD COLUMN visibility TEXT NOT NULL DEFAULT 'personal'"))
        conn.commit()
    except Exception:
        pass  # Column already exists
    conn.commit()
    _TABLES_CREATED = True


# ─── Student endpoints ───────────────────────────────────────────────────────

@router.post("/api/robot/attempt", response_model=RobotAttemptOut)
def save_robot_attempt(
    data: RobotAttemptIn,
    student: Student = Depends(get_current_student),
    session: Session = Depends(get_session),
):
    """Сохранить результат одного запуска программы робота."""
    _ensure_tables(session)

    cl = session.exec(select(ClassRoom).where(ClassRoom.id == student.class_id)).first()
    class_name = cl.name if cl else ""

    conn = session.connection()

    # Если level_id начинается с "custom:", это пользовательский уровень — увеличить run_count
    if data.level_id.startswith("custom:"):
        try:
            lvl_id = int(data.level_id.split(":")[1])
            conn.execute(
                text("UPDATE robot_levels SET run_count = run_count + 1 WHERE id = :id"),
                {"id": lvl_id}
            )
        except Exception:
            pass

    cursor = conn.execute(
        text("""
        INSERT INTO robot_attempts
            (student_id, student_name, class_name, level_id, level_name,
             success, steps, code, time_seconds, created_at)
        VALUES (:student_id, :student_name, :class_name, :level_id, :level_name,
                :success, :steps, :code, :time_seconds, :created_at)
        """),
        {
            "student_id": student.id,
            "student_name": student.name,
            "class_name": class_name,
            "level_id": data.level_id,
            "level_name": data.level_name,
            "success": 1 if data.success else 0,
            "steps": data.steps,
            "code": data.code[:5000],
            "time_seconds": data.time_seconds,
            "created_at": datetime.utcnow().isoformat(),
        },
    )
    conn.commit()
    row_id = cursor.lastrowid

    row = conn.execute(
        text("SELECT * FROM robot_attempts WHERE id = :id"),
        {"id": row_id}
    ).fetchone()

    return _row_to_attempt_out(row)


@router.get("/api/robot/attempts", response_model=List[RobotAttemptOut])
def get_my_robot_attempts(
    student: Student = Depends(get_current_student),
    session: Session = Depends(get_session),
):
    """История попыток текущего ученика (последние 100)."""
    _ensure_tables(session)
    conn = session.connection()
    rows = conn.execute(
        text("""
        SELECT * FROM robot_attempts
        WHERE student_id = :student_id
        ORDER BY created_at DESC
        LIMIT 100
        """),
        {"student_id": student.id},
    ).fetchall()
    return [_row_to_attempt_out(r) for r in rows]


@router.get("/api/robot/leaderboard", response_model=List[RobotLeaderboardItem])
def get_robot_leaderboard(
    student: Student = Depends(get_current_student),
    session: Session = Depends(get_session),
):
    """Лучшие результаты по уровням для класса текущего ученика."""
    _ensure_tables(session)
    cl = session.exec(select(ClassRoom).where(ClassRoom.id == student.class_id)).first()
    class_name = cl.name if cl else ""

    conn = session.connection()
    rows = conn.execute(
        text("""
        SELECT
            student_name,
            class_name,
            level_id,
            level_name,
            MIN(steps) as best_steps,
            COUNT(*) as attempts_count,
            MAX(CASE WHEN success = 1 THEN created_at ELSE NULL END) as last_success_at
        FROM robot_attempts
        WHERE class_name = :class_name AND success = 1 AND steps > 0
        GROUP BY student_name, level_id
        ORDER BY level_id, best_steps ASC
        LIMIT 200
        """),
        {"class_name": class_name},
    ).fetchall()

    result = []
    for r in rows:
        result.append(RobotLeaderboardItem(
            student_name=r[0],
            class_name=r[1],
            level_id=r[2],
            level_name=r[3],
            best_steps=r[4],
            attempts_count=r[5],
            last_success_at=datetime.fromisoformat(r[6]) if r[6] else None,
        ))
    return result


@router.get("/api/robot/trends", response_model=List[RobotTrendItem])
def get_robot_trends(
    student: Student = Depends(get_current_student),
    session: Session = Depends(get_session),
):
    """Тренды: топ уровней по количеству запусков в классе."""
    _ensure_tables(session)
    cl = session.exec(select(ClassRoom).where(ClassRoom.id == student.class_id)).first()
    class_name = cl.name if cl else ""

    conn = session.connection()
    rows = conn.execute(
        text("""
        SELECT
            level_id,
            level_name,
            COUNT(*) as total_runs,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_runs,
            COUNT(DISTINCT student_id) as unique_students,
            AVG(CASE WHEN steps > 0 THEN steps ELSE NULL END) as avg_steps
        FROM robot_attempts
        WHERE class_name = :class_name
        GROUP BY level_id
        ORDER BY total_runs DESC
        LIMIT 20
        """),
        {"class_name": class_name},
    ).fetchall()

    result = []
    for r in rows:
        result.append(RobotTrendItem(
            level_id=r[0],
            level_name=r[1],
            total_runs=r[2],
            success_runs=r[3],
            unique_students=r[4],
            avg_steps=round(r[5] or 0, 1),
        ))
    return result


# ─── Level library endpoints ─────────────────────────────────────────────────

@router.get("/api/robot/levels", response_model=List[RobotLevelOut])
def get_robot_levels(
    student: Student = Depends(get_current_student),
    session: Session = Depends(get_session),
):
    """Библиотека уровней: свои + публичные уровни класса."""
    _ensure_tables(session)
    cl = session.exec(select(ClassRoom).where(ClassRoom.id == student.class_id)).first()
    class_name = cl.name if cl else ""

    conn = session.connection()
    rows = conn.execute(
        text("""
        SELECT * FROM robot_levels
        WHERE (
            student_id = :student_id
            OR (visibility = 'class' AND class_name = :class_name)
            OR (is_public = 1 AND class_name = :class_name)
            OR visibility = 'school'
        )
        ORDER BY updated_at DESC
        LIMIT 200
        """),
        {"class_name": class_name, "student_id": student.id},
    ).fetchall()
    return [_row_to_level_out(r) for r in rows]


@router.post("/api/robot/levels", response_model=RobotLevelOut)
def save_robot_level(
    data: RobotLevelIn,
    student: Student = Depends(get_current_student),
    session: Session = Depends(get_session),
):
    """Создать новый уровень в библиотеке."""
    _ensure_tables(session)

    if data.rows < 2 or data.rows > 100 or data.cols < 2 or data.cols > 100:
        raise HTTPException(400, "Размер поля: от 2×2 до 100×100")

    cl = session.exec(select(ClassRoom).where(ClassRoom.id == student.class_id)).first()
    class_name = cl.name if cl else ""

    conn = session.connection()
    now = datetime.utcnow().isoformat()
    cursor = conn.execute(
        text("""
        INSERT INTO robot_levels
            (student_id, student_name, class_name, name, description,
             rows, cols, robot_start_row, robot_start_col,
             walls_h, walls_v, targets, initial_code, is_public, visibility,
             run_count, created_at, updated_at)
        VALUES
            (:student_id, :student_name, :class_name, :name, :description,
             :rows, :cols, :robot_start_row, :robot_start_col,
             :walls_h, :walls_v, :targets, :initial_code, :is_public, :visibility,
             0, :now, :now)
        """),
        {
            "student_id": student.id,
            "student_name": student.name,
            "class_name": class_name,
            "name": data.name[:100],
            "description": data.description[:500],
            "rows": data.rows,
            "cols": data.cols,
            "robot_start_row": data.robot_start_row,
            "robot_start_col": data.robot_start_col,
            "walls_h": json.dumps(data.walls_h),
            "walls_v": json.dumps(data.walls_v),
            "targets": json.dumps(data.targets),
            "initial_code": data.initial_code[:5000],
            "is_public": 1 if data.visibility in ("class", "school") else 0,
            "visibility": data.visibility if data.visibility in ("personal", "class", "school") else "personal",
            "now": now,
        }
    )
    conn.commit()
    row_id = cursor.lastrowid

    row = conn.execute(
        text("SELECT * FROM robot_levels WHERE id = :id"),
        {"id": row_id}
    ).fetchone()
    return _row_to_level_out(row)


@router.delete("/api/robot/levels/{level_id}")
def delete_robot_level(
    level_id: int,
    student: Student = Depends(get_current_student),
    session: Session = Depends(get_session),
):
    """Удалить уровень (только свой)."""
    _ensure_tables(session)
    conn = session.connection()
    row = conn.execute(
        text("SELECT student_id FROM robot_levels WHERE id = :id"),
        {"id": level_id}
    ).fetchone()
    if not row:
        raise HTTPException(404, "Уровень не найден")
    if row[0] != student.id:
        raise HTTPException(403, "Нельзя удалить чужой уровень")
    conn.execute(text("DELETE FROM robot_levels WHERE id = :id"), {"id": level_id})
    conn.commit()
    return {"ok": True}


# ─── Admin endpoints ─────────────────────────────────────────────────────────

@router.get("/api/admin/robot/attempts", response_model=List[RobotAttemptOut])
def admin_get_robot_attempts(
    class_name: Optional[str] = None,
    level_id: Optional[str] = None,
    success_only: bool = False,
    limit: int = 500,
    _admin=Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Все попытки игры (для администратора)."""
    _ensure_tables(session)
    conn = session.connection()

    conditions = []
    params: dict = {}

    if class_name:
        conditions.append("class_name = :class_name")
        params["class_name"] = class_name
    if level_id:
        conditions.append("level_id = :level_id")
        params["level_id"] = level_id
    if success_only:
        conditions.append("success = 1")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    params["limit"] = min(limit, 1000)

    rows = conn.execute(
        text(f"""
        SELECT * FROM robot_attempts
        {where}
        ORDER BY created_at DESC
        LIMIT :limit
        """),
        params,
    ).fetchall()

    return [_row_to_attempt_out(r) for r in rows]


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _row_to_attempt_out(row) -> RobotAttemptOut:
    created = row[10]
    if isinstance(created, str):
        try:
            created = datetime.fromisoformat(created)
        except Exception:
            created = datetime.utcnow()
    return RobotAttemptOut(
        id=row[0], student_id=row[1], student_name=row[2], class_name=row[3],
        level_id=row[4], level_name=row[5], success=bool(row[6]),
        steps=row[7], code=row[8], time_seconds=row[9], created_at=created,
    )


def _row_to_level_out(row) -> RobotLevelOut:
    # Columns order in robot_levels table:
    # 0:id, 1:student_id, 2:student_name, 3:class_name, 4:name, 5:description,
    # 6:rows, 7:cols, 8:robot_start_row, 9:robot_start_col,
    # 10:walls_h, 11:walls_v, 12:targets, 13:initial_code,
    # 14:is_public, 15:visibility, 16:run_count, 17:created_at, 18:updated_at
    created = row[17]
    if isinstance(created, str):
        try:
            created = datetime.fromisoformat(created)
        except Exception:
            created = datetime.utcnow()
    elif created is None:
        created = datetime.utcnow()
    try:
        walls_h = json.loads(row[10]) if row[10] else []
    except Exception:
        walls_h = []
    try:
        walls_v = json.loads(row[11]) if row[11] else []
    except Exception:
        walls_v = []
    try:
        targets = json.loads(row[12]) if row[12] else []
    except Exception:
        targets = []
    # Determine visibility
    try:
        visibility = row[15] if row[15] else ("class" if bool(row[14]) else "personal")
    except Exception:
        visibility = "class" if bool(row[14]) else "personal"
    try:
        run_count = int(row[16]) if row[16] is not None else 0
    except (TypeError, ValueError):
        run_count = 0
    return RobotLevelOut(
        id=row[0], name=row[4], description=row[5],
        rows=row[6], cols=row[7], robot_start_row=row[8], robot_start_col=row[9],
        walls_h=walls_h, walls_v=walls_v, targets=targets,
        initial_code=row[13] or "", is_public=bool(row[14]),
        visibility=visibility,
        author_name=row[2], class_name=row[3],
        created_at=created, run_count=run_count,
    )
