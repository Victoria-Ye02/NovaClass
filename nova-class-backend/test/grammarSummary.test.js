const test = require("node:test");
const assert = require("node:assert/strict");
process.env.KMATE_AI_PROVIDER = "openai";   // the model is stubbed; never reach a real provider

const { getGrammarSummary } = require("../services/topik/guides");

const reply = (my = {}) => JSON.stringify({
  grammarPattern: "-(으)려고",
  meaningSummary: "ရည်ရွယ်ချက်ကို ဖော်ပြတယ်။",
  explanation: "-(으)려고 က လုပ်ဆောင်ချက်တစ်ခုကို ဘာအတွက်လုပ်တာလဲ ဆိုတာကို ပြောတယ်။",
  usageNotes: "နောက်မှာ အမိန့်ပေးစာကြောင်း မလိုက်ရပါ။",
  example: { korean: "한국에서 일하려고 한국어를 배워요.", translation: "ကိုရီးယားမှာ အလုပ်လုပ်ဖို့ ကိုရီးယားစာ သင်နေတယ်။" },
  ...my,
});
const VI = JSON.stringify({
  grammarPattern: "-(으)려고",
  meaningSummary: "Diễn tả mục đích của hành động.",
  explanation: "-(으)려고 nói lên lý do hoặc mục đích mà người nói làm việc gì đó.",
  usageNotes: "Phía sau không dùng câu mệnh lệnh hoặc câu đề nghị.",
  example: { korean: "한국에서 일하려고 한국어를 배워요.", translation: "Tôi học tiếng Hàn để làm việc ở Hàn Quốc." },
});

function cacheDb() {
  const store = new Map();
  return {
    selects: 0,
    async query(sql, params = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      if (/^SELECT content FROM topik_grammar_summaries/.test(q)) { this.selects += 1; const v = store.get(params.join("|")); return [v ? [{ content: v }] : []]; }
      if (/^INSERT INTO topik_grammar_summaries/.test(q)) { store.set(`${params[0]}|${params[2]}`, params[3]); return [{}]; }
      return [{}];
    },
  };
}
const model = (...contents) => { const calls = []; const fn = async request => { calls.push(request); return { choices: [{ message: { content: contents[Math.min(calls.length - 1, contents.length - 1)] } }] }; }; fn.calls = calls; return fn; };

test("the prompt asks for the language strictly and for the exact JSON shape, in Burmese, Vietnamese and English", async () => {
  for (const [code, name] of [["my", "Burmese (Myanmar)"], ["vi", "Vietnamese"], ["en", "English"]]) {
    const ai = model(code === "vi" ? VI : code === "en" ? JSON.stringify({ grammarPattern: "-(으)려고", meaningSummary: "Purpose", explanation: "Says why you do something.", usageNotes: "No commands after it.", example: { korean: "한국어를 배워요.", translation: "I learn Korean." } }) : reply());
    const result = await getGrammarSummary(cacheDb(), ai, "-(으)려고", code);
    const prompt = ai.calls[0].messages[0].content;
    assert.match(prompt, new RegExp(`Target Language for Explanations: ${name.replace(/[()]/g, "\\$&")}`));
    assert.match(prompt, /Do NOT mix languages/);
    assert.match(prompt, /"meaningSummary": "string \(in /);
    assert.match(prompt, /Grammar \/ Question: -\(으\)려고/);
    assert.equal(result.language, code);
    assert.equal(result.grammarPattern, "-(으)려고");
    assert.ok(result.example.korean && result.example.translation);
  }
});

test("a summary is written once per grammar point and language, then read from the cache", async () => {
  const db = cacheDb();
  const ai = model(reply());
  const first = await getGrammarSummary(db, ai, "-(으)려고", "my");
  const again = await getGrammarSummary(db, ai, "  -(으)려고 ", "my");
  assert.equal(first.cached, false);
  assert.equal(again.cached, true);
  assert.equal(ai.calls.length, 1);
  const vi = await getGrammarSummary(db, model(VI), "-(으)려고", "vi");        // another language is another entry
  assert.equal(vi.cached, false);
});

test("a reply that is not in the asked language is retried once, then rejected", async () => {
  const english = JSON.stringify({ grammarPattern: "-(으)려고", meaningSummary: "Purpose", explanation: "Says why.", usageNotes: "No commands.", example: { korean: "한국어를 배워요.", translation: "I learn Korean." } });
  const ai = model(english, reply());
  const ok = await getGrammarSummary(cacheDb(), ai, "-(으)려고", "my");
  assert.equal(ai.calls.length, 2);
  assert.match(ok.meaningSummary, /[က-႟]/);
  await assert.rejects(getGrammarSummary(cacheDb(), model(english), "-(으)려고", "my"), /not written in Burmese/);
  await assert.rejects(getGrammarSummary(cacheDb(), model(reply({ usageNotes: "" })), "-(으)려고", "my"), /incomplete/);
});

test("an empty point gives nothing, and an unknown language falls back to English", async () => {
  assert.equal(await getGrammarSummary(cacheDb(), model(reply()), "   ", "en"), null);
  const english = JSON.stringify({ grammarPattern: "-(으)려고", meaningSummary: "Purpose", explanation: "Says why.", usageNotes: "No commands.", example: { korean: "한국어를 배워요.", translation: "I learn Korean." } });
  const result = await getGrammarSummary(cacheDb(), model(english), "-(으)려고", "fr");
  assert.equal(result.language, "en");
});

test("GET /grammar/explain answers, and 400 without content", async () => {
  const pool = require("../config/db");
  const original = pool.query;
  const db = cacheDb();
  pool.query = db.query.bind(db);
  const openaiTextPath = require.resolve("../services/ai/openaiText");
  const controllerPath = require.resolve("../controllers/victoria/kmate.controller");
  const saved = require.cache[openaiTextPath];
  require.cache[openaiTextPath] = { id: openaiTextPath, filename: openaiTextPath, loaded: true, exports: { completeText: async () => ({ choices: [{ message: { content: VI } }] }) } };
  delete require.cache[controllerPath];
  const controller = require(controllerPath);
  const res = () => ({ statusCode: 200, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } });
  try {
    const ok = res(); await controller.explainGrammar({ user: { id: 1 }, query: { content: "-(으)려고", language: "vi" } }, ok);
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.body.language, "vi");
    assert.match(ok.body.example.translation, /Tôi học/);
    const bad = res(); await controller.explainGrammar({ user: { id: 1 }, query: { content: " " } }, bad);
    assert.equal(bad.statusCode, 400);
  } finally {
    pool.query = original; delete require.cache[controllerPath];
    if (saved) require.cache[openaiTextPath] = saved; else delete require.cache[openaiTextPath];
  }
});
