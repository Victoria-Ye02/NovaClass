import i18n from "./idiomI18n.json";

// The meaning of an idiom / proverb / news metaphor in the language chosen in Settings. Burmese (my) and the Korean
// explanation (ko) are the source text; English and Vietnamese come from idiomI18n.json. Anything missing falls back to
// English, then Burmese.
export function idiomMeaning(entry, lang) {
  if (lang === "my") return entry.my;
  if (lang === "ko") return entry.ko;
  const t = i18n[`${entry.cat}:${entry.n}`];
  return t?.[lang] || t?.en || entry.my;
}

// The text to read aloud: the expression without the notation marks of the notebook ( ) ① ② / · =
export const speakable = text => String(text).replace(/[()①②/·=]/g, " ").replace(/\s+/g, " ").trim();
