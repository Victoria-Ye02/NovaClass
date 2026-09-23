"""Pydantic schemas for TOPIK II exam generation."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

SkillAreaName = Literal["reading", "listening", "writing"]
DifficultyName = Literal["beginner", "intermediate", "advanced"]


class ExamRequest(BaseModel):
    user_id: int
    sections: list[SkillAreaName] = Field(
        default_factory=lambda: ["reading", "listening", "writing"],
        description="Which exam sections to generate.",
    )
    difficulty: DifficultyName | None = Field(
        default=None, description="Restrict all sections to a single difficulty tier."
    )
    avoid_repeat_questions: bool = Field(
        default=True,
        description="Exclude questions the user has already been served in prior sessions, when possible.",
    )


class AudioMeta(BaseModel):
    url: str
    duration_seconds: float | None = None


class ExamQuestion(BaseModel):
    """A single exam question with the correct answer and explanation masked out."""

    id: str
    question_number: int
    section: SkillAreaName
    question_type: str
    difficulty: str
    points: float
    prompt: str
    options: list[str] | None = None
    audio: AudioMeta | None = None


class ExamSection(BaseModel):
    name: SkillAreaName
    total_points: float
    question_count: int
    questions: list[ExamQuestion]


class ExamPaperResponse(BaseModel):
    exam_id: str
    user_id: int
    generated_at: datetime
    blueprint_version: str = "topik_ii_v1"
    sections: list[ExamSection]
    total_points: float
    total_questions: int
    warnings: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Fresh full-exam generator (stateless, no user/session — see
# app/services/exam_generator.py::generate_full_topik_exam). Answers/sample
# answers are intentionally omitted from these models so they never leak to
# the client that renders the exam.
# ---------------------------------------------------------------------------


class FreshExamQuestion(BaseModel):
    """A single Reading/Writing question in a freshly generated exam paper."""

    id: str
    question_number: int
    exam_round: str
    question_type: str
    points: float
    prompt: str
    # Project-root-relative path (same convention as FreshListeningSection.audio_path)
    # to a cropped image of the question's own graphic (ad/signboard/chart/photo),
    # only present for reading questions where one was captured at ingestion time.
    image_url: str | None = None


class FreshListeningQuestion(BaseModel):
    """A single Listening question, presented in its original sequential order."""

    id: str
    question_number: int
    question_type: str
    points: float
    prompt: str


class FreshReadingSection(BaseModel):
    name: Literal["reading"] = "reading"
    exam_rounds_used: list[str]
    total_points: float
    question_count: int
    questions: list[FreshExamQuestion]


class FreshWritingSection(BaseModel):
    name: Literal["writing"] = "writing"
    exam_rounds_used: list[str]
    total_points: float
    question_count: int
    questions: list[FreshExamQuestion]


class FreshListeningSection(BaseModel):
    name: Literal["listening"] = "listening"
    exam_round: str
    audio_path: str | None
    total_points: float
    question_count: int
    questions: list[FreshListeningQuestion]


class FreshTopikExamResponse(BaseModel):
    exam_id: str
    generated_at: datetime
    blueprint_version: str = "topik_ii_v1"
    reading: FreshReadingSection
    writing: FreshWritingSection
    listening: FreshListeningSection
    total_points: float
    total_questions: int
    warnings: list[str] = Field(default_factory=list)
