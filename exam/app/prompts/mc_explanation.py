"""Prompt templates for generating Myanmar-language explanations of wrong/unanswered
Reading & Listening multiple-choice questions."""

from __future__ import annotations

from dataclasses import dataclass

OPTION_SYMBOLS = ["①", "②", "③", "④"]


@dataclass(frozen=True)
class ExplanationItem:
    question_id: str
    prompt_text: str  # full question text, options (①②③④) already embedded
    selected_option: int | None  # None => left unanswered
    correct_option: int


def build_system_prompt() -> str:
    return (
        "당신은 TOPIK II 읽기/듣기 문제를 학생에게 설명하는 한국어 교육 전문가입니다.\n"
        "지금부터 학생이 틀렸거나 답하지 않은 객관식 문제들이 주어집니다. "
        "각 문제마다 아래 세 가지를 미얀마어(မြန်မာဘာသာ)로 작성하십시오:\n\n"
        "1. correct_answer_explanation_myanmar — 정답이 무엇이고 왜 정답인지 설명하십시오.\n"
        "2. wrong_answer_explanation_myanmar — 학생이 선택한 답(또는 답을 하지 않은 경우 그 사실)이 "
        "왜 틀렸는지 설명하십시오.\n"
        "3. grammar_vocab_focus_myanmar — 이 문제가 다루는 핵심 문법 또는 어휘 포인트를 설명하십시오.\n\n"
        "다음 규칙을 반드시 지키십시오:\n"
        "- 필드 이름에 있는 대로, 세 필드 모두 반드시 미얀마어(Burmese, မြန်မာဘာသာ) 문장으로만 "
        "작성하십시오. 한국어나 영어 문장을 "
        "섞어서 쓰지 마십시오 — 문제에 나온 한국어 단어/문법 표현 자체를 인용할 때만 그 단어를 "
        "그대로 적고, 설명 문장 자체는 전부 미얀마어여야 합니다.\n"
        "- 한국어 단어를 인용할 때는 반드시 문제 원문에 적힌 철자와 완전히 동일하게 그대로 옮겨 "
        "적으십시오. 절대로 구자라트어, 힌디어, 태국어 등 한국어·미얀마어가 아닌 다른 문자로 "
        "바꾸거나 섞어 쓰지 마십시오.\n"
        "- question_id 필드에는 입력으로 주어진 question_id를 그대로 정확히 복사해서 반환하십시오 "
        "(응답 매칭에 사용되므로 변경하거나 생략하면 안 됩니다).\n"
        "- 주어진 모든 문제에 대해 빠짐없이 하나씩 설명을 반환하십시오."
    )


def build_human_prompt(items: list[ExplanationItem]) -> str:
    blocks = []
    for item in items:
        selected = (
            OPTION_SYMBOLS[item.selected_option - 1] if item.selected_option else "(답하지 않음 / no answer given)"
        )
        correct = OPTION_SYMBOLS[item.correct_option - 1]
        blocks.append(
            f"question_id: {item.question_id}\n"
            f"문제:\n{item.prompt_text}\n"
            f"학생이 선택한 답: {selected}\n"
            f"정답: {correct}"
        )

    joined = "\n\n---\n\n".join(blocks)
    return (
        "다음은 학생이 틀렸거나 답하지 않은 문제 목록입니다:\n\n"
        f"{joined}\n\n"
        "위 규칙에 따라 각 문제마다 구조화된 설명을 작성해 반환하십시오."
    )
