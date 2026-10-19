// Study help for K-Mate TOPIK, written by the model once and kept in MySQL so the same page is never paid for twice:
//   - a STRATEGY GUIDE for each of the 8 question types, in the student's language
//   - a GRAMMAR EXPLANATION (rule, form, 3 example sentences) for any weak point, in the student's language
//   - a GRAMMAR SUMMARY (pattern, meaning, explanation, usage notes, one example) for any grammar point, strictly in the student's language
// All are looked up by (key, language); only a miss calls the model. The tables are created on first use.
const crypto = require("node:crypto");
const { typeByKey } = require("./questionTypes");

const TABLES = [
  `CREATE TABLE IF NOT EXISTS topik_strategy_guides (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type_key VARCHAR(40) NOT NULL,
    language VARCHAR(10) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_guide (type_key, language)
  )`,
  `CREATE TABLE IF NOT EXISTS topik_grammar_explanations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    point_key CHAR(40) NOT NULL,
    point VARCHAR(160) NOT NULL,
    language VARCHAR(10) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_point (point_key, language)
  )`,
  `CREATE TABLE IF NOT EXISTS topik_grammar_summaries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    point_key CHAR(40) NOT NULL,
    point VARCHAR(160) NOT NULL,
    language VARCHAR(10) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_summary (point_key, language)
  )`,
];

const LANGUAGES = { en: "English", ko: "Korean", my: "Burmese (Myanmar)", vi: "Vietnamese" };
const languageCode = value => (LANGUAGES[value] ? value : "en");

let ready = null;
function ensureTables(pool) {
  if (!ready) ready = TABLES.reduce((chain, sql) => chain.then(() => pool.query(sql)), Promise.resolve()).catch(err => { ready = null; throw err; });
  return ready;
}

const normalisePoint = point => String(point || "").replace(/\s+/g, " ").trim().slice(0, 160);
const pointKey = point => crypto.createHash("sha1").update(normalisePoint(point).toLowerCase()).digest("hex");

const toList = value => (Array.isArray(value) ? value.map(x => String(x).trim()).filter(Boolean) : []);

function parseJson(raw) {
  const text = String(raw || "").replace(/```json\s*/g, "").replace(/```\s*/g, "");
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
}

function cleanStrategy(raw) {
  const g = parseJson(raw);
  const guide = { overview: String(g.overview || "").trim(), steps: toList(g.steps), tips: toList(g.tips), mistakes: toList(g.mistakes) };
  if (!guide.overview || guide.steps.length === 0) throw new Error("The strategy guide came back incomplete");
  return guide;
}

function cleanGrammar(raw) {
  const g = parseJson(raw);
  const examples = (Array.isArray(g.examples) ? g.examples : [])
    .map(e => ({ ko: String(e?.ko || "").trim(), translation: String(e?.translation || "").trim() }))
    .filter(e => e.ko);
  const explanation = { rule: String(g.rule || "").trim(), form: String(g.form || "").trim(), notes: toList(g.notes), examples: examples.slice(0, 3) };
  if (!explanation.rule || explanation.examples.length < 3) throw new Error("The grammar explanation came back incomplete");
  return explanation;
}

async function cached(pool, sql, params) {
  const [rows] = await pool.query(sql, params);
  if (!rows[0]) return null;
  try { return JSON.parse(rows[0].content); } catch { return null; }
}

// → { typeKey, label, ko, language, ...guide } or null for an unknown type
async function getStrategyGuide(pool, completeText, typeKey, language) {
  const type = typeByKey(typeKey);
  if (!type) return null;
  const lang = languageCode(language);
  await ensureTables(pool);
  const meta = { typeKey: type.key, label: type.label, ko: type.ko, language: lang };

  const hit = await cached(pool, "SELECT content FROM topik_strategy_guides WHERE type_key = ? AND language = ?", [type.key, lang]);
  if (hit) return { ...meta, ...hit, cached: true };

  const prompt = `You are a TOPIK II teacher. Write a STRATEGY GUIDE for this question type, for a student preparing for the exam.
Question type: ${type.label} (${type.ko}).
What the real question looks like: ${type.format}
Write all text in ${LANGUAGES[lang]}; keep Korean examples, grammar forms and exam words in Korean.

Return ONLY this JSON object:
{
  "overview": "2 sentences: what this question tests and why students lose points on it",
  "steps": ["4-6 short steps: exactly what to do, in order, from reading the question to choosing the answer"],
  "tips": ["3-4 concrete tricks for this type, with a tiny Korean example where it helps"],
  "mistakes": ["2-3 common traps students fall into on this type"]
}`;
  const completion = await completeText({ maxTokens: 1800, responseFormat: { type: "json_object" }, messages: [{ role: "user", content: prompt }] });
  const guide = cleanStrategy(completion.choices[0].message.content);
  await pool.query("INSERT INTO topik_strategy_guides (type_key, language, content) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)", [type.key, lang, JSON.stringify(guide)]);
  return { ...meta, ...guide, cached: false };
}

