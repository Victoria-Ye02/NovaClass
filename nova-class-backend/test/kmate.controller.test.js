const test = require("node:test");
// the tests stub OpenAI; never let a real Claude key from .env send them over the network
process.env.KMATE_AI_PROVIDER = "openai";
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

// A response double that also records what a streaming handler writes.
function streamDouble(body) {
  const { req, res } = httpDouble({ body });
  Object.assign(res, {
    headers: {}, written: [], headersSent: false, writableFinished: false, ended: false,
    setHeader(name, value) { this.headers[name] = value; },
    flushHeaders() { this.headersSent = true; },
    write(text) { this.headersSent = true; this.written.push(text); },
    end() { this.ended = true; this.writableFinished = true; },
    on() {},
  });
  return { req, res };
}

async function* chunksOf(...parts) {
  for (const part of parts) yield part;
}

test("askStream relays the answer piece by piece and saves the whole answer to history", async () => {
  process.env.KMATE_AI_URL = "http://localhost:8082";
  let requestedUrl;
  // "한" is three bytes; splitting it across two chunks must not garble it
  const bytes = new TextEncoder().encode("한국어 answer");
  global.fetch = async (url) => {
    requestedUrl = url;
    return { ok: true, body: chunksOf(bytes.slice(0, 2), bytes.slice(2, 9), bytes.slice(9)) };
  };
  let savedParams;
  pool.query = async (sql, params) => { savedParams = params; return [{}]; };

  const { req, res } = streamDouble({ question: "What is TOPIK?" });
  await controller.askStream(req, res);

  assert.equal(requestedUrl, "http://localhost:8082/ask/stream");
  assert.equal(res.headers["Content-Type"], "text/plain; charset=utf-8");
  assert.ok(res.written.length > 1, "the answer is written in more than one piece");
  assert.equal(res.written.join(""), "한국어 answer");
  assert.deepEqual(savedParams, [5, "What is TOPIK?", "한국어 answer"]);
  assert.ok(res.ended);
});

test("askStream rejects a request with no question, without calling the AI service", async () => {
  global.fetch = async () => { throw new Error("fetch should not be called"); };

  const { req, res } = streamDouble({});
  await controller.askStream(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "question is required" });
});

test("askStream reports 502 as JSON when the AI service fails before any text is sent", async () => {
  global.fetch = async () => ({ ok: false, status: 500, text: async () => "internal error" });

  const { req, res } = streamDouble({ question: "What is TOPIK?" });
  await controller.askStream(req, res);

  assert.equal(res.statusCode, 502);
  assert.match(res.body.error, /K.MATE AI service request failed: 500/);
});

test("askStream ends the response, without saving, when the stream breaks mid-answer", async () => {
  async function* breaksAfterOnePiece() {
    yield new TextEncoder().encode("Partial ");
    throw new Error("connection reset");
  }
  global.fetch = async () => ({ ok: true, body: breaksAfterOnePiece() });
  let saved = false;
  pool.query = async () => { saved = true; return [{}]; };

  const { req, res } = streamDouble({ question: "What is TOPIK?" });
  await controller.askStream(req, res);

  assert.equal(res.written.join(""), "Partial ");
  assert.equal(saved, false);
  assert.ok(res.ended);
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
  assert.deepEqual(res.body.check, { isCorrect: false, feedback: "Close.", where: "", why: "", nextHint: "Check the range end.", hintLevel: 1 });
  assert.equal(res.body.coach, undefined);
});

test("codeCoach check explains where and why a run failed, using the run output and numbered lines", async (t) => {
  let captured;
  const codeCoach = loadCodeCoachController(t, async (request) => {
    captured = request;
    return { choices: [{ message: { content: JSON.stringify({ analysis: "typo", is_correct: false, feedback: "Almost.", where: "Line 2: total = totl + i", why: "totl is not defined.", next_hint: "Check the spelling of the variable." }) } }] };
  });
  pool.query = async () => [{}];

  const { req, res } = httpDouble({ body: {
    homework: "sum 1 to 3", code: "total = 0\ntotal = totl + 1", action: "check", language: "en",
    run: { output: "", error: "NameError: name 'totl' is not defined" },
  } });
  await codeCoach.codeCoach(req, res);

  assert.equal(res.body.check.where, "Line 2: total = totl + i");
  assert.equal(res.body.check.why, "totl is not defined.");
  const userMessage = captured.messages[1].content;
  assert.match(userMessage, /2: total = totl \+ 1/);
  assert.match(userMessage, /NameError: name 'totl' is not defined/);
});

