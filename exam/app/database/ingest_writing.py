"""Ingest TOPIK II Writing questions (Q51-Q54) from scanned exam PDFs into ChromaDB.

The source `*-Writing-Test-Paper.pdf` / `*-Writing-Answers.pdf` (or combined
`*-Answers.pdf`) files under ./data/raw_exams/<round>/ are scanned images with
no embedded text layer, so question context and sample-answer extraction is
done by rendering each page to an image and asking the project's configured
vision-capable LLM (ChatOpenAI -> OpenRouter -> anthropic/claude-sonnet-5) to
read it, rather than by text-layer parsing. See app/database/ingest_reading.py
for the same approach applied to the Reading section.

Run with:  python -m app.database.ingest_writing [--rounds 102nd 96nd ...]
"""

from __future__ import annotations

import argparse
import base64
from pathlib import Path

import pymupdf
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from app.config import OPENROUTER_BASE_URL, get_openrouter_api_key
from app.database.answer_key_extraction import extract_sections_from_combined_answer_key
from app.database.vector_db import add_questions, get_questions_by_ids

EXAM_ROOT = Path(__file__).resolve().parents[2] / "data" / "raw_exams"
VISION_MODEL = "anthropic/claude-sonnet-5"
RENDER_ZOOM = 1.8

WRITING_QUESTION_NUMBERS = [51, 52, 53, 54]
QUESTION_TYPES: dict[int, str] = {
    51: "short_completion",
    52: "short_completion",
    53: "chart_essay",
    54: "opinion_essay",
}
POINTS: dict[int, int] = {51: 10, 52: 10, 53: 30, 54: 50}


# ---------------------------------------------------------------------------
# Structured LLM output schemas (internal to this ingestion script)
# ---------------------------------------------------------------------------


class ExtractedWritingQuestion(BaseModel):
    question_number: int = Field(description="51, 52, 53, or 54.")
    is_complete: bool = Field(
        description="False if the prompt, chart, or reading material for this question is cut "
        "off by the page boundary and not fully visible in the supplied images."
    )
    question_text: str = Field(
        description="The full Korean question context exactly as printed: the instruction line, "
        "any email/passage/topic text, and for Q53's chart, a written transcription of every "
        "label and data point shown (titles, values, years, rankings, cause bullets, etc.) so the "
        "chart's content is captured as text. Preserve blank markers (㉠/㉡ or ㄱ/ㄴ) and line breaks."
    )


class WritingPageQuestions(BaseModel):
    questions: list[ExtractedWritingQuestion]


class WritingAnswerRow(BaseModel):
    question_number: int = Field(description="51, 52, 53, or 54.")
    sample_answer: str = Field(
        description="The official sample/model answer (모범답안) text exactly as printed, "
        "preserving ㄱ/ㄴ or ㉠/㉡ labels for Q51-52."
    )


class WritingAnswerKey(BaseModel):
    answers: list[WritingAnswerRow]


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


TEST_EXTRACTION_INSTRUCTION = (
    "다음은 TOPIK II 쓰기(Writing) 시험지 페이지 이미지입니다 (표지 페이지는 무시하세요). "
    "51번, 52번, 53번, 54번 문제의 지문/맥락을 추출하세요. 문제마다 question_number와 "
    "question_text(지시문 + 이메일/지문/주제 글 + 53번의 경우 그래프/도표에 적힌 모든 "
    "제목·수치·항목을 글로 옮겨 적은 것)를 채우세요. 페이지 경계에서 잘려 온전히 보이지 "
    "않는 문제는 is_complete=false로 표시하세요."
)

ANSWER_KEY_INSTRUCTION = (
    "다음은 TOPIK II 시험의 정답 및 배점표 이미지입니다 (듣기/쓰기/읽기 등 여러 영역이 "
    "포함될 수 있습니다). '영역 : 쓰기'라고 표시된 표에서만 51번, 52번, 53번, 54번의 "
    "모범답안(서답형) 텍스트를 그대로 추출하세요. 다른 영역(듣기, 읽기)의 표는 무시하세요."
)


def extract_test_pages(pdf_path: Path) -> dict[int, str]:
    """Return {question_number: question_text} for Q51-Q54 from a writing test PDF."""
    doc = pymupdf.open(pdf_path)
    images = [render_page_b64(doc, i) for i in range(doc.page_count)]
    doc.close()

    llm = get_llm().with_structured_output(WritingPageQuestions, method="function_calling")
    message = {
        "role": "user",
        "content": [{"type": "text", "text": TEST_EXTRACTION_INSTRUCTION}] + _image_content(images),
    }
    result: WritingPageQuestions = invoke_with_retries(llm, message)
    return {
        q.question_number: q.question_text
        for q in result.questions
        if q.is_complete and q.question_number in WRITING_QUESTION_NUMBERS
    }


