"""Роутер для обучающих материалов."""
from __future__ import annotations
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_admin, get_current_student
from ..models import Material, Student, ClassRoom
from ..schemas import MaterialCreate, MaterialOut

router = APIRouter(prefix="/api/materials", tags=["materials"])


# ─── Студенческий доступ ───────────────────────────────────────────────────

@router.get("/for-assignment/{assignment_id}", response_model=list[MaterialOut])
def get_materials_for_assignment(
    assignment_id: str,
    student: Student = Depends(get_current_student),
    session: Session = Depends(get_session),
):
    """Получить материалы для конкретного задания (доступны ученику)."""
    q = select(Material).where(
        (Material.assignment_id == assignment_id) |
        (Material.assignment_id == None)
    ).where(
        (Material.class_id == student.class_id) |
        (Material.class_id == None)
    ).order_by(Material.sort_order, Material.created_at)
    materials = session.exec(q).all()
    return [MaterialOut(
        id=m.id, title=m.title, description=m.description,
        material_type=m.material_type, content=m.content,
        class_id=m.class_id, assignment_id=m.assignment_id,
        sort_order=m.sort_order, created_at=m.created_at,
    ) for m in materials]


# ─── Административный доступ ───────────────────────────────────────────────

@router.get("/admin/list", response_model=list[MaterialOut])
def list_materials(
    class_id: Optional[int] = Query(default=None),
    assignment_id: Optional[str] = Query(default=None),
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    q = select(Material)
    if class_id is not None:
        q = q.where(Material.class_id == class_id)
    if assignment_id is not None:
        q = q.where(Material.assignment_id == assignment_id)
    materials = session.exec(q.order_by(Material.sort_order, Material.created_at)).all()
    return [MaterialOut(
        id=m.id, title=m.title, description=m.description,
        material_type=m.material_type, content=m.content,
        class_id=m.class_id, assignment_id=m.assignment_id,
        sort_order=m.sort_order, created_at=m.created_at,
    ) for m in materials]


@router.post("/admin/create", response_model=MaterialOut)
def create_material(
    data: MaterialCreate,
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    m = Material(
        title=data.title,
        description=data.description,
        material_type=data.material_type,
        content=data.content,
        class_id=data.class_id,
        assignment_id=data.assignment_id,
        sort_order=data.sort_order,
    )
    session.add(m)
    session.commit()
    session.refresh(m)
    return MaterialOut(
        id=m.id, title=m.title, description=m.description,
        material_type=m.material_type, content=m.content,
        class_id=m.class_id, assignment_id=m.assignment_id,
        sort_order=m.sort_order, created_at=m.created_at,
    )


@router.put("/admin/{material_id}", response_model=MaterialOut)
def update_material(
    material_id: int,
    data: MaterialCreate,
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    m = session.get(Material, material_id)
    if not m:
        raise HTTPException(status_code=404, detail="Материал не найден")
    m.title = data.title
    m.description = data.description
    m.material_type = data.material_type
    m.content = data.content
    m.class_id = data.class_id
    m.assignment_id = data.assignment_id
    m.sort_order = data.sort_order
    m.updated_at = datetime.utcnow()
    session.add(m)
    session.commit()
    session.refresh(m)
    return MaterialOut(
        id=m.id, title=m.title, description=m.description,
        material_type=m.material_type, content=m.content,
        class_id=m.class_id, assignment_id=m.assignment_id,
        sort_order=m.sort_order, created_at=m.created_at,
    )


@router.delete("/admin/{material_id}")
def delete_material(
    material_id: int,
    session: Session = Depends(get_session),
    _=Depends(get_current_admin),
):
    m = session.get(Material, material_id)
    if not m:
        raise HTTPException(status_code=404, detail="Материал не найден")
    session.delete(m)
    session.commit()
    return {"ok": True}
