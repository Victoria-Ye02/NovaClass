"""Exam submission scoring, weakness pattern analysis, and AI study-plan generation.

Uses LangChain's ChatOpenAI pointed at OpenRouter (per CLAUDE.md and the same
convention established in writing_grader.py), not a direct Anthropic client.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import LLMConfigurationError, OPENROUTER_BASE_URL, get_gemini_api_key, get_openrouter_api_key
from app.database.models import ExamSession, QuestionLog, WeaknessProfile
from app.database.models import SkillArea as SkillAreaEnum
from app.database.vector_db import SkillArea, get_questions_by_ids
from app.prompts.mc_explanation import ExplanationItem
from app.prompts.mc_explanation import build_human_prompt as build_explanation_human_prompt
from app.prompts.mc_explanation import build_system_prompt as build_explanation_system_prompt
from app.prompts.study_plan import build_human_prompt as build_study_plan_human_prompt
from app.prompts.study_plan import build_system_prompt as build_study_plan_system_prompt
from app.schemas.analytics import (
    AnsweredMCQuestion,
    AnsweredWritingQuestion,
    ExamSubmissionRequest,
    ExamSubmissionResult,
    QuestionExplanationMyanmar,
    QuestionReview,
    SectionResult,
    StudyPlanLLMOutput,
    StudyPlanResponse,
    WeaknessPattern,
    WeaknessReport,
)
from app.schemas.writing import WritingGradeRequest
from app.services.exam_generator import BLUEPRINTS
from app.services.writing_grader import grade_writing

WRITING_PASS_THRESHOLD = 0.6  # >=60% of a writing question's points counts as "correct" for weakness tracking

QUESTION_TYPE_LABELS: dict[str, str] = {
    "grammar": "Grammar (문법)",
    "main_idea": "Main Idea (중심 내용)",
    "graph": "Graph/Chart (도표)",
    "details": "Details (세부 내용)",
    "dialogue": "Dialogue (대화)",
    "continuation": "Continuation (이어질 내용)",
    "place": "Place/Situation (장소·상황)",
    "purpose": "Purpose (목적)",
    "fill_in_blank": "Fill-in-the-Blank (빈칸 채우기)",
    "short_essay": "Chart Writing (도표 작문)",
    "long_essay": "Essay Writing (논술)",
}

STUDY_PLAN_MODEL = "anthropic/claude-sonnet-5"
EXPLANATION_MODEL = "gemini-3.6-flash"
# Sized against a live measurement: a 24-item Gemini batch took ~84s (~3.5s/item),
# vs. the previous Claude/OpenRouter explanation model where a 5-question batch took
# ~70s and a 20-item batch ran past 7 minutes without completing. 15 items keeps one
# section's worst case (~55s) comfortably under EXPLANATION_TIMEOUT_SECONDS below and
# the NovaClass proxy's submit timeout (see exam.controller.js).
MAX_EXPLANATIONS_PER_SECTION = 15
EXPLANATION_TIMEOUT_SECONDS = 90

_study_plan_llm = None
_explanation_llm = None


class _MCExplanationItem(BaseModel):
    """LLM-facing structured-output shape.

    Field names end in `_myanmar` (matching `feedback_myanmar`/`summary_myanmar`
    elsewhere in this file) deliberately, not just for documentation: the model sees
    these names via the function-calling tool schema, and in practice that's what
    reliably keeps a Korean-question-heavy prompt from answering in Korean -- without
    it, the model would default to Korean despite the system prompt instructing
    Myanmar (confirmed with a live OpenRouter call). Kept internal; the public
    QuestionExplanationMyanmar schema (app/schemas/analytics.py) uses clean names.
    """

    question_id: str
    correct_answer_explanation_myanmar: str
    wrong_answer_explanation_myanmar: str
    grammar_vocab_focus_myanmar: str


class _MCExplanationBatch(BaseModel):
    explanations: list[_MCExplanationItem]


# ---------------------------------------------------------------------------
# 1. Exam submission scoring
# ---------------------------------------------------------------------------


def submit_exam(request: ExamSubmissionRequest, db: Session) -> ExamSubmissionResult:
    """Score a submitted exam (any subset of Reading/Listening/Writing) and log every answer."""
    warnings: list[str] = []
    sections: list[SectionResult] = []

    if request.reading_answers or request.reading_unanswered_ids:
        sections.append(
            _submit_mc_section(db, request, "reading", request.reading_answers, request.reading_unanswered_ids, warnings)
        )
    if request.listening_answers or request.listening_unanswered_ids:
        sections.append(
            _submit_mc_section(
                db, request, "listening", request.listening_answers, request.listening_unanswered_ids, warnings
            )
        )
    if request.writing_answers:
        sections.append(_submit_writing_section(db, request, request.writing_answers, warnings))

    db.commit()

    return ExamSubmissionResult(
        exam_id=request.exam_id,
        user_id=request.user_id,
        graded_at=datetime.utcnow(),
        sections=sections,
        total_score=sum(s.total_score for s in sections),
        max_score=sum(s.max_score for s in sections),
        warnings=warnings,
    )


def _submit_mc_section(
    db: Session,
    request: ExamSubmissionRequest,
    domain: SkillArea,
    answers: list[AnsweredMCQuestion],
    unanswered_ids: list[str],
    warnings: list[str],
) -> SectionResult:
    all_ids = [a.question_id for a in answers] + list(unanswered_ids)
    pool = get_questions_by_ids(domain, all_ids)
    meta_by_id = dict(zip(pool["ids"], pool["metadatas"]))
    doc_by_id = dict(zip(pool["ids"], pool["documents"]))

    session = ExamSession(
        user_id=request.user_id,
        exam_paper_id=request.exam_id,
        skill_area=SkillAreaEnum(domain),
        total_questions=len(answers) + len(unanswered_ids),
    )
    db.add(session)
    db.flush()

    correct_count = 0
    total_score = 0.0
    max_score = 0.0
    logs: list[QuestionLog] = []
    reviews: list[QuestionReview] = []
    wrong_for_explanation: list[tuple[QuestionLog, QuestionReview, ExplanationItem]] = []

    def _record(question_id: str, selected_option: int | None) -> None:
        nonlocal correct_count, total_score, max_score
        metadata = meta_by_id.get(question_id)
        if metadata is None:
            warnings.append(f"{domain}: question_id '{question_id}' not found, skipped.")
            return

        # Real ingested exam-round questions (app/database/ingest_reading.py /
        # ingest_listening_sets.py) store the key under "correct_answer"; the
        # original dev/seed fixtures (app/database/seed_data.py) use "correct_option".
        # Support both so grading works against either source.
        correct_option = metadata.get("correct_answer", metadata.get("correct_option"))
        points_possible = float(metadata.get("points", 2))
        is_correct = selected_option is not None and selected_option == correct_option
        points_earned = points_possible if is_correct else 0.0

        log = QuestionLog(
            session_id=session.id,
            question_id=question_id,
            question_type=metadata.get("question_type", "unknown"),
            difficulty=metadata.get("difficulty", "intermediate"),
            user_answer=str(selected_option) if selected_option is not None else None,
            correct_answer=str(correct_option),
            is_correct=is_correct,
            points_earned=points_earned,
            points_possible=points_possible,
        )
        db.add(log)
        logs.append(log)

        review = QuestionReview(
            question_id=question_id,
            question_number=int(metadata.get("question_number", 0)),
            is_correct=is_correct,
            user_answer=str(selected_option) if selected_option is not None else None,
            correct_answer=str(correct_option),
        )
        reviews.append(review)

        if not is_correct:
            prompt_text = doc_by_id.get(question_id, "")
            wrong_for_explanation.append(
                (log, review, ExplanationItem(question_id, prompt_text, selected_option, int(correct_option)))
            )

        correct_count += int(is_correct)
        total_score += points_earned
        max_score += points_possible

    for answer in answers:
        _record(answer.question_id, answer.selected_option)
    for question_id in unanswered_ids:
        _record(question_id, None)

    if wrong_for_explanation:
        # A partial-completion submission (including the exam UI's own auto-submit when
        # the timer runs out) can easily leave 40+ questions wrong/unanswered in one
        # section. One LLM call covering all of them doesn't scale -- it can run well
        # past a minute and blow through the NovaClass proxy's request timeout. Bound
        # it: explain the earliest questions first (most useful to review), and leave
        # the rest unexplained with a warning rather than stalling the whole submission.
        to_explain = sorted(wrong_for_explanation, key=lambda t: t[1].question_number)
        if len(to_explain) > MAX_EXPLANATIONS_PER_SECTION:
            warnings.append(
                f"{domain}: {len(to_explain)} wrong/unanswered questions -- explanations were generated "
                f"for the first {MAX_EXPLANATIONS_PER_SECTION} (by question number) only, to keep grading fast."
            )
            to_explain = to_explain[:MAX_EXPLANATIONS_PER_SECTION]
        explanations = _generate_mc_explanations([item for _, _, item in to_explain], warnings)
        for log, review, item in to_explain:
            explanation = explanations.get(item.question_id)
            if explanation is None:
                continue
            log.explanation_correct = explanation.correct_answer_explanation
            log.explanation_wrong = explanation.wrong_answer_explanation
            log.explanation_grammar = explanation.grammar_vocab_focus
            review.explanation = explanation

    session.correct_count = correct_count
    session.total_score = total_score
    session.max_score = max_score
    session.completed_at = datetime.utcnow()

    return SectionResult(
        section=domain,
        total_score=total_score,
        max_score=max_score,
        correct_count=correct_count,
        total_questions=len(answers) + len(unanswered_ids),
        question_reviews=reviews,
    )


def _get_explanation_llm():
    global _explanation_llm
    if _explanation_llm is None:
        from langchain_google_genai import ChatGoogleGenerativeAI

        # Gemini directly (not routed through OpenRouter, unlike the rest of this
        # project) -- picked specifically for this call because it's fast/cheap,
        # which matters here: a batched explanation call has no client-side bound by
        # default and can hang well past any reasonable request timeout (observed:
        # still running after 7+ minutes for a 20-question batch via Claude/OpenRouter).
        # timeout+max_retries=1 caps a stalled call so it fails into the try/except in
        # _generate_mc_explanations (-> a warning, not a stuck request) instead of
        # hanging indefinitely.
        llm = ChatGoogleGenerativeAI(
            model=EXPLANATION_MODEL,
            google_api_key=get_gemini_api_key(),
            temperature=0,
            timeout=EXPLANATION_TIMEOUT_SECONDS,
            max_retries=1,
        )
        _explanation_llm = llm.with_structured_output(_MCExplanationBatch, method="function_calling")
    return _explanation_llm


# Scripts a clean explanation should ever contain: Korean (the question content being
# quoted/discussed), Myanmar (the explanation itself), and common Latin/punctuation/symbol
# ranges (incl. ①②③④ and ㉠㉡㉢㉣, which show up when explanations quote question text).
# Gemini has been observed to occasionally substitute a stray character from an unrelated
# script into an otherwise-correct Korean word (e.g. "모래" -> "મોરે", Gujarati) -- a
# whole-word substitution, not just noise, so it can't be cleaned by stripping the bad
# character; the only safe move is to drop that explanation rather than show corrupted text.
_ALLOWED_EXPLANATION_UNICODE_RANGES = [
    (0x0000, 0x007F),  # Basic Latin (ASCII letters/digits/punctuation/whitespace)
    (0x1000, 0x109F),  # Myanmar
    (0x1100, 0x11FF),  # Hangul Jamo
    (0x2000, 0x206F),  # General Punctuation (em dash, curly quotes, ellipsis, ...)
    (0x2460, 0x24FF),  # Enclosed Alphanumerics (①②③④ ...)
    (0x3000, 0x303F),  # CJK Symbols and Punctuation
    (0x3130, 0x318F),  # Hangul Compatibility Jamo
    (0x3200, 0x32FF),  # Enclosed CJK Letters and Months (㉠㉡㉢㉣ ...)
    (0xAC00, 0xD7A3),  # Hangul Syllables
    (0xFF00, 0xFFEF),  # Halfwidth and Fullwidth Forms
]


def _has_stray_script_characters(text: str) -> bool:
    return any(
        not any(lo <= ord(ch) <= hi for lo, hi in _ALLOWED_EXPLANATION_UNICODE_RANGES) for ch in text
    )


def _generate_mc_explanations(
    items: list[ExplanationItem], warnings: list[str]
) -> dict[str, QuestionExplanationMyanmar]:
    """One batched LLM call covering every wrong/unanswered question in a section.

    Explanations are supplementary to scoring, so any failure here (missing API
    key, LLM/network error) is caught and recorded as a warning rather than
    failing the whole submission -- the exam still gets scored either way.
    """
    try:
        llm = _get_explanation_llm()
        system_prompt = build_explanation_system_prompt()
        human_prompt = build_explanation_human_prompt(items)
        result: _MCExplanationBatch = llm.invoke(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": human_prompt},
            ]
        )

        explanations: dict[str, QuestionExplanationMyanmar] = {}
        dropped = 0
        for e in result.explanations:
            fields = (e.correct_answer_explanation_myanmar, e.wrong_answer_explanation_myanmar, e.grammar_vocab_focus_myanmar)
            if any(_has_stray_script_characters(f) for f in fields):
                dropped += 1
                continue
            explanations[e.question_id] = QuestionExplanationMyanmar(
                correct_answer_explanation=fields[0],
                wrong_answer_explanation=fields[1],
                grammar_vocab_focus=fields[2],
            )
        if dropped:
            warnings.append(
                f"{dropped} explanation(s) contained unexpected characters and were dropped rather than shown."
            )
        return explanations
    except LLMConfigurationError as exc:
        warnings.append(f"Question explanations unavailable: {exc}")
        return {}
    except Exception as exc:  # noqa: BLE001 -- explanation generation must never break scoring
        warnings.append(f"Question explanation generation failed: {exc}")
        return {}


def _submit_writing_section(
    db: Session,
    request: ExamSubmissionRequest,
    answers: list[AnsweredWritingQuestion],
    warnings: list[str],
) -> SectionResult:
    pool = get_questions_by_ids("writing", [a.question_id for a in answers])
    doc_by_id = dict(zip(pool["ids"], pool["documents"]))
    meta_by_id = dict(zip(pool["ids"], pool["metadatas"]))

    session = ExamSession(
        user_id=request.user_id,
        exam_paper_id=request.exam_id,
        skill_area=SkillAreaEnum.WRITING,
        total_questions=len(answers),
    )
    db.add(session)
    db.flush()

    correct_count = 0
    total_score = 0.0
    max_score = 0.0

    for answer in answers:
        prompt_text = doc_by_id.get(answer.question_id)
        metadata = meta_by_id.get(answer.question_id)
        if prompt_text is None or metadata is None:
            warnings.append(f"writing: question_id '{answer.question_id}' not found, skipped.")
            continue

        result = grade_writing(
            WritingGradeRequest(
                question_number=answer.question_number,
                question_prompt=prompt_text,
                user_answer=answer.user_answer,
            )
        )
        is_correct = result.total_score >= result.max_score * WRITING_PASS_THRESHOLD

        db.add(
            QuestionLog(
                session_id=session.id,
                question_id=answer.question_id,
                question_type=metadata.get("question_type", "writing"),
                difficulty=metadata.get("difficulty", "advanced"),
                user_answer=answer.user_answer,
                # Real ingested exam-round questions (app/database/ingest_writing.py) store
                # the official model answer under "sample_answer"; the original dev/seed
                # fixtures (app/database/seed_data.py) use "answer". Support both.
                correct_answer=str(metadata.get("sample_answer", metadata.get("answer", ""))),
                is_correct=is_correct,
                points_earned=result.total_score,
                points_possible=result.max_score,
                ai_feedback=result.feedback_myanmar,
            )
        )

        correct_count += int(is_correct)
        total_score += result.total_score
        max_score += result.max_score

    session.correct_count = correct_count
    session.total_score = total_score
    session.max_score = max_score
    session.completed_at = datetime.utcnow()

    return SectionResult(
        section="writing",
        total_score=total_score,
        max_score=max_score,
        correct_count=correct_count,
        total_questions=len(answers),
    )


# ---------------------------------------------------------------------------
# 2. Weakness pattern analysis
# ---------------------------------------------------------------------------


def analyze_weaknesses(db: Session, user_id: int, top_n: int = 3, min_attempts: int = 2) -> WeaknessReport:
    """Aggregate a user's QuestionLog history into weakness patterns and refresh WeaknessProfile."""
    profiles = _recompute_weakness_profiles(db, user_id)
    db.commit()

    all_patterns = sorted(
        (_to_weakness_pattern(p) for p in profiles),
        key=lambda p: p.accuracy,
    )

    eligible = [p for p in all_patterns if p.attempts >= min_attempts]
    weakest = (eligible or all_patterns)[:top_n]

    total_attempts = sum(p.attempts for p in profiles)
    total_correct = sum(p.correct_count for p in profiles)
    overall_accuracy = total_correct / total_attempts if total_attempts else 0.0

    return WeaknessReport(
        user_id=user_id,
        generated_at=datetime.utcnow(),
        total_attempts=total_attempts,
        overall_accuracy=overall_accuracy,
        weakest_patterns=weakest,
        all_patterns=all_patterns,
    )


