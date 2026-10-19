const test = require("node:test");
const assert = require("node:assert/strict");
process.env.KMATE_AI_PROVIDER = "openai";   // the model is stubbed; never reach a real provider

const pool = require("../config/db");
const originalQuery = pool.query;
const guides = require("../services/topik/guides");

const STRATEGY = JSON.stringify({ overview: "Tests the order.", steps: ["Find the opener", "Link the pronouns"], tips: ["Look at 그래서"], mistakes: ["Ignoring connectives"] });
const GRAMMAR = JSON.stringify({ rule: "Time since an action.", form: "stem + -(으)ㄴ 지 + time + 되다", notes: ["not -(으)ㄹ 때"], examples: [
  { ko: "한국에 온 지 1년이 됐어요.", translation: "One year since I came." },
  { ko: "운동을 시작한 지 한 달이에요.", translation: "A month since I started." },
  { ko: "그를 만난 지 오래됐어요.", translation: "It has been long since I met him." },
] });

// a MySQL double that behaves like the two cache tables
function cacheDb() {
  const store = new Map();
  const calls = [];
  const db = {
    calls,
    async query(sql, params = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      calls.push(q);
      if (/^SELECT content FROM topik_strategy_guides/.test(q)) { const v = store.get(`s|${params.join("|")}`); return [v ? [{ content: v }] : []]; }
      if (/^SELECT content FROM topik_grammar_explanations/.test(q)) { const v = store.get(`g|${params.join("|")}`); return [v ? [{ content: v }] : []]; }
      if (/^INSERT INTO topik_strategy_guides/.test(q)) { store.set(`s|${params[0]}|${params[1]}`, params[2]); return [{}]; }
      if (/^INSERT INTO topik_grammar_explanations/.test(q)) { store.set(`g|${params[0]}|${params[2]}`, params[3]); return [{}]; }
      return [{}];
    },
  };
  return db;
}
function model(replies) {
  const queue = [].concat(replies);
  const requests = [];
  const completeText = async request => { requests.push(request); return { choices: [{ message: { content: queue.length > 1 ? queue.shift() : queue[0] } }] }; };
  return { completeText, requests };
}

test("a strategy guide is written once per type and language, then served from MySQL", async () => {
  const db = cacheDb();
  const m = model(STRATEGY);
  const first = await guides.getStrategyGuide(db, m.completeText, "sentence_order", "my");
  assert.equal(first.cached, false);
  assert.deepEqual({ type: first.typeKey, ko: first.ko, steps: first.steps.length, tips: first.tips.length }, { type: "sentence_order", ko: "문장 순서", steps: 2, tips: 1 });
  assert.match(m.requests[0].messages[0].content, /Burmese \(Myanmar\)/);
  assert.match(m.requests[0].messages[0].content, /\(가\) \(나\) \(다\) \(라\)/);   // the real exam format of that type

  const second = await guides.getStrategyGuide(db, m.completeText, "sentence_order", "my");
  assert.equal(second.cached, true);
  assert.equal(m.requests.length, 1);                                              // no second model call

  await guides.getStrategyGuide(db, m.completeText, "sentence_order", "ko");       // another language is another page
  assert.equal(m.requests.length, 2);
});

test("an unknown type is refused, an unknown language falls back to English, and a thin reply is an error", async () => {
  const db = cacheDb();
  const m = model(STRATEGY);
  assert.equal(await guides.getStrategyGuide(db, m.completeText, "nope", "en"), null);
  assert.equal(m.requests.length, 0);
  const guide = await guides.getStrategyGuide(db, m.completeText, "main_idea", "xx");
  assert.equal(guide.language, "en");
  await assert.rejects(guides.getStrategyGuide(cacheDb(), model('{"overview":"","steps":[]}').completeText, "main_idea", "en"), /incomplete/);
});

