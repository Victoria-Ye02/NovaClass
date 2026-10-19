import extras from "./vocabExtra.json";
import i18n from "./vocabI18n.json";

const keyOf = (level, no) => `${level}:${no}`;

// The meaning of a word and the translation of its example in the language chosen in Settings. Burmese is the
// source text; English, Vietnamese and Korean come from vocabI18n.json. Anything missing falls back to English, then Burmese.
export function meaningOf(word, lang) {
  const t = i18n[keyOf(word.level, word.no)];
  if (lang === "my") return word.my;
  return t?.[lang] || t?.en || word.my;
}
export function exampleTranslation(word, lang) {
  const example = extras[keyOf(word.level, word.no)]?.example;
  if (!example) return "";
  if (lang === "my") return example.my;
  if (lang === "ko") return "";                           // a Korean sentence needs no Korean translation
  const t = i18n[keyOf(word.level, word.no)]?.ex;
  return t?.[lang] || t?.en || example.my;
}
