const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPrompt, cleanEntry, generateBatch } = require("../services/topik/idiomTranslations");

const ITEM = { key: "idiom:1", kr: "가닥을 잡다", ko: "문제 해결 방법을 찾아내다.", my: "ပြဿနာဖြေရှင်းနည်း လမ်းစ ရှာတွေ့သည်" };
const GOOD = { kr: "가닥을 잡다", en: "To find a way to solve a problem.", vi: "Tìm ra hướng giải quyết vấn đề." };

test("a good entry is kept", () => {
  assert.deepEqual(cleanEntry(GOOD, ITEM), { en: "To find a way to solve a problem.", vi: "Tìm ra hướng giải quyết vấn đề." });
});

test("unusable entries are rejected", () => {
  assert.throws(() => cleanEntry({ ...GOOD, kr: "다른 표현" }, ITEM), /does not match/);
  assert.throws(() => cleanEntry({ ...GOOD, en: "가닥" }, ITEM), /bad English/);
  assert.throws(() => cleanEntry({ ...GOOD, en: "ပြဿနာ" }, ITEM), /bad English/);
  assert.throws(() => cleanEntry({ ...GOOD, vi: "" }, ITEM), /bad Vietnamese/);
  assert.throws(() => cleanEntry({ ...GOOD, vi: "ပြဿနာ" }, ITEM), /bad Vietnamese/);
  assert.throws(() => cleanEntry({ ...GOOD, vi: "12345" }, ITEM), /bad Vietnamese/);
  assert.throws(() => cleanEntry(undefined, ITEM));
});

test("a batch keeps the good entries and reports the bad ones", async () => {
  const items = [ITEM, { key: "idiom:2", kr: "실마리를 찾다", ko: "찾다", my: "လမ်းစ" }];
  const completeText = async ({ messages }) => {
    assert.match(messages[0].content, /1\. 가닥을 잡다 — Korean explanation: 문제 해결 방법을 찾아내다\. — Burmese meaning: ပြဿနာ/);
    assert.match(messages[0].content, /2\. 실마리를 찾다/);
    return { choices: [{ message: { content: JSON.stringify({ items: [GOOD, { kr: "실마리를 찾다", en: "To find a clue.", vi: "" }] }) } }] };
  };
  const results = await generateBatch(completeText, items);
  assert.ok(results[0].entry);
  assert.match(results[1].error, /bad Vietnamese/);
});

test("a reply that is not JSON fails the batch; the prompt keeps the languages apart and asks for raw JSON", async () => {
  await assert.rejects(generateBatch(async () => ({ choices: [{ message: { content: "sorry" } }] }), [ITEM]), /not valid JSON/);
  const prompt = buildPrompt([ITEM]);
  assert.match(prompt, /never mix languages/);
  assert.match(prompt, /ONLY valid raw JSON/);
  assert.match(prompt, /"vi"/);
});
