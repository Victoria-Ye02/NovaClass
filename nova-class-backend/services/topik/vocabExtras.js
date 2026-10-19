// Synonyms, antonyms and one example sentence (Korean + Burmese) for the TOPIK vocabulary words, written by Claude
// in batches (scripts/gen_vocab_extras.js) and saved as a JSON file the frontend reads. This file only builds the
// prompt and checks each answer, so a careless reply is rejected instead of being saved.
const HANGUL = /[가-힣]/;
const BURMESE = /[က-႟]/;

function buildPrompt(words) {
  const list = words.map((w, i) => `${i + 1}. ${w.ko} — ${w.my} (TOPIK level ${w.level})`).join("\n");
  return `You are a TOPIK Korean teacher preparing vocabulary cards for Burmese students.
For EACH word below write:
- "syn": up to 2 common Korean synonyms (유의어), single words rather than phrases. Use [] if there is no good one. Never invent rare words.
- "ant": up to 2 common Korean antonyms (반의어). Use [] if the word has no real opposite (most nouns have none).
- "ko": ONE natural example sentence in Korean that uses the word (any conjugation), suitable for that TOPIK level, about 10-25 syllables.
- "my": a natural Burmese translation of that sentence. Burmese often drops the subject: when the Korean subject is "I", leave the pronoun out instead of writing a gendered one.

Words:
${list}

Return ONLY this JSON object, with one entry per word in the same order:
{"words":[{"ko":"<the word exactly as given>","syn":[],"ant":[],"example":{"ko":"...","my":"..."}}]}`;
}

// The part of a word that must appear in its example sentence: 가입하다 -> 가입, 원인이 되다 -> 원인이, 높다 -> 높
function stemOf(word) {
  const w = word.replace(/\s+/g, "");
  if (w.endsWith("하다") && w.length > 2) return w.slice(0, -2);
  if (w.endsWith("다") && w.length > 1) return w.slice(0, -1);
  return w;
}

const koreanWords = list => (Array.isArray(list) ? list : []).map(x => String(x).trim()).filter(x => /^[가-힣 ]+$/.test(x));

// → { ko, syn, ant, example: { ko, my } } or throws when the entry is not usable
function cleanEntry(entry, word) {
  if (!entry || entry.ko !== word.ko) throw new Error(`entry does not match ${word.ko}`);
  const example = entry.example || {};
  const sentence = String(example.ko || "").trim();
  const burmese = String(example.my || "").trim();
  if (!HANGUL.test(sentence) || sentence.length > 80) throw new Error(`${word.ko}: bad Korean example`);
  // a long stem may change when it is conjugated (부풀리다 -> 부풀렸다), so its first syllables are enough
  const stem = stemOf(word.ko);
  const compact = sentence.replace(/\s+/g, "");
  if (!compact.includes(stem) && !(stem.length >= 3 && compact.includes(stem.slice(0, -1)))) throw new Error(`${word.ko}: the example does not use the word`);
  if (!BURMESE.test(burmese) || HANGUL.test(burmese)) throw new Error(`${word.ko}: the translation is not Burmese`);
  const syn = koreanWords(entry.syn).filter(x => x !== word.ko).slice(0, 2);
  const ant = koreanWords(entry.ant).filter(x => x !== word.ko && !syn.includes(x)).slice(0, 2);
  return { ko: word.ko, syn, ant, example: { ko: sentence, my: burmese } };
}

// words: [{ level, no, ko, my }] -> [{ word, entry }] for the usable ones and [{ word, error }] for the others
async function generateBatch(completeText, words) {
  const completion = await completeText({ maxTokens: 2500, responseFormat: { type: "json_object" }, messages: [{ role: "user", content: buildPrompt(words) }] });
  let parsed;
  try { parsed = JSON.parse(completion.choices[0].message.content); } catch { throw new Error("the reply was not valid JSON"); }
  const list = Array.isArray(parsed.words) ? parsed.words : [];
  return words.map((word, i) => {
    const raw = list.find(e => e && e.ko === word.ko) || list[i];
    try { return { word, entry: cleanEntry(raw, word) }; } catch (error) { return { word, error: error.message }; }
  });
}

module.exports = { buildPrompt, stemOf, cleanEntry, generateBatch };
