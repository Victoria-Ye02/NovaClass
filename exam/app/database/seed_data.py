"""Sample TOPIK II seed questions and auto-seeding for empty ChromaDB collections.

Questions below are original practice items written in the TOPIK II style
(not reproductions of official exam content), meant to exercise the
retrieval and grading pipeline during development.
"""

from __future__ import annotations

import json
from typing import Any

from app.database.vector_db import add_questions, collection_is_empty, init_collections

# ---------------------------------------------------------------------------
# Reading: Q1-Q4 (grammar category)
# ---------------------------------------------------------------------------

READING_QUESTIONS: list[dict[str, Any]] = [
    {
        "id": "reading_q1",
        "document": (
            "다음 ( )에 들어갈 가장 알맞은 것을 고르십시오.\n"
            "어제 비가 많이 ( ) 우산을 가지고 나갔습니다.\n"
            "① 오고 ② 와서 ③ 오면 ④ 오지만"
        ),
        "metadata": {
            "question_number": 1,
            "question_type": "grammar",
            "difficulty": "beginner",
            "points": 2,
            "options": json.dumps(["오고", "와서", "오면", "오지만"], ensure_ascii=False),
            "correct_option": 2,
            "answer": "② 와서",
            "explanation": (
                "'-아서/어서' သည် အကြောင်းပြချက်ကို ဖော်ပြသည့် ဝါကျဆက်ပုံစံဖြစ်သည်။ "
                "ဤဝါကျတွင် မိုးရွာသောကြောင့် ထီးယူသွားခဲ့ခြင်းဖြစ်၍ '오다 + 아서 → 와서' "
                "မှန်ကန်ပါသည်။ '-고' သည် ရိုးရိုးအစဉ်လိုက်ဖော်ပြခြင်းသာဖြစ်ပြီး "
                "အကြောင်းပြချက်ကို မဖော်ပြပါ။"
            ),
        },
    },
    {
        "id": "reading_q2",
        "document": (
            "다음 ( )에 들어갈 가장 알맞은 것을 고르십시오.\n"
            "저는 한국 음식을 좋아하( ) 매운 음식은 잘 못 먹습니다.\n"
            "① -고 ② -는데 ③ -어서 ④ -으면"
        ),
        "metadata": {
            "question_number": 2,
            "question_type": "grammar",
            "difficulty": "beginner",
            "points": 2,
            "options": json.dumps(["-고", "-는데", "-어서", "-으면"], ensure_ascii=False),
            "correct_option": 2,
            "answer": "② -는데",
            "explanation": (
                "'-는데' သည် နောက်ဝါကျအတွက် ဆန့်ကျင်ဘက် (သို့) နောက်ခံအခြေအနေကို ပြသသည့် "
                "ပုံစံဖြစ်သည်။ ဤနေရာတွင် ကိုရီးယားအစားအစာကို နှစ်သက်သော်လည်း စပ်သောအစားအစာကို "
                "မစားနိုင်ခြင်း ဆန့်ကျင်ဘက်ဆက်စပ်မှုကို ပြသရန် '-는데' မှန်ကန်ပါသည်။"
            ),
        },
    },
    {
        "id": "reading_q3",
        "document": (
            "다음 밑줄 친 부분과 의미가 가장 비슷한 것을 고르십시오.\n"
            "내일 시험이 있어서 오늘 밤에 공부를 【할 것 같습니다】.\n"
            "① 할 생각입니다 ② 할 모양입니다 ③ 할 계획입니다 ④ 할 리가 없습니다"
        ),
        "metadata": {
            "question_number": 3,
            "question_type": "grammar",
            "difficulty": "intermediate",
            "points": 2,
            "options": json.dumps(
                ["할 생각입니다", "할 모양입니다", "할 계획입니다", "할 리가 없습니다"],
                ensure_ascii=False,
            ),
            "correct_option": 2,
            "answer": "② 할 모양입니다",
            "explanation": (
                "'-(으)ㄹ 것 같다' သည် ခန့်မှန်းချက်ကို ဖော်ပြပြီး '-(으)ㄹ 모양이다' သည်လည်း "
                "သက်သေအထောက်အထားအပေါ်အခြေခံသော ခန့်မှန်းချက်ကို ဖော်ပြသောကြောင့် "
                "အဓိပ္ပါယ်နီးစပ်ဆုံးဖြစ်ပါသည်။ '생각이다'နှင့် '계획이다' တို့မှာ ရည်ရွယ်ချက်ကို "
                "ဆိုလိုပြီး၊ '리가 없다' မှာ 'ဖြစ်နိုင်ခြေမရှိ' ဟု ဆိုလိုသဖြင့် မတူညီပါ။"
            ),
        },
    },
    {
        "id": "reading_q4",
        "document": (
            "다음 밑줄 친 부분과 의미가 가장 비슷한 것을 고르십시오.\n"
            "친구가 도와준 덕분에 이사를 【쉽게 끝낼 수 있었습니다】.\n"
            "① 쉽게 끝낼 뻔했습니다 ② 쉽게 끝낼 수밖에 없었습니다 "
            "③ 쉽게 끝내고 말았습니다 ④ 쉽게 끝낼 수 있게 되었습니다"
        ),
        "metadata": {
            "question_number": 4,
            "question_type": "grammar",
            "difficulty": "intermediate",
            "points": 2,
            "options": json.dumps(
                [
                    "쉽게 끝낼 뻔했습니다",
                    "쉽게 끝낼 수밖에 없었습니다",
                    "쉽게 끝내고 말았습니다",
                    "쉽게 끝낼 수 있게 되었습니다",
                ],
                ensure_ascii=False,
            ),
            "correct_option": 4,
            "answer": "④ 쉽게 끝낼 수 있게 되었습니다",
            "explanation": (
                "'-(으)ㄹ 수 있었다' သည် ဖြစ်နိုင်စွမ်းရှိခဲ့ခြင်းကို ဖော်ပြပြီး '-게 되었다' "
                "သည်လည်း အခြေအနေတစ်ခုသို့ ရောက်ရှိလာခြင်းကို ဖော်ပြသောကြောင့် ဆီလျော်ဆုံးဖြစ်သည်။ "
                "ကျန်ရွေးချယ်စရာများသည် 'မတော်တဆဖြစ်မိခြင်း'၊ 'မလွှဲမရှောင်သာမှု'၊ "
                "'မလိုလားအပ်ဘဲဖြစ်ပျက်ခြင်း' ကို ဆိုလိုသောကြောင့် မှန်ကန်မှုမရှိပါ။"
            ),
        },
    },
]

