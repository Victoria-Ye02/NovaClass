const test = require("node:test");
const assert = require("node:assert/strict");

const pool = require("../config/db");
const originalQuery = pool.query;
const controllerPath = require.resolve("../controllers/victoria/lecture.controller");
const openaiTextPath = require.resolve("../services/ai/openaiText");
const pdfVisionPath = require.resolve("../services/ai/pdfVision");

function loadController(t, { completeText, ocrPdfPageText } = {}) {
  const originals = [openaiTextPath, pdfVisionPath].map(p => [p, require.cache[p]]);
  require.cache[openaiTextPath] = {
    id: openaiTextPath, filename: openaiTextPath, loaded: true,
    exports: {
      TEXT_MODEL: "test-model",
      completeText: completeText || (async () => { throw new Error("Unexpected completeText call"); }),
    },
  };
  require.cache[pdfVisionPath] = {
    id: pdfVisionPath, filename: pdfVisionPath, loaded: true,
    exports: { ocrPdfPageText: ocrPdfPageText || (async () => { throw new Error("Unexpected ocrPdfPageText call"); }) },
  };
  delete require.cache[controllerPath];
  const controller = require(controllerPath);
  t.after(() => {
    delete require.cache[controllerPath];
    for (const [p, original] of originals) {
      if (original) require.cache[p] = original;
      else delete require.cache[p];
    }
  });
  return controller;
}

function httpDouble({ params = {}, query = {} } = {}) {
  const req = { user: { id: 5 }, params, query };
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return { req, res };
}

const marked = (...texts) => texts.map((text, i) => `\f<<PAGE ${i + 1}>>\f${text}`).join("\n\n");
const SLIDE = "A primary key uniquely identifies every row in a table, so no two rows can share it.";

// Routes pool.query by SQL so each test only describes the rows it cares about.
function fakeDb({ material, cached = [] }) {
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (/FROM materials/.test(sql)) return [material ? [material] : []];
    if (/FROM lecture_scripts/.test(sql)) return [cached];
    return [{}];
  };
  return calls;
}

test.afterEach(() => { pool.query = originalQuery; });

test("getSlideScript rejects a page that is not a positive integer", async t => {
  pool.query = async () => { throw new Error("must not touch the database for an invalid page"); };
  const controller = loadController(t);
  for (const page of ["abc", "0", "-3", "1.5", "", "99999"]) {
    const { req, res } = httpDouble({ params: { materialId: "9", page } });
    await controller.getSlideScript(req, res);
    assert.equal(res.statusCode, 400, `page ${page}`);
  }
});

test("getSlideScript returns 404 for an unknown material", async t => {
  fakeDb({ material: null });
  const controller = loadController(t);
  const { req, res } = httpDouble({ params: { materialId: "9", page: "1" } });
  await controller.getSlideScript(req, res);
  assert.equal(res.statusCode, 404);
});

test("getSlideScript generates a narration for the slide's own text, stores it, and answers in the selected language", async t => {
  const calls = fakeDb({ material: { title: "Databases", instructions: "", text_content: marked("Intro", SLIDE), file_path: "x.pdf" } });
  let request;
  const controller = loadController(t, {
    completeText: async r => {
      request = r;
      return { choices: [{ message: { content: JSON.stringify({ narration: "기본키는 각 행을 구별해요.", key_points: ["기본키", "유일성"] }) } }] };
    },
    ocrPdfPageText: async () => null,
  });

  const { req, res } = httpDouble({ params: { materialId: "9", page: "2" }, query: { lang: "ko", total: "41" } });
  await controller.getSlideScript(req, res);

  assert.deepEqual(res.body, { page: 2, lang: "ko", available: true, narration: "기본키는 각 행을 구별해요.", keyPoints: ["기본키", "유일성"], cached: false });
  assert.deepEqual(request.responseFormat, { type: "json_object" });
  assert.match(request.messages[0].content, /Korean/);
  assert.match(request.messages[0].content, /해요체/);
  assert.match(request.messages[1].content, /slide 2 of 41/i);
  assert.match(request.messages[1].content, /primary key uniquely identifies/);
  const insert = calls.find(c => /INSERT INTO lecture_scripts/.test(c.sql));
  assert.ok(insert, "expected the script to be cached");
  assert.deepEqual(insert.params.slice(0, 3), ["9", 2, "ko"]);
  assert.equal(insert.params[6], "test-model");
});

