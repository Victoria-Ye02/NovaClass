const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPrompt, cleanEntry, generateBatch } = require("../services/topik/vocabTranslations");

const WORD = { level: 3, no: 1, ko: "가입하다", my: "စာရင်းသွင်းသည်", example: { ko: "저는 동호회에 가입했어요.", my: "ကျွန်တော် အသင်းမှာ ဝင်ခဲ့တယ်။" } };
const GOOD = { ko: "가입하다", en: "to join / to sign up", vi: "tham gia / đăng ký", kr: "단체에 들어가 구성원이 되다", exEn: "I joined the club.", exVi: "Tôi đã tham gia câu lạc bộ." };

test("a good entry is turned into the shape the frontend reads", () => {
  assert.deepEqual(cleanEntry(GOOD, WORD), { en: "to join / to sign up", vi: "tham gia / đăng ký", ko: "단체에 들어가 구성원이 되다", ex: { en: "I joined the club.", vi: "Tôi đã tham gia câu lạc bộ." } });
});

test("a word without an example needs no example translation", () => {
  const entry = cleanEntry({ ...GOOD, exEn: "", exVi: "" }, { ...WORD, example: undefined });
  assert.equal(entry.ex, null);
});

test("unusable entries are rejected", () => {
  assert.throws(() => cleanEntry({ ...GOOD, ko: "다른말" }, WORD), /does not match/);
  assert.throws(() => cleanEntry({ ...GOOD, en: "가입" }, WORD), /bad English/);
  assert.throws(() => cleanEntry({ ...GOOD, vi: "စာရင်း" }, WORD), /bad Vietnamese/);
  assert.throws(() => cleanEntry({ ...GOOD, vi: "123" }, WORD), /bad Vietnamese/);
  assert.throws(() => cleanEntry({ ...GOOD, kr: "to join" }, WORD), /bad Korean/);
  assert.throws(() => cleanEntry({ ...GOOD, exVi: "" }, WORD), /bad example/);
  assert.throws(() => cleanEntry(undefined, WORD));
});

test("a batch keeps the good entries and reports the bad ones", async () => {
  const items = [WORD, { level: 3, no: 2, ko: "가능하다", my: "ဖြစ်နိုင်သည်" }];
  const completeText = async ({ messages }) => {
    assert.match(messages[0].content, /1\. 가입하다 — Burmese meaning: စာရင်းသွင်းသည် — example: 저는 동호회에 가입했어요\./);
    assert.match(messages[0].content, /2\. 가능하다 — Burmese meaning: ဖြစ်နိုင်သည်\n/);
    return { choices: [{ message: { content: JSON.stringify({ words: [GOOD, { ko: "가능하다", en: "possible", vi: "", kr: "할 수 있다", exEn: "", exVi: "" }] }) } }] };
  };
  const results = await generateBatch(completeText, items);
  assert.ok(results[0].entry);
  assert.match(results[1].error, /bad Vietnamese/);
});

test("a reply that is not JSON fails the batch, and the prompt asks for the three languages", async () => {
  await assert.rejects(generateBatch(async () => ({ choices: [{ message: { content: "sorry" } }] }), [WORD]), /not valid JSON/);
  const prompt = buildPrompt([WORD]);
  assert.match(prompt, /"en"/); assert.match(prompt, /"vi"/); assert.match(prompt, /"kr"/);
});
