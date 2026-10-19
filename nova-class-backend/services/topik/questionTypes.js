// The TOPIK II question types a student can practise, and the three difficulty levels. This is the single list the
// quiz generator, the API (GET /api/kmate/quiz/options) and the screen all use. `format` tells the model what the
// real exam question looks like; `level` says how hard it should be.
const QUESTION_TYPES = [
  { key: "grammar_fill_in", label: "Grammar fill-in", ko: "문법 빈칸", skill: "grammar",
    description: "Choose the grammar form that fits the blank in a sentence.",
    format: "a one- or two-sentence text with a blank ( ); the four options are grammar forms (endings, connectives or particles) and only one fits." },
  { key: "similar_meaning", label: "Similar meaning", ko: "의미가 비슷한 표현", skill: "grammar",
    description: "Choose the expression closest in meaning to the underlined part.",
    format: "a sentence with one expression marked with [ ]; the four options are expressions, and only one means about the same as the marked one." },
  { key: "vocabulary_in_context", label: "Vocabulary in context", ko: "어휘 빈칸", skill: "vocabulary",
    description: "Choose the word that fits the sentence.",
    format: "a sentence with a blank ( ); the four options are words that look or sound close, and only one fits the meaning." },
  { key: "sentence_order", label: "Sentence order", ko: "문장 순서", skill: "reading",
    description: "Put four sentences in the right order.",
    format: "four sentences marked (가) (나) (다) (라) that form a short passage; the four options are orders such as 가-나-다-라, and only one is logical." },
  { key: "main_idea", label: "Main idea", ko: "중심 내용", skill: "reading",
    description: "Choose what the passage is mainly about.",
    format: "a short passage of three to five sentences; the four options are statements, and only one is the main idea." },
  { key: "news_headline", label: "Headline", ko: "신문 기사 제목", skill: "reading",
    description: "Choose the headline that matches the article.",
    format: "a short news-style paragraph of three or four sentences; the four options are newspaper headlines, and only one summarises the article.",
    // Real TOPIK headlines are compact noun phrases, not sentences. Without this the model writes full sentences.
    styleRules: "HEADLINE STYLE (strict, like the real exam): every option is ONE noun phrase of about 8-25 characters. It must NOT end with a verb or a sentence ending (no -다, -요, -ㅂ니다, -았/었다, -는다): end with a noun or a noun form (-기, -함, -화, -성, -세, -률) or with a bare stem as newspapers do. Particles may be dropped. Two facts may be joined with '…' or ','. Use numbers and quotation marks the way newspapers do. Good: '청년 일자리 3만 개 늘어… 지방은 \'구인난\'', '금리 동결에 가계 대출 증가세 주춤', '폭염에 전력 수요 역대 최고'. Bad: '청년 일자리가 3만 개 늘었습니다', '정부가 지원을 확대한다'.",
    levelNotes: {
      easy: "Use everyday news topics (weather, sports, school, prices) and common nouns; the wrong headlines are about clearly different things.",
      medium: "Use society and economy topics; the wrong headlines change one fact (a number, a place or who did it).",
      hard: "Use abstract topics (economy, policy, environment, science) and Sino-Korean compound nouns. The correct headline must need inference, not repeat the paragraph's own words. Every wrong headline has the SAME compact shape and sounds plausible but distorts exactly one nuance: cause versus result, increase versus decrease, scope (all versus some), or who is affected.",
    } },
  { key: "notice_sign", label: "Notices & signs", ko: "안내문·표지판", skill: "reading",
    description: "Read a sign or notice and choose what it is for.",
    format: "the text of a short notice, sign or advertisement; the four options say where it would be seen or what it asks people to do." },
  { key: "detail_match", label: "Matching details", ko: "일치하는 내용", skill: "reading",
    description: "Choose the statement that matches the text.",
    format: "a short text with several concrete facts; the four options are statements about it, and only one matches the text." },
];

const DIFFICULTIES = [
  { key: "easy", label: "Easy", level: "about TOPIK level 3: common everyday vocabulary and basic grammar; short sentences; wrong options that are clearly different." },
  { key: "medium", label: "Medium", level: "about TOPIK level 4: everyday and some formal topics, intermediate grammar and connectives; wrong options that look plausible." },
  { key: "hard", label: "Hard", level: "about TOPIK level 5-6: abstract or formal topics, advanced grammar and idioms, longer sentences; wrong options that differ only in a nuance." },
];

const typeByKey = key => QUESTION_TYPES.find(t => t.key === key) || null;
const difficultyByKey = key => DIFFICULTIES.find(d => d.key === key) || null;

// What the screen needs: no prompt text, just names.
// `format` / `styleRules` / `levelNotes` are for the model; the screen only gets names and descriptions.
const publicOptions = () => ({
  types: QUESTION_TYPES.map(({ key, label, ko, skill, description }) => ({ key, label, ko, skill, description })),
  difficulties: DIFFICULTIES.map(({ key, label }) => ({ key, label })),
});

module.exports = { QUESTION_TYPES, DIFFICULTIES, typeByKey, difficultyByKey, publicOptions };