def extract_answer_key(pdf_path: Path) -> dict[int, str]:
    """Return {question_number: sample_answer} for the Writing section only."""
    doc = pymupdf.open(pdf_path)
    images = [render_page_b64(doc, i) for i in range(doc.page_count)]
    doc.close()

    llm = get_llm().with_structured_output(WritingAnswerKey, method="function_calling")
    message = {
        "role": "user",
        "content": [{"type": "text", "text": ANSWER_KEY_INSTRUCTION}] + _image_content(images),
    }
    result: WritingAnswerKey = invoke_with_retries(llm, message)
    return {row.question_number: row.sample_answer for row in result.answers if row.question_number in WRITING_QUESTION_NUMBERS}


# ---------------------------------------------------------------------------
# File discovery
# ---------------------------------------------------------------------------


def _find_file(folder: Path, must_include: list[str], must_exclude: list[str] = ()) -> Path | None:
    for path in sorted(folder.glob("*.pdf")):
        name = path.name.lower()
        if all(term in name for term in must_include) and not any(term in name for term in must_exclude):
            return path
    return None


def find_writing_pdfs(folder: Path) -> tuple[Path | None, Path | None, bool]:
    """Return (test_pdf, answer_pdf, is_combined). is_combined is True when no dedicated
    Writing-Answers.pdf exists and answer_pdf is instead a combined key covering multiple
    sections (e.g. all_answers.pdf, 96th-TOPIK-II-Answers.pdf)."""
    test_pdf = _find_file(folder, ["writing"], ["answer"])
    dedicated_answer_pdf = _find_file(folder, ["writing", "answer"])
    if dedicated_answer_pdf is not None:
        return test_pdf, dedicated_answer_pdf, False
    combined_answer_pdf = _find_file(folder, ["answer"], ["listening", "reading"])
    return test_pdf, combined_answer_pdf, True


def discover_exam_folders() -> list[Path]:
    return sorted(p for p in EXAM_ROOT.iterdir() if p.is_dir())


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------


def ingest_folder(folder: Path) -> list[int]:
    """Ingest Q51-Q54 for one exam round. Returns the question numbers actually saved."""
    exam_round = folder.name
    test_pdf, answer_pdf, is_combined = find_writing_pdfs(folder)
    if test_pdf is None:
        print(f"[{exam_round}] skipped: no writing test PDF found")
        return []
    if answer_pdf is None:
        print(f"[{exam_round}] skipped: no writing answer key PDF found")
        return []

    print(f"[{exam_round}] extracting questions from {test_pdf.name} ...")
    questions = extract_test_pages(test_pdf)
    if is_combined:
        print(f"[{exam_round}] extracting writing sample answers from combined answer key {answer_pdf.name} ...")
        _listening, _reading, answers = extract_sections_from_combined_answer_key(answer_pdf)
    else:
        print(f"[{exam_round}] extracting sample answers from {answer_pdf.name} ...")
        answers = extract_answer_key(answer_pdf)

    ids: list[str] = []
    documents: list[str] = []
    metadatas: list[dict] = []
    saved: list[int] = []

    for q_num in WRITING_QUESTION_NUMBERS:
        text = questions.get(q_num)
        sample_answer = answers.get(q_num)
        if text is None or sample_answer is None:
            missing = []
            if text is None:
                missing.append("question text")
            if sample_answer is None:
                missing.append("sample answer")
            print(f"[{exam_round}] warning: q{q_num} missing {', '.join(missing)}, skipping")
            continue

        ids.append(f"topik_{exam_round}_writing_q{q_num}")
        documents.append(text)
        metadatas.append(
            {
                "exam_round": exam_round,
                "question_number": q_num,
                "question_type": QUESTION_TYPES[q_num],
                "points": POINTS[q_num],
                "sample_answer": sample_answer,
            }
        )
        saved.append(q_num)

    if ids:
        add_questions(domain="writing", ids=ids, documents=documents, metadatas=metadatas)
    print(f"[{exam_round}] ingested {len(saved)}/4 writing questions: {saved}")
    return saved


def verify_saved(round_saved: dict[str, list[int]]) -> None:
    """Re-read back from ChromaDB by id to confirm Q51-Q54 actually persisted."""
    print("\n=== Verification (re-read from ChromaDB) ===")
    for exam_round, q_nums in round_saved.items():
        expected_ids = [f"topik_{exam_round}_writing_q{n}" for n in WRITING_QUESTION_NUMBERS]
        stored = get_questions_by_ids("writing", expected_ids)
        stored_ids = set(stored["ids"])
        missing = [qid for qid in expected_ids if qid not in stored_ids]
        status = "OK (Q51-Q54 all present)" if not missing else f"INCOMPLETE, missing: {missing}"
        print(f"  [{exam_round}] {status}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest TOPIK II Writing PDFs into ChromaDB via vision-LLM extraction.")
    parser.add_argument("--rounds", nargs="*", help="Only process these exam_round folder names (default: all under data/raw_exams).")
    args = parser.parse_args()

    folders = discover_exam_folders()
    if args.rounds:
        wanted = set(args.rounds)
        folders = [f for f in folders if f.name in wanted]

    round_saved: dict[str, list[int]] = {}
    for folder in folders:
        saved = ingest_folder(folder)
        if saved:
            round_saved[folder.name] = saved

    verify_saved(round_saved)


if __name__ == "__main__":
    main()
