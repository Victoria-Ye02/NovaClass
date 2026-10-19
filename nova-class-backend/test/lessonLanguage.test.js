const test = require("node:test");
const assert = require("node:assert/strict");
const { detectRequestedLanguage, resolveLessonLanguage, replyIsInWrongLanguage, LESSON_LANGUAGES } = require("../services/lecture/languageRequest");

test("explicit requests to switch language are recognised in all four languages, typed or spoken", () => {
  const cases = [
    ["Can you explain me in Burmese?", "my"], ["please answer in English", "en"], ["speak Korean from now on", "ko"],
    ["한국어로 설명해줘", "ko"], ["영어로 해주세요", "en"], ["미얀마어로 말해줘", "my"], ["베트남어로", "vi"],
    ["မြန်မာလို ရှင်းပြပါ", "my"], ["အင်္ဂလိပ်လို ပြောပေးပါ", "en"], ["ကိုရီးယားဘာသာနဲ့ ပြောပါ", "ko"],
    ["giải thích bằng tiếng Việt", "vi"], ["trả lời bằng tiếng Anh", "en"],
  ];
  for (const [text, expected] of cases) assert.equal(detectRequestedLanguage(text), expected, text);
});

test("ordinary questions and words that merely contain a language name are NOT a switch", () => {
  for (const text of [
    "what is a primary key in a table?", "I answered in Java", "ကိုရီးယားနဲ့ အင်္ဂလိပ် ကွာခြားချက်", "이 페이지는 뭐에 관한 거야?",
    "Tell me about the Korean alphabet", "", undefined, null,
  ]) assert.equal(detectRequestedLanguage(text), null, String(text));
});

test("when several languages are named, the last one wins", () => {
  assert.equal(detectRequestedLanguage("not English, in Korean"), "ko");
});

test("lesson language: Settings by default, a sticky choice beats Settings, a fresh request beats both", () => {
  assert.deepEqual(resolveLessonLanguage({ settingsLang: "my", message: "What is a key?" }), { lang: "my", switched: false });
  assert.deepEqual(resolveLessonLanguage({ settingsLang: "my", stickyLang: "en", message: "What is a key?" }), { lang: "en", switched: false });
  assert.deepEqual(resolveLessonLanguage({ settingsLang: "my", stickyLang: "en", message: "한국어로 해줘" }), { lang: "ko", switched: true });
});

test("the language the student TYPES in does not change the lesson language", () => {
  const typedKorean = resolveLessonLanguage({ settingsLang: "my", message: "이 페이지는 뭐에 관한 거야? 자세히 설명해 주세요." });
  assert.equal(typedKorean.lang, "my");
  const typedEnglish = resolveLessonLanguage({ settingsLang: "ko", message: "can you tell me what a primary key is please" });
  assert.equal(typedEnglish.lang, "ko");
});

test("messages the UI sends itself (not student speech) are never read as a language request", () => {
  assert.equal(resolveLessonLanguage({ settingsLang: "my", message: "Explain in Korean", studentSpoke: false }).lang, "my");
});

test("unknown or missing language codes fall back to English", () => {
  assert.equal(resolveLessonLanguage({ settingsLang: "xx", message: "" }).lang, "en");
  assert.equal(resolveLessonLanguage({ settingsLang: undefined, stickyLang: "zz", message: "" }).lang, "en");
  assert.deepEqual(Object.keys(LESSON_LANGUAGES), ["en", "ko", "my", "vi"]);
});

test("replyIsInWrongLanguage catches a Korean reply when English/Burmese was needed, and the reverse", () => {
  const korean = "안녕하세요. 오늘은 데이터베이스의 기본 키에 대해 이야기해 볼 거예요. 기본 키는 각 행을 구분해 줘요.";
  const burmese = "မင်္ဂလာပါ။ ဒီနေ့ ဒေတာဘေ့စ်ရဲ့ အဓိကသော့အကြောင်း ပြောကြမယ်နော်။ အဓိကသော့က အတန်းတစ်ခုချင်းစီကို ခွဲခြားပေးတယ်။";
  const english = "Hello. Today we will talk about primary keys. A primary key tells each row apart from the others.";
  assert.equal(replyIsInWrongLanguage(korean, "en"), true);
  assert.equal(replyIsInWrongLanguage(korean, "my"), true);
  assert.equal(replyIsInWrongLanguage(english, "ko"), true);
  assert.equal(replyIsInWrongLanguage(english, "my"), true);
  assert.equal(replyIsInWrongLanguage(burmese, "en"), true);
  assert.equal(replyIsInWrongLanguage(korean, "ko"), false);
  assert.equal(replyIsInWrongLanguage(burmese, "my"), false);
  assert.equal(replyIsInWrongLanguage(english, "en"), false);
  assert.equal(replyIsInWrongLanguage(english, "vi"), false, "Latin script is fine for Vietnamese");
});

test("short replies are never flagged (too little text to judge)", () => {
  assert.equal(replyIsInWrongLanguage("Good!", "ko"), false);
  assert.equal(replyIsInWrongLanguage("", "my"), false);
});
