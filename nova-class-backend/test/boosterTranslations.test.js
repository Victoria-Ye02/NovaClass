const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPrompt, cleanUnit, generateBatch } = require("../services/topik/boosterTranslations");

const UNIT = { id: "r-1-2", fields: { sub: "Choose the grammar that fits the blank", steps: ["Read the choices.", "Check -는 바람에."], tips: ["Do not spend more than 30 seconds."] } };
const VI = { sub: "Chọn ngữ pháp phù hợp với chỗ trống", steps: ["Đọc các lựa chọn.", "Kiểm tra -는 바람에."], tips: ["Không dành quá 30 giây."] };
const KO = { sub: "빈칸에 알맞은 문법을 고르십시오", steps: ["선택지를 읽으세요.", "-는 바람에를 확인하세요."], tips: ["30초를 넘기지 마세요."] };

test("a good Vietnamese and a good Korean translation are kept, trimmed", () => {
  assert.deepEqual(cleanUnit({ id: "r-1-2", fields: { ...VI, sub: "  Chọn ngữ pháp phù hợp với chỗ trống " } }, UNIT, "vi"), VI);
  assert.deepEqual(cleanUnit({ id: "r-1-2", fields: KO }, UNIT, "ko"), KO);
});

test("unusable translations are rejected", () => {
  const bad = (fields, lang, pattern, id = "r-1-2") => assert.throws(() => cleanUnit({ id, fields }, UNIT, lang), pattern);
  bad(VI, "vi", /does not match/, "other");
  bad({ ...VI, steps: ["Đọc các lựa chọn."] }, "vi", /list of 2/);                    // a lost step
  bad({ ...VI, tips: [] }, "vi", /list of 1/);
  bad({ ...VI, sub: "" }, "vi", /"sub" is missing/);
  bad({ sub: "Choose the grammar", steps: ["Read.", "Check -는 바람에."], tips: ["No more than 30 s."] }, "vi", /not written in Vietnamese/);
  bad({ ...VI, steps: ["Đọc các lựa chọn.", "Kiểm tra ngữ pháp."] }, "vi", /lost the Korean text/);   // -는 바람에 vanished
  bad({ sub: "Choose", steps: ["a", "b"], tips: ["c"] }, "ko", /not written in Korean/);
  assert.throws(() => cleanUnit(undefined, UNIT, "vi"));
});

test("a batch keeps the good units and reports the bad ones", async () => {
  const units = [UNIT, { id: "general", fields: { text: "Read the question first." } }];
  const completeText = async ({ messages }) => {
    assert.match(messages[0].content, /Target Language|into Vietnamese/);
    return { choices: [{ message: { content: JSON.stringify({ units: [{ id: "r-1-2", fields: VI }, { id: "general", fields: { text: "" } }] }) } }] };
  };
  const results = await generateBatch(completeText, units, "vi");
  assert.deepEqual(results[0].fields, VI);
  assert.match(results[1].error, /missing/);
});

test("a reply that is not JSON fails the batch, and the prompt keeps the Korean phrases and asks for raw JSON", async () => {
  await assert.rejects(generateBatch(async () => ({ choices: [{ message: { content: "sorry" } }] }), [UNIT], "ko"), /not valid JSON/);
  const prompt = buildPrompt([UNIT], "vi");
  assert.match(prompt, /strictly write ALL tips/i);
  assert.match(prompt, /ONLY valid raw JSON/);
  assert.match(prompt, /Keep original Korean sample phrases/);
  assert.match(prompt, /-는 바람에/);
  assert.match(buildPrompt([UNIT], "ko"), /polite Korean/);
});
