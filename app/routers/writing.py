"""Writing auto-grading endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from app.schemas.common import ErrorResponse
from app.schemas.writing import WritingEvaluationResult, WritingGradeRequest
from app.services.writing_grader import grade_writing

router = APIRouter(prefix="/api/writing", tags=["writing"])


@router.post(
    "/grade-single",
    response_model=WritingEvaluationResult,
    summary="Grade a single TOPIK writing essay (Q51-Q54)",
    description="Test/debug endpoint: grades one writing answer against the official rubric without requiring a full exam session.",
    responses={503: {"model": ErrorResponse}},
)
def grade_single_endpoint(request: WritingGradeRequest) -> WritingEvaluationResult:
    return grade_writing(request)
