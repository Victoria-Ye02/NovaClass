"""Integration tests for the TOPIK exam workflow: seed data, generation, submission, and
AI-generated Myanmar-language output.

Isolation: every test runs against a temp ChromaDB path + temp SQLite DB (via the
`isolated_db` fixture), never the real dev data under ./data/.

LLM calls: `grade_writing` and the study-plan LLM are mocked with deterministic,
realistic Myanmar-language canned responses (via the `mock_llms` fixture) so the suite
is fast, offline, and 100%-reproducible without a real OPENROUTER_API_KEY. A small
opt-in live test at the bottom exercises the real OpenRouter-backed grader when
OPENROUTER_API_KEY is set, but is skipped otherwise so it never affects default runs.
"""

from __future__ import annotations

import json
import os
import re

import pytest
from fastapi.testclient import TestClient

import app.database.vector_db as vdb
from app.database import models as db_models
from app.database import seed_data
from app.prompts.writing_grading import get_max_score
from app.schemas.analytics import DailyFocus, StudyPlanLLMOutput
from app.schemas.writing import WritingEvaluationResult
from app.services.analytics import MAX_EXPLANATIONS_PER_SECTION, _has_stray_script_characters
from app.services.exam_generator import BLUEPRINTS

MYANMAR_UNICODE_RANGE = (0x1000, 0x109F)


def is_myanmar_text(text: str, min_chars: int = 5) -> bool:
    """Heuristic proxy for "is meaningful Myanmar-script content".

    Automated fluency grading isn't feasible without a human or LLM-judge review; this
    checks the practical, checkable half of the requirement: the response is genuinely
    Myanmar script (not empty, not a stray placeholder) and of non-trivial length.
    """
    myanmar_chars = [c for c in text if MYANMAR_UNICODE_RANGE[0] <= ord(c) <= MYANMAR_UNICODE_RANGE[1]]
    return len(myanmar_chars) >= min_chars


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def isolated_db(tmp_path, monkeypatch):
    """Redirect ChromaDB + SQLite to a temp path so tests never touch dev data."""
    monkeypatch.setattr(vdb, "CHROMA_DB_PATH", tmp_path / "chroma_db")
    monkeypatch.setattr(vdb, "_client", None)  # force a fresh client bound to the temp path

    engine = db_models.create_engine(
        f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False}
    )
    monkeypatch.setattr(db_models, "engine", engine)
    monkeypatch.setattr(db_models, "SessionLocal", db_models.sessionmaker(bind=engine))
    db_models.Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture()
def db_session(isolated_db):
    session = db_models.SessionLocal()
    yield session
    session.close()


@pytest.fixture()
def test_user(db_session):
    user = db_models.User(email="student@example.com", display_name="Test Student")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def question_bank(isolated_db):
    """Seed exactly enough Reading/Listening questions to satisfy the exam blueprint,
    plus the project's real Writing seed data (which already matches the Q51-Q54
    blueprint exactly)."""
    for domain in ("reading", "listening"):
        ids, docs, metas = [], [], []
        for slot in BLUEPRINTS[domain]:
            slot_numbers = list(slot.question_numbers())
            for i in range(slot.count):
                qid = f"{domain}_{slot.question_type}_{i}"
                ids.append(qid)
                docs.append(f"[{slot.question_type}] sample {domain} question {i}")
                meta = {
                    "question_type": slot.question_type,
                    "question_number": slot_numbers[i],
                    "difficulty": "intermediate",
                    "points": slot.points,
                    "options": json.dumps(["가", "나", "다", "라"], ensure_ascii=False),
                    "correct_option": 1,
                }
                if domain == "listening":
                    meta["audio_url"] = f"https://cdn.example.com/audio/{qid}.mp3"
                    meta["audio_duration_sec"] = 30.0
                metas.append(meta)
        vdb.add_questions(domain, ids, docs, metas)

    seed_data.seed_writing(force=True)
    yield


