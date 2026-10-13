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
  assert.deepEqual(attempt.params, [7, "grammar", "en", "followup", 2, 1, 50]);
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

test("quizWeaknesses lists the student's most-missed points with their accuracy", async t => {
  const { controller } = load(t, "[]");
  pool.query = async q => {
    if (/FROM topik_quiz_answers/.test(q)) return [[{ weakness: "피동 표현", asked: 4, wrong: 3, lastSeen: "2026-10-13T10:00:00.000Z" }]];
    if (/FROM topik_quiz_attempts/.test(q)) return [[{ attempts: 5, averageScore: 62 }]];
    return [{}];
  };
  const { req, res } = http();
  await controller.quizWeaknesses(req, res);
  assert.deepEqual(res.body, { attempts: 5, averageScore: 62, weaknesses: [{ weakness: "피동 표현", asked: 4, wrong: 3, accuracy: 25, lastSeen: "2026-10-13T10:00:00.000Z" }] });
});
