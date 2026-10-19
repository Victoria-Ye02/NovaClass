const test = require("node:test");
const assert = require("node:assert/strict");

const pool = require("../config/db");
const originalQuery = pool.query;
const controllerPath = require.resolve("../controllers/victoria/lecture.controller");
const outlinePath = require.resolve("../services/lecture/outline");
const openaiTextPath = require.resolve("../services/ai/openaiText");
const pdfVisionPath = require.resolve("../services/ai/pdfVision");
const speech = require("../services/ai/speechPrep");

function stubModules(t, completeText) {
  const paths = [openaiTextPath, pdfVisionPath];
  const originals = paths.map(p => [p, require.cache[p]]);
  require.cache[openaiTextPath] = { id: openaiTextPath, filename: openaiTextPath, loaded: true, exports: { TEXT_MODEL: "test-model", completeText } };
  require.cache[pdfVisionPath] = { id: pdfVisionPath, filename: pdfVisionPath, loaded: true, exports: { ocrPdfPageText: async () => "" } };
  delete require.cache[controllerPath];
  delete require.cache[outlinePath];
  t.after(() => {
    delete require.cache[controllerPath];
    delete require.cache[outlinePath];
    for (const [p, original] of originals) { if (original) require.cache[p] = original; else delete require.cache[p]; }
    pool.query = originalQuery;
  });
}

const marked = (...texts) => texts.map((text, i) => `\f<<PAGE ${i + 1}>>\f${text}`).join("\n\n");
const SLIDES = [
  "Databases store structured data so programs can find it again quickly.",
  "A primary key uniquely identifies every row in a table, so no two rows share it.",
  "A foreign key points at another table's primary key and links the two tables.",
];

function httpDouble(params, query = {}) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  return { req: { user: { id: 1 }, params, query }, res };
}

// ---- speech preparation ------------------------------------------------------

test("cleanForSpeech strips markdown, emoji and links but keeps the words", () => {
  assert.equal(speech.cleanForSpeech("**Hello** 👋 there!  See [the docs](http://x.y) `now`"), "Hello there! See the docs now");
});

test("burmeseSsml pauses after every sentence and longer between paragraphs, at a gentler pace", () => {
  const ssml = speech.burmeseSsml("ပထမဝါကျ။ ဒုတိယဝါကျ။\nတတိယအပိုဒ်။", { voice: "my-MM-NilarNeural" });
  assert.match(ssml, /<voice name="my-MM-NilarNeural">/);
  assert.match(ssml, /<prosody rate="-8%"/);
  assert.equal((ssml.match(new RegExp(`<break time="${speech.SENTENCE_PAUSE_MS}ms"/>`, "g")) || []).length, 1, "one sentence pause inside the first paragraph");
  assert.equal((ssml.match(new RegExp(`<break time="${speech.PARAGRAPH_PAUSE_MS}ms"/>`, "g")) || []).length, 1, "one paragraph pause");
});

test("burmeseSsml escapes markup so lecture text cannot inject SSML", () => {
  const ssml = speech.burmeseSsml('a < b & "c" <break time="9s"/>', { voice: "v" });
  assert.equal(ssml.includes('<break time="9s"/>'), false);
  assert.match(ssml, /&lt;/);
  assert.match(ssml, /&amp;/);
});

test("elevenLabsLectureText puts pause tags between paragraphs only", () => {
  const out = speech.elevenLabsLectureText("One. Two.\nThree.");
  assert.equal(out, 'One. Two. <break time="0.7s" /> Three.');
});

// ---- lesson map --------------------------------------------------------------

test("getLessonOutline builds the storyline once, caches it, and shares one model call between concurrent requests", async t => {
  let modelCalls = 0;
  let stored = null;
  stubModules(t, async () => {
    modelCalls += 1;
    await new Promise(r => setTimeout(r, 15));
    return { choices: [{ message: { content: JSON.stringify({ storyline: "From storing data to linking tables.", slides: [{ page: 1, gist: "why databases" }, { page: 2, gist: "keys identify rows" }, { page: 9, gist: "not a real slide" }] }) } }] };
  });
  pool.query = async (sql, params) => {
    if (/FROM lecture_outlines/.test(sql)) return [stored ? [{ payload: stored }] : []];
    if (/INSERT INTO lecture_outlines/.test(sql)) { stored = JSON.parse(params[2]); return [{}]; }
    return [{}];
  };
  const { getLessonOutline } = require(outlinePath);
  const pages = SLIDES.map((text, i) => ({ page: i + 1, text }));

  const [a, b] = await Promise.all([getLessonOutline(5, "DB", pages), getLessonOutline(5, "DB", pages)]);
  assert.equal(modelCalls, 1, "concurrent requests share a single call");
  assert.equal(a.storyline, "From storing data to linking tables.");
  assert.deepEqual(a.gists, { 1: "why databases", 2: "keys identify rows" }, "gists for unknown slides are dropped");
  assert.equal(a.hash, b.hash);

  const again = await getLessonOutline(5, "DB", pages);
  assert.equal(modelCalls, 1, "the next request is served from the cache");
  assert.equal(again.storyline, a.storyline);
});