def _recompute_weakness_profiles(db: Session, user_id: int) -> list[WeaknessProfile]:
    stmt = select(QuestionLog, ExamSession.skill_area).join(
        ExamSession, QuestionLog.session_id == ExamSession.id
    ).where(ExamSession.user_id == user_id)

    aggregates: dict[tuple[SkillAreaEnum, str], list[int]] = {}
    for log, skill_area in db.execute(stmt).all():
        key = (skill_area, log.question_type)
        bucket = aggregates.setdefault(key, [0, 0])  # [attempts, correct]
        bucket[0] += 1
        bucket[1] += int(log.is_correct)

    profiles: list[WeaknessProfile] = []
    for (skill_area, question_type), (attempts, correct) in aggregates.items():
        profile = db.execute(
            select(WeaknessProfile).where(
                WeaknessProfile.user_id == user_id,
                WeaknessProfile.skill_area == skill_area,
                WeaknessProfile.question_type == question_type,
            )
        ).scalar_one_or_none()

        if profile is None:
            profile = WeaknessProfile(user_id=user_id, skill_area=skill_area, question_type=question_type)
            db.add(profile)

        profile.attempts = attempts
        profile.correct_count = correct
        profile.accuracy = correct / attempts if attempts else 0.0
        profile.last_updated = datetime.utcnow()
        profiles.append(profile)

    db.flush()
    return profiles


