"""Generates full TOPIK II exam papers from the ChromaDB question bank.

Blueprint note: the question_type ranges below mirror the taxonomies actually
assigned at ingestion time -- app/database/ingest_reading.py::QUESTION_TYPE_RANGES,
app/database/ingest_listening_sets.py::QUESTION_TYPE_RANGES, and
app/database/ingest_writing.py::QUESTION_TYPES/POINTS -- so that
_fetch_pool()'s `question_type` filter actually matches real records in
ChromaDB. Reading's Q28-30 has no distinct type in the project's TOPIK
blueprint (CLAUDE.md) and is ingested as "uncategorized"; that's kept here too.
"""

from __future__ import annotations

import json
import random
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models import ExamSession, QuestionLog
from app.database.models import SkillArea as SkillAreaEnum
from app.database.vector_db import SkillArea, get_questions_by_filter
from app.schemas.exam import (
    AudioMeta,
    ExamPaperResponse,
    ExamQuestion,
    ExamRequest,
    ExamSection,
    FreshExamQuestion,
    FreshListeningQuestion,
    FreshListeningSection,
    FreshReadingSection,
    FreshTopikExamResponse,
    FreshWritingSection,
    SkillAreaName,
)

QuestionItem = tuple[str, str, dict]  # (id, document, metadata)


class InsufficientQuestionPoolError(RuntimeError):
    def __init__(self, domain: str, question_type: str, needed: int, available: int) -> None:
        self.domain = domain
        self.question_type = question_type
        self.needed = needed
        self.available = available
        super().__init__(
            f"Not enough '{question_type}' questions in '{domain}' collection: "
            f"need {needed}, have {available}."
        )


@dataclass(frozen=True)
class BlueprintSlot:
    question_type: str
    start: int
    end: int
    points: float

    @property
    def count(self) -> int:
        return self.end - self.start + 1

    def question_numbers(self) -> range:
        return range(self.start, self.end + 1)


READING_BLUEPRINT: list[BlueprintSlot] = [
    BlueprintSlot(question_type="grammar_fill_in", start=1, end=4, points=2),
    BlueprintSlot(question_type="signboard_context", start=5, end=8, points=2),
    BlueprintSlot(question_type="graph_details", start=9, end=12, points=2),
    BlueprintSlot(question_type="sentence_order", start=13, end=15, points=2),
    BlueprintSlot(question_type="short_article_fill_in", start=16, end=24, points=2),
    BlueprintSlot(question_type="news_headline", start=25, end=27, points=2),
    BlueprintSlot(question_type="uncategorized", start=28, end=30, points=2),
    BlueprintSlot(question_type="main_idea", start=31, end=34, points=2),
    BlueprintSlot(question_type="long_article_comprehension", start=35, end=50, points=2),
]

LISTENING_BLUEPRINT: list[BlueprintSlot] = [
    BlueprintSlot(question_type="dialogue_response", start=1, end=4, points=2),
    BlueprintSlot(question_type="continuation", start=5, end=6, points=2),
    BlueprintSlot(question_type="place", start=7, end=10, points=2),
    BlueprintSlot(question_type="topic", start=11, end=14, points=2),
    BlueprintSlot(question_type="situation_picture", start=15, end=16, points=2),
    BlueprintSlot(question_type="main_idea", start=17, end=20, points=2),
    BlueprintSlot(question_type="core_thought", start=21, end=22, points=2),
    BlueprintSlot(question_type="action", start=23, end=24, points=2),
    BlueprintSlot(question_type="interview", start=25, end=30, points=2),
    BlueprintSlot(question_type="discourse_lecture", start=31, end=40, points=2),
    BlueprintSlot(question_type="lecture_detail", start=41, end=50, points=2),
]

WRITING_BLUEPRINT: list[BlueprintSlot] = [
    BlueprintSlot(question_type="short_completion", start=51, end=51, points=10),
    BlueprintSlot(question_type="short_completion", start=52, end=52, points=10),
    BlueprintSlot(question_type="chart_essay", start=53, end=53, points=30),
    BlueprintSlot(question_type="opinion_essay", start=54, end=54, points=50),
]

