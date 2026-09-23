"""Exam generation and submission endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.models import User, get_db
from app.schemas.analytics import ExamSubmissionRequest, ExamSubmissionResult
from app.schemas.common import ErrorResponse
from app.schemas.exam import ExamPaperResponse, ExamRequest, FreshTopikExamResponse
from app.services.analytics import submit_exam
from app.services.exam_generator import generate_exam, generate_full_topik_exam

router = APIRouter(prefix="/api/exam", tags=["exam"])


@router.post(
    "/generate",
    response_model=ExamPaperResponse,
    summary="Generate a new randomized TOPIK II exam paper",
    description=(
        "Assembles a full Reading/Listening/Writing exam paper following the TOPIK II "
        "blueprint, drawing questions randomly from the question bank without repeating "
        "questions the user has already seen where possible. Correct answers and "
        "explanations are masked from the response."
    ),
    responses={404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def generate_exam_endpoint(request: ExamRequest, db: Session = Depends(get_db)) -> ExamPaperResponse:
    if db.get(User, request.user_id) is None:
        raise HTTPException(status_code=404, detail=f"User {request.user_id} not found.")
    return generate_exam(request, db)


@router.get(
    "/fresh",
    response_model=FreshTopikExamResponse,
    summary="Generate a fresh, stateless full TOPIK II exam paper",
    description=(
        "Assembles a complete Reading (50q, blueprint-distributed) + Writing (Q51-Q54) + "
        "Listening (50q, sequential) exam from the real ingested exam-round question bank. "
        "Reading/Writing are drawn randomly across all available exam rounds; Listening "
        "returns one specific past round's questions in original order plus that round's "
        "audio file path, since it must line up with a single recording. Not tied to a "
        "user/session -- correct answers and sample answers are never included."
    ),
    responses={503: {"model": ErrorResponse}},
)
def generate_fresh_exam_endpoint(listening_round: str = "102nd") -> FreshTopikExamResponse:
    return generate_full_topik_exam(listening_round=listening_round)


@router.post(
    "/submit",
    response_model=ExamSubmissionResult,
    summary="Submit exam answers for grading",
    description=(
        "Grades submitted Reading/Listening answers against the question bank and runs "
        "the Writing Auto-Grader (LLM) for any submitted essay answers, logs every answer "
        "to the database, and returns the combined score."
    ),
    responses={404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def submit_exam_endpoint(request: ExamSubmissionRequest, db: Session = Depends(get_db)) -> ExamSubmissionResult:
    if db.get(User, request.user_id) is None:
        raise HTTPException(status_code=404, detail=f"User {request.user_id} not found.")
    return submit_exam(request, db)
