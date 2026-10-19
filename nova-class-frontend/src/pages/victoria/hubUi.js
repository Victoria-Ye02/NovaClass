// The labels of the Grammar & Meaning page (the three tabs, the dropdown, the speed toggle, the similar-grammar cards and the
// vocabulary list and flashcards) in the language chosen in Settings. The notebook of idioms and the Booster keep their
// own labels. Any other language shows English.
const EN = {
  title: "Grammar & Meaning", tabGrammar: "Grammar", tabMeaning: "Meaning", tabIdioms: "Idioms & Proverbs",
  coreOption: "Core Grammar (일반 문법)", similarOption: "유사 문법 (Similar Grammar)",
  speed: "Speed", normal: "Normal", slow: "Slow", conjugation: "Conjugation",
  allPairs: n => `All pairs (${n})`, confusing: n => `★ My Confusing Grammars (${n})`,
  confusionEmpty: "No saved pairs yet. Tap ☆ on a card to add it here.",
  trap: "⚡ Spot the trap · 3-second quiz", correct: "Correct! ", wrong: a => `Not quite — the answer is "${a}". `, again: "Try again",
  pillTitle: "Tap to try the next grammar", swap: "Swap the grammar",
  // vocabulary
  listView: "📋 List View", flashcardMode: "🗂️ Flashcard Mode", savedWords: n => `⭐ Saved Words (${n})`, level: n => `Level ${n}`,
  search: "Search a word or its meaning", noWords: "No words found.", noSaved: "No saved words yet. Tap ☆ on a word to save it here.", noSavedMatch: "No saved words match your search.",
  noExample: "No example sentence yet.", allCards: n => `All cards (${n})`, reviewLater: n => `🔴 Review later (${n})`, gotItTally: n => `🟢 ${n} got it`,
  words: "words", tapFlip: "Tap / Click to flip", gotIt: "🟢 Got It!", reviewLaterBtn: "🔴 Review Later", gotItMark: "🟢 Got it", reviewLaterMark: "🔴 Review later",
  prev: "‹ Previous", next: "Next ›", bookmark: "☆ Bookmark", saved: "★ Saved", playAudio: "Play Audio",
  nothingToReview: "Nothing to review. Mark cards with “Review Later” while you study.", readingHint: "Reading hint (each syllable spelled; sound changes are not applied)",
};

const MY = {
  title: "သဒ္ဒါနှင့် အဓိပ္ပာယ်", tabGrammar: "သဒ္ဒါ", tabMeaning: "အဓိပ္ပာယ်", tabIdioms: "စကားစု & စကားပုံ",
  coreOption: "အခြေခံသဒ္ဒါ (일반 문법)", similarOption: "ဆင်တူသဒ္ဒါ (유사 문법)",
  speed: "အမြန်နှုန်း", normal: "ပုံမှန်", slow: "နှေး", conjugation: "ပေါင်းစပ်ပုံ",
  allPairs: n => `အတွဲအားလုံး (${n})`, confusing: n => `★ ရှုပ်တတ်သော သဒ္ဒါများ (${n})`,
  confusionEmpty: "သိမ်းထားသော အတွဲ မရှိသေးပါ။ ကတ်ပေါ်က ☆ ကိုနှိပ်ပြီး ဒီမှာ ထည့်ပါ။",
  trap: "⚡ ထောင်ချောက်ရှာပါ · ၃ စက္ကန့် quiz", correct: "မှန်ပါတယ်! ", wrong: a => `မှားပါတယ် — အဖြေမှန်က "${a}" ဖြစ်ပါတယ်။ `, again: "ပြန်စမ်းမယ်",
  pillTitle: "နှိပ်ပြီး နောက် သဒ္ဒါကို စမ်းကြည့်ပါ", swap: "သဒ္ဒါ ပြောင်းကြည့်ရန်",
  listView: "📋 စာရင်း", flashcardMode: "🗂️ Flashcard", savedWords: n => `⭐ သိမ်းထားသော စာလုံးများ (${n})`, level: n => `အဆင့် ${n}`,
  search: "စာလုံး သို့မဟုတ် အဓိပ္ပာယ်ကို ရှာပါ", noWords: "စာလုံး မတွေ့ပါ။", noSaved: "သိမ်းထားသော စာလုံး မရှိသေးပါ။ စာလုံးပေါ်က ☆ ကိုနှိပ်ပြီး သိမ်းပါ။", noSavedMatch: "ရှာထားတာနဲ့ ကိုက်တဲ့ သိမ်းထားသော စာလုံး မရှိပါ။",
  noExample: "ဥပမာဝါကျ မရှိသေးပါ။", allCards: n => `ကတ်အားလုံး (${n})`, reviewLater: n => `🔴 နောက်မှ ပြန်ကြည့်ရန် (${n})`, gotItTally: n => `🟢 ${n} ခု မှတ်မိ`,
  words: "လုံး", tapFlip: "နှိပ်ပြီး လှည့်ကြည့်ပါ", gotIt: "🟢 မှတ်မိပြီ!", reviewLaterBtn: "🔴 နောက်မှ ပြန်ကြည့်မယ်", gotItMark: "🟢 မှတ်မိပြီ", reviewLaterMark: "🔴 နောက်မှ ပြန်ကြည့်ရန်",
  prev: "‹ ရှေ့", next: "နောက် ›", bookmark: "☆ သိမ်းမယ်", saved: "★ သိမ်းပြီး", playAudio: "အသံ ဖွင့်ပါ",
  nothingToReview: "ပြန်ကြည့်စရာ မရှိပါ။ လေ့လာနေစဉ် “နောက်မှ ပြန်ကြည့်မယ်” နဲ့ ကတ်တွေကို အမှတ်ခြစ်ပါ။", readingHint: "ဖတ်ပုံ အရိပ်အမြွက် (ဗျည်းအက္ခရာ တစ်လုံးချင်း စာလုံးပေါင်း၊ အသံပြောင်းလဲမှု မပါ)",
};

