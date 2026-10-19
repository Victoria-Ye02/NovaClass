const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const pool = require("../config/db");
const originalQuery = pool.query;
const originalFetch = global.fetch;

const controllerPath = require.resolve("../controllers/victoria/classroom.controller");
const openaiTextPath = require.resolve("../services/ai/openaiText");
const pdfVisionPath = require.resolve("../services/ai/pdfVision");
const elevenLabsPath = require.resolve("../services/ai/elevenLabs");
const burmeseTtsPath = require.resolve("../services/ai/burmeseTts");

function loadController(t, { completeText, ocrPdfPageText, elevenLabsTextToSpeech, burmeseTextToSpeech } = {}) {
  const originalOpenaiText = require.cache[openaiTextPath];
  require.cache[openaiTextPath] = {
    id: openaiTextPath,
    filename: openaiTextPath,
    loaded: true,
    exports: {
      completeText,
      streamCompletion: async function* () { throw new Error("Unexpected streamCompletion call"); },
      describeImage: async () => { throw new Error("Unexpected describeImage call"); },
    },
  };

  const originalPdfVision = require.cache[pdfVisionPath];
  require.cache[pdfVisionPath] = {
    id: pdfVisionPath,
    filename: pdfVisionPath,
    loaded: true,
    exports: {
      ocrPdfPageText: ocrPdfPageText || (async () => { throw new Error("Unexpected ocrPdfPageText call"); }),
    },
  };

  const originalElevenLabs = require.cache[elevenLabsPath];
  require.cache[elevenLabsPath] = {
    id: elevenLabsPath,
    filename: elevenLabsPath,
    loaded: true,
    exports: {
      BURMESE_LECTURE_VOICE_ID: "sarah-voice",
      BURMESE_LECTURE_MODEL_ID: "eleven_v4",
      textToSpeech: elevenLabsTextToSpeech || (async () => { throw new Error("Unexpected textToSpeech call"); }),
    },
  };

  const originalBurmeseTts = require.cache[burmeseTtsPath];
  require.cache[burmeseTtsPath] = {
    id: burmeseTtsPath,
    filename: burmeseTtsPath,
    loaded: true,
    exports: {
      textToSpeech: burmeseTextToSpeech || (async () => { throw new Error("Unexpected burmese textToSpeech call"); }),
    },
  };

  delete require.cache[controllerPath];

  const controller = require(controllerPath);
  t.after(() => {
    delete require.cache[controllerPath];
    if (originalOpenaiText) require.cache[openaiTextPath] = originalOpenaiText;
    else delete require.cache[openaiTextPath];
    if (originalPdfVision) require.cache[pdfVisionPath] = originalPdfVision;
    else delete require.cache[pdfVisionPath];
    if (originalElevenLabs) require.cache[elevenLabsPath] = originalElevenLabs;
    else delete require.cache[elevenLabsPath];
    if (originalBurmeseTts) require.cache[burmeseTtsPath] = originalBurmeseTts;
    else delete require.cache[burmeseTtsPath];
  });
  return controller;
}

function httpDouble({ user = { id: 2 }, params = {}, body = {}, files = {} } = {}) {
  const req = { user, params, body, files };
  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
  return { req, res };
}

test.afterEach(() => {
  pool.query = originalQuery;
  global.fetch = originalFetch;
});

test("teacher-mode chat grounds Nova in the current PDF page and starts a professor-led lesson", async (t) => {
  global.fetch = async () => { throw new Error("RAG unavailable in test"); };
  pool.query = async (sql) => {
    if (sql.includes("FROM materials")) {
      return [[{
        title: "Database Lesson",
        instructions: null,
        text_content: "\f<<PAGE 1>>\fIntroduction\n\n\f<<PAGE 2>>\fA primary key uniquely identifies every row in a table.",
        summary_paragraph: null,
        summary_detailed: null,
      }]];
    }
    if (sql.includes("material_chat_cache")) throw new Error("Teacher mode must not use generic chat cache");
    return [[]];
  };

  let capturedMessages;
  const controller = loadController(t, {
    completeText: async (request) => {
      capturedMessages = request.messages;
      return { choices: [{ message: { content: "Let's begin." } }] };
    },
  });

  const { req, res } = httpDouble({
    params: { materialId: "9" },
    body: {
      action: "chat", mode: "teacher", teachingIntent: "start",
      message: "Start this lesson as my professor.", history: [],
      currentPage: 2, totalPages: 2, lang: "en",
    },
  });

  await controller.materialAI(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reply, "Let's begin.");
  const systemMessage = capturedMessages.find((m) => m.role === "system").content;
  assert.match(systemMessage, /A primary key uniquely identifies every row/i);
  assert.match(systemMessage, /learning goal/i);
  assert.match(systemMessage, /example/i);
  assert.match(systemMessage, /check.*understanding/i);
  assert.doesNotMatch(systemMessage, /Level Up AI Study Tutor/i);
});

test("teacher-mode answer asks Nova to give supportive feedback before the next teaching step", async (t) => {
  global.fetch = async () => { throw new Error("RAG unavailable in test"); };
  pool.query = async (sql) => {
    if (sql.includes("FROM materials")) {
      return [[{ title: "Database Lesson", instructions: null, text_content: "A primary key is unique.", summary_paragraph: null, summary_detailed: null }]];
    }
    return [[]];
  };

  let capturedMessages;
  const controller = loadController(t, {
    completeText: async (request) => {
      capturedMessages = request.messages;
      return { choices: [{ message: { content: "Good thinking." } }] };
    },
  });

  const { req, res } = httpDouble({
    params: { materialId: "9" },
    body: {
      action: "chat", mode: "teacher", teachingIntent: "answer", message: "It identifies a row.",
      history: [{ role: "assistant", content: "Quick check: what does a primary key do?" }],
      currentPage: 1, totalPages: 1, lang: "en",
    },
  });

  await controller.materialAI(req, res);

  assert.equal(res.statusCode, 200);
  const systemMessage = capturedMessages.find((m) => m.role === "system").content;
  assert.match(systemMessage, /supportive feedback/i);
  assert.match(systemMessage, /correct.*misunderstanding/i);
  assert.match(systemMessage, /next teaching step/i);
});

