"""Prompt templates for the personalized 1-week TOPIK study plan."""

from __future__ import annotations

from app.schemas.analytics import WeaknessPattern


def build_system_prompt(recommended_level: int) -> str:
    return (
        "당신은 TOPIK 학습 코치입니다. 학생의 약점 분석 결과를 바탕으로 "
        "1주일(7일) 학습 계획을 세워야 합니다.\n"
        f"이 학생에게 권장하는 목표 등급은 TOPIK {recommended_level}급입니다.\n\n"
        "다음 규칙을 반드시 지키십시오:\n"
        f"1. level_strategy 필드에는 {recommended_level}급을 목표로 하는 구체적인 학습 전략을 "
        "미얀마어(မြန်မာဘာသာ)로 설명하십시오.\n"
        "2. weekly_plan 필드는 반드시 정확히 7일(1일차~7일차) 계획으로 구성하십시오. "
        "각 날짜의 focus_topic, grammar_points, vocabulary_focus, practice_task는 "
        "모두 미얀마어로 작성하고, 문법/어휘 항목은 구체적인 한국어 문법 표현이나 "
        "단어 주제를 포함하십시오 (예: '-(으)ㄴ 지 알다', '감정 표현 어휘').\n"
        "3. 학생이 가장 취약한 문항 유형을 학습 계획의 1~3일차에 집중적으로 배치하십시오.\n"
        "4. summary_myanmar 필드에는 전체 계획을 요약하고 학생을 격려하는 메시지를 "
        "미얀마어로 작성하십시오.\n"
    )


def build_human_prompt(
    weakest_patterns: list[WeaknessPattern],
    overall_accuracy: float,
    total_attempts: int,
) -> str:
    if weakest_patterns:
        weakness_lines = "\n".join(
            f"- {p.label} (영역: {p.skill_area}): 정답률 {p.accuracy:.0%} "
            f"({p.correct_count}/{p.attempts}문제)"
            for p in weakest_patterns
        )
    else:
        weakness_lines = "- 아직 충분한 시험 기록이 없어 구체적인 약점 문항 유형을 특정할 수 없습니다."

    return (
        f"학생의 전체 누적 정답률은 {overall_accuracy:.0%}이며, "
        f"지금까지 총 {total_attempts}문제를 풀었습니다.\n\n"
        "가장 취약한 문항 유형 (상위 3개):\n"
        f"{weakness_lines}\n\n"
        "위 정보를 바탕으로 이 학생을 위한 1주일 학습 계획을 세워주십시오."
    )