BLUEPRINTS: dict[SkillArea, list[BlueprintSlot]] = {
    "reading": READING_BLUEPRINT,
    "listening": LISTENING_BLUEPRINT,
    "writing": WRITING_BLUEPRINT,
}


def generate_exam(request: ExamRequest, db: Session) -> ExamPaperResponse:
    """Assemble a full exam paper for a user, following the TOPIK II blueprint."""
    warnings: list[str] = []
    sections: list[ExamSection] = []

    for section_name in request.sections:
        exclude_ids = (
            _previously_seen_ids(db, request.user_id, section_name)
            if request.avoid_repeat_questions
            else set()
        )
        used_ids: set[str] = set()
        questions: list[ExamQuestion] = []

        for slot in BLUEPRINTS[section_name]:
            picked = _pick_questions_for_slot(
                section_name, slot, request.difficulty, exclude_ids, used_ids, warnings
            )
            for question_number, item in zip(slot.question_numbers(), picked):
                questions.append(_to_exam_question(section_name, question_number, slot.points, item))

        sections.append(
            ExamSection(
                name=section_name,
                total_points=sum(q.points for q in questions),
                question_count=len(questions),
                questions=questions,
            )
        )

    return ExamPaperResponse(
        exam_id=str(uuid.uuid4()),
        user_id=request.user_id,
        generated_at=datetime.utcnow(),
        sections=sections,
        total_points=sum(s.total_points for s in sections),
        total_questions=sum(s.question_count for s in sections),
        warnings=warnings,
    )


def _previously_seen_ids(db: Session, user_id: int, skill_area: SkillArea) -> set[str]:
    stmt = (
        select(QuestionLog.question_id)
        .join(ExamSession, QuestionLog.session_id == ExamSession.id)
        .where(
            ExamSession.user_id == user_id,
            ExamSession.skill_area == SkillAreaEnum(skill_area),
        )
    )
    return set(db.execute(stmt).scalars().all())


def _fetch_pool(domain: SkillArea, question_type: str, difficulty: str | None) -> list[QuestionItem]:
    result = get_questions_by_filter(domain, question_type=question_type, difficulty=difficulty, limit=1000)
    ids = result.get("ids") or []
    documents = result.get("documents") or []
    metadatas = result.get("metadatas") or []
    return list(zip(ids, documents, metadatas))


def _pick_questions_for_slot(
    domain: SkillArea,
    slot: BlueprintSlot,
    difficulty: str | None,
    exclude_ids: set[str],
    used_ids: set[str],
    warnings: list[str],
) -> list[QuestionItem]:
    pool = _fetch_pool(domain, slot.question_type, difficulty)
    unseen = [item for item in pool if item[0] not in exclude_ids and item[0] not in used_ids]

    if len(unseen) >= slot.count:
        chosen = random.sample(unseen, slot.count)
    else:
        any_available = [item for item in pool if item[0] not in used_ids]
        if len(any_available) < slot.count:
            raise InsufficientQuestionPoolError(domain, slot.question_type, slot.count, len(any_available))
        chosen = random.sample(any_available, slot.count)
        if exclude_ids:
            warnings.append(
                f"{domain}/{slot.question_type}: only {len(unseen)} unseen question(s) available "
                f"for {slot.count} needed — reused previously seen questions to fill the slot."
            )

    used_ids.update(item[0] for item in chosen)
    return chosen


def _to_exam_question(
    section: SkillAreaName,
    question_number: int,
    slot_points: float,
    item: QuestionItem,
) -> ExamQuestion:
    question_id, document, metadata = item

    options_json = metadata.get("options")
    options = json.loads(options_json) if options_json else None

    audio = None
    if section == "listening":
        audio = AudioMeta(
            url=metadata.get("audio_url", f"/static/audio/listening/{question_id}.mp3"),
            duration_seconds=metadata.get("audio_duration_sec"),
        )

    return ExamQuestion(
        id=question_id,
        question_number=question_number,
        section=section,
        question_type=metadata.get("question_type", ""),
        difficulty=metadata.get("difficulty", "intermediate"),
        points=metadata.get("points", slot_points),
        prompt=document,
        options=options,
        audio=audio,
    )