test("getSlideScript serves a cached script without calling the AI", async t => {
  const hashSeen = [];
  pool.query = async (sql, params) => {
    if (/FROM materials/.test(sql)) return [[{ title: "Databases", instructions: "", text_content: marked("Intro", SLIDE), file_path: "x.pdf" }]];
    if (/FROM lecture_scripts/.test(sql)) { hashSeen.push(params[3]); return [[{ narration: "Cached lecture.", key_points: '["Keys"]' }]]; }
    return [{}];
  };
  const controller = loadController(t); // completeText throws if called
  const { req, res } = httpDouble({ params: { materialId: "9", page: "2" }, query: { lang: "en" } });
  await controller.getSlideScript(req, res);

  assert.deepEqual(res.body, { page: 2, lang: "en", available: true, narration: "Cached lecture.", keyPoints: ["Keys"], cached: true });
  assert.match(hashSeen[0], /^[0-9a-f]{40}$/);
});

test("getSlideScript looks up a different cache entry when the slide text changes", async t => {
  const hashes = [];
  const run = async text => {
    pool.query = async (sql, params) => {
      if (/FROM materials/.test(sql)) return [[{ title: "T", instructions: "", text_content: marked(text), file_path: "x.pdf" }]];
      if (/FROM lecture_scripts/.test(sql)) { hashes.push(params[3]); return [[{ narration: "n", key_points: "[]" }]]; }
      return [{}];
    };
    const controller = loadController(t);
    const { req, res } = httpDouble({ params: { materialId: "9", page: "1" }, query: { lang: "en" } });
    await controller.getSlideScript(req, res);
  };
  await run(SLIDE);
  await run(SLIDE + " Edited by the teacher.");
  assert.notEqual(hashes[0], hashes[1]);
});

test("getSlideScript reports an unreadable slide instead of inventing a lecture", async t => {
  const calls = fakeDb({ material: { title: "Scan", instructions: "", text_content: marked("Intro", "   "), file_path: "scan.docx" } });
  const controller = loadController(t); // no AI, no OCR (not a pdf)
  const { req, res } = httpDouble({ params: { materialId: "9", page: "2" }, query: { lang: "en" } });
  await controller.getSlideScript(req, res);

  assert.equal(res.body.available, false);
  assert.equal(res.body.reason, "no_text");
  assert.equal(res.body.narration, "");
  assert.equal(calls.some(c => /INSERT INTO lecture_scripts/.test(c.sql)), false);
});

test("getSlideScript reads an image-only PDF slide with vision OCR and caches that text back", async t => {
  const calls = fakeDb({ material: { title: "Deck", instructions: "", text_content: marked("Intro", ""), file_path: "uploads/deck.pdf" } });
  let ocrPage;
  const controller = loadController(t, {
    ocrPdfPageText: async (pdfPath, page) => { ocrPage = page; return "Normalization removes redundant data from a database design."; },
    completeText: async r => {
      assert.match(r.messages[1].content, /Normalization removes redundant data/);
      return { choices: [{ message: { content: JSON.stringify({ narration: "Let's talk about normalization.", key_points: [] }) } }] };
    },
  });
  const { req, res } = httpDouble({ params: { materialId: "9", page: "2" }, query: { lang: "en" } });
  await controller.getSlideScript(req, res);

  assert.equal(ocrPage, 2);
  assert.equal(res.body.available, true);
  const update = calls.find(c => /UPDATE materials SET text_content/.test(c.sql));
  assert.ok(update, "expected the OCR text to be written back");
  assert.match(update.params[0], /Normalization removes redundant data/);
});

test("getSlideScript strips markdown and falls back to plain text when the model ignores the JSON format", async t => {
  fakeDb({ material: { title: "T", instructions: "", text_content: marked(SLIDE), file_path: "x.pdf" } });
  const controller = loadController(t, {
    completeText: async () => ({ choices: [{ message: { content: "**Welcome** to the `lesson`! # Today we learn keys." } }] }),
    ocrPdfPageText: async () => null,
  });
  const { req, res } = httpDouble({ params: { materialId: "9", page: "1" }, query: { lang: "en" } });
  await controller.getSlideScript(req, res);

  assert.equal(res.body.narration, "Welcome to the lesson! Today we learn keys.");
  assert.deepEqual(res.body.keyPoints, []);
});

test("getSlideScript falls back to English for an unsupported language code", async t => {
  fakeDb({ material: { title: "T", instructions: "", text_content: marked(SLIDE), file_path: "x.pdf" } });
  let system;
  const controller = loadController(t, {
    completeText: async r => { system = r.messages[0].content; return { choices: [{ message: { content: JSON.stringify({ narration: "Hello.", key_points: [] }) } }] }; },
    ocrPdfPageText: async () => null,
  });
  const { req, res } = httpDouble({ params: { materialId: "9", page: "1" }, query: { lang: "xx" } });
  await controller.getSlideScript(req, res);

  assert.equal(res.body.lang, "en");
  assert.match(system, /in English/);
});