test("getLessonOutline skips single-slide decks and survives a bad model reply", async t => {
  stubModules(t, async () => ({ choices: [{ message: { content: "not json" } }] }));
  pool.query = async () => [[]];
  const { getLessonOutline } = require(outlinePath);
  assert.equal(await getLessonOutline(5, "DB", [{ page: 1, text: SLIDES[0] }]), null);
  assert.equal(await getLessonOutline(5, "DB", SLIDES.map((text, i) => ({ page: i + 1, text }))), null);
});

// ---- story-aware slide scripts ------------------------------------------------

function storyDb({ previousNarration = "" } = {}) {
  pool.query = async (sql, params) => {
    if (/FROM materials/.test(sql)) return [[{ title: "Databases 101", instructions: "", text_content: marked(...SLIDES), file_path: "x.pdf" }]];
    if (/FROM lecture_outlines/.test(sql)) return [[]];
    if (/FROM lecture_scripts WHERE material_id = \? AND page_no = \? AND lang = \? AND content_hash/.test(sql)) return [[]];
    if (/FROM lecture_scripts/.test(sql)) return [previousNarration && params[1] === 1 ? [{ narration: previousNarration }] : []];
    return [{}];
  };
}

function modelStub(requests) {
  return async request => {
    requests.push(request);
    if (/planning a lecture/.test(request.messages[0].content)) {
      return { choices: [{ message: { content: JSON.stringify({ storyline: "Data is stored, rows get keys, keys link tables.", slides: [{ page: 1, gist: "why we store data" }, { page: 2, gist: "keys identify rows" }, { page: 3, gist: "foreign keys link tables" }] }) } }] };
    }
    return { choices: [{ message: { content: JSON.stringify({ narration: "Okay. Keys now.", key_points: ["keys"] }) } }] };
  };
}