// → { point, language, rule, form, notes[], examples: [{ ko, translation } x3] } or null for an empty point
async function getGrammarExplanation(pool, completeText, point, language) {
  const text = normalisePoint(point);
  if (!text) return null;
  const lang = languageCode(language);
  await ensureTables(pool);
  const key = pointKey(text);

  const hit = await cached(pool, "SELECT content FROM topik_grammar_explanations WHERE point_key = ? AND language = ?", [key, lang]);
  if (hit) return { point: text, language: lang, ...hit, cached: true };

  const prompt = `You are a TOPIK II Korean teacher. Explain this grammar or vocabulary point to a student who got it wrong: "${text}".
Write the explanation in ${LANGUAGES[lang]}; keep Korean forms and the Korean example sentences in Korean.

Return ONLY this JSON object:
{
  "rule": "2-3 sentences: what it means and when it is used (and when it is NOT)",
  "form": "how to build it, e.g. verb stem + -(으)ㄴ 지 + time + 되다/지나다, with what the choices depend on",
  "notes": ["1-3 short notes on common confusions with similar patterns"],
  "examples": [
    { "ko": "natural Korean example sentence", "translation": "its meaning in ${LANGUAGES[lang]}" },
    { "ko": "...", "translation": "..." },
    { "ko": "...", "translation": "..." }
  ]
}
Give exactly 3 examples, each in a different everyday situation, at TOPIK level 3-4.`;
  const request = { maxTokens: 1800, responseFormat: { type: "json_object" }, messages: [{ role: "user", content: prompt }] };
  let explanation;
  try {
    explanation = cleanGrammar((await completeText(request)).choices[0].message.content);
  } catch (err) {
    // one more try: a reply with fewer than 3 examples is the usual reason
    explanation = cleanGrammar((await completeText(request)).choices[0].message.content);
  }
  await pool.query("INSERT INTO topik_grammar_explanations (point_key, point, language, content) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)", [key, text, lang, JSON.stringify(explanation)]);
  return { point: text, language: lang, ...explanation, cached: false };
}

// ── Grammar summary ────────────────────────────────────────────────────────────────────────────
const HANGUL = /[가-힣]/;
const SCRIPT_CHECK = {
  my: /[က-႟]/,
  vi: /[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i,
  en: /[a-z]/i,
};

// Checks that a reply is complete and written in the asked language. (Korean patterns inside an explanation are fine,
// so only the presence of the language's script is checked, not the absence of Korean.)
function cleanSummary(raw, lang, point) {
  const s = parseJson(raw);
  const text = key => String(s[key] ?? "").trim();
  const out = {
    grammarPattern: text("grammarPattern") || point,
    meaningSummary: text("meaningSummary"),
    explanation: text("explanation"),
    usageNotes: text("usageNotes"),
    example: { korean: String(s.example?.korean ?? "").trim(), translation: String(s.example?.translation ?? "").trim() },
  };
  if (!out.meaningSummary || !out.explanation || !out.usageNotes || !HANGUL.test(out.example.korean) || !out.example.translation) throw new Error("The grammar summary came back incomplete");
  const script = SCRIPT_CHECK[lang];
  if (script && lang !== "ko" && ![out.meaningSummary, out.explanation, out.usageNotes, out.example.translation].every(x => script.test(x))) throw new Error(`The grammar summary is not written in ${LANGUAGES[lang]}`);
  return out;
}

// → { point, language, grammarPattern, meaningSummary, explanation, usageNotes, example: { korean, translation }, cached } or null for an empty point
async function getGrammarSummary(pool, completeText, point, language) {
  const text = normalisePoint(point);
  if (!text) return null;
  const lang = languageCode(language);
  await ensureTables(pool);
  const key = pointKey(text);

  const hit = await cached(pool, "SELECT content FROM topik_grammar_summaries WHERE point_key = ? AND language = ?", [key, lang]);
  if (hit) return { point: text, language: lang, ...hit, cached: true };

  const target = LANGUAGES[lang];
  const prompt = `You are an expert Korean Language (TOPIK) Tutor and Localization Specialist.

[User Context]
- Target Language for Explanations: ${target}

[Task]
Explain the following Korean grammar/question fully and strictly in the requested Target Language (${target}).

[Rules]
1. Do NOT mix languages. All explanations, nuances, usage tips, and example translations must be strictly written in ${target}.
2. Keep the original Korean sentences and grammar patterns intact for study.
3. For grammar comparisons, clearly distinguish differences in ${target}.
4. Provide structured JSON output so it can be easily rendered in the UI.

[Input Data]
- Grammar / Question: ${text}

[Expected JSON Response Format]
{
  "grammarPattern": "string (Korean)",
  "meaningSummary": "string (in ${target})",
  "explanation": "string (in ${target})",
  "usageNotes": "string (in ${target})",
  "example": {
    "korean": "string (Korean)",
    "translation": "string (in ${target})"
  }
}`;
  const request = { maxTokens: 1500, responseFormat: { type: "json_object" }, messages: [{ role: "user", content: prompt }] };
  let summary;
  try {
    summary = cleanSummary((await completeText(request)).choices[0].message.content, lang, text);
  } catch (err) {
    // one more try: an incomplete reply or one slipping into another language is the usual reason
    summary = cleanSummary((await completeText(request)).choices[0].message.content, lang, text);
  }
  await pool.query("INSERT INTO topik_grammar_summaries (point_key, point, language, content) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)", [key, text, lang, JSON.stringify(summary)]);
  return { point: text, language: lang, ...summary, cached: false };
}

// The exam service's question types (what the exam-mode weak points are called) mapped onto our practice types.
const EXAM_TYPE_TO_GUIDE = {
  grammar_fill_in: "grammar_fill_in",
  grammar: "grammar_fill_in",
  short_article_fill_in: "vocabulary_in_context",
  fill_in_blank: "vocabulary_in_context",
  sentence_order: "sentence_order",
  main_idea: "main_idea",
  news_headline: "news_headline",
  signboard_context: "notice_sign",
  graph_details: "detail_match",
  details: "detail_match",
  long_article_comprehension: "detail_match",
};
// exam weak points are stored as "long article comprehension" (underscores turned into spaces)
const examTypeToGuideKey = weakness => EXAM_TYPE_TO_GUIDE[String(weakness || "").trim().replace(/\s+/g, "_").toLowerCase()] || null;

module.exports = { TABLES, ensureTables, getStrategyGuide, getGrammarExplanation, getGrammarSummary, examTypeToGuideKey, pointKey, normalisePoint };
