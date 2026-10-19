const test = require("node:test");
const assert = require("node:assert/strict");
process.env.KMATE_AI_PROVIDER = "openai";   // the model is stubbed below; never reach a real provider

const pool = require("../config/db");
const originalQuery = pool.query;
const controllerPath = require.resolve("../controllers/victoria/kmate.controller");
const openaiTextPath = require.resolve("../services/ai/openaiText");
const storePath = require.resolve("../services/topik/quizStore");

function load(t, reply) {
  const calls = [];
  const originalOpenAi = require.cache[openaiTextPath];
  require.cache[openaiTextPath] = {
    id: openaiTextPath, filename: openaiTextPath, loaded: true,
    exports: { completeText: async request => { calls.push(request); return { choices: [{ message: { content: typeof reply === "function" ? reply(request) : reply } }] }; } },
  };
  delete require.cache[controllerPath];
  delete require.cache[storePath];                     // a fresh "tables are ready" state per test
  const controller = require(controllerPath);
  t.after(() => {
    pool.query = originalQuery;
    delete require.cache[controllerPath];
    delete require.cache[storePath];
    if (originalOpenAi) require.cache[openaiTextPath] = originalOpenAi; else delete require.cache[openaiTextPath];
  });
  return { controller, calls };
}

function http(body = {}, user = { id: 7 }) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  return { req: { user, body }, res };
}

const MODEL_QUESTIONS = JSON.stringify([
  { question: "한국에 온 지 일 년이 ( ).", options: ["A) 됐다", "B) 된다", "C) 되고", "D) 되면"], answer: "A", weakness: "  -(으)ㄴ 지   + 시간  ", explanation: "…" },
  { question: "비가 와서 길이 ( ).", options: ["A) 막혔다", "B) 막았다", "C) 막히고", "D) 막으면"], answer: "A", weakness: "피동 표현", explanation: "…" },
]);

test("generateQuiz returns questions, each with the weak point it tests (tidied)", async t => {
  const { controller, calls } = load(t, "```json\n" + MODEL_QUESTIONS + "\n```");
  const { req, res } = http({ topic: "grammar", count: 2, language: "my" });
  await controller.generateQuiz(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.questions.length, 2);
  assert.equal(res.body.questions[0].weakness, "-(으)ㄴ 지 + 시간");
  assert.match(calls[0].messages[0].content, /Burmese/);
  assert.match(calls[0].messages[0].content, /"weakness"/);
});

test("followupQuiz targets the given weak points and needs at least one", async t => {
  const { controller, calls } = load(t, MODEL_QUESTIONS);
  const empty = http({ weaknesses: [] });
  await controller.followupQuiz(empty.req, empty.res);
  assert.equal(empty.res.statusCode, 400);

  const { req, res } = http({ weaknesses: ["피동 표현", "-(으)ㄴ 지 + 시간"], count: 99, language: "en" });
  await controller.followupQuiz(req, res);
  assert.equal(res.statusCode, 200);
  const prompt = calls[0].messages[0].content;
  assert.match(prompt, /- 피동 표현/);
  assert.match(prompt, /- -\(으\)ㄴ 지 \+ 시간/);
  assert.match(prompt, /Generate 8 /);                              // the count is capped
  assert.match(prompt, /EVERY question must test one of them/);
});

test("checkQuiz grades, stores the attempt and every answer with its weak point, and returns the review", async t => {
  const { controller } = load(t, "[]");
  const sql = [];
  pool.query = async (q, params) => {
    sql.push({ q: q.replace(/\s+/g, " "), params });
    if (/INSERT INTO topik_quiz_attempts/.test(q)) return [{ insertId: 41 }];
    return [{}];
  };
  const questions = JSON.parse(MODEL_QUESTIONS);
  const { req, res } = http({ questions, answers: ["A", "B"], topic: "grammar", language: "en", kind: "followup" });
  await controller.checkQuiz(req, res);
  assert.equal(res.body.score, 50);
  assert.equal(res.body.attemptId, 41);
  assert.equal(res.body.results[1].isCorrect, false);
  assert.equal(res.body.results[1].weakness, "피동 표현");

  const attempt = sql.find(c => /INSERT INTO topik_quiz_attempts/.test(c.q));
  assert.deepEqual(attempt.params, [7, "grammar", "en", "followup", null, null, 2, 1, 50]);
  const answers = sql.filter(c => /INSERT INTO topik_quiz_answers/.test(c.q));
  assert.equal(answers.length, 2);
  assert.deepEqual(answers[1].params.slice(0, 2), [41, 7]);
  assert.equal(answers[1].params[6], 0);                            // is_correct = 0
  assert.equal(answers[1].params[7], "피동 표현");
});

