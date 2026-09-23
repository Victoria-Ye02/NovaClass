"""Ingest TOPIK II Reading questions (Q1-Q50) from scanned exam PDFs into ChromaDB.

The source `*-Reading-Test-Paper.pdf` / `*-Reading-Answers.pdf` (or combined
`*-Answers.pdf`) files under ./data/raw_exams/<round>/ are scanned images with
no embedded text layer, so question and answer-key extraction is done by
rendering each page to an image and asking the project's configured
vision-capable LLM (ChatOpenAI -> OpenRouter -> anthropic/claude-sonnet-5) to
read it, rather than by text-layer parsing.

Run with:  python -m app.database.ingest_reading [--rounds 102nd 96nd ...]
"""

from __future__ import annotations

import argparse
import base64
import json
from collections import Counter
from pathlib import Path
from typing import NamedTuple

import pymupdf
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from app.config import OPENROUTER_BASE_URL, get_openrouter_api_key
from app.database.answer_key_extraction import extract_sections_from_combined_answer_key
from app.database.vector_db import add_questions

PROJECT_ROOT = Path(__file__).resolve().parents[2]
EXAM_ROOT = PROJECT_ROOT / "data" / "raw_exams"
VISION_MODEL = "anthropic/claude-sonnet-5"
RENDER_ZOOM = 1.8
IMAGE_SAVE_ZOOM = 2.5  # higher-res render for cropped question images shown to end users
TEST_BATCH_PAGES = 3
TEST_BATCH_OVERLAP = 1  # re-send the last page of each batch so questions split across a page boundary get a second chance

# TOPIK Reading blueprint per CLAUDE.md. Q28-30 are intentionally left
# unmapped (not specified in the blueprint) and fall back to "uncategorized".
QUESTION_TYPE_RANGES: list[tuple[int, int, str]] = [
    (1, 4, "grammar_fill_in"),
    (5, 8, "signboard_context"),
    (9, 12, "graph_details"),
    (13, 15, "sentence_order"),
    (16, 24, "short_article_fill_in"),
    (25, 27, "news_headline"),
    (31, 34, "main_idea"),
    (35, 50, "long_article_comprehension"),
]


def question_type_for(q_num: int) -> str:
    for start, end, label in QUESTION_TYPE_RANGES:
        if start <= q_num <= end:
            return label
    return "uncategorized"


# ---------------------------------------------------------------------------
# Structured LLM output schemas (internal to this ingestion script)
# ---------------------------------------------------------------------------


class ExtractedQuestion(BaseModel):
    question_number: int = Field(description="The printed question number (1-50).")
    is_complete: bool = Field(
        description="False if the shared passage, prompt, or any of the 4 options is cut off "
        "by the page boundary and not fully visible in the supplied images."
    )
    question_text: str = Field(
        description="The full Korean question exactly as printed: any shared passage/instruction "
        "line, the question prompt, and all numbered options (①②③④), preserving line breaks."
    )
    page_index_in_batch: int = Field(
        description="0-based index into the supplied images (in the order given) where this "
        "question's main content/prompt appears. If it spans two images, use the one with the "
        "question number and prompt text (not just a continuation)."
    )
    has_image: bool = Field(
        default=False,
        description="True if the question's prompt itself is (or includes) a real graphic — an "
        "advertisement/signboard image, a photo, a chart/graph, a diagram — that a reader needs to "
        "see to answer, as opposed to a question that's purely printed Korean text.",
    )
    image_bbox: list[float] | None = Field(
        default=None,
        description="Only when has_image is true: the bounding box of just that graphic within the "
        "page image, as [x0, y0, x1, y1] fractions of the full page width/height (0.0-1.0, "
        "top-left origin) — tight enough to crop out just the picture, not the surrounding "
        "question number/text/options. Null when has_image is false.",
    )


class PageQuestions(BaseModel):
    questions: list[ExtractedQuestion]


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


BBOX_PADDING = 0.05  # fraction of page size added on every side -- the vision LLM's bbox
# estimate tends to run tight and can clip a whole line of text at the edge otherwise.