test("codeCoach check drops where/why/hint when the code is correct", async (t) => {
  const codeCoach = loadCodeCoachController(t, async () => ({
    choices: [{ message: { content: JSON.stringify({ analysis: "ok", is_correct: true, feedback: "Great.", where: "n/a", why: "n/a", next_hint: "n/a" }) } }],
  }));
  pool.query = async () => [{}];
  const { req, res } = httpDouble({ body: { homework: "x", code: "print(1)", action: "check", run: { output: "1\n", error: "" } } });
  await codeCoach.codeCoach(req, res);
  assert.deepEqual(res.body.check, { isCorrect: true, feedback: "Great.", where: "", why: "", nextHint: "", hintLevel: 0 });
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

test("codeCoach start returns the concepts the homework needs, falling back to the main lesson", async (t) => {
  const withConcepts = loadCodeCoachController(t, async () => ({
    choices: [{ message: { content: JSON.stringify({
      concept: "loops", explanation: "e", where_used: "w", example_code: "x", hint: "h", skeleton_code: "for i in range(___):",
      concepts: [
        { name: "for loop", what: "repeats", how: "for i in range(3)", example: "for i in range(2): pass" },
        { name: "list", what: "ordered items", how: "[1, 2]", example: "a = [1]" },
      ],
    }) } }],
  }));
  pool.query = async () => [{}];
  let { req, res } = httpDouble({ body: { homework: "loop over a list", action: "start" } });
  await withConcepts.codeCoach(req, res);
  assert.deepEqual(res.body.lesson.concepts.map(c => c.name), ["for loop", "list"]);

  const withoutConcepts = loadCodeCoachController(t, async () => ({
    choices: [{ message: { content: JSON.stringify({ concept: "loops", explanation: "e", where_used: "w", example_code: "x", hint: "h", skeleton_code: "s" }) } }],
  }));
  ({ req, res } = httpDouble({ body: { homework: "loop", action: "start" } }));
  await withoutConcepts.codeCoach(req, res);
  assert.equal(res.body.lesson.concepts.length, 1);
  assert.equal(res.body.lesson.concepts[0].name, "loops");
});

test("codeCoach ask answers a chat question with a hint box and sends earlier turns as context", async (t) => {
  let captured;
  const codeCoach = loadCodeCoachController(t, async (request) => {
    captured = request;
    return { choices: [{ message: { content: JSON.stringify({ answer: "1. Make a list\n2. Loop", hint: "Start with the list", hint_code: "grid = [___]" }) } }] };
  });
  pool.query = async () => [{}];

  const { req, res } = httpDouble({ body: {
    homework: "build a grid", code: "", action: "ask", question: "Where do I start?", language: "ko",
    chat: [{ q: "hi", a: "hello" }],
  } });
  await codeCoach.codeCoach(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.ask, { answer: "1. Make a list\n2. Loop", hint: "Start with the list", hintCode: "grid = [___]" });
  assert.match(captured.messages[0].content, /Korean/);
  assert.match(captured.messages[1].content, /Student's question: Where do I start\?/);
  assert.match(captured.messages[1].content, /Professor Nova: hello/);
});

test("codeCoach ask requires a question and some homework", async (t) => {
  const codeCoach = loadCodeCoachController(t, async () => { throw new Error("should not call the model"); });
  let { req, res } = httpDouble({ body: { homework: "x", action: "ask", question: "  " } });
  await codeCoach.codeCoach(req, res);
  assert.equal(res.statusCode, 400);
  ({ req, res } = httpDouble({ body: { homework: "", code: "", action: "ask", question: "help" } }));
  await codeCoach.codeCoach(req, res);
  assert.equal(res.statusCode, 400);
});

test("codeCoach start reports the homework's programming language, normalised", async (t) => {
  const make = language => loadCodeCoachController(t, async () => ({
    choices: [{ message: { content: JSON.stringify({ concept: "loops", explanation: "e", where_used: "w", example_code: "x", hint: "h", skeleton_code: "s", language }) } }],
  }));
  pool.query = async () => [{}];
  for (const [given, expected] of [["JS", "javascript"], ["C++", "cpp"], ["Python", "python"], ["cobol", ""], [undefined, ""]]) {
    const { req, res } = httpDouble({ body: { homework: "loop", action: "start" } });
    await make(given).codeCoach(req, res);
    assert.equal(res.body.lesson.language, expected, `language ${given}`);
  }
});

test("codeCoach start returns how-to-start steps, trimmed and capped at 8", async (t) => {
  const steps = [" Make a list ", "", "Loop over it", "Print each row", "4", "5", "6", "7", "8", "9"];
  const codeCoach = loadCodeCoachController(t, async () => ({
    choices: [{ message: { content: JSON.stringify({ concept: "loops", explanation: "e", where_used: "w", example_code: "x", hint: "h", skeleton_code: "s", steps }) } }],
  }));
  pool.query = async () => [{}];
  const { req, res } = httpDouble({ body: { homework: "loop", action: "start" } });
  await codeCoach.codeCoach(req, res);
  assert.deepEqual(res.body.lesson.steps, ["Make a list", "Loop over it", "Print each row", "4", "5", "6", "7", "8"]);   // blanks dropped, at most 8
});

test("codeCoach check escalates the hint level with the attempt number and caps it at 3", async (t) => {
  const seen = [];
  const codeCoach = loadCodeCoachController(t, async (request) => {
    seen.push(request.messages[1].content.match(/HINT LEVEL: (\d)/)[1]);
    return { choices: [{ message: { content: JSON.stringify({ analysis: "x", is_correct: false, feedback: "f", where: "w", why: "y", next_hint: "h" }) } }] };
  });
  pool.query = async () => [{}];
  const levels = [];
  for (const attempt of [undefined, 1, 2, 3, 9, "junk"]) {
    const { req, res } = httpDouble({ body: { homework: "x", code: "print(1)", action: "check", attempt } });
    await codeCoach.codeCoach(req, res);
    levels.push(res.body.check.hintLevel);
  }
  assert.deepEqual(levels, [1, 1, 2, 3, 3, 1]);
  assert.deepEqual(seen, ["1", "1", "2", "3", "3", "1"]);
});

test("codeCoach 'hint' sends the hints already given so the next one moves forward instead of repeating", async (t) => {
  let capturedRequest;
  const codeCoach = loadCodeCoachController(t, async (request) => {
    capturedRequest = request;
    return { choices: [{ message: { content: JSON.stringify({
      concept: "loop", explanation: "e", where_used: "w", example_code: "x",
      hint: "Now decide what to do with each number inside the loop.", skeleton_code: "for i in range(___):\n    print(___)", try_next: "Fill the blanks.",
    }) } }] };
  });
  pool.query = async () => [{}];

  const { req, res } = httpDouble({ body: {
    homework: "Print 1 to 5.", code: "", action: "hint", language: "en",
    hints: ["Start by choosing how many times to repeat.", "Use range() to describe the numbers.", "  "],
  } });
  await codeCoach.codeCoach(req, res);

  assert.equal(res.statusCode, 200);
  const user = capturedRequest.messages.find(m => m.role === "user").content;
  assert.match(user, /1\. Start by choosing how many times to repeat\./);
  assert.match(user, /2\. Use range\(\) to describe the numbers\./);
  assert.match(user, /hint number 3/);
  assert.match(user, /never repeating/i);
  assert.match(user, /1 blank/, "later hints reveal more");
  assert.doesNotMatch(user, /3\. +\n/, "blank hints are dropped");
});

test("codeCoach 'start' and a first 'hint' add no hint history to the prompt", async (t) => {
  const users = [];
  const codeCoach = loadCodeCoachController(t, async (request) => {
    users.push(request.messages.find(m => m.role === "user").content);
    return { choices: [{ message: { content: JSON.stringify({ concept: "c", explanation: "e", where_used: "w", example_code: "x", hint: "h", skeleton_code: "___", try_next: "t" }) } }] };
  });
  pool.query = async () => [{}];
  for (const body of [{ action: "start" }, { action: "hint" }, { action: "hint", hints: [] }]) {
    const { req, res } = httpDouble({ body: { homework: "Print 1 to 5.", code: "", language: "en", ...body } });
    await codeCoach.codeCoach(req, res);
  }
  assert.ok(users.every(u => !/Hints already given/.test(u)));
});

// ---- is a new message a NEW problem or about the current one? ----------------------

function classifyWith(t, content) {
  const seen = [];
  const codeCoach = loadCodeCoachController(t, async (request) => {
    seen.push(request);
    if (content instanceof Error) throw content;
    return { choices: [{ message: { content } }] };
  });
  pool.query = async () => [{}];
  return { codeCoach, seen };
}

test("classify says a task statement is a new problem", async (t) => {
  const { codeCoach, seen } = classifyWith(t, '{"new_problem": true}');
  const { req, res } = httpDouble({ body: { action: "classify", homework: "Print Hello, Nova!", question: "print hello 3 times use for loop" } });
  await codeCoach.codeCoach(req, res);
  assert.deepEqual(res.body, { newProblem: true });
  const user = seen[0].messages.find(m => m.role === "user").content;
  assert.match(user, /Print Hello, Nova!/, "the current homework is the reference");
  assert.match(user, /print hello 3 times use for loop/);
  assert.match(seen[0].messages.find(m => m.role === "system").content, /If you are not sure, answer \(B\)/);
  assert.equal(seen[0].temperature, 0);
});

test("classify says a question about the current homework is not a new problem", async (t) => {
  const { codeCoach } = classifyWith(t, '{"new_problem": false}');
  const { req, res } = httpDouble({ body: { action: "classify", homework: "Print Hello, Nova!", question: "I am stuck" } });
  await codeCoach.codeCoach(req, res);
  assert.deepEqual(res.body, { newProblem: false });
});

test("classify never fails the student: a model error, junk or a stray value all mean 'not new'", async (t) => {
  for (const content of [new Error("model down"), "not json at all", '{"new_problem": "yes"}', '{"other": 1}']) {
    const { codeCoach } = classifyWith(t, content);
    const { req, res } = httpDouble({ body: { action: "classify", homework: "Print Hello, Nova!", question: "print hello 3 times" } });
    await codeCoach.codeCoach(req, res);
    assert.equal(res.statusCode, 200, String(content));
    assert.deepEqual(res.body, { newProblem: false }, String(content));
  }
});

test("classify needs a message to look at, and sees at most the first 1000 characters of it", async (t) => {
  const empty = classifyWith(t, '{"new_problem": true}');
  const a = httpDouble({ body: { action: "classify", homework: "x", question: "   " } });
  await empty.codeCoach.codeCoach(a.req, a.res);
  assert.equal(a.res.statusCode, 400);

  const long = classifyWith(t, '{"new_problem": false}');
  const b = httpDouble({ body: { action: "classify", homework: "x", question: "q".repeat(5000) } });
  await long.codeCoach.codeCoach(b.req, b.res);
  const user = long.seen[0].messages.find(m => m.role === "user").content;
  assert.ok(user.length < 1500 + 1000 + 200);
});

// ---- detailed steps, and hints tied to a step ----------------------------------------

test("the coach prompt asks for detailed doable steps and hints that let the student do the step", async (t) => {
  let capturedRequest;
  const codeCoach = loadCodeCoachController(t, async (request) => {
    capturedRequest = request;
    return { choices: [{ message: { content: JSON.stringify({ concept: "c", explanation: "e", where_used: "w", example_code: "x", hint: "h", skeleton_code: "___", try_next: "t", steps: ["a", "b", "c", "d", "e", "f", "g", "h", "i"] }) } }] };
  });
  pool.query = async () => [{}];
  const { req, res } = httpDouble({ body: { homework: "Sort a list.", code: "", action: "start", language: "en" } });
  await codeCoach.codeCoach(req, res);

  const system = capturedRequest.messages.find(m => m.role === "system").content;
  assert.match(system, /"steps": 4-7 steps/);
  assert.match(system, /WHAT to do[\s\S]*WHY or HOW/);
  assert.match(system, /good enough that the student can actually DO the next step/);
  assert.match(system, /FIRST step that is\s+not done yet/);
  assert.match(system, /never a line of plain English/);
  assert.equal(res.body.lesson.steps.length, 8, "up to 8 steps are kept");
});

test("a hint request carries the how-to-start steps so the hint is about the first step not done yet", async (t) => {
  let capturedRequest;
  const codeCoach = loadCodeCoachController(t, async (request) => {
    capturedRequest = request;
    return { choices: [{ message: { content: JSON.stringify({ concept: "c", explanation: "e", where_used: "w", example_code: "x", hint: "h", skeleton_code: "___", try_next: "t" }) } }] };
  });
  pool.query = async () => [{}];
  const { req, res } = httpDouble({ body: {
    homework: "Sort a list.", code: "n = 5", action: "hint", language: "en",
    hints: ["First hint."], steps: ["Make a list.", "Loop over it.", "  "],
  } });
  await codeCoach.codeCoach(req, res);

  const user = capturedRequest.messages.find(m => m.role === "user").content;
  assert.match(user, /"how to start" steps the student was given/);
  assert.match(user, /1\. Make a list\./);
  assert.match(user, /2\. Loop over it\./);
  assert.match(user, /first step the student's code has not done yet/);
  assert.doesNotMatch(user, /3\. +\n/, "blank steps are dropped");
  assert.match(user, /Hints already given/, "still sends the earlier hints too");
});

test("steps are added to a hint request even before any hint has been given", async (t) => {
  let capturedRequest;
  const codeCoach = loadCodeCoachController(t, async (request) => {
    capturedRequest = request;
    return { choices: [{ message: { content: JSON.stringify({ concept: "c", explanation: "e", where_used: "w", example_code: "x", hint: "h", skeleton_code: "___", try_next: "t" }) } }] };
  });
  pool.query = async () => [{}];
  const { req, res } = httpDouble({ body: { homework: "Sort.", code: "", action: "hint", language: "en", steps: ["Make a list."] } });
  await codeCoach.codeCoach(req, res);
  const user = capturedRequest.messages.find(m => m.role === "user").content;
  assert.match(user, /1\. Make a list\./);
  assert.doesNotMatch(user, /Hints already given/);
});

test("steps are only sent with hint requests, never with other actions", async (t) => {
  const users = [];
  const codeCoach = loadCodeCoachController(t, async (request) => {
    users.push(request.messages.find(m => m.role === "user").content);
    return { choices: [{ message: { content: JSON.stringify({ concept: "c", explanation: "e", where_used: "w", example_code: "x", hint: "h", skeleton_code: "___", try_next: "t" }) } }] };
  });
  pool.query = async () => [{}];
  const { req, res } = httpDouble({ body: { homework: "Sort.", code: "", action: "start", language: "en", steps: ["Make a list."] } });
  await codeCoach.codeCoach(req, res);
  assert.doesNotMatch(users[0], /how to start/);
});

// ---- the answer must be in the language the student chose ------------------------------

const coachJson = (text) => JSON.stringify({
  concept: text, explanation: text, where_used: text, example_code: "x = 1",
  hint: text, skeleton_code: "x = ___", try_next: text, steps: [text],
  concepts: [{ name: "n", why: text, before: "x = 1", what: text, how: text, example: "x = 2", mistake: text }],
});
const KOREAN = "먼저 반복문을 사용하여 문장을 다섯 번 출력하는 프로그램을 만들어 보세요.";
const BURMESE = "ပထမဦးစွာ ထပ်ခါထပ်ခါလုပ်တဲ့ for loop ကို သုံးပြီး စာကြောင်းကို ငါးကြိမ် ထုတ်ပါ။";
const ENGLISH = "First, use a loop to print the sentence five times in a row.";

function languageRun(t, replies, body) {
  const calls = [];
  const codeCoach = loadCodeCoachController(t, async (request) => {
    calls.push(request);
    return { choices: [{ message: { content: coachJson(replies[Math.min(calls.length - 1, replies.length - 1)]) } }] };
  });
  pool.query = async () => [{}];
  const { req, res } = httpDouble({ body: { homework: "Print 5 times.", code: "", action: "start", ...body } });
  return { calls, run: () => codeCoach.codeCoach(req, res), res };
}

test("a Korean answer to a Burmese student is rewritten once in Burmese before it is returned", async (t) => {
  const { calls, run, res } = languageRun(t, [KOREAN, BURMESE], { language: "my" });
  await run();
  assert.equal(calls.length, 2, "exactly one rewrite");
  const retryMessages = calls[1].messages;
  assert.equal(retryMessages.at(-2).role, "assistant");
  assert.match(retryMessages.at(-1).content, /not written in Burmese/);
  assert.match(retryMessages.at(-1).content, /same JSON structure/);
  assert.equal(res.statusCode, 200);
  assert.match(res.body.coach.hint, /for loop/);
  assert.equal(/[가-힣]/.test(res.body.coach.hint), false);
});

test("an answer already in the chosen language is not rewritten", async (t) => {
  for (const [language, reply] of [["my", BURMESE], ["ko", KOREAN], ["en", ENGLISH]]) {
    const { calls, run } = languageRun(t, [reply], { language });
    await run();
    assert.equal(calls.length, 1, language);
  }
});

test("an English student gets a rewrite when the model answers in Korean, and the reverse for Korean", async (t) => {
  const english = languageRun(t, [KOREAN, ENGLISH], { language: "en" });
  await english.run();
  assert.equal(english.calls.length, 2);
  assert.match(english.res.body.coach.hint, /loop/);

  const korean = languageRun(t, [ENGLISH, KOREAN], { language: "ko" });
  await korean.run();
  assert.equal(korean.calls.length, 2);
  assert.match(korean.res.body.coach.hint, /반복문/);
});

test("if the rewrite is no better, or fails, the first answer is kept and the request still succeeds", async (t) => {
  const stillWrong = languageRun(t, [KOREAN, KOREAN], { language: "my" });
  await stillWrong.run();
  assert.equal(stillWrong.calls.length, 2, "only one retry, never a loop");
  assert.equal(stillWrong.res.statusCode, 200);

  const calls = [];
  const codeCoach = loadCodeCoachController(t, async (request) => {
    calls.push(request);
    if (calls.length === 2) throw new Error("model down on the retry");
    return { choices: [{ message: { content: coachJson(KOREAN) } }] };
  });
  pool.query = async () => [{}];
  const { req, res } = httpDouble({ body: { homework: "Print 5 times.", code: "", action: "start", language: "my" } });
  await codeCoach.codeCoach(req, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body.coach.hint, /반복문/);
});

test("an unknown language code never triggers a rewrite", async (t) => {
  const { calls, run } = languageRun(t, [KOREAN], { language: "xx" });
  await run();
  assert.equal(calls.length, 1);
});

test("the same check covers hints, so a hint is never silently in the wrong language", async (t) => {
  const { calls, run, res } = languageRun(t, [KOREAN, BURMESE], { language: "my", action: "hint", hints: ["h1"], steps: ["s1"] });
  await run();
  assert.equal(calls.length, 2);
  assert.equal(res.statusCode, 200);
});
