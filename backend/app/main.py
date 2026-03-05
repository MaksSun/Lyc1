from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from .db import init_db, get_db_path
from .core.config import settings
from .migrate import run_migrations
from .routers.student import router as student_router
from .routers.admin import router as admin_router
from .routers.survey import router as survey_router
from .routers.materials import router as materials_router
from .routers.yaml_editor import router as yaml_router
from .routers.robot import router as robot_router
from .seed import seed

app = FastAPI(title="EduPlatform v5 — Интерактивная образовательная платформа")

# Папка с изображениями для заданий
ASSETS_DIR = Path(__file__).resolve().parents[1] / "assignments_assets"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/assignment-images", StaticFiles(directory=str(ASSETS_DIR)), name="assignment_images")

# Папка с загружаемыми материалами (PDF, видео и т.д.)
MATERIALS_DIR = Path(__file__).resolve().parents[1] / "materials_files"
MATERIALS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/materials-files", StaticFiles(directory=str(MATERIALS_DIR)), name="materials_files")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()
    # Автоматическая миграция: добавляет новые колонки в существующую БД
    run_migrations(get_db_path())
    seed()


# Регистрируем API роутеры ДО монтирования статических файлов
app.include_router(student_router)
app.include_router(admin_router)
app.include_router(survey_router)
app.include_router(materials_router)
app.include_router(yaml_router)
app.include_router(robot_router)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "5.0"}


# Путь к frontend/dist (собранный фронтенд)
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

if FRONTEND_DIST.exists() and (FRONTEND_DIST / "index.html").exists():
    @app.middleware("http")
    async def spa_middleware(request: Request, call_next):
        response = await call_next(request)
        if response.status_code == 404:
            path = request.url.path
            if not path.startswith("/api/") and not path.startswith("/assignment-images/") and not path.startswith("/materials-files/"):
                if not any(path.endswith(ext) for ext in
                           ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
                            '.woff', '.woff2', '.ttf', '.eot', '.json', '.xml', '.pdf']):
                    return FileResponse(str(FRONTEND_DIST / "index.html"))
        return response

    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="static")
else:
    @app.get("/")
    def dev_mode_info():
        return {
            "message": "Frontend not built. Run 'npm run build' in frontend/",
            "frontend_dist_path": str(FRONTEND_DIST),
        }