def save_cropped_image(doc: pymupdf.Document, page_number: int, bbox: list[float], out_path: Path) -> None:
    """Crop the bbox region (fractions of page width/height, 0-1) of one page, padded a bit to
    avoid clipping, and save as PNG."""
    page = doc[page_number]
    rect = page.rect
    x0, y0, x1, y1 = bbox
    x0 = max(0.0, x0 - BBOX_PADDING)
    y0 = max(0.0, y0 - BBOX_PADDING)
    x1 = min(1.0, x1 + BBOX_PADDING)
    y1 = min(1.0, y1 + BBOX_PADDING)
    clip = pymupdf.Rect(x0 * rect.width, y0 * rect.height, x1 * rect.width, y1 * rect.height)
    pix = page.get_pixmap(matrix=pymupdf.Matrix(IMAGE_SAVE_ZOOM, IMAGE_SAVE_ZOOM), clip=clip)
    out_path.write_bytes(pix.tobytes("png"))


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
    "다음은 TOPIK II 읽기(Reading) 시험지의 연속된 페이지 이미지입니다. "
    "각 이미지에서 온전히 보이는 문제만 추출하세요. 문제마다 question_number와 "
    "question_text(공유 지문/지시문 + 문제 본문 + ①②③④ 선택지 전체를 원문 그대로, "
    "줄바꿈 유지)를 채우세요. 지문이나 선택지가 페이지 경계에서 잘려 온전히 보이지 "
    "않는 문제는 is_complete=false로 표시하세요. 표지나 제목만 있는 페이지는 무시하세요.\n"
    "일부 문항은 저작권 법령에 따라 지문이 '공개하지 않습니다'라는 안내문(한글/영문 "
    "NOTICE 박스)으로 대체되어 있습니다 — 이는 정상적인 원본 상태이며 페이지가 잘린 것이 "
    "아닙니다. 이 경우 그 안내문 박스 전체를 question_text에 그대로 포함하고, 문제 본문과 "
    "①②③④ 선택지가 모두 보인다면 is_complete=true로 표시하세요.\n"
    "각 문제마다 page_index_in_batch(그 문제의 본문/지시문이 위치한 이미지의 0부터 시작하는 "
    "순번, 제공된 순서 기준)도 반드시 채우세요. 또한 문제의 지문 자체가 광고/간판 이미지, "
    "사진, 그래프/차트, 도표 등 실제 그림이어서 읽는 사람이 그 그림을 봐야 풀 수 있는 "
    "문제라면 has_image=true로 표시하고, image_bbox에 그 그림만을 감싸는 사각형을 "
    "[x0, y0, x1, y1] 형식(페이지 전체 너비/높이 대비 0.0~1.0 비율, 왼쪽 위가 원점)으로 "
    "최대한 타이트하게(문제 번호/본문/①②③④ 선택지는 포함하지 않고 그림만) 채우세요. "
    "순수 한국어 텍스트로만 이루어진 문제라면 has_image=false, image_bbox=null로 표시하세요."
)

ANSWER_KEY_INSTRUCTION = (
    "다음은 TOPIK II 시험의 정답 및 배점표 이미지입니다 (듣기/쓰기/읽기 등 여러 영역이 "
    "포함될 수 있습니다). '영역 : 읽기'라고 표시된 표에서만 문제 번호(1~50), 정답 "
    "(①②③④ 기호를 1~4 숫자로), 배점을 추출하세요. 다른 영역(듣기, 쓰기)의 표는 무시하세요."
)


class ExtractedText(NamedTuple):
    text: str
    page_number: int  # 0-based index into the source PDF
    has_image: bool
    image_bbox: list[float] | None


def extract_test_pages(pdf_path: Path) -> dict[int, ExtractedText]:
    """Return {question_number: ExtractedText} extracted from every page of a reading test PDF."""
    doc = pymupdf.open(pdf_path)
    llm = get_llm().with_structured_output(PageQuestions, method="function_calling")

    collected: dict[int, ExtractedText] = {}
    page_count = doc.page_count
    start = 0
    while start < page_count:
        end = min(start + TEST_BATCH_PAGES, page_count)
        images = [render_page_b64(doc, i) for i in range(start, end)]
        message = {
            "role": "user",
            "content": [{"type": "text", "text": TEST_EXTRACTION_INSTRUCTION}] + _image_content(images),
        }
        result: PageQuestions = invoke_with_retries(llm, message)
        for q in result.questions:
            if not q.is_complete or not (1 <= q.question_number <= 50):
                continue
            page_offset = q.page_index_in_batch if 0 <= q.page_index_in_batch < (end - start) else 0
            existing = collected.get(q.question_number)
            if existing is None or len(q.question_text) > len(existing.text):
                bbox = q.image_bbox if q.has_image and q.image_bbox and len(q.image_bbox) == 4 else None
                collected[q.question_number] = ExtractedText(
                    text=q.question_text,
                    page_number=start + page_offset,
                    has_image=bool(bbox),
                    image_bbox=bbox,
                )
        if end >= page_count:
            break
        start = end - TEST_BATCH_OVERLAP
    doc.close()
    return collected


