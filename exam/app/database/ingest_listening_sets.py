"""Ingest TOPIK II Listening questions (Q1-Q50) from scanned exam PDFs into ChromaDB.

Unlike Reading/Writing, the richest source per question is usually the
`*-Listening-Transcript.pdf` (when present): it contains the full dialogue/
narration script AND the printed answer options (including a written
description of picture options) on the same page, so it alone is enough to
build a self-contained document. When a round has no transcript PDF (only a
Test-Paper + Answers), extraction falls back to the Test-Paper PDF, which has
the question stem and options but not the spoken dialogue itself -- those
records are flagged with `has_transcript=False` in metadata.

All of these PDFs are scanned images with no embedded text layer, so
extraction is done via the project's configured vision-capable LLM
(ChatOpenAI -> OpenRouter -> anthropic/claude-sonnet-5), same approach as
ingest_reading.py / ingest_writing.py.

Run with:  python -m app.database.ingest_listening_sets [--rounds 102nd 96nd ...]
"""

from __future__ import annotations

import argparse
import base64
from collections import Counter
from pathlib import Path

import pymupdf
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from app.config import OPENROUTER_BASE_URL, get_openrouter_api_key
from app.database.answer_key_extraction import extract_sections_from_combined_answer_key
from app.database.vector_db import add_questions

EXAM_ROOT = Path(__file__).resolve().parents[2] / "data" / "raw_exams"
VISION_MODEL = "anthropic/claude-sonnet-5"
RENDER_ZOOM = 1.8
TEST_BATCH_PAGES = 3
TEST_BATCH_OVERLAP = 1  # re-send the last page of each batch so questions split across a page boundary get a second chance

# Standard TOPIK II Listening blueprint (approved for this project). Exact
# sub-labels of official material can vary slightly per round; these ranges
# are used as a consistent taxonomy across all rounds regardless.
QUESTION_TYPE_RANGES: list[tuple[int, int, str]] = [
    (1, 4, "dialogue_response"),
    (5, 6, "continuation"),
    (7, 10, "place"),
    (11, 14, "topic"),
    (15, 16, "situation_picture"),
    (17, 20, "main_idea"),
    (21, 22, "core_thought"),
    (23, 24, "action"),
    (25, 30, "interview"),
    (31, 40, "discourse_lecture"),
    (41, 50, "lecture_detail"),
]


def question_type_for(q_num: int) -> str:
    for start, end, label in QUESTION_TYPE_RANGES:
        if start <= q_num <= end:
            return label
    return "uncategorized"


# ---------------------------------------------------------------------------
# Structured LLM output schemas (internal to this ingestion script)
# ---------------------------------------------------------------------------


class ExtractedListeningQuestion(BaseModel):
    question_number: int = Field(description="The printed question number (1-50).")
    is_complete: bool = Field(
        description="False if the dialogue/narration, prompt, or any of the options is cut off "
        "by the page boundary and not fully visible in the supplied images."
    )
    question_text: str = Field(
        description="The full Korean content exactly as printed: any shared instruction line "
        "(e.g. '※ [17~20] ...'), the dialogue or narration script if visible, the question "
        "prompt, and all options. If an option is a picture rather than text, write a short "
        "Korean description of what each numbered picture shows instead of the text. Preserve "
        "speaker labels (남자/여자) and line breaks."
    )


class ListeningPageQuestions(BaseModel):
    questions: list[ExtractedListeningQuestion]


class AnswerRow(BaseModel):
    question_number: int
    correct_option: int = Field(description="Correct option as 1-4, read from the ①②③④ symbol in the 정답 column.")
    points: int = Field(description="Point value read from the 배점 column.")


class AnswerKey(BaseModel):
    answers: list[AnswerRow]


# ---------------------------------------------------------------------------
# PDF rendering + vision extraction
# ---------------------------------------------------------------------------

_llm: ChatOpenAI | None = None


def get_llm() -> ChatOpenAI:
    global _llm
    if _llm is None:
        _llm = ChatOpenAI(
            model=VISION_MODEL,
            base_url=OPENROUTER_BASE_URL,
            api_key=get_openrouter_api_key(),
            temperature=0,
        )
    return _llm


def render_page_b64(doc: pymupdf.Document, index: int) -> str:
    pix = doc[index].get_pixmap(matrix=pymupdf.Matrix(RENDER_ZOOM, RENDER_ZOOM))
    return base64.b64encode(pix.tobytes("png")).decode("ascii")