# ---------------------------------------------------------------------------
# Fresh full-exam generator (stateless, no user/session).
#
# Reading/Writing draw randomly from the real ingested exam rounds (currently
# 102nd/96nd/91st, tagged via `exam_round` metadata by app/database/ingest_*.py)
# following the same TOPIK II Reading blueprint used at ingestion time
# (app/database/ingest_reading.py::QUESTION_TYPE_RANGES). Listening instead
# returns one specific past exam round's 50 questions in original sequence,
# plus that round's audio file path, since a shuffled-across-rounds listening
# paper wouldn't line up with any single audio recording.
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parents[2]
EXAM_AUDIO_ROOT = PROJECT_ROOT / "data" / "raw_exams"


@dataclass(frozen=True)
class FreshBlueprintSlot:
    question_type: str
    count: int


# Mirrors app/database/ingest_reading.py::QUESTION_TYPE_RANGES, with an
# explicit slot for Q28-30 (left as "uncategorized" there since the project's
# TOPIK Reading blueprint in CLAUDE.md doesn't assign them a type).
FRESH_READING_BLUEPRINT: list[FreshBlueprintSlot] = [
    FreshBlueprintSlot("grammar_fill_in", 4),
    FreshBlueprintSlot("signboard_context", 4),
    FreshBlueprintSlot("graph_details", 4),
    FreshBlueprintSlot("sentence_order", 3),
    FreshBlueprintSlot("short_article_fill_in", 9),
    FreshBlueprintSlot("news_headline", 3),
    FreshBlueprintSlot("uncategorized", 3),
    FreshBlueprintSlot("main_idea", 4),
    FreshBlueprintSlot("long_article_comprehension", 16),
]
assert sum(slot.count for slot in FRESH_READING_BLUEPRINT) == 50

WRITING_QUESTION_NUMBERS = (51, 52, 53, 54)


def _fetch_real_exam_pool(domain: SkillArea) -> list[QuestionItem]:
    """All records in a collection that came from real PDF ingestion (i.e. carry
    `exam_round` metadata) -- excludes the original dev/seed fixture questions."""
    result = get_questions_by_filter(domain, limit=1000)
    ids = result.get("ids") or []
    documents = result.get("documents") or []
    metadatas = result.get("metadatas") or []
    return [item for item in zip(ids, documents, metadatas) if "exam_round" in item[2]]


def _find_listening_audio_path(exam_round: str) -> str | None:
    folder = EXAM_AUDIO_ROOT / exam_round
    if not folder.is_dir():
        return None
    for path in sorted(folder.glob("*.mp3")):
        if "listening" in path.name.lower():
            return str(path.relative_to(PROJECT_ROOT))
    return None


def _to_fresh_question(question_number: int, item: QuestionItem) -> FreshExamQuestion:
    question_id, document, metadata = item
    return FreshExamQuestion(
        id=question_id,
        question_number=question_number,
        exam_round=metadata["exam_round"],
        question_type=metadata["question_type"],
        points=metadata["points"],
        prompt=document,
        image_url=metadata.get("image_path"),
    )


def _generate_reading_section() -> FreshReadingSection:
    # Pooled by the *printed* question_number (not question_type): a question's
    # stored text carries whatever "※ [n~m] ..." instruction-range header was
    # printed on its source page, verbatim. Every real TOPIK II round uses the
    # same fixed numbering for each instruction block (e.g. Q1-2 vs Q3-4 both
    # fall under "grammar_fill_in" but carry different headers), so a question
    # can only be dropped into a fresh exam at the *same* question_number it was
    # printed at, or its embedded header would no longer match its new position.
    pool_by_number: dict[int, list[QuestionItem]] = {}
    for item in _fetch_real_exam_pool("reading"):
        pool_by_number.setdefault(item[2]["question_number"], []).append(item)

    questions: list[FreshExamQuestion] = []
    rounds_used: set[str] = set()
    q_num = 1
    for slot in FRESH_READING_BLUEPRINT:
        for _ in range(slot.count):
            candidates = pool_by_number.get(q_num, [])
            if not candidates:
                raise InsufficientQuestionPoolError("reading", slot.question_type, 1, 0)
            item = random.choice(candidates)
            questions.append(_to_fresh_question(q_num, item))
            rounds_used.add(item[2]["exam_round"])
            q_num += 1

    return FreshReadingSection(
        exam_rounds_used=sorted(rounds_used),
        total_points=sum(q.points for q in questions),
        question_count=len(questions),
        questions=questions,
    )