def _fake_grade_writing(request):
    max_score = get_max_score(request.question_number)
    return WritingEvaluationResult(
        total_score=round(max_score * 0.8),
        max_score=max_score,
        grammar_vocab_score=round(max_score * 0.3),
        structure_score=round(max_score * 0.3),
        content_score=round(max_score * 0.2),
        feedback_myanmar=(
            "ကျောင်းသားသည် သဒ္ဒါနှင့်ဝေါဟာရအသုံးအနှုန်းများကို ကောင်းစွာအသုံးပြုနိုင်ပြီး "
            "မေးခွန်း၏ အဓိကရည်ရွယ်ချက်ကိုလည်း မှန်ကန်စွာ ဖြေဆိုနိုင်ခဲ့ပါသည်။ သို့သော် "
            "စာကြောင်းဆက်စပ်မှုကို အနည်းငယ်ပိုမိုတိကျအောင် ပြင်ဆင်သင့်ပါသည်။"
        ),
        improvement_tips=[
            "စာလုံးရေကန့်သတ်ချက်ကို ပိုမိုတိကျစွာလိုက်နာပါ။",
            "ဝါကျဆက်စပ်မှုအတွက် ဆက်စပ်ပုဒ်များကို ပိုမိုကျယ်ပြန့်စွာသုံးပါ။",
        ],
    )


def _fake_study_plan_output() -> StudyPlanLLMOutput:
    return StudyPlanLLMOutput(
        level_strategy=(
            "လက်ရှိအဆင့်အရ TOPIK ၄ ကျော့ကို ပစ်မှတ်ထားရန် အကြံပြုပါသည်။ "
            "နေ့စဉ် သဒ္ဒါနှင့်ဝေါဟာရကို အားဖြည့်ပြီး ဖတ်ရှုနားလည်မှုအားနည်းချက်ကို "
            "ဦးစားပေးဖြေရှင်းသင့်ပါသည်။"
        ),
        weekly_plan=[
            DailyFocus(
                day=d,
                focus_topic=f"{d}ရက်မြောက်: သဒ္ဒါနှင့်ဖတ်ရှုနားလည်မှု အားဖြည့်ခြင်း",
                grammar_points=["-(으)ㄴ/는데", "-(으)ㄹ 것 같다"],
                vocabulary_focus="နေ့စဉ်သုံးဝေါဟာရများနှင့် ခံစားချက်ဆိုင်ရာအသုံးအနှုန်းများ",
                practice_task="ဖတ်ရှုနားလည်မှု လေ့ကျင့်ခန်း ၅ ခုနှင့် သဒ္ဒါစာလုံးပြန်လှန်ခြင်း",
            )
            for d in range(1, 8)
        ],
        summary_myanmar=(
            "တစ်ပတ်တာကာလအတွင်း အားနည်းချက်များကို ဦးစားပေးလေ့ကျင့်ပါက TOPIK စာမေးပွဲတွင် "
            "သိသိသာသာတိုးတက်လာမည်ဖြစ်ပါသည်။ ဇွဲရှိရှိဆက်လက်ကြိုးစားပါ။"
        ),
    )


class _FakeStudyPlanLLM:
    def invoke(self, messages):
        return _fake_study_plan_output()


class _FakeExplanationLLM:
    """Echoes back a canned Myanmar explanation for every question_id found in the prompt,
    so the zip-by-question_id logic in _generate_mc_explanations is exercised for real."""

    def invoke(self, messages):
        import app.services.analytics as analytics

        human_prompt = messages[1]["content"]
        question_ids = re.findall(r"question_id: (\S+)", human_prompt)
        return analytics._MCExplanationBatch(
            explanations=[
                analytics._MCExplanationItem(
                    question_id=qid,
                    correct_answer_explanation_myanmar="မှန်ကန်သောအဖြေနှင့် အကြောင်းရင်း နမူနာရှင်းလင်းချက်။",
                    wrong_answer_explanation_myanmar="ရွေးချယ်ထားသောအဖြေ (သို့) အဖြေမရှိခြင်း မှားယွင်းရသည့် အကြောင်းရင်း။",
                    grammar_vocab_focus_myanmar="ဤမေးခွန်း၏ အဓိကသဒ္ဒါနှင့်ဝေါဟာရ အာရုံစိုက်ရန် အချက်။",
                )
                for qid in question_ids
            ]
        )