# ---------------------------------------------------------------------------
# Writing: Q51-Q54
# ---------------------------------------------------------------------------

WRITING_QUESTIONS: list[dict[str, Any]] = [
    {
        "id": "writing_q51",
        "document": (
            "다음을 읽고 ( ㄱ )과 ( ㄴ )에 들어갈 말을 각각 한 문장으로 쓰십시오.\n"
            "수미 씨,\n"
            "내일 회의 자료를 준비하고 있는데 프린터가 고장 났어요. "
            "혹시 사무실에 있는 프린터를 좀 ( ㄱ )? 회의는 오후 2시에 시작하니까 "
            "그 전에 ( ㄴ ). 부탁드려요.\n"
            "민호 올림"
        ),
        "metadata": {
            "question_number": 51,
            "question_type": "short_completion",
            "difficulty": "intermediate",
            "points": 10,
            "answer": json.dumps(
                {"ㄱ": "빌릴 수 있을까요", "ㄴ": "출력을 끝내야 해요"}, ensure_ascii=False
            ),
            "explanation": (
                "51번은 실용문(메모/메시지) 완성 문제로, 상황과 격식에 맞는 표현을 써야 합니다။ "
                "ဤစာသည် လုပ်ဖော်ကိုင်ဖက်ကို တောင်းဆိုသည့် စာတိုဖြစ်၍ ယဉ်ကျေးသော "
                "'-(으)ㄹ 수 있을까요?' ကဲ့သို့သော ပုံစံကို ( ㄱ )တွင်၊ အချိန်ကန့်သတ်ချက်နှင့် "
                "ဆက်စပ်သော လိုအပ်ချက်ကို ( ㄴ )တွင် ရေးရပါမည်။ စာလုံးပေါင်း၊ တစ်ဝါကျ "
                "ဖြင့်သာ ဖြေရန်နှင့် ရှေ့နောက်စာသားနှင့် ကိုက်ညီရန် အရေးကြီးပါသည်။"
            ),
        },
    },
    {
        "id": "writing_q52",
        "document": (
            "다음을 읽고 ( ㄱ )과 ( ㄴ )에 들어갈 말을 각각 한 문장으로 쓰십시오.\n"
            "물은 온도에 따라 상태가 달라진다. 온도가 낮아지면 물은 얼음이 ( ㄱ ). "
            "반대로 온도가 높아지면 물은 수증기로 ( ㄴ )."
        ),
        "metadata": {
            "question_number": 52,
            "question_type": "short_completion",
            "difficulty": "intermediate",
            "points": 10,
            "answer": json.dumps({"ㄱ": "된다", "ㄴ": "변한다"}, ensure_ascii=False),
            "explanation": (
                "52번은 설명문 완성 문제로, 객관적이고 격식 있는 문어체(-ㄴ/는다체)를 "
                "써야 합니다။ ဤစာသည် ရေ၏ အခြေအနေပြောင်းလဲမှုအကြောင်း ရှင်းပြသည့် "
                "ပညာရပ်ဆိုင်ရာစာဖြစ်၍ '-ㄴ다/는다' ပုံစံ (ဥပမာ '된다', '변한다') ကိုသာ "
                "အသုံးပြုရပါမည်။ စကားပြောဆန်သော '-아요/어요' ပုံစံများကို "
                "ရှောင်ရှားသင့်ပါသည်။"
            ),
        },
    },
    {
        "id": "writing_q53",
        "document": (
            "다음은 '20대의 여가 활동'에 대한 설문 조사 결과입니다. "
            "이 자료를 참고하여 200~300자로 글을 쓰십시오.\n"
            "(조사 기관: 문화체육관광부, 조사 대상: 20대 남녀 500명)\n"
            "1위: 영화 관람(35%), 2위: 게임(28%), 3위: 운동(20%), 기타(17%)"
        ),
        "metadata": {
            "question_number": 53,
            "question_type": "chart_essay",
            "difficulty": "advanced",
            "points": 30,
            "answer": (
                "문화체육관광부에서 20대 남녀 500명을 대상으로 여가 활동에 대해 조사한 결과, "
                "1위는 영화 관람으로 35%를 차지했다. 그 뒤를 이어 게임이 28%, 운동이 20%로 "
                "나타났으며, 기타 응답은 17%였다. 이를 통해 20대는 정적인 여가 활동을 "
                "선호하는 경향이 있음을 알 수 있다."
            ),
            "explanation": (
                "53번은 도표/그래프 자료를 객관적으로 설명하는 글쓰기입니다။ "
                "'-에 따르면', '1위는 ~, 2위는 ~' 등 순위·수치 표현을 사용하고, "
                "ကိုယ်ပိုင်အမြင်မထည့်ဘဲ ဇယား/ဂရပ်ဖ်ပါ အချက်အလက်ကိုသာ "
                "ဓမ္မဓိဋ္ဌာန်ကျစွာ ဖော်ပြရပါမည်။ စာလုံးရေ 200-300 အတွင်း၊ "
                "ပုံမှန်ဝါကျဖွဲ့စည်းပုံနှင့် ရေးဟန်တင်းကျပ်မှု (문어체) ကို "
                "ထိန်းသိမ်းရန် လိုအပ်ပါသည်။"
            ),
        },
    },
    {
        "id": "writing_q54",
        "document": (
            "다음을 주제로 하여 자신의 생각을 600~700자로 글을 쓰십시오.\n"
            "'현대 사회에서 인공지능(AI)의 발전은 우리의 삶에 긍정적인 영향과 "
            "부정적인 영향을 모두 미치고 있다. AI 발전이 미치는 영향에 대한 "
            "자신의 생각을 쓰고, 이에 대한 근거를 제시하십시오.'"
        ),
        "metadata": {
            "question_number": 54,
            "question_type": "opinion_essay",
            "difficulty": "advanced",
            "points": 50,
            "answer": (
                "서론: AI 발전의 배경과 논제 제시 / "
                "본론: 긍정적 영향(생산성 향상, 편의성 증대)과 부정적 영향"
                "(일자리 감소, 개인정보 문제)을 근거와 함께 설명 / "
                "결론: 균형 잡힌 시각과 대응 방안 제시"
            ),
            "explanation": (
                "54번은 사회적 주제에 대한 논설문 쓰기로 채점 기준은 "
                "①내용 및 과제 수행 ②글의 전개 구조 ③언어 사용 3가지입니다။ "
                "ဝေါဟာရအသုံးအနှုန်း (AI, 인공지능 စသည်) ကို မှန်ကန်စွာသုံးပြီး "
                "'서론-본론-결론' ဖွဲ့စည်းပုံအတိုင်း စနစ်တကျ ရေးသားရမည်။ "
                "ကိုယ်ပိုင်အမြင်ကို ဖော်ပြရာတွင် အထောက်အထား/ဥပမာများဖြင့် "
                "ခိုင်မာစွာ ထောက်ခံရပြီး၊ စာလုံးရေ 600-700 ဘောင်အတွင်း "
                "ထိန်းသိမ်းရန် အရေးကြီးပါသည်။"
            ),
        },
    },
]


def seed_reading(force: bool = False) -> int:
    if not force and not collection_is_empty("reading"):
        return 0
    add_questions(
        domain="reading",
        ids=[q["id"] for q in READING_QUESTIONS],
        documents=[q["document"] for q in READING_QUESTIONS],
        metadatas=[q["metadata"] for q in READING_QUESTIONS],
    )
    return len(READING_QUESTIONS)


def seed_writing(force: bool = False) -> int:
    if not force and not collection_is_empty("writing"):
        return 0
    add_questions(
        domain="writing",
        ids=[q["id"] for q in WRITING_QUESTIONS],
        documents=[q["document"] for q in WRITING_QUESTIONS],
        metadatas=[q["metadata"] for q in WRITING_QUESTIONS],
    )
    return len(WRITING_QUESTIONS)


def seed_if_empty() -> dict[str, int]:
    """Seed any TOPIK collection that is currently empty. Safe to call on every app startup."""
    init_collections()
    return {
        "reading": seed_reading(),
        "writing": seed_writing(),
    }


if __name__ == "__main__":
    counts = seed_if_empty()
    for domain, count in counts.items():
        status = f"seeded {count} questions" if count else "already populated, skipped"
        print(f"[{domain}] {status}")
