"""Shared vision-LLM extraction for a combined TOPIK II answer-key PDF.

Some exam rounds ship one `*-Answers.pdf` covering Listening, Reading, and
Writing together instead of a dedicated file per section. These PDFs are
scanned images with no embedded text layer (confirmed: 0 extractable
characters), so regex/text-layer parsing finds nothing on them. Extraction is
done by rendering every page to an image and asking the project's configured
vision-capable LLM (ChatOpenAI -> OpenRouter -> anthropic/claude-sonnet-5) to
read whichever section tables ("영역 : 듣기" / "영역 : 읽기" / "영역 : 쓰기")
are actually present.

Used by ingest_reading.py and ingest_writing.py when a folder has no
dedicated per-section answer PDF.
"""

from __future__ import annotations

import base64
from pathlib import Path

import pymupdf
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from app.config import OPENROUTER_BASE_URL, get_openrouter_api_key

VISION_MODEL = "anthropic/claude-sonnet-5"
RENDER_ZOOM = 1.8

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


class ScoredAnswerRow(BaseModel):
    question_number: int
    correct_option: int = Field(description="1-4, read from the ①②③④ symbol in the 정답 column.")
    points: int = Field(description="Point value read from the 배점 column.")


class WritingAnswerRow(BaseModel):
    question_number: int = Field(description="51, 52, 53, or 54.")
    sample_answer: str = Field(description="The official sample/model answer (모범답안) text exactly as printed.")


class CombinedAnswerKey(BaseModel):
    listening_answers: list[ScoredAnswerRow] = Field(
        default_factory=list, description="Rows from the '영역 : 듣기' table, Q1-50. Empty if that table isn't in the document."
    )
    reading_answers: list[ScoredAnswerRow] = Field(
        default_factory=list, description="Rows from the '영역 : 읽기' table, Q1-50. Empty if that table isn't in the document."
    )
    writing_answers: list[WritingAnswerRow] = Field(
        default_factory=list, description="Rows from the '영역 : 쓰기' table, Q51-54. Empty if that table isn't in the document."
    )


COMBINED_KEY_INSTRUCTION = (
    "다음은 TOPIK II 시험의 정답 및 배점표 이미지입니다. 이 문서에는 '영역 : 듣기', "
    "'영역 : 읽기', '영역 : 쓰기' 표가 각각 포함되어 있을 수 있습니다. 실제로 존재하는 "
    "모든 영역의 표를 찾아 해당 필드를 채우세요.\n"
    "- 듣기(listening_answers) / 읽기(reading_answers): 문제 번호(1~50), 정답 "
    "(①②③④ 기호를 1~4 숫자로), 배점.\n"
    "- 쓰기(writing_answers): 문제 번호(51~54)와 모범답안(서답형) 텍스트 그대로.\n"
    "문서에 없는 영역의 목록은 비워 두세요."
)


def extract_sections_from_combined_answer_key(
    pdf_path: Path,
) -> tuple[dict[int, tuple[int, int]], dict[int, tuple[int, int]], dict[int, str]]:
    """Parse one combined TOPIK answer-key PDF into (listening, reading, writing) maps.

    listening/reading maps are {question_number: (correct_option, points)};
    writing is {question_number: sample_answer_text}. A section's dict comes
    back empty if that section's table isn't present in the PDF.
    """
    doc = pymupdf.open(pdf_path)
    images = [render_page_b64(doc, i) for i in range(doc.page_count)]
    doc.close()

    llm = get_llm().with_structured_output(CombinedAnswerKey, method="function_calling")
    message = {
        "role": "user",
        "content": [{"type": "text", "text": COMBINED_KEY_INSTRUCTION}] + _image_content(images),
    }
    result: CombinedAnswerKey = invoke_with_retries(llm, message)

    listening = {row.question_number: (row.correct_option, row.points) for row in result.listening_answers if 1 <= row.question_number <= 50}
    reading = {row.question_number: (row.correct_option, row.points) for row in result.reading_answers if 1 <= row.question_number <= 50}
    writing = {row.question_number: row.sample_answer for row in result.writing_answers if row.question_number in (51, 52, 53, 54)}
    return listening, reading, writing
