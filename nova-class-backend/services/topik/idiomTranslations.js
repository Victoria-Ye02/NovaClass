// English and Vietnamese meanings of the idioms, proverbs and news metaphors of the 관용 표현 · 속담 노트, written by Claude in
// batches (scripts/gen_idiom_translations.js) and saved as a JSON file the frontend reads, so the notebook follows the
// language chosen in Settings. The source meaning is Burmese plus a Korean explanation. This file builds the prompt and
// checks every answer, so a careless reply is rejected instead of being saved.
const BURMESE = /[က-႟]/;
const VIETNAMESE_LETTER = /[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

function buildPrompt(items) {
  const list = items.map((x, i) => `${i + 1}. ${x.kr} — Korean explanation: ${x.ko} — Burmese meaning: ${x.my}`).join("\n");
  return `You are a TOPIK Vocabulary Engine for a Korean Learning Application, for idioms (관용 표현), proverbs (속담) and metaphors used in news.
Strictly enforce that every meaning is written in the language asked for, and never mix languages.

For EACH numbered item write:
- "en": the meaning in English, one short natural sentence or phrase (at most about 15 words).
- "vi": the same meaning in Vietnamese (nghĩa ngắn gọn bằng tiếng Việt, at most about 15 words).
Keep the Korean expression itself in Korean; if an English or Vietnamese equivalent idiom exists you may add it after a dash, otherwise explain the meaning. The Korean and Burmese lines only tell you what is meant.

Items:
${list}

Return ONLY valid raw JSON (no Markdown, no HTML), one entry per item in the same order:
{"items":[{"kr":"<the expression exactly as given>","en":"","vi":""}]}`;
}

const clean = s => String(s ?? "").trim();

// → { en, vi } or throws when the entry is not usable
function cleanEntry(entry, item) {
  if (!entry || entry.kr !== item.kr) throw new Error(`entry does not match ${item.kr}`);
  const en = clean(entry.en), vi = clean(entry.vi);
  if (!/[a-z]{3}/i.test(en) || BURMESE.test(en)) throw new Error(`${item.kr}: bad English meaning`);
  if (!VIETNAMESE_LETTER.test(vi) || BURMESE.test(vi) || vi.length < 3) throw new Error(`${item.kr}: bad Vietnamese meaning`);
  return { en, vi };
}

// items: [{ key, kr, ko, my }] -> [{ item, entry }] for the usable ones and [{ item, error }] for the others
async function generateBatch(completeText, items) {
  const completion = await completeText({ maxTokens: 2500, responseFormat: { type: "json_object" }, messages: [{ role: "user", content: buildPrompt(items) }] });
  let parsed;
  try { parsed = JSON.parse(completion.choices[0].message.content); } catch { throw new Error("the reply was not valid JSON"); }
  const list = Array.isArray(parsed.items) ? parsed.items : [];
  return items.map((item, i) => {
    const raw = list.find(e => e && e.kr === item.kr) || list[i];
    try { return { item, entry: cleanEntry(raw, item) }; } catch (error) { return { item, error: error.message }; }
  });
}

module.exports = { buildPrompt, cleanEntry, generateBatch };