@pytest.fixture()
def mock_llms(monkeypatch):
    """Replace all LLM calls with deterministic, realistic Myanmar-language canned responses."""
    import app.routers.writing as writing_router
    import app.services.analytics as analytics

    monkeypatch.setattr(analytics, "grade_writing", _fake_grade_writing)
    monkeypatch.setattr(writing_router, "grade_writing", _fake_grade_writing)
    monkeypatch.setattr(analytics, "_study_plan_llm", _FakeStudyPlanLLM())
    monkeypatch.setattr(analytics, "_explanation_llm", _FakeExplanationLLM())
    yield


@pytest.fixture()
def client(question_bank, mock_llms):
    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c


@pytest.fixture()
def generated_exam(client, test_user):
    response = client.post("/api/exam/generate", json={"user_id": test_user.id})
    assert response.status_code == 200, response.text
    return {"user": test_user, "paper": response.json()}


# ---------------------------------------------------------------------------
# 0. Explanation-text script validation (guards against LLM script-substitution
#    glitches, e.g. Gemini once wrote Gujarati "મોરે" instead of Korean "모래")
# ---------------------------------------------------------------------------


def test_has_stray_script_characters_detects_non_korean_myanmar_script():
    # A real observed glitch: "모래" (Korean "sand") replaced with the Gujarati word "મોરે".
    glitched = "머리를 મોરે에 파묻는 이유는 '적의 움직임을 알기 위해'가 맞습니다."
    assert _has_stray_script_characters(glitched) is True

    clean_myanmar = "မှန်ကန်သောအဖြေမှာ ① '온 지' ဖြစ်ပါသည်။ (한국어 인용 가능, ①②③④, ㉠㉡)"
    assert _has_stray_script_characters(clean_myanmar) is False


# ---------------------------------------------------------------------------
# 1. ChromaDB seed data insertion and retrieval
# ---------------------------------------------------------------------------


def test_seed_data_insertion_and_retrieval(isolated_db):
    counts = seed_data.seed_if_empty()
    assert counts == {"reading": 4, "writing": 4}

    assert vdb.get_collection("reading").count() == 4
    assert vdb.get_collection("writing").count() == 4
    assert vdb.get_collection("listening").count() == 0  # not seeded, by design

    # idempotent: re-running should skip already-seeded collections, no duplicates
    counts_again = seed_data.seed_if_empty()
    assert counts_again == {"reading": 0, "writing": 0}
    assert vdb.get_collection("reading").count() == 4

    # retrieval by exact metadata filter
    grammar_qs = vdb.get_questions_by_filter("reading", question_type="grammar", difficulty="beginner")
    assert set(grammar_qs["ids"]) == {"reading_q1", "reading_q2"}
    for metadata in grammar_qs["metadatas"]:
        assert metadata["question_type"] == "grammar"
        assert metadata["difficulty"] == "beginner"

    # retrieval by id
    fetched = vdb.get_questions_by_ids("writing", ["writing_q53", "writing_q54"])
    assert set(fetched["ids"]) == {"writing_q53", "writing_q54"}
    points_by_id = dict(zip(fetched["ids"], (m["points"] for m in fetched["metadatas"])))
    assert points_by_id == {"writing_q53": 30, "writing_q54": 50}

    # the full writing seed set matches CLAUDE.md's official point values (Q51-54)
    all_writing = vdb.get_questions_by_filter("writing", limit=10)
    points_by_question_number = {m["question_number"]: m["points"] for m in all_writing["metadatas"]}
    assert points_by_question_number == {51: 10, 52: 10, 53: 30, 54: 50}

    # semantic search retrieval works and returns ranked, relevant ids
    search_result = vdb.search_questions("reading", "문법 표현을 고르는 문제", n_results=2)
    assert len(search_result["ids"][0]) == 2
    assert all(qid.startswith("reading_") for qid in search_result["ids"][0])


