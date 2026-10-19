// Vietnamese and Korean versions of the TOPIK Booster text (the solving guide of each question type, the two guide
// cards and the general tip), written by Claude in batches (scripts/gen_booster_translations.js) and saved as a JSON
// file the frontend reads, so the Booster follows the language chosen in Settings. The English text is the source
// (it carries the curated content); the model only translates it. This file builds the prompt and checks every answer,
// so a careless reply (wrong language, a lost Korean phrase, a changed number of tips) is rejected instead of being saved.
const HANGUL_RUN = /[가-힣]{2,}/g;
const HANGUL = /[가-힣]/;
const VIETNAMESE_LETTER = /[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;
const LANGUAGES = { vi: "Vietnamese", ko: "Korean" };

// unit: { id, fields: { name: "text" | ["text", ...] } }
// `subject` (optional) names what is translated when it is not the Booster, e.g. "grammar explanations"
function buildPrompt(units, lang, subject) {
  const target = LANGUAGES[lang];
  const input = units.map(u => ({ id: u.id, fields: u.fields }));
  const objective = subject
    ? `Translate the ${subject} below, written for students of the TOPIK exam, into ${target}.\nStrictly write ALL explanations, notes and translations in the user's selected target language: ${target}.`
    : `Translate the expert solving tips and guidance below for TOPIK exam question types into ${target}.\nStrictly write ALL tips, explanations and instructions in the user's selected target language: ${target}.`;
  return `You are a TOPIK II Exam Strategy & Localization Specialist.

[CORE OBJECTIVE]
${objective}

[RULES]
1. Return ONLY valid raw JSON (no Markdown code blocks, no extra conversational text).
2. Keep original Korean sample phrases, grammar patterns and numbers intact (for example "치료법", "-는 바람에", "Q 13 ~ 15", "~ 10").
3. Translate every string value; keep the same keys, and the same number of items in every list, in the same order.
4. ALL explanations, key points, tips and translations MUST strictly be in ${target}${lang === "ko" ? " (natural, polite Korean for learners)" : ""}. Do not leave English words behind except for abbreviations such as OMR.

[INPUT DATA]
${JSON.stringify(input)}

[EXPECTED JSON OUTPUT STRUCTURE]
{"units":[{"id":"<the same id>","fields":{ ...the same keys, translated... }}]}`;
}

const hangulRuns = value => (JSON.stringify(value).match(HANGUL_RUN) || []);

// → the translated fields, or throws when they are not usable
function cleanUnit(entry, unit, lang) {
  if (!entry || entry.id !== unit.id || typeof entry.fields !== "object" || !entry.fields) throw new Error(`entry does not match ${unit.id}`);
  const out = {};
  for (const [key, source] of Object.entries(unit.fields)) {
    const value = entry.fields[key];
    if (Array.isArray(source)) {
      if (!Array.isArray(value) || value.length !== source.length || !value.every(x => typeof x === "string" && x.trim())) throw new Error(`${unit.id}: "${key}" must be a list of ${source.length} texts`);
      out[key] = value.map(x => x.trim());
    } else {
      if (typeof value !== "string" || !value.trim()) throw new Error(`${unit.id}: "${key}" is missing`);
      out[key] = value.trim();
    }
  }
  const text = JSON.stringify(out);
  if (lang === "vi" && !VIETNAMESE_LETTER.test(text)) throw new Error(`${unit.id}: not written in Vietnamese`);
  if (lang === "ko" && !HANGUL.test(text)) throw new Error(`${unit.id}: not written in Korean`);
  if (lang === "vi") {
    // every Korean phrase of the English text has to survive (the sample phrases are what the student studies)
    const kept = new Set(hangulRuns(out));
    const lost = [...new Set(hangulRuns(unit.fields))].filter(run => !kept.has(run) && !text.includes(run));
    if (lost.length) throw new Error(`${unit.id}: lost the Korean text ${lost.slice(0, 3).join(", ")}`);
  }
  return out;
}

// → [{ unit, fields }] for the usable ones and [{ unit, error }] for the others
async function generateBatch(completeText, units, lang, subject) {
  const completion = await completeText({ maxTokens: 4000, responseFormat: { type: "json_object" }, messages: [{ role: "user", content: buildPrompt(units, lang, subject) }] });
  let parsed;
  try { parsed = JSON.parse(completion.choices[0].message.content); } catch { throw new Error("the reply was not valid JSON"); }
  const list = Array.isArray(parsed.units) ? parsed.units : [];
  return units.map((unit, i) => {
    const raw = list.find(e => e && e.id === unit.id) || list[i];
    try { return { unit, fields: cleanUnit(raw, unit, lang) }; } catch (error) { return { unit, error: error.message }; }
  });
}

module.exports = { LANGUAGES, buildPrompt, cleanUnit, generateBatch };
