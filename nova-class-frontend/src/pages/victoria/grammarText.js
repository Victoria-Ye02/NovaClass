import i18n from "./grammarI18n.json";
import { shortMeaning } from "./coreGrammar";
import { SIMILAR_MY, NUANCE_MY } from "./similarGrammarMy";
import { NUANCE } from "./similarGrammar";

// The text of Core Grammar and Similar Grammar in the language chosen in Settings. Burmese (my) is written in the data files
// (coreGrammar.js, similarGrammarMy.js); Vietnamese (vi) is a translation of the English text in grammarI18n.json
// (scripts/gen_grammar_translations.js). Anything missing falls back to English.
const unit = (id, lang) => i18n[lang]?.units?.[id];

// ── Core Grammar ─────────────────────────────────────────────
export function coreShort(item, lang) {
  if (lang === "vi") return unit(`core:${item.no}`, "vi")?.short ?? shortMeaning(item, "en");
  return shortMeaning(item, lang);
}
export function coreExample(item, index, lang) {
  const ex = item.examples[index];
  if (lang === "my") return ex.my;
  if (lang === "vi") return unit(`core:${item.no}`, "vi")?.examples?.[index] ?? ex.en;
  return ex.en;
}

// ── Similar Grammar ──────────────────────────────────────────
const same = (translated, source) => (translated && translated.length === source.length ? translated : source);

export function similarText(group, lang) {
  if (lang === "my") {
    const m = SIMILAR_MY[group.id];
    return { diff: m.diff, notes: m.notes, why: m.why, sentences: group.items.map(i => i.my) };
  }
  const u = lang === "vi" ? unit(`similar:${group.id}`, "vi") : undefined;
  return {
    diff: u?.diff ?? group.diff,
    notes: same(u?.notes, group.items.map(i => i.note)),
    why: u?.why ?? group.quiz.why,
    sentences: same(u?.sentences, group.items.map(i => i.en)),
  };
}

// the badge label of a nuance: Burmese and Vietnamese have their own, other languages show the Korean label
const NUANCE_VI = {
  general: "Chung", formal: "Trang trọng·Văn viết", spoken: "Văn nói", evidence: "Suy đoán có căn cứ", guess: "Suy đoán",
  negative: "Tiêu cực", degree: "Mức độ", purpose: "Mục đích", contrast: "Đối lập", cond: "Điều kiện·Giả định",
  time: "Thời gian·Thứ tự", strong: "Chắc chắn", regret: "Hối tiếc",
};
export function nuanceLabel(tag, lang) {
  const fallback = NUANCE[tag] || NUANCE.general;
  const key = NUANCE[tag] ? tag : "general";
  if (lang === "my") return NUANCE_MY[key];
  if (lang === "vi") return NUANCE_VI[key];
  return fallback.label;
}