test("a storage failure never takes the student's result away", async t => {
  const { controller } = load(t, "[]");
  pool.query = async () => { throw new Error("db down"); };
  const { req, res } = http({ questions: JSON.parse(MODEL_QUESTIONS), answers: ["A", "A"] });
  const log = console.error; console.error = () => {};
  t.after(() => { console.error = log; });
  await controller.checkQuiz(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.score, 100);
  assert.equal(res.body.attemptId, null);
});

test("quizWeaknesses lists quiz and exam weak points together, most-missed first, with where each comes from", async t => {
  const { controller } = load(t, "[]");
  pool.query = async q => {
    if (/FROM topik_weakness_profiles/.test(q)) return [[
      { source: "exam", skill_area: "reading", weakness: "long article comprehension", attempts: 16, correct_count: 0, last_seen: "2026-10-13T11:00:00.000Z" },
      { source: "quiz", skill_area: "", weakness: "피동 표현", attempts: 4, correct_count: 1, last_seen: "2026-10-13T10:00:00.000Z" },
    ]];
    if (/FROM topik_quiz_attempts/.test(q)) return [[{ attempts: 5, averageScore: 62 }]];
    if (/FROM topik_exam_sessions/.test(q)) return [[{ sessions: 2, averageScore: 6 }]];
    return [{}];
  };
  const { req, res } = http();
  await controller.quizWeaknesses(req, res);
  assert.deepEqual(res.body, {
    attempts: 5, averageScore: 62, examSessions: 2, examAverage: 6,
    weaknesses: [
      { weakness: "long article comprehension", source: "exam", skillArea: "reading", asked: 16, wrong: 16, accuracy: 0, lastSeen: "2026-10-13T11:00:00.000Z" },
      { weakness: "피동 표현", source: "quiz", skillArea: null, asked: 4, wrong: 3, accuracy: 25, lastSeen: "2026-10-13T10:00:00.000Z" },
    ],
  });
});

test("saving a quiz attempt rebuilds the student's weakness profile (quiz and exam rows)", async t => {
  const { controller } = load(t, "[]");
  const sql = [];
  pool.query = async q => { sql.push(q.replace(/\s+/g, " ")); return /INSERT INTO topik_quiz_attempts/.test(q) ? [{ insertId: 3 }] : [{}]; };
  const { req, res } = http({ questions: JSON.parse(MODEL_QUESTIONS), answers: ["A", "A"] });
  await controller.checkQuiz(req, res);
  assert.ok(sql.some(q => /DELETE FROM topik_weakness_profiles/.test(q)));
  assert.ok(sql.some(q => /INSERT INTO topik_weakness_profiles .* 'quiz'/.test(q)));
  assert.ok(sql.some(q => /INSERT INTO topik_weakness_profiles .* 'exam'/.test(q)));
});

test("quizOptions lists the question types and difficulty levels the screen offers (no prompt text)", async t => {
  const { controller } = load(t, "[]");
  const { req, res } = http();
  controller.quizOptions(req, res);
  assert.equal(res.body.types.length, 8);
  assert.deepEqual(res.body.types[0], { key: "grammar_fill_in", label: "Grammar fill-in", ko: "문법 빈칸", skill: "grammar", description: "Choose the grammar form that fits the blank in a sentence." });
  assert.deepEqual(res.body.difficulties.map(d => d.key), ["easy", "medium", "hard"]);
  assert.equal(JSON.stringify(res.body).includes("format"), false);
});