def _generate_writing_section() -> FreshWritingSection:
    pool_by_number: dict[int, list[QuestionItem]] = {}
    for item in _fetch_real_exam_pool("writing"):
        pool_by_number.setdefault(item[2]["question_number"], []).append(item)

    questions: list[FreshExamQuestion] = []
    rounds_used: set[str] = set()
    for q_num in WRITING_QUESTION_NUMBERS:
        candidates = pool_by_number.get(q_num, [])
        if not candidates:
            raise InsufficientQuestionPoolError("writing", f"q{q_num}", 1, 0)
        chosen = random.choice(candidates)
        questions.append(_to_fresh_question(q_num, chosen))
        rounds_used.add(chosen[2]["exam_round"])

    return FreshWritingSection(
        exam_rounds_used=sorted(rounds_used),
        total_points=sum(q.points for q in questions),
        question_count=len(questions),
        questions=questions,
    )


def _generate_listening_section(listening_round: str) -> FreshListeningSection:
    round_items = [item for item in _fetch_real_exam_pool("listening") if item[2]["exam_round"] == listening_round]
    if len(round_items) < 50:
        raise InsufficientQuestionPoolError("listening", f"exam_round={listening_round}", 50, len(round_items))
    round_items.sort(key=lambda item: item[2]["question_number"])

    questions = [
        FreshListeningQuestion(
            id=item[0],
            question_number=item[2]["question_number"],
            question_type=item[2]["question_type"],
            points=item[2]["points"],
            prompt=item[1],
        )
        for item in round_items
    ]

    return FreshListeningSection(
        exam_round=listening_round,
        audio_path=_find_listening_audio_path(listening_round),
        total_points=sum(q.points for q in questions),
        question_count=len(questions),
        questions=questions,
    )


def generate_full_topik_exam(listening_round: str = "102nd") -> FreshTopikExamResponse:
    """Assemble one fresh, stateless TOPIK II exam paper.

    Reading: 50 questions randomly drawn across all ingested exam rounds,
    matching the official blueprint's per-type distribution.
    Writing: Q51-Q54 each randomly drawn (independently) across all rounds.
    Listening: all 50 questions from `listening_round`, in original order,
    plus that round's audio file path.
    """
    reading = _generate_reading_section()
    writing = _generate_writing_section()
    listening = _generate_listening_section(listening_round)

    warnings: list[str] = []
    if listening.audio_path is None:
        warnings.append(f"No listening audio file found on disk for exam_round={listening_round!r}.")

    return FreshTopikExamResponse(
        exam_id=str(uuid.uuid4()),
        generated_at=datetime.utcnow(),
        reading=reading,
        writing=writing,
        listening=listening,
        total_points=reading.total_points + writing.total_points + listening.total_points,
        total_questions=reading.question_count + writing.question_count + listening.question_count,
        warnings=warnings,
    )


if __name__ == "__main__":
    exam = generate_full_topik_exam()
    payload = exam.model_dump(mode="json")

    def _truncate_prompts(obj):
        if isinstance(obj, dict):
            return {k: (v[:80] + "..." if k == "prompt" and isinstance(v, str) and len(v) > 80 else _truncate_prompts(v)) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_truncate_prompts(v) for v in obj]
        return obj

    print(json.dumps(_truncate_prompts(payload), ensure_ascii=False, indent=2))
    print(
        f"\nreading={exam.reading.question_count}q/{exam.reading.total_points}pts "
        f"(rounds: {exam.reading.exam_rounds_used}) | "
        f"writing={exam.writing.question_count}q/{exam.writing.total_points}pts "
        f"(rounds: {exam.writing.exam_rounds_used}) | "
        f"listening={exam.listening.question_count}q/{exam.listening.total_points}pts "
        f"(round: {exam.listening.exam_round}, audio: {exam.listening.audio_path}) | "
        f"TOTAL={exam.total_questions}q/{exam.total_points}pts"
    )
    if exam.warnings:
        print("warnings:", exam.warnings)
