from __future__ import annotations
from sqlmodel import Session, select

from .db import engine
from .models import AdminUser
from .core.security import hash_password

def seed():
    with Session(engine) as session:
        admin = session.exec(select(AdminUser).where(AdminUser.username == "admin")).first()
        if not admin:
            session.add(AdminUser(username="admin", password_hash=hash_password("admin123")))
            session.commit()



if __name__ == "__main__":
    seed()
