const test = require("node:test");
const assert = require("node:assert/strict");

const pool = require("../config/db");
const originalQuery = pool.query;
const originalFetch = global.fetch;
const originalKmateAiUrl = process.env.KMATE_AI_URL;
const controller = require("../controllers/victoria/kmate.controller");
const controllerPath = require.resolve("../controllers/victoria/kmate.controller");
const openaiTextPath = require.resolve("../services/ai/openaiText");

function loadCodeCoachController(t, completeCodeText) {
  const originalOpenAiText = require.cache[openaiTextPath];
  require.cache[openaiTextPath] = {
    id: openaiTextPath,
    filename: openaiTextPath,
    loaded: true,
    exports: { completeText: completeCodeText },
  };
  delete require.cache[controllerPath];
  const freshController = require(controllerPath);
  t.after(() => {
    delete require.cache[controllerPath];
    if (originalOpenAiText) require.cache[openaiTextPath] = originalOpenAiText;
    else delete require.cache[openaiTextPath];
  });
  return freshController;
}

function httpDouble({ user = { id: 5 }, body = {} } = {}) {
  const req = { user, body };
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return { req, res };
}

test.afterEach(() => {
  pool.query = originalQuery;
  global.fetch = originalFetch;
  if (originalKmateAiUrl === undefined) delete process.env.KMATE_AI_URL;
  else process.env.KMATE_AI_URL = originalKmateAiUrl;
});

test("ask proxies the question to the K.MATE AI service and saves the answer to history", async () => {
  process.env.KMATE_AI_URL = "http://localhost:8082";
  let requestedUrl, requestedBody;
  global.fetch = async (url, options) => {
    requestedUrl = url;
    requestedBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ answer: "TOPIK stands for Test of Proficiency in Korean." }) };
  };
  let savedQuery, savedParams;
  pool.query = async (sql, params) => {
    savedQuery = sql;
    savedParams = params;
    return [{}];
  };

  const { req, res } = httpDouble({ body: { question: "What is TOPIK?" } });
  await controller.ask(req, res);

  assert.equal(requestedUrl, "http://localhost:8082/ask");
  assert.deepEqual(requestedBody, { question: "What is TOPIK?" });
  assert.match(savedQuery, /INSERT INTO kmate_history/);
  assert.deepEqual(savedParams, [5, "What is TOPIK?", "TOPIK stands for Test of Proficiency in Korean."]);
  assert.deepEqual(res.body, { answer: "TOPIK stands for Test of Proficiency in Korean." });
});

test("ask rejects a request with no question, without calling the AI service", async () => {
  global.fetch = async () => { throw new Error("fetch should not be called"); };

  const { req, res } = httpDouble({ body: {} });
  await controller.ask(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "question is required" });
});

test("ask reports 502 when the K.MATE AI service is unreachable or errors", async () => {
  global.fetch = async () => ({ ok: false, status: 500, text: async () => "internal error" });

  const { req, res } = httpDouble({ body: { question: "What is TOPIK?" } });
  await controller.ask(req, res);

  assert.equal(res.statusCode, 502);
  assert.match(res.body.error, /K.MATE AI service request failed: 500/);
});

test("codeCoach returns separate professor explanation and hint-only workspace guidance", async (t) => {
  let capturedRequest;
  const codeCoach = loadCodeCoachController(t, async (request) => {
    capturedRequest = request;
    return {
      choices: [{ message: { content: JSON.stringify({
        concept: "for loop",
        explanation: "A for loop repeats a block while a condition is true.",
        where_used: "Use it when you know how many times to repeat.",
        example_code: "for (let n = 0; n < 3; n++) console.log(n);",
        hint: "Decide what your counter should start at.",
        skeleton_code: "for (let i = ___; i < ___; i++) {\n  console.log(___);\n}",
        try_next: "Fill in the first blank, then run your code.",
      }) } }],
    };
  });
  pool.query = async () => [{}];

  const { req, res } = httpDouble({ body: {
    homework: "Write a loop that prints numbers from 0 to 4.",
    code: "",
    action: "start",
    language: "my",
  } });
  await codeCoach.codeCoach(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.lesson.topic, "for loop");
  assert.equal(res.body.coach.nextStep, "Fill in the first blank, then run your code.");
  assert.match(res.body.coach.scaffold, /___/);
  const systemPrompt = capturedRequest.messages.find(message => message.role === "system").content;
  assert.match(systemPrompt, /Do NOT give the full answer/i);
  assert.match(systemPrompt, /"skeleton_code"/);
  assert.match(systemPrompt, /Burmese/);
  assert.doesNotMatch(systemPrompt, /\{\{LANGUAGE\}\}/);
});

test("codeCoach parses replies with raw newlines and LaTeX backslashes inside JSON strings", async (t) => {
  const raw = '{"concept":"nested list","explanation":"Build a $10 \\( n \\) grid.\nSecond line","hint":"Start with __init__","skeleton_code":"x = [___]"}';
  const codeCoach = loadCodeCoachController(t, async () => ({ choices: [{ message: { content: raw } }] }));
  pool.query = async () => [{}];

  const { req, res } = httpDouble({ body: { homework: "grid", action: "hint" } });
  await codeCoach.codeCoach(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.lesson.topic, "nested list");
  assert.match(res.body.lesson.explanation, /Second line/);
});

test("codeCoach check returns a correct/incorrect verdict instead of another hint", async (t) => {
  const codeCoach = loadCodeCoachController(t, async () => ({
    choices: [{ message: { content: JSON.stringify({ analysis: "prints 3 times", is_correct: false, feedback: "Close.", next_hint: "Check the range end." }) } }],
  }));
  pool.query = async () => [{}];

  const { req, res } = httpDouble({ body: { homework: "print hello 5 times", code: "for i in range(3): print('hello')", action: "check", language: "en" } });
  await codeCoach.codeCoach(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.check, { isCorrect: false, feedback: "Close.", nextHint: "Check the range end." });
  assert.equal(res.body.coach, undefined);
});

test("codeCoach check refuses to run without code", async (t) => {
  const codeCoach = loadCodeCoachController(t, async () => { throw new Error("should not call the model"); });
  const { req, res } = httpDouble({ body: { homework: "print hello", code: "", action: "check" } });
  await codeCoach.codeCoach(req, res);
  assert.equal(res.statusCode, 400);
});

test("codeCoach trace returns clamped, normalised execution steps", async (t) => {
  const codeCoach = loadCodeCoachController(t, async () => ({
    choices: [{ message: { content: JSON.stringify({ total_steps: 2, steps: [
      { current_step: 1, code_line_highlighted: 1, memory_state: { total: 0 }, printed: "", short_explanation: "start" },
      { current_step: 2, code_line_highlighted: 99, memory_state: {}, short_explanation: "end" },
    ] }) } }],
  }));
  pool.query = async () => [{}];

  const { req, res } = httpDouble({ body: { homework: "x", code: "total = 0\nprint(total)", action: "trace" } });
  await codeCoach.codeCoach(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.trace.total, 2);
  assert.deepEqual(res.body.trace.steps[0].memory, { total: "0" });
  assert.equal(res.body.trace.steps[1].line, 2);
});
