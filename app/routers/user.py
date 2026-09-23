"""User analytics endpoints."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.models import User, get_db
from app.routers.deps import get_user_or_404
from app.schemas.analytics import StudyPlanResponse, WeaknessReport
from app.schemas.common import ErrorResponse
from app.services.analytics import analyze_weaknesses, generate_study_plan

router = APIRouter(prefix="/api/user", tags=["user"])


class UserAnalyticsResponse(BaseModel):
    weakness_report: WeaknessReport
    study_plan: StudyPlanResponse


class EnsureUserRequest(BaseModel):
    email: str
    display_name: str
    target_level: int = 3


class UserOut(BaseModel):
    id: int
    email: str
    display_name: str
    target_level: int
    created_at: datetime

    class Config:
        from_attributes = True


@router.post(
    "/ensure",
    response_model=UserOut,
    summary="Get or create a user by email",
    description=(
        "Looks up a user by email and returns it; creates one if it doesn't exist yet. "
        "Intended for external systems (e.g. a separate app's own auth/user store) that need a "
        "stable numeric user_id in this service without duplicating their own registration flow."
    ),
)
def ensure_user(request: EnsureUserRequest, db: Session = Depends(get_db)) -> User:
    user = db.query(User).filter(User.email == request.email).first()
    if user is None:
        user = User(
            email=request.email,
            display_name=request.display_name,
            target_level=request.target_level,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@router.get(
    "/{user_id}/analytics",
    response_model=UserAnalyticsResponse,
    summary="Get a user's weakness report and AI-generated study guide",
    description=(
        "Analyzes the user's exam history to detect weak question patterns, then uses "
        "an LLM to generate a personalized 1-week action plan in Myanmar."
    ),
    responses={404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def get_user_analytics(
    user: User = Depends(get_user_or_404),
    db: Session = Depends(get_db),
) -> UserAnalyticsResponse:
    weakness_report = analyze_weaknesses(db, user.id)
    study_plan = generate_study_plan(db, user.id, report=weakness_report)
    return UserAnalyticsResponse(weakness_report=weakness_report, study_plan=study_plan)
