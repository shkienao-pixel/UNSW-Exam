"""FastAPI application entry point."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.supabase_client import get_supabase
from app.routers import auth, courses, artifacts, scope_sets, outputs, admin, content, generate

settings = get_settings()

app = FastAPI(
    title="UNSW Exam Master API",
    version="0.4.0",
    description="Backend API for UNSW Exam Master — multi-user AI exam prep platform",
)

# CORS — 开发模式允许所有 localhost 端口，生产模式使用白名单
_allow_origin_regex = r"http://localhost:\d+" if settings.app_env == "development" else None
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=_allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router,       prefix="/auth",    tags=["auth"])
app.include_router(courses.router,    prefix="/courses", tags=["courses"])
app.include_router(artifacts.router,  prefix="/courses", tags=["artifacts"])
app.include_router(scope_sets.router, prefix="/courses", tags=["scope-sets"])
app.include_router(outputs.router,    prefix="/courses", tags=["outputs"])
app.include_router(content.router,    prefix="/courses", tags=["content"])
app.include_router(generate.router,   prefix="/courses", tags=["generate"])
app.include_router(admin.router,      prefix="/admin",   tags=["admin"])


@app.get("/health", tags=["system"])
def health_check() -> dict:
    """Liveness probe — also verifies Supabase connectivity."""
    try:
        # Light connectivity check: fetch Supabase server time
        supabase = get_supabase()
        supabase.table("courses").select("id").limit(1).execute()
        supabase_status = "connected"
    except Exception as exc:
        supabase_status = f"error: {exc}"

    return {"status": "ok", "supabase": supabase_status}