def _to_weakness_pattern(profile: WeaknessProfile) -> WeaknessPattern:
    skill_area = profile.skill_area.value
    return WeaknessPattern(
        skill_area=skill_area,
        question_type=profile.question_type,
        label=_pattern_label(skill_area, profile.question_type),
        attempts=profile.attempts,
        correct_count=profile.correct_count,
        accuracy=profile.accuracy,
    )


def _pattern_label(skill_area: str, question_type: str) -> str:
    slots = [s for s in BLUEPRINTS.get(skill_area, []) if s.question_type == question_type]
    if slots:
        ranges = [f"Q{s.start}" if s.start == s.end else f"Q{s.start}-Q{s.end}" for s in slots]
        range_label = ", ".join(ranges)
    else:
        range_label = ""

    display_name = QUESTION_TYPE_LABELS.get(question_type, question_type)
    return f"{range_label} {display_name}".strip()


# ---------------------------------------------------------------------------
# 3. AI-generated 1-week study plan
# ---------------------------------------------------------------------------


def _recommend_topik_level(overall_accuracy: float) -> int:
    if overall_accuracy >= 0.85:
        return 6
    if overall_accuracy >= 0.70:
        return 5
    if overall_accuracy >= 0.55:
        return 4
    return 3


def _get_study_plan_llm():
    global _study_plan_llm
    if _study_plan_llm is None:
        from langchain_openai import ChatOpenAI

        llm = ChatOpenAI(
            model=STUDY_PLAN_MODEL,
            base_url=OPENROUTER_BASE_URL,
            api_key=get_openrouter_api_key(),
            temperature=0.4,
        )
        _study_plan_llm = llm.with_structured_output(StudyPlanLLMOutput, method="function_calling")
    return _study_plan_llm


def generate_study_plan(db: Session, user_id: int, report: WeaknessReport | None = None) -> StudyPlanResponse:
    """Analyze a user's history and produce a personalized 1-week Myanmar-language study plan.

    Pass a pre-computed `report` (e.g. from a caller that already called
    analyze_weaknesses) to avoid recomputing the weakness aggregation twice.
    """
    if report is None:
        report = analyze_weaknesses(db, user_id)
    recommended_level = _recommend_topik_level(report.overall_accuracy)

    system_prompt = build_study_plan_system_prompt(recommended_level)
    human_prompt = build_study_plan_human_prompt(
        report.weakest_patterns, report.overall_accuracy, report.total_attempts
    )

    llm = _get_study_plan_llm()
    llm_output: StudyPlanLLMOutput = llm.invoke(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": human_prompt},
        ]
    )

    return StudyPlanResponse(
        user_id=user_id,
        generated_at=datetime.utcnow(),
        recommended_topik_level=recommended_level,
        top_weaknesses=report.weakest_patterns,
        level_strategy=llm_output.level_strategy,
        weekly_plan=llm_output.weekly_plan,
        summary_myanmar=llm_output.summary_myanmar,
    )
