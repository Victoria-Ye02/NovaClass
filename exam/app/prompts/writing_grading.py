"""Prompt templates and official rubrics for TOPIK Writing (Q51-Q54) grading."""

from __future__ import annotations

QUESTION_MAX_SCORE: dict[int, int] = {51: 10, 52: 10, 53: 30, 54: 50}

_RUBRICS: dict[int, str] = {
    51: (
        "- 존댓말 종결 어미(-습니다/-습니까)를 일관되게 사용했는지 확인하십시오.\n"
        "- 문맥상 자연스럽고 주어진 상황(이메일/메모/문자 등)에 맞는 내용인지 확인하십시오.\n"
        "- 빈칸 각각에 대해 문법적으로 완전한 문장을 썼는지 확인하십시오."
    ),
    52: (
        "- 존댓말 종결 어미(-습니다/-습니까)를 일관되게 사용했는지 확인하십시오.\n"
        "- 문맥상 자연스럽고 앞뒤 문장과 논리적으로 이어지는지 확인하십시오.\n"
        "- 빈칸 각각에 대해 문법적으로 완전한 문장을 썼는지 확인하십시오."
    ),
    53: (
        "- 개인적인 의견이나 감상이 들어가지 않고 객관적으로 서술했는지 확인하십시오.\n"
        "- 제시된 도표/그래프의 수치와 항목을 정확하게 반영했는지 확인하십시오.\n"
        "- 문어체 종결 어미(-ㄴ다/-는다)를 사용했는지 확인하십시오 "
        "(구어체 -아요/어요, 격식체 -습니다 사용 시 감점).\n"
        "- 분량이 200~300자 범위인지 확인하십시오."
    ),
    54: (
        "- 서론-본론-결론 구조를 갖추었는지 확인하십시오.\n"
        "- 분량이 600~700자 범위인지 확인하십시오.\n"
        "- 주장과 근거가 논리적으로 연결되어 있는지 확인하십시오.\n"
        "- 문어체 종결 어미(-ㄴ다/-는다)를 사용했는지 확인하십시오."
    ),
}


def get_max_score(question_number: int) -> int:
    try:
        return QUESTION_MAX_SCORE[question_number]
    except KeyError as exc:
        raise ValueError(f"Unsupported writing question number: {question_number}") from exc


def build_system_prompt(question_number: int) -> str:
    max_score = get_max_score(question_number)
    rubric = _RUBRICS[question_number]
    return (
        "당신은 TOPIK II 쓰기 영역을 채점하는 전문 평가자입니다.\n"
        f"지금부터 채점할 문항은 {question_number}번이며, 만점은 {max_score}점입니다.\n\n"
        "다음 공식 채점 기준을 반드시 적용하십시오:\n"
        f"{rubric}\n\n"
        "채점 시 아래 규칙을 반드시 지키십시오:\n"
        f"1. total_score는 0에서 {max_score} 사이의 정수여야 합니다.\n"
        "2. grammar_vocab_score, structure_score, content_score는 각각 0 이상의 정수로, "
        "위 채점 기준에 따른 감점 요인을 구체적으로 반영해야 합니다.\n"
        "3. feedback_myanmar 필드에는 학생이 이해할 수 있도록 미얀마어(မြန်မာဘာသာ)로 "
        "상세한 피드백을 작성해야 합니다. 잘한 점과 감점 이유를 구체적으로 설명하십시오.\n"
        "4. improvement_tips 필드에는 미얀마어로 작성된 구체적인 개선 방법을 "
        "한 개 이상의 항목으로 작성하십시오.\n"
        "5. 채점은 공정하고 일관되게, 오직 위 채점 기준에 근거해서만 수행하십시오."
    )


def build_human_prompt(question_prompt: str, user_answer: str) -> str:
    return (
        "다음은 학생에게 주어진 문제입니다:\n"
        "---\n"
        f"{question_prompt}\n"
        "---\n\n"
        "다음은 학생이 작성한 답안입니다:\n"
        "---\n"
        f"{user_answer}\n"
        "---\n\n"
        "위 채점 기준에 따라 이 답안을 채점하고, 구조화된 형식으로 결과를 반환하십시오."
    )