def _image_content(images_b64: list[str]) -> list[dict]:
    return [{"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}} for b64 in images_b64]


def invoke_with_retries(structured_llm, message: dict, max_retries: int = 2):
    """Retry a structured-output vision call a few times before giving up.

    OpenRouter's function-calling passthrough occasionally returns a nested
    list field JSON-encoded as a string instead of a real array, which fails
    Pydantic validation. This is transient, not a data problem, so retry
    rather than aborting the whole ingestion run.
    """
    last_error: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            return structured_llm.invoke([message])
        except Exception as exc:
            last_error = exc
            if attempt < max_retries:
                print(f"  (structured output parse failed, retrying {attempt + 1}/{max_retries}: {exc})")
    raise last_error


TRANSCRIPT_EXTRACTION_INSTRUCTION = (
    "다음은 TOPIK II 듣기(Listening) 대본(스크립트) 자료의 연속된 페이지 이미지입니다. "
    "각 페이지에는 문제 번호, 대화/담화 대본, 그리고 선택지(텍스트 또는 그림)가 함께 "
    "인쇄되어 있습니다. 온전히 보이는 문제만 추출하세요. 문제마다 question_number와 "
    "question_text(공유 지시문 + 대화/담화 대본 전체 + 문제 본문 + 선택지, 원문 그대로, "
    "줄바꿈 유지 — 선택지가 그림이면 각 그림이 보여주는 상황을 한국어로 간단히 서술)를 "
    "채우세요. 대본, 문제, 선택지 중 하나라도 페이지 경계에서 잘려 온전히 보이지 않는 "
    "문제는 is_complete=false로 표시하세요. 표지나 유의사항만 있는 페이지는 무시하세요."
)

TEST_PAPER_ONLY_INSTRUCTION = (
    "다음은 TOPIK II 듣기(Listening) 시험지의 연속된 페이지 이미지입니다 (오디오 대본은 "
    "제공되지 않으므로, 인쇄된 문제 번호와 선택지만 보고 추출하세요 — 대화 내용은 알 수 "
    "없습니다). 온전히 보이는 문제만 추출하세요. 문제마다 question_number와 question_text"
    "(공유 지시문 + 문제 본문 + 선택지, 원문 그대로 — 선택지가 그림이면 각 그림이 보여주는 "
    "상황을 한국어로 간단히 서술)를 채우세요. 선택지가 페이지 경계에서 잘려 온전히 보이지 "
    "않는 문제는 is_complete=false로 표시하세요. 표지나 유의사항만 있는 페이지는 무시하세요."
)

ANSWER_KEY_INSTRUCTION = (
    "다음은 TOPIK II 시험의 정답 및 배점표 이미지입니다 (듣기/쓰기/읽기 등 여러 영역이 "
    "포함될 수 있습니다). '영역 : 듣기'라고 표시된 표에서만 문제 번호(1~50), 정답 "
    "(①②③④ 기호를 1~4 숫자로), 배점을 추출하세요. 다른 영역(읽기, 쓰기)의 표는 무시하세요."
)


def _extract_pages_batched(pdf_path: Path, instruction: str) -> dict[int, str]:
    doc = pymupdf.open(pdf_path)
    llm = get_llm().with_structured_output(ListeningPageQuestions, method="function_calling")

    collected: dict[int, str] = {}
    page_count = doc.page_count
    start = 0
    while start < page_count:
        end = min(start + TEST_BATCH_PAGES, page_count)
        images = [render_page_b64(doc, i) for i in range(start, end)]
        message = {
            "role": "user",
            "content": [{"type": "text", "text": instruction}] + _image_content(images),
        }
        result: ListeningPageQuestions = invoke_with_retries(llm, message)
        for q in result.questions:
            if not q.is_complete or not (1 <= q.question_number <= 50):
                continue
            existing = collected.get(q.question_number)
            if existing is None or len(q.question_text) > len(existing):
                collected[q.question_number] = q.question_text
        if end >= page_count:
            break
        start = end - TEST_BATCH_OVERLAP
    doc.close()
    return collected


def extract_from_transcript(pdf_path: Path) -> dict[int, str]:
    """Return {question_number: question_text} using the richer Transcript PDF (dialogue + options)."""
    return _extract_pages_batched(pdf_path, TRANSCRIPT_EXTRACTION_INSTRUCTION)


def extract_from_test_paper(pdf_path: Path) -> dict[int, str]:
    """Return {question_number: question_text} using only the Test-Paper PDF (no dialogue text available)."""
    return _extract_pages_batched(pdf_path, TEST_PAPER_ONLY_INSTRUCTION)


def extract_answer_key(pdf_path: Path) -> dict[int, tuple[int, int]]:
    """Return {question_number: (correct_option, points)} for the Listening section only."""
    doc = pymupdf.open(pdf_path)
    images = [render_page_b64(doc, i) for i in range(doc.page_count)]
    doc.close()

    llm = get_llm().with_structured_output(AnswerKey, method="function_calling")
    message = {
        "role": "user",
        "content": [{"type": "text", "text": ANSWER_KEY_INSTRUCTION}] + _image_content(images),
    }
    result: AnswerKey = invoke_with_retries(llm, message)
    return {row.question_number: (row.correct_option, row.points) for row in result.answers if 1 <= row.question_number <= 50}


# ---------------------------------------------------------------------------
# File discovery
# ---------------------------------------------------------------------------


def _find_file(folder: Path, must_include: list[str], must_exclude: list[str] = ()) -> Path | None:
    for path in sorted(folder.glob("*.pdf")):
        name = path.name.lower()
        if all(term in name for term in must_include) and not any(term in name for term in must_exclude):
            return path
    return None


def find_listening_pdfs(folder: Path) -> tuple[Path | None, Path | None, Path | None, bool]:
    """Return (test_pdf, transcript_pdf, answer_pdf, is_combined).

    transcript_pdf is None if the round has no dedicated transcript. is_combined
    is True when no dedicated Listening-Answers.pdf exists and answer_pdf is
    instead a combined key covering multiple sections."""
    test_pdf = _find_file(folder, ["listening"], ["transcript", "answer"])
    transcript_pdf = _find_file(folder, ["listening", "transcript"])
    dedicated_answer_pdf = _find_file(folder, ["listening", "answer"])
    if dedicated_answer_pdf is not None:
        return test_pdf, transcript_pdf, dedicated_answer_pdf, False
    combined_answer_pdf = _find_file(folder, ["answer"], ["reading", "writing"])
    return test_pdf, transcript_pdf, combined_answer_pdf, True


def discover_exam_folders() -> list[Path]:
    return sorted(p for p in EXAM_ROOT.iterdir() if p.is_dir())


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------


def ingest_folder(folder: Path) -> Counter[str]:
    exam_round = folder.name
    test_pdf, transcript_pdf, answer_pdf, is_combined = find_listening_pdfs(folder)
    if test_pdf is None and transcript_pdf is None:
        print(f"[{exam_round}] skipped: no listening test/transcript PDF found")
        return Counter()
    if answer_pdf is None:
        print(f"[{exam_round}] skipped: no listening answer key PDF found")
        return Counter()

    has_transcript = transcript_pdf is not None
    if has_transcript:
        print(f"[{exam_round}] extracting questions from transcript {transcript_pdf.name} ...")
        questions = extract_from_transcript(transcript_pdf)
    else:
        print(f"[{exam_round}] no transcript available, extracting stems/options only from {test_pdf.name} ...")
        questions = extract_from_test_paper(test_pdf)

    if is_combined:
        print(f"[{exam_round}] extracting listening answers from combined answer key {answer_pdf.name} ...")
        answers, _reading, _writing = extract_sections_from_combined_answer_key(answer_pdf)
    else:
        print(f"[{exam_round}] extracting answer key from {answer_pdf.name} ...")
        answers = extract_answer_key(answer_pdf)

    ids: list[str] = []
    documents: list[str] = []
    metadatas: list[dict] = []
    type_counts: Counter[str] = Counter()

    for q_num in range(1, 51):
        text = questions.get(q_num)
        answer = answers.get(q_num)
        if text is None or answer is None:
            missing = []
            if text is None:
                missing.append("question text")
            if answer is None:
                missing.append("answer key")
            print(f"[{exam_round}] warning: q{q_num} missing {', '.join(missing)}, skipping")
            continue

        correct_option, points = answer
        q_type = question_type_for(q_num)
        ids.append(f"topik_{exam_round}_listening_q{q_num}")
        documents.append(text)
        metadatas.append(
            {
                "exam_round": exam_round,
                "question_number": q_num,
                "question_type": q_type,
                "points": points,
                "correct_answer": correct_option,
                "has_transcript": has_transcript,
            }
        )
        type_counts[q_type] += 1

    if ids:
        add_questions(domain="listening", ids=ids, documents=documents, metadatas=metadatas)
    print(f"[{exam_round}] ingested {len(ids)}/50 listening questions (has_transcript={has_transcript})")
    return type_counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest TOPIK II Listening PDFs into ChromaDB via vision-LLM extraction.")
    parser.add_argument("--rounds", nargs="*", help="Only process these exam_round folder names (default: all under data/raw_exams).")
    args = parser.parse_args()

    folders = discover_exam_folders()
    if args.rounds:
        wanted = set(args.rounds)
        folders = [f for f in folders if f.name in wanted]

    total_by_type: Counter[str] = Counter()
    total_ingested = 0
    for folder in folders:
        counts = ingest_folder(folder)
        total_by_type.update(counts)
        total_ingested += sum(counts.values())

    print("\n=== Listening questions ingested by question_type ===")
    labels = [label for _, _, label in QUESTION_TYPE_RANGES] + ["uncategorized"]
    for label in labels:
        if total_by_type.get(label):
            print(f"  {label}: {total_by_type[label]}")
    print(f"Total listening questions ingested: {total_ingested}")


if __name__ == "__main__":
    main()
