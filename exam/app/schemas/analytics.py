"""Pydantic schemas for exam submission/scoring, weakness analysis, and study plans."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.exam import SkillAreaName
from app.schemas.writing import WritingQuestionNumber

# ---------------------------------------------------------------------------
# Exam submission & scoring
# ---------------------------------------------------------------------------


class AnsweredMCQuestion(BaseModel):
    """A student's answer to a Reading/Listening multiple-choice question."""

    question_id: str
    question_number: int
    selected_option: int = Field(..., ge=1, le=4)


class AnsweredWritingQuestion(BaseModel):
    """A student's answer to a Writing question (Q51-Q54)."""

    question_id: str
    question_number: WritingQuestionNumber
    user_answer: str


class ExamSubmissionRequest(BaseModel):
    exam_id: str
    user_id: int
    reading_answers: list[AnsweredMCQuestion] = Field(default_factory=list)
    reading_unanswered_ids: list[str] = Field(
        default_factory=list, description="question_ids the student left blank, so they can still be logged/explained."
    )
    listening_answers: list[AnsweredMCQuestion] = Field(default_factory=list)
    listening_unanswered_ids: list[str] = Field(
        default_factory=list, description="question_ids the student left blank, so they can still be logged/explained."
    )
    writing_answers: list[AnsweredWritingQuestion] = Field(default_factory=list)


class QuestionExplanationMyanmar(BaseModel):
    """AI-generated, Myanmar-language explanation for one wrong/unanswered MC question."""

    correct_answer_explanation: str = Field(
        ..., description="Myanmar explanation of the correct answer and why it's correct."
    )
    wrong_answer_explanation: str = Field(
        ..., description="Myanmar explanation of why the student's selected option (or lack of one) was wrong."
    )
    grammar_vocab_focus: str = Field(
        ..., description="Myanmar explanation of the key grammar/vocabulary point this question tests."
    )


class QuestionReview(BaseModel):
    """Per-question detail for a graded Reading/Listening section, for the results review screen."""

    question_id: str
    question_number: int
    is_correct: bool
    user_answer: str | None = Field(None, description="The option the student picked; null if left unanswered.")
    correct_answer: str
    explanation: QuestionExplanationMyanmar | None = Field(
        None, description="Present only for incorrect/unanswered questions, when generation succeeded."
    )


class SectionResult(BaseModel):
    section: SkillAreaName
    total_score: float
    max_score: float
    correct_count: int
    total_questions: int
    question_reviews: list[QuestionReview] = Field(default_factory=list)


class ExamSubmissionResult(BaseModel):
    exam_id: str
    user_id: int
    graded_at: datetime
    sections: list[SectionResult]
    total_score: float
    max_score: float
    warnings: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Weakness analysis
# ---------------------------------------------------------------------------


class WeaknessPattern(BaseModel):
    skill_area: SkillAreaName
    question_type: str
    label: str = Field(..., description="Human-readable pattern label, e.g. 'Q31-Q34 Main Idea'.")
    attempts: int
    correct_count: int
    accuracy: float


class WeaknessReport(BaseModel):
    user_id: int
    generated_at: datetime
    total_attempts: int
    overall_accuracy: float
    weakest_patterns: list[WeaknessPattern]
    all_patterns: list[WeaknessPattern]


# ---------------------------------------------------------------------------
# 1-Week study plan
# ---------------------------------------------------------------------------

TopikLevel = Literal[3, 4, 5, 6]


class DailyFocus(BaseModel):
    day: int = Field(..., ge=1, le=7)
    focus_topic: str = Field(..., description="Myanmar-language focus topic for the day.")
    grammar_points: list[str] = Field(..., min_length=1, description="Grammar points to study, in Myanmar.")
    vocabulary_focus: str = Field(..., description="Vocabulary theme for the day, in Myanmar.")
    practice_task: str = Field(..., description="Concrete practice task for the day, in Myanmar.")


class StudyPlanLLMOutput(BaseModel):
    """What the LLM is responsible for generating; numeric level is computed deterministically."""

    level_strategy: str = Field(..., description="Myanmar-language strategy note for the target level.")
    weekly_plan: list[DailyFocus] = Field(..., min_length=7, max_length=7)
    summary_myanmar: str = Field(..., description="Myanmar-language encouraging summary of the plan.")


class StudyPlanResponse(BaseModel):
    user_id: int
    generated_at: datetime
    recommended_topik_level: TopikLevel
    top_weaknesses: list[WeaknessPattern]
    level_strategy: str
    weekly_plan: list[DailyFocus]
    summary_myanmar: str