// ---- pop-up quick checks ----------------------------------------------------

const MCQ_JSON = JSON.stringify({
  question: "What does a primary key do?",
  options: ["Uniquely identifies a row", "Sorts the table", "Encrypts data", "Deletes duplicates"],
  answer: 0,
  explanation: "It guarantees no two rows share the same key.",
  practice_prompt: "Write one example of a good primary key.",
});

function fakeQuizDb({ material, cachedQuiz = [], storedQuiz = [] }) {
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (/FROM materials/.test(sql)) return [material ? [material] : []];
    if (/FROM lecture_quizzes WHERE material_id = \? AND page_no = \? AND lang = \? AND content_hash/.test(sql)) return [cachedQuiz];
    if (/FROM lecture_quizzes WHERE id = \?/.test(sql)) return [storedQuiz];
    if (/INSERT INTO lecture_quizzes/.test(sql)) return [{ insertId: 77 }];
    return [{}];
  };
  return calls;
}

test("getSlideQuiz generates a question and never sends the answer to the client", async t => {
  const calls = fakeQuizDb({ material: { title: "DB", instructions: "", text_content: marked(SLIDE), file_path: "x.pdf" } });
  const controller = loadController(t, { completeText: async () => ({ choices: [{ message: { content: MCQ_JSON } }] }) });
  const { req, res } = httpDouble({ params: { materialId: "9", page: "1" }, query: { lang: "en" } });
  await controller.getSlideQuiz(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.quizId, 77);
  assert.equal(res.body.kind, "mcq");
  assert.equal(res.body.options.length, 4);
  for (const secret of ["answer", "correctIndex", "explanation", "practicePrompt"]) {
    assert.equal(secret in res.body, false, `${secret} must stay on the server`);
  }
  const insert = calls.find(c => /INSERT INTO lecture_quizzes/.test(c.sql));
  assert.ok(insert, "the quiz is cached");
  const stored = JSON.parse(insert.params[4]);
  assert.equal(stored.options[stored.answer], "Uniquely identifies a row", "stored answer index follows the shuffle");
});

test("getSlideQuiz uses true/false on even pages and localizes the options", async t => {
  fakeQuizDb({ material: { title: "DB", instructions: "", text_content: marked("x".repeat(30), SLIDE), file_path: "x.pdf" } });
  const controller = loadController(t, {
    completeText: async () => ({ choices: [{ message: { content: JSON.stringify({ statement: "Keys repeat.", answer: false, explanation: "They cannot.", practice_prompt: "Try it." }) } }] }),
  });
  const { req, res } = httpDouble({ params: { materialId: "9", page: "2" }, query: { lang: "ko" } });
  await controller.getSlideQuiz(req, res);
  assert.equal(res.body.kind, "tf");
  assert.deepEqual(res.body.options, ["맞아요", "아니에요"]);
});

test("getSlideQuiz serves a cached quiz without calling the model", async t => {
  fakeQuizDb({
    material: { title: "DB", instructions: "", text_content: marked(SLIDE), file_path: "x.pdf" },
    cachedQuiz: [{ id: 12, payload: { kind: "mcq", question: "Q?", options: ["a", "b", "c", "d"], answer: 2, explanation: "e", practicePrompt: "p" } }],
  });
  const controller = loadController(t);
  const { req, res } = httpDouble({ params: { materialId: "9", page: "1" }, query: {} });
  await controller.getSlideQuiz(req, res);
  assert.equal(res.body.quizId, 12);
  assert.equal("answer" in res.body, false);
});

test("getSlideQuiz rejects a malformed model answer with 502", async t => {
  fakeQuizDb({ material: { title: "DB", instructions: "", text_content: marked(SLIDE), file_path: "x.pdf" } });
  const controller = loadController(t, {
    completeText: async () => ({ choices: [{ message: { content: JSON.stringify({ question: "Q?", options: ["a", "a", "b", "c"], answer: 0 }) } }] }),
  });
  const { req, res } = httpDouble({ params: { materialId: "9", page: "1" }, query: {} });
  await controller.getSlideQuiz(req, res);
  assert.equal(res.statusCode, 502);
});

test("getSlideQuiz reports unreadable slides as unavailable", async t => {
  fakeQuizDb({ material: { title: "DB", instructions: "", text_content: marked("hi"), file_path: "x.docx" } });
  const controller = loadController(t);
  const { req, res } = httpDouble({ params: { materialId: "9", page: "1" }, query: {} });
  await controller.getSlideQuiz(req, res);
  assert.equal(res.body.available, false);
});

