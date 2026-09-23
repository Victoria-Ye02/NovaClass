"""LLM-backed automatic grader for TOPIK Writing (Q51-Q54).

Uses LangChain's ChatOpenAI pointed at OpenRouter (per CLAUDE.md), not a
direct Anthropic client, so the model, base URL, and API key stay consistent
with the rest of the project.
"""

from __future__ import annotations

from langchain_openai import ChatOpenAI

from app.config import OPENROUTER_BASE_URL, get_openrouter_api_key
from app.prompts.writing_grading import build_human_prompt, build_system_prompt, get_max_score
from app.schemas.writing import WritingEvaluationResult, WritingGradeRequest

GRADER_MODEL = "anthropic/claude-sonnet-5"

_structured_llm = None


def _get_structured_llm():
    global _structured_llm
    if _structured_llm is None:
        llm = ChatOpenAI(
            model=GRADER_MODEL,
            base_url=OPENROUTER_BASE_URL,
            api_key=get_openrouter_api_key(),
            temperature=0,
        )
        _structured_llm = llm.with_structured_output(WritingEvaluationResult, method="function_calling")
    return _structured_llm


def grade_writing(request: WritingGradeRequest) -> WritingEvaluationResult:
    """Grade a single TOPIK writing answer (Q51-Q54) against the official rubric."""
    max_score = get_max_score(request.question_number)
    system_prompt = build_system_prompt(request.question_number)
    human_prompt = build_human_prompt(request.question_prompt, request.user_answer)

    llm = _get_structured_llm()
    result = llm.invoke(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": human_prompt},
        ]
    )

    # The rubric's max_score is authoritative, regardless of what the model returned.
    result.max_score = max_score
    if result.total_score > max_score:
        result.total_score = max_score
    if result.total_score < 0:
        result.total_score = 0

    return result