test("assistant-mode chat sends a plain-assistant system prompt with the current page, not the quiz-tutor prompt", async (t) => {
  global.fetch = async () => { throw new Error("RAG unavailable in test"); };
  pool.query = async (sql) => {
    if (sql.includes("FROM materials")) {
      return [[{
        title: "JDBC와 응용 프로젝트 I",
        instructions: null,
        text_content: "2026-1학기 | JAVA프로그래밍실무 2th week JDBC와응용프로젝트I",
        summary_paragraph: null,
        summary_detailed: null,
      }]];
    }
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  let capturedMessages;
  const controller = loadController(t, {
    completeText: async (request) => {
      capturedMessages = request.messages;
      return { choices: [{ message: { content: "Sure, here's what page 2 covers." } }] };
    },
  });

  const { req, res } = httpDouble({
    params: { materialId: "9" },
    body: {
      action: "chat",
      mode: "assistant",
      message: "explain this page",
      history: [],
      currentPage: 2,
      totalPages: 41,
      lang: "en",
    },
  });

  await controller.materialAI(req, res);

  assert.equal(res.statusCode, 200);
  const systemMessage = capturedMessages.find((m) => m.role === "system").content;
  assert.match(systemMessage, /page 2 of 41/i);
  assert.doesNotMatch(systemMessage, /take initiative/i);
  assert.doesNotMatch(systemMessage, /Level Up AI Study Tutor/i);
});

test("assistant-mode chat tells the model to answer in whatever language the student's question is in, not a fixed Settings language", async (t) => {
  global.fetch = async () => { throw new Error("RAG unavailable in test"); };
  pool.query = async (sql) => {
    if (sql.includes("FROM materials")) {
      return [[{
        title: "JDBC와 응용 프로젝트 I",
        instructions: null,
        text_content: "2026-1학기 | JAVA프로그래밍실무 2th week JDBC와응용프로젝트I",
        summary_paragraph: null,
        summary_detailed: null,
      }]];
    }
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  let capturedMessages;
  const controller = loadController(t, {
    completeText: async (request) => {
      capturedMessages = request.messages;
      return { choices: [{ message: { content: "..." } }] };
    },
  });

  // Settings language is "en", but the student actually typed their
  // question in Korean — the reply should follow the question, not Settings.
  const { req, res } = httpDouble({
    params: { materialId: "9" },
    body: {
      action: "chat",
      mode: "assistant",
      message: "이 페이지는 뭐에 관한 거야?",
      history: [],
      currentPage: 2,
      totalPages: 41,
      lang: "en",
    },
  });

  await controller.materialAI(req, res);

  assert.equal(res.statusCode, 200);
  const systemMessage = capturedMessages.find((m) => m.role === "system").content;
  assert.match(systemMessage, /detect the language/i);
  assert.doesNotMatch(systemMessage, /respond in english only/i);
});

test("assistant-mode chat instructs honesty when almost no text was extracted for the document", async (t) => {
  global.fetch = async () => { throw new Error("RAG unavailable in test"); };
  pool.query = async (sql) => {
    if (sql.includes("FROM materials")) {
      return [[{
        title: "JDBC와 응용 프로젝트 I",
        instructions: null,
        // 239 chars across 41 pages — far below any reasonable per-page average,
        // matching the real image-heavy slide deck that triggered this bug.
        text_content: "x".repeat(239),
        summary_paragraph: null,
        summary_detailed: null,
      }]];
    }
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  let capturedMessages;
  const controller = loadController(t, {
    completeText: async (request) => {
      capturedMessages = request.messages;
      return { choices: [{ message: { content: "..." } }] };
    },
  });

  const { req, res } = httpDouble({
    params: { materialId: "9" },
    body: {
      action: "chat",
      mode: "assistant",
      message: "explain this page",
      history: [],
      currentPage: 2,
      totalPages: 41,
      lang: "en",
    },
  });

  await controller.materialAI(req, res);

  const systemMessage = capturedMessages.find((m) => m.role === "system").content;
  assert.match(systemMessage, /can't read|cannot read|honestly/i);
  assert.match(systemMessage, /image-based/i);
});

// Matches the page-marker format written by extractPdfTextWithPageMarkers()
// at upload time: a form-feed-delimited "\f<<PAGE n>>\f" before each page's text.
function markedPdfText(pages) {
  return pages.map(({ page, text }) => `\f<<PAGE ${page}>>\f${text}`).join("\n\n");
}

test("assistant-mode chat gives the model the exact text of the page the student is viewing, not just its number", async (t) => {
  global.fetch = async () => { throw new Error("RAG unavailable in test"); };
  pool.query = async (sql) => {
    if (sql.includes("FROM materials")) {
      return [[{
        title: "Cell Biology",
        instructions: null,
        text_content: markedPdfText([
          { page: 1, text: "Introduction to the cell." },
          { page: 2, text: "The mitochondria is the powerhouse of the cell." },
          { page: 3, text: "Conclusion and summary." },
        ]),
        summary_paragraph: null,
        summary_detailed: null,
      }]];
    }
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  let capturedMessages;
  const controller = loadController(t, {
    completeText: async (request) => {
      capturedMessages = request.messages;
      return { choices: [{ message: { content: "..." } }] };
    },
  });

  const { req, res } = httpDouble({
    params: { materialId: "9" },
    body: {
      action: "chat", mode: "assistant", message: "what's on this page",
      history: [], currentPage: 2, totalPages: 3, lang: "en",
    },
  });

  await controller.materialAI(req, res);

  const systemMessage = capturedMessages.find((m) => m.role === "system").content;
  assert.match(systemMessage, /The mitochondria is the powerhouse of the cell\./);
  // Still whole-document aware, not just the current page in isolation.
  assert.match(systemMessage, /Introduction to the cell\./);
  assert.match(systemMessage, /Conclusion and summary\./);
});

test("assistant-mode chat honestly flags only the current page as unreadable when the rest of the document has real text", async (t) => {
  global.fetch = async () => { throw new Error("RAG unavailable in test"); };
  pool.query = async (sql) => {
    if (sql.includes("FROM materials")) {
      return [[{
        title: "Mixed Deck",
        instructions: null,
        text_content: markedPdfText([
          { page: 1, text: "A fully readable text page with plenty of real content here." },
          { page: 2, text: "" }, // image-only slide — nothing extracted
        ]),
        summary_paragraph: null,
        summary_detailed: null,
      }]];
    }
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  let capturedMessages;
  const controller = loadController(t, {
    completeText: async (request) => {
      capturedMessages = request.messages;
      return { choices: [{ message: { content: "..." } }] };
    },
  });

  const { req, res } = httpDouble({
    params: { materialId: "9" },
    body: {
      action: "chat", mode: "assistant", message: "what's on this page",
      history: [], currentPage: 2, totalPages: 2, lang: "en",
    },
  });

  await controller.materialAI(req, res);

  const systemMessage = capturedMessages.find((m) => m.role === "system").content;
  assert.match(systemMessage, /page 2.*(no extractable text|image-based)/is);
  // The document-wide sparse warning must NOT fire — most of the document has real text.
  assert.doesNotMatch(systemMessage, /most pages/i);
});

test("assistant-mode chat OCRs a page whose embedded text is unreadable and caches the result", async (t) => {
  global.fetch = async () => { throw new Error("RAG unavailable in test"); };
  const queries = [];
  pool.query = async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes("FROM materials")) {
      return [[{
        title: "Broken Font Deck",
        instructions: null,
        file_path: "1781843899651-596532.pdf",
        text_content: markedPdfText([
          { page: 1, text: "Title slide with real embedded text." },
          { page: 2, text: "" }, // font's ToUnicode mapping is broken — nothing extracted
        ]),
        summary_paragraph: null,
        summary_detailed: null,
      }]];
    }
    if (sql.startsWith("UPDATE materials")) return [{ affectedRows: 1 }];
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  let capturedMessages;
  let ocrCalledWith;
  const controller = loadController(t, {
    completeText: async (request) => {
      capturedMessages = request.messages;
      return { choices: [{ message: { content: "..." } }] };
    },
    ocrPdfPageText: async (pdfPath, pageNumber) => {
      ocrCalledWith = { pdfPath, pageNumber };
      return "데이터베이스 시스템\n- 파일 시스템의 문제점을 해결한 시스템";
    },
  });

  const { req, res } = httpDouble({
    params: { materialId: "9" },
    body: {
      action: "chat", mode: "assistant", message: "what's on this page",
      history: [], currentPage: 2, totalPages: 2, lang: "en",
    },
  });

  await controller.materialAI(req, res);

  assert.equal(ocrCalledWith.pageNumber, 2);
  assert.match(ocrCalledWith.pdfPath, /1781843899651-596532\.pdf$/);

  const systemMessage = capturedMessages.find((m) => m.role === "system").content;
  assert.match(systemMessage, /데이터베이스 시스템/);
  // Must not fall back to the "can't read this page" honesty warning once OCR succeeded.
  assert.doesNotMatch(systemMessage, /no extractable text was found for page 2/i);

  // Cached back to the database so the next student's question skips the OCR round-trip.
  const update = queries.find(q => q.sql.startsWith("UPDATE materials"));
  assert.ok(update, "expected text_content to be cached back to the database");
  assert.match(update.params[0], /데이터베이스 시스템/);
  assert.equal(update.params[1], "9");
});

test("assistant-mode chat caches an OCR'd page even when that page never had a marker at all, not just when it had an empty one", async (t) => {
  // Some pages are dropped entirely from text_content at extraction time
  // (pure-image pages that produce zero text items) rather than getting an
  // empty marker — e.g. only page 2 exists here, page 1 is missing outright.
  // The OCR cache-write must still be able to insert page 1 into the marked
  // text, not silently no-op because there was nothing to "replace".
  global.fetch = async () => { throw new Error("RAG unavailable in test"); };
  const queries = [];
  pool.query = async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes("FROM materials")) {
      return [[{
        title: "Scanned Worksheet",
        instructions: null,
        file_path: "1781843899651-596532.pdf",
        text_content: markedPdfText([
          { page: 2, text: "Circle the correct word or phrase." },
        ]),
        summary_paragraph: null,
        summary_detailed: null,
      }]];
    }
    if (sql.startsWith("UPDATE materials")) return [{ affectedRows: 1 }];
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  let capturedMessages;
  const controller = loadController(t, {
    completeText: async (request) => {
      capturedMessages = request.messages;
      return { choices: [{ message: { content: "..." } }] };
    },
    ocrPdfPageText: async () => "GRAMMAR superlatives — bad, good, exciting, safe, far, ugly, friendly, wet",
  });

  const { req, res } = httpDouble({
    params: { materialId: "9" },
    body: {
      action: "chat", mode: "assistant", message: "what's on page 1",
      history: [], currentPage: 1, totalPages: 2, lang: "en",
    },
  });

  await controller.materialAI(req, res);

  const systemMessage = capturedMessages.find((m) => m.role === "system").content;
  assert.match(systemMessage, /GRAMMAR superlatives/);

  const update = queries.find(q => q.sql.startsWith("UPDATE materials"));
  assert.ok(update, "expected text_content to be cached back to the database");
  assert.match(update.params[0], /<<PAGE 1>>.*GRAMMAR superlatives/s);
  // The pre-existing page 2 content must survive the rewrite untouched.
  assert.match(update.params[0], /<<PAGE 2>>.*Circle the correct word/s);
});

test("assistant-mode chat falls back to the honest 'can't read' message when OCR finds nothing", async (t) => {
  global.fetch = async () => { throw new Error("RAG unavailable in test"); };
  pool.query = async (sql) => {
    if (sql.includes("FROM materials")) {
      return [[{
        title: "Broken Font Deck",
        instructions: null,
        file_path: "1781843899651-596532.pdf",
        text_content: markedPdfText([
          { page: 1, text: "Title slide with real embedded text." },
          { page: 2, text: "" },
        ]),
        summary_paragraph: null,
        summary_detailed: null,
      }]];
    }
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  let capturedMessages;
  const controller = loadController(t, {
    completeText: async (request) => {
      capturedMessages = request.messages;
      return { choices: [{ message: { content: "..." } }] };
    },
    ocrPdfPageText: async () => null, // genuinely blank page, or the vision call failed
  });

  const { req, res } = httpDouble({
    params: { materialId: "9" },
    body: {
      action: "chat", mode: "assistant", message: "what's on this page",
      history: [], currentPage: 2, totalPages: 2, lang: "en",
    },
  });

  await controller.materialAI(req, res);

  const systemMessage = capturedMessages.find((m) => m.role === "system").content;
  assert.match(systemMessage, /page 2.*(no extractable text|image-based)/is);
});

test("assistant-mode chat instructs the model to stay scoped to this lesson's material and redirect unrelated questions", async (t) => {
  global.fetch = async () => { throw new Error("RAG unavailable in test"); };
  pool.query = async (sql) => {
    if (sql.includes("FROM materials")) {
      return [[{
        title: "JDBC와 응용 프로젝트 I",
        instructions: null,
        text_content: "2026-1학기 | JAVA프로그래밍실무 2th week JDBC와응용프로젝트I",
        summary_paragraph: null,
        summary_detailed: null,
      }]];
    }
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  let capturedMessages;
  const controller = loadController(t, {
    completeText: async (request) => {
      capturedMessages = request.messages;
      return { choices: [{ message: { content: "..." } }] };
    },
  });

  const { req, res } = httpDouble({
    params: { materialId: "9" },
    body: {
      action: "chat", mode: "assistant", message: "what's this page about",
      history: [], currentPage: 2, totalPages: 41, lang: "en",
    },
  });

  await controller.materialAI(req, res);

  const systemMessage = capturedMessages.find((m) => m.role === "system").content;
  assert.match(systemMessage, /only.*(this lesson|this material|this document)/i);
  assert.match(systemMessage, /unrelated/i);
});

test("assistant-mode chat returns a cached answer for a repeat first-turn question without calling the AI", async (t) => {
  global.fetch = async () => { throw new Error("RAG unavailable in test"); };
  pool.query = async (sql) => {
    if (sql.includes("FROM materials")) {
      return [[{ title: "Cell Biology", instructions: null, text_content: "cell stuff", summary_paragraph: null, summary_detailed: null }]];
    }
    if (sql.startsWith("SELECT answer FROM material_chat_cache")) {
      return [[{ answer: "The mitochondria is the powerhouse of the cell." }]];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  const controller = loadController(t, {
    completeText: async () => { throw new Error("completeText should not be called on a cache hit"); },
  });

  const { req, res } = httpDouble({
    params: { materialId: "9" },
    body: {
      action: "chat", mode: "assistant", message: "what does mitochondria do",
      history: [], currentPage: 2, totalPages: 3, lang: "en",
    },
  });

  await controller.materialAI(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reply, "The mitochondria is the powerhouse of the cell.");
  assert.equal(res.body.cached, true);
});

test("assistant-mode chat skips the cache and calls the AI when there's prior conversation history", async (t) => {
  global.fetch = async () => { throw new Error("RAG unavailable in test"); };
  const queries = [];
  pool.query = async (sql) => {
    queries.push(sql);
    if (sql.includes("FROM materials")) {
      return [[{ title: "Cell Biology", instructions: null, text_content: "cell stuff", summary_paragraph: null, summary_detailed: null }]];
    }
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  let completeTextCalled = false;
  const controller = loadController(t, {
    completeText: async () => { completeTextCalled = true; return { choices: [{ message: { content: "Follow-up answer." } }] }; },
  });

  const { req, res } = httpDouble({
    params: { materialId: "9" },
    body: {
      action: "chat", mode: "assistant", message: "and why is that",
      history: [{ role: "user", content: "what does mitochondria do" }, { role: "assistant", content: "It powers the cell." }],
      currentPage: 2, totalPages: 3, lang: "en",
    },
  });

  await controller.materialAI(req, res);

  assert.equal(completeTextCalled, true);
  assert.equal(res.body.reply, "Follow-up answer.");
  // The cache SELECT must never run for a follow-up question — its answer depends on history.
  assert.ok(!queries.some(sql => sql.startsWith("SELECT answer FROM material_chat_cache")));
});

test("omitting assistant mode preserves the existing Level Up quiz-tutor behavior", async (t) => {
  global.fetch = async () => { throw new Error("RAG unavailable in test"); };
  pool.query = async (sql) => {
    if (sql.includes("FROM materials")) {
      return [[{
        title: "JDBC와 응용 프로젝트 I",
        instructions: null,
        text_content: "Some material text.",
        summary_paragraph: null,
        summary_detailed: null,
      }]];
    }
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  let capturedMessages;
  const controller = loadController(t, {
    completeText: async (request) => {
      capturedMessages = request.messages;
      return { choices: [{ message: { content: "Let's begin! Question 1..." } }] };
    },
  });

  const { req, res } = httpDouble({
    params: { materialId: "9" },
    body: {
      action: "chat",
      message: "I'm ready",
      history: [],
      level: "intermediate",
      lang: "en",
    },
  });

  await controller.materialAI(req, res);

  const systemMessage = capturedMessages.find((m) => m.role === "system").content;
  assert.match(systemMessage, /Level Up AI Study Tutor/i);
  assert.match(systemMessage, /take initiative/i);
});

test("materialAI summary returns the cached result for this material without calling the AI", async (t) => {
  pool.query = async (sql) => {
    if (sql.includes("FROM materials")) {
      return [[{ title: "Cell Biology", instructions: null, text_content: "cell stuff", summary_paragraph: null, summary_detailed: null }]];
    }
    if (sql.startsWith("SELECT result_json FROM material_ai_cache")) {
      return [[{ result_json: ["Point one", "Point two"] }]];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  const controller = loadController(t, {
    completeText: async () => { throw new Error("completeText should not be called on a cache hit"); },
  });

  const { req, res } = httpDouble({ params: { materialId: "9" }, body: { action: "summary" } });
  await controller.materialAI(req, res);

  assert.deepEqual(res.body.data, ["Point one", "Point two"]);
  assert.equal(res.body.cached, true);
});

test("materialAI summary calls the AI and caches the result when nothing is cached for this material yet", async (t) => {
  const queries = [];
  pool.query = async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes("FROM materials")) {
      return [[{ title: "Cell Biology", instructions: null, text_content: "cell stuff", summary_paragraph: null, summary_detailed: null }]];
    }
    if (sql.startsWith("SELECT result_json FROM material_ai_cache")) return [[]];
    if (sql.startsWith("INSERT INTO material_ai_cache")) return [{ insertId: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  };

  const controller = loadController(t, {
    completeText: async () => ({ choices: [{ message: { content: JSON.stringify({ data: ["Point A", "Point B"] }) } }] }),
  });

  const { req, res } = httpDouble({ params: { materialId: "9" }, body: { action: "summary" } });
  await controller.materialAI(req, res);

  assert.deepEqual(res.body.data, ["Point A", "Point B"]);
  const insert = queries.find(q => q.sql.startsWith("INSERT INTO material_ai_cache"));
  assert.ok(insert, "expected the fresh result to be cached");
  assert.equal(insert.params[0], "9");
  assert.equal(insert.params[1], "summary");
  assert.equal(insert.params[2], "en");
  assert.deepEqual(JSON.parse(insert.params[3]), ["Point A", "Point B"]);
});

test("materialAI summary in Burmese doesn't reuse the English cache entry for the same material", async (t) => {
  const queries = [];
  pool.query = async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes("FROM materials")) {
      return [[{ title: "Cell Biology", instructions: null, text_content: "cell stuff", summary_paragraph: null, summary_detailed: null }]];
    }
    if (sql.startsWith("SELECT result_json FROM material_ai_cache")) return [[]];
    if (sql.startsWith("INSERT INTO material_ai_cache")) return [{ insertId: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  };

  const controller = loadController(t, {
    completeText: async () => ({ choices: [{ message: { content: JSON.stringify({ data: ["ပွိုင့် က" ] }) } }] }),
  });

  const { req, res } = httpDouble({ params: { materialId: "9" }, body: { action: "summary", lang: "my" } });
  await controller.materialAI(req, res);

  const cacheLookup = queries.find(q => q.sql.startsWith("SELECT result_json FROM material_ai_cache"));
  assert.deepEqual(cacheLookup.params, ["9", "summary", "my"]);
  const insert = queries.find(q => q.sql.startsWith("INSERT INTO material_ai_cache"));
  assert.equal(insert.params[2], "my");
});

test("textToSpeech streams back the audio ElevenLabs generated for the given text", async (t) => {
  let capturedText;
  const controller = loadController(t, {
    elevenLabsTextToSpeech: async (text) => {
      capturedText = text;
      return Buffer.from("fake-mp3-bytes");
    },
  });

  const { req, res } = httpDouble({ body: { text: "The mitochondria is the powerhouse of the cell." } });
  await controller.textToSpeech(req, res);

  assert.equal(capturedText, "The mitochondria is the powerhouse of the cell.");
  assert.equal(res.headers["Content-Type"], "audio/mpeg");
  assert.ok(Buffer.isBuffer(res.body));
  assert.equal(res.body.toString(), "fake-mp3-bytes");
});

test("textToSpeech rejects an empty request without calling ElevenLabs", async (t) => {
  let called = false;
  const controller = loadController(t, {
    elevenLabsTextToSpeech: async () => { called = true; return Buffer.from(""); },
  });

  const { req, res } = httpDouble({ body: { text: "   " } });
  await controller.textToSpeech(req, res);

  assert.equal(called, false);
  assert.equal(res.statusCode, 400);
});

test("textToSpeech reports 503 with a clear message when ElevenLabs isn't configured", async (t) => {
  const controller = loadController(t, {
    elevenLabsTextToSpeech: async () => {
      const error = new Error("ElevenLabs is not configured (ELEVENLABS_API_KEY is unset)");
      error.code = "ELEVENLABS_NOT_CONFIGURED";
      throw error;
    },
  });

  const { req, res } = httpDouble({ body: { text: "hello" } });
  await controller.textToSpeech(req, res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "ELEVENLABS_NOT_CONFIGURED");
});

test("textToSpeech routes Burmese text to the Burmese TTS service, not ElevenLabs (which has no Burmese voice)", async (t) => {
  let burmeseText;
  const controller = loadController(t, {
    burmeseTextToSpeech: async (text) => {
      burmeseText = text;
      return Buffer.from("burmese-mp3-bytes");
    },
    // Left as the default throwing stub — reaching ElevenLabs for Burmese
    // would be the bug this routing exists to prevent.
  });

  const { req, res } = httpDouble({ body: { text: "မင်္ဂလာပါ၊ ဒီသင်ခန်းစာက အရမ်းကောင်းတယ်။" } });
  await controller.textToSpeech(req, res);

  assert.equal(burmeseText, "မင်္ဂလာပါ၊ ဒီသင်ခန်းစာက အရမ်းကောင်းတယ်။");
  assert.equal(res.headers["Content-Type"], "audio/mpeg");
  assert.equal(res.body.toString(), "burmese-mp3-bytes");
});

test("textToSpeech reports 502 when the Burmese TTS service fails", async (t) => {
  const controller = loadController(t, {
    burmeseTextToSpeech: async () => {
      const error = new Error("Edge TTS request failed: socket hang up");
      error.code = "BURMESE_TTS_REQUEST_FAILED";
      throw error;
    },
  });

  const { req, res } = httpDouble({ body: { text: "ဟလို" } });
  await controller.textToSpeech(req, res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, "BURMESE_TTS_REQUEST_FAILED");
});

test("listUpcomingDeadlines returns undue assignments across every class this user teaches or is enrolled in, soonest first", async (t) => {
  let capturedParams;
  pool.query = async (sql, params) => {
    capturedParams = params;
    return [[
      { id: 1, title: "Essay 1", due_date: "2026-08-15T00:00:00Z", class_id: 3, class_name: "html", my_status: null },
      { id: 2, title: "Quiz 2", due_date: "2026-08-20T00:00:00Z", class_id: 5, class_name: "java", my_status: "turned_in" },
    ]];
  };

  const controller = loadController(t, {});
  const { req, res } = httpDouble({ user: { id: 27 } });
  await controller.listUpcomingDeadlines(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.deadlines.length, 2);
  assert.equal(res.body.deadlines[0].title, "Essay 1");
  assert.ok(capturedParams.includes(27));
});

test("listUpcomingDeadlines returns an empty array when nothing is due", async (t) => {
  pool.query = async () => [[]];

  const controller = loadController(t, {});
  const { req, res } = httpDouble({ user: { id: 27 } });
  await controller.listUpcomingDeadlines(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.deadlines, []);
});

test("listClasses includes real material_count and assignment_count per class, for both taught and enrolled classes", async (t) => {
  const queries = [];
  pool.query = async (sql, params) => {
    queries.push(sql);
    if (sql.includes("teacher_id = ?")) {
      return [[{ id: 1, name: "html", subject: "CS", code: "ABC123", my_role: "teacher", teacher_name: "Vic", student_count: 5, material_count: 3, assignment_count: 2 }]];
    }
    return [[{ id: 2, name: "java", subject: "CS", code: "XYZ789", my_role: "student", teacher_name: "Someone", student_count: 10, material_count: 7, assignment_count: 4 }]];
  };

  const controller = loadController(t, {});
  const { req, res } = httpDouble({ user: { id: 27 } });
  await controller.listClasses(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].material_count, 3);
  assert.equal(res.body[0].assignment_count, 2);
  assert.equal(res.body[1].material_count, 7);
  assert.equal(res.body[1].assignment_count, 4);
  assert.ok(queries.every(sql => sql.includes("material_count") && sql.includes("assignment_count")));
});

test("uploadMaterial stores every uploaded file, not just the primary document, as separate attachments", async (t) => {
  const classId = 9, userId = 2;
  const materialFileInserts = [];
  let materialsInsertParams;
  pool.query = async (sql, params) => {
    if (sql.includes("FROM classes")) return [[{ id: classId, teacher_id: userId }]];
    if (sql.startsWith("INSERT INTO materials")) { materialsInsertParams = params; return [{ insertId: 55 }]; }
    if (sql.startsWith("INSERT INTO material_files")) { materialFileInserts.push(params); return [{}]; }
    if (sql.startsWith("INSERT INTO class_posts")) return [{}];
    if (sql.includes("FROM material_files")) {
      return [[
        { id: 1, material_id: 55, file_name: "handout.pdf", file_path: "extra1-abc.pdf" },
        { id: 2, material_id: 55, file_name: "notes.docx", file_path: "extra2-def.docx" },
      ]];
    }
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  const controller = loadController(t, {});
  const { req, res } = httpDouble({
    user: { id: userId },
    params: { id: classId },
    body: { title: "Week 1 slides" },
    files: {
      file: [{ filename: "primary-123.png", originalname: "slides.png", mimetype: "image/png", path: "uploads/primary-123.png" }],
      files: [
        { filename: "extra1-abc.pdf", originalname: "handout.pdf", mimetype: "application/pdf", path: "uploads/extra1-abc.pdf" },
        { filename: "extra2-def.docx", originalname: "notes.docx", mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", path: "uploads/extra2-def.docx" },
      ],
    },
  });
  await controller.uploadMaterial(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(materialsInsertParams[4], "primary-123.png");
  assert.equal(materialFileInserts.length, 2);
  assert.deepEqual(materialFileInserts[0], [55, "handout.pdf", "extra1-abc.pdf"]);
  assert.deepEqual(materialFileInserts[1], [55, "notes.docx", "extra2-def.docx"]);
  assert.equal(res.body.files.length, 2);
});

test("uploadMaterial accepts supplementary attachments even with no primary document", async (t) => {
  const classId = 9, userId = 2;
  const materialFileInserts = [];
  pool.query = async (sql, params) => {
    if (sql.includes("FROM classes")) return [[{ id: classId, teacher_id: userId }]];
    if (sql.startsWith("INSERT INTO materials")) return [{ insertId: 56 }];
    if (sql.startsWith("INSERT INTO material_files")) { materialFileInserts.push(params); return [{}]; }
    if (sql.startsWith("INSERT INTO class_posts")) return [{}];
    if (sql.includes("FROM material_files")) return [[{ id: 3, material_id: 56, file_name: "reading.pdf", file_path: "extra-xyz.pdf" }]];
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  const controller = loadController(t, {});
  const { req, res } = httpDouble({
    user: { id: userId },
    params: { id: classId },
    body: { title: "Text-only lesson" },
    files: { files: [{ filename: "extra-xyz.pdf", originalname: "reading.pdf", mimetype: "application/pdf", path: "uploads/extra-xyz.pdf" }] },
  });
  await controller.uploadMaterial(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.file_url, null);
  assert.equal(materialFileInserts.length, 1);
  assert.equal(res.body.files.length, 1);
});

test("updateMaterial keeps existing attachments by default when editing", async (t) => {
  const classId = 9, userId = 2, materialId = 55;
  const deleteCalls = [];
  pool.query = async (sql, params) => {
    if (sql.startsWith("SELECT * FROM materials")) {
      return [[{ id: materialId, class_id: classId, title: "Week 1", instructions: null, week: 1, file_path: "primary-123.png", text_content: null, ai_resources: null }]];
    }
    if (sql.includes("FROM classes")) return [[{ id: classId, teacher_id: userId }]];
    if (sql.startsWith("UPDATE materials")) return [{}];
    if (sql.startsWith("DELETE FROM material_files")) { deleteCalls.push(params); return [{}]; }
    if (sql.includes("FROM material_files")) {
      return [[{ id: 1, material_id: materialId, file_name: "handout.pdf", file_path: "extra1-abc.pdf" }]];
    }
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  const controller = loadController(t, {});
  const { req, res } = httpDouble({
    user: { id: userId },
    params: { id: materialId },
    body: { title: "Week 1 (updated)" },
  });
  await controller.updateMaterial(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(deleteCalls.length, 0);
  assert.equal(res.body.files.length, 1);
  assert.equal(res.body.files[0].file_name, "handout.pdf");
});

test("updateMaterial deletes only the attachments explicitly listed in delete_file_ids", async (t) => {
  const classId = 9, userId = 2, materialId = 55;
  const deleteCalls = [];
  const insertCalls = [];
  pool.query = async (sql, params) => {
    if (sql.startsWith("SELECT * FROM materials")) {
      return [[{ id: materialId, class_id: classId, title: "Week 1", instructions: null, week: 1, file_path: "primary-123.png", text_content: null, ai_resources: null }]];
    }
    if (sql.includes("FROM classes")) return [[{ id: classId, teacher_id: userId }]];
    if (sql.startsWith("UPDATE materials")) return [{}];
    if (sql.startsWith("DELETE FROM material_files")) { deleteCalls.push(params); return [{}]; }
    if (sql.startsWith("INSERT INTO material_files")) { insertCalls.push(params); return [{}]; }
    if (sql.includes("FROM material_files")) return [[{ id: 2, material_id: materialId, file_name: "new.pdf", file_path: "new-1.pdf" }]];
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  const controller = loadController(t, {});
  const { req, res } = httpDouble({
    user: { id: userId },
    params: { id: materialId },
    body: { title: "Week 1", delete_file_ids: JSON.stringify([1]) },
    files: { files: [{ filename: "new-1.pdf", originalname: "new.pdf", mimetype: "application/pdf", path: "uploads/new-1.pdf" }] },
  });
  await controller.updateMaterial(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(deleteCalls[0], [[1], materialId]);
  assert.deepEqual(insertCalls[0], [materialId, "new.pdf", "new-1.pdf"]);
});

test("updateMaterial re-indexes RAG when the primary file is replaced, so chat stops answering from the old file", async (t) => {
  const classId = 9, userId = 2, materialId = 55;
  pool.query = async (sql) => {
    if (sql.startsWith("SELECT * FROM materials")) {
      return [[{ id: materialId, class_id: classId, title: "lesson1", instructions: null, week: 1, file_path: "old-file.pdf", text_content: "stale old text", ai_resources: null }]];
    }
    if (sql.includes("FROM classes")) return [[{ id: classId, teacher_id: userId }]];
    if (sql.startsWith("UPDATE materials")) return [{}];
    if (sql.includes("FROM material_files")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  const ingestCalls = [];
  global.fetch = async (url, options) => {
    ingestCalls.push({ url: String(url) });
    return { ok: true, json: async () => ({}) };
  };

  const controller = loadController(t, {});
  const fixturePath = path.join(__dirname, "fixtures", "sample.pdf");
  const { req, res } = httpDouble({
    user: { id: userId },
    params: { id: materialId },
    body: { title: "lesson1" },
    files: {
      file: [{
        filename: "new-lesson1.pdf",
        originalname: "Grammar Superlatives.pdf",
        mimetype: "application/pdf",
        path: fixturePath,
      }],
    },
  });
  await controller.updateMaterial(req, res);

  assert.equal(res.statusCode, 200);
  // ragIngest is fire-and-forget (not awaited by updateMaterial) — give its
  // microtasks a turn before asserting fetch was actually called.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ingestCalls.length, 1);
  assert.match(ingestCalls[0].url, /\/ingest$/);
});

test("listMaterials includes each material's supplementary attachments", async (t) => {
  const classId = 9, userId = 2;
  pool.query = async (sql, params) => {
    if (sql.includes("FROM classes")) return [[{ id: classId, teacher_id: userId }]];
    if (sql.includes("FROM materials m")) {
      return [[{ id: 55, title: "Week 1", instructions: null, week: 1, file_path: "primary-123.png", created_at: "2026-08-01", ai_resources: null, summary: null }]];
    }
    if (sql.includes("FROM material_files")) {
      return [[{ id: 1, material_id: 55, file_name: "handout.pdf", file_path: "extra1-abc.pdf" }]];
    }
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  const controller = loadController(t, {});
  const { req, res } = httpDouble({ user: { id: userId }, params: { id: classId } });
  await controller.listMaterials(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].files.length, 1);
  assert.equal(res.body[0].files[0].file_name, "handout.pdf");
});

test("getMaterial includes the material's supplementary attachments", async (t) => {
  const classId = 9, userId = 2, materialId = 55;
  pool.query = async (sql, params) => {
    if (sql.startsWith("SELECT id, class_id")) return [[{ id: materialId, class_id: classId, title: "Week 1", instructions: null, week: 1, file_path: "primary-123.png", created_at: "2026-08-01" }]];
    if (sql.includes("FROM classes")) return [[{ id: classId, teacher_id: userId }]];
    if (sql.includes("FROM material_files")) return [[{ id: 1, material_id: materialId, file_name: "handout.pdf", file_path: "extra1-abc.pdf" }]];
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  const controller = loadController(t, {});
  const { req, res } = httpDouble({ user: { id: userId }, params: { materialId } });
  await controller.getMaterial(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.files.length, 1);
  assert.equal(res.body.files[0].file_name, "handout.pdf");
});

test("getMaterialComments gives a student only their own private thread with the teacher", async (t) => {
  const classId = 9, materialId = 55, studentId = 5;
  let capturedParams;
  pool.query = async (sql, params) => {
    if (sql.startsWith("SELECT * FROM materials")) return [[{ id: materialId, class_id: classId }]];
    if (sql.includes("FROM classes")) return [[{ id: classId, teacher_id: 2 }]];
    if (sql.includes("FROM class_members")) return [[{ id: 1, class_id: classId, user_id: studentId }]];
    if (sql.includes("FROM material_comments")) {
      capturedParams = params;
      return [[{ id: 1, material_id: materialId, author_id: studentId, target_student_id: studentId, content: "I don't understand page 2", author_name: "Student A" }]];
    }
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  const controller = loadController(t, {});
  const { req, res } = httpDouble({ user: { id: studentId }, params: { materialId } });
  await controller.getMaterialComments(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.deepEqual(capturedParams, [materialId, studentId, studentId]);
});

test("getMaterialComments gives the teacher every student's private thread", async (t) => {
  const classId = 9, materialId = 55, teacherId = 2;
  pool.query = async (sql, params) => {
    if (sql.startsWith("SELECT * FROM materials")) return [[{ id: materialId, class_id: classId }]];
    if (sql.includes("FROM classes")) return [[{ id: classId, teacher_id: teacherId }]];
    if (sql.includes("FROM material_comments")) {
      return [[
        { id: 1, material_id: materialId, author_id: 5, target_student_id: 5, content: "question from A" },
        { id: 2, material_id: materialId, author_id: 6, target_student_id: 6, content: "question from B" },
      ]];
    }
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  const controller = loadController(t, {});
  const { req, res } = httpDouble({ user: { id: teacherId }, params: { materialId } });
  await controller.getMaterialComments(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 2);
});

test("addMaterialComment lets a student post to their own private thread without specifying a target", async (t) => {
  const classId = 9, materialId = 55, studentId = 5;
  let insertParams;
  pool.query = async (sql, params) => {
    if (sql.startsWith("SELECT * FROM materials")) return [[{ id: materialId, class_id: classId }]];
    if (sql.includes("FROM classes")) return [[{ id: classId, teacher_id: 2 }]];
    if (sql.includes("FROM class_members")) return [[{ id: 1, class_id: classId, user_id: studentId }]];
    if (sql.startsWith("INSERT INTO material_comments")) { insertParams = params; return [{ insertId: 10 }]; }
    if (sql.startsWith("SELECT mc.*")) return [[{ id: 10, material_id: materialId, author_id: studentId, target_student_id: studentId, content: "help please", author_name: "Student A" }]];
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  const controller = loadController(t, {});
  const { req, res } = httpDouble({ user: { id: studentId }, params: { materialId }, body: { content: "help please" } });
  await controller.addMaterialComment(req, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(insertParams, [materialId, studentId, studentId, "help please"]);
});

test("addMaterialComment lets a teacher reply into a specific student's thread", async (t) => {
  const classId = 9, materialId = 55, teacherId = 2, studentId = 5;
  let insertParams;
  pool.query = async (sql, params) => {
    if (sql.startsWith("SELECT * FROM materials")) return [[{ id: materialId, class_id: classId }]];
    if (sql.includes("FROM classes")) return [[{ id: classId, teacher_id: teacherId }]];
    if (sql.startsWith("INSERT INTO material_comments")) { insertParams = params; return [{ insertId: 11 }]; }
    if (sql.startsWith("SELECT mc.*")) return [[{ id: 11, material_id: materialId, author_id: teacherId, target_student_id: studentId, content: "Check page 3", author_name: "Teacher" }]];
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  const controller = loadController(t, {});
  const { req, res } = httpDouble({ user: { id: teacherId }, params: { materialId }, body: { content: "Check page 3", target_student_id: studentId } });
  await controller.addMaterialComment(req, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(insertParams, [materialId, teacherId, studentId, "Check page 3"]);
});

test("editMaterialComment refuses to update someone else's comment", async (t) => {
  const controller = loadController(t, {});
  pool.query = async (sql) => {
    if (sql.startsWith("SELECT * FROM material_comments")) return [[{ id: 5, material_id: 55, author_id: 5 }]];
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  const { req, res } = httpDouble({ user: { id: 99 }, params: { commentId: "5" }, body: { content: "hijacked" } });
  await controller.editMaterialComment(req, res);

  assert.equal(res.statusCode, 403);
});

test("deleteMaterialComment lets the author delete their own comment", async (t) => {
  const controller = loadController(t, {});
  let deletedId;
  pool.query = async (sql, params) => {
    if (sql.startsWith("SELECT * FROM material_comments")) return [[{ id: 5, material_id: 55, author_id: 5 }]];
    if (sql.startsWith("DELETE FROM material_comments")) { deletedId = params[0]; return [{ affectedRows: 1 }]; }
    if (sql.includes("material_chat_cache")) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  };

  const { req, res } = httpDouble({ user: { id: 5 }, params: { commentId: "5" } });
  await controller.deleteMaterialComment(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(deletedId, "5");
});


test("Burmese lecture narration uses ElevenLabs v4 with the chosen voice and Burmese language code", async (t) => {
  let call;
  const controller = loadController(t, {
    elevenLabsTextToSpeech: async (text, voice, options) => {
      call = { text, voice, options };
      return Buffer.from("el-v4-bytes");
    },
    // Azure is left as the throwing stub: it is only the fallback.
  });
  const { req, res } = httpDouble({ body: { text: "မင်္ဂလာပါ။ ဒီနေ့ သင်ခန်းစာကို စကြမယ်။", style: "lecture" } });
  await controller.textToSpeech(req, res);

  assert.equal(res.body.toString(), "el-v4-bytes");
  assert.equal(call.voice, "sarah-voice");
  assert.equal(call.options.modelId, "eleven_v4");
  assert.equal(call.options.languageCode, "my");
  assert.equal(call.options.lecture, true);
});

test("Burmese lecture narration falls back to the Azure voice when ElevenLabs fails", async (t) => {
  let azureOptions;
  const controller = loadController(t, {
    elevenLabsTextToSpeech: async () => { throw new Error("ElevenLabs down"); },
    burmeseTextToSpeech: async (text, voice, options) => { azureOptions = options; return Buffer.from("azure-bytes"); },
  });
  const { req, res } = httpDouble({ body: { text: "မင်္ဂလာပါ။ ဒီနေ့ သင်ခန်းစာကို စကြမယ်။ ဆက်သွားမယ်။", style: "lecture" } });
  await controller.textToSpeech(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.toString(), "azure-bytes");
  assert.deepEqual(azureOptions, { lecture: true });
});

test("quick Burmese chat replies stay on Azure (fast first audio) even though lectures moved to ElevenLabs", async (t) => {
  let usedAzure = false;
  const controller = loadController(t, {
    burmeseTextToSpeech: async () => { usedAzure = true; return Buffer.from("azure-bytes"); },
    // ElevenLabs is the throwing stub: a chat reply must not reach it.
  });
  const { req, res } = httpDouble({ body: { text: "ဟုတ်ကဲ့ပါ။" } });
  await controller.textToSpeech(req, res);
  assert.equal(usedAzure, true);
});

test("a long Burmese lecture is spoken in sentence-sized pieces and joined back in the original order", async (t) => {
  const sentences = Array.from({ length: 30 }, (_, i) => `ဒီဟာ ဝါကျ နံပါတ် ${i + 1} ဖြစ်ပါတယ်၊ ပြီးတော့ ဆက်ပြောပါမယ်။`);
  const calls = [];
  const controller = loadController(t, {
    elevenLabsTextToSpeech: async (text) => {
      calls.push(text);
      // Later pieces answer first: ordering must come from position, not timing.
      await new Promise(resolve => setTimeout(resolve, calls.length === 1 ? 20 : 1));
      return Buffer.from(`[${text.slice(0, 12)}]`);
    },
  });
  const { req, res } = httpDouble({ body: { text: sentences.join(" "), style: "lecture" } });
  await controller.textToSpeech(req, res);

  assert.ok(calls.length > 2, "split into several pieces");
  assert.ok(calls.every(piece => piece.length <= 400), "each piece is short enough to generate quickly");
  assert.equal(calls.join(" "), sentences.join(" "), "every sentence is spoken exactly once");
  assert.equal(res.body.toString(), calls.map(piece => `[${piece.slice(0, 12)}]`).join(""), "audio joined in text order");
});

test("a transient ElevenLabs failure on one piece is retried instead of dropping to Azure", async (t) => {
  let attempts = 0;
  const controller = loadController(t, {
    elevenLabsTextToSpeech: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("blip");
      return Buffer.from("ok");
    },
    // Azure is the throwing stub: a single blip must not reach it.
  });
  const { req, res } = httpDouble({ body: { text: "မင်္ဂလာပါ။ ဒီနေ့ သင်ခန်းစာကို စကြမယ်။", style: "lecture" } });
  await controller.textToSpeech(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.toString(), "ok");
  assert.equal(attempts, 2);
});


// ---- lesson language: Settings first, switch only on an explicit request --------------

function teacherRequest(body) {
  return httpDouble({
    params: { materialId: "9" },
    body: { action: "chat", mode: "teacher", currentPage: 1, totalPages: 3, history: [], ...body },
  });
}

async function runTeacher(t, body, { reply = "Good thinking. Let's continue with the idea of a key in this lesson." } = {}) {
  global.fetch = async () => { throw new Error("RAG unavailable in test"); };
  pool.query = async (sql) => (sql.includes("FROM materials")
    ? [[{ title: "Database Lesson", instructions: null, text_content: "A primary key is unique.", summary_paragraph: null, summary_detailed: null }]]
    : [[]]);
  const calls = [];
  const controller = loadController(t, {
    completeText: async (request) => { calls.push(request); return { choices: [{ message: { content: reply } }] }; },
  });
  const { req, res } = teacherRequest(body);
  await controller.materialAI(req, res);
  return { res, calls, system: calls[0].messages.find((m) => m.role === "system").content };
}

test("teacher mode teaches in the Settings language from the very first message, not in Korean", async (t) => {
  const { res, system } = await runTeacher(t, { teachingIntent: "start", message: "Start this lesson as my professor.", lang: "my" });
  assert.equal(res.statusCode, 200);
  assert.match(system, /Write the ENTIRE reply in Burmese/);
  assert.doesNotMatch(system, /Teach in Korean/);
  assert.equal(res.body.replyLang, "my");
});

test("a student typing in Korean does NOT switch a Burmese lesson to Korean", async (t) => {
  const { system, res } = await runTeacher(t, { teachingIntent: "answer", message: "기본 키가 뭐예요? 자세히 설명해 주세요.", lang: "my" });
  assert.match(system, /Write the ENTIRE reply in Burmese/);
  assert.equal(res.body.replyLang, "my");
});

test("an explicit request ('explain in English') switches the reply language for that turn", async (t) => {
  const { system, res } = await runTeacher(t, { teachingIntent: "answer", message: "Can you explain me in English?", lang: "my" });
  assert.match(system, /Write the ENTIRE reply in English/);
  assert.equal(res.body.replyLang, "en");
});

test("a spoken request in Burmese to switch to Korean is honoured", async (t) => {
  const { system, res } = await runTeacher(t, { teachingIntent: "answer", message: "ကိုရီးယားလို ရှင်းပြပါ", lang: "en" }, { reply: "좋아요. 기본 키는 각 행을 구분하는 값이에요. 그럼 다음 질문을 해 볼까요?" });
  assert.match(system, /Write the ENTIRE reply in Korean/);
  assert.match(system, /해요체/);
  assert.equal(res.body.replyLang, "ko");
});

test("the language chosen earlier sticks: later turns and lesson buttons keep using it", async (t) => {
  const afterSwitch = await runTeacher(t, { teachingIntent: "continue", message: "Continue the lesson with the next important concept.", lang: "my", lessonLang: "en" });
  assert.match(afterSwitch.system, /Write the ENTIRE reply in English/);
  assert.equal(afterSwitch.res.body.replyLang, "en");
});

test("the UI's own prompts are never mistaken for a language request", async (t) => {
  const { system } = await runTeacher(t, { teachingIntent: "start", message: "Start this lesson as my professor.", lang: "ko" });
  assert.match(system, /Write the ENTIRE reply in Korean/);
});

test("a reply that comes back in the wrong language is translated into the lesson language before the student sees it", async (t) => {
  global.fetch = async () => { throw new Error("RAG unavailable in test"); };
  pool.query = async (sql) => (sql.includes("FROM materials")
    ? [[{ title: "DB", instructions: null, text_content: "A primary key is unique.", summary_paragraph: null, summary_detailed: null }]]
    : [[]]);
  const koreanReply = "안녕하세요. 오늘은 데이터베이스의 기본 키에 대해 이야기해 볼 거예요. 기본 키는 각 행을 구분해 줘요.";
  const calls = [];
  const controller = loadController(t, {
    completeText: async (request) => {
      calls.push(request);
      return { choices: [{ message: { content: calls.length === 1 ? koreanReply : "Hello. Today we talk about primary keys. A primary key tells each row apart." } }] };
    },
  });
  const { req, res } = teacherRequest({ teachingIntent: "start", message: "Start this lesson as my professor.", lang: "en" });
  await controller.materialAI(req, res);

  assert.equal(calls.length, 2, "one translation call");
  assert.match(calls[1].messages[0].content, /into English/);
  assert.match(res.body.reply, /primary keys/);
});

test("lecture speech: Korean text keeps the Korean narrator; English/Vietnamese use the warm lesson voice", async (t) => {
  const voices = [];
  const controller = loadController(t, {
    elevenLabsTextToSpeech: async (text, voice) => { voices.push(voice); return Buffer.from("x"); },
  });
  for (const text of ["안녕하세요. 오늘은 기본 키를 배워요.", "Hello. Today we learn about keys.", "Xin chào các bạn. Hôm nay chúng ta học về khóa chính."]) {
    const { req, res } = httpDouble({ body: { text, style: "lecture" } });
    await controller.textToSpeech(req, res);
  }
  assert.equal(voices[0], undefined, "Korean: default (Korean narrator)");
  assert.equal(voices[1], "sarah-voice");
  assert.equal(voices[2], "sarah-voice");
});
