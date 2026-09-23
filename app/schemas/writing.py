"""Pydantic schemas for TOPIK Writing (Q51-Q54) automated grading."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

WritingQuestionNumber = Literal[51, 52, 53, 54]


class WritingGradeRequest(BaseModel):
    question_number: WritingQuestionNumber
    question_prompt: str = Field(..., description="The original TOPIK question text shown to the student.")
    user_answer: str = Field(..., description="The student's submitted Korean answer.")


class WritingEvaluationResult(BaseModel):
    """Structured grading output produced by the LLM via with_structured_output."""

    total_score: int = Field(..., ge=0, description="Total score awarded for this answer.")
    max_score: int = Field(..., gt=0, description="Maximum possible score for this question (10, 10, 30, or 50).")
    grammar_vocab_score: int = Field(..., ge=0, description="Score for grammar and vocabulary accuracy.")
    structure_score: int = Field(
        ..., ge=0, description="Score for structure, organization, and register/ending appropriateness."
    )
    content_score: int = Field(..., ge=0, description="Score for content accuracy and task completion.")
    feedback_myanmar: str = Field(
        ..., min_length=1, description="Detailed feedback written in Myanmar (မြန်မာဘာသာ)."
    )
    improvement_tips: list[str] = Field(
        ..., min_length=1, description="Concrete improvement tips written in Myanmar."
    )

    @model_validator(mode="after")
    def _clamp_total_score(self) -> "WritingEvaluationResult":
        if self.total_score > self.max_score:
            self.total_score = self.max_score
        return self
