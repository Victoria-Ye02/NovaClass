const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPrompt, stemOf, cleanEntry, generateBatch } = require("../services/topik/vocabExtras");

const WORD = { level: 3, no: 1, ko: "가입하다", my: "စာရင်းသွင်းသည်" };
const GOOD = { ko: "가입하다", syn: ["등록하다", "가입하다", "x"], ant: ["탈퇴하다"], example: { ko: "저는 동호회에 가입했어요.", my: "ကျွန်တော် အသင်းမှာ ဝင်ခဲ့တယ်။" } };

test("the stem to look for in the example", () => {
  assert.equal(stemOf("가입하다"), "가입");
  assert.equal(stemOf("높다"), "높");
  assert.equal(stemOf("원인이 되다"), "원인이되");
  assert.equal(stemOf("건강"), "건강");
});

test("a good entry is kept, its synonyms cleaned (Korean only, not the word itself)", () => {
  const entry = cleanEntry(GOOD, WORD);
  assert.deepEqual(entry.syn, ["등록하다"]);
  assert.deepEqual(entry.ant, ["탈퇴하다"]);
  assert.equal(entry.example.ko, "저는 동호회에 가입했어요.");
});

test("unusable entries are rejected", () => {
  assert.throws(() => cleanEntry({ ...GOOD, ko: "다른말" }, WORD), /does not match/);
  assert.throws(() => cleanEntry({ ...GOOD, example: { ko: "저는 학교에 갔어요.", my: "ကျောင်းသွားတယ်။" } }, WORD), /does not use the word/);
  assert.throws(() => cleanEntry({ ...GOOD, example: { ko: "동호회에 가입했어요.", my: "I joined." } }, WORD), /not Burmese/);
  assert.throws(() => cleanEntry({ ...GOOD, example: { ko: "no korean", my: "ကျောင်း" } }, WORD), /bad Korean/);
  assert.throws(() => cleanEntry(undefined, WORD));
});

test("a batch keeps the good entries and reports the bad ones", async () => {
  const words = [WORD, { level: 3, no: 2, ko: "가능하다", my: "ဖြစ်နိုင်သည်" }];
  const completeText = async ({ messages }) => {
    assert.match(messages[0].content, /1\. 가입하다/);
    assert.match(messages[0].content, /2\. 가능하다/);
    return { choices: [{ message: { content: JSON.stringify({ words: [GOOD, { ko: "가능하다", syn: [], ant: [], example: { ko: "오늘 만나는 건 어려워요.", my: "ဒီနေ့ တွေ့ဖို့ မဖြစ်နိုင်ဘူး။" } }] }) } }] };
  };
  const results = await generateBatch(completeText, words);
  assert.ok(results[0].entry);
  assert.match(results[1].error, /does not use the word/);          // 불가능 contains 가능, but the example has to contain the word's stem
});

test("a reply that is not JSON fails the batch", async () => {
  await assert.rejects(generateBatch(async () => ({ choices: [{ message: { content: "sorry" } }] }), [WORD]), /not valid JSON/);
});

test("the prompt lists every word with its level and asks for JSON", () => {
  const prompt = buildPrompt([WORD]);
  assert.match(prompt, /1\. 가입하다 — စာရင်းသွင်းသည် \(TOPIK level 3\)/);
  assert.match(prompt, /"words"/);
});
