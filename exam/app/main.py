"""FastAPI application entry point for the TOPIK AI Prep backend."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import LLMConfigurationError
from app.database.models import init_db
from app.database.seed_data import seed_if_empty
from app.database.vector_db import init_collections
from app.routers import exam, user, writing
from app.services.exam_generator import InsufficientQuestionPoolError

logger = logging.getLogger("topik_ai_prep")

_cors_origins_env = os.environ.get("CORS_ORIGINS", "*")
CORS_ORIGINS = [origin.strip() for origin in _cors_origins_env.split(",")]
# Browsers reject `Access-Control-Allow-Origin: *` combined with credentials, so only
# allow credentials once specific origins are configured (CORS_ORIGINS env var).
CORS_ALLOW_CREDENTIALS = CORS_ORIGINS != ["*"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    init_collections()
    seed_if_empty()
    yield


app = FastAPI(
    title="TOPIK AI Prep API",
    description=(
        "AI-powered TOPIK II exam generation, writing auto-grading, and personalized "
        "study guides. AI explanations and feedback are delivered in Myanmar (မြန်မာဘာသာ)."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(InsufficientQuestionPoolError)
async def handle_insufficient_pool(request: Request, exc: InsufficientQuestionPoolError) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"error": {"code": "insufficient_question_pool", "message": str(exc)}},
    )


@app.exception_handler(LLMConfigurationError)
async def handle_llm_config_error(request: Request, exc: LLMConfigurationError) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"error": {"code": "llm_not_configured", "message": str(exc)}},
    )


@app.exception_handler(HTTPException)
async def handle_http_exception(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "http_error", "message": exc.detail}},
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "validation_error",
                "message": "Request validation failed.",
                "details": jsonable_encoder(exc.errors()),
            }
        },
    )


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error while processing %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal_error", "message": "An unexpected error occurred."}},
    )


app.include_router(exam.router)
app.include_router(user.router)
app.include_router(writing.router)

# Serves data/raw_exams/**/*.mp3 (referenced by FreshListeningSection.audio_path as a
# project-root-relative path) at GET /data/raw_exams/... so it's actually fetchable over HTTP.
_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
app.mount("/data", StaticFiles(directory=_DATA_DIR), name="data")


@app.get("/health", tags=["health"], summary="Health check")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
