const test = require("node:test");
const assert = require("node:assert/strict");
const gateway = require("../services/ai/openaiText");

function fakeClient(handler) {
  return { chat: { completions: { create: async body => handler(body) } } };
}

test("completeText sends the default OpenAI model and passes through optional settings", async t => {
  let seen;
  gateway.setClientForTests(fakeClient(body => { seen = body; return { choices: [{ message: { content: "hi" } }] }; }));
  t.after(() => gateway.setClientForTests(null));

  await gateway.completeText({ messages: [{ role: "user", content: "x" }], maxTokens: 50, temperature: 0.2, responseFormat: { type: "json_object" } });

  assert.equal(seen.model, gateway.TEXT_MODEL);
  assert.doesNotMatch(seen.model, /gemini|google\//i);
  assert.equal(seen.max_tokens, 50);
  assert.equal(seen.temperature, 0.2);
  assert.deepEqual(seen.response_format, { type: "json_object" });
});

test("streamCompletion yields only the non-empty text deltas", async t => {
  async function* chunks() {
    yield { choices: [{ delta: { content: "Hel" } }] };
    yield { choices: [{ delta: {} }] };
    yield { choices: [{ delta: { content: "lo" } }] };
  }
  let seen;
  gateway.setClientForTests(fakeClient(body => { seen = body; return chunks(); }));
  t.after(() => gateway.setClientForTests(null));

  const out = [];
  for await (const delta of gateway.streamCompletion({ messages: [] })) out.push(delta);

  assert.deepEqual(out, ["Hel", "lo"]);
  assert.equal(seen.stream, true);
});

test("describeImage sends the page as an image_url data URI and returns trimmed text", async t => {
  let seen;
  gateway.setClientForTests(fakeClient(body => { seen = body; return { choices: [{ message: { content: "  슬라이드 텍스트  " } }] }; }));
  t.after(() => gateway.setClientForTests(null));

  const text = await gateway.describeImage({ base64: "AAAA", prompt: "read it", detail: "high" });

  assert.equal(text, "슬라이드 텍스트");
  const parts = seen.messages[0].content;
  assert.equal(parts[0].text, "read it");
  assert.equal(parts[1].image_url.url, "data:image/png;base64,AAAA");
  assert.equal(parts[1].image_url.detail, "high");
});
