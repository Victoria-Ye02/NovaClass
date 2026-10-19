// English, Vietnamese and Korean meanings of the TOPIK vocabulary words, and English / Vietnamese translations of their
// example sentences, written by Claude in batches (scripts/gen_vocab_translations.js) and saved as a JSON file the
// frontend reads, so the vocabulary list can follow the language chosen in Settings. The source meaning is Burmese.
// This file builds the prompt and checks every answer, so a careless reply is rejected instead of being saved.
const HANGUL = /[가-힣]/;
const BURMESE = /[က-႟]/;
const VIETNAMESE_LETTER = /[a-zàáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

function buildPrompt(items) {
  const list = items.map((w, i) => `${i + 1}. ${w.ko} — Burmese meaning: ${w.my}${w.example ? ` — example: ${w.example.ko}` : ""}`).join("\n");
  return `You are a TOPIK Korean teacher making vocabulary cards for students who use English, Vietnamese or Korean.
For EACH numbered item write:
- "en": the short English meaning (1-4 words, like a dictionary gloss; use " / " between two senses).
- "vi": the short Vietnamese meaning (nghĩa ngắn gọn, 1-4 từ).
- "kr": a short Korean explanation of the word (뜻풀이, a few words, not using the word itself).
- "exEn" and "exVi": natural English and Vietnamese translations of the example sentence (leave both "" when the item has no example).
The Burmese meaning only tells you which sense of the word is meant.

Items:
${list}

Return ONLY this JSON object, one entry per item in the same order:
{"words":[{"ko":"<the word exactly as given>","en":"","vi":"","kr":"","exEn":"","exVi":""}]}`;
}

const clean = s => String(s ?? "").trim();

// → { en, vi, ko, ex: { en, vi } | null } or throws when the entry is not usable
function cleanEntry(entry, word) {
  if (!entry || entry.ko !== word.ko) throw new Error(`entry does not match ${word.ko}`);
  const en = clean(entry.en), vi = clean(entry.vi), kr = clean(entry.kr);
  const bad = text => !text || HANGUL.test(text) || BURMESE.test(text);
  if (bad(en) || !/[a-z]/i.test(en)) throw new Error(`${word.ko}: bad English meaning`);
  if (bad(vi) || !VIETNAMESE_LETTER.test(vi)) throw new Error(`${word.ko}: bad Vietnamese meaning`);
  if (!kr || !HANGUL.test(kr) || BURMESE.test(kr)) throw new Error(`${word.ko}: bad Korean explanation`);
  let ex = null;
  if (word.example) {
    const exEn = clean(entry.exEn), exVi = clean(entry.exVi);
    if (bad(exEn) || bad(exVi) || !VIETNAMESE_LETTER.test(exVi)) throw new Error(`${word.ko}: bad example translation`);
    ex = { en: exEn, vi: exVi };
  }
  return { en, vi, ko: kr, ex };
}

// items: [{ level, no, ko, my, example? }] -> [{ word, entry }] for the usable ones and [{ word, error }] for the others
async function generateBatch(completeText, items) {
  const completion = await completeText({ maxTokens: 3000, responseFormat: { type: "json_object" }, messages: [{ role: "user", content: buildPrompt(items) }] });
  let parsed;
  try { parsed = JSON.parse(completion.choices[0].message.content); } catch { throw new Error("the reply was not valid JSON"); }
  const list = Array.isArray(parsed.words) ? parsed.words : [];
  return items.map((word, i) => {
    const raw = list.find(e => e && e.ko === word.ko) || list[i];
    try { return { word, entry: cleanEntry(raw, word) }; } catch (error) { return { word, error: error.message }; }
  });
}

module.exports = { buildPrompt, cleanEntry, generateBatch };