test("generateQuiz writes the chosen question type and difficulty into the request to the model", async t => {
  const { controller, calls } = load(t, MODEL_QUESTIONS);
  const { req, res } = http({ topic: "grammar", count: 2, language: "en", type: "sentence_order", difficulty: "hard" });
  await controller.generateQuiz(req, res);
  const prompt = calls[0].messages[0].content;
  assert.match(prompt, /"Sentence order" \(문장 순서\)/);
  assert.match(prompt, /\(가\) \(나\) \(다\) \(라\)/);               // the real exam format of that type
  assert.match(prompt, /Difficulty: Hard — about TOPIK level 5-6/);
});

test("an unknown type or difficulty is ignored, not passed to the model", async t => {
  const { controller, calls } = load(t, MODEL_QUESTIONS);
  const { req, res } = http({ topic: "grammar", count: 2, type: "nonsense", difficulty: "impossible" });
  await controller.generateQuiz(req, res);
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(calls[0].messages[0].content, /Difficulty:|question, written like the real exam/);
});

test("checkQuiz stores the type and difficulty with the attempt and each answer; followup practice can keep them", async t => {
  const { controller, calls } = load(t, MODEL_QUESTIONS);
  const sql = [];
  pool.query = async (q, params) => { sql.push({ q: q.replace(/\s+/g, " "), params }); return /INSERT INTO topik_quiz_attempts/.test(q) ? [{ insertId: 8 }] : [{}]; };
  const { req, res } = http({ questions: JSON.parse(MODEL_QUESTIONS), answers: ["A", "A"], type: "main_idea", difficulty: "easy", kind: "practice" });
  await controller.checkQuiz(req, res);
  assert.deepEqual(sql.find(c => /INSERT INTO topik_quiz_attempts/.test(c.q)).params.slice(3, 6), ["practice", "main_idea", "easy"]);
  const answer = sql.find(c => /INSERT INTO topik_quiz_answers/.test(c.q));
  assert.deepEqual(answer.params.slice(8, 10), ["main_idea", "easy"]);

  const follow = http({ weaknesses: ["피동 표현"], type: "grammar_fill_in", difficulty: "easy" });
  await controller.followupQuiz(follow.req, follow.res);
  assert.match(calls.at(-1).messages[0].content, /"Grammar fill-in"/);
});

test("older tables get the new columns added, and 'already there' is not an error", async t => {
  const { controller } = load(t, "[]");
  const ddl = [];
  pool.query = async q => {
    ddl.push(q.replace(/\s+/g, " "));
    if (/ALTER TABLE/.test(q)) { const e = new Error("dup"); e.code = "ER_DUP_FIELDNAME"; throw e; }
    return /FROM topik_/.test(q) ? [[]] : [{}];
  };
  const { req, res } = http();
  await controller.quizWeaknesses(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(ddl.filter(q => /^ALTER TABLE topik_quiz_(attempts|answers) ADD COLUMN (question_type|difficulty)/.test(q)).length, 4);
});

test("Hard headline questions are asked for compact newspaper noun phrases, not sentences", async t => {
  const { controller, calls } = load(t, MODEL_QUESTIONS);
  await controller.generateQuiz(http({ topic: "reading", count: 2, type: "news_headline", difficulty: "hard" }).req, http().res);
  const prompt = calls[0].messages[0].content;
  assert.match(prompt, /HEADLINE STYLE \(strict/);
  assert.match(prompt, /ONE noun phrase of about 8-25 characters/);
  assert.match(prompt, /NOT end with a verb or a sentence ending/);
  assert.match(prompt, /Good: .*금리 동결에 가계 대출 증가세 주춤/);        // a real-looking example is given
  assert.match(prompt, /Sino-Korean compound nouns/);                         // the hard-level note
  assert.match(prompt, /distorts exactly one nuance/);

  await controller.generateQuiz(http({ topic: "reading", count: 2, type: "news_headline", difficulty: "easy" }).req, http().res);
  assert.match(calls[1].messages[0].content, /everyday news topics/);          // each level has its own note
  assert.doesNotMatch(calls[1].messages[0].content, /Sino-Korean compound nouns/);

  await controller.generateQuiz(http({ topic: "reading", count: 2, type: "main_idea", difficulty: "hard" }).req, http().res);
  assert.doesNotMatch(calls[2].messages[0].content, /HEADLINE STYLE/);          // other types are not affected
});