# ---------------------------------------------------------------------------
# 2. /api/exam/generate returns correct question structure
# ---------------------------------------------------------------------------


def test_exam_generate_returns_correct_structure(generated_exam):
    paper = generated_exam["paper"]

    assert paper["total_questions"] == 104
    assert paper["total_points"] == 300.0

    sections_by_name = {s["name"]: s for s in paper["sections"]}
    assert sections_by_name["reading"]["question_count"] == 50
    assert sections_by_name["reading"]["total_points"] == 100.0
    assert sections_by_name["listening"]["question_count"] == 50
    assert sections_by_name["listening"]["total_points"] == 100.0
    assert sections_by_name["writing"]["question_count"] == 4
    assert sections_by_name["writing"]["total_points"] == 100.0

    reading_numbers = sorted(q["question_number"] for q in sections_by_name["reading"]["questions"])
    assert reading_numbers == list(range(1, 51))
    listening_numbers = sorted(q["question_number"] for q in sections_by_name["listening"]["questions"])
    assert listening_numbers == list(range(1, 51))
    writing_numbers = sorted(q["question_number"] for q in sections_by_name["writing"]["questions"])
    assert writing_numbers == [51, 52, 53, 54]

    # correct answers/explanations must never leak into the response
    raw_payload = json.dumps(paper, ensure_ascii=False)
    assert "correct_option" not in raw_payload
    assert '"answer"' not in raw_payload
    assert '"explanation"' not in raw_payload

    for question in sections_by_name["reading"]["questions"]:
        assert question["options"] is not None and len(question["options"]) == 4
        assert question["prompt"]
        assert question["audio"] is None

    for question in sections_by_name["listening"]["questions"]:
        assert question["audio"] is not None
        assert question["audio"]["url"]

    for question in sections_by_name["writing"]["questions"]:
        assert question["options"] is None
        assert question["prompt"]


# ---------------------------------------------------------------------------
# 3. /api/exam/submit with mock student responses (incl. Q51-Q54), verify AI scoring
# ---------------------------------------------------------------------------