test("gradeSlideQuiz grades on the server and reveals the explanation", async t => {
  const payload = { kind: "mcq", question: "Q?", options: ["a", "b", "c", "d"], answer: 2, explanation: "Because c.", practicePrompt: "Your turn." };
  fakeQuizDb({ storedQuiz: [{ payload }] });
  const controller = loadController(t);

  const right = httpDouble({ params: { materialId: "9", quizId: "12" } });
  right.req.body = { choice: 2 };
  await controller.gradeSlideQuiz(right.req, right.res);
  assert.deepEqual(right.res.body, { correct: true, correctIndex: 2, explanation: "Because c.", practicePrompt: "Your turn." });

  const wrong = httpDouble({ params: { materialId: "9", quizId: "12" } });
  wrong.req.body = { choice: 0 };
  await controller.gradeSlideQuiz(wrong.req, wrong.res);
  assert.equal(wrong.res.body.correct, false);
  assert.equal(wrong.res.body.correctIndex, 2);
});

test("gradeSlideQuiz rejects bad input and unknown quizzes", async t => {
  fakeQuizDb({ storedQuiz: [] });
  const controller = loadController(t);
  for (const body of [{}, { choice: "1" }, { choice: 4 }, { choice: -1 }, { choice: 1.5 }]) {
    const { req, res } = httpDouble({ params: { materialId: "9", quizId: "12" } });
    req.body = body;
    await controller.gradeSlideQuiz(req, res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
  const missing = httpDouble({ params: { materialId: "9", quizId: "12" } });
  missing.req.body = { choice: 1 };
  await controller.gradeSlideQuiz(missing.req, missing.res);
  assert.equal(missing.res.statusCode, 404);
});

// ---- visual pointers --------------------------------------------------------

test("validateTargets keeps only phrases that really appear in the slide text", t => {
  const { validateTargets } = loadController(t)._test;
  const slide = "A primary key uniquely identifies every row.\nForeign keys link two tables.";
  const targets = validateTargets(["Primary  KEY", "composite index", "", "foreign keys link"], 4, slide);
  assert.deepEqual(targets, ["Primary KEY", "", "", "foreign keys link"]);
});

test("validateTargets pads to the sentence count and ignores junk", t => {
  const { validateTargets } = loadController(t)._test;
  assert.deepEqual(validateTargets("nope", 2, "some slide text here"), ["", ""]);
  assert.deepEqual(validateTargets(["x"], 2, "x marks"), ["", ""], "single characters are too weak to point at");
});

test("splitSpokenSentences splits the way the frontend teleprompter does", t => {
  const { splitSpokenSentences } = loadController(t)._test;
  assert.deepEqual(splitSpokenSentences("Hello there. 안녕하세요! Is it ok? Yes။ Last").map(s => s.trim()), ["Hello there.", "안녕하세요!", "Is it ok?", "Yes။", "Last"]);
});

test("getSlideCues returns validated targets aligned to the spoken sentences and caches the result", async t => {
  fakeDb({ material: { title: "DB", instructions: "", text_content: marked(SLIDE), file_path: "x.pdf" } });
  let calls = 0;
  const controller = loadController(t, {
    completeText: async () => {
      calls += 1;
      return { choices: [{ message: { content: JSON.stringify({ targets: ["primary key", "made up words"] }) } }] };
    },
  });
  const run = async () => {
    const { req, res } = httpDouble({ params: { materialId: "9", page: "1" } });
    req.body = { text: "Look at the primary key. It is great." };
    await controller.getSlideCues(req, res);
    return res;
  };
  const first = await run();
  assert.deepEqual(first.body.targets, ["primary key", ""]);
  await run();
  assert.equal(calls, 1, "the second identical request is served from cache");
});

test("getSlideCues degrades to no pointers when the model fails", async t => {
  fakeDb({ material: { title: "DB", instructions: "", text_content: marked(SLIDE), file_path: "x.pdf" } });
  const controller = loadController(t, { completeText: async () => { throw new Error("down"); } });
  const { req, res } = httpDouble({ params: { materialId: "9", page: "1" } });
  req.body = { text: "Something new to say." };
  await controller.getSlideCues(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.targets, []);
});

test("getSlideCues validates its input", async t => {
  pool.query = async () => { throw new Error("must not touch the database"); };
  const controller = loadController(t);
  for (const [page, body] of [["abc", { text: "x" }], ["1", {}], ["1", { text: "  " }], ["0", { text: "x" }]]) {
    const { req, res } = httpDouble({ params: { materialId: "9", page } });
    req.body = body;
    await controller.getSlideCues(req, res);
    assert.equal(res.statusCode, 400, `${page} ${JSON.stringify(body)}`);
  }
});