test("a slide script is written against the whole story: storyline, neighbours and the previous narration's ending", async t => {
  const requests = [];
  stubModules(t, modelStub(requests));
  storyDb({ previousNarration: "Databases keep data tidy. Next we will see how rows are told apart." });
  const { getSlideScript } = require(controllerPath);
  const { req, res } = httpDouble({ materialId: "5", page: "2" }, { lang: "en", total: "3" });
  await getSlideScript(req, res);

  assert.equal(res.statusCode, 200);
  const script = requests.find(r => !/planning a lecture/.test(r.messages[0].content));
  const user = script.messages[1].content;
  assert.match(user, /Lesson storyline: Data is stored, rows get keys, keys link tables\./);
  assert.match(user, /This slide's role in the story: keys identify rows/);
  assert.match(user, /Previous slide: why we store data/);
  assert.match(user, /Next slide: foreign keys link tables/);
  assert.match(user, /Just said .*how rows are told apart/);
  assert.match(script.messages[0].content, /connect ideas across slides/);
});

test("the first slide gets a roadmap instruction and the last slide a wrap-up", async t => {
  const requests = [];
  stubModules(t, modelStub(requests));
  storyDb();
  const { getSlideScript } = require(controllerPath);
  for (const page of ["1", "3"]) {
    const { req, res } = httpDouble({ materialId: "5", page }, { lang: "en", total: "3" });
    await getSlideScript(req, res);
  }
  const prompts = requests.filter(r => !/planning a lecture/.test(r.messages[0].content)).map(r => r.messages[0].content);
  assert.match(prompts[0], /FIRST slide.*roadmap/s);
  assert.match(prompts[1], /LAST slide.*wrap the whole lesson up/s);
});

test("Burmese scripts are asked for in spoken Burmese, not literary Burmese", async t => {
  const requests = [];
  stubModules(t, modelStub(requests));
  storyDb();
  const { getSlideScript } = require(controllerPath);
  const { req, res } = httpDouble({ materialId: "5", page: "2" }, { lang: "my", total: "3" });
  await getSlideScript(req, res);
  const prompt = requests.find(r => !/planning a lecture/.test(r.messages[0].content)).messages[0].content;
  assert.match(prompt, /SPOKEN Burmese/);
  assert.match(prompt, /တယ်/);
  assert.match(prompt, /သည်/, "the literary forms are named so the model avoids them");
});

test("a failing lesson map never blocks the script — it is written slide by slide as before", async t => {
  const requests = [];
  stubModules(t, async request => {
    requests.push(request);
    if (/planning a lecture/.test(request.messages[0].content)) throw new Error("map down");
    return { choices: [{ message: { content: JSON.stringify({ narration: "Fine.", key_points: [] }) } }] };
  });
  storyDb();
  const { getSlideScript } = require(controllerPath);
  const { req, res } = httpDouble({ materialId: "5", page: "2" }, { lang: "en", total: "3" });
  await getSlideScript(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.narration, "Fine.");
  const user = requests.find(r => !/planning a lecture/.test(r.messages[0].content)).messages[1].content;
  assert.equal(/storyline/i.test(user), false);
});

// ---- characters the voice cannot read ----------------------------------------

test("foreignScriptWords flags Latin/Hangul/Thai in Burmese, Hangul in English, and nothing legitimate", t => {
  stubModules(t, async () => ({}));
  const { foreignScriptWords } = require(controllerPath)._test;
  assert.deepEqual(foreignScriptWords("ဒီနေ့ Java နဲ့ 파일 ကို ติดตั้ง", "my").sort(), ["Java", "ติดตั้ง", "파일"].sort());
  assert.deepEqual(foreignScriptWords("ဒေတာဘေ့စ် အကြောင်း သင်ယူမယ်။", "my"), []);
  assert.deepEqual(foreignScriptWords("We use a 파일 system", "en"), ["파일"]);
  assert.deepEqual(foreignScriptWords("We use JDBC and SQL.", "en"), [], "Latin is fine in English");
  assert.deepEqual(foreignScriptWords("자바 JDBC 연동", "ko"), [], "Latin is fine in Korean");
});

test("a Burmese script containing Latin or Korean letters is rewritten once, and the clean rewrite is used", async t => {
  const scriptCalls = [];
  stubModules(t, async request => {
    if (/planning a lecture/.test(request.messages[0].content)) return { choices: [{ message: { content: JSON.stringify({ storyline: "s", slides: [] }) } }] };
    scriptCalls.push(request);
    const narration = scriptCalls.length === 1 ? "ဒီနေ့ Java နဲ့ 파일 ကို သင်မယ်။" : "ဒီနေ့ ဂျာဗားနဲ့ ဖိုင်ကို သင်မယ်။";
    return { choices: [{ message: { content: JSON.stringify({ narration, key_points: [] }) } }] };
  });
  storyDb();
  const { getSlideScript } = require(controllerPath);
  const { req, res } = httpDouble({ materialId: "5", page: "2" }, { lang: "my", total: "3" });
  await getSlideScript(req, res);

  assert.equal(scriptCalls.length, 2, "exactly one corrective rewrite");
  assert.match(scriptCalls[1].messages[1].content, /Java.*파일|파일.*Java/, "the rewrite request names the offending words");
  assert.equal(res.body.narration, "ဒီနေ့ ဂျာဗားနဲ့ ဖိုင်ကို သင်မယ်။");
});

test("a clean first draft is never rewritten, and a worse rewrite never replaces the first draft", async t => {
  let calls = 0;
  stubModules(t, async request => {
    if (/planning a lecture/.test(request.messages[0].content)) return { choices: [{ message: { content: JSON.stringify({ storyline: "s", slides: [] }) } }] };
    calls += 1;
    return { choices: [{ message: { content: JSON.stringify({ narration: "ဒီနေ့ ဒေတာဘေ့စ် သင်မယ်။", key_points: [] }) } }] };
  });
  storyDb();
  const { getSlideScript } = require(controllerPath);
  const first = httpDouble({ materialId: "5", page: "2" }, { lang: "my", total: "3" });
  await getSlideScript(first.req, first.res);
  assert.equal(calls, 1);

  calls = 0;
  const outcomes = ["a Java 파일 b", "a Java 파일 c Spring Boot"];
  stubModules(t, async request => {
    if (/planning a lecture/.test(request.messages[0].content)) return { choices: [{ message: { content: JSON.stringify({ storyline: "s", slides: [] }) } }] };
    return { choices: [{ message: { content: JSON.stringify({ narration: outcomes[calls++], key_points: [] }) } }] };
  });
  storyDb();
  const { getSlideScript: again } = require(controllerPath);
  const second = httpDouble({ materialId: "5", page: "2" }, { lang: "my", total: "3" });
  await again(second.req, second.res);
  const { toSpokenBurmese } = require("../services/ai/burmeseTerms");
  assert.equal(second.res.body.narration, toSpokenBurmese("a Java 파일 b"), "the rewrite had more foreign words, so the first draft stays");
  assert.equal(second.res.body.narration.includes("Spring"), false);
});

// ---- splitting long narrations for parallel speech -----------------------------

test("splitForSpeech groups whole sentences in order and never cuts one in half", () => {
  const sentences = Array.from({ length: 12 }, (_, i) => `ဝါကျ ${i + 1} ကို ဒီမှာ ပြောပါတယ်။`);
  const chunks = speech.splitForSpeech(sentences.join(" "), 60);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 60 || !chunk.includes(" ")), "chunks respect the size unless one sentence is longer");
  assert.equal(chunks.join(" "), sentences.join(" "), "nothing lost or reordered");
});

test("splitForSpeech keeps a single very long sentence whole and returns nothing for empty text", () => {
  const long = "စကားလုံး ".repeat(80).trim() + "။";
  assert.deepEqual(speech.splitForSpeech(long, 50), [long]);
  assert.deepEqual(speech.splitForSpeech("", 50), []);
});