def test_exam_submit_scores_and_logs_answers(client, generated_exam, db_session):
    user = generated_exam["user"]
    paper = generated_exam["paper"]
    sections_by_name = {s["name"]: s for s in paper["sections"]}

    reading_questions = sections_by_name["reading"]["questions"]
    listening_questions = sections_by_name["listening"]["questions"]
    writing_questions = sections_by_name["writing"]["questions"]

    # alternate correct(=1)/wrong(=2) reading answers; all questions have correct_option=1.
    # The earliest question (i=1, would've been wrong anyway) is held back and submitted
    # as unanswered instead, to exercise the unanswered-question path without changing the
    # expected correct_count/total_questions below. Holding back the *earliest* wrong one
    # (rather than the last) guarantees it lands inside the explanation cap below regardless
    # of MAX_EXPLANATIONS_PER_SECTION's exact value.
    unanswered_reading_id = reading_questions[1]["id"]
    reading_answers = [
        {"question_id": q["id"], "question_number": q["question_number"], "selected_option": 1 if i % 2 == 0 else 2}
        for i, q in enumerate(reading_questions)
        if q["id"] != unanswered_reading_id
    ]
    listening_answers = [
        {"question_id": q["id"], "question_number": q["question_number"], "selected_option": 1}
        for q in listening_questions
    ]
    writing_answers = [
        {
            "question_id": q["id"],
            "question_number": q["question_number"],
            "user_answer": f"학생이 {q['question_number']}번 문제에 대해 작성한 답안입니다.",
        }
        for q in writing_questions
    ]

    submit_payload = {
        "exam_id": paper["exam_id"],
        "user_id": user.id,
        "reading_answers": reading_answers,
        "reading_unanswered_ids": [unanswered_reading_id],
        "listening_answers": listening_answers,
        "writing_answers": writing_answers,
    }

    response = client.post("/api/exam/submit", json=submit_payload)
    assert response.status_code == 200, response.text
    result = response.json()

    assert result["exam_id"] == paper["exam_id"]
    assert result["max_score"] == 300.0

    section_by_name = {s["section"]: s for s in result["sections"]}
    assert section_by_name["reading"]["total_questions"] == 50
    assert section_by_name["reading"]["correct_count"] == 25
    assert section_by_name["listening"]["correct_count"] == 50
    assert section_by_name["writing"]["total_questions"] == 4

    # AI (mocked) scoring output: 80% of each writing question's max score
    expected_writing_score = sum(round(get_max_score(q["question_number"]) * 0.8) for q in writing_questions)
    assert section_by_name["writing"]["total_score"] == expected_writing_score

    # 25 reading questions ended up wrong/unanswered -- more than MAX_EXPLANATIONS_PER_SECTION,
    # so explanation generation should have been capped, with exactly one warning about it
    # (listening had zero wrong answers, so no warning there).
    assert len(result["warnings"]) == 1
    assert "reading" in result["warnings"][0] and "25" in result["warnings"][0]

    # question_reviews: one entry per reading question, correct/incorrect flagged. A (mocked)
    # Myanmar 3-part explanation is present on the earliest MAX_EXPLANATIONS_PER_SECTION
    # wrong/unanswered questions (by question_number) and absent on the rest -- both the
    # capped-out tail and every correct answer.
    reading_reviews = section_by_name["reading"]["question_reviews"]
    assert len(reading_reviews) == 50
    reviews_by_id = {r["question_id"]: r for r in reading_reviews}

    unanswered_review = reviews_by_id[unanswered_reading_id]
    assert unanswered_review["is_correct"] is False
    assert unanswered_review["user_answer"] is None
    assert unanswered_review["explanation"] is not None  # it's question_number 2, well inside the cap

    wrong_numbers_sorted = sorted(r["question_number"] for r in reading_reviews if not r["is_correct"])
    assert len(wrong_numbers_sorted) == 25
    explained_numbers = set(wrong_numbers_sorted[:MAX_EXPLANATIONS_PER_SECTION])

    for review in reading_reviews:
        if review["is_correct"] or review["question_number"] not in explained_numbers:
            assert review["explanation"] is None
        else:
            explanation = review["explanation"]
            assert explanation is not None
            assert is_myanmar_text(explanation["correct_answer_explanation"])
            assert is_myanmar_text(explanation["wrong_answer_explanation"])
            assert is_myanmar_text(explanation["grammar_vocab_focus"])

    # listening had zero wrong answers, so the explanation call should've been skipped
    # entirely -- every review present but none carrying an explanation.
    listening_reviews = section_by_name["listening"]["question_reviews"]
    assert len(listening_reviews) == 50
    assert all(r["explanation"] is None for r in listening_reviews)

    # the same explanations are persisted on QuestionLog, keyed by the new columns --
    # present only for the explained (within-cap) subset, absent for the capped-out rest.
    explained_ids = {r["question_id"] for r in reading_reviews if r["question_number"] in explained_numbers}
    wrong_reading_ids = [r["question_id"] for r in reading_reviews if not r["is_correct"]]
    reading_logs = (
        db_session.query(db_models.QuestionLog)
        .filter(db_models.QuestionLog.question_id.in_(wrong_reading_ids))
        .all()
    )
    assert len(reading_logs) == 25
    for log in reading_logs:
        if log.question_id in explained_ids:
            assert log.explanation_correct and is_myanmar_text(log.explanation_correct)
            assert log.explanation_wrong and is_myanmar_text(log.explanation_wrong)
            assert log.explanation_grammar and is_myanmar_text(log.explanation_grammar)
        else:
            assert log.explanation_correct is None
            assert log.explanation_wrong is None
            assert log.explanation_grammar is None

    expected_total = 25 * 2 + 50 * 2 + expected_writing_score
    assert result["total_score"] == expected_total

    # every writing answer produced a Myanmar AI feedback log entry, with correct scoring
    writing_q_by_id = {q["id"]: q for q in writing_questions}
    logs = (
        db_session.query(db_models.QuestionLog)
        .filter(db_models.QuestionLog.question_id.in_(writing_q_by_id.keys()))
        .all()
    )
    assert len(logs) == 4
    for log in logs:
        qnum = writing_q_by_id[log.question_id]["question_number"]
        assert log.ai_feedback and is_myanmar_text(log.ai_feedback)
        assert log.points_possible == get_max_score(qnum)
        assert log.points_earned == round(get_max_score(qnum) * 0.8)

    # ExamSession rows are linked back to the exam paper and sum to the reported total
    sessions = db_session.query(db_models.ExamSession).filter(db_models.ExamSession.user_id == user.id).all()
    assert len(sessions) == 3
    assert all(s.exam_paper_id == paper["exam_id"] for s in sessions)
    assert sum(s.total_score for s in sessions) == result["total_score"]


