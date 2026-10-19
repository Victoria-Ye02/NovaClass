// Is this saved lesson written in the language the student has chosen in Settings?
// A saved lesson keeps the language it was created in, so after the student changes
// Settings it can be in one language while new hints arrive in another. The text is
// judged by its script (Burmese letters, Hangul, Latin) rather than by a stored tag,
// so lessons saved before this check existed are covered too.

export const LANGUAGE_NAMES = { en: "English", my: "မြန်မာ", ko: "한국어", vi: "Tiếng Việt" };

export function lessonMatchesLanguage(lesson, coach, lang) {
  const text = [...(lesson?.steps || []), lesson?.explanation, coach?.hint, coach?.nextStep]
    .filter(Boolean).join(" ");
  // Code is the same in every language, so only count real prose.
  const prose = text.replace(/`[^`]*`/g, " ");
  if (prose.replace(/\s/g, "").length < 20) return true;          // too little to judge
  const burmese = (prose.match(/[က-႟]/g) || []).length;
  const hangul = (prose.match(/[가-힣]/g) || []).length;
  if (lang === "my") return burmese >= 5;
  if (lang === "ko") return hangul >= 5;
  return burmese < 5 && hangul < 5;                                  // en / vi: Latin script
}