const VI = {
  title: "Ngữ pháp & Nghĩa", tabGrammar: "Ngữ pháp", tabMeaning: "Nghĩa", tabIdioms: "Thành ngữ & Tục ngữ",
  coreOption: "Ngữ pháp cơ bản (일반 문법)", similarOption: "Ngữ pháp tương tự (유사 문법)",
  speed: "Tốc độ", normal: "Bình thường", slow: "Chậm", conjugation: "Cách chia",
  allPairs: n => `Tất cả cặp (${n})`, confusing: n => `★ Ngữ pháp dễ nhầm của tôi (${n})`,
  confusionEmpty: "Chưa lưu cặp nào. Nhấn ☆ trên thẻ để thêm vào đây.",
  trap: "⚡ Tìm cái bẫy · quiz 3 giây", correct: "Chính xác! ", wrong: a => `Chưa đúng — đáp án là "${a}". `, again: "Thử lại",
  pillTitle: "Nhấn để thử ngữ pháp tiếp theo", swap: "Đổi ngữ pháp",
  listView: "📋 Danh sách", flashcardMode: "🗂️ Thẻ ghi nhớ", savedWords: n => `⭐ Từ đã lưu (${n})`, level: n => `Cấp ${n}`,
  search: "Tìm một từ hoặc nghĩa của nó", noWords: "Không tìm thấy từ nào.", noSaved: "Chưa lưu từ nào. Nhấn ☆ trên một từ để lưu vào đây.", noSavedMatch: "Không có từ đã lưu nào khớp với tìm kiếm.",
  noExample: "Chưa có câu ví dụ.", allCards: n => `Tất cả thẻ (${n})`, reviewLater: n => `🔴 Ôn lại sau (${n})`, gotItTally: n => `🟢 ${n} đã nhớ`,
  words: "từ", tapFlip: "Nhấn để lật thẻ", gotIt: "🟢 Đã nhớ!", reviewLaterBtn: "🔴 Ôn lại sau", gotItMark: "🟢 Đã nhớ", reviewLaterMark: "🔴 Ôn lại sau",
  prev: "‹ Trước", next: "Sau ›", bookmark: "☆ Lưu", saved: "★ Đã lưu", playAudio: "Phát âm thanh",
  nothingToReview: "Không có gì để ôn. Hãy đánh dấu “Ôn lại sau” khi học.", readingHint: "Gợi ý cách đọc (đánh vần từng âm tiết; không áp dụng biến âm)",
};

const KO = {
  title: "문법 & 의미", tabGrammar: "문법", tabMeaning: "의미", tabIdioms: "관용 표현 & 속담",
  coreOption: "일반 문법 (Core Grammar)", similarOption: "유사 문법 (Similar Grammar)",
  speed: "속도", normal: "보통", slow: "느리게", conjugation: "활용",
  allPairs: n => `전체 쌍 (${n})`, confusing: n => `★ 헷갈리는 문법 (${n})`,
  confusionEmpty: "저장한 쌍이 없습니다. 카드의 ☆를 눌러 추가하세요.",
  trap: "⚡ 함정 찾기 · 3초 퀴즈", correct: "정답입니다! ", wrong: a => `아쉬워요 — 정답은 "${a}"입니다. `, again: "다시 풀기",
  pillTitle: "눌러서 다음 문법을 써 보세요", swap: "문법 바꾸기",
  listView: "📋 목록", flashcardMode: "🗂️ 플래시카드", savedWords: n => `⭐ 저장한 단어 (${n})`, level: n => `${n}급`,
  search: "단어나 뜻으로 검색", noWords: "검색 결과가 없습니다.", noSaved: "저장한 단어가 없습니다. 단어의 ☆를 눌러 저장하세요.", noSavedMatch: "검색과 일치하는 저장 단어가 없습니다.",
  noExample: "예문이 아직 없습니다.", allCards: n => `전체 카드 (${n})`, reviewLater: n => `🔴 나중에 복습 (${n})`, gotItTally: n => `🟢 ${n}개 암기`,
  words: "단어", tapFlip: "눌러서 뒤집기", gotIt: "🟢 알았어요!", reviewLaterBtn: "🔴 나중에 복습", gotItMark: "🟢 암기", reviewLaterMark: "🔴 나중에 복습",
  prev: "‹ 이전", next: "다음 ›", bookmark: "☆ 저장", saved: "★ 저장됨", playAudio: "소리 듣기",
  nothingToReview: "복습할 카드가 없습니다. 공부하면서 “나중에 복습”으로 표시하세요.", readingHint: "읽기 힌트 (음절별 표기, 발음 변화는 적용하지 않음)",
};

const DICT = { en: EN, my: MY, vi: VI, ko: KO };
export const hubUi = lang => DICT[lang] || EN;
