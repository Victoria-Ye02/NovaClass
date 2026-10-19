// Which language should the professor teach in?
//   1. By default, the language chosen in Settings.
//   2. If the student asks to switch ("explain in Burmese", "영어로 설명해줘",
//      "မြန်မာလို ပြောပါ", "bằng tiếng Việt"), typed or spoken, use that one — and
//      keep it (the client sends it back as `lessonLang` on later turns).
// What language the student happens to TYPE their question in no longer
// matters; only an explicit request changes the lesson language.

const LESSON_LANGUAGES = {
  en: "English",
  ko: "Korean (한국어)",
  my: "Burmese (Myanmar language)",
  vi: "Vietnamese",
};

const isLessonLanguage = code => Object.prototype.hasOwnProperty.call(LESSON_LANGUAGES, code);

const ENGLISH_NAMES = { english: "en", korean: "ko", burmese: "my", myanmar: "my", vietnamese: "vi" };
const KOREAN_NAMES = { "영어": "en", "한국어": "ko", "한글": "ko", "미얀마어": "my", "버마어": "my", "베트남어": "vi" };
const BURMESE_NAMES = { "အင်္ဂလိပ်": "en", "ကိုရီးယား": "ko", "မြန်မာ": "my", "ဗီယက်နမ်": "vi" };
const VIETNAMESE_NAMES = { "việt": "vi", "anh": "en", "hàn": "ko", "miến": "my", "myanmar": "my" };

const PATTERNS = [
  // "in Burmese", "into English", "to Korean", "using Vietnamese"
  { re: /\b(?:in|into|to|using)\s+(?:the\s+)?(english|korean|burmese|myanmar|vietnamese)\b/gi, map: ENGLISH_NAMES },
  // "speak / answer / explain / switch … Burmese"
  { re: /\b(?:speak|talk|answer|reply|respond|explain|teach|switch|change|say)\b[^.?!\n]{0,40}?\b(english|korean|burmese|myanmar|vietnamese)\b/gi, map: ENGLISH_NAMES },
  // "영어로", "한국어로 설명해줘", "미얀마어로"
  { re: /(한국어|한글|영어|미얀마어|버마어|베트남어)\s*(?:로|으로)/g, map: KOREAN_NAMES },
  // "မြန်မာလို", "အင်္ဂလိပ်ဘာသာနဲ့", "ကိုရီးယားဘာသာစကားဖြင့်" (a bare "…နဲ့" means "and", so it is not enough)
  { re: /(မြန်မာ|အင်္ဂလိပ်|ကိုရီးယား|ဗီယက်နမ်)\s*(?:ဘာသာ(?:စကား)?\s*(?:နဲ့|ဖြင့်|ပြင်)|လို)/g, map: BURMESE_NAMES },
  // "bằng tiếng Việt", "nói tiếng Anh", "trả lời bằng tiếng Hàn"
  { re: /(?:bằng|nói|trả lời|giải thích)\s+(?:bằng\s+)?tiếng\s+(việt|anh|hàn|miến|myanmar)/gi, map: VIETNAMESE_NAMES },
];

// The language the student explicitly asked for in `text`, or null. If they
// name several, the one mentioned last wins ("not English, in Korean").
function detectRequestedLanguage(text) {
  const value = String(text || "");
  let best = null;
  for (const { re, map } of PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(value))) {
      const code = map[match[1].toLowerCase()] || map[match[1]];
      if (code && (!best || match.index >= best.index)) best = { code, index: match.index };
    }
  }
  return best ? best.code : null;
}

// Settings language is the default; a language the student asked for earlier
// (sent back by the client) beats it; a request in this very message beats both.
function resolveLessonLanguage({ settingsLang, stickyLang, message, studentSpoke = true }) {
  const settings = isLessonLanguage(settingsLang) ? settingsLang : "en";
  const requested = studentSpoke ? detectRequestedLanguage(message) : null;
  if (requested) return { lang: requested, switched: requested !== (isLessonLanguage(stickyLang) ? stickyLang : settings) };
  if (isLessonLanguage(stickyLang)) return { lang: stickyLang, switched: false };
  return { lang: settings, switched: false };
}

// Does `reply` look like it is NOT in `lang`? (Models drift, and a one-line
// instruction is not a guarantee, so the reply is checked in code.)
function replyIsInWrongLanguage(reply, lang) {
  const text = String(reply || "");
  if (text.replace(/\s/g, "").length < 20) return false;
  const count = re => (text.match(re) || []).length;
  const hangul = count(/[가-힣]/g);
  const burmese = count(/[က-႟]/g);
  if (lang === "ko") return hangul < 5;
  if (lang === "my") return burmese < 10;
  return hangul > 10 || burmese > 10;   // en / vi: no Korean or Burmese script
}

// How each language is actually SPOKEN in a classroom. The text goes straight to
// a text-to-speech voice, so written-style prose is what makes it sound like a
// document being read out — the register matters as much as the content.
function languageStyle(code) {
  if (code === "ko") {
    return "Use warm, natural 해요체 (-예요/-해요/-볼까요), the way an approachable professor really talks in class — not stiff 합쇼체 (-습니다).";
  }
  if (code === "my") {
    return [
      "Write in everyday SPOKEN Burmese (စကားပြော), the way a friendly teacher talks to students in a classroom — NOT formal written/literary Burmese.",
      "Use colloquial endings and particles such as တယ်၊ ပါတယ်၊ ရဲ့၊ လို့၊ ပါမယ်၊ နော်၊ လေ၊ ဟုတ်ပြီလား၊ ကြည့်ရအောင် — and avoid literary forms such as သည်၊ ၏၊ ၍၊ သော၊ ၌၊ ထို့ကြောင့်.",
      "Keep each sentence short and end it with ။ so the voice pauses naturally.",
      "A Burmese voice reads this aloud and cannot pronounce Latin or Korean letters, so write EVERY word in Burmese script: transliterate technical terms and acronyms the way Burmese speakers actually say them (e.g. ဒေတာဘေ့စ်, ဂျာဗား, အက်စ်ကျူအယ်လ်). Never put English or Korean characters in the narration.",
      "Say 'the next slide' as နောက်ထပ် စလိုက်ဒ်ကို / နောက်တစ်ခု — never နောက်ဆုံး, which means 'the last one'.",
    ].join(" ");
  }
  if (code === "vi") {
    return "Use a natural, friendly spoken Vietnamese teacher's voice (e.g. 'mình', 'các bạn', 'nhé', 'nha'), not formal written prose.";
  }
  return "Use contractions and everyday phrasing (it's, we'll, here's), like a real person talking — not written prose.";
}

module.exports = { languageStyle, LESSON_LANGUAGES, isLessonLanguage, detectRequestedLanguage, resolveLessonLanguage, replyIsInWrongLanguage };
