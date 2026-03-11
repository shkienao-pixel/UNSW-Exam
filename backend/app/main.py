"""FastAPI application entry point."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.exceptions import InsufficientCreditsError
from app.core.supabase_client import get_supabase
from app.services.generation_worker import start_generation_worker, stop_generation_workers
from app.routers import auth, courses, artifacts, scope_sets, outputs, admin, content, generate, review, knowledge, feedback, credits
from app.routers import course_content

settings = get_settings()

app = FastAPI(
    title="UNSW Exam Master API",
    version="0.7.0",
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
app.include_router(review.router,     prefix="",         tags=["review"])
app.include_router(knowledge.router,  prefix="",         tags=["knowledge"])
app.include_router(feedback.router,   prefix="",         tags=["feedback"])
app.include_router(credits.router,    prefix="/credits", tags=["credits"])
app.include_router(credits.admin_router, prefix="/admin", tags=["admin"])
app.include_router(course_content.router, prefix="/courses", tags=["course-content"])


@app.on_event("startup")
async def _startup_generation_workers() -> None:
    app.state.generation_worker_tasks = start_generation_worker()


@app.on_event("shutdown")
async def _shutdown_generation_workers() -> None:
    tasks = getattr(app.state, "generation_worker_tasks", [])
    await stop_generation_workers(tasks)


@app.exception_handler(InsufficientCreditsError)
async def insufficient_credits_handler(request: Request, exc: InsufficientCreditsError) -> JSONResponse:
    """统一 402 积分不足响应：{ detail, balance, required }"""
    return JSONResponse(
        status_code=402,
        content={
            "detail": exc.detail,
            "balance": exc.balance,
            "required": exc.required,
        },
    )


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