def extract_answer_key(pdf_path: Path) -> dict[int, tuple[int, int]]:
    """Return {question_number: (correct_option, points)} for the Reading section only."""
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


def find_reading_pdfs(folder: Path) -> tuple[Path | None, Path | None, bool]:
    """Return (test_pdf, answer_pdf, is_combined). is_combined is True when no dedicated
    Reading-Answers.pdf exists and answer_pdf is instead a combined key covering multiple
    sections (e.g. all_answers.pdf, 96th-TOPIK-II-Answers.pdf)."""
    test_pdf = _find_file(folder, ["reading"], ["transcript", "answer"])
    dedicated_answer_pdf = _find_file(folder, ["reading", "answer"])
    if dedicated_answer_pdf is not None:
        return test_pdf, dedicated_answer_pdf, False
    combined_answer_pdf = _find_file(folder, ["answer"], ["listening", "writing"])
    return test_pdf, combined_answer_pdf, True


def discover_exam_folders() -> list[Path]:
    return sorted(p for p in EXAM_ROOT.iterdir() if p.is_dir())


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------


def ingest_folder(folder: Path) -> Counter[str]:
    exam_round = folder.name
    test_pdf, answer_pdf, is_combined = find_reading_pdfs(folder)
    if test_pdf is None:
        print(f"[{exam_round}] skipped: no reading test PDF found")
        return Counter()
    if answer_pdf is None:
        print(f"[{exam_round}] skipped: no reading answer key PDF found")
        return Counter()

    print(f"[{exam_round}] extracting questions from {test_pdf.name} ...")
    questions = extract_test_pages(test_pdf)
    if is_combined:
        print(f"[{exam_round}] extracting reading answers from combined answer key {answer_pdf.name} ...")
        _listening, answers, _writing = extract_sections_from_combined_answer_key(answer_pdf)
    else:
        print(f"[{exam_round}] extracting answer key from {answer_pdf.name} ...")
        answers = extract_answer_key(answer_pdf)

    ids: list[str] = []
    documents: list[str] = []
    metadatas: list[dict] = []
    type_counts: Counter[str] = Counter()
    image_count = 0
    test_doc: pymupdf.Document | None = None

    for q_num in range(1, 51):
        extracted = questions.get(q_num)
        answer = answers.get(q_num)
        if extracted is None or answer is None:
            missing = []
            if extracted is None:
                missing.append("question text")
            if answer is None:
                missing.append("answer key")
            print(f"[{exam_round}] warning: q{q_num} missing {', '.join(missing)}, skipping")
            continue

        correct_option, points = answer
        q_type = question_type_for(q_num)
        metadata = {
            "exam_round": exam_round,
            "question_number": q_num,
            "question_type": q_type,
            "points": points,
            "correct_answer": correct_option,
        }

        if extracted.has_image and extracted.image_bbox:
            images_dir = folder / "reading_images"
            images_dir.mkdir(exist_ok=True)
            image_path = images_dir / f"q{q_num}.png"
            try:
                if test_doc is None:
                    test_doc = pymupdf.open(test_pdf)
                save_cropped_image(test_doc, extracted.page_number, extracted.image_bbox, image_path)
                metadata["image_path"] = str(image_path.relative_to(PROJECT_ROOT))
                # Kept so the crop can be redone later (e.g. tuning BBOX_PADDING) by
                # re-rendering locally from these coordinates -- without them, any
                # adjustment would require re-running the vision-LLM extraction again.
                metadata["image_page_number"] = extracted.page_number
                metadata["image_bbox"] = json.dumps(extracted.image_bbox)
                image_count += 1
            except Exception as exc:
                print(f"[{exam_round}] warning: q{q_num} image crop failed ({exc}), skipping image")

        ids.append(f"topik_{exam_round}_reading_q{q_num}")
        documents.append(extracted.text)
        metadatas.append(metadata)
        type_counts[q_type] += 1

    if test_doc is not None:
        test_doc.close()

    if ids:
        add_questions(domain="reading", ids=ids, documents=documents, metadatas=metadatas)
    print(f"[{exam_round}] ingested {len(ids)}/50 reading questions ({image_count} with cropped images)")
    return type_counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest TOPIK II Reading PDFs into ChromaDB via vision-LLM extraction.")
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

    print("\n=== Reading questions ingested by question_type ===")
    labels = [label for _, _, label in QUESTION_TYPE_RANGES] + ["uncategorized"]
    for label in labels:
        if total_by_type.get(label):
            print(f"  {label}: {total_by_type[label]}")
    print(f"Total reading questions ingested: {total_ingested}")


if __name__ == "__main__":
    main()