test("a grammar explanation has the rule, the form and exactly 3 examples, and is cached by the point (spacing and case ignored)", async () => {
  const db = cacheDb();
  const m = model(GRAMMAR);
  const first = await guides.getGrammarExplanation(db, m.completeText, "-(으)ㄴ 지 + 시간 + 되다", "en");
  assert.equal(first.cached, false);
  assert.equal(first.examples.length, 3);
  assert.equal(first.examples[0].ko, "한국에 온 지 1년이 됐어요.");
  assert.match(first.form, /되다/);
  assert.match(m.requests[0].messages[0].content, /Give exactly 3 examples/);

  const again = await guides.getGrammarExplanation(db, m.completeText, "  -(으)ㄴ 지   +  시간 + 되다 ", "en");
  assert.equal(again.cached, true);
  assert.equal(m.requests.length, 1);
  assert.equal(await guides.getGrammarExplanation(db, m.completeText, "   ", "en"), null);
});

test("a grammar reply with fewer than 3 examples is asked for once more", async () => {
  const two = JSON.stringify({ rule: "r", form: "f", notes: [], examples: [{ ko: "a", translation: "a" }, { ko: "b", translation: "b" }] });
  const m = model([two, GRAMMAR]);
  const result = await guides.getGrammarExplanation(cacheDb(), m.completeText, "피동 표현", "en");
  assert.equal(result.examples.length, 3);
  assert.equal(m.requests.length, 2);
  await assert.rejects(guides.getGrammarExplanation(cacheDb(), model(two).completeText, "피동 표현", "en"), /incomplete/);
});

test("exam weak points map onto the practice types that have a strategy guide", () => {
  assert.equal(guides.examTypeToGuideKey("long article comprehension"), "detail_match");
  assert.equal(guides.examTypeToGuideKey("grammar fill in"), "grammar_fill_in");
  assert.equal(guides.examTypeToGuideKey("signboard context"), "notice_sign");
  assert.equal(guides.examTypeToGuideKey("something new"), null);
});

// ---- the two endpoints
const openaiTextPath = require.resolve("../services/ai/openaiText");
const controllerPath = require.resolve("../controllers/victoria/kmate.controller");
function endpoints(t, reply) {
  const original = require.cache[openaiTextPath];
  const calls = [];
  require.cache[openaiTextPath] = { id: openaiTextPath, filename: openaiTextPath, loaded: true, exports: { completeText: async r => { calls.push(r); return { choices: [{ message: { content: reply } }] }; } } };
  delete require.cache[controllerPath];
  pool.query = cacheDb().query;
  const controller = require(controllerPath);
  t.after(() => { pool.query = originalQuery; delete require.cache[controllerPath]; if (original) require.cache[openaiTextPath] = original; else delete require.cache[openaiTextPath]; });
  return { controller, calls };
}
const res = () => ({ statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } });

test("GET /quiz/strategy returns the guide, and 400 for an unknown type", async t => {
  const { controller } = endpoints(t, STRATEGY);
  const ok = res(); await controller.quizStrategy({ user: { id: 1 }, query: { type: "main_idea", language: "en" } }, ok);
  assert.equal(ok.body.typeKey, "main_idea");
  assert.equal(ok.body.steps.length, 2);
  const bad = res(); await controller.quizStrategy({ user: { id: 1 }, query: { type: "x" } }, bad);
  assert.equal(bad.statusCode, 400);
});

test("GET /quiz/explain: a quiz point gets a grammar explanation, an exam point gets its type's strategy guide", async t => {
  const { controller, calls } = endpoints(t, GRAMMAR);
  const quiz = res(); await controller.explainWeakPoint({ user: { id: 1 }, query: { point: "피동 표현", source: "quiz", language: "en" } }, quiz);
  assert.equal(quiz.body.kind, "grammar");
  assert.equal(quiz.body.examples.length, 3);

  const missing = res(); await controller.explainWeakPoint({ user: { id: 1 }, query: { point: "  " } }, missing);
  assert.equal(missing.statusCode, 400);

  const unknown = res(); await controller.explainWeakPoint({ user: { id: 1 }, query: { point: "something new", source: "exam" } }, unknown);
  assert.equal(unknown.body.kind, "none");
  assert.equal(calls.length, 1);                                   // only the grammar one reached the model
});