# ---------------------------------------------------------------------------
# 4. AI responses return valid, fluent Myanmar explanations
# ---------------------------------------------------------------------------


def test_ai_responses_are_myanmar(client, generated_exam):
    writing_questions = {s["name"]: s for s in generated_exam["paper"]["sections"]}["writing"]["questions"]
    q51 = next(q for q in writing_questions if q["question_number"] == 51)

    response = client.post(
        "/api/writing/grade-single",
        json={"question_number": 51, "question_prompt": q51["prompt"], "user_answer": "학생 답안 예시입니다."},
    )
    assert response.status_code == 200, response.text
    grading = response.json()
    assert is_myanmar_text(grading["feedback_myanmar"])
    assert grading["improvement_tips"]
    for tip in grading["improvement_tips"]:
        assert is_myanmar_text(tip, min_chars=3)

    user = generated_exam["user"]
    response = client.get(f"/api/user/{user.id}/analytics")
    assert response.status_code == 200, response.text
    study_plan = response.json()["study_plan"]

    assert is_myanmar_text(study_plan["level_strategy"])
    assert is_myanmar_text(study_plan["summary_myanmar"])
    assert len(study_plan["weekly_plan"]) == 7
    for day in study_plan["weekly_plan"]:
        assert is_myanmar_text(day["focus_topic"], min_chars=3)
        assert is_myanmar_text(day["vocabulary_focus"], min_chars=3)
        assert is_myanmar_text(day["practice_task"], min_chars=3)
        assert day["grammar_points"]  # Korean grammar patterns, not Myanmar text


# ---------------------------------------------------------------------------
# Optional live smoke test (not mocked) — only runs with a real OPENROUTER_API_KEY
# ---------------------------------------------------------------------------


@pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY"),
    reason="requires a real OPENROUTER_API_KEY for a live LLM call",
)
def test_live_writing_grader_produces_myanmar_feedback():
    from app.schemas.writing import WritingGradeRequest
    from app.services.writing_grader import grade_writing

    result = grade_writing(
        WritingGradeRequest(
            question_number=51,
            question_prompt=(
                "수미 씨, 내일 회의 자료를 준비하고 있는데 프린터가 고장 났어요. "
                "혹시 사무실에 있는 프린터를 좀 ( ㄱ )? 회의는 오후 2시에 시작하니까 "
                "그 전에 ( ㄴ ). 부탁드려요."
            ),
            user_answer="네, 제 프린터를 빌려 드릴 수 있어요. 회의 전에 출력을 끝내야 해요.",
        )
    )
    assert 0 <= result.total_score <= result.max_score
    assert is_myanmar_text(result.feedback_myanmar, min_chars=20)
    assert result.improvement_tips
